// Fixed graph source: b1846e849656076b1c0c5da2f82abffff3813eb1:tests/test-graph-workbench-result-stability-browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('./helpers/graph-source-signals.cjs').loadPlaywright();
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/graph-reconstruction/linear.json'), 'utf8'));
fixture.axes.x.ticks = [{ value: 1, label: 't_0', displayMath: 't_0' }];
fixture.axes.y.ticks = [{ value: 2, label: '값 2' }];
fixture.axes.y2 = { scale: 'linear', title: '오른쪽 축', unit: '', min: 0, max: 8, step: 2, ticks: [{ value: 4, label: '4' }] };
const evidence = process.env.EVIDENCE_DIR;
assert(evidence, 'EVIDENCE_DIR required'); fs.mkdirSync(evidence, { recursive: true });

(async () => {
  const reports = [];
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
      const errors = []; page.on('pageerror', e => errors.push(String(e)));
      await page.addInitScript(() => {
        localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
        localStorage.setItem('5e.tutorial.bannerSeen', 'true');
        window.showSaveFilePicker = undefined; window.showDirectoryPicker = undefined;
      });
      await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:62759/', { waitUntil: 'networkidle' });
      const guards = await page.evaluate(async plan => {
        const v = '?v=1.7.0-four-session-integration';
        const api = await import('/js/graph/workbench-result.js' + v);
        const { state } = await import('/js/state.js' + v);
        state.update(s => { s.objects = []; s.groups = []; s.undoStack = []; s.redoStack = []; });
        const result = api.buildWorkbenchGraph(plan, plan.source);
        const resultBefore = JSON.stringify(result);
        window.__graphStability = { result, applied: [], closed: 0 };
        const series = r => r.objects.find(o => o.type === 'funcgraph');
        const plane = r => r.objects.find(o => o.type === 'coordplane');
        const mutations = {
          criticalGuide: r => r.plan.annotations.push({ id: 'contradictory-guide', kind: 'guide', axis: 'y', coordinateSpace: 'data', orientation: 'horizontal', x: 0, y: 0, to: { x: 2, y: 2 } }),
          recoveredCriticalGuide: r => {
            const recovered = JSON.parse(JSON.stringify(r));
            recovered.plan.annotations.push({ id: 'saved-contradictory-guide', kind: 'guide', axis: 'y', coordinateSpace: 'data', orientation: 'horizontal', x: 0, y: 0, to: { x: 2, y: 2 } });
            Object.assign(r, recovered);
          },
          nullObject: r => r.objects.push(null),
          nullPoint: r => series(r).points = [null],
          nonfinitePoint: r => series(r).points[0].x = Infinity,
          nullMarker: r => series(r).markers = [null],
          nullMathPoint: r => series(r).mathPoints = [null],
          nullEndpoint: r => series(r).endpointMarkers = [null],
          endpointOutsidePath: r => series(r).endpointMarkers = [{ index: 999999, kind: 'open' }],
          nullGuide: r => series(r).guideSegs = [null],
          nullArrowPolygon: r => series(r).arrowPolys = [null],
          nullHandle: r => series(r).handles = [null],
          nullArrowMark: r => series(r).arrowMarks = [null],
          nullAnnotation: r => plane(r).graphAnnotations = [null],
          nullTickX: r => plane(r).explicitTicksX = [null],
          nullTickY: r => plane(r).explicitTicksY = [null],
          nullTickY2: r => plane(r).y2 = { enabled: true, y2Min: 0, y2Max: 4, scale: 'linear', explicitTicks: [null], showTickY2: true },
          nullGroup: r => r.groups = [null],
          foreignGroupMember: r => r.groups[0].memberIds.push('unrelated-page-object'),
          malformedGroupMembers: r => r.groups[0].memberIds = null,
          duplicateId: r => series(r).id = plane(r).id,
          numericId: r => { plane(r).id = 42; series(r).planeId = 42; },
          foreignPlane: r => series(r).planeId = 'unrelated-page-plane',
          nonfiniteRange: r => plane(r).xMax = NaN,
          invertedRange: r => plane(r).yMax = plane(r).yMin,
        };
        const records = [];
        for (const [label, mutate] of Object.entries(mutations)) {
          const broken = structuredClone(result); mutate(broken);
          const before = JSON.stringify(state.get());
          const entrypoints = {
            validate: () => api.validateWorkbenchGraph(broken),
            render: () => api.workbenchGraphDataUrl(broken),
            edit: () => api.editWorkbenchGraph(broken),
            insert: () => api.insertWorkbenchGraph(state, broken),
          };
          const failures = [];
          for (const [entry, run] of Object.entries(entrypoints)) {
            try { await run(); failures.push({ entry, rejected: false }); }
            catch (error) { failures.push({ entry, rejected: true, name: error.name, message: error.message }); }
          }
          records.push({ label, failures, stateUnchanged: before === JSON.stringify(state.get()), resultUnchanged: resultBefore === JSON.stringify(window.__graphStability.result) });
        }
        const review = structuredClone(result);
        review.plan.series[0].analyticFitFailure = 'Insufficient reference units';
        review.plan.series[0].curveStyle = 'smooth';
        const quality = (await import('/js/graph/reconstruction-quality.js' + v)).auditGraphReconstructionQuality(review.plan);
        if (quality.status !== 'review') throw Error('Review allowance scenario must exercise review status');
        api.validateWorkbenchGraph(review);
        return records;
      }, fixture);
      for (const g of guards) {
        assert(g.stateUnchanged, `${name}: ${g.label} mutated page state`);
        assert(g.resultUnchanged);
        for (const f of g.failures) { assert(f.rejected, `${name}: ${g.label}.${f.entry} accepted`); assert.equal(f.name, 'Error', `${g.label}.${f.entry} must give a controlled error`); }
      }
      const original = await page.evaluate(() => structuredClone(window.__graphStability.result));
      const snap = () => page.evaluate(async () => structuredClone((await import('/js/state.js?v=1.7.0-four-session-integration')).state.get().objects));
      const start = () => page.evaluate(async () => {
        const t = window.__graphStability;
        (await import('/js/graph/workbench-result.js?v=1.7.0-four-session-integration')).editWorkbenchGraph(t.result, { onApply: r => t.applied.push(r), onClose: () => t.closed++ });
      });
      await start(); await page.locator('#gm-labelx').fill('취소된 라벨'); await page.locator('#gm-cancel').click();
      assert.equal(await page.locator('#graph-modal-overlay').isVisible(), false);
      assert.deepEqual(await snap(), []);
      assert.deepEqual(await page.evaluate(() => window.__graphStability.result), original);
      assert.equal(await page.evaluate(() => window.__graphStability.applied.length), 0);
      await start(); await page.locator('#gm-confirm').click();
      assert.equal(await page.locator('#graph-modal-overlay').isVisible(), false);
      assert.deepEqual(await page.evaluate(() => window.__graphStability.applied[0]), original);
      await start(); await page.locator('#gm-labelx').fill('편집한 시간'); await page.locator('#gm-labelx').dispatchEvent('change'); await page.locator('#gm-confirm').click();
      const edited = await page.evaluate(() => structuredClone(window.__graphStability.applied[1]));
      assert.equal(edited.objects.find(o => o.type === 'coordplane').labelX, '편집한 시간');
      assert.deepEqual(await snap(), []);
      assert.deepEqual(await page.evaluate(() => window.__graphStability.result), original);
      assert.equal(await page.evaluate(() => window.__graphStability.closed), 3);
      for (const o of original.objects.filter(o => o.type !== 'coordplane')) assert.deepEqual(edited.objects.find(x => x.id === o.id), o);
      const insertion = await page.evaluate(async edited => {
        const v = '?v=1.7.0-four-session-integration'; const { state } = await import('/js/state.js' + v);
        const api = await import('/js/graph/workbench-result.js' + v);
        state.update(s => { s.objects = [{ id: 'existing-line', type: 'line', p1: { x: 0, y: 0 }, p2: { x: 10, y: 10 }, layerId: s.activeLayerId }]; });
        const first = api.insertWorkbenchGraph(state, edited, { taskId: 'task', candidateId: 'candidate' });
        const second = api.insertWorkbenchGraph(state, edited, { taskId: 'task', candidateId: 'candidate' });
        const data = await api.workbenchGraphDataUrl(edited);
        const attachment = await api.workbenchGraphContextAttachment(edited, 'context');
        return { first, second, objects: structuredClone(state.get().objects), groups: structuredClone(state.get().groups), selected: structuredClone(state.get().selectedIds), undo: state.get().undoStack.length, data, attachment, result: edited };
      }, edited);
      assert.deepEqual(insertion.result, edited);
      assert.equal(insertion.objects.length, 1 + edited.objects.length * 2);
      assert.equal(new Set(insertion.objects.map(o => o.id)).size, insertion.objects.length);
      assert.deepEqual(insertion.selected, [insertion.second.planeId]);
      assert.equal(insertion.undo, 2);
      for (const item of [insertion.first, insertion.second]) {
        assert(item.ids.includes(item.planeId));
        const native = insertion.objects.filter(o => item.ids.includes(o.id));
        assert(native.every(o => o.aiTaskId === 'task' && o.aiCandidateId === 'candidate'));
        assert(native.filter(o => o.type === 'funcgraph').every(o => o.planeId === item.planeId));
        const group = insertion.groups.find(g => g.memberIds.includes(item.planeId));
        assert.deepEqual(new Set(group.memberIds), new Set(item.ids));
      }
      const svg = Buffer.from(insertion.data.split(',')[1], 'base64').toString('utf8');
      assert(!/NaN|Infinity|undefined/.test(svg)); assert(insertion.attachment.data.startsWith('data:image/png;base64,'));
      assert.equal(insertion.attachment.id, 'context');
      const before = await snap();
      await page.locator('#file-menu-btn').click(); await page.locator('#project-save').click();
      const download = page.waitForEvent('download');
      const explicit = page.locator('#project-save-download');
      if (await explicit.isVisible().catch(() => false)) await explicit.click(); else await page.getByRole('button', { name: '저장', exact: true }).click();
      const saved = path.join(evidence, name + '-workbench.5e'); await (await download).saveAs(saved);
      await page.reload({ waitUntil: 'networkidle' }); await page.locator('#file-menu-btn').click();
      const chooser = page.waitForEvent('filechooser'); await page.locator('#project-open').click(); await (await chooser).setFiles(saved);
      await page.observeGraphSignal(id => import('/js/state.js?v=1.7.0-four-session-integration').then(({ state }) => state.get().objects.some(o => o.id === id)), insertion.first.planeId, undefined, async () => { await page.getByRole('button', { name: '열기', exact: true }).click(); });
      const loaded = await snap();
      for (const o of before) for (const key of Object.keys(o)) assert.deepEqual(loaded.find(x => x.id === o.id)[key], o[key], `${name}: ${o.id}.${key}`);
      assert.deepEqual(errors, []);
      reports.push({ browser: name, pass: true, guards, checks: ['controlled rejection at validate/render/edit/insert with state unchanged', 'cancel isolation and no-op exact', 'apply isolation with original curve fields preserved', 'repeated insertion remaps ids/planes/groups', 'SVG and PNG export', 'actual .5e download and reopen'], aiCalls: 0 });
    } finally { await browser.close(); }
  }
  fs.writeFileSync(path.join(evidence, 'report.json'), JSON.stringify(reports, null, 2));
  console.log('PASS Chromium and WebKit: workbench result guards, draft isolation, repeated insertion and save/reopen');
})().catch(e => { console.error(e); process.exitCode = 1; });
