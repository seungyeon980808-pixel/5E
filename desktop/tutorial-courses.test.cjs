const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
function load(platform, selectors = {}, templates = {}, collections = {}, runtime = {}) {
  const active = { id: null };
  const current = { objects: [], activePageId: 'practice', pages: [] };
  const ctx = vm.createContext({ navigator: { platform }, state: { get: () => current, update: fn => fn(current) }, DEFAULT_STROKE_WIDTH: .2,
    DEFAULT_TEXT_SIZE_MM: 3, DEFAULT_TEXT_FONT: 'test', EQUATION_FONT_FAMILY: 'test', OBJECT_LABEL_TEXT_FONT_FAMILY: 'test',
    TEMPLATES: templates, NODE_DEFAULT_SIZE: 2, document: { querySelector: sel => selectors[sel] || null, querySelectorAll: sel => collections[sel] || [] },
    applyNewObjectStyleDefaults: x => x, setActiveTool: tool => { current.activeTool = tool; }, getActiveSymbolId: () => active.id, makeLine: () => ({}), makePolyline: () => ({}), ...runtime });
  ctx.window ??= ctx;
  ctx.window.addEventListener ??= () => {};
  vm.runInContext(read('platform.js').replace(/export \{[^}]+\};/, ''), ctx);
  vm.runInContext(read('tutorial-labels.js').replace(/^import .*;$/mg, '').replaceAll('export function', 'function'), ctx);
  vm.runInContext(read('tutorial-courses.js').replace(/import\s+[\s\S]*?from\s+"[^\"]+";/g, '').replaceAll('export const', 'const').replaceAll('export function', 'function'), ctx);
  return { current, active, course: id => vm.runInContext(`getCourse(${JSON.stringify(id)})`, ctx), text: t => vm.runInContext(`tutorialText(${JSON.stringify(t)})`, ctx) };
}

function tutorialImportHarness({ fetchImpl, sources = [] } = {}) {
  const input = { files: null, dispatchEvent() {} };
  const overlay = {
    querySelector: selector => selector === '[data-unilib-files]' ? input : null,
    querySelectorAll: selector => selector === '[data-source-id]' ? sources : [],
  };
  class Transfer { constructor() { this.files = []; this.items = { add: file => this.files.push(file) }; } }
  class TutorialFile { constructor(parts, name, options) { this.parts = parts; this.name = name; this.type = options.type; } }
  const selectors = { '.unified-library-overlay:not([hidden])': overlay };
  const runtime = {
    fetch: fetchImpl,
    DataTransfer: Transfer,
    File: TutorialFile,
    Event: class { constructor(type) { this.type = type; } },
    setTimeout: callback => queueMicrotask(callback),
  };
  return { ...load('Win32', selectors, {}, {}, runtime), input, overlay };
}

function examImportStep(h, courseId = 'exam-search') {
  return h.course(courseId).steps.find(step => step.auto?.label === '연습 그림 가져오기');
}

test('missing library import controls stay on the tutorial step with retry available', async () => {
  const h = load('Win32'), step = examImportStep(h), ctx = {};
  assert.equal(await step.auto.run(ctx), false);
  assert.equal(ctx.tutorialExamImport.state, 'failed');
  assert.equal(step.wait.until(ctx), false);
});

test('failed tutorial image fetch retries the real import and advances only after success', async () => {
  let calls = 0;
  const source = { checked: true, closest: () => ({ textContent: '가져온 이미지' }) };
  const h = tutorialImportHarness({
    sources: [source],
    fetchImpl: async () => (++calls === 1 ? { ok: false, status: 503 } : { ok: true, blob: async () => ({ type: 'image/png' }) }),
  });
  const step = examImportStep(h), ctx = {};
  assert.equal(await step.auto.run(ctx), false);
  assert.equal(step.wait.until(ctx), false);
  assert.equal(await step.auto.run(ctx), true);
  assert.equal(calls, 2);
  assert.equal(ctx.tutorialExamImport.state, 'ready');
  assert.equal(step.wait.until(ctx), true);
});

test('missing imported source is a recoverable tutorial failure instead of search progression', async () => {
  const h = tutorialImportHarness({ fetchImpl: async () => ({ ok: true, blob: async () => ({ type: 'image/png' }) }) });
  const step = examImportStep(h, 'trim-exam'), ctx = {};
  assert.equal(await step.auto.run(ctx), false);
  assert.equal(ctx.tutorialExamImport.state, 'failed');
  assert.equal(step.wait.until(ctx), false);
});
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

test('task courses require concrete symbols, drag boxes, and leave the canvas usable', () => {
  const h=load('Win32'), p1=h.course('task-pulley'), p2=h.course('task-spring'), p6=h.course('task-lens');
  for (const c of [p1,p2,p6]) assert.equal(c.steps.at(-1).target(), '#canvas');
  for (const d of [p1.steps[4].demo(), p2.steps[2].demo(), p6.steps[4].demo(), p6.steps[6].demo()]) assert.notDeepEqual(d.from,d.to);
  assert.match(p1.steps.find(s=>s.title.includes('사각형 도구')).title,/사각형 도구/);
});

test('shared symbol tools require both exact armed symbol and generated descriptor', () => {
  const templates={convex_lens:{create:{tool:'OPTICS',kind:'convex_lens'}},object_arrow:{create:{tool:'OPTICS',kind:'object_arrow'}},resistor:{create:{tool:'CIRCUIT',element:'resistor'}},lamp:{create:{tool:'CIRCUIT',element:'lamp'}}};
  const h=load('Win32',{},templates), lens=h.course('task-lens'), circuit=h.course('task-circuit');
  const lensPick=lens.steps.find(s=>s.title.includes('볼록렌즈 고르기')); h.current.activeTool='OPTICS'; h.active.id='object_arrow'; assert.equal(lensPick.wait.until(),false); h.active.id='convex_lens'; assert.equal(lensPick.wait.until(),true);
  const lensPlace=lens.steps.find(s=>s.title.includes('② 점선')); h.current.objects=[{type:'optics',kind:'object_arrow'}]; assert.equal(lensPlace.wait.until(),false); h.current.objects=[{type:'optics',kind:'convex_lens'}]; assert.equal(lensPlace.wait.until(),true);
  const resistor=circuit.steps.find(s=>s.title.includes('저항 고르기')); h.current.activeTool='CIRCUIT';h.active.id='lamp';assert.equal(resistor.wait.until(),false);h.active.id='resistor';assert.equal(resistor.wait.until(),true);
});
test('P9 graph modal has valid targets and no canvas guide/demo dependency', () => {
 const p9=load('Win32').course('task-graph'), [open,confirm]=p9.steps.slice(1,3);
 assert.equal(open.target(),'#graph-tool-open');assert.equal(confirm.target(),'#gm-confirm');assert.doesNotThrow(()=>confirm.guide());assert.equal(confirm.demo().kind,'clicks');assert.equal(confirm.demo().at[0],'#gm-confirm');
});

test('advanced shapes fill tracks only the explicitly prepared rectangle', () => {
 const h=load('Win32'),c=h.course('advanced-shapes');
 const fill=c.steps.find(s=>s.title==='도형의 속을 채워 주세요'),pattern=c.steps.find(s=>s.title==='채우기 종류를 바꿔 보세요'),ctx={};
 h.current.objects=[{id:'other',type:'triangle',fillNone:false,fillStyle:'cross'},{id:'practice',type:'rect',fillNone:false,fillStyle:'solid'}];
 fill.action(ctx);
 assert.equal(ctx.fillShapeId,'practice');assert.equal(h.current.activeTool,'V');assert.deepEqual([...h.current.selectedIds],['practice']);
 assert.equal(h.current.objects[1].fillNone,true);assert.equal(fill.wait.until(ctx),false);assert.equal(pattern.wait.until(ctx),false);
 h.current.objects[0].fillStyle='dots';assert.equal(fill.wait.until(ctx),false);assert.equal(pattern.wait.until(ctx),false);
 h.current.objects[1].fillNone=false;assert.equal(fill.wait.until(ctx),true);assert.equal(pattern.wait.until(ctx),false);
 h.current.objects[1].fillStyle='hatch';assert.equal(pattern.wait.until(ctx),true);
 assert.match(fill.text,/선택 도구.*연습 사각형.*준비했습니다/);assert.match(pattern.text,/같은 연습 사각형/);
});
test('advanced shapes alignment and spacing use line endpoints and expose Apply', () => {
 const h=load('Win32',{'#bulk-apply':{isConnected:true,offsetParent:{},getBoundingClientRect:()=>({width:70,height:30})}}),c=h.course('advanced-shapes');
 const align=c.steps.find(s=>s.title==='직선의 줄을 맞춰 주세요'),gap=c.steps.find(s=>s.title==='직선 사이의 간격을 맞춰 주세요');
 assert.deepEqual([...align.target()],['#bulk-gap-rows','#bulk-apply']);assert.deepEqual([...gap.target()],['#bulk-gap-rows','#bulk-apply']);
 h.current.objects=[
  {id:'a',type:'line',p1:{x:0,y:0},p2:{x:10,y:0}},
  {id:'b',type:'line',p1:{x:20,y:4},p2:{x:30,y:4}},
  {id:'c',type:'line',p1:{x:50,y:8},p2:{x:60,y:8}},
 ];
 assert.equal(align.wait.until(),false);assert.equal(gap.wait.until(),false);
 for(const line of h.current.objects){line.p1.y=3;line.p2.y=3;}assert.equal(align.wait.until(),true);assert.equal(gap.wait.until(),false);
 h.current.objects[2].p1.x=40;h.current.objects[2].p2.x=50;assert.equal(gap.wait.until(),true);
});

test('advanced graph saves only a plane containing both requested expressions', () => {
 const h=load('Win32'), c=h.course('advanced-graph'), finish=c.steps.find(s=>s.title.includes('그래프를 캔버스'));
 h.current.objects=[{id:'p',type:'coordplane'},{type:'funcgraph',planeId:'p',expr:'cos(x)'}];assert.equal(finish.wait.until(),false);
 h.current.objects.push({type:'funcgraph',planeId:'other',expr:'sin(x)'});assert.equal(finish.wait.until(),false);
 h.current.objects.push({type:'funcgraph',planeId:'p',expr:'sin(x)'});assert.equal(finish.wait.until(),true);
});
test('advanced annotation requires selected rich graph and all saved annotation arrays', () => {
 const h=load('Win32'), c=h.course('advanced-graph-annot'), select=c.steps[0], finish=c.steps.at(-2);
 assert.equal(select.wait.until(),false);h.current.objects=[{id:'p',type:'coordplane',richLabels:true}];h.current.selectedIds=['p'];assert.equal(select.wait.until(),true);
 h.current.objects[0].annMarkers=[{}];h.current.objects[0].annGuides=[{}];h.current.objects[0].annArrows=[{}];h.current.objects[0].annLabelPoints=[];assert.equal(finish.wait.until({annotationPlaneId:'p'}),false);h.current.objects[0].annLabelPoints=[{}];assert.equal(finish.wait.until({annotationPlaneId:'p'}),true);assert.equal(finish.wait.until({annotationPlaneId:'other'}),false);
});
test('tutorial guides and demos do not dereference missing task coordinates', () => {
 const h=load('Win32');for(const id of ['task-graph','advanced-graph','advanced-graph-annot'])for(const step of h.course(id).steps){if(step.guide)assert.doesNotThrow(()=>step.guide());if(step.demo)assert.doesNotThrow(()=>step.demo());}
});


test('graph chips match their real y= label, not empty container or similar expressions', () => {
 const items=[], h=load('Win32',{}, {}, {'#gm-chips > button > span:first-child':items});
 const c=h.course('advanced-graph'), sin=c.steps.find(s=>s.title==='사인 함수를 입력합니다'), cos=c.steps.find(s=>s.title==='코사인 함수를 추가합니다');
 assert.equal(sin.wait.until(),false);items.push({textContent:'y=cos(x)'});assert.equal(sin.wait.until(),false);assert.equal(cos.wait.until(),false);items.push({textContent:'y=sin(x)+1'});assert.equal(sin.wait.until(),false);items.push({textContent:'y=sin( x )'});assert.equal(sin.wait.until(),true);assert.equal(cos.wait.until(),true);
});
test('annotation draft advances before Apply without mistaking saved plane for draft', () => {
 const selectors={}, h=load('Win32',selectors), c=h.course('advanced-graph-annot'), marker=c.steps.find(s=>s.title==='표시점을 그래프 위에 놓습니다');
 h.current.objects=[{id:'p',type:'coordplane',richLabels:true}];h.current.selectedIds=['p'];assert.equal(marker.wait.until(),false);
 selectors['#gm-ann-marker-list']={isConnected:true,offsetParent:{},getBoundingClientRect:()=>({width:90,height:20}),children:[{}]};
 assert.equal(marker.wait.until(),true);assert.equal(h.current.objects[0].annMarkers,undefined);
 assert.ok(marker.target().includes('#gm-preview'));
 const finish=c.steps.at(-2);assert.equal(finish.wait.until({annotationPlaneId:'p'}),false);
});

test('graph continuation keeps the source page and accepts grouped or individual series selection',()=>{
 const h=load('Win32'),g=h.course('advanced-graph'),a=h.course('advanced-graph-annot');assert.equal(g.keepPracticeOnFinish,true);
 h.current.objects=[{id:'p',type:'coordplane',richLabels:true},{id:'f',type:'funcgraph',planeId:'p'}];
 for(const ids of [['p','f'],['f']]){h.current.selectedIds=ids;assert.equal(a.steps[0].wait.until(),true)}
 assert.match(a.steps[1].text,/F 키/);assert.match(a.steps[1].wait.hint,/F 키/);
});
test('pendulum angle demo uses exactly the three taught construction points',()=>{
 const p=load('Win32',{}, {anglearc:{create:{tool:'ARC'}}}).course('task-pendulum'),s=p.steps.find(s=>s.text.includes('① 위의 고정점'));assert.equal(s.demo().pts.length,3);assert.match(s.text,/①/);
});

test('exam text deletion never auto-passes merely because one fragment disappeared',()=>{
 const h=load('Win32'),steps=h.course('exam-search').steps,s=steps.find(s=>s.title.includes('③ 화살표와 글자')),previous=steps[steps.indexOf(s)-1],c={};
 h.current.objects=[{id:'incline',type:'polyline'},{id:'arrow',type:'polyline'},{id:'letter1',type:'image'},{id:'letter2',type:'image'}];
 previous.action(c);assert.equal(previous.wait.until(c),false);
 h.current.objects=h.current.objects.filter(o=>o.id!=='arrow');assert.equal(previous.wait.until(c),true);
 s.action(c);assert.deepEqual([...c.tailIds],[]);assert.equal(s.wait.until(c),false);
 h.current.objects=h.current.objects.filter(o=>o.id!=='letter1');assert.equal(s.wait.until(c),false);
 assert.equal(s.auto.run(c),true);assert.equal(s.wait.until(c),true);
 h.current.objects.push({id:'letter1',type:'image'});assert.equal(s.wait.until(c),false);
 assert.equal(s.auto.run(c),true);h.current.objects=h.current.objects.filter(o=>o.id!=='letter2');assert.equal(s.wait.until(c),false);
 h.current.objects=[];assert.equal(s.auto.run(c),false);assert.equal(s.wait.until(c),false);assert.equal(s.auto.replay,true);
});

test('graph annotation placement keeps preview clear without hiding placement buttons',()=>{
 const c=load('Win32').course('advanced-graph-annot');
 for(const s of c.steps.filter(s=>s.coachAlign==='bottom')){assert.equal(s.coachAvoid(),'#gm-preview');assert.ok(s.target().includes('#gm-preview'));assert.equal(s.target().length,2)}
 assert.equal(c.steps.filter(s=>s.coachAlign==='bottom').length,4);
});

test('advanced shape bulk flow selects only lines and exposes reopening after Apply closes modal',()=>{
 const h=load('Win32'),c=h.course('advanced-shapes'),open=c.steps.find(s=>s.title==='전체 통일·수정을 열어 주세요'),gap=c.steps.find(s=>s.title==='직선 사이의 간격을 맞춰 주세요');
 h.current.objects=[{id:'r',type:'rect'},{id:'a',type:'line'},{id:'b',type:'line'},{id:'c',type:'line'}];open.action();
 assert.deepEqual([...h.current.selectedIds],['a','b','c']);assert.equal(h.current.activeTool,'V');assert.equal(gap.target(),'#bulk-edit-open');assert.match(gap.text,/다시 열어/);
});
