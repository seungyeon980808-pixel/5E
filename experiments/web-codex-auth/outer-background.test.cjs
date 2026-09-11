const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('./outer-background.mjs');

function whitePixels(width, height) {
  return new Uint8ClampedArray(width * height * 4).fill(255);
}

test('removes outside white, preserving enclosed white and all RGB values', async () => {
  const { removeOuterWhite } = await modulePromise;
  const input = whitePixels(5, 5);
  for (const pixel of [6, 7, 8, 11, 13, 16, 17, 18]) {
    input.set([80, 80, 80, 255], pixel * 4);
  }
  const original = input.slice();
  const output = removeOuterWhite(input, 5, 5);
  assert.notStrictEqual(output, input);
  assert.deepEqual(input, original);
  assert.equal(output[3], 0);
  assert.equal(output[12 * 4 + 3], 255);
  for (let offset = 0; offset < input.length; offset += 4) {
    assert.deepEqual(output.slice(offset, offset + 3), input.slice(offset, offset + 3));
  }
  assert.deepEqual(output.slice(6 * 4, 6 * 4 + 4), input.slice(6 * 4, 6 * 4 + 4));
});

test('uses four-connected exterior; diagonal gaps do not erase enclosed white', async () => {
  const { removeOuterWhite } = await modulePromise;
  const input = whitePixels(3, 3);
  for (const pixel of [1, 3, 5, 7]) input.set([0, 0, 0, 255], pixel * 4);
  assert.equal(removeOuterWhite(input, 3, 3)[4 * 4 + 3], 255);
  input.set([255, 255, 255, 255], 1 * 4);
  assert.equal(removeOuterWhite(input, 3, 3)[4 * 4 + 3], 0);
});

test('preserves light gray and colored pixels, with transparent border connectivity', async () => {
  const { removeOuterWhite } = await modulePromise;
  const input = new Uint8ClampedArray([
    0, 0, 0, 0, 252, 251, 253, 255, 249, 249, 249, 255, 250, 253, 255, 255,
  ]);
  const output = removeOuterWhite(input, 4, 1);
  assert.deepEqual([...output], [
    0, 0, 0, 0, 252, 251, 253, 0, 249, 249, 249, 255, 250, 253, 255, 255,
  ]);
});

test('rejects invalid dimensions and RGBA buffers before allocating', async () => {
  const { removeOuterWhite, transparentOuterPng } = await modulePromise;
  for (const dimensions of [[0, 1], [-1, 1], [1.5, 1], [8193, 1], [8192, 8192]]) {
    assert.throws(() => removeOuterWhite(new Uint8ClampedArray(), ...dimensions), RangeError);
  }
  assert.throws(() => removeOuterWhite(new Uint8ClampedArray(3), 1, 1), TypeError);
  assert.throws(() => removeOuterWhite([255, 255, 255, 255], 1, 1), TypeError);
  await assert.rejects(transparentOuterPng('data:image/jpeg;base64,AA=='), TypeError);
});

 test('all white removes enclosed white but preserves gray, color and original pixels', async () => {
  const { removeAllWhite, removeOuterWhite } = await modulePromise;
  const input = whitePixels(5, 5);
  for (const pixel of [6,7,8,11,13,16,17,18]) input.set([60,60,60,255],pixel*4);
  input.set([249,249,249,255],0);
  input.set([251,255,250,255],4);
  const before = input.slice();
  const all = removeAllWhite(input,5,5);
  assert.equal(removeOuterWhite(input,5,5)[51],255);
  assert.equal(all[51],0);
  assert.equal(all[3],255);
  assert.equal(all[7],255);
  assert.equal(all[27],255);
  assert.deepEqual(input,before);
  for(let i=0;i<input.length;i+=4) assert.deepEqual(all.slice(i,i+3),input.slice(i,i+3));
});

test('dark line growth is bounded, reversible from the untouched source and stronger at radius two', async () => {
  const { thickenDarkLines } = await modulePromise;
  const input = whitePixels(7, 7);
  input.set([20, 20, 20, 255], (3 * 7 + 3) * 4);
  const original = input.slice();
  const one = thickenDarkLines(input, 7, 7, 1);
  const two = thickenDarkLines(input, 7, 7, 2);
  assert.equal(one.length, input.length);
  assert.equal(two.length, input.length);
  assert.equal([...one].filter((value, i) => i % 4 === 0 && value === 20).length, 5);
  assert.equal([...two].filter((value, i) => i % 4 === 0 && value === 20).length, 13);
  assert.deepEqual(input, original);
  assert.deepEqual(thickenDarkLines(input, 7, 7, 0), original);
  assert.deepEqual([...two.slice(0, 4)], [255, 255, 255, 255]);
});

test('growth preserves colored detail, isolated gray fill and existing stroke alpha', async () => {
  const { thickenDarkLines } = await modulePromise;
  const input = whitePixels(7, 7);
  input.set([30, 30, 30, 180], (3 * 7 + 3) * 4);
  input.set([220, 20, 50, 255], (3 * 7 + 4) * 4);
  input.set([160, 160, 160, 255], 0);
  const output = thickenDarkLines(input, 7, 7, 1);
  assert.deepEqual([...output.slice((3 * 7 + 4) * 4, (3 * 7 + 5) * 4)], [220, 20, 50, 255]);
  assert.deepEqual([...output.slice(0, 4)], [160, 160, 160, 255]);
  assert.deepEqual([...output.slice((2 * 7 + 3) * 4, (2 * 7 + 4) * 4)], [30, 30, 30, 180]);
  const pale = whitePixels(3, 3);
  pale.set([140, 140, 140, 255], 16);
  assert.deepEqual(thickenDarkLines(pale, 3, 3, 2), pale);
});

test('growth clips at image edges without wrapping and composes with both background modes', async () => {
  const { thickenDarkLines, removeOuterWhite, removeAllWhite } = await modulePromise;
  const input = whitePixels(7, 7);
  input.set([0, 0, 0, 255], 0);
  const grown = thickenDarkLines(input, 7, 7, 1);
  assert.equal(grown[6 * 4], 255);
  assert.equal(grown[7 * 4], 0);
  const outer = removeOuterWhite(grown, 7, 7);
  const all = removeAllWhite(grown, 7, 7);
  assert.equal(outer[3], 255);
  assert.equal(all[3], 255);
  assert.equal(outer[6 * 4 + 3], 0);
  assert.equal(all[6 * 4 + 3], 0);
  assert.throws(() => thickenDarkLines(input, 7, 7, 3), TypeError);
  assert.throws(() => thickenDarkLines(new Uint8ClampedArray(4), 7, 7, 1), TypeError);
});
