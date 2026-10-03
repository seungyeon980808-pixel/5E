const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const YAML = require('js-yaml');
const { inventory, verifyArtifact, stage } = require('../scripts/web-release.cjs');

function fixture(t) {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), '5e-web-publication-'));
  t.after(() => fs.rmSync(site, { recursive: true, force: true }));
  fs.writeFileSync(path.join(site, 'index.html'), '<title>5E 1.6.1</title><strong data-release-version>v1.6.1</strong>');
  fs.writeFileSync(path.join(site, 'app.js'), 'console.log("candidate");');
  const receipt = { version: '1.6.1', sourceCommit: 'a'.repeat(40), sourceDirty: false, files: inventory(site) };
  return { site, receipt };
}

test('publication verifies the same SHA and exact file set, including refusal of added or changed code', t => {
  const { site, receipt } = fixture(t);
  assert.equal(verifyArtifact(site, receipt, { expectedSha: 'a'.repeat(40), requireClean: true }), 2);
  assert.throws(() => verifyArtifact(site, receipt, { expectedSha: 'b'.repeat(40) }), /workflow SHA/);
  assert.throws(() => verifyArtifact(site, receipt, { expectedVersion: '1.6.0' }), /version differs/);
  assert.throws(() => verifyArtifact(site, { ...receipt, version: undefined }), /release version/);
  assert.throws(() => verifyArtifact(site, { ...receipt, sourceDirty: true }, { requireClean: true }), /Dirty/);
  assert.throws(() => verifyArtifact(site, { ...receipt, sourceDirty: undefined }, { requireClean: true }), /unverified/);
  fs.writeFileSync(path.join(site, 'extra.js'), 'unvalidated');
  assert.throws(() => verifyArtifact(site, receipt), /inventory/);
  fs.unlinkSync(path.join(site, 'extra.js'));
  fs.writeFileSync(path.join(site, 'app.js'), 'changed');
  assert.throws(() => verifyArtifact(site, receipt), /changed after validation/);
});

test('a conflict or symlink cannot pass publication checks even with a freshly supplied receipt', t => {
  const { site } = fixture(t);
  fs.writeFileSync(path.join(site, 'app.js'), '<<<<<<< Updated upstream\nold\n=======\nnew\n>>>>>>> Stashed changes\n');
  assert.throws(() => inventory(site), /Unresolved conflict/);
  fs.unlinkSync(path.join(site, 'app.js'));
  fs.symlinkSync('index.html', path.join(site, 'alias.html'));
  assert.throws(() => inventory(site), /Symlink/);
});

test('production staging uses committed blobs and excludes ignored files while preserving pinned routes', t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), '5e-web-source-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const sourceRoot = path.join(temporary, 'source');
  fs.mkdirSync(sourceRoot);
  const git = args => execFileSync('git', args, { cwd: sourceRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(sourceRoot, file)), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, file), content);
  };
  git(['init']);
  write('index.html', '<title>5E 1.6.1</title><strong data-release-version>v1.6.1</strong>');
  write('CNAME', 'www.5e.ai.kr\n');
  write('js/app.js', 'const stable = true;');
  write('js/release-receipt.js', 'const release = { sourceCommit: null };');
  write('assets/public.txt', 'public');
  write('.gitignore', 'assets/private.txt\n');
  write('preview/index.html', '<title>5E 1.7.0</title>');
  write('mobile/index.html', '<title>5E mobile</title>');
  write('1.6.0/index.html', '<title>5E 1.6.0</title>');
  git(['add', '.']);
  const commit = () => git(['-c', 'user.name=Publication test', '-c', 'user.email=publication@example.invalid', 'commit', '-m', 'fixture']);
  commit();
  const preservedSha = git(['rev-parse', 'HEAD']);
  write('release-channels.json', JSON.stringify({ candidate: { version: '1.6.1' }, webPublication: { preservePreviewSourceSha: preservedSha } }));
  git(['add', 'release-channels.json']);
  commit();
  write('assets/private.txt', 'ignored local material must never be published');
  assert.equal(git(['status', '--porcelain']), '');
  const site = path.join(temporary, 'site');
  const receipt = stage({ output: site, preservedRoot: sourceRoot, sourceRoot });
  assert.equal(receipt.sourceDirty, false);
  assert.equal(receipt.version, '1.6.1');
  assert.equal(receipt.preservedRoutesCommit, preservedSha);
  assert.equal(receipt.sourceCommit, git(['rev-parse', 'HEAD']));
  assert.equal(fs.readFileSync(path.join(site, 'js/release-receipt.js'), 'utf8'), `const release = { sourceCommit: '${receipt.sourceCommit}' };`);
  assert.equal(fs.existsSync(path.join(site, 'assets/private.txt')), false);
  assert.equal(fs.readFileSync(path.join(site, 'preview/index.html'), 'utf8'), '<title>5E 1.7.0</title>');
  assert.equal(fs.readFileSync(path.join(site, 'mobile/index.html'), 'utf8'), '<title>5E mobile</title>');
  assert.equal(fs.readFileSync(path.join(site, '1.6.0/index.html'), 'utf8'), '<title>5E 1.6.0</title>');
  verifyArtifact(site, receipt, { expectedSha: receipt.sourceCommit, requireClean: true });
  fs.writeFileSync(path.join(site, 'js/release-receipt.js'), `const release = { sourceCommit: '${'a'.repeat(40)}' };`);
  assert.throws(() => verifyArtifact(site, { ...receipt, files: inventory(site) }), /Displayed source commit/);
  write('js/app.js', 'const stable = false;');
  assert.throws(() => stage({ output: path.join(temporary, 'dirty'), preservedRoot: sourceRoot, sourceRoot }), /exact source revision/);
  git(['restore', 'js/app.js']);
  write('preview/index.html', '<title>unexpected preview</title>');
  git(['add', 'preview/index.html']);
  commit();
  assert.throws(() => stage({ output: path.join(temporary, 'changed-preview'), preservedRoot: sourceRoot, sourceRoot }), /validated Git blob/);
});

test('web publication requires successful validation and a separate manual main-branch operation', () => {
  const source = fs.readFileSync(path.join(__dirname, '../.github/workflows/web-release.yml'), 'utf8');
  const workflow = YAML.load(source);
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.equal(workflow.on.workflow_dispatch.inputs.publish.default, false);
  assert.equal(workflow.jobs.publish.needs, 'validate');
  assert.match(workflow.jobs.publish.if, /inputs\.publish.*refs\/heads\/main/);
  assert.equal(workflow.jobs.publish.environment.name, 'github-pages');
  const steps = workflow.jobs.validate.steps;
  const build = steps.findIndex(step => /--preserved-root/.test(step.run || ''));
  const browser = steps.findIndex(step => /npm run test:web-artifact/.test(step.run || ''));
  const verify = steps.findIndex(step => /--verify --site/.test(step.run || ''));
  const upload = steps.findIndex(step => step.uses === 'actions/upload-pages-artifact@v3');
  assert.ok(build >= 0 && browser > build && verify > browser && upload > verify);
  assert.ok(steps.some(step => step.run === 'npm run test:unit'));
  assert.ok(steps.some(step => step.run === 'npm run test:browser'));
  assert.match(steps[browser].env.FIVE_E_SITE_ROOT, /web-release\/site$/);
  assert.deepEqual(workflow.jobs.publish.steps.map(step => step.uses), ['actions/deploy-pages@v4']);
});
