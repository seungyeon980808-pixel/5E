'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const origin=new URL(process.env.RELEASE_URL||process.env.EXAM_URL||'http://127.0.0.1:51819').origin;
const out=path.resolve(process.env.EVIDENCE_DIR||'_work/blur-reveal-dispose');fs.mkdirSync(out,{recursive:true});
const report={qualification:'Real owned Web Animations must be canceled after reset/destroy even when their targets have already been detached or paused.',engines:[]};
(async()=>{for(const [engine,type]of Object.entries({chromium,webkit})){
 const browser=await type.launch(),page=await browser.newPage(),row={engine,cases:[],errors:[]};report.engines.push(row);page.on('pageerror',e=>row.errors.push(e.message));
 try{
  await page.route('**/__reveal_dispose__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));await page.goto(origin+'/__reveal_dispose__');
  for(const variant of ['fade','focus','sweep'])for(const action of ['reset','destroy'])for(const phase of ['loading','updated','settling']){
   const result=await page.evaluate(async({variant,action,phase})=>{
    const {BlurReveal}=await import('/js/loading/blur-reveal.js');
    const frame=document.createElement('div');frame.style.cssText='width:400px;height:240px';document.body.append(frame);
    const source=document.createElement('canvas');source.width=400;source.height=240;source.getContext('2d').fillRect(20,20,200,20);
    const captured=[],original=Element.prototype.animate;
    Element.prototype.animate=function(...args){const a=original.apply(this,args);captured.push(a);return a;};
    try{
     const reveal=BlurReveal.attach(frame,{variant,reducedMotion:false,instantMs:0});await reveal.start(source);
     if(phase==='updated')await reveal.update(source);
     let settling;
     if(phase==='settling'){settling=reveal.complete(source);await Promise.resolve();}
     captured.forEach(a=>a.pause());frame.remove();
     const exposedAfterDetach=frame.getAnimations({subtree:true}).length;
     reveal[action]();await settling;
     const result={variant,action,phase,exposedAfterDetach,states:captured.map(a=>a.playState),busy:frame.hasAttribute('aria-busy'),stageChildren:reveal.stage.children.length};
     if(action==='reset'){
      // Reset remains reusable; a previous disposal must not cancel a new run.
      document.body.append(frame);await reveal.start(source);result.restarted=reveal.state==='loading'&&frame.hasAttribute('aria-busy');reveal.destroy();
     }
     return result;
    }finally{Element.prototype.animate=original;captured.forEach(a=>a.cancel());frame.remove();}
   },{variant,action,phase});
   assert.ok(result.states.length>0,'fixture created actual animations');
   assert.ok(result.states.every(s=>s==='idle'),JSON.stringify(result));
   assert.equal(result.busy,false);assert.equal(result.stageChildren,0);
   if(action==='reset')assert.equal(result.restarted,true);
   row.cases.push({...result,pass:true});
  }
  assert.deepEqual(row.errors,[]);row.pass=true;
 }catch(e){row.pass=false;row.error=e.stack;}
 finally{await browser.close();console.log(JSON.stringify({engine,pass:row.pass,cases:row.cases.length,error:row.error}));fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}
}if(report.engines.some(e=>!e.pass))process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1;});
