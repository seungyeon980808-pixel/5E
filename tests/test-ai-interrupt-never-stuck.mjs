// 먹통 고침(11-21): 대화 턴을 멈추면 interrupt가 {ok:true}가 아닌 값을 돌려줘도 작업 지우기가 막히지 않아야 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { acknowledgeActiveTaskClearCancellation } from '../js/ai-panel.js';

const tab = { id: 't1', workState: 'busy' };

for (const [name, reply] of [['빈 객체(app-server turn/interrupt)', {}], ['시작 전 턴', { pending: true }], ['이미 끝난 턴', null]]) {
  test(`멈춘 뒤 작업 지우기 허락 — ${name}`, async () => {
    const r = await acknowledgeActiveTaskClearCancellation({ tab, activeTaskTabId: 't1', interrupt: async () => reply });
    assert.equal(r.acknowledged, true);
  });
}

test('멈추기 자체가 실패해도 지우기는 허락', async () => {
  const r = await acknowledgeActiveTaskClearCancellation({ tab, activeTaskTabId: 't1', interrupt: async () => { throw new Error('IPC 끊김'); } });
  assert.equal(r.acknowledged, true);
});

test('보고 있지 않거나 쉬는 작업은 그대로 거절', async () => {
  assert.equal((await acknowledgeActiveTaskClearCancellation({ tab, activeTaskTabId: 'other', interrupt: async () => ({ ok: true }) })).acknowledged, false);
  assert.equal((await acknowledgeActiveTaskClearCancellation({ tab: { id: 't1', workState: 'idle' }, activeTaskTabId: 't1', interrupt: async () => ({ ok: true }) })).acknowledged, false);
});

test('interruptCurrentTask는 응답 모양과 상관없이 화면을 정리하고 5초 시한을 둔다', () => {
  const src = readFileSync(new URL('../js/ai-panel.js', import.meta.url), 'utf8');
  const start = src.indexOf('const interruptCurrentTask');
  assert.ok(start > 0);
  const body = src.slice(start, src.indexOf('\n  };', start));
  assert.doesNotMatch(body, /outcome\?\.ok === true\)/);
  assert.match(body, /setTimeout\(.*5000\)/);
  assert.match(body, /setBusy\(false\)/);
});
