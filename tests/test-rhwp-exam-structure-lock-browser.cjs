// 구조 잠금: 잠기면 글만 고치고, 표의 크기·줄/칸·합치기는 막힌다. 풀면 같은 키가 그대로 동작한다.
// 표 칸 안 Shift+Tab은 한컴처럼 이전 칸으로 간다. 5E_hwp 위쪽 「구조 잠금」 단추로 켜고 끈다.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
const out=path.resolve(process.env.EVIDENCE_DIR||'_work/structure-lock');fs.mkdirSync(out,{recursive:true});
for(const [name,engine] of Object.entries({chromium,webkit})) test(`${name}: structure lock keeps text editable and table structure fixed`,async t=>{
 await h.withServer(async origin=>{
  const browser=await engine.launch();t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await h.navigate(page,origin+'/?mode=pro&exam=1&mobile=0');await h.ready(page);
  await page.evaluate(()=>{window.lockBridge=()=>{const deps=document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps;return {deps,wasm:deps.wasm,input:deps.getInputHandler()};};});
  const run=(fn,arg)=>page.evaluate(fn,arg);
  await h.action(page,'new');await h.idle(page);
  await run(()=>{const b=window.lockBridge(),w=b.wasm,t=w.createTable(0,0,0,2,3);window.lockTable=t;
   w.resizeTableCells(0,t.paraIdx,t.controlIdx,[0,1,2,3,4,5].map(cellIdx=>({cellIdx,heightDelta:4000,widthDelta:cellIdx%3*600})));b.deps.eventBus.emit('document-changed');});
  const focusCell=()=>run(()=>{const b=window.lockBridge(),t=window.lockTable;b.input.cursor.exitCellSelectionMode();b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:0,parentParaIndex:t.paraIdx,controlIndex:t.controlIdx,cellIndex:0,cellParaIndex:0});b.input.updateCaret();b.input.focus();});
  // 표 마지막 칸(2×3의 여섯째)으로 커서를 옮긴다 — 여기서 Tab은 엔진이 줄 추가를 직접 실행한다(M1).
  const focusLast=()=>run(()=>{const b=window.lockBridge(),t=window.lockTable;b.input.cursor.exitCellSelectionMode();b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:0,parentParaIndex:t.paraIdx,controlIndex:t.controlIdx,cellIndex:5,cellParaIndex:0});b.input.updateCaret();b.input.focus();});
  const sizes=()=>run(()=>{const w=window.lockBridge().wasm,t=window.lockTable;return Array.from({length:w.getTableDimensions(0,t.paraIdx,t.controlIdx).cellCount},(_,i)=>{const p=w.getCellProperties(0,t.paraIdx,t.controlIdx,i);return [p.width,p.height];});});
  const dims=()=>run(()=>{const w=window.lockBridge().wasm,t=window.lockTable;return w.getTableDimensions(0,t.paraIdx,t.controlIdx);});
  const cellText=()=>run(()=>{const w=window.lockBridge().wasm,t=window.lockTable;return w.getTextInCell(0,t.paraIdx,t.controlIdx,0,0,0,100);});
  const lockButton=page.locator('[data-exam-action="structure-lock"]');
  assert.equal(await lockButton.getAttribute('aria-pressed'),'false','5E_hwp starts unlocked');
  await lockButton.click();assert.equal(await lockButton.getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('#exam-status').textContent(),/구조 잠금/);
  const structural=[[['F5'],'Shift+ArrowRight'],[['F5'],'Control+ArrowRight'],[['F5'],'Alt+ArrowRight'],[['F5'],'Shift+ArrowDown'],[['Shift+F5','ArrowRight'],'w']];
  for(const [prep,key] of structural){await focusCell();for(const k of prep)await page.keyboard.press(k);const before=await sizes();await page.keyboard.press(key);assert.deepEqual(await sizes(),before,`locked: ${key} keeps cell sizes`);}
  {await focusCell();const before=await dims();await page.keyboard.press('Control+Enter');assert.deepEqual(await dims(),before,'locked: no row insert');}
  {await focusCell();await page.keyboard.press('Shift+F5');await page.keyboard.press('ArrowRight');const before=await dims();await page.keyboard.press('m');assert.deepEqual(await dims(),before,'locked: no merge');}
  {await focusCell();await page.keyboard.type('가나');assert.equal(await cellText(),'가나','locked: text stays editable');await page.keyboard.press('Control+z');}
  // 표 칸 안 Shift+Tab: 이전 칸
  await focusCell();await page.keyboard.press('Tab');assert.equal(await run(()=>window.lockBridge().input.getCursorPosition().cellIndex),1);
  await page.keyboard.press('Shift+Tab');assert.equal(await run(()=>window.lockBridge().input.getCursorPosition().cellIndex),0,'Shift+Tab moves to the previous cell');
  {await focusLast();const before=await dims();await page.keyboard.press('Tab');assert.deepEqual(await dims(),before,'locked: Tab in the last cell adds no row (M1)');}
  await page.screenshot({path:path.join(out,name+'-locked.png')});
  // 풀면 같은 키가 동작한다
  await lockButton.click();assert.equal(await lockButton.getAttribute('aria-pressed'),'false');
  {await focusCell();await page.keyboard.press('F5');const before=await sizes();await page.keyboard.press('Shift+ArrowRight');assert.equal((await sizes())[0][0],before[0][0]+300,'unlocked: cell width grows');await page.keyboard.press('Control+z');}
  {await focusCell();const before=await dims();await page.keyboard.press('Control+Enter');assert.equal((await dims()).rowCount,before.rowCount+1,'unlocked: row insert');await page.keyboard.press('Control+z');}
  {await focusLast();const before=await dims();await page.keyboard.press('Tab');assert.equal((await dims()).rowCount,before.rowCount+1,'unlocked: Tab in the last cell still adds a row');await page.keyboard.press('Control+z');}
  assert.deepEqual(errors,[]);
 });
});
