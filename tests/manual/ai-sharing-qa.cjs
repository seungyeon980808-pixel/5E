const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createSharingStore, TTL } = require('../../experiments/web-codex-auth/sharing-store.cjs');
const { handleSharing } = require('../../experiments/web-codex-auth/sharing-routes.cjs');
const root = path.resolve(__dirname,'../..');
const output = process.env.SHARING_QA_OUT || fs.mkdtempSync(path.join(os.tmpdir(),'5e-sharing-qa-'));
fs.mkdirSync(output,{recursive:true});
let clock=Date.now();
const store=createSharingStore({now:()=>clock});
const types={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.otf':'font/otf','.wasm':'application/wasm'};
const server=http.createServer(async(req,res)=>{
  const origin=`http://127.0.0.1:${server.address().port}`;
  const reply=(code,body,type='application/json')=>{res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);};
  if(await handleSharing(req,reply,store,origin))return;
  const url=new URL(req.url,origin);
  if(url.pathname==='/seed.html')return reply(200,'<!doctype html><html><body>Isolated QA seed</body></html>','text/html');
  const relative=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);
  const file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep))return reply(403,'{}');
  try{return reply(200,fs.readFileSync(file),types[path.extname(file)]||'application/octet-stream');}catch{return reply(404,'{}');}
});
const results=[], errors=[];
async function setupContext(browser) {
  const context=await browser.newContext({viewport:{width:1280,height:900},permissions:['clipboard-read','clipboard-write']});
  await context.route('https://five-e-ai-runtime-probe.onrender.com/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({login:{loggedIn:false},server:false})}));
  await context.addInitScript(()=>{localStorage.setItem('5e.tutorial.bannerSeen','true');});
  return context;
}
async function load(page,url) {
  await page.goto(url,{waitUntil:'domcontentloaded'});
  page.on('pageerror',error=>errors.push(error.message));
  await page.locator('#sharing-btn').waitFor();
  const skip=page.getByRole('button',{name:'건너뛰기',exact:true});
  if(await skip.isVisible())await skip.click();
}
async function seed(page,base) {
  await page.goto(base+'/seed.html');
  return page.evaluate(async()=>{
    const {IndexedDBOutputCacheBackend}=await import('/js/ai-output-cache-store.js');
    const crop=async(file,x,y,w,h)=>{
      const image=new Image();image.src=file;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(image,x,y,w,h,0,0,w,h);return canvas.toDataURL('image/png');
    };
    const a=await crop('/assets/exam-library/images/p1_2025_11_05.png',0,0,160,100);
    const b=await crop('/assets/exam-library/images/p1_2026_06_12.png',10,10,120,100);
    const raw=await fetch('/results/exam-diagram-engine-v2-1/final/v21-sketch-chemistry-chromatography/attempt-01/generated.png');
    const result=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);raw.blob().then(blob=>reader.readAsDataURL(blob));});
    const sources=[{id:'src-a',name:'PDF A · 3쪽 크롭',data:a,kind:'reference',sourceKind:'pdf-crop',source:{path:'/Users/private/A.pdf',page:3,crop:{x:0,y:0,width:160,height:100}}},{id:'src-b',name:'PDF B · 7쪽 크롭',data:b,kind:'reference',sourceKind:'pdf-crop',source:{path:'/Users/private/B.pdf',page:7,crop:{x:10,y:10,width:120,height:100}}}];
    const generated=[{id:'v1',name:'첫 결과',data:result,kind:'generated',rendererPrompt:'fixture first version',reviewState:'idle'},{id:'v2',name:'수정 결과',data:result,kind:'generated',rendererPrompt:'fixture second version',reviewState:'idle'}];
    const snapshot={key:'workspace',tabs:[{id:'task-a',title:'여러 원본 작업',attachments:sources,generated,selectedCandidateId:'v1',input:'두 원본의 배치를 유지하세요',conversationId:'private-provider-session',conversationMessages:[{role:'user',text:'원본을 유지'}],workState:'completed',outputEngine:'imagegen',referenceComposition:{orientation:'free',sourceOrder:['src-b','src-a'],layout:{width:500,height:300,placements:[{sourceId:'src-b',x:20,y:30,width:120,height:100},{sourceId:'src-a',x:200,y:70,width:160,height:100}]}},workbenchViewState:{layout:'side-by-side',selectedCandidateId:'v1',selectedSourceId:'src-b',zoom:{source:1.5,result:2},tracking:false,scroll:{source:{left:0,top:0},result:{left:0,top:0}}}}],activeTaskTabId:'task-a',taskTabSerial:1,imageSerial:4};
    await new IndexedDBOutputCacheBackend({databaseName:'5e-ai-image-tasks',storeName:'tasks'}).put(snapshot);
    const scope='12345678-1234-1234-1234-123456789abc';
    await new IndexedDBOutputCacheBackend({databaseName:`5e-ai-image-tasks-${scope}`,storeName:'tasks'}).put({...snapshot,tabs:[{...snapshot.tabs[0],id:'task-b',title:'두 번째 작업대',attachments:[sources[0]],generated:[],selectedCandidateId:null}],activeTaskTabId:'task-b'});
    localStorage.setItem('5e.aiParallelWorkspaces.v1',JSON.stringify([scope]));
    sessionStorage.setItem('5e:web-ai-session','e'.repeat(64));
    return {a,b,result};
  });
}
async function receivedState(page,id) {
  return page.evaluate(async id=>{
    const {idbGet}=await import('/js/idb-store.js');const {IndexedDBOutputCacheBackend}=await import('/js/ai-output-cache-store.js');
    const scopes=(await idbGet('sharing:imports'))[id].scopes;
    return Promise.all(scopes.map(scope=>new IndexedDBOutputCacheBackend({databaseName:`5e-ai-image-tasks-${scope}`,storeName:'tasks'}).get('workspace')));
  },id);
}
async function run() {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:process.env.SHARING_QA_HEADED!=='1'});
  try{
    const sender=await setupContext(browser), page=await sender.newPage();const expected=await seed(page,base);
    await load(page,base+'/');await page.locator('#sharing-btn').click();
    for(const width of [375,768,1280]){
      await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(output,`dialog-${width}.png`)});
      const box=await page.locator('.ai-sharing-dialog').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);
    }
    results.push('dialog has no horizontal overflow at 375/768/1280');
    await page.locator('[data-create]').click();await page.waitForFunction(()=>document.querySelector('[data-link]').value.includes('#share='));
    const link=await page.locator('[data-link]').inputValue();const id=new URL(link).hash.slice(7);const doc=store.get(id);
    assert.equal(doc.workspaces.length,2);assert.equal(doc.mode,'view');
    assert.equal(doc.workspaces[0].tabs[0].attachments[0].data,expected.a);assert.equal(doc.workspaces[0].tabs[0].attachments[1].data,expected.b);
    assert.equal(JSON.stringify(doc).includes('private-provider-session'),false);assert.equal(JSON.stringify(doc).includes('e'.repeat(64)),false);assert.equal(JSON.stringify(doc).includes('/Users/private'),false);
    await page.locator('[data-copy]').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),link);
    results.push('sender links contain both workspaces, crop bytes and versions, no auth or local paths; real clipboard copy works');
    const receiver=await setupContext(browser), view=await receiver.newPage();await load(view,link);
    await view.locator('#ai-sharing-received').waitFor();await view.locator('#ai-image-panel').waitFor({state:'visible'});
    assert.equal(await view.locator('#ai-image-panel').getAttribute('data-ai-sharing-mode'),'view');
    assert.equal(await view.locator('#ai-image-panel [data-ai-input]').isDisabled(),true);
    assert.equal(await view.locator('#ai-image-panel [data-ai-send]').isDisabled(),true);
    const state=await receivedState(view,id);assert.equal(state[0].tabs[0].generated.length,2);assert.equal(state[0].tabs[0].selectedCandidateId,'v1');assert.deepEqual(state[0].tabs[0].referenceComposition,doc.workspaces[0].tabs[0].referenceComposition);assert.equal(state[0].tabs[0].workbenchViewState.selectedSourceId,'src-b');
    await view.locator('#ai-image-panel [data-ai-version-button]').click();await view.locator('#ai-image-panel [data-ai-candidate-option="v2"]').click();
    assert.equal(await view.locator('#ai-image-panel').getAttribute('data-ai-selected-candidate-id'),'v2');
    await view.locator('#ai-image-panel [data-ai-layout-mode="result"]').click();
    await view.keyboard.press('Delete');assert.equal((await receivedState(view,id))[0].tabs.length,1);
    await view.screenshot({path:path.join(output,'receiver-view-1280.png')});
    results.push('view-only blocks prompt/AI/delete and supports version/compare navigation; layout, selected source and bytes restored');
    clock+=TTL;store.sweep();assert.throws(()=>store.get(id),{status:410});assert.deepEqual(fs.readdirSync(store.root),[]);
    await view.reload();await view.locator('#ai-sharing-received').waitFor();assert.equal((await receivedState(view,id))[0].tabs[0].attachments[1].data,expected.b);
    results.push('server expiry deletes document/image file; same receiver reloads its IndexedDB copy afterward');
    const expiredContext=await setupContext(browser), expired=await expiredContext.newPage();await load(expired,link);await expired.waitForFunction(()=>document.querySelector('[data-status]').textContent.includes('만료'));await expired.screenshot({path:path.join(output,'expired-link.png')});
    results.push('fresh browser cannot receive expired link');
    await page.locator('[value="edit"]').check();await page.locator('[data-create]').click();await page.waitForFunction(old=>document.querySelector('[data-link]').value!==old,link);const editLink=await page.locator('[data-link]').inputValue();const editId=new URL(editLink).hash.slice(7);
    const editorContext=await setupContext(browser), editor=await editorContext.newPage();await load(editor,editLink);await editor.locator('#ai-sharing-received').waitFor();
    await editor.locator('#ai-image-panel [data-ai-comment-tool="point"]').click();
    const picture=editor.locator('#ai-image-panel .is-ai-active-candidate .ai-preview-stage img');const box=await picture.boundingBox();await editor.mouse.click(box.x+Math.min(100,box.width/2),box.y+Math.min(100,box.height/2));
    await editor.locator('#ai-image-panel [data-ai-inline-editor]').fill('수신자 수정');await editor.locator('#ai-image-panel [data-ai-close]').click();
    await editor.waitForFunction(async id=>{const {idbGet}=await import('/js/idb-store.js');const {IndexedDBOutputCacheBackend}=await import('/js/ai-output-cache-store.js');const scope=(await idbGet('sharing:imports'))[id].scopes[0];return(await new IndexedDBOutputCacheBackend({databaseName:`5e-ai-image-tasks-${scope}`,storeName:'tasks'}).get('workspace')).tabs[0].generated[0].comments?.[0]?.text==='수신자 수정';},editId);
    assert.equal(store.get(editId).workspaces[0].tabs[0].generated[0].comments?.length||0,0);assert.equal((await receivedState(editor,editId))[0].tabs[0].conversationId,null);
    results.push('editable recipient changes its own persisted copy only; provider conversation resets for own AI account');
    const failureContext=await setupContext(browser);await failureContext.addInitScript(()=>{const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,key){if(typeof key==='string'&&key.startsWith('sharing:received:'))throw new DOMException('QA quota failure','QuotaExceededError');return original.call(this,value,key);};});
    const failure=await failureContext.newPage();await load(failure,editLink);await failure.waitForFunction(()=>document.querySelector('[data-status]').textContent.includes('브라우저 저장 공간이 부족'));assert.equal(await failure.locator('#ai-sharing-received').count(),0);await failure.screenshot({path:path.join(output,'storage-failure.png')});results.push('IndexedDB quota failure displays explicit error and never claims saved');
    await page.locator('[data-revoke]').click();await page.waitForFunction(()=>document.querySelector('[data-status]').textContent.includes('해제했습니다'));assert.throws(()=>store.get(editId),{status:410});
    await editor.evaluate(()=>localStorage.removeItem('5e.aiParallelWorkspaces.v1'));
    await editor.reload();await editor.locator('#ai-sharing-received').waitFor();assert.equal((await receivedState(editor,editId))[0].tabs[0].generated[0].comments[0].text,'수신자 수정');results.push('revocation denies new access and retains receiver edits even after the workspace registry is cleared');
    await page.locator('[data-close]').click();await page.setViewportSize({width:1280,height:900});await page.screenshot({path:path.join(output,'toolbar-1280.png')});
    const order=await page.locator('.canvas-toolbar .shell-icon-button').evaluateAll(buttons=>buttons.map(button=>button.id));assert.deepEqual(order.slice(0,4),['settings-menu-btn','file-menu-btn','sharing-btn','tutorial-btn']);
    assert.deepEqual(errors,[]);
    fs.rmSync(path.join(output,'failure.txt'),{force:true});
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({results,errors,base,output},null,2));console.log(JSON.stringify({results,errors,output},null,2));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));store.close();}
}
run().catch(error=>{console.error(error);fs.writeFileSync(path.join(output,'failure.txt'),String(error.stack));process.exitCode=1;});
