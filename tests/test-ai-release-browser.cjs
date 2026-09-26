const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const playwrightPath = process.env.PLAYWRIGHT_MODULE
  || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = require(playwrightPath);
const root = path.resolve(__dirname, '..');
const evidenceDir = process.env.TASK6_EVIDENCE || path.join(root, '.omo/evidence/task6');

const contentTypes = {
  '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.mjs': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};

function staticServer() {
  return http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const target = path.resolve(root, `.${pathname === '/' ? '/preview/' : pathname}`);
    if (!target.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    fs.stat(target, (statError, stat) => {
      const file = !statError && stat.isDirectory() ? path.join(target, 'index.html') : target;
      fs.readFile(file, (error, bytes) => {
        if (error) { response.writeHead(404).end(); return; }
        response.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream',
        });
        response.end(bytes);
      });
    });
  });
}

test('Task 6 browser flow binds preflight, insertion, and default share to the active task', async (context) => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const server = staticServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  context.after(() => browser.close());
  const browserContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    recordVideo: { dir: evidenceDir, size: { width: 1280, height: 900 } },
  });
  const page = await browserContext.newPage();
  const video = page.video();
  await page.addInitScript(() => {
    localStorage.setItem('5e.tutorial.bannerSeen', 'true');
    const eventListeners = new Set();
    const stateListeners = new Set();
    let delayedStatus = null;
    let sendCount = 0;
    let statusCount = 0;
    let lastScope = '';
    const subscribe = (set, callback) => { set.add(callback); return () => set.delete(callback); };
    window.__task6Mock = {
      delayStatus() {
        delayedStatus = {};
        delayedStatus.promise = new Promise((resolve) => { delayedStatus.resolve = resolve; });
      },
      releaseStatus() {
        delayedStatus?.resolve({ login: { loggedIn: true }, server: true });
        delayedStatus = null;
      },
      counts: () => ({ sendCount, statusCount }),
      emitEvent(message) {
        for (const listener of eventListeners) listener({ clientScope: lastScope, ...message });
      },
      delayImages() {
        const NativeImage = window.Image;
        const pending = [];
        window.Image = class {
          naturalWidth = 32;
          naturalHeight = 32;
          set src(value) { this.currentSrc = value; pending.push(this); }
        };
        return () => {
          window.Image = NativeImage;
          for (const image of pending.splice(0)) image.onload?.();
        };
      },
    };
    window.fiveEDesktop = {
      web: true,
      status: async () => {
        statusCount += 1;
        return delayedStatus ? delayedStatus.promise : { login: { loggedIn: true }, server: true };
      },
      start: async () => ({ ok: true }),
      stop: async () => ({ ok: true }),
      models: async () => ({ data: [{ model: 'gpt-5.6-sol', displayName: 'Sol', isDefault: true,
        supportedReasoningEfforts: ['low', 'medium', 'high'], serviceTiers: ['priority'] }] }),
      account: async () => ({ email: 'local@example.invalid', rateLimits: {} }),
      login: async () => {},
      send: async (payload) => {
        sendCount += 1;
        lastScope = payload.clientScope || '';
        return { turnId: `turn-${sendCount}`, threadId: `thread-${sendCount}` };
      },
      interrupt: async () => ({ ok: true }),
      onEvent: (callback) => subscribe(eventListeners, callback),
      onState: (callback) => subscribe(stateListeners, callback),
      onLog: () => () => {},
      setAiTaskShortcutActive: () => {},
      onAiCloseTaskShortcut: () => () => {},
    };
  });
  let sharedPayload = null;
  await page.route('**/api/shares', async (route) => {
    sharedPayload = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ id: 'a'.repeat(48), revokeKey: 'local-revoke', expiresAt: new Date(Date.now() + 3_600_000).toISOString() }),
    });
  });
  await page.goto(`http://127.0.0.1:${port}/preview/`, { waitUntil: 'networkidle' });
  const welcome = page.locator('.tut-welcome-overlay .tut-banner-no');
  if (await welcome.isVisible()) await welcome.click();
  await page.locator('#ai-image-install-open').click();
  await page.locator('#ai-image-panel').waitFor({ state: 'visible' });
  await page.locator('#ai-image-panel [data-ai-status]').filter({ hasText: '준비됨' }).waitFor();
  await page.locator('#ai-image-panel [data-ai-review-mode]').uncheck();
  await page.locator('#ai-image-panel [data-ai-separation-mode]').evaluate((select) => {
    select.value = 'off';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.locator('#ai-image-panel [data-ai-source-file]').first().setInputFiles({
    name: 'source.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  });
  await page.evaluate(() => {
    const input = document.querySelector('#ai-image-panel [data-ai-input]');
    input.value = 'PRIVATE-TASK-A';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const countsBefore = await page.evaluate(() => window.__task6Mock.counts());
  await page.evaluate(() => window.__task6Mock.delayStatus());
  await page.locator('#ai-image-panel [data-ai-send]').click();
  await page.locator('#ai-image-panel [data-ai-send]').click();
  await page.waitForFunction((before) => window.__task6Mock.counts().statusCount === before + 1,
    countsBefore.statusCount);
  assert.equal((await page.evaluate(() => window.__task6Mock.counts())).statusCount - countsBefore.statusCount, 1);
  await page.evaluate(() => { window.__task6OldPanel = document.querySelector('#ai-image-panel'); });
  await page.locator('#ai-image-panel .ai-task-add').click();
  await page.waitForFunction(() => document.querySelector('#ai-image-panel') !== window.__task6OldPanel);
  await page.locator('#ai-image-panel [data-ai-separation-mode]').evaluate((select) => {
    select.value = 'off';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.locator('#ai-image-panel [data-ai-source-file]').first().setInputFiles({
    name: 'source-b.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  });
  await page.evaluate(() => {
    const input = document.querySelector('#ai-image-panel [data-ai-input]');
    input.value = 'ACTIVE-TASK-B';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.evaluate(() => window.__task6Mock.releaseStatus());
  await page.waitForFunction(() => window.__task6OldPanel
    ?.querySelector('[data-ai-status]')
    ?.textContent
    ?.includes('변경'));
  const cancelledCounts = await page.evaluate(() => window.__task6Mock.counts());
  assert.equal(cancelledCounts.sendCount, 0);

  await page.locator('#ai-image-panel [data-ai-send]').click();
  await page.waitForFunction(() => window.__task6Mock.counts().sendCount === 1);
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const drawing = canvas.getContext('2d');
    drawing.fillStyle = '#fff'; drawing.fillRect(0, 0, 32, 32);
    drawing.strokeStyle = '#111'; drawing.strokeRect(6, 6, 20, 20);
    return canvas.toDataURL('image/png');
  });
  await page.evaluate((imageDataUrl) => {
    window.__task6Mock.emitEvent({ method: 'item/completed', params: {
      turnId: 'turn-1', item: { type: 'imageGeneration', imageDataUrl },
    } });
    window.__task6Mock.emitEvent({ method: 'turn/completed', params: {
      turn: { id: 'turn-1', status: 'completed', error: null },
    } });
  }, png);
  await page.locator('#ai-image-panel [data-ai-insert-selected]:not([disabled])').waitFor();

  await page.evaluate(() => { window.__releaseTask6Images = window.__task6Mock.delayImages(); });
  await page.evaluate(() => { window.__task6InsertPanel = document.querySelector('#ai-image-panel'); });
  await page.locator('#ai-image-panel [data-ai-insert-selected]').click();
  await page.waitForTimeout(50);
  await page.evaluate(() => document.getElementById('page-add').click());
  await page.evaluate(() => window.__releaseTask6Images());
  await page.waitForFunction(() => window.__task6InsertPanel
    ?.querySelector('[data-ai-status]')
    ?.textContent
    ?.includes('페이지'));
  assert.equal(await page.locator('#canvas image').count(), 0);

  await page.evaluate(() => document.getElementById('sharing-btn').click());
  await page.locator('.ai-sharing-dialog[open] [data-create]').click();
  await page.waitForFunction(() => document.querySelector('.ai-sharing-dialog [data-status]')?.textContent.includes('준비되었습니다'));
  assert.ok(sharedPayload);
  assert.equal(sharedPayload.workspaces.length, 1);
  assert.equal(sharedPayload.workspaces[0].tabs.length, 1);
  assert.equal(sharedPayload.workspaces[0].tabs[0].input, 'ACTIVE-TASK-B');
  assert.equal(JSON.stringify(sharedPayload).includes('PRIVATE-TASK-A'), false);
  await page.locator('.ai-sharing-dialog [data-close]').click();

  await page.locator('#ai-image-panel [data-ai-insert-selected]').click();
  await page.locator('#ai-image-panel').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#canvas image').count(), 1);
  await page.screenshot({ path: path.join(evidenceDir, 'task-6-ai-browser.png'), fullPage: true });
  await page.close();
  const recordedVideo = await video.path();
  fs.copyFileSync(recordedVideo, path.join(evidenceDir, 'task-6-ai-browser.webm'));
  await browserContext.close();
});
