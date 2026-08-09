import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";

import {
  ILLUSTRATION_ASSET_CATALOG_VERSION,
  ILLUSTRATION_ASSET_IDS,
  compileIllustrationAsset,
  createIllustrationAssetScene,
  getIllustrationAssetMetadata,
  listIllustrationAssets,
} from "../js/ai-illustration-assets.js";
import {
  AI_MOTIF_IDS,
  compileAiMotif,
  compileFastSceneWithMotifs,
  createAiMotifScene,
  getAiMotifMetadata,
} from "../js/ai-motif-catalog.js";
import { auditDiagramObjects } from "../js/ai-scene-fastpath.js";
import { normalizeObject } from "../tools/mcp-5e/lib/schema.js";

function assertStrictDiagram(result) {
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.supported, true, JSON.stringify(result.unsupported));
  assert.ok(result.objects.length > 0);
  assert.deepEqual(auditDiagramObjects(result.objects), []);
  for (const object of result.objects) {
    const checked = normalizeObject(object, { artboard: result.artboard });
    assert.deepEqual(checked.errors, [], `${object.type}: ${checked.errors.join("; ")}`);
    assert.ok(!["text", "formula", "labeler"].includes(object.type));
    assert.ok(object.text == null || object.text === "");
    assert.ok(object.source == null || object.source === "");
    assert.ok(object.label == null || object.label === "");
    assert.ok(object.arrowHead == null || object.arrowHead === "none");
    assert.notEqual(object.showNumbers, true);
    assert.notEqual(object.showLabels, true);
  }
}

test("strict illustration catalog exposes only the two frequency-backed code-native families", () => {
  assert.equal(ILLUSTRATION_ASSET_CATALOG_VERSION, "5e-strict-illustration-assets@1");
  assert.deepEqual(ILLUSTRATION_ASSET_IDS, ["student_trio_seated_dialogue", "spacecraft_flat_shell"]);
  assert.deepEqual(listIllustrationAssets().map((item) => item.id), ILLUSTRATION_ASSET_IDS);
  assert.equal(getIllustrationAssetMetadata("student_trio_seated_dialogue").auditEvidence, 13);
  assert.equal(getIllustrationAssetMetadata("student_trio_seated_dialogue").blankSpeechBubbleAuditEvidence, 31);
  assert.equal(getIllustrationAssetMetadata("spacecraft_flat_shell").auditEvidence, 18);
  assert.equal(getIllustrationAssetMetadata("spacecraft_flat_shell").sourcePixelsEmbedded, false);
  assert.ok(getIllustrationAssetMetadata("student_trio_seated_dialogue").doNotGeneralize.length >= 3);
  assert.ok(getIllustrationAssetMetadata("spacecraft_flat_shell").doNotGeneralize.length >= 3);
  assert.equal(getIllustrationAssetMetadata("missing"), null);
});

test("seated trio is original editable line art with distinct figures and no implicit bubbles", () => {
  const first = compileIllustrationAsset("student_trio_seated_dialogue");
  const second = compileIllustrationAsset("student_trio_seated_dialogue");
  assertStrictDiagram(first);
  assert.deepEqual(first.objects, second.objects);
  assert.deepEqual(first.components, second.components);
  assert.deepEqual(first.artboard, second.artboard);
  assert.deepEqual(Object.keys(first.components).sort(), ["student_1", "student_2", "student_3", "table"]);
  assert.equal(first.provenance.sourcePixelsEmbedded, false);
  for (const role of ["student_1", "student_2", "student_3", "table"]) {
    assert.ok(first.components[role].objectIds.length > 0);
    assert.ok(first.objects.filter((object) => object.assetRole === role)
      .every((object) => object.groupId === first.components[role].groupId));
  }
  assert.notDeepEqual(first.components.student_1.objectIds, first.components.student_2.objectIds);
  const armSignature = (role, center) => first.objects
    .filter((object) => object.assetRole === role && object.type === "polyline")
    .slice(0, 2)
    .map((object) => object.points.map((point) => [point.x - center, point.y]));
  const signatures = [
    armSignature("student_1", -42), armSignature("student_2", 0), armSignature("student_3", 42),
  ];
  assert.notDeepEqual(signatures[0], signatures[1], "student 1 and 2 became translated clones");
  assert.notDeepEqual(signatures[1], signatures[2], "student 2 and 3 became translated clones");
});

test("blank speech-bubble outlines are separate, source-confirmed and tail-enum limited", () => {
  assert.throws(() => createIllustrationAssetScene("student_trio_seated_dialogue", {
    speechBubbles: "three_blank",
  }), /speechBubbleEvidence:'source' or 'request'/);
  assert.throws(() => createIllustrationAssetScene("student_trio_seated_dialogue", {
    speechBubbleEvidence: "source",
    speechBubbles: "three_blank",
    bubbleTails: ["down", "sideways", "down"],
  }), /bubbleTails\[1\]/);
  assert.throws(() => createIllustrationAssetScene("student_trio_seated_dialogue", {
    bubbleTails: ["down", "down", "down"],
  }), /only allowed/);
  assert.throws(() => createIllustrationAssetScene("student_trio_seated_dialogue", {
    speechBubbleEvidence: "source",
  }), /only allowed/);
  assert.throws(() => createIllustrationAssetScene("student_trio_seated_dialogue", {
    speechBubbles: "three_blank",
    speechBubbleEvidence: "assumed",
  }), /'source' or 'request'/);

  const result = compileIllustrationAsset("student_trio_seated_dialogue", {
    tableShape: "round",
    speechBubbles: "three_blank",
    speechBubbleEvidence: "request",
    bubbleTails: ["down_right", "down", "down_left"],
  });
  assertStrictDiagram(result);
  for (const role of ["bubble_1", "bubble_2", "bubble_3"]) {
    assert.equal(result.components[role].objectIds.length, 1);
    const bubble = result.objects.find((object) => object.assetRole === role);
    assert.equal(bubble.type, "curve");
    assert.equal(bubble.closed, true);
  }
});

test("spacecraft defaults to a shell and composes only explicitly requested layers", () => {
  const minimal = compileIllustrationAsset("spacecraft_flat_shell");
  assertStrictDiagram(minimal);
  assert.deepEqual(Object.keys(minimal.components), ["shell"]);

  const full = compileIllustrationAsset("spacecraft_flat_shell", {
    proportions: "long",
    facing: "left",
    window: "wide",
    occupant: "seated",
    device: "detector_box",
    deviceSlot: "front",
  });
  assertStrictDiagram(full);
  assert.deepEqual(Object.keys(full.components).sort(), ["device", "occupant", "shell", "window"]);
  assert.ok(full.objects.filter((object) => object.assetRole === "window").every((object) => object.fillLevel < 255));
  assert.ok(full.objects.filter((object) => object.assetRole !== "window").every((object) => object.fillLevel == null || object.fillLevel === 255));
  assert.equal(new Set(Object.values(full.components).map((component) => component.groupId)).size, 4);
});

test("spacecraft rejects inferred or overlapping content and unknown apparatus", () => {
  assert.throws(() => createIllustrationAssetScene("spacecraft_flat_shell", { occupant: "seated" }), /requires an explicit/);
  assert.throws(() => createIllustrationAssetScene("spacecraft_flat_shell", { device: "detector_box" }), /requires an explicit/);
  assert.throws(() => createIllustrationAssetScene("spacecraft_flat_shell", {
    window: "single", occupant: "seated", device: "detector_box",
  }), /requires the wide window/);
  assert.throws(() => createIllustrationAssetScene("spacecraft_flat_shell", {
    window: "wide", occupant: "seated", device: "point_source", deviceSlot: "rear",
  }), /rear device slot/);
  assert.throws(() => createIllustrationAssetScene("spacecraft_flat_shell", {
    window: "wide", device: "laser_cannon",
  }), /device must be one of/);
  assert.throws(() => createIllustrationAssetScene("spacecraft_flat_shell", { fins: true }), /does not allow option/);
});

test("high-level motif shortcut exposes both strict assets without allowing mixed content", () => {
  for (const id of ILLUSTRATION_ASSET_IDS) {
    assert.ok(AI_MOTIF_IDS.includes(id));
    assert.equal(getAiMotifMetadata(id).coverage, "strict-code-native");
    assert.deepEqual(createAiMotifScene(id), createIllustrationAssetScene(id));
    const direct = compileAiMotif(id);
    const highLevel = compileFastSceneWithMotifs({ type: "motif", motif: id, options: {} });
    assertStrictDiagram(direct);
    assertStrictDiagram(highLevel);
    assert.ok(Object.keys(direct.components).length > 0);
    assert.ok(Object.keys(highLevel.components).length > 0);
    assert.ok(highLevel.objects.every((object) => object.groupId && object.assetRole));
  }
  assert.throws(() => compileFastSceneWithMotifs({
    schema: "5e-fast-scene@1", mode: "diagram",
    elements: [
      { type: "motif", motif: "spacecraft_flat_shell", options: {} },
      { type: "rect", box: [0, 0, 5, 5] },
    ],
  }), /sole element/);
});

test("strict vector asset compilation stays deterministic and interactive", () => {
  const cases = [
    ["student_trio_seated_dialogue", {}],
    ["student_trio_seated_dialogue", { speechBubbles: "three_blank", speechBubbleEvidence: "source" }],
    ["spacecraft_flat_shell", {}],
    ["spacecraft_flat_shell", { window: "wide", occupant: "seated", device: "plane_mirror", deviceSlot: "front" }],
  ];
  const started = performance.now();
  let objects = 0;
  for (let i = 0; i < 1200; i += 1) {
    const [id, options] = cases[i % cases.length];
    const result = compileIllustrationAsset(id, options, { idPrefix: `asset_bench_${i}` });
    assert.equal(result.supported, true);
    objects += result.objects.length;
  }
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 2500, `1200 strict asset compiles took ${elapsed.toFixed(1)}ms`);
  console.log(`illustration asset benchmark: 1200 compiles / ${objects} objects in ${elapsed.toFixed(1)}ms`);
});
