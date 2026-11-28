const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {fixture, verifiedPlan, snapshot} = require('./fixtures/ai-image-label-workflow.cjs');

// 11-27: 변환에도 「AI와 대화 / 직접 편집」이 생겨 지우개·라벨 편집 단추가 직접 편집 칸으로 옮겨졌다 — 먼저 직접 편집으로 들어간다.
async function toolClick(scope, sel) {
  const b = scope.locator(sel), before = await b.getAttribute('aria-pressed').catch(() => null);
  const manual = scope.locator('[data-result-mode="manual"]');
  if (await manual.isVisible().catch(() => false) && await manual.getAttribute('aria-pressed') !== 'true') {
    await manual.click(); await scope.page().waitForTimeout(400); // 칸 바뀜 애니메이션이 끝난 뒤
    if (sel.includes('label-edit') && before !== 'true' && await b.getAttribute('aria-pressed') === 'true') return;
  }
  if (await b.isVisible()) await b.click(); else await b.dispatchEvent('click');
}

const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/feedback/parts/local-edit-save');
fs.mkdirSync(evidence, {recursive:true});

test('eraser hover keeps the latest footprint per paint and cancels queued cursors',{timeout:90000},async t=>{
  const dir=path.join(evidence,'hover-paint');fs.mkdirSync(dir,{recursive:true});
  const {page,errors}=await fixture(t,1,dir,{selectedPartial:true,unlabeled:true});
  const panel=page.locator('#ai-image-panel'),saved=(await snapshot(page))[0].generated;
  await toolClick(panel,'[data-ai-local-erase]');
  const img=panel.locator('.ai-generated-card.is-ai-active-candidate .ai-preview-stage > img'),r=await img.boundingBox();
  await page.mouse.move(r.x+r.width*.35,r.y+r.height*.75);
  await panel.locator('.ai-local-erase-cursor').waitFor();
  const result=await page.evaluate(async()=>{
    const img=document.querySelector('#ai-image-panel .ai-generated-card.is-ai-active-candidate .ai-preview-stage > img'),r=img.getBoundingClientRect();
    let writes=0;
    const observer=new MutationObserver(records=>{writes+=records.filter(rec=>rec.target.matches?.('.ai-local-erase-cursor circle')).length;});
    observer.observe(img.parentElement,{subtree:true,attributes:true});
    for(let i=0;i<240;i++)img.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:77,pointerType:'mouse',isPrimary:true,buttons:0,clientX:r.left+r.width*(.25+i/240*.4),clientY:r.top+r.height*.75}));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));observer.disconnect();
    const circle=document.querySelector('.ai-local-erase-cursor circle');
    return{writes,cx:Number(circle.getAttribute('cx')),cy:Number(circle.getAttribute('cy')),radius:Number(circle.getAttribute('r'))};
  });
  fs.writeFileSync(path.join(dir,'burst.json'),JSON.stringify(result,null,2));
  assert.ok(result.writes<=12,'hover must not rebuild the footprint for every input before the next paint: '+result.writes);
  assert.ok(Math.abs(result.cx-(.25+239/240*.4)*512)<.01,'the footprint follows the last input, not the first');
  assert.equal(result.cy,288);assert.equal(result.radius,12);
  // The next frame must read the live geometry, rather than cache image bounds.
  const zoom=await page.evaluate(async()=>{
    const panel=document.querySelector('#ai-image-panel'),img=panel.querySelector('.ai-generated-card.is-ai-active-candidate .ai-preview-stage > img'),r=img.getBoundingClientRect();
    const x=r.left+r.width*.5,y=r.top+r.height*.5;
    img.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:77,clientX:x,clientY:y}));
    panel.querySelector('[data-ai-zoom-action="in"]').click();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const after=img.getBoundingClientRect(),circle=panel.querySelector('.ai-local-erase-cursor circle');
    return{cx:Number(circle?.getAttribute('cx')),cy:Number(circle?.getAttribute('cy')),expectedX:(x-after.left)/after.width*512,expectedY:(y-after.top)/after.height*384,widthBefore:r.width,widthAfter:after.width};
  });
  assert.ok(zoom.widthAfter>zoom.widthBefore);assert.ok(Math.abs(zoom.cx-zoom.expectedX)<.01);assert.ok(Math.abs(zoom.cy-zoom.expectedY)<.01);
  const cancelQueued=async action=>page.evaluate(async action=>{
    const panel=document.querySelector('#ai-image-panel'),img=panel.querySelector('.ai-generated-card.is-ai-active-candidate .ai-preview-stage > img'),r=img.getBoundingClientRect();
    img.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:77,clientX:r.left+r.width*.5,clientY:r.top+r.height*.5}));
    if(action==='leave')img.dispatchEvent(new PointerEvent('pointerleave',{bubbles:false,pointerId:77}));
    else if(action==='cancel')img.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:77}));
    else if(action==='tool')panel.querySelector('[data-ai-local-erase]').click();
    else await __task2Manager.dispose();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return panel.querySelectorAll('.ai-local-erase-cursor').length;
  },action);
  for(const action of ['leave','cancel','tool'])assert.equal(await cancelQueued(action),0,'queued footprint is removed on '+action);
  await toolClick(panel,'[data-ai-local-erase]');
  assert.equal(await cancelQueued('dispose'),0,'queued footprint cannot outlive its workspace');
  assert.deepEqual((await snapshot(page))[0].generated,saved);assert.equal(await page.evaluate(()=>__task2.sends.length),0);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({engine:process.env.TASK2_ENGINE,result,zoom,cancelled:['leave','cancel','tool','dispose'],savedUnchanged:true,paidAiCalls:0,errors},null,2));
});

test('an oversized brush gesture never silently truncates and erases a shortcut to its final point',{timeout:90000},async t=>{
  const dir=path.join(evidence,'long-gesture');fs.mkdirSync(dir,{recursive:true});
  const {page,errors}=await fixture(t,1,dir,{selectedPartial:true,unlabeled:true});
  const panel=page.locator('#ai-image-panel'),saved=(await snapshot(page))[0].generated;
  await toolClick(panel,'[data-ai-local-erase]');
  const source=await panel.locator('.ai-generated-card.is-ai-active-candidate .ai-preview-stage > img').getAttribute('src');
  await page.evaluate(()=>{
    const img=document.querySelector('#ai-image-panel .ai-generated-card.is-ai-active-candidate .ai-preview-stage > img'),r=img.getBoundingClientRect();
    const send=(type,x,y)=>img.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:91,pointerType:'mouse',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,clientX:r.left+x/512*r.width,clientY:r.top+y/384*r.height}));
    send('pointerdown',45,60);
    for(let i=0;i<4100;i++)send('pointermove',i%2?45:90,60);
    // The final L-shaped detour must never become a diagonal shortcut from
    // the last sample retained before the path cap.
    send('pointermove',90,250);send('pointermove',330,250);send('pointerup',330,250);
  });
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel [data-ai-status]').textContent.includes('짧게 나누어')).catch(async error=>{
    const diagnostic=await page.evaluate(()=>{
      const p=document.querySelector('#ai-image-panel'),img=p.querySelector('.ai-generated-card.is-ai-active-candidate .ai-preview-stage > img'),c=document.createElement('canvas');c.width=512;c.height=384;
      const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
      return {draft:p.dataset.aiEditDraft,status:p.querySelector('[data-ai-status]').textContent,unvisitedPixel:[...ctx.getImageData(200,160,1,1).data]};
    });
    fs.writeFileSync(path.join(dir,'failure.json'),JSON.stringify(diagnostic,null,2));throw error;
  });
  assert.equal(await panel.getAttribute('data-ai-edit-draft'),'false','no unfaithful brush mask is applied');
  assert.equal(await panel.locator('.ai-generated-card.is-ai-active-candidate .ai-preview-stage > img').getAttribute('src'),source);
  assert.deepEqual((await snapshot(page))[0].generated,saved);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({oversizedGestureCancelled:true,bitmapUnchanged:true,savedVersionsUnchanged:true,errors},null,2));
});

for (const rejected of [false, true]) {
  test(`late local preview ${rejected ? 'failure' : 'completion'} cannot overwrite another candidate status`, {timeout:90000}, async t => {
    const dir=path.join(evidence, rejected ? 'late-preview-error' : 'late-preview-success');fs.mkdirSync(dir,{recursive:true});
    const {page,errors}=await fixture(t,1,dir,{selectedPartial:true,beforeNavigate:async page=>{
      await page.addInitScript(()=>{
        window.__seedReady=window.__seedReady.then(()=>new Promise((resolve,reject)=>{
          const request=indexedDB.open('5e.preview:5e-ai-image-tasks',1);
          request.onsuccess=()=>{
            const db=request.result,tx=db.transaction('tasks','readwrite'),store=tx.objectStore('tasks'),read=store.get('workspace');
            read.onsuccess=()=>{const record=read.result,tab=record.tabs[0];tab.generated.push({...structuredClone(tab.generated[0]),id:'alternate-0',name:'다른 수정본',comments:[]});store.put(record);};
            tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
          };request.onerror=()=>reject(request.error);
        }));
      });
      const source=fs.readFileSync(path.resolve(__dirname,'../js/ai-image-local-erase.js'),'utf8');
      const seam='try { await previewChanged(item); }';
      assert.equal(source.split(seam).length-1,1,'one retained preview callback');
      await page.route('**/js/ai-image-local-erase.js*',route=>route.fulfill({contentType:'text/javascript',body:source.replace(seam,
        'try { await previewChanged(item); if(window.__holdLocalPreview) { window.__holdLocalPreview=false; await new Promise((resolve,reject)=>{window.__heldLocalPreview={resolve,reject};}).finally(()=>{window.__heldLocalPreviewSettled=true;}); } }')}));
    }});
    const panel=page.locator('#ai-image-panel'),saved=(await snapshot(page))[0].generated;
    await toolClick(panel,'[data-ai-local-erase]');
    await page.evaluate(()=>{window.__holdLocalPreview=true;});
    const box=await panel.locator('.ai-generated-card.is-ai-active-candidate .ai-preview-stage > img').last().boundingBox();
    await page.mouse.move(box.x+40/512*box.width,box.y+90/384*box.height);await page.mouse.down();
    await page.mouse.move(box.x+40/512*box.width,box.y+180/384*box.height,{steps:5});await page.mouse.up();
    await page.waitForFunction(()=>Boolean(window.__heldLocalPreview));
    await panel.locator('[data-ai-version-button]').click();await panel.locator('[data-ai-candidate-option="alternate-0"]').click();
    await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId==='alternate-0');
    const before=await panel.locator('[data-ai-status]').innerText();
    await page.evaluate(rejected=>{const gate=window.__heldLocalPreview;rejected?gate.reject(new Error('오래된 미리보기 오류')):gate.resolve();},rejected);
    await page.waitForFunction(()=>window.__heldLocalPreviewSettled===true);
    await page.evaluate(()=>new Promise(requestAnimationFrame));
    assert.equal(await panel.locator('[data-ai-status]').innerText(),before,'late preview may not report a saved/failed edit against the newly selected candidate');
    assert.deepEqual((await snapshot(page))[0].generated,saved,'late preview never changes saved candidates');
    assert.equal(await panel.locator('[data-ai-edit-save]').isVisible(),false,'the alternate candidate has no draft');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({rejected,statusUnchanged:true,savedCandidatesUnchanged:true,paidAiCalls:0,errors},null,2));
  });
}

test('manual edits stay a draft until one save; hover, labels, cancel and task boundaries', {timeout:90000}, async t => {
  const plan = {...structuredClone(verifiedPlan), frozen:true, status:'ready', qualityReview:{verdict:'pass'}};
  plan.labels[0].anchor = {...plan.labels[0].leaderRoutes[0].target};
  const {page, errors} = await fixture(t, 2, evidence, {selectedPartial:true, beforeNavigate: async page => {
    await page.addInitScript(plan => {
      window.__seedReady = window.__seedReady.then(() => new Promise((resolve, reject) => {
        const request = indexedDB.open('5e.preview:5e-ai-image-tasks', 1);
        request.onsuccess = () => {
          const db=request.result, tx=db.transaction('tasks','readwrite'), store=tx.objectStore('tasks'), read=store.get('workspace');
          read.onsuccess=()=>{
            const record=read.result;
            for(const tab of record.tabs) {
              const item=tab.generated[0];item.data=window.__task2.modified; item.labelPlan=structuredClone(plan);
              item.reviewState='scoped-applied'; item.sourceReferenceId=tab.attachments[0].id;
              tab.labelPreviewIncluded = {[item.id]:tab.id==='task-0'};
            }
            store.put(record);
          };
          tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
        };request.onerror=()=>reject(request.error);
      }));
    }, plan);
  }});
  const panel=page.locator('#ai-image-panel');
  const selectedImage=()=>panel.locator('.ai-generated-card.is-ai-active-candidate .ai-preview-stage > img').last();
  const original=(await snapshot(page))[0].generated[0];
  const image=selectedImage(); await image.waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('[data-ai-label-toggle]')?.getAttribute('aria-checked')==='true');
  await toolClick(panel,'[data-ai-local-erase]');
  // 11-26: 「지운 자리」 기본값이 흰색이 되었다 — 첫 획은 투명을 골라 두 방식을 모두 확인한다.
  assert.equal(await panel.locator('[data-ai-erase-background]').inputValue(),'white');
  await panel.locator('[data-ai-erase-background]').selectOption('transparent');
  const naturalPoint=async ([x,y])=>{const b=await selectedImage().boundingBox();return{x:b.x+x/512*b.width,y:b.y+y/384*b.height};};
  const hover=await naturalPoint([120,100]);await page.mouse.move(hover.x,hover.y);
  const ring=panel.locator('.ai-local-erase-cursor'); await ring.waitFor();
  assert.equal(await panel.locator('[data-ai-erase-size]').inputValue(),'24','brush starts at 24 source-image pixels (시안 v6, 11-25)');
  const circle=ring.locator('circle').first();assert.equal(await circle.getAttribute('r'),'12');
  const visibleRadius=(await circle.boundingBox()).width;
  assert.ok(Math.abs(visibleRadius-3-24/512*(await image.boundingBox()).width)<2,'cursor uses image-pixel diameter at the actual zoom: '+JSON.stringify({ring:visibleRadius,image:(await image.boundingBox()).width,overlay:await ring.boundingBox()}));
  assert.deepEqual((await snapshot(page))[0].generated, [original], 'hover changes no saved pixels or revisions');
  await panel.locator('[data-ai-zoom-action="in"]').click();
  const zoomedPoint=await naturalPoint([120,100]);await page.mouse.move(zoomedPoint.x,zoomedPoint.y);
  await ring.waitFor();
  assert.ok(Math.abs((await circle.boundingBox()).width-3-24/512*(await image.boundingBox()).width)<2,'hover footprint follows the zoomed image');
  const stroke=async points=>{
    const screen=[];for(const p of points)screen.push(await naturalPoint(p));
    await page.mouse.move(screen[0].x,screen[0].y);await page.mouse.down();
    for(const p of screen.slice(1))await page.mouse.move(p.x,p.y,{steps:5});await page.mouse.up();
    await page.waitForFunction(()=>{const b=document.querySelector('[data-ai-edit-save]');return b&&!b.hidden&&!b.disabled;});
  };
  await stroke([[40,90],[40,180]]);
  await panel.locator('[data-ai-erase-mode="rect"]').click();
  assert.equal(await ring.count(),0,'rectangle eraser uses a crosshair instead of a brush footprint');
  await panel.locator('[data-ai-erase-background]').selectOption('white');
  const a=await naturalPoint([80,320]),b=await naturalPoint([160,340]);
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});
  const area=panel.locator('.ai-local-erase-overlay rect');await area.waitFor();
  await page.waitForFunction(()=>Number(document.querySelector('.ai-local-erase-overlay rect')?.getAttribute('width'))>70);
  assert.ok(Number(await area.getAttribute('width'))>70,'rectangle shows the area before release');
  await page.mouse.up();await page.waitForFunction(()=>!document.querySelector('[data-ai-edit-save]').disabled);
  assert.deepEqual((await snapshot(page))[0].generated,[original], 'two completed gestures are still one unsaved draft');
  await page.screenshot({path:path.join(evidence,'draft.png')});
  assert.equal(await panel.locator('[data-ai-label-toggle]').getAttribute('aria-checked'),'true');
  await panel.locator('[data-ai-insert-selected]').click();
  assert.equal(await panel.isVisible(),true,'unsaved edits cannot silently output the old version');
  assert.match(await panel.locator('[data-ai-status]').innerText(),/수정 저장/);
  await panel.locator('[data-ai-label-toggle]').click();
  assert.equal(await panel.locator('[data-ai-edit-save]').isVisible(),true,'label OFF does not discard edits');
  const draftBitmap=await selectedImage().getAttribute('src'); assert.notEqual(draftBitmap,original.data);
  const historyReady=()=>page.waitForFunction(()=>!document.querySelector('[data-ai-edit-undo]').disabled || !document.querySelector('[data-ai-edit-redo]').disabled);
  await panel.locator('[data-ai-edit-undo]').click();await historyReady();
  const firstStrokeBitmap=await selectedImage().getAttribute('src');assert.notEqual(firstStrokeBitmap,draftBitmap);
  await panel.locator('[data-ai-edit-undo]').click();await historyReady();
  assert.equal(await selectedImage().getAttribute('src'),original.data,'undoing both strokes restores the saved image exactly');
  assert.equal(await panel.locator('[data-ai-edit-save]').isVisible(),false,'undo to the base does not create an empty revision');
  assert.equal(await panel.locator('[data-ai-edit-undo]').isDisabled(),true);
  await page.keyboard.press('Meta+Shift+Z');await historyReady();
  assert.ok(await selectedImage().getAttribute('src')===firstStrokeBitmap,'keyboard redo restores only the first gesture');
  await panel.locator('[data-tab-id="task-1"]').click();
  await page.waitForFunction(()=>{
    const panel=document.querySelector('#ai-image-panel'), card=panel.querySelector('.ai-generated-card.is-ai-active-candidate');
    const img=card?.querySelector('.ai-preview-stage > img');
    return panel.dataset.aiSelectedCandidateId==='selected-1' && card?.dataset.aiCandidateId==='selected-1' && img?.complete && img.naturalWidth===512;
  });
  assert.equal(await panel.locator('[data-ai-edit-save]').isVisible(),false,'draft is scoped to its candidate');
  assert.equal(await panel.locator('[data-ai-edit-undo]').isDisabled(),true,'another task cannot undo this candidate');
  assert.equal(await panel.locator('[data-ai-edit-redo]').isDisabled(),true);
  await panel.locator('[data-tab-id="task-0"]').click();
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId==='selected-0');
  await panel.locator('[data-ai-edit-save]').waitFor({state:'visible'});
  await panel.locator('[data-ai-edit-redo]').click();await historyReady();
  assert.equal(await selectedImage().getAttribute('src'),draftBitmap,'returning to a task retains its unsaved bitmap');
  assert.deepEqual((await snapshot(page))[0].generated,[original],'undo and redo never create saved revisions or mutate the parent');
  await panel.locator('[data-ai-label-toggle]').click();
  await panel.locator('[data-ai-edit-save]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#ai-image-panel .ai-generated-card').length===2);
  const saved=(await snapshot(page))[0].generated;
  assert.equal(saved.length,2);assert.deepEqual(saved[0],original,'the parent and its verified metadata remain untouched');
  await panel.locator('[data-ai-version-button]').click();
  await panel.locator('[data-ai-candidate-option="selected-0"]').click();
  await panel.locator('[data-ai-label-toggle]').click();
  await page.waitForFunction(data=>document.querySelector('#ai-image-panel .ai-generated-card.is-ai-active-candidate img').src===data, original.data);
  await panel.locator('[data-ai-version-button]').click();
  await panel.locator(`[data-ai-candidate-option="${saved[1].id}"]`).click();
  const child=saved[1];assert.notEqual(child.data,original.data);assert.deepEqual(child.labelPlan.labels,plan.labels);
  assert.equal(child.labelPlan.qualityReview,undefined,'old visual approval is not transferred to edited pixels');
  assert.equal(child.candidateSha256,null);assert.equal(child.scopedEditHistory.length,2);
  assert.equal(await panel.locator('[data-ai-label-toggle]').getAttribute('aria-checked'),'true','label ON carries to the saved revision');
  const pixels=await page.evaluate(async data=>{const {decodeScopedPng}=await import('/js/ai-scoped-edit-png.js?v=1.7.0-four-session-integration');const p=await decodeScopedPng(Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0)));const at=(x,y)=>[...p.data.slice((y*p.width+x)*4,(y*p.width+x)*4+4)];return{erased:at(40,120),white:at(120,330),untouched:at(460,120)};},child.data);
  assert.deepEqual(pixels,{erased:[0,0,0,0],white:[255,255,255,255],untouched:[17,17,17,255]});
  const beforeDiscard=(await snapshot(page))[0].generated;
  await toolClick(panel,'[data-ai-local-erase]');await panel.locator('[data-ai-erase-mode="brush"]').click();
  await stroke([[460,90],[460,170]]);
  await panel.locator('[data-ai-edit-discard]').click();
  await panel.locator('[data-ai-edit-save]').waitFor({state:'hidden'});
  assert.equal(await panel.locator('[data-ai-edit-save]').isVisible(),false);assert.deepEqual((await snapshot(page))[0].generated,beforeDiscard);
  assert.equal(await panel.locator('[data-ai-edit-redo]').isDisabled(),true,'discard removes the unsaved history');
  await panel.locator('[data-ai-label-toggle]').click();
  await toolClick(panel,'[data-ai-local-erase]');
  await stroke([[460,200],[460,280]]);await page.keyboard.press('Escape');
  assert.equal(await panel.locator('[data-ai-edit-save]').isVisible(),true,'closing the tool retains completed edits');
  await panel.locator('[data-ai-edit-save]').click();
  // 11-26 시안(판 목록 8): 손으로 고친 판을 다시 저장하면 새 판을 만들지 않고 같은 판에 덮어쓴다.
  const overwritten=await page.evaluate(()=>document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId);
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiEditDraft!=='true'&&!document.querySelector('#ai-image-panel [data-ai-edit-save]:not([hidden])'));
  assert.equal(await page.evaluate(()=>document.querySelectorAll('#ai-image-panel .ai-generated-card').length),2,'re-saving a hand-edited version overwrites it');
  assert.equal(await page.evaluate(()=>document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId),overwritten);
  assert.equal(await panel.locator('[data-ai-label-toggle]').getAttribute('aria-checked'),'false','label OFF carries to the next saved revision');
  await panel.locator('[data-ai-label-toggle]').click();
  await panel.locator('[data-ai-insert-selected]').click();
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel').hidden);
  const objects=await page.evaluate(()=>window.__candidateQA.state.get().objects);
  assert.ok(objects.some(o=>o.aiAutoLabel && o.text==='전자'),'saved local bitmap still outputs an editable native label');
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>window.__task2.sends.length),0);
  fs.writeFileSync(path.join(evidence,'receipt.json'),JSON.stringify({engine:process.env.TASK2_ENGINE||'chromium',savedRevisions:2,overwroteLocalVersion:true,gesturesInFirstSave:2,defaultBrushDiameter:24,undoRedo:true,historyScopedToCandidate:true,pixels,editableLabelOutput:true,paidAiCalls:0,errors},null,2));
});

test('empty margins cancel tools without edits; a new stroke replaces the undone branch', {timeout:90000}, async t => {
  const dir=path.join(evidence,'history-branch');fs.mkdirSync(dir,{recursive:true});
  const {page,errors}=await fixture(t,2,dir,{selectedPartial:true});
  const panel=page.locator('#ai-image-panel');
  const image=()=>panel.locator('.ai-generated-card.is-ai-active-candidate .ai-preview-stage > img').last();
  await image().waitFor({state:'visible'});
  const original=(await snapshot(page))[0].generated[0];
  const canvasBefore=await page.evaluate(()=>JSON.stringify(window.__candidateQA.state.get().objects));
  const blank=async()=>page.evaluate(()=>{
    const card=document.querySelector('.ai-generated-card.is-ai-active-candidate'), r=card.getBoundingClientRect();
    const img=card.querySelector('.ai-preview-stage > img'), ir=img.getBoundingClientRect();
    for(const y of [r.top+60,r.top+100,r.bottom-8])for(const x of [r.left+12,r.left+r.width/2,r.right-12]) {
      const target=document.elementFromPoint(x,y);
      if(target && card.contains(target) && !(x>=ir.left&&x<=ir.right&&y>=ir.top&&y<=ir.bottom)
        && !target.closest('button,input,textarea,select,svg'))return{x,y};
    }
    throw new Error('Fixture needs a visible empty image margin');
  });
  await toolClick(panel,'[data-ai-local-erase]');
  const margin=await blank();await page.mouse.click(margin.x,margin.y);
  assert.equal(await panel.locator('[data-ai-local-erase]').getAttribute('aria-pressed'),'false');
  assert.equal(await panel.locator('[data-ai-edit-save]').isVisible(),false);
  assert.deepEqual((await snapshot(page))[0].generated,[original],'clicking an empty margin changes no pixels');
  await panel.locator('[data-ai-comment-tool="area"]').click();await page.mouse.click(margin.x,margin.y);
  assert.equal(await panel.locator('[data-ai-comment-tool="area"]').getAttribute('aria-pressed'),'false');
  const stroke=async(x,y)=>{
    const r=await image().boundingBox();await page.mouse.click(r.x+x/512*r.width,r.y+y/384*r.height);
    await page.waitForFunction(()=>{const b=document.querySelector('[data-ai-edit-save]');return b&&!b.hidden&&!b.disabled;});
  };
  await toolClick(panel,'[data-ai-local-erase]');
  await panel.locator('[data-ai-erase-background]').selectOption('white');
  assert.equal(await panel.locator('[data-ai-local-erase]').getAttribute('aria-pressed'),'true','tool settings do not dismiss the tool');
  await stroke(40,120);const first=await image().getAttribute('src');
  for(const width of [1440,1080]) {
    await page.setViewportSize({width,height:1000});
    await page.waitForTimeout(350); // 11-27: 변환도 칸 너비가 200ms 동안 바뀐다 — 끝난 뒤에 잰다
    await panel.locator('[data-ai-edit-undo]').waitFor({state:'visible'});
    const a=await panel.locator('[data-ai-edit-undo]').boundingBox(),b=await panel.locator('[data-ai-edit-redo]').boundingBox();
    assert.ok(Math.abs(a.y-b.y)<2 && b.x>=a.x+a.width,'history controls remain on one row at width '+width);
    assert.equal(await panel.locator('[data-ai-layout-mode="source"]').isVisible(),true,'history controls preserve the comparison group');
    await page.screenshot({path:path.join(dir,`toolbar-${width}.png`)});
  }
  await page.setViewportSize({width:1440,height:1000});
  await stroke(460,120);const second=await image().getAttribute('src');
  await panel.locator('[data-ai-edit-undo]').click();
  await page.waitForFunction(src=>document.querySelector('.ai-generated-card.is-ai-active-candidate .ai-preview-stage > img').src===src,first);
  await stroke(250,330);
  assert.equal(await panel.locator('[data-ai-edit-redo]').isDisabled(),true,'new editing replaces the undone branch');
  assert.notEqual(await image().getAttribute('src'),second);
  await page.mouse.click(margin.x,margin.y);
  assert.equal(await panel.locator('[data-ai-edit-save]').isVisible(),true,'closing the tool keeps completed edits');
  await panel.locator('[data-ai-edit-save]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#ai-image-panel .ai-generated-card').length===2);
  const saved=(await snapshot(page))[0].generated;
  assert.equal(saved[1].scopedEditHistory.length,2,'save contains only the retained branch');
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__candidateQA.state.get().objects)),canvasBefore,'AI history does not touch main canvas objects');
  // An isolated controller contract exercises the shared AI busy flag without
  // enabling hidden chat UI or changing an actual provider/request snapshot.
  await page.evaluate(async()=>{
    const {createLocalImageEraseController}=await import('/js/ai-image-local-erase.js?v=1.7.0-four-session-integration');
    const root=document.createElement('section');root.dataset.historyProbe='';
    root.style.cssText='position:fixed;left:20px;top:140px;width:420px;padding:8px;background:white;z-index:99999';
    root.innerHTML='<button data-ai-local-erase>Erase</button><div data-ai-local-erase-options><input data-ai-erase-size value="64"><output data-ai-erase-size-value></output></div><button data-ai-edit-save>Save</button><button data-ai-edit-discard>Discard</button><div data-ai-edit-history><button data-ai-edit-undo>Undo</button><button data-ai-edit-redo>Redo</button></div><div class="ai-image-card"><div class="ai-preview-stage" style="position:relative"><img style="display:block;width:400px;height:300px"></div></div>';
    document.body.append(root);const img=root.querySelector('img');img.src=window.__task2.original;await img.decode();
    const item={id:'isolated-busy-history',kind:'generated',data:img.src,card:root.querySelector('.ai-image-card')};
    const probe={busy:false,commits:0,item,root,img};
    const controller=createLocalImageEraseController({panel:root,getTarget:()=>item,isBusy:()=>probe.busy,
      resolveSource:()=>item.data,previewChanged:async()=>{img.src=controller.getDraft(item)?.data||item.data;await img.decode();},
      commit:async()=>{probe.commits++;},status:()=>{}});
    probe.controller=controller;window.__historyProbe=probe;
  });
  const probe=page.locator('[data-history-probe]');await toolClick(probe,'[data-ai-local-erase]');
  const pb=await probe.locator('img').boundingBox();await page.mouse.click(pb.x+40/512*pb.width,pb.y+120/384*pb.height);
  await page.waitForFunction(()=>{const p=window.__historyProbe;return p.controller.getDraft(p.item)&&!p.root.querySelector('[data-ai-edit-save]').disabled;});
  const busyResult=await page.evaluate(async()=>{
    const p=window.__historyProbe, original=p.item.data, edited=p.img.src;
    p.busy=true;p.root.dataset.aiBusy='true';p.controller.refresh();
    const available=!p.root.querySelector('[data-ai-edit-undo]').disabled;
    await p.controller.undo();const restored=p.img.src===original;
    const redoAvailable=!p.root.querySelector('[data-ai-edit-redo]').disabled;
    await p.controller.redo();const reapplied=p.img.src===edited;
    await p.controller.save();
    const result={available,restored,redoAvailable,reapplied,savedSourceUnchanged:p.item.data===original,commits:p.commits};
    p.controller.destroy();p.root.remove();delete window.__historyProbe;return result;
  });
  assert.deepEqual(busyResult,{available:true,restored:true,redoAvailable:true,reapplied:true,savedSourceUnchanged:true,commits:0},'AI busy only locks mutations, not the local preview history');
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>window.__task2.sends.length),0);
  fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({blankCancelsEraser:true,blankCancelsComments:true,draftRetained:true,newStrokeClearsRedo:true,busyControllerContract:busyResult,paidAiCalls:0,errors},null,2));
});

test('mapped labels survive local saving and legacy manual versions can insert without old bitmap bindings', {timeout:90000}, async t => {
  const plan = {...structuredClone(verifiedPlan), frozen:true, status:'ready'};
  plan.labels[0].anchor = {...plan.labels[0].leaderRoutes[0].target};
  const dir=path.join(evidence,'mapped-labels');fs.mkdirSync(dir,{recursive:true});
  const {page,errors}=await fixture(t,2,dir,{selectedPartial:true,beforeNavigate:async page=>{
    await page.addInitScript(plan=>{
      window.__seedReady=window.__seedReady.then(async()=>{
        const hash=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');
        const labels=plan.labels.map(l=>({id:l.id,status:'matched',position:l.position,anchor:l.anchor,bounds:l.typography.bounds,
          ...(l.leaderRoutes?{leaderRoutes:l.leaderRoutes}:{}),...(l.elbow?{elbow:l.elbow}:{}),...(l.extraAnchors?{extraAnchors:l.extraAnchors}:{})}));
        const placement={version:1,imageKind:'exam',labels,status:'mapped',planSha256:await hash(JSON.stringify(plan)),candidateSha256:await hash(window.__task2.modified),sourceLabelsJson:JSON.stringify(plan.labels),sourceBindings:structuredClone(plan.sourceBindings||[])};
        await new Promise((resolve,reject)=>{
          const request=indexedDB.open('5e.preview:5e-ai-image-tasks',1);
          request.onsuccess=()=>{
            const db=request.result,tx=db.transaction('tasks','readwrite'),store=tx.objectStore('tasks'),read=store.get('workspace');
            read.onsuccess=()=>{const record=read.result;record.tabs.forEach((tab,index)=>{
              const item=tab.generated[0];item.data=index?window.__task2.original:window.__task2.modified;
              item.labelPlan={...structuredClone(plan),sourcePlan:structuredClone(plan),targetPlacement:structuredClone(placement),candidateSha256:placement.candidateSha256};
              item.reviewState='scoped-applied';item.sourceReferenceId=tab.attachments[0].id;
              if(index)item.engine='local-erase';
              tab.labelPreviewIncluded={[item.id]:true};
            });store.put(record);};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
          };request.onerror=()=>reject(request.error);
        });
      });
    },plan);
  }});
  const workerCheck=await page.evaluate(async()=>{
    const {createImageEraseProcessor}=await import('/js/ai-image-erase-processor.js?v=1.7.0-four-session-integration');
    const {eraseImageRegion}=await import('/js/ai-image-erase-core.js?v=1.7.0-four-session-integration');
    const processor=createImageEraseProcessor(window),controller=new AbortController();
    const operation={mode:'brush',points:[{x:40,y:90},{x:40,y:180}],diameter:64,background:'white'};
    const pending=processor.erase(window.__task2.modified,operation,{signal:controller.signal});controller.abort();
    let aborted=false;try{await pending;}catch(error){aborted=error.name==='AbortError';}
    const actual=await processor.erase(window.__task2.modified,operation);
    const expected=await eraseImageRegion(window.__task2.modified,operation);
    processor.destroy();return{aborted,exactBytes:actual.data===expected.data,changedPixels:actual.changedPixels===expected.changedPixels};
  });
  assert.deepEqual(workerCheck,{aborted:true,exactBytes:true,changedPixels:true},'worker cancellation/restart retains the byte-exact erase contract');
  const panel=page.locator('#ai-image-panel');
  const parent=(await snapshot(page))[0].generated[0];
  await panel.locator('[data-tab-id="task-1"]').click();
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId==='selected-1');
  await panel.locator('[data-ai-insert-selected]').click();
  await panel.waitFor({state:'hidden'});
  const legacyLabels=await page.evaluate(()=>window.__candidateQA.state.get().objects.filter(o=>o.aiAutoLabel));
  assert.equal(legacyLabels.length,1,'recovered legacy local version emits its editable label');
  await page.locator('#ai-image-install-open').click();
  await panel.waitFor({state:'visible'});
  await panel.locator('[data-tab-id="task-0"]').click();
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId==='selected-0');
  await toolClick(panel,'[data-ai-local-erase]');
  const box=await panel.locator('.ai-generated-card.is-ai-active-candidate .ai-preview-stage > img').boundingBox();
  await page.mouse.click(box.x+40/512*box.width,box.y+120/384*box.height);
  await page.waitForFunction(()=>{const b=document.querySelector('[data-ai-edit-save]');return b&&!b.hidden&&!b.disabled;});
  await panel.locator('[data-ai-edit-save]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#ai-image-panel .ai-generated-card').length===2);
  const saved=(await snapshot(page))[0].generated;
  assert.deepEqual(saved[0],parent,'raw provider placement and prior version are unchanged');
  assert.equal(saved[1].labelPlan.targetPlacement,undefined);
  assert.equal(saved[1].labelPlan.candidateSha256,undefined);
  assert.deepEqual(saved[1].labelPlan.labels,plan.labels,'mapped coordinates and text survive');
  await panel.locator('[data-ai-insert-selected]').click();
  await panel.waitFor({state:'hidden'});
  const labels=await page.evaluate(()=>window.__candidateQA.state.get().objects.filter(o=>o.aiAutoLabel));
  assert.equal(labels.length,2);assert.equal(labels.at(-1).text,plan.labels[0].text);
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>window.__task2.sends.length),0);
  fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({mappedLabelSaved:true,legacyManualRecovered:true,parentUnchanged:true,editableLabels:labels.length,paidAiCalls:0,errors},null,2));
});


// Observe actual controller registrations without replacing erasure or disposal.
for(const rejected of [false,true])test('late eraser preview cannot remount a disposed workspace '+rejected,{timeout:90000},async t=>{
 const root=path.resolve(__dirname,'..'),engine=process.env.TASK2_ENGINE||'chromium';const dir=path.join(evidence,'disposed-preview',rejected?'rejected':'resolved');fs.mkdirSync(dir,{recursive:true});
 const {page,errors}=await fixture(t,1,dir,{selectedPartial:true,beforeNavigate:async page=>{
  const source=fs.readFileSync(path.join(root,'js/ai-image-local-erase.js'),'utf8'),seam='try { await previewChanged(item); }';assert.equal(source.split(seam).length-1,1);
  const body=source.replace('const processor = createImageEraseProcessor(win);','const processor = createImageEraseProcessor(win); panel.__eraseBindingCount=()=>bindings.size;').replace(seam,'try { await previewChanged(item); if(window.__holdLocalPreview) { window.__holdLocalPreview=false; await new Promise((resolve,reject)=>{window.__heldLocalPreview={resolve,reject};}).finally(()=>{window.__heldLocalPreviewSettled=true;}); } }');
  await page.route('**/js/ai-image-local-erase.js*',route=>route.fulfill({contentType:'text/javascript',body}));
 }});
 const panel=page.locator('#ai-image-panel'),saved=(await snapshot(page))[0].generated;await toolClick(panel,'[data-ai-local-erase]');await page.evaluate(()=>{window.__holdLocalPreview=true;});
 const box=await panel.locator('.ai-generated-card.is-ai-active-candidate .ai-preview-stage > img').last().boundingBox();
 await page.mouse.move(box.x+40/512*box.width,box.y+90/384*box.height);await page.mouse.down();await page.mouse.move(box.x+40/512*box.width,box.y+180/384*box.height,{steps:5});await page.mouse.up();
 await page.waitForFunction(()=>Boolean(window.__heldLocalPreview));await page.evaluate(async()=>{window.__disposedErasePanel=document.querySelector('#ai-image-panel');await __task2Manager.dispose();});
 const disposed=await page.evaluate(()=>({bindings:__disposedErasePanel.__eraseBindingCount(),draftAttribute:__disposedErasePanel.dataset.aiEditDraft??null}));
 await page.evaluate(rejected=>{const gate=__heldLocalPreview;rejected?gate.reject(new Error('Synthetic disposed preview failure')):gate.resolve();},rejected);
 await page.waitForFunction(()=>window.__heldLocalPreviewSettled===true);await page.evaluate(()=>new Promise(requestAnimationFrame));
 const settled=await page.evaluate(()=>({bindings:__disposedErasePanel.__eraseBindingCount(),draftAttribute:__disposedErasePanel.dataset.aiEditDraft??null}));
 const generatedAfter=(await snapshot(page))[0].generated;fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({engine,rejected,disposed,settled,savedUnchanged:JSON.stringify(saved)===JSON.stringify(generatedAfter),paidAiCalls:await page.evaluate(()=>__task2.sends.length),errors},null,2));
 assert.deepEqual(disposed,{bindings:0,draftAttribute:null});assert.deepEqual(settled,disposed,'late completion cannot rebind the disposed eraser or resurrect its draft UI');assert.deepEqual(generatedAfter,saved);assert.equal(await page.evaluate(()=>__task2.sends.length),0);assert.deepEqual(errors,[]);
});

// 11-26 사용자 「지우개를 누르는 순간 지우개 끝과 확대경이 깜빡이며 사라졌다 나타남」: 포인터 잡기를 풀 때의 pointerleave를 무시한다.
test('a click keeps the eraser footprint and magnifier on screen without moving the mouse',{timeout:90000},async t=>{
  const dir=path.join(evidence,'click-no-flicker');fs.mkdirSync(dir,{recursive:true});
  const {page,errors}=await fixture(t,1,dir,{selectedPartial:true,unlabeled:true});
  const panel=page.locator('#ai-image-panel');
  await toolClick(panel,'[data-ai-local-erase]');
  const r=await panel.locator('.ai-generated-card.is-ai-active-candidate .ai-preview-stage > img').boundingBox();
  await page.mouse.move(r.x+r.width*.4,r.y+r.height*.5);await page.waitForTimeout(300);
  await page.evaluate(()=>{window.__fr=[];const loop=()=>{const lens=document.getElementById('ai-erase-magnifier');window.__fr.push([!!document.querySelector('#ai-image-panel .ai-local-erase-cursor'),Boolean(lens&&!lens.hidden)]);if(window.__fr.length<90)requestAnimationFrame(loop);};requestAnimationFrame(loop);});
  await page.mouse.down();await page.mouse.up();await page.waitForTimeout(1500);
  const frames=await page.evaluate(()=>window.__fr);
  assert.equal(frames.filter(([cursor,lens])=>!cursor||!lens).length,0,'footprint and magnifier never disappear around a click');
  assert.deepEqual(errors,[]);
});
