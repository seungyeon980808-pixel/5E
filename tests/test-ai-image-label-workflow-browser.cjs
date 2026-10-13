// Retained source 6e2c55012461859cdc8afb4d9596d3f08d5409b4; synthetic responses under current classification/scoped-edit contracts.
// Original source/RAW PNG fixtures stay unchanged. No actual AI quality verdict is claimed.
const { installLabelSourcePage, armSelection, selectionArrived } = require('./helpers/label-source-browser.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {fixture,plan,verifiedPlan,report,placement,sends,snapshot,emit,choose,finish,jointResponse} = require('./helpers/label-source-browser.cjs');
const evidenceRoot = process.env.EVIDENCE_DIR || path.resolve(__dirname,'../.omo/evidence/auto-labeler-implementation-20261004/harness/workflow');
const observations = requests => requests.filter(r=>r.text.includes('입력 원본 라벨 관찰'));
const generations = requests => requests.filter(r=>r.purpose==='image');
const mappings = requests => requests.filter(r=>r.text.includes('최종 RAW 후보다'));
function evidenceFor(id) {const dir=path.join(evidenceRoot,id);fs.mkdirSync(dir,{recursive:true});return dir;}
function record(dir,value) {fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({paidAiCalls:0,evidenceType:'synthetic bridge / real browser UI',...value},null,2));}
async function candidate(page) {return (await snapshot(page))[0].generated.at(-1);}
async function pixelEvidence(page,c) {
  return page.evaluate(async c=>{
    const {decodeScopedPng}=await import('/js/ai-scoped-edit-png.js?v=1.7.0-four-session-integration');
    const {buildExamLabelRemovalMasks}=await import('/js/ai-exam-label-removal.js?v=1.7.0-four-session-integration');
    const bytes=data=>Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));
    const source=await decodeScopedPng(bytes(window.__task2.original));
    const output=await decodeScopedPng(bytes(c.data));
    const {mask}=buildExamLabelRemovalMasks(c.sourceLabelPlan,source.width,source.height);
    let outsideChanged=0,insideChanged=0,annotationInkRemaining=0;
    for(let i=0;i<mask.length;i++) {
      const differs=[0,1,2,3].some(k=>source.data[i*4+k]!==output.data[i*4+k]);
      if(differs) {if(mask[i])insideChanged++;else outsideChanged++;}
      if(mask[i] && [0,1,2].some(k=>output.data[i*4+k]!==255)) annotationInkRemaining++;
    }
    const sample=(x,y)=>Array.from(output.data.slice((y*source.width+x)*4,(y*source.width+x)*4+4));
    return {outsideChanged,insideChanged,annotationInkRemaining,scientificArrow:sample(150,284),uncertainMark:sample(417,287),labelPixel:sample(330,230),endpointPixel:sample(260,192)};
  },c);
}
async function insertAndEdit(page,{restore}) {
  await page.locator('#ai-image-panel [data-ai-insert-selected]').click();
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel').hidden);
  const before=await page.evaluate(async()=>{
    const v='?v=1.7.0-four-session-integration';
    const {state}=await import('/js/state.js'+v);
    const {serialize,applyLoaded}=await import('/js/project-io.js'+v);
    const {undo,redo}=await import('/js/transform.js'+v);
    window.__workflowQA={state,serialize,applyLoaded,undo,redo};
    state.update(s=>{s.selectedIds=[];s.activeTool='V';});
    return structuredClone(state.get().objects.filter(o=>o.aiAutoLabel));
  });
  assert.equal(before.length,restore?1:0,'Only editable restoration creates native labels');
  if(!restore)return {nativeCount:0};
  const point=await page.evaluate(async id=>{const {worldToScreen}=await import('/js/viewport.js?v=1.7.0-four-session-integration');const s=window.__workflowQA.state.get(),o=s.objects.find(o=>o.id===id);return worldToScreen(document.querySelector('#canvas'),s.viewBox,o.p2.x,o.p2.y);},before[0].id);
  await armSelection(page,before[0].id);
  // Native output is an image/label group. Shift selects its individual label
  // before exercising the existing select-then-click text editing gesture.
  await page.keyboard.down('Shift');await page.mouse.click(point.x,point.y);await page.keyboard.up('Shift');await selectionArrived(page);
  await page.mouse.click(point.x,point.y);
  const editor=page.locator('.ai-inline-label-editor');await editor.waitFor({state:'visible'});
  assert.equal(await page.locator('.unified-text-editor').count(),0,'Select then click edits inline; detailed formatting has an explicit entry');
  assert.equal(await editor.inputValue(),'전자');
  await editor.fill('편집한 전자');await editor.press('Enter');
  const result=await page.evaluate(id=>{const q=window.__workflowQA,o=()=>q.state.get().objects.find(o=>o.id===id);const edited=structuredClone(o());q.undo(q.state);const undone=o().text;q.redo(q.state);const redone=o().text;const saved=q.serialize(q.state.get());q.applyLoaded(q.state,JSON.parse(JSON.stringify(saved)));return{nativeCount:1,edited,undone,redone,reopened:structuredClone(o())};},before[0].id);
  assert.equal(result.undone,'전자');assert.equal(result.redone,'편집한 전자');assert.equal(result.reopened.text,'편집한 전자');
  assert.deepEqual(result.reopened.leaderRoutes,result.edited.leaderRoutes);
  return result;
}

for(const imageKind of ['exam','general'])for(const labelResult of ['remove','restore-editable']) {
  const id=`${imageKind}-${labelResult}`;
  test(`workflow matrix ${id}: UI choices, frozen source, bounded calls, RAW pixels and native roundtrip`,{timeout:90000},async t=>{
    const dir=evidenceFor(id);const {page,errors}=await fixture(t,1,dir,{initialGeneration:true});
    await choose(page,imageKind,labelResult);
    assert.equal(await page.locator('[data-ai-precise-restore]').isChecked(),false);
    if(imageKind==='exam')assert.equal(await page.locator('[data-ai-precise-restore]').isDisabled(),true);
    await page.locator('#ai-image-panel [data-ai-send]').click();
    await finish(page);
    const requests=await sends(page),c=await candidate(page);
    record(dir,{requests,c,errors}); // Preserve the actual result even if a contract assertion fails.
    assert.ok(c,'A completed request has a candidate');
    assert.equal(observations(requests).length,1);assert.equal(generations(requests).length,imageKind==='exam'?0:1);
    assert.equal(mappings(requests).length,0,'Current joint verification confirms placement and review in one Luna turn');
    if (imageKind === 'general') {
      const sent = generations(requests)[0];
      assert.match(sent.text,/SOURCE-GRID-TRACING/);
      assert.match(sent.text,/이미지 편집 대상으로 전달/);
      assert.match(sent.text,/필요한 회색 채움·음영을 허용/);
      assert.match(sent.text,/원본 프레임:.*512.*384/);
      const sourceAttachment=await page.evaluate(()=>window.__task2.sends.find(s=>s.payload.purpose==='image').payload.attachments[0]);
      assert.equal(sourceAttachment.name,'INPUT_SOURCE.png');
      assert.equal(c.workflowMetrics.generationHarness.sourceTracingVersion,'1.2.0');
      assert.ok(requests.some(r=>r.text.includes('[5e-source-relations v1.2.0]')));
    }
    assert.equal(c.imageLabelWorkflow.imageKind,imageKind);assert.equal(c.imageLabelWorkflow.labelResult,labelResult);
    assert.equal(c.sourceLabelPlan.frozen,true);assert.equal(c.sourceLabelPlan.labels[0].text,'전자');
    assert.ok(c.sourceLabelPlan.sourceBindings?.length);assert.ok(c.workflowMetrics?.timings);assert.ok(c.workflowMetrics?.calls);
    assert.equal(c.imageLabelWorkflow.scientificArrows,'keep');assert.equal(c.workflowMetrics.calls.review,1);
    assert.equal(requests.length,2+(imageKind==='general'?1:0),'Exactly one source analysis, one final verification and only the required generation');
    const hashes=await page.evaluate(async c=>{const {imageLabelDigest}=await import('/js/ai-image-label-run.js?v=1.7.0-four-session-integration');return{source:await imageLabelDigest(window.__task2.original),plan:await imageLabelDigest(JSON.stringify(c.sourceLabelPlan)),candidate:await imageLabelDigest(c.data)};},c);
    assert.equal(c.sourceSha256,hashes.source);assert.equal(c.planSha256,hashes.plan);assert.equal(c.candidateSha256,hashes.candidate);
    assert.equal(c.sourceLabelPlan.sourceBindings[0].transportSha256,hashes.source);
    assert.equal(c.sourceFrame.width,512);assert.equal(c.sourceFrame.height,384);
    assert.equal(c.sourceFrame.coordinateSystem,'normalized-0-1');
    assert.deepEqual(c.candidateFrame,{width:512,height:384,coordinateSystem:'normalized-0-1'});
    if(labelResult==='restore-editable') {assert.equal(c.targetPlacement?.candidateSha256,c.candidateSha256);assert.equal(c.targetPlacement?.planSha256,c.planSha256);assert.equal(c.labelPlan.labels[0].text,'전자');}
    else assert.ok(!c.labelPlan?.labels?.length);
    const pixels=imageKind==='exam'?await pixelEvidence(page,c):null;
    if(pixels) {assert.equal(pixels.outsideChanged,0);assert.ok(pixels.insideChanged>0);assert.equal(pixels.annotationInkRemaining,0);assert.deepEqual(pixels.scientificArrow,[17,17,17,255]);assert.deepEqual(pixels.uncertainMark,[17,17,17,255]);}
    await page.screenshot({path:path.join(dir,'completed.png')});
    const native=await insertAndEdit(page,{restore:labelResult==='restore-editable'});
    await page.screenshot({path:path.join(dir,'native-result.png')});
    assert.deepEqual(errors,[]);
    record(dir,{requests,c,pixels,native,errors});
  });
}

test('relation failures retain the exact changed connection in review without automatic regeneration',{timeout:90000},async t=>{
  const dir=evidenceFor('relation-failure');const {page,errors}=await fixture(t,1,dir,{initialGeneration:true});
  await choose(page,'general','remove');await page.locator('#ai-image-panel [data-ai-send]').click();
  await page.waitForFunction(()=>window.__task2.sends.length===1);await emit(page,0,'assistant',JSON.stringify(verifiedPlan));
  await page.waitForFunction(()=>window.__task2.sends.length===2);await emit(page,1,'image');
  await page.waitForFunction(()=>window.__task2.sends.length===3);
  const failed=JSON.parse(report());failed.verdict='fail';
  const detail='원본 전원 오른쪽 단자→전류 센서 연결이 후보에서 전압 센서로 바뀌었습니다.';
  Object.assign(failed.checks.find(c=>c.id==='connections'),{status:'fail',detail});
  failed.issues=[{checkId:'connections',message:detail,severity:'critical'}];
  await emit(page,2,'assistant',JSON.stringify(failed));
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiBusy==='false');
  const c=await candidate(page),requests=await sends(page);
  assert.equal(c.reviewState,'needs-attention');assert.equal(c.reviewReport.verdict,'fail');
  assert.ok(c.reviewReport.issues.some(issue=>issue.message===detail));assert.equal(requests.length,3);assert.equal(generations(requests).length,1);
  assert.equal(await page.locator('#ai-image-panel [data-ai-insert-selected]').isEnabled(),true,'the user still decides whether to adopt a reviewed result');
  assert.deepEqual(errors,[]);record(dir,{c,requests,errors});
});

test('workflow cancel/retry: late analysis cannot mutate candidate; explicit retry only',{timeout:90000},async t=>{
  const dir=evidenceFor('cancel-retry');const {page,errors}=await fixture(t,1,dir,{initialGeneration:true});
  await choose(page,'exam','remove');await page.locator('#ai-image-panel [data-ai-send]').click();
  await page.waitForFunction(()=>window.__task2.sends.length===1);await page.locator('#ai-image-panel [data-ai-interrupt]').click();
  await emit(page,0,'assistant',JSON.stringify(plan));await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiBusy==='false');
  assert.equal((await snapshot(page))[0].generated.length,0);assert.equal((await sends(page)).length,1);
  await page.locator('#ai-image-panel [data-ai-send]').click();await finish(page,{startIndex:1});
  const c=await candidate(page),requests=await sends(page);assert.ok(c);assert.equal(generations(requests).length,0);assert.deepEqual(errors,[]);
  const requestTiers=await page.evaluate(()=>window.__task2.sends.map(request=>request.payload.serviceTier));
  assert.ok(requestTiers.every(tier=>tier==='priority'),'Initial and retry requests keep the fixed fast tier');
  await page.screenshot({path:path.join(dir,'retry-result.png')});record(dir,{c,requests,errors});
});

test('workflow unlabeled exam: zero invented native objects and identical source pixels',{timeout:90000},async t=>{
  const dir=evidenceFor('unlabeled');const {page,errors}=await fixture(t,1,dir,{initialGeneration:true,unlabeled:true});
  const empty={...plan,labels:[],removalRegions:[],uncertainties:[]};
  await choose(page,'exam','restore-editable');await page.locator('#ai-image-panel [data-ai-send]').click();await finish(page,{sourcePlan:empty});
  const c=await candidate(page),requests=await sends(page);assert.ok(c);assert.equal(c.sourceLabelPlan.labels.length,0);assert.equal(generations(requests).length,0);
  const pixels=await pixelEvidence(page,c);assert.equal(pixels.outsideChanged,0);assert.equal(pixels.insideChanged,0);
  assert.equal(c.data,await page.evaluate(()=>window.__task2.original),'Unlabeled exam retains exact source PNG bytes, not just matching pixels');
  assert.equal(c.removalReport.status,'out-of-scope');assert.equal(c.removalReport.changedPixels,0);
  assert.equal(c.labelPlan,null);assert.equal(c.editableDraft,null);assert.notEqual(c.reviewState,'passed');
  assert.equal(c.reviewReport.scopeOutcome,'no-general-labels-source-preserved');
  const insert=page.locator('#ai-image-panel [data-ai-insert-selected]');
  assert.equal(await insert.isVisible(),true);assert.equal(await insert.isDisabled(),true,'Source-preserved out-of-scope result cannot be inserted as an approved reconstruction');
  assert.equal(await page.locator('#ai-image-panel [data-ai-edit-review-draft]').isVisible(),false,'Zero observed labels cannot invent an editable draft');
  const hold=page.locator('#ai-image-panel [data-ai-status]');
  const holdReason=await hold.textContent();
  assert.equal(await hold.isVisible(),true);assert.match(holdReason,/원본.*(?:보존|유지)/s);assert.match(holdReason,/라벨.*(?:대상.*0개|없)/s);
  // Native click on a disabled button must remain inert, without bypassing it.
  const objectsBefore=await page.evaluate(async()=>structuredClone((await import('/js/state.js?v=1.7.0-four-session-integration')).state.get().objects));
  await insert.evaluate(button=>button.click());
  const objectsAfter=await page.evaluate(async()=>structuredClone((await import('/js/state.js?v=1.7.0-four-session-integration')).state.get().objects));
  assert.deepEqual(objectsAfter,objectsBefore);assert.equal(objectsAfter.length,0,'Blocked insertion adds no image or native label objects');
  assert.equal((await sends(page)).length,1,'Only the source observation is necessary; no review/generation of an unchanged source');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(dir,'unlabeled-insertion-blocked.png')});record(dir,{c,requests,pixels,holdReason,objectsBefore,objectsAfter,errors});
  assert.doesNotMatch(holdReason,/그래프/,'An unlabeled science fixture cannot claim that graph-owned labels were observed');

});

test('workflow recovery: choices, source plan and candidate bindings survive reload without calls',{timeout:90000},async t=>{
  const dir=evidenceFor('recovery');const {page,errors}=await fixture(t,1,dir,{initialGeneration:true});
  await choose(page,'general','restore-editable');await page.locator('#ai-image-panel [data-ai-send]').click();await finish(page);
  const before=await candidate(page);
  assert.equal(before.sourceFrame.width,512);assert.equal(before.sourceFrame.height,384);
  const beforeObservation=(await snapshot(page))[0].sourceLabelObservation;
  assert.deepEqual(beforeObservation.sourceFrame,before.sourceFrame);
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('#ai-image-install-open').click();
  await page.waitForFunction(()=>document.querySelectorAll('#ai-image-panel .ai-generated-card').length===1);
  const after=await candidate(page);assert.deepEqual(after.imageLabelWorkflow,before.imageLabelWorkflow);assert.deepEqual(after.sourceLabelPlan,before.sourceLabelPlan);assert.deepEqual(after.targetPlacement,before.targetPlacement);
  assert.deepEqual(after.sourceFrame,before.sourceFrame);assert.deepEqual(after.candidateFrame,before.candidateFrame);
  assert.deepEqual((await snapshot(page))[0].sourceLabelObservation.sourceFrame,beforeObservation.sourceFrame);
  assert.equal((await sends(page)).length,0);assert.equal(await page.locator('#ai-image-panel [data-ai-image-kind]').inputValue(),'general');assert.equal(await page.locator('#ai-image-panel [data-ai-label-result]').inputValue(),'restore-editable');
  assert.deepEqual(errors,[]);await page.screenshot({path:path.join(dir,'recovered.png')});record(dir,{before,after,requests:await sends(page),errors});
});

test('workflow explicit choices: legacy workspace cannot silently dispatch an image request',{timeout:30000},async t=>{
  const dir=evidenceFor('explicit-choices');const {page,errors}=await fixture(t,1,dir,{initialGeneration:true});
  assert.equal(await page.locator('#ai-image-panel [data-ai-image-kind]').inputValue(),'');
  assert.equal(await page.locator('#ai-image-panel [data-ai-label-result]').inputValue(),'');
  const send=page.locator('#ai-image-panel [data-ai-send]');
  const disabled=await send.isDisabled();if(!disabled)await send.click();
  assert.equal((await sends(page)).length,0,'A legacy workspace cannot infer exam/general or label result');
  await page.screenshot({path:path.join(dir,'explicit-choices-required.png')});record(dir,{disabled,requests:await sends(page),errors});assert.deepEqual(errors,[]);
});

test('workflow uncertainty: even a proposed confirmed mask cannot erase an uncertain source region',{timeout:90000},async t=>{
  const dir=evidenceFor('uncertainty');const {page,errors}=await fixture(t,1,dir,{initialGeneration:true});
  const uncertain={...plan,removalRegions:[...plan.removalRegions,{id:'unsafe-mark',labelId:'source-label',sourceRef:1,ownership:'confirmed',kind:'polygon',component:'endpoint',method:'flat-background',points:[{x:408/512,y:278/384},{x:430/512,y:278/384},{x:430/512,y:298/384},{x:408/512,y:298/384}]}]};
  await choose(page,'exam','remove');await page.locator('#ai-image-panel [data-ai-send]').click();await finish(page,{sourcePlan:uncertain});
  const c=await candidate(page),pixels=await pixelEvidence(page,c);
  assert.equal(pixels.outsideChanged,0);assert.deepEqual(pixels.uncertainMark,[17,17,17,255]);assert.notEqual(c.reviewState,'passed');
  assert.ok(c.removalReport.issues.some(issue=>issue.code==='uncertain-overlap'));
  assert.equal(generations(await sends(page)).length,0);assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(dir,'uncertain-preserved.png')});record(dir,{c,pixels,requests:await sends(page),errors});
});

test('workflow selected scoped edit: explicit apply preserves source observation and RAW without full reanalysis',{timeout:120000},async t=>{
  const dir=evidenceFor('selected-scoped-edit');const {page,errors}=await fixture(t,1,dir,{initialGeneration:true});
  await choose(page,'general','remove');await page.locator('#ai-image-panel [data-ai-send]').click();await finish(page);
  const first=await candidate(page),firstRequests=await sends(page),observation=(await snapshot(page))[0].sourceLabelObservation;
  assert.equal(generations(firstRequests).length,1);assert.equal(observations(firstRequests).length,1);
  assert.equal(await page.locator('#ai-image-panel [data-ai-send]').isVisible(),false,'Selected PNG uses the approved box-edit UI');
  const apply=page.locator('#ai-image-panel [data-ai-comments-apply]');
  assert.equal(await apply.isVisible(),true);assert.equal(await apply.isDisabled(),true,'No boxes means no authorized edit');
  await apply.evaluate(button=>button.click());assert.equal((await sends(page)).length,firstRequests.length);
  await page.locator('#ai-image-panel [data-ai-comment-tool="area"]').click();
  const image=page.locator('#ai-image-panel .ai-generated-card .ai-preview-stage > img').first();
  const rect=await image.boundingBox();assert.ok(rect);
  await page.mouse.move(rect.x+rect.width*.55,rect.y+rect.height*.15);await page.mouse.down();
  await page.mouse.move(rect.x+rect.width*.7,rect.y+rect.height*.3);await page.mouse.up();
  const editor=page.locator('#ai-image-panel [data-ai-comment-row][data-active="true"] [data-ai-inline-editor]');
  await editor.fill('박스 안에 검은 점 하나를 추가하고 나머지는 보존해 주세요.');
  assert.equal(await apply.isEnabled(),true);
  const comment=(await snapshot(page))[0].generated.find(c=>c.id===first.id).comments[0];
  assert.equal(comment.type,'area');assert.ok(comment.text);assert.equal(comment.imageId,first.id);
  const sourceHash=first.candidateSha256;
  for(const decision of ['취소','적용']) {
    const startIndex=(await sends(page)).length;
    await apply.click();await page.waitForFunction(n=>window.__task2.sends.length===n,startIndex+1);
    const payload=await page.evaluate(index=>window.__task2.sends[index].payload,startIndex);
    assert.equal(payload.purpose,'image');assert.equal(payload.attachments.length,1);
    assert.equal(payload.attachments[0].data,first.data,'Each explicit attempt edits the original selected RAW, never a cancelled candidate');
    // A narrowly defined synthetic dot edits only the explicitly drawn box.
    const controlled=await page.evaluate(async({data,comment})=>{
      const {decodeScopedPng,encodeScopedPng}=await import('/js/ai-scoped-edit-png.js?v=1.7.0-four-session-integration');
      const bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0)),image=await decodeScopedPng(bytes),pixels=new Uint8Array(image.data);
      const px=Math.round((comment.x+comment.w/2)/100*image.width),py=Math.round((comment.y+comment.h/2)/100*image.height);
      for(let y=py-2;y<=py+2;y++)for(let x=px-2;x<=px+2;x++)pixels.set([0,0,0,255],(y*image.width+x)*4);
      const encoded=await encodeScopedPng({...image,data:pixels},{metadata:image.metadata});
      let binary='';for(const byte of encoded)binary+=String.fromCharCode(byte);
      return 'data:image/png;base64,'+btoa(binary);
    },{data:first.data,comment});
    await emit(page,startIndex,'image',controlled);
    const comparison=page.locator('dialog[open] [data-ai-scoped-edit-comparison]');await comparison.waitFor({state:'visible'});
    assert.equal((await snapshot(page))[0].generated.length,1,'Comparison cannot apply an unapproved version');
    assert.equal((await sends(page)).length,startIndex+1,'Review comparison never triggers an automatic generation or source analysis');
    await page.locator('dialog[open]').getByRole('button',{name:decision,exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiBusy==='false');
    const tab=(await snapshot(page))[0];
    assert.equal(tab.generated.find(c=>c.id===first.id).data,first.data);assert.equal(tab.generated.find(c=>c.id===first.id).candidateSha256,sourceHash);
    assert.deepEqual(tab.sourceLabelObservation,observation,'A scoped edit retains the exact frozen source observation and its budget');
    assert.equal(tab.generated.length,decision==='취소'?1:2);
    assert.equal(tab.generated.find(c=>c.id===first.id).scopedEditHistory.at(-1).status,decision==='취소'?'cancelled':'applied');
  }
  const edited=await candidate(page),requests=await sends(page);
  assert.notEqual(edited.id,first.id);assert.equal(edited.reviewState,'scoped-applied');
  const pixels=await page.evaluate(async({before,after,comment})=>{
    const {decodeScopedPng}=await import('/js/ai-scoped-edit-png.js?v=1.7.0-four-session-integration');
    const decode=data=>decodeScopedPng(Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0)));
    const a=await decode(before),b=await decode(after);let insideChanged=0,outsideChanged=0;
    for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++) {
      const i=(y*a.width+x)*4;if(![0,1,2,3].some(k=>a.data[i+k]!==b.data[i+k]))continue;
      const inside=x>=Math.floor(comment.x/100*a.width)&&x<Math.ceil((comment.x+comment.w)/100*a.width)&&y>=Math.floor(comment.y/100*a.height)&&y<Math.ceil((comment.y+comment.h)/100*a.height);
      if(inside)insideChanged++;else outsideChanged++;
    }
    return {insideChanged,outsideChanged};
  },{before:first.data,after:edited.data,comment});
  assert.equal(pixels.outsideChanged,0);assert.equal(pixels.insideChanged,25);
  assert.equal(observations(requests).length,1);assert.equal(generations(requests).length,3,'One initial generation plus two explicitly requested scoped attempts');
  assert.equal(requests.length,firstRequests.length+2);assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(dir,'scoped-applied.png')});record(dir,{first,edited,observation,requests,pixels,errors});
});


test('workflow mixed batch: exam remove and general editable retain independent policies',{timeout:120000},async t=>{
  const dir=evidenceFor('mixed-batch');const {page,errors}=await fixture(t,2,dir,{initialGeneration:true});
  await choose(page,'exam','remove');
  await page.locator('#ai-image-panel [data-tab-id="task-1"] .ai-task-tab-select').click();
  await choose(page,'general','restore-editable');
  await page.locator('#ai-image-panel [data-tab-id="task-0"] .ai-task-tab-select').click({modifiers:['Meta']});
  assert.match(await page.locator('#ai-image-panel [data-ai-selection-count]').textContent(),/2개 선택/);
  await page.locator('#ai-image-panel [data-ai-send]').click();
  let next=0;
  for(let step=0;step<20;step++) {
    await page.waitForFunction(next=>window.__task2.sends.length>next || window.__task2Manager.workspaceBatchState().filter(j=>j.state==='completed').length===2,next);
    const requests=await sends(page);if(requests.length===next)break;
    const req=requests[next];
    if(req.purpose==='image')await emit(page,next,'image');
    else if(req.text.includes('고정 후보: '))await emit(page,next,'assistant',jointResponse(req.text));
    else if(req.text.includes('최종 RAW 후보다'))await emit(page,next,'assistant',placement());
    else if(req.text.includes('입력 원본 라벨 관찰'))await emit(page,next,'assistant',JSON.stringify(verifiedPlan));
    else await emit(page,next,'assistant',report());
    next++;
  }
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().filter(j=>j.state==='completed').length===2);
  const tabs=await snapshot(page),requests=await sends(page);
  assert.equal(tabs.length,2);assert.equal(requests.length,5);assert.equal(observations(requests).length,2);assert.equal(generations(requests).length,1);assert.equal(mappings(requests).length,0);
  const exam=tabs.find(t=>t.generated.at(-1).imageLabelWorkflow.imageKind==='exam').generated.at(-1);
  const general=tabs.find(t=>t.generated.at(-1).imageLabelWorkflow.imageKind==='general').generated.at(-1);
  assert.equal(exam.imageLabelWorkflow.labelResult,'remove');assert.ok(!exam.labelPlan?.labels?.length);
  assert.equal(general.imageLabelWorkflow.labelResult,'restore-editable');assert.equal(general.labelPlan.labels.length,1);
  assert.deepEqual(errors,[]);await page.screenshot({path:path.join(dir,'mixed-batch.png')});record(dir,{tabs,requests,errors});
});
