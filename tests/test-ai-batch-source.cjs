const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const load = name => import(pathToFileURL(path.resolve(__dirname, '../preview/js', name)).href);
const source = length => {
  const bytes = Buffer.alloc(length, 19);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  return { dataUrl: 'data:image/png;base64,' + bytes.toString('base64') };
};
const entry = (id, dataUrl) => ({ scope: { sessionId: 'batch-size', workspaceId: `workspace-${id}` }, taskId: id,
  snapshot: { dataUrl, revisionId: `original-${id}`, operation: 'generate', model: 'sol', options: {} } });
async function fixture(preflight = () => null) {
  const { createWorkspaceBatch } = await load('ai-workspace-batch.js');
  const { createMemoryBatchStore } = await load('ai-batch-store.js');
  const starts = [], store = createMemoryBatchStore(), scope = { sessionId: 'batch-size', workspaceId: 'host' };
  const batch = createWorkspaceBatch({ scope, store, preflight, runner: { start(context) { starts.push(context); } }, commit: async () => {} });
  return { batch, store, scope, starts };
}
test('two ordinary sources above 1MiB enqueue unchanged and survive persisted recovery', async () => {
  const dataUrl = source(2_000_000).dataUrl;
  const f = await fixture();
  const report = f.batch.prepare([entry('a', dataUrl), entry('b', dataUrl)]);
  assert.equal(report.eligible, true, JSON.stringify(report.issues));
  await f.batch.launch(report);
  assert.equal(f.starts.length, 2);
  assert.ok(f.starts.every(context => context.snapshot.dataUrl === dataUrl));
  const stored = await f.store.load(f.scope);
  assert.equal(stored.length, 2);
  assert.ok(stored.every(job => job.sourceSnapshot.dataUrl === dataUrl));
  const { createWorkspaceBatch } = await load('ai-workspace-batch.js');
  const recovered = createWorkspaceBatch({ scope: f.scope, store: f.store, preflight: () => null, runner: { start() {} }, commit: async () => {} });
  assert.equal((await recovered.recover()).length, 2);
  assert.ok((await recovered.list()).every(job => job.sourceSnapshot.dataUrl === dataUrl));
  await recovered.dispose(); await f.batch.dispose();
});
test('8MB source boundary fits actual 11M-character bridge and 12MB record cap remains enforced', async () => {
  const { parseBatchSource } = await load('ai-batch-source.js');
  const maximum = source(8_000_000);
  assert.ok(maximum.dataUrl.length <= 11_000_000);
  assert.equal(parseBatchSource(maximum, {}).snapshot.dataUrl, maximum.dataUrl);
  assert.throws(() => parseBatchSource(source(8_000_001), {}), /8MB/);
  const small = source(8);
  const baseSize = Buffer.byteLength(JSON.stringify({ sourceSnapshot: small, options: { padding: '' } }));
  assert.doesNotThrow(() => parseBatchSource(small, { padding: 'x'.repeat(12_000_000 - baseSize) }));
  assert.throws(() => parseBatchSource(small, { padding: 'x'.repeat(12_000_001 - baseSize) }), /12MB/);
});
test('malformed, oversized, and stale selections reject the entire batch without partial success', async () => {
  const f = await fixture(value => value.taskId === 'stale' ? '원래 작업을 찾을 수 없습니다.' : null);
  for (const invalid of [
    entry('bad', 'data:image/png;base64,AAAA'),
    entry('bad', 'data:image/png;base64,iVBORw0KGgo=!'),
    entry('bad', source(8_000_001).dataUrl),
    { ...entry('bad', source(8).dataUrl), snapshot: { ...entry('bad', source(8).dataUrl).snapshot, options: { padding: 'x'.repeat(12_000_000) } } },
    entry('stale', source(8).dataUrl),
  ]) {
    const report = f.batch.prepare([entry('valid', source(1_100_000).dataUrl), invalid]);
    assert.equal(report.eligible, false);
    assert.deepEqual(report.issues.map(issue => issue.index), [1]);
    await assert.rejects(f.batch.launch(report), /ineligible/);
    assert.equal(f.starts.length, 0);
    assert.deepEqual(await f.batch.list(), []);
    assert.deepEqual(await f.store.load(f.scope), []);
  }
  await f.batch.dispose();
});
