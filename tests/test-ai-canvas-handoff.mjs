import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../js/store.js';
import {canvasCompositionSnapshot,handSelectedCanvasImageToAi} from '../js/ai-canvas-handoff.js';
const data='data:image/png;base64,crop';
function store(){return createStore({activePageId:'page',pages:[{id:'page'}],artboard:{w:90,h:60},layers:[{id:1,visible:true},{id:2,visible:false}],selectedIds:['a','b'],objects:[{id:'a',type:'rect',layerId:1,x:0,y:0,w:10,h:10},{id:'b',type:'image',layerId:1,src:data,x:15,y:0,w:10,h:10},{id:'hidden',type:'rect',layerId:2,x:50,y:50,w:10,h:10}]});}
test('composition includes selected visible images and vectors with unchanged relative positions',()=>{
 const s=store(),snap=canvasCompositionSnapshot(s.get());assert.deepEqual(snap.objectIds,['a','b']);
 s.get().objects[0].x=999;assert.equal(snap.stateCopy.objects[0].x,0);
});
test('no selection sends the current visible drawing, excluding hidden layers',()=>{
 const s=store();s.update(v=>v.selectedIds=[]);assert.deepEqual(canvasCompositionSnapshot(s.get()).objectIds,['a','b']);
});
test('composition opens one reference without generation and never changes original canvas objects',async()=>{
 const s=store(),before=JSON.stringify(s.get()),calls=[];
 const result=await handSelectedCanvasImageToAi(s,{renderComposition:async()=>data,openPanel:async options=>calls.push(options)});
 assert.equal(result.status,'opened');assert.equal(calls.length,1);assert.equal(calls[0].startGeneration,false);assert.equal(calls[0].references[0].sourceKind,'canvas-composition');assert.deepEqual(calls[0].references[0].source.objectIds,['a','b']);assert.equal(JSON.stringify(s.get()),before);
});
for(const [label,change] of Object.entries({geometry:v=>v.objects[0].x++,selection:v=>v.selectedIds=['a'],page:v=>v.activePageId='other',visibility:v=>v.layers[0].visible=false}))test(`pending composition rejects ${label} changes`,async()=>{
 const s=store(),calls=[];let release;const gate=new Promise(r=>release=r);
 const pending=handSelectedCanvasImageToAi(s,{renderComposition:()=>gate,openPanel:options=>calls.push(options)});
 s.update(change);release(data);assert.equal((await pending).status,'stale');assert.equal(calls.length,0);
});
test('empty drawing opens an empty workbench and single images retain the original pixel route',async()=>{
 const s=store(),calls=[];s.update(v=>v.selectedIds=['b']);
 await handSelectedCanvasImageToAi(s,{renderImage:async()=>data,openPanel:options=>calls.push(options)});assert.equal(calls[0].references[0].sourceKind,'canvas-selection');
 s.update(v=>{v.objects=[];v.selectedIds=[];});await handSelectedCanvasImageToAi(s,{openPanel:options=>calls.push(options)});assert.equal(calls[1],undefined);
});

test('switching away and back cannot revive a pending composition',async()=>{
 const s=store(),calls=[];let release;const gate=new Promise(r=>release=r);
 const pending=handSelectedCanvasImageToAi(s,{renderComposition:()=>gate,openPanel:options=>calls.push(options)});
 s.update(v=>v.activePageId='other');s.update(v=>v.activePageId='page');release(data);assert.equal((await pending).status,'stale');assert.equal(calls.length,0);
});
test('a failed composition reports its error and opens no workbench',async()=>{
 const s=store(),errors=[],calls=[];
 assert.equal((await handSelectedCanvasImageToAi(s,{renderComposition:()=>{throw new Error('decode failed');},openPanel:options=>calls.push(options),reportError:e=>errors.push(e.message)})).status,'error');assert.deepEqual(errors,['decode failed']);assert.equal(calls.length,0);
});
test('a previously linked single image retains its existing AI route',async()=>{
 const s=store(),calls=[];s.update(v=>{v.selectedIds=['b'];v.objects[1].aiTaskId='old-task';});
 const result=await handSelectedCanvasImageToAi(s,{renderImage:()=>{throw new Error('must not render');},openPanel:options=>calls.push(options)});assert.equal(result.status,'linked');assert.deepEqual(calls,[undefined]);
});
