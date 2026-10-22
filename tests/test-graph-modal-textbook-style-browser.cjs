// Fixed graph source: b1846e849656076b1c0c5da2f82abffff3813eb1:tests/test-graph-modal-textbook-style-browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('./helpers/graph-source-signals.cjs').loadPlaywright();
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/graph-reconstruction/linear.json'), 'utf8'));
const evidence = process.env.EVIDENCE_DIR;
assert(evidence, 'EVIDENCE_DIR required');
fs.mkdirSync(evidence, { recursive: true });

(async () => {
  const reports = [];
  for (const [browserName, engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.addInitScript(() => {
        window.showSaveFilePicker = undefined;
        window.showDirectoryPicker = undefined;
        localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
        localStorage.setItem('5e.tutorial.bannerSeen', 'true');
      });
      await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:62759/', { waitUntil: 'networkidle' });
      const planeId = await page.evaluate(async plan => {
        const v = '?v=1.7.0-four-session-integration';
        const { state } = await import('/js/state.js' + v);
        const { insertNativeGraph } = await import('/js/graph/native-graph.js' + v);
        state.update(s => { s.objects = []; s.groups = []; s.undoStack = []; s.redoStack = []; });
        const inserted = insertNativeGraph(state, plan);
        if (!inserted.ok) throw Error(JSON.stringify(inserted));
        state.update(s => {
          const plane = s.objects.find(o => o.id === inserted.planeId);
          plane.guideStyle = { strokeWidth: .14, dashLength: 0, dashGap: 0 };
          plane.legends = [{ x: 1, y: 1, size: 1.234567, swatch: 3.456789, rows: [{ label: '물질 A', dash: 'solid' }] }];
          plane.gridStyle = { strokeWidth: .071234, dashLength: .33, dashGap: .44 };
          plane.showGridX = true; plane.showGridY = false;
        });
        return inserted.planeId;
      }, fixture);
      const snap = () => page.evaluate(async () => structuredClone((await import('/js/state.js?v=1.7.0-four-session-integration')).state.get().objects));
      const open = () => page.evaluate(async id => (await import('/js/graph/graph-modal.js?v=1.7.0-four-session-integration')).openGraphModal(id), planeId);
      const invalid = () => page.locator('#graph-modal-overlay :invalid').evaluateAll(inputs => inputs.map(i => ({ id: i.id, value: i.value, message: i.validationMessage })));
      await page.evaluate(async()=>{const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');state.update(s=>{s.objects.find(o=>o.type==='coordplane').graphAnnotations.push({id:'selected-guide',kind:'guide',text:'',x:2,y:2,orientation:'horizontal'});});});
      const before = await snap();
      await open();
      assert.deepEqual(await invalid(), [], `${browserName}: source style values must be valid`);
      await page.locator('#gm-confirm').click();
      assert.equal(await page.locator('#graph-modal-overlay').isVisible(), false, 'No-op must actually close the editor');
      assert.deepEqual(await snap(), before);
      await open();
      await page.locator('#gm-labelx').fill('편집 검증');
      await page.locator('#gm-labelx').dispatchEvent('change');
      await page.locator('#gm-confirm').click();
      assert.equal(await page.locator('#graph-modal-overlay').isVisible(), false);
      const edited = await snap();
      const plane = edited.find(o => o.id === planeId);
      assert.equal(plane.labelX, '편집 검증');
      for (const key of ['guideStyle', 'legends', 'gridStyle', 'showGridX', 'showGridY']) {
        assert.deepEqual(plane[key], before.find(o => o.id === planeId)[key], key);
      }
      for (const original of before.filter(o => o.type !== 'coordplane')) assert.deepEqual(edited.find(o => o.id === original.id), original);
      await open();
      await page.locator('#gm-tab-annot-btn').click();await page.locator('[aria-label="표시 1 선택"]').click();
      await page.locator('[aria-label="표시 1 선 굵기(mm)"]').fill('0');
      await page.locator('[aria-label="표시 1 선 굵기(mm)"]').dispatchEvent('change');
      await page.locator('#gm-confirm').click();
      assert.equal(await page.locator('#graph-modal-overlay').isVisible(), true);
      assert.deepEqual(await snap(), edited, 'Zero stroke width must remain invalid');
      await page.locator('[aria-label="표시 1 선 굵기(mm)"]').fill('0.14');
      await page.locator('[aria-label="표시 1 선 굵기(mm)"]').dispatchEvent('change');
      await page.locator('[aria-label="표시 1 점선 조각 길이(mm)"]').fill('0.333333');
      await page.locator('[aria-label="표시 1 점선 조각 길이(mm)"]').dispatchEvent('change');
      await page.locator('[aria-label="표시 1 점선 간격(mm)"]').fill('-1');
      await page.locator('[aria-label="표시 1 점선 간격(mm)"]').dispatchEvent('change');
      assert.equal(await page.locator('[aria-label="표시 1 점선 간격(mm)"]').inputValue(), '0', 'Committed negative dash gap clamps to the minimum');
      assert.deepEqual(await snap(), edited, 'Normalized changes stay in the isolated draft');
      // Empty input is still invalid; retain rejection and correction coverage.
      await page.locator('[aria-label="표시 1 점선 간격(mm)"]').fill('');
      await page.locator('[aria-label="표시 1 점선 간격(mm)"]').dispatchEvent('change');
      await page.locator('#gm-confirm').click();
      assert.equal(await page.locator('#graph-modal-overlay').isVisible(), true);
      assert.deepEqual(await snap(), edited, 'Invalid style edits must remain isolated');
      await page.locator('[aria-label="표시 1 점선 간격(mm)"]').fill('0');
      await page.locator('[aria-label="표시 1 점선 간격(mm)"]').dispatchEvent('change');
      assert.deepEqual(await invalid(), []);
      await page.locator('#gm-confirm').click();
      const styled = await snap();
      const styledPlane=styled.find(o=>o.id===planeId);assert.deepEqual(styledPlane.guideStyle,plane.guideStyle);for(const [key,value]of Object.entries({strokeWidth:.1,dashLength:.3,dashGap:0}))assert.equal(styledPlane.graphAnnotations[0][key],value);assert.deepEqual(styledPlane.gridStyle,plane.gridStyle);
      await page.locator('#file-menu-btn').click();
      await page.locator('#project-save').click();
      const downloading = page.waitForEvent('download');
      const explicit = page.locator('#project-save-download');
      if (await explicit.isVisible().catch(() => false)) await explicit.click();
      else await page.getByRole('button', { name: '저장', exact: true }).click();
      const projectPath = path.join(evidence, browserName + '-editable-graph.5e');
      await (await downloading).saveAs(projectPath);
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('#file-menu-btn').click();
      const chooser = page.waitForEvent('filechooser');
      await page.locator('#project-open').click();
      await (await chooser).setFiles(projectPath);
      await page.observeGraphSignal(id => import('/js/state.js?v=1.7.0-four-session-integration').then(({ state }) => state.get().objects.some(o => o.id === id)), planeId, undefined, async () => { await page.getByRole('button', { name: '열기', exact: true }).click(); });
      const reopened = await snap();
      for (const original of styled) {
        const loaded = reopened.find(o => o.id === original.id);
        for (const key of Object.keys(original)) assert.deepEqual(loaded[key], original[key], `Reopen ${original.type}.${key}`);
      }
      await open();
      assert.deepEqual(await invalid(), []);
      await page.locator('#gm-confirm').click();
      assert.equal(await page.locator('#graph-modal-overlay').isVisible(), false);
      assert.deepEqual(await snap(), reopened);
      assert.deepEqual(errors, []);
      reports.push({ browser: browserName, pass: true, aiCalls: 0, checks: ['solid guide and fractional legend values valid', 'no-op closes with objects exact', 'label edit preserves curves and grid fields', 'zero stroke and empty guide blocked; negative gap clamps; fractional edits round on commit', 'actual .5e download/reopen and repeated no-op preserve fields'] });
    } finally { await browser.close(); }
  }
  fs.writeFileSync(path.join(evidence, 'report.json'), JSON.stringify(reports, null, 2));
  console.log('PASS Chromium and WebKit: textbook style validity, exact no-op, isolated editing and save/reopen');
})().catch(e => { console.error(e); process.exitCode = 1; });
