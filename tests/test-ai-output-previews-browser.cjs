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
const protectedModernHarness = modernHarness.replace('  const entryReceipt = await inspectEntry', `  const processingHooks=[];
  for (const [file, name, entry] of [['ai-separated-assets.js','prepareSeparatedAssets','automatic'],['ai-editable-assets.js','prepareEditableAssets','manual']]) {
    await page.route('**/js/'+file+'*', route => {
      const source=fs.readFileSync(path.join(root,'js',file),'utf8'),seam='export async function '+name+'(';
      assert.equal(source.split(seam).length-1,1,'Real '+name+' observation seam occurs once');
      const body=source.replace(seam,'async function observedOriginal'+name+'(')+'\\nexport async function '+name+'(...args) { (window.__localSeparationCalls ||= []).push({entry:'+JSON.stringify(entry)+',candidateId:document.querySelector("#ai-image-panel")?.dataset.aiSelectedCandidateId}); return observedOriginal'+name+'(...args); }';
      processingHooks.push({file,entry,requestUrl:route.request().url(),loadIndex:processingHooks.length+1,sourceSHA256:require('node:crypto').createHash('sha256').update(source).digest('hex'),servedSHA256:require('node:crypto').createHash('sha256').update(body).digest('hex'),originalFunctionRetained:true});
      write(evidence,'actual-processing-source-loads.json',processingHooks);
      return route.fulfill({contentType:'text/javascript',body});
    });
  }
  const entryReceipt = await inspectEntry`);
const modernFixture = new Function('require', 'root', 'fs', 'path', 'assert', 'chromium', 'webkit', 'write', protectedModernHarness + '; return requestBrowserFixture;')(require, root, fs, path, assert, chromium, webkit, write);
const panel = '#ai-image-panel';
const background = `${panel} select[data-ai-background-policy]`;
const separation = `${panel} select[data-ai-separation-mode]`;
function write(dir,name,value){fs.writeFileSync(path.join(dir,name),JSON.stringify(value,null,2));}

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
 for(const sourceSeparation of ['off','auto']) {
  test(`${engine}: fixed source workflow records three stages and keeps the actual generated RAW alpha (${sourceSeparation})`, { timeout: 90000 }, async t => {
    const evidence = path.join(evidenceRoot, engine, 'modern-first-raw-'+sourceSeparation); fs.mkdirSync(evidence, { recursive: true });
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
    if(sourceSeparation==='auto')await chooseExposedOutputSetting(page,evidence,'objects','auto');
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
      return { id:candidate.id,data:candidate.data,separationMode:tab.separationMode, stages:window.__task2.sends.map(send => send.stage), generations:window.__task2.generationSends.length,
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
        processing:window.__outputProcessCalls || [], separationCalls:window.__localSeparationCalls || [], legacyVisible:document.querySelector('[data-ai-legacy-result-settings]').hidden===false };
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
    assert.equal(result.separationMode,sourceSeparation);assert.deepEqual(result.separationCalls,[],'Modern auto cannot enter local automatic/manual segmentation');
    if(sourceSeparation==='auto')await qualifyModernAutoRaw(page,evidence,result);
    assert.deepEqual(errors, []); await page.screenshot({path:path.join(evidence,'modern-first-raw.png')});
  });
 }

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


async function waitModernSignal(page,source,arg,label) {
  return page.evaluate(({source,arg,label})=>new Promise((resolve,reject)=>{
    const predicate=(0,eval)('('+source+')');let timer,ended=false;
    const finish=error=>{if(ended)return;ended=true;observer.disconnect();document.removeEventListener('load',check,true);clearTimeout(timer);error?reject(error):resolve();};
    const check=()=>{try{if(predicate(arg))finish();}catch(error){finish(error);}};
    const observer=new MutationObserver(check);observer.observe(document,{subtree:true,childList:true,attributes:true});document.addEventListener('load',check,true);
    timer=setTimeout(()=>finish(new Error('Actual modern '+label+' deadline')),15000);check();
  }),{source:source.toString(),arg,label});
}
async function modernRawObservation(page,phase,expected) {
  return page.evaluate(async({phase,expected})=>{
    const snapshot=await window.__task2Manager.sharingSnapshot(),tab=snapshot.workspaces.flatMap(w=>w.tabs).find(tab=>tab.id==='task-0'),candidate=tab?.generated.find(item=>item.id===expected.id);
    if(!candidate)throw new Error('Actual durable modern candidate/owner is required');
    const image=document.querySelector('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img');
    if(!image)throw new Error('Actual selected preview is required');await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d');context.drawImage(image,0,0);
    const rgba=context.getImageData(0,0,canvas.width,canvas.height).data;
    const {imageLabelDigest}=await import(window.__runtime.base+'ai-image-label-run.js'+window.__runtime.query);
    const keys=['imageLabelWorkflow','sourceSha256','candidateSha256','planSha256','sourceFrame','candidateFrame','sourceLabelPlan','labelPlan','targetPlacement','reviewReport','reviewState','scopedEditHistory'];
    return {phase,url:location.href,selected:document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId,taskId:tab.id,data:candidate.data,digest:await imageLabelDigest(candidate.data),
      bindings:Object.fromEntries(keys.map(key=>[key,candidate[key]])),separationMode:tab.separationMode,visibleData:image.src,
      pixels:{width:canvas.width,height:canvas.height,rgbaHash:[...new Uint8Array(await crypto.subtle.digest('SHA-256',rgba))].map(v=>v.toString(16).padStart(2,'0')).join(''),alpha:[rgba[3],rgba[(100*canvas.width+80)*4+3]]},
      outputCalls:window.__outputProcessCalls||[],separationCalls:window.__localSeparationCalls||[],sends:window.__task2.sends.length,generationSends:window.__task2.generationSends.length,
      groupsDisabled:document.querySelector('[data-ai-editable-groups]').disabled,groupState:document.querySelector('[data-ai-editable-groups]').dataset.aiSeparationState,
      historicalData:snapshot.workspaces.flatMap(w=>w.tabs).find(tab=>tab.id==='task-1').generated[0].data};
  },{phase,expected:{id:expected.id}});
}
async function qualifyModernAutoRaw(page,evidence,expected) {
  const receipts=[];
  const observe=async(phase,afterReload=false)=>{
    await waitModernSignal(page,id=>{
      const panel=document.querySelector('#ai-image-panel'),image=panel?.querySelector('.is-ai-active-candidate .ai-preview-stage > img');
      return panel?.dataset.aiBusy==='false'&&panel.dataset.aiSelectedCandidateId===id&&image?.complete&&image.naturalWidth;
    },expected.id,phase+' owner/decode');
    const actual=await modernRawObservation(page,phase,expected);write(evidence,phase+'.json',actual);await page.screenshot({path:path.join(evidence,phase+'.png')});receipts.push(actual);
    assert.equal(actual.taskId,'task-0');assert.equal(actual.selected,expected.id);assert.equal(actual.separationMode,'auto');
    assert.equal(actual.data,expected.data);assert.equal(actual.visibleData,expected.data);assert.equal(actual.digest,expected.storedDigest);assert.deepEqual(actual.pixels,expected.raw);
    assert.deepEqual(actual.outputCalls,[]);assert.deepEqual(actual.separationCalls,[]);assert.equal(actual.groupsDisabled,true);assert.equal(actual.groupState,'');
    assert.equal(actual.sends,afterReload?0:3);assert.equal(actual.generationSends,afterReload?0:1);
    if(receipts.length>1){assert.deepEqual(actual.bindings,receipts[0].bindings);assert.equal(actual.historicalData,receipts[0].historicalData);}
    return actual;
  };
  await observe('auto-completed');
  await page.locator('#ai-image-panel [data-tab-id="task-1"] .ai-task-tab-select:visible').click();
  await waitModernSignal(page,()=>document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId==='candidate-1',null,'historical owner selection');
  await page.locator('#ai-image-panel [data-tab-id="task-0"] .ai-task-tab-select:visible').click();await observe('auto-reselected');
  const checkpoint=await page.evaluate(()=>window.__task2Manager.checkpointForClose());write(evidence,'actual-auto-checkpoint.json',checkpoint);assert.equal(checkpoint.recovered,true);
  await observe('auto-checkpointed');
  const originalUrl=page.url();await page.reload({waitUntil:'domcontentloaded'});assert.equal(page.url(),originalUrl);
  await waitModernSignal(page,()=>Boolean(window.__task2Manager)&&Boolean(document.querySelector('#ai-image-panel [data-ai-send]')),null,'canonical manager initialization');
  if(!await page.locator('#ai-image-panel').isVisible())await page.locator('#ai-image-install-open').click();
  await observe('auto-reloaded',true);
  assert.match(expected.id, /^[A-Za-z0-9_-]+$/, 'Exact controlled candidate identity');
  const selectedCard=page.locator('#ai-image-panel .is-ai-active-candidate[data-ai-candidate-id="'+expected.id+'"]');
  const saveButton=page.locator('#ai-image-panel .ai-output-actions > [data-ai-save-selected]');
  const saveContract=await page.evaluate(id=>{
    const panel=document.querySelector('#ai-image-panel');
    const cards=[...panel.querySelectorAll('.is-ai-active-candidate[data-ai-candidate-id]')];
    const card=cards.find(card=>card.dataset.aiCandidateId===id),button=panel.querySelector('.ai-output-actions > [data-ai-save-selected]');
    const candidateHandler=card?.querySelector('[data-ai-save-candidate]');
    const rect=button?.getBoundingClientRect(),ancestors=[];
    for(let node=button;node&&node!==panel;node=node.parentElement){const css=getComputedStyle(node);ancestors.push({tag:node.localName,className:node.className,hidden:node.hidden,display:css.display,visibility:css.visibility});}
    return {url:location.href,selectedId:panel.dataset.aiSelectedCandidateId,busy:panel.dataset.aiBusy,
      selectedCards:cards.map(card=>card.dataset.aiCandidateId),cardConnected:Boolean(card?.isConnected),buttonConnected:Boolean(button?.isConnected),
      disabled:button?.disabled,candidateHandlerConnected:Boolean(candidateHandler?.isConnected),
      candidateHandlerCount:card?.querySelectorAll('[data-ai-save-candidate]').length,candidateHandlerDisabled:candidateHandler?.disabled,
      rect:rect?{x:rect.x,y:rect.y,width:rect.width,height:rect.height}:null,ancestors,
      footerSaveCount:panel.querySelectorAll('[data-ai-save-selected]').length};
  },expected.id);
  write(evidence,'actual-auto-save-ui-contract.json',saveContract);
  assert.equal(saveContract.selectedId,expected.id);assert.equal(saveContract.busy,'false');
  assert.deepEqual(saveContract.selectedCards,[expected.id]);assert.equal(saveContract.cardConnected,true);assert.equal(saveContract.buttonConnected,true);
  assert.equal(await selectedCard.count(),1,'Exactly one live selected candidate owns PNG saving');
  assert.equal(saveContract.footerSaveCount,1,'Exactly one selected-result save entry belongs to the active workbench');
  assert.equal(saveContract.candidateHandlerConnected,true,'The selected live card retains its original save controller');
  assert.equal(saveContract.candidateHandlerCount,1);assert.equal(saveContract.candidateHandlerDisabled,false);
  assert.equal(await saveButton.count(),1,'Exactly one actual fixed-footer PNG save button');
  assert.equal(await saveButton.isVisible(),true,'Actual selected PNG saving must have a physically visible UI entry');
  assert.equal(await saveButton.isEnabled(),true,'The real PNG save controller must be enabled');
  // Physically click only the visible fixed-footer action. The unchanged product
  // handler forwards to its selected card's hidden controller; the test never
  // invokes a hidden click/API. Require the real browser download and disk file.
  const [download]=await Promise.all([page.waitForEvent('download'),saveButton.click()]);
  assert.match(download.suggestedFilename(), /\.png$/i, 'The actual download is a PNG file');
  const pngPath=path.join(evidence,'modern-auto-actual-save.png');await download.saveAs(pngPath);
  const savedBytes=fs.readFileSync(pngPath),expectedBytes=Buffer.from(expected.data.split(',')[1],'base64');
  write(evidence,'actual-auto-save-file.json',{path:pngPath,bytes:savedBytes.length,sha256:require('node:crypto').createHash('sha256').update(savedBytes).digest('hex'),expectedBytes:expectedBytes.length,expectedSHA256:require('node:crypto').createHash('sha256').update(expectedBytes).digest('hex')});
  assert.deepEqual(savedBytes,expectedBytes,'Actual Save retains every encoded RAW PNG byte');
  const savedSHA256=require('node:crypto').createHash('sha256').update(savedBytes).digest('hex');
  assert.equal(savedSHA256,require('node:crypto').createHash('sha256').update(expectedBytes).digest('hex'),'Actual downloaded file SHA matches every captured RAW byte');
  const savedData='data:image/png;base64,'+savedBytes.toString('base64');
  const savedPixelProof=await page.evaluate(async data=>{
    const image=new Image();image.src=data;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const context=canvas.getContext('2d');context.drawImage(image,0,0);const rgba=context.getImageData(0,0,canvas.width,canvas.height).data;
    const {imageLabelDigest}=await import(window.__runtime.base+'ai-image-label-run.js'+window.__runtime.query);
    return {digest:await imageLabelDigest(data),pixels:{width:canvas.width,height:canvas.height,
      rgbaHash:[...new Uint8Array(await crypto.subtle.digest('SHA-256',rgba))].map(v=>v.toString(16).padStart(2,'0')).join(''),
      alpha:[rgba[3],rgba[(100*canvas.width+80)*4+3]]}};
  },savedData);
  write(evidence,'actual-auto-downloaded-pixels.json',{path:pngPath,sha256:savedSHA256,...savedPixelProof});
  assert.equal(savedPixelProof.digest,expected.storedDigest,'Downloaded file retains the accepted candidate byte digest');
  assert.deepEqual(savedPixelProof.pixels,expected.raw,'Every decoded downloaded RGBA channel matches the real generated RAW');
  await observe('auto-saved',true);
  const originalObjects=await page.evaluate(()=>JSON.parse(JSON.stringify(window.__integrationState.get().objects)));
  assert.equal(originalObjects.filter(object=>object.aiTaskId==='task-0'&&object.aiCandidateId===expected.id).length,0);
  await page.evaluate(id=>{
    const state=window.__integrationState,panel=document.querySelector('#ai-image-panel');
    window.__modernAutoInsertDone=new Promise((resolve,reject)=>{
      let timer,off;const clean=()=>{off?.();observer.disconnect();clearTimeout(timer);};
      const check=()=>{const own=state.get().objects.filter(object=>object.aiTaskId==='task-0'&&object.aiCandidateId===id);if(own.some(object=>object.type==='image')&&panel.hidden&&panel.dataset.aiBusy==='false'){clean();resolve(own);}};
      const observer=new MutationObserver(check);observer.observe(panel,{attributes:true});off=state.subscribe(check);
      timer=setTimeout(()=>{clean();reject(new Error('Actual modern RAW materializer completion deadline'));},15000);check();
    });window.__modernAutoInsertDone.catch(()=>{});
  },expected.id);
  await page.locator('#ai-image-panel [data-ai-insert-selected]').click();
  const inserted=await page.evaluate(()=>window.__modernAutoInsertDone),images=inserted.filter(object=>object.type==='image');write(evidence,'actual-auto-native-insertion.json',{originalObjects,inserted});
  assert.equal(images.length,1);assert.equal(images[0].src,expected.data);assert.equal(images[0].aiTaskId,'task-0');assert.equal(images[0].aiCandidateId,expected.id);
  await waitModernSignal(page,id=>{
    const owner=document.querySelector('#scene [data-id="'+CSS.escape(id)+'"]');
    return Boolean(owner?.localName==='image'?owner:owner?.querySelector('image'));
  },images[0].id,'actual materialized image render');
  const insertionPixels=await page.evaluate(async id=>{
    const owner=document.querySelector('#scene [data-id="'+CSS.escape(id)+'"]'),node=owner.localName==='image'?owner:owner.querySelector('image'),href=node.getAttribute('href');
    const image=new Image();image.src=href;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d');context.drawImage(image,0,0);const rgba=context.getImageData(0,0,canvas.width,canvas.height).data;
    const {imageLabelDigest}=await import(window.__runtime.base+'ai-image-label-run.js'+window.__runtime.query);
    return{objectId:id,href,digest:await imageLabelDigest(href),pixels:{width:canvas.width,height:canvas.height,rgbaHash:[...new Uint8Array(await crypto.subtle.digest('SHA-256',rgba))].map(v=>v.toString(16).padStart(2,'0')).join(''),alpha:[rgba[3],rgba[(100*canvas.width+80)*4+3]]}};
  },images[0].id);
  write(evidence,'actual-auto-native-render.json',insertionPixels);
  assert.equal(insertionPixels.href,expected.data);assert.equal(insertionPixels.digest,expected.storedDigest);assert.deepEqual(insertionPixels.pixels,expected.raw);
  await page.screenshot({path:path.join(evidence,'actual-auto-native-render.png')});
  const after=await page.evaluate(id=>({others:window.__integrationState.get().objects.filter(object=>!(object.aiTaskId==='task-0'&&object.aiCandidateId===id)),sends:window.__task2.sends.length,outputCalls:window.__outputProcessCalls||[],separationCalls:window.__localSeparationCalls||[]}),expected.id);
  assert.deepEqual(after.others,originalObjects);assert.equal(after.sends,0);assert.deepEqual(after.outputCalls,[]);assert.deepEqual(after.separationCalls,[]);
  // Reopen through the actual toolbar after materialization and recheck durable
  // candidate bindings/visible pixels rather than treating an inserted ID as proof.
  await page.locator('#ai-image-install-open').click();await observe('auto-inserted-and-reopened',true);
  write(evidence,'auto-lifecycle.json',{receipts,checkpoint,pngPath,inserted,insertionPixels,after,combinedProviderCalls:3,combinedGenerationCalls:1,localTransforms:0});
}

// RAW-CONTRACT-TRANSITION-APPEND-01
// Original 16 tests above are retained byte for byte. These timing tests serve
// explicitly instrumented native-decode and separation observers; they do not
// certify a wholly uninstrumented module closure or provider quality.
const rawTransitionCrypto = require('node:crypto');
const rawTransitionOriginalBytes = 57222;
const rawTransitionOriginalSHA = '2b3a2c81a48e8148ddecf57e15fbbe950ff6c7469645de94410a23ef63e02f62';
const rawTransitionPrefix = fs.readFileSync(__filename).subarray(0, rawTransitionOriginalBytes);
assert.equal(rawTransitionCrypto.createHash('sha256').update(rawTransitionPrefix).digest('hex'), rawTransitionOriginalSHA,
  'Every original test/assertion prefix is the reviewed unchanged source');

async function installRawTransitionDecodeRoute(page, runtime, origin, evidence) {
  const expectedURL = new URL(runtime.moduleBase + 'image-background.js' + runtime.moduleQuery, origin).href;
  const source = fs.readFileSync(path.join(root, 'js/image-background.js'), 'utf8');
  const onloadSeam = 'img.onload = () => resolve(img);';
  const exportSeam = 'export async function transparentizeGeneratedImage(';
  assert.equal(source.split(onloadSeam).length - 1, 1, 'Exactly one real native image success-delivery seam');
  assert.equal(source.split(exportSeam).length - 1, 1, 'Exactly one retained real processing function');
  const onloadObserver = `img.onload = () => {
    const gate = window.__rawTransitionDecodeGate;
    const panel = document.querySelector('#ai-image-panel');
    if (!gate || !gate.armed || src !== gate.raw || panel?.dataset.aiSelectedCandidateId !== gate.candidateId) {
      resolve(img); return;
    }
    gate.armed = false;
    (async () => {
      await HTMLImageElement.prototype.decode.call(img);
      gate.receipt = { src, currentSrc:img.currentSrc, width:img.naturalWidth, height:img.naturalHeight,
        nativeImage:img instanceof HTMLImageElement, nativeDecodeCompleted:true,
        candidateId:panel.dataset.aiSelectedCandidateId };
      gate.enteredResolve(gate.receipt);
      window.dispatchEvent(new CustomEvent('5e:test-raw-native-decode-entered',{detail:gate.receipt}));
      await gate.releasePromise;
      resolve(img);
    })().catch(error => { gate.enteredReject(error); reject(error); });
  };`;
  const observerExport = `
export async function transparentizeGeneratedImage(src, options) {
  const call = { src, policy:options?.backgroundPolicy, candidateId:document.querySelector('#ai-image-panel')?.dataset.aiSelectedCandidateId };
  (window.__rawTransitionProcessing ||= []).push(call);
  const gate = window.__rawTransitionDecodeGate;
  const own = gate && gate.armed && gate.raw === src && gate.candidateId === call.candidateId;
  if (own) { if (gate.call) throw new Error('Duplicate processing entry before actual one-shot decode'); gate.call = call; }
  try {
    const result = await realRawTransitionTransparentizeGeneratedImage(src, options);
    call.result = result; call.completed = true;
    if (own) gate.completedResolve(result);
    return result;
  } catch (error) {
    call.error = String(error?.message || error); call.completed = true;
    if (own) { gate.enteredReject(error); gate.completedReject(error); }
    throw error;
  }
}`;
  const body = source.replace(onloadSeam, onloadObserver)
    .replace(exportSeam, 'async function realRawTransitionTransparentizeGeneratedImage(') + observerExport;
  const loads = [];
  await page.route(expectedURL, route => {
    assert.equal(route.request().url(), expectedURL, 'Observer uses the one canonical processing module URL');
    assert.equal(new URL(expectedURL).origin, new URL(origin).origin);
    loads.push({ requestURL:route.request().url(), expectedURL, entry:runtime.entry,
      sourceSHA256:rawTransitionCrypto.createHash('sha256').update(source).digest('hex'),
      servedSHA256:rawTransitionCrypto.createHash('sha256').update(body).digest('hex'),
      nativeOnloadSeamCount:1, realProcessingFunctionRetained:true, nativeImageRetained:true,
      qualification:'Native load/decode delivery observer, not an unmodified processing module' });
    write(evidence, 'actual-native-decode-module-loads.json', loads);
    return route.fulfill({ contentType:'text/javascript', body });
  });
  // Observe only the real algorithm entered by the physical separation choices.
  // Its prepared data is transient and deliberately absent from task snapshots.
  const separatedURL=new URL(runtime.moduleBase+'ai-separated-assets.js'+runtime.moduleQuery,origin).href;
  const separatedSource=fs.readFileSync(path.join(root,'js/ai-separated-assets.js'),'utf8');
  const separatedSeam='export async function prepareSeparatedAssets(';
  assert.equal(separatedSource.split(separatedSeam).length-1,1,'One actual separation observation seam');
  const separatedBody=separatedSource.replace(separatedSeam,'async function realRawTransitionPrepareSeparatedAssets(')+`\nexport async function prepareSeparatedAssets(...args) {
    const call={source:args[0],layout:args[1]?.layout,candidateId:document.querySelector('#ai-image-panel')?.dataset.aiSelectedCandidateId};
    (window.__rawTransitionSeparations ||= []).push(call);
    try { const result=await realRawTransitionPrepareSeparatedAssets(...args);call.prepared=result;call.completed=true;return result; }
    catch(error){call.error=String(error?.message||error);call.completed=true;throw error;}
  }`;
  await page.route(separatedURL,route=>{
    assert.equal(route.request().url(),separatedURL);
    write(evidence,'actual-separation-observer-load.json',{requestURL:route.request().url(),entry:runtime.entry,
      sourceSHA256:rawTransitionCrypto.createHash('sha256').update(separatedSource).digest('hex'),
      servedSHA256:rawTransitionCrypto.createHash('sha256').update(separatedBody).digest('hex'),
      realAlgorithmResultUnchanged:true,qualification:'Pass-through entry/result observation, not unmodified module closure'});
    return route.fulfill({contentType:'text/javascript',body:separatedBody});
  });
}
const rawTransitionEntrySeam = '  const entryReceipt = await inspectEntry';
assert.equal(harness.split(rawTransitionEntrySeam).length - 1, 1, 'Actual fixture entry seam occurs once');
const rawTransitionHarness = harness.replace("separationMode: 'off',", "separationMode: 'off', generationMode: 'single',")
  .replace(rawTransitionEntrySeam, '  await installRawTransitionDecodeRoute(page, runtime, origin, evidence);\n' + rawTransitionEntrySeam);
const rawTransitionFixture = new Function('require', 'root', 'fs', 'path', 'assert', 'chromium', 'webkit',
  'installRawTransitionDecodeRoute', rawTransitionHarness + '; return requestBrowserFixture;')(
  require, root, fs, path, assert, chromium, webkit, installRawTransitionDecodeRoute);

function rawTransitionConfigure(engine, entry) {
  const keys = ['TASK2_ENGINE','APP_ENTRY','APP_MODULE_BASE','APP_MODULE_QUERY'];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.TASK2_ENGINE = engine; process.env.APP_ENTRY = entry;
  // Derive each HTML's actual singleton identity rather than carrying a binding
  // captured for another entry. Every earlier environment field is restored.
  delete process.env.APP_MODULE_BASE; delete process.env.APP_MODULE_QUERY;
  return () => { for (const key of keys) if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; };
}
async function rawTransitionPromise(page, name, label) {
  return page.evaluate(({name,label}) => new Promise((resolve,reject) => {
    const value = name.split('.').reduce((item,key) => item?.[key], window);
    if (!value || typeof value.then !== 'function') { reject(new Error('Missing actual event promise: '+label)); return; }
    const timer = setTimeout(() => reject(new Error('Actual RAW transition event deadline: '+label)), 15000);
    value.then(result => { clearTimeout(timer); resolve(result); }, error => { clearTimeout(timer); reject(error); });
  }), {name,label});
}
async function rawTransitionSnapshot(page) {
  return page.evaluate(() => window.__task2Manager.sharingSnapshot());
}
function rawTransitionTab(snapshot, id) {
  const matches = snapshot.workspaces.flatMap(workspace => workspace.tabs).filter(tab => tab.id === id);
  assert.equal(matches.length, 1, 'Exactly one actual task owner: ' + id);
  return matches[0];
}
async function rawTransitionSelect(page, id, candidateId) {
  const button = page.locator(`${panel} [data-tab-id="${id}"] .ai-task-tab-select:visible`);
  assert.equal(await button.count(), 1); assert.equal(await button.isEnabled(), true);
  await button.click();
  await waitModernSignal(page, candidateId => document.querySelector('#ai-image-panel')?.dataset.aiSelectedCandidateId === candidateId,
    candidateId, 'exact restored owner selection');
}
async function rawTransitionPixels(page, value) {
  return page.evaluate(async value => {
    const {imageLabelDigest} = await import(new URL(window.__runtime.base+'ai-image-label-run.js'+window.__runtime.query, location.href).href);
    const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2,'0')).join('');
    const decode = async src => {
      const image = new Image(); image.src = src; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d'); context.drawImage(image,0,0);
      return {width:canvas.width,height:canvas.height,rgba:context.getImageData(0,0,canvas.width,canvas.height).data};
    };
    const raw = await decode(value.raw), actual = await decode(value.data), alpha = new Uint8Array(actual.width*actual.height);
    let channelMismatches=0, alphaMismatches=0, interiorMismatches=0;
    if (raw.rgba.length !== actual.rgba.length) throw new Error('Actual PNG dimensions changed');
    for(let i=0;i<actual.rgba.length;i++) if(actual.rgba[i]!==raw.rgba[i])channelMismatches++;
    for(let i=0;i<alpha.length;i++){alpha[i]=actual.rgba[i*4+3];if(alpha[i]!==raw.rgba[i*4+3])alphaMismatches++;}
    for(let y=54;y<226;y++)for(let x=44;x<136;x++)for(let c=0;c<4;c++){
      const i=(y*actual.width+x)*4+c;if(actual.rgba[i]!==raw.rgba[i])interiorMismatches++;
    }
    const sample=(x,y)=>[...actual.rgba.slice((y*actual.width+x)*4,(y*actual.width+x)*4+4)];
    const encoded=Uint8Array.from(atob(value.data.split(',')[1]),c=>c.charCodeAt(0));
    return {width:actual.width,height:actual.height,rgbaSHA256:await hash(actual.rgba),alphaSHA256:await hash(alpha),
      encodedSHA256:await hash(encoded),labelDigest:await imageLabelDigest(value.data),
      channelMismatches,alphaMismatches,interiorMismatches,outside:sample(0,0),inside:sample(80,100),ink:sample(40,100)};
  }, value);
}
async function rawTransitionPreview(page, raw, candidateId) {
  await waitModernSignal(page, candidateId => {
    const p=document.querySelector('#ai-image-panel'),images=p?.querySelectorAll('.is-ai-active-candidate .ai-preview-stage > img');
    return p?.dataset.aiSelectedCandidateId===candidateId&&images?.length===1&&images[0].complete&&images[0].naturalWidth;
  },candidateId,'live selected native image');
  const observed = await page.evaluate(async () => {
    const p=document.querySelector('#ai-image-panel'),images=[...p.querySelectorAll('.is-ai-active-candidate .ai-preview-stage > img')];
    if(images.length!==1)throw new Error('Exactly one live selected preview is required');await images[0].decode();
    return {selected:p.dataset.aiSelectedCandidateId,src:images[0].src,busy:p.dataset.aiBusy};
  });
  return {...observed,pixels:await rawTransitionPixels(page,{raw,data:observed.src})};
}
async function rawTransitionAssertRaw(page, raw, candidateId, reference, evidence, phase) {
  const observation=await rawTransitionPreview(page,raw,candidateId);write(evidence,phase+'.json',observation);
  assert.equal(observation.selected,candidateId);assert.equal(observation.src,raw,'Live preview retains every encoded RAW byte');
  assert.deepEqual(observation.pixels,reference,'Full decoded RGBA, alpha, dimensions, bytes and data-URL digest remain RAW');
  assert.equal(observation.pixels.channelMismatches,0);assert.equal(observation.pixels.alphaMismatches,0);
  await page.screenshot({path:path.join(evidence,phase+'.png')});return observation;
}
async function rawTransitionFooter(page) {
  const button=page.locator(`${panel} .ai-output-actions > [data-ai-save-selected]`);
  assert.equal(await button.count(),1);assert.equal(await button.isVisible(),true);assert.equal(await button.isEnabled(),true);
  return button;
}
async function rawTransitionVerifyDownload(page, download, expectedData, raw, evidence, filename) {
  assert.match(download.suggestedFilename(),/\.png$/i);assert.equal(await download.failure(),null);
  const file=path.join(evidence,filename);await download.saveAs(file);
  const actual=fs.readFileSync(file),expected=Buffer.from(expectedData.split(',')[1],'base64');
  assert.deepEqual(actual,expected,'Actual browser disk download retains every expected PNG byte');
  const sha=rawTransitionCrypto.createHash('sha256').update(actual).digest('hex');
  assert.equal(sha,rawTransitionCrypto.createHash('sha256').update(expected).digest('hex'));
  const data='data:image/png;base64,'+actual.toString('base64');
  const pixels=await rawTransitionPixels(page,{data,raw}),preview=await rawTransitionPixels(page,{data:expectedData,raw});
  assert.deepEqual(pixels,preview,'Actual downloaded pixels match the entire expected preview, not only samples');
  write(evidence,filename+'.receipt.json',{file,bytes:actual.length,sha256:sha,pixels});return pixels;
}
async function rawTransitionSaveNow(page, expectedData, raw, evidence, filename) {
  const button=await rawTransitionFooter(page);
  const pending=page.waitForEvent('download');pending.catch(()=>{});
  await button.click();return rawTransitionVerifyDownload(page,await pending,expectedData,raw,evidence,filename);
}
async function rawTransitionHistoricalPositive(page, evidence) {
  await rawTransitionSelect(page,'task-1','candidate-1');
  const before=rawTransitionTab(await rawTransitionSnapshot(page),'task-1');
  const raw=before.generated[0].data;
  assert.equal(await page.locator(`${panel} [data-ai-legacy-result-settings]`).isVisible(),true);
  await chooseExposedOutputSetting(page,evidence,'background','connected');await settled(page);
  const processed=await rawTransitionPreview(page,raw,'candidate-1');write(evidence,'historical-positive-preview.json',processed);
  assert.notEqual(processed.src,raw);assert.equal(processed.pixels.outside[3],0);assert.equal(processed.pixels.inside[3],255);
  assert.equal(processed.pixels.ink[3],255);assert.equal(processed.pixels.interiorMismatches,0);
  const saved=await rawTransitionSaveNow(page,processed.src,raw,evidence,'historical-positive.png');
  assert.deepEqual(saved,processed.pixels);
  const after=rawTransitionTab(await rawTransitionSnapshot(page),'task-1');
  assert.deepEqual(after.generated,before.generated,'Historical processing preserves every original candidate/provenance field');
  assert.deepEqual(after.attachments,before.attachments);
  assert.equal(await page.evaluate(()=>window.__task2.sends.length),0,'Historical local processing sends no AI request');
  await chooseExposedOutputSetting(page,evidence,'background','preserve');await settled(page);
  assert.equal((await rawTransitionPreview(page,raw,'candidate-1')).src,raw);
  await rawTransitionSelect(page,'task-0','candidate-0');
}
async function rawTransitionArmDecode(page, raw, candidateId) {
  await page.evaluate(({raw,candidateId})=>{
    const gate={raw,candidateId,armed:true};
    gate.enteredPromise=new Promise((resolve,reject)=>{gate.enteredResolve=resolve;gate.enteredReject=reject;});
    gate.completedPromise=new Promise((resolve,reject)=>{gate.completedResolve=resolve;gate.completedReject=reject;});
    gate.releasePromise=new Promise(resolve=>{gate.release=resolve;});
    gate.enteredPromise.catch(()=>{});gate.completedPromise.catch(()=>{});
    window.__rawTransitionDecodeGate=gate;
  },{raw,candidateId});
}
async function rawTransitionObserveSave(page, candidateId) {
  await page.evaluate(candidateId=>{
    const prior=window.__rawTransitionSaveObservation;
    if(prior && prior.button?.onclick===prior.proxy)prior.button.onclick=prior.original;
    const card=document.querySelector('#ai-image-panel .is-ai-active-candidate');
    if(card?.dataset.aiCandidateId!==candidateId)throw new Error('Actual save observation belongs to another owner');
    const button=card.querySelector('[data-ai-save-candidate]'),original=button?.onclick;
    if(typeof original!=='function')throw new Error('Actual card save handler is required');
    const observation={button,original,calls:0,settled:false};
    observation.done=new Promise(resolve=>{observation.resolve=resolve;});
    observation.proxy=async function(...args){
      observation.calls++;
      try{return await original.apply(this,args);}
      finally{observation.settled=true;observation.resolve({calls:observation.calls,busy:document.querySelector('#ai-image-panel')?.dataset.aiBusy});}
    };
    button.onclick=observation.proxy;window.__rawTransitionSaveObservation=observation;
  },candidateId);
}
async function rawTransitionObserveScopedDispatch(page) {
  await page.evaluate(()=>{
    const original=window.fiveEDesktop.send;
    const observation={original};
    observation.done=new Promise((resolve,reject)=>{observation.resolve=resolve;observation.reject=reject;});observation.done.catch(()=>{});
    observation.proxy=async function(payload){
      try{
        const result=await original.call(this,payload);
        if(payload.purpose==='image'){
          window.fiveEDesktop.send=original;
          observation.resolve({payload:structuredClone(payload),result:structuredClone(result),snapshot:await window.__task2Manager.sharingSnapshot()});
        }
        return result;
      }catch(error){observation.reject(error);throw error;}
    };
    window.fiveEDesktop.send=observation.proxy;window.__rawTransitionScopedDispatch=observation;
  });
}
async function rawTransitionProtectedControls(page) {
  const state=await page.evaluate(async()=>{
    const p=document.querySelector('#ai-image-panel');
    const snapshot=await window.__task2Manager.sharingSnapshot();
    const candidate=snapshot.workspaces.flatMap(w=>w.tabs).flatMap(t=>t.generated).find(c=>c.id===p.dataset.aiSelectedCandidateId);
    const output=await import(new URL(window.__runtime.base+'ai-output-processing.js'+window.__runtime.query,location.href).href);
    const settings=p.querySelector('[data-ai-legacy-result-settings]');
    const choices=[...p.querySelectorAll('[data-ai-setting-key="background"] button,[data-ai-setting-key="objects"] button')]
      .map(button=>({value:button.dataset.aiSettingValue,visible:button.getClientRects().length>0&&getComputedStyle(button).visibility!=='hidden',disabled:button.disabled}));
    const groups=p.querySelector('[data-ai-editable-groups]');
    return {raw:output.requiresRawImageOutput(candidate),historical:output.isHistoricalPngLocalResult(candidate),
      blocked:output.canChooseLocalOutput(candidate,'background','connected',{mode:'pro',busy:false})===false,
      settingsPresent:Boolean(settings),settingsHidden:settings?.hidden,choices,groupsDisabled:groups.disabled,groupState:groups.dataset.aiSeparationState};
  });
  assert.equal(state.raw,true);assert.equal(state.historical,false);assert.equal(state.blocked,true);
  assert.equal(state.settingsPresent,true);assert.equal(state.settingsHidden,true);
  assert.deepEqual(state.choices.filter(choice=>choice.visible&&!choice.disabled),[],'Protected output exposes no enabled physical local-processing choice');
  assert.equal(state.groupsDisabled,true);assert.equal(state.groupState,'');return state;
}
function rawTransitionPreserved(before, after, {history=false}={}) {
  assert.deepEqual(after.attachments,before.attachments,'Every complete source attachment field stays exact');
  assert.equal(after.selectedCandidateId,before.selectedCandidateId);assert.equal(after.generated.length,before.generated.length);
  for(const original of before.generated){
    const current=after.generated.find(item=>item.id===original.id);assert.ok(current,'Original candidate is retained');
    for(const key of Object.keys(original)){
      assert.equal(Object.hasOwn(current,key),true,'Original candidate key retained: '+key);
      if(history&&key==='scopedEditHistory'){
        assert.deepEqual(original[key],[],'Fresh historical candidate had no prior protected history');
      }else assert.deepEqual(current[key],original[key],'Every original candidate field retained: '+key);
    }
  }
}
async function rawTransitionCancel(page) {
  const interrupt=page.locator(`${panel} [data-ai-interrupt]`);
  assert.equal(await interrupt.isVisible(),true);assert.equal(await interrupt.isEnabled(),true);await interrupt.click();
  await waitModernSignal(page,()=>document.querySelector('#ai-image-panel')?.dataset.aiBusy==='false',null,'actual scoped cancellation settlement');
  const snapshot=await rawTransitionSnapshot(page),tab=rawTransitionTab(snapshot,'task-0');
  assert.equal(tab.generated[0].scopedEditHistory.at(-1).status,'cancelled');return snapshot;
}
async function rawTransitionRelease(page) {
  await page.evaluate(()=>window.__rawTransitionDecodeGate.release());
  const output=await rawTransitionPromise(page,'__rawTransitionDecodeGate.completedPromise','actual retained legacy transform completion');
  const save=await rawTransitionPromise(page,'__rawTransitionSaveObservation.done','actual selected card save handler completion');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve())));
  return {output,save};
}
async function rawTransitionCleanup(page) {
  if(!page||page.isClosed())return;
  await page.evaluate(()=>{
    window.__rawTransitionDecodeGate?.release();
    const save=window.__rawTransitionSaveObservation;if(save && save.button?.onclick===save.proxy)save.button.onclick=save.original;
    const dispatch=window.__rawTransitionScopedDispatch;if(dispatch&&window.fiveEDesktop.send===dispatch.proxy)window.fiveEDesktop.send=dispatch.original;
  });
}

for(const engine of ['chromium','webkit'])for(const entry of ['/','/preview/']){
  const entryName=entry==='/'?'root':'preview';
  for(const ordering of ['release-while-busy','cancel-before-release']){
    test(`${engine} ${entryName}: historical native decode becomes RAW during scoped edit (${ordering})`,{timeout:150000,concurrency:false},async t=>{
      const evidence=path.join(evidenceRoot,'raw-contract-transition',engine,entryName,ordering);fs.mkdirSync(evidence,{recursive:true});
      const restore=rawTransitionConfigure(engine,entry);let page;
      t.after(()=>rawTransitionCleanup(page));
      try{
        const configured=await rawTransitionFixture(t,2,evidence);page=configured.page;const errors=configured.errors;
        assert.equal(new URL(page.url()).pathname,entry,'Actual requested HTML entry is loaded');
        const downloads=[];page.on('download',download=>downloads.push(download));
        await rawTransitionHistoricalPositive(page,evidence);
        const baseline=await rawTransitionSnapshot(page),owner=rawTransitionTab(baseline,'task-0'),peer=rawTransitionTab(baseline,'task-1');
        const candidate=owner.generated[0],raw=candidate.data;
        assert.equal(candidate.id,'candidate-0');assert.equal(owner.generated.length,1);
        const eligibility=await page.evaluate(async()=>{
          const output=await import(new URL(window.__runtime.base+'ai-output-processing.js'+window.__runtime.query,location.href).href);
          const snapshot=await window.__task2Manager.sharingSnapshot(),item=snapshot.workspaces.flatMap(w=>w.tabs).find(t=>t.id==='task-0').generated[0];
          return {historical:output.isHistoricalPngLocalResult(item),raw:output.requiresRawImageOutput(item),promptMode:document.querySelector('[data-ai-scoped-prompt-mode]')?.value||'legacy'};
        });
        assert.equal(eligibility.historical,true);assert.equal(eligibility.raw,false);
        assert.equal(candidate.comments.length,1);assert.equal(candidate.comments[0].type,'area');assert.equal(candidate.comments[0].imageId,candidate.id);
        assert.deepEqual([candidate.comments[0].x,candidate.comments[0].y,candidate.comments[0].w,candidate.comments[0].h],[25,25,25,25]);
        const reference=await rawTransitionPixels(page,{raw,data:raw});assert.equal(reference.channelMismatches,0);assert.equal(reference.outside[3],255);
        await rawTransitionArmDecode(page,raw,candidate.id);
        await chooseExposedOutputSetting(page,evidence,'background','connected');
        const native=await rawTransitionPromise(page,'__rawTransitionDecodeGate.enteredPromise','native image load/decode delivery');
        assert.equal(native.nativeImage,true);assert.equal(native.nativeDecodeCompleted,true);assert.equal(native.src,raw);assert.equal(native.currentSrc,raw);
        assert.equal(native.candidateId,candidate.id);assert.deepEqual([native.width,native.height],[512,384]);write(evidence,'actual-native-decode-entered.json',native);
        const startedDownloads=downloads.length;
        await rawTransitionObserveSave(page,candidate.id);
        const pendingDownload=ordering==='cancel-before-release'?page.waitForEvent('download',{timeout:45000}):null;pendingDownload?.catch(()=>{});
        await (await rawTransitionFooter(page)).click();
        assert.equal(await page.evaluate(()=>window.__rawTransitionSaveObservation.calls),1,'Physical footer delegates to the actual selected card handler once');
        assert.equal(await page.evaluate(()=>window.__rawTransitionSaveObservation.settled),false,'Actual save is held by the native decode');
        assert.equal(downloads.length-startedDownloads,0,'Held decoding has not produced a download');
        await rawTransitionObserveScopedDispatch(page);
        const apply=page.locator(`${panel} [data-ai-comments-apply]`);assert.equal(await apply.isVisible(),true);assert.equal(await apply.isEnabled(),true);await apply.click();
        assert.equal(await page.getByRole('dialog',{name:'수정 허용 범위 확인'}).count(),0,'Primary click authorizes the actual captured scope');
        const dispatch=await rawTransitionPromise(page,'__rawTransitionScopedDispatch.done','original correlated scoped provider-fixture request');
        assert.equal(await page.locator(panel).getAttribute('data-ai-busy'),'true');
        const started=rawTransitionTab(dispatch.snapshot,'task-0'),history=started.generated[0].scopedEditHistory;
        assert.equal(history.length,1);assert.equal(history[0].sourceCandidateId,candidate.id);assert.equal(history[0].promptMode,eligibility.promptMode);
        assert.equal(history[0].maximumAttempts,1);assert.equal(history[0].attempts.length,1);
        assert.equal(history[0].sourceSha256,reference.encodedSHA256,'Actual scoped history binds the exact original PNG byte digest');
        assert.equal(dispatch.payload.purpose,'image');assert.equal(dispatch.payload.model,'gpt-6.1-sol');assert.equal(dispatch.payload.effort,'medium');
        assert.equal(await page.evaluate(()=>window.__task2.sends.length),1);assert.ok(dispatch.result.turnId);
        rawTransitionPreserved(owner,started,{history:true});assert.deepEqual(rawTransitionTab(dispatch.snapshot,'task-1'),peer);
        const busyProtection=await rawTransitionProtectedControls(page);write(evidence,'actual-started-history-owner.json',{baseline,dispatch,busyProtection});
        assert.equal(await page.locator(`${panel} .ai-output-actions > [data-ai-save-selected]`).isDisabled(),true);
        let released,cancelled;
        if(ordering==='release-while-busy'){
          released=await rawTransitionRelease(page);
          assert.equal(released.save.calls,1);assert.equal(released.save.busy,'true');
          assert.equal(downloads.length-startedDownloads,0,'Awaiting save settles while busy with exactly zero downloads');
          await rawTransitionAssertRaw(page,raw,candidate.id,reference,evidence,'late-preview-while-busy');
          cancelled=await rawTransitionCancel(page);
        }else{
          cancelled=await rawTransitionCancel(page);
          assert.equal(downloads.length-startedDownloads,0);assert.equal(await page.evaluate(()=>window.__rawTransitionSaveObservation.settled),false);
          await rawTransitionProtectedControls(page);
          released=await rawTransitionRelease(page);
          assert.equal(released.save.calls,1);assert.equal(released.save.busy,'false');
          const file=await rawTransitionVerifyDownload(page,await pendingDownload,raw,raw,evidence,'pending-save-after-cancel.png');
          assert.deepEqual(file,reference);assert.equal(downloads.length-startedDownloads,1,'The original physical save completes exactly once after cancellation');
        }
        assert.notEqual(released.output,raw,'The real legacy transform ran and produced different bytes; RAW was not faked');
        const obsolete=await rawTransitionPixels(page,{raw,data:released.output});assert.equal(obsolete.outside[3],0);assert.ok(obsolete.alphaMismatches>0);
        const idleProtection=await rawTransitionProtectedControls(page);
        await rawTransitionAssertRaw(page,raw,candidate.id,reference,evidence,'raw-after-cancellation');
        rawTransitionPreserved(owner,rawTransitionTab(cancelled,'task-0'),{history:true});assert.deepEqual(rawTransitionTab(cancelled,'task-1'),peer);
        const beforeLate=await rawTransitionSnapshot(page);
        await page.evaluate(()=>{window.__task2.emit(0,'image');window.__task2.emit(0,'done');});
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve())));
        const afterLate=await rawTransitionSnapshot(page);
        assert.deepEqual(afterLate,beforeLate,'Original cancelled transport late events preserve the entire task/workspace union');
        assert.equal(await page.evaluate(()=>window.__task2.sends.length),1,'No automatic resend or extra observer/review request');
        const saved=await rawTransitionSaveNow(page,raw,raw,evidence,'idle-raw-save.png');assert.deepEqual(saved,reference);
        assert.equal(downloads.length-startedDownloads,ordering==='release-while-busy'?1:2,'Exact browser download count includes only the approved idle/pending saves');
        const checkpoint=await page.evaluate(()=>window.__task2Manager.checkpointForClose());assert.equal(checkpoint.recovered,true);
        write(evidence,'actual-transition-complete.json',{native,dispatch,released,obsolete,cancelled,idleProtection,checkpoint,downloads:downloads.length-startedDownloads,ordering,reference,errors});
        await rawTransitionSelect(page,'task-1','candidate-1');await rawTransitionSelect(page,'task-0',candidate.id);
        await rawTransitionAssertRaw(page,raw,candidate.id,reference,evidence,'raw-reselected');
        const exactBeforeReload=await rawTransitionSnapshot(page);await page.evaluate(()=>window.__task2Manager.checkpointForClose());
        const originalURL=page.url();await page.reload({waitUntil:'domcontentloaded'});assert.equal(page.url(),originalURL);
        await waitModernSignal(page,()=>Boolean(window.__task2Manager)&&Boolean(document.querySelector('#ai-image-panel [data-ai-send]')),null,'reloaded canonical owner');
        if(!await page.locator(panel).isVisible())await page.locator('#ai-image-install-open').click();
        await rawTransitionAssertRaw(page,raw,candidate.id,reference,evidence,'raw-reloaded');await rawTransitionProtectedControls(page);
        const recovered=await rawTransitionSnapshot(page);
        assert.deepEqual(rawTransitionTab(recovered,'task-0').generated,rawTransitionTab(exactBeforeReload,'task-0').generated,'Entire source/history/candidate payload survives actual reload');
        assert.deepEqual(rawTransitionTab(recovered,'task-0').attachments,owner.attachments);
        assert.deepEqual(rawTransitionTab(recovered,'task-1').generated,peer.generated);
        assert.equal(await page.evaluate(()=>window.__task2.sends.length),0,'Reload never replays the cancelled request');
        assert.deepEqual(errors,[]);
      }finally{t.after(restore);}
    });
  }

  test(`${engine} ${entryName}: genuine modern RAW retains the entire original producer and save/owner oracles`,{timeout:150000,concurrency:false},async t=>{
    const restore=rawTransitionConfigure(engine,entry);let page;
    t.after(()=>rawTransitionCleanup(page));
    try{
      const opening='  test(`${engine}: fixed source workflow records three stages and keeps the actual generated RAW alpha (${sourceSeparation})`, { timeout: 90000 }, async t => {';
      const prefix=rawTransitionPrefix.toString('utf8');assert.equal(prefix.split(opening).length-1,1);
      const from=prefix.indexOf(opening)+opening.length,to=prefix.indexOf('\n  });\n }\n\n  test(`${engine}: historical Lite',from);assert.ok(to>from);
      const body=prefix.slice(from,to);
      const ownEvidenceRoot=path.join(evidenceRoot,'raw-contract-transition',entryName,'genuine-modern');
      const captureModern=async(...args)=>{const value=await modernFixture(...args);page=value.page;return value;};
      const callback=new Function('path','evidenceRoot','process','fs','modernFixture','chooseExposedOutputSetting','panel','write','assert','qualifyModernAutoRaw','engine','sourceSeparation',
        'return async function(t){'+body+'\n};')(path,ownEvidenceRoot,process,fs,captureModern,chooseExposedOutputSetting,panel,write,assert,qualifyModernAutoRaw,engine,'auto');
      await callback(t); // Every substantive original producer assertion is reused verbatim.
      assert.equal(new URL(page.url()).pathname,entry);
      const protection=await rawTransitionProtectedControls(page);
      const evidence=path.join(ownEvidenceRoot,engine,'modern-first-raw-auto');
      write(evidence,'original-producer-reuse-and-protection.json',{entry,originalPrefixSHA256:rawTransitionOriginalSHA,
        originalCallbackSHA256:rawTransitionCrypto.createHash('sha256').update(body).digest('hex'),allOriginalProducerAssertionsRetained:true,protection});
    }finally{t.after(restore);}
  });

  test(`${engine} ${entryName}: physical historical auto/grid/manual separation stays available and preserves RAW`,{timeout:150000,concurrency:false},async t=>{
    const evidence=path.join(evidenceRoot,'raw-contract-transition',engine,entryName,'historical-separation');fs.mkdirSync(evidence,{recursive:true});
    const restore=rawTransitionConfigure(engine,entry);let page;t.after(()=>rawTransitionCleanup(page));
    try{
      const configured=await rawTransitionFixture(t,2,evidence);page=configured.page;
      const before=await rawTransitionSnapshot(page),owner=rawTransitionTab(before,'task-0'),peer=rawTransitionTab(before,'task-1'),raw=owner.generated[0].data;
      const objects=await page.evaluate(()=>structuredClone(window.__integrationState.get().objects));
      assert.equal(new URL(page.url()).pathname,entry);assert.equal(await page.locator(`${panel} [data-ai-legacy-result-settings]`).isVisible(),true);
      const groups=page.locator(`${panel} [data-ai-editable-groups]`);
      for(const mode of ['auto','grid']){
        await chooseExposedOutputSetting(page,evidence,'objects',mode);
        await waitModernSignal(page,()=>document.querySelector('#ai-image-panel [data-ai-editable-groups]')?.dataset.aiSeparationState==='ready',null,'actual '+mode+' segmentation');
        assert.equal(await page.locator(background).inputValue(),'connected');assert.equal(await page.locator(background).isDisabled(),true);
        const actualCall=await page.evaluate(mode=>(window.__rawTransitionSeparations||[]).filter(call=>call.layout===mode&&call.candidateId==='candidate-0').at(-1),mode);
        assert.ok(actualCall);assert.equal(actualCall.completed,true);assert.equal(actualCall.error,undefined);
        const prepared=actualCall.prepared;
        assert.ok(prepared);assert.equal(prepared.stats.rgbaVerified,true);assert.equal(prepared.stats.assignmentVerified,true);
        assert.equal(prepared.unassignedForegroundPixelCount,0);assert.equal(prepared.assignedForegroundPixelCount,prepared.foregroundPixelCount);
        if(mode==='auto')assert.equal(prepared.assets.length,3,'The retained three-disjoint-object fixture separates exactly three objects');
        else{assert.equal(prepared.stats.layoutMode,'fixed-grid');assert.ok(prepared.assets.length>0&&prepared.assets.length<=16);assert.ok(prepared.reviewReasons.includes('grid-boundary-foreground'),'Actual grid reports the original fixture objects crossing cell boundaries');}
        assert.equal(Number(await groups.getAttribute('data-ai-separated-count')),prepared.assets.length,'Physical result action reflects the actual algorithm result');
        assert.equal(await groups.isVisible(),true);assert.equal(await groups.isEnabled(),true);await groups.click();
        await waitModernSignal(page,count=>document.querySelectorAll('.aea-dialog .aea-thumbnail img').length===count,prepared.assets.length,'real '+mode+' dialog thumbnails');
        assert.deepEqual(await page.locator('.aea-dialog .aea-region-number').allTextContents(),prepared.assets.map((_,index)=>String(index+1)));
        await page.locator('.aea-dialog [data-action="cancel"]').click();await page.locator('.aea-dialog').waitFor({state:'detached'});
        write(evidence,'actual-'+mode+'-separation.json',prepared);
      }
      await chooseExposedOutputSetting(page,evidence,'objects','manual');
      assert.equal(await groups.getAttribute('data-ai-separation-state'),'manual');assert.equal(await groups.isVisible(),true);assert.equal(await groups.isEnabled(),true);await groups.click();
      const dialog=page.locator('.aea-dialog');await dialog.waitFor();await dialog.locator('[data-mode="region"]').click();
      await waitModernSignal(page,()=>{const overlay=document.querySelector('.aea-dialog .aea-overlay'),image=document.querySelector('.aea-dialog .aea-source');return image?.complete&&image.naturalWidth===512&&overlay?.viewBox.baseVal.width>0;},null,'actual manual image/coordinate plane');
      const points=await page.evaluate(()=>{
        const overlay=document.querySelector('.aea-dialog .aea-overlay'),matrix=overlay.getScreenCTM();if(!matrix)throw new Error('Actual manual SVG geometry is missing');
        return [[30,40],[150,240]].map(([x,y])=>{const point=new DOMPoint(x,y).matrixTransform(matrix);const hit=document.elementFromPoint(point.x,point.y);if(!hit||!(overlay===hit||overlay.contains(hit)))throw new Error('Manual rectangle is physically covered');return{x:point.x,y:point.y};});
      });
      await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();await page.mouse.move(points[1].x,points[1].y,{steps:8});await page.mouse.up();
      await waitModernSignal(page,()=>document.querySelector('.aea-dialog .aea-count')?.textContent==='1',null,'one physically drawn manual object');
      assert.equal(await dialog.locator('.aea-list > *').count(),1);
      await dialog.locator('[data-action="cancel"]').click();await dialog.waitFor({state:'detached'});
      await chooseExposedOutputSetting(page,evidence,'objects','off');await settled(page);
      const after=await rawTransitionSnapshot(page);
      assert.deepEqual(rawTransitionTab(after,'task-0').attachments,owner.attachments);
      assert.deepEqual(rawTransitionTab(after,'task-0').generated,owner.generated,'All serialized candidate/source/diagnostic fields survive cancelled local separation');
      assert.deepEqual(rawTransitionTab(after,'task-1'),peer,'Every unselected owner field is preserved');
      assert.deepEqual(await page.evaluate(()=>window.__integrationState.get().objects),objects,'Cancelling all three separation dialogs inserts zero objects');
      assert.equal(await page.evaluate(()=>window.__task2.sends.length),0);assert.deepEqual(configured.errors,[]);
      write(evidence,'actual-historical-separation-final.json',{before,after,points,zeroProviderCalls:true,zeroInsertedObjects:true});
    }finally{t.after(restore);}
  });
}

// COLLECTIVE-EXPORT-BROWSER-APPEND-05 / PRIVATE07 per-workspace correction.
// Keep all preceding 32 cases, including the original 57,222-byte prefix.
// ZIP fallback in Chromium has an explicit unsupported-directory capability
// fixture. Neither engine's ZIP case certifies native picker/directory/desktop IO.
assert.equal(rawTransitionCrypto.createHash('sha256').update(fs.readFileSync(__filename).subarray(0, 97549)).digest('hex'),
  '366a92f005950ec2d2e50c9eefbfc60737016501e6a6347c05306af7d5ab933c',
  'All 32 existing cases remain byte-for-byte preserved before the collective append');
async function installCollectiveExportObservation(page, runtime, origin, evidence) {
  const foreign = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['http:', 'https:'].includes(url.protocol) || url.origin === new URL(origin).origin) return route.fallback();
    foreign.push({ url: url.href, action: 'blocked-before-network' }); write(evidence, 'foreign-network.json', foreign);
    return route.abort('blockedbyclient');
  });
  write(evidence, 'foreign-network.json', foreign);
  await page.addInitScript(() => {
    const nativeDirectoryPicker = typeof window.showDirectoryPicker;
    // Explicitly qualify the existing unsupported-browser ZIP branch. Never
    // install a fake directory handle, chooser UI, writer, anchor or PNG.
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: undefined });
    const destination = {};
    destination.ready = new Promise(resolve => { destination.readyResolve = resolve; });
    destination.releasePromise = new Promise(resolve => { destination.release = resolve; });
    window.__collectiveProbe = { nativeDirectoryPicker, effectiveDirectoryPicker: typeof window.showDirectoryPicker,
      destination, exports: [], writes: [], events: [], managerEvents: [] };
  });
  await installRawTransitionDecodeRoute(page, runtime, origin, evidence);
  const serve = async (file, transform) => {
    const url = new URL(runtime.moduleBase + file + runtime.moduleQuery, origin).href;
    const source = fs.readFileSync(path.join(root, 'js', file), 'utf8'), body = transform(source);
    await page.route(url, route => {
      assert.equal(route.request().url(), url);
      write(evidence, file + '.observer-load.json', { url,
        sourceSHA256: rawTransitionCrypto.createHash('sha256').update(source).digest('hex'),
        servedSHA256: rawTransitionCrypto.createHash('sha256').update(body).digest('hex'),
        originalImplementationRetained: true, qualification: 'Pass-through timing/return observation; instrumented source' });
      return route.fulfill({ contentType: 'text/javascript', body });
    });
  };
  await serve('ai-panel.js', source => {
    const opening = '  const exportResults = async mode => {';
    const end = "  collectiveExportButton.addEventListener('click', async () => {";
    assert.equal(source.split(opening).length - 1, 1); assert.equal(source.split(end).length - 1, 1);
    return source.replace(opening, '  const observedOriginalCollectiveResults = async mode => {').replace(end, `
  const exportResults = async mode => {
    const probe = window.__collectiveProbe;
    const call = { mode, callIndex: probe.exports.length, managerId: clientScope || 'main',
      activeAtEntry: activeTaskTabId, settled: false, disposedAtEntry: disposed,
      connectedAtEntry: panel.isConnected, visibleAtEntry: panel.id === 'ai-image-panel' && !panel.hidden,
      ownersAtEntry: [...taskTabs.keys()].map(id => batchOwner(id)) };
    call.done = new Promise(resolve => { call.resolve = resolve; });
    probe.exports.push(call); probe.events.push('records-enter');
    probe.managerEvents.push({ phase: 'enter', callIndex: call.callIndex, managerId: call.managerId, taskId: activeTaskTabId });
    try {
      const records = await observedOriginalCollectiveResults(mode);
      call.records = records.map(record => ({ taskId: record.taskId, candidateId: record.candidateId,
        sourceName: record.sourceName, outputOptions: record.outputOptions, item: record.item,
        dataUrl: record.dataUrl, hasLiveReader: typeof record.currentDataUrl === 'function' }));
      return records;
    } catch (error) { call.error = String(error?.message || error); throw error; }
    finally {
      call.activeAtReturn = activeTaskTabId;
      call.ownersAtReturn = [...taskTabs.keys()].map(id => batchOwner(id));
      call.managerIdAtReturn = clientScope || 'main'; call.disposedAtReturn = disposed;
      call.connectedAtReturn = panel.isConnected; call.visibleAtReturn = panel.id === 'ai-image-panel' && !panel.hidden;
      call.settled = true; probe.events.push('records-return');
      probe.managerEvents.push({ phase: 'return', callIndex: call.callIndex, managerId: call.managerId, taskId: activeTaskTabId });
      call.resolve({ error: call.error || null });
    }
  };
` + end);
  });
  await serve('ai-task-export.js', source => {
    for (const name of ['chooseTaskExportDestination', 'writeTaskExports']) {
      const seam = 'export async function ' + name + '(';
      assert.equal(source.split(seam).length - 1, 1);
      source = source.replace(seam, 'async function observedOriginal' + name + '(');
    }
    return source + `
export async function chooseTaskExportDestination(...args) {
  const probe = window.__collectiveProbe; probe.events.push('destination-enter');
  const result = await observedOriginalchooseTaskExportDestination(...args);
  probe.destination.result = result ? { kind: result.kind } : null;
  probe.events.push('destination-selected');
  probe.destination.readyResolve(probe.destination.result);
  await probe.destination.releasePromise;
  probe.events.push('destination-return'); return result;
}
export async function writeTaskExports(...args) {
  const probe = window.__collectiveProbe;
  const call = { kind: args[0]?.kind, settled: false };
  call.done = new Promise(resolve => { call.resolve = resolve; });
  probe.writes.push(call); probe.events.push('writer-enter');
  try { const result = await observedOriginalwriteTaskExports(...args); call.result = result; return result; }
  catch(error) { call.error = String(error?.message || error); throw error; }
  finally { call.settled = true; probe.events.push('writer-return'); call.resolve({ error: call.error || null }); }
}
`;
  });
}

// Only the deterministic historical provider fixture's seed is extended: two
// actual canvas-encoded PNG versions per task, with different selected bytes.
// All production task managers, views, controls and provider dispatch stay real.
const collectiveSeedSeam = '  window.__task5Expected = structuredClone(tabs);';
assert.equal(rawTransitionHarness.split(collectiveSeedSeam).length - 1, 1);
assert.equal(rawTransitionHarness.split('await installRawTransitionDecodeRoute(page, runtime, origin, evidence);').length - 1, 1);
const collectiveExportHarness = rawTransitionHarness
  .replace('await installRawTransitionDecodeRoute(page, runtime, origin, evidence);',
    'await installCollectiveExportObservation(page, runtime, origin, evidence);')
  .replace(collectiveSeedSeam, `
  for (const [index, tab] of tabs.entries()) {
    tab.generated[0].data = index === 0 ? original : modified;
    tab.generated.push({ id: 'candidate-' + index + '-alt', kind: 'generated', name: '다른 버전 ' + (index + 1),
      data: index === 0 ? modified : original, comments: [], reviewState: 'idle' });
  }
` + collectiveSeedSeam);
const collectiveExportFixture = new Function('require', 'root', 'fs', 'path', 'assert', 'chromium', 'webkit',
  'installCollectiveExportObservation', collectiveExportHarness + '; return requestBrowserFixture;')(
  require, root, fs, path, assert, chromium, webkit, installCollectiveExportObservation);

async function collectiveProbeSnapshot(page) {
  return page.evaluate(() => {
    const p = window.__collectiveProbe;
    return { nativeDirectoryPicker: p.nativeDirectoryPicker, effectiveDirectoryPicker: p.effectiveDirectoryPicker,
      destination: p.destination.result, events: p.events, managerEvents: p.managerEvents,
      exports: p.exports.map(({ done, resolve, ...rest }) => rest),
      writes: p.writes.map(({ done, resolve, ...rest }) => rest),
      selected: document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId,
      processing: window.__rawTransitionProcessing || [], sends: window.__task2.sends,
      generationCount: window.__task2.generationSends.length };
  });
}
function collectiveAssertManagerCalls(probe, mode, { ownerSettled = false, offset = 0 } = {}) {
  assert.equal(probe.exports.length, offset + 2, 'Exactly two real workspace-controller calls per collection');
  const calls = probe.exports.slice(offset);
  assert.notEqual(calls[0].managerId, calls[1].managerId, 'Physical selection creates distinct controller lifetimes');
  assert.equal(calls[0].managerId, 'main');
  for (const [index, call] of calls.entries()) {
    const id = 'task-' + index;
    assert.equal(call.callIndex, offset + index); assert.equal(call.mode, mode);
    assert.equal(call.activeAtEntry, id); assert.equal(call.disposedAtEntry, false); assert.equal(call.connectedAtEntry, true);
    assert.deepEqual(call.ownersAtEntry, [{ scope: { sessionId: '5e', workspaceId: 'main' }, taskId: id }]);
    assert.equal(call.settled, index === 0 ? ownerSettled : true);
    if (call.settled) {
      assert.equal(call.activeAtReturn, id, 'An inactive workspace retains its own active task');
      assert.equal(call.managerIdAtReturn, call.managerId); assert.equal(call.disposedAtReturn, false);
      assert.equal(call.connectedAtReturn, true); assert.deepEqual(call.ownersAtReturn, call.ownersAtEntry);
    }
  }
  assert.equal(calls[1].error, undefined, 'The independent peer resolves successfully while task-0 is held');
  assert.deepEqual(calls[1].records.map(record => [record.taskId, record.candidateId]), mode === 'selected'
    ? [['task-1', 'candidate-1']] : [['task-1', 'candidate-1'], ['task-1', 'candidate-1-alt']]);
  for (const record of calls[1].records) {
    assert.equal(record.dataUrl, record.item.data, 'Peer preserve-policy output retains all original bytes');
    assert.equal(record.hasLiveReader, true);
  }
  return calls;
}
async function collectiveVisibleControl(page, selector, evidence, name) {
  const control = page.locator(selector);
  assert.equal(await control.count(), 1); assert.equal(await control.isVisible(), true); assert.equal(await control.isEnabled(), true);
  await control.scrollIntoViewIfNeeded();
  const receipt = await control.evaluate(node => {
    const rect = node.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { tag: node.localName, text: node.textContent, disabled: node.disabled,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      hit: Boolean(hit && (hit === node || node.contains(hit))) };
  });
  write(evidence, name + '.json', receipt); assert.equal(receipt.hit, true, 'Existing public control is physically hit-testable');
  return control;
}
async function collectiveChooseDestination(page, mode, evidence) {
  const menu = await collectiveVisibleControl(page, `${panel} [data-ai-task-export-mode]`, evidence, 'actual-range-menu');
  assert.deepEqual(await menu.locator('option').evaluateAll(nodes => nodes.map(node => ({ value: node.value, label: node.textContent }))),
    [{ value: 'selected', label: '작업별 선택 결과' }, { value: 'all', label: '모든 결과 버전' }]);
  await menu.selectOption(mode); assert.equal(await menu.inputValue(), mode);
  const button = await collectiveVisibleControl(page, `${panel} [data-ai-task-export]`, evidence, 'actual-collective-button');
  await page.screenshot({ path: path.join(evidence, 'actual-collective-controls.png') });
  const dialogPending = page.waitForEvent('dialog'); dialogPending.catch(() => {});
  const clicked = button.click(); clicked.catch(() => {});
  const dialog = await dialogPending;
  const receipt = { type: dialog.type(), message: dialog.message() };
  write(evidence, 'actual-destination-confirm.json', receipt);
  assert.equal(receipt.type, 'confirm'); assert.match(receipt.message, /ZIP 다운로드/);
  await dialog.accept(); await clicked;
  assert.deepEqual(await rawTransitionPromise(page, '__collectiveProbe.destination.ready', 'actual ZIP destination chosen'), { kind: 'browser-zip' });
  const held = await collectiveProbeSnapshot(page); write(evidence, 'destination-await.json', held);
  assert.deepEqual(held.events, ['destination-enter', 'destination-selected']);
  assert.equal(held.exports.length, 0, 'No export records are captured before destination return');
  assert.equal(held.writes.length, 0); assert.equal(held.effectiveDirectoryPicker, 'undefined');
}
function collectiveExpectedNames(mode) {
  return mode === 'selected'
    ? ['5E-AI-결과/검증 작업 1 - 원본 1.png', '5E-AI-결과/검증 작업 2 - 원본 2.png']
    : ['5E-AI-결과/검증 작업 1 - 원본 1 - 버전 1.png', '5E-AI-결과/검증 작업 1 - 원본 1 - 버전 2.png',
       '5E-AI-결과/검증 작업 2 - 원본 2 - 버전 1.png', '5E-AI-결과/검증 작업 2 - 원본 2 - 버전 2.png'];
}
async function collectiveVerifyZip(page, download, expected, evidence) {
  const suggested = download.suggestedFilename();
  write(evidence, 'native-download-filename.json', { suggested, nfc: suggested.normalize('NFC'),
    codePoints: [...suggested].map(value => value.codePointAt(0).toString(16)),
    qualification: 'Canonical Unicode equivalence only for native filename; ZIP entry names and PNG bytes remain exact.' });
  assert.equal(suggested.normalize('NFC'), '5E-AI-결과.zip', 'Native macOS filename represents the exact requested Korean name');
  assert.equal(await download.failure(), null);
  const zipPath = path.join(evidence, 'actual-collective.zip'); await download.saveAs(zipPath);
  const bytes = fs.readFileSync(zipPath); assert.ok(bytes.length > 22);
  // The production strict reader validates STORE headers, central directory,
  // sizes, duplicate names and CRC. The expectation list below is independent.
  const entries = await page.evaluate(async base64 => {
    const { unzipStore } = await import(new URL(window.__runtime.base + 'backup-zip.js' + window.__runtime.query, location.href).href);
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    return [...unzipStore(bytes)].map(([name, data]) => ({ name, bytes: [...data] }));
  }, bytes.toString('base64'));
  assert.deepEqual(entries.map(entry => entry.name), expected.map(entry => entry.name), 'Exact ZIP entries, order and version names; no missing or extra file');
  const receipts = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index], bound = expected[index];
    const actual = Buffer.from(entry.bytes), expectedBytes = Buffer.from(bound.data.split(',')[1], 'base64');
    const file = path.join(evidence, entry.name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, actual);
    assert.deepEqual(actual, expectedBytes, 'Every downloaded PNG byte matches its exact bound owner: ' + bound.candidateId);
    const data = 'data:image/png;base64,' + actual.toString('base64');
    const rgba = await page.evaluate(async ({ data, expected }) => {
      const decode = async src => {
        const img = new Image(); img.src = src; await img.decode();
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
        return { width: c.width, height: c.height, bytes: [...ctx.getImageData(0, 0, c.width, c.height).data] };
      };
      return { actual: await decode(data), expected: await decode(expected) };
    }, { data, expected: bound.data });
    fs.writeFileSync(file + '.rgba', Buffer.from(rgba.actual.bytes));
    assert.deepEqual(rgba.actual, rgba.expected, 'All decoded RGBA channels, alpha and dimensions match the bound expectation');
    const pixels = await rawTransitionPixels(page, { data, raw: bound.raw });
    if (bound.rawRequired) {
      assert.equal(data, bound.raw); assert.equal(pixels.channelMismatches, 0); assert.equal(pixels.alphaMismatches, 0);
    } else {
      assert.notEqual(data, bound.raw); assert.equal(pixels.outside[3], 0); assert.equal(pixels.inside[3], 255);
      assert.equal(pixels.ink[3], 255); assert.equal(pixels.interiorMismatches, 0); assert.ok(pixels.alphaMismatches > 0);
    }
    receipts.push({ name: entry.name, file, rgbaPath: file + '.rgba', taskId: bound.taskId, candidateId: bound.candidateId,
      rawRequired: bound.rawRequired, bytes: actual.length, sha256: rawTransitionCrypto.createHash('sha256').update(actual).digest('hex'), pixels });
  }
  write(evidence, 'zip-receipt.json', { zipPath, bytes: bytes.length,
    sha256: rawTransitionCrypto.createHash('sha256').update(bytes).digest('hex'), entries: receipts });
  return receipts;
}

for (const engine of ['chromium', 'webkit']) for (const mode of ['selected', 'all']) {
  for (const scenario of ['same-owner-capture', 'cancel-before-late-export']) {
    test(`${engine} root: public collective ZIP ${mode} (${scenario})`, { timeout: 150000, concurrency: false }, async t => {
      const evidence = path.join(evidenceRoot, 'collective-export', engine, 'root', mode, scenario);
      fs.mkdirSync(evidence, { recursive: true });
      const restore = rawTransitionConfigure(engine, '/'); let page;
      t.after(async () => {
        if (page && !page.isClosed()) {
          await page.evaluate(() => window.__collectiveProbe?.destination.release());
          await rawTransitionCleanup(page);
        }
      });
      try {
        const configured = await collectiveExportFixture(t, 2, evidence); page = configured.page;
        assert.equal(new URL(page.url()).pathname, '/');
        const downloads = []; page.on('download', value => downloads.push(value));
        await chooseExposedOutputSetting(page, evidence, 'background', 'connected'); await settled(page);
        const baseline = await rawTransitionSnapshot(page), owner = rawTransitionTab(baseline, 'task-0');
        const candidate = owner.generated[0], raw = candidate.data;
        assert.equal(candidate.id, 'candidate-0'); assert.equal(owner.selectedCandidateId, candidate.id);
        assert.equal(owner.generated.length, 2); assert.notEqual(owner.generated[0].data, owner.generated[1].data);
        const peer = rawTransitionTab(baseline, 'task-1'); assert.notEqual(peer.generated[0].data, raw);
        const historical = await rawTransitionPreview(page, raw, candidate.id);
        assert.equal(historical.pixels.outside[3], 0); assert.equal(historical.pixels.inside[3], 255);
        write(evidence, 'baseline.json', { baseline, historical });
        const reference = await rawTransitionPixels(page, { raw, data: raw });
        await collectiveChooseDestination(page, mode, evidence);
        // The real chooser has returned its kind to an observation gate, but
        // exportCollection has not received that return yet. Exercise ordinary
        // capture/persistence and visible owner re-selection at this boundary.
        const destinationSnapshot = await rawTransitionSnapshot(page);
        const destinationCheckpoint = await page.evaluate(() => window.__task2Manager.checkpointForClose());
        assert.equal(destinationCheckpoint.recovered, true);
        await rawTransitionSelect(page, 'task-1', 'candidate-1');
        await rawTransitionSelect(page, 'task-0', candidate.id);
        assert.equal((await collectiveProbeSnapshot(page)).exports.length, 0);
        const afterDestinationSelection = await rawTransitionSnapshot(page);
        assert.deepEqual(afterDestinationSelection.workspaces.map(workspace => workspace.tabs.map(tab => tab.id)), [['task-0'], ['task-1']],
          'Real task selection transfers task-1 to its own controller before records are requested');
        for (const id of ['task-0', 'task-1']) for (const field of ['attachments', 'generated']) {
          const before = rawTransitionTab(baseline, id)[field], after = rawTransitionTab(afterDestinationSelection, id)[field];
          assert.deepEqual(after.map(item => item.id), before.map(item => item.id));
          // Import materializes explicit nullable/default fields on the peer.
          // Every field that already existed, including full RAW, must survive.
          for (const [index, item] of before.entries()) for (const key of Object.keys(item)) {
            assert.equal(Object.hasOwn(after[index], key), true);
            assert.deepEqual(after[index][key], item[key], 'Real workspace transfer preserves ' + id + ':' + field + ':' + key);
          }
        }
        write(evidence, 'destination-same-owner-capture.json', { destinationSnapshot, destinationCheckpoint, after: afterDestinationSelection });
        // Arm only now: earlier settings/preview work has really completed.
        const processingStart = await page.evaluate(() => (window.__rawTransitionProcessing || []).length);
        await rawTransitionArmDecode(page, raw, candidate.id);
        const pendingDownload = page.waitForEvent('download', { timeout: 60000 }); pendingDownload.catch(() => {});
        await page.evaluate(() => window.__collectiveProbe.destination.release());
        const native = await rawTransitionPromise(page, '__rawTransitionDecodeGate.enteredPromise', 'collective record native image decode');
        assert.equal(native.nativeImage, true); assert.equal(native.nativeDecodeCompleted, true);
        assert.equal(native.src, raw); assert.equal(native.currentSrc, raw); assert.equal(native.candidateId, candidate.id);
        assert.deepEqual([native.width, native.height], [512, 384]);
        const pending = await collectiveProbeSnapshot(page);
        write(evidence, 'record-await.json', { native, pending });
        assert.deepEqual(pending.events, ['destination-enter', 'destination-selected', 'destination-return', 'records-enter', 'records-enter', 'records-return']);
        collectiveAssertManagerCalls(pending, mode);
        assert.deepEqual(pending.managerEvents.map(event => [event.phase, event.callIndex, event.taskId]),
          [['enter', 0, 'task-0'], ['enter', 1, 'task-1'], ['return', 1, 'task-1']]);
        assert.equal(pending.writes.length, 0); assert.equal(downloads.length, 0);
        let dispatch = null, cancelled = null;
        if (scenario === 'cancel-before-late-export') {
          await rawTransitionObserveScopedDispatch(page);
          const apply = await collectiveVisibleControl(page, `${panel} [data-ai-comments-apply]`, evidence, 'actual-scope-apply');
          await apply.click(); assert.equal(await page.getByRole('dialog', { name: '수정 허용 범위 확인' }).count(), 0);
          dispatch = await rawTransitionPromise(page, '__rawTransitionScopedDispatch.done', 'actual scoped request before late collective export');
          assert.equal(await page.locator(panel).getAttribute('data-ai-busy'), 'true');
          const history = rawTransitionTab(dispatch.snapshot, 'task-0').generated[0].scopedEditHistory;
          assert.equal(history.length, 1); assert.equal(history[0].sourceCandidateId, candidate.id);
          assert.equal(history[0].sourceSha256, reference.encodedSHA256);
          assert.equal(history[0].maximumAttempts, 1); assert.equal(history[0].attempts.length, 1);
          assert.deepEqual([candidate.comments[0].x, candidate.comments[0].y, candidate.comments[0].w, candidate.comments[0].h], [25, 25, 25, 25]);
          assert.equal(dispatch.payload.purpose, 'image'); assert.equal(dispatch.payload.model, 'gpt-6.1-sol');
          assert.equal(dispatch.payload.effort, 'medium'); assert.ok(dispatch.result.turnId);
          cancelled = await rawTransitionCancel(page); await rawTransitionProtectedControls(page);
          rawTransitionPreserved(owner, rawTransitionTab(cancelled, 'task-0'), { history: true });
          write(evidence, 'actual-scope-cancel.json', { dispatch, cancelled });
        }
        // Normal captures replace serialized arrays. This is still the exact
        // same logical owner; exported task becomes inactive before completion.
        const captured = await rawTransitionSnapshot(page);
        const checkpoint = await page.evaluate(() => window.__task2Manager.checkpointForClose());
        assert.equal(checkpoint.recovered, true);
        await rawTransitionSelect(page, 'task-1', 'candidate-1');
        await rawTransitionSelect(page, 'task-0', candidate.id);
        await rawTransitionSelect(page, 'task-1', 'candidate-1');
        const beforeRelease = await rawTransitionSnapshot(page);
        const stillPending = await collectiveProbeSnapshot(page);
        collectiveAssertManagerCalls(stillPending, mode);
        assert.deepEqual(stillPending.exports[1], pending.exports[1], 'The already resolved peer is untouched by task-0 lifecycle changes');
        assert.equal(stillPending.writes.length, 0); assert.equal(downloads.length, 0);
        assert.equal(stillPending.selected, 'candidate-1');
        write(evidence, 'same-owner-persistence-inactive.json', { captured, checkpoint, beforeRelease, stillPending });
        await page.evaluate(() => window.__rawTransitionDecodeGate.release());
        const transformed = await rawTransitionPromise(page, '__rawTransitionDecodeGate.completedPromise', 'real late collective transform');
        assert.notEqual(transformed, raw, 'The actual transform still produced obsolete transparent PNG bytes');
        const transformedPixels = await rawTransitionPixels(page, { raw, data: transformed });
        assert.equal(transformedPixels.outside[3], 0); assert.ok(transformedPixels.alphaMismatches > 0);
        const recordsDone = await rawTransitionPromise(page, '__collectiveProbe.exports.0.done', 'actual public exportResults completion');
        assert.equal(recordsDone.error, null);
        assert.equal((await rawTransitionPromise(page, '__collectiveProbe.exports.1.done', 'independent peer records completion')).error, null);
        const downloaded = await pendingDownload;
        assert.equal((await rawTransitionPromise(page, '__collectiveProbe.writes.0.done', 'actual ZIP writer completion')).error, null);
        const probe = await collectiveProbeSnapshot(page);
        const calls = collectiveAssertManagerCalls(probe, mode, { ownerSettled: true });
        assert.equal(calls[0].visibleAtEntry, true); assert.equal(calls[0].visibleAtReturn, false);
        assert.equal(probe.selected, 'candidate-1', 'Visible workspace changed while task-0 controller retained its own task');
        assert.deepEqual(calls[1], pending.exports[1]);
        const records = calls.flatMap(call => call.records); // Same order as real Promise.all(entries.map(...)).flat().
        const expectedIds = mode === 'selected' ? ['candidate-0', 'candidate-1'] : ['candidate-0', 'candidate-0-alt', 'candidate-1', 'candidate-1-alt'];
        assert.deepEqual(records.map(record => record.candidateId), expectedIds);
        for (const [index, call] of calls.entries()) {
          assert.equal(call.records.length, mode === 'selected' ? 1 : 2);
          assert.ok(call.records.every(record => record.taskId === 'task-' + index));
        }
        const names = collectiveExpectedNames(mode);
        const exportProcessing = probe.processing.slice(processingStart);
        assert.equal(exportProcessing.length, mode === 'selected' ? 1 : 2, 'Only historical task-0 records enter the real transform');
        assert.ok(exportProcessing.every(value => value.completed && !value.error && value.policy === 'connected'));
        const expected = records.map((record, index) => {
          const tab = rawTransitionTab(afterDestinationSelection, record.taskId), item = tab.generated.find(value => value.id === record.candidateId);
          assert.ok(item); assert.deepEqual(record.item, item, 'Ephemeral export keeps the complete pre-await captured candidate');
          assert.deepEqual(record.outputOptions, tab.outputOptions); assert.equal(record.hasLiveReader, true);
          assert.equal('5E-AI-결과/' + record.sourceName + '.png', names[index]);
          const rawRequired = record.taskId === 'task-1' || (scenario === 'cancel-before-late-export' && record.candidateId === candidate.id);
          const matching = exportProcessing.filter(value => value.src === item.data);
          if (!rawRequired) assert.equal(matching.length, 1);
          const data = rawRequired ? item.data : matching[0].result;
          assert.equal(record.dataUrl, data, 'Late resolution uses this exact owner and its current RAW contract');
          return { name: names[index], taskId: record.taskId, candidateId: record.candidateId, raw: item.data, rawRequired, data };
        });
        const zip = await collectiveVerifyZip(page, downloaded, expected, evidence);
        assert.equal(downloads.length, 1); assert.equal(probe.writes.length, 1); assert.equal(probe.writes[0].kind, 'browser-zip');
        assert.deepEqual(probe.writes[0].result, { status: 'download-requested', count: names.length, files: names.map(name => name.slice('5E-AI-결과/'.length)) });
        assert.equal(probe.sends.length, scenario === 'same-owner-capture' ? 0 : 1);
        assert.equal(probe.generationCount, scenario === 'same-owner-capture' ? 0 : 1);
        assert.deepEqual(probe.events, ['destination-enter', 'destination-selected', 'destination-return', 'records-enter',
          'records-enter', 'records-return', 'records-return', 'writer-enter', 'writer-return']);
        assert.deepEqual(probe.managerEvents.map(event => [event.phase, event.callIndex, event.taskId]),
          [['enter', 0, 'task-0'], ['enter', 1, 'task-1'], ['return', 1, 'task-1'], ['return', 0, 'task-0']]);
        const after = await rawTransitionSnapshot(page);
        for (const id of ['task-0', 'task-1']) {
          const before = rawTransitionTab(beforeRelease, id), current = rawTransitionTab(after, id);
          assert.deepEqual(current.generated, before.generated, 'Export never mutates any original/provenance/history payload');
          assert.deepEqual(current.attachments, before.attachments); assert.deepEqual(current.outputOptions, before.outputOptions);
          assert.equal(current.selectedCandidateId, before.selectedCandidateId);
        }
        if (scenario === 'cancel-before-late-export') {
          const beforeLate = await rawTransitionSnapshot(page);
          await page.evaluate(() => { window.__task2.emit(0, 'image'); window.__task2.emit(0, 'done'); });
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
          assert.deepEqual(await rawTransitionSnapshot(page), beforeLate, 'Late cancelled local-provider events cannot replace exported RAW or its owner');
        }
        assert.deepEqual(configured.errors, []);
        const foreignAttempts = JSON.parse(fs.readFileSync(path.join(evidence, 'foreign-network.json'), 'utf8'));
        assert.ok(foreignAttempts.every(value => value.action === 'blocked-before-network'), 'Every foreign request, including external fonts, is blocked');
        write(evidence, 'actual-collective-complete.json', { scenario, mode, engine, native, transformedPixels, probe, after, zip,
          qualification: 'Actual public controls/manager and browser ZIP under deterministic local provider and explicit ZIP capability fixture; no paid-provider or real-directory claim' });
        await page.screenshot({ path: path.join(evidence, 'actual-inactive-owner-complete.png') });
      } finally { t.after(restore); }
    });
  }
}

// COLLECTIVE-EXPORT-BUSY-STATUS-APPEND-06 — private, unexecuted proposal.
assert.equal(rawTransitionCrypto.createHash('sha256').update(fs.readFileSync(__filename).subarray(0, 129341)).digest('hex'),
  '88b4936969ab8637f6ee8ffa5d30f9940395c3e9bf4a7897665a410825872e1c', 'All 40 existing cases remain byte-for-byte unchanged');

function observeCollectiveBusyUiCompletion(source) {
  const opening = "  collectiveExportButton.addEventListener('click', async () => {";
  const after = "  panel.querySelector('[data-ai-insert-selected]')?.addEventListener('click', () => {";
  assert.equal(source.split(opening).length - 1, 1); assert.equal(source.split(after).length - 1, 1);
  const begin = source.indexOf(opening), end = source.indexOf(after, begin), handler = source.slice(begin, end);
  assert.ok(handler.endsWith('  });\n'), 'Exact current physical collective click handler boundary');
  // Retain the entire CURRENT parent handler, including canReportExport and
  // disposal-only finally. Only observe its true completion after catch/finally.
  const original = handler.replace(opening, '  const originalCollectiveBusyClick = async () => {').slice(0, -'  });\n'.length) + '  };\n';
  const observation = `
  const readCollectiveBusyState = () => {
    const request = requestStates.snapshot(activeTaskTabId);
    const { elapsedMs, ...stableRequest } = request || {};
    return { managerId: clientScope || 'main', taskId: activeTaskTabId, candidateId: selectedCandidateId, owner: batchOwner(activeTaskTabId),
      requestEpoch: currentRequestEpoch, visibilityEpoch: localVisibilityEpoch,
      token: requestToken ? structuredClone(requestToken) : null, request: request ? stableRequest : null,
      requestLive: requestStates.live(requestToken), busy, preflight: Boolean(preflightRun), disposed,
      exportInProgress, workState: taskTabs.get(activeTaskTabId)?.workState,
      phase: panel.dataset.aiRequestPhase, generatingHidden: generating.hidden,
      statusText: status.textContent, statusKind: status.dataset.kind,
      scopeTransportPending: Boolean(scopedTransport) };
  };
  (window.__collectiveBusyStates ||= new Map()).set(panel, readCollectiveBusyState);
  window.__collectiveBusyState = () => window.__collectiveBusyStates.get(document.querySelector('#ai-image-panel'))();
  collectiveExportButton.addEventListener('click', async function(...args) {
    const call = { entry: readCollectiveBusyState(), settled: false };
    call.done = new Promise(resolve => { call.resolve = resolve; });
    (window.__collectiveBusyClicks ||= []).push(call);
    try { return await originalCollectiveBusyClick.apply(this, args); }
    finally { call.exit = readCollectiveBusyState(); call.settled = true; call.resolve(call.exit); }
  });
`;
  return source.slice(0, begin) + original + observation + source.slice(end);
}

// Reuse PRIVATE07's corrected source/served-hash, provider, network, destination,
// record and writer observers. Add a transform solely at its served-body seam;
// no 40-case prefix edit and no duplicate application export implementation.
const collectiveBusyServeSeam = 'body = transform(source);';
const collectiveBusyInstallerSource = installCollectiveExportObservation.toString();
assert.equal(collectiveBusyInstallerSource.split(collectiveBusyServeSeam).length - 1, 1);
const installCollectiveBusyObservation = new Function('root', 'fs', 'path', 'assert', 'rawTransitionCrypto', 'write',
  'installRawTransitionDecodeRoute', 'observeCollectiveBusyUiCompletion', 'return (' + collectiveBusyInstallerSource.replace(
    collectiveBusyServeSeam, "body = file === 'ai-panel.js' ? observeCollectiveBusyUiCompletion(transform(source)) : transform(source);") + ');')(
    root, fs, path, assert, rawTransitionCrypto, write, installRawTransitionDecodeRoute, observeCollectiveBusyUiCompletion);
const collectiveBusyFixtureSeam = 'await installCollectiveExportObservation(page, runtime, origin, evidence);';
assert.equal(collectiveExportHarness.split(collectiveBusyFixtureSeam).length - 1, 1);
const collectiveBusyFixture = new Function('require', 'root', 'fs', 'path', 'assert', 'chromium', 'webkit',
  'installCollectiveBusyObservation', collectiveExportHarness.replace(collectiveBusyFixtureSeam,
    'await installCollectiveBusyObservation(page, runtime, origin, evidence);') + '; return requestBrowserFixture;')(
    require, root, fs, path, assert, chromium, webkit, installCollectiveBusyObservation);

async function collectiveBusyState(page) {
  const state = await page.evaluate(async () => ({ live: window.__collectiveBusyState(),
    snapshot: await window.__task2Manager.sharingSnapshot(),
    clicks: (window.__collectiveBusyClicks || []).map(({ done, resolve, ...rest }) => rest) }));
  return { ...state, probe: await collectiveProbeSnapshot(page),
    generatingVisible: await page.locator(`${panel} [data-ai-generating]`).isVisible(),
    interruptVisible: await page.locator(`${panel} [data-ai-interrupt]`).isVisible(),
    interruptEnabled: await page.locator(`${panel} [data-ai-interrupt]`).isEnabled() };
}
function assertCollectiveScopeStillBusy(state, dispatch) {
  const live = state.live;
  assert.equal(live.taskId, 'task-0'); assert.equal(live.candidateId, 'candidate-0');
  assert.deepEqual(live.owner, { scope: { sessionId: '5e', workspaceId: 'main' }, taskId: 'task-0' });
  assert.equal(live.busy, true); assert.equal(live.workState, 'busy'); assert.equal(live.phase, 'generating');
  assert.equal(rawTransitionTab(state.snapshot, 'task-0').workState, 'busy');
  assert.equal(live.requestLive, true); assert.equal(live.scopeTransportPending, true);
  assert.equal(live.request.phase, 'generating'); assert.equal(live.request.endedAt, null);
  assert.equal(live.token.taskId, 'task-0'); assert.equal(live.token.revisionId, 'candidate-0');
  assert.deepEqual(live.request.token, live.token);
  assert.equal(live.request.turnId, dispatch.result.turnId);
  assert.equal(live.request.threadId, dispatch.result.threadId);
  assert.equal(live.generatingHidden, false); assert.equal(state.generatingVisible, true);
  assert.equal(state.interruptVisible, true); assert.equal(state.interruptEnabled, true);
  assert.notEqual(live.statusKind, 'error'); assert.doesNotMatch(live.statusText, /여러 작업 저장 실패/);
  assert.equal(state.probe.sends.length, 1); assert.equal(state.probe.generationCount, 1);
  assert.equal(state.probe.sends[0].turnId, dispatch.result.turnId);
  assert.equal(state.probe.sends[0].threadId, dispatch.result.threadId);
  const history = rawTransitionTab(state.snapshot, 'task-0').generated[0].scopedEditHistory;
  assert.equal(history.length, 1); assert.equal(history[0].status, 'generating');
  assert.equal(history[0].attempts.length, 1);
}

async function collectiveBusyIdleDestination(page, evidence) {
  // The first real export has ended. Renew only the observation delivery gate,
  // then use the same physical range select/button and actual confirm again.
  await page.evaluate(() => {
    const gate = {};
    gate.ready = new Promise(resolve => { gate.readyResolve = resolve; });
    gate.releasePromise = new Promise(resolve => { gate.release = resolve; });
    window.__collectiveProbe.destination = gate;
  });
  const menu = await collectiveVisibleControl(page, `${panel} [data-ai-task-export-mode]`, evidence, 'idle-range-menu');
  await menu.selectOption('selected'); assert.equal(await menu.inputValue(), 'selected');
  const button = await collectiveVisibleControl(page, `${panel} [data-ai-task-export]`, evidence, 'idle-collective-button');
  const pendingDialog = page.waitForEvent('dialog'); pendingDialog.catch(() => {});
  const clicked = button.click(); clicked.catch(() => {});
  const dialog = await pendingDialog;
  write(evidence, 'idle-destination-confirm.json', { type: dialog.type(), message: dialog.message() });
  assert.equal(dialog.type(), 'confirm'); assert.match(dialog.message(), /ZIP 다운로드/);
  await dialog.accept(); await clicked;
  assert.deepEqual(await rawTransitionPromise(page, '__collectiveProbe.destination.ready', 'idle real ZIP destination'), { kind: 'browser-zip' });
  const held = await collectiveProbeSnapshot(page); write(evidence, 'idle-destination-await.json', held);
  assert.equal(held.exports.length, 2); assert.equal(held.writes.length, 0);
  await page.evaluate(() => window.__collectiveProbe.destination.release());
}

for (const engine of ['chromium', 'webkit']) {
  test(`${engine} root: public collective ZIP selected rejects while scope stays busy, then cancel permits idle RAW`,
    { timeout: 150000, concurrency: false }, async t => {
      const evidence = path.join(evidenceRoot, 'collective-export-status', engine, 'root', 'selected', 'release-while-scope-busy');
      fs.mkdirSync(evidence, { recursive: true });
      const restore = rawTransitionConfigure(engine, '/'); let page;
      t.after(async () => {
        if (page && !page.isClosed()) {
          await page.evaluate(() => window.__collectiveProbe?.destination.release());
          await rawTransitionCleanup(page);
        }
      });
      try {
        const configured = await collectiveBusyFixture(t, 2, evidence); page = configured.page;
        assert.equal(new URL(page.url()).pathname, '/');
        const downloads = []; page.on('download', download => downloads.push(download));
        // Exercise real workspace transfer before the export: each controller
        // owns exactly one task, as in the corrected PRIVATE07 positive cases.
        await rawTransitionSelect(page, 'task-1', 'candidate-1');
        await rawTransitionSelect(page, 'task-0', 'candidate-0');
        await chooseExposedOutputSetting(page, evidence, 'background', 'connected'); await settled(page);
        const baseline = await rawTransitionSnapshot(page), owner = rawTransitionTab(baseline, 'task-0');
        assert.deepEqual(baseline.workspaces.map(workspace => workspace.tabs.map(tab => tab.id)), [['task-0'], ['task-1']]);
        const peer = rawTransitionTab(baseline, 'task-1'), candidate = owner.generated[0], raw = candidate.data;
        assert.equal(candidate.id, 'candidate-0'); assert.equal(owner.selectedCandidateId, candidate.id);
        assert.notEqual(peer.generated[0].data, raw, 'Owners have genuinely different fixture PNG bytes');
        const reference = await rawTransitionPixels(page, { raw, data: raw });
        const historical = await rawTransitionPreview(page, raw, candidate.id);
        assert.equal(historical.pixels.outside[3], 0); assert.notEqual(historical.src, raw);
        write(evidence, 'baseline.json', { baseline, reference, historical });
        await collectiveChooseDestination(page, 'selected', evidence);
        const processingStart = await page.evaluate(() => (window.__rawTransitionProcessing || []).length);
        await rawTransitionArmDecode(page, raw, candidate.id);
        await page.evaluate(() => window.__collectiveProbe.destination.release());
        const native = await rawTransitionPromise(page, '__rawTransitionDecodeGate.enteredPromise', 'collective actual native decode held');
        assert.equal(native.nativeImage, true); assert.equal(native.nativeDecodeCompleted, true);
        assert.equal(native.src, raw); assert.equal(native.currentSrc, raw); assert.equal(native.candidateId, candidate.id);
        assert.deepEqual([native.width, native.height], [512, 384]);
        const pending = await collectiveProbeSnapshot(page); write(evidence, 'record-await.json', { native, pending });
        collectiveAssertManagerCalls(pending, 'selected');
        assert.deepEqual(pending.managerEvents.map(event => [event.phase, event.callIndex, event.taskId]),
          [['enter', 0, 'task-0'], ['enter', 1, 'task-1'], ['return', 1, 'task-1']]);
        assert.equal(pending.writes.length, 0); assert.equal(downloads.length, 0);

        await rawTransitionObserveScopedDispatch(page);
        const apply = await collectiveVisibleControl(page, `${panel} [data-ai-comments-apply]`, evidence, 'actual-scope-apply');
        await apply.click(); assert.equal(await page.getByRole('dialog', { name: '수정 허용 범위 확인' }).count(), 0);
        const dispatch = await rawTransitionPromise(page, '__rawTransitionScopedDispatch.done', 'actual correlated scope request');
        assert.equal(dispatch.payload.purpose, 'image'); assert.equal(dispatch.payload.model, 'gpt-6.1-sol');
        assert.equal(dispatch.payload.effort, 'medium'); assert.ok(dispatch.result.turnId);
        const busyBefore = await collectiveBusyState(page);
        write(evidence, 'busy-before-release.json', { dispatch, busyBefore });
        assertCollectiveScopeStillBusy(busyBefore, dispatch);
        assert.equal(busyBefore.clicks.length, 1); assert.equal(busyBefore.clicks[0].settled, false);
        assert.ok(busyBefore.live.requestEpoch > busyBefore.clicks[0].entry.requestEpoch, 'Scope starts a new epoch after export');
        assert.equal(rawTransitionTab(busyBefore.snapshot, 'task-0').generated[0].scopedEditHistory[0].sourceSha256, reference.encodedSHA256);
        await page.screenshot({ path: path.join(evidence, 'busy-before-release.png') });

        await page.evaluate(() => window.__rawTransitionDecodeGate.release());
        const transformed = await rawTransitionPromise(page, '__rawTransitionDecodeGate.completedPromise', 'actual late transparent transform');
        assert.notEqual(transformed, raw);
        const obsoletePixels = await rawTransitionPixels(page, { raw, data: transformed });
        assert.equal(obsoletePixels.outside[3], 0); assert.ok(obsoletePixels.alphaMismatches > 0);
        const rejected = await rawTransitionPromise(page, '__collectiveProbe.exports.0.done', 'busy-owner record rejection');
        assert.match(rejected.error, /실행 중/);
        const uiExit = await rawTransitionPromise(page, '__collectiveBusyClicks.0.done', 'original collective catch/finally completion');
        const busyAfter = await collectiveBusyState(page);
        write(evidence, 'busy-after-export-handler.json', { rejected, uiExit, busyBefore, busyAfter, obsoletePixels, downloadCount: downloads.length });
        await page.screenshot({ path: path.join(evidence, 'busy-after-export-handler.png') });
        assertCollectiveScopeStillBusy(busyAfter, dispatch);
        collectiveAssertManagerCalls(busyAfter.probe, 'selected', { ownerSettled: true });
        assert.deepEqual(busyAfter.probe.exports[1], pending.exports[1], 'Independent peer succeeded and stayed exact despite owner rejection');
        assert.deepEqual(busyAfter.probe.managerEvents.map(event => [event.phase, event.callIndex, event.taskId]),
          [['enter', 0, 'task-0'], ['enter', 1, 'task-1'], ['return', 1, 'task-1'], ['return', 0, 'task-0']]);
        assert.equal(busyAfter.probe.writes.length, 0); assert.equal(downloads.length, 0);
        assert.equal(busyAfter.live.exportInProgress, false); assert.equal(busyAfter.clicks[0].settled, true);
        for (const key of ['managerId', 'taskId', 'candidateId', 'owner', 'requestEpoch', 'visibilityEpoch', 'token', 'request', 'requestLive',
          'busy', 'workState', 'phase', 'generatingHidden', 'scopeTransportPending', 'statusText', 'statusKind']) {
          assert.deepEqual(busyAfter.live[key], busyBefore.live[key], 'Stale export handler cannot mutate current scope ' + key);
        }
        assert.deepEqual(busyAfter.probe.sends, busyBefore.probe.sends, 'No resend or synthetic request completion');
        assert.equal(busyAfter.snapshot.activeWorkspace, busyBefore.snapshot.activeWorkspace);
        for (const id of ['task-0', 'task-1']) {
          const before = rawTransitionTab(busyBefore.snapshot, id), after = rawTransitionTab(busyAfter.snapshot, id);
          assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
          // Only the production elapsed-time serialization may advance while
          // the correlated provider remains pending; no payload field is waived.
          for (const key of Object.keys(before).filter(key => key !== 'generationTiming')) {
            assert.deepEqual(after[key], before[key], 'Stale export preserves current task field ' + id + ':' + key);
          }
          if (before.generationTiming && after.generationTiming) {
            const { lastElapsedMs: beforeElapsed, ...beforeTiming } = before.generationTiming;
            const { lastElapsedMs: afterElapsed, ...afterTiming } = after.generationTiming;
            assert.deepEqual(afterTiming, beforeTiming); assert.ok(afterElapsed >= beforeElapsed);
          } else assert.deepEqual(after.generationTiming, before.generationTiming);
        }
        assert.equal(await page.locator(`${panel} [data-ai-task-export]`).isDisabled(), true);

        // No mock image/done/error events are emitted in this scenario. The
        // existing correlated local provider remains deferred until real cancel.
        const cancelled = await rawTransitionCancel(page); await rawTransitionProtectedControls(page);
        const idle = await collectiveBusyState(page);
        write(evidence, 'actual-cancel-idle.json', { cancelled, idle });
        assert.equal(idle.live.taskId, 'task-0'); assert.equal(idle.live.candidateId, candidate.id);
        assert.equal(idle.live.busy, false); assert.equal(idle.live.workState, 'idle');
        assert.equal(idle.live.phase, 'cancelled'); assert.equal(idle.live.requestLive, false);
        assert.equal(idle.live.scopeTransportPending, false); assert.equal(idle.live.generatingHidden, true);
        assert.equal(idle.probe.sends.length, 1); assert.equal(idle.probe.generationCount, 1);
        rawTransitionPreserved(owner, rawTransitionTab(cancelled, 'task-0'), { history: true });
        assert.deepEqual(rawTransitionTab(cancelled, 'task-1'), peer);
        await rawTransitionAssertRaw(page, raw, candidate.id, reference, evidence, 'idle-owner-raw');
        const idleDir = path.join(evidence, 'idle-export'); fs.mkdirSync(idleDir, { recursive: true });
        const pendingDownload = page.waitForEvent('download'); pendingDownload.catch(() => {});
        const beforeIdle = await rawTransitionSnapshot(page);
        await collectiveBusyIdleDestination(page, idleDir);
        assert.equal((await rawTransitionPromise(page, '__collectiveProbe.exports.2.done', 'idle owner RAW records')).error, null);
        assert.equal((await rawTransitionPromise(page, '__collectiveProbe.exports.3.done', 'idle independent peer RAW records')).error, null);
        const download = await pendingDownload;
        assert.equal((await rawTransitionPromise(page, '__collectiveProbe.writes.0.done', 'idle actual ZIP writer')).error, null);
        await rawTransitionPromise(page, '__collectiveBusyClicks.1.done', 'idle collective handler completion');
        const completed = await collectiveBusyState(page);
        const callsByManager = collectiveAssertManagerCalls(completed.probe, 'selected', { ownerSettled: true, offset: 2 });
        assert.deepEqual(completed.probe.exports.slice(0, 2), busyAfter.probe.exports, 'Both original call receipts remain exact');
        assert.equal(callsByManager[0].managerId, pending.exports[0].managerId);
        assert.equal(callsByManager[1].managerId, pending.exports[1].managerId);
        assert.equal(callsByManager[0].visibleAtReturn, true); assert.equal(callsByManager[1].visibleAtReturn, false);
        const records = callsByManager.flatMap(call => call.records);
        assert.deepEqual(records.map(record => [record.taskId, record.candidateId]), [['task-0', 'candidate-0'], ['task-1', 'candidate-1']]);
        const names = collectiveExpectedNames('selected');
        const expected = records.map((record, index) => {
          const tab = rawTransitionTab(beforeIdle, record.taskId), item = tab.generated.find(value => value.id === record.candidateId);
          assert.ok(item); assert.deepEqual(record.item, item); assert.deepEqual(record.outputOptions, tab.outputOptions);
          assert.equal(record.hasLiveReader, true); assert.equal(record.dataUrl, item.data);
          assert.equal('5E-AI-결과/' + record.sourceName + '.png', names[index]);
          return { name: names[index], taskId: record.taskId, candidateId: record.candidateId, data: item.data, raw: item.data, rawRequired: true };
        });
        const zip = await collectiveVerifyZip(page, download, expected, idleDir);
        assert.equal(downloads.length, 1); assert.equal(completed.probe.writes.length, 1);
        assert.deepEqual(completed.probe.writes[0].result, { status: 'download-requested', count: 2, files: names.map(name => name.slice('5E-AI-결과/'.length)) });
        assert.equal(completed.live.workState, 'idle'); assert.equal(completed.live.busy, false);
        assert.equal(completed.live.phase, 'cancelled'); assert.equal(completed.live.requestLive, false);
        assert.equal(completed.live.statusKind, 'warn'); assert.match(completed.live.statusText, /결과 2개의 ZIP 다운로드/);
        assert.equal(completed.probe.sends.length, 1); assert.equal(completed.probe.generationCount, 1);
        assert.deepEqual(completed.probe.sends, busyAfter.probe.sends);
        const calls = completed.probe.processing.slice(processingStart);
        assert.equal(calls.length, 1, 'Only the obsolete first export transformed; idle bound RAW bypasses processing');
        assert.equal(calls[0].completed, true); assert.equal(calls[0].error, undefined); assert.equal(calls[0].result, transformed);
        for (const id of ['task-0', 'task-1']) {
          const before = rawTransitionTab(beforeIdle, id), after = rawTransitionTab(completed.snapshot, id);
          assert.deepEqual(after.generated, before.generated); assert.deepEqual(after.attachments, before.attachments);
          assert.deepEqual(after.outputOptions, before.outputOptions); assert.equal(after.selectedCandidateId, before.selectedCandidateId);
        }
        assert.deepEqual(configured.errors, []);
        const foreign = JSON.parse(fs.readFileSync(path.join(evidence, 'foreign-network.json'), 'utf8'));
        assert.ok(foreign.every(value => value.action === 'blocked-before-network'));
        write(evidence, 'actual-busy-status-complete.json', { engine, native, rejected, uiExit, dispatch, cancelled, completed, zip,
          qualification: 'Real public UI, deferred existing correlated provider fixture, actual cancellation and browser ZIP. No synthetic completion event, paid-provider or native-directory claim.' });
        await page.screenshot({ path: path.join(evidence, 'idle-export-complete.png') });
      } finally { t.after(restore); }
    });
}
