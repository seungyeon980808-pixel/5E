const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const evidence = process.env.FAILURE_EVIDENCE || path.join(root, '.omo/evidence/small-fixes-0928/models/green');
fs.mkdirSync(evidence, { recursive: true });
const source = fs.readFileSync(path.join(root, 'tests/test-ai-batch-source-browser.cjs'), 'utf8');
const start = source.indexOf('function seedRequestWorkspaces(');
const end = source.indexOf("\ntest('selected workspaces", start);
const harness = source.slice(start, end)
  .replace("  await page.goto(", "  if (process.env.BASELINE_PANEL) await page.route('**/preview/js/ai-panel.js*', route => route.fulfill({contentType:'text/javascript',body:fs.readFileSync(process.env.BASELINE_PANEL,'utf8')}));\n  await page.goto(")
  .replace("  if (scoped)", "  tabs[0].attachments[0].comments = [{type:'point',number:1,x:20,y:20,w:0,h:0,text:'원본 코멘트 보존',imageId:'source-0'}];\n  if (scoped)")
  .replaceAll('catalog-sol', 'gpt-6-sol').replaceAll('catalog-luna', 'gpt-6-luna')
  .replace("supportedReasoningEfforts: ['medium','high'], serviceTiers: ['priority']", "supportedReasoningEfforts: ['medium','high'], serviceTiers: []")
  .replace("message: 'late synthetic error'", "message: 'Provider rejected request: ' + 'Full diagnostic detail. '.repeat(80) + 'END-OF-ERROR Authorization: Bearer sk-test-secret image=data:image/png;base64,c2VjcmV0 api_key=private-key'");
const fixture = new Function('require', 'root', 'fs', 'path', 'assert', 'chromium', 'webkit', harness + '; return requestBrowserFixture;')(require, root, fs, path, assert, chromium, webkit);
test('model switch normalizes unsupported settings; full error is safe, copyable, task scoped and preserves inputs', { timeout: 90000 }, async t => {
 const { page, errors } = await fixture(t, 1, evidence);
 const panel = '#ai-image-panel';
 await page.click(`${panel} .ai-advanced-settings > summary`);
 await page.selectOption(`${panel} [data-ai-model]`, 'gpt-6-sol');
 await page.selectOption(`${panel} [data-ai-effort]`, 'ultra');
 await page.selectOption(`${panel} [data-ai-speed]`, 'priority');
 await page.selectOption(`${panel} [data-ai-model]`, 'gpt-6-luna');
 const selected = await page.locator(`${panel} [data-ai-model], ${panel} [data-ai-effort], ${panel} [data-ai-speed]`).evaluateAll(nodes => nodes.map(node => ({name:node.getAttribute('aria-label'),value:node.value})));
 fs.writeFileSync(path.join(evidence, 'model-selection.json'), JSON.stringify(selected, null, 2));
 assert.equal(await page.locator(`${panel} [data-ai-effort]`).inputValue(), 'medium');
 assert.equal(await page.locator(`${panel} [data-ai-speed]`).inputValue(), '');
 const input = page.locator(`${panel} [data-ai-input]`);
 const beforeInput = await input.inputValue();
 await page.click(`${panel} [data-ai-comments-apply]`);
 await page.waitForFunction(() => window.__task2.sends.length === 1);
 await page.evaluate(() => window.__task2.emit(0, 'error'));
 await page.click(`${panel} [data-ai-error-log-open]`);
 const text = await page.locator(`${panel} [data-ai-error-log-text]`).inputValue();
 assert.match(text, /END-OF-ERROR/); assert.match(text, /gpt-6-luna/); assert.match(text, /task-0/); assert.match(text, /turn-0/);
 assert.doesNotMatch(text, /sk-test-secret|c2VjcmV0|private-key/);
 assert.equal(await input.inputValue(), beforeInput);
 const preserved = await page.evaluate(async () => {
  const db = await new Promise((resolve,reject) => {const request=indexedDB.open('5e.preview:5e-ai-image-tasks',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  try{return await new Promise((resolve,reject)=>{const req=db.transaction('tasks').objectStore('tasks').get('workspace');req.onsuccess=()=>resolve(req.result.tabs[0].attachments[0].comments);req.onerror=()=>reject(req.error);});}finally{db.close();}
 });
 assert.equal(preserved[0].text, '원본 코멘트 보존');
 await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{writeText:async value=>{window.__copiedLog=value;}}}));
 await page.click(`${panel} [data-ai-error-log-copy]`);
 assert.equal(await page.evaluate(() => window.__copiedLog), text);
 await page.screenshot({path:path.join(evidence,'full-log.png')});
 for(const width of [375,768,1280]) {
  await page.setViewportSize({width,height:900});
  const box=await page.locator(`${panel} [data-ai-error-log-dialog]`).boundingBox();
  assert.ok(box.x>=0 && box.x+box.width<=width+1);
  await page.screenshot({path:path.join(evidence,`log-${width}.png`)});
 }
 await page.keyboard.press('Escape');
 assert.equal(await page.locator(`${panel} [data-ai-error-log-dialog]`).isVisible(),false);
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({selected,safeLog:text,preservedComments:preserved,inputPreserved:true,copyMatches:true,errors},null,2));
});
test('older hosted-style catalog exposes verified Sol/Luna and discloses unverified server access', {timeout:90000}, async t=>{
 const dir=path.join(evidence,'older-catalog');fs.mkdirSync(dir,{recursive:true});
 const oldHarness=harness.replace(/models: async \(\) => .*?\n/, "models: async () => ({data:[{model:'gpt-6-astra',displayName:'GPT-6-Astra',supportedReasoningEfforts:['medium','ultra'],defaultReasoningEffort:'medium',serviceTiers:['priority']}]}),\n");
 const oldFixture=new Function('require','root','fs','path','assert','chromium','webkit',oldHarness+'; return requestBrowserFixture;')(require,root,fs,path,assert,chromium,webkit);
 const {page,errors}=await oldFixture(t,1,dir);
 await page.click('#ai-image-panel .ai-advanced-settings > summary');
 const options=await page.locator('#ai-image-panel [data-ai-model] option').evaluateAll(nodes=>nodes.map(node=>({value:node.value,label:node.textContent})));
 for(const model of ['gpt-6-sol','gpt-6-luna']){
  assert.ok(options.some(option=>option.value===model));
  await page.selectOption('#ai-image-panel [data-ai-model]',model);
  assert.match(await page.locator('#ai-image-panel [data-ai-model-warning]').textContent(),/지원은 아직 확인되지/);
 }
 await page.click('#ai-image-panel [data-ai-comments-apply]');
 await page.waitForFunction(()=>window.__task2.sends.length===1);
 const request=await page.evaluate(()=>{const {model,effort,serviceTier}=window.__task2.sends[0].payload;return {model,effort,serviceTier};});
 assert.equal(request.model,'gpt-6-luna');assert.equal(request.effort,'medium');
 await page.evaluate(()=>window.__task2.emit(0,'error'));
 await page.screenshot({path:path.join(dir,'selectable-models.png')});
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({options,request,errors,providerAvailability:'not verified; UI warning disclosed'},null,2));
});
