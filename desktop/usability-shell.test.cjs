const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('shortcut platform preference changes behavior and labels at runtime', () => {
  const stored = new Map();
  const context = vm.createContext({
    navigator: { platform: 'MacIntel' },
    localStorage: { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
    document: { documentElement: { setAttribute() {} }, body: null, querySelector() { return null; } },
  });
  vm.runInContext(read('js/platform.js').replace(/export \{[^}]+\};/, ''), context);
  assert.equal(vm.runInContext('modKey({metaKey:true,ctrlKey:false})', context), true);
  vm.runInContext('setShortcutPlatform("windows")', context);
  assert.equal(vm.runInContext('modKey({metaKey:true,ctrlKey:false})', context), false);
  assert.equal(vm.runInContext('modKey({metaKey:false,ctrlKey:true})', context), true);
  assert.equal(vm.runInContext('keyLabel("Ctrl+S")', context), 'Ctrl+S');
  assert.equal(stored.get('5e.shortcutPlatform'), 'windows');
});

test('native fullscreen bridge exposes event-backed state', () => {
  const exposed = {};
  const listeners = new Map();
  const ipcRenderer = {
    invoke: (channel) => channel,
    send() {},
    on: (channel, listener) => listeners.set(channel, listener),
    removeListener: (channel, listener) => {
      if (listeners.get(channel) === listener) listeners.delete(channel);
    },
  };
  const context = vm.createContext({
    require: () => ({ contextBridge: { exposeInMainWorld: (name, value) => { exposed[name] = value; } }, ipcRenderer }),
    window: { addEventListener: (_name, callback) => callback() },
    document: { documentElement: { classList: { add() {} } } },
    process: { platform: 'darwin' },
    Boolean,
  });
  vm.runInContext(read('desktop/preload.cjs'), context);
  assert.equal(exposed.fiveEDesktop.fullscreen.get(), 'window:get-fullscreen');
  const states = [];
  const remove = exposed.fiveEDesktop.fullscreen.onChange(active => states.push(active));
  listeners.get('window:fullscreen-changed')({}, true);
  assert.deepEqual(states, [true]);
  remove();
  assert.equal(listeners.has('window:fullscreen-changed'), false);
});

test('global controls remain in the canvas toolbar while the inspector is collapsible', () => {
  const html = read('index.html');
  const controlsStart = html.indexOf('class="canvas-global-controls"');
  const controlsEnd = html.indexOf('</div>', controlsStart);
  const controls = html.slice(controlsStart, controlsEnd);
  const inspectorStart = html.indexOf('id="panel-right"');
  const inspectorEnd = html.indexOf('</aside>', inspectorStart);
  const inspector = html.slice(inspectorStart, inspectorEnd);
  assert.ok(controlsStart >= 0, 'toolbar owns a stable global controls group');
  assert.match(controls, /id="theme-toggle"/);
  assert.match(controls, /id="fullscreen-toggle"/);
  assert.match(controls, /id="drawer-right-toggle"/);
  assert.doesNotMatch(inspector, /id="theme-toggle"|id="fullscreen-toggle"/);
});

test('hidden MCP entrypoints, focus modality, native title inset, and centered credit are wired', () => {
  assert.doesNotMatch(read('js/mcp-bridge.js'), /\.hidden\s*=\s*false/);
  assert.match(read('index.html'), /id="mcp-bridge-btn"[^>]*data-mcp-entrypoint[^>]*hidden/);
  const css = read('css/style.css');
  assert.match(css, /#canvas:focus-visible\s*\{[^}]*outline:\s*none/s);
  assert.match(css, /\.tool-btn:focus-visible,[\s\S]*?outline:\s*2px\s+solid\s+var\(--accent\)/s);
  assert.match(css, /\[data-mcp-entrypoint\]\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(css, /\.desktop-shell\.platform-darwin\s+\.desktop-titlebar\s*\{[^}]*padding-inline-start:\s*78px/s);
  assert.match(css, /\.app-footer-copyright\s*\{[^}]*position:\s*absolute;[^}]*left:\s*50%;[^}]*transform:\s*translateX\(-50%\)/s);
});

test('native close shortcut accepts the platform command key without extra modifiers', () => {
  const source = read('desktop/main.cjs');
  const start = source.indexOf('function isWindowCloseShortcut');
  const end = source.indexOf('\n}\n', start) + 3;
  const context = vm.createContext({ process: { platform: 'darwin' } });
  vm.runInContext(source.slice(start, end), context);
  const input = (extra = {}) => ({ type: 'keyDown', key: 'w', meta: false, control: false, alt: false, shift: false, ...extra });
  context.input = input({ meta: true });
  assert.equal(vm.runInContext('isWindowCloseShortcut(input, "darwin")', context), true);
  context.input = input({ control: true });
  assert.equal(vm.runInContext('isWindowCloseShortcut(input, "win32")', context), true);
  context.input = input({ meta: true, shift: true });
  assert.equal(vm.runInContext('isWindowCloseShortcut(input, "darwin")', context), false);
  context.input = input({ meta: true, isAutoRepeat: true });
  assert.equal(vm.runInContext('isWindowCloseShortcut(input, "darwin")', context), false);
  context.input = input({ meta: true, isComposing: true });
  assert.equal(vm.runInContext('isWindowCloseShortcut(input, "darwin")', context), false);
});
