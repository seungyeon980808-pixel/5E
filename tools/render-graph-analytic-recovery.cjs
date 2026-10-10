/** Render the same retained observations before/after the analytic change.
 * Uses the production renderer/exporter. No remote models or manual corrections. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'outputs/graph-editor-design/analytic-recovery-20261009/replay-20');
const report=JSON.parse(fs.readFileSync(path.join(out,'results.json')));
const base=process.env.PREVIEW_URL||'http://127.0.0.1:8797/preview/',v='?v=1.7.0-four-session-integration';
(async()=>{
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],records=[];
 page.on('pageerror',e=>errors.push(String(e)));
 try{
  await page.route('**/*',route=>{const url=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(url.hostname)||['data:','blob:'].includes(url.protocol)?route.continue():route.abort();});
  await page.addInitScript(()=>{localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true');localStorage.setItem('5e.tutorial.bannerSeen','true');});
  await page.goto(base+'?mode=pro',{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
  for(const c of report.cases)for(const name of ['before','after']){
   if(!c[name].previewAvailable)continue;
   const dir=path.join(out,c.id,name),objects=JSON.parse(fs.readFileSync(path.join(dir,'native-objects.json')));
   const data=await page.evaluate(async({objects,v})=>{
    const {state}=await import('./js/state.js'+v),io=await import('./js/project-io.js'+v),{renderObject}=await import('./js/render/scene.js'+v),{buildExportSvg}=await import('./js/svg-export.js'+v);
    io.applyLoaded(state,{schemaVersion:'0.17',version:'0.17',objects,guides:[],artboard:{w:210,h:297}});
    const s=state.get(),holder=document.createElementNS('http://www.w3.org/2000/svg','svg');
    holder.setAttribute('width','3000');holder.setAttribute('height','3000');holder.style.position='absolute';holder.style.left='-10000px';document.body.append(holder);
    for(const o of s.objects)holder.append(renderObject(o,s.objects));const b=holder.getBBox(),bounds={x:b.x-2,y:b.y-2,w:b.width+4,h:b.height+4};holder.remove();
    const svg=buildExportSvg(s,bounds);svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
    const board=document.createElement('div');board.id='analytic-evidence-board';Object.assign(board.style,{position:'fixed',left:'0',top:'0',zIndex:'999999',background:'#fff',width:'850px'});svg.style.width='850px';svg.style.height=(850*bounds.h/bounds.w)+'px';board.append(svg);document.body.append(board);
    return {svg:svg.outerHTML.replace(/ style="[^"]*"/g,''),project:io.serialize(s),labels:[...svg.querySelectorAll('text')].map(t=>t.textContent),bounds,expressions:s.objects.filter(o=>o.type==='funcgraph').map(o=>({seriesId:o.reconstruction?.seriesId,kind:o.sourceKind,expression:o.expr||null}))};
   },{objects,v});
   assert(data.bounds.w>0&&data.bounds.h>0,'Finite native bounds');assert(!data.svg.includes('<image'),'Native vector graph');
   fs.writeFileSync(path.join(dir,'graph.svg'),data.svg);fs.writeFileSync(path.join(dir,'automatic.5e'),JSON.stringify(data.project,null,2));
   await page.locator('#analytic-evidence-board').screenshot({path:path.join(dir,'graph.png')});await page.locator('#analytic-evidence-board').evaluate(el=>el.remove());
   records.push({id:c.id,stage:name,bounds:data.bounds,labels:data.labels,expressions:data.expressions});console.log('RENDER '+c.id+'/'+name);
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'render-validation.json'),JSON.stringify({pass:true,modelCalls:0,manualCorrections:0,records,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
