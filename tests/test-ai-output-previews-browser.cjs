const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const evidenceRoot = process.env.OUTPUT_EVIDENCE || process.env.EVIDENCE_DIR || path.join(root, '.omo/evidence/ai-followup-0928/output/green');
const original = fs.readFileSync(path.join(root, 'tests/test-ai-workspace-lifecycle-browser.cjs'), 'utf8');
const start = original.indexOf('function seedRequestWorkspaces(');
const end = original.indexOf('\nfor (const count of [1, 10, 30])', start);
// Reuse the production-page harness; only replace its deterministic drawing with three disjoint objects.
const harness = original.slice(start, end).replace('draw.strokeRect(40, 50, 420, 280);', 'draw.strokeRect(40, 50, 100, 180); draw.strokeRect(200, 50, 100, 180); draw.strokeRect(360, 50, 100, 180);');
const controlledHarness = harness.replace("separationMode: 'off',", "separationMode: 'off', generationMode: 'single',").replace('  const entryReceipt = await inspectEntry', `  await page.route('**/js/image-background.js*', route => {
    const source = fs.readFileSync(path.join(root, 'js/image-background.js'), 'utf8');
    assert.equal(source.split('export async function transparentizeGeneratedImage(').length - 1, 1, 'Original processing gate seam occurs once');
    return route.fulfill({ contentType: 'text/javascript', body: source.replace('export async function transparentizeGeneratedImage(', 'async function realTransparentizeGeneratedImage(') + '\\nexport async function transparentizeGeneratedImage(src, options) { (window.__outputProcessCalls ||= []).push({ candidateId: document.querySelector("#ai-image-panel")?.dataset.aiSelectedCandidateId, policy: options.backgroundPolicy }); const gate = window.__outputGate; if (gate && gate.policy === options.backgroundPolicy) { gate.entered = true; gate.onEntered?.(); await gate.promise; } return realTransparentizeGeneratedImage(src, options); }' });
  });
  const entryReceipt = await inspectEntry`);
const fixture = new Function('require', 'root', 'fs', 'path', 'assert', 'chromium', 'webkit', controlledHarness + '; return requestBrowserFixture;')(require, root, fs, path, assert, chromium, webkit);
// Original one-frame source drawing/observation for the real first workflow.
const modernHarness = controlledHarness.replace('draw.strokeRect(40, 50, 100, 180); draw.strokeRect(200, 50, 100, 180); draw.strokeRect(360, 50, 100, 180);', 'draw.strokeRect(40, 50, 420, 280);');
const modernFixture = new Function('require', 'root', 'fs', 'path', 'assert', 'chromium', 'webkit', modernHarness + '; return requestBrowserFixture;')(require, root, fs, path, assert, chromium, webkit);
const panel = '#ai-image-panel';
const background = `${panel} select[data-ai-background-policy]`;
const separation = `${panel} select[data-ai-separation-mode]`;
const write = (dir, name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2));

// Current UI choices delegate through initAISettingsPanel to the unchanged
// native controller. Never select a hidden native control or invent an option.
async function chooseExposedOutputSetting(page, evidence, key, value) {
  const mapped = key === 'composition' ? { key: 'objects', value: value === 'single' ? 'off' : 'auto' } : { key, value };
  const button = page.locator(`${panel} [data-ai-setting-key="${mapped.key}"] [data-ai-setting-value="${mapped.value}"]:visible`);
  const count = await button.count();
  if (count !== 1 || !await button.isVisible() || !await button.isEnabled()) {
    const contract = await page.evaluate(async ({ key, value, mapped }) => {
      const p = document.querySelector('#ai-image-panel');
      const native = p.querySelector(key === 'background' ? '[data-ai-background-policy]' : key === 'composition' ? '[data-ai-generation-mode]' : '[data-ai-separation-mode]');
      const { normalizeImageOutputOptions } = await import(window.__runtime.base + 'ai-output-processing.js' + window.__runtime.query);
      const { transitionSeparationMode } = await import(window.__runtime.base + 'ai-separation-mode.js' + window.__runtime.query);
      const snapshot = await window.__task2Manager.sharingSnapshot();
      const selected = snapshot.workspaces.flatMap(workspace => workspace.tabs)
        .flatMap(tab => tab.generated || []).find(item => item.id === p.dataset.aiSelectedCandidateId);
      return { requested: { key, value }, mapped, boxEdit: p.dataset.aiBoxEdit, stage: p.dataset.aiStage,
        selectedCandidateId: p.dataset.aiSelectedCandidateId,
        selectedProvenance: selected ? { kind: selected.kind, workflow: selected.imageLabelWorkflow || null,
          labelPlanFrozen: selected.labelPlan?.frozen === true, reviewState: selected.reviewState,
          scene: Boolean(selected.sceneResult), graph: Boolean(selected.graphResult) } : null,
        native: native ? { value: native.value, disabled: native.disabled, rendered: native.getClientRects().length > 0,
          options: [...native.options].map(option => ({ value: option.value, disabled: option.disabled })) } : null,
        buttons: [...p.querySelectorAll(`[data-ai-setting-key="${mapped.key}"] button`)].map(node => ({ value: node.dataset.aiSettingValue, pressed: node.getAttribute('aria-pressed'), disabled: node.disabled, rendered: node.getClientRects().length > 0 })),
        apiContract: key === 'background' ? normalizeImageOutputOptions({ backgroundPolicy: value })
          : transitionSeparationMode({ separationMode: 'off', outputOptions: { backgroundPolicy: 'preserve' } }, mapped.value),
        taskOwners: snapshot.workspaces.flatMap(workspace => workspace.tabs).map(tab => ({ id: tab.id, selected: tab.selectedCandidateId, separationMode: tab.separationMode, generationMode: tab.generationMode })),
        classification: value === 'all-near-white' ? 'Current source UI intentionally offers preserve/connected only; legacy local API policy retained but not exposed'
          : value === 'grid' ? 'Grid remains a Pro native option and local algorithm; current visible binary objects proxy has no grid action'
          : 'Blanket selected-PNG scoped UI hides result processing, including historical PNG; legacy processing contract remains unresolved',
        originalUiOraclesRemainMandatory: true, apiObservationIsNotUiCoverage: true,
      };
    }, { key, value, mapped });
    write(evidence, 'required-setting-contract-gap.json', contract);
    const error = new Error(`CURRENT_UI_CONTRACT_GAP: ${key}=${value}; ${contract.classification}`);
    error.code = 'CURRENT_UI_CONTRACT_GAP'; throw error;
  }
  await button.click();
  const native = key === 'background' ? background : separation;
  assert.equal(await page.locator(native).inputValue(), mapped.value, 'Visible choice delegates to the actual controller');
  if (key === 'composition') assert.equal(await page.locator(`${panel} select[data-ai-generation-mode]`).inputValue(), value,
    'Visible objects choice must also preserve the original composition state contract');
  assert.equal(await button.getAttribute('aria-pressed'), 'true', 'Actual compact setting reflects its controller');
}

async function inspect(page, swipe = false) {
  return page.evaluate(async swipe => {
    const panel = document.querySelector('#ai-image-panel');
    const node = panel.querySelector(swipe ? '.ai-comparison-right image' : '.ai-generated-card .ai-preview-stage > img');
    const src = swipe ? node?.getAttribute('href') : node?.src;
    const image = new Image(); image.src = src; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const pixel = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
    return { id: panel.dataset.aiSelectedCandidateId, srcIsRaw: src === window.__task2.original,
      outside: pixel(0, 0), inside: pixel(80, 100), ink: pixel(40, 100),
      status: panel.querySelector('[data-ai-output-processing-status]')?.textContent,
      sends: window.__task2.sends.length };
  }, swipe);
}
async function settled(page) {
  await page.waitForFunction(() => {
    const text = document.querySelector('#ai-image-panel [data-ai-output-processing-status]')?.textContent || '';
    return text && !text.includes('처리하는 중');
  });
}
for (const engine of ['chromium', 'webkit']) {
  test(`${engine}: pending and failed local processing is visible and stale completion cannot change another task`, { timeout: 90000 }, async t => {
    const evidence = path.join(evidenceRoot, engine, 'pending-error'); fs.mkdirSync(evidence, { recursive: true });
    process.env.TASK2_ENGINE = engine;
    const { page, errors } = await fixture(t, 2, evidence);
    const hold = policy => page.evaluate(policy => {
      const gate = { policy, entered: false };
      gate.promise = new Promise((resolve, reject) => { gate.resolve = resolve; gate.reject = reject; });
      window.__outputGate = gate;
    }, policy);
    const release = fail => page.evaluate(fail => { const gate = window.__outputGate; window.__outputGate = null; fail ? gate.reject(new Error('controlled local decode failure')) : gate.resolve(); }, fail);
    const status = page.locator(`${panel} [data-ai-output-processing-status]`);
    await hold('connected'); await chooseExposedOutputSetting(page, evidence, 'background', 'connected');
    await page.waitForFunction(() => window.__outputGate?.entered);
    const pending = { text: await status.textContent(), visible: await status.isVisible() };
    write(evidence, 'pending.json', pending); await page.screenshot({ path: path.join(evidence, 'pending.png') });
    assert.match(pending.text, /처리하는 중/); assert.equal(pending.visible, true);
    await page.click(`${panel} [data-tab-id="task-1"] .ai-task-tab-select`);
    await release(true); await settled(page);
    const other = await inspect(page); assert.equal(other.id, 'candidate-1'); assert.equal(other.outside[3], 255); assert.doesNotMatch(other.status, /실패/);
    await page.click(`${panel} [data-tab-id="task-0"] .ai-task-tab-select`);
    await chooseExposedOutputSetting(page, evidence, 'background', 'connected'); await settled(page);
    const retry = await inspect(page); assert.equal(retry.outside[3], 0); assert.equal(retry.srcIsRaw, false);
    await hold('all-near-white'); await chooseExposedOutputSetting(page, evidence, 'background', 'all-near-white');
    await page.waitForFunction(() => window.__outputGate?.entered); await release(true);
    await page.waitForFunction(() => document.querySelector('#ai-image-panel [data-ai-output-processing-status]')?.textContent.includes('결과 처리 실패'));
    const failed = await inspect(page); write(evidence, 'failure.json', { ...failed, visible: await status.isVisible() });
    assert.equal(await status.isVisible(), true); assert.equal(failed.srcIsRaw, false); assert.equal(failed.outside[3], 0); assert.equal(failed.inside[3], 255);
    await page.screenshot({ path: path.join(evidence, 'failure.png') });
    await chooseExposedOutputSetting(page, evidence, 'background', 'preserve'); await settled(page);
    const reset = await inspect(page); assert.equal(reset.srcIsRaw, true); assert.equal(reset.sends, 0); assert.deepEqual(errors, []);
    write(evidence, 'result.json', { pending, other, retry, failed, reset, errors });
  });
  test(`${engine}: dropdown applies decoded alpha to normal and swipe output without AI or original mutation`, { timeout: 90000 }, async t => {
    const evidence = path.join(evidenceRoot, engine, 'alpha'); fs.mkdirSync(evidence, { recursive: true });
    process.env.TASK2_ENGINE = engine;
    const { page, errors } = await fixture(t, 2, evidence);
    await chooseExposedOutputSetting(page, evidence, 'objects', 'off');
    await chooseExposedOutputSetting(page, evidence, 'background', 'connected'); await settled(page);
    const normal = await inspect(page); write(evidence, 'normal.json', normal);
    await page.screenshot({ path: path.join(evidence, 'normal.png') });
    assert.equal(normal.outside[3], 0, JSON.stringify(normal));
    assert.equal(normal.inside[3], 255); assert.equal(normal.ink[3], 255); assert.equal(normal.srcIsRaw, false);
    await page.click(`${panel} [data-ai-compare]`);
    await page.waitForFunction(() => document.querySelector('.ai-comparison-right image')?.hasAttribute('href'));
    const swipe = await inspect(page, true); write(evidence, 'swipe.json', swipe);
    assert.equal(swipe.outside[3], 0); assert.equal(swipe.inside[3], 255); assert.equal(swipe.srcIsRaw, false);
    await chooseExposedOutputSetting(page, evidence, 'background', 'all-near-white'); await settled(page);
    await page.waitForFunction(() => document.querySelector('.ai-comparison-right image')?.getAttribute('href') === document.querySelector('#ai-image-panel .ai-generated-card .ai-preview-stage > img')?.src);
    const allWhite = await inspect(page, true); write(evidence, 'all-white.json', allWhite);
    assert.equal(allWhite.inside[3], 0); assert.equal(allWhite.ink[3], 255);
    await page.screenshot({ path: path.join(evidence, 'swipe.png') });
    for (const value of ['preserve', 'connected', 'all-near-white', 'preserve', 'connected']) await chooseExposedOutputSetting(page, evidence, 'background', value);
    await page.click(`${panel} [data-tab-id="task-1"] .ai-task-tab-select`);
    await page.waitForFunction(() => document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId === 'candidate-1');
    const other = await inspect(page); write(evidence, 'other-task.json', other);
    assert.equal(other.outside[3], 255); assert.equal(other.id, 'candidate-1');
    await page.click(`${panel} [data-tab-id="task-0"] .ai-task-tab-select`); await settled(page);
    const restored = await inspect(page); write(evidence, 'restored-task.json', restored);
    assert.equal(restored.outside[3], 0); assert.equal(restored.id, 'candidate-0');
    await chooseExposedOutputSetting(page, evidence, 'background', 'preserve'); await settled(page);
    assert.equal((await inspect(page)).srcIsRaw, true);
    const preserved = await page.evaluate(async () => (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(w => w.tabs).every(tab => tab.generated[0].data === window.__task2.original));
    write(evidence, 'result.json', { preserved, sends: restored.sends, errors });
    assert.equal(preserved, true); assert.equal(restored.sends, 0); assert.deepEqual(errors, []);
  });
  test(`${engine}: selecting automatic separation recomputes local regions visible in existing result viewer`, { timeout: 90000 }, async t => {
    const evidence = path.join(evidenceRoot, engine, 'separation'); fs.mkdirSync(evidence, { recursive: true });
    process.env.TASK2_ENGINE = engine;
    const { page, errors } = await fixture(t, 2, evidence);
    await chooseExposedOutputSetting(page, evidence, 'objects', 'auto');
    const groups = page.locator(`${panel} [data-ai-editable-groups]`);
    await page.waitForFunction(() => document.querySelector('#ai-image-panel [data-ai-editable-groups]')?.dataset.aiSeparationState === 'ready');
    assert.equal(await page.locator(background).isDisabled(), true); assert.equal(await page.locator(background).inputValue(), 'connected');
    const note = page.locator(`${panel} [data-ai-selected-output-note]`);
    const count = Number(await groups.getAttribute('data-ai-separated-count'));
    write(evidence, 'separated.json', { count, note: await note.textContent(), noteVisible: await note.isVisible(), pixels: await inspect(page) });
    assert.equal(count, 3); assert.equal(await note.isVisible(), true); assert.match(await note.textContent(), /3개/);
    await page.screenshot({ path: path.join(evidence, 'separation-ready.png') });
    await groups.click();
    await page.waitForFunction(() => document.querySelectorAll('.aea-thumbnail img').length === 3);
    assert.deepEqual(await page.locator('.aea-region-number').allTextContents(), ['1', '2', '3']);
    await page.screenshot({ path: path.join(evidence, 'separation-regions.png') });
    await page.click('.aea-dialog [data-action="cancel"]');
    await chooseExposedOutputSetting(page, evidence, 'objects', 'grid');
    await chooseExposedOutputSetting(page, evidence, 'objects', 'off');
    await page.locator(`${panel} [data-tab-id="task-1"] .ai-task-tab-select:visible`).click();
    await page.waitForFunction(() => document.querySelector('#ai-image-panel')?.dataset.aiSelectedCandidateId === 'candidate-1');
    assert.equal(await groups.getAttribute('data-ai-separation-state'), '');
    await page.locator(`${panel} [data-tab-id="task-0"] .ai-task-tab-select:visible`).click();
    await page.waitForFunction(() => document.querySelector('#ai-image-panel')?.dataset.aiSelectedCandidateId === 'candidate-0');
    await chooseExposedOutputSetting(page, evidence, 'objects', 'auto');
    await page.waitForFunction(() => document.querySelector('#ai-image-panel [data-ai-editable-groups]')?.dataset.aiSeparationState === 'ready');
    const sends = await page.evaluate(() => window.__task2.sends.length);
    write(evidence, 'result.json', { count, sends, errors, staleSelectionRejected: true });
    assert.equal(sends, 0); assert.deepEqual(errors, []);
  });
}

for (const engine of ['chromium', 'webkit']) {
  test(`${engine}: historical local composition preserves all-white policy, other candidates and reload`, { timeout: 90000 }, async t => {
    const evidence = path.join(evidenceRoot, engine, 'composition'); fs.mkdirSync(evidence, { recursive: true });
    process.env.TASK2_ENGINE = engine;
    const { page, errors } = await fixture(t, 2, evidence);
    const historical = await page.evaluate(async () => {
      const tabs = (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace => workspace.tabs);
      return tabs.map(tab => ({ id: tab.id, count: tab.generated.length, workflow: tab.generated[0]?.imageLabelWorkflow || null, data: tab.generated[0]?.data === window.__task2.original }));
    });
    assert.ok(historical.every(tab => tab.count === 1 && tab.workflow === null && tab.data), 'Only the actual pre-existing historical fixture candidates exercise local composition');
    write(evidence, 'historical-inputs.json', historical);
    const composition = `${panel} select[data-ai-generation-mode]`;
    const state = () => page.evaluate(() => {
      const panel = document.querySelector('#ai-image-panel');
      const background = panel.querySelector('[data-ai-background-policy]');
      return {
        composition: panel.querySelector('select[data-ai-generation-mode]').value,
        separation: panel.querySelector('[data-ai-separation-mode]').value,
        background: background.value,
        locked: background.disabled,
      };
    });
    const selectTask = async id => {
      await page.click(`${panel} [data-tab-id="${id}"] .ai-task-tab-select`);
      await page.waitForFunction(id => document.querySelector(`#ai-image-panel [data-tab-id="${id}"] .ai-task-tab-select`)?.getAttribute('aria-pressed') === 'true', id);
    };
    const single = { composition: 'single', separation: 'off', background: 'preserve', locked: false };
    const separated = { composition: 'separated', separation: 'auto', background: 'connected', locked: true };
    const initial = await state(); write(evidence, 'initial.json', initial);
    await page.screenshot({ path: path.join(evidence, 'initial.png') });
    assert.deepEqual(initial, single, 'legacy single task must not inherit automatic separation');
    await chooseExposedOutputSetting(page, evidence, 'background', 'all-near-white');
    await chooseExposedOutputSetting(page, evidence, 'composition', 'separated');
    assert.deepEqual(await state(), separated);
    await chooseExposedOutputSetting(page, evidence, 'composition', 'single');
    assert.deepEqual(await state(), { ...single, background: 'all-near-white' });
    await chooseExposedOutputSetting(page, evidence, 'composition', 'separated');
    await selectTask('task-1');
    assert.deepEqual(await state(), single);
    await chooseExposedOutputSetting(page, evidence, 'composition', 'separated'); await settled(page);
    assert.deepEqual(await state(), separated);
    const processed = await inspect(page);
    assert.equal(processed.outside[3], 0, 'composition immediately applies local external-background processing');
    assert.equal(processed.inside[3], 255);
    await chooseExposedOutputSetting(page, evidence, 'composition', 'single'); await settled(page);
    assert.deepEqual(await state(), single);
    assert.equal((await inspect(page)).outside[3], 255);
    await selectTask('task-0');
    assert.deepEqual(await state(), separated);
    const snapshot = await page.evaluate(() => window.__task2Manager.sharingSnapshot());
    const saved = snapshot.workspaces.flatMap(workspace => workspace.tabs).find(tab => tab.id === 'task-0');
    assert.equal(saved.generationMode, 'separated');
    assert.equal(saved.separationMode, 'auto');
    assert.equal(saved.singleBackgroundPolicy, 'all-near-white');
    assert.equal(await page.evaluate(() => window.__task2.sends.length), 0);
    await page.reload({ waitUntil: 'networkidle' });
    const open = page.locator('#ai-image-install-open');
    if (!(await page.locator(panel).isVisible())) await open.click();
    await page.waitForFunction(() => document.querySelector('#ai-image-panel [data-tab-id="task-0"]'));
    await selectTask('task-0');
    assert.deepEqual(await state(), separated);
    await chooseExposedOutputSetting(page, evidence, 'composition', 'single');
    assert.deepEqual(await state(), { ...single, background: 'all-near-white' });
    await page.screenshot({ path: path.join(evidence, 'restored-single.png') });
    assert.equal(await page.evaluate(() => window.__task2.sends.length), 0);
    assert.deepEqual(errors, []);
    write(evidence, 'result.json', { initial, restored: await state(), saved, processed, sends: 0, errors });
  });
}


for (const engine of ['chromium', 'webkit']) {
  test(`${engine}: component API retains explicit alpha policies without changing the saved candidate (not UI coverage)`, { timeout: 90000 }, async t => {
    const evidence = path.join(evidenceRoot, engine, 'api-component-policies'); fs.mkdirSync(evidence, { recursive: true });
    process.env.TASK2_ENGINE = engine;
    const { page, errors } = await fixture(t, 2, evidence);
    const result = await page.evaluate(async () => {
      const urls = { output: window.__runtime.base + 'ai-output-processing.js' + window.__runtime.query,
        background: window.__runtime.base + 'image-background.js' + window.__runtime.query };
      const { resolveImageOutput } = await import(urls.output);
      const { transparentizeGeneratedImage } = await import(urls.background);
      const before = await window.__task2Manager.sharingSnapshot();
      const task = before.workspaces.flatMap(workspace => workspace.tabs).find(tab => tab.id === 'task-0');
      const candidate = task.generated.find(item => item.id === task.selectedCandidateId);
      if (!candidate) throw new Error('Actual persisted selected candidate is required');
      const inspect = async data => {
        const image = new Image(); image.src = data; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
        const pixel = (x,y) => [...ctx.getImageData(x,y,1,1).data];
        return { outside: pixel(0,0), inside: pixel(80,100), ink: pixel(40,100), width: image.naturalWidth, height: image.naturalHeight };
      };
      const connectedData = await resolveImageOutput(candidate, { backgroundPolicy: 'connected' }, transparentizeGeneratedImage);
      const connected = await inspect(connectedData);
      let entered, release;
      const enteredPromise = new Promise(resolve => { entered = resolve; });
      const gate = { policy: 'all-near-white', entered: false, onEntered: entered,
        promise: new Promise(resolve => { release = resolve; }) };
      window.__outputGate = gate;
      let complete = false, timer;
      const pending = resolveImageOutput(candidate, { backgroundPolicy: 'all-near-white' }, transparentizeGeneratedImage).then(value => { complete = true; return value; });
      try {
        await Promise.race([enteredPromise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Actual processing gate entry deadline')), 10000); })]);
        if (complete || !gate.entered) throw new Error('Original real processing gate did not hold completion');
      } finally { clearTimeout(timer); window.__outputGate = null; release(); }
      const allWhiteData = await pending;
      const allWhite = await inspect(allWhiteData);
      const raw = await resolveImageOutput(candidate, { backgroundPolicy: 'preserve' }, transparentizeGeneratedImage);
      const after = await window.__task2Manager.sharingSnapshot();
      return { coverage: 'actual exported component API only', excludes: ['pending/error UI visibility','normal/swipe synchronization','stale render ownership','setting queue','composition UI/reload'],
        urls, connected, allWhite, rawIdentity: raw === candidate.data, storedOriginal: candidate.data === window.__task2.original,
        wholeSnapshotUnchanged: JSON.stringify(before) === JSON.stringify(after), heldRealGate: gate.entered, completedAfterRelease: complete,
        connectedDiffersFromRaw: connectedData !== candidate.data, allWhiteDiffersFromConnected: allWhiteData !== connectedData,
        sends: window.__task2.sends.length };
    });
    write(evidence, 'actual-component-proof.json', result);
    assert.equal(result.connected.outside[3], 0); assert.equal(result.connected.inside[3], 255); assert.equal(result.connected.ink[3], 255);
    assert.equal(result.allWhite.outside[3], 0); assert.equal(result.allWhite.inside[3], 0); assert.equal(result.allWhite.ink[3], 255);
    assert.equal(result.connected.width, 512); assert.equal(result.connected.height, 384);
    assert.equal(result.heldRealGate, true); assert.equal(result.completedAfterRelease, true);
    assert.equal(result.connectedDiffersFromRaw, true); assert.equal(result.allWhiteDiffersFromConnected, true);
    assert.equal(result.rawIdentity, true); assert.equal(result.storedOriginal, true); assert.equal(result.wholeSnapshotUnchanged, true);
    assert.equal(result.sends, 0); assert.deepEqual(errors, []);
  });
}

for (const engine of ['chromium', 'webkit']) {
  test(`${engine}: fixed source workflow records three stages and keeps the actual generated RAW alpha`, { timeout: 90000 }, async t => {
    const evidence = path.join(evidenceRoot, engine, 'modern-first-raw'); fs.mkdirSync(evidence, { recursive: true });
    process.env.TASK2_ENGINE = engine;
    const { page, errors } = await modernFixture(t, 2, evidence, { initialGeneration: true });
    const before = await page.evaluate(async () => {
      const tab = (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(w => w.tabs).find(tab => tab.id === 'task-0');
      return { generated: tab.generated.length, workflow: tab.imageLabelWorkflow,
        policies: [...document.querySelector('#ai-image-panel [data-ai-background-policy]').options].map(o => o.value),
        processing: window.__outputProcessCalls?.length || 0, sends: window.__task2.sends.length };
    });
    assert.equal(before.generated, 0, 'The real initial modern tab remains empty; no saved candidate is invented');
    assert.equal(before.workflow.explicit, true); assert.equal(before.workflow.imageKind, 'general');
    assert.equal(before.workflow.labelResult, 'remove'); assert.equal(before.workflow.verificationMode, 'full');
    assert.deepEqual(before.policies, ['preserve', 'connected']); assert.equal(before.sends, 0);
    assert.equal(await page.locator(`${panel} [data-ai-setting-value="all-near-white"]:visible`).count(), 0,
      'The fixed source UI intentionally omits interior-white removal');
    await chooseExposedOutputSetting(page, evidence, 'background', 'connected');
    await page.evaluate(() => {
      const panel = document.querySelector('#ai-image-panel');
      window.__modernWorkflowDone = new Promise((resolve, reject) => {
        let timer;
        const done = event => { clearTimeout(timer); panel.removeEventListener('5e:ai-image-label-timing', done); resolve(event.detail); };
        timer = setTimeout(() => { panel.removeEventListener('5e:ai-image-label-timing', done); reject(new Error('Actual workflow completion event deadline')); }, 15000);
        panel.addEventListener('5e:ai-image-label-timing', done);
      });
      // Mark handled now; the original promise still rejects for its later await.
      window.__modernWorkflowDone.catch(() => {});
      const actualSend = window.fiveEDesktop.send;
      window.__firstImageRequest = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { window.fiveEDesktop.send = actualSend; reject(new Error('Actual generation request delivery deadline')); }, 15000);
        window.fiveEDesktop.send = async payload => {
          const response = await actualSend(payload);
          if (payload.purpose === 'image') { clearTimeout(timer); window.fiveEDesktop.send = actualSend; resolve(response); }
          return response;
        };
      });
      window.__firstImageRequest.catch(() => {});
    });
    await page.locator(`${panel} [data-ai-send]`).click();
    await page.evaluate(() => window.__firstImageRequest);
    await page.evaluate(() => {
      const index = window.__task2.sends.indexOf(window.__task2.generationSends[0]);
      if (index < 0) throw new Error('Image request must be in the real complete ledger');
      window.__task2.emit(index, 'image'); window.__task2.emit(index, 'done');
    });
    const metrics = await page.evaluate(() => window.__modernWorkflowDone);
    await page.evaluate(() => new Promise((resolve,reject) => {
      const panel=document.querySelector('#ai-image-panel'); let timer;
      const finish=()=>{if(panel.dataset.aiBusy!=='false')return;observer.disconnect();clearTimeout(timer);resolve();};
      const observer=new MutationObserver(finish);observer.observe(panel,{attributes:true,attributeFilter:['data-ai-busy']});
      timer=setTimeout(()=>{observer.disconnect();reject(new Error('Actual completed workflow busy-state deadline'));},15000);finish();
    }));
    const result = await page.evaluate(async () => {
      const tabs = (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(w => w.tabs);
      const tab = tabs.find(tab => tab.id === 'task-0'); const candidate = tab.generated[0];
      if (!candidate) throw new Error('The actual completed candidate is required');
      const { imageLabelDigest } = await import(window.__runtime.base + 'ai-image-label-run.js' + window.__runtime.query);
      const { APPROVED_FIRST_PROMPT } = await import(window.__runtime.base + 'ai-approved-first-png.js' + window.__runtime.query);
      const pixels = async source => {
        const image = new Image(); image.src = source; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
        const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', rgba))].map(v => v.toString(16).padStart(2,'0')).join('');
        return { width:canvas.width,height:canvas.height,rgbaHash:hash,alpha:[rgba[3],rgba[(100*canvas.width+80)*4+3]] };
      };
      const actualImage = document.querySelector('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img');
      const generation = window.__task2.generationSends[0];
      const attachment = generation.payload.attachments[0];
      return { stages:window.__task2.sends.map(send => send.stage), generations:window.__task2.generationSends.length,
        purposes:window.__task2.sends.map(send => send.payload.purpose), text:generation.payload.text,
        approvedPrefixRetained:generation.payload.text.startsWith(APPROVED_FIRST_PROMPT),
        approvedPromptSha256:await imageLabelDigest(APPROVED_FIRST_PROMPT), generationHarness:candidate.workflowMetrics?.generationHarness,
        sourceFrame:candidate.sourceFrame, candidateFrame:candidate.candidateFrame,
        attachment:await pixels(attachment.data), reference:await pixels(window.__task2.original),
        encodedRawIdentity:candidate.data===window.__task2.modified,
        storedDigest:candidate.candidateSha256, rawDigest:await imageLabelDigest(window.__task2.modified),
        raw:await pixels(window.__task2.modified), stored:await pixels(candidate.data), visible:await pixels(actualImage.src),
        workflow:candidate.imageLabelWorkflow, reviewState:candidate.reviewState, counts:Object.fromEntries(tabs.map(tab=>[tab.id,tab.generated.length])),
        historicalStillOriginal:tabs.find(tab=>tab.id==='task-1').generated[0].data===window.__task2.original,
        processing:window.__outputProcessCalls || [], legacyVisible:document.querySelector('[data-ai-legacy-result-settings]').hidden===false };
    });
    write(evidence, 'actual-modern-raw.json', { before, metrics, result, errors,
      provenance:'Real first workflow with parent controlled local transport; no provider quality claim. Encoded RAW comes from its actual generation event.' });
    assert.deepEqual(result.stages, ['source-observation','image-generation','full-review']);
    assert.equal(result.generations, 1); assert.equal(result.purposes[1], 'image');
    // The modern source turn uses the immutable approved RHWP prefix, rather
    // than the legacy separated request's additional whole-frame instructions.
    assert.equal(result.approvedPrefixRetained, true, 'The real generation payload retains the entire canonical approved source contract');
    assert.equal(result.generationHarness.id, 'rhwp-approved-first-v1');
    assert.equal(result.generationHarness.promptSha256, result.approvedPromptSha256);
    assert.equal(metrics.generationHarness.promptSha256, result.approvedPromptSha256);
    assert.doesNotMatch(result.text, /4×4 격자로 배치|아틀라스 배치만 적용/);
    assert.equal(result.attachment.width, 512); assert.equal(result.attachment.height, 384);
    assert.deepEqual(result.attachment,result.reference,'Actual input reference RGBA and dimensions reach the generation payload unchanged');
    assert.equal(result.sourceFrame.width, result.reference.width); assert.equal(result.sourceFrame.height, result.reference.height);
    assert.equal(result.sourceFrame.coordinateSystem, 'normalized-0-1');
    assert.equal(result.candidateFrame.width, result.raw.width); assert.equal(result.candidateFrame.height, result.raw.height);
    assert.equal(result.candidateFrame.coordinateSystem, 'normalized-0-1');
    assert.equal(result.encodedRawIdentity, true); assert.equal(result.storedDigest, result.rawDigest);
    assert.deepEqual(result.stored, result.raw); assert.deepEqual(result.visible, result.raw);
    assert.deepEqual(result.raw.alpha, [255,255], 'Actual generated interior and exterior alpha are retained despite a connected source setting');
    assert.equal(result.workflow.explicit, true); assert.equal(result.reviewState, 'passed');
    assert.equal(metrics.calls.sourceAnalysis, 1); assert.equal(metrics.calls.fullGeneration, 1); assert.equal(metrics.calls.review, 1);
    assert.deepEqual(result.counts, {'task-0':1,'task-1':1});
    assert.equal(result.historicalStillOriginal, true); assert.equal(result.legacyVisible, false);
    assert.equal(result.processing.length, before.processing, 'No local result transform may touch any modern pending or completed RAW');
    assert.deepEqual(errors, []); await page.screenshot({path:path.join(evidence,'modern-first-raw.png')});
  });

  test(`${engine}: historical Lite keeps local binary controls and real mode switch restores Pro options`, { timeout:90000 }, async t => {
    const evidence=path.join(evidenceRoot,engine,'legacy-lite-pro'); fs.mkdirSync(evidence,{recursive:true});
    process.env.TASK2_ENGINE=engine;
    const {page,errors}=await fixture(t,2,evidence);
    await chooseExposedOutputSetting(page,evidence,'background','all-near-white'); await settled(page);
    const pro=await inspect(page); assert.equal(pro.inside[3],0);
    const switchMode=async expected=>{
      // The workbench is a real modal. Close it before using the main mode UI.
      await page.evaluate(()=>new Promise((resolve,reject)=>{
        const panel=document.querySelector('#ai-image-panel');let timer;
        const finish=()=>{if(!panel.hidden)return;observer.disconnect();clearTimeout(timer);resolve();};
        const observer=new MutationObserver(finish);observer.observe(panel,{attributes:true,attributeFilter:['hidden','data-modal-motion-state']});
        timer=setTimeout(()=>{observer.disconnect();reject(new Error('Actual workbench close completion deadline'));},15000);
        window.__task2Manager.close();finish();
      }));
      await page.locator('#mode-toggle-btn').click();
      await page.locator('.mode-switch-dialog').getByRole('button',{name:'유지하고 전환',exact:true}).click();
      await page.evaluate(expected=>new Promise((resolve,reject)=>{
        let timer;
        const finish=()=>{if(document.documentElement.dataset.mode!==expected || document.querySelector('#mode-toggle-btn').disabled)return;
          observer.disconnect();clearTimeout(timer);resolve();};
        const observer=new MutationObserver(finish); observer.observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['data-mode','disabled']});
        timer=setTimeout(()=>{observer.disconnect();reject(new Error('Actual mode switch completion deadline'));},15000);finish();
      }),expected);
      await page.locator('#ai-image-install-open').click();
      await page.locator(`${panel} [data-ai-legacy-result-settings]`).waitFor({state:'visible'});
    };
    await switchMode('lite');
    assert.equal(await page.locator(`${panel} [data-ai-legacy-result-settings]`).isVisible(),true);
    assert.equal(await page.locator(`${panel} [data-ai-setting-value="all-near-white"]:visible`).count(),0);
    assert.equal(await page.locator(`${panel} [data-ai-setting-value="grid"]:visible`).count(),0);
    assert.equal(await page.locator(`${panel} [data-ai-setting-value="manual"]:visible`).count(),0);
    await chooseExposedOutputSetting(page,evidence,'objects','off');
    await chooseExposedOutputSetting(page,evidence,'background','connected');await settled(page);
    const lite=await inspect(page);assert.equal(lite.outside[3],0);assert.equal(lite.inside[3],255);
    await chooseExposedOutputSetting(page,evidence,'objects','auto');
    assert.equal(await page.locator(background).isDisabled(),true);
    assert.equal(await page.locator(background).inputValue(),'connected');
    await chooseExposedOutputSetting(page,evidence,'objects','off');
    await chooseExposedOutputSetting(page,evidence,'background','preserve');await settled(page);
    assert.equal((await inspect(page)).outside[3],255);
    await switchMode('pro');await settled(page);
    assert.equal(await page.locator(background).inputValue(),'all-near-white','Actual pre-Lite Pro preference is restored');
    const restored=await inspect(page);assert.equal(restored.inside[3],0);
    const preservation=await page.evaluate(async()=>({sends:window.__task2.sends.length,
      originals:(await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(w=>w.tabs).every(tab=>tab.generated[0].data===window.__task2.original)}));
    assert.equal(preservation.sends,0);assert.equal(preservation.originals,true);assert.deepEqual(errors,[]);
    write(evidence,'actual-mode-contract.json',{pro,lite,restored,preservation,errors});
    await page.screenshot({path:path.join(evidence,'restored-pro.png')});
  });
}
