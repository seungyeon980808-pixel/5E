// Fixed graph source: b1846e849656076b1c0c5da2f82abffff3813eb1:tests/test-graph-extension-ui-browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium, webkit } = require('./helpers/graph-source-signals.cjs').loadPlaywright();
const output = path.resolve(process.env.EVIDENCE_DIR || '.omo/evidence/graph-extension-ui');
const version = '?v=1.7.0-four-session-integration';

async function install(page, logarithmic = false) {
  await page.evaluate(async ({ logarithmic, version }) => {
    const { state } = await import('/js/state.js' + version);
    const { buildNativeGraph } = await import('/js/graph/native-graph.js' + version);
    const axis = (min, max, title, scale = 'linear') => ({ min, max, title, scale, step: 1, unit: '', ticks: [] });
    const series = logarithmic
      ? [{ id: 'upper', kind: 'points', axis: 'y2', certainty: 'exact', coordinateSpace: 'data', points: [{ x: 1, y: 1 }, { x: 100, y: 100 }], curveStyle: 'straight' }]
      : [
          { id: 'upper', kind: 'expression', axis: 'y', certainty: 'exact', coordinateSpace: 'data', expression: '2*x', domain: { min: 0, max: 4 } },
          { id: 'lower', kind: 'expression', axis: 'y', certainty: 'exact', coordinateSpace: 'data', expression: 'x', domain: { min: 0, max: 4 } },
          { id: 'scatter', kind: 'points', axis: 'y', certainty: 'exact', coordinateSpace: 'data', points: [{ x: 1, y: 7 }, { x: 3, y: 9 }], lineVisible: false, markerShape: 'circle', markerSize: .8 },
          { id: 'bars', kind: 'bar', axis: 'y', certainty: 'exact', coordinateSpace: 'data', items: [{ value: 2, label: 'A', fillLevel: 100 }, { value: 3, label: 'B', fillLevel: 200 }], base: 0 }
        ];
    const regions = logarithmic
      ? [
          { id: 'log-band', kind: 'x-band', axis: 'y2', coordinateSpace: 'normalized', from: .25, to: .45, level: 200 },
          { id: 'caption', kind: 'rect', axis: 'y2', coordinateSpace: 'normalized', xMin: -.08, xMax: .1, yMin: .6, yMax: .8, level: 210 }
        ]
      : [
          { id: 'x', kind: 'x-band', axis: 'y', coordinateSpace: 'data', from: .5, to: .9, level: 200 },
          { id: 'y', kind: 'y-band', axis: 'y', coordinateSpace: 'data', from: 7, to: 8, level: 210 },
          { id: 'rect', kind: 'rect', axis: 'y', coordinateSpace: 'data', xMin: 2, xMax: 2.5, yMin: 4, yMax: 5, level: 220 },
          { id: 'poly', kind: 'polygon', axis: 'y', coordinateSpace: 'data', points: [{ x: 2.5, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }], level: 180 },
          { id: 'between', kind: 'between', axis: 'y', coordinateSpace: 'data', from: 1, to: 2, upperSeriesId: 'upper', lowerSeriesId: 'lower', level: 230 }
        ];
    const plan = {
      schema: '5e.graph-reconstruction/v1',
      source: { id: 'extension-ui', hash: 'synthetic', width: 400, height: 300, plotBox: { x: 40, y: 20, w: 320, h: 240 } },
      axes: logarithmic ? { x: axis(1, 100, '시간', 'log'), y: axis(1, 100, '크기', 'log'), y2: axis(1, 1000, '오른쪽', 'log') } : { x: axis(0, 4, '시간'), y: axis(0, 10, '크기') },
      series, regions, annotations: [], review: []
    };
    let n = 0;
    const built = buildNativeGraph(plan, { box: { x: -40, y: -25, w: 80, h: 50 }, layerId: 1, nextId: () => n++ === 0 ? 'extension-plane' : `extension-${n}` });
    if (!built.ok) throw Error(built.error);
    state.update(s => {
      s.objects = [...built.objects.slice(1), built.objects[0]]; s.objects.forEach((o, i) => { o.order = i; });
      s.groups = built.groups; s.undoStack = []; s.redoStack = []; s.selectedIds = []; s.activeTool = 'V'; s.activeLayerId = 1;
    });
  }, { logarithmic, version });
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const reports = [];
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1080 } });
    const errors = []; const scenarios = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(() => { localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true'); localStorage.setItem('5e.tutorial.bannerSeen', 'true'); localStorage.setItem('5e.preview:5e.mode', 'pro'); });
    // Undo and project files use JSON; compare every persisted field, excluding
    // transient undefined properties which that existing format does not store.
    const snap = () => page.evaluate(async version => JSON.parse(JSON.stringify((await import('/js/state.js' + version)).state.get().objects)), version);
    const open = () => page.evaluate(async version => (await import('/js/graph/graph-modal.js' + version)).openGraphModal('extension-plane'), version);
    const shoot = file => page.locator('.gm-modal').screenshot({ path: path.join(output, `${name}-${file}.png`) });
    const change = async (selector, value) => { await page.locator(selector).fill(String(value)); await page.locator(selector).dispatchEvent('change'); };
    const region = (objects, id) => objects.find(o => o.regionSpec?.id === id).regionSpec;
    const selectRegion = async index => { await page.locator('#gm-tab-annot-btn').click(); await page.locator(`[aria-label="영역 ${index} 화면에서 조절"]`).click(); };
    const drag = async (index, dx, dy, finish = true) => {
      const handle = page.locator(`#gm-preview [data-region-handle="${index}"]`); await handle.scrollIntoViewIfNeeded();
      const box = await handle.boundingBox(); assert(box);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 4 });
      if (finish) await page.mouse.up();
    };
    try {
      const url = (process.env.PREVIEW_URL || 'http://127.0.0.1:62759/') + '?mode=pro';
      // Capture the unchanged baseline with the very same native graph and viewport.
      if (name === 'chromium') {
        for (const file of ['preview/js/graph/graph-modal.js', 'preview/js/graph/graph-engine-controls.js', 'preview/css/style.css']) {
          const originalBody = execFileSync('git', ['show', `b1846e849656076b1c0c5da2f82abffff3813eb1:${file}`], { cwd: "/Users/parkseungyeon/.codex/worktrees/analyable-function/5E", encoding: 'utf8' });
          const body = originalBody.replace(/\?v=[^'"\s]+/g, "?v=1.7.0-four-session-integration");
          await page.route(`**/${file.replace(/^preview\//, '')}*`, route => route.fulfill({ body, contentType: file.endsWith('.css') ? 'text/css' : 'text/javascript' }));
        }
        await page.goto(url, { waitUntil: 'networkidle' }); await install(page); await open(); await shoot('before-coordinates');
        if (!(await page.locator('#gm-engine-controls').isVisible())) await page.locator('#gm-adv-open').press('Enter');
        await page.locator('#gm-engine-controls').scrollIntoViewIfNeeded(); await shoot('before-axis');
        await page.locator('#gm-tab-annot-btn').click(); await page.locator('#gm-display-list').scrollIntoViewIfNeeded(); await shoot('before-regions');
        await page.locator('#gm-cancel').click(); await page.unrouteAll();
      }
      await page.goto(url, { waitUntil: 'networkidle' }); await install(page);
      const before = await snap(); await open(); await shoot('after-coordinates');
      for (const id of ['gm-tab-coord-btn', 'gm-tab-func-btn', 'gm-tab-annot-btn', 'gm-exact-x-min', 'gm-exact-y-min', 'gm-ticktext-x']) assert.equal(await page.locator(`#${id}`).count(), 1);
      await page.locator('#gm-tab-func-btn').click(); assert.equal(await page.locator('#gm-expr').inputValue(), '2*x');
      await selectRegion(1); await page.locator('#gm-confirm').click(); assert.deepEqual(await snap(), before, 'Selecting a handle never mutates native data');
      scenarios.push('existing tabs/equation/tick inputs and exact no-op retained');

      await open(); await page.locator('#gm-adv-open').click(); await page.locator('#gm-engine-controls').scrollIntoViewIfNeeded();
      await page.locator('#gm-style-detail summary').click(); await change('#gm-engine-arrowScale', 123.456789); await shoot('after-axis');
      await page.locator('#gm-confirm').click();
      assert(Math.abs((await snap()).find(o => o.type === 'coordplane').graphStyle.arrowScale-1.235)<1e-12, 'Explicit percent input commits 123.5; the stored scale is 1.235');
      const roundedArrow = await snap(); await open(); await page.locator('#gm-confirm').click();
      assert.deepEqual(await snap(), roundedArrow, 'Reopening a rounded edit preserves every native field');
      await open(); await page.locator('#gm-adv-open').click(); await page.locator('#gm-style-detail summary').click(); await change('#gm-engine-arrowScale', 140);
      assert.equal(await page.locator('#gm-engine-arrowScale').inputValue(), '140');
      await page.locator('#gm-tab-func-btn').click(); await page.locator('#gm-chips [data-series-index="2"]').click();
      await page.locator('#gm-engine-marker').selectOption('cross'); await change('#gm-engine-marker-size', 1.6);
      await page.locator('#gm-styles [aria-label="일점쇄선"]').click(); await shoot('after-pattern'); await page.locator('#gm-confirm').click();
      let edited = await snap(); const scatter = edited.find(o => o.reconstruction?.seriesId === 'scatter');
      assert.equal(scatter.markerShape, 'cross'); assert.equal(scatter.markerSize, 1.6); assert.deepEqual(scatter.dashPattern, [2, .8, .3, .8]);
      assert.equal(edited.find(o => o.reconstruction?.seriesId === 'upper').expr, '2*x');
      scenarios.push('imported numbers retained on no-op; explicit numbers round; sliders and presets update only selected settings');

      await open(); await selectRegion(1); await drag(0, 35, 0, false); await page.keyboard.press('Escape'); await page.mouse.up();
      assert(await page.locator('.gm-modal').isVisible(), 'Escape cancels the active drag without closing the modal');
      await page.locator('#gm-confirm').click(); assert.deepEqual(await snap(), edited, 'Escape restores the exact pre-drag data');
      await open(); await selectRegion(1); await drag(0, 35, 0); await page.locator('#gm-cancel').click(); assert.deepEqual(await snap(), edited);
      await open(); await selectRegion(1); await drag(0, 30, 0, false);
      await page.locator('#gm-preview').dispatchEvent('pointercancel', { pointerId: 1, bubbles: true }); await page.mouse.up();
      await page.locator('#gm-confirm').click(); assert.deepEqual(await snap(), edited);
      scenarios.push('Escape/pointer cancellation and modal Cancel preserve committed data');

      await open(); await selectRegion(1); await drag(0, 15, 0);
      await selectRegion(2); await drag(0, 0, 14);
      await selectRegion(3); await drag(0, 14, 14);
      await selectRegion(4); await drag(0, 14, 14);
      await selectRegion(5); await drag(0, 14, 0); await shoot('after-regions'); await page.locator('#gm-confirm').click();
      const dragged = await snap();
      assert(region(dragged, 'x').from > region(edited, 'x').from);
      assert(region(dragged, 'y').from < region(edited, 'y').from);
      assert(region(dragged, 'rect').xMin > region(edited, 'rect').xMin); assert(region(dragged, 'rect').yMin < region(edited, 'rect').yMin);
      assert(region(dragged, 'poly').points[0].x > region(edited, 'poly').points[0].x);
      assert(region(dragged, 'between').from > region(edited, 'between').from);
      for (const o of edited.filter(o => o.sourceKind !== 'region')) assert.deepEqual(dragged.find(q => q.id === o.id), o, 'Region dragging must not alter the original graph/equation/axis');
      await page.evaluate(async version => { const { state } = await import('/js/state.js' + version); (await import('/js/transform.js' + version)).undo(state); }, version);
      assert.deepEqual(await snap(), edited);
      await page.evaluate(async version => { const { state } = await import('/js/state.js' + version); (await import('/js/transform.js' + version)).redo(state); }, version);
      assert.deepEqual(await snap(), dragged);
      scenarios.push('all five highlight types drag correctly; Apply is one undoable edit');

      await open(); await page.locator('#gm-tab-func-btn').click(); await page.locator('#gm-chips [data-series-index="3"]').click();
      await page.locator('#gm-engine-bar-details summary').click();
      await change('[aria-label="막대 1 회색 값"]', 145); await shoot('after-bars'); await page.locator('#gm-confirm').click();
      edited = await snap(); const bars = edited.find(o => o.sourceKind === 'bar');
      assert.equal(bars.barItems[0].fillLevel, 145); assert.equal(bars.barItems[1].fillLevel, 200); assert.deepEqual(bars.barItems.map(it => it.value), [2, 3]);
      const saved = await page.evaluate(async version => { const { state } = await import('/js/state.js' + version); const io = await import('/js/project-io.js' + version); const data = io.serialize(state.get()); io.applyLoaded(state, structuredClone(data)); return data; }, version);
      fs.writeFileSync(path.join(output, `${name}-editable.5e`), JSON.stringify(saved, null, 2));
      await open(); await page.locator('#gm-confirm').click();
      for (const o of edited) { const actual = (await snap()).find(a => a.id === o.id); for (const key of Object.keys(o)) assert.deepEqual(actual[key], o[key], `saved ${o.id}.${key}`); }
      scenarios.push('individual bar tone preserves values; all edits survive save/reopen');

      await install(page, true); const logBefore = await snap(); await open(); await selectRegion(1); await drag(0, 20, 0);
      await page.locator('#gm-confirm').click(); const logAfter = await snap();
      assert(region(logAfter, 'log-band').from > .25); assert(region(logAfter, 'log-band').from < .45);
      assert.equal(region(logAfter, 'log-band').coordinateSpace, 'normalized'); assert.equal(region(logAfter, 'log-band').axis, 'y2');
      assert.deepEqual(logAfter.find(o => o.type === 'coordplane'), logBefore.find(o => o.type === 'coordplane'));
      await open(); await selectRegion(2); const handle = page.locator('#gm-preview [data-region-handle="0"]'); await handle.focus(); await page.keyboard.press('ArrowLeft');
      await page.locator('#gm-confirm').click(); assert(region(await snap(), 'caption').xMin < -.08, 'A caption can remain outside the plot but inside the source image');
      scenarios.push('log/right axes and normalized source backgrounds retain coordinate space; keyboard handles work');
      await install(page); const responsiveBefore = await snap();
      for (const width of [980, 720]) {
        await page.setViewportSize({ width, height: 1080 }); await open(); await selectRegion(1);
        const overflow = await page.evaluate(() => { const modal = document.querySelector('.gm-modal'), panel = modal.querySelector('.gm-right'); return { modal: modal.scrollWidth > modal.clientWidth + 1, panel: panel.scrollWidth > panel.clientWidth + 1 }; });
        assert.deepEqual(overflow, { modal: false, panel: false }, `No horizontal overflow at ${width}px`);
        await shoot(`responsive-${width}`); await page.locator('#gm-cancel').click(); assert.deepEqual(await snap(), responsiveBefore);
      }
      await open(); await page.keyboard.press('Escape'); assert.equal(await page.locator('.gm-modal').isVisible(), false);
      assert.deepEqual(await snap(), responsiveBefore); scenarios.push('narrow screens do not overflow; normal Escape still closes the modal');
      assert.deepEqual(errors, []); reports.push({ browser: name, pass: true, scenarios, providerCalls: 0 });
    } catch (e) { await page.screenshot({ path: path.join(output, `${name}-failure.png`) }); throw e; }
    finally { await browser.close(); }
  }
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(reports, null, 2)); console.log(JSON.stringify(reports));
})().catch(e => { console.error(e); process.exitCode = 1; });
