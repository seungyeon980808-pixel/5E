import test from 'node:test';
import assert from 'node:assert/strict';
import * as dialogModule from '../js/ai-editable-assets-dialog.js';
import { decodeScopedPng, encodeScopedPng } from '../js/ai-scoped-edit-png.js';

const url = bytes => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;

async function asset({ id, x, y, width, height, pixels, label = id }) {
  const data = new Uint8Array(width * height * 4);
  for (const [px, py, rgba] of pixels) data.set(rgba, (py * width + px) * 4);
  return {
    id, x, y, width, height, label, labelMode: 'none',
    anchor: { x, y }, labelPoint: { x, y },
    data: url(await encodeScopedPng({ width, height, data })),
  };
}

async function fixture() {
  const assets = [
    await asset({ id: 'a', x: 1, y: 1, width: 4, height: 4, pixels: [
      [1, 1, [10, 20, 30, 255]], [2, 1, [11, 21, 31, 180]],
    ] }),
    await asset({ id: 'b', x: 5, y: 1, width: 3, height: 4, pixels: [
      [0, 2, [40, 50, 60, 255]], [1, 2, [255, 255, 255, 255]],
    ] }),
  ];
  return {
    width: 10, height: 7, assets, foregroundPixelCount: 4,
    assignedForegroundPixelCount: 4, unassignedForegroundPixelCount: 0,
    semanticGroupingVerified: false, reviewRequired: true,
    reviewReasons: ['semantic-grouping-unverified'], manualCorrectionAvailable: true,
    stats: { foregroundPixelCount: 4, assignedForegroundPixelCount: 4,
      unassignedForegroundPixelCount: 0, rgbaVerified: true, assignmentVerified: true,
      layoutMode: 'connected-components', analysisCompleted: true },
  };
}

async function worldPixels(prepared) {
  const pixels = new Map();
  for (const item of prepared.assets) {
    const decoded = await decodeScopedPng(new Uint8Array(Buffer.from(item.data.split(',')[1], 'base64')));
    for (let y = 0; y < decoded.height; y++) for (let x = 0; x < decoded.width; x++) {
      const offset = (y * decoded.width + x) * 4;
      if (!decoded.data[offset + 3]) continue;
      pixels.set(`${item.x + x},${item.y + y}`, { id: item.id, rgba: [...decoded.data.slice(offset, offset + 4)] });
    }
  }
  return pixels;
}

test('preview viewBox preserves headroom for a label at the source edge', () => {
  // Given
  const source = { width: 400, height: 300 };

  // When
  const viewBox = dialogModule.previewViewBoxForLabels(source.width, source.height, 32);

  // Then
  assert.equal(viewBox, '-32 -32 464 364');
});

test('Given prepared assets, when the dialog contract is loaded, then on-demand refinement is available', () => {
  assert.equal(typeof dialogModule.refinePreparedAssets, 'function');
});

test('Given two exact owner masks, when merging, then RGBA and source positions are preserved without mutating the input', async () => {
  const original = await fixture();
  const before = structuredClone(original);
  const refined = await dialogModule.refinePreparedAssets(original, { type: 'merge', targetId: 'a', sourceId: 'b' });

  assert.equal(refined.assets.length, 1);
  assert.deepEqual(await worldPixels(refined), new Map([
    ['2,2', { id: 'a', rgba: [10, 20, 30, 255] }],
    ['3,2', { id: 'a', rgba: [11, 21, 31, 180] }],
    ['5,3', { id: 'a', rgba: [40, 50, 60, 255] }],
    ['6,3', { id: 'a', rgba: [255, 255, 255, 255] }],
  ]));
  assert.deepEqual(original, before);
  assert.equal(refined.stats.assignmentVerified, true);
  assert.equal(refined.stats.layoutMode, 'manual-refinement');
});

test('Given one owner with two pixels, when splitting through one pixel, then both owners keep exact RGBA', async () => {
  const refined = await dialogModule.refinePreparedAssets(await fixture(),
    { type: 'split', assetId: 'a', rect: { x: 3, y: 2, width: 1, height: 1 } },
    { idFactory: () => 'split' });

  assert.equal(refined.assets.length, 3);
  assert.deepEqual(await worldPixels(refined), new Map([
    ['2,2', { id: 'a', rgba: [10, 20, 30, 255] }],
    ['3,2', { id: 'split', rgba: [11, 21, 31, 180] }],
    ['5,3', { id: 'b', rgba: [40, 50, 60, 255] }],
    ['6,3', { id: 'b', rgba: [255, 255, 255, 255] }],
  ]));
  assert.equal(refined.assignedForegroundPixelCount, 4);
});

test('Given a target owner, when reassigning a rectangle, then only pixels inside it move', async () => {
  const refined = await dialogModule.refinePreparedAssets(await fixture(),
    { type: 'reassign', targetId: 'a', rect: { x: 5, y: 3, width: 1, height: 1 } });
  const pixels = await worldPixels(refined);

  assert.equal(pixels.get('5,3').id, 'a');
  assert.equal(pixels.get('6,3').id, 'b');
  assert.deepEqual(pixels.get('5,3').rgba, [40, 50, 60, 255]);
  assert.equal(refined.unassignedForegroundPixelCount, 0);
});

test('Given an explicit exclusion, when refining, then omitted pixels are reported as unassigned', async () => {
  const refined = await dialogModule.refinePreparedAssets(await fixture(), { type: 'exclude', assetId: 'b' });

  assert.equal(refined.assets.length, 1);
  assert.equal(refined.assignedForegroundPixelCount, 2);
  assert.equal(refined.unassignedForegroundPixelCount, 2);
  assert.equal(refined.stats.assignmentVerified, false);
  assert(refined.reviewReasons.includes('manual-pixels-excluded'));
});

test('Given a zero-width rectangle, when splitting, then refinement rejects the empty operation', async () => {
  await assert.rejects(dialogModule.refinePreparedAssets(await fixture(),
    { type: 'split', assetId: 'a', rect: { x: 2, y: 2, width: 0, height: 1 } }), /영역/);
});

test('Given overlapping owner masks, when refining, then ambiguity is rejected instead of dropping or duplicating pixels', async () => {
  const prepared = await fixture();
  prepared.assets.push(await asset({ id: 'overlap', x: 2, y: 2, width: 1, height: 1,
    pixels: [[0, 0, [10, 20, 30, 255]]] }));
  await assert.rejects(dialogModule.refinePreparedAssets(prepared,
    { type: 'exclude', assetId: 'a' }), /겹친|소속/);
});

test('Given an aborted refinement, when starting work, then it rejects with AbortError and no partial result', async () => {
  const controller = new AbortController(); controller.abort('cancelled');
  await assert.rejects(dialogModule.refinePreparedAssets(await fixture(),
    { type: 'exclude', assetId: 'a' }, { signal: controller.signal }), error => error?.name === 'AbortError');
});

test('Given a malformed prepared PNG, when refinement decodes it, then recovery guidance is Korean and decoder detail stays internal', async () => {
  const prepared = await fixture();
  prepared.assets[0].data = 'data:image/png;base64,AAAA';
  const before = structuredClone(prepared);

  await assert.rejects(dialogModule.refinePreparedAssets(prepared,
    { type: 'exclude', assetId: 'a' }), error => {
    assert.equal(error?.name, 'PreparedAssetRefinementError');
    assert.equal(error?.message, '분리 결과를 읽을 수 없습니다. 자동 분리를 다시 실행하거나 원본을 사용해 주세요.');
    assert.match(error?.cause?.message ?? '', /PNG|signature/i);
    return true;
  });
  assert.deepEqual(prepared, before);
});

test('Given an internal decoder error or cancellation, when dialog guidance is selected, then raw details are hidden and abort stays silent', () => {
  const raw = new Error('Unsupported or invalid PNG: bad PNG signature.');
  const fallback = '미세 조정 결과를 만들지 못했습니다. 자동 분리를 다시 실행하거나 원본을 사용해 주세요.';
  assert.equal(dialogModule.refinementFailureGuidance(raw), fallback);
  assert.equal(dialogModule.refinementFailureGuidance(new TypeError('Cannot read properties of undefined')), fallback);
  assert.equal(dialogModule.refinementFailureGuidance(new DOMException('cancelled', 'AbortError')), null);
});

test('Given source dimensions above 16 MP, when refining, then the memory bound rejects before PNG decoding', async () => {
  const prepared = await fixture();
  prepared.width = 4001; prepared.height = 4000;
  await assert.rejects(dialogModule.refinePreparedAssets(prepared,
    { type: 'exclude', assetId: 'a' }), /원본 크기/);
});
