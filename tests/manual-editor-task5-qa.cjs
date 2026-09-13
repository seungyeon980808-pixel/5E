const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const currentUrl = process.env.EDITOR_QA_URL || 'http://127.0.0.1:19608';
const baselineUrl = process.env.EDITOR_BASELINE_URL || 'http://127.0.0.1:19609';
const outputDir = process.env.EDITOR_QA_OUT || '.omo/evidence/usability-release/task-5/screenshots';

async function editorState(page) {
  return page.evaluate(async () => JSON.parse(JSON.stringify((await import('./js/state.js?v=1.4.0')).state.get())));
}

async function openEditor(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto(url);
  const skip = page.getByRole('button', { name: '건너뛰기', exact: true });
  if (await skip.isVisible()) await skip.click();
  await page.locator('#page-tabs .page-tab').first().waitFor();
  return page;
}

async function installSelectionFixture(page, selectedIds) {
  await page.evaluate(async (ids) => {
    const { state } = await import('./js/state.js?v=1.4.0');
    state.update((s) => {
      s.objects = [
        { id: 'split-a', type: 'rect', x: -42, y: -22, w: 24, h: 24, rotation: 0, layerId: 1, groupId: null, fillNone: true, strokeWidth: 0.5 },
        { id: 'split-b', type: 'ellipse', x: 4, y: -18, w: 28, h: 20, rotation: 0, layerId: 1, groupId: null, fillNone: true, strokeWidth: 0.5 },
        { id: 'locked-overlap', type: 'rect', x: -5, y: 12, w: 30, h: 20, rotation: 0, layerId: 1, groupId: null, locked: true, fillNone: true, strokeWidth: 0.5 },
      ];
      s.pages.find((item) => item.id === s.activePageId).objects = s.objects;
      s.selectedIds = ids;
      s.groups = [];
      s.activeTool = 'V';
    });
  }, selectedIds);
}

async function setScale(page, multiplier) {
  await page.evaluate(async (factor) => {
    const { state } = await import('./js/state.js?v=1.4.0');
    state.update((s) => {
      const cx = s.viewBox.x + s.viewBox.w / 2;
      const cy = s.viewBox.y + s.viewBox.h / 2;
      const w = s.viewBox.w / factor;
      const h = s.viewBox.h / factor;
      s.viewBox = { x: cx - w / 2, y: cy - h / 2, w, h };
    });
  }, multiplier);
}

async function scaleFixtureObjects(page, factor) {
  await page.evaluate(async (amount) => {
    const { state } = await import('./js/state.js?v=1.4.0');
    state.update((s) => {
      for (const item of s.objects) {
        if (!['split-a', 'split-b', 'locked-overlap'].includes(item.id)) continue;
        item.x *= amount; item.y *= amount; item.w *= amount; item.h *= amount;
      }
    });
  }, factor);
}

async function geometry(page) {
  return page.evaluate(() => ({
    frames: [...document.querySelectorAll('[data-selection-frame]')].map((el) => ({
      kind: el.getAttribute('data-selection-frame'), stroke: getComputedStyle(el).strokeWidth,
      dash: el.getAttribute('stroke-dasharray'), box: el.getBoundingClientRect().toJSON(),
    })),
    handles: [...document.querySelectorAll('#handles rect[stroke]')].map((el) => el.getBoundingClientRect().toJSON()),
    handleStrokes: [...document.querySelectorAll('#handles rect[stroke]')].map((el) => getComputedStyle(el).strokeWidth),
    hitHandles: [...document.querySelectorAll('#handles rect[fill="transparent"]')].map((el) => el.getBoundingClientRect().toJSON()),
  }));
}

(async () => {
  await fs.mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: false });
  try {
    const baseline = await openEditor(browser, baselineUrl);
    await installSelectionFixture(baseline, ['split-a']);
    await baseline.screenshot({ path: path.join(outputDir, 'baseline-red-single.png') });
    const baselineGeometry = await geometry(baseline);
    assert.notEqual(Math.round(baselineGeometry.handles[0].width), 8);
    await baseline.close();

    const page = await openEditor(browser, currentUrl);
    const firstPage = (await editorState(page)).activePageId;
    await page.locator('#page-add').click();
    const middlePage = (await editorState(page)).activePageId;
    await installSelectionFixture(page, ['split-a']);
    await page.locator('#page-add').click();
    await page.locator(`.page-tab[data-id="${middlePage}"]`).click();
    await installSelectionFixture(page, ['split-a', 'split-b']);
    const beforeDelete = await editorState(page);
    await page.locator(`.page-tab[data-id="${middlePage}"]`).click({ button: 'right' });
    await page.locator('.page-ctx-menu').getByRole('button', { name: '삭제', exact: true }).click();
    await page.locator('.modal-overlay:not([hidden])').getByRole('button', { name: '삭제', exact: true }).click();
    assert.deepEqual((await editorState(page)).pages.map((item) => item.id), [firstPage, beforeDelete.pages[2].id]);
    await page.keyboard.press('Meta+z');
    const restored = await editorState(page);
    assert.deepEqual(restored.pages, beforeDelete.pages);
    assert.equal(restored.activePageId, middlePage);
    assert.deepEqual(restored.selectedIds, ['split-a', 'split-b']);
    await page.keyboard.press('Meta+Shift+z');
    assert.equal((await editorState(page)).pages.length, 2);
    await page.keyboard.press('Meta+z');

    await installSelectionFixture(page, ['split-a']);
    for (const [label, factor] of [['25', 0.25], ['100', 4], ['400', 4]]) {
      await setScale(page, factor);
      if (label === '400') await scaleFixtureObjects(page, 0.25);
      const single = await geometry(page);
      console.log(JSON.stringify({ label, handles: single.handles.map((item) => item.width), hits: single.hitHandles.map((item) => item.width) }));
      assert.equal(single.frames.filter((item) => item.kind === 'single').length, 1);
      assert.equal(single.handles.length, 8);
      assert.ok(single.handles.every((item) => Math.abs(item.width - 8) < 0.25));
      assert.ok(single.hitHandles.every((item) => Math.abs(item.width - 24) < 0.25));
      assert.ok(single.handleStrokes.every((item) => Math.abs(Number.parseFloat(item) - 1) < 0.01));
      await page.screenshot({ path: path.join(outputDir, `single-${label}.png`) });
    }

    await installSelectionFixture(page, ['split-a', 'split-b']);
    await setScale(page, 0.25);
    const multi = await geometry(page);
    assert.equal(multi.frames.filter((item) => item.kind === 'multi-outer').length, 1);
    assert.equal(multi.frames.filter((item) => item.kind === 'multi-member').length, 2);
    assert.equal(multi.handles.length, 8);
    assert.deepEqual((await editorState(page)).objects.map((item) => item.groupId), [null, null, null]);
    await page.screenshot({ path: path.join(outputDir, 'multi-100.png') });
    const beforeResize = (await editorState(page)).objects.map((item) => ({ id: item.id, w: item.w, h: item.h }));
    const resizeHandle = await page.locator('#handles rect[stroke][data-handle="se"]').boundingBox();
    await page.mouse.move(resizeHandle.x + resizeHandle.width / 2, resizeHandle.y + resizeHandle.height / 2);
    await page.mouse.down();
    await page.mouse.move(resizeHandle.x + resizeHandle.width / 2 + 40, resizeHandle.y + resizeHandle.height / 2 + 30);
    await page.mouse.up();
    const afterResize = await editorState(page);
    assert.notDeepEqual(afterResize.objects.slice(0, 2).map((item) => ({ id: item.id, w: item.w, h: item.h })), beforeResize.slice(0, 2));
    assert.deepEqual(afterResize.objects.map((item) => item.groupId), [null, null, null]);
    await setScale(page, 4);
    await scaleFixtureObjects(page, 0.25);
    await page.screenshot({ path: path.join(outputDir, 'multi-400.png') });

    const canvas = await page.locator('#canvas').boundingBox();
    await setScale(page, 0.25);
    await installSelectionFixture(page, []);
    await page.mouse.move(canvas.x + 180, canvas.y + 700);
    await page.mouse.down();
    await page.mouse.move(canvas.x + 700, canvas.y + 820, { steps: 8 });
    const marquee = page.locator('#canvas > rect[fill="rgba(9,105,218,0.08)"]');
    assert.equal(await marquee.getAttribute('fill', { timeout: 2000 }), 'rgba(9,105,218,0.08)');
    assert.equal(await marquee.getAttribute('vector-effect', { timeout: 2000 }), 'non-scaling-stroke');
    await page.screenshot({ path: path.join(outputDir, 'marquee-drag.png') });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.mouse.up();
    assert.deepEqual((await editorState(page)).objects.map((item) => item.groupId), [null, null, null]);

    await installSelectionFixture(page, ['split-a', 'locked-overlap']);
    await page.evaluate(async () => {
      const { state } = await import('./js/state.js?v=1.4.0');
      state.update((s) => { s.draft = { id: 'draft-probe', type: 'rect', x: 28, y: 18, w: 8, h: 6, layerId: 1, fillNone: true, strokeWidth: 0.5 }; });
    });
    await page.screenshot({ path: path.join(outputDir, 'locked-overlap.png') });
    const locked = await geometry(page);
    assert.equal(locked.frames.filter((item) => item.kind === 'multi-outer').length, 1);
    assert.equal(locked.handles.length, 0);
    assert.equal(await page.locator('[data-id="draft-probe"]').count(), 1);

    const onlyPage = (await editorState(page)).activePageId;
    for (const id of (await editorState(page)).pages.map((item) => item.id).filter((id) => id !== onlyPage)) {
      await page.locator(`.page-tab[data-id="${id}"]`).click({ button: 'right' });
      await page.locator('.page-ctx-menu').getByRole('button', { name: '삭제', exact: true }).click();
      await page.locator('.modal-overlay:not([hidden])').getByRole('button', { name: '삭제', exact: true }).click();
    }
    await page.locator('.page-tab').click({ button: 'right' });
    assert.equal(await page.locator('.page-ctx-menu').getByRole('button', { name: '삭제', exact: true }).isEnabled(), false);
    await page.screenshot({ path: path.join(outputDir, 'minimum-one-page.png') });
    await page.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
