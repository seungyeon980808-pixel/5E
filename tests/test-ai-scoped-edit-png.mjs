import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compositeRgbaWithinMask, isRgbaOutsideMaskUnchanged } from '../js/ai-scoped-edit.js';
import { decodeTestPng, encodeTestRgbaPng } from './helpers/scoped-edit-png-fixture.mjs';

const artifactDirectory = '/Users/parkseungyeon/.aside/u/0/sessions/2026-09-07_bTSr3fYASfFkTKSA/artifacts/5e-scoped-edit-core-01/png-test';
const approvedInput = '/Users/parkseungyeon/.aside/u/0/sessions/2026-09-07_bTSr3fYASfFkTKSA/artifacts/5e-drive-textbook-unit-audit/results/U01-3.png';
const here = path.dirname(fileURLToPath(import.meta.url));

function changedCandidate(image) { const data = new Uint8Array(image.data.length); for (let i = 0; i < data.length; i += 4) { data[i] = image.data[i] ^ 0xff; data[i + 1] = (image.data[i + 1] + 73) & 255; data[i + 2] = image.data[i + 2] ^ 0x55; data[i + 3] = image.data[i + 3] ^ 0xff; } return { width: image.width, height: image.height, data }; }
function discontinuousMask(width, height) { const mask = new Uint8Array(width * height); for (const [x, y] of [[0, 0], [width - 1, 0], [Math.floor(width / 2), Math.floor(height / 2)], [0, height - 1], [width - 1, height - 1]]) mask[y * width + x] = 1; return mask; }
function assertOutsideExactlyOriginal(original, result, mask) { assert.equal(isRgbaOutsideMaskUnchanged(original, result, mask), true); for (let pixel = 0; pixel < mask.length; pixel += 1) if (!mask[pixel]) assert.deepEqual([...result.data.subarray(pixel * 4, pixel * 4 + 4)], [...original.data.subarray(pixel * 4, pixel * 4 + 4)], `outside RGBA changed at pixel ${pixel}`); }

await fs.mkdir(artifactDirectory, { recursive: true });

test('test-only codec reconstructs all PNG filters and fails closed on CRC corruption', () => {
  const image = { width: 3, height: 2, data: Uint8Array.from([17,18,19,0, 20,21,22,127, 23,24,25,255, 26,27,28,64, 29,30,31,128, 32,33,34,1]) };
  for (let filter = 0; filter <= 4; filter += 1) assert.deepEqual(decodeTestPng(encodeTestRgbaPng(image, filter)), image, `filter ${filter}`);
  const corrupt = encodeTestRgbaPng(image); corrupt[corrupt.length - 5] ^= 1;
  assert.throws(() => decodeTestPng(corrupt), /CRC mismatch/);
});

test('actual synthetic PNG bytes persist/reload exact scoped RGBA, including transparent RGB and partial alpha', async () => {
  const original = { width: 4, height: 3, data: Uint8Array.from([
    9,8,7,0, 1,2,3,128, 4,5,6,255, 7,8,9,1,
    10,11,12,64, 13,14,15,255, 16,17,18,0, 19,20,21,200,
    22,23,24,255, 25,26,27,127, 28,29,30,0, 31,32,33,255,
  ]) };
  const decodedOriginal = decodeTestPng(encodeTestRgbaPng(original, 4));
  const mask = Uint8Array.from([1,0,1,0, 0,1,0,1, 1,0,0,1]);
  const composite = { width: original.width, height: original.height, data: compositeRgbaWithinMask(decodedOriginal, changedCandidate(decodedOriginal), mask) };
  const outputPath = path.join(artifactDirectory, 'synthetic-scoped-edit.png'); await fs.writeFile(outputPath, encodeTestRgbaPng(composite, 1));
  const reloaded = decodeTestPng(await fs.readFile(outputPath));
  assert.deepEqual(reloaded, composite); assertOutsideExactlyOriginal(decodedOriginal, reloaded, mask);
  assert.deepEqual([...reloaded.data.subarray(0, 4)], [...composite.data.subarray(0, 4)], 'alpha-0 nonzero RGB persisted');
  assert.equal(reloaded.data[7], composite.data[7], 'partial alpha persisted');
  assert.throws(() => compositeRgbaWithinMask(decodedOriginal, { width: 3, height: 4, data: new Uint8Array(48) }, mask), /dimensions must match/);
});

test('approved U01-3 actual RGB PNG is decoded, composited, saved, re-read, and exact outside discontinuous mask', async () => {
  const originalBytes = await fs.readFile(approvedInput); const original = decodeTestPng(originalBytes);
  const copyPath = path.join(artifactDirectory, 'U01-3-input-copy.png'); await fs.writeFile(copyPath, originalBytes);
  const mask = discontinuousMask(original.width, original.height); const candidate = changedCandidate(original);
  const composite = { width: original.width, height: original.height, data: compositeRgbaWithinMask(original, candidate, mask) };
  const outputPath = path.join(artifactDirectory, 'U01-3-scoped-edit.png'); await fs.writeFile(outputPath, encodeTestRgbaPng(composite, 2));
  const reloaded = decodeTestPng(await fs.readFile(outputPath));
  assert.deepEqual(reloaded, composite); assertOutsideExactlyOriginal(original, reloaded, mask);
  await fs.writeFile(path.join(artifactDirectory, 'README.txt'), `PASS: actual PNG decode -> core composite -> PNG encode -> save -> re-read -> decode\nInput: ${approvedInput}\nInput support: 8-bit non-interlaced RGB (decoded to RGBA)\nTest codec scope: decode only 8-bit non-interlaced RGB/RGBA with filters 0-4; encode RGBA/filter 0-4. CRC checked and zlib inflated. Not product/UI code.\n`);
});
