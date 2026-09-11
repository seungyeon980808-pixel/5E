const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
function load(platform, selectors = {}) {
  const current = { objects: [], activePageId: 'practice', pages: [] };
  const ctx = vm.createContext({ navigator: { platform }, state: { get: () => current }, DEFAULT_STROKE_WIDTH: .2,
    DEFAULT_TEXT_SIZE_MM: 3, DEFAULT_TEXT_FONT: 'test', EQUATION_FONT_FAMILY: 'test', OBJECT_LABEL_TEXT_FONT_FAMILY: 'test',
    TEMPLATES: {}, NODE_DEFAULT_SIZE: 2, document: { querySelector: sel => selectors[sel] || null },
    applyNewObjectStyleDefaults: x => x, setActiveTool: () => {}, makeLine: () => ({}), makePolyline: () => ({}) });
  vm.runInContext(read('platform.js').replace(/export \{[^}]+\};/, ''), ctx);
  vm.runInContext(read('tutorial-labels.js').replace(/^import .*;$/mg, '').replaceAll('export function', 'function'), ctx);
  vm.runInContext(read('tutorial-courses.js').replace(/import\s+[\s\S]*?from\s+"[^\"]+";/g, '').replaceAll('export const', 'const').replaceAll('export function', 'function'), ctx);
  return { current, course: id => vm.runInContext(`getCourse(${JSON.stringify(id)})`, ctx), text: t => vm.runInContext(`tutorialText(${JSON.stringify(t)})`, ctx) };
}
for (const platform of ['MacIntel', 'Win32']) {
  test(`${platform}: tutorial separates command modifiers from mouse snap`, () => {
    const h = load(platform), mac = platform === 'MacIntel';
    assert.equal(h.text('Ctrl+Z · Ctrl 을 누른 채'), mac ? 'Command(⌘)+Z · Option(⌥) 을 누른 채' : 'Ctrl+Z · Ctrl 을 누른 채');
    const snap = h.course('incline-figure').steps.find(s => s.title.includes('양 끝'));
    assert.match(snap.demo().mod, mac ? /Option/ : /Ctrl/);
    assert.match(snap.text, mac ? /Option/ : /Ctrl/);
    const textStep = h.course('incline-figure').steps.find(s => s.title.includes("'수평면'"));
    assert.match(textStep.wait.hint, /^Enter/);
    assert.doesNotMatch(textStep.text, /확정이 Enter 가 아니라/);
  });
}
test('basic essential editing is reachable before course completion', () => {
  const h = load('MacIntel'), c = h.course('basics');
  for (const name of ['직접 사각형', '삭제해', '실행 취소', '다시 실행', '복사해서', '잘라내기', '다시 붙여넣기', '페이지를 바꿔', '돌아오기', '파일로 저장', '다시 열기']) {
    assert.ok(c.steps.some(s => s.title.includes(name)), name);
  }
  assert.equal(c.steps.at(-1).title, '완성되었습니다');
  assert.equal(c.steps.find(s => s.title.startsWith('가운데')).allowPan, true);
  assert.equal(c.steps.find(s => s.auto?.label === '연습감 놓기').auto.replay, true);
});
test('stroke change must be performed, not pass on default 0.2mm', () => {
  const h = load('Win32'), step = h.course('basics').steps.find(s => s.title.includes('오른쪽에서 다듬기'));
  h.current.objects = [{ id: 'rect', type: 'rect', strokeWidth: .2 }];
  const c = {}; step.action(c); assert.equal(step.wait.until(c), false);
  h.current.objects[0].strokeWidth = .4; assert.equal(step.wait.until(c), true);
});
test('deletion cannot pass just by switching to another page', () => {
  const h = load('Win32'), step = h.course('basics').steps.find(s => s.title.includes('삭제해'));
  h.current.objects = [{ id: 'rect', type: 'rect' }]; const c = { editPage: 'practice', drawIds: [] }; step.action(c);
  h.current.activePageId = 'other'; h.current.objects = []; assert.equal(step.wait.until(c), false);
  h.current.activePageId = 'practice'; assert.equal(step.wait.until(c), true);
});
test('file picker cancellation is never automatically marked successful', () => {
  const c = load('Win32').course('basics');
  for (const s of c.steps.filter(s => /프로젝트 파일로 저장|저장한 프로젝트 다시 열기/.test(s.title))) {
    assert.equal(s.wait, undefined); assert.match(s.text, /취소/);
  }
});

test('wrong existing object deletion does not pass', () => {
 const h=load('Win32'), step=h.course('basics').steps.find(s=>s.title.includes('삭제해'));
 h.current.objects=[{id:'line',type:'line'},{id:'new',type:'rect'}];
 const c={editPage:'practice',drawIds:['line']};step.action(c);
 h.current.objects=[{id:'new',type:'rect'}];assert.equal(step.wait.until(c),false);
});
test('clipboard tasks use explicit visual confirmation, not unrelated object count',()=>{
 const c=load('MacIntel').course('basics');
 for(const title of ['복사해서 붙여넣기','잘라내기','잘라낸 도형 다시 붙여넣기']){
 const step=c.steps.find(s=>s.title===title);assert.equal(step.wait,undefined);assert.equal(step.allowPan,true);assert.match(step.text,/확인한 뒤/);
 }
});

test('move snapping teaches grabbing before Shift, unlike constrained creation', () => {
  const c=load('MacIntel').course('incline-figure');
  const moves=c.steps.filter(s=>s.title.includes('잡은 뒤 Shift'));
  assert.equal(moves.length,2);
  for(const s of moves){assert.match(s.text,/마우스로 먼저 잡으세요/);assert.match(s.demo().mod,/잡은 뒤/);}
  assert.match(c.steps.find(s=>s.title.includes('정사각형으로')).demo().mod,/Shift 누른 채/);
});
test('text confirmation labels agree and do not promise unverified native modifier newline', () => {
  const source=read('text-editor.js'), hints=read('tool-hint.js');
  assert.doesNotMatch(source,/hint.textContent = "Enter 확인 · Ctrl\+Enter 줄바꿈/);
  assert.match(hints,/keys: "Enter: 입력 완료 · Esc: 취소"/);
  assert.doesNotMatch(load('MacIntel').course('incline-figure').steps.find(s=>s.title.includes("'수평면'")).text,/Enter.*줄을 바/);
});


test('ready steps recognize settings opened before the animated transition', () => {
  const selectors={}, h=load('MacIntel',selectors), steps=h.course('basics').steps;
  const menu=steps.find(s=>s.wait?.click==='#settings-menu-btn');
  const prefs=steps.find(s=>s.wait?.click==='#open-screen');
  assert.equal(menu.wait.until(),false);assert.equal(prefs.wait.until(),false);
  selectors['#pref-zoom']={isConnected:true,offsetParent:{},getBoundingClientRect:()=>({width:100,height:20})};
  assert.equal(menu.wait.until(),true);assert.equal(prefs.wait.until(),true);
  selectors['#pref-zoom'].offsetParent=null;
  assert.equal(prefs.wait.until(),false);
});
