const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
function harness({fail=false}={}) {
  let finish; const wait = new Promise(r => finish=r); const notices=[];
  const data={ objects:[{id:'a',type:'image',src:'data:image/png;base64,eA=='},{id:'b',locked:true}], selectedIds:['a','b'],activePageId:'p',undoStack:[],redoStack:[1] };
  let clip; let writes=0;
  const ctx={Blob, Promise, JSON, console, navigator:{clipboard:{write: async items=>{writes++; await items[0].data['image/png']; await wait; if(fail)throw Error('denied');}}}, ClipboardItem:class {constructor(data){this.data=data;}}, fetch:async()=>({ok:true,blob:async()=>new Blob(['x'],{type:'image/png'})}),document:{querySelector:()=>null},setTimeout};
  vm.runInNewContext(readFileSync(require.resolve('./editor-cut.mjs'),'utf8').replace('export function createCutHandler','function createCutHandler')+'\nthis.createCutHandler=createCutHandler;',ctx);
  const cut=ctx.createCutHandler({state:{get:()=>data,update:fn=>fn(data)},setClipboard:v=>clip=v,notify:t=>notices.push(t)});
  return {data,cut,finish,notices,get clip(){return clip;},get writes(){return writes;}};
}
test('cut writes before deleting and preserves editable objects with one undo',async()=>{
 const h=harness(); const job=h.cut(); assert.equal(h.writes,1); assert.equal(h.data.objects.length,2); h.finish(); await job;
 assert.deepEqual(h.data.objects.map(o=>o.id),['b']); assert.equal(h.clip[0].src,'data:image/png;base64,eA=='); assert.equal(h.clip.length,1); assert.equal(h.data.undoStack.length,1); assert.equal(h.data.redoStack.length,0);
});
test('denied clipboard never deletes or overwrites internal clipboard',async()=>{const h=harness({fail:true});const job=h.cut();h.finish();await job;assert.equal(h.data.objects.length,2);assert.equal(h.clip,undefined);assert.equal(h.data.undoStack.length,0);assert.match(h.notices[0],/잘라내지 않았/);});
test('switching page while clipboard is pending never deletes new page',async()=>{const h=harness();const job=h.cut();h.data.activePageId='other';h.finish();await job;assert.equal(h.data.objects.length,2);assert.equal(h.clip,undefined);});
test('changed objects and repeated shortcuts are guarded',async()=>{const h=harness();const job=h.cut();await h.cut();assert.equal(h.writes,1);h.data.objects[0].x=12;h.finish();await job;assert.equal(h.data.objects.length,2);assert.equal(h.data.undoStack.length,0);});
test('locked-only selection cannot be cut',async()=>{const h=harness();h.data.selectedIds=['b'];await h.cut();assert.equal(h.writes,0);assert.equal(h.data.objects.length,2);});
function nativeHarness(mouse = null) {
 const {editorCutSource}=require('./editor-cut-source.cjs');
 const source=editorCutSource(readFileSync(require.resolve('../../js/transform.js'),'utf8'));
 const start=source.indexOf('  const handleCanvasShortcut =');
 const end=source.indexOf('  /* -- Arrow keyup:',start);
 const listeners=new Map();const data={objects:[{id:'a',type:'image',x:0,y:0,w:10,h:10}],selectedIds:['a'],viewBox:{x:0,y:0,w:100,h:100},undoStack:[],redoStack:[]};let cuts=0;let modal=false;
 const ctx={window:{addEventListener:(name,fn)=>listeners.set(name,fn)},document:{querySelector:()=>modal?{}:null},state:{get:()=>data,update:fn=>fn(data)},isEditingFieldTarget:t=>t?.tagName==='INPUT',cutSelection:()=>cuts++,_clipboard:null,_lastMouseWorld:mouse,_pasteCounter:0,clipboardBBox:()=>({x:0,y:0,w:10,h:10}),applyDelta:(target,original,dx,dy)=>{target.x=original.x+dx;target.y=original.y+dy;}};
 vm.runInNewContext(source.slice(start,end),ctx);
 const fire=(type,target={tagName:'DIV'})=>{let prevented=false;listeners.get(type)({target,defaultPrevented:false,preventDefault:()=>prevented=true});return prevented;};
 return {data,fire,get cuts(){return cuts;},set modal(value){modal=value;}};
}
test('native macOS cut and copy/paste reach the same canvas commands',()=>{const h=nativeHarness();assert.equal(h.fire('cut'),true);assert.equal(h.cuts,1);h.fire('copy');assert.equal(h.fire('paste'),true);assert.equal(h.data.objects.length,2);assert.notEqual(h.data.objects[0].id,h.data.objects[1].id);assert.equal(h.data.undoStack.length,1);});
test('native clipboard commands leave fields and modal backgrounds untouched',()=>{const h=nativeHarness();h.fire('cut',{tagName:'INPUT'});assert.equal(h.cuts,0);h.modal=true;h.fire('cut');h.fire('copy');h.fire('paste');assert.equal(h.cuts,0);assert.equal(h.data.objects.length,1);});
test('image paste and initialized transform share the same clipboard module URL',()=>{
 const {editorImagePasteSource}=require('./editor-cut-source.cjs');
 const main=readFileSync(require.resolve('../../js/main.js'),'utf8');
 const paste=editorImagePasteSource(readFileSync(require.resolve('../../js/image-paste.js'),'utf8'));
 const moduleUrl=source=>source.match(/from "(\.\/transform\.js\?v=[^"]+)"/)[1];
 assert.equal(moduleUrl(paste),moduleUrl(main));
 assert.match(paste,/if \(hasInternalClipboard\(\)\) return;/);
});

test('paste outside viewport falls back to center while inside pointer is preserved',()=>{
 for (const [mouse,expected] of [[{x:50,y:120},45],[{x:20,y:20},15]]) {
  const h=nativeHarness(mouse);h.fire('copy');h.fire('paste');
  assert.equal(h.data.objects[1].x,expected);assert.equal(h.data.objects[1].y,expected);
 }
});
