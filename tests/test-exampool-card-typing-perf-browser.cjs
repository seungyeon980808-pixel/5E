// 5E_ExamPool 문항 카드 입력 반응: 그림이 든 문항이 많아도(12개, 약 15MB) 카드 칸에 치는 글자가 바로 보이고 빠지지 않는다.
// 예전에는 키마다 문항 전체 검사(그림 data URL 정규식·JSON 전체 문자열)와 저장 전 전체 읽기 때문에 키 하나에 160ms(CPU 4배 느리게 1.7초)가 걸렸다.
const assert = require('node:assert/strict');
const fs = require('node:fs');const path = require('node:path');
const {chromium,webkit} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const {timingCheck} = require('./helpers/performance-reference.cjs');
const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/exampool/card-typing-perf');
const png = 'data:image/png;base64,'+fs.readFileSync(path.resolve(__dirname,'../assets/exam-library/images/e1_2010_11_02.png')).toString('base64');
const N = 12, TEXT = '가나다라마바사아자차카타파하'.repeat(3).slice(0,30);

async function openPool(page,origin){
  await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
  await page.locator('#exam-pool-open').click();const sheet=await (await page.waitForSelector('#exampool-sheet-workspace iframe')).contentFrame();
  await sheet.waitForSelector('#side-new');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중',null,{timeout:60000});
  return sheet;
}
async function newCard(sheet,first){
  await sheet.click(first?'#side-new':'#card-view .cv-qtab.add');
  await sheet.click('#new-dialog .nq-opt[data-step="form"][data-k="combo"]');await sheet.locator('#new-dialog .nq-opt[data-step="struct"]').first().click();await sheet.click('#new-dialog [data-nq="go"]');
}

h.withServer(async origin => {
  fs.mkdirSync(evidence,{recursive:true});const rows=[];
  for (const [engineName,engine] of Object.entries({chromium,webkit}).filter(([name]) => !process.env.EXAM_ENGINE || name === process.env.EXAM_ENGINE)) {
    const browser = await engine.launch({headless:true});
    try {
      const page = await (await browser.newContext({viewport:{width:1440,height:900}})).newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
      let sheet=await openPool(page,origin);
      await newCard(sheet,true);await sheet.waitForSelector('#card-view:not([hidden]) .cv-writer');
      for(let i=1;i<N;i++){await newCard(sheet,false);await sheet.waitForFunction(n=>document.querySelectorAll('#card-view .cv-qtab:not(.add)').length===n,i+1);}
      await sheet.waitForFunction(()=>/저장됨/.test(document.querySelector('#status').textContent),null,{timeout:20000});
      // 문항마다 큰 그림 하나(실제 기출 그림 948KB)를 저장소에 넣고 다시 연다.
      const stored=await sheet.evaluate(async png=>{const db=await new Promise((r,j)=>{const o=indexedDB.open('5e-exampool-structure');o.onsuccess=()=>r(o.result);o.onerror=()=>j(o.error);});
        const d=await new Promise(r=>{const g=db.transaction('state').objectStore('state').get('draft');g.onsuccess=()=>r(g.result);});let n=0;
        for(const q of d.questions){const f=q.blocks.find(b=>b.kind==='figure');if(f){f.figure={name:'기출 그림.png',data:png};n++;}}
        await new Promise((r,j)=>{const t=db.transaction('state','readwrite');t.objectStore('state').put(d,'draft');t.oncomplete=r;t.onerror=()=>j(t.error);});db.close();return n;},png);
      assert.equal(stored,N,'every question got a figure');
      await page.reload();sheet=await openPool(page,origin);
      if(await sheet.locator('.side').isHidden())await sheet.click('#toggle-nav');
      await sheet.click('.side [data-nav="library"]');await sheet.locator('#library-view [data-open-card]').first().click();await sheet.waitForSelector('#card-view:not([hidden]) .cv-writer');
      await sheet.click('#card-view [data-cvright="paper"]');await sheet.waitForSelector('.cv-hwp-layer:not([hidden])');await sheet.waitForTimeout(3000);
      await sheet.evaluate(()=>{const M=window.__typing={lat:[]};let at=0;
        document.addEventListener('beforeinput',()=>{at=performance.now();},true);
        document.addEventListener('input',()=>{if(!at)return;const k=at;at=0;requestAnimationFrame(()=>requestAnimationFrame(()=>M.lat.push(performance.now()-k)));},true);});
      await sheet.click('#cv-passage');for(const ch of TEXT)await page.keyboard.type(ch,{delay:60});await sheet.waitForTimeout(400);
      assert.equal(await sheet.inputValue('#cv-passage'),TEXT,'no typed letter is lost');
      const lat=(await sheet.evaluate(()=>window.__typing.lat)).sort((a,b)=>a-b),p95=lat[Math.floor(lat.length*.95)],max=lat[lat.length-1];
      rows.push({engine:engineName,n:lat.length,p50:+lat[Math.floor(lat.length/2)].toFixed(1),p95:+p95.toFixed(1),max:+max.toFixed(1)});
      timingCheck(p95<=120,`${engineName}: key-to-frame p95 ${p95.toFixed(1)}ms > 120ms with ${N} figure questions`);
      // 입력이 저장되고 다시 열어도 남는다.
      await sheet.waitForFunction(()=>/저장됨/.test(document.querySelector('#status').textContent),null,{timeout:20000});
      await page.reload();sheet=await openPool(page,origin);
      if(await sheet.locator('.side').isHidden())await sheet.click('#toggle-nav');
      await sheet.click('.side [data-nav="library"]');await sheet.locator('#library-view [data-open-card]').first().click();await sheet.waitForSelector('#card-view:not([hidden]) .cv-writer');
      assert.equal(await sheet.inputValue('#cv-passage'),TEXT,'the typed passage is saved');
      assert.deepEqual(errors,[],'no page errors');
      console.log(`${engineName}: card typing with ${N} figure questions verified`,JSON.stringify(rows.at(-1)));
    } finally { await browser.close(); }
  }
  fs.writeFileSync(path.join(evidence,'card-typing-latency.json'),JSON.stringify(rows,null,2));
}).catch(error=>{console.error(error);process.exitCode=1;});
