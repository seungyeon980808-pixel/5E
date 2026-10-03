const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const evidenceRoot = process.env.OUTPUT_EVIDENCE || path.join(root, '.omo/evidence/ai-followup-0928/output/green');
const original = fs.readFileSync(path.join(root, 'tests/test-ai-workspace-lifecycle-browser.cjs'), 'utf8');
const start = original.indexOf('function seedRequestWorkspaces(');
const end = original.indexOf('\nfor (const count of [1, 10, 30])', start);
// Reuse the production-page harness; only replace its deterministic drawing with three disjoint objects.
const harness = original.slice(start, end).replace('draw.strokeRect(40, 50, 420, 280);', 'draw.strokeRect(40, 50, 100, 180); draw.strokeRect(200, 50, 100, 180); draw.strokeRect(360, 50, 100, 180);');
const controlledHarness = harness.replace("separationMode: 'off',", "separationMode: initialGeneration && index === 0 ? 'auto' : 'off', generationMode: 'single',").replace('  await page.goto(', `  await page.route('**/preview/js/image-background.js*', route => {
    const source = fs.readFileSync(path.join(root, 'preview/js/image-background.js'), 'utf8');
    return route.fulfill({ contentType: 'text/javascript', body: source.replace('export async function transparentizeGeneratedImage(', 'async function realTransparentizeGeneratedImage(') + '\\nexport async function transparentizeGeneratedImage(src, options) { const gate = window.__outputGate; if (gate && gate.policy === options.backgroundPolicy) { gate.entered = true; await gate.promise; } return realTransparentizeGeneratedImage(src, options); }' });
  });
  await page.goto(`);
const fixture = new Function('require', 'root', 'fs', 'path', 'assert', 'chromium', 'webkit', controlledHarness + '; return requestBrowserFixture;')(require, root, fs, path, assert, chromium, webkit);
const panel = '#ai-image-panel';
const background = `${panel} select[data-ai-background-policy]`;
const separation = `${panel} select[data-ai-separation-mode]`;
const write = (dir, name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2));
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
    await hold('connected'); await page.selectOption(background, 'connected');
    await page.waitForFunction(() => window.__outputGate?.entered);
    const pending = { text: await status.textContent(), visible: await status.isVisible() };
    write(evidence, 'pending.json', pending); await page.screenshot({ path: path.join(evidence, 'pending.png') });
    assert.match(pending.text, /처리하는 중/); assert.equal(pending.visible, true);
    await page.click(`${panel} [data-tab-id="task-1"] .ai-task-tab-select`);
    await release(true); await settled(page);
    const other = await inspect(page); assert.equal(other.id, 'candidate-1'); assert.equal(other.outside[3], 255); assert.doesNotMatch(other.status, /실패/);
    await page.click(`${panel} [data-tab-id="task-0"] .ai-task-tab-select`);
    await page.selectOption(background, 'connected'); await settled(page);
    const retry = await inspect(page); assert.equal(retry.outside[3], 0); assert.equal(retry.srcIsRaw, false);
    await hold('all-near-white'); await page.selectOption(background, 'all-near-white');
    await page.waitForFunction(() => window.__outputGate?.entered); await release(true);
    await page.waitForFunction(() => document.querySelector('#ai-image-panel [data-ai-output-processing-status]')?.textContent.includes('결과 처리 실패'));
    const failed = await inspect(page); write(evidence, 'failure.json', { ...failed, visible: await status.isVisible() });
    assert.equal(await status.isVisible(), true); assert.equal(failed.srcIsRaw, false); assert.equal(failed.outside[3], 0); assert.equal(failed.inside[3], 255);
    await page.screenshot({ path: path.join(evidence, 'failure.png') });
    await page.selectOption(background, 'preserve'); await settled(page);
    const reset = await inspect(page); assert.equal(reset.srcIsRaw, true); assert.equal(reset.sends, 0); assert.deepEqual(errors, []);
    write(evidence, 'result.json', { pending, other, retry, failed, reset, errors });
  });
  test(`${engine}: dropdown applies decoded alpha to normal and swipe output without AI or original mutation`, { timeout: 90000 }, async t => {
    const evidence = path.join(evidenceRoot, engine, 'alpha'); fs.mkdirSync(evidence, { recursive: true });
    process.env.TASK2_ENGINE = engine;
    const { page, errors } = await fixture(t, 2, evidence);
    await page.selectOption(separation, 'off');
    await page.selectOption(background, 'connected'); await settled(page);
    const normal = await inspect(page); write(evidence, 'normal.json', normal);
    await page.screenshot({ path: path.join(evidence, 'normal.png') });
    assert.equal(normal.outside[3], 0, JSON.stringify(normal));
    assert.equal(normal.inside[3], 255); assert.equal(normal.ink[3], 255); assert.equal(normal.srcIsRaw, false);
    await page.click(`${panel} [data-ai-compare]`);
    await page.waitForFunction(() => document.querySelector('.ai-comparison-right image')?.hasAttribute('href'));
    const swipe = await inspect(page, true); write(evidence, 'swipe.json', swipe);
    assert.equal(swipe.outside[3], 0); assert.equal(swipe.inside[3], 255); assert.equal(swipe.srcIsRaw, false);
    await page.selectOption(background, 'all-near-white'); await settled(page);
    await page.waitForFunction(() => document.querySelector('.ai-comparison-right image')?.getAttribute('href') === document.querySelector('#ai-image-panel .ai-generated-card .ai-preview-stage > img')?.src);
    const allWhite = await inspect(page, true); write(evidence, 'all-white.json', allWhite);
    assert.equal(allWhite.inside[3], 0); assert.equal(allWhite.ink[3], 255);
    await page.screenshot({ path: path.join(evidence, 'swipe.png') });
    for (const value of ['preserve', 'connected', 'all-near-white', 'preserve', 'connected']) await page.selectOption(background, value);
    await page.click(`${panel} [data-tab-id="task-1"] .ai-task-tab-select`);
    await page.waitForFunction(() => document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId === 'candidate-1');
    const other = await inspect(page); write(evidence, 'other-task.json', other);
    assert.equal(other.outside[3], 255); assert.equal(other.id, 'candidate-1');
    await page.click(`${panel} [data-tab-id="task-0"] .ai-task-tab-select`); await settled(page);
    const restored = await inspect(page); write(evidence, 'restored-task.json', restored);
    assert.equal(restored.outside[3], 0); assert.equal(restored.id, 'candidate-0');
    await page.selectOption(background, 'preserve'); await settled(page);
    assert.equal((await inspect(page)).srcIsRaw, true);
    const preserved = await page.evaluate(async () => (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(w => w.tabs).every(tab => tab.generated[0].data === window.__task2.original));
    write(evidence, 'result.json', { preserved, sends: restored.sends, errors });
    assert.equal(preserved, true); assert.equal(restored.sends, 0); assert.deepEqual(errors, []);
  });
  test(`${engine}: selecting automatic separation recomputes local regions visible in existing result viewer`, { timeout: 90000 }, async t => {
    const evidence = path.join(evidenceRoot, engine, 'separation'); fs.mkdirSync(evidence, { recursive: true });
    process.env.TASK2_ENGINE = engine;
    const { page, errors } = await fixture(t, 2, evidence);
    await page.selectOption(separation, 'auto');
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
    await page.selectOption(separation, 'grid');
    await page.selectOption(separation, 'off');
    await page.locator(`${panel} [data-tab-id="task-1"] .ai-task-tab-select:visible`).click();
    await page.waitForFunction(() => document.querySelector('#ai-image-panel')?.dataset.aiSelectedCandidateId === 'candidate-1');
    assert.equal(await groups.getAttribute('data-ai-separation-state'), '');
    await page.locator(`${panel} [data-tab-id="task-0"] .ai-task-tab-select:visible`).click();
    await page.waitForFunction(() => document.querySelector('#ai-image-panel')?.dataset.aiSelectedCandidateId === 'candidate-0');
    await page.selectOption(separation, 'auto');
    await page.waitForFunction(() => document.querySelector('#ai-image-panel [data-ai-editable-groups]')?.dataset.aiSeparationState === 'ready');
    const sends = await page.evaluate(() => window.__task2.sends.length);
    write(evidence, 'result.json', { count, sends, errors, staleSelectionRejected: true });
    assert.equal(sends, 0); assert.deepEqual(errors, []);
  });
}

for (const engine of ['chromium', 'webkit']) {
  test(`${engine}: composition controls stay consistent before output, after output and restored tasks`, { timeout: 90000 }, async t => {
    const evidence = path.join(evidenceRoot, engine, 'composition'); fs.mkdirSync(evidence, { recursive: true });
    process.env.TASK2_ENGINE = engine;
    const { page, errors } = await fixture(t, 2, evidence, { initialGeneration: true });
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
    await page.selectOption(background, 'all-near-white');
    await page.selectOption(composition, 'separated');
    assert.deepEqual(await state(), separated);
    await page.selectOption(composition, 'single');
    assert.deepEqual(await state(), { ...single, background: 'all-near-white' });
    await page.selectOption(composition, 'separated');
    await selectTask('task-1');
    assert.deepEqual(await state(), single);
    await page.selectOption(composition, 'separated'); await settled(page);
    assert.deepEqual(await state(), separated);
    const processed = await inspect(page);
    assert.equal(processed.outside[3], 0, 'composition immediately applies local external-background processing');
    assert.equal(processed.inside[3], 255);
    await page.selectOption(composition, 'single'); await settled(page);
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
    await page.selectOption(composition, 'single');
    assert.deepEqual(await state(), { ...single, background: 'all-near-white' });
    await page.screenshot({ path: path.join(evidence, 'restored-single.png') });
    assert.equal(await page.evaluate(() => window.__task2.sends.length), 0);
    assert.deepEqual(errors, []);
    write(evidence, 'result.json', { initial, restored: await state(), saved, processed, sends: 0, errors });
  });
}
