// B3(1.7.1): 보관함 「배점 · 정답」이 하나씩 밀려 보이던 결함 — 정답은 0~4로 저장되므로 ①~⑤로 보여야 하고, ①(0)은 「정답 없음」이 아니다.
import test from 'node:test';
import assert from 'node:assert/strict';
const noop = () => {};
globalThis.location ??= { href: 'http://x/', search: '', origin: 'http://x', pathname: '/' };
globalThis.window ??= globalThis; globalThis.addEventListener ??= noop; globalThis.removeEventListener ??= noop;
globalThis.localStorage ??= { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.document ??= { querySelector: () => null, addEventListener: noop, createElement: () => ({}) };
const { answerLabel } = await import('../assets/exampool/sheet/library-view.js');

test('정답 0~4는 ①~⑤', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(answer => answerLabel({ answer })), ['①', '②', '③', '④', '⑤']);
});
test('정답이 없으면 「정답 없음」', () => {
  for (const answer of [null, undefined, -1, 5, 1.5, '2']) assert.equal(answerLabel({ answer }), '정답 없음');
});
test('서술형은 「서술형」', () => {
  assert.equal(answerLabel({ type: '서술형', answer: null }), '서술형');
});
