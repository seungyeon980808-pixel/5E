import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url).pathname;
const out = process.argv[2] || '.omo/evidence/library-location-add';
await mkdir(out, { recursive: true });
const server = createServer(async (request, response) => {
  try {
    const path = join(root, new URL(request.url, 'http://localhost').pathname);
    const contentType = ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(path)] || 'application/octet-stream';
    response.setHeader('Content-Type', contentType);
    response.end(await readFile(path));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const viewport of [{ width: 375, height: 800 }, { width: 768, height: 900 }, { width: 1280, height: 900 }]) {
    const page = await browser.newPage({ viewport });
    await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/unified-library-ui-qa.html`);
    await page.locator('.unilib').evaluate((root, mobile) => {
      root.classList.toggle('folders-open', mobile);
      root.classList.remove('preview-open');
      root.querySelector('.unilib-location-add').open = true;
    }, viewport.width <= 767);
    await page.waitForTimeout(200);
    const geometry = await page.locator('.unilib-folders').evaluate((pane) => {
      const title = pane.querySelector('.unilib-pane-head h3').getBoundingClientRect();
      const trigger = pane.querySelector('.unilib-location-add > summary').getBoundingClientRect();
      const menu = pane.querySelector('.unilib-location-add-menu').getBoundingClientRect();
      const bounds = pane.getBoundingClientRect();
      return {
        titleRight: title.right,
        triggerLeft: trigger.left,
        menuLeft: menu.left,
        menuRight: menu.right,
        paneLeft: bounds.left,
        paneRight: bounds.right,
      };
    });
    assert.ok(geometry.triggerLeft >= geometry.titleRight, `${viewport.width}: trigger overlaps title`);
    assert.ok(geometry.triggerLeft - geometry.titleRight <= 12, `${viewport.width}: trigger is detached from title`);
    assert.ok(geometry.menuLeft >= geometry.paneLeft, `${viewport.width}: menu clips at left edge`);
    assert.ok(geometry.menuRight <= geometry.paneRight, `${viewport.width}: menu clips at right edge`);
    await page.screenshot({ path: join(out, `location-add-${viewport.width}.png`) });
    results.push({ viewport, geometry });
    await page.close();
  }
  await writeFile(join(out, 'geometry.json'), JSON.stringify({ outcome: 'PASS', results }, null, 2));
  console.log(JSON.stringify({ outcome: 'PASS', out, widths: results.map(({ viewport }) => viewport.width) }));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
