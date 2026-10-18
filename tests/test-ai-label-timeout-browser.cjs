// Fixed label source: 6e2c55012461859cdc8afb4d9596d3f08d5409b4; assertions and fixtures retained.
const { installLabelSourcePage, armSelection, selectionArrived } = require('./helpers/label-source-browser.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,choose,verifiedPlan,emit,snapshot}=require('./helpers/label-source-browser.cjs');
const evidence=path.resolve(process.env.EVIDENCE_DIR||'.omo/evidence/labeler-timeout-browser');
const panel='#ai-image-panel';

test('failed source observation uses the actual label model and preserves the original for retry',{timeout:90000},async t=>{
 const dir=path.join(evidence,'source-failure');fs.mkdirSync(dir,{recursive:true});
 const {page,errors}=await fixture(t,1,dir);await choose(page,'general','restore-editable');
 await page.locator(panel+' [data-ai-comments-apply]').click();await page.waitForFunction(()=>window.__task2.sends.length===1);
 assert.equal(await page.evaluate(()=>window.__task2.sends[0].payload.model),'gpt-6-luna');
 await page.evaluate(()=>window.__task2.emit(0,'error'));
 await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiBusy==='false');
 // 오류 기록 창은 2026-10-13(61bcd508)에 없어졌고 문제 신고는 바깥 게시판 링크가 됐다(4fa3c199). 화면에서 읽을 기록이 없어 기록 문구 확인은 뺐다.
 const log=await page.locator(panel+' [data-ai-status]').textContent();
 assert.equal(await page.evaluate(()=>window.__task2.sends.length),1);
 const tabs=await snapshot(page);assert.equal(tabs[0].attachments.length,1);assert.equal(tabs[0].generated.length,0);
 assert.deepEqual(errors,[]);await page.screenshot({path:path.join(dir,'actual-stage-error.png')});
 fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({scope:'synthetic transport; real product modules',log,imageCalls:0,originalPreserved:true,errors},null,2));
});

test('final verification connection failure keeps the one generated RAW and flags review without replacement',{timeout:90000},async t=>{
 const dir=path.join(evidence,'review-failure');fs.mkdirSync(dir,{recursive:true});
 const {page,errors}=await fixture(t,1,dir);await choose(page,'general','restore-editable');
 await page.locator(panel+' [data-ai-comments-apply]').click();await page.waitForFunction(()=>window.__task2.sends.length===1);
 await emit(page,0,'assistant',JSON.stringify(verifiedPlan));
 await page.waitForFunction(()=>window.__task2.sends.length===2);await emit(page,1,'image');
 await page.waitForFunction(()=>window.__task2.sends.length===3);
 const pending=(await snapshot(page))[0].generated[0];
 assert.ok(pending,'RAW must already be persisted while final verification is still running');
 assert.equal(pending.reviewState,'needs-attention');assert.equal(pending.labelPlan,null);
 assert.equal(await page.locator(panel+' [data-ai-version-button]').isEnabled(),true);
 await page.screenshot({path:path.join(dir,'raw-before-verification.png')});
 await page.evaluate(()=>window.__task2.emit(2,'error'));
 await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiBusy==='false');
 const tabs=await snapshot(page),candidate=tabs[0].generated[0];
 assert.ok(candidate);assert.equal(candidate.data,await page.evaluate(()=>window.__task2.modified));assert.equal(candidate.reviewState,'needs-attention');
 assert.ok(candidate.reviewReport.issues.some(i=>i.message.includes('late synthetic error')));
 const imageCalls=await page.evaluate(()=>window.__task2.sends.filter(s=>s.payload.purpose==='image').length);assert.equal(imageCalls,1);
 assert.equal(await page.locator(panel+' [data-ai-version-button]').isEnabled(),true);
 assert.deepEqual(errors,[]);await page.screenshot({path:path.join(dir,'retained-raw.png')});
 fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({scope:'synthetic transport; real product modules',imageCalls,rawPreserved:true,reviewState:candidate.reviewState,errors},null,2));
});

test('unverified exam ink retains original pixels and provides a separate editable list, never in-place overlays',{timeout:90000},async t=>{
 const dir=path.join(evidence,'exam-deferred');fs.mkdirSync(dir,{recursive:true});
 const {page,errors}=await fixture(t,1,dir);await choose(page,'exam','restore-editable');
 await page.locator(panel+' [data-ai-comments-apply]').click();await page.waitForFunction(()=>window.__task2.sends.length===1);
 const plan=structuredClone(verifiedPlan);plan.removalRegions=[];plan.inkSearchRegions=[];
 await emit(page,0,'assistant',JSON.stringify(plan));await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiBusy==='false');
 const tab=(await snapshot(page))[0],candidate=tab.generated[0];assert.ok(candidate);assert.equal(candidate.labelPlan,null);assert.equal(candidate.reviewState,'needs-attention');
 assert.equal(candidate.data,await page.evaluate(()=>window.__task2.original));assert.equal(candidate.name,'원본 유지 · 라벨 제거 보류');
 assert.equal(candidate.removalReport.unchanged,true);assert.equal(candidate.removalReport.changedPixels,0);
 assert.ok(candidate.reviewReport.issues.some(i=>i.message.includes('전자')&&i.message.includes('원본을 유지')));
 assert.equal(await page.evaluate(()=>window.__task2.sends.length),1);assert.equal(tab.selectedCandidateId,candidate.id);
 assert.equal(candidate.editableDraft.presentation,'external-list');
 assert.deepEqual(candidate.editableDraft.labelIds,['source-label']);
 assert.equal(await page.locator(panel+' [data-ai-edit-review-draft]').isEnabled(),true);
 assert.deepEqual(errors,[]);await page.screenshot({path:path.join(dir,'original-retained-readable-reasons.png')});
 fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({scope:'synthetic transport; actual product UI and pixel path',candidateName:candidate.name,originalUnchanged:true,labelPlan:null,requests:1,issues:candidate.reviewReport.issues,errors},null,2));
 assert.equal(tab.sourceLabelObservation.removalIncomplete,true);
 await page.locator(panel+' [data-ai-retry-interrupted]').click();await page.waitForFunction(()=>window.__task2.sends.length===2);
 assert.match(await page.evaluate(()=>window.__task2.sends[1].payload.text),/입력 원본 라벨 관찰/,'Explicit retry must not reuse an observation that could not remove labels');
});

test('label uncertainty prevents its entire text leader endpoint unit from being erased',{timeout:90000},async t=>{
 const dir=path.join(evidence,'exam-atomic');fs.mkdirSync(dir,{recursive:true});
 const {page,errors}=await fixture(t,1,dir);await choose(page,'exam','restore-editable');
 await page.locator(panel+' [data-ai-comments-apply]').click();await page.waitForFunction(()=>window.__task2.sends.length===1);
 const plan=structuredClone(verifiedPlan);plan.uncertainties=[{sourceRef:1,labelId:'source-label',reason:'검증 fixture: 이 라벨 원문 판독 미확정'}];
 await emit(page,0,'assistant',JSON.stringify(plan));await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiBusy==='false');
 const candidate=(await snapshot(page))[0].generated[0];assert.deepEqual(candidate.removalReport.removedLabelIds,[]);
 assert.equal(candidate.removalReport.changedPixels,0);assert.equal(candidate.removalReport.unchanged,true);
 assert.equal(candidate.data,await page.evaluate(()=>window.__task2.original));assert.equal(candidate.labelPlan,null);assert.equal(candidate.reviewState,'needs-attention');
 assert.equal(await page.evaluate(()=>window.__task2.sends.length),1);assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({scope:'synthetic analysis; real pixel pipeline and product UI',originalIdentical:true,removedLabelIds:[],changedPixels:0,imageRequests:0,editableOverlays:0,errors},null,2));
});
