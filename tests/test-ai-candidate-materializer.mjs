import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStore} from '../js/store.js?v=1.7.0-four-session-integration';
import {createCandidateMaterializer} from '../js/ai-candidate-materializer.js?v=1.7.0-four-session-integration';
import {validateWorkbenchGraph} from '../js/graph/workbench-result.js?v=1.7.0-four-session-integration';
import {mixedCandidate} from './fixtures/candidate-union.cjs';

const sourceData = 'data:image/png;base64,' + readFileSync(new URL('./fixtures/rights-clear-smoke.png',import.meta.url)).toString('base64');

function fixture(extra = {}) {
  const image = {id:'background',type:'image',src:'old',aiTaskId:'task',aiCandidateId:'old',imageSelectionLocked:true,aiLabelEditingBackground:true};
  const label = {id:'label',type:'labeler',aiTaskId:'task',aiCandidateId:'old',aiAutoLabel:true,aiParentImageId:image.id,text:'old'};
  const manual = {id:'manual',type:'text',text:'keep'};
  const page = {id:'page',meta:{examLink:{tabId:'tab',assetId:'asset'}}};
  const state = createStore({activePageId:page.id,pages:[page],objects:[image,label,manual],groups:[],selectedIds:[],undoStack:[],redoStack:[],viewBox:{x:0,y:0,w:100,h:100}});
  const services = {
    prepareImageCandidateRevision:async (target,data,options) => ({
      image:{...target,src:data,aiCandidateId:options.aiCandidateId},
      labels:[{...label,id:'new-label',text:options.editableLabelPlan.labels[0].text,aiCandidateId:options.aiCandidateId}],
    }),
    insertImageFromSrc:async () => assert.fail('unexpected raster insertion'),
    validateWorkbenchGraph:result => { assert.equal(validateWorkbenchGraph(result).id,'plane'); },
    insertWorkbenchGraph:(draft,result,{taskId,candidateId}) => {
      draft.update(value => { value.objects=result.objects.map(object=>({...object,aiTaskId:taskId,aiCandidateId:candidateId}));value.selectedIds=['plane']; });
      return {planeId:'plane',ids:result.objects.map(object=>object.id)};
    },
    rebuildGroups:value => {value.groups=[];},
    ...extra,
  };
  return {state,image,label,manual,services,materialize:createCandidateMaterializer(state,services)};
}
const candidate = () => ({id:'new',data:'RAW',labelPlan:{labels:[{text:'native'}]}});

test('owned selection-locked revision is one atomic undo entry and preserves manual objects',async () => {
  const f=fixture(),before=structuredClone(f.state.get().objects);
  let notifications=0;f.state.subscribe(()=>notifications++);
  await f.materialize(candidate(),{taskId:'task',replaceId:'background'});
  assert.equal(notifications,1);
  assert.deepEqual(f.state.get().undoStack,[before]);
  assert.equal(f.state.get().objects.find(object=>object.id==='manual'),f.manual);
  assert.equal(f.state.get().objects.find(object=>object.type==='labeler').text,'native');
  assert.equal(f.state.get().objects.find(object=>object.id==='background').src,'RAW');
});

test('user output bundles native labels without copying an earlier automatic QA pass',async () => {
  const f=fixture(),item=candidate();
  item.reviewState='needs-attention';item.labelPlan.qualityReview={verdict:'fail'};
  const original=structuredClone(item);
  await f.materialize(item,{taskId:'task',replaceId:'background',userOutput:true});
  const objects=f.state.get().objects.filter(o=>o.aiCandidateId==='new');
  assert.equal(objects.length,2);assert.equal(objects[0].groupId,objects[1].groupId);
  assert.equal(objects[0].imageSelectionLocked,false);
  assert.deepEqual(f.state.get().selectedIds,objects.map(o=>o.id));
  assert.deepEqual(item,original,'user output never upgrades the provider review');
});

test('user output retains byte integrity even when quality results are informational',async () => {
  const f=fixture(),item={...candidate(),data:sourceData,imageLabelWorkflow:{explicit:true},candidateSha256:'0'.repeat(64)};
  const before=structuredClone(f.state.get());
  await assert.rejects(f.materialize(item,{taskId:'task',replaceId:'background',userOutput:true}),/바이트/);
  assert.deepEqual(f.state.get(),before);
});

test('a selected output variant does not replace the immutable RAW candidate or its digest',async()=>{
  const f=fixture(),item={...candidate(),data:sourceData,imageLabelWorkflow:{explicit:true},
    candidateSha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sourceData)))].map(b=>b.toString(16).padStart(2,'0')).join('')};
  const original=structuredClone(item);
  const output=sourceData+'\n';
  await f.materialize(item,{taskId:'task',replaceId:'background',userOutput:true,dataOverride:output});
  assert.equal(f.state.get().objects.find(o=>o.type==='image').src,output);
  assert.deepEqual(item,original);
});

test('graph materialization uses native objects even with inherited stale preview pixels',async () => {
  const f=fixture(),graph=mixedCandidate(sourceData).graphResult;
  const ids = new Map([['plane-4','plane'],['curve-5','curve']]);
  for (const object of graph.objects) {
    object.id = ids.get(object.id);
    if (object.type === 'funcgraph') object.planeId = ids.get(object.planeId);
  }
  for (const group of graph.groups) group.memberIds = group.memberIds.map(id => ids.get(id));
  const before=structuredClone(graph);
  const result=await f.materialize({id:'graph',data:'stale-parent-raster',graphResult:graph},{taskId:'task'});
  assert.deepEqual(result.ids,['plane','curve']);
  assert.equal(f.state.get().objects.filter(object=>object.aiCandidateId==='graph').length,2);
  assert.deepEqual(graph,before);
});

test('failed native preparation leaves the complete live page and history unchanged',async () => {
  const f=fixture({prepareImageCandidateRevision:async()=>{throw new Error('bad placement');}});
  const before=structuredClone(f.state.get());
  await assert.rejects(f.materialize(candidate(),{taskId:'task',replaceId:'background'}),/bad placement/);
  assert.deepEqual(f.state.get(),before);
});

test('switch away and back while preparing cannot commit an earlier revision',async () => {
  const prepared=Promise.withResolvers(),entered=Promise.withResolvers();
  const f=fixture({prepareImageCandidateRevision:()=>{entered.resolve();return prepared.promise;}});
  const pending=f.materialize(candidate(),{taskId:'task',replaceId:'background'});
  await entered.promise;
  f.state.update(value=>{value.activePageId='other';});
  f.state.update(value=>{value.activePageId='page';});
  prepared.resolve({image:{...f.image,src:'new'},labels:[]});
  await assert.rejects(pending,/변경/);
  assert.equal(f.state.get().objects[0],f.image);
  assert.equal(f.state.get().undoStack.length,0);
});

test('same-ID replacement and candidate edits invalidate pending preparation',async () => {
  for (const replace of [true,false]) {
    const prepared=Promise.withResolvers(),entered=Promise.withResolvers(),item=candidate();
    const f=fixture({prepareImageCandidateRevision:()=>{entered.resolve();return prepared.promise;}});
    const pending=f.materialize(item,{taskId:'task',replaceId:'background'});
    await entered.promise;
    if(replace)f.state.update(value=>{value.objects=value.objects.map(object=>({...object}));});
    else item.labelPlan.labels[0].text='changed';
    const before=structuredClone(f.state.get());
    prepared.resolve({image:{...f.image,src:'new'},labels:[]});
    await assert.rejects(pending,/변경/);
    assert.deepEqual(f.state.get(),before);
  }
});

test('locked or foreign objects cannot acquire the AI revision replacement privilege',async () => {
  for (const patch of [{locked:true},{positionLocked:true},{aiTaskId:'foreign'},{aiLabelEditingBackground:false}]) {
    const f=fixture();Object.assign(f.image,patch);
    const before=structuredClone(f.state.get());
    await assert.rejects(f.materialize(candidate(),{taskId:'task',replaceId:'background'}),/소유/);
    assert.deepEqual(f.state.get(),before);
  }
});
