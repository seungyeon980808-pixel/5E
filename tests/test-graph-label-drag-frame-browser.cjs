// 11-20 GRAPHFIX: 그래프 편집기에서 라벨이 마우스를 그대로 따라오는지(축 이름·보조선이 닿는 눈금·바깥으로 끄는 글자),
// 그리고 편집기 점선 틀·PNG(=이미지 복사)·캔버스·한글 넣기가 같은 틀(그래프+모든 라벨+2mm)을 쓰는지 본다.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = process.env.EVIDENCE_DIR; if (out) fs.mkdirSync(out, { recursive: true });
const N = 40, pts = []; for (let i = 0; i <= N; i++) { const t = 3.5 * i / N; pts.push({ x: t, y: Math.cos(Math.PI * t / 2) }); }
const plan = { schema: '5e.graph-reconstruction/v1', source: { id: 'ht-cos', hash: 'synthetic-ht', width: 520, height: 360, plotBox: { x: 50, y: 30, w: 420, h: 270 } },
  axes: { x: { scale: 'linear', title: '시간(s)', unit: '', min: 0, max: 3.6, step: 1, titlePosition: { x: 0.5, y: -0.17 }, ticks: [{ value: 1, label: 't_0' }, { value: 2, label: '2t_0' }, { value: 3, label: '3t_0' }] },
    y: { scale: 'linear', title: 'h', unit: '', min: -1.2, max: 1.2, step: 1, ticks: [{ value: 1, label: 'h_0' }, { value: -1, label: '-h_0' }] } },
  series: [{ id: 's1', kind: 'points', axis: 'y', certainty: 'exact', coordinateSpace: 'data', points: pts, breaks: [], endpoints: [] }],
  annotations: [{ id: 'g1', kind: 'guide', text: '', x: 2, y: -1, axis: 'y', coordinateSpace: 'data', orientation: 'vertical', endStyle: 'none' },
    { id: 'lbl', kind: 'text', text: 'A', x: 0.6, y: 0.4, axis: 'y', coordinateSpace: 'data', orientation: 'horizontal' }], review: [] };
const v = '?v=1.7.0-four-session-integration';
(async () => {
  for (const name of ['chromium', 'webkit'].filter(k => !process.env.BROWSER_ENGINE || k === process.env.BROWSER_ENGINE)) {
    const browser = await playwright[name].launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => { localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true'); localStorage.setItem('5e.tutorial.bannerSeen', 'true'); });
      await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:62759/', { waitUntil: 'networkidle' });
      const open = async () => {
        await page.evaluate(async ({ plan, v }) => { const w = await import('/js/graph/workbench-result.js' + v); window.__w = w; window.__edited = null;
          window.__res = w.buildWorkbenchGraph(plan, plan.source); w.editWorkbenchGraph(window.__res, { onApply: e => { window.__edited = e; } }); }, { plan, v });
        await page.locator('#gm-preview > svg').waitFor(); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(300);
      };
      const center = sel => page.evaluate(sel => { const r = document.querySelector('#gm-preview > svg').querySelector(sel).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
      const viewBox = () => page.evaluate(() => document.querySelector('#gm-preview > svg').getAttribute('viewBox'));
      const drag = async (sel, dx, dy) => {
        const [sx, sy] = await center(sel); await page.mouse.move(sx, sy); await page.mouse.down();
        const view0 = await viewBox(); let worst = 0, views = new Set();
        for (let i = 1; i <= 16; i++) {
          const mx = sx + dx * i / 16, my = sy + dy * i / 16; await page.mouse.move(mx, my);
          const [cx, cy] = await center(sel); worst = Math.max(worst, Math.hypot(cx - mx, cy - my)); views.add(await viewBox());
        }
        await page.mouse.up(); await page.waitForTimeout(150);
        return { worst, frozen: views.size === 1 && views.has(view0) };
      };
      await open();
      // 보조선이 닿는 2t₀ 가운데는 라벨이 맨 위여야 한다.
      const top = await page.evaluate(() => { const el = document.querySelector('#gm-preview > svg [data-tick="x:1"]'), r = el.getBoundingClientRect(); return !!document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('[data-tick="x:1"]'); });
      assert.ok(top, `${name}: 2t0 label is above its guide hit stroke`);
      for (const [label, sel, dx, dy] of [['x axis name through tick band', '[data-axisname="x"]', -30, -70], ['y axis name across axis', '[data-axisname="y"]', 60, 30],
        ['2t0 tick with guide', '[data-tick="x:1"]', 60, 50], ['tick outside default frame', '[data-tick="y:0"]', -120, 0], ['text outside frame', '[data-graph-annotation="lbl"]:not([data-annotation-hit])', -220, 260]]) {
        const r = await drag(sel, dx, dy);
        assert.ok(r.worst < 2, `${name}: ${label} follows the pointer (worst ${r.worst.toFixed(2)} px)`);
        assert.ok(r.frozen, `${name}: ${label} keeps the preview viewBox while dragging`);
      }
      // 축 이름은 손으로 옮긴 표시를 남긴다(다시 열어도 숫자 비키기에서 빠진다).
      const frame = await page.evaluate(() => { const f = document.querySelector('#gm-preview > svg [data-export-frame]'); return f && ['x', 'y', 'width', 'height'].map(k => +f.getAttribute(k)); });
      assert.ok(frame && frame[2] > 0, `${name}: editor shows the export frame`);
      if (out) await page.screenshot({ path: path.join(out, `${name}-editor.png`), clip: await page.locator('#gm-preview').boundingBox() });
      await page.locator('#gm-confirm').click(); await page.waitForTimeout(300);
      const result = await page.evaluate(async ({ v, frame }) => {
        const e = window.__edited, plane = e.objects.find(o => o.type === 'coordplane');
        const raster = await window.__w.workbenchGraphRaster(e);
        const { state } = await import('/js/state.js' + v), se = await import('/js/svg-export.js' + v);
        state.update(s => { s.objects = []; s.groups = []; }); const ins = window.__w.insertWorkbenchGraph(state, e, {});
        const p = state.get().objects.find(o => o.id === ins.planeId), objs = state.get().objects.filter(o => o.id === ins.planeId || o.planeId === ins.planeId);
        const canvas = se.getContentBounds({ ...state.get(), objects: objs }, {}, 2);
        const rel = (b, o) => [b.x - o.x, b.y - o.y, b.w, b.h];
        return { manual: plane.labelXPos?.manual === true, editor: [frame[0] + plane.w / 2, frame[1] + plane.h / 2, frame[2], frame[3]], png: rel(raster.frame, plane), canvas: rel(canvas, p),
          sourceFrame: window.__w.workbenchGraphSourceFrame(raster.data), rasterSize: [raster.width, raster.height] };
      }, { v, frame });
      assert.ok(result.manual, `${name}: dragged axis name is saved as manually placed`);
      for (const [a, b] of [[result.editor, result.png], [result.png, result.canvas]]) a.forEach((value, i) => assert.ok(Math.abs(value - b[i]) < 0.05, `${name}: one output frame (${a} vs ${b})`));
      assert.ok(result.sourceFrame && result.sourceFrame.width === 520, `${name}: PNG carries its original-frame registration`);
      assert.ok(result.rasterSize[0] > 520 || result.rasterSize[1] > 360, `${name}: labels outside the original raster are kept`);
      assert.deepEqual(errors, []);
      console.log(`${name}: label drag ≤2px, frozen viewBox, one export frame ${result.png.map(n => n.toFixed(2)).join(', ')} mm`);
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
