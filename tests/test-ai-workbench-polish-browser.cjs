const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.TASK9_ROOT || process.cwd();
const evidenceRoot = path.resolve(process.env.TASK9_EVIDENCE || path.join(root, '.omo/evidence/ai-workbench-polish-0928/task9-polish/browser'));
const { installCropFixture, pointerOnImage } = require(path.join(root, 'tests/helpers/crop-loading-fixture.cjs'));
const active = '#ai-image-panel';
const taskButton = index => `${active} [data-tab-id="task-${index}"] .ai-task-tab-select`;
const write = (dir, name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2));
// Reuse the existing IDB/desktop fixture without importing its node:test registrations.
const lifecycleFixture = fs.readFileSync(path.join(root, 'tests/test-ai-workspace-lifecycle-browser.cjs'), 'utf8');
const seedStart = lifecycleFixture.indexOf('function seedRequestWorkspaces(');
const seedEnd = lifecycleFixture.indexOf('\nasync function requestBrowserFixture(', seedStart);
assert.ok(seedStart >= 0 && seedEnd > seedStart, 'populated lifecycle fixture must be available');
const seed = lifecycleFixture.slice(seedStart, seedEnd);
const sourceFiles = ['preview/js/ai-panel.js', 'preview/js/ai-task-workspaces.js', 'preview/js/ai-workspace-batch.js', 'preview/js/ai-comparison.js', 'preview/js/unified-library-ui.js', 'preview/js/tools/pointer-magnifier.js', 'preview/css/ai-panel.css', 'preview/css/ai-comparison.css', 'preview/css/unified-library.css', 'preview/index.html', 'preview/js/main.js', 'tests/test-ai-workspace-lifecycle-browser.cjs', 'tests/helpers/crop-loading-fixture.cjs'];
const hashes = () => Object.fromEntries(sourceFiles.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));

async function fixture(t, engine, name, count = null) {
  const evidence = path.join(evidenceRoot, engine, name); fs.mkdirSync(evidence, { recursive: true });
  const sourceBefore = hashes();
  const errors = [];
  const server = http.createServer((request, response) => {
    let file = path.resolve(root, `.${new URL(request.url, 'http://localhost').pathname}`);
    if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
    if (file.endsWith('/preview') || request.url.split('?')[0].endsWith('/')) file = path.join(file, 'index.html');
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
    fs.readFile(file, (error, body) => { response.writeHead(error ? 404 : 200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); response.end(error ? 'missing' : body); });
  });
  let browser, context, page, tracing = false;
  const resources = { engine, pid: process.pid, serverPort: null, browserStarted: false, contextStarted: false, serverClosed: false, browserClosed: false, contextClosed: false };
  t.after(async () => {
    try {
      if (page && !page.isClosed()) await page.screenshot({ path: path.join(evidence, 'final.png') });
      if (tracing) {
        let deadline;
        try {
          await Promise.race([context.tracing.stop({ path: path.join(evidence, 'trace.zip') }), new Promise((resolve, reject) => { deadline = setTimeout(() => reject(new Error('Trace save exceeded 10 seconds; closing owned browser')), 10000); })]);
        } finally { clearTimeout(deadline); }
      }
    } finally {
      try { if (context) { await context.close(); resources.contextClosed = true; } }
      finally {
        try { if (browser) { await browser.close(); resources.browserClosed = !browser.isConnected(); } }
        finally { if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } resources.serverClosed = !server.listening; write(evidence, 'cleanup.json', resources); }
      }
    }
    write(evidence, 'source-integrity.json', { before: sourceBefore, after: hashes(), unchanged: JSON.stringify(sourceBefore) === JSON.stringify(hashes()) });
    assert.deepEqual(hashes(), sourceBefore, 'frozen product and reused fixtures must not change during scenario');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); resources.serverPort = server.address().port;
  write(evidence, 'resources.json', resources);
  browser = await playwright[engine].launch({ headless: true }); resources.browserStarted = true;
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, hasTouch: true, colorScheme: 'light', reducedMotion: 'no-preference' }); resources.contextStarted = true;
  write(evidence, 'resources.json', resources);
  await context.tracing.start({ screenshots: true, snapshots: true }); tracing = true;
  page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  const origin = `http://127.0.0.1:${resources.serverPort}`;
  write(evidence, 'environment.json', { node: process.version, executable: process.execPath, engine, browserVersion: browser.version(), platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model, cpuCount: os.cpus().length, totalMemory: os.totalmem(), loadAverage: os.loadavg(), viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), dirtyStatus: execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }), sourceHashes: sourceBefore, service: 'deterministic desktop fixture; no authenticated provider request', measurement: 'trusted pointer click event through decoded selected target plus two animation frames; automation actionability time excluded' });
  if (count !== null) {
    await page.addInitScript({ content: `${seed}\nseedRequestWorkspaces(${count}); localStorage.setItem('5e.preview:5e.mode','pro'); localStorage.setItem('5e.preview:theme','light'); localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true'); window.fiveEDesktop.captureSources=async()=>[{name:'검증 캡처',data:window.__task2.original}];` });
    await page.route('**/preview/js/main.js*', route => {
      const source = fs.readFileSync(path.join(root, 'preview/js/main.js'), 'utf8');
      const original = 'const aiPanel = initAiPanel(state, { freshStart: recoveryChoice === "fresh" });';
      assert.ok(source.includes(original));
      return route.fulfill({ contentType: 'text/javascript', body: 'await window.__seedReady;\n' + source.replace(original, 'const aiPanel = initAiPanel(state, { freshStart: false }); window.__task2Manager=aiPanel;') });
    });
    await page.goto(`${origin}/preview/`, { waitUntil: 'networkidle' });
    const welcome = page.locator('.tut-welcome-overlay .tut-banner-no'); if (await welcome.isVisible()) await welcome.click();
    await page.click('#ai-image-install-open');
    await selected(page, 0);
  }
  return { page, evidence, errors, origin };
}
async function selected(page, index) {
  await page.waitForFunction(index => {
    const panel = document.querySelector('#ai-image-panel');
    return panel?.dataset.aiSelectedCandidateId === `candidate-${index}` && [...panel.querySelectorAll('.ai-generated-card img')].some(img => img.complete && img.naturalWidth === 512) && [...panel.querySelectorAll('.ai-workbench-comment')].some(row => row.getBoundingClientRect().height > 0);
  }, index);
}
async function select(page, index) { await page.click(taskButton(index)); await selected(page, index); }
async function content(page, count) {
  const snapshot = await page.evaluate(async () => {
    const tabs = (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(w => w.tabs);
    const panel = document.querySelector('#ai-image-panel');
    return { tabs: tabs.map(tab => ({ id: tab.id, originals: tab.attachments.length, revisions: tab.generated.length, comments: tab.generated.reduce((n, item) => n + item.comments.length, 0), originalUnchanged: tab.attachments[0].data === window.__task2.original })), rows: panel.querySelectorAll('.ai-task-tab-select').length, selected: panel.dataset.aiSelectedCandidateId, decoded: [...panel.querySelectorAll('.ai-image-card img')].filter(img => img.complete && img.naturalWidth === 512).length, visibleComments: [...panel.querySelectorAll('.ai-workbench-comment')].filter(el => el.getBoundingClientRect().height > 0).length };
  });
  assert.equal(snapshot.tabs.length, count); assert.equal(snapshot.rows, count);
  assert.ok(snapshot.tabs.every(tab => tab.originals === 1 && tab.revisions === 1 && tab.comments === 1 && tab.originalUnchanged));
  assert.ok(snapshot.decoded >= 2); assert.ok(snapshot.visibleComments >= 1, 'selected populated task must display its comment');
  return snapshot;
}

for (const engine of ['chromium', 'webkit']) for (const count of [1, 10, 30]) {
  test(`${engine}: populated ${count} tasks retain visible content and cached click-to-paint performance across visual modes`, { timeout: 180000 }, async t => {
    const { page, evidence, errors } = await fixture(t, engine, `tasks-${count}`, count);
    // Given: every fixture task has an original, revision and area comment; warm every task through the real controls.
    const before = await content(page, count);
    const cold = [];
    for (let index = 0; index < count; index++) { const start = performance.now(); await select(page, index); cold.push(performance.now() - start); }
    await page.screenshot({ path: path.join(evidence, 'populated-last.png') });
    write(evidence, 'last-task-content.json', await content(page, count));
    await select(page, 0);
    const screenshots = [];
    const capture = async name => { const file = path.join(evidence, `${name}.png`); await page.screenshot({ path: file }); screenshots.push({ file, content: await content(page, count) }); };
    await capture('populated-light');
    await page.evaluate(() => {
      window.__polish = { samples: [], gaps: [], stop: false, last: performance.now(), started: performance.now() };
      window.__task2.longTasks = [];
      const tick = time => { if (window.__polish.stop) return; window.__polish.gaps.push(time - window.__polish.last); window.__polish.last = time; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
      document.addEventListener('click', event => {
        const button = event.target.closest('#ai-image-panel .ai-task-tab-select'); if (!button || !event.isTrusted) return;
        const id = button.closest('[data-tab-id]').dataset.tabId;
        const start = performance.now();
        const inspect = () => {
          const panel = document.querySelector('#ai-image-panel');
          if (panel?.dataset.aiSelectedCandidateId !== id.replace('task-', 'candidate-') || ![...panel.querySelectorAll('.ai-generated-card img')].some(img => img.complete && img.naturalWidth === 512) || ![...panel.querySelectorAll('.ai-workbench-comment')].some(row => row.getBoundingClientRect().height > 0)) {
            if (performance.now() - start < 1000) requestAnimationFrame(inspect); else window.__polish.samples.push({ id, ms: performance.now() - start, ready: false }); return;
          }
          requestAnimationFrame(() => window.__polish.samples.push({ id, ms: performance.now() - start, ready: true }));
        }; requestAnimationFrame(inspect);
      }, true);
    });
    // When: trusted cached selection clicks repeatedly cycle across the populated task set.
    for (let sample = 0; sample < 20; sample++) {
      const index = count === 1 ? 0 : (sample * 7 + 1) % count;
      await page.click(taskButton(index));
      await page.waitForFunction(n => window.__polish.samples.length >= n, sample + 1);
    }
    const perf = await page.evaluate(() => { window.__polish.stop = true; return { ...window.__polish, longTaskSupported: window.__task2.longTaskSupported, longTasks: window.__task2.longTasks.filter(entry => entry.start >= window.__polish.started), dpr: devicePixelRatio }; });
    const times = perf.samples.map(row => row.ms).sort((a, b) => a - b);
    const report = { count, engine, coldSelectionIncludingAutomationMs: cold, ...perf, minimumMs: times[0], medianMs: times[10], p95Ms: times[18], maximumMs: times.at(-1), over100ms: times.filter(ms => ms >= 100).length, longTasksOver50ms: perf.longTasks.filter(row => row.duration > 50), rafGapsOver50ms: perf.gaps.filter(ms => ms > 50), webkitLimitation: engine === 'webkit' ? 'Long Tasks API unavailable: RAF gaps are rendering-stall observations, not proof of main-thread task duration.' : null };
    write(evidence, 'performance.json', report);
    // Then: exact selected decoded content reaches the rendered surface within the stated target for every sample.
    assert.equal(perf.samples.length, 20); assert.ok(perf.samples.every(row => row.ready));
    assert.equal(report.over100ms, 0, JSON.stringify(report));
    if (perf.longTaskSupported) assert.equal(report.longTasksOver50ms.length, 0, 'cached selection has no >50ms long tasks');
    await select(page, 0);
    await page.click(`${active} [data-ai-close]`); await page.click('#theme-toggle'); await page.click('#ai-image-install-open');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    await capture('populated-dark-reduced');
    await page.click(`${active} [data-ai-compare]`);
    await page.waitForFunction(() => [...document.querySelectorAll('.ai-comparison-pane image')].length === 2 && [...document.querySelectorAll('.ai-comparison-pane image')].every(img => img.hasAttribute('href')));
    assert.equal(await page.getByLabel('왼쪽 비교 버전', { exact: true }).inputValue(), 'source-0');
    assert.equal(await page.getByLabel('오른쪽 비교 버전', { exact: true }).inputValue(), 'candidate-0');
    const views = () => page.locator('.ai-comparison-pane svg').evaluateAll(nodes => nodes.map(node => node.getAttribute('viewBox')));
    const fitViews = await views();
    await page.getByRole('button', { name: '비교 확대', exact: true }).click();
    await page.getByRole('button', { name: '비교 확대', exact: true }).click();
    await page.locator('.ai-comparison-stage').focus(); await page.keyboard.press('ArrowRight');
    const zoomViews = await views(); assert.equal(zoomViews[0], zoomViews[1]); assert.notEqual(zoomViews[0], fitViews[0]);
    await page.getByRole('slider').focus(); await page.keyboard.press('Home'); await page.keyboard.press('Shift+ArrowRight');
    assert.equal(await page.getByRole('slider').getAttribute('aria-valuenow'), '10');
    await page.screenshot({ path: path.join(evidence, 'compare-dark-retina-zoompan.png') });
    await page.getByRole('button', { name: '비교 닫기', exact: true }).click();
    await page.click(`${active} [data-ai-capture]`); await page.click('.ai-capture-source');
    const image = page.locator('.ai-crop-image-wrap > img'); await image.waitFor(); const box = await image.boundingBox();
    await page.mouse.move(box.x + box.width * .3, box.y + box.height * .3);
    await page.locator('#ai-capture-magnifier').waitFor({ state: 'visible' });
    assert.equal(Math.round((await page.locator('#ai-capture-magnifier').boundingBox()).width), 160);
    await page.screenshot({ path: path.join(evidence, 'capture-dark-retina-lens.png') });
    await page.keyboard.press('Escape');
    write(evidence, 'visual-content.json', { before, screenshots, comparison: { fitViews, zoomViews, left: 'source-0', right: 'candidate-0' }, errors, sends: await page.evaluate(() => window.__task2.sends.length) });
    assert.deepEqual(errors, []); assert.equal(await page.evaluate(() => window.__task2.sends.length), 0);
  });
}

for (const engine of ['chromium', 'webkit']) test(`${engine}: dark reduced-motion crop preserves target geometry through slow decode, retry and reopen`, { timeout: 90000 }, async t => {
  const { page, evidence, errors, origin } = await fixture(t, engine, 'loading');
  process.env.PREVIEW_URL = origin;
  const ui = await installCropFixture(page);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  const load = ui.locator('[data-unilib-crop-load-state]');
  const image = ui.locator('[data-unilib-crop-image]');
  await pointerOnImage(page, ui);
  await page.locator('#library-crop-magnifier').waitFor({ state: 'visible' });
  await ui.locator('[data-unilib-crop-zoom-in]').click();
  await pointerOnImage(page, ui, .9);
  await ui.locator('[data-unilib-crop-canvas]').evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
  await page.screenshot({ path: path.join(evidence, 'dark-zoom-edge-lens.png') });
  await page.evaluate(() => { window.holdCrop('original-2'); window.holdCrop('thumbnail-2'); });
  await ui.locator('[data-unilib-crop-page-next]').click(); await load.waitFor({ state: 'visible' });
  await ui.locator('.unilib-crop-load-paper').waitFor({ state: 'visible' });
  const transition = await ui.locator('[data-unilib-crop-canvas]').evaluate(async node => {
    const start = performance.now(); const animations = node.getAnimations();
    const timings = animations.map(animation => ({ keyframes: animation.effect.getKeyframes(), timing: animation.effect.getTiming() }));
    await Promise.all(animations.map(animation => animation.finished));
    return { timings, settledMs: performance.now() - start };
  });
  write(evidence, 'loading-transition.json', transition);
  assert.ok(transition.timings.every(item => item.timing.duration <= 1), 'reduced motion must not animate loading geometry for more than 1ms');
  assert.ok(transition.settledMs < 100, 'loading skeleton settles within 100ms');
  const skeleton = await ui.locator('.unilib-crop-load-paper').boundingBox();
  write(evidence, 'loading-geometry-diagnostic.json', { skeleton, diagnostic: await ui.evaluate(el => [...el.querySelectorAll('[data-unilib-crop-stage], [data-unilib-crop-load-state], .unilib-crop-load-paper, [data-unilib-crop-image], [data-unilib-crop-canvas]')].map(node => ({className: node.className, rect:node.getBoundingClientRect().toJSON(), style:node.getAttribute('style'), computed:{height:getComputedStyle(node).height,minHeight:getComputedStyle(node).minHeight,maxHeight:getComputedStyle(node).maxHeight,aspectRatio:getComputedStyle(node).aspectRatio}, hidden:node.hidden}))) });
  assert.ok(Math.abs(skeleton.width / skeleton.height - 2) < .01); assert.equal(await image.isVisible(), false);
  await ui.locator('[data-unilib-crop-canvas]').evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
  await page.screenshot({ path: path.join(evidence, 'slow-neutral-landscape.png') });
  await page.evaluate(() => window.cropGates['thumbnail-2'].release());
  await ui.locator('.unilib-crop-load-preview').waitFor({ state: 'visible' });
  await page.evaluate(() => { window.holdCrop('decode-2'); window.cropGates['original-2'].release(); });
  await page.evaluate(async () => { for (let n = 0; n < 4; n++) await new Promise(requestAnimationFrame); });
  assert.equal(await load.isVisible(), true);
  await ui.locator('[data-unilib-crop-canvas]').evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
  await page.screenshot({ path: path.join(evidence, 'decode-pending-target-only.png') });
  await page.evaluate(() => window.cropGates['decode-2'].release()); await load.waitFor({ state: 'hidden' });
  assert.equal(await image.evaluate(img => img.naturalWidth), 800);
  await page.evaluate(() => { window.cropBrokenPage = 3; });
  await ui.locator('[data-unilib-crop-page-next]').click();
  await ui.locator('[data-unilib-crop-load-state][data-state="error"]').waitFor();
  await ui.locator('[data-unilib-crop-canvas]').evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
  await page.screenshot({ path: path.join(evidence, 'decode-failed.png') });
  await page.evaluate(() => { window.cropBrokenPage = null; }); await ui.locator('[data-unilib-crop-retry]').click(); await load.waitFor({ state: 'hidden' });
  assert.equal(await image.evaluate(img => img.naturalWidth), 700);
  await page.evaluate(() => { window.holdCrop('original-2'); window.holdCrop('thumbnail-2'); });
  await ui.locator('[data-unilib-crop-page-prev]').click(); await load.waitFor({ state: 'visible' });
  await ui.locator('[data-unilib-crop-cancel]').click(); await ui.locator('[data-result-id="geometry-book:page:1"]').click(); await ui.locator('[data-unilib-adjust]').click(); await load.waitFor({ state: 'hidden' });
  await page.evaluate(async () => { window.cropGates['original-2'].release(); window.cropGates['thumbnail-2'].release(); for (let n = 0; n < 4; n++) await new Promise(requestAnimationFrame); });
  assert.equal(await image.evaluate(img => img.naturalWidth), 600);
  const pointer = await pointerOnImage(page, ui);
  await page.touchscreen.tap(pointer.point.x, pointer.point.y); await page.locator('#library-crop-magnifier').waitFor({ state: 'hidden' });
  await ui.locator('[data-unilib-crop-canvas]').evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
  await page.screenshot({ path: path.join(evidence, 'reopened-original-touch.png') });
  await ui.locator('[data-unilib-crop-cancel]').click(); await page.evaluate(() => window.cropFixture.close());
  assert.deepEqual(errors, []);
  write(evidence, 'results.json', { skeleton, slowTargetRatio: 2, decodedWidth: 800, retryWidth: 700, reopenedWidth: 600, touchHidesLens: true, dark: true, reducedMotion: true, errors });
});
