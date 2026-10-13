const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=process.cwd(),{fixture}=require(path.join(root,'tests/fixtures/ai-image-label-workflow.cjs'));
async function savedRecords(page,scopes){return page.evaluate(scopes=>Promise.all(scopes.map(scope=>new Promise((resolve,reject)=>{
 const request=indexedDB.open('5e.preview:5e-ai-image-tasks'+(scope?'-'+scope:''),1);
 request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('tasks','readonly'),get=tx.objectStore('tasks').get('workspace');let value;
 get.onsuccess=()=>value=get.result;get.onerror=()=>reject(get.error);tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=()=>{db.close();reject(tx.error);};};
}))),scopes);}
for(const engine of ['chromium','webkit'])test(engine+' report controls follow real workspace creation, errors and disposal',{timeout:90000},async t=>{
 process.env.TASK2_ENGINE=engine;process.env.APP_ENTRY='/';
 const dir=path.join(path.resolve(process.env.EVIDENCE_DIR||'_work/feedback/parts/overnight-20261013/report-workspaces-after'),engine);fs.mkdirSync(dir,{recursive:true});
 const {page,errors}=await fixture(t,1,dir,{selectedPartial:true,beforeNavigate:async page=>{
  await page.route('**/js/bug-report.js*',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'js/bug-report.js'),'utf8')+';globalThis.__reportProviderCount=()=>providers.size;'}));
 }});
 const originalCount=await page.evaluate(()=>__reportProviderCount()),scopes=[''];assert.equal(originalCount,1);
 for(let i=0;i<3;i++){
  const imported=await page.evaluate(i=>__task2Manager.openIndependentReferences({references:[{name:'신고 검증 '+i,dataUrl:__task2.original}],startGeneration:false,reveal:true}),i);scopes.push(imported[0].scope);
  const button=page.locator('#ai-image-panel .bug-report-open');await button.click();assert.equal(await page.locator('#bug-report-dialog').evaluate(el=>el.open),true);
  assert.match(await page.locator('[data-report-images] figcaption').first().textContent(),new RegExp('신고 검증 '+i));await page.keyboard.press('Escape');assert.equal(await button.evaluate(el=>el===document.activeElement),true);
 }
 assert.equal(await page.evaluate(()=>__reportProviderCount()),scopes.length);
 await page.evaluate(()=>document.querySelector('#ai-image-panel').dispatchEvent(new CustomEvent('5e:ai-error-record',{bubbles:true,detail:{count:1}})));
 assert.equal(await page.locator('#ai-image-panel .bug-report-open').getAttribute('data-error-count'),'1');
 await page.evaluate(()=>window.dispatchEvent(new ErrorEvent('error',{message:'Synthetic runtime failure · Bearer synthetic-private-key'})));
 assert.equal(await page.locator('#ai-image-panel .bug-report-open').getAttribute('data-error-count'),'2');assert.equal(await page.locator('.footer-actions .bug-report-open').getAttribute('data-error-count'),'2');
 await page.locator('#ai-image-panel .bug-report-open').click();await page.locator('[data-report-errors] summary').click();assert.doesNotMatch(await page.locator('[data-report-context]').textContent(),/synthetic-private-key/);await page.keyboard.press('Escape');
 const fresh=await page.evaluate(()=>__task2Manager.openIndependentReferences({references:[{name:'오류 뒤 새 작업실',dataUrl:__task2.original}],startGeneration:false,reveal:true}));scopes.push(fresh[0].scope);
 await page.waitForFunction(()=>document.querySelector('#ai-image-panel .bug-report-open')?.dataset.errorCount==='1');
 const replacement=await page.evaluate(async()=>{
  const {registerBugReportContext}=await import('/js/bug-report.js?v=1.7.0-four-session-integration');const before=__reportProviderCount();
  const old=registerBugReportContext('replacement-regression',()=>null),current=registerBugReportContext('replacement-regression',()=>null);assertCleanup(old);assertCleanup(current);old();const retained=__reportProviderCount();current();return{before,retained,after:__reportProviderCount()};
  function assertCleanup(value){if(typeof value!=='function')throw new Error('Context registration must return a cleanup callback');}
 });assert.equal(replacement.retained,replacement.before+1);assert.equal(replacement.after,replacement.before);
 const beforeStorage=await savedRecords(page,scopes);const original=await page.evaluate(()=>__task2.original);assert.ok(beforeStorage.every(record=>record?.tabs?.length&&record.tabs[0].attachments?.[0]?.data===original),'each real workspace has a durable original before disposal');assert.ok(beforeStorage[0].tabs[0].generated.length,'the main workspace has durable generated revisions');await page.evaluate(()=>__task2Manager.dispose());const countAfter=await page.evaluate(()=>__reportProviderCount());assert.equal(countAfter,0);
 assert.deepEqual(await savedRecords(page,scopes),beforeStorage,'disposal preserves saved original images and generated versions');assert.equal(await page.evaluate(()=>__task2.sends.length),0);assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({engine,workspaces:scopes.length,clonedButtonAndFocus:true,currentImageContext:true,globalAndScopedErrorBadges:true,replacementCleanup:true,countAfter,savedBytesUnchanged:true,paidAiCalls:0,errors},null,2));
});
