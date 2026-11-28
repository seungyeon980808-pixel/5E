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
    const boxes = () => LABELS.filter(([t]) => t !== 'T').map(([text, x, y]) => ({ text, kind: /\d/.test(text) ? 'qty' : 'en', x: (x - 4) / W, y: (y - 40) / H, w: (text.length * 30 + 10) / W, h: 52 / H, onDimensionLine: false, leader: null }));
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
const objects = page => page.evaluate(async () => (await import('/js/state.js?v=1.7.0-four-session-integration')).state.get().objects.map(o => ({ type: o.type, text: o.text || o.content || '', haloRatio: o.haloRatio })));

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
      const outputButtons = page.locator(`${PANEL} :is(.ai-output-actions,.ai-output-more):visible`);
      assert.equal(await outputButtons.count(),0,'생성 전에는 출력 작업 줄을 숨긴다');
      // 11-27 사용자: 생성 화면은 결과 전에도 도구줄 한 줄 — 결과 이름 줄 없음, 「코멘트 점 박스」, 라벨·코멘트 켜기는 늘 자리에(쓸 수 없으면 흐리게)
      assert.equal(await page.locator(PANEL).getAttribute('data-ai-create-one-row'), '');
      assert.equal(await page.locator(`${PANEL} .ai-result-pane > .ai-pane-head`).isVisible(), false, '결과 이름 줄 없음');
      assert.ok(await page.locator(`${PANEL} .ai-compare-heading > .ai-version-picker`).isVisible());
      assert.ok(await page.locator(`${PANEL} .ai-compare-heading > [data-ai-create-add-ref]`).isVisible());
      assert.equal(await page.locator(`${PANEL} [data-ai-comment-tool="pan"]`).isVisible(), false);
      assert.equal(await page.locator(`${PANEL} [data-ai-comment-tool="free"]`).isVisible(), false);
      assert.ok(await page.locator(`${PANEL} .ai-annotation-toolbar [data-ai-label-toggle]`).isVisible(), '라벨 켜기는 처음부터 보인다');
      assert.equal(await page.locator(`${PANEL} .ai-annotation-toolbar [data-ai-label-toggle]`).isDisabled(), true, '결과가 없으면 흐리게');
      assert.ok(await page.locator(`${PANEL} [data-ai-comment-visibility]`).isVisible());
      await shot(page, `${name}-0-before-result.png`);
      const conditions = page.locator(`${PANEL} .ai-chat-composer .ai-create-label-options`);
      assert.ok(await conditions.isVisible());
      assert.equal(await page.locator(`${PANEL} .ai-compact-settings`).isVisible(), false);
      const embedded = conditions.locator('input[value="embedded"]');
      // 11-27 라벨 3칸: 없음 / 그림 속 글자(기본) / 편집 라벨
      assert.deepEqual(await conditions.locator('label span').allTextContents(), ['없음','그림 속 글자','편집 라벨']);
      assert.equal(await embedded.isChecked(),true);
      await conditions.locator('label').last().click();
      assert.equal(await embedded.isChecked(),false);
      await conditions.locator('label').nth(1).click();
      assert.equal(await embedded.isChecked(),true);
      const right = await page.locator(`${PANEL} .ai-conversation`).boundingBox();
      assert.ok(Math.abs(right.width - 598) <= 2, `${name}: chat panel is 598px in result-only view (${right.width})`);

      // 2·3) 생성: 말풍선 → 진행 줄 + 새 로딩 창 → 멈추기 → 결과 카드
      await page.evaluate(() => { window.__engineFake.hold = true; });
      await send(page, REQ);
      await page.waitForFunction(p => document.querySelector(p).dataset.blurLoading === 'true', PANEL, { timeout: 20000 });
      await page.waitForTimeout(400);
      s = await state(page);
      assert.equal(await outputButtons.count(),0,'첫 결과 대기 중에도 출력 작업 줄을 숨긴다');
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
      assert.equal(await outputButtons.count(),1,'결과가 생기면 그림 아래에 내보내기를 표시한다');
      const footer = page.locator(`${PANEL} .ai-result-pane .ai-create-result-footer`);
      assert.ok(await footer.getByRole('button',{name:'클립보드로 복사'}).isVisible());
      const rows = await footer.locator('button:visible').evaluateAll(buttons => buttons.map(b => b.getBoundingClientRect().top)); const dims = await footer.locator('button:visible').evaluateAll(bs => bs.map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height), getComputedStyle(b).height, b.className]; }));
      assert.ok(rows.every(y => Math.abs(y-rows[0])<1),'데스크톱 출력 도구는 그림 아래 한 줄 '+JSON.stringify(dims));
      const manual = page.locator(`${PANEL} [data-result-mode="manual"]`);
      await manual.click();
      // 11-26 시안 v6 도구 격자: 선택·텍스트·지시선 라벨·길이 표시 / 지우개·자르기·가로 정렬·세로 정렬(예전 탭 단추는 숨김)
      const toolGrid = page.locator(`${PANEL} .ai-manual-tools .ai-edit-tools`);
      assert.deepEqual(await toolGrid.locator('button span').allTextContents(),['선택','텍스트','지시선 라벨','길이 표시','지우개','자르기','가로 정렬','세로 정렬']);
      assert.equal(await page.locator(`${PANEL} .ai-manual-tools [data-ai-local-erase]`).isVisible(),false,'예전 지우개 단추는 격자가 맡는다');
      assert.equal(await page.locator(`${PANEL} [data-ai-chat-input]`).isVisible(),false);
      const tool = id => toolGrid.locator(`[data-ai-edit-tool="${id}"]`);
      const stageImg = page.locator(`${PANEL} .ai-generated-card.is-ai-active-candidate .ai-preview-stage > img`);
      // 도구를 바꾸면 오른쪽 칸 내용이 바뀌며 그림 자리가 잠깐 움직인다 — 그림 상자가 두 번 같게 잴 때까지 기다린 뒤 누른다.
      const at = async (fx, fy) => { let prev = null;
        for (let i = 0; i < 40; i++) { const r = await stageImg.boundingBox(); if (prev && Math.abs(prev.x-r.x) < .5 && Math.abs(prev.width-r.width) < .5) return [r.x + r.width * fx, r.y + r.height * fy]; prev = r; await page.waitForTimeout(120); }
        throw new Error('그림 자리가 멈추지 않음'); };
      await page.waitForTimeout(700); // 직접 편집으로 바뀌며 오른쪽 칸 폭이 움직이는 동안은 그림 자리가 바뀐다
      await tool('erase').click();
      assert.equal(await tool('erase').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator(`${PANEL} [data-ai-local-erase-options]`).isVisible(),true);
      // 텍스트: 그림을 누른 자리에 글자, 바로 아래 입력창에서 친다
      await tool('text').click();
      assert.equal(await tool('text').getAttribute('aria-pressed'),'true');
      await page.locator(`${PANEL} .ai-label-edit-overlay`).waitFor({state:'attached'});
      await page.mouse.click(...await at(.2,.2));
      const inplace = page.locator(`${PANEL} .ai-label-inplace`);
      await inplace.waitFor({timeout:5000});
      await inplace.fill('광원'); await inplace.press('Enter');
      await page.waitForFunction(p => [...document.querySelectorAll(p + ' .ai-label-edit-overlay [data-ai-label-id]')].some(g => g.getAttribute('aria-label') === '라벨 광원'), PANEL);
      assert.equal(await tool('select').getAttribute('aria-pressed'),'true','하나 만들면 선택 도구로 돌아간다');
      // 길이 표시: 끌어서 양 끝 → 가운데 글자 L과 길이 화살표 선, 양 끝 손잡이
      await tool('dimension').click();
      const [dx0, dy0] = await at(.15,.8), [dx1, dy1] = await at(.55,.8);
      await page.mouse.move(dx0,dy0); await page.mouse.down(); await page.mouse.move((dx0+dx1)/2,dy1,{steps:4}); await page.mouse.move(dx1,dy1,{steps:4}); await page.mouse.up();
      await inplace.waitFor(); await inplace.press('Enter');
      const dim = page.locator(`${PANEL} .ai-label-edit-overlay [data-ai-label-id][aria-label="라벨 L"]`);
      await dim.waitFor();
      assert.equal(await dim.locator('.ai-label-edit-handle').count(),2,'길이 표시는 양 끝 손잡이');
      // 자르기: 사각형으로 둘러싸 조각 분리(Enter) → 조각 하나, 선택 도구로 돌아감 → 끌어 옮김 → 실행 취소 두 번이면 분리 전
      await tool('crop').click();
      const [cx0, cy0] = await at(.6,.1), [cx1, cy1] = await at(.95,.45);
      await page.mouse.move(cx0,cy0); await page.mouse.down(); await page.mouse.move(cx1,cy1,{steps:5}); await page.mouse.up();
      assert.equal(await page.locator(`${PANEL} [data-ai-crop-apply]`).isEnabled(),true);
      await page.keyboard.press('Enter');
      const piece = page.locator(`${PANEL} img[data-ai-piece]`);
      await piece.waitFor();
      assert.equal(await tool('select').getAttribute('aria-pressed'),'true');
      const pieceBox = await piece.boundingBox();
      await page.mouse.move(pieceBox.x+pieceBox.width/2,pieceBox.y+pieceBox.height/2); await page.mouse.down();
      await page.mouse.move(pieceBox.x+pieceBox.width/2-80,pieceBox.y+pieceBox.height/2+40,{steps:6}); await page.mouse.up();
      await page.waitForFunction(([p,x]) => Math.abs(document.querySelector(p + ' img[data-ai-piece]').getBoundingClientRect().x - (x-80)) < 3, [PANEL,pieceBox.x]);
      await shot(page, `${name}-tools-piece.png`);
      await page.locator(`${PANEL} [data-ai-edit-undo]`).click();
      await page.waitForFunction(([p,x]) => Math.abs(document.querySelector(p + ' img[data-ai-piece]')?.getBoundingClientRect().x - x) < 3, [PANEL,pieceBox.x]);
      await page.locator(`${PANEL} [data-ai-edit-undo]`).click();
      await page.waitForFunction(p => !document.querySelector(p + ' img[data-ai-piece]'), PANEL);
      await page.locator(`${PANEL} [data-ai-edit-discard]`).click();
      await page.waitForFunction(p => document.querySelector(p).dataset.aiEditDraft !== 'true', PANEL);
      // 11-26 시안(판 목록 8): AI 결과에서 처음 저장하면 새 「직접 수정본」, 그 판을 다시 저장하면 같은 판에 덮어쓴다.
      const cardCount = () => page.locator(`${PANEL} .ai-generated-card`).count();
      const eraseOnce = async (fx, fy) => {
        await tool('erase').click(); await page.locator(`${PANEL} [data-ai-erase-background]`).selectOption('transparent');
        const [ex, ey] = await at(fx, fy); await page.mouse.move(ex, ey); await page.mouse.down(); await page.mouse.move(ex + 40, ey + 10, { steps: 5 }); await page.mouse.up();
        await page.waitForFunction(p => document.querySelector(p).dataset.aiEditDraft === 'true', PANEL);
        await page.keyboard.press(isMac ? 'Meta+s' : 'Control+s'); // ⌘S로 저장
        await page.waitForFunction(p => { const q = document.querySelector(p); return q.dataset.aiEditDraft !== 'true' && !q.querySelector('[data-ai-edit-save]:not([hidden])'); }, PANEL);
      };
      const cards0 = await cardCount();
      await eraseOnce(.3, .3);
      assert.equal(await cardCount(), cards0 + 1, '첫 저장은 새 판');
      const localId = await page.evaluate(p => document.querySelector(p).dataset.aiSelectedCandidateId, PANEL);
      await eraseOnce(.5, .3);
      assert.equal(await cardCount(), cards0 + 1, '손으로 고친 판을 다시 저장하면 덮어쓴다');
      assert.equal(await page.evaluate(p => document.querySelector(p).dataset.aiSelectedCandidateId, PANEL), localId);
      // 판 목록: 손으로 고친 판은 AI 결과 아래 들여쓰기, ⋯ 메뉴(복제·이름 바꾸기·지우기)
      const vBtn = page.locator(`${PANEL} [data-ai-version-button]`);
      await vBtn.click();
      const child = page.locator(`${PANEL} [data-ai-version-list] .ai-version-row.is-child[data-ai-candidate-option="${localId}"]`);
      await child.waitFor();
      assert.match(await child.textContent(), /2번 고침/);
      await child.locator('[data-ai-version-more]').click();
      assert.deepEqual(await page.locator(`${PANEL} .ai-version-menu button`).allTextContents(), ['이름 바꾸기', '복제해서 새 판으로', '지우기']);
      await page.locator(`${PANEL} .ai-version-menu [data-ai-version-menu-action="duplicate"]`).click();
      await page.waitForFunction(([p, n]) => document.querySelectorAll(p + ' .ai-generated-card').length === n, [PANEL, cards0 + 2]);
      const copyId = await page.evaluate(p => document.querySelector(p).dataset.aiSelectedCandidateId, PANEL);
      assert.notEqual(copyId, localId, '복제하면 새 판이 생기고 그 판을 본다');
      await vBtn.click();
      await page.locator(`${PANEL} [data-ai-candidate-option="${copyId}"] [data-ai-version-more]`).click();
      await page.locator(`${PANEL} .ai-version-menu [data-ai-version-menu-action="rename"]`).click();
      await page.locator('.modal-overlay .modal-input:visible').fill('빗면 수정');
      await page.locator('.modal-overlay [data-act="ok"]:visible').click();
      await page.waitForFunction(p => /빗면 수정/.test(document.querySelector(p + ' [data-ai-version-button]').textContent), PANEL);
      await vBtn.click();
      await page.locator(`${PANEL} [data-ai-candidate-option="${copyId}"] [data-ai-version-more]`).click();
      await page.locator(`${PANEL} .ai-version-menu [data-ai-version-menu-action="delete"]`).click();
      await page.locator('.modal-overlay .modal-btn-primary:visible').click();
      await page.waitForFunction(([p, n]) => document.querySelectorAll(p + ' .ai-generated-card').length === n, [PANEL, cards0 + 1]);
      // 11-26 시안(코멘트 6): 평소엔 주황 번호 단추만, 박스 영역은 고른 코멘트만 점선으로
      await page.locator(`${PANEL} [data-result-mode="chat"]`).click(); await page.waitForTimeout(300);
      await page.locator(`${PANEL} [data-ai-comment-tool="area"]`).click();
      const [bx0, by0] = await at(.6, .55), [bx1, by1] = await at(.75, .75);
      await page.mouse.move(bx0, by0); await page.mouse.down(); await page.mouse.move(bx1, by1, { steps: 5 });
      await page.mouse.up();
      const pop = page.locator(`${PANEL} [data-ai-comment-popover] textarea, ${PANEL} [data-ai-comment-popover] input`).first();
      if (await pop.isVisible().catch(() => false)) await pop.fill('여기 확인');
      const marker = page.locator(`${PANEL} .ai-comment-marker`).first();
      await marker.waitFor();
      const markerBg = await marker.evaluate(el => [getComputedStyle(el).backgroundColor, getComputedStyle(el).backgroundImage, el.className, el.tagName].join(' | ')); assert.match(markerBg, /^rgb\(232, 89, 12\)/, '코멘트 번호 단추는 주황: ' + markerBg);
      await shot(page, `${name}-comment-active.png`);
      // 팝오버 ×로 닫고(Esc는 고른 코멘트를 지운다) 박스 도구를 끈 뒤 그림 밖을 누른다.
      await page.locator(`${PANEL} [data-ai-comment-popover] [aria-label*="닫기"], ${PANEL} [data-ai-comment-popover] button:has-text("×")`).first().click();
      await page.locator(`${PANEL} [data-ai-comment-tool="area"]`).click();
      const stageBox = await stageImg.boundingBox(); await page.mouse.click(stageBox.x + stageBox.width / 2, stageBox.y + stageBox.height + 30); await page.waitForTimeout(300);
      assert.equal(await page.locator(`${PANEL} .ai-comment-marker`).count(), 1, '코멘트는 남아 있고 번호 단추만 보인다');
      const regions = await page.evaluate(p => [...document.querySelectorAll(p + ' .ai-comment-region:not(.ai-comment-drag-preview)')].map(el => [el.classList.contains('is-active'), getComputedStyle(el).display]), PANEL);
      assert.ok(regions.every(([, display]) => display === 'none'), '내용을 닫으면 코멘트 영역은 숨고 번호 단추만 남는다 ' + JSON.stringify(regions));
      await shot(page, `${name}-comment-idle.png`);
      // 뒤 단계가 보는 판 번호가 그대로이게, 이 확인에서 만든 판과 코멘트를 정리한다.
      await vBtn.click();
      await page.locator(`${PANEL} [data-ai-candidate-option="${localId}"] [data-ai-version-more]`).click();
      await page.locator(`${PANEL} .ai-version-menu [data-ai-version-menu-action="delete"]`).click();
      await page.locator('.modal-overlay .modal-btn-primary:visible', { hasText: '지우기' }).click();
      await page.waitForFunction(([p, n]) => document.querySelectorAll(p + ' .ai-generated-card').length === n, [PANEL, cards0]);
      await page.locator(`${PANEL} [data-result-mode="chat"]`).click();
      assert.ok(await page.locator(`${PANEL} [data-ai-chat-input]`).isVisible());
      assert.equal(s.send, '이 그림 고치기'); assert.equal(s.layout, 'result');
      assert.ok(!s.log.some(m => /이미지가 완성되었습니다/.test(m.text)), `${name}: the old completion line is gone`);
      const card1 = page.locator(`${PANEL} .ai-msg.result .ai-chat-result`).last();
      assert.match(await card1.textContent(), /생성 결과 1/); assert.match(await card1.textContent(), /보는 중/);
      assert.doesNotMatch(await card1.textContent(), /기출/, `${name}: 11-20 result card does not mention reference figures`);
      assert.deepEqual(await card1.locator('.ai-chat-chip').allTextContents(), ['확정하고 라벨 살리기', '라벨 빼기', '선 진하게', '각도 바꾸기', '새로 그리기']);
      assert.equal(await page.locator(`${PANEL} [data-ai-ref-strip], ${PANEL} [data-ai-ref-again]`).count(), 0, `${name}: 11-20 no 참고한 기출 띠`);
      assert.ok(!(await page.locator(`${PANEL} [data-ai-log]`).textContent()).includes('기출'), `${name}: 11-20 chat does not mention 기출`);
      // 11-26 시안(생성 화면 정리 5): 결과가 생기면 결과 이름 줄이 없어지고 판 고르기·라벨 켜기가 도구줄 한 줄로 올라간다.
      // 참고 그림은 입력칸의 📎에서 붙인다(「＋ 레퍼런스」 줄은 결과가 없을 때만).
      assert.ok(await page.locator(`${PANEL} .ai-compare-heading > [data-ai-create-add-ref]`).isVisible(), '＋ 레퍼런스는 도구줄에');
      assert.ok(await page.locator(`${PANEL} .ai-compare-heading > .ai-version-picker [data-ai-version-button]`).isVisible(), 'version picker sits in the one-row toolbar');
      assert.equal(await page.locator(`${PANEL} .ai-compare-controls`).isVisible(), false, 'no 레퍼런스/결과/비교 switch in 생성');
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
      assert.match(prompt, /onDimensionLine/);
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
      assert.deepEqual(after.slice(before).filter(o => o.text).map(o => o.haloRatio), [0,0,0,0,0]);
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
