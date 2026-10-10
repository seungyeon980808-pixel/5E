const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const {entryConfiguration,mainModuleUrl,runtimeConfiguration,assertLoadedRuntime}=require('../helpers/four-session-entry.cjs');

// Explicit fixture data and a transport-only mock. Product modules run unchanged
// except that the existing main bootstrap exposes its workspace manager to QA.
function seedWorkspaces({count,unlabeled,selectedPartial,precisionMove}) {
  localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true');
  localStorage.setItem('5e.preview:5e.aiReviewDefaultsVersion','1');
  const listeners=new Set(),sends=[];
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=384;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,512,384);
  ctx.strokeStyle='#111';ctx.fillStyle='#111';ctx.lineWidth=3;ctx.strokeRect(40,50,420,280);
  ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(110,285);ctx.lineTo(190,285);ctx.lineTo(181,279);ctx.moveTo(190,285);ctx.lineTo(181,291);ctx.stroke();
  ctx.fillRect(415,285,5,5); // Uncertain mark: preserve even if deletion is proposed.
  const modified=canvas.toDataURL('image/png');
  if(!unlabeled) {
    ctx.fillRect(320,225,30,10); // Known owned label glyph pixels.
    ctx.beginPath();ctx.moveTo(319,230);ctx.lineTo(256,192);ctx.stroke();
    ctx.beginPath();ctx.arc(256,192,4,0,2*Math.PI);ctx.stroke();
  }
  if(precisionMove) {
    ctx.fillStyle='#111';ctx.fillRect(320,140,31,3);ctx.fillRect(348,140,3,12);
  }
  const original=canvas.toDataURL('image/png');
  const tabs=Array.from({length:count},(_,index)=>({
    id:`task-${index}`,title:`검증 작업 ${index+1}`,workState:'idle',input:'라벨을 처리해 주세요',
    model:selectedPartial?'gpt-6.1-sol':'gpt-6-sol',effort:'medium',serviceTier:selectedPartial?'priority':'',separationMode:'off',
    outputOptions:{backgroundPolicy:'preserve',examPalette:false,lineThickness:0},
    attachments:[{id:`source-${index}`,kind:'reference',name:`원본 ${index+1}`,data:original,comments:[]}],
    generated:selectedPartial?[{id:`selected-${index}`,kind:'generated',name:'Selected PNG',data:original,
      comments:[{type:'area',imageId:`selected-${index}`,number:1,x:60,y:30,w:20,h:30,
        text:precisionMove?'Move only the L-shaped mark 20 pixels to the right. Preserve all other marks.':'Add one black dot inside the box.',
        ...(precisionMove?{precisionCheck:{kind:'move',dx:20,dy:0,search:{x0:312,y0:128,x1:396,y1:190}}}:{})}]}]:[],
    selectedCandidateId:selectedPartial?`selected-${index}`:null,conversationMessages:[],uiMessages:[],
  }));
  window.__task2={original,modified,sends,paidCalls:0,emit(index,kind,text) {
    const sent=sends[index],params={turnId:sent.turnId};let method;
    if(kind==='assistant'){method='item/completed';params.item={type:'agentMessage',phase:'final_answer',text};}
    else if(kind==='image'){method='item/completed';params.item={type:'imageGeneration',imageDataUrl:/^data:image\/png;base64,/.test(text||'')?text:modified};}
    else if(kind==='error'){method='error';params.error={message:'late synthetic error'};}
    else {method='turn/completed';params.turn={id:sent.turnId,status:'completed'};}
    for(const listener of listeners)listener({clientScope:sent.payload.clientScope||'',method,params});
  }};
  window.fiveEDesktop={
    web:true,status:async()=>({login:{loggedIn:true},server:true}),start:async()=>({ok:true}),stop:async()=>({ok:true}),
    models:async()=>({data:[
      {model:'gpt-6.1-sol',displayName:'Sol 6.1',isDefault:true,defaultReasoningEffort:'medium',supportedReasoningEfforts:['medium'],serviceTiers:['priority']},
      {model:'gpt-6-luna',displayName:'Luna 6',defaultReasoningEffort:'medium',supportedReasoningEfforts:['medium'],serviceTiers:['priority']},
      {model:'gpt-6-sol',displayName:'Sol 6',defaultReasoningEffort:'medium',supportedReasoningEfforts:['medium'],serviceTiers:['priority']}
    ]}),
    account:async()=>({rateLimits:{}}),login:async()=>{},
    send:async payload=>{const turnId=`turn-${sends.length}`,threadId=`thread-${sends.length}`;sends.push({payload,turnId,threadId});window.dispatchEvent(new Event('qa:bridge-send'));return{turnId,threadId};},
    interrupt:async()=>({ok:true}),onEvent:callback=>{listeners.add(callback);return()=>listeners.delete(callback);},
    onState:()=>()=>{},onLog:()=>()=>{},setAiTaskShortcutActive(){},onAiCloseTaskShortcut:()=>()=>{},
  };
  window.__seedReady=new Promise((resolve,reject)=>{
    const request=indexedDB.open('5e.preview:5e-ai-image-tasks',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('tasks',{keyPath:'key'});
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction('tasks','readwrite'),store=tx.objectStore('tasks'),stored=store.get('workspace');
      stored.onsuccess=()=>{if(!stored.result)store.put({key:'workspace',tabs,activeTaskTabId:tabs[0].id,taskTabSerial:count+1,imageSerial:count});};
      tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
    };
  });
}
async function fixture(context,count,evidence,{unlabeled=false,selectedPartial=false,precisionMove=false,browserContextOptions={},beforeNavigate}={}) {
  const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
  const configured=process.env.RELEASE_URL || process.env.EXAM_URL;
  const server=configured?null:http.createServer((request,response)=>{
    const pathname=new URL(request.url,'http://localhost').pathname;
    let file=path.resolve(root,`.${pathname}`);
    if(file!==root&&!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
    if(pathname.endsWith('/'))file=path.join(file,'index.html');
    fs.readFile(file,(error,body)=>{response.writeHead(error?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});response.end(error?'missing':body);});
  });
  if(server)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=configured?new URL(configured).origin:`http://127.0.0.1:${server.address().port}`;
  const config=entryConfiguration();
  const entryUrl=new URL(config.entry,origin).href;
  const html=fs.readFileSync(path.join(root,config.entry==='/'?'index.html':'preview/index.html'),'utf8');
  const main=fs.readFileSync(path.join(root,'js/main.js'),'utf8');
  const runtime=runtimeConfiguration(config,entryUrl,mainModuleUrl(html,entryUrl),main);
  const engine=process.env.TASK2_ENGINE==='webkit'?webkit:chromium;
  let browser;
  try { browser=await engine.launch({headless:true}); }
  catch(error) { if(server)await new Promise(resolve=>server.close(resolve));throw error; }
  const browserContext=await browser.newContext({viewport:{width:1440,height:1000},...browserContextOptions});
  await browserContext.tracing.start({screenshots:true,snapshots:true});
  const page=await browserContext.newPage();page.setDefaultTimeout(10000);
  const loaded=[];page.on('response',response=>loaded.push(response.url()));
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  context.after(async()=>{
    if(!page.isClosed()) {
      const diagnostic=await page.evaluate(()=>({panels:[...document.querySelectorAll('[data-ai-busy]')].map(p=>({id:p.id,busy:p.dataset.aiBusy,phase:p.dataset.aiRequestPhase,status:p.querySelector('[data-ai-status]')?.textContent})),requests:window.__task2?.sends.map(s=>({purpose:s.payload.purpose,text:s.payload.text})),errors:[]}));
      fs.writeFileSync(path.join(evidence,'diagnostic.json'),JSON.stringify({diagnostic,errors},null,2));
    }
    await browserContext.tracing.stop({path:path.join(evidence,'trace.zip')});
    await browserContext.close();await browser.close();
    const port=server?.address()?.port || Number(new URL(origin).port);if(server)await new Promise(resolve=>server.close(resolve));
    fs.writeFileSync(path.join(evidence,'cleanup.json'),JSON.stringify({browserClosed:!browser.isConnected(),serverClosed:server?!server.listening:null,retainedExternalServer:!server,port,engine:process.env.TASK2_ENGINE||'chromium'}));
  });
  await page.addInitScript(seedWorkspaces,{count,unlabeled,selectedPartial,precisionMove});
  await page.route(runtime.mainUrl,route=>{
    const source=fs.readFileSync(path.join(root,'js/main.js'),'utf8');
    const hook='const aiPanel = initAiPanel(state, { freshStart: recoveryChoice === "fresh", materializeCandidate });';
    assert.ok(source.includes(hook),'Real application initialization hook must exist');
    return route.fulfill({contentType:'text/javascript',body:'await window.__seedReady;\n'+source.replace(hook,hook+' window.__task2Manager = aiPanel; window.__candidateQA = {state,examWorkspace,materializeCandidate};')});
  });
  if(beforeNavigate)await beforeNavigate(page);
  await page.goto(entryUrl,{waitUntil:'domcontentloaded',timeout:30000});
  const welcome=page.locator('.tut-welcome-overlay .tut-banner-no');if(await welcome.isVisible())await welcome.click();
  await page.locator('#ai-image-install-open').click();
  await page.evaluate(()=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{cleanup();reject(new Error('Seeded source image did not load'));},10000);
    const observer=new MutationObserver(check);
    function cleanup(){clearTimeout(timer);observer.disconnect();document.removeEventListener('load',check,true);}
    function check(){if([...document.querySelectorAll('#ai-image-panel .ai-image-card img')].some(i=>i.naturalWidth===512)){cleanup();resolve();}}
    document.addEventListener('load',check,true);
    observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
    check();
  }));
  assertLoadedRuntime(runtime,loaded);
  assert.deepEqual(errors,[],'Real application boot has no runtime errors');
  return{page,errors};
}
const plan = {
  version: 4, observationVersion: 1, leaderObservationVersion: 1,
  observationContractRevision: '1.4.0', removalOnlyItems: [],
  geometryLock: { version: 1, objects: [{ id: 'frame', sourceRef: 1, description: '사각형 과학 구조', bounds: { x:40/512,y:50/384,w:420/512,h:280/384 }, relations: [] }] },
  reviewRequired: false,
  labels: [{ id: 'source-label', sourceKind: 'reference', sourceRef: 1, scope: 'general', text: '전자', disposition: 'restore', semanticRole: 'scientific-label', reason: 'Synthetic source label classification', leaderPresence: 'present', leaderDash: 'solid', mode: 'leader', contentMode: 'plain',
    targetBinding: {status:'confirmed',objectId:'frame',reason:'Observed rectangle containing the leader endpoint'}, position: {x:335/512,y:230/384},
    leaderRoutes: [{kind:'straight',attachment:'label',start:{x:319/512,y:230/384},target:{x:.5,y:.5},end:'circle',endRadius:4/512}],
    typography: {role:'text',bounds:{x:317/512,y:222/384,w:37/512,h:17/384}} }],
  removalRegions: [
    {id:'text-region',labelId:'source-label',sourceRef:1,ownership:'confirmed',kind:'polygon',component:'text',method:'flat-background',points:[{x:314/512,y:218/384},{x:358/512,y:218/384},{x:358/512,y:244/384},{x:314/512,y:244/384}]},
    {id:'leader-region',labelId:'source-label',sourceRef:1,ownership:'confirmed',kind:'path',component:'leader',method:'flat-background',width:14/384,points:[{x:319/512,y:230/384},{x:.5,y:.5}]},
    {id:'endpoint-region',labelId:'source-label',sourceRef:1,ownership:'confirmed',kind:'ellipse',component:'endpoint',method:'flat-background',bounds:{x:248/512,y:184/384,w:16/512,h:16/384}},
  ],
  protectedRegions: [],
  preservedMarks: [{text:'혈류 화살표',sourceRef:1,reason:'scientific-flow-arrow',bounds:{x:105/512,y:274/384,w:92/512,h:23/384}}],
  uncertainties: [{sourceRef:1,reason:'이 점의 소속 불확실',bounds:{x:410/512,y:280/384,w:15/512,h:15/384}}],
};
// Positive adoption scenarios explicitly identify the kept point. The original
// uncertain plan above remains available to negative preservation scenarios.
const verifiedPlan = {...plan, uncertainties: [], preservedMarks: [...plan.preservedMarks,
  {text:'보존 구조점',sourceRef:1,reason:'confirmed-scientific-mark',bounds:{x:410/512,y:280/384,w:15/512,h:15/384}}]};
const checks = ['object-counts','inside-outside','liquid-occupancy','connections','composition-state','black-fill-meaning','presentation','request-scope','kice-flat-style','flat-gray-regions','raster-label-removal','editable-label-coverage','leader-relations','label-overlay-alignment','label-typography','leader-overlay'];
const report = () => JSON.stringify({verdict:'pass',checks:checks.map(id=>({id,label:id,status:'pass',detail:'고정 응답을 사용하는 UI 회귀용 근거'})),issues:[]});
function placement(sourcePlan = verifiedPlan) {
  return JSON.stringify({version:1,labels:sourcePlan.labels.filter(l=>l.scope==='general').map(l=>({
    id:l.id,status:'matched',targetIdentity:{sourceObjectId:'frame',description:'사각 구조의 동일한 내부 대상'},
    position:l.position,anchor:l.anchor || l.leaderRoutes?.[0]?.target || l.position,bounds:l.typography.bounds,...(l.leaderRoutes?{leaderRoutes:l.leaderRoutes}:{}),
    ...(l.elbow?{elbow:l.elbow}:{}),...(l.extraAnchors?{extraAnchors:l.extraAnchors}:{})
  }))});
}
const sends = page => page.evaluate(() => window.__task2.sends.map(s=>({purpose:s.payload.purpose,text:s.payload.text,attachmentCount:s.payload.attachments?.length,turnId:s.turnId})));
const snapshot = page => page.evaluate(async()=> (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(w=>w.tabs));
async function emit(page,index,kind,text) { await page.evaluate(({index,kind,text})=>{window.__task2.emit(index,kind,text);window.__task2.emit(index,'done');},{index,kind,text}); }
async function choose(page,imageKind,labelResult) {
  const source=page.locator('#ai-image-panel .ai-source-treatment');
  if(!await source.evaluate(element=>element.open)) await source.locator('summary').click();
  await page.locator('#ai-image-panel [data-ai-setting-key=kind]').getByRole('button',{name:imageKind==='exam'?'기출':'일반',exact:true}).click();
  await page.locator('#ai-image-panel [data-ai-setting-key=labels]').getByRole('button',{name:labelResult==='remove'?'끄기':'켜기',exact:true}).click();
}
function jointResponse(text) {
  const groups=JSON.parse(text.split('고정 후보: ')[1].split('\n')[0]);
  const placement={version:1,groups:groups.map(g=>({id:g.id,status:'matched',candidateId:g.candidates[0]?.candidateId,identities:g.labels.map(l=>({id:l.id,sourceObjectId:l.sourceAssociation.objectId})),reason:'Synthetic response confirming the rendered candidate for UI regression only'}))};
  return JSON.stringify({placement,review:JSON.parse(report())});
}
async function finish(page,{sourcePlan=verifiedPlan,startIndex=0}={}) {
  let next=startIndex;
  const seen=[];
  // Bridge events and exact busy-state mutations drive each phase, without timing delays.
  for(let step=0;step<30;step++) {
    await page.evaluate(({next,allowDone})=>new Promise((resolve,reject)=>{
      const panel=document.querySelector('#ai-image-panel');
      const ready=()=>window.__task2.sends.length>next || allowDone && panel.dataset.aiBusy==='false';
      const observer=new MutationObserver(check);
      const timeout=setTimeout(()=>{cleanup();reject(new Error('Bridge phase did not advance'));},10000);
      function cleanup(){clearTimeout(timeout);observer.disconnect();window.removeEventListener('qa:bridge-send',check);}
      function check(){if(ready()){cleanup();resolve();}}
      window.addEventListener('qa:bridge-send',check);
      observer.observe(panel,{attributes:true,attributeFilter:['data-ai-busy']});
      check();
    }),{next,allowDone:next>startIndex});
    const requests=await sends(page);
    if(requests.length===next) break;
    const request=requests[next];seen.push(request);
    if(request.purpose==='image') await emit(page,next,'image');
    else if(request.text.includes('고정 후보: ')) {
      await emit(page,next,'assistant',jointResponse(request.text));
    }
    else if(request.text.includes('최종 RAW 후보다')) await emit(page,next,'assistant',placement(sourcePlan));
    else if(request.text.includes('입력 원본 라벨 관찰')) await emit(page,next,'assistant',JSON.stringify(sourcePlan));
    else if(request.text.includes('FINAL_NATIVE_OVERLAY') || request.text.includes('검수')) await emit(page,next,'assistant',report());
    else throw new Error('Unrecognized mocked bridge request: '+request.text.slice(0,200));
    next++;
  }
  assert.equal(await page.locator('#ai-image-panel').getAttribute('data-ai-busy'),'false');
  return seen;
}
module.exports={fixture,plan,verifiedPlan,report,placement,sends,snapshot,emit,choose,finish,jointResponse};
