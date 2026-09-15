import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';
const root = new URL('../', import.meta.url).pathname;
const out = process.argv[2] || '.omo/evidence/space-selection-repair/green';
await mkdir(out, { recursive: true });
const server = createServer(async (req, res) => {
  try { const path = join(root, new URL(req.url, 'http://localhost').pathname); res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)] || 'application/octet-stream'); res.end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const report = [];
try {
  for (const index of [0, 14]) {
    await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/unified-library-ui-qa.html`);
    const card = page.locator('.unilib-result-card').nth(index);
    await card.click();
    await card.evaluate(node => { node.scrollIntoView({block:'center'}); node.focus({preventScroll:true}); });
    for (let tap = 0; tap < 4; tap++) {
      await card.evaluate(node => {
        window.spaceFrames = [];
        window.spaceMeasure = () => {
          const s = node.closest('.unilib-result-scroll');
          const tray = document.querySelector('[data-unilib-selected-tray]');
          return {top:node.getBoundingClientRect().top, scroll:s.scrollTop, scrollerTop:s.getBoundingClientRect().top, height:s.clientHeight, checked:node.parentElement.querySelector('input').checked, tray:tray.getBoundingClientRect().height};
        };
        window.spaceFrames.push(window.spaceMeasure());
        window.spaceSampling = true;
        const sample = () => { window.spaceFrames.push(window.spaceMeasure()); if(window.spaceSampling) requestAnimationFrame(sample); };
        requestAnimationFrame(sample);
      });
      await page.keyboard.press('Space');
      await page.waitForTimeout(180);
      const frames = await page.evaluate(() => { window.spaceSampling = false; return window.spaceFrames; });
      const delta = Math.max(...frames.map(f => Math.abs(f.top - frames[0].top)));
      report.push({index,tap,delta,frames});
      if (tap === 0) await page.screenshot({path:join(out,`card-${index}-selected.png`)});
    }
    await page.screenshot({path:join(out,`card-${index}.png`)});
  }
  await writeFile(join(out,'frames.json'), JSON.stringify(report,null,2));
  assert.ok(report.every(r=>r.delta < 1 && r.frames.every(f => f.scroll === r.frames[0].scroll && f.scrollerTop === r.frames[0].scrollerTop && f.height === r.frames[0].height)), JSON.stringify(report.map(({index,tap,delta})=>({index,tap,delta}))));
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
