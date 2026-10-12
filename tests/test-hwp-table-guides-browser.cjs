const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),{PNG}=require('pngjs'),h=require('./helpers/rhwp-exam.cjs');
const out=path.resolve(process.env.EVIDENCE_DIR||'_work/feedback/parts/night-hwp-table-guides');fs.mkdirSync(out,{recursive:true});
h.withServer(async origin=>{for(const [name,engine]of Object.entries({chromium,webkit})){
 const browser=await engine.launch(),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{await h.navigate(page,origin+'/?mode=pro&exam=1&mobile=0');await h.ready(page);await h.action(page,'new');await h.idle(page);
 assert.equal(await page.evaluate(()=>document.querySelector('#exam-studio iframe').contentDocument.querySelector('#sb-message').textContent.includes('로딩')),false,'New waits for native document initialization');
 const initial=await page.evaluate(()=>{const d=document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps,w=d.wasm,t=w.createTable(0,0,0,2,2);window.tableFixture=t;
  for(let i=0;i<4;i++)w.setCellProperties(0,t.paraIdx,t.controlIdx,i,Object.fromEntries(['Left','Right','Top','Bottom'].map(side=>['border'+side,{type:0,width:1,color:'#000000'}])));
  d.eventBus.emit('document-changed');return{show:w.getShowTransparentBorders(),screen:w.renderPageSvg(0),print:w.renderPageSvgWithProfile(0,'print'),props:w.getCellProperties(0,t.paraIdx,t.controlIdx,0)};});
 assert.equal(initial.show,true);assert(initial.screen.includes('stroke="#ff0000"')&&initial.screen.includes('stroke-dasharray="2 2"'));assert(!initial.print.includes('#ff0000'));
 for(const side of ['Left','Right','Top','Bottom'])assert.equal(initial.props['border'+side].type,0,'guides cannot turn into actual table borders');
 await page.evaluate(()=>new Promise(resolve=>{const v=document.querySelector('#exam-studio iframe').contentWindow;v.requestAnimationFrame(()=>v.requestAnimationFrame(resolve));}));
 const shot=path.join(out,name+'-screen.png'),bytes=await page.locator('#exam-studio iframe').screenshot({path:shot}),png=PNG.sync.read(bytes);let red=0;
 for(let i=0;i<png.data.length;i+=4)if(png.data[i]>150&&png.data[i]-png.data[i+1]>35&&png.data[i]-png.data[i+2]>35&&png.data[i+3]>200)red++;
 assert(red>20,'Native editor should paint the red dashed borders on screen');
 const exports=await page.evaluate(()=>{const w=document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.wasm;return{hwp:[...w.exportHwp()],hwpx:[...w.exportHwpx()]};});
 for(const format of ['hwp','hwpx']){const file=path.join(out,name+'-table.'+format);fs.writeFileSync(file,Buffer.from(exports[format]));await h.nativeOpen(page,file);await h.idle(page);
  const loaded=await page.evaluate(()=>{const w=document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.wasm,c=w.getPageControlLayout(0).controls.find(c=>c.type==='table');return{show:w.getShowTransparentBorders(),print:w.renderPageSvgWithProfile(0,'print'),screen:w.renderPageSvg(0),props:w.getCellProperties(c.secIdx,c.paraIdx,c.controlIdx,0)};});
  assert.equal(loaded.show,true);assert(loaded.screen.includes('#ff0000'));assert(!loaded.print.includes('#ff0000'));for(const side of ['Left','Right','Top','Bottom'])assert.equal(loaded.props['border'+side].type,0);
 }
 await h.action(page,'new');await h.idle(page);assert.equal(await page.evaluate(()=>document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.wasm.getShowTransparentBorders()),true);
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,name+'-evidence.json'),JSON.stringify({redPixels:red,printGuideAbsent:true,borderTypes:0,roundtrips:['hwp','hwpx']},null,2));console.log(name+': native red dashed invisible borders, print isolation and HWP/HWPX reopening passed');
 }finally{await browser.close();}
}}).catch(e=>{console.error(e);process.exitCode=1;});
