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
async function openedFloat(page){await page.waitForFunction(()=>document.body.classList.contains('exam-float-edit')&&!!document.querySelector('#exam-edit-bar:not([hidden])')?.getClientRects().length,null,{timeout:30000});await h.idle(page);}
async function closeFloat(page){await page.locator('#exam-edit-bar button',{hasText:'돌아가기'}).click();await page.waitForFunction(()=>!document.body.classList.contains('exam-editing')&&!document.body.classList.contains('exam-float-edit'));await h.idle(page);}
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
      await revealPicture(p);await monitor(p);await doubleClickPicture(p);await openedFloat(p);
      // 11-06 사용자: 두 번 누르면 5E_image로 넘어가지 않고, image와 똑같은 편집 화면이 한글 위 가운데 창으로 뜬다(한글은 뒤에 어둡게). 문서는 확대하지 않는다.
      const result=await finish(p);
      assert.ok(Math.abs(result.final-result.initial)<.002,'the document keeps its zoom while the editor floats');assert.equal(result.animating,false);
      const win=await p.evaluate(()=>{const a=document.querySelector('body>.app').getBoundingClientRect(),hwp=document.querySelector('#rhwp-exam-workspace');return {x:a.x,y:a.y,r:a.right,b:a.bottom,vw:innerWidth,vh:innerHeight,hwp:getComputedStyle(hwp).display,inert:hwp.inert};});
      assert.ok(win.x>=20&&win.y>=20&&win.r<=win.vw-20&&win.b<=win.vh-20,`the editor is a window with the document around it: ${JSON.stringify(win)}`);
      assert.notEqual(win.hwp,'none','the exam stays visible behind the window');assert.equal(win.inert,true,'the exam behind cannot be clicked');
      assert.equal(await p.locator('#exam-edit-bar').isVisible(),true,'apply / return actions are shown');
      assert.equal(await p.locator('.tool-btn[data-tool="V"]').first().isVisible(),true,'the same 5E_image tools are in the window');
      await p.screenshot({path:path.join(dir,engine+'-focused.png')});
      await closeFloat(p);
      // 움직임 줄이기: 떠오르기 없이 바로 창이 뜬다.
      await p.emulateMedia({reducedMotion:'reduce'});await doubleClickPicture(p);await openedFloat(p);
      assert.equal(await p.evaluate(()=>getComputedStyle(document.querySelector('body>.app')).animationName),'none','reduced motion skips the lift');
      await closeFloat(p);await p.emulateMedia({reducedMotion:'no-preference'});
      // 문서 배율은 편집 창을 열고 닫아도 그대로.
      await p.evaluate(()=>document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().viewportManager.setZoom(1.25));await h.idle(p);
      await doubleClickPicture(p).catch(async()=>{await revealPicture(p);await doubleClickPicture(p);});await openedFloat(p);await closeFloat(p);
      assert.equal(await p.evaluate(()=>document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().viewportManager.getZoom()),1.25,'manual zoom remains a user preference');
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
      await p.locator('.exam-figure').first().dblclick();await openedFloat(p);
      await p.screenshot({path:path.join(dir,engine+'-offscreen-focused.png')});
      await closeFloat(p);
      assert.deepEqual(errors,[]);reports.push({...result,engine,floating:true,reducedMotion:true,manualInterruption:true});
      console.log(`${engine}: ${result.pages} HWP pages, the 5E_image editor floats over the exam without zooming the document, offscreen picture, reduced motion and manual zoom preference passed`);
    }finally{await context.close();await browser.close();}
  }
  fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(reports,null,2));
}).catch(e=>{console.error(e);process.exitCode=1;});
