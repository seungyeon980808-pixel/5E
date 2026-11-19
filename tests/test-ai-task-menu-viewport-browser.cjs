const assert = require('node:assert/strict');
const {chromium,webkit} = require('playwright');
const h = require('./helpers/rhwp-exam.cjs');
const menu = '.ai-task-context-menu:not([hidden])';
async function insideViewport(page) {
  const box = await page.locator(menu).boundingBox(), viewport = page.viewportSize();
  assert.ok(box.x >= 7 && box.y >= 7, 'menu stays inside the top and left margins');
  assert.ok(box.x + box.width <= viewport.width - 7, 'menu stays inside the right margin');
  assert.ok(box.y + box.height <= viewport.height - 7, 'expanded menu stays inside the bottom margin');
}
h.withServer(async origin => {
  for (const [name,engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch({headless:true});
    try { for (const surface of ['']) { // 1.7.1(3dfbd711): /preview/ 사본 삭제 — 정식 루트만
      const context = await browser.newContext(), page = await context.newPage(), errors = [];
      page.on('pageerror',error=>errors.push(error.message));
      await page.addInitScript(()=>{
        localStorage.setItem('5e.tutorial.bannerSeen','true');
        localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true');
      });
      await h.navigate(page,new URL(surface,origin).href+'?mode=pro&mobile=0&exam=0');
      await page.evaluate(async()=>{
        const {createTaskContextMenu} = await import('/js/ai-task-context-menu.js');
        const opener = document.createElement('button');opener.className='ai-task-tab-select';
        opener.id='menu-viewport-opener';opener.textContent='검수';
        Object.assign(opener.style,{position:'fixed',width:'32px',height:'32px',zIndex:'10100'});
        document.body.append(opener);
        window.__menuActions=[];
        const owner={workspaceId:'viewport-owner',taskId:'task-viewport'};
        const controller=createTaskContextMenu({
          copy:target=>window.__menuActions.push(['copy',target]),
          duplicate:target=>window.__menuActions.push(['duplicate',target]),
          remove:target=>window.__menuActions.push(['delete',target]),
          send:(target,kind)=>window.__menuActions.push([kind,target]),
          onError:error=>{throw error;}
        });
        opener.addEventListener('contextmenu',event=>controller.open(event,owner));
      });
      for (const viewport of [{width:1440,height:950},{width:390,height:844},{width:480,height:220}]) {
        await page.setViewportSize(viewport);
        for (const corner of ['bottom-right','bottom-left','top-right','top-left']) {
          await page.locator('#menu-viewport-opener').evaluate((button,corner)=>{
            Object.assign(button.style,{left:corner.endsWith('left')?'8px':'auto',right:corner.endsWith('right')?'8px':'auto',
              top:corner.startsWith('top')?'8px':'auto',bottom:corner.startsWith('bottom')?'8px':'auto'});
          },corner);
          await page.locator('#menu-viewport-opener').click({button:'right'});
          await insideViewport(page);
          // 11-11(552279a9): 하위 메뉴 없이 반대쪽 작업으로 바로 보낸다 — 이미지 작업대에서는 「그래프 복원으로 보내기」 하나.
          assert.equal((await page.locator(`${menu} [data-task-action="send"]`).textContent()).trim(),'그래프 복원으로 보내기');
          assert.equal(await page.locator(`${menu} [data-task-submenu]`).isVisible(),false);
          await page.keyboard.press('End'); await page.keyboard.press('ArrowUp');
          assert.equal(await page.evaluate(()=>document.activeElement.dataset.taskAction),'send','keyboard reaches the direct send item');
          await page.keyboard.press('Enter');
          assert.equal(await page.locator(menu).count(),0);
          const action=await page.evaluate(()=>window.__menuActions.at(-1));
          assert.deepEqual(action,['graph',{workspaceId:'viewport-owner',taskId:'task-viewport'}]);
        }
      }
      await page.setViewportSize({width:1440,height:950});
      await page.locator('#menu-viewport-opener').evaluate(button=>Object.assign(button.style,{top:'auto',bottom:'8px'}));
      await page.locator('#menu-viewport-opener').click({button:'right'});
      await page.locator(`${menu} [data-task-action="send"]`).click();
      assert.deepEqual(await page.evaluate(()=>window.__menuActions.at(-1)),['graph',{workspaceId:'viewport-owner',taskId:'task-viewport'}],'pointer send goes straight to the other workflow');
      await page.locator('#menu-viewport-opener').click({button:'right'});
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#menu-viewport-opener').evaluate(button=>button===document.activeElement),true);
      await page.locator('#menu-viewport-opener').click({button:'right'});
      await page.setViewportSize({width:1280,height:800});
      await page.locator(menu).waitFor({state:'hidden'});
      assert.equal(await page.locator(menu).count(),0,'resizing dismisses the transient menu');
      assert.deepEqual(errors,[]);
      console.log(`${name}${surface?'-preview':''}: all viewport edges, direct send (no submenu), pointer/keyboard send, owner and focus PASS`);
      await context.close();
    }} finally {await browser.close();}
  }
}).catch(error=>{console.error(error);process.exitCode=1;});
