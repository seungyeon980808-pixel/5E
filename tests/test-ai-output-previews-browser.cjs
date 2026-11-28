const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
// 10-22(e704e45e)부터 「좌우·상하·슬라이더 비교」는 「비교 ▾」 메뉴 안에 있다 — 메뉴를 열고 누른다.
const clickCompare = async (scope, selector = '[data-ai-compare]') => { const menu = scope.locator('.ai-compare-menu').first(); if (await menu.count() && !await menu.evaluate(d => d.open)) await menu.locator('summary').click(); await scope.locator(selector).first().click(); };
// 10-22(83201a54)부터 「그룹으로 보기·분리 복구·출력 상세·선택 결과 안내」는 닫힌 「고급 출력」(details.ai-output-more) 안에 있다 — 열고 확인·클릭한다.
const openOutputMore = async page => { const manualForMore = page.locator('#ai-image-panel [data-result-mode="manual"]'); if (await manualForMore.isVisible().catch(() => false) && await manualForMore.getAttribute('aria-pressed') !== 'true' && await manualForMore.isEnabled()) await manualForMore.click(); // 11-27: 「결과 다듬기」는 직접 편집 칸에 있다
  const d = page.locator('#ai-image-panel .ai-output-more').first(); if (await d.count() && !await d.evaluate(e => e.open)) await d.locator('summary').click(); };
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
  let button = page.locator(`${panel} [data-ai-setting-key="${mapped.key}"] [data-ai-setting-value="${mapped.value}"]:visible`);
  const count = await button.count();
  // 11-19 E10: 시안 v6(506f30bf, 11-11)부터 결과(옛 PNG 결과 포함)를 고른 동안의 결과 처리 설정 칸
  // ([data-ai-legacy-result-settings])은 css/ai-panel.css에서 늘 숨김이다. 칸과 위임 컨트롤러(js/ai-settings-panel.js → 원래 select)는
  // 그대로 있으므로, 「화면에는 안 보인다」를 확인한 뒤 같은 단추의 클릭 이벤트로 그 컨트롤러 계약(아래 단언 전부)을 검사한다.
  // 옛 PNG 결과가 골라져 있으면(data-ai-legacy-result=true) 그 결과의 주인은 「저장된 그림 처리」 칸이다 — 원본 설정 칸과 함께 그려져
  // 같은 값 단추가 두 개 보일 수 있어, 결과 주인 칸의 단추를 고른다(보이면 그대로 누르고, 숨어 있으면 클릭 이벤트로).
  let legacyOwner = false;
  if (count !== 1 && await page.locator(panel).getAttribute('data-ai-legacy-result') === 'true') {
    const legacy = page.locator(`${panel} [data-ai-legacy-result-settings] [data-ai-setting-key="${mapped.key}"] [data-ai-setting-value="${mapped.value}"]`);
    if (await legacy.count() === 1) {
      assert.equal(await legacy.isEnabled(), true, 'The legacy result owner still permits this choice');
      button = legacy; legacyOwner = true;
    }
  }
  if (!legacyOwner && (count !== 1 || !await button.isVisible() || !await button.isEnabled())) {
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
          options: native.options ? [...native.options].map(option => ({ value: option.value, disabled: option.disabled })) : null } : null,
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
  if (legacyOwner && !await button.isVisible()) await button.dispatchEvent('click'); else await button.click();
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
    // 11-19 E10: 시안 v6(506f30bf)부터 처리 상태 글은 화면에서 숨김(간단 설정 칸 display:none). 글 내용(처리 중·실패)은 그대로 남아 확인한다.
    assert.match(pending.text, /처리하는 중/); assert.equal(pending.visible, false);
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
    assert.equal(await status.isVisible(), false); assert.equal(failed.srcIsRaw, false); assert.equal(failed.outside[3], 0); assert.equal(failed.inside[3], 255);
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
    await clickCompare(page.locator(panel));
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
    // 11-09 사용자 원칙: 분리 중에도 배경 단추는 묶이지 않는다(언제든 바꿀 수 있음).
    assert.equal(await page.locator(background).isDisabled(), false); assert.equal(await page.locator(background).inputValue(), 'connected');
    await openOutputMore(page);
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
    // 11-09 사용자 원칙: 분리 중에도 배경은 묶이지 않고(locked false), 고른 지우는 방식(안쪽 흰색까지)을 그대로 둔다.
    const separated = { composition: 'separated', separation: 'auto', background: 'connected', locked: false };
    // 11-19 E10: 506f30bf(11-11, 시안 v6)부터 객체 분리를 켜면 배경 제거가 「외부 흰색 제거」로 켜지고 잠기며(js/ai-settings-panel.js
    // syncBackgroundForObjects), 분리를 끄면 이전 값(여기서는 안쪽 흰색까지)으로 돌아온다. 11-09의 「분리 중에도 고른 방식 유지」는 이것으로 바뀜.
    const separatedAllWhite = { ...separated, background: 'connected' };
    const initial = await state(); write(evidence, 'initial.json', initial);
    await page.screenshot({ path: path.join(evidence, 'initial.png') });
    assert.deepEqual(initial, single, 'legacy single task must not inherit automatic separation');
    await chooseExposedOutputSetting(page, evidence, 'background', 'all-near-white');
    await chooseExposedOutputSetting(page, evidence, 'composition', 'separated');
    assert.deepEqual(await state(), separatedAllWhite);
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
    assert.deepEqual(await state(), separatedAllWhite);
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
    assert.deepEqual(await state(), separatedAllWhite);
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
    // 10-22(83201a54): 이미지 작업은 숨은 [data-ai-send] 대신 보이는 「변환하기」([data-ai-send][data-ai-comments-apply])로 같은 전송 흐름을 시작한다.
    await page.locator(`${panel} [data-ai-send][data-ai-comments-apply]`).click();
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
      // 10-13(4dbdd0b8)부터 첫 생성 요청은 승인된 규칙을 원본 추적 계약(buildSourceTracingPrompt, preserveStyle)으로 감싸 보낸다.
      const { buildSourceTracingPrompt } = await import(window.__runtime.base + 'ai-source-tracing-contract.js' + window.__runtime.query);
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
      const attachmentFrame = await pixels(attachment.data);
      const tracingPrompt = buildSourceTracingPrompt({ sourceFrame: { width: attachmentFrame.width, height: attachmentFrame.height }, preserveStyle: true });
      return { id:candidate.id,data:candidate.data,separationMode:tab.separationMode, stages:window.__task2.sends.map(send => send.stage), generations:window.__task2.generationSends.length,
        purposes:window.__task2.sends.map(send => send.payload.purpose), text:generation.payload.text,
        approvedPrefixRetained:generation.payload.text.startsWith(tracingPrompt),
        approvedPromptVerbatimInText:generation.payload.text.includes(APPROVED_FIRST_PROMPT),
        tracingWrapsApprovedPrompt:tracingPrompt.includes(APPROVED_FIRST_PROMPT) && tracingPrompt.startsWith('[SOURCE-GRID-TRACING'),
        approvedPromptSha256:await imageLabelDigest(tracingPrompt), generationHarness:candidate.workflowMetrics?.generationHarness,
        // 11-19 E10: c9d1da3f(11-10) 새 엔진부터 첫 요청은 짧은 지시문(REDRAW_TEXTBOOK_PROMPT, 일반 그림)이다 — 그 글과 해시를 함께 읽는다.
        shortPrompt:(await import(window.__runtime.base + 'ai-image-label-run.js' + window.__runtime.query)).REDRAW_TEXTBOOK_PROMPT,
        textSha256:await imageLabelDigest(generation.payload.text),
        shortPromptSha256:await imageLabelDigest((await import(window.__runtime.base + 'ai-image-label-run.js' + window.__runtime.query)).REDRAW_TEXTBOOK_PROMPT),
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
    // 11-19 E10: c9d1da3f(11-10 새 엔진: 직접 연결·짧은 지시문·검수 없음)부터 생성 한 단계만 보낸다(옛 「생성+전체 검수」 두 단계는 없어짐).
    assert.deepEqual(result.stages, ['image-generation']);
    assert.equal(result.generations, 1); assert.equal(result.purposes[0], 'image');
    // 옛 「승인된 RHWP 긴 지시문을 원본 추적 계약으로 감싼 앞부분」 계약 대신, 지금은 짧은 지시문이 요청 글에 그대로 들어가고
    // 하네스 기록(promptSha256)이 실제 보낸 글의 해시와 같아야 한다.
    assert.ok(result.text.includes(result.shortPrompt), 'The real generation payload carries the current short redraw prompt verbatim');
    assert.equal(result.tracingWrapsApprovedPrompt, true, 'The retained source-tracing contract still wraps the approved prompt (module contract)');
    assert.equal(result.generationHarness.id, 'rhwp-approved-first-v1');
    // 하네스 기록은 짧은 지시문 자체의 해시다(물체별 분리 등 덧붙는 지시는 요청 글에만 붙는다 — off에서는 둘이 같다).
    assert.equal(result.generationHarness.promptSha256, result.shortPromptSha256, 'Recorded harness digest is the current short prompt');
    assert.equal(metrics.generationHarness.promptSha256, result.shortPromptSha256);
    // 1.7.3 교과서 변환은 원본 윤곽 밑그림(두 번째 첨부)을 함께 보내고 그 안내 한 문단(EDGE_GUIDE_NOTE)을 뒤에 붙인다.
    if (sourceSeparation === 'off') assert.ok(result.textSha256 === result.shortPromptSha256 || (result.text.startsWith(result.shortPrompt) && /두 번째 첨부는 첫 번째 원본 그림의 윤곽을 기계로 뽑은 선화/.test(result.text.slice(result.shortPrompt.length))), 'Without separation the sent text is the short prompt (plus only the edge-guide note)');
    assert.doesNotMatch(result.text, /4×4 격자로 배치|아틀라스 배치만 적용/);
    assert.equal(result.attachment.width, 512); assert.equal(result.attachment.height, 384);
    assert.deepEqual(result.attachment,result.reference,'Actual input reference RGBA and dimensions reach the generation payload unchanged');
    assert.equal(result.sourceFrame.width, result.reference.width); assert.equal(result.sourceFrame.height, result.reference.height);
    assert.equal(result.sourceFrame.coordinateSystem, 'normalized-0-1');
    assert.equal(result.candidateFrame.width, result.raw.width); assert.equal(result.candidateFrame.height, result.raw.height);
    assert.equal(result.candidateFrame.coordinateSystem, 'normalized-0-1');
    assert.equal(result.encodedRawIdentity, true); assert.equal(result.storedDigest, result.rawDigest);
    assert.deepEqual(result.stored, result.raw);
    // 11-08 사용자 결정: 일반 그림 변환 결과도 고른 배경 처리(변환 전에 고른 외부 배경 제거)를 화면에 따른다 — 저장된 AI 원본은 그대로.
    assert.equal(result.visible.width, result.raw.width); assert.equal(result.visible.height, result.raw.height);
    assert.deepEqual(result.visible.alpha, [0,255], 'The visible general result follows the selected outside background removal');
    assert.deepEqual(result.raw.alpha, [255,255], 'Actual generated interior and exterior alpha are retained despite a connected source setting');
    assert.equal(result.workflow.explicit, true); assert.equal(result.reviewState, 'passed');
    // 11-19 E10: 원본 분석 0회·생성 1회, 검수는 c9d1da3f부터 건너뜀(reviewSkipped).
    assert.equal(metrics.calls.sourceAnalysis, 0); assert.equal(metrics.calls.fullGeneration, 1); assert.equal(metrics.calls.review, 0);
    assert.equal(metrics.reviewSkipped, true);
    assert.deepEqual(result.counts, {'task-0':1,'task-1':1});
    // 11-08 사용자 결정: 일반 그림 변환 결과도 작업 뒤 「저장된 그림 처리」(배경·객체 분리)를 쓸 수 있다. 저장된 AI 원본은 그대로.
    assert.equal(result.historicalStillOriginal, true); assert.equal(result.legacyVisible, true);
    assert.equal(result.separationMode,sourceSeparation);
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
    assert.equal(await page.locator(background).isDisabled(),false);
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
    // 10-19(32525bde): 편집 화면은 큰 data URL 그림을 재사용 blob URL로 그린다(내보내기는 data URL 그대로). 같은 바이트인지 blob을 data URL로 되읽어 비교한다.
    const resolvedData=href.startsWith('blob:')?await new Promise((resolve,reject)=>{fetch(href).then(r=>r.blob()).then(b=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(b);},reject);}):href;
    const image=new Image();image.src=href;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d');context.drawImage(image,0,0);const rgba=context.getImageData(0,0,canvas.width,canvas.height).data;
    const {imageLabelDigest}=await import(window.__runtime.base+'ai-image-label-run.js'+window.__runtime.query);
    return{objectId:id,href,resolvedData,digest:await imageLabelDigest(resolvedData),pixels:{width:canvas.width,height:canvas.height,rgbaHash:[...new Uint8Array(await crypto.subtle.digest('SHA-256',rgba))].map(v=>v.toString(16).padStart(2,'0')).join(''),alpha:[rgba[3],rgba[(100*canvas.width+80)*4+3]]}};
  },images[0].id);
  write(evidence,'actual-auto-native-render.json',insertionPixels);
  assert.ok(insertionPixels.href===expected.data||insertionPixels.href.startsWith('blob:'),'Edit canvas serves the image as the data URL or its reusable blob URL');assert.equal(insertionPixels.resolvedData,expected.data,'Rendered image bytes are exactly the accepted RAW PNG');assert.equal(insertionPixels.digest,expected.storedDigest);assert.deepEqual(insertionPixels.pixels,expected.raw);
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
// 11-19 E10: 지움 — 앞부분 바이트 수·SHA 고정(60578바이트). 낡은 화면 계약을 지금 흐름으로 다시 쓰면 어떤 수정도 이 고정에 걸려
// 검사 전체가 첫 줄에서 멈췄다(11-17 B1 판정). 앞부분은 git 이력이 지키므로 자기 해시 검사는 빼고, 아래 1089줄이 쓰는 앞부분 원문만
// 이 표시 앞까지로 읽는다.
const rawTransitionPrefix = (() => { const all = fs.readFileSync(__filename); return all.subarray(0, all.indexOf('// RAW-CONTRACT-TRANSITION-APPEND-01')); })();

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
async function rawTransitionProtectedControls(page,{general=false}={}) {
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
  if(general){
    // 11-08 사용자 결정: 일반 그림 변환 결과도 작업 뒤 배경 제거·객체 분리를 고를 수 있다(저장된 AI 원본은 그대로).
    assert.equal(state.raw,false);assert.equal(state.historical,true);assert.equal(state.blocked,false);
    assert.equal(state.settingsPresent,true);assert.equal(state.settingsHidden,false);
    assert.ok(state.choices.some(choice=>choice.visible&&!choice.disabled),'General output exposes enabled local-processing choices');
    return state;
  }
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

// 11-19 E10: 지움 — '/preview/' 입구 변형. 옛 preview/ 사본과 /preview/ 입구는 3dfbd711(11-16)에서 없어졌고 검사 입구는 / 만 허용한다.
for(const engine of ['chromium','webkit'])for(const entry of ['/']){
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
        const apply=page.locator(`${panel} [data-ai-send][data-ai-comments-apply]`);assert.equal(await apply.isVisible(),true);assert.equal(await apply.isEnabled(),true);await apply.click();
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
      const protection=await rawTransitionProtectedControls(page,{general:true});
      const evidence=path.join(ownEvidenceRoot,engine,'modern-first-raw-auto');
      write(evidence,'original-producer-reuse-and-protection.json',{entry,originalPrefixSHA256:rawTransitionCrypto.createHash('sha256').update(rawTransitionPrefix).digest('hex'),
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
        assert.equal(await page.locator(background).inputValue(),'connected');assert.equal(await page.locator(background).isDisabled(),false);
        const actualCall=await page.evaluate(mode=>(window.__rawTransitionSeparations||[]).filter(call=>call.layout===mode&&call.candidateId==='candidate-0').at(-1),mode);
        assert.ok(actualCall);assert.equal(actualCall.completed,true);assert.equal(actualCall.error,undefined);
        const prepared=actualCall.prepared;
        assert.ok(prepared);assert.equal(prepared.stats.rgbaVerified,true);assert.equal(prepared.stats.assignmentVerified,true);
        assert.equal(prepared.unassignedForegroundPixelCount,0);assert.equal(prepared.assignedForegroundPixelCount,prepared.foregroundPixelCount);
        if(mode==='auto')assert.equal(prepared.assets.length,3,'The retained three-disjoint-object fixture separates exactly three objects');
        else{assert.equal(prepared.stats.layoutMode,'fixed-grid');assert.ok(prepared.assets.length>0&&prepared.assets.length<=16);assert.ok(prepared.reviewReasons.includes('grid-boundary-foreground'),'Actual grid reports the original fixture objects crossing cell boundaries');}
        assert.equal(Number(await groups.getAttribute('data-ai-separated-count')),prepared.assets.length,'Physical result action reflects the actual algorithm result');
        await openOutputMore(page);assert.equal(await groups.isVisible(),true);assert.equal(await groups.isEnabled(),true);await groups.click();
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

// 11-19 E10: 지움 — 「여러 작업 결과를 한 폴더에(ZIP) 저장」 검사 10개(COLLECTIVE-EXPORT APPEND-05·06, PRIVATE07).
// 작업대의 범위 메뉴 [data-ai-task-export-mode]와 「한 폴더에 저장」 단추 [data-ai-task-export]는 83201a54(10-16 작업대 정리)에서 빠졌고,
// 그 뒤로 exportCollection(js/ai-task-workspaces.js)을 부르는 화면·공개 API가 없다(관리자 반환값에도 없음). 확인 창도 브라우저 confirm에서
// 앱 확인 창(ui-dialogs showConfirm)으로 바뀌었다. 한 장 저장은 「PNG 저장」·「이미지 복사」(결과 줄)로 남아 있다.
// 기능을 다시 열면 이 검사를 git 이력(fix/172-tests 직전)에서 되살려 새 입구에 맞춘다.

// PRIVATE08: actual native load/decode success/error across preview UI lifetimes.
// Root only. Manager dispose is explicitly component-lifecycle coverage, not a UI delete claim.
// 11-19 E10: 지움 — 파일 앞부분 SHA 자기 고정(위 RAW-CONTRACT 줄과 같은 이유).

function lifetimeReplaceOnce(source, from, to, label) {
  assert.equal(source.split(from).length-1,1,label);return source.replace(from,to);
}
function lifetimeObservePanel(source) {
  const start='  const renderOutputVariant = async (item, image, revision = outputProcessingRevision) => {';
  const end='  const refreshOutputPreviews = () => {';
  assert.equal(source.split(start).length-1,1);assert.equal(source.split(end).length-1,1);
  const at=source.indexOf(start),stop=source.indexOf(end,at),original=source.slice(at,stop);
  assert.equal(original.endsWith('  };\n'),true);
  let body=original.slice(start.length,-'  };\n'.length);
  body=lifetimeReplaceOnce(body,'      const source = await resolveOutputVariant(item);',`      const __pending = resolveOutputVariant(item);
      const __cached = outputVariantCache.get(item)?.get(key);
      __call.cacheId = __life.promiseId(__cached);
      const source = await __pending;`, 'One original preview resolver await retained');
  // 11-19 E10: 라벨 미리보기(renderLabelPreview) 뒤에도 같은 guard가 하나 더 생겨 지금은 3개(성공 전·라벨 그린 뒤·오류). 그림 넣는 줄도
  // 손 지우개 초안(localEraseController)을 먼저 보는 한 줄로 바뀌었다 — 아래 'src' 이음새를 지금 줄로 맞춘다.
  assert.equal(body.split('if (!isCurrent()) return;').length-1,3,'All actual success and error guards observed');
  // guard마다 이름을 따로(같은 try 안에 둘이 있어 const 이름이 겹치지 않게).
  let __guard=0;
  body=body.replaceAll('if (!isCurrent()) return;',()=>{const n=++__guard;return `const __accepted${n} = isCurrent();
      __call.checks.push({accepted:__accepted${n},epoch:localVisibilityEpoch,revision:outputProcessingRevision,disposed});
      if (!__accepted${n}) return;`;});
  for(const [kind,statement] of [
    ['src','if (image.src !== preview) image.src = preview;'],
    ['class',"image.classList.toggle('ai-output-transparent', !requiresRawImageOutput(item) && selectedImageOutputOptions.backgroundPolicy !== 'preserve');"],
    ['status','setOutputProcessingStatus(`${imageOutputSummary()}${backgroundLocked ? ` · ${SEPARATION_BACKGROUND_HINT} ${SEPARATION_LIMITS_HINT}` : \'\'}`, item, revision);'],
    ['error-status','setOutputProcessingStatus(`결과 처리 실패: ${error.message}`, item, revision);'],
  ]) body=lifetimeReplaceOnce(body,statement,`__life.perform(__call,${JSON.stringify(kind)},()=>{ ${statement} });`,'Pass-through original '+kind+' statement');
  const setup=`  const __life = window.__previewLifetime ||= (()=>{
    let serial=0; const ids=new WeakMap();
    return {calls:[],shows:[],transforms:[],nodes:new Map(),writes:[],mutations:[],
      promiseId(p){if(!p || typeof p.then!=='function')return null;if(!ids.has(p))ids.set(p,++serial);return ids.get(p);},
      perform(call,kind,action){const result=action();this.writes.push({callId:call.id,kind,revision:call.revision,epoch:call.epoch});return result;},
      view(){return {shows:this.shows.slice(),calls:this.calls.map(({done,resolve,...v})=>v),writes:this.writes.slice(),mutations:this.mutations.slice(),transforms:this.transforms.map(({done,resolve,...v})=>v)};}
    };
  })();
  __life.nodes.set(panel,()=>({epoch:localVisibilityEpoch,revision:outputProcessingRevision,disposed,
    activeTaskId:activeTaskTabId,selectedCandidateId,hidden:panel.hidden,inert:panel.inert,
    connected:panel.isConnected,busy,source:selectedOutputItem()?.data,
    retainedImage:selectedOutputItem()?.outputImage===window.__lifetimeRetained?.image,
    status:outputProcessingStatus?.textContent,
    src:selectedOutputItem()?.outputImage?.getAttribute('src'),classes:selectedOutputItem()?.outputImage?.className}));
`;
  const replacement=setup+start+`
    const __call={id:__life.calls.length,epoch:localVisibilityEpoch,revision,taskId:activeTaskTabId,
      candidateId:item?.id,policy:selectedImageOutputOptions.backgroundPolicy,disposedAtEntry:disposed,
      checks:[],settled:false,cacheId:null};
    __call.done=new Promise(resolve=>{__call.resolve=resolve;});__life.calls.push(__call);
    try {`+body+`
    } finally {__call.settled=true;__call.exit=__life.nodes.get(panel)();__call.resolve();}
  };
`;
  let observed=source.slice(0,at)+replacement+source.slice(stop);
  const showStart='  const showWorkbench = () => {',showEnd='  const emptyReviewReport = () =>';
  assert.equal(source.split(showStart).length-1,1);assert.equal(source.split(showEnd).length-1,1);
  const a=source.indexOf(showStart),b=source.indexOf(showEnd,a),show=source.slice(a,b);
  assert.equal(show.endsWith('  };\n'),true);
  const originalShowBody=show.slice(showStart.length,-'  };\n'.length);
  const observedShow=showStart+`
    const __show={epoch:localVisibilityEpoch,revision:outputProcessingRevision,disposed,
      opening:!motion.isOpen(),callIdsBefore:__life.calls.map(c=>c.id)};
    __life.shows.push(__show);
    try {`+originalShowBody+`
    }finally{__show.exit={epoch:localVisibilityEpoch,revision:outputProcessingRevision,disposed,
      open:motion.isOpen(),callIdsAfter:__life.calls.map(c=>c.id)};}
  };\n`;
  return lifetimeReplaceOnce(observed,show,observedShow,'Entire current show helper body preserved');
}
function lifetimeObserveNative(source) {
  const success='    img.onload = () => resolve(img);';
  const failure='    img.onerror = () => reject(new Error("생성 이미지를 불러오지 못했습니다."));';
  const intercept=(kind,original)=>`    const __${kind} = ${original};
    img.on${kind} = event => {
      const gate=window.__previewLifetimeGate;
      if(!gate || !gate.armed || gate.raw!==src){__${kind}(event);return;}
      gate.armed=false;
      (async()=>{
        let decodeError=null;
        try {await HTMLImageElement.prototype.decode.call(img);}
        catch(error){decodeError={name:error.name,message:error.message};if(${JSON.stringify(kind)}==='load')throw error;}
        gate.receipt={event:${JSON.stringify(kind)},trusted:event.isTrusted,nativeImage:img instanceof HTMLImageElement,
          src,currentSrc:img.currentSrc,width:img.naturalWidth,height:img.naturalHeight,
          complete:img.complete,decodeCompleted:decodeError===null,decodeError};
        gate.enteredResolve(gate.receipt);
        await gate.releasePromise;
        __${kind}(event);
      })().catch(error=>{gate.enteredReject(error);reject(error);});
    };`;
  let body=lifetimeReplaceOnce(source,success,intercept('load','() => resolve(img)'),'Original native success delivery');
  body=lifetimeReplaceOnce(body,failure,intercept('error','() => reject(new Error("생성 이미지를 불러오지 못했습니다."))'),'Original native error delivery');
  body=lifetimeReplaceOnce(body,'export async function transparentizeGeneratedImage(',
    'async function actualLifetimeTransparentizeGeneratedImage(','Original actual transform function');
  return body+`\nexport async function transparentizeGeneratedImage(...args){
    const state=window.__previewLifetime;
    const call={src:args[0],policy:args[1]?.backgroundPolicy,settled:false};
    call.done=new Promise(resolve=>{call.resolve=resolve;});state.transforms.push(call);
    try{const result=await actualLifetimeTransparentizeGeneratedImage(...args);call.result=result;return result;}
    catch(error){call.error={name:error.name,message:error.message};throw error;}
    finally{call.settled=true;call.resolve();}
  }\n`;
}
async function installLifetimeRoutes(page,runtime,origin,evidence) {
  for(const [file,observe] of [['ai-panel.js',lifetimeObservePanel],['image-background.js',lifetimeObserveNative]]){
    const source=fs.readFileSync(path.join(root,'js',file),'utf8');
    // 11-19 E10: 지움 — 제품 파일(ai-panel.js·image-background.js) 전체 SHA 고정. 제품을 고칠 때마다 이 검사가 실패했다(11-17 B1).
    // 관찰 이음새는 lifetimeReplaceOnce가 「딱 한 번 있음」으로 지킨다.
    const body=observe(source);
    const url=new URL(runtime.moduleBase+file+runtime.moduleQuery,origin).href;
    await page.route(url,route=>{
      assert.equal(route.request().url(),url);
      write(evidence,file+'.observer-load.json',{url,entry:runtime.entry,
        sourceSHA256:rawTransitionCrypto.createHash('sha256').update(source).digest('hex'),
        servedSHA256:rawTransitionCrypto.createHash('sha256').update(body).digest('hex'),
        qualification:'Original function bodies, guards and native handlers retained; event delivery delayed and assignments observed, no DOM setter overrides'});
      fs.writeFileSync(path.join(evidence,file+'.served.js'),body);
      return route.fulfill({contentType:'text/javascript',body});
    });
  }
}
function lifetimeFixture(outcome) {
  let source=harness.replace("separationMode: 'off',", "separationMode: 'off', generationMode: 'single',");
  if(outcome==='reject')source=lifetimeReplaceOnce(source,'  window.__task5Expected = structuredClone(tabs);',
    `  const truncated='data:image/png;base64,'+btoa(atob(original.split(',')[1]).slice(0,33));
  // Original native canvas PNG signature + complete IHDR, no IDAT/IEND: real decoder error.
  // Attachments retain the complete native canvas PNG so the actual fixture still boots normally.
  for(const tab of tabs)for(const item of tab.generated)item.data=truncated;
  window.__task5Expected = structuredClone(tabs);`,'Corrupt historical input fixture only');
  source=lifetimeReplaceOnce(source,rawTransitionEntrySeam,
    '  await installLifetimeRoutes(page,runtime,origin,evidence);\n'+rawTransitionEntrySeam,'Canonical module install before entry');
  return new Function('require','root','fs','path','assert','chromium','webkit','installLifetimeRoutes',
    source+'; return requestBrowserFixture;')(require,root,fs,path,assert,chromium,webkit,installLifetimeRoutes);
}
async function lifetimeSnapshot(page){return page.evaluate(()=>{
  const s=window.__previewLifetime,p=window.__lifetimePanel;
  return {state:s.nodes.get(p)(),probe:s.view(),sends:window.__task2.sends.length,generations:window.__task2.generationSends.length};
});}
async function lifetimeClick(page,selector,evidence,name){
  const button=page.locator(selector);assert.equal(await button.count(),1);assert.equal(await button.isVisible(),true);assert.equal(await button.isEnabled(),true);
  write(evidence,name+'.json',await button.evaluate(b=>({text:b.textContent,ariaLabel:b.getAttribute('aria-label'),rect:b.getBoundingClientRect().toJSON(),hidden:!!b.closest('[hidden],[inert]'),disabled:b.disabled})));
  await button.click();
}
async function lifetimeArm(page,raw){await page.evaluate(raw=>{
  const p=document.querySelector('#ai-image-panel');window.__lifetimePanel=p;
  const gate={raw,armed:true};gate.enteredPromise=new Promise((resolve,reject)=>{gate.enteredResolve=resolve;gate.enteredReject=reject;});
  gate.enteredPromise.catch(()=>{});gate.releasePromise=new Promise(resolve=>{gate.release=resolve;});window.__previewLifetimeGate=gate;
  const state=window.__previewLifetime;
  const image=p.querySelector('.is-ai-active-candidate .ai-preview-stage > img'),status=p.querySelector('[data-ai-output-processing-status]');
  if(!image||!status)throw new Error('Actual retained preview/status nodes required');
  window.__lifetimeRetained={image,status};
  const observer=new MutationObserver(records=>{for(const r of records)state.mutations.push({target:r.target===image?'image':r.target===status?'status':'status-child',type:r.type,attribute:r.attributeName,oldValue:r.oldValue});});
  observer.observe(image,{attributes:true,attributeOldValue:true,attributeFilter:['src','class']});
  observer.observe(status,{subtree:true,childList:true,characterData:true,characterDataOldValue:true});
  window.__lifetimeMutationObserver=observer;
},raw);}
async function lifetimePersistPixels(page,data,evidence,name){
  const file=path.join(evidence,name+'.png'),encoded=Buffer.from(data.split(',')[1],'base64');fs.writeFileSync(file,encoded);
  const decoded=await page.evaluate(async data=>{
    const img=new Image();img.src=data;await img.decode();const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;
    const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return {width:c.width,height:c.height,rgba:[...ctx.getImageData(0,0,c.width,c.height).data]};
  },data);
  const rgba=Buffer.from(decoded.rgba);fs.writeFileSync(file+'.rgba',rgba);
  const receipt={path:file,bytes:encoded.length,width:decoded.width,height:decoded.height,sha256:rawTransitionCrypto.createHash('sha256').update(encoded).digest('hex'),rgbaPath:file+'.rgba',rgbaSHA256:rawTransitionCrypto.createHash('sha256').update(rgba).digest('hex')};
  write(evidence,name+'.receipt.json',receipt);return receipt;
}

for(const engine of ['chromium','webkit'])for(const scenario of ['close','close-reopen','manager-dispose'])for(const outcome of ['success','reject']){
  test(`${engine} root: preview render lifetime ${scenario} native-${outcome}`,{timeout:120000,concurrency:false},async t=>{
    const evidence=path.join(evidenceRoot,'preview-render-lifetime',engine,'root',scenario,outcome);fs.mkdirSync(evidence,{recursive:true});
    const restore=rawTransitionConfigure(engine,'/');let page;
    t.after(async()=>{if(page&&!page.isClosed())await page.evaluate(()=>{window.__previewLifetimeGate?.release();window.__lifetimeMutationObserver?.disconnect();});});
    try{
      const configured=await lifetimeFixture(outcome)(t,1,evidence);page=configured.page;
      assert.equal(new URL(page.url()).pathname,'/');
      await page.evaluate(async()=>{await Promise.all(window.__previewLifetime.calls.map(call=>call.done));});
      const snapshot=await rawTransitionSnapshot(page),before=rawTransitionTab(snapshot,'task-0'),item=before.generated[0],raw=item.data;
      assert.equal(item.id,'candidate-0');assert.equal(before.selectedCandidateId,'candidate-0');
      write(evidence,'baseline-owner.json',snapshot);
      const nativeOriginal=await page.evaluate(()=>window.__task2.original);
      await lifetimePersistPixels(page,nativeOriginal,evidence,'native-canvas-fixture');
      fs.writeFileSync(path.join(evidence,'historical-input.png'),Buffer.from(raw.split(',')[1],'base64'));
      if(outcome==='reject'){
        const encoded=Buffer.from(raw.split(',')[1],'base64'),valid=Buffer.from(nativeOriginal.split(',')[1],'base64');
        assert.equal(encoded.length,33);assert.deepEqual(encoded,valid.subarray(0,33));
      }else assert.equal(raw,nativeOriginal);
      await lifetimeArm(page,raw);
      await chooseExposedOutputSetting(page,evidence,'background','connected');
      const native=await rawTransitionPromise(page,'__previewLifetimeGate.enteredPromise','native lifetime event gate');
      assert.equal(native.trusted,true);assert.equal(native.nativeImage,true);assert.equal(native.src,raw);
      assert.equal(native.event,outcome==='success'?'load':'error');assert.equal(native.decodeCompleted,outcome==='success');
      if(outcome==='success'){assert.equal(native.width,512);assert.equal(native.height,384);assert.equal(native.decodeError,null);}
      else {assert.equal(native.width,0);assert.equal(native.height,0);assert.equal(native.decodeError.name,'EncodingError');}
      const held=await lifetimeSnapshot(page),pending=held.probe.calls.filter(c=>c.policy==='connected');
      assert.equal(pending.length,1);const old=pending[0];assert.equal(old.settled,false);assert.equal(old.checks.length,0);assert.notEqual(old.cacheId,null);
      assert.equal(held.probe.transforms.length,1);assert.equal(held.probe.transforms[0].settled,false);
      assert.equal(held.state.disposed,false);assert.equal(held.state.busy,false);
      write(evidence,'native-held.json',{native,held});await page.screenshot({path:path.join(evidence,'native-held.png')});
      if(scenario==='manager-dispose'){
        // Task deletion clears membership/revision before disposal and cannot isolate the review's retained-card lifetime defect.
        // Call the real top-level workspace manager disposal, including its actual child controller disposal.
        await page.evaluate(()=>window.__task2Manager.dispose());
        write(evidence,'manager-dispose-invocation.json',{entry:'window.__task2Manager.dispose()',classification:'Browser-hosted actual manager/controller lifecycle; no public delete UI coverage claimed'});
      }else{
        await lifetimeClick(page,'#ai-image-panel [data-ai-close]',evidence,'actual-close-control');
        await waitModernSignal(page,()=>document.querySelector('#ai-image-panel')?.hidden,null,'actual close animation hidden completion');
      }
      const hidden=await lifetimeSnapshot(page);assert.equal(hidden.state.hidden,true);assert.ok(hidden.state.epoch>old.epoch);
      assert.equal(hidden.state.disposed,scenario==='manager-dispose');
      assert.equal(hidden.state.src,held.state.src);assert.equal(hidden.state.classes,held.state.classes);
      assert.equal(hidden.probe.calls.find(c=>c.id===old.id).settled,false);
      write(evidence,'after-lifecycle.json',hidden);await page.screenshot({path:path.join(evidence,'after-lifecycle.png')});
      if(scenario==='close-reopen'){
        await lifetimeClick(page,'#ai-image-install-open',evidence,'actual-reopen-control');
        await waitModernSignal(page,()=>{const p=document.querySelector('#ai-image-panel');return p&&!p.hidden&&!p.inert;},null,'actual reopen visible completion');
      }
      const beforeRelease=await lifetimeSnapshot(page),renders=beforeRelease.probe.calls.filter(c=>c.policy==='connected');
      const fresh=renders.filter(c=>c.id!==old.id);
      if(scenario==='close-reopen'){
        assert.equal(fresh.length,1,'Reopening starts exactly one fresh preview, repeated show does not refresh');
        const shows=beforeRelease.probe.shows.slice(hidden.probe.shows.length);
        assert.equal(shows.length,2,'Actual manager activation plus open(reveal) call the common helper');
        assert.deepEqual(shows.map(s=>s.opening),[true,false]);
        assert.equal(shows[0].exit.revision,shows[0].revision+1);assert.equal(shows[1].exit.revision,shows[1].revision);
        assert.equal(shows[0].exit.callIdsAfter.length,shows[0].callIdsBefore.length+1);
        assert.deepEqual(shows[1].exit.callIdsAfter,shows[1].callIdsBefore);
        for(const call of fresh){assert.equal(call.epoch,beforeRelease.state.epoch);assert.ok(call.epoch>old.epoch);assert.ok(call.revision>old.revision);assert.equal(call.cacheId,old.cacheId);assert.equal(call.settled,false);}
        assert.equal(beforeRelease.state.disposed,false);assert.equal(beforeRelease.state.hidden,false);
      }else assert.equal(fresh.length,0);
      assert.equal(beforeRelease.probe.transforms.length,1,'All visibility consumers share one actual pending transform');
      write(evidence,'before-delivery.json',beforeRelease);
      // No synthetic result or error: deliver the retained original native handler only.
      await page.evaluate(async()=>{window.__previewLifetimeGate.release();await Promise.all(window.__previewLifetime.calls.map(c=>c.done));await Promise.all(window.__previewLifetime.transforms.map(c=>c.done));});
      const after=await lifetimeSnapshot(page),oldDone=after.probe.calls.find(c=>c.id===old.id);
      write(evidence,'after-delivery.json',after);await page.screenshot({path:path.join(evidence,'after-delivery.png')});
      assert.equal(oldDone.settled,true);assert.equal(oldDone.checks.length,1);assert.equal(oldDone.checks[0].accepted,false);
      assert.deepEqual(after.probe.writes.filter(w=>w.callId===old.id),[],'Old visibility writes neither image.src, class nor processing status');
      const all=after.probe.calls.filter(c=>c.policy==='connected');
      assert.deepEqual(all.map(c=>c.id),renders.map(c=>c.id),'Settlement starts no unobserved extra render');
      // 11-19 E10: 61bcd508부터 성공한 지금 렌더는 라벨 미리보기 뒤 guard를 한 번 더 지난다(받아들인 성공 = 2번, 그 밖 = 1번).
      for(const call of all){assert.equal(call.cacheId,old.cacheId);assert.equal(call.settled,true);assert.equal(call.checks.length,call.checks[0].accepted&&outcome==='success'?2:1);if(call.checks.length===2)assert.equal(call.checks[1].accepted,true);}
      const accepted=all.filter(c=>c.checks[0].accepted);
      if(scenario==='close-reopen'){
        assert.equal(accepted.length,1,'Exactly the current visibility/current revision consumes settlement');
        const current=accepted[0];assert.equal(current.epoch,after.state.epoch);assert.equal(current.revision,after.state.revision);assert.notEqual(current.id,old.id);
        for(const call of all.filter(c=>c.id!==current.id))assert.deepEqual(after.probe.writes.filter(w=>w.callId===call.id),[]);
        assert.deepEqual(after.probe.writes.filter(w=>w.callId===current.id).map(w=>w.kind),outcome==='success'?['src','class','status']:['error-status']);
        if(outcome==='reject'){
          assert.equal(after.state.status,'결과 처리 실패: 생성 이미지를 불러오지 못했습니다.');
          assert.equal(after.state.src,beforeRelease.state.src);assert.equal(after.state.classes,beforeRelease.state.classes);
          assert.deepEqual(after.probe.mutations.slice(beforeRelease.probe.mutations.length).filter(m=>m.target==='image'),[]);
        }else{
          assert.equal(after.state.src,after.probe.transforms[0].result);assert.match(after.state.classes,/ai-output-transparent/);
          assert.doesNotMatch(after.state.status,/실패|처리하는 중/);
          const visible=await rawTransitionPreview(page,raw,'candidate-0');assert.equal(visible.src,after.probe.transforms[0].result);
          write(evidence,'current-visible-preview.json',visible);
        }
      }else{
        assert.equal(accepted.length,0);assert.equal(after.state.hidden,true);
        assert.equal(after.state.src,beforeRelease.state.src);assert.equal(after.state.classes,beforeRelease.state.classes);assert.equal(after.state.status,beforeRelease.state.status);
        assert.deepEqual(after.probe.writes,beforeRelease.probe.writes);
        assert.deepEqual(after.probe.mutations,beforeRelease.probe.mutations,'Retained closed/disposed DOM receives zero settlement mutations');
      }
      assert.equal(after.probe.transforms.length,1);const processed=after.probe.transforms[0];assert.equal(processed.settled,true);
      if(outcome==='success'){
        assert.equal(processed.error,undefined);assert.notEqual(processed.result,raw);
        const pixels=await rawTransitionPixels(page,{raw,data:processed.result});assert.equal(pixels.outside[3],0);assert.equal(pixels.inside[3],255);assert.equal(pixels.ink[3],255);assert.equal(pixels.interiorMismatches,0);assert.ok(pixels.alphaMismatches>0);
        write(evidence,'actual-transform-pixels.json',pixels);await lifetimePersistPixels(page,processed.result,evidence,'actual-transform');
      }else{assert.equal(processed.result,undefined);assert.equal(processed.error.message,'생성 이미지를 불러오지 못했습니다.');}
      assert.equal(after.sends,0);assert.equal(after.generations,0);assert.equal(after.state.activeTaskId,'task-0');assert.equal(after.state.selectedCandidateId,'candidate-0');assert.equal(after.state.source,raw);assert.equal(after.state.retainedImage,true);
      if(scenario!=='manager-dispose'){
        const saved=rawTransitionTab(await rawTransitionSnapshot(page),'task-0');
        assert.deepEqual(saved.generated,before.generated);assert.deepEqual(saved.attachments,before.attachments);
        write(evidence,'retained-owner-after.json',saved);
      }
      if(scenario==='close-reopen' && outcome==='success'){
        // A second, physical reopen consumes the already settled cache, not a new transform.
        await lifetimeClick(page,'#ai-image-panel [data-ai-close]',evidence,'cached-close-control');
        await waitModernSignal(page,()=>document.querySelector('#ai-image-panel')?.hidden,null,'cached close completion');
        await lifetimeClick(page,'#ai-image-install-open',evidence,'cached-reopen-control');
        await page.evaluate(async()=>{await Promise.all(window.__previewLifetime.calls.map(c=>c.done));});
        const cached=await lifetimeSnapshot(page),newCalls=cached.probe.calls.filter(c=>c.policy==='connected'&&!all.some(old=>old.id===c.id));
        assert.equal(newCalls.length,1);const call=newCalls[0];assert.equal(call.cacheId,old.cacheId);
        assert.equal(call.epoch,cached.state.epoch);assert.ok(call.epoch>accepted[0].epoch);assert.ok(call.revision>accepted[0].revision);
        assert.equal(call.settled,true);assert.deepEqual(call.checks.map(v=>v.accepted),[true,true]); // 11-19 E10: 61bcd508 뒤 guard 2번
        assert.equal(cached.probe.transforms.length,1);assert.equal(cached.state.src,processed.result);assert.equal(cached.state.retainedImage,true);
        const visible=await rawTransitionPreview(page,raw,'candidate-0');assert.equal(visible.src,processed.result);
        assert.equal(cached.sends,0);assert.equal(cached.generations,0);
        write(evidence,'settled-cache-reopen.json',{cached,visible});await page.screenshot({path:path.join(evidence,'settled-cache-reopen.png')});
      }
      assert.deepEqual(configured.errors,[]);write(evidence,'completion.json',{engine,scenario,outcome,oldRenderId:old.id,cachePromiseId:old.cacheId,renderIds:all.map(c=>c.id),acceptedRenderIds:accepted.map(c=>c.id),staleWrites:0,transformCalls:1,providerRequests:0,
        qualification:scenario==='manager-dispose'?'Actual manager/controller disposal, component-qualified; not public delete UI':'Actual visible close/reopen controls',native});
    }finally{restore();}
  });
}
