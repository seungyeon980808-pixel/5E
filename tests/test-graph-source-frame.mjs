import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { matchSourceFrame } from '../js/graph/source-frame.js';

function fixture(sides = ['top', 'right', 'bottom', 'left'], { thickness = 1, color = [100, 100, 100], shift = 0 } = {}) {
  const width = 140, height = 140, data = new Uint8ClampedArray(width * height * 4).fill(255);
  const pixel = (x, y) => data.set([...color, 255], (y * width + x) * 4);
  for (const side of sides) for (let q = 20; q <= 120; q++) for (let k = 0; k < thickness; k++) {
    const position = (side === 'top' || side === 'left' ? 20 : 120) + shift + k;
    pixel(side === 'left' || side === 'right' ? position : q, side === 'left' || side === 'right' ? q : position);
  }
  const plan = { source: { width, height, plotBox: { x: 20, y: 20, w: 100, h: 100 } }, axes: { x: {}, y: {} }, series: [{ id: 'curve', kind: 'points', points: [{ x: .2, y: .3 }, { x: .8, y: .7 }] }], frame: { variant: 'quadrant', arrowX: true, arrowY: true, arrowY2: false, arrowLength: 3, arrowWidth: 1.5 }, axisPlacement: { x: { mode: 'fraction', value: .5 }, y: { mode: 'fraction', value: 0 } }, annotations: [] };
  return { plan, raster: { width, height, dataRGBA: data } };
}
const base = fixture(), snapshot = JSON.stringify(base.plan);
const matched = matchSourceFrame(base.plan, base.raster);
assert.equal(matched.applied, true);
assert.equal(matched.plan.frame.variant, 'box');
assert.deepEqual({ ...matched.plan.frame, variant: 'quadrant' }, base.plan.frame);
assert.deepEqual(matched.plan.axisPlacement, base.plan.axisPlacement);
assert.deepEqual(matched.plan.series, base.plan.series);
assert.equal(matched.measurements.length, 4);
assert.equal(JSON.stringify(base.plan), snapshot);
for (const f of [fixture(['left', 'bottom']), fixture(['top', 'bottom', 'left']), fixture(undefined, { thickness: 7 }), fixture(undefined, { shift: 8 }), fixture(undefined, { color: [50, 170, 110] })]) {
  const result = matchSourceFrame(f.plan, f.raster); assert.equal(result.applied, false); assert.equal(result.plan, f.plan);
}
const omittedArrows = structuredClone(base.plan); delete omittedArrows.frame.arrowX;
assert.equal(matchSourceFrame(omittedArrows, base.raster).reason, 'arrow-settings-ambiguous');
const boxed = structuredClone(base.plan); boxed.frame.variant = 'box';
assert.equal(matchSourceFrame(boxed, base.raster).plan, boxed);
const nongraph = structuredClone(base.plan); delete nongraph.axes;
assert.equal(matchSourceFrame(nongraph, base.raster).reason, 'graph-context-unavailable');
assert.equal(matchSourceFrame(base.plan, null).applied, false);
// Long experimental apparatus edges outside the plot and internal axes cannot
// substitute for the requested plot borders.
const central = fixture([]);
for (let q = 20; q <= 120; q++) { central.raster.dataRGBA.set([80,80,80,255], (70 * 140 + q) * 4); central.raster.dataRGBA.set([80,80,80,255], (q * 140 + 70) * 4); }
assert.equal(matchSourceFrame(central.plan, central.raster).applied, false);

const disconnected = fixture();
for (let x = 20; x <= 23; x++) disconnected.raster.dataRGBA.set([255,255,255,255], (20 * 140 + x) * 4);
assert.equal(matchSourceFrame(disconnected.plan, disconnected.raster).reason, 'border-corners-disconnected');

if (process.argv.includes('--real')) {
  const python = process.env.PYTHON || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3');
  const basePath = path.resolve('outputs/middle2-science-graphs-20261007');
  for (const name of ['heating', 'cooling', 'sound', 'solubility', 'melting_mass', 'melting_material', 'ohm', 'photosynthesis_light', 'photosynthesis_co2', 'photosynthesis_temperature']) {
    const run = path.join(basePath, 'textbook-run', `ms2_${name}`), planFile = path.join(run, 'plan.json');
    const text = fs.existsSync(planFile) ? fs.readFileSync(planFile, 'utf8') : fs.readFileSync(path.join(run, 'response.txt'), 'utf8').replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, '');
    const plan = JSON.parse(text), png = path.join(basePath, 'textbook-sources', `ms2_${name}.png`);
    const decoded = spawnSync(python, ['-c', 'from PIL import Image; import sys; sys.stdout.buffer.write(Image.open(sys.argv[1]).convert("RGBA").tobytes())', png], { maxBuffer: 16_000_000 });
    assert.equal(decoded.status, 0, decoded.stderr?.toString());
    const result = matchSourceFrame(plan, { width: plan.source.width, height: plan.source.height, dataRGBA: decoded.stdout });
    if (['heating', 'cooling', 'ohm'].includes(name)) { assert.equal(result.applied, true, `${name}: ${result.reason}`); assert.deepEqual({ ...result.plan.frame, variant: plan.frame.variant }, plan.frame); }
    else assert.equal(result.applied, false);
    console.log(`${name}: ${result.reason}; ${result.measurements.map(m => `${m.side}=${m.coverage.toFixed(3)}`).join(', ')}`);
  }
}
console.log('source frame tests passed');
