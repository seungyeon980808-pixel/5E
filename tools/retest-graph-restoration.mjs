/** Compare the same saved observations with two implementations; no model calls. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preferAnalyticGraphPlan } from '../js/function-graph/analytic-fit.js';
import { parseGraphPlanResponse, validateGraphPlan } from '../js/graph/reconstruction-contract.js';
import { auditGraphReconstructionQuality } from '../js/graph/reconstruction-quality.js';
import { buildNativeGraph } from '../js/graph/native-graph.js';

const [manifestFile, responseRoot, baselineRoot, output] = process.argv.slice(2);
if (!output) throw Error('Usage: node tools/retest-graph-restoration.mjs manifest responses baseline output');
const old = {};
for (const [name, file] of Object.entries({ fit: 'function-graph/analytic-fit.js', contract: 'graph/reconstruction-contract.js', quality: 'graph/reconstruction-quality.js', native: 'graph/native-graph.js' })) {
  old[name] = await import(pathToFileURL(path.resolve(baselineRoot, 'preview/js', file)));
}
const engines = {
  before: { fit: old.fit.preferAnalyticGraphPlan, parse: old.contract.parseGraphPlanResponse, validate: old.contract.validateGraphPlan, audit: old.quality.auditGraphReconstructionQuality, build: old.native.buildNativeGraph },
  after: { fit: preferAnalyticGraphPlan, parse: parseGraphPlanResponse, validate: validateGraphPlan, audit: auditGraphReconstructionQuality, build: buildNativeGraph },
};
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const report = { schema: '5e.same-observation-retest/v1', modelCalls: 0, cases: [] };
for (const c of manifest.cases) {
  const dir = path.resolve(output, c.id); fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(c.sourcePath, path.join(dir, 'source.png'));
  const raw = fs.readFileSync(path.join(responseRoot, c.id, 'response.txt'), 'utf8');
  fs.writeFileSync(path.join(dir, 'response.txt'), raw);
  const record = { id: c.id, title: c.title, instructions: c.instructions, referenceFeature: c.referenceFeature };
  for (const [name, engine] of Object.entries(engines)) {
    const destination = path.join(dir, name); fs.mkdirSync(destination, { recursive: true });
    try {
      const parsed = engine.parse(raw);
      if (!parsed.ok) throw Error(JSON.stringify(parsed.errors));
      const fitted = engine.fit(parsed.plan, { requirePhysics: true, relativeDiagrams: true });
      const checked = engine.validate(fitted.plan, { source: parsed.plan.source });
      const quality = engine.audit(checked.plan);
      const native = engine.build(checked.plan, { box: { x: 0, y: 0, w: 70, h: 70 * checked.plan.source.plotBox.h / checked.plan.source.plotBox.w } });
      const blocked = !checked.ok || checked.blocked || name === 'before' && quality.status === 'fail';
      record[name] = { generated: native.ok && !blocked, previewAvailable: native.ok, structuralPass: checked.ok, blocked: !!blocked, quality, conversions: fitted.conversions, rejected: fitted.rejected, errors: checked.errors, nativeError: native.error || null };
      fs.writeFileSync(path.join(destination, 'plan.json'), JSON.stringify(checked.plan, null, 2));
      fs.writeFileSync(path.join(destination, 'native-objects.json'), JSON.stringify(native.objects || [], null, 2));
    } catch (error) { record[name] = { generated: false, previewAvailable: false, error: error.message }; }
  }
  fs.writeFileSync(path.join(dir, 'comparison.json'), JSON.stringify(record, null, 2));
  report.cases.push(record);
  console.log(JSON.stringify({ id: c.id, before: record.before.conversions?.map(s => s.expression), after: record.after.conversions?.map(s => s.expression), beforeGenerated: record.before.generated, afterGenerated: record.after.generated, error: record.after.error }));
}
fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
