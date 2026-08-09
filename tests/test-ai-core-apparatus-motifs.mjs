import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_MOTIF_PROMPT_REFERENCE,
  MOTIF_CATALOG_VERSION,
  compileAiMotif,
  compileFastSceneWithMotifs,
  createAiMotifScene,
  expandAiMotifScene,
} from "../js/ai-motif-catalog.js";
import { auditDiagramObjects } from "../js/ai-scene-fastpath.js";
import { pulleyAnchors, pulleyGeom } from "../js/render/optics-apparatus.js";
import { normalizeObject } from "../tools/mcp-5e/lib/schema.js";

function pointKey(point) {
  return point.map((value) => Number(value).toFixed(6)).join(",");
}

function assertNear(actual, expected, message) {
  assert.equal(actual.length, expected.length, message);
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-6, message));
}

function assertNativeDiagram(id, options) {
  const result = compileAiMotif(id, options, { idPrefix: `core_${id}` });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.supported, true, JSON.stringify(result.unsupported));
  assert.deepEqual(auditDiagramObjects(result.objects), []);
  for (const object of result.objects) {
    assert.deepEqual(normalizeObject(object, { artboard: result.artboard }).errors, [], object.type);
  }
  return result;
}

function assertOneClosedSeriesNetwork(scene) {
  const adjacency = new Map();
  const connect = (a, b) => {
    const ka = pointKey(a), kb = pointKey(b);
    if (!adjacency.has(ka)) adjacency.set(ka, new Set());
    if (!adjacency.has(kb)) adjacency.set(kb, new Set());
    adjacency.get(ka).add(kb);
    adjacency.get(kb).add(ka);
  };
  for (const element of scene.elements) {
    if (element.type === "circuit" || element.type === "line") connect(element.from, element.to);
    if (["polyline", "curve"].includes(element.type)) {
      for (let index = 1; index < element.points.length; index += 1) connect(element.points[index - 1], element.points[index]);
    }
  }
  const start = adjacency.keys().next().value;
  const seen = new Set([start]), queue = [start];
  while (queue.length) {
    for (const next of adjacency.get(queue.shift()) || []) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  assert.equal(seen.size, adjacency.size, "series circuit must be one connected network");
  for (const neighbors of adjacency.values()) assert.equal(neighbors.size, 2, "series circuit cannot branch or terminate");
}

test("core apparatus catalog is versioned and prompt-visible", () => {
  assert.equal(MOTIF_CATALOG_VERSION, "5e-motif-catalog@5");
  for (const id of [
    "simple_series_circuit", "fixed_pulley_spring_loads", "lens_mirror_screen_bench",
    "vessel_particle_comparison", "logistic_population_graph",
  ]) assert.match(AI_MOTIF_PROMPT_REFERENCE, new RegExp(id));
  assert.match(AI_MOTIF_PROMPT_REFERENCE, /switchState is mandatory/);
  assert.match(AI_MOTIF_PROMPT_REFERENCE, /particle motion is always none/);
  assert.match(AI_MOTIF_PROMPT_REFERENCE, /NEVER repeat artboard inside motif options/);
  assert.match(AI_MOTIF_PROMPT_REFERENCE, /Exact open-switch options: \{"switchState":"open"\}/);
  assert.match(AI_MOTIF_PROMPT_REFERENCE, /Default exact options: \{\}/);
  assert.doesNotMatch(AI_MOTIF_PROMPT_REFERENCE, /artboard\?:\{w,h\}/);
});

test("simple series circuit freezes four parts into one unbranched rectangular loop", () => {
  const options = { switchState: "open" };
  const scene = createAiMotifScene("simple_series_circuit", options);
  const elements = scene.elements.filter((element) => element.type === "circuit");
  assert.deepEqual(elements.map((element) => element.element), ["dc_source", "switch", "resistor", "lamp"]);
  assert.equal(elements[1].closed, false);
  assertOneClosedSeriesNetwork(scene);
  const result = assertNativeDiagram("simple_series_circuit", options);
  assert.deepEqual(result.objects.filter((object) => object.type === "circuit").map((object) => object.element),
    ["dc_source", "switch", "resistor", "lamp"]);
  assert.equal(result.objects.some((object) => object.arrowHead && object.arrowHead !== "none"), false);
  assert.throws(() => createAiMotifScene("simple_series_circuit", {}), /switchState is required/);
  assert.throws(() => createAiMotifScene("simple_series_circuit", { switchState: "open", label: "R" }), /does not allow/);
  assert.throws(() => createAiMotifScene("simple_series_circuit", { switchState: "unknown" }), /must be one of/);
});

test("fixed pulley assembly hard-codes rendered-rim tangencies and matching blank load shapes", () => {
  const scene = createAiMotifScene("fixed_pulley_spring_loads", { springTurns: 12, springRadius: 2.4 });
  const [pulley, rope, leftRope, rightRope, spring, leftLoad, rightLoad] = scene.elements;
  assert.equal(pulley.type, "pulley");
  assert.equal(pulley.variant, "ceiling");
  assert.equal(rope.type, "curve");
  const pulleyObject = { x: pulley.box[0], y: pulley.box[1], w: pulley.box[2], h: pulley.box[3], variant: pulley.variant };
  const geometry = pulleyGeom(pulleyObject);
  const anchors = pulleyAnchors(pulleyObject);
  const leftAnchor = anchors.find((anchor) => anchor.role === "rimLeft");
  const rightAnchor = anchors.find((anchor) => anchor.role === "rimRight");
  assertNear(rope.points[0], [leftAnchor.x, leftAnchor.y], "rope must start on the rendered left rim");
  assertNear(rope.points.at(-1), [rightAnchor.x, rightAnchor.y], "rope must end on the rendered right rim");
  assertNear(rope.points[6], [geometry.cx, geometry.cy - geometry.r], "rope arc must follow the rendered pulley radius");
  assertNear(rope.points[0], leftRope.from, "left tangent must continue into the left rope");
  assertNear(rope.points.at(-1), rightRope.from, "right tangent must continue into the right rope");
  assertNear(rightRope.to, spring.from, "right rope must contact the spring top");
  assertNear(leftRope.to, [leftLoad.box[0] + leftLoad.box[2] / 2, leftLoad.box[1]], "left rope must contact the left load top");
  assertNear(spring.to, [rightLoad.box[0] + rightLoad.box[2] / 2, rightLoad.box[1]], "spring must contact the right load top");
  assert.deepEqual(leftLoad.box.slice(2), rightLoad.box.slice(2));
  assert.equal(leftLoad.tone, "white");
  assert.equal(rightLoad.tone, "white");
  const result = assertNativeDiagram("fixed_pulley_spring_loads", {});
  assert.equal(result.objects.filter((object) => object.type === "apparatus" && object.kind === "pulley").length, 1);
  assert.equal(result.objects.filter((object) => object.type === "spring").length, 1);
  assert.equal(result.objects.filter((object) => object.type === "rect").length, 2);
  const compiledPulley = result.objects.find((object) => object.type === "apparatus" && object.kind === "pulley");
  const compiledRope = result.objects.find((object) => object.type === "curve");
  const compiledAnchors = pulleyAnchors(compiledPulley);
  assertNear([compiledRope.points[0].x, compiledRope.points[0].y],
    [compiledAnchors[0].x, compiledAnchors[0].y], "compiled rope must remain on the rendered left rim");
  assertNear([compiledRope.points.at(-1).x, compiledRope.points.at(-1).y],
    [compiledAnchors[1].x, compiledAnchors[1].y], "compiled rope must remain on the rendered right rim");
  assert.throws(() => createAiMotifScene("fixed_pulley_spring_loads", { movingPulley: true }), /does not allow/);
});

test("optical bench preserves explicit semantic optics parts without ray substitutes", () => {
  const options = { lensKind: "convex_lens", mirrorRotation: 45 };
  const scene = createAiMotifScene("lens_mirror_screen_bench", options);
  assert.deepEqual(scene.elements.map((element) => element.opticsKind), ["convex_lens", "plane_mirror", "screen"]);
  assert.equal(scene.elements[1].rotation, 45);
  assert.equal(scene.elements.every((element) => element.type === "optics"), true);
  const result = assertNativeDiagram("lens_mirror_screen_bench", options);
  assert.deepEqual(result.objects.map((object) => object.kind), ["convex_lens", "plane_mirror", "screen"]);
  assert.equal(result.objects[1].rotation, 45);
  assert.throws(() => createAiMotifScene("lens_mirror_screen_bench", { mirrorRotation: 45 }), /lensKind is required/);
  assert.throws(() => createAiMotifScene("lens_mirror_screen_bench", { lensKind: "convex_lens" }), /mirrorRotation is required/);
  assert.throws(() => createAiMotifScene("lens_mirror_screen_bench", { lensKind: "concave_lens", mirrorRotation: 45 }), /must be one of/);
  assert.throws(() => createAiMotifScene("lens_mirror_screen_bench", { lensKind: "convex_lens", mirrorRotation: 44 }), /exactly 45/);
  assert.throws(() => createAiMotifScene("lens_mirror_screen_bench", { ...options, rays: true }), /does not allow/);
});

test("vessel-particle comparison requires every state and permanently disables motion arrows", () => {
  const options = {
    vesselKind: "beaker", liquid: 0.45, particleState: "gas",
    particleCount: 16, particleShape: "circle", mix: false,
  };
  const scene = createAiMotifScene("vessel_particle_comparison", options);
  assert.equal(scene.elements[0].liquid, 0.45);
  assert.deepEqual({
    state: scene.elements[1].state,
    count: scene.elements[1].count,
    shape: scene.elements[1].particleShape,
    mix: scene.elements[1].mix,
    motion: scene.elements[1].motion,
  }, { state: "gas", count: 16, shape: "circle", mix: false, motion: "none" });
  const result = assertNativeDiagram("vessel_particle_comparison", options);
  assert.equal(result.objects.find((object) => object.type === "particlebox").motion, "none");
  assert.throws(() => createAiMotifScene("vessel_particle_comparison", { ...options, particleCount: undefined }), /finite number/);
  assert.throws(() => createAiMotifScene("vessel_particle_comparison", { ...options, motion: "arrow" }), /does not allow/);
  assert.throws(() => createAiMotifScene("vessel_particle_comparison", { ...options, mix: "false" }), /must be boolean/);
  assert.throws(() => createAiMotifScene("vessel_particle_comparison", { ...options, vesselKind: "funnel" }), /must be one of/);
  assert.throws(() => createAiMotifScene("vessel_particle_comparison", { ...options, liquid: 0.5 }), /exactly 0.45/);
  assert.throws(() => createAiMotifScene("vessel_particle_comparison", { ...options, particleState: "solid" }), /must be one of/);
  assert.throws(() => createAiMotifScene("vessel_particle_comparison", { ...options, particleCount: 12 }), /exactly 16/);
  assert.throws(() => createAiMotifScene("vessel_particle_comparison", { ...options, particleShape: "square" }), /must be one of/);
  assert.throws(() => createAiMotifScene("vessel_particle_comparison", { ...options, mix: true }), /must be false/);
});

test("logistic population motif generates one monotone label-free S curve", () => {
  const scene = createAiMotifScene("logistic_population_graph", {});
  assert.equal(scene.elements.length, 1);
  const graph = scene.elements[0];
  assert.equal(graph.type, "graph");
  assert.equal(graph.grid, false);
  assert.equal(graph.showNumbers, false);
  assert.equal(graph.series.length, 1);
  const points = graph.series[0].points;
  assert.equal(points.length, 11);
  assert.equal(points.slice(1).every((point, index) => point[0] > points[index][0] && point[1] > points[index][1]), true);
  const increments = points.slice(1).map((point, index) => point[1] - points[index][1]);
  assert.ok(increments[Math.floor(increments.length / 2)] > increments[0]);
  assert.ok(increments[Math.floor(increments.length / 2)] > increments.at(-1));
  const result = assertNativeDiagram("logistic_population_graph", {});
  assert.equal(result.objects.filter((object) => object.type === "coordplane").length, 1);
  assert.equal(result.objects.filter((object) => object.type === "funcgraph").length, 1);
  assert.throws(() => createAiMotifScene("logistic_population_graph", { series: [] }), /does not allow/);
  assert.throws(() => createAiMotifScene("logistic_population_graph", { midpoint: 0.001 }), /does not allow/);
  assert.throws(() => createAiMotifScene("logistic_population_graph", { sampleCount: 13 }), /does not allow/);
});

test("new motifs are deterministic and reject undersized artboards", () => {
  const options = { switchState: "closed" };
  const before = JSON.stringify(options);
  assert.deepEqual(createAiMotifScene("simple_series_circuit", options), createAiMotifScene("simple_series_circuit", options));
  assert.equal(JSON.stringify(options), before);
  assert.throws(() => createAiMotifScene("simple_series_circuit", {
    switchState: "open", artboard: { w: 100, h: 60 },
  }), /at least 120 x 70/);
  assert.throws(() => createAiMotifScene("simple_series_circuit", {
    switchState: "open", artboard: { w: 160, h: 90, unit: "mm" },
  }), /does not allow field/);
});

test("the high-level sole-element path compiles every new motif without changing direct asset dispatch", () => {
  const fixtures = [
    ["simple_series_circuit", { switchState: "open" }],
    ["fixed_pulley_spring_loads", {}],
    ["lens_mirror_screen_bench", { lensKind: "convex_lens", mirrorRotation: 45 }],
    ["vessel_particle_comparison", {
      vesselKind: "beaker", liquid: 0.45, particleState: "gas",
      particleCount: 16, particleShape: "circle", mix: false,
    }],
    ["logistic_population_graph", {}],
  ];
  for (const [motif, options] of fixtures) {
    const result = compileFastSceneWithMotifs({
      schema: "5e-fast-scene@1", mode: "diagram",
      elements: [{ type: "motif", motif, options }],
    });
    assert.equal(result.supported, true, motif);
    assert.deepEqual(auditDiagramObjects(result.objects), [], motif);
  }
});

test("identical root and motif artboards canonicalize while conflicting duplicates stay rejected", () => {
  const duplicateBoard = {
    schema: "5e-fast-scene@1", mode: "diagram", artboard: { w: 160, h: 90 },
    elements: [{
      type: "motif", motif: "simple_series_circuit",
      options: { switchState: "open", artboard: { h: 90, w: 160 } },
    }],
  };
  const expanded = expandAiMotifScene(duplicateBoard);
  assert.deepEqual(expanded.artboard, { w: 160, h: 90 });
  assert.equal(expanded.elements.some((element) => element.type === "motif"), false);
  assert.equal(compileFastSceneWithMotifs(duplicateBoard).supported, true);
  assert.deepEqual(duplicateBoard.elements[0].options.artboard, { h: 90, w: 160 }, "canonicalization mutated the model response");

  assert.throws(() => expandAiMotifScene({
    ...duplicateBoard,
    elements: [{
      type: "motif", motif: "simple_series_circuit",
      options: { switchState: "open", artboard: { w: 150, h: 90 } },
    }],
  }), /conflicts with options\.artboard/);
});
