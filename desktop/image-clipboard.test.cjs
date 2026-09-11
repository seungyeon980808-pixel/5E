const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function fixture() {
  const events={},readers=[],images=[],alerts=[],subs=new Set();
  const page={id:'a'}; const value={pages:[page],activePageId:'a',objects:[],selectedIds:[],undoStack:[],redoStack:[],artboard:{w:100,h:100},viewBox:{x:0,y:0,w:100,h:100},activeLayerId:1};
  const state={get:()=>value,update(fn){fn(value);for(const sub of subs)sub(value)},subscribe(fn){subs.add(fn);return()=>subs.delete(fn)}};
  const context={console,JSON,Map,Set,Date,Number,Array,Object,
    FileReader:class{constructor(){readers.push(this)}readAsDataURL(){}},
    Image:class{constructor(){images.push(this)}set src(v){}},
    hasInternalClipboard:()=>false,getLastMouseWorld:()=>null,
    blocksCanvasShortcut:e=>!!e.blocked||!!e.defaultPrevented,
    showAlert:message=>alerts.push(message),
    document:{addEventListener(t,f){events[t]=f}},
  };
  let source=fs.readFileSync(path.join(__dirname,'../js/image-paste.js'),'utf8').replace(/^import\s+[\s\S]*?;\r?\n/gm,'').replace(/\bexport\s+/g,'');
  vm.runInNewContext(source+';globalThis.init=initImagePaste;',context);context.init(state,{});
  const paste=(extras={})=>events.paste({target:null,preventDefault(){},clipboardData:{items:[{type:'image/png',getAsFile:()=>({})}]},...extras});
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  return{state,value,readers,images,alerts,paste,flush};
}
test('image paste cancels if page changes before file reading completes',async()=>{
 const f=fixture(); f.paste();f.state.update(s=>{s.activePageId='b';s.pages=[{id:'b'}]});
 f.readers[0].result='data:image/png;base64,AA';f.readers[0].onload();await f.flush();
 assert.equal(f.images.length,0);assert.equal(f.value.objects.length,0);assert.equal(f.alerts.length,1);
});
test('image decode failure gives actionable feedback without insertion',async()=>{
 const f=fixture();f.paste();f.readers[0].result='data:image/png;base64,AA';f.readers[0].onload();await f.flush();
 f.images[0].onerror();await f.flush();assert.equal(f.alerts.length,1);assert.equal(f.value.objects.length,0);
});
test('handled object paste and active modal never start a second image insertion',()=>{
 const f=fixture();f.paste({defaultPrevented:true});f.paste({blocked:true});assert.equal(f.readers.length,0);
});
