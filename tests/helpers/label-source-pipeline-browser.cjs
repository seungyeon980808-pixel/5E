const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { installLabelSourcePage } = require('./label-source-browser.cjs');
const root = path.resolve(__dirname, '../..');

// Explicit synthetic protocol fixture. The retained seed still draws exactly
// the same PNGs; this declaration is not an AI observation of those pixels.
function syntheticPipelineObservation() {
  return { version: 4, observationVersion: 1, leaderObservationVersion: 1,
    observationContractRevision: '1.4.0', removalOnlyItems: [], reviewRequired: false,
    geometryLock: { version: 1, objects: [{ id: 'frame', sourceRef: 1, role: 'scientific-object',
      description: 'Synthetic rectangle identity', bounds: { x: .078125, y: .1302083333, w: .8203125, h: .7291666667 }, relations: [] }] },
    labels: [{ id: 'source-1-electron', sourceKind: 'reference', sourceRef: 1, scope: 'general', text: '• 전자',
      disposition: 'restore', semanticRole: 'scientific-label', reason: 'Synthetic scientific label for transport and native editing regression',
      leaderPresence: 'present', mode: 'leader', contentMode: 'plain', position: { x: .72, y: .65 }, leaderDash: 'dotted',
      leaderRoutes: [
        { kind: 'polyline', attachment: 'label', start: { x: .72, y: .65 }, target: { x: .3, y: .3 }, controls: [{ x: .5, y: .55 }], end: 'filled-arrow' },
        { kind: 'polyline', attachment: 'label', start: { x: .72, y: .65 }, target: { x: .4, y: .2 }, controls: [{ x: .5, y: .55 }], end: 'filled-arrow' },
      ],
      targetBinding: { status: 'confirmed', objectId: 'frame', reason: 'Explicit synthetic target identity' },
      typography: { role: 'text', size: { w: .16, h: .08 } },
    }], preservedMarks: [], uncertainties: [], removalRegions: [], protectedRegions: [], inkSearchRegions: [] };
}

function syntheticBatchPipelineObservation() {
  const observation = syntheticPipelineObservation();
  // The unchanged multiselect RAW has its right rectangle at x=300..420,
  // y=70..250. Its lifecycle counterpart has a different drawing. Declare
  // this synthetic positive below that rectangle, at x=.72/y=.75, where the
  // existing RAW is white. Do not mutate either retained PNG or a frozen plan.
  const label = observation.labels[0];
  label.position.y = .75;
  for (const route of label.leaderRoutes) route.start.y = .75;
  return observation;
}

// These exact strings/coordinates are retained from the joint native fixture.
// Figure mode now distinguishes a restorable panel marker from its caption.
function syntheticJointObservation(mode) {
  const labels = [
    { id: 'a', text: 'm_B', sourceRef: 1, scope: 'general', leaderPresence: 'absent', mode: 'text', contentMode: 'formula',
      position: { x: mode === 'fallback' ? .01 : .42, y: .2 }, typography: { role: 'quantity', bounds: { x: mode === 'fallback' ? 0 : .385, y: .18, w: .07, h: .04 } },
      targetBinding: { status: 'confirmed', objectId: 'object', reason: 'Explicit synthetic rectangle identity' }, relationGroup: { id: 'formula-phrase', kind: 'phrase', order: 0 } },
    { id: 'b', text: 'v', sourceRef: 1, scope: 'general', leaderPresence: 'absent', mode: 'text', contentMode: 'formula',
      position: { x: mode === 'fallback' ? .11 : .52, y: .2 }, typography: { role: 'quantity', bounds: { x: mode === 'fallback' ? .075 : .485, y: .18, w: .07, h: .04 } },
      targetBinding: { status: 'confirmed', objectId: 'object', reason: 'Same explicit synthetic rectangle' }, relationGroup: { id: 'formula-phrase', kind: 'phrase', order: 1 } },
  ];
  for (const label of labels) Object.assign(label, { disposition: 'restore', semanticRole: 'scientific-label', reason: 'Synthetic formula classification for native group regression only' });
  if (mode === 'figure') for (const [index, label] of labels.entries()) {
    label.text = index ? '그림 1' : '(가)'; label.contentMode = 'plain'; label.typography.role = 'text';
    label.disposition = index ? 'remove-only' : 'restore'; label.semanticRole = index ? 'caption' : 'panel-marker';
    label.reason = index ? 'Synthetic page caption is removal-only' : 'Synthetic essential panel marker';
    label.targetBinding = { status: 'confirmed', bindingKind: 'figure', sourceRef: 1, reason: 'Explicit synthetic caption or panel role' };
    delete label.relationGroup;
  }
  return { version: 4, observationVersion: 1, leaderObservationVersion: 1, observationContractRevision: '1.4.0', removalOnlyItems: [], labels,
    geometryLock: { version: 1, objects: [{ id: 'object', sourceRef: 1, role: 'scientific-object', description: 'Synthetic rectangle in lower left', bounds: { x: .125, y: .58, w: .12, h: .16 }, relations: [] }] },
    uncertainties: [], preservedMarks: [], removalRegions: [], protectedRegions: [], inkSearchRegions: [] };
}

function installSyntheticNativeCatalog() {
  const models = window.fiveEDesktop.models;
  window.fiveEDesktop.models = async () => {
    const result = await models();
    return { ...result, data: [...result.data, ...['gpt-6-luna', 'gpt-6-sol'].filter(model => !result.data.some(entry => entry.model === model))
      .map(model => ({ model, displayName: 'Synthetic ' + model, defaultReasoningEffort: 'medium', supportedReasoningEfforts: ['medium'], serviceTiers: ['priority'] }))] };
  };
}

async function verifySyntheticObservationContracts() {
  const { parseSourceLabelAnalysis, createSourceLabelController } = await import('../../js/ai-source-label-plan.js');
  const parse = value => parseSourceLabelAnalysis(JSON.stringify(value), 1, [], { requireLeaderObservation: true, requireClassification: true });
  const checked = [];
  for (const [name, wire] of [['pipeline', syntheticPipelineObservation()], ['joint-matched', syntheticJointObservation('matched')], ['joint-fallback', syntheticJointObservation('fallback')]]) {
    const original = JSON.stringify(wire), plan = parse(wire);
    assert.equal(plan.rejectedCount, 0, name); assert.equal(Object.isFrozen(plan), true); assert.equal(plan.labels.length, wire.labels.length);
    assert.equal(plan.observationContractRevision, '1.4.0'); assert.equal(plan.leaderObservationVersion, 1);
    assert.equal(JSON.stringify(wire), original, 'Parsing must not mutate the synthetic wire'); checked.push(name);
  }
  const figure = parse(syntheticJointObservation('figure'));
  assert.deepEqual(figure.labels.map(label => label.text), ['(가)']); assert.deepEqual(figure.removalOnlyItems.map(item => item.text), ['그림 1']);
  assert.equal(figure.rejectedCount, 0); assert.deepEqual(figure.relationGroups, []); checked.push('panel-versus-caption');
  for (const field of ['observationContractRevision', 'observationVersion', 'leaderObservationVersion']) {
    const value = syntheticPipelineObservation(); delete value[field];
    assert.throws(() => parse(value), /계약/); checked.push('missing-' + field);
  }
  const stale = syntheticPipelineObservation(); stale.observationContractRevision = '1.3.4';
  assert.throws(() => parse(stale), /분류 계약 버전/); checked.push('stale-classification');
  assert.throws(() => parseSourceLabelAnalysis('{"version":4,}', 1, [], { requireLeaderObservation: true, requireClassification: true }), /JSON/);
  checked.push('malformed-json');
  const invalidGeometry = syntheticPipelineObservation(); invalidGeometry.geometryLock.objects = [];
  assert.throws(() => parse(invalidGeometry), /원본/); checked.push('malformed-required-geometry');
  for (const [name, mutate, stage] of [
    ['missing-classification', value => { const label = structuredClone(value.labels[0]); label.id = 'unclassified'; delete label.disposition; value.labels.push(label); }, 'label'],
    ['missing-classification-reason', value => { const label = structuredClone(value.labels[0]); label.id = 'no-reason'; label.reason = ''; value.labels.push(label); }, 'label'],
    ['orphan-target', value => { const label = structuredClone(value.labels[0]); label.id = 'orphan'; label.targetBinding.objectId = 'invented'; value.labels.push(label); }, 'label'],
    ['orphan-removal', value => { value.removalRegions = [{ id: 'orphan-region', labelId: 'missing', sourceRef: 1, ownership: 'confirmed', component: 'text', kind: 'ellipse', bounds: { x: .1, y: .1, w: .1, h: .1 }, method: 'flat-background' }]; }, 'removalRegions'],
    ['malformed-removal', value => { value.removalRegions = [{ id: 'bad-region', labelId: value.labels[0].id, sourceRef: 1, ownership: 'confirmed', component: 'text', kind: 'ellipse', bounds: { x: .95, y: .1, w: .2, h: .1 }, method: 'flat-background' }]; }, 'removalRegions'],
    ['malformed-removal-only', value => { value.removalOnlyItems = [{ id: 'bad-decoration', sourceRef: 1, kind: 'decoration', bounds: { x: .95, y: .1, w: .2, h: .1 }, reason: 'Synthetic invalid bounds' }]; }, 'removal-only'],
  ]) {
    const value = syntheticPipelineObservation(); mutate(value); const plan = parse(value);
    assert.deepEqual(plan.labels.map(label => label.id), ['source-1-electron'], name + ' must retain the valid sibling');
    assert.ok(plan.quarantinedItems.some(item => item.stage === stage && item.reason), name);
    assert.ok(plan.quarantinedItems.every(item => item.deletionAuthority === false), name);
    assert.deepEqual(plan.removalRegions, []); assert.deepEqual(plan.removalOnlyItems, []); assert.equal(plan.reviewRequired, true); checked.push(name);
  }
  const classified = syntheticPipelineObservation();
  classified.labels.push({ id: 'graph-label', text: '축', sourceRef: 1, scope: 'graph', mode: 'text', leaderPresence: 'absent',
    disposition: 'graph-owned', semanticRole: 'graph-label', reason: 'Synthetic graph ownership', position: { x: .2, y: .2 }, typography: { role: 'text', size: { w: .1, h: .04 } },
    targetBinding: { status: 'confirmed', objectId: 'frame', reason: 'Synthetic graph identity' } });
  classified.removalOnlyItems = [{ id: 'decoration', sourceRef: 1, kind: 'decoration', bounds: { x: .1, y: .9, w: .1, h: .05 }, reason: 'Explicit synthetic removal-only decoration' }];
  const separated = parse(classified);
  assert.equal(separated.labels.length, 1); assert.equal(separated.graphOwnedLabels.length, 1); assert.equal(separated.removalOnlyItems.length, 1);
  assert.equal(separated.rejectedCount, 0); checked.push('graph-and-removal-only-ownership');
  // Exercise the actual fresh-observation entry point as well as its parser.
  // The byte sentinel is retained from desktop/ai-source-label-plan.test.cjs.
  const attachment = { name: 'source', data: 'data:image/png;base64,YQ==' }, dispatched = [];
  let controller;
  controller = createSourceLabelController({ collectCandidates: null, transport: { send: async payload => {
    dispatched.push(payload); controller.handleEvent({ kind: 'assistant', turnId: 'synthetic-current', text: JSON.stringify(syntheticPipelineObservation()) });
    controller.handleEvent({ kind: 'done', turnId: 'synthetic-current', status: 'completed' }); return { turnId: 'synthetic-current' };
  } } });
  const fresh = await controller.analyze({ attachments: [attachment], model: 'gpt-6-luna', effort: 'medium',
    models: [{ model: 'gpt-6-luna', supportedReasoningEfforts: ['medium'], serviceTiers: [] }] });
  assert.equal(dispatched.length, 1); assert.equal(dispatched[0].purpose, 'scene'); assert.equal(dispatched[0].attachments[0].data, attachment.data);
  assert.equal(fresh.frozen, true); assert.equal(fresh.rejectedCount, 0); assert.equal(fresh.labels.length, 1);
  assert.equal(fresh.sourceBindings[0].transportSha256, require('node:crypto').createHash('sha256').update(attachment.data).digest('hex'));
  checked.push('fresh-controller-classification-and-byte-binding');
  return { contract: '1.4.0', checked };
}

// Keep the source's extracted seed and all of its caller-applied modifications.
// Only replace the old local server and obsolete main bootstrap hook.
function adaptHarness(source) {
  const start = source.indexOf('async function requestBrowserFixture(');
  assert.ok(start > 0, 'Source fixture boundary must be present');
  return source.slice(0, start).replace(
    'sends.push({ payload, turnId, threadId });',
    "sends.push({ payload, turnId, threadId }); window.dispatchEvent(new Event('qa:bridge-send'));",
  ) + `
async function requestBrowserFixture(context, count, evidence, options = {}) {
  return require('./helpers/label-source-pipeline-browser.cjs').requestFixture(context, count, evidence, seedRequestWorkspaces, options);
}
`;
}

async function requestFixture(context, count, evidence, seed, options) {
  const url = process.env.RELEASE_URL || process.env.EXAM_URL;
  assert.ok(url, 'Retained candidate URL required');
  const engine = process.env.TASK2_ENGINE === 'webkit' ? webkit : chromium;
  const browser = await engine.launch({ headless: true });
  const browserContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await browserContext.tracing.start({ screenshots: true, snapshots: true });
  const page = await browserContext.newPage();
  page.setDefaultTimeout(10000);
  await installLabelSourcePage(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  context.after(async () => {
    if (!page.isClosed()) {
      const diagnostic = await page.evaluate(() => ({
        sends: window.__task2?.sends,
        panels: [...document.querySelectorAll('[data-ai-busy]')].map(p => ({ id: p.id, busy: p.dataset.aiBusy, phase: p.dataset.aiRequestPhase, status: p.querySelector('[data-ai-status]')?.textContent })),
      }));
      fs.writeFileSync(path.join(evidence, 'diagnostic.json'), JSON.stringify({ diagnostic, errors }, null, 2));
      await page.screenshot({ path: path.join(evidence, 'final.png') });
    }
    await browserContext.tracing.stop({ path: path.join(evidence, 'trace.zip') });
    await browserContext.close();
    await browser.close();
    fs.writeFileSync(path.join(evidence, 'cleanup.json'), JSON.stringify({ browserClosed: !browser.isConnected(), retainedExternalServer: true }));
  });
  // The old lifecycle seed advertises only Sol, and the multiselect seed uses
  // catalog aliases. Current analysis requires the native Luna identity. Keep
  // their catalog entries, PNG data, tabs and event transport intact.
  await page.addInitScript({ content: `(${seed.toString()})(${count}, ${!!options.initialGeneration});\n(${installSyntheticNativeCatalog.toString()})();` });
  await page.route('**/js/main.js?v=1.7.0-four-session-integration', route => {
    const source = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
    const hook = 'const aiPanel = initAiPanel(state, { freshStart: recoveryChoice === "fresh", materializeCandidate });';
    assert.ok(source.includes(hook), 'Actual candidate main hook exists');
    return route.fulfill({ contentType: 'text/javascript', body: 'await window.__seedReady;\n' + source.replace(hook, hook + ' window.__task2Manager = aiPanel;') });
  });
  await page.goto(new URL(process.env.APP_ENTRY || '/', url).href, { waitUntil: 'domcontentloaded' });
  const welcome = page.locator('.tut-welcome-overlay .tut-banner-no');
  if (await welcome.isVisible()) await welcome.click();
  await page.locator('#ai-image-install-open').click();
  await page.waitForFunction(() => [...document.querySelectorAll('#ai-image-panel .ai-image-card img')].some(image => image.naturalWidth === 512));
  assert.deepEqual(errors, [], 'Real candidate bootstrap has no runtime errors');
  return { page, errors };
}

module.exports = { adaptHarness, requestFixture, syntheticPipelineObservation, syntheticBatchPipelineObservation, syntheticJointObservation, verifySyntheticObservationContracts };
