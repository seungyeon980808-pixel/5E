const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const api=import('../js/ai-source-label-plan.js');
const base=()=>({version:4,observationVersion:1,leaderObservationVersion:1,labels:[{id:'a',text:'관찰 문구',sourceRef:1,scope:'general',mode:'leader',leaderPresence:'present',position:{x:.2,y:.2},typography:{role:'text',size:{w:.1,h:.04}},leaderDash:'dotted',leaderRoutes:[{kind:'straight',attachment:'label',start:{x:.25,y:.2},target:{x:.5,y:.4},controls:[],end:'none'}],targetBinding:{status:'confirmed',objectId:'object',reason:'Visible endpoint contact'}}],geometryLock:{version:1,objects:[{id:'object',sourceRef:1,description:'visible structure',bounds:{x:.5,y:.3,w:.2,h:.3},relations:[]}]},uncertainties:[],preservedMarks:[],removalRegions:[],protectedRegions:[],inkSearchRegions:[]});
function textObservation(presence='absent'){const v=base(),l=v.labels[0];l.mode='text';l.leaderPresence=presence;delete l.leaderRoutes;delete l.leaderDash;if(presence==='uncertain')v.uncertainties=[{sourceRef:1,labelId:'a',component:'leader',domain:'ownership',reason:'The faint mark cannot be assigned to this label.'}];return v;}
const current={requireLeaderObservation:true};
function assertQuarantined(run) {
 const p=run();assert.equal(p.labels.length,0);assert.ok(p.quarantinedItems.length);assert.ok(p.quarantinedItems.every(item=>item.deletionAuthority===false));return p;
}
const evidence=[];
function capture(name,value){evidence.push({name,...value});if(process.env.LEADER_PRESENCE_EVIDENCE)require('node:fs').writeFileSync(`${process.env.LEADER_PRESENCE_EVIDENCE}/contract-observables.json`,JSON.stringify(evidence,null,2));}
test('explicit observed dotted leaders retain actual routes, dash and all supported endpoint forms',async()=>{
 const {parseSourceLabelAnalysis}=await api;
 for(const end of ['none','open-arrow','filled-arrow','circle']){const v=base();v.labels[0].leaderRoutes[0].end=end;if(end==='circle')v.labels[0].leaderRoutes[0].endRadius=.003;
  const plan=parseSourceLabelAnalysis(JSON.stringify(v),1,[],current);
  assert.equal(plan.labels[0].mode,'leader');assert.equal(plan.labels[0].leaderDash,'dotted');assert.deepEqual(plan.labels[0].leaderRoutes,v.labels[0].leaderRoutes);assert.deepEqual(plan.labels[0].anchor,{x:.5,y:.4});
  assert.deepEqual(plan.sourceLeaderObservations,[{labelId:'a',sourceRef:1,presence:'present'}]);assert.equal(plan.leaderObservationVersion,1);assert.ok(Object.isFrozen(plan.sourceLeaderObservations[0]));capture(`present-${end}`,{accepted:true,observation:plan.sourceLeaderObservations,route:plan.labels[0].leaderRoutes});
 }
});
test('present cannot silently downgrade to text or default an unobserved dash or endpoint',async()=>{
 const {parseSourceLabelAnalysis}=await api;
 const mutations=[v=>{delete v.labels[0].leaderPresence;},v=>{v.labels[0].leaderPresence='invalid';},v=>{v.labels[0].mode='text';delete v.labels[0].leaderRoutes;},v=>{delete v.labels[0].leaderDash;},v=>{v.labels[0].leaderDash='unknown';},v=>{delete v.labels[0].leaderRoutes[0].end;},v=>{v.labels[0].leaderRoutes=[];}];
 for(const [i,mutate] of mutations.entries()){const v=base();mutate(v);assertQuarantined(()=>parseSourceLabelAnalysis(JSON.stringify(v),1,[],current));capture(`rejected-present-${i}`,{rejected:true});}
});
test('absence never invents leaders; uncertain requires exact same-label source component and survives normalization',async()=>{
 const {parseSourceLabelAnalysis}=await api;const absent=parseSourceLabelAnalysis(JSON.stringify(textObservation()),1,[],current);assert.equal(absent.labels[0].mode,'text');assert.equal(absent.labels[0].leaderRoutes,undefined);
 const v=textObservation('uncertain'),p=parseSourceLabelAnalysis(JSON.stringify(v),1,[],current);assert.deepEqual(p.uncertainties,v.uncertainties);assert.equal(p.sourceLeaderObservations[0].presence,'uncertain');assert.equal(p.labels[0].leaderRoutes,undefined);capture('uncertain-retained',{uncertainties:p.uncertainties,observations:p.sourceLeaderObservations});
 for(const patch of [{labelId:'b'},{sourceRef:2},{component:'endpoint'},{domain:'removal'},{reason:''}]){const bad=structuredClone(v);Object.assign(bad.uncertainties[0],patch);assertQuarantined(()=>parseSourceLabelAnalysis(JSON.stringify(bad),2,[],current));}
 for(const presence of ['absent','uncertain'])for(const field of ['leaderRoutes','leaderDash']){const bad=textObservation(presence);bad.labels[0][field]=field==='leaderRoutes'?base().labels[0].leaderRoutes:'solid';assertQuarantined(()=>parseSourceLabelAnalysis(JSON.stringify(bad),1,[],current));}
});
test('saved compact plans remain readable, but new-request parsing rejects missing/invalid presence contracts',async()=>{
 const {parseSourceLabelAnalysis}=await api;const old=base();delete old.leaderObservationVersion;delete old.labels[0].leaderPresence;
 const saved=parseSourceLabelAnalysis(JSON.stringify(old),1);assert.equal(saved.observationVersion,1);assert.equal(saved.sourceLeaderObservations,undefined);
 assert.throws(()=>parseSourceLabelAnalysis(JSON.stringify(old),1,[],current),/계약/);
 const mixed=base();delete mixed.leaderObservationVersion;assert.throws(()=>parseSourceLabelAnalysis(JSON.stringify(mixed),1));
 for(const version of [null,0,2,'1']){const bad=base();bad.leaderObservationVersion=version;assert.throws(()=>parseSourceLabelAnalysis(JSON.stringify(bad),1));}
 capture('legacy-read-only',{savedReadable:true,newRequestRejected:true});
});
test('new controller enforces presence contract and uncertain leader blocks an otherwise passing final review',async()=>{
 const {createSourceLabelController}=await api,attachments=[{name:'mock source',data:'data:image/png;base64,YQ=='}],selection={model:'test',effort:'low',models:[{model:'test',supportedReasoningEfforts:['low'],serviceTiers:[]}]};let c,calls=0;
 const checkIds=['object-counts','inside-outside','liquid-occupancy','connections','composition-state','black-fill-meaning','presentation','request-scope','raster-label-removal','editable-label-coverage','leader-relations','kice-flat-style','flat-gray-regions','label-overlay-alignment','label-typography','leader-overlay'];
 const review={verdict:'pass',checks:checkIds.map(id=>({id,label:id,status:'pass',detail:'Mock reviewer success, not image quality evidence'})),issues:[]};
 c=createSourceLabelController({collectCandidates:null,transport:{send:async()=>{const id=`mock-${++calls}`;queueMicrotask(()=>{const v=textObservation('uncertain');v.observationContractRevision='1.4.0';v.removalOnlyItems=[];Object.assign(v.labels[0],{disposition:'restore',semanticRole:'scientific-label',reason:'Visible scientific state label'});c.handleEvent({kind:'assistant',turnId:id,text:JSON.stringify(calls===1?v:review)});c.handleEvent({kind:'done',turnId:id,status:'completed'});});return{turnId:id};}}});
 const plan=await c.analyze({attachments,...selection});assert.equal(plan.sourceLeaderObservations[0].presence,'uncertain');
 const h=s=>createHash('sha256').update(s).digest('hex'),data='data:image/png;base64,Yg==',composite={attachment:{name:'mock final',data},report:{status:'mechanical-checks-clear',issues:[]},bindings:{candidateSha256:h(attachments[0].data),planSha256:h(JSON.stringify(plan)),compositeSha256:h(data)}};
 const final=await c.reviewFinal({attachments,candidate:attachments[0],plan,composite,...selection});assert.equal(final.verdict,'uncertain');assert.equal(calls,2);capture('mock-final-gate',{nativeCalls:0,mockTransportCalls:calls,verdict:final.verdict,uncertainties:plan.uncertainties});
});
