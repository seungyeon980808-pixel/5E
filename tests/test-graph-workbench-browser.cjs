// Fixed graph source: b1846e849656076b1c0c5da2f82abffff3813eb1:tests/test-graph-workbench-browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('./helpers/graph-source-signals.cjs').loadPlaywright();
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:62759/';
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/graph-reconstruction/linear.json')));
fixture.series[0].endpoints = [{index: 1, kind: 'closed', fillLevel: 220, markerSize: 1.2}];
fixture.series[0].lineStyle = 'dashed'; fixture.series[0].dashLength = 1.5; fixture.series[0].dashGap = 0.5;
const output = process.env.EVIDENCE_DIR || path.join(__dirname, '../.omo/evidence/graph-workbench');
fs.mkdirSync(output, { recursive: true });

async function setup(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, serviceWorkers: 'block' });
  await context.addInitScript(({ fixture }) => {
    localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
    localStorage.setItem('5e.tutorial.bannerSeen', 'true');
    localStorage.setItem('5e.preview:5e.mode', 'pro');
    window.showSaveFilePicker = undefined; window.showDirectoryPicker = undefined;
    const listeners = new Set();
    const mock = window.__graphWorkbench = { requests: [], pending: [], hold: false, unavailable: false, interrupts: 0 };
    const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 300;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 400, 300);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(40, 20); ctx.lineTo(40, 260); ctx.lineTo(360, 260); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(40, 260); ctx.lineTo(120, 140); ctx.lineTo(360, 80); ctx.stroke();
    mock.source = canvas.toDataURL('image/png');
    mock.release = index => {
      const item = mock.pending[index];
      const send = event => listeners.forEach(fn => fn({ ...event, clientScope: item.request.clientScope }));
      send({ method: 'item/completed', params: { turnId: item.turnId, item: { type: 'agentMessage', text: JSON.stringify(item.plan) } } });
      send({ method: 'turn/completed', params: { turn: { id: item.turnId, status: 'completed' } } });
    };
    window.fiveEDesktop = {
      web: true,
      status: async () => ({ login: { loggedIn: true }, server: true }), start: async () => ({ ok: true }), account: async () => ({ rateLimits: {} }),
      models: async () => ({ data: [{ model: mock.unavailable ? 'another-model' : 'gpt-6.1-sol', displayName: 'Test provider', isDefault: true, defaultReasoningEffort: 'medium', supportedReasoningEfforts: ['medium'], serviceTiers: [] }] }),
      onEvent: fn => { listeners.add(fn); return () => listeners.delete(fn); }, onState: () => () => {}, onLog: () => () => {},
      setAiTaskShortcutActive() {}, onAiCloseTaskShortcut: () => () => {},
      interrupt: async () => { mock.interrupts++; return { ok: true, acknowledged: true }; },
      send: async request => {
        mock.requests.push(request);
        const match = request.text.match(/바인딩을 정확히 복사하고[^\n]*: (\{[^\n]+\})/);
        if (!match) throw new Error('Graph request must bind the original source.');
        const source = JSON.parse(match[1]);
        const plan = structuredClone(fixture);
        plan.source = { ...source, plotBox: { x: 40, y: 20, w: 320, h: 240 } };
        plan.axes.x.title = request.attachments.length === 2 ? '편집한 시간' : '시간'; plan.axes.y.title = '속도';
        const turnId = 'graph-test-' + mock.pending.length;
        const index = mock.pending.push({ request, plan, turnId }) - 1;
        if (!mock.hold) queueMicrotask(() => mock.release(index));
        return { turnId, threadId: 'thread-' + turnId };
      },
    };
  }, { fixture });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => { errors.push(String(error)); console.error('pageerror', String(error)); });
  await page.goto(base + '?mode=pro', { waitUntil: 'networkidle' });
  assert.equal(await page.locator('#graph-reconstruction-open').count(), 0, 'Graph restoration uses the shared AI conversion tabs.');
  await page.locator('#ai-image-install-open').click();
  await page.locator('#ai-image-panel [data-ai-workflow="graph"]').click();
  await page.locator('#ai-image-panel [data-ai-workflow="graph"][aria-pressed="true"]').waitFor();
  return { context, page, errors };
}

async function upload(page, name = 'physics-graph.png') {
  const data = await page.evaluate(() => window.__graphWorkbench.source.split(',')[1]);
  await page.locator('#ai-image-panel [data-ai-source-file]').setInputFiles({ name, mimeType: 'image/png', buffer: Buffer.from(data, 'base64') });
  await page.locator('#ai-image-panel [data-ai-attachment-list] img').first().waitFor({ state: 'attached' });
}
async function result(page, count = 1) {
  try { await page.waitForGraphSignal(count => document.querySelectorAll('#ai-image-panel .ai-previews .ai-image-card').length === count, count, { timeout: 15000 }); } catch (e) { console.error(await page.locator('#ai-image-panel [data-ai-status]').textContent()); await page.screenshot({path:path.join(output,'failure.png')}); throw e; }
  await page.waitForGraphSignal(() => document.querySelector('#ai-image-panel')?.dataset.aiBusy !== 'true');
  await page.waitForGraphSignal(async count => {
    const { IndexedDBOutputCacheBackend } = await import('/js/ai-output-cache-store.js?v=1.7.0-four-session-integration');
    const panel = document.querySelector('#ai-image-panel');
    const rows = panel?.querySelectorAll('.ai-task-tab.is-on');
    if (rows?.length !== 1) return false;
    const { tabId: ownerId, aiWorkspaceLink: scope } = rows[0].dataset;
    const selectedOwner = JSON.parse(localStorage.getItem('5e.aiActiveTask.v1') || 'null');
    if (!ownerId || !scope || selectedOwner?.taskId !== ownerId || selectedOwner.scope !== (scope === 'legacy' ? '' : scope)) return false;
    const databaseName = scope === 'legacy' ? '5e-ai-image-tasks' : '5e-ai-image-tasks-' + scope;
    const saved = await new IndexedDBOutputCacheBackend({ databaseName, storeName: 'tasks' }).get('workspace');
    const task = saved?.tabs?.find(t => t.id === ownerId);
    return saved?.activeTaskTabId === ownerId && task?.generated?.length === count
      && task.selectedCandidateId === panel.dataset.aiSelectedCandidateId
      && task.generated.some(c => c.id === task.selectedCandidateId && c.graphResult);
  }, count);
}
async function objects(page) {
  return page.evaluate(async () => structuredClone((await import('/js/state.js?v=1.7.0-four-session-integration')).state.get().objects));
}
async function storedTabs(page) {
  return page.evaluate(async () => {
    const { IndexedDBOutputCacheBackend } = await import('/js/ai-output-cache-store.js?v=1.7.0-four-session-integration');
    const rows = document.querySelectorAll('#ai-image-panel .ai-task-tab.is-on');
    if (rows.length !== 1) throw new Error('Expected exactly one active task owner');
    const { tabId: ownerId, aiWorkspaceLink: scope } = rows[0].dataset;
    const selectedOwner = JSON.parse(localStorage.getItem('5e.aiActiveTask.v1') || 'null');
    if (!ownerId || !scope || selectedOwner?.taskId !== ownerId || selectedOwner.scope !== (scope === 'legacy' ? '' : scope)) throw new Error('Visible task owner and persisted active workspace must agree');
    const databaseName = scope === 'legacy' ? '5e-ai-image-tasks' : '5e-ai-image-tasks-' + scope;
    const saved = await new IndexedDBOutputCacheBackend({ databaseName, storeName: 'tasks' }).get('workspace');
    if (saved?.activeTaskTabId !== ownerId || !saved.tabs.some(task => task.id === ownerId)) throw new Error('Active owner must exist in its exact workspace record');
    return saved.tabs;
  });
}

(async () => {
  const summary = [];
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch({ headless: true });
    try {
      const { context, page, errors } = await setup(browser);
      await upload(page);
      const guards = await page.evaluate(async plan => {
        const {buildWorkbenchGraph, validateWorkbenchGraph} = await import('/js/graph/workbench-result.js?v=1.7.0-four-session-integration');
        const result = buildWorkbenchGraph(plan, plan.source);
        const invalid = [ {...result, schema:'unknown'}, {...result, objects:[null]}, {...result, source:{...result.source, hash:'wrong-source'}} ];
        return invalid.map(value=>{try{validateWorkbenchGraph(value);return false;}catch(error){return error instanceof Error && !(error instanceof TypeError);}});
      }, fixture);
      assert.deepEqual(guards, [true,true,true]);
      assert(await page.locator('#ai-image-panel [data-ai-model]').isHidden());
      await page.locator('#ai-image-panel [data-ai-input]').fill('B의 점선을 더 굵게');
      await page.locator('#ai-image-panel [data-ai-send]').click();
      await result(page);
      assert.equal((await objects(page)).length, 0, 'Reconstruction must not insert into the page yet.');
      const rendering = await page.evaluate(async plan => {
        const {buildNativeGraph}=await import('/js/graph/native-graph.js?v=1.7.0-four-session-integration');
        const {renderFuncgraph}=await import('/js/render/coordplane.js?v=1.7.0-four-session-integration');
        const r=buildNativeGraph(plan), obj=r.objects.find(o=>o.type==='funcgraph');
        const cap=o=>renderFuncgraph(o).querySelector('path')?.getAttribute('stroke-linecap');
        const gray=renderFuncgraph(obj).querySelector('[data-graph-endpoint]')?.getAttribute('fill');
        const mixed=renderFuncgraph({...obj,markerShape:'circle'});const dotsCount=mixed.querySelectorAll('circle').length;const radius=mixed.querySelector('[data-graph-endpoint]').getAttribute('r');
        return {gray,dotsCount,pointCount:obj.points.length,radius,dashed:cap(obj),ordinary:cap({...obj,reconstruction:null}),dots:cap({...obj,dashPattern:[0,1]}),odd:cap({...obj,dashPattern:[1,1,0]})};
      },fixture);
      assert.equal(rendering.dotsCount,rendering.pointCount,'Individual override must not duplicate the global point');assert.equal(Number(rendering.radius),1.2);assert.equal(rendering.gray,'#dcdcdc');assert.equal(rendering.dashed,'butt');assert.equal(rendering.ordinary,'round');assert.equal(rendering.dots,'round');assert.equal(rendering.odd,'round');
      const request = await page.evaluate(() => window.__graphWorkbench.requests[0]);
      assert.equal(request.model, 'gpt-6.1-sol'); assert.equal(request.effort, 'medium');
      assert.equal(request.purpose, 'scene'); assert.match(request.text, /B의 점선을 더 굵게/);
      await page.locator('#ai-image-panel .ai-compare-menu summary').click();
      await page.locator('#ai-image-panel [data-ai-compare]').click();
      await page.locator('#ai-image-panel [role="slider"]').waitFor();
      const slider = page.locator('#ai-image-panel [role="slider"]');
      const box = await slider.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2); await page.mouse.up();
      assert.notEqual(await slider.getAttribute('aria-valuenow'), '50', 'Dragging must move the shared wipe boundary.');
      await page.screenshot({ path: path.join(output, name + '-comparison.png') });
      await page.locator('#ai-image-panel .ai-compare-menu summary').click();
      await page.locator('#ai-image-panel [data-ai-layout-mode="side-by-side"]').click();
      assert.equal(await slider.isVisible(), false, 'Choosing a comparison layout closes the wipe view.');
      const originalTask = (await storedTabs(page)).find(t => t.generated?.some(c => c.graphResult));
      assert.equal(originalTask.generated.length, 1);
      const originalCandidate = originalTask.generated[0];
      assert.equal(await page.locator('#ai-image-panel [data-ai-graph-edit]').count(),1,'one graph detail entry');
      assert.equal(await page.locator('#ai-image-panel .ai-compare-heading [data-ai-graph-edit]').count(),0,'no duplicate toolbar entry');
      const badge=await page.locator('#ai-image-panel [data-ai-graph-edit]').boundingBox();
      const graphStage=await page.locator('#ai-image-panel .ai-previews .ai-preview-stage').first().boundingBox();
      assert.ok(badge.x+badge.width<=graphStage.x+graphStage.width+2 && badge.y+badge.height<=graphStage.y+2,'persistent badge stays above the right edge of the graph');
      await page.locator('#ai-image-panel .ai-previews img').first().dblclick();
      assert.equal(await page.locator('#graph-modal-overlay').isVisible(),false,'doubleclick no longer creates another edit route');
      await page.locator('#ai-image-panel [data-ai-graph-edit]').click();
      const toolbar=await page.locator('.gm-preview-toolbar').evaluate(node=>{
        const selectors=['select[data-trace-view]','[data-trace-import]','[data-trace-zoom-toggle]','#gm-send-exam','#gm-confirm'];
        return selectors.map(selector=>{const element=node.querySelector(selector),b=element.getBoundingClientRect();return {selector,top:b.top,bottom:b.bottom,left:b.left,right:b.right};}).filter(b=>b.right>b.left);
      });
      fs.writeFileSync(path.join(output,name+'-toolbar.json'),JSON.stringify(toolbar,null,2));
      assert.ok(Math.max(...toolbar.map(b=>b.top))-Math.min(...toolbar.map(b=>b.top))<=4,'all visible graph controls share one row');
      assert.ok(toolbar.every((b,index)=>index===0 || b.left>=toolbar[index-1].right),'toolbar controls do not overlap');
      await page.screenshot({path:path.join(output,name+'-compact-editor.png')});
      await page.locator('#gm-labelx').fill('취소할 제목');
      await page.locator('#gm-cancel').click();
      assert.equal((await objects(page)).length, 0);
      await page.locator('#ai-image-panel [data-ai-graph-edit]').click();
      await page.locator('#gm-labelx').fill('편집한 시간');
      await page.locator('#gm-tab-func-btn').click();await page.locator('#gm-chips [data-series-index="0"]').click();
      await page.locator('#gm-point-detail summary').click();
      assert.equal(await page.locator('#gm-endpoints').inputValue(),'2:채움:220:1.2');
      await page.locator('#gm-endpoints').fill('2:채움:128:0.8');await page.locator('#gm-endpoints').dispatchEvent('change');
      await page.observeGraphSignal(() => document.querySelector('#ai-image-panel [data-ai-status]')?.textContent.includes('편집을 적용'), undefined, undefined, async () => { await page.locator('#gm-confirm').click(); });
      await page.waitForGraphSignal(async taskId => {
        const { IndexedDBOutputCacheBackend } = await import('/js/ai-output-cache-store.js?v=1.7.0-four-session-integration');
        const tabs = (await new IndexedDBOutputCacheBackend({ databaseName: '5e-ai-image-tasks', storeName: 'tasks' }).get('workspace'))?.tabs;
        const task = tabs?.find(t => t.id === taskId), selected = task?.generated?.find(c => c.id === task.selectedCandidateId);
        return task?.generated?.length === 2 && selected?.graphResult?.objects?.find(o => o.type === 'coordplane')?.labelX === '편집한 시간';
      }, originalTask.id);
      await result(page, 2);
      const editedTask = (await storedTabs(page)).find(t => t.id === originalTask.id);
      const editedCandidate = editedTask.generated.find(c => c.id === editedTask.selectedCandidateId);
      assert.deepEqual(editedTask.generated[0], originalCandidate, 'Edit preserves the entire original candidate, including pixels and review logs');
      assert.notEqual(editedCandidate.id, originalCandidate.id);
      assert.equal(editedCandidate.graphEdit.parentCandidateId, originalCandidate.id);
      await page.screenshot({ path: path.join(output, name + '-edited.png') });
      const storedMarker = await page.evaluate(async({taskId, candidateId})=>{
        const {IndexedDBOutputCacheBackend}=await import('/js/ai-output-cache-store.js?v=1.7.0-four-session-integration');
        const tabs=(await new IndexedDBOutputCacheBackend({databaseName:'5e-ai-image-tasks',storeName:'tasks'}).get('workspace'))?.tabs;
        return tabs?.find(t=>t.id===taskId)?.generated?.find(c=>c.id===candidateId)?.graphResult?.objects?.find(o=>o.type==='funcgraph')?.endpointMarkers;
      }, {taskId: originalTask.id, candidateId: editedCandidate.id});
      assert.deepEqual(storedMarker,[{index:1,kind:'closed',fillLevel:128,markerSize:0.8}]);
      await page.locator('#ai-image-panel [data-ai-send]').click();
      await result(page, 3);
      const revisedTask = (await storedTabs(page)).find(t => t.id === originalTask.id);
      assert.deepEqual(revisedTask.generated.slice(0, 2), editedTask.generated, 'Provider revision preserves both prior independent versions');
      const revised = await page.evaluate(() => window.__graphWorkbench.requests[1]);
      assert.equal(revised.attachments.length, 2, 'Revision receives both the original and current edited graph.');
      assert.match(revised.attachments[1].data, /^data:image\/png;base64,/);
      assert.notEqual(revised.attachments[0].data, revised.attachments[1].data);
      assert.match(revised.text, /사용자가 편집한 현재 그래프/);
      // Current UI saves the selected result through the collection ZIP flow.
      // Preserve the SVG oracle and verify its exact selected-candidate bytes.
      const moreOutputs = page.locator('#ai-image-panel .ai-output-more');
      if (!await moreOutputs.evaluate(el => el.open)) await moreOutputs.locator('summary').click();
      await page.locator('#ai-image-panel [data-ai-task-export-mode]').selectOption('selected');
      page.once('dialog',dialog=>dialog.accept());
      let download;
      try {
        [download] = await Promise.all([page.waitForEvent('download'), page.locator('#ai-image-panel [data-ai-task-export]').click()]);
      } catch (error) {
        const diagnostic = await page.evaluate(() => ({status:document.querySelector('#ai-image-panel [data-ai-status]')?.textContent,ownerId:document.querySelector('#ai-image-panel .ai-task-tab.is-on')?.dataset.tabId,busy:document.querySelector('#ai-image-panel')?.dataset.aiBusy,saveDisabled:document.querySelector('#ai-image-panel [data-ai-task-export]')?.disabled}));
        fs.writeFileSync(path.join(output, name + '-save-failure.json'), JSON.stringify({error:error.stack,diagnostic,tasks:await storedTabs(page),errors},null,2));
        await page.screenshot({path:path.join(output,name+'-save-failure.png')});
        throw error;
      }
      assert.match(download.suggestedFilename(), /\.zip$/);
      const selectedZip=path.join(output,name+'-selected-graph.zip');await download.saveAs(selectedZip);
      const exported=await page.evaluate(async encoded=>{const {unzipStore}=await import('/js/backup-zip.js?v=1.7.0-four-session-integration');return [...unzipStore(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)))].map(([name,bytes])=>({name,svg:new TextDecoder().decode(bytes)}));},fs.readFileSync(selectedZip).toString('base64'));
      assert.equal(exported.length,1,'Selected export contains exactly the selected graph version');assert.match(exported[0].name,/\.svg$/);
      const exportedCandidate=revisedTask.generated.find(c=>c.id===revisedTask.selectedCandidateId);
      assert.equal(exported[0].svg,Buffer.from(exportedCandidate.data.split(',')[1],'base64').toString('utf8'),'Downloaded SVG bytes match the selected independent revision');
      fs.writeFileSync(path.join(output,name+'-selected-graph.svg'),exported[0].svg);
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('#ai-image-install-open').click();
      await page.locator('#ai-image-panel [data-ai-workflow="graph"]').click();
      await result(page, 3);
      const recoveredTask = (await storedTabs(page)).find(t => t.id === originalTask.id);
      assert.deepEqual(recoveredTask.generated, revisedTask.generated);
      assert.equal(recoveredTask.selectedCandidateId, revisedTask.selectedCandidateId);
      assert.equal(await page.evaluate(() => window.__graphWorkbench.requests.length), 0, 'Recovered results must not resend.');
      await page.locator('#ai-image-panel [data-ai-insert-selected]').click();
      await page.locator('#ai-image-panel').waitFor({state:'hidden'});
      const inserted = await objects(page);
      assert(inserted.some(o => o.type === 'coordplane' && o.labelX === '편집한 시간'));
      assert(inserted.some(o => o.type === 'funcgraph'));
      assert(inserted.some(o=>o.type==='funcgraph' && o.endpointMarkers?.some(e=>e.fillLevel===220)));
      assert(!inserted.some(o => o.type === 'image'), 'Insertion must contain native editable objects.');
      await page.evaluate(async () => { const { state } = await import('/js/state.js?v=1.7.0-four-session-integration'); const { undo } = await import('/js/transform.js?v=1.7.0-four-session-integration'); undo(state); });
      assert.equal((await objects(page)).length, 0);
      await page.evaluate(async () => { const { state } = await import('/js/state.js?v=1.7.0-four-session-integration'); const { redo } = await import('/js/transform.js?v=1.7.0-four-session-integration'); redo(state); });
      assert.equal((await objects(page)).length, inserted.length);
      await page.locator('#file-menu-btn').click(); await page.locator('#project-save').click();
      const projectDownload = page.waitForEvent('download');
      const explicit = page.locator('#project-save-download');
      if (await explicit.isVisible().catch(()=>false)) await explicit.click(); else await page.getByRole('button', {name:'저장',exact:true}).click();
      const projectPath = path.join(output, name + '-editable-graph.5e');
      await (await projectDownload).saveAs(projectPath);
      await page.reload({waitUntil:'networkidle'});
      await page.locator('#file-menu-btn').click();
      const chooser = page.waitForEvent('filechooser'); await page.locator('#project-open').click();
      await (await chooser).setFiles(projectPath); await page.observeGraphSignal(async()=> (await import('/js/state.js?v=1.7.0-four-session-integration')).state.get().objects.some(o=>o.type==='funcgraph'), undefined, undefined, async () => { await page.getByRole('button', {name:'열기',exact:true}).click(); });
      const reopened = await objects(page);
      assert.equal(reopened.find(o=>o.type==='coordplane').labelX, '편집한 시간');
      assert.deepEqual(reopened.find(o=>o.type==='funcgraph').mathPoints, inserted.find(o=>o.type==='funcgraph').mathPoints);
      assert(!reopened.some(o=>o.type==='image'));
      assert.deepEqual(errors, []);
      summary.push({ engine: name, basic: 'passed', wipe: 'passed', draftCancel: 'passed', edit: 'passed', recovery: 'passed', svg: 'passed', nativeInsert: 'passed', undoRedo: 'passed', projectSaveReopen: 'passed' });
      await context.close();

      const cancelled = await setup(browser);
      await upload(cancelled.page);
      await cancelled.page.screenshot({path:path.join(output,name+'-cancel-start.png')});
      await cancelled.page.evaluate(() => { window.__graphWorkbench.hold = true; });
      await cancelled.page.observeGraphSignal(() => window.__graphWorkbench.requests.length === 1, undefined, undefined, async () => { await cancelled.page.locator('#ai-image-panel [data-ai-send]').click(); });
      await cancelled.page.observeGraphSignal(() => document.querySelector('#ai-image-panel').dataset.aiBusy !== 'true', undefined, undefined, async () => { await cancelled.page.locator('#ai-image-panel [data-ai-interrupt]').click(); });
      await cancelled.page.observeGraphSignal(() => window.__graphWorkbench.interrupts === 1, undefined, undefined, async () => { await cancelled.page.evaluate(() => window.__graphWorkbench.release(0)); });
      assert.equal(await cancelled.page.locator('#ai-image-panel .ai-previews .ai-image-card').count(), 0);
      await cancelled.page.evaluate(() => { window.__graphWorkbench.unavailable = true; window.__graphWorkbench.hold = false; });
      await cancelled.page.observeGraphSignal(() => document.querySelector('#ai-image-panel [data-ai-status]').dataset.kind === 'error', undefined, undefined, async () => { await cancelled.page.locator('#ai-image-panel [data-ai-send]').click(); });
      assert.equal(await cancelled.page.evaluate(() => window.__graphWorkbench.requests.length), 1, 'Missing fixed model must never fall back.');
      await cancelled.page.evaluate(() => { window.__graphWorkbench.unavailable = false; });
      await cancelled.page.locator('#ai-image-panel [data-ai-send]').click();
      await result(cancelled.page);
      await cancelled.page.locator('#ai-image-panel [data-ai-workflow="image"]').click();
      await cancelled.page.waitForGraphSignal(() => document.querySelector('#ai-image-panel')?.dataset.aiWorkflow === 'image');
      assert.equal(await cancelled.page.locator('#ai-image-panel .ai-previews .ai-image-card').count(), 0, 'Switching workflows keeps the old result in its own task.');
      assert.equal(await cancelled.page.locator('#ai-image-panel [data-ai-connection-dialog]').isVisible(),false, 'Connection metadata stays outside the restored workbench layout.');
      await cancelled.page.locator('#ai-image-panel [data-ai-side-tab="comments"]').click();
      const imageModel=cancelled.page.locator('#ai-image-panel [data-ai-model-choice="sol"]');
      assert.equal(await imageModel.isVisible(),true);assert.equal(await imageModel.isEnabled(),true);
      assert.equal(await imageModel.getAttribute('aria-pressed'),'true');assert.equal(await cancelled.page.locator('#ai-image-panel [data-ai-model]').inputValue(),'gpt-6.1-sol');
      assert.equal(await cancelled.page.locator('#ai-image-panel [data-ai-workflow="image"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await cancelled.page.locator('#ai-image-panel .ai-task-tab-select').count(), 0, 'Empty workflow has no synthetic tasks.');
      await cancelled.page.locator('#ai-image-panel [data-ai-workflow="graph"]').click();
      await cancelled.page.waitForGraphSignal(() => document.querySelector('#ai-image-panel')?.dataset.aiWorkflow === 'graph');
      await result(cancelled.page);
      assert.equal(await cancelled.page.locator('#ai-image-panel .ai-task-tab-select').count(), 1, 'Returning restores the original graph owner.');
      assert.deepEqual(cancelled.errors, []);
      summary.push({ engine: name, cancellation: 'passed', lateResult: 'blocked', unavailableModel: 'blocked without fallback', retry: 'passed', workflowIsolation: 'passed' });
      await cancelled.context.close();

      const batch = await setup(browser);
      const encoded = await batch.page.evaluate(() => window.__graphWorkbench.source.split(',')[1]);
      await batch.page.observeGraphSignal(() => document.querySelectorAll('#ai-image-panel .ai-task-tab-select').length === 2, undefined, undefined, async () => { await batch.page.locator('#ai-image-panel [data-ai-source-file]').setInputFiles([
        { name: 'physics-one.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64') },
        { name: 'physics-two.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64') },
      ]); });
      await batch.page.waitForGraphSignal(() => [...document.querySelectorAll('[data-ai-model]')].every(select => select.value === 'gpt-6.1-sol'));
      await batch.page.locator('#ai-image-panel .ai-task-tab-select').first().click();
      await batch.page.locator('#ai-image-panel .ai-task-tab-select').nth(1).click({ modifiers: ['Meta'] });
      try { await batch.page.observeGraphSignal(() => window.__graphWorkbench.requests.length === 2, undefined, undefined, async () => { await batch.page.locator('#ai-image-panel [data-ai-send]').click(); });
      } catch (error) {
        const diagnostic=await batch.page.evaluate(()=>({requests:window.__graphWorkbench.requests,selectionCount:document.querySelector('#ai-image-panel [data-ai-selection-count]')?.textContent,queue:document.querySelector('#ai-image-panel [data-ai-workspace-batch]')?.textContent,status:document.querySelector('#ai-image-panel [data-ai-status]')?.textContent,rows:[...document.querySelectorAll('#ai-image-panel .ai-task-tab')].map(row=>({dataset:{...row.dataset},text:row.textContent})),models:[...document.querySelectorAll('[data-ai-model]')].map(select=>({value:select.value,disabled:select.disabled}))}));
        fs.writeFileSync(path.join(output,name+'-batch-failure.json'),JSON.stringify({error:error.stack,diagnostic,tasks:await storedTabs(batch.page),errors:batch.errors},null,2));
        await batch.page.screenshot({path:path.join(output,name+'-batch-failure.png')});throw error;
      }
      await batch.page.waitForGraphSignal(() => [...document.querySelectorAll('#ai-image-panel .ai-task-tab')].filter(row=>row.dataset.workState === 'completed').length === 2);
      const batchRequests = await batch.page.evaluate(() => window.__graphWorkbench.requests);
      assert(batchRequests.every(r => r.model === 'gpt-6.1-sol' && r.effort === 'medium' && r.purpose === 'scene'));
      assert.notEqual(batchRequests[0].clientScope, batchRequests[1].clientScope);
      for (let index = 0; index < 2; index++) {
        await batch.page.locator('#ai-image-panel .ai-task-tab-select').nth(index).click();
        await result(batch.page);
        assert(await batch.page.locator('#ai-image-panel [data-ai-graph-edit]').isEnabled());
      }
      await batch.page.screenshot({ path: path.join(output, name + '-batch.png') });
      assert.deepEqual(batch.errors, []);
      summary.push({ engine: name, batchTwoTasks: 'passed', scopedOwnership: 'passed' });
      await batch.context.close();
      const inputFlows = await setup(browser);
      await inputFlows.page.observeGraphSignal(() => document.querySelectorAll('#ai-image-panel .ai-task-tab-select').length === 1 && document.querySelector('#ai-image-panel .ai-task-tab-title')?.textContent.includes('drop-physics'), undefined, undefined, async () => { await inputFlows.page.evaluate(async () => {
        const binary = atob(window.__graphWorkbench.source.split(',')[1]);
        const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
        const data = new DataTransfer(); data.items.add(new File([bytes], 'drop-physics.png', {type:'image/png'}));
        document.querySelector('#ai-image-panel').dispatchEvent(new DragEvent('drop', {bubbles:true,cancelable:true,dataTransfer:data}));
      }); });
      await inputFlows.page.observeGraphSignal(() => document.querySelectorAll('#ai-image-panel .ai-task-tab-select').length === 2, undefined, undefined, async () => { await inputFlows.page.evaluate(() => {
        const binary = atob(window.__graphWorkbench.source.split(',')[1]);
        const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
        const data = new DataTransfer(); data.items.add(new File([bytes], 'paste-physics.png', {type:'image/png'}));
        document.querySelector('#ai-image-panel').dispatchEvent(new ClipboardEvent('paste', {bubbles:true,cancelable:true,clipboardData:data}));
      }); });
      assert.equal(await inputFlows.page.locator('#ai-image-panel [data-ai-workflow="graph"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await inputFlows.page.evaluate(() => window.__graphWorkbench.requests.length), 0);
      assert.deepEqual(inputFlows.errors, []);
      summary.push({engine:name, fileInput:'passed', dropInput:'passed', clipboardInput:'passed', noAutomaticSend:'passed'});
      await inputFlows.context.close();
    } finally { await browser.close(); }
  }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
