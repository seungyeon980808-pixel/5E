const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { isDeepStrictEqual } = require("node:util");
const { parseStrictJson } = require("./strict-json.cjs");

const AUDIT_TIMEOUT_MS = 2 * 60 * 1000;
const MAX_REPORT_BYTES = 4 * 1024 * 1024;
const SOURCE_SCHEMA = "5e-package-source-audit-v1";
const ARTIFACT_SCHEMA = "5e-package-artifact-audit@1";
const INSTALLER = "5E-Setup-1.6.0-rc.1-windows-x64.exe";

function normalized(file) {
  const resolved = path.resolve(file);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(left, right) {
  return normalized(left) === normalized(right);
}

function inside(root, file) {
  const relative = path.relative(root, file);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function statIdentity(file) {
  const stat = fs.lstatSync(file, { bigint: true });
  const realpath = fs.realpathSync.native(file);
  if (stat.isSymbolicLink() || !samePath(file, realpath)) throw new Error("AUDIT_SNAPSHOT_REPARSE_POINT");
  if (stat.nlink !== 1n) throw new Error("AUDIT_SNAPSHOT_LINK_COUNT_INVALID");
  return Object.freeze({
    file: normalized(file), realpath: normalized(realpath), dev: String(stat.dev), ino: String(stat.ino),
    size: String(stat.size), mtimeNs: String(stat.mtimeNs), ctimeNs: String(stat.ctimeNs),
    birthtimeNs: String(stat.birthtimeNs), nlink: String(stat.nlink),
  });
}

function capture(root, files, code) {
  return Object.freeze(files.map((file) => {
    const absolute = path.resolve(file);
    if (!inside(root, absolute)) throw new Error(`${code}_PATH_INVALID`);
    try { return statIdentity(absolute); }
    catch (error) {
      if (error.code === "ENOENT") throw new Error(`${code}_MISSING`);
      throw error;
    }
  }));
}

function revalidate(snapshots, code) {
  for (const snapshot of snapshots) {
    let current;
    try { current = statIdentity(snapshot.file); }
    catch { throw new Error(`${code}_CHANGED`); }
    if (!isDeepStrictEqual(current, snapshot)) throw new Error(`${code}_CHANGED`);
  }
}

function defaultRunCommand(file, args, options) {
  return spawnSync(file, args, {
    ...options, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: false,
    windowsHide: true, timeout: AUDIT_TIMEOUT_MS, killSignal: "SIGTERM", maxBuffer: MAX_REPORT_BYTES,
  });
}

function parseReport(result, code) {
  if (result?.error?.code === "ETIMEDOUT") throw new Error(`${code}_TIMEOUT`);
  if (result?.error?.code === "ENOBUFS") throw new Error(`${code}_REPORT_TOO_LARGE`);
  if (result?.error) throw new Error(`${code}_EXEC_FAILED`);
  if (result?.signal) throw new Error(`${code}_SIGNALLED`);
  if (result?.status !== 0) throw new Error(`${code}_FAILED`);
  const text = typeof result.stdout === "string" ? result.stdout : Buffer.from(result.stdout || "").toString("utf8");
  try {
    const parsed = parseStrictJson(text.trim());
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("invalid");
    return parsed;
  } catch { throw new Error(`${code}_REPORT_INVALID`); }
}

function invoke(runCommand, command) {
  try { return runCommand(command.file, command.args, command.options); }
  catch (error) { return { error }; }
}

function validateSource(report, expectedRuntime) {
  if (report.schema !== SOURCE_SCHEMA || !Array.isArray(report.violations) || !Array.isArray(report.requiredRuntime)) {
    throw new Error("SOURCE_AUDIT_REPORT_INVALID");
  }
  if (report.violations.length !== 0) throw new Error("SOURCE_AUDIT_POLICY_REJECTED");
  const paths = report.requiredRuntime.map((item) => item?.path);
  if (paths.length !== expectedRuntime.length || new Set(paths).size !== paths.length
    || expectedRuntime.some((file) => !paths.includes(file))
    || report.requiredRuntime.some((item) => item?.present !== true || item?.included !== true)) {
    throw new Error("SOURCE_AUDIT_RUNTIME_INVALID");
  }
  return report;
}

function validateArtifact(report, expected) {
  if (report.schema !== ARTIFACT_SCHEMA || !Array.isArray(report.violations)
    || !samePath(report.artifactPath || "", expected.artifactPath) || report.kind !== "staged") {
    throw new Error("ARTIFACT_AUDIT_REPORT_INVALID");
  }
  if (report.violations.length !== 0) throw new Error("ARTIFACT_AUDIT_POLICY_REJECTED");
  const identity = report.identity;
  if (identity?.matches !== true || identity.web?.version !== expected.version || identity.desktop?.version !== expected.version
    || identity.web?.commit !== expected.commit || identity.desktop?.commit !== expected.commit) {
    throw new Error("ARTIFACT_AUDIT_IDENTITY_INVALID");
  }
  return report;
}

function createAuditSession({ root, output, commit, version, runCommand = defaultRunCommand }) {
  const scripts = path.join(root, "scripts", "stabilization");
  const sourcePolicyPath = path.join(scripts, "package-assets-policy.json");
  let sourcePolicy;
  try { sourcePolicy = parseStrictJson(fs.readFileSync(sourcePolicyPath, "utf8")); }
  catch { throw new Error("SOURCE_AUDIT_POLICY_INVALID"); }
  if (!Array.isArray(sourcePolicy.requiredRuntime) || sourcePolicy.requiredRuntime.length === 0) {
    throw new Error("SOURCE_AUDIT_POLICY_INVALID");
  }
  const sourceFiles = [
    path.join(root, "package.json"), path.join(scripts, "package-assets-audit.cjs"), sourcePolicyPath,
    path.join(scripts, "package-artifact-audit.cjs"), path.join(scripts, "package-artifact-reader.cjs"),
    path.join(scripts, "package-artifact-policy.json"),
    ...sourcePolicy.requiredRuntime.map((relative) => path.join(root, ...relative.split("/"))),
  ];
  const sourceSnapshots = capture(root, sourceFiles, "SOURCE_SNAPSHOT");
  let sourceReport;
  return Object.freeze({
    auditSource() {
      const script = path.join(scripts, "package-assets-audit.cjs");
      sourceReport = validateSource(parseReport(invoke(runCommand, {
        file: process.execPath, args: [script, "--strict", "--root", root], options: { cwd: root },
      }), "SOURCE_AUDIT"), sourcePolicy.requiredRuntime);
      revalidate(sourceSnapshots, "SOURCE_SNAPSHOT");
      return sourceReport;
    },
    auditArtifact(outputs) {
      if (!sourceReport) throw new Error("SOURCE_AUDIT_REQUIRED");
      const unpacked = path.join(output, "win-unpacked");
      const expected = {
        installer: path.join(output, INSTALLER), unpackedExecutable: path.join(unpacked, "5E.exe"),
        asar: path.join(unpacked, "resources", "app.asar"),
      };
      if (!outputs || Object.keys(expected).some((key) => !samePath(outputs[key] || "", expected[key]))) {
        throw new Error("ARTIFACT_PATH_INVALID");
      }
      const outputSnapshots = capture(output, [output, unpacked, path.dirname(expected.asar), ...Object.values(expected)], "OUTPUT_SNAPSHOT");
      const script = path.join(scripts, "package-artifact-audit.cjs");
      const artifact = validateArtifact(parseReport(invoke(runCommand, {
        file: process.execPath,
        args: [script, "--strict", "--artifact", unpacked, "--web-version", version, "--web-commit", commit],
        options: { cwd: root },
      }), "ARTIFACT_AUDIT"), { artifactPath: unpacked, version, commit });
      revalidate(sourceSnapshots, "SOURCE_SNAPSHOT");
      revalidate(outputSnapshots, "OUTPUT_SNAPSHOT");
      return Object.freeze({
        source: sourceReport,
        stagedPayload: artifact,
        installer: Object.freeze({ metadata: "pending", asarAudited: false }),
      });
    },
  });
}

module.exports = { AUDIT_TIMEOUT_MS, MAX_REPORT_BYTES, createAuditSession, defaultRunCommand };
