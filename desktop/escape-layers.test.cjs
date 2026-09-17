const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness() {
  const layers = [];
  let keydown, nativeEscape, toggles = 0;
  class Element {
    constructor(native = false) { this.isConnected = true; this.native = native; this.hidden = false; }
    closest() { return this.hidden ? this : null; }
    getClientRects() { return this.hidden ? [] : [{}]; }
    matches(selector) { return selector === 'dialog[open]' && this.native; }
    querySelectorAll() { return []; }
    requestClose() { this.hidden = true; }
  }
  const document = {
    querySelectorAll: () => layers, addEventListener() {},
    body: { dispatchEvent(event) { keydown(event); } },
  };
  class KeyEvent {
    constructor(type, options) { Object.assign(this, options); this.defaultPrevented = false; }
    preventDefault() { this.defaultPrevented = true; }
    stopImmediatePropagation() {}
  }
  const window = {
    addEventListener(type, handler) { if (type === 'keydown') keydown = handler; },
    fiveEDesktop: { fullscreen: {
      onEscape(callback) { nativeEscape = callback; },
      async toggle() { toggles++; },
    } },
  };
  const context = vm.createContext({ document, window, HTMLElement: Element, KeyboardEvent: KeyEvent,
    MutationObserver: class { observe() {} }, getComputedStyle: () => ({ visibility: 'visible', zIndex: '100' }), console });
  vm.runInContext(fs.readFileSync(require.resolve('../js/escape-layers.js'), 'utf8').replaceAll('export ', ''), context);
  context.initEscapeLayers();
  return { layers, Element, context, escape: () => nativeEscape(), toggles: () => toggles };
}

test('native fullscreen Escape closes one top dialog and retains fullscreen', () => {
  const h = harness();
  const panel = new h.Element(), dialog = new h.Element(true);
  h.layers.push(dialog, panel);
  h.context.registerEscapeLayer(panel, () => { panel.hidden = true; });
  h.escape();
  assert.equal(dialog.hidden, true);
  assert.equal(panel.hidden, false);
  assert.equal(h.toggles(), 0);
  h.escape();
  assert.equal(panel.hidden, true);
  assert.equal(h.toggles(), 0);
  h.escape();
  assert.equal(h.toggles(), 1);
});

test('an unhandled visible popup never falls through to fullscreen exit', () => {
  const h = harness();
  h.layers.push(new h.Element());
  h.escape();
  assert.equal(h.toggles(), 0);
});
