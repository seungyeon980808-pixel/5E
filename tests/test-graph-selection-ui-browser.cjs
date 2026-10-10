// Fixed graph source: b1846e849656076b1c0c5da2f82abffff3813eb1:tests/test-graph-selection-ui-browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('./helpers/graph-source-signals.cjs').loadPlaywright();
const output = path.resolve(process.env.EVIDENCE_DIR || '.omo/evidence/graph-selection-ui');
const version = '?v=1.7.0-four-session-integration';

async function install(page) {
  await page.evaluate(async version => {
    const { state } = await import('/js/state.js' + version);
    const { buildNativeGraph } = await import('/js/graph/native-graph.js' + version);
    const axis = (title, max) => ({ min: 0, max, title, scale: 'linear', step: 1, unit: '', ticks: [] });
    const plan = {
      schema: '5e.graph-reconstruction/v1',
      source: { id: 'selection-ui', hash: 'synthetic', width: 400, height: 300, plotBox: { x: 40, y: 20, w: 320, h: 240 } },
      axes: { x: axis('시간', 4), y: axis('크기', 10) },
      series: [
        { id: 'upper', kind: 'expression', axis: 'y', certainty: 'exact', coordinateSpace: 'data', expression: '2*x', domain: { min: 0, max: 4 }, dashPattern: [2, .8, .3, .8] },
        { id: 'lower', kind: 'expression', axis: 'y', certainty: 'exact', coordinateSpace: 'data', expression: 'x', domain: { min: 0, max: 4 } }
      ],
      annotations: [
        { id: 'up', kind: 'arrow', text: '', x: 2, y: 5, to: { x: 2, y: 7 }, axis: 'y', orientation: 'horizontal' },
        { id: 'down', kind: 'arrow', text: '', x: 2, y: 5, to: { x: 2, y: 3 }, axis: 'y', orientation: 'horizontal' },
        { id: 'caption', kind: 'text', text: '진폭', x: 1, y: 8, size: 3, axis: 'y', orientation: 'horizontal', seriesId: 'upper', anchorX: 1 },
        { id: 'guide', kind: 'guide', text: '', x: 2, y: 3, axis: 'y', orientation: 'horizontal' }
      ], regions: [], review: []
    };
    let n = 0;
    const built = buildNativeGraph(plan, { box: { x: -40, y: -25, w: 80, h: 50 }, layerId: 1, nextId: () => n++ === 0 ? 'selection-plane' : `selection-${n}` });
    if (!built.ok) throw Error(built.error);
    state.update(s => { s.objects = [...built.objects.slice(1), built.objects[0]]; s.objects.forEach((o, i) => o.order = i); s.groups = built.groups; s.selectedIds = []; s.undoStack = []; s.redoStack = []; s.activeTool = 'V'; s.activeLayerId = 1; });
  }, version);
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const reports = [];
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1080 } });
    const errors = [], scenarios = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(() => { localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true'); localStorage.setItem('5e.tutorial.bannerSeen', 'true'); localStorage.setItem('5e.preview:5e.mode', 'pro'); });
    const snap = () => page.evaluate(async version => JSON.parse(JSON.stringify((await import('/js/state.js' + version)).state.get().objects)), version);
    const open = () => page.evaluate(async version => (await import('/js/graph/graph-modal.js' + version)).openGraphModal('selection-plane'), version);
    const select = i => page.locator(`[aria-label="표시 ${i} 선택"]`).click();
    const planeOf = objects => objects.find(o => o.type === 'coordplane');
    const curveOf = objects => objects.find(o => o.reconstruction?.seriesId === 'upper');
    const shoot = suffix => page.locator('.gm-modal').screenshot({ path: path.join(output, `${name}-${suffix}.png`) });
    const change = async (id, value, event = 'change') => { await page.locator(id).fill(String(value)); await page.locator(id).dispatchEvent(event); };
    try {
      await page.goto((process.env.PREVIEW_URL || 'http://127.0.0.1:62759/') + '?mode=pro', { waitUntil: 'networkidle' });
      await install(page); const before = await snap(); await open();
      const preview = await page.locator('.gm-left').boundingBox(), controls = await page.locator('.gm-right').boundingBox();
      assert(preview.x + preview.width <= controls.x, 'Graph is left of controls');
      assert.equal(await page.locator('.gm-body > :first-child #gm-preview').count(), 1, 'DOM and visual reading order agree');
      await page.locator('#gm-adv-open').click(); await shoot('advanced');
      const sizes = await page.evaluate(() => ['#gm-axis-x-mode', '#gm-axis-x-fraction', '#gm-label-weight', '#gm-axisscale'].map(id => { const el = document.querySelector(id), c = getComputedStyle(el); return { id, size: parseFloat(c.fontSize), radius: c.borderRadius, width: el.getBoundingClientRect().width }; }));
      assert(sizes.every(s => s.size <= 13.5)); assert(sizes.slice(0, 3).every(s => s.radius !== '0px')); assert(sizes[2].width <= 90);
      await page.locator('#gm-adv-open').click(); assert.equal(await page.locator('#gm-adv-panel').isVisible(), false);
      await page.locator('#gm-tab-func-btn').click(); assert.equal(await page.locator('#gm-expr').inputValue(), '2*x');
      assert.equal(await page.locator('#gm-styles button').count(), 6); assert.equal(await page.locator('[aria-label="추가 점선 패턴 견본"]').count(), 0);
      assert.equal(await page.locator('#gm-styles [aria-pressed="true"]').getAttribute('aria-label'), '일점쇄선');
      await shoot('line'); await page.locator('#gm-confirm').click(); assert.deepEqual(await snap(), before, 'Opening old mixed style fields preserves every native field');
      scenarios.push('left graph/right controls; compact advanced inputs; effective preset and exact no-op');

      await open(); await page.locator('#gm-tab-func-btn').click();
      await page.locator('#gm-styles [aria-label="실선"]').click(); await page.locator('#gm-confirm').click();
      let curve = curveOf(await snap()); assert.equal(curve.dashPattern, undefined); assert.equal(curve.dashLength, 0); assert.equal(curve.dashGap, 0);
      for (const label of ['촘촘한 점선', '일점쇄선', '이점쇄선']) {
        await open(); await page.locator('#gm-tab-func-btn').click(); await page.locator(`#gm-styles [aria-label="${label}"]`).click();
        assert.equal(await page.locator('#gm-styles [aria-pressed="true"]').getAttribute('aria-label'), label);
        await page.locator('#gm-confirm').click(); curve = curveOf(await snap());
        if (label === '촘촘한 점선') { assert.equal(curve.dashPattern, undefined); assert.equal(curve.dashLength, .42); }
        else assert.deepEqual(curve.dashPattern, label === '일점쇄선' ? [2, .8, .3, .8] : [2, .8, .3, .8, .3, .8]);
      }
      await open(); await page.locator('#gm-tab-func-btn').click(); await page.locator('#gm-line-detail summary').click();
      await change('#gm-custom-dash', 3.123456789, 'input'); await change('#gm-custom-gap', 1, 'input');
      assert.equal(await page.locator('#gm-engine-dash-pattern').inputValue(), '');
      await change('#gm-engine-dash-pattern', '1.7, .6, .25, .4'); await page.locator('#gm-confirm').click();
      const custom = curveOf(await snap()); assert.deepEqual(custom.dashPattern, [1.7, .6, .25, .4]); assert.equal(custom.dashLength, 3.1, 'Explicit number edits commit one decimal; pattern text remains exact');
      await open(); await page.locator('#gm-confirm').click(); assert.deepEqual(curveOf(await snap()), custom);
      scenarios.push('presets replace overrides; simple lengths clear complex pattern; arbitrary saved pattern remains exact');

      await install(page); const original = await snap(); await open(); await page.locator('#gm-tab-annot-btn').click();
      assert.equal(await page.locator('.gm-annotation-editor:visible').count(), 0); await shoot('annotation-list');
      await select(1); assert.equal(await page.locator('.gm-annotation-editor:visible').count(), 1);
      assert.equal(await page.locator('[data-annotation-selection="up"]').count(), 1);
      await page.locator('.gm-annotation-editor:visible summary').click();
      await select(2); assert.equal(await page.locator('.gm-annotation-editor:visible').count(), 1);
      assert.equal(await page.locator('[aria-label="표시 1 x"]').isVisible(), false);
      await select(3); const label = page.locator('#gm-preview [data-graph-annotation="caption"]');
      await label.click(); assert.equal(await page.locator('[aria-label="표시 3 선택"]').getAttribute('aria-expanded'), 'true');
      const arrowMiddle = await page.locator('#gm-preview [data-graph-annotation-shape="up"]:not([data-annotation-hit])').first().evaluate(el => {
        const box=el.getBBox(),q=el.ownerSVGElement.createSVGPoint();q.x=box.x+box.width/2;q.y=box.y+box.height/2;
        const screen=q.matrixTransform(el.getScreenCTM());return {x:screen.x,y:screen.y};
      });
      await page.mouse.click(arrowMiddle.x + 3, arrowMiddle.y);
      assert.equal(await page.locator('[aria-label="표시 1 선택"]').getAttribute('aria-expanded'), 'true');
      const down = page.locator('#gm-preview [data-graph-annotation-shape="down"]:not([data-annotation-hit])').first(); await down.focus(); await down.press('Enter');
      assert.equal(await page.locator('[aria-label="표시 2 선택"]').getAttribute('aria-expanded'), 'true');
      assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('data-graph-annotation-shape')), 'down');
      await shoot('selected-arrow'); await page.locator('#gm-confirm').click(); assert.deepEqual(await snap(), original, 'List, mouse and keyboard selection never changes coordinates, anchors or undo data');
      scenarios.push('one selected editor; graph/list/keyboard selection; selection leaves every native field unchanged');

      await open(); await page.locator('#gm-tab-annot-btn').click(); await select(3); await change('[aria-label="표시 3 글자"]', '변경된 진폭');
      await page.locator('#gm-cancel').click(); assert.deepEqual(await snap(), original);
      await open(); await page.locator('#gm-tab-annot-btn').click(); assert.equal(await page.locator('#gm-typed-properties details[open]').count(), 0); await select(1); await page.locator('.gm-annotation-editor:visible summary').click();
      await change('[aria-label="표시 1 끝 y"]', 7.123456789); await select(4); await page.locator('[aria-label="표시 4 삭제"]').click();
      assert.equal(await page.locator('.gm-annotation-editor:visible').count(), 0); await page.locator('#gm-confirm').click();
      const edited = await snap(); assert.equal(planeOf(edited).graphAnnotations[0].to.y, 7.1, 'Explicit endpoint number edit commits one decimal'); assert.equal(planeOf(edited).graphAnnotations.length, 3);
      assert.deepEqual(planeOf(edited).graphAnnotations[1], planeOf(original).graphAnnotations[1]); assert.deepEqual(planeOf(edited).graphAnnotations[2], planeOf(original).graphAnnotations[2]);
      await page.evaluate(async version => { const { state } = await import('/js/state.js' + version); const { undo, redo } = await import('/js/transform.js' + version); undo(state); redo(state); }, version);
      assert.deepEqual(await snap(), edited);
      await page.evaluate(async version => { const { state } = await import('/js/state.js' + version), io = await import('/js/project-io.js' + version); const saved = io.serialize(state.get()); state.update(s => { s.objects = []; }); io.applyLoaded(state, saved); }, version);
      await open(); await page.locator('#gm-confirm').click(); assert.deepEqual(planeOf(await snap()).graphAnnotations, planeOf(edited).graphAnnotations);
      scenarios.push('cancel retains draft isolation; rounded endpoint edits/deletion affect only target; undo/redo/save/reopen');

      await install(page); await open(); await page.locator('#gm-tab-annot-btn').click();
      const text = page.locator('#gm-preview [data-graph-annotation="caption"]'), box = await text.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 24, box.y + box.height / 2 + 12, { steps: 3 }); await page.mouse.up();
      assert.equal(await page.locator('[aria-label="표시 3 선택"]').getAttribute('aria-expanded'), 'true'); await page.locator('#gm-confirm').click();
      assert.notDeepEqual(planeOf(await snap()).graphAnnotations[2], planeOf(original).graphAnnotations[2]);
      assert.deepEqual(planeOf(await snap()).graphAnnotations[0], planeOf(original).graphAnnotations[0]);
      scenarios.push('existing direct drag selects target and preserves other annotations');

      for (const width of [980, 720, 480]) {
        await page.setViewportSize({ width, height: 1080 }); await open();
        const a = await page.locator('.gm-left').boundingBox(), b = await page.locator('.gm-right').boundingBox();
        if (width > 780) assert(a.x + a.width <= b.x); else assert(a.y + a.height <= b.y);
        await page.locator('#gm-adv-open').click(); await page.locator('#gm-axis-x-mode').scrollIntoViewIfNeeded();
        const overflow = await page.locator('.gm-right').evaluate(el => el.scrollWidth - el.clientWidth);
        assert(overflow <= 1, `Advanced panel has no horizontal overflow at ${width}px: ${overflow}`);
        await page.locator('#gm-tab-func-btn').click(); await page.locator('#gm-line-detail summary').click(); await page.locator('#gm-engine-dash-pattern').scrollIntoViewIfNeeded();
        assert(await page.locator('#gm-engine-dash-pattern').isVisible());
        await shoot(`width-${width}`); await page.locator('#gm-cancel').click();
      }
      scenarios.push('980/720/480px layout keeps controls usable and advanced panel inside bounds');
      assert.deepEqual(errors, []); reports.push({ browser: name, pass: true, providerCalls: 0, scenarios });
    } catch (error) {
      await page.screenshot({ path: path.join(output, `${name}-failure.png`) });
      fs.writeFileSync(path.join(output, `${name}-failure.json`), JSON.stringify({ error: String(error.stack), errors, scenarios }, null, 2)); throw error;
    } finally { await browser.close(); }
  }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(reports, null, 2)); console.log(JSON.stringify(reports));
})().catch(error => { console.error(error); process.exitCode = 1; });
