// Fixed graph source: b1846e849656076b1c0c5da2f82abffff3813eb1:tests/test-graph-editor-exam-browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('./helpers/graph-source-signals.cjs').loadPlaywright();
const out = process.env.EVIDENCE_DIR || path.resolve(__dirname,'../.omo/evidence/graph-refinement-20261004/editor');
(async()=>{
 fs.mkdirSync(out,{recursive:true}); const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1100}});const report={invocation:process.argv,previewURL:process.env.PREVIEW_URL||"http://127.0.0.1:62759/",artifacts:["editor.png","canvas.png","edited.5e","objects.json"],scenarios:[],errors:[]};page.on('pageerror',e=>report.errors.push(String(e)));
 const snap=()=>page.evaluate(async()=>structuredClone((await import('/js/state.js?v=1.7.0-four-session-integration')).state.get().objects));
 const open=()=>page.evaluate(async()=>(await import('/js/graph/graph-modal.js?v=1.7.0-four-session-integration')).openGraphModal('exam-plane'));
 try {
 await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:62759/',{waitUntil:'networkidle'});const skip=page.getByRole('button',{name:'건너뛰기',exact:true});if(await skip.isVisible())await skip.click();
 await page.observeGraphSignal(()=>!!document.querySelector('#scene [data-id="exam-curve"]'), undefined, undefined, async () => { await page.evaluate(async()=>{
  const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');const {makeDefaultCoordplane}=await import('/js/function-graph/defaults.js?v=1.7.0-four-session-integration');const {worldFromMath}=await import('/js/function-graph/coords.js?v=1.7.0-four-session-integration');
  const p={...makeDefaultCoordplane({x:0,y:0}),id:'exam-plane',type:'coordplane',x:-30,y:-22,w:60,h:44,xMin:0,xMax:1,yMin:0,yMax:1,gridStepX:.25,gridStepY:.25,tickStepX:.25,tickStepY:.25,richLabels:true,showGrid:false,reconstruction:{preserveAxes:true},coordinateMode:'observed',axisPlacement:{x:{mode:'fraction',value:0},y:{mode:'fraction',value:0}},labelWeight:400,axisLabelSize:3,tickLabelSize:2.6,originLabelSize:2.6,explicitTicksX:[],explicitTicksY:[],layerId:1,seriesLock:true,groupId:'grp_exam-plane'};
  const mathPoints=[{x:.15,y:.2},{x:.5,y:.8},{x:.85,y:.2}];const f={id:'exam-curve',type:'funcgraph',planeId:p.id,sourceKind:'points',mathPoints,points:mathPoints.map(q=>worldFromMath(p,q.x,q.y)),endLabel:'A',labelWeight:500,closed:true,segmentModes:['line','line'],curveStyle:'straight',strokeWidth:.25,dashLength:1.25,dashGap:.65,strokeLevel:0,arrowSpecs:[{segmentIndex:0,t:.5,dir:1,strokeWidth:.25}],arrowMarks:[{x:-10.5,y:0,dx:21,dy:-26.4,strokeWidth:.25}],layerId:1,groupId:p.groupId};
  state.update(s=>{s.objects=[p,f];s.groups=[{id:p.groupId,memberIds:[f.id,p.id]}];s.selection=[];s.undoStack=[];s.redoStack=[];s.activeTool='V';s.activeLayerId=1;});
 }); });
 // Real pointer gesture on a curve segment, with the automatic group present.
 const hit=await page.evaluate(()=>{const svg=document.querySelector('#scene');const m=svg.getScreenCTM();return {x:m.a*(-10.5)+m.c*0+m.e,y:m.b*(-10.5)+m.d*0+m.f};});
 report.pointerProbe=await page.evaluate(async screen=>{const v='?v=1.7.0-four-session-integration',{state}=await import('/js/state.js'+v),{getRenderScale}=await import('/js/viewport.js'+v),{pickSelectableObjectAtPoint}=await import('/js/pick.js'+v);return {screen,world:{x:-10.5,y:0},scale:getRenderScale(),pickedId:pickSelectableObjectAtPoint(state.get(),{x:-10.5,y:0}),domId:document.elementFromPoint(screen.x,screen.y)?.closest('[data-id]')?.dataset.id||null};},hit);
 await page.mouse.dblclick(hit.x,hit.y,{delay:80});await page.locator('#graph-modal-overlay').waitFor({state:'visible',timeout:4000});
 assert.equal(await page.locator('#gm-tab-func').isVisible(),true);
 report.scenarios.push({name:'real grouped curve double-click opens graph editor',pass:true});
 assert.equal(await page.locator('#gm-exact-x-step').isEnabled(),true);assert.equal(await page.locator('#gm-exact-y-step').isEnabled(),true);
 await page.locator('#gm-confirm').click();assert.equal(await page.locator('#graph-modal-overlay').isVisible(),false);
 let objects=await snap();let curve=objects.find(o=>o.type==='funcgraph');assert.equal(curve.labelWeight,500);assert.equal(curve.dashLength,1.25);assert.equal(curve.dashGap,.65);assert.equal(curve.closed,true);assert.deepEqual(curve.segmentModes,['line','line']);assert.equal(curve.arrowMarks.length,1);const arrowBefore=curve.arrowMarks[0];
 report.scenarios.push({name:'exact .25 interval applies; custom dash, closed path, segment modes, arrow retained',pass:true});
 const pointsBeforeTicks=structuredClone(curve.mathPoints),worldBeforeTicks=structuredClone(curve.points);
 await open();await page.locator('#gm-tickmode').getByRole('button',{name:'숫자',exact:true}).click();
 for(const [selector,value]of [['#gm-exact-x-step','.2'],['#gm-exact-y-step','.1']]){await page.locator(selector).fill(value);await page.locator(selector).dispatchEvent('change');}
 await page.locator('#gm-confirm').click();
 let tickObjects=await snap(),tickPlane=tickObjects.find(o=>o.type==='coordplane'),tickCurve=tickObjects.find(o=>o.type==='funcgraph');
 assert.equal(tickPlane.graphTickMode,'number');assert.equal(tickPlane.gridStepX,.2);assert.equal(tickPlane.gridStepY,.1);
 assert.deepEqual(tickPlane.explicitTicksX.map(t=>t.value),[.2,.4,.6,.8,1]);assert.deepEqual(tickPlane.explicitTicksY.map(t=>t.value),[.1,.2,.3,.4,.5,.6,.7,.8,.9,1]);
 assert.deepEqual(tickCurve.mathPoints,pointsBeforeTicks);assert.deepEqual(tickCurve.points,worldBeforeTicks);
 await open();assert.equal(Number(await page.locator('#gm-exact-x-step').inputValue()),.2);assert.equal(Number(await page.locator('#gm-exact-y-step').inputValue()),.1);
 await page.locator('#gm-tickmode').getByRole('button',{name:'배수',exact:true}).click();
 await page.locator('#gm-tickbase-x').fill('t_0');await page.locator('#gm-tickbase-x').dispatchEvent('input');await page.locator('#gm-tickbase-y').fill('F');await page.locator('#gm-tickbase-y').dispatchEvent('input');
 await page.locator('#gm-confirm').click();tickObjects=await snap();tickPlane=tickObjects.find(o=>o.type==='coordplane');
 assert.equal(tickPlane.graphTickMode,'multiple');assert.deepEqual(tickPlane.explicitTicksX.map(t=>t.label),['t_0','2t_0','3t_0','4t_0','5t_0']);assert.deepEqual(tickObjects.find(o=>o.type==='funcgraph').mathPoints,pointsBeforeTicks);
 await open();assert.equal(await page.locator('#gm-tickbase-x').inputValue(),'t_0');assert.equal(await page.locator('#gm-tickbase-y').inputValue(),'F');await page.locator('#gm-confirm').click();
 report.scenarios.push({name:'imported numeric intervals and multiple labels edit and reopen without changing curve data or geometry',pass:true});
 await open();await page.locator('#gm-tab-func-btn').click();await page.locator('#gm-sub-poly').click();await page.locator('#gm-chips [data-series-index="0"]').click();if(!await page.locator('#gm-point-detail').evaluate(el=>el.open))await page.locator('#gm-point-detail summary').click();
 const arrowSize=page.getByRole('spinbutton',{name:'화살촉 1 길이(mm)',exact:true});assert.equal(Number(await arrowSize.inputValue()),1.1);
 await arrowSize.fill('0');await arrowSize.dispatchEvent('change');await page.locator('#gm-confirm').click();assert.equal(await page.locator('#graph-modal-overlay').isVisible(),true);assert.equal((await snap()).find(o=>o.type==='funcgraph').arrowSpecs[0].strokeWidth,.25);
 assert.equal(await arrowSize.inputValue(),'0','invalid arrow draft remains available for correction');
 assert.equal(await arrowSize.evaluate(n=>n===document.activeElement),true,'confirmation focuses the invalid field');
 await page.locator('#gm-tab-coord-btn').click();await page.locator('#gm-confirm').click();
 assert.equal(await page.locator('#graph-modal-overlay').isVisible(),true);
 assert.equal(await arrowSize.inputValue(),'0','tab changes preserve the invalid dynamic arrow input');
 await arrowSize.fill('0');await arrowSize.press('Enter');
 assert.equal(await page.locator('#graph-modal-overlay').isVisible(),true,'keyboard confirmation also rejects zero');
 assert.equal(await arrowSize.inputValue(),'0');
 await arrowSize.fill('4.5');await arrowSize.dispatchEvent('change');await page.locator('#gm-pts').fill('0.15,0.2 0.6,0.9 0.85,0.2');await page.locator('#gm-pts').dispatchEvent('change');
 await page.locator('#gm-segment-modes').fill('직선, 잘못된값');await page.locator('#gm-segment-modes').dispatchEvent('change');await page.locator('#gm-tab-coord-btn').click();await page.locator('#gm-confirm').click();assert.equal(await page.locator('#graph-modal-overlay').isVisible(),true);await page.locator('#gm-tab-func-btn').click();await page.locator('#gm-sub-poly').click();await page.locator('#gm-segment-modes').fill('직선, 직선');await page.locator('#gm-segment-modes').dispatchEvent('change');await page.locator('#gm-tab-coord-btn').click();await page.locator('#gm-adv-open').click();await page.locator('#gm-label-weight').fill('300');await page.locator('#gm-label-weight').dispatchEvent('input');await page.locator('#gm-axis-x-fraction').fill('.2');await page.locator('#gm-axis-x-fraction').dispatchEvent('input');
 await page.screenshot({path:path.join(out,'editor.png')});await page.locator('#gm-confirm').click();assert.equal(await page.locator('#graph-modal-overlay').isVisible(),false);
 objects=await snap();curve=objects.find(o=>o.type==='funcgraph');let plane=objects.find(o=>o.type==='coordplane');assert.equal(curve.mathPoints[1].x,.6);assert.notDeepEqual(curve.arrowMarks[0],arrowBefore);assert.equal(curve.arrowMarks[0].strokeWidth,1);assert.equal(curve.arrowSpecs[0].strokeWidth,1);assert.equal(curve.strokeWidth,.25);assert.equal(plane.axisPlacement.x.value,.2);assert.equal(plane.labelWeight,300);assert.equal(curve.labelWeight,300);
 report.scenarios.push({name:'real point edit rebakes directional arrow and axis/weight controls apply',pass:true});
 const saved=await page.evaluate(async()=>{const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');const io=await import('/js/project-io.js?v=1.7.0-four-session-integration');const data=structuredClone(io.serialize(state.get()));io.applyLoaded(state,data);return data;});fs.writeFileSync(path.join(out,'edited.5e'),JSON.stringify(saved,null,2));
 await open();await page.locator('#gm-tab-func-btn').click();await page.locator('#gm-sub-poly').click();assert.equal(Number(await page.getByRole('spinbutton',{name:'화살촉 1 길이(mm)',exact:true}).inputValue()),4.5);await page.screenshot({path:path.join(out,'arrow-size-editor.png')});await page.locator('#gm-confirm').click();const reopened=await snap(),rc=reopened.find(o=>o.type==='funcgraph'),rp=reopened.find(o=>o.type==='coordplane');for(const k of ['mathPoints','points','arrowMarks','arrowSpecs','closed','segmentModes','dashLength','dashGap','labelWeight'])assert.deepEqual(rc[k],curve[k],k);for(const k of ['axisPlacement','labelWeight','coordinateMode','gridStepX','gridStepY','explicitTicksX','explicitTicksY','graphTickMode','tickBaseX','tickBaseY'])assert.deepEqual(rp[k],plane[k],k);
 report.scenarios.push({name:'imported arrowhead length 1.125 mm displays 1.1; explicit edit to 4.5 mm, zero rejected, curve width unchanged, point edit and saved reopen preserve length',pass:true});
 report.scenarios.push({name:'serialize, reload and no-op re-edit preserve geometry and custom style',pass:true});
 await page.screenshot({path:path.join(out,'canvas.png')});
 await open();await page.locator('#gm-tab-func-btn').click();await page.locator('#gm-sub-poly').click();if(!await page.locator('#gm-point-detail').evaluate(el=>el.open))await page.locator('#gm-point-detail summary').click();await page.locator('#gm-segment-modes').fill('직선, 곡선');await page.locator('#gm-segment-modes').dispatchEvent('change');await page.locator('#gm-sub-free').click();assert.equal(await page.locator('#gm-chips [data-series-index="0"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#gm-segment-modes').inputValue(),'직선, 곡선');await page.locator('#gm-anchor-dn').click();await page.locator('#gm-confirm').click();
 const reduced=(await snap()).find(o=>o.type==='funcgraph');assert.equal(reduced.mathPoints.length,2);assert.equal(reduced.arrowSpecs.length,0);assert.deepEqual(reduced.segmentModes,['line']);
 await open();await page.locator('#gm-tab-func-btn').click();await page.locator('#gm-sub-free').click();await page.locator('#gm-pts').fill('0,0 0.3,0.5 0.5,0.7 1,1');await page.locator('#gm-pts').dispatchEvent('change');await page.locator('#gm-confirm').click();
 const resized=(await snap()).find(o=>o.type==='funcgraph');assert.equal(resized.mathPoints.length,4);assert.deepEqual(resized.segmentModes,[]);assert.deepEqual(resized.arrowSpecs,[]);fs.writeFileSync(path.join(out,'structure-edit.json'),JSON.stringify(resized,null,2));
 report.scenarios.push({name:'point deletion removes affected segment arrow and merges modes; point-count text replacement resets stale segment metadata',pass:true});
 await page.screenshot({path:path.join(out,'structure-edit.png')});fs.writeFileSync(path.join(out,'objects.json'),JSON.stringify(reopened,null,2));assert.deepEqual(report.errors,[]);report.pass=true;
 }catch(e){report.pass=false;report.error=e.stack;await page.screenshot({path:path.join(out,'failure.png')});throw e;}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
