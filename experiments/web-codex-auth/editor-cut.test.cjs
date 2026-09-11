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
 const {editorCutSource,editorImagePasteSource}=require('./editor-cut-source.cjs');
 const source=editorCutSource(readFileSync(require.resolve('../../js/transform.js'),'utf8'));
 const listeners=new Map();const clipboard=new Map();
 const data={objects:[{id:'a',type:'image',x:0,y:0,w:10,h:10}],selectedIds:['a'],viewBox:{x:0,y:0,w:100,h:100},undoStack:[],redoStack:[]};let modal=false;
 const state={get:()=>data,update:fn=>fn(data)};
 const ctx={console,Map,Set,Date,JSON,state,getLastMouseWorld:()=>mouse,
  OBJECT_TYPE_IDS:['image'],SIZE_TYPES:new Set(['image']),TEXT_MEASURED_TYPES:new Set(),ENDPOINT_HANDLE_TYPES:new Set(),
  blocksCanvasShortcut:event=>modal || event.target?.tagName==='INPUT',isEditingFieldTarget:target=>target?.tagName==='INPUT',
  showAlert:()=>{},rebuildGroups:()=>{},clipboardBBox:()=>({x:0,y:0,w:10,h:10}),
  applyDelta:(target,original,dx,dy)=>{target.x=original.x+dx;target.y=original.y+dy;},
  document:{addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);}}};
 const moduleBody=value=>value.replace(/^import[^\n]*\n/gm,'').replace(/\bexport /g,'');
 const clipboardSource=readFileSync(require.resolve('../../js/editor-clipboard.js'),'utf8');
 vm.runInNewContext(moduleBody(clipboardSource),ctx);
 const insertStart=source.indexOf('export function instantiateObjectsAt(');
 const insertEnd=source.indexOf('\nfunction clipboardBBox(',insertStart);
 vm.runInNewContext(moduleBody(source.slice(insertStart,insertEnd)),ctx);
 const initStart=source.indexOf('  initObjectClipboard(state, objects => {');
 const initEnd=source.indexOf('  }, rebuildGroups);',initStart)+'  }, rebuildGroups);'.length;
 assert.ok(initStart>=0 && initEnd>initStart,'native clipboard setup exists');
 vm.runInNewContext(source.slice(initStart,initEnd),ctx);
 vm.runInNewContext(moduleBody(editorImagePasteSource(readFileSync(require.resolve('../../js/image-paste.js'),'utf8')))+'\ninitImagePaste(state, null);',ctx);
 const fire=(type,target={tagName:'DIV'},write=(_,value)=>value)=>{
  const event={target,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},
   clipboardData:{setData:(key,value)=>clipboard.set(key,write(key,value)),getData:key=>clipboard.get(key)||'',
    get items(){throw Error('native object paste must not read external image items');}}};
  for(const listener of listeners.get(type))listener(event);
  return event.defaultPrevented;
 };
 return {data,fire,set modal(value){modal=value;}};
}
test('native macOS cut and copy/paste reach the same canvas commands',()=>{
 const cut=nativeHarness();assert.equal(cut.fire('cut'),true);assert.equal(cut.data.objects.length,0);assert.equal(cut.data.undoStack.length,1);
 const h=nativeHarness();assert.equal(h.fire('copy'),true);assert.equal(h.fire('paste'),true);assert.equal(h.data.objects.length,2);assert.notEqual(h.data.objects[0].id,h.data.objects[1].id);assert.equal(h.data.undoStack.length,1);
});
test('native clipboard commands leave fields and modal backgrounds untouched',()=>{
 const h=nativeHarness();for(const type of ['cut','copy','paste'])assert.equal(h.fire(type,{tagName:'INPUT'}),false);
 h.modal=true;for(const type of ['cut','copy','paste'])assert.equal(h.fire(type),false);
 assert.equal(h.data.objects.length,1);assert.equal(h.data.undoStack.length,0);
});
test('image paste and initialized transform share the same clipboard module URL',()=>{
 const {editorImagePasteSource}=require('./editor-cut-source.cjs');
 const main=readFileSync(require.resolve('../../js/main.js'),'utf8');
 const paste=editorImagePasteSource(readFileSync(require.resolve('../../js/image-paste.js'),'utf8'));
 const moduleUrl=source=>source.match(/from "(\.\/transform\.js\?v=[^"]+)"/)[1];
 assert.equal(moduleUrl(paste),moduleUrl(main));
 assert.match(paste,/if \(event.defaultPrevented \|\|/);
});
test('paste outside viewport falls back to center while inside pointer is preserved',()=>{
 for (const [mouse,expected] of [[{x:50,y:120},45],[{x:20,y:20},15]]) {
  const h=nativeHarness(mouse);h.fire('copy');h.fire('paste');
  assert.equal(h.data.objects[1].x,expected);assert.equal(h.data.objects[1].y,expected);
 }
});
test('native cut denied by the clipboard leaves originals and undo untouched',()=>{
 const h=nativeHarness();h.fire('cut',undefined,()=>{throw Error('denied');});
 assert.equal(h.data.objects.length,1);assert.equal(h.data.undoStack.length,0);
});
