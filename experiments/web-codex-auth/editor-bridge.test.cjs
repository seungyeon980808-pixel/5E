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
