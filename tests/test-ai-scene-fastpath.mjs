import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";

import {
  FAST_SCENE_SCHEMA_ID,
  assessFastSceneSupport,
  auditDiagramObjects,
  compileFastScene,
  convertFastSceneToObjects,
} from "../js/ai-scene-fastpath.js";
import { normalizeObject } from "../tools/mcp-5e/lib/schema.js";
import { buildFastScenePrompt } from "../js/ai-scene-prompt.js";

const scene = (elements, extra = {}) => ({
  schema: FAST_SCENE_SCHEMA_ID,
  mode: "diagram",
  artboard: { w: 160, h: 90 },
  elements,
  ...extra,
});

function assertDiagram(result) {
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.supported, true, JSON.stringify(result.unsupported));
  assert.deepEqual(auditDiagramObjects(result.objects), []);
}

test("circuit payload becomes canonical 5E circuit and line objects", () => {
  const result = compileFastScene(scene([
    { type: "line", from: [-55, -18], to: [-20, -18] },
    { type: "circuit", element: "resistor", from: [-20, -18], to: [20, -18], label: "R" },
    { type: "circuit", element: "switch", from: [20, -18], to: [55, -18], closed: false },
  ]));
  assertDiagram(result);
  assert.deepEqual(result.objects.map((o) => o.type), ["line", "circuit", "circuit"]);
  assert.equal(result.objects[1].element, "resistor");
  assert.equal(result.objects[1].label, "");
  assert.ok(result.warnings.some((w) => w.code === "diagram_label_removed"));
});

test("pulley, block and spring use the existing apparatus/rect/spring renderers", () => {
  const result = convertFastSceneToObjects(scene([
    { kind: "pulley", box: [10, -35, 20, 20], variant: "ceiling" },
    { kind: "block", box: [-35, 8, 20, 16], tone: "gray" },
    { type: "spring", from: [20, -15], to: [20, 25], turns: 12, radius: 2.4 },
    { type: "line", from: [-25, 8], to: [20, -15] },
  ]), { idPrefix: "mechanics" });
  assertDiagram(result);
  assert.deepEqual(result.objects.map((o) => o.type), ["apparatus", "rect", "spring", "line"]);
  assert.equal(result.objects[0].kind, "pulley");
  assert.equal(result.objects[0].variant, "ceiling");
  assert.equal(result.objects[1].fillLevel, 224);
  assert.match(result.objects[0].id, /^mechanics_/);
});

test("optics payload keeps structures but never emits an object arrow in diagram mode", () => {
  const result = compileFastScene(scene([
    { type: "optics", kind: "convex_lens", box: [-8, -30, 16, 60] },
    { type: "optics", kind: "screen", box: [45, -28, 5, 56] },
    { type: "line", from: [-55, 0], to: [45, 0], arrow: "end", dashed: true },
  ]));
  assertDiagram(result);
  assert.equal(result.objects[2].arrowHead, "none");
  assert.equal(result.objects[2].lineMode, "solid");
  assert.ok(result.warnings.some((w) => w.code === "diagram_arrow_removed"));

  const unsupported = assessFastSceneSupport(scene([
    { type: "optics", kind: "object_arrow", box: [-40, -15, 8, 30] },
  ]));
  assert.equal(unsupported.supported, false);
  assert.equal(unsupported.stats.requiresRasterFallback, true);
  assert.equal(unsupported.unsupported[0].code, "diagram_intrinsic_arrow");
});

test("vessel and particle box preserve only physically useful grayscale distinctions", () => {
  const result = compileFastScene(scene([
    { type: "vessel", kind: "beaker", box: [-45, -20, 24, 34], liquid: 0.55, hasTicks: true, text: "물" },
    { type: "particlebox", box: [15, -20, 32, 32], state: "gas", count: 12, mix: true, motion: "arrow" },
  ]));
  assertDiagram(result);
  assert.deepEqual(result.objects.map((o) => o.type), ["vessel", "particlebox"]);
  assert.equal(result.objects[0].text, "");
  assert.equal(result.objects[1].motion, "none");
  assert.ok(result.warnings.some((w) => w.path.endsWith(".text") && w.code === "field_ignored"));
});

test("graph composite creates arrowless axes and mapped 5E funcgraph points", () => {
  const result = compileFastScene(scene([
    {
      type: "graph", box: [-50, -30, 100, 60], xRange: [-2, 2], yRange: [-1, 3],
      grid: false, axisVariant: "cross",
      series: [{ style: "smooth", points: [[-2, 0], [-1, 2], [0, 1], [2, 3]] }],
    },
  ]));
  assertDiagram(result);
  assert.deepEqual(result.objects.map((o) => o.type), ["coordplane", "line", "line", "funcgraph"]);
  const plane = result.objects[0];
  const graph = result.objects[3];
  assert.equal(plane.showAxisLines, false);
  assert.equal(plane.showTickLabels, false);
  assert.equal(graph.planeId, plane.id);
  assert.deepEqual(graph.points[0], { x: -50, y: 15 });
  assert.deepEqual(graph.points.at(-1), { x: 50, y: -30 });
});

test("pedigree suppresses numbers in diagram mode", () => {
  const result = compileFastScene(scene([
    { type: "pedigree", box: [-45, -30, 90, 60], gen2Kids: 4, gen3Kids: 2, affected: [3, 6], carrier: "4" , showNumbers: true },
  ]));
  assertDiagram(result);
  assert.equal(result.objects[0].showNumbers, false);
  assert.equal(result.objects[0].affected, "3,6");
  assert.equal(result.objects[0].carrier, "4");
});

test("diagram audit catches text, labels, numbers and arrows independently", () => {
  const violations = auditDiagramObjects([
    { type: "text", text: "A" },
    { type: "line", arrowHead: "end", lineMode: "arrow" },
    { type: "pedigree", showNumbers: true },
  ]);
  assert.ok(violations.some((v) => v.code === "diagram_text_type"));
  assert.ok(violations.some((v) => v.code === "diagram_arrow"));
  assert.ok(violations.some((v) => v.code === "diagram_numbers"));
});

test("complete mode may retain an annotation and arrow", () => {
  const result = compileFastScene(scene([
    { type: "annotation", at: [0, -20], text: "검출기", fontSize: 3.7 },
    { type: "line", from: [-20, 0], to: [20, 0], arrow: "end" },
  ], { mode: "complete" }));
  assert.equal(result.supported, true, JSON.stringify(result.errors));
  assert.equal(result.objects[0].type, "text");
  assert.equal(result.objects[0].text, "검출기");
  assert.equal(result.objects[1].arrowHead, "end");
});

test("fenced JSON is accepted, unknown types route to raster fallback", () => {
  const fenced = `\`\`\`json\n${JSON.stringify(scene([{ kind: "block", box: [-10, -10, 20, 20] }]))}\n\`\`\``;
  assertDiagram(compileFastScene(fenced));

  const result = compileFastScene(scene([{ type: "human_anatomy", box: [-20, -20, 40, 40] }]));
  assert.equal(result.valid, true);
  assert.equal(result.supported, false);
  assert.equal(result.unsupported[0].code, "unsupported_kind");
});

test("compiler is deterministic, does not mutate input, and remains locally fast", () => {
  const input = scene([
    { kind: "pulley", box: [10, -35, 20, 20] },
    { kind: "block", box: [-35, 8, 20, 16] },
    { type: "spring", from: [20, -15], to: [20, 25] },
    { type: "vessel", kind: "flask", box: [-70, -20, 20, 32], liquid: 0.4 },
    { type: "particlebox", box: [45, -18, 26, 26], state: "liquid", count: 10 },
  ]);
  const before = JSON.stringify(input);
  const first = compileFastScene(input, { idPrefix: "bench" });
  const second = compileFastScene(input, { idPrefix: "bench" });
  assert.deepEqual(first.objects, second.objects);
  assert.equal(JSON.stringify(input), before);

  const started = performance.now();
  for (let i = 0; i < 2500; i += 1) compileFastScene(input, { idPrefix: "bench" });
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 1500, `2500 local scene compiles took ${elapsed.toFixed(1)}ms`);
  console.log(`fast-scene benchmark: 2500 compiles in ${elapsed.toFixed(1)}ms (${(elapsed / 2500).toFixed(3)}ms each)`);
});

test("every emitted object is accepted by the existing MCP 5E schema", () => {
  const result = compileFastScene(scene([
    { type: "circuit", element: "lamp", from: [-60, -20], to: [-30, -20] },
    { kind: "pulley", box: [-20, -35, 18, 18] },
    { type: "spring", from: [-11, -17], to: [-11, 25] },
    { type: "optics", kind: "concave_lens", box: [5, -30, 12, 60] },
    { type: "vessel", kind: "test_tube", box: [25, -20, 16, 35], liquid: 0.4 },
    { type: "particlebox", box: [48, -18, 24, 24], state: "solid", count: 9 },
    { type: "graph", box: [-65, 10, 50, 30], series: [{ points: [[-5, -2], [0, 0], [5, 2]] }] },
    { type: "pedigree", box: [10, 12, 55, 30], showNumbers: false },
  ]));
  assertDiagram(result);
  for (const obj of result.objects) {
    const checked = normalizeObject(obj, { artboard: result.artboard });
    assert.deepEqual(checked.errors, [], `${obj.type}: ${checked.errors.join("; ")}`);
  }
});

test("a clearly top-left scene is translated once to centred artboard coordinates", () => {
  const result = compileFastScene(scene([
    { kind: "block", box: [20, 15, 40, 20] },
    { kind: "pulley", box: [120, 20, 20, 20] },
    { type: "line", from: [40, 35], to: [130, 40] },
  ]));
  assertDiagram(result);
  assert.deepEqual(result.objects[0].x, -60);
  assert.deepEqual(result.objects[0].y, -30);
  assert.deepEqual(result.objects[1].x, 40);
  assert.deepEqual(result.objects[1].y, -25);
  assert.deepEqual(result.objects[2].p1, { x: -40, y: -10 });
  assert.deepEqual(result.objects[2].p2, { x: 50, y: -5 });
  assert.deepEqual(result.stats.originNormalization, {
    applied: true, from: "top-left", to: "centered", dx: -80, dy: -45,
  });
  assert.ok(result.warnings.some((w) => w.code === "origin_normalized"));
  assert.equal(result.warnings.some((w) => w.code === "outside_artboard"), false);
});

test("legitimate centred and ambiguous positive scenes are never shifted", () => {
  const centred = compileFastScene(scene([
    { kind: "block", box: [-60, -25, 30, 20] },
    { kind: "pulley", box: [25, -20, 18, 18] },
  ]));
  assertDiagram(centred);
  assert.deepEqual(centred.objects[0].x, -60);
  assert.equal(centred.stats.originNormalization.applied, false);

  // This fits both interpretations, so changing it would risk moving a valid
  // centred scene. The conservative normalizer deliberately leaves it alone.
  const ambiguous = compileFastScene(scene([
    { kind: "block", box: [10, 10, 20, 15] },
    { kind: "pulley", box: [40, 5, 18, 18] },
  ]));
  assertDiagram(ambiguous);
  assert.deepEqual(ambiguous.objects[0].x, 10);
  assert.deepEqual(ambiguous.objects[0].y, 10);
  assert.equal(ambiguous.stats.originNormalization.applied, false);
});

test("origin detection uses geometry but shifts complete-mode annotations with it", () => {
  const result = compileFastScene(scene([
    { kind: "block", box: [110, 20, 30, 20] },
    { type: "annotation", at: [125, 15], text: "추" },
  ], { mode: "complete" }));
  assert.equal(result.supported, true, JSON.stringify(result.errors));
  assert.equal(result.stats.originNormalization.applied, true);
  assert.deepEqual({ x: result.objects[0].x, y: result.objects[0].y }, { x: 30, y: -25 });
  assert.deepEqual({ x: result.objects[1].x, y: result.objects[1].y }, { x: 45, y: -30 });
});

test("fast-scene prompt states the exact centred coordinate ranges prominently", () => {
  const prompt = buildFastScenePrompt({ mode: "diagram", request: "도르래를 그려 줘" });
  assert.match(prompt, /ORIGIN IS ITS CENTRE, NOT ITS TOP-LEFT CORNER/);
  assert.match(prompt, /x=-80\.\.\+80 and y=-45\.\.\+45/);
  assert.match(prompt, /NEVER use browser-style top-left coordinates 0\.\.W \/ 0\.\.H/);
});
