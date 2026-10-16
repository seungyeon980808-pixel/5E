const assert = require('node:assert/strict');
const fs = require('node:fs');const path = require('node:path');
const {chromium,webkit} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/exampool/verification');
const pool = '#exampool-workspace';
async function idle(page) {await page.waitForFunction(() => document.querySelector('#exampool-workspace')?.getAttribute('aria-busy') === 'false');}
async function action(page,name) {await page.locator(`${pool} [data-pool-action="${name}"]`).first().click();await idle(page);assert.notEqual(await page.locator('#pool-status').getAttribute('data-error'),'true',await page.locator('#pool-status').textContent());}
async function rows(page) {return page.evaluate(async () => (await import('/js/exampool-store.js?v=1013-exampool')).listQuestions());}
async function fill(page) {
  await page.locator('#pool-number').fill('7');await page.locator('#pool-passage').fill('검증용 지문\n둘째 줄');
  await page.locator('#pool-ask').fill('검증용 발문');await page.locator('#pool-bogi').fill('검증용 보기 A\n검증용 보기 B');
  for (let i=0;i<5;i++) await page.locator('#pool-choice-'+i).fill('검증용 선지 '+(i+1));
  await action(page,'save');
}
h.withServer(async origin => {
  fs.mkdirSync(evidence,{recursive:true});
  for (const [engineName,engine] of Object.entries({chromium,webkit}).filter(([name]) => !process.env.EXAM_ENGINE || name === process.env.EXAM_ENGINE)) {
    const browser = await engine.launch({headless:true});
    try {
      const context = await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
      const page = await context.newPage(), errors = [];page.on('pageerror',error => errors.push(error.message));
      await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
      const footer = await page.locator('.app-footer').boundingBox();
      await page.evaluate(()=>document.getElementById('exampool-open').click());await idle(page);await action(page,'new');assert.equal(await page.locator('#pool-number').inputValue(),'1');await fill(page);
      await page.locator('#pool-ask').focus();await page.locator('#pool-ask').fill('검증용 발문');
      await page.waitForFunction(() => document.querySelector('#pool-status').textContent.startsWith('저장됨'));
      assert.equal(await page.locator('#pool-ask').evaluate(el => el === document.activeElement),true,'autosave preserves typing focus');
      let [saved] = await rows(page);assert.equal(saved.choices.length,5);assert.equal(saved.bogi_items.length,2);
      const id = saved.id, choiceIds = saved.choices.map(row => row.id);
      await action(page,'new');assert.equal(await page.locator('#pool-number').inputValue(),'2');assert.equal(await page.locator('#pool-ask').inputValue(),'','new item does not copy the previous form');
      await page.locator(`[data-question-id="${id}"]`).click();await idle(page);
      await page.reload({waitUntil:'domcontentloaded'});await h.ready(page);await page.evaluate(()=>document.getElementById('exampool-open').click());await idle(page);
      assert.equal(await page.locator('#pool-ask').inputValue(),'검증용 발문');assert.deepEqual((await rows(page))[0].choices.map(row => row.id),choiceIds);
      // Selection saves pending input and does not reopen an obsolete revision.
      await page.locator('#pool-passage').fill('선택 전 수정');await page.locator(`[data-question-id="${id}"]`).click();await idle(page);
      assert.equal(await page.locator('#pool-passage').inputValue(),'선택 전 수정');
      const stateUrl = h.runtime(page).stateUrl;
      await page.evaluate(async url => {const {state} = await import(url);state.update(s => {s.objects = [{id:'test-line',type:'line',p1:{x:-15,y:-10},p2:{x:15,y:10},layerId:1,order:0,rotation:0,strokeWidth:.3,strokeLevel:0,lineMode:'solid',arrowHead:'none'}];});},stateUrl);
      await action(page,'capture');
      await page.locator(`${pool} [data-pool-action="handoff"]`).click();await idle(page);assert.equal(await page.locator('#pool-status').getAttribute('data-error'),'true');
      await action(page,'confirm');saved = (await rows(page))[0];const confirmedId = saved.asset.confirmed.id, confirmedPng = saved.asset.confirmed.png;
      await page.evaluate(async url => {const {state} = await import(url);state.update(s => {s.objects[0].p2.y = 18;});},stateUrl);
      await action(page,'capture');saved = (await rows(page))[0];assert.equal(saved.asset.confirmed.id,confirmedId);assert.equal(saved.asset.confirmed.png,confirmedPng);assert.notEqual(saved.asset.draft.id,confirmedId);
      assert.equal(await page.locator('#pool-previews figure').count(),2);
      for (const width of [1440,900,390]) {
        await page.setViewportSize({width,height:1000});
        assert.equal(await page.locator(pool).evaluate(el => el.scrollWidth > innerWidth),false,'no outer overflow at '+width);
        assert.equal(await page.locator('#pool-ask').isVisible(),true);
        await page.screenshot({path:path.join(evidence,engineName+'-'+width+'.png')});
      }
      await page.setViewportSize({width:1440,height:1000});assert.equal((await page.locator('.app-footer').boundingBox()).height,footer.height,'footer height preserved');
      const waitDownload = page.waitForEvent('download');await action(page,'export');const download = await waitDownload;
      const file = path.join(evidence,engineName+'.exampool');await download.saveAs(file);
      await action(page,'handoff');await h.idle(page);assert.equal(await page.locator(pool).isVisible(),false);
      const pictures = await h.pictures(page);assert.equal(pictures.length,1);assert.equal(pictures[0].figure.exampool.questionId,id);
      assert.equal(pictures[0].figure.exampool.confirmedRevisionId,confirmedId);assert.equal(pictures[0].figure.source.pages[0].objects[0].p2.y,10,'confirmed drawing only');
      const native = await page.evaluate(() => {
        const w = document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.wasm;
        return Array.from({length:w.getParagraphCount(0)},(_,i) => ({text:w.getTextRange(0,i,0,w.getParagraphLength(0,i)),alignment:w.getParaPropertiesAt(0,i)?.alignment}));
      });
      assert.equal(pictures[0].control.paraIdx,1,'picture stays between passage and ask');
      assert.equal(native[2].text,'검증용 발문');assert.equal(native[2].alignment,native[0].alignment,'picture centring does not leak into following text');
      // One native undo must remove the entire question; redo restores its source.
      await page.evaluate(() => document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().performUndo());
      assert.equal((await h.pictures(page)).length,0);
      await page.evaluate(() => document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().performRedo());
      await h.idle(page);assert.equal((await h.pictures(page)).length,1);
      for (const format of ['hwp','hwpx']) {
        const wait = page.waitForEvent('download');await h.action(page,'export-'+format);const result = await wait;const target = path.join(evidence,engineName+'.'+format);await result.saveAs(target);assert.ok(fs.statSync(target).size>1000);
        await page.locator('#exam-hwp-file').setInputFiles(target);await h.idle(page);
        assert.equal((await h.pictures(page))[0].figure.exampool.confirmedRevisionId,confirmedId,'editable confirmed source survives '+format+' reload');
      }
      await page.screenshot({path:path.join(evidence,engineName+'-handoff.png')});
      // Imported file opens in a clean browser, with independent local storage.
      const fresh = await browser.newContext({viewport:{width:1440,height:1000}}), next = await fresh.newPage();
      await h.navigate(next,origin+'/?mode=pro&mobile=0');await h.ready(next);await next.evaluate(()=>document.getElementById('exampool-open').click());await idle(next);
      await next.locator('#pool-file').setInputFiles(file);await idle(next);assert.notEqual(await next.locator('#pool-status').getAttribute('data-error'),'true',await next.locator('#pool-status').textContent());
      assert.equal(await next.locator('#pool-ask').inputValue(),'검증용 발문');const reopened = (await rows(next))[0];assert.equal(reopened.id,id);assert.equal(reopened.asset.confirmed.png,confirmedPng);
      const oldPages = await h.drawing(next,h.runtime(next).stateUrl);await action(next,'edit');const newPages = await h.drawing(next,h.runtime(next).stateUrl);
      assert.equal(newPages.pages.length,oldPages.pages.length+1,'source opens a new tab without replacing another drawing');assert.equal(newPages.objects[0].p2.y,18);
      await next.evaluate(()=>document.getElementById('exampool-open').click());await idle(next);await action(next,'capture');assert.equal((await rows(next))[0].asset.confirmed.id,confirmedId);
      await next.locator('#pool-photo').setInputFiles('tests/fixtures/rights-clear-smoke.png');await idle(next);
      assert.equal(await next.locator('#pool-status').getAttribute('data-error'),'false');const photo = (await rows(next))[0];
      assert.equal(photo.asset.draft.source,null);assert.equal(photo.asset.confirmed.id,confirmedId,'photo replacement leaves the confirmed drawing intact');
      assert.equal(await next.locator('[data-pool-action="edit"]').isDisabled(),true);
      const storeChecks = await next.evaluate(async () => {
        const {saveQuestion,importQuestions,listQuestions} = await import('/js/exampool-store.js?v=1013-exampool');
        const {newQuestion} = await import('/js/exampool-model.js?v=1013-exampool');
        const second = (await listQuestions())[1];const revised = {...structuredClone(second),ask:'동시 저장 검증'};
        await saveQuestion(revised);let conflict = false;try {await saveQuestion(second);}catch {conflict = true;}
        const addition = newQuestion('99');let atomic = false;try {await importQuestions([addition,second]);}catch {atomic = true;}
        const after = await listQuestions();return {conflict,atomic,missing:!after.some(item => item.id === addition.id),retained:after[1].ask};
      });
      assert.deepEqual(storeChecks,{conflict:true,atomic:true,missing:true,retained:'동시 저장 검증'});
      await fresh.close();assert.deepEqual(errors,[]);await context.close();
      console.log(engineName+': persistence, source reopening, immutable handoff, one-step undo, HWP/HWPX export and responsive views passed');
    } finally {await browser.close();}
  }
}).catch(error => {console.error(error);process.exitCode = 1;});
