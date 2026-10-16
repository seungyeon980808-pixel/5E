const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const h=require('./helpers/rhwp-exam.cjs');
const evidence=path.resolve('_work/exampool/references');
const idle=page=>page.waitForFunction(()=>document.querySelector('#exampool-workspace')?.getAttribute('aria-busy')==='false');
const rows=page=>page.evaluate(async()=> (await import('/js/exampool-store.js?v=1013-exampool')).listQuestions());
// Two original pages exercise real PDF extraction, navigation and fresh rendering.
function pdf() {
  const texts=['REFERENCE SAMPLE ONE','SECOND PAGE KEYWORD'];
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [4 0 R 6 0 R] /Count 2 >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  texts.forEach((text,i)=>{const content=`BT /F1 20 Tf 25 300 Td (${text}) Tj ET\n`;objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`,`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`);});
  let value='%PDF-1.4\n';const offsets=[0];objects.forEach((body,i)=>{offsets.push(Buffer.byteLength(value));value+=`${i+1} 0 obj\n${body}\nendobj\n`;});const xref=Buffer.byteLength(value);
  value+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(value);
}
async function importResource(page,file) {
  await page.locator('#pool-resource-file').setInputFiles(file);
  await page.waitForFunction(()=>document.querySelector('#pool-reference-status').textContent.includes('개 자료를 저장했습니다.') || document.querySelector('#pool-reference-status').dataset.error==='true');
  assert.notEqual(await page.locator('#pool-reference-status').getAttribute('data-error'),'true',await page.locator('#pool-reference-status').textContent());
}
h.withServer(async origin=>{
  fs.mkdirSync(evidence,{recursive:true});
  for(const [name,engine] of Object.entries({chromium,webkit})) {
    const browser=await engine.launch({headless:true});
    try {
      const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
      const footer=await page.locator('.app-footer').boundingBox();
      // Simulate the user's pre-redesign data in version 1, without deleting it.
      const legacy=await page.evaluate(async()=>{
        const {newQuestion}=await import('/js/exampool-model.js?v=1013-exampool');const item=newQuestion('7');item.ask='기존 발문 보존';item.passage='기존 지문 보존';delete item.intent;delete item.standard;delete item.standard_code;delete item.references;
        await new Promise((resolve,reject)=>{const request=indexedDB.open('5e-exampool',1);request.onupgradeneeded=()=>request.result.createObjectStore('questions',{keyPath:'id'});request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('questions','readwrite');tx.objectStore('questions').put(item);tx.oncomplete=()=>{db.close();resolve();};};});return item;
      });
      await page.locator('#exampool-open').click();await idle(page);await page.locator('[data-standard-code]').first().waitFor();
      assert.equal(await page.locator('#pool-ask').inputValue(),legacy.ask);assert.equal((await rows(page))[0].id,legacy.id);
      assert.equal(await page.locator('.pool-main').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
      await page.locator('#pool-subject').selectOption('통합과학1');await page.locator('#pool-standard-search').fill('[10통과1-01-01]');
      await page.locator('[data-standard-code]').first().click();const code=await page.locator('#pool-standard-detail h3').textContent();assert.equal(code,'[10통과1-01-01]');
      const source=JSON.parse(fs.readFileSync('assets/exampool/standards.json','utf8')),standard=source.standards.find(s=>s.code===code);
      assert.equal(await page.locator('.pool-standard-text').textContent(),standard.text);assert.ok((await page.locator('#pool-standard-detail').textContent()).includes(standard.explain));
      await page.locator('#pool-standard-detail>button').click();await idle(page);assert.equal((await rows(page))[0].standard_code,code);
      await page.locator('#pool-intent').fill('인쇄 제외 검증');await page.locator('[data-pool-action="save"]').click();await idle(page);
      await page.locator('#pool-standard-search').fill('결과없는검증문자');assert.equal(await page.locator('[data-standard-code]').count(),0);await page.locator('#pool-standard-search').fill('');
      await page.locator('#pool-tab-textbooks').click();await importResource(page,{name:'검증용 교과서.pdf',mimeType:'application/pdf',buffer:pdf()});
      await page.locator('#pool-source-page-view img').waitFor();assert.equal(await page.locator('#pool-source-total').textContent(),' / 2');assert.equal(await page.locator('#pool-page-prev').isDisabled(),true);
      await page.locator('#pool-resource-search').fill('KEYWORD');await page.locator('[data-resource-page="2"]').click();
      await page.waitForFunction(()=>document.querySelector('#pool-reference-status').textContent==='교과서 · 2쪽 원문');
      assert.equal(await page.locator('#pool-page-next').isDisabled(),true);assert.match(await page.locator('#pool-source-text').textContent(),/SECOND PAGE KEYWORD/);
      await page.locator('#pool-source-zoom').selectOption('150');assert.equal(await page.locator('#pool-source-page-view img').evaluate(el=>el.style.width),'150%');
      await page.locator('#pool-evidence-field').selectOption('choice-1');await page.locator('#pool-evidence-quote').fill('SECOND PAGE KEYWORD');await page.locator('#pool-reference-attach').click();await idle(page);
      const ref=(await rows(page))[0].references[0];assert.equal(ref.page,2);assert.equal(ref.field,'choice-1');assert.equal(ref.quote,'SECOND PAGE KEYWORD');
      await page.locator('#pool-tab-materials').click();await importResource(page,{name:'참고 메모.txt',mimeType:'text/plain',buffer:Buffer.from('검증용 참고 메모\n다른 문장','utf8')});
      assert.match(await page.locator('#pool-source-page-view').textContent(),/검증용 참고 메모/);
      await importResource(page,{name:'참고 그림.png',mimeType:'image/png',buffer:fs.readFileSync('tests/fixtures/rights-clear-smoke.png')});await page.locator('#pool-source-page-view img').waitFor();
      await page.locator('[data-linked-reference-id]').click();await page.waitForFunction(()=>document.querySelector('#pool-evidence-quote').value==='SECOND PAGE KEYWORD');
      await page.locator('#pool-preview-toggle').click();assert.equal((await page.locator('#pool-print-preview').textContent()).includes('인쇄 제외 검증'),false);assert.match(await page.locator('#pool-print-preview').textContent(),/기존 발문 보존/);
      await page.locator('#pool-preview-toggle').click();
      for(const width of [1440,900,390]) {
        await page.setViewportSize({width,height:1000});
        if(width===390)await page.locator('[data-pool-view="references"]').click();
        assert.equal(await page.locator('#exampool-workspace').evaluate(el=>el.scrollWidth>innerWidth),false);
        await page.screenshot({path:path.join(evidence,`${name}-${width}-sources.png`)});
        if(width===390){await page.locator('[data-pool-view="editor"]').click();assert.equal(await page.locator('#pool-ask').isVisible(),true);await page.screenshot({path:path.join(evidence,`${name}-${width}-editor.png`)});}
      }
      await page.setViewportSize({width:1440,height:1000});assert.equal((await page.locator('.app-footer').boundingBox()).height,footer.height);
      const downloadWait=page.waitForEvent('download');await page.locator('[data-pool-action="export"]').click();await idle(page);const download=await downloadWait,target=path.join(evidence,name+'.exampool');await download.saveAs(target);
      const data=JSON.parse(fs.readFileSync(target,'utf8'));assert.equal(data.resources.length,3);assert.equal(data.items[0].standard_code,code);
      const fresh=await browser.newContext({viewport:{width:1440,height:1000}}),next=await fresh.newPage();await h.navigate(next,origin+'/?mode=pro&mobile=0');await h.ready(next);await next.locator('#exampool-open').click();await idle(next);
      await next.locator('#pool-file').setInputFiles(target);await idle(next);assert.equal(await next.locator('#pool-status').getAttribute('data-error'),'false');
      assert.equal(await next.locator('#pool-ask').inputValue(),legacy.ask);assert.equal(await next.locator('#pool-intent').inputValue(),'인쇄 제외 검증');assert.equal((await rows(next))[0].standard_code,code);
      await next.locator('[data-linked-reference-id]').click();await next.waitForFunction(()=>document.querySelector('#pool-evidence-quote').value==='SECOND PAGE KEYWORD');assert.equal(await next.locator('#pool-source-page').inputValue(),'2');assert.ok(await next.locator('#pool-source-page-view img').evaluate(el=>el.naturalWidth>0));
      await next.locator('#pool-linked-references .pool-linked-reference button').last().click();await idle(next);assert.equal((await rows(next))[0].references.length,0);
      await next.locator('#pool-clear-standard').click();await idle(next);assert.equal((await rows(next))[0].standard,null);
      await fresh.close();await context.close();assert.deepEqual(errors,[]);console.log(`${name}: legacy migration, actual standards, PDF/text/image viewer, search, page evidence, portable files and responsive light workspace passed`);
    } finally {await browser.close();}
  }
}).catch(error=>{console.error(error);process.exitCode=1;});
