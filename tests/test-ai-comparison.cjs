const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const moduleUrl = pathToFileURL(path.resolve(__dirname, '../preview/js/ai-comparison.js')).href;
const revisions = () => [
  { id: 'original', label: '원본', src: 'original.png', kind: 'original', width: 400, height: 200 },
  ...[1, 2, 3, 4].map(i => ({ id: `r${i}`, label: `수정본 ${i}`, src: `r${i}.png`, width: 200, height: 400 })),
];
test('selected older revision wins over latest; previous revision or original is baseline', async () => {
  const { comparisonDefaults } = await import(moduleUrl);
  assert.deepEqual(comparisonDefaults(revisions(), 'r2'), { leftRevisionId: 'r1', rightRevisionId: 'r2' });
  assert.deepEqual(comparisonDefaults(revisions(), 'r1'), { leftRevisionId: 'original', rightRevisionId: 'r1' });
  assert.deepEqual(comparisonDefaults(revisions().slice(0, 2), 'r1'), { leftRevisionId: 'original', rightRevisionId: 'r1' });
});
test('descriptor snapshot is immutable, detached, rejects ambiguous IDs and malformed dimensions', async () => {
  const { snapshotComparisonRevisions } = await import(moduleUrl);
  const input = revisions();
  const before = JSON.stringify(input);
  const copy = snapshotComparisonRevisions(input);
  assert.ok(Object.isFrozen(copy) && copy.every(Object.isFrozen));
  assert.equal(JSON.stringify(input), before);
  input[0].label = 'changed outside';
  assert.equal(copy[0].label, '원본');
  assert.throws(() => snapshotComparisonRevisions([input[0], input[0]]), /id/i);
  for (const width of [0, -1, NaN, Infinity, '400']) {
    assert.throws(() => snapshotComparisonRevisions([{ ...input[0], width }]), /dimension/i);
  }
});
test('different aspects retain centered contain padding at zoom and pan', async () => {
  const { comparisonGeometry } = await import(moduleUrl);
  const g = comparisonGeometry({ width: 400, height: 200 }, { width: 200, height: 400 }, { width: 800, height: 600, zoom: 2, panX: 10, panY: -20 });
  assert.deepEqual(g.bounds, { width: 400, height: 400 });
  assert.deepEqual(g.left, { x: 0, y: 100, width: 400, height: 200 });
  assert.deepEqual(g.right, { x: 100, y: 0, width: 200, height: 400 });
  assert.equal(g.scale, 3);
  assert.equal(g.viewBox.width, 800 / 3);
  assert.equal(g.viewBox.height, 200);
  assert.equal(g.viewBox.x, (400 - 800 / 3) / 2 + 10);
  assert.equal(g.viewBox.y, 80);
  assert.throws(() => comparisonGeometry({ width: 0, height: 1 }, { width: 1, height: 1 }, { width: 800, height: 600 }), /dimension/i);
});
test('same-size sources keep identical bounds and the existing camera', async () => {
  const { comparisonGeometry } = await import(moduleUrl);
  const g = comparisonGeometry({ width: 400, height: 200 }, { width: 400, height: 200 }, { width: 800, height: 600 });
  assert.deepEqual(g.left, { x: 0, y: 0, width: 400, height: 200 });
  assert.deepEqual(g.right, g.left);
  assert.deepEqual(g.viewBox, { x: 0, y: -50, width: 400, height: 300 });
  assert.equal(g.scale, 2);
});
test('equivalent diagrams at different resolutions have equal displayed width without stretching', async () => {
  const { comparisonGeometry } = await import(moduleUrl);
  const original = { width: 1005, height: 399 }, generated = { width: 1991, height: 790 };
  const g = comparisonGeometry(original, generated, { width: 1080, height: 600 });
  assert.equal(g.left.width, g.right.width);
  assert.ok(Math.abs(g.left.height - g.right.height) * g.scale < 1);
  for (const [bounds, source] of [[g.left, original], [g.right, generated]]) {
    assert.ok(Math.abs(bounds.width / bounds.height - source.width / source.height) < 1e-12);
    assert.equal(bounds.x + bounds.width / 2, g.bounds.width / 2);
    assert.equal(bounds.y + bounds.height / 2, g.bounds.height / 2);
  }
  const swapped = comparisonGeometry(generated, original, { width: 1080, height: 600 });
  assert.deepEqual(swapped.left, g.right);
  assert.deepEqual(swapped.right, g.left);
});
test('different resolutions and divergent aspects uniformly contain instead of stretching or cropping', async () => {
  const { comparisonGeometry } = await import(moduleUrl);
  const g = comparisonGeometry({ width: 200, height: 100 }, { width: 400, height: 800 }, { width: 800, height: 600 });
  assert.deepEqual(g.left, { x: 0, y: 200, width: 800, height: 400 });
  assert.deepEqual(g.right, { x: 200, y: 0, width: 400, height: 800 });
});
