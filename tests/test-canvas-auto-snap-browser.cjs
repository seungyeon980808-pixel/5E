const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pw = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function fixture(t, engine) {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.join(root, pathname === '/' ? 'index.html' : pathname);
    fs.readFile(file, (err, data) => { res.writeHead(err ? 404 : 200, {'Content-Type': ({'.mjs':'text/javascript','.wasm':'application/wasm','.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'})[path.extname(file)] || 'application/octet-stream'}); res.end(err ? '' : data); });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await pw[engine].launch({headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  page.on('pageerror',e=>console.error(e.message));
  page.setDefaultTimeout(10000);
  t.after(async () => { await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); });
  await page.addInitScript(() => { localStorage.setItem('5e.tutorial.bannerSeen', 'true'); localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true'); });
  await page.goto(`http://127.0.0.1:${server.address().port}/?mode=pro&mobile=0&exam=0`, {waitUntil:'networkidle'});
  await page.waitForSelector('#rhwp-exam-workspace[data-exam-ready="true"]',{state:'attached'});
  return page;
}
async function seed(page, objects) {
  await page.evaluate(async objects => {
    const {state} = await import('/js/state.js?v=1.7.0-four-session-integration');
    window.__snapState = state;
    state.update(s => { s.objects=objects; s.selectedIds=['moving']; s.activeTool='V'; s.undoStack=[]; s.redoStack=[]; });
  }, objects);
}
async function drag(page, from, to, shift=false) {
  const [a,b] = await page.evaluate(points => {
    const svg=document.querySelector('#canvas');
    return points.map(p=> { const point=svg.createSVGPoint(); point.x=p.x; point.y=p.y; const q=point.matrixTransform(svg.getScreenCTM()); return {x:q.x,y:q.y}; });
  }, [from,to]);
  await page.mouse.move(a.x,a.y); await page.mouse.down();
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(b.x,b.y,{steps:8}); await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
  return page.evaluate(() => structuredClone(window.__snapState.get().objects));
}
for (const engine of ['chromium','webkit']) {
  test(`${engine}: free canvas movement is the default and coordinate locking remains optional`, async t => {
    const page=await fixture(t,engine);
    await seed(page,[]);
    const snapshot=()=>page.evaluate(()=>structuredClone(window.__snapState.get().viewBox));
    const pan=async()=>{await page.locator('#canvas').hover();await page.mouse.wheel(0,120);};
    assert.equal(await page.locator('#center-view-btn').getAttribute('data-mode'),'free');
    const free=await snapshot();await pan();
    await page.waitForFunction(y=>window.__snapState.get().viewBox.y!==y,free.y);
    await page.locator('#center-view-btn').click();await page.locator('[data-canvas-lock-mode="coordinate"]').click();
    const locked=await snapshot();await pan();
    // Wait for the next frame after the native wheel, then inspect the projection.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.deepEqual(await snapshot(),locked);
    await page.locator('#center-view-btn').click();await page.locator('[data-canvas-lock-mode="free"]').click();
    await pan();await page.waitForFunction(y=>window.__snapState.get().viewBox.y!==y,locked.y);
    await page.reload({waitUntil:'networkidle'});await page.waitForSelector('#rhwp-exam-workspace[data-exam-ready="true"]',{state:'attached'});
    assert.equal(await page.locator('#center-view-btn').getAttribute('data-mode'),'free');
  });
  test(`${engine}: automatic alignment can be disabled without changing artwork, survives reload and supports undo`, async t => {
    const page=await fixture(t,engine);
    assert.equal(await page.locator('#auto-snap-btn').getAttribute('aria-pressed'),'false');
    await page.locator('#auto-snap-btn').click();
    assert.equal(await page.locator('#auto-snap-btn').getAttribute('aria-pressed'),'true');
    await page.reload({waitUntil:'networkidle'});await page.waitForSelector('#rhwp-exam-workspace[data-exam-ready="true"]',{state:'attached'});
    assert.equal(await page.locator('#auto-snap-btn').getAttribute('aria-pressed'),'true');
    const objects=[{id:'moving',type:'rect',x:-20,y:-10,w:10,h:10,layerId:1,strokeWidth:.2,fill:'#ff0000'}, {id:'fixed',type:'rect',x:15,y:15,w:10,h:10,layerId:1,strokeWidth:.2,fill:'#0000ff'}];
    await seed(page, objects);
    let moved=await drag(page,{x:-15,y:-5},{x:19,y:-5});
    assert.ok(Math.abs(moved[0].x-15)<.05,JSON.stringify(moved[0]));
    assert.deepEqual(moved[1],objects[1]);
    await page.evaluate(async()=>{ const {undo}=await import('/js/transform.js?v=1.7.0-four-session-integration'); undo(window.__snapState); });
    assert.deepEqual(await page.evaluate(()=>window.__snapState.get().objects),objects);
    await page.locator('#auto-snap-btn').click();
    assert.equal(await page.locator('#auto-snap-btn').getAttribute('aria-pressed'),'false');
    assert.deepEqual(await page.evaluate(()=>window.__snapState.get().objects),objects);
    moved=await drag(page,{x:-15,y:-5},{x:19,y:-5});
    assert.ok(Math.abs(moved[0].x-14)<.05,JSON.stringify(moved[0]));
    await page.reload({waitUntil:'networkidle'});await page.waitForSelector('#rhwp-exam-workspace[data-exam-ready="true"]',{state:'attached'});
    assert.equal(await page.locator('#auto-snap-btn').getAttribute('aria-pressed'),'false');
    await page.locator('#auto-snap-btn').click();assert.equal(await page.locator('#auto-snap-btn').getAttribute('aria-pressed'),'true');
  });
  test(`${engine}: Shift endpoint snapping remains explicit while automatic alignment is off`, async t => {
    const page=await fixture(t,engine);
    assert.equal(await page.locator('#auto-snap-btn').getAttribute('aria-pressed'),'false');
    const objects=[{id:'moving',type:'line',p1:{x:-20,y:-10},p2:{x:-10,y:-10},layerId:1,strokeWidth:.2}, {id:'fixed',type:'line',p1:{x:15,y:15},p2:{x:25,y:15},layerId:1,strokeWidth:.2}];
    await seed(page,objects);
    const moved=await drag(page,{x:-15,y:-10},{x:19,y:15},true);
    assert.ok(Math.abs(moved[0].p1.x-15)<.05,JSON.stringify(moved[0]));
    assert.ok(Math.abs(moved[0].p1.y-15)<.05,JSON.stringify(moved[0]));
    assert.deepEqual(moved[1],objects[1]);
  });
}
