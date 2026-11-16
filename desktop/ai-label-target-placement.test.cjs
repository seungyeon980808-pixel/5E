const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const mod = import('../js/ai-label-target-placement.js');
const sourceMod = import('../js/ai-source-label-plan.js');
const data = 'data:image/png;base64,YQ==', candidateData = 'data:image/png;base64,Yg==';
const label = {id:'vessel-label',text:'혈관',scope:'general',sourceRef:1,mode:'leader',contentMode:'plain',position:{x:.8,y:.3},anchor:{x:.3,y:.4},typography:{role:'name',bounds:{x:.7,y:.25,w:.2,h:.1}}};
const observed = {version:4,reviewRequired:false,labels:[{...label,sourceKind:'reference'}],uncertainties:[],preservedMarks:[],geometryLock:{version:1,objects:[{id:'vessel',sourceRef:1,description:'원본 혈관',bounds:{x:.2,y:.2,w:.4,h:.4},relations:[]}]}};
async function plan() {const {labelBindingHash}=await mod;return {...observed,frozen:true,sourceBindings:[{name:'source',transportSha256:await labelBindingHash(data)}]};}
const mapped = ()=>({id:label.id,status:'matched',targetIdentity:{sourceObjectId:'vessel',description:'같은 혈관의 후보 분기'},anchor:{x:.55,y:.6},position:{x:.8,y:.65},bounds:{x:.7,y:.6,w:.2,h:.1}});
const selection={model:'test',effort:'low',models:[{model:'test',supportedReasoningEfforts:['low'],serviceTiers:[]}]};
const waitFor = (events, event) => once(events,event,{signal:AbortSignal.timeout(2000)});
test('moved target feeds native coordinates without mutating text or original plan',async()=>{
 const m=await mod,p=await plan(),before=JSON.stringify(p),rows=m.parseLabelTargetPlacement(JSON.stringify({version:1,labels:[mapped()]}),p);
 const placement=await m.bindLabelTargetPlacement({plan:p,candidateDataUrl:candidateData,labels:rows});
 const labels=await m.validateLabelTargetPlacement({plan:p,placement,candidateDataUrl:candidateData});
 assert.equal(labels[0].anchor.x,.55);assert.equal(labels[0].text,'혈관');assert.equal(JSON.stringify(p),before);
 const {createEditableImageLabelObjects}=await import('../js/ai-editable-image-labels.js');
 const object=createEditableImageLabelObjects({labels:p.labels,placement,candidateSha256:placement.candidateSha256,image:{id:'i',x:10,y:20,w:100,h:200},idFactory:()=> 'l'})[0];
 assert.deepEqual(object.p1,{x:65,y:140});assert.equal(object.aiTargetPlacementSha256,placement.candidateSha256);
 await assert.rejects(m.validateLabelTargetPlacement({plan:p,placement,candidateDataUrl:data}),/후보/);
 await assert.rejects(m.validateLabelTargetPlacement({plan:{...p,labels:[]},placement,candidateDataUrl:candidateData}),/계획/);
});
test('uncertain target retains source observation and is never marked cleared',async()=>{
 const m=await mod,p=await plan();const rows=m.parseLabelTargetPlacement(JSON.stringify({version:1,labels:[{id:label.id,status:'uncertain',reason:'혈관의 분기 식별 불가'}]}),p);
 const placement=await m.bindLabelTargetPlacement({plan:p,candidateDataUrl:candidateData,labels:rows});
 assert.equal(placement.status,'needs-attention');const labels=await m.validateLabelTargetPlacement({plan:p,placement,candidateDataUrl:candidateData});
 assert.equal(labels[0].targetReviewRequired,true);assert.deepEqual(labels[0].anchor,label.anchor);
});
test('mapping rejects invented text, unknown identities, missing ids and outside coordinates',async()=>{
 const m=await mod,p=await plan();
 for(const row of [{...mapped(),text:'다른 글자'},{...mapped(),id:'new'},{...mapped(),anchor:{x:2,y:0}},{...mapped(),targetIdentity:{sourceObjectId:'new',description:'guess'}}]) assert.throws(()=>m.parseLabelTargetPlacement(JSON.stringify({version:1,labels:[row]}),p));
 assert.throws(()=>m.parseLabelTargetPlacement(JSON.stringify({version:1,labels:[]}),p));
});
test('exam mapping has zero observer calls and rejects changed original coordinates',async()=>{
 const {createSourceLabelController}=await sourceMod,m=await mod,p=await plan();let calls=0;const c=createSourceLabelController({transport:{send:async()=>{calls++;}}});
 const placement=await c.mapTargets({plan:p,attachments:[{data}],candidate:{data:candidateData},workflow:{imageKind:'exam'}});
 assert.equal(calls,0);await m.validateLabelTargetPlacement({plan:p,placement,candidateDataUrl:candidateData});
 const tampered=JSON.parse(JSON.stringify(placement));tampered.labels[0].anchor.x=.9;
 await assert.rejects(m.validateLabelTargetPlacement({plan:p,placement:tampered,candidateDataUrl:candidateData}),/원본/);
});
test('general mapping uses one tool-free turn and source mismatch fails before send',async()=>{
 const {createSourceLabelController}=await sourceMod,p=await plan();const sent=[],events=new EventEmitter();const c=createSourceLabelController({transport:{send:async x=>{sent.push(x);events.emit('send');return {turnId:'mapping'};}}});
 await assert.rejects(c.mapTargets({plan:p,attachments:[{data:candidateData}],candidate:{data:candidateData}}),/원본/);
 const ready=waitFor(events,'send');const pending=c.mapTargets({...selection,plan:p,attachments:[{data}],candidate:{data:candidateData},workflow:{imageKind:'general'}});await ready;
 assert.equal(sent.length,1);assert.equal(sent[0].purpose,'scene');c.handleEvent({kind:'assistant',turnId:'mapping',text:JSON.stringify({version:1,labels:[mapped()]})});c.handleEvent({kind:'done',turnId:'mapping',status:'completed'});
 assert.equal((await pending).labels[0].anchor.x,.55);
});
test('cancel while preparing target bindings sends no turn',async()=>{
 const {createSourceLabelController}=await sourceMod,p=await plan();let calls=0;const c=createSourceLabelController({transport:{send:async()=>{calls++;}}});
 const pending=c.mapTargets({plan:p,attachments:[{data}],candidate:{data:candidateData},workflow:{imageKind:'exam'}});c.cancel();await assert.rejects(pending,{code:'AI_TURN_CANCELLED'});assert.equal(calls,0);
});
test('confirmed removal shapes keep ownership and reject guessed/outside regions',async()=>{
 const {parseSourceLabelAnalysis,withFrozenSourceLabelPlan}=await sourceMod;
 const region={id:'letter',labelId:label.id,sourceRef:1,ownership:'confirmed',kind:'polygon',points:[{x:.7,y:.25},{x:.9,y:.25},{x:.9,y:.35}],component:'text',method:'flat-background'};
 const p=parseSourceLabelAnalysis(JSON.stringify({...observed,removalRegions:[region]}),1);assert.deepEqual(p.removalRegions,[region]);
 for(const r of [{...region,ownership:'guess'},{...region,labelId:'graph'},{...region,points:[{x:2,y:1}]}]) {
   const held=parseSourceLabelAnalysis(JSON.stringify({...observed,removalRegions:[r]}),1);
   assert.deepEqual(held.removalRegions,[]);
   assert.equal(held.labels.length,p.labels.length);
   assert.ok(held.quarantinedItems.some(item=>item.stage==='removalRegions' && item.deletionAuthority===false && item.reason));
 }
 const prompt=withFrozenSourceLabelPlan('국소 처리',{...p,frozen:true},{imageKind:'exam'});assert.doesNotMatch(prompt,/이미지 생성 도구를 정확히 한 번 호출/);assert.match(prompt,/전체 이미지 생성·스타일 변환 금지/);
});
test('remove review needs RAW removal but not restoration coverage or overlay',async()=>{
 const {parseImageReviewReport,buildImageReviewPrompt}=await import('../js/ai-image-review.js');
 const ids=['object-counts','inside-outside','liquid-occupancy','connections','composition-state','black-fill-meaning','presentation','request-scope','raster-label-removal'];
 const raw=JSON.stringify({verdict:'pass',issues:[],checks:ids.map(id=>({id,label:id,status:'pass',detail:'RAW 직접 확인'}))});
 assert.equal(parseImageReviewReport(raw,{requireLabelChecks:true,labelOutcome:'remove'}).ok,true);
 assert.equal(parseImageReviewReport(raw,{requireLabelChecks:true,labelOutcome:'remove'}).report.labelReview.verdict,'pass');
 assert.equal(parseImageReviewReport(raw,{requireLabelChecks:true}).ok,false);
 assert.doesNotMatch(buildImageReviewPrompt({labelPlan:await plan(),labelOutcome:'remove'}),/editable-label-coverage:/);
});
test('local restoration review requires both annotation removal and scientific preservation',async()=>{
 const {createSourceLabelController}=await sourceMod;let serial=0;const sent=[],events=new EventEmitter();const c=createSourceLabelController({transport:{send:async payload=>{sent.push(payload);events.emit('send');return {turnId:`local-${++serial}`};}}});
 for (const [i,result] of [{annotationRemoved:true,scientificStructurePreserved:true,verdict:'pass',reason:'끝점 제거와 실제 관 연결 유지'},{annotationRemoved:true,scientificStructurePreserved:false,verdict:'pass',reason:'관 연결 손상'}].entries()) {
  const ready=waitFor(events,'send');const pending=c.reviewLocalRestore({...selection,source:{data},candidate:{data:candidateData},mask:{data}});await ready;
  c.handleEvent({kind:'assistant',turnId:`local-${i+1}`,text:JSON.stringify(result)});c.handleEvent({kind:'done',turnId:`local-${i+1}`,status:'completed'});
  assert.equal((await pending).verified,i===0);
 }
 assert.equal(sent.length,2);assert.equal(sent[0].attachments.length,3);assert.equal(sent[0].purpose,'scene');
});
test('source plan records auxiliary and scientific-arrow ownership independently of current options',async()=>{
 const {parseSourceLabelAnalysis}=await sourceMod;
 const regions=['auxiliary','scientific-arrow'].map((owner,i)=>({id:`r${i}`,owner,sourceRef:1,ownership:'confirmed',kind:'path',points:[{x:.1,y:.1},{x:.2,y:.2}],width:.005,component:'leader',method:'flat-background'}));
 const p=parseSourceLabelAnalysis(JSON.stringify({...observed,removalRegions:regions}),1);assert.deepEqual(p.removalRegions,regions);
});
test('exam review preserves original style and does not demand general KICE recoloring',async()=>{
 const {buildImageReviewPrompt}=await import('../js/ai-image-review.js');
 const prompt=buildImageReviewPrompt({workflow:{imageKind:'exam'},labelOutcome:'remove',labelPlan:await plan()});
 assert.match(prompt,/기출 원본 보존 검수/);assert.match(prompt,/시각 검수만으로 동일성을 입증하지 않는다/);
 assert.doesNotMatch(prompt,/원본의 검은 물질·재료는 후보에서 흰 면/);assert.doesNotMatch(prompt,/배경은 불투명 순백색/);assert.doesNotMatch(prompt,/원본의 색 자체는 충실도 기준이 아니다/);
});
test('controller accepts responses following its exact conditional prompt example for text and each leader shape',async()=>{
 const {createSourceLabelController}=await sourceMod,m=await mod,p=await plan();
 const routes=[{kind:'straight',attachment:'label',start:{x:.8,y:.3},target:{x:.3,y:.4},controls:[],end:'circle',endRadius:.01}];
 p.labels=[{...label,id:'straight'}, {...label,id:'text',mode:'text',anchor:label.position}, {...label,id:'elbow',elbow:{x:.5,y:.3},extraAnchors:[{x:.4,y:.5}]}, {...label,id:'routes',leaderRoutes:routes}];
 let sent;const events=new EventEmitter();const c=createSourceLabelController({transport:{send:async payload=>{sent=payload;events.emit('send');return {turnId:'example'};}}});
 const ready=waitFor(events,'send');const pending=c.mapTargets({...selection,plan:p,attachments:[{data}],candidate:{data:candidateData},workflow:{imageKind:'general'}});await ready;
 const example=JSON.parse(/<placement-response-example>(.*?)<\/placement-response-example>/.exec(sent.text)[1]);
 assert.equal(Object.hasOwn(example.labels[0],'leaderRoutes'),false);assert.equal(Object.hasOwn(example.labels[0],'elbow'),false);
 assert.deepEqual(example.labels[1].anchor,example.labels[1].position);assert.deepEqual(example.labels[2].elbow,p.labels[2].elbow);assert.deepEqual(example.labels[3].leaderRoutes,routes);
 c.handleEvent({kind:'assistant',turnId:'example',text:JSON.stringify(example)});c.handleEvent({kind:'done',turnId:'example',status:'completed'});
 const placement=await pending;assert.equal(placement.status,'mapped');assert.equal((await m.validateLabelTargetPlacement({plan:p,placement,candidateDataUrl:candidateData})).length,4);
});
test('completed malformed mapping retains bound candidate and flags original coordinates without a generation retry',async()=>{
 const {createSourceLabelController}=await sourceMod,m=await mod,p=await plan();let sends=0;const events=new EventEmitter();
 const c=createSourceLabelController({transport:{send:async()=>{sends++;events.emit('send');return {turnId:'bad-map'};}}});
 const ready=waitFor(events,'send');const pending=c.mapTargets({...selection,plan:p,attachments:[{data}],candidate:{data:candidateData},workflow:{imageKind:'general'}});await ready;
 c.handleEvent({kind:'assistant',turnId:'bad-map',text:JSON.stringify({version:1,labels:[{...mapped(),leaderRoutes:[],anchor:{x:.95,y:.95}}]})});c.handleEvent({kind:'done',turnId:'bad-map',status:'completed'});
 const placement=await pending;assert.equal(sends,1);assert.equal(placement.status,'needs-attention');assert.equal(placement.candidateSha256,await m.labelBindingHash(candidateData));
 const labels=await m.validateLabelTargetPlacement({plan:p,placement,candidateDataUrl:candidateData});assert.deepEqual(labels[0].anchor,label.anchor);assert.equal(labels[0].targetReviewRequired,true);assert.match(labels[0].targetReviewReason,/검증하지 못함/);
 const {assessLabelCompositeMeasurements}=await import('../js/ai-label-composite.js');assert.equal(assessLabelCompositeMeasurements([],{...p,labels}).status,'needs-attention');
});
test('mapping tool invocation still fails closed instead of uncertainty fallback',async()=>{
 const {createSourceLabelController}=await sourceMod,p=await plan();let interrupted=0;const events=new EventEmitter();
 const c=createSourceLabelController({transport:{send:async()=>{events.emit('send');return {turnId:'illegal-map'};},interrupt:()=>{interrupted++;events.emit('interrupt');}}});
 const ready=waitFor(events,'send');const pending=c.mapTargets({...selection,plan:p,attachments:[{data}],candidate:{data:candidateData},workflow:{imageKind:'general'}});await ready;
 const stopped=waitFor(events,'interrupt');c.handleEvent({kind:'progress',turnId:'illegal-map'});await assert.rejects(pending,/이미지 생성/);await stopped;assert.equal(interrupted,1);
});
