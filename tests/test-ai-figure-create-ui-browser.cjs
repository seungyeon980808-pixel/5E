'use strict';
// 11-19 그림 생성 화면(승인 시안 그림생성화면 v4, 태그 1~32)을 가짜 설치판 연결로 끝까지 돈다(실제 AI 안 부름).
//  1) 레퍼런스 없는 생성 → 결과만 크게(「＋ 레퍼런스」), 새 로딩 창(흐린 빈 종이 + 준비·그림 그리기·설명 글 지우기·흑백 정리)
//  2) 대화: 내 말 말풍선, 회색 진행 줄(✓ 없음), 결과 카드(보는 중·칩), 옛 「이미지가 완성되었습니다」 글 없음, 참고한 기출 띠·문구 없음(11-20)
//  3) 실행 단추: 이미지 생성 → 멈추기 → 이 그림 고치기, 칩은 입력칸에 말만 넣기
//  4) 이 그림 고치기 → 「생성 결과 2」 자동 선택, 「되돌리기(1로)」, 고치기 로딩 단계
//  5) 결과 비교: 카드 「비교」 → 슬라이더(왼쪽·오른쪽 표시) → 「비교 닫기」, 좌우 비교 왼쪽 = 비교 대상
//  6) 확정하고 라벨 살리기 → 「생성 결과 3 · 라벨」(라벨 ON/OFF·편집), 요청 라벨을 읽기 기준으로, 캔버스에 라벨 객체로
//  7) 작업 목록 ▢ 접기(44px 줄)·기억·⇧⌘\, 그림 설정 한 줄, 대화 칸 598px, 작업을 바꿨다 돌아와도 대화가 그대로
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
const REQ = '수평 막대 AB 위 O점에 받침, C에 비스듬한 줄 T, 아래에 추 6m을 매단 돌림힘 평형 모식도를 흑백으로 그려 줘';
const isMac = process.platform === 'darwin';

async function fakeDesktop(context) {
  await context.addInitScript(() => {
    for (const p of ['', '5e.preview:']) { localStorage.setItem(p + '5e.tutorial.bannerSeen', 'true'); localStorage.setItem(p + '5e.mode', 'pro'); }
    const listeners = new Set();
    // 그림: 흰 판에 막대·줄과 글자 A·B·O·C·T·6m. 고친 그림은 T가 없다. 글자 상자는 그린 자리 그대로(라벨 살리기 검사용).
    const W = 1200, H = 800;
    const LABELS = [['A', 90, 395], ['B', 1090, 395], ['O', 400, 360], ['C', 860, 360], ['T', 640, 230], ['6m', 560, 520]];
    const draw = withT => {
      const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.strokeStyle = '#000'; g.lineWidth = 4;
      g.strokeRect(130, 410, 940, 30); g.beginPath(); g.moveTo(420, 100); g.lineTo(860, 410); g.stroke();
      g.beginPath(); g.moveTo(600, 440); g.lineTo(600, 480); g.stroke(); g.strokeRect(540, 480, 120, 70);
      g.fillStyle = '#000'; g.font = 'italic 44px serif'; g.textBaseline = 'alphabetic';
      for (const [t, x, y] of LABELS) if (withT || t !== 'T') g.fillText(t, x, y);
      return c.toDataURL('image/png');
    };
    const boxes = () => LABELS.filter(([t]) => t !== 'T').map(([text, x, y]) => ({ text, kind: /\d/.test(text) ? 'qty' : 'en', x: (x - 4) / W, y: (y - 40) / H, w: (text.length * 30 + 10) / W, h: 52 / H, leader: null }));
    const fake = window.__engineFake = { sends: [], reads: [], hold: false, labelHold: false, images: null, n: 0, imgIdx: 0, labelPrompt: '' };
    const emit = m => listeners.forEach(fn => fn(m));
    window.fiveEDesktop = {
      web: false,
      status: async () => ({ login: { loggedIn: true }, server: true }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }),
      account: async () => ({ rateLimits: {} }), login: async () => {}, captureSources: async () => [],
      models: async () => ({ data: [{ model: 'gpt-6.1-sol', displayName: 'Sol 6.1', isDefault: true, defaultReasoningEffort: 'medium', supportedReasoningEfforts: ['medium'], serviceTiers: ['priority'] }] }),
      onEvent: fn => { listeners.add(fn); return () => listeners.delete(fn); }, onState: () => () => {}, onLog: () => () => {},
      setAiTaskShortcutActive() {}, onAiCloseTaskShortcut: () => () => {},
      interrupt: async () => ({ ok: true, acknowledged: true }),
      readImageText: async payload => {
        const text = String(payload.text);
        fake.reads.push(text.slice(0, 80));
        if (/글자 묶음/.test(text)) {
          while (fake.labelHold) await new Promise(r => setTimeout(r, 50));
          fake.labelPrompt = text;
          return { text: JSON.stringify(boxes()) };
        }
        // CHATFIX(11-20): 고칠 곳 찾기는 대상이 있어야 고친다(대상 0개면 되묻는다) — 찾기 답을 따로 준다.
        if (/교사가 이 그림에서 일부만/.test(text)) return { text: JSON.stringify({ targets: ['T 라벨'], keep: ['A', 'B', '줄'], summary: 'T만 지움', mode: 'draw', ops: [] }) };
        return { text: JSON.stringify({ type: '역학', scenes: ['수평 막대·추·지지 줄 돌림힘 평형 모식도'], keyValues: '', subject: '물리학Ⅱ', types: ['역학'], keywords: ['막대', '도르래'], has: false, texts: [] }) };
      },
      send: async payload => {
        const turnId = `fake-${++fake.n}`;
        fake.sends.push({ purpose: payload.purpose || null });
        if (payload.purpose === 'image') (async () => {
          while (fake.hold) await new Promise(r => setTimeout(r, 50));
          fake.images ||= [draw(true), draw(false)];
          const img = fake.images[Math.min(fake.imgIdx++, fake.images.length - 1)];
          emit({ clientScope: payload.clientScope, method: 'item/completed', params: { turnId, item: { type: 'imageGeneration', status: 'completed', imageDataUrl: img } } });
          emit({ clientScope: payload.clientScope, method: 'turn/completed', params: { turn: { id: turnId, status: 'completed' } } });
        })();
        return { turnId, threadId: 'thread-' + turnId, renderThreadId: turnId };
      },
    };
  });
}

const state = page => page.evaluate(p => {
  const root = document.querySelector(p);
  return { busy: root.dataset.aiBusy, layout: root.dataset.aiLayout, resultOnly: root.dataset.aiResultOnly, createUi: root.dataset.aiCreateUi, selected: root.dataset.aiSelectedCandidateId,
    send: root.querySelector('[data-ai-send]').textContent.trim(), sendState: root.querySelector('[data-ai-send]').dataset.aiCreateState,
    log: [...root.querySelectorAll('[data-ai-log] > .ai-msg')].map(n => ({ cls: n.className, text: n.textContent.trim() })) };
}, PANEL);
const idle = page => page.waitForFunction(p => document.querySelector(p)?.dataset.aiBusy !== 'true', PANEL, { timeout: 60000 });
const shot = (page, name) => (out ? page.screenshot({ path: path.join(out, name) }) : null);
const send = async (page, text) => { await page.locator(`${PANEL} [data-ai-chat-input]`).fill(text); await page.locator(`${PANEL} [data-ai-send]`).click(); };
const objects = page => page.evaluate(async () => (await import('/js/state.js?v=1.7.0-four-session-integration')).state.get().objects.map(o => ({ type: o.type, text: o.text || o.content || '' })));

h.withServer(async origin => {
  for (const [name, engine] of Object.entries({ chromium, webkit }).filter(([k]) => !process.env.BROWSER_ENGINE || k === process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
      await fakeDesktop(context);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await h.navigate(page, origin + '/?mode=pro&mobile=0&exam=0');
      await h.ready(page);
      await page.route(/https:\/\/5e-exam-(pdf|hak)\.5e-desktop\.workers\.dev\/q\/.*/, route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ question: { blocks: [{ kind: 'figure', figure: { data: 'data:image/png;base64,' + REF } }] } }) }));
      await openAiWorkflow(page, 'image-create');
      await page.waitForFunction(p => document.querySelector(p).dataset.aiCreateUi === 'true', PANEL);

      // 7) 작업 목록 ▢: 머리줄 오른쪽, 접으면 44px 줄 맨 위, 기억, ⇧⌘\로 두 칸 함께
      const leftToggle = page.locator(`${PANEL} [data-panel-toggle="left"]`);
      assert.ok(await page.locator(`${PANEL} .ai-rail-heading [data-panel-toggle="left"]`).isVisible(), `${name}: 작업 목록 ▢ in the list header`);
      assert.match(await leftToggle.getAttribute('title'), /작업 목록 패널 접기/);
      assert.ok(await page.locator(`${PANEL} .ai-conversation-caption [data-panel-toggle="right"]`).isVisible(), `${name}: right-panel ▢ at the end of the 그림 설정 row`);
      await leftToggle.click();
      await page.waitForFunction(p => document.querySelector(p).dataset.leftCollapsed === 'true', PANEL);
      await page.waitForTimeout(450);
      const mini = await page.locator(`${PANEL} [data-ai-task-mini]`).boundingBox();
      assert.ok(mini && Math.abs(mini.width - 44) <= 1, `${name}: collapsed list is a 44px rail (${mini?.width})`);
      assert.ok(await page.locator(`${PANEL} [data-ai-task-mini] [data-panel-toggle="left"][aria-expanded="false"]`).isVisible(), `${name}: ▢ on top of the rail`);
      assert.equal(await page.locator(`${PANEL} [data-ai-task-mini] .ai-task-mini-tab`).count(), 1);
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('5e.aiWorkbench.panels.v1'))), { left: false, right: true }, `${name}: collapse is remembered`);
      await page.keyboard.press(isMac ? 'Meta+Shift+Backslash' : 'Control+Shift+Backslash');
      await page.waitForFunction(p => document.querySelector(p).dataset.rightCollapsed === 'true', PANEL);
      await page.keyboard.press(isMac ? 'Meta+Shift+Backslash' : 'Control+Shift+Backslash');
      await page.waitForFunction(p => document.querySelector(p).dataset.rightCollapsed === 'false' && document.querySelector(p).dataset.leftCollapsed === 'false', PANEL);
      await page.waitForTimeout(450);

      // 1) 결과만 보기 + 그림 설정 한 줄 + 대화 칸 598px(V5: 460의 30%↑)
      let s = await state(page);
      assert.equal(s.resultOnly, 'true'); assert.equal(s.layout, 'result'); assert.equal(s.send, '이미지 생성');
      assert.match(await page.locator(`${PANEL} [data-ai-settings-oneline]`).textContent(), /배경 제거 끔 · 객체 분리 끔/);
      assert.equal(await page.locator(`${PANEL} .ai-compact-settings`).isVisible(), false, `${name}: settings fold into one line`);
      await page.locator(`${PANEL} [data-ai-settings-change]`).click();
      assert.ok(await page.locator(`${PANEL} .ai-compact-settings`).isVisible(), `${name}: 바꾸기 ▾ opens the two rows`);
      await page.locator(`${PANEL} [data-ai-settings-change]`).click();
      const right = await page.locator(`${PANEL} .ai-conversation`).boundingBox();
      assert.ok(Math.abs(right.width - 598) <= 2, `${name}: chat panel is 598px in result-only view (${right.width})`);

      // 2·3) 생성: 말풍선 → 진행 줄 + 새 로딩 창 → 멈추기 → 결과 카드
      await page.evaluate(() => { window.__engineFake.hold = true; });
      await send(page, REQ);
      await page.waitForFunction(p => document.querySelector(p).dataset.blurLoading === 'true', PANEL, { timeout: 20000 });
      await page.waitForTimeout(400);
      s = await state(page);
      assert.equal(s.send, '그리기 멈추기'); assert.equal(s.sendState, 'stop');
      assert.equal(await page.locator(`${PANEL} [data-ai-chat-input]`).inputValue(), '', `${name}: the sent words leave the input`);
      assert.equal(s.log[0].cls, 'ai-msg user'); assert.equal(s.log[0].text, REQ);
      const stages = await page.locator(`${PANEL} [data-ai-loading-frame] .ai-loading-stage span`).allTextContents();
      assert.deepEqual(stages, ['준비', '그림 그리기', '설명 글 지우기', '흑백 정리'], `${name}: generation uses the new loading window`);
      assert.ok(await page.locator(`${PANEL} .ai-status-row.is-current`).count() === 1, `${name}: one current status row`);
      assert.ok(!(await page.locator(`${PANEL} .ai-status-rows`).textContent()).includes('✓'), `${name}: no check marks in status rows`);
      await shot(page, `${name}-1-loading.png`);
      await page.evaluate(() => { window.__engineFake.hold = false; });
      await idle(page); await page.waitForTimeout(500);
      s = await state(page);
      assert.equal(s.send, '이 그림 고치기'); assert.equal(s.layout, 'result');
      assert.ok(!s.log.some(m => /이미지가 완성되었습니다/.test(m.text)), `${name}: the old completion line is gone`);
      const card1 = page.locator(`${PANEL} .ai-msg.result .ai-chat-result`).last();
      assert.match(await card1.textContent(), /생성 결과 1/); assert.match(await card1.textContent(), /보는 중/);
      assert.doesNotMatch(await card1.textContent(), /기출/, `${name}: 11-20 result card does not mention reference figures`);
      assert.deepEqual(await card1.locator('.ai-chat-chip').allTextContents(), ['확정하고 라벨 살리기', '라벨 빼기', '선 진하게', '각도 바꾸기', '새로 그리기']);
      assert.equal(await page.locator(`${PANEL} [data-ai-ref-strip], ${PANEL} [data-ai-ref-again]`).count(), 0, `${name}: 11-20 no 참고한 기출 띠`);
      assert.ok(!(await page.locator(`${PANEL} [data-ai-log]`).textContent()).includes('기출'), `${name}: 11-20 chat does not mention 기출`);
      assert.ok(await page.locator(`${PANEL} [data-ai-create-add-ref]`).isVisible());
      await shot(page, `${name}-2-result.png`);
      // 칩은 입력칸에 말만 넣는다(바로 실행하지 않음)
      const sendsBefore = await page.evaluate(() => window.__engineFake.sends.length);
      await card1.locator('[data-ai-chip="bolder"]').click();
      assert.match(await page.locator(`${PANEL} [data-ai-chat-input]`).inputValue(), /선을 조금 더 진하게/);
      assert.equal(await page.evaluate(() => window.__engineFake.sends.length), sendsBefore, `${name}: a chip does not run by itself`);

      // 4) 이 그림 고치기 → 결과 2 자동 선택 · 되돌리기(1로)
      await page.evaluate(() => { window.__engineFake.hold = true; });
      await send(page, 'T는 빼 줘');
      await page.waitForFunction(p => document.querySelector(p).dataset.blurLoading === 'true', PANEL, { timeout: 20000 });
      await page.waitForTimeout(300);
      assert.deepEqual(await page.locator(`${PANEL} [data-ai-loading-frame] .ai-loading-stage span`).allTextContents(), ['고칠 곳 찾기', '그 부분 고치기', '나머지 그대로 확인', '마무리']);
      assert.match(await page.locator(`${PANEL} [data-ai-loading-frame] .rs-text`).textContent(), /생성 결과 1에서 말한 곳만 고치고 있어요/);
      await page.evaluate(() => { window.__engineFake.hold = false; });
      await idle(page); await page.waitForTimeout(500);
      s = await state(page);
      const names = await page.locator(`${PANEL} .ai-chat-result-meta > b`).allTextContents();
      assert.deepEqual(names, ['생성 결과 1', '생성 결과 2']);
      assert.equal(await page.locator(`${PANEL} [data-ai-version-button]`).textContent(), '생성 결과 2', `${name}: the edited picture is selected`);
      assert.deepEqual(s.log.filter(m => /user/.test(m.cls)).map(m => m.text), [REQ, 'T는 빼 줘'], `${name}: my words stay in order`);
      const card2 = page.locator(`${PANEL} .ai-chat-result.is-viewing`);
      assert.match(await card2.textContent(), /1에서 고침/);
      assert.equal(await card2.locator('.ai-chat-chip').nth(1).textContent(), '되돌리기(1로)');
      await card2.locator('[data-ai-chip="revert"]').click();
      await page.waitForFunction(p => document.querySelector(`${p} [data-ai-version-button]`).textContent === '생성 결과 1', PANEL);
      await page.locator(`${PANEL} .ai-chat-result-open`).nth(1).click();
      await page.waitForFunction(p => document.querySelector(`${p} [data-ai-version-button]`).textContent === '생성 결과 2', PANEL);

      // 5) 비교: 카드 「비교」 → 슬라이더(왼쪽·오른쪽) → 좌우 비교 왼쪽 = 비교 대상 → 비교 닫기
      await page.locator(`${PANEL} [data-ai-chat-compare]`).click();
      await page.waitForFunction(p => document.querySelector(`${p} .ai-results`).classList.contains('is-wipe-comparing'), PANEL);
      await page.waitForTimeout(300);
      assert.deepEqual(await page.locator(`${PANEL} .ai-chat-badge.is-side`).allTextContents(), ['왼쪽', '오른쪽']);
      const picks = await page.locator(`${PANEL} .ai-comparison-choice select`).evaluateAll(list => list.map(sel => sel.selectedOptions[0]?.textContent));
      assert.deepEqual(picks, ['생성 결과 1', '생성 결과 2'], `${name}: the card's result is left, the viewed one right`);
      assert.match((await state(page)).log.at(-1).text, /겹쳐 보고 있어요/);
      await shot(page, `${name}-3-slider.png`);
      await page.locator(`${PANEL} .ai-compare-menu > summary`).click();
      await page.locator(`${PANEL} [data-ai-layout-mode="side-by-side"]`).click();
      await page.waitForFunction(p => document.querySelector(p).dataset.aiLayout === 'side-by-side', PANEL);
      await page.waitForTimeout(300);
      assert.equal(await page.locator(`${PANEL} .ai-original-pane .ai-pane-metadata > strong`).textContent(), '비교 대상');
      assert.match(await page.locator(`${PANEL} [data-ai-source-select]`).evaluate(sel => sel.selectedOptions[0].textContent), /생성 결과 1/, `${name}: default target is the previous result`);
      assert.ok(await page.locator(`${PANEL} .ai-compare-result-card`).isVisible());
      assert.equal(await page.locator(`${PANEL} .ai-original-pane [data-ai-reference-empty]`).isVisible(), false, `${name}: no empty reference hint in compare`);
      await shot(page, `${name}-4-side.png`);
      await page.locator(`${PANEL} [data-ai-chip="compare-close"]`).click();
      await page.waitForFunction(p => document.querySelector(p).dataset.aiLayout === 'result', PANEL);
      assert.equal(await page.locator(`${PANEL} .ai-chat-badge.is-side`).count(), 0);

      // 6) 확정하고 라벨 살리기 → 결과 3 · 라벨, 요청 라벨 기준, 라벨 켬·끔, 캔버스에 라벨 객체
      await page.evaluate(() => { window.__engineFake.labelHold = true; });
      await page.locator(`${PANEL} .ai-chat-result.is-viewing [data-ai-chip="label-restore"]`).click();
      await page.waitForFunction(p => document.querySelector(p).dataset.blurLoading === 'true', PANEL, { timeout: 20000 });
      await page.waitForTimeout(300);
      assert.deepEqual(await page.locator(`${PANEL} [data-ai-loading-frame] .ai-loading-stage span`).allTextContents(), ['글자 읽기', '글자 지우기', '라벨 자리 맞추기', '라벨 넣고 확인']);
      assert.match(await page.locator(`${PANEL} .ai-status-row.is-current`).textContent(), /요청에 적은 라벨 \d+개를 기준으로/);
      await page.evaluate(() => { window.__engineFake.labelHold = false; });
      await idle(page); await page.waitForTimeout(800);
      const prompt = await page.evaluate(() => window.__engineFake.labelPrompt);
      assert.match(prompt, /요청해 그린 것이다 — .*\bO\b.*\bC\b.*6m/, `${name}: request labels seed the text read`);
      assert.ok(!/그린 것이다 — [^.]*\bT\b/.test(prompt), `${name}: a label removed by 「T는 빼 줘」 is not expected any more`);
      assert.equal(await page.locator(`${PANEL} [data-ai-version-button]`).textContent(), '생성 결과 3 · 라벨');
      const card3 = page.locator(`${PANEL} .ai-chat-result.is-viewing`);
      assert.match(await card3.textContent(), /2를 확정 · 라벨 5개 · 그림은 그대로/);
      assert.deepEqual(await card3.locator('.ai-chat-chip').allTextContents(), ['라벨 끄고 보기', '라벨 편집', '되돌리기(2로)']);
      assert.equal(await page.locator(`${PANEL} [data-ai-label-toggle]`).getAttribute('aria-checked'), 'true', `${name}: 라벨 ON`);
      await card3.locator('[data-ai-chip="label-toggle"]').click();
      await page.waitForFunction(p => document.querySelector(`${p} [data-ai-label-toggle]`).getAttribute('aria-checked') === 'false', PANEL);
      await page.locator(`${PANEL} .ai-chat-result.is-viewing [data-ai-chip="label-toggle"]`).click();
      await page.waitForFunction(p => document.querySelector(`${p} [data-ai-label-toggle]`).getAttribute('aria-checked') === 'true', PANEL);
      await shot(page, `${name}-5-labels.png`);
      const before = (await objects(page)).length;
      assert.match(await page.locator(`${PANEL} [data-ai-insert-selected]`).textContent(), /캔버스에 삽입/);
      await page.locator(`${PANEL} [data-ai-insert-selected]`).click();
      await page.waitForFunction(async n => (await import('/js/state.js?v=1.7.0-four-session-integration')).state.get().objects.length > n, before, { timeout: 20000 });
      await page.waitForTimeout(500);
      const after = await objects(page);
      assert.ok(after.length - before >= 6, `${name}: the picture and its 5 labels go in as objects (${after.length - before})`);
      await shot(page, `${name}-6-canvas.png`);

      // 7) 작업을 바꿨다 돌아와도 대화(말풍선·결과 카드)가 그대로
      await openAiWorkflow(page, 'image-create');
      await page.locator(`${PANEL} [data-ai-task-add]`).click();
      await page.waitForFunction(p => document.querySelectorAll(`${p} [data-ai-tab-list] .ai-task-tab[data-tab-id]`).length === 2, PANEL);
      await page.waitForTimeout(300);
      assert.equal(await page.locator(`${PANEL} .ai-msg.result`).count(), 0, `${name}: a new task starts empty`);
      await page.locator(`${PANEL} [data-ai-tab-list] .ai-task-tab[data-tab-id] .ai-task-tab-select`).first().click();
      await page.waitForFunction(p => document.querySelectorAll(`${p} .ai-msg.result`).length === 3, PANEL, { timeout: 10000 });
      assert.deepEqual(await page.locator(`${PANEL} .ai-chat-result-meta > b`).allTextContents(), ['생성 결과 1', '생성 결과 2', '생성 결과 3 · 라벨']);
      await closeAiPanel(page);
      assert.deepEqual(errors, [], `${name}: no page errors`);
      console.log(`${name}: figure create screen ok`);
    } finally { await browser.close(); }
  }
});
