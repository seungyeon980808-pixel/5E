import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_ASSET_ROUTER_VERSION,
  matchLocalAssetRequest,
} from "../js/ai-local-asset-router.js";
import { compileAiMotif } from "../js/ai-motif-catalog.js";

function assertMiss(request, expectedReason, extra = {}) {
  const result = matchLocalAssetRequest({ request, ...extra });
  assert.equal(result.matched, false, request);
  assert.equal(result.motifRequest, undefined, request);
  if (expectedReason) assert.equal(result.reason, expectedReason, request);
  return result;
}

function assertHit(request, motif, expectedOptions, extra = {}) {
  const result = matchLocalAssetRequest({ request, ...extra });
  assert.equal(result.matched, true, `${request}: ${result.reason}`);
  assert.deepEqual(result.motifRequest, {
    type: "motif",
    motif,
    options: expectedOptions,
  });
  assert.match(result.reason, /^local-/);
  return result;
}

test("router has a versioned, deterministic and fail-closed public shape", () => {
  assert.equal(LOCAL_ASSET_ROUTER_VERSION, "5e-local-asset-router@3");
  assert.deepEqual(matchLocalAssetRequest(), {
    matched: false,
    reason: "empty-or-invalid-request",
  });
  assertMiss(42, "empty-or-invalid-request");
  assertMiss("한반도 물리 해안선 지도만", "diagram-mode-only", { mode: "complete" });
  assertMiss("한반도 물리 해안선 지도만", "diagram-mode-only", { mode: "그림형" });
  assertMiss("한반도 물리 해안선 지도만", "references-present", { references: [{}] });
  assertMiss("한반도 물리 해안선 지도만", "references-present", { references: { id: "ref" } });
  assertMiss("빈 이중 y축 그래프에 x축과 5등분 눈금만 있는 도식", "diagram-mode-only", { mode: "complete" });
  assertMiss("값 없이 중첩된 닫힌 개략 등치선 묶음 5개만", "references-present", { references: [{ id: "ref" }] });
  assertMiss("빈 이중 y축 그래프에 x축과 5등분 눈금만 있는 도식을 수정해 줘", "revision-request");

  const input = { request: "한반도 물리 해안선 지도만", references: [] };
  const first = matchLocalAssetRequest(input);
  const second = matchLocalAssetRequest(input);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first.motifRequest), JSON.stringify(second.motifRequest));
  assert.deepEqual(input, { request: "한반도 물리 해안선 지도만", references: [] });
});

test("new structural matches are deterministic and do not share mutable option arrays", () => {
  const request = "직사각형 네 꼭짓점에 단자점 4개가 있는 직교 배선 골격만 닫힌 회로로 평범한 실선 연결";
  const first = matchLocalAssetRequest({ request });
  const canonical = JSON.stringify(first);
  first.motifRequest.options.nodes[0].at[0] = 999;
  first.motifRequest.options.edges.push({ from: "a", to: "c" });
  const second = matchLocalAssetRequest({ request });
  assert.equal(JSON.stringify(second), canonical);
  assert.equal(second.motifRequest.options.nodes[0].at[0], -48);
  assert.equal(second.motifRequest.options.edges.length, 4);

  const panelRequest = "panel_flow 패널 흐름으로 빈 사각 상자 3개를 패널 사이의 평범한 연결선으로 연결한 도식만 그려 줘";
  const panelFirst = matchLocalAssetRequest({ request: panelRequest });
  panelFirst.motifRequest.options.states[0].tone = "gray";
  const panelSecond = matchLocalAssetRequest({ request: panelRequest });
  assert.equal(panelSecond.motifRequest.options.states[0].tone, "white");
});

test("fixture-locked apparatus matches are deterministic and return fresh option objects", () => {
  const circuitRequest = "one closed rectangular series circuit with exactly one dc source on the left, one open switch on the top, one resistor on the right, and one lamp on the bottom, no labels or arrows";
  const firstCircuit = matchLocalAssetRequest({ request: circuitRequest });
  const canonicalCircuit = JSON.stringify(firstCircuit);
  firstCircuit.motifRequest.options.switchState = "closed";
  assert.equal(JSON.stringify(matchLocalAssetRequest({ request: circuitRequest })), canonicalCircuit);

  const vesselRequest = "beaker and particle box side by side comparison: beaker liquid fill fraction 0.45, gas 16 circular particles, unmixed, no labels or arrows";
  const firstVessel = matchLocalAssetRequest({ request: vesselRequest });
  const canonicalVessel = JSON.stringify(firstVessel);
  firstVessel.motifRequest.options.liquid = 0.9;
  firstVessel.motifRequest.options.particleCount = 99;
  assert.equal(JSON.stringify(matchLocalAssetRequest({ request: vesselRequest })), canonicalVessel);
});

test("simple series circuit matches only the exact four-part loop with explicit switch state", () => {
  assertHit(
    "단일 직렬 회로를 닫힌 사각 배선 루프로 구성하고 왼쪽 직류 전원 한 개, 위쪽 열린 스위치 한 개, 오른쪽 저항 한 개, 아래쪽 전구 한 개만 놓아 줘",
    "simple_series_circuit",
    { switchState: "open" },
  );
  assertHit(
    "단일 닫힌 사각형 직렬 회로에 왼쪽 직류 전원 한 개, 위쪽 닫힌 스위치 한 개, 오른쪽 저항 한 개, 아래쪽 전구 한 개만 놓아 줘",
    "simple_series_circuit",
    { switchState: "closed" },
  );
  assertHit(
    "one closed rectangular series circuit with exactly one dc source on the left, one open switch on the top, one resistor on the right, and one lamp on the bottom, no branches meters labels or arrows",
    "simple_series_circuit",
    { switchState: "open" },
  );
  assertHit(
    "one closed rectangular series circuit with one dc source on the left, one closed switch on the top, one resistor on the right, and one bulb on the bottom only",
    "simple_series_circuit",
    { switchState: "closed" },
  );
});

test("series circuit near misses never invent topology, state, count, values, or annotations", () => {
  const cases = [
    "단일 직렬 회로에 왼쪽 직류 전원 한 개, 위쪽 열린 스위치 한 개, 오른쪽 저항 한 개, 아래쪽 전구 한 개",
    "단일 닫힌 사각형 직렬 회로에 왼쪽 직류 전원 한 개, 위쪽 스위치 한 개, 오른쪽 저항 한 개, 아래쪽 전구 한 개",
    "단일 닫힌 사각형 직렬 회로에 왼쪽 직류 전원 한 개, 위쪽 열린 스위치와 닫힌 스위치, 오른쪽 저항 한 개, 아래쪽 전구 한 개",
    "단일 닫힌 사각형 직렬 회로에 왼쪽 직류 전원 한 개, 위쪽 열린 스위치 한 개, 오른쪽 저항 두 개, 아래쪽 전구 한 개",
    "단일 닫힌 사각형 직렬 회로에 왼쪽 직류 전원 한 개, 위쪽 열린 스위치 한 개, 오른쪽 저항 하나와 추가 저항 두 개, 아래쪽 전구 한 개",
    "단일 닫힌 사각형 직렬 회로에 왼쪽 직류 전원 한 개, 위쪽 열린 스위치 한 개, 오른쪽 10옴 저항 한 개, 아래쪽 전구 한 개",
    "단일 닫힌 사각형 직렬 회로에 왼쪽 직류 전원 한 개, 위쪽 열린 스위치 한 개, 오른쪽 저항 한 개, 아래쪽 전구 한 개와 분기 회로",
    "단일 닫힌 사각형 직렬 회로에 왼쪽 직류 전원 한 개, 위쪽 열린 스위치 한 개, 오른쪽 전류계 한 개, 아래쪽 전구 한 개",
    "단일 닫힌 사각형 직렬 회로에 오른쪽 직류 전원 한 개, 위쪽 열린 스위치 한 개, 왼쪽 저항 한 개, 아래쪽 전구 한 개",
    "단일 닫힌 사각형 직렬 회로에 왼쪽 직류 전원 한 개, 위쪽 열린 스위치 한 개, 오른쪽 저항 한 개, 아래쪽 전구 한 개와 라벨 A",
    "one closed rectangular series circuit with one dc source on the left, one open switch on the top, one resistor on the right, one lamp on the bottom, and one pulley",
    "one closed rectangular series circuit with one dc source on the left, one open switch on the top, one resistor plus three additional resistors on the right, and one lamp on the bottom",
  ];
  for (const request of cases) assertMiss(request);
});

test("fixed pulley and spring assembly matches only two same-shape blank loads", () => {
  assertHit(
    "천장에 고정된 도르래 한 개와 하나의 연속된 줄을 사용하고 왼쪽에는 빈 직사각형 추 하나, 오른쪽에는 용수철 한 개 아래에 같은 모양의 빈 직사각형 추 하나를 놓아 줘",
    "fixed_pulley_spring_loads",
    {},
  );
  assertHit(
    "one ceiling-fixed pulley with one continuous rope, one blank rectangular load on the left branch, and on the right branch one spring followed by one blank rectangular load of the same shape, no moving pulley force vectors labels or arrows",
    "fixed_pulley_spring_loads",
    {},
  );
});

test("pulley near misses reject inferred continuity, shape, mass, complexity, and mixed apparatus", () => {
  const cases = [
    "도르래 한 개와 용수철 한 개, 추 두 개를 그려 줘",
    "천장에 고정된 도르래 한 개에 줄을 걸고 왼쪽 빈 직사각형 추 하나, 오른쪽 용수철 아래 같은 모양의 빈 직사각형 추 하나",
    "천장에 고정된 도르래 한 개와 하나의 연속된 줄, 왼쪽 빈 직사각형 추 하나, 오른쪽 용수철 한 개 아래 빈 직사각형 추 하나",
    "천장에 고정된 도르래 한 개와 하나의 연속된 줄, 왼쪽 빈 직사각형 추 하나, 오른쪽 용수철 두 개 아래 같은 모양의 빈 직사각형 추 하나",
    "천장에 고정된 도르래 한 개와 하나의 연속된 줄, 왼쪽 빈 직사각형 추 하나, 오른쪽 용수철 한 개 아래 같은 질량의 빈 직사각형 추 하나",
    "천장에 고정된 도르래 한 개와 이동 도르래 한 개, 하나의 연속된 줄, 왼쪽 빈 직사각형 추 하나, 오른쪽 용수철 한 개 아래 같은 모양의 빈 직사각형 추 하나",
    "천장에 고정된 도르래 하나와 추가 도르래 세 개에 하나의 연속된 줄, 왼쪽 빈 직사각형 추 하나, 오른쪽 용수철 한 개 아래 같은 모양의 빈 직사각형 추 하나",
    "천장에 고정된 도르래 한 개와 하나의 연속된 줄, 경사면 위 왼쪽 빈 직사각형 추 하나, 오른쪽 용수철 한 개 아래 같은 모양의 빈 직사각형 추 하나",
    "천장에 고정된 도르래 한 개와 하나의 연속된 줄, 왼쪽 빈 직사각형 추 하나, 오른쪽 용수철 한 개 아래 같은 모양의 빈 직사각형 추 하나와 힘 화살표",
    "one ceiling-fixed pulley with one continuous rope, one blank rectangular load on the left branch, and one spring followed by a matching blank load on the left branch",
    "one ceiling-fixed pulley with one continuous rope, one blank rectangular load on the left branch, and on the right branch one spring followed by one blank rectangular load of the same shape plus a circuit",
    "one ceiling-fixed pulley plus three additional pulleys with one continuous rope, one blank rectangular load on the left branch, and on the right branch one spring followed by one blank rectangular load of the same shape",
  ];
  for (const request of cases) assertMiss(request);
});

test("lens mirror screen bench matches only the locked convex-lens and 45-degree fixture", () => {
  const options = { lensKind: "convex_lens", mirrorRotation: 45 };
  assertHit(
    "광학대에 왼쪽 볼록 렌즈 한 개, 중앙 45도 평면 거울 한 개, 오른쪽 스크린 한 개만 배치해 줘",
    "lens_mirror_screen_bench",
    options,
  );
  assertHit(
    "optical bench with exactly one convex lens on the left, one plane mirror at 45 degrees in the center, and one screen on the right, no rays labels or arrows",
    "lens_mirror_screen_bench",
    options,
  );
});

test("optical bench near misses reject alternative parts, angle, rays, distances, counts, and layout", () => {
  const cases = [
    "광학대에 왼쪽 볼록 렌즈 한 개, 중앙 평면 거울 한 개, 오른쪽 스크린 한 개",
    "광학대에 왼쪽 볼록 렌즈 한 개, 중앙 30도 평면 거울 한 개, 오른쪽 스크린 한 개",
    "광학대에 왼쪽 오목 렌즈 한 개, 중앙 45도 평면 거울 한 개, 오른쪽 스크린 한 개",
    "광학대에 왼쪽 볼록 렌즈 두 개, 중앙 45도 평면 거울 한 개, 오른쪽 스크린 한 개",
    "광학대에서 왼쪽에 볼록 렌즈 하나와 추가 볼록 렌즈 세 개, 중앙에 45도 평면 거울 하나, 오른쪽에 스크린 하나",
    "광학대에 오른쪽 볼록 렌즈 한 개, 중앙 45도 평면 거울 한 개, 왼쪽 스크린 한 개",
    "광학대에 왼쪽 볼록 렌즈 한 개, 중앙 45도 평면 거울 한 개, 오른쪽 스크린 한 개와 광선",
    "광학대에 왼쪽 볼록 렌즈 한 개, 중앙 45도 평면 거울 한 개, 오른쪽 스크린 한 개와 물체 화살표",
    "광학대에 왼쪽 볼록 렌즈 한 개, 중앙 45도 평면 거울 한 개, 오른쪽 스크린 한 개, 거리는 20 cm",
    "optical bench with one convex lens on the left, one plane mirror at 45 degrees in the center, one screen on the right, and labels",
    "optical bench with one convex lens on the left, one plane mirror at 45 degrees in the center, one screen on the right, and a beaker",
    "optical bench with one convex lens plus three additional convex lenses on the left, one plane mirror at 45 degrees in the center, and one screen on the right",
  ];
  for (const request of cases) assertMiss(request);
});

test("vessel particle comparison matches only all six locked scientific fields", () => {
  const options = {
    vesselKind: "beaker",
    liquid: 0.45,
    particleState: "gas",
    particleCount: 16,
    particleShape: "circle",
    mix: false,
  };
  assertHit(
    "비커 한 개와 입자 상자 한 개를 나란히 비교해 줘. 비커 액체 채움 비율은 0.45, 입자 상자는 혼합하지 않은 기체 상태의 원형 입자 16개",
    "vessel_particle_comparison",
    options,
  );
  assertHit(
    "beaker and particle box side by side comparison: beaker liquid fill fraction 0.45, gas 16 circular particles, unmixed, no labels or arrows",
    "vessel_particle_comparison",
    options,
  );
});

test("vessel particle near misses reject every omitted or altered locked field", () => {
  const cases = [
    "비커 한 개와 입자 상자 한 개를 나란히 비교해 줘. 기체 상태의 원형 입자 16개, 혼합하지 않음",
    "비커 한 개와 입자 상자 한 개를 나란히 비교해 줘. 비커 액체 채움 비율 0.5, 기체 상태의 원형 입자 16개, 혼합하지 않음",
    "비커 한 개와 입자 상자 한 개를 나란히 비교해 줘. 비커 액체 채움 비율 0.45, 액체 상태의 원형 입자 16개, 혼합하지 않음",
    "비커 한 개와 입자 상자 한 개를 나란히 비교해 줘. 비커 액체 채움 비율 0.45, 기체 상태의 원형 입자 15개, 혼합하지 않음",
    "비커 한 개와 입자 상자 한 개를 나란히 비교해 줘. 비커 액체 채움 비율 0.45, 기체 상태의 사각 입자 16개, 혼합하지 않음",
    "비커 한 개와 입자 상자 한 개를 나란히 비교해 줘. 비커 액체 채움 비율 0.45, 혼합된 기체 상태의 원형 입자 16개",
    "비커 두 개와 입자 상자 한 개를 나란히 비교해 줘. 비커 액체 채움 비율 0.45, 기체 상태의 원형 입자 16개, 혼합하지 않음",
    "비커 하나와 입자 상자 하나를 나란히 비교하고 비커 다섯 개도 추가해 줘. 비커 액체 채움 비율 0.45, 혼합하지 않은 기체 상태의 원형 입자 16개",
    "플라스크 한 개와 입자 상자 한 개를 나란히 비교해 줘. 액체 채움 비율 0.45, 기체 상태의 원형 입자 16개, 혼합하지 않음",
    "beaker and particle box side by side comparison: beaker liquid fill fraction 0.45, gas 16 circular particles, unmixed, with labels",
    "beaker and particle box side by side comparison: beaker liquid fill fraction 0.45, gas 16 circular particles, unmixed, plus a pulley",
    "one beaker and one particle box side by side plus three additional beakers: beaker liquid fill fraction 0.45, gas 16 circular particles, unmixed",
  ];
  for (const request of cases) assertMiss(request);
});

test("generic logistic population graph matches only one unlabeled detail-free S curve", () => {
  assertHit(
    "일반적인 무라벨 단일 곡선으로 개체군 로지스틱 S자 성장 곡선만 그려 줘",
    "logistic_population_graph",
    {},
  );
  assertHit(
    "one generic unlabeled logistic S-shaped population curve without labels text numbers",
    "logistic_population_graph",
    {},
  );
});

test("logistic near misses reject values, axes detail, capacity, multiple series, species, and missing evidence", () => {
  const cases = [
    "일반적인 무라벨 단일 곡선으로 개체군 S자 성장 곡선만 그려 줘",
    "일반적인 무라벨 단일 곡선으로 개체군 로지스틱 성장 곡선만 그려 줘",
    "일반적인 무라벨 단일 곡선으로 로지스틱 S자 성장 곡선만 그려 줘",
    "무라벨 단일 곡선으로 개체군 로지스틱 S자 성장 곡선만 그려 줘",
    "일반적인 개체군 로지스틱 S자 성장 곡선만 그려 줘",
    "일반적인 무라벨 개체군 로지스틱 S자 성장 곡선만 그려 줘",
    "일반적인 무라벨 단일 곡선으로 개체군 로지스틱 S자 성장 곡선을 100까지 그려 줘",
    "일반적인 무라벨 단일 곡선으로 개체군 로지스틱 S자 성장 곡선에 눈금과 격자를 넣어 줘",
    "일반적인 무라벨 단일 곡선으로 개체군 로지스틱 S자 성장 곡선에 환경 수용력 선을 넣어 줘",
    "여우 종의 일반적인 무라벨 단일 개체군 로지스틱 S자 성장 곡선",
    "generic unlabeled multiple population logistic S-shaped curves",
    "일반적인 무라벨 단일 로지스틱 S자형 개체군 곡선에 곡선 세 개를 추가해 줘",
    "one generic unlabeled logistic S-shaped population curve plus three additional curves",
    "generic unlabeled single population logistic S-shaped curve with arrows",
    "generic unlabeled single population logistic S-shaped curve beside a circuit",
  ];
  for (const request of cases) assertMiss(request);
});

test("fixture-locked apparatus obey common diagram, reference, revision, and edit gates", () => {
  const circuit = "one closed rectangular series circuit with one dc source on the left, one open switch on the top, one resistor on the right, and one lamp on the bottom";
  const pulley = "one ceiling-fixed pulley with one continuous rope, one blank rectangular load on the left branch, and on the right branch one spring followed by one blank rectangular load of the same shape";
  const logistic = "one generic unlabeled logistic S-shaped population curve";
  assertMiss(circuit, "diagram-mode-only", { mode: "complete" });
  assertMiss(circuit, "references-present", { references: [{ id: "ref" }] });
  assertMiss(`${circuit} and revise the previous result`, "revision-request");
  assertMiss(`${pulley}에서 추를 제거해 줘`, "destructive-or-negative-edit-request");
  assertMiss(logistic, "diagram-mode-only", { mode: "complete" });
});

test("exact standalone panel-flow grammar maps counts, kinds and ordered particle states", () => {
  assertHit(
    "panel_flow 패널 흐름으로 빈 사각 상자 3개를 패널 사이의 평범한 연결선으로 연결한 도식만 그려 줘",
    "panel_flow",
    {
      panelCount: 3,
      panelType: "box",
      states: [{ tone: "white" }, { tone: "white" }, { tone: "white" }],
      connectors: true,
    },
  );
  assertHit(
    "빈 비커 4개로 패널 흐름 도식을 만들고 비커 사이를 실선 연결선으로 연결해 줘",
    "panel_flow",
    {
      panelCount: 4,
      panelType: "vessel",
      vesselKind: "beaker",
      states: [{ liquid: 0 }, { liquid: 0 }, { liquid: 0 }, { liquid: 0 }],
      connectors: true,
    },
  );
  assertHit(
    "panel flow with three empty flasks connected by plain lines",
    "panel_flow",
    {
      panelCount: 3,
      panelType: "vessel",
      vesselKind: "flask",
      states: [{ liquid: 0 }, { liquid: 0 }, { liquid: 0 }],
      connectors: true,
    },
  );
  assertHit(
    "입자 상자 3개를 왼쪽부터 기체 입자 12개, 액체 입자 10개, 고체 입자 8개로 두고 패널 사이를 평범한 연결선으로 연결해 줘",
    "panel_flow",
    {
      panelCount: 3,
      panelType: "particlebox",
      states: [
        { state: "gas", count: 12 },
        { state: "liquid", count: 10 },
        { state: "solid", count: 8 },
      ],
      connectors: true,
    },
  );
  assertHit(
    "two particle boxes in order: gas 9 particles and solid 7 particles, connected by plain lines",
    "panel_flow",
    {
      panelCount: 2,
      panelType: "particlebox",
      states: [{ state: "gas", count: 9 }, { state: "solid", count: 7 }],
      connectors: true,
    },
  );
});

test("panel-flow grammar fails closed on inferred state, topology, count, annotations or mixed scenes", () => {
  const cases = [
    ["빈 비커를 패널 흐름으로 평범한 연결선으로 연결해 줘", "panel-count-not-exact"],
    ["빈 비커 6개를 패널 흐름으로 평범한 연결선으로 연결해 줘", "panel-count-not-exact"],
    ["빈 비커 3개로 패널 흐름을 만들어 줘", "panel-connectors-not-explicit"],
    ["비커 3개를 패널 흐름으로 비커 사이의 평범한 연결선으로 연결해 줘", "vessel-panel-empty-state-not-explicit"],
    ["빈 비커와 빈 플라스크 3개를 패널 흐름으로 평범한 연결선으로 연결해 줘", "panel-type-ambiguous"],
    ["빈 비커와 빈 사각 상자 3개를 패널 흐름으로 평범한 연결선으로 연결해 줘", "panel-type-ambiguous"],
    ["액면이 다른 비커 3개를 패널 흐름으로 평범한 연결선으로 연결해 줘", "panel-state-unsupported"],
    ["입자 상자 3개를 기체 입자 12개, 액체 입자 10개, 고체 입자 8개로 두고 평범한 연결선으로 연결해 줘", "particle-panel-order-not-explicit"],
    ["입자 상자 3개를 왼쪽부터 기체 입자 12개, 액체, 고체 입자 8개로 두고 평범한 연결선으로 연결해 줘", "particle-panel-states-incomplete"],
    ["입자 상자 2개를 왼쪽부터 기체 입자 12개, 액체 입자 10개, 고체 입자 8개로 두고 평범한 연결선으로 연결해 줘", "particle-panel-states-incomplete"],
    ["빈 상자 3개를 패널 흐름으로 평범한 연결선으로 연결하고 라벨 A를 써 줘", "panel-annotation-requested"],
    ["빈 상자 3개를 패널 흐름으로 평범한 연결선으로 연결하고 지도도 넣어 줘", "panel-not-standalone"],
  ];
  for (const [request, reason] of cases) assertMiss(request, reason);

  assertHit(
    "빈 상자 2개를 패널 흐름으로 상자 사이의 평범한 연결선으로 연결하고 문자 숫자 화살표는 넣지 마",
    "panel_flow",
    {
      panelCount: 2,
      panelType: "box",
      states: [{ tone: "white" }, { tone: "white" }],
      connectors: true,
    },
  );
  assertMiss("빈 상자 2개를 패널 흐름으로 상자 사이의 평범한 연결선으로 연결하고 문자 없이 숫자는 넣어 줘", "panel-annotation-requested");
});

test("blank dual-axis scaffold matches only with x axis and exact equal-division count", () => {
  assertHit(
    "빈 이중 y축 그래프에 x축과 5등분 눈금만 있는 도식",
    "dual_axis_plot",
    { tickCount: 5, leftSeries: [], rightSeries: [], grid: false },
  );
  assertHit(
    "blank dual y-axis plot with an x-axis and six equal divisions",
    "dual_axis_plot",
    { tickCount: 6, leftSeries: [], rightSeries: [], grid: false },
  );
  assertHit(
    "데이터 없이 좌우 y축과 x축, tickCount 4인 빈 그래프를 그리고 문자와 숫자 라벨은 넣지 마",
    "dual_axis_plot",
    { tickCount: 4, leftSeries: [], rightSeries: [], grid: false },
  );
});

test("dual-axis scaffold rejects series, grid, missing axes/count, annotations and mixed objects", () => {
  const cases = [
    ["빈 이중 y축 그래프에 5등분 눈금만", "dual-axis-x-axis-not-explicit"],
    ["이중 y축 그래프에 x축과 5등분 눈금만", "dual-axis-empty-scaffold-not-explicit"],
    ["빈 이중 y축 그래프에 x축과 눈금만", "dual-axis-tick-count-not-exact"],
    ["빈 이중 y축 그래프에 x축과 13등분 눈금만", "dual-axis-tick-count-not-exact"],
    ["빈 이중 y축 그래프에 x축, 5등분 눈금과 격자를 넣어 줘", "dual-axis-series-or-grid-unsupported"],
    ["빈 이중 y축 그래프에 x축과 5등분 눈금, 증가 곡선을 넣어 줘", "dual-axis-series-or-grid-unsupported"],
    ["빈 이중 y축 그래프에 x축과 5등분 눈금, 라벨 A를 넣어 줘", "dual-axis-annotation-requested"],
    ["빈 이중 y축 그래프에 x축과 5등분 눈금 옆에 비커를 그려 줘", "dual-axis-not-standalone"],
  ];
  for (const [request, reason] of cases) assertMiss(request, reason);
});

test("closed-loop wiring grammar emits fully explicit fixed topology", () => {
  const orthogonalOptions = {
    nodes: [
      { id: "a", at: [-48, -24] }, { id: "b", at: [48, -24] },
      { id: "c", at: [48, 24] }, { id: "d", at: [-48, 24] },
    ],
    edges: [
      { from: "a", to: "b" }, { from: "b", to: "c" },
      { from: "c", to: "d" }, { from: "d", to: "a" },
    ],
    showNodes: true,
  };
  const diagonalOptions = {
    nodes: [
      { id: "a", at: [-48, 26] }, { id: "b", at: [0, -28] }, { id: "c", at: [48, 26] },
    ],
    edges: [
      { from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "a" },
    ],
    showNodes: true,
  };
  assertHit(
    "직사각형 네 꼭짓점에 단자점 4개가 있는 직교 배선 골격만 닫힌 회로로 평범한 실선 연결",
    "orthogonal_wiring",
    orthogonalOptions,
  );
  assertHit(
    "orthogonal wiring scaffold: a rectangular closed loop in solid lines with four terminal nodes",
    "orthogonal_wiring",
    orthogonalOptions,
  );
  assertHit(
    "삼각형 꼭짓점에 단자점 3개가 있는 대각 배선 골격만 닫힌 회로로 평범한 실선 연결",
    "diagonal_wiring",
    diagonalOptions,
  );
  assertHit(
    "diagonal wiring scaffold: a triangular closed loop in solid lines with three terminal nodes",
    "diagonal_wiring",
    diagonalOptions,
  );
});

test("wiring grammar rejects any topology inference, component, annotation or second scene", () => {
  const cases = [
    ["직사각형 단자점 4개의 직교 배선 골격", "wiring-loop-or-line-style-not-explicit"],
    ["직사각형 단자점 4개의 직교 배선 골격을 닫힌 회로로 연결", "wiring-loop-or-line-style-not-explicit"],
    ["직사각형 단자점 3개의 직교 배선 골격을 닫힌 회로로 실선 연결", "wiring-shape-or-node-count-not-exact"],
    ["삼각형 단자점 4개의 대각 배선 골격을 닫힌 회로로 실선 연결", "wiring-shape-or-node-count-not-exact"],
    ["직사각형 단자점 4개의 직교 대각 배선 골격을 닫힌 회로로 실선 연결", "wiring-strategy-conflict"],
    ["직사각형 단자점 4개의 직교 배선 골격을 닫힌 회로로 점선 연결", "wiring-component-or-topology-unsupported"],
    ["직사각형 단자점 4개의 직교 배선 골격을 닫힌 회로로 실선 연결하고 저항을 넣어 줘", "wiring-component-or-topology-unsupported"],
    ["직사각형 단자점 4개의 직교 배선 골격을 닫힌 회로로 실선 연결하고 A 라벨을 넣어 줘", "wiring-annotation-requested"],
    ["직사각형 단자점 4개의 직교 배선 골격을 닫힌 회로로 실선 연결하고 비커를 그려 줘", "wiring-not-standalone"],
  ];
  for (const [request, reason] of cases) assertMiss(request, reason);
});

test("generic valueless contour grammar maps exact count and open/closed variant", () => {
  assertHit(
    "값 없이 중첩된 닫힌 개략 등치선 묶음 5개만 그려 줘",
    "contour_bundle",
    { count: 5, variant: "nested" },
  );
  assertHit(
    "수치 없이 평행한 열린 일반 등치선 묶음 6개만 그려 줘",
    "contour_bundle",
    { count: 6, variant: "parallel" },
  );
  assertHit(
    "generic nested contour bundle with five closed contours without values",
    "contour_bundle",
    { count: 5, variant: "nested" },
  );
  assertHit(
    "generic parallel contour bundle with four open contours without values",
    "contour_bundle",
    { count: 4, variant: "parallel" },
  );
});

test("contour grammar rejects real maps, inferred values/count/variant and mixed content", () => {
  const cases = [
    ["중첩된 닫힌 등치선 5개", "contour-generic-valueless-scaffold-not-explicit"],
    ["개략 중첩 닫힌 등치선 묶음 5개", "contour-generic-valueless-scaffold-not-explicit"],
    ["값 없이 개략 닫힌 등치선 묶음 5개", "contour-variant-not-exact"],
    ["값 없이 중첩된 개략 등치선 묶음 5개", "contour-open-closed-state-not-exact"],
    ["값 없이 중첩된 열린 개략 등치선 묶음 5개", "contour-open-closed-state-not-exact"],
    ["값 없이 중첩된 닫힌 개략 등치선 묶음 1개", "contour-count-not-exact"],
    ["값 없이 중첩된 닫힌 개략 등치선 묶음 13개", "contour-count-not-exact"],
    ["값 없이 중첩된 닫힌 한반도 등고선 지도 5개", "map-overlay-or-unsafe-content"],
    ["값 없이 중첩된 닫힌 개략 등치선 묶음 5개를 회색으로 채워 줘", "contour-map-or-overlay-unsupported"],
    ["값 없이 중첩된 닫힌 개략 등치선 묶음 5개와 그래프를 그려 줘", "contour-not-standalone"],
    ["값 없이 중첩된 닫힌 개략 등치선 묶음 5개에 수치 라벨을 넣어 줘", "contour-annotation-requested"],
  ];
  for (const [request, reason] of cases) assertMiss(request, reason);
});

test("all four physical-coastline-only map variants match exact standalone requests", () => {
  const cases = [
    ["세계 전체의 물리 해안선 지도만 검은 선으로 그려 줘", "world"],
    ["태평양 물리적 해안선 지도 윤곽만 만들어 줘", "pacific"],
    ["동아시아 해안선 지도만 흑백 선화로 만들어 줘", "east_asia"],
    ["한반도 물리 해안선 지도 윤곽만 그려 줘", "korean_peninsula"],
    ["World physical coastline map only", "world"],
    ["Pacific Ocean physical coastline map outline only", "pacific"],
    ["East Asia physical coastline map only", "east_asia"],
    ["Korean Peninsula physical coastline map outline", "korean_peninsula"],
  ];
  for (const [request, variant] of cases) {
    const result = assertHit(request, "verified_map_outline", { variant, fillLand: false });
    assert.equal(result.reason, `local-verified-map-outline:${variant}`);
  }
});

test("named maps fail closed unless both physical coastline and map intent are explicit", () => {
  const cases = [
    ["한반도 지도만 그려 줘", "map-physical-coastline-not-explicit"],
    ["동아시아의 해안선만 그려 줘", "map-physical-coastline-not-explicit"],
    ["태평양 지도만 그려 줘", "map-physical-coastline-not-explicit"],
    ["세계 지도를 그려 줘", "map-physical-coastline-not-explicit"],
    ["아시아 물리 해안선 지도", "no-exact-local-asset-match"],
    ["유럽 물리 해안선 지도", "no-exact-local-asset-match"],
    ["한반도와 동아시아 물리 해안선 지도", "ambiguous-map-variant"],
    ["세계와 태평양 물리 해안선 지도", "ambiguous-map-variant"],
    ["한반도 해안선 지도는 그리지 마", "map-target-negated"],
  ];
  for (const [request, reason] of cases) assertMiss(request, reason);
});

test("map overlays, political content, labels and other scenes never take the local asset path", () => {
  const unsafe = [
    "한반도 물리 해안선 지도에 국경을 표시해 줘",
    "동아시아 물리 해안선 지도에 행정 경계를 넣어 줘",
    "세계 물리 해안선 지도에 도시 이름과 지명을 써 줘",
    "태평양 물리 해안선 지도에 라벨을 붙여 줘",
    "한반도 물리 해안선 지질도를 만들어 줘",
    "동아시아 물리 해안선 일기도와 등압선을 그려 줘",
    "태평양 물리 해안선 지도에 태풍 경로를 표시해 줘",
    "세계 물리 해안선 지도에 등치선 오버레이를 넣어 줘",
    "한반도 물리 해안선 지도에 진앙 위치점을 찍어 줘",
    "동아시아 물리 해안선 지도에 판 경계와 화살표를 넣어 줘",
    "태평양 물리 해안선 지도에서 해류를 표시해 줘",
    "세계 물리 해안선 지도의 육지를 회색으로 채워 줘",
    "세계 물리 해안선 지도 두 개를 나란히 그려 줘",
  ];
  for (const request of unsafe) assertMiss(request, "map-overlay-or-unsafe-content");

  const mixed = [
    "한반도 물리 해안선 지도 옆에 학생을 그려 줘",
    "세계 물리 해안선 지도와 회로를 함께 그려 줘",
    "태평양 물리 해안선 지도 위에 우주선을 그려 줘",
    "동아시아 물리 해안선 지도와 그래프를 한 장에 넣어 줘",
  ];
  for (const request of mixed) assertMiss(request, "map-not-standalone");
});

test("exact seated three-student dialogue scene matches with no invented bubbles", () => {
  assertHit(
    "직사각형 책상에 앉은 학생 세 명이 서로 대화하는 장면만 그려 줘",
    "student_trio_seated_dialogue",
    { tableShape: "rect", speechBubbles: "none" },
  );
  assertHit(
    "원형 탁자에 앉아 이야기하는 3명의 학생을 단순 선화로 그려 줘",
    "student_trio_seated_dialogue",
    { tableShape: "round", speechBubbles: "none" },
  );
  assertHit(
    "Three students seated at a rectangular table talking to each other",
    "student_trio_seated_dialogue",
    { tableShape: "rect", speechBubbles: "none" },
  );
  assertHit(
    "student trio sitting at a round table in conversation",
    "student_trio_seated_dialogue",
    { tableShape: "round", speechBubbles: "none" },
  );
});

test("blank speech bubbles are added only by explicit current-request evidence", () => {
  assertHit(
    "책상에 앉은 학생 3명이 대화하며 빈 말풍선도 있는 장면",
    "student_trio_seated_dialogue",
    {
      tableShape: "rect",
      speechBubbles: "three_blank",
      speechBubbleEvidence: "request",
    },
  );
  assertHit(
    "Three students seated at a round table talking, with blank speech bubbles",
    "student_trio_seated_dialogue",
    {
      tableShape: "round",
      speechBubbles: "three_blank",
      speechBubbleEvidence: "request",
    },
  );
  assertHit(
    "책상에 앉은 세 명의 학생이 대화하되 말풍선 없이 그려 줘",
    "student_trio_seated_dialogue",
    { tableShape: "rect", speechBubbles: "none" },
  );
  assertMiss(
    "책상에 앉은 학생 세 명이 대화하고 말풍선에 대사를 써 줘",
    "speech-bubble-text-unsupported",
  );
  assertMiss(
    "책상에 앉은 학생 세 명이 대화하고 빈 말풍선 하나를 넣어 줘",
    "speech-bubble-count-conflict",
  );
});

test("student scene rejects wrong counts, missing relations, conflicting poses and extra objects", () => {
  const cases = [
    ["책상에 앉은 학생 두 명이 대화하는 장면", "student-count-conflict"],
    ["책상에 앉은 학생 네 명이 대화하는 장면", "student-count-conflict"],
    ["책상에 앉은 학생 13명이 대화하는 장면", "student-count-conflict"],
    ["책상에 앉은 학생 23명이 대화하는 장면", "student-count-conflict"],
    ["책상에 앉은 열세 명의 학생이 대화하는 장면", "student-count-conflict"],
    ["책상에 앉은 학생들이 대화하는 장면", "student-trio-count-not-explicit"],
    ["학생 세 명이 서서 대화하는 장면", "student-scene-incomplete"],
    ["책상에 앉은 학생 세 명", "student-scene-incomplete"],
    ["학생 세 명이 앉아 대화하는 장면", "student-scene-incomplete"],
    ["책상에 앉은 학생 세 명이 대화하지 않는 장면", "student-dialogue-negated"],
    ["원형 직사각형 책상에 앉은 학생 세 명이 대화", "student-table-shape-conflict"],
    ["학생 세 명이 각자 책상에 앉아 대화", "student-table-count-conflict"],
    ["학생 세 명이 책상 두 개에 앉아 대화", "student-table-count-conflict"],
    ["책상에 앉은 학생 세 명과 교사가 대화", "student-scene-has-extra-object"],
    ["책상에 앉은 학생 세 명이 칠판 앞에서 대화", "student-scene-has-extra-object"],
    ["책상과 의자에 앉은 학생 세 명이 대화", "student-scene-has-extra-object"],
    ["책상에 앉은 학생 세 명이 비커 실험 장치를 두고 대화", "student-scene-has-extra-object"],
    ["책상에 앉은 학생 세 명이 세계 지도 옆에서 대화", "map-physical-coastline-not-explicit"],
    ["학생 세 명을 제거하고 책상만 그려 줘", "destructive-or-negative-edit-request"],
  ];
  for (const [request, reason] of cases) assertMiss(request, reason);
});

test("simple flat spacecraft shell matches and only explicit optional parts enter options", () => {
  assertHit(
    "단순한 평면 우주선 쉘만 검은 선으로 그려 줘",
    "spacecraft_flat_shell",
    {},
  );
  assertHit(
    "왼쪽을 향한 길쭉한 단순 평면 우주선 외형만 그려 줘",
    "spacecraft_flat_shell",
    { proportions: "long", facing: "left" },
  );
  assertHit(
    "컴팩트한 단순 평면 우주선 선체에 창 하나만 넣어 줘",
    "spacecraft_flat_shell",
    { proportions: "compact", window: "single" },
  );
  assertHit(
    "단순 평면 우주선 쉘에 넓은 창과 앉은 탑승자를 넣어 줘",
    "spacecraft_flat_shell",
    { window: "wide", occupant: "seated" },
  );
  assertHit(
    "단순 평면 우주선 쉘에 창 하나와 중앙 점광원을 넣어 줘",
    "spacecraft_flat_shell",
    { window: "single", device: "point_source", deviceSlot: "center" },
  );
  assertHit(
    "simple flat spacecraft shell with a single window and a detector box",
    "spacecraft_flat_shell",
    { window: "single", device: "detector_box" },
  );
  assertHit(
    "simple flat spacecraft shell with a wide window, a seated occupant, and a plane mirror at the center",
    "spacecraft_flat_shell",
    { window: "wide", occupant: "seated", device: "plane_mirror", deviceSlot: "center" },
  );
});

test("spacecraft request fails closed on ambiguity, incompatible options or unsupported detail", () => {
  const cases = [
    ["우주선 하나 그려 줘", "spacecraft-shell-not-explicit"],
    ["단순 우주선 쉘을 그려 줘", "spacecraft-shell-not-explicit"],
    ["평면 우주선 쉘을 그려 줘", "spacecraft-shell-not-explicit"],
    ["단순한 평면 우주선을 그려 줘", "spacecraft-shell-not-explicit"],
    ["단순 우주선 쉘에 평면 거울을 넣어 줘", "spacecraft-shell-not-explicit"],
    ["복잡하고 정밀한 평면 우주선 쉘", "spacecraft-complex-or-unsupported"],
    ["단순 평면 로켓 우주선 쉘", "spacecraft-complex-or-unsupported"],
    ["사실적인 단순 평면 우주선 외형", "spacecraft-complex-or-unsupported"],
    ["단순 평면 우주선 쉘에 추진기와 날개를 달아 줘", "spacecraft-complex-or-unsupported"],
    ["단순 평면 우주선 쉘과 행성 배경을 그려 줘", "spacecraft-has-extra-object"],
    ["단순 평면 우주선 쉘에 창과 탑승자를 넣어 줘", "spacecraft-occupant-pose-not-explicit"],
    ["단순 평면 우주선 쉘 안에 앉은 탑승자를 넣어 줘", "spacecraft-window-required"],
    ["단순 평면 우주선 쉘 안에 점광원을 넣어 줘", "spacecraft-window-required"],
    ["단순 평면 우주선 쉘에 창 하나와 점광원과 검출기를 넣어 줘", "spacecraft-device-conflict"],
    ["단순 평면 우주선 쉘에 창 두 개를 넣어 줘", "spacecraft-window-count-conflict"],
    ["단순 평면 우주선 쉘에 넓은 창과 앉은 탑승자 두 명을 넣어 줘", "spacecraft-occupant-count-conflict"],
    ["단순 평면 우주선 쉘에 창 하나와 점광원 두 개를 넣어 줘", "spacecraft-device-count-conflict"],
    ["단순 평면 우주선 쉘에 창 하나와 점광원 없이 그려 줘", "spacecraft-device-negated"],
    ["단순 평면 우주선 두 대의 쉘을 그려 줘", "spacecraft-count-conflict"],
    ["단순 평면 우주선 쉘에 창 하나, 앉은 탑승자와 검출기를 넣어 줘", "spacecraft-wide-window-required"],
    ["단순 평면 우주선 쉘에 넓은 창, 앉은 탑승자와 뒤쪽 검출기를 넣어 줘", "spacecraft-rear-slot-reserved"],
    ["왼쪽과 오른쪽을 향한 단순 평면 우주선 쉘", "spacecraft-facing-conflict"],
    ["길쭉하고 컴팩트한 단순 평면 우주선 쉘", "spacecraft-proportion-conflict"],
    ["우주선은 그리지 말고 단순 평면 쉘만", "spacecraft-target-negated"],
    ["단순 평면 우주선 쉘에서 창을 제거해 줘", "destructive-or-negative-edit-request"],
  ];
  for (const [request, reason] of cases) assertMiss(request, reason);
});

test("matched motif requests compile as valid existing high-level contracts", () => {
  const requests = [
    "한반도 물리 해안선 지도 윤곽만 그려 줘",
    "원형 탁자에 앉은 학생 세 명이 대화하고 빈 말풍선도 있는 장면",
    "단순 평면 우주선 쉘에 넓은 창과 앉은 탑승자를 넣어 줘",
    "빈 비커 4개로 패널 흐름 도식을 만들고 비커 사이를 실선 연결선으로 연결해 줘",
    "빈 이중 y축 그래프에 x축과 5등분 눈금만 있는 도식",
    "직사각형 네 꼭짓점에 단자점 4개가 있는 직교 배선 골격만 닫힌 회로로 평범한 실선 연결",
    "삼각형 꼭짓점에 단자점 3개가 있는 대각 배선 골격만 닫힌 회로로 평범한 실선 연결",
    "값 없이 중첩된 닫힌 개략 등치선 묶음 5개만 그려 줘",
    "one closed rectangular series circuit with exactly one dc source on the left, one open switch on the top, one resistor on the right, and one lamp on the bottom, no labels or arrows",
    "one ceiling-fixed pulley with one continuous rope, one blank rectangular load on the left branch, and on the right branch one spring followed by one blank rectangular load of the same shape, no labels or arrows",
    "optical bench with exactly one convex lens on the left, one plane mirror at 45 degrees in the center, and one screen on the right, no rays labels or arrows",
    "beaker and particle box side by side comparison: beaker liquid fill fraction 0.45, gas 16 circular particles, unmixed, no labels or arrows",
    "one generic unlabeled logistic S-shaped population curve without labels text numbers",
  ];
  for (const request of requests) {
    const routed = matchLocalAssetRequest({ request });
    assert.equal(routed.matched, true, request);
    const { motif, options } = routed.motifRequest;
    const compiled = compileAiMotif(motif, options, { idPrefix: "local_router_test" });
    assert.equal(compiled.valid, true, `${request}: ${JSON.stringify(compiled.errors)}`);
    assert.equal(compiled.supported, true, `${request}: ${JSON.stringify(compiled.unsupported)}`);
    assert.ok(compiled.objects.length > 0, request);
  }
});

test("unknown, mixed and edit-style requests remain on the normal engine path", () => {
  const cases = [
    "도르래와 추를 그려 줘",
    "학생 세 명을 그려 줘",
    "단순한 자동차 쉘을 그려 줘",
    "태평양 해류 지도를 그려 줘",
    "세계 지도를 참고해서 수정해 줘",
    "원본에서 교사를 삭제하고 학생 세 명만 남겨 줘",
    "동아시아 지도와 책상에 앉은 학생 세 명의 대화 장면을 합쳐 줘",
    "단순 평면 우주선 쉘과 책상에 앉은 학생 세 명을 함께 그려 줘",
  ];
  for (const request of cases) assert.equal(matchLocalAssetRequest({ request }).matched, false, request);
});
