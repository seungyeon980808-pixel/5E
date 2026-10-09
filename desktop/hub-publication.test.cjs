const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const { assets, appendRoute, verifyRoute } = require('../scripts/hub-publication.cjs');
const { inventory } = require('../scripts/web-release.cjs');
const vm = require('node:vm');
const YAML = require('js-yaml');

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

test('a later memo release accepts a validated Hub base and still rejects a stale publication', () => {
  const workflow = YAML.load(fs.readFileSync(path.join(__dirname, '../.github/workflows/memo-route.yml'), 'utf8'));
  const step = workflow.jobs.validate.steps.find(entry => entry.name === 'Verify the current published base');
  const script = step.run.match(/node - <<'NODE'\n([\s\S]*?)\nNODE/)[1];
  const run = { status: 'completed', conclusion: 'success', head_branch: 'main', path: '.github/workflows/hub-route.yml' };
  const execute = latestRun => vm.runInNewContext(script, {
    process: { env: { BASE_RUN: '123', GITHUB_REPOSITORY: 'fixture/5E' } },
    require: name => {
      assert.equal(name, 'node:child_process');
      return { execFileSync: (_command, args) => {
        const endpoint = args[1];
        if (endpoint.endsWith('/actions/runs/123')) return JSON.stringify(run);
        if (endpoint.includes('/jobs?')) return JSON.stringify({ jobs: [{ name: 'validate', conclusion: 'success' }, { name: 'publish', conclusion: 'success' }] });
        if (endpoint.includes('/deployments?')) return JSON.stringify([{ id: 1 }]);
        if (endpoint.includes('/statuses?')) return JSON.stringify([{ state: 'success', log_url: `https://github.com/fixture/5E/actions/runs/${latestRun}/job/1` }]);
        throw new Error(`Unexpected API request: ${endpoint}`);
      } };
    },
  });
  assert.doesNotThrow(() => execute('123'));
  assert.throws(() => execute('124'), /latest successful Pages publication/);
  run.head_branch = 'unreviewed-branch';
  assert.throws(() => execute('123'), /Successful route publication required/);
});
