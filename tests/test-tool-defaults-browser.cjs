const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/settings-defaults-verification');
const moduleQuery = '?v=1.7.0-four-session-integration';
const key = '5e.preview:phyDraw.defaults';
const original = { strokeWidth: .37, strokeLevel: 73.25, fillLevel: 198.75, textSizeMm: 3.7,
  textFont: '"저장된 글꼴", sans-serif', textWeight: '500', textStyle: 'normal',
  gridVisible: false, gridOpacity: 3, gridInterval: 10, rulerTickMm: 12,
  protractorTickDeg: 9, solid3dProjAngle: 47, futureSetting: { retained: true } };
const lineContracts = [];

h.withServer(async origin => {
  fs.mkdirSync(evidence, { recursive: true });
  for (const [name, engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(({ key, original }) => localStorage.setItem(key, JSON.stringify(original)), { key, original });
      await h.navigate(page, origin + '/?mode=pro&mobile=0&exam=0');
      await page.evaluate(query => import('/js/main.js' + query), moduleQuery);
      const skip = page.getByRole('button', { name: '건너뛰기', exact: true });
      if (await skip.isVisible()) await skip.click();
      await page.locator('#defaults-overlay').waitFor({ state: 'attached' });
      const stored = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
      const openDefaults = async () => {
        await page.locator('#settings-menu-btn').click();
        await page.locator('#open-defaults').click();
        try { await page.getByRole('dialog', { name: '도구 기본값', exact: true }).waitFor({ state: 'visible', timeout: 5000 }); }
        catch (error) {
          console.error('Defaults diagnostics', errors, await page.locator('#defaults-overlay').evaluate(element => ({ hidden: element.hidden, html: element.innerHTML.slice(0, 1000), display: getComputedStyle(element).display })));
          throw error;
        }
      };
      await page.evaluate(async query => {
        const { state } = await import('/js/state.js' + query);
        state.update(s => { s.objects = [{ id: 'existing-ruler', type: 'gauge', kind: 'ruler', x: 0, y: 0, w: 20, h: 5, tickIntervalMm: 12, layerId: 1, order: 0, strokeWidth: .2, strokeLevel: 0, fillNone: true }]; });
      }, moduleQuery);
      const objects = () => page.evaluate(async query => structuredClone((await import('/js/state.js' + query)).state.get().objects), moduleQuery);
      const before = await objects();
      await openDefaults();
      assert.equal(await page.locator('#defaults-text-size').inputValue(), '10.5');
      assert.equal(await page.locator('#defaults-stroke-level').inputValue(), '73.25');
      assert.equal(await page.locator('#defaults-fill-level').inputValue(), '198.75');
      assert.equal(await page.locator('#defaults-overlay #defaults-grid-visible').count(), 0, 'Grid appears only in preferences');
      assert.equal(await page.locator('#defaults-overlay #defaults-pbg-file').count(), 0, 'Print comparison is outside tool defaults');
      assert.equal(await page.locator('#defaults-overlay details').getAttribute('open'), null, 'Gauge options are collapsed');
      await page.locator('#defaults-stroke-width').fill('.49');
      await page.locator('#defaults-text-size').fill('14');
      await page.locator('#defaults-overlay summary').click();
      await page.locator('#defaults-ruler-tick').fill('4');
      assert.deepEqual(await objects(), before, 'Editing a default never changes an existing gauge');
      await page.locator('#defaults-cancel').click();
      assert.deepEqual(await stored(), original, 'Cancel persists nothing');
      await openDefaults();
      await page.locator('#defaults-save').click();
      assert.deepEqual(await stored(), original, 'Unchanged pt display preserves exact mm, arbitrary grays, custom font/style, and unknown backup fields');

      await openDefaults();
      await page.locator('#defaults-text-size').fill('14');
      await page.locator('#defaults-stroke-width').fill('.42');
      await page.locator('[data-gray="stroke"][data-level="128"]').click();
      await page.evaluate(() => {
        window.originalStorageSet = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
          if (key === '5e.preview:phyDraw.defaults') throw new DOMException('full', 'QuotaExceededError');
          return window.originalStorageSet.call(this, key, value);
        };
      });
      await page.locator('#defaults-save').click();
      assert.equal(await page.locator('#defaults-overlay').isVisible(), true, 'Failed save retains the dialog');
      assert.match(await page.locator('#defaults-status').textContent(), /저장 공간이 부족/);
      assert.deepEqual(await stored(), original, 'Failed save preserves storage');
      await page.evaluate(() => { Storage.prototype.setItem = window.originalStorageSet; });
      await page.locator('#defaults-save').click();
      const saved = await stored();
      assert.ok(Math.abs(saved.textSizeMm - 14 * 25.4 / 72) < 1e-12, 'Changed pt is converted to mm');
      assert.equal(saved.strokeWidth, .42); assert.equal(saved.strokeLevel, 128);
      assert.equal(saved.fillLevel, 198.75); assert.equal(saved.solid3dProjAngle, 47);
      assert.deepEqual(await objects(), before, 'Saving does not restyle existing objects');
      const helpers = await page.evaluate(async query => {
        const { applyToolDefaultsToNewObject, getToolTextDefaults } = await import('/js/settings.js' + query);
        const source = { type: 'rect', strokeWidth: .2, strokeLevel: 0, fillLevel: 255, fillNone: false };
        return { source, next: applyToolDefaultsToNewObject(source), text: getToolTextDefaults() };
      }, moduleQuery);
      assert.equal(helpers.source.strokeWidth, .2, 'Creation helper does not mutate its source');
      assert.equal(helpers.next.strokeWidth, .42); assert.equal(helpers.next.strokeLevel, 128);
      assert.equal(helpers.text.fontSize, saved.textSizeMm);

      // Use the real toolbar and pointer/editor entry points. Helper-only tests
      // cannot catch a missing creation hook or a later style overwrite.
      const snapshot = () => page.evaluate(async query => {
        const s = (await import('/js/state.js' + query)).state.get();
        return structuredClone({ objects: s.objects, draft: s.draft, draftText: s.draftText, activeTool: s.activeTool });
      }, moduleQuery);
      const startReadProbe = () => page.evaluate(probeKey => {
        window.originalDefaultsGet = Storage.prototype.getItem;
        window.defaultsReadCount = 0;
        Storage.prototype.getItem = function(itemKey) {
          if (itemKey === probeKey) window.defaultsReadCount++;
          return window.originalDefaultsGet.call(this, itemKey);
        };
      }, key);
      const defaultsReads = () => page.evaluate(() => window.defaultsReadCount);
      const stopReadProbe = () => page.evaluate(() => { Storage.prototype.getItem = window.originalDefaultsGet; });
      const canvas = await page.locator('#canvas').boundingBox();
      assert.ok(canvas && canvas.width > 300, 'The real drawing canvas is visible');
      for (const [tool, type, offset] of [['RECT', 'rect', .3]]) {
        await page.locator('[data-tool="' + tool + '"]').click();
        const ids = (await objects()).map(o => o.id);
        await startReadProbe();
        const drawCanvas = await page.locator('#canvas').boundingBox();
        const x = drawCanvas.x + drawCanvas.width * offset, y = drawCanvas.y + drawCanvas.height * .38;
        assert.equal((await snapshot()).activeTool, tool, 'Toolbar arms the requested drawing tool');
        await page.mouse.move(x, y); await page.mouse.down();
        const readsAtStart = await defaultsReads();
        assert.ok(readsAtStart >= 1, 'Drawing captures persisted defaults at pointer-down');
        await page.mouse.move(x + 85, y + 52, { steps: 8 });
        const draft = (await snapshot()).draft;
        if (draft?.type !== type) {
          console.error('Real creation diagnostics', type, await snapshot(), await page.evaluate(({x,y}) => {
            const e = document.elementFromPoint(x, y);
            return { x, y, topmost: e?.outerHTML.slice(0, 1000) };
          }, {x,y}));
          await page.screenshot({ path: path.join(evidence, name + '-creation-failure.png') });
        }
        assert.equal(draft?.type, type, 'Real drag publishes a ' + type + ' draft');
        assert.equal(draft.strokeWidth, saved.strokeWidth, 'Saved width is visible during drag');
        assert.equal(draft.strokeLevel, saved.strokeLevel, 'Saved gray is visible during drag');
        if (type === 'rect') assert.equal(draft.fillLevel, saved.fillLevel, 'Saved fill is visible during drag');
        await page.mouse.up();
        assert.equal(await defaultsReads(), readsAtStart, 'Move/final use the captured defaults without storage reads');
        await stopReadProbe();
        const created = (await objects()).find(o => o.type === type && !ids.includes(o.id));
        assert.ok(created, 'Pointer-up creates a real ' + type);
        assert.equal(created.strokeWidth, saved.strokeWidth);
        assert.equal(created.strokeLevel, saved.strokeLevel);
        if (type === 'rect') assert.equal(created.fillLevel, saved.fillLevel);
      }
      await page.locator('#tool-text-merged').click();
      await page.locator('#chooser-text [data-tool="T"]').click();
      await page.mouse.click(canvas.x + canvas.width * .4, canvas.y + canvas.height * .65);
      const editor = page.locator('.unified-text-editor');
      await editor.waitFor({ state: 'visible' });
      assert.equal(await editor.locator('.unified-style-size').inputValue(), '14', 'New text editor starts with saved pt size');
      assert.equal(await editor.locator('.unified-style-select').inputValue(), saved.textFont, 'Saved custom font enters the real text editor');
      await editor.locator('textarea').fill('도구 기본값 검증');
      await editor.getByRole('button', { name: '확인', exact: true }).click();
      const text = (await objects()).find(o => o.type === 'text' && o.text === '도구 기본값 검증');
      assert.ok(text, 'Typing and confirming persists a real text object');
      assert.ok(Math.abs(text.fontSize - saved.textSizeMm) < 1e-12, 'New text uses the saved pt-to-mm size');
      assert.equal(text.fontFamily, saved.textFont);
      assert.deepEqual((await objects()).find(o => o.id === 'existing-ruler'), before[0], 'Actual creation leaves the earlier gauge unchanged');
      // Line uses two clicks, not the rect drag pipeline. Test it separately so
      // a makeShape-only integration cannot appear to cover every toolbar tool.
      await page.locator('[data-tool="L"]').click();
      const lineCanvas = await page.locator('#canvas').boundingBox();
      const x = lineCanvas.x + lineCanvas.width * .55, y = lineCanvas.y + lineCanvas.height * .38;
      await startReadProbe();
      await page.mouse.click(x, y);
      assert.equal(await defaultsReads(), 1, 'Line captures defaults once on its first point');
      await page.mouse.move(x + 85, y + 52, { steps: 8 });
      const lineDraft = (await snapshot()).draft;
      assert.equal(lineDraft?.type, 'polyline', 'First point creates the real rubber-band line preview');
      await page.mouse.click(x + 85, y + 52);
      assert.equal(await defaultsReads(), 1, 'Line movement and second-point commit do not reread defaults');
      await stopReadProbe();
      const line = (await objects()).find(o => o.type === 'line');
      assert.ok(line, 'Second point commits a real line');
      // Check these contracts after both browsers finish, so an unwired line
      // pipeline still fails the test without hiding settings/backup coverage.
      lineContracts.push({ name, draft: lineDraft, line, saved });
      assert.deepEqual((await objects()).find(o => o.id === 'existing-ruler'), before[0], 'Line creation also leaves the existing gauge unchanged');

      // Polyline/curve have a third lifecycle: multiple real vertex clicks and
      // Enter to finish. Each gesture must capture once, style every preview,
      // and retain that snapshot through later clicks and the final commit.
      for (const [tool, type, row] of [['P', 'polyline', .56], ['C', 'curve', .76]]) {
        await page.locator('[data-tool="' + tool + '"]').click();
        assert.equal((await snapshot()).activeTool, tool, type + ': toolbar arms the tool');
        const ids = (await objects()).map(o => o.id);
        const box = await page.locator('#canvas').boundingBox();
        const points = [[.24, row], [.32, row - .08], [.4, row]]
          .map(([dx, dy]) => ({ x: box.x + box.width * dx, y: box.y + box.height * dy }));
        await startReadProbe();
        try {
          await page.mouse.click(points[0].x, points[0].y);
          assert.equal(await defaultsReads(), 1, type + ': first point captures defaults once');
          for (const point of points.slice(1)) {
            await page.mouse.move(point.x, point.y, { steps: 12 });
            const preview = (await snapshot()).draft;
            assert.equal(preview?.type, type, type + ': moving the pointer publishes the correct preview');
            assert.equal(preview.strokeWidth, saved.strokeWidth, type + ': preview uses saved width');
            assert.equal(preview.strokeLevel, saved.strokeLevel, type + ': preview uses saved gray');
            assert.equal(preview.fillLevel, saved.fillLevel, type + ': preview retains saved fill for closed shapes');
            assert.equal(await defaultsReads(), 1, type + ': pointer frames do not reread defaults');
            assert.deepEqual((await objects()).find(o => o.id === 'existing-ruler'), before[0], type + ': moving preview leaves the existing gauge untouched');
            await page.mouse.click(point.x, point.y);
            assert.equal(await defaultsReads(), 1, type + ': later vertex clicks reuse the snapshot');
          }
          await page.keyboard.press('Enter');
          assert.equal(await defaultsReads(), 1, type + ': Enter commit reuses the same snapshot');
          const finished = await snapshot();
          const created = finished.objects.find(o => o.type === type && !ids.includes(o.id));
          assert.ok(created, type + ': Enter commits the real clicked object');
          assert.equal(created.points.length, points.length, type + ': only the three clicked vertices are committed');
          assert.equal(created.strokeWidth, saved.strokeWidth, type + ': committed width matches the preview');
          assert.equal(created.strokeLevel, saved.strokeLevel, type + ': committed gray matches the preview');
          assert.equal(created.fillLevel, saved.fillLevel, type + ': committed fill keeps its arbitrary value');
          assert.equal(finished.draft, null, type + ': Enter clears the preview');
          assert.equal(finished.activeTool, 'V', type + ': Enter returns to selection');
          assert.deepEqual(finished.objects.find(o => o.id === 'existing-ruler'), before[0], type + ': creation preserves the earlier gauge exactly');
        } finally { await stopReadProbe(); }
      }
      fs.writeFileSync(path.join(evidence, name + '-creation.json'), JSON.stringify(await snapshot(), null, 2));

      await page.locator('#settings-menu-btn').click(); await page.locator('#open-screen').click();
      const pref = page.getByRole('dialog', { name: '환경 설정', exact: true });
      const grid = () => page.evaluate(async query => structuredClone((await import('/js/state.js' + query)).state.get().grid), moduleQuery);
      const beforeGrid = await grid();
      await page.locator('#pref-grid-visible').check(); await page.locator('#pref-grid-interval').fill('17');
      assert.deepEqual(await grid(), beforeGrid, 'Preference draft has no live canvas effect');
      await page.locator('#pref-grid-reset').click();
      assert.equal(await page.locator('#pref-grid-interval').inputValue(), '10');
      await page.locator('#pref-grid-visible').check(); await page.locator('#pref-grid-interval').fill('17');
      await page.locator('#pref-grid-save').click();
      assert.equal((await grid()).visible, true); assert.equal((await grid()).interval, 17);
      assert.equal((await stored()).textSizeMm, saved.textSizeMm, 'Grid save preserves tool defaults');
      await pref.getByRole('tab', { name: '저장', exact: true }).click();
      await page.locator('#pref-print-comparison').click();
      await page.getByRole('dialog', { name: '인쇄 비교 이미지', exact: true }).waitFor({ state: 'visible' });
      const file = { name: 'comparison.png', mimeType: 'image/png', buffer: fs.readFileSync(path.join(__dirname, 'fixtures/rights-clear-smoke.png')) };
      await page.locator('#defaults-pbg-file').setInputFiles(file);
      await page.locator('[data-print-close]').click();
      const backgrounds = () => page.evaluate(() => JSON.parse(localStorage.getItem('5e.preview:5e.previewBackgrounds') || '[]'));
      assert.deepEqual(await backgrounds(), [], 'Choosing a file and closing does not register it');
      await page.locator('#file-menu-btn').click(); await page.locator('#image-export').click();
      await page.locator('#export-comparison-settings').click();
      await page.getByRole('dialog', { name: '인쇄 비교 이미지', exact: true }).waitFor({ state: 'visible' });
      await page.locator('#defaults-pbg-file').setInputFiles(file); await page.locator('#defaults-pbg-add').click();
      await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('5e.preview:5e.previewBackgrounds') || '[]').length);
      assert.equal((await backgrounds()).length, 1, 'Explicit registration retains the print comparison feature');
      await page.locator('.settings-print-item').getByRole('button', { name: /삭제/ }).click();
      const confirm = page.getByRole('alertdialog', { name: /이미지 삭제/ });
      await confirm.getByRole('button', { name: '취소', exact: true }).click();
      assert.equal((await backgrounds()).length, 1, 'Delete cancellation preserves the comparison image');
      await page.locator('[data-print-close]').click();

      await page.evaluate(() => { window.showSaveFilePicker = undefined; });
      await page.locator('#settings-menu-btn').click(); await page.locator('#settings-export').click();
      const backup = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: /전체 저장 \(백업\)/ }) });
      await backup.locator('#sx-project').uncheck();
      const downloadEvent = page.waitForEvent('download');
      await backup.getByRole('button', { name: '저장', exact: true }).click();
      const download = await downloadEvent;
      const filename = path.join(evidence, name + '-settings-backup.zip');
      await download.saveAs(filename);
      const payload = await page.evaluate(async ({query, bytes}) => {
        const { parseBackupZip } = await import('/js/backup-zip.js' + query);
        return parseBackupZip(new Uint8Array(bytes));
      }, { query: moduleQuery, bytes: [...fs.readFileSync(filename)] });
      assert.equal(JSON.parse(payload.data['phyDraw.defaults']).textSizeMm, saved.textSizeMm, 'Real ZIP export retains mm schema');
      assert.deepEqual(JSON.parse(payload.data['phyDraw.defaults']).futureSetting, original.futureSetting);
      await page.locator('input[type="file"][accept=".zip,application/zip,.json,application/json"]').setInputFiles({ name: 'legacy-settings.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ kind: '5E-settings', version: '1', data: { 'phyDraw.defaults': JSON.stringify(original) } })) });
      await page.waitForFunction(({ key, original }) => JSON.stringify(JSON.parse(localStorage.getItem(key))) === JSON.stringify(original), { key, original });
      assert.deepEqual(await stored(), original, 'Legacy mm JSON import remains compatible');
      assert.equal((await grid()).interval, 10, 'Imported grid settings apply');

      await openDefaults();
      await page.locator('#defaults-overlay').evaluate(async overlay => {
        await Promise.all(overlay.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})));
      });
      await page.screenshot({ path: path.join(evidence, name + '-desktop.png') });
      await page.setViewportSize({ width: 390, height: 844 });
      const fit = await page.locator('#defaults-overlay .modal').evaluate(element => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, bottom: rect.bottom, scroll: element.scrollWidth, width: element.clientWidth, viewport: innerWidth };
      });
      assert.ok(fit.left >= 0 && fit.right <= fit.viewport + 1, 'Compact defaults fit a narrow viewport');
      assert.ok(fit.scroll <= fit.width + 1, 'No horizontal scroll in defaults');
      await page.screenshot({ path: path.join(evidence, name + '-narrow.png') });
      await page.keyboard.press('Escape');
      assert.deepEqual(await stored(), original, 'Escape discards a draft');
      assert.deepEqual(errors, [], 'Settings journeys have no uncaught errors');
      console.log(name + ': real rect drag, L two-click, P/C three-click + Enter, text creation, one defaults read per click gesture, unchanged existing gauge, exact mm/gray/font preservation, explicit save/cancel/quota retry, grid preferences, export comparison entry, real ZIP and legacy JSON, desktop/narrow passed; line style contracts checked after both engines');
      await context.close();
    } finally { await browser.close(); }
  }
  for (const { name, draft, line, saved } of lineContracts) {
    assert.equal(draft.strokeWidth, saved.strokeWidth, name + ': click-to-click preview applies saved width');
    assert.equal(draft.strokeLevel, saved.strokeLevel, name + ': click-to-click preview applies saved gray');
    assert.equal(line.strokeWidth, saved.strokeWidth, name + ': committed line applies saved width');
    assert.equal(line.strokeLevel, saved.strokeLevel, name + ': committed line applies saved gray');
  }
  console.log('Real toolbar creation contracts passed in both engines');
}).catch(error => { console.error(error); process.exitCode = 1; });
