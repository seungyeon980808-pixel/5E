const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {fixture,verifiedPlan,snapshot} = require('./fixtures/ai-image-label-workflow.cjs');

// 11-27: 변환에도 「AI와 대화 / 직접 편집」이 생겨 지우개·라벨 편집 단추가 직접 편집 칸으로 옮겨졌다 — 먼저 직접 편집으로 들어간다.
async function toolClick(scope, sel) {
  const b = scope.locator(sel), before = await b.getAttribute('aria-pressed').catch(() => null);
  const manual = scope.locator('[data-result-mode="manual"]');
  if (await manual.isVisible().catch(() => false) && await manual.getAttribute('aria-pressed') !== 'true') {
    await manual.click();
    if (sel.includes('label-edit') && before !== 'true' && await b.getAttribute('aria-pressed') === 'true') return;
  }
  if (await b.isVisible()) await b.click(); else await b.dispatchEvent('click');
}

const evidence=path.resolve(process.env.EVIDENCE_DIR || '_work/feedback/parts/inline-labels','inline-editor');
fs.mkdirSync(evidence,{recursive:true});

test('label controls wait for the bitmap presentation before accepting edits',{timeout:90000},async t=>{
  const dir=path.join(evidence,'presentation-ready');fs.mkdirSync(dir,{recursive:true});
  const plan={...structuredClone(verifiedPlan),frozen:true,status:'review'};
  plan.labels[0].anchor={...plan.labels[0].leaderRoutes[0].target};
  const {page,errors}=await fixture(t,1,dir,{selectedPartial:true,beforeNavigate:async page=>{
    await page.addInitScript(plan=>{
      window.__seedReady=window.__seedReady.then(()=>new Promise((resolve,reject)=>{
        const r=indexedDB.open('5e.preview:5e-ai-image-tasks',1);
        r.onsuccess=()=>{const db=r.result,tx=db.transaction('tasks','readwrite'),store=tx.objectStore('tasks'),read=store.get('workspace');
          read.onsuccess=()=>{const record=read.result,item=record.tabs[0].generated[0];item.data=window.__task2.modified;item.labelPlan=plan;record.tabs[0].labelPreviewIncluded={[item.id]:true};store.put(record);};
          tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
        };r.onerror=()=>reject(r.error);
      }));
    },plan);
    const source=fs.readFileSync(path.resolve(__dirname,'../js/ai-inline-label-editor.js'),'utf8');
    const seam='Promise.resolve(displayChanged(getTarget()))';
    assert.equal(source.split(seam).length-1,1,'one retained display callback');
    await page.route('**/js/ai-inline-label-editor.js*',route=>route.fulfill({contentType:'text/javascript',body:source.replace(seam,
      'Promise.resolve().then(async()=>{if(window.__holdLabelDisplay){window.__holdLabelDisplay=false;await new Promise(resolve=>{window.__releaseLabelDisplay=resolve;});}return displayChanged(getTarget());})')}));
  }});
  const panel=page.locator('#ai-image-panel'),editor=panel.locator('[data-ai-inline-label-editor]'),saved=(await snapshot(page))[0].generated;
  await page.evaluate(()=>{window.__holdLabelDisplay=true;});
  await toolClick(panel,'[data-ai-label-edit]');await page.waitForFunction(()=>Boolean(window.__releaseLabelDisplay));
  assert.equal(await editor.isVisible(),true);
  for(const control of ['add','add-leader','text'])assert.equal(await editor.locator(`[data-label-${control}]`).isDisabled(),true,'presentation is still pending');
  assert.equal(await editor.locator('[data-label-close]').isEnabled(),true,'pending presentation can still be closed');
  assert.deepEqual((await snapshot(page))[0].generated,saved);
  await page.evaluate(()=>window.__releaseLabelDisplay());
  await page.waitForFunction(()=>!document.querySelector('#ai-image-panel [data-label-add]').disabled);
  assert.equal(await panel.locator('.ai-generated-card.is-ai-active-candidate .ai-preview-stage > img').getAttribute('src'),saved[0].data);
  assert.ok(await panel.locator('.ai-label-edit-overlay text').count()>0,'live label text is ready with the bare bitmap');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({pendingControlsDisabled:true,closeEnabled:true,readyBitmapExact:true,savedCandidatesUnchanged:true,paidAiCalls:0,errors},null,2));
});

test('clicking a visible label opens only its settings; one leader endpoint stays synchronized through edits and undo',{timeout:90000},async t=>{
  const dir=path.join(evidence,'click-and-leader');fs.mkdirSync(dir,{recursive:true});
  const plan={...structuredClone(verifiedPlan),frozen:true,status:'review'};
  plan.labels[0].anchor={...plan.labels[0].leaderRoutes[0].target};
  const {page,errors}=await fixture(t,1,dir,{selectedPartial:true,beforeNavigate:async page=>{
    await page.addInitScript(plan=>{
      window.__seedReady=window.__seedReady.then(()=>new Promise((resolve,reject)=>{
        const r=indexedDB.open('5e.preview:5e-ai-image-tasks',1);
        r.onsuccess=()=>{const db=r.result,tx=db.transaction('tasks','readwrite'),store=tx.objectStore('tasks'),read=store.get('workspace');
          read.onsuccess=()=>{const record=read.result,item=record.tabs[0].generated[0];item.data=window.__task2.modified;item.labelPlan=plan;record.tabs[0].labelPreviewIncluded={[item.id]:true};store.put(record);};
          tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
        };r.onerror=()=>reject(r.error);
      }));
    },plan);
  }});
  const panel=page.locator('#ai-image-panel'),editor=panel.locator('[data-ai-inline-label-editor]');
  const parent=(await snapshot(page))[0].generated[0];
  const ready=()=>page.waitForFunction(()=>{const p=document.querySelector('#ai-image-panel');return p.querySelector('.ai-label-edit-overlay [data-ai-label-id]')&&!p.querySelector('[data-label-add]').disabled;});
  assert.equal(await editor.isVisible(),false);
  // 11-27: 변환도 「AI와 대화」에서는 라벨을 눌러 고치지 않는다 — 직접 편집으로 들어가면 라벨 편집이 열린다.
  await panel.locator('[data-result-mode="manual"]').click();await ready();
  await panel.locator('.ai-label-edit-overlay [data-ai-label-id="source-label"] .ai-label-edit-hit').click();
  assert.equal(await editor.locator('[data-label-text]').inputValue(),'전자');
  assert.equal(await panel.locator('[data-label-list],[data-ai-label-list-id]').count(),0);
  const handles=panel.locator('.ai-label-edit-handle');
  assert.equal(await editor.locator('[data-label-leader-edit]').count(),0,'no extra leader-edit step');
  assert.equal(await handles.count(),1,'the legacy anchor and routed target have a single handle');
  const start=await handles.first().boundingBox();
  const before=await editor.locator('[data-label-anchor-x]').inputValue();
  await page.keyboard.down('Control');
  await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();
  await page.mouse.move(start.x+start.width/2+24,start.y+start.height/2+12,{steps:4});
  await page.locator('#ai-label-endpoint-magnifier').waitFor({state:'visible'});
  const sampleId=await page.locator('#ai-label-endpoint-magnifier svg > use').getAttribute('href');
  assert.equal(await panel.locator(`${sampleId} > image`).count(),1);
  assert.ok(await panel.locator(`${sampleId} text`).count()>0,'magnifier shows the edited label with its image');
  assert.equal(await panel.locator(`${sampleId} .ai-label-edit-handle`).count(),0,'handles are excluded from the sample');
  await page.screenshot({path:path.join(dir,'endpoint-magnifier.png')});
  await page.mouse.up();await page.keyboard.up('Control');await ready();assert.equal(await page.locator('#ai-label-endpoint-magnifier').isVisible(),false);
  const moved=await editor.locator('[data-label-anchor-x]').inputValue();
  assert.ok(Number(moved)>Number(before));assert.equal(await handles.count(),1);
  await panel.locator('[data-ai-edit-undo]').click();await ready();assert.equal(await editor.locator('[data-label-anchor-x]').inputValue(),before);
  await panel.locator('[data-ai-edit-redo]').click();await ready();assert.equal(await editor.locator('[data-label-anchor-x]').inputValue(),moved);
  assert.deepEqual((await snapshot(page))[0].generated,[parent],'dragging leaves the stored parent unchanged');
  await page.screenshot({path:path.join(dir,'selected-1440.png')});
  await page.setViewportSize({width:1080,height:800});await page.screenshot({path:path.join(dir,'selected-1080.png')});
  await panel.locator('[data-ai-edit-save]').click();
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel [data-ai-status]').textContent.startsWith('수정 저장 완료'));
  const saved=(await snapshot(page))[0].generated,child=saved[1],label=child.labelPlan.labels[0];
  assert.equal(saved.length,2);assert.deepEqual(saved[0],parent);assert.deepEqual(label.anchor,label.leaderRoutes[0].target);
  const route = label.leaderRoutes[0];
  const angle = Math.atan2((route.target.y-route.start.y)*384,(route.target.x-route.start.x)*512)*180/Math.PI;
  assert.ok(Math.abs(angle-Math.round(angle/15)*15)<0.05,`Ctrl 드래그 각도 ${angle}`);
  assert.equal(label.leaderRoutes.length,1);assert.equal(child.data,parent.data);
  assert.equal(await page.evaluate(()=>window.__task2.sends.length),0);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({directLabelClick:true,directEndpointDrag:true,magnifier:true,leaderHandles:1,endpointAliases:label.anchor,undoRedo:true,paidAiCalls:0,errors},null,2));
});

test('entering, selecting and moving a label retain the displayed fonts and untouched glyph positions',{timeout:120000},async t=>{
  const dir=path.join(evidence,'stable-typography');fs.mkdirSync(dir,{recursive:true});
  const labels=[
    {id:'name',text:'광원 P',mode:'text',scope:'general',contentMode:'plain',position:{x:.3,y:.25},anchor:{x:.3,y:.25},
      typography:{role:'name',font:'Times New Roman',fontWeight:'bold',italic:true}},
    {id:'mixed',text:'검출기 Q',mode:'text',scope:'general',contentMode:'plain',position:{x:.7,y:.25},anchor:{x:.7,y:.25},
      typography:{role:'text',runs:[{text:'검출기 ',role:'text',contentMode:'plain'},{text:'Q',role:'name',contentMode:'plain'}]}},
    {id:'quantity',text:'v_{A}',mode:'text',scope:'general',contentMode:'formula',position:{x:.3,y:.7},anchor:{x:.3,y:.7},
      typography:{role:'quantity',scriptStyles:[{start:3,end:4,kind:'sub',role:'name'}]}},
    {id:'saved-style',text:'저장한 글꼴',mode:'text',scope:'general',contentMode:'plain',position:{x:.7,y:.7},anchor:{x:.7,y:.7},
      manualStyle:{size:24/384},typography:{role:'text',font:'Times New Roman',fontWeight:'bold',italic:true,letterSpacing:.03}},
  ];
  const plan={version:4,frozen:true,labels,relationGroups:[]};
  const {page,errors}=await fixture(t,1,dir,{selectedPartial:true,beforeNavigate:async page=>{
    await page.addInitScript(plan=>{
      window.__seedReady=window.__seedReady.then(()=>new Promise((resolve,reject)=>{
        const r=indexedDB.open('5e.preview:5e-ai-image-tasks',1);
        r.onsuccess=()=>{const db=r.result,tx=db.transaction('tasks','readwrite'),store=tx.objectStore('tasks'),read=store.get('workspace');
          read.onsuccess=()=>{const record=read.result,item=record.tabs[0].generated[0];item.data=window.__task2.modified;item.labelPlan=plan;record.tabs[0].labelPreviewIncluded={[item.id]:true};store.put(record);};
          tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
        };r.onerror=()=>reject(r.error);
      }));
    },plan);
  }});
  const panel=page.locator('#ai-image-panel'),editor=panel.locator('[data-ai-inline-label-editor]');
  const parent=(await snapshot(page))[0].generated[0];
  await page.waitForFunction(raw=>{const i=document.querySelector('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img');return i?.complete&&i.src!==raw;},parent.data);
  const preview=await page.evaluate(async({plan,data})=>{
    const {createEditableLabelComposite}=await import('/js/ai-label-composite.js?v=1.7.0-four-session-integration');
    const result=await createEditableLabelComposite({plan,candidateDataUrl:data,artboard:window.__candidateQA.state.get().artboard});
    return result.objects.map(o=>({id:o.aiSourceLabelId,fontFamily:o.fontFamily,fontWeight:o.fontWeight,italic:o.italic,fontSize:o.fontSize}));
  },{plan,data:parent.data});
  await page.screenshot({path:path.join(dir,'before-1440.png')});
  // A font-load barrier proves that no fallback glyph frame is exposed.
  await page.evaluate(()=>{
    const fonts=document.fonts,load=fonts.load.bind(fonts);let release;
    const gate=new Promise(resolve=>{release=resolve;});
    fonts.load=async(...args)=>{window.__pendingFontLoads=(window.__pendingFontLoads||0)+1;await gate;return load(...args);};
    window.__releaseLabelFonts=()=>{fonts.load=load;release();};
  });
  await toolClick(panel,'[data-ai-label-edit]');
  await page.waitForFunction(()=>window.__pendingFontLoads>0);
  assert.equal(await panel.locator('.ai-label-edit-overlay text').count(),0,'keep the existing preview until its fonts are ready');
  assert.notEqual(await panel.locator('.is-ai-active-candidate .ai-preview-stage > img').getAttribute('src'),parent.data);
  await page.evaluate(()=>window.__releaseLabelFonts());
  const ready=()=>page.waitForFunction(()=>{const p=document.querySelector('#ai-image-panel');return p.querySelector('.ai-label-edit-overlay text')&&!p.querySelector('[data-label-add]').disabled;});
  await ready();
  const metrics=()=>panel.locator('.ai-label-edit-overlay').evaluate(svg=>{
    const image=svg.parentElement.querySelector(':scope > img'),r=image.getBoundingClientRect();
    return [...svg.querySelectorAll('[data-ai-label-id]')].map(group=>({id:group.dataset.aiLabelId,fonts:[...group.querySelectorAll('text')].map(text=>{
      const b=text.getBoundingClientRect();return {text:text.textContent,family:text.getAttribute('font-family'),weight:text.getAttribute('font-weight'),style:text.getAttribute('font-style'),
        x:(b.x-r.x)/r.width,y:(b.y-r.y)/r.height,w:b.width/r.width,h:b.height/r.height};})}));
  });
  const entered=await metrics();
  for (const object of preview) {
    const first=entered.find(label=>label.id===object.id).fonts[0];
    assert.equal(first.family,object.fontFamily,'editor uses the composed preview font');
    assert.equal(first.weight || 'normal',object.fontWeight || 'normal');
    assert.equal(first.style,object.italic ? 'italic' : 'normal');
  }
  await page.evaluate(()=>{window.__stableGlyphNodes=[...document.querySelectorAll('.ai-label-edit-overlay text')];});
  await panel.locator('.ai-label-edit-overlay [data-ai-label-id=\"name\"] .ai-label-edit-hit').click();
  assert.equal(await editor.locator('[data-label-bold]').getAttribute('aria-pressed'),'false','fields describe the painted default rather than unused source observations');
  assert.equal(await editor.locator('[data-label-italic]').getAttribute('aria-pressed'),'false');
  await panel.locator('.ai-label-edit-overlay [data-ai-label-id=\"mixed\"] .ai-label-edit-hit').click();
  await panel.locator('.ai-label-edit-overlay [data-ai-label-id=\"name\"] .ai-label-edit-hit').click();
  assert.deepEqual(await metrics(),entered,'selection does not move, resize or restyle any glyph');
  assert.equal(await page.evaluate(()=>window.__stableGlyphNodes.every(node=>node.isConnected)),true,'selection retains glyph DOM instead of repainting it');
  const overlay=panel.locator('.ai-label-edit-overlay [data-ai-label-id="name"]');
  await overlay.focus();await page.keyboard.press('ArrowRight');await ready();
  const moved=await metrics();
  const fontOnly=values=>values.map(v=>({id:v.id,fonts:v.fonts.map(({x,y,w,h,...font})=>font)}));
  assert.deepEqual(fontOnly(moved),fontOnly(entered),'first position edit must not apply source cosmetic observations or switch name fonts');
  assert.deepEqual(moved.slice(1),entered.slice(1),'editing one label leaves all other glyph blocks unchanged');
  assert.ok(Math.abs(moved[0].fonts[0].x-entered[0].fonts[0].x-1/512)<.0001);
  await panel.locator('[data-ai-edit-undo]').click();await ready();assert.deepEqual(await metrics(),entered);
  await panel.locator('[data-ai-edit-redo]').click();await ready();assert.deepEqual(await metrics(),moved);
  await page.evaluate(()=>{
    const fonts=document.fonts,load=fonts.load.bind(fonts);let release;window.__pendingFontLoads=0;
    const gate=new Promise(resolve=>{release=resolve;});
    fonts.load=async(...args)=>{window.__pendingFontLoads++;await gate;return load(...args);};
    window.__releaseLabelFonts=()=>{fonts.load=load;release();};
  });
  await editor.locator('[data-label-close]').click();
  await page.waitForFunction(()=>window.__pendingFontLoads>0);
  assert.equal(await panel.locator('.ai-label-edit-overlay.is-preview-only').count(),1,'keep live glyphs while the closed preview is prepared');
  assert.deepEqual(await metrics(),moved,'closing has no intermediate label-free or fallback frame');
  await page.evaluate(()=>window.__releaseLabelFonts());
  await page.waitForFunction(raw=>{const i=document.querySelector('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img');return i?.complete&&i.src!==raw;},parent.data);
  await panel.locator('.ai-label-edit-overlay').waitFor({state:'detached'});
  await toolClick(panel,'[data-ai-label-edit]');await ready();assert.deepEqual(await metrics(),moved,'reopening retains the finished presentation');
  await page.screenshot({path:path.join(dir,'after-1440.png')});
  await page.setViewportSize({width:1080,height:800});await page.screenshot({path:path.join(dir,'after-1080.png')});
  assert.deepEqual((await snapshot(page))[0].generated,[parent]);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({preview,entered,moved,selectionKeptGlyphs:true,fontBarrier:true,paidAiCalls:await page.evaluate(()=>window.__task2.sends.length),errors},null,2));
});

test('inline labels and erasing share draft history; visible PNG and native output retain the finished composition', {timeout:120000}, async t => {
  const plan={...structuredClone(verifiedPlan),frozen:true,status:'review',qualityReview:{verdict:'fail'}};
  plan.labels[0].anchor={...plan.labels[0].leaderRoutes[0].target};
  const {page,errors}=await fixture(t,2,evidence,{selectedPartial:true,beforeNavigate:async page=>{
    await page.addInitScript(plan=>{
      window.__seedReady=window.__seedReady.then(()=>new Promise((resolve,reject)=>{
        const r=indexedDB.open('5e.preview:5e-ai-image-tasks',1);
        r.onsuccess=()=>{
          const db=r.result,tx=db.transaction('tasks','readwrite'),store=tx.objectStore('tasks'),read=store.get('workspace');
          read.onsuccess=()=>{const record=read.result;for(const tab of record.tabs){
            const item=tab.generated[0];item.data=window.__task2.modified;item.labelPlan=structuredClone(plan);
            item.reviewState='needs-attention';item.reviewReport={verdict:'fail',issues:['Review the result manually']};
            tab.labelPreviewIncluded={[item.id]:true};
          }store.put(record);};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
        };r.onerror=()=>reject(r.error);
      }));
      // Clipboard is an OS transport only; the product still creates the PNG.
      window.__clipboardPng=[];
      Object.defineProperty(navigator,'clipboard',{value:{write:async items=>{
        for(const item of items) {const blob=await item.getType('image/png');window.__clipboardPng.push([...new Uint8Array(await blob.arrayBuffer())]);}
      }}});
    },plan);
  }});
  const panel=page.locator('#ai-image-panel'),original=(await snapshot(page))[0].generated[0];
  const image=()=>panel.locator('.ai-generated-card.is-ai-active-candidate .ai-preview-stage > img');
  const editor=panel.locator('[data-ai-inline-label-editor]');
  const ready=()=>page.waitForFunction(()=>{const s=document.querySelector('#ai-image-panel [data-ai-inline-label-editor]');return s&&!s.hidden&&!s.querySelector('[data-label-add]').disabled;});
  const field=key=>editor.locator(`[data-label-${key}]`);
  const change=async(key,value)=>{await field(key).fill(value);await field(key).blur();await ready();};
  const select=async(key,value)=>{await field(key).selectOption(value);await ready();};
  assert.equal(await panel.locator('[data-ai-insert-selected]').isEnabled(),true,'automatic QA does not prevent the user from adopting a result');
  assert.deepEqual(await panel.locator('.ai-output-actions :is([data-ai-save-selected],[data-ai-copy-selected],[data-ai-insert-selected],[data-ai-exam-send]):not([hidden])').allTextContents(),['PNG 저장','이미지 복사','캔버스에 삽입','한글로 보내기']);
  assert.equal(await panel.locator('.ai-generated-card [data-action="canvas-output"]').first().isVisible(),false);
  assert.equal(await panel.locator('.ai-output-more .ai-task-export-controls').isVisible(),false);
  await toolClick(panel,'[data-ai-label-edit]');await ready();
  assert.equal(await panel.locator('[data-ai-label-toggle]').getAttribute('aria-checked'),'true');
  assert.equal(await image().getAttribute('src'),original.data,'editor has the bare bitmap below editable vector labels');
  await panel.locator('.ai-label-edit-overlay [data-ai-label-id=\"source-label\"] .ai-label-edit-hit').click();
  await change('text','속도 v_A');await select('content','formula');await change('size','24');
  await field('bold').click();await ready();
  assert.equal(await field('bold').getAttribute('aria-pressed'),'true');
  await panel.locator('[data-ai-edit-undo]').click();await ready();
  assert.equal(await field('bold').getAttribute('aria-pressed'),'false');
  await page.keyboard.press('Meta+Shift+Z');await ready();
  assert.equal(await field('bold').getAttribute('aria-pressed'),'true');
  await editor.locator('details').evaluate(el=>el.open=true);
  await change('x','70');await change('anchor-x','45');await select('arrow','filled-arrow');
  const hit=panel.locator('.ai-label-edit-overlay [data-ai-label-id="source-label"] .ai-label-edit-hit');
  const h=await hit.boundingBox(),beforeX=Number(await field('x').inputValue());
  await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+h.width/2+18,h.y+h.height/2+8,{steps:5});await page.mouse.up();await ready();
  assert.ok(Number(await field('x').inputValue())>beforeX,'dragging moves the caption');
  assert.equal(Number(await field('anchor-x').inputValue()),45,'caption movement preserves its target');
  await field('duplicate').click();await ready();
  assert.equal(await panel.locator('.ai-label-edit-overlay [data-ai-label-id]').count(),2);
  await field('delete').click();await ready();
  assert.equal(await panel.locator('.ai-label-edit-overlay [data-ai-label-id]').count(),1);
  assert.deepEqual((await snapshot(page))[0].generated,[original],'all label gestures remain unsaved and do not alter the parent or its QA');
  await panel.locator('[data-ai-save-selected]').click();
  assert.match(await panel.locator('[data-ai-status]').innerText(),/수정 저장/);
  await panel.locator('[data-tab-id="task-1"]').click();
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId==='selected-1');
  await toolClick(panel,'[data-ai-label-edit]');await ready();
  assert.equal(await panel.locator('[data-ai-edit-save]').isVisible(),false,'label draft belongs only to its task');
  await panel.locator('[data-tab-id="task-0"]').click();
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId==='selected-0');
  await toolClick(panel,'[data-ai-label-edit]');await ready();
  await panel.locator('.ai-label-edit-overlay [data-ai-label-id=\"source-label\"] .ai-label-edit-hit').click();
  assert.equal(await field('text').inputValue(),'속도 v_A','returning retains the unsaved label draft');
  await panel.locator('[data-ai-label-toggle]').click();
  await toolClick(panel,'[data-ai-local-erase]');
  await panel.locator('[data-ai-erase-background]').selectOption('transparent');
  const ib=await image().boundingBox();
  await page.mouse.move(ib.x+40/512*ib.width,ib.y+120/384*ib.height);await page.mouse.down();
  await page.mouse.move(ib.x+40/512*ib.width,ib.y+180/384*ib.height,{steps:5});await page.mouse.up();
  await page.waitForFunction(()=>!document.querySelector('#ai-image-panel [data-ai-edit-save]').disabled);
  const erased=await image().getAttribute('src');
  await panel.locator('[data-ai-edit-undo]').click();
  await page.waitForFunction(data=>document.querySelector('#ai-image-panel .ai-generated-card.is-ai-active-candidate img').src===data,original.data);
  await panel.locator('[data-ai-edit-redo]').click();
  await page.waitForFunction(data=>document.querySelector('#ai-image-panel .ai-generated-card.is-ai-active-candidate img').src===data,erased);
  await panel.locator('[data-ai-edit-save]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#ai-image-panel .ai-generated-card').length===2);
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel [data-ai-status]').textContent.startsWith('수정 저장 완료'));
  const saved=(await snapshot(page))[0].generated,child=saved[1];
  assert.equal(saved.length,2);assert.deepEqual(saved[0],original);
  assert.equal(child.labelPlan.labels[0].text,'속도 v_A');assert.equal(child.labelPlan.labels[0].contentMode,'formula');
  assert.equal(child.labelPlan.labels[0].typography.fontWeight,'bold');
  assert.equal(child.labelPlan.labels[0].manualStyle.size,24*25.4/72/(100*384/512),'크기 칸은 pt(그림 폭 100mm 기준, 11-15)');
  assert.equal(child.labelPlan.qualityReview,undefined);assert.equal(child.labelPlan.targetPlacement,undefined);
  assert.equal(child.scopedEditHistory.length,1,'one saved version combines all label changes and the one eraser stroke');
  await toolClick(panel,'[data-ai-label-edit]');await ready();
  await panel.locator('.ai-label-edit-overlay [data-ai-label-id=\"source-label\"] .ai-label-edit-hit').click();
  await page.screenshot({path:path.join(evidence,'editor-1440.png')});
  await page.setViewportSize({width:1080,height:800});
  await page.waitForFunction(()=>{
    const p=document.querySelector('#ai-image-panel'),s=p.querySelector('.ai-label-edit-overlay').getBoundingClientRect(),i=p.querySelector('.ai-generated-card.is-ai-active-candidate .ai-preview-stage > img').getBoundingClientRect();
    return Math.abs(s.width-i.width)<1&&Math.abs(s.height-i.height)<1&&Math.abs(s.x-i.x)<1&&Math.abs(s.y-i.y)<1;
  });
  await page.screenshot({path:path.join(evidence,'editor-1080.png')});
  await page.setViewportSize({width:1440,height:1000});
  await field('close').click();
  const downloaded=page.waitForEvent('download');await panel.locator('[data-ai-save-selected]').click();
  const download=await downloaded,downloadPath=await download.path(),png=fs.readFileSync(downloadPath);
  assert.equal(png.subarray(1,4).toString(),'PNG');
  await panel.locator('[data-ai-copy-selected]').click();
  await page.waitForFunction(()=>window.__clipboardPng.length===1);
  assert.deepEqual(Buffer.from(await page.evaluate(()=>window.__clipboardPng[0])),png,'clipboard and PNG contain the same flattened composition');
  const pngData='data:image/png;base64,'+png.toString('base64');
  const pixels=await page.evaluate(async({raw,output})=>{
    const load=data=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i);i.src=data;});
    const canvases=[];for(const data of [raw,output]){const image=await load(data),c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;c.getContext('2d').drawImage(image,0,0);canvases.push(c.getContext('2d').getImageData(0,0,c.width,c.height).data);}
    let diff=0;for(let i=0;i<canvases[0].length;i++)if(canvases[0][i]!==canvases[1][i])diff++;
    const p=(120*512+40)*4;return {changedChannels:diff,erased:[...canvases[1].slice(p,p+4)]};
  },{raw:child.data,output:pngData});
  assert.ok(pixels.changedChannels>100,'visible labels are in exported pixels');assert.equal(pixels.erased[3],0,'export preserves the manually erased transparent area');
  await page.screenshot({path:path.join(evidence,'output-1440.png')});
  await panel.locator('[data-ai-label-toggle]').click();
  const offDownload=page.waitForEvent('download');await panel.locator('[data-ai-save-selected]').click();
  assert.deepEqual(fs.readFileSync(await (await offDownload).path()),Buffer.from(child.data.split(',')[1],'base64'),'label OFF exports only the unchanged bare bitmap');
  await panel.locator('[data-ai-label-toggle]').click();
  await panel.locator('[data-ai-insert-selected]').click();
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel').hidden);
  const objects=await page.evaluate(()=>window.__candidateQA.state.get().objects);
  const bundle=objects.filter(o=>o.aiCandidateId===child.id),bitmap=bundle.find(o=>o.type==='image'),label=bundle.find(o=>o.aiAutoLabel);
  assert.ok(bitmap&&label);assert.equal(label.text,'속도 v_A');assert.equal(label.type,'labeler');assert.equal(label.contentMode,'formula');
  assert.equal(label.fontWeight,'bold');assert.equal(bitmap.src,child.data);
  assert.equal(bitmap.groupId,label.groupId);assert.ok(bitmap.groupId);assert.equal(bitmap.imageSelectionLocked,false);
  assert.deepEqual(await page.evaluate(()=>window.__candidateQA.state.get().selectedIds),bundle.map(o=>o.id),'the complete bundle is selected for a single move/resize');
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>window.__task2.sends.length),0);
  fs.writeFileSync(path.join(evidence,'receipt.json'),JSON.stringify({engine:process.env.TASK2_ENGINE||'chromium',draftHistory:true,savedRevisions:1,qualityIsInformational:true,pixels,clipboardMatchesPng:true,groupedNativeOutput:true,paidAiCalls:0,errors},null,2));
});

test('adding a formula label leaves the bitmap intact and survives reopening', {timeout:90000}, async t=>{
  const dir=path.join(evidence,'label-only');fs.mkdirSync(dir,{recursive:true});
  const {page,errors}=await fixture(t,1,dir,{selectedPartial:true,unlabeled:true});
  const panel=page.locator('#ai-image-panel'),parent=(await snapshot(page))[0].generated[0];
  const editor=panel.locator('[data-ai-inline-label-editor]');
  const ready=()=>page.waitForFunction(()=>{const s=document.querySelector('#ai-image-panel [data-ai-inline-label-editor]');return s&&!s.hidden&&!s.querySelector('[data-label-add]').disabled;});
  await toolClick(panel,'[data-ai-label-edit]');await ready();
  await editor.locator('[data-label-add]').dispatchEvent('click');await ready();
  const text=editor.locator('[data-label-text]');await text.fill('F_{A}');await text.blur();await ready();
  await editor.locator('[data-label-content]').selectOption('formula');await ready();
  await editor.locator('[data-label-role]').selectOption('quantity');await ready();
  await editor.locator('details').evaluate(el=>el.open=true);
  await text.evaluate(el=>{el.focus();el.setSelectionRange(3,4);});
  await editor.locator('[data-label-script-role]').selectOption('name');await ready();
  assert.equal((await snapshot(page))[0].generated.length,1);
  await panel.locator('[data-ai-edit-save]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#ai-image-panel .ai-generated-card').length===2);
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel [data-ai-status]').textContent.startsWith('수정 저장 완료'));
  const saved=(await snapshot(page))[0].generated,child=saved[1];
  assert.equal(child.data,parent.data,'a label-only edit does not flatten or alter any source pixels');
  assert.deepEqual(saved[0],parent);
  assert.equal(child.labelPlan.labels[0].text,'F_{A}');assert.equal(child.labelPlan.labels[0].mode,'text');
  assert.equal(child.labelPlan.labels[0].typography.role,'quantity');
  assert.equal(child.labelPlan.labels[0].typography.scriptStyles[0].role,'name');
  assert.equal(child.labelPlan.labels[0].manualStyle.size,24/384);
  await page.reload({waitUntil:'domcontentloaded',timeout:30000});await page.locator('#ai-image-install-open').click();
  await page.waitForFunction(id=>document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId===id,child.id);
  await toolClick(panel,'[data-ai-label-edit]');await ready();
  await panel.locator('.ai-label-edit-overlay .ai-label-edit-hit').click();
  assert.equal(await text.inputValue(),'F_{A}');
  assert.deepEqual((await snapshot(page))[0].generated,saved,'reopening preserves both versions and the editable label plan');
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>window.__task2.sends.length),0);
  fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({savedRevisions:1,bitmapUnchanged:true,formulaAndScriptStyle:true,reopened:true,errors},null,2));
});

test('failed local storage preserves the label draft and retry saves exactly one version',{timeout:90000},async t=>{
  const dir=path.join(evidence,'storage-failure');fs.mkdirSync(dir,{recursive:true});
  const {page,errors}=await fixture(t,1,dir,{selectedPartial:true,unlabeled:true});
  const panel=page.locator('#ai-image-panel'),parent=(await snapshot(page))[0].generated[0];
  const ready=()=>page.waitForFunction(()=>!document.querySelector('#ai-image-panel [data-label-add]').disabled);
  await toolClick(panel,'[data-ai-label-edit]');await ready();
  await panel.locator('[data-label-add]').dispatchEvent('click');await ready();
  await page.evaluate(()=>{
    const put=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(value,...args){
      if(this.name==='tasks'&&value.tabs?.some(tab=>tab.generated?.length>1)){
        IDBObjectStore.prototype.put=put;throw new DOMException('Synthetic local storage quota','QuotaExceededError');
      }return put.call(this,value,...args);
    };
  });
  await panel.locator('[data-ai-edit-save]').click();
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel [data-ai-status]').textContent.includes('임시 편집을 유지'));
  assert.deepEqual((await snapshot(page))[0].generated,[parent],'a failed write rolls back the unsaved version');
  assert.equal(await panel.locator('[data-ai-edit-save]').isVisible(),true);
  await panel.locator('[data-ai-edit-save]').click();
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel [data-ai-status]').textContent.startsWith('수정 저장 완료'));
  const saved=(await snapshot(page))[0].generated;
  assert.equal(saved.length,2);assert.equal(saved[1].labelPlan.labels[0].text,'라벨');assert.deepEqual(saved[0],parent);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({rollback:true,draftRetained:true,retryVersions:1,errors},null,2));
});

for(const success of [false,true])for(const view of ['parent','child'])test(`pending local save locks its ${view}, preserves other drafts, and releases after ${success?'success':'failure'}`,{timeout:90000},async t=>{
  const dir=path.join(evidence,`pending-save-${view}-${success?'success':'failure'}`);fs.mkdirSync(dir,{recursive:true});
  const {page,errors}=await fixture(t,2,dir,{selectedPartial:true,unlabeled:true,beforeNavigate:async page=>{
    const source=fs.readFileSync(path.resolve(__dirname,'../js/ai-output-cache-store.js'),'utf8');
    const seam='  put(entry) { return this.request("readwrite", (store) => store.put(entry)); }';assert.equal(source.split(seam).length-1,1);
    await page.route('**/js/ai-output-cache-store.js*',route=>route.fulfill({contentType:'text/javascript',body:source.replace(seam,
      '  put(entry) { if(window.__holdLocalSave && entry.tabs?.some(tab=>tab.generated?.length>1)){window.__holdLocalSave=false;return new Promise((resolve,reject)=>{window.__finishLocalSave=success=>success?this.request("readwrite",store=>store.put(entry)).then(resolve,reject):reject(new DOMException("Delayed test quota","QuotaExceededError"));});} return this.request("readwrite", (store) => store.put(entry)); }')}));
  }});
  const panel=page.locator('#ai-image-panel'),editor=panel.locator('[data-ai-inline-label-editor]');
  const ready=()=>page.waitForFunction(()=>{const p=document.querySelector('#ai-image-panel [data-ai-inline-label-editor]');return p&&!p.hidden&&!p.querySelector('[data-label-add]').disabled;});
  const edit=async text=>{
    if(await panel.locator('[data-ai-label-edit]').getAttribute('aria-pressed')!=='true')await toolClick(panel,'[data-ai-label-edit]');
    await ready();await editor.locator('[data-label-add]').dispatchEvent('click');await ready();
    await editor.locator('[data-label-text]').fill(text);await editor.locator('[data-label-text]').blur();await ready();
  };
  const version=async id=>{await panel.locator('[data-ai-version-button]').click();await panel.locator(`[data-ai-candidate-option="${id}"]`).click();};
  const task=async (id,candidateId)=>{
    await panel.locator(`[data-tab-id="${id}"] .ai-task-tab-select`).click();
    await page.waitForFunction(candidateId=>{
      const p=document.querySelector('#ai-image-panel'),img=p?.querySelector('.is-ai-active-candidate .ai-preview-stage > img');
      return p&&!p.hidden&&!p.inert&&p.dataset.aiSelectedCandidateId===candidateId&&img?.complete&&img.naturalWidth>0;
    },candidateId);
  };
  // Establish both independent workspaces before delaying the owner's write.
  // The first navigation durably transfers a seeded task to its own store.
  await task('task-1','selected-1');await task('task-0','selected-0');
  const before=await snapshot(page);
  await edit('저장할 라벨');await page.evaluate(()=>window.__holdLocalSave=true);
  await panel.locator('[data-ai-edit-save]').click();await page.waitForFunction(()=>Boolean(window.__finishLocalSave));
  const provisionalId=await panel.getAttribute('data-ai-selected-candidate-id');assert.notEqual(provisionalId,'selected-0');
  if(view==='parent')await version('selected-0');
  const assertLocked=async()=>{
    for(const action of ['local-erase','label-edit','save-selected','copy-selected','insert-selected','exam-send'])
      assert.equal(await panel.locator(`[data-ai-${action}]`).isDisabled(),true,'pending '+view+' locks '+action);
    if(view==='parent'){
      assert.equal(await panel.locator('[data-ai-edit-undo]').isDisabled(),true,'pending owner cannot undo the draft being committed');
      const bitmap=await panel.locator('.ai-generated-card.is-ai-active-candidate .ai-preview-stage > img').getAttribute('src');
      await page.keyboard.press('Meta+z');await page.evaluate(()=>new Promise(requestAnimationFrame));
      assert.equal(await panel.locator('.ai-generated-card.is-ai-active-candidate .ai-preview-stage > img').getAttribute('src'),bitmap);
    }
  };
  await assertLocked();
  // The lock belongs to these two versions, not all tasks or their drafts.
  await task('task-1','selected-1');await edit('다른 작업 임시 라벨');
  assert.equal(await panel.getAttribute('data-ai-edit-draft'),'true');
  await task('task-0',view==='parent'?'selected-0':provisionalId);
  await version(view==='parent'?'selected-0':provisionalId);await assertLocked();
  await page.evaluate(success=>window.__finishLocalSave(success),success);
  await page.waitForFunction(()=>!document.querySelector('#ai-image-panel [data-ai-local-erase]').disabled);
  if(success)await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiEditDraft==='false');
  else {
    await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId==='selected-0');
    assert.equal(await panel.locator('[data-ai-edit-save]').isVisible(),true,'failed write retains the original draft');
    assert.deepEqual((await snapshot(page))[0].generated,before[0].generated,'provisional revision is fully rolled back');
    await panel.locator('[data-ai-edit-save]').click();
    await page.waitForFunction(()=>document.querySelector('#ai-image-panel [data-ai-status]').textContent.startsWith('수정 저장 완료'));
  }
  const saved=await snapshot(page);assert.equal(saved[0].generated.length,2,'one durable version, including after retry');
  assert.deepEqual(saved[0].generated[0],before[0].generated[0]);assert.deepEqual(saved[1].generated,before[1].generated);assert.deepEqual(saved[1].attachments,before[1].attachments);
  assert.deepEqual(saved[0].generated[1].labelPlan.labels.map(label=>label.text),['저장할 라벨']);
  await task('task-1','selected-1');
  assert.equal(await panel.getAttribute('data-ai-edit-draft'),'true','another task keeps its temporary labels through save completion');
  await panel.locator('[data-ai-edit-discard]').click();await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiEditDraft==='false');
  await task('task-0',success?(view==='parent'?'selected-0':provisionalId):saved[0].generated[1].id);await version(saved[0].generated[1].id);
  await edit('다음 편집 라벨');assert.equal(await panel.getAttribute('data-ai-edit-draft'),'true','saved child is editable after durable completion');
  await panel.locator('[data-ai-edit-discard]').click();await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiEditDraft==='false');
  assert.deepEqual((await snapshot(page)).map(tab=>tab.generated),saved.map(tab=>tab.generated));assert.equal(await page.evaluate(()=>__task2.sends.length),0);
  await page.reload({waitUntil:'domcontentloaded',timeout:30000});await page.locator('#ai-image-install-open').click();
  assert.deepEqual((await snapshot(page)).map(tab=>tab.generated),saved.map(tab=>tab.generated),'reload keeps only durable versions and exact label data');assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({engine:process.env.TASK2_ENGINE,success,view,lockedAcrossTaskSwitch:true,parentAndChildPreserved:true,otherDraftRetained:true,durableVersions:2,reloadExact:true,paidAiCalls:0,errors},null,2));
});

for(const switchTarget of ['task','candidate']) test(`late local save failure preserves another ${switchTarget} and retains its label draft`,{timeout:90000},async t=>{
  const dir=path.join(evidence,`storage-owner-${switchTarget}`);fs.mkdirSync(dir,{recursive:true});
  const {page,errors}=await fixture(t,switchTarget==='task'?2:1,dir,{selectedPartial:true,unlabeled:true,beforeNavigate:async page=>{
    if(switchTarget==='candidate')await page.addInitScript(()=>{
      window.__seedReady=window.__seedReady.then(()=>new Promise((resolve,reject)=>{
        const r=indexedDB.open('5e.preview:5e-ai-image-tasks',1);
        r.onsuccess=()=>{const db=r.result,tx=db.transaction('tasks','readwrite'),store=tx.objectStore('tasks'),read=store.get('workspace');
          read.onsuccess=()=>{const record=read.result,tab=record.tabs[0];if(!tab.generated.some(item=>item.id==='alternate-0'))tab.generated.push({...structuredClone(tab.generated[0]),id:'alternate-0',name:'다른 수정본',comments:[]});store.put(record);};
          tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
        };r.onerror=()=>reject(r.error);
      }));
    });
    const store=fs.readFileSync(path.resolve(__dirname,'../js/ai-output-cache-store.js'),'utf8');
    const seam='  put(entry) { return this.request("readwrite", (store) => store.put(entry)); }';
    assert.equal(store.split(seam).length-1,1);
    await page.route('**/js/ai-output-cache-store.js*',route=>route.fulfill({contentType:'text/javascript',body:store.replace(seam,
      '  put(entry) { if(window.__holdLocalSave && entry.tabs?.some(tab=>tab.generated?.some(item=>!window.__knownCandidates.includes(item.id)))){window.__holdLocalSave=false;return new Promise((resolve,reject)=>{window.__rejectLocalSave=()=>reject(new DOMException("Delayed test quota","QuotaExceededError"));});} return this.request("readwrite", (store) => store.put(entry)); }')}));
    const source=fs.readFileSync(path.resolve(__dirname,'../js/ai-panel.js'),'utf8');
    const failure='throw new Error(`수정본을 저장하지 못했습니다. 임시 편집을 유지했습니다. ${error.message}`);';
    assert.equal(source.split(failure).length-1,1);
    await page.route('**/js/ai-panel.js*',route=>route.fulfill({contentType:'text/javascript',body:source.replace(failure,'window.__localSaveRollback=true; '+failure)}));
  }});
  const panel=page.locator('#ai-image-panel');
  const task=async (id,candidateId)=>{
    await panel.locator(`[data-tab-id="${id}"] .ai-task-tab-select`).click();
    await page.waitForFunction(candidateId=>{
      const p=document.querySelector('#ai-image-panel'),img=p?.querySelector('.is-ai-active-candidate .ai-preview-stage > img');
      return p&&!p.hidden&&!p.inert&&p.dataset.aiSelectedCandidateId===candidateId&&img?.complete&&img.naturalWidth>0;
    },candidateId);
  };
  // Complete the fixture's one-time durable task migration before saving.
  if(switchTarget==='task'){await task('task-1','selected-1');await task('task-0','selected-0');}
  const before=await snapshot(page);
  await toolClick(panel,'[data-ai-label-edit]');
  await page.waitForFunction(()=>!document.querySelector('#ai-image-panel [data-label-add]').disabled);
  await panel.locator('[data-label-add]').dispatchEvent('click');
  await page.waitForFunction(()=>!document.querySelector('#ai-image-panel [data-label-add]').disabled);
  // Hold only the write that carries the new label revision; unrelated state writes must pass through.
  await page.evaluate(ids=>{window.__knownCandidates=ids;window.__holdLocalSave=true;},before.flatMap(tab=>tab.generated.map(item=>item.id)));
  await panel.locator('[data-ai-edit-save]').click();await page.waitForFunction(()=>Boolean(window.__rejectLocalSave));
  if(switchTarget==='task')await task('task-1','selected-1');
  else {await panel.locator('[data-ai-version-button]').click();await panel.locator('[data-ai-candidate-option="alternate-0"]').click();}
  const otherBefore=(await snapshot(page))[1];
  const statusBefore=await panel.locator('[data-ai-status]').innerText();
  await page.evaluate(()=>window.__rejectLocalSave());await page.waitForFunction(()=>window.__localSaveRollback);
  const after=await snapshot(page);
  assert.equal(await panel.getAttribute('data-ai-selected-candidate-id'),switchTarget==='task'?'selected-1':'alternate-0','another selection is retained');
  if(switchTarget==='candidate')assert.equal(await panel.locator('[data-ai-status]').innerText(),statusBefore,'another candidate keeps its status');
  assert.deepEqual(after[1],otherBefore,'another task keeps all data');
  assert.deepEqual(after[0].generated,before[0].generated,'failed local candidate is removed only from its owner');
  if(switchTarget==='task'){
    await panel.locator('[data-tab-id="task-0"] .ai-task-tab-select').click();
    await page.waitForFunction(()=>document.querySelector('#ai-image-panel')?.dataset.aiSelectedCandidateId==='selected-0');
  }
  else {await panel.locator('[data-ai-version-button]').click();await panel.locator('[data-ai-candidate-option="selected-0"]').click();}
  assert.equal(await panel.locator('[data-ai-edit-save]').isVisible(),true,'the owner keeps its pending label draft');
  await panel.locator('[data-ai-edit-save]').click();
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel [data-ai-status]').textContent.startsWith('수정 저장 완료'));
  const saved=await snapshot(page);assert.equal(saved[0].generated.length,before[0].generated.length+1);assert.deepEqual(saved[1],otherBefore);
  assert.deepEqual(saved[0].generated.slice(0,-1),before[0].generated,'all existing saved versions stay exact');
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('#ai-image-install-open').click();
  assert.deepEqual((await snapshot(page)).map(tab=>tab.generated),saved.map(tab=>tab.generated),'the failed intermediate version cannot return from queued autosave on reload');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({otherTaskUnchanged:true,ownerRollback:true,draftRetained:true,retryVersions:1,errors},null,2));
});

// 11-25: 시안 v6의 여러 라벨 선택·서식·정렬·단축키.
test('several labels: box select, mixed size with Enter, W alignment, bracket keys, typing and one undo step each',{timeout:120000},async t=>{
  const dir=path.join(evidence,'multi-select');fs.mkdirSync(dir,{recursive:true});
  const label=(id,text,x,y,size)=>({id,text,mode:'text',scope:'general',contentMode:'plain',position:{x,y},anchor:{x,y},
    manualStyle:{size:size/384},typography:{role:'text'}});
  const plan={version:4,frozen:true,relationGroups:[],labels:[label('a','가',.2,.3,20),label('b','나',.5,.5,28),label('c','다',.32,.72,20),label('d','라',.88,.12,20)]};
  const {page,errors}=await fixture(t,1,dir,{selectedPartial:true,beforeNavigate:async page=>{
    await page.addInitScript(plan=>{
      window.__seedReady=window.__seedReady.then(()=>new Promise((resolve,reject)=>{
        const r=indexedDB.open('5e.preview:5e-ai-image-tasks',1);
        r.onsuccess=()=>{const db=r.result,tx=db.transaction('tasks','readwrite'),store=tx.objectStore('tasks'),read=store.get('workspace');
          read.onsuccess=()=>{const record=read.result,item=record.tabs[0].generated[0];item.data=window.__task2.modified;item.labelPlan=plan;record.tabs[0].labelPreviewIncluded={[item.id]:true};store.put(record);};
          tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
        };r.onerror=()=>reject(r.error);
      }));
    },plan);
  }});
  const panel=page.locator('#ai-image-panel'),editor=panel.locator('[data-ai-inline-label-editor]'),field=key=>editor.locator(`[data-label-${key}]`);
  const ready=()=>page.waitForFunction(()=>{const p=document.querySelector('#ai-image-panel');return p.querySelector('.ai-label-edit-overlay text')&&!p.querySelector('[data-label-add]').disabled;});
  const chosen=()=>panel.locator('.ai-label-edit-overlay .is-selected').evaluateAll(groups=>groups.map(g=>g.dataset.aiLabelId).sort());
  const centers=()=>panel.locator('.ai-label-edit-overlay').evaluate(svg=>Object.fromEntries([...svg.querySelectorAll('[data-ai-label-id]')].map(g=>{
    const b=g.querySelector('text').getBoundingClientRect();return [g.dataset.aiLabelId,{x:b.x+b.width/2,y:b.y+b.height/2}];})));
  // 편집은 비동기로 들어가므로 기대한 값이 보일 때까지 기다린다.
  const until=async(check,message)=>{for(let i=0;i<150;i++){if(await check().catch(()=>false))return;await page.waitForTimeout(20);}assert.fail(message);};
  const value=(key,expected)=>until(async()=>await field(key).inputValue()===expected,`${key} = ${expected}`);
  const parent=(await snapshot(page))[0].generated[0];
  await toolClick(panel,'[data-ai-label-edit]');await ready();
  const ib=await panel.locator('.ai-generated-card.is-ai-active-candidate .ai-preview-stage > img').boundingBox(),at=(x,y)=>[ib.x+x*ib.width,ib.y+y*ib.height];
  // 빈 곳을 끌어 사각에 걸친 라벨 셋을 고른다(라는 밖).
  await page.mouse.move(...at(.08,.18));await page.mouse.down();await page.mouse.move(...at(.4,.5),{steps:3});
  assert.equal(await panel.locator('.ai-label-edit-marquee').count(),1,'drag shows the selection box');
  await page.mouse.move(...at(.62,.86),{steps:3});await page.mouse.up();
  assert.deepEqual(await chosen(),['a','b','c']);
  assert.equal(await panel.locator('.ai-label-edit-marquee').count(),0);
  assert.match(await field('count').innerText(),/3개/);
  assert.equal(await field('text').isVisible(),false,'the wording field belongs to a single label');
  assert.equal(await field('size').inputValue(),'');assert.equal(await field('size').getAttribute('placeholder'),'혼합');
  // W·H 단추: 마우스를 올리면 단축키가 보이고 두 개 이상일 때만 쓸 수 있다.
  const horizontal=editor.locator('[data-label-align="y"]');
  assert.equal(await horizontal.getAttribute('aria-keyshortcuts'),'W');assert.match(await horizontal.getAttribute('data-tip'),/\(W\)/);
  assert.equal(await horizontal.getAttribute('aria-disabled'),'false');
  assert.match(await editor.locator('[data-label-step="size"][data-delta="1"]').getAttribute('data-tip'),/\(\]\)/);
  assert.match(await editor.locator('[data-label-step="spacing"][data-delta="-1"]').getAttribute('data-tip'),/Shift\+\[/);
  // 섞인 크기에 숫자 + Enter면 고른 라벨 모두에 들어간다 — 실행 취소 한 번에 되돌아간다.
  await field('size').fill('15');await field('size').press('Enter');await value('size','15');await ready();
  assert.equal(await page.evaluate(()=>document.activeElement.matches('input,textarea,select')),false,'Enter leaves the field');
  assert.equal(await field('size').inputValue(),'15');assert.equal(await field('size').getAttribute('placeholder'),'');
  await panel.locator('[data-ai-edit-undo]').click();await value('size','');await ready();assert.deepEqual(await chosen(),['a','b','c'],'undo keeps the selection');
  await panel.locator('[data-ai-edit-redo]').click();await value('size','15');await ready();
  // W: 첫 선택 라벨(가)과 같은 높이. 한 단계로 되돌아간다.
  const before=await centers();
  await page.keyboard.press('w');await until(async()=>{const c=await centers();return Math.abs(c.b.y-c.a.y)<2;},'W aligns');await ready();
  const aligned=await centers();
  for(const id of ['b','c'])assert.ok(Math.abs(aligned[id].y-aligned.a.y)<2,`${id} aligned to the first label`);
  assert.ok(Math.abs(aligned.a.y-before.a.y)<.5&&Math.abs(aligned.d.y-before.d.y)<.5,'the base and unselected labels stay');
  await page.keyboard.press('ControlOrMeta+z');await until(async()=>{const c=await centers();return Math.abs(c.b.y-before.b.y)<.5;},'undo W');await ready();
  const undone=await centers();for(const id of ['b','c'])assert.ok(Math.abs(undone[id].y-before[id].y)<.5,'one undo restores the alignment');
  // [ ] 크기 ±1pt, Shift+[ ] 자간 ±0.01em — 고른 라벨 모두, 한 번에 한 단계.
  await page.keyboard.press(']');await value('size','16');await ready();
  await page.keyboard.press('Shift+BracketLeft');await value('spacing','-0.01');await ready();
  await page.keyboard.press('ControlOrMeta+z');await value('spacing','0');await ready();
  assert.equal(await field('spacing').inputValue(),'0');assert.equal(await field('size').inputValue(),'16');
  // 함께 끌면 모두 옮겨지고 실행 취소 한 번에 돌아온다.
  const dragFrom=await centers();
  await page.mouse.move(dragFrom.b.x,dragFrom.b.y);await page.mouse.down();await page.mouse.move(dragFrom.b.x+30,dragFrom.b.y+12,{steps:4});await page.mouse.up();
  await until(async()=>{const c=await centers();return Math.abs(c.a.x-dragFrom.a.x-30)<1.5;},'group drag');await ready();
  const dragged=await centers();
  for(const id of ['a','b','c'])assert.ok(Math.abs(dragged[id].x-dragFrom[id].x-30)<1.5,`${id} moves with the group`);
  assert.ok(Math.abs(dragged.d.x-dragFrom.d.x)<.5);assert.deepEqual(await chosen(),['a','b','c']);
  await page.keyboard.press('ArrowLeft');await until(async()=>(await centers()).c.x<dragged.c.x,'arrow');await ready();
  const nudged=await centers();for(const id of ['a','b','c'])assert.ok(nudged[id].x<dragged[id].x,'arrow keys move every selected label');
  await page.keyboard.press('ControlOrMeta+z');await until(async()=>Math.abs((await centers()).c.x-dragged.c.x)<.5,'undo arrow');await ready();
  await page.keyboard.press('ControlOrMeta+z');await until(async()=>Math.abs((await centers()).c.x-dragFrom.c.x)<.5,'undo drag');await ready();
  const back=await centers();for(const id of ['a','b','c'])assert.ok(Math.abs(back[id].x-dragFrom[id].x)<.5);
  // Ctrl/⌘ 클릭으로 빼고 더하기, ⌘A 전체.
  const hit=id=>panel.locator(`.ai-label-edit-overlay [data-ai-label-id="${id}"] .ai-label-edit-hit`);
  await hit('b').click({modifiers:['ControlOrMeta']});assert.deepEqual(await chosen(),['a','c']);
  await hit('d').click({modifiers:['ControlOrMeta']});assert.deepEqual(await chosen(),['a','c','d']);
  await page.keyboard.press('ControlOrMeta+a');assert.deepEqual(await chosen(),['a','b','c','d']);
  await page.mouse.click(...at(.7,.9));assert.deepEqual(await chosen(),[],'clicking an empty spot clears the selection');
  // 글 입력 중에는 [ ] W 가 글자로 들어가고 그림은 그대로다. 두 번 누르면 그림 위 입력칸에서 바로 고친다(11-26).
  await hit('d').dblclick();
  assert.equal(await page.evaluate(()=>document.activeElement.matches('.ai-label-inplace')),true,'double click edits the wording on the picture');
  const sizeD=await field('size').inputValue();
  await page.keyboard.press('End');await page.keyboard.type('[w]');
  assert.equal(await page.locator('.ai-label-inplace').inputValue(),'라[w]');assert.equal(await field('text').inputValue(),'라[w]','the side field follows live');
  assert.equal(await field('size').inputValue(),sizeD);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.ai-label-inplace').count(),0,'Esc closes the in-place field');
  assert.equal(await field('text').inputValue(),'라','Esc restores the wording');assert.equal(await editor.isVisible(),true);
  const chat=panel.locator('textarea:not([data-label-text])').first();
  if(await chat.isVisible()){await chat.fill('');await chat.type('[w]');assert.equal(await chat.inputValue(),'[w]');await chat.fill('');}
  await page.screenshot({path:path.join(dir,'multi-select.png')});
  assert.deepEqual((await snapshot(page))[0].generated,[parent],'all changes stay in the unsaved draft');
  assert.equal(await page.evaluate(()=>window.__task2.sends.length),0);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({boxSelect:true,mixedSizeEnter:true,alignW:true,brackets:true,typingKeepsKeys:true,undoOneStep:true,paidAiCalls:0,errors},null,2));
});

// 11-25 밤샘 검수 P1: 「지시선 라벨」·「라벨 추가」를 거듭 눌러도 앞 라벨을 덮지 않는다.
test('repeated label additions are offset instead of stacking on the previous label',{timeout:90000},async t=>{
  const dir=path.join(evidence,'add-offset');fs.mkdirSync(dir,{recursive:true});
  const {page,errors}=await fixture(t,1,dir,{selectedPartial:true,unlabeled:true});
  const panel=page.locator('#ai-image-panel'),editor=panel.locator('[data-ai-inline-label-editor]');
  const ready=()=>page.waitForFunction(()=>{const s=document.querySelector('#ai-image-panel [data-ai-inline-label-editor]');return s&&!s.hidden&&!s.querySelector('[data-label-add]').disabled;});
  const count=n=>page.waitForFunction(n=>document.querySelectorAll('#ai-image-panel .ai-label-edit-overlay [data-ai-label-id]').length===n,n);
  await toolClick(panel,'[data-ai-label-edit]');await ready();
  await editor.locator('[data-label-add-leader]').dispatchEvent('click');await count(1);await ready();
  await editor.locator('[data-label-add-leader]').dispatchEvent('click');await count(2);await ready();
  await editor.locator('[data-label-add]').dispatchEvent('click');await count(3);await ready();
  const boxes=await panel.locator('.ai-label-edit-overlay [data-ai-label-id] text').evaluateAll(texts=>texts.map(t=>{const b=t.getBoundingClientRect();return {x:b.x,y:b.y};}));
  for(let i=0;i<boxes.length;i++)for(let j=0;j<i;j++)
    assert.ok(Math.hypot(boxes[i].x-boxes[j].x,boxes[i].y-boxes[j].y)>5,`label ${i} does not cover label ${j}`);
  // 앞에 만든 지시선 라벨도 그대로 눌러 고를 수 있다.
  const first=panel.locator('.ai-label-edit-overlay [data-ai-label-id]').first();
  await first.locator('.ai-label-edit-hit').click();
  assert.equal(await first.evaluate(g=>g.classList.contains('is-selected')),true);
  await page.screenshot({path:path.join(dir,'add-offset.png')});
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>window.__task2.sends.length),0);
});
