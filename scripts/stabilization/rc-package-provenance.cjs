const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");
const { TextDecoder } = require("node:util");
const { inspectAuthenticode: defaultInspectAuthenticode } = require("./rc-authenticode.cjs");
const { inspectFile: defaultInspectFile } = require("./rc-package-file-inspector.cjs");
const { unsafeSurface } = require("./rc-report-path-safety.cjs");
const files = require("./rc-provenance-files.cjs");
const { parseStrictJson } = require("./strict-json.cjs");

const VERSION = "1.6.0-rc.1";
const INSTALLER = "5E-Setup-1.6.0-rc.1-windows-x64.exe";
const NAMES = Object.freeze({
  checksum: "SHA256SUMS.txt", manifest: "RC_MANIFEST.json",
  sourceAudit: "SOURCE_AUDIT.json", stagedAudit: "STAGED_ARTIFACT_AUDIT.json",
});

function samePath(left, right) {
  const normalize = (file) => process.platform === "win32" ? path.resolve(file).toLowerCase() : path.resolve(file);
  return normalize(left) === normalize(right);
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function strictUtf8(file, code) {
  try {
    const bytes = fs.readFileSync(file);
    if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) throw new Error("bom");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!text.endsWith("\n") || text.includes("\r")) throw new Error("invalid");
    return text;
  } catch { throw new Error(code); }
}

function unsafePath(value) {
  return unsafeSurface(value);
}

function sanitize(value) {
  if (typeof value === "string") {
    if (unsafePath(value)) throw new Error("PROVENANCE_AUDIT_PATH_UNSAFE");
    return value;
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (unsafePath(key)) throw new Error("PROVENANCE_AUDIT_PATH_UNSAFE");
    return [key, sanitize(item)];
  }));
}

function canonicalReports(context) {
  const { source, stagedPayload, installer } = context.policyReports || {};
  if (source?.schema !== "5e-package-source-audit-v1" || !Array.isArray(source.violations) || source.violations.length !== 0) {
    throw new Error("PROVENANCE_AUDIT_INVALID");
  }
  if (stagedPayload?.schema !== "5e-package-artifact-audit@1" || stagedPayload.kind !== "staged"
    || !Array.isArray(stagedPayload.violations) || stagedPayload.violations.length !== 0
    || stagedPayload.identity?.matches !== true || stagedPayload.identity.web?.version !== context.version
    || stagedPayload.identity.desktop?.version !== context.version || stagedPayload.identity.web?.commit !== context.commit
    || stagedPayload.identity.desktop?.commit !== context.commit
    || !samePath(stagedPayload.artifactPath || "", path.join(context.output, "win-unpacked"))
    || installer?.metadata !== "pending" || installer?.asarAudited !== false) {
    throw new Error("PROVENANCE_AUDIT_INVALID");
  }
  return Object.freeze({ source: sanitize(source), staged: sanitize({ ...stagedPayload, artifactPath: "win-unpacked" }) });
}

function validateContext(context) {
  const expectedOutputs = {
    installer: path.join(context.output || "", INSTALLER),
    unpackedExecutable: path.join(context.output || "", "win-unpacked", "5E.exe"),
    asar: path.join(context.output || "", "win-unpacked", "resources", "app.asar"),
  };
  const buildTimesValid = [context.build?.startedAt, context.build?.endedAt].every((value) =>
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && new Date(value).toISOString() === value);
  const classificationValid = (context.finalRcArtifact === true && context.evidenceClassification === "final-rc-artifact")
    || (context.finalRcArtifact === false && context.evidenceClassification === "synthetic-fixture");
  if (context.version !== VERSION || context.arch !== "x64" || !/^[0-9a-f]{40}$/u.test(context.commit)
    || !/^\d+\.\d+\.\d+$/u.test(context.electronVersion || "")
    || context.build?.startCommit !== context.commit || context.build?.endCommit !== context.commit
    || !buildTimesValid || !classificationValid
    || Date.parse(context.build.startedAt) > Date.parse(context.build.endedAt)
    || Object.entries(expectedOutputs).some(([key, file]) => !samePath(context.outputs?.[key] || "", file))) {
    throw new Error("PROVENANCE_CONTEXT_INVALID");
  }
  return canonicalReports(context);
}

function textRecord(text, name) {
  const bytes = Buffer.from(text, "utf8");
  return Object.freeze({ name, bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") });
}

function locations(context) {
  return Object.freeze(Object.fromEntries(Object.entries(NAMES).map(([key, name]) => [key, path.join(context.output, name)])));
}

function expectedManifest(context, auditRecords, inspectAuthenticode) {
  const installer = files.fileRecord(context.outputs.installer, INSTALLER);
  const executable = files.fileRecord(context.outputs.unpackedExecutable, "win-unpacked/5E.exe");
  const asar = files.fileRecord(context.outputs.asar, "win-unpacked/resources/app.asar");
  const authenticode = inspectAuthenticode(context.outputs.installer);
  if (authenticode !== "NotSigned") throw new Error("PROVENANCE_SIGNATURE_INVALID");
  return Object.freeze({
    schema: "5e-rc-manifest@1", version: context.version, arch: context.arch, sourceCommit: context.commit,
    finalRcArtifact: context.finalRcArtifact, evidenceClassification: context.evidenceClassification,
    electronVersion: context.electronVersion,
    build: { ...context.build },
    installer: { ...installer, authenticode, asarAudited: false },
    payload: { executable, asar },
    audits: auditRecords,
  });
}

function inspectCanonicalFiles(snapshots, canonicalFiles, inspectFile) {
  for (const file of canonicalFiles) {
    const metadata = inspectFile(file);
    files.revalidate(snapshots);
    if (typeof metadata?.reparse !== "boolean" || typeof metadata?.sparse !== "boolean"
      || typeof metadata?.allocatedBytes !== "string"
      || (!Array.isArray(metadata.streams) && typeof metadata.streams !== "string")) {
      throw new Error("PROVENANCE_FILE_METADATA_INVALID");
    }
    if (metadata.reparse) throw new Error("PROVENANCE_FILE_REPARSE_POINT");
    if (metadata.sparse) throw new Error("PROVENANCE_FILE_SPARSE");
    if (!/^\d+$/u.test(metadata.allocatedBytes) || BigInt(metadata.allocatedBytes) <= 0n) {
      throw new Error("PROVENANCE_FILE_ALLOCATION_INVALID");
    }
    const streams = Array.isArray(metadata.streams) ? metadata.streams : [metadata.streams];
    if (streams.some((stream) => stream !== ":$DATA")) throw new Error("PROVENANCE_FILE_ALTERNATE_DATA_STREAM");
  }
}

function parseManifest(text) {
  try {
    const value = parseStrictJson(text);
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("invalid");
    return value;
  } catch { throw new Error("PROVENANCE_MANIFEST_INVALID"); }
}

function validateCandidateProvenance(context, overrides = {}) {
  const reports = validateContext(context);
  const target = locations(context);
  const expectedSource = jsonText(reports.source);
  const expectedStaged = jsonText(reports.staged);
  if (strictUtf8(target.sourceAudit, "PROVENANCE_AUDIT_INVALID") !== expectedSource
    || strictUtf8(target.stagedAudit, "PROVENANCE_AUDIT_INVALID") !== expectedStaged) {
    throw new Error("PROVENANCE_AUDIT_INVALID");
  }
  const inputs = [context.outputs.installer, context.outputs.unpackedExecutable, context.outputs.asar, target.sourceAudit, target.stagedAudit];
  const snapshots = files.captureOutput(context.output, inputs);
  const inspectAuthenticode = overrides.inspectAuthenticode || defaultInspectAuthenticode;
  const auditRecords = {
    source: files.fileRecord(target.sourceAudit, NAMES.sourceAudit),
    staged: files.fileRecord(target.stagedAudit, NAMES.stagedAudit),
  };
  const expected = expectedManifest(context, auditRecords, inspectAuthenticode);
  const checksum = strictUtf8(target.checksum, "PROVENANCE_CHECKSUM_INVALID");
  if (checksum !== `${expected.installer.sha256}  ${INSTALLER}\n`) throw new Error("PROVENANCE_CHECKSUM_INVALID");
  const manifestText = strictUtf8(target.manifest, "PROVENANCE_MANIFEST_INVALID");
  if (!isDeepStrictEqual(parseManifest(manifestText), expected) || manifestText !== jsonText(expected)) {
    throw new Error("PROVENANCE_MANIFEST_INVALID");
  }
  const complete = files.captureOutput(context.output, [...inputs, target.checksum, target.manifest]);
  inspectCanonicalFiles(complete, Object.values(target), overrides.inspectFile || defaultInspectFile);
  files.revalidate(snapshots);
  files.revalidate(complete);
  return Object.freeze({ state: "candidate_manifest_validated", ...target });
}

function createCandidateProvenance(context, overrides = {}) {
  const reports = validateContext(context);
  const target = locations(context);
  files.assertPublicationFresh(Object.values(target));
  const initial = files.captureFiles(Object.values(context.outputs));
  const sourceText = jsonText(reports.source);
  const stagedText = jsonText(reports.staged);
  const auditRecords = {
    source: textRecord(sourceText, NAMES.sourceAudit), staged: textRecord(stagedText, NAMES.stagedAudit),
  };
  const inspectAuthenticode = overrides.inspectAuthenticode || defaultInspectAuthenticode;
  const manifest = expectedManifest(context, auditRecords, inspectAuthenticode);
  const receipt = Object.freeze({ state: "candidate_manifest_validated", ...target });
  const entries = [
    { file: target.sourceAudit, text: sourceText },
    { file: target.stagedAudit, text: stagedText },
    { file: target.checksum, text: `${manifest.installer.sha256}  ${INSTALLER}\n` },
    { file: target.manifest, text: jsonText(manifest) },
  ];
  const inspectFile = overrides.inspectFile || defaultInspectFile;
  const validateExact = (paths, expectedEntries) => {
    files.fsyncFiles(paths);
    if (paths.some((file, index) => !fs.readFileSync(file).equals(Buffer.from(expectedEntries[index].text, "utf8")))) {
      throw new Error("PROVENANCE_STAGED_CONTENT_INVALID");
    }
    const snapshots = files.captureOutput(context.output, paths);
    inspectCanonicalFiles(snapshots, paths, inspectFile);
    files.revalidate(snapshots);
  };
  files.publishTransaction(entries, {
    beforePublish: overrides.beforePublish,
    afterPublish: overrides.afterPublish,
    validateStaged(staged) {
      files.revalidate(initial);
      validateExact(staged, entries);
    },
    beforeCommit() {
      overrides.beforeCommit?.(receipt);
      files.revalidate(initial);
      validateExact([target.sourceAudit, target.stagedAudit, target.checksum], entries.slice(0, 3));
    },
  });
  return receipt;
}

module.exports = { NAMES, createCandidateProvenance, validateCandidateProvenance };
