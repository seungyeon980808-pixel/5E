const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { startVisitorStatsServer } = require('../scripts/visitor-stats-server.cjs');
const source = fs.readFileSync(path.resolve(__dirname, '../js/visitor-stats.js'), 'utf8');
const date = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const evidence = path.resolve('.omo/evidence/feedback-visitor-ui');
(async () => {
  for (const [engine, type] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), '5e-stats-ui-'));
    const service = await startVisitorStatsServer({ dataDir, port: 0 });
    const browser = await type.launch(); let offline = false, posts = 0;
    try {
      const routeContext = async context => {
        fs.mkdirSync(evidence, { recursive: true });
        await context.tracing.start({ screenshots: true, snapshots: true });
        // Test-only production origin: all traffic is intercepted locally.
        await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
        await context.route('**/*', async route => {
          const url = new URL(route.request().url());
          if (url.pathname === '/api/visitor-stats') {
            const request = route.request(); if (request.method() === 'POST') posts++;
            if (offline) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
            const response = await fetch(service.origin + '/api/visitor-stats', { method: request.method(), headers: { Origin: 'https://www.5e.ai.kr', 'User-Agent': 'Mozilla/5.0 Safari/605.1.15', ...(request.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: request.postData() || undefined });
            return route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
          }
          if (url.pathname === '/visitor-stats.js') return route.fulfill({ contentType: 'text/javascript', body: source });
          return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="UTF-8"><span data-visitor-stats>누적 — · 오늘 —</span><input aria-label="편집"><script type="module">import {initVisitorStats} from "/visitor-stats.js"; initVisitorStats();</script>' });
        });
      };
      const context = await browser.newContext({ userAgent: 'Mozilla/5.0 Safari/605.1.15' }); await routeContext(context); const page = await context.newPage();
      await page.goto('https://www.5e.ai.kr/'); await page.getByText('누적 1 · 오늘 1', { exact: true }).waitFor();
      const id = await page.evaluate(() => localStorage.getItem('5e.visitor.v1')); assert.ok(id);
      assert.match(await page.locator('[data-visitor-stats]').getAttribute('title'), new RegExp(date()));
      await page.reload(); await page.getByText('누적 1 · 오늘 1', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('5e.visitor.v1')), id, 'reload retains anonymous browser identity');
      const second = await browser.newContext({ userAgent: 'Mozilla/5.0 Safari/605.1.15' }); await routeContext(second); const another = await second.newPage();
      await another.goto('https://www.5e.ai.kr/'); await another.getByText('누적 2 · 오늘 2', { exact: true }).waitFor();
      offline = true; await page.reload();
      await page.waitForFunction(() => document.querySelector('[data-visitor-stats]').title.includes('연결하지 못했습니다'));
      assert.equal(await page.locator('[data-visitor-stats]').textContent(), '누적 — · 오늘 —', 'failure never shows invented zero or success counts');
      await page.getByRole('textbox', { name: '편집' }).fill('서버가 없어도 입력 가능');
      assert.equal(await page.getByRole('textbox').inputValue(), '서버가 없어도 입력 가능');
      const recorded = posts;
      await page.goto('http://127.0.0.1/');
      await page.waitForFunction(() => document.querySelector('[data-visitor-stats]').title.includes('로컬 미리보기'));
      assert.equal(posts, recorded, 'local preview sends no counting request');
      await page.screenshot({ path: path.join(evidence, engine + '-local-excluded.png') });
      fs.writeFileSync(path.join(evidence, engine + '-result.json'), JSON.stringify({ productionCount: service.store.stats(), recordedRequests: recorded, localRequests: posts - recorded, offlineInputUsable: true }, null, 2));
      await context.tracing.stop({ path: path.join(evidence, engine + '-trace.zip') });
      await second.tracing.stop();
      console.log(engine + ': real server counts, stable browser identity, network failure and local exclusion passed');
      await context.close(); await second.close();
    } finally { await browser.close(); await service.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
