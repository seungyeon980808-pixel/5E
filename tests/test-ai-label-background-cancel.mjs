// 같은 그림을 두 작업대가 동시에 만들면 하나의 생성을 같이 기다린다. 먼저 시작한 쪽이 취소해도
// 기다리던 다른 작업대는 취소되지 않고 스스로 다시 만들어야 한다(M39, 10-21).
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveImageLabelBackground } from '../js/ai-label-background.js';

const contract = { key: 'k1', descriptor: {}, sourceSha256: 's', harness: { id: 'h' } };
const PNG = 'data:image/png;base64,AAAA';

test('another workbench cancelling does not cancel mine', async () => {
  const first = new AbortController();
  let calls = 0, release;
  const slow = () => { calls++; return new Promise(resolve => { release = () => resolve({ data: PNG }); }); };
  const a = resolveImageLabelBackground({ contract, signal: first.signal, generate: slow });
  await new Promise(resolve => setTimeout(resolve, 0));
  const b = resolveImageLabelBackground({ contract, generate: async () => { calls++; return { data: PNG }; } });
  await new Promise(resolve => setTimeout(resolve, 0));
  first.abort();
  release();
  await assert.rejects(a, error => error.name === 'AbortError');
  const mine = await b;
  assert.equal(mine.data, PNG);
  assert.equal(calls, 2, '취소된 쪽을 대신해 내 몫을 새로 만든다');
});

test('waiter still shares a successful generation', async () => {
  let calls = 0;
  const gen = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return { data: PNG }; };
  const c2 = { ...contract, key: 'k2' };
  const [x, y] = await Promise.all([resolveImageLabelBackground({ contract: c2, generate: gen }), resolveImageLabelBackground({ contract: c2, generate: gen })]);
  assert.equal(calls, 1); assert.equal(x.data, PNG); assert.equal(y.reused, 'concurrent');
});
