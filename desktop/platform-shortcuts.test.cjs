const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
function harness(platform = 'MacIntel', modal = false) {
  const listeners = {};
  const calls = [];
  const context = vm.createContext({ navigator: { platform }, document: { querySelector: () => modal ? {} : null }, window: { addEventListener: (name, fn) => { listeners[name] = fn; } }, setActiveTool: (tool) => calls.push(tool) });
  vm.runInContext(read('platform.js').replace(/export \{[^}]+\};/, ''), context);
  const source = read('tools.js');
  vm.runInContext(source.slice(source.indexOf('function setupKeyboard()'), source.indexOf('\nfunction activateSymbolShortcut')), context);
  vm.runInContext('setupKeyboard()', context);
  return { calls, context, key: (extra = {}) => listeners.keydown({ key: 'e', code: 'KeyE', metaKey: platform === 'MacIntel', ctrlKey: platform !== 'MacIntel', preventDefault() {}, ...extra }) };
}
for (const platform of ['MacIntel', 'Win32']) {
  test(`${platform}: delayed cut cannot change canvas behind a modal`, () => { const h = harness(platform, true); h.key(); assert.deepEqual(h.calls, []); });
  test(`${platform}: SELECT retains native keyboard input`, () => { const h = harness(platform); h.key({ target: { tagName: 'SELECT' } }); assert.deepEqual(h.calls, []); });
  test(`${platform}: composition never activates a tool`, () => { const h = harness(platform); h.key({ isComposing: true }); assert.deepEqual(h.calls, []); });
  test(`${platform}: Korean layout supports physical command E`, () => { const h = harness(platform); h.key({ key: 'ㄷ' }); assert.deepEqual(h.calls, ['DELAYED_CUT']); });
}
function menuHarness() {
  const listeners = {};
  const doc = { activeElement: null, addEventListener: (key, fn) => { listeners[key] = fn; } };
  function element() {
    return { listeners: {}, hidden: false, getAttribute() { return null; }, setAttribute() {}, addEventListener(key, fn) { this.listeners[key] = fn; }, focus() { doc.activeElement = this; }, contains(target) { return this === target; } };
  }
  const btn = element(); const items = [element(), element(), element()]; const list = element();
  list.hidden = true; list.querySelectorAll = () => items;
  list.contains = (target) => items.includes(target);
  const context = vm.createContext({ document: doc });
  vm.runInContext(read('top-menu.js').replace('export function', 'function'), context);
  context.btn = btn; context.list = list;
  vm.runInContext('registerTopMenu("file", btn, list)', context);
  function key(target, key) { target.listeners.keydown?.({ key, preventDefault() {}, stopPropagation() {}, target }); }
  return { btn, items, list, doc, key, listeners };
}
test('menu keyboard opens, wraps, jumps to edges and Escape restores trigger focus', () => {
  const h = menuHarness();
  h.key(h.btn, 'ArrowDown'); assert.equal(h.list.hidden, false); assert.equal(h.doc.activeElement, h.items[0]);
  h.key(h.list, 'ArrowUp'); assert.equal(h.doc.activeElement, h.items[2]);
  h.key(h.list, 'Home'); assert.equal(h.doc.activeElement, h.items[0]);
  h.key(h.list, 'End'); assert.equal(h.doc.activeElement, h.items[2]);
  h.listeners.keydown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.equal(h.list.hidden, true); assert.equal(h.doc.activeElement, h.btn);
});

test('platform changes immediately relabel primary, option, and absorbed tooltip shortcuts', () => {
  const stored = new Map();
  const attributes = new Map([
    ['title', ''],
    ['aria-label', '전체화면 (Alt+Enter)'],
    ['data-tip', '프로젝트 저장 (Ctrl+S)'],
  ]);
  const element = {
    closest() { return null; },
    getAttribute(name) { return attributes.get(name) ?? null; },
    setAttribute(name, value) { attributes.set(name, value); },
  };
  const root = { querySelectorAll: () => [element] };
  const context = vm.createContext({
    navigator: { platform: 'MacIntel' },
    localStorage: { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) },
    document: {
      body: root,
      documentElement: { setAttribute() {} },
      createTreeWalker: () => ({ nextNode: () => null }),
      querySelector: () => null,
    },
    window: { dispatchEvent() {} },
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    NodeFilter: { SHOW_TEXT: 4 },
  });
  vm.runInContext(read('platform.js').replace(/export \{[^}]+\};/, ''), context);

  vm.runInContext('setShortcutPlatform("mac"); localizeShortcutLabels()', context);
  assert.equal(attributes.get('aria-label'), '전체화면 (⌥Enter)');
  assert.equal(attributes.get('data-tip'), '프로젝트 저장 (⌘S)');
  assert.equal(vm.runInContext('keyLabel("Alt 설명")', context), 'Alt 설명');
  assert.equal(vm.runInContext('keyLabel("Mac (⌘)")', context), 'Mac (⌘)');
  assert.equal(vm.runInContext('modKey({metaKey:true,ctrlKey:false})', context), true);

  vm.runInContext('setShortcutPlatform("windows"); localizeShortcutLabels()', context);
  assert.equal(attributes.get('aria-label'), '전체화면 (Alt+Enter)');
  assert.equal(attributes.get('data-tip'), '프로젝트 저장 (Ctrl+S)');
  assert.equal(vm.runInContext('modKey({metaKey:false,ctrlKey:true})', context), true);

  vm.runInContext('setShortcutPlatform("auto")', context);
  assert.equal(vm.runInContext('IS_MAC', context), true);
  assert.equal(stored.get('5e.shortcutPlatform'), 'auto');
});

test('the live tool hint rerenders when shortcut platform changes', () => {
  const source = read('tool-hint.js');
  assert.match(source, /addEventListener\("5e:shortcut-platform-change"[\s\S]*sync\(state\.get\(\)\)/);
});
