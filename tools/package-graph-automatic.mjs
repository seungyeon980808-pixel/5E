/** Package unchanged authenticated graph observations; never calls a provider. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { parseGraphPlanResponse } from '../js/graph/reconstruction-contract.js';

const root = path.resolve(import.meta.dirname, '..');
if (!process.env.GRAPH_AUTOMATIC_BATCH_EVIDENCE || !process.env.OUTPUT_DIR) throw Error('GRAPH_AUTOMATIC_BATCH_EVIDENCE and OUTPUT_DIR required');
const input = path.resolve(process.env.GRAPH_AUTOMATIC_BATCH_EVIDENCE), out = path.resolve(process.env.OUTPUT_DIR);
const url = process.env.PREVIEW_URL || 'http://127.0.0.1:64826/preview/', origin = new URL(url).origin;
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const batch = JSON.parse(fs.readFileSync(path.join(input, 'results.json')));
assert.equal(batch.manualPlanCorrections, 0);
const requested=process.env.GRAPH_DELIVERY_CASE_FILTER?.split(',');
if(requested&&(!requested.length||new Set(requested).size!==requested.length||requested.some(id=>!batch.results.some(c=>c.id===id))))throw Error('Invalid delivery case filter');
const cases=requested?batch.results.filter(c=>requested.includes(c.id)):batch.results;
const titles = ['압력·부피 두 곡선', '박스형 점 그래프', '상평형 곡선', '로그 눈금 광도 그래프', '기압 곡선과 회색 강조 띠', '풍속·풍향 이중축 산점도', '광전류 포화 곡선', '중력의 크기와 반복 곡선'];
const report = { schema:'5e.graph-automatic-delivery/v1', actualModelCalls: batch.requestCount, manualPlanCorrections:0, rasterGenerationCalls:0, desktopProviderEndToEnd:false, visualAcceptance:false, cases:[], errors:[] };
const projects = [];
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));
fs.mkdirSync(out, { recursive:true });
const canonical = value => JSON.parse(JSON.stringify(value));
const browser = await chromium.launch({ headless:true });
try {
  for (const [index, c] of cases.entries()) {
    const caseDir = path.join(input, c.id), target = path.join(out, c.id);
    fs.mkdirSync(target, { recursive:true });
    fs.copyFileSync(path.join(caseDir, 'source.png'), path.join(target, 'source.png'));
    const attempts = fs.readdirSync(caseDir).filter(name => /^attempt-\d+$/.test(name)).sort((a,b)=>Number(a.slice(8))-Number(b.slice(8)));
    const candidates = attempts.flatMap(name => {
      const dir=path.join(caseDir,name), file=path.join(dir,'validation.json');
      if (!fs.existsSync(file)) return [];
      const checked=JSON.parse(fs.readFileSync(file));
      if (!checked.ok || checked.blocked || !fs.existsSync(path.join(dir,'native-render.png'))) return [];
      const parsed=parseGraphPlanResponse(fs.readFileSync(path.join(dir,'response.txt'),'utf8'), {source:checked.plan.source});
      assert.equal(parsed.ok,true); assert.deepEqual(parsed.plan,checked.plan,'Delivery must use unchanged provider JSON');
      const hash='sha256:'+crypto.createHash('sha256').update(fs.readFileSync(path.join(caseDir,'source.png'))).digest('hex');
      assert.equal(checked.plan.source.hash,hash);
      return [{name,dir,plan:checked.plan}];
    });
    const initialDir=path.join(caseDir,'attempt-1'),initialChecked=JSON.parse(fs.readFileSync(path.join(initialDir,'validation.json')));
    const initial={name:'attempt-1',dir:initialDir,plan:initialChecked.plan,rendered:candidates.some(x=>x.name==='attempt-1'),errors:initialChecked.errors};
    const r={id:c.id,index:index+1,title:titles[index]||c.id,attemptCount:attempts.length,first:initial.name,firstRendered:initial.rendered,firstErrors:initial.errors,final:candidates.at(-1)?.name||null,editingPass:false,checks:[],errors:[]};
    report.cases.push(r);
    if (!candidates.length) {r.error='No valid rendered candidate'; continue;}
    const first=initial, final=candidates.at(-1);
    for(const [name, candidate] of [['first',first],['final',final]]) {
      write(path.join(target,name+'-plan.json'),candidate.plan);
      fs.copyFileSync(path.join(candidate.dir,'response.txt'),path.join(target,name+'-response.txt'));
      if(fs.existsSync(path.join(candidate.dir,'native-render.svg')))fs.copyFileSync(path.join(candidate.dir,'native-render.svg'),path.join(target,name+'.svg'));
    }
    const render=await browser.newPage({viewport:{width:2100,height:850}});
    try {
      await render.route(origin+'/__automatic_report__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/preview/css/style.css"><body></body>'}));
      await render.goto(origin+'/__automatic_report__');
      const pictures=await render.evaluate(async({first,final,dataUrl,firstRendered})=>{
        const {buildNativeGraph}=await import('/preview/js/graph/native-graph.js?v=1.7.0-four-session-integration');
        const {renderCoordplane,renderFuncgraph}=await import('/preview/js/render/coordplane.js?v=1.7.0-four-session-integration');
        const ns='http://www.w3.org/2000/svg',make=()=>document.createElementNS(ns,'svg');
        document.body.style.cssText='margin:0;background:white';
        const frames=[];
        for(const [id,p] of [['first',first||final],['final',final]]) {
          const pb=p.source.plotBox,n=buildNativeGraph(p,{box:{x:0,y:0,w:70,h:70*pb.h/pb.w}});
          if(!n.ok&&id==='final')throw Error(n.error);
          if(id==='first'&&!firstRendered){const svg=make();svg.id=id;document.body.append(svg);frames.push(svg);continue;}
          const plane=n.objects.find(o=>o.type==='coordplane'),svg=make(),g=document.createElementNS(ns,'g');
          svg.id=id;g.setAttribute('transform',`translate(${pb.x} ${pb.y}) scale(${pb.w/plane.w} ${pb.h/plane.h})`);
          for(const o of [...n.objects.filter(o=>o.type!=='coordplane'),plane])g.append(o.type==='coordplane'?renderCoordplane(o):renderFuncgraph(o));
          svg.append(g);document.body.append(svg);frames.push(svg);
        }
        await document.fonts.ready;
        const source=final.source,pb=(first?.source?.plotBox||source.plotBox),boxes=frames.filter(svg=>svg.childElementCount).map(svg=>svg.getBBox());
        const x=Math.min(pb.x-pb.w*.35,...boxes.map(b=>b.x-8)),y=Math.min(pb.y-pb.h*.12,...boxes.map(b=>b.y-8));
        const right=Math.max(pb.x+pb.w*1.16,...boxes.map(b=>b.x+b.width+8)),bottom=Math.max(pb.y+pb.h*1.22,...boxes.map(b=>b.y+b.height+8));
        const vb=`${x} ${y} ${right-x} ${bottom-y}`;
        const original=make(),image=document.createElementNS(ns,'image');original.id='original';image.setAttribute('href',dataUrl);image.setAttribute('width',source.width);image.setAttribute('height',source.height);original.append(image);document.body.prepend(original);
        for(const svg of [original,...frames]){svg.setAttribute('xmlns',ns);svg.setAttribute('viewBox',vb);svg.style.cssText='display:inline-block;width:680px;height:540px;background:white';}
        const plane=(buildNativeGraph(final,{box:{x:0,y:0,w:70,h:70*final.source.plotBox.h/final.source.plotBox.w}})).objects.find(o=>o.type==='coordplane');
        const svg=frames[1];const b=svg.getBBox();
        return {viewBox:vb,artboard:{w:Math.ceil(Math.max(90,(b.width/final.source.plotBox.w)*plane.w+14)),h:Math.ceil(Math.max(60,(b.height/final.source.plotBox.h)*plane.h+14))}};
      },{first:first.plan,final:final.plan,firstRendered:first.rendered,dataUrl:'data:image/png;base64,'+fs.readFileSync(path.join(caseDir,'source.png')).toString('base64')});
      r.viewBox=pictures.viewBox;
      for(const id of ['original','first','final'])await render.locator('#'+id).screenshot({path:path.join(target,id+'.png')});
      if(!first.rendered){await render.setContent('<main id="failure" style="box-sizing:border-box;width:680px;height:540px;padding:70px 40px;font:20px sans-serif;background:white"><h2>최초 응답: 그래프 생성 실패</h2><p>구조 검증을 통과하지 못해 그릴 수 없습니다.</p><pre style="white-space:pre-wrap;font-size:16px"></pre></main>');await render.locator('pre').evaluate((el,errors)=>{el.textContent=errors.map(e=>e.path+': '+e.message).join('\n');},first.errors||[]);await render.locator('#failure').screenshot({path:path.join(target,'first.png')});}
      r.artboard=pictures.artboard;
    } finally {await render.close();}
    const page=await browser.newPage({viewport:{width:1660,height:1100}});
    page.on('pageerror',e=>r.errors.push(String(e)));
    const snap=()=>page.evaluate(async()=>JSON.parse(JSON.stringify((await import('/preview/js/state.js?v=1.7.0-four-session-integration')).state.get().objects)));
    const open=id=>page.evaluate(async id=>(await import('/preview/js/graph/graph-modal.js?v=1.7.0-four-session-integration')).openGraphModal(id),id);
    try {
      await page.goto(url,{waitUntil:'networkidle'});const skip=page.getByRole('button',{name:'건너뛰기',exact:true});if(await skip.isVisible())await skip.click();
      const inserted=await page.evaluate(async({p,caseId,artboard})=>{
        const {state}=await import('/preview/js/state.js?v=1.7.0-four-session-integration');
        state.update(s=>{s.objects=[];s.groups=[];s.undoStack=[];s.redoStack=[];s.selectedIds=[];s.targetedId=null;s.viewBox={x:-85,y:-70,w:170,h:140};s.pages=[{...s.pages[0],id:'auto-'+caseId,name:caseId,objects:[],guides:[],artboard}];s.activePageId='auto-'+caseId;s.artboard=artboard;});
        const h=70*p.source.plotBox.h/p.source.plotBox.w;
        return(await import('/preview/js/graph/native-graph.js?v=1.7.0-four-session-integration')).insertNativeGraph(state,p,{box:{x:-35,y:-h/2,w:70,h}});
      },{p:final.plan,caseId:c.id,artboard:r.artboard});
      assert.equal(inserted.ok,true,inserted.error);const before=canonical(await snap());
      await page.waitForFunction(id=>!!document.querySelector(`#scene [data-id="${id}"]`),inserted.planeId);
      const hit=await page.evaluate(id=>{const rect=document.querySelector(`#scene [data-id="${id}"]>rect`),m=document.querySelector('#scene').getScreenCTM();const x=+rect.getAttribute('x')+4,y=+rect.getAttribute('y')+4;return{x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f};},inserted.planeId);
      await page.mouse.dblclick(hit.x,hit.y,{delay:80});await page.waitForFunction(()=>document.querySelector('#graph-modal-overlay')?.hidden===false,{timeout:5000});
      await page.screenshot({path:path.join(target,'editor.png')});await page.locator('#gm-confirm').click();await page.waitForFunction(()=>document.querySelector('#graph-modal-overlay')?.hidden===true);
      assert.deepEqual(await snap(),before);r.checks.push('physical doubleclick; no-op exact');
      const curve=before.find(o=>o.type==='funcgraph'&&o.sourceKind!=='region'&&o.mathPoints?.length);assert(curve,'Editable point series required');
      const pts=canonical(curve.mathPoints),i=Math.floor(pts.length/2);pts[i].y+=Math.max(Math.abs(pts[i].y)*.001,.0001);
      await open(inserted.planeId);await page.locator('#gm-tab-func-btn').click();await page.locator(curve.curveStyle==='smooth'?'#gm-sub-free':'#gm-sub-poly').click();
      await page.locator('#gm-pts').fill(pts.map(p=>`${p.x},${p.y}`).join(' '));await page.locator('#gm-pts').dispatchEvent('change');await page.locator('#gm-confirm').click();await page.waitForFunction(()=>document.querySelector('#graph-modal-overlay')?.hidden===true);
      const edited=await snap();assert.deepEqual(edited.find(o=>o.id===curve.id).mathPoints,pts);
      for(const other of before.filter(o=>o.type==='funcgraph'&&o.id!==curve.id))assert.deepEqual(edited.find(o=>o.id===other.id),other);
      r.checks.push('data edit applied; unrelated series exact');
      for(const action of ['undo','redo','undo']){await page.evaluate(async action=>{const{state}=await import('/preview/js/state.js?v=1.7.0-four-session-integration');(await import('/preview/js/transform.js?v=1.7.0-four-session-integration'))[action](state);},action);assert.deepEqual(await snap(),action==='redo'?edited:before);}
      r.checks.push('undo/redo; original restored');
      const saved=await page.evaluate(async()=>{const{state}=await import('/preview/js/state.js?v=1.7.0-four-session-integration'),io=await import('/preview/js/project-io.js?v=1.7.0-four-session-integration');const saved=structuredClone(io.serialize(state.get()));state.update(s=>{s.objects=[];s.groups=[];});io.applyLoaded(state,saved);return saved;});
      const reloaded=await snap();for(const object of before){const loaded=reloaded.find(o=>o.id===object.id);assert(loaded);for(const key of Object.keys(object))assert.deepEqual(loaded[key],object[key]);}
      await open(inserted.planeId);await page.locator('#gm-confirm').click();await page.waitForFunction(()=>document.querySelector('#graph-modal-overlay')?.hidden===true);assert.deepEqual(await snap(),reloaded);
      saved.graphVerification={automaticModelObservation:true,manualPlanCorrections:0,editingPass:true,visualAcceptance:false,caseId:c.id,attempt:final.name};
      write(path.join(target,'editable-graph.5e'),saved);projects.push(saved);r.checks.push('serialize/clear/load/reopen unchanged');r.editingPass=true;
    } catch(error){r.error=error.stack;await page.screenshot({path:path.join(target,'editing-failure.png')});}
    finally{await page.close();write(path.join(out,'delivery-verification.json'),report);}
    console.log(`${r.editingPass?'PASS':'FAIL'} ${c.id}`);
  }
  if(projects.length)write(path.join(out,'editable-graphs.5e'),{version:projects[0].version,pages:projects.flatMap(p=>p.pages),activePageId:projects[0].activePageId,graphVerification:{automaticModelObservation:true,manualPlanCorrections:0,editingPass:projects.length===batch.results.length,visualAcceptance:false}});
} finally {await browser.close();write(path.join(out,'delivery-verification.json'),report);}
if(report.cases.some(c=>!c.editingPass||c.errors.length))process.exitCode=1;
