const assert = require('node:assert/strict');
const path = require('node:path');
const closeTo = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < .1, `${label}: ${actual} != ${expected}`);

module.exports = async function verifyToolLenses(page, evidence, engine) {
  await page.evaluate(async () => {
    document.body.innerHTML = '<aside id="panel-right" style="position:fixed;right:0;width:250px;z-index:20"></aside><button id="arm-cut">Cut</button><button id="arm-delayed">Delayed</button><button id="arm-labeler">Labeler</button><svg id="canvas" style="position:absolute;left:20px;top:100px;width:900px;height:700px" width="900" height="700" viewBox="-100 -50 450 350"><g id="scene"><rect x="0" y="0" width="100" height="100" fill="steelblue"/></g></svg>';
    const [{ createStore }, { initCutTool }, { initLabelerMagnifier }] = await Promise.all([
      import('/preview/js/store.js'), import('/preview/js/cut-tool.js'), import('/preview/js/tools/labeler-magnifier.js'),
    ]);
    const store = createStore({ activeTool: 'CUT', objects: [], selectedIds: [], viewBox: { x: -100, y: -50, w: 450, h: 350 } });
    const svg = document.querySelector('#canvas');
    initCutTool(svg, store); initLabelerMagnifier(svg, store);
    for (const [id, tool] of [['cut', 'CUT'], ['delayed', 'DELAYED_CUT'], ['labeler', 'LABELER']]) document.querySelector(`#arm-${id}`).onclick = () => store.update(s => { s.activeTool = tool; });
    window.svgPoint = () => { const p = svg.createSVGPoint(); p.x = 25; p.y = 30; return p.matrixTransform(svg.getScreenCTM()); };
  });
  const point = async () => page.evaluate(() => { const p = window.svgPoint(); return { x: p.x, y: p.y }; });
  for (const tool of ['cut', 'delayed', 'labeler']) {
    await page.click(`#arm-${tool}`);
    const id = tool === 'labeler' ? '#labeler-magnifier' : '#cut-magnifier';
    for (const zoom of [1, 1.5]) {
      await page.evaluate(value => { document.body.style.zoom = value; }, zoom);
      const p = await point(); await page.mouse.move(p.x, p.y);
      await page.locator(id).waitFor({ state: 'visible' });
      const vb = (await page.locator(`${id} > svg`).first().getAttribute('viewBox')).split(' ').map(Number);
      closeTo(vb[0] + vb[2] / 2, 25, `${tool} SVG world x with pan/UI zoom`);
      closeTo(vb[1] + vb[3] / 2, 30, `${tool} SVG world y with pan/UI zoom`);
      closeTo((await page.locator(id).boundingBox()).width, 160, `${tool} fixed lens width`);
    }
    await page.screenshot({ path: path.join(evidence, `${engine}-${tool}-svg-lens.png`) });
    assert.equal(await page.locator('#canvas [id$="magnifier"]').count(), 0, 'lens excluded from scene serialization');
  }
  await page.click('#arm-cut');
  const toggle = page.locator('#panel-right [data-crop-magnifier-toggle]');
  assert.equal(await toggle.isChecked(), true);
  await toggle.uncheck();
  const p = await point(); await page.mouse.move(p.x, p.y);
  await page.locator('#cut-magnifier').waitFor({ state: 'hidden' });
  await page.evaluate(async () => {
    const { attachCropMagnifier } = await import('/preview/js/tools/pointer-magnifier.js');
    document.body.style.zoom = '1';
    const dialog = document.createElement('section'); dialog.id = 'capture-adapter';
    dialog.style.cssText = 'position:fixed;inset:20px;background:white;display:flex;z-index:100';
    const image = new Image(); image.src = window.cropSources[1]; image.style.cssText = 'width:600px;height:800px'; await image.decode();
    const inspector = document.createElement('aside');
    inspector.style.cssText = 'width:250px;padding:16px';
    const close = document.createElement('button'); close.id = 'close-capture'; close.textContent = 'Close capture'; inspector.append(close);
    dialog.append(image, inspector); document.body.append(dialog);
    const magnifier = attachCropMagnifier({ surface: image, image, inspector, id: 'capture-adapter-magnifier' });
    close.onclick = () => { magnifier.destroy(); dialog.remove(); };
  });
  const captureToggle = page.locator('#capture-adapter [data-crop-magnifier-toggle]');
  assert.equal(await captureToggle.isChecked(), false, 'shared persisted setting reaches capture adapter');
  await captureToggle.check();
  assert.equal(await toggle.isChecked(), true, 'mounted main inspector tracks capture preference');
  await page.mouse.move(180, 180);
  await page.locator('#capture-adapter-magnifier').waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(evidence, `${engine}-capture-adapter.png`) });
  await page.click('#close-capture');
  assert.equal(await page.locator('#capture-adapter-magnifier').count(), 0, 'close destroys capture lens');
};
