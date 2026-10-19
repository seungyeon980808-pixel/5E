// 엑셀식 시트 입력에서 글자가 사라지지 않는다.
// - 편집 중이 아닌 칸에 keydown 없이 글자가 바로 들어오면(받아쓰기·이모지·일부 입력기) WebKit이 첫 글자를 버렸다.
// - 카드에서 나간 뒤 한글 미리보기 닫기가 늦게 끝나며 「미리보기」 단추로 초점을 옮겨, 치던 칸의 입력이 끊겼다.
const test=require('node:test'),assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
for(const [name,engine] of Object.entries({chromium,webkit})) test(`${name}: typing into the sheet keeps every character`,async t=>{
 await h.withServer(async origin=>{
  const browser=await engine.launch();t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
  await page.click('#exam-pool-open');const sheet=await (await page.waitForSelector('#exampool-sheet-workspace iframe')).contentFrame();
  await sheet.waitForSelector('#side-new');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중');
  // 카드(한글 미리보기 열림)에서 문항을 만든 뒤, 시험지 → 시트로 바로 넘어가 친다.
  await sheet.click('#side-new');await sheet.click('#new-dialog .nq-opt[data-step="form"][data-k="combo"]');await sheet.click('#new-dialog .nq-opt[data-step="struct"][data-k="experiment"]');await sheet.click('#new-dialog [data-nq="go"]');
  await sheet.waitForSelector('#card-view:not([hidden]) #cv-ask');await sheet.fill('#cv-ask','앞 문항');
  await sheet.click('#brand-home');await sheet.waitForSelector('#library-view:not([hidden])');
  if(await sheet.locator('.side').isHidden())await sheet.click('#toggle-nav');
  await sheet.click('.side [data-nav="new-exam"]');await sheet.waitForSelector('#examd-view:not([hidden]) #exam-from-library');
  await sheet.selectOption('#exam-from-library',await sheet.locator('#exam-from-library option').nth(1).getAttribute('value'));
  await sheet.click('[data-exam-act="sheet"]');await sheet.waitForSelector('.workspace:not([hidden]) #registry');
  const typed='실험 결과로 옳은 것만을 <보기>에서 있는 대로 고른 것은?';
  await sheet.locator('#rows tr:has(th.field-label:text-is("발문")) td').first().click();await page.keyboard.type(typed);
  await sheet.waitForFunction(()=>document.querySelector('#preview-dialog')?.getAttribute('aria-busy')!=='true');await sheet.waitForTimeout(500);
  assert.notEqual(await sheet.evaluate(()=>document.activeElement?.id),'preview','closing the HWP preview never pulls focus out of the sheet');
  await sheet.locator('#rows tr:has(th.field-label:text-is("지문")) td').first().click();
  assert.equal(await sheet.locator('#rows tr:has(th.field-label:text-is("발문")) textarea').first().inputValue(),typed,'the first character and every later one land in the cell');
  assert.deepEqual(errors,[]);
 });
});
