const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

function harness(fetch) {
  const timers = new Map();
  let serial = 0;
  const context = { window: {}, fetch, AbortController,
    setTimeout: (callback, delay) => { timers.set(++serial, { callback, delay }); return serial; },
    clearTimeout: id => timers.delete(id) };
  vm.runInNewContext(readFileSync(require.resolve('./editor-bridge.js'), 'utf8'), context);
  return { bridge: context.window.fiveEDesktop, timers };
}
const response = (body, ok = true) => ({ ok, json: async () => body });

test('capacity errors preserve HTTP status and explanation for the existing status UI', async () => {
  const message = '이미지 생성은 한 번에 최대 10개까지 실행할 수 있습니다.';
  const { bridge } = harness(async () => ({ ...response({ error: message }, false), status: 429 }));
  await assert.rejects(bridge.send({ clientScope: 'overflow' }), error => error.status === 429 && error.message === message);
});

test('poll failures carry the original error and turn ID only to the affected workspace', async () => {
  const { bridge, timers } = harness(async url => url.endsWith('bridge-send')
    ? response({ turnId: 'job-a', renderThreadId: 'job-a' })
    : response({ error: 'ChatGPT 계정을 먼저 연결해 주세요.' }, false));
  const events = [];
  bridge.onEvent(event => events.push(event));
  await bridge.send({ clientScope: 'workspace-a' });
  await [...timers.values()].find(timer => timer.delay === 0).callback();
  assert.equal(events.length, 1);
  assert.equal(events[0].clientScope, 'workspace-a');
  assert.equal(events[0].params.turnId, 'job-a');
  assert.equal(events[0].params.error.message, 'ChatGPT 계정을 먼저 연결해 주세요.');
});

test('a stalled HTTP request aborts and reports uncertain completion without retrying', async () => {
  let calls = 0;
  const { bridge, timers } = harness((_url, options) => {
    calls += 1;
    return new Promise((_resolve, reject) => options.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
  });
  const pending = bridge.send({ clientScope: 'workspace-b' });
  const timeout = [...timers.values()].find(timer => timer.delay === 30000);
  assert.ok(timeout, 'HTTP requests must have a bounded wait');
  timeout.callback();
  await assert.rejects(pending, /응답 확인 시간이 초과.*자동.*다시 요청하지/);
  assert.equal(calls, 1);
  assert.equal(timers.size, 0);
});

test('ten workspace transports poll independently and cancelling one preserves the other nine', async () => {
  const cancelled = new Set();
  const { bridge, timers } = harness(async (url, options) => {
    const { clientScope } = JSON.parse(options.body);
    if (url.endsWith('bridge-send')) return response({ turnId: `job-${clientScope}` });
    if (url.endsWith('bridge-interrupt')) { cancelled.add(clientScope); return response({ ok: true }); }
    return response({ cursor: 1, events: [{ clientScope, method: 'turn/completed',
      params: { turnId: `job-${clientScope}`, turn: { status: cancelled.has(clientScope) ? 'interrupted' : 'completed' } } }] });
  });
  const events = [];
  bridge.onEvent(event => events.push(event));
  const scopes = Array.from({ length: 10 }, (_, index) => `workspace-${index}`);
  const jobs = await Promise.all(scopes.map(clientScope => bridge.send({ clientScope })));
  assert.equal(new Set(jobs.map(job => job.turnId)).size, 10);
  await bridge.interrupt({ clientScope: scopes[0] });
  const polls = [...timers.values()].filter(timer => timer.delay === 0);
  assert.equal(polls.length, 10);
  await Promise.all(polls.map(timer => timer.callback()));
  assert.equal(events.length, 10);
  for (const clientScope of scopes) {
    const event = events.find(item => item.clientScope === clientScope);
    assert.equal(event.params.turnId, `job-${clientScope}`);
    assert.equal(event.params.turn.status, clientScope === scopes[0] ? 'interrupted' : 'completed');
  }
});
