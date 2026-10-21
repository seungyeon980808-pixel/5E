const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events'),{createRequire}=require('node:module'),{pathToFileURL}=require('node:url'),{createHash}=require('node:crypto');const h=require('./helpers/rhwp-exam.cjs');
const {assertLoadedRuntime}=require('./helpers/four-session-entry.cjs');
const root=path.resolve(__dirname,'..'),moduleQuery='?v=1.7.0-four-session-integration';
const primaryUrl=pathToFileURL(path.join(root,'index.html')).href,stateUrl=new URL('/js/state.js'+moduleQuery,primaryUrl).href;
const evidence=path.resolve(process.env.EVIDENCE_DIR||path.join(root,'_work/rhwp/verification/desktop')),runtimes=new WeakMap(),runtimeReceipts=[];
function nativeAiGeometry() {
 const toolbar=document.querySelector('.canvas-toolbar').getBoundingClientRect(),panel=document.querySelector('#ai-image-panel').getBoundingClientRect(),workbench=document.querySelector('#ai-image-panel .ai-workbench').getBoundingClientRect();
 const heading=document.querySelector('#exam-edit-bar'),bar=heading.getBoundingClientRect(),images=[...document.querySelectorAll('#ai-image-panel [data-ai-previews] .ai-preview-stage > img')],image=images.find(img=>img.getClientRects().length),preview=image?.getBoundingClientRect();
 const control=document.querySelector('#exam-workspace-open'),button=control.getBoundingClientRect(),hit=document.elementFromPoint(button.x+button.width/2,button.y+button.height/2);
 return {checks:{belowToolbar:panel.top>=toolbar.bottom,withinViewport:workbench.bottom<=innerHeight,withinPanel:workbench.top>=panel.top,
  sourcePreview:document.querySelector('#exam-source-region').classList.contains('exam-source-ai'),headingVisible:!heading.hidden,
  headingAbovePreview:!!preview&&bar.bottom<=preview.top,headingWithinPanel:bar.left>=panel.left&&bar.right<=panel.right&&bar.top>=panel.top,
  toolbarOffset:parseFloat(getComputedStyle(document.body).getPropertyValue('--exam-source-toolbar-bottom'))===toolbar.bottom,
  sourceReturnVisible:button.width>0&&button.height>0&&button.top>=0&&button.bottom<=panel.top,sourceReturnEnabled:!control.disabled,sourceReturnHit:control.contains(hit)},
  toolbar:toolbar.toJSON(),panel:panel.toJSON(),workbench:workbench.toJSON(),bar:bar.toJSON(),button:button.toJSON(),hit:hit&&{tag:hit.tagName,id:hit.id,className:hit.className},
  previews:images.map(img=>({rect:img.getBoundingClientRect().toJSON(),clientRects:img.getClientRects().length,src:img.currentSrc.slice(0,70)}))};
}
// Electron does not navigate through the browser helper. Observe its existing
// realms before any test import; never repair a product URL with a route/mock.
function assertParsedRuntime(runtime,scripts,contexts,frameId) {
 const loaded=scripts.filter(script=>{try{return /\/(main|state)\.js$/.test(new URL(script.url).pathname);}catch{return false;}});
 assertLoadedRuntime(runtime,loaded.map(script=>script.url));
 for(const url of [runtime.mainUrl,runtime.stateUrl]) {
  const matches=loaded.filter(script=>script.url===url);assert.equal(matches.length,1,'one parsed module instance: '+url);
  const script=matches[0],context=contexts.find(context=>context.id===script.executionContextId);
  assert.equal(script.isModule,true,'the loaded source is an ES module: '+url);
  assert.equal(script.hasSourceURL,false,'a sourceURL annotation cannot manufacture runtime identity: '+url);
  assert.equal(context?.auxData?.isDefault,true,'the module belongs to the real page context: '+url);
  assert.equal(context.auxData.frameId,frameId,'the module belongs to the top frame: '+url);
 }
}
async function parsedFileRuntime(page,runtime) {
 // Electron file: loads have no PerformanceResourceTiming entries. Debugger
 // enable replays the already parsed scripts; it neither imports nor evaluates
 // an expected module. Compare their actual parsed source before test imports.
 const cdp=await page.context().newCDPSession(page),scripts=[],contexts=[],proofs=[];
 cdp.on('Debugger.scriptParsed',script=>scripts.push(script));cdp.on('Runtime.executionContextCreated',({context})=>contexts.push(context));
 const receipt={entry:page.url(),...runtime,observation:'existing parsed modules; no test import',performanceResources:await page.evaluate(()=>performance.getEntriesByType('resource').map(item=>item.name))};
 try {
  const{frameTree}=await cdp.send('Page.getFrameTree');await cdp.send('Runtime.enable');await cdp.send('Debugger.enable');
  Object.assign(receipt,{frameId:frameTree.frame.id,scripts,contexts});assertParsedRuntime(runtime,scripts,contexts,frameTree.frame.id);
  for(const name of ['main.js','state.js','editable-png.js','rhwp-exam-project.js','fivee-project.js','graph/graph-modal.js']) {
   const matches=scripts.filter(script=>{try{return new URL(script.url).pathname.endsWith('/js/'+name);}catch{return false;}});
   if(!matches.length)continue;
   const expectedUrl=new URL(name+moduleQuery,runtime.mainUrl).href;assert.deepEqual(matches.map(script=>script.url),[expectedUrl],name+' has one canonical parsed instance');
   const script=matches[0],context=contexts.find(context=>context.id===script.executionContextId);
   assert.equal(script.isModule,true);assert.equal(script.hasSourceURL,false);assert.equal(context?.auxData?.isDefault,true);assert.equal(context.auxData.frameId,frameTree.frame.id);
   const{scriptSource}=await cdp.send('Debugger.getScriptSource',{scriptId:script.scriptId}),backingPath=await fs.realpath(path.join(root,'js',name)),candidate=await fs.readFile(backingPath);
   const sha256=createHash('sha256').update(scriptSource).digest('hex'),candidateSha256=createHash('sha256').update(candidate).digest('hex');
   assert.equal(sha256,candidateSha256,name+' parsed source comes from the actual candidate');assert.equal(Buffer.byteLength(scriptSource),candidate.length);
   proofs.push({name,url:script.url,scriptId:script.scriptId,executionContextId:script.executionContextId,frameId:context.auxData.frameId,backingPath,sha256,candidateSha256,bytes:candidate.length});
  }
  // Native preload records use filesystem paths, unlike renderer module URLs.
  // Keep every raw record above, but pass actual URLs to the URL identity guard.
  receipt.parsedSourceProofs=proofs;receipt.resources=scripts.map(script=>script.url).filter(url=>{try{new URL(url);return true;}catch{return false;}});return receipt;
 }catch(error){receipt.error={message:error.message,stack:error.stack};throw error;}
 finally{runtimeReceipts.push(receipt);await fs.mkdir(evidence,{recursive:true});await fs.writeFile(path.join(evidence,'module-observation-'+runtimeReceipts.length+'.json'),JSON.stringify(receipt,null,2)+'\n');await cdp.detach();}
}
async function candidateResponseProof(page,modules) {
 const responses=await page.evaluate(async modules=>Promise.all(modules.map(async({name,url})=>{
  const response=await fetch(url);return{name,requestedUrl:url,responseUrl:response.url,status:response.status,bytes:[...new Uint8Array(await response.arrayBuffer())]};
 })),modules),proofs=[];
 for(const response of responses){
  const expected=modules.find(module=>module.name===response.name),backingPath=await fs.realpath(path.join(root,'js',response.name)),candidate=await fs.readFile(backingPath);
  assert.equal(response.status,200,response.name+' actual runtime response succeeds');assert.equal(response.responseUrl,expected.url,response.name+' response keeps its canonical renderer URL');
  const sha256=createHash('sha256').update(Buffer.from(response.bytes)).digest('hex'),candidateSha256=createHash('sha256').update(candidate).digest('hex');
  assert.equal(sha256,candidateSha256,response.name+' actual response bytes come from this candidate');assert.equal(response.bytes.length,candidate.length);
  proofs.push({name:response.name,requestedUrl:response.requestedUrl,responseUrl:response.responseUrl,status:response.status,backingPath,sha256,candidateSha256,bytes:response.bytes.length,observation:'renderer fetch after loaded-identity assertion; no module import'});
 }
 return proofs;
}
async function ready(page) {
 await page.waitForLoadState('domcontentloaded');
 const entry=new URL(page.url()),mainUrl=new URL('/js/main.js'+moduleQuery,entry).href;
 const runtime={mainUrl,stateUrl:entry.protocol==='file:'?stateUrl:new URL('/js/state.js'+moduleQuery,entry).href};
 const scripts=await page.locator('script[src]').evaluateAll(nodes=>nodes.map(node=>node.src).filter(url=>new URL(url).pathname.endsWith('/main.js')));
 assert.deepEqual(scripts,[mainUrl],'native entry must load the canonical main from this candidate');
 await page.locator('#rhwp-exam-workspace[data-exam-ready="true"]').waitFor({state:'attached',timeout:60000});
 const skip=page.getByRole('button',{name:'건너뛰기',exact:true});if(await skip.isVisible())await skip.click();
 if(await page.locator('#rhwp-exam-workspace').isVisible())await h.idle(page);
 const parsed=entry.protocol==='file:'?await parsedFileRuntime(page,runtime):null;
 const resources=parsed?.resources||await page.evaluate(()=>performance.getEntriesByType('resource').map(item=>item.name));
 assertLoadedRuntime(runtime,resources);
 const responses=await candidateResponseProof(page,[{name:'main.js',url:runtime.mainUrl},{name:'state.js',url:runtime.stateUrl}]);
 runtimes.set(page,runtime);runtimeReceipts.push({entry:entry.href,...runtime,resources,responses});
}
function moduleUrl(page,name) {
 const runtime=runtimes.get(page);assert.ok(runtime,'native realm must be observed before importing modules');
 return new URL(name+moduleQuery,runtime.mainUrl).href;
}
async function verifyRuntime(page) {
 const parsed=new URL(page.url()).protocol==='file:'?await parsedFileRuntime(page,runtimes.get(page)):null;
 const resources=parsed?.resources||await page.evaluate(()=>performance.getEntriesByType('resource').map(item=>item.name));
 assertLoadedRuntime(runtimes.get(page),resources);
 const modules=[{name:'main.js',url:runtimes.get(page).mainUrl},{name:'state.js',url:runtimes.get(page).stateUrl}];
 for(const name of ['editable-png.js','rhwp-exam-project.js','fivee-project.js','graph/graph-modal.js']){
  const expected=moduleUrl(page,name),loaded=[...new Set(resources.filter(url=>new URL(url).pathname.endsWith('/js/'+name)))];
  if(loaded.length){assert.deepEqual(loaded,[expected],name+' must not create an unqueried or stale module instance');modules.push({name,url:expected});}
 }
 const responses=await candidateResponseProof(page,modules);
 runtimeReceipts.push({entry:page.url(),...runtimes.get(page),resources,responses});
}
async function pictures(page) {
 return page.evaluate(async url=>{
  const wasm=document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.wasm,{readEditablePng}=await import(url);
  return wasm.getPageControlLayout(0).controls.filter(control=>control.type==='image').map(control=>{
   const props=control.cellPath?wasm.getCellPicturePropertiesByPath(control.secIdx,control.paraIdx,control.cellPath,control.controlIdx):wasm.getPictureProperties(control.secIdx,control.paraIdx,control.controlIdx);
   const bytes=wasm.getControlImageData(control.secIdx,control.paraIdx,control.controlIdx,JSON.stringify(control.cellPath||[]));
   return{control,props,figure:readEditablePng(bytes)};
  });
 },moduleUrl(page,'editable-png.js'));
}
async function parseProject(page,bytes,fiveE=false) {
 return page.evaluate(async({url,bytes,fiveE})=>{const api=await import(url);return api[fiveE?'parseFiveEProject':'parseExamProject'](new Uint8Array(bytes));},{url:moduleUrl(page,fiveE?'fivee-project.js':'rhwp-exam-project.js'),bytes:[...bytes],fiveE});
}
async function waitForPrimary(app) {
 return new Promise((resolve,reject)=>{
  let ended=false;const pages=new Set(),timer=setTimeout(()=>finish(new Error('Native primary window did not navigate to the candidate entry')),60000);
  function finish(error,page){if(ended)return;ended=true;clearTimeout(timer);app.off('window',observe);for(const candidate of pages)candidate.off('framenavigated',check);error?reject(error):resolve(page);}
  function check(){const page=[...pages].find(candidate=>candidate.url()===primaryUrl);if(page)finish(null,page);}
  function observe(page){if(ended)return;pages.add(page);page.on('framenavigated',check);check();}
  app.on('window',observe);for(const page of app.windows())observe(page);
 });
}
async function examReady(page) {await page.waitForURL(url=>url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.pathname==='/',{timeout:60000});await ready(page);await h.idle(page);}
async function graphStage(page,key,name) {
 await page.getByRole('tab',{name,exact:true}).click();await page.locator('#gm-tab-'+key).waitFor({state:'visible'});
 assert.equal(await page.locator('#gm-tab-'+key+'-btn').getAttribute('aria-selected'),'true',name+' selects its stage');
 assert.equal(await page.locator('#gm-tab-'+key).isVisible(),true,name+' shows its controls');
}
// Register before the real action and await DownloadItem.done, not file existence.
async function nativeDownload(app,page,file,action) {
 const owner=await app.browserWindow(page),ownerId=await owner.evaluate(window=>window.webContents.id);await owner.dispose();
 await app.evaluate(({webContents},{ownerId,file})=>{
  const owner=webContents.fromId(ownerId),session=owner.session;globalThis.__rhwpHarnessDownloads??=new Map();
  let finish;const promise=new Promise((resolve,reject)=>{finish=(error,value)=>error?reject(error):resolve(value);});promise.catch(()=>{});
  const listener=(_event,item,sender)=>{if(sender!==owner)return;session.removeListener('will-download',listener);item.setSavePath(file);item.once('done',(_event,state)=>{clearTimeout(timer);finish(null,{state,name:item.getFilename(),url:item.getURL(),bytes:item.getReceivedBytes()});});};
  const timer=setTimeout(()=>{session.removeListener('will-download',listener);finish(new Error('Native download completion deadline'));},60000);
  globalThis.__rhwpHarnessDownloads.set(file,{promise,cancel:()=>{clearTimeout(timer);session.removeListener('will-download',listener);}});session.on('will-download',listener);
 },{ownerId,file});
 try {
  await action();const receipt=await app.evaluate(async(_,{file})=>await globalThis.__rhwpHarnessDownloads.get(file).promise,{file});
  assert.equal(receipt.state,'completed','native download completed');assert.match(receipt.name,/\.5e$/);assert.ok(receipt.bytes>0,'native .5e download contains bytes');
  const bytes=await fs.readFile(file);assert.equal(bytes.length,receipt.bytes,'read the complete native download');
  await fs.mkdir(evidence,{recursive:true});await fs.copyFile(file,path.join(evidence,path.basename(file)));return bytes;
 } finally {await app.evaluate((_,file)=>{const entry=globalThis.__rhwpHarnessDownloads?.get(file);entry?.cancel();globalThis.__rhwpHarnessDownloads?.delete(file);},file);}
}
// Observe the actual busy transition before selecting a file. This also handles
// a fast true/false transition delivered in one MutationObserver batch.
async function projectInput(exam,action) {
 await h.idle(exam);await exam.evaluate(()=>{
  const panel=document.querySelector('#rhwp-exam-workspace');let started=false;
  window.__rhwpHarnessOpen=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>finish(new Error('Native project open completion deadline')),60000),observer=new MutationObserver(records=>{
    started ||= panel.getAttribute('aria-busy')==='true'||records.some(record=>record.oldValue==='true');
    if(started&&panel.getAttribute('aria-busy')==='false')finish();
   });
   function finish(error){clearTimeout(timer);observer.disconnect();error?reject(error):resolve();}
   observer.observe(panel,{attributes:true,attributeFilter:['aria-busy'],attributeOldValue:true});window.__rhwpHarnessCancelOpen=()=>finish();
  });window.__rhwpHarnessOpen.catch(()=>{});
 });
 try{await action();await exam.evaluate(()=>window.__rhwpHarnessOpen);await h.idle(exam);assert.equal(await exam.locator('#exam-status').getAttribute('data-error'),'false',await exam.locator('#exam-status').textContent());}
 finally{await exam.evaluate(()=>{window.__rhwpHarnessCancelOpen();delete window.__rhwpHarnessCancelOpen;delete window.__rhwpHarnessOpen;});}
}
async function primaryDrawingWhen(main,predicate,arg) {
 await main.evaluate(async({url,source,arg})=>{const{state}=await import(url),condition=(0,eval)('('+source+')');await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>finish(new Error('Native primary state deadline')),60000);let off;
  function finish(error){clearTimeout(timer);off?.();error?reject(error):resolve();}
  function check(){try{if(condition(state.get(),arg))finish();}catch(error){finish(error);}}
  off=state.subscribe(check);check();
 });},{url:stateUrl,source:predicate.toString(),arg});
}
async function annotationIpcContract() {
 const handlers=new Map(),timers=new Map(),windows=[];let timerId=0,focusCalls=0;
 class Window extends EventEmitter {
  constructor(){super();windows.push(this);this.webContents=new EventEmitter();this.webContents.mainFrame={url:''};this.webContents.sent=[];this.webContents.send=(channel,payload)=>{this.webContents.sent.push({channel,payload});this.webContents.emit('harness:sent');};this.webContents.setWindowOpenHandler=()=>{};}
  isDestroyed(){return false;}setMenu(){}setMenuBarVisibility(){}loadFile(){}show(){focusCalls++;}focus(){focusCalls++;}
 }
 const electron={BrowserWindow:Window,ipcMain:{handle:(channel,handler)=>handlers.set(channel,handler)},app:{whenReady:()=>new Promise(()=>{}),on(){},setPath(){},disableHardwareAcceleration(){},setAppUserModelId(){}}};
 const file=path.join(root,'desktop/main.cjs'),source=await fs.readFile(file,'utf8'),realRequire=createRequire(file);
 const bridge=new Function('require','module','__dirname','setTimeout','clearTimeout',source+'\nreturn {createWindow,setWindows:(primary,aux,origin)=>{win=primary;examWindow=aux;examOrigin=origin;},requests:examAnnotationRequests,cancelExamAnnotations};')(
  name=>name==='electron'?electron:realRequire(name),{exports:{}},path.dirname(file),callback=>{const id=++timerId;timers.set(id,callback);return id;},id=>timers.delete(id));
 bridge.createWindow();const primary=windows.at(-1),aux=new Window(),origin='http://127.0.0.1:39821';
 primary.webContents.mainFrame.url=require('node:url').pathToFileURL(path.join(root,'index.html')).href;aux.webContents.mainFrame.url=origin+'/?exam=1';bridge.setWindows(primary,aux,origin);
 const event=window=>({sender:window.webContents,senderFrame:window.webContents.mainFrame}),invoke=(request,sender=event(aux))=>handlers.get('exam:annotations')(sender,request),reply=payload=>handlers.get('exam:annotations-reply')(event(primary),payload);
 const label={id:'label-a',type:'labeler',p1:{x:0,y:0},p2:{x:3,y:2},text:'A'},figure={id:'figure-a',name:'A',version:1,link:{tabId:'tab-a',assetId:'asset-a'},source:{activePageId:'page-a',pages:[{id:'page-a',objects:[label],layers:[{id:1}],artboard:{w:90,h:60}}]}};
 const render={bounds:{x:-10,y:-10,w:20,h:20},options:{includeReferenceImages:true,excludeAllImages:false}};
 const queued=async count=>{if(bridge.requests.size!==count)await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>finish(new Error('Annotation IPC forwarding deadline')),10000);
  function finish(error){clearTimeout(timer);primary.webContents.off('harness:sent',check);error?reject(error):resolve();}
  function check(){if(bridge.requests.size===count)finish();}primary.webContents.on('harness:sent',check);check();
 });assert.equal(bridge.requests.size,count);return primary.webContents.sent.filter(item=>item.channel==='exam:annotations-request').at(-1).payload;};
 // Concurrent replies must settle their own promises, regardless of order.
 const first=invoke({kind:'read',figure}),a=await queued(1),second=invoke({kind:'patch',figure,baseline:[label],edited:[{...label,text:'B'}],render}),b=await queued(2);
 assert.notEqual(a.requestId,b.requestId);assert.deepEqual(b.render,render);
 assert.deepEqual(reply({requestId:b.requestId,value:{labels:[{...label,text:'B'}]}}),{ok:true});assert.equal((await second).labels[0].text,'B');
 reply({requestId:a.requestId,value:{baseline:[label],draft:[label],render}});assert.deepEqual((await first).render,render);
 assert.deepEqual(reply({requestId:a.requestId,value:{baseline:[],draft:[]}}),{ok:false});assert.equal(timers.size,0);assert.equal(focusCalls,0,'annotation transport never reveals or focuses either window');
 const revision=invoke({kind:'revision',figure:{...figure,id:'figure-b',version:2,editScope:'annotations'}}),c=await queued(1);reply({requestId:c.requestId,value:{labels:[label]}});assert.deepEqual(await revision,{labels:[label]});
 const expired=invoke({kind:'read',figure});bridge.cancelExamAnnotations('navigation');await assert.rejects(expired,/만료/);assert.equal(bridge.requests.size,0,'navigation while validation yields cannot forward a stale request');
 await assert.rejects(invoke({kind:'read',figure},event(primary)),/Untrusted exam/);
 await assert.rejects(invoke({kind:'read',figure},{sender:aux.webContents,senderFrame:{url:origin+'/'}}),/Untrusted exam/);
 const trustedUrl=aux.webContents.mainFrame.url;aux.webContents.mainFrame.url='https://example.com/';await assert.rejects(invoke({kind:'read',figure}),/Untrusted exam/);aux.webContents.mainFrame.url=trustedUrl;
 for(const invalid of [{kind:'workspace',figure},{kind:'read',figure,restore:{}},{kind:'read',figure:{...figure,link:undefined}},{kind:'read',figure:{...figure,version:0}},{kind:'read',figure:{...figure,source:{...figure.source,activePageId:'missing'}}},{kind:'patch',figure,baseline:[label],edited:[{...label,type:'line'}]},{kind:'patch',figure,baseline:[label],edited:[label,label]},{kind:'patch',figure,baseline:[label],edited:[{...label,p1:{x:NaN,y:0}}]},{kind:'patch',figure,baseline:[label],edited:[{...label,text:'x'.repeat(2*1024*1024)}]},{kind:'patch',figure,baseline:[],edited:[],render:{...render,path:'/tmp/file'}},{kind:'patch',figure,baseline:[],edited:[],render:{...render,bounds:{...render.bounds,w:0}}},{kind:'patch',figure,baseline:[],edited:[],render:{...render,options:{...render.options,excludeLabels:true}}},{kind:'revision',figure,committed:figure}])await assert.rejects(invoke(invalid));
 const failure=invoke({kind:'read',figure}),d=await queued(1);assert.throws(()=>handlers.get('exam:annotations-reply')(event(aux),{requestId:d.requestId,value:{baseline:[],draft:[]}}),/Untrusted IPC/);reply({requestId:d.requestId,error:'label conflict'});await assert.rejects(failure,/label conflict/);
 const badReply=invoke({kind:'patch',figure,baseline:[],edited:[]}),e=await queued(1);assert.deepEqual(reply({requestId:e.requestId,value:{labels:[{...label,type:'image'}]}}),{ok:false});await assert.rejects(badReply,/라벨 객체/);assert.equal(timers.size,0);
 const timeout=invoke({kind:'read',figure});await queued(1);[...timers.values()][0]();await assert.rejects(timeout,/초과/);assert.equal(bridge.requests.size,0);assert.equal(timers.size,0);
 const pending=[];for(let i=0;i<8;i++){const promise=invoke({kind:'read',figure});promise.catch(()=>{});pending.push(promise);await queued(i+1);}await assert.rejects(invoke({kind:'read',figure}),/너무 많/);
 primary.emit('closed');for(const promise of pending)await assert.rejects(promise,/창을 닫았습니다/);assert.equal(timers.size,0);assert.equal(bridge.requests.size,0);await assert.rejects(invoke({kind:'read',figure}),/먼저 열어/);
 // Exercise the actual preload APIs without exposing general IPC to the aux.
 for(const [preload,name] of [['exam-preload.cjs','fiveEExam'],['preload.cjs','fiveEDesktop']]){
  let api;const ipc=new EventEmitter(),invocations=[];ipc.invoke=(channel,payload)=>{invocations.push({channel,payload});return Promise.resolve({ok:true});};ipc.removeListener=ipc.removeListener.bind(ipc);
  new Function('require','window','process',await fs.readFile(path.join(root,'desktop',preload),'utf8'))(()=>({contextBridge:{exposeInMainWorld:(key,value)=>{assert.equal(key,name);api=value;}},ipcRenderer:ipc}),{addEventListener(){}},process);
  if(name==='fiveEExam'){await api.annotations({kind:'read',figure});assert.equal(invocations[0].channel,'exam:annotations');assert.equal(api.exam,undefined);}
  else{let received;const unsubscribe=api.exam.onAnnotationsRequest(value=>received=value);ipc.emit('exam:annotations-request',{},a);assert.equal(received,a);unsubscribe();assert.equal(ipc.listenerCount('exam:annotations-request'),0);await api.exam.annotationsReply({requestId:a.requestId,value:{baseline:[],draft:[]}});assert.equal(invocations[0].channel,'exam:annotations-reply');}
 }
 console.log('desktop annotation IPC: correlation, crop schema, capability limits, trust, bounded requests, timeout/primary close, focus and preloads passed');
}
async function originalEdit(exam,main,index=0){await h.idle(exam);const point=await h.point(exam,'image',index);await exam.mouse.click(point.x,point.y);await h.action(exam,'edit');await main.locator('#exam-edit-bar').waitFor({state:'visible'});}
async function windowAfterCapture(app,capture) {
 let observed;
 const opened=window=>{observed=window;};app.on('window',opened);
 try {
  console.log('native capture started:',new Date().toISOString());
  await capture();console.log('native capture completed:',new Date().toISOString());
  // Capture has its own deadline. Arm the window event before capture, but
  // begin the native-window timeout only after the user confirms the region.
  return observed || await app.waitForEvent('window');
 } finally {app.off('window',opened);}
}
async function graphRoundtrip(main,app,profile) {
 await main.evaluate(async url=>{const{state}=await import(url);state.update(s=>{s.artboard={w:80,h:50};s.viewBox={x:-40,y:-25,w:80,h:50};});},stateUrl);
 await main.locator('#graph-tool-open').click();await graphStage(main,'coord','① 좌표');
 await main.locator('#gm-tab-coord #gm-labelx').fill('시간(s)');await main.locator('#gm-tab-coord #gm-labely').fill('속력(m/s)');
 await graphStage(main,'func','② 함수');await main.getByRole('button',{name:'해석적 함수',exact:true}).click();await main.getByRole('button',{name:'＋ 함수식 추가',exact:true}).click();
 await main.locator('#gm-chips [data-series-index="0"]').click();await main.locator('#gm-series-editor #gm-expr').fill('x');
 assert.equal(await main.locator('#gm-chips [data-series-index]').count(),1,'one analytic series is selected in the current editor');
 await graphStage(main,'annot','③ 표시');assert.equal(await main.locator('#gm-tab-func').isVisible(),false,'display stage retains the analytic series without showing its properties');
 assert.equal(await main.locator('#gm-send-exam').isVisible(),true,'current graph editor exposes direct HWP send');
 const exam=await windowAfterCapture(app,async()=>{await main.locator('#gm-send-exam').click();await main.locator('.capture-overlay').waitFor();await main.locator('#capture-confirm').click();});await examReady(exam);await h.place(exam);
 const first=(await pictures(exam))[0],plane=first.figure.source.pages[0].objects.find(object=>object.type==='coordplane');
 assert.equal(first.figure.source.pages[0].objects.find(object=>object.type==='funcgraph').expr,'x');
 assert.equal(plane.labelX,'시간(s)');assert.equal(plane.labelY,'속력(m/s)');
 const zoom=()=>exam.evaluate(()=>document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().viewportManager.getZoom());
 const before=await zoom();await h.doubleClick(exam);await exam.locator('#exam-inline-editor:not([hidden])').waitFor();await h.idle(exam);assert.ok(await zoom()>before,'native double click magnifies the document');
 await exam.locator('[data-inline-action="add-label"]').click();const box=await exam.locator('.exam-inline-canvas').boundingBox();await exam.mouse.click(box.x+box.width*.65,box.y+box.height*.4);
 await exam.locator('[data-inline-field="text"]').fill('일정한 가속도');await exam.locator('[data-inline-field="text"]').press('Tab');await exam.locator('[data-inline-action="apply"]').click();await h.idle(exam);
 assert.equal(await zoom(),before,'native apply restores the view');assert.equal((await h.drawing(main,stateUrl)).objects.find(object=>object.type==='labeler').text,'일정한 가속도');
 const graphBefore=await h.drawing(main,stateUrl);await originalEdit(exam,main);
 assert.equal((await h.drawing(main,stateUrl)).activePageId,graphBefore.activePageId);assert.equal((await h.drawing(main,stateUrl)).undo,graphBefore.undo,'graph original return preserves the native source history');
 await main.evaluate(async({id,url})=>(await import(url)).openGraphModal(id),{id:plane.id,url:moduleUrl(main,'graph/graph-modal.js')});
 await graphStage(main,'coord','① 좌표');assert.equal(await main.locator('#gm-labelx').inputValue(),'시간(s)');assert.equal(await main.locator('#gm-labely').inputValue(),'속력(m/s)');
 await graphStage(main,'func','② 함수');await main.locator('#gm-chips [data-series-index="0"]').click();assert.equal(await main.locator('#gm-series-editor #gm-expr').inputValue(),'x');
 await main.locator('#gm-series-editor #gm-expr').fill('2*x');await main.locator('#gm-send-exam').click();await h.recrop(main);await main.locator('#exam-edit-bar').waitFor({state:'hidden'});await h.idle(exam);
 const revised=await pictures(exam);assert.equal(revised.length,1);assert.deepEqual(revised[0].figure.link,first.figure.link);assert.deepEqual(revised[0].figure.render.bounds,first.figure.render.bounds);
 assert.equal(revised[0].figure.source.pages[0].objects.find(object=>object.type==='funcgraph').expr,'2*x');
 const snapshot=await main.evaluate(async()=>[...new Uint8Array(await window.fiveEDesktop.exam.projectSnapshot())]);
 const project=await parseProject(exam,snapshot);
 assert.equal(project.figures.find(figure=>figure.id===revised[0].figure.id).source.pages[0].objects.find(object=>object.type==='labeler').text,'일정한 가속도');assert.equal(project.workspace.drawing.pages.find(page=>page.id===project.workspace.drawing.activePageId).objects.find(object=>object.type==='funcgraph').expr,'2*x');
 const saved=await nativeDownload(app,exam,path.join(profile,'네이티브 그래프.5e'),()=>h.action(exam,'save')),downloaded=await parseProject(exam,saved);
 assert.deepEqual(downloaded.figures,project.figures,'native graph download retains all committed revisions');assert.deepEqual(downloaded.workspace.drawing,project.workspace.drawing,'native graph download retains the source workspace');
 await projectInput(exam,()=>exam.locator('#exam-project-file').setInputFiles(path.join(profile,'네이티브 그래프.5e')));
 const reopened=await pictures(exam);assert.equal(reopened.length,1);assert.deepEqual(reopened[0].figure,revised[0].figure,'actual file input reopens the latest native graph and label source');
 await originalEdit(exam,main);assert.equal((await h.drawing(main,stateUrl)).objects.find(object=>object.type==='funcgraph').expr,'2*x');assert.equal((await h.drawing(main,stateUrl)).objects.find(object=>object.type==='labeler').text,'일정한 가속도');
 await main.locator('#exam-workspace-open').click();await main.locator('#exam-edit-bar').waitFor({state:'hidden'});await h.idle(exam);
 await verifyRuntime(main);await verifyRuntime(exam);
 console.log('desktop graph: create/send, document zoom, primary label propagation, original edit/direct resend, fixed crop, one image and .5e source passed');
}
async function inlineRoundtrip(exam,main,app,profile) {
 // Inline labels use their own transport, with the aux keeping native focus.
 await fs.mkdir(evidence,{recursive:true});
 // Settle the real debounced publication caused by this geometry draft.
 await exam.evaluate(()=>{window.__rhwpHarnessPublication=new Promise((resolve,reject)=>{let off;const timer=setTimeout(()=>{off();reject(new Error('Primary workspace publication deadline'));},60000);off=window.fiveEExam.onWorkspaceChanged(()=>{clearTimeout(timer);off();resolve();});});window.__rhwpHarnessPublication.catch(()=>{});});
 await main.evaluate(async url=>{const{state}=await import(url);state.update(s=>{s.objects.find(o=>o.id==='desktop-line').p2.y=3;});},stateUrl);
 await exam.evaluate(async()=>{await window.__rhwpHarnessPublication;delete window.__rhwpHarnessPublication;});
 const inlineBefore=await h.drawing(main,stateUrl);
 const focused=()=>app.evaluate(({BrowserWindow})=>{const windows=BrowserWindow.getAllWindows();return{aux:windows.find(w=>w.webContents.getURL().startsWith('http:')).isFocused(),primary:windows.find(w=>w.webContents.getURL().endsWith('/index.html')).isFocused()};});
 // CDP bringToFront alone can leave the macOS application inactive. Establish
 // native focus before the action; do not repair focus after double-clicking.
 await app.evaluate(({app,BrowserWindow})=>new Promise((resolve,reject)=>{
  const window=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('http:'));
  const timer=setTimeout(()=>finish(new Error('Native auxiliary focus deadline')),10000);
  function finish(error){clearTimeout(timer);window.removeListener('focus',focus);error?reject(error):resolve();}
  function focus(){finish();}window.once('focus',focus);app.focus({steal:true});window.focus();if(window.isFocused())finish();
 }));
 assert.deepEqual(await focused(),{aux:true,primary:false},'native focus is established before testing inline editing');
 await h.doubleClick(exam);await exam.locator('#exam-inline-editor').waitFor({state:'visible',timeout:60000});await h.idle(exam);
 assert.deepEqual(await focused(),{aux:true,primary:false},'inline double click keeps the auxiliary window focused');assert.equal(await main.locator('#exam-edit-bar').isVisible(),false,'inline editing does not enter the full editor');assert.equal((await h.drawing(main,stateUrl)).activePageId,inlineBefore.activePageId);assert.equal((await h.drawing(main,stateUrl)).undo,inlineBefore.undo,'annotation read preserves the primary controller/history');
 const readFigure=(await pictures(exam))[0].figure;readFigure.render=(await h.drawing(main,stateUrl)).pages.find(p=>p.id===inlineBefore.activePageId).meta.examRender;
 await main.evaluate(async url=>{const{state}=await import(url);window.__rhwpNativeReadMutations=0;window.__rhwpNativeReadEvents=0;window.__rhwpNativeReadUnsubscribe=state.subscribe(()=>window.__rhwpNativeReadMutations++);window.__rhwpNativeReadEvent=()=>window.__rhwpNativeReadEvents++;window.addEventListener('5e:exam-workspace-changed',window.__rhwpNativeReadEvent);},stateUrl);
 await exam.evaluate(()=>{window.__rhwpNativeWorkspaceChanges=0;window.__rhwpNativeUnsubscribe=window.fiveEExam.onWorkspaceChanged(()=>window.__rhwpNativeWorkspaceChanges++);});
 await main.evaluate(()=>window.fiveEDesktop.exam.projectSnapshot());
 const settledNotifications=await exam.evaluate(()=>window.__rhwpNativeWorkspaceChanges);
 const noOpBefore=await h.drawing(main,stateUrl);
 await exam.evaluate(async figure=>{for(let i=0;i<3;i++)await window.fiveEExam.annotations({kind:'read',figure});},readFigure);
 // A real snapshot reply follows the reads across both IPC legs. Check their
 // causal sources too, so a delayed 250ms notification cannot escape the test.
 await main.evaluate(()=>window.fiveEDesktop.exam.projectSnapshot());
 assert.deepEqual(await main.evaluate(()=>({mutations:window.__rhwpNativeReadMutations,events:window.__rhwpNativeReadEvents})),{mutations:0,events:0},'no-op reads cannot schedule workspace feedback through either primary source');
 assert.deepEqual(await h.drawing(main,stateUrl),noOpBefore,'no-op reads retain the complete primary drawing, controller and history');
 assert.equal(await exam.evaluate(()=>window.__rhwpNativeWorkspaceChanges),settledNotifications,'repeated no-op annotation reads do not trigger workspace-change feedback');assert.deepEqual(await focused(),{aux:true,primary:false},'idle annotation refresh keeps auxiliary focus');await exam.evaluate(()=>window.__rhwpNativeUnsubscribe());
 await main.evaluate(()=>{window.__rhwpNativeReadUnsubscribe();window.removeEventListener('5e:exam-workspace-changed',window.__rhwpNativeReadEvent);});
 await exam.screenshot({path:path.join(evidence,'native-inline-open.png')});
 const inlineText=exam.locator('[data-inline-field="text"]');await inlineText.fill('시험지에서 고친 라벨');await inlineText.press('Tab');
 await primaryDrawingWhen(main,state=>state.objects.find(object=>object.id==='desktop-label')?.text==='시험지에서 고친 라벨');
 assert.equal((await h.drawing(main,stateUrl)).objects.find(o=>o.id==='desktop-line').p2.y,3,'label patch preserves unapplied nonlabel geometry');assert.deepEqual(await focused(),{aux:true,primary:false},'label propagation never transfers window focus');
 await exam.screenshot({path:path.join(evidence,'native-inline-labels.png')});await main.screenshot({path:path.join(evidence,'native-inline-primary-labels.png')});
 const inlineFigure=(await pictures(exam))[0].figure,draftRender=structuredClone(inlineFigure.render);draftRender.bounds.w-=.5;
 await exam.evaluate(async({figure,render})=>{const{draft}=await window.fiveEExam.annotations({kind:'read',figure});await window.fiveEExam.annotations({kind:'patch',figure,baseline:draft,edited:draft,render});},{figure:inlineFigure,render:draftRender});
 const primaryInline=await h.drawing(main,stateUrl);assert.deepEqual(primaryInline.pages.find(p=>p.id===inlineBefore.activePageId).meta.examDraftRender,draftRender,'bounded render persists only the crop draft');
 const inlineFile=path.join(profile,'라벨 초안.5e'),inlineBytes=await nativeDownload(app,exam,inlineFile,()=>h.action(exam,'save'));
 const inlineSaved=await parseProject(exam,inlineBytes),savedPage=inlineSaved.workspace.drawing.pages.find(p=>p.id===inlineBefore.activePageId);
 assert.equal(savedPage.objects.find(o=>o.id==='desktop-label').text,'시험지에서 고친 라벨','.5e preserves the propagated label draft');assert.equal(savedPage.objects.find(o=>o.id==='desktop-line').p2.y,3,'.5e retains nonlabel drafts');assert.deepEqual(savedPage.meta.examDraftRender,draftRender,'.5e retains crop drafts');assert.equal(inlineSaved.figures.find(f=>f.id===inlineFigure.id).source.pages[0].objects.find(o=>o.id==='desktop-label').text,'원래 라벨','saving a draft does not change the committed image source');
 await exam.locator('[data-inline-action="apply"]').click();await exam.locator('#exam-inline-editor').waitFor({state:'hidden',timeout:60000});await h.idle(exam);
 const inlineCommitted=(await pictures(exam))[0].figure,inlineAfter=await h.drawing(main,stateUrl);assert.equal(inlineCommitted.source.pages[0].objects.find(o=>o.id==='desktop-label').text,'시험지에서 고친 라벨');assert.equal(inlineAfter.objects.find(o=>o.id==='desktop-line').p2.y,3,'annotation revision preserves nonlabel drafts');assert.equal(inlineAfter.pages.find(p=>p.id===inlineBefore.activePageId).meta.examRevisionId,inlineCommitted.id);assert.deepEqual(await focused(),{aux:true,primary:false},'annotation revision and automatic save preserve auxiliary focus');
 await exam.screenshot({path:path.join(evidence,'native-inline-applied.png')});
 const reloadErrors=[],onPageError=error=>reloadErrors.push(error.message);exam.on('pageerror',onPageError);
 await exam.reload();await ready(exam);await h.idle(exam);const recovery=exam.getByRole('button',{name:'새로 시작',exact:true});if(await recovery.isVisible())await recovery.click();await h.action(exam,'restore');await exam.locator('.exam-draft-dialog button').first().click();await h.idle(exam);
 assert.equal((await pictures(exam))[0].figure.source.pages[0].objects.find(o=>o.id==='desktop-label').text,'시험지에서 고친 라벨','native reload restores the committed inline labels');
 await h.doubleClick(exam);await exam.locator('#exam-inline-editor').waitFor({state:'visible'});await h.idle(exam);await exam.locator('[data-inline-action="original"]').click();await main.locator('#exam-edit-bar').waitFor({state:'visible'});await main.locator('#exam-workspace-open').click();await main.locator('#exam-edit-bar').waitFor({state:'hidden'});await h.idle(exam);
 await h.doubleClick(exam);await exam.locator('#exam-inline-editor').waitFor({state:'visible'});await h.idle(exam);
 assert.equal(await exam.locator('[data-inline-field="text"]').inputValue(),'시험지에서 고친 라벨');assert.equal(await exam.locator('[data-inline-field="text"]').isEnabled(),true);for(const action of ['add-label','original','apply','close'])assert.equal(await exam.locator(`[data-inline-action="${action}"]`).isEnabled(),true,`${action} is enabled after reload and original-editor return`);
 assert.equal(await exam.locator('#exam-status').getAttribute('data-error'),'false',await exam.locator('#exam-status').textContent());assert.deepEqual(await focused(),{aux:true,primary:false},'reloaded inline editor retains auxiliary focus');assert.deepEqual(reloadErrors,[],'native reload and original-editor return have no renderer errors');exam.off('pageerror',onPageError);
 await exam.screenshot({path:path.join(evidence,'native-inline-reloaded.png')});await exam.locator('[data-inline-action="close"]').click();await exam.locator('#exam-inline-editor').waitFor({state:'hidden'});await h.idle(exam);
 await verifyRuntime(main);await verifyRuntime(exam);
 console.log('desktop inline: three no-op reads emitted no workspace-change notifications; reload/original return restored healthy controls and auxiliary focus');
 console.log('desktop inline: auxiliary focus, propagated labels/crop drafts in .5e and preserved nonlabel drafts passed');
}
(async()=>{
 assert.equal(process.env.APP_MODULE_BASE||'/js/','/js/','desktop uses the canonical editor directory');assert.equal(process.env.APP_MODULE_QUERY??moduleQuery,moduleQuery,'desktop uses the integrated runtime query');
 const selectors=process.argv.slice(2);assert.ok(selectors.every(flag=>['--ipc-only','--graph-only','--inline-only'].includes(flag))&&selectors.length<=1,'choose full, --graph-only, --inline-only or --ipc-only');
 await annotationIpcContract();if(selectors.includes('--ipc-only'))return;
 const aiFile=path.join(root,'_work/rhwp/verification/chromium-ai.5e');let aiBytes;
 if(!selectors.length){try{aiBytes=await fs.readFile(aiFile);}catch(error){if(error.code==='ENOENT')throw new Error('Run the current AI browser roundtrip with EVIDENCE_DIR=_work/rhwp/verification, EXAM_ENGINE=chromium and EXAM_SURFACE=root before the full native test');throw error;}assert.ok(aiBytes.length>0,'full native test requires the current browser-produced AI .5e');}
 const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),executablePath=path.resolve(process.env.ELECTRON_EXE||require('electron'));const profile=await fs.mkdtemp(path.join(os.tmpdir(),'5e-exam-desktop-'));
 let completed=false;const app=await _electron.launch({executablePath,args:[root],env:{...process.env,FIVE_E_DEV_USER_DATA:profile,FIVE_E_DISABLE_GPU:'1',FIVE_E_EXAM_PORT:'0'}});try{
 const nativeIdentity=await app.evaluate(({app})=>({version:app.getVersion(),appPath:app.getAppPath()}));
 assert.equal(nativeIdentity.version,JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version,'native app version comes from the candidate package, independently of module cache queries');
 assert.equal(await fs.realpath(nativeIdentity.appPath),await fs.realpath(root),'native launch uses this candidate application directory');
 const main=await waitForPrimary(app);assert.ok(main);await ready(main);
 if(process.argv.includes('--graph-only')){await graphRoundtrip(main,app,profile);completed=true;return;}
 await main.evaluate(async url=>{const{state}=await import(url);state.update(s=>{s.objects=[{id:'desktop-line',type:'line',p1:{x:-15,y:-10},p2:{x:15,y:10},layerId:1,order:0,rotation:0,strokeWidth:.3,strokeLevel:0,lineMode:'solid',arrowHead:'none'},{id:'desktop-label',type:'labeler',p1:{x:-4,y:2},p2:{x:4,y:-4},text:'원래 라벨',labelSize:3,labelType:'label',layerId:1,order:1,rotation:0,strokeWidth:.2,strokeLevel:0}];s.undoStack=[[]];});},stateUrl);
 const before=await h.drawing(main,stateUrl),exam=await windowAfterCapture(app,()=>h.crop(main));await examReady(exam);await h.place(exam);
 assert.equal(await exam.evaluate(()=>typeof window.fiveEDesktop),'undefined','auxiliary window cannot access AI/general native IPC');assert.equal(await exam.evaluate(()=>typeof window.fiveEExam),'object','auxiliary window has only the exam bridge');
 await main.evaluate(async url=>{const {state}=await import(url);state.update(s=>{s.pages.find(p=>p.id===s.activePageId).name='데스크톱 탭 이름';});},stateUrl);
 await h.waitForState(exam,()=>document.querySelector('.exam-figure strong')?.textContent==='데스크톱 탭 이름');
 {const bar=await exam.locator('#rhwp-exam-workspace .exam-topbar').boundingBox();assert.equal((await exam.locator('#exam-studio').boundingBox()).y,bar.y+bar.height);}// 10-20: 공통 맨 위 줄 바로 아래
 if(process.argv.includes('--inline-only')){await inlineRoundtrip(exam,main,app,profile);completed=true;return;}
 await originalEdit(exam,main);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/index.html')).isFocused()),true,'full original editing keeps its primary-window focus behavior');assert.equal((await h.drawing(main,stateUrl)).activePageId,before.activePageId);assert.equal((await h.drawing(main,stateUrl)).undo,1,'native return preserves original history');
 await main.evaluate(async url=>{const{state}=await import(url);state.update(s=>s.objects[0].p2.y=5);},stateUrl);const draftFile=path.join(profile,'미반영 수정.5e');
 // The current source heading has no duplicate Save button. Its native save
 // shortcut invokes saveWorkspace in the real primary, downloading in the aux.
 const draftBytes=await nativeDownload(app,exam,draftFile,()=>main.keyboard.press('Meta+s'));
 const draft=await parseProject(exam,draftBytes);
 assert.equal(draft.figures[0].source.pages[0].objects[0].p2.y,10);assert.equal(draft.workspace.drawing.pages.find(p=>p.id===before.activePageId).objects[0].p2.y,5,'auxiliary .5e includes the unapplied primary-window draft');
 const fullFile=path.join(profile,'전체 프로젝트.5e');
 await main.evaluate(()=>{Object.defineProperty(window,'showSaveFilePicker',{configurable:true,value:undefined});Object.defineProperty(window,'showDirectoryPicker',{configurable:true,value:undefined});});
 const fullBytes=await nativeDownload(app,main,fullFile,async()=>{
  await h.idle(exam);await main.bringToFront();await main.locator('#file-menu-btn').click();await main.locator('#project-save').click();
  const saveDialog=main.locator('.modal-overlay:not([hidden])').last();await saveDialog.locator('.modal-input').fill('전체 프로젝트',{timeout:10000}).catch(async error=>{console.log('primary save dialog:',await saveDialog.textContent());console.log('exam save status:',await exam.locator('#exam-status').textContent());throw error;});await saveDialog.getByRole('button',{name:/^(저장|다운로드)$/}).click();
 });
 const full=await parseProject(exam,fullBytes,true);
 assert.equal(full.kind,'exam','normal primary-window save includes the linked exam');assert.equal(full.workspace.drawing.pages.find(p=>p.id===before.activePageId).objects[0].p2.y,5);
 await h.sendCanvas(main);await h.recrop(main);await main.locator('#exam-edit-bar').waitFor({state:'hidden'});await h.idle(exam);assert.equal((await pictures(exam))[0].figure.source.pages[0].objects[0].p2.y,5);
 const after=await h.drawing(main,stateUrl);assert.equal(after.undo,1);assert.equal(after.pages[0].meta.examRevisionId,(await pictures(exam))[0].figure.id,'native commit receipt keeps the original tab attached to the current revision');
 await originalEdit(exam,main);assert.equal((await h.drawing(main,stateUrl)).undo,1,'second original edit preserves original live controller');await main.locator('#exam-workspace-open').click();await main.locator('#exam-edit-bar').waitFor({state:'hidden'});
 await h.crop(main);await h.idle(exam);await exam.locator('.exam-placement:not([hidden])').waitFor();await exam.locator('[data-exam-action="confirm-placement"]').click();await h.idle(exam);assert.equal((await pictures(exam)).length,1,'same native tab sends update one image');assert.equal(app.windows().filter(p=>p.url().startsWith('http:')).length,1,'exam window is reused');
 await exam.locator('[data-exam-action="close"]').click();await h.idle(exam);assert.equal(await exam.locator('.capture-overlay').count(),0,'native exam sends return to the real source window');
 assert.equal(await app.evaluate(({BrowserWindow},url)=>BrowserWindow.getAllWindows().find(window=>window.webContents.getURL()===url).isFocused(),primaryUrl),true,'the current source-return control focuses the actual primary window');
 const pending=await exam.evaluate(async()=>{try{await window.fiveEExam.requestEdit({requestId:'bad',figure:{}});return false;}catch{return true;}});assert.equal(pending,true,'invalid edit requests are rejected');
 await exam.reload();await ready(exam);await h.idle(exam);const recovery=exam.getByRole('button',{name:'새로 시작',exact:true});if(await recovery.isVisible())await recovery.click();await h.action(exam,'restore');await exam.locator('.exam-draft-dialog button').first().click();await h.idle(exam);assert.equal((await pictures(exam)).length,1,'draft survives exam reload');assert.equal((await pictures(exam))[0].figure.name,'데스크톱 탭 이름');
 await main.bringToFront();await main.locator('#file-menu-btn').click();const chooser=main.waitForEvent('filechooser');await main.locator('#project-open').click();
 await projectInput(exam,async()=>{await (await chooser).setFiles(fullFile);});
 assert.equal((await pictures(exam))[0].figure.source.pages[0].objects[0].p2.y,10,'primary file picker routes .5e to the auxiliary document');
 await originalEdit(exam,main);assert.equal((await h.drawing(main,stateUrl)).objects[0].p2.y,5,'primary project reopen retains the unapplied draft');await main.locator('#exam-workspace-open').click();await main.locator('#exam-edit-bar').waitFor({state:'hidden'});
 await inlineRoundtrip(exam,main,app,profile);
 const portableAi=await parseProject(exam,aiBytes),aiTasks=portableAi.workspace.ai.workspaces.flatMap(workspace=>workspace.tabs),expectedTask=aiTasks.find(task=>task.id==='task-a');
 assert.ok(expectedTask,'current browser fixture contains the original AI task');assert.equal(expectedTask.selectedCandidateId,'candidate-a-2');assert.equal(expectedTask.conversationMessages[0].content,'수정 이력 a');
 await projectInput(exam,()=>exam.locator('#exam-project-file').setInputFiles(aiFile));
 const aiPictures=await pictures(exam);assert.equal(aiPictures.length,2,'native file input restores both independent AI figures');
 const expectedFigure=portableAi.figures.find(figure=>figure.id===aiPictures[0].figure.id);assert.ok(expectedFigure);assert.deepEqual(aiPictures[0].figure.source,expectedFigure.source,'native document retains the exact browser-produced editable source');
 await originalEdit(exam,main,0);await main.locator('#ai-image-panel').waitFor({state:'visible'});
 assert.equal(await main.locator('#ai-image-panel [data-ai-input]').inputValue(),'원래 요청 a','native return restores the portable AI history in the real 5E window');assert.equal(await main.locator('#ai-image-panel [data-ai-comments] textarea').inputValue(),'수정한 코멘트 a');
 assert.equal(await main.locator('#ai-image-panel .ai-task-tab.is-on').getAttribute('data-tab-id'),'task-a','native original return activates the linked task');
 const restoredAi=await parseProject(exam,await main.evaluate(async()=>[...new Uint8Array(await window.fiveEDesktop.exam.projectSnapshot())])),restoredTask=restoredAi.workspace.ai.workspaces.flatMap(workspace=>workspace.tabs).find(task=>task.id==='task-a');
 assert.deepEqual(restoredTask.generated,expectedTask.generated,'native original return preserves every candidate field, version, comment and review');assert.deepEqual(restoredTask.attachments,expectedTask.attachments);assert.deepEqual(restoredTask.conversationMessages,expectedTask.conversationMessages);assert.equal(restoredTask.selectedCandidateId,expectedTask.selectedCandidateId);
 const aiLayout=await main.evaluate(()=>({viewport:{w:innerWidth,h:innerHeight},mode:document.documentElement.dataset.mode,bodyClass:document.body.className,toolbarBottom:getComputedStyle(document.body).getPropertyValue('--exam-source-toolbar-bottom'),elements:['.canvas-toolbar','#exam-edit-bar','#ai-image-panel','#ai-image-panel .ai-workbench','#ai-image-panel .ai-workspace','#ai-image-panel [data-ai-input]'].map(selector=>{const element=document.querySelector(selector),style=getComputedStyle(element);return{selector,rect:element.getBoundingClientRect().toJSON(),hidden:element.hidden,display:style.display,position:style.position,top:style.top,height:style.height,transform:style.transform};})}));
 await fs.writeFile(path.join(evidence,'native-ai-return-layout.json'),JSON.stringify(aiLayout,null,2)+'\n');console.log('native AI return layout:',JSON.stringify(aiLayout));await main.screenshot({path:path.join(evidence,'native-ai-return-before-layout.png')});
 // The retained RHWP source now anchors its region badge above the actual
 // AI preview. The fixed canvas toolbar remains the panel's top boundary.
 const geometry=await main.evaluate(nativeAiGeometry);await fs.writeFile(path.join(evidence,'native-ai-geometry.json'),JSON.stringify(geometry,null,2)+'\n');console.log('native AI geometry checks:',JSON.stringify(geometry.checks));
 await h.waitForState(main,source=>Object.values((0,eval)('('+source+')')().checks).every(Boolean),nativeAiGeometry.toString());
 await main.screenshot({path:path.join(evidence,'native-ai-return.png')});await main.locator('#exam-workspace-open').click();await main.locator('#exam-edit-bar').waitFor({state:'hidden'});await h.idle(exam);await verifyRuntime(main);await verifyRuntime(exam);
 console.log('desktop: inline double click/focus, primary labels/crop drafts in .5e, nonlabel draft preservation, full editor/history, native revision, resend, reload and AI restoration passed');
 completed=true;
}finally{
 try{await fs.mkdir(evidence,{recursive:true});await fs.writeFile(path.join(evidence,'runtime-receipt.json'),JSON.stringify({mode:selectors[0]||'full',completed,pid:app.process().pid,executablePath,appVersion:await app.evaluate(({app})=>app.getVersion()).catch(()=>null),versions:await app.evaluate(()=>process.versions).catch(()=>null),aiFixture:aiBytes?{path:aiFile,sha256:createHash('sha256').update(aiBytes).digest('hex'),bytes:aiBytes.length}:null,runtimeReceipts},null,2)+'\n');}
 finally{try{await app.evaluate(({BrowserWindow})=>{for(const win of BrowserWindow.getAllWindows())win.destroy();}).catch(()=>{});await app.close();}finally{await fs.rm(profile,{recursive:true,force:true});}}
}})().catch(error=>{console.error(error);process.exitCode=1;});
