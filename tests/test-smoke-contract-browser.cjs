const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
// 10-22(e704e45e)부터 「좌우·상하·슬라이더 비교」는 「비교 ▾」 메뉴 안에 있다 — 메뉴를 열고 누른다.
const clickCompare = async (scope, selector = '[data-ai-compare]') => { const menu = scope.locator('.ai-compare-menu').first(); if (await menu.count() && !await menu.evaluate(d => d.open)) await menu.locator('summary').click(); await scope.locator(selector).first().click(); };
const root = path.resolve(__dirname, '..');
const evidenceDir = path.resolve(process.env.EVIDENCE_DIR || '.omo/evidence/smoke-contract-browser');
const fixture = path.join(root, 'tests/fixtures/rights-clear-smoke.png');
const generatedFixtureDataUrl = `data:image/png;base64,${fs.readFileSync(fixture).toString('base64')}`;

function traceLibrary(step, detail = {}) {
  fs.appendFileSync(path.join(evidenceDir, 'library-trace.ndjson'), `${JSON.stringify({ step, at: new Date().toISOString(), ...detail })}\n`);
}

async function transferCurrentLibraryReference(page, panel, mode, errors) {
  traceLibrary('open-current-library');
  if (mode === 'lite') await page.locator('.lite-ai-source-actions').getByRole('button', { name: '라이브러리', exact: true }).click();
  else {
    await panel.locator('[data-ai-close]').click();
    await page.locator('#ai-image-panel').waitFor({ state: 'hidden' });
    await page.locator('#exam-library-open').click();
  }
  await page.locator('[data-unilib-close]').waitFor({ state: 'visible' });
  await waitForAnimations(page, '[data-unilib-close]');
  const result = page.locator('[data-result-id]').first();
  await result.waitFor({ state: 'visible', timeout: 45_000 });
  traceLibrary('current-result-visible');
  await result.click();
  traceLibrary('current-result-selected');
  await page.locator('[data-unilib-adjust]').click();
  traceLibrary('crop-open-requested');
  await page.locator('[data-unilib-crop]').waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const bounds = document.querySelector('[data-unilib-crop-canvas]')?.getBoundingClientRect();
    return Boolean(bounds && bounds.width > 20 && bounds.height > 20);
  }, undefined, { timeout: 20_000 });
  const cropBox = await page.locator('[data-unilib-crop-canvas]').boundingBox();
  const stageBox = await page.locator('[data-unilib-crop-stage]').boundingBox();
  assert.ok(cropBox, 'current unified-library crop canvas is visible');
  assert.ok(stageBox, 'current unified-library crop stage is visible');
  const visibleCrop = {
    x: Math.max(cropBox.x, stageBox.x) + 8,
    y: Math.max(cropBox.y, stageBox.y) + 8,
    width: Math.min(cropBox.x + cropBox.width, stageBox.x + stageBox.width) - Math.max(cropBox.x, stageBox.x) - 16,
    height: Math.min(cropBox.y + cropBox.height, stageBox.y + stageBox.height) - Math.max(cropBox.y, stageBox.y) - 16,
  };
  assert.ok(visibleCrop.width > 20 && visibleCrop.height > 20, 'a visible current crop surface is available');
  await page.mouse.move(visibleCrop.x + visibleCrop.width * 0.15, visibleCrop.y + visibleCrop.height * 0.15);
  await page.mouse.down();
  await page.mouse.move(visibleCrop.x + visibleCrop.width * 0.45, visibleCrop.y + visibleCrop.height * 0.45, { steps: 5 });
  await page.mouse.up();
  await page.locator('[data-unilib-crop-save]:not([disabled])').click();
  await page.locator('[data-unilib-crop-draft-review]').waitFor({ state: 'hidden' });
  traceLibrary('current-crop-saved');
  await page.screenshot({ path: path.join(evidenceDir, `${page.context().browser().browserType().name()}-${mode}-library-crop.png`), fullPage: true });
  await page.locator('[data-unilib-crop-workbench]:not([disabled])').click();
  traceLibrary('current-crop-added-to-workbench');
  await page.locator('[data-unilib-ai]:not([disabled])').click();
  let destination;
  try {
    destination = await page.waitForFunction(() => {
      const assignment = document.querySelector('.workbench-assignment [data-action="continue"]');
      if (assignment?.getClientRects().length) return 'assignment';
      const reference = document.querySelector('#ai-image-panel:not([hidden]) [data-ai-reference-id]');
      if (reference) return 'consumer';
      const status = document.querySelector('[data-unilib-status]');
      if (status?.classList.contains('is-error')) throw new Error('Library transfer failed: ' + status.textContent);
      return false;
    });
  } finally {
    fs.writeFileSync(path.join(evidenceDir, `${page.context().browser().browserType().name()}-${mode}-pre-transfer-diagnostic.json`), JSON.stringify({ errors,
      ...(await page.evaluate(() => ({
        library: window.__smokeLibrarySnapshot?.() || null,
        status: document.querySelector('[data-unilib-status]')?.textContent,
        statusClass: document.querySelector('[data-unilib-status]')?.className,
        assignments: [...document.querySelectorAll('.workbench-assignment')].map(node => ({text:node.innerText,visible:!!node.getClientRects().length})),
        panels: [...document.querySelectorAll('#ai-image-panel,[id^="ai-workspace-"]')].map(node => ({id:node.id,hidden:node.hidden,referenceCount:node.querySelectorAll('[data-ai-reference-id]').length})),
      }))),
    }, null, 2));
  }
  const transferPath = await destination.jsonValue(); await destination.dispose();
  assert.ok(['assignment', 'consumer'].includes(transferPath), 'The current library uses either explicit assignment or its existing one-reference consumer');
  // 배정 창의 「계속」은 두 단계다: 처음은 분류 안 된 그림을 이미지 작업대에 배치만 하고(단추가 「작업대 열기」로 바뀜), 다음에 작업대를 연다
  // (workbench-assignment.js — 작업대 열기는 따로 하는 동작). 창이 닫힐 때까지 누른다.
  if (transferPath === 'assignment') {
    const proceed = page.locator('.workbench-assignment [data-action="continue"]');
    for (let i = 0; i < 3 && await proceed.isVisible().catch(() => false); i++) { await proceed.click(); await page.waitForTimeout(250); }
  }
  const referenceDiagnostic = await page.evaluate(() => ({
    transferPath: document.querySelector('.workbench-assignment') ? 'assignment' : 'consumer',
    panels: [...document.querySelectorAll('#ai-image-panel,[id^="ai-workspace-"]')].map(node => ({id:node.id,hidden:node.hidden,workflow:node.dataset.aiWorkflow})),
    references: [...document.querySelectorAll('[data-ai-reference-id]')].map(node => ({id:node.dataset.aiReferenceId,html:node.outerHTML.slice(0,2400),visible:Boolean(node.getClientRects().length),style:getComputedStyle(node).display})),
    status: document.querySelector('[data-unilib-status]')?.textContent,
  }));
  fs.writeFileSync(path.join(evidenceDir, `${page.context().browser().browserType().name()}-${mode}-transfer-diagnostic.json`), JSON.stringify({ transferPath, ...referenceDiagnostic }, null, 2));
  await panel.locator('[data-ai-reference-id]').first().waitFor({ state: 'visible' });
  await page.locator('[data-unilib-close]').waitFor({ state: 'hidden' });
  traceLibrary('current-reference-visible');
}

function startServer() {
  const contentTypes = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mjs': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const target = path.resolve(root, `.${pathname === '/' ? '/preview/' : pathname}`);
    if (!target.startsWith(`${root}${path.sep}`)) return response.writeHead(403).end();
    fs.stat(target, (statError, stat) => {
      const file = !statError && stat.isDirectory() ? path.join(target, 'index.html') : target;
      fs.readFile(file, (error, bytes) => {
        if (error) return response.writeHead(404).end();
        response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream' });
        response.end(bytes);
      });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function installDesktopStub(context) {
  const transport = { sends: [], stages: [], delivered: new Set(), endpoints: [] };
  const sourceObservation = { version: 4, observationVersion: 1, leaderObservationVersion: 1, observationContractRevision: '1.4.0', removalOnlyItems: [], reviewRequired: false,
    geometryLock: { version: 1, objects: [{ id: 'fixture-structure', sourceRef: 1, role: 'scientific-object', description: 'Controlled smoke source observation; not provider quality evidence', bounds: { x: .2, y: .2, w: .6, h: .6 }, relations: [] }] },
    labels: [], removalRegions: [], protectedRegions: [], preservedMarks: [], uncertainties: [] };
  const reviewIds = ['object-counts','inside-outside','liquid-occupancy','connections','composition-state','black-fill-meaning','presentation','request-scope','kice-flat-style','flat-gray-regions','raster-label-removal','editable-label-coverage','leader-relations','label-overlay-alignment','label-typography','leader-overlay'];
  const reviewReport = { verdict: 'pass', checks: reviewIds.map(id => ({ id, label: id, status: 'pass', detail: 'Controlled smoke transport; not provider quality evidence' })), issues: [] };
  await context.addInitScript(() => {
    localStorage.setItem('5e.tutorial.bannerSeen', 'true');
    localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
    localStorage.setItem('5e.preview:5e.desktopHandoff.v1', JSON.stringify({ dismissed: true, remindUntil: 0, installStarted: false }));
    sessionStorage.setItem('5e:web-ai-session', 'f'.repeat(64));
  });
  await context.route('**/api/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').pop();
    const request = route.request().postDataJSON();
    transport.endpoints.push(endpoint);
    let response = {};
    if (endpoint === 'bridge-status') response = { login: { loggedIn: true }, server: true };
    else if (endpoint === 'bridge-models') response = { data: [{
      model: 'gpt-6.1-sol', displayName: 'Controlled smoke fixture', supportedReasoningEfforts: ['medium', 'high'],
      defaultReasoningEffort: 'medium', serviceTiers: ['priority'], defaultServiceTier: 'priority',
    }, {model:'gpt-6-luna',displayName:'Controlled observer',supportedReasoningEfforts:['medium'],defaultReasoningEffort:'medium',serviceTiers:['priority']}] };
    else if (endpoint === 'bridge-account') response = { account: { name: 'Local fixture' }, limits: {} };
    else if (endpoint === 'bridge-send') {
      transport.sends.push(request);
      const text = String(request.text || '');
      const stage = request.purpose === 'image' ? 'image-generation'
        : text.includes('입력 원본 라벨 관찰') ? 'source-observation'
        : text.includes('검수') || text.includes('FINAL_NATIVE_OVERLAY') ? 'full-review' : null;
      assert.ok(stage, 'Every controlled bridge request must have a recognized current workflow stage');
      transport.stages.push(stage);
      response = { turnId: `smoke-turn-${transport.sends.length}`, renderThreadId: `smoke-render-${transport.sends.length}` };
    } else if (endpoint === 'bridge-events') {
      const index = transport.sends.length;
      const events = [];
      if (index && !transport.delivered.has(index)) {
        transport.delivered.add(index);
        const clientScope = transport.sends.at(-1).clientScope || '';
        const stage = transport.stages[index - 1];
        const item = stage === 'image-generation' ? { type: 'imageGeneration', imageDataUrl: generatedFixtureDataUrl }
          : { type: 'agentMessage', phase: 'final_answer', text: JSON.stringify(stage === 'source-observation' ? sourceObservation : reviewReport) };
        events.push(
          { clientScope, method: 'item/completed', params: { turnId: `smoke-turn-${index}`, item } },
          { clientScope, method: 'turn/completed', params: { turn: { id: `smoke-turn-${index}`, status: 'completed' } } },
        );
      }
      response = { cursor: transport.delivered.size, events };
    } else if (endpoint === 'bridge-interrupt') response = { ok: true };
    await route.fulfill({ json: response });
  });
  return transport;
}

async function waitForAnimations(page, selector) {
  await page.locator(selector).evaluate(async (element) => {
    const finite = element.getAnimations().filter((animation) => {
      const timing = animation.effect?.getTiming?.();
      return timing?.iterations !== Infinity;
    });
    await Promise.all(finite.map((animation) => animation.finished.catch(() => {})));
  });
}

async function contract(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('#ai-image-panel:not([hidden])');
    const requirements = [
      ['workspace-tab-list', panel?.querySelector('[data-ai-tab-list]')],
      ['workspace-add-control', panel?.querySelector('[data-ai-task-add]')],
      ['workspace-file-source', panel?.querySelector('[data-ai-source-file]')],
      ['workspace-send-control', panel?.querySelector('[data-ai-send]')],
      ['workspace-close-control', panel?.querySelector('[data-ai-close]')],
    ];
    const missing = requirements.filter(([, node]) => !node).map(([name]) => name);
    return { exitCode: missing.length ? 1 : 0, missing };
  });
}

async function waitForTaskRevision(page, taskId, candidateId, referenceId) {
  await page.waitForFunction(({ taskId, candidateId, referenceId }) => {
    const panel = document.querySelector('#ai-image-panel:not([hidden])');
    const task = panel?.querySelector('[data-ai-tab-list] .ai-task-tab.is-on');
    return task?.dataset.tabId === taskId &&
      task.querySelector('.ai-task-tab-select')?.getAttribute('aria-pressed') === 'true' &&
      panel.querySelector('[data-ai-candidate-option][aria-selected="true"]')?.dataset.aiCandidateOption === candidateId &&
      panel.querySelector('.ai-generated-card')?.dataset.aiCandidateId === candidateId &&
      panel.querySelector('[data-ai-reference-id]')?.dataset.aiReferenceId === referenceId;
  }, { taskId, candidateId, referenceId });
}

test('TPK-005: current library and task workspace smoke contract has real controls and rejects missing controls', async (context) => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const server = await startServer();
  context.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.writeFileSync(path.join(evidenceDir, 'server-cleanup.json'), JSON.stringify({ serverClosed: !server.listening }));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const report = { invocation: 'node --test tests/test-smoke-contract-browser.cjs', engines: [], errors: [] };

  const engines = process.env.SMOKE_ENGINES === 'chromium' ? [chromium] : process.env.SMOKE_ENGINES === 'webkit' ? [webkit] : [chromium,webkit].filter(e=>!process.env.BROWSER_ENGINE||e.name()===process.env.BROWSER_ENGINE);
  const modes = process.env.SMOKE_MODES === 'lite' ? ['lite'] : process.env.SMOKE_MODES === 'pro' ? ['pro'] : ['pro', 'lite'];
  for (const engine of engines) {
    const browser = await engine.launch({ headless: true });
    context.after(async () => {
      await browser.close();
      fs.writeFileSync(path.join(evidenceDir, `${engine.name()}-cleanup.json`), JSON.stringify({ browserClosed: !browser.isConnected() }));
    });
    for (const mode of modes) {
      const browserContext = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const transport = await installDesktopStub(browserContext);
      const page = await browserContext.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const suffix = `?mode=${mode}`;
      await page.route('**/js/unified-library-ui.js*', route => {
        const original = fs.readFileSync(path.join(root, 'js/unified-library-ui.js'), 'utf8');
        const anchor = 'const acceptedAssets = new Map();';
        assert.equal(original.split(anchor).length - 1, 1, 'Exactly one actual accepted-assets observation boundary');
        const observed = anchor + ` window.__smokeLibrarySnapshot = () => ({
          accepted: [...acceptedAssets].map(([id, entry]) => ({id,kind:entry.result?.kind,materialized:!!entry.materialized,dataPrefix:String(entry.materialized?.dataUrl || entry.materialized?.src || '').slice(0,64)})),
          actionBusy, actionRevision, selectedId, overlayHidden:overlay.hidden,
        });`;
        return route.fulfill({contentType:'text/javascript',body:original.replace(anchor, observed)});
      });
      await page.goto(`${origin}/preview/${suffix}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction((expectedMode) => document.documentElement.dataset.mode === expectedMode, mode);
      const dismiss = page.locator('.tut-welcome-overlay .tut-banner-no');
      if (await dismiss.isVisible()) await dismiss.click();

      if (await page.locator('#ai-image-panel').isHidden()) await page.locator('#ai-image-install-open').click();
      await page.locator('#ai-image-panel').waitFor({ state: 'visible' });
      const panel = page.locator('#ai-image-panel:visible');
      let libraryAction = null;
      await panel.locator('[data-ai-tab-list] .ai-task-tab:not(.ai-task-add) .ai-task-tab-select').waitFor({ state: 'visible' });
      await panel.locator('[data-ai-task-add]').waitFor({ state: 'visible' });
      await transferCurrentLibraryReference(page, panel, mode, errors);
      libraryAction = await page.evaluate(() => ({
        results: document.querySelectorAll('[data-result-id]').length,
        selected: document.querySelector('[data-result-id][aria-selected="true"]')?.dataset.resultId || null,
        references: document.querySelectorAll('#ai-image-panel [data-ai-reference-id]').length,
        tasks: document.querySelectorAll('#ai-image-panel [data-ai-tab-list] .ai-task-tab:not(.ai-task-add)').length,
      }));
      await page.locator('[data-unilib-close]').waitFor({ state: 'hidden' });

      if (await page.locator('#ai-image-panel').isHidden()) await page.locator('#ai-image-install-open').click();
      await page.locator('#ai-image-panel').waitFor({ state: 'visible' });
      await waitForAnimations(page, '#ai-image-panel');
      const initial = await contract(page);
      assert.deepEqual(initial, { exitCode: 0, missing: [] });
      const oldChecks = await page.evaluate(() => ({
        legacyLibraryCards: Boolean(document.querySelector('.examlib-card, .partslib-card')),
        legacyLibraryTransferReady: Boolean(document.querySelector('.examlib-card, .partslib-card')) &&
          Boolean(document.querySelector('#examlib-ai, #partslib-ai')),
        retiredTaskAdd: Boolean(document.querySelector('[data-ai-tab-new]')),
        retiredBatch: Boolean(document.querySelector('[data-ai-batch], [data-ai-batch-panel]')),
      }));
      assert.deepEqual(oldChecks, { legacyLibraryCards: false, legacyLibraryTransferReady: false, retiredTaskAdd: false, retiredBatch: false });

      const original = await panel.locator('[data-ai-tab-list] .ai-task-tab.is-on').getAttribute('data-tab-id');
      assert.ok(original, 'current library task id exists');
      await panel.locator('[data-ai-reference-id]').first().waitFor({ state: 'attached' });
      const expectedReferences = await panel.locator('[data-ai-reference-id]').count();
      assert.equal(expectedReferences, 1, 'the current source transfer creates one reference in its task');
      assert.equal(await panel.locator('.ai-reference-section[open]').count(), 1, 'references are expanded after current transfer');
      const sourceChoices = panel.locator('.ai-source-treatment');
      if (!await sourceChoices.evaluate(node => node.open)) await sourceChoices.locator('summary').click();
      await panel.locator('[data-ai-setting-key="kind"] [data-ai-setting-value="general"]').click();
      await panel.locator('[data-ai-setting-key="labels"] [data-ai-setting-value="remove"]').click();
      traceLibrary('fixture-send-click', { mode });
      // 이미지 작업에서는 준비 칸의 보내기 단추를 숨기고(10-16 83201a54) 「변환하기」([data-ai-comments-apply])가 같은 보내기를 부른다.
      const send = panel.locator('[data-ai-send]');
      await (await send.isVisible() ? send : panel.locator('[data-ai-comments-apply]')).click();
      await page.waitForFunction(() => document.querySelectorAll('#ai-image-panel .ai-generated-card').length === 1, undefined, { timeout: 15_000 });
      // First candidate registration precedes the actual review and busy-state settlement.
      // Observe the real completion before hit-testing or editing its visible surface.
      await page.evaluate(() => new Promise((resolve, reject) => {
        const panel = document.querySelector('#ai-image-panel'); let timer;
        const finish = () => {
          if (panel.dataset.aiBusy !== 'false') return;
          observer.disconnect(); clearTimeout(timer); resolve();
        };
        const observer = new MutationObserver(finish);
        observer.observe(panel, { attributes: true, attributeFilter: ['data-ai-busy'] });
        timer = setTimeout(() => { observer.disconnect(); reject(new Error('Actual smoke workflow completion deadline')); }, 15000);
        finish();
      }));
      assert.deepEqual(transport.stages, ['source-observation', 'image-generation', 'full-review'],
        'Area editing begins only after the actual complete modern workflow');
      const expectedResults = 1;
      traceLibrary('fixture-send-observed', { mode, sends: transport.sends.length, events: transport.delivered.size });
      const generatedImage = panel.locator('.ai-generated-card .ai-preview-stage img').first();
      await generatedImage.waitFor({ state: 'visible', timeout: 15_000 });
      if (mode === 'pro') await clickCompare(panel, '[data-ai-layout-mode="side-by-side"]');
      await page.waitForFunction(() => document.querySelector('#ai-image-panel')?.dataset.aiLayout === 'side-by-side');
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const geometry = await (await page.waitForFunction(() => {
        const panel = document.querySelector('#ai-image-panel:not([hidden])');
        const source = panel?.querySelector('.ai-original-pane .ai-reference-card img');
        const result = panel?.querySelector('.ai-result-pane .ai-generated-card .ai-preview-stage img');
        const stage = result?.closest('.ai-preview-stage');
        const visibleImage = (node) => { const rect = node?.getBoundingClientRect(); return Boolean(node?.naturalWidth && rect && rect.width > 0 && rect.height > 0); };
        const stageRect = stage?.getBoundingClientRect();
        if (!visibleImage(source) || !visibleImage(result) || !stageRect || stageRect.width <= 0 || stageRect.height <= 0) return null;
        const resultBox = result.getBoundingClientRect();
        const points = [[.25, .25], [.65, .60]].map(([x, y]) => ({ x: resultBox.left + resultBox.width * x, y: resultBox.top + resultBox.height * y }));
        const target = (point) => { const node = document.elementFromPoint(point.x, point.y); return { tag: node?.tagName || null, className: node?.className || null,
          inResultImage: node === result, inResultStage: node === stage || stage.contains(node) }; };
        return { resultBox: resultBox.toJSON(), stageBox: stage.getBoundingClientRect().toJSON(), sourceBox: source.getBoundingClientRect().toJSON(),
          layout: panel.dataset.aiLayout, scroll: { panel: panel.scrollTop, stage: stage.scrollTop, stageLeft: stage.scrollLeft }, points, targets: points.map(target) };
      }, undefined, { timeout: 10_000 })).jsonValue();
      assert.ok(geometry.targets.every((target) => target.inResultImage || target.inResultStage),
        `current area-comment drag must hit the rendered result surface: ${JSON.stringify(geometry)}`);
      traceLibrary('area-comment-geometry', { mode, ...geometry });
      await panel.locator('[data-ai-comment-tool="area"]').click();
      await page.mouse.move(geometry.points[0].x, geometry.points[0].y);
      await page.mouse.down();
      await page.mouse.move(geometry.points[1].x, geometry.points[1].y, { steps: 6 });
      await page.mouse.up();
      await panel.locator('[data-ai-comment-row]').waitFor({ state: 'visible', timeout: 2_000 });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.waitForFunction(() => {
        return Array.from(document.querySelectorAll('#ai-image-panel .ai-result-pane .ai-comment-region'))
          .some((region) => { const bounds = region.getBoundingClientRect(); return bounds.width > 0 && bounds.height > 0; });
      }, undefined, { timeout: 2_000 });
      const normalizedRegion = async () => {
        const [regionBox, imageBox] = await Promise.all([
          page.evaluate(() => {
            const region = Array.from(document.querySelectorAll('#ai-image-panel .ai-result-pane .ai-comment-region'))
              .find((node) => { const bounds = node.getBoundingClientRect(); return bounds.width > 0 && bounds.height > 0; });
            return region?.getBoundingClientRect().toJSON() || null;
          }),
          generatedImage.boundingBox(),
        ]);
        assert.ok(regionBox && imageBox?.width && imageBox.height,
          `current comment region and generated image have rendered geometry: ${JSON.stringify({ regionBox, imageBox })}`);
        return { x: (regionBox.x - imageBox.x) / imageBox.width, y: (regionBox.y - imageBox.y) / imageBox.height,
          w: regionBox.width / imageBox.width, h: regionBox.height / imageBox.height };
      };
      const beforeZoom = await normalizedRegion();
      if (mode === 'pro') {
        await panel.locator('[data-ai-zoom-action="in"]').click();
        const afterZoom = await normalizedRegion();
        assert.ok(['x', 'y', 'w', 'h'].every((key) => Math.abs(beforeZoom[key] - afterZoom[key]) < 0.002),
          'current comment region keeps normalized geometry through zoom');
      } else {
        const liteZoom = await panel.locator('.ai-pane-zoom').evaluate((container) => ({
          display: getComputedStyle(container).display,
          width: container.getBoundingClientRect().width,
          height: container.getBoundingClientRect().height,
        }));
        assert.deepEqual(liteZoom, { display: 'none', width: 0, height: 0 },
          'Lite intentionally hides the shared zoom-control container while retaining public area comments');
        traceLibrary('lite-zoom-hidden', liteZoom);
      }
      const comparison = await page.evaluate(() => {
        const panel = document.querySelector('#ai-image-panel:not([hidden])');
        const visible = (selector) => { const rect = panel?.querySelector(selector)?.getBoundingClientRect(); return Boolean(rect && rect.width > 0 && rect.height > 0); };
        return { layout: panel?.dataset.aiLayout, sourceVisible: visible('.ai-original-pane .ai-reference-card'),
          resultVisible: visible('.ai-result-pane .ai-generated-card'),
          // 슬라이더 비교는 「비교 ▾」 메뉴 안(e704e45e): 메뉴가 보이고 단추가 숨김 상태가 아니면 쓸 수 있다.
          compareVisible: visible('.ai-compare-menu > summary') && panel.querySelector('[data-ai-compare]')?.hidden === false };
      });
      traceLibrary('comparison-controls', { engine: engine.name(), mode, ...comparison });
      await page.screenshot({ path: path.join(evidenceDir, `${engine.name()}-${mode}-comparison-controls.png`), fullPage: true });
      assert.deepEqual(comparison, { layout: 'side-by-side', sourceVisible: true, resultVisible: true, compareVisible: true });
      const referenceId = await panel.locator('[data-ai-reference-id]').first().getAttribute('data-ai-reference-id');
      const selectedRevisionId = await panel.locator('[data-ai-candidate-option][aria-selected="true"]').getAttribute('data-ai-candidate-option');
      const originalSource = await panel.locator('.ai-original-pane .ai-reference-card img').first().getAttribute('src');
      assert.ok(referenceId && selectedRevisionId && originalSource, 'comparison has an identified original and selected revision');
      assert.equal(await panel.locator('.ai-generated-card').getAttribute('data-ai-candidate-id'), selectedRevisionId,
        'the rendered result is the selected revision');
      const selectedDisplaySource = await generatedImage.getAttribute('src');
      if (mode === 'pro') {
        assert.equal(selectedDisplaySource, generatedFixtureDataUrl, 'Pro displays the unprocessed generated PNG bytes');
      } else {
        const display = await generatedImage.evaluate(image => {
          const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let ink = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i + 3] === 0) continue;
            if (pixels[i] < 255) ink++;
          }
          return { width: canvas.width, height: canvas.height, ink };
        });
        assert.equal(display.width, 1005); assert.equal(display.height, 399);
        assert.ok(display.ink > 100, 'the rendered diagram remains visible');
      }
      const readRawPersistence = () => page.evaluate(async ({ taskId, candidateId, source }) => {
        const databases = await indexedDB.databases();
        const results = [];
        for (const { name } of databases.filter(entry => entry.name.includes('5e-ai-image-tasks'))) {
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open(name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
          });
          try {
            const snapshot = await new Promise((resolve, reject) => {
              const request = db.transaction('tasks', 'readonly').objectStore('tasks').get('workspace');
              request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
            });
            const candidate = snapshot?.tabs?.find(tab => tab.id === taskId)?.generated?.find(item => item.id === candidateId);
            results.push({ name, tabIds: snapshot?.tabs?.map(tab => tab.id), candidateId: candidate?.id, bytes: candidate?.data?.length, matches: candidate?.data === source });
          } finally { db.close(); }
        }
        return results;
      }, { taskId: original, candidateId: selectedRevisionId, source: generatedFixtureDataUrl });
      let rawPersistence = [];
      for (let attempt = 0; attempt < 50; attempt++) {
        rawPersistence = await readRawPersistence();
        if (rawPersistence.some(result => result.matches)) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      traceLibrary('raw-persistence', { mode, engine: engine.name(), results: rawPersistence });
      assert.ok(rawPersistence.some(result => result.matches), 'original generated PNG bytes survive persistence independently from Lite display processing');
      await clickCompare(panel);
      const comparisonDialog = panel.locator('.ai-inline-comparison .ai-comparison');
      await comparisonDialog.waitFor({ state: 'visible' });
      await page.waitForFunction(() => ['left', 'right'].every((side) => {
        const image = document.querySelector(`.ai-comparison-${side} image`);
        return image?.getAttribute('href') && Number(image.getAttribute('width')) > 0 && Number(image.getAttribute('height')) > 0;
      }));
      assert.equal(await comparisonDialog.getByLabel('왼쪽 비교 버전', { exact: true }).inputValue(), referenceId,
        'comparison defaults its left side to the original reference');
      assert.equal(await comparisonDialog.getByLabel('오른쪽 비교 버전', { exact: true }).inputValue(), selectedRevisionId,
        'comparison defaults its right side to the selected revision');
      assert.equal(await comparisonDialog.locator('.ai-comparison-left image').getAttribute('href'), originalSource,
        'the comparison left side displays the original image content');
      assert.equal(await comparisonDialog.locator('.ai-comparison-right image').getAttribute('href'), selectedDisplaySource,
        'the comparison right side displays the selected generated content');
      await page.screenshot({ path: path.join(evidenceDir, `${engine.name()}-${mode}-comparison.png`), fullPage: true });
      await clickCompare(panel);
      await comparisonDialog.waitFor({ state: 'detached' });
      const tasksBeforeFileAdd = await panel.locator('[data-ai-tab-list] .ai-task-tab:not(.ai-task-add)').count();
      await panel.locator('[data-ai-source-file]').setInputFiles(fixture);
      await page.waitForFunction(({ oldId, tasksBefore }) => {
        const activePanel = document.querySelector('#ai-image-panel:not([hidden])');
        return activePanel?.querySelectorAll('[data-ai-tab-list] .ai-task-tab:not(.ai-task-add)').length === tasksBefore + 1 &&
          activePanel.querySelector('[data-ai-tab-list] .ai-task-tab.is-on')?.dataset.tabId !== oldId;
      }, { oldId: original, tasksBefore: tasksBeforeFileAdd });
      assert.equal(await panel.locator('[data-ai-reference-id]').count(), expectedReferences,
        'a second file starts an isolated task instead of appending to the library reference task');
      assert.equal(await panel.locator('.ai-generated-card').count(), 0,
        'the isolated file task does not inherit the prior generated result');
      await panel.locator(`[data-tab-id="${original}"] .ai-task-tab-select`).click();
      await waitForTaskRevision(page, original, selectedRevisionId, referenceId);
      assert.equal(await panel.locator('.ai-generated-card').count(), expectedResults,
        'returning to the original task restores its generated result');

      await page.screenshot({ path: path.join(evidenceDir, `${engine.name()}-${mode}-workspace.png`), fullPage: true });
      await panel.locator('[data-ai-close]').click();
      await page.locator('#ai-image-panel').waitFor({ state: 'hidden' });
      if (await page.locator('#ai-image-panel').isHidden()) await page.locator('#ai-image-install-open').click();
      await page.locator('#ai-image-panel').waitFor({ state: 'visible' });
      await waitForTaskRevision(page, original, selectedRevisionId, referenceId);
      assert.equal(await panel.locator('[data-ai-reference-id]').count(), expectedReferences,
        'reopened workspace restores its own reference count');
      assert.equal(await panel.locator('.ai-generated-card').count(), expectedResults,
        'reopened workspace restores its own generated result');

      const mutation = await page.evaluate(() => {
        const panel = document.querySelector('#ai-image-panel:not([hidden])');
        panel?.querySelectorAll('[data-ai-source-file]').forEach((node) => node.remove());
        const missing = [['workspace-file-source', panel?.querySelector('[data-ai-source-file]')]]
          .filter(([, node]) => !node).map(([name]) => name);
        return { exitCode: missing.length ? 1 : 0, missing };
      });
      assert.deepEqual(mutation, { exitCode: 1, missing: ['workspace-file-source'] });
      const counts = { bridgeSends: transport.sends.length, bridgeEventBatches: transport.delivered.size, generationSends: transport.stages.filter(stage => stage === 'image-generation').length, stages: transport.stages, endpoints: transport.endpoints };
      assert.equal(counts.generationSends, 1, 'The deterministic local UI bridge receives exactly one image generation');
      assert.equal(counts.bridgeSends, 3, 'The current conversion also observes its source and reviews its output');
      assert.equal(counts.bridgeEventBatches, 3, 'Every actual correlated observer, image and review response is accounted for');
      assert.deepEqual(counts.stages, ['source-observation', 'image-generation', 'full-review']);
      assert.deepEqual(errors, []);
      report.engines.push({ engine: engine.name(), mode, approvedAssertions: true, oldChecks, libraryAction, comparison,
        comparisonDialog: { referenceId, selectedRevisionId, originalContentMatches: true, generatedContentMatches: true }, mutation, counts, errors });
      await browserContext.close();
    }
  }
  fs.writeFileSync(path.join(evidenceDir, 'smoke-contract-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
});
