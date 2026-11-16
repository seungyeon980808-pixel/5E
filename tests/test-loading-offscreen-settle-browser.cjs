'use strict';
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const h = require('./helpers/rhwp-exam.cjs');

h.withServer(async origin => {
  const rows = [];
  for (const [engine, type] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) {
    const browser = await type.launch();
    try {
      for (const mode of ['visible', 'offscreen', 'hidden-parent', 'hidden-document']) {
        const page = await browser.newPage();
        await page.route('**/offscreen-settle-fixture', route => route.fulfill({
          contentType: 'text/html', body: '<!doctype html><link rel="stylesheet" href="/css/loading/blur-reveal.css"><div id="host" style="position:fixed;top:0;left:0;width:300px;height:180px"><div id="frame" style="width:300px;height:180px"></div></div>',
        }));
        await page.goto(origin + '/offscreen-settle-fixture');
        const result = await page.evaluate(async mode => {
          const { BlurReveal } = await import('/js/loading/blur-reveal.js');
          const { trackLoadingMotion } = await import('/js/loading/activity-visibility.js');
          const host = document.querySelector('#host'), frame = document.querySelector('#frame');
          // The library tracks both the grid and each thumbnail. Completion
          // must survive either observer pausing offscreen loading motion.
          const releases = [trackLoadingMotion(host), trackLoadingMotion(frame)];
          const reveal = BlurReveal.attach(frame, { variant: 'fade', instantMs: 0 });
          const image = new Image(); image.src = '/tests/fixtures/rights-clear-smoke.png'; await image.decode();
          try {
            await reveal.start(image);
            const completion = reveal.complete(image);
            await Promise.resolve(); await Promise.resolve();
            if (mode === 'offscreen') host.style.top = '-10000px';
            if (mode === 'hidden-parent') host.hidden = true;
            if (mode === 'hidden-document') {
              Object.defineProperty(document, 'hidden', { configurable: true, value: true });
              document.dispatchEvent(new Event('visibilitychange'));
            }
            const settled = await Promise.race([
              completion.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 1500)),
            ]);
            return { mode, settled, state: reveal.state, busy: frame.getAttribute('aria-busy') };
          } finally {
            delete document.hidden; document.dispatchEvent(new Event('visibilitychange'));
            releases.forEach(release => release()); reveal.destroy(); host.remove();
          }
        }, mode);
        rows.push({ engine, ...result });
        console.log(JSON.stringify(rows.at(-1)));
        await page.close();
      }
    } finally { await browser.close(); }
  }
  for (const row of rows) {
    assert.equal(row.settled, true, JSON.stringify(row));
    assert.equal(row.state, 'done', JSON.stringify(row));
    assert.equal(row.busy, null, JSON.stringify(row));
  }
}).catch(error => { console.error(error); process.exitCode = 1; });
