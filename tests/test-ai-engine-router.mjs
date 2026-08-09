import assert from "node:assert/strict";
import test from "node:test";

import { chooseImageEngine, IMAGE_ENGINE_IDS } from "../js/ai-engine-router.js";
import { buildFastScenePrompt, FAST_SCENE_PROMPT_VERSION } from "../js/ai-scene-prompt.js";
import { insertFastSceneIntoState } from "../js/ai-scene-preview.js";

test("common assessment apparatus routes to the fast vector scene", () => {
  assert.equal(chooseImageEngine({ request: "도르래와 두 블록의 배치를 바꿔 줘" }).engine, IMAGE_ENGINE_IDS.FAST_SCENE);
  assert.equal(chooseImageEngine({ request: "전지와 저항이 있는 회로를 구성해 줘" }).engine, IMAGE_ENGINE_IDS.FAST_SCENE);
  assert.equal(chooseImageEngine({ request: "이 참고 이미지에서 문자만 제거해 줘", references: [{}] }).engine, IMAGE_ENGINE_IDS.FAST_SCENE);
});

test("new audited motifs and supported apparatus route to the fast scene", () => {
  const requests = [
    "세 단계 상태 변화를 나란히 배치한 과정 도식",
    "왼쪽과 오른쪽 y축을 함께 쓰는 이중축 도식",
    "노드를 직교 배선으로 연결해 줘",
    "대각선 배선 두 개를 연결해 줘",
    "숫자 없는 등고선 묶음을 그려 줘",
    "등압선 여러 개를 간결하게 배치해 줘",
    "U자관과 피스톤 용기를 나란히 놓아 줘",
    "슬릿과 스크린의 간격을 조정해 줘",
    "가계도의 세대 배치를 바꿔 줘",
    "정확한 지형이 아닌 개략 해안선 모식도를 그려 줘",
  ];
  for (const request of requests) {
    assert.equal(chooseImageEngine({ request }).engine, IMAGE_ENGINE_IDS.FAST_SCENE, request);
  }
});

test("only the exact audited illustration assets bypass broad raster nouns", () => {
  const exactCases = [
    ["학생 세 명이 한 탁자에 둘러앉아 대화하는 그림형 도식", "student_trio_seated_dialogue"],
    ["교사와 칠판 없이 학생 3명이 테이블에 앉아 빈 말풍선으로 토론하는 선화", "student_trio_seated_dialogue"],
    ["단순한 평면 우주선 외형만 검은 선화로 그려 줘", "spacecraft_flat_shell"],
    ["로켓과 엔진과 날개 없이 간단한 우주선 껍질만 그려 줘", "spacecraft_flat_shell"],
  ];
  for (const [request, rule] of exactCases) {
    const result = chooseImageEngine({ request, mode: "diagram" });
    assert.equal(result.engine, IMAGE_ENGINE_IDS.FAST_SCENE, request);
    assert.equal(result.rule, rule, request);
  }

  const broaderCases = [
    "학생 네 명이 탁자에 앉아 대화하는 그림",
    "학생 세 명과 교사가 한 탁자에서 대화하는 그림",
    "학생 세 명이 두 탁자에 앉아 대화하는 그림",
    "학생 세 명이 탁자에 앉아 도르래 실험을 하며 대화하는 그림",
    "학생 세 명이 탁자에 앉아 전류계를 관찰하며 대화하는 그림",
    "학생 세 명이 서서 탁자 옆에서 대화하는 그림",
    "교사를 제거하지 말고 학생 세 명이 탁자에 앉아 대화하는 그림",
    "평면 우주선 외형을 사실적인 3D로 그려 줘",
    "단순한 우주선 외형에 엔진과 날개를 추가해 줘",
    "간단한 우주선에 우주비행사와 창문을 넣어 줘",
    "단순한 평면 우주선을 그려 줘",
  ];
  for (const request of broaderCases) {
    assert.equal(chooseImageEngine({ request, mode: "diagram" }).engine, IMAGE_ENGINE_IDS.RASTER, request);
  }

  assert.equal(
    chooseImageEngine({ request: exactCases[0][0], mode: "complete" }).engine,
    IMAGE_ENGINE_IDS.RASTER,
    "strict illustration assets are diagram-only",
  );
});

test("verified physical coastline variants route fast only when the map is the entire output", () => {
  const exactCases = [
    ["세계의 물리적 해안선 윤곽만 그려 줘", "world"],
    ["태평양 해안선만 검은 선으로 그려 줘", "pacific"],
    ["동아시아의 자연 해안선 윤곽을 선화로 그려 줘", "east_asia"],
    ["국경과 지명 없이 한반도의 물리적 해안선만 그려 줘", "korean_peninsula"],
  ];
  for (const [request, variant] of exactCases) {
    const result = chooseImageEngine({ request, mode: "diagram" });
    assert.equal(result.engine, IMAGE_ENGINE_IDS.FAST_SCENE, request);
    assert.equal(result.rule, "verified_map_outline", request);
    assert.equal(result.variant, variant, request);
  }

  const broaderCases = [
    "아시아의 물리적 해안선만 그려 줘",
    "세계와 동아시아의 물리적 해안선만 함께 그려 줘",
    "태평양 해안선과 국경을 함께 그려 줘",
    "동아시아 해안선만 그리고 지명을 표시해 줘",
    "한반도 해안선과 지질 구조를 겹쳐 줘",
    "태평양 해안선과 등고선을 함께 그려 줘",
    "세계 해안선에 태풍 경로와 화살표를 추가해 줘",
    "한반도 지도만 그려 줘",
    "동아시아의 물리적 해안선만 완성형으로 그려 줘",
  ];
  for (const request of broaderCases) {
    const mode = request.includes("완성형") ? "complete" : "diagram";
    assert.equal(chooseImageEngine({ request, mode }).engine, IMAGE_ENGINE_IDS.RASTER, request);
  }

  assert.equal(
    chooseImageEngine({ request: "국경을 제거하지 말고 한반도의 물리적 해안선만 그려 줘" }).engine,
    IMAGE_ENGINE_IDS.RASTER,
    "double-negative border instructions must not be treated as omissions",
  );
});

test("illustrative anatomy and maps stay on the raster fallback", () => {
  assert.equal(chooseImageEngine({ request: "사람의 손과 근육을 세밀하게 그려 줘" }).engine, IMAGE_ENGINE_IDS.RASTER);
  assert.equal(chooseImageEngine({ request: "대륙 지도와 해안선을 그려 줘" }).engine, IMAGE_ENGINE_IDS.RASTER);
  assert.equal(chooseImageEngine({ request: "도르래를 든 사람을 그려 줘" }).engine, IMAGE_ENGINE_IDS.RASTER);
});

test("raster exclusions have priority over otherwise fast keywords", () => {
  const cases = [
    ["무릎 반사 과정을 그래프로 함께 그려 줘", "neural-reflex-conflict"],
    ["눈의 구조와 볼록렌즈를 함께 그려 줘", "people-hands-anatomy"],
    ["현미경 사진 위에 좌표를 표시해 줘", "photographic-material"],
    ["자동차와 용수철의 연결 구조를 사실적으로 그려 줘", "photographic-material"],
    ["한반도 등고선 지도를 정확하게 그려 줘", "exact-geography"],
    ["뉴런과 스피커를 나란히 그려 줘", "biological-illustration"],
    ["현미경 옆에 측정 그래프를 배치해 줘", "complex-vehicle-or-product"],
    ["노트북과 회로를 연결해 줘", "complex-vehicle-or-product"],
  ];
  for (const [request, rule] of cases) {
    const result = chooseImageEngine({ request });
    assert.equal(result.engine, IMAGE_ENGINE_IDS.RASTER, request);
    assert.equal(result.rule, rule, request);
  }
});

test("Korean word prefixes do not create anatomy false positives", () => {
  assert.equal(chooseImageEngine({ request: "에너지 손실 그래프" }).engine, IMAGE_ENGINE_IDS.FAST_SCENE);
  assert.equal(chooseImageEngine({ request: "장기 변화 그래프" }).engine, IMAGE_ENGINE_IDS.FAST_SCENE);
  assert.equal(chooseImageEngine({ request: "빛의 반사와 굴절을 나타내 줘" }).engine, IMAGE_ENGINE_IDS.FAST_SCENE);
  assert.equal(chooseImageEngine({ request: "추를 용수철 아래에 배치해 줘" }).engine, IMAGE_ENGINE_IDS.FAST_SCENE);
});

test("positive omission permits the remaining simple structure, but double negatives do not", () => {
  assert.equal(
    chooseImageEngine({ request: "사람은 제거하고 도르래와 블록만 남겨 줘", references: [{}] }).engine,
    IMAGE_ENGINE_IDS.FAST_SCENE,
  );
  assert.equal(
    chooseImageEngine({ request: "도르래를 든 사람을 삭제해 줘", references: [{}] }).engine,
    IMAGE_ENGINE_IDS.FAST_SCENE,
  );
  assert.equal(
    chooseImageEngine({ request: "사람을 제거하지 말고 도르래도 유지해 줘", references: [{}] }).engine,
    IMAGE_ENGINE_IDS.RASTER,
  );
  assert.equal(
    chooseImageEngine({ request: "사람 없이 자동차만 남겨 줘", references: [{}] }).engine,
    IMAGE_ENGINE_IDS.RASTER,
  );
});

test("diagram intrinsic symbols fall back while complete mode may retain them", () => {
  const diagram = chooseImageEngine({ request: "전류계와 저항이 있는 회로", mode: "diagram" });
  assert.equal(diagram.engine, IMAGE_ENGINE_IDS.RASTER);
  assert.equal(diagram.reason, "diagram-symbol-conflict");

  assert.equal(
    chooseImageEngine({ request: "전류계와 저항이 있는 회로", mode: "complete" }).engine,
    IMAGE_ENGINE_IDS.FAST_SCENE,
  );
});

test("force remains authoritative and default remains conservative", () => {
  assert.equal(
    chooseImageEngine({ request: "사람 해부 사진", force: IMAGE_ENGINE_IDS.FAST_SCENE }).engine,
    IMAGE_ENGINE_IDS.FAST_SCENE,
  );
  assert.equal(chooseImageEngine({ request: "아무 설명 없는 낯선 장치" }).engine, IMAGE_ENGINE_IDS.RASTER);
});

test("scene prompt is one-shot, tool-free and carries a prior editable scene", () => {
  const prompt = buildFastScenePrompt({
    request: "용수철 길이만 줄여 줘",
    mode: "diagram",
    revisionScene: '{"schema":"5e-fast-scene@1","elements":[]}',
  });
  assert.equal(FAST_SCENE_PROMPT_VERSION, "5e-fast-scene-prompt@7");
  assert.match(prompt, /Return exactly one compact JSON object/);
  assert.match(prompt, /No markdown fence, prose, analysis, tool call/);
  assert.match(prompt, /Current editable scene JSON/);
  assert.match(prompt, /all labels, text, numbers, symbols, leader lines, and arrowheads are forbidden/);
  assert.match(prompt, /verified_map_outline/);
  assert.match(prompt, /only three audited exceptions/);
  assert.match(prompt, /student_trio_seated_dialogue/);
  assert.match(prompt, /spacecraft_flat_shell/);
  assert.match(prompt, /Do not generalize those exceptions/);
  assert.match(prompt, /do not add markers, paths, apparatus or any overlay/);
});

test("native scene insertion fits, remaps ids and groups in one undo step", () => {
  const store = {
    value: {
      artboard: { w: 90, h: 60 }, objects: [], groups: [], undoStack: [], redoStack: [],
      selectedIds: [], activeLayerId: 3, activeTool: "V", targetedId: null,
    },
    get() { return this.value; },
    update(fn) { fn(this.value); },
  };
  const result = insertFastSceneIntoState(store, {
    artboard: { w: 180, h: 90 },
    objects: [
      { id: "plane", type: "coordplane", x: -80, y: -30, w: 80, h: 60, strokeWidth: 0.3 },
      { id: "curve", type: "funcgraph", planeId: "plane", points: [{ x: -70, y: 0 }, { x: -10, y: 10 }], strokeWidth: 0.3 },
    ],
  });
  assert.equal(result.added, 2);
  assert.equal(result.scale, 0.45);
  assert.equal(store.value.undoStack.length, 1);
  assert.equal(store.value.objects[0].layerId, 3);
  assert.equal(store.value.objects[1].planeId, store.value.objects[0].id);
  assert.equal(store.value.objects[0].groupId, store.value.objects[1].groupId);
  assert.deepEqual(store.value.selectedIds, store.value.objects.map((obj) => obj.id));
});
