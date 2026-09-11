const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function load() {
  const listeners = {}, alerts = [];
  const sandbox = { console, JSON, Map, Set, Date, Array, Object, String,
    OBJECT_TYPE_IDS: ['rect', 'image', 'coordplane', 'funcgraph'],
    SIZE_TYPES: new Set(['rect','image','coordplane']), TEXT_MEASURED_TYPES:new Set(), ENDPOINT_HANDLE_TYPES:new Set(),
    blocksCanvasShortcut: e => !!e.blocked,
    showAlert: message => alerts.push(message),
    document: { addEventListener(type, fn) { listeners[type] = fn; } },
  };
  const source = fs.readFileSync(path.join(root, 'js/editor-clipboard.js'), 'utf8')
    .replace(/^import\s+[\s\S]*?;\r?\n/gm, '').replace(/\bexport\s+/g, '');
  vm.runInNewContext(source + '\nglobalThis.api={initObjectClipboard,cloneClipboardObjects};', sandbox);
  return { ...sandbox.api, listeners, alerts };
}
const plain = value => JSON.parse(JSON.stringify(value));
function fixture(api) {
  const value = { objects: [{id:'one',type:'rect',x:0,y:0,w:10,h:10}, {id:'locked',type:'rect',locked:true}], selectedIds:['one','locked'], undoStack:[], redoStack:[[]] };
  const state = {get:()=>value,update(fn){fn(value)}};
  const pasted = [];
  api.initObjectClipboard(state, objects => pasted.push(plain(objects)), () => {});
  return {value, pasted};
}
function event(data = new Map(), extras = {}) {
  return { clipboardData:{setData:(k,v)=>data.set(k,v),getData:k=>data.get(k)||''}, prevented:false, preventDefault(){this.prevented=true}, ...extras };
}
test('cut writes data before deleting only mutable objects; native paste consumes exactly once', () => {
  const api=load(), f=fixture(api), data=new Map();
  const cut=event(data); api.listeners.cut(cut);
  assert.equal(cut.prevented,true); assert.deepEqual(f.value.objects.map(o=>o.id),['locked']);
  assert.equal(f.value.undoStack.length,1); assert.equal(f.value.redoStack.length,0);
  const paste=event(data); api.listeners.paste(paste);
  assert.equal(f.pasted.length,1); assert.equal(f.pasted[0][0].id,'one'); assert.equal(paste.prevented,true);
});
test('failed clipboard write never deletes selected originals', () => {
  const api=load(), f=fixture(api), before=plain(f.value);
  api.listeners.cut(event(new Map(),{clipboardData:{setData(){throw Error('denied')}}}));
  assert.deepEqual(plain(f.value),before); assert.equal(api.alerts.length,1);
});
test('external image or text after internal copy is never replaced by a stale object clipboard', () => {
  const api=load(), f=fixture(api); api.listeners.copy(event());
  for (const data of [new Map(),new Map([['text/plain','external text']])]) {
    const paste=event(data); api.listeners.paste(paste); assert.equal(paste.prevented,false);
  }
  assert.equal(f.pasted.length,0);
});
test('input fields and modals retain native copy cut and paste', () => {
  const api=load(),f=fixture(api),before=plain(f.value);
  for(const name of ['copy','cut','paste']) {const e=event(new Map(),{blocked:true});api.listeners[name](e);assert.equal(e.prevented,false);}
  assert.deepEqual(plain(f.value),before);
});
test('clones remap group and plane references and remain unique in the same millisecond', () => {
  const api=load(); const objects=[{id:'p',type:'coordplane',groupId:'g'},{id:'f',type:'funcgraph',planeId:'p',groupId:'g'}];
  const clones=api.cloneClipboardObjects(objects),again=api.cloneClipboardObjects(objects);
  assert.notEqual(clones[0].id,'p'); assert.equal(clones[1].planeId,clones[0].id);
  assert.notEqual(clones[0].groupId,'g'); assert.equal(clones[0].groupId,clones[1].groupId);
  assert.notEqual(clones[0].id,again[0].id); assert.deepEqual(objects[0],{id:'p',type:'coordplane',groupId:'g'});
});
test('standalone graph clones do not keep a reference to a different document', () => {
  const api=load(); const clone=api.cloneClipboardObjects([{id:'f',type:'funcgraph',planeId:'p'}]);
  assert.equal(clone[0].planeId,undefined);
});
test('malformed external object payload is rejected with feedback before insertion',()=>{
 const api=load(),f=fixture(api);
 for(const object of [{id:'bad',type:'rect'},{id:'bad',type:'rect',x:0,y:0,w:null,h:10}]) {
  const e=event(new Map([['text/plain',JSON.stringify({format:'5e-clipboard',version:1,objects:[object]})]]));api.listeners.paste(e);
 }
 assert.equal(f.pasted.length,0);assert.equal(api.alerts.length,2);
});
test('inspector button focus protects canvas from native cut',()=>{
 const api=load(),f=fixture(api),before=plain(f.value);
 api.listeners.cut(event(new Map(),{target:{tagName:'BUTTON',closest:()=>({})}}));assert.deepEqual(plain(f.value),before);
});
test('copying a plane includes its attached graph; locked graph prevents cutting its plane',()=>{
 const api=load(),f=fixture(api);f.value.objects=[{id:'p',type:'coordplane',x:0,y:0,w:10,h:10},{id:'f',type:'funcgraph',planeId:'p',points:[{x:0,y:0},{x:1,y:1}],locked:true}];f.value.selectedIds=['p'];
 const data=new Map();api.listeners.copy(event(data));api.listeners.paste(event(data));assert.equal(f.pasted[0].length,2);
 api.listeners.cut(event());assert.equal(f.value.objects.length,2,'never strand a locked dependent graph');
 f.value.objects[0].locked=true;f.value.objects[1].locked=false;api.listeners.cut(event());assert.equal(f.value.objects.length,2,'locked plane cut does not remove unselected children');
});
