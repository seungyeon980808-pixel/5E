// 11-23 06시 고침: 작업 공간(clientScope)마다 설치판 codex:event·codex:state에 듣는 함수를 따로 걸어
// 공간 6개째부터 MaxListenersExceededWarning이 나던 것 — 같은 base에는 한 번만 걸고 공간별로 나눠 주는지.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createTaskBridge } from '../js/ai-task-workspaces.js';

// preload.cjs와 같은 모양: on 하나 걸고 떼는 함수를 돌려준다.
function fakePreload() {
  const ipc = new EventEmitter();
  const warnings = [];
  const onWarn = (w) => { if (w.name === 'MaxListenersExceededWarning') warnings.push(w); };
  process.on('warning', onWarn);
  const sub = (channel) => (callback) => { const l = (_, v) => callback(v); ipc.on(channel, l); return () => ipc.removeListener(channel, l); };
  return { ipc, warnings, stop: () => process.off('warning', onWarn), base: { onEvent: sub('codex:event'), onState: sub('codex:state'), onLog: sub('codex:log'), send: async (p) => p } };
}

test('작업 공간 12개 × 공간마다 두 번 구독해도 ipc 듣는 함수는 채널마다 하나, 경고 없음', async () => {
  const { ipc, warnings, stop, base } = fakePreload();
  const got = new Map();
  const offs = [];
  for (let i = 0; i < 12; i++) {
    const scope = `ws-${i}`;
    const bridge = createTaskBridge(base, scope);
    for (const k of ['a', 'b']) {
      offs.push(bridge.onEvent((e) => got.set(`${scope}:${k}:event`, e.n)));
      offs.push(bridge.onState((e) => got.set(`${scope}:${k}:state`, e.n)));
    }
  }
  assert.equal(ipc.listenerCount('codex:event'), 1);
  assert.equal(ipc.listenerCount('codex:state'), 1);
  ipc.emit('codex:event', {}, { clientScope: 'ws-3', n: 7 });
  ipc.emit('codex:state', {}, { clientScope: 'ws-11', n: 9 });
  assert.deepEqual([...got.entries()].sort(), [['ws-11:a:state', 9], ['ws-11:b:state', 9], ['ws-3:a:event', 7], ['ws-3:b:event', 7]], '자기 공간 것만 받음');
  for (const off of offs) off();
  assert.equal(ipc.listenerCount('codex:event'), 0, '마지막 구독이 풀리면 ipc에서도 뗌');
  assert.equal(ipc.listenerCount('codex:state'), 0);
  await new Promise((r) => setImmediate(r));
  stop();
  assert.equal(warnings.length, 0);
});

test('푼 구독은 더 받지 않고, 두 번 풀어도 다른 구독에 영향 없음, 한 콜백 오류가 다른 공간을 막지 않음', () => {
  const { ipc, stop, base } = fakePreload();
  const seen = [];
  const a = createTaskBridge(base, 'A'), b = createTaskBridge(base, 'B');
  const offA = a.onEvent(() => { seen.push('A'); throw new Error('화면 오류'); });
  const offB = b.onEvent(() => seen.push('B'));
  const errors = [];
  const before = globalThis.reportError;
  globalThis.reportError = (e) => errors.push(e.message);
  try {
    ipc.emit('codex:event', {}, { clientScope: 'A' });
    ipc.emit('codex:event', {}, { clientScope: 'B' });
    offA(); offA();
    ipc.emit('codex:event', {}, { clientScope: 'A' });
    ipc.emit('codex:event', {}, { clientScope: 'B' });
  } finally { globalThis.reportError = before; stop(); }
  assert.deepEqual(seen, ['A', 'B', 'B']);
  assert.deepEqual(errors, ['화면 오류']);
  assert.equal(ipc.listenerCount('codex:event'), 1);
  offB();
  assert.equal(ipc.listenerCount('codex:event'), 0);
  // 다 뗀 뒤 다시 구독하면 새로 건다.
  const offC = createTaskBridge(base, 'C').onEvent(() => seen.push('C'));
  ipc.emit('codex:event', {}, { clientScope: 'C' });
  assert.equal(seen.at(-1), 'C');
  assert.equal(ipc.listenerCount('codex:event'), 1);
  offC();
});

test('여러 base(설치판·웹 브리지)는 따로 묶인다', () => {
  const p1 = fakePreload(), p2 = fakePreload();
  const off1 = createTaskBridge(p1.base, 'X').onState(() => {});
  const off2 = createTaskBridge(p2.base, 'X').onState(() => {});
  assert.equal(p1.ipc.listenerCount('codex:state'), 1);
  assert.equal(p2.ipc.listenerCount('codex:state'), 1);
  off1(); off2(); p1.stop(); p2.stop();
  assert.equal(p1.ipc.listenerCount('codex:state') + p2.ipc.listenerCount('codex:state'), 0);
});
