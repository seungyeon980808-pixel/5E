const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const { assets, appendRoute, verifyRoute, readiness } = require('../scripts/bug-publication.cjs');
const { inventory } = require('../scripts/web-release.cjs');
const vm = require('node:vm');
const YAML = require('js-yaml');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), '5e-bug-publication-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'source'), site = path.join(directory, 'site');
  fs.mkdirSync(source); fs.mkdirSync(site);
  execFileSync('git', ['init', '-q'], { cwd: source });
  for (const asset of assets) {
    fs.mkdirSync(path.dirname(path.join(source, asset)), { recursive: true });
    fs.writeFileSync(path.join(source, asset), asset === 'bug/config.js' ? "export const BUG_BOARD_API = location ? 'https://5e-bug-api.5e-desktop.workers.dev/api/bug-board' : '/api/bug-board';\n" : 'committed bug board fixture: ' + asset);
  }
  execFileSync('git', ['add', '.'], { cwd: source });
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'fixture'], { cwd: source });
  for (const file of ['index.html', '404.html', 'js/release-receipt.js', 'examlibrary/index.html', 'ourdocs/index.html', 'preview/index.html', 'mobile/index.html', 'memo/config.js', 'memo/app.js', 'hub/index.html']) {
    fs.mkdirSync(path.dirname(path.join(site, file)), { recursive: true });
    fs.writeFileSync(path.join(site, file), 'preserve original bytes: ' + file);
  }
  const base = { sourceCommit: 'a'.repeat(40), files: inventory(site) };
  return { source, site, base };
}

test('adds only the bug board screen files while preserving every original file', t => {
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
  assert.equal(fs.existsSync(path.join(site, 'bug')), false);
});

test('refuses an uncommitted bug board asset before changing the publication', t => {
  const { source, site, base } = fixture(t);
  fs.writeFileSync(path.join(source, 'bug/board.js'), 'dirty source');
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
  const input = path.join(source, 'bug/board.css');
  fs.unlinkSync(input);
  fs.symlinkSync('board.js', input);
  assert.throws(() => appendRoute(site, base, source), /Only ordinary bug board files/);
  assert.deepEqual(inventory(site), base.files);
  fs.unlinkSync(path.join(site, 'ourdocs/index.html'));
  assert.throws(() => appendRoute(site, { ...base, files: inventory(site) }, source), /Incomplete published base/);
});

for (const workflowName of ['memo-route.yml', 'hub-route.yml', 'bug-route.yml']) test(`${workflowName} accepts a validated Bug Route base and still rejects a stale publication`, () => {
  const workflow = YAML.load(fs.readFileSync(path.join(__dirname, '../.github/workflows/' + workflowName), 'utf8'));
  const step = workflow.jobs.validate.steps.find(entry => entry.name === 'Verify the current published base');
  const script = step.run.match(/node - <<'NODE'\n([\s\S]*?)\nNODE/)[1];
  const run = { status: 'completed', conclusion: 'success', head_branch: 'main', path: '.github/workflows/bug-route.yml' };
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

test('server code, schema and Worker never become public assets', () => {
  for (const file of ['bug/api.mjs', 'bug/store.mjs', 'bug/schema.sql', 'bug/worker/index.mjs', 'bug/worker/wrangler.jsonc']) {
    assert.equal(assets.includes(file), false, file);
  }
});

test('readiness requires a working public Worker that rejects foreign writes', async t => {
  const { site } = fixture(t);
  fs.mkdirSync(path.join(site, 'bug'), { recursive: true });
  fs.writeFileSync(path.join(site, 'bug/config.js'), "export const BUG_BOARD_API = 'https://5e-bug-api.5e-desktop.workers.dev/api/bug-board';\n");
  const healthy = async (url, init = {}) => {
    const origin = init.headers?.Origin;
    if (init.method === 'POST') return new Response('{}', { status: 403 });
    if (origin !== 'https://www.5e.ai.kr') return new Response('{}', { status: 403 });
    return new Response(JSON.stringify({ faqs: [] }), { headers: { 'Access-Control-Allow-Origin': origin } });
  };
  assert.equal(await readiness(site, healthy), 'https://5e-bug-api.5e-desktop.workers.dev/api/bug-board');
  const notReady = async () => new Response(JSON.stringify({ error: '준비 중' }), { status: 503 });
  await assert.rejects(readiness(site, notReady), /not ready/);
  const open = async (url, init = {}) => init.method === 'POST' ? new Response('{}', { status: 201 }) : healthy(url, init);
  await assert.rejects(readiness(site, open), /reject writes/);
  fs.writeFileSync(path.join(site, 'bug/config.js'), "export const BUG_BOARD_API = '/api/bug-board';\n");
  await assert.rejects(readiness(site, healthy), /public Worker/);
});

test('Bug Route normalizes a 1.7.0 Preview base receipt before reading it', () => {
  const workflow = YAML.load(fs.readFileSync(path.join(__dirname, '../.github/workflows/bug-route.yml'), 'utf8'));
  const steps = workflow.jobs.validate.steps;
  const normalize = steps.findIndex(step => /normalizePublicationReceipt\('_work\/bug-base-receipt'\)/.test(step.run || ''));
  const firstRead = steps.findIndex(step => /_work\/bug-base-receipt\/receipt\.json/.test(step.run || ''));
  assert.ok(normalize >= 0 && normalize < firstRead, 'receipt normalization must run before the base receipt is read');
  const { normalizePublicationReceipt } = require('../scripts/publication-receipt.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), '5e-bug-receipt-'));
  try {
    fs.mkdirSync(path.join(directory, 'preview-publication'));
    fs.writeFileSync(path.join(directory, 'preview-publication/receipt.json'), '{"files":{}}');
    assert.equal(fs.readFileSync(normalizePublicationReceipt(directory), 'utf8'), '{"files":{}}');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
