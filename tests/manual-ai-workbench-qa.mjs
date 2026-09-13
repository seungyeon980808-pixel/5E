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
await inlineEditor.fill('매우 긴 코멘트도 목록 안에서 직접 고치고 삭제할 수 있어야 합니다.');
assert.equal(await inlineEditor.inputValue(), '매우 긴 코멘트도 목록 안에서 직접 고치고 삭제할 수 있어야 합니다.');
assert.equal(await page.locator('[data-ai-comment-editor]').count(), 0);
await page.locator('[data-ai-inline-delete]').click();
assert.equal(await page.locator('[data-ai-inline-editor]').count(), 0);

await page.locator('[data-ai-tab-clear]').click();
const dialogText = await page.locator('dialog[open]').innerText();
assert.match(dialogText, /3개 작업/);
await page.locator('dialog[open] .ai-confirm-accept').click();
await page.waitForFunction(() => document.querySelectorAll('.ai-task-tab').length === 0);

await page.setViewportSize({ width: 375, height: 812 });
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
  originalAndCompareVisibleWhileGenerating: true, compareEnabledAfterFirstResult: true,
  deferredControlsHidden: true, viewports: ['1280x820', '375x812', '768x900 reduced-motion'],
}, null, 2));
