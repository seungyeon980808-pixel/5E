const { classifyAll } = require('./workbench-assignment.cjs');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const {entryConfiguration,mainModuleUrl,runtimeConfiguration,assertLoadedRuntime}=require('./four-session-entry.cjs');

function installAnonymousBridge({ connected = false } = {}) {
  localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
  const saved = sessionStorage.getItem('login-resume-fixture:connected');
  let loggedIn = saved === null ? connected : saved === 'true';
  const calls = { login: 0, cancel: 0, send: 0, status: 0 };
  const status = async () => { calls.status += 1; return { login: { loggedIn }, server: loggedIn }; };
  const listeners = new Set();
  const bridge = {
    web: true, status, start: async () => ({ ok: loggedIn }), stop: async () => ({ ok: true }),
    models: async () => ({ data: [{ model: 'gpt-6.1-sol', displayName: 'Sol 6.1', isDefault: true,
      defaultReasoningEffort: 'high', supportedReasoningEfforts: ['medium', 'high'], serviceTiers: ['priority'] }] }),
    account: async () => ({ rateLimits: {} }), login: async () => window.dispatchEvent(new Event('5e:web-login-request')),
    send: async () => { calls.send += 1; throw new Error('This regression must never submit a paid AI request'); },
    interrupt: async () => ({ ok: true }), onEvent: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    onState: () => () => {}, onLog: () => () => {}, setAiTaskShortcutActive() {}, onAiCloseTaskShortcut: () => () => {},
  };
  window.fiveEDesktop = bridge;
  window.fiveEWebAI = bridge;
  window.fiveEWebLogin = () => {
    calls.login += 1;
    window.dispatchEvent(new CustomEvent('5e:web-login-progress', { detail: { state: 'ready', userCode: 'QA-CODE' } }));
  };
  window.fiveEWebContinueLogin = () => window.dispatchEvent(new CustomEvent('5e:web-login-progress', { detail: { state: 'authenticating' } }));
  window.fiveEWebCancelLogin = () => { calls.cancel += 1; };
  window.loginResumeFixture = {
    calls,
    connect(value = true) {
      loggedIn = value;
      sessionStorage.setItem('login-resume-fixture:connected', String(value));
      window.dispatchEvent(new Event('5e:web-ai-status'));
    },
    duplicateStatus() { window.dispatchEvent(new Event('5e:web-ai-status')); },
  };
}

async function waitForDom(page,predicate,arg) {
  return page.evaluate(({source,arg})=>new Promise((resolve,reject)=>{
    const predicate=(0,eval)('('+source+')');
    const observer=new MutationObserver(check);
    const timer=setTimeout(()=>{cleanup();reject(new Error('Expected login/library state did not arrive'));},10000);
    function cleanup(){clearTimeout(timer);observer.disconnect();document.removeEventListener('load',check,true);window.removeEventListener('qa:login-app-ready',check);}
    function check(){if(predicate(arg)){cleanup();resolve();}}
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});
    document.addEventListener('load',check,true);window.addEventListener('qa:login-app-ready',check);check();
  }),{source:predicate.toString(),arg});
}
async function installApp(page,preview,options={}) {
  await page.addInitScript(installAnonymousBridge,options);
  const config=entryConfiguration(),entryUrl=new URL(config.entry,preview).href;
  const html=fs.readFileSync(path.join(root,config.entry==='/'?'index.html':'preview/index.html'),'utf8');
  const source=fs.readFileSync(path.join(root,'js/main.js'),'utf8');
  const runtime=runtimeConfiguration(config,entryUrl,mainModuleUrl(html,entryUrl),source),loaded=[];
  page.on('response',response=>loaded.push(response.url()));
  await page.route(runtime.mainUrl,route=>route.fulfill({contentType:'text/javascript',body:source+'\nwindow.loginResumeApp = { state, aiPanel, webLogin, openAiWithReference, openIndependentAiReferences }; window.dispatchEvent(new Event("qa:login-app-ready"));\n'}));
  await page.goto(entryUrl+'?mode=pro',{waitUntil:'domcontentloaded'});
  await waitForDom(page,()=>Boolean(window.loginResumeApp));
  assertLoadedRuntime(runtime,loaded);
}

async function openCropLibrary(page) {
  await page.evaluate(async () => {
    const { createUnifiedLibraryUi } = await import('/js/unified-library-ui.js?v=1.7.0-four-session-integration');
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 800;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 600, 800);
    for (let row = 0; row < 8; row++) {
      ctx.fillStyle = row % 2 ? '#d90e38' : '#1665aa'; ctx.fillRect(50, 40 + row * 90, 490, 50);
      ctx.fillStyle = 'black'; ctx.font = '28px sans-serif'; ctx.fillText(`원본 ${row + 1}`, 100, 75 + row * 90);
    }
    const dataUrl = canvas.toDataURL('image/png');
    window.loginResumeOriginal = dataUrl;
    const file = {
      id: 'resume-book', kind: 'pdf', title: '로그인 복귀 검증', pageCount: 1, documentId: 'resume-book', sourceId: 'source',
      provenance: { provider: 'pdf', documentId: 'resume-book', pageNumber: 1 },
      getPageGeometry: () => ({ width: 600, height: 800 }),
      loadPreview: async () => ({ dataUrl, provenance: { provider: 'pdf', documentId: 'resume-book', pageNumber: 1 },
        result: { id: 'resume-page', kind: 'page', provenance: { provider: 'pdf', documentId: 'resume-book', pageNumber: 1 } } }),
    };
    const provider = { revision: 'login-resume-test', getSources: () => [], getExamFilterOptions: () => ({ academicYears: [] }),
      search: () => [], listPdfFiles: () => [file], materialize: async (result, options = {}) => {
        const source = options.representation === 'manual' ? result.variants?.manual?.source : result.provenance;
        const rect = options.original ? null : source?.rect;
        if (!rect) return file.loadPreview();
        const [x, y, w, h] = rect;
        const cropped = document.createElement('canvas');
        cropped.width = Math.max(1, Math.round(w * canvas.width)); cropped.height = Math.max(1, Math.round(h * canvas.height));
        cropped.getContext('2d').drawImage(canvas, x * canvas.width, y * canvas.height, w * canvas.width, h * canvas.height, 0, 0, cropped.width, cropped.height);
        return { dataUrl: cropped.toDataURL('image/png'), provenance: { ...result.provenance, ...source } };
      } };
    window.loginResumeSent = [];
    window.loginResumeLibrary = createUnifiedLibraryUi({ getProvider: async () => provider, insertMaterialized: async () => {},
      openIndependentReferences: options => {
        const { isCurrent, ...snapshot } = options;
        window.loginResumeSent.push(structuredClone(snapshot));
        return window.loginResumeApp.openIndependentAiReferences(options);
      } });
    await window.loginResumeLibrary.open();
  });
  const library = page.locator('.unified-library-overlay').last();
  await library.locator('[data-unilib-type="pdf"]').click();
  await library.locator('[data-result-id="resume-book:page:1"]').click();
  await library.locator('[data-unilib-adjust]').click();
  await library.locator('[data-unilib-crop-load-state]').waitFor({ state: 'hidden' });
  return library;
}

async function cropReferences(page, library, count = 1) {
  const image = await library.locator('[data-unilib-crop-image]').boundingBox();
  const stage = await library.locator('[data-unilib-crop-stage]').boundingBox();
  const visible = { left: Math.max(image.x, stage.x + 3), top: Math.max(image.y, stage.y + 3),
    right: Math.min(image.x + image.width, stage.x + stage.width - 3), bottom: Math.min(image.y + image.height, stage.y + stage.height - 3) };
  for (let index = 0; index < count; index++) {
    const x = visible.left + (visible.right - visible.left) * .12;
    const y = visible.top + (visible.bottom - visible.top) * (.08 + index * .28);
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + (visible.right - visible.left) * .65, y + (visible.bottom - visible.top) * .2, { steps: 6 });
    await page.mouse.up();
    await library.locator('[data-unilib-crop-save]').click();
  }
  await library.locator('[data-unilib-crop-workbench]').click();
  await library.locator('[data-unilib-crop]').waitFor({ state: 'hidden' });
}

async function sendLibrary(page, library, { count = 1, placement = 'separate', conversionKind = 'image' } = {}) {
  await library.locator('[data-unilib-ai]').click();
  {
    const assignment = library.locator('.workbench-assignment-overlay');
    await classifyAll(assignment, conversionKind, placement);
    await assignment.locator('[data-action="continue"]').click();
  }
}

async function workspaces(page) {
  return page.evaluate(async () => {
    const snapshot = await window.loginResumeApp.aiPanel.sharingSnapshot();
    return snapshot.workspaces.map(workspace => workspace.tabs.filter(tab => tab.attachments?.length)
      .map(tab => ({ title: tab.title, attachments: tab.attachments.map(item => ({ name: item.name, data: item.data, source: item.source })) })))
      .filter(workspace => workspace.length);
  });
}

async function beginMotionSamples(page) {
  await page.evaluate(() => {
    const samples = []; window.loginResumeMotion = { samples, active: true };
    const frame = () => {
      if (!window.loginResumeMotion.active) return;
      const shown = selector => [...document.querySelectorAll(selector)].some(el => {
        const style = getComputedStyle(el), box = el.getBoundingClientRect();
        return !el.hidden && !el.closest('[hidden]') && style.display !== 'none' && style.visibility !== 'hidden'
          && Number(style.opacity) > .01 && box.width > 0 && box.height > 0;
      });
      samples.push({ time: performance.now(), library: shown('.unified-library-overlay'),
        login: shown('.web-login-dialog[open]'), ai: shown('.modal-overlay:has([data-ai-tabs])') });
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

async function stopMotionSamples(page) {
  return page.evaluate(() => { window.loginResumeMotion.active = false; return window.loginResumeMotion.samples; });
}

module.exports = { waitForDom, installApp, openCropLibrary, cropReferences, sendLibrary, workspaces, beginMotionSamples, stopMotionSamples };
