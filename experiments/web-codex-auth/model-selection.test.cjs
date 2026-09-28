const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Session } = require('./session.cjs');
const { GlobalGenerationScheduler } = require('./global-generation-scheduler.cjs');
const { writeFileSync } = require('node:fs');
const catalog = [
  { model: 'gpt-6-sol', isDefault: true, defaultReasoningEffort: 'medium', supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'medium' }], serviceTiers: ['priority'] },
  { model: 'gpt-6-luna', supportedReasoningEfforts: [{ reasoningEffort: 'low' }], serviceTiers: ['priority'] },
  { model: 'hidden-model', hidden: true, supportedReasoningEfforts: [{ reasoningEffort: 'low' }] },
];
class Runtime extends EventEmitter {
  constructor() { super(); this.directory = '/tmp'; this.calls = []; }
  async init() {}
  async rpc(method, params) {
    this.calls.push({ method, params });
    if (method === 'account/read') return { account: { type: 'chatgpt' } };
    if (method === 'model/list') return params.cursor ? { data: catalog.slice(1), nextCursor: null } : { data: catalog.slice(0, 1), nextCursor: 'page-2' };
    if (method === 'thread/start') return { thread: { id: `thread-${this.calls.length}` } };
    if (method === 'turn/start') return { turn: { id: `turn-${this.calls.length}` } };
    return {};
  }
  close() {}
}
const payload = { clientScope: 'first', purpose: 'image', text: 'A science diagram', attachments: [], model: 'gpt-6-luna', effort: 'low', serviceTier: 'priority' };
async function until(fn) { for (let i = 0; i < 100; i++) { if (fn()) return; await new Promise(resolve => setTimeout(resolve, 5)); } assert.fail('RPC did not start'); }
test('selected Luna low priority and Sol standard reach both RPCs; queued selection remains immutable', async t => {
  const runtime = new Runtime();
  const session = new Session(runtime, { generationScheduler: new GlobalGenerationScheduler({ maxRunning: 1 }) });
  t.after(() => session.close());
  const first = await session.bridge.call('send', payload);
  await until(() => runtime.calls.some(call => call.method === 'turn/start'));
  const queuedBody = { ...payload, clientScope: 'second', model: 'gpt-6-sol', effort: 'medium', serviceTier: null };
  const second = await session.bridge.call('send', queuedBody);
  assert.equal(session.snapshotGeneration(second.turnId).state, 'queued');
  Object.assign(queuedBody, { model: 'hidden-model', effort: 'ultra', serviceTier: 'flex' });
  await session.cancelGeneration(first.turnId);
  await until(() => runtime.calls.filter(call => call.method === 'turn/start').length === 2);
  const threads = runtime.calls.filter(call => call.method === 'thread/start').map(call => call.params);
  const turns = runtime.calls.filter(call => call.method === 'turn/start').map(call => call.params);
  assert.deepEqual(threads.map(({ model, serviceTier }) => ({ model, serviceTier })), [{ model: 'gpt-6-luna', serviceTier: 'priority' }, { model: 'gpt-6-sol', serviceTier: null }]);
  assert.deepEqual(turns.map(({ model, effort, serviceTier }) => ({ model, effort, serviceTier })), [{ model: 'gpt-6-luna', effort: 'low', serviceTier: 'priority' }, { model: 'gpt-6-sol', effort: 'medium', serviceTier: null }]);
  if (process.env.MODEL_SELECTION_TRACE) writeFileSync(process.env.MODEL_SELECTION_TRACE, JSON.stringify({ fixture: 'synthetic model catalog; real Session/Bridge/Generation/Scheduler', generationCallsToProvider: 0, calls: runtime.calls }, null, 2));
});
test('unsupported or hidden selections reject before any generation job or RPC', async t => {
  const runtime = new Runtime(); const session = new Session(runtime); t.after(() => session.close());
  for (const override of [{ model: 'missing' }, { model: 'hidden-model' }, { effort: 'ultra' }, { effort: null }, { serviceTier: 'flex' }, { model: '' }]) {
    await assert.rejects(session.bridge.call('send', { ...payload, ...override }), error => error.status === 422);
  }
  assert.equal(session.generations.jobs.size, 0);
  assert.equal(runtime.calls.some(call => ['thread/start', 'turn/start'].includes(call.method)), false);
});
test('model catalog includes all visible pages and supplies authoritative defaults', async t => {
  const runtime = new Runtime(); const session = new Session(runtime); t.after(() => session.close());
  const models = await session.bridge.call('models', { clientScope: 'first' });
  assert.deepEqual(models.data.map(model => model.model), ['gpt-6-sol', 'gpt-6-luna']);
  await session.bridge.call('send', { clientScope: 'first', purpose: 'image', text: 'diagram', attachments: [] });
  await until(() => runtime.calls.some(call => call.method === 'turn/start'));
  const turn = runtime.calls.find(call => call.method === 'turn/start').params;
  assert.equal(turn.model, 'gpt-6-sol'); assert.equal(turn.effort, 'medium'); assert.equal(turn.serviceTier, null);
});
test('concurrent sends in the same workspace reserve the scope before catalog validation', async t => {
  const runtime = new Runtime(); const session = new Session(runtime); t.after(() => session.close());
  const results = await Promise.allSettled([session.bridge.call('send', payload), session.bridge.call('send', payload)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
  assert.equal(session.generations.jobs.size, 1);
});
test('legacy generate uses the same runtime defaults and validates before adding a job', async t => {
  const runtime = new Runtime(); const session = new Session(runtime); t.after(() => session.close());
  await session.generate({ request: 'diagram' });
  await until(() => runtime.calls.some(call => call.method === 'turn/start'));
  const turn = runtime.calls.find(call => call.method === 'turn/start').params;
  assert.equal(turn.model, 'gpt-6-sol'); assert.equal(turn.effort, 'medium'); assert.equal(turn.serviceTier, null);
});
test('real HTTP bridge forwards accepted selections and returns 422 before inference for unsupported selections', async t => {
  const runtime = new Runtime();
  const server = require('./server.cjs').createServer({ runtimeFactory: () => runtime });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let cookie;
  const post = (route, body) => fetch(`${origin}/api/${route}`, { method: 'POST', headers: { Origin: origin, 'X-5E-Request': '1', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  const session = await post('session', {});
  cookie = session.headers.get('set-cookie').split(';')[0];
  const rejected = await post('bridge-send', { ...payload, model: 'hidden-model' });
  assert.equal(rejected.status, 422);
  assert.equal(runtime.calls.some(call => call.method === 'thread/start'), false);
  assert.equal((await post('bridge-send', payload)).status, 200);
  await until(() => runtime.calls.some(call => call.method === 'turn/start'));
  const turn = runtime.calls.find(call => call.method === 'turn/start').params;
  assert.equal(turn.model, payload.model); assert.equal(turn.effort, payload.effort); assert.equal(turn.serviceTier, payload.serviceTier);
});
