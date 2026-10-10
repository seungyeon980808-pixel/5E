// Fixed graph source: b1846e849656076b1c0c5da2f82abffff3813eb1:tests/test-graph-editor-selection-workspace-browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('./helpers/graph-source-signals.cjs').loadPlaywright();
const version = '?v=1.7.0-four-session-integration';
const output = path.resolve(process.env.EVIDENCE_DIR || '.omo/evidence/graph-editor-selection-workspace');

async function install(page) {
  await page.evaluate(async version => {
    const { state } = await import('/js/state.js' + version);
    const { buildNativeGraph } = await import('/js/graph/native-graph.js' + version);
    const axis = (title, max) => ({ min: 0, max, step: 1, title, unit: '', scale: 'linear', ticks: [] });
    const plan = {
      schema: '5e.graph-reconstruction/v1',
      source: { id: 'selection-workspace', hash: 'synthetic', width: 400, height: 300, plotBox: { x: 40, y: 20, w: 320, h: 240 } },
      axes: { x: axis('시간', 4), y: axis('크기', 10), y2: axis('오른쪽', 20) },
      series: [
        { id: 'expression', kind: 'expression', axis: 'y', certainty: 'exact', coordinateSpace: 'data', expression: '2*x', domain: { min: .123456789, max: 4 }, dashPattern: [1.7, .6, .25, .4] },
        { id: 'polyline', kind: 'points', axis: 'y', certainty: 'exact', coordinateSpace: 'data', curveStyle: 'straight', points: [{ x: 0, y: 1 }, { x: 2, y: 3 }, { x: 4, y: 5 }] },
        { id: 'free', kind: 'points', axis: 'y', certainty: 'observed', coordinateSpace: 'data', curveStyle: 'smooth', points: [{ x: 0, y: 9 }, { x: 1, y: 8 }, { x: 3, y: 7 }, { x: 4, y: 8 }] },
        { id: 'scatter', kind: 'points', axis: 'y2', certainty: 'exact', coordinateSpace: 'data', lineVisible: false, markerShape: 'circle', markerSize: .8, points: [{ x: 1, y: 4 }, { x: 3, y: 6 }] },
        { id: 'bars', kind: 'bar', axis: 'y', certainty: 'exact', coordinateSpace: 'data', base: 0, items: [{ label: 'A', value: 2, fillLevel: 110 }, { label: 'B', value: 3, fillLevel: 200 }] }
      ],
      annotations: [
        { id: 'up', kind: 'arrow', text: '', x: 2, y: 5, to: { x: 2, y: 7 }, axis: 'y', orientation: 'horizontal' },
        { id: 'down', kind: 'arrow', text: '', x: 2, y: 5, to: { x: 2, y: 3 }, axis: 'y', orientation: 'horizontal' },
        { id: 'caption', kind: 'text', text: '긴 한글 이름과 수식 F_1 / F_2', x: 1, y: 2, seriesId: 'expression', anchorX: 1, axis: 'y', orientation: 'horizontal' },
        { id: 'guide', kind: 'guide', text: '', x: 1, y: 2, seriesId: 'expression', anchorX: 1, axis: 'y', orientation: 'horizontal' }
      ],
      regions: [
        { id: 'band', kind: 'x-band', axis: 'y', coordinateSpace: 'data', from: .5, to: .9, level: 210 },
        { id: 'rectangle', kind: 'rect', axis: 'y', coordinateSpace: 'data', xMin: 2.5, xMax: 3.5, yMin: 4, yMax: 6, level: 220 }
      ],
      review: []
    };
    let n = 0;
    const built = buildNativeGraph(plan, { box: { x: -40, y: -25, w: 80, h: 50 }, layerId: 1, nextId: () => n++ === 0 ? 'workspace-plane' : `workspace-${n}` });
    if (!built.ok) throw Error(built.error);
    const plane = built.objects[0];
    Object.assign(plane, {
      annMarkers: [{ x: .8, y: 6 }],
      annGuides: [{ x: 1.2, y: 6 }],
      annArrows: [{ x: 3, y: 8, tx: 3.5, ty: 9 }],
      guideLines: [{ x1: 0, y1: 6, x2: 4, y2: 6 }],
      annLabelPoints: [{ x: 3, y: 7, text: 'L' }],
      legends: [{ x: .5, y: 9, rows: [{ text: '관찰', dash: [2, 1], markerShape: 'circle', markerSize: .8 }] }]
    });
    state.update(s => {
      s.objects = [...built.objects.slice(1), plane];
      s.objects.forEach((o, i) => { o.order = i; });
      s.groups = built.groups; s.selectedIds = []; s.undoStack = []; s.redoStack = [];
      s.activeTool = 'V'; s.activeLayerId = 1;
    });
  }, version);
}

// Subscribe before the action. DOM mutations and input events are the signal;
// the timer is only a failure bound, never a delay or a polling loop.
async function observe(page, predicate, action) {
  await page.evaluate(source => {
    const check = new Function(`return (${source})`)();
    window.__workspaceSignal = new Promise((resolve, reject) => {
      const observer = new MutationObserver(done);
      const timer = setTimeout(() => { cleanup(); reject(Error('Workspace signal timed out: ' + source)); }, 5000);
      function cleanup() { clearTimeout(timer); observer.disconnect(); document.removeEventListener('input', done, true); }
      function done() { if (check()) { cleanup(); resolve(); } }
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
      document.addEventListener('input', done, true);
      done();
    });
  }, predicate.toString());
  await action();
  await page.evaluate(() => window.__workspaceSignal);
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const reports = [];
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1080 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [], scenarios = [];
    page.on('pageerror', e => errors.push(String(e)));
    await context.route('**/api/**', route => route.abort());
    await page.addInitScript(() => {
      localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
      localStorage.setItem('5e.tutorial.bannerSeen', 'true');
      localStorage.setItem('5e.preview:5e.mode', 'pro');
    });
    const snap = () => page.evaluate(async version => {
      const s = (await import('/js/state.js' + version)).state.get();
      return JSON.parse(JSON.stringify({ objects: s.objects, groups: s.groups }));
    }, version);
    const open = () => page.evaluate(async version => (await import('/js/graph/graph-modal.js' + version)).openGraphModal('workspace-plane'), version);
    const chip = i => page.locator(`#gm-chips [data-series-index="${i}"]`);
    const select = i => chip(i).click();
    const change = async (selector, value, event = 'change') => {
      await page.locator(selector).fill(String(value)); await page.locator(selector).dispatchEvent(event);
    };
    const shoot = suffix => page.locator('.gm-modal').screenshot({ path: path.join(output, `${name}-${suffix}.png`) });
    const curve = (s, id) => s.objects.find(o => o.reconstruction?.seriesId === id);
    const selectedDisplay = async () => {
      assert.equal(await page.locator('#gm-display-list .gm-display-select[aria-pressed="true"]').count(), 1);
      assert.equal(await page.locator('#gm-display-properties .gm-annotation-editor:visible, #gm-display-properties .gm-region-editor:visible').count(), 1);
    };
    try {
      await page.goto((process.env.PREVIEW_URL || 'http://127.0.0.1:62759/') + '?mode=pro', { waitUntil: 'networkidle' });
      await install(page); const before = await snap(); await open();
      for (const id of ['coord', 'func', 'annot']) assert.equal(await page.locator(`#gm-tab-${id}-btn`).count(), 1);
      assert.equal(await page.locator('#gm-adv-panel #gm-engine-controls').count(), 1);
      assert.equal(await page.locator('#gm-adv-panel #gm-y2-on').count(), 1);
      await page.locator('#gm-tab-func-btn').click();
      assert.equal(await chip(0).getAttribute('aria-pressed'), 'true');
      for (const type of ['expr', 'poly', 'free', 'bar']) {
        await page.locator(`#gm-sub-${type}`).click();
        assert.equal(await page.locator('#gm-chips .gm-series-chip:visible').count(), 5);
        assert.equal(await page.locator('#gm-chips .gm-series-kind').count(), 5);
        assert.equal(await page.locator('#gm-chips .gm-series-swatch').count(), 5);
        assert.equal(await chip(0).getAttribute('aria-pressed'), 'true', 'New type does not change selected series');
        assert.equal(await page.locator('#gm-expr').inputValue(), '2*x');
        assert.equal(await page.locator('#gm-chips button button, #gm-chips [role="button"]').count(), 0);
      }
      for (const i of [1, 2, 3, 4]) {
        await select(i);
        assert.equal(await chip(i).getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('#gm-chips [aria-pressed="true"]').count(), 1);
      }
      await select(1);
      assert.equal(await page.locator('#gm-point-detail').evaluate(el => el.open), false);
      assert.equal(await page.locator('#gm-engine-data-details').evaluate(el => el.open), false);
      assert.equal(await page.locator('#gm-engine-fit-details').evaluate(el => el.open), false);
      await page.locator('#gm-point-detail summary').click(); await page.locator('#gm-point-detail summary').click();
      await select(4); assert.equal(await page.locator('#gm-engine-bar-details').evaluate(el => el.open), false);
      await select(2);
      await page.locator('#gm-tab-coord-btn').click();
      await page.locator('#gm-preview [data-preview-series="1"]').focus();
      await page.locator('#gm-preview [data-preview-series="1"]').press('Enter');
      assert.equal(await chip(1).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#gm-pts').inputValue(), '0,1 4,5', 'Reconstructed collinear geometry uses endpoints');
      await select(0); await page.locator('#gm-box-drag').click();
      await page.locator('#gm-tab-coord-btn').click(); await page.locator('#gm-tab-func-btn').click();
      assert.equal(await chip(0).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#gm-box-note').isVisible(), false, 'Coordinate tab stops range mode');
      await shoot('mixed-series');
      await page.locator('#gm-confirm').click();
      assert.deepEqual(await snap(), before, 'Selection, tabs, collapsed sections preserve all native fields, IDs, order, groups and guide anchors');
      scenarios.push('all representations remain visible; new type is independent; graph and list selection agree; exact no-change apply');

      await open(); await page.locator('#gm-tab-func-btn').click(); await select(1);
      await page.locator('#gm-pts').fill('0,1 2,3.5 4,5'); // Leave the native change event pending.
      const expressionPoint = await page.locator('#gm-preview [data-preview-series="0"] path:not([data-preview-hit])').first().evaluate(el => {
        for(const fraction of [.43,.35,.65,.87]) {
          const q=el.getPointAtLength(el.getTotalLength()*fraction),p=el.ownerSVGElement.createSVGPoint();
          p.x=q.x;p.y=q.y;const screen=p.matrixTransform(el.getScreenCTM());
          const target=document.elementFromPoint(screen.x,screen.y);
          if(target?.closest('[data-preview-series]')?.dataset.previewSeries==='0')return {x:screen.x,y:screen.y};
        }
        throw Error('The expression must have visible, unobscured paint for pointer selection');
      });
      await page.mouse.click(expressionPoint.x,expressionPoint.y);
      assert.equal(await chip(0).getAttribute('aria-pressed'),'true');
      await select(1);assert.deepEqual((await page.locator('#gm-pts').inputValue()).trim().split(/\s+/).map(pair=>pair.split(',').map(Number)),[[0,1],[2,3.5],[4,5]]);
      await page.locator('#gm-confirm').click();
      const pendingEdited=await snap();assert.equal(curve(pendingEdited,'polyline').mathPoints[1].y,3.5);
      assert.deepEqual(curve(pendingEdited,'expression'),curve(before,'expression'),'Pending coordinate blur must not overwrite the newly selected expression');
      await install(page);
      scenarios.push('pending native coordinate changes settle on their original series before graph selection');

      await open(); await page.locator('#gm-tab-func-btn').click(); await select(1);
      await change('#gm-pts', '0,1 2,3.125 4,5'); await page.locator('#gm-confirm').click();
      const edited = await snap();
      assert.equal(curve(edited, 'polyline').mathPoints[1].y, 3.1, 'Direct coordinate edits commit one decimal');
      for (const o of before.objects.filter(o => o.id !== curve(before, 'polyline').id)) assert.deepEqual(edited.objects.find(q => q.id === o.id), o);
      await open(); await page.locator('#gm-preview [data-preview-series="1"]').focus();
      await page.locator('#gm-preview [data-preview-series="1"]').press('Enter');
      assert.equal(await page.locator('#gm-pts').inputValue(), '0,1 2,3.1 4,5', 'Graph selection exposes the same edited series');
      await change('#gm-pts', '0,1 4,5'); await page.locator('#gm-confirm').click();
      assert.deepEqual(await snap(), before, 'Editing through graph selection restores the same native data');
      await open(); await page.locator('#gm-tab-func-btn').click(); await select(1);
      await page.locator('#gm-chips [data-delete-series="1"]').click();
      assert.equal(await page.locator('#gm-chips .gm-series-chip').count(), 4);
      await page.locator('#gm-cancel').click(); assert.deepEqual(await snap(), before);
      scenarios.push('selected series edit isolates other data; selected deletion and Cancel retain originals');

      await install(page); await open(); await page.locator('#gm-tab-annot-btn').click();
      assert.equal(await page.locator('#gm-context').getAttribute('data-editing-tab'), 'annot');
      assert.equal(await page.locator('#gm-display-list .gm-display-select').count(), 12);
      assert.equal(await page.locator('#gm-display-properties .gm-annotation-editor:visible, #gm-display-properties .gm-region-editor:visible').count(), 0);
      for (const id of ['up', 'down', 'caption', 'guide']) {
        await page.locator(`.gm-display-select[data-annotation-id="${id}"]`).click(); await selectedDisplay();
      }
      for (const kind of ['marker', 'guide', 'arrow', 'guideline', 'labelpt', 'legend']) {
        await page.locator(`.gm-display-select[data-display-kind="${kind}"]`).click(); await selectedDisplay();
      }
      await page.locator('.gm-display-select[data-display-kind="legend"]').press('Delete');
      const legacyArrow=page.locator('#gm-preview [data-display-kind="arrow"][tabindex]').first();
      const arrowPoint=await legacyArrow.evaluate(el=>{
        const b=el.getBBox(),p=el.ownerSVGElement.createSVGPoint();p.x=b.x+b.width/2;p.y=b.y+b.height/2;
        const screen=p.matrixTransform(el.getScreenCTM());return {x:screen.x,y:screen.y};
      });
      await page.evaluate(()=>document.addEventListener('mousedown',e=>{
        window.__legacyArrowPainted=!!e.target.closest('[data-display-kind="arrow"]')?.hasAttribute('tabindex');
      },{capture:true,once:true}));
      await page.mouse.click(arrowPoint.x,arrowPoint.y);await selectedDisplay();
      assert(await page.evaluate(()=>window.__legacyArrowPainted),'The pointer must hit the visible arrow, not only its transparent hit stroke');
      assert.equal(await page.locator('.gm-display-select[data-display-kind="arrow"]').getAttribute('aria-pressed'),'true');
      await page.locator('#gm-cancel').click();assert.deepEqual(await snap(),before);
      await open();await page.locator('#gm-tab-annot-btn').click();
      scenarios.push('visible legacy arrow paint and its transparent hit stroke select the same list item');
      for (const index of [1, 2, 1]) {
        await page.locator(`[aria-label="영역 ${index} 화면에서 조절"]`).click(); await selectedDisplay();
        assert.equal(await page.locator('#gm-preview [data-region-editor]').getAttribute('data-region-editor'), index === 1 ? 'band' : 'rectangle');
      }
      const shape = page.locator('#gm-preview [data-graph-annotation-shape="down"]:not([data-annotation-hit])').first();
      await shape.focus(); await shape.press('Space'); await selectedDisplay();
      assert.equal(await page.locator('.gm-display-select[data-annotation-id="down"]').getAttribute('aria-pressed'), 'true');
      const middle = await page.locator('#gm-preview [data-graph-annotation-shape="up"]:not([data-annotation-hit])').first().evaluate(el => {
        const b = el.getBBox(), p = el.ownerSVGElement.createSVGPoint();
        p.x = b.x + b.width / 2; p.y = b.y + b.height / 2;
        const q = p.matrixTransform(el.getScreenCTM()); return { x: q.x, y: q.y };
      });
      await page.mouse.click(middle.x + 3, middle.y); await selectedDisplay();
      assert.equal(await page.locator('.gm-display-select[data-annotation-id="up"]').getAttribute('aria-pressed'), 'true');
      await page.locator('.gm-display-select[data-annotation-id="up"]').click();
      await page.locator('.gm-annotation-editor:visible summary').click();
      await change('[aria-label="표시 1 끝 y"]', 7.123456789);
      await page.locator('#gm-cancel').click(); assert.deepEqual(await snap(), before);
      await open(); await page.locator('#gm-tab-annot-btn').click();
      await page.locator('[aria-label="영역 1 화면에서 조절"]').click();
      const handle = page.locator('#gm-preview [data-region-handle="0"]');
      await handle.scrollIntoViewIfNeeded(); const box = await handle.boundingBox(); assert(box);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2);
      await page.keyboard.press('Escape'); await page.mouse.up();
      assert.equal(await page.locator('.gm-modal').isVisible(), true);
      await shoot('selected-region'); await page.locator('#gm-confirm').click(); assert.deepEqual(await snap(), before);
      scenarios.push('one shared selected display editor across overlapping arrows, legacy decorations, legend and multiple regions; Escape cancels drag first');

      await open(); await page.locator('#gm-tab-func-btn').click(); await select(0);
      const invalid = 'sin(';
      await observe(page, () => document.querySelector('#gm-expr')?.getAttribute('aria-invalid') === 'true', () => change('#gm-expr', invalid, 'input'));
      assert.equal(await page.locator('#gm-expr').inputValue(), invalid);
      const described = await page.locator('#gm-expr').getAttribute('aria-describedby'); assert(described);
      const error = page.locator(`[id="${described.split(/\s+/).find(id => id.includes('error'))}"]`);
      assert.equal(await error.getAttribute('role'), 'status'); assert((await error.textContent()).trim());
      await select(1); await page.locator('#gm-tab-coord-btn').click();
      await page.locator('#gm-confirm').click();
      assert.equal(await page.locator('.gm-modal').isVisible(), true);
      assert.equal(await chip(0).getAttribute('aria-pressed'), 'true', 'Apply reveals invalid hidden series');
      assert.equal(await page.locator('#gm-expr').inputValue(), invalid);
      assert.deepEqual(await snap(), before);
      await shoot('invalid-expression'); await page.locator('#gm-cancel').click();
      scenarios.push('invalid expression retains input, near-input status and aria-invalid; Apply reveals bad series without committing');

      const opener = page.locator('#ai-image-install-open'); await opener.focus();
      await open();
      await page.locator('.gm-modal').evaluate(modal => {
        const nodes = [...modal.querySelectorAll('button,input,select,textarea,summary,[tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
        window.__workspaceFocus = { first: nodes[0], last: nodes.at(-1) }; nodes[0].focus();
      });
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate(() => document.activeElement === window.__workspaceFocus.last), true);
      await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement === window.__workspaceFocus.first), true);
      await page.keyboard.press('Escape'); assert.equal(await page.locator('.gm-modal').isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'ai-image-install-open');
      scenarios.push('focus wraps in both directions and Escape restores opener');

      for (const [width, height, zoom] of [[1600, 1080, 1], [980, 900, 1], [720, 800, 1], [480, 800, 1], [800, 540, 2]]) {
        await page.setViewportSize({ width, height }); await open();
        // A halved CSS viewport gives the effective UI space of desktop 200% zoom,
        // unlike deviceScaleFactor, which changes only raster density.
        const layout = await page.evaluate(() => {
          const modal = document.querySelector('.gm-modal'), content = document.querySelector('.gm-tab-content');
          return { modal: modal.scrollWidth - modal.clientWidth, content: content.scrollWidth - content.clientWidth, scroll: getComputedStyle(content).overflowY };
        });
        assert(layout.modal <= 1 && layout.content <= 1, `No horizontal overflow ${width}px / ${zoom * 100}% effective zoom`);
        assert(['auto', 'scroll'].includes(layout.scroll));
        for (const id of ['#gm-tab-coord-btn', '#gm-tab-func-btn', '#gm-tab-annot-btn', '#gm-confirm', '#gm-cancel']) {
          const b = await page.locator(id).boundingBox(); assert(b && b.width > 0 && b.height > 0);
          assert(b.x >= 0 && b.y >= 0 && b.x + b.width <= width + 1 && b.y + b.height <= height + 1, `${id} reachable at ${width}px`);
        }
        await page.locator('#gm-tab-coord-btn').click();await page.locator('#gm-adv-open').focus();await page.keyboard.press('Enter'); await page.locator('#gm-style-detail summary').click();await page.locator('#gm-engine-arrowScale').scrollIntoViewIfNeeded();
        await page.locator('#gm-tab-func-btn').click(); await select(1);
        await page.locator('#gm-engine-data-details summary').click(); await page.locator('#gm-engine-data-apply').scrollIntoViewIfNeeded();
        await shoot(`responsive-${width}-${zoom}`); await page.locator('#gm-cancel').click(); assert.deepEqual(await snap(), before);
      }
      scenarios.push('independent content scrolling and reachable major controls at desktop, narrow widths and 200% effective zoom');
      assert.deepEqual(errors, []); reports.push({ browser: name, pass: true, providerCalls: 0, scenarios });
    } catch (error) {
      await page.screenshot({ path: path.join(output, `${name}-failure.png`) });
      fs.writeFileSync(path.join(output, `${name}-failure.json`), JSON.stringify({ error: error.stack, errors, scenarios }, null, 2));
      throw error;
    } finally { await browser.close(); }
  }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports));
})().catch(error => { console.error(error); process.exitCode = 1; });
