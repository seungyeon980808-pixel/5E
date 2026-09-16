import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';
const root = new URL('../', import.meta.url).pathname;
const output = join(root, '.omo/evidence/crop-transfer-loading');
await mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
  const path = normalize(join(root, new URL(request.url, 'http://localhost').pathname));
  if (!path.startsWith(root)) { response.writeHead(403).end(); return; }
  try {
    let body = await readFile(path);
    if (path.endsWith('unified-library-ui-qa.html')) body = body.toString()
      .replace('const matches = [', `all[2].provenance.pageNumber = 2; all[4].provenance.documentId = 'second.pdf'; const matches = [`)
      .replace('const representation = options.representation || "full";', `if (result.id.includes(':manual:')) throw new Error('PDF result provenance is unavailable'); if (options.original && window.qaFailOriginal) { window.qaFailOriginal = false; throw new Error('QA original failed'); } const representation = options.representation || "full";`);
    response.setHeader('content-type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(path)] || 'application/octet-stream');
    response.end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/unified-library-ui-qa.html`);
  await page.waitForSelector('[data-result-id="q1"]');
  for (const id of ['q1', 'q3', 'q5']) {
    await page.locator(`[data-result-id="${id}"]`).click();
    if (id === 'q1') await page.evaluate(() => { window.qaOriginalGate = Promise.withResolvers(); });
    await page.locator('[data-unilib-adjust]').click();
    await page.waitForSelector('[data-unilib-crop]:not([hidden])');
    if (id === 'q1') {
      await page.waitForFunction(() => window.qaOriginalStarted);
      assert.equal(await page.locator('[data-unilib-crop-stage]').getAttribute('aria-busy'), 'true');
      assert.equal(await page.locator('[data-unilib-crop-image]').isVisible(), false);
      assert.equal(await page.locator('[data-unilib-crop-ai]').isEnabled(), false);
      assert.equal(await page.locator('[data-unilib-crop-load-message]').textContent(), 'PDF 페이지를 불러오는 중입니다…');
      assert.equal(await page.locator('.unilib-crop-collection-item.is-pending').count(), 0);
      await page.screenshot({ path: join(output, 'loading.png') });
      await page.evaluate(() => window.qaOriginalGate.resolve());
    }
    await page.waitForFunction(() => document.querySelector('[data-unilib-crop-stage]').getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('[data-unilib-crop-load-state]').isVisible(), false);
    await page.waitForFunction(() => !document.querySelector('[data-unilib-crop-save]').disabled);
    await page.locator('[data-unilib-crop-save]').click();
    await page.locator('[data-unilib-crop-cancel]').click();
  }
  assert.equal(await page.locator('[data-unilib-selected-remove]').count(), 3);
  await page.locator('[data-result-id="q1"]').click();
  await page.evaluate(() => { window.qaFailOriginal = true; });
  await page.locator('[data-unilib-adjust]').click();
  await page.waitForSelector('[data-unilib-crop-retry]:not([hidden])');
  assert.equal(await page.locator('[data-unilib-crop-image]').isVisible(), false);
  assert.equal(await page.locator('[data-unilib-crop-ai]').isEnabled(), false);
  assert.equal(await page.locator('.unilib-crop-collection-item.is-pending').count(), 0);
  assert.equal(await page.locator('[data-unilib-crop-remove]').count(), 1);
  await page.screenshot({ path: join(output, 'error.png') });
  await page.locator('[data-unilib-crop-retry]').click();
  await page.waitForFunction(() => document.querySelector('[data-unilib-crop-stage]').getAttribute('aria-busy') === 'false' && document.querySelector('[data-unilib-crop-load-state]').hidden);
  assert.equal(await page.locator('[data-unilib-crop-remove]').count(), 1);
  await page.screenshot({ path: join(output, 'restored.png') });
  await page.locator('[data-unilib-crop-cancel]').click();
  assert.equal(await page.locator('[data-unilib-adjust]').evaluate(button => button === document.activeElement), true, 'Retry then close restores focus to the original external crop trigger');
  await page.locator('[data-unilib-ai]').click();
  await page.getByRole('button', { name: '계속', exact: true }).click();
  await page.waitForFunction(() => window.qaAiCalls.length === 1);
  const references = await page.evaluate(() => window.qaAiCalls[0].references);
  assert.equal(references.length, 3);
  assert.deepEqual(references.map(reference => [reference.source.documentId, reference.source.pageNumber]), [['qa.pdf', 1], ['qa.pdf', 2], ['second.pdf', 1]]);
  assert.ok(references.every(reference => reference.dataUrl.startsWith('data:image/png;')));
  console.log('PASS: central loading, error/retry, reopened accepted crop, and actual general AI handoff of three crops from two files/three pages');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
