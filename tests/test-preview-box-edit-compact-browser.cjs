// Fixed label source: 6e2c55012461859cdc8afb4d9596d3f08d5409b4; assertions and fixtures retained.
const { installLabelSourcePage, armSelection, selectionArrived } = require('./helpers/label-source-browser.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { fixture, snapshot, emit } = require('./helpers/label-source-browser.cjs');
const evidence = process.env.EVIDENCE_DIR || path.resolve(__dirname, '../.omo/evidence/box-edit-compact-browser');

async function signal(page, name) {
  await page.evaluate(name => {
    window.__boxSignals ||= {};
    window.__boxSignals[name] = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Bridge send deadline')), 10000);
      window.addEventListener('qa:bridge-send', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }, name);
}

async function observe(page, name, state) {
  await page.evaluate(({ name, state }) => {
    window.__boxSignals ||= {};
    window.__boxSignals[name] = new Promise((resolve, reject) => {
      const check = () => {
        const ready = state === 'review'
          ? !!document.querySelector('[data-ai-scoped-edit-comparison]')
          : document.querySelector('#ai-image-panel')?.dataset.aiBusy !== 'true';
        if (ready) { observer.disconnect(); clearTimeout(timer); resolve(); }
      };
      const observer = new MutationObserver(check);
      observer.observe(document.body, { subtree: true, childList: true, attributes: true });
      const timer = setTimeout(() => { observer.disconnect(); reject(new Error('UI state deadline')); }, 10000);
      check();
    });
  }, { name, state });
}

const awaitSignal = (page, name) => page.evaluate(name => window.__boxSignals[name], name);

async function generatedPng(page, index) {
  return page.evaluate(async index => {
    const { decodeScopedPng, encodeScopedPng } = await import('/js/ai-scoped-edit-png.js?v=1.7.0-four-session-integration');
    const { scopedPngBytes, scopedPngData } = await import('/js/ai-panel.js?v=1.7.0-four-session-integration');
    const request = window.__task2.sends[index].payload;
    const spec = JSON.parse(request.text.split('<5e-scoped-edit-spec>\n')[1].split('\n</5e-scoped-edit-spec>')[0]);
    const image = await decodeScopedPng(scopedPngBytes(request.attachments[0].data));
    const data = new Uint8Array(image.data), r = spec.edits[0].allowed_pixels;
    for (let y = r.y0 + 10; y < r.y0 + 14; y++) for (let x = r.x0 + 10; x < r.x0 + 14; x++) {
      data.set([0, 0, 0, 255], (y * image.width + x) * 4);
    }
    const outsideX = 100 - spec.attached_origin_in_selected_pixels[0];
    const outsideY = 100 - spec.attached_origin_in_selected_pixels[1];
    data.set([255, 0, 0, 255], (outsideY * image.width + outsideX) * 4);
    return scopedPngData(await encodeScopedPng({ ...image, data }, { metadata: image.metadata }));
  }, index);
}

test('visible compact UI sends one clean source, preserves cancellation and binds corrected comments to original pixels', async context => {
  fs.mkdirSync(evidence, { recursive: true });
  const { page } = await fixture(context, 1, evidence, { selectedPartial: true });
  const mode = page.locator('[data-ai-scoped-prompt-mode]');
  assert.equal(await mode.isVisible(), true);
  assert.equal(await mode.inputValue(), 'legacy');
  await mode.selectOption('compact');
  await page.screenshot({ path: path.join(evidence, 'desktop-dark.png') });
  await signal(page, 'first-send');
  await page.locator('[data-ai-comments-apply]').click();
  await awaitSignal(page, 'first-send');
  const first = await page.evaluate(() => window.__task2.sends[0].payload);
  assert.equal(first.purpose, 'image'); assert.equal(first.model, 'gpt-6.1-sol');
  assert.equal(first.effort, 'medium'); assert.equal(first.attachments.length, 1);
  const spec = JSON.parse(first.text.split('<5e-scoped-edit-spec>\n')[1].split('\n</5e-scoped-edit-spec>')[0]);
  assert.deepEqual(spec.canvas_pixels, [1536, 1024]);
  assert.deepEqual(spec.selected_image_pixels, [512, 384]);
  assert.deepEqual(spec.attached_origin_in_selected_pixels, [-512, -320]);
  await observe(page, 'first-review', 'review');
  await emit(page, 0, 'image', await generatedPng(page, 0)); await emit(page, 0, 'done');
  await awaitSignal(page, 'first-review');
  await page.screenshot({ path: path.join(evidence, 'candidate-review.png') });
  await observe(page, 'cancelled', 'idle');
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await awaitSignal(page, 'cancelled');
  let tabs = await snapshot(page);
  assert.equal(tabs[0].generated.length, 1);
  assert.equal(tabs[0].generated[0].data, await page.evaluate(() => window.__task2.original));

  const feedback = 'Add one black dot inside the box. The previous dot was misplaced; keep all existing marks unchanged.';
  const fields = page.locator('#ai-image-panel textarea');
  let comment;
  for (let i = 0; i < await fields.count(); i++) {
    const field = fields.nth(i);
    if (await field.isVisible() && await field.inputValue() === 'Add one black dot inside the box.') { comment = field; break; }
  }
  assert.ok(comment, 'The actual editable box comment must be available');
  await comment.fill(feedback);
  await signal(page, 'second-send');
  await page.locator('[data-ai-comments-apply]').click();
  await awaitSignal(page, 'second-send');
  const second = await page.evaluate(() => window.__task2.sends[1].payload);
  assert.equal(second.attachments.length, 1);
  assert.equal(second.attachments[0].data, first.attachments[0].data, 'Correction must use the same clean source, not the rejected image');
  const secondSpec = JSON.parse(second.text.split('<5e-scoped-edit-spec>\n')[1].split('\n</5e-scoped-edit-spec>')[0]);
  assert.equal(secondSpec.edits[0].instruction, feedback);
  await observe(page, 'second-review', 'review');
  await emit(page, 1, 'image', await generatedPng(page, 1)); await emit(page, 1, 'done');
  await awaitSignal(page, 'second-review');
  await observe(page, 'applied', 'idle');
  await page.getByRole('button', { name: '적용', exact: true }).click();
  await awaitSignal(page, 'applied');
  tabs = await snapshot(page);
  assert.equal(tabs[0].generated.length, 2);
  const pixels = await page.evaluate(async candidate => {
    const { decodeScopedPng } = await import('/js/ai-scoped-edit-png.js?v=1.7.0-four-session-integration');
    const bytes = data => Uint8Array.from(atob(data.split(',')[1]), c => c.charCodeAt(0));
    const source = await decodeScopedPng(bytes(window.__task2.original)), final = await decodeScopedPng(bytes(candidate.data));
    let outside = 0, inside = 0;
    for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
      const i = (y * source.width + x) * 4;
      if ([0, 1, 2, 3].some(k => source.data[i + k] !== final.data[i + k])) {
        if (x >= 308 && x < 409 && y >= 116 && y < 230) inside++; else outside++;
      }
    }
    const i = (225 * source.width + 330) * 4;
    return { outside, inside, dimensions: [final.width, final.height],
      unnamedInsideMarkPreserved: [0, 1, 2, 3].every(k => source.data[i + k] === final.data[i + k]) };
  }, tabs[0].generated.at(-1));
  assert.equal(pixels.outside, 0); assert.equal(pixels.inside, 16);
  assert.equal(pixels.unnamedInsideMarkPreserved, true);
  assert.deepEqual(pixels.dimensions, [512, 384]);
  const views = [];
  for (const theme of ['light', 'dark']) for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
    const layout = await mode.evaluate(element => {
      const r = element.getBoundingClientRect();
      return { x: r.x, right: r.right, width: r.width, viewport: innerWidth };
    });
    views.push({ theme, viewportWidth: width, modeLayout: layout });
    await page.screenshot({ path: path.join(evidence, `${width}-${theme}.png`) });
  }
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({
    paidAiCalls: 0, evidenceType: 'Synthetic transport, real product browser/UI/PNG modules',
    pixels, views, nativeRequestCount: 2, cleanOriginalCorrection: true, reviewCancelDoesNotRegister: true,
  }, null, 2));
});
