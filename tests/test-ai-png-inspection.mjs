import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectRgbaPixels, inspectPngDataUrl } from '../js/ai-png-inspection.js';
import { encodeTestRgbaPng } from './helpers/scoped-edit-png-fixture.mjs';

test('white opaque pixels satisfy exact achromatic measurements without mutation', () => {
  const data = new Uint8ClampedArray(8 * 8 * 4).fill(255);
  const original = data.slice();
  const result = inspectRgbaPixels(data, 8, 8);
  assert.equal(result.opaque, true);
  assert.equal(result.strictlyAchromatic, true);
  assert.equal(result.exactWhiteShare, 1);
  assert.equal(result.exactWhiteBorderShare, 1);
  assert.equal(result.darkPixelShare, 0);
  assert.deepEqual(data, original);
});
test('minor tint differs from exact achromatic contract and transparency is independent', () => {
  const result = inspectRgbaPixels(new Uint8ClampedArray([255,254,255,255, 255,200,255,0, 0,0,0,255]), 3, 1);
  assert.equal(result.nonOpaquePixels, 1);
  assert.equal(result.chromaticPixels, 2);
  assert.equal(result.channelDifferenceOver3Share, 1/3);
  assert.equal(result.darkPixelShare, 1/3);
  assert.equal(result.strictlyAchromatic, false);
  assert.equal(result.maxChannelDifference, 55);
  assert.ok(!('verdict' in result));
});
test('edge statistics exclude central object without pretending to detect background', () => {
  const data = new Uint8ClampedArray(12 * 12 * 4).fill(255);
  const i = (6 * 12 + 6) * 4;
  data[i] = data[i+1] = data[i+2] = 0;
  const result = inspectRgbaPixels(data, 12, 12);
  assert.equal(result.exactWhiteBorderShare, 1);
  assert.equal(result.exactWhiteShare, 143/144);
  assert.match(result.limitations, /구별하지 못함/);
});
test('invalid image sizes and pixel values fail closed', () => {
  for (const [pixels,w,h] of [[[],0,0], [[255,255,255,255],2,1], [[-1,0,0,255],1,1], [[0,0,0,256],1,1], [[0,0,0,255],1.5,1]]) {
    assert.throws(() => inspectRgbaPixels(pixels,w,h));
  }
});
test('non-PNG and fake PNG data cannot enter browser decoder', async () => {
  await assert.rejects(inspectPngDataUrl('data:image/jpeg;base64,AAAA'), /PNG/);
  await assert.rejects(inspectPngDataUrl('data:image/png;base64,AAAA'), /PNG/);
});

test('PNG diagnostics decode raw RGBA without Canvas and preserve hidden RGB and alpha',async()=>{
 const png=encodeTestRgbaPng({width:2,height:1,data:Uint8Array.from([10,20,30,0,255,255,255,255])});
 const original=png.slice();
 const result=await inspectPngDataUrl('data:image/png;base64,'+Buffer.from(png).toString('base64'));
 assert.equal(result.nonOpaquePixels,1);assert.equal(result.chromaticPixels,1);assert.deepEqual(png,original);
});
