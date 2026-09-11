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
  await until(() => session.generation.job.turnId);
  const native = runtime.calls.find(call => call.method === 'turn/start').params;
  assert.equal(native.input[0].text, payload.text);
  assert.equal(native.input[1].url, PNG);
  assert.equal(native.model, payload.model);
  assert.equal(native.effort, payload.effort);
  assert.equal(native.serviceTier, payload.serviceTier);
  assert.deepEqual(await bridge.call('events', { clientScope: 'work-b', cursor: 0 }), { events: [], cursor: 0 });
  await assert.rejects(bridge.call('send', { ...payload, clientScope: 'work-b' }), error => error.status === 409);
  await bridge.call('interrupt', { clientScope: 'work-b' });
  assert.equal(session.generation.job.state, 'running');
  const started = await bridge.call('events', { clientScope: 'work-a', cursor: 0 });
  assert.equal(started.events[0].method, 'item/started');
  await session.generation.event({ method: 'item/completed', params: { threadId: 'native-thread', turnId: 'native-turn', item: { type: 'imageGeneration', id: 'img', result: PNG } } });
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
