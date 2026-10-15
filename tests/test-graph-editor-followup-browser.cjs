// Fixed graph source: b1846e849656076b1c0c5da2f82abffff3813eb1:tests/test-graph-editor-followup-browser.cjs
/* Real browser workflows for graph child-dialog, version history and comparison.
 * AI requests replay a SHA-verified recorded response; no live provider. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium,webkit}=require('./helpers/graph-source-signals.cjs').loadPlaywright();
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.EVIDENCE_DIR||path.join(root,'.omo/evidence/graph-editor-followup-20261009/browser'));
const base=process.env.PREVIEW_URL||'http://127.0.0.1:62759/',version='?v=1.7.0-four-session-integration';
fs.mkdirSync(out,{recursive:true});
const report={startedAt:new Date().toISOString(),base,provider:'Recorded-response replay only',cases:[]};
const cache=page=>page.evaluate(()=>window.__readGraphFollowupWorkspace());
async function waitVersions(page,count){await page.waitForGraphSignal(async count=>(await window.__readGraphFollowupWorkspace())?.tabs?.flatMap(t=>t.generated||[]).length===count,count,{timeout:5000});return cache(page);}
const versions=d=>d.tabs.flatMap(t=>t.generated||[]);
async function drag(page,locator,dx,dy){const b=await locator.boundingBox();assert(b);await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+dx,b.y+b.height/2+dy,{steps:8});await page.mouse.up();}
const ink=page=>page.locator('#gm-preview .gm-preview-svg').evaluate(n=>[...n.querySelectorAll('path,polyline,line,text')].filter(x=>!x.closest('[data-preview-hit],[data-preview-annotation-hit]')).map(x=>({stroke:getComputedStyle(x).stroke,fill:getComputedStyle(x).fill})));
const axis=(title,min,max)=>({min,max,step:1,title,unit:'',scale:'linear',ticks:[]});
const plan={schema:'5e.graph-reconstruction/v1',source:{id:'tracing-browser-fixture',hash:'synthetic',width:400,height:300,plotBox:{x:40,y:20,w:320,h:240}},axes:{x:axis('시간',0,4),y:axis('크기',-1,10)},series:[{id:'expression',kind:'expression',axis:'y',certainty:'exact',coordinateSpace:'data',expression:'2*x',domain:{min:.123456789,max:4}},{id:'polyline',kind:'points',axis:'y',certainty:'exact',coordinateSpace:'data',curveStyle:'straight',points:[{x:0,y:-1},{x:.25,y:-.5},{x:.5,y:0},{x:.75,y:.5},{x:1,y:1},{x:1.5,y:1},{x:2,y:.5}]}],annotations:[{id:'guide',kind:'guide',text:'',x:1,y:2,to:{x:0,y:2},seriesId:'expression',anchorX:1,axis:'y',orientation:'horizontal',strokeWidth:.10714285714285714,dashLength:1.7948717948717947,dashGap:.7692307692307692},{id:'label',kind:'text',text:'긴 한글 라벨 A와 연결된 함수',x:1,y:2,seriesId:'expression',anchorX:1,axis:'y',orientation:'horizontal'},{id:'polyguide',kind:'guide',text:'',x:.5,y:0,to:{x:.5,y:-1},seriesId:'polyline',axis:'y',orientation:'vertical'}],regions:[],review:[]};
const curve=(s,id)=>s.objects.find(o=>o.reconstruction?.seriesId===id),plane=s=>s.objects.find(o=>o.type==='coordplane');
async function setup(browser,replay){
 const context=await browser.newContext({viewport:{width:1600,height:1080},serviceWorkers:'block',acceptDownloads:true});
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(['http:','https:'].includes(u.protocol)&&!['localhost','127.0.0.1'].includes(u.hostname))return r.fulfill({status:200,body:'',contentType:u.hostname==='fonts.googleapis.com'?'text/css':'text/plain'});return r.continue();});
 await context.addInitScript(({plan})=>{localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true');localStorage.setItem('5e.tutorial.bannerSeen','true');localStorage.setItem('5e.preview:5e.mode','pro');window.showSaveFilePicker=undefined;window.showDirectoryPicker=undefined;
 window.__readGraphFollowupWorkspace=async()=>{
  const active=document.querySelector('#ai-image-panel .ai-task-tab.is-on');if(!active)return null;
  const {tabId,aiWorkspaceLink:scope}=active.dataset;if(!tabId||!scope)throw Error('Visible workspace identity missing');
  const {IndexedDBOutputCacheBackend}=await import(location.origin+'/js/ai-output-cache-store.js?v=1.7.0-four-session-integration');
  const saved=await new IndexedDBOutputCacheBackend({databaseName:scope==='legacy'?'5e-ai-image-tasks':'5e-ai-image-tasks-'+scope,storeName:'tasks'}).get('workspace');
  if(saved?.activeTaskTabId!==tabId)throw Error('Visible and persisted workspace differ');return saved;
 };

 if(plan){const listeners=new Set();window.__traceReplay={requests:[]};window.fiveEDesktop={web:true,status:async()=>({login:{loggedIn:true},server:true}),start:async()=>({ok:true}),account:async()=>({rateLimits:{}}),models:async()=>({data:[{model:'gpt-6.1-sol',displayName:'Recorded replay',isDefault:true,defaultReasoningEffort:'medium',supportedReasoningEfforts:['medium'],serviceTiers:[]}]}),onEvent:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},onState:()=>()=>{},onLog:()=>()=>{},setAiTaskShortcutActive(){},onAiCloseTaskShortcut:()=>()=>{},interrupt:async()=>({ok:true}),send:async request=>{window.__traceReplay.requests.push(request);const m=request.text.match(/바인딩을 정확히 복사하고[^\n]*: (\{[^\n]+\})/);if(!m)throw Error('Replay source binding missing');const reply=structuredClone(plan);reply.source={...JSON.parse(m[1]),plotBox:plan.source.plotBox};const turnId='tracing-replay';queueMicrotask(()=>{for(const event of [{method:'item/completed',params:{turnId,item:{type:'agentMessage',text:JSON.stringify(reply)}}},{method:'turn/completed',params:{turn:{id:turnId,status:'completed'}}}])for(const fn of listeners)fn({...event,clientScope:request.clientScope});});return{turnId,threadId:'tracing-replay'};}};}
 },{plan:replay?.plan});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(8000);await page.goto(base+'?mode=pro',{waitUntil:'networkidle'});
 const skip=page.getByRole('button',{name:'건너뛰기',exact:true});if(await skip.isVisible().catch(()=>false))await skip.click();
 return{context,page,errors};
}
async function install(page){await page.evaluate(async({plan,version})=>{const{state}=await import('/js/state.js'+version),{buildNativeGraph}=await import('/js/graph/native-graph.js'+version);let n=0;const built=buildNativeGraph(plan,{box:{x:-40,y:-25,w:80,h:50},layerId:1,nextId:()=>n++===0?'tracing-plane':`tracing-${n}`});if(!built.ok)throw Error(built.error);built.objects.find(o=>o.reconstruction?.seriesId==='expression').strokeWidth=.10714285714285714;window.__qaState=state;state.update(s=>{s.objects=built.objects;s.groups=built.groups;s.selectedIds=[];s.undoStack=[];s.redoStack=[];s.activeTool='V';s.activeLayerId=1;});}, {plan,version});}
const snapshot=page=>page.evaluate(()=>structuredClone({objects:window.__qaState.get().objects,groups:window.__qaState.get().groups}));
const open=page=>page.evaluate(async version=>(await import('/js/graph/graph-modal.js'+version)).openGraphModal('tracing-plane'),version);
async function exportSvg(page){return page.evaluate(async version=>{const{buildExportSvg}=await import('/js/svg-export.js'+version);const state=window.__qaState.get(),p=state.objects.find(o=>o.type==='coordplane');return buildExportSvg(state,{x:p.x-p.w*.2,y:p.y-p.h*.2,w:p.w*1.4,h:p.h*1.4}).outerHTML;},version);}
async function syntheticSource(page){return Buffer.from((await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=300;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,400,300);g.strokeStyle='black';g.lineWidth=2;g.beginPath();g.moveTo(40,20);g.lineTo(40,260);g.lineTo(360,260);g.moveTo(40,260);g.lineTo(360,60);g.stroke();g.fillStyle='black';g.font='20px serif';g.fillText('x',370,270);g.fillText('y',25,18);return c.toDataURL();})).split(',')[1],'base64');}
async function resultInCache(page){return page.evaluate(async version=>{const{IndexedDBOutputCacheBackend}=await import('/js/ai-output-cache-store.js'+version);const d=await new IndexedDBOutputCacheBackend({databaseName:'5e-ai-image-tasks',storeName:'tasks'}).get('workspace');return d?.tabs?.flatMap(t=>t.generated||[]).filter(c=>c.graphResult).at(-1)?.graphResult;},version);}

async function run(browser,engine,kind){
 const row={id:`${engine}-${kind}`,actions:[],artifacts:[],verdict:'FAIL'};report.cases.push(row);
 const step=async(name,fn)=>{row.actions.push({name});await fn();row.actions.at(-1).pass=true;};
 let env;try{
 const replay=kind==='history'?JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/graph-analytic-recovery/p2_2021_09_03.json'))):null;
 env=await setup(browser,replay);const {page}=env;
 const shot=async(name)=>{const f=path.join(out,`${row.id}-${name}.png`);await page.screenshot({path:f,animations:'disabled'});row.artifacts.push(f);};
 const save=(name,value)=>{const f=path.join(out,`${row.id}-${name}.json`);fs.writeFileSync(f,JSON.stringify(value,null,2));row.artifacts.push(f);};
 if(kind==='history'){
  await step('Restore real recorded graph through image converter UI',async()=>{
   assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,replay.responseFile))).digest('hex'),replay.responseSha256);
   await page.locator('#ai-image-install-open').click();
   assert.equal(await page.locator('#ai-image-panel .ai-workbench').evaluate(n=>getComputedStyle(n).animationName),'modal-pop');
   await page.locator('#ai-image-panel [data-ai-workflow="graph"]').click();
   await page.locator('#ai-image-panel [data-ai-source-file]').setInputFiles(path.join(root,replay.sourceFile));
   await page.locator('#ai-image-panel [data-ai-attachment-list] img').first().waitFor({state:'attached'});
   await page.observeGraphSignal(()=>window.__traceReplay.requests.length===1&&document.querySelector('#ai-image-panel')?.dataset.aiBusy!=='true', null, {timeout:45000}, async () => { await page.locator('#ai-image-panel [data-ai-send]').click(); });
  });
  const original=structuredClone(versions(await waitVersions(page,1))[0]);
  const stage=()=>page.locator(`#ai-image-panel [data-ai-candidate-id="${original.id}"] .ai-preview-stage`);
  await step('Persistent image badge opens a topmost graph editor immediately, without closing image editor',async()=>{
   await page.locator('#ai-image-panel [data-ai-graph-edit]').click();await page.locator('#gm-preview .gm-preview-svg').waitFor();
   assert(await page.locator('#ai-image-panel').isVisible());
   assert(await page.locator('#graph-modal-overlay .gm-modal').evaluate(n=>{const b=n.getBoundingClientRect();return Boolean(document.elementFromPoint(b.x+b.width/2,b.y+60)?.closest('#graph-modal-overlay'));}));
   const edges=await page.locator('#graph-modal-overlay').evaluate(root=>{
    const fields=[...root.querySelectorAll('button,input,select,textarea,summary,[tabindex]')].filter(n=>!n.disabled&&n.tabIndex>=0&&!n.closest('[hidden],[inert]')&&n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden');
    fields.at(-1).focus();return{first:fields[0].id,last:fields.at(-1).id};
   });
   await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),edges.first,'Tab stays inside the graph child dialog');
   await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),edges.last,'Reverse Tab stays inside the graph child dialog');
   await page.locator('#gm-labelx').fill('첫 번째 수정');await page.locator('#gm-labelx').press('Tab');
   await shot('immediate-editor');await page.locator('#gm-cancel').click();assert.deepEqual(versions(await cache(page)),[original]);
  });
  await step('Apply appends a new image/version and preserves original pixels, objects and review log',async()=>{
   await page.locator('#ai-image-panel [data-ai-graph-edit]').click();await page.locator('#gm-preview .gm-preview-svg').waitFor();
   await page.locator('#gm-labelx').fill('첫 번째 수정');await page.locator('#gm-labelx').press('Tab');
   await page.observeGraphSignal(()=>document.querySelector('#ai-image-panel [data-ai-status]')?.textContent.includes('편집을 적용'), undefined, undefined, async () => { await page.locator('#gm-confirm').click(); });
   const saved=await waitVersions(page,2),vs=versions(saved);assert.deepEqual(vs[0],original);assert.notEqual(vs[1].data,original.data);assert.equal(vs[1].graphEdit.parentCandidateId,original.id);
   assert.equal(plane(vs[1].graphResult).labelX,'첫 번째 수정');assert.equal(saved.tabs.find(t=>t.generated.length).selectedCandidateId,vs[1].id);
   await page.locator('#ai-image-panel [data-ai-version-button]').click();assert.equal(await page.locator('#ai-image-panel [data-ai-candidate-option]').count(),2);
   await page.locator(`#ai-image-panel [data-ai-candidate-option="${original.id}"]`).click();
   assert.equal(await stage().locator('img').getAttribute('src'),original.data);await shot('history-original');save('two-versions',saved);
  });
  await step('Editing a previous version makes another independent result; reload keeps three versions',async()=>{
   await page.locator('#ai-image-panel [data-ai-graph-edit]').click();await page.locator('#gm-preview .gm-preview-svg').waitFor();
   await page.locator('#gm-labelx').fill('두 번째 수정');await page.locator('#gm-labelx').press('Tab');
   await page.observeGraphSignal(()=>document.querySelector('#ai-image-panel [data-ai-status]')?.textContent.includes('편집을 적용'), undefined, undefined, async () => { await page.locator('#gm-confirm').click(); });
   const saved=await waitVersions(page,3),vs=versions(saved);assert.deepEqual(vs[0],original);assert.equal(plane(vs[1].graphResult).labelX,'첫 번째 수정');assert.equal(plane(vs[2].graphResult).labelX,'두 번째 수정');assert.equal(vs[2].graphEdit.parentCandidateId,original.id);
   save('three-versions',saved);await page.reload({waitUntil:'networkidle'});await page.locator('#ai-image-install-open').click();
   await page.locator('#ai-image-panel [data-ai-version-button]').click();assert.equal(await page.locator('#ai-image-panel [data-ai-candidate-option]').count(),3);await shot('history-reloaded');
  });
  await step('Image workbench entrance uses shared overshoot and respects reduced motion',async()=>{
   const frames=await page.evaluate(()=>{for(const sheet of document.styleSheets){try{for(const rule of sheet.cssRules)if(rule.type===CSSRule.KEYFRAMES_RULE&&rule.name==='modal-pop')return [...rule.cssRules].map(r=>({offset:r.keyText,scale:r.style.scale}));}catch{}}});
   assert(frames.some(f=>Number(f.scale)>1)&&frames.some(f=>Number(f.scale)<1));save('motion',frames);
   await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('#ai-image-panel .ai-workbench').evaluate(n=>getComputedStyle(n).animationName),'none');
   assert.equal(await page.evaluate(()=>window.__traceReplay.requests.length),0,'Reload did not submit another request');
  });
 }else{
  await install(page);const original=await snapshot(page),bytes=await syntheticSource(page);
  await step('Comparison toolbar is compact; side comparison black, overlay red/blue',async()=>{
   await open(page);assert.equal(await page.locator('#gm-labelmove,#gm-tickmove,#gm-lockpos').count(),0);
   await page.getByLabel('트레이싱 원본 이미지 선택',{exact:true}).setInputFiles({name:'source.png',mimeType:'image/png',buffer:bytes});
   await page.waitForGraphSignal(()=>!document.querySelector('select[data-trace-view] option[value="side"]').disabled);
   assert.equal(await page.locator('select[data-trace-view]').inputValue(),'graph','Loading a reference must not enable an overlay by itself');
   assert((await page.locator('.gm-trace-main').boundingBox()).height<=40);
   await page.locator('select[data-trace-view]').selectOption('side');assert((await ink(page)).every(p=>!p.stroke.includes('22, 107, 255')&&!p.fill.includes('22, 107, 255')));
   assert.equal(await page.locator('.gm-trace-source-pane img').evaluate(n=>getComputedStyle(n).filter),'grayscale(1)');await shot('side-black');
   await page.locator('select[data-trace-view]').selectOption('overlay');assert((await ink(page)).some(p=>p.stroke==='rgb(22, 107, 255)'));await shot('overlay-colors');
  });
  await step('Center divider drags, responds to keyboard and survives preview redraw/apply/reopen',async()=>{
   await page.locator('select[data-trace-view]').selectOption('wipe');const bar=page.getByRole('slider',{name:'원본과 편집본 비교 경계'});assert.equal(await bar.getAttribute('aria-valuenow'),'50');
   await drag(page,bar,100,0);const dragged=Number(await bar.getAttribute('aria-valuenow'));assert(dragged>50);await bar.press('ArrowLeft');assert.equal(Number(await bar.getAttribute('aria-valuenow')),dragged-1);
   assert((await ink(page)).every(p=>!p.stroke.includes('22, 107, 255')));assert.equal(await page.locator('[data-trace-layer="clips"] clipPath').count(),2);
   await page.locator('#gm-tab-func-btn').click();await page.locator('#gm-expr').fill('3*x');await page.locator('#gm-expr').press('Tab');assert(await bar.isVisible());
   await shot('wipe-edited');await page.locator('#gm-confirm').click();const saved=await snapshot(page);assert.equal(plane(saved).graphTrace.mode,'wipe');assert(plane(saved).graphTrace.wipePosition>.5);
   const exported=await exportSvg(page);assert(!exported.includes('data-trace-')&&!exported.includes('<image'));await open(page);await bar.waitFor();assert.equal(Number(await bar.getAttribute('aria-valuenow')),dragged-1);await page.locator('#gm-cancel').click();assert.deepEqual(await snapshot(page),saved);save('wipe-model',saved);await open(page);await bar.waitFor();await bar.press('Home');await page.locator('#gm-confirm').click();assert.equal(plane(await snapshot(page)).graphTrace.wipePosition,0,'Divider-only edit must persist');await open(page);await bar.waitFor();await bar.press('End');await page.locator('#gm-cancel').click();assert.equal(plane(await snapshot(page)).graphTrace.wipePosition,0,'Cancel discards divider-only edit');
  });
  await step('Always-draggable axis/tick labels and mandatory grouping retain unrelated manual members',async()=>{
   await page.evaluate(()=>window.__qaState.update(s=>{const p=s.objects.find(o=>o.type==='coordplane');delete p.graphTrace;p.seriesLock=false;for(const o of s.objects)delete o.groupId;p.groupId='manual';p.tickLabelMode='text';p.explicitTicksX=[{value:1,label:'첫 눈금'},{value:2,label:'둘째 눈금'}];s.objects.push({id:'manual-other',type:'rect',x:-90,y:-90,w:2,h:2,groupId:'manual',stroke:'#000',strokeWidth:.3,fill:'none'});s.groups=[{id:'manual',memberIds:[p.id,'manual-other']}];}));
   await open(page);const label=page.locator('#gm-preview [data-axisname="x"]');assert.equal(await label.evaluate(n=>n.style.cursor),'move');await drag(page,label,-20,-30);
   const tick=page.locator('#gm-preview [data-tick]').first();assert.equal(await tick.evaluate(n=>n.style.cursor),'move');await drag(page,tick,15,20);
   await page.locator('#gm-confirm').click();const saved=await snapshot(page),p=plane(saved);assert(p.labelXPos);assert(p.tickOffX.some(o=>o&&Math.abs(o.dx)>0));assert.equal(p.seriesLock,true);assert.equal(saved.objects.find(o=>o.id==='manual-other').groupId,'manual');assert(saved.groups.find(g=>g.id==='manual').memberIds.includes('manual-other'));assert(saved.objects.filter(o=>o.id===p.id||o.planeId===p.id).every(o=>o.groupId===p.groupId));
   await open(page);await page.locator('#gm-tab-annot-btn').click();const styles=await page.locator('#gm-ann-legend-add,#gm-ann-marker').evaluateAll(ns=>ns.map(n=>{const c=getComputedStyle(n);return{height:c.height,background:c.backgroundColor,border:c.border,padding:c.padding,font:c.font};}));assert.deepEqual(styles[0],styles[1]);await shot('matching-tools');await page.locator('#gm-cancel').click();save('label-and-group',saved);
  });
  await step('Narrow and enlarged layouts retain Apply, tabs and divider without horizontal overflow',async()=>{
   for(const [width,height]of[[720,900],[980,720]]){await page.setViewportSize({width,height});await open(page);for(const tab of['coord','func','annot']){await page.locator(`#gm-tab-${tab}-btn`).click();const sizes=await page.locator('.gm-modal,.gm-tab-content,.gm-trace-toolbar').evaluateAll(ns=>ns.map(n=>({width:n.clientWidth,scroll:n.scrollWidth})));assert(sizes.every(n=>n.scroll<=n.width+1));}await shot(`layout-${width}`);await page.locator('#gm-cancel').click();}
  });
 }
 assert.deepEqual(env.errors,[]);row.verdict='PASS';
 }catch(e){row.error=e.stack;if(env){const f=path.join(out,row.id+'-failure.png');await env.page.screenshot({path:f,animations:'disabled'}).then(()=>row.artifacts.push(f)).catch(()=>{});}}
 finally{if(env)await env.context.close();fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));console.log(row.verdict,row.id,row.error?.split('\n')[0]||'');}
}
(async()=>{for(const [engine,type]of[['chromium',chromium],['webkit',webkit]]){if(process.env.GRAPH_TEST_ENGINES&&!process.env.GRAPH_TEST_ENGINES.split(',').includes(engine))continue;const browser=await type.launch({headless:true});try{for(const kind of['comparison','history'])await run(browser,engine,kind);}finally{await browser.close();}}report.pass=report.cases.length>0&&report.cases.every(c=>c.verdict==='PASS');report.completedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));if(!report.pass)process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1;});
