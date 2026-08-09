import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";

import {
  AI_MOTIF_IDS,
  AI_MOTIF_PROMPT_REFERENCE,
  MOTIF_CATALOG_VERSION,
  compileAiMotif,
  compileFastSceneWithMotifs,
  createAiMotif,
  createAiMotifScene,
  expandAiMotifScene,
  getAiMotifMetadata,
  listAiMotifs,
} from "../js/ai-motif-catalog.js";
import { auditDiagramObjects, compileFastScene } from "../js/ai-scene-fastpath.js";
import { buildFastScenePrompt } from "../js/ai-scene-prompt.js";
import { normalizeObject } from "../tools/mcp-5e/lib/schema.js";

function assertNativeDiagram(result) {
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.supported, true, JSON.stringify(result.unsupported));
  assert.ok(result.objects.length > 0);
  assert.deepEqual(auditDiagramObjects(result.objects), []);
  for (const object of result.objects) {
    const checked = normalizeObject(object, { artboard: result.artboard });
    assert.deepEqual(checked.errors, [], `${object.type}: ${checked.errors.join("; ")}`);
  }
}

test("catalog exposes audited and fixture-locked diagram-safe motifs", () => {
  assert.equal(MOTIF_CATALOG_VERSION, "5e-motif-catalog@5");
  assert.deepEqual(AI_MOTIF_IDS, [
    "panel_flow", "dual_axis_plot", "orthogonal_wiring",
    "diagonal_wiring", "contour_bundle", "coastline_schematic",
    "verified_map_outline",
    "student_trio_seated_dialogue", "spacecraft_flat_shell",
    "simple_series_circuit", "fixed_pulley_spring_loads",
    "lens_mirror_screen_bench", "vessel_particle_comparison",
    "logistic_population_graph",
  ]);
  assert.deepEqual(listAiMotifs().map((item) => item.id), AI_MOTIF_IDS);
  assert.equal(getAiMotifMetadata("panel_flow").auditOccurrences, 22);
  assert.equal(getAiMotifMetadata("coastline_schematic").coverage, "schematic-only");
  assert.equal(getAiMotifMetadata("verified_map_outline").auditOccurrences, 14);
  assert.equal(getAiMotifMetadata("missing"), null);
});

test("panel flow emits evenly spaced native vessels and plain transition lines", () => {
  const scene = createAiMotifScene("panel_flow", {
    panelCount: 4,
    vesselKind: "cylinder_graduated",
    states: [
      { liquid: 0.2, hasPiston: true, pistonAt: 0.7 },
      { liquid: 0.35, hasPiston: true, pistonAt: 0.6 },
      { liquid: 0.5, hasPiston: true, pistonAt: 0.45 },
      { liquid: 0.7, hasPiston: true, pistonAt: 0.3 },
    ],
  });
  assert.equal(scene.mode, "diagram");
  assert.equal(scene.elements.filter((el) => el.type === "vessel").length, 4);
  assert.equal(scene.elements.filter((el) => el.type === "line").length, 3);
  assert.ok(scene.elements.every((el) => el.arrow == null || el.arrow === "none"));
  const result = compileAiMotif("panel_flow", {
    panelCount: 4,
    states: [{ liquid: 0.2 }, { liquid: 0.4 }, { liquid: 0.6 }, { liquid: 0.8 }],
  });
  assertNativeDiagram(result);
  const vessels = result.objects.filter((obj) => obj.type === "vessel");
  const gaps = vessels.slice(1).map((obj, index) => obj.x - vessels[index].x);
  assert.ok(gaps.every((gap) => Math.abs(gap - gaps[0]) < 1e-9));
});

test("dual-axis scaffold maps secondary series to the right scale without labels or numbers", () => {
  const result = compileAiMotif("dual_axis_plot", {
    xRange: [0, 4], leftRange: [0, 8], rightRange: [0, 200], tickCount: 4,
    leftSeries: [{ style: "straight", points: [[0, 0], [2, 4], [4, 8]] }],
    rightSeries: [{ style: "smooth", points: [[0, 200], [2, 100], [4, 0]] }],
  });
  assertNativeDiagram(result);
  assert.equal(result.objects.filter((obj) => obj.type === "coordplane").length, 1);
  assert.equal(result.objects.filter((obj) => obj.type === "funcgraph").length, 1);
  assert.equal(result.objects.filter((obj) => obj.type === "curve").length, 1);
  const secondary = result.objects.find((obj) => obj.type === "curve");
  assert.deepEqual(secondary.points[0], { x: -60, y: -30 });
  assert.deepEqual(secondary.points.at(-1), { x: 60, y: 30 });
  assert.equal(result.objects[0].showTickLabels, false);
  assert.equal(result.objects[0].showAxisLabels, false);
});

test("orthogonal and diagonal wiring preserve requested topology", () => {
  const nodes = [
    { id: "a", at: [-30, -20] }, { id: "b", at: [30, 20] }, { id: "c", at: [45, -15] },
  ];
  const orthogonal = compileAiMotif("orthogonal_wiring", {
    nodes,
    edges: [
      { from: "a", to: "b", bend: "vertical-first" },
      { from: "b", to: "c", bend: "horizontal-first" },
    ],
  });
  assertNativeDiagram(orthogonal);
  const paths = orthogonal.objects.filter((obj) => obj.type === "polyline");
  assert.equal(paths.length, 2);
  for (const path of paths) {
    for (let i = 1; i < path.points.length; i += 1) {
      const previous = path.points[i - 1], current = path.points[i];
      assert.ok(previous.x === current.x || previous.y === current.y, "orthogonal segment became diagonal");
    }
  }

  const diagonal = compileAiMotif("diagonal_wiring", {
    nodes: nodes.slice(0, 2), edges: [{ from: "a", to: "b" }], showNodes: false,
  });
  assertNativeDiagram(diagonal);
  const wire = diagonal.objects[0];
  assert.equal(wire.type, "line");
  assert.notEqual(wire.p1.x, wire.p2.x);
  assert.notEqual(wire.p1.y, wire.p2.y);
});

test("orthogonal wiring rejects accidental diagonal via segments", () => {
  assert.throws(() => createAiMotifScene("orthogonal_wiring", {
    nodes: [{ id: "a", at: [0, 0] }, { id: "b", at: [20, 20] }],
    edges: [{ from: "a", via: [[10, 10]], to: "b" }],
  }), /diagonal segment/);
});

test("contour bundles are deterministic, unfilled and annotation-free", () => {
  const first = createAiMotifScene("contour_bundle", { variant: "nested", count: 6 });
  const second = createAiMotifScene("contour_bundle", { variant: "nested", count: 6 });
  assert.deepEqual(first, second);
  assert.equal(first.elements.length, 6);
  assert.ok(first.elements.every((el) => el.type === "curve" && el.closed && el.fill === false));
  const result = compileAiMotif("contour_bundle", { variant: "parallel", count: 5 });
  assertNativeDiagram(result);
  assert.equal(result.objects.filter((obj) => obj.type === "curve").length, 5);
  assert.ok(result.objects.every((obj) => obj.fillNone === true));
});

test("generic coastline cannot masquerade as exact named geography", () => {
  assert.throws(() => createAiMotifScene("coastline_schematic"), /intent:'schematic'/);
  assert.throws(() => createAiMotifScene("coastline_schematic", {
    intent: "schematic", region: "Korea",
  }), /named region/);
  const item = createAiMotif("coastline_schematic", { intent: "schematic", variant: "islands" });
  assert.equal(item.metadata.coverage, "schematic-only");
  assert.equal(item.scene.elements.length, 4);
  const result = compileAiMotif("coastline_schematic", { intent: "schematic", variant: "islands" });
  assertNativeDiagram(result);
  assert.ok(result.objects.every((obj) => obj.type === "curve" && obj.fillNone === true));
});

test("verified map shortcut requires one exact variant and stays map-only", () => {
  assert.throws(() => createAiMotifScene("verified_map_outline"), /explicit variant/);
  assert.throws(() => createAiMotifScene("verified_map_outline", { variant: "asia" }), /Unknown verified map variant/);
  assert.throws(() => createAiMotifScene("verified_map_outline", {
    variant: "world", label: "A",
  }), /does not allow option/);
  assert.throws(() => createAiMotifScene("verified_map_outline", {
    variant: "world", politicalBorders: true,
  }), /does not allow option/);
  assert.throws(() => createAiMotifScene("verified_map_outline", {
    variant: "world", fillLand: "yes",
  }), /must be boolean/);

  const scene = createAiMotifScene("verified_map_outline", {
    variant: "east_asia", fillLand: false,
  });
  assert.equal(scene.mode, "diagram");
  assert.ok(scene.elements.length > 0 && scene.elements.length <= 120);
  assert.ok(scene.elements.every((element) => (
    element.type === "polyline" && element.closed === false
    && element.fill === false && element.arrow === "none"
    && element.label == null && element.text == null
  )));
  assertNativeDiagram(compileFastScene(scene, { idPrefix: "map_expanded" }));
});

test("verified map direct compilation preserves source metadata and hides filled land seams", () => {
  const result = compileAiMotif("verified_map_outline", {
    variant: "korean_peninsula", fillLand: true,
  }, { idPrefix: "verified_direct" });
  assertNativeDiagram(result);
  assert.equal(result.mapVariant, "korean_peninsula");
  assert.equal(result.metadata.politicalBorders, false);
  assert.equal(result.source.geometry, "physical land coastline only; no political boundaries");
  assert.ok(result.rings.length > 0);
  assert.ok(result.objects.slice(0, result.rings.length)
    .every((object) => object.strokeLevel === object.fillLevel));
});

test("catalog rejects unknown motifs and never passes caller labels through", () => {
  assert.throws(() => createAiMotifScene("human"), /Unknown AI motif/);
  const result = compileAiMotif("panel_flow", {
    panelCount: 2, label: "A", text: "1", arrow: "end",
    states: [{ liquid: 0.2, label: "B" }, { liquid: 0.7, text: "2" }],
  });
  assertNativeDiagram(result);
  assert.ok(result.objects.every((obj) => !obj.text && !obj.label));
});

test("single high-level motif element expands from parsed, direct and fenced JSON forms", () => {
  const root = {
    schema: "5e-fast-scene@1",
    mode: "diagram",
    artboard: { w: 180, h: 80 },
    elements: [{ type: "motif", motif: "panel_flow", options: { panelCount: 3 } }],
  };
  const expanded = expandAiMotifScene(root);
  assert.equal(expanded.schema, "5e-fast-scene@1");
  assert.deepEqual(expanded.artboard, { w: 180, h: 80 });
  assert.equal(expanded.elements.filter((element) => element.type === "vessel").length, 3);
  assert.equal(root.elements[0].type, "motif", "expansion mutated its input");

  const direct = expandAiMotifScene({ type: "motif", motif: "contour_bundle", options: { count: 4 } });
  assert.equal(direct.elements.length, 4);

  const fenced = expandAiMotifScene(`\`\`\`json\n${JSON.stringify(root)}\n\`\`\``);
  assert.deepEqual(fenced, expanded);
  assertNativeDiagram(compileFastSceneWithMotifs(root, { idPrefix: "motif_high_level" }));

  const mapRoot = {
    schema: "5e-fast-scene@1", mode: "diagram", artboard: { w: 170, h: 85 },
    elements: [{ type: "motif", motif: "verified_map_outline", options: { variant: "pacific", fillLand: true } }],
  };
  const mapCompiled = compileFastSceneWithMotifs(mapRoot, { idPrefix: "map_high_level" });
  assertNativeDiagram(mapCompiled);
  assert.equal(mapCompiled.mapVariant, "pacific");
  assert.deepEqual(mapCompiled.artboard, { w: 170, h: 85 });
  assert.ok(mapCompiled.rings.length > 0);
});

test("ordinary fast scenes pass through by identity while mixed or complete-mode motif scenes are rejected", () => {
  const ordinary = {
    schema: "5e-fast-scene@1", mode: "diagram", artboard: { w: 80, h: 50 },
    elements: [{ type: "rect", box: [-10, -10, 20, 20] }],
  };
  assert.equal(expandAiMotifScene(ordinary), ordinary);
  assert.throws(() => expandAiMotifScene({
    ...ordinary,
    elements: [ordinary.elements[0], { type: "motif", motif: "contour_bundle", options: {} }],
  }), /sole element/);
  assert.throws(() => expandAiMotifScene({
    ...ordinary, mode: "complete",
    elements: [{ type: "motif", motif: "contour_bundle", options: {} }],
  }), /diagram-mode only/);
  assert.throws(() => expandAiMotifScene({
    type: "motif", motif: "panel_flow", options: {}, label: "hidden text",
  }), /unsupported field/);
  assert.throws(() => expandAiMotifScene({
    schema: "other", mode: "diagram", elements: [{ type: "motif", motif: "panel_flow", options: {} }],
  }), /schema must be/);
  assert.throws(() => expandAiMotifScene({
    schema: "5e-fast-scene@1", mode: "diagram", hidden: true,
    elements: [{ type: "motif", motif: "panel_flow", options: {} }],
  }), /unsupported root field/);
});

test("Luna prompt exposes the audited shortcut contract and map safety boundary", () => {
  assert.match(AI_MOTIF_PROMPT_REFERENCE, /panel_flow/);
  assert.match(AI_MOTIF_PROMPT_REFERENCE, /dual_axis_plot/);
  assert.match(AI_MOTIF_PROMPT_REFERENCE, /coastline_schematic/);
  assert.match(AI_MOTIF_PROMPT_REFERENCE, /verified_map_outline/);
  assert.match(AI_MOTIF_PROMPT_REFERENCE, /student_trio_seated_dialogue/);
  assert.match(AI_MOTIF_PROMPT_REFERENCE, /spacecraft_flat_shell/);
  assert.match(AI_MOTIF_PROMPT_REFERENCE, /simple_series_circuit/);
  assert.match(AI_MOTIF_PROMPT_REFERENCE, /fixed_pulley_spring_loads/);
  assert.match(AI_MOTIF_PROMPT_REFERENCE, /lens_mirror_screen_bench/);
  assert.match(AI_MOTIF_PROMPT_REFERENCE, /vessel_particle_comparison/);
  assert.match(AI_MOTIF_PROMPT_REFERENCE, /logistic_population_graph/);
  assert.match(AI_MOTIF_PROMPT_REFERENCE, /speechBubbleEvidence/);
  assert.match(AI_MOTIF_PROMPT_REFERENCE, /state:"solid\|liquid\|gas"/);
  assert.match(AI_MOTIF_PROMPT_REFERENCE, /for particlebox panels always set state and count/);
  assert.match(AI_MOTIF_PROMPT_REFERENCE, /never use for named or exact geography/);
  assert.match(AI_MOTIF_PROMPT_REFERENCE, /variant is mandatory/);
  assert.match(AI_MOTIF_PROMPT_REFERENCE, /no political boundaries, place names, labels, symbols, leaders or arrows/);
  assert.match(AI_MOTIF_PROMPT_REFERENCE, /return the map alone/);
  const prompt = buildFastScenePrompt({ request: "세 패널의 비커 과정을 그려 줘", mode: "diagram" });
  assert.match(prompt, /"type":"motif"/);
  assert.match(prompt, /Never combine a motif shortcut with ordinary elements/);
  assert.match(prompt, /intent:\"schematic\"/);
  assert.match(prompt, /verified_map_outline must be the whole output/);
  assert.match(prompt, /the user adds those later in 5E/);
});

test("catalog generation and compilation remain fast enough for an interactive local path", () => {
  const cases = [
    ["panel_flow", { panelCount: 4 }],
    ["dual_axis_plot", { leftSeries: [{ points: [[0, 0], [5, 7], [10, 4]] }] }],
    ["orthogonal_wiring", {}],
    ["diagonal_wiring", {}],
    ["contour_bundle", { count: 7 }],
    ["coastline_schematic", { intent: "schematic", variant: "islands" }],
    ["verified_map_outline", { variant: "korean_peninsula", fillLand: false }],
    ["student_trio_seated_dialogue", {}],
    ["spacecraft_flat_shell", {}],
    ["simple_series_circuit", { switchState: "open" }],
    ["fixed_pulley_spring_loads", {}],
    ["lens_mirror_screen_bench", { lensKind: "convex_lens", mirrorRotation: 45 }],
    ["vessel_particle_comparison", {
      vesselKind: "beaker", liquid: 0.45, particleState: "gas",
      particleCount: 16, particleShape: "circle", mix: false,
    }],
    ["logistic_population_graph", {}],
  ];
  const started = performance.now();
  let objects = 0;
  for (let i = 0; i < 1500; i += 1) {
    const [id, options] = cases[i % cases.length];
    const result = compileAiMotif(id, options, { idPrefix: `bench_${i % 6}` });
    assert.equal(result.supported, true);
    objects += result.objects.length;
  }
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 1800, `1500 motif compiles took ${elapsed.toFixed(1)}ms`);
  console.log(`motif catalog benchmark: 1500 compiles / ${objects} objects in ${elapsed.toFixed(1)}ms (${(elapsed / 1500).toFixed(3)}ms each)`);
});
