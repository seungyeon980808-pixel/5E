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
  await page.locator('.app-switch-image [data-app-switch="exam"]').evaluate(b=>b.click());const sheet=await (await page.waitForSelector('#exampool-sheet-workspace iframe')).contentFrame();
  await sheet.waitForSelector('.side [data-pool="drafting"]');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중',null,{timeout:60000});
  return sheet;
}
async function newCard(sheet,first){
  // 11-15: 카드 위 번호 탭(＋)은 없어졌다 — 왼쪽 메뉴 「작업 중」 목록의 「새 문항」으로 만든다.
  if(!first&&await sheet.locator('.side').isHidden())await sheet.click('#toggle-nav');
  await sheet.evaluate(()=>document.querySelector('.side [data-pool="drafting"]').click());await sheet.waitForSelector('#library-view:not([hidden]) [data-lv-new]');await sheet.evaluate(()=>document.querySelector('[data-lv-new]').click()); // 화면 전환 움직임 중에도 누르도록 직접 클릭
  // 새 문항 창은 지난 선택을 기억한다 — 이미 눌린 선택지를 다시 누르면 풀리므로, 눌려 있지 않을 때만 누른다. 자료 구조는 그림이 있는 「큰 자료 1개」로 고정.
  for(const [step,k] of [['form','combo'],['struct','big']]){const o=sheet.locator(`#new-dialog .nq-opt[data-step="${step}"][data-k="${k}"]`);if(await o.getAttribute('aria-pressed')!=='true')await o.click();}
  await sheet.click('#new-dialog [data-nq="go"]');
}

h.withServer(async origin => {
  fs.mkdirSync(evidence,{recursive:true});const rows=[];
  for (const [engineName,engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE).filter(([name]) => !process.env.EXAM_ENGINE || name === process.env.EXAM_ENGINE)) {
    const browser = await engine.launch({headless:true});
    try {
      const page = await (await browser.newContext({viewport:{width:1440,height:900}})).newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
      let sheet=await openPool(page,origin);
      // 11-15 이후 카드 위 번호 탭(＋)이 없고 문항을 하나씩 만들어 저장하면 저장소에 한 문항만 남던 경로라, 그림이 든 12문항을 엑셀·JSON 가져오기로 한 번에 넣고 저장된 뒤 다시 연다.
      const {questionFromShape}=await import('../assets/exampool/sheet/templates.js');
      const qs=[];for(let i=0;i<N;i++){const q=questionFromShape({form:'combo',struct:'big'},String(i+1));q.name='문항 '+(i+1);q.blocks.filter(b=>b.kind==='figure').forEach(b=>b.figure={name:'기출 그림.png',data:png});qs.push(q);}
      assert.equal(qs.filter(q=>q.blocks.some(b=>b.figure)).length,N,'every question got a figure');
      await sheet.setInputFiles('#excel-file',{name:'perf.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'5e-question-sheet-v2',questions:qs,documents:[]}))});
      await sheet.waitForSelector('#import-dialog[open]');await sheet.check('input[name="import-mode"][value="update"]');await sheet.click('#apply-import');
      await sheet.waitForFunction(n=>document.querySelector('.side [data-pool="drafting"] b')?.textContent===String(n),N);
      await sheet.waitForFunction(()=>/저장됨/.test(document.querySelector('#status').textContent),null,{timeout:60000});
      await page.reload();sheet=await openPool(page,origin);
      if(await sheet.locator('.shell-body.nav-off').count()||await sheet.locator('.side').isHidden())await sheet.click('#toggle-nav');
      await sheet.click('.side [data-nav="library"][data-pool="drafting"]');await sheet.locator('#library-view [data-open-card]').first().click();await sheet.waitForSelector('#card-view:not([hidden]) .cv-writer');
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
      if(await sheet.locator('.shell-body.nav-off').count()||await sheet.locator('.side').isHidden())await sheet.click('#toggle-nav');
      await sheet.click('.side [data-nav="library"][data-pool="drafting"]');await sheet.locator('#library-view [data-open-card]').first().click();await sheet.waitForSelector('#card-view:not([hidden]) .cv-writer');
      assert.equal(await sheet.inputValue('#cv-passage'),TEXT,'the typed passage is saved');
      assert.deepEqual(errors,[],'no page errors');
      console.log(`${engineName}: card typing with ${N} figure questions verified`,JSON.stringify(rows.at(-1)));
    } finally { await browser.close(); }
  }
  fs.writeFileSync(path.join(evidence,'card-typing-latency.json'),JSON.stringify(rows,null,2));
}).catch(error=>{console.error(error);process.exitCode=1;});
