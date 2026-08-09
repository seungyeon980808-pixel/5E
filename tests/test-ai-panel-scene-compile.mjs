import assert from "node:assert/strict";
import test from "node:test";

import { compilePanelScene } from "../js/ai-panel.js";

const compileOptions = Object.freeze({ mode: "diagram", layerId: 3, idPrefix: "panel_test" });

test("panel compiles strict illustration motifs directly while storing an expanded revision scene", () => {
  const request = {
    type: "motif",
    motif: "student_trio_seated_dialogue",
    options: { tableShape: "rect", speechBubbles: "none" },
  };
  const compiled = compilePanelScene(JSON.stringify(request), compileOptions);

  assert.equal(compiled.expansionError, null);
  assert.equal(compiled.result.valid, true);
  assert.equal(compiled.result.assetId, request.motif);
  assert.deepEqual(Object.keys(compiled.result.components).sort(), ["student_1", "student_2", "student_3", "table"]);
  assert.ok(compiled.result.objects.every((object) => object.assetRole && object.groupId));

  const revisionScene = JSON.parse(compiled.source);
  assert.ok(Array.isArray(revisionScene.elements));
  assert.equal(compiled.source.includes('"motif"'), false);
  assert.deepEqual(JSON.parse(compiled.compileSource), request);

  const replayed = compilePanelScene(compiled.compileSource, compileOptions);
  assert.equal(replayed.result.assetId, request.motif);
  assert.deepEqual(Object.keys(replayed.result.components).sort(), Object.keys(compiled.result.components).sort());
});

test("panel uses the verified-map direct compiler and retains its rendering metadata", () => {
  const request = {
    type: "motif",
    motif: "verified_map_outline",
    options: { variant: "korean_peninsula", fillLand: true },
  };
  const compiled = compilePanelScene(request, compileOptions);

  assert.equal(compiled.result.valid, true);
  assert.equal(compiled.result.assetId, "verified_map:korean_peninsula");
  assert.equal(compiled.result.mapVariant, "korean_peninsula");
  assert.equal(compiled.result.source.geometry, "physical land coastline only; no political boundaries");
  assert.ok(compiled.result.rings.length > 0);
  assert.ok(compiled.result.coastlines.length > 0);
  assert.ok(compiled.result.rendering);
  assert.equal(compiled.source.includes('"motif"'), false);
  assert.deepEqual(JSON.parse(compiled.compileSource), request);
});

test("panel keeps the safe generic invalid-result fallback for malformed scene JSON", () => {
  const compiled = compilePanelScene("not-json", compileOptions);

  assert.ok(compiled.expansionError instanceof Error);
  assert.equal(compiled.result.valid, false);
  assert.equal(compiled.result.supported, false);
  assert.equal(compiled.source, "not-json");
  assert.equal(compiled.compileSource, "not-json");
});
