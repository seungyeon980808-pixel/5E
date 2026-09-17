const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../js/text-editor.js'), 'utf8');

test('right click during a text draft never opens an empty context menu', () => {
  const events = {};
  const menu = { hidden: true, style: {} };
  const sandbox = {
    _svg: { addEventListener: (type, fn) => { events[type] = fn; } },
    _state: { get: () => ({ draftText: { editingType: 'labeler' } }) },
    window: { addEventListener() {}, innerWidth: 1280, innerHeight: 720 },
    _ctxMenu: menu, _ctxEditItem: { style: {} }, _buildCtxMenu() {},
    _closeCtxMenu() { menu.hidden = true; },
  };
  vm.runInNewContext(source.slice(source.indexOf('function setupTextContextMenu()')) + '\nsetupTextContextMenu();', sandbox);
  let prevented = false;
  events.contextmenu({ clientX: 500, clientY: 300, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(menu.hidden, true, 'empty dark context menu must not remain visible');
});
