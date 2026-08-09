# Engine V2 코드 네이티브 모티프 카탈로그

기출 전수 조사에서 확인한 정형 공백 중, 글자 없는 평가원식 선화로 안전하게 만들 수 있는
항목만 `js/ai-motif-catalog.js`에 구현했다. 모든 모티프는 `5e-fast-scene@1` 장면으로 먼저
확장되고 `ai-scene-fastpath.js`를 거쳐 기존 5E 네이티브 객체가 된다. DOM, 이미지 서버,
추가 API 호출은 사용하지 않는다.

## 구현 범위

| 모티프 ID | 감사 출현 | 생성 구조 | 그림형 안전 조치 |
|---|---:|---|---|
| `panel_flow` | 22 | 2~5개 용기·입자 상자·빈 상자의 균등 배열과 전환선 | 전환선에 화살촉·캡션 없음 |
| `dual_axis_plot` | 9 | 공용 x축, 좌우 y축, 무문자 눈금, 좌·우 스케일 계열 | 축 이름·눈금 숫자·범례 없음 |
| `orthogonal_wiring` | 아래 5건과 공유 | 명시 노드·edge의 수평/수직 라우팅 | 단자 이름·전류 화살표 없음 |
| `diagonal_wiring` | 직교/대각 합계 5 | 직접 또는 경유점 기반 대각 배선 | 단자 이름·전류 화살표 없음 |
| `contour_bundle` | 6 | 중첩 또는 평행 등치선 묶음, 사용자 지정 경로 | 인라인 값·지역 이름 없음 |
| `coastline_schematic` | 정확 지도 14건에는 미산입 | 반도·만·섬이 있는 일반 해안선 스케치 | `intent:'schematic'` 필수, 지명 입력 거부 |

중복을 제거하면 이번 카탈로그가 직접 닫는 벡터 안전 blocker 후보는 **42건**이다.
`panel_flow` 22 + `dual_axis_plot` 9 + 배선 5 + `contour_bundle` 6의 합이다.

지도 14건은 이 수에 넣지 않았다. 한반도·동아시아·태평양·세계 윤곽은 정확한 검증 SVG나
기출 크롭이 있어야 한다. 일반 해안선은 “육지와 바다가 만나는 임의의 경계”가 필요한
문항용 scaffold일 뿐 실제 지역을 대신하지 않는다. `region`이나 `geography`를 넘기면
카탈로그가 즉시 거부하도록 했다.

사람·차량·손 삽화와 말풍선도 넣지 않았다. 자세와 접촉점이 중요한 삽화를 임의의 도형으로
대체하지 않으며, 그림형에서 말풍선 텍스트나 화살표가 생길 여지도 만들지 않는다.

## 인터페이스

```js
import {
  listAiMotifs,
  createAiMotifScene,
  compileAiMotif,
  expandAiMotifScene,
  compileFastSceneWithMotifs,
} from "./js/ai-motif-catalog.js";

const available = listAiMotifs();

const scene = createAiMotifScene("panel_flow", {
  panelCount: 3,
  vesselKind: "beaker",
  states: [{ liquid: 0.2 }, { liquid: 0.5 }, { liquid: 0.8 }],
});

const compiled = compileAiMotif("dual_axis_plot", {
  xRange: [0, 10],
  leftRange: [0, 5],
  rightRange: [0, 100],
  leftSeries: [{ points: [[0, 0], [5, 4], [10, 2]] }],
  rightSeries: [{ points: [[0, 80], [5, 20], [10, 60]] }],
});

if (!compiled.supported) {
  // 기존 raster fallback으로 넘긴다.
}
```

Luna는 반복 장치를 길게 나열하는 대신 아래의 고수준 shortcut 하나를 scene의 유일한
element로 반환할 수 있다.

```json
{
  "schema": "5e-fast-scene@1",
  "mode": "diagram",
  "artboard": { "w": 160, "h": 90 },
  "elements": [
    {
      "type": "motif",
      "motif": "panel_flow",
      "options": { "panelCount": 3, "vesselKind": "beaker" }
    }
  ]
}
```

`expandAiMotifScene(sceneOrJson)`은 이 요청을 일반 fast-scene element들로 펼친다. 이미 일반
fast-scene이면 객체를 복제하거나 변경하지 않고 같은 객체를 돌려준다. motif와 수동 element가
섞였거나 motif가 둘 이상이면 안전하게 거부한다. `compileFastSceneWithMotifs()`는 확장과 기존
컴파일을 한 번에 수행하는 진입점이다. JSON 문자열과 `json` 코드 fence도 받을 수 있다.

허용 ID와 최소 options 계약은 `AI_MOTIF_PROMPT_REFERENCE`로 export하며
`ai-scene-prompt.js`가 이를 Luna 지시문에 삽입한다. 고수준 shortcut도 그림형 전용이다.
`complete` mode를 요청하거나 shortcut에 임의 필드를 끼워 넣으면 거부한다.

`compileAiMotif()`은 호출자가 다른 mode를 넘겨도 그림형(`diagram`)으로 고정한다. 반환 객체는
기존 `compileFastScene()` 결과와 같으며 `objects` 배열을 현재 5E 삽입 경로에 그대로 넘길 수
있다. 입력 객체를 변경하지 않고 같은 입력에 항상 같은 geometry를 만든다.

배선은 노드 ID와 edge를 분리해 위상을 명시한다.

```js
const circuit = compileAiMotif("orthogonal_wiring", {
  nodes: [
    { id: "left", at: [-40, -20] },
    { id: "right", at: [40, 20] },
  ],
  edges: [{ from: "left", to: "right", bend: "horizontal-first" }],
  showNodes: true,
});
```

직교 모드에 대각 경유 구간을 주면 자동으로 왜곡하지 않고 오류를 반환한다. 대각 배선이
의도라면 `diagonal_wiring`을 선택해야 한다.

## 그림형 불변식

- 카탈로그가 만드는 scene의 mode는 항상 `diagram`이다.
- `text`, `formula`, `labeler`, 라벨 문자열, 숫자 눈금, 화살촉을 만들지 않는다.
- 사용자가 넘긴 `label`, `text`, `arrow` 옵션은 생성 구조로 전달하지 않는다.
- 회색은 `panel_flow`의 명시적 액체·피스톤·상태 구분이나 사용자가 고른 빈 패널 tone에만
  쓰며 장식 명암을 생성하지 않는다.
- 모든 테스트 fixture는 `auditDiagramObjects()`와 MCP `normalizeObject()`를 모두 통과해야
  한다.

## 검증과 성능

```powershell
node --test tests/test-ai-motif-catalog.mjs
node scripts/engine-v2/benchmark-motif-catalog.mjs 12000
```

2026-08-09 개발 PC에서 6종을 순환해 12,000회 생성·컴파일한 결과는 다음과 같다.

- 총 100,000개 5E 네이티브 객체
- 총 487.86 ms
- 장면당 평균 0.0407 ms
- 가장 큰 fixture인 이중 축은 평균 0.0662 ms
- 12개 자동 테스트 전부 통과

이 수치는 네트워크나 모델 응답 시간을 포함하지 않은 순수 로컬 장면 조립 시간이다. 따라서
카탈로그 자체는 UI 지연의 원인이 되지 않으며, 해당 모티프를 원격 래스터 생성으로 보내는
시간을 없애는 용도로 사용한다.
