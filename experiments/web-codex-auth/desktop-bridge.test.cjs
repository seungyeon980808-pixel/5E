const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Session } = require('./session.cjs');
const { createServer } = require('./server.cjs');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
class Fake extends EventEmitter {
  constructor() { super(); this.directory = '/tmp'; this.calls = []; this.signedIn = true; }
  async init() {}
  async rpc(method, params) {
    this.calls.push({ method, params });
    if (method === 'account/read') return { account: this.signedIn ? { type: 'chatgpt' } : null };
    if (method === 'model/list') return { data: [{ model: 'gpt-5.6-sol' }] };
    if (method === 'thread/start') return { thread: { id: 'native-thread' } };
    if (method === 'turn/start') return { turn: { id: 'native-turn' } };
    return {};
  }
  close() { this.dead = true; }
}
const payload = { clientScope: 'work-a', purpose: 'image', text: 'Preserve this exact edit request.', attachments: [{ data: PNG }], model: 'gpt-5.6-sol', effort: 'medium', serviceTier: 'priority' };
async function until(fn) { for (let i = 0; i < 100; i++) { if (fn()) return; await new Promise(resolve => setTimeout(resolve, 5)); } assert.fail('Timeout'); }
test('native UI transport preserves prompt, isolates workspaces and emits one raw PNG before completion', async t => {
  const runtime = new Fake(); const session = new Session(runtime); t.after(() => session.close());
  const bridge = session.bridge;
  assert.equal((await bridge.call('status', payload)).server, true);
  assert.deepEqual(await bridge.call('models', payload), { data: [{ model: 'gpt-5.6-sol' }] });
  const sent = await bridge.call('send', payload);
  assert.equal(sent.renderThreadId, sent.turnId);
  const generation = session.generations.generation(sent.turnId);
  await until(() => generation.job.turnId);
  const native = runtime.calls.find(call => call.method === 'turn/start').params;
  assert.equal(native.input[0].text, payload.text);
  assert.equal(native.input[1].url, PNG);
  assert.equal(native.model, payload.model);
  assert.equal(native.effort, payload.effort);
  assert.equal(native.serviceTier, payload.serviceTier);
  assert.deepEqual(await bridge.call('events', { clientScope: 'work-b', cursor: 0 }), { events: [], cursor: 0 });
  const second = await bridge.call('send', { ...payload, clientScope: 'work-b' });
  assert.notEqual(second.turnId, sent.turnId);
  await bridge.call('interrupt', { clientScope: 'work-b' });
  assert.equal(generation.job.state, 'running');
  const started = await bridge.call('events', { clientScope: 'work-a', cursor: 0 });
  assert.equal(started.events[0].method, 'item/started');
  await generation.event({ method: 'item/completed', params: { threadId: 'native-thread', turnId: 'native-turn', item: { type: 'imageGeneration', id: 'img', result: PNG } } });
  const completed = await bridge.call('events', { clientScope: 'work-a', cursor: started.cursor });
  assert.deepEqual(completed.events.map(event => event.method), ['item/completed', 'turn/completed']);
  assert.equal(completed.events[0].params.item.imageDataUrl, PNG);
  assert.equal(completed.events[0].clientScope, 'work-a');
  assert.equal(completed.events[0].params.turnId, sent.turnId);
  assert.equal((await bridge.call('events', { clientScope: 'work-a', cursor: completed.cursor })).events.length, 0);
  await session.logout();
  assert.equal(bridge.scopes.size, 0);
});
test('native UI transport rejects unsupported workflows and altered settings before inference', async t => {
  const runtime = new Fake(); const session = new Session(runtime); t.after(() => session.close());
  for (const override of [{ purpose: 'chat' }, { model: 'other' }, { effort: 'high' }, { serviceTier: 'flex' }]) {
    await assert.rejects(session.bridge.call('send', { ...payload, ...override }), error => error.status === 422);
  }
  await assert.rejects(session.bridge.call('send', { ...payload, attachments: [{ data: 'file:///secret' }] }), error => error.status === 400);
  assert.equal(runtime.calls.some(call => call.method === 'turn/start'), false);
});
test('bridge HTTP endpoints require same-origin session and sign-in', async t => {
  const runtimes = [];
  const server = createServer({ runtimeFactory: () => { const runtime = new Fake(); runtimes.push(runtime); return runtime; } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body, cookie, requestOrigin = origin) => fetch(origin + '/api/' + route, { method: 'POST', headers: { Origin: requestOrigin, 'X-5E-Request': '1', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  assert.equal((await post('bridge-send', payload)).status, 401);
  const created = await post('session', {}); const cookie = created.headers.get('set-cookie').split(';')[0];
  assert.equal((await post('bridge-models', payload, cookie, 'https://evil.example')).status, 403);
  assert.equal((await post('bridge-models', payload, cookie)).status, 200);
  runtimes[0].signedIn = false;
  assert.equal((await post('bridge-status', payload, cookie)).status, 200);
  assert.equal((await post('bridge-send', payload, cookie)).status, 401);
  runtimes[0].signedIn = true;
  assert.equal((await post('bridge-send', { ...payload, attachments: [{ data: 'file:///secret' }] }, cookie)).status, 400);
});

test('queued lifecycle cursor remains valid after all four observable events', async t => {
  const runtime = new Fake();
  const session = new Session(runtime, {
    generationScheduler: new (require('./global-generation-scheduler.cjs').GlobalGenerationScheduler)({ maxRunning: 1 }),
    schedulerOwner: 'owner',
  });
  t.after(() => session.close());
  const first = await session.bridge.call('send', payload);
  const queued = await session.bridge.call('send', { ...payload, clientScope: 'work-b' });
  assert.equal((await session.bridge.call('events', { clientScope: 'work-b', cursor: 0 })).cursor, 1);
  await session.cancelGeneration(first.turnId);
  const generation = session.generations.generation(queued.turnId);
  await until(() => generation.job.turnId);
  await generation.event({ method: 'item/completed', params: {
    threadId: generation.job.threadId,
    turnId: generation.job.turnId,
    item: { type: 'imageGeneration', id: 'queued-image', result: PNG },
  } });
  const terminal = await session.bridge.call('events', { clientScope: 'work-b', cursor: 1 });
  assert.equal(terminal.cursor, 4);
  assert.deepEqual(await session.bridge.call('events', { clientScope: 'work-b', cursor: terminal.cursor }), {
    events: [], cursor: 4,
  });
});

test('cancel and failure each emit one terminal event and retry only after an explicit new send', async t => {
  const runtime = new Fake();
  const session = new Session(runtime);
  t.after(() => session.close());
  const cancelled = await session.bridge.call('send', payload);
  await until(() => session.generations.generation(cancelled.turnId).job.turnId);
  await session.bridge.call('interrupt', { clientScope: payload.clientScope });
  await session.bridge.call('interrupt', { clientScope: payload.clientScope });
  const cancelEvents = await session.bridge.call('events', { clientScope: payload.clientScope, cursor: 0 });
  assert.equal(cancelEvents.events.filter(event => event.method === 'turn/completed').length, 1);
  assert.equal(cancelEvents.events.find(event => event.method === 'turn/completed').params.turn.status, 'interrupted');
  const cancelledRetry = await session.bridge.call('send', payload);
  assert.notEqual(cancelledRetry.turnId, cancelled.turnId);
  assert.equal(session.snapshotGeneration(cancelled.turnId).state, 'cancelled');

  const failedPayload = { ...payload, clientScope: 'failed-work' };
  const failed = await session.bridge.call('send', failedPayload);
  const generation = session.generations.generation(failed.turnId);
  await until(() => generation.job.turnId);
  runtime.emit('notification', { method: 'turn/completed', params: {
    threadId: generation.job.threadId, turn: { id: generation.job.turnId },
  } });
  await until(() => generation.job.state === 'failed');
  const startsBeforeRetry = runtime.calls.filter(call => call.method === 'turn/start').length;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(runtime.calls.filter(call => call.method === 'turn/start').length, startsBeforeRetry);
  const failedRetry = await session.bridge.call('send', failedPayload);
  assert.notEqual(failedRetry.turnId, failed.turnId);
  assert.equal(session.snapshotGeneration(failed.turnId).state, 'failed');
});
