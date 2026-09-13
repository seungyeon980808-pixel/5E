import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.argv[2] || 'http://127.0.0.1:19612/index.html';
const evidence = new URL('../.omo/evidence/usability-release/task-4/browser/', import.meta.url);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, reducedMotion: 'no-preference' });
await context.addInitScript(() => {
  const listeners = { event: [], state: [], log: [] };
  window.__qaSendCount = 0;
  window.__qaEmit = value => listeners.event.forEach(callback => callback(value));
  window.fiveEDesktop = {
    status: async () => ({ login: { loggedIn: true }, server: true, state: 'ready' }),
    start: async () => ({ ok: true }),
    models: async () => ({ data: [{ model: 'gpt-5.6-sol', displayName: 'Deterministic QA', supportedReasoningEfforts: ['medium', 'high'], serviceTiers: ['priority'] }] }),
    account: async () => ({ account: { name: 'Local QA' }, limits: {} }),
    interrupt: async () => ({ ok: true, state: 'interrupt-requested' }),
    send: async () => { window.__qaSendCount += 1; return { turnId: 'qa-turn', renderThreadId: 'qa-render' }; },
    onEvent: callback => { listeners.event.push(callback); },
    onState: callback => { listeners.state.push(callback); },
    onLog: callback => { listeners.log.push(callback); },
    setAiTaskShortcutActive() {},
  };
});
const page = await context.newPage();
await page.goto(baseUrl);
const welcome = page.locator('.tut-welcome-overlay');
if (await welcome.isVisible()) await welcome.locator('button').first().click();
await page.locator('#ai-image-install-open').click();
await page.locator('#ai-image-panel:not([hidden])').waitFor();

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFElEQVR4nGP8z8Dwn4EIwDiqkL4KAV0ABfQFt6KxNwAAAABJRU5ErkJggg==', 'base64');
await page.locator('[data-ai-source-file]').setInputFiles([
  { name: 'source-a.png', mimeType: 'image/png', buffer: png },
  { name: 'source-b.png', mimeType: 'image/png', buffer: png },
  { name: 'source-c.png', mimeType: 'image/png', buffer: png },
]);
await page.locator('.ai-task-tab').nth(2).waitFor();
assert.equal(await page.locator('.ai-task-tab').count(), 3);
assert.equal(await page.locator('[data-ai-output-engine="asset"]').isVisible(), false);
assert.equal(await page.locator('[data-ai-mode="complete"]').isVisible(), false);
assert.equal(await page.locator('[data-ai-compare]').isDisabled(), true);
assert.match(await page.locator('[data-ai-compare]').getAttribute('title'), /첫 결과/);
await page.screenshot({ path: new URL('wide.png', evidence).pathname, fullPage: true });

await page.locator('[data-ai-review-mode]').uncheck();
await page.locator('[data-ai-send]').click();
await page.waitForFunction(() => document.querySelector('#ai-image-panel')?.dataset.aiBusy === 'true');
assert.equal(await page.locator('[data-ai-layout-mode="source"]').isVisible(), true);
assert.equal(await page.locator('.ai-compare-controls').isVisible(), true);
await page.evaluate(dataUrl => {
  window.__qaEmit({ method: 'item/started', params: { turnId: 'qa-turn', item: { type: 'imageGeneration' } } });
  window.__qaEmit({ method: 'item/completed', params: { turnId: 'qa-turn', item: { type: 'imageGeneration', imageDataUrl: dataUrl } } });
  window.__qaEmit({ method: 'turn/completed', params: { turn: { id: 'qa-turn', status: 'completed' } } });
}, `data:image/png;base64,${png.toString('base64')}`);
await page.waitForFunction(() => document.querySelector('#ai-image-panel')?.dataset.aiBusy === 'false');
assert.equal(await page.locator('.ai-generated-card').count(), 1);
assert.equal(await page.locator('[data-ai-compare]').isDisabled(), false);

await page.locator('[data-ai-comment-tool="point"]').click();
await page.locator('[data-ai-layout-mode="source"]').click();
const sourceImage = page.locator('.ai-original-pane img').first();
await sourceImage.click({ position: { x: 5, y: 5 } });
const inlineEditor = page.locator('[data-ai-inline-editor]');
const pointComment = '관찰 지점을 더 선명하게 표시하고 주변 요소와의 관계도 유지해 주세요.';
await inlineEditor.fill(pointComment);
assert.equal(await inlineEditor.inputValue(), pointComment);
assert.equal(await page.locator('[data-ai-comment-geometry] input').count(), 2);
assert((await inlineEditor.boundingBox()).width >= 200);
await page.locator('[data-ai-comment-row]').screenshot({ path: new URL('followup-wide-inline.png', evidence).pathname });
assert.equal(await page.locator('[data-ai-comment-editor]').count(), 0);
await page.locator('[data-ai-inline-delete]').click();
assert.equal(await page.locator('[data-ai-inline-editor]').count(), 0);

await page.locator('[data-ai-comment-tool="area"]').click();
const sourceBounds = await sourceImage.boundingBox();
await page.mouse.move(sourceBounds.x + sourceBounds.width * 0.2, sourceBounds.y + sourceBounds.height * 0.2);
await page.mouse.down();
await page.mouse.move(sourceBounds.x + sourceBounds.width * 0.65, sourceBounds.y + sourceBounds.height * 0.65);
await page.mouse.up();
const areaEditor = page.locator('[data-ai-inline-editor]');
const areaComment = '선택한 영역의 긴 한국어 설명이 좁게 접히지 않고 한 줄에 여러 글자씩 읽혀야 합니다.';
await areaEditor.fill(areaComment);
assert.equal(await page.locator('[data-ai-comment-geometry] input').count(), 4);
const xGeometry = page.locator('[data-ai-geometry-key="x"]');
await xGeometry.fill('12');
await xGeometry.press('Tab');
assert.equal(await xGeometry.inputValue(), '12');

await page.setViewportSize({ width: 375, height: 812 });
await page.locator('#ai-image-panel [data-panel-toggle="right"]').click();
await page.waitForFunction(() => {
  const panel = document.querySelector('#ai-image-panel .ai-conversation');
  const rect = panel?.getBoundingClientRect();
  return rect && rect.left >= 0 && rect.right <= innerWidth;
});
await areaEditor.waitFor({ state: 'visible' });
assert(await areaEditor.evaluate(element => element.getBoundingClientRect().width >= 160));
await page.screenshot({ path: new URL('followup-narrow-inline.png', evidence).pathname, fullPage: true });
await page.locator('[data-ai-inline-delete]').click();
assert.equal(await page.locator('[data-ai-inline-editor]').count(), 0);

await page.setViewportSize({ width: 1280, height: 820 });
await page.locator('[data-ai-tab-clear]').click();
const dialogText = await page.locator('dialog[open]').innerText();
assert.match(dialogText, /3개 작업/);
await page.locator('dialog[open] .ai-confirm-accept').click();
await page.waitForFunction(() => document.querySelectorAll('.ai-task-tab').length === 0);

await page.screenshot({ path: new URL('narrow.png', evidence).pathname, fullPage: true });
await context.close();

const reduced = await browser.newContext({ viewport: { width: 768, height: 900 }, reducedMotion: 'reduce' });
const reducedPage = await reduced.newPage();
await reducedPage.goto(baseUrl);
const reducedWelcome = reducedPage.locator('.tut-welcome-overlay');
if (await reducedWelcome.isVisible()) await reducedWelcome.locator('button').first().click();
await reducedPage.locator('#ai-image-install-open').click();
await reducedPage.locator('#ai-image-panel:not([hidden])').waitFor();
assert.equal(await reducedPage.locator('#ai-image-panel').evaluate(element => getComputedStyle(element).getPropertyValue('--ai-accordion-duration').trim()), '0ms');
await reducedPage.screenshot({ path: new URL('reduced-motion.png', evidence).pathname, fullPage: true });
await reduced.close();
await browser.close();
await writeFile(new URL('manual-qa.json', evidence), JSON.stringify({
  transport: 'deterministic-local', paidGenerationCalls: 0, deterministicGenerationCalls: 1, taskCountConfirmed: 3,
  inlineCommentEdited: true, inlineCommentDeleted: true, compareDisabledBeforeFirstResult: true,
  pointGeometryInputs: 2, regionGeometryInputs: 4, longKoreanCommentReadable: true,
  originalAndCompareVisibleWhileGenerating: true, compareEnabledAfterFirstResult: true,
  deferredControlsHidden: true, viewports: ['1280x820', '375x812', '768x900 reduced-motion'],
}, null, 2));
