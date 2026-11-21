'use strict';
// GENSPEED(11-20) 「이 그림 고치기」 글자만 고치는 빠른 길을 가짜 설치판 연결로 돈다(실제 AI 안 부름, 캔버스 코드는 진짜).
//  1) 「T는 빼 줘」: 고칠 곳 찾기가 글자 상자를 주면 그림 AI를 부르지 않고 T만 지운 「생성 결과 2」가 생긴다(지나가는 선은 그대로).
//  2) 「C를 D로 바꿔 줘」: 기본은 그림 AI로 고친다(새 글자 글꼴 문제로 바꾸기는 기본 꺼짐).
//     5e.aiEngine.figureLocalReplace='1'이면 C 자리를 지우고 새 글자를 그려 넣는다(그 자리에 다시 진한 점이 생김).
//  3) 끄는 플래그(5e.aiEngine.figureSpeed='0')면 예전처럼 그림 AI로 고친다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const { openAiWorkflow, closeAiPanel } = require('./helpers/graph-entry.cjs');
process.env.APP_ENTRY = '/';
const PANEL = '#ai-image-panel';
const out = process.env.EVIDENCE_DIR;
if (out) fs.mkdirSync(out, { recursive: true });
const REF = fs.readFileSync(path.join(__dirname, 'fixtures/rights-clear-smoke.png')).toString('base64');
const REQ = '수평 막대 AB 위 O점에 받침, C에 비스듬한 줄 T를 매단 돌림힘 평형 모식도를 흑백으로 그려 줘';
const W = 1200, H = 800;
// 글자 자리(fillText 기준점, 44px 기울임 serif). 상자는 글자를 넉넉히 감싼다.
const LABELS = { A: [90, 395], B: [1090, 395], O: [400, 360], C: [860, 360], T: [640, 230] };
const box = (t) => { const [x, y] = LABELS[t]; return { x: (x - 4) / W, y: (y - 38) / H, w: 40 / W, h: 48 / H }; };

async function fakeDesktop(context) {
  await context.addInitScript(({ W, H, LABELS }) => {
    for (const p of ['', '5e.preview:']) { localStorage.setItem(p + '5e.tutorial.bannerSeen', 'true'); localStorage.setItem(p + '5e.mode', 'pro'); }
    const listeners = new Set();
    const draw = () => {
      const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.strokeStyle = '#000'; g.lineWidth = 4;
      g.strokeRect(130, 410, 940, 30); g.beginPath(); g.moveTo(420, 100); g.lineTo(860, 410); g.stroke();
      g.fillStyle = '#000'; g.font = 'italic 44px serif'; g.textBaseline = 'alphabetic';
      for (const [t, [x, y]] of Object.entries(LABELS)) g.fillText(t, x, y);
      return c.toDataURL('image/png');
    };
    const fake = window.__engineFake = { sends: [], reads: [], find: null, n: 0 };
    const emit = (m) => listeners.forEach((fn) => fn(m));
    window.fiveEDesktop = {
      web: false,
      status: async () => ({ login: { loggedIn: true }, server: true }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }),
      account: async () => ({ rateLimits: {} }), login: async () => {}, captureSources: async () => [],
      models: async () => ({ data: [{ model: 'gpt-6.1-sol', displayName: 'Sol 6.1', isDefault: true, defaultReasoningEffort: 'medium', supportedReasoningEfforts: ['medium'], serviceTiers: ['priority'] }] }),
      onEvent: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, onState: () => () => {}, onLog: () => () => {},
      setAiTaskShortcutActive() {}, onAiCloseTaskShortcut: () => () => {},
      interrupt: async () => ({ ok: true, acknowledged: true }),
      readImageText: async (payload) => {
        const text = String(payload.text);
        fake.reads.push(text.slice(0, 60));
        if (text.includes('일부만 고쳐') && fake.find) return { text: JSON.stringify(fake.find) };
        if (text.includes('고치기 전, 둘째')) return { text: '{"done":true,"unwanted":[],"sentences":[]}' };
        return { text: JSON.stringify({ type: '역학', scenes: ['수평 막대·지지 줄 돌림힘 평형 모식도'], keyValues: '', subject: '물리학Ⅱ', types: ['역학'], keywords: ['막대'], has: false, texts: [] }) };
      },
      send: async (payload) => {
        const turnId = `fake-${++fake.n}`;
        fake.sends.push({ purpose: payload.purpose || null });
        if (payload.purpose === 'image') (async () => {
          await new Promise((r) => setTimeout(r, 30));
          emit({ clientScope: payload.clientScope, method: 'item/completed', params: { turnId, item: { type: 'imageGeneration', status: 'completed', imageDataUrl: draw() } } });
          emit({ clientScope: payload.clientScope, method: 'turn/completed', params: { turn: { id: turnId, status: 'completed' } } });
        })();
        return { turnId, threadId: 'thread-' + turnId, renderThreadId: turnId };
      },
    };
  }, { W, H, LABELS });
}

const idle = (page) => page.waitForFunction((p) => document.querySelector(p)?.dataset.aiBusy !== 'true', PANEL, { timeout: 60000 });
const send = async (page, text) => { await page.locator(`${PANEL} [data-ai-chat-input]`).fill(text); await page.locator(`${PANEL} [data-ai-send]`).click(); };
const imageSends = (page) => page.evaluate(() => window.__engineFake.sends.filter((s) => s.purpose === 'image').length);
// 보는 결과 그림에서 상자 안 진한 점 수
const darkIn = (page, b) => page.evaluate(async ({ p, b, W, H }) => {
  const src = document.querySelector(`${p} .ai-chat-result.is-viewing img`)?.src;
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const sx = c.width / W, sy = c.height / H;
  const x0 = Math.round(b.x * W * sx), y0 = Math.round(b.y * H * sy), w = Math.round(b.w * W * sx), hh = Math.round(b.h * H * sy);
  const d = g.getImageData(x0, y0, w, hh).data; let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 < 128) n++;
  return n;
}, { p: PANEL, b, W, H });

h.withServer(async (origin) => {
  for (const [name, engine] of Object.entries({ chromium, webkit }).filter(([k]) => !process.env.BROWSER_ENGINE || k === process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
      await fakeDesktop(context);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await h.navigate(page, origin + '/?mode=pro&mobile=0&exam=0');
      await h.ready(page);
      await page.route(/https:\/\/5e-exam-(pdf|hak)\.5e-desktop\.workers\.dev\/q\/.*/, (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ question: { blocks: [{ kind: 'figure', figure: { data: 'data:image/png;base64,' + REF } }] } }) }));
      await openAiWorkflow(page, 'image-create');
      await page.waitForFunction((p) => document.querySelector(p).dataset.aiCreateUi === 'true', PANEL);
      await send(page, REQ);
      await idle(page); await page.waitForTimeout(400);
      const tBefore = await darkIn(page, box('T'));
      assert.ok(tBefore > 40, `${name}: T is drawn in result 1 (${tBefore})`);
      const lineBox = { x: 700 / W, y: 285 / H, w: 30 / W, h: 30 / H }; // T 아래를 지나는 줄
      const lineBefore = await darkIn(page, lineBox);
      assert.ok(lineBefore > 20, `${name}: the slanted line is drawn (${lineBefore})`);

      // 1) 「T는 빼 줘」 → 그림 AI 없이 T만 지움
      const sends1 = await imageSends(page);
      await page.evaluate((b) => { window.__engineFake.find = { targets: ['T'], keep: ['A', 'B'], summary: 'T만 지움', mode: 'text', ops: [{ op: 'remove', text: 'T', kind: 'qty', ...b }] }; }, box('T'));
      const t0 = Date.now();
      await send(page, 'T는 빼 줘');
      await idle(page); await page.waitForTimeout(400);
      assert.equal(await imageSends(page), sends1, `${name}: no image AI call for a text-only edit`);
      assert.equal(await page.locator(`${PANEL} [data-ai-version-button]`).textContent(), '생성 결과 2');
      assert.match(await page.locator(`${PANEL} .ai-chat-result.is-viewing`).textContent(), /1에서 고침 · T만 지움/);
      assert.equal(await darkIn(page, box('T')), 0, `${name}: T is gone`);
      assert.equal(await darkIn(page, lineBox), lineBefore, `${name}: the line next to T is untouched`);
      assert.ok(await darkIn(page, box('C')) > 40, `${name}: other labels stay`);
      console.log(`${name}: local remove ${Date.now() - t0}ms`);
      if (out) await page.screenshot({ path: path.join(out, `${name}-local-remove.png`) });

      // 2) 「C를 D로 바꿔 줘」 → 기본은 그림 AI로, 옵션을 켜면 C 자리에 새 글자
      await page.evaluate((b) => { window.__engineFake.find = { targets: ['C'], keep: [], summary: 'C를 D로', mode: 'text', ops: [{ op: 'replace', text: 'C', to: 'D', kind: 'en', ...b }] }; }, box('C'));
      await send(page, 'C를 D로 바꿔 줘');
      await idle(page); await page.waitForTimeout(400);
      assert.equal(await imageSends(page), sends1 + 1, `${name}: replace goes the redraw way by default`);
      assert.equal(await page.locator(`${PANEL} [data-ai-version-button]`).textContent(), '생성 결과 3');
      await page.locator(`${PANEL} .ai-chat-result-open`).nth(1).click(); // 결과 2(T를 지운 것)로 돌아가 거기서 바꾸기
      await page.waitForFunction((p) => document.querySelector(`${p} [data-ai-version-button]`).textContent === '생성 결과 2', PANEL);
      // 11-21 사용자 결정(css/ai-create.css): 「글자 빠르게」 줄은 화면에서 숨김 — 글자 바꾸기는 그림 AI 길로만. 기본 끔.
      await page.locator(`${PANEL} [data-ai-settings-change]`).click();
      const fastRow = page.locator(`${PANEL} [data-ai-fast-replace-row]`);
      assert.equal(await fastRow.isVisible(), false, `${name}: fast replace row is hidden (11-21 decision)`);
      assert.equal(await page.evaluate(() => localStorage.getItem('5e.aiEngine.figureLocalReplace')), null);
      await page.locator(`${PANEL} [data-ai-settings-change]`).click();
      // 숨긴 뒤에도 남은 저장값 길(5e.aiEngine.figureLocalReplace='1')은 그대로 돈다 — 저장값으로 켜서 본다.
      await page.evaluate(() => localStorage.setItem('5e.aiEngine.figureLocalReplace', '1'));
      await send(page, 'C를 D로 바꿔 줘');
      await idle(page); await page.waitForTimeout(400);
      assert.equal(await imageSends(page), sends1 + 1, `${name}: with the option, no image AI call`);
      assert.equal(await page.locator(`${PANEL} [data-ai-version-button]`).textContent(), '생성 결과 4');
      const cAfter = await darkIn(page, box('C'));
      assert.ok(cAfter > 30, `${name}: a new glyph is drawn where C was (${cAfter})`);
      assert.equal(await darkIn(page, box('T')), 0, `${name}: built on result 2 (T still gone)`);
      await page.evaluate(() => localStorage.setItem('5e.aiEngine.figureLocalReplace', '0'));
      assert.equal(await page.evaluate(() => import('/js/ai-engine-flags.js?v=1.7.0-four-session-integration').then((m) => m.figureLocalReplaceFlag())), false);
      if (out) await page.screenshot({ path: path.join(out, `${name}-local-replace.png`) });

      // 3) 끄는 플래그면 예전처럼 그림 AI로
      await page.evaluate(() => localStorage.setItem('5e.aiEngine.figureSpeed', '0'));
      await page.evaluate((b) => { window.__engineFake.find = { targets: ['A'], keep: [], summary: 'A만 지움', mode: 'text', ops: [{ op: 'remove', text: 'A', kind: 'en', ...b }] }; }, box('A'));
      await send(page, 'A는 빼 줘');
      await idle(page); await page.waitForTimeout(400);
      assert.equal(await imageSends(page), sends1 + 2, `${name}: flag off → image AI redraw`);
      await page.evaluate(() => localStorage.removeItem('5e.aiEngine.figureSpeed'));
      await closeAiPanel(page);
      assert.deepEqual(errors, [], `${name}: no page errors`);
      console.log(`${name}: figure local edit ok`);
    } finally { await browser.close(); }
  }
});
