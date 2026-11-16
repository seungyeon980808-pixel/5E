const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const evidence = process.env.FAILURE_EVIDENCE || process.env.EVIDENCE_DIR || path.join(root, '.omo/evidence/small-fixes-0928/models/green');
fs.mkdirSync(evidence, { recursive: true });
const source = fs.readFileSync(path.join(root, 'tests/test-ai-batch-source-browser.cjs'), 'utf8');
const start = source.indexOf('function seedRequestWorkspaces(');
const end = source.indexOf("\ntest('selected workspaces", start);
assert.ok(start >= 0 && end > start, 'Retained batch fixture slice boundaries');
const harness = source.slice(start, end)
  .replace("  if (scoped)", "  tabs[0].attachments[0].comments = [{type:'point',number:1,x:20,y:20,w:0,h:0,text:'원본 코멘트 보존',imageId:'source-0'}];\n  if (scoped)")
  .replace("message: 'late synthetic error'", "message: 'Provider rejected request: ' + 'Full diagnostic detail. '.repeat(80) + 'END-OF-ERROR Authorization: Bearer sk-test-secret image=data:image/png;base64,c2VjcmV0 api_key=private-key'");
assert.notEqual(harness, source.slice(start,end), 'Long diagnostic and original-comment fixtures remain injected');
const { fixture, currentPrimaryAction } = new Function('require', 'root', 'fs', 'path', 'assert', 'chromium', 'webkit', harness + '; return { fixture: requestBrowserFixture, currentPrimaryAction };')(require, root, fs, path, assert, chromium, webkit);
test('model switch normalizes unsupported settings; a failed request keeps inputs and source comments', { timeout: 90000 }, async t => {
 const { page, errors } = await fixture(t, 1, evidence);
 const panel = '#ai-image-panel';
 // Fixed medium/priority replaces the retired ultra/high chooser. The actual
 // permitted Sol→Luna transition still proves captured model/settings normalization.
 await page.locator(`${panel} [data-ai-setting-key=model] [data-ai-model-choice=sol]`).click();
 await page.locator(`${panel} [data-ai-setting-key=model] [data-ai-model-choice=luna]`).click();
 const selected = await page.locator(`${panel} [data-ai-model], ${panel} [data-ai-effort], ${panel} [data-ai-speed]`).evaluateAll(nodes => nodes.map(node => ({name:node.getAttribute('aria-label'),value:node.value})));
 fs.writeFileSync(path.join(evidence, 'model-selection.json'), JSON.stringify(selected, null, 2));
 assert.equal(await page.locator(`${panel} [data-ai-effort]`).inputValue(), 'medium');
 assert.equal(await page.locator(`${panel} [data-ai-speed]`).inputValue(), 'priority');
 const input = page.locator(`${panel} [data-ai-input]`);
 const beforeInput = await input.inputValue();
 await (await currentPrimaryAction(page)).click();
 await page.waitForFunction(() => window.__task2.generationSends.length === 1);
 await page.evaluate(() => window.__task2.emitGeneration(0, 'error'));
 // 오류 기록 창은 2026-10-13(61bcd508)에 문제 신고 창으로 합쳐졌다(그 경로는 test-bug-report-browser가 본다).
 // 여기서는 실패한 요청이 고른 모델·설정으로 나갔고, 입력과 원본 코멘트가 그대로 남는지만 본다.
 const request = await page.evaluate(()=>{const {model,effort,serviceTier}=window.__task2.generationSends[0].payload;return {model,effort,serviceTier};});
 assert.deepEqual(request,{model:'gpt-6-luna',effort:'medium',serviceTier:'priority'});
 assert.doesNotMatch(await page.locator(`${panel}`).innerText(), /sk-test-secret|c2VjcmV0|private-key/);
 assert.equal(await input.inputValue(), beforeInput);
 const preserved = await page.evaluate(async () => {
  const db = await new Promise((resolve,reject) => {const scope=window.__task2Manager.activeExamTask().scope;const request=indexedDB.open('5e.preview:5e-ai-image-tasks'+(scope?'-'+scope:''),1);request.onupgradeneeded=()=>{request.transaction.abort();reject(new Error('Expected actual owner database is absent'));};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  try{return await new Promise((resolve,reject)=>{const req=db.transaction('tasks').objectStore('tasks').get('workspace');req.onsuccess=()=>{const tab=req.result.tabs.find(t=>t.id==='task-0');resolve(tab.attachments[0].comments);};req.onerror=()=>reject(req.error);});}finally{db.close();}
 });
 assert.equal(preserved[0].text, '원본 코멘트 보존');
 await page.screenshot({path:path.join(evidence,'failed-request.png')});
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({selected,request,preservedComments:preserved,inputPreserved:true,errors},null,2));
});
test('only advertised models are selectable and refreshed catalog preserves explicit selection', {timeout:90000}, async t=>{
 const dir=path.join(evidence,'server-catalog');fs.mkdirSync(dir,{recursive:true});
 const oldHarness=harness.replace(/models: async \(\) => .*?\n/, "models: async () => { window.__task2.catalogReads=(window.__task2.catalogReads||0)+1; return {data:[{model:'gpt-6.1-sol',displayName:'Sol 6.1',supportedReasoningEfforts:['medium'],defaultReasoningEffort:'medium',serviceTiers:['priority']},...(window.__catalogRefreshed ? [{model:'gpt-6-luna',displayName:'Luna 6',supportedReasoningEfforts:['medium'],defaultReasoningEffort:'medium',serviceTiers:['priority']}] : [])]}; },\n");
 assert.notEqual(oldHarness,harness,'Catalog mock replacement matches the retained source seam');
 const oldFixture=new Function('require','root','fs','path','assert','chromium','webkit',oldHarness+'; return requestBrowserFixture;')(require,root,fs,path,assert,chromium,webkit);
 const {page,errors}=await oldFixture(t,1,dir);
 assert.equal(await page.locator('#ai-image-panel [data-ai-setting-key=model] [data-ai-model-choice=luna]').isDisabled(),true);
 assert.match(await page.locator('#ai-image-panel [data-ai-setting-key=model] [data-ai-model-choice=luna]').getAttribute('title'),/모델 목록/);
 const readOptions=()=>page.locator('#ai-image-panel [data-ai-model] option').evaluateAll(nodes=>nodes.map(node=>({value:node.value,label:node.textContent,disabled:node.disabled})));
 const oldOptions=await readOptions();
 fs.writeFileSync(path.join(dir,'old-options.json'),JSON.stringify(oldOptions,null,2));
 assert.deepEqual(oldOptions.filter(option=>!option.disabled).map(option=>option.value),['gpt-6.1-sol']);
 assert.equal(await page.locator('#ai-image-panel [data-ai-model]').inputValue(),'gpt-6-luna','stale explicit preference is surfaced, not silently replaced');
 await page.evaluate(()=>{window.__catalogRefreshed=true;window.dispatchEvent(new Event('5e:web-ai-status'));});
 await page.waitForFunction(()=>[...document.querySelectorAll('#ai-image-panel [data-ai-model] option')].some(option=>option.value==='gpt-6-luna'&&!option.disabled));
 const refreshed=await readOptions();
 assert.deepEqual(refreshed.filter(option=>!option.disabled).map(option=>option.value),['gpt-6.1-sol','gpt-6-luna']);
 assert.equal(await page.locator('#ai-image-panel [data-ai-model]').inputValue(),'gpt-6-luna');
 await page.locator('#ai-image-panel [data-ai-setting-key=model] [data-ai-model-choice=sol]').click();
 await page.locator('#ai-image-panel [data-ai-setting-key=model] [data-ai-model-choice=luna]').click();
 // 연결 정보 창(모델 목록 새로고침 단추)은 2026-10-12(24219c8a)부터 늘 숨겨져 있다.
 // 목록 새로 읽기는 위의 '5e:web-ai-status' 신호 경로로 이미 확인했다.
 assert.equal(await page.locator('#ai-image-panel [data-ai-effort]').inputValue(),'medium');
 assert.equal(await page.locator('#ai-image-panel [data-ai-speed]').inputValue(),'priority');
 assert.equal(await page.locator('#ai-image-panel [data-ai-model-warning]').isVisible(),false);
 await (await currentPrimaryAction(page)).click();
 await page.waitForFunction(()=>window.__task2.generationSends.length===1);
 const request=await page.evaluate(()=>{const {model,effort,serviceTier}=window.__task2.generationSends[0].payload;return {model,effort,serviceTier};});
 assert.equal(request.model,'gpt-6-luna');assert.equal(request.effort,'medium');assert.equal(request.serviceTier,'priority');
 await page.evaluate(()=>window.__task2.emitGeneration(0,'error'));
 await page.screenshot({path:path.join(dir,'refreshed-models.png')});
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({oldOptions,refreshed,request,errors},null,2));
});
