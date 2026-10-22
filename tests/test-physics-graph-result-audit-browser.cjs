// Fixed graph source: b1846e849656076b1c0c5da2f82abffff3813eb1:tests/test-physics-graph-result-audit-browser.cjs
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium, webkit } = require('./helpers/graph-source-signals.cjs').loadPlaywright();
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/graph-physics/matter-wave-observed.json')));
const evidence = process.env.EVIDENCE_DIR; assert(evidence); fs.mkdirSync(evidence, { recursive: true });
(async () => {
  const reports = [];
  for (const [name, engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:62759/', { waitUntil: 'networkidle' });
      const result = await page.evaluate(async plan => {
        const v = '?v=1.7.0-four-session-integration';
        const { auditPhysicsGraphResult } = await import('/tools/physics-graph-result-audit.mjs');
        const { decodeGraphSourceRaster, matchSourceAxisArrowSize } = await import('/js/graph/source-arrow-size.js' + v);
        const { preferAnalyticGraphPlan } = await import('/js/function-graph/analytic-fit.js' + v);
        const { buildWorkbenchGraph, workbenchGraphDataUrl } = await import('/js/graph/workbench-result.js' + v);
        const response = await fetch('/assets/exam-library/images/p1_2027_06_13.png');
        if (!response.ok) throw Error('Reference source unavailable');
        const bytes = await response.arrayBuffer();
        const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(new Blob([bytes])); });
        const measured = matchSourceAxisArrowSize(plan, await decodeGraphSourceRaster(data, plan.source));
        const original = JSON.stringify(plan);
        const audit = async input => {
          const fitted = preferAnalyticGraphPlan(input, { requirePhysics: true }).plan;
          const source = { ...fitted.source }; delete source.plotBox;
          const wb = buildWorkbenchGraph(fitted, source), url = await workbenchGraphDataUrl(wb);
          const svg = atob(url.split(',')[1]);
          const renderedHeads = matchSourceAxisArrowSize(fitted, await decodeGraphSourceRaster(url, source));
          return auditPhysicsGraphResult(fitted, { expectedAnalyticCurves: 2, objects: wb.objects, sourceHeads: measured, renderedHeads,
            fontEmbedded: /@font-face/.test(svg) && /font-family\s*:\s*["']?Latin Modern Roman/.test(svg) && /url\(["']?data:/.test(svg) });
        };
        return { sourceMeasured: measured.applied, before: await audit(plan), after: await audit(measured.plan), originalUnchanged: JSON.stringify(plan) === original };
      }, fixture);
      assert(result.sourceMeasured); assert(result.originalUnchanged);
      assert.equal(result.before.style.axisArrowSizePass, false);
      assert.equal(result.after.style.axisArrowSizePass, true);
      assert.equal(result.after.formulaCount, 2); assert.equal(result.after.relationCount, 2);
      assert.equal(result.after.style.fontEmbedded, true); assert.equal(result.after.style.labelHeightMappingPass, true);
      assert.deepEqual(result.before.curves, result.after.curves);
      reports.push({ browser: name, pass: true, modelCalls: 0, inputKind: 'manual-matter-wave-reference', ...result });
    } finally { await browser.close(); }
  }
  fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(reports, null, 2));
  console.log('PASS Chromium/WebKit: size mismatch detected, correction measured, formulas and source data preserved');
})().catch(error => { console.error(error); process.exitCode = 1; });
