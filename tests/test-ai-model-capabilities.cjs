const assert = require('node:assert/strict');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const moduleAt = name => import(pathToFileURL(path.join(__dirname, '../preview/js', name)));
const catalog = [
  { model: 'gpt-6-sol', displayName: 'GPT-6 Sol', isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: 'medium' }, { reasoningEffort: 'ultra' }], defaultReasoningEffort: 'medium', serviceTiers: [{ id: 'priority' }], defaultServiceTier: null },
  { id: 'gpt-6-luna', supportedReasoningEfforts: ['low', { effort: 'high' }], defaultReasoningEffort: 'low', serviceTiers: ['flex'], defaultServiceTier: null },
  { model: 'gpt-5.6-sol', supportedReasoningEfforts: ['medium', 'high'], defaultReasoningEffort: 'medium', serviceTiers: ['priority'], defaultServiceTier: null },
];
const selections = [
  { model: 'gpt-6-sol', effort: 'ultra', serviceTier: 'priority' },
  { model: 'gpt-6-luna', effort: 'low', serviceTier: null },
  { model: 'gpt-6-luna', effort: 'high', serviceTier: 'flex' },
];
const source = { name: 'source.png', data: 'data:image/png;base64,c291cmNl', referenceRole: 'INPUT_SOURCE' };
const select = x => ({ model: x.model, effort: x.effort, serviceTier: x.serviceTier });
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const spec = { version: 1, sourceCount: 1, profiles: [], components: [{ id: 'a', label: 'circle', source: 1, count: 1, stage: '', evidence: 'one visible circle' }], relations: [], marks: [], uncertainties: [] };
const checks = ['object-counts', 'inside-outside', 'liquid-occupancy', 'connections', 'composition-state', 'black-fill-meaning', 'presentation', 'request-scope'];
const report = verdict => JSON.stringify({ verdict, checks: checks.map(id => ({ id, label: id, status: verdict, detail: 'Source and candidate directly compared.' })), issues: verdict === 'fail' ? [{ message: 'Missing circle', severity: 'major' }] : [] });
const reviewOptions = selection => ({ ...selection, models: catalog, candidate: { id: 'candidate-1', data: 'candidate-bytes', name: 'Candidate' }, originalAttachments: [source], prepareCandidateAttachment: async candidate => ({ name: candidate.name, data: candidate.data }), makeCorrectionPayload: async () => ({ ...selection, text: 'Correct once', purpose: 'image', attachments: [source] }), acceptCorrectionImage: async () => ({ id: 'candidate-2', data: 'corrected-bytes' }) });

for (const selection of selections) {
  test(`approved-first preserves ${JSON.stringify(selection)}`, async () => {
    const { approvedFirstRun } = await moduleAt('ai-approved-first-png.js');
    const input = { ...selection, attachments: [source], unrelated: 'preserved' };
    const before = structuredClone(input);
    const run = approvedFirstRun(input, catalog);
    assert.deepEqual(select(run), selection);
    assert.equal(run.approvedFirstPng, true);
    assert.equal(run.unrelated, 'preserved');
    assert.deepEqual(input, before);
  });
  test(`structure transport preserves ${JSON.stringify(selection)}`, async () => {
    const { createStructureAnalysisController } = await moduleAt('ai-structure-spec.js');
    const sent = [];
    const controller = createStructureAnalysisController({ transport: { send: async payload => { sent.push(payload); return { turnId: 'analysis-1' }; } } });
    const pending = controller.analyze({ ...selection, models: catalog, request: 'Observe', attachments: [source] });
    try {
      await flush();
      assert.equal(sent.length, 1);
      assert.deepEqual(select(sent[0]), selection);
      assert.equal(sent[0].purpose, 'chat');
      controller.handleEvent({ kind: 'assistant', turnId: 'analysis-1', text: JSON.stringify(spec) });
      controller.handleEvent({ kind: 'done', turnId: 'analysis-1', status: 'completed' });
      assert.deepEqual(await pending, spec);
    } finally { controller.cancel(); await pending.catch(() => {}); }
  });
  test(`review transport and emitted receipt preserve ${JSON.stringify(selection)}`, async () => {
    const { createAiImageReviewController } = await moduleAt('ai-image-review.js');
    const sent = [], states = [];
    const controller = createAiImageReviewController({ transport: { send: async payload => { sent.push(payload); return { turnId: 'review-1' }; } }, onState: state => states.push(state) });
    try {
      assert.equal(await controller.start(reviewOptions(selection)), true);
      assert.deepEqual(select(sent[0]), selection);
      assert.equal(sent[0].purpose, 'chat');
      controller.handleEvent({ kind: 'assistant', turnId: 'review-1', text: report('pass') });
      controller.handleEvent({ kind: 'done', turnId: 'review-1', status: 'completed' });
      await flush();
      assert.equal(controller.getState().state, 'passed');
      assert.deepEqual(select(states.at(-1)), selection);
    } finally { controller.cancel(); }
  });
}

const invalidCases = [
  ['missing selected model', { ...selections[0], model: 'removed-model' }, catalog],
  ['unsupported effort', { ...selections[1], effort: 'ultra' }, catalog],
  ['unsupported tier', { ...selections[1], serviceTier: 'priority' }, catalog],
  ['old bridge response', selections[0], { models: catalog }],
  ['malformed catalog item', selections[0], [null, ...catalog]],
  ['duplicate model IDs', selections[0], [...catalog, catalog[0]]],
  ['missing effort capabilities', selections[0], [{ ...catalog[0], supportedReasoningEfforts: undefined }]],
  ['missing tier capabilities', selections[0], [{ ...catalog[0], serviceTiers: undefined }]],
  ['hidden selected model', selections[0], [{ ...catalog[0], hidden: true }]],
  ['malformed effort option', selections[0], [{ ...catalog[0], supportedReasoningEfforts: [null] }]],
  ['malformed tier option', selections[0], [{ ...catalog[0], serviceTiers: [{}] }]],
];
for (const [name, selection, models] of invalidCases) {
  test(`${name}: all request paths fail before transport with refresh/update remedy`, async () => {
    const { approvedFirstRun } = await moduleAt('ai-approved-first-png.js');
    const { createStructureAnalysisController } = await moduleAt('ai-structure-spec.js');
    const { createAiImageReviewController } = await moduleAt('ai-image-review.js');
    const matches = error => error.message.includes(selection.model) && /새로고침|업데이트/.test(error.message);
    assert.throws(() => approvedFirstRun({ ...selection, attachments: [source] }, models), matches);
    let sends = 0;
    const transport = { send: async () => { sends++; return { turnId: 'unexpected' }; } };
    const analysis = createStructureAnalysisController({ transport });
    await assert.rejects(analysis.analyze({ ...selection, models, attachments: [source] }), matches);
    const review = createAiImageReviewController({ transport });
    assert.equal(await review.start({ ...reviewOptions(selection), models, modelAvailable: true }), false);
    assert.equal(review.getState().state, 'failed');
    assert.match(review.getState().report.issues[0].message, /새로고침|업데이트/);
    assert.ok(review.getState().report.issues[0].message.includes(selection.model));
    assert.equal(sends, 0);
  });
}

test('provider defaults apply only to absent preferences; stale explicit preferences never fall back', async () => {
  const { defaultAIModelSelection, resolveAIModelSelection, readAIModelCatalog } = await moduleAt('ai-model-capabilities.js');
  assert.deepEqual(defaultAIModelSelection({ data: catalog }), { model: 'gpt-6-sol', effort: 'medium', serviceTier: null });
  assert.deepEqual(defaultAIModelSelection(catalog, { model: 'gpt-6-luna' }), selections[1]);
  assert.deepEqual(defaultAIModelSelection(catalog, selections[1]), selections[1]);
  for (const preferences of [{ model: 'stale' }, { model: 'gpt-6-luna', effort: 'ultra' }, { model: 'gpt-6-luna', serviceTier: 'priority' }]) assert.throws(() => defaultAIModelSelection(catalog, preferences), /새로고침|업데이트/);
  assert.throws(() => resolveAIModelSelection({ model: 'gpt-6-sol', effort: null, serviceTier: null }, catalog), /추론/);
  const normalized = readAIModelCatalog({ data: catalog });
  assert.deepEqual(normalized[1].efforts, ['low', 'high']);
  assert.deepEqual(normalized[1].tiers, ['flex']);
  assert.deepEqual(resolveAIModelSelection(selections[1], catalog), selections[1]);
});

test('correction cannot silently override the selected configuration', async () => {
  const { createAiImageReviewController } = await moduleAt('ai-image-review.js');
  const sent = [];
  const controller = createAiImageReviewController({ transport: { send: async payload => { sent.push(payload); return { turnId: `review-${sent.length}` }; } } });
  await controller.start({ ...reviewOptions(selections[1]), makeCorrectionPayload: async () => ({ ...selections[0], text: 'wrong model', purpose: 'image' }) });
  controller.handleEvent({ kind: 'assistant', turnId: 'review-1', text: report('fail') });
  controller.handleEvent({ kind: 'done', turnId: 'review-1', status: 'completed' });
  await flush();
  assert.equal(sent.length, 1);
  assert.equal(controller.getState().state, 'failed');
  assert.match(controller.getState().report.issues.at(-1).message, /선택/);
});

test('model selection does not turn text-only or image-tool violations into success', async () => {
  const { createAiImageReviewController } = await moduleAt('ai-image-review.js');
  const controller = createAiImageReviewController({ transport: { send: async () => ({ turnId: 'review-1' }) } });
  assert.equal(await controller.start(reviewOptions(selections[1])), true);
  controller.handleEvent({ kind: 'assistant', turnId: 'review-1', text: 'Success: image generated.' });
  controller.handleEvent({ kind: 'done', turnId: 'review-1', status: 'completed' });
  await flush();
  assert.equal(controller.getState().state, 'failed');
  const { createStructureAnalysisController } = await moduleAt('ai-structure-spec.js');
  const analysis = createStructureAnalysisController({ transport: { send: async () => ({ turnId: 'analysis-1' }) } });
  const pending = analysis.analyze({ ...selections[1], models: catalog, attachments: [source] });
  await flush();
  analysis.handleEvent({ kind: 'image', turnId: 'analysis-1', data: 'not-an-observation' });
  await assert.rejects(pending, /이미지 생성/);
});

for (const selection of selections.slice(0, 2)) {
  test(`review-correction-review preserves captured settings despite caller mutation: ${selection.model}`, async () => {
    const { createAiImageReviewController } = await moduleAt('ai-image-review.js');
    const sent = [];
    const controller = createAiImageReviewController({ transport: { send: async payload => { sent.push(payload); return { turnId: `turn-${sent.length}` }; } } });
    const options = reviewOptions(selection);
    assert.equal(await controller.start(options), true);
    options.model = 'stale-after-start';
    options.effort = 'unsupported';
    options.serviceTier = 'unsupported';
    controller.handleEvent({ kind: 'assistant', turnId: 'turn-1', text: report('fail') });
    controller.handleEvent({ kind: 'done', turnId: 'turn-1', status: 'completed' });
    await flush();
    assert.equal(sent.length, 2);
    assert.equal(sent[1].purpose, 'image');
    controller.handleEvent({ kind: 'image', turnId: 'turn-2', src: 'fixture-correction-image' });
    controller.handleEvent({ kind: 'done', turnId: 'turn-2', status: 'completed' });
    await flush();
    assert.equal(sent.length, 3);
    controller.handleEvent({ kind: 'assistant', turnId: 'turn-3', text: report('pass') });
    controller.handleEvent({ kind: 'done', turnId: 'turn-3', status: 'completed' });
    await flush();
    assert.equal(controller.getState().state, 'passed');
    for (const payload of sent) assert.deepEqual(select(payload), selection);
    assert.equal(controller.getState().generationCount, 2);
  });
}

test('text-only correction cannot claim generated image success', async () => {
  const { createAiImageReviewController } = await moduleAt('ai-image-review.js');
  const sent = [];
  const controller = createAiImageReviewController({ transport: { send: async payload => { sent.push(payload); return { turnId: `turn-${sent.length}` }; } } });
  assert.equal(await controller.start(reviewOptions(selections[1])), true);
  controller.handleEvent({ kind: 'assistant', turnId: 'turn-1', text: report('fail') });
  controller.handleEvent({ kind: 'done', turnId: 'turn-1', status: 'completed' });
  await flush();
  assert.equal(sent.length, 2);
  controller.handleEvent({ kind: 'assistant', turnId: 'turn-2', text: 'Created PNG successfully.' });
  controller.handleEvent({ kind: 'done', turnId: 'turn-2', status: 'completed' });
  await flush();
  assert.equal(controller.getState().state, 'failed');
  assert.match(controller.getState().report.issues.at(-1).message, /이미지 결과가 없습니다/);
  assert.equal(sent.length, 2);
});

test('explicit null or undefined saved model is invalid; only an absent model defaults', async () => {
  const { defaultAIModelSelection } = await moduleAt('ai-model-capabilities.js');
  for (const model of [null, undefined, '', ' ', false, 0]) {
    assert.throws(() => defaultAIModelSelection(catalog, { model }), /선택 모델.*새로고침/);
    assert.throws(() => defaultAIModelSelection(catalog, { model, effort: 'medium', serviceTier: null }), /선택 모델.*새로고침/);
  }
  assert.deepEqual(defaultAIModelSelection(catalog), { model: 'gpt-6-sol', effort: 'medium', serviceTier: null });
  assert.deepEqual(defaultAIModelSelection(catalog, { effort: 'medium', serviceTier: null }), { model: 'gpt-6-sol', effort: 'medium', serviceTier: null });
  assert.deepEqual(defaultAIModelSelection(catalog, { model: 'gpt-6-luna', effort: 'low', serviceTier: null }), selections[1]);
});
