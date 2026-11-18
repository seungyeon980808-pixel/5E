'use strict';
// 1.8.0 E9 「실패로 끝나지 않게 다지기」 고장 주입 검사(크롬·웹킷).
// 실제 5E 흐름(AI 창 → 이미지 생성 → 새 그림 엔진)에 가짜 설치판 연결(fiveEDesktop, web:false)을 붙이고,
// 창 안에서 고장(window.__fault)과 기출 Worker 응답(route)을 바꿔 가며 돌린다.
// 경우마다 확인: ① 처리되지 않은 오류 없음 ② 앞 결과 카드 그대로 ③ 바쁨 표시가 풀리고 상태 글이 분명함
//               ④ 결과가 나오거나(카드 하나 더) 이어 갈 길이 보임(연결 정보 열림·로그인 단추 등).
// 고장 표: CASES 아래 이름 = 보고서 E9.md 표의 경우 이름.
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
const ONLY = process.env.FAULT_ONLY ? new Set(process.env.FAULT_ONLY.split(',')) : null;

// 가짜 설치판 연결. main 쪽(ai-direct-image.cjs)은 시간 초과·429·5xx를 이미 두 번 더 시도한 뒤 오류를 IPC로 넘긴다 —
// IPC를 건너온 오류는 code가 사라지고 「Error invoking remote method …: Error: <글>」 모양만 남는다(Electron). 그 모양을 그대로 흉내 낸다.
async function fakeDesktop(context) {
  await context.addInitScript(({ PNG }) => {
    for (const p of ['', '5e.preview:']) { localStorage.setItem(p + '5e.tutorial.bannerSeen', 'true'); localStorage.setItem(p + '5e.mode', 'pro'); }
    try { performance.setResourceTimingBufferSize(20000); } catch {}
    window.__unhandled = [];
    // 차례가 실제로 돌았는지(바쁨 표시가 한 번이라도 켜졌는지) — 시작 전에 「한가함」을 보고 끝났다고 착각하지 않게.
    window.__busySeen = false;
    new MutationObserver(() => { if (document.querySelector('#ai-image-panel')?.dataset.aiBusy === 'true') window.__busySeen = true; })
      .observe(document, { subtree: true, attributes: true, attributeFilter: ['data-ai-busy'] });
    window.addEventListener('unhandledrejection', (e) => window.__unhandled.push(String(e.reason?.message || e.reason)));
    window.addEventListener('error', (e) => window.__unhandled.push(String(e.message || e.error)));
    const listeners = new Set();
    const fake = window.__engineFake = { sends: [], reads: [], interrupts: 0, n: 0, logins: 0 };
    const fault = window.__fault = { text: 'ok', textFails: Infinity, image: 'ok', imageFails: Infinity, failModels: [], strip: [], loggedIn: true, sendReject: '', okImages: 0, hangModels: [], hangCount: Infinity };
    const emit = (message) => listeners.forEach((fn) => fn(message));
    const ipcError = (channel, text) => new Error(`Error invoking remote method '${channel}': Error: ${text}`);
    const TEXT_ERRORS = {
      timeout: 'Codex 응답 시간이 초과되었습니다.', http429: 'Codex 응답 오류(429)', http500: 'Codex 응답 오류(500)',
      network: 'Codex 서버에 연결하지 못했습니다.', auth: 'Codex 로그인 정보가 없습니다.', model: 'Codex 요청이 거절되었습니다(400)', emptyResult: '결과가 비어 있습니다.',
    };
    const universal = (text) => {
      if (/^시험 문항 그림이다/.test(text)) {
        const texts = fault.strip.length ? [fault.strip.shift()] : [];
        return JSON.stringify({ has: texts.length > 0, texts });
      }
      return JSON.stringify({ type: '역학', scenes: ['빗면 위 물체 A가 용수철에 매달려 정지'], keyValues: '', subject: '물리학Ⅰ', types: ['역학'], keywords: ['빗면'], has: false, texts: [] });
    };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    window.fiveEDesktop = {
      web: false,
      status: async () => ({ login: { loggedIn: fault.loggedIn }, server: fault.loggedIn }), start: async () => ({ ok: fault.loggedIn, message: fault.loggedIn ? '' : '로그인 필요' }), stop: async () => ({ ok: true }),
      account: async () => ({ rateLimits: {} }), login: async () => { fake.logins++; setTimeout(() => { fault.loggedIn = true; fault.text = 'ok'; fault.image = 'ok'; fault.sendReject = ''; }, 300); }, captureSources: async () => [],
      models: async () => ({ data: [{ model: 'gpt-6.1-sol', displayName: 'Sol 6.1', isDefault: true, defaultReasoningEffort: 'medium', supportedReasoningEfforts: ['medium'], serviceTiers: ['priority'] },
        { model: 'gpt-6-luna', displayName: 'Luna 6', defaultReasoningEffort: 'medium', supportedReasoningEfforts: ['medium'], serviceTiers: ['priority'] }] }),
      onEvent: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, onState: () => () => {}, onLog: () => () => {},
      setAiTaskShortcutActive() {}, onAiCloseTaskShortcut: () => () => {},
      interrupt: async () => { fake.interrupts++; return { ok: true, acknowledged: true }; },
      readImageText: async (payload) => {
        const text = String(payload.text);
        fake.reads.push({ model: payload.model, text: text.slice(0, 120), attachments: payload.attachments.length, at: Date.now() });
        await sleep(15);
        const mode = !fault.loggedIn ? 'auth' : fault.text;
        if (mode !== 'ok' && fault.textFails > 0) {
          fault.textFails--;
          if (mode === 'garbled') return { text: '}{ 이건 JSON이 아님 ```json [1,2' };
          if (mode === 'empty') return { text: '' };
          if (mode === 'model' && payload.model !== 'gpt-6.1-sol') return { text: universal(text) };
          throw ipcError('codex:read-image-text', TEXT_ERRORS[mode] || mode);
        }
        return { text: universal(text) };
      },
      send: async (payload) => {
        if (!fault.loggedIn || fault.sendReject) throw ipcError('codex:send', fault.sendReject || 'Codex 로그인이 필요합니다. 연결 정보에서 로그인해 주세요.');
        const turnId = `fake-${++fake.n}`;
        fake.sends.push({ turnId, purpose: payload.purpose || null, model: payload.model || null, names: (payload.attachments || []).map((a) => a.name || ''), text: String(payload.text || '').slice(0, 200), at: Date.now() });
        if (payload.purpose === 'image') {
          let failing = fault.failModels.includes(payload.model);
          if (!failing && fault.image === 'fail') {
            if (fault.okImages > 0) fault.okImages--;
            else if (fault.imageFails > 0) { failing = true; fault.imageFails--; }
          }
          // 응답 없는 그림 차례: hangModels의 모델은 늘, image='hang'이면 hangCount번(끝나지 않는 차례 — main이 알리지 못한 경우)
          let hang = fault.hangModels.includes(payload.model);
          if (!hang && fault.image === 'hang' && fault.hangCount > 0) { fault.hangCount--; hang = true; }
          if (hang) return { turnId, threadId: 'thread-' + turnId, renderThreadId: turnId };
          setTimeout(() => {
            if (!failing) emit({ clientScope: payload.clientScope, method: 'item/completed', params: { turnId, item: { type: 'imageGeneration', status: 'completed', imageDataUrl: PNG } } });
            emit({ clientScope: payload.clientScope, method: 'turn/completed', params: { turn: failing ? { id: turnId, status: 'failed', error: { message: '그림 생성에 실패했습니다. 다른 모델로 다시 시도합니다.' } } : { id: turnId, status: 'completed' } } });
          }, fault.image === 'slow' ? 1500 : 20);
        }
        return { turnId, threadId: 'thread-' + turnId, renderThreadId: turnId };
      },
    };
  }, { PNG });
}

const cardSrcs = (page) => page.locator(`${PANEL} .ai-previews .ai-image-card img`).evaluateAll((els) => els.map((e) => e.getAttribute('src')));
const idle = (page, timeout = 60000) => page.waitForFunction((p) => document.querySelector(p)?.dataset.aiBusy !== 'true', PANEL, { timeout });
const busyNow = (page) => page.evaluate((p) => document.querySelector(p)?.dataset.aiBusy === 'true', PANEL);
const statusOf = (page) => page.evaluate((p) => { const s = document.querySelector(`${p} [data-ai-status]`); return { text: (s?.textContent || '').trim(), kind: s?.dataset.kind || '' }; }, PANEL);
const logText = (page) => page.locator(`${PANEL} [data-ai-log]`).textContent().catch(() => '');
const fakeState = (page) => page.evaluate(() => structuredClone({ ...window.__engineFake, unhandled: window.__unhandled }));
async function ask(page, text) {
  await page.locator(`${PANEL} [data-ai-chat-input]`).fill(text);
  await page.locator(`${PANEL} [data-ai-send]`).click();
}
async function setFault(page, f) {
  await page.evaluate((f) => { Object.assign(window.__fault, { text: 'ok', textFails: Infinity, image: 'ok', imageFails: Infinity, failModels: [], strip: [], loggedIn: true, sendReject: '', okImages: 0, hangModels: [], hangCount: Infinity }, f); }, f);
}
async function shot(page, name) { if (out) await page.screenshot({ path: path.join(out, name) }).catch(() => {}); }
const waitBusy = (page) => page.waitForFunction((p) => document.querySelector(p)?.dataset.aiBusy === 'true', PANEL, { timeout: 15000 });
const waitReads = (page, n) => page.waitForFunction((n) => window.__engineFake.reads.length >= n, n, { timeout: 30000 });
const waitImageSend = (page, n) => page.waitForFunction((n) => window.__engineFake.sends.filter((s) => s.purpose === 'image').length >= n, n, { timeout: 30000 });

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
    // 기출 Worker(참고 그림 문항 JSON): ok | 404 | slow(응답이 늦음) | oversized(그림이 8MB 넘음) | offline(연결 끊김)
    let worker = { mode: 'ok', hits: 0 };
    const BIG = 'data:image/png;base64,' + 'A'.repeat(8 * 1024 * 1024 + 64);

    // 한 경우를 돌리고 공통 약속을 확인한다. run이 돌려주는 expect: 'result'(새 카드) | 'guided'(이어 갈 길) | 'cancelled'
    async function scenario(id, title, run) {
      if (ONLY && !ONLY.has(id)) return;
      await idle(page);
      await openAiWorkflow(page, 'image-create');
      await page.waitForTimeout(300); // 창을 열 때의 연결 확인(refresh)이 끝나게
      worker = { mode: 'ok', hits: 0 };
      await setFault(page, {});
      await page.evaluate(async () => { try { (await import('/js/ai-figure/reference-images.js')).clearFigureCache(); } catch {} });
      await page.evaluate(() => { window.__busySeen = false; window.__unhandled.length = 0; const f = window.__engineFake; f.sends.length = 0; f.reads.length = 0; f.interrupts = 0; delete globalThis.__FIVE_E_ENGINE_IMAGE_DEADLINE_MS; });
      pageErrors.length = 0;
      const before = await cardSrcs(page);
      const started = Date.now();
      let res;
      try {
        res = await run();
        await page.waitForFunction((p) => window.__busySeen && document.querySelector(p)?.dataset.aiBusy !== 'true', PANEL, { timeout: 120000 });
        await page.waitForTimeout(250);
        const after = await cardSrcs(page);
        const st = await statusOf(page);
        const fake = await fakeState(page);
        const unhandled = [...pageErrors, ...fake.unhandled];
        assert.deepEqual(unhandled, [], `${name}/${id}: no unhandled error`);
        for (const src of before) assert.ok(after.includes(src), `${name}/${id}: previous result card kept`);
        assert.ok(st.text && !/중…$|하고 있습니다$/.test(st.text), `${name}/${id}: settled status shown: ${st.text}`);
        if (res.expect === 'result') assert.equal(after.length, before.length + (res.cards ?? 1), `${name}/${id}: a new result card (got ${after.length - before.length}) status=${st.text}`);
        else assert.equal(after.length, before.length, `${name}/${id}: no empty card added`);
        if (res.check) await res.check({ st, fake, after, before, log: await logText(page) });
        const ms = Date.now() - started;
        report.push({ browser: name, id, title, result: res.expect, status: st.text, ms, reads: fake.reads.length, imageSends: fake.sends.filter((s) => s.purpose === 'image').length, workerHits: worker.hits, note: res.note || '' });
        console.log(`${name} ✓ ${id} (${ms}ms) — ${st.text}`);
        await shot(page, `${name}-${id}.png`);
      } catch (error) {
        await shot(page, `${name}-${id}-FAIL.png`);
        console.error(`${name} ✗ ${id}: ${error.message.split('\n')[0]}\n  status=${JSON.stringify(await statusOf(page).catch(() => ''))}\n  log=${(await logText(page)).slice(-600).replace(/\s+/g, ' ')}`);
        report.push({ browser: name, id, title, failed: error.message.split('\n')[0] });
        if (!process.env.FAULT_CONTINUE) throw error;
      } finally {
        worker = { mode: 'ok', hits: 0 };
        await setFault(page, {});
        if (await busyNow(page)) { await page.locator(`${PANEL} [data-ai-interrupt]`).click().catch(() => {}); await idle(page).catch(() => {}); }
      }
    }

    try {
      await h.navigate(page, origin + '/?mode=pro&mobile=0&exam=0');
      // h.navigate가 바깥 주소를 모두 막는 route를 걸므로, Worker route는 그 뒤에 건다(나중 route가 먼저).
      await page.route(/https:\/\/5e-exam-(pdf|hak)\.5e-desktop\.workers\.dev\/q\/.*/, async (route) => {
        worker.hits++;
        const cors = { 'access-control-allow-origin': '*' };
        if (worker.mode === 'offline') return route.abort('internetdisconnected');
        if (worker.mode === '404') return route.fulfill({ status: 404, headers: cors, contentType: 'application/json', body: '{"error":"not found"}' });
        if (worker.mode === 'slow') { await new Promise((r) => setTimeout(r, worker.slowMs || 20000)); return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ question: { blocks: [{ kind: 'figure', figure: { data: PNG } }] } }) }).catch(() => {}); }
        if (worker.mode === 'oversized') return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ question: { blocks: [{ kind: 'figure', figure: { data: BIG } }] } }) });
        return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ question: { blocks: [{ kind: 'figure', figure: { data: PNG } }] } }) });
      });
      await h.ready(page);

      await scenario('baseline', '정상(기준)', async () => { await ask(page, '빗면 위 물체 A가 용수철에 매달려 정지해 있는 그림'); return { expect: 'result' }; });

      // ── AI 글 읽기 고장(구체화·검색·설명 찾기). 글 단계는 모두 대체가 있어 그림은 그대로 나와야 한다.
      for (const [mode, title] of [['timeout', 'AI 시간 초과(글 읽기)'], ['http429', 'HTTP 429(글 읽기)'], ['http500', 'HTTP 500(글 읽기)'], ['garbled', '깨진 JSON'], ['empty', '빈 응답']]) {
        await scenario(`text-${mode}`, title, async () => {
          await setFault(page, { text: mode });
          await ask(page, '도르래에 매달린 두 물체 A, B');
          return { expect: 'result', check: ({ fake }) => {
            // main이 이미 다시 시도한 전송 고장(시간 초과·429·5xx)은 같은 차례 안에서 글 단계마다 또 부르지 않는다(끊김 보호).
            if (['timeout', 'http429', 'http500'].includes(mode)) assert.ok(fake.reads.length <= 3, `${name}/text-${mode}: transport failures stop text calls early (reads=${fake.reads.length})`);
          } };
        });
      }

      // ── 그림 안 설명 문장이 남은 그림 → 지우고 다시 그림(meta.strippedTexts)
      await scenario('strip-text', '그림에 설명 문장이 남음', async () => {
        await setFault(page, { strip: ['물체 A는 정지해 있다.'] });
        await ask(page, '수평면 위에 정지한 물체 A');
        return { expect: 'result', check: async ({ fake }) => {
          assert.ok(fake.sends.filter((s) => s.purpose === 'image').length >= 2, `${name}/strip-text: drew again without the sentence`);
        } };
      });
      await scenario('strip-redraw-fail', '설명 지우기 다시 그리기 실패 → 지우기 전 그림', async () => {
        // 첫 그림은 되고, 설명 지우기 다시 그리기는 두 모델 모두 실패
        await setFault(page, { strip: ['물체 B는 정지해 있다.'], image: 'fail', okImages: 1 });
        await ask(page, '수평면 위에 정지한 물체 B');
        return { expect: 'result' };
      });

      // ── 기출 Worker 고장: 참고 그림 없이(또는 다른 후보로) 그린다
      await scenario('worker-404', '기출 Worker 404', async () => { worker.mode = '404'; await ask(page, '용수철 진자'); return { expect: 'result', check: ({ fake }) => {
        const s = fake.sends.find((x) => x.purpose === 'image'); assert.ok(s && s.names.length === 0, `${name}/worker-404: drew without references`); } }; });
      await scenario('worker-oversized', '기출 Worker 그림이 너무 큼(8MB 초과)', async () => { worker.mode = 'oversized'; await ask(page, '용수철 진자'); return { expect: 'result', check: ({ fake }) => {
        const s = fake.sends.find((x) => x.purpose === 'image'); assert.ok(s && s.names.length === 0, `${name}/worker-oversized: oversized references are not attached`); } }; });
      await scenario('worker-slow', '기출 Worker 응답이 늦음', async () => {
        worker.mode = 'slow'; worker.slowMs = 60000;
        await page.evaluate(() => { globalThis.__FIVE_E_FIGURE_REF_TIMEOUT_MS = 1500; });
        await ask(page, '용수철 진자');
        return { expect: 'result', check: async ({ fake }) => {
          await page.evaluate(() => { delete globalThis.__FIVE_E_FIGURE_REF_TIMEOUT_MS; });
          const s = fake.sends.find((x) => x.purpose === 'image'); assert.ok(s, `${name}/worker-slow: drew without waiting forever`);
        } };
      });

      // ── 연결 끊김: 글 읽기·Worker·그림 모두 실패 → 앞 결과 유지, 연결 확인 안내(막다른 경고가 아니라 다시 실행하면 이어짐)
      await scenario('offline', '인터넷 끊김', async () => {
        worker.mode = 'offline';
        await setFault(page, { text: 'network', sendReject: 'Codex 서버에 연결하지 못했습니다.' });
        await ask(page, '도르래에 매달린 물체');
        return { expect: 'guided', check: ({ st }) => assert.match(st.text, /인터넷|연결/, `${name}/offline: tells the user to check the connection`) };
      });

      // ── 모델을 쓸 수 없음 → 다른 모델
      await scenario('model-unavailable', '그림 모델 사용 불가 → 반대 모델', async () => {
        await setFault(page, { failModels: ['gpt-6.1-sol'] });
        await ask(page, '수평면 위 물체 C');
        return { expect: 'result', check: ({ fake, log }) => {
          const img = fake.sends.filter((s) => s.purpose === 'image');
          assert.equal(img[0].model, 'gpt-6.1-sol'); assert.ok(img.some((s) => s.model === 'gpt-6-luna'), `${name}/model-unavailable: other model drew`);
          assert.match(log, /그림 모델을 바꿔\(gpt-6-luna\)/);
        } };
      });
      await scenario('text-model-unavailable', '글 모델 사용 불가(400) → 다른 글 모델', async () => {
        await setFault(page, { text: 'model' });
        await ask(page, '수평면 위 물체 D');
        return { expect: 'result', check: ({ fake }) => assert.ok(fake.reads.some((r) => r.model !== 'gpt-6.1-sol'), `${name}/text-model-unavailable: another text model was used`) };
      });

      // ── 새 엔진이 한 장도 못 그림 → 옛 생성 길에서 그림이 나옴
      await scenario('all-fail-legacy-ok', '엔진 전부 실패 → 옛 생성 길로 그림', async () => {
        await setFault(page, { image: 'fail', imageFails: 4 });
        await ask(page, '도르래에 매달린 두 물체 E');
        return { expect: 'result', check: ({ log }) => assert.match(log, /이전 생성 방식으로 이어서/) };
      });
      await scenario('all-fail-legacy-fail', '엔진·옛 길 모두 실패 → 앞 결과 유지·다시 실행 안내', async () => {
        await setFault(page, { image: 'fail' });
        await ask(page, '도르래에 매달린 두 물체 F');
        return { expect: 'guided', check: ({ st }) => assert.match(st.text, /유지|보존|다시/, `${name}/all-fail: status says what is kept / what to do`) };
      });

      // ── 장면 그리는 중 취소
      await scenario('abort-mid-scene', '그리는 중 취소', async () => {
        await setFault(page, { image: 'hang' });
        await ask(page, '빗면 위 물체 G');
        await waitImageSend(page, 1);
        await page.locator(`${PANEL} [data-ai-interrupt]`).click();
        return { expect: 'cancelled', check: async ({ st, fake }) => {
          assert.match(st.text, /취소/);
          assert.ok(fake.interrupts >= 1, `${name}/abort: the running image turn was interrupted`);
          assert.ok(!fake.sends.some((s) => s.purpose === 'image' && !s.names.length && s.at > 0 && fake.sends.indexOf(s) > 0), `${name}/abort: no legacy fallback after cancel`);
        } };
      });
      await scenario('after-abort', '취소 직후 다시 생성', async () => { await ask(page, '빗면 위 물체 H'); return { expect: 'result' }; });

      // ── E9b 그림 차례 시계: main이 끝을 알리지 못한 그림 차례(직접 호출 대신 에이전트 길·IPC 끊김)를 화면이 끊고 다음 모델로
      await scenario('image-deadline-switch', '그림 차례 응답 없음 → 차례 시계로 끊고 반대 모델', async () => {
        await page.evaluate(() => { globalThis.__FIVE_E_ENGINE_IMAGE_DEADLINE_MS = 1500; });
        await setFault(page, { hangModels: ['gpt-6.1-sol'] });
        await ask(page, '빗면 위 물체 N');
        return { expect: 'result', check: async ({ fake, log }) => {
          await page.evaluate(() => { delete globalThis.__FIVE_E_ENGINE_IMAGE_DEADLINE_MS; });
          const img = fake.sends.filter((s) => s.purpose === 'image');
          assert.equal(img[0].model, 'gpt-6.1-sol'); assert.ok(img.some((s) => s.model === 'gpt-6-luna'), `${name}/image-deadline: other model drew`);
          assert.ok(fake.interrupts >= 1, `${name}/image-deadline: the silent turn was interrupted`);
          assert.match(log, /그림 모델을 바꿔\(gpt-6-luna\)/);
        } };
      });
      await scenario('image-deadline-both', '두 모델 모두 응답 없음 → 더 기다리지 않고 옛 생성 길로', async () => {
        await page.evaluate(() => { globalThis.__FIVE_E_ENGINE_IMAGE_DEADLINE_MS = 1500; });
        await setFault(page, { image: 'hang', hangCount: 2 });
        await ask(page, '빗면 위 물체 O');
        return { expect: 'result', check: async ({ fake, log }) => {
          await page.evaluate(() => { delete globalThis.__FIVE_E_ENGINE_IMAGE_DEADLINE_MS; });
          const img = fake.sends.filter((s) => s.purpose === 'image');
          assert.ok(img.length <= 3, `${name}/image-deadline-both: no scene retries after two silent turns (image sends=${img.length})`);
          assert.match(log, /이전 생성 방식으로 이어서/);
        } };
      });

      // ── Codex 로그인 안 됨(설치판) → 연결 정보로 데려가고, 로그인하면 이어서 만든다
      await scenario('not-logged-in', 'Codex 로그인 안 됨 → 연결 화면 → 로그인 뒤 이어서', async () => {
        await setFault(page, { loggedIn: false });
        await ask(page, '빗면 위 물체 I');
        await page.waitForFunction((p) => document.querySelector(`${p} details.ai-advanced-settings`)?.open === true, PANEL, { timeout: 30000 });
        await page.locator(`${PANEL} [data-ai-login]`).waitFor({ state: 'visible', timeout: 10000 });
        assert.ok(await page.locator(`${PANEL} [data-ai-connection-dialog]`).evaluate((d) => d.open), `${name}/not-logged-in: the connection dialog is shown`);
        await shot(page, `${name}-not-logged-in-connection.png`);
        const reads = (await fakeState(page)).reads.length;
        assert.ok(reads <= 1, `${name}/not-logged-in: no engine run without login (reads=${reads})`);
        await page.locator(`${PANEL} [data-ai-login]`).click();
        await page.waitForFunction((p) => document.querySelectorAll(`${p} .ai-previews .ai-image-card`).length > 0 && document.querySelector(p)?.dataset.aiBusy !== 'true' && window.__engineFake.sends.some((s) => s.purpose === 'image'), PANEL, { timeout: 60000 });
        return { expect: 'result', check: ({ fake }) => assert.ok(fake.logins >= 1) };
      });
      await scenario('auth-expired-mid-run', '실행 중 로그인 만료 → 연결 화면', async () => {
        await setFault(page, { text: 'auth' });
        await ask(page, '빗면 위 물체 J');
        await page.locator(`${PANEL} [data-ai-login]`).waitFor({ state: 'visible', timeout: 30000 });
        await page.locator(`${PANEL} [data-ai-connection-dialog] [data-ai-info-close]`).click();
        return { expect: 'guided', check: ({ st, fake }) => {
          assert.match(st.text, /로그인/, `${name}/auth-expired: status asks to log in`);
          assert.ok(fake.reads.length <= 2, `${name}/auth-expired: stops calling AI once login is gone (reads=${fake.reads.length})`);
        } };
      });

      // ── 동시성
      await scenario('double-start', '두 번 빠르게 시작', async () => {
        await setFault(page, { image: 'slow' });
        await page.locator(`${PANEL} [data-ai-chat-input]`).fill('빗면 위 물체 K');
        await page.locator(`${PANEL} [data-ai-send]`).evaluate((b) => { b.click(); b.click(); });
        await page.locator(`${PANEL} [data-ai-chat-input]`).press('Enter').catch(() => {});
        return { expect: 'result', check: ({ fake }) => assert.ok(fake.sends.filter((s) => s.purpose === 'image').length <= 2, `${name}/double-start: one run only`) };
      });
      await scenario('switch-program', '생성 중 프로그램 전환(hwp → image)', async () => {
        await setFault(page, { image: 'slow' });
        await ask(page, '빗면 위 물체 L');
        await waitBusy(page);
        await page.evaluate(() => [...document.querySelectorAll('[data-app-switch="hwp"]')].find((b) => b.offsetParent)?.click());
        await page.waitForTimeout(2500);
        await page.evaluate(() => [...document.querySelectorAll('[data-app-switch="image"]')].find((b) => b.offsetParent)?.click());
        await page.waitForTimeout(500);
        await openAiWorkflow(page, 'image-create');
        return { expect: 'result' };
      });
      await scenario('close-panel', '생성 중 AI 창 닫기', async () => {
        await setFault(page, { image: 'slow' });
        await ask(page, '빗면 위 물체 M');
        await waitImageSend(page, 1);
        await closeAiPanel(page);
        await page.waitForTimeout(2500);
        await openAiWorkflow(page, 'image-create');
        return { expect: 'result' };
      });

      console.log(`${name}: fault injection ok (${report.filter((r) => r.browser === name).length} cases)`);
    } finally { await browser.close(); }
  }
  if (out) fs.writeFileSync(path.join(out, 'faults.json'), JSON.stringify(report, null, 1));
  const failed = report.filter((r) => r.failed);
  if (failed.length) throw new Error(`fault cases failed: ${failed.map((r) => `${r.browser}/${r.id}`).join(', ')}`);
});
