'use strict';
// CHATFIX(11-20): 그림 생성 탭 「대화 보내기 / 이미지 생성」 나누기(시안 대화생성분리 안 B · 안 1)를 가짜 설치판 연결로 돈다(실제 AI 안 부름).
//  1) 화면: 입력칸 안 ✈ = 대화 보내기, 입력칸 밖 「이미지 생성」(✈ 없음), 안내 줄 「Enter 대화 · ⌘Enter 이미지 생성 · ⇧Enter 줄바꿈」, 왼쪽 한 줄
//  2) 한글 조합 중 Enter(조합 이벤트 + isComposing/keyCode 229, 크롬은 CDP Input.imeSetComposition도)는 대화도 그림도 보내지 않는다
//     → 조합을 끝낸 뒤 Enter는 대화만 보낸다(그림 없음)
//  3) 11-20 실제 대화 그대로: 대화 다섯 번 → AI 정리 답 아래 「이대로 그리기」, 「지금 이미지를 생성중이야?」도 대화로 감
//  4) ⌘Enter = 이미지 생성: 대화 전체가 구체화에 들어가고, 「그릴 내용」 줄이 대화에 남고, 결과 1
//  5) 빈 그림 넣기(가짜 그림 AI가 흰 PNG): 다른 모델로 자동 다시 그리기 → 성공하면 결과, 두 번 다 비면 앞 결과 그대로 + 칩
//  6) 「이 그림 고치기」에서 고칠 곳 0개 → 그리지 않고 대화로 되묻기
//  7) 작업 목록 표시는 「새 결과」(「확인 필요」 아님)
// V5(11-20 시안 대화창v5): 입력칸 안 한 줄(📎 · 안내 · 그리기 ▾ · │ ✈, 밖 줄·미리 말하는 줄 없음), 대화 칸 598px + 경계 끌기(420~820·저장·두 번 누르면 598),
//  「새 대화」(머리줄 + ▾, 구분 줄·흐리게·되돌리기·「이미지 생성」으로), 결과 뒤 대화만 모으기 · 「처음부터 다시 그리기」, 결과 제목 ▾ 작은 그림 목록(안 A)
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
const isMac = process.platform === 'darwin';
const MOD = isMac ? 'Meta' : 'Control';
// 11-20 실제 대화(CHATGEN/대화-기록-추출.md)
const USER = [
  '광합성에서 암반응과 명반응의 결과 차이를 보여주는 두 비커 그림을 만들어줘 실험 세팅과 실험 이후의 결과도 보여줘 실험 장치를 세팅하는 사람이 보이게끔 해줘',
  '물질의 차이를 보여주려는거야',
  '응 다 글자 라벨로도 표현해저',
  '비커를 이용한 개념 모식도로 만들어줘',
  '시작해',
];
const SUMMARY = '그릴 구성:\n- 두 비커로 명반응과 암반응을 각각 표현\n- 실험 전 장치 세팅과 실험 후 결과를 비교\n- 장치를 세팅하는 사람 포함\n- 라벨: 명반응, 암반응, 산소, ATP, NADPH, 당\n「이미지 생성」을 누르면 이대로 그립니다.';

async function fakeDesktop(context) {
  await context.addInitScript(({ SUMMARY }) => {
    for (const p of ['', '5e.preview:']) { localStorage.setItem(p + '5e.tutorial.bannerSeen', 'true'); localStorage.setItem(p + '5e.mode', 'pro'); }
    const listeners = new Set();
    const W = 1200, H = 800;
    const draw = (white) => {
      const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      g.fillStyle = white ? '#fdfdfd' : '#fff'; g.fillRect(0, 0, W, H);
      if (!white) { g.strokeStyle = '#000'; g.lineWidth = 4; g.strokeRect(200, 300, 260, 300); g.strokeRect(740, 300, 260, 300); g.fillStyle = '#000'; g.font = '40px serif'; g.fillText('명반응', 260, 660); g.fillText('암반응', 800, 660); }
      return c.toDataURL('image/png');
    };
    const fake = window.__engineFake = { sends: [], reads: [], white: 0, noTargets: false, chatN: 0, failImage: 0 };
    const emit = (m) => listeners.forEach((fn) => fn(m));
    window.fiveEDesktop = {
      web: false,
      status: async () => ({ login: { loggedIn: true }, server: true }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }),
      account: async () => ({ rateLimits: {} }), login: async () => {}, captureSources: async () => [],
      models: async () => ({ data: [{ model: 'gpt-6.1-sol', displayName: 'Sol 6.1', isDefault: true, defaultReasoningEffort: 'medium', supportedReasoningEfforts: ['medium'], serviceTiers: ['priority'] },
        { model: 'gpt-6-luna', displayName: 'Luna 6', defaultReasoningEffort: 'medium', supportedReasoningEfforts: ['medium'], serviceTiers: ['priority'] }] }),
      onEvent: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, onState: () => () => {}, onLog: () => () => {},
      setAiTaskShortcutActive() {}, onAiCloseTaskShortcut: () => () => {},
      interrupt: async () => ({ ok: true, acknowledged: true }),
      readImageText: async (payload) => {
        const text = String(payload.text);
        fake.reads.push(text);
        if (/교사가 이 그림에서 일부만/.test(text)) {
          return { text: JSON.stringify(fake.noTargets ? { targets: [], keep: [], summary: '확인 불가', mode: 'draw', ops: [], ask: '어느 부분이 어떻게 안 보이는지 알려 주세요.' } : { targets: ['당 라벨'], keep: ['비커'], summary: '당 지움', mode: 'draw', ops: [] }) };
        }
        return { text: JSON.stringify({ type: '생명 모식도', scenes: ['두 비커로 명반응·암반응 생성 물질 비교'], keyValues: '', subject: '생명과학Ⅰ', types: ['생명 모식도'], keywords: ['비커', '광합성'], has: false, texts: [] }) };
      },
      send: async (payload) => {
        const turnId = `fake-${fake.sends.length + 1}`;
        if (payload.purpose === 'image' && fake.failImage > 0) { fake.failImage--; fake.sends.push({ purpose: 'image-failed', model: payload.model || null, text: '', attachments: [] }); throw new Error('가짜 연결 끊김'); }
        fake.sends.push({ purpose: payload.purpose || null, model: payload.model || null, text: String(payload.text || '').slice(0, 4000), attachments: (payload.attachments || []).map((a) => String(a?.name || '')) });
        setTimeout(() => {
          if (payload.purpose === 'image') {
            const white = fake.white > 0; if (white) fake.white--;
            emit({ clientScope: payload.clientScope, method: 'item/completed', params: { turnId, item: { type: 'imageGeneration', status: 'completed', imageDataUrl: draw(white) } } });
          } else {
            fake.chatN++;
            const reply = /생성중이야/.test(payload.text) ? `아직 그리지 않았어요. 정리한 구성으로 그리려면 「이미지 생성」을 누르세요.\n${SUMMARY}` : fake.chatN >= 5 ? SUMMARY : `확인했어요. 더 말해 주세요 (${fake.chatN}).`;
            emit({ clientScope: payload.clientScope, method: 'item/completed', params: { turnId, item: { type: 'agentMessage', phase: 'final_answer', text: reply } } });
          }
          emit({ clientScope: payload.clientScope, method: 'turn/completed', params: { turn: { id: turnId, status: 'completed' } } });
        }, 60);
        return { turnId, threadId: 'thread-1', renderThreadId: turnId };
      },
    };
  }, { SUMMARY });
}

const idle = (page) => page.waitForFunction((p) => document.querySelector(p)?.dataset.aiBusy !== 'true', PANEL, { timeout: 60000 });
const shot = (page, name) => (out ? page.screenshot({ path: path.join(out, name) }) : null);
const fakeState = (page) => page.evaluate(() => structuredClone(window.__engineFake));
const sendsOf = async (page, purpose) => (await fakeState(page)).sends.filter((s) => s.purpose === purpose).length;
const userBubbles = (page) => page.locator(`${PANEL} [data-ai-log] > .ai-msg.user`).allTextContents();
const logText = (page) => page.locator(`${PANEL} [data-ai-log]`).textContent();
const resultCount = (page) => page.locator(`${PANEL} .ai-msg.result`).count();
const INPUT = `${PANEL} [data-ai-chat-input]`;

// 대화 한 번: 입력칸에 쓰고 Enter(조합 끝난 상태) → 답이 올 때까지.
async function chat(page, text) {
  const before = await sendsOf(page, 'chat');
  await page.locator(INPUT).fill(text);
  await page.locator(INPUT).press('Enter');
  await page.waitForFunction(([n]) => window.__engineFake.sends.filter((s) => s.purpose === 'chat').length > n, [before], { timeout: 15000 });
  await idle(page); await page.waitForTimeout(150);
}

// 한글 조합 중 Enter 흉내: 조합 이벤트 + keydown(isComposing true, keyCode 229). WebKit(사파리)는 compositionend 뒤 keyCode 229 keydown도.
async function imeEnter(page, { composed, webkitOrder = false }) {
  return page.evaluate(([sel, composed, webkitOrder]) => {
    const el = document.querySelector(sel); el.focus();
    const seen = [];
    const spy = (e) => seen.push({ isComposing: e.isComposing, keyCode: e.keyCode, defaultPrevented: e.defaultPrevented });
    window.addEventListener('keydown', spy, true); // 창 캡처 단계: 입력칸의 처리보다 먼저 본다
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    el.value = composed;
    el.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: composed.slice(-1) }));
    const enter = (isComposing) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, isComposing, keyCode: 229, which: 229 }));
    if (!webkitOrder) enter(true);
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: composed.slice(-1) }));
    if (webkitOrder) enter(false);
    window.removeEventListener('keydown', spy, true);
    return seen;
  }, [INPUT, composed, webkitOrder]);
}

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
      await page.waitForTimeout(300);

      // 1) 화면
      const modKey = isMac ? '⌘' : 'Ctrl+', shiftKey = isMac ? '⇧Enter' : 'Shift+Enter';
      // V5 태그 3: 안내 줄은 짧게(⇧Enter는 ✈ 설명으로)
      assert.equal((await page.locator(`${PANEL} [data-ai-create-hint]`).textContent()).trim(), `Enter 대화 · ${modKey}Enter 이미지 생성`);
      assert.ok(await page.locator(`${PANEL} [data-ai-chat-send]`).isVisible(), `${name}: ✈ (대화 보내기) is inside the composer`);
      assert.equal(await page.locator(`${PANEL} [data-ai-chat-send]`).getAttribute('title'), `대화 보내기 · Enter (그림은 그리지 않음) · ${shiftKey} 줄바꿈`);
      const send = page.locator(`${PANEL} [data-ai-send]`);
      assert.equal((await send.textContent()).trim(), '이미지 생성');
      assert.equal(await send.evaluate((el) => getComputedStyle(el, '::after').content), 'none', `${name}: no ✈ on 이미지 생성`);
      // V5 태그 1·2·6: 한 줄 — 📎 · 안내 · [이미지 생성] · │ ✈ 모두 입력칸 안, 입력칸 밖 줄·미리 말하는 줄 없음
      const frame = await page.locator(`${PANEL} .ai-composer-frame`).boundingBox(), sendBox = await send.boundingBox(), plane = await page.locator(`${PANEL} [data-ai-chat-send]`).boundingBox();
      const clipBox = await page.locator(`${PANEL} [data-ai-create-clip]`).boundingBox(), hintBox = await page.locator(`${PANEL} [data-ai-create-hint]`).boundingBox() || await page.locator(`${PANEL} .ai-chat-composer .ai-create-label-options`).boundingBox(); // 11-27: 라벨 방식이 보이면 안내 자리를 쓴다
      const inside = (b) => b.y > frame.y && b.y + b.height <= frame.y + frame.height + 1;
      for (const [label, b] of [['이미지 생성', sendBox], ['✈', plane], ['📎', clipBox], ['안내', hintBox]]) assert.ok(inside(b), `${name}: ${label} sits inside the composer (${JSON.stringify(b)} in ${JSON.stringify(frame)})`);
      const mid = (b) => b.y + b.height / 2;
      assert.ok(Math.abs(mid(sendBox) - mid(plane)) <= 2 && Math.abs(mid(clipBox) - mid(plane)) <= 2, `${name}: one row (${mid(clipBox)}, ${mid(sendBox)}, ${mid(plane)})`);
      assert.ok(clipBox.x < hintBox.x && hintBox.x < sendBox.x && sendBox.x + sendBox.width <= plane.x, `${name}: order 📎 · 안내 · 이미지 생성 · ✈`);
      // 입력칸 안 A(11-21): 단추 높이 32px, ✈ 앞 세로 구분선 없음, 단추와 ✈가 오른쪽 끝 한 묶음(사이 12px 이하), 단추 테두리 없음
      assert.equal(Math.round(sendBox.height), 32, `${name}: draw button is 32px tall`);
      assert.equal(await page.locator(`${PANEL} [data-ai-chat-send]`).evaluate((el) => getComputedStyle(el, '::before').content), 'none', `${name}: no divider before ✈`);
      assert.ok(plane.x - (sendBox.x + sendBox.width) <= 12, `${name}: 이미지 생성 and ✈ sit together (${plane.x - sendBox.x - sendBox.width}px)`);
      assert.equal(await send.evaluate((el) => getComputedStyle(el).borderTopWidth), '0px', `${name}: draw button has no outline border`);
      assert.equal(await page.locator(`${PANEL} [data-ai-create-preview], ${PANEL} .ai-create-preview`).count(), 0, `${name}: no preview line`);
      const dockBottom = await page.locator(`${PANEL} .ai-dock`).evaluate((el) => el.getBoundingClientRect().bottom);
      assert.ok(dockBottom - (frame.y + frame.height) <= 16, `${name}: nothing below the composer (${dockBottom - frame.y - frame.height}px)`);
      assert.equal(await page.locator(`${PANEL} [data-ai-create-more]`).isVisible(), false, `${name}: no ▾ before a result`);
      // V5 태그 7: 머리줄 「새 대화」(끊을 대화가 없으면 꺼짐)
      const newChat = page.locator(`${PANEL} [data-ai-create-newchat]`);
      assert.ok(await newChat.isVisible(), `${name}: 새 대화 in the chat header`);
      assert.equal((await newChat.textContent()).trim(), '새 대화');
      assert.ok(await newChat.isDisabled(), `${name}: 새 대화 is off with no conversation`);
      assert.ok(await newChat.evaluate(button => button.parentElement.matches('.ai-conversation-caption')));
      assert.equal(await page.locator(`${PANEL} .ai-compact-settings`).isVisible(),false);
      // V5 태그 4·5: 대화 칸 598px · 경계 끌기 420~820 · 저장 · 두 번 누르면 598 · ←/→ 8px
      const conv = () => page.locator(`${PANEL} .ai-conversation`).boundingBox();
      const grip = page.locator(`${PANEL} [data-ai-chat-grip]`);
      assert.ok(Math.abs((await conv()).width - 598) <= 2, `${name}: chat panel 598px (${(await conv()).width})`);
      assert.ok(await grip.isVisible(), `${name}: splitter grip shown`);
      let g = await grip.boundingBox(), c = await conv();
      assert.ok(Math.abs(g.x + g.width / 2 - c.x) <= 2, `${name}: grip sits on the boundary`);
      assert.match(await grip.getAttribute('title'), /끌어서 폭 바꾸기 · 두 번 누르면 처음 폭/);
      const dragBy = async (dx) => { const b = await grip.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + 200); await page.mouse.down(); await page.mouse.move(b.x + b.width / 2 + dx / 2, b.y + 200, { steps: 3 }); await page.mouse.move(b.x + b.width / 2 + dx, b.y + 200, { steps: 3 }); await page.mouse.up(); await page.waitForTimeout(120); };
      await dragBy(-100);
      assert.ok(Math.abs((await conv()).width - 698) <= 2, `${name}: dragging left widens (${(await conv()).width})`);
      assert.equal(await page.evaluate(() => localStorage.getItem('5e.aiCreate.chatWidth')), '698', `${name}: width remembered`);
      g = await grip.boundingBox(); c = await conv();
      assert.ok(Math.abs(g.x + g.width / 2 - c.x) <= 2, `${name}: grip follows the boundary`);
      await dragBy(-600);
      assert.ok(Math.abs((await conv()).width - 820) <= 2, `${name}: clamped to 820 (${(await conv()).width})`);
      await dragBy(700);
      assert.ok(Math.abs((await conv()).width - 420) <= 2, `${name}: clamped to 420 (${(await conv()).width})`);
      await grip.focus(); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(80);
      assert.ok(Math.abs((await conv()).width - 428) <= 2, `${name}: ← widens by 8 (${(await conv()).width})`);
      await grip.dblclick(); await page.waitForTimeout(120);
      assert.ok(Math.abs((await conv()).width - 598) <= 2, `${name}: double-click resets to 598 (${(await conv()).width})`);
      assert.equal(await page.evaluate(() => localStorage.getItem('5e.aiCreate.chatWidth')), null, `${name}: reset forgets the width`);
      await dragBy(-50);
      await page.reload(); await h.ready(page);
      await openAiWorkflow(page, 'image-create');
      await page.waitForFunction((p) => document.querySelector(p).dataset.aiCreateUi === 'true', PANEL);
      await page.waitForTimeout(400);
      assert.ok(Math.abs((await conv()).width - 648) <= 2, `${name}: dragged width survives a reload (${(await conv()).width})`);
      await grip.dblclick(); await page.waitForTimeout(120);
      await shot(page, `${name}-1-empty.png`);

      // 2) 한글 조합 중 Enter: 아무것도 보내지 않는다(크롬 순서·사파리 순서 둘 다)
      for (const webkitOrder of [false, true]) {
        const seen = await imeEnter(page, { composed: '시작해', webkitOrder });
        assert.equal(seen.length, 1); assert.equal(seen[0].keyCode, 229, `${name}: synthetic keydown carries keyCode 229`);
        await page.waitForTimeout(300);
        const st = await fakeState(page);
        assert.equal(st.sends.length, 0, `${name}: composing Enter sends nothing (webkitOrder=${webkitOrder})`);
        assert.equal(st.reads.length, 0, `${name}: composing Enter does not start a drawing (webkitOrder=${webkitOrder})`);
        assert.deepEqual(await userBubbles(page), []);
        assert.equal(await page.locator(INPUT).inputValue(), '시작해', `${name}: the composed words stay in the input`);
      }
      if (name === 'chromium') {
        // 크롬: 실제 입력기 경로(CDP Input.imeSetComposition) — 조합 중 Enter 키
        const cdp = await context.newCDPSession(page);
        await page.locator(INPUT).fill('');
        await page.locator(INPUT).focus();
        const keys = [];
        await page.evaluate((sel) => { const el = document.querySelector(sel); window.__keys = []; window.addEventListener('keydown', (e) => { if (e.target === el) window.__keys.push({ key: e.key, isComposing: e.isComposing, keyCode: e.keyCode }); }, { capture: true }); }, INPUT);
        await cdp.send('Input.imeSetComposition', { text: '시작하', selectionStart: 3, selectionEnd: 3 });
        await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
        await page.waitForTimeout(300);
        keys.push(...await page.evaluate(() => window.__keys));
        assert.ok(keys.some((k) => k.key === 'Enter' || k.keyCode === 229), `${name}: CDP delivered the Enter during composition (${JSON.stringify(keys)})`);
        assert.equal((await fakeState(page)).sends.length, 0, `${name}: CDP composing Enter sends nothing ${JSON.stringify(keys)}`);
        await cdp.send('Input.insertText', { text: '시작해' });
        await page.locator(INPUT).fill('');
        await cdp.detach();
      }

      // 조합을 끝낸 뒤 Enter = 대화만
      await page.locator(INPUT).fill('');
      await chat(page, USER[0]);
      let st = await fakeState(page);
      assert.equal(st.sends.filter((s) => s.purpose === 'chat').length, 1);
      assert.equal(st.sends.filter((s) => s.purpose === 'image').length, 0, `${name}: committed Enter only chats`);
      assert.equal(st.reads.length, 0, `${name}: committed Enter does not draw`);
      assert.match(st.sends[0].text, /그림을 그리지 않는다/, `${name}: the create-tab chat prompt says the chat AI does not draw`);
      // ✈(입력칸 안) 단추도 대화
      await page.locator(INPUT).fill(USER[1]);
      await page.locator(`${PANEL} [data-ai-chat-send]`).click();
      await page.waitForFunction(() => window.__engineFake.sends.filter((s) => s.purpose === 'chat').length === 2, null, { timeout: 15000 });
      await idle(page); await page.waitForTimeout(150);
      // ⇧Enter = 줄바꿈(보내지 않음)
      await page.locator(INPUT).fill('줄');
      await page.locator(INPUT).press('Shift+Enter');
      assert.equal(await page.locator(INPUT).inputValue(), '줄\n');
      assert.equal(await sendsOf(page, 'chat'), 2);
      await page.locator(INPUT).fill('');

      // 3) 나머지 대화 → 정리 답 아래 「이대로 그리기」, 질문도 대화로
      for (const text of USER.slice(2)) await chat(page, text);
      assert.equal(await page.locator(`${PANEL} [data-ai-chip="draw-now"]`).count(), 1, `${name}: 「이대로 그리기」 under the AI summary`);
      await chat(page, '지금 이미지를 생성중이야?');
      assert.equal(await sendsOf(page, 'image'), 0, `${name}: a question never becomes a drawing`);
      assert.match(await logText(page), /아직 그리지 않았어요/);
      assert.equal(await page.locator(`${PANEL} [data-ai-chip="draw-now"]`).count(), 1, `${name}: one 「이대로 그리기」 (the latest)`);
      assert.match(await send.getAttribute('title'), /^지금까지 대화 12개를 모아 새로 그립니다 · /, `${name}: what the button will do lives in its tooltip`);
      assert.equal(await newChat.isDisabled(), false, `${name}: 새 대화 on once there is a conversation`);
      await shot(page, `${name}-2-chat.png`);

      // 4) ⌘Enter = 이미지 생성(대화 전체)
      await page.locator(INPUT).focus();
      await page.keyboard.press(`${MOD}+Enter`);
      await page.waitForFunction(() => window.__engineFake.sends.some((s) => s.purpose === 'image'), null, { timeout: 30000 });
      await idle(page); await page.waitForTimeout(500);
      st = await fakeState(page);
      const expandRead = st.reads.find((t) => /교사와 AI가 그림을 정리한 대화/.test(t));
      assert.ok(expandRead, `${name}: the whole conversation goes to the expand step`);
      assert.match(expandRead, /NADPH/); assert.match(expandRead, /세팅하는 사람/);
      assert.match(expandRead, /교사의 요청: 광합성에서/, `${name}: the request is the teacher's words, not the last question`);
      assert.match(await logText(page), /지금까지 대화 12개를 모아 이렇게 그려요\./);
      assert.equal(await resultCount(page), 1);
      assert.equal((await send.textContent()).trim(), '이 그림 고치기');
      assert.match(await page.locator(`${PANEL} [data-ai-create-hint]`).textContent(), new RegExp(`${modKey.replace('+', '\\+')}Enter 이 그림 고치기`));
      assert.match(await send.getAttribute('title'), /^보는 그림 생성 결과 1에서 적은 곳만 고칩니다 · /);
      assert.ok(await page.locator(`${PANEL} [data-ai-create-more]`).isVisible(), `${name}: ▾ after a result`);
      const meta1 = await page.evaluate(() => document.querySelector('#ai-image-panel')?.aiWorkbench ? null : null);
      void meta1;
      // 7) 작업 목록 표시
      const notices = await page.locator(`${PANEL} .ai-result-notice`).allTextContents();
      assert.ok(notices.every((t) => t === '새 결과'), `${name}: notice reads 새 결과 (${notices})`);
      assert.ok(!(await page.locator(`${PANEL} [data-ai-tab-list]`).textContent()).includes('확인 필요'));
      await shot(page, `${name}-3-result.png`);

      // 5-a) 빈 그림 한 번 → 다른 모델로 자동 다시 → 결과 2
      await page.evaluate(() => { window.__engineFake.white = 1; });
      const imagesBefore = (await fakeState(page)).sends.filter((s) => s.purpose === 'image');
      await page.locator(`${PANEL} [data-ai-create-more]`).click();
      assert.deepEqual((await page.locator(`${PANEL} .ai-create-more-menu button`).allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim()),
        [`이 그림 고치기 ${isMac ? '⌘Enter' : 'Ctrl+Enter'}`, '새로 그리기 결과 1 뒤 대화로', '처음부터 다시 그리기 대화 전체로', '새 대화 대화를 비우고 결과는 남김']);
      await shot(page, `${name}-3b-menu.png`);
      await page.locator(`${PANEL} [data-ai-create-new]`).click();
      assert.equal((await send.textContent()).trim(), '새로 그리기');
      assert.equal(await page.locator(INPUT).inputValue(), '', `${name}: 새로 그리기 no longer stuffs the first request into the input`);
      // V5: 결과 1 뒤 대화가 없으면 막지 않고 결과 1을 만든 내용으로 다시 그린다
      assert.match(await send.getAttribute('title'), /^생성 결과 1 뒤 대화가 없어 같은 내용으로 다시 그립니다/);
      await send.click();
      await page.waitForFunction((n) => window.__engineFake.sends.filter((s) => s.purpose === 'image').length >= n + 2, imagesBefore.length, { timeout: 30000 });
      await idle(page); await page.waitForTimeout(500);
      st = await fakeState(page);
      const two = st.sends.filter((s) => s.purpose === 'image').slice(imagesBefore.length);
      assert.equal(two.length, 2);
      assert.notEqual(two[0].model, two[1].model, `${name}: the redraw uses the other image model (${two.map((s) => s.model)})`);
      assert.match(await logText(page), /그림이 비어 나와 다른 그림 모델\(.+\)로 한 번 더 그립니다/);
      assert.equal(await resultCount(page), 2, `${name}: the redrawn picture is result 2`);
      assert.match(await logText(page), /생성 결과 1 뒤 대화가 없어 같은 내용으로 다시 그려요\./);

      // 5-b) 두 번 다 빈 그림 → 결과로 넣지 않고 앞 결과 그대로 + 칩
      await page.evaluate(() => { window.__engineFake.white = 2; });
      await page.locator(`${PANEL} [data-ai-create-more]`).click();
      await page.locator(`${PANEL} [data-ai-create-new]`).click();
      await send.click();
      await page.waitForFunction(() => /두 번 그려도 빈 그림/.test(document.querySelector('#ai-image-panel [data-ai-log]').textContent), null, { timeout: 30000 });
      await idle(page); await page.waitForTimeout(300);
      assert.equal(await resultCount(page), 2, `${name}: a blank picture is never added`);
      assert.match(await logText(page), /앞 결과는 그대로예요/);
      assert.deepEqual(await page.locator(`${PANEL} .ai-msg.chips .ai-chat-chip`).allTextContents(), ['다시 그리기', '말 바꿔 다시 적기']);
      assert.equal(await page.locator(`${PANEL} [data-ai-version-button]`).textContent(), '생성 결과 2', `${name}: the previous result stays selected`);
      await shot(page, `${name}-4-blank-kept.png`);
      // 「다시 그리기」 칩 → 같은 모은 요청으로 다시(이번에는 정상 그림)
      await page.locator(`${PANEL} [data-ai-chip="retry-draw"]`).click();
      await page.waitForFunction(() => document.querySelectorAll('#ai-image-panel .ai-msg.result').length === 3, null, { timeout: 30000 });
      await idle(page);

      // 6) 이 그림 고치기 — 고칠 곳 0개면 그리지 않고 묻는다
      await page.evaluate(() => { window.__engineFake.noTargets = true; });
      const imgCount = await sendsOf(page, 'image');
      await page.locator(INPUT).fill('지금 그림이 제대로 안보이는데?');
      await page.keyboard.press(`${MOD}+Enter`);
      await page.waitForFunction(() => /찾지 못해 고치지 않았어요/.test(document.querySelector('#ai-image-panel [data-ai-log]').textContent), null, { timeout: 30000 });
      await idle(page); await page.waitForTimeout(300);
      assert.equal(await sendsOf(page, 'image'), imgCount, `${name}: no drawing call when there is nothing to fix`);
      assert.equal(await resultCount(page), 3);
      assert.match(await logText(page), /어느 부분이 어떻게 안 보이는지 알려 주세요/);
      assert.deepEqual(await page.locator(`${PANEL} .ai-msg.chips .ai-chat-chip`).allTextContents(), ['말 바꿔 다시 적기']);
      await page.locator(`${PANEL} [data-ai-chip="reword"]`).click();
      assert.equal(await page.locator(INPUT).inputValue(), '지금 그림이 제대로 안보이는데?');
      await shot(page, `${name}-5-ask.png`);

      // 고칠 곳이 있으면 고친다(⌘Enter)
      await page.evaluate(() => { window.__engineFake.noTargets = false; });
      await page.locator(INPUT).fill('당 라벨은 빼 줘');
      await page.keyboard.press(`${MOD}+Enter`);
      await page.waitForFunction(() => document.querySelectorAll('#ai-image-panel .ai-msg.result').length === 4, null, { timeout: 30000 });
      await idle(page);
      assert.deepEqual((await userBubbles(page)).slice(-2), ['지금 그림이 제대로 안보이는데?', '당 라벨은 빼 줘']);

      // V5 안 A(태그 8·10): 결과 제목 = 테두리 + ▾ 단추 → 작은 그림 · 이름 · 한 일 · 시각 · ✓, 제목 바로 아래
      const vButton = page.locator(`${PANEL} [data-ai-version-button]`); // 11-26: 생성은 판 고르기가 도구줄로 올라감
      assert.notEqual(await vButton.evaluate((el) => getComputedStyle(el).borderTopStyle), 'none', `${name}: version title has a border`);
      assert.notEqual(await vButton.evaluate((el) => getComputedStyle(el, '::after').content), 'none', `${name}: version title has ▾`);
      await vButton.click();
      const rows = page.locator(`${PANEL} [data-ai-version-list] .ai-version-row`);
      assert.equal(await rows.count(), 4, `${name}: four results in the list`);
      assert.equal(await page.locator(`${PANEL} [data-ai-version-list] .ai-version-row img`).count(), 4, `${name}: each row has a thumbnail`);
      const subs = await page.locator(`${PANEL} [data-ai-version-list] .ai-version-row small`).allTextContents();
      assert.match(subs[subs.length - 1], /^처음 그림( · \d+:\d\d)?$/, `${name}: oldest row says 처음 그림 (${subs})`);
      assert.match(subs[1], /^새로 그림/, `${name}: redrawn rows say 새로 그림 (${subs})`);
      assert.equal(await page.locator(`${PANEL} [data-ai-version-list] .ai-version-row[aria-selected="true"] i`).textContent(), '✓');
      assert.match(await page.locator(`${PANEL} [data-ai-version-list] .ai-version-foot`).textContent(), /↑↓ 고르기 · Enter 보기/);
      const vb = await vButton.boundingBox(), vl = await page.locator(`${PANEL} [data-ai-version-list]`).boundingBox();
      assert.ok(Math.abs(vl.x - vb.x) <= 2 && vl.y >= vb.y + vb.height && vl.y - (vb.y + vb.height) <= 8, `${name}: list opens right under the title (${JSON.stringify(vb)} ${JSON.stringify(vl)})`);
      await shot(page, `${name}-6-version-list.png`);
      await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      assert.equal(await page.locator(`${PANEL} [data-ai-version-list]`).isHidden(), true);
      assert.match(await vButton.textContent(), /생성 결과 3/, `${name}: ↓ Enter picks the next row`);
      // 마지막 결과로 돌아오기
      await vButton.click(); await rows.first().click(); await page.waitForTimeout(200);

      // V5 태그 16: 결과가 나온 뒤 다음 그리기는 그 결과 뒤 대화만 읽는다
      const refChatFrom = (await fakeState(page)).sends.length;
      await chat(page, '오른쪽 비커에도 빛 화살표를 넣고, 사람 손은 왼쪽 비커만 잡게 해 줘');
      // 11-22: 대화 AI가 결과가 참고한 기출을 안다(맥락 글) — 그림을 볼 질문이 아니면 기출 그림은 붙이지 않는다.
      const refChat = (await fakeState(page)).sends.slice(refChatFrom).find((x) => x.purpose === 'chat');
      assert.match(refChat.text, /\[그림 결과가 참고한 기출[\s\S]*\(지금 보는 결과\):\n- 참고한 기출: /u, `${name}: the chat AI is told which past-exam figures were referenced`);
      assert.match(refChat.text, /첨부되지 않았다/u);
      assert.ok(!refChat.attachments.some((a) => a.startsWith('참고한 기출')), `${name}: no past-exam figure attached for a plain message`);
      const firstImage = (await fakeState(page)).sends.findIndex((x) => x.purpose === 'image');
      assert.ok((await fakeState(page)).sends.slice(0, firstImage).every((x) => !/참고한 기출:/u.test(x.text)), `${name}: no reference context before any result`);
      await page.locator(`${PANEL} [data-ai-create-more]`).click();
      const lastName = (await vButton.textContent()).trim();
      assert.equal((await page.locator(`${PANEL} [data-ai-create-new] small`).textContent()).trim(), `${lastName.replace(/^생성 /, '')} 뒤 대화로`);
      await page.locator(`${PANEL} [data-ai-create-new]`).click();
      assert.match(await send.getAttribute('title'), new RegExp(`^${lastName} 뒤 대화 2개를 모아 새로 그립니다`), `${name}: tooltip says what is gathered`);
      let readsBefore = (await fakeState(page)).reads.length;
      await send.click();
      await page.waitForFunction(() => document.querySelectorAll('#ai-image-panel .ai-msg.result').length === 5, null, { timeout: 30000 });
      await idle(page); await page.waitForTimeout(200);
      let expand = (await fakeState(page)).reads.slice(readsBefore).find((t) => /교사의 요청:/.test(t));
      assert.ok(expand, `${name}: the redraw ran the expand step`);
      assert.match(expand, /빛 화살표/);
      assert.doesNotMatch(expand, /광합성에서|물질의 차이/, `${name}: talk before the result is not gathered`);
      assert.match(await logText(page), new RegExp(`${lastName} 뒤 대화 2개를 모아 이렇게 그려요\\.[\\s\\S]*그 앞 대화도 쓰려면 「처음부터 다시 그리기」`));
      await shot(page, `${name}-7-after-result.png`);

      // V5 태그 12·13·14: 「새 대화」 — 되돌리기 먼저
      const resultsBefore = await resultCount(page);
      await newChat.click();
      assert.equal(await page.locator(`${PANEL} .ai-msg.divider`).count(), 1);
      await page.locator(`${PANEL} [data-ai-newchat-undo]`).click();
      assert.equal(await page.locator(`${PANEL} .ai-msg.divider`).count(), 0, `${name}: 되돌리기 removes the divider`);
      assert.equal((await send.textContent()).trim(), '이 그림 고치기');
      assert.equal(await page.locator(`${PANEL} .ai-msg.is-before-reset`).count(), 0);
      // ▾ 메뉴의 「새 대화」(안 3)
      await page.locator(`${PANEL} [data-ai-create-more]`).click();
      await page.locator(`${PANEL} [data-ai-create-reset]`).click();
      assert.match(await page.locator(`${PANEL} .ai-msg.divider`).textContent(), /여기부터 새 대화 · 위 대화는 그림에 쓰지 않아요/);
      assert.ok(await page.locator(`${PANEL} .ai-msg.is-before-reset`).count() > 5, `${name}: earlier turns are dimmed`);
      assert.equal(await page.locator(`${PANEL} .ai-msg.divider`).evaluate((el) => el.classList.contains('is-before-reset')), false);
      assert.equal(await resultCount(page), resultsBefore, `${name}: results stay in the chat`);
      assert.equal((await page.locator(`${PANEL} [data-ai-version-list] [data-ai-candidate-option]`).count()), resultsBefore, `${name}: results stay in the version list`);
      assert.equal((await send.textContent()).trim(), '이미지 생성', `${name}: 새 대화 → 이미지 생성`);
      assert.ok(await newChat.isDisabled(), `${name}: nothing to cut right after 새 대화`);
      await page.waitForTimeout(5300);
      assert.equal(await page.locator(`${PANEL} [data-ai-newchat-undo]`).count(), 0, `${name}: 되돌리기 goes away after 5 s`);
      const chatSendsBefore = (await fakeState(page)).sends.length;
      await chat(page, '같은 실험인데 비커 대신 시험관 두 개로, 사람은 빼고 그려줘');
      const chatPrompt = (await fakeState(page)).sends.slice(chatSendsBefore).find((x) => x.purpose === 'chat');
      assert.doesNotMatch(chatPrompt.text, /빛 화살표|물질의 차이를 보여주려는거야/, `${name}: the chat AI does not get the talk above 새 대화`);
      assert.equal((await page.locator(`${PANEL} [data-ai-create-hint]`).textContent()).trim(), `Enter 대화 · ${modKey}Enter 이미지 생성 (새 대화 2개로)`);
      await shot(page, `${name}-8-new-chat.png`);
      readsBefore = (await fakeState(page)).reads.length;
      await page.locator(INPUT).focus(); await page.keyboard.press(`${MOD}+Enter`);
      await page.waitForFunction((n) => document.querySelectorAll('#ai-image-panel .ai-msg.result').length === n + 1, resultsBefore, { timeout: 30000 });
      await idle(page); await page.waitForTimeout(200);
      expand = (await fakeState(page)).reads.slice(readsBefore).find((t) => /교사의 요청:/.test(t));
      assert.match(expand, /시험관/); assert.doesNotMatch(expand, /빛 화살표|광합성에서/, `${name}: nothing above 새 대화 is drawn`);
      assert.match(await logText(page), /새 대화 2개를 모아 이렇게 그려요\./);
      assert.equal((await send.textContent()).trim(), '이 그림 고치기', `${name}: back to 이 그림 고치기 once the new result arrives`);
      // ▾ 「처음부터 다시 그리기」 = 새 대화 뒤 대화 전체(새 대화 위로는 가지 않음)
      await page.locator(`${PANEL} [data-ai-create-more]`).click();
      await page.locator(`${PANEL} [data-ai-create-all]`).click();
      assert.equal((await send.textContent()).trim(), '처음부터 다시 그리기');
      readsBefore = (await fakeState(page)).reads.length;
      await send.click();
      await page.waitForFunction((n) => document.querySelectorAll('#ai-image-panel .ai-msg.result').length === n + 2, resultsBefore, { timeout: 30000 });
      await idle(page);
      expand = (await fakeState(page)).reads.slice(readsBefore).find((t) => /교사의 요청:/.test(t));
      assert.match(expand, /시험관/); assert.doesNotMatch(expand, /빛 화살표|광합성에서/);

      // 11-22: 그림을 봐야 하는 질문(비교)일 때만 지금 보는 결과의 참고 기출 그림을 붙인다.
      const compareFrom = (await fakeState(page)).sends.length;
      await chat(page, '참고한 기출 그림이랑 비교해 줘');
      const compareChat = (await fakeState(page)).sends.slice(compareFrom).find((x) => x.purpose === 'chat');
      const refNames = compareChat.attachments.filter((a) => a.startsWith('참고한 기출 · '));
      assert.ok(refNames.length >= 1 && refNames.length <= 3, `${name}: past-exam figures attached for a comparison (${compareChat.attachments})`);
      assert.match(compareChat.text, new RegExp(`기출 그림 ${refNames.length}장을 「참고한 기출 · …」 이름으로 첨부했다`, 'u'));
      assert.doesNotMatch(await logText(page), /참고한 기출(:| · )/u, `${name}: the screen does not show the referenced figures`);

      // A note on the selected result is discussion context on Enter and an edit instruction on ⌘/Ctrl+Enter.
      await page.locator(`${PANEL} [data-ai-comment-tool="area"]`).click();
      const picture = await page.locator(`${PANEL} .is-ai-active-candidate .ai-preview-stage > img`).boundingBox();
      await page.mouse.move(picture.x + picture.width * .32, picture.y + picture.height * .35);
      await page.mouse.down();
      await page.mouse.move(picture.x + picture.width * .46, picture.y + picture.height * .49);
      await page.mouse.up();
      const popup = page.locator(`${PANEL} [data-ai-comment-popover]`);
      const comment = '이 박스에 창문 두 개 추가';
      await popup.locator('textarea').fill(comment);
      await popup.locator('.ai-comment-popover-close').click();
      const beforeQuestion = await resultCount(page);
      await chat(page, '두 번째 그림에 단 코멘트를 읽어 줘');
      const answerRequest = (await fakeState(page)).sends.at(-1);
      assert.equal(answerRequest.purpose, 'chat');
      assert.match(answerRequest.text, /박스 1 \(x=.*%, y=.*%, w=.*%, h=.*%\): 이 박스에 창문 두 개 추가/);
      assert.equal(await resultCount(page), beforeQuestion);
      assert.equal(await page.locator(INPUT).inputValue(), '');
      await page.locator(INPUT).press(`${MOD}+Enter`);
      await page.waitForFunction(note => window.__engineFake.reads.some(text =>
        text.includes('교사가 이 그림에서 일부만') && text.includes(note) && text.includes('박스 1 (x=')), comment);
      await idle(page);

      // 11-25 밤샘 검수(포물선 결과 5): 결과를 고른 채 대화 정리 답 아래 「이대로 그리기」를 누르면 새로 그리지 않고 고른 결과를 고친다
      // — 원본 그림·코멘트 좌표·결과 뒤 대화가 고치기 요청에 함께 실린다.
      // 고치기 로딩 화면이 걷힌 뒤에 그린다(끝난 뒤 잠깐 남아 그림을 덮는다).
      await page.waitForTimeout(2500);
      const areaTool = page.locator(`${PANEL} [data-ai-comment-tool="area"]`);
      if (await areaTool.getAttribute('aria-pressed') !== 'true') await areaTool.click();
      const picked = await page.locator(`${PANEL} .is-ai-active-candidate .ai-preview-stage > img`).boundingBox();
      await page.mouse.move(picked.x + picked.width * .2, picked.y + picked.height * .3);
      await page.mouse.down();
      await page.mouse.move(picked.x + picked.width * .3, picked.y + picked.height * .5);
      await page.mouse.up();
      await popup.locator('textarea').fill('왼쪽 건물에 창문');
      await popup.locator('.ai-comment-popover-close').click();
      await chat(page, '박스에 창문을 넣고, 입사각은 법선 기준으로 해 줘');
      const chip = page.locator(`${PANEL} [data-ai-chip="draw-now"]`).last();
      assert.ok(await chip.isVisible(), `${name}: 「이대로 그리기」 under the summary after a result`);
      const drawNowFrom = (await fakeState(page)).reads.length;
      const resultsBeforeChip = await resultCount(page);
      await chip.click();
      await page.waitForFunction((n) => document.querySelectorAll('#ai-image-panel .ai-msg.result').length === n + 1, resultsBeforeChip, { timeout: 30000 });
      await idle(page);
      const chipReads = (await fakeState(page)).reads.slice(drawNowFrom);
      const editRead = chipReads.find((t) => t.includes('교사가 이 그림에서 일부만'));
      assert.ok(editRead, `${name}: 「이대로 그리기」 with a result edits the picked result`);
      assert.match(editRead, /박스 1 \(x=.*\): 왼쪽 건물에 창문/, `${name}: the comment box on the picked result rides along`);
      assert.match(editRead, /법선 기준/, `${name}: the talk after the result becomes the edit instruction`);
      assert.ok(!chipReads.some((t) => /교사의 요청:/.test(t)), `${name}: no fresh expand step`);
      // 고치기가 오류로 끝나면 장면 전체를 새로 그리지 않고 앞 결과를 그대로 둔 채 고르게 한다
      const failFrom = await fakeState(page);
      const resultsBeforeFail = await resultCount(page);
      await page.evaluate(() => { window.__engineFake.failImage = 50; });
      await page.locator(INPUT).fill('창문을 세 개로');
      await page.keyboard.press(`${MOD}+Enter`);
      await page.waitForFunction(() => /고치지 못했어요/.test(document.querySelector('#ai-image-panel [data-ai-log]').textContent), null, { timeout: 60000 });
      await idle(page);
      await page.evaluate(() => { window.__engineFake.failImage = 0; });
      assert.equal(await resultCount(page), resultsBeforeFail, `${name}: a failed edit adds nothing`);
      assert.ok(!(await fakeState(page)).reads.slice(failFrom.reads.length).some((t) => /교사의 요청:/.test(t)), `${name}: a failed edit does not silently redraw the whole scene`);
      assert.deepEqual(await page.locator(`${PANEL} .ai-msg.chips .ai-chat-chip`).allTextContents(), ['한 번 더 고치기', '새로 그리기']);

      await closeAiPanel(page);
      assert.deepEqual(errors, [], `${name}: no page errors`);
      console.log(`${name}: chat/generate split ok`);
    } finally { await browser.close(); }
  }
});
