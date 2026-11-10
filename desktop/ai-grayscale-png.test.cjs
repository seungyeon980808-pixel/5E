const nodeTest = require('node:test');
const test = (name, fn) => nodeTest(name, { timeout: 15000 }, fn);
const assert = require('node:assert/strict');
const gray = import('../js/ai-grayscale-png.js');
const runAPI = import('../js/ai-image-label-run.js');
const inspectAPI = import('../js/ai-png-inspection.js');
const cacheAPI = import('../js/ai-output-cache-store.js');
const png = n => 'data:image/png;base64,' + Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, n]).toString('base64');

// 1,536x1024 크기의 색 섞인 가짜 RGBA(알파 255와 일부 반투명 픽셀 포함)로 순수 변환을 검사한다.
function colorfulRgba(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    const k = i / 4;
    data[i] = (k * 7) % 256; data[i + 1] = (k * 13 + 5) % 256; data[i + 2] = (k * 29 + 11) % 256;
    data[i + 3] = k % 97 === 0 ? 128 : 255;
  }
  for (let i = 0; i < 4 * 16; i += 4) { data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255; }
  return data;
}

test('pure grayscale makes every pixel R=G=B with luminance and keeps alpha and white', async () => {
  const { grayscaleRgbaInPlace } = await gray;
  const pixels = new Uint8ClampedArray([255, 255, 255, 255, 200, 10, 30, 255, 0, 0, 255, 128]);
  grayscaleRgbaInPlace(pixels);
  assert.deepEqual([...pixels], [255, 255, 255, 255, 69, 69, 69, 255, 29, 29, 29, 128]);
  const { inspectRgbaPixels } = await inspectAPI;
  const big = colorfulRgba(1536, 1024);
  const alphaBefore = big.filter((_, i) => i % 4 === 3).reduce((n, a) => n + (a !== 255 ? 1 : 0), 0);
  const started = performance.now();
  grayscaleRgbaInPlace(big);
  const ms = performance.now() - started;
  const report = inspectRgbaPixels(big, 1536, 1024);
  assert.equal(report.strictlyAchromatic, true);
  assert.equal(report.chromaticPixels, 0);
  assert.equal(report.nonOpaquePixels, alphaBefore, 'alpha is preserved');
  assert.ok(ms < 300, `pure pass took ${ms}ms`);
});

test('grayscale wrapper reports applied output and falls back to the source PNG on conversion failure', async () => {
  const { grayscaleGeneratedPng } = await gray;
  const ok = await grayscaleGeneratedPng(png(1), { convert: async () => png(2) });
  assert.equal(ok.applied, true); assert.equal(ok.data, png(2)); assert.equal(ok.reason, null);
  const failed = await grayscaleGeneratedPng(png(3), { convert: async () => { throw new Error('decode failed'); } });
  assert.equal(failed.applied, false); assert.equal(failed.data, png(3)); assert.match(failed.reason, /decode failed/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(grayscaleGeneratedPng(png(4), { signal: controller.signal, convert: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); } }), { name: 'AbortError' });
});

async function labelSetup(overrides = {}) {
  const { SOURCE_LABEL_POLICY_VERSION } = await import('../js/ai-editable-image-labels.js');
  const { SOURCE_OBSERVATION_CONTRACT_REVISION, SOURCE_LEADER_OBSERVATION_VERSION } = await import('../js/ai-source-observation-wire.js');
  const plan = { version: 4, observationVersion: 1, leaderObservationVersion: SOURCE_LEADER_OBSERVATION_VERSION, sourceLeaderObservations: [],
    observationContractRevision: SOURCE_OBSERVATION_CONTRACT_REVISION, policyVersion: SOURCE_LABEL_POLICY_VERSION, frozen: true, labels: [], uncertainties: [],
    excludedLabels: [], removalRegions: [], sourceBindings: [], ...overrides };
  return plan;
}

test('label ON and OFF share one grayscale-converted generated image (converter runs once, cached)', async () => {
  const { executeImageLabelRun } = await runAPI;
  const { ExactOutputCacheStore, MemoryOutputCacheBackend } = await cacheAPI;
  const source = png(9);
  const generated = png(7);
  const converted = png(8);
  const backgroundCache = new ExactOutputCacheStore({ backend: new MemoryOutputCacheBackend() });
  const calls = { grayscale: 0, generate: 0 };
  const plan = await labelSetup();
  const observer = {
    analyze: async () => structuredClone(plan),
    review: async () => { throw new Error('review must not run'); },
  };
  const raster = { generate: async () => { calls.generate++; return { src: generated, imageToolCalls: 1 }; }, cancel() {} };
  const grayscale = async (data, { signal } = {}) => { calls.grayscale++; assert.equal(data, generated); return { data: converted, applied: true, reason: null, ms: 1 }; };
  const base = { source: { name: 'input', data: source }, selection: { model: 'test', effort: 'low' }, observer, raster, grayscale, backgroundCache, queue: false,
    fallback: false, retryPolicy: { attempts: 1, backoffMs: [0], analysisTimeoutMs: [0], generationTimeoutMs: [0] } };
  const off = await executeImageLabelRun({ ...base, workflow: { imageKind: 'general', labelResult: 'remove' } });
  const on = await executeImageLabelRun({ ...base, workflow: { imageKind: 'general', labelResult: 'restore-editable' },
    readText: async () => ({ text: '[]' }), bypassCache: true });
  assert.equal(off.data, converted);
  assert.equal(on.data, converted, 'label ON must use the same converted pixels as label OFF');
  assert.equal(calls.generate, 1, 'generation runs once for the shared background');
  assert.equal(calls.grayscale, 1, 'grayscale runs once before caching');
  assert.equal(off.metrics.grayscale.applied, true);
});

