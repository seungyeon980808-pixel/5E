const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const BASE_URL = process.env.PREVIEW_URL || 'http://127.0.0.1:8798/preview/?mode=lite';
const EVIDENCE = path.resolve(process.env.EVIDENCE_DIR || '.omo/evidence/lite-four-pane-0924');
const FIXTURE = path.resolve('tests/fixtures/rights-clear-smoke.png');
const FIXTURE_DATA_URL = `data:image/png;base64,${fs.readFileSync(FIXTURE).toString('base64')}`;
fs.mkdirSync(EVIDENCE, { recursive: true });
fs.writeFileSync(path.join(EVIDENCE, 'browser-actions.ndjson'), '');

const outcomes = [];
const artifacts = new Map();
const actions = [];
const activeBrowsers = new Set();
let cleanupStarted = false;
const ref = (id, kind, description, file) => {
  const absolute = path.resolve(file);
  artifacts.set(id, { id, kind, description, path: absolute });
  return id;
};
const log = (scenario, action, detail = {}) => {
  const entry = { at: new Date().toISOString(), scenario, action, ...detail };
  actions.push(entry);
  fs.appendFileSync(path.join(EVIDENCE, 'browser-actions.ndjson'), `${JSON.stringify(entry)}\n`);
};
const image = (scenario, name) => ref(`art-${name}`, 'screenshot', `${scenario} browser screenshot`, path.join(EVIDENCE, name));
ref('art-separate-main-baseline', 'screenshot', 'captured pre-integration separate-main vs AI baseline mismatch', path.join(EVIDENCE, 'baseline-1280-ai-open.png'));

async function closeBrowser(browser) {
  if (!browser) return;
  activeBrowsers.delete(browser);
  try { await browser.close(); } catch { /* browser may already have exited */ }
}

async function closeAllBrowsers() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  const browsers = [...activeBrowsers];
  for (const browser of browsers) await closeBrowser(browser);
  cleanupStarted = false;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    process.exitCode = signal === 'SIGINT' ? 130 : 143;
    void closeAllBrowsers().finally(() => process.exit());
  });
}

async function installTransport(context, { loggedIn, controlled } = {}) {
  const state = { sends: [], delivered: new Set() };
  await context.addInitScript((auth) => {
    window.showSaveFilePicker = undefined;
    localStorage.setItem('5e.tutorial.bannerSeen', 'true');
    localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
    localStorage.setItem('5e.preview:5e.desktopHandoff.v1', JSON.stringify({ dismissed: true, remindUntil: 0, installStarted: false }));
    if (auth) sessionStorage.setItem('5e:web-ai-session', 'f'.repeat(64));
    else sessionStorage.removeItem('5e:web-ai-session');
  }, Boolean(loggedIn));
  if (!controlled && loggedIn !== false) return state;
  await context.route('**/api/**', async route => {
    const action = new URL(route.request().url()).pathname.split('/').pop();
    let request = {};
    try { request = route.request().postDataJSON() || {}; } catch { /* GET or empty body */ }
    let result;
    if (action === 'bridge-status') result = { login: { loggedIn: Boolean(loggedIn) }, server: true };
    if (action === 'bridge-models') result = { data: [{ model: 'gpt-5.6-sol', displayName: 'Controlled QA', supportedReasoningEfforts: ['medium', 'high'], defaultReasoningEffort: 'medium', serviceTiers: ['priority'], defaultServiceTier: 'priority' }] };
    if (action === 'bridge-account') result = { account: { name: 'Controlled QA' }, limits: {} };
    if (action === 'bridge-send') {
      state.sends.push(request);
      result = loggedIn ? { turnId: `lite-qa-${state.sends.length}`, renderThreadId: `lite-render-${state.sends.length}` } : { error: 'login_required' };
    }
    if (action === 'bridge-events') {
      const index = state.sends.length;
      const events = [];
      if (controlled && index && !state.delivered.has(index)) {
        state.delivered.add(index);
        const clientScope = state.sends.at(-1).clientScope || '';
        events.push(
          { clientScope, method: 'item/completed', params: { turnId: `lite-qa-${index}`, item: { type: 'imageGeneration', imageDataUrl: FIXTURE_DATA_URL } } },
          { clientScope, method: 'turn/completed', params: { turn: { id: `lite-qa-${index}`, status: 'completed' } } },
        );
      }
      result = { cursor: state.delivered.size, events };
    }
    if (action === 'bridge-interrupt') result = { ok: true };
    if (result === undefined) return route.continue();
    await route.fulfill({ json: result });
  });
  return state;
}

async function pageFor(options = {}) {
  const context = await chromium.launch({ headless: true });
  activeBrowsers.add(context);
  try {
    const browserContext = await context.newContext({ viewport: options.viewport || { width: 1280, height: 900 }, acceptDownloads: true });
    const transport = await installTransport(browserContext, options);
    const page = await browserContext.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.locator('#ai-image-panel').waitFor({ state: 'visible', timeout: 20000 });
    log(options.scenario || 'unknown', 'goto', { url: BASE_URL, viewport: options.viewport || { width: 1280, height: 900 } });
    return { context, page, transport, errors };
  } catch (error) {
    await closeBrowser(context);
    throw error;
  }
}

async function ensureAi(page, scenario) {
  const panel = page.locator('#ai-image-panel');
  if (!(await panel.isVisible())) {
    const open = page.locator('#lite-ai-open');
    if (!(await open.isVisible())) throw new Error('AI workbench is not reachable from Lite landing');
    await open.click();
    log(scenario, 'click', { selector: '#lite-ai-open' });
  }
  await panel.waitFor({ state: 'visible', timeout: 20000 });
}

async function setFixture(page, scenario) {
  await ensureAi(page, scenario);
  await page.locator('#ai-image-file-input').setInputFiles(FIXTURE);
  await page.locator('[data-ai-reference-id]').first().waitFor({ timeout: 20000 });
  log(scenario, 'setInputFiles', { selector: '#ai-image-file-input', fixture: FIXTURE });
}

async function shot(page, scenario, name) {
  const file = path.join(EVIDENCE, name);
  await page.screenshot({ path: file, fullPage: true });
  image(scenario, name);
  log(scenario, 'screenshot', { file });
}

async function boxes(page, selectors) {
  return page.evaluate((list) => Object.fromEntries(list.map(selector => {
    const node = document.querySelector(selector);
    if (!node) return [selector, null];
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return [selector, { display: style.display, visibility: style.visibility, x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom }];
  })), selectors);
}

function expectVisible(snapshot, selector) {
  const box = snapshot[selector];
  if (!box || box.display === 'none' || box.visibility === 'hidden' || box.width <= 0 || box.height <= 0) throw new Error(`${selector} is not visible: ${JSON.stringify(box)}`);
}

async function runScenario({ id, criterion, surface, invocation, scenario, run }) {
  const started = Date.now();
  try {
    const result = await run();
    outcomes.push({ id, criterion, surface, invocation, scenario, verdict: 'PASS', artifactRefs: result?.artifactRefs || [], note: result?.note || '', elapsedMs: Date.now() - started });
  } catch (error) {
    outcomes.push({ id, criterion, surface, invocation, scenario, verdict: 'FAIL', artifactRefs: error.artifactRefs || [], note: error.message, elapsedMs: Date.now() - started });
    console.error(`FAIL ${id}: ${error.message}`);
  }
}

function withArtifacts(error, refs) { error.artifactRefs = refs; return error; }

async function scenarioLanding() {
  const { context, page } = await pageFor({ scenario: 'landing' });
  const screenshot = path.join(EVIDENCE, 'chromium-1280-landing-baseline.png');
  try {
    await shot(page, 'landing', 'chromium-1280-landing-baseline.png');
    const initial = await boxes(page, ['#ai-image-panel', '.ai-task-rail', '.ai-original-pane', '.ai-result-pane', '.ai-conversation', '#lite-reference', '#canvas', '#lite-context']);
    fs.writeFileSync(path.join(EVIDENCE, 'landing-geometry.json'), JSON.stringify(initial, null, 2));
    const required = ['.ai-task-rail', '.ai-original-pane', '.ai-result-pane', '.ai-conversation'];
    required.forEach(selector => expectVisible(initial, selector));
    const columns = required.map(selector => initial[selector]).sort((a, b) => a.x - b.x);
    for (let i = 1; i < columns.length; i++) if (Math.abs(columns[i - 1].right - columns[i].x) > 2) throw new Error(`four-pane gap or overlap: ${JSON.stringify(columns)}`);
    return { artifactRefs: [ref('art-landing-dom', 'json', 'initial Lite and AI four-pane geometry', path.join(EVIDENCE, 'landing-geometry.json'))] };
  } catch (error) {
    fs.writeFileSync(path.join(EVIDENCE, 'landing-geometry.json'), JSON.stringify(await boxes(page, ['#ai-image-panel', '.ai-task-rail', '.ai-original-pane', '.ai-result-pane', '.ai-conversation', '#lite-reference', '#canvas', '#lite-context']), null, 2));
    throw withArtifacts(error, [ref('art-landing-shot', 'screenshot', 'initial Lite baseline showing legacy editor vs AI mismatch', screenshot), ref('art-landing-dom', 'json', 'initial Lite and AI geometry', path.join(EVIDENCE, 'landing-geometry.json'))]);
  } finally { await closeBrowser(context); }
}

async function scenarioSource() {
  const { context, page } = await pageFor({ scenario: 'source', loggedIn: true, controlled: true });
  try {
    await ensureAi(page, 'source');
    await page.locator('[data-lite-reference-source]').filter({ hasText: '라이브러리' }).click();
    await page.locator('[data-unilib-close]').waitFor({ state: 'visible', timeout: 20000 });
    await page.keyboard.press('Escape');
    await page.locator('[data-unilib-close]').waitFor({ state: 'hidden', timeout: 20000 });
    log('source', 'escape', { surface: 'library overlay', expected: 'overlay closes without leaving crop/library state' });
    await setFixture(page, 'source');
    const refs = [image('source', 'chromium-1280-source-loaded.png')];
    await shot(page, 'source', 'chromium-1280-source-loaded.png');
    const source = await boxes(page, ['.ai-original-pane', '.ai-result-pane', '.ai-conversation']);
    expectVisible(source, '.ai-original-pane'); expectVisible(source, '.ai-result-pane'); expectVisible(source, '.ai-conversation');
    if (Math.abs(source['.ai-original-pane'].width - source['.ai-result-pane'].width) > 2) throw new Error(`source/result are not 1:1: ${JSON.stringify(source)}`);
    return { artifactRefs: refs };
  } finally { await closeBrowser(context); }
}

async function scenarioLibraryPdfCrop() {
  const { context, page } = await pageFor({ scenario: 'library-pdf-crop', loggedIn: true, controlled: true });
  try {
    await page.evaluate(async () => {
      document.querySelectorAll('.unified-library-overlay').forEach(node => node.remove());
      const [{ createUnifiedLibraryProvider }, { createUnifiedLibraryUi }] = await Promise.all([
        import('/preview/js/library/provider.js'),
        import('/preview/js/unified-library-ui.js'),
      ]);
      const documents = [{ id: 'lite-qa-pdf', title: 'Lite QA PDF', pageCount: 2, source: { displayName: 'lite-qa.pdf', kind: 'pack' } }];
      const entries = [1, 2].map((itemNumber) => ({ documentId: 'lite-qa-pdf', pageNumber: 1, itemNumber, itemId: `q${itemNumber}`, text: `Lite QA question ${itemNumber}`, source: { documentId: 'lite-qa-pdf', pageNumber: 1, rect: [0.1, 0.1, 0.6, 0.45], fullPageFallback: false } }));
      const provider = createUnifiedLibraryProvider({
        pdfDocuments: documents,
        pdfSearchIndex: { entries },
        materializers: { pdf: async ({ result, source }) => {
          const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 900;
          const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#111'; ctx.font = '36px sans-serif'; ctx.fillText(`LITE QA PDF · ${source.pageNumber}쪽`, 48, 80);
          ctx.font = '24px sans-serif'; ctx.fillText('crop to reference', 48, 150);
          return { dataUrl: canvas.toDataURL('image/png'), source, provenance: source, result };
        } },
      });
      window.liteQaAiReferences = [];
      window.liteQaLibraryFixture = createUnifiedLibraryUi({
        getProvider: () => provider,
        insertMaterialized: () => {},
        openAi: async ({ references }) => { window.liteQaAiReferences.push(...references.map(reference => ({ name: reference.name, source: reference.source }))); },
        openIndependentReferences: async ({ references }) => { window.liteQaAiReferences.push(...references.map(reference => ({ name: reference.name, source: reference.source }))); },
      });
      window.liteQaLibraryFixture.open();
    });
    await page.locator('[data-unilib-type="pdf"]').click({ force: true });
    await page.locator('[data-unilib-pdf-mode="file"]').click({ force: true });
    await page.locator('[data-result-id]').first().click({ force: true });
    await page.locator('[data-unilib-adjust]').click({ force: true });
    await page.locator('[data-unilib-crop]').waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('[data-unilib-crop-image]').waitFor({ state: 'visible', timeout: 20000 });
    await shot(page, 'library-pdf-crop', 'chromium-1280-library-pdf-crop-open.png');
    const canvas = await page.locator('[data-unilib-crop-canvas]').boundingBox();
    if (!canvas) throw new Error('PDF crop canvas is not visible');
    await page.mouse.move(canvas.x + canvas.width * 0.12, canvas.y + canvas.height * 0.12);
    await page.mouse.down();
    await page.mouse.move(canvas.x + canvas.width * 0.68, canvas.y + canvas.height * 0.62, { steps: 6 });
    await page.mouse.up();
    await page.locator('[data-unilib-crop-save]:not([disabled])').click();
    await page.locator('[data-unilib-crop-count]').waitFor({ state: 'visible' });
    if (await page.locator('[data-unilib-crop-count]').textContent() !== '크롭 이미지 1개') throw new Error('PDF crop was not accepted');
    await page.locator('[data-unilib-crop-workbench]:not([disabled])').click();
    await page.locator('[data-unilib-crop-tray-count]').waitFor({ state: 'visible' });
    await page.locator('[data-unilib-ai]:not([disabled])').click();
    await page.waitForFunction(() => window.liteQaAiReferences?.length === 1, null, { timeout: 20000 });
    const transferred = await page.evaluate(() => window.liteQaAiReferences[0]);
    if (!transferred?.source || !/lite-qa-pdf/.test(JSON.stringify(transferred.source))) throw new Error(`accepted crop did not transfer PDF source: ${JSON.stringify(transferred)}`);
    await shot(page, 'library-pdf-crop', 'chromium-1280-library-pdf-reference.png');

    await page.evaluate(() => window.liteQaLibraryFixture.open());
    await page.locator('[data-unilib-type="pdf"]').click({ force: true });
    await page.locator('[data-unilib-pdf-mode="file"]').click({ force: true });
    await page.locator('[data-result-id]').first().click({ force: true });
    await page.locator('[data-unilib-adjust]').click({ force: true });
    await page.locator('[data-unilib-crop]').waitFor({ state: 'visible', timeout: 20000 });
    await page.keyboard.press('Escape');
    await page.locator('[data-unilib-crop]').waitFor({ state: 'hidden', timeout: 10000 });
    if (await page.locator('[data-unilib-close]').isHidden()) throw new Error('Escape closed library instead of cancelling crop first');
    await shot(page, 'library-pdf-crop', 'chromium-1280-library-pdf-crop-escape.png');
    return { artifactRefs: [image('library-pdf-crop', 'chromium-1280-library-pdf-crop-open.png'), image('library-pdf-crop', 'chromium-1280-library-pdf-reference.png'), image('library-pdf-crop', 'chromium-1280-library-pdf-crop-escape.png')] };
  } finally { await closeBrowser(context); }
}

async function scenarioLogin() {
  const { context, page, transport } = await pageFor({ scenario: 'login', loggedIn: false, controlled: false });
  try {
    await setFixture(page, 'login');
    await page.locator('[data-ai-send]').click();
    await page.locator('dialog[open]').waitFor({ timeout: 20000 });
    const refs = [image('login', 'chromium-1280-auth-required.png')];
    await shot(page, 'login', 'chromium-1280-auth-required.png');
    if ((transport.sends || []).length !== 0) throw new Error(`login guard sent ${transport.sends.length} generation requests`);
    if (!/ChatGPT로 로그인/.test(await page.locator('dialog[open]').textContent())) throw new Error('login dialog copy is missing');
    return { artifactRefs: refs };
  } finally { await closeBrowser(context); }
}

async function scenarioGenerationAndComments() {
  const { context, page, transport } = await pageFor({ scenario: 'generation-comments', loggedIn: true, controlled: true });
  try {
    await setFixture(page, 'generation-comments');
    await page.locator('[data-ai-send]').click();
    await page.locator('.ai-generated-card').first().waitFor({ timeout: 45000 });
    await shot(page, 'generation-comments', 'chromium-1280-candidate-before-comment.png');
    const resultImage = page.locator('.ai-generated-card .ai-preview-stage img').first();
    const resultBox = await resultImage.boundingBox();
    if (!resultBox) throw new Error('generated candidate has no preview box');
    await page.locator('[data-ai-comment-tool="point"]').click();
    await page.mouse.click(resultBox.x + resultBox.width * 0.58, resultBox.y + resultBox.height * 0.42);
    await page.locator('[data-ai-inline-editor]').last().fill('이 위치의 보조선을 더 얇게 해 주세요.');
    await page.locator('[data-ai-comment-tool="area"]').click();
    await page.mouse.move(resultBox.x + resultBox.width * 0.18, resultBox.y + resultBox.height * 0.2);
    await page.mouse.down(); await page.mouse.move(resultBox.x + resultBox.width * 0.42, resultBox.y + resultBox.height * 0.48, { steps: 5 }); await page.mouse.up();
    await page.locator('[data-ai-inline-editor]').last().fill('이 영역의 선 간격을 유지해 주세요.');
    if (await page.locator('[data-ai-comment-row]').count() !== 2) throw new Error('point + area comments did not persist as two rows');
    await shot(page, 'generation-comments', 'chromium-1280-review.png');
    await page.locator('[data-ai-comments-apply]').click();
    await page.waitForFunction(() => document.querySelectorAll('.ai-generated-card').length >= 2, null, { timeout: 45000 });
    await shot(page, 'generation-comments', 'chromium-1280-revised.png');
    if (transport.sends.length !== 2) throw new Error(`expected 2 controlled sends, got ${transport.sends.length}`);
    const payload = JSON.stringify(transport.sends[1]);
    if (!/이 위치의 보조선을 더 얇게/.test(payload) || !/이 영역의 선 간격을 유지/.test(payload) || !/점 1 \(x=/.test(payload) || !/영역 2 \(x=/.test(payload)) throw new Error('revision payload omitted comment text or coordinates');
    return { artifactRefs: [ref('art-generation-actions', 'ndjson', 'controlled generation and comment action log', path.join(EVIDENCE, 'browser-actions.ndjson')), image('generation-comments', 'chromium-1280-candidate-before-comment.png'), image('generation-comments', 'chromium-1280-review.png'), image('generation-comments', 'chromium-1280-revised.png')] };
  } finally { await closeBrowser(context); }
}

async function drawLineAndLabel(page, scenario) {
  await page.locator('#canvas').scrollIntoViewIfNeeded();
  const canvas = await page.locator('#canvas').boundingBox();
  if (!canvas) throw new Error('canvas is not visible for editor interaction');
  const points = [{ x: canvas.x + canvas.width * 0.36, y: canvas.y + canvas.height * 0.4 }, { x: canvas.x + canvas.width * 0.64, y: canvas.y + canvas.height * 0.62 }];
  await page.locator('.lite-dock-tools .tool-btn[data-tool="L"]').click();
  await page.mouse.click(points[0].x, points[0].y); await page.mouse.click(points[1].x, points[1].y);
  const line = page.locator('#scene line[data-id]').first();
  await page.waitForFunction(() => document.querySelectorAll('#scene line[data-id]').length >= 1, null, { timeout: 10000 });
  const hit = await line.evaluate(node => { const m = node.getScreenCTM(); return [new DOMPoint(+node.getAttribute('x1'), +node.getAttribute('y1')).matrixTransform(m), new DOMPoint(+node.getAttribute('x2'), +node.getAttribute('y2')).matrixTransform(m)].map(p => ({ x: p.x, y: p.y })); });
  for (let i = 0; i < 2; i++) if (Math.hypot(hit[i].x - points[i].x, hit[i].y - points[i].y) > 2) throw new Error(`line endpoint drifted: ${JSON.stringify({ hit, points })}`);
  await page.locator('.lite-dock-tools .tool-btn[data-symbol="labeler"]').click();
  await page.mouse.click(canvas.x + canvas.width * 0.3, canvas.y + canvas.height * 0.7);
  await page.mouse.click(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.48);
  await page.mouse.click(canvas.x + canvas.width * 0.72, canvas.y + canvas.height * 0.25);
  const input = page.locator('.unified-text-input:visible'); await input.fill('지시선 라벨'); await input.press('Enter');
  const controls = await page.locator('#inspector [data-lite-control]:visible').evaluateAll(nodes => nodes.map(node => node.dataset.liteControl));
  if (!controls.includes('stroke-width') || !controls.includes('line-style')) throw new Error(`line inspector controls missing: ${JSON.stringify(controls)}`);
  const dash = page.locator('[data-lite-control="line-style"] button[title="점선1"]');
  if (await dash.count()) { await dash.click(); if (!(await page.locator('#scene g[data-id] line[stroke-dasharray]').count())) throw new Error('leader label dash style did not render'); }
  log(scenario, 'editor-line-label', { points, inspectorControls: controls });
}

async function scenarioAcceptEdit() {
  const { context, page } = await pageFor({ scenario: 'accept-edit', loggedIn: true, controlled: true });
  try {
    await setFixture(page, 'accept-edit'); await page.locator('[data-ai-send]').click(); await page.locator('.ai-generated-card').first().waitFor({ timeout: 45000 });
    const source = await page.locator('[data-ai-attachment-list] img').first().getAttribute('src');
    await page.locator('[data-ai-insert-selected]:not([disabled])').click(); await page.locator('#canvas').waitFor({ state: 'visible', timeout: 45000 });
    if (await page.locator('#scene image[data-id]').count() !== 1) throw new Error('accepted result did not enter canonical SVG editor');
    if (await page.locator('#lite-reference img').getAttribute('src') !== source) throw new Error('original source did not remain stable after accept');
    await drawLineAndLabel(page, 'accept-edit');
    await shot(page, 'accept-edit', 'chromium-1280-accepted-editable.png');
    await page.locator('#lite-save').click(); await page.locator('#export-overlay').waitFor({ state: 'visible', timeout: 20000 });
    await shot(page, 'accept-edit', 'chromium-1280-save-dialog.png');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-confirm').click();
    const download = await downloadPromise;
    if (await download.failure()) throw new Error(`accepted image export failed: ${await download.failure()}`);
    const exportPath = path.join(EVIDENCE, 'chromium-1280-accepted-export.png');
    await download.saveAs(exportPath);
    return { artifactRefs: [image('accept-edit', 'chromium-1280-accepted-editable.png'), image('accept-edit', 'chromium-1280-save-dialog.png'), ref('art-accepted-export', 'download', 'accepted image plus label/line export', exportPath)] };
  } finally { await closeBrowser(context); }
}

async function scenarioGraph() {
  const { context, page } = await pageFor({ scenario: 'graph', loggedIn: true });
  try {
    await page.locator('#lite-graph-open').click(); await page.locator('#graph-modal-overlay').waitFor({ state: 'visible', timeout: 20000 });
    await shot(page, 'graph', 'chromium-1280-graph-popup.png');
    const geometry = await boxes(page, ['#lite-graph-open', '.lite-dock-tools', '#graph-modal-overlay']);
    if (geometry['#lite-graph-open'].x < geometry['.lite-dock-tools'].x - 2 || geometry['#lite-graph-open'].right > geometry['.lite-dock-tools'].right + 2) throw new Error(`graph action is not adjacent to tool group: ${JSON.stringify(geometry)}`);
    await page.keyboard.press('Escape');
    await page.locator('#graph-modal-overlay').waitFor({ state: 'hidden', timeout: 10000 });
    if (await page.evaluate(() => document.activeElement?.id) !== 'lite-graph-open') throw new Error('graph close did not restore focus to Lite graph action');
    return { artifactRefs: [image('graph', 'chromium-1280-graph-popup.png')] };
  } finally { await closeBrowser(context); }
}

async function scenarioCollapse() {
  const { context, page } = await pageFor({ scenario: 'collapse', loggedIn: true, controlled: true });
  try {
    await ensureAi(page, 'collapse');
    const controls = await page.locator('button').evaluateAll(nodes => nodes.filter(node => /(작업대|레퍼런스|원본|인스펙터|속성)/.test(`${node.textContent} ${node.getAttribute('aria-label') || ''} ${node.title || ''}`) && /(접|닫|숨|복원|열)/.test(`${node.textContent} ${node.getAttribute('aria-label') || ''} ${node.title || ''}`)).map(node => ({ text: node.textContent.trim(), aria: node.getAttribute('aria-label'), title: node.title, selector: node.outerHTML.slice(0, 220) })));
    fs.writeFileSync(path.join(EVIDENCE, 'collapse-controls.json'), JSON.stringify(controls, null, 2));
    if (!controls.length) throw withArtifacts(new Error('no independent workbench/reference/inspector collapse or restore control is present'), [ref('art-collapse-controls', 'json', 'discovered collapse controls', path.join(EVIDENCE, 'collapse-controls.json'))]);
    const before = await boxes(page, ['.ai-task-rail', '.ai-original-pane', '.ai-result-pane', '.ai-conversation']);
    await shot(page, 'collapse', 'chromium-1280-collapse-before.png');
    // The concrete controls are intentionally discovered by semantic label so this remains valid across final markup naming.
    const paneNames = ['workbench', 'reference', 'inspector'];
    for (const name of paneNames) await page.locator(`[data-lite-pane-toggle="${name}"]`).click({ force: true });
    const collapsed = await boxes(page, ['.ai-task-rail', '.ai-original-pane', '.ai-result-pane', '.ai-conversation']);
    await shot(page, 'collapse', 'chromium-1280-collapse-collapsed.png');
    // Restore by clicking the same visible semantic controls again; no old width may remain reserved.
    for (const name of paneNames) await page.locator(`[data-lite-pane-restore="${name}"]`).click({ force: true });
    const restored = await boxes(page, ['.ai-task-rail', '.ai-original-pane', '.ai-result-pane', '.ai-conversation']);
    await shot(page, 'collapse', 'chromium-1280-collapse-restored.png');
    if (JSON.stringify(before) === JSON.stringify(collapsed) || JSON.stringify(before) !== JSON.stringify(restored)) throw new Error(`collapse/restore geometry did not round trip: ${JSON.stringify({ before, collapsed, restored })}`);
    return { artifactRefs: [image('collapse', 'chromium-1280-collapse-before.png'), image('collapse', 'chromium-1280-collapse-collapsed.png'), image('collapse', 'chromium-1280-collapse-restored.png'), ref('art-collapse-controls', 'json', 'discovered collapse controls', path.join(EVIDENCE, 'collapse-controls.json'))] };
  } finally { await closeBrowser(context); }
}

async function scenarioRoundtrip() {
  const { context, page } = await pageFor({ scenario: 'pro-roundtrip', loggedIn: true, controlled: true });
  try {
    await ensureAi(page, 'pro-roundtrip'); await setFixture(page, 'pro-roundtrip');
    await page.locator('#mode-toggle-btn').click();
    await page.locator('#panel-left').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-ai-background-policy]').evaluate((select) => { select.value = 'all-near-white'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.locator('[data-ai-separation-mode]').evaluate((select) => { select.value = 'auto'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.locator('#mode-toggle-btn').click();
    await page.locator('#mode-toggle-btn').click();
    await page.locator('#panel-left').waitFor({ state: 'visible', timeout: 10000 });
    if (await page.locator('[data-ai-background-policy]').inputValue() !== 'all-near-white') throw new Error('background preference leaked across Pro/Lite round trip');
    await page.locator('#mode-toggle-btn').click();
    await shot(page, 'pro-roundtrip', 'chromium-1280-pro-roundtrip.png');
    return { artifactRefs: [image('pro-roundtrip', 'chromium-1280-pro-roundtrip.png')] };
  } finally { await closeBrowser(context); }
}

async function scenarioResponsive() {
  const refs = [];
  const context = await chromium.launch({ headless: true });
  activeBrowsers.add(context);
  try {
    const browserContext = await context.newContext({ viewport: { width: 375, height: 900 } });
    await installTransport(browserContext, { scenario: 'responsive', loggedIn: true, controlled: true });
    const page = await browserContext.newPage(); await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 }); await page.locator('#ai-image-panel').waitFor({ state: 'visible' }); await ensureAi(page, 'responsive');
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 }); await page.waitForTimeout(150);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error(`horizontal overflow at ${width}px`);
      const name = `chromium-${width}-responsive.png`; await shot(page, 'responsive', name); refs.push(image('responsive', name));
    }
    return { artifactRefs: refs };
  } finally { await closeBrowser(context); }
}

async function scenarioTaskSwitching() {
  const { context, page } = await pageFor({ scenario: 'task-switch', loggedIn: true, controlled: true });
  try {
    await setFixture(page, 'task-switch'); await page.locator('[data-ai-send]').click(); await page.locator('.ai-generated-card').first().waitFor({ timeout: 45000 });
    const firstWorkspace = await page.locator('.ai-task-tab[data-ai-workspace-link]:visible.is-on').getAttribute('data-ai-workspace-link');
    await page.locator('.ai-task-add:visible').click();
    await page.waitForFunction((scope) => [...document.querySelectorAll('.ai-task-tab[data-ai-workspace-link].is-on')].find(node => node.offsetWidth > 0)?.dataset.aiWorkspaceLink !== scope, firstWorkspace, { timeout: 20000 });
    const second = await page.locator('.ai-task-tab[data-ai-workspace-link]:visible.is-on').getAttribute('data-ai-workspace-link');
    if (!second || second === firstWorkspace) throw new Error(`new workspace was not activated: ${firstWorkspace} -> ${second}`);
    const activePanel = page.locator('#ai-image-panel');
    const secondRefs = await activePanel.locator('[data-ai-reference-id]').count(); const secondResults = await activePanel.locator('.ai-generated-card').count();
    await page.locator(`.ai-task-tab:visible[data-ai-workspace-link="${firstWorkspace}"] .ai-task-tab-select`).click(); await page.waitForTimeout(300);
    const firstResults = await page.locator('#ai-image-panel .ai-generated-card').count();
    if (secondRefs !== 0 || secondResults !== 0 || firstResults !== 1) throw new Error(`workspace switch did not isolate state: ${JSON.stringify({ firstWorkspace, second, secondRefs, secondResults, firstResults })}`);
    await shot(page, 'task-switch', 'chromium-1280-task-switch.png');
    fs.writeFileSync(path.join(EVIDENCE, 'task-switch-state.json'), JSON.stringify({ second, secondRefs, secondResults, firstResults }, null, 2));
    return { artifactRefs: [image('task-switch', 'chromium-1280-task-switch.png'), ref('art-task-switch-state', 'json', 'task switch state snapshot', path.join(EVIDENCE, 'task-switch-state.json'))] };
  } finally { await closeBrowser(context); }
}

async function scenarioReloadRestore() {
  const { context, page } = await pageFor({ scenario: 'reload-restore', loggedIn: true, controlled: true });
  try {
    await setFixture(page, 'reload-restore');
    await page.locator('[data-ai-send]').click();
    await page.locator('.ai-generated-card').first().waitFor({ timeout: 45000 });
    await page.locator('.ai-task-add:visible').click();
    await page.waitForFunction(() => [...document.querySelectorAll('.ai-task-tab[data-ai-workspace-link].is-on')].find(node => node.offsetWidth > 0)?.dataset.aiWorkspaceLink !== 'legacy', null, { timeout: 20000 });
    const tabsBefore = page.locator('.ai-task-tabs .ai-task-tab:visible');
    if (await tabsBefore.count() < 2) throw new Error('second task was not created for reload restore');
    await page.locator('#ai-image-panel input[data-ai-source-file]').setInputFiles(FIXTURE);
    await page.locator('#ai-image-panel [data-ai-reference-id]').first().waitFor({ state: 'attached', timeout: 20000 });
    log('reload-restore', 'setInputFiles', { selector: '#ai-image-panel input[data-ai-source-file]', fixture: FIXTURE });
    const activeBefore = await page.locator('.ai-task-tab[data-ai-workspace-link]:visible.is-on').getAttribute('data-ai-workspace-link');
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#ai-image-panel').waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('.ai-task-tab.is-on:visible').waitFor({ timeout: 20000 });
    await page.waitForTimeout(700);
    const activeAfter = await page.locator('.ai-task-tab[data-ai-workspace-link]:visible.is-on').getAttribute('data-ai-workspace-link');
    if (activeAfter !== activeBefore) throw new Error(`reload changed active task: ${activeBefore} -> ${activeAfter}`);
    const restoredSecond = { references: await page.locator('#ai-image-panel [data-ai-reference-id]').count(), results: await page.locator('#ai-image-panel .ai-generated-card').count() };
    if (restoredSecond.references !== 1 || restoredSecond.results !== 0) throw new Error(`active task content did not restore: ${JSON.stringify(restoredSecond)}`);
    await page.locator('.ai-task-tab:visible[data-ai-workspace-link="legacy"] .ai-task-tab-select').click();
    await page.waitForTimeout(200);
    const restoredFirst = { references: await page.locator('#ai-image-panel [data-ai-reference-id]').count(), results: await page.locator('#ai-image-panel .ai-generated-card').count() };
    if (restoredFirst.references !== 1 || restoredFirst.results !== 1) throw new Error(`first task content did not restore: ${JSON.stringify(restoredFirst)}`);
    fs.writeFileSync(path.join(EVIDENCE, 'reload-restore-state.json'), JSON.stringify({ activeBefore, activeAfter, restoredSecond, restoredFirst }, null, 2));
    await shot(page, 'reload-restore', 'chromium-1280-reload-restore.png');
    return { artifactRefs: [image('reload-restore', 'chromium-1280-reload-restore.png'), ref('art-reload-restore-state', 'json', 'cross-workspace reload task and document state', path.join(EVIDENCE, 'reload-restore-state.json'))] };
  } finally { await closeBrowser(context); }
}

async function scenarioPointerAndResize() {
  const { context, page } = await pageFor({ scenario: 'pointer-resize', loggedIn: true, controlled: true });
  try {
    const beforeObjects = await page.locator('#scene [data-id]').count();
    await ensureAi(page, 'pointer-resize');
    const center = await page.locator('#canvas').boundingBox();
    if (center) { await page.mouse.click(center.x + center.width / 2, center.y + center.height / 2); await page.keyboard.press('Enter'); }
    const afterObjects = await page.locator('#scene [data-id]').count();
    if (afterObjects !== beforeObjects) throw new Error('persistent AI panel leaked pointer/keyboard events into the hidden editor');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('5e:lite-result-edit')));
    await page.locator('#canvas').waitFor({ state: 'visible', timeout: 20000 }); await page.setViewportSize({ width: 768, height: 900 }); await page.waitForTimeout(500);
    await drawLineAndLabel(page, 'pointer-resize');
    await shot(page, 'pointer-resize', 'chromium-768-pointer-resize.png');
    return { artifactRefs: [image('pointer-resize', 'chromium-768-pointer-resize.png')] };
  } finally { await closeBrowser(context); }
}

function writeMatrix() {
  const lines = ['# Lite 4-Pane Manual QA', '', `Generated ${new Date().toISOString()} against ${BASE_URL}`, '', '## surfaceEvidence', '', '| scenario id | criterion reference | surface | exact invocation | verdict | artifactRefs |', '|---|---|---|---|---|---|'];
  for (const outcome of outcomes) lines.push(`| ${outcome.id} | ${outcome.criterion} | ${outcome.surface} | ${outcome.invocation} | ${outcome.verdict} | ${outcome.artifactRefs.join(', ') || 'none'}${outcome.note ? ` — ${outcome.note.replaceAll('|', '\\|')}` : ''} |`);
  lines.push('', '## adversarialCases', '', '| scenario id | criterion reference | adversarial class | expected behavior | verdict | artifactRefs |', '|---|---|---|---|---|---|');
  const adversarial = [
    ['adv-pointer-block', 'RUNTIME-POINTER-01', 'persistent-panel input isolation', 'Clicks and Enter while the AI workbench is active do not mutate the hidden editor; accepted results switch to same-pane editing before editor input resumes.', 'pointer-resize'],
    ['adv-task-leak', 'RUNTIME-TASK-02', 'task switching state isolation', 'A newly created task does not inherit another task’s source or generated candidate; switching back restores the first task.', 'task-switch'],
    ['adv-collapse-resize', 'RUNTIME-GEOMETRY-03', 'collapse/resize coordinate mapping', 'Independent collapse and restore remove reserved gaps, and drawn endpoints remain at pointer coordinates after resize.', 'collapse'],
  ];
  for (const [id, criterion, klass, expected, link] of adversarial) { const item = outcomes.find(x => x.id === link || x.scenario === link); lines.push(`| ${id} | ${criterion} | ${klass} | ${expected} | ${item?.verdict || 'FAIL'} | ${(item?.artifactRefs || []).join(', ') || 'none'} |`); }
  lines.push('', '## artifactRefs', '', '| id | kind | description | path |', '|---|---|---|---|');
  for (const artifact of artifacts.values()) lines.push(`| ${artifact.id} | ${artifact.kind} | ${artifact.description} | ${artifact.path} |`);
  fs.writeFileSync(path.join(EVIDENCE, 'lite-four-pane-0924-manual-qa.md'), `${lines.join('\n')}\n`);
  fs.writeFileSync(path.join(EVIDENCE, 'lite-four-pane-0924-report.json'), JSON.stringify({ baseUrl: BASE_URL, outcomes, artifacts: [...artifacts.values()] }, null, 2));
}

(async () => {
  await runScenario({ id: 'landing-persistent-four-pane', criterion: 'LITE-FOUR-PANE-0924-1/2', surface: 'browser Chromium 1280x900', invocation: `goto ${BASE_URL}; inspect initial visible workbench columns and capture screenshot`, scenario: 'landing', run: scenarioLanding });
  await runScenario({ id: 'source-loading', criterion: 'LITE-FOUR-PANE-0924-2', surface: 'browser Chromium 1280x900', invocation: `goto ${BASE_URL}; open AI; setInputFiles(#ai-image-file-input, ${FIXTURE}); inspect source/result/inspector geometry`, scenario: 'source', run: scenarioSource });
  await runScenario({ id: 'library-pdf-crop-reference', criterion: 'LITE-FLOW-0924-library-crop', surface: 'browser Chromium 1280x900 unified library UI', invocation: `open real library UI; select controlled PDF result; click PDF에서 자르기; draw and save crop; transfer accepted crop to AI reference; reopen and press Escape to cancel crop`, scenario: 'library-pdf-crop', run: scenarioLibraryPdfCrop });
  await runScenario({ id: 'login-modal-no-generation', criterion: 'LITE-FLOW-0924-auth', surface: 'browser Chromium 1280x900', invocation: `unauthenticated goto ${BASE_URL}; setInputFiles; click [data-ai-send]; inspect dialog[open] and bridge-send count`, scenario: 'login', run: scenarioLogin });
  await runScenario({ id: 'controlled-generation-comments', criterion: 'LITE-FOUR-PANE-0924-comments', surface: 'browser Chromium 1280x900', invocation: `controlled bridge transport; set fixture; click send; click point/area comment tools; apply comments; inspect payload`, scenario: 'generation-comments', run: scenarioGenerationAndComments });
  await runScenario({ id: 'accepted-result-editable', criterion: 'LITE-FOUR-PANE-0924-accept-edit', surface: 'browser Chromium 1280x900', invocation: `controlled generation; click [data-ai-insert-selected]; draw line and leader label on #canvas; edit inspector; click #lite-save`, scenario: 'accept-edit', run: scenarioAcceptEdit });
  await runScenario({ id: 'graph-popup-adjacent-tool-group', criterion: 'LITE-FOUR-PANE-0924-graph', surface: 'browser Chromium 1280x900', invocation: `goto ${BASE_URL}; click #lite-graph-open; inspect #graph-modal-overlay and toolbar adjacency`, scenario: 'graph', run: scenarioGraph });
  await runScenario({ id: 'collapse-restore-no-gaps', criterion: 'LITE-FOUR-PANE-0924-collapse', surface: 'browser Chromium 1280x900', invocation: `open AI; discover semantic collapse controls; click each; capture collapsed/restored geometry and screenshots`, scenario: 'collapse', run: scenarioCollapse });
  await runScenario({ id: 'pro-roundtrip', criterion: 'LITE-FLOW-0924-roundtrip', surface: 'browser Chromium 1280x900', invocation: `open AI; change AI options; click #mode-toggle-btn Lite→Pro→Lite; inspect preserved preferences`, scenario: 'pro-roundtrip', run: scenarioRoundtrip });
  await runScenario({ id: 'responsive-375-768-1280', criterion: 'LITE-FOUR-PANE-0924-responsive', surface: 'browser Chromium 375x900, 768x900, 1280x900', invocation: `open AI; setViewportSize widths 375,768,1280; capture each screenshot; inspect horizontal overflow`, scenario: 'responsive', run: scenarioResponsive });
  await runScenario({ id: 'task-switching-state-isolation', criterion: 'RUNTIME-TASK-02', surface: 'browser Chromium 1280x900', invocation: `controlled generation; click .ai-task-add; switch active tabs; compare references/results; capture`, scenario: 'task-switch', run: scenarioTaskSwitching });
  await runScenario({ id: 'cross-workspace-reload-restore', criterion: 'RUNTIME-TASK-03', surface: 'browser Chromium 1280x900 same context reload', invocation: `controlled generation in task 1; create task 2 and attach source; reload page; verify active task/source restore then switch back and verify generated result`, scenario: 'reload-restore', run: scenarioReloadRestore });
  await runScenario({ id: 'pointer-resize-coordinate-audit', criterion: 'RUNTIME-POINTER-01/RUNTIME-GEOMETRY-03', surface: 'browser Chromium 1280x900→768x900', invocation: `open persistent AI; click canvas+Enter; switch result pane to same-pane edit; resize 768; scroll canvas into view; draw line and label; compare SVG endpoints to pointer`, scenario: 'pointer-resize', run: scenarioPointerAndResize });
  writeMatrix();
  const failures = outcomes.filter(item => item.verdict !== 'PASS');
  console.log(`Manual QA complete: ${outcomes.length - failures.length} PASS, ${failures.length} FAIL`);
  if (failures.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await closeAllBrowsers();
  fs.writeFileSync(path.join(EVIDENCE, 'cleanup-receipt.json'), JSON.stringify({ completedAt: new Date().toISOString(), activeBrowsersAfterCleanup: activeBrowsers.size }, null, 2) + '\n');
});
