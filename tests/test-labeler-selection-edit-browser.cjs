// Fixed label source: 6e2c55012461859cdc8afb4d9596d3f08d5409b4; assertions and fixtures retained.
const { installLabelSourcePage, armSelection, selectionArrived } = require('./helpers/label-source-browser.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium, webkit } = require('playwright');
const root = path.resolve(__dirname, '..');
const parent = process.env.EVIDENCE_DIR;
fs.mkdirSync(parent, { recursive: true });
const evidence = process.env.EVIDENCE_DIR || fs.mkdtempSync(path.join(parent, 'run-'));
let preview = process.env.PREVIEW_URL, server;
assert.ok(preview, 'A retained PREVIEW_URL is required');

for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  test(`label selection, central handle and click-again editing in ${name}`, { timeout: 90000 }, async () => {
    const browser = await engine.launch({ headless: true });
    try {
      for (const width of [1440, 760]) {
        const dir = path.join(evidence, name, String(width)); fs.mkdirSync(dir, { recursive: true });
        const page = await browser.newPage({ viewport: { width, height: 1000 } });await installLabelSourcePage(page);
        page.setDefaultTimeout(5000);
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true'));
        await page.goto(preview + '?mode=pro', { waitUntil: 'domcontentloaded' });
        await page.evaluate(async () => {
          const v = '?v=1.7.0-four-session-integration';
          const { state, DEFAULT_TEXT_FONT } = await import('/js/state.js' + v);
          const { applyLoaded, serialize } = await import('/js/project-io.js' + v);
          const { undo, redo } = await import('/js/transform.js' + v);
          window.selectionQA = { state, applyLoaded, serialize, undo, redo, DEFAULT_TEXT_FONT };
          await document.fonts.ready;
        });
        const load = async (extra = {}) => {
          await page.evaluate(extra => {
            const q = selectionQA;
            const object = { id: 'label', type: 'labeler', text: '전류 센서', contentMode: 'plain', labelSize: 3.7,
              fontFamily: q.DEFAULT_TEXT_FONT, layerId: 1, strokeWidth: .2, strokeLevel: 0,
              p1: { x: 25, y: 35 }, p2: { x: 62, y: 40 }, aiAutoLabel: true, aiParentImageId: 'diagram', labelTypographyVersion: 1,
              leaderRoutes: [{ kind: 'straight', attachment: 'label', start: { x: 48, y: 38 }, target: { x: 25, y: 35 }, controls: [], end: 'none' }], ...extra };
            q.applyLoaded(q.state, { version: '0.17', pages: [{ id: 'qa', objects: [object], groups: [], artboard: { w: 100, h: 80 } }], activePageId: 'qa' });
            q.state.update(s => { s.activeTool = 'V'; s.selectedIds = []; s.targetedId = null; s.layers = [{ id: 1, visible: true, name: 'QA' }]; s.activeLayerId = 1; s.viewBox = { x: 0, y: 0, w: 100, h: 80 }; s.undoStack = []; s.redoStack = []; });
          }, extra);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        };
        const object = () => page.evaluate(() => structuredClone(selectionQA.state.get().objects[0]));
        const glyph = () => page.locator('#scene [data-id="label"]:not([data-ui]) text').first().evaluate(el => { const b = el.getBoundingClientRect(); return { x: b.x + b.width * .2, y: b.y + b.height / 2 }; });
        const input = page.locator('.ai-inline-label-editor');
        const textClick = async () => { const p = await glyph(); await page.mouse.click(p.x, p.y); };
        await load();
        await textClick();
        assert.deepEqual(await page.evaluate(() => selectionQA.state.get().selectedIds), ['label']);
        assert.equal(await input.count(), 0, 'first glyph click only selects');
        assert.equal(await page.locator('.unified-text-editor').count(), 0);
        const handle = page.locator('#handles [data-id="label"][data-handle="p1"]').last();
        const center = await handle.evaluate(el => ({ x: +el.getAttribute('x') + +el.getAttribute('width') / 2, y: +el.getAttribute('y') + +el.getAttribute('height') / 2 }));
        assert.deepEqual(center, (await object()).p2, 'move handle is at the text center');
        const panelToggle = page.locator('#drawer-right-toggle');
        const panelWasCollapsed = await panelToggle.getAttribute('aria-expanded') === 'false';
        const detailIcon = page.locator('#inspector [data-text-detail-edit]:visible');
        const showProperties = async () => {
          if (await panelToggle.getAttribute('aria-expanded') === 'false') await panelToggle.click();
          await page.waitForFunction(() => document.querySelector('.panel-right').getBoundingClientRect().right <= innerWidth + 1);
        };
        await showProperties();
        assert.equal(await detailIcon.count(), 1, 'selected label has one discoverable detailed-edit icon');
        assert.equal(await detailIcon.textContent(), '', 'the compact entry has no visible text');
        assert.equal(await detailIcon.getAttribute('aria-label'), '텍스트 상세 편집');
        assert.equal(await detailIcon.locator('svg').count(), 1);
        const section = page.locator('#inspector [data-lite-control="leader-label"]').locator('xpath=ancestor::details');
        await section.evaluate(el => { el.open = false; });
        await page.screenshot({ path: path.join(dir, 'detail-icon.png') });
        await detailIcon.focus(); await page.keyboard.press('Enter');
        await page.locator('.unified-text-editor').waitFor({ state: 'visible' });
        assert.equal(await page.locator('.unified-text-editor textarea').inputValue(), '전류 센서');
        assert.equal(await section.evaluate(el => el.open), false, 'icon activation does not toggle disclosure');
        await page.locator('.unified-text-editor textarea').press('Escape');
        assert.equal(await page.locator('.unified-text-editor').count(), 0, 'Escape cancels the dialog before the narrow drawer');
        await section.evaluate(el => { el.open = true; });
        // Escape may also close the existing narrow-screen inspector drawer.
        await showProperties();
        await detailIcon.focus(); await page.keyboard.press('Space');
        await page.locator('.unified-text-editor').waitFor({ state: 'visible' });
        await page.locator('.unified-text-editor textarea').press('Escape');
        assert.equal(await page.locator('.unified-text-editor').count(), 0);
        if (panelWasCollapsed && await panelToggle.getAttribute('aria-expanded') === 'true') {
          await page.keyboard.press('Escape');
          await page.locator('#panel-right').waitFor({ state: 'hidden' });
        }
        await page.screenshot({ path: path.join(dir, 'selected.png') });
        await handle.click();
        await input.waitFor({ state: 'visible' });
        assert.equal(await page.locator('.unified-text-editor').count(), 0, 'second click stays in simple editing');
        await input.fill('전류 센서 수정'); await input.press('Enter');
        const beforeDrag = await object();
        const box = await handle.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2 - 20, { steps: 8 }); await page.mouse.up();
        const moved = await object();
        assert.notDeepEqual(moved.p2, beforeDrag.p2);
        assert.deepEqual(moved.p1, beforeDrag.p1);
        assert.deepEqual(moved.leaderRoutes[0].target, beforeDrag.leaderRoutes[0].target);
        assert.equal(await input.count(), 0, 'central-handle drag does not open text input');
        await page.evaluate(() => selectionQA.undo(selectionQA.state)); assert.deepEqual(await object(), beforeDrag);
        await page.evaluate(() => selectionQA.redo(selectionQA.state)); assert.deepEqual(await object(), moved);
        const saved = await page.evaluate(() => selectionQA.serialize(selectionQA.state.get()));
        await page.evaluate(saved => selectionQA.applyLoaded(selectionQA.state, saved), saved);
        assert.deepEqual(await object(), moved);

        // A rapid double-click from an unselected label also means select, then
        // inline edit. It must not jump straight to detailed formatting.
        await load(); let p = await glyph(); await page.mouse.dblclick(p.x, p.y);
        await input.waitFor({ state: 'visible' });
        assert.equal(await page.locator('.unified-text-editor').count(), 0);
        await page.screenshot({ path: path.join(dir, 'inline.png') });
        await input.press('Escape');
        // Keep the existing Pro context-menu detailed-edit entry.
        p = await glyph(); await page.mouse.click(p.x, p.y, { button: 'right' });
        await page.locator('.text-ctx-menu').getByRole('button', { name: '텍스트 상세 편집', exact: true }).click();
        await page.locator('.unified-text-editor').waitFor({ state: 'visible' });
        assert.equal(await page.locator('.unified-text-editor textarea').inputValue(), '전류 센서');
        await page.locator('.unified-text-editor textarea').press('Escape');

        await load({ leaderRoutes: undefined, aiAutoLabel: undefined, aiParentImageId: undefined, labelTypographyVersion: undefined, elbow: { x: 35, y: 35 } });
        await textClick(); assert.equal(await input.count(), 0, 'manual labeler also selects first');
        await textClick(); await input.waitFor({ state: 'visible' }); await input.press('Escape');
        await page.keyboard.press('Enter'); await input.waitFor({ state: 'visible' }); await input.press('Escape');
        // The same compact entry remains available in Lite, and for the native
        // text/formula objects used by AI labels. Protection and selection govern it.
        await showProperties();
        await page.evaluate(() => { document.documentElement.dataset.mode = 'lite'; selectionQA.state.update(s => { s.selectedIds = ['label']; }); });
        assert.equal(await detailIcon.count(), 1);
        await detailIcon.click(); await page.locator('.unified-text-editor').waitFor({ state: 'visible' });
        await page.locator('.unified-text-editor textarea').press('Escape');
        await page.evaluate(() => { document.documentElement.dataset.mode = 'pro'; selectionQA.state.update(s => { s.selectedIds = ['label']; }); });
        await load({ type: 'text', x: 62, y: 40, fontSize: 3.7 });
        await page.evaluate(() => selectionQA.state.update(s => { s.selectedIds = ['label']; }));
        await showProperties();
        assert.equal(await detailIcon.count(), 1);
        await detailIcon.click(); await page.locator('.unified-text-editor').waitFor({ state: 'visible' });
        await page.locator('.unified-text-editor textarea').press('Escape');
        await load({ type: 'formula', x: 62, y: 40, fontSize: 3.7, text: 'x', latex: 'x' });
        await page.evaluate(() => selectionQA.state.update(s => { s.selectedIds = ['label']; }));
        await showProperties();
        assert.equal(await detailIcon.count(), 1);
        await detailIcon.click(); await page.locator('.unified-text-editor').waitFor({ state: 'visible' });
        await page.locator('.unified-text-editor textarea').press('Escape');
        await page.evaluate(() => selectionQA.state.update(s => { s.objects[0].locked = true; }));
        await showProperties();
        assert.equal(await detailIcon.isDisabled(), true);
        await page.evaluate(() => selectionQA.state.update(s => { s.selectedIds = []; }));
        assert.equal(await detailIcon.count(), 0, 'no detailed-edit icon without a selected object');
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ syntheticFixture: true, firstClick: 'select', secondClick: 'inline', handleCenter: center, beforeDrag, moved, saved, errors }, null, 2));
        await page.close();
      }
    } finally { await browser.close(); }
  });
}
