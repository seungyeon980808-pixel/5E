import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true});
try {
const page=await browser.newPage({viewport:{width:1280,height:820}});
await page.route('**/js/main.js*',route=>route.fulfill({contentType:'text/javascript',body:''}));
await page.goto('http://127.0.0.1:24897/index.html');
await page.evaluate(async()=>{
 const {initImageObjectify}=await import('/js/image-objectify.js');
 const c=document.createElement('canvas');c.width=800;c.height=600;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,800,600);ctx.fillStyle='black';ctx.fillRect(100,100,100,100);
 const state={objects:[{id:'a',type:'image',src:c.toDataURL()}],selectedIds:['a']};
 initImageObjectify({get:()=>state,update:()=>{}});
});
await page.click('#image-objectify-open');
await page.waitForFunction(()=>document.querySelector('#objectify-preview').width===800);
await page.waitForTimeout(300);
const stage=page.locator('#objectify-stage');const box=await stage.boundingBox();const point={x:box.x+box.width*.4,y:box.y+box.height*.45};
const read=()=>page.locator('#objectify-preview').boundingBox();const before=await read();
await page.mouse.move(point.x,point.y);await page.keyboard.down('Control');await page.mouse.wheel(0,-90);await page.keyboard.up('Control');await page.waitForTimeout(100);
const after=await read();assert.ok(after.width>before.width);
assert.ok(Math.abs((point.x-before.x)/before.width-(point.x-after.x)/after.width)<.002);
const label=await page.locator('#objectify-zoom-value').textContent();await page.mouse.wheel(25,70);await page.waitForTimeout(100);assert.equal(await page.locator('#objectify-zoom-value').textContent(),label);assert.ok((await read()).y<after.y);
assert.equal(await page.locator('.objectify-overlay').evaluate(el=>getComputedStyle(el).backdropFilter),'blur(8px)');
await page.click('#objectify-zoom-in');assert.notEqual(await page.locator('#objectify-zoom-value').textContent(),label);
await page.click('#objectify-zoom-reset');
await page.screenshot({path:'.omo/evidence/gesture-qa/objectify.png'});
console.log('PASS objectify cursor zoom, plain pan, controls, backdrop blur');
} finally {await browser.close();}
