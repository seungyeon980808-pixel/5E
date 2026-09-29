const assert=require('node:assert/strict'),fs=require('fs');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const FIXTURE = require('node:path').resolve('tests/fixtures/rights-clear-smoke.png');
const FIXTURE_DATA_URL='data:image/png;base64,'+fs.readFileSync(FIXTURE).toString('base64');
async function installTransport(context, { loggedIn, controlled } = {}) {
  const state = { sends: [], delivered: new Set() };
  await context.addInitScript((auth) => {
    window.showSaveFilePicker = undefined;
    localStorage.setItem('5e.tutorial.bannerSeen', 'true');
    localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
    localStorage.setItem('5e.preview:5e.desktopHandoff.v1', JSON.stringify({ dismissed: true, remindUntil: 0, installStarted: false }));
    if (auth) sessionStorage.setItem('5e:web-ai-session', 'f'.repeat(64));
    else sessionStorage.removeItem('5e:web-ai-session');
  }, Boolean(loggedIn));
  if (!controlled && loggedIn !== false) return state;
  await context.route('**/api/**', async route => {
    const action = new URL(route.request().url()).pathname.split('/').pop();
    let request = {};
    try { request = route.request().postDataJSON() || {}; } catch { /* GET or empty body */ }
    let result;
    if (action === 'bridge-status') result = { login: { loggedIn: Boolean(loggedIn) }, server: true };
    if (action === 'bridge-models') result = { data: [{ model: 'gpt-5.6-sol', displayName: 'Controlled QA', supportedReasoningEfforts: ['medium', 'high'], defaultReasoningEffort: 'medium', serviceTiers: ['priority'], defaultServiceTier: 'priority' }] };
    if (action === 'bridge-account') result = { account: { name: 'Controlled QA' }, limits: {} };
    if (action === 'bridge-send') {
      state.sends.push(request);
      result = loggedIn ? { turnId: `lite-qa-${state.sends.length}`, renderThreadId: `lite-render-${state.sends.length}` } : { error: 'login_required' };
    }
    if (action === 'bridge-events') {
      const index = state.sends.length;
      const events = [];
      if (controlled && index && !state.delivered.has(index)) {
        state.delivered.add(index);
        const clientScope = state.sends.at(-1).clientScope || '';
        events.push(
          { clientScope, method: 'item/completed', params: { turnId: `lite-qa-${index}`, item: { type: 'imageGeneration', imageDataUrl: FIXTURE_DATA_URL } } },
          { clientScope, method: 'turn/completed', params: { turn: { id: `lite-qa-${index}`, status: 'completed' } } },
        );
      }
      result = { cursor: state.delivered.size, events };
    }
    if (action === 'bridge-interrupt') result = { ok: true };
    if (result === undefined) return route.continue();
    await route.fulfill({ json: result });
  });
  return state;
}



const dir=process.env.EVIDENCE_DIR || '/private/tmp/lite-main-qa';
fs.mkdirSync(dir,{recursive:true});
(async()=>{const report=[];for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
const b=await engine.launch();try{const c=await b.newContext({viewport:{width:1440,height:960}});await installTransport(c,{loggedIn:true,controlled:true});const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto('http://127.0.0.1:8798/preview/?mode=lite&mobile=0');await p.locator('#lite-save').waitFor();await p.waitForTimeout(600);
assert.equal(await p.locator('#ai-image-panel').isVisible(),false);
for(const w of [375,768,1440]){await p.setViewportSize({width:w,height:960});await p.waitForTimeout(400);const r=await p.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};return {left:rect('#panel-left'),center:rect('.panel-center'),right:rect('#panel-right'),brand:rect('.lite-brand-slot'),save:rect('.lite-save-slot'),undo:rect('#undo-btn'),hint:rect('.lite-hint-shell'),canvasParent:document.querySelector('#canvas').closest('.panel-center').parentElement.className,overflow:document.documentElement.scrollWidth>innerWidth};});assert.equal(r.left.x,r.brand.x);assert.equal(r.left.w,r.brand.w);assert.equal(r.right.x,r.save.x);assert.equal(r.right.w,r.save.w);assert.ok(r.undo.x>=r.left.x&&r.undo.x<r.center.x);assert.ok(r.hint.x>=r.center.x&&r.hint.x<r.right.x);assert.equal(r.canvasParent,'app');assert.equal(r.overflow,false);await p.screenshot({path:`${dir}/${name}-main-${w}.png`});report.push({name,w,r});}
assert.deepEqual((await p.locator('.lite-quick-actions button').allTextContents()).map(text=>text.trim()),['좌표·함수','라이브러리','AI 이미지 변환']);
await p.getByRole('button',{name:'기능 안내 숨기기'}).click();assert.equal(await p.locator('.lite-hint-shell').getAttribute('class'),'lite-hint-shell lite-main-only is-hidden');await p.getByRole('button',{name:'기능 안내 보기'}).click();assert.equal(await p.locator('.lite-hint-shell').getAttribute('class'),'lite-hint-shell lite-main-only');
await p.locator('#tool-list [data-tool="L"]').click();await p.mouse.click(600,410);await p.mouse.click(780,530);await p.keyboard.press('Escape');
const snapshot=()=>p.evaluate(async()=>{const {state}=await import('./js/state.js?v=1.7.0-preview-0930');return JSON.parse(JSON.stringify(state.get().objects));});assert.equal((await snapshot()).length,1);await p.locator('#undo-btn').click();assert.equal((await snapshot()).length,0);await p.locator('#redo-btn').click();assert.equal((await snapshot()).length,1);
await p.locator('#lite-graph-open').click();await p.waitForTimeout(350);await p.screenshot({path:`${dir}/${name}-graph.png`});await p.keyboard.press('Escape');
await p.locator('#ai-image-install-open').click();await p.locator('#ai-image-panel').waitFor({state:'visible'});await p.screenshot({path:`${dir}/${name}-ai-empty.png`});
await p.locator('#ai-image-panel input[data-ai-source-file]').setInputFiles(FIXTURE);await p.locator('#ai-image-panel [data-ai-reference-id]').first().waitFor();
await p.locator('#ai-image-panel [data-ai-send]').click();await p.locator('#ai-image-panel .ai-generated-card').first().waitFor({timeout:45000});await p.screenshot({path:`${dir}/${name}-ai-result.png`});
await p.locator('#ai-image-panel [data-ai-insert-selected]:not([disabled])').click();await p.locator('#ai-image-panel').waitFor({state:'hidden',timeout:45000});assert.ok((await snapshot()).length>1);await p.screenshot({path:`${dir}/${name}-result-canvas.png`});
await p.locator('#lite-save').click();await p.waitForTimeout(300);await p.screenshot({path:`${dir}/${name}-save.png`});await p.keyboard.press('Escape');
const before=await snapshot();await p.locator('#mode-toggle-btn').click();await p.getByRole('button',{name:'유지하고 전환',exact:true}).click();await p.waitForFunction(()=>!document.getElementById('mode-toggle-btn').disabled);assert.equal(await p.locator('html').getAttribute('data-mode'),'pro');assert.deepEqual(await snapshot(),before);assert.equal(await p.locator('.toolbar-history #undo-btn').count(),1);assert.equal(await p.locator('.canvas-bottom-bar #exam-library-open').count(),1);assert.equal(await p.locator('.canvas-bottom-bar #ai-image-install-open').count(),1);assert.equal(await p.locator('.canvas-bottom-bar #tool-hint').count(),1);await p.screenshot({path:`${dir}/${name}-pro.png`});
await p.locator('#mode-toggle-btn').click();await p.getByRole('button',{name:'유지하고 전환',exact:true}).click();await p.waitForFunction(()=>!document.getElementById('mode-toggle-btn').disabled);assert.deepEqual(await snapshot(),before);assert.equal(await p.locator('#ai-image-panel').isVisible(),false);assert.deepEqual(errors,[]);report.push({name,passed:true,errors});console.log(name,'PASS');}finally{await b.close();}}
fs.writeFileSync(`${dir}/results.json`,JSON.stringify(report,null,2));})().catch(e=>{console.error(e);process.exit(1)});
