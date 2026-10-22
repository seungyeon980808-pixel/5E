const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
const root=path.resolve(__dirname,'..');
const evidence=path.resolve(process.env.EVIDENCE_DIR||path.join(root,'_work/canvas-handoff-race'));
fs.mkdirSync(evidence,{recursive:true});

h.withServer(async origin=>{for(const [name,engine]of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)){
 const browser=await engine.launch(),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],alerts=[],proof=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('dialog',async dialog=>{alerts.push(dialog.message());await dialog.dismiss();});
 try{
  for(const [file,method,wrapper]of[
   ['image-cutout.js','renderCanvasImageForAi',`export async function renderCanvasImageForAi(object){const data=await observedRender(object);const gate=window.__handoffGate;if(gate){gate.data=data;gate.entered.resolve();await gate.release.promise;}return data;}`],
   ['ai-canvas-handoff.js','handSelectedCanvasImageToAi',`export async function handSelectedCanvasImageToAi(...args){const result=await observedRender(...args);window.__handoffResult=result;return result;}`],
  ]){
   const source=fs.readFileSync(path.join(root,'js',file),'utf8'),seam='export async function '+method+'(';
   assert.equal(source.split(seam).length-1,1,'exact pass-through observation boundary');
   await page.route('**/js/'+file+'?*',route=>route.fulfill({contentType:'text/javascript',body:source.replace(seam,'async function observedRender(')+'\n'+wrapper}));
  }
  await h.navigate(page,origin+'/?mode=pro&mobile=0&exam=0');await h.ready(page);
  for(const kind of ['crop','rotation','opacity','aspect','visibility','link','crop-back','stale-error','pan']){
   await page.evaluate(async()=>{
    const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');
    const canvas=document.createElement('canvas');canvas.width=100;canvas.height=60;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,100,60);ctx.fillStyle='#111';ctx.fillRect(10,10,70,30);
    state.update(s=>{s.objects=[{id:'pending-image',type:'image',src:canvas.toDataURL(),x:-20,y:-12,w:40,h:24,rotation:0,opacity:1,layerId:1}];s.selectedIds=['pending-image'];s.layers=[{id:1,name:'Layer',visible:true}];s.imageEditSession=null;});
    window.__handoffResult=null;window.__handoffGate={entered:Promise.withResolvers(),release:Promise.withResolvers()};
   });
   await page.locator('#ai-image-install-open').click();
   await page.evaluate(()=>__handoffGate.entered.promise);
   const captured=await page.evaluate(()=>__handoffGate.data);assert.match(captured,/^data:image\/png;base64,/);
   await page.evaluate(async kind=>{
    const {state}=await import('/js/state.js?v=1.7.0-four-session-integration'),image=state.get().objects[0];
    state.update(s=>{const o=s.objects[0];
     if(kind==='crop'||kind==='crop-back'||kind==='stale-error')o.srcRect={x:.5,y:0,w:.5,h:1};
     if(kind==='rotation')o.rotation=90;if(kind==='opacity')o.opacity=.2;if(kind==='aspect')o.w=60;
     if(kind==='visibility')s.layers[0].visible=false;if(kind==='link')o.aiTaskId='changed-owner';
     if(kind==='pan')s.viewBox={...s.viewBox,x:s.viewBox.x+10};
    });
    if(state.get().objects[0]!==image)throw new Error('This race must use the real in-place mutation');
    if(kind==='crop-back')state.update(s=>delete s.objects[0].srcRect);
    if(kind==='stale-error')__handoffGate.release.reject(new Error('outdated raster failure'));else __handoffGate.release.resolve();
   },kind);
   await page.waitForFunction(()=>window.__handoffResult);
   const result=await page.evaluate(()=>__handoffResult);
   if(kind==='pan'){
    assert.equal(result.status,'opened');const img=page.locator('#ai-image-panel .is-ai-active-source .ai-preview-stage > img');await img.waitFor();await img.evaluate(img=>img.decode());
    assert.equal(await img.getAttribute('src'),captured,'pan preserves the exact real raster output');
    await page.screenshot({path:path.join(evidence,name+'-pan.png')});
    await page.locator('#ai-image-panel [data-ai-close]').click();await page.locator('#ai-image-panel').waitFor({state:'hidden'});
   }else{
    assert.equal(result.status,'stale',kind+': obsolete pixels cannot enter the workbench');
    assert.equal(await page.locator('#ai-image-panel').isVisible(),false,kind+': no stale workbench opens');
   }
   assert.deepEqual(alerts,[],'an outdated raster failure cannot alert against the changed canvas');
   proof.push({kind,result,realRaster:true,unchangedObjectIdentity:true});
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(evidence,name+'-receipt.json'),JSON.stringify({engine:name,proof,errors,alerts},null,2));
  console.log(name+': nine real canvas-button raster handoff races and pan passed');
 }finally{await browser.close();}
}}).catch(error=>{console.error(error);process.exitCode=1;});
