// AI 작업 끝남 말풍선: 다른 창(설치형 안내·라이브러리 등)이 떠 있는 동안은 숨었다가 메인 화면으로 돌아오면 다시 보이고,
// AI 작업 창을 열면 닫힌다. 첫 변환 뒤 저절로 뜨는 설치형 안내가 말풍선을 지워 버리던 것(2026-10-19 밤 점검, 1100px 창).
const assert=require('node:assert/strict');const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const h=require('./helpers/rhwp-exam.cjs');
h.withServer(async origin=>{for(const[name,engine]of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)){
 const browser=await engine.launch(),page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await h.navigate(page,origin+'/?mode=pro&mobile=0&exam=0');await h.ready(page);
  // AI 작업대(ai-panel.js)가 불러오는 것과 같은 주소 = 같은 모듈.
  const version=require('node:fs').readFileSync(require('node:path').join(__dirname,'../js/ai-panel.js'),'utf8').match(/workbench-loading\.js(\?v=[^'"]+)/)[1];
  const url=origin+'/js/loading/workbench-loading.js'+version;
  await page.evaluate(async url=>{const {showDoneNotice}=await import(url);window.__opened=0;showDoneNotice({title:'그림 변환이 끝났어요',detail:'0:08 걸림',onOpen:()=>{window.__opened++;}});},url);
  const notice=page.locator('.ai-done-notice');await notice.waitFor();
  // 설치형 안내처럼 저절로 뜨는 창
  await page.evaluate(()=>{const o=document.createElement('div');o.className='modal-overlay';o.id='qa-guide';o.innerHTML='<section role="dialog" style="position:fixed;inset:30%;background:#222">안내<button type="button">나중에</button></section>';document.body.append(o);});
  await page.waitForFunction(()=>document.querySelector('.ai-done-notice')?.hidden===true,null,{timeout:3000});
  assert.equal(await notice.count(),1,'다른 창이 떠 있는 동안 말풍선은 지워지지 않고 숨는다');
  await page.evaluate(()=>document.querySelector('#qa-guide').remove());
  await notice.waitFor({state:'visible',timeout:3000});
  const box=await notice.boundingBox(),button=await page.locator('#ai-image-install-open').boundingBox();
  assert.ok(box.y+box.height<=button.y+1,'다시 보일 때도 AI 버튼 위에 있다');
  await notice.getByRole('button',{name:'결과 보기',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.__opened),1);assert.equal(await notice.count(),0);
  // AI 작업 창이 보이면 닫힌다
  await page.evaluate(async url=>{const {showDoneNotice}=await import(url);showDoneNotice({title:'두 번째'});},url);await notice.waitFor();
  await page.evaluate(()=>window.dispatchEvent(new Event('5e:lite-ai-open')));await page.locator('#ai-image-panel').waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('.ai-done-notice'),null,{timeout:3000});
  assert.deepEqual(errors,[]);console.log(`PASS ${name} AI done notice survives auto-opened dialogs`);
 }finally{await browser.close();}
}}).catch(error=>{console.error(error);process.exitCode=1;});
