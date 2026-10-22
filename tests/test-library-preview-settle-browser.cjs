'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const origin=new URL(process.env.RELEASE_URL||process.env.EXAM_URL||'http://127.0.0.1:51819').origin;
const out=path.resolve(process.env.EVIDENCE_DIR||'_work/library-preview-settle');fs.mkdirSync(out,{recursive:true});
const report={qualification:'Bounded completion lifecycle, real Web Animations and visibility events; no provider requests.',engines:[]};
(async()=>{for(const [engine,type]of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)){
 const browser=await type.launch({headless:true}),page=await browser.newPage({viewport:{width:1000,height:800}}),row={engine,errors:[],cases:[]};report.engines.push(row);page.on('pageerror',e=>row.errors.push(e.message));
 try{
  await page.route('**/__preview_settle__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>.br-stage{position:absolute;inset:0}.br-final,.br-stack{position:absolute;inset:0;width:100%;height:100%}</style><body></body>'}));await page.goto(origin+'/__preview_settle__');
  for(const {hidden,reduced} of [{hidden:false,reduced:false},{hidden:true,reduced:false},{hidden:true,reduced:true}]){await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
   await page.evaluate(async()=>{const {createLibraryPreviewLoading}=await import('/js/loading/library-preview.js');const host=document.createElement('div');host.style.cssText='position:fixed;top:20px;left:20px;width:400px;height:240px';document.body.append(host);const paper=document.createElement('div');paper.style.cssText='width:400px;height:240px';host.append(paper);const c=document.createElement('canvas');c.width=400;c.height=240;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,400,240);g.fillStyle='black';g.fillRect(20,20,200,20);const image=new Image();image.src=c.toDataURL();await image.decode();window.settleFixture={host,image,loading:createLibraryPreviewLoading(host,paper,image.src)};});
   // The operation's real clock proves that this is beyond instant completion.
   await page.waitForFunction(()=>settleFixture.host.querySelector('time')?.dateTime==='PT1S');
   await page.evaluate(()=>{const f=settleFixture,frame=document.createElement('div');frame.style.cssText='position:relative;width:400px;height:240px';f.frame=frame;f.host.replaceChildren(frame);f.loading.complete(frame,f.image);});
   await page.waitForFunction(()=>settleFixture.frame.querySelector('.br-final'));
   if(hidden)await page.evaluate(async()=>{const f=settleFixture;await new Promise(resolve=>{const io=new IntersectionObserver(entries=>{if(entries.some(e=>!e.isIntersecting)){io.disconnect();resolve();}});io.observe(f.frame);f.host.hidden=true;});f.host.remove();});
   await page.waitForFunction(()=>!settleFixture.frame.classList.contains('br-frame')&&!settleFixture.frame.querySelector('.br-stage'),null,{timeout:3000});
   assert.equal(await page.evaluate(()=>settleFixture.frame.hasAttribute('aria-busy')),false,'completion releases its busy state');
   row.cases.push({hidden,reduced,pass:true});await page.evaluate(()=>{settleFixture.host.remove();delete window.settleFixture;});
  }
  assert.deepEqual(row.errors,[]);row.pass=true;
 }catch(e){row.pass=false;row.error=e.stack;}
 finally{await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({engine,pass:row.pass,cases:row.cases.length,error:row.error}));}
}if(report.engines.some(r=>!r.pass))process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1;});
