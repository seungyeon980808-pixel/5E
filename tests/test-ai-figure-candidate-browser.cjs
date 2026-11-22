'use strict';
// 11-23 앱 반영 후보(exp/1122-figure-candidate)를 가짜 설치판 연결로 끝까지 돈다(실제 AI 안 부름, 크레딧 0).
//  S) 손그림 + 「이미지 생성」: 새 엔진 + 짧은 명세(글 AI 한 번 → [밑그림 명세]), 기출 0장, 손그림은 배치 안내 역할.
//  R) 레퍼런스(손그림 말 없음) + 「이미지 생성」: 옛 exam-brief 길(새 엔진 아님).
//  M) 세 장면: 한 장에 나란히 그린 그림 한 번 → 화면 canvas로 칸 자르기·2배 키우기 → 결과 카드 3장.
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
    const drawPanels = (n) => {
      const c = document.createElement('canvas'); c.width = 300 * n + 120; c.height = 400; const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.strokeStyle = '#000'; g.lineWidth = 4;
      const cell = Math.floor((c.width - 120 * (n + 1)) / n);
      for (let i = 0; i < n; i++) { const x = 120 + i * (cell + 120); g.strokeRect(x, 100, cell, 200); g.beginPath(); g.moveTo(x, 100); g.lineTo(x + cell, 300); g.stroke(); }
      return c.toDataURL('image/png');
    };
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
        if (/짧은 명세만 쓴다/.test(text)) return { text: '- 막대: 1개, 가운데 수평\n- 받침 O: 막대 왼쪽 아래\n- 추 A: 막대 오른쪽 끝에 매달림\n- 라벨: 「A」 → 추(지시선)' };
        return { text: JSON.stringify({ subject: '물리학Ⅰ', types: ['역학 모식도(물체·빗면·도르래·용수철)'], keywords: ['막대', '추'], has: false, texts: [] }) };
      },
      send: async payload => {
        const turnId = `fake-${++fake.n}`;
        if (payload.purpose === 'image') {
          const k = ++fake.img;
          fake.sends.push({ ephemeral: payload.ephemeralRender === true, text: String(payload.text || ''), atts: (payload.attachments || []).map(a => ({ name: a.name, head: String(a.data || '').slice(0, 30), len: String(a.data || '').length })) });
          (async () => {
            const many = /한 장의 가로로 긴 그림에 다음 (\d)개 그림을/.exec(String(payload.text || ''));
            const img = many ? drawPanels(Number(many[1])) : draw(fake.blankAt.has(k), k);
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
const newTab = async (page, n) => {
  await page.locator(`${PANEL} [data-ai-task-add]`).click();
  await page.waitForFunction(([p, k]) => document.querySelectorAll(`${p} [data-ai-tab-list] .ai-task-tab[data-tab-id]`).length === k, [PANEL, n]);
  await page.waitForTimeout(300);
  await page.evaluate(() => { const f = window.__engineFake; f.sends = []; f.reads = []; });
};

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

      // S) 손그림 → 새 엔진 + 짧은 명세
      await page.locator(`${PANEL} [data-ai-source-file]`).setInputFiles(PNG);
      await page.waitForFunction(p => document.querySelector(p).querySelector('[data-ai-reference-count]').textContent === '1', PANEL);
      await draw(page, '손그림처럼 수평 막대 위 O점 받침과 추 A를 그려 줘');
      await idle(page); await page.waitForTimeout(500);
      const f = await page.evaluate(() => ({ sends: window.__engineFake.sends, reads: window.__engineFake.reads }));
      assert.equal(f.sends.length, 1, `${name}: one picture turn (${f.sends.length})`);
      assert.equal(f.sends[0].ephemeral, true, `${name}: sketch goes to the new engine`);
      assert.equal(f.reads.filter(t => /짧은 명세만 쓴다/.test(t)).length, 1, `${name}: one short sketch-spec read`);
      assert.equal(f.reads.filter(t => /그림 담당/.test(t)).length, 0, `${name}: no expand with a sketch`);
      assert.match(f.sends[0].text, /\[밑그림 명세 — 교사 손그림을 읽어 정리한 것\]\n- 막대: 1개, 가운데 수평/);
      assert.equal(f.sends[0].atts.length, 1, `${name}: sketch only, no 기출 (${f.sends[0].atts.length})`);
      assert.match(await page.locator(`${PANEL} .ai-msg.result .ai-chat-result`).last().textContent(), /생성 결과 1/);
      await shot(page, `${name}-s-sketch.png`);

      // R) 레퍼런스(손그림 말 없음) → 옛 길
      await newTab(page, 2);
      await page.locator(`${PANEL} [data-ai-source-file]`).setInputFiles(PNG);
      await page.waitForFunction(p => document.querySelector(p).querySelector('[data-ai-reference-count]').textContent === '1', PANEL);
      await draw(page, '이 그림처럼 수평 막대와 추 A를 그려 줘');
      await idle(page); await page.waitForTimeout(500);
      const r = await page.evaluate(() => ({ sends: window.__engineFake.sends, reads: window.__engineFake.reads }));
      assert.ok(r.sends.length >= 1, `${name}: a picture turn`);
      assert.match(r.sends[0].text, /이미지 하네스다/, `${name}: reference stays on the old exam-brief path`);
      assert.doesNotMatch(r.sends[0].text, /\[교사 그림\]|\[밑그림 명세/, `${name}: not the new engine prompt`);
      assert.equal(r.reads.filter(t => /짧은 명세만 쓴다|그림 담당/.test(t)).length, 0, `${name}: no engine text calls for a reference`);
      await shot(page, `${name}-r-reference.png`);

      // M) 세 장면 → 한 장 그림 한 번 → canvas로 자르고 2배
      await newTab(page, 3);
      await page.evaluate(() => { window.__engineFake.scenes = ['장면 1: 부피 V', '장면 2: 부피 2V', '장면 3: 부피 3V']; });
      await draw(page, '실린더 기체 부피 V, 2V, 3V 세 장면을 그려 줘');
      await idle(page); await page.waitForTimeout(800);
      const m = await page.evaluate(() => ({ sends: window.__engineFake.sends, reads: window.__engineFake.reads }));
      assert.equal(m.sends.length, 1, `${name}: one combined picture for three scenes (${m.sends.length})`);
      assert.match(m.sends[0].text, /한 장의 가로로 긴 그림에 다음 3개 그림을/);
      const cards = await page.locator(`${PANEL} .ai-chat-result-meta > b`).allTextContents();
      assert.equal(cards.length, 3, `${name}: three results (${cards})`);
      const widths = await page.evaluate(p => Promise.all([...document.querySelectorAll(`${p} .ai-msg.result:last-of-type img, ${p} .ai-chat-result img`)].map(async img => { if (!img.complete) await img.decode().catch(() => {}); return img.naturalWidth; })), PANEL);
      const cell = 180; // 가짜 그림의 칸 폭 — 자른 칸(여백 포함)을 2배로 키우면 360px를 넘는다
      assert.ok(widths.filter(w => w > 2 * cell).length >= 3, `${name}: three upscaled panels (${widths})`);
      await shot(page, `${name}-m-multi.png`);
      await closeAiPanel(page);
      assert.deepEqual(errors, [], `${name}: no page errors`);
      console.log(`${name}: candidate sketch/reference/multi ok`);
    } finally { await browser.close(); }
  }
});
