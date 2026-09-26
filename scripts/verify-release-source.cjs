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
const expectedFollowOnChanges = [
  {
    sourceCommit: 'c1bca259aff32cb29caf0df6cb68503edb869863',
    originalTaskCommit: 'de7b5ecddd93504ba77bf37e0f79148215723d13',
    paths: ['docs/credits.html', 'preview/docs/credits.html'],
  },
  {
    sourceCommit: '8013eaf097c999c0bbd8b9aa3aab7933942fe145',
    originalTaskCommit: '8013eaf097c999c0bbd8b9aa3aab7933942fe145',
    paths: ['package.json'],
  },
  {
    sourceCommit: '949d5bdc054fdc5de0f9e1603efc9ae0fb64c6cb',
    originalTaskCommit: '949d5bdc054fdc5de0f9e1603efc9ae0fb64c6cb',
    paths: ['preview/css/style.css'],
  },
  {
    sourceCommit: '3e62c46d626d45cc580a0ff4960da6cfa5be9696',
    originalTaskCommit: '3e62c46d626d45cc580a0ff4960da6cfa5be9696',
    paths: ['preview/js/main.js'],
  },
  {
    sourceCommit: '4db68c6ad160eb99197f73d882106d7127d42323',
    originalTaskCommit: '4db68c6ad160eb99197f73d882106d7127d42323',
    paths: ['preview/js/mcp-bridge.js'],
  },
  {
    sourceCommit: 'a93e7708087246a6f6c39d3ab8a57d00b2d7f46b',
    originalTaskCommit: 'a93e7708087246a6f6c39d3ab8a57d00b2d7f46b',
    paths: ['preview/js/ai-workbench.js'],
  },
  {
    sourceCommit: '2acb707bfadd794eeb5023a50026c0942a632c73',
    originalTaskCommit: 'c12649cb69a324e63662ec08bb32f151f082e707',
    paths: ['desktop/main.cjs'],
  },
];
const expectedTaskChanges = [
  ['package.json', '8013eaf097c999c0bbd8b9aa3aab7933942fe145'],
  ['desktop/main.cjs', '2acb707bfadd794eeb5023a50026c0942a632c73'],
  ['js/svg-export.js', '9f22fb5dfbb0036979e14de8f557a53f0a58545e'],
  ['docs/credits.html', 'c1bca259aff32cb29caf0df6cb68503edb869863'],
  ['preview/docs/credits.html', 'c1bca259aff32cb29caf0df6cb68503edb869863'],
  ['preview/css/style.css', '949d5bdc054fdc5de0f9e1603efc9ae0fb64c6cb'],
  ['preview/js/ai-workbench.js', 'a93e7708087246a6f6c39d3ab8a57d00b2d7f46b'],
  ['preview/js/main.js', '3e62c46d626d45cc580a0ff4960da6cfa5be9696'],
  ['preview/js/mcp-bridge.js', '4db68c6ad160eb99197f73d882106d7127d42323'],
];
assert.equal(authorizedFollowOnChanges.length, 7);
assert.deepEqual(authorizedFollowOnChanges.map(({ sourceCommit, originalTaskCommit, paths }) => ({
  sourceCommit,
  originalTaskCommit,
  paths,
})), expectedFollowOnChanges, 'follow-on authorization map');
assert.equal(receipt.taskChanges.length, 9);
assert.deepEqual(receipt.taskChanges.map(({ path: taskPath, sourceCommit }) => [taskPath, sourceCommit]), expectedTaskChanges, 'task change path map');
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
