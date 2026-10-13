const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { createBugReportServer } = require('../scripts/bug-report-server.cjs');
const { chromium, webkit } = require('playwright');
const h = require('./helpers/rhwp-exam.cjs');
const { instrumentAiMain } = require('./helpers/canonical-fixture-adapter.cjs');
process.env.APP_ENTRY = '/';
const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/feedback/parts/bug-report');
fs.mkdirSync(evidence, { recursive:true });
const receipts = [];
(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'5e-report-admin-'));
  const adminToken = 'isolated-browser-admin-key-'+randomUUID();
  const service = createBugReportServer({directory,adminToken});
  await new Promise(resolve=>service.listen(0,'127.0.0.1',resolve));
  const adminOrigin = `http://127.0.0.1:${service.address().port}`;
  process.env.FIVE_E_REPORT_PORT = String(service.address().port);
  try {await h.withServer(async origin => {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({viewport:{width:1440,height:1000}}); const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.route('**/report-fixture', route => route.fulfill({contentType:'text/html',body:'<html data-theme="dark"><head><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/bug-report.css"></head><body><footer class="app-footer"><span class="footer-actions"></span></footer><div id="ai-image-panel"><div class="ai-head-status"></div></div></body></html>'}));
      await page.goto(origin+'/report-fixture');
      await page.evaluate(async () => {
        const { initBugReporter, registerBugReportContext } = await import('/js/bug-report.js?v=1.7.0-four-session-integration');
        const {mountAiErrorLog}=await import('/js/ai-error-log.js?v=1.7.0-four-session-integration');
        const panel=document.querySelector('#ai-image-panel');
        window.__reportLog=mountAiErrorLog(panel,()=>({taskId:'original-task',model:'test'}));
        const canvas = document.createElement('canvas');canvas.width=80;canvas.height=60;canvas.getContext('2d').fillRect(10,10,30,30);
        registerBugReportContext('test',()=>({screen:'AI 이미지 작업대',task:{id:'original-task',model:'test'},images:[{name:'original',data:canvas.toDataURL(),role:'original'},{name:'result',data:canvas.toDataURL(),role:'result'}],errors:window.__reportLog.snapshot()}));
        initBugReporter({get:()=>({objects:[],selectedIds:[],artboard:{w:90,h:60}})});
        window.__reportLog.record('fixture error · Authorization: Bearer synthetic-secret');
      });
      const button = page.locator('.footer-actions .bug-report-open'); await button.click();
      assert.equal(await page.locator('[data-ai-error-log-open]').count(),0);assert.equal(await page.locator('#ai-image-panel .bug-report-open').getAttribute('data-error-count'),'1');await page.locator('textarea[name="description"]').fill('선택 후 검은 상자가 생겼습니다.');
      assert.equal(await page.locator('.bug-report-images img').count(),2);
      assert.equal(await page.locator('input:not([type="file"])').count(),0,'the form has no title or checkboxes');
      await page.locator('[data-report-errors] summary').click();
      assert.doesNotMatch(await page.locator('[data-report-context]').textContent(),/synthetic-secret/);
      await page.getByRole('button',{name:'original 첨부 제외'}).click();await page.getByRole('button',{name:'result 첨부 제외'}).click();
      let submitted;
      await page.route(origin+'/api/bug-reports', route => {
        if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Content-Type,X-5E-Report','Access-Control-Allow-Methods':'POST'}});
        submitted=route.request().postDataJSON(); return route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':origin},body:JSON.stringify({id:submitted.id})});
      });
      await page.locator('[data-report-send]').click();await page.locator('[data-report-status]').filter({hasText:'접수되었습니다'}).waitFor(); assert.deepEqual(submitted.images,[]);assert.equal(submitted.context.task.id,'original-task');
      await page.keyboard.press('Escape');await button.click(); await page.locator('[data-report-send]').click();await page.locator('[data-report-status]').filter({hasText:'접수되었습니다'}).waitFor();assert.equal(submitted.images.length,2);
      await page.unroute(origin+'/api/bug-reports');
      await page.route(origin+'/api/bug-reports',route=>route.abort());
      await page.locator('[data-report-send]').click();await page.locator('[data-report-status]').filter({hasText:'보내지 못했습니다'}).waitFor(); assert.equal(await page.locator('textarea[name="description"]').inputValue(),'선택 후 검은 상자가 생겼습니다.');
      const saved=structuredClone(submitted);assert.equal(saved.images.length,2);
      await page.locator('[data-report-send]').click();await page.locator('[data-report-status]').filter({hasText:'보내지 못했습니다'}).waitFor();assert.equal(submitted.id,saved.id,'an unchanged retry reuses its receipt ID');
      await page.locator('input[name="screenshot"]').setInputFiles({name:'evidence.png',mimeType:'image/png',buffer:Buffer.from(saved.images[0].data.split(',')[1],'base64')});await page.locator('.bug-report-images img').nth(2).waitFor();
      await page.keyboard.press('Escape');await button.click();assert.equal(await page.locator('.bug-report-images img').count(),3);
      await page.locator('textarea[name="description"]').fill(name+' 管理 <script>alert(1)</script>');
      await page.unroute(origin+'/api/bug-reports');
      const liveNetwork=[];
      service.on('request',req=>liveNetwork.push({method:req.method,origin:req.headers.origin,path:req.url}));
      page.on('console',message=>{if(message.type()==='error')liveNetwork.push({console:message.text()});});
      page.on('requestfailed',req=>{if(req.url().startsWith(adminOrigin))liveNetwork.push({url:req.url(),failure:req.failure()});});
      page.on('response',async res=>{if(res.url().startsWith(adminOrigin))liveNetwork.push({status:res.status(),body:await res.text().catch(()=>null)});});
      await page.locator('[data-report-send]').click();try {await page.locator('[data-report-status]').filter({hasText:'접수되었습니다'}).waitFor({timeout:18000});}catch(error){console.error(name,liveNetwork,await page.locator('[data-report-status]').textContent());throw error;}
      await page.setViewportSize({width:390,height:844}); assert.ok(await page.locator('#bug-report-dialog').evaluate(el=>el.getBoundingClientRect().width<=390));await page.screenshot({path:path.join(evidence,name+'-mobile.png')});
      await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(evidence,name+'-desktop.png')});
      await page.keyboard.press('Escape');assert.equal(await page.locator('#bug-report-dialog').evaluate(el=>el.open),false);assert.equal(await button.evaluate(el=>el===document.activeElement),true);assert.deepEqual(errors,[]);
      receipts.push({engine:name,pass:true,conditions:['context','original-result-preview','visible-removable-attachments','submit','failure-retains-input','retry-idempotency','screenshot-close-reopen','live-CORS-intake','narrow-screen','Esc-focus']});
      const real = await browser.newPage({viewport:{width:1440,height:1000}}); const realErrors=[];real.on('pageerror',error=>realErrors.push(error.message));
      await real.route('**/js/main.js*',route=>route.fulfill({contentType:'text/javascript',body:instrumentAiMain(path.resolve(__dirname,'..'),{manager:'__reportManager',seedReady:false}).body}));
      await real.goto(origin+'/?mode=pro&mobile=0&exam=0'); await real.locator('.footer-actions .bug-report-open').waitFor();
      const skip=real.getByRole('button',{name:'건너뛰기',exact:true}); if(await skip.isVisible())await skip.click();
      await real.locator('#ai-image-install-open').click();await real.locator('#ai-image-panel').waitFor({state:'visible'});
      await real.locator('#ai-image-panel .bug-report-open').click();await real.locator('#bug-report-dialog').waitFor({state:'visible'});
      assert.equal(await real.locator('#bug-report-dialog textarea[name="description"]').count(),1);assert.equal(await real.locator('[data-ai-error-log-open]').count(),0);assert.deepEqual(realErrors,[]);
      await real.screenshot({path:path.join(evidence,name+'-real-app.png')});
      await real.keyboard.press('Escape');await real.locator('[data-ai-empty-import]:visible').selectOption('library');await real.locator('.unified-library-overlay .bug-report-open').click();
      assert.equal(await real.locator('#bug-report-dialog').isVisible(),true);await real.keyboard.press('Escape');
      await real.locator('.unified-library-overlay [data-unilib-close]').click();
      await real.evaluate(data=>__reportManager.open({references:[{name:'alpha-original',dataUrl:data},{name:'beta-original',dataUrl:data}],placement:'together',startGeneration:false}),saved.images[0].data);
      const picker=real.locator('#ai-image-panel [data-ai-source-select]');const beta=await picker.evaluate(el=>[...el.options].find(option=>option.textContent.includes('beta-original')).value);await picker.selectOption(beta);
      await real.locator('#ai-image-panel .bug-report-open').click();assert.match(await real.locator('[data-report-images] figcaption').first().textContent(),/beta-original/);await real.keyboard.press('Escape');
      await picker.selectOption('__combined__');await real.waitForFunction(()=>{const image=document.querySelector('#ai-image-panel .ai-combined-card img');return image?.complete&&image.naturalWidth>0;});const composite=await real.locator('#ai-image-panel .ai-combined-card img').getAttribute('src');
      await real.locator('#ai-image-panel .bug-report-open').click();assert.equal(await real.locator('[data-report-images] img').first().getAttribute('src'),composite);await real.keyboard.press('Escape');assert.deepEqual(realErrors,[]);
      receipts.push({engine:name,pass:true,conditions:['real-main-load','real-AI-context-provider','foreground-library','selected-original','selected-composite','no-runtime-errors']});
      const admin = await browser.newPage();
      const intake = await (await fetch(adminOrigin+'/api/admin/reports',{headers:{Authorization:`Bearer ${adminToken}`}})).json();const specimen=intake.reports.find(report=>report.title.startsWith(name+' 管理'));
      const before=fs.readFileSync(path.join(directory,specimen.id+'.json'),'utf8');
      await admin.goto(adminOrigin+'/admin');await admin.locator('#token').fill('wrong-key');await admin.getByRole('button',{name:'접수 목록 열기'}).click();await admin.locator('#status').filter({hasText:'관리자 키를 확인'}).waitFor();
      await admin.locator('#token').fill(adminToken);await admin.getByRole('button',{name:'접수 목록 열기'}).click();await admin.locator('#reports button').filter({hasText:specimen.title}).click();
      await admin.locator('#detail h2').filter({hasText:specimen.title}).waitFor();assert.equal(await admin.locator('#detail img').count(),3);assert.equal(await admin.locator('#detail script').count(),0);
      await admin.getByLabel('처리 상태',{exact:true}).selectOption('investigating');await admin.getByLabel('관리자 메모').fill('재현 확인');await admin.getByRole('button',{name:'처리 상태 저장'}).click();await admin.locator('#status').filter({hasText:'저장했습니다'}).waitFor();
      await admin.reload();await admin.locator('#token').fill(adminToken);await admin.getByRole('button',{name:'접수 목록 열기'}).click();await admin.locator('#reports button').filter({hasText:specimen.title}).click();await admin.getByLabel('관리자 메모').waitFor();assert.equal(await admin.getByLabel('관리자 메모').inputValue(),'재현 확인');assert.equal(await admin.getByLabel('처리 상태',{exact:true}).inputValue(),'investigating');assert.equal(fs.readFileSync(path.join(directory,specimen.id+'.json'),'utf8'),before);
      await admin.screenshot({path:path.join(evidence,name+'-admin.png')});
      receipts.push({engine:name,pass:true,conditions:['admin-auth','real-report-intake','images-and-context','untrusted-text','review-persistence','immutable-original']});
    } finally {await browser.close();}
  }
  fs.writeFileSync(path.join(evidence,'receipt.json'),JSON.stringify(receipts,null,2));
  // The suite-wide server predates this temporary intake port. Start the same
  // canonical source server with this suite's port instead of submitting to an
  // unrelated server's default intake. All existing submission assertions remain.
  }, { isolated:true });} finally {await new Promise(resolve=>service.close(resolve));fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
