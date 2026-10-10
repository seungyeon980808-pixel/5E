import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { matchSourceGrid } from '../js/graph/source-grid.js';

function fixture(xs = [30, 50, 70, 90], ys = [30, 50, 70, 90], color = [150, 150, 150], thickness = 1) {
  const width = 120, height = 120, data = new Uint8ClampedArray(width * height * 4).fill(255);
  const pixel = (x, y) => data.set([...color, 255], (y * width + x) * 4);
  for (const x of xs) for (let y = 10; y <= 110; y++) for (let k = 0; k < thickness; k++) pixel(x + k, y);
  for (const y of ys) for (let x = 10; x <= 110; x++) for (let k = 0; k < thickness; k++) pixel(x, y + k);
  const plan = { source: { width, height, plotBox: { x: 10, y: 10, w: 100, h: 100 } }, annotations: [], series: [{ id: 'untouched', points: [{ x: .2, y: .4 }] }] };
  return { plan, raster: { width, height, dataRGBA: data } };
}
const grid = fixture();
const snapshot = JSON.stringify(grid.plan);
const regular = matchSourceGrid(grid.plan, grid.raster);
assert.equal(regular.applied, true);
assert.equal(regular.plan.grid.xStep, .2);
assert.equal(regular.plan.grid.yStep, .2);
assert.equal(regular.plan.grid.style.strokeLevel, 150);
assert.equal(JSON.stringify(grid.plan), snapshot);
assert.deepEqual(regular.plan.series, grid.plan.series);
assert.equal(regular.measurements.length, 8);
const noisy = fixture([31, 49, 71, 90], [30, 51, 69, 91]);
assert.equal(matchSourceGrid(noisy.plan, noisy.raster).reason, 'complete-observed-grid');
const nonuniform = fixture([30, 49, 82], [26, 55, 88]);
const marked = matchSourceGrid(nonuniform.plan, nonuniform.raster);
assert.equal(marked.applied, true);
assert.equal(marked.plan.grid, undefined);
assert.equal(marked.plan.annotations.length, 6);
assert.ok(marked.plan.annotations.every(a => a.to && a.endStyle === 'none'));
const missing = fixture([30, 70, 90]);
const missingResult = matchSourceGrid(missing.plan, missing.raster);
assert.equal(missingResult.plan.grid.xStep, undefined);
assert.equal(missingResult.plan.annotations.filter(a => a.orientation === 'vertical').length, 3);
for (const f of [fixture([], []), fixture([30], [30]), fixture(undefined, undefined, [25, 25, 25]), fixture(undefined, undefined, [150, 150, 150], 5), fixture(undefined, undefined, [70, 170, 120])]) {
  const result = matchSourceGrid(f.plan, f.raster);
  assert.equal(result.applied, false); assert.equal(result.plan, f.plan);
}
const existing = { ...grid.plan, grid: { coordinateSpace: 'normalized', xStep: .3 } };
assert.deepEqual(matchSourceGrid(existing, grid.raster).plan.grid, existing.grid);
assert.equal(matchSourceGrid(grid.plan, null).applied, false);
const twice = matchSourceGrid(marked.plan, nonuniform.raster);
assert.equal(twice.plan.annotations.length, marked.plan.annotations.length);

// Reverse endpoints are equivalent. Partial or linked scientific guides remain.
const guide = (id, x, y, to) => ({ id, kind: 'guide', text: '', coordinateSpace: 'normalized', orientation: 'horizontal', endStyle: 'none', x, y, to });
const guidesPlan = structuredClone(nonuniform.plan);
guidesPlan.annotations = [guide('reverse', 1, .84, { x: 0, y: .84 }), guide('partial', 0, .45, { x: .5, y: .45 })];
const guidesResult = matchSourceGrid(guidesPlan, nonuniform.raster);
assert.equal(guidesResult.plan.annotations.filter(a => a.y === .84).length, 1);
assert.equal(guidesResult.plan.annotations.find(a => a.id === 'reverse').strokeLevel, 150);
assert.deepEqual(guidesResult.plan.annotations.find(a => a.id === 'partial'), guidesPlan.annotations[1]);
assert.equal(guidesResult.transforms.find(t => t.id === 'reverse').kind, 'guide-style');
const gridGuides = structuredClone(grid.plan);
gridGuides.annotations = [guide('confirmed', .2, 1, { x: .2, y: 0 }), guide('partial', .4, 0, { x: .4, y: .5 })];
const gridGuidesResult = matchSourceGrid(gridGuides, grid.raster);
assert.deepEqual(gridGuidesResult.removedIDs, ['confirmed']);
assert.equal(gridGuidesResult.plan.annotations[0].id, 'partial');
const segment = (id, points, extra = {}) => ({ id, kind: 'points', coordinateSpace: 'normalized', curveStyle: 'straight', label: '', endLabel: '', markerShape: 'none', endpoints: [], points, breaks: [], ...extra });
const linesPlan = structuredClone(grid.plan);
linesPlan.axes = { x: { scale: 'linear', min: 0, max: 10 }, y: { scale: 'linear', min: 0, max: 20 } };
linesPlan.series = [
  segment('source-lines', [{ x: .2, y: 1 }, { x: .2, y: 0 }, { x: 1, y: .6 }, { x: 0, y: .6 }], { breaks: [2] }),
  segment('ordinary', [{ x: 0, y: 0 }, { x: 1, y: 1 }]),
  segment('partial', [{ x: .4, y: 0 }, { x: .4, y: .5 }]),
  segment('named', [{ x: .6, y: 0 }, { x: .6, y: 1 }], { label: 'reference' }),
  segment('arrow', [{ x: .8, y: 0 }, { x: .8, y: 1 }], { arrowSpecs: [{ segmentIndex: 0, t: .5 }] }),
  segment('data-grid', [{ x: 4, y: 0 }, { x: 4, y: 20 }], { coordinateSpace: 'data' }),
  segment('controlled', [{ x: .2, y: 0 }, { x: .2, y: 1 }], { handlesMath: [{ ix: 0, iy: 0, ox: .1, oy: .1 }, { ix: -.1, iy: -.1, ox: 0, oy: 0 }] }),
  segment('exact', [{ x: .2, y: 0 }, { x: .2, y: 1 }], { certainty: 'exact' }),
  segment('physical', [{ x: .2, y: 0 }, { x: .2, y: 1 }], { candidateFamily: 'linear' }),
  segment('mixed', [{ x: .2, y: 0 }, { x: .2, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 1 }], { breaks: [2] }),
];
const linesResult = matchSourceGrid(linesPlan, grid.raster);
assert.deepEqual(linesResult.removedIDs, ['source-lines', 'data-grid']);
assert.deepEqual(linesResult.plan.series.map(s => s.id), ['ordinary', 'partial', 'named', 'arrow', 'controlled', 'exact', 'physical', 'mixed']);
const unknown = structuredClone(linesPlan); unknown.axes.x.scale = 'unknown';
assert.ok(matchSourceGrid(unknown, grid.raster).plan.series.some(s => s.id === 'data-grid'));
const linked = structuredClone(linesPlan); linked.annotations = [{ kind: 'text', seriesId: 'source-lines', pointIndex: 0 }];
assert.ok(matchSourceGrid(linked, grid.raster).plan.series.some(s => s.id === 'source-lines'));

if (process.argv.includes('--real')) {
  const python = process.env.PYTHON || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3');
  const base = path.resolve('outputs/middle2-science-graphs-20261007');
  for (const name of ['heating', 'cooling', 'sound', 'solubility', 'melting_mass', 'melting_material', 'ohm', 'photosynthesis_light', 'photosynthesis_co2', 'photosynthesis_temperature']) {
    const run = path.join(base, 'textbook-run', `ms2_${name}`);
    const planFile = path.join(run, 'plan.json');
    const text = fs.existsSync(planFile) ? fs.readFileSync(planFile, 'utf8') : fs.readFileSync(path.join(run, 'response.txt'), 'utf8').replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, '');
    const plan = JSON.parse(text);
    const png = path.join(base, 'textbook-sources', `ms2_${name}.png`);
    const decoded = spawnSync(python, ['-c', 'from PIL import Image; import sys; sys.stdout.buffer.write(Image.open(sys.argv[1]).convert("RGBA").tobytes())', png], { maxBuffer: 16_000_000 });
    assert.equal(decoded.status, 0, decoded.stderr?.toString());
    const result = matchSourceGrid(plan, { width: plan.source.width, height: plan.source.height, dataRGBA: decoded.stdout });
    const hasGrid = ['heating', 'cooling', 'sound', 'solubility', 'melting_mass', 'melting_material'].includes(name);
    assert.equal(result.applied, hasGrid, `${name}: ${result.reason}`);
    if (!hasGrid) assert.equal(result.plan, plan);
    if (name === 'sound') { assert.equal(result.plan.grid.yStep, 1 / 8); assert.ok(result.axisEvidence.some(a => a.axis === 'x')); assert.ok(result.removedIDs.includes('grid')); }
    if (name === 'melting_material') for (const a of plan.annotations.filter(a => a.kind === 'guide' && !a.to || a.kind === 'guide' && a.to && Math.abs(a.to.x - a.x) < .95 && Math.abs(a.to.y - a.y) < .95)) assert.ok(result.plan.annotations.some(b => JSON.stringify(a) === JSON.stringify(b)));
    console.log(`${name}: ${result.reason}; ${result.measurements.filter(l => l.orientation === 'vertical').length} vertical, ${result.measurements.filter(l => l.orientation === 'horizontal').length} horizontal; grid ${JSON.stringify(result.plan.grid || null)}`);
  }
}
console.log('source grid tests passed');
