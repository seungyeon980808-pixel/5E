// Fixed label source: 6e2c55012461859cdc8afb4d9596d3f08d5409b4; assertions and fixtures retained.
const { installLabelSourcePage, armSelection, selectionArrived } = require('./helpers/label-source-browser.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const root=process.env.EVIDENCE_DIR||path.resolve(__dirname,'../.omo/evidence/labeler-interactions-20261007/browser');
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]) test(`labeler native gestures and route geometry in ${name}`,{timeout:120000},async()=>{
 const dir=path.join(root,name);fs.mkdirSync(dir,{recursive:true});const browser=await engine.launch({headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});await installLabelSourcePage(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true'));
 await page.goto((process.env.PREVIEW_URL||'http://127.0.0.1:62759/')+'?mode=pro',{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{await import('/js/main.js?v=1.7.0-four-session-integration');});
 const skip=page.getByRole('button',{name:'건너뛰기',exact:true});if(await skip.isVisible())await skip.click();
 await page.evaluate(async()=>{
  const v='?v=1.7.0-four-session-integration';const {state}=await import('/js/state.js'+v);
  const {serialize,applyLoaded}=await import('/js/project-io.js'+v);const {undo,redo}=await import('/js/transform.js'+v);
  window.qa={state,serialize,applyLoaded,undo,redo};
  const common={type:'labeler',labelSize:3,fontFamily:'"IBM Plex Sans KR", sans-serif',strokeLevel:0,strokeWidth:.2,locked:false,positionLocked:false,layerId:1,order:1,contentMode:'plain'};
  state.update(s=>{s.objects=[
   {...common,id:'manual',text:'온도 센서',p1:{x:12,y:45},elbow:{x:30,y:45},p2:{x:30,y:24}},
   {...common,id:'ai',text:'플라스틱 컵',p1:{x:67,y:45},p2:{x:82,y:24},aiAutoLabel:true,aiParentImageId:'image',labelTypographyVersion:1,leaderRoutes:[{kind:'polyline',attachment:'label',end:'none',start:{x:82,y:28},controls:[{x:82,y:45}],target:{x:67,y:45}}]},
   {...common,id:'solo',text:'지시선 없는 라벨',p1:{x:52,y:78},p2:{x:52,y:78}},
   {...common,id:'formula',text:'m_B',source:'m_B',rawSource:'m_B',contentMode:'formula',p1:{x:15,y:75},p2:{x:30,y:63},labelTypographyVersion:1,labelScriptStyles:[{start:2,end:3,kind:'sub',role:'name'}]},
   {id:'legacy',type:'text',text:'기존 AI 라벨',x:72,y:63,fontSize:3,fontFamily:common.fontFamily,contentMode:'plain',layerId:1,aiAutoLabel:true,aiParentImageId:'image',labelTypographyVersion:1},
   {id:'legacy-formula',type:'formula',source:'V_0',rawSource:'V_0',x:10,y:12,fontSize:3,fontFamily:common.fontFamily,contentMode:'formula',layerId:1,aiAutoLabel:true,aiParentImageId:'image',labelTypographyVersion:1},
   {...common,id:'dense-upper',text:'마개',labelSize:3.7,p1:{x:105,y:24},p2:{x:105,y:24},aiAutoLabel:true,aiParentImageId:'image',labelTypographyVersion:1},
   {...common,id:'dense-lower',text:'분별 깔때기',labelSize:3.7,p1:{x:105,y:27.5},p2:{x:105,y:27.5},aiAutoLabel:true,aiParentImageId:'image',labelTypographyVersion:1},
  ];s.artboard={w:230,h:170};s.selectedIds=['manual'];s.targetedId=null;s.activeTool='V';s.viewBox={x:0,y:0,w:115,h:85};s.undoStack=[];s.redoStack=[];});
 });
 const get=id=>page.evaluate(id=>structuredClone(window.qa.state.get().objects.find(o=>o.id===id)),id);
 const point=async id=>{const b=await page.locator(`#scene [data-id="${id}"]:not([data-ui]) text`).first().evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};});assert.ok(b,id);return {x:b.x+b.width/2,y:b.y+b.height/2};};
 const click=async id=>{const p=await point(id);const selected=await page.evaluate(id=>window.qa.state.get().selectedIds.length===1&&window.qa.state.get().selectedIds[0]===id,id);await page.mouse.click(p.x,p.y);if(!selected)await page.mouse.click(p.x,p.y);try{await page.locator('.ai-inline-label-editor').waitFor({state:'visible',timeout:5000});}catch(e){await page.screenshot({path:path.join(dir,'click-failed-'+id+'.png')});fs.writeFileSync(path.join(dir,'click-failed-'+id+'.json'),JSON.stringify(await page.evaluate(async p=>{const v='?v=1.7.0-four-session-integration';const {screenToWorld}=await import('/js/viewport.js'+v);const {pickSelectableObjectAtPoint,isLabelerTextPoint}=await import('/js/pick.js'+v);const s=window.qa.state.get(),wp=screenToWorld(document.querySelector('#canvas'),s.viewBox,p.x,p.y);return{selected:s.selectedIds,active:s.activeTool,layer:s.activeLayerId,draft:s.draftText,wp,picked:pickSelectableObjectAtPoint(s,wp),textPoint:s.objects.filter(o=>isLabelerTextPoint(o,wp)).map(o=>o.id),errors:window.qa.errors};},p),null,2));throw e;}return p;};
 const before=await get('manual');
 const compare=await page.evaluate(()=>{const actual=document.querySelector('#scene [data-id="manual"]:not([data-ui])');const selected=document.querySelector('[data-ui="labeler-selection"]');const line=e=>[...e.querySelectorAll('line')].map(n=>['x1','y1','x2','y2'].map(k=>n.getAttribute(k)));return{actual:line(actual),selected:line(selected)};});
 assert.deepEqual(compare.actual,compare.selected);assert.equal(compare.actual.length,2);
 await page.screenshot({path:path.join(dir,'selected-elbow.png')});
 for(const id of ['manual','ai','legacy','formula','solo','legacy-formula','dense-upper','dense-lower']){
  const original=await get(id);await click(id);const input=page.locator('.ai-inline-label-editor');
  await page.waitForFunction(()=>document.activeElement?.matches('.ai-inline-label-editor'));
  assert.equal(await page.locator(`[data-handle][data-id="${id}"]`).count(),0,'handles hidden while editing');
  if(id==='manual') assert.equal(await page.locator('#scene [data-id="manual"] line').count(),2,'leaders stay visible');
  if(id==='ai')await page.screenshot({path:path.join(dir,'inline-edit.png')});
  const next=id==='formula'?'m_C':id==='legacy-formula'?'V_1':original.text+' 수정';
  assert.equal(await input.inputValue(),original.rawSource||original.text,'source is available on first click');
  if(id==='manual'){
   await page.evaluate(()=>{window.draftProjection={label:document.querySelector('#scene [data-id="solo"]:not([data-ui])'),layer:document.querySelector('.insp-layer-row')};});
   await input.pressSequentially('abc');
   assert.equal(await page.evaluate(()=>window.draftProjection.label===document.querySelector('#scene [data-id="solo"]:not([data-ui])')),true,'native draft input must not rebuild unchanged SVG objects');
   assert.equal(await page.evaluate(()=>window.draftProjection.layer===document.querySelector('.insp-layer-row')),true,'native draft input must not rebuild the unchanged inspector');
   await input.evaluate(el=>{
    el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'ㅎ'}));
    el.value='한글 조합';
    el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:'글',isComposing:true}));
    el.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Enter',isComposing:true,keyCode:229}));
   });
   assert.equal(await input.isVisible(),true,'composition Enter must not close the native editor');
   assert.equal(await page.evaluate(()=>window.qa.state.get().draftText.text),'한글 조합');
   await input.evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'한글 조합'})));
  }
  await input.fill(next);await input.press('Enter');
  assert.equal((await get(id)).text,next);
  const edited=await get(id);if(original.p1)assert.deepEqual(edited.p1,original.p1);if(original.p2)assert.deepEqual(edited.p2,original.p2);assert.deepEqual(edited.elbow,original.elbow);assert.deepEqual(edited.leaderRoutes,original.leaderRoutes);assert.equal(edited.fontFamily,original.fontFamily);
  if(id==='formula'){assert.equal(edited.contentMode,'formula');assert.equal(edited.source,'m_C');assert.deepEqual(edited.labelScriptStyles,original.labelScriptStyles);}
  await click(id);await input.fill('취소할 문구');await input.press('Escape');assert.equal((await get(id)).text,edited.text);
  await page.evaluate(()=>window.qa.undo(window.qa.state));assert.deepEqual(await get(id),original,'undo restores content and formatting');
  await page.evaluate(()=>window.qa.redo(window.qa.state));assert.deepEqual(await get(id),edited,'redo restores committed content');
 }
 // Detailed typography stays available through the existing context-menu action.
 const detail=async id=>{await page.evaluate(id=>window.qa.state.update(s=>{s.selectedIds=[id];s.targetedId=null;}),id);const p=await point(id);await page.mouse.click(p.x,p.y,{button:'right'});await page.locator('.text-ctx-menu').getByRole('button',{name:'텍스트 상세 편집',exact:true}).click();};
 let p;await detail('manual');
 await page.locator('.unified-text-editor').waitFor({state:'visible'});
 assert.equal(await page.locator('.unified-text-editor textarea').inputValue(),'온도 센서 수정');
 await page.screenshot({path:path.join(dir,'detailed-editor.png')});
 await page.locator('.unified-text-editor').getByRole('button',{name:'취소',exact:true}).click();
 // Detailed editing retains the same object while changing its registered font.
 const beforeFont=await get('manual');await detail('manual');
 const font=page.locator('.unified-text-editor select.unified-style-select');
 const alternate=await font.evaluate(el=>[...el.options].find(o=>o.value!==el.value).value);
 await font.selectOption(alternate);await page.locator('.unified-text-editor').getByRole('button',{name:'확인',exact:true}).click();
 const styled=await get('manual');assert.equal(styled.fontFamily,alternate);assert.equal(styled.text,beforeFont.text);assert.deepEqual(styled.elbow,beforeFont.elbow);assert.deepEqual(styled.p1,beforeFont.p1);assert.deepEqual(styled.p2,beforeFont.p2);
 // Move only the elbow; the label center and target must remain fixed.
 await page.evaluate(()=>window.qa.state.update(s=>{s.selectedIds=['manual'];s.targetedId=null;}));
 const hb=await page.locator('[data-id="manual"][data-handle="elbow"]').last().evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};});const prior=await get('manual');
 await page.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2);await page.mouse.down();await page.mouse.move(hb.x+hb.width/2+30,hb.y+hb.height/2+12,{steps:6});await page.mouse.up();
 const moved=await get('manual');assert.notDeepEqual(moved.elbow,prior.elbow);assert.deepEqual(moved.p1,prior.p1);assert.deepEqual(moved.p2,prior.p2);
 // The central label handle moves text without moving its target.
 const mb=await page.locator('[data-id="manual"][data-handle="p1"]').last().evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};});
 await page.mouse.move(mb.x+mb.width/2,mb.y+mb.height/2);await page.mouse.down();await page.mouse.move(mb.x+mb.width/2+20,mb.y+mb.height/2-15,{steps:6});await page.mouse.up();
 const relocated=await get('manual');assert.deepEqual(relocated.p1,moved.p1);assert.deepEqual(relocated.elbow,moved.elbow);assert.notDeepEqual(relocated.p2,moved.p2);assert.equal(await page.locator('.ai-inline-label-editor').count(),0);
 const saved=await page.evaluate(()=>{const q=window.qa,d=q.serialize(q.state.get());q.applyLoaded(q.state,JSON.parse(JSON.stringify(d)));return d;});
 for(const id of ['manual','ai','formula','legacy','solo','legacy-formula'])assert.equal((await get(id)).text,saved.pages[0].objects.find(o=>o.id===id).text);
 await click('ai');await page.locator('.ai-inline-label-editor').press('Escape');
 assert.deepEqual(errors,[]);await page.screenshot({path:path.join(dir,'roundtrip.png')});
 fs.writeFileSync(path.join(dir,'project.5e'),JSON.stringify(saved,null,2));fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({browser:name,syntheticFixture:true,paidAiCalls:0,original:before,relocated,geometry:compare,errors},null,2));
 }finally{await browser.close();}
});
