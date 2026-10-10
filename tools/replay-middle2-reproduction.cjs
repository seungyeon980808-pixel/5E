// Replay retained observations through current product functions. No AI requests.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const prior = path.resolve(process.env.TEXTBOOK_PREVIOUS || path.join(root, 'outputs/middle2-science-graphs-20261007'));
const out = path.resolve(process.env.EVIDENCE_DIR || path.join(root, 'outputs/middle2-reproduction-20261007'));
fs.mkdirSync(out, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(prior, 'textbook-manifest.json')));
const refreshed = (process.env.TEXTBOOK_REOBSERVATIONS || '').split(',').filter(Boolean).map(p => path.resolve(p));
const textReview = process.env.TEXTBOOK_TEXT_REVIEW ? JSON.parse(fs.readFileSync(process.env.TEXTBOOK_TEXT_REVIEW)) : [];
const report = { schema: '5e.textbook-reproduction/v1', aiCalls: 0, basis: 'Retained observations and listed reobservations + deterministic source measurements, current native mapper and renderer; text reviews separately declared', sourceImagesChanged: false, referenceTextReview: textReview, cases: [] };
if (refreshed.length) {
  const freshReports = refreshed.map(dir => JSON.parse(fs.readFileSync(path.join(dir, 'results.json'))));
  report.reobservations = { requests: freshReports.reduce((sum, r) => sum + r.cases.reduce((n, c) => n + c.requestCount, 0), 0), selection: freshReports[0].selection, reportPaths: refreshed.map(dir => path.relative(out, path.join(dir, 'results.json'))) };
}
const save = () => fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(report, null, 2));
(async () => {
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
      await page.addInitScript(() => { localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true'); localStorage.setItem('5e.tutorial.bannerSeen', 'true'); });
      await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:8797/preview/', { waitUntil: 'networkidle' });
      for (const c of manifest.cases) {
        const folder = path.join(out, 'cases', c.id); fs.mkdirSync(folder, { recursive: true });
        const row = { id: c.id, title: c.title, engine: engineName, generated: false, editingPass: false, fullVisualMatch: false };
        report.cases.push(row);
        try {
          const baseline = path.join(prior, 'textbook-run', c.id);
          const fresh = refreshed.find(dir => fs.existsSync(path.join(dir, c.id, 'response.txt')));
          const run = fresh ? path.join(fresh, c.id) : baseline, planFile = path.join(run, 'plan.json');
          row.observationSource = run === baseline ? 'retained-first-observation' : 'new-v22-elements-preservation-observation';
          const raw = fs.readFileSync(path.join(run, 'response.txt'), 'utf8');
          const observed = fs.existsSync(planFile) ? JSON.parse(fs.readFileSync(planFile)) : JSON.parse(raw.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''));
          const plan = structuredClone(observed);
          for (const review of textReview.filter(r => r.id === c.id)) {
            assert.equal(review.sourceSHA256, c.sourceSHA256);
            const annotation = plan.annotations.find(a => a.id === review.annotationId);
            assert.equal(annotation?.text, review.before, 'Text review must match original response exactly');
            annotation.text = review.after;
          }
          assert.deepEqual(plan.series, observed.series, 'Text review cannot change curve geometry');
          const source = fs.readFileSync(c.sourcePath);
          assert.equal(crypto.createHash('sha256').update(source).digest('hex'), c.sourceSHA256);
          fs.writeFileSync(path.join(folder, 'source.png'), source);
          if (engineName === 'chromium') {
            fs.writeFileSync(path.join(folder, 'original-plan.json'), JSON.stringify(observed, null, 2));
            fs.writeFileSync(path.join(folder, 'response.txt'), raw);
            const oldPng = path.join(baseline, 'native.png'); if (fs.existsSync(oldPng)) fs.copyFileSync(oldPng, path.join(folder, 'before.png'));
          }
          const rendered = await page.evaluate(async ({ plan, data }) => {
            const v = '?v=1.7.0-four-session-integration';
            const { validateGraphPlan } = await import('./js/graph/reconstruction-contract.js' + v);
            const { matchSourceGrid } = await import('./js/graph/source-grid.js' + v);
            const { matchSourceFrame } = await import('./js/graph/source-frame.js' + v);
            const { matchSourceGuideDashes } = await import('./js/graph/source-guide-style.js' + v);
            const { decodeGraphSourceRaster, matchSourceAxisArrowSize } = await import('./js/graph/source-arrow-size.js' + v);
            const { preferAnalyticGraphPlan } = await import('./js/function-graph/analytic-fit.js' + v);
            const { buildWorkbenchGraph, workbenchGraphDataUrl } = await import('./js/graph/workbench-result.js' + v);
            const { renderCoordplane } = await import('./js/render/coordplane.js' + v);
            let checked = validateGraphPlan(plan); if (!checked.ok || checked.blocked) throw Error(JSON.stringify(checked.errors.length ? checked.errors : checked.review));
            const raster = await decodeGraphSourceRaster(data, plan.source);
            const frame = matchSourceFrame(checked.plan, raster);
            const grid = matchSourceGrid(frame.plan, raster);
            const guideDashes = matchSourceGuideDashes(grid.plan, raster);
            const arrow = matchSourceAxisArrowSize(guideDashes.plan, raster);
            const fitted = arrow.plan.variant === 'axis-break' ? { plan: arrow.plan, conversions: [], rejected: [] } : preferAnalyticGraphPlan(arrow.plan, { requirePhysics: true, relativeDiagrams: true });
            checked = validateGraphPlan(fitted.plan); if (!checked.ok || checked.blocked) throw Error(JSON.stringify(checked.errors.length ? checked.errors : checked.review));
            const source = Object.fromEntries(['id', 'hash', 'width', 'height'].map(k => [k, plan.source[k]]));
            window.__textbookResult = buildWorkbenchGraph(checked.plan, source);
            const result = window.__textbookResult, plane = result.objects.find(o => o.type === 'coordplane'), node = renderCoordplane(plane);
            const lines = [...node.querySelectorAll('line')].map(l => ({ x1: (+l.getAttribute('x1') - plane.x) / plane.w, x2: (+l.getAttribute('x2') - plane.x) / plane.w,
              y1: 1 - (+l.getAttribute('y1') - plane.y) / plane.h, y2: 1 - (+l.getAttribute('y2') - plane.y) / plane.h }));
            const coverage = grid.measurements.map(m => ({ ...m, retained: lines.some(l => m.orientation === 'vertical'
              ? Math.abs(l.x1 - m.normalizedPosition) * plan.source.plotBox.w <= 2 && Math.abs(l.x2 - m.normalizedPosition) * plan.source.plotBox.w <= 2 && Math.abs(l.y1 - l.y2) >= .96
              : Math.abs(l.y1 - m.normalizedPosition) * plan.source.plotBox.h <= 2 && Math.abs(l.y2 - m.normalizedPosition) * plan.source.plotBox.h <= 2 && Math.abs(l.x1 - l.x2) >= .96) }));
            const internalAxis = plan.axisPlacement?.x?.value;
            const baselineRetained = internalAxis > 0 && internalAxis < 1 ? lines.some(l => Math.abs(l.y1 - internalAxis) < 1e-8 && Math.abs(l.y2 - internalAxis) < 1e-8 && Math.abs(l.x1 - l.x2) > .95) : null;
            return { data: await workbenchGraphDataUrl(result), plan: checked.plan, objects: result.objects,
              frame: { applied: frame.applied, reason: frame.reason, measurements: frame.measurements }, grid: { applied: grid.applied, reason: grid.reason, transforms: grid.transforms, axisEvidence: grid.axisEvidence, coverage }, guideDashes: guideDashes.measurements, baselineRetained, fit: { conversions: fitted.conversions, rejected: fitted.rejected } };
          }, { plan, data: 'data:image/png;base64,' + source.toString('base64') });
          row.generated = true; row.frame = rendered.frame; row.grid = rendered.grid; row.guideDashes = rendered.guideDashes; row.baselineRetained = rendered.baselineRetained; row.fit = rendered.fit;
          assert(!row.grid.coverage.some(l => !l.retained), 'Source-confirmed grid line missing');
          if (row.baselineRetained !== null) assert(row.baselineRetained, 'Internal axis missing');
          row.formulas = rendered.plan.series.filter(s => s.kind === 'expression').map(s => ({ id: s.id, expression: s.expression }));
          if (engineName === 'chromium') {
            fs.writeFileSync(path.join(folder, 'native.svg'), Buffer.from(rendered.data.split(',')[1], 'base64'));
            fs.writeFileSync(path.join(folder, 'plan.json'), JSON.stringify(rendered.plan, null, 2));
            fs.writeFileSync(path.join(folder, 'objects.json'), JSON.stringify(rendered.objects, null, 2));
            const png = await page.evaluate(async data => { const image = new Image(); image.src = data; await image.decode(); const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; canvas.getContext('2d').drawImage(image, 0, 0); return canvas.toDataURL('image/png'); }, rendered.data);
            fs.writeFileSync(path.join(folder, 'native.png'), Buffer.from(png.split(',')[1], 'base64'));
          }
          const open = () => page.evaluate(async () => {
            const { editWorkbenchGraph } = await import('./js/graph/workbench-result.js?v=1.7.0-four-session-integration');
            window.__beforeEdit = structuredClone(window.__textbookResult.objects); window.__editApplied = false;
            editWorkbenchGraph(window.__textbookResult, { onApply: result => { window.__textbookResult = result; window.__editApplied = true; } });
          });
          await open(); await page.locator('#gm-confirm').click();
          assert.equal(await page.locator('#graph-modal-overlay').isVisible(), false, 'No-op must close modal');
          assert(await page.evaluate(() => window.__editApplied && JSON.stringify(window.__textbookResult.objects) === JSON.stringify(window.__beforeEdit)), 'No-op must apply and preserve objects');
          await open(); await page.locator('#gm-labelx').fill('편집 검증'); await page.locator('#gm-labelx').dispatchEvent('change'); await page.locator('#gm-confirm').click();
          assert.equal(await page.locator('#graph-modal-overlay').isVisible(), false);
          assert.equal(await page.evaluate(() => window.__textbookResult.objects.find(o => o.type === 'coordplane').labelX), '편집 검증');
          await page.evaluate(() => { window.__textbookResult.objects = structuredClone(window.__beforeEdit); });
          if (row.formulas.length) {
            await open(); await page.locator('#gm-tab-func-btn').click(); await page.locator('#gm-sub-expr').click();
            // Chips are filtered by the active function subtab, unlike objects.
            await page.locator('#gm-chips > button').first().click();
            const original = await page.locator('#gm-expr').inputValue(); await page.locator('#gm-expr').fill(`(${original})+0.01`); await page.locator('#gm-expr').dispatchEvent('input'); await page.locator('#gm-confirm').click();
            assert.equal(await page.locator('#graph-modal-overlay').isVisible(), false); assert(await page.evaluate(() => window.__textbookResult.objects.some(o => o.expr?.endsWith('+0.01'))));
            row.formulaEditPass = true; await page.evaluate(() => { window.__textbookResult.objects = structuredClone(window.__beforeEdit); });
          }
          const saved = await page.evaluate(async () => {
            const v = '?v=1.7.0-four-session-integration', { state } = await import('./js/state.js' + v), io = await import('./js/project-io.js' + v);
            state.update(s => { s.objects = structuredClone(window.__textbookResult.objects); s.groups = structuredClone(window.__textbookResult.groups); s.selectedIds = []; s.undoStack = []; s.redoStack = []; });
            const before = structuredClone(state.get().objects), doc = io.serialize(state.get());
            state.update(s => { s.objects = []; s.groups = []; }); io.applyLoaded(state, structuredClone(doc));
            const after = state.get().objects;
            for (const a of before) for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(after.find(b => b.id === a.id)?.[k])) throw Error(`Reload changed ${a.id}.${k}`);
            return doc;
          });
          if (engineName === 'chromium') fs.writeFileSync(path.join(folder, 'editable-graph.5e'), JSON.stringify(saved));
          row.editingPass = true;
          fs.writeFileSync(path.join(folder, `verification-${engineName}.json`), JSON.stringify(row, null, 2));
        } catch (e) { row.error = e.stack; await page.screenshot({ path: path.join(folder, `failure-${engineName}.png`) }).catch(() => {}); }
        save(); console.log(row.generated && row.editingPass ? 'PASS' : 'FAIL', engineName, c.id, row.error?.split('\n')[0] || '');
      }
    } finally { await browser.close(); }
  }
  report.pass = report.cases.length === 20 && report.cases.every(c => c.generated && c.editingPass);
  save(); if (!report.pass) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
