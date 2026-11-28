'use strict';
// 1.8.0 E9b 그래프 「그림으로 생성」(플래그 5e.aiEngine.graphPicture 켬) 고장 주입 검사(크롬·웹킷).
// 그림 엔진 검사(test-ai-engines-faults-browser.cjs, E9)와 같은 틀: 실제 5E 흐름(AI 창 → 그래프 · 대화로 만들기 → 새 그래프 엔진)에
// 가짜 설치판 연결(fiveEDesktop, web:false)을 붙이고 창 안에서 고장(window.__fault)과 모듈·KaTeX 응답(route)을 바꿔 가며 돌린다.
// 경우마다 확인: ① 처리되지 않은 오류 없음 ② 앞 결과 카드 그대로 ③ 바쁨 표시가 풀리고 상태 글이 분명함
//               ④ 결과가 나오거나(카드 하나 더 — 그림 그래프 또는 기본 그래프 객체) 이어 갈 길이 보임 ⑤ 빈 카드 없음.
// 기본 그래프 객체 생성(대체 길)은 가짜 연결이 설명 계약의 QUALITATIVE_EXAMPLE을 그대로 돌려줘 성공시킨다(fault.objects='fail'이면 실패).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const { openAiWorkflow, closeAiPanel } = require('./helpers/graph-entry.cjs');
process.env.APP_ENTRY = '/';

const V = '?v=1.7.0-four-session-integration';
const PANEL = '#ai-image-panel';
const out = process.env.EVIDENCE_DIR || '';
if (out) fs.mkdirSync(out, { recursive: true });
const ONLY = process.env.FAULT_ONLY ? new Set(process.env.FAULT_ONLY.split(',')) : null;
const PLAN = { xMin: 0, xMax: 4, yMin: 0, yMax: 6, labelX: '시간(s)', labelY: '속도(m/s)', xTicks: [{ value: 2, label: '2' }], yTicks: [{ value: 6, label: '6' }],
  series: [{ expr: '6-2*x', domain: [0, 3], label: 'A' }], marks: [], guides: [] };
// 글자가 비켜설 자리가 없는 설계: 같은 점에 이름 붙은 점 여럿 + 가까운 눈금(배치가 겹침을 다 풀지 못함)
const CROWDED = { ...PLAN, xTicks: [1, 1.03, 1.06, 1.09].map((v, i) => ({ value: v, label: `t_${i}` })), marks: ['P', 'Q', 'R', 'S', 'T'].map((n) => ({ x: 1, y: 4, name: n, style: 'filled' })),
  lineLabels: [{ text: 'σ_t=26', x: 1, y: 4 }, { text: 'σ_t=27', x: 1, y: 4 }] };

async function fakeDesktop(context) {
  await context.addInitScript(({ PLAN, CROWDED }) => {
    for (const p of ['', '5e.preview:']) { localStorage.setItem(p + '5e.tutorial.bannerSeen', 'true'); localStorage.setItem(p + '5e.mode', 'pro'); localStorage.setItem(p + '5e.aiEngine.graphPicture', '1'); }
    try { performance.setResourceTimingBufferSize(20000); } catch {}
    window.__unhandled = [];
    window.__busySeen = false;
    new MutationObserver(() => { if (document.querySelector('#ai-image-panel')?.dataset.aiBusy === 'true') window.__busySeen = true; })
      .observe(document, { subtree: true, attributes: true, attributeFilter: ['data-ai-busy'] });
    window.addEventListener('unhandledrejection', (e) => window.__unhandled.push(String(e.reason?.message || e.reason)));
    window.addEventListener('error', (e) => window.__unhandled.push(String(e.message || e.error)));
    const listeners = new Set();
    const fake = window.__engineFake = { sends: [], reads: [], interrupts: 0, n: 0, logins: 0 };
    const DEFAULT_FAULT = { text: 'ok', textFails: Infinity, plan: 'ok', verify: 'ok', loggedIn: true, objects: 'ok' };
    window.__defaultFault = DEFAULT_FAULT;
    const fault = window.__fault = { ...DEFAULT_FAULT };
    const emit = (message) => listeners.forEach((fn) => fn(message));
    const ipcError = (channel, text) => new Error(`Error invoking remote method '${channel}': Error: ${text}`);
    const TEXT_ERRORS = {
      timeout: 'Codex 응답 시간이 초과되었습니다.', http429: 'Codex 응답 오류(429)', http500: 'Codex 응답 오류(500)',
      network: 'Codex 서버에 연결하지 못했습니다.', auth: 'Codex 로그인 정보가 없습니다.', model: 'Codex 요청이 거절되었습니다(400)',
    };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const planReply = () => {
      switch (fault.plan) {
        case 'garbled': return '}{ 이건 JSON이 아님 ```json [1,2';
        case 'noAxes': { const { xMin, xMax, yMin, yMax, ...rest } = PLAN; return JSON.stringify(rest); }
        case 'noCurves': return JSON.stringify({ ...PLAN, series: [] });
        case 'crowded': return JSON.stringify(CROWDED);
        default: return JSON.stringify(PLAN);
      }
    };
    const verifyReply = () => {
      switch (fault.verify) {
        case 'fail': throw ipcError('codex:read-image-text', TEXT_ERRORS.http500);
        case 'garbled': return '검사 결과: 좋아 보입니다';
        case 'badFix': return JSON.stringify({ labelX: '엉뚱한 축', series: [] }); // 설계 모양이 아닌 「고친 설계」
        default: return '{"ok":true}';
      }
    };
    window.fiveEDesktop = {
      web: false,
      status: async () => ({ login: { loggedIn: fault.loggedIn }, server: fault.loggedIn }), start: async () => ({ ok: fault.loggedIn, message: fault.loggedIn ? '' : '로그인 필요' }), stop: async () => ({ ok: true }),
      account: async () => ({ rateLimits: {} }), login: async () => { fake.logins++; setTimeout(() => { Object.assign(fault, { loggedIn: true, text: 'ok' }); }, 300); }, captureSources: async () => [],
      models: async () => ({ data: [{ model: 'gpt-6.1-sol', displayName: 'Sol 6.1', isDefault: true, defaultReasoningEffort: 'medium', supportedReasoningEfforts: ['medium'], serviceTiers: ['priority'] },
        { model: 'gpt-6-luna', displayName: 'Luna 6', defaultReasoningEffort: 'medium', supportedReasoningEfforts: ['medium'], serviceTiers: ['priority'] }] }),
      onEvent: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, onState: () => () => {}, onLog: () => () => {},
      setAiTaskShortcutActive() {}, onAiCloseTaskShortcut: () => () => {},
      interrupt: async () => { fake.interrupts++; return { ok: true, acknowledged: true }; },
      readImageText: async (payload) => {
        const text = String(payload.text);
        const kind = /^그래프 설계 JSON을 검사한다/.test(text) ? 'verify' : /그래프 생성기용 설계 JSON/.test(text) ? 'plan' : 'other';
        fake.reads.push({ model: payload.model, kind, at: Date.now() });
        await sleep(15);
        const mode = !fault.loggedIn ? 'auth' : fault.text;
        if (mode !== 'ok' && fault.textFails > 0) {
          fault.textFails--;
          if (mode === 'hang') return new Promise(() => {});
          if (mode === 'model' && payload.model !== 'gpt-6.1-sol') { /* 다른 글 모델은 됨 */ }
          else throw ipcError('codex:read-image-text', TEXT_ERRORS[mode] || mode);
        }
        return { text: kind === 'verify' ? verifyReply() : planReply() };
      },
      send: async (payload) => {
        if (!fault.loggedIn) throw ipcError('codex:send', 'Codex 로그인이 필요합니다. 연결 정보에서 로그인해 주세요.');
        if (fault.text === 'network') throw ipcError('codex:send', 'Codex 서버에 연결하지 못했습니다.');
        const turnId = `fake-${++fake.n}`;
        const text = String(payload.text || '');
        fake.sends.push({ turnId, purpose: payload.purpose || null, model: payload.model || null, at: Date.now() });
        // 기본 그래프 객체 생성(대체 길): 설명 계약의 정성 예시 JSON을 그대로 돌려준다.
        setTimeout(() => {
          const m = /QUALITATIVE_EXAMPLE: (.*)\n/.exec(text);
          if (fault.objects === 'ok' && m) emit({ clientScope: payload.clientScope, method: 'item/completed', params: { turnId, item: { type: 'agentMessage', phase: 'final_answer', text: m[1] } } });
          emit({ clientScope: payload.clientScope, method: 'turn/completed', params: { turn: fault.objects === 'ok' && m ? { id: turnId, status: 'completed' } : { id: turnId, status: 'failed', error: { message: '가짜 실패(기본 그래프 생성)' } } } });
        }, 30);
        return { turnId, threadId: 'thread-' + turnId, renderThreadId: turnId };
      },
    };
  }, { PLAN, CROWDED });
}

const cardInfo = (page) => page.evaluate((p) => [...document.querySelectorAll(`${p} .ai-previews .ai-image-card img`)].map((e) => e.getAttribute('src')), PANEL);
const idle = (page, timeout = 60000) => page.waitForFunction((p) => document.querySelector(p)?.dataset.aiBusy !== 'true', PANEL, { timeout });
const busyNow = (page) => page.evaluate((p) => document.querySelector(p)?.dataset.aiBusy === 'true', PANEL);
const statusOf = (page) => page.evaluate((p) => { const s = document.querySelector(`${p} [data-ai-status]`); return { text: (s?.textContent || '').trim(), kind: s?.dataset.kind || '' }; }, PANEL);
const logText = (page) => page.locator(`${PANEL} [data-ai-log]`).textContent().catch(() => '');
const fakeState = (page) => page.evaluate(() => structuredClone({ ...window.__engineFake, unhandled: window.__unhandled }));
// 맨 앞(방금 들어온) 결과 카드의 글: 그림 그래프는 「그림 그래프 N」, 기본 생성은 「생성 그래프 N」
const firstCardText = (page) => page.evaluate((p) => (document.querySelector(`${p} .ai-previews .ai-image-card`)?.textContent || '').replace(/\s+/g, ' ').trim(), PANEL);
async function ask(page, text) {
  await page.locator(`${PANEL} [data-ai-chat-input]`).fill(text);
  await page.locator(`${PANEL} [data-ai-send]`).click();
}
async function setFault(page, f) { await page.evaluate((f) => { Object.assign(window.__fault, window.__defaultFault, f); }, f); }
async function shot(page, name) { if (out) await page.screenshot({ path: path.join(out, name) }).catch(() => {}); }

// 11-20: 작업 목록(고른 작업의 시간 줄)과 로딩 창 글 — 「실패」 대신 뜻대로(연결 대기·완료 · 앞 결과를 그대로 두었습니다).
const activeTaskLabel = (page) => page.evaluate((p) => (document.querySelector(`${p} .ai-task-tab.is-on .ai-task-tab-time`)?.textContent || '').trim(), PANEL);
const loadingCaption = (page) => page.evaluate((p) => { const f = document.querySelector(`${p} [data-ai-loading-frame]`); return { state: f?.dataset.loadingState || '', text: (f?.querySelector('.ai-loading-caption')?.textContent || '').replace(/\s+/g, ' ').trim() }; }, PANEL);
const waitBusy = (page) => page.waitForFunction((p) => document.querySelector(p)?.dataset.aiBusy === 'true', PANEL, { timeout: 15000 });
const waitReads = (page, n) => page.waitForFunction((n) => window.__engineFake.reads.length >= n, n, { timeout: 30000 });
const REQUEST = '가로축은 시간(s), 세로축은 속도(m/s)로 처음 3초 동안 6에서 0까지 일정하게 줄어드는 그래프';

h.withServer(async (origin) => {
  const report = [];
  for (const [name, engine] of Object.entries({ chromium, webkit }).filter(([k]) => !process.env.BROWSER_ENGINE || k === process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, serviceWorkers: 'block' });
    await fakeDesktop(context);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    if (process.env.DEBUG_ENGINE) page.on('console', (m) => console.log('console', m.type(), m.text().slice(0, 240)));
    // 모듈·자산 막기: engine(js/ai-graph/index.js) | draw(js/ai-graph/draw.js) | katex(vendor/katex/** — 스크립트·글꼴)
    const blocked = new Set();

    // expect: 'picture'(그림 그래프 카드) | 'objects'(기본 그래프 객체 카드) | 'minimal'(축만 그린 그림 카드) | 'guided' | 'cancelled' | 'kept'
    async function scenario(id, title, run) {
      if (ONLY && !ONLY.has(id)) return;
      await idle(page);
      await openAiWorkflow(page, 'graph-create');
      await page.waitForTimeout(300);
      blocked.clear();
      await setFault(page, {});
      await page.evaluate(() => { window.__busySeen = false; window.__unhandled.length = 0; const f = window.__engineFake; f.sends.length = 0; f.reads.length = 0; f.interrupts = 0;
        delete globalThis.__FIVE_E_ENGINE_TEXT_DEADLINE_MS; });
      pageErrors.length = 0;
      const before = await cardInfo(page);
      const started = Date.now();
      try {
        const res = await run();
        await page.waitForFunction((p) => window.__busySeen && document.querySelector(p)?.dataset.aiBusy !== 'true', PANEL, { timeout: 120000 });
        await page.waitForTimeout(300);
        const after = await cardInfo(page);
        const st = await statusOf(page);
        const fake = await fakeState(page);
        const unhandled = [...pageErrors, ...fake.unhandled];
        assert.deepEqual(unhandled, [], `${name}/${id}: no unhandled error`);
        for (const src of before) assert.ok(after.includes(src), `${name}/${id}: previous result card kept`);
        assert.ok(st.text && !/중…$|하고 있습니다$/.test(st.text), `${name}/${id}: settled status shown: ${st.text}`);
        const added = after.length - before.length;
        if (['picture', 'objects', 'minimal'].includes(res.expect)) {
          assert.equal(added, 1, `${name}/${id}: one new result card (got ${added}) status=${st.text}`);
          const card = await firstCardText(page);
          assert.match(card, res.expect === 'objects' ? /생성 그래프/ : /그림 그래프/, `${name}/${id}: newest card comes from the expected path: ${card.slice(0, 60)}`);
        } else assert.equal(added, 0, `${name}/${id}: no empty card added (got ${added}) status=${st.text}`);
        const log = await logText(page);
        if (res.expect === 'objects') assert.match(log, /기본 그래프 생성으로 이어서/, `${name}/${id}: fell back to default object generation`);
        if (res.expect === 'objects') assert.ok(fake.sends.some((s) => s.purpose === 'scene'), `${name}/${id}: default generation request sent`);
        if (res.expect === 'picture') assert.ok(!fake.sends.length, `${name}/${id}: picture path does not send the graph-object request`);
        if (res.expect === 'minimal') assert.match(st.text, /축만/, `${name}/${id}: minimal axes picture explained`);
        if (res.check) await res.check({ st, fake, after, before, log });
        const ms = Date.now() - started;
        report.push({ browser: name, id, title, result: res.expect, status: st.text, ms, reads: fake.reads.length, sends: fake.sends.length, note: res.note || '' });
        console.log(`${name} ✓ ${id} (${ms}ms) — ${st.text}`);
        await shot(page, `${name}-${id}.png`);
      } catch (error) {
        await shot(page, `${name}-${id}-FAIL.png`);
        console.error(`${name} ✗ ${id}: ${error.message.split('\n')[0]}\n  status=${JSON.stringify(await statusOf(page).catch(() => ''))}\n  log=${(await logText(page)).slice(-700).replace(/\s+/g, ' ')}`);
        report.push({ browser: name, id, title, failed: error.message.split('\n')[0] });
        if (!process.env.FAULT_CONTINUE) throw error;
      } finally {
        blocked.clear();
        await setFault(page, {});
        await page.evaluate(() => { delete globalThis.__FIVE_E_ENGINE_TEXT_DEADLINE_MS; });
        if (await busyNow(page)) { await page.locator(`${PANEL} [data-ai-interrupt]`).click().catch(() => {}); await idle(page).catch(() => {}); }
        const dialog = page.locator(`${PANEL} [data-ai-connection-dialog]`);
        if (await dialog.evaluate((d) => d.open).catch(() => false)) await dialog.locator('[data-ai-info-close]').click().catch(() => {});
      }
    }

    // 결과 카드 고르기: 그림 그래프(앞 결과로 넘어감) 또는 기본 생성 그래프(그림 엔진의 앞 결과 아님)
    async function selectCard(re) {
      const id = await page.evaluate(([p, src]) => {
        const card = [...document.querySelectorAll(`${p} .ai-previews .ai-image-card[data-ai-candidate-id]`)].find((c) => new RegExp(src).test(c.textContent || ''));
        card?.querySelector('img')?.click();
        return card?.dataset.aiCandidateId || null;
      }, [PANEL, re.source]);
      assert.ok(id, `${name}: a card matching ${re} exists`);
      await page.waitForFunction(([p, id]) => document.querySelector(p)?.dataset.aiSelectedCandidateId === id, [PANEL, id], { timeout: 5000 });
    }
    scenario.selectPicture = () => selectCard(/그림 그래프/);
    scenario.selectObjects = () => selectCard(/생성 그래프/);

    try {
      await h.navigate(page, origin + '/?mode=pro&mobile=0&exam=0');
      await page.route(/\/(js\/ai-graph\/(index|draw)\.js|vendor\/katex\/)/, async (route) => {
        const u = route.request().url();
        const hit = (blocked.has('engine') && /ai-graph\/index\.js/.test(u)) || (blocked.has('draw') && /ai-graph\/draw\.js/.test(u)) || (blocked.has('katex') && /vendor\/katex\//.test(u));
        if (hit) return route.fulfill({ status: 503, contentType: 'text/plain', body: 'unavailable' });
        return route.fallback();
      });
      await h.ready(page);

      // ── 모듈을 못 불러옴 → 기본 그래프 객체 생성으로. 다음 차례에는 다시 불러와 그림으로 그려져야 한다(실패한 import를 붙들지 않음).
      // 모듈·KaTeX는 한 번 불러오면 창이 들고 있으므로, 처음 불러오기 전에 막아야 하는 경우들을 맨 앞에 둔다.
      await scenario('engine-load-fail', '그래프 엔진 모듈을 못 불러옴 → 기본 생성', async () => { blocked.add('engine'); await ask(page, REQUEST); return { expect: 'objects' }; });
      await scenario('engine-and-objects-fail', '엔진 모듈 실패 + 기본 생성도 실패 → 앞 결과 유지·안내', async () => {
        blocked.add('engine'); await setFault(page, { objects: 'fail' }); await ask(page, REQUEST);
        // 앞 카드(앞 경우의 결과)가 있으니 실패가 아니라 「앞 결과를 그대로 두고」 끝난 것이다(11-20).
        return { expect: 'kept', check: async ({ st }) => {
          assert.ok(/생성하지 못했습니다 · 앞 결과는 그대로/.test(st.text) && st.kind === 'warn', `${name}: failure explained with generation wording: ${st.text}`);
          assert.match(await activeTaskLabel(page), /완료 · 앞 결과를 그대로 두었습니다/, `${name}: job list says the previous result was kept`);
        } };
      });
      await scenario('draw-load-fail', '그리기 모듈을 못 불러옴 → 기본 생성', async () => { blocked.add('draw'); await ask(page, REQUEST); return { expect: 'objects' }; });
      // ── KaTeX(스크립트·글꼴)를 못 불러옴 → 수식 없이 그리고 알림. 다음 차례에는 다시 불러온다.
      await scenario('katex-fail', 'KaTeX·수식 글꼴을 못 불러옴(앞 모듈 실패 뒤 첫 그림)', async () => {
        blocked.add('katex'); await ask(page, REQUEST);
        return { expect: 'picture', check: async ({ st }) => {
          assert.match(st.text, /대체 글꼴/, `${name}/katex: fallback font reported: ${st.text}`);
          assert.ok(await page.evaluate(() => !globalThis.katex), `${name}/katex: KaTeX really blocked`);
        } };
      });
      await scenario('katex-recovered', 'KaTeX 실패 뒤 다음 차례는 KaTeX로', async () => {
        await ask(page, REQUEST);
        return { expect: 'picture', check: async ({ st }) => {
          assert.doesNotMatch(st.text, /대체 글꼴/, `${name}/katex-recovered: not stuck without KaTeX: ${st.text}`);
          assert.ok(await page.evaluate(() => !!globalThis.katex), `${name}/katex-recovered: KaTeX loaded on retry`);
        } };
      });
      await scenario('baseline', '정상(기준)', async () => { await ask(page, REQUEST); return { expect: 'picture', check: async ({ fake }) => {
        assert.ok(fake.reads.some((r) => r.kind === 'plan') && fake.reads.some((r) => r.kind === 'verify'), `${name}/baseline: plan and verify`);
      } }; });
      // 이 뒤로는 그림 그래프가 골라진 채 시작한다(고른 그림 그래프 = 앞 결과). 설계를 못 받으면 기본 생성으로 새로 만들고, 앞 카드는 그대로.

      // ── AI 글 읽기 전송 고장(main이 이미 다시 시도함): 설계를 못 받음 → 축만 그리지 않고 기본 그래프 객체 생성으로
      for (const [mode, title] of [['timeout', 'AI 시간 초과'], ['http429', 'HTTP 429'], ['http500', 'HTTP 500']]) {
        await scenario(`text-${mode}`, `${title}(설계)`, async () => {
          await setFault(page, { text: mode });
          await ask(page, REQUEST);
          return { expect: 'objects', check: ({ fake }) => assert.ok(fake.reads.length <= 3, `${name}/text-${mode}: stops calling text early (reads=${fake.reads.length})`) };
        });
      }
      // ── 설계 응답이 엉뚱함
      for (const [mode, title] of [['garbled', '설계 JSON이 깨짐'], ['noAxes', '설계에 축 범위 없음'], ['noCurves', '설계에 곡선 없음']]) {
        await scenario(`plan-${mode}`, title, async () => { await setFault(page, { plan: mode }); await ask(page, REQUEST); return { expect: 'objects' }; });
      }
      // ── 기본 생성까지 실패 → 축만 그린 그림을 결과로(실패로 끝내지 않음)
      await scenario('plan-garbled-objects-fail', '설계 깨짐 + 기본 생성도 실패 → 축만 그린 그림', async () => {
        await scenario.selectObjects();
        await setFault(page, { plan: 'garbled', objects: 'fail' }); await ask(page, REQUEST); return { expect: 'minimal' };
      });
      // ── 값 검사 단계 고장: 설계는 받았으니 그 설계로 그린다
      for (const [mode, title] of [['fail', '값 검사 AI 실패(500)'], ['garbled', '값 검사 응답이 JSON 아님'], ['badFix', '값 검사가 설계 모양이 아닌 답']]) {
        await scenario(`verify-${mode}`, title, async () => {
          await setFault(page, { verify: mode }); await ask(page, REQUEST);
          return { expect: 'picture' };
        });
      }
      // ── 글자 겹침이 남음 → 그림은 넣고 상태 글·결과 확인으로 알린다
      await scenario('collisions-left', '글자 겹침이 남은 그림', async () => {
        await setFault(page, { plan: 'crowded' }); await ask(page, REQUEST);
        return { expect: 'picture', check: ({ st }) => assert.match(st.text, /겹침 \d+곳/, `${name}/collisions: overlap is reported: ${st.text}`) };
      });
      // ── 글 모델 거절 → 다른 글 모델
      await scenario('text-model-unavailable', '글 모델 사용 불가(400) → 다른 글 모델', async () => {
        await setFault(page, { text: 'model' }); await ask(page, REQUEST);
        return { expect: 'picture', check: ({ fake }) => assert.ok(fake.reads.some((r) => r.model !== 'gpt-6.1-sol'), `${name}: another text model was used`) };
      });
      // ── 글 읽기가 응답 없음(차례 시계) → 끊고 기본 생성
      await scenario('text-hang-deadline', '글 읽기 응답 없음 → 차례 시계로 끊고 기본 생성', async () => {
        await page.evaluate(() => { globalThis.__FIVE_E_ENGINE_TEXT_DEADLINE_MS = 1200; });
        await setFault(page, { text: 'hang' }); await ask(page, REQUEST);
        return { expect: 'objects', check: ({ fake, log }) => {
          assert.ok(fake.reads.length <= 2, `${name}/text-hang: at most two waits (reads=${fake.reads.length})`);
        } };
      });
      // ── 설계 중 취소 → 취소, 그다음 생성은 정상
      await scenario('abort-mid-plan', '설계 중 취소', async () => {
        await setFault(page, { text: 'hang' });
        await ask(page, REQUEST);
        await waitReads(page, 1);
        await page.locator(`${PANEL} [data-ai-interrupt]`).click();
        return { expect: 'cancelled', check: ({ st, fake }) => {
          assert.match(st.text, /멈췄습니다 · 앞 결과는 그대로/, `${name}/abort: generation stop wording: ${st.text}`);
          assert.ok(!fake.sends.length, `${name}/abort: no default generation after cancel`);
        } };
      });
      await scenario('after-abort', '취소 직후 다시 생성', async () => { await ask(page, REQUEST); return { expect: 'picture' }; });
      // ── 인터넷 끊김 → 안내(기본 생성으로 넘기지 않음), online이 되면 이어서 그림
      await scenario('offline', '인터넷 끊김 → 안내, 연결되면 이어서', async () => {
        await setFault(page, { text: 'network' });
        await ask(page, REQUEST);
        await page.waitForFunction((p) => window.__busySeen && document.querySelector(p)?.dataset.aiBusy !== 'true', PANEL, { timeout: 30000 });
        await page.waitForTimeout(200);
        const st = await statusOf(page);
        assert.match(st.text, /인터넷/, `${name}/offline: tells the user to check the connection: ${st.text}`);
        assert.match(await activeTaskLabel(page), /연결 대기/, `${name}/offline: job list waits for the connection instead of 실패`);
        assert.doesNotMatch(await activeTaskLabel(page), /실패/);
        const lc = await loadingCaption(page);
        if (lc.state === 'failed') assert.ok(/인터넷/.test(lc.text) && !/설명을 조금/.test(lc.text), `${name}/offline: loading card names the cause: ${lc.text}`);
        // 로딩 창 문구는 까닭대로(생성만): 인터넷·로그인은 「설명을 바꿔 보세요」가 아니다. 변환 문구는 그대로.
        const copies = await page.evaluate(async () => { const m = await import('/js/loading/workbench-loading.js'); return {
          offline: m.loadingFailedCopy('graph-create', 'offline', true), login: m.loadingFailedCopy('graph-create', 'login', true), ai: m.loadingFailedCopy('graph-create', null),
          figureOffline: m.loadingFailedCopy('figure', 'offline', false), conversion: m.loadingFailedCopy('graph', 'offline', true) }; });
        assert.equal(copies.offline, '인터넷이 끊겼어요 · 연결되면 이어서 할게요');
        assert.equal(copies.login, 'AI 로그인이 필요해요 · 로그인하면 이어서 할게요');
        assert.equal(copies.ai, '그래프를 만들지 못했어요 · 앞 결과는 그대로예요');
        assert.equal(copies.figureOffline, '인터넷이 끊겼어요 · 앞 결과는 그대로예요');
        assert.equal(copies.conversion, '그래프를 읽지 못했어요 · 원본은 그대로예요');
        const f = await fakeState(page);
        assert.ok(!f.sends.length, `${name}/offline: no default generation over a dead connection`);
        assert.equal((await cardInfo(page)).length, (await cardInfo(page)).length);
        await shot(page, `${name}-offline-guided.png`);
        await setFault(page, {});
        await page.evaluate(() => { window.__busySeen = false; window.dispatchEvent(new Event('online')); });
        return { expect: 'picture', check: ({ log }) => assert.match(log, /인터넷이 다시 연결되면/) };
      });
      // ── Codex 로그인 안 됨 → 연결 화면 → 로그인하면 이어서 그림
      await scenario('not-logged-in', 'Codex 로그인 안 됨 → 연결 화면 → 로그인 뒤 이어서', async () => {
        await setFault(page, { loggedIn: false });
        await ask(page, REQUEST);
        await page.locator(`${PANEL} [data-ai-login]`).waitFor({ state: 'visible', timeout: 30000 });
        assert.ok(await page.locator(`${PANEL} [data-ai-connection-dialog]`).evaluate((d) => d.open), `${name}/not-logged-in: connection dialog shown`);
        assert.match(await activeTaskLabel(page), /로그인 대기/, `${name}/not-logged-in: job list waits for login instead of 실패`);
        await shot(page, `${name}-not-logged-in-connection.png`);
        assert.equal((await fakeState(page)).reads.length, 0, `${name}/not-logged-in: no AI call without login`);
        await page.locator(`${PANEL} [data-ai-login]`).click();
        await page.waitForFunction((p) => window.__engineFake.reads.some((r) => r.kind === 'plan') && document.querySelector(p)?.dataset.aiBusy !== 'true', PANEL, { timeout: 60000 });
        return { expect: 'picture', check: ({ fake }) => assert.ok(fake.logins >= 1) };
      });
      await scenario('auth-expired-mid-run', '실행 중 로그인 만료 → 연결 화면', async () => {
        await setFault(page, { text: 'auth' });
        await ask(page, REQUEST);
        await page.locator(`${PANEL} [data-ai-login]`).waitFor({ state: 'visible', timeout: 30000 });
        await page.locator(`${PANEL} [data-ai-connection-dialog] [data-ai-info-close]`).click();
        return { expect: 'guided', check: ({ st, fake }) => {
          assert.match(st.text, /로그인/, `${name}/auth-expired: asks to log in: ${st.text}`);
          assert.ok(fake.reads.length <= 1, `${name}/auth-expired: stops calling AI (reads=${fake.reads.length})`);
          assert.ok(!fake.sends.length, `${name}/auth-expired: no default generation without login`);
        } };
      });
      // ── 그림 그래프를 고른 채 다시 만들기가 실패 → 앞 결과 그대로(새 카드 없음)
      await scenario('previous-objects-fail', '고른 그림 그래프가 있을 때 설계 실패 + 기본 생성도 실패 → 앞 결과 그대로', async () => {
        await scenario.selectPicture();
        await setFault(page, { plan: 'garbled', objects: 'fail' }); await ask(page, REQUEST + '. 곡선 이름을 B로');
        return { expect: 'kept', check: async ({ st }) => {
          assert.ok(/앞 결과/.test(st.text) && st.kind === 'warn', `${name}/previous: ${st.text}`);
          assert.match(await activeTaskLabel(page), /완료 · 앞 결과를 그대로 두었습니다/, `${name}/previous: job list says kept, not 실패`);
        } };
      });

      // ── 저장된 meta.graphPlan으로 다시 그리기(AI 없음): 연결이 끊겨도, KaTeX가 없어도, 설계가 망가져도 그림이 나온다
      if (!ONLY || ONLY.has('redraw')) {
        const meta = { graphEngine: 'ai-graph-picture', graphPlan: { ...PLAN, keyText: '' }, request: REQUEST };
        await setFault(page, { text: 'network', loggedIn: false });
        // KaTeX 경우는 새 창(다시 연 파일)에서: 이미 KaTeX를 들고 있는 창에서는 막아도 소용이 없다.
        const fresh = await context.newPage();
        await fresh.route(/\/vendor\/katex\//, (route) => route.fulfill({ status: 503, contentType: 'text/plain', body: 'unavailable' }));
        await fresh.goto(origin + '/?mode=pro&mobile=0&exam=0', { waitUntil: 'load' });
        for (const [id, variant, target] of [['redraw-offline', meta, page], ['redraw-katex-fail', meta, fresh], ['redraw-broken-plan', { ...meta, graphPlan: { labelX: '시간', series: 'x' } }, page]]) {
          const r = await target.evaluate(async ([V, meta]) => {
            const reads = window.__engineFake.reads.length;
            const { redrawGraphPicture } = await import('/js/ai-engines.js' + V);
            const r = await redrawGraphPicture(meta);
            return { png: typeof r.png === 'string' && r.png.startsWith('data:image/png'), fallback: r.fallback, warnings: r.warnings, aiCalls: window.__engineFake.reads.length - reads, plan: !!r.meta?.graphPlan, katex: !!globalThis.katex };
          }, [V, variant]);
          if (id === 'redraw-katex-fail') assert.ok(!r.katex && r.warnings.some((w) => /KaTeX/.test(w)), `${name}/${id}: drawn without KaTeX and says so ${JSON.stringify(r.warnings)}`);
          assert.ok(r.png && r.plan, `${name}/${id}: redraw gives a picture with its plan ${JSON.stringify(r)}`);
          assert.equal(r.aiCalls, 0, `${name}/${id}: redraw uses no AI`);
          if (id === 'redraw-broken-plan') assert.equal(r.fallback, 'minimal', `${name}/${id}: broken plan → axes-only picture`);
          report.push({ browser: name, id, title: { 'redraw-offline': '저장된 설계로 다시 그리기(연결 끊김·로그인 없음)', 'redraw-katex-fail': '다시 그리기 + KaTeX 못 불러옴', 'redraw-broken-plan': '망가진 저장 설계로 다시 그리기' }[id], result: r.fallback || 'picture', status: (r.warnings || []).join(' / ').slice(0, 120), reads: r.aiCalls });
          console.log(`${name} ✓ ${id} — fallback=${r.fallback} warnings=${(r.warnings || []).length}`);
        }
        await fresh.close();
        await setFault(page, {});
      }

      console.log(`${name}: graph picture fault injection ok (${report.filter((r) => r.browser === name).length} cases)`);
    } finally { await browser.close(); }
  }
  if (out) fs.writeFileSync(path.join(out, 'faults-graph.json'), JSON.stringify(report, null, 1));
  const failed = report.filter((r) => r.failed);
  if (failed.length) throw new Error(`graph fault cases failed: ${failed.map((r) => `${r.browser}/${r.id}`).join(', ')}`);
});
