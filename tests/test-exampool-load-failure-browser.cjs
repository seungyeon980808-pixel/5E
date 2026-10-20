// 5E_ExamPool 저장된 입력을 열지 못할 때(예: 24 MB를 넘는 저장) 그 이유가 상태 막대와 문항 보관함에 계속 남는다.
// 예전에는 빨간 안내가 6초 뒤 지워져 「보관함이 비어 있습니다」만 남아, 저장이 없어진 것처럼 보였다(저장 자체는 보존됨).
const assert = require('node:assert/strict');
const {chromium,webkit} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');

async function openPool(page,origin){
  await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
  await page.locator('.app-switch-image [data-app-switch="exam"]').click();const sheet=await (await page.waitForSelector('#exampool-sheet-workspace iframe')).contentFrame();
  await sheet.waitForSelector('#side-new');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중',null,{timeout:60000});
  return sheet;
}

h.withServer(async origin => {
  for (const [engineName,engine] of Object.entries({chromium,webkit}).filter(([name]) => !process.env.EXAM_ENGINE || name === process.env.EXAM_ENGINE)) {
    const browser = await engine.launch({headless:true});
    try {
      const page = await (await browser.newContext({viewport:{width:1440,height:900}})).newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
      let sheet=await openPool(page,origin);
      await sheet.click('#side-new');
      await sheet.click('#new-dialog .nq-opt[data-step="form"][data-k="combo"]');await sheet.locator('#new-dialog .nq-opt[data-step="struct"]').first().click();await sheet.click('#new-dialog [data-nq="go"]');
      await sheet.waitForFunction(()=>/저장됨/.test(document.querySelector('#status').textContent),null,{timeout:20000});
      // 저장소에 열 수 없는 자료(검사를 통과하지 못하는 큰 그림)를 직접 넣어 「열지 못함」 상태를 만든다.
      const stored=await sheet.evaluate(async()=>{const db=await new Promise((r,j)=>{const o=indexedDB.open('5e-exampool-structure');o.onsuccess=()=>r(o.result);o.onerror=()=>j(o.error);});
        const d=await new Promise(r=>{const g=db.transaction('state').objectStore('state').get('draft');g.onsuccess=()=>r(g.result);});
        const f=d.questions[0].blocks.find(b=>b.kind==='figure');f.figure={name:'큰 그림.png',data:'data:image/png;base64,'+'A'.repeat(25*1024*1024)};
        await new Promise((r,j)=>{const t=db.transaction('state','readwrite');t.objectStore('state').put(d,'draft');t.oncomplete=r;t.onerror=()=>j(t.error);});db.close();return d.questions.length;});
      assert.equal(stored,1);
      await page.reload();sheet=await openPool(page,origin);
      if(await sheet.locator('.side').isHidden())await sheet.click('#toggle-nav');
      await sheet.click('.side [data-nav="library"]');
      await sheet.waitForTimeout(7000);
      const status=await sheet.locator('#status').textContent();
      assert.match(status,/저장된 입력을 열지 못했습니다/,`${engineName}: the load failure stays in the status bar after 6 s`);
      assert.equal(await sheet.locator('#status').getAttribute('data-error'),'true');
      assert.match(await sheet.locator('#library-view .pv-empty').textContent(),/저장된 입력을 열지 못했습니다. 기존 저장은 보존했습니다./,`${engineName}: the empty library explains why instead of "보관함이 비어 있습니다"`);
      // 저장은 그대로 남아 있다(덮어쓰지 않음).
      const kept=await sheet.evaluate(async()=>{const db=await new Promise((r,j)=>{const o=indexedDB.open('5e-exampool-structure');o.onsuccess=()=>r(o.result);o.onerror=()=>j(o.error);});
        const d=await new Promise(r=>{const g=db.transaction('state').objectStore('state').get('draft');g.onsuccess=()=>r(g.result);});db.close();return d.questions.length;});
      assert.equal(kept,1,`${engineName}: the stored draft is preserved`);
      assert.deepEqual(errors,[],'no page errors');
      console.log(`${engineName}: ExamPool load failure message stays and the stored draft is preserved`);
    } finally { await browser.close(); }
  }
}).catch(error=>{console.error(error);process.exitCode=1;});
