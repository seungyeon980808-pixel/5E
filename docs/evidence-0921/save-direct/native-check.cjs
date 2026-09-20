const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1400,height:950}});
 await page.addInitScript(()=>{
   window.saveRequests=[];
   window.showSaveFilePicker=options=>{
     window.saveRequests.push({options,active:navigator.userActivation.isActive,promptCount:[...document.querySelectorAll('.modal-title')].filter(el=>el.textContent.includes('프로젝트 저장')).length});
     return Promise.reject(new DOMException('Cancelled','AbortError'));
   };
 });
 await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:8767/preview/',{waitUntil:'networkidle'});
 if(await page.locator('.tut-banner-no').count())await page.locator('.tut-banner-no').click();
 await page.locator('#file-menu-btn').click();await page.locator('#project-save').click();
 const [request]=await page.evaluate(()=>window.saveRequests);
 assert.equal(request.active,true);assert.equal(request.promptCount,0);
 assert.match(request.options.suggestedName,/^\d{8}_\d{4}\.5e$/);
 assert.equal(await page.locator('.modal-title').filter({hasText:'저장 실패'}).count(),0);
 await page.screenshot({path:__dirname+'/native-cancel.png'});
 console.log(JSON.stringify({result:'PASS',...request}));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
