const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the real run orchestration with rendering seams, not a browser.
async function setup(removal) {
  const file = require.resolve('../js/ai-image-label-run.js');
  const source = fs.readFileSync(file,'utf8');
  const dependencies = {};
  for (const match of source.matchAll(/^import \{ ([^}]+) \} from '([^']+)';$/gm)) {
    const module = await import(path.resolve(path.dirname(file),match[2].split('?')[0]));
    for (const name of match[1].split(',').map(s=>s.trim())) dependencies[name]=module[name];
  }
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==';
  const digest = dependencies.imageLabelDigest || (await import('../js/ai-image-label-run.js')).imageLabelDigest;
  const wire = await import('../js/ai-source-observation-wire.js');
  const plan = {version:4,frozen:true,policyVersion:dependencies.SOURCE_LABEL_POLICY_VERSION,
    observationVersion:wire.SOURCE_OBSERVATION_VERSION,leaderObservationVersion:wire.SOURCE_LEADER_OBSERVATION_VERSION,
    observationContractRevision:wire.SOURCE_OBSERVATION_CONTRACT_REVISION,
    sourceBindings:[{transportSha256:await digest(png)}],
    labels:[{id:'a',text:'A',evidence:'A',sourceKind:'reference',sourceRef:1,scope:'general',
      mode:'text',contentMode:'plain',anchor:{x:.5,y:.5},position:{x:.5,y:.5},
      typography:{role:'name',orientation:'horizontal',rotation:0,bounds:{x:.4,y:.4,w:.2,h:.2}}}],
    uncertainties:[],excludedLabels:[],removalRegions:[]};
  const calls = {analysis:0,style:0,verify:0,cache:0,render:0};
  const composite = {attachment:{data:png},bindings:{candidateSha256:await digest(png)},
    report:{status:'mechanical-checks-clear',issues:[],measurements:[]}};
  dependencies.createEditableLabelComposite = async () => {calls.render++;return structuredClone(composite);};
  dependencies.removeExamLabelsFromDataUrl = async () => removal || ({
    dataUrl:'discarded partial deletion',report:{status:'needs-attention',changedPixels:12,issues:[{code:'unconfirmed-removal'}]},
  });
  dependencies.prepareJointLabelVerification = async ({plan,candidateDataUrl,imageKind}) => ({
    placement:await dependencies.bindLabelTargetPlacement({plan,candidateDataUrl,imageKind,
      labels:plan.labels.map(l=>({id:l.id,status:'uncertain',reason:'Local measurement; not verified'}))}),
    proposals:{groups:[]},composite:structuredClone(composite),measurementOnly:true,semanticConfirmed:false,
  });
  const context = vm.createContext({...dependencies,crypto,performance,DOMException,structuredClone,TextEncoder,Uint8Array});
  vm.runInContext(source.replace(/^import .*;\n/gm,'').replace(/^export /gm,''),context);
  let observation;
  const options = {source:{data:png,name:'source'},workflow:{imageKind:'general',labelResult:'restore-editable',verificationMode:'draft-first'},
    selection:{model:'chosen-model',effort:'high'},artboard:{w:100,h:100},
    onObservation:value=>{observation=value;},
    observer:{analyze:async()=>{calls.analysis++;return structuredClone(plan);},
      verifyPlacement:async ({preview})=>{calls.verify++;return {placement:preview.placement,report:{verdict:'uncertain',checks:[],issues:[]}};}},
    raster:{generate:async payload=>{calls.style++;assert.equal(payload.model,'chosen-model');assert.equal(payload.effort,'high');return {src:png,imageToolCalls:1};}},
    cache:{get:async()=>({hit:false}),put:async()=>{calls.cache++;return {stored:true};}}};
  return {run:context.executeImageLabelRun,options,plan,png,calls,get observation(){return observation;}};
}

test('draft first produces native composite after one observation and one style without verification or approval cache', async () => {
  const f = await setup(), phases = [];
  f.options.cache.get=()=>assert.fail('draft-first must not return an approved cache hit');
  const result = await f.run({...f.options,onPhase:phase=>phases.push(phase)});
  assert.deepEqual(f.calls,{analysis:1,style:1,verify:0,cache:0,render:1});
  assert.equal(result.accepted,false);assert.equal(result.status,'needs-attention');
  assert.equal(result.finalLabelComposite,f.png);assert.equal(result.labelPlan.labels.length,1);
  assert.equal(result.report.verdict,'uncertain');assert.equal(result.report.targetVerified,false);
  assert.equal(result.report.placementVerified,false);assert.equal(result.targetPlacement.verified,false);
  assert.ok(result.report.issues.some(i=>i.code==='optional-review-not-run'));
  assert.equal(result.metrics.calls.review,0);assert.equal(result.metrics.cacheStored,false);
  assert.deepEqual(phases,['sourceAnalysis','generation','labelProposals','labelPlacement']);
});

for (const verificationMode of [undefined,'full']) test(`full verification preserved for ${verificationMode || 'legacy missing policy'}`, async () => {
  const f = await setup();
  f.options.workflow.verificationMode=verificationMode;
  if (!verificationMode) f.options.workflow.version='1.0.0';
  const result = await f.run(f.options);
  assert.equal(f.calls.analysis,1);assert.equal(f.calls.style,1);assert.equal(f.calls.verify,1);
  assert.equal(result.metrics.calls.review,1);
  assert.equal(result.workflow.verificationMode,'full');
  assert.ok(!result.report.issues.some(i=>i.code==='optional-review-not-run'));
});

test('verify only reuses bound RAW and observation and rejects stale bindings before any generation', async () => {
  const f = await setup(), draft = await f.run(f.options), observation = f.observation;
  const checked = await f.run({...f.options,verifyOnly:true,observation,previousCandidate:draft});
  assert.equal(f.calls.analysis,1);assert.equal(f.calls.style,1);assert.equal(f.calls.verify,1);
  assert.equal(checked.metrics.observationReused,true);assert.equal(checked.metrics.calls.fullGeneration,0);
  assert.equal(checked.data,draft.data);assert.equal(checked.metrics.calls.review,1);
  for (const previousCandidate of [{...draft,sourceSha256:'a'.repeat(64)},{...draft,planSha256:'a'.repeat(64)},{...draft,candidateSha256:'a'.repeat(64)}]) {
    await assert.rejects(f.run({...f.options,verifyOnly:true,observation,previousCandidate}),/바인딩/);
  }
  await assert.rejects(f.run({...f.options,verifyOnly:true,previousCandidate:{...draft,sourceLabelPlan:null}}),/바인딩/);
  assert.equal(f.calls.analysis,1);assert.equal(f.calls.style,1);assert.equal(f.calls.verify,1);
});

for (const checkpoint of ['present','absent','stale']) test(`verify only changes draft-first to full without new analysis using ${checkpoint} tab checkpoint`, async () => {
  const f = await setup(), draft = await f.run(f.options);
  const candidate = {...structuredClone(draft),imageLabelWorkflow:draft.workflow};
  delete candidate.workflow;
  const observation = checkpoint === 'absent' ? undefined : structuredClone(f.observation);
  if (checkpoint === 'stale') observation.plan.labels[0].text='other tab plan';
  const checked = await f.run({...f.options,workflow:{...f.options.workflow,verificationMode:'full'},
    verifyOnly:true,observation,previousCandidate:candidate});
  assert.equal(checked.metrics.calls.sourceAnalysis,0);
  assert.equal(checked.metrics.calls.fullGeneration,0);
  assert.equal(checked.metrics.calls.review,1);
  assert.equal(checked.metrics.observationReused,true);
  assert.equal(checked.data,draft.data);assert.equal(checked.planSha256,draft.planSha256);
  assert.deepEqual(JSON.parse(JSON.stringify(checked.sourceLabelPlan)),draft.sourceLabelPlan);
  assert.equal(checked.workflow.verificationMode,'full');
  assert.equal(f.calls.analysis,1);assert.equal(f.calls.style,1);assert.equal(f.calls.verify,1);
});

test('verify only cannot change image kind, label outcome, auxiliary marks or scientific arrows', async () => {
  const f = await setup(), draft = await f.run(f.options);
  for (const change of [{imageKind:'exam'},{labelResult:'remove'},{auxiliaryMarks:'keep'},{scientificArrows:'remove'}]) {
    await assert.rejects(f.run({...f.options,workflow:{...f.options.workflow,verificationMode:'full',...change},
      verifyOnly:true,observation:f.observation,previousCandidate:draft}),/바인딩/);
  }
  assert.equal(f.calls.analysis,1);assert.equal(f.calls.style,1);assert.equal(f.calls.verify,0);
});

test('saved candidate verification rejects stale source observation contracts without reanalysis', async () => {
  const f = await setup(), draft = await f.run(f.options);
  const {imageLabelDigest} = await import('../js/ai-image-label-run.js');
  for (const field of ['policyVersion','observationVersion','leaderObservationVersion','observationContractRevision']) {
    const candidate = structuredClone(draft);
    candidate.sourceLabelPlan[field]='stale-contract';
    candidate.planSha256=await imageLabelDigest(JSON.stringify(candidate.sourceLabelPlan));
    await assert.rejects(f.run({...f.options,verifyOnly:true,previousCandidate:candidate}),/보존된 관찰/);
  }
  assert.equal(f.calls.analysis,1);assert.equal(f.calls.style,1);assert.equal(f.calls.verify,0);
});

test('draft cancellation after RAW checkpoint cannot return or cache late results', async () => {
  const f = await setup(), controller = new AbortController(), checkpoint = Promise.withResolvers(), release = Promise.withResolvers();
  const pending = f.run({...f.options,signal:controller.signal,onRaster:async()=>{
    checkpoint.resolve();await release.promise;
  }});
  await checkpoint.promise;controller.abort();release.resolve();
  await assert.rejects(pending,{name:'AbortError'});
  assert.equal(f.calls.verify,0);assert.equal(f.calls.cache,0);assert.equal(f.calls.render,0);
});

for (const count of [5,4,5]) test(`exam hold returns unchanged bytes plus ${count} independently editable label IDs`, async () => {
  const f = await setup();
  f.plan.labels=Array.from({length:count},(_,i)=>({...structuredClone(f.plan.labels[0]),id:`label-${i}`}));
  f.options.workflow.imageKind='exam';
  const result = await f.run(f.options);
  assert.equal(result.data,f.png);assert.equal(result.labelPlan,null);assert.equal(result.targetPlacement,null);
  assert.equal(result.accepted,false);assert.equal(result.editableDraft.presentation,'external-list');
  assert.equal(result.editableDraft.labelIds.length,count);
  assert.equal(result.editableDraft.sourceSha256,result.candidateSha256);
  assert.equal(result.editableDraft.planSha256,result.planSha256);
  assert.equal(result.removalReport.changedPixels,0);
  assert.equal(result.removalReport.verifiedInkPixels,12);assert.equal(result.removalReport.partialCandidateDiscarded,true);
  assert.equal(f.calls.style,0);assert.equal(f.calls.verify,0);assert.equal(f.calls.cache,0);
});

test('partial exam removal restores only committed label IDs and binds the subset to unchanged full observation', async () => {
  const { encodeScopedPng } = await import('../js/ai-scoped-edit-png.js');
  const { imageLabelDigest } = await import('../js/ai-image-label-run.js');
  const pixels = new Uint8Array(8 * 8 * 4).fill(255);
  for (const pixel of [10, 12, 24]) pixels.fill(0, pixel * 4, pixel * 4 + 3);
  const toUrl = async data => 'data:image/png;base64,' + Buffer.from(await encodeScopedPng({ data, width: 8, height: 8 })).toString('base64');
  const source = await toUrl(pixels);
  const removed = pixels.slice();
  for (const pixel of [10, 12]) removed.fill(255, pixel * 4, pixel * 4 + 3);
  const candidate = await toUrl(removed);
  const f = await setup({
    dataUrl: candidate,
    report: { status: 'partial', changedPixels: 2, removedLabelIds: ['a', 'b'],
      deferredLabels: [{ labelId: 'c', reasons: ['outside-ink-connection'] }],
      removalMasks: { version: 1, coordinateSpace: 'source-pixels', width: 8, height: 8, regions: [
        { labelId: 'a', component: 'text', pixels: [10] },
        { labelId: 'b', component: 'text', pixels: [12] },
      ] },
      issues: [{ code: 'outside-ink-connection', id: 'c' }] },
  });
  f.options.source.data = source;
  f.options.workflow.imageKind = 'exam';
  f.plan.sourceBindings[0].transportSha256 = await imageLabelDigest(source);
  f.plan.labels = ['a', 'b', 'c'].map(id => ({ ...structuredClone(f.plan.labels[0]), id }));
  const result = await f.run(f.options);
  assert.equal(result.data, candidate);
  assert.equal(result.sourceLabelPlan.labels.length, 3);
  assert.equal(result.planSha256, await imageLabelDigest(JSON.stringify(result.sourceLabelPlan)));
  assert.deepEqual(Array.from(result.labelPlan.labels, l => l.id), ['a', 'b']);
  assert.deepEqual(Array.from(result.labelPlan.sourcePlan.labels, l => l.id), ['a', 'b']);
  assert.equal(result.editableDraft, undefined);
  assert.equal(result.removalReport.changedPixels, 2);
  assert.equal(result.removalReport.partialCandidateDiscarded, undefined);
  assert.equal(result.removalReport.removalBinding.sourceSha256, result.sourceSha256);
  assert.equal(result.removalReport.removalBinding.planSha256, result.planSha256);
  assert.equal(result.removalReport.removalBinding.candidateSha256, result.candidateSha256);
  assert.deepEqual(Array.from(result.removalReport.removalBinding.removedLabelIds), ['a', 'b']);
  assert.deepEqual(Array.from(result.removalReport.removalBinding.restoredLabelIds), ['a', 'b']);
  assert.equal(result.labelPlan.removalBinding.candidateSha256, result.candidateSha256);
  assert.equal(result.accepted, false);
  assert.equal(result.status, 'needs-attention');
  assert.equal(f.calls.style, 0);
  assert.equal(f.calls.verify, 0);
  assert.equal(f.calls.cache, 0);
  assert.equal(f.calls.render, 1);
  const {snapshotImageItem}=await import('../js/ai-candidate-snapshot.js?v=1.7.0-four-session-integration');
  // This VM has no Image decoder; use the independently defined 8x8 PNG frame.
  const persisted={...result,imageLabelWorkflow:result.workflow,reviewState:'needs-attention',
    sourceFrame:{...result.sourceFrame,width:8,height:8},candidateFrame:{...result.candidateFrame,width:8,height:8}};
  const restored=snapshotImageItem(persisted);
  assert.equal(restored.planSha256,result.planSha256);
  assert.equal(restored.targetPlacement.planSha256,result.removalReport.restorationPlanSha256);
  assert.notEqual(restored.targetPlacement.planSha256,restored.planSha256);
  assert.equal(restored.sourceLabelPlan.labels.length,3);
  assert.deepEqual(Array.from(restored.labelPlan.labels,label=>label.id),['a','b']);
  for(const mutate of [
    value=>{value.removalReport.removalBinding.candidateSha256='a'.repeat(64);},
    value=>{value.removalReport.restorationPlanSha256='b'.repeat(64);},
    value=>{value.removalReport.removalBinding.restoredLabelIds.push('c');},
    value=>{value.removalReport.status='complete';},
  ]){
    const invalid=structuredClone(persisted);mutate(invalid);
    assert.throws(()=>snapshotImageItem(invalid),/binding mismatch/);
  }
});

test('graph-only exam is preserved as an out-of-scope control without label restoration or additional model review', async () => {
  const f = await setup({ dataUrl: null, report: { status: 'complete', changedPixels: 0, removedLabelIds: [], deferredLabels: [], issues: [] } });
  f.options.workflow.imageKind = 'exam';
  f.plan.excludedLabels = [{ ...structuredClone(f.plan.labels[0]), scope: 'graph' }];
  f.plan.labels = [];
  const result = await f.run(f.options);
  assert.equal(result.data, f.png);
  assert.equal(result.status, 'out-of-scope');
  assert.equal(result.labelPlan, null);
  assert.equal(result.editableDraft, null);
  assert.equal(f.calls.style, 0);
  assert.equal(f.calls.verify, 0);
  assert.equal(f.calls.cache, 0);
});
