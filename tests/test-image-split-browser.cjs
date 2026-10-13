const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const h = require('./helpers/rhwp-exam.cjs');
const { instrumentAiMain } = require('./helpers/canonical-fixture-adapter.cjs');
process.env.APP_ENTRY = '/';
const root=path.resolve(__dirname,'..'), evidence=path.resolve(process.env.EVIDENCE_DIR || '_work/feedback/parts/manual-image-split');
fs.mkdirSync(evidence,{recursive:true});const receipts=[];
async function draw(page, mode, points) {
  const dialog=page.locator('#ai-image-panel .manual-split-dialog[open]');await dialog.locator(`[data-split-mode="${mode}"]`).click();
  const box=await dialog.locator('svg').boundingBox();const xy=([x,y])=>[box.x+x*box.width,box.y+y*box.height];
  await page.mouse.move(...xy(points[0]));await page.mouse.down();for(const point of points.slice(1))await page.mouse.move(...xy(point),{steps:8});await page.mouse.up();
}
h.withServer(async origin=>{
 for(const [engineName,engine] of Object.entries({chromium,webkit})){
  const browser=await engine.launch();
  try {
   const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));let providerCalls=0;await page.route('https://five-e-ai-runtime-probe.onrender.com/**',route=>{providerCalls++;return route.abort();});
   await page.route('**/js/main.js*',route=>route.fulfill({contentType:'text/javascript',body:instrumentAiMain(root,{manager:'__splitManager',seedReady:false}).body}));
   await page.goto(origin+'/?mode=pro&mobile=0&exam=0');await page.waitForFunction(()=>window.__splitManager);
   const skip=page.getByRole('button',{name:'건너뛰기',exact:true});if(await skip.isVisible())await skip.click();await page.locator('#ai-image-install-open').click();
   const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=240;c.height=180;const ctx=c.getContext('2d');const pixels=ctx.createImageData(c.width,c.height);for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;pixels.data.set([x,y,(x+y)%256,255],i);}ctx.putImageData(pixels,0,0);return c.toDataURL();});
   await page.locator('#ai-image-panel [data-ai-source-file]').setInputFiles({name:'split-source.png',mimeType:'image/png',buffer:Buffer.from(png.split(',')[1],'base64')});
   const split=page.locator('#ai-image-panel [data-ai-manual-split]');await split.waitFor();await page.waitForFunction(()=>!document.querySelector('#ai-image-panel [data-ai-manual-split]').disabled);
   const snapshot=await page.evaluate(()=>__splitManager.sharingSnapshot());const parent=snapshot.workspaces[0].tabs.find(tab=>tab.attachments.length);parent.input='원본 요청을 유지';parent.imageLabelWorkflow={...parent.imageLabelWorkflow,imageKind:'exam',labelResult:'restore'};parent.examLink={tabId:'test-document',assetId:'original-picture'};parent.generated=[{id:'previous-result',kind:'generated',name:'이전 결과',data:png,comments:[],nextCommentNumber:1,sourceReferenceId:parent.attachments[0].id}];parent.selectedCandidateId='previous-result';
   await page.evaluate(value=>__splitManager.restoreProjectSnapshot(value),snapshot);await split.click();await page.locator('#ai-image-panel .manual-split-dialog [data-split-status]').filter({hasText:'영역을 추가하세요'}).waitFor();
   await draw(page,'rectangle',[[.05,.1],[.45,.5]]);await draw(page,'freehand',[[.55,.2],[.95,.2],[.55,.8],[.55,.2]]);
   assert.equal(await page.locator('#ai-image-panel [data-split-regions] input').count(),2);await page.getByLabel('영역 1 이름',{exact:true}).fill('사각 조각');await page.screenshot({path:path.join(evidence,engineName+'-desktop.png')});
   await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('#ai-image-panel .manual-split-dialog').evaluate(el=>el.getBoundingClientRect().width<=390));await page.screenshot({path:path.join(evidence,engineName+'-mobile.png')});await page.setViewportSize({width:1440,height:1000});
   const before=(await page.evaluate(()=>__splitManager.sharingSnapshot())).workspaces.flatMap(w=>w.tabs).find(tab=>tab.id===parent.id);
   await page.locator('#ai-image-panel [data-split-apply]').click();await page.locator('#ai-image-panel .manual-split-dialog').waitFor({state:'hidden'});
   const after=(await page.evaluate(()=>__splitManager.sharingSnapshot())).workspaces.flatMap(w=>w.tabs);const retained=after.find(tab=>tab.id===parent.id);for(const key of ['attachments','generated','input','examLink','selectedCandidateId','imageLabelWorkflow','outputOptions','conversationMessages'])assert.deepEqual(retained[key],before[key],key+' is preserved');
   const children=after.filter(tab=>tab.id!==parent.id);assert.equal(children.length,2);assert.equal(children[0].attachments[0].name,'사각 조각');assert.ok(children.every(tab=>!tab.examLink&&tab.attachments[0].source.parentTaskId===parent.id&&tab.imageLabelWorkflow.imageKind==='exam'));
   const pixelChecks=await page.evaluate(async children=>{const decode=async data=>{const img=new Image();img.src=data;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return {width:c.width,height:c.height,rgba:ctx.getImageData(0,0,c.width,c.height).data};};const results=[];for(const child of children){const source=child.attachments[0],region=source.source.region,img=await decode(source.data);if(img.width!==region.width||img.height!==region.height)throw Error('crop dimensions');if(region.mode==='rectangle'){for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++){const i=(y*img.width+x)*4;const expected=[x+region.x,y+region.y,(x+region.x+y+region.y)%256,255];if(expected.some((value,k)=>img.rgba[i+k]!==value))throw Error('original crop pixel changed');}}else{const outside=((img.height-2)*img.width+img.width-2)*4;if(img.rgba[outside+3]!==0)throw Error('outside freehand mask not transparent');const inside=(2*img.width+2)*4;if(img.rgba[inside+3]!==255)throw Error('inside freehand mask changed');}results.push({mode:region.mode,width:img.width,height:img.height});}return results;},children);
   const cancelBefore=await page.evaluate(()=>__splitManager.sharingSnapshot());await split.click();await page.locator('#ai-image-panel .manual-split-dialog [data-split-status]').filter({hasText:'영역을 추가하세요'}).waitFor();await draw(page,'rectangle',[[.1,.1],[.8,.8]]);await page.keyboard.press('Escape');assert.equal(await page.locator('#ai-image-panel').evaluate(el=>el.hidden),false);const cancelAfter=await page.evaluate(()=>__splitManager.sharingSnapshot());if(cancelAfter.workspaces.flatMap(w=>w.tabs).length!==cancelBefore.workspaces.flatMap(w=>w.tabs).length)console.error(JSON.stringify({cancelBefore,cancelAfter}));assert.equal(cancelAfter.workspaces.flatMap(w=>w.tabs).length,cancelBefore.workspaces.flatMap(w=>w.tabs).length);
   const current=await page.evaluate(()=>__splitManager.sharingSnapshot());await page.evaluate(value=>__splitManager.openSharingDocument('split-readonly',{...value,mode:'view'}),current);await page.waitForFunction(()=>document.querySelector('#ai-image-panel [data-ai-manual-split]').disabled);
   assert.deepEqual(errors,[]);assert.equal(providerCalls,0);receipts.push({engine:engineName,pass:true,providerCalls,pixelChecks,conditions:['rectangle-pointer-drag','freehand-pointer-drag','names','original-pixels','transparent-mask','parent-result-history-settings-preserved','document-link-not-duplicated','child-provenance','exam-kind-preserved','narrow-layout','Esc-cancel','view-only-disabled']});
  } finally {await browser.close();}
 }
 fs.writeFileSync(path.join(evidence,'receipt.json'),JSON.stringify(receipts,null,2));
}).catch(error=>{console.error(error);process.exitCode=1;});
