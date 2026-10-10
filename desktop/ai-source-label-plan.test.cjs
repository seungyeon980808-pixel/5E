const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const modulePromise = import('../js/ai-source-label-plan.js');
const labelsPromise = import('../js/ai-editable-image-labels.js');
const selection = { model: 'test', effort: 'low', models: [{ model: 'test', supportedReasoningEfforts: ['low'], serviceTiers: [] }] };
const attachments = [{ name: 'source', data: 'data:image/png;base64,YQ==' }];
const label = overrides => ({ id: 's1-a', text: '• 전자', sourceKind: 'reference', sourceRef: 1, scope: 'general', mode: 'leader',
  anchor: { x: .4, y: .3 }, position: { x: .8, y: .6 }, elbow: { x: .6, y: .5 }, extraAnchors: [{ x: .2, y: .2 }],
  leaderArrowHead: 'target', leaderDash: 'dotted', typography: { role: 'text', bounds: { x: .7, y: .55, w: .2, h: .1 } }, ...overrides });
const raw = (labels = [label()], rest = {}) => JSON.stringify({ version: 3, reviewRequired: false, labels, uncertainties: [], preservedMarks: [], ...rest });
const geometryLock = {version:1,objects:[{id:'drawing',sourceRef:1,description:'원본의 원형 입자 하나',bounds:{x:.1,y:.1,w:.4,h:.4},relations:[]}]};
const observed = (rest = {}) => {
  const l=label();l.leaderPresence='present';l.leaderRoutes=[{kind:'polyline',attachment:'label',start:l.position,target:l.anchor,controls:[l.elbow],end:'filled-arrow'}];
  for(const key of ['anchor','elbow','extraAnchors','leaderArrowHead'])delete l[key];
  l.targetBinding={status:'confirmed',objectId:'drawing',reason:'Mock source relation'};
  Object.assign(l,{disposition:'restore',semanticRole:'scientific-label',reason:'Visible scientific label'});
  return raw([l],{version:4,observationVersion:1,leaderObservationVersion:1,observationContractRevision:'1.4.0',removalOnlyItems:[],geometryLock,...rest});
};
const waitFor = (events,event) => once(events,event,{signal:AbortSignal.timeout(2000)});
const checkIds = ['object-counts','inside-outside','liquid-occupancy','connections','composition-state','black-fill-meaning','presentation','request-scope','raster-label-removal','editable-label-coverage','leader-relations','kice-flat-style','flat-gray-regions'];
const report = overrides => JSON.stringify({ verdict: 'pass', checks: checkIds.map(id => ({ id, label: id, status: 'pass', detail: '원본과 후보를 확인한 근거' })), issues: [], ...overrides });

test('source ownership retains exact bullets/operators and excludes physical power icons', async () => {
  const { parseSourceLabelAnalysis } = await modulePromise;
  const plan = parseSourceLabelAnalysis(raw([label(), label({ id: 'plus', text: '+', mode: 'text', elbow: undefined, extraAnchors: undefined, leaderArrowHead: undefined }),
    label({ id: 'minus', text: '−' }), label({ id: 'power', text: '⏻' })]), 1);
  assert.deepEqual(plan.labels.map(l => l.text), ['• 전자', '+', '−']);
  assert.equal(plan.preservedMarks[0].reason, 'physical-device-icon');
  assert.ok(Object.isFrozen(plan.labels[0].typography.bounds));
});

test('true leader geometry persists while a scientific range caption restores text only', async () => {
  const { parseSourceLabelAnalysis, buildSourceLabelRemovalManifest } = await modulePromise;
  const { createEditableImageLabelObjects } = await labelsPromise;
  const route = { kind: 'straight', attachment: 'label', start: { x: .8, y: .6 }, target: { x: .4, y: .3 }, controls: [], end: 'filled-arrow' };
  const caption = label({ id: 'range-caption', text: '두께', mode: 'text', anchor: { x: .8, y: .6 },
    elbow: undefined, extraAnchors: undefined, leaderArrowHead: undefined, leaderDash: undefined });
  const plan = parseSourceLabelAnalysis(raw([label({ leaderRoutes: [route] }), caption]), 1);
  let id = 0;
  const [object, textObject] = createEditableImageLabelObjects({ labels: plan.labels, image: { id: 'i', x: 10, y: 20, w: 100, h: 50 }, idFactory: () => `a${++id}` });
  assert.deepEqual(object.elbow, { x: 70, y: 45 });
  assert.deepEqual(object.extraAnchors, [{ x: 30, y: 30 }]);
  assert.equal(object.leaderArrowHead, 'target'); assert.equal(object.dashGap, .6); assert.equal(object.aiSourceLabelId, 's1-a');
  assert.equal(object.leaderRoutes[0].end, 'filled-arrow');
  assert.deepEqual(JSON.parse(JSON.stringify(object)), object);
  assert.equal(textObject.type, 'text'); assert.equal(textObject.text, '두께');
  for (const key of ['leaderRoutes', 'leaderArrowHead', 'elbow', 'extraAnchors', 'p1', 'p2']) assert.equal(Object.hasOwn(textObject, key), false);
  const manifest = buildSourceLabelRemovalManifest(plan);
  assert.deepEqual(manifest[0].leader.routes, [route]);
  assert.equal(manifest[1].leader, null);
});

for (const [name, value] of Object.entries({
  bounds: label({ typography: { role: 'text' } }), anchor: label({ anchor: { x: -1, y: .5 } }), elbow: label({ elbow: { x: 2, y: 0 } }),
  arrow: label({ leaderArrowHead: 'both' }), extra: label({ extraAnchors: [{ x: NaN, y: 0 }] }), mixed: label({ mode: 'text' }),
})) test(`invalid ${name} stops removal instead of silently losing source labels`, async () => {
  const { parseSourceLabelAnalysis } = await modulePromise;
  const p=parseSourceLabelAnalysis(raw([value]),1);assert.equal(p.labels.length,0);assert.ok(p.quarantinedItems.length);assert.equal(p.quarantinedItems[0].deletionAuthority,false);
});

test('duplicate source occurrence IDs fail closed; equal text with different IDs stays distinct', async () => {
  const { parseSourceLabelAnalysis } = await modulePromise;
  const p=parseSourceLabelAnalysis(raw([label(),label()]),1);assert.equal(p.labels.length,0);assert.equal(p.quarantinedItems.length,2);
  assert.equal(parseSourceLabelAnalysis(raw([label(), label({ id: 'second' })]), 1).labels.length, 2);
});

test('legacy input and unknown source references cannot become frozen removal plans', async () => {
  const { parseSourceLabelAnalysis } = await modulePromise;
  assert.throws(() => parseSourceLabelAnalysis(raw().replace('"version":3', '"version":2'), 1));
  const p=parseSourceLabelAnalysis(raw([label({sourceRef:2})]),1);assert.equal(p.labels.length,0);assert.equal(p.quarantinedItems[0].deletionAuthority,false);
  assert.throws(() => parseSourceLabelAnalysis(`<5e-editable-labels>${raw().replace('"version":3', '"version":2')}</5e-editable-labels>`, 1));
});

test('malformed uncertainty or preservation metadata cannot silently become a quality pass', async () => {
  const { parseSourceLabelAnalysis } = await modulePromise;
  for (const value of [{ uncertainties: 'unknown' }, { preservedMarks: null }, { uncertainties: [12] },
    { uncertainties: [{ sourceRef: 1, reason: '' }] }, { uncertainties: [{ sourceRef: 2, reason: '판독 불가' }] },
    { uncertainties: [{ sourceRef: 1, reason: '판독 불가', bounds: { x: .9, y: 0, w: .2, h: .1 } }] }]) {const p=parseSourceLabelAnalysis(raw(undefined,value),1);assert.equal(p.labels.length,1);assert.ok(p.quarantinedItems.length);assert.equal(p.reviewRequired,true);}
  assert.throws(() => parseSourceLabelAnalysis('x'.repeat(100001), 1));
});

test('structured uncertainty keeps source location and reason in the frozen removal prompt', async () => {
  const { parseSourceLabelAnalysis, withFrozenSourceLabelPlan } = await modulePromise;
  const uncertainties = [{ sourceRef: 1, reason: '화면 안 작은 표기는 판독 불가', bounds: { x: .2, y: .3, w: .1, h: .1 } }];
  const plan = parseSourceLabelAnalysis(raw(undefined, { uncertainties }), 1);
  assert.deepEqual(plan.uncertainties, uncertainties);
  assert.equal(plan.reviewRequired, true);
  assert.ok(Object.isFrozen(plan.uncertainties[0].bounds));
  const prompt = withFrozenSourceLabelPlan('변환', { ...plan, frozen: true });
  assert.ok(prompt.includes(JSON.stringify(uncertainties[0])));
});

test('observer timeout rejects and retires its turn instead of starting image generation', async () => {
  const { createSourceLabelController } = await modulePromise;
  let sends = 0;
  const c = createSourceLabelController({ timeoutMs: 10, transport: { send: async () => { sends++; return { turnId: 'expired' }; }, interrupt: () => {} } });
  await assert.rejects(c.analyze({ attachments, ...selection }), /시간 초과/);
  assert.equal(sends, 1); assert.equal(c.handleEvent({ kind: 'done', turnId: 'expired', status: 'completed' }), true);
});

async function plannedController({ early = false, uncertainty = false } = {}) {
  const { createSourceLabelController } = await modulePromise;
  const sent = [], events=new EventEmitter(); let c;
  c = createSourceLabelController({ transport: { send: async payload => {
    sent.push(payload); const id = `t${sent.length}`;events.emit('send');
    if (early) { c.handleEvent({ kind: 'assistant', turnId: id, text: observed() }); c.handleEvent({ kind: 'done', turnId: id, status: 'completed' }); }
    return { turnId: id, renderThreadId: `thread${id}` };
  } } });
  const ready=waitFor(events,'send');const promise = c.analyze({ attachments, ...selection });await ready;
  if (!early) { c.handleEvent({ kind: 'assistant', turnId: 't1', text: observed({ uncertainties: Array.isArray(uncertainty) ? uncertainty : uncertainty ? ['확인 불가'] : [] }) }); c.handleEvent({ kind: 'done', turnId: 't1', status: 'completed' }); }
  return { c, sent, plan: await promise, nextSend:()=>waitFor(events,'send') };
}

test('observer binds early events, freezes source bytes and uses isolated scene purpose', async () => {
  const { c, sent, plan } = await plannedController({ early: true });
  assert.equal(sent[0].purpose, 'scene'); assert.equal(sent[0].conversationId, null); assert.equal(plan.frozen, true);
  assert.equal(plan.policyVersion, 4);
  assert.equal(plan.sourceBindings[0].transportSha256.length, 64);
  assert.equal(c.handleEvent({ kind: 'image', turnId: 't1' }), true);
  const { withFrozenSourceLabelPlan } = await modulePromise;
  const prompt = withFrozenSourceLabelPlan('변환', plan);
  assert.ok(prompt.includes('• 전자')); assert.ok(!prompt.includes('[5e-editable-labels version='));
  assert.throws(() => withFrozenSourceLabelPlan('변환', { ...plan, frozen: false }));
  assert.throws(() => withFrozenSourceLabelPlan('변환', { ...plan, policyVersion: 3 }), /확정된 원본 라벨 명세/);
});

test('cancel during source hashing never sends a generation or observer turn', async () => {
  const { createSourceLabelController } = await modulePromise;
  let sends = 0;
  const c = createSourceLabelController({ transport: { send: () => { sends++; } } });
  const p = c.analyze({ attachments, ...selection });
  assert.equal(c.cancel(), true);
  await assert.rejects(p, { code: 'AI_TURN_CANCELLED' }); assert.equal(sends, 0);
});

test('cancel before RPC binding retires late events without applying a plan', async () => {
  const { createSourceLabelController } = await modulePromise;
  let bind;const events=new EventEmitter();
  const c = createSourceLabelController({ transport: { send: () => new Promise(r => { bind = r;events.emit('send'); }),interrupt:()=>events.emit('interrupt') } });
  const ready=waitFor(events,'send');const p = c.analyze({ attachments, ...selection }); await ready;
  c.cancel(); await assert.rejects(p, { code: 'AI_TURN_CANCELLED' });
  const stopped=waitFor(events,'interrupt');bind({ turnId: 'late' }); await stopped;
  assert.equal(c.handleEvent({ kind: 'assistant', turnId: 'late', text: raw() }), true);
});

test('tool invocation in observation fails closed and interrupts', async () => {
  const { createSourceLabelController } = await modulePromise;
  const interrupts = [],events=new EventEmitter();
  const c = createSourceLabelController({ transport: { send: async () => {events.emit('send');return { turnId: 't' };}, interrupt: binding => { interrupts.push(binding);events.emit('interrupt'); } } });
  const ready=waitFor(events,'send');const p = c.analyze({ attachments, ...selection }); await ready;
  const stopped=waitFor(events,'interrupt');c.handleEvent({ kind: 'progress', turnId: 't' }); await assert.rejects(p, /이미지 생성/); await stopped; assert.deepEqual(interrupts, [{turnId:'t'}]);
});

test('quality review rejects changed source bytes and missing label checks', async () => {
  const { c, sent, plan, nextSend } = await plannedController();
  await assert.rejects(c.review({ ...selection, plan, attachments: [{ ...attachments[0], data: 'data:image/png;base64,Yg==' }], candidate: attachments[0] }), /원본/);
  assert.equal(sent.length, 1);
  const ready=nextSend();const p = c.review({ ...selection, plan, attachments, candidate: attachments[0] }); await ready;
  c.handleEvent({ kind: 'assistant', turnId: 't2', text: report({ checks: checkIds.filter(id => !['raster-label-removal','editable-label-coverage','leader-relations'].includes(id)).map(id => ({ id, label: id, status: 'pass', detail: 'observed' })) }) });
  c.handleEvent({ kind: 'done', turnId: 't2', status: 'completed' }); await assert.rejects(p, /게이트/);
});

test('quality review retains raster duplication failures without automatically generating again', async () => {
  const { c, sent, plan, nextSend } = await plannedController();
  const ready=nextSend();const p = c.review({ ...selection, plan, attachments, candidate: attachments[0] }); await ready;
  c.handleEvent({ kind: 'assistant', turnId: 't2', text: report({ verdict: 'fail', issues: [{ message: 'plus remains', severity: 'major', bbox: { x: .2, y: .3, width: .1, height: .1 } }] }) });
  c.handleEvent({ kind: 'done', turnId: 't2', status: 'completed' });
  assert.equal((await p).verdict, 'fail'); assert.equal(sent.length, 2); assert.equal(sent[1].purpose, 'scene');
});

test('unresolved source uncertainty prevents a spurious quality pass', async () => {
  const { c, plan, nextSend } = await plannedController({ uncertainty: [{ sourceRef: 1, reason: '확인 불가' }] });
  const ready=nextSend();const p = c.review({ ...selection, plan, attachments, candidate: attachments[0] }); await ready;
  c.handleEvent({ kind: 'assistant', turnId: 't2', text: report() }); c.handleEvent({ kind: 'done', turnId: 't2', status: 'completed' });
  assert.equal((await p).verdict, 'uncertain');
});

test('source v4 requires bounded geometry and quarantines invalid relation targets without discarding objects', async () => {
  const { parseSourceLabelAnalysis } = await modulePromise;
  assert.equal(parseSourceLabelAnalysis(observed(),1).geometryLock.objects[0].id,'drawing');
  for (const geometry of [null,{version:1,objects:[]},{...geometryLock,objects:[{...geometryLock.objects[0],bounds:{x:0,y:0,w:2,h:1}}]}]) assert.throws(() => parseSourceLabelAnalysis(observed({geometryLock:geometry}),1),/원본/);
  const held=parseSourceLabelAnalysis(observed({geometryLock:{...geometryLock,objects:[{...geometryLock.objects[0],relations:[{target:'missing',kind:'connect'}]}]}}),1);
  assert.equal(held.geometryLock.objects.length,1);
  assert.deepEqual(held.geometryLock.objects[0].relations,[]);
  assert.ok(held.quarantinedItems.some(item=>item.stage==='geometry-relations' && item.deletionAuthority===false));
});
test('a legacy analysis response cannot silently start a new generation without geometry', async () => {
  const {createSourceLabelController}=await modulePromise;
  const events=new EventEmitter();const c=createSourceLabelController({transport:{send:async()=>{events.emit('send');return {turnId:'legacy'};}}});
  const ready=waitFor(events,'send');const p=c.analyze({attachments,...selection}); await ready;
  c.handleEvent({kind:'assistant',turnId:'legacy',text:raw()});c.handleEvent({kind:'done',turnId:'legacy',status:'completed'});
  await assert.rejects(p,/지시선 존재 관찰 계약/);
});
const compositeIds=['label-overlay-alignment','label-typography','leader-overlay'];
async function compositeFor(plan,status='mechanical-checks-clear') {
  const {createHash}=require('node:crypto');const h=s=>createHash('sha256').update(s).digest('hex');
  const data='data:image/png;base64,Yw==';
  return {attachment:{name:'FINAL_NATIVE_OVERLAY',data},report:{status,issues:status==='mechanical-checks-clear'?[]:[{code:'label-overlap'}]},bindings:{candidateSha256:h(attachments[0].data),planSha256:h(JSON.stringify(plan)),compositeSha256:h(data)}};
}
test('final review binds the exact native composite and requires final alignment checks', async () => {
  const {c,sent,plan,nextSend}=await plannedController();const composite=await compositeFor(plan);
  const ready=nextSend();const p=c.reviewFinal({...selection,plan,attachments,candidate:attachments[0],composite});await ready;
  assert.equal(sent[1].attachments.length,3);assert.match(sent[1].text,/FINAL_NATIVE_OVERLAY/);
  c.handleEvent({kind:'assistant',turnId:'t2',text:report()});c.handleEvent({kind:'done',turnId:'t2',status:'completed'});
  await assert.rejects(p,/게이트/);
});
test('changed final pixels or plan reject before a review turn is sent', async () => {
  const {c,sent,plan}=await plannedController();const composite=await compositeFor(plan);
  composite.attachment.data='data:image/png;base64,ZA==';
  await assert.rejects(c.reviewFinal({...selection,plan,attachments,candidate:attachments[0],composite}),/최종 합성물/);
  assert.equal(sent.length,1);
});
test('mechanical final-overlay warnings prevent an observational pass', async () => {
  const {c,plan,nextSend}=await plannedController();const composite=await compositeFor(plan,'needs-attention');
  const ready=nextSend();const p=c.reviewFinal({...selection,plan,attachments,candidate:attachments[0],composite});await ready;
  c.handleEvent({kind:'assistant',turnId:'t2',text:report({checks:[...checkIds,...compositeIds].map(id=>({id,label:id,status:'pass',detail:'실제 합성 화면 직접 대조'}))})});c.handleEvent({kind:'done',turnId:'t2',status:'completed'});
  const q=await p;assert.equal(q.verdict,'uncertain');assert.ok(q.issues.some(i=>i.message.includes('라벨끼리 겹침')));assert.equal(q.compositeBindings.compositeSha256,composite.bindings.compositeSha256);
});

test('correction draft selects one confirmed raster failure and never dispatches uncertainty or overlay fixes', async () => {
  const { buildSourceLabelCorrectionDraft } = await modulePromise;
  const draft = buildSourceLabelCorrectionDraft({ request: '그림 변환', report: { checks: [
    { id: 'presentation', label: '표현', status: 'fail', detail: '질감이 남음' },
    { id: 'connections', label: '연결', status: 'fail', detail: '원본의 관 접점이 끊김' },
    { id: 'object-counts', label: '개수', status: 'uncertain', detail: '작은 물체는 판독 불가' }
  ] } });
  assert.equal(draft.checkId, 'connections');
  assert.ok(draft.request.includes('원본의 관 접점이 끊김'));
  assert.ok(!draft.request.includes('질감이 남음'));
  for (const checks of [[{ id: 'connections', status: 'uncertain' }],
    [{ id: 'label-typography', status: 'fail' }, { id: 'label-overlay-alignment', status: 'fail' }]]) {
    assert.equal(buildSourceLabelCorrectionDraft({ report: { checks } }), null);
  }
});

test('removal checklist covers endpoint outlines and every target without deleting physical or deferred marks', async () => {
  const {parseSourceLabelAnalysis,buildSourceLabelRemovalManifest,withFrozenSourceLabelPlan} = await modulePromise;
  const route={kind:'straight',attachment:'label',start:{x:.8,y:.6},target:{x:.4,y:.3},controls:[],end:'circle',endRadius:.01};
  const plan=parseSourceLabelAnalysis(raw([
    label({leaderRoutes:[route]}),label({id:'power',text:'⏻',mode:'text',elbow:undefined,extraAnchors:undefined,leaderArrowHead:undefined}),
    label({id:'graph',text:'축',scope:'graph'}),label({id:'vertical',scope:'non_graph_vertical_deferred'})
  ]),1);
  const before=JSON.stringify(plan),manifest=buildSourceLabelRemovalManifest(plan);
  assert.equal(manifest.length,1);assert.deepEqual(manifest[0].leader.routes,[route]);
  assert.deepEqual(manifest[0].textBounds,plan.labels[0].typography.bounds);
  assert.ok(manifest[0].leader.remove.includes('target-mark-and-outline'));
  assert.equal(JSON.stringify(plan),before);
  const prompt=withFrozenSourceLabelPlan('변환',{...plan,frozen:true});
  assert.ok(prompt.includes(JSON.stringify(manifest)));
  assert.match(prompt,/흰색으로 덮는 마스크가 아니다/);
  const legacy=buildSourceLabelRemovalManifest(parseSourceLabelAnalysis(raw(),1));
  assert.deepEqual(legacy[0].leader.extraAnchors,[{x:.2,y:.2}]);
});

test('raster correction explicitly removes endpoint remnants while protecting the underlying vessel', async () => {
  const {buildSourceLabelCorrectionDraft}=await modulePromise;
  const draft=buildSourceLabelCorrectionDraft({report:{checks:[{id:'raster-label-removal',status:'fail',detail:'label-2 흰 끝점 잔존'}]}});
  assert.equal(draft.checkId,'raster-label-removal');
  assert.match(draft.request,/빈 원의 테두리/);assert.match(draft.request,/혈관 윤곽/);
});

test('observer cancellation interrupts its bound turn once with explicit identity', async () => {
 const {createSourceLabelController}=await modulePromise;const interruptions=[],events=new EventEmitter();
 const c=createSourceLabelController({transport:{send:async()=>{events.emit('send');return {turnId:'bound',renderThreadId:'observer-thread'};},interrupt:binding=>{interruptions.push(binding);events.emit('interrupt');}}});
 const ready=waitFor(events,'send');const pending=c.analyze({attachments,...selection});await ready;const stopped=waitFor(events,'interrupt');c.cancel();c.cancel();await assert.rejects(pending,{code:'AI_TURN_CANCELLED'});await stopped;
 assert.deepEqual(interruptions,[{turnId:'bound',threadId:'observer-thread'}]);
});
test('observer cancellation awaiting RPC defers interrupt and never targets the newer turn',async()=>{
 const {createSourceLabelController}=await modulePromise;const interruptions=[],events=new EventEmitter();let bindFirst,calls=0;
 const c=createSourceLabelController({transport:{send:()=>{calls++;if(calls===1)return new Promise(r=>{bindFirst=r;events.emit('send');});events.emit('send');return Promise.resolve({turnId:'new',renderThreadId:'new-thread'});},interrupt:binding=>{interruptions.push(binding);events.emit('interrupt');}}});
 const ready=waitFor(events,'send');const first=c.analyze({attachments,...selection});await ready;c.cancel();await assert.rejects(first,{code:'AI_TURN_CANCELLED'});assert.deepEqual(interruptions,[]);
 const nextReady=waitFor(events,'send');const next=c.analyze({attachments,...selection});await nextReady;const stopped=waitFor(events,'interrupt');bindFirst({turnId:'old',renderThreadId:'old-thread'});await stopped;assert.deepEqual(interruptions,[{turnId:'old',threadId:'old-thread'}]);
 c.handleEvent({kind:'assistant',turnId:'new',text:observed()});c.handleEvent({kind:'done',turnId:'new',status:'completed'});assert.equal((await next).frozen,true);assert.equal(interruptions.length,1);
});
test('observer timeout before binding defers interruption to its late RPC identity',async()=>{
 const {createSourceLabelController}=await modulePromise;const interruptions=[],events=new EventEmitter();let bind;
 const c=createSourceLabelController({timeoutMs:10,transport:{send:()=>new Promise(r=>{bind=r;}),interrupt:binding=>{interruptions.push(binding);events.emit('interrupt');}}});
 await assert.rejects(c.analyze({attachments,...selection}),/시간 초과/);assert.deepEqual(interruptions,[]);const stopped=waitFor(events,'interrupt');bind({turnId:'timed-out',threadId:'thread-timeout'});await stopped;
 assert.deepEqual(interruptions,[{turnId:'timed-out',threadId:'thread-timeout'}]);
});

test('default observer accepts a response beyond the former three-minute deadline',async t=>{
 const {createSourceLabelController,SOURCE_LABEL_TIMEOUT_MS}=await modulePromise;
 assert.ok(SOURCE_LABEL_TIMEOUT_MS>600000);
 t.mock.timers.enable({apis:['setTimeout']});let sent=0;const events=new EventEmitter();
 const c=createSourceLabelController({transport:{send:async()=>{sent++;events.emit('send');return {turnId:'slow-but-running'};}}});
 const ready=waitFor(events,'send');const p=c.analyze({attachments,...selection});await ready;
 assert.equal(sent,1);
 t.mock.timers.tick(180001);assert.equal(c.isActive(),true);
 c.handleEvent({kind:'assistant',turnId:'slow-but-running',text:observed()});
 c.handleEvent({kind:'done',turnId:'slow-but-running',status:'completed'});
 assert.equal((await p).frozen,true);
});
test('optional OCR preparation expires and proceeds with direct original observation exactly once',async()=>{
 const {createSourceLabelController}=await modulePromise;let signal,sends=0,c,receipt;
 c=createSourceLabelController({candidateTimeoutMs:10,collectCandidates:async(_input,options)=>{signal=options.signal;return new Promise(()=>{});},transport:{send:async()=>{
  sends++;c.handleEvent({kind:'assistant',turnId:'ocr-fallback',text:observed()});c.handleEvent({kind:'done',turnId:'ocr-fallback',status:'completed'});return {turnId:'ocr-fallback'};
 }}});
 const plan=await c.analyze({...selection,attachments,onSourceCandidates:r=>{receipt=r;}});
 assert.equal(signal.aborted,true);assert.equal(sends,1);assert.equal(plan.frozen,true);
 assert.equal(receipt.candidateSets.length,0);assert.match(receipt.errors[0].message,/시간 초과/);
});
test('cancellation of unresponsive optional OCR is prompt and never sends a model request',async()=>{
 const {createSourceLabelController}=await modulePromise;let entered;const ready=new Promise(r=>{entered=r;});let sends=0;
 const c=createSourceLabelController({collectCandidates:async()=>{entered();return new Promise(()=>{});},transport:{send:async()=>{sends++;}}});
 const signal=new AbortController();const pending=c.analyze({...selection,attachments,signal:signal.signal});
 await ready;signal.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(sends,0);
});
test('exact-source optional candidates are reused without reusing the AI observation',async()=>{
 const {createSourceLabelController}=await modulePromise;let collections=0,sends=0,c;
 c=createSourceLabelController({collectCandidates:async input=>{collections++;return {version:1,sourceRef:input.sourceRef,sourceSha256:input.sourceSha256,width:1,height:1,candidates:[{id:'s1-ocr-1',text:'전자',bounds:{x:.1,y:.1,w:.1,h:.1},origin:'ocr'}]};},transport:{send:async()=>{
  const id='cache-'+(++sends);c.handleEvent({kind:'assistant',turnId:id,text:observed()});c.handleEvent({kind:'done',turnId:id,status:'completed'});return {turnId:id};
 }}});
 await c.analyze({...selection,attachments});await c.analyze({...selection,attachments});
 assert.equal(collections,1);assert.equal(sends,2);
 await c.analyze({...selection,attachments:[{name:'different',data:'data:image/png;base64,Yg=='}]});assert.equal(collections,2);
});
test('provider failure and timeout retain the actual label model and bound execution identity',async()=>{
 const {createSourceLabelController}=await modulePromise;
 const events=new EventEmitter();const c=createSourceLabelController({transport:{send:async()=>{events.emit('send');return {turnId:'source-turn',renderThreadId:'source-thread'};}}});
 const ready=waitFor(events,'send');const pending=c.analyze({attachments,...selection});await ready;
 c.handleEvent({kind:'done',turnId:'source-turn',status:'failed',error:'모델 분석 응답 오류'});
 await assert.rejects(pending,e=>e.message==='모델 분석 응답 오류'&&e.aiRequest.turnId==='source-turn'&&e.aiRequest.model==='test'&&e.aiRequest.threadId==='source-thread');
});
