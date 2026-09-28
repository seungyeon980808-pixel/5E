const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const { fixture, root } = require('./helpers/separation-fixtures.cjs');
const evidence = process.env.TASK6_EVIDENCE || path.join(root, '.omo/evidence/ai-workbench-polish-0928/task6');
fs.mkdirSync(evidence, { recursive: true });
const load = file => import(pathToFileURL(path.join(root, 'preview/js', file)));

test('separated modes force connected background and restore each previous single preference', async () => {
  const { transitionSeparationMode } = await load('ai-separation-mode.js');
  for (const backgroundPolicy of ['preserve', 'connected', 'checkerboard']) {
    // Given: a single image with independently chosen output options.
    const initial = { separationMode: 'off', outputOptions: { backgroundPolicy, lineThickness: 2, examPalette: true } };
    const frozen = structuredClone(initial);
    // When: entering and changing separated modes, then returning to single.
    let current = transitionSeparationMode(initial, 'auto');
    for (const separationMode of ['grid', 'manual', 'auto']) current = transitionSeparationMode(current, separationMode);
    // Then: forced background never overwrites the saved preference or input.
    assert.equal(current.backgroundLocked, true);
    assert.equal(current.outputOptions.backgroundPolicy, 'connected');
    assert.equal(current.singleBackgroundPolicy, backgroundPolicy);
    const restored = transitionSeparationMode(current, 'off');
    assert.deepEqual(restored.outputOptions, initial.outputOptions);
    assert.equal(restored.backgroundLocked, false);
    assert.deepEqual(initial, frozen);
  }
  fs.writeFileSync(path.join(evidence, 'mode-contract.json'), JSON.stringify({ preferences: ['preserve', 'connected', 'checkerboard'], modes: ['auto', 'grid', 'manual'], restored: true }));
});

test('local separation retains every object pixel and enclosed white while leaving source bytes intact', async () => {
  // Given: an edge object, an enclosed white ring and a third independent object.
  const source = await fixture();
  const original = source.dataUrl;
  const { prepareSeparatedAssets } = await load('ai-separated-assets.js');
  const { decodeScopedPng } = await load('ai-scoped-edit-png.js');
  // When: directly running the production local pipeline, which has no generation adapter.
  const prepared = await prepareSeparatedAssets(source.dataUrl);
  // Then: isolated PNG alpha masks assign all three objects once with exact RGBA.
  assert.equal(prepared.assets.length, 3);
  assert.equal(prepared.stats.assignmentVerified, true);
  assert.equal(prepared.stats.rgbaVerified, true);
  assert.equal(prepared.stats.unassignedForegroundPixelCount, 0);
  const owners = new Uint8Array(source.width * source.height);
  let assigned = 0;
  for (const [index, asset] of prepared.assets.entries()) {
    const bytes = Buffer.from(asset.data.split(',')[1], 'base64');
    const png = await decodeScopedPng(bytes);
    assert.deepEqual(asset.sourceBounds, { x: asset.x, y: asset.y, width: png.width, height: png.height });
    let transparent = 0;
    for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
      const offset = (y * png.width + x) * 4;
      if (!png.data[offset + 3]) { transparent++; continue; }
      const pixel = (asset.y + y) * source.width + asset.x + x;
      assert.equal(owners[pixel], 0, 'no duplicated pixel ownership');
      owners[pixel] = index + 1; assigned++;
      assert.deepEqual(png.data.subarray(offset, offset + 4), source.data.subarray(pixel * 4, pixel * 4 + 4));
    }
    assert.ok(transparent > 0);
    fs.writeFileSync(path.join(evidence, `object-${index + 1}.png`), bytes);
  }
  assert.equal(assigned, 2175);
  assert.equal(prepared.assignedForegroundPixelCount, assigned);
  assert.ok(owners[40 * source.width + 80], 'the white ring interior remains opaque');
  assert.ok(owners[40 * source.width], 'edge-contact pixels remain assigned');
  assert.equal(owners[10 * source.width + 10], 0, 'outside white becomes transparent');
  assert.equal(source.dataUrl, original);
  fs.writeFileSync(path.join(evidence, 'original.png'), source.bytes);
  fs.writeFileSync(path.join(evidence, 'pixel-accounting.json'), JSON.stringify({ assigned, regions: prepared.assets.map(({ id, sourceBounds, foregroundPixelCount }) => ({ id, sourceBounds, foregroundPixelCount })), originalUnchanged: true }, null, 2));
});

test('empty, noisy and limited images never produce a misleading ready separation', async () => {
  // Given: inputs without a valid complete object assignment.
  const { prepareSeparatedAssets } = await load('ai-separated-assets.js');
  const empty = await fixture({ empty: true });
  const noisy = await fixture({ noisy: true });
  const source = await fixture();
  // When: each is analyzed by the real pipeline.
  await assert.rejects(prepareSeparatedAssets(empty.dataUrl), error => error.code === 'empty-foreground' && error.reviewRequired);
  const noise = await prepareSeparatedAssets(noisy.dataUrl);
  const limited = await prepareSeparatedAssets(source.dataUrl, { maxAssets: 1 });
  const timedOut = await prepareSeparatedAssets(source.dataUrl, { maxDurationMs: 0 });
  // Then: no fallback can be reported as usable assets.
  for (const result of [noise, limited, timedOut]) {
    assert.equal(result.fallbackToOriginal, true);
    assert.equal(result.assets.length, 0);
    assert.equal(result.stats.analysisCompleted, false);
    assert.equal(result.originalData, result === noise ? noisy.dataUrl : source.dataUrl);
  }
  fs.writeFileSync(path.join(evidence, 'failure-outcomes.json'), JSON.stringify([noise, limited, timedOut].map(result => ({ reasons: result.reviewReasons, count: result.assets.length, fallback: result.fallbackToOriginal })), null, 2));
});

test('abort during analysis discards work and a clean retry preserves original data', async () => {
  // Given: a large image and an abort signal.
  const source = await fixture({ width: 1600, height: 1000 });
  const original = source.dataUrl;
  const { prepareSeparatedAssets } = await load('ai-separated-assets.js');
  const controller = new AbortController();
  // When: cancellation arrives while the analysis promise is pending.
  const pending = prepareSeparatedAssets(source.dataUrl, { signal: controller.signal });
  const timer = setTimeout(() => controller.abort('test-cancel'), 0);
  try { await assert.rejects(pending, { name: 'AbortError' }); } finally { clearTimeout(timer); }
  // Then: retry with a fresh signal completes, with the original untouched.
  const retry = await prepareSeparatedAssets(source.dataUrl);
  assert.equal(retry.assets.length, 3);
  assert.equal(source.dataUrl, original);
  fs.writeFileSync(path.join(evidence, 'abort-retry.json'), JSON.stringify({ cancelled: controller.signal.aborted, retryCount: retry.assets.length, originalUnchanged: true }));
});
