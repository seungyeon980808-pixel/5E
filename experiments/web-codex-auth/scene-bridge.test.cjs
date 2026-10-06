const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Session } = require('./session.cjs');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
class Fake extends EventEmitter {
  constructor() { super(); this.directory = '/tmp'; this.calls = []; }
  async init() {}
  async rpc(method, params) {
    this.calls.push({ method, params });
    if (method === 'account/read') return { account: { type: 'chatgpt' } };
    if (method === 'model/list') return { data: [
      { model: 'gpt-6.1-sol', supportedReasoningEfforts: [{ reasoningEffort: 'medium' }], serviceTiers: ['priority'] },
      { model: 'gpt-6-luna', supportedReasoningEfforts: [{ reasoningEffort: 'medium' }], serviceTiers: ['priority'] }] };
    if (method === 'thread/start') return { thread: { id: 'native-thread' } };
    if (method === 'turn/start') return { turn: { id: 'native-turn' } };
    return {};
  }
  notify(method, params) { this.emit('notification', { method, params: { threadId: 'native-thread', turnId: 'native-turn', ...params } }); }
  close() { this.dead = true; }
}
const schema = { type: 'object', properties: { labels: { type: 'array', items: { type: 'string' } } }, required: ['labels'], additionalProperties: false };
const scene = { clientScope: 'labels', purpose: 'scene', text: '원본 라벨을 관찰해 JSON으로만 답한다.', attachments: [{ data: PNG }, { data: PNG }], model: 'gpt-6-luna', effort: 'medium', serviceTier: 'priority', outputSchema: schema };
async function until(fn) { for (let i = 0; i < 200; i++) { if (fn()) return; await new Promise(resolve => setTimeout(resolve, 5)); } assert.fail('Timeout'); }
async function started(runtime) { await until(() => runtime.calls.some(call => call.method === 'turn/start')); await new Promise(resolve => setTimeout(resolve, 5)); }
function setup(t) { const runtime = new Fake(); const session = new Session(runtime); t.after(() => session.close()); return { runtime, bridge: session.bridge }; }

test('scene turn runs Luna without image generation, forwards the JSON schema and returns one final answer', async t => {
  const { runtime, bridge } = setup(t);
  const sent = await bridge.call('send', scene);
  assert.equal(sent.purpose, 'scene');
  await started(runtime);
  const thread = runtime.calls.find(call => call.method === 'thread/start').params;
  assert.equal(thread.config['features.image_generation'], false);
  assert.match(thread.baseInstructions, /JSON scene planner/);
  const turn = runtime.calls.find(call => call.method === 'turn/start').params;
  assert.deepEqual(turn.outputSchema, schema);
  assert.equal(turn.model, 'gpt-6-luna'); assert.equal(turn.effort, 'medium'); assert.equal(turn.serviceTier, 'priority');
  assert.equal(turn.input[0].text, scene.text);
  assert.deepEqual(turn.input.slice(1).map(item => item.url), [PNG, PNG]);
  const early = await bridge.call('events', { clientScope: 'labels', cursor: 0 });
  assert.equal(early.events.length, 0, 'No image progress event is emitted for analysis turns');
  runtime.notify('item/completed', { item: { type: 'agentMessage', phase: 'commentary', text: '관찰 중' } });
  runtime.notify('item/completed', { item: { type: 'agentMessage', phase: 'final_answer', text: '{"labels":["전자"]}' } });
  runtime.notify('turn/completed', { turn: { id: 'native-turn', status: 'completed' } });
  await until(() => bridge.scopes.get('labels').generation.isReleasable());
  const { events } = await bridge.call('events', { clientScope: 'labels', cursor: 0 });
  assert.deepEqual(events.map(e => e.method), ['item/completed', 'turn/completed']);
  assert.equal(events[0].params.item.type, 'agentMessage');
  assert.equal(events[0].params.item.phase, 'final_answer');
  assert.equal(events[0].params.item.text, '{"labels":["전자"]}');
  assert.equal(events[1].params.turn.status, 'completed');
  assert.ok(!events.some(e => e.params.item?.type === 'imageGeneration'));
  const next = await bridge.call('send', { ...scene, outputSchema: undefined });
  assert.notEqual(next.turnId, sent.turnId, 'The same workspace can continue after the analysis turn finished');
});

test('scene turn fails closed on image generation, empty answers and unsuccessful turns', async t => {
  for (const [label, act, message] of [
    ['image', runtime => runtime.notify('item/started', { item: { id: 'img', type: 'imageGeneration' } }), /이미지 생성이 감지/],
    ['empty', runtime => runtime.notify('turn/completed', { turn: { id: 'native-turn', status: 'completed' } }), /비어 있습니다/],
    ['failed', runtime => runtime.notify('turn/completed', { turn: { id: 'native-turn', status: 'failed', error: { message: 'model failure' } } }), /model failure/],
  ]) {
    const { runtime, bridge } = setup(t);
    await bridge.call('send', scene);
    await started(runtime);
    act(runtime);
    if (label === 'image') { await until(() => runtime.calls.some(call => call.method === 'turn/interrupt')); runtime.notify('turn/completed', { turn: { id: 'native-turn', status: 'interrupted' } }); }
    await until(() => bridge.scopes.get('labels').generation.isReleasable());
    const { events } = await bridge.call('events', { clientScope: 'labels', cursor: 0 });
    assert.deepEqual(events.map(e => e.method), ['turn/completed'], label);
    assert.equal(events[0].params.turn.status, 'failed', label);
    assert.match(events[0].params.turn.error.message, message, label);
  }
});

test('scene validation rejects unsupported purposes, misplaced or malformed schemas before any model call', async t => {
  const { runtime, bridge } = setup(t);
  const reject = async (body, status) => { await assert.rejects(bridge.call('send', body), error => error.status === status); };
  await reject({ ...scene, purpose: 'chat' }, 422);
  await reject({ ...scene, purpose: 'image' }, 400);
  await reject({ ...scene, outputSchema: [] }, 400);
  await reject({ ...scene, outputSchema: { big: 'x'.repeat(200001) } }, 413);
  await reject({ ...scene, model: 'unknown-model' }, 422);
  assert.ok(!runtime.calls.some(call => ['thread/start', 'turn/start'].includes(call.method)));
});

test('scene turn can be cancelled and reports an interrupted turn', async t => {
  const { runtime, bridge } = setup(t);
  await bridge.call('send', scene);
  await started(runtime);
  const interrupting = bridge.call('interrupt', { clientScope: 'labels' });
  await until(() => runtime.calls.some(call => call.method === 'turn/interrupt'));
  await interrupting;
  await until(() => bridge.scopes.get('labels').generation.isReleasable());
  const { events } = await bridge.call('events', { clientScope: 'labels', cursor: 0 });
  assert.equal(events.at(-1).params.turn.status, 'interrupted');
  assert.ok(!events.some(e => e.method === 'item/completed'));
});

