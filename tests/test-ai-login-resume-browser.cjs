const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { chromium, webkit } = require('playwright');
const { waitForDom, installApp, openCropLibrary, cropReferences, sendLibrary, workspaces, beginMotionSamples, stopMotionSamples } = require('./helpers/ai-login-resume-fixture.cjs');
const root = path.resolve(__dirname, '..');
const evidence = path.resolve(process.env.EVIDENCE_DIR || '.omo/evidence/ai-login-resume-20261009');
fs.mkdirSync(evidence, { recursive: true });
let preview = process.env.RELEASE_URL || process.env.PREVIEW_URL, server;

test.before(async () => {
  if (preview) return;
  server = spawn(process.execPath, ['scripts/preview-local-server.cjs'], { cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
  preview = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Preview server did not start')), 10000);
    server.once('error', reject);
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Preview exited: ${code}`)); });
    server.stdout.on('data', chunk => {
      const match = String(chunk).match(/Local preview: (http:\/\/127\.0\.0\.1:\d+\/preview\/)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
});
test.after(async () => {
  if(!server || server.exitCode!==null || server.signalCode!==null)return;
  const closed=once(server,'close',{signal:AbortSignal.timeout(5000)});
  server.kill('SIGTERM');
  await closed;
});

function assertPreserved(actual, sent, grouping) {
  const expected = sent.references.map(reference => ({ name: reference.name, data: reference.dataUrl, source: reference.source }));
  assert.equal(actual.length, grouping.length, 'only the intended workspaces contain sources');
  assert.deepEqual(actual.map(workspace => workspace.flatMap(tab => tab.attachments)), grouping.map(indices => indices.map(index => expected[index])),
    'real cropped PNG bytes, name, provenance, group and order survive authentication');
}

for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  if (process.env.LOGIN_RESUME_ENGINE && process.env.LOGIN_RESUME_ENGINE !== engineName) continue;
  test(`library image login handoff in ${engineName}`, { timeout: 240000 }, async t => {
    const browser = await engine.launch({ headless: true });
    t.after(() => browser.close());
    const scenario = async (name, run, options = {}) => {
      if (process.env.LOGIN_RESUME_CASE && !name.includes(process.env.LOGIN_RESUME_CASE)) return;
      await t.test(name, { timeout: 45000 }, async st => {
        const directory = path.join(evidence, engineName, name.replace(/[^a-z0-9]+/gi, '-')); fs.mkdirSync(directory, { recursive: true });
        const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: options.reducedMotion || 'no-preference' });
        await context.tracing.start({ screenshots: true, snapshots: true });
        const page = await context.newPage(); page.setDefaultTimeout(7000);
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        st.after(async () => {
          if (!page.isClosed()) {
            await page.screenshot({ path: path.join(directory, 'final.png') });
            const handoff = await page.evaluate(async () => {
              const id = sessionStorage.getItem('5e.aiLoginIntent.v1');
              const { idbGet } = await import('/js/idb-store.js?v=1.7.0-four-session-integration');
              const intent = id ? await idbGet('ai-login-intent:' + id) : null;
              return { pendingId: id, state: intent?.state, receipt: intent?.receipt,
                libraryStatus: [...document.querySelectorAll('[data-unilib-status]')].map(el => el.textContent),
                loginOpen: document.querySelector('.web-login-dialog')?.open,
                loginPhase: document.querySelector('.web-login-dialog')?.dataset.phase,
                calls: window.loginResumeFixture?.calls };
            });
            fs.writeFileSync(path.join(directory, 'diagnostic.json'), JSON.stringify({ errors, handoff, content: await page.locator('body').innerText() }, null, 2));
          }
          await context.tracing.stop({ path: path.join(directory, 'trace.zip') });
          await context.close();
        });
        await installApp(page, preview, { connected: options.connected });
        await run(page, directory);
        assert.deepEqual(errors, [], 'real preview app and auth callbacks have no runtime errors');
        assert.equal(await page.evaluate(() => loginResumeFixture.calls.send), 0, 'login completion does not generate or send an AI request');
      });
    };

    await scenario('anonymous two crops resume together once', async (page, directory) => {
      const library = await openCropLibrary(page); await cropReferences(page, library, 2);
      await beginMotionSamples(page); await sendLibrary(page, library, { count: 2, placement: 'together' });
      const dialog = page.locator('.web-login-dialog'); await dialog.waitFor({ state: 'visible' });
      assert.equal(await library.isVisible(), true, 'library stays underneath login while import is pending');
      const sent = await page.evaluate(() => structuredClone(loginResumeSent[0]));
      assert.equal(sent.references.length, 2); assert.deepEqual(sent.groups, [[0, 1]]);
      const original = await page.evaluate(() => loginResumeOriginal);
      assert.equal(sent.references.every(reference => reference.dataUrl !== original), true, 'the fixture sends cropped pixels rather than the full PDF page');
      assert.equal(new Set(sent.references.map(reference => reference.dataUrl)).size, 2, 'two different crop regions must carry distinguishable PNGs');
      await dialog.locator('[data-login-start]').click();
      const began = Date.now(); await page.evaluate(() => loginResumeFixture.connect());
      await page.locator('.modal-overlay:not([hidden])').filter({ has: page.locator('[data-ai-tabs]') }).first().waitFor({ state: 'visible', timeout: 2000 });
      await dialog.waitFor({ state: 'hidden', timeout: 2000 });
      assert.ok(Date.now() - began < 2000, 'no fixed three-second completion countdown');
      await library.waitFor({ state: 'hidden' });
      const snapshot = await workspaces(page); assertPreserved(snapshot, sent, [[0, 1]]);
      await waitForDom(page,() => [...document.querySelectorAll('#ai-image-panel .ai-preview-stage > img')].some(image => image.naturalWidth > 0));
      await page.screenshot({ path: path.join(directory, 'prepared-workbench.png') });
      await page.evaluate(() => { for (let i = 0; i < 5; i++) loginResumeFixture.duplicateStatus(); });
      assert.deepEqual(await workspaces(page), snapshot, 'duplicate status callbacks import exactly once');
      const samples = await stopMotionSamples(page);
      fs.writeFileSync(path.join(directory, 'motion.json'), JSON.stringify(samples, null, 2));
      assert.ok(samples.length > 2, 'samples include visible transition frames');
      assert.equal(samples.some(frame => !frame.library && !frame.login && !frame.ai), false, 'no bare main screen frame during library → login → AI');
      await page.locator('#ai-image-panel [data-ai-close]').click();
      await page.locator('.modal-overlay:not([hidden])').filter({ has: page.locator('[data-ai-tabs]') }).waitFor({ state: 'hidden' });
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'canvas', 'closing restores canvas focus after the exit motion finishes');
      await page.evaluate(() => { for (let i = 0; i < 5; i++) loginResumeFixture.duplicateStatus(); });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.locator('.modal-overlay:not([hidden])').filter({ has: page.locator('[data-ai-tabs]') }).count(), 0, 'late status cannot reopen a manually closed workspace');
    });

    await scenario('cancel keeps crops and retry reuses draft', async page => {
      const library = await openCropLibrary(page); await cropReferences(page, library, 1);
      await sendLibrary(page, library);
      const dialog = page.locator('.web-login-dialog'); await dialog.waitFor({ state: 'visible' });
      const first = await page.evaluate(() => structuredClone(loginResumeSent[0]));
      await dialog.locator('[data-login-start]').click();
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
      assert.equal(await library.isVisible(), true, 'cancel returns to selected library context');
      await library.locator('[data-unilib-ai]:not([disabled])').waitFor();
      await page.evaluate(() => loginResumeFixture.connect());
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.locator('.modal-overlay:not([hidden])').filter({ has: page.locator('[data-ai-tabs]') }).count(), 0, 'stale authentication success cannot reveal a canceled conversion');
      await sendLibrary(page, library); await library.waitFor({ state: 'hidden' });
      assertPreserved(await workspaces(page), first, [[0]]);
      assert.equal(await page.evaluate(() => loginResumeSent.length), 2, 'a new explicit retry is required to resume canceled work');
    });

    await scenario('connected transfer retains separate order', async (page, directory) => {
      const library = await openCropLibrary(page); await cropReferences(page, library, 2);
      await beginMotionSamples(page); await sendLibrary(page, library, { count: 2 });
      await library.waitFor({ state: 'hidden' });
      assert.equal(await page.locator('.web-login-dialog').isVisible(), false);
      const sent = await page.evaluate(() => structuredClone(loginResumeSent[0]));
      assertPreserved(await workspaces(page), sent, [[0], [1]]);
      const samples = await stopMotionSamples(page); fs.writeFileSync(path.join(directory, 'motion.json'), JSON.stringify(samples, null, 2));
      assert.equal(samples.some(frame => !frame.library && !frame.login && !frame.ai), false, 'direct transition keeps context visible until the workbench is ready');
    }, { connected: true });

    await scenario('generic account login does not open AI', async page => {
      await page.locator('.web-account-status').click();
      const dialog = page.locator('.web-login-dialog'); await dialog.locator('[data-login-start]').click();
      await page.evaluate(() => loginResumeFixture.connect());
      await dialog.waitFor({ state: 'hidden', timeout: 2000 });
      assert.deepEqual(await workspaces(page), []);
      assert.equal(await page.locator('.modal-overlay:not([hidden])').filter({ has: page.locator('[data-ai-tabs]') }).count(), 0);
    });

    await scenario('pending cropped draft resumes after reload', async page => {
      const library = await openCropLibrary(page); await cropReferences(page, library, 2);
      await sendLibrary(page, library, { count: 2, placement: 'together' });
      await page.locator('.web-login-dialog').waitFor({ state: 'visible' });
      const sent = await page.evaluate(() => structuredClone(loginResumeSent[0]));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForDom(page,() => Boolean(window.loginResumeApp));
      const dialog = page.locator('.web-login-dialog'); await dialog.waitFor({ state: 'visible' });
      await dialog.locator('[data-login-start]').click(); await page.evaluate(() => loginResumeFixture.connect());
      await dialog.waitFor({ state: 'hidden', timeout: 2000 });
      await page.locator('.modal-overlay:not([hidden])').filter({ has: page.locator('[data-ai-tabs]') }).first().waitFor({ state: 'visible' });
      assertPreserved(await workspaces(page), sent, [[0, 1]]);
    });

    await scenario('reduced motion resume preserves image', async (page, directory) => {
      const library = await openCropLibrary(page); await cropReferences(page, library);
      await beginMotionSamples(page); await sendLibrary(page, library);
      const dialog = page.locator('.web-login-dialog'); await dialog.waitFor({ state: 'visible' });
      const sent = await page.evaluate(() => structuredClone(loginResumeSent[0]));
      await dialog.locator('[data-login-start]').click(); await page.evaluate(() => loginResumeFixture.connect());
      await dialog.waitFor({ state: 'hidden', timeout: 2000 }); await library.waitFor({ state: 'hidden' });
      assertPreserved(await workspaces(page), sent, [[0]]);
      const samples = await stopMotionSamples(page); fs.writeFileSync(path.join(directory, 'motion.json'), JSON.stringify(samples, null, 2));
      assert.equal(samples.some(frame => !frame.library && !frame.login && !frame.ai), false, 'reduced-motion path also avoids a bare main-screen flash');
      assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    }, { reducedMotion: 'reduce' });

    await scenario('partial hidden staging failure preserves all crops', async page => {
      const library = await openCropLibrary(page); await cropReferences(page, library, 2);
      await page.evaluate(() => {
        const nativePut = IDBObjectStore.prototype.put;
        const populatedDatabases = new Set();
        window.loginResumeStorageFault = { enabled: true, database: null, writes: 0 };
        IDBObjectStore.prototype.put = function (value, ...args) {
          const name = this.transaction.db.name;
          if (this.name === 'tasks' && value?.key === 'workspace' && value.tabs?.some(tab => tab.attachments?.length)) {
            populatedDatabases.add(name);
            if (populatedDatabases.size === 2 && !window.loginResumeStorageFault.database) window.loginResumeStorageFault.database = name;
            if (window.loginResumeStorageFault.enabled && name === window.loginResumeStorageFault.database) {
              window.loginResumeStorageFault.writes += 1;
              throw new DOMException('Synthetic storage quota failure for the second staged crop', 'QuotaExceededError');
            }
          }
          return nativePut.call(this, value, ...args);
        };
      });
      await sendLibrary(page, library, { count: 2 });
      await waitForDom(page,() => [...document.querySelectorAll('[data-unilib-status]')].some(el => el.textContent.includes('AI 작업실을 열지 못했습니다')));
      assert.ok(await page.evaluate(() => loginResumeStorageFault.writes > 0), 'the second distinct workspace checkpoint failed after the first was saved');
      assert.equal(await library.isVisible(), true);
      assert.equal(await page.locator('.web-login-dialog').isVisible(), false, 'authentication does not start for an incomplete preparation');
      assert.equal(await page.locator('.modal-overlay:not([hidden])').filter({ has: page.locator('[data-ai-tabs]') }).count(), 0, 'a partially staged workbench stays hidden');
      const first = await page.evaluate(() => structuredClone(loginResumeSent[0]));
      await library.locator('[data-unilib-ai]:not([disabled])').waitFor();
      await page.evaluate(() => { loginResumeStorageFault.enabled = false; });
      await sendLibrary(page, library, { count: 2 });
      const second = await page.evaluate(() => structuredClone(loginResumeSent[1]));
      assert.deepEqual(second.references, first.references, 'both library crops remain available after a partial hidden staging failure');
      const dialog = page.locator('.web-login-dialog'); await dialog.waitFor({ state: 'visible' });
      await dialog.locator('[data-login-start]').click(); await page.evaluate(() => loginResumeFixture.connect());
      await dialog.waitFor({ state: 'hidden', timeout: 2000 }); await library.waitFor({ state: 'hidden' });
      assertPreserved(await workspaces(page), first, [[0], [1]]);
    });

    await scenario('close and reopen interrupt the same window motion', async page => {
      const library = await openCropLibrary(page); await cropReferences(page, library);
      await sendLibrary(page, library); await library.waitFor({ state: 'hidden' });
      const before = await workspaces(page);
      const closing=waitForDom(page,() => document.querySelector('#ai-image-panel')?.dataset.modalMotionState === 'closing');
      await page.locator('#ai-image-panel [data-ai-close]').click();
      await closing;
      await page.evaluate(() => loginResumeApp.aiPanel.open());
      await waitForDom(page,() => document.querySelector('#ai-image-panel')?.dataset.modalMotionState === 'open');
      assert.equal(await page.locator('#ai-image-panel').isVisible(), true);
      assert.equal(await page.locator('#ai-image-panel').evaluate(el => el.inert), false);
      assert.notEqual(await page.evaluate(() => document.activeElement?.id), 'canvas', 'an interrupted close must not run a stale canvas-focus callback');
      assert.deepEqual(await workspaces(page), before, 'interrupting a close creates no new source or task');
    }, { connected: true });
  });
}
