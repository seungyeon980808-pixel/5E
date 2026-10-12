const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const h=require('./helpers/rhwp-exam.cjs');
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/graph-reconstruction/linear.json'),'utf8'));
h.withServer(async origin=>{for(const [name,engine]of Object.entries({chromium,webkit})) {
 const browser=await engine.launch(),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try {await h.navigate(page,origin+'/?mode=pro&mobile=0&exam=0');await h.ready(page);
 await page.evaluate(async()=>{(await import('/js/graph/graph-modal.js?v=1.7.0-four-session-integration')).openGraphModal();});
 const modal=page.locator('#graph-modal-overlay');await modal.waitFor({state:'visible'});await page.evaluate(()=>Promise.allSettled(document.querySelector('#graph-modal-overlay').getAnimations({subtree:true}).map(a=>a.finished)));
 assert.equal(await modal.locator('select[data-trace-view]').inputValue(),'graph');
 assert.deepEqual(await modal.locator('select[data-trace-import] option').allTextContents(),['이미지 불러오기','라이브러리에서 불러오기','파일 탐색기에서 불러오기']);
 const preview=await modal.locator('#gm-preview').boundingBox(),exportBox=await modal.locator('#gm-confirm').boundingBox();assert.ok(exportBox.y+exportBox.height<=preview.y);
 const initial=await modal.locator('#gm-preview > svg').boundingBox();await modal.locator('[data-trace-zoom-toggle]').click();await modal.locator('[data-trace-zoom]').fill('150');const enlarged=await modal.locator('#gm-preview > svg').boundingBox();assert.ok(enlarged.width>initial.width*1.4);
 await modal.locator('[data-trace-zoom]').press('ArrowLeft');assert.equal(await modal.locator('[data-trace-zoom]').inputValue(),'149');
 await modal.locator('[data-trace-zoom]').fill('137');await modal.locator('[data-trace-zoom-lock]').click();assert.equal(await modal.locator('[data-trace-zoom]').isDisabled(),true);
 await modal.locator('[data-trace-zoom]').dispatchEvent('input');assert.equal(await modal.locator('[data-trace-zoom-toggle]').textContent(),'137% · 고정');
 await modal.locator('[data-trace-zoom-lock]').press('Escape');assert.equal(await modal.locator('.gm-trace-zoom-panel').isVisible(),false);assert.equal(await modal.isVisible(),true);assert.equal(await modal.locator('[data-trace-zoom-toggle]').evaluate(n=>n===document.activeElement),true);
 await modal.locator('#gm-confirm').click();
 const snapshot=()=>page.evaluate(async()=>structuredClone((await import('/js/state.js?v=1.7.0-four-session-integration')).state.get().objects));
 const saved=await snapshot(),plane=saved.find(o=>o.type==='coordplane');assert.equal(plane.graphTrace.previewZoom,137);assert.equal(plane.graphTrace.previewZoomLocked,true);
 const openSaved=()=>page.evaluate(async id=>(await import('/js/graph/graph-modal.js?v=1.7.0-four-session-integration')).openGraphModal(id),plane.id);
 await openSaved();await modal.locator('[data-trace-zoom-toggle]').click();assert.equal(await modal.locator('[data-trace-zoom]').inputValue(),'137');assert.equal(await modal.locator('[data-trace-zoom]').isDisabled(),true);
 await modal.locator('[data-trace-zoom-lock]').click();await modal.locator('[data-trace-zoom-reset]').click();assert.equal(await modal.locator('[data-trace-zoom]').inputValue(),'100');await modal.locator('#gm-cancel').click();assert.deepEqual(await snapshot(),saved,'Cancel discards changed viewing preferences');
 await openSaved();await modal.locator('[data-trace-zoom-toggle]').click();await modal.locator('[data-trace-zoom-lock]').click();await modal.locator('[data-trace-zoom]').fill('100');await modal.locator('#gm-confirm').click();
 const afterZoom=await snapshot();for(const o of saved){const before=structuredClone(o),after=structuredClone(afterZoom.find(x=>x.id===o.id));delete before.graphTrace;delete after.graphTrace;assert.deepEqual(after,before,'View zoom cannot change exported geometry');}
 await openSaved();
 const reference=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=200;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,400,200);g.strokeStyle='black';g.strokeRect(30,20,340,160);return c.toDataURL().split(',')[1];});
 await modal.locator('input[type=file][aria-label="트레이싱 원본 이미지 선택"]').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:Buffer.from(reference,'base64')});
 await page.waitForFunction(()=>!document.querySelector('[data-trace-import]').disabled);
 assert.equal(await modal.locator('.gm-trace-options summary').textContent(),'비교 위치 조정');await modal.locator('select[data-trace-view]').selectOption('overlay');await modal.locator('.gm-trace-options summary').click();assert.ok((await modal.locator('.gm-trace-align-hint').textContent()).includes('편집본의 위치와 크기'));await modal.locator('.gm-trace-options summary').click();
 for(const width of [1024,720,1440]){await page.setViewportSize({width,height:1000});const sizes=await modal.locator('.gm-modal,.gm-trace-toolbar').evaluateAll(ns=>ns.map(n=>({width:n.clientWidth,scroll:n.scrollWidth})));assert.ok(sizes.every(n=>n.scroll<=n.width+1),JSON.stringify({width,sizes}));await modal.locator('[data-trace-zoom-toggle]').click();const panel=await modal.locator('.gm-trace-zoom-panel').boundingBox();assert.ok(panel.x>=0&&panel.x+panel.width<=width,{width,panel});await modal.locator('[data-trace-zoom]').press('Escape');}

 await modal.locator('[data-trace-zoom-toggle]').click();
 fs.mkdirSync('_work/feedback/parts/graph-controls',{recursive:true});await page.screenshot({path:path.resolve('_work/feedback/parts/graph-controls/'+name+'.png')});
 await modal.locator('#gm-cancel').click();assert.equal(await modal.isVisible(),false);
 if(process.env.GRAPH_CONTROLS_ONLY==='1'){assert.deepEqual(errors,[]);console.log(name+': graph dropdowns, slider/lock, Escape, saved view preferences, Cancel, unchanged geometry and upper export passed; legacy bound-text drag is outside this run');continue;}
 await page.evaluate(async fixture=>{
  const v='?v=1.7.0-four-session-integration', {state}=await import('/js/state.js'+v),{buildNativeGraph}=await import('/js/graph/native-graph.js'+v);
  fixture.annotations=[{id:'free-label',kind:'text',text:'자유 글자',coordinateSpace:'data',orientation:'horizontal',x:2.3,y:2.7,axis:'y',seriesId:'s1',pointIndex:1}];
  let n=0;const built=buildNativeGraph(fixture,{nextId:()=>n++===0?'free-text-plane':`free-text-${n}`});if(!built.ok)throw Error(built.error);
  const plane=built.objects[0],fg=built.objects[1],{sampleFunctionPoints}=await import('/js/function-graph/sampler.js'+v),{mathFromWorld}=await import('/js/function-graph/coords.js'+v),sample=sampleFunctionPoints('x',0,4,plane);
  Object.assign(fg,{sourceKind:'expression',expr:'x',domainMin:0,domainMax:4,domainAuto:false,points:sample.points,mathPoints:sample.points.map(q=>mathFromWorld(plane,q.x,q.y)),breaks:sample.breaks,offset:{dx:0,dy:0}});
  plane.graphAnnotations[0].anchorX=2;
  state.update(s=>{s.objects=built.objects;s.groups=built.groups;s.selectedIds=[];});
 },fixture);
 const readLabel=()=>page.evaluate(async()=>structuredClone((await import('/js/state.js?v=1.7.0-four-session-integration')).state.get().objects.find(o=>o.type==='coordplane').graphAnnotations[0]));
 const open=()=>page.evaluate(async()=>{(await import('/js/graph/graph-modal.js?v=1.7.0-four-session-integration')).openGraphModal('free-text-plane');await Promise.allSettled(document.querySelector('#graph-modal-overlay').getAnimations({subtree:true}).map(a=>a.finished));});
 const before=await readLabel();await open();await modal.locator('#gm-tab-func-btn').click();await modal.locator('#gm-chips [data-series-index="0"]').click();await modal.locator('#gm-expr').fill('0.5*x');await modal.locator('#gm-expr').dispatchEvent('input');await modal.locator('#gm-confirm').click();
 const afterCurve=await readLabel();assert.equal(afterCurve.x,before.x);assert.equal(afterCurve.y,before.y,'changing a curve cannot move free text');
 await open();await modal.locator('#gm-tab-annot-btn').click();await page.evaluate(()=>document.fonts.ready);
 const label=modal.locator('#gm-preview [data-graph-annotation="free-label"]:not([data-annotation-hit])');await label.scrollIntoViewIfNeeded();const lb=await label.boundingBox();assert.ok(lb);
 await page.mouse.move(lb.x+lb.width/2,lb.y+lb.height/2);await page.mouse.down();await page.mouse.move(lb.x+lb.width/2+35,lb.y+lb.height/2+25,{steps:6});await page.mouse.up();await modal.locator('#gm-confirm').click();
 const moved=await readLabel();assert.notEqual(moved.x,before.x);assert.notEqual(moved.y,before.y);for(const key of ['seriesId','anchorX','pointIndex','curveAnchor'])assert.equal(moved[key],undefined);
 assert.deepEqual(errors,[]);console.log(name+': graph dropdowns, zoom, upper export and independent text drag passed');
 }finally{await browser.close();}
}}).catch(e=>{console.error(e);process.exitCode=1;});
