const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  const events = new Map();
  const windowEvents = new Map();
  const frames = new Map();
  const children = [];
  let current = { activeTool: 'LABELER' };
  let subscriber;
  let next = 0;
  const node = () => ({ style: {}, attrs: {}, children: [], hidden: false,
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(child) { this.children.push(child); },
  });
  const svg = {
    addEventListener: (name, callback) => events.set(name, callback),
    getScreenCTM: () => ({ a: 2, b: 0, inverse: () => ({}) }),
    createSVGPoint: () => ({ matrixTransform() { return { x: this.x / 2, y: this.y / 2 }; } }),
  };
  const context = vm.createContext({
    document: { createElement: node, createElementNS: node, body: { appendChild: n => children.push(n) } },
    window: { innerWidth: 800, innerHeight: 600, addEventListener: (n, cb) => windowEvents.set(n, cb) },
    requestAnimationFrame: cb => { frames.set(++next, cb); return next; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  vm.runInContext(fs.readFileSync(require.resolve('../js/tools/labeler-magnifier.js'), 'utf8').replaceAll('export ', ''), context);
  context.initLabelerMagnifier(svg, { get: () => current, subscribe: cb => { subscriber = cb; } });
  return {
    children, frames, context,
    move: (x = 300, y = 200, extra = {}) => events.get('pointermove')({ clientX: x, clientY: y, ...extra }),
    emit: name => events.get(name)(),
    key: (name, code) => windowEvents.get(name)({ code, key: code }),
    state: patch => { current = { ...current, ...patch }; subscriber(); },
    flush: () => { const batch = [...frames.values()]; frames.clear(); batch.forEach(cb => cb()); },
  };
}

test('magnifier lazily reuses scene and coalesces 1000 moves into one frame', () => {
  const h = setup();
  assert.equal(h.children.length, 0);
  for (let i = 0; i < 1000; i++) h.move(300, 200);
  assert.equal(h.frames.size, 1);
  h.flush();
  const lens = h.children[0];
  assert.equal(lens.style.width, '160px');
  assert.equal(lens.children[0].children[0].attrs.href, '#scene');
  assert.equal(lens.children[0].attrs.viewBox, '145.0625 95.0625 9.875 9.875');
  assert.equal(lens.children[1].children[1].attrs.d, 'M0 79H158 M79 0V158');
  assert.equal(lens.children[1].children[1].attrs['stroke-width'], '1');
  h.move(); h.flush();
  assert.equal(h.children.length, 1);
});

test('first point, drafts, other tools, touch and canvas exit hide the lens', () => {
  const h = setup();
  h.move(); h.flush();
  h.emit('pointerdown');
  assert.equal(h.children[0].hidden, true);
  h.state({ draft: {} }); h.move();
  assert.equal(h.frames.size, 0);
  h.state({ draft: null, activeTool: 'V' }); h.move();
  assert.equal(h.frames.size, 0);
  h.state({ activeTool: 'LABELER' }); h.flush();
  assert.equal(h.children[0].hidden, false);
  h.move(300, 200, { pointerType: 'touch' });
  assert.equal(h.children[0].hidden, true);
  h.move(); h.emit('pointerleave');
  assert.equal(h.frames.size, 0);
});

test('Space panning pauses updates and viewport edges flip the square', () => {
  const h = setup();
  h.move(); h.flush(); h.key('keydown', 'Space');
  assert.equal(h.children[0].hidden, true);
  h.move(); assert.equal(h.frames.size, 0);
  h.key('keyup', 'Space'); h.flush();
  assert.equal(h.children[0].hidden, false);
  const pos = h.context.magnifierPosition(790, 590, 800, 600);
  assert.equal(pos.x, 606); assert.equal(pos.y, 406);
});

test('branch placement keeps the magnifier available between additional points', () => {
  const h = setup();
  h.state({ activeTool: 'LABELER_BRANCH' });
  h.move(); h.flush();
  assert.equal(h.children[0].hidden, false);
  h.emit('pointerdown'); h.move(); h.flush();
  assert.equal(h.children[0].hidden, false);
  h.state({ activeTool: 'V' });
  assert.equal(h.children[0].hidden, true);
});
