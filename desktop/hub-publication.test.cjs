const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const { assets, appendRoute, verifyRoute } = require('../scripts/hub-publication.cjs');
const { inventory } = require('../scripts/web-release.cjs');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), '5e-hub-publication-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'source'), site = path.join(directory, 'site');
  fs.mkdirSync(source); fs.mkdirSync(site);
  execFileSync('git', ['init', '-q'], { cwd: source });
  for (const asset of assets) {
    fs.mkdirSync(path.dirname(path.join(source, asset)), { recursive: true });
    fs.writeFileSync(path.join(source, asset), 'committed hub fixture: ' + asset);
  }
  execFileSync('git', ['add', '.'], { cwd: source });
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'fixture'], { cwd: source });
  for (const file of ['index.html', '404.html', 'js/release-receipt.js', 'examlibrary/index.html', 'ourdocs/index.html', 'preview/index.html', 'mobile/index.html', 'memo/config.js', 'memo/app.js']) {
    fs.mkdirSync(path.dirname(path.join(site, file)), { recursive: true });
    fs.writeFileSync(path.join(site, file), 'preserve original bytes: ' + file);
  }
  const base = { sourceCommit: 'a'.repeat(40), files: inventory(site) };
  return { source, site, base };
}

test('adds only the hub and DocFinder entry while preserving every original file', t => {
  const { source, site, base } = fixture(t);
  const receipt = appendRoute(site, base, source);
  assert.equal(verifyRoute(site, receipt), Object.keys(base.files).length + assets.length);
  for (const [file, hash] of Object.entries(base.files)) assert.equal(receipt.files[file], hash);
  fs.writeFileSync(path.join(site, 'private.txt'), 'must not be published');
  assert.throws(() => verifyRoute(site, receipt), /inventory changed/);
});

test('refuses changed base files before adding any routes', t => {
  const { source, site, base } = fixture(t);
  fs.writeFileSync(path.join(site, 'index.html'), 'different release');
  assert.throws(() => appendRoute(site, base, source), /Publication changed: index.html/);
  assert.equal(fs.existsSync(path.join(site, 'hub')), false);
});

test('refuses an uncommitted hub asset before changing the publication', t => {
  const { source, site, base } = fixture(t);
  fs.writeFileSync(path.join(source, 'hub/app.js'), 'dirty source');
  assert.throws(() => appendRoute(site, base, source), /Uncommitted route input/);
  assert.deepEqual(inventory(site), base.files);
});

test('does not allow a forged receipt to change unrelated services', t => {
  const { source, site, base } = fixture(t);
  const receipt = appendRoute(site, base, source);
  fs.writeFileSync(path.join(site, 'ourdocs/index.html'), 'changed existing service');
  assert.throws(() => verifyRoute(site, { ...receipt, files: inventory(site) }), /Existing file changed/);
});

test('rejects symlinked route input and an incomplete published base', t => {
  const { source, site, base } = fixture(t);
  const input = path.join(source, 'hub/style.css');
  fs.unlinkSync(input);
  fs.symlinkSync('app.js', input);
  assert.throws(() => appendRoute(site, base, source), /Only ordinary hub files/);
  assert.deepEqual(inventory(site), base.files);
  fs.unlinkSync(path.join(site, 'ourdocs/index.html'));
  assert.throws(() => appendRoute(site, { ...base, files: inventory(site) }, source), /Incomplete published base/);
});
