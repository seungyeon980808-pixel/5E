const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
const {timingCheck}=require('./helpers/performance-reference.cjs');
const dir=path.resolve(process.env.EVIDENCE_DIR||'_work/rhwp/verification/picture-controls/camera');

async function revealPicture(page){
  await page.evaluate(async()=>{const {RhwpExamBridge}=await import('/js/rhwp-exam-bridge.js?v=1.7.0-four-session-integration'),f=document.querySelector('#exam-studio iframe'),b=window.cameraBridge=Object.assign(Object.create(RhwpExamBridge.prototype),{editor:{element:f},deps:f.contentWindow.rhwpStudio.plugins.deps}),ref=b.documentPictures()[0].ref,m=b.input.viewportManager;let page=0;for(;page<b.wasm.pageCount;page++)if(b.wasm.getPageControlLayout(page).controls.some(c=>c.type==='image'&&c.secIdx===ref.sec&&c.paraIdx===ref.ppi&&c.controlIdx===ref.ci))break;ref.pageIndex=page;window.cameraRef=ref;m.setScrollTop(b.input.virtualScroll.getPageOffset(page));});
  await h.waitForState(page,()=>!!window.cameraBridge.figureGeometry(window.cameraRef));
}
async function doubleClickPicture(page){const g=await page.evaluate(()=>window.cameraBridge.figureGeometry(window.cameraRef));assert.ok(g,'selected page is rendered');await page.mouse.dblclick(g.x+g.w*.4,g.y+g.h*.4);}
async function monitor(page){await page.evaluate(async()=>{
  const {RhwpExamBridge}=await import('/js/rhwp-exam-bridge.js?v=1.7.0-four-session-integration'),f=document.querySelector('#exam-studio iframe');
  const b=Object.assign(Object.create(RhwpExamBridge.prototype),{editor:{element:f},deps:f.contentWindow.rhwpStudio.plugins.deps});
  const ref=b.documentPictures()[0].ref,input=b.input,m=input.viewportManager;
  const profile=window.cameraProfile={frames:[],active:true,initial:m.getZoom(),pages:b.wasm.pageCount};
  profile.stop=()=>{profile.active=false;};
  function sample(time){if(!profile.active)return;const g=b.figureGeometry(ref),rendered=[...f.contentDocument.querySelectorAll('.document-page-canvas')].map(c=>Number(c.dataset.rhwpRenderedZoom)).filter(z=>z>0);profile.frames.push({time,zoom:m.getZoom(),animating:m.isZoomAnimating(),rendered,x:m.getScrollX(),y:m.getScrollY(),cx:g?.x+g?.w/2,cy:g?.y+g?.h/2});requestAnimationFrame(sample);}
  requestAnimationFrame(sample);
});}
async function finish(page){return page.evaluate(async()=>{
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const p=window.cameraProfile;p.stop();const d=document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps;
  const m=d.getInputHandler().viewportManager;return {frames:p.frames,initial:p.initial,final:m.getZoom(),animating:m.isZoomAnimating(),pages:p.pages};
});}

h.withServer(async origin=>{
  fs.mkdirSync(dir,{recursive:true});const reports=[];
  for(const [engine,type]of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)){
    const browser=await type.launch(),context=await browser.newContext({viewport:{width:1440,height:950},acceptDownloads:true}),p=await context.newPage(),errors=[];
    p.on('pageerror',e=>errors.push(e.message));await p.route('**/api/**',r=>r.abort());
    try{
      await h.navigate(p,origin+'/?mode=pro&mobile=0&exam=1',{waitUntil:'domcontentloaded'});await h.ready(p);await h.action(p,'demo');await h.idle(p);
      // Build a real multi-page HWP, export it, then open it through the native
      // file path. This exercises virtualization beyond the one-page demo.
      const pages=await p.evaluate(()=>{
        const d=document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps,w=d.wasm;
        let para=w.getParagraphCount(0)-1,offset=w.getParagraphLength(0,para);
        for(let i=0;i<300;i++){
          const next=w.splitParagraph(0,para,offset,null);para=next.paraIdx;
          const text=`${i+1}. 전류와 전압의 관계를 설명하시오. 그림의 라벨과 본문 크기를 비교합니다. ` .repeat(4);
          w.insertText(0,para,0,text);offset=text.length;
        }
        d.eventBus.emit('document-changed');return w.pageCount;
      });
      assert.ok(pages>=10,'fixture exercises a multi-page document');
      const download=p.waitForEvent('download');await h.action(p,'export-hwp');const file=await download,target=path.join(dir,engine+'-multipage.hwp');await file.saveAs(target);await h.idle(p);
      await h.action(p,'new');await h.idle(p);await h.nativeOpen(p,target);
      await revealPicture(p);await monitor(p);await doubleClickPicture(p);await p.locator('#exam-inline-editor:not([hidden])').waitFor();await h.idle(p);
      const result=await finish(p),animated=result.frames.filter(f=>f.animating);
      assert.ok(animated.length>=4,'camera is interpolated over multiple frames');assert.ok(result.final>result.initial,'whole document enlarges');assert.equal(result.animating,false);
      for(const f of animated)for(const z of f.rendered)assert.ok(Math.abs(z-result.initial)<.002,'intermediate camera frames reuse the initial page rasters');
      const finalZooms=result.frames.filter(f=>!f.animating&&Math.abs(f.zoom-result.final)<.002).flatMap(f=>f.rendered);assert.ok(finalZooms.some(z=>Math.abs(z-result.final)<.002),'final view receives a raster at the final zoom');
      for(let i=1;i<animated.length;i++)assert.ok(animated[i].zoom>=animated[i-1].zoom-.0001,'zoom never reverses');
      const gaps=animated.slice(1).map((f,i)=>f.time-animated[i].time),maxFrameMs=Math.max(...gaps);
      timingCheck(maxFrameMs<90,`animation has no long frame stalls: ${maxFrameMs}ms`);
      const last=animated.at(-1),settled=result.frames.find(f=>f.time>last.time&&!f.animating);
      const settleJump=settled?Math.hypot(settled.cx-last.cx,settled.cy-last.cy):0;
      assert.ok(settleJump<5,`final raster does not jump away from camera preview: ${settleJump}px`);
      const heading=await p.locator('.exam-inline-image-heading').boundingBox(),image=await p.locator('.exam-inline-picture').boundingBox();assert.ok(heading.y+heading.height<=image.y-4,'edit actions remain above the image');
      await p.screenshot({path:path.join(dir,engine+'-focused.png')});
      await p.locator('[data-inline-action="close"]').click();await h.idle(p);
      await p.emulateMedia({reducedMotion:'reduce'});await monitor(p);await doubleClickPicture(p);await h.idle(p);const reduced=await finish(p);assert.ok(reduced.frames.filter(f=>f.animating).length<=1,'reduced motion skips tween');assert.equal(reduced.animating,false);
      await p.locator('[data-inline-action="close"]').click();await h.idle(p);await p.emulateMedia({reducedMotion:'no-preference'});
      const zoomStarted=h.waitForState(p,()=>document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().viewportManager.isZoomAnimating());await doubleClickPicture(p);await zoomStarted;
      // Manual zoom owns the camera as soon as the user interrupts the tween.
      await p.evaluate(()=>document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().viewportManager.setZoom(1.25));
      await h.idle(p);await p.locator('[data-inline-action="close"]').click();await h.idle(p);
      assert.equal(await p.evaluate(()=>document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().viewportManager.getZoom()),1.25,'interrupted manual zoom remains a user preference');
      // The list can open a picture on an unrendered page. The earlier camera
      // journey started with revealPicture(), so it never covered that case.
      await p.evaluate(()=>{
        const b=window.cameraBridge,w=b.wasm;
        for(let i=0;i<100;i++){
          w.splitParagraph(0,0,0,null);
          w.insertText(0,0,0,`${i+1}. 앞쪽 본문을 읽은 뒤 다른 쪽의 그림을 편집합니다. `.repeat(4));
        }
        b.deps.eventBus.emit('document-changed');b.picturesCache=null;b.paintCacheRevision=null;
      });
      const offscreenDownload=p.waitForEvent('download');await h.action(p,'export-hwp');
      const offscreenFile=await offscreenDownload,offscreenTarget=path.join(dir,engine+'-offscreen.hwp');await offscreenFile.saveAs(offscreenTarget);await h.idle(p);
      await h.action(p,'new');await h.idle(p);await h.nativeOpen(p,offscreenTarget);
      await p.evaluate(()=>{
        const b=window.cameraBridge,m=b.input.viewportManager;b.picturesCache=null;b.paintCacheRevision=null;
        window.cameraRef=b.documentPictures()[0].ref;m.setZoom(1);m.setScrollTop(0);
      });
      await h.waitForState(p,()=>!window.cameraBridge.figureGeometry(window.cameraRef));
      await p.locator('.exam-figure').first().click();
      await h.waitForState(p,()=>{const b=window.cameraBridge,g=b.figureGeometry(window.cameraRef),v=b.figureViewport();return g&&g.y>=v.y&&g.y+g.h<=v.y+v.h;});
      await p.evaluate(()=>window.cameraBridge.input.viewportManager.setScrollTop(0));
      await h.waitForState(p,()=>!window.cameraBridge.figureGeometry(window.cameraRef));
      await p.locator('.exam-figure').first().dblclick();await h.idle(p);
      await h.waitForState(p,()=>{const b=window.cameraBridge,g=b.figureGeometry(window.cameraRef),v=b.figureViewport();return !document.querySelector('#exam-inline-editor').hidden&&g&&g.x>=v.x&&g.y>=v.y&&g.x+g.w<=v.x+v.w&&g.y+g.h<=v.y+v.h;});
      const offscreenHeading=await p.locator('.exam-inline-image-heading').boundingBox(),offscreenImage=await p.locator('.exam-inline-picture').boundingBox(),offscreenToolbar=await p.locator('.exam-inline-toolbar').boundingBox();
      assert.ok(offscreenHeading.y+offscreenHeading.height<=offscreenImage.y-4,'offscreen picture keeps its apply actions above the image');
      assert.ok(offscreenToolbar.y>offscreenImage.y+offscreenImage.height,'editing tools leave the picture visible');
      await p.screenshot({path:path.join(dir,engine+'-offscreen-focused.png')});
      await p.locator('[data-inline-action="close"]').click();await h.idle(p);
      assert.deepEqual(errors,[]);reports.push({...result,engine,maxFrameMs,settleJump,reducedMotion:true,manualInterruption:true});
      console.log(`${engine}: ${result.pages} HWP pages, ${animated.length} camera frames, max ${maxFrameMs.toFixed(1)}ms, reused page rasters, settle jump ${settleJump.toFixed(2)}px`);
    }finally{await context.close();await browser.close();}
  }
  fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(reports,null,2));
}).catch(e=>{console.error(e);process.exitCode=1;});
