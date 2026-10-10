import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out=process.env.EVIDENCE_DIR; assert(out,'EVIDENCE_DIR required'); fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1200,height:650}});
 const base=process.env.RELEASE_URL || process.env.PREVIEW_URL || 'http://127.0.0.1:64826';
 await page.route('**/__render_probe',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body><svg id="stage" width="1100" height="600" viewBox="-20 -20 180 100"></svg></body></html>'}));
 await page.goto(`${base}/__render_probe`);
 const result=await page.evaluate(async()=>{
  const {renderCoordplane,renderFuncgraph,bezierSamplePts}=await import('/js/render/coordplane.js?v=1.7.0-four-session-integration');
  const {renderGraphLabel,measureGraphLabel}=await import('/js/render/graph-label.js?v=1.7.0-four-session-integration');
  const stage=document.querySelector('#stage');
  const p={id:'probe',type:'coordplane',x:0,y:0,w:100,h:60,xMin:0,xMax:4,yMin:-100,yMax:40,gridStepX:1,gridStepY:20,axisVariant:'cross',showAxisLines:true,showTickLabels:true,richLabels:true,labelX:'시간 (ms)',labelY:'막전위',labelSize:3.5,labelWeight:700,axisPlacement:{x:{mode:'fraction',value:0},y:{mode:'fraction',value:0}},graphAnnotations:[{id:'a',kind:'text',x:1,y:30,text:'α',fontSize:5,fontWeight:300},{id:'stimulus',kind:'arrow',x:0.2,y:-120,to:{x:0.2,y:-101},strokeWidth:0.2},{id:'leader',kind:'leader',x:3,y:30,to:{x:2.8,y:20}}]};
  const g=renderCoordplane(p);stage.append(g);
  const axisBottom=[...g.querySelectorAll('line')].some(l=>+l.getAttribute('y1')===60&&+l.getAttribute('y2')===60&&+l.getAttribute('x2')>90);
  const a=g.querySelector('[data-graph-annotation="a"] text');
  const f={id:'f',type:'funcgraph',points:[{x:0,y:40},{x:30,y:20},{x:60,y:30}],handles:[{inX:0,inY:40,outX:10,outY:0},{inX:20,inY:0,outX:40,outY:10},{inX:50,inY:10,outX:60,outY:30}],segmentModes:['line','smooth'],strokeWidth:0.4};
  const fg=renderFuncgraph(f);stage.append(fg);const d=fg.querySelector('path').getAttribute('d');
  const samples=bezierSamplePts(f.points,f.handles,16,f.segmentModes);
  const thin=renderGraphLabel('한글 ABC',{x:110,y:10,size:5,weight:300});const bold=renderGraphLabel('한글 ABC',{x:110,y:20,size:5,weight:700});stage.append(thin,bold);
  const fraction=renderGraphLabel('\\frac{1}{18}',{x:110,y:40,size:5,weight:400});stage.append(fraction);
  // Source-reviewed wave: observed min/max are display coordinates, while
  // horizontal axis is at observed zero displacement (0.4571 of source height).
  const wave={...p,id:'wave',xMin:0,xMax:1,yMin:0,yMax:1,gridStepX:0.25,gridStepY:0.25,showTicks:true,showGrid:true,axisVariant:'quadrant',coordinateMode:'observed',axisPlacement:{x:{mode:'fraction',value:0.4571},y:{mode:'fraction',value:0.25}},graphAnnotations:[]};
  const waveG=renderCoordplane(wave);
  const linesOf=g=>[...g.querySelectorAll('line')].map(l=>['x1','y1','x2','y2'].map(a=>+l.getAttribute(a)));
  const waveLines=linesOf(waveG);
  const waveVerticalFull=waveLines.some(([x1,y1,x2,y2])=>x1===25&&x2===25&&y1===60&&y2<1.1);
  const waveHorizontalFull=waveLines.some(([x1,y1,x2,y2])=>x1===0&&x2>98&&Math.abs(y1-32.574)<1e-8&&y1===y2);
  const legacyG=renderCoordplane({...wave,axisPlacement:undefined,coordinateMode:undefined});
  const zeroG=renderCoordplane({...wave,axisPlacement:{x:{mode:'zero'},y:{mode:'zero'}},coordinateMode:undefined});
  const legacyGridTicksUnchanged=JSON.stringify(linesOf(zeroG))===JSON.stringify(linesOf(legacyG));
  const legacyAxes=linesOf(legacyG).filter(([x1,y1,x2,y2])=>(x1===0&&x2===0)||(y1===60&&y2===60));
  const triangle={type:'funcgraph',sourceKind:'points',points:[{x:0,y:0},{x:10,y:0},{x:5,y:10}],breaks:[],strokeWidth:0.2};
  const pathOf=o=>renderFuncgraph(o).querySelector('path').getAttribute('d');
  const closures={open:pathOf(triangle),closed:pathOf({...triangle,closed:true}),broken:pathOf({...triangle,closed:true,breaks:[2]}),repeat:pathOf({...triangle,closed:true,points:[...triangle.points,triangle.points[0]]}),smooth:pathOf({...f,closed:true}),line:pathOf({...f,closed:true,segmentModes:['line','smooth','line']})};
  return {legacyGridTicksUnchanged,waveVerticalFull,waveHorizontalFull,waveLines,legacyAxes,closures,annotationShapes:g.querySelectorAll('[data-graph-annotation-shape]').length,axisBottom,path:d,lineSampleExact:samples[1].x===30&&samples[1].y===20,annotationWeight:a?.getAttribute('font-weight'),thinWeights:[...thin.querySelectorAll('text')].map(t=>t.getAttribute('font-weight')),boldWeights:[...bold.querySelectorAll('text')].map(t=>t.getAttribute('font-weight')),thinWidth:measureGraphLabel('한글 ABC',5,false,300).w,boldWidth:measureGraphLabel('한글 ABC',5,false,700).w,fractionLines:fraction.querySelectorAll('line').length};
 });
 await page.screenshot({path:path.join(out,'render-probe.png')});
 const chemistrySource = process.env.GRAPH_LABEL_VALIDATION
  ? JSON.parse(fs.readFileSync(process.env.GRAPH_LABEL_VALIDATION,'utf8')).plan.axes.y.displayMath
  : String.raw`\frac{[\mathrm{HA}]}{[\mathrm{A}^{-}]}\;\text{또는}\;\frac{[\mathrm{HB}]}{[\mathrm{B}^{-}]}`;
 const labelResult = await page.evaluate(async chemistrySource => {
  const {renderGraphLabel,measureGraphLabel}=await import('/js/render/graph-label.js?v=1.7.0-four-session-integration');
  const stage=document.querySelector('#stage');stage.replaceChildren();stage.setAttribute('viewBox','-5 -10 110 75');
  const sources=[chemistrySource,String.raw`\frac{1}{\text{물질파 파장}}`,String.raw`x+\frac{\mathrm{A}_{0}}{\text{물의 질량}}+\mathrm{\frac{B}{C}}`,String.raw`\frac{1}{물질파 파장}`];
  return sources.map((source,i)=>{
   const g=renderGraphLabel(source,{x:0,y:i*15,size:6,halo:false});stage.appendChild(g);
   const measured=measureGraphLabel(source,6),box=g.getBBox();
   const end=renderGraphLabel(source,{x:0,y:0,size:6,halo:false,anchor:'end'});
   return {source,text:g.textContent,lines:g.querySelectorAll('line').length,width:measured.w,bbox:{x:box.x,y:box.y,w:box.width,h:box.height},endTransform:end.firstChild.getAttribute('transform'),glyphs:[...g.querySelectorAll('text')].map(t=>({text:t.textContent,style:t.getAttribute('font-style'),family:t.getAttribute('font-family')}))};
  });
 },chemistrySource);
 fs.writeFileSync(path.join(out,'latex-label-results.json'),JSON.stringify(labelResult,null,2));await page.screenshot({path:path.join(out,'latex-labels.png')});
 assert.equal(labelResult[0].lines,2);assert.equal(labelResult[0].text,'[HA][A-]또는[HB][B-]');
 assert.equal(labelResult[1].lines,1);assert.equal(labelResult[1].text,'1물질파 파장');
 assert.equal(labelResult[3].lines,1);assert.equal(labelResult[3].text,'1물질파 파장');
 assert.equal(labelResult[2].lines,2);assert.equal(labelResult[2].text,'x+A0물의 질량+BC');
 for(const item of labelResult){assert(!/mathrm|text|frac|[{};]/.test(item.text));assert(item.width>0&&Number.isFinite(item.width));assert(item.bbox.w<item.width+2);assert(item.endTransform.startsWith(`translate(${-item.width},`));}
 assert(labelResult[0].glyphs.filter(g=>/[HAB]/.test(g.text)).every(g=>g.style==='normal'));
 assert(labelResult[2].glyphs.some(g=>g.text.includes('x')&&g.style==='italic'));
 assert.equal(labelResult[0].source,chemistrySource);
 fs.writeFileSync(path.join(out,'latex-label-report.json'),JSON.stringify({pass:true,actualResponsePath:process.env.GRAPH_LABEL_VALIDATION||null,sourceSha256:createHash('sha256').update(chemistrySource).digest('hex'),cases:labelResult.length,artifacts:['latex-labels.png','latex-label-results.json'],invocation:process.argv},null,2));
 fs.writeFileSync(path.join(out,'render-results.json'),JSON.stringify(result,null,2));
 assert(result.legacyGridTicksUnchanged);assert(result.waveVerticalFull);assert(result.waveHorizontalFull);assert(result.legacyAxes.some(([x1,y1,x2,y2])=>x1===0&&x2===0&&y1===60));
 assert(!result.closures.open.endsWith('Z'));assert(result.closures.closed.endsWith('Z'));assert(!result.closures.broken.endsWith('Z'));assert(result.closures.repeat.endsWith('Z'));assert.match(result.closures.smooth,/C 60 30 0 40 0 40 Z$/);assert.match(result.closures.line,/60 30 Z$/);
 assert.equal(result.annotationShapes,2);assert.equal(result.axisBottom,true);assert.match(result.path,/ L 30 20 C /);assert(result.lineSampleExact);assert.equal(result.annotationWeight,'300');assert(result.thinWeights.every(w=>w==='300'));assert(result.boldWeights.every(w=>w==='700'));assert(result.boldWidth>result.thinWidth);assert(result.fractionLines>0);console.log(JSON.stringify(result,null,2));
} finally {await browser.close();}
