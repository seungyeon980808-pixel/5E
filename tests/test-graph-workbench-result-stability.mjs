import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildWorkbenchGraph, validateWorkbenchGraph, workbenchGraphDataUrl, editWorkbenchGraph, insertWorkbenchGraph } from '../js/graph/workbench-result.js';

const plan = JSON.parse(fs.readFileSync(new URL('./fixtures/graph-reconstruction/linear.json', import.meta.url), 'utf8'));
plan.axes.x.ticks = [{ value: 1, label: 't_0', displayMath: 't_0' }];
plan.axes.y.ticks = [{ value: 2, label: '값 2' }];
plan.axes.y2 = { scale: 'linear', title: '오른쪽 축', unit: '', min: 0, max: 8, step: 2, ticks: [{ value: 4, label: '4' }] };
const result = buildWorkbenchGraph(plan, plan.source);
const original = structuredClone(result);
const plane = validateWorkbenchGraph(result);
assert.deepEqual(result, original);
const cloned = structuredClone(result);
assert.deepEqual(validateWorkbenchGraph(cloned).explicitTicksX, plane.explicitTicksX);
assert.deepEqual(cloned.objects[0].explicitTicksY, plane.explicitTicksY);
assert.deepEqual(cloned.objects[0].y2.explicitTicks, plane.y2.explicitTicks);
const rows = [{ name: 'valid independent tick lists clone without mutation', pass: true }];
for (const axis of ['x', 'y', 'y2']) {
  const broken = structuredClone(result);
  const target = broken.objects.find(o => o.type === 'coordplane');
  if (axis === 'y2') target.y2.explicitTicks = [null];
  else target[`explicitTicks${axis.toUpperCase()}`] = [null];
  const before = structuredClone(broken);
  const controlled = error => error.name === 'Error' && /눈금/.test(error.message);
  assert.throws(() => validateWorkbenchGraph(broken), controlled);
  await assert.rejects(() => workbenchGraphDataUrl(broken), controlled);
  assert.throws(() => editWorkbenchGraph(broken), controlled);
  let stateAccesses = 0;
  const state = { get() { stateAccesses++; throw Error('State should not be accessed'); }, update() { stateAccesses++; throw Error('State should not be mutated'); } };
  assert.throws(() => insertWorkbenchGraph(state, broken), controlled);
  assert.equal(stateAccesses, 0);
  assert.deepEqual(broken, before);
  assert.deepEqual(result, original);
  rows.push({ name: `${axis} null tick controlled rejection before rendering/editing/insertion/state access`, pass: true });
}
if (process.env.EVIDENCE_DIR) {
  fs.mkdirSync(process.env.EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.EVIDENCE_DIR, 'tick-unit-report.json'), JSON.stringify({ pass: true, rows }, null, 2));
}
console.log(`PASS Workbench null ticks and clone preservation (${rows.length} cases)`);
