// Fixed graph source: b1846e849656076b1c0c5da2f82abffff3813eb1:tests/test-graph-reconstruction-upright.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('./helpers/graph-source-signals.cjs').loadPlaywright();
const out=process.env.EVIDENCE_DIR;assert(out,'EVIDENCE_DIR required');fs.mkdirSync(out,{recursive:true});
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/graph-reconstruction/linear.json'),'utf8'));
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1500,height:1000}});await page.addInitScript(()=>{localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true');localStorage.setItem('5e.tutorial.bannerSeen','true');});const report={pass:false,syntheticFixture:true,realModelCalls:0,scenarios:[],errors:[]};page.on('pageerror',e=>report.errors.push(String(e)));
 try{
  await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:62759/',{waitUntil:'networkidle'});const skip=page.getByRole('button',{name:'건너뛰기',exact:true});if(await skip.isVisible())await skip.click();
  const initial=await page.evaluate(async plan=>{
   const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');const {insertNativeGraph}=await import('/js/graph/native-graph.js?v=1.7.0-four-session-integration');
   plan.axes.x.title='시간 t';plan.axes.x.ticks=[{value:1,label:'t_1'},{value:3,label:'\\frac{t_2}{2}'}];plan.axes.y.title='압력 P';plan.axes.y.unit='Pa';plan.series[0].endLabel='HB';
   plan.annotations=['P','Q','HA','HB','\\frac{P_0}{Q_1}','한글 (mV)'].map((text,i)=>({id:'label'+i,kind:'text',orientation:'horizontal',text,x:0.15+i*.12,y:i%2?.8:.6,coordinateSpace:'normalized'}));
   const result=insertNativeGraph(state,plan,{box:{x:0,y:0,w:70,h:52.5}});if(!result.ok)throw Error(result.error);
   window.__uprightPlane=result.planeId;return structuredClone(state.get().objects.filter(o=>o.id===result.planeId||o.planeId===result.planeId));
  },fixture);
  assert(initial.every(o=>o.reconstruction.labelStyle==='upright'));
  const probe=async(mode)=>page.evaluate(async mode=>{
   const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');const {renderCoordplane,renderFuncgraph}=await import('/js/render/coordplane.js?v=1.7.0-four-session-integration');
   const objects=structuredClone(state.get().objects.filter(o=>o.id===__uprightPlane||o.planeId===__uprightPlane));
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='upright-evidence';svg.setAttribute('viewBox','-20 -20 115 95');svg.setAttribute('width','1000');svg.setAttribute('height','800');svg.style.cssText='position:fixed;top:0;left:0;z-index:2147483647;background:white;pointer-events:none';
   for(const o of objects){if(mode==='legacy')delete o.reconstruction.labelStyle;if(mode==='ordinary')delete o.reconstruction;if(mode==='plain')o.richLabels=false;svg.append(o.type==='coordplane'?renderCoordplane(o):renderFuncgraph(o));}document.querySelector('#upright-evidence')?.remove();document.body.append(svg);
   await document.fonts.ready;const b=svg.getBBox();svg.setAttribute('viewBox',`${b.x-8} ${b.y-8} ${b.width+16} ${b.height+16}`);const texts=[...svg.querySelectorAll('text,tspan')].map(n=>({text:n.textContent,style:getComputedStyle(n).fontStyle,attribute:n.getAttribute('font-style')}));return{mode,texts,allNormal:texts.length>10&&texts.every(n=>n.style==='normal'),hasItalic:texts.some(n=>n.style==='italic'),fractionBars:svg.querySelectorAll('line').length};
  },mode);
  for(const mode of ['new','legacy','plain']){const result=await probe(mode);assert(result.allNormal,JSON.stringify(result));report.scenarios.push(result);await page.locator('#upright-evidence').screenshot({path:path.join(out,mode+'.png')});}
  const ordinary=await probe('ordinary');assert(ordinary.hasItalic);report.scenarios.push(ordinary);await page.evaluate(()=>document.querySelector('#upright-evidence').remove());
  await page.evaluate(async()=>{const {openGraphModal}=await import('/js/graph/graph-modal.js?v=1.7.0-four-session-integration');openGraphModal(__uprightPlane);});await page.locator('#gm-confirm').click();
  const saved=await page.evaluate(async()=>{const{state}=await import('/js/state.js?v=1.7.0-four-session-integration');const io=await import('/js/project-io.js?v=1.7.0-four-session-integration');const saved=structuredClone(io.serialize(state.get()));io.applyLoaded(state,saved);return saved;});fs.writeFileSync(path.join(out,'upright.5e'),JSON.stringify(saved,null,2));
  const reopened=await probe('new');assert(reopened.allNormal);report.scenarios.push({...reopened,mode:'editor-apply-serialize-reload'});await page.locator('#upright-evidence').screenshot({path:path.join(out,'reopened.png')});
  const after=await page.evaluate(async()=>structuredClone((await import('/js/state.js?v=1.7.0-four-session-integration')).state.get().objects.filter(o=>o.id===__uprightPlane||o.planeId===__uprightPlane)));
  for(const before of initial){const a=after.find(o=>o.id===before.id);assert(a);for(const k of ['x','y','w','h','axisLabelSize','tickLabelSize','originLabelSize','labelWeight','mathPoints','points','endLabelSize'])if(before[k]!==undefined)assert.deepEqual(a[k],before[k],k);assert.equal(a.reconstruction.labelStyle,'upright');}
  fs.writeFileSync(path.join(out,'objects.json'),JSON.stringify({initial,after},null,2));assert.deepEqual(report.errors,[]);report.pass=true;
 }catch(e){report.error=e.stack;await page.screenshot({path:path.join(out,'failure.png')});throw e;}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
