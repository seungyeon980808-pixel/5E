const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const evidenceDir = path.resolve(process.env.EVIDENCE_DIR || '.omo/evidence/smoke-contract-browser');
const fixture = path.join(root, 'preview/assets/exam-library/images/p1_2027_06_01.png');

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
  await context.addInitScript(() => {
    localStorage.setItem('5e.tutorial.bannerSeen', 'true');
    localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
    localStorage.setItem('5e.preview:5e.desktopHandoff.v1', JSON.stringify({ dismissed: true, remindUntil: 0, installStarted: false }));
    const listeners = new Set();
    let modelCatalogCalls = 0;
    let paidAiCalls = 0;
    window.__smokeContractCounts = () => ({ modelCatalogCalls, paidAiCalls });
    window.fiveEDesktop = {
      web: true,
      status: async () => ({ login: { loggedIn: true }, server: true }),
      start: async () => ({ ok: true }), stop: async () => ({ ok: true }),
      models: async () => {
        modelCatalogCalls += 1;
        return { data: [{ model: 'local-contract', displayName: 'Local contract', isDefault: true, supportedReasoningEfforts: ['low'] }] };
      },
      account: async () => ({ account: { name: 'smoke' }, limits: {} }),
      send: async () => { paidAiCalls += 1; return { turnId: 'forbidden', threadId: 'forbidden' }; },
      interrupt: async () => ({ ok: true }),
      onEvent: (callback) => { listeners.add(callback); return () => listeners.delete(callback); },
      onState: () => () => {}, onLog: () => () => {},
      setAiTaskShortcutActive: () => {}, onAiCloseTaskShortcut: () => () => {},
    };
  });
}

async function waitForAnimations(page, selector) {
  await page.locator(selector).evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {})));
  });
}

async function contract(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('#ai-image-panel:not([hidden])');
    const requirements = [
      ['workspace-tab-list', panel?.querySelector('[data-ai-tab-list]')],
      ['workspace-add-control', panel?.querySelector('[data-ai-task-add]')],
      ['workspace-input', panel?.querySelector('[data-ai-input]')],
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

  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    context.after(() => browser.close());
    for (const mode of ['pro', 'lite']) {
      const browserContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await installDesktopStub(browserContext);
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
      await panel.locator('[data-ai-tab-list] .ai-task-tab:not(.ai-task-add) .ai-task-tab-select').waitFor({ state: 'visible' });
      await panel.locator('[data-ai-task-add]').waitFor({ state: 'visible' });
      if (mode === 'lite') {
        await page.locator('.lite-ai-source-actions').getByRole('button', { name: '라이브러리', exact: true }).click();
        await page.locator('[data-unilib-close]').waitFor({ state: 'visible' });
        await waitForAnimations(page, '[data-unilib-close]');
        await page.locator('[data-unilib-close]').click();
        await page.locator('[data-unilib-close]').waitFor({ state: 'hidden' });
      }

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

      const original = await panel.locator('[data-ai-tab-list] .ai-task-tab:not(.ai-task-add)').first().getAttribute('data-tab-id');
      assert.ok(original, 'initial task id exists');
      await panel.locator('[data-ai-source-file]').first().setInputFiles(fixture);
      await panel.locator('[data-ai-reference-id]').first().waitFor({ state: 'attached' });
      await panel.locator('[data-ai-task-add]').click();
      await page.waitForFunction((oldId) => {
        const activePanel = document.querySelector('#ai-image-panel:not([hidden])');
        return activePanel?.querySelectorAll('[data-ai-tab-list] .ai-task-tab:not(.ai-task-add)').length >= 2 &&
          activePanel.querySelector('[data-ai-tab-list] .ai-task-tab.is-on')?.dataset.tabId !== oldId;
      }, original);
      assert.equal(await panel.locator('[data-ai-reference-id]').count(), 0, 'new workspace starts without the prior reference');
      await panel.locator(`[data-tab-id="${original}"] .ai-task-tab-select`).click();
      await panel.locator('[data-ai-reference-id]').first().waitFor({ state: 'attached' });

      await page.screenshot({ path: path.join(evidenceDir, `${engine.name()}-${mode}-workspace.png`), fullPage: true });
      await panel.locator('[data-ai-close]').click();
      await page.locator('#ai-image-panel').waitFor({ state: 'hidden' });
      if (await page.locator('#ai-image-panel').isHidden()) await page.locator('#ai-image-install-open').click();
      await page.locator('#ai-image-panel').waitFor({ state: 'visible' });
      assert.equal(await panel.locator('[data-ai-reference-id]').count(), 1, 'reopened workspace restores only its reference');

      const mutation = await page.evaluate(() => {
        document.querySelector('[data-ai-task-add]')?.remove();
        const panel = document.querySelector('#ai-image-panel:not([hidden])');
        const missing = [['workspace-add-control', panel?.querySelector('[data-ai-task-add]')]]
          .filter(([, node]) => !node).map(([name]) => name);
        return { exitCode: missing.length ? 1 : 0, missing };
      });
      assert.deepEqual(mutation, { exitCode: 1, missing: ['workspace-add-control'] });
      const counts = await page.evaluate(() => window.__smokeContractCounts());
      assert.equal(counts.paidAiCalls, 0);
      assert.deepEqual(errors, []);
      report.engines.push({ engine: engine.name(), mode, approvedAssertions: true, oldChecks, mutation, counts, errors });
      await browserContext.close();
    }
  }
  fs.writeFileSync(path.join(evidenceDir, 'smoke-contract-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
});
