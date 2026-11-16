// Fixed label source: 6e2c55012461859cdc8afb4d9596d3f08d5409b4; assertions and fixtures retained.
const { installLabelSourcePage, armSelection, selectionArrived } = require('./helpers/label-source-browser.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const preview = process.env.PREVIEW_URL || 'http://127.0.0.1:62759/';
const evidence = process.env.EVIDENCE_DIR || path.resolve(__dirname, '../.omo/evidence/labeler-doubleclick');

test('legacy labeler glyph double-click wins over endpoint/group handles and preserves gesture policy', { timeout: 90000 }, async () => {
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });await installLabelSourcePage(page);
    await page.addInitScript(() => localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true'));
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(preview, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#canvas');
    const skip = page.getByRole('button', { name: '건너뛰기', exact: true });
    if (await skip.isVisible().catch(() => false)) await skip.click();
    await page.evaluate(async () => {
      const version = '?v=1.7.0-four-session-integration';
      const { state, OBJECT_LABEL_TEXT_FONT_FAMILY } = await import('/js/state.js' + version);
      const { applyLoaded } = await import('/js/project-io.js' + version);
      const { worldToScreen, screenToWorld } = await import('/js/viewport.js' + version);
      const { isLabelerTextPoint } = await import('/js/pick.js' + version);
      await document.fonts.ready;
      window.__labelerClickQA = { state, applyLoaded, worldToScreen, screenToWorld, isLabelerTextPoint, family: OBJECT_LABEL_TEXT_FONT_FAMILY };
    });
    const results = [];
    const label = (extra = {}) => ({ id: 'label', type: 'labeler', text: '세포 호흡', contentMode: 'plain',
      labelType: 'label', p1: { x: 50, y: 40 }, p2: { x: 50, y: 40 }, labelSize: 4,
      layerId: 1, strokeWidth: 0.2, strokeLevel: 5, locked: false, rotation: 0, ...extra });
    const load = async (objects, options = {}) => {
      await page.evaluate(({ objects, options }) => {
        const q = window.__labelerClickQA;
        objects.forEach(o => { if (o.type === 'labeler') o.fontFamily ||= q.family; });
        q.applyLoaded(q.state, { version: '0.17', pages: [{ id: 'qa', objects, groups: options.groups || [], artboard: { w: 100, h: 80 } }], activePageId: 'qa' });
        q.state.update(s => {
          s.activeTool = options.activeTool || 'V';
          s.layers = options.layers || [{ id: 1, name: '검수', visible: true }];
          s.activeLayerId = options.activeLayerId || 1;
          s.selectedIds = options.selectedIds || [];
          s.targetedId = null;
          s.groups = options.groups || [];
          s.viewBox = { x: 0, y: 0, w: 100, h: 80 };
        });
      }, { objects, options });
      if (!(options.layers || []).some(layer => layer.id === 1 && layer.visible === false)) {
        await page.locator('#canvas [data-id="label"]').first().waitFor({ state: 'attached' });
      }
    };
    const point = (x = 50, y = 40) => page.evaluate(({ x, y }) => {
      const q = window.__labelerClickQA;
      return q.worldToScreen(document.querySelector('#canvas'), q.state.get().viewBox, x, y);
    }, { x, y });
    const editor = page.locator('.unified-text-editor');
    const assertOpened = async (expected, scenario, inline = false) => {
      const activeEditor = inline ? page.locator('.ai-inline-label-editor') : editor;
      try {
        await activeEditor.waitFor({ state: 'visible', timeout: 4000 });
      } catch (error) {
        await page.screenshot({ path: path.join(evidence, 'failure.png') });
        const state = await page.evaluate(() => structuredClone(window.__labelerClickQA.state.get()));
        fs.writeFileSync(path.join(evidence, 'failure.json'), JSON.stringify({ scenario, state, errors }, null, 2));
        throw new Error(scenario + ': ' + error.message);
      }
      assert.equal(await (inline ? activeEditor : activeEditor.locator('textarea')).inputValue(), expected, scenario);
      const selected = await page.evaluate(() => ({ selectedIds: window.__labelerClickQA.state.get().selectedIds, targetedId: window.__labelerClickQA.state.get().targetedId }));
      if (selected.selectedIds.length !== 1 || selected.selectedIds[0] !== 'label') {
        await page.screenshot({ path: path.join(evidence, 'selection-failure.png') });
        fs.writeFileSync(path.join(evidence, 'selection-failure.json'), JSON.stringify({ scenario, selected, draft: await page.evaluate(() => structuredClone(window.__labelerClickQA.state.get().draftText)), errors }, null, 2));
      }
      assert.deepEqual(selected.selectedIds, ['label'], scenario);
      results.push({ scenario, opened: true, ...selected });
      await page.keyboard.press('Escape');
      await activeEditor.waitFor({ state: 'detached' });
    };
    const assertClosed = async (scenario) => {
      assert.equal(await editor.count(), 0, scenario);
      results.push({ scenario, opened: false });
    };

    for (const [scenario, object, options] of [
      ['plain text-only label, initial selection', label(), {}],
      ['plain label with leader', label({ p1: { x: 25, y: 30 } }), {}],
      ['legacy formula label', label({ text: 'm_B', contentMode: 'formula', source: 'm_B', rawSource: 'm_B' }), {}],
      ['already-selected endpoint over text', label(), { selectedIds: ['label'] }],
      ['rotate tool', label(), { activeTool: 'rotate' }],
      ['locked label retains established editable-text policy', label({ locked: true }), {}],
    ]) {
      await load([object], options);
      const p = await point();
      await page.mouse.dblclick(p.x, p.y);
      await assertOpened(object.text, scenario, !object.locked && !options.activeTool);
    }

    // A grouped label is selected with the entire group on the first press,
    // then targeted alone for editing on the second press.
    const groupObjects = [label({ groupId: 'g' }), { id: 'rect', type: 'rect', x: 15, y: 15, w: 5, h: 5, layerId: 1, groupId: 'g', strokeWidth: 0.2 }];
    await load(groupObjects, { groups: [{ id: 'g', memberIds: ['label', 'rect'] }] });
    let p = await point();
    await page.mouse.dblclick(p.x, p.y);
    await assertOpened('세포 호흡', 'group member whole-content editing');
    assert.equal(results.at(-1).targetedId, 'label');

    // The group frame can put a handle over long label glyphs. Find a real
    // rendered handle/body intersection instead of fabricating a MouseEvent.
    await load(groupObjects, { groups: [{ id: 'g', memberIds: ['label', 'rect'] }], selectedIds: ['label', 'rect'] });
    const groupHit = await page.evaluate(() => {
      const q = window.__labelerClickQA;
      const svg = document.querySelector('#canvas');
      const obj = q.state.get().objects.find(o => o.id === 'label');
      for (const h of document.querySelectorAll('#handles [data-handle]')) {
        const b = h.getBoundingClientRect();
        for (const fx of [0.5, 0.2, 0.8]) for (const fy of [0.5, 0.2, 0.8]) {
          const x = b.x + b.width * fx, y = b.y + b.height * fy;
          const w = q.screenToWorld(svg, q.state.get().viewBox, x, y);
          const target = document.elementFromPoint(x, y);
          const ownsObject = q.state.get().objects.some(o => o.id === h.dataset.id);
          if (!ownsObject && target?.dataset?.handle && q.isLabelerTextPoint(obj, w)) return { x, y, handle: h.dataset.handle };
        }
      }
      return null;
    });
    assert.ok(groupHit, 'fixture must expose a glyph-overlapping group handle without an owning object');
    await page.mouse.dblclick(groupHit.x, groupHit.y);
    await assertOpened('세포 호흡', 'group handle without an owning object');

    await load([label({ p1: { x: 25, y: 30 } })], { selectedIds: ['label'] });
    p = await point(25, 30);
    await page.mouse.dblclick(p.x, p.y);
    await assertClosed('leader starting endpoint does not open text editor');

    await load([label({ p1: { x: 25, y: 30 } })], { selectedIds: ['label'] });
    p = await point(25, 30);
    const end = await point(29, 33);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 5 });
    await page.mouse.up();
    const moved = await page.evaluate(() => window.__labelerClickQA.state.get().objects.find(o => o.id === 'label'));
    assert.ok(Math.hypot(moved.p1.x - 25, moved.p1.y - 30) > 1, 'ordinary anchor handle drag must remain available');
    assert.deepEqual(moved.p2, { x: 50, y: 40 }, 'dragging leader anchor must not move glyph position');
    results.push({ scenario: 'single-press endpoint drag', p1: moved.p1, p2: moved.p2 });

    await load([label()]);
    p = await point();
    await page.keyboard.down('Shift');
    await page.mouse.dblclick(p.x, p.y);
    await page.keyboard.up('Shift');
    await assertClosed('Shift double-click preserves selection gesture');
    await load([label()]);
    p = await point();
    await page.keyboard.down('Space');
    await page.mouse.dblclick(p.x, p.y);
    await page.keyboard.up('Space');
    await assertClosed('Space double-click preserves pan gesture');

    for (const [scenario, options] of [
      ['inactive layer', { activeLayerId: 2, layers: [{ id: 1, visible: true }, { id: 2, visible: true }] }],
      ['hidden active layer', { layers: [{ id: 1, visible: false }] }],
    ]) {
      await load([label()], options);
      p = await point();
      await page.mouse.dblclick(p.x, p.y);
      await assertClosed(scenario);
    }
    await load([label(), { id: 'top', type: 'text', x: 45, y: 38, text: '가림', fontSize: 8, layerId: 1 }]);
    p = await point();
    await page.mouse.dblclick(p.x, p.y);
    await editor.waitFor({ state: 'visible' });
    assert.equal(await editor.locator('textarea').inputValue(), '가림', 'topmost text object must keep priority over underlying label');
    await page.keyboard.press('Escape');
    results.push({ scenario: 'topmost text keeps editing priority', opened: '가림' });

    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ results, errors }, null, 2));
    await page.screenshot({ path: path.join(evidence, 'gesture-policy.png') });
  } finally {
    await browser.close();
  }
});
