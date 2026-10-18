const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const playwrightPath = process.env.PLAYWRIGHT_MODULE
  || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = require(playwrightPath);
const root = path.resolve(__dirname, '..');
const evidenceDir = process.env.TASK7_RELEASE_EVIDENCE || process.env.EVIDENCE_DIR || path.join(root, '.omo/evidence/ai-workbench-polish-0928/task7/release');

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
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const browserContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    recordVideo: { dir: evidenceDir, size: { width: 1280, height: 900 } },
  });
  await browserContext.tracing.start({screenshots:true,snapshots:true});
  context.after(async()=>{
    await browserContext.tracing.stop({path:path.join(evidenceDir,'release-trace.zip')});
    await browserContext.close(); await browser.close();
    await new Promise(resolve=>server.close(resolve));
    fs.writeFileSync(path.join(evidenceDir,'cleanup.json'),JSON.stringify({browserContextClosed:true,browserClosed:!browser.isConnected(),serverClosed:!server.listening,serverPort:port}));
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
    const scopes = [];
    const requests = [];
    const sourceObservation = { version: 4, observationVersion: 1, leaderObservationVersion: 1, observationContractRevision: '1.4.0', removalOnlyItems: [], reviewRequired: false,
      geometryLock: { version: 1, objects: [{ id: 'fixture-structure', sourceRef: 1, role: 'scientific-object', description: 'Controlled ownership source observation; not provider quality evidence', bounds: { x: .2, y: .2, w: .6, h: .6 }, relations: [] }] },
      labels: [], removalRegions: [], protectedRegions: [], preservedMarks: [], uncertainties: [] };
    const reviewIds = ['object-counts','inside-outside','liquid-occupancy','connections','composition-state','black-fill-meaning','presentation','request-scope','kice-flat-style','flat-gray-regions','raster-label-removal','editable-label-coverage','leader-relations','label-overlay-alignment','label-typography','leader-overlay'];
    const reviewReport = { verdict: 'pass', checks: reviewIds.map(id => ({ id, label: id, status: 'pass', detail: 'Controlled ownership transport; not provider quality evidence' })), issues: [] };
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
      counts: () => ({ sendCount, statusCount, rawCount: requests.length, stages: requests.map(request => request.stage) }),
      emitEvent(message, index = scopes.length - 1) {
        for (const listener of eventListeners) listener({ clientScope: scopes[index], ...message });
      },
      delayImages() {
        const NativeImage = window.Image;
        const nativeSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
        const pending = [];
        window.__task6ImageGatePending = 0;
        window.Image = function (...args) {
          const image = new NativeImage(...args);
          Object.defineProperty(image, 'src', { configurable: true,
            get() { return nativeSrc.get.call(image); },
            set(value) { pending.push({ image, value }); window.__task6ImageGatePending = pending.length; },
          });
          return image;
        };
        window.Image.prototype = NativeImage.prototype;
        Object.setPrototypeOf(window.Image, NativeImage);
        return () => {
          window.Image = NativeImage;
          for (const { image, value } of pending.splice(0)) {
            delete image.src; nativeSrc.set.call(image, value);
          }
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
      models: async () => ({ data: [{ model: 'gpt-6.1-sol', displayName: 'Sol', isDefault: true,
        defaultReasoningEffort: 'medium', supportedReasoningEfforts: ['medium'], serviceTiers: ['priority'] }, {model:'gpt-6-luna',displayName:'Luna',defaultReasoningEffort:'medium',supportedReasoningEfforts:['medium'],serviceTiers:['priority']}] }),
      account: async () => ({ email: 'local@example.invalid', rateLimits: {} }),
      login: async () => {},
      send: async (payload) => {
        const text = String(payload.text || '');
        const stage = payload.purpose === 'image' ? 'image-generation'
          : text.includes('입력 원본 라벨 관찰') ? 'source-observation'
          : text.includes('검수') || text.includes('FINAL_NATIVE_OVERLAY') ? 'full-review' : null;
        if (!stage) throw new Error('Unexpected controlled request stage: ' + text.slice(0, 200));
        const request = { payload, stage }; requests.push(request);
        if (stage === 'image-generation') {
          sendCount += 1; lastScope = payload.clientScope || ''; scopes.push(lastScope);
          return { turnId: `turn-${sendCount}`, threadId: `thread-${sendCount}` };
        }
        const turnId = `observer-${requests.length}`, threadId = `observer-thread-${requests.length}`;
        setTimeout(() => {
          const clientScope = payload.clientScope || '';
          const response = stage === 'source-observation' ? sourceObservation : reviewReport;
          for (const callback of eventListeners) {
            callback({ clientScope, method: 'item/completed', params: { turnId, item: { type: 'agentMessage', phase: 'final_answer', text: JSON.stringify(response) } } });
            callback({ clientScope, method: 'turn/completed', params: { turn: { id: turnId, status: 'completed' } } });
          }
        }, 0);
        return { turnId, threadId };
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
  const chooseCurrentInput = async () => {
    const panel = page.locator('#ai-image-panel');
    const sourceChoices = panel.locator('.ai-source-treatment');
    if (!await sourceChoices.evaluate(node => node.open)) await sourceChoices.locator('summary').click();
    await panel.locator('[data-ai-setting-key="kind"] [data-ai-setting-value="general"]').click();
    await panel.locator('[data-ai-setting-key="labels"] [data-ai-setting-value="remove"]').click();
  };
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

  await chooseCurrentInput();
  const countsBefore = await page.evaluate(() => window.__task6Mock.counts());
  await page.evaluate(() => window.__task6Mock.delayStatus());
  await page.locator('#ai-image-panel [data-ai-comments-apply]').dblclick();
  await page.waitForFunction((before) => window.__task6Mock.counts().statusCount === before + 1,
    countsBefore.statusCount);
  assert.equal((await page.evaluate(() => window.__task6Mock.counts())).statusCount - countsBefore.statusCount, 1);
  await page.evaluate(() => { window.__task6OldPanel = document.querySelector('#ai-image-panel'); });
  await page.locator('#ai-image-panel .ai-task-add').click();
  await page.waitForFunction(() => document.querySelector('#ai-image-panel') !== window.__task6OldPanel);

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
  await chooseCurrentInput();
  await page.evaluate(() => window.__task6Mock.releaseStatus());
  await page.waitForFunction(() => window.__task6Mock.counts().sendCount === 1);
  assert.equal(await page.locator('#ai-image-panel .ai-generated-card').count(), 0, 'B remains unmodified while A continues');

  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const drawing = canvas.getContext('2d');
    drawing.fillStyle = '#fff'; drawing.fillRect(0, 0, 32, 32);
    drawing.strokeStyle = '#111'; drawing.strokeRect(6, 6, 20, 20);
    return canvas.toDataURL('image/png');
  });
  await page.evaluate((imageDataUrl) => {
    window.__task6Mock.emitEvent({ method: 'item/completed', params: { turnId:'turn-1', item:{type:'imageGeneration',imageDataUrl} } },0);
    window.__task6Mock.emitEvent({ method: 'turn/completed', params: { turn:{id:'turn-1',status:'completed',error:null} } },0);
  }, png);
  await page.waitForFunction(() => window.__task6OldPanel.querySelectorAll('.ai-generated-card').length===1 && window.__task6OldPanel.dataset.aiBusy==='false');
  assert.equal(await page.locator('#ai-image-panel .ai-generated-card').count(),0,'A result never enters active B');
  await page.locator('#ai-image-panel [data-ai-comments-apply]').click();
  await page.waitForFunction(() => window.__task6Mock.counts().sendCount===2);
  await page.evaluate((imageDataUrl) => {
    window.__task6Mock.emitEvent({ method: 'item/completed', params: { turnId:'turn-2', item:{type:'imageGeneration',imageDataUrl} } },1);
    window.__task6Mock.emitEvent({ method: 'turn/completed', params: { turn:{id:'turn-2',status:'completed',error:null} } },1);
  },png);
  await page.locator('#ai-image-panel [data-ai-insert-selected]:not([disabled])').waitFor();

  await page.evaluate(() => { window.__releaseTask6Images = window.__task6Mock.delayImages(); });
  await page.evaluate(() => { window.__task6InsertPanel = document.querySelector('#ai-image-panel'); });
  await page.locator('#ai-image-panel [data-ai-insert-selected]').click();
  await page.waitForFunction(() => window.__task6ImageGatePending > 0);
  await page.evaluate(() => document.getElementById('page-add').click());
  await page.evaluate(() => window.__releaseTask6Images());
  await page.waitForFunction(() => window.__task6InsertPanel?.dataset.aiBusy === 'false'
    && window.__task6InsertPanel.querySelector('[data-ai-status]')?.textContent?.includes('페이지 삽입 실패'));
  fs.writeFileSync(path.join(evidenceDir, 'origin-page-insertion-rejection.json'), JSON.stringify(await page.evaluate(() => ({
    busy: window.__task6InsertPanel.dataset.aiBusy,
    status: window.__task6InsertPanel.querySelector('[data-ai-status]')?.textContent,
    canvasObjects: document.querySelectorAll('#canvas image').length,
    insertDisabled: window.__task6InsertPanel.querySelector('[data-ai-insert-selected]').disabled,
  })), null, 2));
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
  const transportCounts = await page.evaluate(() => window.__task6Mock.counts());
  assert.equal(transportCounts.sendCount, 2, 'Each original owner performs exactly one generation');
  assert.equal(transportCounts.rawCount, 6, 'All actual source, image and review requests are counted');
  assert.deepEqual(transportCounts.stages.reduce((counts, stage) => ({ ...counts, [stage]: (counts[stage] || 0) + 1 }), {}), { 'source-observation': 2, 'image-generation': 2, 'full-review': 2 });
  fs.writeFileSync(path.join(evidenceDir, 'current-transport-counts.json'), JSON.stringify(transportCounts, null, 2));
  await page.screenshot({ path: path.join(evidenceDir, 'task-6-ai-browser.png'), fullPage: true });
  await page.close();
  const recordedVideo = await video.path();
  fs.copyFileSync(recordedVideo, path.join(evidenceDir, 'task-6-ai-browser.webm'));
});
