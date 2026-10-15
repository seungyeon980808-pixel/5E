'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const { fixtureContext, installAiMain } = require('./helpers/canonical-fixture-adapter.cjs');
const { startServer, stopServer } = require('./run-browser-tests.cjs');
const fixtureSource = fs.readFileSync(path.join(__dirname, 'test-ai-workbench-integration-browser.cjs'), 'utf8');
const seedStart = fixtureSource.indexOf('function seedRequestWorkspaces(');
const seedEnd = fixtureSource.indexOf('\nasync function requestBrowserFixture(');
assert.ok(seedStart >= 0 && seedEnd > seedStart);
const seed = fixtureSource.slice(seedStart, seedEnd);

test('conversation storage failures preserve the draft and allow an explicit retry', { timeout: 120000 }, async t => {
  const server = startServer();
  try {
    const origin = await server.ready;
    const { runtimeInit } = fixtureContext(root);
    for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
      const browser = await engine.launch({ headless: true });
      try {
        for (const fault of ['QuotaExceededError', 'SecurityError']) {
          await t.test(`${engineName} ${fault}`, async () => {
            const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
            const errors = [];
            try {
              await context.route('**/*', route => {
                const url = new URL(route.request().url());
                return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
              });
              const page = await context.newPage();
              page.setDefaultTimeout(10000);
              page.on('pageerror', error => errors.push(error.message));
              await page.addInitScript({ content: seed + '\nseedRequestWorkspaces(1,false,false,"pro",false,false,true,' + JSON.stringify({ runtime: runtimeInit }) + ');' });
              await installAiMain(page, root, {});
              await page.goto(new URL('/?mode=pro&mobile=0&exam=0', origin).href);
              await page.waitForFunction(() => Boolean(window.__task2Manager));
              const skip = page.locator('.tut-welcome-overlay .tut-banner-no');
              if (await skip.isVisible()) await skip.click();
              await page.locator('#ai-image-install-open').click();
              await page.locator('#ai-image-panel [data-ai-side-tab="chat"]').click();
              const input = page.locator('#ai-image-panel [data-ai-chat-input]');
              const draft = `Preserve this conversation draft: ${fault}`;
              await input.fill(draft);
              await page.clock.install();
              await page.evaluate(fault => {
                const original = Storage.prototype.setItem;
                window.__restoreConversationStorage = () => { Storage.prototype.setItem = original; };
                Storage.prototype.setItem = function (key, value) {
                  if (key.includes('aiConversationMessages')) throw new DOMException('Conversation persistence blocked', fault);
                  return original.call(this, key, value);
                };
              }, fault);
              await page.locator('#ai-image-panel [data-ai-chat-send]').click();
              await page.waitForFunction(() => /대화를 저장하지 못했습니다/.test(document.querySelector('#ai-image-panel [data-ai-status]').textContent));
              assert.equal(await input.inputValue(), draft);
              assert.equal(await page.locator('#ai-image-panel').getAttribute('data-ai-busy'), 'false');
              assert.equal(await page.evaluate(() => window.__task2.sends.length), 0);
              await page.clock.fastForward(180000);
              assert.equal(await input.inputValue(), draft);
              assert.doesNotMatch(await page.locator('#ai-image-panel [data-ai-status]').textContent(), /응답 시간이 초과/);
              assert.equal(await page.evaluate(() => window.__task2.sends.length), 0);
              await page.evaluate(() => window.__restoreConversationStorage());
              await page.locator('#ai-image-panel [data-ai-chat-send]').click();
              await page.waitForFunction(() => window.__task2.sends.length === 1);
              assert.equal(await input.inputValue(), '');
              const snapshot = await page.evaluate(async () => window.__task2Manager.sharingSnapshot());
              assert(snapshot.workspaces.flatMap(workspace => workspace.tabs).some(tab => tab.conversationMessages.some(message => message.role === 'user' && message.text === draft)));
              assert.deepEqual(errors, []);
            } finally { await context.close(); }
          });
        }
      } finally { await browser.close(); }
    }
  } finally { await stopServer(server.child); }
});
