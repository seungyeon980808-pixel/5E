const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const evidence = path.resolve(process.env.EVIDENCE_DIR || '.omo/evidence/a1-browser');
fs.mkdirSync(evidence, { recursive: true });
const origin = new URL('/', process.env.RELEASE_URL || process.env.PREVIEW_URL).href;
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
function moduleUrl(name) {
  const match = main.match(new RegExp(`from ["'](\\./${name}\\.js(?:\\?[^"']*)?)["']`));
  assert.ok(match, `${name} must use the actual root entry import`);
  return '/js/' + match[1].slice(2);
}
const modules = { state: moduleUrl('state'), project: moduleUrl('project-io'), status: '/js/project-status.js?v=1.6.1-ai-latest-fixes-0928' };
const fixture = path.join(root, 'tests/fixtures/rights-clear-smoke.png');
const fixtureSrc = `data:image/png;base64,${fs.readFileSync(fixture).toString('base64')}`;
const limit = 128 * 1024 * 1024;
async function context(browser, errors) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => {
    if (location.protocol !== 'http:') return;
    for (const prefix of ['', '5e.preview:']) localStorage.setItem(`${prefix}5e.tutorial.bannerSeen`, 'true');
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: undefined });
  });
  ctx.on('page', p => p.on('pageerror', e => errors.push(e.message)));
  return ctx;
}
async function doc(page) {
  return page.evaluate(async m => (await import(m.project)).serialize((await import(m.state)).state.get()), modules);
}
async function ready(page) {
  await page.goto(`${origin}?mode=pro&mobile=0`, { waitUntil: 'load' });
  await page.locator('#canvas').waitFor({ state: 'visible' });
  await page.waitForFunction(async m => (await import(m.state)).state.get().pages?.length > 0, modules);
}
async function draw(page, offset = 0) {
  await page.locator('[data-tool="L"]').click();
  const b = await page.locator('#canvas').boundingBox();
  await page.mouse.click(b.x + b.width * (.25 + offset), b.y + b.height * .3);
  await page.mouse.click(b.x + b.width * (.4 + offset), b.y + b.height * .45);
  await page.keyboard.press('Escape');
}
async function choose(page, file) {
  await page.locator('#file-menu-btn').click();
  const wait = page.waitForEvent('filechooser');
  await page.locator('#project-open').click();
  await (await wait).setFiles(file);
}
async function snapshot(page) {
  return page.evaluate(async m => {
    const { state } = await import(m.state); const { serialize } = await import(m.project);
    const { initProjectStatus } = await import(m.status); const s = state.get();
    return JSON.parse(JSON.stringify({ document: serialize(s), selectedIds: s.selectedIds,
      selectedGuideId: s.selectedGuideId, targetedId: s.targetedId, undo: s.undoStack,
      redo: s.redoStack, activePageId: s.activePageId, viewBox: s.viewBox,
      status: initProjectStatus(state, serialize).text() }));
  }, modules);
}
(async () => {
  const results = [];
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const errors = [], dialogs = [];
    try {
      let page = await (await context(browser, errors)).newPage();
      await ready(page); await draw(page);
      await page.locator('#file-menu-btn').click(); await page.locator('#image-import').click();
      const imgChooser = page.waitForEvent('filechooser');
      await page.locator('.file-submenu [data-mode="single-page"]').click();
      await (await imgChooser).setFiles(fixture);
      await page.waitForFunction(async m => (await import(m.state)).state.get().objects.some(o => o.type === 'image'), modules);
      await page.keyboard.press('Enter');
      const before = await doc(page);
      assert.equal(before.pages[0].objects.length, 2);
      assert.equal(before.pages[0].objects.find(o => o.type === 'image').src, fixtureSrc);
      await page.locator('#file-menu-btn').click(); await page.locator('#project-save').click();
      const savingDialog = page.locator('.modal-overlay:not([hidden])').last();
      const label = `${engine.name()}-A1-실제왕복`;
      await savingDialog.locator('.modal-input').fill(label);
      const saving = page.waitForEvent('download');
      await savingDialog.getByRole('button', { name: '저장', exact: true }).click();
      const download = await saving;
      const savedPath = path.join(evidence, `${label}.5e`); await download.saveAs(savedPath);
      const saved = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
      assert.deepEqual(saved, before);
      assert.equal(download.suggestedFilename().normalize('NFC'), `${label}.5e`);
      // Fresh storage and actual file input, not reuse of in-memory objects.
      page = await (await context(browser, errors)).newPage(); await ready(page);
      await choose(page, savedPath); await page.getByRole('button', { name: '열기', exact: true }).click();
      await page.waitForFunction(async m => (await import(m.state)).state.get().objects.length === 2, modules);
      const normalized = await page.evaluate(async ({ m, saved }) => (await import(m.project)).migrate(saved), { m: modules, saved });
      assert.deepEqual(await doc(page), normalized);
      // Populate both history stacks using actual drawing and undo actions.
      await draw(page); await draw(page, .15); await page.locator('#undo-btn').click();
      await page.evaluate(async m => {
        const { state } = await import(m.state);
        state.update(s => { s.selectedIds = [s.objects[0].id]; s.targetedId = s.objects[0].id; });
      }, modules);
      // Save this edited document through the real download path. Its receipt
      // takes precedence over an independently timed automatic recovery write.
      await page.locator('#file-menu-btn').click(); await page.locator('#project-save').click();
      const preserveDialog = page.locator('.modal-overlay:not([hidden])').last();
      await preserveDialog.locator('.modal-input').fill(`${engine.name()}-A1-보존검증`);
      const preserving = page.waitForEvent('download');
      await preserveDialog.getByRole('button', { name: '저장', exact: true }).click();
      await (await preserving).saveAs(path.join(evidence, `${engine.name()}-A1-보존검증.5e`));
      const baseline = await snapshot(page);
      assert.ok(baseline.undo.length > 0 && baseline.redo.length > 0);
      page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });
      await page.evaluate(({ limit }) => {
        const sizes = { 'a1-below.5e': limit - 1, 'a1-exact.json': limit, 'a1-over.5e': limit + 1, 'a1-over.json': limit + 1 };
        const realSize = Object.getOwnPropertyDescriptor(File.prototype, 'size') || Object.getOwnPropertyDescriptor(Blob.prototype, 'size');
        Object.defineProperty(File.prototype, 'size', { configurable: true, get() { return sizes[this.name] ?? realSize.get.call(this); } });
        window.a1Spy = { constructors: 0, reads: [], parses: 0 };
        const Reader = window.FileReader;
        window.FileReader = class extends Reader { constructor() { super(); window.a1Spy.constructors++; }
          readAsText(file, ...args) { window.a1Spy.reads.push(file.name); return super.readAsText(file, ...args); } };
        const parse = JSON.parse;
        JSON.parse = function (text, ...args) { if (String(text).includes('A1_POLICY_MARKER')) window.a1Spy.parses++; return parse(text, ...args); };
      }, { limit });
      const payload = JSON.stringify({ ...saved, a1Probe: 'A1_POLICY_MARKER' });
      const file = name => ({ name, mimeType: 'application/json', buffer: Buffer.from(payload) });
      const spy = () => page.evaluate(() => window.a1Spy);
      // Picker rejection twice proves resetting the input permits same-file selection.
      for (let i = 0; i < 2; i++) {
        await choose(page, file('a1-over.5e'));
        const alert = page.locator('.modal-overlay:not([hidden])').last();
        await alert.getByRole('button', { name: '확인', exact: true }).waitFor();
        assert.match(await alert.textContent(), /134,217,729바이트/);
        assert.match(await alert.textContent(), /페이지를 나누어/);
        assert.deepEqual(await spy(), { constructors: 0, reads: [], parses: 0 });
        assert.deepEqual(await snapshot(page), baseline);
        assert.equal(await page.locator('input[type="file"][accept*=".5e"]').inputValue(), '');
        if (i === 0) await page.screenshot({ path: path.join(evidence, `${engine.name()}-size-rejection.png`) });
        await alert.getByRole('button', { name: '확인', exact: true }).click();
      }
      for (const name of ['a1-over.5e', 'a1-over.json']) {
        await page.evaluate(({ name, payload }) => {
          const transfer = new DataTransfer(); transfer.items.add(new File([payload], name, { type: 'application/json' }));
          document.querySelector('#canvas').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
        }, { name, payload });
        await page.getByRole('button', { name: '확인', exact: true }).click();
        assert.deepEqual(await spy(), { constructors: 0, reads: [], parses: 0 });
        assert.deepEqual(await snapshot(page), baseline);
      }
      for (const name of ['a1-below.5e', 'a1-exact.json']) {
        await choose(page, file(name));
        await page.getByRole('button', { name: '취소', exact: true }).click();
        assert.deepEqual(await snapshot(page), baseline);
      }
      assert.deepEqual(await spy(), { constructors: 2, reads: ['a1-below.5e', 'a1-exact.json'], parses: 2 });
      await choose(page, []); // File picker cancellation produces no read.
      assert.deepEqual(await snapshot(page), baseline);
      await choose(page, { name: 'a1-malformed.5e', mimeType: 'application/json', buffer: Buffer.from('{"A1_POLICY_MARKER":') });
      await page.waitForFunction(() => window.a1Spy.parses === 3);
      await page.waitForFunction(() => document.querySelector('input[type="file"][accept*=".5e"]').value === '');
      assert.deepEqual(await snapshot(page), baseline);
      assert.ok(dialogs.some(d => /프로젝트 파일을 열 수 없습니다/.test(d)));
      assert.deepEqual(errors, []);
      results.push({ engine: engine.name(), result: 'PASS', testServerOrigin: origin, actualProjectBytes: fs.statSync(savedPath).size,
        rejectedReaderConstructors: 0, rejectedReads: 0, rejectedParses: 0,
        scenarios: ['actual PNG import/save/fresh reopen', 'picker oversize and identical-file reselection', '.5e/.json canvas drop oversize', 'below and exact limit read then cancel', 'picker cancellation', 'malformed project preserves document/selection/undo/redo/save status'] });
    } finally { await browser.close(); }
  }
  fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
