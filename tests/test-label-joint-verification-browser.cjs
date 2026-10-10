// Retained source 6e2c55012461859cdc8afb4d9596d3f08d5409b4; explicitly synthetic current 1.4.0 observations.
// PNG source drawing and all tamper/cancellation negatives are retained.
const { installLabelSourcePage, armSelection, selectionArrived } = require('./helpers/label-source-browser.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {syntheticJointObservation}=require('./helpers/label-source-pipeline-browser.cjs');
const retainedUrl=()=>{const url=process.env.PREVIEW_URL||process.env.RELEASE_URL||process.env.EXAM_URL;assert.ok(url,'Retained candidate URL required');return new URL(process.env.APP_ENTRY||'/',url).href;};
const evidence=process.env.EVIDENCE_DIR||path.resolve(__dirname,'../.omo/evidence/luna-label-harness-vnext-20261005/integration-tests');
test('native source plus joint verification uses two Luna turns; fallback blocks cache; editable formula groups survive reopen', {timeout:60000},async()=>{
 fs.mkdirSync(evidence,{recursive:true});const browser=await chromium.launch({headless:true});
 try{const page=await browser.newPage();await installLabelSourcePage(page);await page.goto(retainedUrl(),{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async observationFixtures=>{
  const {executeImageLabelRun,imageLabelDigest}=await import('/js/ai-image-label-run.js?v=1.7.0-four-session-integration');
  const {createSourceLabelController}=await import('/js/ai-source-label-plan.js?v=1.7.0-four-session-integration');
  const v='?v=1.7.0-four-session-integration', {state}=await import('/js/state.js'+v),{applyLoaded,serialize}=await import('/js/project-io.js'+v),{insertImageFromSrc}=await import('/js/image-paste.js'+v),{undo,redo}=await import('/js/transform.js'+v);
  const c=document.createElement('canvas');c.width=800;c.height=600;const cx=c.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,800,600);cx.fillStyle='#000';cx.strokeRect(100,350,90,90);const raw=c.toDataURL();
  const ids=['object-counts','inside-outside','liquid-occupancy','connections','composition-state','black-fill-meaning','presentation','request-scope','raster-label-removal','editable-label-coverage','leader-relations','label-overlay-alignment','label-typography','leader-overlay','kice-flat-style','flat-gray-regions'];
  const review={verdict:'pass',checks:ids.map(id=>({id,label:id,status:'pass',detail:'Mocked reviewer response for native integration test; not a real AI quality verdict'})),issues:[]};
  async function run(mode){
   const events=[],counts={analyze:0,joint:0,map:0,review:0,generate:0,cache:0},abort=new AbortController();let controller,preview,observation;
   const wire=observationFixtures[mode]; // Explicit fixture annotations, never inferred from the generated canvas.
   controller=createSourceLabelController({transport:{send:async payload=>{
    const number=events.length+1,turnId='joint-test-'+mode+'-'+number;events.push({model:payload.model,effort:payload.effort,purpose:payload.purpose,attachmentCount:payload.attachments.length});
    if(number===2&&mode==='cancel'){queueMicrotask(()=>abort.abort());return {turnId};}
    const response=number===1?wire:{placement:{version:1,groups:preview.proposals.groups.map(g=>mode==='fallback'?{id:g.id,status:'uncertain',reason:'Explicit test rejection of proposed position'}:{id:g.id,status:'matched',candidateId:g.candidates[0]?.candidateId,identities:g.labelIds.map(id=>mode==='figure'?{id,bindingKind:'figure',sourceRef:1}:{id,sourceObjectId:'object'}),reason:'Mocked direct confirmation'})},review};
    queueMicrotask(()=>{controller.handleEvent({kind:'assistant',turnId,text:JSON.stringify(response)});controller.handleEvent({kind:'done',turnId,status:'completed'});});return {turnId};
   },interrupt:()=>{}}});
   const observer={analyze:async o=>{counts.analyze++;return controller.analyze(o);},verifyPlacement:async o=>{counts.joint++;preview=o.preview;if(mode==='tamper'||mode==='rehashedtamper'){for(const l of preview.proposals.groups[0].candidates[0].labels){l.position.x+=.006;l.anchor.x+=.006;l.bounds.x+=.006;}if(mode==='rehashedtamper')preview.proposalsSha256=await imageLabelDigest(JSON.stringify(preview.proposals));}if(mode==='rawtamper'){cx.fillStyle='#f00';cx.fillRect(0,0,1,1);o={...o,candidate:{...o.candidate,data:c.toDataURL()}};}if(mode==='associationtamper'){o={...o,plan:structuredClone(o.plan)};o.plan.sourceAssociations[0].objectId='invented';}return controller.verifyPlacement(o);},mapTargets:()=>{counts.map++;throw Error('Unexpected separate mapping');},reviewFinal:()=>{counts.review++;throw Error('Unexpected separate review');},review:()=>{counts.review++;throw Error('Unexpected separate review');},cancel:()=>controller.cancel()};
   let output,error;
   try{output=await executeImageLabelRun({source:{name:'native-fixture.png',data:raw},workflow:{imageKind:'general',labelResult:'restore-editable'},selection:{model:'gpt-6.1-sol',effort:'medium',models:[{model:'gpt-6-luna',supportedReasoningEfforts:['medium'],serviceTiers:[]}]},artboard:{w:210,h:297},signal:abort.signal,onObservation:x=>{observation=x;},observer,raster:{generate:async()=>{counts.generate++;return {src:raw,imageToolCalls:1};}},cache:{get:async()=>({hit:false}),put:async()=>{counts.cache++;return {stored:true};}}});}catch(e){error={name:e.name,message:e.message};}
   return {output,error,events,counts,observation,previewCandidates:preview?.proposals.groups.map(g=>({id:g.id,count:g.candidates.length}))};
  }
  const matched=await run('matched'),fallback=await run('fallback'),cancelled=await run('cancel'),tampered=await run('tamper'),rawTampered=await run('rawtamper'),associationTampered=await run('associationtamper'),rehashedTampered=await run('rehashedtamper'),figure=await run('figure');
  applyLoaded(state,{version:'0.17',pages:[{id:'native-group',objects:[],groups:[],artboard:{w:210,h:297}}],activePageId:'native-group'});
  let native;
  if(matched.output?.labelPlan){const id=await insertImageFromSrc(state,raw,{aiTaskId:'joint-test',aiCandidateId:'native',editableLabelPlan:matched.output.labelPlan,preserveBytes:true});
   const inserted=structuredClone(state.get().objects.filter(o=>o.aiParentImageId===id)),groups=structuredClone(state.get().groups);undo(state);const undone=state.get().objects.length;redo(state);const redone=structuredClone(state.get().groups);const project=serialize(state.get());applyLoaded(state,JSON.parse(JSON.stringify(project)));native={inserted,groups,undone,redone,reopened:structuredClone(state.get().objects.filter(o=>o.aiParentImageId===id)),reopenedGroups:structuredClone(state.get().groups),project};}
  return {matched,fallback,cancelled,tampered,rawTampered,associationTampered,rehashedTampered,figure,native};
 },Object.fromEntries(['matched','fallback','cancel','tamper','rawtamper','associationtamper','rehashedtamper','figure'].map(mode=>[mode,syntheticJointObservation(mode)])));
 for(const mode of ['matched','fallback']){const output=result[mode].output;if(output?.finalLabelComposite)fs.writeFileSync(path.join(evidence,mode+'-final.png'),Buffer.from(output.finalLabelComposite.split(',')[1],'base64'));if(output?.labelVerificationPreview)fs.writeFileSync(path.join(evidence,mode+'-reviewed-preview.png'),Buffer.from(output.labelVerificationPreview.split(',')[1],'base64'));}
 if(result.native?.project)fs.writeFileSync(path.join(evidence,'joint-formula-group.5e'),JSON.stringify(result.native.project));
 fs.writeFileSync(path.join(evidence,'joint-browser-result.json'),JSON.stringify(result,null,2));
 assert.equal(result.matched.error,undefined);assert.equal(result.matched.output.accepted,true);assert.equal(result.matched.events.length,2);assert.deepEqual(result.matched.counts,{analyze:1,joint:1,map:0,review:0,generate:1,cache:1});assert.ok(result.matched.events.every(e=>e.model==='gpt-6-luna'&&e.effort==='medium'));assert.equal(result.matched.events[1].attachmentCount,3);
 assert.equal(result.fallback.output.accepted,false);assert.equal(result.fallback.counts.cache,0);assert.notEqual(result.fallback.output.finalLabelComposite,result.fallback.output.labelVerificationPreview);assert.ok(result.fallback.output.report.mechanicalDiagnostics.some(i=>i.code==='final-composite-changed-after-review'));
  assert.equal(result.figure.output.accepted,true);assert.equal(result.figure.events.length,2);assert.deepEqual(result.figure.output.labelPlan.labels.map(label=>label.text),['(가)']);assert.deepEqual(result.figure.output.sourceLabelPlan.removalOnlyItems.map(item=>item.text),['그림 1']);assert.ok(result.figure.output.targetPlacement.labels.every(l=>l.targetIdentity.bindingKind==='figure'&&l.targetIdentity.sourceRef===1&&l.targetIdentity.sourceObjectId===undefined));
 assert.equal(result.cancelled.error.name,'AbortError');assert.equal(result.cancelled.counts.cache,0);
 assert.equal(result.tampered.events.length,1,'mutated proposals must fail before verifier transport');assert.equal(result.tampered.output.accepted,false);assert.equal(result.tampered.counts.cache,0);for(const variant of ['rawTampered','associationTampered','rehashedTampered']){assert.equal(result[variant].events.length,1);assert.equal(result[variant].output.accepted,false);assert.equal(result[variant].counts.cache,0);}
 assert.equal(result.native.inserted.length,2);assert.ok(result.native.inserted.every(o=>o.type==='formula'));assert.equal(new Set(result.native.inserted.map(o=>o.groupId)).size,1);assert.equal(result.native.groups[0].memberIds.length,2);assert.equal(result.native.undone,0);assert.deepEqual(result.native.redone,result.native.reopenedGroups);assert.deepEqual(result.native.reopened,result.native.inserted);
 assert.deepEqual(result.matched.output.report.compositeMeasurements.finalPlacement.checkedLabelIds,['a','b']);
 }finally{await browser.close();}
});

test('invalid observation version forces fresh analysis while durable local restoration budget remains spent',{timeout:60000},async()=>{
 fs.mkdirSync(evidence,{recursive:true});const browser=await chromium.launch({headless:true});
 try{const page=await browser.newPage();await installLabelSourcePage(page);await page.goto(retainedUrl(),{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  const {executeImageLabelRun,imageLabelDigest}=await import('/js/ai-image-label-run.js?v=1.7.0-four-session-integration');
  const {parseSourceLabelAnalysis}=await import('/js/ai-source-label-plan.js?v=1.7.0-four-session-integration');
  const {freezeLabelPlan}=await import('/js/ai-editable-image-labels.js?v=1.7.0-four-session-integration');
  const c=document.createElement('canvas');c.width=c.height=20;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,20,20);x.fillStyle='#000';x.fillRect(9,9,2,2);const data=c.toDataURL(),hash=await imageLabelDigest(data);
  // Fresh baseline is valid under the strict current contract. Only the saved
  // checkpoint below loses observationVersion, so rejection has the intended cause.
  const label={id:'a',text:'A',scope:'general',sourceRef:1,leaderPresence:'absent',mode:'text',contentMode:'plain',position:{x:.5,y:.5},typography:{role:'text',bounds:{x:.4,y:.4,w:.2,h:.2}},
    disposition:'restore',semanticRole:'scientific-label',reason:'Synthetic budget fixture label',targetBinding:{status:'confirmed',bindingKind:'figure',sourceRef:1,reason:'Explicit synthetic figure label'}};
  const wire={version:4,observationVersion:1,leaderObservationVersion:1,observationContractRevision:'1.4.0',removalOnlyItems:[],labels:[label],
    geometryLock:{version:1,objects:[{id:'dot',sourceRef:1,role:'scientific-object',description:'Synthetic black square',bounds:{x:.45,y:.45,w:.1,h:.1},relations:[]}]},
    uncertainties:[],preservedMarks:[],protectedRegions:[],inkSearchRegions:[],removalRegions:[{id:'local',labelId:'a',sourceRef:1,ownership:'confirmed',component:'text',kind:'ellipse',bounds:{x:.4,y:.4,w:.2,h:.2},method:'local-restore'}]};
  const parsed=parseSourceLabelAnalysis(JSON.stringify(wire),1,[],{requireLeaderObservation:true,requireClassification:true});
  if(parsed.rejectedCount || parsed.labels.length!==1)throw Error('Synthetic current budget baseline must be accepted before invalidating its checkpoint');
  const plan=freezeLabelPlan({...parsed,frozen:true,sourceBindings:[{name:'source',transportSha256:hash}]});
  let observation,analyses=0,restores=0,chargedAtDispatch=false;
  const ids=['object-counts','inside-outside','liquid-occupancy','connections','composition-state','black-fill-meaning','presentation','request-scope','raster-label-removal'];
  const options={source:{name:'source',data},workflow:{imageKind:'exam',labelResult:'remove'},selection:{model:'gpt-6.1-sol',effort:'medium'},observer:{analyze:async()=>{analyses++;return structuredClone(plan);},review:async()=>({verdict:'pass',checks:ids.map(id=>({id,label:id,status:'pass',detail:'Mocked only to test budget state'})),issues:[]})},raster:{generate:()=>{throw Error('Exam cannot generate');}},onObservation:o=>{observation=o;},localRestore:async()=>{restores++;chargedAtDispatch=observation.localRestoreAttempted;throw Error('Fixture unavailable local restore');}};
  const first=await executeImageLabelRun(options),old=structuredClone(observation);delete old.plan.observationVersion;old.planSha256=await imageLabelDigest(JSON.stringify(old.plan));
  const second=await executeImageLabelRun({...options,observation:old,bypassCache:true});
  return {analyses,restores,chargedAtDispatch,first,second,finalObservation:observation};
 });
 fs.writeFileSync(path.join(evidence,'observation-budget-result.json'),JSON.stringify(result,null,2));
 assert.equal(result.analyses,2);assert.equal(result.restores,1);assert.equal(result.chargedAtDispatch,true);assert.equal(result.first.metrics.attempts.localRestore,1);assert.equal(result.second.metrics.attempts.localRestore,0);assert.equal(result.second.metrics.observationReused,false);assert.equal(result.finalObservation.localRestoreAttempted,true);assert.equal(result.first.metrics.calls.fullGeneration,0);assert.equal(result.second.metrics.calls.fullGeneration,0);assert.equal(result.second.accepted,false);
 }finally{await browser.close();}
});
