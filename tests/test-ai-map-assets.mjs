import assert from "node:assert/strict";
import test from "node:test";

import {
  VERIFIED_MAP_RUNTIME_VERSION,
  VERIFIED_MAP_VARIANT_IDS,
  compileVerifiedMap,
  createVerifiedMapScene,
  getVerifiedMapMetadata,
  listVerifiedMapMetadata,
  listVerifiedMaps,
} from "../js/ai-map-assets.js";
import { auditDiagramObjects, compileFastScene } from "../js/ai-scene-fastpath.js";
import { normalizeObject } from "../tools/mcp-5e/lib/schema.js";

const IDS = ["world", "pacific", "east_asia", "korean_peninsula"];

function assertDiagramResult(result) {
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.supported, true, JSON.stringify(result.unsupported));
  assert.ok(result.objects.length > 0);
  assert.deepEqual(auditDiagramObjects(result.objects), []);
  for (const object of result.objects) {
    assert.ok(["curve", "polyline"].includes(object.type));
    assert.equal(object.arrowHead, "none");
    assert.equal(object.text == null || object.text === "", true);
    assert.equal(object.label == null || object.label === "", true);
    const normalized = normalizeObject(object, { artboard: result.artboard });
    assert.deepEqual(normalized.errors, [], normalized.errors.join("; "));
  }
}

test("verified catalog lists exactly four pinned physical-coastline variants", () => {
  assert.equal(VERIFIED_MAP_RUNTIME_VERSION, "5e-verified-map-runtime@1");
  assert.deepEqual(VERIFIED_MAP_VARIANT_IDS, IDS);
  const listed = listVerifiedMapMetadata();
  assert.deepEqual(listed.map((item) => item.id), IDS);
  assert.deepEqual(listVerifiedMaps(), listed);
  for (const item of listed) {
    assert.equal(item.geometry, "physical land coastline only; no political boundaries");
    assert.equal(item.politicalBorders, false);
    assert.equal(item.renderedAnnotations, false);
    assert.match(item.source.url, /^https:\/\//);
    assert.match(item.source.coastlineUrl, /^https:\/\//);
    assert.match(item.source.commit, /^[a-f0-9]{40}$/);
    assert.match(item.source.sha256, /^[a-f0-9]{64}$/);
    assert.match(item.source.coastlineSha256, /^[a-f0-9]{64}$/);
    assert.equal(item.source.license, "public domain");
    assert.ok(item.ringCount > 0);
    assert.ok(item.pointCount >= item.ringCount * 3);
  }
  assert.equal(getVerifiedMapMetadata("missing"), null);
});

test("metadata is detached and cannot mutate the generated catalog", () => {
  const first = getVerifiedMapMetadata("world");
  first.bbox[0] = 999;
  first.source.name = "changed";
  const second = getVerifiedMapMetadata("world");
  assert.notEqual(second.bbox[0], 999);
  assert.notEqual(second.source.name, "changed");
});

test("every variant creates deterministic diagram-only scene geometry", () => {
  for (const id of IDS) {
    const first = createVerifiedMapScene(id);
    const second = createVerifiedMapScene(id);
    const meta = getVerifiedMapMetadata(id);
    assert.deepEqual(first, second);
    assert.equal(first.schema, "5e-fast-scene@1");
    assert.equal(first.mode, "diagram");
    assert.deepEqual([first.artboard.w, first.artboard.h], meta.sourceSize);
    assert.ok(first.elements.length > 0 && first.elements.length <= 120);
    const generic = compileFastScene(first, { idPrefix: `generic_${id}` });
    assertDiagramResult(generic);
    for (const element of first.elements) {
      assert.ok(["curve", "polyline"].includes(element.type));
      assert.equal(element.arrow, "none");
      assert.equal("label" in element, false);
      assert.equal("text" in element, false);
      assert.ok(element.points.length >= 2);
    }
  }
});

test("every verified variant compiles to MCP-normalizable native curves", () => {
  for (const id of IDS) {
    const result = compileVerifiedMap(id, {}, { idPrefix: `map_test_${id}` });
    assertDiagramResult(result);
    assert.equal(result.mapVariant, id);
    assert.equal(result.assetId, `verified_map:${id}`);
    assert.equal(result.source.geometry, "physical land coastline only; no political boundaries");
    assert.equal(result.rings.length, 0, "default scene must reserve the UI budget for coastlines");
    assert.ok(result.rings.every((ring) => typeof ring.hole === "boolean" && ring.pointCount >= 3));
    assert.ok(result.coastlines.length > 0);
    assert.ok(result.objects.every((object) => object.id.startsWith(`map_test_${id}_`)));
  }
});

test("coastline-only mode omits all land masks", () => {
  for (const id of IDS) {
    const result = compileVerifiedMap(id, { fillLand: false });
    assertDiagramResult(result);
    assert.equal(result.rendering.fillLand, false);
    assert.deepEqual(result.rings, []);
    assert.equal(result.objects.length, result.coastlines.length);
    assert.ok(result.objects.every((object) => object.fillNone === true));
  }
});

test("filled UI scenes keep major land groups plus longest coastlines within 120 elements", () => {
  for (const id of IDS) {
    const scene = createVerifiedMapScene(id, { fillLand: true, landTone: "gray" });
    assert.ok(scene.elements.length <= 120);
    const generic = compileFastScene(scene, { idPrefix: `filled_generic_${id}` });
    assertDiagramResult(generic);
    const result = compileVerifiedMap(id, { fillLand: true, landTone: "gray" });
    assertDiagramResult(result);
    assert.equal(result.rendering.fillLand, true);
    assert.ok(result.rings.length > 0);
    assert.ok(result.objects.slice(0, result.rings.length)
      .every((object) => object.strokeLevel === object.fillLevel));
  }
});

test("fullDetail is compile-only and safely merges local batches", () => {
  assert.throws(() => createVerifiedMapScene("world", { fullDetail: true }), /only through compileVerifiedMap/);
  const result = compileVerifiedMap("world", { fillLand: true, fullDetail: true });
  assertDiagramResult(result);
  assert.equal(result.rendering.fullDetail, true);
  assert.equal(result.rings.length, result.metadata.ringCount);
  assert.equal(result.coastlines.length, result.metadata.coastlineCount);
  assert.ok(result.stats.batchCount >= 2);
});

test("custom artboards use a single containment scale and keep every point inside", () => {
  const result = compileVerifiedMap("korean_peninsula", {
    artboard: { w: 180, h: 80 },
    padding: 5,
    strokeWidth: 0.25,
  });
  assertDiagramResult(result);
  assert.deepEqual(result.artboard, { w: 180, h: 80 });
  assert.equal(result.fit.padding, 5);
  for (const object of result.objects) {
    for (const point of object.points) {
      assert.ok(point.x >= -85 - 1e-6 && point.x <= 85 + 1e-6);
      assert.ok(point.y >= -35 - 1e-6 && point.y <= 35 + 1e-6);
    }
  }
});

test("variant selection is explicit and unsafe presentation requests fail closed", () => {
  assert.throws(() => createVerifiedMapScene(), /variant is required/);
  assert.throws(() => createVerifiedMapScene(""), /variant is required/);
  assert.throws(() => createVerifiedMapScene("asia"), /Unknown verified map variant/);
  assert.throws(() => createVerifiedMapScene("world", { mode: "complete" }), /diagram-mode only/);
  assert.throws(() => compileVerifiedMap("world", {}, { mode: "complete" }), /diagram-mode only/);
  assert.throws(() => createVerifiedMapScene("world", { politicalBorders: true }), /does not allow option/);
  assert.throws(() => createVerifiedMapScene("world", { label: "A" }), /does not allow option/);
  assert.throws(() => createVerifiedMapScene("world", { arrow: "end" }), /does not allow option/);
  assert.throws(() => createVerifiedMapScene("world", { landTone: "blue" }), /gray or white/);
  assert.throws(() => createVerifiedMapScene("world", { artboard: { w: 10, h: 80 } }), /20\.\.500/);
  assert.throws(() => createVerifiedMapScene("world", { padding: 40 }), /non-empty drawing area/);
  assert.throws(() => createVerifiedMapScene("world", { strokeWidth: 2 }), /0\.15\.\.0\.8/);
});
