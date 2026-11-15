const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const { assets, appendRoute, verifyRoute } = require('../scripts/print-publication.cjs');
const { inventory } = require('../scripts/web-release.cjs');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), '5e-print-publication-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'source'), site = path.join(directory, 'site');
  fs.mkdirSync(source); fs.mkdirSync(site);
  execFileSync('git', ['init', '-q'], { cwd: source });
  for (const asset of assets) {
    fs.mkdirSync(path.dirname(path.join(source, asset)), { recursive: true });
    fs.writeFileSync(path.join(source, asset), 'committed print survey fixture: ' + asset);
  }
  execFileSync('git', ['add', '.'], { cwd: source });
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'fixture'], { cwd: source });
  for (const file of ['index.html', '404.html', 'js/release-receipt.js', 'examlibrary/index.html', 'ourdocs/index.html', 'preview/index.html', 'memo/config.js', 'hub/index.html', 'bug/index.html']) {
    fs.mkdirSync(path.dirname(path.join(site, file)), { recursive: true });
    fs.writeFileSync(path.join(site, file), 'preserve original bytes: ' + file);
  }
  return { source, site, base: { sourceCommit: 'a'.repeat(40), files: inventory(site) } };
}

test('adds only the print survey while preserving every original file', t => {
  const { source, site, base } = fixture(t);
  const receipt = appendRoute(site, base, source);
  assert.equal(verifyRoute(site, receipt), Object.keys(base.files).length + assets.length);
  for (const [file, hash] of Object.entries(base.files)) assert.equal(receipt.files[file], hash);
  fs.writeFileSync(path.join(site, 'private.txt'), 'must not be published');
  assert.throws(() => verifyRoute(site, receipt), /inventory changed/);
});

test('refuses a changed base before adding the route', t => {
  const { source, site, base } = fixture(t);
  fs.writeFileSync(path.join(site, 'index.html'), 'changed');
  assert.throws(() => appendRoute(site, base, source), /Publication changed: index.html/);
});

test('refuses uncommitted survey edits', t => {
  const { source, site, base } = fixture(t);
  fs.writeFileSync(path.join(source, 'print/index.html'), 'edited after commit');
  assert.throws(() => appendRoute(site, base, source), /Uncommitted route input/);
});
