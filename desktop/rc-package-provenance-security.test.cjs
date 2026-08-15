const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { fixture, options } = require("./rc-package-provenance-fixture.cjs");

function load() {
  return require("../scripts/stabilization/rc-package-provenance.cjs");
}

function rewriteManifest(receipt, mutate) {
  const manifest = JSON.parse(fs.readFileSync(receipt.manifest, "utf8"));
  mutate(manifest);
  fs.writeFileSync(receipt.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
}

for (const [name, mutate] of [
  ["schema", (value) => { value.schema = "wrong"; }],
  ["version", (value) => { value.version = "1.6.0"; }],
  ["arch", (value) => { value.arch = "ia32"; }],
  ["source commit", (value) => { value.sourceCommit = "b".repeat(40); }],
  ["installer name", (value) => { value.installer.name = "other.exe"; }],
  ["installer bytes", (value) => { value.installer.bytes += 1; }],
  ["installer SHA", (value) => { value.installer.sha256 = "0".repeat(64); }],
  ["signature status", (value) => { value.installer.authenticode = "Valid"; }],
  ["ASAR audited claim", (value) => { value.installer.asarAudited = true; }],
  ["Electron version", (value) => { value.electronVersion = "0.0.0"; }],
  ["build identity", (value) => { value.build.endCommit = "b".repeat(40); }],
  ["final artifact classification", (value) => { value.finalRcArtifact = true; }],
  ["evidence classification", (value) => { value.evidenceClassification = "final-rc-artifact"; }],
]) {
  test(`Given manifest ${name} tampering, When revalidated, Then it fails closed`, (t) => {
    const item = fixture(t);
    const receipt = load().createCandidateProvenance(item, options());
    rewriteManifest(receipt, mutate);
    assert.throws(() => load().validateCandidateProvenance(item, options()), /PROVENANCE_MANIFEST_INVALID/);
  });
}

test("Given duplicate manifest keys, When revalidated, Then strict JSON rejects it", (t) => {
  const item = fixture(t);
  const receipt = load().createCandidateProvenance(item, options());
  const text = fs.readFileSync(receipt.manifest, "utf8").replace('{\n  "schema":', '{\n  "schema": "duplicate",\n  "schema":');
  fs.writeFileSync(receipt.manifest, text);
  assert.throws(() => load().validateCandidateProvenance(item, options()), /PROVENANCE_MANIFEST_INVALID/);
});

test("Given mutation before integrated final validation, When provenance is created, Then no success escapes", (t) => {
  const item = fixture(t);
  let changed;
  assert.throws(() => load().createCandidateProvenance(item, options({
    beforeCommit: (receipt) => (changed = receipt.checksum, fs.appendFileSync(receipt.checksum, "extra\n")),
  })), /PROVENANCE_STAGED_CONTENT_INVALID/);
  assert.match(fs.readFileSync(changed, "utf8"), /extra/u);
  assert.equal(fs.existsSync(path.join(item.output, "RC_MANIFEST.json")), false);
});

test("Given installer mutation before integrated final validation, When provenance is created, Then payload drift fails", (t) => {
  const item = fixture(t);
  assert.throws(() => load().createCandidateProvenance(item, options({
    beforeCommit: () => fs.appendFileSync(item.outputs.installer, "changed"),
  })), /PROVENANCE_(?:CHECKSUM_INVALID|MANIFEST_INVALID|SNAPSHOT_CHANGED)/);
  assert.equal(fs.existsSync(path.join(item.output, "RC_MANIFEST.json")), false);
});

test("Given signature drift, When provenance is revalidated, Then it fails closed", (t) => {
  const item = fixture(t);
  const receipt = load().createCandidateProvenance(item, options());
  assert.throws(() => load().validateCandidateProvenance(item, options({ inspectAuthenticode: () => "Valid" })), /PROVENANCE_SIGNATURE_INVALID/);
  assert.ok(fs.existsSync(receipt.manifest));
});

for (const key of ["sourceAudit", "stagedAudit", "checksum", "manifest"]) {
  test(`Given a BOM-prefixed ${key}, When revalidated, Then canonical text is rejected`, (t) => {
    const item = fixture(t);
    const receipt = load().createCandidateProvenance(item, options());
    fs.writeFileSync(receipt[key], Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), fs.readFileSync(receipt[key])]));
    assert.throws(() => load().validateCandidateProvenance(item, options()), /PROVENANCE_(?:AUDIT|CHECKSUM|MANIFEST)_INVALID/);
  });
}

for (const unsafe of [
  "C:\\Users\\private\\secret.txt", "file:///C:/Users/private/secret.txt", "\\\\server\\share\\secret.txt",
  "file://server/share/secret.txt", "\\rooted\\secret.txt", "/var/private/secret.txt",
  "%66%69%6c%65%3A%2F%2Fserver%2Fshare%2Fsecret.txt", "note (file://server/share/secret.txt)",
  "note: C:\\private\\secret.txt", "note (/var/private/secret.txt)", "note \\\\?\\C:\\private\\secret.txt",
  "%2566%2569%256c%2565%253a%252f%252fserver%252fshare",
  "%66ile%3a%2f%2fserver%2fshare", "%ZZ%66%69%6c%65%3a%2f%2fserver%2fshare",
]) {
  test("Given an absolute private path in an audit report, When canonicalized, Then generation rejects it", (t) => {
    const item = fixture(t);
    item.policyReports.source.unknown = { nested: [unsafe] };
    assert.throws(() => load().createCandidateProvenance(item, options()), /PROVENANCE_AUDIT_PATH_UNSAFE/);
  });
}

test("Given ordinary non-file URLs in an audit report, When canonicalized, Then they remain allowed", (t) => {
  const item = fixture(t);
  item.policyReports.source.unknown = "See https://example.test/a/b?next=https://other.test/x";
  assert.doesNotThrow(() => load().createCandidateProvenance(item, options()));
});

for (const unsafeUrl of [
  "https://example.test/C:/private/secret.txt",
  "https://example.test/a?next=%252Fprivate%252Fsecret.txt",
  "https://example.test/a#file%3A%2F%2Fserver%2Fshare",
  "https://example.test/a?next=%ZZ%2Fprivate%2Fsecret.txt",
  "https://C%3A%5Cprivate@example.test/a",
]) {
  test("Given a private path inside an HTTP URL, When canonicalized, Then the component is rejected", (t) => {
    const item = fixture(t);
    item.policyReports.source.unknown = `See ${unsafeUrl}`;
    assert.throws(() => load().createCandidateProvenance(item, options()), /PROVENANCE_AUDIT_PATH_UNSAFE/);
  });
}

for (const safeUrl of [
  "https://example.test/a/b?next=https%3A%2F%2Fother.test%2Fx#section",
  "http://user:pass@example.test:8080/a/b?q=ordinary",
  "https://example.test/a/b?next=/dashboard#/route",
  "https://example.test/a/b?redirect=%2Fdashboard&route=%252Fsettings",
  "https://example.test/a/b?profile=/dashboard&next=%252Fsettings",
]) {
  test("Given an ordinary HTTP URL, When canonicalized, Then URL syntax is not mistaken for a file path", (t) => {
    const item = fixture(t);
    item.policyReports.source.unknown = `See ${safeUrl}`;
    assert.doesNotThrow(() => load().createCandidateProvenance(item, options()));
  });
}

for (const unsafeUrl of [
  "https://example.test/a?path=/custom",
  "https://example.test/a?file=/dashboard",
  "https://example.test/a?next=/tmp/x",
  "https://example.test/a?redirect=%2Fetc%2Fsecret",
  "https://example.test/a?route=%252Fvar%252Fprivate",
  "https://example.test/tmp/private",
  "https://example.test/a#/home/private",
  "https://%2Fsecret@example.test/a",
  "https://%252Fsecret@example.test/a",
  "https://user:%2Fsecret@example.test/a",
  "https://user:%252Fsecret@example.test/a",
  "https://example.test/a#path=%2Fsecret",
  "https://example.test/a#/artifactpath=%252Fsecret",
  "https://example.test/a#?sourcePath=/secret",
  "https://example.test/a?filepath=/custom",
  "https://example.test/a?artifactpath=/custom",
  "https://example.test/a?sourcepath=/custom",
  "https://example.test/a?rootdir=/custom",
  "https://example.test/a?directory=/custom",
  "https://example.test/a?filePath=/custom",
  "https://example.test/a?sourcefilepath=/custom",
  "https://example.test/a?artifactrootdir=/custom",
]) {
  test("Given a local POSIX surface inside an HTTP URL, When canonicalized, Then it is rejected", (t) => {
    const item = fixture(t);
    item.policyReports.source.unknown = unsafeUrl;
    assert.throws(() => load().createCandidateProvenance(item, options()), /PROVENANCE_AUDIT_PATH_UNSAFE/);
  });
}

test("Given provenance metadata inspection, When files are validated, Then all four canonical files are inspected", (t) => {
  const item = fixture(t);
  const seen = [];
  const inspectFile = (file) => (seen.push(path.basename(file)), { reparse: false, sparse: false, allocatedBytes: "4096", streams: [] });
  load().createCandidateProvenance(item, options({ inspectFile }));
  assert.deepEqual(new Set(seen.filter((name) => !name.startsWith(".5e-rc-tmp-"))),
    new Set(["SOURCE_AUDIT.json", "STAGED_ARTIFACT_AUDIT.json", "SHA256SUMS.txt"]));
  assert.ok(seen.some((name) => name.startsWith(".5e-rc-tmp-") && name.endsWith("RC_MANIFEST.json")));
});

test("Given an unsafe canonical provenance file, When metadata is inspected, Then validation fails closed", (t) => {
  const item = fixture(t);
  const inspectFile = (file) => ({ reparse: file.endsWith("RC_MANIFEST.json"), sparse: false, allocatedBytes: "4096", streams: [] });
  assert.throws(() => load().createCandidateProvenance(item, options({ inspectFile })), /PROVENANCE_FILE_REPARSE_POINT/);
  assert.equal(fs.existsSync(path.join(item.output, "RC_MANIFEST.json")), false);
});

test("Given a canonical file swap during metadata inspection, When snapshots revalidate, Then it fails closed", (t) => {
  const item = fixture(t);
  let changed = false;
  const source = path.join(item.output, "SOURCE_AUDIT.json");
  const inspectFile = (file) => {
    if (!changed && file === source) {
      changed = true;
      fs.rmSync(source);
      fs.writeFileSync(source, "replacement");
    }
    return { reparse: false, sparse: false, allocatedBytes: "4096", streams: [] };
  };
  assert.throws(() => load().createCandidateProvenance(item, options({ inspectFile })), /PROVENANCE_SNAPSHOT_CHANGED/);
  assert.equal(fs.readFileSync(source, "utf8"), "replacement");
  assert.equal(fs.existsSync(path.join(item.output, "RC_MANIFEST.json")), false);
});

test("Given a hardlinked canonical file, When revalidated, Then nlink one is enforced", (t) => {
  const item = fixture(t);
  const receipt = load().createCandidateProvenance(item, options());
  fs.linkSync(receipt.manifest, path.join(item.output, "manifest-copy.json"));
  assert.throws(() => load().validateCandidateProvenance(item, options()), /PROVENANCE_SNAPSHOT_INVALID/);
});

for (const publishIndex of [0, 1, 2, 3]) {
  test(`Given publication failure after final ${publishIndex + 1}, When retained, Then no successful handoff occurs`, (t) => {
    const item = fixture(t);
    assert.throws(() => load().createCandidateProvenance(item, options({
      afterPublish: (index, file) => {
        if (index !== publishIndex) return;
        assert.equal(fs.existsSync(path.join(item.output, "RC_MANIFEST.json")), false);
        throw new Error(`injected-before-${path.basename(file)}`);
      },
    })), /PROVENANCE_WRITE_FAILED/);
    const manifest = path.join(item.output, "RC_MANIFEST.json");
    if (publishIndex < 3) assert.equal(fs.existsSync(manifest), false);
    assert.throws(() => load().validateCandidateProvenance(item, options()), /PROVENANCE_/);
  });
}

test("Given an unknown replacement during failure, When ownership differs, Then it is never deleted", (t) => {
  const item = fixture(t);
  let replacement;
  assert.throws(() => load().createCandidateProvenance(item, options({
    afterPublish: (index, file) => {
      if (index !== 0) return;
      fs.rmSync(file);
      fs.writeFileSync(file, "unknown-replacement");
      replacement = file;
      throw new Error("injected");
    },
  })), /PROVENANCE_WRITE_FAILED/);
  assert.equal(fs.readFileSync(replacement, "utf8"), "unknown-replacement");
});

test("Given final artifact classification, When provenance is generated, Then the manifest binds it", (t) => {
  const item = fixture(t);
  item.finalRcArtifact = true;
  item.evidenceClassification = "final-rc-artifact";
  const receipt = load().createCandidateProvenance(item, options());
  const manifest = JSON.parse(fs.readFileSync(receipt.manifest, "utf8"));
  assert.equal(manifest.finalRcArtifact, true);
  assert.equal(manifest.evidenceClassification, "final-rc-artifact");
});

test("Given the manifest rename succeeds, When creation returns, Then the receipt and standalone validator accept it", (t) => {
  const item = fixture(t);
  const receipt = load().createCandidateProvenance(item, options());
  assert.equal(receipt.state, "candidate_manifest_validated");
  assert.ok(fs.existsSync(receipt.manifest));
  assert.doesNotThrow(() => load().validateCandidateProvenance(item, options()));
});
