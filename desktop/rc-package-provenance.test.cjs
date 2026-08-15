const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { fixture, options, COMMIT, INSTALLER, VERSION } = require("./rc-package-provenance-fixture.cjs");

function load() {
  return require("../scripts/stabilization/rc-package-provenance.cjs");
}

function sha(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

test("Given audited canonical outputs, When provenance is created, Then exact checksum and manifest validate", (t) => {
  const item = fixture(t);
  const receipt = load().createCandidateProvenance(item, options());
  assert.equal(receipt.state, "candidate_manifest_validated");
  assert.equal(path.basename(receipt.checksum), "SHA256SUMS.txt");
  assert.equal(fs.readFileSync(receipt.checksum, "utf8"), `${sha(item.outputs.installer)}  ${INSTALLER}\n`);
  const manifest = JSON.parse(fs.readFileSync(receipt.manifest, "utf8"));
  assert.deepEqual({ schema: manifest.schema, version: manifest.version, arch: manifest.arch, sourceCommit: manifest.sourceCommit }, {
    schema: "5e-rc-manifest@1", version: VERSION, arch: "x64", sourceCommit: COMMIT,
  });
  assert.equal(manifest.finalRcArtifact, false);
  assert.equal(manifest.evidenceClassification, "synthetic-fixture");
  assert.deepEqual(manifest.installer, {
    name: INSTALLER, bytes: 15, sha256: sha(item.outputs.installer), authenticode: "NotSigned", asarAudited: false,
  });
  assert.equal(manifest.payload.executable.sha256, sha(item.outputs.unpackedExecutable));
  assert.equal(manifest.payload.asar.sha256, sha(item.outputs.asar));
  assert.equal(manifest.electronVersion, "43.4.0");
  assert.doesNotMatch(fs.readFileSync(receipt.stagedAudit, "utf8"), new RegExp(item.output.replaceAll("\\", "\\\\"), "i"));
  assert.doesNotThrow(() => load().validateCandidateProvenance(item, options()));
});

for (const [name, target] of [
  ["installer bytes", (item, receipt) => fs.appendFileSync(item.outputs.installer, "x")],
  ["unpacked executable bytes", (item) => fs.appendFileSync(item.outputs.unpackedExecutable, "x")],
  ["ASAR bytes", (item) => fs.appendFileSync(item.outputs.asar, "x")],
  ["source audit report", (_item, receipt) => fs.appendFileSync(receipt.sourceAudit, " ")],
  ["staged audit report", (_item, receipt) => fs.appendFileSync(receipt.stagedAudit, " ")],
  ["checksum", (_item, receipt) => fs.appendFileSync(receipt.checksum, "extra\n")],
]) {
  test(`Given ${name} tampering, When provenance is revalidated, Then it fails closed`, (t) => {
    const item = fixture(t);
    const receipt = load().createCandidateProvenance(item, options());
    target(item, receipt);
    assert.throws(() => load().validateCandidateProvenance(item, options()), /PROVENANCE_/);
  });
}

test("Given existing provenance output, When generation starts, Then stale reuse is rejected", (t) => {
  const item = fixture(t);
  fs.writeFileSync(path.join(item.output, "SHA256SUMS.txt"), "stale");
  assert.throws(() => load().createCandidateProvenance(item, options()), /PROVENANCE_FILE_EXISTS/);
});

test("Given a stale transaction temp, When generation starts, Then it is rejected without deletion", (t) => {
  const item = fixture(t);
  const stale = path.join(item.output, ".5e-rc-tmp-unknown");
  fs.writeFileSync(stale, "unknown");
  assert.throws(() => load().createCandidateProvenance(item, options()), /PROVENANCE_TEMP_FILE_EXISTS/);
  assert.equal(fs.readFileSync(stale, "utf8"), "unknown");
});

test("Given installer filename replacement, When revalidated, Then no private path escapes", (t) => {
  const item = fixture(t);
  load().createCandidateProvenance(item, options());
  fs.renameSync(item.outputs.installer, path.join(item.output, "other.exe"));
  assert.throws(() => load().validateCandidateProvenance(item, options()),
    (error) => /^PROVENANCE_/u.test(error.message) && !error.message.includes(item.output));
});

test("Given a missing manifest, When revalidated, Then no raw filesystem diagnostics escape", (t) => {
  const item = fixture(t);
  const receipt = load().createCandidateProvenance(item, options());
  fs.rmSync(receipt.manifest);
  assert.throws(() => load().validateCandidateProvenance(item, options()),
    (error) => error.message === "PROVENANCE_MANIFEST_INVALID" && !error.message.includes(item.output));
});
