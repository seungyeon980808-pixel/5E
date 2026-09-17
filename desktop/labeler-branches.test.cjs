const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

test('full inspector module parses without duplicate declarations', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/inspector/section-geometry.js'), 'utf8');
  const result = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: source, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

function setup(overrides = {}) {
  const events = new Map();
  const keyEvents = new Map();
  const nodes = [];
  const node = () => ({
    children: [], attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, replaceChildren() { this.children = []; },
    appendChild(child) { this.children.push(child); }, remove() {},
  });
  const svg = { ...node(), getScreenCTM: () => ({ a: 2, b: 0 }), addEventListener(type, fn) { events.set(type, fn); } };
  const value = { activeTool: 'V', selectedIds: ['label'], objects: [{
    id: 'label', type: 'labeler', p1: { x: 1, y: 2 }, p2: { x: 30, y: 10 },
    elbow: { x: 20, y: 10 }, ...overrides,
  }], undoStack: [], redoStack: [] };
  const subscribers = [];
  const state = { get: () => value, subscribe: (fn) => subscribers.push(fn), update(fn) { fn(value); subscribers.forEach((sub) => sub()); } };
  const sandbox = { document: { createElementNS() { const result = node(); nodes.push(result); return result; } }, window: { addEventListener(type, fn) { keyEvents.set(type, fn); } },
    screenToWorld: (_svg, _vb, x, y) => ({ x, y }),
  };
  const source = fs.readFileSync(path.join(__dirname, '../js/tools/labeler-branches.js'), 'utf8')
    .replace(/^import.*;\n/gm, '').replace(/\bexport /g, '');
  vm.runInNewContext(source + '\nglobalThis.api = { initLabelerBranches, beginLabelerBranches, labelerBranchStatus };', sandbox);
  sandbox.api.initLabelerBranches(svg, state);
  return { value, state, nodes, ...sandbox.api,
    move(x, y) { events.get('pointermove')({ clientX: x, clientY: y }); },
    begin() { sandbox.api.beginLabelerBranches('label'); },
    click(x, y) { events.get('click')({ button: 0, clientX: x, clientY: y, preventDefault() {}, stopImmediatePropagation() {} }); },
    key(key) { keyEvents.get('keydown')({ key, target: { tagName: 'BODY' }, preventDefault() {}, stopImmediatePropagation() {} }); },
  };
}

test('dotted guide follows cursor from shared elbow without modifying objects', () => {
  const app = setup();
  const original = JSON.stringify(app.value.objects);
  app.begin(); app.move(60, 70);
  const guide = app.nodes.find(node => 'data-labeler-cursor-guide' in node.attrs);
  assert.equal(guide.attrs.x1, 20);
  assert.equal(guide.attrs.y1, 10);
  assert.equal(guide.attrs.x2, 60);
  assert.equal(guide.attrs.y2, 70);
  assert.equal(guide.attrs['stroke-dasharray'], '4 4');
  app.click(60, 70); app.move(80, 90);
  assert.equal(guide.attrs.x1, 20);
  assert.equal(guide.attrs.x2, 80);
  assert.equal(JSON.stringify(app.value.objects), original);
  assert.equal(app.value.undoStack.length, 0);
});

test('branches stay transient, cap total anchors at five and commit one undo snapshot', () => {
  const app = setup();
  app.begin();
  for (let i = 0; i < 8; i++) app.click(i, i + 5);
  assert.equal(app.value.objects[0].p3, undefined);
  assert.equal(app.value.undoStack.length, 0);
  assert.equal(app.labelerBranchStatus().count, 5);
  app.key('Enter');
  assert.equal(app.value.objects[0].p3.x, 0);
  assert.equal(app.value.objects[0].extraAnchors.length, 3);
  assert.equal(app.value.undoStack.length, 1);
  assert.equal(app.value.undoStack[0][0].p3, undefined);
  assert.equal(app.value.activeTool, 'V');
});

test('straight label asks for merge point before placing additional anchors', () => {
  const app = setup({ elbow: undefined });
  app.begin();
  assert.equal(app.labelerBranchStatus().needsElbow, true);
  app.move(50, 60);
  const guide = app.nodes.find(node => 'data-labeler-cursor-guide' in node.attrs);
  assert.equal(guide.attrs.x1, undefined);
  app.click(11, 12);
  app.move(50, 60);
  assert.equal(guide.attrs.x1, 11);
  assert.equal(guide.attrs.y1, 12);
  assert.equal(app.labelerBranchStatus().count, 1);
  app.click(4, 5);
  app.key('Enter');
  assert.equal(app.value.objects[0].elbow.x, 11);
  assert.equal(app.value.objects[0].p3.x, 4);
});

test('Escape and tool switch discard draft without undo or geometry changes', () => {
  for (const cancel of [(app) => app.key('Escape'), (app) => app.state.update((s) => { s.activeTool = 'L'; })]) {
    const app = setup();
    app.begin(); app.click(1, 8); cancel(app);
    assert.equal(app.labelerBranchStatus(), null);
    assert.equal(app.value.objects[0].p3, undefined);
    assert.equal(app.value.undoStack.length, 0);
  }
});

test('legacy second anchor is retained and remaining capacity is respected', () => {
  const app = setup({ p3: { x: 6, y: 7 } });
  app.begin();
  for (let i = 0; i < 5; i++) app.click(i, i);
  app.key('Enter');
  assert.equal(app.value.objects[0].p3.x, 6);
  assert.equal(app.value.objects[0].extraAnchors.length, 3);
  app.begin();
  assert.equal(app.labelerBranchStatus(), null);
});

test('locked label and empty confirmation do not mutate geometry or undo', () => {
  const locked = setup({ locked: true });
  locked.begin();
  assert.equal(locked.value.activeTool, 'V');
  const app = setup({ elbow: undefined });
  app.begin(); app.click(10, 20); app.key('Enter');
  assert.equal(app.value.objects[0].elbow, undefined);
  assert.equal(app.value.undoStack.length, 0);
});
