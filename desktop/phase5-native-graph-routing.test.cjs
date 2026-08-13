const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

test("automatic output is the default while explicit choices remain available", async () => {
  const modes = await import("../js/ai-quality-mode.js");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const panel = fs.readFileSync(path.join(root, "js", "ai-panel.js"), "utf8");
  assert.equal(modes.normalizeOutputEngine(undefined), "auto");
  assert.equal(modes.normalizeOutputEngine("auto"), "auto");
  assert.equal(modes.normalizeOutputEngine("raster"), "raster");
  assert.equal(modes.normalizeOutputEngine("asset"), "asset");
  assert.match(html, /class="is-on" data-ai-output-engine="auto"[^>]*>자동<small>권장<\/small>/);
  assert.match(panel, /AI_OUTPUT_ENGINES\.AUTO/);
});

test("automatic routing keeps graph images native and general reference transforms raster", async () => {
  const { chooseImageEngine, IMAGE_ENGINE_IDS } = await import("../js/ai-engine-router.js");
  const graph = chooseImageEngine({ request: "이 참고 이미지의 극좌표 그래프를 편집 가능하게 재현해 줘", references: [{}] });
  assert.equal(graph.engine, IMAGE_ENGINE_IDS.FAST_SCENE);
  assert.equal(graph.rule, "chart-or-graph");
  assert.equal(chooseImageEngine({ request: "이 참고 이미지에서 문자만 제거해 줘", references: [{}] }).engine,
    IMAGE_ENGINE_IDS.RASTER);
  for (const request of ["로그 축으로 함수를 그려 줘", "draw a polar plot", "use a logarithmic axis"]) {
    const unsupportedGraph = chooseImageEngine({ request });
    assert.equal(unsupportedGraph.engine, IMAGE_ENGINE_IDS.FAST_SCENE);
    assert.equal(unsupportedGraph.rule, "chart-or-graph");
  }
});

test("native graph failure policy reports unsupported features and forbids silent graph fallback", async () => {
  const policy = await import("../js/ai-native-graph-policy.mjs");
  assert.equal(policy.outputEngineForce("auto"), "auto");
  assert.equal(policy.outputEngineForce("raster"), "raster");
  assert.equal(policy.outputEngineForce("asset"), "fast-scene");
  assert.equal(policy.mustKeepNativeFailure({ outputEngine: "auto",
    routeDecision: { engine: "fast-scene", rule: "chart-or-graph" } }), true);
  assert.equal(policy.mustKeepNativeFailure({ outputEngine: "auto",
    routeDecision: { engine: "fast-scene", rule: "circuit" } }), false);
  assert.equal(policy.mustKeepNativeFailure({ outputEngine: "asset", routeDecision: { engine: "fast-scene" } }), true);
  const report = policy.nativeSceneFailureReport({
    errors: [{ code: "field_ignored", path: "$.elements[0].scale", message: "ignored" },
      { code: "field_ignored", path: "$.elements[0].axisAt", message: "ignored" }],
    unsupported: [{ code: "unsupported_kind", path: "$.elements[1].type", message: 'does not support "polar"' }],
  });
  assert.deepEqual(report.features, ["로그 축 척도", "사용자 지정 축 교점", "극좌표"]);
  assert.match(report.message, /자동으로 래스터로 바꾸지 않았습니다/);
  assert.match(report.message, /지원 가능한 부분 그래프/);
});

test("product compiler rejects unsupported graph fields instead of approximating them", async () => {
  const { compilePanelScene } = await import("../js/ai-panel.js");
  const elementCases = [
    { type: "graph", box: [-40, -25, 80, 50], scale: "log", series: [{ points: [[1, 1], [10, 2]] }] },
    { type: "graph", box: [-40, -25, 80, 50], axisAt: { x: 2, y: 3 }, series: [{ points: [[0, 1], [1, 2]] }] },
    { type: "polar", box: [-40, -25, 80, 50], series: [{ points: [[0, 1], [1, 2]] }] },
  ];
  for (const element of elementCases) {
    const compiled = compilePanelScene({
      schema: "5e-fast-scene@1",
      mode: "complete",
      artboard: { w: 100, h: 70 },
      elements: [element],
    }, { mode: "complete", layerId: 1, idPrefix: "phase5" }).result;
    assert.equal(compiled.valid && compiled.supported, false);
  }
});

test("product compilation is strict and comparison offers overlay and difference views", () => {
  const panel = fs.readFileSync(path.join(root, "js", "ai-panel.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "css", "ai-panel.css"), "utf8");
  assert.match(panel, /compileFastSceneWithMotifs\(input, \{ \.\.\.options, strict: true \}\)/);
  assert.match(panel, /mustKeepNativeFailure\(/);
  assert.match(panel, /nativeSceneFailureReport\(/);
  assert.match(panel, /addLog\(report\.message, "error"\);\s*finishCurrentTurnUi\(eventEpoch\);\s*return;/);
  assert.match(panel, /data-compare-view="overlay"/);
  assert.match(panel, /data-compare-view="difference"/);
  assert.match(panel, /검은 영역은 두 이미지가 다른 픽셀입니다/);
  assert.match(css, /\.ai-compare-overlay-stage\[data-mode="difference"\]/);
  assert.match(css, /\.ai-compare-panes\[hidden\]\s*\{\s*display:\s*none/);
});

test("difference view computes a white-identical and dark-mismatch pixel image", async () => {
  const { absoluteDifferencePixels, boundedComparisonSize } = await import("../js/image-difference.mjs");
  const left = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
  const right = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255]);
  assert.deepEqual([...absoluteDifferencePixels(left, right)], [255, 255, 255, 255, 0, 0, 0, 255]);
  assert.throws(() => absoluteDifferencePixels(left, right.subarray(0, 4)), /same length/);
  const bounded = boundedComparisonSize([{ width: 12000, height: 8000 }, { width: 9000, height: 12000 }]);
  assert.ok(bounded.width <= 1600 && bounded.height <= 1600);
  assert.ok(bounded.width * bounded.height <= 2_000_000);
});
