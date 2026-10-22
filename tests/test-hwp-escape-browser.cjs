const test=require('node:test');const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
async function open(page){await page.locator('.app-switch-image [data-app-switch=\"hwp\"]').click();await h.idle(page);await page.locator('#rhwp-exam-workspace').waitFor();}
for(const [engineName,engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE))test(`${engineName}: compact HWP actions and Escape return preserve the document and respect inner actions`,async t=>{
 await h.withServer(async origin=>{
  const browser=await engine.launch({headless:true});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1440,height:950},reducedMotion:'reduce'});
  await page.addInitScript(()=>{localStorage.setItem('5e.tutorial.bannerSeen','true');localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true');});
  await h.navigate(page,origin+'/?mode=pro&mobile=0&exam=1');await h.ready(page);await h.idle(page);
  for(const width of [1440,900,640,390]){
   await page.setViewportSize({width,height:950});
   const layout=await page.locator('.exam-heading').evaluate(n=>{const r=n.getBoundingClientRect(),b=n.querySelector('[data-exam-action="close"]').getBoundingClientRect(),f=n.querySelector('[data-exam-menu="file"]').getBoundingClientRect();return{heading:r.height,back:b, file:f};});
   assert(layout.heading<=35);assert(Math.abs(layout.back.y-layout.file.y)<2);assert(layout.file.right<=width);
  }
  await page.setViewportSize({width:1440,height:950});
  await page.locator('#exam-name').fill('Esc 보존 문서');await page.locator('[data-exam-menu="file"]').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#rhwp-exam-workspace').isVisible(),true);assert.equal(await page.locator('#exam-file-menu').isVisible(),false);
  await page.locator('#exam-name').focus();await page.keyboard.press('Escape');await page.locator('#rhwp-exam-workspace').waitFor({state:'hidden'});
  await open(page);assert.equal(await page.locator('#exam-name').inputValue(),'Esc 보존 문서');
  const before=await page.evaluate(()=>document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.wasm.documentGeneration);
  await page.evaluate(()=>document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().focus());
  await page.keyboard.press('Escape');await page.locator('#rhwp-exam-workspace').waitFor({state:'hidden'});
  await open(page);assert.equal(await page.locator('#exam-name').inputValue(),'Esc 보존 문서');assert.equal(await page.evaluate(()=>document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.wasm.documentGeneration),before);
  // Escape from an inner native dialog must leave the workspace open.
  await page.evaluate(()=>{const d=document.createElement('dialog');d.id='escape-inner';d.textContent='중첩 대화상자';document.body.append(d);d.showModal();});
  await page.keyboard.press('Escape');assert.equal(await page.locator('#rhwp-exam-workspace').isVisible(),true);await page.evaluate(()=>document.querySelector('#escape-inner').remove());
  await page.locator('#exam-name').focus();await page.locator('#exam-name').dispatchEvent('keydown',{key:'Escape',isComposing:true});assert.equal(await page.locator('#rhwp-exam-workspace').isVisible(),true);
  await h.action(page,'close');
  await page.evaluate(async()=>{const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');state.update(s=>{s.objects=[{id:'escape-line',type:'line',p1:{x:-10,y:-5},p2:{x:10,y:5},strokeWidth:.2,layerId:1}];});});
  await h.crop(page);await page.locator('.exam-placement:not([hidden])').waitFor();await h.idle(page);assert.equal((await h.pictures(page)).length,0);
  await page.locator('#exam-name').focus();await page.keyboard.press('Escape');assert.equal(await page.locator('.exam-placement').isVisible(),false);assert.equal(await page.locator('#rhwp-exam-workspace').isVisible(),true);assert.equal((await h.pictures(page)).length,0);
  await page.keyboard.press('Escape');await page.locator('#rhwp-exam-workspace').waitFor({state:'hidden'});await h.waitForState(page,()=>document.querySelector('.app-switch-image [data-app-switch="hwp"]')===document.activeElement); // 10-21: 아래 막대 단추가 없어져 초점은 맨 위 「hwp」로
  await open(page);await h.action(page,'close');await h.crop(page);await h.place(page);
  const point=await h.point(page,'image',0);
  await page.mouse.click(point.x,point.y);
  await h.waitForState(page,()=>document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().cursor.isInPictureObjectSelection());
  await page.keyboard.press('Escape');assert.equal(await page.locator('#rhwp-exam-workspace').isVisible(),true);assert.equal((await h.pictures(page)).length,1);
  await page.keyboard.press('Escape');await page.locator('#rhwp-exam-workspace').waitFor({state:'hidden'});await open(page);assert.equal((await h.pictures(page)).length,1);
 });
});
