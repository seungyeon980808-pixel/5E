// 5E_exam 검사 공용: 11-12 이후 문항 카드의 왼쪽 라이브러리 칸은 기본으로 닫혀 있다(왼쪽 메뉴 「라이브러리」로 켠다·기억함).
async function openLibrary(sheet){
  if(await sheet.evaluate(()=>{const n=document.querySelector('#card-view .cv-left');return !!n&&!n.hidden&&n.getClientRects().length>0;}))return;
  if(await sheet.locator('.shell-body.nav-off').count()||await sheet.locator('.side').isHidden())await sheet.click('#toggle-nav');
  await sheet.waitForSelector('.side [data-nav="lib"]:not([disabled])');
  await sheet.click('.side [data-nav="lib"]');
  await sheet.waitForSelector('#card-view .cv-left:not([hidden]) [data-cvscope]');
}
module.exports={openLibrary};
