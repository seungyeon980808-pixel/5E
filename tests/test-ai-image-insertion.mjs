import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const { unifiedImageInsertionOptions } = await import('../js/exam-library.js');

const pasteSource = fs.readFileSync(new URL('../js/image-paste.js', import.meta.url), 'utf8');
const projectSource = fs.readFileSync(new URL('../js/project-io.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function evaluate(source, exported, injections = {}) {
  const sandbox = { console, Date, Map, Set, JSON, Number, Object, String, Array, ...injections };
  sandbox.globalThis = sandbox;
  const body = source.replace(/^import\s+[\s\S]*?;\r?\n/gm, '').replace(/\bexport\s+/g, '');
  vm.runInNewContext(`${body}\nglobalThis.api = {${exported.join(',')}};`, sandbox);
  return sandbox.api;
}
function fixture() {
  const target = {id:'image-1',type:'image',src:'old-png',aiTaskId:'task-1',aiCandidateId:'v1',x:12,y:23,w:44,h:33,rotation:31,layerId:7,order:3,opacity:.8,groupId:'g1',aspectLocked:true,cutouts:[{x:1,y:2,w:3,h:4}]};
  const objects = [target];
  const layers = [{id:7,name:'Layer',visible:true}];
  const value = {activePageId:'page-1',pages:[{id:'page-1',name:'One',objects,layers,guides:[],artboard:{w:90,h:60}},{id:'page-2',name:'Two',objects:[],layers,guides:[],artboard:{w:90,h:60}}],objects,layers,guides:[],artboard:{w:90,h:60},activeLayerId:7,viewBox:{x:0,y:0,w:90,h:60},undoStack:[],redoStack:[['old-redo']],selectedIds:['image-1'],targetedId:'old-target',activeTool:'A'};
  const subscriptions = new Set();
  const state = {get:()=>value,update(fn){fn(value);for(const sub of [...subscriptions])sub(value);},subscribe(fn){subscriptions.add(fn);return ()=>subscriptions.delete(fn);}};
  const images = [];
  let canvasCount = 0, drawCount = 0;
  class DeferredImage { constructor(){images.push(this);} set src(value){this.source=value;} }
  const api = evaluate(pasteSource,['insertImageFromSrc'],{Image:DeferredImage,getLastMouseWorld:()=>null,hasInternalClipboard:()=>false,document:{createElement(tag){assert.equal(tag,'canvas');canvasCount++;return{getContext(){return{drawImage(){drawCount++;}}},toDataURL(){return'data:image/png;base64,REENCODED'}};}}});
  const finish = (index=0, {w=800,h=600,error=false}={}) => { const img=images[index];assert.ok(img,`image decoder ${index} exists`);img.naturalWidth=w;img.naturalHeight=h;error?img.onerror():img.onload(); };
  return {state,value,target,images,finish,insert:api.insertImageFromSrc,subscriptions,get canvasCount(){return canvasCount},get drawCount(){return drawCount}};
}
const replaceOptions = () => ({replaceId:'image-1',aiTaskId:'task-1',aiCandidateId:'v2',preserveBytes:true});

test('failed initial decoder never mutates state for insertion or replacement',async()=>{
  for(const options of [{preserveBytes:true,aiTaskId:'task-1',aiCandidateId:'v2'},replaceOptions()]){
    const f=fixture(),before=plain(f.value),promise=f.insert(f.state,'broken-png',options);
    f.finish(0,{error:true});await assert.rejects(promise,/decode/);assert.deepEqual(plain(f.value),before);assert.equal(f.subscriptions.size,0);
  }
});
test('invalid decoded dimensions reject without introducing one-pixel images',async()=>{
  const f=fixture(),before=plain(f.value),promise=f.insert(f.state,'bad-size',{preserveBytes:true});f.finish(0,{w:0,h:100});await assert.rejects(promise,/크기/);assert.deepEqual(plain(f.value),before);
});
test('AI insertion preserves >2000px PNG byte string and metadata with no encoding',async()=>{
  const f=fixture(),src='data:image/png;base64,EXACT_ORIGINAL_BYTES',promise=f.insert(f.state,src,{preserveBytes:true,aiTaskId:'task-1',aiCandidateId:'v9'});
  f.finish(0,{w:5000,h:4000});const id=await promise,obj=f.value.objects.find(o=>o.id===id);
  assert.ok(id);assert.equal(obj.src,src);assert.equal(obj.aiTaskId,'task-1');assert.equal(obj.aiCandidateId,'v9');assert.equal(obj.layerId,7);assert.equal(obj.w/obj.h,1.25);assert.ok(obj.w<=81&&obj.h<=54);assert.equal(f.canvasCount,0);assert.equal(f.images.length,1);assert.deepEqual(plain(f.value.selectedIds),[id]);assert.equal(f.value.undoStack.length,1);assert.equal(f.subscriptions.size,0);
});
test('replacement returns same id, retains geometry/settings and saves the complete undo image',async()=>{
  const f=fixture(),before=plain(f.target),promise=f.insert(f.state,'replacement-png',replaceOptions());f.finish();const id=await promise;
  assert.equal(id,'image-1');assert.equal(f.value.objects.length,1);assert.deepEqual(plain(f.target),{...before,src:'replacement-png',aiCandidateId:'v2'});assert.deepEqual(plain(f.value.undoStack),[[before]]);assert.deepEqual(plain(f.value.redoStack),[]);assert.equal(f.value.activeTool,'V');assert.equal(f.value.targetedId,null);assert.equal(f.canvasCount,0);assert.equal(f.subscriptions.size,0);
  f.value.objects=plain(f.value.undoStack.pop());assert.deepEqual(f.value.objects[0],before);
});
test('initial and changed locks prohibit replacement without fallback insertion',async()=>{
  for(const flag of ['locked','positionLocked','imageSelectionLocked']){
    const initial=fixture();initial.target[flag]=true;const initialBefore=plain(initial.value);await assert.rejects(initial.insert(initial.state,'new',replaceOptions()),/잠긴/);assert.equal(initial.images.length,0);assert.deepEqual(plain(initial.value),initialBefore);
    const late=fixture(),pending=late.insert(late.state,'new',replaceOptions());late.state.update(s=>{s.objects[0][flag]=true});const afterLock=plain(late.value);late.finish();await assert.rejects(pending);assert.deepEqual(plain(late.value),afterLock);assert.equal(late.subscriptions.size,0);
  }
});
test('page switch while decoding rejects both insert and replace even with same target id on new page',async()=>{
  for(const options of [{preserveBytes:true},replaceOptions()]){
    const f=fixture(),pending=f.insert(f.state,'new',options);
    f.state.update(s=>{s.activePageId='page-2';s.objects=[plain(f.target)];s.pages[1].objects=s.objects;});const switched=plain(f.value);f.finish();await assert.rejects(pending,/페이지/);assert.deepEqual(plain(f.value),switched);assert.equal(f.subscriptions.size,0);
  }
});
test('switch away then back is latched and cannot revive an obsolete insert',async()=>{
  const f=fixture(),pending=f.insert(f.state,'new',{preserveBytes:true});f.state.update(s=>s.activePageId='page-2');f.state.update(s=>s.activePageId='page-1');const before=plain(f.value);f.finish();await assert.rejects(pending,/페이지/);assert.deepEqual(plain(f.value),before);
});
test('loading another document with the same page ID invalidates a pending insertion',async()=>{
  const f=fixture(),pending=f.insert(f.state,'new',{preserveBytes:true});f.state.update(s=>{s.pages=plain(s.pages);s.objects=s.pages[0].objects});const before=plain(f.value);f.finish();await assert.rejects(pending,/페이지/);assert.deepEqual(plain(f.value),before);
});
test('selection change and reselection cannot revive a replacement',async()=>{
  const f=fixture(),pending=f.insert(f.state,'new',replaceOptions());f.state.update(s=>s.selectedIds=[]);f.state.update(s=>s.selectedIds=['image-1']);const before=plain(f.value);f.finish();await assert.rejects(pending,/교체 대상/);assert.deepEqual(plain(f.value),before);
});
test('replacement requires exactly the original selected task object',async()=>{
  for(const mutate of [f=>f.value.selectedIds=['image-1','other'],f=>f.target.aiTaskId='other-task',f=>f.value.selectedIds=[]]){const f=fixture();mutate(f);const before=plain(f.value);await assert.rejects(f.insert(f.state,'new',replaceOptions()));assert.equal(f.images.length,0);assert.deepEqual(plain(f.value),before);}
});
test('same-id object replacement or source mutation while waiting aborts without adding objects',async()=>{
  for(const mutate of [s=>{s.objects[0]=plain(s.objects[0])},s=>{s.objects[0].src='another-source'},s=>{s.objects[0].aiCandidateId='other-version'}]){
    const f=fixture(),pending=f.insert(f.state,'new',replaceOptions());f.state.update(mutate);const before=plain(f.value);f.finish();await assert.rejects(pending);assert.deepEqual(plain(f.value),before);assert.equal(f.value.objects.length,1);
  }
});
test('in-place target mutation while decoding aborts an obsolete replacement before it changes source bytes',async()=>{
  const f=fixture(),pending=f.insert(f.state,'new',replaceOptions());
  f.state.update(s=>{s.objects[0].x=999;});
  const before=plain(f.value);f.finish();
  await assert.rejects(pending,/교체 대상/);
  assert.deepEqual(plain(f.value),before);
});
test('page changes during the second image/downscale await are also rejected',async()=>{
  const f=fixture(),pending=f.insert(f.state,'large-image');f.finish(0,{w:5000,h:4000});await Promise.resolve();assert.equal(f.images.length,2);f.state.update(s=>s.activePageId='page-2');const before=plain(f.value);f.finish(1,{w:5000,h:4000});await assert.rejects(pending,/페이지/);assert.deepEqual(plain(f.value),before);assert.equal(f.canvasCount,1);assert.equal(f.subscriptions.size,0);
});
test('normal non-AI insertion still downscales and returns its inserted id',async()=>{
  const f=fixture(),pending=f.insert(f.state,'large-image');f.finish(0,{w:4000,h:3000});await Promise.resolve();f.finish(1,{w:4000,h:3000});const id=await pending;assert.equal(f.value.objects.at(-1).id,id);assert.equal(f.value.objects.at(-1).src,'data:image/png;base64,REENCODED');assert.equal(f.canvasCount,1);assert.equal(f.drawCount,1);
});
test('options are captured before await and incomplete AI metadata is rejected',async()=>{
  const f=fixture(),options=replaceOptions(),pending=f.insert(f.state,'new',options);options.aiCandidateId='unintended';options.replaceId='other';f.finish();assert.equal(await pending,'image-1');assert.equal(f.target.aiCandidateId,'v2');
  for(const bad of [{aiTaskId:'task-1'},{aiCandidateId:'v2'},{aiTaskId:'',aiCandidateId:'v2'},{replaceId:'image-1'}]){const g=fixture();await assert.rejects(g.insert(g.state,'new',bad));assert.equal(g.images.length,0);}
});
test('replacement caps undo history at 60 and clears redo',async()=>{
  const f=fixture();f.value.undoStack=Array.from({length:60},(_,i)=>[{id:`undo-${i}`}]);const pending=f.insert(f.state,'new',replaceOptions());f.finish();await pending;assert.equal(f.value.undoStack.length,60);assert.equal(f.value.undoStack[0][0].id,'undo-1');assert.equal(f.value.undoStack.at(-1)[0].src,'old-png');assert.deepEqual(plain(f.value.redoStack),[]);
});
test('actual serialize/JSON/migrate/load preparation preserves the approved library provenance schema',async()=>{
  const f=fixture(),metadata={provider:'pdf',documentId:'doc-opaque-1',documentTitle:'2026 물리학Ⅰ',documentHash:'doc-hash',title:'13번 도판',pageNumber:3,rect:[.1,.2,.5,.4],fullPageFallback:false,locator:'starter/documents/physics.pdf',displayName:'physics.pdf',sha256:'a'.repeat(64),sourceKind:'pack',itemId:'item-13',fileName:'physics.pdf',sourceUrl:'https://example.invalid/source',license:'공공누리 제1유형'},pending=f.insert(f.state,'data:image/png;base64,EXACT',{preserveBytes:true,aiTaskId:'task-1',aiCandidateId:'v7',sourceMetadata:metadata});f.finish();const id=await pending;
  const io=evaluate(projectSource,['serialize','prepareLoadedProject'],{screenToWorld(){},applyNewObjectStyleDefaults(){},migrateObjectStyleMode(){},showConfirm(){},downscaleIfNeeded(){},DEFAULT_TEXT_SIZE_MM:3,DEFAULT_TEXT_FONT:'sans-serif',normalizeTextRuns:()=>[],textRunsToText:()=>'',LABEL_CAPABLE_TYPES:new Set(),insertImageFromSrc(){},addPage(){}});
  const project=plain(io.serialize(f.value));const prepared=io.prepareLoadedProject(project);const object=prepared.active.objects.find(o=>o.id===id);assert.equal(object.src,'data:image/png;base64,EXACT');assert.equal(object.aiTaskId,'task-1');assert.equal(object.aiCandidateId,'v7');assert.equal(object.layerId,7);assert.equal(prepared.activePageId,'page-1');assert.deepEqual(plain(object.sourceMetadata),metadata);metadata.rect[0]=.9;assert.equal(object.sourceMetadata.rect[0],.1);
});

test('source metadata cloning keeps only approved own primitive fields',async()=>{
  const inherited={license:'inherited-license'}, metadata=Object.create(inherited);
  Object.assign(metadata,{provider:'imported-image',fileName:'fixture.png',sha256:'b'.repeat(64),fullPageFallback:true,locator:'browser:fixture',arbitraryObject:{secret:true}});
  Object.defineProperty(metadata,'sourceUrl',{enumerable:true,get(){throw new Error('accessor must not run')}});
  const f=fixture(),pending=f.insert(f.state,'data:image/png;base64,EXACT',{preserveBytes:true,sourceMetadata:metadata});f.finish();const id=await pending;
  assert.deepEqual(plain(f.value.objects.find(o=>o.id===id).sourceMetadata),{provider:'imported-image',fileName:'fixture.png',sha256:'b'.repeat(64),fullPageFallback:true,locator:'browser:fixture'});
});

test('unified library image insertion is centered and carries materialized provenance',()=>{
  const result={title:'13번 도판',provenance:{provider:'pdf',documentId:'doc-1',pageNumber:3,rect:[0,0,1,1],fullPageFallback:true,locator:'starter/doc.pdf',displayName:'doc.pdf',sha256:'c'.repeat(64),sourceKind:'pack',itemId:'item-13',fileName:'doc.pdf',license:'공공누리'}};
  const asset={source:{documentId:'doc-1',pageNumber:3,rect:[.1,.2,.3,.4],fullPageFallback:false}};
  assert.deepEqual(unifiedImageInsertionOptions(result,asset),{preserveBytes:true,centerArtboard:true,sourceMetadata:{provider:'pdf',documentId:'doc-1',title:'13번 도판',pageNumber:3,rect:[.1,.2,.3,.4],fullPageFallback:false,locator:'starter/doc.pdf',displayName:'doc.pdf',sha256:'c'.repeat(64),sourceKind:'pack',itemId:'item-13',fileName:'doc.pdf',license:'공공누리'}});
});

test('AI insertion uses the origin-centered artboard center even if viewport or stale pointer is elsewhere',async()=>{
  const f=fixture();f.value.viewBox={x:-999,y:500,w:90,h:60};
  const pending=f.insert(f.state,'page-centered',{preserveBytes:true,centerArtboard:true,aiTaskId:'task-1',aiCandidateId:'v2'});
  f.finish();const id=await pending;const image=f.value.objects.find(o=>o.id===id);
  assert.equal(image.x,-36);assert.equal(image.y,-27);
  assert.equal(image.x+image.w/2,0);assert.equal(image.y+image.h/2,0);
  assert.ok(image.x>=-45&&image.y>=-30&&image.x+image.w<=45&&image.y+image.h<=30);
});
