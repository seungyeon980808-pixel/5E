# 평가원 과학 도식 엔진 V2 인터페이스와 재현 가이드

이 문서는 저장소의 현재 구현을 새 Codex 세션이나 5E 통합 코드가 다시 사용할 수 있도록 정리한
실행 인터페이스다. 과거 대화가 아니라 아래 모듈, 테스트와 고정 벤치마크를 기준으로 한다.

- 공통 스타일 기준: `docs/EXAM_SCIENTIFIC_DIAGRAM_STYLE.md`,
  `docs/GPT_KNOWLEDGE_EVALUATION_SCIENCE_LINEART.md`
- 빠른 장면 스키마: `5e-fast-scene@1`
- 장면 프롬프트: `5e-fast-scene-prompt@7`
- 모티프 카탈로그: `5e-motif-catalog@5`
- zero-round-trip 로컬 매처: `5e-local-asset-router@3`
- 원격 입력 계획: `remote-input-v2`
- exact output cache: `5e-ai-output-v2`

## 1. 현재 엔진의 실제 형태

현재 V2는 하나의 공개 `generate()` 함수가 아니라 다음 경로를 조합한 모듈형 엔진이다.
데스크톱 앱의 통합 오케스트레이션은 `js/ai-panel.js`에 있고, 새 세션에서는 아래 순수 모듈을 직접
import하여 같은 순서를 재현할 수 있다.

```text
요청 + 참고 자료 + 영역 코멘트
        |
        +--> exact cache hit ----------------------> 기존 성공 결과 즉시 반환
        |
        +--> strict local asset match ----------------> 모델·도구 0회, 즉시 5E 벡터
        |
        +--> chooseImageEngine()
                |
                +--> fast-scene
                |     Luna text turn (imageGeneration 0회)
                |     -> 제한 JSON -> 검증/모티프 확장 -> 5E 객체/SVG
                |     -> invalid/unsupported/empty이면 raster 1회 재시도
                |
                +--> raster
                      참고 자료 계획/크롭/접촉 시트/전송 축소
                      -> imagegen 정확히 1회 -> 완료 결과만 cache
```

캐시는 생성 엔진이 아니라 세 경로보다 앞에 놓이는 동일 입력 재사용 계층이다. strict local asset은
승인된 정확 문법만 모델 호출 없이 모티프로 컴파일한다. fast-scene
컴파일 함수 자체는 raster를 호출하지 않는다. 자동 raster 재시도는 현재 `ai-panel.js` 통합층이
담당하므로, 모듈을 직접 쓰는 호출자도 같은 fallback을 명시적으로 구현해야 한다.

## 2. 공통 요청 계약

다음은 여러 모듈에 넘길 값을 한곳에 모은 권장 어댑터 형태다. 이 이름의 클래스나 타입이 export되는
것은 아니며, 실제 필드는 아래 API에 나누어 전달한다.

```js
const engineRequest = {
  request: "사용자 지시문",
  mode: "diagram",                 // "diagram" | "complete"
  references: [
    {
      id: "ref-1",
      name: "reference.png",
      data: "data:image/png;base64,...",
      kind: "reference",
      sourceKind: "file",          // file | capture | library | exam 등 호출자 메타데이터
      primary: true,
      comments: [
        { number: 1, x: 12, y: 18, w: 30, h: 24, text: "이 영역의 도르래만 유지" },
      ],
    },
  ],
  latestResult: null,               // 수정이면 직전 generated item
  model: "gpt-5.6-luna",
  effort: "low",
  serviceTier: "priority",         // 5E UI의 Fast 경로
  forceEngine: "auto",             // auto | fast-scene | raster
};
```

`comments`의 `x,y,w,h`는 이미지 왼쪽 위를 원점으로 한 0–100 백분율이다. 영역 사각형과 번호는
AI 출력에 그리지 않으며, 코멘트 텍스트와 크롭만 입력으로 전달한다. fast-scene 장면 좌표는 반대로
아트보드 중앙이 원점이다. 기본 160×90 mm에서 x는 -80..80, y는 -45..45다.

### 출력 모드

- `diagram`(그림형): 문자, 숫자, 단위, 수식, 기호, 라벨, 지시선과 화살표가 금지된다.
- `complete`(완성형): 사용자가 명시적으로 요청한 라벨과 표시만 허용한다.
- 고수준 모티프, strict illustration asset, verified map asset은 안전상 `diagram` 전용이다.

## 3. 세 입력 방식

### 3.1 참고 이미지 변환

원본을 `references`에 넣고 구조 보존·삭제·이동·비율 변경 지시를 `request`와 영역 코멘트로 전달한다.
여러 이미지를 넣을 수 있으며, `primary:true` 또는 `primaryReferenceId`로 주 참고 자료를 명시할 수 있다.

1. `chooseImageEngine()`가 사람·손·해부·생물 세밀화·정확 지도·사진·복잡 차량 등을 먼저 raster로
   보낸다.
2. 그림형의 단순 구조 편집이고 참고 자료가 있으면 `reference-structure-edit` fast-scene 후보가 될
   수 있다.
3. `createRemoteImageInputPlan()`은 주 이미지 overview, 관련 영역 crop, 보조 자료 contact sheet를
   합쳐 기본 최대 4개의 시각 입력으로 줄인다.
4. fast-scene 응답이 유효하지 않거나 지원 범위를 벗어나면 동일 요청을 raster로 한 번 재시도한다.

주의: 현재 반복 live benchmark는 **참고 이미지가 없는 설명 입력**만 측정했다. 따라서 참고 이미지의
정확한 실루엣·비율·배치를 보존하는 성공률이 27/27이라고 주장하면 안 된다.

### 3.2 설명 기반 생성

`references: []`로 두고 필요한 장치의 수, 연결, 접촉, 좌우/상하 순서와 상태를 문장으로 지정한다.
회로, 도르래·용수철, 렌즈·거울, 용기·입자, 그래프, 패널 흐름, 이중축, 배선과 등치선은 현재
fast-scene 후보가 된다. 네 물리 해안선 지도, 정확히 착석한 학생 3인 대화, 단순 평면 우주선
쉘의 제한 문법은 로컬 자산 경로로 더 먼저 처리된다. 그 밖의 사람·생물 삽화·사진형 재료나
미분류 구조는 보수적으로 raster로 간다.

현재 9종×3회 live repeatability benchmark가 직접 검증한 입력 방식은 이것이다.

### 3.3 손그림과 설명 기반 생성

스케치를 일반 참고 이미지와 동일한 카드로 넣되 `sourceKind:"capture"` 또는 호출자가 쓰는 sketch
메타데이터를 유지한다. 설명은 스케치의 선 자체보다 과학적 의미를 우선하여 명시해야 한다.

```js
const sketch = {
  id: "sketch-1",
  name: "pulley-sketch.png",
  data: sketchDataUrl,
  kind: "reference",
  sourceKind: "capture",
  primary: true,
  comments: [
    { number: 1, x: 40, y: 8, w: 20, h: 24, text: "고정 도르래 1개" },
    { number: 2, x: 62, y: 45, w: 18, h: 35, text: "이 선은 용수철이며 아래 추와 접촉" },
  ],
};
```

스케치에 없는 장치나 관계를 “그럴듯하게” 보충하지 않는다. 의미가 불명확하면 생성 전에 대화
경로로 확인하고, 확정된 설명만 image/scene 턴에 넘긴다. 이 입력 방식도 아직 별도 정량 성공률을
확보하지 않았으므로 설명 기반 벤치마크 결과를 그대로 적용하지 않는다.

## 4. 라우팅 인터페이스

```js
import {
  chooseImageEngine,
  IMAGE_ENGINE_IDS,
} from "./js/ai-engine-router.js";

const route = chooseImageEngine({
  request: engineRequest.request,
  mode: engineRequest.mode,
  references: engineRequest.references,
  force: engineRequest.forceEngine,
});

// { engine: "fast-scene" | "raster", reason, rule? }
```

라우팅 우선순위는 다음과 같다.

1. 호출자가 명시한 `force`.
2. 사람·손·해부·생물 삽화·정확 지리·사진·복잡 차량/제품의 raster 규칙.
3. 그림형에서 본질적으로 문자/화살표를 렌더링하는 장치의 raster 규칙.
4. 현재 지원된 과학 장치·그래프·모티프의 fast-scene 규칙.
5. 그림형 참고 이미지 구조 편집.
6. 미분류 raster fallback.

강제 fast-scene은 안전 검사와 컴파일 성공을 면제하지 않는다. `valid`, `supported`, 객체 수를 다시
확인해야 하며 실패하면 raster 또는 사용자 확인으로 넘긴다.

## 5. fast-scene 경로

### 5.1 프롬프트 생성과 컴파일

```js
import { buildFastScenePrompt } from "./js/ai-scene-prompt.js";
import { compileFastSceneWithMotifs } from "./js/ai-motif-catalog.js";

const text = buildFastScenePrompt({
  request: engineRequest.request,
  mode: engineRequest.mode,
  revisionScene: engineRequest.latestResult?.sceneSource || "",
});

// 데스크톱 renderer에서 사용하는 실제 bridge 형태.
const turn = await window.fiveEDesktop.send({
  text,
  attachments: preparedAttachments,
  purpose: "scene",
  ephemeralRender: true,
  model: engineRequest.model,
  effort: engineRequest.effort,
  serviceTier: engineRequest.serviceTier,
});

// turn의 최종 assistant text를 responseText로 수집한 뒤:
const compiled = compileFastSceneWithMotifs(responseText, {
  mode: engineRequest.mode,
  layerId: 1,
  idPrefix: "engine_v2",
});

if (!compiled.valid || !compiled.supported || compiled.objects.length === 0) {
  // 직접 호출자는 여기서 raster 재시도 또는 명시적 오류 처리를 구현한다.
}
```

`compileFastSceneWithMotifs()`는 JSON 문자열, 일반 장면 객체, sole-element motif shortcut을 받는다.
반환값의 핵심 필드는 `artboard`, `objects`, `valid`, `supported`, `errors`, `warnings`, `unsupported`,
`stats`다. 그림형이면 `auditDiagramObjects()`도 적용된다.

일반 장면만 다룬다면 `compileFastScene()`, 지원 가능성만 보고 싶다면
`assessFastSceneSupport()`, 기존 5E 객체 배열로 변환하려면 `convertFastSceneToObjects()`를 쓸 수
있다. 미리보기와 삽입은 브라우저/5E state가 있는 환경에서 다음 API를 사용한다.

```js
import {
  fastSceneToSvgDataUrl,
  insertFastSceneIntoState,
} from "./js/ai-scene-preview.js";

const preview = fastSceneToSvgDataUrl(compiled);
const insertion = insertFastSceneIntoState(state, compiled, { fitRatio: 0.9 });
```

### 5.2 코드 네이티브 모티프

```js
import {
  listAiMotifs,
  createAiMotifScene,
  compileAiMotif,
} from "./js/ai-motif-catalog.js";

const available = listAiMotifs();
const result = compileAiMotif("panel_flow", {
  panelCount: 3,
  panelType: "particlebox",
  states: [
    { state: "gas", count: 12 },
    { state: "liquid", count: 12 },
    { state: "solid", count: 12 },
  ],
});
```

현재 ID는 `panel_flow`, `dual_axis_plot`, `orthogonal_wiring`, `diagonal_wiring`,
`contour_bundle`, `coastline_schematic`, `verified_map_outline`, `student_trio_seated_dialogue`,
`spacecraft_flat_shell`이다. 모티프는 장면의 유일한 고수준 요소여야 하며 일반 element와 섞으면
거부된다.

`coastline_schematic`은 임의의 일반 해안선 스캐폴드다. 한반도·동아시아·태평양·세계 지도를
대신하지 않는다.

### 5.3 zero-round-trip 로컬 자산 매처

```js
import { matchLocalAssetRequest } from "./js/ai-local-asset-router.js";
import { compileFastSceneWithMotifs } from "./js/ai-motif-catalog.js";

const local = matchLocalAssetRequest({
  request: "한반도 물리 해안선 지도를 그려 줘",
  mode: "diagram",
  references: [],
});

if (local.matched) {
  const compiled = compileFastSceneWithMotifs(local.motifRequest, { mode: "diagram" });
}
```

매처는 그림형·무참고·무수정 요청 중 승인된 독립 자산과 정확히 대응하는 경우에만 `matched:true`를
반환한다. 참고 이미지, 완성형, 복합 장면, 모호한 인원·옵션, 부정 편집은 실패 폐쇄하여 일반
fast-scene 또는 raster로 넘긴다. `ai-panel.js`는 이 분기를 데스크톱 turn보다 앞에서 종료하므로
모델·imageGeneration·도구 호출이 모두 0회다.

현재 로컬 매처가 승인하는 범위는 네 물리 해안선 지도, 두 학생 3인 구성, 두 평면 우주선 구성,
빈 상자/순서가 명시된 입자 패널 흐름, 빈 이중축, 고정 직교·대각 배선, 값 없는 등치선 묶음,
그리고 fixture-locked 직렬 회로·고정 도르래/용수철·볼록렌즈/45도 평면거울/스크린·
비커 0.45/기체 원형 입자 16개 비교·무라벨 단일 S곡선이다. 장치 수·배치·상태·각도 중 하나라도
빠지거나 달라지면 이 경로는 사용하지 않는다. 정확한 문법과 거부 사유는
`docs/engine-v2/LOCAL_ASSET_FAST_PATH.md`를 따른다.

## 6. raster 경로와 참고 입력 준비

### 6.1 입력 계획·합성·전송

```js
import { createRemoteImageInputPlan } from "./js/ai-remote-input-plan.js";
import { composeRemoteImageInputPlan } from "./js/ai-remote-compositor.js";
import { prepareAIImageForTransport } from "./js/ai-image-transport.js";
import { buildImagePrompt } from "./js/ai-prompt.js";

const plan = createRemoteImageInputPlan({
  references: engineRequest.references,
  latestResult: engineRequest.latestResult,
  prompt: engineRequest.request,
  primaryReferenceId: "ref-1",
});
const composed = await composeRemoteImageInputPlan(plan);
const attachments = await Promise.all(composed.outputs.map(async (output) => {
  const transport = await prepareAIImageForTransport(output.dataUrl, {
    width: output.width,
    height: output.height,
    contentKind: "line-art",
  });
  return { name: output.name, data: transport.transportDataUrl };
}));

const rasterPrompt = buildImagePrompt({
  request: engineRequest.request,
  mode: engineRequest.mode,
  revision: Boolean(engineRequest.latestResult),
});
```

기본 입력 계획은 최대 4개 outgoing image, 직접 crop 2개, contact sheet tile 8개다. 원본·주요
영역·보조 자료를 순위화하고 중복/만료/교체된 생성 결과를 제거한다. 접촉 시트에는 문자나 번호를
그리지 않는다.

전송 최적화는 원본 data URL을 변경하지 않고 AI 첨부용 사본만 만든다. 기본 한도는 긴 변 1536 px,
총 2.5M px이며, PNG 선화는 PNG를 보존한다. Canvas 처리 실패 시 원본으로 실패 폐쇄하지 않고
`usedFallback:true`와 이유를 기록한 원본 전송 fallback을 반환한다.

`buildImagePrompt()`는 제공된 요청과 첨부만 사용하고 imagegen을 정확히 한 번 호출하도록 제한한다.
같은 턴의 자가 재생성은 금지된다. `buildDiscussionPrompt()`는 반대로 이미지 및 다른 도구 호출을
금지한다.

### 6.2 exact output cache

```js
import {
  buildExactOutputCacheDescriptor,
  createExactOutputCacheKey,
} from "./js/ai-remote-input-plan.js";
import { createExactOutputCacheStore } from "./js/ai-output-cache-store.js";

const descriptor = buildExactOutputCacheDescriptor({
  styleVersion: "kice-raster-v2",
  engineVersion: "caller-engine-version",
  mode: engineRequest.mode,
  prompt: engineRequest.request,
  references: engineRequest.references,
  latestResult: engineRequest.latestResult,
  model: engineRequest.model,
  effort: engineRequest.effort,
  serviceTier: engineRequest.serviceTier,
  outputOptions: {},
});
const key = createExactOutputCacheKey(descriptor);
const cache = createExactOutputCacheStore();
const hit = await cache.get(key);

if (!hit.hit) {
  await cache.put({
    key,
    descriptor,
    output: { data: completedDataUrl, sceneSource: completedSceneSource || null },
    status: "complete",
  });
}
```

키에는 모드, 정규화 프롬프트, 순서가 있는 참고 이미지 pixel hash, 모든 비어 있지 않은 코멘트와
영역, 직전 결과 hash, 모델·추론·service tier, 스타일/엔진/입력 계획/출력 옵션이 들어간다. 일부
성공, 실패, 취소, 진행 중 출력은 저장하지 않는다. 기본 정책은 TTL 7일, 48개, 전체 256 MiB,
개별 20 MiB다. 브라우저 기본 backend는 IndexedDB이며 테스트에서는
`MemoryOutputCacheBackend`를 주입할 수 있다.

`새 변형`, `다시 생성`, `다르게 생성`, `재생성` 같은 의도는 현재 UI 통합층에서 cache를 우회한다.

## 7. 정확 지도와 삽화 자산의 안전 경계

### 7.1 verified physical coastline map

`js/ai-map-assets.js`는 현재 실제 구현되어 있으며 예정 파일이 아니다. 허용 ID는 `world`,
`pacific`, `east_asia`, `korean_peninsula` 네 개뿐이다.

```js
import {
  listVerifiedMapMetadata,
  compileVerifiedMap,
} from "./js/ai-map-assets.js";

const maps = listVerifiedMapMetadata();
const result = compileVerifiedMap("east_asia", {
  artboard: { w: 160, h: 90 },
  padding: 4,
  strokeWidth: 0.3,
  fillLand: true,
  landTone: "gray",
}, {
  idPrefix: "verified_east_asia",
  layerId: 1,
});
```

이 런타임은 고정 커밋과 SHA-256이 있는 Natural Earth 1:50m 물리 해안선만 사용한다. 런타임
네트워크 요청, 정치/분쟁 경계, 국가·지명, 위경도, 기호, 화살표는 없다. 단일 축척으로 비율을
보존하며, 호출자가 정확한 네 ID 중 하나를 명시해야 한다. 유사 지명으로 변형을 추측하지 않는다.

현재 `chooseImageEngine()`과 `ai-panel.js`는 네 지역 중 하나와 물리 해안선 단독 출력이 명시된
그림형 요청만 `verified_map_outline` 로컬 경로로 보낸다. 정치·행정 경계, 지명, 지질·지형·기상,
등고선, 경로, 표식이나 다른 장치가 함께 있으면 이 예외를 쓰지 않는다. 새 세션이 API를 직접
쓸 때도 요청한 지역이 네 변형 중 하나임을 명시적으로 확인해야 한다. 상세 지도는 128요소
배치 병합이 필요하므로 `compileFastScene(createVerifiedMapScene(...))`보다
`compileVerifiedMap()`을 사용한다.

문서 마감 시점에 `tests/test-ai-map-assets.mjs`와 `tests/test-map-asset-builder.mjs`를 함께 실행해
11/11 통과를 확인했다. 열린 coastline은 두 점 이상인 polyline을 정상 입력으로 취급한다. 이 검증은
고정 자산의 결정성·출처·클리핑·장면 컴파일·MCP 정규화 범위이며, 정치 경계나 임의 지역의 정확성을
보증하는 검증은 아니다.

### 7.2 strict illustration asset

`js/ai-illustration-assets.js`가 일반화 가능한 것으로 승인한 새 삽화는 다음 두 계열뿐이다.

- `student_trio_seated_dialogue`: 서로 다른 세 학생과 탁자. 빈 말풍선은 원본/요청 증거가 있을 때만.
- `spacecraft_flat_shell`: 일반 쉘과 명시적으로 선택한 창·탑승자·제한 장치. 특정 기출 우주선의
  정확 복제가 아니다.

```js
import { compileIllustrationAsset } from "./js/ai-illustration-assets.js";

const result = compileIllustrationAsset("spacecraft_flat_shell", {
  facing: "left",
  window: "wide",
  occupant: "seated",
  device: "detector_box",
  deviceSlot: "front",
});
```

모든 선택 내용은 닫힌 enum이며 기본은 `none`이다. 컴파일 결과는 semantic component별 `groupId`,
`assetRole`과 `sourcePixelsEmbedded:false` provenance를 가진다. 이 두 자산의 존재를 임의 사람 자세,
손 접촉, 차량, 동물·식물 삽화까지 일반화하지 않는다.

손 자산은 더 좁다. `tools/mcp-5e/lib/parts.js`의 `buildSafePart()`가 고정 SHA-256과 승인된
`examId/panelRef/context`를 요구하는 소수 기출 재구성만 허용한다. 범용 손 생성 API가 아니다.

## 8. 새 세션 재현 절차

1. 저장소 루트 `C:\Users\user\Desktop\project\51_5E\5E_main`에서 작업한다.
2. 공통 스타일 문서와 이 문서를 읽고, `diagram`/`complete` 모드를 먼저 고정한다.
3. 입력 세 종류를 공통 요청 계약으로 정규화한다. 이미지 카드의 원본 data URL은 변경하지 않는다.
4. `chooseImageEngine()`로 후보 경로를 정하고 exact cache key를 만든 뒤 cache를 먼저 조회한다.
5. fast-scene이면 Luna, low effort, priority/Fast, ephemeral `purpose:"scene"` 턴을 사용한다.
6. 응답을 `compileFastSceneWithMotifs()`로 검증하고 `valid && supported && objects.length>0`인 경우만
   수용한다.
7. fast-scene 실패 또는 최초 raster 분류이면 입력 계획/합성/전송 사본을 만들고 one-shot raster
   프롬프트를 사용한다.
8. 완료된 결과만 exact cache에 저장한다. 그림형 객체는 `auditDiagramObjects()` 불변식을 다시
   확인한다.
9. 기능 변경 뒤 아래 회귀·감사·repeatability 검증을 실행하고 실패 요청과 교정 이력을 보존한다.

## 9. 검증·벤치마크·감사 명령

저장소 루트에서 실행한다.

```powershell
# 데스크톱 회귀
npm.cmd test

# 핵심 순수 모듈
node --test tests/test-ai-engine-router.mjs tests/test-ai-scene-fastpath.mjs tests/test-ai-motif-catalog.mjs
node --test tests/test-ai-remote-input-plan.mjs tests/test-ai-remote-compositor.mjs tests/test-ai-image-transport.mjs tests/test-ai-output-cache-store.mjs
node --test tests/test-ai-illustration-assets.mjs tests/test-safe-exam-parts.mjs
node --test tests/test-ai-map-assets.mjs tests/test-map-asset-builder.mjs

# 고정된 live fast-scene 결과의 오프라인 gate
npm.cmd run verify:scene:repeatability

# Luna text turn만 사용하는 live 반복 측정; imageGeneration 호출 금지/0회 검증
npm.cmd run benchmark:scene:repeatability

# 단일 fast-scene live 측정
npm.cmd run benchmark:scene

# 로컬 입력 계획과 코드 네이티브 속도
node tests/benchmark-ai-remote-input-plan.mjs
node scripts/engine-v2/benchmark-motif-catalog.mjs 12000
node scripts/engine-v2/benchmark-illustration-assets.mjs --iterations=4000

# 기출/삽화 감사
npm.cmd run audit:exam-motifs
node scripts/engine-v2/audit-illustration-assets.mjs --check

# 지도 데이터 재빌드는 고정 원천 파일을 따로 받은 경우에만 실행
node scripts/engine-v2/build-map-assets.mjs --source ne_50m_land.geojson --coastline ne_50m_coastline.geojson --check
```

`benchmark:scene:repeatability`는 로그인된 Codex 구독의 text turn을 실제로 사용하므로 시간과 text
사용량이 든다. 그러나 장면 thread의 도구 기능을 끄고 결과 보고서에서 image/tool call 0을 검사한다.
`benchmark:image`와 `test:image`는 실제 원격 이미지 생성 경로이므로 이 문서의 fast-scene 재현
검증과 혼동하지 않는다.

## 10. 결과와 실패/교정 이력

- 최종 실행 JSON: `docs/engine-v2/benchmarks/fast-scene-repeatability.v1.json`
- 사람이 읽는 보고서: `docs/engine-v2/benchmarks/FAST_SCENE_REPEATABILITY.md`
- 최초 실패 raw 응답/정확 요청/시간/hash:
  `docs/engine-v2/benchmarks/fast-scene-correction-history.v1.json`
- 교정 요약: `docs/engine-v2/benchmarks/FAST_SCENE_CORRECTIONS.md`
- 로컬 자산 57회 결과/보고서:
  `docs/engine-v2/benchmarks/local-asset-zero-roundtrip.v1.json`,
  `docs/engine-v2/benchmarks/LOCAL_ASSET_ZERO_ROUNDTRIP.md`

최종 고정 결과는 9개 유형×3회, 총 27회다. 모두 Luna/low/priority의 독립 ephemeral scene
thread를 사용했고 27/27 구조 gate 통과, imageGeneration 0회, 예상 밖 tool 0회, compiler
warning/error 0이었다. 현재 `prompt@7/catalog@5` 전체 재실행 중앙값은 total 7,196.36 ms,
model 6,922.49 ms, local compile 0.836 ms다.

최초 sweep는 렌즈/거울과 particle panel flow가 각각 0/3으로 실패했다. 전자는 평면거울을 일반
선으로 축약했고, 후자는 모티프 프롬프트에 particle `state/count` 계약이 빠져 모두 gas 기본값이
되었다. 최소 프롬프트/계약 수정 뒤 실패한 두 사례만 재실행하여 각각 3/3이 되었다. 성공 결과로
덮어쓰지 않은 최초 6개 raw 응답은 위 correction history에 남아 있다.

카탈로그 확장 뒤 다시 실행한 sweep에서는 모델이 루트와 모티프 옵션에 같은 artboard를 중복해
회로·도르래가 0/3이 되었고, 한 용기 장면은 오른쪽 경계를 넘었다. 동일 artboard 중복만
정규화하고 서로 다른 값은 계속 거부하도록 컴파일러를 하드닝했으며, 고정 fixture 요청의 여백을
명시했다. 이 실패 응답과 교정 전 측정도 별도 `fast-scene-correction-history.v1.json`에 보존한 뒤
`prompt@7/catalog@5` 전체 27회를 새로 통과시켰다.

strict local asset은 19개 문법×3회, 총 57회가 모두 match·compile·diagram invariant를 통과했다.
모델/imageGeneration/예상 밖 도구 호출은 0회였고, 생산 경로의 match+expand+compile 중앙값은
0.7255 ms였다. 이 수치는 UI 렌더링 시간을 제외한 로컬 엔진 시간이며 임의 표현, 참고 이미지,
손그림 또는 raster 품질을 보증하지 않는다.

## 11. 현재 검증된 것과 아직 주장할 수 없는 것

### 현재 증거로 말할 수 있는 것

- 설명 기반의 9개 fast-scene 유형은 고정 benchmark에서 각각 3/3으로 유효·지원 가능 JSON과
  요구 구조를 만들었다.
- 그 27회에서 이미지 생성과 예상 밖 도구 호출은 0회였다.
- 장면 로컬 컴파일은 모델 응답에 비해 무시할 수 있을 정도로 짧았다.
- exact cache key, TTL/LRU/용량 제한, 원격 입력 계획, crop/contact sheet, 전송 축소는 순수 모듈
  테스트가 있다.
- strict illustration 두 계열은 결정적 코드 네이티브 장면과 편집 그룹으로 테스트되었다.
- 지도 runtime과 네 변형이 구현되어 있고 고정 출처·결정성·clipping·compile·normalizer 검사가
  11/11 통과했다. 이는 승인한 네 물리 해안선 변형에만 해당한다.
- strict local asset 19개 안전 문법은 57/57 통과했고 모델·이미지·도구 호출이 모두 0회였다.
- 실제 Electron AI 패널에서 지도 1종과 고정 장치 5종을 연속 실행한 스모크에서도
  `codex:send` 호출이 0회였으며, 패키징된 실행 파일에서도 같은 결과를 확인했다.

### 아직 말하면 안 되는 것

- 엔진 V2 전체가 사용자의 85점 평가 기준과 전체/입력별/과목별 목표 통과율을 달성했다는 주장.
- 36개 개발+24개 최종 검증 세트가 동결 절차를 지켜 전부 완료되었다는 주장.
- 참고 이미지 변환과 손그림+설명 입력이 구조·비율·과학 정확도를 정량적으로 확보했다는 주장.
- fast-scene의 스키마 통과가 곧 과학적 정확성 또는 평가원식 85점 이상이라는 주장.
- raster fallback의 품질·지연이 일정하거나 서버 혼잡과 무관하다는 주장.
- 라우팅 감사의 700/936(74.8%) 잠재 후보 비율이 실제 생성 통과율이라는 주장.
- generic coastline, strict spacecraft/student asset 또는 provenance-locked hand wrapper가 임의의
  실제 지도·사람·손·차량 삽화를 안전하게 대신한다는 주장.

새 세션은 이 경계를 유지하면서 새로운 사례를 추가하고, 실패가 나오면 최종 검증 세트를 학습에
사용하지 말고 개발 사례의 프롬프트·컴파일러·모티프 또는 평가 절차에 원인을 반영해야 한다.
