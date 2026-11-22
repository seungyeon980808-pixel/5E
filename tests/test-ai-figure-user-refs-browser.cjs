'use strict';
// 고침 U1·E2(exp/1122-figure-fixes)를 가짜 설치판 연결로 끝까지 돈다(실제 AI 안 부름).
//  U1) 그림 생성 작업에 레퍼런스(손그림)를 넣고 대화 → 「이미지 생성」: 옛 exam-brief 길이 아니라 새 엔진(구체화·기출·흑백)으로,
//      교사 그림이 첫 첨부, 기출은 2장, 지시문에 손그림 역할 문장, 구체화에 대화 요약과 교사 그림 안내.
//  E2) 두 장면 중 하나가 빈 그림이면 그 장면만 다시(구체화·검색 글 호출 없이 그림 1번), 결과 카드 2장.
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
const PNG = path.join(__dirname, 'fixtures/rights-clear-smoke.png');
const REF = fs.readFileSync(PNG).toString('base64');

async function fakeDesktop(context) {
  await context.addInitScript(() => {
    for (const p of ['', '5e.preview:']) { localStorage.setItem(p + '5e.tutorial.bannerSeen', 'true'); localStorage.setItem(p + '5e.mode', 'pro'); }
    const listeners = new Set();
    const draw = (blank, n) => {
      const c = document.createElement('canvas'); c.width = 900; c.height = 600; const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, 900, 600);
      if (!blank) { g.strokeStyle = '#000'; g.lineWidth = 5; g.strokeRect(120 + n * 10, 200, 600, 60); g.beginPath(); g.moveTo(300, 80); g.lineTo(600, 230); g.stroke(); g.fillStyle = '#000'; g.font = '40px serif'; g.fillText('A' + n, 200, 400); }
      return c.toDataURL('image/png');
    };
    const fake = window.__engineFake = { sends: [], reads: [], scenes: ['막대와 추 한 장면'], blankAt: new Set(), n: 0, img: 0 };
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
        fake.reads.push(text);
        if (/그림 담당/.test(text)) return { text: JSON.stringify({ type: '역학', graph: false, scenes: fake.scenes, keyValues: '', notes: '' }) };
        if (/「참고 그림」으로 쓸/.test(text)) return { text: '[]' };
        return { text: JSON.stringify({ subject: '물리학Ⅰ', types: ['역학 모식도(물체·빗면·도르래·용수철)'], keywords: ['막대', '추'], has: false, texts: [] }) };
      },
      send: async payload => {
        const turnId = `fake-${++fake.n}`;
        if (payload.purpose === 'image') {
          const k = ++fake.img;
          fake.sends.push({ ephemeral: payload.ephemeralRender === true, text: String(payload.text || ''), atts: (payload.attachments || []).map(a => ({ name: a.name, head: String(a.data || '').slice(0, 30), len: String(a.data || '').length })) });
          (async () => {
            const img = draw(fake.blankAt.has(k), k);
            emit({ clientScope: payload.clientScope, method: 'item/completed', params: { turnId, item: { type: 'imageGeneration', status: 'completed', imageDataUrl: img } } });
            emit({ clientScope: payload.clientScope, method: 'turn/completed', params: { turn: { id: turnId, status: 'completed' } } });
          })();
        } else {
          // 대화 차례: 짧은 답
          (async () => {
            emit({ clientScope: payload.clientScope, method: 'item/completed', params: { turnId, item: { type: 'agentMessage', text: '막대 위에 추를 매단 그림으로 정리했어요.' } } });
            emit({ clientScope: payload.clientScope, method: 'turn/completed', params: { turn: { id: turnId, status: 'completed' } } });
          })();
        }
        return { turnId, threadId: 'thread-' + turnId, renderThreadId: turnId };
      },
    };
  });
}

const idle = page => page.waitForFunction(p => document.querySelector(p)?.dataset.aiBusy !== 'true', PANEL, { timeout: 60000 });
const shot = (page, name) => (out ? page.screenshot({ path: path.join(out, name) }) : null);
const draw = async (page, text) => { await page.locator(`${PANEL} [data-ai-chat-input]`).fill(text); await page.locator(`${PANEL} [data-ai-send]`).click(); };

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

      // U1) 손그림 레퍼런스 + 이미지 생성 → 새 엔진
      await page.locator(`${PANEL} [data-ai-source-file]`).setInputFiles(PNG);
      await page.waitForFunction(p => document.querySelector(p).querySelector('[data-ai-reference-count]').textContent === '1', PANEL);
      await draw(page, '손그림처럼 수평 막대 위 O점 받침과 추 A를 그려 줘');
      await idle(page); await page.waitForTimeout(500);
      const f = await page.evaluate(() => ({ sends: window.__engineFake.sends, reads: window.__engineFake.reads }));
      assert.equal(f.sends.length, 1, `${name}: one picture turn (${f.sends.length})`);
      const s1 = f.sends[0];
      assert.equal(s1.ephemeral, true, `${name}: the new engine's direct picture turn, not the old exam-brief turn`);
      assert.doesNotMatch(s1.text, /이미지 하네스다/, `${name}: not the old exam-brief prompt`);
      assert.match(s1.text, /\[교사 그림\] 첫 첨부는 교사가 손으로 그린 밑그림이다/);
      assert.match(s1.text, /\[첨부 순서\] 1번째 첨부 = 교사가 붙인 그림/);
      assert.match(s1.text, /글자 규칙\(평가원 시험지와 같게\)/, `${name}: 정자·기울임 글자 규칙이 들어간다`);
      assert.equal(s1.atts.length, 3, `${name}: teacher sketch + two 기출 (${s1.atts.length})`);
      assert.equal(s1.atts[0].name, 'figure-ref-1.png');
      const expandRead = f.reads.find(t => /그림 담당/.test(t));
      assert.ok(expandRead, `${name}: expand ran`);
      assert.match(expandRead, /교사가 그림 1장\(손그림\)을 붙였고/);
      const card = page.locator(`${PANEL} .ai-msg.result .ai-chat-result`).last();
      assert.match(await card.textContent(), /생성 결과 1/);
      await shot(page, `${name}-u1-result.png`);

      // E2) 새 작업(레퍼런스 없음), 두 장면 중 둘째가 빈 그림 → 그 장면만 다시
      await page.locator(`${PANEL} [data-ai-task-add]`).click();
      await page.waitForFunction(p => document.querySelectorAll(`${p} [data-ai-tab-list] .ai-task-tab[data-tab-id]`).length === 2, PANEL);
      await page.waitForTimeout(300);
      await page.evaluate(() => { const f = window.__engineFake; f.scenes = ['장면 1: 피스톤 아래', '장면 2: 피스톤 위']; f.sends = []; f.reads = []; f.blankAt = new Set([f.img + 2]); });
      await draw(page, '실린더 피스톤 두 장면을 따로 그려 줘');
      await idle(page); await page.waitForTimeout(500);
      const g = await page.evaluate(() => ({ sends: window.__engineFake.sends, reads: window.__engineFake.reads }));
      assert.equal(g.sends.length, 3, `${name}: two scenes + one redraw of the blank scene (${g.sends.length})`);
      assert.equal(g.reads.filter(t => /그림 담당/.test(t)).length, 1, `${name}: expand ran once (not again for the blank scene)`);
      assert.match(g.sends[2].text, /\[내용\]\n장면 2: 피스톤 위/, `${name}: the redraw uses the same scene text`);
      assert.match(g.sends[2].text, /\[앞 장면과 맞추기\]/, `${name}: the redraw keeps the scene-0 anchor`);
      const cards = await page.locator(`${PANEL} .ai-chat-result-meta > b`).allTextContents();
      assert.equal(cards.length, 2, `${name}: two results (${cards})`);
      assert.match(cards.join(' '), /장면 1\/2[\s\S]*장면 2\/2/);
      assert.ok((await page.locator(`${PANEL} [data-ai-log]`).textContent()).includes('그림이 비어 나와'), `${name}: blank notice in chat`);
      await shot(page, `${name}-e2-result.png`);
      await closeAiPanel(page);
      assert.deepEqual(errors, [], `${name}: no page errors`);
      console.log(`${name}: figure user refs + blank scene ok`);
    } finally { await browser.close(); }
  }
});
