const test = require('node:test');
const assert = require('node:assert/strict');
const { appMenuTemplate, installAppMenu } = require('./app-menu.cjs');

test('맥 메뉴: 앱 메뉴 + 편집 메뉴(⌘Z·⇧⌘Z·⌘X·⌘C·⌘V·⌘A), ⇧⌘V와 겹치는 항목 없음', () => {
  const [appMenu, edit] = appMenuTemplate('5E');
  assert.deepEqual(appMenu.submenu.map(i => i.role).filter(Boolean), ['about', 'hide', 'hideOthers', 'unhide', 'quit']);
  assert.equal(edit.label, '편집');
  assert.deepEqual(edit.submenu.map(i => i.role).filter(Boolean), ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']);
  const roles = appMenuTemplate('5E').flatMap(m => m.submenu.map(i => i.role));
  assert.ok(!roles.includes('pasteAndMatchStyle') && !roles.includes('delete'));
  assert.ok(appMenuTemplate('5E').every(m => m.submenu.every(i => !i.accelerator)), '단축키는 역할 기본값만 쓴다');
});

test('맥이 아니면 메뉴 막대를 두지 않는다', () => {
  const calls = [];
  const Menu = { buildFromTemplate: t => ({ t }), setApplicationMenu: m => calls.push(m) };
  assert.equal(installAppMenu({ Menu, app: { name: '5E' }, platform: 'win32' }), null);
  assert.deepEqual(calls, [null]);
  const menu = installAppMenu({ Menu, app: { name: '5E' }, platform: 'darwin' });
  assert.equal(calls[1], menu);
  assert.equal(menu.t[1].label, '편집');
});
