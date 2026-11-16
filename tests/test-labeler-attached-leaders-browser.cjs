// Fixed label source: 6e2c55012461859cdc8afb4d9596d3f08d5409b4; assertions and fixtures retained.
const { installLabelSourcePage, armSelection, selectionArrived } = require('./helpers/label-source-browser.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium, webkit } = require('playwright');

const root = path.resolve(__dirname, '..');
const evidenceRoot = process.env.EVIDENCE_DIR;
fs.mkdirSync(evidenceRoot, { recursive: true });
const evidence = process.env.EVIDENCE_DIR || fs.mkdtempSync(path.join(evidenceRoot, 'attachment-run-'));
let preview = process.env.PREVIEW_URL;
let server;
assert.ok(preview, 'A retained PREVIEW_URL is required');
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  test(`native AI leaders follow text boundaries through editing and export in ${name}`, { timeout: 90000 }, async () => {
    const dir = path.join(evidence, name);
    fs.mkdirSync(dir, { recursive: true });
    const browser = await engine.launch({ headless: true });
    let page;
    try {
      page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });await installLabelSourcePage(page);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true'));
      await page.goto(preview, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#canvas');
      await page.evaluate(async () => {
        const v = '?v=1.7.0-four-session-integration';
        const { state } = await import('/js/state.js' + v);
        const { createEditableImageLabelObjects } = await import('/js/ai-editable-image-labels.js' + v);
        const { measureLabelTypography } = await import('/js/ai-label-typography.js' + v);
        const { serialize, applyLoaded } = await import('/js/project-io.js' + v);
        const { worldToScreen } = await import('/js/viewport.js' + v);
        const { undo, redo } = await import('/js/transform.js' + v);
        const { buildExportSvg, rasterizeExportCanvas } = await import('/js/svg-export.js' + v);
        window.attachmentQA = { state, measureLabelTypography, serialize, applyLoaded, worldToScreen, undo, redo, buildExportSvg, rasterizeExportCanvas };
        const labels = [
          { id: 'resistor', text: '니크롬선 저항판', position: { x: .78, y: .72 }, anchor: { x: .47, y: .88 },
            leaderRoutes: [{ kind: 'straight', attachment: 'label', start: { x: .58, y: .86 }, target: { x: .47, y: .88 }, controls: [], end: 'none' }] },
          { id: 'sensor', text: '전류 센서', position: { x: .72, y: .47 }, anchor: { x: .35, y: .47 },
            leaderRoutes: [{ kind: 'straight', attachment: 'label', start: { x: .35, y: .47 }, target: { x: .35, y: .47 }, controls: [], end: 'none' }] },
          { id: 'curve', text: '전압 센서', position: { x: .24, y: .16 }, anchor: { x: .44, y: .28 },
            leaderRoutes: [{ kind: 'quadratic', attachment: 'label', start: { x: .40, y: .20 }, target: { x: .44, y: .28 }, controls: [{ x: .45, y: .12 }], end: 'circle' },
              { kind: 'straight', attachment: 'frame', start: { x: .1, y: .35 }, target: { x: .15, y: .5 }, controls: [], end: 'none' }] },
        ].map(label => ({ ...label, scope: 'general', mode: 'leader', contentMode: 'plain', typography: { role: 'text', bounds: { x: .05, y: .05, w: .1, h: .05 } } }));
        let index = 0;
        const objects = createEditableImageLabelObjects({ labels, image: { id: 'diagram', x: 0, y: 0, w: 100, h: 70 }, idFactory: () => labels[index++].id });
        applyLoaded(state, { version: '0.17', pages: [{ id: 'qa', objects, groups: [], artboard: { w: 220, h: 160 } }], activePageId: 'qa' });
        state.update(s => { s.activeTool = 'V'; s.selectedIds = []; s.layers = [{ id: 1, visible: true, name: 'QA' }]; s.activeLayerId = 1; s.viewBox = { x: 0, y: 0, w: 100, h: 70 }; s.undoStack = []; s.redoStack = []; });
        await document.fonts.ready;
      });
      const rendered = async () => {
        await page.waitForFunction(() => {
          const svg = document.querySelector('#canvas'), vb = attachmentQA.state.get().viewBox;
          return svg && Math.abs(svg.viewBox.baseVal.width - vb.w) < .0001 && Math.abs(svg.viewBox.baseVal.height - vb.h) < .0001;
        });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      };
      await rendered();
      const snapshot = id => page.evaluate(id => structuredClone(attachmentQA.state.get().objects.find(o => o.id === id)), id);
      const geometry = id => page.evaluate(id => {
        const o = attachmentQA.state.get().objects.find(o => o.id === id);
        const m = attachmentQA.measureLabelTypography(o);
        const group = document.querySelector(`#scene [data-id="${id}"]:not([data-ui])`);
        const paths = [...group.querySelectorAll('[data-label-leader-route]')];
        return { center: o.p2, rotation: o.textRotation || 0, half: { x: m.w / 2 + (o.labelGap || 0), y: m.h / 2 + (o.labelGap || 0) },
          routes: paths.map(p => { const start = p.getPointAtLength(0), length = p.getTotalLength(), midpoint = p.getPointAtLength(length / 2), target = p.getPointAtLength(length); return { d: p.getAttribute('d'), start: { x: start.x, y: start.y }, target: { x: target.x, y: target.y }, midpoint: { x: midpoint.x, y: midpoint.y }, length, stroke: p.getAttribute('stroke') }; }) };
      }, id);
      const attached = (g, index = 0) => {
        const { start } = g.routes[index], angle = g.rotation * Math.PI / 180;
        const wx = start.x - g.center.x, wy = start.y - g.center.y;
        const dx = Math.abs(Math.cos(angle) * wx + Math.sin(angle) * wy), dy = Math.abs(-Math.sin(angle) * wx + Math.cos(angle) * wy);
        assert.ok(dx <= g.half.x + .08 && dy <= g.half.y + .08, JSON.stringify(g));
        assert.ok(Math.min(Math.abs(dx - g.half.x), Math.abs(dy - g.half.y)) < .08, 'line must terminate on the native glyph block edge');
      };
      const initial = {};
      for (const id of ['resistor', 'sensor', 'curve']) { initial[id] = await geometry(id); attached(initial[id]); }
      assert.ok(initial.sensor.routes[0].length > 20, 'degenerate observed segment must connect the distant label to its preserved target');
      const before = await snapshot('resistor');
      const midpoint = initial.resistor.routes[0].midpoint;
      const screen = await page.evaluate(p => attachmentQA.worldToScreen(document.querySelector('#canvas'), attachmentQA.state.get().viewBox, p.x, p.y), midpoint);
      await page.mouse.click(screen.x, screen.y);
      assert.deepEqual(await page.evaluate(() => attachmentQA.state.get().selectedIds), ['resistor'], 'the actually rendered connecting line is pickable');
      const guide = await page.locator('[data-ui="labeler-selection"] [data-label-leader-route]').getAttribute('d');
      assert.equal(guide, initial.resistor.routes[0].d, 'selection guide matches the visible stroke');
      const handle = page.locator('[data-id="resistor"][data-handle="p1"]').last();
      const box = await handle.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - 45, box.y + box.height / 2 - 55, { steps: 8 });
      await page.mouse.up();
      const moved = await snapshot('resistor');
      assert.notDeepEqual(moved.p2, before.p2);
      assert.deepEqual(moved.leaderRoutes[0].target, before.leaderRoutes[0].target, 'moving text cannot move the indicated object');
      attached(await geometry('resistor'));
      await page.evaluate(() => attachmentQA.undo(attachmentQA.state));
      assert.deepEqual(await snapshot('resistor'), before);
      await page.evaluate(() => attachmentQA.redo(attachmentQA.state));
      assert.deepEqual(await snapshot('resistor'), moved);
      const stored = await page.evaluate(() => { attachmentQA.state.update(s => { const o = s.objects.find(o => o.id === 'resistor'); o.text = '저항판'; o.labelSize = 5; s.selectedIds = []; }); return attachmentQA.serialize(attachmentQA.state.get()); });
      attached(await geometry('resistor'));
      await page.evaluate(saved => attachmentQA.applyLoaded(attachmentQA.state, saved), stored);
      await rendered();
      attached(await geometry('resistor'));
      await page.evaluate(() => attachmentQA.state.update(s => { const o = s.objects.find(o => o.id === 'resistor'); o.textRotation = 35; o.labelGap = .7; s.selectedIds = []; }));
      const rotated = await geometry('resistor');
      attached(rotated);
      const rotatedScreen = await page.evaluate(p => attachmentQA.worldToScreen(document.querySelector('#canvas'), attachmentQA.state.get().viewBox, p.x, p.y), rotated.routes[0].midpoint);
      await page.mouse.click(rotatedScreen.x, rotatedScreen.y);
      assert.deepEqual(await page.evaluate(() => attachmentQA.state.get().selectedIds), ['resistor'], 'rotated leader with a label gap remains pickable');
      assert.equal(await page.locator('[data-ui="labeler-selection"] [data-label-leader-route]').getAttribute('d'), rotated.routes[0].d);
      await page.evaluate(() => attachmentQA.state.update(s => { const o = s.objects.find(o => o.id === 'resistor'); o.textRotation = 0; o.labelGap = 0; s.selectedIds = []; }));
      assert.deepEqual((await snapshot('curve')).leaderRoutes[1], { kind: 'straight', attachment: 'frame', start: { x: 10, y: 24.5 }, target: { x: 15, y: 35 }, controls: [], end: 'none' }, 'frame-attached geometry remains independent');
      const exportResult = await page.evaluate(async () => {
        const bounds = { x: 0, y: 0, w: 100, h: 70 }, state = attachmentQA.state.get();
        const svg = attachmentQA.buildExportSvg(state, bounds);
        const path = svg.querySelector('[data-id="sensor"] [data-label-leader-route]');
        const { canvas } = await attachmentQA.rasterizeExportCanvas(state, { dpi: 150, bounds });
        const ctx = canvas.getContext('2d');
        // The sensor line is horizontal and midway between the target and text.
        const cx = Math.round(50 / bounds.w * canvas.width), cy = Math.round(32.9 / bounds.h * canvas.height);
        const pixels = ctx.getImageData(cx - 2, cy - 2, 5, 5).data;
        let dark = 0;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 100 && pixels[i + 1] < 100 && pixels[i + 2] < 100 && pixels[i + 3] > 240) dark++;
        return { d: path?.getAttribute('d'), dark, png: canvas.toDataURL() };
      });
      assert.equal(exportResult.d, (await geometry('sensor')).routes[0].d, 'export shares the canvas leader geometry');
      assert.ok(exportResult.dark > 0, 'the connecting leader contains opaque dark pixels in the exported PNG');
      fs.writeFileSync(path.join(dir, 'leaders-export.png'), Buffer.from(exportResult.png.split(',')[1], 'base64'));
      await page.screenshot({ path: path.join(dir, 'leaders-canvas.png') });
      fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ initial, moved, rotated, stored, exportPath: exportResult.d, opaqueLeaderPixels: exportResult.dark, errors }, null, 2));
      assert.deepEqual(errors, []);
    } catch (error) {
      if (page) await page.screenshot({ path: path.join(dir, 'failure.png') });
      throw error;
    } finally { await browser.close(); }
  });
}
