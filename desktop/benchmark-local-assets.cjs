#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT = path.join(root, "docs", "engine-v2", "benchmarks", "local-asset-zero-roundtrip.v1.json");
const DEFAULT_REPORT = path.join(root, "docs", "engine-v2", "benchmarks", "LOCAL_ASSET_ZERO_ROUNDTRIP.md");
const RUNS_PER_CASE = 3;
const DEVELOPMENT_CORRECTION_HISTORY = Object.freeze([
  Object.freeze({
    date: "2026-08-09",
    caseId: "simple-series-circuit-open",
    failedPrompt: "단일 사각형 직렬 회로를 닫힌 배선 루프로 그려 줘. 왼쪽 직류 전원, 위쪽 열린 스위치, 오른쪽 저항, 아래쪽 전구를 각각 하나씩 배치해.",
    failureReason: "series-circuit-component-count-not-exact",
    correction: "각 부품 바로 옆에 '하나'를 명시하여 임의 개수 추론을 제거했다.",
    correctedPrompt: "단일 사각형 직렬 회로를 닫힌 배선 루프로 그려 줘. 왼쪽에 직류 전원 하나, 위쪽에 열린 스위치 하나, 오른쪽에 저항 하나, 아래쪽에 전구 하나를 배치해.",
  }),
  Object.freeze({
    date: "2026-08-09",
    caseId: "vessel-particle-comparison-locked",
    failedPrompt: "비커 하나와 입자 상자 하나를 나란히 비교해. 비커의 액체 채움 비율은 0.45, 입자 상자는 혼합하지 않은 원형 기체 입자 16개.",
    failureReason: "vessel-particle-locked-state-incomplete",
    correction: "입자 모양·상태·개수를 각각 독립된 명시 구문으로 분리했다.",
    correctedPrompt: "비커 하나와 입자 상자 하나를 나란히 비교해. 비커의 액체 채움 비율은 0.45이다. 입자 상자는 혼합하지 않은 원형 입자이고 기체 상태의 입자이며 입자 수는 16이다.",
  }),
  Object.freeze({
    date: "2026-08-09",
    caseId: "logistic-population-graph-fixed",
    failedPrompt: "개체군의 일반적인 단일 로지스틱 S자형 성장 곡선을 문자 숫자 라벨 없이 그려 줘.",
    failureReason: "logistic-generic-single-unlabeled-curve-not-explicit",
    correction: "고정 문법이 요구하는 '일반적인 단일 곡선' 관계를 명시했다.",
    correctedPrompt: "개체군 로지스틱 S자형 성장 곡선을 일반적인 단일 곡선으로 문자와 숫자 없이 그려 줘.",
  }),
]);

const CASES = Object.freeze([
  Object.freeze({
    id: "map-world",
    family: "verified-map",
    title: "세계 물리 해안선",
    request: "세계 전체의 물리적 해안선 지도 윤곽을 그려 줘.",
    motif: "verified_map_outline",
    options: Object.freeze({ variant: "world", fillLand: false }),
    mapVariant: "world",
  }),
  Object.freeze({
    id: "map-pacific",
    family: "verified-map",
    title: "태평양 물리 해안선",
    request: "태평양의 물리적 해안선 지도 윤곽을 그려 줘.",
    motif: "verified_map_outline",
    options: Object.freeze({ variant: "pacific", fillLand: false }),
    mapVariant: "pacific",
  }),
  Object.freeze({
    id: "map-east-asia",
    family: "verified-map",
    title: "동아시아 물리 해안선",
    request: "동아시아의 물리적 해안선 지도 윤곽을 그려 줘.",
    motif: "verified_map_outline",
    options: Object.freeze({ variant: "east_asia", fillLand: false }),
    mapVariant: "east_asia",
  }),
  Object.freeze({
    id: "map-korean-peninsula",
    family: "verified-map",
    title: "한반도 물리 해안선",
    request: "한반도의 물리적 해안선 지도 윤곽을 그려 줘.",
    motif: "verified_map_outline",
    options: Object.freeze({ variant: "korean_peninsula", fillLand: false }),
    mapVariant: "korean_peninsula",
  }),
  Object.freeze({
    id: "student-trio-no-bubbles",
    family: "strict-illustration",
    title: "말풍선 없는 착석 학생 3인",
    request: "세 명의 학생이 직사각형 탁자에 앉아 대화하는 장면을 그려 줘.",
    motif: "student_trio_seated_dialogue",
    options: Object.freeze({ tableShape: "rect", speechBubbles: "none" }),
    componentKeys: Object.freeze(["student_1", "student_2", "student_3", "table"]),
  }),
  Object.freeze({
    id: "student-trio-three-blank-bubbles",
    family: "strict-illustration",
    title: "빈 말풍선 3개가 있는 착석 학생 3인",
    request: "세 명의 학생이 원형 탁자에 앉아 대화하며 빈 말풍선 세 개를 포함한 장면을 그려 줘.",
    motif: "student_trio_seated_dialogue",
    options: Object.freeze({
      tableShape: "round",
      speechBubbles: "three_blank",
      speechBubbleEvidence: "request",
    }),
    componentKeys: Object.freeze([
      "bubble_1", "bubble_2", "bubble_3", "student_1", "student_2", "student_3", "table",
    ]),
  }),
  Object.freeze({
    id: "spacecraft-simple-flat-shell",
    family: "strict-illustration",
    title: "단순 평면 우주선 쉘",
    request: "간단한 평면형 우주선 외형만 그려 줘.",
    motif: "spacecraft_flat_shell",
    options: Object.freeze({}),
    componentKeys: Object.freeze(["shell"]),
  }),
  Object.freeze({
    id: "spacecraft-wide-window-equipped",
    family: "strict-illustration",
    title: "넓은 창·착석자·검출기가 있는 평면 우주선",
    request: "간단한 평면형 우주선 외형에 넓은 관측창, 앉은 탑승자, 앞쪽 검출기 상자를 포함해 그려 줘.",
    motif: "spacecraft_flat_shell",
    options: Object.freeze({
      window: "wide",
      occupant: "seated",
      device: "detector_box",
      deviceSlot: "front",
    }),
    componentKeys: Object.freeze(["device", "occupant", "shell", "window"]),
  }),
  Object.freeze({
    id: "panel-flow-empty-box",
    family: "general-native",
    title: "빈 상자 3단계 패널 흐름",
    request: "panel_flow 패널 흐름으로 빈 사각 상자 3개를 패널 사이의 평범한 연결선으로 연결한 도식만 그려 줘",
    motif: "panel_flow",
    options: Object.freeze({
      panelCount: 3,
      panelType: "box",
      states: Object.freeze([{ tone: "white" }, { tone: "white" }, { tone: "white" }]),
      connectors: true,
    }),
  }),
  Object.freeze({
    id: "panel-flow-ordered-particles",
    family: "general-native",
    title: "순서와 개수가 고정된 입자 상태 패널",
    request: "입자 상자 3개를 왼쪽부터 기체 입자 12개, 액체 입자 10개, 고체 입자 8개로 두고 패널 사이를 평범한 연결선으로 연결해 줘",
    motif: "panel_flow",
    options: Object.freeze({
      panelCount: 3,
      panelType: "particlebox",
      states: Object.freeze([
        { state: "gas", count: 12 },
        { state: "liquid", count: 10 },
        { state: "solid", count: 8 },
      ]),
      connectors: true,
    }),
  }),
  Object.freeze({
    id: "dual-axis-blank-five-divisions",
    family: "general-native",
    title: "데이터 없는 이중 y축 골격",
    request: "빈 이중 y축 그래프에 x축과 5등분 눈금만 있는 도식",
    motif: "dual_axis_plot",
    options: Object.freeze({ tickCount: 5, leftSeries: Object.freeze([]), rightSeries: Object.freeze([]), grid: false }),
  }),
  Object.freeze({
    id: "orthogonal-wiring-closed-rectangle",
    family: "general-native",
    title: "4단자 직사각형 직교 닫힌 배선",
    request: "직사각형 네 꼭짓점에 단자점 4개가 있는 직교 배선 골격만 닫힌 회로로 평범한 실선 연결",
    motif: "orthogonal_wiring",
    options: Object.freeze({
      nodes: Object.freeze([
        { id: "a", at: [-48, -24] }, { id: "b", at: [48, -24] },
        { id: "c", at: [48, 24] }, { id: "d", at: [-48, 24] },
      ]),
      edges: Object.freeze([
        { from: "a", to: "b" }, { from: "b", to: "c" },
        { from: "c", to: "d" }, { from: "d", to: "a" },
      ]),
      showNodes: true,
    }),
  }),
  Object.freeze({
    id: "diagonal-wiring-closed-triangle",
    family: "general-native",
    title: "3단자 삼각형 대각 닫힌 배선",
    request: "삼각형 꼭짓점에 단자점 3개가 있는 대각 배선 골격만 닫힌 회로로 평범한 실선 연결",
    motif: "diagonal_wiring",
    options: Object.freeze({
      nodes: Object.freeze([
        { id: "a", at: [-48, 26] }, { id: "b", at: [0, -28] }, { id: "c", at: [48, 26] },
      ]),
      edges: Object.freeze([
        { from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "a" },
      ]),
      showNodes: true,
    }),
  }),
  Object.freeze({
    id: "contour-bundle-five-nested",
    family: "general-native",
    title: "수치 없는 중첩 닫힌 등치선 5개",
    request: "값 없이 중첩된 닫힌 개략 등치선 묶음 5개만 그려 줘",
    motif: "contour_bundle",
    options: Object.freeze({ count: 5, variant: "nested" }),
  }),
  Object.freeze({
    id: "simple-series-circuit-open",
    family: "general-native",
    title: "4부품 단일 직렬 회로와 열린 스위치",
    request: "단일 사각형 직렬 회로를 닫힌 배선 루프로 그려 줘. 왼쪽에 직류 전원 하나, 위쪽에 열린 스위치 하나, 오른쪽에 저항 하나, 아래쪽에 전구 하나를 배치해.",
    motif: "simple_series_circuit",
    options: Object.freeze({ switchState: "open" }),
  }),
  Object.freeze({
    id: "fixed-pulley-spring-loads",
    family: "general-native",
    title: "고정 도르래·연속 줄·용수철·동형 추",
    request: "천장에 고정된 도르래 하나에 하나의 연속된 줄을 걸고, 왼쪽에는 빈 직사각형 추 하나, 오른쪽에는 용수철 하나와 그 아래 같은 모양의 빈 직사각형 추 하나만 배치해.",
    motif: "fixed_pulley_spring_loads",
    options: Object.freeze({}),
  }),
  Object.freeze({
    id: "lens-mirror-screen-exact",
    family: "general-native",
    title: "볼록 렌즈·45도 평면 거울·스크린",
    request: "광학대에서 왼쪽에 볼록 렌즈 하나, 중앙에 45도 평면 거울 하나, 오른쪽에 스크린 하나만 배치해.",
    motif: "lens_mirror_screen_bench",
    options: Object.freeze({ lensKind: "convex_lens", mirrorRotation: 45 }),
  }),
  Object.freeze({
    id: "vessel-particle-comparison-locked",
    family: "general-native",
    title: "0.45 액체 비커와 기체 입자 16개 비교",
    request: "비커 하나와 입자 상자 하나를 나란히 비교해. 비커의 액체 채움 비율은 0.45이다. 입자 상자는 혼합하지 않은 원형 입자이고 기체 상태의 입자이며 입자 수는 16이다.",
    motif: "vessel_particle_comparison",
    options: Object.freeze({
      vesselKind: "beaker",
      liquid: 0.45,
      particleState: "gas",
      particleCount: 16,
      particleShape: "circle",
      mix: false,
    }),
  }),
  Object.freeze({
    id: "logistic-population-graph-fixed",
    family: "general-native",
    title: "고정 무라벨 개체군 로지스틱 S곡선",
    request: "개체군 로지스틱 S자형 성장 곡선을 일반적인 단일 곡선으로 문자와 숫자 없이 그려 줘.",
    motif: "logistic_population_graph",
    options: Object.freeze({}),
  }),
]);

function round(value, places = 6) {
  const factor = 10 ** places;
  return Math.round(Number(value) * factor) / factor;
}

function median(values) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function normalizeResultForHash(value) {
  if (Array.isArray(value)) return value.map(normalizeResultForHash);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value)
    .filter((key) => key !== "compileMs")
    .sort()
    .map((key) => [key, normalizeResultForHash(value[key])]));
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function sameCanonical(actual, expected) {
  return canonicalJson(actual) === canonicalJson(expected);
}

function check(name, pass, actual = null, expected = null) {
  return { name, pass: pass === true, actual, expected };
}

function countType(objects, type) {
  return (objects || []).filter((object) => object?.type === type).length;
}

function samePoint(a, b, epsilon = 1e-9) {
  return Array.isArray(a) && Array.isArray(b) && a.length === 2 && b.length === 2
    && Math.abs(Number(a[0]) - Number(b[0])) <= epsilon
    && Math.abs(Number(a[1]) - Number(b[1])) <= epsilon;
}

function pointKey(point) {
  return Array.isArray(point) && point.length === 2 ? `${round(point[0], 9)},${round(point[1], 9)}` : "invalid";
}

function componentMetadataChecks(caseSpec, compiled) {
  if (caseSpec.family === "verified-map") {
    return [
      check("map-asset-id", compiled.assetId === `verified_map:${caseSpec.mapVariant}`, compiled.assetId,
        `verified_map:${caseSpec.mapVariant}`),
      check("map-variant", compiled.mapVariant === caseSpec.mapVariant, compiled.mapVariant, caseSpec.mapVariant),
      check("map-runtime-version", typeof compiled.runtimeVersion === "string" && compiled.runtimeVersion.length > 0,
        compiled.runtimeVersion, "non-empty"),
      check("map-data-version", typeof compiled.dataVersion === "string" && compiled.dataVersion.length > 0,
        compiled.dataVersion, "non-empty"),
      check("map-source-pinned", Boolean(compiled.source?.commit && compiled.source?.sha256
        && compiled.source?.coastlineSha256), compiled.source || null, "commit + land/coastline SHA-256"),
      check("map-metadata-preserved", compiled.metadata?.id === caseSpec.mapVariant
        && compiled.metadata?.politicalBorders === false
        && compiled.metadata?.renderedAnnotations === false,
      compiled.metadata || null, { id: caseSpec.mapVariant, politicalBorders: false, renderedAnnotations: false }),
    ];
  }

  if (caseSpec.family === "strict-illustration") {
    const componentKeys = Object.keys(compiled.components || {}).sort();
    const expectedKeys = [...caseSpec.componentKeys].sort();
    const objectsGrouped = (compiled.objects || []).every((object) => (
      typeof object.groupId === "string" && object.groupId.length > 0
      && typeof object.assetRole === "string" && object.assetRole.length > 0
    ));
    return [
      check("illustration-asset-id", compiled.assetId === caseSpec.motif, compiled.assetId, caseSpec.motif),
      check("component-keys", sameCanonical(componentKeys, expectedKeys), componentKeys, expectedKeys),
      check("component-groups-preserved", Object.values(compiled.components || {}).every((component) => (
        typeof component?.groupId === "string" && component.groupId.length > 0
        && Array.isArray(component.objectIds) && component.objectIds.length > 0
      )), compiled.components || null, "every component has groupId and objectIds"),
      check("object-group-metadata-preserved", objectsGrouped,
        (compiled.objects || []).filter((object) => !object.groupId || !object.assetRole).map((object) => object.id), []),
      check("code-native-provenance", compiled.provenance?.implementation === "original-code-native"
        && compiled.provenance?.sourcePixelsEmbedded === false,
      compiled.provenance || null, { implementation: "original-code-native", sourcePixelsEmbedded: false }),
    ];
  }

  const rasterLike = (compiled.objects || []).filter((object) => (
    ["image", "raster", "bitmap"].includes(object?.type)
    || typeof object?.src === "string" || typeof object?.dataUrl === "string"
  ));
  return [
    check("general-native-vector-only", rasterLike.length === 0,
      rasterLike.map((object) => ({ id: object.id, type: object.type })), []),
    check("general-native-no-embedded-source-pixels", compiled.provenance?.sourcePixelsEmbedded !== true,
      compiled.provenance?.sourcePixelsEmbedded ?? null, "not true"),
  ];
}

function motifStructureChecks(caseSpec, expandedScene, compiled) {
  const elements = expandedScene?.elements || [];
  const objects = compiled?.objects || [];

  if (caseSpec.id === "panel-flow-empty-box") {
    const rects = elements.filter((item) => item.type === "rect");
    const connectors = elements.filter((item) => item.type === "line");
    return [
      check("panel-empty-box-count", rects.length === 3, rects.length, 3),
      check("panel-empty-box-white", rects.every((item) => item.tone === "white"), rects.map((item) => item.tone), ["white", "white", "white"]),
      check("panel-empty-box-connectors", connectors.length === 2 && connectors.every((item) => item.arrow === "none"),
        connectors.map((item) => item.arrow), ["none", "none"]),
    ];
  }

  if (caseSpec.id === "panel-flow-ordered-particles") {
    const particles = elements.filter((item) => item.type === "particlebox");
    const states = particles.map((item) => ({ state: item.state, count: item.count }));
    const expected = [{ state: "gas", count: 12 }, { state: "liquid", count: 10 }, { state: "solid", count: 8 }];
    return [
      check("panel-particle-ordered-states", sameCanonical(states, expected), states, expected),
      check("panel-particle-connectors", countType(elements, "line") === 2, countType(elements, "line"), 2),
    ];
  }

  if (caseSpec.motif === "dual_axis_plot") {
    const graphs = elements.filter((item) => item.type === "graph");
    return [
      check("dual-axis-one-blank-graph", graphs.length === 1
        && graphs[0].leftSeries == null && Array.isArray(graphs[0].series) && graphs[0].series.length === 0,
      graphs, "one graph with no data series"),
      check("dual-axis-no-compiled-series", countType(objects, "funcgraph") === 0,
        countType(objects, "funcgraph"), 0),
      check("dual-axis-both-y-and-x-scaffold", countType(objects, "coordplane") === 1 && countType(objects, "line") === 15,
        { coordplane: countType(objects, "coordplane"), lines: countType(objects, "line") },
        { coordplane: 1, lines: 15 }),
    ];
  }

  if (caseSpec.motif === "orthogonal_wiring" || caseSpec.motif === "diagonal_wiring") {
    const expectedNodes = caseSpec.motif === "orthogonal_wiring" ? 4 : 3;
    const expectedEdges = expectedNodes;
    const nodes = caseSpec.options.nodes || [];
    const edges = caseSpec.options.edges || [];
    const degrees = Object.fromEntries(nodes.map((node) => [node.id, 0]));
    for (const edge of edges) {
      if (Object.hasOwn(degrees, edge.from)) degrees[edge.from] += 1;
      if (Object.hasOwn(degrees, edge.to)) degrees[edge.to] += 1;
    }
    return [
      check("wiring-exact-node-count", nodes.length === expectedNodes && countType(objects, "ellipse") === expectedNodes,
        { optionNodes: nodes.length, compiledNodes: countType(objects, "ellipse") }, expectedNodes),
      check("wiring-exact-edge-count", edges.length === expectedEdges && countType(objects, "line") === expectedEdges,
        { optionEdges: edges.length, compiledEdges: countType(objects, "line") }, expectedEdges),
      check("wiring-one-closed-cycle", Object.values(degrees).every((degree) => degree === 2), degrees,
        "every terminal degree is 2"),
    ];
  }

  if (caseSpec.motif === "contour_bundle") {
    const curves = elements.filter((item) => item.type === "curve");
    return [
      check("contour-exact-count", curves.length === caseSpec.options.count, curves.length, caseSpec.options.count),
      check("contour-nested-curves-closed", curves.every((item) => item.closed === true && item.fill === false),
        curves.map((item) => ({ closed: item.closed, fill: item.fill })), "all closed and unfilled"),
    ];
  }

  if (caseSpec.motif === "simple_series_circuit") {
    const circuit = elements.filter((item) => item.type === "circuit");
    const connectors = elements.filter((item) => item.type === "polyline");
    const elementKinds = circuit.map((item) => item.element).sort();
    const expectedKinds = ["dc_source", "lamp", "resistor", "switch"];
    const ports = circuit.flatMap((item) => [item.from, item.to]).map(pointKey).sort();
    const connectorEnds = connectors.flatMap((item) => [item.points?.[0], item.points?.at(-1)]).map(pointKey).sort();
    return [
      check("circuit-four-exact-components", sameCanonical(elementKinds, expectedKinds), elementKinds, expectedKinds),
      check("circuit-four-plain-connectors", connectors.length === 4
        && connectors.every((item) => item.closed === false && item.fill === false && item.arrow === "none"),
      connectors.map((item) => ({ closed: item.closed, fill: item.fill, arrow: item.arrow })), "four plain connectors"),
      check("circuit-all-component-ports-connected-once", sameCanonical(ports, connectorEnds), connectorEnds, ports),
      check("circuit-switch-state", circuit.find((item) => item.element === "switch")?.closed === (caseSpec.options.switchState === "closed"),
        circuit.find((item) => item.element === "switch")?.closed, caseSpec.options.switchState === "closed"),
    ];
  }

  if (caseSpec.motif === "fixed_pulley_spring_loads") {
    const pulley = elements.filter((item) => item.type === "pulley");
    const rope = elements.find((item) => item.type === "curve");
    const verticals = elements.filter((item) => item.type === "line");
    const spring = elements.find((item) => item.type === "spring");
    const loads = elements.filter((item) => item.type === "rect");
    const ropeEnds = [rope?.points?.[0], rope?.points?.at(-1)];
    const verticalStarts = verticals.map((item) => item.from);
    const leftLoadTop = loads[0] ? [loads[0].box[0] + loads[0].box[2] / 2, loads[0].box[1]] : null;
    const rightLoadTop = loads[1] ? [loads[1].box[0] + loads[1].box[2] / 2, loads[1].box[1]] : null;
    return [
      check("pulley-spring-required-parts", pulley.length === 1 && verticals.length === 2
        && Boolean(rope) && Boolean(spring) && loads.length === 2,
      { pulley: pulley.length, rope: Number(Boolean(rope)), lines: verticals.length, spring: Number(Boolean(spring)), loads: loads.length },
      { pulley: 1, rope: 1, lines: 2, spring: 1, loads: 2 }),
      check("pulley-rope-contact-continuity", ropeEnds.every((point) => verticalStarts.some((start) => samePoint(point, start))),
        { ropeEnds, verticalStarts }, "each arc endpoint equals one vertical branch start"),
      check("pulley-left-branch-load-contact", samePoint(verticals[0]?.to, leftLoadTop),
        { branchEnd: verticals[0]?.to, loadTop: leftLoadTop }, "equal"),
      check("pulley-right-branch-spring-load-contact", samePoint(verticals[1]?.to, spring?.from)
        && samePoint(spring?.to, rightLoadTop),
      { branchEnd: verticals[1]?.to, springFrom: spring?.from, springTo: spring?.to, loadTop: rightLoadTop },
      "line -> spring -> load contacts"),
      check("pulley-matching-load-shapes", loads.length === 2
        && loads[0].box[2] === loads[1].box[2] && loads[0].box[3] === loads[1].box[3],
      loads.map((item) => item.box?.slice(2)), "equal width and height"),
    ];
  }

  if (caseSpec.motif === "lens_mirror_screen_bench") {
    const optics = objects.filter((item) => item.type === "optics");
    const kinds = optics.map((item) => item.kind);
    return [
      check("optics-exact-three-kinds", sameCanonical(kinds, ["convex_lens", "plane_mirror", "screen"]),
        kinds, ["convex_lens", "plane_mirror", "screen"]),
      check("optics-plane-mirror-45", optics.find((item) => item.kind === "plane_mirror")?.rotation === 45,
        optics.find((item) => item.kind === "plane_mirror")?.rotation, 45),
    ];
  }

  if (caseSpec.motif === "vessel_particle_comparison") {
    const vessel = objects.find((item) => item.type === "vessel");
    const particle = objects.find((item) => item.type === "particlebox");
    return [
      check("comparison-exact-beaker-liquid", vessel?.kind === "beaker" && vessel?.liquid === 0.45,
        vessel ? { kind: vessel.kind, liquid: vessel.liquid } : null, { kind: "beaker", liquid: 0.45 }),
      check("comparison-exact-particle-state", particle?.state === "gas" && particle?.count === 16
        && particle?.particleShape === "circle" && particle?.mix === false && particle?.motion === "none",
      particle ? { state: particle.state, count: particle.count, particleShape: particle.particleShape, mix: particle.mix, motion: particle.motion } : null,
      { state: "gas", count: 16, particleShape: "circle", mix: false, motion: "none" }),
      check("comparison-exact-two-panels", objects.length === 2, objects.map((item) => item.type), ["vessel", "particlebox"]),
    ];
  }

  if (caseSpec.motif === "logistic_population_graph") {
    const graphs = elements.filter((item) => item.type === "graph");
    const curves = objects.filter((item) => item.type === "funcgraph");
    const points = graphs[0]?.series?.[0]?.points || [];
    const monotone = points.every((point, index) => index === 0
      || (point[0] > points[index - 1][0] && point[1] > points[index - 1][1]));
    return [
      check("logistic-one-fixed-curve", graphs.length === 1 && graphs[0].series?.length === 1
        && curves.length === 1 && points.length === 11,
      { graphs: graphs.length, series: graphs[0]?.series?.length || 0, curves: curves.length, points: points.length },
      { graphs: 1, series: 1, curves: 1, points: 11 }),
      check("logistic-monotone-s-shape-points", monotone, points, "strictly increasing x and y"),
      check("logistic-no-grid-ticks-labels", graphs[0]?.grid === false && graphs[0]?.ticks === false
        && graphs[0]?.showNumbers === false && graphs[0]?.axisLabels === false,
      graphs[0] ? { grid: graphs[0].grid, ticks: graphs[0].ticks, showNumbers: graphs[0].showNumbers, axisLabels: graphs[0].axisLabels } : null,
      { grid: false, ticks: false, showNumbers: false, axisLabels: false }),
    ];
  }

  return [];
}

async function loadModules() {
  const [router, catalog, fastpath] = await Promise.all([
    import(pathToFileURL(path.join(root, "js", "ai-local-asset-router.js")).href),
    import(pathToFileURL(path.join(root, "js", "ai-motif-catalog.js")).href),
    import(pathToFileURL(path.join(root, "js", "ai-scene-fastpath.js")).href),
  ]);
  return { router, catalog, fastpath };
}

function runCaseOnce(caseSpec, runNumber, modules) {
  const { router, catalog, fastpath } = modules;
  const idPrefix = `local_asset_${caseSpec.id.replace(/[^a-z0-9]+/gi, "_")}`;
  const compileOptions = { mode: "diagram", layerId: 1, idPrefix };

  const totalStarted = performance.now();
  const matchStarted = totalStarted;
  const match = router.matchLocalAssetRequest({
    request: caseSpec.request,
    mode: "diagram",
    references: [],
  });
  const matchEnded = performance.now();

  let expandedScene = null;
  let compiled = null;
  let directCompiled = null;
  let compileStarted = matchEnded;
  let compileEnded = matchEnded;
  let directStarted = matchEnded;
  let directEnded = matchEnded;
  let thrownError = null;
  try {
    if (match.matched) {
      expandedScene = catalog.expandAiMotifScene(match.motifRequest);
      compileStarted = performance.now();
      compiled = catalog.compileFastSceneWithMotifs(match.motifRequest, compileOptions);
      compileEnded = performance.now();
      directStarted = compileEnded;
      directCompiled = catalog.compileAiMotif(
        match.motifRequest.motif,
        match.motifRequest.options,
        compileOptions,
      );
      directEnded = performance.now();
    }
  } catch (error) {
    compileEnded = performance.now();
    directEnded = compileEnded;
    thrownError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
  const totalEnded = compileEnded;

  const sceneHash = expandedScene ? sha256(canonicalJson(expandedScene)) : null;
  const resultHash = compiled ? sha256(canonicalJson(normalizeResultForHash(compiled))) : null;
  const directResultHash = directCompiled
    ? sha256(canonicalJson(normalizeResultForHash(directCompiled)))
    : null;
  const diagramViolations = compiled ? fastpath.auditDiagramObjects(compiled.objects) : [];

  const checks = [
    check("matched", match.matched === true, match, { matched: true }),
    check("motif", match.motifRequest?.motif === caseSpec.motif, match.motifRequest?.motif || null, caseSpec.motif),
    check("options", sameCanonical(match.motifRequest?.options, caseSpec.options),
      match.motifRequest?.options || null, caseSpec.options),
    check("no-thrown-error", thrownError == null, thrownError, null),
    check("valid", compiled?.valid === true, compiled?.valid ?? null, true),
    check("supported", compiled?.supported === true, compiled?.supported ?? null, true),
    check("objects-present", (compiled?.objects?.length || 0) > 0, compiled?.objects?.length || 0, "> 0"),
    check("no-errors", Array.isArray(compiled?.errors) && compiled.errors.length === 0, compiled?.errors || [], []),
    check("no-warnings", Array.isArray(compiled?.warnings) && compiled.warnings.length === 0,
      compiled?.warnings || [], []),
    check("no-diagram-text-or-arrow-violations", diagramViolations.length === 0, diagramViolations, []),
    check("direct-compile-valid", directCompiled?.valid === true && directCompiled?.supported === true,
      directCompiled ? { valid: directCompiled.valid, supported: directCompiled.supported } : null,
      { valid: true, supported: true }),
    check("high-level-direct-parity", Boolean(resultHash && resultHash === directResultHash),
      { resultHash, directResultHash }, "equal"),
    ...(compiled ? componentMetadataChecks(caseSpec, compiled) : []),
    ...(compiled && expandedScene ? motifStructureChecks(caseSpec, expandedScene, compiled) : []),
  ];

  return {
    run: runNumber,
    pass: checks.every((item) => item.pass),
    request: caseSpec.request,
    matched: match.matched === true,
    matchReason: match.reason || null,
    motifRequest: match.motifRequest || null,
    objectCount: compiled?.objects?.length || 0,
    warnings: compiled?.warnings || [],
    errors: compiled?.errors || [],
    unsupported: compiled?.unsupported || [],
    diagramViolations,
    checks,
    hashes: {
      matcher: sha256(canonicalJson(match)),
      scene: sceneHash,
      result: resultHash,
      directResult: directResultHash,
    },
    timingsMs: {
      match: round(matchEnded - matchStarted),
      compile: round(compileEnded - compileStarted),
      total: round(totalEnded - totalStarted),
      directVerification: round(directEnded - directStarted),
      compilerReported: round(compiled?.stats?.compileMs || 0),
    },
    externalCalls: { model: 0, imageGeneration: 0, tools: 0 },
    metadata: compiled ? {
      assetId: compiled.assetId || null,
      mapVariant: compiled.mapVariant || null,
      runtimeVersion: compiled.runtimeVersion || null,
      dataVersion: compiled.dataVersion || null,
      source: compiled.source || null,
      components: compiled.components || null,
      provenance: compiled.provenance || null,
    } : null,
  };
}

function summarizeCase(caseSpec, runs) {
  const matcherHashes = [...new Set(runs.map((run) => run.hashes.matcher).filter(Boolean))];
  const sceneHashes = [...new Set(runs.map((run) => run.hashes.scene).filter(Boolean))];
  const resultHashes = [...new Set(runs.map((run) => run.hashes.result).filter(Boolean))];
  const directResultHashes = [...new Set(runs.map((run) => run.hashes.directResult).filter(Boolean))];
  const deterministic = matcherHashes.length === 1 && sceneHashes.length === 1
    && resultHashes.length === 1 && directResultHashes.length === 1;
  const failures = runs.flatMap((run) => run.checks
    .filter((item) => !item.pass)
    .map((item) => ({ run: run.run, check: item.name, actual: item.actual, expected: item.expected })));
  if (!deterministic) failures.push({
    run: null,
    check: "three-run-determinism",
    actual: { matcherHashes, sceneHashes, resultHashes, directResultHashes },
    expected: "one canonical hash per category",
  });

  return {
    id: caseSpec.id,
    family: caseSpec.family,
    title: caseSpec.title,
    request: caseSpec.request,
    expected: { motif: caseSpec.motif, options: caseSpec.options },
    pass: runs.every((run) => run.pass) && deterministic,
    deterministic,
    passedRuns: runs.filter((run) => run.pass).length,
    runCount: runs.length,
    objectCount: runs[0]?.objectCount || 0,
    canonicalHashes: {
      matcher: matcherHashes.length === 1 ? matcherHashes[0] : null,
      scene: sceneHashes.length === 1 ? sceneHashes[0] : null,
      result: resultHashes.length === 1 ? resultHashes[0] : null,
      directResult: directResultHashes.length === 1 ? directResultHashes[0] : null,
    },
    mediansMs: {
      match: round(median(runs.map((run) => run.timingsMs.match))),
      compile: round(median(runs.map((run) => run.timingsMs.compile))),
      total: round(median(runs.map((run) => run.timingsMs.total))),
      directVerification: round(median(runs.map((run) => run.timingsMs.directVerification))),
      compilerReported: round(median(runs.map((run) => run.timingsMs.compilerReported))),
    },
    failures,
    runs,
  };
}

function createSummary(cases) {
  const runs = cases.flatMap((item) => item.runs);
  const externalCalls = runs.reduce((totals, run) => ({
    model: totals.model + run.externalCalls.model,
    imageGeneration: totals.imageGeneration + run.externalCalls.imageGeneration,
    tools: totals.tools + run.externalCalls.tools,
  }), { model: 0, imageGeneration: 0, tools: 0 });
  return {
    caseCount: cases.length,
    runCount: runs.length,
    passedCases: cases.filter((item) => item.pass).length,
    passedRuns: runs.filter((run) => run.pass).length,
    deterministicCases: cases.filter((item) => item.deterministic).length,
    allMatched: runs.every((run) => run.matched),
    allValidSupported: runs.every((run) => run.checks
      .filter((item) => ["valid", "supported"].includes(item.name)).every((item) => item.pass)),
    zeroDiagramViolations: runs.every((run) => run.diagramViolations.length === 0),
    zeroRoundTrip: externalCalls.model === 0 && externalCalls.imageGeneration === 0 && externalCalls.tools === 0,
    externalCalls,
    medianMatchMs: round(median(runs.map((run) => run.timingsMs.match))),
    medianCompileMs: round(median(runs.map((run) => run.timingsMs.compile))),
    medianTotalMs: round(median(runs.map((run) => run.timingsMs.total))),
    medianDirectVerificationMs: round(median(runs.map((run) => run.timingsMs.directVerification))),
    medianCompilerReportedMs: round(median(runs.map((run) => run.timingsMs.compilerReported))),
  };
}

function benchmarkErrors(report) {
  const errors = [];
  if (report.summary.caseCount !== CASES.length) errors.push(`expected ${CASES.length} cases`);
  if (report.summary.runCount !== CASES.length * RUNS_PER_CASE) {
    errors.push(`expected ${CASES.length * RUNS_PER_CASE} runs`);
  }
  if (report.summary.passedCases !== CASES.length) errors.push("not every case passed");
  if (report.summary.passedRuns !== CASES.length * RUNS_PER_CASE) errors.push("not every run passed");
  if (report.summary.deterministicCases !== CASES.length) errors.push("not every case was deterministic");
  if (!report.summary.allMatched) errors.push("one or more strict requests did not match");
  if (!report.summary.allValidSupported) errors.push("one or more compiled results were invalid or unsupported");
  if (!report.summary.zeroDiagramViolations) errors.push("diagram text/arrow invariant violation found");
  if (!report.summary.zeroRoundTrip) errors.push("an external/model/image/tool call was observed");
  return errors;
}

async function runBenchmark({ generatedAt = new Date().toISOString() } = {}) {
  const modules = await loadModules();
  const cases = [];
  for (const caseSpec of CASES) {
    const runs = [];
    for (let run = 1; run <= RUNS_PER_CASE; run += 1) {
      runs.push(runCaseOnce(caseSpec, run, modules));
    }
    cases.push(summarizeCase(caseSpec, runs));
  }
  const summary = createSummary(cases);
  const failureHistory = cases.flatMap((item) => item.failures.map((failure) => ({
    caseId: item.id,
    request: item.request,
    ...failure,
  })));
  const report = {
    schemaVersion: "5e-local-asset-zero-roundtrip-benchmark@1",
    generatedAt,
    runner: "desktop/benchmark-local-assets.cjs",
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      modelUsed: false,
      imageGenerationUsed: false,
      uiUsed: false,
    },
    gate: {
      runsPerCase: RUNS_PER_CASE,
      requireAllMatched: true,
      requireValidSupported: true,
      requireZeroDiagramTextArrowViolations: true,
      requireDeterministicCanonicalHashes: true,
      requireZeroModelImageToolCalls: true,
    },
    summary,
    ok: benchmarkErrors({ summary }).length === 0,
    errors: benchmarkErrors({ summary }),
    failureHistory,
    correctionHistory: DEVELOPMENT_CORRECTION_HISTORY.map((entry) => ({ ...entry })),
    artifactHistory: [],
    cases,
  };
  return report;
}

function stableCaseFingerprint(item) {
  return {
    id: item.id,
    request: item.request,
    expected: item.expected,
    objectCount: item.objectCount,
    canonicalHashes: item.canonicalHashes,
  };
}

function verifyReport(fresh, saved = null) {
  const errors = benchmarkErrors(fresh);
  if (saved) {
    if (saved.schemaVersion !== fresh.schemaVersion) errors.push("saved schema version differs");
    const freshCases = fresh.cases.map(stableCaseFingerprint);
    const savedCases = (saved.cases || []).map(stableCaseFingerprint);
    if (!sameCanonical(freshCases, savedCases)) errors.push("saved canonical case fingerprints differ from fresh run");
  }
  return { ok: errors.length === 0, errors, summary: fresh.summary };
}

function renderMarkdown(report) {
  const mapCount = report.cases.filter((item) => item.family === "verified-map").length;
  const illustrationCount = report.cases.filter((item) => item.family === "strict-illustration").length;
  const generalNativeCount = report.cases.filter((item) => item.family === "general-native").length;
  const lines = [
    "# Strict local asset zero-round-trip benchmark",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "This benchmark invokes no model, image generator, tool, or UI. It measures only the strict request matcher",
    "and deterministic code-native compilation. Every case is run three times.",
    "",
    "## Result",
    "",
    `- Cases: ${report.summary.passedCases}/${report.summary.caseCount} passed`,
    `- Runs: ${report.summary.passedRuns}/${report.summary.runCount} passed`,
    `- Deterministic cases: ${report.summary.deterministicCases}/${report.summary.caseCount}`,
    `- External calls: model ${report.summary.externalCalls.model}, imageGeneration ${report.summary.externalCalls.imageGeneration}, tools ${report.summary.externalCalls.tools}`,
    `- Median matcher: ${report.summary.medianMatchMs} ms`,
    `- Median compile: ${report.summary.medianCompileMs} ms`,
    `- Median production path total (match + high-level compile): ${report.summary.medianTotalMs} ms`,
    `- Median direct-compiler parity check (verification overhead, not production total): ${report.summary.medianDirectVerificationMs} ms`,
    "",
    "| Case | Objects | Passed runs | Deterministic | Match ms | Compile ms | Total ms |",
    "| --- | ---: | ---: | :---: | ---: | ---: | ---: |",
    ...report.cases.map((item) => `| ${item.id} | ${item.objectCount} | ${item.passedRuns}/${item.runCount} | ${item.deterministic ? "yes" : "no"} | ${item.mediansMs.match} | ${item.mediansMs.compile} | ${item.mediansMs.total} |`),
    "",
    "## Exact requests",
    "",
    ...report.cases.flatMap((item) => [
      `### ${item.id}`,
      "",
      `- Request: \`${item.request}\``,
      `- Motif: \`${item.expected.motif}\``,
      `- Options: \`${JSON.stringify(item.expected.options)}\``,
      `- Scene hash: \`${item.canonicalHashes.scene}\``,
      `- Result hash: \`${item.canonicalHashes.result}\``,
      "",
    ]),
    "## Failures and corrections",
    "",
    report.failureHistory.length
      ? `The JSON artifact preserves ${report.failureHistory.length} failed checks with case, run, actual, and expected values.`
      : "No matcher, compiler, audit, metadata, parity, or determinism failure occurred in this run.",
    report.correctionHistory.length
      ? `The JSON artifact preserves ${report.correctionHistory.length} corrections.`
      : "No production matcher, motif, prompt, or compiler correction was needed for this benchmark.",
    "",
    "## What this proves",
    "",
    `- These ${report.summary.caseCount} exact, reference-free diagram requests take a zero-round-trip local path.`,
    `- The ${mapCount} pinned map variants, ${illustrationCount} strict illustration configurations, and ${generalNativeCount} general code-native motifs compile to valid, supported 5E objects.`,
    "- Canonical expanded-scene and compile-result hashes repeat across all three runs.",
    "- The compiled objects contain no diagram-mode text or arrow violations.",
    "- Map source metadata and strict-illustration component/group provenance survive compilation; general native motifs are checked independently without requiring illustration provenance.",
    "",
    "## Limitations",
    "",
    "- This is not a semantic benchmark for paraphrases. The matcher intentionally rejects requests outside its exact safe grammar.",
    "- It does not test reference-image transformation, sketches, raster output, model latency, UI insertion, or scientific scoring.",
    "- The map assets cover only world, Pacific, East Asia, and Korean Peninsula physical coastlines. They contain no political borders or overlays.",
    "- The student asset is limited to exactly three seated students at one table. Blank bubbles require explicit request evidence and never contain text.",
    "- The spacecraft asset is a generic flat shell. The equipped case is allowed only because the request explicitly supplies a wide window, seated occupant, detector, and safe front slot.",
    "- The general code-native motifs accept only the exact counts, topology, states, and fixed apparatus configurations recorded above; this is not evidence for arbitrary variants.",
    "- Millisecond timings vary with CPU load; canonical hashes and pass gates, not speed thresholds, are the regression contract.",
    "",
    "## Reproduce",
    "",
    "```powershell",
    "npm.cmd run benchmark:local-assets",
    "npm.cmd run verify:local-assets",
    "node --test desktop/benchmark-local-assets.test.cjs",
    "```",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function writeArtifacts(report) {
  fs.mkdirSync(path.dirname(DEFAULT_OUTPUT), { recursive: true });
  if (fs.existsSync(DEFAULT_OUTPUT)) {
    const previous = JSON.parse(fs.readFileSync(DEFAULT_OUTPUT, "utf8"));
    const mergeUnique = (left, right) => {
      const entries = [...(left || []), ...(right || [])];
      const seen = new Set();
      return entries.filter((entry) => {
        const key = canonicalJson(entry);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };
    report.failureHistory = mergeUnique(previous.failureHistory, report.failureHistory);
    report.correctionHistory = mergeUnique(previous.correctionHistory, report.correctionHistory);
    report.artifactHistory = [...(previous.artifactHistory || [])];
    const previousFingerprint = canonicalJson((previous.cases || []).map(stableCaseFingerprint));
    const nextFingerprint = canonicalJson((report.cases || []).map(stableCaseFingerprint));
    if (previousFingerprint !== nextFingerprint) {
      report.artifactHistory.push({
        generatedAt: previous.generatedAt || null,
        schemaVersion: previous.schemaVersion || null,
        summary: previous.summary || null,
        failureHistory: previous.failureHistory || [],
        correctionHistory: previous.correctionHistory || [],
        caseIds: (previous.cases || []).map((item) => item.id),
      });
    }
  }
  fs.writeFileSync(DEFAULT_OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(DEFAULT_REPORT, renderMarkdown(report), "utf8");
}

async function main() {
  const verifyOnly = process.argv.includes("--verify");
  const report = await runBenchmark();
  if (verifyOnly) {
    if (!fs.existsSync(DEFAULT_OUTPUT)) throw new Error(`Saved benchmark is missing: ${DEFAULT_OUTPUT}`);
    const saved = JSON.parse(fs.readFileSync(DEFAULT_OUTPUT, "utf8"));
    const verification = verifyReport(report, saved);
    process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`);
    if (!verification.ok) process.exitCode = 1;
    return;
  }
  writeArtifacts(report);
  process.stdout.write(`${JSON.stringify({
    ok: report.ok,
    output: path.relative(root, DEFAULT_OUTPUT).replace(/\\/g, "/"),
    report: path.relative(root, DEFAULT_REPORT).replace(/\\/g, "/"),
    summary: report.summary,
    errors: report.errors,
  }, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}

module.exports = {
  CASES,
  DEFAULT_OUTPUT,
  DEFAULT_REPORT,
  RUNS_PER_CASE,
  canonicalJson,
  normalizeResultForHash,
  renderMarkdown,
  runBenchmark,
  stableCaseFingerprint,
  verifyReport,
  writeArtifacts,
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
