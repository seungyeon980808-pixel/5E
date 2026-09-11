// Run against an isolated local editor; never targets the hosted trial.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.EDITOR_QA_URL || 'http://127.0.0.1:19424';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(url)) throw Error('QA requires an isolated localhost server');
const out = process.env.EDITOR_QA_OUT || path.join(os.tmpdir(), '5e-editor-usability-qa');
const results = [];
const nativePlatform = process.platform === 'win32' ? 'Win32' : process.platform === 'darwin' ? 'MacIntel' : null;
async function state(page) {
  return page.evaluate(async () => {
    const s = (await import('./js/state.js?v=1.4.0')).state.get();
    return JSON.parse(JSON.stringify({objects:s.objects,selectedIds:s.selectedIds,groups:s.groups,pages:s.pages,activePageId:s.activePageId,undo:s.undoStack.length,redo:s.redoStack.length,tool:s.activeTool}));
  });
}
async function key(page, platform, letter, shift = false) {
  if (platform === nativePlatform) return page.keyboard.press(`${platform === 'MacIntel' ? 'Meta' : 'Control'}+${shift ? 'Shift+' : ''}${letter}`);
  // The other OS is DOM emulation; only nativePlatform exercises real OS bindings.
  return page.evaluate(({letter,shift,platform}) => window.dispatchEvent(new KeyboardEvent('keydown', {key:letter,code:`Key${letter.toUpperCase()}`,ctrlKey:platform==='Win32',metaKey:platform==='MacIntel',shiftKey:shift,bubbles:true,cancelable:true})),{letter,shift,platform});
}
async function clipboard(page, type, platform) {
  if (platform === nativePlatform) return page.keyboard.press(`${platform === 'MacIntel' ? 'Meta' : 'Control'}+${{copy:'c',cut:'x',paste:'v'}[type]}`);
  return page.evaluate(type => {
    const data = new DataTransfer();
    if (type === 'paste') for (const [name,value] of window.qaClipboard || []) data.setData(name,value);
    document.dispatchEvent(new ClipboardEvent(type,{clipboardData:data,bubbles:true,cancelable:true}));
    if (type !== 'paste') window.qaClipboard = [...data.types].map(name=>[name,data.getData(name)]);
  },type);
}
async function run(browser, platform) {
  const context = await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
  await context.addInitScript(platform => {
    Object.defineProperty(navigator,'platform',{get:()=>platform});
    Object.defineProperty(navigator,'userAgentData',{get:()=>undefined});
  },platform);
  await context.tracing.start({screenshots:true,snapshots:true});
  const page = await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const captureStatus = async (name, text, accessibleLabel = text) => {
    await page.setViewportSize({width:375,height:1000});
    await page.waitForFunction(text => document.getElementById('project-save-status')?.textContent === text,text);
    const bounds=await page.locator('#project-save-status').evaluate(el=>{
      const r=el.getBoundingClientRect();return {left:r.left,right:r.right,scroll:el.scrollWidth,client:el.clientWidth,label:el.getAttribute('aria-label')};
    });
    assert.ok(bounds.left>=0 && bounds.right<=375 && bounds.scroll<=bounds.client,JSON.stringify({name,bounds}));
    assert.equal(bounds.label,accessibleLabel,`${name} retains its full accessible status`);
    await page.screenshot({path:path.join(out,`${platform}-status-${name}-375.png`),fullPage:false});
    await page.setViewportSize({width:1440,height:1000});
  };
  try {
    await page.goto(url);
    await page.getByRole('button',{name:'건너뛰기',exact:true}).click();
    await page.locator('#project-save-status').getByText('파일 저장 전').waitFor();
    await captureStatus('new','파일 저장 전','새 프로젝트 · 파일 저장 전');
    const box=await page.locator('#canvas').boundingBox();
    const x=box.x+box.width*.35,y=box.y+box.height*.35;
    await page.locator('[data-tool="RECT"]').click();
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+100,y+80);await page.mouse.up();
    assert.equal((await state(page)).objects.length,1,'draw a rectangle through UI');
    await captureStatus('dirty','미저장 변경');
    const beforeResize=(await state(page)).objects[0];
    const handle=await page.locator('#handles [data-handle="se"]').last().boundingBox();
    await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
    await page.mouse.move(handle.x+handle.width/2+35,handle.y+handle.height/2+25);await page.mouse.up();
    assert.ok((await state(page)).objects[0].w>beforeResize.w,'resize with visible handle');
    await page.keyboard.down('Space');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    const body=await page.locator(`#scene [data-id="${beforeResize.id}"]`).first().boundingBox();
    await page.mouse.move(body.x+body.width/2,body.y+body.height/2);await page.mouse.down();
    await page.mouse.move(body.x+body.width/2+35,body.y+body.height/2+20);await page.mouse.up();
    await page.keyboard.up('Space');
    assert.notEqual((await state(page)).objects[0].x,beforeResize.x,'move works after lost Space keyup');
    await clipboard(page,'copy',platform);
    await page.mouse.move(x+220,y+130);
    await clipboard(page,'paste',platform);
    await page.waitForFunction(async()=> (await import('./js/state.js?v=1.4.0')).state.get().objects.length===2);
    await clipboard(page,'cut',platform);
    assert.equal((await state(page)).objects.length,1,'cut removes selected object');
    await key(page,platform,'z');assert.equal((await state(page)).objects.length,2,'undo cut');
    await key(page,platform,platform==='Win32'?'y':'z',platform==='MacIntel');
    assert.equal((await state(page)).objects.length,1,'platform redo');
    await page.keyboard.press('s');
    await clipboard(page,'paste',platform);assert.equal((await state(page)).objects.length,2,'paste cut object');
    assert.equal((await state(page)).tool,'V','paste returns to selection tool');
    // Copy-group-paste must create a separate group and preserve two member IDs.
    await key(page,platform,'a');await page.keyboard.press('g');
    await clipboard(page,'copy',platform);await page.mouse.move(x+300,y+160);await clipboard(page,'paste',platform);
    const grouped=await state(page);
    assert.equal(grouped.groups.length,2,JSON.stringify({platform,grouped,focus:await page.evaluate(()=>document.activeElement.outerHTML.slice(0,250))}));assert.equal(new Set(grouped.objects.map(o=>o.id)).size,4);
    assert.notEqual(grouped.objects[0].groupId,grouped.objects[2].groupId);
    // New native clipboard data replaces the earlier internal object copy.
    await page.evaluate(async()=>navigator.clipboard.writeText('external text'));
    if(platform!==nativePlatform) await page.evaluate(()=>window.qaClipboard=[['text/plain','external text']]);
    await clipboard(page,'paste',platform);assert.equal((await state(page)).objects.length,4);
    const first=(await state(page)).activePageId;
    await page.locator('#page-add').click();
    await page.locator(`.page-tab[data-id="${first}"]`).click();
    await key(page,platform,'z');assert.equal((await state(page)).objects.length,2,'page history preserved');
    await page.keyboard.press('e');assert.equal((await state(page)).tool,'CUT','bare E activates cut outside a modal');
    await key(page,platform,'e');assert.equal((await state(page)).tool,'DELAYED_CUT','platform E activates delayed cut outside a modal');
    await page.keyboard.press('v');assert.equal((await state(page)).tool,'V');
    await page.locator(`.page-tab[data-id="${first}"]`).click({button:'right'});
    await page.locator('.page-ctx-menu').getByRole('button',{name:'삭제',exact:true}).click();
    const tool=(await state(page)).tool;
    await key(page,platform,'e');assert.equal((await state(page)).tool,tool,'modal shields canvas tools');
    await page.keyboard.press('e');assert.equal((await state(page)).tool,tool,'modal shields bare tool shortcuts');
    await page.locator('.modal-overlay:not([hidden])').getByRole('button',{name:'삭제',exact:true}).click();
    assert.equal((await state(page)).pages.length,1);
    await key(page,platform,'z');assert.equal((await state(page)).pages.length,2,'undo deleted page');
    await page.locator(`.page-tab[data-id="${first}"]`).click();assert.equal((await state(page)).objects.length,2);
    await page.locator('#file-menu-btn').focus();await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'project-save');
    await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.id),'project-open');
    await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'file-menu-btn');
    // Native open shortcut is tested with a real file chooser on the host.
    if(platform===nativePlatform) {
      const chooser=page.waitForEvent('filechooser');await key(page,platform,'o');await chooser;
      results.push({platform,host:process.platform,native:platform===nativePlatform,scenario:'native open chooser',pass:true});
    }
    await captureStatus('recovery','복구됨 · 파일 미저장','자동 복구용 저장됨 · 파일 저장 필요');
    // A download fallback is browser-specific; do not invoke an unattended native save dialog.
    await page.evaluate(()=>{window.showSaveFilePicker=undefined});
    const download=page.waitForEvent('download');await key(page,platform,'s');
    const file=await download;assert.match(file.suggestedFilename(),/\.5e$/);
    await file.saveAs(path.join(out,`${platform}.5e`));
    await captureStatus('download','다운로드 요청됨','파일 다운로드 요청됨 · 저장 위치 확인');
    const saved=JSON.parse(await fs.readFile(path.join(out,`${platform}.5e`),'utf8'));
    assert.equal(saved.pages.length,2);assert.equal(saved.pages[0].objects.length,2);
    // Load downloaded document through the same input path and confirm round-trip.
    const chooser=page.waitForEvent('filechooser');await page.locator('#file-menu-btn').click();await page.locator('#project-open').click();
    await (await chooser).setFiles(path.join(out,`${platform}.5e`));
    await page.locator('.modal-overlay:not([hidden])').getByRole('button',{name:'열기',exact:true}).click();
    assert.equal((await state(page)).objects.length,2);
    await captureStatus('file','파일 저장 완료');
    // A real bitmap clipboard must win after copying canvas objects.
    await key(page,platform,'a');await clipboard(page,'copy',platform);
    await page.evaluate(async()=>{
      const canvas=document.createElement('canvas');canvas.width=4;canvas.height=4;
      canvas.getContext('2d').fillRect(0,0,4,4);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
    });
    if(platform===nativePlatform) await clipboard(page,'paste',platform);
    else await page.evaluate(async()=>{
      const data=new DataTransfer();const item=(await navigator.clipboard.read())[0];
      data.items.add(new File([await item.getType('image/png')],'clipboard.png',{type:'image/png'}));
      document.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
    });
    await page.waitForFunction(async()=> (await import('./js/state.js?v=1.4.0')).state.get().objects.some(o=>o.type==='image'));
    assert.equal((await state(page)).objects.length,3,'one image, no stale object duplicates');
    await key(page,platform,'z');assert.equal((await state(page)).objects.length,2);
    for(const width of [1440,768,375]) {
      await page.setViewportSize({width,height:1000});
      await page.screenshot({path:path.join(out,`${platform}-${width}.png`),fullPage:true});
    }
    assert.deepEqual(errors,[],'no uncaught browser errors');
    results.push({platform,host:process.platform,native:platform===nativePlatform,scenario:'draw, copy/cut/paste, groups, redo, page history/deletion, modal, menu, save/load',pass:true});
  } finally {
    await context.tracing.stop({path:path.join(out,`${platform}-trace.zip`)});
    await context.close();
  }
}
(async()=>{
  await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({headless:false});
  try{for(const platform of ['MacIntel','Win32'])await run(browser,platform);}
  finally{await browser.close();await fs.writeFile(path.join(out,'browser-results.json'),JSON.stringify(results,null,2));}
  console.log(JSON.stringify(results,null,2));
})().catch(error=>{console.error(error);process.exitCode=1});
