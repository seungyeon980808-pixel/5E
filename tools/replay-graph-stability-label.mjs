// Render the retained result with the repaired formatter; never call an AI.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium, webkit } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(import.meta.dirname, '..');
const base = path.join(root, 'outputs/graph-stability-20261007');
const id = 'stable_ms2_solubility_comparison';
const sourceDir = path.join(base, 'first-textbook-resume', id);
const out = path.join(base, 'render-fixed', id); fs.mkdirSync(out, { recursive: true });
const candidate = JSON.parse(fs.readFileSync(path.join(sourceDir, 'candidate.json')));
const original = JSON.stringify(candidate.graphResult);
const verification = JSON.parse(fs.readFileSync(path.join(sourceDir, 'verification.json')));
const rows = [];
for (const [name, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
    await page.addInitScript(() => { localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true'); localStorage.setItem('5e.tutorial.bannerSeen', 'true'); localStorage.setItem('5e.preview:5e.mode', 'pro'); });
    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:8797/preview/', { waitUntil: 'domcontentloaded' });
    await page.locator('#file-menu-btn').click();
    const chooser = page.waitForEvent('filechooser'); await page.locator('#project-open').click();
    await (await chooser).setFiles(path.join(sourceDir, 'editable-graph.5e')); await page.getByRole('button', { name: '열기', exact: true }).click();
    await page.waitForFunction(async () => (await import('./js/state.js?v=1.7.0-four-session-integration')).state.get().objects.some(o => o.type === 'funcgraph'));
    const snapshot = () => page.evaluate(async () => structuredClone((await import('./js/state.js?v=1.7.0-four-session-integration')).state.get().objects));
    const before = await snapshot(), plane = before.find(o => o.type === 'coordplane');
    assert(plane); assert(!before.some(o => o.type === 'image'));
    await page.evaluate(async id => (await import('./js/graph/graph-modal.js?v=1.7.0-four-session-integration')).openGraphModal(id), plane.id);
    await page.locator('#gm-confirm').click(); assert.deepEqual(await snapshot(), before);
    const rendered = await page.evaluate(async result => {
      const { workbenchGraphDataUrl } = await import('./js/graph/workbench-result.js?v=1.7.0-four-session-integration');
      const data = await workbenchGraphDataUrl(result);
      const decoded = new TextDecoder().decode(Uint8Array.from(atob(data.split(',')[1]), c => c.charCodeAt(0)));
      const svg = new DOMParser().parseFromString(decoded, 'image/svg+xml');
      const glyphs = [...svg.querySelectorAll('text')].map(t => t.textContent).join('');
      const image = new Image(); image.src = data; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return { data, png: canvas.toDataURL('image/png'), glyphs, resultAfter: JSON.stringify(result) };
    }, candidate.graphResult);
    assert.equal(rendered.resultAfter, original, 'Formatter must not alter the retained plan or editable objects');
    assert(!/left|right|frac|text|\\/.test(rendered.glyphs));
    assert(rendered.glyphs.includes('물')); assert(rendered.glyphs.includes('100'));
    if (name === 'chromium') {
      fs.writeFileSync(path.join(out, 'native.svg'), Buffer.from(rendered.data.split(',')[1], 'base64'));
      fs.writeFileSync(path.join(out, 'native.png'), Buffer.from(rendered.png.split(',')[1], 'base64'));
    }
    rows.push({ browser: name, pass: true, aiCalls: 0, originalProjectOpened: true, editableNoOpExact: true, planAndObjectsUnchanged: true, unitCommandsNotPrinted: true });
  } finally { await browser.close(); }
}
for (const file of ['source.png', 'plan.json', 'candidate.json', 'editable-graph.5e']) fs.copyFileSync(path.join(sourceDir, file), path.join(out, file));
const record = { ...verification, requestCount: 0, error: undefined, renderingOnly: true, inheritedRequestEvidence: '../first-textbook-resume',
  checks: [...verification.checks, 'retained actual .5e opened and no-op edited in Chromium and WebKit; LaTeX delimiter words removed'], replayChecks: rows };
fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify(record, null, 2));
fs.writeFileSync(path.join(base, 'render-fixed/results.json'), JSON.stringify({ schema: '5e.graph-render-replay/v1', actualModelCalls: 0, renderingOnly: true, planAndObjectsUnchanged: true, cases: [record] }, null, 2));
console.log(JSON.stringify({ pass: true, aiCalls: 0, rows }));
