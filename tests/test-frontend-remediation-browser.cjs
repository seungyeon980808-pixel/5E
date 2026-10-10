const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const evidence = process.env.EVIDENCE_DIR || path.join(root, '.omo/evidence/codex-continuation-20261010/frontend-remediation-fixture');
const { fixtureContext, installAiMain } = require('./helpers/canonical-fixture-adapter.cjs');
const { mainModuleUrl } = require('./helpers/four-session-entry.cjs');
const crypto = require('node:crypto');
const { runtime } = fixtureContext(root);
let fixtureSerial = 0;
fs.mkdirSync(evidence, { recursive: true });
const seedSource = fs.readFileSync(path.join(__dirname, 'test-ai-batch-source-browser.cjs'), 'utf8');
const seed = seedSource.slice(seedSource.indexOf('function seedRequestWorkspaces('), seedSource.indexOf('async function requestBrowserFixture('));
async function fixture(t, full = false, { sourceOnly = false } = {}) {
  const caseEvidence = path.join(evidence, `fixture-${String(++fixtureSerial).padStart(3, '0')}`);
  fs.mkdirSync(caseEvidence, { recursive: true });
  const origin = 'https://fixture.test';
  const events = [], pageErrors = [], requests = [], failures = [];
  const resources = { browserClosed: false, contextClosed: false, origin, full, sourceOnly, test: t.name };
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--single-process', '--no-zygote', '--disable-gpu', '--allow-file-access-from-files'] });
  let context, page, resolveBoot, rejectBoot, bootFailure;
  const boot = new Promise((resolve, reject) => { resolveBoot = resolve; rejectBoot = reject; });
  boot.catch(() => {});
  const diagnostic = async (error = bootFailure) => {
    const actual = page && !page.isClosed() ? await page.evaluate(() => ({
      url: location.href, secureContext: isSecureContext, randomUUID: typeof crypto.randomUUID, subtle: typeof crypto.subtle,
      marker: window.__bootDone === true, observed: window.__frontendBoot,
      bodyClass: document.body?.className,
      dialogs: [...document.querySelectorAll('[role="dialog"],.modal-overlay')].filter(node => node.getClientRects().length).map(node => ({ id: node.id, className: node.className, text: node.textContent.slice(0, 1000) })),
    })).catch(cause => ({ diagnosticError: String(cause) })) : null;
    fs.writeFileSync(path.join(caseEvidence, 'boot-diagnostic.json'), JSON.stringify({ error: error ? String(error.stack || error) : null, actual, events, pageErrors, requests, failures }, null, 2));
  };
  t.after(async () => {
    try { await diagnostic(); }
    finally {
      try { if (context) { await context.close(); resources.contextClosed = true; } }
      finally { await browser.close(); resources.browserClosed = !browser.isConnected(); fs.writeFileSync(path.join(caseEvidence, 'cleanup.json'), JSON.stringify(resources, null, 2)); }
    }
    if (full) assert.deepEqual(pageErrors, [], 'Canonical full boot and scenario have no uncaught page errors');
  });
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await context.newPage();
  page.on('pageerror', error => { pageErrors.push(String(error.stack || error)); if (full) rejectBoot(error); });
  page.on('requestfailed', request => failures.push({ url: request.url(), failure: request.failure() }));
  page.on('response', response => requests.push({ url: response.url(), status: response.status() }));
  await page.exposeBinding('__frontendBootEvent', (_source, event) => {
    events.push(event);
    if (event.phase === 'canonical-complete') resolveBoot();
    if (event.phase === 'error' || event.phase === 'unhandledrejection' || event.phase === 'seed-error') rejectBoot(new Error(event.error));
  });
  await page.addInitScript(value => {
    window.__runtime = value;
    window.__frontendBoot = { phase: 'document-init', events: [] };
    window.__frontendRecord = event => {
      window.__frontendBoot.phase = event.phase;
      window.__frontendBoot.events.push(event);
      void window.__frontendBootEvent(event);
    };
    window.addEventListener('error', event => { if (event.error) window.__frontendRecord({ phase: 'error', error: String(event.error.stack || event.error) }); });
    window.addEventListener('unhandledrejection', event => window.__frontendRecord({ phase: 'unhandledrejection', error: String(event.reason?.stack || event.reason) }));
  }, { base: runtime.moduleBase, query: runtime.moduleQuery });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/fixture') return route.fulfill({ contentType: 'text/html', body: `<html><head><link rel="stylesheet" href="/css/style.css${runtime.moduleQuery}"><link rel="stylesheet" href="/css/unified-library.css${runtime.moduleQuery}"></head><body></body></html>` });
    let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
    if (!file.startsWith(root + path.sep)) return route.fulfill({ status: 403, body: '' });
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    let body = fs.readFileSync(file);
    if (full && url.pathname === runtime.entry) {
      const html = body.toString('utf8');
      const mainUrl = mainModuleUrl(html, new URL(runtime.entry, origin).href);
      assert.equal(new URL(mainUrl).pathname, runtime.moduleBase + 'main.js', 'Marker imports the actual canonical main');
      assert.equal(new URL(mainUrl).search, runtime.moduleQuery, 'Marker retains the entry query');
      assert.equal(html.split('</body>').length - 1, 1, 'Full entry boot observation occurs once');
      // This second import observes the same module instance after its real top-level await and complete initialization.
      body = html.replace('</body>', `<script type="module">import ${JSON.stringify(mainUrl)}; window.__bootDone = true; window.__frontendRecord({phase:'canonical-complete',main:${JSON.stringify(mainUrl)}});</script></body>`);
      fs.writeFileSync(path.join(caseEvidence, 'entry-observation.json'), JSON.stringify({ file, mainUrl, originalSHA256: crypto.createHash('sha256').update(html).digest('hex'), observedSHA256: crypto.createHash('sha256').update(body).digest('hex'), originalModuleRetained: true, autosaveAwaitRetained: true }, null, 2));
    }
    return route.fulfill({ body, contentType: ({ '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[path.extname(file)] || 'application/octet-stream' });
  });
  if (full) {
    await page.addInitScript({ content: seed + `
seedRequestWorkspaces(1, false, false, 'pro', false, false, ${JSON.stringify(sourceOnly)}); window.__frontendRecord({phase:'seed-start'}); window.__seedReady.then(()=>window.__frontendRecord({phase:'seed-complete'}),error=>window.__frontendRecord({phase:'seed-error',error:String(error?.stack || error)}));` });
    await installAiMain(page, root, { seedReady: true, manager: '__task2Manager', state: '__integrationState' }, caseEvidence);
  }
  let deadline;
  try {
    await page.goto(new URL(full ? runtime.entry : '/fixture', origin).href);
    if (full) {
      await Promise.race([boot, new Promise((_resolve, reject) => { deadline = setTimeout(() => reject(new Error('Actual canonical full boot deadline exceeded')), 30000); })]);
      assert.equal(await page.evaluate(() => window.__bootDone), true);
      const modules = [...new Set(requests.map(row => row.url).filter(url => new URL(url).pathname.endsWith('/main.js')))];
      assert.deepEqual(modules, [new URL(runtime.moduleBase + 'main.js' + runtime.moduleQuery, origin).href], 'Full boot consumes one canonical main instance');
    }
  } catch (error) {
    bootFailure = error;
    await diagnostic(error);
    await page.screenshot({ path: path.join(caseEvidence, 'boot-failure.png') }).catch(() => {});
    throw error;
  } finally { clearTimeout(deadline); }
  const welcome = page.locator('.tut-welcome-overlay .tut-banner-no');
  if (await welcome.isVisible()) await welcome.click();
  return page;
}
function record(name, value) { fs.writeFileSync(path.join(evidence, `${name}.json`), JSON.stringify(value, null, 2)); }
test('conversation quota failure preserves chat input and ends request without transport or timeout', async t => {
  // Given a connected workspace and a quota failure only at conversation persistence.
  // Chat is intentionally hidden on a selected scoped PNG. The existing
  // seed API supplies a genuine source-only tab, without changing candidate status.
  const page = await fixture(t, true, { sourceOnly: true });
  await page.locator('#ai-image-install-open').click();
  const owner = await page.evaluate(async () => {
    const snapshot = await window.__task2Manager.sharingSnapshot();
    const tabs = snapshot.workspaces.flatMap(workspace => workspace.tabs);
    const tab = tabs.find(tab => tab.id === 'task-0');
    return { tasks:tabs.length, generated:tab.generated.length, selected:tab.selectedCandidateId,
      references:tab.attachments.filter(item => item.kind === 'reference').length,
      explicit:tab.imageLabelWorkflow.explicit, boxEdit:document.querySelector('#ai-image-panel').dataset.aiBoxEdit,
      sends:window.__task2.sends.length };
  });
  record('quota-source-only-owner', owner);
  assert.equal(owner.tasks,1); assert.equal(owner.generated,0); assert.equal(owner.selected,null);
  assert.equal(owner.references,1); assert.equal(owner.explicit,true); assert.equal(owner.boxEdit,'false'); assert.equal(owner.sends,0);
  assert.equal(await page.locator('#ai-image-panel [data-ai-side-tab="chat"]').isVisible(),true);
  await page.screenshot({path:path.join(evidence,'quota-before.png')});
  await page.locator('#ai-image-panel [data-ai-side-tab="chat"]').click();
  const input = page.locator('#ai-image-panel [data-ai-chat-input]');
  await input.fill('보존할 대화 입력');
  await page.clock.install();
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key,value) { if(key.includes('aiConversationMessages')) throw new DOMException('quota', 'QuotaExceededError'); return original.call(this,key,value); }; });
  // When the user sends a chat message.
  await page.locator('#ai-image-panel [data-ai-chat-send]').click();
  await page.waitForFunction(() => document.querySelector('#ai-image-panel [data-ai-status]').textContent !== '연결 확인 중…');
  const result = await page.locator('#ai-image-panel').evaluate(panel => ({input:panel.querySelector('[data-ai-chat-input]').value,busy:panel.dataset.aiBusy,status:panel.querySelector('[data-ai-status]').textContent,sends:window.__task2.sends.length}));
  record('quota', result);
  // Then no request remains busy and the draft is available for retry.
  assert.equal(result.input, '보존할 대화 입력'); assert.equal(result.busy, 'false'); assert.equal(result.sends, 0); assert.match(result.status, /저장 공간/);
  await page.clock.fastForward(180000);
  const afterTimeout = await page.locator('#ai-image-panel [data-ai-status]').textContent();
  record('quota-after-timeout', {afterTimeout, sends:await page.evaluate(()=>window.__task2.sends.length)});
  assert.doesNotMatch(afterTimeout, /응답 시간이 초과/);
});
test('scrolling away from the edited crop page keeps the editable page image',async t=>{
 const page=await fixture(t);
 await page.evaluate(async()=>{
  document.body.innerHTML='<div id="stage" style="position:relative;height:400px;width:300px;overflow:auto"><div id="canvas"><img id="crop-image" alt=""></div></div>';
  const {createContinuousCropPages}=await import(window.__runtime.base + "library/continuous-crop-pages.js" + window.__runtime.query);
  const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"/>');
  window.pages=createContinuousCropPages({stage:document.querySelector('#stage'),canvas:document.querySelector('#canvas'),loadPage:async()=>image,onPage:async n=>window.pages.activate(n)});
  window.pages.mount(60,1,()=>({width:300,height:400}));window.pages.size(300,400);
 });
 await page.locator('.unilib-crop-page[data-page="1"] #canvas > #crop-image').waitFor({state:'attached'});
 await page.evaluate(()=>{document.querySelector('#stage').scrollTop=29*400;});
 await page.waitForFunction(()=>document.querySelector('.unilib-crop-page[data-page="30"]').contains(document.querySelector('#canvas')));
 const kept=await page.evaluate(()=>Boolean(document.querySelector('#canvas > #crop-image')));record('crop-active-canvas',{kept});assert.equal(kept,true);
});
for (const action of ['escape', 'outside', 'fresh']) test(`recovery ${action} keeps dismissal distinct from fresh start`, async t => {
  // Given the real boot recovery confirmation.
  const page = await fixture(t);
  await page.evaluate(async () => { const {showConfirm}=await import(window.__runtime.base + "ui-dialogs.js" + window.__runtime.query); window.choice='pending'; void showConfirm('복구할까요?',{title:'작업 복구',okText:'복구',cancelText:'새로 시작',dismissValue:'deferred'}).then(value=>window.choice=value); });
  // When dismissal or the explicit fresh action is selected.
  if(action==='escape') await page.keyboard.press('Escape');
  else if(action==='outside') await page.locator('.modal-overlay').dispatchEvent('mousedown');
  else await page.getByRole('button',{name:'새로 시작'}).click();
  const choice=await page.evaluate(()=>window.choice); record(`recovery-${action}`,{choice});
  // Then dismissal cannot be confused with explicit fresh start.
  assert.equal(choice,action==='fresh'?false:'deferred');
});
test('twenty closed dialogs retain no global drag listeners', async t => {
  const page=await fixture(t);
  await page.locator('body').dispatchEvent('mousedown', {button:0});
  await page.evaluate(async()=>{
    window.dragListeners=new Set(); const add=window.addEventListener.bind(window), remove=window.removeEventListener.bind(window);
    window.addEventListener=(type,listener,options)=>{if(['mousemove','mouseup'].includes(type)) window.dragListeners.add(listener); return add(type,listener,options);};
    window.removeEventListener=(type,listener,options)=>{window.dragListeners.delete(listener);return remove(type,listener,options);};
    const {initModalDrag}=await import(window.__runtime.base + "modal-drag.js" + window.__runtime.query); initModalDrag();
    window.dialogs=await import(window.__runtime.base + "ui-dialogs.js" + window.__runtime.query);
  });
  // When repeated transient dialogs open and close.
  for(let i=0;i<20;i++) { await page.evaluate(()=>{void window.dialogs.showAlert('test');}); await page.locator('.modal-drag-handle').waitFor(); await page.locator('.modal-drag-handle').dispatchEvent('mousedown',{button:0,clientX:10,clientY:10}); await page.getByRole('button',{name:'확인',exact:true}).dispatchEvent('click'); }
  const retained=await page.evaluate(()=>({listeners:window.dragListeners.size,callbacks:[...window.dragListeners].map(fn=>String(fn)),overlays:document.querySelectorAll('.modal-overlay').length}));record('modal-retention',retained);
  assert.equal(retained.listeners,0);assert.equal(retained.overlays,0);
});
test('sixty crop pages evict decoded images without changing page geometry and reload on return', async t=>{
  const page=await fixture(t);
  await page.evaluate(async()=>{
    document.body.innerHTML='<div id="stage" style="position:relative;height:400px;width:300px;overflow:auto"><div id="canvas"></div></div>';
    const {createContinuousCropPages}=await import(window.__runtime.base + "library/continuous-crop-pages.js" + window.__runtime.query);
    window.loads=[]; window.pages=createContinuousCropPages({stage:document.querySelector('#stage'),canvas:document.querySelector('#canvas'),loadPage:async n=>{window.loads.push(n);return 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"/>');},onPage:async n=>window.pages.activate(n)});
    window.pages.mount(60,1,()=>({width:300,height:400}));window.pages.size(300,400);
    // Observe actual preview decoding/registration. The module deliberately
    // skips active page 1 because the caller owns its editable canvas.
    window.waitCropPreview = number => new Promise((resolve,reject) => {
      let timer; const stage=document.querySelector('#stage');
      const ready=()=>{
        const slot=stage.querySelector(`.unilib-crop-page[data-page="${number}"]`);
        const image=slot?.querySelector(':scope > img');
        if(slot?.dataset.loaded!=='ready' || !image?.complete || !image.naturalWidth)return;
        observer.disconnect();clearTimeout(timer);resolve({number,loaded:slot.dataset.loaded,width:image.naturalWidth,height:image.naturalHeight});
      };
      const observer=new MutationObserver(ready);observer.observe(stage,{subtree:true,childList:true,attributes:true,attributeFilter:['data-loaded','src']});
      timer=setTimeout(()=>{observer.disconnect();reject(new Error(`Actual crop preview ${number} decode/registration deadline`));},30000);ready();
    });
  });
  await page.evaluate(()=>window.waitCropPreview(2));
  const initialOwner=await page.evaluate(()=>({
    rows:document.querySelectorAll('.unilib-crop-page').length,
    canvasPage:document.querySelector('#canvas').parentElement.dataset.page,
    active:document.querySelector('.unilib-crop-page[data-page="1"]').classList.contains('is-active'),
    previews:document.querySelectorAll('.unilib-crop-page[data-page="1"] > img').length,
    loads:window.loads.filter(number=>number===1).length,
  }));
  record('crop-initial-caller-owner',initialOwner);
  assert.equal(initialOwner.rows,60); assert.equal(initialOwner.canvasPage,'1'); assert.equal(initialOwner.active,true);
  assert.equal(initialOwner.previews,0); assert.equal(initialOwner.loads,0,'Continuous previews never materialize the caller-owned initial page');
  const heights=await page.locator('.unilib-crop-page').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
  for(let n=1;n<=60;n+=4){
    await page.evaluate(n=>{document.querySelector('#stage').scrollTop=(n-1)*400;},n);
    if(n===1) {
      // Page 1's real owner is already mounted. Do not wait for a preview
      // image that this component explicitly excludes from loadPage.
      assert.equal(await page.locator('.unilib-crop-page[data-page="1"] #canvas').count(),1);
    } else {
      const decoded=await page.evaluate(n=>window.waitCropPreview(n),n);
      assert.equal(decoded.number,n);assert.equal(decoded.width,300);assert.equal(decoded.height,400);
    }
  }
  const result=await page.evaluate(()=>({images:document.querySelectorAll('.unilib-crop-page img').length,heights:[...document.querySelectorAll('.unilib-crop-page')].map(n=>n.getBoundingClientRect().height),loads:window.loads}));record('crop-window',result);
  assert.ok(result.images<=9,`retained ${result.images} images`);assert.deepEqual(result.heights,heights);
  await page.evaluate(()=>{document.querySelector('#stage').scrollTop=0;});
  await page.evaluate(()=>window.waitCropPreview(1));
  assert.equal(await page.evaluate(()=>window.loads.filter(n=>n===1).length),2,'The evicted page 1 preview must really reload exactly once on return');
  record('crop-return',{loads:await page.evaluate(()=>window.loads)});
});
test('browser zoom remains available outside canvas and is prevented inside canvas',async t=>{
 const page=await fixture(t,true);await page.locator('#canvas').waitFor();
 const result=await page.evaluate(()=>{const probe=(target,type,properties)=>{const e=type==='wheel'?new WheelEvent(type,{bubbles:true,cancelable:true,...properties}):new KeyboardEvent(type,{bubbles:true,cancelable:true,...properties});target.dispatchEvent(e);return e.defaultPrevented;};return ['ctrlKey','metaKey'].flatMap(mod=>[['wheel',''],...['+','-','=','0'].map(key=>['keydown',key])].map(([type,key])=>({mod,type,key,outside:probe(document.body,type,{[mod]:true,key}),inside:probe(document.querySelector('#canvas'),type,{[mod]:true,key})})));});record('zoom',result);
 for(const entry of result){assert.equal(entry.outside,false);assert.equal(entry.inside,true);}
});
test('GPT account badge remains visible without overlapping header buttons at 390px',async t=>{
 const page=await fixture(t,true);await page.evaluate(async()=>{if(!document.querySelector('.web-account-status')) { window.fiveEWebAI={status:async()=>({login:{loggedIn:false}})}; const {initWebLoginUi}=await import(window.__runtime.base + "web-login-ui.js" + window.__runtime.query);initWebLoginUi({openAi:()=>{}}); }});await page.setViewportSize({width:390,height:844});await page.locator('.web-account-status').waitFor({state:'attached'});
 await page.screenshot({path:path.join(evidence,'gpt-390.png')});
 const result=await page.locator('.web-account-status').evaluate(el=>{const r=el.getBoundingClientRect();return {width:r.width,x:r.x,right:r.right,visible:!!el.getClientRects().length,overlaps:[...document.querySelectorAll('.app-shell-header button')].filter(b=>b!==el&&b.getClientRects().length).filter(b=>{const s=b.getBoundingClientRect();return s.left<r.right&&s.right>r.left&&s.top<r.bottom&&s.bottom>r.top;}).map(b=>b.id)};});record('gpt-390',result);assert.ok(result.visible&&result.width>0&&result.x>=0&&result.right<=390);assert.deepEqual(result.overlaps,[]);
});

test('keyboard creates first crop then moves and resizes it with an announcement',async t=>{
 const page=await fixture(t);
    await page.evaluate(async () => {
      const { createUnifiedLibraryUi } = await import(window.__runtime.base + "unified-library-ui.js" + window.__runtime.query);
      const image = (number) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="white"/><text x="80" y="400" font-size="150">${number}</text></svg>`)}`;
      const file = {
        id: "book", kind: "pdf", title: "Test book", pageCount: 3, sourceId: "source",
        sourceLabel: "Test book", documentId: "book",
        provenance: { provider: "pdf", documentId: "book", pageNumber: 1 },
        loadPreview: async (number, options = {}) => {
          if (options.thumbnail && window.thumbnailDelay?.number === number) await window.thumbnailDelay.promise;
          if (options.continuous && window.failContinuousPage === number) throw new Error('temporary page failure');
          if ((options.original || options.continuous) && window.pageDelay?.number === number) await window.pageDelay.promise;
          return ({
          dataUrl: image(number), provenance: { documentId: "book", pageNumber: number },
          result: { id: `page-${number}`, kind: "page", provenance: { provider: "pdf", documentId: "book", pageNumber: number } },
          });
        },
      };
      window.pageScrollFile = file;
      window.setPageDelay = (number) => {
        let release;
        const promise = new Promise((resolve) => { release = resolve; });
        window.pageDelay = { number, promise, release };
      };
      const question = {
        id: "question-1", kind: "crop", title: "Test question", sourceId: "source",
        provenance: { provider: "pdf", documentId: "book", pageNumber: 1, rect: [0.1, 0.1, 0.6, 0.6] },
      };
      const provider = {
        revision: "page-scroll-test",
        getSources: () => [], getExamFilterOptions: () => ({ academicYears: [] }),
        search: ({ kinds } = {}) => kinds?.includes("crop") ? [question] : [], listPdfFiles: () => [file],
        searchPdfFiles: async () => [{ ...file, firstMatchingPage: 2, matches: [{ pageNumber: 2, source: { documentId: "book", pageNumber: 2 } }] }],
        materialize: async (result) => ({ dataUrl: image(result.provenance.pageNumber), provenance: result.provenance }),
      };
      window.pageScrollFixture = createUnifiedLibraryUi({ getProvider: async () => provider, insertMaterialized: async () => {} });
      await window.pageScrollFixture.open();
    });

 const ui=page.locator('.unified-library-overlay').last();
 await ui.locator('[data-unilib-type="pdf"]').click();
 await ui.locator('[data-unilib-stage][data-visible-pdf-page="1"]').waitFor();
 await ui.locator('[data-unilib-adjust]').focus();await page.keyboard.press('Enter');
 await ui.locator('[data-unilib-crop-load-state]').waitFor({state:'hidden'});
 const stage=ui.locator('[data-unilib-crop-stage]');await stage.focus();
 const box=ui.locator('[data-unilib-crop-box]');
 await page.keyboard.press('Enter');
 const created=await box.boundingBox();record('keyboard-created',{created});assert.ok(created&&created.width>0&&created.height>0);
 await page.keyboard.press('ArrowRight');const moved=await box.boundingBox();assert.ok(moved.x>created.x);assert.equal(moved.width,created.width);
 await page.keyboard.press('Shift+ArrowDown');const resized=await box.boundingBox();assert.ok(resized.height>moved.height);
 const announcement=await ui.locator('[data-unilib-crop-selection]').textContent();assert.ok(announcement.length>0);assert.equal(await ui.locator('[data-unilib-crop-selection]').getAttribute('aria-live'),'polite');
 await page.screenshot({path:path.join(evidence,'keyboard-crop.png')});record('keyboard-crop',{created,moved,resized,announcement});
 await ui.locator('[data-unilib-crop-save]:not([disabled])').waitFor();
 await page.keyboard.press('Enter');
 await ui.locator('[data-unilib-crop-count]').filter({hasText:'1개'}).waitFor();
 await stage.focus();await page.keyboard.press('Enter');
 const finished=await page.evaluate(()=>document.activeElement?.hasAttribute('data-unilib-crop-workbench'));
 assert.equal(finished,true,'Enter after an accepted crop finishes the selection');assert.equal(await box.boundingBox(),null);
 await stage.focus();await page.keyboard.press('Shift+Enter');
 const second=await box.boundingBox();record('keyboard-crop-next',{finished,second});assert.ok(second&&second.width>0&&second.height>0);
});

for (const action of ['escape','outside','fresh']) test(`autosave boot ${action} preserves snapshots and reports the exact recovery choice`,async t=>{
 const page=await fixture(t);
 await page.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('5e-preview-autosave',1);r.onupgradeneeded=()=>{r.result.createObjectStore('snapshots',{keyPath:'id',autoIncrement:true});r.result.createObjectStore('checkpoints',{keyPath:'id',autoIncrement:true});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise((resolve,reject)=>{const tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put({id:1,ts:Date.now(),data:{pages:[{id:'saved',name:'saved',objects:[{id:'kept',type:'rect',x:0,y:0,w:10,h:10}]}],activePageId:'saved'}});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');const {initAutosave}=await import('/js/autosave.js?v=1.7.0-four-session-integration');window.bootState=state;window.bootRecovery='pending';void initAutosave(state).then(choice=>window.bootRecovery=choice);
 });
 await page.getByRole('button',{name:'새로 시작'}).waitFor();
 if(action==='escape')await page.keyboard.press('Escape');else if(action==='outside')await page.locator('.modal-overlay').dispatchEvent('mousedown');else await page.getByRole('button',{name:'새로 시작'}).click();
 await page.waitForFunction(()=>window.bootRecovery!=='pending');
 const result=await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('5e-preview-autosave',1);r.onsuccess=()=>resolve(r.result);});const snapshots=await new Promise(resolve=>{const r=db.transaction('snapshots').objectStore('snapshots').getAll();r.onsuccess=()=>resolve(r.result);});db.close();return {choice:window.bootRecovery,restored:window.bootState.get().objects.some(o=>o.id==='kept'),snapshots};});record(`autosave-${action}`,result);assert.equal(result.choice,action==='fresh'?'fresh':'deferred');assert.equal(result.restored,false);assert.equal(result.snapshots.length,1);assert.equal(result.snapshots[0].data.pages[0].objects[0].id,'kept');
});

test('dismissing checkpoint chooser defers recovery',async t=>{
 const page=await fixture(t);
 await page.evaluate(async()=>{const {showRecoveryCheckpointDialog}=await import(window.__runtime.base + "ui-dialogs.js" + window.__runtime.query);window.checkpointChoice='pending';void showRecoveryCheckpointDialog([{id:1,source:'preview',ts:Date.now(),pageCount:1}]).then(value=>window.checkpointChoice=value);});
 await page.keyboard.press('Escape');const choice=await page.evaluate(()=>window.checkpointChoice);record('checkpoint-deferred',{choice});assert.equal(choice,'deferred');
});

test('evicted crop pages ignore obsolete in-flight image results',async t=>{
 const page=await fixture(t);
 await page.evaluate(async()=>{
  document.body.innerHTML='<div id="stage" style="position:relative;height:400px;width:300px;overflow:auto"><div id="canvas"></div></div>';
  const {createContinuousCropPages}=await import(window.__runtime.base + "library/continuous-crop-pages.js" + window.__runtime.query);
  window.loads=[];const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"/>');
  window.pages=createContinuousCropPages({stage:document.querySelector('#stage'),canvas:document.querySelector('#canvas'),loadPage:async n=>{window.loads.push(n);if(n===2&&window.loads.filter(p=>p===2).length===1)await new Promise(resolve=>window.releasePage=resolve);return image;},onPage:async n=>window.pages.activate(n)});
  window.pages.mount(60,1,()=>({width:300,height:400}));window.pages.size(300,400);
 });
 await page.waitForFunction(()=>window.releasePage);
 await page.evaluate(()=>{document.querySelector('#stage').scrollTop=59*400;});
 await page.waitForFunction(()=>document.querySelector('.unilib-crop-page[data-page="60"] img')?.complete);
 await page.evaluate(async()=>{window.releasePage();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
 const result=await page.evaluate(()=>({obsoleteImages:document.querySelectorAll('.unilib-crop-page[data-page="2"] img').length,totalImages:document.querySelectorAll('.unilib-crop-page img').length}));record('crop-inflight',result);assert.equal(result.obsoleteImages,0);assert.ok(result.totalImages<=9);
 await page.evaluate(()=>{document.querySelector('#stage').scrollTop=400;});await page.waitForFunction(()=>document.querySelector('.unilib-crop-page[data-page="2"] img')?.complete);
 assert.equal(await page.evaluate(()=>window.loads.filter(p=>p===2).length),2);
});
