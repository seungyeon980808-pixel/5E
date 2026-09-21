const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const engine = process.env.BROWSER === "webkit" ? webkit : chromium;
 const browser = await engine.launch(process.env.BROWSER_PATH ? {executablePath:process.env.BROWSER_PATH} : {});
 try {
  const page = await browser.newPage({viewport:{width:1600,height:1000}});
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:8795/preview/');
  const skip = page.getByRole('button',{name:'건너뛰기',exact:true});
  if (await skip.isVisible().catch(() => false)) await skip.click();
  const measure = () => page.evaluate(() => {
   const svg=document.querySelector('#canvas'), m=svg.getScreenCTM();
   return {scale:m.a,x:m.e,y:m.f,right:document.querySelector('#panel-right').getBoundingClientRect().right};
  });
  const initial=await measure();
  const handle=await page.locator('#inspector-resize').boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+40);await page.mouse.down();
  await page.mouse.move(handle.x-100,handle.y+40,{steps:12});await page.mouse.up();
  await page.waitForTimeout(400);
  const resized=await measure();
  assert.ok(Math.abs(initial.scale-resized.scale)<.01,JSON.stringify({initial,resized}));
  assert.ok(Math.abs(initial.x-resized.x)<.2 && Math.abs(initial.y-resized.y)<.2,JSON.stringify({initial,resized}));
  assert.ok(Math.abs(initial.right-resized.right)<.2);
  for(const mode of ["free","current","coordinate"]) {
  await page.locator("#center-view-btn").click();
  await page.locator(`[data-canvas-lock-mode="${mode}"]`).click();
  for(const zoom of [.84,1,1.5]) {
   await page.evaluate(z=>document.documentElement.style.setProperty('--ui-zoom',z),String(zoom));
   await page.waitForTimeout(150);
   const before=await measure();
   for(let i=0;i<10;i++) {await page.locator(i%2?'#drawer-left-toggle':'#drawer-right-toggle').click();await page.waitForTimeout(40);}
   await page.waitForTimeout(450);
   const after=await measure();
   assert.ok(Math.abs(before.scale-after.scale)<.01,JSON.stringify({zoom,before,after}));
   assert.ok(Math.abs(before.x-after.x)<.2 && Math.abs(before.y-after.y)<.2,JSON.stringify({zoom,before,after}));
  }
  }
  console.log('PASS drag resize, interrupted left/right toggles, UI zoom .84/1/1.5: scale and screen origin preserved');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
