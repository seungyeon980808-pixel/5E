// Fixed graph source: b1846e849656076b1c0c5da2f82abffff3813eb1:tests/test-graph-reconstruction-browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('./helpers/graph-source-signals.cjs').loadPlaywright();
const previewUrl = new URL(process.env.PREVIEW_URL || 'http://127.0.0.1:62759/');
previewUrl.searchParams.set('mode','pro');
const base = previewUrl.href;
const evidence = process.env.EVIDENCE_DIR || path.join(__dirname,'../.omo/evidence/graph-reconstruction-20261004/browser');
const actualImage = path.join(__dirname,'../assets/exam-library/images/c2_2024_09_03.png');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/graph-reconstruction/linear.json'),'utf8'));
const snapshot = page => page.evaluate(async()=>structuredClone((await import('/js/state.js?v=1.7.0-four-session-integration')).state.get()));
const reports=[];
let browser;
async function setup() {
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',locale:'ko-KR',acceptDownloads:true});
 await context.addInitScript(({fixture})=>{
   localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true'); localStorage.setItem('5e.tutorial.bannerSeen','true');
   window.showSaveFilePicker=undefined; window.showDirectoryPicker=undefined;
   const listeners=[]; const mock=window.__graphMock={mode:'success',requests:[],interrupts:[],pending:[],total:Number(sessionStorage.getItem('graph-test-calls')||0)};
   const emit=(request,event)=>listeners.forEach(fn=>fn({...event,clientScope:request.clientScope}));
   mock.release=(index=mock.pending.length-1)=>{
     const {request,turnId,plan,mode}=mock.pending[index];
     if(mode==='image') emit(request,{method:'item/started',params:{turnId,item:{type:'imageGeneration'}}});
     else {emit(request,{method:'item/completed',params:{turnId,item:{type:'agentMessage',text:JSON.stringify(plan)}}});emit(request,{method:'turn/completed',params:{turn:{id:turnId,status:'completed'}}});}
   };
   window.fiveEDesktop={
     models:async()=>({data:[{id:'gpt-6.1-sol',model:'gpt-6.1-sol',displayName:'Synthetic test provider',supportedReasoningEfforts:['medium'],defaultReasoningEffort:'medium',serviceTiers:[],isDefault:true}]}),
     status:async()=>({state:'ready'}),account:async()=>({}),start:async()=>({}),
     onEvent:fn=>{listeners.push(fn);return()=>{};},onState:()=>()=>{},onLog:()=>()=>{},
     interrupt:async r=>{mock.interrupts.push(r);window.__graphSourceSignals.notify();return {acknowledged:true};},
     send:async request=>{
       mock.requests.push(request); mock.total++;sessionStorage.setItem('graph-test-calls',String(mock.total));
       // Held requests have no completion/DOM event; signal the observed mock
       // transition while retaining the exact request-count cancellation oracle.
       window.__graphSourceSignals.notify();
       if(request.model!=='gpt-6.1-sol'||request.effort!=='medium'||request.purpose!=='scene'||request.ephemeralRender!==true)throw Error('Standalone graph extraction must use fixed Sol 6.1 / medium JSON-scene requests');
       const match=request.text.match(/바인딩을 정확히 복사하고[^\n]*: (\{[^\n]+\})/);
       if(!match) throw Error('Missing bound source in prompt');
       const source=JSON.parse(match[1]);const plan=structuredClone(fixture);plan.source=source;
       plan.axes.x.title='시간';plan.axes.x.unit='s';plan.axes.y.title='농도';plan.axes.y.unit='%';plan.axes.x.ticks=[{value:1,label:'t₁'},{value:3,label:'t₂'}];
       if(mock.mode==='unknown'){plan.axes.y={...plan.axes.y,scale:'unknown',min:null,max:null,step:null};plan.series[0]={...plan.series[0],certainty:'observed',coordinateSpace:'normalized',points:[{x:0,y:0},{x:1,y:1}]};}
       if(mock.mode==='compare'||mock.mode==='compare-final-invalid')plan.axes.x.title='검수 단계 '+mock.total;
       if(mock.mode==='compare-final-invalid'&&mock.total===3)plan.axes.x.step=-1;
       if(mock.mode==='invalid-step') plan.axes.x.step=-1;
       if(mock.mode==='bad-ticks-object') plan.axes.x.ticks={bad:true};
       if(mock.mode==='bad-ticks-null') plan.axes.x.ticks=[null];
       if(mock.mode==='observed') {plan.coordinateMode='observed';plan.axes.x.ticks=[{value:null,label:'t₁',position:0.25,displayMath:'t_1'},{value:null,label:'t₂',position:0.75,displayMath:'t_2'}];plan.series[0]={...plan.series[0],certainty:'observed',coordinateSpace:'normalized',points:[{x:0,y:0},{x:1,y:1}]};}
       if(mock.mode==='aspect-wide'||mock.mode==='aspect-tall') {
         const span=Math.min(source.width,source.height)*0.8;
         plan.source.plotBox={x:10,y:10,w:mock.mode==='aspect-wide'?span:span/6,h:mock.mode==='aspect-wide'?span/6:span};
         plan.axes.x.title='시간에 따른 물리량 변화';plan.axes.y.title='측정한 물리량';
       }
       const turnId='mock-turn-'+mock.total;mock.pending.push({request,turnId,plan,mode:mock.mode});
       if(mock.mode!=='hold')queueMicrotask(()=>mock.release(mock.pending.length-1));
       return{turnId,threadId:'mock-thread-'+mock.total};
     }
   };
 },{fixture});
 const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(base,{waitUntil:'networkidle'});
 const skip=page.getByRole('button',{name:'건너뛰기',exact:true});if(await skip.isVisible().catch(()=>false))await skip.click();
 await page.evaluate(async () => { document.getElementById('ai-image-install-open').focus(); await (await import('/js/graph/reconstruction-modal.js?v=1.7.0-four-session-integration')).openGraphReconstructionModal(); });
 await page.locator('#gr-model option').waitFor({state:'attached'});
 return{context,page,errors};
}
async function upload(page){await page.observeGraphSignal(()=>!document.querySelector('#gr-analyze').disabled, undefined, undefined, async () => { await page.locator('#gr-file').setInputFiles(actualImage); });}
async function analyze(page){await page.observeGraphSignal(()=>document.querySelector('#gr-cancel').hidden, undefined, undefined, async () => { await page.locator('#gr-analyze').click(); });}
async function record(name,page,details={}){const screenshot=path.join(evidence,name+'.png');await page.screenshot({path:screenshot,fullPage:true,animations:'disabled'});reports.push({scenario:name,pass:true,screenshot,mockProvider:true,...details});}
(async()=>{
 fs.mkdirSync(evidence,{recursive:true});browser=await chromium.launch({headless:true});
 // 1: actual image bytes enter via file input; only the response is synthetic.
 {
  const {context,page,errors}=await setup();await upload(page);await analyze(page);
  assert.equal(await page.locator('#gr-preview svg').count(),1);assert.equal(await page.locator('#gr-preview image').count(),0);
  assert.match(await page.locator('#gr-preview').textContent(),/시간/);assert.match(await page.locator('#gr-preview').textContent(),/t/);
  await page.locator('#gr-edit').focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'gr-file');
  await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'gr-edit');
  const bounds=await page.locator('[aria-labelledby="gr-title"]').evaluate(async n=>{await Promise.all(n.getAnimations().map(a=>a.finished.catch(()=>{})));const r=n.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight,bg:getComputedStyle(n).backgroundColor};});
  assert(bounds.x>=-1&&bounds.y>=-1&&bounds.right<=bounds.width+1&&bounds.bottom<=bounds.height+1,JSON.stringify(bounds));assert(!['transparent','rgba(0, 0, 0, 0)'].includes(bounds.bg));
  const title=page.getByRole('textbox',{name:'x축 제목',exact:true});await title.fill('경과 시간');await title.dispatchEvent('change');
  assert.match(await page.locator('#gr-preview').textContent(),/경과 시간/);
  const ticks=page.getByRole('textbox',{name:'x축 눈금',exact:true});const previousPreview=await page.locator('#gr-preview').innerHTML();
  await ticks.fill('bad missing separator');await ticks.dispatchEvent('change');assert.equal(await ticks.evaluate(n=>n.checkValidity()),false);assert(await page.locator('#gr-insert').isDisabled());assert(await page.locator('#gr-edit').isDisabled());assert.equal(await page.locator('#gr-preview').innerHTML(),previousPreview);assert.match(await page.locator('#gr-status').textContent(),/형식/);
  await ticks.fill('1 : t₁\n3 : t₂');await ticks.dispatchEvent('change');assert.equal(await ticks.evaluate(n=>n.checkValidity()),true);
  await page.locator('#gr-insert').click();const inserted=await snapshot(page);assert(inserted.objects.some(o=>o.type==='coordplane'));assert(inserted.objects.some(o=>o.type==='funcgraph'));assert(!inserted.objects.some(o=>o.type==='image'));
  await page.locator('#undo-btn').click();assert(!(await snapshot(page)).objects.some(o=>o.type==='coordplane'));
  await page.locator('#redo-btn').click();const restored=await snapshot(page);assert.deepEqual(restored.objects,inserted.objects);
  await page.locator('#file-menu-btn').click();await page.locator('#project-save').click();const download=page.waitForEvent('download');
  const explicit=page.locator('#project-save-download');if(await explicit.isVisible().catch(()=>false))await explicit.click();else await page.getByRole('button',{name:'저장',exact:true}).click();
  const saved=path.join(evidence,'native-reconstruction.5e');await(await download).saveAs(saved);assert(fs.statSync(saved).size>0);
  await page.reload({waitUntil:'networkidle'});await page.locator('#file-menu-btn').click();const chooser=page.waitForEvent('filechooser');await page.locator('#project-open').click();await(await chooser).setFiles(saved);await page.observeGraphSignal(async()=> (await import('/js/state.js?v=1.7.0-four-session-integration')).state.get().objects.some(o=>o.type==='funcgraph'), undefined, undefined, async () => { await page.getByRole('button',{name:'열기',exact:true}).click(); });
  const reopened=await snapshot(page);assert.deepEqual(reopened.objects.find(o=>o.type==='funcgraph').mathPoints,inserted.objects.find(o=>o.type==='funcgraph').mathPoints);
  assert.equal(reopened.objects.find(o=>o.type==='coordplane').labelX,inserted.objects.find(o=>o.type==='coordplane').labelX);
  assert.equal(errors.length,0,errors.join('\n'));await record('native-insert-undo-redo-save-reopen',page,{saved});await context.close();
 }
 // 2: repeat analysis uses validated cache; reload recovers without another send.
 {
  const {context,page,errors}=await setup();await upload(page);await analyze(page);await analyze(page);assert.equal(await page.evaluate(()=>__graphMock.total),1);assert.match(await page.locator('#gr-status').textContent(),/기존/);
  await page.observeGraphSignal(()=>document.querySelector('#gr-cancel').hidden, undefined, undefined, async () => { await page.locator('#gr-reanalyze').click(); });assert.equal(await page.evaluate(()=>__graphMock.total),2);
  const reviewedTitle=page.getByRole('textbox',{name:'x축 제목',exact:true});await reviewedTitle.fill('검수한 시간');await reviewedTitle.dispatchEvent('change');
  await page.getByRole('combobox',{name:'y축 제목 방향',exact:true}).selectOption('rotate');assert.equal(await page.locator('#gr-preview [transform^="rotate(-90"]').count(),1);
  await page.waitForGraphSignal(async()=>{const {IndexedDBOutputCacheBackend}=await import('/js/ai-output-cache-store.js?v=1.7.0-four-session-integration');const store=new IndexedDBOutputCacheBackend({databaseName:'5e-graph-reconstruction',storeName:'jobs'});const axes=(await store.get('draft'))?.snapshot?.plan?.axes;return axes?.x?.title==='검수한 시간'&&axes?.y?.orientation==='rotate';});
  await page.reload({waitUntil:'networkidle'});await page.evaluate(async () => { document.getElementById('ai-image-install-open').focus(); await (await import('/js/graph/reconstruction-modal.js?v=1.7.0-four-session-integration')).openGraphReconstructionModal(); });await page.locator('#gr-preview svg').waitFor();assert.equal(await page.getByRole('textbox',{name:'x축 제목',exact:true}).inputValue(),'검수한 시간');assert.equal(await page.getByRole('combobox',{name:'y축 제목 방향',exact:true}).inputValue(),'rotate');assert.equal(await page.locator('#gr-preview [transform^="rotate(-90"]').count(),1);assert.equal(await page.evaluate(()=>__graphMock.total),2);assert.equal(errors.length,0,errors.join('\n'));await record('cache-and-recovery-no-auto-call',page);await context.close();
 }
 // 3: unknown axes remain review-blocked and no native objects are inserted.
 {
  const {context,page,errors}=await setup();await page.evaluate(()=>__graphMock.mode='unknown');await upload(page);await analyze(page);assert(await page.locator('#gr-insert').isDisabled());assert.match(await page.locator('#gr-review').textContent(),/축 수치/);assert(!(await snapshot(page)).objects.some(o=>o.type==='funcgraph'));assert.equal(errors.length,0,errors.join('\n'));await record('unknown-axis-review-blocks-insertion',page);await context.close();
 }
 // 4: cancellation interrupts only the scoped request; late completion does not install a plan.
 {
  const {context,page,errors}=await setup();await page.evaluate(()=>__graphMock.mode='hold');await upload(page);await page.observeGraphSignal(()=>__graphMock.requests.length===1, undefined, undefined, async () => { await page.locator('#gr-analyze').click(); });await page.observeGraphSignal(()=>__graphMock.interrupts.length===1, undefined, undefined, async () => { await page.locator('#gr-cancel').click(); });
  const request=await page.evaluate(()=>({r:__graphMock.requests[0],i:__graphMock.interrupts[0]}));assert.equal(request.i.clientScope,request.r.clientScope);assert(request.i.turnId);
  await page.evaluate(()=>__graphMock.release());assert(await page.locator('#gr-insert').isDisabled());assert.equal(await page.locator('#gr-preview svg').count(),0);
  await page.keyboard.press('Escape');assert(await page.locator('#graph-reconstruction-overlay').isHidden());assert.equal(await page.evaluate(()=>document.activeElement.id),'ai-image-install-open');assert.equal(errors.length,0,errors.join('\n'));await record('cancel-late-events-escape-focus',page);await context.close();
 }
 // 5: image-generation events are forbidden in text-only graph extraction.
 {
  const {context,page,errors}=await setup();await page.evaluate(()=>__graphMock.mode='image');await upload(page);await analyze(page);assert.match(await page.locator('#gr-status').textContent(),/이미지 생성/);assert(await page.locator('#gr-insert').isDisabled());assert.equal(await page.evaluate(()=>__graphMock.requests[0].purpose),'scene');assert.equal(await page.evaluate(()=>__graphMock.requests[0].ephemeralRender),true);assert.equal(await page.evaluate(()=>__graphMock.interrupts.length),1);assert.equal(errors.length,0,errors.join('\n'));await record('image-generation-event-rejected',page);await context.close();
 }
 // 6: selected source image remains byte-for-byte and geometrically unchanged.
 {
  const {context,page,errors}=await setup();await page.locator('#gr-close').click();const data='data:image/png;base64,'+fs.readFileSync(actualImage).toString('base64');
  await page.evaluate(async src=>{const{state}=await import('/js/state.js?v=1.7.0-four-session-integration');state.update(s=>{s.objects.push({id:'source-image',type:'image',src,x:5,y:5,w:50,h:43,order:s.objects.length,layerId:s.activeLayerId});s.selectedIds=['source-image'];});},data);
  const original=(await snapshot(page)).objects.find(o=>o.id==='source-image');await page.evaluate(async () => { document.getElementById('ai-image-install-open').focus(); await (await import('/js/graph/reconstruction-modal.js?v=1.7.0-four-session-integration')).openGraphReconstructionModal(); });await page.observeGraphSignal(()=>!document.querySelector('#gr-analyze').disabled, undefined, undefined, async () => { await page.locator('#gr-selected').click(); });await analyze(page);await page.locator('#gr-insert').click();assert.deepEqual((await snapshot(page)).objects.find(o=>o.id==='source-image'),original);assert.equal(errors.length,0,errors.join('\n'));await record('selected-source-preserved',page);await context.close();
 }
 // Invalid model draft remains recoverable, editable, and cannot be inserted until valid.
 {
  const {context,page,errors}=await setup();await page.evaluate(()=>__graphMock.mode='invalid-step');await upload(page);await analyze(page);
  assert(await page.locator('#gr-insert').isDisabled());assert.equal(await page.getByRole('spinbutton',{name:'x축 눈금 간격',exact:true}).inputValue(),'-1');
  await page.reload({waitUntil:'networkidle'});await page.evaluate(async () => { document.getElementById('ai-image-install-open').focus(); await (await import('/js/graph/reconstruction-modal.js?v=1.7.0-four-session-integration')).openGraphReconstructionModal(); });
  const step=page.getByRole('spinbutton',{name:'x축 눈금 간격',exact:true});await step.waitFor();assert.equal(await step.inputValue(),'-1');assert(await page.locator('#gr-insert').isDisabled());
  await step.fill('1');await page.observeGraphSignal(()=>!document.querySelector('#gr-insert').disabled, undefined, undefined, async () => { await step.dispatchEvent('change'); });
  await page.waitForGraphSignal(async()=>{const{IndexedDBOutputCacheBackend}=await import('/js/ai-output-cache-store.js?v=1.7.0-four-session-integration');const d=(await new IndexedDBOutputCacheBackend({databaseName:'5e-graph-reconstruction',storeName:'jobs'}).get('draft'))?.snapshot;return d?.status==='complete'&&!d.unvalidatedPlan&&d.plan.axes.x.step===1;});
  await page.locator('#gr-insert').click();assert((await snapshot(page)).objects.some(o=>o.type==='funcgraph'));assert.equal(await page.evaluate(()=>__graphMock.total),1);assert.equal(errors.length,0,errors.join('\n'));await record('invalid-draft-recover-correct-insert',page);await context.close();
 }
 for(const mode of ['bad-ticks-object','bad-ticks-null']) {
  const {context,page,errors}=await setup();await page.evaluate(mode=>__graphMock.mode=mode,mode);await upload(page);await analyze(page);
  assert(await page.locator('#gr-insert').isDisabled());assert.match(await page.locator('#gr-axes').textContent(),/눈금 데이터 형식/);
  await page.reload({waitUntil:'networkidle'});await page.evaluate(async () => { document.getElementById('ai-image-install-open').focus(); await (await import('/js/graph/reconstruction-modal.js?v=1.7.0-four-session-integration')).openGraphReconstructionModal(); });const ticks=page.getByRole('textbox',{name:'x축 눈금',exact:true});await ticks.waitFor();assert(await page.locator('#gr-insert').isDisabled());
  await ticks.fill('1 : t₁\n3 : t₂');await page.observeGraphSignal(()=>!document.querySelector('#gr-insert').disabled, undefined, undefined, async () => { await ticks.dispatchEvent('change'); });assert.equal(errors.length,0,errors.join('\n'));await record(mode+'-no-crash-repair',page);await context.close();
 }
 {
  const {context,page,errors}=await setup();await page.evaluate(()=>__graphMock.mode='observed');await upload(page);await analyze(page);
  const ticks=page.getByRole('textbox',{name:'x축 눈금',exact:true});assert.match(await ticks.inputValue(),/0.25/);await ticks.fill('null : 시작점 | 0.25 | t_1\nnull : t₂ | 0.75 | t_2');await ticks.dispatchEvent('change');assert(!(await page.locator('#gr-insert').isDisabled()));
  await page.waitForGraphSignal(async()=>{const{IndexedDBOutputCacheBackend}=await import('/js/ai-output-cache-store.js?v=1.7.0-four-session-integration');const p=(await new IndexedDBOutputCacheBackend({databaseName:'5e-graph-reconstruction',storeName:'jobs'}).get('draft'))?.snapshot?.plan;return p?.axes?.x?.ticks?.[0]?.label==='시작점'&&p.axes.x.ticks[0].position===0.25&&p.axes.x.ticks[0].displayMath==='t_1';});
  await page.locator('#gr-insert').click();assert((await snapshot(page)).objects.some(o=>o.type==='funcgraph'));assert.equal(errors.length,0,errors.join('\n'));await record('observed-tick-edit-preserves-position-math',page);await context.close();
 }
 // Source plot aspect must survive both the actual preview and native insertion.
 // Ratios6 and1/6 exercise the former min/max-height clamping distortions.
 for(const mode of ['aspect-wide','aspect-tall']) {
  const {context,page,errors}=await setup();await page.evaluate(mode=>__graphMock.mode=mode,mode);await upload(page);await analyze(page);await page.evaluate(()=>document.fonts.ready);
  assert(!(await page.locator('#gr-insert').isDisabled()));
  const geometry=await page.locator('#gr-preview svg').evaluate(svg=>{
    const frame=svg.querySelector('g[data-id] > rect[fill="transparent"]');
    if(!frame)throw Error('Preview coordinate-plane frame missing');
    const rect=frame.getBoundingClientRect(),box=svg.getBBox(),view=svg.viewBox.baseVal;
    const bbox={x:box.x,y:box.y,width:box.width,height:box.height};const viewBox={x:view.x,y:view.y,width:view.width,height:view.height};
    return{frameWidth:Number(frame.getAttribute('width')),frameHeight:Number(frame.getAttribute('height')),pixelWidth:rect.width,pixelHeight:rect.height,bbox,viewBox,contentFits:box.x>=view.x&&box.y>=view.y&&box.x+box.width<=view.x+view.width&&box.y+box.height<=view.y+view.height};
  });
  const sourcePlot=await page.evaluate(()=>__graphMock.pending.at(-1).plan.source.plotBox);const expected=sourcePlot.w/sourcePlot.h;
  const measured={sourceRatio:expected,previewRatio:geometry.frameWidth/geometry.frameHeight,previewPixelRatio:geometry.pixelWidth/geometry.pixelHeight};
  assert(Math.abs(measured.previewRatio-expected)<1e-10,JSON.stringify({mode,...measured}));assert(Math.abs(measured.previewPixelRatio-expected)<1e-4,JSON.stringify({mode,...measured}));assert(geometry.contentFits,JSON.stringify({mode,geometry}));
  const previewScreenshot=path.join(evidence,mode+'-preview.png');await page.locator('#gr-preview').screenshot({path:previewScreenshot,animations:'disabled'});
  await page.locator('#gr-insert').click();const plane=(await snapshot(page)).objects.find(o=>o.type==='coordplane');assert(plane);measured.insertedRatio=plane.w/plane.h;
  assert(Math.abs(measured.insertedRatio-expected)<1e-10,JSON.stringify({mode,...measured}));assert(Math.abs(plane.w-50)<1e-9,'Approved default graph width is 50 mm');assert.equal(errors.length,0,errors.join('\n'));
  await record(mode+'-preview-insert-ratio-no-clipping',page,{sourcePlot,measured,preview:geometry,insertedBox:{x:plane.x,y:plane.y,w:plane.w,h:plane.h},previewScreenshot});await context.close();
 }
 // Three calls use actual rendered PNGs, and the user can inspect first/final candidates.
 {
  const {context,page,errors}=await setup();await page.evaluate(()=>__graphMock.mode='compare');await upload(page);await page.locator('#gr-compare').check();await analyze(page);
  assert.equal(await page.evaluate(()=>__graphMock.total),3);assert.equal(await page.locator('#gr-history button').count(),3);assert.match(await page.locator('#gr-preview').textContent(),/검수 단계 3/);
  const renders=await page.evaluate(()=>__graphMock.requests.slice(1).map(r=>({purpose:r.purpose,ephemeralRender:r.ephemeralRender,attachments:r.attachments})));const pngFiles=[];
  for(const [i,r]of renders.entries()){assert.equal(r.purpose,'scene');assert.equal(r.ephemeralRender,true);assert.equal(r.attachments.length,2);const data=r.attachments[1].data;assert.match(data,/^data:image\/png;base64,/);assert(data.length>1000);const pngPath=path.join(evidence,`comparison-render-${i+1}.png`);fs.writeFileSync(pngPath,Buffer.from(data.split(',')[1],'base64'));pngFiles.push(pngPath);}
  const pixels=await page.evaluate(async data=>{const img=new Image();img.src=data;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);const a=g.getImageData(0,0,c.width,c.height).data;let dark=0;for(let i=0;i<a.length;i+=4)if(a[i]<180&&a[i+1]<180&&a[i+2]<180)dark++;return{width:c.width,height:c.height,dark};},renders[0].attachments[1].data);assert(pixels.dark>50);assert(pixels.width<=1200&&pixels.height<=1200);
  await page.locator('#gr-history button').first().click();assert.match(await page.locator('#gr-preview').textContent(),/검수 단계 1/);await page.locator('#gr-history button').last().click();assert.match(await page.locator('#gr-preview').textContent(),/검수 단계 3/);
  await analyze(page);assert.equal(await page.evaluate(()=>__graphMock.total),3);assert.equal(await page.locator('#gr-history button').count(),3);assert.equal(errors.length,0,errors.join('\n'));await record('bounded-three-attempts-actual-png-history-cache',page,{pngFiles,pixels});await context.close();
 }
 {
  const {context,page,errors}=await setup();await page.evaluate(()=>__graphMock.mode='compare-final-invalid');await upload(page);await page.locator('#gr-compare').check();await analyze(page);
  assert.equal(await page.evaluate(()=>__graphMock.total),3);assert.equal(await page.locator('#gr-history button').count(),3);assert.match(await page.locator('#gr-preview').textContent(),/검수 단계 2/);assert.match(await page.locator('#gr-history button').last().textContent(),/검증 오류/);assert.equal(errors.length,0,errors.join('\n'));assert(await page.locator('#gr-insert').isDisabled());
  await page.reload({waitUntil:'networkidle'});await page.evaluate(async () => { document.getElementById('ai-image-install-open').focus(); await (await import('/js/graph/reconstruction-modal.js?v=1.7.0-four-session-integration')).openGraphReconstructionModal(); });await page.locator('#gr-preview svg').waitFor();assert(await page.locator('#gr-insert').isDisabled());assert.match(await page.locator('#gr-history').textContent(),/마지막 분석에 실패/);
  await page.locator('#gr-history button').nth(1).click();assert(await page.locator('#gr-insert').isEnabled());
  await record('failed-final-keeps-earlier-candidate',page);await context.close();
 }
 fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify({pass:true,syntheticProvider:true,actualSourceFile:actualImage,realAIAccuracyClaim:false,node:process.version,url:base,scenarios:reports},null,2)+'\n');console.log(JSON.stringify({pass:true,scenarios:reports.length,evidence}));
})().catch(error=>{fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(path.join(evidence,'failure.json'),JSON.stringify({error:error.stack,completed:reports},null,2)+'\n');console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();});
