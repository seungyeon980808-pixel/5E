const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { startServer, stopServer } = require('./run-browser-tests.cjs');

for (const engine of [chromium, webkit]) test(`library figure selection preserves the visible diagram in ${engine.name()}`, { timeout: 45000 }, async t => {
  const evidence = path.join(process.env.EVIDENCE_DIR || '_work/feedback/parts/button-design-correction', engine.name());
  fs.mkdirSync(evidence, { recursive: true });
  let server, origin = process.env.RELEASE_URL;
  if (!origin) { server = startServer(); origin = await server.ready; }
  const browser = await engine.launch({ headless: true });
  t.after(async () => { await browser.close(); if (server) await stopServer(server.child); });
  const page = await browser.newPage({ viewport: { width: 1512, height: 982 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/figure-appearance-fixture', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="dark"><head><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/unified-library.css"><link id="effect-css" rel="stylesheet" href="/css/button-design.css"></head><body></body></html>' }));
  await page.goto(origin + '/figure-appearance-fixture');
  await page.evaluate(async () => {
    const { initButtonDesign } = await import('/js/button-design.js');
    initButtonDesign();
    const { createUnifiedLibraryUi } = await import('/js/unified-library-ui.js');
    const source = { provider: 'pdf', documentId: 'appearance-fixture', pageNumber: 1, rect: [0, 0, 1, 1] };
    const question = {
      id: 'appearance-question', kind: 'crop', cropType: 'question', title: '그림 선택 확인', sourceId: 'fixture', provenance: source,
      variants: { full: { source }, figures: [
        { id: 'diagram-1', source: { ...source, rect: [.15, .22, .7, .3] } },
        { id: 'diagram-2', source: { ...source, rect: [.2, .65, .6, .15] } },
      ] },
    };
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="white"/><text x="30" y="90" font-size="26">4. Library figure selection</text><g fill="none" stroke="black" stroke-width="4"><path d="M110 240h380v110H110zM210 240v110m180-110v110"/><circle cx="300" cy="295" r="35"/><path d="M130 570h340m-340 45h340"/></g><text x="30" y="450" font-size="26">The diagram must stay visible.</text></svg>';
    const provider = { revision: 'figure-appearance', getSources: () => [], getExamFilterOptions: () => ({ academicYears: [] }), search: () => [question], listPdfFiles: () => [], materialize: async result => ({ dataUrl: 'data:image/svg+xml,' + encodeURIComponent(svg), provenance: result.provenance }) };
    window.appearanceFixture = createUnifiedLibraryUi({ getProvider: async () => provider, insertMaterialized: async () => {} });
    await window.appearanceFixture.open();
  });
  const ui = page.locator('.unified-library-overlay').last();
  await ui.locator('[data-result-id="appearance-question"]').click();
  const choices = ui.locator('.unilib-figure-choice');
  await choices.first().waitFor();
  await page.mouse.move(5, 5);
  const observe = () => choices.evaluateAll(els => els.map(el => {
    const style = getComputedStyle(el), canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    ctx.fillStyle = style.backgroundColor; ctx.fillRect(0, 0, 1, 1);
    return { selected: el.getAttribute('aria-pressed'), background: style.backgroundColor, alpha: ctx.getImageData(0, 0, 1, 1).data[3], border: style.borderTopColor, radius: style.borderRadius };
  }));
  const actual = await observe();
  await page.screenshot({ path: path.join(evidence, 'library-figure-overlay.png') });
  await page.locator('#effect-css').evaluate(el => { el.sheet.disabled = true; });
  const original = await observe();
  fs.writeFileSync(path.join(evidence, 'figure-appearance-receipt.json'), JSON.stringify({ engine: engine.name(), actual, original, errors, providerCalls: 0, realLibraryUi: true }, null, 2));
  assert.deepEqual(actual, original, 'Core-button effects must not repaint library figure selection controls');
  assert.ok(actual.every(x => x.alpha <= 62), JSON.stringify(actual));
  assert.deepEqual(errors, []);
});
