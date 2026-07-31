# 생명과학 부품 구현 명세 (BIO_PARTS_SPEC.md)

> 2026-07-31 착수. 근거: `docs/SURVEY_bio_20260731.md` (기출 69장 조사) + 인터랙티브 시안 승인.
> **표(`data_table`)는 대상에서 제외한다** — 사용자 결정.
>
> 이 문서는 **구현 중 규격이 갈리지 않게 하기 위한 정본**이다. 렌더러·인스펙터를 각자
> 만들더라도 필드 이름과 기본값은 여기서만 가져온다.

## 진행 상태 (2026-07-31)

| 부품 | 상태 | 확인한 것 |
|---|---|---|
| `brace` 중괄호 | ✅ 완료 | 팔레트→드래그 생성·렌더·인스펙터·저장/열기 |
| `chromosome` 염색체 | ✅ 완료 | 위 + 상동쌍·라벨 4칸·채우기 무늬 |
| `bilayer` 인지질 이중층 | ✅ 완료 | 위 + 단백질 자리 비우기 |
| `neuron` 뉴런 | ✅ 완료 | 위 + 자극 지점·거리 치수선 |
| `legend` 범례 | ✅ 완료 | 위 + 그래프 모달 범례와 같은 모양 |
| `pedigree` 가계도 | ✅ 완료 | 위 + 직각 세대선·번호·발현/보인자 채우기 |
| `dashPattern` 일점쇄선 | ✅ 완료 | 프리셋 2종 추가, 기존 2값 점선과 상호배타 |
| 막대그래프 계열 | ⏳ 작업 중 | |
| 좌우 이중 y축 | ⏳ 대기 | 막대그래프와 같은 파일을 고쳐서 순차 진행 |
| 세포 모식도 자산 | ⛔ 보류 | **생명과학 기출 PDF 원본이 없어 600dpi 크롭 불가.** 조달 방법은 사용자 결정 대기 |

**표(`data_table`)는 사용자 지시로 대상에서 제외했다.**

---

## 0. 공통 규칙 (전부 지킬 것)

- **버전 문자열을 올리지 않는다.** 모든 import 는 `?v=1.3.0` 그대로 쓴다.
- 선 굵기 기본값은 `DEFAULT_STROKE_WIDTH`(0.35). 렌더러는 `obj.strokeWidth ?? 0.35`.
- 색은 `grayHex(obj.strokeLevel ?? 0)`. 검정 하드코딩 금지.
- 새 파일은 `js/render/<type>.js` 와 `js/inspector/section-<type>.js` 두 개.
  **다른 파일은 건드리지 않는다**(공용 배선은 따로 처리한다).
- 렌더러는 반드시 3개를 export: `render<Type>(obj)` · `<type>BBox(obj)` · (p1/p2 계열은)
  `<type>Points(obj)` 또는 기하 계산 함수. `js/render/groundarc.js` 가 표준 본보기다.
- 인스펙터는 `js/inspector/section-groundarc.js` 의 `selected()` / `commit()` / `sync()`
  3함수 패턴을 그대로 따른다.

---

## 1. `brace` — 중괄호  (p1/p2 계열)

구획을 묶는 큰 중괄호. p1→p2 가 묶는 구간이고 꼭짓점은 그 선의 **수직 방향**으로 나온다.

```js
{
  type: "brace",
  p1: {x, y}, p2: {x, y},   // 묶는 구간의 양 끝
  depth: 5,                  // 꼭짓점이 튀어나온 깊이(mm)
  flipSide: false,           // 꼭짓점이 반대쪽을 향한다
  label: "", showLabel: false,   // 꼭짓점 바깥에 붙는 글자
  labelType: "label",        // "label"(정체) | "quantity"(이탤릭)
  strokeLevel: 0, strokeWidth: 0.35, rotation: 0,
  locked: false, positionLocked: false, layerId: 1, order: 0,
}
```

**경로** — p1→p2 를 축으로 하고, 축의 법선 방향 n 으로 depth 만큼. `q = min(depth, len/5)`:

```
M p1
Q (p1 + n·d/2)            → (p1 + n·d/2 + t·q)
L (mid + n·d/2 - t·q)
Q (mid + n·d/2)           → (mid + n·d)      ← 꼭짓점
Q (mid + n·d/2)           → (mid + n·d/2 + t·q)
L (p2 + n·d/2 - t·q)
Q (p2 + n·d/2)            → p2
```
`t` = p1→p2 단위벡터, `n` = t 를 90° 돌린 것(`flipSide` 면 부호 반전).

라벨은 꼭짓점에서 n 방향으로 3.4mm 더 나간 자리에 놓는다.

---

## 2. `chromosome` — 염색체  (p1/p2 계열)

**X자가 아니다.** 모서리 둥근 막대(캡슐) 2개가 나란히 붙고, 동원체는 같은 높이의 검은 점.

```js
{
  type: "chromosome",
  p1: {x, y}, p2: {x, y},   // 위 끝 · 아래 끝 (길이·기울기가 여기서 나온다)
  chromatidWidth: 3,         // 캡슐 하나의 굵기(mm)
  chromatidGap: 1.6,         // 두 캡슐 사이 간격(mm)
  centromere: 0.32,          // 동원체 높이 (0 = p1 쪽, 1 = p2 쪽)
  fillStyle: "solid",        // "solid"(흰) | "gray" | "hatch" | "cross"
  fillLevel: 255,
  homologPair: false,        // 상동쌍으로 2벌 배치
  pairGap: 20,               // 쌍 사이 간격(mm) — homologPair 일 때만
  labelLeft: "", labelRight: "",       // 첫 벌의 좌·우 라벨
  labelLeft2: "", labelRight2: "",     // 둘째 벌(상동쌍)
  showLabels: true,
  strokeLevel: 0, strokeWidth: 0.35, rotation: 0,
  locked: false, positionLocked: false, layerId: 1, order: 0,
}
```

- 캡슐은 `rx = chromatidWidth/2` 인 둥근 사각형. 축(p1→p2)에 맞춰 회전한다.
- 동원체 점 반지름 = `min(0.62, chromatidWidth/3.4)`, 두 캡슐 각각에 하나씩.
- 라벨은 기울기와 무관하게 **가로로** 쓴다(기출 관례). 위치는 캡슐 바깥 좌·우, 높이는 0.66 지점.
- 라벨 글꼴은 이탤릭(대립유전자는 물리량 취급).

---

## 3. `bilayer` — 인지질 이중층  (p1/p2 계열)

머리 원 + 두 갈래 꼬리 유닛의 좌우 반복. p1→p2 가 막이 뻗는 방향(막의 중심선).

```js
{
  type: "bilayer",
  p1: {x, y}, p2: {x, y},   // 막의 왼쪽 끝 · 오른쪽 끝 (중심선)
  unitCount: 14,             // 인지질 개수(한 층당). 균등 배치
  thickness: 7,              // 막 두께(mm) — 위층 머리 중심 ~ 아래층 머리 중심
  headRadius: 1.05,          // 머리 원 반지름(mm)
  proteins: [                // 막단백질. 자리를 자동으로 비운다
    { at: 0.5, width: 6 }    // at = 0~1 (p1→p2 비율), width = 폭(mm)
  ],
  labelOuter: "", labelInner: "",   // 막 바깥·안쪽 글자 (빈 문자열이면 안 그림)
  strokeLevel: 0, strokeWidth: 0.35, rotation: 0,
  locked: false, positionLocked: false, layerId: 1, order: 0,
}
```

- 유닛 간격 = 막 길이 / (unitCount - 1). 단백질 구간(`at ± width/2 + 1mm`)에 걸린 유닛은 **건너뛴다**.
- 꼬리는 머리에서 막 안쪽으로 뻗는 짧은 곡선 2개, 굵기는 본선의 0.8배.
- 단백질은 `rx = width*0.34` 인 둥근 사각형, 회색(`#d9d9d9`) 채우기, 막보다 위아래로 1.4mm씩 삐져나온다.

---

## 4. `neuron` — 뉴런  (p1/p2 계열)

```js
{
  type: "neuron",
  p1: {x, y},                // 신경세포체 중심
  p2: {x, y},                // 축삭 말단
  somaRadius: 3.4,           // 세포체 반지름(mm)
  dendrites: 5,              // 가지돌기 수 (세포체 반대쪽에 부채꼴로)
  terminals: 3,              // 축삭 말단 분기 수
  showStim: false,           // 자극 지점 표시
  stimAt: 0.45,              // 자극 지점 (0 = 세포체, 1 = 축삭 끝)
  stimLabel: "자극",
  showStimDistance: true,    // 세포체~자극 지점 점선 + 거리 라벨
  distanceLabel: "d",
  strokeLevel: 0, strokeWidth: 0.35, rotation: 0,
  locked: false, positionLocked: false, layerId: 1, order: 0,
}
```

- 축삭 = p1 에서 somaRadius 만큼 떨어진 점부터 p2 까지 직선.
- 세포체 = 흰 채움 원 + 안쪽에 회색 핵 원(반지름 0.34배).
- 가지돌기 = 축 반대 방향 부채꼴(±68°)로 뻗는 선 + 끝에서 두 갈래.
- 말단 = p2 에서 부채꼴로 뻗는 짧은 선 + 끝에 작은 점.
- 자극 표시 = 축 아래에서 위로 찌르는 화살표 + 라벨, 거리 점선은 축 위쪽.

---

## 5. `legend` — 범례 블록  (크기박스 계열)

```js
{
  type: "legend",
  x, y, w, h,                // 크기박스 (이동·리사이즈 자동 상속)
  items: [                   // 견본 + 설명
    { sample: "solid", text: "A의 이동" },
    { sample: "dash",  text: "B의 이동" }
  ],
  direction: "vertical",     // "vertical" | "horizontal"
  border: true,              // 테두리 상자
  padding: 2.4,              // 안쪽 여백(mm)
  sampleWidth: 8,            // 견본 선 길이(mm)
  fontSize: 2.8,
  strokeLevel: 0, strokeWidth: 0.35, rotation: 0,
  locked: false, positionLocked: false, layerId: 1, order: 0,
}
```

`sample` 허용값: `solid` · `dash` · `dot` · `dashdot` · `arrow` · `gray`(회색 네모) · `hatch` · `marker`(●)

내용이 상자보다 크면 넘치게 두지 말고 **상자에 맞춰 줄 간격을 계산**한다
(줄 높이 = (h - padding*2) / 항목수).

---

## 6. `pedigree` — 가계도  (크기박스 계열)

```js
{
  type: "pedigree",
  x, y, w, h,                // 크기박스. 그림은 이 상자 안에 맞춰 그린다
  gen2Kids: 3,               // 2세대 자녀 수
  gen3Kids: 2,               // 3세대 자녀 수 (0이면 3세대 없음)
  gen3Parent: 0,             // 3세대를 낳는 2세대 자녀의 순번(0부터)
  symbolRadius: 2.6,         // 기호 반지름(mm)
  showNumbers: true,         // 기호 아래 번호
  affected: "",              // 발현 개체 번호. 쉼표로 ("1,4,6")
  affectedFill: "hatch",     // 발현 개체 채우기: hatch | cross | gray | solid
  carrier: "",               // 보인자 번호. 쉼표로
  carrierFill: "gray",
  strokeLevel: 0, strokeWidth: 0.35, rotation: 0,
  locked: false, positionLocked: false, layerId: 1, order: 0,
}
```

- 번호는 **그리는 순서대로** 1부터: 1세대 부부(1,2) → 2세대 자녀들 → (3세대가 있으면)
  2세대 배우자 → 3세대 자녀들.
- 남·여는 번갈아(짝수 순번 = 네모). 1세대는 남(네모)·여(원) 고정.
- **세대선은 직각 꺾임만.** 부부는 수평선, 중점에서 수직선, 형제선(수평) 후 각 자녀로 수직선.
- 전체가 x,y,w,h 안에 들어가도록 배치를 계산한다(세대 3줄 균등, 형제는 가로 균등).

---

## 7. 그 밖 (공용 배선 쪽에서 처리 — 새 파일 없음)

| 것 | 어디 |
|---|---|
| `dashPattern` 일점쇄선 | `js/render/core.js` `applyDash()` + `inspector/widgets.js` 프리셋 + `section-line.js` |
| 막대그래프 계열 | `js/graph/graph-modal.js` + `js/render/coordplane.js` |
| 좌우 이중 y축 | `js/render/coordplane.js` + `js/graph/graph-modal.js` |
| 세포 모식도 자산 | `js/svg-assets.js` 레지스트리 |

---

## 8. 공용 배선 체크리스트 (새 타입 1개당)

`docs/HANDOFF_atlas_20260731.md` 조사 결과 = 13파일 17지점. 빠뜨리면 **조용히** 깨진다.

1. `js/object-types.js` — `OBJECT_TYPE_IDS` + 분류 플래그 행
2. `js/render/<type>.js` — 렌더러 (신규)
3. `js/render.js` — 재export
4. `js/render/scene.js` — import · `renderObject()` switch · `singleObjBBox()` · 선택 가이드 목록
5. `js/pick.js` — import · `hitTest` 분기 · bbox 분기
6. `js/transform.js` — **p1/p2 리터럴 4벌** (212 · 228 · 359 · 412행)
7. `js/tools.js` — `SYMBOL_TOOLS` · `SHAPE_TYPE` · `isCommittable` · `makeShape` · 팩토리
8. `js/inspector/section-<type>.js` (신규) + `js/main.js` import·init
9. `js/templates.js` — 팔레트 등록 (`category: "생명"`)
10. `js/subject-objects.js` — 생명 과목 `cats` 배열 (지금 "준비 중입니다" 자리)
