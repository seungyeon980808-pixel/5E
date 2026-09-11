import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { prepareSeparatedAssets } from '../js/ai-separated-assets.js';
import { insertEditableAssets, prepareEditableAssets } from '../js/ai-editable-assets.js';
import { decodeScopedPng } from '../js/ai-scoped-edit-png.js';
import { assertExactPixelAssignments, pixel, png, url } from './helpers/ai-separated-assets-fixture.mjs';

test('Given an opaque white atlas, when separating, then enclosed and translucent foreground RGBA is exact', async () => {
  const source = await png({ width: 49, height: 41, fill: [255, 255, 255, 255], paint: (data, set) => {
    for (let y = 3; y <= 6; y++) for (let x = 3; x <= 8; x++) if (x === 3 || x === 8 || y === 3 || y === 6) set(x, y, [24, 35, 46, 255]);
    set(4, 4, [255, 255, 255, 255]);
    set(5, 5, [71, 82, 93, 117]);
  } });

  const prepared = await prepareSeparatedAssets(source.src);
  const asset = prepared.assets[0];
  const decoded = await decodeScopedPng(new Uint8Array(Buffer.from(asset.data.split(',')[1], 'base64')));

  assert.equal(prepared.width, 49);
  assert.equal(prepared.height, 41);
  assert.equal(prepared.assets.length, 1);
  assert.deepEqual(pixel(decoded, 4 - asset.x, 4 - asset.y), [255, 255, 255, 255]);
  assert.deepEqual(pixel(decoded, 5 - asset.x, 5 - asset.y), [71, 82, 93, 117]);
  assert.deepEqual(asset.sourceBounds, { x: asset.x, y: asset.y, width: asset.width, height: asset.height });
  assert.equal(asset.assignedForegroundPixelCount, asset.foregroundPixelCount);
  assert.equal(prepared.foregroundPixelCount, prepared.stats.foregroundPixelCount);
  assert.equal(prepared.assignedForegroundPixelCount, prepared.foregroundPixelCount);
  assert.equal(prepared.unassignedForegroundPixelCount, 0);
  assert.equal(prepared.stats.rgbaVerified, true);
  assert.equal(prepared.stats.assignmentVerified, true);
  assert.equal(asset.semanticGroupingVerified, false);
  assert.equal(prepared.semanticGroupingVerified, false);
  assert.equal(prepared.reviewRequired, true);
  assert(prepared.reviewReasons.includes('semantic-grouping-unverified'));
  assert.equal(prepared.manualCorrectionAvailable, true);
  assert.deepEqual(prepared.manualRegions, [{
    id: asset.id, x: asset.x, y: asset.y, width: asset.width, height: asset.height,
    label: asset.label, labelMode: asset.labelMode, anchor: asset.anchor,
    labelPoint: asset.labelPoint, keepRects: [],
  }]);
});

test('Given a truly transparent atlas, when separating, then opaque white object pixels remain exact', async () => {
  const source = await png({ width: 48, height: 48, fill: [19, 29, 39, 0], paint: (data, set) => {
    for (let y = 15; y <= 20; y++) for (let x = 15; x <= 20; x++) set(x, y, [255, 255, 255, 255]);
    set(17, 17, [12, 34, 56, 99]);
  } });

  const prepared = await prepareSeparatedAssets(source.src);
  const asset = prepared.assets[0];
  const decoded = await decodeScopedPng(new Uint8Array(Buffer.from(asset.data.split(',')[1], 'base64')));

  assert.equal(asset.x, 14);
  assert.equal(asset.y, 14);
  assert.deepEqual(pixel(decoded, 3, 3), [12, 34, 56, 99]);
  assert.deepEqual(pixel(decoded, 1, 1), [255, 255, 255, 255]);
});

test('Given a baked RGB checkerboard, when separating, then unsupported background is rejected', async () => {
  const source = await png({ width: 48, height: 48, fill: [255, 255, 255, 255], paint: (data, set) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) if ((Math.floor(x / 3) + Math.floor(y / 3)) % 2) set(x, y, [190, 190, 190, 255]);
  } });

  await assert.rejects(prepareSeparatedAssets(source.src), /체크무늬|어두운 배경/);
});

test('Given near-white or translucent-white gutters, when separating, then strict background validation rejects them', async () => {
  for (const fill of [[240, 240, 240, 255], [255, 255, 255, 128]]) {
    const source = await png({ width: 48, height: 48, fill, paint: (data, set) => {
      for (let y = 4; y <= 7; y++) for (let x = 4; x <= 7; x++) set(x, y, [0, 0, 0, 255]);
    } });
    await assert.rejects(prepareSeparatedAssets(source.src), /체크무늬|어두운 배경/);
  }
});

test('Given a low-chroma 253 opaque background, when separating, then it is accepted as near-white', async () => {
  // Given
  const source = await png({ width: 48, height: 48, fill: [253, 254, 255, 255], paint: (data, set) => {
    for (let y = 4; y <= 7; y++) for (let x = 4; x <= 7; x++) set(x, y, [0, 0, 0, 255]);
  } });

  // When
  const prepared = await prepareSeparatedAssets(source.src);

  // Then
  assert.equal(prepared.assets.length, 1);
  assert.equal(prepared.stats.backgroundMode, 'near-white');
  assert(prepared.reviewReasons.includes('near-white-background'));
});

test('Given a low-chroma 249 or high-chroma opaque frame, when separating, then it is rejected', async () => {
  // Given / When / Then
  for (const fill of [[249, 249, 249, 255], [250, 250, 254, 255]]) {
    const source = await png({ width: 48, height: 48, fill });
    await assert.rejects(prepareSeparatedAssets(source.src), /체크무늬|어두운 배경/);
  }
});

test('Given the supplied failed RGB atlas, when separating through the public API, then it is rejected', async () => {
  const bytes = await readFile(new URL('./fixtures/separated-assets/rgb-checkerboard-atlas.png', import.meta.url));
  await assert.rejects(prepareSeparatedAssets(url(bytes)), /체크무늬|어두운 배경/);
});

test('Given foreground crossing an internal cell boundary, when separating, then it remains one reviewable assembly', async () => {
  const source = await png({ width: 48, height: 48, fill: [255, 255, 255, 255], paint: (data, set) => {
    for (let y = 4; y <= 7; y++) for (let x = 9; x <= 14; x++) set(x, y, [0, 0, 0, 255]);
  } });

  const automatic = await prepareSeparatedAssets(source.src);
  const gridded = await prepareSeparatedAssets(source.src, { layout: 'grid' });
  assert.equal(automatic.assets.length, 1);
  assert.equal(automatic.stats.layoutMode, 'whitespace');
  assert(automatic.reviewReasons.includes('grid-boundary-foreground'));
  assert.equal(gridded.assets.length, 1);
  assert.equal(gridded.stats.layoutMode, 'fixed-grid');
  assert.equal(gridded.assignedForegroundPixelCount, gridded.foregroundPixelCount);
  assert(gridded.reviewReasons.includes('grid-boundary-foreground'));
});

test('Given nonuniform whitespace rows, when separating, then row and column projections infer every asset', async () => {
  // Given
  const source = await png({ width: 90, height: 72, fill: [255, 255, 255, 255], paint: (data, set) => {
    for (const [left, top] of [[5, 5], [50, 5], [4, 29], [32, 29], [67, 29], [20, 55]]) {
      for (let y = top; y < top + 6; y++) for (let x = left; x < left + 7; x++) set(x, y, [20, 30, 40, 255]);
    }
  } });

  // When
  const prepared = await prepareSeparatedAssets(source.src);

  // Then
  assert.equal(prepared.assets.length, 6);
  assert.equal(prepared.stats.layoutMode, 'whitespace');
  assert.deepEqual(prepared.assets.map(asset => [asset.x, asset.y]), [[4, 4], [49, 4], [3, 28], [31, 28], [66, 28], [19, 54]]);
});

test('Given disconnected parts in one visual column, when separating, then the parts remain one assembly', async () => {
  // Given
  const source = await png({ width: 72, height: 48, fill: [255, 255, 255, 255], paint: (data, set) => {
    for (const [left, top, width, height] of [[5, 5, 5, 4], [4, 12, 8, 5], [44, 4, 8, 14]]) {
      for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) set(x, y, [20, 30, 40, 255]);
    }
  } });

  // When
  const prepared = await prepareSeparatedAssets(source.src);

  // Then
  assert.equal(prepared.assets.length, 2);
  assert.equal(prepared.assets[0].y, 4);
  assert.equal(prepared.assets[0].height, 14);
});

test('Given the scientific assembly fixture, when separating, then nearby body, scale, beaker and stand parts stay grouped without losing pixels', async () => {
  // Given
  const bytes = await readFile(new URL('./fixtures/separated-assets/scientific-assemblies-atlas.png', import.meta.url));
  const source = await decodeScopedPng(new Uint8Array(bytes));

  // When
  const prepared = await prepareSeparatedAssets(url(bytes));
  const corrected = await prepareEditableAssets(url(bytes), prepared.manualRegions);
  const retainedPixelCount = await assertExactPixelAssignments(source, prepared.assets);

  // Then
  assert.equal(prepared.assets.length, 3);
  assert.equal(prepared.stats.layoutMode, 'whitespace');
  assert(prepared.reviewReasons.includes('nearby-parts-merged'));
  assert.equal(prepared.unassignedForegroundPixelCount, 0);
  assert.equal(retainedPixelCount, prepared.foregroundPixelCount);
  assert.equal(corrected.assets.length, prepared.assets.length);
  assert.deepEqual(corrected.assets.map(asset => asset.label), prepared.assets.map(asset => asset.label));
});

test('Given the compact lab fixture, when separating, then beaker, thermometer and stand assemblies stay independent', async () => {
  const bytes = await readFile(new URL('./fixtures/separated-assets/lab-assemblies-atlas.png', import.meta.url));
  const prepared = await prepareSeparatedAssets(url(bytes));

  assert.equal(prepared.assets.length, 3);
  assert.deepEqual(prepared.assets.map(asset => asset.assignedForegroundPixelCount), [42, 74, 53]);
  assert.equal(prepared.assignedForegroundPixelCount, 169);
  assert.equal(prepared.unassignedForegroundPixelCount, 0);
  assert(prepared.reviewReasons.includes('grid-boundary-foreground'));
});

test('Given a valid four-by-four fixture, when separating, then the fixed-grid path stays available', async () => {
  // Given
  const source = await png({ width: 64, height: 64, fill: [255, 255, 255, 255], paint: (data, set) => {
    for (const [left, top] of [[4, 4], [20, 4], [36, 20]]) {
      for (let y = top; y < top + 5; y++) for (let x = left; x < left + 5; x++) set(x, y, [20, 30, 40, 255]);
    }
  } });

  // When
  const prepared = await prepareSeparatedAssets(source.src);

  // Then
  assert.equal(prepared.assets.length, 3);
  assert.equal(prepared.stats.layoutMode, 'fixed-grid');
});

test('Given the actual generated PNG, when separating, then all ten inferred objects retain every foreground pixel and the source bytes', async () => {
  // Given
  const source = await readFile(new URL('./fixtures/separated-assets/near-white-nonuniform-atlas.png', import.meta.url));
  const before = Buffer.from(source);
  const decodedSource = await decodeScopedPng(new Uint8Array(source));

  // When
  const prepared = await prepareSeparatedAssets(url(source));
  const after = await readFile(new URL('./fixtures/separated-assets/near-white-nonuniform-atlas.png', import.meta.url));
  let retainedPixelCount = 0, mismatchedChannelCount = 0;
  for (const asset of prepared.assets) {
    const decodedAsset = await decodeScopedPng(new Uint8Array(Buffer.from(asset.data.split(',')[1], 'base64')));
    for (let y = 0; y < decodedAsset.height; y++) for (let x = 0; x < decodedAsset.width; x++) {
      const outputOffset = (y * decodedAsset.width + x) * 4;
      if (decodedAsset.data[outputOffset + 3] === 0) continue;
      const sourceOffset = ((asset.y + y) * decodedSource.width + asset.x + x) * 4;
      retainedPixelCount++;
      for (let channel = 0; channel < 4; channel++) if (decodedAsset.data[outputOffset + channel] !== decodedSource.data[sourceOffset + channel]) mismatchedChannelCount++;
    }
  }

  // Then
  assert.equal(prepared.assets.length, 10);
  assert.equal(prepared.stats.layoutMode, 'whitespace');
  assert.equal(prepared.stats.backgroundMode, 'near-white');
  assert.equal(prepared.stats.assignedForegroundPixelCount, prepared.stats.foregroundPixelCount);
  assert.equal(prepared.stats.unassignedForegroundPixelCount, 0);
  assert.equal(prepared.stats.foregroundPixelCount, 328989);
  assert.equal(retainedPixelCount, prepared.stats.foregroundPixelCount);
  assert.equal(mismatchedChannelCount, 0);
  assert.deepEqual(after, before);
});

test('Given more than sixteen whitespace groups, when separating, then none are silently omitted', async () => {
  // Given
  const source = await png({ width: 400, height: 40, fill: [255, 255, 255, 255], paint: (data, set) => {
    for (let index = 0; index < 17; index++) {
      const left = 3 + index * 23;
      for (let y = 10; y < 15; y++) for (let x = left; x < left + 5; x++) set(x, y, [20, 30, 40, 255]);
    }
  } });

  // When
  const unlimited = await prepareSeparatedAssets(source.src);
  const exactLimit = await prepareSeparatedAssets(source.src, { maxAssets: 17 });
  let limitedError;
  try { await prepareSeparatedAssets(source.src, { maxAssets: 16 }); } catch (error) { limitedError = error; }

  // Then
  assert.equal(unlimited.assets.length, 17);
  assert.equal(exactLimit.assets.length, 17);
  assert(unlimited.reviewReasons.includes('asset-count-exceeds-grid'));
  assert(limitedError instanceof RangeError);
  assert.equal(limitedError.code, 'asset-limit-exceeded');
  assert.deepEqual(limitedError.reviewReasons, ['asset-limit-exceeded']);
});

test('Given invalid separation options, when separating, then the public contract rejects them before processing', async () => {
  const source = await png({ width: 48, height: 48, fill: [255, 255, 255, 255] });
  for (const options of [
    { layout: 'rows' }, { layout: null }, { maxAssets: 0 }, { maxAssets: 257 },
    { maxAssets: 1.5 }, { maxAssets: '16' },
  ]) await assert.rejects(prepareSeparatedAssets(source.src, options), RangeError);
});

test('Given an empty atlas, when separating, then a user-facing review error preserves the manual-correction handoff', async () => {
  const source = await png({ width: 48, height: 48, fill: [255, 255, 255, 255] });
  let resultError;
  try { await prepareSeparatedAssets(source.src); } catch (error) { resultError = error; }
  assert(resultError instanceof Error);
  assert.match(resultError.message, /분리할 객체가 없습니다/);
  assert.equal(resultError.code, 'empty-foreground');
  assert.equal(resultError.reviewRequired, true);
  assert.deepEqual(resultError.reviewReasons, ['empty-foreground']);
  assert.equal(resultError.manualCorrectionAvailable, true);
});

test('Given malformed or bounded inputs, when separating through the public API, then strict decode limits propagate', async () => {
  const oversizedIhdr = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAQAEAAAABCAYAAADJXd1mAAAAAElFTkSuQmCC';
  await assert.rejects(prepareSeparatedAssets('data:image/png;base64,AAAA'), /Unsupported or invalid PNG/);
  await assert.rejects(prepareSeparatedAssets(oversizedIhdr), /dimensions exceed limits/);
  const tiny = await png({ width: 7, height: 7, fill: [255, 255, 255, 255] });
  await assert.rejects(prepareSeparatedAssets(tiny.src), /해상도가 부족/);
});

test('Given separated assets, when passed to the core inserter, then each asset becomes an independent group', async () => {
  const source = await png({ width: 48, height: 48, fill: [255, 255, 255, 255], paint: (data, set) => {
    for (const [left, top] of [[3, 3], [27, 15]]) for (let y = top; y < top + 5; y++) for (let x = left; x < left + 5; x++) set(x, y, [20, 30, 40, 255]);
  } });
  const prepared = await prepareSeparatedAssets(source.src);
  const value = { activePageId: 'p', artboard: { w: 100, h: 100 }, objects: [], undoStack: [], redoStack: [], groups: [], activeLayerId: 1 };

  const result = insertEditableAssets({ get: () => value, update: change => change(value) }, prepared, { isCurrent: state => state.activePageId === 'p' });

  assert.equal(prepared.assets.length, 2);
  assert.deepEqual(prepared.assets.map(asset => asset.label), ['객체 1', '객체 2']);
  assert.equal(value.groups.length, 2);
  assert.equal(result.groupIds.length, 2);
  assert.notEqual(value.groups[0].id, value.groups[1].id);
});
