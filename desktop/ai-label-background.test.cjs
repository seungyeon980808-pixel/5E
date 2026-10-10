const test = require('node:test');
const assert = require('node:assert/strict');
const api = import('../js/ai-label-background.js');
const runAPI = import('../js/ai-image-label-run.js');
const cacheAPI = import('../js/ai-output-cache-store.js');
const png = n => 'data:image/png;base64,' + Buffer.from([137,80,78,71,13,10,26,10,n]).toString('base64');

async function contract(changes = {}) {
  const { imageLabelBackgroundContract } = await api;
  return imageLabelBackgroundContract({ sourceSha256: 'original',
    harness: { id: 'rhwp-approved-first-v1', promptSha256: 'style', sourceSha256: 'prepared' },
    payload: { text: 'image request', model: 'sol', effort: 'high', serviceTier: 'priority',
      attachments: [{ name: 'INPUT_SOURCE.png', data: png(0) }], ...changes } });
}

async function cache() {
  const { ExactOutputCacheStore, MemoryOutputCacheBackend } = await cacheAPI;
  return new ExactOutputCacheStore({ backend: new MemoryOutputCacheBackend() });
}

test('RAW survives store recreation without being an approved label workflow result', async () => {
  const { resolveImageLabelBackground } = await api, c = await contract(), store = await cache();
  let calls = 0;
  const generate = async () => ({ data: png(++calls), rendererPrompt: 'actual image tool prompt' });
  const first = await resolveImageLabelBackground({ contract: c, cache: store, generate });
  const { ExactOutputCacheStore } = await cacheAPI;
  const second = await resolveImageLabelBackground({ contract: c, cache: new ExactOutputCacheStore({ backend: store.backend }), generate });
  assert.equal(calls, 1); assert.equal(first.data, second.data); assert.equal(second.reused, 'storage');
  const saved = await store.get(c.key);
  assert.equal(saved.entry.output.imageLabelRun, undefined);
  assert.equal(saved.entry.output.imageLabelBackground.accepted, undefined);
  assert.equal(second.rendererPrompt, first.rendererPrompt);
});

test('saved task preserves RAW without storage; unknown and corrupted candidates cannot bind', async () => {
  const { resolveImageLabelBackground } = await api, c = await contract();
  let calls = 0;
  const generate = async () => ({ data: png(++calls) });
  const first = await resolveImageLabelBackground({ contract: c, generate });
  const candidate = { data: first.data, sourceSha256: first.sourceSha256, candidateSha256: first.candidateSha256,
    imageLabelWorkflow: { imageKind: 'general', labelResult: 'remove' }, workflowMetrics: { generationHarness: first.harness } };
  const restored = await resolveImageLabelBackground({ contract: c, candidates: [JSON.parse(JSON.stringify(candidate))],
    cache: { get: () => assert.fail('task reuse precedes storage') }, generate });
  assert.equal(restored.reused, 'candidate'); assert.equal(calls, 1);
  await resolveImageLabelBackground({ contract: c, candidates: [{ ...candidate, data: png(99) }], generate });
  await resolveImageLabelBackground({ contract: c, candidates: [{ ...candidate, workflowMetrics: {} }], generate });
  assert.equal(calls, 3);
});

for (const [name, change] of Object.entries({ text: { text: 'change wiring' }, model: { model: 'luna' },
  effort: { effort: 'medium' }, serviceTier: { serviceTier: 'standard' },
  input: { attachments: [{ name: 'INPUT_SOURCE.png', data: png(99) }] } })) {
  test(`changed ${name} requires its own background`, async () => {
    const { resolveImageLabelBackground } = await api, store = await cache(); let calls = 0;
    const generate = async () => ({ data: png(++calls) });
    const a = await contract(), b = await contract(change);
    assert.notEqual(a.key, b.key);
    await resolveImageLabelBackground({ contract: a, cache: store, generate });
    await resolveImageLabelBackground({ contract: b, cache: store, generate });
    assert.equal(calls, 2);
  });
}

test('corrupted persistent RAW is discarded rather than reused', async () => {
  const { resolveImageLabelBackground } = await api, c = await contract(), store = await cache(); let calls = 0;
  const generate = async () => ({ data: png(++calls) });
  await resolveImageLabelBackground({ contract: c, cache: store, generate });
  store.backend.entries.get(c.key).output.imageLabelBackground.data = png(99);
  const replaced = await resolveImageLabelBackground({ contract: c, cache: store, generate });
  assert.equal(calls, 2); assert.equal(replaced.reused, false);
});

test('concurrent requests share one generation, and cancelling a follower leaves the owner running', async () => {
  const { resolveImageLabelBackground } = await api, c = await contract({ text: 'concurrent' });
  let complete, calls = 0;
  const generate = () => { calls++; return new Promise(resolve => { complete = resolve; }); };
  const owner = resolveImageLabelBackground({ contract: c, generate });
  const signal = new AbortController();
  const follower = resolveImageLabelBackground({ contract: c, generate, signal: signal.signal });
  const other = resolveImageLabelBackground({ contract: c, generate });
  signal.abort(); await assert.rejects(follower, { name: 'AbortError' });
  complete({ data: png(1) });
  const [a, b] = await Promise.all([owner, other]);
  assert.equal(calls, 1); assert.equal(a.data, b.data); assert.equal(b.reused, 'concurrent');
});

test('failed or aborted generation never becomes a stored background or an automatic retry', async () => {
  const { resolveImageLabelBackground } = await api, c = await contract({ text: 'failure' }), store = await cache();
  await assert.rejects(resolveImageLabelBackground({ contract: c, cache: store, generate: async () => { throw Error('no image'); } }), /no image/);
  const signal = new AbortController();
  await assert.rejects(resolveImageLabelBackground({ contract: c, cache: store, signal: signal.signal,
    generate: async () => { signal.abort(); return { data: png(1) }; } }), { name: 'AbortError' });
  assert.equal((await store.stats()).entryCount, 0);
});

test('off → on → off uses one RAW despite workflow-cache bypass and uncertain review', async () => {
  const { executeImageLabelRun, imageLabelDigest } = await runAPI;
  const { SOURCE_LABEL_POLICY_VERSION } = await import('../js/ai-editable-image-labels.js');
  const wire = await import('../js/ai-source-observation-wire.js');
  const data = png(0), backgrounds = await cache(); let generations = 0, observation;
  const plan = { version: 4, frozen: true, policyVersion: SOURCE_LABEL_POLICY_VERSION,
    observationVersion: wire.SOURCE_OBSERVATION_VERSION, leaderObservationVersion: wire.SOURCE_LEADER_OBSERVATION_VERSION,
    observationContractRevision: wire.SOURCE_OBSERVATION_CONTRACT_REVISION,
    sourceBindings: [{ transportSha256: await imageLabelDigest(data) }], labels: [], excludedLabels: [], uncertainties: [] };
  const options = { source: { data }, generationInstructions: 'same request', backgroundCache: backgrounds, bypassCache: true,
    selection: { model: 'sol', effort: 'high' }, onObservation: v => { observation = v; },
    observer: { analyze: async () => structuredClone(plan), review: async () => ({ verdict: 'uncertain', checks: [], issues: [] }) },
    raster: { generate: async () => ({ src: png(++generations), imageToolCalls: 1 }) } };
  const results = [];
  for (const labelResult of ['remove', 'restore-editable', 'remove']) {
    results.push(await executeImageLabelRun({ ...options, observation, previousCandidate: results.at(-1),
      workflow: { imageKind: 'general', labelResult, verificationMode: 'draft-first' } }));
  }
  assert.equal(generations, 1); assert.equal(new Set(results.map(r => r.data)).size, 1);
  assert.deepEqual(results.map(r => r.metrics.calls.fullGeneration), [1, 0, 0]);
  assert.ok(results.every(r => r.accepted === false));
  assert.equal(results[0].labelPlan, null); assert.ok(results[1].labelPlan); assert.equal(results[2].labelPlan, null);
  const separateTask = await executeImageLabelRun({ ...options, workflow: { imageKind: 'general', labelResult: 'remove' } });
  assert.equal(separateTask.data, results[0].data); assert.equal(separateTask.metrics.backgroundReused, 'storage');
  assert.equal(generations, 1);
});
