// Fixed graph source: b1846e849656076b1c0c5da2f82abffff3813eb1:tests/test-graph-analytic-reference-browser.cjs
/* Source-backed replay, not an AI evaluation. Inputs retain their explicit
 * manual provenance. Outputs are real native objects edited through the UI. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium, webkit} = require('./helpers/graph-source-signals.cjs').loadPlaywright();
const root = path.resolve(__dirname, '..');
const sourceRoot = path.resolve(process.env.GRAPH_SOURCE_ROOT || root);
const output = path.resolve(process.env.OUTPUT_DIR || path.join(root, 'outputs/graph-analytic-20261006'));
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:62759/';
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/graph-engine-coverage/manifest.json')));
fs.mkdirSync(output, {recursive:true});
const report = {aiCalls:0, manualSourceReplay:true, provenance:manifest.manualProvenance, cases:[], pass:false};
const clone = value => JSON.parse(JSON.stringify(value));
const write = () => fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));

async function capture(browser, item, before, after, source) {
  const page = await browser.newPage({viewport:{width:1500,height:1000}});
  const url = new URL('/__analytic_render__',base).href;
  await page.route(url, route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/css/style.css"><body></body>'}));
  await page.goto(url);
  const sourceData = 'data:image/png;base64,'+fs.readFileSync(path.join(sourceRoot,item.sourceFile)).toString('base64');
  await page.evaluate(async({before,after,source,sourceData})=>{
    const {renderCoordplane,renderFuncgraph}=await import('/js/render/coordplane.js?v=1.7.0-four-session-integration');
    const ns='http://www.w3.org/2000/svg',pb=source.plotBox;
    document.body.style.cssText='margin:0;background:white';
    const svgs=[];
    for(const [id,objects] of [['before',before],['after',after]]) {
      const svg=document.createElementNS(ns,'svg'),g=document.createElementNS(ns,'g'),plane=objects.find(o=>o.type==='coordplane');
      svg.id=id;svg.setAttribute('xmlns',ns);
      g.setAttribute('transform',`translate(${pb.x} ${pb.y}) scale(${pb.w/plane.w} ${pb.h/plane.h}) translate(${-plane.x} ${-plane.y})`);
      for(const o of [...objects.filter(o=>o.type!=='coordplane'),plane])g.append(o.type==='coordplane'?renderCoordplane(o):renderFuncgraph(o));
      svg.append(g);document.body.append(svg);svgs.push(svg);
    }
    await document.fonts.ready;
    const boxes=svgs.map(s=>s.getBBox());
    const minX=Math.min(pb.x-pb.w*.35,...boxes.map(b=>b.x-8)),minY=Math.min(pb.y-pb.h*.12,...boxes.map(b=>b.y-8));
    const maxX=Math.max(pb.x+pb.w*1.12,...boxes.map(b=>b.x+b.width+8)),maxY=Math.max(pb.y+pb.h*1.22,...boxes.map(b=>b.y+b.height+8));
    const vb=`${minX} ${minY} ${maxX-minX} ${maxY-minY}`;
    const original=document.createElementNS(ns,'svg'),image=document.createElementNS(ns,'image');
    original.id='original';original.setAttribute('xmlns',ns);image.setAttribute('href',sourceData);image.setAttribute('width',source.width);image.setAttribute('height',source.height);original.append(image);document.body.prepend(original);
    for(const svg of [original,...svgs]){svg.setAttribute('viewBox',vb);svg.style.cssText='display:block;width:650px;height:490px;background:white';}
  },{before,after,source,sourceData});
  for(const id of ['original','before','after'])await page.locator('#'+id).screenshot({path:path.join(output,item.id+'-'+id+'.png')});
  fs.writeFileSync(path.join(output,item.id+'.svg'),await page.locator('#after').evaluate(el=>el.outerHTML));
  await page.close();
}

(async()=>{
  const browser=await chromium.launch({headless:true}),projects=[];
  try {
    for(const item of manifest.cases) {
      const input=JSON.parse(fs.readFileSync(path.join(root,item.planFile))),page=await browser.newPage({viewport:{width:1600,height:1000}});
      const row={id:item.id,checks:[],errors:[]};report.cases.push(row);
      page.on('pageerror',e=>row.errors.push(String(e)));
      const snap=()=>page.evaluate(async()=>cloneObjects((await import('/js/state.js?v=1.7.0-four-session-integration')).state.get().objects));
      const open=id=>page.evaluate(async id=>(await import('/js/graph/graph-modal.js?v=1.7.0-four-session-integration')).openGraphModal(id),id);
      try {
        await page.goto(base,{waitUntil:'networkidle'});
        await page.evaluate(()=>{window.cloneObjects=v=>JSON.parse(JSON.stringify(v));});
        const skip=page.getByRole('button',{name:'건너뛰기',exact:true});if(await skip.isVisible())await skip.click();
        const fitted=await page.evaluate(async input=>(await import('/js/function-graph/analytic-fit.js?v=1.7.0-four-session-integration')).preferAnalyticGraphPlan(input),input);
        row.conversions=fitted.conversions;row.rejected=fitted.rejected;
        const inserted=await page.evaluate(async ({input,plan})=>{
          const {state}=await import('/js/state.js?v=1.7.0-four-session-integration'),native=await import('/js/graph/native-graph.js?v=1.7.0-four-session-integration');
          const box={x:-35,y:-35*plan.source.plotBox.h/plan.source.plotBox.w,w:70,h:70*plan.source.plotBox.h/plan.source.plotBox.w};
          const before=native.buildNativeGraph(input,{box});
          state.update(s=>{s.objects=[];s.groups=[];s.selectedIds=[];s.undoStack=[];s.redoStack=[];});
          const result=native.insertNativeGraph(state,plan,{box});
          return {...result,before:before.objects};
        },{input,plan:fitted.plan});
        assert(inserted.ok,inserted.error);const original=await snap();
        row.representations=original.filter(o=>o.type==='funcgraph').map(o=>({seriesId:o.reconstruction?.seriesId,sourceKind:o.sourceKind,expression:o.expr||null}));
        await capture(browser,item,inserted.before,original,input.source);
        await open(inserted.planeId);
        await page.screenshot({path:path.join(output,item.id+'-editor.png')});
        await page.locator('#gm-confirm').click();assert.deepEqual(await snap(),original,'no-op native editing');
        row.checks.push('No-op preserves every original object field');
        const curve=original.find(o=>o.type==='funcgraph'&&o.sourceKind!=='region');
        await open(inserted.planeId);await page.locator('#gm-tab-func-btn').click();
        if(curve.sourceKind==='expression') {
          await page.locator('#gm-sub-expr').click();assert.equal(await page.locator('#gm-expr').inputValue(),curve.expr);
          await page.locator('#gm-expr').fill(`(${curve.expr})+0.005`);await page.locator('#gm-expr').dispatchEvent('input');
        } else {
          await page.locator(curve.curveStyle==='smooth'?'#gm-sub-free':'#gm-sub-poly').click();
          const pts=clone(curve.mathPoints);pts[Math.floor(pts.length/2)].y+=.005;
          await page.locator('#gm-pts').fill(pts.map(p=>`${p.x},${p.y}`).join(' '));await page.locator('#gm-pts').dispatchEvent('change');
        }
        await page.observeGraphSignal(()=>document.querySelector('#graph-modal-overlay')?.hidden===true, {timeout:5000}, undefined, async () => { await page.locator('#gm-confirm').click(); });
        const edited=await snap();
        assert.notDeepEqual(edited.find(o=>o.id===curve.id).mathPoints,curve.mathPoints,'UI edit changes drawn curve');
        row.checks.push(curve.sourceKind==='expression'?'Formula edited and resampled through existing function UI':'Fallback point curve edited through existing UI');
        for(const action of ['undo','redo','undo']) {
          await page.evaluate(async action=>{const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');(await import('/js/transform.js?v=1.7.0-four-session-integration'))[action](state);},action);
          assert.deepEqual(await snap(),action==='redo'?edited:original);
        }
        const saved=await page.evaluate(async()=>{const {state}=await import('/js/state.js?v=1.7.0-four-session-integration'),io=await import('/js/project-io.js?v=1.7.0-four-session-integration');const saved=JSON.parse(JSON.stringify(io.serialize(state.get())));io.applyLoaded(state,saved);return saved;});
        const reloaded=await snap();for(const object of original){const a=reloaded.find(o=>o.id===object.id);for(const k of Object.keys(object))assert.deepEqual(a[k],object[k],`reopen ${object.id}.${k}`);}
        await open(inserted.planeId);await page.locator('#gm-confirm').click();assert.deepEqual(await snap(),reloaded);
        row.checks.push('Undo, redo, save, reload, and reopened no-op preserve representation');
        saved.pages[0].name=item.id;saved.pages[0].artboard={w:150,h:130};
        fs.writeFileSync(path.join(output,item.id+'.5e'),JSON.stringify(saved,null,2));projects.push(saved);
        row.pass=!row.errors.length;
      } catch(e){row.pass=false;row.error=e.stack;await page.screenshot({path:path.join(output,item.id+'-failure.png')});}
      finally {await page.close();write();console.log(`${row.pass?'PASS':'FAIL'} ${item.id}${row.error?' '+row.error.split('\n')[0]:''}`);}
    }
    if(projects.length===manifest.cases.length)fs.writeFileSync(path.join(output,'editable-eight-graphs.5e'),JSON.stringify({version:projects[0].version,pages:projects.map(p=>p.pages[0]),activePageId:projects[0].pages[0].id},null,2));
  } finally {await browser.close();}
  report.pass=report.cases.length===manifest.cases.length&&report.cases.every(c=>c.pass);write();
  fs.writeFileSync(path.join(output,'index.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>그래프 편집·수식 재현 검증</title><style>body{font:16px system-ui;margin:24px;background:#f5f5f5;color:#171717}main{max-width:1600px;margin:auto}section{padding:20px;background:white;margin:20px 0;border-radius:14px}.comparison{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}img{width:100%;background:white}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f5f5;padding:12px;border-radius:8px}@media(max-width:800px){.comparison{grid-template-columns:1fr}}</style><main><h1>그래프 편집·수식 재현 검증</h1><p>기존 기준 입력을 다시 그린 결과입니다. 신규 AI 복원 결과가 아닙니다. AI 호출 0회.</p><p>단순 수식이 허용 오차·극값·교점을 통과하면 수식을 편집 원본으로 사용합니다. 통과하지 못한 곡선과 산점도는 점 편집을 유지합니다.</p><a href="editable-eight-graphs.5e">8개 그래프 5E 문서</a>${report.cases.map((c,i)=>`<section><h2>${i+1}. ${c.id}</h2><p>${c.pass?'편집·저장·재열기 통과':'검증 실패'} · 수식 ${c.conversions?.length||0}개</p><div class="comparison">${[['original','원본 그래프 영역'],['before','기존 점 기반 재현'],['after','수식 우선 재현']].map(([key,label])=>`<div><h3>${label}</h3><img src="${c.id}-${key}.png" alt="${label}"></div>`).join('')}</div><pre>${(c.representations||[]).filter(s=>s.expression).map(s=>`${s.seriesId}: ${s.expression}`).join('\n')||'단순 수식 기준을 통과한 곡선 없음'}</pre><a href="${c.id}.5e">편집 가능한 5E 문서</a> · <a href="${c.id}-editor.png">편집 화면</a></section>`).join('')}</main></html>`);
  // The same native expression source must reopen in Safari's browser engine.
  if(report.pass) {
    const browser=await webkit.launch({headless:true});
    try {
      const page=await browser.newPage({viewport:{width:1440,height:1000}});
      await page.addInitScript(()=>{localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true');localStorage.setItem('5e.tutorial.bannerSeen','true');});
      await page.goto(base,{waitUntil:'networkidle'});
      const skip=page.getByRole('button',{name:'건너뛰기',exact:true});if(await skip.isVisible())await skip.click();
      const chosen=report.cases.find(c=>c.representations.some(s=>s.sourceKind==='expression')) || report.cases[0];
      const saved=JSON.parse(fs.readFileSync(path.join(output,chosen.id+'.5e')));
      const expression=chosen.representations.some(s=>s.sourceKind==='expression');
      await page.evaluate(async saved=>{const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');(await import('/js/project-io.js?v=1.7.0-four-session-integration')).applyLoaded(state,saved);const p=state.get().objects.find(o=>o.type==='coordplane');(await import('/js/graph/graph-modal.js?v=1.7.0-four-session-integration')).openGraphModal(p.id);},saved);
      await page.locator('#gm-tab-func-btn').click();
      if(expression){await page.locator('#gm-sub-expr').click();assert(await page.locator('#gm-expr').isVisible());assert((await page.locator('#gm-expr').inputValue()).length);}
      else{assert(await page.locator('#gm-pts').isVisible());assert((await page.locator('#gm-pts').inputValue()).length);}
      await page.screenshot({path:path.join(output,'webkit-formula-editor.png')});report.webkitReopen=true;write();
    }finally{await browser.close();}
  }
  if(!report.pass)process.exitCode=1;
})().catch(e=>{report.pass=false;report.error=e.stack;write();console.error(e);process.exitCode=1;});
