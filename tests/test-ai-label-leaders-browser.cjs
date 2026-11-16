// Fixed label source: 6e2c55012461859cdc8afb4d9596d3f08d5409b4; current-contract adaptations retain behavior oracles.
const { installLabelSourcePage, armSelection, selectionArrived } = require('./helpers/label-source-browser.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const evidence=process.env.EVIDENCE_DIR||path.resolve(__dirname,'../.omo/evidence/codex-continuation-20261010/label-current-contracts/ai-label-leaders');
// Use the parent's running candidate; preserve its query when choosing an entry.
function entryUrl() {
  const supplied = process.env.RELEASE_URL || process.env.EXAM_URL || process.env.PREVIEW_URL;
  assert.ok(supplied, 'RELEASE_URL, EXAM_URL or PREVIEW_URL is required; this test never starts a server');
  const entry = new URL(supplied);
  if (process.env.APP_ENTRY) entry.pathname = process.env.APP_ENTRY;
  return entry.href;
}

test('native curved leaders pick, control drag, body move, undo, serialize, reopen and glyph edit', {timeout:90000},async()=>{
fs.mkdirSync(evidence,{recursive:true});const browser=await chromium.launch({headless:true});let page;
try {page=await browser.newPage({viewport:{width:1500,height:1000}});await installLabelSourcePage(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true'));await page.goto(entryUrl(),{waitUntil:'domcontentloaded'});await page.waitForSelector('#canvas');const skip=page.getByRole('button',{name:'건너뛰기',exact:true});if(await skip.isVisible().catch(()=>false))await skip.click();
await page.evaluate(async()=>{const v='?v=1.7.0-four-session-integration',{state,OBJECT_LABEL_TEXT_FONT_FAMILY}=await import('/js/state.js'+v),{applyLoaded,serialize}=await import('/js/project-io.js'+v),{worldToScreen}=await import('/js/viewport.js'+v),{undo,redo}=await import('/js/transform.js'+v);window.q={state,applyLoaded,serialize,worldToScreen,undo,redo};const object={id:'leader',type:'labeler',text:'콩팥',contentMode:'plain',labelType:'label',fontFamily:OBJECT_LABEL_TEXT_FONT_FAMILY,labelSize:4,layerId:1,strokeWidth:.2,strokeLevel:0,p1:{x:75,y:50},p2:{x:20,y:20},leaderRoutes:[{kind:'quadratic',attachment:'label',start:{x:25,y:22},controls:[{x:60,y:15}],target:{x:75,y:50},end:'circle',endRadius:1},{kind:'cubic',attachment:'frame',start:{x:30,y:25},controls:[{x:45,y:35},{x:40,y:65}],target:{x:65,y:65},end:'open-arrow'}]};applyLoaded(state,{version:'0.17',pages:[{id:'qa',objects:[object],groups:[],artboard:{w:100,h:80}}],activePageId:'qa'});state.update(s=>{s.activeTool='V';s.layers=[{id:1,name:'QA',visible:true}];s.activeLayerId=1;s.selectedIds=[];s.viewBox={x:0,y:0,w:100,h:80};});await document.fonts.ready;});
const point=(x,y)=>page.evaluate(({x,y})=>q.worldToScreen(document.querySelector('#canvas'),q.state.get().viewBox,x,y),{x,y});const obj=()=>page.evaluate(()=>structuredClone(q.state.get().objects[0]));
assert.equal(await page.locator('[data-id="leader"]:not([data-ui]) [data-label-leader-route]').count(),2);
const mid=await point(55,25.5);await page.mouse.click(mid.x,mid.y);assert.deepEqual(await page.evaluate(()=>q.state.get().selectedIds),['leader']);
const handle=page.locator('[data-handle="route-0-control-0"]').last();await handle.waitFor({state:'visible'});const box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+35,box.y+box.height/2+20,{steps:8});await page.mouse.up();const changed=await obj();assert.notDeepEqual(changed.leaderRoutes[0].controls[0],{x:60,y:15});assert.deepEqual(changed.p2,{x:20,y:20});
await page.evaluate(()=>q.undo(q.state));assert.deepEqual((await obj()).leaderRoutes[0].controls[0],{x:60,y:15});await page.evaluate(()=>q.redo(q.state));assert.deepEqual((await obj()).leaderRoutes,changed.leaderRoutes);
// Drag glyph away from its center endpoint handle to move the complete object.
const body=await point(18,20);await page.mouse.move(body.x,body.y);await page.mouse.down();await page.mouse.move(body.x+45,body.y+20,{steps:8});await page.mouse.up();const moved=await obj();assert.notDeepEqual(moved.p2,changed.p2);const dx=moved.p2.x-changed.p2.x,dy=moved.p2.y-changed.p2.y;assert.ok(Math.abs(moved.leaderRoutes[1].start.x-changed.leaderRoutes[1].start.x-dx)<1e-8);assert.ok(Math.abs(moved.leaderRoutes[1].target.y-changed.leaderRoutes[1].target.y-dy)<1e-8);
// Alt activates the same angle snapping as Ctrl, without macOS context-click.
const textHandle=page.locator('[data-handle="p1"]').last();const hb=await textHandle.boundingBox();
await page.keyboard.down('Alt');await page.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2);await page.mouse.down();await page.mouse.move(hb.x+hb.width/2+53,hb.y+hb.height/2+17,{steps:8});await page.mouse.up();await page.keyboard.up('Alt');
const snapped=await obj();assert.notDeepEqual(snapped.p2,moved.p2);assert.ok(Math.abs((snapped.leaderRoutes[0].start.x-moved.leaderRoutes[0].start.x)-(snapped.p2.x-moved.p2.x))<1e-8);assert.ok(Math.abs((snapped.leaderRoutes[0].start.y-moved.leaderRoutes[0].start.y)-(snapped.p2.y-moved.p2.y))<1e-8);assert.deepEqual(snapped.leaderRoutes[1].start,moved.leaderRoutes[1].start);
const angle=Math.atan2(snapped.p2.y-snapped.p1.y,snapped.p2.x-snapped.p1.x)*180/Math.PI;assert.ok(Math.abs(angle/15-Math.round(angle/15))<1e-8,'actual snapped angle is a 15-degree increment');
await page.evaluate(()=>q.undo(q.state));assert.deepEqual((await obj()).leaderRoutes,moved.leaderRoutes);
const serialized=await page.evaluate(()=>q.serialize(q.state.get()));fs.writeFileSync(path.join(evidence,'leader.5e'),JSON.stringify(serialized));await page.evaluate(data=>q.applyLoaded(q.state,data),serialized);assert.deepEqual((await obj()).leaderRoutes,moved.leaderRoutes);
const beforeEdit=await obj(),beforeHistory=await page.evaluate(()=>({undo:q.state.get().undoStack.length,redo:q.state.get().redoStack.length}));
const glyph=await page.locator('#scene [data-id="leader"]:not([data-ui]) text').first().evaluate(el=>{const b=el.getBoundingClientRect();return{x:b.x+b.width*.2,y:b.y+b.height/2};});
await armSelection(page,'leader');await page.mouse.click(glyph.x,glyph.y);await selectionArrived(page);
const editor=page.locator('.unified-text-editor'),inline=page.locator('.ai-inline-label-editor');
assert.equal(await inline.count(),0,'first click selects the leader');assert.equal(await editor.count(),0);
await page.mouse.click(glyph.x,glyph.y);await inline.waitFor({state:'visible'});assert.equal(await inline.inputValue(),'콩팥');assert.equal(await editor.count(),0);
await inline.fill('임시 콩팥');await page.keyboard.press('Escape');await inline.waitFor({state:'detached'});assert.deepEqual(await obj(),beforeEdit,'inline cancel retains routes and source');
assert.deepEqual(await page.evaluate(()=>({undo:q.state.get().undoStack.length,redo:q.state.get().redoStack.length})),beforeHistory);
const toggle=page.locator('#drawer-right-toggle');if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
await page.waitForFunction(()=>document.querySelector('.panel-right').getBoundingClientRect().right<=innerWidth+1);
const detail=page.locator('#inspector [data-text-detail-edit]:visible');assert.equal(await detail.count(),1);assert.equal(await detail.getAttribute('aria-label'),'텍스트 상세 편집');
await detail.click();await editor.waitFor({state:'visible'});assert.equal(await editor.locator('textarea').inputValue(),'콩팥');await editor.locator('textarea').fill('취소된 콩팥');await page.keyboard.press('Escape');await editor.waitFor({state:'detached'});
assert.deepEqual(await obj(),beforeEdit,'detailed cancel retains routes and source');assert.deepEqual(await page.evaluate(()=>({undo:q.state.get().undoStack.length,redo:q.state.get().redoStack.length})),beforeHistory);
await detail.click();await editor.waitFor({state:'visible'});await editor.locator('textarea').fill('콩팥 검수');await editor.getByRole('button',{name:'확인',exact:true}).click();
const edited=await obj();assert.equal(edited.text,'콩팥 검수');assert.deepEqual(edited.leaderRoutes,beforeEdit.leaderRoutes);assert.deepEqual(edited.p1,beforeEdit.p1);assert.deepEqual(edited.p2,beforeEdit.p2);
await page.evaluate(()=>q.undo(q.state));assert.deepEqual(await obj(),beforeEdit);await page.evaluate(()=>q.redo(q.state));assert.deepEqual(await obj(),edited);
const editedProject=await page.evaluate(()=>q.serialize(q.state.get()));await page.evaluate(data=>q.applyLoaded(q.state,data),editedProject);assert.deepEqual(await obj(),edited);
assert.deepEqual(errors,[]);await page.screenshot({path:path.join(evidence,'native-leaders.png')});fs.writeFileSync(path.join(evidence,'edited-leader.5e'),JSON.stringify(editedProject));fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({pass:true,scenarios:['curve picking','control drag','undo redo','whole object move','serialize reopen','first selection','second inline','inline and detailed cancellation','explicit details icon','glyph edit history and serialization','Alt angle snap retains label attachment and frame start'],changed,moved,snapped,edited,errors},null,2));
} catch(e){if(page)await page.screenshot({path:path.join(evidence,'failure.png')});throw e;}finally{await browser.close();}
});
