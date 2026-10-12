'use strict';

// Canonical full-app public export controls. Historical frozen suites remain
// unchanged; this receipt qualifies today's workflow-filtered collection path.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const { instrumentAiMain } = require('./helpers/canonical-fixture-adapter.cjs');
const { mixedCandidate } = require('./fixtures/candidate-union.cjs');
const root = path.resolve(__dirname, '..');
const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/feedback/parts/current-collection');
process.env.APP_ENTRY = '/';
const lifecycle = fs.readFileSync(path.join(root, 'tests/test-ai-workspace-lifecycle-browser.cjs'), 'utf8');
const start = lifecycle.indexOf('function seedRequestWorkspaces(');
const end = lifecycle.indexOf('\nasync function requestBrowserFixture(', start);
assert.ok(start >= 0 && end > start);
const seed = lifecycle.slice(start, end).replace('window.__task5Expected = structuredClone(tabs);', `
  for (const [index,tab] of tabs.entries()) {
    tab.conversionKind = 'image'; tab.title = 'same work'; tab.attachments[0].name = 'same source.png';
    tab.generated[0].reviewState = 'scoped-applied';
    tab.generated[0].data = index ? modified : original;
    tab.generated.push({...structuredClone(tab.generated[0]), id:'candidate-'+index+'-alt', data:index ? original : modified});
    tab.selectedCandidateId = index ? tab.generated[0].id : tab.generated[1].id;
  }
  window.__task5Expected = structuredClone(tabs);`);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const dataHash = data => hash(Buffer.from(data.split(',')[1], 'base64'));

async function snapshot(page) {
  return page.evaluate(async () => (await __collectionManager.sharingSnapshot()).workspaces.flatMap(w => w.tabs));
}
async function exportZip(page, engineName, kind, mode, expected) {
  const panel = page.locator('#ai-image-panel');
  await panel.locator('[data-ai-task-export-mode]').selectOption(mode);
  const downloads = page.waitForEvent('download');
  await panel.locator('[data-ai-task-export]').click();
  const download = await downloads, file = path.join(evidence, `${engineName}-${kind}-${mode}.zip`);
  await download.saveAs(file);
  const { unzipStore } = await import(pathToFileURL(path.join(root, 'js/backup-zip.js')).href);
  const entries = [...unzipStore(new Uint8Array(fs.readFileSync(file)))];
  assert.equal(entries.length, expected.length, 'Only the requested versions of the active workflow are exported');
  assert.equal(new Set(entries.map(([name]) => name)).size, expected.length, 'Repeated source names never overwrite another task');
  assert.deepEqual(entries.map(([,bytes]) => hash(bytes)).sort(), expected.map(dataHash).sort(), 'ZIP contains exact selected candidate bytes');
  const extension = kind === 'graph' ? '.svg' : '.png';
  assert.ok(entries.every(([name]) => name.startsWith('5E-AI-결과/') && name.endsWith(extension)), 'Native graph output retains its SVG encoding');
  await page.waitForFunction(() => !document.querySelector('#ai-image-panel [data-ai-task-export]').disabled);
  return entries.map(([name,bytes]) => ({ name, sha256:hash(bytes), bytes:bytes.length }));
}

h.withServer(async origin => {
  fs.mkdirSync(evidence, { recursive:true });
  for (const [engineName,engine] of Object.entries({chromium,webkit})) {
    const browser = await engine.launch({headless:true});
    const context = await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
    const page = await context.newPage(), errors = [], downloads = [];
    page.on('pageerror', error => errors.push(error.message));
    let cancel = false;
    page.on('dialog', dialog => cancel ? dialog.dismiss() : dialog.accept());
    page.on('download', download => downloads.push(download.suggestedFilename()));
    try {
      await page.addInitScript({content:seed + '\nseedRequestWorkspaces(2);\nObject.defineProperty(window,"showDirectoryPicker",{configurable:true,value:undefined});'});
      await page.route('**/js/main.js?*', route => route.fulfill({contentType:'text/javascript',body:instrumentAiMain(root,{manager:'__collectionManager',state:'__collectionState'}).body}));
      await h.navigate(page, origin + '/?mode=pro&mobile=0&exam=0'); await h.ready(page);
      const beforeGraph = await snapshot(page);
      const graph = mixedCandidate('unused').graphResult;
      await page.evaluate(async ({graph}) => {
        const current = await __collectionManager.sharingSnapshot();
        const template = current.workspaces[0];
        const data = await (await import('/js/graph/workbench-result.js?v=1.7.0-four-session-integration')).workbenchGraphDataUrl(graph);
        const tab = {...structuredClone(template.tabs[0]),id:'collection-graph',title:'independent graph',conversionKind:'graph',
          attachments:[],generated:[{id:'collection-graph-result',name:'native graph',kind:'generated',data,graphResult:graph,engine:'native-graph',comments:[]}],selectedCandidateId:'collection-graph-result'};
        await __collectionManager.restoreProjectSnapshot({workspaces:[{...template,tabs:[tab],activeTaskTabId:tab.id}],activeWorkspace:0});
      }, {graph});
      const panel = page.locator('#ai-image-panel');
      if (!await panel.isVisible()) await page.locator('#ai-image-install-open').click();
      await panel.locator('button[data-ai-workflow="image"]').click();
      await panel.locator('button[data-ai-workflow="image"][aria-pressed="true"]').waitFor();
      await panel.locator('[data-tab-id="task-0"] .ai-task-tab-select').click();
      await page.waitForFunction(() => document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId === 'candidate-0-alt');
      const baseline = await snapshot(page), images = baseline.filter(t => t.conversionKind === 'image');
      assert.equal(images.length, 2); assert.equal(baseline.filter(t => t.conversionKind === 'graph').length, 1);
      assert.equal(beforeGraph.length, 2);
      const selected = await exportZip(page,engineName,'image','selected',images.map(t => t.generated.find(c => c.id === t.selectedCandidateId).data));
      assert.ok(selected.some(e => e.name.includes('(2)')), 'Equal names receive a collision suffix');
      const all = await exportZip(page,engineName,'image','all',images.flatMap(t => t.generated.map(c => c.data)));
      await panel.locator('button[data-ai-workflow="graph"]').click();
      await panel.locator('button[data-ai-workflow="graph"][aria-pressed="true"]').waitFor();
      await panel.locator('[data-tab-id="collection-graph"] .ai-task-tab-select').click();
      const graphTab = baseline.find(t => t.id === 'collection-graph');
      const native = await exportZip(page,engineName,'graph','selected',[graphTab.generated[0].data]);
      cancel = true;
      const count = downloads.length;
      await panel.locator('[data-ai-task-export]').click();
      await page.waitForFunction(() => !document.querySelector('#ai-image-panel [data-ai-task-export]').disabled);
      assert.equal(downloads.length, count, 'Canceling the download confirmation cannot request a ZIP');
      const after = await snapshot(page);
      for (const tab of baseline) {
        const restored = after.find(t => t.id === tab.id);
        assert.deepEqual(restored.generated, tab.generated, 'Collection export never mutates candidates');
        assert.deepEqual(restored.attachments, tab.attachments);
        assert.equal(restored.selectedCandidateId,tab.selectedCandidateId);
        assert.equal(restored.input,tab.input);
        assert.deepEqual(restored.conversationMessages,tab.conversationMessages);
      }
      assert.deepEqual(errors,[]); assert.equal(await page.evaluate(() => __task2.sends.length),0);
      fs.writeFileSync(path.join(evidence,engineName+'.json'),JSON.stringify({selected,all,native,confirmationCancel:true,allCandidatesPreserved:true,providerCalls:0,nativeSafari:false},null,2));
      console.log(engineName+': current collection controls preserve exact versions, duplicate names, workflow filtering and cancel');
    } finally {
      await page.screenshot({path:path.join(evidence,engineName+'.png')}).catch(()=>{});
      await context.close(); await browser.close();
    }
  }
}).catch(error => {console.error(error);process.exitCode=1;});
