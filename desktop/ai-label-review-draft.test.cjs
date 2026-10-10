const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const api = import('../js/ai-label-review-draft.js');
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==';
const hash = data => createHash('sha256').update(data).digest('hex');
const fixture = () => ({ kind: 'generated', id: 'candidate-1', data: png, candidateSha256: hash(png),
  imageLabelWorkflow: { explicit: true, labelResult: 'restore-editable' }, reviewState: 'needs-attention',
  reviewReport: { verdict: 'fail', checks: [], issues: [{ code: 'raw-ink-occlusion', severity: 'major' }] },
  labelPlan: { frozen: true, reviewRequired: true, labels: [{ id: 'caption', text: '원문' }] } });

test('review draft retains failed verdict and source while inserting a separate editable copy', async () => {
  const { insertLabelReviewDraft } = await api, candidate = fixture(), before = JSON.stringify(candidate);
  let result;
  assert.equal(await insertLabelReviewDraft({ candidate, taskId: 'task', isCurrent: () => true,
    insert: async (data, options) => { result = { data, options }; return 'new-image'; } }), 'new-image');
  assert.equal(JSON.stringify(candidate), before);
  assert.equal(result.data, png); assert.equal(result.options.replaceId, undefined);
  assert.equal(result.options.editableLabelPlan.reviewRequired, true);
  assert.deepEqual(result.options.editableLabelPlan.qualityReview, candidate.reviewReport);
  assert.equal(result.options.editableLabelPlan.reviewDraft.candidateSha256, candidate.candidateSha256);
  assert.equal(result.options.aiCandidateId, candidate.id);
});

test('tampered bytes and stale owner cannot reach canvas insertion', async () => {
  const { insertLabelReviewDraft } = await api; let calls = 0;
  const candidate = fixture(); candidate.candidateSha256 = 'a'.repeat(64);
  await assert.rejects(insertLabelReviewDraft({ candidate, taskId: 'task', isCurrent: () => true,
    insert: () => { calls++; } }), /후보와 다릅니다/);
  let checks = 0;
  await assert.rejects(insertLabelReviewDraft({ candidate: fixture(), taskId: 'task',
    isCurrent: () => ++checks === 1, insert: () => { calls++; } }), /변경/);
  assert.equal(calls, 0);
});

test('review drafts cannot promote passed, running, cancelled, malformed, or nonlabel candidates', async () => {
  const { canEditLabelReviewDraft } = await api;
  for (const state of ['passed', 'reviewing', 'generating', 'cancelled', 'idle']) {
    const c = fixture(); c.reviewState = state; assert.equal(canEditLabelReviewDraft(c), false);
  }
  for (const data of ['data:image/svg+xml,<svg/>', png.replace('iVBOR', 'AAAAA'), '']) {
    const c = fixture(); c.data = data; assert.equal(canEditLabelReviewDraft(c), false);
  }
  const c = fixture(); c.imageLabelWorkflow.labelResult = 'remove'; assert.equal(canEditLabelReviewDraft(c), false);
  c.imageLabelWorkflow.labelResult = 'restore-editable'; c.labelPlan.frozen = false; assert.equal(canEditLabelReviewDraft(c), false);
});

test('candidate mutation after preparation invalidates pending image decoding', async () => {
  const { insertLabelReviewDraft } = await api, c = fixture();
  await insertLabelReviewDraft({ candidate: c, taskId: 'task', isCurrent: () => true,
    insert: (_data, options) => {
      assert.equal(options.isCurrent(), true); c.labelPlan.labels[0].text = 'changed';
      assert.equal(options.isCurrent(), false);
    } });
});

function partialFixture() {
  const candidate = fixture();
  candidate.sourceSha256 = hash('source-transport');
  candidate.sourceLabelPlan = { frozen: true, sourceBindings: [{ transportSha256: candidate.sourceSha256 }],
    labels: [...structuredClone(candidate.labelPlan.labels), { id: 'deferred', text: '보류' }] };
  candidate.planSha256 = hash(JSON.stringify(candidate.sourceLabelPlan));
  const mask = { version: 1, coordinateSpace: 'source-pixels', width: 1, height: 1,
    regions: [{ labelId: 'caption', component: 'text', spans: [[0, 0, 0]] }] };
  const binding = { version: 1, sourceSha256: candidate.sourceSha256, planSha256: candidate.planSha256,
    candidateSha256: candidate.candidateSha256, removedLabelIds: ['caption'], restoredLabelIds: ['caption'],
    maskSha256: hash(JSON.stringify(mask)) };
  candidate.removalReport = { status: 'partial', removalMasks: mask, removalBinding: binding };
  candidate.labelPlan.removalBinding = structuredClone(binding);
  candidate.labelPlan.sourcePlan = { frozen: true, labels: structuredClone(candidate.labelPlan.labels),
    removalBinding: structuredClone(binding) };
  return candidate;
}

test('partial draft retains the full observation and inserts only bound removed labels', async () => {
  const { insertLabelReviewDraft } = await api, candidate = partialFixture(), before = JSON.stringify(candidate);
  let writes = 0;
  await insertLabelReviewDraft({ candidate, taskId: 'task', isCurrent: () => true,
    insert: (_data, options) => { writes++; assert.deepEqual(options.editableLabelPlan.labels.map(label => label.id), ['caption']); } });
  assert.equal(writes, 1);
  assert.equal(JSON.stringify(candidate), before);
});

for (const field of ['source-plan', 'mask', 'restored-ids', 'source-label-text']) {
  test(`partial draft rejects mutated ${field} before any canvas write`, async () => {
    const { insertLabelReviewDraft } = await api, candidate = partialFixture();
    if (field === 'source-plan') candidate.sourceLabelPlan.labels[1].text = 'changed';
    if (field === 'mask') candidate.removalReport.removalMasks.regions[0].spans[0][0] = 1;
    if (field === 'restored-ids') candidate.labelPlan.removalBinding.restoredLabelIds.push('deferred');
    if (field === 'source-label-text') candidate.labelPlan.labels[0].text = 'unbound';
    let writes = 0;
    await assert.rejects(insertLabelReviewDraft({ candidate, taskId: 'task', isCurrent: () => true,
      insert: () => writes++ }), /바인딩/);
    assert.equal(writes, 0);
  });
}

test('partial removal metadata mutation invalidates pending image decoding', async () => {
  const { insertLabelReviewDraft } = await api, candidate = partialFixture();
  await insertLabelReviewDraft({ candidate, taskId: 'task', isCurrent: () => true, insert: (_data, options) => {
    assert.equal(options.isCurrent(), true);
    candidate.removalReport.removalMasks.regions[0].spans[0][0] = 1;
    assert.equal(options.isCurrent(), false);
  } });
});

test('native draft metadata always remains needs-attention, including saved plans with missing placement proof', () => {
  const source = fs.readFileSync(require.resolve('../js/image-paste.js'), 'utf8');
  const code = source.slice(source.indexOf('function applyLabelPlacementReview('), source.indexOf('\nfunction autoLabelsForImage('));
  const context = vm.createContext({ structuredClone }); vm.runInContext(code, context);
  for (const verdict of ['fail', 'uncertain', 'pass']) {
    const image = { aiEditableLabelPlan: { reviewRequired: false, reviewDraft: { origin: 'user-review-edit' },
      qualityReview: { verdict, issues: [] } } };
    context.applyLabelPlacementReview(image);
    assert.equal(image.aiReviewState, 'needs-attention'); assert.equal(image.aiReviewDraft, true);
    assert.equal(image.aiEditableLabelPlan.reviewRequired, true);
    assert.equal(image.aiReviewReport.verdict, verdict);
    assert.equal(JSON.parse(JSON.stringify(image)).aiReviewDraft, true);
  }
  const replaced = { aiReviewDraft: true, aiEditableLabelPlan: { reviewRequired: false } };
  context.applyLabelPlacementReview(replaced);
  assert.equal(replaced.aiReviewDraft, undefined);
});

function externalFixture(count = 5) {
  const c = fixture();
  c.imageLabelWorkflow.imageKind = 'exam'; c.labelPlan = null;
  c.sourceSha256 = c.candidateSha256;
  c.sourceFrame = c.candidateFrame = {width:1,height:1,coordinateSystem:'normalized-0-1'};
  c.sourceLabelPlan = {version:4,frozen:true,sourceBindings:[{transportSha256:c.sourceSha256}],
    labels:Array.from({length:count},(_,i)=>({id:`label-${i}`,text:i ? 'A' : 'CO_2',
      evidence:i ? 'A' : 'CO_2',sourceKind:'reference',sourceRef:1,scope:'general',
      mode:'text',contentMode:i ? 'plain' : 'formula',anchor:{x:.5,y:.5},position:{x:.5,y:.5},
      typography:{role:i ? 'name' : 'chemical',orientation:'horizontal',rotation:0,bounds:{x:.4,y:.4,w:.2,h:.2}}}))};
  c.planSha256 = hash(JSON.stringify(c.sourceLabelPlan));
  c.editableDraft = {version:1,presentation:'external-list',sourceSha256:c.sourceSha256,
    candidateSha256:c.candidateSha256,planSha256:c.planSha256,labelIds:c.sourceLabelPlan.labels.map(l=>l.id)};
  return c;
}

for (const count of [5,4,5]) test(`retained exam ${count} labels insert without modifying source geometry or bytes`, async () => {
  const {canEditLabelReviewDraft,insertLabelReviewDraft} = await api, c = externalFixture(count), before = JSON.stringify(c);
  assert.equal(canEditLabelReviewDraft(c), true);
  await insertLabelReviewDraft({candidate:c,taskId:'task',isCurrent:()=>true,insert:(data,options)=>{
    assert.equal(data,png); assert.equal(options.preserveBytes,true);
    const p = options.editableLabelPlan;
    assert.equal(p.labels.length,count); assert.equal(p.targetPlacement,null);
    assert.equal(p.reviewDraft.presentation,'external-list');
    assert.deepEqual(p.sourcePlan,c.sourceLabelPlan);
    assert.deepEqual(p.labels,c.sourceLabelPlan.labels);
    assert.equal(p.qualityReview.verdict,'fail');
  }});
  assert.equal(JSON.stringify(c),before); assert.equal(c.labelPlan,null);
});

test('external drafts refuse invalid IDs, coordinates, frames, hashes and damaged PNGs', async () => {
  const {canEditLabelReviewDraft,insertLabelReviewDraft} = await api;
  for (const mutate of [
    c=>c.editableDraft.labelIds.push('unknown'),c=>c.editableDraft.labelIds.push('label-0'),
    c=>c.editableDraft.sourceSha256='a'.repeat(64),c=>c.editableDraft.candidateSha256='a'.repeat(64),
    c=>c.editableDraft.planSha256='a'.repeat(64),c=>c.sourceLabelPlan.sourceBindings[0].transportSha256='a'.repeat(64),
    c=>c.sourceLabelPlan.labels[0].position.x=1.1,c=>c.sourceLabelPlan.labels[0].typography.bounds.w=2,
    c=>c.sourceFrame={coordinateSystem:'pixels'},c=>c.data=png.slice(0,-8),
    c=>c.data=png.replace('nGP4','nGP5'),
  ]) {
    const c = externalFixture(); mutate(c);
    assert.equal(canEditLabelReviewDraft(c),false);
    await assert.rejects(insertLabelReviewDraft({candidate:c,taskId:'task',isCurrent:()=>true,insert:()=>assert.fail('invalid insertion')}));
  }
  const c = externalFixture(); c.sourceLabelPlan.labels[0].text='stale';
  await assert.rejects(insertLabelReviewDraft({candidate:c,taskId:'task',isCurrent:()=>true,insert:()=>assert.fail('stale plan')}),/바인딩/);
});

test('external native placement stays outside image and preserves formula, grouping and leader routes', async () => {
  const {createEditableImageLabelObjects} = await import('../js/ai-editable-image-labels.js');
  const {nativeLabelBounds,measureLabelTypography} = await import('../js/ai-label-typography.js');
  const source = fs.readFileSync(require.resolve('../js/image-paste.js'),'utf8');
  const context = vm.createContext({createEditableImageLabelObjects,nativeLabelBounds,measureLabelTypography,structuredClone});
  vm.runInContext(source.slice(source.indexOf('function autoLabelsForImage('),source.indexOf('\nexport async function prepareImageCandidateRevision(')),context);
  const c = externalFixture(5), p = c.sourceLabelPlan;
  p.labels[2].mode='leader';p.labels[2].anchor={x:.2,y:.3};
  p.labels[2].leaderRoutes=[{kind:'polyline',attachment:'label',end:'circle',endRadius:.01,
    start:{x:.5,y:.5},controls:[{x:.3,y:.5}],target:{x:.2,y:.3}}];
  p.relationGroups=[{id:'pair',labelIds:['label-0','label-1']}];
  p.reviewDraft={presentation:'external-list'};
  const before = JSON.stringify(p), image={id:'image',x:-50,y:-25,w:100,h:50,aiEditableLabelPlan:{reviewRequired:true},aiReviewState:'needs-attention'};
  const objects=context.autoLabelsForImage(image,{editableLabelPlan:p,aiTaskId:'task',aiCandidateId:'candidate'});
  assert.equal(objects.length,5);assert.equal(objects[0].type,'formula');assert.equal(objects[1].type,'text');assert.equal(objects[2].type,'labeler');
  assert.equal(objects[0].groupId,objects[1].groupId);assert.equal(objects[2].leaderRoutes[0].kind,'polyline');
  assert.equal(objects[2].leaderRoutes[0].end,'circle');assert.equal(objects[2].leaderRoutes[0].controls.length,1);
  const bounds=objects.map(o=>{
    if(o.type!=='labeler')return nativeLabelBounds(o);
    const m=measureLabelTypography(o);return {x:o.p2.x-m.rotatedW/2,y:o.p2.y-m.rotatedH/2,w:m.rotatedW,h:m.rotatedH};
  });
  assert.ok(bounds.every(b=>b.x>image.x+image.w));
  for(let i=1;i<bounds.length-1;i++)assert.ok(bounds[i+1].y>=bounds[i].y+bounds[i].h);
  assert.ok(objects[2].leaderRoutes[0].target.x>image.x+image.w);
  assert.equal(objects[3].leaderRoutes,undefined);
  for(const o of objects){assert.equal(o.locked,false);assert.equal(o.aiTargetReviewRequired,true);assert.equal(o.aiParentImageId,image.id);assert.equal(o.aiTaskId,'task');}
  assert.equal(JSON.stringify(p),before);
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(objects))[2].leaderRoutes),JSON.stringify(objects[2].leaderRoutes));
  vm.runInContext('const MAX_UNDO=60;let _idCounter=0;',context);
  context.getLastMouseWorld=()=>null;context.rebuildGroups=()=>{};
  vm.runInContext(source.slice(source.indexOf('function fitToArtboard('),source.indexOf('\nfunction targetStateFingerprint(')),context);
  vm.runInContext(source.slice(source.indexOf('function applyLabelPlacementReview('),source.indexOf('\nfunction autoLabelsForImage(')),context);
  vm.runInContext(source.slice(source.indexOf('function insertImageObject('),source.indexOf('\nexport async function insertImageFromSrc(')),context);
  p.reviewDraft.origin='user-review-edit';p.qualityReview={verdict:'fail',issues:[]};
  const s={objects:[],artboard:{w:200,h:100},undoStack:[],redoStack:[],activeLayerId:'layer'};
  const id=context.insertImageObject({get:()=>s,update:action=>action(s)},png,{w:100,h:50},
    {centerArtboard:true,editableLabelPlan:p,aiTaskId:'task',aiCandidateId:'candidate'});
  const background=s.objects.find(o=>o.id===id);
  assert.equal(background.src,png);assert.equal(background.imageSelectionLocked,true);
  assert.equal(background.aiLabelEditingBackground,true);assert.equal(background.exportable,true);
  assert.ok(!s.selectedIds.includes(id));assert.equal(s.selectedIds.length,0);
  assert.equal(s.undoStack.length,1);assert.equal(s.undoStack[0].length,0);
  assert.equal(JSON.parse(JSON.stringify(s.objects))[0].imageSelectionLocked,true);
});
