// Fixed graph source: b1846e849656076b1c0c5da2f82abffff3813eb1:tests/test-graph-workbench-stability-browser.cjs
// Fault injection through the real workbench UI; no provider requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('./helpers/graph-source-signals.cjs').loadPlaywright();
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/graph-reconstruction/linear.json')));
const output = process.env.EVIDENCE_DIR || path.join(__dirname, '../.omo/evidence/graph-workbench-stability');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:62759/';
fs.mkdirSync(output, { recursive: true });
async function setup(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.addInitScript(({ fixture }) => {
    for (const key of ['5e.preview:5e.tutorial.bannerSeen', '5e.tutorial.bannerSeen']) localStorage.setItem(key, 'true');
    localStorage.setItem('5e.preview:5e.mode', 'pro');
    const listeners = new Set(), states = new Set();
    const mock = window.__stability = { requests: [], pending: [], hold: false, unavailable: false, error: null, interrupts: [] };
    const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 300;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 400, 300);
    ctx.strokeStyle = '#111'; ctx.beginPath(); ctx.moveTo(40, 20); ctx.lineTo(40, 260); ctx.lineTo(360, 260); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(40, 260); ctx.lineTo(360, 80); ctx.stroke(); mock.source = canvas.toDataURL('image/png');
    mock.release = index => {
      const item = mock.pending[index];
      const emit = event => listeners.forEach(fn => fn({ ...event, clientScope: item.request.clientScope }));
      if (item.error) emit({ method: 'turn/completed', params: { turn: { id: item.turnId, status: 'failed', error: { message: item.error } } } });
      else {
        emit({ method: 'item/completed', params: { turnId: item.turnId, item: { type: 'agentMessage', text: JSON.stringify(item.plan) } } });
        emit({ method: 'turn/completed', params: { turn: { id: item.turnId, status: 'completed' } } });
      }
    };
    mock.disconnect = () => states.forEach(fn => fn({ state: 'stopped', message: 'AI connection disconnected', clientScope: mock.requests.at(-1)?.clientScope }));
    window.fiveEDesktop = { web: true, status: async () => ({ login: { loggedIn: true }, server: true }), start: async () => ({ ok: true }), account: async () => ({}),
      models: async () => ({ data: [{ model: mock.unavailable ? 'other-model' : 'gpt-6.1-sol', supportedReasoningEfforts: ['medium'], serviceTiers: [], defaultReasoningEffort: 'medium' }] }),
      onEvent: fn => { listeners.add(fn); return () => listeners.delete(fn); }, onState: fn => { states.add(fn); return () => states.delete(fn); }, onLog: () => () => {},
      setAiTaskShortcutActive() {}, onAiCloseTaskShortcut: () => () => {},
      interrupt: async request => { mock.interrupts.push(request); return { ok: true }; },
      send: async request => {
        mock.requests.push(request);
        const source = JSON.parse(request.text.match(/바인딩을 정확히 복사하고[^\n]*: (\{[^\n]+\})/)[1]);
        const plan = structuredClone(fixture); plan.source = { ...source, plotBox: { x: 40, y: 20, w: 320, h: 240 } }; plan.axes.x.title = '시간';
        const index = mock.pending.length, turnId = 'stability-' + index;
        mock.pending.push({ request, plan, turnId, error: mock.error });
        if (!mock.hold) queueMicrotask(() => mock.release(index));
        return { turnId, threadId: 'thread-' + turnId };
      } };
  }, { fixture });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(base + '?mode=pro', { waitUntil: 'networkidle' });
  await page.locator('#ai-image-install-open').click();
  await page.locator('#ai-image-panel [data-ai-workflow="graph"]').click();
  await page.locator('#ai-image-panel[data-ai-workflow="graph"]').waitFor();
  const png = await page.evaluate(() => window.__stability.source.split(',')[1]);
  await page.locator('#ai-image-panel [data-ai-source-file]').setInputFiles({ name: 'stability.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.locator('#ai-image-panel [data-ai-attachment-list] img').first().waitFor({ state: 'attached' });
  return { context, page, errors };
}
const ui = '#ai-image-panel ';
const count = page => page.locator(ui + '.ai-previews .ai-image-card').count();
const idle = page => page.waitForGraphSignal(() => document.querySelector('#ai-image-panel').dataset.aiBusy !== 'true');
const complete = (page, n) => page.waitForGraphSignal(async n => {
  if (document.querySelectorAll('#ai-image-panel .ai-previews .ai-image-card').length !== n || document.querySelector('#ai-image-panel').dataset.aiBusy === 'true') return false;
  const { IndexedDBOutputCacheBackend } = await import('/js/ai-output-cache-store.js?v=1.7.0-four-session-integration');
  const saved = await new IndexedDBOutputCacheBackend({ databaseName: '5e-ai-image-tasks', storeName: 'tasks' }).get('workspace');
  const ownerId = document.querySelector('#ai-image-panel .ai-task-tab.is-on')?.dataset.tabId, task = saved?.tabs?.find(t => t.id === ownerId);
  return task?.generated?.length === n && task.generated.some(c => c.id === task.selectedCandidateId && c.graphResult);
}, n);
const tabs = page => page.evaluate(async () => (await (new (await import('/js/ai-output-cache-store.js?v=1.7.0-four-session-integration')).IndexedDBOutputCacheBackend({ databaseName: '5e-ai-image-tasks', storeName: 'tasks' })).get('workspace'))?.tabs);
(async () => {
  const results = [];
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    if (process.env.GRAPH_STABILITY_ENGINE && process.env.GRAPH_STABILITY_ENGINE !== name) continue;
    const browser = await engine.launch();
    let context;
    try {
      const session = await setup(browser);
      context = session.context;
      const { page, errors } = session;
      assert.equal(await page.locator(ui+'.ai-task-delete').count(),0,'Task delete X is removed');
      await page.evaluate(()=>{
        window.__copiedPng=null;
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async items=>{const png=await items[0].getType('image/png');window.__copiedPng={type:png.type,size:png.size,header:[...new Uint8Array(await png.arrayBuffer()).subarray(0,8)]};}}});
      });
      const source = await page.evaluate(()=>window.__stability.source);
      const menu=page.locator('.ai-task-context-menu');
      await page.locator(ui+'.ai-task-tab-select').first().click({button:'right'});
      await menu.getByRole('menuitem',{name:'클립보드 복사',exact:true}).click();
      await page.waitForGraphSignal(()=>window.__copiedPng?.size>0);
      assert.equal(await page.evaluate(()=>window.__copiedPng.type),'image/png');
      for (const kind of ['image','graph']) {
        await page.locator(ui+'[data-ai-workflow="graph"]').click();
        await page.locator('#ai-image-panel[data-ai-workflow="graph"]').waitFor();
        await page.locator(ui+'.ai-task-tab-select').first().click({button:'right'});
        const sourceTaskId=await page.locator(ui+'.ai-task-tab').first().getAttribute('data-tab-id');
        await menu.getByRole('menuitem',{name:'이미지/그래프 변환으로 보내기',exact:true}).click();
        await menu.getByRole('menuitem',{name:kind==='image'?'이미지 변환으로 보내기':'그래프 복원으로 보내기',exact:true}).click();
        await page.locator(`#ai-image-panel[data-ai-workflow="${kind}"]`).waitFor();
        await page.waitForGraphSignal(({kind,sourceTaskId})=>document.querySelectorAll('#ai-image-panel .ai-task-tab:not(.ai-task-add)').length===(kind==='image'?1:2)
          && document.querySelector('#ai-image-panel .ai-task-tab.is-on')?.dataset.tabId!==sourceTaskId,{kind,sourceTaskId});
        if(kind==='image')assert.equal(await page.locator(ui+'[data-ai-mark-leaders]').inputValue(),'remove','a new image task defaults to removing guidelines');
        try {
          await page.locator(ui+'.ai-task-tab.is-on .ai-task-tab-select').click({button:'right'});
        } catch (error) {
          await page.screenshot({path:path.join(output,name+'-'+kind+'-menu-failure.png')});
          fs.writeFileSync(path.join(output,name+'-'+kind+'-menu-failure.json'),JSON.stringify(await page.evaluate(()=>({
            panels:[...document.querySelectorAll('.modal-overlay[data-ai-workflow]')].map(panel=>({id:panel.id,hidden:panel.hidden,inert:panel.inert,data:panel.dataset,rows:[...panel.querySelectorAll('.ai-task-tab')].map(row=>({id:row.dataset.tabId,rect:row.getBoundingClientRect().toJSON(),button:[...row.querySelectorAll('button')].map(button=>({rect:button.getBoundingClientRect().toJSON(),style:['display','visibility','width','height','position','flex','content-visibility'].map(key=>[key,getComputedStyle(button).getPropertyValue(key)]),ancestors:[...function*(node){while(node){yield {tag:node.tagName,hidden:node.hidden,inert:node.inert,display:getComputedStyle(node).display,visibility:getComputedStyle(node).visibility};node=node.parentElement;}}(button)]}))}))})),
          })),null,2));
          throw error;
        }
        await menu.getByRole('menuitem',{name:'작업대에서 삭제',exact:true}).click();
        await page.getByRole('dialog',{name:'작업 삭제',exact:true}).getByRole('button',{name:'작업 삭제',exact:true}).click();
        await page.waitForGraphSignal(({kind,sourceTaskId})=>document.querySelectorAll('#ai-image-panel .ai-task-tab:not(.ai-task-add)').length===(kind==='image'?0:1)
          && (kind==='image' || document.querySelector('#ai-image-panel .ai-task-tab.is-on')?.dataset.tabId===sourceTaskId),{kind,sourceTaskId});
        assert.equal((await tabs(page))[0].attachments[0].data,source,'Deleting the explicit copy retains the source owner');
      }
      await page.locator(ui+'.ai-task-tab-select').first().click({button:'right'});
      const duplicatedSourceId=await page.locator(ui+'.ai-task-tab').first().getAttribute('data-tab-id');
      await menu.getByRole('menuitem',{name:'현 작업대에 추가',exact:true}).click();
      await page.waitForGraphSignal(sourceId=>document.querySelectorAll('#ai-image-panel .ai-task-tab:not(.ai-task-add)').length===2
        && document.querySelector('#ai-image-panel .ai-task-tab.is-on')?.dataset.tabId!==sourceId,duplicatedSourceId);
      await page.locator(ui+'.ai-task-tab.is-on .ai-task-tab-select').click({button:'right'});
      await menu.getByRole('menuitem',{name:'작업대에서 삭제',exact:true}).click();
      await page.getByRole('dialog',{name:'작업 삭제',exact:true}).getByRole('button',{name:'작업 삭제',exact:true}).click();
      await page.waitForGraphSignal(sourceId=>document.querySelectorAll('#ai-image-panel .ai-task-tab:not(.ai-task-add)').length===1
        && document.querySelector('#ai-image-panel .ai-task-tab.is-on')?.dataset.tabId===sourceId,duplicatedSourceId);
      await page.evaluate(() => { window.__stability.hold = true; });
      await page.observeGraphSignal(() => window.__stability.requests.length === 1, undefined, undefined, async () => { await page.locator(ui + '[data-ai-send]').dblclick(); });
      await page.locator(ui + '[data-ai-workflow="image"]').click({ force: true });
      await page.locator('#ai-image-panel[data-ai-workflow="image"]').waitFor();
      assert.equal(await page.locator('.modal-overlay[data-ai-workflow="graph"][data-ai-busy="true"]').count(),1,'Original graph continues in its own controller');
      assert.equal(await page.locator(ui + '.ai-task-tab:not(.ai-task-add)').count(),0,'Image workflow excludes the graph source');
      await page.evaluate(() => window.__stability.release(0));
      await page.waitForGraphSignal(() => document.querySelector('.modal-overlay[data-ai-workflow="graph"]')?.dataset.aiBusy==='false');
      await page.locator(ui + '[data-ai-workflow="graph"]').click();
      await page.locator('#ai-image-panel[data-ai-workflow="graph"]').waitFor();await complete(page, 1);
      assert.equal(await page.locator(ui+'[data-ai-comments-apply]').isVisible(),false,'graph restore uses one action');
      assert.deepEqual(await page.locator(ui+'.ai-output-actions > button').allTextContents(),
        ['PNG 저장','이미지 복사','캔버스에 삽입','한글로 보내기'],'The approved four output actions are retained for graph results');
      assert.equal(await page.locator(ui+'[data-ai-save-selected]').isVisible(),true,'The common graph output action saves a PNG');
      const beforePng = await tabs(page), requestsBeforePng = await page.evaluate(() => __stability.requests.length);
      fs.writeFileSync(path.join(output,name+'-png-action.json'), JSON.stringify({
        saveDisabled:await page.locator(ui+'[data-ai-save-selected]').isDisabled(),
        copyDisabled:await page.locator(ui+'[data-ai-copy-selected]').isDisabled(),
        candidateSaveHandlers:await page.locator(ui+'.is-ai-active-candidate [data-ai-save-candidate]').count(),
        selectedHasNativeGraph:beforePng.some(tab=>tab.generated?.some(item=>item.id===tab.selectedCandidateId&&item.graphResult&&item.sceneResult)),
      },null,2));
      assert.equal(await page.locator(ui+'[data-ai-save-selected]').isEnabled(),true,'A valid native graph must allow PNG export');
      assert.equal(await page.locator(ui+'[data-ai-copy-selected]').isEnabled(),true,'A valid native graph must allow image copy');
      const [pngDownload] = await Promise.all([page.waitForEvent('download'), page.locator(ui+'[data-ai-save-selected]').click()]);
      assert.match(pngDownload.suggestedFilename(), /\.png$/);
      const pngPath = path.join(output, name+'-selected-graph.png'); await pngDownload.saveAs(pngPath);
      assert.deepEqual([...fs.readFileSync(pngPath).subarray(0,8)],[137,80,78,71,13,10,26,10],'The actual download is a PNG, not renamed SVG bytes');
      const selectedGraph = beforePng.flatMap(tab => tab.generated || []).find(item => item.id === beforePng.find(tab => tab.generated?.some(item => item.id === tab.selectedCandidateId && item.graphResult))?.selectedCandidateId);
      const pixels = await page.evaluate(async ({ png, svg }) => {
        const raster = async src => {
          const img = new Image(); img.src = src; await img.decode();
          const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d'); ctx.drawImage(img,0,0);
          return { width:canvas.width, height:canvas.height, bytes:ctx.getImageData(0,0,canvas.width,canvas.height).data };
        };
        const [output, preview] = await Promise.all([raster(png),raster(svg)]);
        let differences = 0, ink = 0;
        for (let i = 0; i < output.bytes.length; i++) if (output.bytes[i] !== preview.bytes[i]) differences++;
        for (let i = 0; i < output.bytes.length; i += 4) if (output.bytes[i+3] && output.bytes[i]+output.bytes[i+1]+output.bytes[i+2] < 600) ink++;
        return { width:output.width, height:output.height, previewWidth:preview.width, previewHeight:preview.height, differences, ink };
      }, { png:'data:image/png;base64,'+fs.readFileSync(pngPath).toString('base64'),svg:selectedGraph.data });
      fs.writeFileSync(path.join(output,name+'-png-pixels.json'),JSON.stringify(pixels,null,2));
      assert.equal(pixels.width,pixels.previewWidth); assert.equal(pixels.height,pixels.previewHeight);
      assert.equal(pixels.differences,0,'Exported PNG pixels preserve the displayed native graph'); assert.ok(pixels.ink>10,'The output contains the graph, not a blank bitmap');
      assert.deepEqual(await tabs(page),beforePng,'Raster export preserves the editable graph, original and prior candidates');
      assert.equal(await page.evaluate(() => __stability.requests.length),requestsBeforePng,'PNG export does not request another model conversion');
      await page.evaluate(() => { __copiedPng = null; });
      await page.locator(ui+'[data-ai-copy-selected]').click();
      await page.waitForGraphSignal(() => __copiedPng?.size>0);
      assert.equal(await page.evaluate(() => __copiedPng.type),'image/png');
      assert.deepEqual(await page.evaluate(() => __copiedPng.header),[137,80,78,71,13,10,26,10],'The isolated clipboard writer receives actual PNG bytes');
      assert.deepEqual(await tabs(page),beforePng); assert.equal(await page.evaluate(() => __stability.requests.length),requestsBeforePng);
      assert.equal(await page.locator(ui+'[data-ai-selected-output-note]').count(),1);
      assert.equal(await page.locator(ui+'[data-ai-selected-output-note]').isVisible(),false,'restoration diagnostics are shown on request');
      const moreOutputs = page.locator(ui+'.ai-output-more');
      if (!await moreOutputs.evaluate(el => el.open)) await moreOutputs.locator('summary').click();
      await page.locator(ui+'[data-ai-output-details]').click();
      await page.getByRole('dialog',{name:'그래프 복원 상세',exact:true}).getByRole('button',{name:'닫기',exact:true}).click();
      assert.equal(await page.locator(ui+'[data-ai-insert-selected]').textContent(),'캔버스에 삽입');
      assert.equal(await page.locator(ui+'.ai-annotation-toolbar [data-ai-comment-visibility]').count(),1,'comment visibility is adjacent to its creation tools');
      for (const kind of ['image','graph','image','graph']) {
        await page.locator(ui+`[data-ai-workflow="${kind}"]`).click();
        await page.locator(`#ai-image-panel[data-ai-workflow="${kind}"]`).waitFor();
        assert.equal(await page.locator(ui+'.ai-task-tab:not(.ai-task-add)').count(),kind==='image'?0:1,'Navigation preserves separated task lists');
      }
      const baseline = (await tabs(page)).flatMap(t => t.generated || []).find(g => g.graphResult);
      await page.evaluate(() => { window.__stability.hold = false; window.__stability.error = '429 Too Many Requests'; });
      await page.locator(ui + '[data-ai-send]').click(); await idle(page);
      assert.match(await page.locator(ui + '[data-ai-status]').textContent(), /한도/);
      assert.equal(await count(page), 1); assert.equal(await page.evaluate(() => window.__stability.requests.length), 2);
      assert.deepEqual((await tabs(page)).flatMap(t => t.generated || []).find(g => g.id === baseline.id)?.graphResult, baseline.graphResult);
      await page.evaluate(() => { window.__stability.error = null; window.__stability.hold = true; });
      await page.observeGraphSignal(() => window.__stability.requests.length === 3, undefined, undefined, async () => { await page.locator(ui + '[data-ai-send]').click(); });
      await page.evaluate(() => window.__stability.disconnect()); await idle(page);
      assert.match(await page.locator(ui + '[data-ai-status]').textContent(), /연결/);
      await page.evaluate(() => window.__stability.release(2));
      assert.equal(await count(page), 1);
      await page.reload({ waitUntil: 'networkidle' }); await page.locator('#ai-image-install-open').click();
      await page.locator('#ai-image-panel [data-ai-workflow="graph"]').click(); await complete(page, 1);
      assert.equal(await page.evaluate(() => window.__stability.requests.length), 0);
      const beforeEditTask = (await tabs(page)).find(t => t.generated?.some(c => c.id === baseline.id));
      assert.equal(beforeEditTask.generated.length, 1);
      await page.locator(ui + '.ai-previews img').first().dblclick();
      assert.equal(await page.locator('#gm-send-exam').isVisible(),false,'The shared graph editor hides its exam action while editing a workbench draft');
      assert.equal(await page.locator('#gm-send-exam').evaluate(el=>el.hidden),true,'A hidden shared control must not appear as a duplicate output action');
      await page.locator('#gm-labelx').fill('보존된 편집');
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => {
        const original = document.fonts.load.bind(document.fonts);
        let started;
        window.__fontGate = { calls: 0, release: null, started: new Promise(resolve => { started = resolve; }) };
        document.fonts.load = (...args) => { window.__fontGate.calls++; started(); return new Promise(resolve => { window.__fontGate.release = () => original(...args).then(resolve); }); };
      });
      await page.locator('#gm-confirm').click();
      await page.evaluate(() => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Graph preview font loading did not start')), 30000);
        window.__fontGate.started.then(() => { clearTimeout(timer); resolve(); });
      }));
      const oldTask = await page.locator(ui + '.ai-task-tab.is-on').getAttribute('data-tab-id');
      await page.observeGraphSignal(old => document.querySelector('#ai-image-panel .ai-task-tab.is-on')?.dataset.tabId !== old, oldTask, undefined, async () => { await page.locator(ui + '[data-ai-task-add]').click(); });
      await page.waitForGraphSignal(async old => {
        const { IndexedDBOutputCacheBackend } = await import('/js/ai-output-cache-store.js?v=1.7.0-four-session-integration');
        const saved = (await new IndexedDBOutputCacheBackend({ databaseName: '5e-ai-image-tasks', storeName: 'tasks' }).get('workspace'));
        const task = saved?.tabs.find(t => t.id === old), selected = task?.generated?.find(c => c.id === task.selectedCandidateId);
        return task?.generated?.length === 2 && selected?.graphResult?.objects.find(o => o.type === 'coordplane')?.labelX === '보존된 편집';
      }, oldTask);
      const pendingTask = (await tabs(page)).find(t => t.id === oldTask);
      const editedId = pendingTask.selectedCandidateId;
      assert.notEqual(editedId, baseline.id);
      assert.deepEqual(pendingTask.generated[0], beforeEditTask.generated[0], 'The original candidate remains unchanged while the new version renders');
      assert.equal(pendingTask.generated.find(c => c.id === editedId).graphEdit.parentCandidateId, baseline.id);
      try { await page.observeGraphSignal(async ({ownerId, candidateId}) => {
        const { IndexedDBOutputCacheBackend } = await import('/js/ai-output-cache-store.js?v=1.7.0-four-session-integration');
        const data = (await new IndexedDBOutputCacheBackend({ databaseName: '5e-ai-image-tasks', storeName: 'tasks' }).get('workspace'))?.tabs.find(t => t.id === ownerId)?.generated?.find(c => c.id === candidateId)?.data;
        if(!data?.startsWith('data:image/svg+xml;base64,'))return false;
        const svg=new DOMParser().parseFromString(new TextDecoder().decode(Uint8Array.from(atob(data.split(',')[1]), c => c.charCodeAt(0))),'image/svg+xml');
        // Typography splits Korean words and spaces across native text nodes.
        return !svg.querySelector('parsererror')&&[...svg.querySelectorAll('text')].map(node=>node.textContent).join('').includes('보존된 편집');
      }, {ownerId: oldTask, candidateId: editedId}, undefined, async () => { await page.evaluate(() => window.__fontGate.release()); });
      } catch (error) {
        const saved = await tabs(page), candidate = saved.find(t => t.id === oldTask)?.generated?.find(c => c.id === editedId);
        const diagnostic = await page.evaluate(() => ({status:document.querySelector('#ai-image-panel [data-ai-status]')?.textContent,activeOwnerId:document.querySelector('#ai-image-panel .ai-task-tab.is-on')?.dataset.tabId,fontCalls:window.__fontGate.calls}));
        fs.writeFileSync(path.join(output,name+'-owner-render-failure.json'),JSON.stringify({error:error.stack,ownerId:oldTask,candidateId:editedId,diagnostic,tasks:saved,errors},null,2));
        if(candidate?.data?.startsWith('data:image/svg+xml;base64,'))fs.writeFileSync(path.join(output,name+'-owner-render-failure.svg'),Buffer.from(candidate.data.split(',')[1],'base64'));
        await page.screenshot({path:path.join(output,name+'-owner-render-failure.png')});
        throw error;
      }
      assert.equal(await count(page), 0, 'Inactive owner render cannot add a result to the new task.');
      await page.reload({ waitUntil: 'networkidle' }); await page.locator('#ai-image-install-open').click();
      await page.locator('#ai-image-panel [data-ai-workflow="graph"]').click();
      await page.locator(ui + `[data-tab-id="${oldTask}"] .ai-task-tab-select`).click(); await complete(page, 2);
      const recoveredTask = (await tabs(page)).find(t => t.id === oldTask);
      assert.equal(recoveredTask.selectedCandidateId, editedId);
      assert.deepEqual(recoveredTask.generated[0], beforeEditTask.generated[0]);
      assert.notEqual(recoveredTask.generated.find(c=>c.id===editedId).data,beforeEditTask.generated[0].data,'The edited version has new rendered pixels after the font gate and owner switch');
      assert.equal(recoveredTask.generated.find(c => c.id === editedId).graphResult.objects.find(o => o.type === 'coordplane').labelX, '보존된 편집');
      await page.locator(ui + '[data-ai-insert-selected]').click();
      const objects = await page.evaluate(async () => (await import('/js/state.js?v=1.7.0-four-session-integration')).state.get().objects);
      assert.equal(objects.find(o => o.type === 'coordplane').labelX, '보존된 편집'); assert(!objects.some(o => o.type === 'image'));
      await page.locator('#ai-image-install-open').click();
      await page.locator('#ai-image-panel').waitFor({state:'visible'});
      const graphTaskCount=await page.locator(ui+'.ai-task-tab:not(.ai-task-add)').count();
      await page.locator(ui+'.ai-task-tab.is-on .ai-task-tab-select').click({button:'right'});
      await menu.getByRole('menuitem',{name:'이미지/그래프 변환으로 보내기',exact:true}).click();
      await menu.getByRole('menuitem',{name:'이미지 변환으로 보내기',exact:true}).click();
      await page.locator('#ai-image-panel[data-ai-workflow="image"]').waitFor();
      await page.waitForGraphSignal(()=>document.querySelectorAll('#ai-image-panel .ai-task-tab:not(.ai-task-add)').length===1);
      await page.locator(ui+'[data-ai-tab-select-all]').click();
      assert.equal(await page.locator(ui+'.ai-task-tab.is-batch-selected').count(),1,'select all is scoped to image tasks');
      await page.locator(ui+'[data-ai-tab-clear]').click();
      await page.getByRole('dialog',{name:'전체 작업 삭제',exact:true}).getByRole('button',{name:'1개 삭제',exact:true}).click();
      await page.waitForGraphSignal(()=>document.querySelectorAll('#ai-image-panel .ai-task-tab:not(.ai-task-add)').length===0);
      await page.locator(ui+'[data-ai-workflow="graph"]').click();
      await page.locator('#ai-image-panel[data-ai-workflow="graph"]').waitFor();
      assert.equal(await page.locator(ui+'.ai-task-tab:not(.ai-task-add)').count(),graphTaskCount,'clearing image tasks preserves graph tasks');
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(output, name + '-stability.png') });
      results.push({ engine: name, duplicateSubmit: 'pass', runningModeChange: 'background retained', repeatedNavigationNoDuplicates:'pass',contextMenuCopySendDelete:'pass', rateLimitPreservesPrior: 'pass', disconnectLateResponse: 'blocked', reloadNoResend: 'pass', pendingEditOwnerAndReload: 'pass', modelCalls: 0 });
    } catch(error){if(context){const p=context.pages()[0];await p.screenshot({path:path.join(output,name+'-round2-failure.png')});fs.writeFileSync(path.join(output,name+'-round2-failure.json'),JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('.modal-overlay[data-ai-workflow]')].map(p=>({id:p.id,hidden:p.hidden,workflow:p.dataset.aiWorkflow,inert:p.inert,style:p.getAttribute('style'),rect:p.getBoundingClientRect().toJSON(),inner:p.querySelector('.modal-ai')?.getAttribute('style'),rows:[...p.querySelectorAll('.ai-task-tab')].map(r=>({id:r.dataset.tabId,style:getComputedStyle(r).display,rect:r.getBoundingClientRect().toJSON()}))}))),null,2));}throw error;} finally { await context?.close(); await browser.close(); }
  }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify(results));
})().catch(error => { console.error(error); process.exitCode = 1; });
