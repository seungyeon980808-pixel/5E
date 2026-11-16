// Fixed graph source: b1846e849656076b1c0c5da2f82abffff3813eb1:tests/test-graph-engine-editor-browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('./helpers/graph-source-signals.cjs').loadPlaywright();
const output = path.resolve(process.env.EVIDENCE_DIR || '.omo/evidence/graph-engine-20261005/editor');
const canonical = value => JSON.parse(JSON.stringify(value));

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1640, height: 1100 } });
  const report = { scenarios: [], errors: [], providerCalls: 0 };
  page.on('pageerror', error => report.errors.push(String(error)));
  const snapshot = () => page.evaluate(async () => structuredClone((await import('/js/state.js?v=1.7.0-four-session-integration')).state.get().objects));
  const open = () => page.evaluate(async () => (await import('/js/graph/graph-modal.js?v=1.7.0-four-session-integration')).openGraphModal('engine-plane'));
  const setNumber = async (id, value) => {
    const input = page.locator(id);
    if (!await input.isVisible() && await input.locator('xpath=ancestor::*[@id="gm-adv-panel"]').count()) {
      await page.locator('#gm-tab-coord-btn').click();
      if (!await page.locator('#gm-adv-panel').isVisible()) await page.locator('#gm-adv-open').click();
    }
    // Properties are in the shared panel, outside their selection-list rows.
    const label = await input.getAttribute('aria-label');
    const annotation = label?.match(/^표시 (\d+) /), region = label?.match(/^영역 (\d+) /);
    if (!await input.isVisible() && annotation) {
      const select = page.getByLabel(`표시 ${annotation[1]} 선택`, { exact: true });
      if (await select.getAttribute('aria-expanded') !== 'true') await select.click();
    }
    if (!await input.isVisible() && region) {
      const select = page.getByLabel(`영역 ${region[1]} 화면에서 조절`, { exact: true });
      if (await select.getAttribute('aria-expanded') !== 'true') await select.click();
    }
    if (!await input.isVisible()) {
      const details = input.locator('xpath=ancestor::details[1]');
      assert.equal(await details.count(), 1, `Collapsed settings exist for ${id}`);
      if (!await details.evaluate(el => el.open)) await details.locator(':scope > summary').click();
    }
    await input.fill(String(value)); await input.dispatchEvent('change');
  };
  try {
    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:62759/', { waitUntil: 'networkidle' });
    const skip = page.getByRole('button', { name: '건너뛰기', exact: true }); if (await skip.isVisible()) await skip.click();
    await page.evaluate(async () => {
      const { state } = await import('/js/state.js?v=1.7.0-four-session-integration');
      const { buildNativeGraph } = await import('/js/graph/native-graph.js?v=1.7.0-four-session-integration');
      const axis = (min, max, title, scale = 'linear') => ({ min, max, step: scale === 'log' ? 1 : (max-min)/4, title, unit: '', scale, ticks: [] });
      const plan = { schema: '5e.graph-reconstruction/v1', variant: 'cartesian', source: { id: 'engine-editor', hash: 'synthetic', width: 600, height: 400, plotBox: { x: 40, y: 20, w: 500, h: 300 } }, axes: { x: axis(1, 100, '시간', 'log'), y: axis(1, 100, '크기', 'log'), y2: axis(0, 360, '방향') }, frame: { variant: 'box', arrowX: false, arrowY: false }, series: [{ id: 'a', kind: 'points', axis: 'y', certainty: 'exact', coordinateSpace: 'data', points: [{ x: 1, y: 2 }, { x: 10, y: 10 }, { x: 100, y: 80 }], lineVisible: false, markerShape: 'circle', markerSize: 1.1 }, { id: 'b', kind: 'points', axis: 'y2', certainty: 'exact', coordinateSpace: 'data', points: [{ x: 2, y: 90 }, { x: 20, y: 180 }, { x: 80, y: 270 }], lineVisible: false, markerShape: 'cross', markerSize: 1.2 }, { id: 'c', kind: 'points', axis: 'y', certainty: 'exact', coordinateSpace: 'data', points: [{ x: 1, y: 1 }, { x: 100, y: 1 }], curveStyle: 'straight' }], legends: [{ x: 50, y: 75, coordinateSpace: 'data', rows: [{ text: 'A', markerShape: 'circle', lineVisible: false }] }], regions: [{ id: 'band', kind: 'x-band', axis: 'y', coordinateSpace: 'normalized', from: .35, to: .4, level: 150 }], annotations: [{ id:'label', kind:'text', text:'source', displayText:'old display', x:10, y:10, orientation:'horizontal', seriesId:'a', pointIndex:1 }, { id:'point', kind:'point', text:'', orientation:'horizontal', x:10, y:10, seriesId:'a', pointIndex:1 }], review: [] };
      let n = 0; const built = buildNativeGraph(plan, { box: { x: -40, y: -25, w: 80, h: 50 }, layerId: 1, nextId: () => n++ === 0 ? 'engine-plane' : `engine-${n}` });
      if (!built.ok) throw Error(built.error);
      state.update(s => { s.objects = [...built.objects.slice(1), built.objects[0]]; s.objects.forEach((o, i) => { o.order = i; }); s.groups = built.groups; s.undoStack = []; s.redoStack = []; s.activeTool = 'V'; s.activeLayerId = 1; s.selectedIds = []; });
    });
    const before = canonical(await snapshot());
    await open(); await page.locator('#gm-confirm').click();
    assert.deepEqual(canonical(await snapshot()), before);
    report.scenarios.push({ name: 'box/log/region/scatter no-op preserves native objects exactly', pass: true });
    await open(); await page.locator('#gm-tab-func-btn').click(); await page.locator('#gm-chips [data-series-index="0"]').click();
    await page.locator('#gm-engine-marker').selectOption('square');
    await setNumber('#gm-engine-marker-size', 1.6); await setNumber('#gm-engine-marker-stroke', .4);
    await page.locator('#gm-engine-line').check();
    await page.locator('#gm-line-detail summary').click();
    await page.locator('#gm-engine-dash-pattern').fill('2, 0.8, 0.3, 0.8'); await page.locator('#gm-engine-dash-pattern').dispatchEvent('change');
    await page.locator('#gm-engine-data-details summary').click();
    await page.locator('#gm-engine-data').fill('2\t4\n10\t12\n80\t70'); await page.locator('#gm-engine-data-apply').click();
    await page.locator('#gm-tab-coord-btn').click(); await setNumber('#gm-engine-arrowScale', 125);
    await page.locator('#gm-engine-arrow-X').check(); await page.locator('#gm-engine-boxTickTop').check(); await setNumber('#gm-engine-strokeWidth', .35);
    await page.locator('#gm-tab-annot-btn').click(); await setNumber('[aria-label="영역 1 level"]', 190); await setNumber('[aria-label="영역 1 to"]', .46);
    await page.locator('[aria-label="표시 1 선택"]').click();
    await page.locator('[aria-label="표시 1 글자"]').fill('edited label'); await page.locator('[aria-label="표시 1 글자"]').dispatchEvent('change');
    await setNumber('[aria-label="표시 1 글씨 크기"]', 5); await setNumber('[aria-label="표시 2 점 반지름"]', 1.5);
    await page.locator('#gm-tab-annot-btn').click(); await page.locator('.gm-display-select[data-display-kind="legend"]').click();
    await page.locator('[aria-label="범례 1 줄 1 점 모양"]').selectOption('cross'); await setNumber('[aria-label="범례 1 줄 1 점 반지름(mm)"]', 1.3);
    await page.locator('#gm-engine-region-add').click(); await page.locator('[aria-label="영역 2 종류"]').selectOption('between');
    await setNumber('[aria-label="영역 2 from"]', 2); await setNumber('[aria-label="영역 2 to"]', 80);
    await page.locator('[aria-label="영역 2 첫 곡선"]').selectOption('a'); await page.locator('[aria-label="영역 2 둘째 곡선"]').selectOption('c');
    await page.screenshot({ path: path.join(output, 'editor.png') }); await page.locator('#gm-confirm').click();
    assert.equal(await page.locator('#graph-modal-overlay').isVisible(), false);
    const edited = canonical(await snapshot()), a = edited.find(o => o.reconstruction?.seriesId === 'a'), b = edited.find(o => o.reconstruction?.seriesId === 'b'), plane = edited.find(o => o.type === 'coordplane'), region = edited.find(o => o.regionSpec?.id === 'band');
    assert.equal(a.markerShape, 'square'); assert.equal(a.markerSize, 1.6); assert.equal(a.markerStrokeWidth, .4); assert.equal(a.lineVisible, true); assert.deepEqual(a.dashPattern, [2, .8, .3, .8]); assert.deepEqual(a.mathPoints, [{ x: 2, y: 4 }, { x: 10, y: 12 }, { x: 80, y: 70 }]);
    const beforeB=before.find(o=>o.reconstruction?.seriesId==='b'); for(const key of Object.keys(beforeB))if(!['order','endLabelSize'].includes(key))assert.deepEqual(b[key],beforeB[key],key); edited.forEach((o,i)=>assert.equal(o.order,i)); assert(edited.indexOf(edited.find(o=>o.regionSpec?.kind==='between'))<edited.indexOf(a)); assert.equal(plane.graphStyle.preset,'kice-v1'); assert.equal(plane.graphStyle.arrowScale,1.25); assert.equal(plane.axisArrowX, true); assert(Math.abs(.3*plane.w/70*plane.graphStyle.strokeScale-.4)<1e-9); assert.equal(region.regionFillLevel, 190); assert.equal(region.regionSpec.to, .5); assert.equal(plane.boxTickTop, true);
    assert.equal(plane.graphAnnotations[0].text, 'edited label'); assert.equal(plane.graphAnnotations[0].displayText, undefined); assert.equal(plane.graphAnnotations[0].size, 5);
    // 24219c8a(10-12): 글자 표시(0번)는 자유 배치라 데이터가 바뀌어도 제자리, 점 표시(1번)는 새 값을 따라간다.
    assert.equal(plane.graphAnnotations[0].kind,'text'); assert.equal(plane.graphAnnotations[0].y, before.find(o=>o.type==='coordplane').graphAnnotations[0].y);
    assert.equal(plane.graphAnnotations[1].markerSize, 1.5); assert.equal(plane.graphAnnotations[1].y,12); assert.equal(plane.legends[0].rows[0].markerShape,'cross'); assert.equal(plane.legends[0].rows[0].markerSize,1.3);
    assert.equal(edited.filter(o=>o.sourceKind==='region').length,2); assert(edited.find(o=>o.regionSpec?.kind==='between').points.length>=514);
    report.scenarios.push({ name: 'real controls edit data/markers/dash/arrow/region without changing another series', pass: true });
    await page.evaluate(async () => { const { state } = await import('/js/state.js?v=1.7.0-four-session-integration'); const { undo, redo } = await import('/js/transform.js?v=1.7.0-four-session-integration'); undo(state); redo(state); });
    assert.deepEqual(canonical(await snapshot()), edited);
    const saved = await page.evaluate(async () => { const { state } = await import('/js/state.js?v=1.7.0-four-session-integration'); const io = await import('/js/project-io.js?v=1.7.0-four-session-integration'); const data = io.serialize(state.get()); state.update(s => { s.objects = []; }); io.applyLoaded(state, data); return data; });
    fs.writeFileSync(path.join(output, 'edited.5e'), JSON.stringify(saved, null, 2));
    await open(); await page.locator('#gm-confirm').click();
    const loaded = canonical(await snapshot());
    for (const original of edited) {
      const next = loaded.find(o => o.id === original.id); for (const key of Object.keys(original)) assert.deepEqual(next[key], original[key], `${original.id}.${key}`);
    }
    report.scenarios.push({ name: 'undo/redo and saved reopen retain all new features', pass: true });
    await open(); await setNumber('#gm-exact-x-min', 0); await page.locator('#gm-confirm').click();
    assert.equal(await page.locator('#graph-modal-overlay').isVisible(), true); assert.deepEqual(canonical(await snapshot()), loaded);
    await setNumber('#gm-exact-x-min', 1); await page.locator('#gm-confirm').click();
    report.scenarios.push({ name: 'nonpositive logarithmic range refuses state mutation', pass: true });
    await page.screenshot({ path: path.join(output, 'canvas.png') });
    fs.writeFileSync(path.join(output, 'objects.json'), JSON.stringify(await snapshot(), null, 2));
    await page.evaluate(async () => {
      const { state }=await import('/js/state.js?v=1.7.0-four-session-integration');
      const { buildNativeGraph }=await import('/js/graph/native-graph.js?v=1.7.0-four-session-integration');
      const axis={scale:'linear',min:0,max:1,step:.25,title:'',unit:'',ticks:[]};
      const points=[{x:0,y:.5},{x:.15,y:.6674},{x:.3,y:.6605},{x:.45,y:.6698},{x:.6,y:.6660},{x:.8,y:.6700},{x:1,y:.67}];
      const plan={schema:'5e.graph-reconstruction/v1',coordinateMode:'observed',source:{id:'observed-controls',hash:'synthetic',width:600,height:400,plotBox:{x:40,y:20,w:500,h:300}},axes:{x:{...axis},y:{...axis}},series:[{id:'observed',kind:'points',axis:'y',certainty:'observed',coordinateSpace:'normalized',points,curveStyle:'smooth',endpoints:[{index:2,kind:'open'}]}],annotations:[{id:'linked-arrow',kind:'arrow',text:'',orientation:'horizontal',coordinateSpace:'normalized',x:.15,y:.9,to:{x:.15,y:.6674},seriesId:'observed',pointIndex:1}],review:[]};
      let n=0;const built=buildNativeGraph(plan,{box:{x:-40,y:-25,w:80,h:50},layerId:1,nextId:()=>n++===0?'engine-plane':`fit-${n}`});if(!built.ok)throw Error(built.error);
      state.update(s=>{s.objects=[...built.objects.slice(1),built.objects[0]];s.groups=built.groups;s.undoStack=[];s.redoStack=[];s.selectedIds=[];});
    });
    const originalFit=canonical(await snapshot()).find(o=>o.type==='funcgraph').mathPoints;
    await open(); await page.locator('#gm-tab-func-btn').click(); await page.locator('#gm-chips [data-series-index="0"]').click();
    if (!await page.locator('#gm-engine-fit-details').evaluate(el => el.open)) await page.locator('#gm-engine-fit-details summary').click();
    await setNumber('#gm-engine-fit-tolerance',1); await page.locator('#gm-engine-fit').click(); await page.locator('#gm-confirm').click();
    const fitted=canonical(await snapshot()).find(o=>o.type==='funcgraph');
    assert.deepEqual(fitted.mathPoints[2],originalFit[2]); assert.deepEqual(fitted.originalMathPoints,originalFit); assert.notEqual(fitted.mathPoints[4].y,originalFit[4].y);
    fitted.mathPoints.forEach((p,i)=>assert(Math.abs(p.y-originalFit[i].y)<=.01));
    await open(); await page.locator('#gm-tab-func-btn').click(); await page.locator('#gm-chips [data-series-index="0"]').click();
    if (!await page.locator('#gm-engine-fit-details').evaluate(el => el.open)) await page.locator('#gm-engine-fit-details summary').click();
    await page.locator('#gm-engine-fit-restore').click(); await page.locator('#gm-confirm').click();
    assert.deepEqual(canonical(await snapshot()).find(o=>o.type==='funcgraph').mathPoints,originalFit);
    await open(); await page.locator('#gm-tab-func-btn').click(); await page.locator('#gm-chips [data-series-index="0"]').click();
    if (!await page.locator('#gm-engine-data-details').evaluate(el => el.open)) await page.locator('#gm-engine-data-details summary').click();
    const updated=originalFit.map(p=>({...p}));updated[1].y=.7;
    await page.locator('#gm-engine-data').fill(updated.map(p=>`${p.x}\t${p.y}`).join('\n')); await page.locator('#gm-engine-data-apply').click(); await page.locator('#gm-confirm').click();
    const linked=canonical(await snapshot()).find(o=>o.type==='coordplane').graphAnnotations[0]; assert.equal(linked.to.y,.7); assert.equal(linked.to.x,updated[1].x);
    fs.writeFileSync(path.join(output,'fit-and-linked-arrow.json'),JSON.stringify({originalFit,fitted,linked},null,2));
    await page.screenshot({path:path.join(output,'fit-and-linked-arrow.png')});
    report.scenarios.push({name:'observed denoise protects marked anchor, bounds changes, restores original, and linked arrow follows vertex editing',pass:true});
    await open();await page.locator('#gm-tab-annot-btn').click();
    await page.locator('[aria-label="표시 1 선택"]').click();
    await page.locator('#gm-typed-properties details[data-annotation-id="linked-arrow"] > summary').click();
    await setNumber('[aria-label="표시 1 끝 x"]',.25);await setNumber('[aria-label="표시 1 끝 y"]',.75);
    await page.locator('#gm-tab-func-btn').click();await page.locator('#gm-chips [data-series-index="0"]').click();
    if (!await page.locator('#gm-engine-data-details').evaluate(el => el.open)) await page.locator('#gm-engine-data-details summary').click();
    updated[1].y=.72;await page.locator('#gm-engine-data').fill(updated.map(p=>`${p.x}\t${p.y}`).join('\n'));await page.locator('#gm-engine-data-apply').click();await page.locator('#gm-confirm').click();
    const detached=canonical(await snapshot()).find(o=>o.type==='coordplane').graphAnnotations[0];
    assert.equal(detached.seriesId,undefined);assert.equal(detached.pointIndex,undefined);assert.deepEqual(detached.to,{x:.3,y:.8});
    await page.evaluate(async()=>{const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');const io=await import('/js/project-io.js?v=1.7.0-four-session-integration');io.applyLoaded(state,structuredClone(io.serialize(state.get())));});
    await open();await page.locator('#gm-confirm').click();assert.deepEqual(canonical(await snapshot()).find(o=>o.type==='coordplane').graphAnnotations[0],detached);
    report.scenarios.push({name:'manual linked arrow endpoint edits detach curve binding and survive curve changes and saved reopen',pass:true});
    assert.deepEqual(report.errors, []); report.pass = true;
  } catch (error) { fs.writeFileSync(path.join(output, 'failure-objects.json'),JSON.stringify(await snapshot(),null,2)); report.pass = false; report.error = error.stack; await page.screenshot({ path: path.join(output, 'failure.png') }); throw error; }
  finally { fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
