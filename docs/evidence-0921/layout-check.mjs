const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const b=await chromium.launch({headless:true});const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));const out=[];
for(const width of [1440,1024,768,375]){
 await p.setViewportSize({width,height:1000});await p.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:8767/preview/');await p.waitForTimeout(350);await p.locator('.tut-welcome-overlay').evaluateAll(es=>es.forEach(e=>e.remove()));
 const measure=()=>p.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect().toJSON();return {h:r('#ruler-h'),v:r('#ruler-v'),canvas:r('#canvas'),inspector:r('#panel-right'),controls:r('.canvas-global-controls'),brand:r('.app-brand'),menu:r('.toolbar-document'),scroll:document.documentElement.scrollWidth,width:innerWidth}});
 let m=await measure(); assert.ok(m.h.height>=19);assert.ok(Math.abs(m.v.bottom-m.canvas.bottom)<1);if(width>=768)assert.ok(m.controls.right<=m.inspector.left);out.push({width,mode:'normal',...m});
 await p.screenshot({path:`docs/evidence-0921/layout-${width}.png`});
 if(width>=768){for(const side of ['left','right']){await p.locator(`.app-shell-header [data-panel-toggle="${side}"]`).click();await p.waitForTimeout(400);m=await measure();assert.ok(m.h.height>=19);assert.ok(m.canvas.width>0);out.push({width,collapsed:side,...m});}}
}
console.log(JSON.stringify({errors,cases:out.map(x=>({width:x.width,collapsed:x.collapsed,scroll:x.scroll,viewport:x.width}))}));await writeFile('docs/evidence-0921/layout-chromium.json',JSON.stringify({errors,cases:out},null,2));await b.close();
