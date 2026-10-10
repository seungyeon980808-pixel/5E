// Fixed graph source: b1846e849656076b1c0c5da2f82abffff3813eb1:tests/test-graph-boxed-axis-render.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('./helpers/graph-source-signals.cjs').loadPlaywright();
const out = process.env.EVIDENCE_DIR;
assert(out, 'EVIDENCE_DIR required');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
    const base = (process.env.PREVIEW_URL || 'http://127.0.0.1:62759/').replace(/\/$/, '');
    await page.route('**/__box_probe', r => r.fulfill({ contentType: 'text/html', body: '<svg id="s" width="1000" height="600" viewBox="-10 -10 150 110"></svg>' }));
    await page.goto(`${base}/__box_probe`);
    const result = await page.evaluate(async () => {
      const { renderCoordplane } = await import('/js/render/coordplane.js?v=1.7.0-four-session-integration');
      const p = { type: 'coordplane', x: 10, y: 20, w: 100, h: 60, xMin: 0, xMax: 4, yMin: 0, yMax: 4, gridStepX: 1, gridStepY: 1, strokeWidth: .2, axisVariant: 'box', showAxisLines: true, showTicks: true, showTickLabels: true };
      const lines = g => [...g.querySelectorAll('line')].map(l => ({ xy: ['x1', 'y1', 'x2', 'y2'].map(a => +l.getAttribute(a)), sw: +l.getAttribute('stroke-width'), dash: l.getAttribute('stroke-dasharray'), stroke: l.getAttribute('stroke') }));
      const axes = g => lines(g).filter(l => l.sw === .2).map(l => l.xy);
      const ticks = g => [...g.querySelectorAll('[data-tick]')].map(n => n.outerHTML);
      const marks = g => lines(g).filter(l => Math.abs(l.sw - .16) < 1e-8);
      const frame = renderCoordplane(p);
      const interior = { x: { mode: 'fraction', value: .5 }, y: { mode: 'fraction', value: .25 } };
      const mid = renderCoordplane({ ...p, axisPlacement: interior, guideStyle: { dashLength: 1, dashGap: 2 }, annGuides: [{ x: 3, y: 3 }], graphAnnotations: [{ id: 'h', kind: 'guide', orientation: 'horizontal', x: 3, y: 3 }, { id: 'v', kind: 'guide', orientation: 'vertical', x: 3, y: 3 }, { id: 'endpoint', kind: 'guide', x: 3, y: 3, to: { x: 4, y: 1 }, strokeWidth: .7, strokeLevel: 150, dashLength: 0 }] });
      document.querySelector('#s').append(mid);
      const guides = Object.fromEntries([...mid.querySelectorAll('[data-graph-annotation-kind="guide"]')].map(l => [l.getAttribute('data-graph-annotation-shape'), { xy: ['x1', 'y1', 'x2', 'y2'].map(a => +l.getAttribute(a)), sw: +l.getAttribute('stroke-width'), dash: l.getAttribute('stroke-dasharray'), stroke: l.getAttribute('stroke') }]));
      const gridObj = { ...p, axisPlacement: interior, showTicks: false, showTickLabels: false, showGrid: true, gridToData: true, reconstruction: { preserveAxes: true }, gridStyle: { strokeWidth: .11, strokeLevel: 0, dashLength: 0, dashGap: 0 } };
      const grid = renderCoordplane(gridObj);
      const gridLines = g => lines(g).filter(l => l.sw === .11);
      const cross = { ...p, axisVariant: 'cross', xMin: -2, xMax: 2, yMin: -2, yMax: 2 };
      const log = renderCoordplane({ ...p, xMin: 1, xMax: 1000, yMin: 1, yMax: 1000, xScale: 'log', yScale: 'log' });
      const horizontalOnly = gridLines(renderCoordplane({ ...gridObj, showGridX: false }));
      const verticalOnly = gridLines(renderCoordplane({ ...gridObj, showGridY: false }));
      const dashes = gridLines(renderCoordplane({ ...gridObj, gridStyle: { strokeWidth: .11, dashLength: .4, dashGap: .6 } }));
      const noAxes = renderCoordplane({ ...gridObj, showAxisLines: false });
      const corner = renderCoordplane({ ...p, axisPlacement: { x: { mode: 'fraction', value: 1 }, y: { mode: 'fraction', value: 1 } } });
      const crossGrid = gridLines(renderCoordplane({ ...gridObj, axisVariant: 'cross', axisArrowX: false, axisArrowY: false }));
      return { cornerAxes: axes(corner), crossGrid, gridNoAxes: gridLines(noAxes), frameAxes: axes(frame), midAxes: axes(mid), ticksEqual: JSON.stringify(ticks(frame)) === JSON.stringify(ticks(mid)), marksEqual: JSON.stringify(marks(frame)) === JSON.stringify(marks(mid)), guides, annGuides: lines(mid).filter(l => l.dash === '1 2').map(l => l.xy), grid: gridLines(grid), horizontalOnly, verticalOnly, dashes, noAxes: axes(noAxes), zeroBoxSame: frame.outerHTML === renderCoordplane({ ...p, axisPlacement: { x: { mode: 'zero' }, y: { mode: 'zero' } } }).outerHTML, crossZeroSame: renderCoordplane(cross).outerHTML === renderCoordplane({ ...cross, axisPlacement: { x: { mode: 'zero' }, y: { mode: 'zero' } } }).outerHTML, crossAxes: axes(renderCoordplane({ ...cross, axisArrowX: false, axisArrowY: false })), logAxes: axes(log), logHeads: log.querySelectorAll('path,polygon').length, topRight: marks(renderCoordplane({ ...p, axisPlacement: interior, boxTickTop: true, boxTickRight: true })).length };
    });
    fs.writeFileSync(path.join(out, 'boxed-axis-results.json'), JSON.stringify(result, null, 2));
    await page.screenshot({ path: path.join(out, 'boxed-axis.png') });
    const borders = [[10, 80, 110, 80], [10, 80, 10, 20], [10, 20, 110, 20], [110, 80, 110, 20]];
    assert.deepEqual(result.frameAxes, borders);
    assert.equal(result.midAxes.length, 6);
    for (const xy of [...borders, [10, 50, 110, 50], [35, 80, 35, 20]]) assert(result.midAxes.some(l => JSON.stringify(l) === JSON.stringify(xy)), `Missing ${xy}`);
    assert(result.ticksEqual && result.marksEqual && result.zeroBoxSame && result.crossZeroSame);
    assert.deepEqual(result.crossAxes, [[10, 50, 110, 50], [60, 80, 60, 20]]);
    assert.deepEqual(result.logAxes, borders); assert.equal(result.logHeads, 0);
    assert.deepEqual(result.guides.h.xy, [85, 35, 35, 35]);
    assert.deepEqual(result.guides.v.xy, [85, 35, 85, 50]);
    assert.deepEqual(result.guides.endpoint, { xy: [85, 35, 110, 65], sw: .7, dash: null, stroke: '#969696' });
    assert(result.annGuides.some(l => JSON.stringify(l) === JSON.stringify([85, 35, 85, 50])));
    assert(result.annGuides.some(l => JSON.stringify(l) === JSON.stringify([85, 35, 35, 35])));
    assert.equal(result.grid.length, 4);
    for (const l of result.grid) {
      const [x1, y1, x2, y2] = l.xy;
      assert.equal(l.dash, null);
      assert(x1 === x2 ? y1 === 20 && y2 === 80 && x1 !== 35 : x1 === 10 && x2 === 110 && y1 !== 50);
      assert(!borders.some(b => JSON.stringify(b) === JSON.stringify(l.xy)));
    }
    assert.equal(result.horizontalOnly.length, 2); assert(result.horizontalOnly.every(l => l.xy[1] === l.xy[3]));
    assert.equal(result.verticalOnly.length, 2); assert(result.verticalOnly.every(l => l.xy[0] === l.xy[2]));
    assert(result.dashes.every(l => l.dash === '.4 .6' || l.dash === '0.4 0.6'));
    assert.equal(result.cornerAxes.length, 4);
    for (const b of borders) assert(result.cornerAxes.some(l => JSON.stringify(l) === JSON.stringify(b)));
    assert.equal(result.gridNoAxes.length, 10);
    assert.equal(result.crossGrid.length, 8);
    for (const l of result.crossGrid) assert(l.xy[0] === l.xy[2] ? l.xy[1] === 20 && l.xy[3] === 80 : l.xy[0] === 10 && l.xy[2] === 110);
    assert.deepEqual(result.noAxes, []); assert.equal(result.topRight, 12);
    console.log('boxed interior axes, edge ticks, full grids, guides, legacy cross/log PASS');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
