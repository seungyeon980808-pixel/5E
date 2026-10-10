/** Reopens delivered files and each combined page. Does not request a model. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
if(!process.env.OUTPUT_DIR)throw Error('OUTPUT_DIR required');
const out=path.resolve(process.env.OUTPUT_DIR),record=JSON.parse(fs.readFileSync(path.join(out,'delivery-verification.json')));
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const combined=JSON.parse(fs.readFileSync(path.join(out,'editable-graphs.5e')));
assert.equal(combined.pages.length,record.cases.filter(c=>c.editingPass).length);
assert.equal(new Set(combined.pages.map(p=>p.id)).size,combined.pages.length);
const result={modelCalls:0,manualPlanCorrections:0,uniquePageIds:true,individualFiles:[],combinedPages:[],errors:[],pass:false};
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1050}});page.on('pageerror',e=>result.errors.push(String(e)));
 await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:64826/preview/',{waitUntil:'networkidle'});const skip=page.getByRole('button',{name:'건너뛰기',exact:true});if(await skip.isVisible())await skip.click();
 const load=project=>page.evaluate(async project=>{const{state}=await import('/preview/js/state.js?v=1.7.0-four-session-integration');(await import('/preview/js/project-io.js?v=1.7.0-four-session-integration')).applyLoaded(state,project);return state.get().objects.filter(o=>o.type==='coordplane').length;},project);
 for(const c of record.cases.filter(c=>c.editingPass)){assert.equal(await load(JSON.parse(fs.readFileSync(path.join(out,c.id,'editable-graph.5e')))),1);result.individualFiles.push({id:c.id,pass:true});}
 await load(combined);
 for(const p of combined.pages){
  const before=await page.evaluate(async id=>{const{state}=await import('/preview/js/state.js?v=1.7.0-four-session-integration');(await import('/preview/js/pages.js?v=1.7.0-four-session-integration')).switchPage(state,id);const s=state.get(),plane=s.objects.find(o=>o.type==='coordplane');if(!plane)throw Error('Missing plane');(await import('/preview/js/graph/graph-modal.js?v=1.7.0-four-session-integration')).openGraphModal(plane.id);return JSON.parse(JSON.stringify({objects:s.objects,groups:s.groups}));},p.id);
  assert.equal(before.objects.filter(o=>o.type==='coordplane').length,1);
  assert.equal(before.groups.length,1);assert.deepEqual([...before.groups[0].memberIds].sort(),before.objects.map(o=>o.id).sort());
  await page.locator('#gm-confirm').click();await page.waitForFunction(()=>document.querySelector('#graph-modal-overlay')?.hidden===true);
  const after=await page.evaluate(async()=>JSON.parse(JSON.stringify({objects:(await import('/preview/js/state.js?v=1.7.0-four-session-integration')).state.get().objects,groups:(await import('/preview/js/state.js?v=1.7.0-four-session-integration')).state.get().groups})));
  assert.deepEqual(after,before);result.combinedPages.push({id:p.id,pass:true,unchanged:true,groupValid:true});
 }
 assert.deepEqual(result.errors,[]);result.pass=true;
}catch(e){result.error=e.stack;process.exitCode=1;}finally{await browser.close();fs.writeFileSync(path.join(out,'reopened-file-verification.json'),JSON.stringify(result,null,2));}
console.log(JSON.stringify({pass:result.pass,individualFiles:result.individualFiles.length,combinedPages:result.combinedPages.length,error:result.error},null,2));
