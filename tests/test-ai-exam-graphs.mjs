import assert from "node:assert/strict";
import test from "node:test";

import { FAST_SCENE_SCHEMA_ID, compileFastScene } from "../js/ai-scene-fastpath.js";
import { migrate } from "../js/project-io.js";
import { normalizeObject } from "../tools/mcp-5e/lib/schema.js";

function compileGraph(graph) {
  const result = compileFastScene({
    schema: FAST_SCENE_SCHEMA_ID,
    mode: "complete",
    artboard: { w: 180, h: 110 },
    elements: [graph],
  }, { idPrefix: "exam_graph" });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.supported, true, JSON.stringify(result.unsupported));
  for (const object of result.objects) {
    const normalized = normalizeObject(object);
    assert.deepEqual(normalized.errors, [], `${object.type}: ${normalized.errors.join(", ")}`);
    assert.equal(normalized.obj.type, object.type);
  }
  return result;
}

test("기출 산점도는 프레임·격자·점·수선·개별 라벨을 네이티브 자산으로 보존한다", () => {
  const result = compileGraph({
    type: "graph", box: [-65, -42, 110, 76], xRange: [0, 5], yRange: [0, 5],
    axisVariant: "quadrant", frame: true, grid: true, xLabel: "전압", yLabel: "전류",
    tickTextX: ["1", "2", "3", "4", "5"], tickTextY: ["1", "2", "3", "4", "5"],
    series: [{
      kind: "scatter",
      points: [
        { x: 1, y: 4, label: "(가)" }, { x: 1, y: 2, label: "(나)" },
        { x: 3, y: 3, label: "(라)" }, { x: 4, y: 4, label: "(마)" },
      ],
    }],
    guides: [[1, 4], [3, 3]],
  });
  assert.deepEqual(result.objects.map((o) => o.type), ["coordplane"]);
  const plane = result.objects[0];
  assert.equal(plane.showFrame, true);
  assert.equal(plane.annMarkers.length, 4);
  assert.equal(plane.annGuides.length, 2);
  assert.deepEqual(plane.annLabelPoints.map((p) => p.text), ["(가)", "(나)", "(라)", "(마)"]);
  assert.equal(plane.tickLabelMode, "text");
  assert.ok(plane.axisLabelSize > 3);
  assert.ok(plane.tickLabelSize > 3);
  assert.equal(plane.gridStepX, 0.5);
  assert.equal(plane.gridStepY, 0.5);
});

test("다중 용해도형 곡선은 직접 라벨·점선·표시점을 계열별로 유지한다", () => {
  const result = compileGraph({
    type: "graph", box: [-70, -45, 125, 82], xRange: [0, 100], yRange: [0, 180],
    axisVariant: "quadrant", grid: true, showNumbers: true, xLabel: "온도(℃)", yLabel: "용해도",
    series: [
      { kind: "curve", label: "질산 나트륨", points: [[0, 75], [40, 105], [70, 140], [100, 180]] },
      { kind: "curve", label: "질산 칼륨", markers: true, points: [[0, 15], [30, 55], [60, 120], [80, 180]] },
      { kind: "curve", label: "염화 나트륨", dashed: true, points: [[0, 36], [50, 37], [100, 39]] },
    ],
  });
  const series = result.objects.filter((o) => o.type === "funcgraph");
  const plane = result.objects.find((o) => o.type === "coordplane");
  assert.equal(series.length, 3);
  assert.equal(plane.gridStepX, 10);
  assert.equal(plane.gridStepY, 20);
  assert.deepEqual(series.map((o) => o.endLabel), ["질산 나트륨", "질산 칼륨", "염화 나트륨"]);
  assert.equal(series[1].markers.length, 4);
  assert.ok(series[2].dashLength > 0);
});

test("가열·운동 그래프의 꺾은선과 가이드라인을 재편집 가능한 수학 좌표로 저장한다", () => {
  const result = compileGraph({
    type: "graph", box: [-70, -40, 130, 70], xRange: [0, 12], yRange: [0, 8],
    axisVariant: "quadrant", grid: false, xLabel: "가열 시간(분)", yLabel: "온도(℃)",
    series: [
      { kind: "line", label: "A", points: [[0, 1], [2, 7], [8, 8]] },
      { kind: "line", label: "B", points: [[0, 1], [4, 6], [12, 6]] },
    ],
    guideLines: [{ from: [2, 7], to: [2, 0] }],
    labels: [{ x: 5, y: 5, label: "C" }, { x: 8, y: 3, label: "D" }],
  });
  const plane = result.objects.find((o) => o.type === "coordplane");
  const series = result.objects.filter((o) => o.type === "funcgraph");
  assert.equal(series.every((o) => o.curveStyle === "straight"), true);
  assert.deepEqual(series[0].mathPoints, [{ x: 0, y: 1 }, { x: 2, y: 7 }, { x: 8, y: 8 }]);
  assert.equal(plane.guideLines.length, 1);
  assert.deepEqual(plane.annLabelPoints.map((p) => p.text), ["C", "D"]);
});

test("막대그래프는 funcgraph 막대 계열과 범례로 컴파일된다", () => {
  const result = compileGraph({
    type: "graph", box: [-70, -42, 115, 78], xRange: [0, 7], yRange: [0, 10],
    axisVariant: "quadrant", grid: false, tickTextX: ["W", "X", "Y"], yLabel: "원자 반지름",
    series: [
      { kind: "bar", barWidth: 0.55, fillStyle: "white", points: [[1, 4], [3, 7], [5, 6]] },
      { kind: "bar", barWidth: 0.55, fillStyle: "hatch", points: [[1.65, 6], [3.65, 5], [5.65, 8]] },
    ],
    legends: [{ x: 5.5, y: 9, rows: [{ text: "(가)" }, { text: "(나)", dash: "dash" }] }],
  });
  const bars = result.objects.filter((o) => o.sourceKind === "bar");
  assert.equal(bars.length, 2);
  assert.equal(bars[0].bars.items.length, 3);
  assert.equal(bars[0].bars.fillStyle, "solid");
  assert.equal(bars[0].bars.fillLevel, 255);
  assert.equal(bars[0].bars.labelUpright, true);
  assert.equal(bars[0].barFill, "white");
  assert.equal(bars[1].bars.fillStyle, "hatch");
  assert.equal(bars[1].bars.fillLevel, 0);
  assert.equal(bars[1].barFill, "hatch");
  assert.equal(result.objects[0].legends[0].rows.length, 2);
});

test("회색 막대와 눈금 숨김은 통합 그래프 모달의 네이티브 필드 규약을 따른다", () => {
  const result = compileGraph({
    type: "graph", box: [-45, -40, 70, 78], xRange: [0, 3], yRange: [0, 5],
    axisVariant: "quadrant", grid: false, ticks: false, originLabel: "0",
    yLabel: "평균 수면 시간(상댓값)",
    series: [{ kind: "bar", fillStyle: "gray", points: [{ x: 0.9, y: 0.75, label: "Ⅰ" }, { x: 2.05, y: 3.75, label: "Ⅱ" }] }],
  });
  const plane = result.objects.find((o) => o.type === "coordplane");
  const bars = result.objects.find((o) => o.sourceKind === "bar");
  assert.equal(plane.showTicks, false);
  assert.equal(bars.barFill, "gray");
  assert.equal(bars.bars.fillStyle, "solid");
  assert.equal(bars.bars.fillLevel, 170);
  assert.equal(bars.bars.labelSize, plane.tickLabelSize);
  assert.equal(plane.annLabelPoints.length, 0);
  assert.deepEqual(result.objects.filter((o) => o.type === "text" || o.type === "formula"), []);
});

test("평가원식 세로 y축 제목은 coordplane 자체 라벨 배치로 저장한다", () => {
  const result = compileGraph({
    type: "graph", box: [-45, -40, 70, 78], xRange: [0, 3], yRange: [0, 5],
    axisVariant: "quadrant", grid: false, ticks: false,
    yLabel: "평균 수면 시간\t(상댓값)", yLabelLayout: "vertical", series: [],
  });
  const plane = result.objects[0];
  assert.equal(plane.labelY, "평균 수면 시간\t(상댓값)");
  assert.equal(plane.labelYLayout, "vertical");
  assert.deepEqual(result.objects.map((o) => o.type), ["coordplane"]);
});

test("축 분수와 가로 글자 모드는 coordplane 라벨 원문으로 보존한다", () => {
  const result = compileGraph({
    type: "graph", box: [-42, -40, 72, 76], xRange: [0, 4], yRange: [0, 2],
    axisVariant: "quadrant", grid: false, yLabel: "\\frac{㉡}{㉠}",
    yLabelLayout: "horizontal", series: [],
  });
  const plane = result.objects[0];
  assert.equal(plane.labelY, "\\frac{㉡}{㉠}");
  assert.equal(plane.labelYLayout, "horizontal");
  assert.deepEqual(result.objects.map((o) => o.type), ["coordplane"]);
});

test("네이티브 그래프 필드는 5E 저장·불러오기 왕복에서 보존된다", () => {
  const result = compileGraph({
    type: "graph", box: [-55, -40, 90, 70], xRange: [0, 4], yRange: [0, 6],
    axisVariant: "quadrant", ticksX: false, ticksY: true,
    yLabel: "평균 수면 시간\t(상댓값)", yLabelLayout: "vertical",
    ranges: [{ from: [0.5, -0.4], to: [2.5, -0.4], label: "A" }],
    series: [{ kind: "bar", fillStyle: "gray", points: [{ x: 1, y: 2, label: "Ⅰ" }, { x: 3, y: 5, label: "Ⅱ" }] }],
  });
  const loaded = migrate({
    version: "0.16", objects: result.objects, guides: [], layers: [{ id: 1, name: "기본" }], artboard: { w: 180, h: 110 },
  });
  const objects = loaded.pages[0].objects;
  const plane = objects.find((o) => o.type === "coordplane");
  const bars = objects.find((o) => o.sourceKind === "bar");
  assert.equal(plane.labelYLayout, "vertical");
  assert.equal(plane.showTickX, false);
  assert.equal(plane.showTickY, true);
  assert.equal(plane.ranges[0].label, "A");
  assert.equal(bars.barFill, "gray");
  assert.equal(bars.bars.fillLevel, 170);
  assert.deepEqual(objects.filter((o) => o.type === "text" || o.type === "formula"), []);
});

test("축별 눈금 표시를 coordplane 자체 필드로 제어한다", () => {
  const result = compileGraph({
    type: "graph", box: [-45, -40, 70, 78], xRange: [0, 3], yRange: [0, 2],
    axisVariant: "quadrant", grid: false, ticksX: false, ticksY: true,
    tickTextY: ["1"], series: [{ kind: "bar", points: [[0.8, 1.6], [1.8, 0.5], [2.8, 0.5]] }],
  });
  const plane = result.objects[0];
  assert.equal(plane.showTicks, true);
  assert.equal(plane.showTickX, false);
  assert.equal(plane.showTickY, true);
  assert.deepEqual(plane.tickTextY, ["1"]);
});

test("이중 y축·면적·축 생략·방향 화살표가 손실 없이 남는다", () => {
  const result = compileGraph({
    type: "graph", box: [-70, -42, 125, 78], xRange: [0, 10], yRange: [0, 10],
    y2Range: [0, 100], yLabel: "개체 수", y2Label: "비율(%)", axisVariant: "quadrant",
    axisBreaks: [{ axis: "x", at: 5 }], arrows: [{ x: 7, y: 6, dx: 1, dy: 0.4 }],
    series: [
      { kind: "curve", points: [[0, 1], [4, 7], [10, 3]], area: { from: 2, to: 8, base: 0, label: "S" } },
      { kind: "line", axis: "y2", dashed: true, points: [[0, 20], [5, 55], [10, 90]] },
    ],
  });
  const plane = result.objects[0];
  const series = result.objects.filter((o) => o.type === "funcgraph");
  assert.deepEqual([plane.y2.y2Min, plane.y2.y2Max], [0, 100]);
  assert.equal(plane.axisBreaks.length, 1);
  assert.equal(plane.annArrows.length, 1);
  assert.equal(series[0].area.label, "S");
  assert.equal(series[1].axis, "y2");
  assert.equal(series[1].points.at(-1).y, plane.y + plane.h * 0.1);
});

test("원그래프는 조각별 편집 가능한 닫힌 폴리라인과 라벨로 컴파일된다", () => {
  const result = compileGraph({
    type: "graph", chartKind: "pie", box: [-35, -35, 70, 70],
    values: [{ value: 3, label: "3/5" }, { value: 2, label: "2/5", tone: "gray" }],
  });
  assert.equal(result.objects.filter((o) => o.type === "polyline").length, 2);
  assert.equal(result.objects.filter((o) => o.type === "text").length, 2);
  assert.equal(result.objects[0].closed, true);
  assert.ok(result.objects[0].points.length >= 5);
});

test("구형 좌상단 좌표 보정 시 막대·면적·표시점 부속 좌표도 함께 이동한다", () => {
  const result = compileFastScene({
    schema: FAST_SCENE_SCHEMA_ID, mode: "complete", artboard: { w: 160, h: 90 },
    elements: [{
      type: "graph", box: [20, 20, 100, 60], xRange: [0, 10], yRange: [0, 10],
      series: [
        { kind: "curve", markers: true, points: [[0, 2], [10, 8]], area: { base: 0 } },
        { kind: "bar", points: [[2, 4], [7, 6]] },
      ],
    }],
  });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.stats.originNormalization.applied, true);
  const curve = result.objects.find((o) => o.sourceKind === "points");
  const bars = result.objects.find((o) => o.sourceKind === "bar");
  assert.equal(curve.markers[0].x, curve.points[0].x);
  assert.equal(curve.area.baseY, result.objects[0].y + result.objects[0].h);
  assert.equal(bars.bars.items[0].x, bars.points[1].x);
});

test("음영 구간·지시선·치수선·범위 막대는 손실 없이 네이티브 5E 자산이 된다", () => {
  const result = compileGraph({
    type: "graph", box: [-70, -40, 120, 70], xRange: [0, 10], yRange: [0, 10],
    axisVariant: "quadrant", bands: [
      { axis: "x", from: 2, to: 4, level: 225, label: "Ⅰ" },
      { axis: "y", from: 7, to: 9, level: 235 },
    ],
    leaders: [{ from: [6, 7], to: [8, 9], label: "㉠" }],
    dimensions: [{ from: [2, 9], to: [4, 9], label: "Ⅰ", variant: "bothBars" }],
    ranges: [{ from: [1, -0.6], to: [5, -0.6], label: "A" }],
    series: [{ kind: "curve", points: [[0, 1], [5, 8], [10, 4]] }],
  });
  const plane = result.objects.find((o) => o.type === "coordplane");
  assert.equal(plane.bands.length, 2);
  assert.deepEqual([plane.leaders[0].from.x, plane.leaders[0].from.y, plane.leaders[0].to.x, plane.leaders[0].to.y], [6, 7, 8, 9]);
  assert.equal(plane.leaders[0].label, "㉠");
  assert.equal(plane.dimensions[0].label, "Ⅰ");
  assert.equal(plane.dimensions[0].variant, "bothBars");
  assert.equal(plane.ranges[0].label, "A");
  assert.deepEqual(result.objects.filter((o) => ["text", "formula", "line", "labeler"].includes(o.type)), []);
});

test("곡선 위 이름은 표시점 없이 회전 가능한 coordplane 내부 라벨로 남는다", () => {
  const result = compileGraph({
    type: "graph", box: [-55, -40, 100, 75], xRange: [0, 100], yRange: [0, 180],
    labels: [{ x: 42, y: 78, label: "질산 칼륨", labelRotation: -52, labelDistance: 0 }],
    series: [{ kind: "curve", points: [[0, 15], [40, 63], [80, 180]] }],
  });
  const plane = result.objects.find((o) => o.type === "coordplane");
  assert.equal(plane.annLabelPoints.length, 1);
  assert.equal(plane.annLabelPoints[0].showMarker, false);
  assert.equal(plane.annLabelPoints[0].rotation, -52);
  assert.deepEqual(result.objects.filter((o) => o.type === "text" || o.type === "formula"), []);
});

test("다중 패널 번호는 별도 텍스트가 아니라 각 coordplane의 자체 라벨이다", () => {
  const result = compileFastScene({
    schema: FAST_SCENE_SCHEMA_ID, mode: "complete", artboard: { w: 180, h: 90 }, elements: [
      { type: "graph", panelLabel: "①", panelLabelAt: [-0.7, 5.2], axisLabelSize: 3.2, tickLabelSize: 2.8, box: [-80, -30, 60, 50], xRange: [0, 5], yRange: [0, 5], series: [{ kind: "line", points: [[0, 0], [5, 5]] }] },
      { type: "graph", panelLabel: "②", box: [10, -30, 60, 50], xRange: [0, 5], yRange: [0, 5], series: [{ kind: "line", points: [[0, 5], [5, 0]] }] },
    ],
  });
  const planes = result.objects.filter((o) => o.type === "coordplane");
  assert.deepEqual(planes.map((o) => o.annLabelPoints[0].text), ["①", "②"]);
  assert.deepEqual([planes[0].annLabelPoints[0].x, planes[0].annLabelPoints[0].y], [-0.7, 5.2]);
  assert.equal(planes[0].axisLabelSize, 3.2);
  assert.equal(planes[0].tickLabelSize, 2.8);
  assert.ok(planes.every((o) => o.annLabelPoints[0].showMarker === false));
  assert.deepEqual(result.objects.filter((o) => o.type === "text" || o.type === "formula"), []);
});

test("정밀 곡선의 베지어 핸들은 월드 제어점과 재편집용 수학 오프셋을 함께 보존한다", () => {
  const handles = [
    { ix: 0, iy: 0, ox: 0.6, oy: -2 },
    { ix: -0.8, iy: 0.6, ox: 0.8, oy: -0.3 },
    { ix: -0.7, iy: 0.1, ox: 0, oy: 0 },
  ];
  const result = compileGraph({
    type: "graph", box: [-45, -35, 80, 65], xRange: [0, 5], yRange: [0, 5],
    series: [{ kind: "curve", curvature: 1.4, points: [[0.2, 5], [1.2, 1.8], [5, 0.3]], handles }],
  });
  const curve = result.objects.find((o) => o.type === "funcgraph");
  assert.equal(curve.curvature, 1.4);
  assert.deepEqual(curve.handlesMath, handles);
  assert.equal(curve.handles.length, 3);
  assert.ok(curve.handles.every((h) => [h.inX, h.inY, h.outX, h.outY].every(Number.isFinite)));
});

test("평가원 다중 계열의 긴 점선과 짧은 점선을 독립 대시 값으로 보존한다", () => {
  const result = compileGraph({
    type: "graph", box: [-50, -35, 90, 65], xRange: [-3, 3], yRange: [0, 3],
    series: [
      { kind: "curve", dashLength: 2.4, dashGap: 1.5, points: [[-2, 0], [0, 1], [2, 2]] },
      { kind: "curve", dashLength: 0.7, dashGap: 0.8, points: [[-1, 0], [0, 0.6], [2, 1.2]] },
    ],
  });
  const series = result.objects.filter((o) => o.type === "funcgraph");
  assert.deepEqual(series.map((o) => [o.dashLength, o.dashGap]), [[2.4, 1.5], [0.7, 0.8]]);
});

test("평가원 원본 보정용 굵은 선과 한글 배율을 5E 편집 범위 그대로 보존한다", () => {
  const result = compileGraph({
    type: "graph", box: [-50, -35, 90, 65], xRange: [0, 5], yRange: [0, 5],
    strokeWidth: 1.2, axisStrokeWidth: 0.6, seriesStrokeWidth: 1.4,
    labelHangulScale: 1.15, axisLabelSize: 10, axisLabelSizeX: 7, axisLabelSizeY: 11, tickLabelSize: 8,
    xLabel: "시간", yLabel: "압력",
    series: [{ kind: "curve", points: [[0, 0], [2, 4], [5, 2]] }],
  });
  const plane = result.objects.find((o) => o.type === "coordplane");
  const curve = result.objects.find((o) => o.type === "funcgraph");
  assert.equal(plane.strokeWidth, 0.6);
  assert.equal(curve.strokeWidth, 1.4);
  assert.equal(plane.labelHangulScale, 1.15);
  assert.equal(curve.labelHangulScale, 1.15);
  assert.equal(plane.axisLabelSizeX, 7);
  assert.equal(plane.axisLabelSizeY, 11);
});

test("이름표 라벨은 정자이고 물리량으로 선언한 기호만 이탤릭이다", () => {
  const result = compileGraph({
    type: "graph", box: [-50, -35, 90, 65], xRange: [0, 5], yRange: [0, 5],
    xLabel: "x(m)", yLabel: "v_y(m/s)",
    labels: [
      { x: 1, y: 1, label: "A" },
      { x: 2, y: 2, label: "t", labelRole: "quantity" },
    ],
    series: [
      { kind: "line", label: "B", points: [[0, 0], [2, 2]] },
      { kind: "line", label: "v", labelRole: "quantity", points: [[0, 1], [2, 3]] },
    ],
  });
  const plane = result.objects.find((o) => o.type === "coordplane");
  const series = result.objects.filter((o) => o.type === "funcgraph");
  assert.deepEqual(plane.annLabelPoints.map((o) => [o.text, o.upright]), [["A", true], ["t", false]]);
  assert.deepEqual(series.map((o) => [o.endLabel, o.endLabelUpright]), [["B", true], ["v", false]]);
});
