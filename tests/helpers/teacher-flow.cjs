// 교사 흐름 검사 공용 도우미: 실제 앱(/)을 열고, 바깥 네트워크 대신 고정 자료를 돌려준다.
// - Drive 자료집: 직접 그린 교과서 PDF 한 권(실제 pdf.js가 그린다). SHA-256까지 앱이 검증한다.
// - AI: 녹화된 이미지 응답(tests/fixtures/teacher-flows/ai-image-turn.json)을 재생한다. 실제 AI 호출 0회.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { withServer } = require('./rhwp-exam.cjs');

const GATEWAY_HOST = '5e-google-drive-gateway.5e-desktop.workers.dev';
const TEXTBOOK_PATH = '교과서/통합과학/circuit-textbook.pdf';
const hash = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value);

// 검사용으로 직접 그린 교과서 한 쪽: 제목·본문 줄·회로 그림(전지·저항·전구). 외부 자료 없음.
function textbookPdf() {
  const zigzag = Array.from({ length: 6 }, (_, k) => `${250 + k * 16} ${k % 2 ? 585 : 615} l`).join(' ');
  const circle = (x, y, r) => { const k = r * .5523;
    return `${x + r} ${y} m ${x + r} ${y + k} ${x + k} ${y + r} ${x} ${y + r} c ${x - k} ${y + r} ${x - r} ${y + k} ${x - r} ${y} c `
      + `${x - r} ${y - k} ${x - k} ${y - r} ${x} ${y - r} c ${x + k} ${y - r} ${x + r} ${y - k} ${x + r} ${y} c S`; };
  const body = [
    'BT /F1 20 Tf 60 780 Td (Integrated Science 1 - Electric Circuit) Tj ET',
    'BT /F1 11 Tf 60 750 Td (Figure 1 shows a battery, a resistor and a bulb in series.) Tj ET',
    '0.6 g 60 720 470 6 re f 60 705 420 6 re f 60 690 450 6 re f 0 g',
    '0 0 0 RG 4 w 120 380 m 120 600 l 230 600 l S 350 600 m 470 600 l 470 380 l 345 380 l S 285 380 m 120 380 l S',
    '3 w 100 500 m 140 500 l S 108 480 m 132 480 l S',
    `3 w 230 600 m ${zigzag} 350 600 l S`,
    `3 w ${circle(315, 380, 30)}`,
    '2 w 294 359 m 336 401 l S 294 401 m 336 359 l S',
    'BT /F1 13 Tf 230 330 Td (Figure 1. Series circuit) Tj ET',
    '0.6 g 60 290 470 6 re f 60 275 400 6 re f 0 g',
  ].join('\n') + '\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}endstream`,
  ];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

function textbookPack() {
  const id = 'teacher-flow-textbook';
  const source = { documentId: id, pageNumber: 1, rect: [.1, .25, .8, .35], fullPageFallback: false };
  const document = { schemaVersion: 'pdf-library-v1', id, title: 'circuit-textbook.pdf',
    source: { kind: 'pack', locator: `5e.shared.drive/${TEXTBOOK_PATH}`, displayName: 'circuit-textbook.pdf' },
    pageCount: 1, status: 'indexed', pages: [] };
  const catalog = { schemaVersion: 'pdf-library-v1', documentMetadata: {}, documents: [document] };
  const search = { schemaVersion: 'pdf-search-index-v1', entries: [{ documentId: id, pageNumber: 1,
    itemId: 'figure-1', itemNumber: 1, text: 'Series circuit battery resistor bulb', normalized: 'series circuit battery resistor bulb', metadata: {}, source }] };
  const pack = { schemaVersion: 1, id: '5e.shared.drive', version: 'teacher-flow-1', title: '5E 공유 자료',
    kind: 'textbook', subjects: [], academicYears: [], documentCount: 1, pageCount: 1,
    paths: { catalog: 'catalog.json', searchIndex: 'search-index.json', documents: [TEXTBOOK_PATH] } };
  const pdf = textbookPdf();
  const checksums = { algorithm: 'sha256', pack: hash(json(pack)), files: {
    'catalog.json': hash(json(catalog)), 'search-index.json': hash(json(search)), [TEXTBOOK_PATH]: hash(pdf) } };
  return { pack, checksums, catalog, search, pdf };
}

function recordedAiConversion() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/teacher-flows/ai-image-conversion.json'), 'utf8'));
}

// 브라우저 안에서 실행: 웹 ChatGPT 연결을 흉내 내고, 요청 종류에 맞는 녹화 응답을 이벤트로 재생한다.
// 녹화에 없는 요청이 오면 오류 이벤트로 끝내고 기록해 둔다(검사가 그 사실로 실패한다).
function installRecordedBridge(responses) {
  for (const prefix of ['', '5e.preview:']) localStorage.setItem(`${prefix}5e.tutorial.bannerSeen`, 'true');
  if (!responses) return;
  const pick = payload => responses.find(({ match }) =>
    (!match.purpose || payload?.purpose === match.purpose)
    && (!match.outputSchemaHas || JSON.stringify(payload?.outputSchema || {}).includes(match.outputSchemaHas))
    && (!match.textIncludes || String(payload?.text || '').includes(match.textIncludes)));
  const listeners = new Set(), sends = [];
  const bridge = {
    web: true, status: async () => ({ login: { loggedIn: true }, server: true }),
    start: async () => ({ ok: true }), stop: async () => ({ ok: true }),
    models: async () => ({ data: [
      { model: 'gpt-6.1-sol', displayName: 'Sol 6.1', isDefault: true, defaultReasoningEffort: 'medium', supportedReasoningEfforts: ['medium', 'high'], serviceTiers: ['priority'] },
      { model: 'gpt-6-luna', displayName: 'Luna 6', defaultReasoningEffort: 'medium', supportedReasoningEfforts: ['medium', 'high'], serviceTiers: ['priority'] },
    ] }),
    account: async () => ({ rateLimits: {} }), login: async () => {},
    send: async payload => {
      const turnId = `recorded-turn-${sends.length}`, threadId = `recorded-thread-${sends.length}`;
      const recorded = pick(payload), clientScope = payload?.clientScope || '';
      sends.push({ turnId, purpose: payload?.purpose || '', replayed: recorded?.name || null, text: String(payload?.text || '').slice(0, 300) });
      const emit = (method, params) => { for (const listener of listeners) listener({ clientScope, method, params }); };
      setTimeout(() => {
        if (!recorded) {
          emit('error', { turnId, error: { message: '녹화에 없는 AI 요청' } });
          emit('turn/completed', { turn: { id: turnId, status: 'failed' } });
          return;
        }
        const item = { id: `${turnId}-item`, ...recorded.reply };
        if (item.type === 'imageGeneration') emit('item/started', { turnId, item: { type: item.type, id: item.id } });
        else item.phase = 'final_answer';
        emit('item/completed', { turnId, item });
        emit('turn/completed', { turn: { id: turnId, status: 'completed' } });
      }, 150);
      return { turnId, threadId };
    },
    interrupt: async () => ({ ok: true }),
    onEvent: callback => { listeners.add(callback); return () => listeners.delete(callback); },
    onState: () => () => {}, onLog: () => () => {}, setAiTaskShortcutActive() {}, onAiCloseTaskShortcut: () => () => {},
  };
  // 앱의 실제 웹 연결 스크립트(editor-bridge.js)가 나중에 덮어쓰지 못하게 고정한다.
  Object.defineProperty(window, 'fiveEWebAI', { get: () => bridge, set() {}, configurable: false });
  window.__recordedAiSends = sends;
}

function evidenceDir(name) {
  const dir = path.resolve(process.env.EVIDENCE_DIR || path.join('.omo/evidence/teacher-flows', name));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function entryUrl(origin) {
  return process.env.PREVIEW_URL || new URL(process.env.APP_ENTRY || '/', origin).href;
}

// 앱을 열고 다크네이비 기본 화면인지 확인한다. 바깥 요청은 고정 자료가 아니면 막고 기록한다.
async function openApp(engine, origin, { ai = false } = {}) {
  const browser = await engine.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
  const fixture = textbookPack(), blocked = [], errors = [];
  await context.addInitScript(installRecordedBridge, ai ? recordedAiConversion().responses : null);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['http:', 'https:'].includes(url.protocol) || ['127.0.0.1', 'localhost'].includes(url.hostname)) return route.fallback();
    if (url.hostname === GATEWAY_HOST) {
      const name = decodeURIComponent(url.pathname);
      const body = name.endsWith('/pack.json') ? json(fixture.pack)
        : name.endsWith('/checksums.json') ? json(fixture.checksums)
        : name.endsWith('/catalog.json') ? json(fixture.catalog)
        : name.endsWith('/search-index.json') ? json(fixture.search)
        : name.endsWith(`/${TEXTBOOK_PATH}`) ? fixture.pdf : null;
      return body ? route.fulfill({ contentType: name.endsWith('.pdf') ? 'application/pdf' : 'application/json', body })
        : route.fulfill({ status: 404, body: 'missing' });
    }
    blocked.push(url.origin);
    return route.abort();
  });
  await context.route('**/assets/pdf-library/catalog-bootstrap.json', route => route.fulfill({ status: 404, body: 'teacher flow uses the fixture pack' }));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${entryUrl(origin)}?mode=pro&mobile=0`, { waitUntil: 'load' });
  await page.locator('#canvas').waitFor({ state: 'visible' });
  await assertNavy(page);
  return { browser, context, page, errors, blocked, fixture };
}

async function assertNavy(page) {
  const mode = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme, palette: document.documentElement.dataset.palette,
    button: document.getElementById('theme-toggle')?.dataset.colorMode,
  }));
  assert.deepEqual(mode, { theme: 'dark', palette: 'classic', button: 'navy' }, '기본 화면 색은 다크네이비여야 한다');
}

// 캔버스 상태(state.js)를 읽는다. 진입 화면이 불러온 것과 같은 모듈 인스턴스를 쓴다.
async function drawing(page) {
  return page.evaluate(async () => {
    const stateUrl = performance.getEntriesByType('resource').map(entry => entry.name).find(name => /\/state\.js(\?|$)/.test(name));
    const { state } = await import(stateUrl);
    const s = state.get();
    return { objects: JSON.parse(JSON.stringify(s.objects)), activePageId: s.activePageId };
  });
}

// PNG 바이트(또는 data URL)의 크기와 먹(어두운 픽셀) 비율. 빈 그림·흰 종이를 걸러 낸다.
function inkStats(input) {
  const { PNG } = require('pngjs');
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(String(input).replace(/^data:image\/png;base64,/, ''), 'base64');
  const png = PNG.sync.read(bytes);
  let ink = 0, opaque = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] < 128) continue;
    opaque++;
    if (png.data[i] + png.data[i + 1] + png.data[i + 2] < 3 * 96) ink++;
  }
  return { width: png.width, height: png.height, inkRatio: opaque ? ink / opaque : 0, opaqueRatio: opaque / (png.width * png.height), bytes };
}

// 앱이 내려 주는 파일을 실제 다운로드로 받아 증거 폴더에 저장한다.
async function download(page, trigger, evidence, file) {
  const waiting = page.waitForEvent('download');
  await trigger();
  const item = await waiting;
  const target = path.join(evidence, file);
  await item.saveAs(target);
  return { path: target, suggested: item.suggestedFilename(), bytes: fs.readFileSync(target) };
}

// 라이브러리 → 교과서 PDF → 그림 영역 자르기 → 크롭 모음(라이브러리 저장)까지. 열린 라이브러리를 돌려준다.
async function cropTextbookFigure(page) {
  await page.locator('#exam-library-open').click();
  const ui = page.locator('.unified-library-overlay').last();
  await page.waitForFunction(() => document.querySelector('.unified-library-overlay')?.dataset.searchReadiness === 'ready', null, { timeout: 30_000 });
  await ui.locator('[data-unilib-type="pdf"]').click();
  await ui.locator('[data-result-id*="teacher-flow-textbook"]').first().click();
  await ui.locator('[data-unilib-adjust]').click();
  await ui.locator('[data-unilib-crop-image]').waitFor();
  // 실제 pdf.js가 원본 해상도로 다 그릴 때까지 기다린다(미리보기 화질로 자르지 않게).
  await page.waitForFunction(() => {
    const image = document.querySelector('[data-unilib-crop-image]'), quality = document.querySelector('[data-unilib-crop-quality]');
    return image?.naturalWidth >= 600 && quality?.hidden;
  }, null, { timeout: 30_000 });
  const canvas = await ui.locator('[data-unilib-crop-canvas]').boundingBox();
  const at = (fx, fy) => ({ x: canvas.x + canvas.width * fx, y: canvas.y + canvas.height * fy });
  // 회로 그림(PDF 좌표 100~470, 330~620)을 감싸는 영역.
  const from = at(.14, .26), to = at(.82, .62);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up();
  await ui.locator('[data-unilib-crop-save]:not([disabled])').click();
  await ui.locator('[data-unilib-crop-count]').filter({ hasText: '1개' }).waitFor();
  return ui;
}

// 크롭 모음 → AI 이미지 변환 → 예비 작업대에서 "이미지"로 분류 → 작업대로 배치 → AI 작업실이 열린다.
async function sendTrayToWorkbench(page, ui) {
  await ui.locator('[data-unilib-ai]:not([disabled])').click();
  const assignment = page.locator('.workbench-assignment-overlay');
  await assignment.waitFor();
  const choices = assignment.locator('[data-classify-reference][data-conversion-kind="image"]');
  while (await choices.count()) await choices.first().click();
  await assignment.locator('[data-action="continue"]').click();
  const panel = page.locator('#ai-image-panel');
  await panel.waitFor({ state: 'visible', timeout: 20_000 });
  await ui.waitFor({ state: 'hidden' });
  return panel;
}

async function runEngines(name, scenario) {
  const evidence = evidenceDir(name);
  return withServer(async origin => {
    const receipts = [];
    for (const engine of [chromium, webkit]) {
      const app = await openApp(engine, origin, scenario.options);
      const shot = file => app.page.screenshot({ path: path.join(evidence, `${engine.name()}-${file}.png`) });
      try {
        const receipt = await scenario.run({ ...app, engine: engine.name(), evidence, shot });
        assert.deepEqual(app.errors, [], '페이지 오류가 없어야 한다');
        receipts.push({ engine: engine.name(), ...receipt, blockedExternalOrigins: [...new Set(app.blocked)] });
        console.log(`PASS ${engine.name()} ${name}`);
      } catch (error) {
        await shot('failure').catch(() => {});
        throw error;
      } finally {
        fs.writeFileSync(path.join(evidence, 'receipts.json'), JSON.stringify(receipts, null, 2) + '\n');
        await app.browser.close();
      }
    }
    return receipts;
  });
}

module.exports = { textbookPack, textbookPdf, recordedAiConversion, openApp, assertNavy, drawing, runEngines, evidenceDir, inkStats, download, cropTextbookFigure, sendTrayToWorkbench, TEXTBOOK_PATH };
