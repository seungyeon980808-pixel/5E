/* Isolated browsers and a controlled API: no account or paid AI requests. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, webkit, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const output = process.env.MOBILE_QA_OUT || '/tmp/5e-mobile-0918/qa';
const basePath = process.env.MOBILE_QA_BASE_PATH || '/preview/';
fs.mkdirSync(output, {recursive:true});
const types = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2','.otf':'font/otf','.wasm':'application/wasm'};
const server = http.createServer((req,res) => {
  const url = new URL(req.url,'http://localhost');
  const pathname = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
  const file = path.resolve(root, '.' + decodeURIComponent(pathname));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  try {res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}
  catch {res.writeHead(404).end();}
});
const report = {
  schema: 2,
  paidProviderCalls: 0,
  realDevices: false,
  controlledAuth: 'local route and synthetic token only',
  inputModes: {
    legacyPrimaryCrop: {chromium:'CDP Input.dispatchTouchEvent',webkit:'Playwright mouse'},
    boundaryNumericCrop: 'Playwright locator fill on numeric fields',
    boundaryPointerCancel: 'Playwright mouse plus synthetic DOM PointerEvent(pointercancel)',
  },
  scenarios: [], errors: [], runs: [], measurements: [],
  source: Object.fromEntries(['DESIGN.md', 'tests/manual/mobile-image-qa.cjs', 'preview/index.html', 'preview/css/mobile-image.css', 'preview/js/ai-panel.js', 'preview/js/main.js', 'preview/js/mobile-entry.js', 'preview/js/mobile-image.js', 'preview/js/panel-visibility.js', 'preview/js/web-login-ui.js']
    .map(file => [file, require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])),
};
const fixture = path.join(root,'tests/fixtures/rights-clear-smoke.png');
const png = 'data:image/png;base64,' + fs.readFileSync(fixture).toString('base64');
const expectedNames=['empty','mobile-share','home-reopen','source','processing','comparison','320','375','768','1280','landscape','keyboard-size','restored','failed','interrupted','controlled-auth-tab-return','desktop-preserved','crop-pixels-and-rect','crop-reverse-edge-small','cancel-keeps-reference','malformed-recovery','decode-close-reselect','busy-readonly-transition','secondary-pointer-cancel','bounded-large-image-measurement'];
report.expectedCases=['chromium','webkit'].flatMap(engine=>expectedNames.map(suffix=>({name:`${engine}-${suffix}`,status:'NOT_RUN'})));
report.implementation=[{name:'mobile-canvas-and-library-flow',status:'NOT_IMPLEMENTED',reason:'This approved crop repair does not implement the separately scoped mobile canvas/library work.'}];
async function snapshot(page, name) {
  await page.waitForFunction(() => Math.abs(document.querySelector('#ai-image-panel .ai-workbench').getBoundingClientRect().height - (window.visualViewport?.height || innerHeight)) < 2);
  await page.locator('#ai-image-panel .ai-preview-stage img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
  const geometry = await page.evaluate(() => {
    const panel = document.querySelector('#ai-image-panel .ai-workbench');
    const targets=[...document.querySelectorAll('#ai-image-panel button,#ai-image-panel select,#ai-image-panel summary,#ai-image-panel .ai-task-delete')].map(element=>({name:element.getAttribute('aria-label')||element.textContent.trim(),box:element.getBoundingClientRect()})).filter(item=>item.box.width>0&&item.box.height>0);
    return {smallTargets:targets.filter(item=>item.box.width<43||item.box.height<43).map(item=>({name:item.name,width:item.box.width,height:item.box.height})),viewport:[innerWidth,innerHeight],width:panel.clientWidth,scrollWidth:panel.scrollWidth,height:panel.getBoundingClientRect().height,stage:document.querySelector('#ai-image-panel').dataset.aiStage};
  });
  assert.deepEqual(geometry.smallTargets,[]);
  assert.ok(geometry.scrollWidth <= geometry.width + 1, JSON.stringify(geometry));
  await page.screenshot({path:path.join(output,name+'.png')});
  report.scenarios.push({name,geometry});
}
async function transport(context, connected=true) {
  const state = {connected,release:false,outcome:'completed',sends:[],sharePosts:[],delivered:false};
  await context.route('**/api/**', async route => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    if (requestUrl.pathname === '/api/shares' && request.method() === 'POST') {
      state.sharePosts.push(request.postDataJSON());
      await route.fulfill({status:201,json:{id:'c'.repeat(48),revokeKey:'d'.repeat(64),expiresAt:new Date(Date.now()+3600000).toISOString()}});
      return;
    }
    const action = requestUrl.pathname.split('/').pop();
    let result = {};
    if(action==='bridge-status') result={login:{loggedIn:state.connected},server:state.connected};
    if(action==='bridge-models') result={data:[{model:'gpt-5.6-sol',displayName:'Controlled QA',supportedReasoningEfforts:['medium','high'],serviceTiers:['priority']}]};
    if(action==='bridge-account') result={account:{name:'Controlled QA'},limits:{}};
    if(action==='bridge-send') {state.sends.push(route.request().postDataJSON());state.delivered=false;result={turnId:'mobile-qa-turn',renderThreadId:'mobile-qa-render'};}
    if(action==='bridge-interrupt') {state.release=true;state.outcome='interrupted';result={ok:true};}
    if(action==='bridge-events') {
      const events=[];
      if(state.release&&!state.delivered){state.delivered=true;
        const clientScope=state.sends.at(-1)?.clientScope||'';
        if(state.outcome==='completed')events.push({clientScope,method:'item/completed',params:{turnId:'mobile-qa-turn',item:{type:'imageGeneration',imageDataUrl:png}}});
        events.push({clientScope,method:'turn/completed',params:{turn:{id:'mobile-qa-turn',status:state.outcome,error:state.outcome==='failed'?'Controlled failure':null}}});
      }
      result={cursor:state.delivered?1:0,events};
    }
    if(action==='web-login-start')result={ticket:'a'.repeat(64),userCode:'QA-1234',authUrl:'https://auth.openai.com/qa-mobile'};
    if(action==='web-login-status')result=state.connected?{signedIn:true,token:'b'.repeat(64)}:{signedIn:false,state:'waiting'};
    if(action==='web-login-cancel')result={ok:true};
    await route.fulfill({json:result});
  });
  await context.route('https://auth.openai.com/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Controlled authentication tab</h1>'}));
  await context.addInitScript(({connected})=>{
    window.FIVE_E_SHARING_BASE_URL='https://five-e-ai-runtime-probe.onrender.com';
    localStorage.setItem('5e.tutorial.bannerSeen','true');
    localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true');
    if(connected)sessionStorage.setItem('5e:web-ai-session','f'.repeat(64));
  },{connected});
  return state;
}
async function runEngine(engine,device,base) {
  const browser=await engine.launch({headless:true});
  report.browsers ||= {};
  report.browsers[engine.name()] = {version:browser.version(),device,input:engine.name()==='chromium'?'CDP touch dispatch':'mouse dispatch (not touch evidence)'};
  try {
    const context=await browser.newContext({...devices[device],acceptDownloads:true});
    const api=await transport(context),page=await context.newPage();
    page.on('pageerror',e=>report.errors.push({engine:engine.name(),message:e.message}));
    await page.goto(base);
    await page.locator('[data-mobile-photo]').waitFor();
    await snapshot(page,engine.name()+'-empty');
    await page.locator('[data-mobile-share]').click();
    await page.locator('.ai-sharing-dialog[open]').waitFor();
    const sharingControls = await page.locator('.ai-sharing-dialog button,.ai-sharing-dialog [data-link],.ai-sharing-dialog label').evaluateAll(elements => elements.filter(element => {
      const box=element.getBoundingClientRect();
      return box.width>0&&box.height>0&&(box.width<43||box.height<43);
    }).map(element => ({name:element.getAttribute('aria-label')||element.textContent.trim(),width:element.getBoundingClientRect().width,height:element.getBoundingClientRect().height})));
    assert.deepEqual(sharingControls,[]);
    await page.locator('.ai-sharing-dialog [data-create]').click();
    await page.waitForFunction(()=>document.querySelector('.ai-sharing-dialog [data-link]').value.includes('#share='));
    assert.equal(api.sharePosts.length,1);
    await page.screenshot({path:path.join(output,engine.name()+'-mobile-share.png')});
    await page.locator('.ai-sharing-dialog [data-close]').click();
    assert.equal(await page.locator('[data-mobile-share]').evaluate(element=>document.activeElement===element),true);
    report.scenarios.push({name:engine.name()+'-mobile-share',sharingLink:true});
    await page.locator('#ai-image-panel [data-ai-close]').click();
    await page.screenshot({path:path.join(output,engine.name()+'-home.png')});
    report.scenarios.push({name:engine.name()+'-home-reopen'});
    await page.locator('[data-mobile-open]').click();
    await page.locator('#ai-image-panel').waitFor({state:'visible'});
    const taskTabsBeforeCancel = await page.locator('.ai-task-tab').count();
    await page.locator('[data-mobile-file]').setInputFiles(fixture);
    await page.locator('[data-crop-whole]:not([disabled])').waitFor();
    await page.locator('[data-crop-cancel]').click();
    assert.equal(await page.locator('.ai-task-tab').count(),taskTabsBeforeCancel);
    await page.locator('[data-mobile-file]').setInputFiles({name:'invalid.heic',mimeType:'image/heic',buffer:Buffer.from('invalid image')});
    await page.waitForFunction(()=>document.querySelector('[data-crop-status]').textContent.includes('JPEG'));
    await page.locator('[data-crop-cancel]').click();
    await page.locator('[data-mobile-file]').setInputFiles(fixture);
    await page.locator('[data-crop-whole]:not([disabled])').waitFor();
    const originalWidth=await page.locator('[data-crop-image]').evaluate(image=>image.naturalWidth);
    const b=await page.locator('[data-crop-stage]').boundingBox();
    if(engine.name()==='chromium') {
      const cdp=await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width*.1,y:b.y+b.height*.1}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+b.width*.8,y:b.y+b.height*.8}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await cdp.detach();
    } else {
      await page.mouse.move(b.x+b.width*.1,b.y+b.height*.1);await page.mouse.down();
      await page.mouse.move(b.x+b.width*.8,b.y+b.height*.8,{steps:4});await page.mouse.up();
    }
    await page.locator('[data-crop-apply]:not([disabled])').waitFor();
    await page.locator('[data-crop-field="w"]').fill('');
    await page.locator('[data-crop-field="w"]').pressSequentially('50.5');
    assert.equal(await page.locator('[data-crop-field="w"]').inputValue(),'50.5');
    await page.locator('[data-crop-field="w"]').fill('50');
    await page.screenshot({path:path.join(output,engine.name()+'-crop.png')});
    await page.locator('[data-crop-apply]').click();
    await page.locator('.mobile-crop-dialog').waitFor({state:'hidden'});
    await snapshot(page,engine.name()+'-source');
    assert.equal(await page.locator('#ai-image-panel .ai-reference-list .ai-preview-stage img').evaluate(image=>image.naturalWidth),Math.round(originalWidth*.5));
    await page.locator('#ai-image-panel [data-ai-send]').scrollIntoViewIfNeeded();
    assert.ok((await page.locator('#ai-image-panel [data-ai-send]').boundingBox()).height>=44);
    await page.screenshot({path:path.join(output,engine.name()+'-request.png')});
    await page.locator('#ai-image-panel [data-ai-send]').click();
    await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiBusy==='true');
    assert.equal(await page.locator('[data-mobile-photo]').isDisabled(),true);
    await page.locator('#ai-image-panel [data-ai-layout-mode="result"]').click();
    await page.locator('#ai-image-panel [data-ai-generating]').scrollIntoViewIfNeeded();
    await snapshot(page,engine.name()+'-processing');
    api.release=true;
    await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiBusy==='false'&&document.querySelectorAll('#ai-image-panel .ai-generated-card').length===1);
    assert.equal(api.sends.length,1);
    assert.equal(api.sends[0].purpose,'image');
    assert.equal(api.sends[0].attachments.length,1);
    await page.locator('#ai-image-panel [data-ai-layout-mode="side-by-side"]').click();
    await page.locator('#ai-image-panel .ai-compare-heading').scrollIntoViewIfNeeded();
    await snapshot(page,engine.name()+'-comparison');
    await page.locator('#ai-image-panel [data-ai-save-selected]').scrollIntoViewIfNeeded();
    const downloading=page.waitForEvent('download');await page.locator('#ai-image-panel [data-ai-save-selected]').click();
    const download=await downloading;assert.equal(await download.failure(),null);
    await download.saveAs(path.join(output,engine.name()+'-download.png'));
    assert.ok(fs.readFileSync(path.join(output,engine.name()+'-download.png')).subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
    for (const outcome of ['failed','interrupted']) {
      await page.locator('#ai-image-panel [data-ai-task-add]').click();
      await page.locator('[data-mobile-file]').setInputFiles(fixture);
      await page.locator('[data-crop-whole]:not([disabled])').waitFor();
      await page.locator('[data-crop-whole]').click();
      await page.locator('.mobile-crop-dialog').waitFor({state:'hidden'});
      api.release=false;api.outcome=outcome;
      await page.locator('#ai-image-panel [data-ai-send]').click();
      await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiBusy==='true');
      if(outcome==='interrupted') await page.locator('#ai-image-panel [data-ai-interrupt]').click();
      else api.release=true;
      await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiBusy==='false');
      assert.equal(await page.locator('[data-mobile-photo]').isEnabled(),true);
      await page.waitForFunction(outcome => outcome === 'failed'
        ? document.querySelector('#ai-image-panel [data-ai-status]').textContent.includes('실패')
        : /취소|중단/.test(document.querySelector('#ai-image-panel [data-ai-status]').textContent),outcome);
      await page.locator('#ai-image-panel [data-ai-status]').scrollIntoViewIfNeeded();
      await snapshot(page,engine.name()+'-'+outcome);
    }
    await page.locator('#ai-image-panel .ai-task-tab:not(.ai-task-add) .ai-task-tab-select').first().click();
    await page.locator('#ai-image-panel [data-ai-layout-mode="side-by-side"]').click();
    for(const width of [320,375,768,1280]) {
      await page.setViewportSize({width,height:800});await page.locator('#ai-image-panel .ai-compare-heading').scrollIntoViewIfNeeded();
      await snapshot(page,engine.name()+'-'+width);
    }
    await page.setViewportSize({width:844,height:390});await snapshot(page,engine.name()+'-landscape');
    await page.setViewportSize({width:375,height:350});
    await page.locator('#ai-image-panel [data-ai-side-tab="chat"]').click();
    await page.locator('#ai-image-panel [data-ai-chat-input]').fill('키보드 화면 축소 확인');
    await page.locator('#ai-image-panel [data-ai-chat-input]').scrollIntoViewIfNeeded();await snapshot(page,engine.name()+'-keyboard-size');
    await page.reload();await page.locator('#ai-image-panel .ai-generated-card').waitFor();
    await page.locator('#ai-image-panel [data-ai-layout-mode="result"]').click();
    await snapshot(page,engine.name()+'-restored');
    await page.setViewportSize({width:375,height:800});
    await context.close();
    const auth=await browser.newContext({...devices[device]});const login=await transport(auth,false);const authPage=await auth.newPage();
    await authPage.goto(base);await authPage.locator('[data-mobile-login]').click();
    await authPage.locator('[data-login-start]').click();await authPage.locator('[data-login-code]:not([hidden])').waitFor();
    await authPage.waitForFunction(()=>getComputedStyle(document.querySelector('.web-login-dialog')).transform==='none');
    const closeBox=await authPage.locator('.web-login-close').boundingBox();assert.ok(closeBox.width>=44&&closeBox.height>=44);
    await authPage.screenshot({path:path.join(output,engine.name()+'-auth-code.png')});
    const popupPromise=authPage.waitForEvent('popup');await authPage.locator('[data-login-start]').click();
    const popup=await popupPromise;await popup.waitForURL('https://auth.openai.com/**');
    login.connected=true;await authPage.bringToFront();
    await authPage.locator('.web-login-dialog').waitFor({state:'hidden'});
    assert.equal(await authPage.evaluate(()=>sessionStorage.getItem('5e:web-ai-session')),'b'.repeat(64));
    report.scenarios.push({name:engine.name()+'-controlled-auth-tab-return'});
    await auth.close();
    const desktop=await browser.newContext({viewport:{width:1280,height:900}});await transport(desktop);const dp=await desktop.newPage();await dp.goto(base);
    assert.equal(await dp.evaluate(()=>document.documentElement.classList.contains('mobile-image-mode')),false);
    assert.equal(await dp.locator('.mobile-image-toolbar').count(),0);
    report.scenarios.push({name:engine.name()+'-desktop-preserved'});await desktop.close();
  } finally {await browser.close();}
}
async function createBoundaryHarness(context,base) {
  const api=await transport(context);
  const page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  await context.tracing.start({screenshots:true,snapshots:true});
  await page.goto(base);
  await page.locator('[data-mobile-photo]').waitFor();
  const fixtureBytes=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');
    canvas.width=20;canvas.height=20;
    const context2d=canvas.getContext('2d');
    const pixels=context2d.createImageData(20,20);
    for(let y=0;y<20;y+=1)for(let x=0;x<20;x+=1){
      const at=(y*20+x)*4;
      pixels.data.set([x*11,y*11,(x*17+y*7)%256,255],at);
    }
    context2d.putImageData(pixels,0,0);
    return [...new Uint8Array(await(await fetch(canvas.toDataURL('image/png'))).arrayBuffer())];
  });
  const synthetic={name:'coordinate-grid.png',mimeType:'image/png',buffer:Buffer.from(fixtureBytes)};
  const select=async file=>{
    await page.locator('[data-mobile-file]').setInputFiles(file);
    await page.locator('[data-crop-whole]:not([disabled])').waitFor();
  };
  const fields=async fieldValues=>{
    for(const [key,value] of Object.entries(fieldValues)){
      await page.locator(`[data-crop-field="${key}"]`).fill(String(value));
    }
  };
  const values=async()=>Object.fromEntries(await Promise.all(['x','y','w','h'].map(async key=>[
    key,Number(await page.locator(`[data-crop-field="${key}"]`).inputValue()),
  ])));
  const apply=async()=>{
    await page.locator('[data-crop-apply]').click();
    await page.locator('.mobile-crop-dialog').waitFor({state:'hidden'});
  };
  const outputPixels=async points=>page.locator('#ai-image-panel .ai-reference-list .ai-preview-stage img').last().evaluate(async(image,samples)=>{
    await image.decode();
    const canvas=document.createElement('canvas');
    canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const context2d=canvas.getContext('2d');context2d.drawImage(image,0,0);
    return {width:canvas.width,height:canvas.height,pixels:samples.map(([x,y])=>[...context2d.getImageData(x,y,1,1).data])};
  },points);
  return {page,pageErrors,api,synthetic,select,fields,values,apply,outputPixels};
}

async function cropPixelsAndRect({page,synthetic,select,fields,values,apply,outputPixels}) {
  await select(synthetic);
  await fields({x:10,y:20,w:50,h:30});
  const rect=await values();
  assert.deepEqual(rect,{x:10,y:20,w:50,h:30});
  await apply();
  const pixels=await outputPixels([[0,0],[9,5]]);
  const expected=process.env.MOBILE_QA_INJECT_FIRST_BOUNDARY_FAILURE==='1'
    ? {width:10,height:6,pixels:[[255,0,255,255],[255,0,255,255]]}
    : {width:10,height:6,pixels:[[22,44,62,255],[121,99,250,255]]};
  assert.deepEqual(pixels,expected,process.env.MOBILE_QA_INJECT_FIRST_BOUNDARY_FAILURE==='1'
    ? 'injected incorrect expected decoded pixels'
    : 'decoded crop pixels did not match the source grid');
  return {input:{selection:'file input locator',crop:'numeric field locators',verification:'decoded output canvas pixels'},rect,pixels};
}

async function cropReverseEdgeSmall({context,page,synthetic,select,fields,values,apply,outputPixels},engineName) {
  await select(synthetic);
  const stage=await page.locator('[data-crop-stage]').boundingBox();
  let pointerInput;
  if(engineName==='chromium'){
    pointerInput='CDP Input.dispatchTouchEvent';
    const cdp=await context.newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:stage.x+stage.width*.8,y:stage.y+stage.height*.85}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:stage.x+stage.width*.2,y:stage.y+stage.height*.35}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    } finally {await cdp.detach();}
  } else {
    pointerInput='Playwright mouse (not native touch evidence)';
    await page.mouse.move(stage.x+stage.width*.8,stage.y+stage.height*.85);
    await page.mouse.down();
    await page.mouse.move(stage.x+stage.width*.2,stage.y+stage.height*.35);
    await page.mouse.up();
  }
  const reverse=await values();
  assert.ok(reverse.x>0&&reverse.y>0&&reverse.w>0&&reverse.h>0&&reverse.w!==reverse.h,JSON.stringify(reverse));
  await fields({x:90,y:80,w:100,h:100});
  await apply();
  const edge=await outputPixels([[0,0],[1,3]]);
  assert.deepEqual(edge,{width:2,height:4,pixels:[[198,176,162,255],[209,209,200,255]]});
  await select(synthetic);
  await fields({x:0,y:0,w:1,h:1});
  await apply();
  const small=await outputPixels([[0,0]]);
  assert.deepEqual(small,{width:1,height:1,pixels:[[0,0,0,255]]});
  return {input:{pointer:pointerInput,edgeAndSmall:'numeric field locators'},reverse,edge,small};
}

async function cancelKeepsReference({page,synthetic,select,fields,apply}) {
  await select(synthetic);await page.locator('[data-crop-whole]').click();
  await page.locator('.mobile-crop-dialog').waitFor({state:'hidden'});
  const image=page.locator('#ai-image-panel .ai-reference-list .ai-preview-stage img').last();
  const before=await image.evaluate(node=>node.src);
  await select(synthetic);await fields({x:10,y:20,w:50,h:30});
  await page.locator('[data-crop-cancel]').click();
  assert.equal(await image.evaluate(node=>node.src),before);
  return {input:{selection:'file input locator',crop:'numeric field locators',cancel:'button locator'},referencePreserved:true};
}

async function malformedRecovery({page,synthetic,select}) {
  await page.locator('[data-mobile-file]').setInputFiles({name:'invalid.heic',mimeType:'image/heic',buffer:Buffer.from('invalid image')});
  await page.waitForFunction(()=>document.querySelector('[data-crop-status]').textContent.includes('JPEG'));
  await page.locator('[data-crop-cancel]').click();
  await select(synthetic);
  return {input:{invalidAndRecovery:'file input locator'},recovered:true};
}

async function decodeCloseReselect({page,synthetic,select}) {
  await page.evaluate(()=>{
    const decode=HTMLImageElement.prototype.decode;let delayed=true;
    HTMLImageElement.prototype.decode=function(){
      if(delayed&&this.alt==='선택한 사진'){
        delayed=false;
        return new Promise((resolve,reject)=>setTimeout(()=>decode.call(this).then(resolve,reject),150));
      }
      return decode.call(this);
    };
  });
  await page.locator('[data-mobile-file]').setInputFiles(synthetic);
  await page.locator('.mobile-crop-dialog').waitFor({state:'visible'});
  await page.locator('[data-crop-cancel]').click();
  await select(synthetic);
  await page.waitForTimeout(180);
  assert.equal(await page.locator('[data-crop-whole]').isEnabled(),true);
  return {input:{selection:'file input locator',decodeDelay:'context-local HTMLImageElement.decode patch'},reselected:true};
}

async function busyReadonlyTransition({page,api,synthetic,select}) {
  await select(synthetic);await page.locator('[data-crop-whole]').click();
  await page.locator('.mobile-crop-dialog').waitFor({state:'hidden'});
  await page.locator('#ai-image-panel [data-ai-send]').click();
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiBusy==='true');
  assert.equal(await page.locator('[data-mobile-photo]').isDisabled(),true);
  api.release=true;
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiBusy==='false');
  await page.evaluate(()=>{document.querySelector('#ai-image-panel').dataset.aiSharingMode='view';});
  await page.waitForFunction(()=>document.querySelector('[data-mobile-photo]').disabled);
  await page.evaluate(()=>{document.querySelector('#ai-image-panel').dataset.aiSharingMode='edit';});
  await page.waitForFunction(()=>!document.querySelector('[data-mobile-photo]').disabled);
  return {input:{selection:'file input locator',crop:'whole-image button locator',send:'button locator',sharingMode:'controlled panel state'},transitionVerified:true};
}

async function secondaryPointerCancel({page,synthetic,select,values}) {
  await select(synthetic);
  let stage=await page.locator('[data-crop-stage]').boundingBox();
  await page.mouse.move(stage.x+stage.width*.2,stage.y+stage.height*.2);await page.mouse.down();
  await page.mouse.move(stage.x+stage.width*.7,stage.y+stage.height*.6);
  const beforeSecondary=await values();
  await page.locator('[data-crop-stage]').evaluate(node=>node.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:2,pointerType:'touch'})));
  await page.mouse.up();
  const secondary=await values();
  assert.deepEqual(secondary,beforeSecondary,`synthetic secondary pointercancel erased primary crop: ${JSON.stringify(secondary)}`);
  await select(synthetic);stage=await page.locator('[data-crop-stage]').boundingBox();
  await page.mouse.move(stage.x+stage.width*.2,stage.y+stage.height*.2);await page.mouse.down();
  await page.mouse.move(stage.x+stage.width*.7,stage.y+stage.height*.6);
  await page.locator('[data-crop-stage]').evaluate(node=>node.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1,pointerType:'mouse'})));
  await page.mouse.up();
  const primaryCancel=await values();
  assert.deepEqual(primaryCancel,{x:0,y:0,w:100,h:100},`primary pointercancel did not restore previous crop: ${JSON.stringify(primaryCancel)}`);
  return {input:{primaryGesture:'Playwright mouse',cancelEvents:'synthetic DOM PointerEvent(pointercancel)'},beforeSecondary,secondary,primaryCancel};
}

async function boundedLargeImageMeasurement({page,select},engineName) {
  const largeBytes=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1536;
    const context2d=canvas.getContext('2d');context2d.fillStyle='#456';context2d.fillRect(0,0,canvas.width,canvas.height);
    return [...new Uint8Array(await(await fetch(canvas.toDataURL('image/png'))).arrayBuffer())];
  });
  const started=Date.now();
  await select({name:'bounded-2048x1536.png',mimeType:'image/png',buffer:Buffer.from(largeBytes)});
  const measurement={input:'file input locator (select and decode timing only)',width:2048,height:1536,decodedBytes:2048*1536*4,inputBytes:largeBytes.length,decodeAndDialogMs:Date.now()-started,policy:'measurement only; no input limit applied'};
  report.measurements.push({engine:engineName,...measurement});
  return measurement;
}

const boundaryCases=[
  ['crop-pixels-and-rect',cropPixelsAndRect],
  ['crop-reverse-edge-small',cropReverseEdgeSmall],
  ['cancel-keeps-reference',cancelKeepsReference],
  ['malformed-recovery',malformedRecovery],
  ['decode-close-reselect',decodeCloseReselect],
  ['busy-readonly-transition',busyReadonlyTransition],
  ['secondary-pointer-cancel',secondaryPointerCancel],
  ['bounded-large-image-measurement',boundedLargeImageMeasurement],
];

function errorStatus(error) {
  return /Executable doesn't exist|browserType\.launch|Target page, context or browser has been closed/i.test(error.message)?'ERROR':'FAIL';
}

async function runBoundaryCase(browser,engineName,device,base,suffix,test) {
  const caseName=`${engineName}-${suffix}`;
  const traceFile=path.join(output,`${caseName}-trace.zip`);
  const screenshotFile=path.join(output,`${caseName}-failure.png`);
  let harness,detail,testError,artifactError;
  try {
    const context=await browser.newContext({...devices[device],acceptDownloads:true});
    harness={context};
    Object.assign(harness,await createBoundaryHarness(context,base));
    detail=await test(harness,engineName);
    assert.deepEqual(harness.pageErrors,[],`page errors in ${caseName}`);
  } catch(error) {
    testError=error;
    if(harness?.page){
      try {await harness.page.screenshot({path:screenshotFile,fullPage:true});}
      catch(screenshotError){artifactError=screenshotError;report.errors.push({name:`${caseName}-screenshot`,status:'ERROR',message:screenshotError.message});}
    }
  } finally {
    if(harness?.context){
      try {await harness.context.tracing.stop({path:traceFile});}
      catch(traceError){artifactError ||= traceError;report.errors.push({name:`${caseName}-trace`,status:'ERROR',message:traceError.message});}
      try {await harness.context.close();}
      catch(closeError){artifactError ||= closeError;report.errors.push({name:`${caseName}-context-close`,status:'ERROR',message:closeError.message});}
    }
  }
  const status=artifactError?'ERROR':testError?errorStatus(testError):'PASS';
  const result={name:caseName,status,...detail,trace:path.basename(traceFile)};
  if(testError)result.error=testError.stack;
  if(testError&&!artifactError)result.failureScreenshot=path.basename(screenshotFile);
  report.scenarios.push(result);
  report.runs.push({name:caseName,status,error:testError?.stack});
  if(testError)report.errors.push({name:caseName,status,message:testError.message});
  return status;
}

async function runCropBoundaries(engine,device,base) {
  const engineName=engine.name();
  let browser;
  try {
    browser=await engine.launch({headless:true});
    report.browsers ||= {};
    report.browsers[engineName]={...report.browsers[engineName],version:browser.version(),boundaryContexts:'fresh context per case'};
  } catch(error) {
    for(const [suffix] of boundaryCases){
      const name=`${engineName}-${suffix}`;
      report.scenarios.push({name,status:'ERROR',error:error.stack});
      report.runs.push({name,status:'ERROR',error:error.stack});
      report.errors.push({name,status:'ERROR',message:error.message});
    }
    return 'ERROR';
  }
  const statuses=[];
  try {
    for(const [suffix,test] of boundaryCases){
      statuses.push(await runBoundaryCase(browser,engineName,device,base,suffix,test));
    }
  } finally {
    try {await browser.close();}
    catch(error){report.errors.push({name:`${engineName}-boundary-browser-close`,status:'ERROR',message:error.message});statuses.push('ERROR');}
  }
  return statuses.includes('ERROR')?'ERROR':statuses.includes('FAIL')?'FAIL':'PASS';
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port+basePath;
  try {
    for(const [engine,device] of [[chromium,'Pixel 7'],[webkit,'iPhone 13']]) {
      const name=engine.name();
      try {await runEngine(engine,device,base);report.runs.push({name:`${name}-legacy-32`,status:'PASS'});}
      catch(error){
        const status=errorStatus(error);
        report.runs.push({name:`${name}-legacy-32`,status,error:error.stack});
        report.errors.push({name:`${name}-legacy-32`,status,message:error.message});
        const missing=expectedNames.slice(0,16).map(suffix=>`${name}-${suffix}`).find(caseName=>!report.scenarios.some(scenario=>scenario.name===caseName));
        if(missing)report.scenarios.push({name:missing,status,error:error.stack,reason:'legacy sequential flow stopped at this expected checkpoint; dependent later checkpoints were not run'});
      }
      try {
        const status=await runCropBoundaries(engine,device,base);
        report.runs.push({name:`${name}-crop-boundaries`,status});
      }
      catch(error){const status=/Executable doesn't exist|browserType\.launch/i.test(error.message)?'ERROR':'FAIL';report.runs.push({name:`${name}-crop-boundaries`,status,error:error.stack});report.errors.push({name:`${name}-crop-boundaries`,status,message:error.message});}
    }
  } finally {
    for(const item of report.scenarios) item.status ||= 'PASS';
    for(const item of report.expectedCases) {
      const scenario=report.scenarios.find(candidate=>candidate.name===item.name);
      item.status=scenario?.status||'NOT_RUN';
      if(scenario?.error)item.error=scenario.error;
      if(scenario?.reason)item.reason=scenario.reason;
    }
    report.scenarios.push({name:'physical-phone-photo-flow',status:'NOT_RUN',reason:'No physical iOS Safari or Android Chrome session is attached.'},{name:'live-auth-and-provider-generation',status:'NOT_RUN',reason:'Controlled QA intentionally blocks real authentication and paid calls.'});
    report.executedCases=report.expectedCases.reduce((counts,item)=>({...counts,[item.status]:(counts[item.status]||0)+1}),{});
    report.exitStatus=report.errors.length?'FAIL':'PASS';
    fs.writeFileSync(path.join(output,'source-manifest.json'),JSON.stringify({source:report.source,browsers:report.browsers},null,2));
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));server.close();
  }
  if(report.exitStatus!=='PASS')process.exitCode=1;
})();
