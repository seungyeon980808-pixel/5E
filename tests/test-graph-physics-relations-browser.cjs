// Fixed graph source: b1846e849656076b1c0c5da2f82abffff3813eb1:tests/test-graph-physics-relations-browser.cjs
// Retained observations with explicitly declared source-context supplements.
// This tests rendering/editing, not AI recognition. No provider requests.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=require('./helpers/graph-source-signals.cjs').loadPlaywright();
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.EVIDENCE_DIR || 'outputs/physics-relations-20261007');
const base=process.env.PREVIEW_URL || 'http://127.0.0.1:62759/';
const ids=['p1_2019_11_09','p1_2020_11_13','p1_2021_11_12','p1_2021_11_13','p1_2022_11_19'];
fs.mkdirSync(out,{recursive:true});
const report={aiCalls:0,provenance:'Retained Sol responses. Wire/charge context supplied explicitly for engine testing; not a fresh automatic restoration.',cases:[]};
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inputFor(id){
  const input=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/graph-physics',id+'-observed.json')));
  if(id==='p1_2020_11_13')input.series[0].physicsModel={kind:'inverse-superposition',power:-1,poles:[0,-.08],reason:'Two wires. Separation .08 is an explicitly estimated relative parameter, not a measured d unit.'};
  if(id==='p1_2022_11_19')for(const s of input.series)s.physicsModel={kind:'inverse-superposition',power:-2,poles:[0,3,5,8],groupId:'net-electric-field',zeroTicks:['2d'],reason:'Source apparatus positions 0,3d,5d,8d and graph zero at 2d. Charge magnitudes are unspecified; relative estimates only.'};
  return input;
}
async function capture(browser,id,objects,source){
  const page=await browser.newPage({viewport:{width:1400,height:1200}}),url=new URL('/__physics_relations_render__',base).href;
  await page.route(url,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/css/style.css"><body></body>'}));
  await page.goto(url);
  const sourceData='data:image/png;base64,'+fs.readFileSync(path.join(root,'assets/exam-library/images',id+'.png')).toString('base64');
  await page.evaluate(async({objects,source,sourceData})=>{
    const v='?v=1.7.0-four-session-integration',{renderCoordplane,renderFuncgraph}=await import('/js/render/coordplane.js'+v);
    const fonts=await(await import('/js/svg-export.js'+v)).ensureEmbeddedFonts();
    const ns='http://www.w3.org/2000/svg',pb=source.plotBox,plane=objects.find(o=>o.type==='coordplane');
    document.body.style.cssText='display:block;margin:0;background:white';
    const boxes=[];
    for(const kind of ['original','restored']){
      const svg=document.createElementNS(ns,'svg');svg.id=kind;
      const style=document.createElementNS(ns,'style');style.textContent=fonts;svg.append(style);
      if(kind==='original'){const im=document.createElementNS(ns,'image');im.setAttribute('href',sourceData);im.setAttribute('width',source.width);im.setAttribute('height',source.height);svg.append(im);}
      else {const g=document.createElementNS(ns,'g');g.setAttribute('transform',`translate(${pb.x} ${pb.y}) scale(${pb.w/plane.w} ${pb.h/plane.h}) translate(${-plane.x} ${-plane.y})`);for(const o of [...objects.filter(o=>o.type!=='coordplane'),plane])g.append(o.type==='coordplane'?renderCoordplane(o):renderFuncgraph(o));svg.append(g);}
      document.body.append(svg);boxes.push(svg);
    }
    await document.fonts.ready;
    const b=boxes[1].getBBox(),x=Math.max(0,Math.min(b.x-10,pb.x-pb.w*.25)),y=Math.max(0,Math.min(b.y-10,pb.y-pb.h*.12));
    const width=Math.max(b.x+b.width+12,pb.x+pb.w*1.08)-x,height=Math.max(b.y+b.height+12,pb.y+pb.h*1.25)-y;
    for(const svg of boxes){svg.setAttribute('viewBox',`${x} ${y} ${width} ${height}`);svg.style.cssText=`display:block;flex:none;width:750px;height:auto;aspect-ratio:${width}/${height};background:white`;}
  },{objects,source,sourceData});
  for(const kind of ['original','restored'])await page.locator('#'+kind).screenshot({path:path.join(out,id+'-'+kind+'.png')});
  fs.writeFileSync(path.join(out,id+'.svg'),await page.locator('#restored').evaluate(s=>s.outerHTML));await page.close();
}
(async()=>{
  for(const [engineName,engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)){
    const browser=await engine.launch({headless:true});
    try{for(const id of ids){
      const row={id,engine:engineName,pass:false};report.cases.push(row);
      const page=await browser.newPage({viewport:{width:1600,height:1100}});
      await page.addInitScript(()=>{localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true');localStorage.setItem('5e.tutorial.bannerSeen','true');});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      const snapshot=()=>page.evaluate(async()=>JSON.parse(JSON.stringify((await import('/js/state.js?v=1.7.0-four-session-integration')).state.get().objects)));
      const open=id=>page.evaluate(async id=>(await import('/js/graph/graph-modal.js?v=1.7.0-four-session-integration')).openGraphModal(id),id);
      try{
        await page.goto(base,{waitUntil:'networkidle'});const skip=page.getByRole('button',{name:'건너뛰기',exact:true});if(await skip.isVisible())await skip.click();
        const r=await page.evaluate(async input=>{
          const v='?v=1.7.0-four-session-integration',{validateGraphPlan}=await import('/js/graph/reconstruction-contract.js'+v),{preferAnalyticGraphPlan}=await import('/js/function-graph/analytic-fit.js'+v);
          const start=validateGraphPlan(input);if(!start.ok)throw Error(JSON.stringify(start.errors));
          const fitted=preferAnalyticGraphPlan(start.plan,{requirePhysics:true}),checked=validateGraphPlan(fitted.plan);if(!checked.ok)throw Error(JSON.stringify(checked.errors));
          const {state}=await import('/js/state.js'+v),native=await import('/js/graph/native-graph.js'+v);state.update(s=>{s.objects=[];s.groups=[];s.selectedIds=[];s.undoStack=[];s.redoStack=[];});
          const pb=checked.plan.source.plotBox,inserted=native.insertNativeGraph(state,checked.plan,{box:{x:-35,y:-35*pb.h/pb.w,w:70,h:70*pb.h/pb.w}});if(!inserted.ok)throw Error(inserted.error);
          const summary=(await import('/js/graph/analytic-summary.js'+v)).summarizeAnalyticGraph(checked.plan);
          return {plan:checked.plan,planeId:inserted.planeId,summary,conversions:fitted.conversions};
        },inputFor(id));
        row.summary=r.summary;row.conversions=r.conversions;
        const original=await snapshot();
        if(engineName==='chromium'){await capture(browser,id,original,r.plan.source);fs.writeFileSync(path.join(out,id+'-plan.json'),JSON.stringify(r.plan,null,2));}
        await open(r.planeId);await page.locator('#gm-confirm').click();assert.deepEqual(await snapshot(),original,'no-op preserves representation');
        const firstExpr=original.find(o=>o.sourceKind==='expression');
        if(firstExpr){
          await open(r.planeId);await page.locator('#gm-tab-func-btn').click();
          const expressionIndex=original.filter(o=>o.type==='funcgraph'&&o.sourceKind!=='region').findIndex(o=>o.id===firstExpr.id);
          assert(expressionIndex>=0,'The expression is present in the complete series list');
          await page.locator(`#gm-chips [data-series-index="${expressionIndex}"]`).click();
          await page.locator('#gm-sub-expr').click();
          assert.equal(await page.locator(`#gm-chips [data-series-index="${expressionIndex}"]`).getAttribute('aria-pressed'),'true','Creation type preserves the selected expression');
          assert.equal(await page.locator('#gm-expr').inputValue(),firstExpr.expr);
          await page.locator('#gm-expr').fill(`(${firstExpr.expr})+0.005`);await page.locator('#gm-expr').dispatchEvent('input');
          await page.screenshot({path:path.join(out,id+'-'+engineName+'-editor.png')});await page.locator('#gm-confirm').click();
          const edited=await snapshot();assert.notDeepEqual(edited.find(o=>o.id===firstExpr.id).mathPoints,firstExpr.mathPoints);
          const beforePlane=original.find(o=>o.type==='coordplane'),afterPlane=edited.find(o=>o.type==='coordplane');
          for(const a of beforePlane.graphAnnotations || [])if(a.seriesId===firstExpr.reconstruction.seriesId && Number.isFinite(a.anchorX)){
            const current=afterPlane.graphAnnotations.find(q=>q.id===a.id),before=['leader','arrow'].includes(a.kind)?a.to:a,after=['leader','arrow'].includes(a.kind)?current.to:current;
            assert(Math.abs(after.y-before.y-.005)<1e-8,'linked annotation follows formula: '+a.id);
          }
          if(id==='p1_2021_11_12'){
            const straight=edited.filter(o=>o.reconstruction?.original?.vertexBindings?.some(b=>b.seriesId===firstExpr.reconstruction.seriesId));assert.equal(straight.length,2);
            for(const line of straight){const before=original.find(o=>o.id===line.id);for(const b of line.reconstruction.original.vertexBindings.filter(b=>b.seriesId===firstExpr.reconstruction.seriesId))assert(Math.abs(line.mathPoints[b.index].y-before.mathPoints[b.index].y-.005)<1e-8,'shared straight endpoint follows');}
            assert.equal(edited.filter(o=>o.type==='funcgraph').flatMap(o=>o.arrowMarks || []).length,4);
          }
          await page.evaluate(async()=>{const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');(await import('/js/transform.js?v=1.7.0-four-session-integration')).undo(state);});assert.deepEqual(await snapshot(),original);
          row.formulaEdit=true;
        }
        const saved=await page.evaluate(async()=>{const v='?v=1.7.0-four-session-integration',{state}=await import('/js/state.js'+v),io=await import('/js/project-io.js'+v);const saved=JSON.parse(JSON.stringify(io.serialize(state.get())));io.applyLoaded(state,saved);return saved;});
        const reloaded=await snapshot();for(const o of original){const now=reloaded.find(q=>q.id===o.id);for(const key of Object.keys(o))assert.deepEqual(now[key],o[key],`reload ${o.id}.${key}`);}
        await open(r.planeId);await page.locator('#gm-confirm').click();assert.deepEqual(await snapshot(),reloaded);
        if(engineName==='chromium')fs.writeFileSync(path.join(out,id+'.5e'),JSON.stringify(saved,null,2));
        assert.deepEqual(errors,[]);row.pass=true;
      }catch(e){row.error=e.stack;await page.screenshot({path:path.join(out,id+'-'+engineName+'-failure.png')});}
      finally{await page.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(row.pass?'PASS':'FAIL',engineName,id,row.error?.split('\n')[0] || '');}
    }}finally{await browser.close();}
  }
  report.pass=report.cases.every(r=>r.pass);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>물리 관계를 우선한 그래프 복원</title><style>body{font:16px system-ui;background:#f2f3f5;color:#161b22;margin:24px}main{max-width:1600px;margin:auto}section{background:white;padding:24px;border-radius:12px;margin:24px 0}.compare{display:grid;grid-template-columns:1fr 1fr;gap:24px}img{width:100%;height:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f3f5;padding:16px}a{color:#0758bf}@media(max-width:800px){.compare{grid-template-columns:1fr}}</style><main><h1>물리 관계를 우선한 그래프 복원</h1><p>신규 AI 호출 0회. 보존된 실제 응답 재처리 + 명시적으로 보충한 물리 구조 입력 검사입니다. 합성 자기장·전기력의 모델 항은 원본 장치를 검토해 보충했습니다. 자동 인식 성공률로 집계하지 않습니다.</p><p>자기장의 도선 간격과 높이, 전기력의 전하 비, PV 과정의 지수는 그림의 상대값입니다. 문제 조건으로 확정한 물리량이 아닙니다. 사인파는 표시된 극대·극소 눈금에서 계산합니다.</p>${report.cases.filter(r=>r.engine==='chromium').map(r=>`<section><h2>${escape(r.id)}</h2><p>${r.pass?'편집·저장·재열기 통과':'검증 실패'}</p><div class="compare"><div><h3>원본 그래프 영역</h3><img src="${r.id}-original.png"></div><div><h3>함수·기본 도형으로 복원</h3><img src="${r.id}-restored.png"></div></div><pre>${escape((r.summary?.lines || [r.error]).join('\n'))}</pre><a href="${r.id}.5e">편집 가능한 5E 파일</a> · <a href="${r.id}-plan.json">식·관계·오차 데이터</a></section>`).join('')}</main></html>`);
  if(!report.pass)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
