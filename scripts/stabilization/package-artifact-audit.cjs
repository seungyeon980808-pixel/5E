const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { openArtifact } = require("./package-artifact-reader.cjs");

const REPORT_SCHEMA = "5e-package-artifact-audit@1";
const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_POLICY = path.join(__dirname, "package-artifact-policy.json");

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function insideRoot(relativePath, root) {
  return relativePath === root || relativePath.startsWith(`${root}/`);
}

function parseJsonFile(artifact, relativePath) {
  const file = artifact.files.find((candidate) => candidate.path === relativePath);
  if (!file) return null;
  try { return JSON.parse(artifact.read(relativePath).toString("utf8")); }
  catch { return null; }
}

function auditPackageArtifact({ artifactPath, policy, webIdentity }) {
  const artifact = openArtifact(artifactPath);
  const files = artifact.files.map((file) => ({ path: file.path, bytes: file.bytes })).sort((a, b) => compareText(a.path, b.path));
  const paths = new Set(files.map((file) => file.path));
  const violations = [];
  for (const file of files) {
    const forbidden = policy.forbiddenRoots.find((root) => insideRoot(file.path, root));
    if (forbidden) violations.push({ code: "FORBIDDEN_ARTIFACT_ROOT", value: file.path });
    else if (!policy.allowedRoots.some((root) => insideRoot(file.path, root))) {
      violations.push({ code: "UNAPPROVED_ARTIFACT_PATH", value: file.path });
    }
  }
  for (const required of policy.requiredFiles) {
    if (!paths.has(required)) violations.push({ code: "REQUIRED_ARTIFACT_FILE_MISSING", value: required });
  }
  const packageJson = parseJsonFile(artifact, "package.json");
  const buildIdentity = parseJsonFile(artifact, "build-identity.json");
  const desktop = {
    version: typeof packageJson?.version === "string" ? packageJson.version : null,
    commit: typeof buildIdentity?.commit === "string" ? buildIdentity.commit
      : typeof packageJson?.buildCommit === "string" ? packageJson.buildCommit : null,
  };
  if (!packageJson) violations.push({ code: "PACKAGE_METADATA_INVALID", value: "package.json" });
  if (!desktop.commit) violations.push({ code: "DESKTOP_COMMIT_MISSING", value: "package.json#buildCommit" });
  if (buildIdentity && buildIdentity.version !== desktop.version) {
    violations.push({ code: "DESKTOP_IDENTITY_VERSION_MISMATCH", value: String(buildIdentity.version) });
  }
  const identity = { web: webIdentity, desktop, matches: desktop.version === webIdentity.version && desktop.commit === webIdentity.commit };
  if (desktop.version !== webIdentity.version) violations.push({ code: "WEB_DESKTOP_VERSION_MISMATCH", value: `${webIdentity.version}:${desktop.version}` });
  if (desktop.commit !== webIdentity.commit) violations.push({ code: "WEB_DESKTOP_COMMIT_MISMATCH", value: `${webIdentity.commit}:${desktop.commit}` });
  violations.sort((a, b) => compareText(a.code, b.code) || compareText(a.value, b.value));
  return {
    schema: REPORT_SCHEMA, policySchema: policy.schema, artifactPath: path.resolve(artifactPath), kind: artifact.kind,
    files, totalFileBytes: files.reduce((sum, file) => sum + file.bytes, 0), artifactBytes: artifact.bytes,
    identity, violations,
  };
}

function currentWebIdentity() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  let commit = process.env.GITHUB_SHA || process.env.FIVE_E_BUILD_COMMIT || null;
  if (!commit) {
    try { commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(); }
    catch { commit = "unknown"; }
  }
  return { version: packageJson.version, commit };
}

function parseArguments(argv) {
  const options = { artifactPath: path.join(ROOT, "release", "win-unpacked"), policyPath: DEFAULT_POLICY, strict: false, webIdentity: currentWebIdentity() };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--artifact") options.artifactPath = path.resolve(argv[++index]);
    else if (argument === "--policy") options.policyPath = path.resolve(argv[++index]);
    else if (argument === "--web-version") options.webIdentity.version = argv[++index];
    else if (argument === "--web-commit") options.webIdentity.commit = argv[++index];
    else if (argument === "--strict") options.strict = true;
    else throw new Error(`Unsupported argument: ${argument}`);
  }
  return options;
}

function runCli(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const policy = JSON.parse(fs.readFileSync(options.policyPath, "utf8"));
  const report = auditPackageArtifact({ artifactPath: options.artifactPath, policy, webIdentity: options.webIdentity });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (options.strict && report.violations.length) process.exitCode = 1;
  return report;
}

if (require.main === module) {
  try { runCli(); }
  catch (error) {
    process.stderr.write(`${JSON.stringify({ schema: REPORT_SCHEMA, code: error.code || "AUDIT_FAILED", error: error.message })}\n`);
    process.exitCode = 2;
  }
}

module.exports = { auditPackageArtifact, runCli };
