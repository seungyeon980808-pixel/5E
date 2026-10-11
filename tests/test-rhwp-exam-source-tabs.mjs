import test from 'node:test';
import assert from 'node:assert/strict';
import {createExamSourceTabs,createExamDraftChecker} from '../js/rhwp-exam-source-tabs.js?v=1.7.0-four-session-integration';
import {prepareLoadedProject} from '../js/project-io.js?v=1.7.0-four-session-integration';
import {annotationsFor,mergeAnnotationPatch} from '../js/rhwp-exam-annotations.js?v=1.7.0-four-session-integration';
import {savePageRuntime,restorePageRuntime} from '../js/page-history.js?v=1.7.0-four-session-integration';
import {createStore} from '../js/store.js?v=1.7.0-four-session-integration';
import {createRequire} from 'node:module';
const {mixedCandidate,assertCandidateUnion}=createRequire(import.meta.url)('./fixtures/candidate-union.cjs');

const link = {tabId:'tab-a',assetId:'asset-a'};

test('native image source defaults do not create a draft and canonical loading is cached', () => {
  const source={version:'0.17',activePageId:'native',pages:[{id:'native',name:'그림',objects:[{id:'image',type:'image',src:'data:image/png;base64,eA==',x:0,y:0,w:10,h:10,rotation:0,layerId:1,order:0,locked:false}],guides:[],layers:[{id:1,name:'기본',visible:true,locked:false}],artboard:{w:100,h:100}}]};
  const figure={source,render:crop(-10)}, before=structuredClone(source), current=prepareLoadedProject(source).active;
  let calls=0;const check=createExamDraftChecker(value=>{calls++;return prepareLoadedProject(value);});
  assert.notDeepEqual(current.objects,source.pages[0].objects,'the real loader adds omitted defaults');
  assert.equal(check(current,{},figure),false);
  assert.equal(check({...current,artboard:{h:100,w:100}},{examDraftRender:structuredClone(figure.render)},figure),false);
  assert.equal(calls,1);assert.deepEqual(source,before);
  current.objects[0].opacity=.5;assert.equal(check(current,{},figure),true);
  current.objects[0].opacity=1;current.objects[0].x=2;assert.equal(check(current,{},figure),true);
  current.objects[0].x=0;assert.equal(check({...current,artboard:{w:90,h:100}},{},figure),true);
  assert.equal(check(current,{examDraftRender:crop(-4)},figure),true);
});
const aiContext = (value = link) => ({scope:'scope-a',taskId:'task-a',snapshot:{tabs:[{id:'task-a',examLink:value,generated:[]}]}});
function fixture(ai = {}) {
  const page = {id:'page-a',name:'그림',meta:{examLink:link},objects:[],guides:[],layers:[{id:1}],artboard:{w:100,h:100}};
  const value = {activePageId:page.id,pages:[page],objects:page.objects,guides:page.guides,layers:page.layers,artboard:page.artboard,selectedIds:[],undoStack:[],redoStack:[],groups:[],viewBox:{x:0,y:0,w:100,h:100}};
  const state = {get:() => value,update:callback => callback(value)};
  const services = {getAiPanel:() => ai,switchPage:(_state,id) => {
    if(value.activePageId===id)return;
    const current=value.pages.find(page=>page.id===value.activePageId);
    if(current){Object.assign(current,{objects:value.objects,guides:value.guides,layers:value.layers,artboard:value.artboard});savePageRuntime(value,current);}
    const target = value.pages.find(page => page.id === id);
    Object.assign(value,{activePageId:id,objects:target.objects,guides:target.guides,layers:target.layers,artboard:target.artboard});
    restorePageRuntime(value,target);
  },prepareLoadedProject:source => ({active:source.pages.find(page => page.id === source.activePageId)}),resetPageHistory:() => {value.undoStack=[];value.redoStack=[];},serialize:source => ({version:'0.17',activePageId:source.activePageId,pages:source.pages})};
  return {state,value,page,services,tabs:createExamSourceTabs(state,services)};
}
test('a canvas tab cannot acquire a second image link through a different AI task',async () => {
  const {tabs,page} = fixture();
  await assert.rejects(tabs.capture(aiContext({tabId:'tab-b',assetId:'asset-b'})),/다른 그림에 연결/);
  assert.deepEqual(page.meta.examLink,link);
});
test('a second canvas tab cannot reuse the first tab AI link',async () => {
  const {tabs,value} = fixture();
  value.pages.push({id:'page-b',meta:{}});value.activePageId='page-b';
  await assert.rejects(tabs.capture(aiContext()),/연결된 5E 탭/);
  assert.equal(value.pages[1].meta.examLink,undefined);
});
test('switching tabs while an AI snapshot is pending cannot capture the next tab',async () => {
  let resolve;
  const {tabs,value} = fixture({captureExamTask:() => new Promise(done => {resolve = done;})});
  value.objects.push({id:'image',aiTaskId:'task-a'});value.selectedIds=['image'];
  const capturing = tabs.capture();value.activePageId='page-b';resolve(aiContext());
  await assert.rejects(capturing,/작업 탭이 바뀌/);
});
test('applying from another canvas or AI tab cannot overwrite the linked image',async () => {
  const {tabs,value} = fixture({activeExamTask:() => ({scope:'scope-b',taskId:'task-b'})});
  const editing = {figure:{link},aiContext:aiContext()};
  await assert.rejects(tabs.captureEdit(editing),/원래 AI 작업 탭/);
  value.activePageId='page-b';await assert.rejects(tabs.captureEdit(editing),/원래 5E 작업 탭/);
});
test('the first native return preserves a live draft and AI selection while recording its revision and crop',async () => {
  const calls=[];
  const {tabs,page,value}=fixture({restoreExamTask:async (context,options)=>{calls.push(options);return context;}});
  const source={version:'0.17',activePageId:page.id,pages:[structuredClone(page)]};
  const context=aiContext();context.snapshot.tabs[0].selectedCandidateId='committed-candidate';
  const render={bounds:{x:-20,y:-10,w:40,h:20},pixelWidth:400,pixelHeight:200};
  const figure={id:'revision-a',name:page.name,version:1,link,source,render,context:{version:1,pageId:page.id,viewBox:null,selectedIds:[],ai:context}};
  value.objects.push({id:'draft-image',type:'image',aiTaskId:'task-a',aiCandidateId:'draft-candidate'});
  await tabs.activate(figure);
  assert.deepEqual(calls,[{candidateId:null}]);
  assert.equal(value.objects[0].aiCandidateId,'draft-candidate');
  assert.equal(page.meta.examRevisionId,figure.id);
  assert.deepEqual(page.meta.examRender,render);
  assert.notEqual(page.meta.examRender,render);
  const recropped={...figure,id:'revision-b',render:{...render,bounds:{x:-10,y:-10,w:30,h:20}}};
  tabs.markRevision(recropped);
  assert.equal(page.meta.examRevisionId,'revision-b');
  assert.deepEqual(page.meta.examRender,recropped.render);
});

const label = (id, text = id) => ({id,type:'labeler',p1:{x:0,y:0},p2:{x:10,y:-5},text,labelSize:3.7,layerId:1});
const crop = x => ({bounds:{x,y:-10,w:30,h:20},options:{includeReferenceImages:true,excludeAllImages:false}});
function figureFor(page, extra = {}) {
  return {id:'revision-a',name:page.name,version:1,link:structuredClone(page.meta.examLink),
    source:{version:'0.17',activePageId:page.id,pages:[structuredClone(page)]},render:crop(-10),...extra};
}
const isConflict = error => error.code === 'ANNOTATION_CONFLICT';

test('inline reads use live active objects and detached snapshots without switching, AI restoration, or history reset', () => {
  const {tabs,page,value,services} = fixture({restoreExamTask:() => {assert.fail('AI restoration');},close:() => {assert.fail('AI close');}});
  page.objects.push({id:'image',type:'image',src:'committed'},label('a','committed'));
  const figure = figureFor(page), activeObjects = [{id:'image',type:'image',src:'unapplied'},label('a','live'),label('draft')];
  value.objects = activeObjects;value.selectedIds=['image'];
  const undo = [structuredClone(page.objects)], redo = [structuredClone(activeObjects)];
  value.undoStack=undo;value.redoStack=redo;
  services.switchPage=() => assert.fail('switch');services.resetPageHistory=() => assert.fail('reset');services.prepareLoadedProject=() => assert.fail('load');
  const snapshot = tabs.readAnnotations(figure);
  assert.deepEqual(snapshot.baseline,[label('a','live'),label('draft')]);
  assert.deepEqual(snapshot.draft,snapshot.baseline);
  assert.notEqual(snapshot.draft,snapshot.baseline);
  assert.deepEqual(snapshot.render,figure.render);
  snapshot.draft[0].p1.x=200;snapshot.render.bounds.x=200;
  assert.equal(value.objects[1].p1.x,0);
  assert.deepEqual(page.meta.examRender,figure.render);
  assert.equal(value.objects,activeObjects);assert.equal(value.undoStack,undo);assert.equal(value.redoStack,redo);
  assert.equal(value.activePageId,page.id);assert.deepEqual(value.selectedIds,['image']);
  assert.deepEqual(page.meta.examAnnotationBaseline,annotationsFor(figure.source));
});

test('an unregistered linked figure creates a separate page without activating it or changing the active draft', () => {
  const {tabs,page,value,services} = fixture();
  const activeObjects=value.objects, undo=value.undoStack, view=value.viewBox;
  const otherPage=structuredClone(page);otherPage.meta.examLink={tabId:'tab-b',assetId:'asset-b'};
  otherPage.objects=[{id:'image-b',type:'image',src:'background'},label('b')];
  const figure=figureFor(otherPage), original=structuredClone(figure);
  services.switchPage=() => assert.fail('switch');services.resetPageHistory=() => assert.fail('reset');
  const read=tabs.readAnnotations(figure), registered=tabs.pageForLink(figure.link);
  assert.deepEqual(read.draft,[label('b')]);
  assert.notEqual(registered.id,page.id);assert.equal(value.pages.length,2);
  assert.equal(value.activePageId,page.id);assert.equal(value.objects,activeObjects);assert.equal(value.undoStack,undo);assert.equal(value.viewBox,view);
  assert.deepEqual(registered.objects,otherPage.objects);assert.deepEqual(figure,original);
});

test('inline queued patches preserve nonlabel identity, the page runtime and inactive pages', () => {
  const {tabs,page,value} = fixture();
  const image={id:'image',type:'image',src:'unapplied-background'}, text={id:'text',type:'text',text:'unapplied text'};
  page.objects.push(image,label('a'),text);
  const figure=figureFor(page), first=tabs.readAnnotations(figure);
  const unrelated={id:'page-b',objects:[label('unrelated')],meta:{examLink:{tabId:'other',assetId:'other'}},guides:[],layers:[],artboard:{w:9,h:9}};
  value.pages.push(unrelated);const untouched=structuredClone(unrelated);
  value.undoStack.push(structuredClone(value.objects));value.redoStack.push(structuredClone(value.objects));
  const undo=value.undoStack, redo=value.redoStack;savePageRuntime(value,page);
  const published=tabs.patchAnnotations(figure,first.baseline,[label('a','first'),label('b')]);
  assert.deepEqual(published,{labels:[label('a','first'),label('b')]});
  const second=tabs.patchAnnotations(figure,published.labels,[label('a','second'),label('b')]);
  assert.deepEqual(second.labels,[label('a','second'),label('b')]);
  assert.equal(page.objects[0],image);assert.equal(page.objects.find(object => object.id==='text'),text);
  assert.equal(page,value.pages[0]);assert.equal(value.objects,page.objects);
  assert.equal(value.undoStack,undo);assert.equal(value.redoStack,redo);assert.deepEqual(unrelated,untouched);
  assert.equal(undo.length,3);assert.equal(redo.length,0);
  assert.deepEqual(undo[1],[image,label('a'),text]);
  assert.deepEqual(undo[2].filter(object=>object.type==='labeler'),published.labels);
  const runtime={objects:page.objects,guides:page.guides,layers:page.layers};restorePageRuntime(runtime,page);
  assert.equal(runtime.undoStack,undo);assert.equal(runtime.redoStack,redo);
  second.labels[0].text='outside';assert.equal(page.objects[1].text,'second');
});

test('stale patches and invalid crop drafts reject before any partial state update', () => {
  const {tabs,page,value} = fixture();page.objects.push(label('a'));
  const figure=figureFor(page), read=tabs.readAnnotations(figure);
  value.objects=[label('a','concurrent')];
  const before=structuredClone(value);
  assert.throws(() => tabs.patchAnnotations(figure,read.baseline,[label('a','inline')],{render:crop(-4)}),isConflict);
  assert.deepEqual(value,before);assert.equal(page.meta.examDraftRender,undefined);
  assert.throws(() => tabs.patchAnnotations(figure,annotationsFor({objects:value.objects}),[label('a','inline')],{render:{bounds:{x:0,y:0,w:0,h:3}}}),/영역/);
  assert.deepEqual(value,before);
});

test('inactive linked pages can receive labels and crop drafts without disturbing the current tab', () => {
  const {tabs,page,value,services}=fixture();page.objects.push(label('a'));
  const figure=figureFor(page), read=tabs.readAnnotations(figure);
  value.undoStack.push([label('prior')]);value.redoStack.push([label('redo')]);
  const pageUndo=value.undoStack,pageRedo=value.redoStack;
  const other={id:'page-b',meta:{},objects:[{id:'other',type:'image',src:'active draft'}],guides:[],layers:[{id:2}],artboard:{w:80,h:50}};
  value.pages.push(other);services.switchPage(null,other.id);value.selectedIds=['other'];
  value.undoStack.push(structuredClone(other.objects));value.redoStack.push(structuredClone(other.objects));
  const undo=value.undoStack,redo=value.redoStack,oldHistory=structuredClone({undo,redo});
  const before=structuredClone(other), objects=value.objects, view=value.viewBox;
  tabs.patchAnnotations(figure,read.baseline,[label('a','inactive')],{render:crop(-4)});
  assert.deepEqual(annotationsFor(page),[label('a','inactive')]);assert.deepEqual(page.meta.examDraftRender,crop(-4));
  assert.equal(value.activePageId,other.id);assert.equal(value.objects,objects);assert.equal(value.undoStack,undo);assert.equal(value.redoStack,redo);
  assert.equal(value.viewBox,view);assert.deepEqual(value.selectedIds,['other']);assert.deepEqual(other,before);
  assert.deepEqual({undo,redo},oldHistory);
  const runtime={objects:page.objects,guides:page.guides,layers:page.layers,pages:value.pages};restorePageRuntime(runtime,page);
  assert.equal(runtime.undoStack,pageUndo);assert.equal(runtime.redoStack,pageRedo);
  assert.deepEqual(pageUndo,[[label('prior')],[label('a')]]);assert.deepEqual(pageRedo,[]);
});

test('acknowledging an annotation commit retains background drafts and advances label and crop baselines', () => {
  const {tabs,page,value}=fixture();page.objects.push({id:'image',type:'image',src:'committed'},label('a','old'));
  const original=figureFor(page), read=tabs.readAnnotations(original), originalSource=structuredClone(original.source);
  value.objects=[{id:'image',type:'image',src:'unapplied'},label('a','old')];
  const draftBackground=value.objects[0], undo=value.undoStack, redo=value.redoStack;
  const edited=[label('a','new')], draftCrop=crop(-3);
  tabs.patchAnnotations(original,read.baseline,edited,{render:draftCrop});
  assert.deepEqual(tabs.readAnnotations(original).render,draftCrop);
  const committed={...original,id:'revision-b',version:2,editScope:'annotations',source:mergeAnnotationPatch(original.source,annotationsFor(original.source),edited),render:draftCrop};
  assert.deepEqual(tabs.markAnnotationRevision(committed),{labels:edited});
  assert.equal(page.meta.examRevisionId,committed.id);assert.deepEqual(page.meta.examAnnotationBaseline,edited);assert.deepEqual(page.meta.examRender,draftCrop);
  assert.equal(page.meta.examDraftRender,undefined);assert.equal(page.objects[0],draftBackground);
  assert.equal(value.undoStack,undo);assert.equal(value.redoStack,redo);assert.deepEqual(original.source,originalSource);
  assert.equal(committed.source.pages[0].objects[0].src,'committed');
});

test('inline revision undo and redo merge labels safely without focusing, loading or changing AI candidates', () => {
  const {tabs,page,value,services}=fixture({restoreExamTask:() => assert.fail('AI restore')});
  page.objects.push({id:'image',type:'image',src:'original'},label('a','old'),label('b','same'));
  const original=figureFor(page);tabs.markRevision(original);
  const next={...original,id:'revision-b',editScope:'annotations',source:mergeAnnotationPatch(original.source,annotationsFor(original.source),[label('a','new'),label('b','same'),label('c')])};
  tabs.markAnnotationRevision(next);
  value.objects=[{id:'image',type:'image',src:'unapplied'},label('a','new'),label('b','draft'),label('c'),label('local-draft')];
  const image=value.objects[0], undo=value.undoStack, redo=value.redoStack;
  services.switchPage=() => assert.fail('switch');services.prepareLoadedProject=() => assert.fail('load');services.resetPageHistory=() => assert.fail('reset');
  const undone=tabs.readAnnotations(original);
  assert.deepEqual(undone.draft,[label('a','old'),label('b','draft'),label('local-draft')]);
  assert.equal(page.objects[0],image);assert.equal(value.undoStack,undo);assert.equal(value.redoStack,redo);
  const redone=tabs.readAnnotations(next);
  assert.deepEqual(redone.draft,[label('a','new'),label('b','draft'),label('c'),label('local-draft')]);
  assert.equal(page.objects[0],image);
  // Revision metadata is serializable; reopening still has the old commit's baseline.
  page.meta=JSON.parse(JSON.stringify(page.meta));
  tabs.markAnnotationRevision(original);
  assert.deepEqual(annotationsFor(page),undone.draft);
});

test('conflicting revision changes leave labels, metadata, crop drafts and history intact', () => {
  const {tabs,page,value}=fixture();page.objects.push(label('a','old'));
  const original=figureFor(page);tabs.markRevision(original);
  const next={...original,id:'revision-b',editScope:'annotations',source:mergeAnnotationPatch(original.source,annotationsFor(original.source),[label('a','new')])};
  value.objects=[label('a','unapplied conflict')];page.meta.examDraftRender=crop(-2);
  const before=structuredClone(value);
  assert.throws(() => tabs.readAnnotations(next),isConflict);
  assert.throws(() => tabs.markAnnotationRevision(next),isConflict);
  assert.deepEqual(value,before);
});

test('activate honors annotation scope and native undo back to its full-source parent without resetting history', async () => {
  const calls=[];const {tabs,page,value,services}=fixture({restoreExamTask:async (context,options) => {calls.push(options);return context;}});
  page.objects.push({id:'image',type:'image',src:'original'},label('a','old'));
  const context=aiContext();context.snapshot.tabs[0].selectedCandidateId='committed-candidate';
  const original=figureFor(page,{context:{version:1,pageId:page.id,viewBox:null,selectedIds:[],ai:context}});
  tabs.markRevision(original);
  value.objects=[{id:'image',type:'image',src:'unapplied'},label('a','old')];
  const image=value.objects[0], undo=value.undoStack, redo=value.redoStack;
  const next={...original,id:'revision-b',editScope:'annotations',source:mergeAnnotationPatch(original.source,annotationsFor(original.source),[label('a','new')])};
  services.prepareLoadedProject=() => assert.fail('full reload');services.resetPageHistory=() => assert.fail('history reset');
  await tabs.activate(next);assert.equal(value.objects[0],image);assert.deepEqual(annotationsFor(page),[label('a','new')]);
  await tabs.activate(original);assert.equal(value.objects[0],image);assert.deepEqual(annotationsFor(page),[label('a','old')]);
  assert.equal(value.undoStack,undo);assert.equal(value.redoStack,redo);assert.deepEqual(calls,[{candidateId:null},{candidateId:null}]);
});

test('legacy revision metadata without a trustworthy label baseline conflicts instead of guessing', () => {
  const {tabs,page}=fixture();page.objects.push(label('a','draft'));page.meta.examRevisionId='old-untracked';
  const figure=figureFor(page,{id:'revision-b',editScope:'annotations'});figure.source.pages[0].objects=[label('a','new')];
  const before=structuredClone(page);
  assert.throws(() => tabs.readAnnotations(figure),isConflict);assert.deepEqual(page,before);
});

test('a full-source acknowledgment supersedes a different crop draft while reads and annotation acknowledgments retain it', () => {
  const {tabs,page,value}=fixture();page.objects.push(label('a'));
  const original=figureFor(page), draft=crop(-2);
  tabs.markRevision(original);page.meta.examDraftRender=structuredClone(draft);
  assert.deepEqual(tabs.readAnnotations(original).render,draft);
  const annotation={...original,id:'revision-b',editScope:'annotations',render:crop(-5)};
  tabs.markAnnotationRevision(annotation);
  assert.deepEqual(page.meta.examDraftRender,draft);
  const full={...annotation,id:'revision-c',render:crop(-7)};delete full.editScope;
  const undo=value.undoStack,redo=value.redoStack,objects=value.objects;
  tabs.markRevision(full);
  assert.equal(page.meta.examDraftRender,undefined);
  assert.deepEqual(page.meta.examRender,full.render);
  assert.deepEqual(tabs.readAnnotations(full).render,full.render);
  assert.equal(page.meta.examEditScope,'source');
  assert.equal(value.undoStack,undo);assert.equal(value.redoStack,redo);assert.equal(value.objects,objects);
});

test('three unchanged annotation reads preserve metadata and live drafts without emitting store events', () => {
  const {page,value,services}=fixture();page.objects.push(label('a','committed'));
  const state=createStore(value), tabs=createExamSourceTabs(state,services), figure=figureFor(page);
  tabs.markRevision(figure);
  value.objects=[{id:'image',type:'image',src:'unapplied'},label('a','unapplied')];
  page.meta.examDraftRender=crop(-2);value.selectedIds=['image'];
  value.undoStack.push([label('a','earlier')]);value.redoStack.push([label('a','later')]);
  const meta=page.meta, objects=value.objects, before=structuredClone(value), original=structuredClone(figure);
  let events=0;state.subscribe(() => events++);
  for(let read=0;read<3;read++) {
    const snapshot=tabs.readAnnotations(figure);
    assert.deepEqual(snapshot.draft,[label('a','unapplied')]);
    assert.deepEqual(snapshot.render,crop(-2));
  }
  assert.equal(events,0);assert.equal(page.meta,meta);assert.equal(value.objects,objects);
  assert.deepEqual(value,before);assert.deepEqual(figure,original);
});

test('a changed prepared crop updates revision metadata once and equivalent repeated reads emit no events', () => {
  const {page,value,services}=fixture();page.objects.push(label('a'));
  const state=createStore(value), tabs=createExamSourceTabs(state,services), figure=figureFor(page);
  tabs.markRevision(figure);
  const prepared={...figure,render:crop(-4)};
  let events=0;state.subscribe(() => events++);
  for(let read=0;read<3;read++) assert.deepEqual(tabs.readAnnotations(prepared).render,prepared.render);
  assert.equal(events,1);assert.deepEqual(page.meta.examRender,prepared.render);
  const meta=page.meta;
  const equivalent=structuredClone(prepared);
  const {x,y,w,h}=equivalent.render.bounds;
  equivalent.render={options:{excludeAllImages:false,includeReferenceImages:true},bounds:{h,w,y,x}};
  const {id,type,p1,p2,text,...style}=equivalent.source.pages[0].objects[0];
  equivalent.source.pages[0].objects[0]={text,p2,type,...style,id,p1};
  for(let read=0;read<3;read++) tabs.readAnnotations(equivalent);
  assert.equal(events,1);assert.equal(page.meta,meta);
});

test('RHWP source capture and activation preserve mixed candidate metadata independently',async()=>{
  const expected=mixedCandidate('data:image/png;base64,AQID');
  const context=aiContext();
  context.snapshot.tabs[0].generated=[expected];
  context.snapshot.tabs[0].selectedCandidateId=expected.id;
  let restored;
  const {tabs,page}=fixture({
    captureExamTask:async()=>structuredClone(context),
    restoreExamTask:async value=>{restored=structuredClone(value);return value;},
  });
  const captured=await tabs.capture(context);
  assertCandidateUnion(assert,captured.context.ai.snapshot.tabs[0].generated[0],expected);
  const figure={...captured,id:'revision-union',version:1};
  await tabs.activate(figure);
  assertCandidateUnion(assert,restored.snapshot.tabs[0].generated[0],expected);
  assert.deepEqual(restored,context);
  assert.equal(page.meta.examRevisionId,figure.id);
});

test('native label and graph source tabs use the shared materializer instead of raster transfer',async()=>{
  for(const field of ['labelPlan','graphResult']){
    const candidate=mixedCandidate('data:image/png;base64,AQID');
    if(field==='labelPlan')delete candidate.graphResult;
    else delete candidate.labelPlan;
    const context=aiContext();
    context.snapshot.tabs[0].generated=[candidate];
    context.snapshot.tabs[0].selectedCandidateId=candidate.id;
    const {tabs,value,services}=fixture({captureExamTask:async()=>context,close:()=>{}});
    const calls=[];
    services.insertImageFromSrc=()=>assert.fail('raster-only source transfer');
    services.materializeCandidate=async (item,options)=>{
      calls.push({item,options});
      value.objects=[{id:'native',type:field==='graphResult'?'coordplane':'image',aiTaskId:'task-a',aiCandidateId:item.id}];
      value.pages[0].objects=value.objects;
    };
    services.materializeCandidate.validate=item=>assert.equal(item,candidate);
    const captured=await tabs.prepareAi('task-a','scope-a');
    assert.equal(calls.length,1);assert.equal(calls[0].item,candidate);
    assert.deepEqual(calls[0].options,{taskId:'task-a'});
    assert.equal(captured.source.pages[0].objects[0].id,'native');
    candidate.id='next-native';
    context.snapshot.tabs[0].selectedCandidateId=candidate.id;
    await tabs.captureEdit({figure:{link},aiContext:context});
    assert.equal(calls.length,2);
    assert.deepEqual(calls[1].options,{taskId:'task-a',replaceId:'native'});
  }
});

test('native validation fails before closing AI or creating a linked source page',async()=>{
  const context=aiContext({tabId:'new-tab',assetId:'new-asset'});
  context.snapshot.tabs[0].generated=[{id:'invalid',graphResult:{}}];
  context.snapshot.tabs[0].selectedCandidateId='invalid';
  const {tabs,value,services}=fixture({captureExamTask:async()=>context,close:()=>assert.fail('closed before validation')});
  services.materializeCandidate=()=>assert.fail('materialized invalid candidate');
  services.materializeCandidate.validate=()=>{throw new Error('invalid native graph');};
  const before=structuredClone(value);
  await assert.rejects(tabs.prepareAi('task-a','scope-a'),/invalid native graph/);
  assert.deepEqual(value,before);
});
