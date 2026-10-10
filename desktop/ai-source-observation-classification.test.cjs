const test = require('node:test');
const assert = require('node:assert/strict');
const api = import('../js/ai-source-label-plan.js');
const geometry = {version:1,objects:[
  {id:'instrument',sourceRef:1,role:'scientific-object',description:'scientific apparatus',bounds:{x:.4,y:.3,w:.25,h:.5},relations:[]},
  ...['planet','cells','optics'].map((id,i)=>({id,sourceRef:1,role:'scientific-inset',description:`observed scientific inset ${i+1}`,bounds:{x:.05+i*.3,y:.05,w:.2,h:.15},relations:[]})),
]};
const label = (id,extra={}) => ({id,text:'기관 이름',sourceRef:1,scope:'general',disposition:'restore',semanticRole:'scientific-label',reason:'Direct scientific naming role',
  mode:'text',leaderPresence:'absent',position:{x:.2,y:.5},contentMode:'plain',typography:{role:'name',size:{w:.12,h:.04}},
  targetBinding:{status:'confirmed',objectId:'instrument',reason:'Names the observed apparatus'},...extra});
const wire = labels => ({version:4,observationVersion:1,leaderObservationVersion:1,observationContractRevision:'1.4.0',
  labels,geometryLock:structuredClone(geometry),preservedMarks:[],uncertainties:[],removalRegions:[],protectedRegions:[],inkSearchRegions:[],removalOnlyItems:[]});
const figure = {status:'confirmed',bindingKind:'figure',sourceRef:1,reason:'Observed surrounding page text'};
const set = {version:1,sourceRef:1,sourceSha256:'a'.repeat(64),width:100,height:100,candidates:[{id:'candidate',text:'OCR',origin:'ocr',bounds:{x:.1,y:.4,w:.1,h:.1}}]};

test('semantic roles separate restoration, page removal, scientific insets and graph ownership',async()=>{
  const {parseSourceLabelAnalysis,buildSourceLabelRemovalManifest}=await api;
  const v=wire([label('name'),label('long-state',{text:'과학적 상태를 나타내는 길고 명확한 문장으로 관찰한 긴 문구도 원문의 의미를 보존한다.',typography:{role:'text',size:{w:.3,h:.05}}}),
    ...['textbook-prose','caption','speech'].map((semanticRole,i)=>label(`page-${i}`,{text:'짧다',disposition:'remove-only',semanticRole,targetBinding:figure})),
    label('axis',{scope:'graph',disposition:'graph-owned',semanticRole:'graph-label',text:'온도',targetBinding:{status:'uncertain',reason:'Graph axis ownership'}})]);
  v.removalOnlyItems=[{id:'character',sourceRef:1,kind:'decoration',bounds:{x:.8,y:.6,w:.15,h:.3},reason:'Decorative character, not an apparatus'}];
  const p=parseSourceLabelAnalysis(JSON.stringify(v),1,[],{requireClassification:true});
  assert.deepEqual(p.labels.map(l=>l.id),['name','long-state']);
  assert.deepEqual(p.removalOnlyItems.map(l=>l.kind),['textbook-prose','caption','speech','decoration']);
  assert.deepEqual(p.graphOwnedLabels.map(l=>l.id),['axis']);
  assert.equal(p.geometryLock.objects.filter(o=>o.role==='scientific-inset').length,3);
  const manifest=buildSourceLabelRemovalManifest(p);
  assert.equal(manifest.length,6);assert.equal(manifest.some(l=>l.id==='axis'),false);
  assert.ok(manifest.filter(l=>l.disposition==='remove-only').every(l=>l.restore===false));
  assert.deepEqual(p.quarantinedItems,[]);assert.ok(Object.isFrozen(p.removalOnlyItems[0]));
});

test('malformed optional groups never discard individual labels or invent group semantics',async()=>{
  const {parseSourceLabelAnalysis}=await api;
  for(const groups of [
    [{id:'g',kind:'phrase',order:1},undefined],
    [{id:'g',kind:'phrase',order:0},{id:'g',kind:'phrase',order:0}],
    [{id:'g',kind:'reaction',order:0},{id:'g',kind:'sequence',order:1}],
    [{id:'g',kind:'phrase',order:0},{id:'g',kind:'phrase',order:2}],
    [{id:'g',kind:'invalid',order:0},{id:'g',kind:'phrase',order:1}],
  ]) {
    const v=wire(groups.map((relationGroup,i)=>label(`label-${i}`,{relationGroup})));
    const p=parseSourceLabelAnalysis(JSON.stringify(v),1);
    assert.equal(p.labels.length,2);assert.deepEqual(p.relationGroups,[]);assert.ok(p.discardedRelationGroups.length);
    assert.ok(p.discardedRelationGroups.every(g=>g.reason));assert.deepEqual(p.quarantinedItems,[]);
  }
});

test('invalid source candidate target and coordinate bindings quarantine only affected items',async()=>{
  const {parseSourceLabelAnalysis,buildSourceLabelRemovalManifest}=await api;
  for(const bad of [
    {sourceRef:2},
    {position:{x:-.1,y:.5}},
    {targetBinding:{status:'confirmed',objectId:'invented',reason:'No source object'}},
    {position:undefined,typography:{role:'name'},textCandidateIds:['unknown']},
    {position:undefined,typography:{role:'name'},textCandidateIds:['candidate','candidate']},
  ]) {
    const v=wire([label('good'),label('bad',bad)]);
    v.inkSearchRegions=[{id:'bad-ink',labelId:'bad',sourceRef:1,ownership:'confirmed',component:'text',bounds:{x:.1,y:.4,w:.1,h:.1},background:[255,255,255,255]}];
    const before=JSON.stringify(v),p=parseSourceLabelAnalysis(before,1,[set]);
    assert.equal(JSON.stringify(v),before);assert.deepEqual(p.labels.map(l=>l.id),['good']);
    assert.equal(p.quarantinedItems[0].labelId,'bad');assert.equal(p.quarantinedItems[0].deletionAuthority,false);
    assert.deepEqual(p.inkSearchRegions,[]);assert.deepEqual(buildSourceLabelRemovalManifest(p).map(l=>l.id),['good']);
  }
});

test('every item claiming shared candidates is quarantined, including graph and removal-only claims',async()=>{
  const {parseSourceLabelAnalysis,buildSourceLabelRemovalManifest}=await api;
  const selected=extra=>label(extra.id,{position:undefined,typography:{role:'name'},textCandidateIds:['candidate'],...extra});
  const p=parseSourceLabelAnalysis(JSON.stringify(wire([label('good'),selected({id:'first'}),
    selected({id:'second',scope:'graph',disposition:'graph-owned',semanticRole:'graph-label'})])),1,[set]);
  assert.deepEqual(p.labels.map(l=>l.id),['good']);assert.equal(p.quarantinedItems.length,2);
  assert.deepEqual(p.graphOwnedLabels,[]);assert.deepEqual(buildSourceLabelRemovalManifest(p).map(l=>l.id),['good']);
});

test('quarantining a group member never silently turns the surviving subset into a complete group',async()=>{
  const {parseSourceLabelAnalysis}=await api;
  const v=wire([0,1,2].map(order=>label(`member-${order}`,{relationGroup:{id:'reaction',kind:'reaction',order}})));
  v.labels[2].targetBinding.objectId='missing';
  const p=parseSourceLabelAnalysis(JSON.stringify(v),1);
  assert.equal(p.labels.length,2);assert.deepEqual(p.relationGroups,[]);
  assert.ok(p.discardedRelationGroups.some(g=>g.id==='reaction'));assert.equal(p.quarantinedItems.length,1);
});

test('removal-only items cannot overlap scientific insets or acquire authority from invalid metadata',async()=>{
  const {parseSourceLabelAnalysis,buildSourceLabelRemovalManifest}=await api;
  const v=wire([label('good'),label('wrong-role',{disposition:'remove-only',semanticRole:'scientific-label'})]);
  v.removalOnlyItems=[{id:'inset-cover',sourceRef:1,kind:'decoration',bounds:{x:.05,y:.05,w:.2,h:.15},reason:'Claimed decoration'}];
  const p=parseSourceLabelAnalysis(JSON.stringify(v),1);
  assert.deepEqual(p.labels.map(l=>l.id),['good']);assert.deepEqual(p.removalOnlyItems,[]);
  assert.equal(p.quarantinedItems.length,2);assert.equal(p.geometryLock.objects.length,4);
  assert.deepEqual(buildSourceLabelRemovalManifest(p).map(l=>l.id),['good']);
});

test('root versions source frames and source geometry remain fatal and legacy classification is not guessed',async()=>{
  const {parseSourceLabelAnalysis}=await api;
  const v=wire([label('good')]);
  for(const mutate of [x=>x.version=2,x=>x.observationVersion=2,x=>x.geometryLock.objects[0].bounds.w=2,x=>x.geometryLock.objects[0].sourceRef=2]) {
    const bad=structuredClone(v);mutate(bad);assert.throws(()=>parseSourceLabelAnalysis(JSON.stringify(bad),1));
  }
  assert.throws(()=>parseSourceLabelAnalysis(JSON.stringify(v),1,[{...set,width:0}]),/프레임/);
  const old=structuredClone(v);delete old.observationContractRevision;delete old.labels[0].disposition;delete old.labels[0].semanticRole;delete old.labels[0].reason;
  old.labels[0].text='페이지 설명처럼 읽히더라도 과거 응답의 소유 판정을 임의로 바꾸지 않는다.';
  const p=parseSourceLabelAnalysis(JSON.stringify(old),1);assert.equal(p.labels.length,1);assert.equal(p.observationContractRevision,'1.3.4');
  assert.deepEqual(p.removalOnlyItems,[]);assert.throws(()=>parseSourceLabelAnalysis(JSON.stringify(old),1,[],{requireClassification:true}),/분류 계약/);
});

test('malformed protection metadata keeps readable labels but grants no source deletion authority',async()=>{
  const {parseSourceLabelAnalysis,buildSourceLabelRemovalManifest}=await api,v=wire([label('good')]);
  v.protectedRegions=[{sourceRef:1,bounds:{x:.9,y:.5,w:.2,h:.1},reason:'Clipped protected scientific structure'}];
  v.inkSearchRegions=[{id:'ink',labelId:'good',sourceRef:1,ownership:'confirmed',component:'text',bounds:{x:.1,y:.4,w:.1,h:.1},background:[255,255,255,255]}];
  const p=parseSourceLabelAnalysis(JSON.stringify(v),1);assert.equal(p.labels.length,1);
  assert.equal(p.quarantinedItems[0].stage,'protectedRegions');assert.equal(p.quarantinedItems[0].deletionAuthority,false);
  assert.deepEqual(p.inkSearchRegions,[]);assert.deepEqual(buildSourceLabelRemovalManifest(p),[]);
  assert.equal(p.removalReadiness.status,'needs-observation');
});

test('duplicate optional deletion items and regions cannot rescue quarantined ownership',async()=>{
  const {parseSourceLabelAnalysis,buildSourceLabelRemovalManifest}=await api,v=wire([label('good'),label('bad',{sourceRef:2})]);
  const decoration={id:'bad',sourceRef:1,kind:'decoration',bounds:{x:.8,y:.6,w:.1,h:.1},reason:'Claimed page decoration'};
  v.removalOnlyItems=[decoration,{...decoration,id:'repeat'},{...decoration,id:'repeat'}];
  const search={id:'repeat-ink',labelId:'good',sourceRef:1,ownership:'confirmed',component:'text',bounds:{x:.1,y:.4,w:.1,h:.1},background:[255,255,255,255]};
  v.inkSearchRegions=[search,structuredClone(search)];
  const p=parseSourceLabelAnalysis(JSON.stringify(v),1);
  assert.deepEqual(p.labels.map(l=>l.id),['good']);assert.deepEqual(p.removalOnlyItems,[]);assert.deepEqual(p.inkSearchRegions,[]);
  assert.deepEqual(buildSourceLabelRemovalManifest(p).map(l=>l.id),['good']);assert.equal(p.quarantinedItems.length,6);
});
