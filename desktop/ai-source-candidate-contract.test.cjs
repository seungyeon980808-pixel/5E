const test=require('node:test'),assert=require('node:assert/strict');
const api=import('../js/ai-source-label-plan.js');
const contract=import('../js/ai-source-candidate-contract.js');
const schema=import('../js/ai-label-json-schema.js');
function assertQuarantined(run,reason) {
 const p=run();assert.ok(p.quarantinedItems.length);assert.ok(p.quarantinedItems.every(item=>item.deletionAuthority===false));
 assert.deepEqual(p.inkSearchRegions,[]);assert.deepEqual(p.removalRegions,[]);
 if(reason)assert.match(p.quarantinedItems.map(item=>item.reason).join('\n'),reason);
 return p;
}
const set=(sourceRef=1)=>({version:1,sourceRef,sourceSha256:'a'.repeat(64),width:100,height:80,candidates:[{id:`s${sourceRef}-a`,text:'온도',bounds:{x:.1,y:.2,w:.1,h:.04},origin:'ocr',confidence:80},{id:`s${sourceRef}-b`,text:'센서',bounds:{x:.21,y:.2,w:.1,h:.04},origin:'ocr',confidence:70}]});
const wire=()=>({version:4,observationVersion:1,leaderObservationVersion:1,labels:[{id:'sensor',text:'온도 센서',sourceRef:1,scope:'general',leaderPresence:'absent',mode:'text',textCandidateIds:['s1-a','s1-b'],contentMode:'plain',typography:{role:'name'},targetBinding:{status:'confirmed',objectId:'sensor-object',reason:'Visible sensor name'}}],preservedMarks:[],uncertainties:[],geometryLock:{version:1,objects:[{id:'sensor-object',sourceRef:1,description:'sensor',bounds:{x:.4,y:.1,w:.2,h:.2},relations:[]}]},removalRegions:[],protectedRegions:[],inkSearchRegions:[]});

test('explicit selected source IDs derive one union, preserve literal text, never grant removal',async()=>{
 const {parseSourceLabelAnalysis}=await api,v=wire(),before=JSON.stringify(v),p=parseSourceLabelAnalysis(before,1,[set()]);
 assert.equal(JSON.stringify(v),before);assert.equal(p.labels[0].text,'온도 센서');
 assert.ok(Math.abs(p.labels[0].typography.bounds.w-.21)<1e-12);assert.ok(Math.abs(p.labels[0].typography.bounds.x-.1)<1e-12);
 assert.ok(Math.abs(p.labels[0].position.x-.205)<1e-12);
 assert.deepEqual(p.sourceTextCandidateSelections[0].textCandidateIds,['s1-a','s1-b']);
 assert.ok(Object.isFrozen(p.sourceTextCandidateSelections[0]));
 assert.equal(p.removalReadiness.pixelReady,false);assert.deepEqual(p.inkSearchRegions,[]);
});
test('separate confirmed-candidate search authorizes inspection only, with exact source frame and no bbox erasure',async()=>{
 const {parseSourceLabelAnalysis}=await api,v=wire();v.labels[0].textInkSearch={status:'confirmed-candidates',textCandidateIds:['s1-a','s1-b'],background:[255,255,255,255]};
 const before=JSON.stringify(v),p=parseSourceLabelAnalysis(before,1,[set()]);assert.equal(JSON.stringify(v),before);
 assert.equal(p.inkSearchRegions.length,1);assert.equal(p.inkSearchRegions[0].ownership,'confirmed');assert.equal(p.inkSearchRegions[0].backgroundMode,'sample-flat');
 const b=p.inkSearchRegions[0].bounds;assert.ok(Math.abs(b.x-.08)<1e-12);assert.ok(Math.abs(b.y-.175)<1e-12);assert.ok(Math.abs(b.w-.25)<1e-12);assert.ok(Math.abs(b.h-.09)<1e-12);
 assert.equal(p.removalReadiness.pixelReady,false);assert.deepEqual(p.removalRegions,[]);
 const s=(await schema).buildSourceObservationOutputSchema(1,[set()],{imageKind:'exam'});assert.ok(s.$defs.textInkSearch.anyOf.some(x=>x.properties.textCandidateIds));
});
test('explicit candidate searches reject unknown, cross-source, duplicate, reused IDs and uncertain ownership',async()=>{
 const {parseSourceLabelAnalysis}=await api;
 for(const ids of [['unknown'],['s2-a'],['s1-a','s1-a'],[]]){const v=wire();v.labels[0].textInkSearch={status:'confirmed-candidates',textCandidateIds:ids,background:[255,255,255,255]};assertQuarantined(()=>parseSourceLabelAnalysis(JSON.stringify(v),2,[set(),set(2)]));}
 const v=wire();v.labels[0].textInkSearch={status:'confirmed-candidates',textCandidateIds:['s1-a'],background:[255,255,255,255]};v.labels[0].reviewRequired=true;assertQuarantined(()=>parseSourceLabelAnalysis(JSON.stringify(v),1,[set()]),/소속/);
 delete v.labels[0].reviewRequired;const other=structuredClone(v.labels[0]);other.id='other';delete other.textCandidateIds;other.position={x:.5,y:.5};other.typography={role:'name',size:{w:.1,h:.1}};v.labels.push(other);const held=assertQuarantined(()=>parseSourceLabelAnalysis(JSON.stringify(v),1,[set()]),/후보/);assert.equal(held.labels.length,0);
});
test('unknown, cross-source, duplicated and shared candidate IDs fail closed',async()=>{
 const {parseSourceLabelAnalysis}=await api;
 for(const ids of [['missing'],['s2-a'],['s1-a','s1-a'],[]]){const v=wire();v.labels[0].textCandidateIds=ids;assertQuarantined(()=>parseSourceLabelAnalysis(JSON.stringify(v),2,[set(),set(2)]));}
 const v=wire();v.labels.push({...structuredClone(v.labels[0]),id:'duplicate'});const held=assertQuarantined(()=>parseSourceLabelAnalysis(JSON.stringify(v),1,[set()]),/후보/);assert.equal(held.labels.length,0);
});
test('source candidate coordinates cannot be combined with model coordinates or legacy wire',async()=>{
 const {parseSourceLabelAnalysis}=await api;
 for(const extra of [{position:{x:.2,y:.2}},{typography:{role:'name',size:{w:.1,h:.1}}},{typography:{role:'name',bounds:{x:.1,y:.1,w:.1,h:.1}}}]){
  const v=wire();Object.assign(v.labels[0],extra);assertQuarantined(()=>parseSourceLabelAnalysis(JSON.stringify(v),1,[set()]),/좌표/);
 }
 const v=wire();delete v.observationVersion;delete v.leaderObservationVersion;delete v.labels[0].leaderPresence;assert.throws(()=>parseSourceLabelAnalysis(JSON.stringify(v),1,[set()]),/wire/);
});
test('candidate metadata is bounded and malformed boxes are rejected without clamping',async()=>{
 const {normalizeSourceCandidateSets}=await contract;
 for(const edit of [s=>s.candidates[0].bounds.x=-.01,s=>s.candidates[0].bounds.w=.95,s=>s.sourceSha256='wrong',s=>s.candidates[0].origin='qa',s=>s.candidates[0].confidence=101,s=>s.candidates.push(structuredClone(s.candidates[0]))]){
  const s=set();edit(s);const before=JSON.stringify(s);assert.throws(()=>normalizeSourceCandidateSets([s]));assert.equal(JSON.stringify(s),before);
 }
 const clean=normalizeSourceCandidateSets([{...set(),artifacts:{private:'not model input'},diagnostics:['ignored']}]);assert.equal(clean[0].artifacts,undefined);
});
test('schema contains actual source ID enum once and manual observation remains available',async()=>{
 const {buildSourceObservationOutputSchema}=await schema,s=buildSourceObservationOutputSchema(1,[set()]);
 assert.deepEqual(s.$defs.textCandidateId.enum,['s1-a','s1-b']);
 assert.equal(JSON.stringify(s).includes('uniqueItems'),false);
 const choices=s.$defs.label.anyOf;assert.ok(choices.some(x=>x.properties.position));assert.ok(choices.some(x=>x.properties.textCandidateIds && !x.properties.position));
 assert.ok(Buffer.byteLength(JSON.stringify(s))<200000);
 const {parseSourceLabelAnalysis}=await api,v=wire();delete v.labels[0].textCandidateIds;v.labels[0].position={x:.2,y:.2};v.labels[0].typography.size={w:.1,h:.05};assert.equal(parseSourceLabelAnalysis(JSON.stringify(v),1,[set()]).labels.length,1);
});
test('controller binds collection to original transport, captures before sending, and parses unmodified response',async()=>{
 const {createSourceLabelController}=await api;let controller,payload,receipt;const data='data:image/png;base64,YQ==';
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data))),x=>x.toString(16).padStart(2,'0')).join('');
 const transport={send:async p=>{payload=p;queueMicrotask(()=>{const v=wire();v.observationContractRevision='1.4.0';v.removalOnlyItems=[];Object.assign(v.labels[0],{disposition:'restore',semanticRole:'scientific-label',reason:'Visible scientific sensor label'});controller.handleEvent({kind:'assistant',threadId:'thread',text:JSON.stringify(v)});controller.handleEvent({kind:'done',threadId:'thread',status:'completed'});});return{threadId:'thread'};}};
 controller=createSourceLabelController({transport,collectCandidates:async(input)=>({...set(),sourceSha256:input.sourceSha256,timings:{totalMs:2}})});
 const plan=await controller.analyze({attachments:[{name:'source',data}],model:'gpt-6-luna',effort:'medium',models:[{model:'gpt-6-luna',supportedReasoningEfforts:['medium'],serviceTiers:[]}],onSourceCandidates:r=>receipt=r});
 assert.equal(plan.sourceBindings[0].transportSha256,sha);assert.equal(plan.sourceTextCandidateBindings[0].sourceSha256,sha);assert.equal(receipt.candidateSets[0].sourceSha256,sha);
 assert.match(payload.text,/textCandidateIds/);assert.equal(payload.attachments.length,1);assert.equal(plan.labels[0].text,'온도 센서');
});
test('cancel during OCR or asynchronous receipt never dispatches a native turn',async()=>{
 const {createSourceLabelController}=await api;let calls=0,entered,continueReceipt;const enteredPromise=new Promise(r=>entered=r);
 const controller=createSourceLabelController({transport:{send:async()=>{calls++;return{threadId:'bad'};}},collectCandidates:async input=>({...set(),sourceSha256:input.sourceSha256})});
 const abort=new AbortController(),p=controller.analyze({attachments:[{data:'data:image/png;base64,YQ=='}],signal:abort.signal,onSourceCandidates:async()=>{entered();await new Promise(r=>continueReceipt=r);}});
 await enteredPromise;abort.abort();continueReceipt();await assert.rejects(p,/취소/);assert.equal(calls,0);assert.equal(controller.isActive(),false);
});
