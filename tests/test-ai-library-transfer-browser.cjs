const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const test = require('node:test');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { installCropFixture, pointerOnImage } = require('./helpers/crop-loading-fixture.cjs');
const root = path.resolve(__dirname, '..');
async function fixture(t) {
  const server = http.createServer((req, res) => {
    let file = path.join(root, new URL(req.url, 'http://localhost').pathname);
    if (file.endsWith('/')) file += 'index.html';
    fs.readFile(file, (err, body) => { res.writeHead(err ? 404 : 200, { 'Content-Type': ({'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream' }); res.end(err ? '' : body); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => console.error(error.message));
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  process.env.PREVIEW_URL = origin + '/preview/';
  t.after(async () => {
    if (process.env.EVIDENCE_DIR) {
      fs.mkdirSync(process.env.EVIDENCE_DIR, {recursive:true});
      await page.screenshot({path:path.join(process.env.EVIDENCE_DIR, t.name.replace(/[^a-z0-9]+/gi,'-') + '.png')});
    }
    await browser.close(); await new Promise(resolve => server.close(resolve));
  });
  return { page, origin };
}
async function crop(page, ui, fraction = .25) {
  const { point } = await pointerOnImage(page, ui, fraction);
  await page.mouse.down(); await page.mouse.move(point.x + 80, point.y + 90, { steps: 5 }); await page.mouse.up();
  await ui.locator('[data-unilib-crop-save]').click();
}
async function library(t, count = 1) {
  const { page } = await fixture(t);
  await page.route('**/preview/js/unified-library-ui.js*', route => {
    const source = fs.readFileSync(path.join(root, 'preview/js/unified-library-ui.js'), 'utf8');
    return route.fulfill({contentType:'text/javascript',body:source.replace('const acceptedAssets = new Map();', 'const acceptedAssets = new Map(); window.__acceptedAssets = acceptedAssets; openIndependentReferences = (...args) => window.__transfer(...args);')});
  });
  const ui = await installCropFixture(page);
  await page.evaluate(() => { window.__transfer = async () => {
    window.__transferStarted = true;
    if (window.__transferGate) await window.__transferGate;
    if (window.__failTransfer) {
      const error = new Error('fixture transfer failed');
      error.transferredReferenceIndices = window.__partial || [];
      throw error;
    }
    window.__transfers = (window.__transfers || 0) + 1;
  }; });
  for (let index = 0; index < count; index++) await crop(page, ui, .2 + index * .2);
  await ui.locator('[data-unilib-crop-workbench]').click();
  return { page, ui };
}
test('successful transfer clears the accepted crop tray on reopen and preserves the PDF source', async t => {
  const { page, ui } = await library(t);
  await ui.locator('[data-unilib-ai]').click();
  await ui.waitFor({state:'hidden'});
  await page.evaluate(() => window.cropFixture.open());
  assert.equal(await page.evaluate(() => window.__acceptedAssets.size), 0);
  assert.equal(await ui.locator('[data-result-id="geometry-book:page:1"]').count(), 1);
});
test('failed transfer keeps crops and the library open', async t => {
  const { page, ui } = await library(t);
  await page.evaluate(() => window.__failTransfer = true);
  await ui.locator('[data-unilib-ai]').click();
  await page.waitForFunction(() => document.querySelector('[data-unilib-status]').textContent.includes('failed'));
  assert.equal(await ui.isVisible(), true);
  assert.equal(await page.evaluate(() => window.__acceptedAssets.size), 1);
});
test('cancelled multi-crop assignment retains every crop', async t => {
  const { page, ui } = await library(t, 2);
  await ui.locator('[data-unilib-ai]').click();
  await page.locator('.workbench-assignment [data-action="cancel"]').last().click();
  assert.equal(await page.evaluate(() => window.__acceptedAssets.size), 2);
  assert.equal(await ui.isVisible(), true);
});
async function manager(t) {
  const { page, origin } = await fixture(t);
  await page.addInitScript(() => {
    localStorage.setItem('5e.tutorial.bannerSeen','true'); localStorage.setItem('5e.preview:5e.mode','pro');
    window.fiveEDesktop = { web: true, status: async () => ({login:{loggedIn:true},server:true}), models:async()=>({data:[]}), account:async()=>({}), onEvent:()=>()=>{}, onState:()=>()=>{}, onLog:()=>()=>{} };
  });
  await page.route('**/preview/js/main.js*', route => route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'preview/js/main.js'),'utf8').replace('const aiPanel = initAiPanel(state, { freshStart: recoveryChoice === "fresh" });','const aiPanel = initAiPanel(state, { freshStart: false }); window.__manager = aiPanel;')}));
  await page.route('**/preview/js/ai-panel.js*', route => route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'preview/js/ai-panel.js'),'utf8').replace('    await workspaceReady;\n    syncLiteModeUi();', '    await workspaceReady;\n    if (window.__failImport && references.some(reference => reference.name === "fail")) throw new Error("fixture import failed");\n    syncLiteModeUi();')}));
  if (process.env.TRANSFER_BASELINE) await page.route('**/preview/js/ai-task-workspaces.js*', route => route.fulfill({contentType:'text/javascript',body:require('node:child_process').execFileSync('git',['show','HEAD:preview/js/ai-task-workspaces.js'],{cwd:root,encoding:'utf8'})}));
  await page.goto(origin + '/preview/', {waitUntil:'networkidle'});
  await page.waitForFunction(() => window.__manager);
  return page;
}
test('initial empty workspace is reused for a single reference and persists without a blank neighbor', async t => {
  const page = await manager(t);
  const result = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = c.height = 20;
    await window.__manager.openIndependentReferences({references:[{dataUrl:c.toDataURL(),name:'crop'}]});
    const state = await window.__manager.sharingSnapshot(); await window.__manager.checkpointForClose();
    return {workspaces:state.workspaces.length, tabs:state.workspaces.map(w=>w.tabs.length)};
  });
  assert.deepEqual(result, {workspaces:1,tabs:[1]});
  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(() => window.__manager);
  assert.equal(await page.evaluate(async () => (await window.__manager.sharingSnapshot()).workspaces.length), 1);
});

test('multi-crop success removes only the transferred snapshot and retains a concurrently added crop', async t => {
  const { page, ui } = await library(t, 2);
  await page.evaluate(() => { window.__transferGate = new Promise(resolve => window.__releaseTransfer = resolve); });
  await ui.locator('[data-unilib-ai]').click();
  await page.locator('.workbench-assignment [data-action="continue"]').click();
  await page.waitForFunction(() => window.__transferStarted);
  await page.evaluate(() => {
    const entry = structuredClone([...window.__acceptedAssets.values()][0]);
    entry.result.id = 'concurrent-crop';
    window.__acceptedAssets.set(entry.result.id, entry);
    window.__releaseTransfer();
  });
  await page.waitForFunction(() => window.__acceptedAssets.size === 1);
  assert.deepEqual(await page.evaluate(() => [...window.__acceptedAssets.keys()]), ['concurrent-crop']);
  assert.equal(await ui.isVisible(), true);
});

test('partial multi-crop failure retains only unsent crops and keeps the library open', async t => {
  const { page, ui } = await library(t, 2);
  const ids = await page.evaluate(() => [...window.__acceptedAssets.keys()]);
  await page.evaluate(() => { window.__failTransfer = true; window.__partial = [0]; });
  await ui.locator('[data-unilib-ai]').click();
  await page.locator('.workbench-assignment [data-action="continue"]').click();
  await page.waitForFunction(() => document.querySelector('[data-unilib-status]').textContent.includes('failed'));
  assert.deepEqual(await page.evaluate(() => [...window.__acceptedAssets.keys()]), [ids[1]]);
  assert.equal(await ui.isVisible(), true);
});

test('multiple independent references preserve a prompt-only workspace', async t => {
  const page = await manager(t);
  const result = await page.evaluate(async () => {
    await window.__manager.open({prompt:'keep this draft'});
    const c = document.createElement('canvas'); c.width = c.height = 20;
    await window.__manager.openIndependentReferences({references:[{dataUrl:c.toDataURL(),name:'first'},{dataUrl:c.toDataURL(),name:'second'}]});
    return (await window.__manager.sharingSnapshot()).workspaces.map(w=>({input:w.tabs[0].input, count:w.tabs[0].attachments.length}));
  });
  assert.deepEqual(result, [{input:'keep this draft',count:0},{input:'',count:1},{input:'',count:1}]);
});

test('failed imports remove newly created empty workspaces and retain earlier successful transfers across reload', async t => {
  const page = await manager(t);
  const result = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = c.height = 20;
    window.__failImport = true;
    let transferred;
    try { await window.__manager.openIndependentReferences({references:[{dataUrl:c.toDataURL(),name:'first'},{dataUrl:c.toDataURL(),name:'fail'}]}); }
    catch(error) { transferred = error.transferredReferenceIndices; }
    const snapshot = await window.__manager.sharingSnapshot();
    return {transferred, workspaces:snapshot.workspaces.length, counts:snapshot.workspaces.map(w=>w.tabs[0].attachments.length), registry:JSON.parse(localStorage.getItem('5e.aiParallelWorkspaces.v1'))};
  });
  assert.deepEqual(result, {transferred:[0],workspaces:1,counts:[1],registry:[]});
  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(() => window.__manager);
  assert.equal(await page.evaluate(async () => (await window.__manager.sharingSnapshot()).workspaces.length), 1);
});

test('a busy reference consumer rejects the handoff instead of acknowledging a discarded image', async t => {
  const page = await manager(t);
  const result = await page.evaluate(async () => {
    const { createUnifiedAiSourceConsumer } = await import('/preview/js/ai-panel.js');
    const consumer = createUnifiedAiSourceConsumer({addReferencesAsTasks:()=>[],setStatus:()=>{}});
    try { consumer.onAddMany([{data:'sample'}], {placement:'separate'}); return 'accepted'; }
    catch(error) { return error.message; }
  });
  assert.match(result, /받지 못했습니다/);
});
