#!/usr/bin/env node

import { performance } from "node:perf_hooks";

import { compileAiMotif, createAiMotifScene } from "../../js/ai-motif-catalog.js";
import { auditDiagramObjects } from "../../js/ai-scene-fastpath.js";
import { pulleyAnchors, pulleyGeom } from "../../js/render/optics-apparatus.js";
import { normalizeObject } from "../../tools/mcp-5e/lib/schema.js";

const requested = process.argv.find((value) => /^\d+$/.test(value));
const iterations = Math.max(100, Number.parseInt(requested || "10000", 10) || 10000);
const jsonOnly = process.argv.includes("--json");

const CASES = Object.freeze([
  Object.freeze({ id: "simple_series_circuit", options: Object.freeze({ switchState: "open" }) }),
  Object.freeze({ id: "fixed_pulley_spring_loads", options: Object.freeze({ springTurns: 12, springRadius: 2.4 }) }),
  Object.freeze({ id: "lens_mirror_screen_bench", options: Object.freeze({ lensKind: "convex_lens", mirrorRotation: 45 }) }),
  Object.freeze({
    id: "vessel_particle_comparison",
    options: Object.freeze({
      vesselKind: "beaker", liquid: 0.45, particleState: "gas",
      particleCount: 16, particleShape: "circle", mix: false,
    }),
  }),
  Object.freeze({ id: "logistic_population_graph", options: Object.freeze({}) }),
]);

function validateFixture(id, scene, result) {
  if (!result.valid || !result.supported) throw new Error(`${id}: ${JSON.stringify(result.errors.concat(result.unsupported))}`);
  const violations = auditDiagramObjects(result.objects);
  if (violations.length) throw new Error(`${id} diagram violations: ${JSON.stringify(violations)}`);
  for (const object of result.objects) {
    const normalized = normalizeObject(object, { artboard: result.artboard });
    if (normalized.errors.length) throw new Error(`${id}/${object.type}: ${normalized.errors.join("; ")}`);
  }

  if (id === "simple_series_circuit") {
    const parts = result.objects.filter((object) => object.type === "circuit");
    if (parts.map((object) => object.element).join(",") !== "dc_source,switch,resistor,lamp" || parts[1].closed !== false) {
      throw new Error(`${id}: four-part open-switch fixture changed`);
    }
  } else if (id === "fixed_pulley_spring_loads") {
    const counts = {
      pulley: result.objects.filter((object) => object.type === "apparatus" && object.kind === "pulley").length,
      spring: result.objects.filter((object) => object.type === "spring").length,
      load: result.objects.filter((object) => object.type === "rect").length,
    };
    if (counts.pulley !== 1 || counts.spring !== 1 || counts.load !== 2) throw new Error(`${id}: ${JSON.stringify(counts)}`);
    const [, rope, leftRope, rightRope, spring, leftLoad, rightLoad] = scene.elements;
    const near = (a, b) => a.every((value, index) => Math.abs(value - b[index]) < 1e-6);
    const pulley = scene.elements[0];
    const pulleyObject = { x: pulley.box[0], y: pulley.box[1], w: pulley.box[2], h: pulley.box[3], variant: pulley.variant };
    const geometry = pulleyGeom(pulleyObject);
    const anchors = pulleyAnchors(pulleyObject);
    if (!near(rope.points[0], [anchors[0].x, anchors[0].y])
      || !near(rope.points.at(-1), [anchors[1].x, anchors[1].y])
      || !near(rope.points[6], [geometry.cx, geometry.cy - geometry.r])
      || !near(rope.points[0], leftRope.from) || !near(rope.points.at(-1), rightRope.from)
      || !near(rightRope.to, spring.from)
      || !near(leftRope.to, [leftLoad.box[0] + leftLoad.box[2] / 2, leftLoad.box[1]])
      || !near(spring.to, [rightLoad.box[0] + rightLoad.box[2] / 2, rightLoad.box[1]])) {
      throw new Error(`${id}: tangent/contact invariant changed`);
    }
  } else if (id === "lens_mirror_screen_bench") {
    const kinds = result.objects.map((object) => object.kind);
    if (kinds.join(",") !== "convex_lens,plane_mirror,screen" || result.objects[1].rotation !== 45) {
      throw new Error(`${id}: ${JSON.stringify(kinds)}`);
    }
  } else if (id === "vessel_particle_comparison") {
    const vessel = result.objects.find((object) => object.type === "vessel");
    const particles = result.objects.find((object) => object.type === "particlebox");
    if (vessel?.kind !== "beaker" || vessel.liquid !== 0.45
      || particles?.state !== "gas" || particles.count !== 16 || particles.motion !== "none") {
      throw new Error(`${id}: explicit state changed`);
    }
  } else if (id === "logistic_population_graph") {
    const points = scene.elements[0].series[0].points;
    if (points.length !== 11 || !points.slice(1).every((point, index) => point[0] > points[index][0] && point[1] > points[index][1])) {
      throw new Error(`${id}: monotonic S-curve invariant changed`);
    }
  }
}

const rows = new Map(CASES.map(({ id }) => [id, { scenes: 0, objects: 0, milliseconds: 0 }]));
const started = performance.now();
for (let iteration = 0; iteration < iterations; iteration += 1) {
  const fixture = CASES[iteration % CASES.length];
  const caseStarted = performance.now();
  const scene = createAiMotifScene(fixture.id, fixture.options);
  const result = compileAiMotif(fixture.id, fixture.options, { idPrefix: `core_bench_${iteration % CASES.length}` });
  const elapsed = performance.now() - caseStarted;
  validateFixture(fixture.id, scene, result);
  const row = rows.get(fixture.id);
  row.scenes += 1;
  row.objects += result.objects.length;
  row.milliseconds += elapsed;
}
const elapsed = performance.now() - started;
const report = {
  schema: "5e-core-apparatus-motif-benchmark@1",
  iterations,
  totalMilliseconds: Number(elapsed.toFixed(3)),
  millisecondsPerScene: Number((elapsed / iterations).toFixed(6)),
  diagramViolations: 0,
  normalizationErrors: 0,
  cases: Array.from(rows, ([id, row]) => ({
    id,
    scenes: row.scenes,
    objects: row.objects,
    milliseconds: Number(row.milliseconds.toFixed(3)),
    millisecondsPerScene: Number((row.milliseconds / row.scenes).toFixed(6)),
  })),
};

if (jsonOnly) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`5E core apparatus motifs: ${iterations.toLocaleString()} scenes in ${elapsed.toFixed(2)} ms (${(elapsed / iterations).toFixed(4)} ms/scene)`);
  console.table(report.cases);
  console.log("diagram violations 0; MCP normalization errors 0");
}
