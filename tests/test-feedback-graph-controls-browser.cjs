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
 const initial=await modal.locator('#gm-preview > svg').boundingBox();await modal.locator('[data-trace-zoom]').selectOption('150');const enlarged=await modal.locator('#gm-preview > svg').boundingBox();assert.ok(enlarged.width>initial.width*1.4);
 await modal.locator('[data-trace-zoom]').selectOption('100');
 fs.mkdirSync('_work/feedback/parts/graph-controls',{recursive:true});await page.screenshot({path:path.resolve('_work/feedback/parts/graph-controls/'+name+'.png')});
 await modal.locator('#gm-cancel').click();assert.equal(await modal.isVisible(),false);
 if(process.env.GRAPH_CONTROLS_ONLY==='1'){assert.deepEqual(errors,[]);console.log(name+': graph dropdowns, zoom and upper export passed; legacy bound-text drag is outside this run');continue;}
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
