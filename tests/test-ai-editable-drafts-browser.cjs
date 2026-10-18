// Fixed label source: 6e2c55012461859cdc8afb4d9596d3f08d5409b4; assertions and fixtures retained.
const { installLabelSourcePage, armSelection, selectionArrived } = require('./helpers/label-source-browser.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,choose,finish,snapshot,sends}=require('./helpers/label-source-browser.cjs');
const evidence=path.resolve(process.env.EVIDENCE_DIR||'.omo/evidence/labeler-editable-drafts-browser');
const panel='#ai-image-panel',version='?v=1.7.0-four-session-integration';
function dir(id){const p=path.join(evidence,id);fs.mkdirSync(p,{recursive:true});return p;}
async function canvasAPI(page){
  await page.evaluate(async version=>{
    const {state}=await import('/js/state.js'+version);
    const {serialize,applyLoaded}=await import('/js/project-io.js'+version);
    window.qa={state,serialize,applyLoaded};
  },version);
}
async function watchCanvas(page,expected){
  await page.evaluate(expected=>{
    const canvas=document.querySelector('#canvas');
    if(!canvas)throw new Error('Native editor canvas is missing');
    window.qa.ready=new Promise((resolve,reject)=>{
      let dispose=()=>{};
      const timer=setTimeout(()=>{
        const s=window.qa.state.get();
        dispose();
        reject(new Error('Expected canvas state did not arrive: '+JSON.stringify({
          expected,selectedIds:s.selectedIds,targetedId:s.targetedId,activeTool:s.activeTool,
          handles:[...document.querySelectorAll('#handles [data-id]')].map(n=>n.dataset.id),
          labels:s.objects.filter(o=>o.aiAutoLabel).map(o=>({id:o.id,type:o.type,groupId:o.groupId})),
        })));
      },10000);
      function check(s){
        const labels=s.objects.filter(o=>o.aiAutoLabel);
        const object=s.objects.find(o=>o.id===expected.id);
        const selected=s.objects.find(o=>o.id===expected.selectedId);
        // Plain native text/formulas have a selection frame, not endpoint handles.
        const selectedRendered=selected?.type==='text'||selected?.type==='formula'
          ? document.querySelector('#scene [data-selection-frame="single"]')
          : document.querySelector(`#handles [data-id="${expected.selectedId}"]`);
        const ready=expected.selectedId!==undefined
          ? s.selectedIds.length===1&&s.selectedIds[0]===expected.selectedId&&selectedRendered
          : expected.count!==undefined ? labels.length===expected.count
          : expected.text!==undefined ? (object?.rawSource||object?.text||object?.source)===expected.text
          : object && JSON.stringify([object.x,object.y,object.p1,object.p2])!==expected.geometry;
        if(ready){clearTimeout(timer);dispose();resolve();}
      }
      const observer=new MutationObserver(()=>check(window.qa.state.get()));
      // Handles exist only for a selection and are rebuilt by the renderer.
      // Observe their stable canvas parent, including insertion and removal.
      observer.observe(canvas,{childList:true,subtree:true,attributes:true});
      const unsubscribe=window.qa.state.subscribe(check);
      dispose=()=>{observer.disconnect();unsubscribe();};
      check(window.qa.state.get());
    });
  },expected);
}
async function canvasObjects(page){return page.evaluate(()=>structuredClone(window.qa.state.get().objects));}
async function labelCenter(page,id){
  // WebKit's SVG text box includes font-em whitespace outside the visible ink.
  // The renderer's measured hit rectangle follows the same glyph layout as picking.
  const label=page.locator(`#scene [data-id="${id}"]:not([data-ui]) rect[fill="transparent"]`).first();
  await label.waitFor({state:'visible'});
  const box=await label.boundingBox(),canvas=await page.locator('#canvas').boundingBox();
  assert.ok(box && box.width>0 && box.height>0,'native label has rendered glyphs');
  assert.ok(box.x>=canvas.x && box.x+box.width<=canvas.x+canvas.width
    && box.y>=canvas.y && box.y+box.height<=canvas.y+canvas.height,'native label is visible inside the canvas');
  const glyph=await page.locator(`#scene [data-id="${id}"]:not([data-ui]) text`).first().evaluate(text=>{
    const extent=text.getExtentOfChar(0),matrix=text.getScreenCTM();
    const start=new DOMPoint(extent.x,extent.y).matrixTransform(matrix);
    const end=new DOMPoint(extent.x+extent.width,extent.y+extent.height).matrixTransform(matrix);
    return{x:start.x,y:start.y,right:end.x,bottom:end.y};
  });
  const left=Math.max(box.x,glyph.x),right=Math.min(box.x+box.width,glyph.right);
  const top=Math.max(box.y,glyph.y),bottom=Math.min(box.y+box.height,glyph.bottom);
  assert.ok(right>left && bottom>top,'first glyph overlaps the measured native hit area');
  return{x:(left+right)/2,y:(top+bottom)/2};
}
async function editMoveReopen(page,evidence,source,count,correctedText){
  await canvasAPI(page);await watchCanvas(page,{count});
  await page.locator(panel+' [data-ai-edit-review-draft]').click();
  await page.evaluate(()=>window.qa.ready);
  let objects=await canvasObjects(page),image=objects.find(o=>o.type==='image');
  const labels=objects.filter(o=>o.aiAutoLabel);
  assert.equal(labels.length,count);assert.equal(image.src,source);
  assert.deepEqual(await page.evaluate(()=>window.qa.state.get().selectedIds),[]);
  assert.equal(image.imageSelectionLocked,true);assert.equal(image.aiLabelEditingBackground,true);
  assert.ok(labels.every(o=>!o.locked && !o.imageSelectionLocked));
  for(const label of labels)await labelCenter(page,label.id);
  const chosen=labels[0];
  await page.screenshot({path:path.join(evidence,'native-before-edit.png')});
  const position=await labelCenter(page,chosen.id);
  await watchCanvas(page,{selectedId:chosen.id});
  await page.mouse.click(position.x,position.y);
  await page.evaluate(()=>window.qa.ready);
  assert.deepEqual(await page.evaluate(()=>window.qa.state.get().selectedIds),[chosen.id]);
  assert.equal(await page.locator('.ai-inline-label-editor').count(),0,'first click selects without opening text input');
  await page.mouse.click(position.x,position.y);
  const input=page.locator('.ai-inline-label-editor');
  try{await input.waitFor({state:'visible'});}catch(error){
    const diagnostic=await page.evaluate(async({position,version})=>{
      const {screenToWorld}=await import('/js/viewport.js'+version);
      const {pickSelectableObjectAtPoint}=await import('/js/pick.js'+version);
      const s=window.qa.state.get(),world=screenToWorld(document.querySelector('#canvas'),s.viewBox,position.x,position.y);
      return{world,viewBox:s.viewBox,selected:s.selectedIds,activeTool:s.activeTool,
        picked:pickSelectableObjectAtPoint(s,world),objects:s.objects.filter(o=>o.aiAutoLabel)};
    },{position,version});
    fs.writeFileSync(path.join(evidence,'click-failure.json'),JSON.stringify(diagnostic,null,2));
    await page.screenshot({path:path.join(evidence,'click-failure.png')});
    throw error;
  }
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.modalMotionState==='closed');
  assert.equal(await input.evaluate(editor=>document.activeElement===editor),true,
    'closing workbench animation preserves the newly opened native label input focus');
  const next=correctedText || (chosen.rawSource||chosen.text||chosen.source)+' 수정';
  await watchCanvas(page,{id:chosen.id,text:next});await input.fill(next);await input.press('Enter');
  await page.evaluate(()=>window.qa.ready);
  const background=await page.locator(`#scene [data-id="${image.id}"]:not([data-ui])`).boundingBox();
  await page.mouse.click(background.x+background.width*0.1,background.y+background.height*0.1);
  assert.deepEqual(await page.evaluate(()=>window.qa.state.get().selectedIds),[]);
  const movedFrom=await labelCenter(page,chosen.id);
  const beforeMove=(await canvasObjects(page)).find(o=>o.id===chosen.id);
  const beforeGeometry=JSON.stringify([beforeMove.x,beforeMove.y,beforeMove.p1,beforeMove.p2]);
  await watchCanvas(page,{id:chosen.id,geometry:beforeGeometry});
  await page.mouse.move(movedFrom.x,movedFrom.y);await page.mouse.down();
  await page.mouse.move(movedFrom.x-18,movedFrom.y+12,{steps:4});await page.mouse.up();
  await page.evaluate(()=>window.qa.ready);
  const edited=(await canvasObjects(page)).find(o=>o.id===chosen.id);
  assert.notEqual(JSON.stringify([edited.x,edited.y,edited.p1,edited.p2]),beforeGeometry);
  assert.equal(edited.fontSize,beforeMove.fontSize);assert.equal(edited.labelSize,beforeMove.labelSize);
  assert.equal(edited.rawSource||edited.text||edited.source,next);
  await page.evaluate(()=>window.qa.state.update(s=>{s.selectedIds=[];s.activeTool='V';}));
  await page.mouse.click(background.x+background.width/2,background.y+background.height/2);
  assert.equal(await page.evaluate(id=>window.qa.state.get().selectedIds.includes(id),image.id),false);
  const saved=await page.evaluate(()=>{
    const data=window.qa.serialize(window.qa.state.get());
    window.qa.applyLoaded(window.qa.state,JSON.parse(JSON.stringify(data)));
    return data;
  });
  fs.writeFileSync(path.join(evidence,'edited.5e'),JSON.stringify(saved));
  objects=await canvasObjects(page);
  assert.deepEqual(objects.find(o=>o.id===chosen.id),edited);
  assert.equal(objects.find(o=>o.id===image.id).imageSelectionLocked,true);
  assert.equal(objects.find(o=>o.id===image.id).src,source);
  await labelCenter(page,chosen.id);
  await page.screenshot({path:path.join(evidence,'native-reopened.png')});
  return{nativeCount:count,types:labels.map(o=>o.type),editedId:chosen.id,editedText:next,imageSelectionLocked:true,saveReopen:true};
}
test('general draft-first UI offers native editing and optional verification without reanalysis or regeneration',{timeout:90000},async t=>{
  const evidence=dir('general-fast');const {page,errors}=await fixture(t,1,evidence);
  await choose(page,'general','restore-editable');
  await page.locator(panel+' [data-ai-setting-key=model] [data-ai-model-choice=sol]').click();
  await page.locator(panel+' [data-ai-setting-key=verification] [data-ai-setting-value=draft-first]').click();
  assert.equal(await page.locator(panel+' [data-ai-setting-key=verification]').isVisible(),true);
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    for(const theme of ['light','dark']){
      await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);
      await page.screenshot({path:path.join(evidence,`settings-${viewport.width}-${theme}.png`)});
    }
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.locator(panel+' [data-ai-comments-apply]').click();await finish(page);
  let candidate=(await snapshot(page))[0].generated.at(-1);
  assert.equal(candidate.imageLabelWorkflow.verificationMode,'draft-first');
  assert.equal(candidate.reviewState,'needs-attention');
  assert.equal(candidate.reviewReport.verdict,'uncertain');
  assert.equal(candidate.workflowMetrics.calls.sourceAnalysis,1);
  assert.equal(candidate.workflowMetrics.calls.fullGeneration,1);
  assert.equal(candidate.workflowMetrics.calls.review,0);
  assert.equal((await sends(page)).length,2);
  for(const theme of ['light','dark']){
    await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);
    await page.screenshot({path:path.join(evidence,`desktop-${theme}.png`)});
  }
  await page.setViewportSize({width:390,height:844});
  for(const theme of ['light','dark']){
    await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);
    await page.screenshot({path:path.join(evidence,`mobile-${theme}.png`)});
  }
  await page.setViewportSize({width:1440,height:1000});
  const draftEdit=await editMoveReopen(page,evidence,await page.evaluate(()=>window.__task2.modified),1);
  const editedObjects=await canvasObjects(page);
  await page.locator('#ai-image-install-open').click();
  await page.locator(panel+' [data-ai-verify-label-draft]').click();
  await finish(page,{startIndex:2});
  candidate=(await snapshot(page))[0].generated.at(-1);
  assert.equal(candidate.workflowMetrics.calls.sourceAnalysis,0);
  assert.equal(candidate.workflowMetrics.calls.fullGeneration,0);
  assert.equal(candidate.workflowMetrics.calls.review,1);
  assert.equal((await sends(page)).length,3);
  assert.deepEqual(await canvasObjects(page),editedObjects,'optional verification cannot overwrite the edited canvas copy');
  const models=await page.evaluate(()=>window.__task2.sends.map(s=>({purpose:s.payload.purpose,model:s.payload.model,effort:s.payload.effort})));
  assert.equal(models[0].model,'gpt-6-luna');assert.equal(models[0].effort,'medium');
  assert.equal(models[1].model,'gpt-6.1-sol');
  assert.equal(models[2].model,'gpt-6-luna');assert.equal(models[2].effort,'medium');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({scope:'synthetic transport; real product UI',newPaidAiCalls:0,mandatoryRequests:2,optionalRequests:1,draftEdit,models,candidate},null,2));
});
const retained="/Users/parkseungyeon/.codex/worktrees/5e-170-auto-labeler/5E/.omo/evidence/labeler-removal-fix-20261008/final-candidates/cases";
for(const [id,count] of [['holdout-exam-2004-physics-q11',5],['holdout-exam-2004-biology-q07',4],['holdout-exam-2004-physics-q07',5]]){
  test(`annotated retained Luna fixture preserves only removed labels as overlays: ${id}`,{timeout:90000},async t=>{
    const evidence=dir(id);const {page,errors}=await fixture(t,1,evidence);
    const source='data:image/png;base64,'+fs.readFileSync(path.join(retained,id,'original.png')).toString('base64');
    const retainedResponse=JSON.parse(fs.readFileSync(path.join(retained,id,'1-sourceAnalysis-response.txt'),'utf8'));
    // Explicit synthetic contract annotations; archived response bytes stay unchanged.
    const sourcePlan={...retainedResponse,observationContractRevision:'1.4.0',removalOnlyItems:[],
      labels:retainedResponse.labels.map(label=>({...label,disposition:'restore',semanticRole:'scientific-label',reason:'Synthetic classification annotation for UI regression'}))};
    await page.evaluate(async({source,id})=>{await window.__task2Manager.attachReference({src:source,name:id});},{source,id});
    await choose(page,'exam','restore-editable');
    await page.locator(panel+' [data-ai-comments-apply]').click();await finish(page,{sourcePlan});
    let row=(await snapshot(page)).find(row=>row.attachments.some(a=>a.name===id));
    const candidate=row.generated.at(-1);
    const removed=candidate.removalReport.removedLabelIds;
    const nativeCount=id==='holdout-exam-2004-physics-q11'?1:count;
    if(id==='holdout-exam-2004-physics-q11'){
      assert.deepEqual(removed,['label-x']);assert.notEqual(candidate.data,source);
      assert.deepEqual(candidate.labelPlan.labels.map(label=>label.id),removed);
    }else{
      assert.deepEqual(removed,[]);assert.equal(candidate.data,source);assert.equal(candidate.labelPlan,null);
      assert.equal(candidate.editableDraft.presentation,'external-list');
    }
    if(candidate.editableDraft)assert.equal(candidate.editableDraft.labelIds.length,nativeCount);
    else assert.equal(candidate.labelPlan.labels.length,nativeCount);
    assert.equal(candidate.workflowMetrics.calls.sourceAnalysis,1);assert.equal(candidate.workflowMetrics.calls.fullGeneration,0);
    assert.equal(candidate.reviewState,'needs-attention');
    const edit=await editMoveReopen(page,evidence,candidate.data,nativeCount,id==='holdout-exam-2004-biology-q07'?'현상 유지':undefined);
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({scope:'retained actual Luna response with explicitly synthetic classification annotations; mocked transport; real local removal and native UI',newPaidAiCalls:0,sourceResponse:path.join(retained,id,'1-sourceAnalysis-response.txt'),archiveUnchanged:true,beforeNativeCount:0,afterNativeCount:nativeCount,originalBytesUnchanged:candidate.data===source,approval:false,metrics:candidate.workflowMetrics,edit,errors},null,2));
  });
}
