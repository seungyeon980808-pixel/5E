const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../js/ai-label-leaders.js');
const route = (attachment = 'label', kind = 'straight') => ({
  kind, attachment, start: { x: 35, y: 12 }, target: { x: 20, y: 15 },
  controls: kind === 'straight' ? [] : [{ x: 30, y: 15 }], end: 'circle', endRadius: .6,
});

test('native text boundary replaces detached start without altering observed target or source data', async () => {
  const { attachLeaderRoutesToLabel } = await modulePromise;
  const source = [route()], before = JSON.stringify(source);
  const native = attachLeaderRoutesToLabel(source, { center: { x: 70, y: 15 }, w: 24, h: 4 });
  assert.deepEqual(native[0].start, { x: 58, y: 15 });
  assert.deepEqual(native[0].target, source[0].target);
  assert.equal(native[0].endRadius, .6);
  assert.equal(JSON.stringify(source), before);
  native[0].target.x = 0;
  assert.equal(source[0].target.x, 20, 'derived geometry cannot mutate source target');
});

test('short or degenerate label route connects to distant text while frame attachment stays independent', async () => {
  const { attachLeaderRoutesToLabel } = await modulePromise;
  const degenerate = { ...route(), start: { x: 20, y: 15 } }, frame = route('frame');
  const native = attachLeaderRoutesToLabel([degenerate, frame], { center: { x: 70, y: 15 }, w: 24, h: 4 });
  assert.deepEqual(native[0].start, { x: 58, y: 15 });
  assert.deepEqual(native[0].target, degenerate.target);
  assert.deepEqual(native[1], frame);
});

test('rotated label and explicit gap determine the border in label coordinates', async () => {
  const { attachLeaderRoutesToLabel } = await modulePromise;
  const source = [{ ...route(), target: { x: 0, y: 30 } }];
  const [native] = attachLeaderRoutesToLabel(source, { center: { x: 0, y: 0 }, w: 20, h: 4, rotation: 90, gap: .5 });
  assert.ok(Math.abs(native.start.x) < 1e-8);
  assert.ok(Math.abs(native.start.y - 10.5) < 1e-8);
  assert.deepEqual(native.target, source[0].target);
});

test('curved and bent leaders retain observed controls and endpoints after font-size changes', async () => {
  const { attachLeaderRoutesToLabel, leaderPath } = await modulePromise;
  for (const kind of ['polyline', 'quadratic', 'cubic']) {
    const observed = route('label', kind);
    if (kind === 'cubic') observed.controls.push({ x: 25, y: 20 });
    const before = JSON.stringify(observed);
    const [small] = attachLeaderRoutesToLabel([observed], { center: { x: 70, y: 15 }, w: 20, h: 4 });
    const [large] = attachLeaderRoutesToLabel([observed], { center: { x: 70, y: 15 }, w: 30, h: 6 });
    assert.notDeepEqual(small.start, large.start);
    assert.deepEqual(large.controls, observed.controls);
    assert.deepEqual(large.target, observed.target);
    assert.equal(large.end, observed.end);
    assert.equal(JSON.stringify(observed), before);
    assert.match(leaderPath(large), kind === 'quadratic' ? / Q / : kind === 'cubic' ? / C / : / L /);
  }
});
