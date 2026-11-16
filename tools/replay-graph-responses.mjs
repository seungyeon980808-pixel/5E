/** Offline replay of saved provider observations. Never sends an AI request. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { parseGraphPlanResponse, validateGraphPlan } from '../js/graph/reconstruction-contract.js';
import { preferAnalyticGraphPlan } from '../js/function-graph/analytic-fit.js';
import { auditGraphReconstructionQuality } from '../js/graph/reconstruction-quality.js';
import { buildNativeGraph } from '../js/graph/native-graph.js';
import { auditPhysicsGraphResult } from './physics-graph-result-audit.mjs';

const [manifestFile, responseRoot, output, mode] = process.argv.slice(2);
assert(manifestFile && responseRoot && output, 'Usage: node tools/replay-graph-responses.mjs manifest.json response-root output-directory');
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const report = { schema: '5e.saved-graph-replay/v1', modelCalls: 0, manualPlanCorrections: 0, cases: [] };
for (const c of manifest.cases) {
  const raw = fs.readFileSync(path.join(responseRoot, c.id, 'response.txt'), 'utf8');
  const original = parseGraphPlanResponse(raw);
  assert(original.ok, JSON.stringify(original.errors));
  const fit = preferAnalyticGraphPlan(original.plan, { requirePhysics: true, relativeDiagrams: true });
  const checked = validateGraphPlan(fit.plan, { source: original.plan.source });
  const quality = auditGraphReconstructionQuality(checked.plan);
  const native = buildNativeGraph(checked.plan);
  const entry = { id: c.id, title: c.title, structuralPass: checked.ok, generationPass: native.ok,
    nativeError: native.error || null,
    relationshipStatus: quality.status, relationshipIssues: quality.issues,
    conversions: fit.conversions, rejected: fit.rejected,
    audit: auditPhysicsGraphResult(checked.plan, { objects: native.objects || [] }),
    editingPass: null, saveReopenPass: null, styleVisualPass: null };
  report.cases.push(entry);
  const dir = path.join(output, c.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'candidate.json'), JSON.stringify({ graphPlan: checked.plan }, null, 2));
  fs.writeFileSync(path.join(dir, 'original-plan.json'), JSON.stringify(original.plan, null, 2));
  fs.writeFileSync(path.join(dir, 'native-objects.json'), JSON.stringify(native.objects || [], null, 2));
  fs.writeFileSync(path.join(dir, 'verification.json'), JSON.stringify(entry, null, 2));
  console.log(JSON.stringify({ id: c.id, structuralPass: checked.ok, generationPass: native.ok,
    relationshipStatus: quality.status, formulas: checked.plan.series.filter(s => s.kind === 'expression').map(s => s.expression),
    errors: checked.errors }));
}
report.relationshipPass = report.cases.every(c => c.relationshipStatus !== 'fail');
report.pass = report.cases.every(c => c.structuralPass && c.generationPass) && (mode === '--allow-quality-review' || report.relationshipPass);
fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
assert(report.pass, 'Saved replay has structural, generation or relationship failures; do not run paid evaluation.');
