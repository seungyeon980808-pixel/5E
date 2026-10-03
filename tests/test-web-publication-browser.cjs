const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium, webkit } = require('playwright');

const root = path.resolve(__dirname, '..');
const site = process.env.FIVE_E_SITE_ROOT;
const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/web-artifact-evidence');
const fixture = path.join(root, 'tests/fixtures/rights-clear-smoke.png');
const fixtureSource = `data:image/png;base64,${fs.readFileSync(fixture).toString('base64')}`;
const candidateVersion = require('../release-channels.json').candidate.version;

function moduleUrl(directory, moduleName) {
  const source = fs.readFileSync(path.join(directory, 'js/main.js'), 'utf8');
  const match = source.match(new RegExp(`from ["'](\\./${moduleName}\\.js(?:\\?[^"']*)?)["']`));
  assert.ok(match, `${moduleName} is imported by the actual entry`);
  return `./js/${match[1].slice(2)}`;
}

async function startServer() {
  const child = spawn(process.execPath, ['scripts/preview-local-server.cjs'], {
    cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Artifact server did not start')); }, 10000);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Artifact server exited: ${code}`)); });
    child.stdout.on('data', chunk => {
      const origin = String(chunk).match(/Local preview: (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
      if (origin) { clearTimeout(timer); resolve({ child, origin }); }
    });
  });
}

async function documentData(page, modules) {
  return page.evaluate(async ({ state, project }) => {
    const stateModule = await import(state);
    const { serialize } = await import(project);
    return serialize(stateModule.state.get());
  }, modules);
}

async function waitForDocument(page, modules, predicate, message) {
  let document;
  for (let attempt = 0; attempt < 100; attempt++) {
    document = await documentData(page, modules);
    if (predicate(document)) return document;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(predicate(document), message);
}

async function drawLine(page) {
  await page.locator('[data-tool="L"]').click();
  const canvas = await page.locator('#canvas').boundingBox();
  assert.ok(canvas);
  await page.mouse.click(canvas.x + canvas.width * 0.4, canvas.y + canvas.height * 0.4);
  await page.mouse.click(canvas.x + canvas.width * 0.6, canvas.y + canvas.height * 0.6);
  await page.keyboard.press('Escape');
}

async function saveAndReopen(page, origin, modules, label, createContext) {
  await page.locator('#file-menu-btn').click();
  await page.locator('#image-import').click();
  const imageChooser = page.waitForEvent('filechooser');
  await page.locator('.file-submenu [data-mode="single-page"]').click();
  await (await imageChooser).setFiles(fixture);
  const before = await waitForDocument(page, modules,
    document => document.pages[0].objects.some(object => object.type === 'image'), 'image import completes');
  assert.equal(before.pages[0].objects.length, 2, 'the line and source image are present');
  assert.equal(before.pages[0].objects.find(object => object.type === 'image').src, fixtureSource, 'original PNG bytes survive import');

  await page.locator('#file-menu-btn').click();
  await page.locator('#project-save').click();
  const dialog = page.locator('.modal-overlay:not([hidden])').last();
  await dialog.waitFor({ state: 'visible' });
  await dialog.locator('.modal-input').fill(label);
  const saving = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  const download = await saving;
  assert.equal(download.suggestedFilename().normalize('NFC'), `${label}.5e`);
  const projectFile = path.join(evidence, `${label}.5e`);
  await download.saveAs(projectFile);
  const saved = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
  assert.deepEqual(saved, before, 'the download contains the complete persistent document');

  // A fresh tab/context proves recovery from the file rather than retained memory.
  const reopened = await (await createContext()).newPage();
  await reopened.goto(`${origin}/?mode=pro&mobile=0`, { waitUntil: 'load' });
  await reopened.locator('#canvas').waitFor({ state: 'visible' });
  await reopened.locator('#file-menu-btn').click();
  const opening = reopened.waitForEvent('filechooser');
  await reopened.locator('#project-open').click();
  await (await opening).setFiles(projectFile);
  await reopened.getByRole('button', { name: '열기', exact: true }).click();
  await waitForDocument(reopened, modules, document => document.pages[0].objects.length === 2, 'project open completes');
  const normalizedSaved = await reopened.evaluate(async ({ project, saved }) => {
    const { migrate } = await import(project);
    return migrate(saved);
  }, { project: modules.project, saved });
  assert.deepEqual(await documentData(reopened, modules), normalizedSaved, 'save/open round trip preserves pages, geometry, styles and embedded image bytes after schema defaults');
  await page.close();
  return reopened;
}

async function exportImages(page, label) {
  const exports = [];
  for (const format of ['png', 'svg']) {
    await page.locator('#file-menu-btn').click();
    await page.locator('#image-export').click();
    const dialog = page.locator('#export-overlay');
    await dialog.locator('#export-filename').fill(label);
    await dialog.locator(`[data-format="${format}"]`).click();
    const exporting = page.waitForEvent('download');
    await dialog.locator('#export-confirm').click();
    const download = await exporting;
    const file = path.join(evidence, `${label}.${format}`);
    await download.saveAs(file);
    assert.equal(download.suggestedFilename().normalize('NFC'), `${label}.${format}`);
    const bytes = fs.readFileSync(file);
    if (format === 'svg') {
      assert.match(bytes.toString(), /<svg\b/);
      assert.match(bytes.toString(), /<image\b/);
      assert.match(bytes.toString(), /data:image\/png;base64,/);
    } else {
      assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.ok(bytes.readUInt32BE(16) > 100 && bytes.readUInt32BE(20) > 100);
    }
    const pixels = await page.evaluate(async ({ base64, mime }) => {
      const blob = await (await fetch(`data:${mime};base64,${base64}`)).blob();
      const bitmap = new Image();
      const imageUrl = URL.createObjectURL(blob);
      bitmap.src = imageUrl;
      await bitmap.decode();
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.naturalWidth; canvas.height = bitmap.naturalHeight;
      const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let ink = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 0 && Math.min(data[i], data[i + 1], data[i + 2]) < 200) ink++;
      URL.revokeObjectURL(imageUrl);
      return { width: canvas.width, height: canvas.height, ink };
    }, { base64: bytes.toString('base64'), mime: format === 'svg' ? 'image/svg+xml' : 'image/png' });
    assert.ok(pixels.ink > 100, 'export is decodable and contains drawn content');
    exports.push({ format, bytes: bytes.length, ...pixels });
  }
  return exports;
}

async function freshContext(browser, errors, origin) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.addInitScript(() => {
    if (location.protocol !== 'http:') return;
    for (const prefix of ['', '5e.preview:']) localStorage.setItem(`${prefix}5e.tutorial.bannerSeen`, 'true');
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: undefined });
  });
  context.on('page', tab => {
    tab.on('pageerror', error => errors.push(error.message));
    tab.on('response', response => {
      if (response.status() >= 400 && response.url().startsWith(origin)) errors.push(`${response.status()} ${response.url()}`);
    });
  });
  return context;
}

(async () => {
  assert.ok(site && fs.existsSync(path.join(site, 'index.html')), 'FIVE_E_SITE_ROOT must select the staged publication artifact');
  fs.mkdirSync(evidence, { recursive: true });
  const modules = { state: moduleUrl(site, 'state'), project: moduleUrl(site, 'project-io') };
  const server = await startServer();
  const results = [];
  try {
    for (const engine of [chromium, webkit]) {
      const browser = await engine.launch({ headless: true });
      const errors = [];
      let page;
      try {
        const context = await freshContext(browser, errors, server.origin);
        page = await context.newPage();
        await page.goto(`${server.origin}/?mode=pro&mobile=0`, { waitUntil: 'load' });
        await page.locator('#canvas').waitFor({ state: 'visible' });
        assert.ok((await page.title()).includes(candidateVersion));
        assert.ok((await page.locator('[data-release-version]').textContent()).includes(`v${candidateVersion}`));
        const stampedSource = fs.readFileSync(path.join(site, 'js/release-receipt.js'), 'utf8')
          .match(/sourceCommit: '([a-f0-9]{40})'/)?.[1];
        assert.ok(stampedSource, 'the artifact contains its exact source commit');
        await page.waitForFunction(sha => document.querySelector('[data-release-version]')?.dataset.sourceCommit === sha, stampedSource);
        if (process.env.GITHUB_SHA) assert.equal(stampedSource, process.env.GITHUB_SHA);
        await drawLine(page);
        assert.equal((await documentData(page, modules)).pages[0].objects.length, 1);
        await page.locator('#undo-btn').click();
        assert.equal((await documentData(page, modules)).pages[0].objects.length, 0);
        await page.locator('#redo-btn').click();
        page = await saveAndReopen(page, server.origin, modules, `${engine.name()}-왕복검증`, () => freshContext(browser, errors, server.origin));
        const exports = await exportImages(page, `${engine.name()}-왕복검증`);
        await page.screenshot({ path: path.join(evidence, `${engine.name()}-root.png`), fullPage: true });

        // Check the preserved public preview independently from stable root.
        const preview = await (await freshContext(browser, errors, server.origin)).newPage();
        await preview.goto(`${server.origin}/preview/?mode=pro&mobile=0`, { waitUntil: 'load' });
        await preview.locator('#canvas').waitFor({ state: 'visible' });
        assert.match(await preview.title(), /1\.7\.0/);
        const previewModules = { state: moduleUrl(path.join(site, 'preview'), 'state'), project: moduleUrl(path.join(site, 'preview'), 'project-io') };
        await drawLine(preview);
        assert.equal((await documentData(preview, previewModules)).pages[0].objects.length, 1);
        await preview.locator('#undo-btn').click();
        assert.equal((await documentData(preview, previewModules)).pages[0].objects.length, 0);
        await preview.screenshot({ path: path.join(evidence, `${engine.name()}-preserved-preview.png`), fullPage: true });
        assert.deepEqual(errors, [], `${engine.name()} has no runtime or local resource failures`);
        const pinnedStable = await (await freshContext(browser, errors, server.origin)).newPage();
        await pinnedStable.goto(`${server.origin}/1.6.0/?mode=pro&mobile=0`, { waitUntil: 'load' });
        await pinnedStable.locator('#canvas').waitFor({ state: 'visible' });
        assert.match(await pinnedStable.locator('[data-release-version]').textContent(), /v1\.6\.0/);
        const pinnedModules = { state: moduleUrl(path.join(site, '1.6.0'), 'state'), project: moduleUrl(path.join(site, '1.6.0'), 'project-io') };
        await drawLine(pinnedStable);
        assert.equal((await documentData(pinnedStable, pinnedModules)).pages[0].objects.length, 1);
        await pinnedStable.locator('#undo-btn').click();
        assert.equal((await documentData(pinnedStable, pinnedModules)).pages[0].objects.length, 0);
        assert.deepEqual(errors, [], `${engine.name()} has no runtime or local resource failures`);
        results.push({ engine: engine.name(), stable: candidateVersion, preview: '1.7.0', pinnedStable: '1.6.0', drawingUndoRedo: true, savedReopened: true, exports, errors, passed: true });
      } catch (error) {
        if (page && !page.isClosed()) await page.screenshot({ path: path.join(evidence, `${engine.name()}-failure.png`), fullPage: true }).catch(() => {});
        results.push({ engine: engine.name(), passed: false, error: error.stack, errors });
        throw error;
      } finally {
        await browser.close();
        fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(results, null, 2) + '\n');
      }
    }
    console.log(JSON.stringify(results, null, 2));
  } finally {
    server.child.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
