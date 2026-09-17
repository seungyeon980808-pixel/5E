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

test('native fullscreen removes the custom title strip while retaining the windowed drag region', () => {
  const main = read('js/main.js');
  const css = read('css/style.css');
  assert.match(main, /document\.documentElement\.classList\.toggle\(\s*["']is-native-fullscreen["'],\s*Boolean\(active\)\s*\)/s);
  assert.match(css, /\.desktop-shell\.is-native-fullscreen\s+\.desktop-titlebar\s*\{[^}]*display:\s*none/s);
  assert.match(css, /\.desktop-shell\s+\.desktop-titlebar\s*\{[^}]*-webkit-app-region:\s*drag/s);
});

test('web maximization avoids browser fullscreen and survives Escape; graph follows dialog state', async () => {
  const source = read('js/main.js');
  const fullscreen = source.slice(source.indexOf('/* ===== APP FULLSCREEN'), source.indexOf('(function initGraphLauncherState()'));
  const graphLauncher = source.slice(source.indexOf('(function initGraphLauncherState()'), source.indexOf('/* ===== THEME TOGGLE'));
  const listeners = new Map();
  const buttonListeners = new Map();
  const classes = new Set();
  const attrs = new Map();
  const fullscreenButton = {
    addEventListener: (name, listener) => buttonListeners.set(name, listener),
    setAttribute: (name, value) => attrs.set(name, value),
    getAttribute: (name) => attrs.get(name),
    title: '',
  };
  const root = {
    classList: { toggle: (name, active) => active ? classes.add(name) : classes.delete(name) },
    requestFullscreen: async () => { assert.fail('web must not enter browser fullscreen'); },
  };
  const document = {
    documentElement: root,
    fullscreenElement: null,
    getElementById: (id) => id === 'fullscreen-toggle' ? fullscreenButton : null,
    addEventListener: (name, listener) => listeners.set(name, listener),
    exitFullscreen: async () => { assert.fail('web must not exit browser fullscreen'); },
  };
  const keyboardCalls = [];
  const navigator = { keyboard: {
    async lock(keys) { keyboardCalls.push([...keys]); },
    unlock() { keyboardCalls.push('unlock'); },
  } };
  const context = vm.createContext({ document, navigator, window: { addEventListener: (name, fn) => listeners.set(name, fn) }, console, Boolean });
  vm.runInContext(fullscreen, context);
  await buttonListeners.get('click')();
  assert.deepEqual(keyboardCalls, []);
  assert.equal(attrs.get('aria-pressed'), 'true');
  assert.equal(classes.has('is-workspace-maximized'), true);
  assert.equal(attrs.get('aria-label'), '작업영역 최대화 해제');
  listeners.get('keydown')({ key: 'Escape', preventDefault() { assert.fail('maximize handler must ignore Escape'); } });
  assert.equal(classes.has('is-workspace-maximized'), true);
  await buttonListeners.get('click')();
  assert.deepEqual(keyboardCalls, []);
  assert.equal(attrs.get('aria-pressed'), 'false');
  assert.equal(classes.has('is-workspace-maximized'), false);
  listeners.get('keydown')({ key: 'Enter', altKey: true, preventDefault() {} });
  assert.equal(classes.has('is-workspace-maximized'), true);

  const graphAttrs = new Map();
  const graphClasses = new Set();
  const graphButton = {
    classList: { toggle: (name, active) => active ? graphClasses.add(name) : graphClasses.delete(name) },
    setAttribute: (name, value) => graphAttrs.set(name, value),
    addEventListener() {},
  };
  const graphContext = vm.createContext({
    document: { documentElement: {}, getElementById: () => graphButton, querySelector: () => ({}) },
    MutationObserver: class MutationObserver { observe() {} disconnect() {} },
    requestAnimationFrame: (callback) => callback(),
  });
  vm.runInContext(graphLauncher, graphContext);
  assert.equal(graphClasses.has('is-open'), true);
  assert.equal(graphAttrs.get('aria-expanded'), 'true');
});

test('selected controls have one blue fill and keyboard-only focus has one unclipped outer cue', () => {
  const css = read('css/style.css');
  assert.match(css, /\.advanced-tool-btn\.is-active,[\s\S]*?\.advanced-tool-btn\.is-open\s*\{[\s\S]*?color:\s*#fff;[\s\S]*?background:\s*var\(--btn-tool-active\);/s);
  assert.match(css, /\.tool-btn\.is-active,[\s\S]*?#fullscreen-toggle\[aria-pressed="true"\]\s*\{[\s\S]*?background:\s*var\(--btn-tool-active\);/s);
  assert.match(css, /\.tool-btn:focus-visible,[\s\S]*?outline:\s*2px solid var\(--text-primary\);[\s\S]*?outline-offset:\s*2px;[\s\S]*?box-shadow:\s*none;/s);
  assert.match(css, /\.tool-btn:focus:not\(:focus-visible\)[\s\S]*?box-shadow:\s*none;/s);
});

test('theme and fullscreen controls live in the collapsible inspector header with a toolbar reopen control', () => {
  const html = read('index.html');
  const controlsStart = html.indexOf('class="canvas-global-controls"');
  const controlsEnd = html.indexOf('</div>', controlsStart);
  const controls = html.slice(controlsStart, controlsEnd);
  const inspectorStart = html.indexOf('id="panel-right"');
  const inspectorEnd = html.indexOf('</aside>', inspectorStart);
  const inspector = html.slice(inspectorStart, inspectorEnd);
  assert.ok(controlsStart >= 0, 'toolbar owns the inspector reopen control');
  assert.match(controls, /id="drawer-right-toggle"/);
  assert.doesNotMatch(controls, /id="theme-toggle"|id="fullscreen-toggle"/);
  assert.match(inspector, /class="panel-utility-bar panel-utility-bar-right"[\s\S]*id="theme-toggle"[\s\S]*id="fullscreen-toggle"[\s\S]*data-panel-internal-toggle="right"/);
  assert.equal((html.match(/id="theme-toggle"/g) || []).length, 1);
  assert.equal((html.match(/id="fullscreen-toggle"/g) || []).length, 1);
});

test('file, settings, and tutorial controls are accessible icon-only SVG buttons', () => {
  const html = read('index.html');
  const button = (id) => html.match(new RegExp(`<button[^>]*id="${id}"[\\s\\S]*?</button>`))?.[0] || '';
  const file = button('file-menu-btn');
  const settings = button('settings-menu-btn');
  const tutorial = button('tutorial-btn');
  for (const [markup, name] of [[file, '파일'], [settings, '설정'], [tutorial, '튜토리얼']]) {
    assert.match(markup, new RegExp(`aria-label="${name}"`));
    assert.match(markup, new RegExp(`data-shell-tip="${name}"`));
    assert.match(markup, /<svg[^>]*aria-hidden="true"/);
    assert.doesNotMatch(markup.replace(/<svg[\s\S]*?<\/svg>/, '').replace(/<span[^>]*aria-hidden="true"[\s\S]*?<\/span>/, ''), new RegExp(`>${name}[^<]*<`));
  }
  for (const markup of [file, settings]) {
    assert.doesNotMatch(markup, /shell-menu-chevron|shell-icon-button-menu/);
    assert.match(markup, /aria-haspopup="true" aria-expanded="false"/);
  }
  assert.doesNotMatch(tutorial, /shell-menu-chevron/);

  const css = read('css/style.css');
  assert.match(css, /\.shell-icon-button:(?:hover|focus)[^{]*::after/s);
  assert.match(css, /\.shell-icon-button\[aria-expanded="true"\]::after\s*\{[^}]*(?:opacity:\s*0|visibility:\s*hidden)/s,
    'an expanded icon menu must suppress its trigger tooltip so menu items remain clear');
  assert.doesNotMatch(read('js/tutorial.js'), /tutorialButton\.appendChild\(beta\)/,
    'tutorial initialization must not append a visible beta badge into the icon-only control');
});

test('hidden MCP entrypoints, focus modality, native title inset, and centered credit are wired', () => {
  assert.doesNotMatch(read('js/mcp-bridge.js'), /\.hidden\s*=\s*false/);
  assert.match(read('index.html'), /id="mcp-bridge-btn"[^>]*data-mcp-entrypoint[^>]*hidden/);
  const css = read('css/style.css');
  assert.match(css, /#canvas:focus-visible\s*\{[^}]*outline:\s*none/s);
  assert.match(css, /\.tool-btn:focus-visible,[\s\S]*?outline:\s*2px\s+solid\s+var\(--text-primary\);[\s\S]*?outline-offset:\s*2px/s);
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
