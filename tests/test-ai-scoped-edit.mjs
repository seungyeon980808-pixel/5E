import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../js/ai-scoped-edit.js', import.meta.url), 'utf8');
const {
  AI_SCOPED_EDIT_VERSION, validateRgbaImage, validateBinaryMask,
  compositeRgbaWithinMask, isRgbaOutsideMaskUnchanged,
  deriveRgbaChangeMask, rectangleToBinaryMask,
} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function image(width, height, values, Type = Uint8ClampedArray) {
  return { width, height, data: new Type(values) };
}

test('versioned API validates exact RGBA and binary-mask contracts', () => {
  assert.equal(AI_SCOPED_EDIT_VERSION, '1.0.0');
  const valid = image(1, 1, [0, 1, 2, 3]);
  assert.equal(validateRgbaImage(valid).data, valid.data);
  assert.equal(validateBinaryMask(new Uint8Array([0]), 1, 1)[0], 0);
  for (const bad of [null, {}, { width: 1, height: 1, data: [0, 0, 0, 0] }, { width: 1, height: 1, data: new Uint8Array(3) }, { width: 0, height: 1, data: new Uint8Array(0) }, { width: 1.5, height: 1, data: new Uint8Array(6) }]) {
    assert.throws(() => validateRgbaImage(bad));
  }
  for (const bad of [new Uint8Array([]), new Uint8Array([2]), new Uint8Array([255]), [0]]) assert.throws(() => validateBinaryMask(bad, 1, 1));
});

test('composite allows arbitrary candidate changes only inside a disjoint explicit mask', () => {
  const original = image(3, 2, [
    1,2,3,4, 5,6,7,8, 9,10,11,12,
    13,14,15,16, 17,18,19,20, 21,22,23,24,
  ]);
  const originalBefore = original.data.slice();
  const candidate = image(3, 2, new Array(24).fill(250));
  const mask = new Uint8Array([1,0,1, 0,1,0]);
  const output = compositeRgbaWithinMask(original, candidate, mask);
  assert.ok(output instanceof Uint8ClampedArray);
  assert.deepEqual([...output], [250,250,250,250, 5,6,7,8, 250,250,250,250, 13,14,15,16, 250,250,250,250, 21,22,23,24]);
  assert.deepEqual(original.data, originalBefore);
  assert.equal(isRgbaOutsideMaskUnchanged(original, image(3, 2, output), mask), true);
});

test('a candidate line crossing both mask edges is clipped at exact pixel boundaries', () => {
  const original = image(7, 1, [
    10,11,12,0, 20,21,22,255, 30,31,32,255, 40,41,42,255,
    50,51,52,255, 60,61,62,255, 70,71,72,0,
  ], Uint8Array);
  const candidate = image(7, 1, new Array(28).fill(0), Uint8Array);
  const mask = rectangleToBinaryMask(7, 1, { x0: 2, y0: 0, x1: 5, y1: 1 });
  const output = compositeRgbaWithinMask(original, candidate, mask);

  assert.deepEqual([...output], [
    10,11,12,0, 20,21,22,255, 0,0,0,0, 0,0,0,0,
    0,0,0,0, 60,61,62,255, 70,71,72,0,
  ]);
  assert.equal(isRgbaOutsideMaskUnchanged(original, image(7, 1, output, Uint8Array), mask), true);
  // This proves byte clipping only; arbitrary candidate pixels inside the mask still require semantic review.
});

test('outside verifier rejects one-channel changes, including hidden transparent RGB', () => {
  const original = image(2, 1, [11,12,13,0, 20,21,22,128]);
  const changedHiddenRgb = image(2, 1, [12,12,13,0, 20,21,22,128]);
  const changedPartialAlpha = image(2, 1, [11,12,13,0, 20,21,22,127]);
  const mask = new Uint8Array([0,1]);
  assert.equal(isRgbaOutsideMaskUnchanged(original, changedHiddenRgb, mask), false);
  assert.equal(isRgbaOutsideMaskUnchanged(original, changedPartialAlpha, mask), true);
  assert.equal(isRgbaOutsideMaskUnchanged(original, changedPartialAlpha, new Uint8Array([0,0])), false);
});

test('change derivation counts exact RGBA differences and half-open bounds at image edges', () => {
  const original = image(3, 2, [0,0,0,0, 1,2,3,128, 4,5,6,255, 7,8,9,0, 10,11,12,255, 13,14,15,255]);
  const result = image(3, 2, [9,0,0,0, 1,2,3,127, 4,5,6,255, 7,8,9,0, 10,11,12,255, 13,14,16,255]);
  const detail = deriveRgbaChangeMask(original, result);
  assert.deepEqual([...detail.mask], [1,1,0,0,0,1]);
  assert.equal(detail.changedPixelCount, 3);
  assert.deepEqual(detail.bounds, { x0: 0, y0: 0, x1: 3, y1: 2 });
  assert.deepEqual(deriveRgbaChangeMask(original, original), { mask: new Uint8Array(6), changedPixelCount: 0, bounds: null });
});

test('one-pixel edge region and shared-buffer input remain safe', () => {
  const shared = new Uint8Array([1,2,3,4, 5,6,7,8]);
  const original = { width: 2, height: 1, data: shared };
  const candidate = { width: 2, height: 1, data: shared };
  const mask = rectangleToBinaryMask(2, 1, { x0: 1, y0: 0, x1: 2, y1: 1 });
  const output = compositeRgbaWithinMask(original, candidate, mask);
  assert.notEqual(output.buffer, shared.buffer);
  assert.deepEqual([...output], [...shared]);
  assert.deepEqual([...mask], [0,1]);
});

test('rectangle helper rejects empty, fractional, and out-of-bounds ranges without clamping', () => {
  assert.deepEqual([...rectangleToBinaryMask(3, 2, { x0: 1, y0: 0, x1: 3, y1: 2 })], [0,1,1,0,1,1]);
  for (const rectangle of [
    { x0: 0, y0: 0, x1: 0, y1: 1 }, { x0: 0, y0: 1, x1: 1, y1: 1 },
    { x0: -1, y0: 0, x1: 1, y1: 1 }, { x0: 0, y0: 0, x1: 4, y1: 1 },
    { x0: 0.5, y0: 0, x1: 1, y1: 1 }, { x0: 2, y0: 0, x1: 1, y1: 1 },
  ]) assert.throws(() => rectangleToBinaryMask(3, 2, rectangle));
});

test('mismatched dimensions and typed-array types fail closed', () => {
  const original = image(1, 1, [0,0,0,0], Uint8Array);
  const differentDimensions = image(2, 1, [0,0,0,0,0,0,0,0], Uint8Array);
  const differentType = image(1, 1, [0,0,0,0], Uint8ClampedArray);
  assert.throws(() => compositeRgbaWithinMask(original, differentDimensions, new Uint8Array([1])));
  assert.throws(() => compositeRgbaWithinMask(original, differentType, new Uint8Array([1])));
});
