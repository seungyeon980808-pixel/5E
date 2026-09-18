import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';
const root = new URL('../', import.meta.url).pathname;
const output = join(root, '.omo/evidence/crop-initial-draft-0918');
await mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
  const path = normalize(join(root, new URL(request.url, 'http://localhost').pathname));
  if (!path.startsWith(root)) { response.writeHead(403).end(); return; }
  try {
    let body = await readFile(path);
    if (path.endsWith('unified-library-ui-qa.html')) body = body.toString()
      .replace('listPdfFiles: () => [{ ...pdfFile, matches: [], firstMatchingPage: 1 }],', `listPdfFiles: () => [{ ...pdfFile, matches: [], firstMatchingPage: 1 }, { ...pdfFile, id: 'file:second', title: 'Second.pdf', documentId: 'second.pdf', provenance: { ...pdfFile.provenance, documentId: 'second.pdf', pageNumber: 3 }, matches: [], firstMatchingPage: 3, loadPreview: async (pageNumber, options) => { const asset = await pdfFile.loadPreview(pageNumber, options); return { ...asset, source: { ...asset.source, documentId: 'second.pdf' }, result: { ...asset.result, id: 'page:second:' + pageNumber, provenance: { ...asset.result.provenance, documentId: 'second.pdf' } } }; } }],`)
      .replace('const representation = options.representation || "full";', `if (result.id.includes(':manual:')) throw new Error('PDF result provenance is unavailable'); if (options.original && window.qaFailOriginal) { window.qaFailOriginal = false; throw new Error('QA original failed'); } const representation = options.representation || "full";`);
    response.setHeader('content-type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(path)] || 'application/octet-stream');
    response.end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/unified-library-ui-qa.html?independent=1`);
  await page.waitForSelector('[data-result-id="q1"]');
  await page.locator('[data-result-id="q1"]').click();
  await page.locator('[data-unilib-adjust]').click();
  await page.waitForFunction(() => !document.querySelector('[data-unilib-crop-save]').disabled);
  assert.equal(await page.locator('[data-unilib-crop-box]').isVisible(), true, 'Existing question crop remains editable');
  await page.locator('[data-unilib-crop-cancel]').click();
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  for (const id of ['file:qa', 'file:second']) {
    await page.locator(`[data-result-id="${id}"]`).click();
    await page.locator('[data-unilib-adjust]').click();
    await page.waitForFunction(() => document.querySelector('[data-unilib-crop-stage]').getAttribute('aria-busy') === 'false');
    await page.screenshot({ path: join(output, `${id.replace(':', '-')}-initial.png`) });
    assert.equal(await page.locator('[data-unilib-crop-box]').isVisible(), false, 'New PDF cropping must start without a full-page draft');
    assert.equal(await page.locator('.unilib-crop-collection-item.is-pending').count(), 0);
    assert.equal(await page.locator('[data-unilib-crop-ai]').isEnabled(), false);
    const box = await page.locator('[data-unilib-crop-canvas]').boundingBox();
    await page.mouse.move(box.x + box.width * .12, box.y + box.height * .16);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .36, box.y + box.height * .42, { steps: 4 });
    await page.mouse.up();
    await page.waitForFunction(() => !document.querySelector('[data-unilib-crop-save]').disabled);
    const rect = await page.locator('[data-unilib-crop-box]').evaluate(element => ['left', 'top', 'width', 'height'].map(key => parseFloat(element.style[key]) / 100));
    [.12, .16, .24, .26].forEach((expected, index) => assert.ok(Math.abs(rect[index] - expected) < .01, `New drag produces requested crop, not full-page move: ${rect}`));
    await page.locator('[data-unilib-crop-save]').click();
    await page.screenshot({ path: join(output, `${id.replace(':', '-')}-accepted.png`) });
    await page.locator('[data-unilib-crop-cancel]').click();
  }
  await page.locator('[data-unilib-ai]').click();
  await page.getByRole('button', { name: '계속', exact: true }).click();
  await page.waitForFunction(() => window.qaIndependentCalls.length === 1);
  const references = await page.evaluate(() => window.qaIndependentCalls[0].references);
  assert.equal(references.length, 2);
  assert.deepEqual(references.map(reference => [reference.source.documentId, reference.source.pageNumber]), [['qa.pdf', 1], ['second.pdf', 3]]);
  assert.ok(references.every(reference => reference.source.rect[2] < .25 && reference.source.rect[3] < .27 && reference.dataUrl.startsWith('data:image/png;')));
  console.log('PASS: existing question crop retained; fresh PDF starts empty; first drag creates exact crop; two PDF handoff preserves cropped pixels and source');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
