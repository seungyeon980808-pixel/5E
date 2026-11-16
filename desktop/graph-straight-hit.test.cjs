const assert = require('node:assert/strict');
const test = require('node:test');
const pick = import('../js/pick.js?v=1.7.0-four-session-integration');

const triangle = () => ({ id: 'curve', type: 'funcgraph', sourceKind: 'points', curveStyle: 'straight',
  closed: true, strokeWidth: .25,
  points: [{ x: -21, y: 13.2 }, { x: 0, y: -13.2 }, { x: 21, y: 13.2 }] });
const plane = { id: 'plane', type: 'coordplane', x: -30, y: -22, w: 60, h: 44, strokeWidth: .3 };

test('painted straight graph wins over its underlying plane at every zoom', async () => {
  const { hitTest } = await pick;
  for (const scale of [8, 12, 20, 40, 100]) {
    const object = triangle(), before = structuredClone(object);
    assert.equal(hitTest([plane, object], { x: -10.5, y: 0 }, 6 / scale, 20 / scale), object.id);
    assert.equal(hitTest([plane, object], { x: 0, y: 13.2 }, 6 / scale, 20 / scale), object.id,
      'The painted closing edge must also select the graph');
    assert.deepEqual(object, before, 'Selection never changes source geometry');
  }
});

test('straight graphs preserve discontinuities in point and marquee selection', async () => {
  const { hitTest, marqueeHitsObject } = await pick;
  const object = { ...triangle(), closed: true, breaks: [2],
    points: [{ x: -10, y: -10 }, { x: -5, y: -5 }, { x: 5, y: 5 }, { x: 10, y: 10 }] };
  assert.equal(hitTest([object], { x: 0, y: 0 }, .01, .01), null);
  assert.equal(hitTest([object], { x: -7, y: -7 }, .01, .01), object.id);
  assert.equal(marqueeHitsObject(object, { x: -.1, y: -.1, w: .2, h: .2 }), false,
    'A rectangle in the missing span cannot select a fabricated connecting line');
});

test('an open straight graph does not acquire a closing edge or filled interior', async () => {
  const { hitTest } = await pick;
  const object = { ...triangle(), closed: false };
  assert.equal(hitTest([object], { x: 0, y: 13.2 }, .01, .01), null);
  assert.equal(hitTest([object], { x: 0, y: 0 }, .01, .01), null);
});

test('ordinary smooth curve and explicit graph handles keep their existing geometry', async () => {
  const { hitTest } = await pick;
  const graph = triangle();
  const handles = graph.points.map(p => ({ inX: p.x, inY: p.y, outX: p.x, outY: p.y }));
  for (const object of [{ ...graph, type: 'curve', closed: false }, { ...graph, closed: false, handles }]) {
    const before = structuredClone(object);
    assert.equal(hitTest([object], object.points[1], .01, .01), object.id);
    assert.deepEqual(object, before);
  }
});
