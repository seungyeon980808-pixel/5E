const test=require('node:test');const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const h=require('./helpers/rhwp-exam.cjs');
for(const [name,engine] of Object.entries({chromium,webkit}))for(const key of ['Enter','Space'])test(`${name}: ${key} confirms crop, document choice and placement once`,async t=>{
 await h.withServer(async origin=>{
  const browser=await engine.launch();t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1440,height:950},reducedMotion:'reduce'});
  await page.addInitScript(()=>{localStorage.setItem('5e.tutorial.bannerSeen','true');localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true');});
  await h.navigate(page,origin+'/?mode=pro&mobile=0&exam=0');await h.ready(page);
  await page.evaluate(async()=>{const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');state.update(s=>{s.objects=[{id:'confirm-line',type:'line',p1:{x:-15,y:-10},p2:{x:15,y:10},layerId:1,order:0,rotation:0,strokeWidth:.3,strokeLevel:0,lineMode:'solid',arrowHead:'none'}];s.selectedIds=[];});});
  await h.sendCanvas(page);await page.locator('.capture-overlay').waitFor();
  await page.keyboard.press(key);assert.equal(await page.locator('.capture-overlay').isVisible(),true,'an empty crop cannot be confirmed');
  const box=await page.locator('#canvas').boundingBox();await page.mouse.move(box.x+box.width*.35,box.y+box.height*.35);await page.mouse.down();await page.mouse.move(box.x+box.width*.65,box.y+box.height*.65);await page.mouse.up();
  const size=page.locator('.capture-size-input').first();await size.focus();await page.keyboard.press('Space');assert.equal(await page.locator('.capture-overlay').isVisible(),true,'Space edits the dimension input');await size.fill('30');await size.blur();
  await page.locator('.capture-overlay').dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true});assert.equal(await page.locator('.capture-overlay').isVisible(),true);
  await page.keyboard.down(key);await page.locator('[data-dialog-purpose="hwp"]').waitFor();
  await page.locator('[data-dialog-purpose="hwp"] [role="alertdialog"]').dispatchEvent('keydown',{key:key==='Space'?' ':key,code:key,repeat:true});assert.equal(await page.locator('[data-dialog-purpose="hwp"]').isVisible(),true,'held confirmation does not accept the next surface');
  await page.keyboard.up(key);await page.keyboard.press(key);await page.locator('.exam-placement:not([hidden])').waitFor();await h.idle(page);
  await page.locator('#exam-name').fill('문서');await page.locator('#exam-name').focus();await page.keyboard.press('Space');assert.equal(await page.locator('#exam-name').inputValue(),'문서 ');assert.equal((await h.pictures(page)).length,0);
  await page.evaluate(()=>document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().focus());
  await page.keyboard.press(key);assert.equal((await h.pictures(page)).length,0,'placement requires a selected target');
  const point=await h.point(page);await page.mouse.click(point.x,point.y);await page.locator('[data-exam-action="confirm-placement"]:not(:disabled)').waitFor();
  await page.evaluate(()=>document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().focus());
  await page.keyboard.down(key);await h.waitForState(page,()=>document.querySelector('.exam-placement').hidden);await h.idle(page);assert.equal((await h.pictures(page)).length,1);
  const text=await page.evaluate(()=>JSON.stringify((()=>{const w=document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.wasm;return [w.getParagraphCount(0),w.getParagraphLength(0,0)];})()));
  await page.evaluate(({key})=>{const i=document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler();i.textarea.dispatchEvent(new KeyboardEvent('keydown',{key:key==='Space'?' ':key,code:key,repeat:true,bubbles:true,cancelable:true}));},{key});
  assert.equal(await page.evaluate(()=>JSON.stringify((()=>{const w=document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.wasm;return [w.getParagraphCount(0),w.getParagraphLength(0,0)];})())),text,'a held key does not add a space or paragraph after confirmation');
  await page.keyboard.up(key);assert.equal(await page.locator('#exam-status').getAttribute('data-error'),'false');
 });
});
