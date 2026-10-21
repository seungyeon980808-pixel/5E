// QR 부호기(js/qr-encode.js): 아래 지문은 10-22 새벽 macOS Vision(VNDetectBarcodesRequest)으로 실제 읽힌 그림의 칸 배열이다.
// 부호기를 고치면 지문이 바뀐다 — 그때는 새 그림을 실제 인식기로 다시 읽어 본 뒤 지문을 바꾼다.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { encodeQr } from '../js/qr-encode.js';

const print = q => crypto.createHash('sha256').update(q.modules.map(r => r.map(Number).join('')).join('\n')).digest('hex').slice(0, 16);

test('QR encoder matches recognizer-verified symbols', () => {
  for (const [text, ecc, version, hash] of [
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'M', 4, 'bbdb03260d325dcd'],
    ['A', 'L', 1, 'f195dbbdf146dae0'],
    ['과학 실험 영상: 산과 염기의 중화 반응', 'M', 4, 'd6d5352a0a5b2136'],
    ['https://youtu.be/abc', 'M', 2, 'e95c858b956a90b1'],
  ]) {
    const q = encodeQr(text, { ecc });
    assert.equal(q.version, version, text); assert.equal(q.size, version * 4 + 17); assert.equal(print(q), hash, text);
  }
});

test('QR encoder draws finder patterns, grows with text and refuses what does not fit', () => {
  const q = encodeQr('https://example.com/' + 'x'.repeat(120), { ecc: 'Q' });
  assert.equal(q.version, 10);
  for (const [x, y] of [[0, 0], [q.size - 7, 0], [0, q.size - 7]]) {
    const ring = [...Array(7).keys()].every(i => q.modules[y][x + i] && q.modules[y + 6][x + i] && q.modules[y + i][x] && q.modules[y + i][x + 6]);
    assert.ok(ring && q.modules[y + 3][x + 3] && !q.modules[y + 1][x + 1], `finder at ${x},${y}`);
  }
  assert.ok(encodeQr('H'.repeat(300), { ecc: 'H' }).version >= 7);
  assert.throws(() => encodeQr('x'.repeat(4000), { ecc: 'H' }), /너무 깁니다/);
  assert.throws(() => encodeQr('a', { ecc: 'X' }), /오류 정정/);
});
