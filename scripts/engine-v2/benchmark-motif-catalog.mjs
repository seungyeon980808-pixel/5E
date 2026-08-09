import { performance } from "node:perf_hooks";

import { compileAiMotif } from "../../js/ai-motif-catalog.js";
import { auditDiagramObjects } from "../../js/ai-scene-fastpath.js";

const iterations = Math.max(60, Number.parseInt(process.argv[2] || "12000", 10) || 12000);
const cases = [
  ["panel_flow", { panelCount: 4, states: [{ liquid: 0.2 }, { liquid: 0.4 }, { liquid: 0.6 }, { liquid: 0.8 }] }],
  ["dual_axis_plot", {
    leftSeries: [{ points: [[0, 0], [3, 6], [7, 4], [10, 9]] }],
    rightSeries: [{ points: [[0, 80], [4, 20], [10, 70]] }],
  }],
  ["orthogonal_wiring", {}],
  ["diagonal_wiring", {}],
  ["contour_bundle", { count: 7 }],
  ["coastline_schematic", { intent: "schematic", variant: "islands" }],
];

const totals = new Map(cases.map(([id]) => [id, { count: 0, objects: 0, ms: 0 }]));
let allObjects = 0;
const started = performance.now();

for (let i = 0; i < iterations; i += 1) {
  const [id, options] = cases[i % cases.length];
  const caseStarted = performance.now();
  const result = compileAiMotif(id, options, { idPrefix: `motif_bench_${i % cases.length}` });
  const elapsed = performance.now() - caseStarted;
  if (!result.supported) throw new Error(`${id} failed: ${JSON.stringify(result.errors.concat(result.unsupported))}`);
  const violations = auditDiagramObjects(result.objects);
  if (violations.length) throw new Error(`${id} diagram violations: ${JSON.stringify(violations)}`);
  const row = totals.get(id);
  row.count += 1;
  row.objects += result.objects.length;
  row.ms += elapsed;
  allObjects += result.objects.length;
}

const elapsed = performance.now() - started;
console.log(`5E motif catalog ${iterations.toLocaleString()} compile benchmark`);
console.log(`total ${elapsed.toFixed(2)} ms; ${(elapsed / iterations).toFixed(4)} ms/scene; ${allObjects.toLocaleString()} native objects`);
console.table(Array.from(totals, ([motif, row]) => ({
  motif,
  scenes: row.count,
  objects: row.objects,
  totalMs: Number(row.ms.toFixed(2)),
  msPerScene: Number((row.ms / row.count).toFixed(4)),
})));

