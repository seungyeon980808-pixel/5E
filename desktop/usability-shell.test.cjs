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

test('native fullscreen bridge, hidden MCP control, focus modality, and centered credit are wired', () => {
  assert.match(read('desktop/preload.cjs'), /fullscreen:\s*\{[\s\S]*toggle:/);
  assert.match(read('desktop/main.cjs'), /ipcMain\.handle\("window:toggle-fullscreen"[\s\S]*isFullScreen\(\)/);
  assert.doesNotMatch(read('js/mcp-bridge.js'), /\.hidden\s*=\s*false/);
  assert.match(read('index.html'), /id="canvas"[\s\S]*tabindex="0"/);
  const css = read('css/style.css');
  assert.match(css, /#canvas:focus-visible\s*\{/);
  assert.match(css, /\.app-footer-copyright\s*\{[^}]*position:\s*absolute;[^}]*left:\s*50%;[^}]*transform:\s*translateX\(-50%\)/s);
});
