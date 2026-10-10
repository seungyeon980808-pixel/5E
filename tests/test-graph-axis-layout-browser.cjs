// Fixed graph source: b1846e849656076b1c0c5da2f82abffff3813eb1:tests/test-graph-axis-layout-browser.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,webkit}=require('./helpers/graph-source-signals.cjs').loadPlaywright();
const version='?v=1.7.0-four-session-integration';
const output=path.resolve(process.env.EVIDENCE_DIR || '.omo/evidence/graph-editor-usability-20261008');
fs.mkdirSync(output,{recursive:true});
const closeTo=(actual,expected)=>assert(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);

async function install(page) {
  return page.evaluate(async version=>{
    const {state}=await import('/js/state.js'+version);
    const {buildNativeGraph}=await import('/js/graph/native-graph.js'+version);
    const axis=(max,title,ticks)=>({min:0,max,title,scale:'linear',step:null,unit:'',ticks});
    const annotations=[{id:'origin',kind:'text',text:'0',x:.1,y:.1,axis:'y'},
      {id:'P',kind:'text',text:'P',x:3.4,y:5.4,axis:'y'},
      {id:'Q',kind:'text',text:'Q',x:3.5,y:4.2,axis:'y'},
      ...[1,3,4.9924].map((y,i)=>({id:`h${i}`,kind:'guide',x:3.0009,y,to:{x:0,y},axis:'y',orientation:'horizontal'})),
      ...[1,2,3.0009].map((x,i)=>({id:`v${i}`,kind:'guide',x,y:4.9924,to:{x,y:0},axis:'y',orientation:'vertical'}))];
    annotations.forEach(a=>{a.text??='';a.orientation??='horizontal';a.coordinateSpace='data';});
    const plan={schema:'5e.graph-reconstruction/v1',source:{id:'axis-layout',hash:'synthetic',width:600,height:450,plotBox:{x:50,y:30,w:500,h:360}},
      axes:{x:axis(4.598,'진동수',[.5023,1,1.494,2,2.4986,3].map((value,i)=>({value,label:i%2?'f_0':''}))),
        y:axis(6.485,'E_K',[1,2.0072,3,3.9888,5].map((value,i)=>({value,label:i%2?'':'E_0'})))},
      series:[{id:'p',kind:'expression',axis:'y',certainty:'exact',coordinateSpace:'data',expression:'2*x-1',domain:{min:.5,max:3.2}},
        {id:'q',kind:'expression',axis:'y',certainty:'exact',coordinateSpace:'data',expression:'2*x-3',domain:{min:1.5,max:3.3},dashLength:1,dashGap:.8}],
      regions:[1,2,3].map((n,i)=>({id:`r${i}`,kind:'y-band',axis:'y',coordinateSpace:'data',from:n,to:n+.25,level:185,opacity:.73})),annotations,review:[]};
    let n=0;const built=buildNativeGraph(plan,{nextId:()=>n++===0?'layout-plane':`layout-${n}`,box:{x:-35,y:-25,w:70,h:50}});
    if(!built.ok)throw Error(built.error);
    const p=built.objects.find(o=>o.type==='coordplane');
    const generated={gridStepX:p.gridStepX,gridStepY:p.gridStepY};
    // Simulate the old downloaded graph whose fallback used the entire range.
    Object.assign(p,{gridStepX:4.598,tickStepX:4.598,gridStepY:6.485,tickStepY:6.485,showGrid:false});
    state.update(s=>{s.objects=built.objects;s.groups=built.groups;s.selectedIds=[];s.undoStack=[];s.redoStack=[];});
    return generated;
  },version);
}
(async()=>{
  const reports=[];
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
    const browser=await engine.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    await page.addInitScript(()=>{localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true');localStorage.setItem('5e.tutorial.bannerSeen','true');localStorage.setItem('5e.preview:5e.mode','pro');});
    const snap=()=>page.evaluate(async version=>JSON.parse(JSON.stringify((await import('/js/state.js'+version)).state.get().objects)),version);
    const open=()=>page.evaluate(async version=>(await import('/js/graph/graph-modal.js'+version)).openGraphModal('layout-plane'),version);
    const plane=objects=>objects.find(o=>o.type==='coordplane');
    const change=async(selector,value,event='change')=>{await page.locator(selector).fill(String(value));await page.locator(selector).dispatchEvent(event);};
    const advanced=async()=>{await page.locator('#gm-tab-coord-btn').click();if(!await page.locator('#gm-pad-xp').isVisible())await page.locator('#gm-adv-open').click();};
    const shoot=async suffix=>page.locator('.gm-modal').screenshot({path:path.join(output,`${name}-${suffix}.png`)});
    try {
      await page.goto((process.env.PREVIEW_URL || 'http://127.0.0.1:62759/')+'?mode=pro',{waitUntil:'networkidle'});
      assert.deepEqual(await install(page),{gridStepX:.5,gridStepY:1},'New restorations infer cells from ticks');
      const original=await snap();await open();
      assert.equal(await page.locator('#gm-exact-x-step').inputValue(),'0.5');
      assert.equal(await page.locator('#gm-exact-y-step').inputValue(),'1');
      await page.locator('#gm-confirm').click();assert.deepEqual(await snap(),original,'Opening an old file does not rewrite it');
      await open();await change('#gm-exact-y-step',1);await change('#gm-exact-x-step',1);
      await advanced();await change('#gm-pad-xp',.7,'input');await change('#gm-pad-yp',.3,'input');
      await change('#gm-gov-xp',.4,'input');await change('#gm-gov-yp',0,'input');
      await shoot('axis-settings');
      await page.locator('#gm-confirm').click();const edited=await snap(),p=plane(edited);
      closeTo(p.xMax,3.7);closeTo(p.yMax,5.3);assert.equal(p.gridStepX,1);assert.equal(p.gridStepY,1);
      assert.deepEqual(p.explicitTicksX,plane(original).explicitTicksX);
      assert.deepEqual(p.explicitTicksY,plane(original).explicitTicksY);
      assert.deepEqual(edited.filter(o=>o.sourceKind==='expression').map(o=>o.expr),['2*x-1','2*x-3']);
      assert.equal(p.graphAnnotations.find(a=>a.id==='h0').x,3.4);
      assert.equal(p.graphAnnotations.find(a=>a.id==='v0').y,5);
      assert.deepEqual(p.graphAnnotations.filter(a=>a.kind==='text'),plane(original).graphAnnotations.filter(a=>a.kind==='text'));
      await open();await page.locator('#gm-tab-annot-btn').click();
      const guide=page.locator('#gm-preview [data-graph-annotation-shape="h0"]:not([data-annotation-hit])');
      closeTo(Number(await guide.getAttribute('x1')),-35+70*3.4/3.7);
      assert.equal(await page.locator('.gm-annotation-editor:visible').count(),0);
      assert.equal(await page.locator('.gm-region-editor:visible').count(),0);
      const chips=await page.locator('.gm-annotation-select').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.annotationId,width:n.getBoundingClientRect().width})));
      assert.deepEqual(chips.map(b=>b.id),p.graphAnnotations.map(a=>a.id),'Every annotation remains in the shared list');
      assert(chips.every(b=>b.width>0),'Every annotation title is visible');
      await page.locator('[aria-label="표시 2 선택"]').click();
      assert.equal(await page.locator('.gm-annotation-editor:visible').count(),1);
      assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'표시 2 선택');
      await shoot('annotation-selected');
      await page.locator('[aria-label="표시 2 선택"]').click();assert.equal(await page.locator('.gm-annotation-editor:visible').count(),1);
      assert.equal(await page.locator('[aria-label="표시 2 선택"]').getAttribute('aria-pressed'),'true');
      await page.locator('[aria-label="영역 1 화면에서 조절"]').click();assert.equal(await page.locator('.gm-region-editor:visible').count(),1);
      assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'영역 1 화면에서 조절');
      assert.equal(await page.locator('[aria-label="영역 1 level"]').inputValue(),'185');
      assert.equal(await page.locator('[aria-label="영역 1 opacity"]').inputValue(),'0.7','Imported opacity has a rounded display');
      assert.equal(edited.find(o=>o.regionSpec?.id==='r0').regionSpec.opacity,.73,'Display formatting preserves exact imported opacity');
      assert.equal(await page.locator('.gm-region-editor:visible details[open]').count(),0);
      await shoot('region-selected');
      await page.locator('[aria-label="영역 2 화면에서 조절"]').click();assert.equal(await page.locator('.gm-region-editor:visible').count(),1);
      await page.locator('#gm-confirm').click();assert.deepEqual(await snap(),edited,'Selecting details never changes data');
      await page.evaluate(async version=>{const {state}=await import('/js/state.js'+version),io=await import('/js/project-io.js'+version);io.applyLoaded(state,structuredClone(io.serialize(state.get())));},version);
      const loaded=await snap();
      for(const object of edited) for(const key of Object.keys(object)) assert.deepEqual(loaded.find(o=>o.id===object.id)[key],object[key],`Save/reopen preserves ${object.id}.${key}`);
      await open();await page.locator('#gm-confirm').click();assert.deepEqual(await snap(),loaded,'Reopening the normalized project is an exact no-op');
      await open();await advanced();await page.locator('#gm-showgrid').check();
      await change('#gm-gov-xp',.2,'input');await change('#gm-gov-yp',.1,'input');
      await page.locator('#gm-confirm').click();const gridPlane=plane(await snap());
      // Validate actual SVG grid endpoints, not just persisted configuration.
      const lines=await page.evaluate(async ({p,version})=>{
        const {renderCoordplane}=await import('/js/render/coordplane.js'+version);
        return [...renderCoordplane(p).querySelectorAll('line')].filter(l=>l.hasAttribute('stroke-dasharray')&&!l.hasAttribute('data-graph-annotation-shape')).map(l=>['x1','y1','x2','y2'].map(k=>Number(l.getAttribute(k))));
      },{p:gridPlane,version});
      closeTo(Math.max(...lines.map(l=>Math.max(l[0],l[2]))),-35+70*3.2/3.7);
      closeTo(Math.min(...lines.map(l=>Math.min(l[1],l[3]))),25-50*5.1/5.3);
      for(const width of [980,720,480]) {
        await page.setViewportSize({width,height:1000});await open();await page.locator('#gm-tab-annot-btn').click();
        await page.locator('[aria-label="영역 1 화면에서 조절"]').click();
        const overflow=await page.evaluate(()=>['.gm-modal','.gm-right','.gm-region-editor:not([hidden])'].map(s=>{const el=document.querySelector(s);return el.scrollWidth>el.clientWidth+1;}));
        assert.deepEqual(overflow,[false,false,false],`No horizontal overflow at ${width}px`);await shoot(`width-${width}`);await page.locator('#gm-cancel').click();
      }
      assert.deepEqual(errors,[]);reports.push({browser:name,pass:true,providerCalls:0,scenarios:['tick-based interval fallback','old-file exact no-op','arrow cell margins','shared guide/grid overhang','unchanged equations and tick coordinates','compact annotation and region selection','save/reopen','actual SVG grid bounds','980/720/480px layout']});
    } catch(e) {await page.screenshot({path:path.join(output,`${name}-failure.png`)});throw e;} finally {await browser.close();}
  }
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
})().catch(e=>{console.error(e);process.exitCode=1;});
