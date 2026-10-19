const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { entryConfiguration, mainModuleUrl, runtimeConfiguration, assertLoadedRuntime } = require('./four-session-entry.cjs');
const localPages=new WeakSet();
const runtimes=new WeakMap();
const resources=new WeakMap();

async function waitForState(page,predicate,arg,{timeout=60000}={}) {
  return page.evaluate(({source,arg,timeout,stateUrl})=>new Promise((resolve,reject)=>{
    const condition=(0,eval)('('+source+')'),cleanups=[],documents=new WeakSet(),buses=new WeakSet();
    let ended=false,checking=false,changed=false;
    const timer=setTimeout(()=>finish(new Error('RHWP state transition deadline')),timeout);
    function finish(error){if(ended)return;ended=true;clearTimeout(timer);for(const cleanup of cleanups)cleanup();error?reject(error):resolve();}
    function connect(doc){
      if(!doc?.documentElement||documents.has(doc))return;
      documents.add(doc);
      const observer=new MutationObserver(()=>{frames(doc);check();});
      observer.observe(doc.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});
      cleanups.push(()=>observer.disconnect());
      doc.addEventListener('load',loaded,true);cleanups.push(()=>doc.removeEventListener('load',loaded,true));
      frames(doc);
    }
    function loaded(event){if(event.target?.tagName==='IFRAME')connect(event.target.contentDocument);check();}
    function frames(doc){
      for(const frame of doc.querySelectorAll('iframe')){
        connect(frame.contentDocument);
        const bus=frame.contentWindow?.rhwpStudio?.plugins?.deps?.eventBus;
        if(bus&&!buses.has(bus)){
          buses.add(bus);
          for(const name of ['document-changed','document-mutated','document-layout-refreshed','zoom-raster-ready','zoom-changed','picture-object-selection-changed']){
            const off=bus.on(name,check);
            cleanups.push(()=>typeof off==='function'?off():bus.off?.(name,check));
          }
        }
      }
    }
    async function check(){
      if(ended)return;
      if(checking){changed=true;return;}
      checking=true;
      try{if(await condition(arg))finish();}
      catch(error){finish(error);}
      finally{checking=false;if(changed&&!ended){changed=false;void check();}}
    }
    connect(document);
    const transaction=IDBDatabase.prototype.transaction;
    function trackedTransaction(...args){
      const result=transaction.apply(this,args);
      if(result.mode==='readwrite')result.addEventListener('complete',check,{once:true});
      return result;
    }
    IDBDatabase.prototype.transaction=trackedTransaction;
    cleanups.push(()=>{if(IDBDatabase.prototype.transaction===trackedTransaction)IDBDatabase.prototype.transaction=transaction;});
    if(stateUrl)void import(stateUrl).then(({state})=>{
      if(!ended){cleanups.push(state.subscribe(check));void check();}
    },finish);
    void check();
  }),{source:predicate.toString(),arg,timeout,stateUrl:runtimes.get(page)?.stateUrl});
}

const welcomeSeeded=new WeakSet();
async function navigate(page,url,options={}) {
  // 다른 검사들처럼 첫 방문 튜토리얼 환영 창을 본 것으로 둔다. 바쁠 때 환영 창이 ready 뒤 늦게 떠 단추를 가리는 흔들림을 막는다.
  if(!welcomeSeeded.has(page)){welcomeSeeded.add(page);await page.addInitScript(()=>{for(const prefix of ['','5e.preview:'])try{localStorage.setItem(prefix+'5e.tutorial.bannerSeen','true');}catch{}});}
  const entry=new URL(url), root=path.resolve(__dirname,'../..');
  const config=entryConfiguration({...process.env,APP_ENTRY:entry.pathname});
  const html=fs.readFileSync(path.join(root,entry.pathname==='/'?'index.html':'preview/index.html'),'utf8');
  const main=fs.readFileSync(path.join(root,'js/main.js'),'utf8');
  runtimes.set(page,runtimeConfiguration(config,entry.href,mainModuleUrl(html,entry.href),main));
  const loaded=[];resources.set(page,loaded);
  page.on('response',response=>loaded.push(response.url()));
  if(!localPages.has(page)){
    localPages.add(page);
    // Remote UI fonts are unrelated to document geometry and can leave load
    // pending. Keep these local regressions deterministic; preserve mock routes.
    await page.route('**/*',route=>{
      const u=new URL(route.request().url());
      return ['http:','https:'].includes(u.protocol)&&!['127.0.0.1','localhost'].includes(u.hostname)?route.abort():route.fallback();
    });
  }
  return page.goto(url,{waitUntil:'domcontentloaded',...options});
}

// The suite runner supplies RELEASE_URL; standalone runs use the same server on
// an ephemeral port so concurrently running workers never share a document.
async function withServer(run, { isolated = false } = {}) {
  const configured = !isolated && (process.env.EXAM_URL || process.env.RELEASE_URL);
  if (configured) return run(new URL(configured).origin);
  const root = path.resolve(__dirname, '../..');
  const child = spawn(process.execPath, ['scripts/preview-local-server.cjs'], {
    cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  try {
    const origin = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => finish(new Error('RHWP preview server did not start')), 10000);
      const finish = (error, value) => {
        clearTimeout(timer);
        child.off('error', failed); child.off('exit', exited); child.stdout.off('data', read);
        error ? reject(error) : resolve(value);
      };
      const failed = error => finish(error);
      const exited = code => finish(new Error(`RHWP preview server exited with ${code}`));
      const read = chunk => {
        output += chunk.toString();
        const match = output.match(/Local preview: (http:\/\/127\.0\.0\.1:\d+)\/preview\//);
        if (match) finish(null, match[1]);
      };
      child.once('error', failed); child.once('exit', exited); child.stdout.on('data', read);
    });
    const response = await fetch(new URL('/', origin));
    assert.equal(response.status, 200, 'local preview responds before browser navigation');
    return await run(origin);
  } finally {
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      await new Promise(resolve => {
        const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
        child.kill('SIGTERM');
      });
    }
  }
}
async function ready(page) {
  await page.waitForSelector('#exam-send',{timeout:60000});
  const skip=page.getByRole('button',{name:'건너뛰기',exact:true});if(await skip.isVisible())await skip.click();
  if(await page.locator('#rhwp-exam-workspace').isVisible())await idle(page);
  assertLoadedRuntime(runtimes.get(page),resources.get(page));
}
async function idle(page) {
  await waitForState(page,()=>document.querySelector('#rhwp-exam-workspace')?.getAttribute('aria-busy')==='false');
}
async function action(page,name) {
  const button = page.locator(`[data-exam-action="${name}"]`);
  if (!await button.isVisible()) {
    const menu = await button.evaluate(element => element.closest('.exam-menu')?.querySelector('[data-exam-menu]')?.dataset.examMenu);
    if (menu) await page.locator(`[data-exam-menu="${menu}"]`).click();
    else if(['edit','labels'].includes(name))await page.locator('[data-picture-modify]').click();
  }
  await button.click();
  if (name === 'close') {
    await idle(page);
    assert.equal(await page.locator('#exam-status').getAttribute('data-error'),'false',await page.locator('#exam-status').textContent());
    await page.locator('#rhwp-exam-workspace').waitFor({state:'hidden'});
  }
}
async function crop(page,button='#exam-send') {
  await page.locator(button).click();
  if (button === '#exam-send') await page.locator('[data-exam-document-insert]').click();
  await page.locator('.capture-overlay').waitFor();
  if(await page.locator('#capture-confirm').isVisible()){await page.locator('#capture-confirm').click();return;}
  const box=await page.locator('#canvas').boundingBox();
  await page.mouse.move(box.x+box.width*.35,box.y+box.height*.35);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.65,box.y+box.height*.65);await page.mouse.up();
  assert.equal(await page.locator('#capture-confirm').textContent(),'확인');
  await page.locator('#capture-confirm').click();
}
async function point(page,which='body',index=0) {
  // Native replacement paints after the host busy flag; hit-test the new frame.
  await waitForState(page,() => {
    const frame=document.querySelector('#exam-studio iframe');
    return frame && [...frame.contentDocument.querySelectorAll('#scroll-content canvas')].some(canvas=>canvas.width>100&&canvas.getBoundingClientRect().width>100);
  });
  return page.evaluate(({which,index})=>{
    const frame=document.querySelector('#exam-studio iframe'),deps=frame.contentWindow.rhwpStudio.plugins.deps;
    const canvas=[...frame.contentDocument.querySelectorAll('#scroll-content canvas')].find(canvas=>canvas.width>100&&canvas.getBoundingClientRect().width>100);
    const root=frame.getBoundingClientRect(),rect=canvas.getBoundingClientRect(),scale=rect.width/deps.wasm.getPageInfo(0).width;
    if(which==='body')return{x:root.x+rect.x+110,y:root.y+rect.y+95};
    const control=deps.wasm.getPageControlLayout(0).controls.filter(c=>c.type===which)[index];
    if(!control)throw new Error('No '+which+' '+index);
    return{x:root.x+rect.x+(control.x+control.w*.4)*scale,y:root.y+rect.y+(control.y+control.h*.4)*scale};
  },{which,index});
}
async function place(page,which='body') {
  await page.locator('.exam-placement:not([hidden])').waitFor();await idle(page);
  const position=await point(page,which);await page.mouse.click(position.x,position.y);
  await page.locator('[data-exam-action="confirm-placement"]:not(:disabled)').waitFor();
  await page.locator('[data-exam-action="confirm-placement"]').click();await idle(page);
  assert.equal(await page.locator('#exam-status').getAttribute('data-error'),'false',await page.locator('#exam-status').textContent());
}
async function pictures(page) {
  return page.evaluate(async moduleUrl=>{
    const frame=document.querySelector('#exam-studio iframe'),wasm=frame.contentWindow.rhwpStudio.plugins.deps.wasm;
    const {readEditablePng}=await import(moduleUrl);
    return wasm.getPageControlLayout(0).controls.filter(c=>c.type==='image').map(control=>{
      const props=control.cellPath?wasm.getCellPicturePropertiesByPath(control.secIdx,control.paraIdx,control.cellPath,control.controlIdx):wasm.getPictureProperties(control.secIdx,control.paraIdx,control.controlIdx);
      const bytes=wasm.getControlImageData(control.secIdx,control.paraIdx,control.controlIdx,JSON.stringify(control.cellPath||[]));
      return{control,props,figure:readEditablePng(bytes)};
    });
  },runtimes.get(page).moduleBase+'editable-png.js'+runtimes.get(page).moduleQuery);
}
async function doubleClick(page,index=0) {
  const position=await point(page,'image',index);await page.mouse.dblclick(position.x,position.y);
}
let originalEditDiagnosticSequence=0;
// Observation only: retain the original point, real click, menu action and timeout.
async function originalEditState(page,index,position) {
  return page.evaluate(async ({index,position,moduleUrl})=>{
    const frame=document.querySelector('#exam-studio iframe'),deps=frame?.contentWindow?.rhwpStudio?.plugins?.deps;
    const rect=element=>{if(!element)return null;const r=element.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};};
    const element=el=>el?{tag:el.tagName,id:el.id,className:el.getAttribute('class'),role:el.getAttribute('role'),hidden:el.hidden,
      display:el.ownerDocument.defaultView.getComputedStyle(el).display,visibility:el.ownerDocument.defaultView.getComputedStyle(el).visibility,
      text:el.textContent?.slice(0,160),rect:rect(el)}:null;
    const input=deps?.getInputHandler(),control=deps?.wasm.getPageControlLayout(0).controls.filter(c=>c.type==='image')[index];
    const ref=control?{sec:control.secIdx,ppi:control.paraIdx,ci:control.controlIdx,type:'image',pageIndex:0,
      ...(control.cellPath?.length?{cellPath:control.cellPath}:{}),...(control.headerFooter?{headerFooter:control.headerFooter}:{})}:null;
    const snapshot={at:performance.now(),url:location.href,bodyClass:document.body.className,
      workspace:element(document.querySelector('#rhwp-exam-workspace')),busy:document.querySelector('#rhwp-exam-workspace')?.getAttribute('aria-busy'),
      editBar:element(document.querySelector('#exam-edit-bar')),inline:element(document.querySelector('#exam-inline-editor')),
      placement:element(document.querySelector('.exam-placement')),status:document.querySelector('#exam-status')?.textContent,
      region:element(document.querySelector('#exam-picture-controls')),heading:element(document.querySelector('#exam-picture-controls .exam-region-heading')),
      modify:element(document.querySelector('[data-picture-modify]')),selected:input?.cursor.getSelectedPictureRef(),control,ref,position,
      frame:rect(frame),canvases:[...(frame?.contentDocument.querySelectorAll('#scroll-content canvas')||[])].map(canvas=>({
        className:canvas.className,width:canvas.width,height:canvas.height,rect:rect(canvas),top:canvas.style.top,
        renderedZoom:canvas.dataset.rhwpRenderedZoom})),zoom:input?.viewportManager.getZoom(),animating:input?.viewportManager.isZoomAnimating(),
      scroll:input?{x:input.viewportManager.getScrollX(),y:input.viewportManager.getScrollY()}:null};
    try{
      const {RhwpExamBridge}=await import(moduleUrl);
      // Own input prevents this observational adapter from installing resize hooks.
      const bridge=Object.assign(Object.create(RhwpExamBridge.prototype),{editor:{element:frame},deps,revision:0});
      Object.defineProperty(bridge,'input',{value:input});
      snapshot.geometry=ref?bridge.figureGeometry(ref):null;snapshot.viewport=ref?bridge.figureViewport(ref):null;
      snapshot.pictureId=ref?bridge.figureId(ref):null;
      if(position){
        snapshot.topmost=element(document.elementFromPoint(position.x,position.y));
        const root=frame.getBoundingClientRect(),x=(position.x-root.x)*frame.offsetWidth/root.width-frame.clientLeft,
          y=(position.y-root.y)*frame.offsetHeight/root.height-frame.clientTop;
        snapshot.frameTopmost=element(frame.contentDocument.elementFromPoint(x,y));
        const nativePoint=input.pagePointFromClientPoint(x,y);snapshot.nativePoint=nativePoint;
        snapshot.nativeHit=nativePoint?input.findPictureAtClick(nativePoint.pageIdx,nativePoint.pageX,nativePoint.pageY):null;
      }
    }catch(error){snapshot.observationError={name:error.name,message:error.message};}
    return snapshot;
  },{index,position,moduleUrl:new URL(runtimes.get(page).moduleBase+'rhwp-exam-bridge.js'+runtimes.get(page).moduleQuery,page.url()).href});
}
async function originalEdit(page,index=0) {
  await idle(page);
  const position=await point(page,'image',index),observations=[];
  const capture=async phase=>{try{observations.push({phase,state:await originalEditState(page,index,position)});}catch(error){observations.push({phase,observationError:error.message});}};
  // Read the expected physical target without importing an adapter or hit-testing
  // before the click. The original point and actual mouse click are unchanged.
  const expected=await page.evaluate(index=>{
    const deps=document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps;
    const control=deps.wasm.getPageControlLayout(0).controls.filter(control=>control.type==='image')[index];
    if(!control)throw new Error('Expected physical picture target is absent');
    return {sec:control.secIdx,ppi:control.paraIdx,ci:control.controlIdx,type:'image',
      cellPath:control.cellPath || [],headerFooter:control.headerFooter || null};
  },index);
  try{
    await page.mouse.click(position.x,position.y);
    await waitForState(page,expected=>{
      const frame=document.querySelector('#exam-studio iframe'),deps=frame?.contentWindow?.rhwpStudio?.plugins?.deps;
      const selected=deps?.getInputHandler()?.cursor.getSelectedPictureRef();
      const key=ref=>ref?JSON.stringify([ref.sec,ref.ppi,ref.ci,(ref.cellPath || []).map(step=>[
        step.controlIndex ?? step.controlIdx,step.cellIndex ?? step.cellIdx,step.cellParaIndex ?? step.cellParaIdx,
      ]),ref.headerFooter || null]):null;
      if(selected?.type!=='image'||key(selected)!==key(expected))return false;
      const button=document.querySelector('#exam-picture-controls [data-picture-modify]');
      if(!button||button.disabled||!button.getClientRects().length)return false;
      for(let node=button;node;node=node.parentElement){const css=getComputedStyle(node);
        if(node.hidden||css.display==='none'||css.visibility==='hidden'||css.visibility==='collapse')return false;}
      return true;
    },expected);
    await capture('actual-picture-owner-and-controls-settled');
    await action(page,'edit');
    await page.locator('#exam-edit-bar').waitFor({state:'visible'});
    await capture('original-edit-completed');
    if(process.env.EVIDENCE_DIR){
      const target=path.resolve(process.env.EVIDENCE_DIR),stem='original-edit-success-'+Date.now()+'-'+(++originalEditDiagnosticSequence);
      fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,stem+'.json'),JSON.stringify({index,expected,position,observations},null,2));
    }
  }catch(error){
    await capture('original-failure');
    if(process.env.EVIDENCE_DIR){
      const target=path.resolve(process.env.EVIDENCE_DIR),stem='original-edit-failure-'+Date.now()+'-'+(++originalEditDiagnosticSequence);
      try{fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,stem+'.json'),JSON.stringify({index,originalError:{name:error.name,message:error.message,stack:error.stack},observations},null,2));await page.screenshot({path:path.join(target,stem+'.png')});}
      catch(evidenceError){console.error('Original-edit diagnostic capture failed: '+evidenceError.message);}
    }
    throw error;
  }
}
async function drawing(page,stateUrl) {return page.evaluate(async url=>{const {state}=await import(url);const s=state.get();return{activePageId:s.activePageId,objects:JSON.parse(JSON.stringify(s.objects)),pages:JSON.parse(JSON.stringify(s.pages)),undo:s.undoStack.length,viewBox:s.viewBox};},stateUrl);}
module.exports={navigate,ready,idle,action,crop,point,place,pictures,doubleClick,originalEdit,drawing,withServer,waitForState,runtime:page=>runtimes.get(page)};

module.exports.recrop=async function(page){await module.exports.idle(page);assert.equal(await page.locator('.capture-overlay').count(),0,'Apply uses the continuously editable export region');assert.equal(await page.locator('#exam-status').getAttribute('data-error'),'false',await page.locator('#exam-status').textContent());};
module.exports.openFile=async function(page,action,file){
 const waiting=page.waitForEvent('filechooser');await module.exports.action(page,action);
 const picker=await waiting;await module.exports.idle(page);
 await picker.setFiles(file);await module.exports.idle(page);
};
module.exports.nativeOpen=async function(page,file){await module.exports.openFile(page,'open-hwp',file);};

// Seed a caption in the full source editor, then publish through its real Apply
// action. The document's simple editor only changes existing captions.
module.exports.seedSourceLabel=async function(page,text='기존 라벨'){
 await module.exports.originalEdit(page);await page.locator('#exam-edit-bar').waitFor();
 await page.evaluate(async({stateUrl,text})=>{
  const {state,DEFAULT_TEXT_FONT}=await import(stateUrl);
  state.update(s=>{const page=s.pages.find(p=>p.id===s.activePageId),b=page.meta.examRender.bounds,p={x:b.x+b.w*.5,y:b.y+b.h*.35};s.objects.push({id:'source-caption-fixture',type:'labeler',p1:{...p},p2:{...p},text,labelType:'label',fontFamily:DEFAULT_TEXT_FONT,labelSize:3,strokeWidth:.2,strokeLevel:0,layerId:s.layers[0].id,order:s.objects.length,locked:false,positionLocked:false});});
 },{stateUrl:runtimes.get(page).stateUrl,text});
 await page.locator('[data-source-apply]').click();await module.exports.idle(page);
};
