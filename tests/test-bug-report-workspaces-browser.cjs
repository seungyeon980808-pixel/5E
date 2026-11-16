const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=process.cwd(),{fixture}=require(path.join(root,'tests/fixtures/ai-image-label-workflow.cjs'));
async function savedRecords(page,scopes){return page.evaluate(scopes=>Promise.all(scopes.map(scope=>new Promise((resolve,reject)=>{
 const request=indexedDB.open('5e.preview:5e-ai-image-tasks'+(scope?'-'+scope:''),1);
 request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('tasks','readonly'),get=tx.objectStore('tasks').get('workspace');let value;
 get.onsuccess=()=>value=get.result;get.onerror=()=>reject(get.error);tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=()=>{db.close();reject(tx.error);};};
}))),scopes);}

// Sparse historical tasks acquire default view fields when first activated.
// Every saved content field must survive that hydration, including nested
// image bytes, labels, comments, model settings and revision order.
function assertSavedContent(actual, expected) {
 if (Array.isArray(expected)) {assert.equal(actual.length,expected.length);expected.forEach((value,index)=>assertSavedContent(actual[index],value));}
 else if (expected && typeof expected==='object') {for(const [key,value] of Object.entries(expected))assertSavedContent(actual[key],value);}
 else assert.deepEqual(actual,expected);
}

for (const engine of ['chromium','webkit']) test(engine+' CS links and selected deletion preserve independent workspaces',{timeout:90000},async t=>{
 process.env.TASK2_ENGINE=engine;process.env.APP_ENTRY='/';
 const dir=path.join(path.resolve(process.env.EVIDENCE_DIR||'_work/feedback/parts/screen-workspaces'),engine);fs.mkdirSync(dir,{recursive:true});
 const {page,errors}=await fixture(t,2,dir,{selectedPartial:true,beforeNavigate:async page=>{
  await page.route('**/js/bug-report.js*',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'js/bug-report.js'),'utf8')+';globalThis.__reportProviderCount=()=>providers.size;'}));
 }});
 assert.equal(await page.evaluate(()=>__reportProviderCount()),1);
 const panel=page.locator('#ai-image-panel');
 // 2026-10-16(83201a54)부터 코멘트 도구 기본값은 '선택'(아무 도구도 눌리지 않음)이다.
 assert.equal(await panel.locator('[data-ai-comment-tool][aria-pressed="true"]').count(),0);
 assert.equal(await panel.getAttribute('data-ai-comments-visible'),'false');
 const scopes=[''];
 for(let i=0;i<2;i++){
  const imported=await page.evaluate(i=>__task2Manager.openIndependentReferences({references:[{name:'독립 원본 '+i,dataUrl:__task2.original}],startGeneration:false,reveal:true}),i);scopes.push(imported[0].scope);
  const link=page.locator('#ai-image-panel .bug-report-open');assert.equal(await link.getAttribute('href'),'https://5e.ai.kr/bug/');assert.equal(await link.getAttribute('target'),'_blank');
 }
 assert.equal(await page.evaluate(()=>__reportProviderCount()),scopes.length);
 const replacement=await page.evaluate(async()=>{
  const {registerBugReportContext}=await import('/js/bug-report.js?v=1.7.0-four-session-integration');const before=__reportProviderCount();
  const old=registerBugReportContext('replacement-regression',()=>null),current=registerBugReportContext('replacement-regression',()=>null);old();const retained=__reportProviderCount();current();return{before,retained,after:__reportProviderCount()};
 });assert.equal(replacement.retained,replacement.before+1);assert.equal(replacement.after,replacement.before);
 await page.evaluate(()=>__task2Manager.checkpointForClose());
 const beforeStorage=await savedRecords(page,scopes),original=await page.evaluate(()=>__task2.original);
 assert.ok(beforeStorage.every(record=>record?.tabs?.length&&record.tabs[0].attachments?.[0]?.data===original));
 // Select only task-0 from the original workspace, then toggle one independent
 // task into the selection. The other original and independent workspace stay.
 await page.locator('#ai-image-panel .ai-task-tab[data-tab-id="task-0"] .ai-task-tab-select').click();
 const independent=await page.locator('#ai-image-panel .ai-task-tab[data-tab-id]:not([data-tab-id^="task-"])').first().getAttribute('data-tab-id');
 await page.locator(`#ai-image-panel .ai-task-tab[data-tab-id="${independent}"] .ai-task-tab-select`).click({modifiers:['Meta']});
 assert.equal(await page.locator('#ai-image-panel [data-ai-selection-count]').textContent(),'2개 선택');
 await page.locator('#ai-image-panel [data-ai-tab-clear]').click();
 const dialog=page.getByRole('dialog',{name:'선택 작업 삭제'});await dialog.getByRole('button',{name:'취소',exact:true}).click();
 assert.equal(await page.locator('#ai-image-panel .ai-task-tab[data-tab-id]').count(),4,'cancelling deletion keeps every task');
 await page.locator('#ai-image-panel [data-ai-tab-clear]').click();await dialog.getByRole('button',{name:'2개 삭제',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('#ai-image-panel .ai-task-tab[data-tab-id]').length===2);
 const afterStorage=await savedRecords(page,[scopes[0],...scopes.slice(1).filter((scope,i)=>beforeStorage[i+1].tabs.every(tab=>tab.id!==independent))]);
 assert.equal(afterStorage[0].tabs.length,1);assertSavedContent(afterStorage[0].tabs[0],beforeStorage[0].tabs.find(tab=>tab.id==='task-1'));
 assert.deepEqual(afterStorage[1],beforeStorage.find(record=>record.tabs[0].id!==independent&&record!==beforeStorage[0]));
 assert.equal(await page.locator('#ai-image-panel [data-ai-selection-count]').textContent(),'1개 선택');
 assert.equal(await page.locator('#ai-image-panel .ai-task-tab.is-batch-selected[data-tab-id="task-0"]').count(),0);
 assert.equal(await page.locator(`#ai-image-panel .ai-task-tab.is-batch-selected[data-tab-id="${independent}"]`).count(),0);
 const retained=structuredClone(afterStorage);await page.evaluate(()=>__task2Manager.dispose());assert.equal(await page.evaluate(()=>__reportProviderCount()),0);
 const remainingScopes=[scopes[0],...scopes.slice(1).filter((scope,i)=>beforeStorage[i+1].tabs.every(tab=>tab.id!==independent))];
 assert.deepEqual(await savedRecords(page,remainingScopes),retained,'disposal preserves remaining originals and generated versions');
 assert.equal(await page.evaluate(()=>__task2.sends.length),0);assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({engine,selectedOnlyDelete:true,cancelPreservesTasks:true,independentStoragePreserved:true,defaultPanAndCommentsHidden:true,providersDisposed:true,paidAiCalls:0,errors},null,2));
});
