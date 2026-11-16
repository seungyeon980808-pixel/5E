// Fixed graph source: b1846e849656076b1c0c5da2f82abffff3813eb1:tests/test-graph-source-arrow-browser.cjs
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium, webkit } = require('./helpers/graph-source-signals.cjs').loadPlaywright();
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/graph-reconstruction/linear.json')));
const out = process.env.EVIDENCE_DIR; assert(out); fs.mkdirSync(out, { recursive: true });
(async () => {
  const reports = [];
  for (const [name, engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:62759/', { waitUntil: 'networkidle' });
      const r = await page.evaluate(async plan => {
        const v = '?v=1.7.0-four-session-integration';
        const { createGraphReconstructionWorkflow, graphSourceHash } = await import('/js/graph/reconstruction-workflow.js' + v);
        const { decodeGraphSourceRaster, matchSourceAxisArrowSize } = await import('/js/graph/source-arrow-size.js' + v);
        const { buildNativeGraph } = await import('/js/graph/native-graph.js' + v);
        const { buildWorkbenchGraph, workbenchGraphDataUrl } = await import('/js/graph/workbench-result.js' + v);
        const { state } = await import('/js/state.js' + v), io = await import('/js/project-io.js' + v);
        const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 300;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 400, 300); ctx.fillStyle = '#000';
        ctx.fillRect(40, 260, 321, 1); ctx.fillRect(40, 20, 1, 241);
        for (let x = 342; x <= 360; x++) { const h = Math.round(6 * (360 - x) / 18); ctx.fillRect(x, 260 - h, 1, 2 * h + 1); }
        for (let y = 20; y <= 38; y++) { const h = Math.round(6 * (y - 20) / 18); ctx.fillRect(40 - h, y, 2 * h + 1, 1); }
        const data = canvas.toDataURL('image/png'); plan.source.hash = await graphSourceHash(data);
        plan.frame = { variant: 'quadrant', arrowX: true, arrowY: true, arrowLength: 2, arrowWidth: 1 };
        const source = { ...plan.source }; delete source.plotBox;
        const selection = { model: 'fixture', effort: 'medium', serviceTier: null };
        const catalog = [{ id: 'fixture', supportedReasoningEfforts: ['medium'], serviceTiers: [] }];
        const run = async instructions => {
          let sent; const sending = new Promise(resolve => { sent = resolve; });
          const workflow = createGraphReconstructionWorkflow({ transport: { send: async () => { sent(); return { turnId: 'arrow-turn', threadId: 'arrow-thread' }; } } });
          const pending = workflow.analyze({ source, attachment: { data }, selection, catalog, instructions });
          await sending;
          workflow.handleEvent({ kind: 'assistant', text: JSON.stringify(plan), turnId: 'arrow-turn', threadId: 'arrow-thread' });
          workflow.handleEvent({ kind: 'done', status: 'completed', turnId: 'arrow-turn', threadId: 'arrow-thread' });
          return pending;
        };
        const measured = await run(''), edited = await run('화살표를 작게 바꿔 주세요');
        const sizes = [];
        for (const width of [35, 70, 140]) {
          const native = buildNativeGraph(measured.plan, { box: { x: 0, y: 0, w: width, h: width * 240 / 320 } });
          state.update(s => { s.objects = native.objects; s.groups = []; });
          const before = JSON.stringify(state.get().objects); io.applyLoaded(state, io.serialize(state.get()));
          sizes.push({ width, lengthPx: native.objects[0].axisArrowLength * 320 / width, widthPx: native.objects[0].axisArrowWidth * 320 / width,
            reloadMode: state.get().objects[0].axisArrowLength === native.objects[0].axisArrowLength, retainedSizes: JSON.parse(before)[0].axisArrowWidth === state.get().objects[0].axisArrowWidth });
        }
        const wb = buildWorkbenchGraph(measured.plan, source), url = await workbenchGraphDataUrl(wb);
        const exported = await decodeGraphSourceRaster(url, source);
        const rendered = matchSourceAxisArrowSize(measured.plan, exported);
        return { measured: measured.plan.frame, observation: measured.attempts[0].plan.frame,
          provenance: measured.attempts[0].sourceArrowSize, explicitEdit: edited.plan.frame,
          originalPointsPreserved: JSON.stringify(measured.plan.series[0].points) === JSON.stringify(plan.series[0].points),
          sizes, rendered: { applied: rendered.applied, measurements: rendered.measurements, reason: rendered.reason } };
      }, fixture);
      assert(r.provenance.measurements.length === 2); assert.equal(r.observation.arrowLength, 2);
      assert.equal(r.explicitEdit.arrowLength, 2); assert(r.originalPointsPreserved);
      for (const s of r.sizes) { assert(Math.abs(s.lengthPx - 19) <= 1); assert.equal(s.widthPx, 13); assert(s.reloadMode && s.retainedSizes); }
      assert(r.rendered.applied, JSON.stringify(r.rendered));
      assert(r.rendered.measurements.every(m => Math.abs(m.lengthPx - 19) <= 2 && Math.abs(m.widthPx - 13) <= 2));
      reports.push({ browser: name, pass: true, realModelCalls: 0, ...r });
    } finally { await browser.close(); }
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(reports, null, 2));
  console.log('PASS Chromium/WebKit: source measurement, raw observation preservation, explicit edits, scale, exported pixels and save/reopen');
})().catch(e => { console.error(e); process.exitCode = 1; });
