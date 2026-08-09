import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  SAFE_PART_POLICIES,
  SAFE_PART_POLICY_VERSION,
  buildSafePart,
  safePartsSummary,
} from "../tools/mcp-5e/lib/parts.js";
import { inlineImages } from "../tools/mcp-5e/lib/images.js";
import { normalizeObject } from "../tools/mcp-5e/lib/schema.js";

const PARTS_DIR = path.resolve("assets", "exam-parts");
const SOURCE_FILES = ["hand_grip.png", "hand_grip_back.png", "hand_grip_front.png", "hand_press.png"];

function hashes() {
  return Object.fromEntries(SOURCE_FILES.map((file) => [
    file,
    createHash("sha256").update(readFileSync(path.join(PARTS_DIR, file))).digest("hex"),
  ]));
}

function grip(overrides = {}) {
  return buildSafePart({
    part: "hand_grip",
    purpose: "reference-reconstruction",
    mode: "diagram",
    examId: "p1_2025_06_19",
    panelRef: "p1_2025_06_19#panel-1",
    context: "inclined-block-grip",
    gripAt: { x: 0, y: 0 },
    w: 12,
    between: [{ type: "rect", x: 0, y: -4, w: 8, h: 8, fillLevel: 255 }],
    ...overrides,
  });
}

test("safe part catalog is explicit, provenance-limited and does not expose generic hands", () => {
  assert.equal(SAFE_PART_POLICY_VERSION, "5e-safe-exam-parts@1");
  assert.deepEqual(Object.keys(SAFE_PART_POLICIES), ["hand_grip", "hand_press"]);
  assert.deepEqual(Object.keys(SAFE_PART_POLICIES.hand_grip.allowedPanels), [
    "p1_2023_09_20", "p1_2025_06_19", "p1_2027_06_18",
  ]);
  assert.deepEqual(Object.keys(SAFE_PART_POLICIES.hand_press.allowedPanels), ["p1_2024_11_08"]);
  assert.match(safePartsSummary(), /reference-reconstruction|purpose/);
  assert.match(safePartsSummary(), /출처 래스터는 변경하지 않으며/);
});

test("hand grip requires the exact audited purpose, exam, panel, context and geometry", () => {
  assert.match(buildSafePart({ part: "hand_grip" }).error, /purpose/);
  assert.match(grip({ purpose: "generic-asset" }).error, /purpose/);
  assert.match(grip({ examId: "p1_2025_06_18" }).error, /문항\/패널/);
  assert.match(grip({ panelRef: "p1_2025_06_19#panel-2" }).error, /문항\/패널/);
  assert.match(grip({ context: "vertical-rod-grip" }).error, /context/);
  assert.match(grip({ mode: "complete" }).error, /diagram/);
  assert.match(grip({ at: { x: 0, y: 0 } }).error, /gripAt/);
  assert.match(grip({ layer: "front" }).error, /앞\/뒤 단독/);
  assert.match(grip({ w: 30 }).error, /배율/);
  assert.match(grip({ w: 10, h: 10 }).error, /종횡비/);
});

test("hand grip permits one unlabeled block, scrubs only the front crop and keeps source bytes unchanged", () => {
  const before = hashes();
  const built = grip();
  assert.equal(built.error, undefined);
  assert.equal(built.objects.length, 3);
  assert.equal(built.policyVersion, SAFE_PART_POLICY_VERSION);
  assert.equal(built.provenance.sourceFilesUnmodified, true);
  assert.equal(built.provenance.authorizedPanelRef, "p1_2025_06_19#panel-1");

  const images = built.objects.filter((object) => object.type === "image");
  assert.equal(images.length, 2);
  const front = images.find((object) => object.srcPath.endsWith("hand_grip_front.png"));
  const back = images.find((object) => object.srcPath.endsWith("hand_grip_back.png"));
  assert.deepEqual(front.cutouts, [{ type: "rect", x: 2 / 46, y: 68 / 110, w: 7 / 46, h: 15 / 110 }]);
  assert.equal(front.assetProvenance.contaminationScrub, "non-destructive-normalized-cutout");
  assert.equal(back.cutouts, undefined);
  assert.equal(back.assetProvenance.contaminationScrub, "none");
  assert.equal(built.objects[1].assetProvenance.sourceDerivedRaster, false);

  const inlined = inlineImages(built.objects);
  for (const object of inlined) {
    const checked = normalizeObject(object, { artboard: { w: 60, h: 40 } });
    assert.deepEqual(checked.errors, [], checked.errors.join("; "));
  }
  assert.deepEqual(hashes(), before, "safe wrapper modified a source raster");
});

test("hand grip rejects labels, arrows, extra apparatus, multiple targets and unsafe fields", () => {
  assert.match(grip({
    between: [{ type: "rect", x: 0, y: -4, w: 8, h: 8, labelInner: "m" }],
  }).error, /문자·숫자·기호·화살표/);
  assert.match(grip({
    between: [{ type: "rect", x: 0, y: -4, w: 8, h: 8, arrow: "none" }],
  }).error, /문자·숫자·기호·화살표/);
  assert.match(grip({
    between: [{ type: "rect", x: 0, y: -4, w: 8, h: 8, showNumbers: true }],
  }).error, /문자·숫자·기호·화살표/);
  assert.match(grip({
    between: [{ type: "apparatus", x: 0, y: 0, kind: "stand" }],
  }).error, /rect 객체 정확히 1개/);
  assert.match(grip({
    between: [
      { type: "rect", x: 0, y: -4, w: 8, h: 8 },
      { type: "rect", x: 10, y: -4, w: 8, h: 8 },
    ],
  }).error, /정확히 1개/);
  assert.match(grip({ arbitraryDevice: true }).error, /허용하지 않는 필드/);
});

test("hand press is exact-scene-only and accepts no inserted object or grip reinterpretation", () => {
  const built = buildSafePart({
    part: "hand_press",
    purpose: "reference-reconstruction",
    mode: "diagram",
    examId: "p1_2024_11_08",
    panelRef: "p1_2024_11_08#panel-1",
    context: "dashed-two-finger-spring-compression",
    at: { x: -6, y: -5 },
  });
  assert.equal(built.error, undefined);
  assert.equal(built.objects.length, 1);
  assert.equal(built.objects[0].assetProvenance.sourceExamId, "p1_2024_11_08");
  assert.equal(built.objects[0].cutouts, undefined);

  const wrongExam = buildSafePart({
    part: "hand_press", purpose: "reference-reconstruction", mode: "diagram",
    examId: "p1_2025_11_08", panelRef: "p1_2025_11_08#panel-1",
    context: "dashed-two-finger-spring-compression", at: { x: 0, y: 0 },
  });
  assert.match(wrongExam.error, /문항\/패널/);
  const withObject = buildSafePart({
    part: "hand_press", purpose: "reference-reconstruction", mode: "diagram",
    examId: "p1_2024_11_08", panelRef: "p1_2024_11_08#panel-1",
    context: "dashed-two-finger-spring-compression", at: { x: 0, y: 0 },
    between: [{ type: "rect", x: 0, y: 0, w: 4, h: 4 }],
  });
  assert.match(withObject.error, /between/);
});
