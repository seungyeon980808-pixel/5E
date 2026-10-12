const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium, webkit} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/rhwp/verification/graph-zoom');

async function view(page) {
  return page.evaluate(async () => {
    const frame=document.querySelector('#exam-studio iframe');
    const {RhwpExamBridge}=await import('/js/rhwp-exam-bridge.js?v=1.7.0-four-session-integration');
    // Read geometry using the same pinned SDK boundary as the shipped overlay.
    const bridge=Object.assign(Object.create(RhwpExamBridge.prototype),{editor:{element:frame},deps:frame.contentWindow.rhwpStudio.plugins.deps});
    const ref=bridge.documentPictures()[0]?.ref, manager=bridge.input.viewportManager;
    const geometry=ref && bridge.figureGeometry(ref), viewport=bridge.figureViewport();
    const plane=ref && bridge.picturePlacement(ref)?.placement;
    const toolbar=document.querySelector('.exam-inline-toolbar').getBoundingClientRect();
    return {zoom:manager.getZoom(),x:manager.getScrollX(),y:manager.getScrollY(),geometry,viewport,
      paperScale:plane?.scale, toolbar:{x:toolbar.x,y:toolbar.y,w:toolbar.width,h:toolbar.height}};
  });
}

async function scenario(origin, engine, surface) {
  const browser=await ({chromium,webkit}[engine]).launch({headless:true});
  const errors=[];
  const context=await browser.newContext({viewport:{width:1440,height:950},acceptDownloads:true});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  const stateUrl='/js/state.js?v=1.7.0-four-session-integration';
  const graphUrl='/js/graph/graph-modal.js?v=1.7.0-four-session-integration';
  try {
    await h.navigate(page,new URL(`${surface}?mode=pro&mobile=0&exam=1`,origin).href,{waitUntil:'domcontentloaded'});await h.ready(page);
    await h.action(page,'close');
    await page.locator('#graph-tool-open').click();
    await page.locator('#graph-modal-overlay:not([hidden])').waitFor();
    await page.locator('#gm-labelx').fill('시간(s)');await page.locator('#gm-labely').fill('속력(m/s)');
    await page.locator('#gm-tab-func-btn').click();await page.locator('#gm-add-series').click();
    await page.locator('#gm-expr').fill('x');
    assert.equal(await page.locator('#gm-preview').evaluate(node=>{
      const frame=node.getBoundingClientRect(),caption=node.querySelector('[data-axisname="y"]').getBoundingClientRect();
      return caption.left>=frame.left && caption.right<=frame.right;
    }),true,'long axis caption fits the maker preview');
    assert.equal(await page.locator('#gm-send-exam').isVisible(),true,'graph maker exposes direct HWP action');
    await page.evaluate(()=>{
      window.examGraphEvents=[];
      window.addEventListener('5e:exam-send-graph',event=>examGraphEvents.push(structuredClone(event.detail)));
    });
    await page.locator('#gm-expr').fill('sin(');await page.locator('#gm-send-exam').click();
    assert.equal(await page.locator('#graph-modal-overlay').isVisible(),true,'invalid function stays editable');
    assert.ok((await page.locator('#gm-error').textContent()).trim());
    assert.equal((await h.drawing(page,stateUrl)).objects.length,0,'invalid direct send commits no objects');
    assert.equal(await page.evaluate(()=>examGraphEvents.length),0,'invalid formula emits no send event');
    await page.locator('#gm-expr').fill('x');
    if(engine==='chromium' && !surface) await page.screenshot({path:path.join(evidence,'graph-send-button.png')});
    await page.locator('#gm-send-exam').click();await page.locator('.capture-overlay').waitFor();
    assert.equal(await page.locator('#capture-confirm').isVisible(),true,'graph bounds are proposed for confirmation');
    const created=await h.drawing(page,stateUrl),plane=created.objects.find(object=>object.type==='coordplane');
    assert.ok(plane);assert.equal(created.objects.filter(object=>object.type==='funcgraph').length,1);
    assert.deepEqual(await page.evaluate(()=>examGraphEvents),[{pageId:created.activePageId,planeId:plane.id}],'one valid commit emits exactly one owned send event');
    await page.locator('#capture-confirm').click();await h.place(page);
    const first=(await h.pictures(page))[0];
    assert.equal(first.figure.source.pages[0].objects.filter(object=>object.type==='funcgraph')[0].expr,'x');
    const captionBounds=await page.evaluate(async ({stateUrl,id})=>{
      const {state}=await import(stateUrl),canvas=document.querySelector('#canvas');
      const node=[...canvas.querySelectorAll('#scene [data-id]')].find(node=>node.dataset.id===id);
      const rect=node.getBoundingClientRect(),matrix=canvas.getScreenCTM().inverse();
      const a=new DOMPoint(rect.left,rect.top).matrixTransform(matrix),b=new DOMPoint(rect.right,rect.bottom).matrixTransform(matrix);
      return {x:a.x,y:a.y,right:b.x,bottom:b.y};
    },{stateUrl,id:plane.id});
    const crop=first.figure.render.bounds;
    assert.ok(crop.x<=captionBounds.x && crop.y<=captionBounds.y && crop.x+crop.w>=captionBounds.right && crop.y+crop.h>=captionBounds.bottom,'graph crop includes axis captions outside the coordinate frame');
    await h.seedSourceLabel(page);
    const zoomPicture=(await h.pictures(page))[0];
    // A real paragraph below the inline image is the label-size reference.
    await page.evaluate(async () => {
      const frame=document.querySelector('#exam-studio iframe');
      const {RhwpExamBridge}=await import('/js/rhwp-exam-bridge.js?v=1.7.0-four-session-integration');
      const bridge=Object.assign(Object.create(RhwpExamBridge.prototype),{editor:{element:frame},deps:frame.contentWindow.rhwpStudio.plugins.deps}),ref=bridge.documentPictures()[0].ref;
      bridge.input.cursor.moveTo({sectionIndex:ref.sec,paragraphIndex:ref.ppi,charOffset:1});
      bridge.insertParagraph();bridge.insertText('① 시간에 따른 속력의 변화를 설명하시오.');
      bridge.insertParagraph();bridge.insertText('② 그래프의 라벨과 본문 글자 크기를 비교하시오.');
    });
    const before=await view(page);
    await h.doubleClick(page);await page.locator('#exam-inline-editor:not([hidden])').waitFor();await h.idle(page);
    const editing=await view(page),factor=editing.zoom/before.zoom;
    assert.ok(factor>1.3,'double click enlarges the document');
    assert.ok(Math.abs(editing.paperScale/before.paperScale-factor)<.02,'paper and body text use the same magnification');
    assert.ok(Math.abs(editing.geometry.w/before.geometry.w-factor)<.02,'picture projection follows document magnification');
    assert.ok(editing.geometry.y>=editing.viewport.y-2,'the whole picture begins below document controls');
    assert.ok(editing.toolbar.y>=editing.geometry.y+editing.geometry.h && editing.toolbar.y<=editing.geometry.y+editing.geometry.h+10,'simple toolbar is directly below the picture');
    assert.deepEqual((await h.pictures(page))[0].props,zoomPicture.props,'zoom does not change stored picture properties');
    await page.locator('[data-inline-field="text"]').fill('가속 구간');await page.locator('[data-inline-field="text"]').press('Tab');
    await page.locator('[data-inline-field="size"]').fill('10');await page.locator('[data-inline-field="size"]').press('Tab');
    if(engine==='chromium' && !surface) {
      await page.screenshot({path:path.join(evidence,'document-label-zoom.png')});
      await page.setViewportSize({width:760,height:900});
      await h.waitForState(page,()=>document.querySelector('.exam-inline-toolbar').getBoundingClientRect().right<=innerWidth);
      await page.screenshot({path:path.join(evidence,'document-label-narrow.png')});
      await page.setViewportSize({width:1440,height:950});
    }
    await page.locator('[data-inline-action="apply"]').click();await h.idle(page);
    assert.ok(Math.abs((await view(page)).zoom-before.zoom)<.001,'apply restores previous view zoom');
    const labeled=(await h.pictures(page))[0];assert.equal(labeled.figure.source.pages[0].objects.find(object=>object.type==='labeler').text,'가속 구간');
    // Native manual zoom remains a preference after leaving inline editing.
    await h.doubleClick(page);await h.idle(page);
    await page.evaluate(()=>document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().viewportManager.setZoom(1.25));
    await page.locator('[data-inline-action="close"]').click();await h.idle(page);
    assert.equal((await view(page)).zoom,1.25,'manual zoom is not undone on close');
    await page.evaluate(()=>document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().viewportManager.setZoom(1));
    // Edit and send the same graph through the same button: no second image.
    await h.action(page,'close');
    await page.evaluate(async ({graphUrl,id})=>(await import(graphUrl)).openGraphModal(id),{graphUrl,id:plane.id});
    await page.locator('#gm-tab-func-btn').click();await page.locator('#gm-expr').fill('2*x');
    await page.locator('#gm-send-exam').click();await page.locator('.capture-overlay').waitFor();
    await page.locator('#capture-confirm').click();await page.locator('.exam-placement:not([hidden])').waitFor();await h.idle(page);
    await page.locator('[data-exam-action="confirm-placement"]').click();await h.idle(page);
    const revised=await h.pictures(page);assert.equal(revised.length,1);assert.deepEqual(revised[0].figure.link,first.figure.link);
    assert.deepEqual(revised[0].figure.render.bounds,first.figure.render.bounds,'resend begins with the previous crop');
    assert.equal(revised[0].figure.source.pages[0].objects.find(object=>object.type==='funcgraph').expr,'2*x');
    assert.equal(revised[0].figure.source.pages[0].objects.find(object=>object.type==='labeler').text,'가속 구간');
    const download=page.waitForEvent('download');await h.action(page,'save');
    await (await download).saveAs(path.join(evidence,`${engine}-${surface ? 'preview' : 'root'}.5e`));
    assert.deepEqual(errors,[],'no browser renderer errors');
    console.log(`${engine}-${surface || 'root'}: real graph create/validate/send/resend, linked labels, document/context zoom and manual-view preference passed`);
  } finally {await context.close();await browser.close();}
}
fs.mkdirSync(evidence,{recursive:true});
h.withServer(async origin=>{
  for(const engine of process.env.EXAM_ENGINE ? [process.env.EXAM_ENGINE] : ['chromium','webkit'])
    for(const surface of process.env.EXAM_SURFACE ? [process.env.EXAM_SURFACE==='preview' ? 'preview/' : ''] : ['','preview/']) await scenario(origin,engine,surface);
}).catch(error=>{console.error(error);process.exitCode=1;});
