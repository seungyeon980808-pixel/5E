// Fixed graph source: b1846e849656076b1c0c5da2f82abffff3813eb1:tests/test-graph-editor-unified-browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium, webkit} = require('./helpers/graph-source-signals.cjs').loadPlaywright();
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:62759/';
const output = process.env.EVIDENCE_DIR || path.join(__dirname,'../.omo/evidence/graph-editor-unified');
fs.mkdirSync(output,{recursive:true});
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/graph-reconstruction/linear.json')));
(async()=>{
const reports=[];
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
const browser=await engine.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
await page.addInitScript(()=>{localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true');localStorage.setItem('5e.tutorial.bannerSeen','true');localStorage.setItem('5e.preview:5e.mode','pro');});
try{
await page.goto(base+'?mode=pro',{waitUntil:'networkidle'});
const skip=page.getByRole('button',{name:'건너뛰기',exact:true});if(await skip.isVisible())await skip.click();
await page.evaluate(async fixture=>{
const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');const {buildNativeGraph}=await import('/js/graph/native-graph.js?v=1.7.0-four-session-integration');
fixture.axes.x={...fixture.axes.x,min:0,max:6,step:2,title:'시간',ticks:[{value:1.1,label:'t_1'},{value:3.7,label:'2t_1'},{value:5.2,label:'t_2'}]};fixture.axes.y={...fixture.axes.y,min:0,max:20,step:5,title:'거리',ticks:[{value:4,label:'F'},{value:11,label:'2F'}]};fixture.series=[{id:'curve',kind:'points',axis:'y',certainty:'exact',coordinateSpace:'data',points:[{x:0,y:0},{x:2,y:4},{x:6,y:12}]}];fixture.annotations=[{id:'label-A',kind:'text',text:'A',x:2.3,y:5,orientation:'horizontal',axis:'y',seriesId:'curve'},{id:'leader-A',kind:'leader',text:'',x:2.3,y:4.8,to:{x:2,y:4},orientation:'horizontal',axis:'y',seriesId:'curve'},{id:'guide-A',kind:'guide',text:'',x:2,y:4,orientation:'horizontal',axis:'y',seriesId:'curve'}];
let n=0;const built=buildNativeGraph(fixture,{nextId:()=>n++===0?'unified-plane':`unified-${n}`});if(!built.ok)throw Error(built.error);
const {sampleFunctionPoints}=await import('/js/function-graph/sampler.js?v=1.7.0-four-session-integration');const {mathFromWorld}=await import('/js/function-graph/coords.js?v=1.7.0-four-session-integration');const plane=built.objects[0],fg=built.objects[1];plane.graphAnnotations.forEach(a=>a.anchorX=2);const sample=sampleFunctionPoints('2*x',0,6,plane);Object.assign(fg,{sourceKind:'expression',expr:'2*x',domainMin:0,domainMax:6,domainAuto:false,points:sample.points,mathPoints:sample.points.map(q=>mathFromWorld(plane,q.x,q.y)),breaks:sample.breaks,offset:{dx:0,dy:0}});
state.update(s=>{s.objects=[fg,plane];s.objects.forEach((o,i)=>o.order=i);s.groups=built.groups;s.selectedIds=[];s.undoStack=[];s.redoStack=[];});
},fixture);
const snap=()=>page.evaluate(async()=>structuredClone((await import('/js/state.js?v=1.7.0-four-session-integration')).state.get().objects));
const plane=objects=>objects.find(o=>o.type==='coordplane');
const open=()=>page.evaluate(async()=>{(await import('/js/graph/graph-modal.js?v=1.7.0-four-session-integration')).openGraphModal('unified-plane');await Promise.allSettled(document.querySelector('#graph-modal-overlay').getAnimations({subtree:true}).map(a=>a.finished));});
const change=async(id,value,event='change')=>{await page.locator(id).fill(String(value));await page.locator(id).dispatchEvent(event);};
const before=await snap();await open();
const layout=await page.evaluate(()=>{const g=document.querySelector('.gm-body'),l=g.querySelector('.gm-left'),r=g.getBoundingClientRect(),c=document.querySelector('#gm-cancel').getBoundingClientRect(),m=document.querySelector('.gm-modal').getBoundingClientRect(),e=document.querySelector('#gm-confirm').getBoundingClientRect();return{grid:r.width,gap:parseFloat(getComputedStyle(g).columnGap),left:l.getBoundingClientRect().width,close:{top:c.top,right:c.right},modal:{top:m.top,right:m.right},export:{top:e.top,height:e.height},previewBottom:document.querySelector('#gm-preview').getBoundingClientRect().bottom,wideFooter:document.querySelector('.gm-modal > .modal-actions')!==null};});
fs.writeFileSync(path.join(output,`${name}-r10-r12-layout.json`),JSON.stringify(layout,null,2));
assert.ok(Math.abs(layout.left-(layout.grid-460-layout.gap)*.8)<2,'preview uses 80% of its previous width');
assert.ok(layout.close.top-layout.modal.top<45 && layout.modal.right-layout.close.right<45,'close is at the top right');
assert.ok(layout.export.top<layout.previewBottom && layout.export.height<=36,'small export is above the preview');
assert.equal(layout.wideFooter,false);
assert.equal(await page.locator('.gm-modal .gm-preview-label').count(),0);
assert.equal(await page.locator('.gm-modal input[type="number"]').evaluateAll(nodes=>nodes.every(n=>n.closest('.gm-step'))),true,'all graph number fields share the stepper');
const exact=page.locator('#gm-exact-x-min');
await exact.locator('..').locator('[data-step="1"]').click();assert.equal(await exact.inputValue(),'0.1');
await exact.locator('..').locator('[data-step="-1"]').click();assert.equal(await exact.inputValue(),'0');
await page.locator('.gm-modal').screenshot({path:path.join(output,`${name}-r10-r12.png`)});
assert.equal(await page.locator('#gm-tab-coord #gm-graph-annotations').count(),0);
assert.equal(await page.locator('#gm-engine-controls #gm-engine-bounds').count(),0);
assert.equal(await page.locator('#gm-engine-controls #gm-engine-y2').count(),0);
assert.equal(await page.locator('#gm-exact-x-min').inputValue(),'0');
for(const label of ['없음','숫자','배수','직접'])assert.equal(await page.locator('#gm-tickmode').getByRole('button',{name:label,exact:true}).isEnabled(),true);
await page.locator('#gm-confirm').click();assert.deepEqual(await snap(),before,'No-op preserves all native fields');
await open();await change('#gm-ticktext-x','첫째, 둘째, 셋째','input');await page.locator('#gm-confirm').click();
let current=await snap();assert.deepEqual(plane(current).explicitTicksX.map(t=>t.value),[1.1,3.7,5.2]);assert.deepEqual(plane(current).explicitTicksX.map(t=>t.label),['첫째','둘째','셋째']);
await open();await page.locator('#gm-tick-position-details summary').click();await change('[aria-label="x 눈금 2 위치"]',3.8);await page.locator('#gm-confirm').click();assert.deepEqual(plane(await snap()).explicitTicksX.map(t=>t.value),[1.1,3.8,5.2]);
await open();await page.locator('#gm-tickmode').getByRole('button',{name:'숫자',exact:true}).click();await page.locator('#gm-confirm').click();current=await snap();assert.deepEqual(plane(current).explicitTicksX.map(t=>t.value),[2,4,6]);assert.deepEqual(plane(current).explicitTicksX.map(t=>t.label),['2','4','6']);
await open();await page.locator('#gm-tickmode').getByRole('button',{name:'배수',exact:true}).click();await change('#gm-tickbase-x','t_0','input');await page.locator('#gm-confirm').click();current=await snap();assert.deepEqual(plane(current).explicitTicksX.map(t=>t.label),['t_0','2t_0','3t_0']);
await open();await page.locator('#gm-adv-open').focus();await page.keyboard.press('Enter');await page.locator('#gm-y2-on').focus();await page.keyboard.press('Space');assert(await page.locator('#gm-y2-on').isChecked());await change('#gm-labely2','방향','input');await change('#gm-y2-ticktext','N, E, S, W','input');await page.locator('#gm-confirm').click();current=await snap();assert.equal(plane(current).y2.showTickY2,true);assert.deepEqual(plane(current).y2.explicitTicks.map(t=>t.value),[5,10,15,20]);assert.deepEqual(plane(current).y2.explicitTicks.map(t=>t.label),['N','E','S','W']);
await open();await change('#gm-exact-x-min',-4);await page.locator('#gm-confirm').click();current=await snap();assert.deepEqual(plane(current).explicitTicksX.map(t=>t.label),['-2t_0','-t_0','t_0','2t_0','3t_0']);await open();await change('#gm-exact-x-min',0);await page.locator('#gm-confirm').click();
await open();await page.locator('#gm-tab-annot-btn').click();assert.equal(await page.locator('#gm-typed-properties input[type="text"]').count(),1,'Guide and leader have meaningful type, not blank text rows');assert.equal(await page.locator('#gm-typed-properties details[open]').count(),0);await page.locator('[aria-label="표시 1 선택"]').click();await change('[aria-label="표시 1 글자"]','수정 A');await page.screenshot({path:path.join(output,`${name}-annotations.png`)});await page.locator('#gm-confirm').click();
assert.equal(plane(await snap()).graphAnnotations[0].text,'수정 A');
await open();await page.locator('#gm-tab-func-btn').click();await page.locator('#gm-chips [data-series-index="0"]').click();await change('#gm-expr','3*x','input');await change('#gm-dmax',5.9999);await change('#gm-rmin',0);await change('#gm-rmax',19.9999);await page.locator('#gm-confirm').click();current=await snap();assert.equal(current.find(o=>o.type==='funcgraph').expr,'3*x');assert.equal(current.find(o=>o.type==='funcgraph').sourceKind,'expression');assert.equal(current.find(o=>o.type==='funcgraph').domainMax,6);assert.equal(current.find(o=>o.type==='funcgraph').rangeMax,20);assert.equal(plane(current).graphAnnotations[1].to.y,6);assert.equal(plane(current).graphAnnotations[2].y,6);
const expressionSaved=await snap();await page.evaluate(async()=>{const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');const io=await import('/js/project-io.js?v=1.7.0-four-session-integration');const saved=io.serialize(state.get());io.applyLoaded(state,structuredClone(saved));});await open();await page.locator('#gm-confirm').click();for(const o of expressionSaved){const actual=(await snap()).find(a=>a.id===o.id);for(const key of Object.keys(o))assert.deepEqual(actual[key],o[key],`save ${key}`);}
await open();await page.locator('#gm-tab-annot-btn').click();const label=page.locator('#gm-preview [data-graph-annotation="label-A"]');await page.evaluate(()=>document.fonts.ready);await label.scrollIntoViewIfNeeded();const box=await label.boundingBox();const oldAnnotation=plane(await snap()).graphAnnotations[0];await label.dragTo(label,{targetPosition:{x:box.width/2+30,y:box.height/2+10}});await page.locator('#gm-confirm').click();current=await snap();const moved=plane(current).graphAnnotations[0];assert.notEqual(moved.x,oldAnnotation.x);assert.equal(moved.anchorX,undefined);assert.equal(moved.seriesId,undefined);assert.equal(moved.text,'수정 A');
for(const width of [1200,980,720]){await page.setViewportSize({width,height:1000});await open();await page.locator('#gm-tab-annot-btn').click();const overflow=await page.evaluate(()=>{const modal=document.querySelector('.gm-modal'),right=modal.querySelector('.gm-right');return {modal:modal.scrollWidth>modal.clientWidth+1,right:right.scrollWidth>right.clientWidth+1};});assert.deepEqual(overflow,{modal:false,right:false},`no horizontal overflow ${width}`);await page.screenshot({path:path.join(output,`${name}-${width}.png`)});await page.locator('#gm-cancel').click();}
assert.deepEqual(errors,[]);reports.push({browser:name,ok:true,providerCalls:0,scenarios:['compact preview ratio','top-right close and small export','consistent functional steppers','native no-op','enabled tick modes','irregular labels retain positions','explicit position editor','generated number/multiple signed ticks','new right axis labels','typed annotation edit','expression and linked guides','save/reopen','direct label drag','responsive layout']});
}catch(e){fs.writeFileSync(path.join(output,`${name}-failure.json`),JSON.stringify(await page.evaluate(()=>({advanced:document.querySelector('#gm-adv-panel').hidden,button:document.querySelector('#gm-adv-open').outerHTML,ancestors:[...function*(e){while(e){yield {tag:e.tagName,id:e.id,hidden:e.hidden,display:getComputedStyle(e).display};e=e.parentElement;}}(document.querySelector('#gm-y2-on'))]})),null,2));await page.screenshot({path:path.join(output,`${name}-failure.png`)});throw e;}finally{await browser.close();}}
fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
})().catch(e=>{console.error(e);process.exit(1);});
