// 카드에 친 직후(자동 저장 0.3초 전) 새로고침·창 닫기를 해도 입력이 남는다(M14, 10-21).
// 닫는 순간의 IndexedDB 쓰기는 커밋되지 않아(크롬·사파리 모두 0/5) localStorage에 바뀐 문항을 남겨 두고 다음에 열 때 이어 받는다.
const test=require('node:test'),assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
const stored=sheet=>sheet.evaluate(async()=>{const name=(await indexedDB.databases()).map(d=>d.name).find(n=>n.endsWith('5e-exampool-structure'));if(!name)return [];
 const db=await new Promise((res,rej)=>{const r=indexedDB.open(name);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
 const v=await new Promise((res,rej)=>{const r=db.transaction('state').objectStore('state').get('draft');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});db.close();return v?.questions?.map(q=>q.ask)||[];});
const openSheet=async page=>{await page.click('.app-switch-image [data-app-switch="exam"]');const sheet=await (await page.waitForSelector('#exampool-sheet-workspace iframe')).contentFrame();
 await sheet.waitForSelector('#side-new');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중');return sheet;};
for(const [name,engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) test(`${name}: typing right before reload is kept`,async t=>{
 await h.withServer(async origin=>{
  const browser=await engine.launch();t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);let sheet=await openSheet(page);
  await sheet.click('#side-new');await sheet.click('#new-dialog .nq-opt[data-step="form"][data-k="combo"]');await sheet.click('#new-dialog .nq-opt[data-step="struct"][data-k="experiment"]');await sheet.click('#new-dialog [data-nq="go"]');
  await sheet.waitForSelector('#card-view:not([hidden]) #cv-ask');
  // 새 문항 만들기(전체 변경)와 카드 입력(그 문항만 변경) 두 경우를 차례로.
  await sheet.fill('#cv-ask','첫 입력');await page.reload();await h.ready(page);sheet=await openSheet(page);
  await sheet.waitForFunction(()=>true);await sheet.waitForTimeout(800);assert.deepEqual(await stored(sheet),['첫 입력'],'new question and its text survive an immediate reload');
  // 10-23 보관함: 카드를 누르면 문항 보기 창, 카드 오른쪽 아래 「열기」로 바로 카드 화면.
  await sheet.locator('.lv-card:has-text("첫 입력") [data-open-card]').first().click();await sheet.waitForSelector('#card-view:not([hidden]) #cv-ask');
  await sheet.fill('#cv-ask','둘째 입력');await page.reload();await h.ready(page);sheet=await openSheet(page);await sheet.waitForTimeout(800);
  assert.deepEqual(await stored(sheet),['둘째 입력'],'a card edit right before reload survives');
  assert.deepEqual(errors,[]);
 });
});
