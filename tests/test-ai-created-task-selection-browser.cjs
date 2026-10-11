const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium,webkit} = require('playwright');
const h = require('./helpers/rhwp-exam.cjs');
const panel = '#ai-image-panel:not([hidden])';
const rows = `${panel} [data-ai-tab-list] .ai-task-tab[data-tab-id]`;
const current = `${rows}.is-on`;
async function selected(page,count,previous,expected) {
  await h.waitForState(page,({panel,count,previous,expected})=>{
    const root=document.querySelector(panel),active=root?.querySelector('[data-ai-tab-list] .ai-task-tab.is-on');
    const selected=[...root?.querySelectorAll('[data-ai-tab-list] .is-batch-selected') || []];
    return root?.querySelector('[data-ai-selection-count]')?.textContent==='1개 선택'
      && root.querySelectorAll('[data-ai-tab-list] .ai-task-tab[data-tab-id]').length===count
      && selected.length===1 && selected[0]===active
      && (!previous || `${active.dataset.aiWorkspaceLink}:${active.dataset.tabId}`!==previous)
      && (!expected || `${active.dataset.aiWorkspaceLink}:${active.dataset.tabId}`===expected);
  },{panel,count,previous,expected},{timeout:30000}).catch(async error=>{
    console.error('selection state',await page.locator(panel).evaluate(root=>({workflow:root.dataset.aiWorkflow,count:root.querySelector('[data-ai-selection-count]')?.textContent,rows:[...root.querySelectorAll('[data-ai-tab-list] .ai-task-tab')].map(row=>({owner:row.dataset.aiWorkspaceLink,id:row.dataset.tabId,active:row.classList.contains('is-on'),selected:row.classList.contains('is-batch-selected')})),alerts:[...document.querySelectorAll('[role="alert"]')].map(el=>el.textContent)})));throw error;
  });
  return page.locator(current).evaluate(row=>`${row.dataset.aiWorkspaceLink}:${row.dataset.tabId}`);
}
async function selectionSet(page,workflow,count,keys) {
  await h.waitForState(page,({panel,workflow,count,keys})=>{
    const root=document.querySelector(panel);
    const selected=[...root?.querySelectorAll('[data-ai-tab-list] .ai-task-tab[data-tab-id].is-batch-selected') || []]
      .map(row=>`${row.dataset.aiWorkspaceLink}:${row.dataset.tabId}`).sort();
    return root?.dataset.aiWorkflow===workflow
      && root.querySelectorAll('[data-ai-tab-list] .ai-task-tab[data-tab-id]').length===count
      && root.querySelector('[data-ai-selection-count]')?.textContent===`${keys.length}개 선택`
      && JSON.stringify(selected)===JSON.stringify([...keys].sort());
  },{panel,workflow,count,keys},{timeout:30000});
}
function task(page,key) {
  const separator=key.indexOf(':');
  return page.locator(`${rows}[data-ai-workspace-link="${key.slice(0,separator)}"][data-tab-id="${key.slice(separator+1)}"] .ai-task-tab-select`);
}
async function original(page) {
  const image=page.locator(`${panel} .is-ai-active-source .ai-preview-stage > img`).first();
  await image.waitFor({state:'visible'});
  await image.evaluate(image=>image.decode());
  assert.equal(await page.locator(panel).getAttribute('data-ai-layout'),'side-by-side');
  return image.getAttribute('src');
}
async function menu(page,action,{keyboard=false}={}) {
  await page.locator(`${current} .ai-task-tab-select`).click({button:'right'});
  const button=page.locator(`.ai-task-context-menu:not([hidden]) [data-task-action="${action}"]`);
  if(keyboard){await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');}
  else await button.click();
}
h.withServer(async origin=>{
  for(const[name,engine]of Object.entries({chromium,webkit})){
    const browser=await engine.launch({headless:true});
    try{for(const surface of['','preview/']){
      const context=await browser.newContext({viewport:{width:1440,height:950}}),page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('dialog',dialog=>dialog.accept());
      await page.addInitScript(()=>{localStorage.setItem('5e.tutorial.bannerSeen','true');localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true');});
      await h.navigate(page,new URL(surface,origin).href+'?mode=pro&mobile=0&exam=0');
      await page.locator('#ai-image-install-open').click();
      await page.locator(`${panel} [data-ai-source-file]`).setInputFiles(path.join(__dirname,'fixtures/rights-clear-smoke.png'));
      await h.waitForState(page,panel=>document.querySelector(panel)?.querySelectorAll('[data-ai-tab-list] .ai-task-tab[data-tab-id]').length===1,panel);
      await page.locator(`${rows} .ai-task-tab-select`).last().click();
      const source=await original(page),initial=await selected(page,1);
      await menu(page,'duplicate',{keyboard:true});
      const duplicate=await selected(page,2,initial);assert.equal(await original(page),source,'duplicate shows the same actual source');
      const box=await page.locator(current).boundingBox(),list=await page.locator(`${panel} [data-ai-tab-list]`).boundingBox();
      assert.ok(box.y>=list.y && box.y+box.height<=list.y+list.height,'new current task is visible in the sidebar');
      await menu(page,'send');
      await page.locator('.ai-task-context-menu:not([hidden]) [data-task-action="graph"]').click();
      const graph=await selected(page,1,duplicate);assert.equal(await original(page),source,'cross-workflow send shows the transferred source');
      assert.equal(await page.locator(`${panel} [data-ai-workflow="graph"]`).getAttribute('aria-pressed'),'true');
      await menu(page,'duplicate');const graphCopy=await selected(page,2,graph);
      await task(page,graph).click({modifiers:['Meta']});
      await selectionSet(page,'graph',2,[graph,graphCopy]);
      await menu(page,'delete');await page.getByRole('button',{name:'취소',exact:true}).click();
      await selectionSet(page,'graph',2,[graph,graphCopy]);
      assert.equal(await page.locator(current).evaluate(row=>`${row.dataset.aiWorkspaceLink}:${row.dataset.tabId}`),graphCopy,'cancel preserves the active task');
      await page.locator(`${panel} [data-ai-workflow="image"]`).click();await selected(page,2,null,duplicate);
      await page.locator(`${panel} [data-ai-workflow="graph"]`).click();await selectionSet(page,'graph',2,[graph,graphCopy]);
      await menu(page,'delete');await page.getByRole('button',{name:'작업 삭제',exact:true}).click();
      await selected(page,1,null,graph);
      await page.locator(`${panel} [data-ai-close]`).click();await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('#ai-image-install-open').click();await selected(page,1,null,graph);assert.equal(await original(page),source);
      await page.locator(`${panel} [data-ai-workflow="image"]`).click();await selected(page,2,null,duplicate);assert.equal(await original(page),source);
      await task(page,initial).click({modifiers:['Meta']});await selectionSet(page,'image',2,[initial,duplicate]);
      await page.locator(`${panel} [data-ai-workflow="graph"]`).click();await selected(page,1,null,graph);assert.equal(await original(page),source);
      await page.locator(`${panel} [data-ai-workflow="image"]`).click();await selectionSet(page,'image',2,[initial,duplicate]);
      await task(page,initial).click({modifiers:['Meta']});await selected(page,2,null,duplicate);
      await task(page,duplicate).focus();await page.keyboard.press('Delete');
      await page.getByRole('button',{name:'작업 삭제',exact:true}).click();
      await selected(page,1,null,initial);assert.equal(await original(page),source);
      await page.locator(`${panel} [data-ai-workflow="graph"]`).click();await selected(page,1,null,graph);assert.equal(await original(page),source);
      const evidence=path.join(__dirname,'../_work/overnight-qa',`omo-nqa017-${name}${surface?'-preview':''}`);
      await page.screenshot({path:`${evidence}-desktop.png`});
      await page.setViewportSize({width:390,height:844});
      await original(page);await page.screenshot({path:`${evidence}-narrow.png`});
      await page.setViewportSize({width:1440,height:950});
      await menu(page,'delete');await page.getByRole('button',{name:'작업 삭제',exact:true}).click();
      await selectionSet(page,'graph',0,[]);
      await page.locator(`${panel} [data-ai-workflow="image"]`).click();await selected(page,1,null,initial);assert.equal(await original(page),source);
      await page.locator(`${panel} [data-ai-workflow="graph"]`).click();await selectionSet(page,'graph',0,[]);
      assert.deepEqual(errors,[]);console.log(`${name}${surface?'-preview':''}: duplicate/send source, reload and both workflow selections, Meta multiselect, cancel/confirmed/keyboard deletion, and empty workflow PASS; no AI requests`);
      await context.close();
    }}finally{await browser.close();}
  }
}).catch(error=>{console.error(error);process.exitCode=1;});
