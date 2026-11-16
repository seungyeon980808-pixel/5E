// Fixed label source: 6e2c55012461859cdc8afb4d9596d3f08d5409b4; current-contract adaptations retain behavior oracles.
const { installLabelSourcePage } = require('./helpers/label-source-browser.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const evidence = process.env.EVIDENCE_DIR || path.resolve(__dirname, '../.omo/evidence/codex-continuation-20261010/label-current-contracts/ai-label-composite');
// Use the parent's running candidate; preserve its query when choosing an entry.
function entryUrl() {
  const supplied = process.env.RELEASE_URL || process.env.EXAM_URL || process.env.PREVIEW_URL;
  assert.ok(supplied, 'RELEASE_URL, EXAM_URL or PREVIEW_URL is required; this test never starts a server');
  const entry = new URL(supplied);
  if (process.env.APP_ENTRY) entry.pathname = process.env.APP_ENTRY;
  return entry.href;
}

test('actual native labels produce an opaque, bound composite with measurable glyphs', { timeout: 60000 }, async () => {
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();await installLabelSourcePage(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(entryUrl(), { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(async () => {
      const { createEditableLabelComposite } = await import('/js/ai-label-composite.js?v=1.7.0-four-session-integration');
      const c = document.createElement('canvas'); c.width = 600; c.height = 400;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,600,400); ctx.fillStyle = '#000'; ctx.fillRect(40,280,60,20);
      const source = c.toDataURL('image/png');
      const plan = { version: 3, uncertainties: [], labels: [
        { id:'word', text:'편집 라벨', scope:'general', mode:'text', contentMode:'plain', position:{x:.5,y:.25}, anchor:{x:.5,y:.25}, typography:{role:'text',bounds:{x:.35,y:.2,w:.3,h:.1}} },
        { id:'quantity', text:'m_B', scope:'general', mode:'leader', contentMode:'formula', position:{x:.65,y:.6}, anchor:{x:.12,y:.725}, typography:{role:'quantity',bounds:{x:.57,y:.55,w:.16,h:.1}},leaderArrowHead:'target' },
        { id:'graph', text:'graph excluded', scope:'graph', mode:'text', contentMode:'plain', position:{x:.1,y:.1}, anchor:{x:.1,y:.1}, typography:{role:'text'} }
      ] };
      const result = await createEditableLabelComposite({plan,candidateDataUrl:source,artboard:{w:210,h:297}});
      const i = new Image(); i.src=result.attachment.data; await i.decode(); ctx.clearRect(0,0,600,400);ctx.drawImage(i,0,0);
      const pixels=ctx.getImageData(0,0,600,400).data;
      let opaque=true,darkLabelPixels=0; for(let y=0;y<400;y++)for(let x=0;x<600;x++){const p=(y*600+x)*4; if(pixels[p+3]!==255)opaque=false;if(y<150&&pixels[p]<150)darkLabelPixels++;}
      return {...result,opaque,darkLabelPixels};
    });
    fs.writeFileSync(path.join(evidence,'composite.png'), Buffer.from(result.attachment.data.split(',')[1],'base64'));
    delete result.attachment;
    fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(result,null,2));
    assert.equal(result.objects.length,2);assert.equal(result.report.measurements.length,2);
    assert.ok(result.report.measurements.every(m=>m.glyphBounds?.w>0));
    assert.ok(result.report.measurements.every(m=>Object.values(m.actual).every(Number.isFinite)));
    assert.ok(result.report.measurements.every(m=>m.presentation.fontFamily && m.presentation.fontSizeMm>0));
    const quantity = result.report.measurements.find(m=>m.id==='quantity');
    assert.ok(quantity.presentation.runs.some(r=>r.contentMode==='formula' && r.fontFamily.includes('Latin Modern')));
    assert.equal(result.report.policy,'5e-standard-v1');
    assert.equal(result.opaque,true); assert.ok(result.darkLabelPixels>100);
    assert.match(result.bindings.compositeSha256,/^[a-f0-9]{64}$/);
    assert.equal(result.report.visualReviewRequired,true);assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(evidence,'errors.json'),JSON.stringify(errors));
  } finally { await browser.close(); }
});

test('reviewed native placement size gates insertion and replacement while retaining labels and history', {timeout:60000}, async()=>{
 fs.mkdirSync(evidence,{recursive:true});const browser=await chromium.launch({headless:true});
 try{const page=await browser.newPage();await installLabelSourcePage(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(entryUrl(),{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  const v='?v=1.7.0-four-session-integration';const {state}=await import('/js/state.js'+v),{applyLoaded,serialize}=await import('/js/project-io.js'+v),{insertImageFromSrc,prepareImageCandidateRevision}=await import('/js/image-paste.js'+v),{undo,redo,rebuildGroups}=await import('/js/transform.js'+v),{createCandidateMaterializer}=await import('/js/ai-candidate-materializer.js'+v),{createEditableLabelComposite}=await import('/js/ai-label-composite.js'+v);
  let revisionPreparations = 0;
  const materialize = createCandidateMaterializer(state, {insertImageFromSrc, rebuildGroups,
    prepareImageCandidateRevision: async (...args) => { revisionPreparations++; return prepareImageCandidateRevision(...args); },
  });
  const transactionSnapshot = () => JSON.stringify({activePageId:state.get().activePageId,objects:state.get().objects,groups:state.get().groups,selectedIds:state.get().selectedIds,targetedId:state.get().targetedId,activeTool:state.get().activeTool,undo:state.get().undoStack,redo:state.get().redoStack});
  async function rejected(action, expected) {
    const before = transactionSnapshot();
    let message;
    try { await action(); } catch (error) {
      if (expected && !expected.test(error.message)) throw error;
      message = error.message;
    }
    if (!message) throw new Error('Expected replacement rejection');
    if (transactionSnapshot() !== before) throw new Error('Rejected replacement changed objects, selection or history');
    return {message, unchanged:true};
  }
  applyLoaded(state,{version:'0.17',pages:[{id:'placement',objects:[],groups:[],artboard:{w:210,h:297}}],activePageId:'placement'});
  const canvas=document.createElement('canvas');canvas.width=600;canvas.height=400;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,600,400);ctx.fillStyle='#000';ctx.fillRect(30,50,70,70);const src=canvas.toDataURL();
  const plan={version:4,frozen:true,reviewRequired:false,uncertainties:[],labels:[{id:'label',text:'검수 글자',mode:'text',scope:'general',contentMode:'plain',position:{x:.5,y:.2},anchor:{x:.5,y:.2},typography:{role:'text',bounds:{x:.4,y:.16,w:.2,h:.08}}}]};
  const composite=await createEditableLabelComposite({plan,candidateDataUrl:src,artboard:state.get().artboard});
  // Synthetic fixture verdict only: this is not real AI approval. Placement
  // dimensions are the actual renderer's binding; no provider is called.
  plan.qualityReview={verdict:'pass',issues:[],checks:[],compositeBindings:composite.bindings};
  const options={aiTaskId:'placement-task',aiCandidateId:'first',editableLabelPlan:plan,preserveBytes:true};
  const id=await insertImageFromSrc(state,src,options);const object=()=>state.get().objects.find(o=>o.id===id);const matching=structuredClone(object());
  state.update(s=>{const image=s.objects.find(o=>o.id===id);image.w*=.5;image.h*=.5;s.selectedIds=[id];});
  const genericRejected = await rejected(() => insertImageFromSrc(state,src,{...options,aiCandidateId:'replacement',replaceId:id}), /잠긴 이미지는 교체할 수 없습니다/);
  const wrongOwnerRejected = await rejected(() => materialize({id:'replacement',data:src,labelPlan:plan},{taskId:'another-task',replaceId:id}), /소유한 편집 원본/);
  const staleRejected = await rejected(() => materialize({id:'replacement',data:src,labelPlan:plan},{taskId:'placement-task',replaceId:id,isCurrent:()=>false}), /준비 중/);
  // B3/F1: replacement privilege applies to the whole owned cluster. Each
  // protected child must block the same otherwise-valid candidate atomically.
  // The guard's localized message is diagnostic; rejection, no preparation
  // and exact live document/history preservation are the behavior oracles.
  const lockedChildRejected = [];
  const childId = state.get().objects.find(o => o.aiAutoLabel && o.aiParentImageId === id && o.aiTaskId === 'placement-task' && o.aiCandidateId === 'first')?.id;
  if (!childId) throw new Error('Missing owned native child for whole-cluster lock probe');
  for (const flag of ['locked', 'positionLocked']) {
    const original = structuredClone(state.get().objects.find(o => o.id === childId));
    state.update(s => { s.objects.find(o => o.id === childId)[flag] = true; });
    const preparationsBefore = revisionPreparations;
    const rejection = await rejected(() => materialize({id:'replacement',data:src,labelPlan:plan},{taskId:'placement-task',replaceId:id,isCurrent:()=>true}));
    if (revisionPreparations !== preparationsBefore) throw new Error(`Protected child ${flag} reached native preparation`);
    lockedChildRejected.push({flag,childId,...rejection,preparationDelta:revisionPreparations-preparationsBefore});
    state.update(s => { const child=s.objects.find(o => o.id === childId); if (Object.hasOwn(original,flag)) child[flag]=original[flag]; else delete child[flag]; });
  }
  const beforeReplacementUndo = state.get().undoStack.length;
  const replaced = await materialize({id:'replacement',data:src,labelPlan:plan},{taskId:'placement-task',replaceId:id,isCurrent:()=>true});
  const replacementUndoDelta = state.get().undoStack.length - beforeReplacementUndo;
  const changed=structuredClone(object()),labels=structuredClone(state.get().objects.filter(o=>o.aiParentImageId===id));
  undo(state);const undone=structuredClone(object());redo(state);const redone=structuredClone(object());const project=serialize(state.get());applyLoaded(state,JSON.parse(JSON.stringify(project)));const reopened=structuredClone(object());
  state.update(s=>{s.artboard={w:105,h:148.5};s.selectedIds=[];});
  const smallId=await insertImageFromSrc(state,src,{...options,aiCandidateId:'smaller-new'});const smallerNew=structuredClone(state.get().objects.find(o=>o.id===smallId));
  state.update(s=>{s.artboard={w:210,h:297};s.selectedIds=[];});ctx.fillStyle='#f00';ctx.fillRect(5,5,1,1);
  const processedSrc=canvas.toDataURL();const processedId=await insertImageFromSrc(state,processedSrc,{...options,aiCandidateId:'processed'});const processed=structuredClone(state.get().objects.find(o=>o.id===processedId));
  state.update(s=>{const image=s.objects.find(o=>o.id===processedId);image.rotation=25;s.selectedIds=[processedId];});
  const rotatedGenericRejected = await rejected(() => insertImageFromSrc(state,src,{...options,aiCandidateId:'rotated',replaceId:processedId}), /잠긴 이미지는 교체할 수 없습니다/);
  await materialize({id:'rotated',data:src,labelPlan:plan},{taskId:'placement-task',replaceId:processedId,isCurrent:()=>true});
  const rotated=structuredClone(state.get().objects.find(o=>o.id===processedId));
  return {lockedChildRejected,genericRejected,wrongOwnerRejected,staleRejected,rotatedGenericRejected,replacementUndoDelta,replaced,matching,changed,labels,undone,redone,reopened,smallerNew,processed,rotated,processedBytesPreserved:processed.src===processedSrc,project,sourceUnchanged:matching.src===src&&changed.src===src,planUnchanged:plan.reviewRequired===false&&plan.qualityReview.verdict==='pass'};
 });
 for (const name of ['genericRejected','wrongOwnerRejected','staleRejected','rotatedGenericRejected']) assert.equal(result[name].unchanged,true,name);
 assert.deepEqual(result.lockedChildRejected.map(row=>row.flag),['locked','positionLocked']);
 for (const row of result.lockedChildRejected) {assert.equal(row.unchanged,true);assert.equal(row.preparationDelta,0);assert.ok(row.message);}
 assert.equal(result.matching.imageSelectionLocked,true);assert.equal(result.matching.aiLabelEditingBackground,true);
 assert.equal(result.replacementUndoDelta,1,'the exact-owner materializer commits once');
 assert.equal(result.replaced.imageId,result.matching.id);assert.equal(result.changed.aiCandidateId,'replacement');
 assert.deepEqual(result.redone,result.changed);assert.equal(result.reopened.src,result.changed.src);
 assert.deepEqual(errors,[]);assert.equal(result.rotated.rotation,25);assert.equal(result.rotated.w,result.matching.w);assert.equal(result.rotated.aiReviewState,'needs-attention');assert.ok(result.rotated.aiReviewReport.issues.some(issue=>issue.code==='label-placement-display-changed'));
 assert.equal(result.processed.aiReviewState,'needs-attention');assert.equal(result.processedBytesPreserved,true);assert.equal(result.processed.w,result.matching.w);assert.equal(result.processed.h,result.matching.h);assert.ok(result.processed.aiReviewReport.issues.some(issue=>issue.code==='label-placement-image-changed'));
 assert.equal(result.smallerNew.aiReviewState,'needs-attention');assert.equal(result.matching.aiReviewState,'passed');assert.equal(result.changed.aiReviewState,'needs-attention');assert.equal(result.changed.aiReviewReport.verdict,'uncertain');assert.equal(result.changed.aiEditableLabelPlan.reviewRequired,true);assert.equal(result.labels.length,1);assert.equal(result.labels[0].text,'검수 글자');assert.equal(result.labels[0].aiLabelReviewRequired,true);assert.equal(result.sourceUnchanged,true);assert.equal(result.planUnchanged,true);assert.equal(result.undone.aiCandidateId,'first');assert.equal(result.redone.aiReviewState,'needs-attention');assert.deepEqual(result.reopened.aiReviewReport,result.changed.aiReviewReport);assert.deepEqual(result.reopened.aiEditableLabelPlan,result.changed.aiEditableLabelPlan);
 fs.writeFileSync(path.join(evidence,'placement.5e'),JSON.stringify(result.project));delete result.project;for(const k of ['matching','changed','undone','redone','reopened','smallerNew','processed','rotated'])delete result[k].src;fs.writeFileSync(path.join(evidence,'placement-result.json'),JSON.stringify(result,null,2));await page.screenshot({path:path.join(evidence,'placement-native.png')});
 }finally{await browser.close();}
});
