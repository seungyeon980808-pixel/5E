const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {fixture, snapshot} = require('./fixtures/ai-image-label-workflow.cjs');

for (const engine of ['chromium', 'webkit']) test(`${engine}: preview AI edits preserve same-origin stable settings and task metadata`, {timeout:90000}, async t => {
  process.env.TASK2_ENGINE = engine;
  const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/feedback/parts/preview-storage', engine);
  fs.mkdirSync(evidence, {recursive:true});
  const {page, errors} = await fixture(t,1,evidence,{selectedPartial:true,beforeNavigate:async page => {
    await page.route(url => url.pathname === '/preview/', route => route.fulfill({
      contentType:'text/html',body:fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8'),
    }));
    await page.addInitScript(() => {
      // Exercise unchanged source modules at the public channel's actual path.
      // The transport and image are synthetic; no user storage is accessed.
      history.replaceState(null, '', '/preview/?mode=pro&mobile=0');
      window.__stableStorage = {
        '5e.aiModel':'gpt-6-sol', '5e.aiEffort':'medium', '5e.aiSpeed':'',
        '5e.aiActiveTask.v1':JSON.stringify({scope:'stable',taskId:'stable-task'}),
        '5e.aiConversationId':'stable-conversation',
        '5e.aiConversationMessages':JSON.stringify([{role:'user',text:'stable-only-message'}]),
        '5e.unified-library.search-pane-open.v1':'false',
        '5e.unified-library.preview-pane-open.v1':'false',
      };
      for (const [key,value] of Object.entries(window.__stableStorage)) localStorage.setItem(key,value);
      sessionStorage.setItem('5e.aiModelExplicit','gpt-6-sol');
    });
  }});
  const panel=page.locator('#ai-image-panel');
  await panel.locator('[data-ai-model]').evaluate(select => {
    select.value='gpt-6-luna';
    select.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.waitForFunction(() => document.querySelector('#ai-image-panel [data-ai-model]').value === 'gpt-6-luna');
  const tabs = await snapshot(page);
  assert.equal(tabs.length,1);
  const result = await page.evaluate(() => ({
    stable:Object.fromEntries(Object.keys(window.__stableStorage).map(key=>[key,localStorage.getItem(key)])),
    expected:window.__stableStorage,
    stableSession:sessionStorage.getItem('5e.aiModelExplicit'),
    previewModel:localStorage.getItem('5e.preview:5e.aiModel'),
    previewSession:sessionStorage.getItem('5e.preview:5e.aiModelExplicit'),
    previewSelection:JSON.parse(localStorage.getItem('5e.preview:5e.aiActiveTask.v1') || 'null'),
    sends:window.__task2.sends.length,
  }));
  fs.writeFileSync(path.join(evidence,'settings.json'),JSON.stringify(result,null,2));
  assert.deepEqual(result.stable,result.expected,'preview edits never overwrite stable values');
  assert.equal(result.stableSession,'gpt-6-sol');
  assert.equal(result.previewModel,'gpt-6-luna');
  assert.equal(result.previewSession,'gpt-6-luna');
  assert.equal(result.previewSelection.taskId,'task-0');
  assert.equal(result.sends,0);
  const library=await page.evaluate(async () => {
    const {createUnifiedLibraryUi}=await import('/js/unified-library-ui.js?v=1.7.0-four-session-integration');
    const ui=createUnifiedLibraryUi({getProvider:()=>null});
    return {
      foldersExpanded:ui.element.querySelector('[data-unilib-folders-open]').getAttribute('aria-expanded'),
      previewExpanded:ui.element.querySelector('[data-unilib-preview-toggle]').getAttribute('aria-pressed'),
      stableFolders:localStorage.getItem('5e.unified-library.search-pane-open.v1'),
      stablePreview:localStorage.getItem('5e.unified-library.preview-pane-open.v1'),
      previewFolders:localStorage.getItem('5e.preview:5e.unified-library.search-pane-open.v1'),
      previewPreview:localStorage.getItem('5e.preview:5e.unified-library.preview-pane-open.v1'),
    };
  });
  assert.deepEqual(library,{foldersExpanded:'true',previewExpanded:'true',stableFolders:'false',stablePreview:'false',previewFolders:'true',previewPreview:'true'});
  fs.writeFileSync(path.join(evidence,'library-settings.json'),JSON.stringify(library,null,2));
  await page.evaluate(() => window.__task2Manager.checkpointForClose());
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#ai-image-install-open').click();
  await page.waitForFunction(() => document.querySelector('#ai-image-panel [data-ai-model]').value === 'gpt-6-luna').catch(async error => {
    const diagnostic=await page.evaluate(async () => ({path:location.pathname,model:document.querySelector('#ai-image-panel [data-ai-model]').value,session:sessionStorage.getItem('5e.preview:5e.aiModelExplicit'),stored:localStorage.getItem('5e.preview:5e.aiModel'),snapshot:await window.__task2Manager.sharingSnapshot()}));
    fs.writeFileSync(path.join(evidence,'reload-failure.json'),JSON.stringify(diagnostic,null,2));throw error;
  });
  const restored=await snapshot(page);
  assert.equal(restored[0].attachments[0].data,tabs[0].attachments[0].data);
  assert.deepEqual(restored[0].generated,tabs[0].generated);
  assert.deepEqual(errors,[]);
});
