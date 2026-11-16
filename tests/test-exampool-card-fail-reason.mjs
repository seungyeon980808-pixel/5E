// B12(1.7.1): 카드 쪽 그리기 실패 문구 「쪽을 그리지 못했습니다: 」 뒤가 빈칸이던 결함 — 엔진이 글이나 빈 오류를 던져도 이유가 보여야 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
const noop = () => {};
globalThis.location ??= { href: 'http://x/', search: '', origin: 'http://x', pathname: '/' };
globalThis.window ??= globalThis; globalThis.addEventListener ??= noop; globalThis.removeEventListener ??= noop;
globalThis.localStorage ??= { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.document ??= { querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, createElement: () => ({ style: {} }) };
const { failReason } = await import('../assets/exampool/sheet/card-editor.js');

test('보통 오류는 그 글', () => assert.equal(failReason(new Error('글꼴이 없습니다')), '글꼴이 없습니다'));
test('엔진이 던진 글 한 줄', () => assert.equal(failReason('wasm: out of memory'), 'wasm: out of memory'));
test('글이 빈 오류는 이름', () => assert.equal(failReason(new TypeError('')), 'TypeError'));
test('아무것도 없으면 「알 수 없는 오류」', () => {
  for (const e of [undefined, null, '', {}]) assert.equal(failReason(e), '알 수 없는 오류');
});
