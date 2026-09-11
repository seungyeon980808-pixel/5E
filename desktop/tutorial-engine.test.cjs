const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/tutorial.js'), 'utf8');
function harness(steps) {
  const timers = new Map(), listeners = {}, captures = {};
  let seq = 0;
  const element = () => ({ hidden: false, style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, addEventListener() {}, remove() {}, offsetWidth: 360 });
  const ui = Object.fromEntries(['coach','course','count','bar','title','text','autoBtn','doChip','btnNext','btnPrev','halo','root'].map(k => [k, element()]));
  ui.dims = {}; ui.halos = [];
  const c = vm.createContext({ console: { warn() {} }, ui, steps,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    document: { createElement: element, querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; }, addEventListener(n,f,capture) { ((capture ? captures : listeners)[n] ||= []).push(f); }, removeEventListener() {} },
    window: { addEventListener() {}, removeEventListener() {} },
    setTimeout(f) { timers.set(++seq,f); return seq; }, clearTimeout(id) { timers.delete(id); }, clearInterval() {}, cancelAnimationFrame() {},
  });
  vm.runInContext(source.replace(/^import .*;\n/gm, '').replace(/export /g, ''), c);
  vm.runInContext(`
    reposition = () => {}; startDemo = () => {}; stopDemo = () => {};
    ensurePractice = () => {}; resolveTargets = () => []; maybeShowBanner = () => {};
    isDragging = () => false;
    function fresh() { _run = { course: {id:'test', title:'test', steps}, index:0, visit:0,
      timers:new Set(), seen:[],done:[],autoDone:[],autoProgress:[],ctx:{}, ui }; }
    fresh();
  `, c);
  const run = code => vm.runInContext(code, c);
  const flush = () => { for (let i=0;timers.size && i<40;i++) { const batch=[...timers.values()]; timers.clear(); batch.forEach(f=>f()); } };
  return { c, ui, run, flush, timers, listeners, captures, show() {run('showStep()');flush();}, key(extra={}) { const e={code:'Space',key:' ',target:{},preventDefault(){this.prevented=true;},...extra};(captures.keydown || []).forEach(f=>f(e));listeners.keydown.forEach(f=>f(e));return e;} };
}
test('allowPan Space stays available to canvas; ordinary Space advances once', () => {
  const h=harness([{allowPan:true},{},{}]);h.show();h.run('initTutorial()');
  assert.equal(h.key().prevented,undefined);assert.equal(h.run('_run.index'),0);
  h.run('_run.course.steps[0].allowPan=false');assert.equal(h.key().prevented,true);
  h.key();h.key({repeat:true});assert.equal(h.run('_run.index'),1);h.flush();assert.equal(h.run('_run.index'),1);
});
test('next/previous bursts cannot skip steps during transition', () => {
 const h=harness([{},{},{}]);h.show();h.run('goNext();goNext();goPrev()');assert.equal(h.run('_run.index'),1);h.flush();
 h.run('goPrev();goPrev();goNext()');assert.equal(h.run('_run.index'),0);h.flush();
});
test('stale exit, retry and raise callbacks cannot touch restarted run', () => {
 const h=harness([{},{target:'#late'}]);h.show();h.run('goNext()');const old=[...h.timers.values()];
 h.run('fresh()');old.forEach(f=>f());assert.equal(h.run('_run.shown'),undefined);
 h.run('_run.course.steps[0].target="#late";showStep()');const retry=[...h.timers.values()];h.run('fresh()');retry.forEach(f=>f());assert.equal(h.run('_run.shown'),undefined);
});
test('same index on a later visit invalidates scheduled callbacks', () => {
 const h=harness([{}]);h.run('stepTimeout(() => {_run.ctx.bad=true}, 1);_run.visit++');h.flush();assert.equal(h.run('_run.ctx.bad'),undefined);
});
test('skipped automatic step remains available on previous; completed one hides', async () => {
 let calls=0;const h=harness([{auto:{run(){calls++;}}},{}]);h.show();h.run('goNext()');h.flush();h.run('goPrev()');h.flush();assert.equal(h.ui.autoBtn.hidden,false);
 await h.ui.autoBtn.onclick();h.flush();assert.equal(calls,1);h.run('goPrev()');h.flush();assert.equal(h.ui.autoBtn.hidden,true);
});
test('automatic failures do not advance or mark completion and allow retry', async () => {
 for(const failure of [()=>{throw Error('fail')},()=>false,()=>Promise.reject(Error('fail'))]) {
 const h=harness([{auto:{run:failure}},{}]);h.show();await h.ui.autoBtn.onclick();assert.equal(h.run('_run.index'),0);assert.equal(h.run('_run.autoDone[0]'),undefined);assert.equal(h.ui.autoBtn.hidden,false);assert.equal(h.ui.autoBtn.disabled,false);
 }
});
test('replay auto can run again after previous; wait completion does not advance', async () => {
 let calls=0;const h=harness([{auto:{replay:true,run(){calls++;}},wait:{until:()=>false}},{}]);h.show();await h.ui.autoBtn.onclick();assert.equal(h.run('_run.index'),0);
 h.run('goNext()');h.flush();h.run('goPrev()');h.flush();await h.ui.autoBtn.onclick();assert.equal(calls,2);assert.equal(h.ui.autoBtn.hidden,false);
});
test('repeat progress persists when skipped and false signals completion', async () => {
 const counts=[];const h=harness([{auto:{repeat:{label:n=>'part '+n,run:n=>{counts.push(n);return n<1;}}}},{}]);h.show();await h.ui.autoBtn.onclick();assert.equal(h.run('_run.index'),0);
 h.run('goNext()');h.flush();h.run('goPrev()');h.flush();await h.ui.autoBtn.onclick();h.flush();assert.deepEqual(counts,[0,1]);assert.equal(h.run('_run.index'),1);
});
test('pending auto blocks duplicates/navigation and cannot contaminate a restarted run', async () => {
 let resolve,calls=0;const h=harness([{auto:{run(){calls++;return new Promise(r=>resolve=r);}}},{}]);h.show();const click=h.ui.autoBtn.onclick;const pending=click();await click();h.run('goNext()');assert.equal(calls,1);assert.equal(h.run('_run.index'),0);
 h.run('fresh()');resolve();await pending;assert.equal(h.run('_run.autoDone[0]'),undefined);assert.equal(h.run('_run.index'),0);await click();assert.equal(calls,1);
});
test('teardown clears all timers and stale pass cannot advance new run', () => {
 const h=harness([{wait:{}},{}]);h.show();h.run('pass()');const old=[...h.timers.values()];h.run('teardown()');assert.equal(h.timers.size,0);h.run('fresh()');old.forEach(f=>f());assert.equal(h.run('_run.index'),0);
});
test('coach constrains height and keeps wrapping footer reachable by scrolling', () => {
 const css=fs.readFileSync(path.join(__dirname,'../css/tutorial.css'),'utf8');
 assert.match(css,/\.tut-coach \{[^}]*max-height: calc\(100dvh - 24px\);[^}]*overflow-y: auto;/s);
 assert.match(css,/\.tut-coach-foot \{[^}]*position: sticky;[^}]*flex-wrap: wrap;/s);
 assert.match(css,/\.tut-coach\.is-canvas-safe \{[^}]*overflow-y: auto;/s);
});
test('stale raise cannot unlock the replacement run transition', () => {
 const h=harness([{},{}]);h.show();h.run('goNext()');
 const exit=[...h.timers.values()][0];h.timers.clear();exit();const raises=[...h.timers.values()];
 h.run('fresh();_run.transitioning=true');raises.forEach(f=>f());assert.equal(h.run('_run.transitioning'),true);
});
test('automatic failure can succeed on explicit retry', async () => {
 let tries=0;const h=harness([{auto:{run(){if(++tries===1)throw Error('retry');}}},{}]);h.show();await h.ui.autoBtn.onclick();await h.ui.autoBtn.onclick();h.flush();assert.equal(tries,2);assert.equal(h.run('_run.autoDone[0]'),true);assert.equal(h.run('_run.index'),1);
});
test('completed wait auto cannot execute twice via an old handler', async () => {
 let calls=0;const h=harness([{auto:{run(){calls++;}},wait:{}}]);h.show();const click=h.ui.autoBtn.onclick;await click();await click();assert.equal(calls,1);
});
test('old finish cleanup does not reopen picker after a new course started and stopped', async () => {
 const h=harness([{}]);h.c.release=null;h.run('cleanupPracticePage=()=>new Promise(r=>release=r);openPicker=()=>{ui.opened=true};');
 const pending=h.run('finishCourse()');h.run('_runGeneration++;fresh();teardown();release()');await pending;assert.equal(h.ui.opened,undefined);
});
function escapeHarness(step = {}) {
 const h=harness([step]);h.show();h.run('initTutorial();cleanupPracticePage=()=>{ui.cleanup=true};');
 h.escape=extra=>h.key({key:'Escape',code:'Escape',...extra});return h;
}
test('Escape preserves active and previously completed practice without cleanup', () => {
 for(const step of [{wait:{}},{practice:true},{allowPan:true}]) {
 const h=escapeHarness(step);h.escape();assert.equal(h.run('!!_run'),true);assert.equal(h.ui.cleanup,undefined);
 h.run('_run.waiting=false;_run.done[0]=true');h.escape();assert.equal(h.run('!!_run'),true);
 }
});
test('Escape yields for input, textarea, SELECT, contenteditable, IME and consumed keys', () => {
 for(const extra of [{target:{tagName:'INPUT'}},{target:{tagName:'TEXTAREA'}},{target:{tagName:'SELECT'}},{target:{isContentEditable:true}},{isComposing:true},{keyCode:229},{defaultPrevented:true}]) {
 const h=escapeHarness();const e=h.escape(extra);assert.equal(h.run('!!_run'),true);assert.equal(h.ui.cleanup,undefined);assert.equal(e.prevented,undefined);
 }
});
test('open app menu/modal takes Escape even on a non-wait explanatory step', () => {
 for(const selector of ['.modal-overlay:not([hidden])','dialog[open]','[role="menu"]:not([hidden])','.text-ctx-menu:not([hidden])']) {
 const h=escapeHarness();h.c.document.querySelector=s=>s.includes(selector)?{}:null;h.escape();assert.equal(h.run('!!_run'),true);assert.equal(h.ui.cleanup,undefined);
 }
});
test('capture remembers menu/modal before an earlier bubble handler closes it', () => {
 const h=escapeHarness();let open=true;h.c.document.querySelector=()=>open?{}:null;
 const e={key:'Escape',code:'Escape',target:{}};h.captures.keydown.forEach(f=>f(e));open=false;
 h.listeners.keydown.forEach(f=>f(e));assert.equal(h.run('!!_run'),true);assert.equal(h.ui.cleanup,undefined);
});
test('plain explanatory Escape still exits and picker/compare Escape closes only that UI', () => {
 const plain=escapeHarness();plain.escape();assert.equal(plain.run('_run'),null);assert.equal(plain.ui.cleanup,true);
 for(const overlay of ['_picker','_compare']) {
 const h=escapeHarness({wait:{}});h.run(`${overlay}={remove(){}};`);h.escape();assert.equal(h.run(overlay),null);assert.equal(h.run('!!_run'),true);assert.equal(h.ui.cleanup,undefined);
 }
});
function placementHarness({width=684,height=660,vw=1309,vh=818,canvas=false}={}) {
 const h=harness([{}]);const target={};h.c.window.innerWidth=vw;h.c.window.innerHeight=vh;
 h.ui.coach.dataset={};Object.defineProperty(h.ui.coach,'offsetWidth',{get:()=>width});
 Object.defineProperty(h.ui.coach,'offsetHeight',{get:()=>Math.min(height,parseFloat(h.ui.coach.style.maxHeight)||Infinity)});
 h.c.document.getElementById=id=>id==='canvas'&&canvas?target:null;
 h.c.target=target;h.run('_run.nodes=[target]');
 h.place=hole=>{h.c.hole=hole;h.run('placeCoach(ui,hole)');return {x:parseFloat(h.ui.coach.style.left),y:parseFloat(h.ui.coach.style.top),h:h.ui.coach.offsetHeight,side:h.ui.coach.dataset.side};};return h;
}
test('190% UI slider stays exposed by scrolling coach in larger lower space', () => {
 const h=placementHarness();const hole={x:265,y:349,w:765,h:42};const r=h.place(hole);
 assert.equal(r.side,'below');assert.equal(h.ui.coach.style.maxHeight,'401px');assert.ok(r.y>=hole.y+hole.h+14);assert.ok(r.y+r.h<=818-12);
});
test('high zoom target near bottom puts constrained coach above without overlap', () => {
 const h=placementHarness();const hole={x:265,y:610,w:765,h:42};const r=h.place(hole);
 assert.equal(r.side,'above');assert.equal(h.ui.coach.style.maxHeight,'584px');assert.ok(r.y>=12);assert.ok(r.y+r.h<=hole.y-14);
});
test('height constraint resets on next placement and canvas keeps existing dock path', () => {
 const h=placementHarness();h.place({x:265,y:349,w:765,h:42});h.place({x:20,y:30,w:40,h:40});assert.equal(h.ui.coach.style.maxHeight,'');assert.equal(h.ui.coach.dataset.side,'right');
 const c=placementHarness({canvas:true});c.place({x:265,y:349,w:765,h:42});assert.equal(c.ui.coach.style.maxHeight,'');
});
test('no tiny scrolling coach when neither vertical space reaches 160px', () => {
 const h=placementHarness({vh:300});h.place({x:265,y:130,w:765,h:42});assert.equal(h.ui.coach.style.maxHeight,'');
});
function dockHarness(pr) {
 const h=harness([{}]);const canvas={};const classes=new Set();const coach=h.ui.coach;coach.dataset={};
 coach.classList={add:n=>classes.add(n),remove:n=>classes.delete(n)};coach.style.setProperty=(k,v)=>{coach.style[k]=v;};
 h.c.window.innerWidth=1309;h.c.window.innerHeight=818;
 h.c.document.getElementById=id=>id==='canvas'?canvas:null;
 h.c.document.querySelector=s=>s==='#panel-right'?{getBoundingClientRect:()=>pr}:null;
 h.c.canvas=canvas;h.dock=()=>h.run('dockCanvasCoachInPanel(ui,[canvas])');
 h.rect=()=>{const left=parseFloat(coach.style['--tut-dock-left']),width=parseFloat(coach.style['--tut-dock-width']),top=parseFloat(coach.style.top),height=parseFloat(coach.style['--tut-dock-height']);return {left,right:left+width,top,bottom:top+height,width,height};};
 h.classes=classes;return h;
}
for(const [zoom,width] of [[70,145],[100,207],[130,269],[160,331],[190,393]]) {
 test(`${zoom}% UI coach stays inside actual panel bounds and off canvas`,()=>{
  // Panel is deliberately inset from viewport right: viewport docking would be wrong.
  const pr={left:1309-24-width,right:1285,top:95,bottom:780,width,height:685};
  const h=dockHarness(pr);h.dock();const r=h.rect();
  assert.ok(h.classes.has('is-canvas-safe'));assert.equal(r.width,width-16);
  assert.ok(r.left>=pr.left+8);assert.ok(r.right<=pr.right-8);assert.ok(r.top>=pr.top+8);assert.ok(r.bottom<=pr.bottom-8);
  const canvas={left:170,right:pr.left,top:95,bottom:780};
  assert.equal(r.left<canvas.right&&r.right>canvas.left&&r.top<canvas.bottom&&r.bottom>canvas.top,false);
  assert.equal(r.left<=893&&r.right>=893&&r.top<=586&&r.bottom>=586,false);
 });
}
test('dock clips to visible viewport and does not cover inspector targets',()=>{
 const h=dockHarness({left:1150,right:1350,top:40,bottom:900,width:200,height:860});h.dock();const r=h.rect();assert.ok(r.right<=1301);assert.ok(r.bottom<=810);
 h.run('dockCanvasCoachInPanel(ui,[canvas,{closest:()=>true}])');assert.equal(h.classes.has('is-canvas-safe'),false);
});
test('canvas CSS uses measured panel variables rather than fixed 280px or viewport right',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../css/tutorial.css'),'utf8');
 assert.match(css,/left: var\(--tut-dock-left\) !important;/);
 assert.match(css,/width: var\(--tut-dock-width\) !important;/);
 assert.match(css,/max-height: var\(--tut-dock-height\) !important;/);
 assert.doesNotMatch(css,/width: min\(280px/);
 assert.match(css,/\.tut-coach\.is-canvas-safe \.tut-coach-auto \{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/s);
});

test('completed linked course preserves its practice; ordinary finish still offers cleanup', async()=>{
 for(const keep of [true,false]){
  const h=harness([{}]);h.run(`var cleaned=0,picked=0;cleanupPracticePage=async()=>{cleaned++};openPicker=()=>{picked++};_run.practice={practiceId:'p'};_run.course.keepPracticeOnFinish=${keep}`);
  await h.run('finishCourse()');assert.equal(h.run('cleaned'),keep?0:1);assert.equal(h.run('picked'),1);
 }
 const h=harness([{}]);h.run("var cleaned=0;cleanupPracticePage=async()=>{cleaned++};_run.practice={practiceId:'p'};_run.course.keepPracticeOnFinish=true;stopTutorial()");assert.equal(h.run('cleaned'),1);
});
