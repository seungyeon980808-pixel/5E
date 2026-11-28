'use strict';
// 1.8.0 「새 엔진을 5E에 연결」 브라우저 검사(크롬·웹킷). 실제 AI 대신 가짜 설치판 연결(fiveEDesktop, web:false)을 쓴다.
// 1) 그래프 생성 기본(옵션 꺼짐): 지금의 그래프 객체 생성 길 그대로 — 새 그래프 엔진 모듈을 불러오지도 않음.
// 2) 이미지 생성: 새 그림 엔진(구체화→기출 3장→그리기→설명 지우기→흑백)이 돌고 결과 카드 → 캔버스, 캔버스 객체 meta에 참고 기출 3장.
// 3) 실패: 엔진 그림이 모두 실패 → 옛 생성 길로 넘어감(그것도 실패) → 앞 결과 카드가 그대로 남음.
// 4) 그래프 「그림으로 생성」(옵션 켬): 그림 + meta.graphPlan, 새로 고쳐 다시 열어도 남고, 그 설계로 AI 없이 다시 그리면 같은 그림.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const { openAiWorkflow, closeAiPanel } = require('./helpers/graph-entry.cjs');
process.env.APP_ENTRY = '/';

const V = '?v=1.7.0-four-session-integration';
const PANEL = '#ai-image-panel';
const PNG = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'fixtures/rights-clear-smoke.png')).toString('base64');
const out = process.env.EVIDENCE_DIR || '';
if (out) fs.mkdirSync(out, { recursive: true });
const PLAN = { xMin: 0, xMax: 4, yMin: 0, yMax: 6, labelX: '시간(s)', labelY: '속도(m/s)', xTicks: [{ value: 2, label: '2' }], yTicks: [{ value: 6, label: '6' }],
  series: [{ expr: '6-2*x', domain: [0, 3], label: 'A' }], marks: [], guides: [] };

async function fakeDesktop(context) {
  await context.addInitScript(({ PNG, PLAN }) => {
    for (const p of ['', '5e.preview:']) { localStorage.setItem(p + '5e.tutorial.bannerSeen', 'true'); localStorage.setItem(p + '5e.mode', 'pro'); }
    try { performance.setResourceTimingBufferSize(20000); } catch {}
    const listeners = new Set();
    const fake = window.__engineFake = { sends: [], reads: [], failImages: false, n: 0 };
    const emit = (message) => listeners.forEach((fn) => fn(message));
    // 글 읽기: 구체화·분류·고르기·설명 찾기·그래프 설계·값 검사 모두 이 한 JSON으로 답한다(필요한 열쇠만 골라 씀).
    const universal = JSON.stringify({ type: '역학', scenes: ['빗면 위 물체 A가 용수철에 매달려 정지'], keyValues: '', subject: '물리학Ⅰ', types: ['역학'], keywords: ['빗면'], has: false, texts: [], ...PLAN });
    window.fiveEDesktop = {
      web: false,
      status: async () => ({ login: { loggedIn: true }, server: true }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }),
      account: async () => ({ rateLimits: {} }), login: async () => {}, captureSources: async () => [],
      models: async () => ({ data: [{ model: 'gpt-6.1-sol', displayName: 'Sol 6.1', isDefault: true, defaultReasoningEffort: 'medium', supportedReasoningEfforts: ['medium'], serviceTiers: ['priority'] },
        { model: 'gpt-6-luna', displayName: 'Luna 6', defaultReasoningEffort: 'medium', supportedReasoningEfforts: ['medium'], serviceTiers: ['priority'] }] }),
      onEvent: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, onState: () => () => {}, onLog: () => () => {},
      setAiTaskShortcutActive() {}, onAiCloseTaskShortcut: () => () => {},
      interrupt: async () => ({ ok: true, acknowledged: true }),
      readImageText: async (payload) => { fake.reads.push({ model: payload.model, text: String(payload.text).slice(0, 200), attachments: payload.attachments.length }); return { text: universal }; },
      send: async (payload) => {
        const turnId = `fake-${++fake.n}`;
        fake.sends.push({ turnId, purpose: payload.purpose || null, model: payload.model || null, names: (payload.attachments || []).map((a) => a.name || ''), text: String(payload.text || '').slice(0, 400) });
        if (payload.purpose === 'image') {
          setTimeout(() => {
            if (!fake.failImages) emit({ clientScope: payload.clientScope, method: 'item/completed', params: { turnId, item: { type: 'imageGeneration', status: 'completed', imageDataUrl: PNG } } });
            emit({ clientScope: payload.clientScope, method: 'turn/completed', params: { turn: fake.failImages ? { id: turnId, status: 'failed', error: { message: '가짜 실패' } } : { id: turnId, status: 'completed' } } });
          }, 20);
        }
        return { turnId, threadId: 'thread-' + turnId, renderThreadId: turnId };
      },
    };
  }, { PNG, PLAN });
}

const cards = (page) => page.locator(`${PANEL} .ai-previews .ai-image-card`).count();
const idle = (page) => page.waitForFunction((p) => document.querySelector(p)?.dataset.aiBusy !== 'true', PANEL, { timeout: 60000 });
const status = (page) => page.locator(`${PANEL} [data-ai-status]`).textContent();
async function ask(page, text) {
  // 11-19(시안 그림생성화면 태그 6): 결과가 있으면 실행 단추가 「이 그림 고치기」다 — 새 그림은 ▾ 메뉴의 「새로 그리기」로.
  if (await page.locator(`${PANEL} [data-ai-send][data-ai-create-state="edit"]`).count()) {
    await page.locator(`${PANEL} [data-ai-create-more]`).click();
    await page.locator(`${PANEL} [data-ai-create-new]`).click();
  }
  await page.locator(`${PANEL} [data-ai-chat-input]`).fill(text);
  await page.locator(`${PANEL} [data-ai-send]`).click();
}
async function shot(page, name) { if (out) await page.screenshot({ path: path.join(out, name) }); }
async function insertSelected(page) {
  const before = await page.evaluate(async (V) => { const { state } = await import('/js/state.js' + V); return state.get().objects.length; }, V);
  await page.locator(`${PANEL} [data-ai-insert-selected]`).click();
  await page.waitForFunction(async ([V, before]) => { const { state } = await import('/js/state.js' + V); return state.get().objects.length > before; }, [V, before], { timeout: 20000 });
  return page.evaluate(async (V) => { const { state } = await import('/js/state.js' + V); const o = state.get().objects.filter((x) => x.type === 'image').at(-1); return { meta: o?.meta || null, src: o?.src || '' }; }, V);
}

h.withServer(async (origin) => {
  for (const [name, engine] of Object.entries({ chromium, webkit }).filter(([k]) => !process.env.BROWSER_ENGINE || k === process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, serviceWorkers: 'block' });
    await fakeDesktop(context);
    let workerHits = 0;
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    if (process.env.DEBUG_ENGINE) { page.on('console', (m) => console.log('console', m.type(), m.text().slice(0, 200))); page.on('requestfailed', (r) => console.log('reqfail', r.url().slice(0, 120), r.failure()?.errorText)); }
    try {
      await h.navigate(page, origin + '/?mode=pro&mobile=0&exam=0');
      await page.route(/https:\/\/5e-exam-(pdf|hak)\.5e-desktop\.workers\.dev\/q\/.*/, (route) => {
        workerHits++;
        route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ question: { blocks: [{ kind: 'figure', figure: { data: PNG } }] } }) });
      });
      await h.ready(page);
      const loaded = () => page.evaluate(() => performance.getEntriesByType('resource').map((e) => new URL(e.name).pathname).filter((p) => /\/js\/ai-(graph|figure)\//.test(p)));

      // 1) 그래프 생성 기본: 옵션 꺼짐 → 지금 길(그래프 객체 생성 요청), 새 엔진 안 불림
      await openAiWorkflow(page, 'graph-create');
      await ask(page, '가로축은 시간(s), 세로축은 속도(m/s)로 처음 3초 동안 6에서 0까지 일정하게 줄어드는 그래프');
      await page.waitForFunction(() => window.__engineFake.sends.length >= 1, null, { timeout: 15000 });
      let fake = await page.evaluate(() => structuredClone(window.__engineFake));
      assert.ok(fake.sends.every((s) => s.purpose !== 'image'), `${name}: default graph creation sends the graph-object request`);
      assert.equal(fake.reads.length, 0, `${name}: default graph creation does not call the new engine`);
      assert.ok(!(await loaded()).some((p) => p.includes('/js/ai-graph/')), `${name}: graph picture engine module is not even loaded`);
      await page.locator(`${PANEL} [data-ai-send][data-ai-create-state="stop"], ${PANEL} [data-ai-interrupt]:visible`).first().click();
      await idle(page);
      await closeAiPanel(page);

      // 2) 이미지 생성 → 새 그림 엔진 → 결과 카드 → 캔버스(meta에 참고 기출 3장)
      await openAiWorkflow(page, 'image-create');
      const startSends = (await page.evaluate(() => window.__engineFake.sends.length));
      await ask(page, '빗면 위 물체 A가 용수철에 매달려 정지해 있는 그림');
      await page.waitForFunction((p) => document.querySelectorAll(`${p} .ai-previews .ai-image-card`).length === 1, PANEL, { timeout: 60000 });
      await idle(page);
      fake = await page.evaluate(() => structuredClone(window.__engineFake));
      const engineSends = fake.sends.slice(startSends).filter((s) => s.purpose === 'image');
      if (process.env.DEBUG_ENGINE) console.log(JSON.stringify({ sends: fake.sends.slice(startSends).map((s) => ({ ...s, text: s.text.slice(0, 80) })), reads: fake.reads.map((r) => r.text.slice(0, 60)), workerHits, logs: await page.locator(`${PANEL} [data-ai-log]`).textContent().catch(() => '') }, null, 1));
      assert.ok(engineSends.length >= 1, `${name}: the engine drew through the desktop image path`);
      assert.ok(engineSends[0].names.length >= 1 && engineSends[0].names.every((n) => /^figure-ref-\d\.png$/.test(n)), `${name}: up to three exam figures attached: ${JSON.stringify(engineSends[0].names)}`);
      // 11-19 사용자 결정(18b191cf): 그림 모델은 작업대의 대화 모델을 따르지 않고 기본 Luna(옵션이 sol일 때만 Sol).
      assert.equal(engineSends[0].model, 'gpt-6-luna', `${name}: the engine's default image model (Luna) draws first`);
      assert.ok(fake.reads.some((r) => r.model === 'gpt-6.1-sol'), `${name}: text steps use the engine text model`);
      assert.ok(workerHits >= 1, `${name}: reference figures fetched from the Worker`);
      // 11-19(시안 그림생성화면 태그 13·19): 옛 「이미지가 완성되었습니다. 참고한 기출 그림: …」 글 대신 대화의 결과 카드.
      // 11-20 사용자 결정: 참고한 기출은 화면에 말하지 않는다(띠·「기출 N장 참고」 없음). 엔진 meta에는 남는다.
      assert.doesNotMatch(await page.locator(`${PANEL} .ai-msg.result .ai-chat-result`).last().textContent(), /기출/, `${name}: the result card does not mention reference figures`);
      assert.equal(await page.locator(`${PANEL} [data-ai-ref-strip]`).count(), 0, `${name}: no reference strip`);
      await shot(page, `${name}-figure-result.png`);
      const figureObject = await insertSelected(page);
      assert.equal(figureObject.meta?.figureEngine, 'ai-figure', `${name}: canvas image keeps the engine metadata`);
      assert.ok(figureObject.meta.refs.length >= 1 && figureObject.meta.refs.length <= 3, `${name}: reference ids kept: ${JSON.stringify(figureObject.meta.refs)}`);
      await shot(page, `${name}-figure-canvas.png`);

      // 3) 실패: 엔진 그림 모두 실패 → 옛 길로 넘어감 → 그것도 실패 → 앞 결과 그대로
      await openAiWorkflow(page, 'image-create');
      const firstCard = await page.locator(`${PANEL} .ai-previews .ai-image-card img`).first().getAttribute('src');
      await page.evaluate(() => { window.__engineFake.failImages = true; });
      const failStart = await page.evaluate(() => window.__engineFake.sends.length);
      await ask(page, '도르래에 매달린 두 물체');
      await page.waitForFunction(([p, n]) => { const f = window.__engineFake; return f.sends.slice(n).some((s) => s.purpose === 'image' && !s.names.some((x) => x.startsWith('figure-ref-'))) && document.querySelector(p)?.dataset.aiBusy !== 'true'; }, [PANEL, failStart], { timeout: 90000 });
      await page.waitForTimeout(300);
      fake = await page.evaluate(() => structuredClone(window.__engineFake));
      const failSends = fake.sends.slice(failStart).filter((s) => s.purpose === 'image');
      assert.ok(failSends.filter((s) => s.names.some((x) => x.startsWith('figure-ref-')) || s.text.length).length >= 2, `${name}: engine retried (other model) before giving up`);
      assert.ok(failSends.some((s) => s.model === 'gpt-6-luna'), `${name}: the other model was tried`);
      assert.equal(await cards(page), 1, `${name}: no empty result card added`);
      assert.equal(await page.locator(`${PANEL} .ai-previews .ai-image-card img`).first().getAttribute('src'), firstCard, `${name}: the previous result is kept`);
      await shot(page, `${name}-figure-failure-kept.png`);
      await page.evaluate(() => { window.__engineFake.failImages = false; });
      await closeAiPanel(page);

      // 4) 그래프 「그림으로 생성」(옵션 켬): 그림 + meta.graphPlan
      await page.evaluate(() => localStorage.setItem('5e.aiEngine.graphPicture', '1'));
      await openAiWorkflow(page, 'graph-create');
      const graphStart = await page.evaluate(() => ({ s: window.__engineFake.sends.length, r: window.__engineFake.reads.length }));
      const graphCardsBefore = await cards(page);
      await ask(page, '가로축은 시간(s), 세로축은 속도(m/s)로 처음 3초 동안 6에서 0까지 일정하게 줄어드는 그래프');
      await page.waitForFunction(([p, n]) => document.querySelectorAll(`${p} .ai-previews .ai-image-card`).length === n + 1, [PANEL, graphCardsBefore], { timeout: 60000 });
      await idle(page);
      fake = await page.evaluate(() => structuredClone(window.__engineFake));
      assert.equal(fake.sends.length, graphStart.s, `${name}: picture graph does not use the graph-object request`);
      assert.ok(fake.reads.length - graphStart.r >= 2, `${name}: plan and verify read through the desktop text path`);
      assert.ok((await loaded()).some((p) => p.includes('/js/ai-graph/index.js')), `${name}: graph engine loaded only now`);
      await shot(page, `${name}-graph-picture-result.png`);
      const firstPng = await page.locator(`${PANEL} .ai-previews .ai-image-card img`).first().getAttribute('src');

      // 다시 열기: 새로 고쳐도 작업·결과·설계가 남고, 그 설계로 AI 없이 다시 그리면 같은 그림
      await page.reload();
      await h.ready(page);
      await openAiWorkflow(page, 'graph-create');
      await page.waitForFunction((p) => document.querySelectorAll(`${p} .ai-previews .ai-image-card`).length >= 1, PANEL, { timeout: 20000 });
      const graphObject = await insertSelected(page);
      assert.equal(graphObject.meta?.graphEngine, 'ai-graph-picture', `${name}: canvas object meta marks the picture engine`);
      assert.equal(graphObject.meta.graphPlan.labelY, '속도(m/s)', `${name}: meta.graphPlan saved with the picture`);
      const redraw = await page.evaluate(async ([V, meta, firstPng]) => {
        const reads = window.__engineFake.reads.length;
        const { redrawGraphPicture } = await import('/js/ai-engines.js' + V);
        const r = await redrawGraphPicture(meta);
        const px = async (src) => { const img = new Image(); img.src = src; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return { w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data }; };
        const a = await px(r.png), b = await px(firstPng);
        let diff = 0; if (a.w === b.w && a.h === b.h) for (let i = 0; i < a.d.length; i += 4) if (Math.abs(a.d[i] - b.d[i]) > 8) diff++;
        return { same: r.png === firstPng, size: [a.w, a.h, b.w, b.h], diff, aiCalls: window.__engineFake.reads.length - reads };
      }, [V, graphObject.meta, firstPng]);
      assert.equal(redraw.aiCalls, 0, `${name}: redraw from plan uses no AI`);
      assert.ok(redraw.same || (redraw.size[0] === redraw.size[2] && redraw.size[1] === redraw.size[3] && redraw.diff < 50), `${name}: redraw matches the saved picture ${JSON.stringify(redraw)}`);
      await shot(page, `${name}-graph-picture-canvas.png`);
      await page.evaluate(() => localStorage.removeItem('5e.aiEngine.graphPicture'));

      assert.deepEqual(errors, [], `${name}: no page errors`);
      console.log(`${name}: engine connection ok (figure, failure kept, graph default, graph picture + redraw)`);
    } catch (error) {
      await shot(page, `${name}-failure.png`).catch(() => {});
      console.error(await status(page).catch(() => ''));
      throw error;
    } finally { await browser.close(); }
  }
});
