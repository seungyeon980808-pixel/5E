const test = require('node:test');
const assert = require('node:assert/strict');
const api = Promise.all([import('../js/ai-image-local-erase.js'), import('../js/ai-scoped-edit-png.js?v=1.7.0-four-session-integration')]);
const url = bytes => 'data:image/png;base64,' + Buffer.from(bytes).toString('base64');
const bytes = data => new Uint8Array(Buffer.from(data.split(',')[1], 'base64'));

test('polygon erasure preserves dimensions, color metadata and every RGBA byte outside a concave mask', async () => {
  const [{ eraseImagePolygon, polygonPixelMask }, { encodeScopedPng, decodeScopedPng }] = await api;
  const width = 40, height = 30, data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([i % 255, (i * 13) % 255, (i * 7) % 255, i % 3 ? 255 : 0], i * 4);
  const metadata = [{ type: 'sRGB', data: Uint8Array.of(0) }];
  const source = url(await encodeScopedPng({ width, height, data }, { metadata }));
  const polygon = [{ x: 4, y: 3 }, { x: 20, y: 3 }, { x: 20, y: 10 }, { x: 12, y: 10 }, { x: 12, y: 22 }, { x: 4, y: 22 }];
  const result = await eraseImagePolygon(source, polygon);
  const output = await decodeScopedPng(bytes(result.data)), mask = polygonPixelMask(width, height, polygon);
  assert.equal(output.width, width); assert.equal(output.height, height); assert.deepEqual(output.metadata, metadata);
  let erased = 0;
  for (let i = 0; i < mask.length; i++) {
    const offset = i * 4;
    assert.deepEqual(output.data.subarray(offset, offset + 4), mask[i] ? new Uint8Array(4) : data.subarray(offset, offset + 4));
    if (mask[i]) erased++;
  }
  assert.equal(result.maskedPixels, erased); assert.equal(result.outsideRgbaChanged, 0);
  assert.equal(mask[15 * width + 16], 0, 'the concave indentation is preserved');
  assert.equal(url(await encodeScopedPng({ width, height, data }, { metadata })), source, 'original byte source is untouched');
});

test('degenerate geometry, excessive allocation, cancellation and already erased pixels cannot create a revision', async () => {
  const [{ eraseImagePolygon, polygonPixelMask }, { encodeScopedPng }] = await api;
  assert.throws(() => polygonPixelMask(9000, 9000, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]), RangeError);
  assert.throws(() => polygonPixelMask(10, 10, [{ x: NaN, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]), TypeError);
  const source = url(await encodeScopedPng({ width: 10, height: 10, data: new Uint8Array(400) }));
  assert.equal(await eraseImagePolygon(source, [{ x: 2, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 8 }, { x: 2, y: 8 }]), null);
  await assert.rejects(() => eraseImagePolygon(source, [{ x: 2, y: 2 }, { x: 2.1, y: 2 }, { x: 2, y: 2.1 }]), RangeError);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => eraseImagePolygon(source, [], { signal: controller.signal }), { name: 'AbortError' });
});
