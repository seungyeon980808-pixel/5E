const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const evidence = process.env.SEPARATION_EVIDENCE || path.join(root, '.omo/evidence/ai-latest-fixes-0928/separation-green');
fs.mkdirSync(evidence, { recursive: true });
const original = fs.readFileSync(path.join(root, 'tests/test-ai-workspace-lifecycle-browser.cjs'), 'utf8');
const start = original.indexOf('function seedRequestWorkspaces(');
const end = original.indexOf('\nfor (const count of [1, 10, 30])', start);
const harness = original.slice(start, end)
  .replace('draw.strokeRect(40, 50, 420, 280);', 'draw.strokeRect(40, 50, 100, 180); draw.strokeRect(220, 120, 60, 80); draw.strokeRect(360, 50, 100, 180);')
  .replace("separationMode: 'off',", "separationMode: 'auto', generationMode: 'separated',")
  .replace("kind: 'generated', name:", "kind: 'generated', generationMode: 'separated', name:")
  .replace('  await page.goto(', `  await page.route('**/preview/js/ai-separated-assets.js*', route => {
    const source = fs.readFileSync(path.join(root, 'preview/js/ai-separated-assets.js'), 'utf8');
    return route.fulfill({ contentType: 'text/javascript', body: source.replace('export async function prepareSeparatedAssets(', 'async function realPrepareSeparatedAssets(') + '\\nexport async function prepareSeparatedAssets(...args) { window.__separationCalls = (window.__separationCalls || 0) + 1; return realPrepareSeparatedAssets(...args); }' });
  });
  await page.goto(`);
const fixture = new Function('require', 'root', 'fs', 'path', 'assert', 'chromium', 'webkit', harness + '; return requestBrowserFixture;')(require, root, fs, path, assert, chromium, webkit);
const write = (name, value) => fs.writeFileSync(path.join(evidence, name), JSON.stringify(value, null, 2));
test('separated request preserves layout and attachment framing at the production request boundary', { timeout: 90000 }, async t => {
  const { page } = await fixture(t, 1, evidence, { initialGeneration: true });
  await page.click('#ai-image-panel [data-ai-send]');
  await page.waitForFunction(() => window.__task2.sends.length === 1);
  const result = await page.evaluate(async () => {
    const payload = window.__task2.sends[0].payload;
    const image = new Image(); image.src = payload.attachments[0].data; await image.decode();
    return { text: payload.text, width: image.naturalWidth, height: image.naturalHeight, sends: window.__task2.sends.length, interceptedAt: 'fiveEDesktop.send' };
  });
  write('prompt.json', result);
  assert.doesNotMatch(result.text, /4×4 격자로 배치|아틀라스 배치만 적용/);
  assert.match(result.text, /원본.*종횡비/);
  assert.equal(result.width, 512); assert.equal(result.height, 384); assert.equal(result.sends, 1);
});
test('legacy separated candidate dialog shares processed pixels, positions, and cached segmentation', { timeout: 90000 }, async t => {
  const { page, errors } = await fixture(t, 1, evidence);
  await page.waitForFunction(() => document.querySelector('#ai-image-panel .ai-generated-card .ai-preview-stage > img')?.src !== window.__task2.original);
  await page.click('#ai-image-panel [data-ai-editable-groups]');
  await page.waitForFunction(() => document.querySelectorAll('.aea-thumbnail img').length === 3);
  const inspect = () => page.evaluate(async () => {
    const main = document.querySelector('#ai-image-panel .ai-generated-card .ai-preview-stage > img').src;
    const dialog = document.querySelector('.aea-original image').getAttribute('href');
    const image = new Image(); image.src = dialog; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    return { sameSource: main === dialog, outerAlpha: ctx.getImageData(0, 0, 1, 1).data[3], innerAlpha: ctx.getImageData(80, 100, 1, 1).data[3], width: image.naturalWidth, height: image.naturalHeight,
      bounds: [...document.querySelectorAll('.aea-overlay g rect')].map(rect => Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Number(rect.getAttribute(key))]))),
      sends: window.__task2.sends.length, separationCalls: window.__separationCalls };
  });
  const first = await inspect(); write('dialog-first.json', first);
  await page.screenshot({ path: path.join(evidence, 'dialog-first.png') });
  assert.equal(first.sameSource, true); assert.equal(first.outerAlpha, 0); assert.equal(first.innerAlpha, 255);
  assert.equal(first.width, 512); assert.equal(first.height, 384); assert.equal(first.bounds.length, 3); assert.equal(first.separationCalls, 1);
  await page.click('.aea-dialog [data-action="cancel"]');
  await page.click('#ai-image-panel [data-ai-editable-groups]');
  await page.waitForFunction(() => document.querySelectorAll('.aea-thumbnail img').length === 3);
  const second = await inspect(); write('dialog-second.json', second);
  assert.deepEqual(second, first); assert.equal(second.sends, 0); assert.deepEqual(errors, []);
});
