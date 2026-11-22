'use strict';
// LEADERFIX(11-22) 생성 그림 「확정하고 라벨 살리기」 자리 맞춤을 실제 화면 흐름(가짜 설치판 연결, 실제 AI 안 부름)으로 돈다.
// 사용자 지적(뇌 단면 그림): 살린 라벨 글자가 지시선 시작점 아래에 붙고, 지시선 끝과 글자가 떨어졌다.
// 그림: 뇌 단면 비슷한 선 그림 + 한글 라벨 4개와 곧은 지시선(소뇌·시상 지시선은 빗금·윤곽을 많이 지나 맥 안에서 못 지움 → 다시 그리기).
// 가짜 글자 읽기는 실제 읽기처럼 상자를 반 글자쯤 비켜, 지시선 끝도 몇 점 비켜 준다. 가짜 다시 그리기는 글자·지시선 없는 그림을 (2,1)점 밀어 준다.
//  1) 라벨 글자 가운데는 실제 글자 잉크 가운데에서 3점 안
//  2) 지시선 가리키는 끝은 실제 끝에서 4점 안(읽은 끝점이 아니라 픽셀에서 찾은 선)
//  3) 5E 지시선의 글자 쪽 끝이 실제 글자 상자 가장자리(그리는 쪽의 글자 틀·틈 포함 글자 높이의 0.6배 안)에서 멈추고 글자를 관통하지 않는다 — 선과 글자가 만난다
//  4) 다시 그린 그림의 밀림을 재어 맞춘다(그림 선이 원본 자리)
// LABEL_SNAP_RECORD=1이면 검사하지 않고 잰 값·그림만 남긴다(고치기 전 HEAD 비교용).
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
const RECORD = process.env.LABEL_SNAP_RECORD === '1';
const REQ = '뇌 단면 모식도에 시상, 시상하부, 소뇌, 뇌줄기를 지시선 라벨로 흑백으로 그려 줘';

async function fakeDesktop(context) {
  await context.addInitScript(() => {
    for (const p of ['', '5e.preview:']) { localStorage.setItem(p + '5e.tutorial.bannerSeen', 'true'); localStorage.setItem(p + '5e.mode', 'pro'); }
    const listeners = new Set();
    const W = 1000, H = 700;
    // [글자, 글자 왼쪽 x, 글자 가운데 y, 지시선이 나가는 쪽(글자 왼쪽 L·오른쪽 R), 가리키는 끝]
    const LABELS = [
      ['시상', 800, 150, 'L', [500, 300]],
      ['시상하부', 40, 560, 'R', [425, 405]],
      ['소뇌', 880, 470, 'L', [705, 470]],
      ['뇌줄기', 660, 655, 'L', [592, 610]],
    ];
    const FONT = '30px "Apple SD Gothic Neo", "Noto Sans CJK KR", sans-serif';
    const draw = ({ text = true, dx = 0, dy = 0 } = {}) => {
      const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
      g.save(); g.translate(dx, dy);
      g.strokeStyle = '#111'; g.lineWidth = 4;
      g.beginPath(); g.ellipse(470, 320, 300, 200, 0, 0, Math.PI * 2); g.stroke();            // 대뇌 윤곽
      g.fillStyle = '#c8c8c8'; g.beginPath(); g.ellipse(490, 305, 62, 40, 0, 0, Math.PI * 2); g.fill(); g.stroke(); // 시상
      g.beginPath(); g.ellipse(430, 405, 32, 20, 0, 0, Math.PI * 2); g.stroke();             // 시상하부
      g.beginPath(); g.ellipse(700, 470, 95, 62, 0, 0, Math.PI * 2); g.stroke();             // 소뇌
      g.lineWidth = 2; g.save(); g.beginPath(); g.ellipse(700, 470, 93, 60, 0, 0, Math.PI * 2); g.clip();
      for (let x = 600; x <= 800; x += 9) { g.beginPath(); g.moveTo(x, 400); g.lineTo(x, 540); g.stroke(); } // 소뇌 결(세로 줄)
      g.restore();
      g.lineWidth = 4; g.strokeRect(560, 500, 48, 170);                                         // 뇌줄기
      g.lineWidth = 2; for (let y = 230; y <= 380; y += 10) { g.beginPath(); g.moveTo(560, y); g.lineTo(700, y); g.stroke(); } // 시상 오른쪽 줄무늬
      g.restore();
      const truth = [];
      if (text) {
        g.fillStyle = '#000'; g.strokeStyle = '#000'; g.lineWidth = 2.5; g.font = FONT; g.textBaseline = 'middle';
        for (const [t, x, y, side, b] of LABELS) {
          const m = g.measureText(t);
          g.fillText(t, x, y);
          const box = { x0: x - m.actualBoundingBoxLeft, y0: y - m.actualBoundingBoxAscent, x1: x + m.actualBoundingBoxRight, y1: y + m.actualBoundingBoxDescent };
          const a = [side === 'L' ? box.x0 - 6 : box.x1 + 6, (box.y0 + box.y1) / 2];
          truth.push({ text: t, box, start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] } });
          g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
        }
      }
      return { data: c.toDataURL('image/png'), truth };
    };
    // 실제 읽기처럼 비켜 준 자리: 상자는 오른쪽으로 0.3글자, 아래로 0.5글자; 지시선 끝도 몇 점씩 비켜.
    const readBoxes = truth => truth.map(({ text, box, start, end }) => {
      const bh = box.y1 - box.y0, bw = box.x1 - box.x0;
      return { text, kind: 'ko', x: (box.x0 + bh * 0.3) / W, y: (box.y0 + bh * 0.5) / H, w: bw / W, h: bh / H,
        leader: { x1: (start.x + 6) / W, y1: (start.y + 11) / H, x2: (end.x + 9) / W, y2: (end.y - 7) / H } };
    });
    const first = draw();
    const fake = window.__labelSnapFake = { sends: [], reads: [], n: 0, imgIdx: 0, truth: first.truth, W, H, original: first.data, redraw: null };
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
        fake.reads.push(text.slice(0, 60));
        if (/글자 묶음/.test(text)) return { text: JSON.stringify(readBoxes(fake.truth)) };
        return { text: JSON.stringify({ type: '생명', scenes: ['뇌 단면 모식도'], keyValues: '', subject: '생명과학Ⅰ', types: ['생명'], keywords: ['뇌'], has: false, texts: [] }) };
      },
      send: async payload => {
        const turnId = `fake-${++fake.n}`;
        fake.sends.push({ purpose: payload.purpose || null, text: String(payload.text || '').slice(0, 40) });
        if (payload.purpose === 'image') (async () => {
          const img = fake.imgIdx++ === 0 ? first.data : (fake.redraw = draw({ text: false, dx: 2, dy: 1 }).data);
          emit({ clientScope: payload.clientScope, method: 'item/completed', params: { turnId, item: { type: 'imageGeneration', status: 'completed', imageDataUrl: img } } });
          emit({ clientScope: payload.clientScope, method: 'turn/completed', params: { turn: { id: turnId, status: 'completed' } } });
        })();
        return { turnId, threadId: 'thread-' + turnId, renderThreadId: turnId };
      },
    };
  });
}

const idle = page => page.waitForFunction(p => document.querySelector(p)?.dataset.aiBusy !== 'true', PANEL, { timeout: 90000 });
const send = async (page, text) => { await page.locator(`${PANEL} [data-ai-chat-input]`).fill(text); await page.locator(`${PANEL} [data-ai-send]`).click(); };

// 캔버스에 넣은 라벨 객체를 원래 그림 픽셀 좌표로 바꿔 잰다.
const measure = page => page.evaluate(async () => {
  const { state } = await import('/js/state.js?v=1.7.0-four-session-integration');
  const fake = window.__labelSnapFake, objects = state.get().objects;
  const image = objects.filter(o => o.type === 'image').at(-1);
  const px = p => ({ x: (p.x - image.x) / image.w * fake.W, y: (p.y - image.y) / image.h * fake.H });
  const { deriveLabelLeaderGeometry } = await import('/js/label-leader-geometry.js?v=1.7.0-four-session-integration');
  // 5E 지시선이 그려지는 끝(글자 쪽): 그리는 쪽(renderLabeler)과 같은 셈 — 가리키는 끝에서 글자 가운데로, 글자 상자(+틈) 가장자리에서 멈춤.
  const lineEnd = o => {
    const geo = deriveLabelLeaderGeometry(o), gap = Number.isFinite(o.labelGap) && o.labelGap >= 0 ? o.labelGap : geo.size * 0.15;
    const hw = geo.label.bounds.w / 2 + gap, hh = geo.label.bounds.h / 2 + gap, dx = o.p2.x - o.p1.x, dy = o.p2.y - o.p1.y, d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d, lead = d - Math.min(Math.abs(ux) > 1e-6 ? hw / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? hh / Math.abs(uy) : Infinity);
    return px({ x: o.p1.x + ux * lead, y: o.p1.y + uy * lead });
  };
  const labels = objects.filter(o => o.aiParentImageId === image.id && o.aiAutoLabel).map(o => o.type === 'labeler'
    ? { text: o.text, leader: true, center: px(o.p2), anchor: px(o.p1), end: lineEnd(o) }
    : { text: o.text, leader: false, center: px({ x: o.x + (o.w || 0) / 2, y: o.y + (o.h || 0) / 2 }) });
  return fake.truth.map(t => {
    const l = labels.find(x => x.text === t.text);
    const gc = { x: (t.box.x0 + t.box.x1) / 2, y: (t.box.y0 + t.box.y1) / 2 };
    if (!l) return { text: t.text, missing: true };
    const b = t.box, boxGap = p => Math.hypot(Math.max(b.x0 - p.x, 0, p.x - b.x1), Math.max(b.y0 - p.y, 0, p.y - b.y1));
    // 5E 지시선이 실제 글자 획 상자를 지나가는지(1점 안쪽으로 줄인 상자).
    let crosses = false;
    if (l.end) for (let s = 0; s <= 1; s += 0.01) { const x = l.anchor.x + (l.end.x - l.anchor.x) * s, y = l.anchor.y + (l.end.y - l.anchor.y) * s; if (x > b.x0 + 1 && x < b.x1 - 1 && y > b.y0 + 1 && y < b.y1 - 1) { crosses = true; break; } }
    return { text: t.text, leader: l.leader, centerError: Math.hypot(l.center.x - gc.x, l.center.y - gc.y),
      anchorError: l.anchor ? Math.hypot(l.anchor.x - t.end.x, l.anchor.y - t.end.y) : null,
      endGap: l.end ? boxGap(l.end) : null, glyphH: b.y1 - b.y0, crosses, startMiss: l.end ? Math.hypot(l.end.x - t.start.x, l.end.y - t.start.y) : null,
      center: l.center, anchor: l.anchor || null, end: l.end || null };
  });
});

// 겹쳐 보기: 원본 그림 위에 정답(초록: 글자 상자·지시선)과 살린 라벨(빨강: 글자 가운데 + 5E 지시선)을 그린다.
const overlay = (page, rows, title) => page.evaluate(async ({ rows, title }) => {
  const fake = window.__labelSnapFake;
  const img = new Image(); img.src = fake.original; await img.decode();
  const c = document.createElement('canvas'); c.width = fake.W; c.height = fake.H + 40; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.globalAlpha = 0.45; g.drawImage(img, 0, 40); g.globalAlpha = 1;
  g.translate(0, 40);
  for (const t of fake.truth) {
    g.strokeStyle = '#0a0'; g.lineWidth = 2; g.strokeRect(t.box.x0, t.box.y0, t.box.x1 - t.box.x0, t.box.y1 - t.box.y0);
    g.beginPath(); g.moveTo(t.start.x, t.start.y); g.lineTo(t.end.x, t.end.y); g.stroke();
  }
  for (const r of rows) {
    if (r.missing) continue;
    g.strokeStyle = '#e00'; g.fillStyle = '#e00'; g.lineWidth = 2;
    g.beginPath(); g.arc(r.center.x, r.center.y, 5, 0, Math.PI * 2); g.fill();
    if (r.anchor) { g.beginPath(); g.moveTo(r.anchor.x, r.anchor.y); g.lineTo(r.end.x, r.end.y); g.stroke(); g.beginPath(); g.arc(r.anchor.x, r.anchor.y, 4, 0, Math.PI * 2); g.stroke(); }
    g.font = '15px sans-serif'; g.fillStyle = '#c00';
    g.fillText(`${r.text}: 글자 ${r.centerError.toFixed(1)}px${r.anchor ? ` · 끝 ${r.anchorError.toFixed(1)}px · 선-글자 틈 ${r.endGap.toFixed(1)}px${r.crosses ? ' · 글자 관통' : ''}` : ' · 지시선 없음'}`, Math.max(4, Math.min(r.center.x - 60, fake.W - 380)), r.center.y + 34);
  }
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#000'; g.font = 'bold 20px sans-serif'; g.fillText(title + '  (초록=원래 글자·지시선, 빨강=살린 라벨 가운데·5E 지시선)', 12, 27);
  return c.toDataURL('image/png');
}, { rows, title });
const savePng = (name, dataUrl) => { if (out) fs.writeFileSync(path.join(out, name), Buffer.from(dataUrl.split(',')[1], 'base64')); };

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
      await openAiWorkflow(page, 'image-create');
      await page.waitForFunction(p => document.querySelector(p).dataset.aiCreateUi === 'true', PANEL);
      await send(page, REQ);
      await page.waitForFunction(p => document.querySelector(p).querySelector('.ai-chat-result.is-viewing [data-ai-chip="label-restore"]'), PANEL, { timeout: 60000 });
      await idle(page);
      await page.locator(`${PANEL} .ai-chat-result.is-viewing [data-ai-chip="label-restore"]`).click();
      await page.waitForFunction(p => document.querySelector(p).dataset.aiBusy === 'true', PANEL, { timeout: 20000 }).catch(() => {});
      await idle(page); await page.waitForTimeout(800);
      const fake = await page.evaluate(() => ({ sends: window.__labelSnapFake.sends, redraw: Boolean(window.__labelSnapFake.redraw) }));
      const statusText = await page.locator(`${PANEL} [data-ai-log]`).textContent();
      if (out) await page.locator(`${PANEL} .ai-preview-stage >> visible=true`).first().screenshot({ path: path.join(out, `${name}-preview.png`) }).catch(error => console.log('preview shot', String(error).slice(0, 120)));
      const before = (await page.evaluate(async () => (await import('/js/state.js?v=1.7.0-four-session-integration')).state.get().objects.length));
      await page.locator(`${PANEL} [data-ai-insert-selected]`).click();
      await page.waitForFunction(async n => (await import('/js/state.js?v=1.7.0-four-session-integration')).state.get().objects.length > n, before, { timeout: 20000 });
      await page.waitForTimeout(500);
      const rows = await measure(page);
      savePng(`${name}-overlay.png`, await overlay(page, rows, RECORD ? '고치기 전(HEAD)' : '고친 뒤'));
      if (out) fs.writeFileSync(path.join(out, `${name}-measure.json`), JSON.stringify({ rows, redraw: fake.redraw, sends: fake.sends }, null, 2));
      console.log(`${name}:`, rows.map(r => r.missing ? `${r.text} 없음` : `${r.text} 가운데 ${r.centerError.toFixed(1)} 끝 ${r.anchorError?.toFixed(1) ?? '-'} 시작점 ${r.startMiss?.toFixed(1) ?? '-'}`).join(' | '));
      if (!RECORD) {
        assert.ok(fake.redraw, `${name}: 지시선 일부를 못 지워 다시 그리기를 불렀다 ${JSON.stringify(fake.sends)}`);
        assert.doesNotMatch(statusText, /어긋나 맥 안에서/, `${name}: (2,1)점 밀린 다시 그리기는 맞춰 쓴다`);
        for (const r of rows) {
          assert.ok(!r.missing, `${name}: ${r.text} 라벨`);
          assert.ok(r.centerError <= 3, `${name}: ${r.text} 글자 가운데가 실제 글자에서 ${r.centerError.toFixed(1)}px`);
          assert.ok(r.leader, `${name}: ${r.text} 지시선 라벨(다시 그린 그림에는 지시선이 없다)`);
          assert.ok(r.anchorError <= 4, `${name}: ${r.text} 가리키는 끝 ${r.anchorError.toFixed(1)}px`);
          assert.ok(r.endGap <= r.glyphH * 0.6 && !r.crosses, `${name}: ${r.text} 5E 지시선 글자 쪽 끝이 실제 글자 상자와 ${r.endGap.toFixed(1)}px(관통 ${r.crosses})`);
        }
        // 다시 그린 그림을 원본 자리로 옮겨 맞췄는지: 결과 그림의 소뇌 윤곽 왼쪽 끝(605,470)이 원본 자리에 있다.
        const aligned = await page.evaluate(async () => {
          const { state } = await import('/js/state.js?v=1.7.0-four-session-integration');
          const image = state.get().objects.filter(o => o.type === 'image').at(-1);
          const src = image.src || image.data || image.dataUrl || image.href;
          const img = new Image(); img.src = src; await img.decode();
          const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
          const lum = (x, y) => { const d = g.getImageData(x, y, 1, 1).data; return d[0] * .299 + d[1] * .587 + d[2] * .114; };
          // 대뇌 윤곽 아래쪽 가운데(470,520)를 세로로 지나 처음 진한 점 — 원본은 518쯤.
          let first = -1; for (let y = 505; y <= 535; y++) if (lum(470, y) < 128) { first = y; break; }
          return { w: img.naturalWidth, first };
        }).catch(error => ({ error: String(error) }));
        const original = await page.evaluate(async () => { const img = new Image(); img.src = window.__labelSnapFake.original; await img.decode();
          const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
          for (let y = 505; y <= 535; y++) { const d = g.getImageData(470, y, 1, 1).data; if (d[0] * .299 + d[1] * .587 + d[2] * .114 < 128) return y; } return -1; });
        assert.ok(aligned.first > 0 && Math.abs(aligned.first - original) <= 0, `${name}: 다시 그린 그림이 원본 자리로 옮겨짐(윤곽 ${aligned.first} / 원본 ${original}) ${aligned.error || ''}`);
        assert.deepEqual(errors, [], `${name}: no page errors`);
      }
      await closeAiPanel(page);
      if (out) { await page.waitForTimeout(400); await page.screenshot({ path: path.join(out, `${name}-canvas.png`) }); }
      console.log(`${name}: generated label snap ok`);
    } finally { await browser.close(); }
  }
});
