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
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/unified-library-ui-qa.html`);
    await page.getByRole('button', { name: '문항', exact: true }).click();
    const first = page.locator('[data-result-id="q1"]');
    await first.click();
    await page.waitForSelector('.unilib-preview-image > img');
    assert.equal(await first.evaluate(node => getComputedStyle(node).borderColor), 'rgb(47, 129, 247)');
    assert.equal(await page.locator('[data-unilib-selected-tray]').evaluate(node => node.getBoundingClientRect().height), 0);
    await first.press('Space');
    assert.equal(await first.evaluate(node => node.parentElement.querySelector('input').checked), true);
    assert.equal(await first.evaluate(node => getComputedStyle(node).borderColor), 'rgb(47, 129, 247)');
    await page.locator('[data-result-id="q3"]').click();
    assert.equal(await first.getAttribute('aria-selected'), 'false');
    assert.equal(await first.evaluate(node => node.parentElement.querySelector('input').checked), true);
    await page.waitForFunction(() => document.querySelector('.unilib-stage img')?.alt.includes('3번'));
    await page.setViewportSize(viewport);
    const preview = await page.locator('.unilib-stage').evaluate(stage => {
      const image = stage.querySelector('img');
      const rect = image.getBoundingClientRect();
      const frame = image.parentElement.getBoundingClientRect();
      return { imageWidth: rect.width, frameWidth: frame.width, availableWidth: stage.clientWidth,
        ratio: rect.width / rect.height, naturalRatio: image.naturalWidth / image.naturalHeight };
    });
    assert.ok(Math.abs(preview.imageWidth - preview.availableWidth) <= 2, JSON.stringify(preview));
    assert.ok(Math.abs(preview.ratio - preview.naturalRatio) < .01);
    await page.screenshot({ path: join(out, `question-preview-${viewport.width}.png`) });
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
        triggerRight: trigger.right,
        triggerWidth: trigger.width,
        triggerHeight: trigger.height,
        menuLeft: menu.left,
        menuRight: menu.right,
        paneLeft: bounds.left,
        paneRight: bounds.right,
      };
    });
    assert.ok(geometry.triggerLeft >= geometry.titleRight, `${viewport.width}: trigger overlaps title`);
    assert.equal(geometry.triggerWidth, geometry.triggerHeight, "add control is square");
    assert.ok(geometry.paneRight - geometry.triggerRight <= (viewport.width <= 767 ? 80 : 24), "add control is right aligned");
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
