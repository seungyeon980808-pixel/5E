#!/usr/bin/env node

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const receiptPath = path.resolve(process.argv[2] || path.join(root, 'release-source-decision.json'));
const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath));
}

function readAt(commit, relativePath) {
  return execFileSync('git', ['show', `${commit}:${relativePath}`], {
    cwd: root,
    encoding: null,
    maxBuffer: 32 * 1024 * 1024,
  });
}

function isAncestor(ancestor, descendant) {
  execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
    cwd: root,
  });
  return true;
}

function verifyCurrent(record, label) {
  const bytes = read(record.path);
  assert.equal(sha256(bytes), record.currentSha256 || record.sha256, `${label} current hash: ${record.path}`);
  if (record.bytes !== undefined) assert.equal(bytes.length, record.bytes, `${label} size: ${record.path}`);
}

const auditedHead = receipt.candidate.auditedHead;
assert.match(auditedHead, /^[0-9a-f]{40}$/);
assert.equal(receipt.auditManifest.expected, 457);
assert.equal(receipt.auditManifest.matchedBeforeBaselineCommit, 457);
assert.equal(receipt.auditManifest.missing, 0);
assert.equal(receipt.auditManifest.mismatch, 0);

assert.equal(receipt.restorations.length, 138);
for (const record of receipt.restorations) {
  assert.equal(record.sourceCommit, auditedHead, `unreviewed restoration source: ${record.path}`);
  const source = readAt(record.sourceCommit, record.path);
  assert.equal(sha256(source), record.sourceSha256, `restoration source hash: ${record.path}`);
  assert.equal(sha256(read(record.path)), record.sourceSha256, `restoration current hash: ${record.path}`);
  assert.ok(record.rationale, `restoration rationale: ${record.path}`);
  assert.ok(record.comparisonRelation, `restoration comparison: ${record.path}`);
}

assert.equal(receipt.untrackedClassification.length, 17);
assert.equal(receipt.untrackedClassification.filter(item => item.decision === 'included').length, 2);
assert.equal(receipt.untrackedClassification.filter(item => item.decision === 'excluded').length, 15);
for (const item of receipt.untrackedClassification) assert.ok(item.rationale, `untracked rationale: ${item.path}`);

const authorizedFollowOnChanges = receipt.authorizedFollowOnTaskChanges;
assert.equal(authorizedFollowOnChanges.length, 7);
for (const authorization of authorizedFollowOnChanges) {
  assert.match(authorization.sourceCommit, /^[0-9a-f]{40}$/);
  assert.match(authorization.originalTaskCommit, /^[0-9a-f]{40}$/);
  assert.ok(Array.isArray(authorization.paths) && authorization.paths.length > 0);
  assert.ok(authorization.evidence, `follow-on evidence: ${authorization.sourceCommit}`);
  assert.ok(authorization.rationale, `follow-on rationale: ${authorization.sourceCommit}`);
  assert.ok(isAncestor(authorization.sourceCommit, 'HEAD'), `follow-on source is retained: ${authorization.sourceCommit}`);
  for (const authorizedPath of authorization.paths) {
    const record = receipt.taskChanges.find((item) => (
      item.sourceCommit === authorization.sourceCommit && item.path === authorizedPath
    ));
    assert.ok(record, `follow-on task change is recorded: ${authorizedPath}`);
    assert.equal(sha256(readAt(authorization.originalTaskCommit, authorizedPath)), record.sourceSha256, `original task source hash: ${authorizedPath}`);
  }
}

function isAuthorizedTaskChange(record) {
  return record.sourceCommit === auditedHead || authorizedFollowOnChanges.some((authorization) => (
    authorization.sourceCommit === record.sourceCommit && authorization.paths.includes(record.path)
  ));
}

for (const record of receipt.taskChanges) {
  assert.ok(isAuthorizedTaskChange(record), `task change source: ${record.path}`);
  assert.equal(sha256(readAt(record.sourceCommit, record.path)), record.sourceSha256, `task change source hash: ${record.path}`);
  verifyCurrent(record, 'task change');
  assert.ok(record.rationale, `task change rationale: ${record.path}`);
}

for (const records of Object.values(receipt.directEntryHashes)) {
  for (const record of records) verifyCurrent(record, 'entry');
}

assert.deepEqual(receipt.entryDecision, {
  desktop: 'preview/index.html',
  stableWeb: 'index.html',
  packagePattern: 'preview/**/*',
  previewStorageNamespace: '5e.preview:',
  storageMigrationFilesModified: false,
});

console.log(JSON.stringify({
  auditedHead,
  auditManifest: '457/457',
  restorations: receipt.restorations.length,
  taskChanges: receipt.taskChanges.length,
  classifiedUntracked: receipt.untrackedClassification.length,
  previewEntryFiles: receipt.directEntryHashes.preview.length,
  stableEntryFiles: receipt.directEntryHashes.stable.length,
  status: 'PASS',
}, null, 2));
