const nodeTest=require('node:test');
const test=(name,fn)=>nodeTest(name,{timeout:5000},fn);
const assert=require('node:assert/strict');
const {EventEmitter,once}=require('node:events');
const api=import('../js/ai-image-label-run.js');
function observedTransport(transport){
 const events=new EventEmitter();
 return {next:name=>once(events,name,{signal:AbortSignal.timeout(4000)}),
  send(...args){const result=transport.send(...args);events.emit('send');return result;},
  interrupt(...args){const result=transport.interrupt?.(...args);events.emit('interrupt');return result;}};
}
const png='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10]).toString('base64');
const workflow={imageKind:'general',labelResult:'remove'};
const selection={model:'test-model',effort:'low'};

test('raster controller reports final quota explanation only when no image was returned',async()=>{
 const {createImageLabelRasterController}=await api;
 for(const hasImage of [false,true]){
  const transport=observedTransport({send:async()=>({turnId:'quota-test'})}),c=createImageLabelRasterController({transport});
  const sent=transport.next('send'),p=c.generate({});await sent;
  c.handleEvent({kind:'image',turnId:'quota-test',itemId:'one',src:hasImage?'data:image/png;base64,AA==':null});
  c.handleEvent({kind:'assistant',turnId:'quota-test',text:'계정 사용량 제한으로 PNG를 생성하지 못했습니다. private-provider-detail'});
  c.handleEvent({kind:'done',turnId:'quota-test',status:'completed'});
  if(hasImage) assert.equal((await p).src,'data:image/png;base64,AA==');
  else await assert.rejects(p,e=>/계정 사용량 제한/.test(e.message)&&!e.message.includes('private-provider-detail'));
 }
});
test('raster controller blocks exam full generation before transport and permits explicit local scope',async()=>{
 const {createImageLabelRasterController}=await api;let calls=0;const transport=observedTransport({send:async()=>{calls++;return {turnId:'local'};}}),c=createImageLabelRasterController({transport});
 await assert.rejects(c.generate({}, {imageKind:'exam'}),/기출 전체/);assert.equal(calls,0);
 const sent=transport.next('send'),pending=c.generate({}, {imageKind:'exam',local:true});await sent;c.handleEvent({kind:'image',turnId:'local',src:png,itemId:'one'});c.handleEvent({kind:'done',turnId:'local',status:'completed'});
 assert.equal((await pending).imageToolCalls,1);assert.equal(calls,1);
});
test('early events bind after RPC identity, duplicate item events count once and provider payload is isolated',async()=>{
 const {createImageLabelRasterController}=await api;let c,sent;
 c=createImageLabelRasterController({transport:{send:async payload=>{sent=payload;
  for(const e of [{kind:'image',turnId:'other',src:'wrong'},{kind:'progress',itemId:'tool'},{kind:'progress',itemId:'tool'},{kind:'image',itemId:'tool',src:png},{kind:'image',itemId:'tool',src:png},{kind:'done',status:'completed'}]) c.handleEvent({turnId:'early',...e});
  return {turnId:'early',renderThreadId:'thread'};
 }}});
 const r=await c.generate({models:['private-catalog'],conversationId:'old',text:'image'});assert.equal(r.src,png);assert.equal(r.imageToolCalls,1);assert.equal(sent.models,undefined);assert.equal(sent.conversationId,null);assert.equal(sent.purpose,'image');
 assert.equal(c.handleEvent({kind:'image',turnId:'early',src:'late'}),true);assert.equal(c.isActive(),false);
});
for(const kind of ['progress','image']) test(`second distinct ${kind} interrupts instead of accepting a replacement`,async()=>{
 const {createImageLabelRasterController}=await api;const interrupts=[],transport=observedTransport({send:async()=>({turnId:kind}),interrupt:binding=>{interrupts.push(binding);}}),c=createImageLabelRasterController({transport});
 const sent=transport.next('send'),stopped=transport.next('interrupt'),pending=c.generate({});await sent;c.handleEvent({kind,turnId:kind,itemId:'one',src:png});c.handleEvent({kind,turnId:kind,itemId:'two',src:png});
 await assert.rejects(pending,/추가 생성/);await stopped;assert.equal(interrupts.length,1);assert.equal(interrupts[0].turnId,kind);assert.equal(c.handleEvent({kind:'done',turnId:kind,status:'completed'}),true);
});
test('cancel before send or RPC binding consumes late events without committing results',async()=>{
 const {createImageLabelRasterController}=await api;let calls=0,bind;
 const transport=observedTransport({send:()=>{calls++;return new Promise(resolve=>{bind=resolve;});}}),c=createImageLabelRasterController({transport});
 const pre=c.generate({});c.cancel();await assert.rejects(pre,{name:'AbortError'});assert.equal(calls,0);
 const sent=transport.next('send'),pending=c.generate({});await sent;c.cancel();await assert.rejects(pending,{name:'AbortError'});const stopped=transport.next('interrupt');bind({turnId:'retired'});await stopped;
 assert.equal(c.handleEvent({kind:'image',turnId:'retired',src:png}),true);assert.equal(c.isActive(),false);
});
test('abort, missing output, missing turn identity, and timeout do not manufacture image success',async()=>{
 const {createImageLabelRasterController}=await api;
 const transport=observedTransport({send:async()=>({turnId:'empty'})}),c=createImageLabelRasterController({transport});const sent=transport.next('send'),pending=c.generate({});await sent;c.handleEvent({kind:'done',turnId:'empty',status:'completed'});await assert.rejects(pending,/완료/);
 await assert.rejects(createImageLabelRasterController({transport:{send:async()=>({})}}).generate({}),/식별자/);
 let interrupts=0;await assert.rejects(createImageLabelRasterController({timeoutMs:5,transport:{send:async()=>({turnId:'timeout'}),interrupt:()=>{interrupts++;}}}).generate({}),/시간 초과/);assert.equal(interrupts,1);
 const signal=new AbortController();const stopped=c.generate({}, {signal:signal.signal});signal.abort();await assert.rejects(stopped,{name:'AbortError'});
});
async function setup(){
 const {imageLabelDigest}=await api;const {SOURCE_LABEL_POLICY_VERSION}=await import('../js/ai-editable-image-labels.js');const {SOURCE_OBSERVATION_CONTRACT_REVISION,SOURCE_LEADER_OBSERVATION_VERSION}=await import('../js/ai-source-observation-wire.js');const plan={version:4,observationVersion:1,leaderObservationVersion:SOURCE_LEADER_OBSERVATION_VERSION,sourceLeaderObservations:[],observationContractRevision:SOURCE_OBSERVATION_CONTRACT_REVISION,policyVersion:SOURCE_LABEL_POLICY_VERSION,frozen:true,labels:[],uncertainties:[],excludedLabels:[],removalRegions:[],sourceBindings:[{transportSha256:await imageLabelDigest(png)}]};
 const counts={analyze:0,generate:0,review:0};let observation;
 const options={source:{name:'input',data:png},workflow,selection,onObservation:x=>{observation=x;},observer:{analyze:async()=>{counts.analyze++;return structuredClone(plan);},review:async()=>{counts.review++;return {verdict:'pass',checks:['object-counts','inside-outside','liquid-occupancy','connections','composition-state','black-fill-meaning','presentation','request-scope','raster-label-removal','kice-flat-style','flat-gray-regions'].map(id=>({id,label:id,status:'pass',detail:'Explicit verified flat-style fixture'})),issues:[]};}},raster:{generate:async()=>{counts.generate++;return {src:png,imageToolCalls:1,rendererPrompt:'render'};}}};
 return {plan,counts,options,get observation(){return observation;}};
}
// 11-09 사용자 원칙(실패 금지): 라벨 읽기가 계속 실패하면 자동으로 다시 보내고(마지막은 Luna), 시도마다 기록한 뒤
// 실패 대신 원본 그림을 결과로 돌려준다. 그림 생성은 보내지 않는다.
test('source analysis failure is retried with a Luna last attempt, recorded, and returns the original as a fallback result without generation',async()=>{
 const {executeImageLabelRun}=await api,f=await setup();
 const models=[],failures=[];
 f.options.observer.analyze=async options=>{models.push(options.model);throw Object.assign(Error('analysis timeout'),{aiRequest:{turnId:'label-turn',model:'gpt-6-luna',effort:'medium'}});};
 const result=await executeImageLabelRun({...f.options,retryPolicy:{attempts:3,backoffMs:[0,0],analysisTimeoutMs:[0,0,0],generationTimeoutMs:[0,0,0]},onAiFailure:record=>failures.push(record)});
 assert.equal(result.status,'fallback');assert.equal(result.accepted,false);assert.equal(result.data,f.options.source.data);
 assert.equal(result.metrics.fallback.phase,'sourceAnalysis');assert.equal(result.metrics.fallback.image,'source');
 assert.equal(result.metrics.calls.sourceAnalysis,3);assert.equal(result.metrics.calls.fullGeneration,0);
 assert.ok(Number.isFinite(result.metrics.timings.sourceAnalysis));
 assert.deepEqual(failures.map(r=>[r.stage,r.attempt,r.attempts]),[['sourceAnalysis',1,3],['sourceAnalysis',2,3],['sourceAnalysis',3,3]]);
 assert.ok(failures.every(r=>r.message.includes('analysis timeout')));
 assert.equal(models.at(-1),'gpt-6-luna');
 assert.equal(f.counts.generate,0);
});
test('review timeout retains the generated RAW as needs-attention without generating a replacement',async()=>{
 const {executeImageLabelRun}=await api,f=await setup();
 f.options.observer.review=async()=>{throw Error('review timeout');};
 const result=await executeImageLabelRun(f.options);
 assert.equal(result.data,png);assert.equal(result.accepted,false);assert.equal(result.status,'needs-attention');
 assert.equal(f.counts.generate,1);assert.equal(result.metrics.calls.fullGeneration,1);
 assert.ok(result.report.issues.some(i=>i.message.includes('review timeout')));
});
test('the generated RAW callback runs before verification and cannot silently mark it accepted',async()=>{
 const {executeImageLabelRun}=await api,f=await setup(),sequence=[];
 f.options.onRaster=async raw=>{sequence.push('raw');assert.equal(raw.data,png);assert.equal(raw.accepted,undefined);assert.equal(raw.metrics.calls.review,0);};
 const review=f.options.observer.review;f.options.observer.review=async options=>{sequence.push('review');return review(options);};
 await executeImageLabelRun(f.options);assert.deepEqual(sequence,['raw','review']);assert.equal(f.counts.generate,1);
});
test('runtime reuses immutable observation on retry while generating and reviewing once per general remove run',async()=>{
 const {executeImageLabelRun}=await api,f=await setup();const first=await executeImageLabelRun(f.options);
 const second=await executeImageLabelRun({...f.options,observation:f.observation,bypassCache:true});
 assert.deepEqual(f.counts,{analyze:1,generate:2,review:2});assert.equal(first.metrics.calls.fullGeneration,1);assert.equal(second.metrics.observationReused,true);assert.equal(second.metrics.calls.sourceAnalysis,0);assert.equal(second.labelPlan,null);assert.equal(second.metrics.calls.targetMapping,0);
 const invalid=structuredClone(f.observation);invalid.plan.labels.push({id:'tampered'});await executeImageLabelRun({...f.options,observation:invalid});assert.equal(f.counts.analyze,2);
});
test('valid legacy ownership observation is reanalyzed and cannot reuse its cached output',async()=>{
 const {executeImageLabelRun,imageLabelDigest}=await api,f=await setup();
 const {createExactOutputCacheKey}=await import('../js/ai-remote-input-plan.js');
 const entries=new Map(),queried=[];let saved;
 const cache={get:async key=>{queried.push(key);return entries.has(key)?{hit:true,entry:entries.get(key)}:{hit:false};},delete:async key=>entries.delete(key),put:async value=>{saved=value;entries.set(value.key,{output:value.output});return {stored:true};}};
 await executeImageLabelRun({...f.options,cache});
 const legacy=structuredClone(f.observation);legacy.plan.policyVersion=3;
 legacy.planSha256=await imageLabelDigest(JSON.stringify(legacy.plan));
 const legacyDescriptor=structuredClone(saved.descriptor);delete legacyDescriptor.outputOptions.sourceLabelPolicyVersion;
 legacyDescriptor.outputOptions.planSha256=legacy.planSha256;
 const legacyKey=createExactOutputCacheKey(legacyDescriptor),legacyOutput=structuredClone(saved.output);
 legacyOutput.imageLabelRun.planSha256=legacy.planSha256;
 const before=JSON.stringify(legacy),outputBefore=JSON.stringify(legacyOutput);
 entries.clear();entries.set(legacyKey,{output:legacyOutput});queried.length=0;
 const result=await executeImageLabelRun({...f.options,cache,observation:legacy});
 assert.equal(result.metrics.observationReused,false);assert.equal(result.metrics.calls.sourceAnalysis,1);assert.equal(result.metrics.cacheHit,false);
 assert.deepEqual(f.counts,{analyze:2,generate:2,review:2});
 assert.equal(f.observation.plan.policyVersion,4);assert.notEqual(result.planSha256,legacy.planSha256);
 assert.equal(saved.descriptor.outputOptions.sourceLabelPolicyVersion,4);assert.notEqual(saved.key,legacyKey);assert.ok(!queried.includes(legacyKey));
 assert.equal(JSON.stringify(legacy),before);assert.equal(JSON.stringify(legacyOutput),outputBefore);
});
test('new source contract reanalyzes old observations while retaining the same-source restore reservation',async()=>{
 const {executeImageLabelRun,imageLabelDigest}=await api,f=await setup();
 await executeImageLabelRun(f.options);
 const old=structuredClone(f.observation);old.contractRevision='1.0.0';old.plan.observationContractRevision='1.0.0';old.planSha256=await imageLabelDigest(JSON.stringify(old.plan));old.localRestoreAttempted=true;
 const before=JSON.stringify(old),result=await executeImageLabelRun({...f.options,observation:old,bypassCache:true});
 assert.equal(result.metrics.observationReused,false);assert.equal(f.counts.analyze,2);assert.equal(f.observation.localRestoreAttempted,true);assert.equal(JSON.stringify(old),before);
});
test('a markerless saved observation cannot bypass current leader observation even with a current revision',async()=>{
 const {executeImageLabelRun,imageLabelDigest}=await api,f=await setup();
 await executeImageLabelRun(f.options);
 const old=structuredClone(f.observation);delete old.plan.leaderObservationVersion;delete old.plan.sourceLeaderObservations;
 old.planSha256=await imageLabelDigest(JSON.stringify(old.plan));old.localRestoreAttempted=true;
 const before=JSON.stringify(old),result=await executeImageLabelRun({...f.options,observation:old,bypassCache:true});
 assert.equal(result.metrics.observationReused,false);assert.equal(f.counts.analyze,2);
 assert.equal(f.observation.localRestoreAttempted,true);assert.equal(JSON.stringify(old),before);
});
test('cache descriptor binds workflow, source, plan, model and candidate; changed candidate hash causes new work',async()=>{
 const {executeImageLabelRun,imageLabelDigest}=await api,f=await setup();const entries=new Map();let put;
 const cache={get:async key=>entries.has(key)?{hit:true,entry:entries.get(key)}:{hit:false},delete:async key=>entries.delete(key),put:async value=>{put=value;entries.set(value.key,{output:value.output});return {stored:true};}};
 const first=await executeImageLabelRun({...f.options,cache});assert.equal(put.descriptor.outputOptions.sourceSha256,await imageLabelDigest(png));assert.equal(put.descriptor.outputOptions.planSha256,first.planSha256);assert.equal(put.descriptor.generation.model,'test-model');assert.equal(put.output.bytes,new TextEncoder().encode(JSON.stringify({imageLabelRun:put.output.imageLabelRun})).byteLength);
 const hit=await executeImageLabelRun({...f.options,cache,observation:f.observation});assert.equal(hit.metrics.cacheHit,true);assert.deepEqual(f.counts,{analyze:1,generate:1,review:1});
 entries.get(put.key).output.imageLabelRun.candidateSha256='0'.repeat(64);
 const miss=await executeImageLabelRun({...f.options,cache,observation:f.observation});assert.equal(miss.metrics.cacheHit,false);assert.equal(f.counts.generate,2);
 const saved=entries.get(put.key).output.imageLabelRun;saved.targetPlacement={version:1,imageKind:'general',candidateSha256:saved.candidateSha256,planSha256:saved.planSha256,sourceLabelsJson:'[]',labels:[{id:'invented',status:'matched'}]};
 const repaired=await executeImageLabelRun({...f.options,cache,observation:f.observation});assert.equal(repaired.metrics.cacheHit,false);assert.equal(f.counts.generate,3);assert.equal(repaired.targetPlacement,null);
 await executeImageLabelRun({...f.options,cache,observation:f.observation,selection:{...selection,model:'other'}});assert.equal(f.counts.generate,4);
});
test('abort during observation persistence prevents generation and cache writes',async()=>{
 const {executeImageLabelRun}=await api,f=await setup(),controller=new AbortController();let writes=0;
 await assert.rejects(executeImageLabelRun({...f.options,signal:controller.signal,onObservation:()=>controller.abort(),cache:{put:()=>{writes++;}}}),{name:'AbortError'});
 assert.equal(f.counts.generate,0);assert.equal(writes,0);
});
test('failed exam local restoration reserves durable attempt and retry never calls it twice',async()=>{
 const {executeImageLabelRun}=await api,f=await setup();
 const originals={Image:globalThis.Image,ImageData:globalThis.ImageData,document:globalThis.document};
 const pixels=new Uint8ClampedArray(20*20*4).fill(255);pixels.set([0,0,0,255],(10*20+10)*4);
 globalThis.Image=class{naturalWidth=20;naturalHeight=20;set src(v){queueMicrotask(()=>this.onload());}};
 globalThis.ImageData=class{constructor(data,width,height){Object.assign(this,{data,width,height});}};
 globalThis.document={createElement:tag=>{assert.equal(tag,'canvas');return {getContext:()=>({drawImage(){},getImageData:()=>({data:new Uint8ClampedArray(pixels)}),putImageData(){}})};}};
 f.plan.labels=[{id:'a',sourceRef:1,scope:'general',mode:'text'}];f.plan.removalRegions=[{id:'local',labelId:'a',sourceRef:1,ownership:'confirmed',component:'text',kind:'ellipse',bounds:{x:.4,y:.4,w:.2,h:.2},method:'local-restore'}];
 let restores=0;const localRestore=async()=>{restores++;assert.equal(f.observation.localRestoreAttempted,true);throw Error('unavailable local service');};
 try{
  const first=await executeImageLabelRun({...f.options,workflow:{imageKind:'exam',labelResult:'remove'},localRestore});
  assert.equal(first.metrics.calls.fullGeneration,0);assert.equal(first.metrics.attempts.localRestore,1);assert.equal(first.metrics.calls.localRestore,0);assert.equal(first.report.verdict,'uncertain');assert.equal(first.data,png);
  const retry=await executeImageLabelRun({...f.options,workflow:{imageKind:'exam',labelResult:'remove'},localRestore,observation:f.observation,bypassCache:true});
  assert.equal(restores,1);assert.equal(retry.metrics.calls.localRestore,0);assert.equal(retry.metrics.attempts.localRestore,0);assert.equal(retry.report.verdict,'uncertain');assert.equal(f.counts.analyze,2);assert.equal(retry.metrics.observationReused,false);assert.equal(f.counts.generate,0);
 }finally{for(const [key,value] of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
test('raster cancellation awaiting RPC interrupts only its eventual binding while a new turn continues',async()=>{
 const {createImageLabelRasterController}=await api;const interruptions=[];let bindFirst,calls=0;
 const transport=observedTransport({send:()=>++calls===1?new Promise(r=>{bindFirst=r;}):Promise.resolve({turnId:'new-raster',renderThreadId:'new-raster-thread'}),interrupt:binding=>interruptions.push(binding)}),c=createImageLabelRasterController({transport});
 const sent=transport.next('send'),first=c.generate({});await sent;c.cancel();await assert.rejects(first,{name:'AbortError'});assert.equal(interruptions.length,0);
 const sentAgain=transport.next('send'),second=c.generate({});await sentAgain;const stopped=transport.next('interrupt');bindFirst({turnId:'old-raster',renderThreadId:'old-raster-thread'});await stopped;
 assert.equal(interruptions.length,1);assert.equal(interruptions[0].turnId,'old-raster');assert.equal(interruptions[0].threadId,'old-raster-thread');
 c.handleEvent({kind:'image',turnId:'new-raster',src:png,itemId:'only'});c.handleEvent({kind:'done',turnId:'new-raster',status:'completed'});assert.equal((await second).src,png);assert.equal(interruptions.length,1);
});
test('bound raster AbortSignal interrupts that identity exactly once',async()=>{
 const {createImageLabelRasterController}=await api;const interruptions=[];const signal=new AbortController();
 const transport=observedTransport({send:async()=>({turnId:'abort-raster',renderThreadId:'abort-thread'}),interrupt:binding=>interruptions.push(binding)}),c=createImageLabelRasterController({transport});
 const sent=transport.next('send'),stopped=transport.next('interrupt'),pending=c.generate({}, {signal:signal.signal});await sent;signal.abort();c.cancel();await assert.rejects(pending,{name:'AbortError'});await stopped;
 assert.equal(interruptions.length,1);assert.equal(interruptions[0].turnId,'abort-raster');assert.equal(interruptions[0].threadId,'abort-thread');
});
test('run AbortSignal cancels active observer and detaches after completion',async()=>{
 const {executeImageLabelRun}=await api,f=await setup(),controller=new AbortController();let rejectAnalysis,observerCancels=0,rasterCancels=0;
 const entered=Promise.withResolvers();
 const observer={analyze:()=>new Promise((resolve,reject)=>{rejectAnalysis=reject;entered.resolve();}),cancel:()=>{observerCancels++;rejectAnalysis(Error('observer cancelled'));}};
 const pending=executeImageLabelRun({...f.options,signal:controller.signal,observer,raster:{cancel:()=>{rasterCancels++;}}});await entered.promise;controller.abort();await assert.rejects(pending,{name:'AbortError'});
 assert.equal(observerCancels,1);assert.equal(rasterCancels,1);assert.equal(f.counts.generate,0);
 const completed=new AbortController();let postCancels=0;await executeImageLabelRun({...f.options,signal:completed.signal,observer:{...f.options.observer,cancel:()=>{postCancels++;}},raster:{...f.options.raster,cancel:()=>{postCancels++;}}});completed.abort();assert.equal(postCancels,0);
});
test('mapping transport failure retains RAW candidate with uncertain placement and no second generation',async()=>{
 const {executeImageLabelRun,imageLabelDigest}=await api,f=await setup();delete f.plan.observationVersion;f.plan.labels=[{id:'a',sourceRef:1,scope:'general',mode:'text',text:'원문',position:{x:.5,y:.5},anchor:{x:.5,y:.5},typography:{role:'name',bounds:{x:.4,y:.45,w:.2,h:.1}}}];
 const result=await executeImageLabelRun({...f.options,workflow:{imageKind:'general',labelResult:'restore-editable'},observer:{...f.options.observer,mapTargets:async()=>{throw Error('mapping offline');},reviewFinal:async()=>({verdict:'pass',checks:[],issues:[]})}});
 assert.equal(result.data,png);assert.equal(result.candidateSha256,await imageLabelDigest(png));assert.equal(result.targetPlacement.status,'needs-attention');assert.equal(result.targetPlacement.labels[0].status,'uncertain');assert.equal(result.report.verdict,'uncertain');assert.equal(result.labelPlan.reviewRequired,true);assert.equal(f.counts.generate,1);assert.ok(result.report.issues.some(i=>i.code==='target-mapping-unavailable'));
});
test('aborted mapping does not become retained candidate success',async()=>{
 const {executeImageLabelRun}=await api,f=await setup(),signal=new AbortController();delete f.plan.observationVersion;let writes=0;
 await assert.rejects(executeImageLabelRun({...f.options,signal:signal.signal,workflow:{imageKind:'general',labelResult:'restore-editable'},observer:{...f.options.observer,mapTargets:async()=>{signal.abort();throw Error('cancel mapping');}},cache:{get:async()=>({hit:false}),put:async()=>{writes++;}}}),{name:'AbortError'});assert.equal(writes,0);
});
test('local restore serializes Uint8ClampedArray pixels and reaches scoped raster send',async()=>{
 const {createExamLocalRestore}=await api;const {decodeScopedPng}=await import('../js/ai-scoped-edit-png.js');let calls=0;const pixels=new Uint8ClampedArray([0,0,0,255,255,255,255,255,100,120,140,255,255,255,255,255]);
 const run=createExamLocalRestore({observer:{},raster:{generate:async(payload,options)=>{calls++;assert.equal(options.imageKind,'exam');assert.equal(options.local,true);assert.equal(payload.attachments.length,2);const decoded=await decodeScopedPng(new Uint8Array(Buffer.from(payload.attachments[0].data.split(',')[1],'base64')));assert.deepEqual([...decoded.data],[...pixels]);throw Error('scoped send reached');}}});
 await assert.rejects(run({data:pixels,width:2,height:2,mask:new Uint8Array([1,0,0,0])},{metrics:{calls:{}},selection}),/scoped send reached/);assert.equal(calls,1);
});

// 11-09: 원본 글자 비율은 짝수 개면 가운데 두 값 중 작은 쪽 — 크게 잘못 재진 라벨 하나가 그림의 모든 라벨을 키우지 않게(교과서 tb04).
test('measured label size ratio takes the lower middle value so one inflated label cannot enlarge every label',async()=>{
 const {measuredLabelSizeRatio}=await api;
 const label=(id,h)=>({id,text:'A',typography:{bounds:{x:.1,y:.1,w:.1,h}}});
 // node에서는 그림 픽셀을 못 읽어 AI 상자 높이로 잰다(대문자·숫자는 ÷ .72).
 const two=await measuredLabelSizeRatio('data:,',[label('a',.036),label('b',.072)]);
 assert.ok(Math.abs(two-.036/.72)<1e-9,String(two));
 const three=await measuredLabelSizeRatio('data:,',[label('a',.036),label('b',.072),label('c',.05)]);
 assert.ok(Math.abs(three-.05/.72)<1e-9,String(three));
 assert.equal(await measuredLabelSizeRatio('data:,',[]),null);
});

// 11-09 사용자 결정: 그래프는 라벨 복원을 하지 않는다. 새로 그리는 변환에서 그래프가 든 그림은 그래프 복원으로 넘기고,
// 그래도 같은 작업에서 다시 변환하면(keep) 라벨 복원·새로 그리기 없이 원본 그대로 둔다. 예전 'restore'(그래프 글자를 라벨로 살림) 길은 없다.
test('graph figures route to graph restore, are never label-restored, and stay the original when the user insists',async()=>{
 const {executeImageLabelRun}=await api;
 const graphPlan=f=>{delete f.plan.observationVersion;f.plan.labels=[];f.plan.excludedLabels=[{id:'g1',sourceRef:1,scope:'graph',owner:'graph',mode:'text',text:'t₀',position:{x:.5,y:.9},anchor:{x:.5,y:.9},typography:{role:'quantity',bounds:{x:.45,y:.85,w:.1,h:.05}}}];};
 const restoreWorkflow={imageKind:'general',labelResult:'restore-editable'};
 for(const graphLabels of [undefined,'route','restore']){
  const f=await setup();graphPlan(f);
  await assert.rejects(executeImageLabelRun({...f.options,workflow:restoreWorkflow,...(graphLabels?{graphLabels}:{})}),e=>e.code==='AI_GRAPH_FIGURE'&&e.graphLabelCount===1);
  assert.equal(f.counts.generate,0);
 }
 const f=await setup();graphPlan(f);
 const kept=await executeImageLabelRun({...f.options,workflow:restoreWorkflow,graphLabels:'keep'});
 assert.equal(kept.status,'graph-kept');assert.equal(kept.data,f.options.source.data);assert.equal(kept.labelPlan,null);
 assert.equal(kept.removalReport.changedPixels,0);assert.equal(kept.removalReport.unchanged,true);assert.equal(f.counts.generate,0);
 assert.match(kept.keptMessage,/원본/);
});

// 11-09 라벨 안정화(규칙 5): 라벨 크기는 라벨마다 원본 글자 높이를 따르고, 원본에서 같은 크기(10% 안)였던 라벨끼리는 같은 크기,
// 크게 잘못 재진 것(가운데 값의 1.8배 넘음)은 가운데 값으로.
test('measured label sizes follow each source label; same-size labels share a size and a mis-measured one falls back to the median',async()=>{
 const {measuredLabelSizes}=await api;
 const label=(id,h,text='A')=>({id,text,typography:{bounds:{x:.1,y:.1,w:.1,h}}});
 const {ratio,sizes}=await measuredLabelSizes('data:,',[label('a',.036),label('b',.038),label('c',.045),label('d',.30)]);
 // node에서는 픽셀·글꼴을 못 재어 AI 상자 높이와 기본 글자 높이 비(대문자 .72)로 잰다.
 assert.ok(Math.abs(sizes.get('a')-sizes.get('b'))<1e-12,'10% 안은 같은 크기');
 assert.ok(Math.abs(sizes.get('c')-.045/.72)<1e-9,String(sizes.get('c')));
 assert.ok(Math.abs(sizes.get('d')-ratio)<1e-12,'1.8배 넘게 재진 것은 가운데 값');
 assert.ok(sizes.get('c')>sizes.get('a')*1.15,'원본에서 큰 글자는 라벨도 큼');
 assert.deepEqual(await measuredLabelSizes('data:,',[]),{ratio:null,sizes:new Map()});
});

// 11-09 라벨 안정화: 기출에서 실제 글자 잉크로 다시 찾아 지운 글자 라벨은 그 글자 자리에 복원한다(지시선 라벨·다시 찾지 않은 라벨은 AI 자리 그대로).
test('labels erased from measured glyph ink are restored at that glyph box; leader and unmeasured labels keep the observed position',async()=>{
 const {labelsAtMeasuredGlyphs}=await api;
 const labels=[{id:'a',mode:'text',text:'A',position:{x:.5,y:.5},anchor:{x:.5,y:.5},typography:{role:'name',bounds:{x:.45,y:.45,w:.1,h:.1}}},
  {id:'b',mode:'leader',text:'B',position:{x:.2,y:.2},anchor:{x:.3,y:.3},typography:{bounds:{x:.15,y:.15,w:.1,h:.1}}},
  {id:'c',mode:'text',text:'C',position:{x:.8,y:.8},anchor:{x:.8,y:.8}}];
 const out=labelsAtMeasuredGlyphs(labels,[{labelId:'a',glyphBounds:{x:.4,y:.42,w:.06,h:.08}},{labelId:'b',glyphBounds:{x:.1,y:.1,w:.05,h:.05}}]);
 const near=(p,q)=>Math.abs(p.x-q.x)<1e-12&&Math.abs(p.y-q.y)<1e-12;
 assert.ok(near(out[0].position,{x:.43,y:.46}),JSON.stringify(out[0].position));assert.deepEqual(out[0].anchor,out[0].position);
 assert.deepEqual(out[0].typography,{role:'name',bounds:{x:.4,y:.42,w:.06,h:.08}});
 assert.deepEqual(out[1],labels[1]);assert.deepEqual(out[2],labels[2]);
 assert.deepEqual(labelsAtMeasuredGlyphs(labels,undefined),labels);
});

// 11-09 라벨 안정화(동그라미 글자): 고리까지 함께 지운 한 글자 라벨은 AI가 읽은 보통 글자(ㄷ)가 아니라 동그라미 글자(㉢)로 복원한다.
test('a circled character restored from its ring takes the circled text and the plain text role; other labels keep their text',async()=>{
 const {labelsAtMeasuredGlyphs}=await api;
 const labels=[{id:'c',mode:'text',text:'ㄷ',position:{x:.5,y:.5},anchor:{x:.5,y:.5},typography:{role:'symbol',bounds:{x:.45,y:.45,w:.1,h:.1}}},
  {id:'a',mode:'text',text:'A',position:{x:.2,y:.2},anchor:{x:.2,y:.2},typography:{role:'name',bounds:{x:.15,y:.15,w:.1,h:.1}}}];
 const out=labelsAtMeasuredGlyphs(labels,[{labelId:'c',glyphBounds:{x:.4,y:.4,w:.2,h:.2},text:'㉢'},{labelId:'a',glyphBounds:{x:.1,y:.1,w:.1,h:.1}}]);
 assert.equal(out[0].text,'㉢');assert.equal(out[0].typography.role,'text');assert.deepEqual(out[0].typography.bounds,{x:.4,y:.4,w:.2,h:.2});
 assert.equal(out[1].text,'A');assert.equal(out[1].typography.role,'name');
});
