// Fixed graph source: b1846e849656076b1c0c5da2f82abffff3813eb1:tests/test-graph-trace-browser.cjs
const {chromium,webkit}=require('./helpers/graph-source-signals.cjs').loadPlaywright();
const fs=require('node:fs');const path=require('node:path');
const base=(process.env.PREVIEW_URL||'http://127.0.0.1:62759/').replace(/\/$/,'');
const runningBrowsers=new Set();
const dir=path.resolve(process.env.EVIDENCE_DIR||'.omo/evidence/graph-trace-20261009');fs.mkdirSync(dir,{recursive:true});
(async()=>{const results=[];for(const [name,type]of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)){
 const browser=await type.launch({headless:true});runningBrowsers.add(browser);const page=await browser.newPage({viewport:{width:1100,height:800}});
 await page.route(base+'/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Trace controller harness</title>'}));
 await page.goto(base+'/');
 await page.setContent('<style>body{background:#172029;color:white;font:14px sans-serif}button,input{font:inherit}#preview{width:760px;height:500px;background:white}.gm-trace-source-pane img{max-width:250px}.gm-trace-source-pane[hidden]{display:none}</style><div id="toolbar"></div><main><div id="preview"><svg viewBox="-40 -30 80 60" width="760" height="500"><path d="M-25 15L25 -15" stroke="black" fill="none"/><circle cx="0" cy="0" r="2" fill="white" stroke="black"/><path id="inline" d="M-25 14L25 -14" style="stroke:var(--accent, orange);fill:none;stroke-width:.3"/><path id="inline-hit" d="M-25 15L25 -15" stroke="black" style="stroke:transparent!important;fill:transparent"/><path id="hit" d="M-25 15L25 -15" stroke="transparent" stroke-width="5"/></svg></div></main>');
 await page.evaluate(async base=>{
   // 앱 모듈은 진입 경로(/preview/)와 상관없이 늘 루트 /js/에 있다(preview/index.html도 /js/main.js를 씀). 저장소의 preview/js는 10-19 옛 사본.
   const {createTraceEditor}=await import(new URL(base).origin+'/js/graph/trace-overlay.js');
   const canvas=document.createElement('canvas');canvas.width=300;canvas.height=180;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,300,180);ctx.strokeStyle='black';ctx.beginPath();ctx.moveTo(0,180);ctx.lineTo(300,0);ctx.stroke();
   window.plane={x:-25,y:-15,w:50,h:30,xMin:0,xMax:1,yMin:0,yMax:1};window.events=[];
   window.trace=createTraceEditor({toolbarHost:document.querySelector('#toolbar'),previewHost:document.querySelector('#preview'),reference:{data:canvas.toDataURL(),width:300,height:180,plotBox:{x:0,y:0,w:300,h:180}},onChange:s=>events.push(s)});
   trace.attachAfterBBox(document.querySelector('svg'),plane);
 },base);
 await page.waitForFunction(()=>document.querySelector('[data-trace-import]')?.disabled===false);
 if(await page.locator('select[data-trace-view]').inputValue()!=='graph')throw Error('Default view must be graph only');
 await page.locator('[data-trace-zoom-toggle]').click();
 await page.locator('[data-trace-zoom]').fill('150');
 if(await page.evaluate(()=>trace.getState().previewZoom)!==150)throw Error('Zoom selection missing');
 await page.locator('[data-trace-zoom]').fill('100');
 await page.locator('[data-trace-zoom-toggle]').click();
 await page.locator('select[data-trace-view]').selectOption('overlay');
 await page.waitForSelector('[data-trace-layer="source"]');
 const initial=await page.evaluate(()=>({mode:trace.getState().mode,white:document.querySelector('circle').getAttribute('fill'),hit:document.querySelector('#hit').getAttribute('stroke'),graph:document.querySelector('[data-trace-graph] path').getAttribute('stroke'),inline:getComputedStyle(document.querySelector('#inline')).stroke,inlineHit:document.querySelector('#inline-hit').getAttribute('style')}));
 if(initial.mode!=='overlay'||initial.white!=='white'||initial.hit!=='transparent'||initial.graph!=='#166bff'||initial.inline!=='rgb(22, 107, 255)'||initial.inlineHit!=='stroke:transparent!important;fill:transparent')throw Error(JSON.stringify(initial));
 // Registration tools live in the collapsed comparison settings.
 await page.locator('.gm-trace-options summary').click();
 await page.locator('[data-trace-move]').click();const box=await page.locator('svg').boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+76,box.y+box.height/2+25);await page.mouse.up();
 const dragged=await page.evaluate(()=>trace.getState());if(Math.abs(dragged.graphMatrix[4])<1)throw Error('Graph registration did not move');
 await page.keyboard.press('Escape');
 const editRoundtrip=await page.evaluate(()=>{const m=trace.getGraphMatrix();const p={x:3.2345,y:-2.456};const displayed={x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]};return {p,q:trace.toGraphPoint(displayed)};});
 if(Math.abs(editRoundtrip.p.x-editRoundtrip.q.x)>1e-9)throw Error('Editing inverse failed');
 await page.locator('select[data-trace-view]').selectOption('side');if(!(await page.locator('.gm-trace-source-pane img').isVisible()))throw Error('Side source missing');
 await page.locator('select[data-trace-view]').selectOption('graph');
 const restored=await page.evaluate(()=>({stroke:document.querySelector('svg path').getAttribute('stroke'),source:!!document.querySelector('[data-trace-layer]'),inline:document.querySelector('#inline').getAttribute('style')}));
 if(restored.stroke!=='black'||restored.source||restored.inline!=='stroke:var(--accent, orange);fill:none;stroke-width:.3')throw Error('Graph-only paint not restored');
 await page.locator('select[data-trace-view]').selectOption('overlay');
 await page.locator('[data-trace-calibrate]').click();
 for(const point of [{x:-20,y:12},{x:20,y:12},{x:-20,y:-12}]){
  const screen=await page.evaluate(p=>{const svg=document.querySelector('svg'),q=svg.createSVGPoint();q.x=p.x;q.y=p.y;const out=q.matrixTransform(svg.getScreenCTM());return{x:out.x,y:out.y};},point);
  await page.mouse.click(screen.x,screen.y);
 }
 const calibrated=await page.evaluate(()=>trace.getState());
 if(Math.abs(calibrated.graphMatrix[0]-.8)>.015||Math.abs(calibrated.graphMatrix[3]-.8)>.015)throw Error('Three-point registration failed '+JSON.stringify(calibrated));
 await page.evaluate(async()=>{const saved=trace.getState();trace.destroy();const {createTraceEditor}=await import('/js/graph/trace-overlay.js?v=1.7.0-four-session-integration');window.trace=createTraceEditor({toolbarHost:document.querySelector('#toolbar'),previewHost:document.querySelector('#preview'),initialState:saved});trace.attachAfterBBox(document.querySelector('svg'),plane);});
 await page.observeGraphSignal(()=>Math.abs(trace.getState().graphMatrix[0]-.8)<.015, undefined, undefined, async () => {await page.waitForSelector('[data-trace-layer="source"]');});
 await page.screenshot({path:path.join(dir,name+'-overlay.png')});
 await page.locator('.gm-trace-options summary').click();
 await page.locator('[data-trace-reset]').click();
 const reset=await page.evaluate(()=>trace.getState().graphMatrix);if(JSON.stringify(reset)!=='[1,0,0,1,0,0]')throw Error('reset failed');
 await page.evaluate(()=>trace.destroy());if(await page.locator('[data-trace-editor]').count())throw Error('destroy leaked toolbar');
 await page.observeGraphSignal(()=>document.querySelector('.gm-trace-status')?.textContent.includes('읽을 수 없습니다'), undefined, undefined, async () => { await page.evaluate(async()=>{const {createTraceEditor}=await import('/js/graph/trace-overlay.js?v=1.7.0-four-session-integration');window.failedChanges=0;window.failed=createTraceEditor({toolbarHost:document.querySelector('#toolbar'),previewHost:document.querySelector('#preview'),reference:{data:'data:image/png;base64,bm90YW5pbWFnZQ=='},onChange:()=>failedChanges++});failed.attachAfterBBox(document.querySelector('svg'),plane);}); });
 const failedChanges=await page.evaluate(()=>{failed.destroy();return window.failedChanges;});if(failedChanges!==0)throw Error('Failed decode committed registration');
 results.push({browser:name,pass:true,failedChanges,initial,draggedMatrix:dragged.graphMatrix,calibratedMatrix:calibrated.graphMatrix,editRoundtrip,restored,reset,screenshot:name+'-overlay.png'});await browser.close();runningBrowsers.delete(browser);}
 fs.writeFileSync(path.join(dir,'browser-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));})().catch(async error=>{console.error(error);process.exitCode=1;await Promise.allSettled([...runningBrowsers].map(browser=>browser.close()));});
