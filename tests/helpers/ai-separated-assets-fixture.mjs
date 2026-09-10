import assert from 'node:assert/strict';
import { decodeScopedPng, encodeScopedPng } from '../../js/ai-scoped-edit-png.js';

export const url = bytes => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
export const pixel = (image, x, y) => [...image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)];

export async function png({ width, height, fill, paint }) {
  const data = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p++) data.set(fill, p * 4);
  paint?.(data, (x, y, rgba) => data.set(rgba, (y * width + x) * 4));
  return { data, src: url(await encodeScopedPng({ width, height, data })) };
}

export async function assertExactPixelAssignments(source, assets) {
  const assignments = new Uint8Array(source.width * source.height);
  let retainedPixelCount = 0;
  for (const asset of assets) {
    const decoded = await decodeScopedPng(new Uint8Array(Buffer.from(asset.data.split(',')[1], 'base64')));
    for (let y = 0; y < decoded.height; y++) for (let x = 0; x < decoded.width; x++) {
      const outputOffset = (y * decoded.width + x) * 4;
      if (decoded.data[outputOffset + 3] === 0) continue;
      const sourcePixel = (asset.y + y) * source.width + asset.x + x;
      assert.equal(assignments[sourcePixel]++, 0, 'a foreground pixel must belong to exactly one asset');
      assert.deepEqual(decoded.data.slice(outputOffset, outputOffset + 4), source.data.slice(sourcePixel * 4, sourcePixel * 4 + 4));
      retainedPixelCount++;
    }
  }
  return retainedPixelCount;
}
