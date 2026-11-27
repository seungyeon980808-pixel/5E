// 11-23 1.7.2 윈도우 확인: 시작 화면 큰 「5E」가 다 그려진 직후 옆으로 살짝 밀려났다.
// 원인: 그리기용 SVG 글자를 글자 묶음 상자(getBBox)로 맞췄는데, 기울임꼴의 상자 왼끝은 글자 시작점과 달라 SVG 글자가
// 실제 글자보다 약 2.8px 오른쪽에 그려졌다 → 1.8초에 실제 글자로 바뀌는 순간 왼쪽으로 튐(배율 125·150%면 4화소).
// 검사: 설치판 창 크기(960×560)·배율 100·125·150%에서
//  1) SVG 글자 칸마다 실제 글자 자리와 0.3px 안으로 겹친다.
//  2) 다 그린 SVG(A)와 실제 글자(B)를 같은 자리에서 찍어 견주면 가로·세로 어긋남이 0화소다.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { PNG } = require('pngjs');
const h = require('./helpers/rhwp-exam.cjs');
const evidence = process.env.EVIDENCE_DIR ? path.resolve(process.env.EVIDENCE_DIR) : null;
if (evidence) fs.mkdirSync(evidence, { recursive: true });

// 잉크(밝은 화소) 세로·가로 분포 → 가장 잘 겹치는 어긋남(0.1화소 단위)
const profile = buf => {
  const { width: w, height: h, data } = PNG.sync.read(buf), col = new Float64Array(w), row = new Float64Array(h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, v = Math.max(0, (data[i] + data[i + 1] + data[i + 2]) / 3 - 40); col[x] += v; row[y] += v; }
  return { col, row };
};
const shift = (a, b) => {
  let best = 0, score = -1;
  for (let d = -20; d <= 20; d += 0.1) {
    let v = 0;
    for (let x = 0; x < a.length; x++) { const xx = x + d, i = Math.floor(xx), f = xx - i; if (i >= 0 && i + 1 < b.length) v += a[x] * (b[i] * (1 - f) + b[i + 1] * f); }
    if (v > score) { score = v; best = d; }
  }
  return Math.round(best * 10) / 10;
};

test('시작 화면: 큰 5E가 그리기에서 실제 글자로 바뀔 때 움직이지 않는다', { timeout: 120000 }, async () => {
  await h.withServer(async origin => {
    const browser = await chromium.launch();
    try {
      for (const dsf of [1, 1.25, 1.5]) {
        const context = await browser.newContext({ viewport: { width: 960, height: 560 }, deviceScaleFactor: dsf });
        const page = await context.newPage(), errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('https://api.github.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"tag_name":"v0.0.0"}' }));
        await page.addInitScript(() => {
          // 1.8초 뒤 「실제 글자로 넘기기」를 붙잡아 두었다가 검사가 직접 넘긴다(그리기 끝 A / 넘긴 뒤 B를 같은 자리에서 찍으려고).
          const st = window.setTimeout; window.__held = [];
          window.setTimeout = (f, d, ...a) => { if (d === 1800) { window.__held.push(f); return 0; } return st(f, d, ...a); };
          window.fiveEDesktop = { startWindow: { expand: async () => true, shrink: async () => true } };
        });
        await h.navigate(page, `${origin}/?start=1&mode=pro&mobile=0`);
        await page.waitForSelector('#start-screen .ss-big .ss-draw text', { timeout: 30000 });
        const chars = await page.evaluate(() => {
          const big = document.querySelector('.ss-big'), text = big.querySelector('.ss-draw text'), node = big.firstChild, m = text.getScreenCTM();
          return [...node.textContent].map((_, i) => {
            const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 1);
            const real = r.getBoundingClientRect(), e = text.getExtentOfChar(i);
            return { dx: e.x * m.a + m.e - real.left, dy: e.y * m.d + m.f - real.top };
          });
        });
        for (const c of chars) assert.ok(Math.abs(c.dx) < 0.3 && Math.abs(c.dy) < 0.3, `배율 ${dsf}: SVG 글자 칸이 실제 글자 자리와 겹친다 ${JSON.stringify(chars)}`);
        await page.waitForTimeout(2200); // 획 1.5초 + 채우기(1.25~1.75초) 끝
        const clip = await page.evaluate(() => { const r = document.querySelector('.ss-big').getBoundingClientRect(); return { x: r.left - 20, y: r.top - 10, width: r.width + 40, height: r.height + 20 }; });
        const A = await page.screenshot({ clip });
        assert.equal(await page.evaluate(() => { window.__held.forEach(f => f()); return window.__held.length; }), 1, '넘기기 타이머 하나');
        await page.waitForFunction(() => !document.querySelector('.ss-big .ss-draw'), null, { timeout: 5000 });
        await page.waitForTimeout(100);
        const B = await page.screenshot({ clip });
        if (evidence) { fs.writeFileSync(path.join(evidence, `start-draw-${dsf}-A.png`), A); fs.writeFileSync(path.join(evidence, `start-draw-${dsf}-B.png`), B); }
        const a = profile(A), b = profile(B);
        assert.equal(shift(a.col, b.col), 0, `배율 ${dsf}: 가로로 밀리지 않는다`);
        assert.equal(shift(a.row, b.row), 0, `배율 ${dsf}: 세로로 밀리지 않는다`);
        assert.deepEqual(errors, []);
        await context.close();
      }
    } finally { await browser.close(); }
  });
});
