const test=require('node:test'),assert=require('node:assert/strict');
const api=import('../js/ai-source-label-plan.js');
function assertQuarantined(run,reason) {
 const plan=run();assert.ok(plan.quarantinedItems.length);
 assert.ok(plan.quarantinedItems.every(item=>item.deletionAuthority===false));
 if(reason)assert.match(plan.quarantinedItems.map(item=>item.reason).join('\n'),reason);
 return plan;
}
const geometryLock={version:1,objects:[{id:'vessel',sourceRef:1,description:'one vessel',bounds:{x:.5,y:.2,w:.2,h:.6},relations:[]}]};
const label=(id='a')=>({id,text:'혈관',sourceRef:1,scope:'general',mode:'leader',position:{x:.2,y:.2},typography:{role:'text',bounds:{x:.1,y:.15,w:.2,h:.1}},leaderRoutes:[{kind:'straight',attachment:'label',start:{x:.3,y:.2},target:{x:.5,y:.3},controls:[],end:'none'}],targetBinding:{status:'confirmed',objectId:'vessel',reason:'leader ends at visible vessel'}});
const wire=(labels=[label()])=>({version:4,observationVersion:1,labels,geometryLock,uncertainties:[],preservedMarks:[],removalRegions:[],protectedRegions:[],inkSearchRegions:[]});
test('canonical wire derives runtime anchor and integrates source association without a second call',async()=>{
 const {parseSourceLabelAnalysis,buildSourceLabelAnalysisPrompt}=await api,p=parseSourceLabelAnalysis(JSON.stringify(wire()),1);
 assert.deepEqual(p.labels[0].anchor,{x:.5,y:.3});assert.equal(p.observationVersion,1);
 assert.deepEqual(p.sourceAssociations,[{labelId:'a',status:'confirmed',objectId:'vessel',reason:'leader ends at visible vessel'}]);
 assert.ok(Object.isFrozen(p.sourceAssociations[0]));assert.match(buildSourceLabelAnalysisPrompt({referenceNames:['source']}),/observationVersion/);
 assert.equal(p.removalReadiness.status,'needs-observation');assert.equal(p.removalReadiness.pixelReady,false);
 assert.deepEqual(p.removalReadiness.coverage[0].missing,['text','leader','endpoint']);
});
test('compact duplicate coordinates and conflicting legacy targets both reject without repair',async()=>{
 const {parseSourceLabelAnalysis}=await api;
 const compact=wire();compact.labels[0].anchor={x:.5,y:.3};assertQuarantined(()=>parseSourceLabelAnalysis(JSON.stringify(compact),1),/중복/);
 const legacy=wire();legacy.reviewRequired=false;delete legacy.observationVersion;legacy.labels[0].anchor={x:.6,y:.3};assertQuarantined(()=>parseSourceLabelAnalysis(JSON.stringify(legacy),1),/명세/);
 legacy.labels[0].anchor={x:.5,y:.3};assert.ok(parseSourceLabelAnalysis(JSON.stringify(legacy),1).labels.length===1);
});
test('clipped coordinates and malformed JSON reject; Unicode script metadata is not silently dropped',async()=>{
 const {parseSourceLabelAnalysis}=await api;
 const clipped=wire();clipped.labels[0].typography.bounds.x=.95;assertQuarantined(()=>parseSourceLabelAnalysis(JSON.stringify(clipped),1),/명세/);
 assert.throws(()=>parseSourceLabelAnalysis('{"version":4,}',1),/JSON/);
 const unicode=wire();Object.assign(unicode.labels[0],{mode:'text',text:'H₂O'});delete unicode.labels[0].leaderRoutes;unicode.labels[0].typography.role='chemical';
 assert.equal(parseSourceLabelAnalysis(JSON.stringify(unicode),1).labels[0].text,'H₂O');
 unicode.labels[0].typography.scriptStyles=[{start:1,end:2,kind:'sub',role:'number'}];assertQuarantined(()=>parseSourceLabelAnalysis(JSON.stringify(unicode),1),/명세/);
 unicode.labels[0].text='H_{2}O';unicode.labels[0].contentMode='formula';unicode.labels[0].typography.scriptStyles=[{start:3,end:4,kind:'sub',role:'number'}];assert.equal(parseSourceLabelAnalysis(JSON.stringify(unicode),1).labels[0].typography.scriptStyles.length,1);
});
test('uncertain object identity stays uncertain and groups preserve source reading order',async()=>{
 const {parseSourceLabelAnalysis}=await api,a=label('a'),b=label('b');
 a.targetBinding={status:'uncertain',reason:'caption identity unreadable'};
 a.relationGroup={id:'reaction',kind:'reaction',order:1};b.relationGroup={id:'reaction',kind:'reaction',order:0};
 const p=parseSourceLabelAnalysis(JSON.stringify(wire([a,b])),1);
 assert.deepEqual(p.relationGroups,[{id:'reaction',kind:'reaction',sourceRef:1,labelIds:['b','a']}]);assert.equal(p.sourceAssociations[0].status,'uncertain');assert.equal(p.sourceAssociations[0].objectId,undefined);
 b.targetBinding.objectId='imagined';const held=assertQuarantined(()=>parseSourceLabelAnalysis(JSON.stringify(wire([a,b])),1),/객체/);assert.deepEqual(held.labels.map(l=>l.id),['a']);
 b.targetBinding.objectId='vessel';b.relationGroup.order=1;const conflict=parseSourceLabelAnalysis(JSON.stringify(wire([a,b])),1);assert.equal(conflict.labels.length,2);assert.deepEqual(conflict.relationGroups,[]);assert.match(conflict.discardedRelationGroups[0].reason,/순서/);
});
test('confirmed search coverage is pending pixel verification, never removal-ready at parse time',async()=>{
 const {parseSourceLabelAnalysis}=await api,v=wire();v.labels[0].mode='text';delete v.labels[0].leaderRoutes;
 v.inkSearchRegions=[{id:'ink-a',labelId:'a',sourceRef:1,ownership:'confirmed',component:'text',bounds:{x:.1,y:.15,w:.2,h:.1},background:[255,255,255,255]}];
 const p=parseSourceLabelAnalysis(JSON.stringify(v),1);assert.equal(p.removalReadiness.status,'needs-pixel-verification');assert.equal(p.removalReadiness.pixelReady,false);
 v.inkSearchRegions[0].ownership='uncertain';const held=assertQuarantined(()=>parseSourceLabelAnalysis(JSON.stringify(v),1));assert.deepEqual(held.inkSearchRegions,[]);
});

test('centered source size derives one consistent frame-bounded box without repairing clipped old observations',async()=>{
 const {parseSourceLabelAnalysis}=await api,v=wire(),l=v.labels[0];l.mode='text';delete l.leaderRoutes;
 l.position={x:.15,y:.96};l.typography={role:'name',size:{w:.05,h:.06}};l.text='(가)';l.targetBinding={status:'confirmed',bindingKind:'figure',sourceRef:1,reason:'Observed panel marker below diagram'};
 const p=parseSourceLabelAnalysis(JSON.stringify(v),1);assert.ok(Math.abs(p.labels[0].typography.bounds.x-.125)<1e-12);assert.ok(Math.abs(p.labels[0].typography.bounds.y-.93)<1e-12);assert.equal(p.labels[0].typography.bounds.h,.06);assert.equal(p.labels[0].text,'(가)');
 assert.deepEqual(p.sourceAssociations,[{labelId:'a',status:'confirmed',bindingKind:'figure',sourceRef:1,reason:'Observed panel marker below diagram'}]);
 l.typography.size.h=.1011;const before=JSON.stringify(v);assertQuarantined(()=>parseSourceLabelAnalysis(before,1),/캔버스/);assert.equal(JSON.stringify(v),before);
 l.typography={role:'name',bounds:{x:.1183,y:.9134,w:.0501,h:.1011}};assertQuarantined(()=>parseSourceLabelAnalysis(JSON.stringify(v),1),/명세/);
 l.typography={role:'name',size:{w:.05,h:.06},bounds:{x:.125,y:.93,w:.05,h:.06}};assertQuarantined(()=>parseSourceLabelAnalysis(JSON.stringify(v),1),/중복/);
});
test('typed figure ownership cannot bind another source, a leader, or invent an object',async()=>{
 const {parseSourceLabelAnalysis}=await api,v=wire(),l=v.labels[0];
 l.targetBinding={status:'confirmed',bindingKind:'figure',sourceRef:1,reason:'caption'};
 assertQuarantined(()=>parseSourceLabelAnalysis(JSON.stringify(v),1),/주석/);
 l.mode='text';delete l.leaderRoutes;l.targetBinding.sourceRef=2;assertQuarantined(()=>parseSourceLabelAnalysis(JSON.stringify(v),1),/주석/);
 l.targetBinding.sourceRef=1;l.targetBinding.objectId='vessel';assertQuarantined(()=>parseSourceLabelAnalysis(JSON.stringify(v),1),/주석/);
 l.targetBinding={status:'confirmed',bindingKind:'object',objectId:'vessel',reason:'Actual visible vessel'};assert.equal(parseSourceLabelAnalysis(JSON.stringify(v),1).sourceAssociations[0].bindingKind,'object');
 l.targetBinding={status:'uncertain',bindingKind:'figure',sourceRef:1,reason:'Unreadable'};assertQuarantined(()=>parseSourceLabelAnalysis(JSON.stringify(v),1),/불확실/);
});
test('literal parenthesized polarity and caption punctuation are retained in centered observation',async()=>{
 const {parseSourceLabelAnalysis,buildSourceLabelAnalysisPrompt}=await api;
 for(const text of ['(−)','(+)','| 그림 16 | 전류가 흐르는 코일 주위의 자기장']){
  const v=wire(),l=v.labels[0];l.mode='text';delete l.leaderRoutes;l.text=text;l.typography={role:'text',size:{w:.2,h:.06}};l.targetBinding=text.startsWith('|')?{status:'confirmed',bindingKind:'figure',sourceRef:1,reason:'Printed source caption'}:{status:'confirmed',objectId:'vessel',reason:'Printed polarity of observed component'};
  assert.equal(parseSourceLabelAnalysis(JSON.stringify(v),1).labels[0].text,text);
 }
 const prompt=buildSourceLabelAnalysisPrompt({referenceNames:['source']});assert.match(prompt,/괄호까지 포함/);assert.match(prompt,/표준 개수를 추측하지/);
});

test('typed uncertainty preserves exact domain and component without clearing legacy reasons',async()=>{
 const {parseSourceLabelAnalysis}=await api,v=wire();
 v.uncertainties=[{sourceRef:1,labelId:'a',component:'endpoint',domain:'removal',reason:'Known annotation endpoint cannot be isolated into a pixel mask',bounds:{x:.4,y:.2,w:.1,h:.1}},'Legacy uncertainty remains unresolved'];
 const p=parseSourceLabelAnalysis(JSON.stringify(v),1);assert.deepEqual(p.uncertainties,v.uncertainties);assert.ok(Object.isFrozen(p.uncertainties[0]));
 for(const [key,value] of [['domain','safe'],['component','vessel'],['labelId','invalid id']]){const bad=structuredClone(v);bad.uncertainties[0][key]=value;const p=assertQuarantined(()=>parseSourceLabelAnalysis(JSON.stringify(bad),1));assert.equal(p.labels.length,1);}
});
