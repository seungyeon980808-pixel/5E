const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const evidenceDir = path.resolve(process.env.EVIDENCE_DIR || '.omo/evidence/smoke-contract-browser');
const fixture = path.join(root, 'tests/fixtures/rights-clear-smoke.png');
const generatedFixtureDataUrl = `data:image/png;base64,${fs.readFileSync(fixture).toString('base64')}`;

function traceLibrary(step, detail = {}) {
  fs.appendFileSync(path.join(evidenceDir, 'library-trace.ndjson'), `${JSON.stringify({ step, at: new Date().toISOString(), ...detail })}\n`);
}

async function transferCurrentLibraryReference(page, panel, mode) {
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
  await page.locator('[data-unilib-crop-workbench]:not([disabled])').click();
  traceLibrary('current-crop-added-to-workbench');
  await page.locator('[data-unilib-ai]:not([disabled])').click();
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
  const transport = { sends: [], delivered: new Set(), endpoints: [] };
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
      model: 'gpt-5.6-sol', displayName: 'Controlled smoke fixture', supportedReasoningEfforts: ['medium', 'high'],
      defaultReasoningEffort: 'medium', serviceTiers: ['priority'], defaultServiceTier: 'priority',
    }] };
    else if (endpoint === 'bridge-account') response = { account: { name: 'Local fixture' }, limits: {} };
    else if (endpoint === 'bridge-send') {
      transport.sends.push(request);
      response = { turnId: `smoke-turn-${transport.sends.length}`, renderThreadId: `smoke-render-${transport.sends.length}` };
    } else if (endpoint === 'bridge-events') {
      const index = transport.sends.length;
      const events = [];
      if (index && !transport.delivered.has(index)) {
        transport.delivered.add(index);
        const clientScope = transport.sends.at(-1).clientScope || '';
        events.push(
          { clientScope, method: 'item/completed', params: { turnId: `smoke-turn-${index}`, item: { type: 'imageGeneration', imageDataUrl: generatedFixtureDataUrl } } },
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

test('TPK-005: current library and task workspace smoke contract has real controls and rejects missing controls', async (context) => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const server = await startServer();
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const report = { invocation: 'node --test tests/test-smoke-contract-browser.cjs', engines: [], errors: [] };

  const engines = process.env.SMOKE_ENGINES === 'chromium' ? [chromium] : process.env.SMOKE_ENGINES === 'webkit' ? [webkit] : [chromium, webkit];
  const modes = process.env.SMOKE_MODES === 'lite' ? ['lite'] : process.env.SMOKE_MODES === 'pro' ? ['pro'] : ['pro', 'lite'];
  for (const engine of engines) {
    const browser = await engine.launch({ headless: true });
    context.after(() => browser.close());
    for (const mode of modes) {
      const browserContext = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const transport = await installDesktopStub(browserContext);
      const page = await browserContext.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const suffix = `?mode=${mode}`;
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
      await transferCurrentLibraryReference(page, panel, mode);
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
      traceLibrary('fixture-send-click', { mode });
      await panel.locator('[data-ai-send]').click();
      await page.waitForFunction(() => document.querySelectorAll('#ai-image-panel .ai-generated-card').length === 1, undefined, { timeout: 15_000 });
      const expectedResults = 1;
      traceLibrary('fixture-send-observed', { mode, sends: transport.sends.length, events: transport.delivered.size });
      const generatedImage = panel.locator('.ai-generated-card .ai-preview-stage img').first();
      await generatedImage.waitFor({ state: 'visible', timeout: 15_000 });
      if (mode === 'pro') await panel.locator('[data-ai-layout-mode="side-by-side"]').click();
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
          resultVisible: visible('.ai-result-pane .ai-generated-card'), legacyModalHidden: Boolean(panel?.querySelector('[data-ai-compare]')?.hidden) };
      });
      assert.deepEqual(comparison, { layout: 'side-by-side', sourceVisible: true, resultVisible: true, legacyModalHidden: true });
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
      await panel.locator('[data-ai-reference-id]').first().waitFor({ state: 'attached' });
      assert.equal(await panel.locator('.ai-generated-card').count(), expectedResults,
        'returning to the original task restores its generated result');

      await page.screenshot({ path: path.join(evidenceDir, `${engine.name()}-${mode}-workspace.png`), fullPage: true });
      await panel.locator('[data-ai-close]').click();
      await page.locator('#ai-image-panel').waitFor({ state: 'hidden' });
      if (await page.locator('#ai-image-panel').isHidden()) await page.locator('#ai-image-install-open').click();
      await page.locator('#ai-image-panel').waitFor({ state: 'visible' });
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
      const counts = { bridgeSends: transport.sends.length, bridgeEventBatches: transport.delivered.size, endpoints: transport.endpoints };
      assert.equal(counts.bridgeSends, 1, 'the deterministic local UI bridge receives exactly one send');
      assert.equal(counts.bridgeEventBatches, 1, 'the deterministic local UI bridge supplies exactly one result batch');
      assert.deepEqual(errors, []);
      report.engines.push({ engine: engine.name(), mode, approvedAssertions: true, oldChecks, libraryAction, comparison, mutation, counts, errors });
      await browserContext.close();
    }
  }
  fs.writeFileSync(path.join(evidenceDir, 'smoke-contract-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
});
