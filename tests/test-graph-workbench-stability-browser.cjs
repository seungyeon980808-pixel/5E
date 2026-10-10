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
    const browser = await engine.launch(); const { context, page, errors } = await setup(browser);
    try {
      await page.evaluate(() => { window.__stability.hold = true; });
      await page.observeGraphSignal(() => window.__stability.requests.length === 1, undefined, undefined, async () => { await page.locator(ui + '[data-ai-send]').dblclick(); });
      await page.locator(ui + '[data-ai-workflow="image"]').click({ force: true });
      assert.equal(await page.locator(ui + '[data-ai-workflow="graph"]').getAttribute('aria-pressed'), 'true');
      await page.evaluate(() => window.__stability.release(0)); await complete(page, 1);
      const baseline = (await tabs(page)).flatMap(t => t.generated || []).find(g => g.graphResult);
      await page.evaluate(() => { window.__stability.hold = false; window.__stability.error = '429 Too Many Requests'; });
      await page.locator(ui + '[data-ai-comments-apply]').click(); await idle(page);
      assert.match(await page.locator(ui + '[data-ai-status]').textContent(), /한도/);
      assert.equal(await count(page), 1); assert.equal(await page.evaluate(() => window.__stability.requests.length), 2);
      assert.deepEqual((await tabs(page)).flatMap(t => t.generated || []).find(g => g.id === baseline.id)?.graphResult, baseline.graphResult);
      await page.evaluate(() => { window.__stability.error = null; window.__stability.hold = true; });
      await page.observeGraphSignal(() => window.__stability.requests.length === 3, undefined, undefined, async () => { await page.locator(ui + '[data-ai-comments-apply]').click(); });
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
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(output, name + '-stability.png') });
      results.push({ engine: name, duplicateSubmit: 'pass', runningModeChange: 'blocked', rateLimitPreservesPrior: 'pass', disconnectLateResponse: 'blocked', reloadNoResend: 'pass', pendingEditOwnerAndReload: 'pass', modelCalls: 0 });
    } finally { await context.close(); await browser.close(); }
  }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify(results));
})().catch(error => { console.error(error); process.exitCode = 1; });
