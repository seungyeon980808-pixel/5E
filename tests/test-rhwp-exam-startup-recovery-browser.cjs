const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path');
const h=require('./helpers/rhwp-exam.cjs');
const evidence=path.resolve(process.env.EVIDENCE_DIR||'_work/rhwp/verification/startup-recovery');fs.mkdirSync(evidence,{recursive:true});
async function scenario(type,origin,surface){const browser=await type.launch();try{
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await h.navigate(page,new URL(surface+'?mode=pro&mobile=0&exam=0',origin).href);await h.ready(page);
 // Provision only this isolated browser profile with the same legacy snapshot
 // format created by autosave. Recovery and subsequent input use real controls.
 await page.evaluate(async()=>{
  const {state}=await import('/js/state.js?v=1.7.0-four-session-integration'),{serialize}=await import('/js/project-io.js?v=1.7.0-four-session-integration');
  const data=serialize(state.get());data.pages[0].objects=[{id:'recovery-line',type:'line',p1:{x:0,y:0},p2:{x:10,y:10},layerId:data.pages[0].layers[0].id,order:0,strokeWidth:.3}];
  await new Promise((resolve,reject)=>{const req=indexedDB.open('5e-preview-autosave',1);req.onsuccess=()=>{const db=req.result,tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').add({ts:Date.now(),data});tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)};req.onerror=()=>reject(req.error)});
 });
 await h.navigate(page,new URL(surface+'?mode=pro&mobile=0&exam=1',origin).href);
 const dialog=page.getByRole('alertdialog',{name:'작업 복구',exact:true});await dialog.waitFor({state:'visible'});
 assert.equal(await page.locator('#rhwp-exam-workspace').isVisible(),false,'the exam must not claim the modal surface before recovery is answered');
 assert.equal(await dialog.getByRole('button',{name:'복구',exact:true}).evaluate(b=>document.activeElement===b&&!b.closest('[inert]')),true,'the recovery choice owns keyboard focus');
 await page.screenshot({path:path.join(evidence,type.name()+'-'+(surface==='/'?'root':'preview')+'-recovery.png')});
 await page.keyboard.press('Enter');await dialog.waitFor({state:'hidden'});await page.locator('#rhwp-exam-workspace').waitFor({state:'visible'});await h.ready(page);
 assert.equal(await page.evaluate(async()=>{const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');return state.get().objects.some(o=>o.id==='recovery-line')}),true,'keyboard recovery preserves the saved drawing');
 await h.action(page,'demo');await h.idle(page);assert.equal((await h.pictures(page)).length,1,'document commands work after recovery');assert.deepEqual(errors,[]);
 console.log(type.name()+' '+surface+': recovery focus → Enter → exam → document command passed');
}finally{await browser.close()}}
(async()=>await h.withServer(async origin=>{for(const type of[chromium,webkit])for(const surface of['/','/preview/'])await scenario(type,origin,surface)}))().catch(e=>{console.error(e);process.exitCode=1});
