const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const VERSION = "1.6.0-rc.1";
const COMMIT = "a".repeat(40);
const INSTALLER = "5E-Setup-1.6.0-rc.1-windows-x64.exe";

function fixture(t) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "5e-rc-provenance-"));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  const output = path.join(sandbox, "candidate");
  const unpacked = path.join(output, "win-unpacked");
  const asar = path.join(unpacked, "resources", "app.asar");
  fs.mkdirSync(path.dirname(asar), { recursive: true });
  const outputs = {
    installer: path.join(output, INSTALLER),
    unpackedExecutable: path.join(unpacked, "5E.exe"),
    asar,
  };
  fs.writeFileSync(outputs.installer, "installer-bytes");
  fs.writeFileSync(outputs.unpackedExecutable, "runtime-bytes");
  fs.writeFileSync(outputs.asar, "asar-bytes");
  const policyReports = {
    source: { schema: "5e-package-source-audit-v1", requiredRuntime: [], violations: [] },
    stagedPayload: {
      schema: "5e-package-artifact-audit@1", artifactPath: unpacked, kind: "staged",
      identity: {
        web: { version: VERSION, commit: COMMIT }, desktop: { version: VERSION, commit: COMMIT }, matches: true,
      },
      violations: [],
    },
    installer: { metadata: "pending", asarAudited: false },
  };
  return {
    output, outputs, policyReports, version: VERSION, commit: COMMIT, arch: "x64", electronVersion: "43.4.0",
    finalRcArtifact: false, evidenceClassification: "synthetic-fixture",
    build: {
      startedAt: "2026-08-15T00:00:00.000Z", endedAt: "2026-08-15T00:01:00.000Z",
      startCommit: COMMIT, endCommit: COMMIT,
    },
  };
}

function options(extra = {}) {
  return {
    inspectAuthenticode: () => "NotSigned",
    inspectFile: () => ({ reparse: false, sparse: false, allocatedBytes: "4096", streams: [] }),
    ...extra,
  };
}

module.exports = { COMMIT, INSTALLER, VERSION, fixture, options };
