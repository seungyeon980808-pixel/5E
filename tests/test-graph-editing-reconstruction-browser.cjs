// Fixed graph source: b1846e849656076b1c0c5da2f82abffff3813eb1:tests/test-graph-editing-reconstruction-browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('./helpers/graph-source-signals.cjs').loadPlaywright();
const evidence = process.env.EVIDENCE_DIR || path.resolve(__dirname, '../.omo/evidence/graph-reconstruction-20261004/editing');
const plan = { schema: '5e.graph-reconstruction/v1', source: { id: 'editing-fixture', hash: 'synthetic', width: 600, height: 400, plotBox: { x: 20, y: 20, w: 500, h: 300 } }, axes: { x: { scale: 'linear', title: '시간', unit: 's', min: -2, max: 8, step: 2, ticks: [{ value: -2, label: '-2' }, { value: 4, label: 't_0' }] }, y: { scale: 'linear', title: '', unit: '', min: -5, max: 15, step: 5, ticks: [] } }, series: [{ id: 'points', kind: 'points', axis: 'y', certainty: 'exact', coordinateSpace: 'data', points: [{ x: -2, y: -5 }, { x: 0, y: 0 }, { x: 4, y: 8 }, { x: 8, y: 15 }], breaks: [2], endpoints: [{ index: 1, kind: 'open' }, { index: 2, kind: 'closed' }], area: { enabled: true, min: 0, max: 8 } }], annotations: [{ id: 'a', kind: 'text', text: '구간', x: 6, y: 4, axis: 'y', orientation: 'vertical' }], review: [] };
plan.axes.y2 = { scale:'linear', title:'밀도', unit:'', min:0, max:200, step:20, ticks:[{value:100,label:'100'}] };
(async () => {
 fs.mkdirSync(evidence, { recursive: true });
 const browser = await chromium.launch({ headless: true });
 const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
 const errors = []; page.on('pageerror', e => errors.push(String(e)));
 const report = { scenarios: [], errors };
 const snap = () => page.evaluate(async () => JSON.parse(JSON.stringify((await import('/js/state.js?v=1.7.0-four-session-integration')).state.get().objects)).sort((a,b) => (a.type === 'coordplane' ? -1 : b.type === 'coordplane' ? 1 : 0)));
 const open = id => page.evaluate(async id => (await import('/js/graph/graph-modal.js?v=1.7.0-four-session-integration')).openGraphModal(id), id);
 try {
 await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:62759/', { waitUntil: 'networkidle' });
 const skip = page.getByRole('button', { name: '건너뛰기', exact: true }); if (await skip.isVisible()) await skip.click();
 const inserted = await page.evaluate(async plan => { const { state } = await import('/js/state.js?v=1.7.0-four-session-integration'); state.update(s => { s.objects=[]; s.groups=[]; s.undoStack=[]; s.redoStack=[]; }); return (await import('/js/graph/native-graph.js?v=1.7.0-four-session-integration')).insertNativeGraph(state, plan, { box: { x: -30, y: -22.5, w: 60, h: 45 } }); }, plan);
 assert.equal(inserted.ok, true, JSON.stringify(inserted));
 const before = await snap();
 const layerOrder = await page.evaluate(async () => { const {state}=await import('/js/state.js?v=1.7.0-four-session-integration'); return state.get().objects.map(o=>o.type); });
 assert.deepEqual(layerOrder,['funcgraph','coordplane']);
 await open(inserted.planeId);
 assert.equal(await page.locator('#gm-exact-x-min').inputValue(), '-2');
 for (const [selector,bad,good] of [['#gm-exact-x-max','-10','8'],['#gm-exact-x-step','0','2'],['#gm-y2-pos','-1','200']]) {
   if (selector === '#gm-y2-pos') await page.locator('#gm-adv-open').click();
   await page.locator(selector).fill(bad); await page.locator(selector).dispatchEvent('change'); await page.locator('#gm-confirm').click();
   assert.ok(await page.locator('#graph-modal-overlay').isVisible()); assert.deepEqual(await snap(),before);
   await page.locator(selector).fill(good); await page.locator(selector).dispatchEvent('change');
 }
 report.scenarios.push({name:'invalid exact axis, tick interval and y2 input blocks confirm without mutation; corrected input accepted',pass:true});
 assert.equal(await page.locator('#gm-preview [data-graph-endpoint="open"]').count(), 1);
 assert.equal(await page.locator('#gm-preview [data-graph-annotation="a"]').count(), 1);
 assert.ok(await page.locator('#gm-preview [data-tick="x:1"]').count());
 await page.screenshot({ path: path.join(evidence, 'exact-preview.png') });
 await page.locator('#gm-confirm').click();
 const after = await snap();
 await page.waitForGraphSignal(ids => { const a=document.querySelector(`#scene [data-id="${ids[0]}"]`), b=document.querySelector(`#scene [data-id="${ids[1]}"]`); return a && b && !!(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING); }, [after[1].id,after[0].id]);
 await page.screenshot({path:path.join(evidence,'canvas-shaded-label.png')});
 for (const key of ['xMin','xMax','yMin','yMax','gridStepX','gridStepY','labelX','labelY','labelOrigin','showAxisLabelY','explicitTicksX','explicitTicksY','y2','graphAnnotations','reconstruction']) assert.deepEqual(after[0][key], before[0][key], key);
 for (const key of ['mathPoints','points','breaks','endpointMarkers','reconstruction']) assert.deepEqual(after[1][key], before[1][key], key);
 assert.equal(after[1].area.from, before[1].area.from); assert.equal(after[1].area.to, before[1].area.to);
 const rendering = await page.evaluate(async () => {
   const { renderFuncgraph, renderCoordplane } = await import('/js/render/coordplane.js?v=1.7.0-four-session-integration');
   const points=[{x:0,y:0},{x:10,y:10},{x:20,y:20},{x:30,y:30}];
   const graph=renderFuncgraph({type:'funcgraph',points,breaks:[2],curveStyle:'smooth',handles:points.map(p=>({inX:p.x,inY:p.y,outX:p.x,outY:p.y})),area:{baseY:40,worldFrom:5,worldTo:25,level:220},strokeWidth:0.4,strokeLevel:0});
   const curve=[...graph.querySelectorAll('path')].find(p=>p.getAttribute('fill')==='none');
   const fill=[...graph.querySelectorAll('path')].find(p=>p.getAttribute('stroke')==='none');
   const curvedPoints=[{x:0,y:0},{x:10,y:0},{x:20,y:0},{x:30,y:0}];
   const curved=renderFuncgraph({points:curvedPoints,breaks:[2],curveStyle:'smooth',handles:curvedPoints.map((p,i)=>({inX:p.x,inY:i%2?-10:0,outX:p.x,outY:i%2?0:-10})),area:{baseY:10,worldFrom:0,worldTo:30,level:220},strokeWidth:0.4,strokeLevel:0});
   const curvedFill=[...curved.querySelectorAll('path')].find(p=>p.getAttribute('stroke')==='none').getAttribute('d');
   const singleton=renderFuncgraph({points:[{x:1,y:2}],strokeWidth:0.4,strokeLevel:0});
   const {state}=await import('/js/state.js?v=1.7.0-four-session-integration'); const p={...state.get().objects.find(o=>o.type==='coordplane'),xMin:2,xMax:8,yMin:10,yMax:100}; const plane=renderCoordplane(p);
   const orientations={}; for (const orientation of ['horizontal','vertical','rotate']) { const copy=structuredClone(p);copy.reconstruction.axes.y2.orientation=orientation; const label=renderCoordplane(copy).querySelector('[data-axisname="y2"]'); orientations[orientation]={parentTransform:label.parentNode.getAttribute('transform'),text:label.textContent,rows:label.children.length}; }
   const pointPlane={...p,graphAnnotations:[{id:'no-dot',kind:'point',text:'A',x:4,y:40,axis:'y',orientation:'horizontal',endStyle:'none'}]};
   const noDot=renderCoordplane(pointPlane); const dots=renderCoordplane({...pointPlane,graphAnnotations:pointPlane.graphAnnotations.map(a=>({...a,endStyle:'closed'}))});
   const pointStyle={none:noDot.querySelectorAll('circle').length,closed:dots.querySelectorAll('circle').length,text:noDot.querySelector('[data-graph-annotation="no-dot"]').textContent};
   return {orientations,pointStyle,curvedFill,moves:(curve.getAttribute('d').match(/M /g)||[]).length,fill:fill.getAttribute('d'),single:singleton.querySelectorAll('circle').length,positiveAxes:plane.querySelectorAll('line').length,svg:graph.outerHTML};
 });
 assert.equal(rendering.orientations.horizontal.parentTransform,null); assert.equal(rendering.orientations.vertical.parentTransform,null); assert.match(rendering.orientations.rotate.parentTransform,/rotate\(-90/); assert.equal(rendering.pointStyle.closed,rendering.pointStyle.none+1); assert.equal(rendering.pointStyle.text,'A');
 assert.match(rendering.curvedFill,/L 5\.000 -7\.500/); assert.match(rendering.curvedFill,/L 25\.000 -7\.500/); assert.equal((rendering.curvedFill.match(/M /g)||[]).length,2); assert.equal(rendering.moves,2); assert.match(rendering.fill,/M 5\.000/); assert.match(rendering.fill,/25\.000/); assert.equal(rendering.single,1); assert.ok(rendering.positiveAxes>=2);
 fs.writeFileSync(path.join(evidence,'discontinuous-render.svg'),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 45 50">${rendering.svg}</svg>`);
 report.scenarios.push({name:'Bezier breaks, independent points shading interval, singleton, positive-minimum axes render',pass:true,observables:rendering});
 const editedOrder = await page.evaluate(async () => (await import('/js/state.js?v=1.7.0-four-session-integration')).state.get().objects.map(o=>o.type)); assert.deepEqual(editedOrder,['funcgraph','coordplane']);
 report.scenarios.push({ name: 'no-op exact axes, empties, ticks, points, breaks, endpoints, review and area', pass: true });
 await open(inserted.planeId);
 await page.locator('#gm-exact-x-max').fill('18'); await page.locator('#gm-exact-x-max').dispatchEvent('change');
 await page.locator('#gm-ticktext-x').fill('왼쪽, 기준'); await page.locator('#gm-ticktext-x').dispatchEvent('input');
 await page.locator('#gm-tab-annot-btn').click();
 await page.locator('[aria-label="표시 1 선택"]').click();
 await page.locator('[data-annotation="0"][data-field="text"]').fill('변경'); await page.locator('[data-annotation="0"][data-field="text"]').dispatchEvent('change');
 await page.locator('#gm-typed-properties details[data-annotation-id="a"] > summary').click();
 await page.locator('[data-annotation="0"][data-field="x"]').fill('3.25'); await page.locator('[data-annotation="0"][data-field="x"]').dispatchEvent('change');
 await page.locator('[data-annotation="0"][data-field="y"]').fill('4.5'); await page.locator('[data-annotation="0"][data-field="y"]').dispatchEvent('change');
 await page.getByRole('combobox',{name:'표시 1 방향',exact:true}).selectOption('rotate');
 await page.locator('#gm-tab-func-btn').click(); await page.locator('#gm-chips [data-series-index="0"]').click();
 await page.locator('#gm-point-detail summary').click();
 for (const [selector,bad,good] of [['#gm-pts','broken','-2,-5 0,0 4,8 8,15'],['#gm-breaks','99','3'],['#gm-endpoints','0:빈원','2:빈원, 3:채움']]) {
   await page.locator(selector).fill(bad); await page.locator(selector).dispatchEvent('change'); await page.locator('#gm-confirm').click(); assert.ok(await page.locator('#graph-modal-overlay').isVisible()); assert.deepEqual(await snap(),after); await page.locator(selector).fill(good); await page.locator(selector).dispatchEvent('change');
 }
 report.scenarios.push({name:'invalid point, break and endpoint editors block confirmation and recover on valid correction',pass:true});
 await page.locator('#gm-pts').fill('-2,-5 0,1 4,8 8,15'); await page.locator('#gm-pts').dispatchEvent('change');
 await page.locator('#gm-breaks').fill('4'); await page.locator('#gm-breaks').dispatchEvent('change');
 await page.locator('#gm-endpoints').fill('1:빈원, 4:채움'); await page.locator('#gm-endpoints').dispatchEvent('change');
 await page.locator('#gm-confirm').click(); const edited = await snap();
 assert.equal(edited[0].xMax, 18); assert.equal(edited[0].graphAnnotations[0].text,'변경'); assert.equal(edited[0].graphAnnotations[0].x,3.3); assert.equal(edited[0].graphAnnotations[0].y,4.5); assert.equal(edited[0].graphAnnotations[0].orientation,'rotate'); assert.equal(edited[1].mathPoints[1].y,1); assert.deepEqual(edited[1].breaks,[3]); assert.equal(edited[1].endpointMarkers[0].index,0); assert.notEqual(edited[1].points[3].x,after[1].points[3].x);
 assert.deepEqual(edited[0].explicitTicksX.map(t=>t.value),after[0].explicitTicksX.map(t=>t.value));assert.deepEqual(edited[0].explicitTicksX.map(t=>t.label),['왼쪽','기준']);
 report.scenarios.push({name:'direct tick label edit preserves irregular imported tick positions',pass:true});
 await page.evaluate(async () => { const { state } = await import('/js/state.js?v=1.7.0-four-session-integration'); (await import('/js/transform.js?v=1.7.0-four-session-integration')).undo(state); }); assert.deepEqual(await snap(), after);
 await page.evaluate(async () => { const { state } = await import('/js/state.js?v=1.7.0-four-session-integration'); (await import('/js/transform.js?v=1.7.0-four-session-integration')).redo(state); }); assert.deepEqual(await snap(), edited);
 report.scenarios.push({ name: 'real axis, data, breaks, endpoint and internal label controls with undo/redo', pass:true });
 const serialized = await page.evaluate(async () => { const { state } = await import('/js/state.js?v=1.7.0-four-session-integration'); const io = await import('/js/project-io.js?v=1.7.0-four-session-integration'); const data = JSON.parse(JSON.stringify(io.serialize(state.get()))); io.applyLoaded(state, data); return data; });
 fs.writeFileSync(path.join(evidence,'saved-project.5e'),JSON.stringify(serialized,null,2));
 const reopened = await snap(); for (let i=0;i<edited.length;i++) for (const key of Object.keys(edited[i])) assert.deepEqual(reopened[i][key],edited[i][key],`reopen ${key}`); await open(inserted.planeId); assert.equal(await page.locator('#gm-exact-x-max').inputValue(),'18'); await page.locator('#gm-cancel').click();
 const movedBefore = await snap();
 await page.evaluate(async () => { const { state } = await import('/js/state.js?v=1.7.0-four-session-integration'); const { translateObject } = await import('/js/transform.js?v=1.7.0-four-session-integration'); state.update(s => { for (const object of s.objects) translateObject(object, 7, 9); }); });
 const moved = await snap(); assert.equal(moved[0].x,movedBefore[0].x+7); assert.equal(moved[1].points[0].x,movedBefore[1].points[0].x+7); assert.deepEqual(moved[0].graphAnnotations,movedBefore[0].graphAnnotations); assert.deepEqual(moved[1].mathPoints,movedBefore[1].mathPoints);
 await open(inserted.planeId); await page.locator('#gm-confirm').click(); const movedEdited=await snap(); assert.deepEqual(movedEdited[1].points,moved[1].points); assert.deepEqual(movedEdited[0].graphAnnotations,moved[0].graphAnnotations);
 report.scenarios.push({name:'production group member translation and no-op re-edit preserve math and internal label attachment',pass:true});
 report.scenarios.push({ name:'project serialize/applyLoaded and reopen graph editor preserve data',pass:true });
 await page.evaluate(async()=>{const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');state.update(s=>s.objects.find(o=>o.type==='coordplane').graphAnnotations.push({id:'custom-guide',kind:'guide',text:'',x:3,y:2,orientation:'horizontal'}));});
 const styleBefore=await snap();await open(inserted.planeId);await page.locator('#gm-style-recommended').check();await page.locator('#gm-adv-open').click();await page.locator('#gm-axisscale').fill('133');await page.locator('#gm-axisscale').dispatchEvent('input');
 await page.locator('#gm-tab-annot-btn').click();await page.locator('[aria-label="표시 2 선택"]').click();
 for(const [label,value]of [['선 굵기(mm)','.2'],['점선 조각 길이(mm)','1.2'],['점선 간격(mm)','']]){await page.locator(`[aria-label="표시 2 ${label}"]`).fill(value);await page.locator(`[aria-label="표시 2 ${label}"]`).dispatchEvent('change');}
 await page.locator('#gm-confirm').click();assert.ok(await page.locator('#graph-modal-overlay').isVisible());assert.deepEqual(await snap(),styleBefore);
 await page.locator('[aria-label="표시 2 점선 간격(mm)"]').fill('.9');await page.locator('[aria-label="표시 2 점선 간격(mm)"]').dispatchEvent('change');await page.locator('#gm-confirm').click();const styled=await snap();
 assert.equal(styled[0].graphStyle.labelScale,1.33);assert.deepEqual(styled[1].mathPoints,styleBefore[1].mathPoints);
 const guideStyle=styled[0].graphAnnotations[1];for(const [key,value]of Object.entries({strokeWidth:.2,dashLength:1.2,dashGap:.9}))assert.equal(guideStyle[key],value);
 const rendered=await page.evaluate(async()=>{const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');const {examPlaneStyle}=await import('/js/graph/exam-style.js?v=1.7.0-four-session-integration');const {renderCoordplane}=await import('/js/render/coordplane.js?v=1.7.0-four-session-integration');const p=structuredClone(state.get().objects.find(o=>o.type==='coordplane'));p.guideLines=[{x1:0,y1:0,x2:1,y2:1}];const effective=examPlaneStyle(p);return {sizes:[effective.axisLabelSize,effective.tickLabelSize,effective.originLabelSize],guides:[...renderCoordplane(p).querySelectorAll('[data-graph-guide]')].map(l=>({sw:+l.getAttribute('stroke-width'),dash:l.getAttribute('stroke-dasharray')}))};});
 assert.equal(new Set(rendered.sizes).size,1);assert.equal(rendered.guides[1].sw,.2);assert.equal(rendered.guides[1].dash,'1.2 0.9');assert.notEqual(rendered.guides[0].sw,.2);
 await page.evaluate(async()=>{const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');const io=await import('/js/project-io.js?v=1.7.0-four-session-integration');io.applyLoaded(state,structuredClone(io.serialize(state.get())));});await open(inserted.planeId);await page.locator('#gm-tab-annot-btn').click();await page.locator('[aria-label="표시 2 선택"]').click();assert.equal(await page.locator('[aria-label="표시 2 점선 간격(mm)"]').inputValue(),'0.9');await page.locator('#gm-confirm').click();const styleReopened=await snap();for(const k of ['graphStyle','graphAnnotations'])assert.deepEqual(styleReopened[0][k],styled[0][k]);
 report.scenarios.push({name:'exam labels and dashed guides editable, invalid style blocked, save/reopen preserved',pass:true});
 assert.deepEqual(errors,[]); report.pass=true; fs.writeFileSync(path.join(evidence,'objects.json'),JSON.stringify(await snap(),null,2));
 } catch(e) { report.pass=false; report.error=e.stack; await page.screenshot({path:path.join(evidence,'failure.png')}); throw e; }
 finally { fs.writeFileSync(path.join(evidence,'browser-report.json'),JSON.stringify(report,null,2)); await browser.close(); }
})().catch(e=>{ console.error(e); process.exitCode=1; });
