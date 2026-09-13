import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  SELECTION_HANDLE_COUNT,
  selectionVisualMetrics,
} from "../js/selection-visuals.js";

test("approved selection metrics stay constant in CSS pixels at every zoom", () => {
  assert.equal(SELECTION_HANDLE_COUNT, 8);
  for (const zoom of [0.25, 1, 4]) {
    const metrics = selectionVisualMetrics(zoom);
    assert.equal(metrics.strokeWorld * zoom, 1);
    assert.equal(metrics.handleWorld * zoom, 8);
    assert.equal(metrics.hitWorld * zoom, 24);
    assert.deepEqual(metrics.dashWorld.map(value => value * zoom), [4, 3]);
  }
});

test("renderer encodes solid single, solid outer multi, dashed inner multi and eight handles", () => {
  const source = fs.readFileSync(new URL("../js/render/scene.js", import.meta.url), "utf8");
  assert.match(source, /data-selection-frame/u);
  assert.match(source, /"multi-outer"/u);
  assert.match(source, /"multi-member"\s*:\s*"single"/u);
  assert.match(source, /SELECTION_HANDLE_COUNT/u);
  assert.match(source, /!_members\.some\(\(o\) => o\.locked\)/u);
  assert.doesNotMatch(source, /_members\.some\(\(o\) => o\.locked\)\) return/u);
  assert.match(source, /stroke-width", SELECTION_STROKE_PX/u);
  assert.ok(source.indexOf('renderSnapPreview') < source.lastIndexOf('if (state.draft)'));
  assert.match(source, /vector-effect[^\n]+non-scaling-stroke/u);
});

test("marquee uses the shared fine dash and faint blue fill contract", () => {
  const source = fs.readFileSync(new URL("../js/tools.js", import.meta.url), "utf8");
  assert.match(source, /selectionVisualMetrics/u);
  assert.match(source, /SELECTION_MARQUEE_FILL/u);
  assert.match(source, /vector-effect[^\n]+non-scaling-stroke/u);
});

test("ungrouped multi resize is selected by identity without writing groupId", () => {
  const source = fs.readFileSync(new URL("../js/transform.js", import.meta.url), "utf8");
  assert.match(source, /selectedIds0\.length > 1[\s\S]*_groupMemberIds\s*=\s*selectedIds0\.filter/u);
  const resizeSection = source.slice(source.indexOf("selectedIds0.length > 1"), source.indexOf("if (hLabel && hObjId"));
  assert.doesNotMatch(resizeSection, /\.groupId\s*=/u);
});
