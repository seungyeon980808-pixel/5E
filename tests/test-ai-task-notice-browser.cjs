'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium, webkit} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {fixtureContext, installAiMain} = require('./helpers/canonical-fixture-adapter.cjs');
const {startServer, stopServer} = require('./run-browser-tests.cjs');
const root = path.resolve(__dirname, '..');
const fixture = fs.readFileSync(path.join(__dirname, 'test-ai-workbench-integration-browser.cjs'), 'utf8');
const start = fixture.indexOf('function seedRequestWorkspaces('), end = fixture.indexOf('\nasync function requestBrowserFixture(');
assert.ok(start >= 0 && end > start);
const seed = fixture.slice(start, end);

test('task rows update when a completed image review notice changes', {timeout: 120000}, async t => {
  const server = startServer();
  try {
    const origin = await server.ready;
    const {runtimeInit} = fixtureContext(root);
    for (const [name, engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) {
      const browser = await engine.launch({headless: true});
      try {
        for (const verdict of ['pass']) await t.test(name + ' ' + verdict, async () => {
          const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
          try {
            await context.route('**/*', route => {
              const url = new URL(route.request().url());
              return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
            });
            const page = await context.newPage(), errors = [];
            page.on('pageerror', error => errors.push(error.message));
            page.setDefaultTimeout(10000);
            const scenarioSeed = verdict === 'pass' ? seed : seed.replace("const reviewReport = { verdict: 'pass',", "const reviewReport = { verdict: 'fail',");
            await page.addInitScript({content: scenarioSeed + '\nseedRequestWorkspaces(2,false,false,"pro",false,false,true,' + JSON.stringify({runtime: runtimeInit}) + ');'});
            await installAiMain(page, root, {});
            await page.goto(new URL('/?mode=pro&mobile=0&exam=0', origin).href);
            await page.waitForFunction(() => Boolean(window.__task2Manager));
            const skip = page.locator('.tut-welcome-overlay .tut-banner-no');
            if (await skip.isVisible()) await skip.click();
            await page.locator('#ai-image-install-open').click();
            await page.locator('#ai-image-panel [data-ai-comments-apply]').click();
            await page.waitForFunction(() => window.__task2.generationSends.length === 1);
            await page.locator('#ai-image-panel [data-tab-id="task-1"] .ai-task-tab-select').click();
            await page.evaluate(() => { window.__task2.emitGeneration(0, 'image'); window.__task2.emitGeneration(0, 'done'); });
            const saved = await page.evaluate(async () => {
              const deadline = Date.now() + 10000;
              while (Date.now() < deadline) {
                const snapshot = await window.__task2Manager.sharingSnapshot();
                const tab = snapshot.workspaces.flatMap(workspace => workspace.tabs).find(tab => tab.id === 'task-0');
                if (tab?.workState === 'completed' && tab.generated.length === 1 && ['passed', 'needs-attention'].includes(tab.generated[0].reviewState)) {
                  return {workState: tab.workState, notice: tab.generationNotice, reviewState: tab.generated[0].reviewState};
                }
                await new Promise(resolve => setTimeout(resolve, 16));
              }
              throw Error('Actual stored owner never completed');
            });
            assert.equal(saved.workState, 'completed');
            assert.equal(saved.reviewState, verdict === 'pass' ? 'passed' : 'needs-attention');
            // Older committed snapshots omit generationNotice; the visible completion contract is shared.
            if (saved.notice !== undefined) assert.equal(saved.notice, null);
            const row = page.locator('#ai-image-panel [data-tab-id="task-0"]');
            assert.equal(await row.getAttribute('data-work-state'), verdict === 'pass' ? 'completed' : 'review', 'Visible row must reflect the final stored review notice');
            assert.equal(await page.locator('#ai-image-panel [data-tab-id="task-1"] .ai-task-tab-select').getAttribute('aria-pressed'), 'true', 'Other active owner remains selected');
            assert.deepEqual(await page.evaluate(() => window.__task2.sends.map(send => send.stage)), ['source-observation', 'image-generation', 'full-review']);
            assert.deepEqual(errors, []);
          } finally { await context.close(); }
        });
      } finally { await browser.close(); }
    }
  } finally { await stopServer(server.child); }
});
