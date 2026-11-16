const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
const out=path.resolve(process.env.EVIDENCE_DIR||'_work/shortcut-qa');fs.mkdirSync(out,{recursive:true});
for(const [name,engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) test(`${name}: Han/글 exam shortcuts change native content and retain history`,async t=>{
 await h.withServer(async origin=>{
  const browser=await engine.launch();t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  await h.navigate(page,origin+'/?mode=pro&exam=1&mobile=0');await h.ready(page);
  // The exam editor is reached through the embedded Studio, independent of host panels.
  await page.evaluate(()=>{window.examShortcutBridge=()=>{const element=document.querySelector('#exam-studio iframe'),deps=element.contentWindow.rhwpStudio.plugins.deps;
   return {editor:{element},deps,wasm:deps.wasm,get input(){return deps.getInputHandler();}};};});
  const frame=page.frameLocator('#exam-studio iframe');
  const run=fn=>page.evaluate(fn);
  const focus=()=>run(()=>window.examShortcutBridge().input.focus());
  const body=async()=>{await h.action(page,'new');await h.idle(page);await focus();await page.keyboard.type('1. 과학 시험지의 발문과 선지를 편집합니다.');await page.keyboard.press('Control+a');};
  const chars=()=>run(()=>window.examShortcutBridge().input.getCharProperties());
  const paras=()=>run(()=>window.examShortcutBridge().input.getParaProperties());
  async function change(key,read,assertChange){if(read===chars||read===paras)await page.keyboard.press('Control+a');const before=await read();await page.keyboard.press(key);const after=await read();assertChange(after,before);await page.keyboard.press('Control+z');assert.deepEqual(await read(),before,key+' undo');await page.keyboard.press('Control+Shift+z');assert.deepEqual(await read(),after,key+' redo');await page.keyboard.press('Control+z');}
  await body();
  for(const [key,prop,step] of [['Alt+Shift+n','spacings',-1],['Alt+Shift+w','spacings',1],['Alt+Shift+j','ratios',-1],['Alt+Shift+k','ratios',1]])
   await change(key,chars,(a,b)=>assert.equal(a[prop][0],b[prop][0]+step,key));
  for(const [key,step] of [['Alt+Shift+e',100],['Alt+Shift+r',-100]])await change(key,chars,(a,b)=>assert.equal(a.fontSize,b.fontSize+step));
  for(const [key,prop] of [['Control+b','bold'],['Control+u','underline'],['Control+i','italic'],['Alt+Shift+p','superscript'],['Alt+Shift+s','subscript']])
   await change(key,chars,(a,b)=>assert.notEqual(a[prop],b[prop],key));
  for(const [key,alignment] of [['Control+Shift+l','Left'],['Control+Shift+c','Center'],['Control+Shift+r','Right'],['Control+Shift+m','Justify']]){
   await page.keyboard.press(key);assert.equal((await paras()).alignment.toLowerCase(),alignment.toLowerCase());
  }
  for(const [key,step] of [['Alt+Shift+a',-10],['Alt+Shift+z',10]])await change(key,paras,(a,b)=>assert.equal(a.lineSpacing,b.lineSpacing+step));
  // Option can produce a non-ASCII character: actual code, not key text, owns it.
  await page.keyboard.press('Control+a');const beforeKorean=await chars();
  await run(()=>{const b=window.examShortcutBridge(),v=b.editor.element.contentWindow;b.input.textarea.dispatchEvent(new v.KeyboardEvent('keydown',{key:'ㅜ',code:'KeyN',altKey:true,shiftKey:true,bubbles:true,cancelable:true}));});
  assert.equal((await chars()).spacings[0],beforeKorean.spacings[0]-1);await page.keyboard.press('Control+z');
  for(const [key,heading] of [['Alt+l','글자 모양'],['Alt+t','문단 모양'],['Control+F10','문자표']]){
   await page.keyboard.press(key);await frame.locator('.modal-overlay .dialog-title').filter({hasText:heading}).waitFor();
   await frame.locator('.modal-overlay').last().locator('button').filter({hasText:/취소|닫기/}).last().click();await focus();
  }
  await page.keyboard.press('Control+h');await frame.locator('.find-dialog').waitFor();await frame.locator('.find-dialog .dialog-close').click();await focus();
  // Copy formatting to a separate paragraph using the same Alt+C workflow.
  await body();await page.keyboard.press('Control+b');await page.keyboard.press('Alt+c');await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');await page.keyboard.type('모양을 복사할 선지');
  await page.keyboard.press('Home');await page.keyboard.press('Shift+End');await page.keyboard.press('Control+b');assert.equal((await chars()).bold,false);
  await page.keyboard.press('Alt+c');assert.equal((await chars()).bold,true);
  // A caret also opens character settings for the next typed text.
  await page.keyboard.press('ArrowRight');await page.keyboard.press('Alt+l');await frame.locator('.modal-overlay .dialog-title').filter({hasText:'글자 모양'}).waitFor();
  await frame.locator('.modal-overlay .dialog-close').click();await focus();
  // Fast hanging indent aligns continuation lines with the body after "1. ".
  await body();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
  const bodyIndent=await paras();await page.keyboard.press('Shift+Tab');assert.notEqual((await paras()).indent,bodyIndent.indent);await page.keyboard.press('Control+z');assert.equal((await paras()).indent,bodyIndent.indent);
  // Han/글 paragraph steps: one character first-line indent, 1pt margins, numbering levels.
  await body();const near=(a,b,label)=>assert.ok(Math.abs(a-b)<0.11,label+' '+a+' vs '+b);
  const charPx=(await chars()).fontSize/100/0.75,ptPx=1/0.75;
  const flat=await paras();await page.keyboard.press('Control+Alt+F5');assert.deepEqual(await paras(),flat,'a zero margin is not reduced');
  // Each change() is undone afterwards, so give the decrease keys room first.
  for(const key of ['Control+Alt+F6','Control+Alt+F6','Control+Alt+F7','Control+Alt+F7'])await page.keyboard.press(key);
  for(const [key,field,px] of [['Control+F6','indent',charPx],['Control+F5','indent',-charPx],['Control+Shift+i','indent',charPx],['Control+Shift+o','indent',-charPx],
   ['Control+Alt+F6','marginLeft',ptPx],['Control+Alt+F5','marginLeft',-ptPx],['Control+Shift+g','marginLeft',ptPx],['Control+Shift+e','marginLeft',-ptPx],
   ['Control+Alt+F7','marginRight',ptPx],['Control+Alt+F8','marginRight',-ptPx],['Control+Shift+d','marginRight',ptPx],['Control+Shift+f','marginRight',-ptPx]])
   await change(key,paras,(a,b)=>near(a[field],b[field]+px,key));
  await change('Control+F8',paras,(a,b)=>{near(a.marginLeft,b.marginLeft+ptPx,'F8 left');near(a.marginRight,b.marginRight+ptPx,'F8 right');});
  await change('Control+F7',paras,(a,b)=>{near(a.marginLeft,b.marginLeft-ptPx,'F7 left');near(a.marginRight,b.marginRight-ptPx,'F7 right');});
  await run(()=>window.examShortcutBridge().input.dispatcher.dispatchWithResult('format:toggle-numbering'));
  await change('Control+NumpadAdd',paras,(a,b)=>assert.equal(a.paraLevel,b.paraLevel+1));
  await page.keyboard.press('Control+NumpadAdd');
  await change('Control+NumpadSubtract',paras,(a,b)=>assert.equal(a.paraLevel,b.paraLevel-1));
  // A multi-paragraph selection moves each paragraph from its own margin in one undo step.
  await body();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');await page.keyboard.type('둘째 문단');
  for(let n=0;n<3;n++)await page.keyboard.press('Control+Alt+F6');
  const margins=()=>run(()=>{const w=window.examShortcutBridge().wasm;return [0,1].map(i=>w.getParaPropertiesAt(0,i).marginLeft);});
  const separate=await margins();await page.keyboard.press('Control+a');await page.keyboard.press('Control+Alt+F6');
  const moved=await margins();moved.forEach((m,i)=>near(m,separate[i]+ptPx,'paragraph '+i));
  assert.equal(await run(()=>!!window.examShortcutBridge().input.getSelection()),true,'selection stays for repeated steps');
  await page.keyboard.press('Control+z');assert.deepEqual(await margins(),separate);await page.keyboard.press('Control+Shift+z');assert.deepEqual(await margins(),moved);
  // Body-only soft line break and page break use the editor's original history.
  await body();await page.keyboard.press('ArrowRight');
  const count=()=>run(()=>window.examShortcutBridge().wasm.getParagraphCount(0));
  const beforeSoft=await count();await page.keyboard.press('Shift+Enter');assert.equal(await count(),beforeSoft);await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Enter');assert.ok(await count()>beforeSoft);await page.keyboard.press('Control+z');
  // A timed two-stroke chord opens the normal native dialog, not a browser tab.
  await page.keyboard.press('Control+n');await page.keyboard.press('t');await frame.locator('[data-row][data-col]').first().waitFor();
  await frame.locator('[data-row="1"][data-col="1"]').click();assert.equal(await run(()=>window.examShortcutBridge().input.cursor.isInCell()),true);await page.keyboard.press('Control+z');await focus();
  await page.keyboard.press('Control+n');await page.keyboard.press('m');await frame.locator('.modal-overlay .dialog-title').filter({hasText:/수식/}).waitFor();
  await frame.locator('.eq-script').fill('x sup 2 + y sub 1');await frame.locator('.modal-overlay .dialog-btn-primary').click();await focus();
  assert.ok(await run(()=>{const w=window.examShortcutBridge().wasm,c=w.getPageControlLayout(0).controls.find(c=>c.type==='equation');return c&&w.getEquationProperties(c.secIdx,c.paraIdx,c.controlIdx).script.includes('sup');}));
  const chooser=page.waitForEvent('filechooser');await page.keyboard.press('Control+n');await page.keyboard.press('i');await (await chooser).setFiles(path.resolve('tests/fixtures/rights-clear-smoke.png'));
  await h.waitForState(page,()=>!!window.examShortcutBridge().input.imagePlacementMode);await page.keyboard.press('Escape');assert.equal(await run(()=>!!window.examShortcutBridge().input.imagePlacementMode),false);
  // Table fixtures are native files; all edits below come from physical keys.
  await h.action(page,'new');await h.idle(page);
  await run(()=>{const b=window.examShortcutBridge(),w=b.wasm,t=w.createTable(0,0,0,2,3);window.shortcutTable=t;
   w.resizeTableCells(0,t.paraIdx,t.controlIdx,[0,1,2,3,4,5].map(cellIdx=>({cellIdx,heightDelta:4000+(cellIdx>2?600:0),widthDelta:cellIdx%3*600})));
   w.insertTextInCell(0,t.paraIdx,t.controlIdx,0,0,0,'1. 셀 선지 두 번째 줄');b.deps.eventBus.emit('document-changed');});
  const cellFocus=()=>run(()=>{const b=window.examShortcutBridge(),t=window.shortcutTable;
   b.input.cursor.exitCellSelectionMode();b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:3,parentParaIndex:t.paraIdx,controlIndex:t.controlIdx,cellIndex:0,cellParaIndex:0});b.input.updateCaret();b.input.focus();});
  const cellProps=()=>run(()=>{const w=window.examShortcutBridge().wasm,t=window.shortcutTable;return Array.from({length:w.getTableDimensions(0,t.paraIdx,t.controlIdx).cellCount},(_,i)=>w.getCellProperties(0,t.paraIdx,t.controlIdx,i));});
  const dims=()=>run(()=>{const w=window.examShortcutBridge().wasm,t=window.shortcutTable;return w.getTableDimensions(0,t.paraIdx,t.controlIdx);});
  await cellFocus();const rows=(await dims()).rowCount;await page.keyboard.press('Control+Enter');assert.equal((await dims()).rowCount,rows+1);await page.keyboard.press('Control+z');assert.equal((await dims()).rowCount,rows);
  await cellFocus();await page.keyboard.press('Control+Backspace');assert.equal((await dims()).rowCount,rows-1);await page.keyboard.press('Control+z');assert.equal((await dims()).rowCount,rows);
  await cellFocus();await page.keyboard.press('Tab');assert.equal(await run(()=>window.examShortcutBridge().input.getCursorPosition().cellIndex),1);
  await page.keyboard.press('Shift+Tab');assert.equal(await run(()=>window.examShortcutBridge().input.getCursorPosition().cellIndex),0);
  await cellFocus();const cellIndent=await paras();await page.keyboard.press('Control+F6');assert.ok((await paras()).indent>cellIndent.indent,'cell first-line indent');await page.keyboard.press('Control+z');assert.equal((await paras()).indent,cellIndent.indent);
  await cellFocus();const indentBefore=await paras();await page.keyboard.press('Control+Shift+Tab');assert.notEqual((await paras()).indent,indentBefore.indent);await page.keyboard.press('Control+z');
  await cellFocus();await page.keyboard.press('Shift+F5');assert.equal(await run(()=>window.examShortcutBridge().input.cursor.getCellSelectionPhase()),2);
  await page.keyboard.press('ArrowRight');
  await change('w',cellProps,(a)=>assert.equal(a[0].width,a[1].width));
  await cellFocus();await page.keyboard.press('Shift+F5');await page.keyboard.press('ArrowDown');
  await change('h',cellProps,(a)=>assert.equal(a[0].height,a[3].height));
  await cellFocus();await page.keyboard.press('F5');
  await change('Shift+ArrowRight',cellProps,(a,b)=>{assert.equal(a[0].width,b[0].width+300);assert.equal(a[3].width,b[3].width);});
  await cellFocus();await page.keyboard.press('F5');
  await change('Control+ArrowRight',cellProps,(a,b)=>{assert.equal(a[0].width,b[0].width+300);assert.equal(a[3].width,b[3].width+300);});
  await cellFocus();await page.keyboard.press('F5');
  await change('Alt+ArrowRight',cellProps,(a,b)=>{assert.equal(a[0].width+a[1].width+a[2].width,b[0].width+b[1].width+b[2].width);assert.equal(a[0].width,b[0].width+300);});
  await cellFocus();await page.keyboard.press('Shift+F5');await page.keyboard.press('ArrowRight');await page.keyboard.press('m');assert.equal((await dims()).cellCount,5);await page.keyboard.press('Control+z');assert.equal((await dims()).cellCount,6);
  // Safari 한글 입력: compositionstart가 keydown보다 먼저 와 조합 중이어도 칸 블록 M(ㅡ)은 합치기다(H2, 10-25).
  await cellFocus();await page.keyboard.press('Shift+F5');await page.keyboard.press('ArrowRight');
  await frame.locator('textarea').first().evaluate(node=>{node.dispatchEvent(new CompositionEvent('compositionstart',{data:'',bubbles:true}));
    const e=new KeyboardEvent('keydown',{key:'ㅡ',code:'KeyM',isComposing:true,bubbles:true,cancelable:true,composed:true});Object.defineProperty(e,'keyCode',{get:()=>229});node.dispatchEvent(e);});
  assert.equal((await dims()).cellCount,5,'한글 조합이 먼저 시작돼도 칸 블록 M은 합치기');await page.keyboard.press('Control+z');assert.equal((await dims()).cellCount,6);
  await cellFocus();await page.keyboard.press('F5');await page.keyboard.press('s');await frame.locator('.modal-overlay .dialog-title').filter({hasText:'셀 나누기'}).waitFor();
  await frame.locator('.modal-overlay').last().locator('button').filter({hasText:/취소|닫기/}).last().click();await focus();
  // Shortcut handling must not leak into a settings input or IME composition.
  await cellFocus();await page.keyboard.press('F5');const protectedBefore=await cellProps();
  await run(()=>{const b=window.examShortcutBridge(),t=window.shortcutTable;b.wasm.setCellProperties(0,t.paraIdx,t.controlIdx,1,{cellProtect:true});});
  const protectedState=await cellProps();await page.keyboard.press('Alt+ArrowRight');assert.deepEqual(await cellProps(),protectedState);
  const protectedDimensions=await dims();await page.keyboard.press('Control+Backspace');assert.deepEqual(await dims(),protectedDimensions,'protected neighbors prevent row deletion');
  await run(()=>{const b=window.examShortcutBridge(),t=window.shortcutTable;b.wasm.setCellProperties(0,t.paraIdx,t.controlIdx,1,{cellProtect:false});});
  const imeBefore=await cellProps();await run(()=>{const b=window.examShortcutBridge(),v=b.editor.element.contentWindow;b.input.textarea.dispatchEvent(new v.KeyboardEvent('keydown',{key:'Process',code:'ArrowRight',ctrlKey:true,isComposing:true,keyCode:229,bubbles:true,cancelable:true}));});assert.deepEqual(await cellProps(),imeBefore);
  // H/W with a Korean IME must not leave its composing syllable in the cell.
  await run(()=>{const b=window.examShortcutBridge(),i=b.input,v=b.editor.element.contentWindow;
   i.textarea.dispatchEvent(new v.KeyboardEvent('keydown',{key:'Process',code:'KeyW',isComposing:true,keyCode:229,bubbles:true,cancelable:true}));
   i.textarea.dispatchEvent(new v.CompositionEvent('compositionstart',{bubbles:true}));
   i.textarea.value='ㅈ';i.textarea.dispatchEvent(new v.InputEvent('input',{bubbles:true,data:'ㅈ',inputType:'insertCompositionText',isComposing:true}));
   i.textarea.value='ㅈ';
   i.textarea.dispatchEvent(new v.CompositionEvent('compositionend',{bubbles:true,data:'ㅈ'}));
   i.textarea.value='ㅈ';i.textarea.dispatchEvent(new v.InputEvent('input',{bubbles:true,data:'ㅈ',inputType:'insertText'}));});
  assert.equal(await run(()=>window.examShortcutBridge().wasm.getTextInCell(0,window.shortcutTable.paraIdx,window.shortcutTable.controlIdx,0,0,0,100).includes('ㅈ')),false);
  // Save and reopen through the actual host file menu, retaining native sizes.
  await cellFocus();await page.keyboard.press('F5');await page.keyboard.press('Shift+ArrowRight');
  const persisted=(await cellProps()).map(p=>({width:p.width,height:p.height}));
  const exported=await run(()=>{const w=window.examShortcutBridge().wasm;return {hwp:[...w.exportHwp()],hwpx:[...w.exportHwpx()]};});
  for(const format of ['hwp','hwpx']){const file=path.join(out,name+'-shortcut-table.'+format);fs.writeFileSync(file,Buffer.from(exported[format]));await h.nativeOpen(page,file);await h.idle(page);
   await run(()=>{const c=window.examShortcutBridge().wasm.getPageControlLayout(0).controls.find(c=>c.type==='table');window.shortcutTable={paraIdx:c.paraIdx,controlIdx:c.controlIdx};});assert.deepEqual((await cellProps()).map(p=>({width:p.width,height:p.height})),persisted,format+' reopens real cell sizes');}
  await cellFocus();await page.keyboard.press('Shift+Escape');assert.equal(await run(()=>window.examShortcutBridge().input.cursor.isInCell()),false);
  await page.locator('#exam-name').fill('문서 이름');await page.locator('#exam-name').focus();await page.keyboard.press('Control+n');await page.keyboard.press('t');assert.equal(await frame.locator('.modal-overlay').count(),0);
  await focus();await page.keyboard.press('Control+n');await page.keyboard.press('Escape');assert.equal(await page.locator('#rhwp-exam-workspace').isVisible(),true);
  assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,name+'-shortcuts.png')});
 });
});
