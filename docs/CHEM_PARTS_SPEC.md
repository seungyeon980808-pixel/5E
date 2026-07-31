# 화학 부품 구현 명세 (CHEM_PARTS_SPEC.md)

> 2026-07-31 착수. 근거: `docs/PART_FREQUENCY_CHEM.md`(기출 280장 전수 분해) +
> `docs/chem-parts-proposal.html` 인터랙티브 시안 3차 승인.
>
> 이 문서는 **구현 중 규격이 갈리지 않게 하기 위한 정본**이다. 렌더러·인스펙터를 각자
> 만들더라도 필드 이름과 기본값은 여기서만 가져온다.
> 선례는 `docs/BIO_PARTS_SPEC.md`(생명과학 6종) — 같은 방식으로 진행한다.

## 진행 상태 (2026-07-31 — 10종 전부 구현 완료)

| 부품 | 상태 | 확인한 것 |
|---|---|---|
| `vessel` 용기 (kind 9종) | ✅ | 팔레트 9버튼·렌더·인스펙터·저장/재편집 |
| `chemmodel` 원자·모형 (kind 5종) | ✅ | 위 + 분자 20종·격자 4종(절단 포함) |
| `particlebox` 입자 상자 | ✅ | 위 + seed 재현·움직임 표시·위치 섞기 |
| `orbital` 오비탈 (kind 2종) | ✅ | 위 + 아우프바우·훈트 자동 배치 |
| `bondgroup` 구조식 | ✅ | 위 + 분자 8종·다중결합 |
| `chemchart` 막대·원그래프 | ✅ | 위 + 조각별 색 동적 생성 |
| `axisbreak` 축 생략 물결 | ✅ | 위 (물리와 공용) |
| `chemgraph` 에너지·적정·상평형 | ✅ | 위 + 중첩 객체(triplePt) 저장 |
| `electrode` 전극·전지 | ✅ | 위 + 염다리·전구·e⁻ |
| `periodic` 주기율표 | ✅ | 위 + 가상 기호 치환(X·Y) |

**검증 결과** (포트 8615, 캐시 없는 새 오리진):
- 렌더 23종 조합 전부 성공, `NaN`/`undefined` 0건
- 팔레트 버튼 29개 · 빈 아이콘 0개 · 과목 아코디언 6파트 전부 채워짐("준비 중입니다" 제거)
- 팔레트→도구 무장 10/10 · 씬 렌더 10/10 · 인스펙터 자동 표시 10/10
- 저장→재편집 왕복에서 필드 25/25 보존(중첩 객체 포함), 재렌더 5/5

**⚠️ MCP는 재시작이 필요하다.** `tools/mcp-5e`는 실행 시점의 `OBJECT_TYPE_IDS`를 들고 있어,
Claude Code를 재시작하기 전까지 `add_objects`의 타입 enum에 화학 10종이 보이지 않는다
(코드는 `js/object-types.js`를 런타임 import 하므로 재시작만 하면 자동 반영된다).

**버전은 올리지 않았다.** 모든 import는 `?v=1.3.0` 그대로다 — 릴리즈 시점에 한꺼번에 올린다.

### 🐛 이동 불가 버그 — 원인과 수정 (2026-07-31)

**증상**: 새로 만든 부품이 생성은 되는데 **끌어도 움직이지 않았다. 오류도 안 났다.**

**원인**: `js/transform.js` 의 `applyDelta()` 가 타입 이름 15개를 **손으로 나열한 목록**으로
분기하고 있었다. 크기박스로 새로 추가한 타입은 그 목록에 없어 `x/y` 분기에도,
`p1/p2` 분기에도, `points` 분기에도 걸리지 못하고 **아무 일도 하지 않고 함수가 끝났다.**

이것은 `js/object-types.js` 머리말이 경고한 바로 그 패턴이다 —
*"목록 하나를 빠뜨리면 **조용한** 버그가 난다."* 그 파일이 만들어질 때 6개 모듈의
literal 목록을 파생 Set으로 바꿨는데 `applyDelta` 한 곳만 남아 있었다.

**수정**: 리터럴 목록을 파생 Set으로 교체했다.
```js
if (SIZE_TYPES.has(obj.type) || TEXT_MEASURED_TYPES.has(obj.type) ||
    obj.type === "anglearc" || obj.type === "rightangle") {
```

**함께 고쳐진 것**: 생명과학 `legend`·`pedigree` 도 크기박스인데 그 목록에 없어
**같은 버그를 이미 갖고 있었다**(화학 부품을 넣으면서 드러났다). 이제 둘 다 움직인다.

**회귀 없음 확인**: 예전 리터럴 15개가 새 조건에 **15/15 전부 포함**된다(프로그램으로 검증).
새 조건이 추가로 포함하는 것은 `legend`·`pedigree` + 화학 10종뿐이다.

**앞으로**: 크기박스 계열 새 타입은 `object-types.js` 에 행을 추가하는 것만으로 자동으로
움직인다. §12 체크리스트에서 `transform.js` 는 **손댈 것 없음**이 확정됐다.

## 0. 공통 규칙 (전부 지킬 것)

- **버전 문자열을 올리지 않는다.** 모든 import 는 `?v=1.3.0` 그대로 쓴다.
- 선 굵기는 `obj.strokeWidth ?? 0.35`. 색은 `grayHex(obj.strokeLevel ?? 0)`.
  **검정 하드코딩 금지.**
- **10종 전부 크기박스(sizeBox) 계열이다.** 즉 `{x, y, w, h}` 로 저장되고 이동·리사이즈·
  bbox·저장을 앱에서 그대로 물려받는다. p1/p2 계열이 아니므로 `transform.js` 는 손대지 않는다.
- 새 파일은 `js/render/<type>.js` 와 `js/inspector/section-<type>.js` **두 개뿐**.
  **다른 파일은 절대 건드리지 않는다** — 공용 배선(9파일)은 담당이 따로 처리한다.
- 렌더러는 반드시 2개를 export: `render<Type>(obj)` · `<type>BBox(obj)`.
  `<type>BBox` 는 크기박스 계열이므로 `{ x: obj.x, y: obj.y, w: obj.w, h: obj.h }` 를
  그대로 돌려주면 된다(정규화만).
- 렌더러 마지막은 `legend.js` 끝부분과 똑같이 처리한다:
  ```js
  const rot = obj.rotation ?? 0;
  if (rot) g.setAttribute("transform", `rotate(${rot} ${cx} ${cy})`);
  if (obj.opacity != null && obj.opacity !== 1) g.setAttribute("opacity", obj.opacity);
  if (obj.id) g.dataset.id = obj.id;
  return g;
  ```
- 인스펙터는 `js/inspector/section-legend.js` 의 `selected()` / `commit()` / `sync()`
  3함수 패턴을 **그대로** 따른다. `makeSection(제목, body)` 사용, 처음엔 `display:none`.

### 그림 좌표 — 가장 중요

시안(`docs/chem-parts-proposal.html`)의 SVG 코드는 **40×40 또는 52×40 고정 좌표계**로
그려져 있다. 실제 렌더러는 그 좌표를 **`obj.x, obj.y, obj.w, obj.h` 안에 맞춰 넣어야 한다.**

권장 방식 — 시안 좌표를 그대로 쓰되 마지막에 `<g transform>` 으로 맞춘다:

```js
const VB = 40;                       // 시안 좌표계 한 변 (부품마다 다름)
const sx = obj.w / VB, sy = obj.h / VB;
inner.setAttribute("transform", `translate(${obj.x} ${obj.y}) scale(${sx} ${sy})`);
```

단 **선 굵기가 같이 늘어나면 안 되므로**, 이 방식을 쓸 때는 그리는 모든 선에
`vector-effect="non-scaling-stroke"` 를 주거나, 좌표를 직접 계산해 넣는다.
**글자는 스케일에 딸려 찌그러지면 안 된다** — 글자는 변환 밖에서 계산된 절대 좌표로 그린다.

가장 안전한 것은 **좌표를 직접 계산**하는 것이다(`legend.js`·`pedigree.js` 가 그렇게 한다).
시안 코드는 *비율*의 근거로 읽고, 실제 좌표는 `x + w * 비율` 로 만든다.

### 글자

- 화학식·기호(영문·숫자)는 `renderGraphLabel(text, {x, y, size, color, anchor, vAlign, halo:false})`
  를 쓴다(`js/render/graph-label.js`). 아래첨자 `H_2O`·위첨자 `A^{2+}`·분수 `\frac{a}{b}` 가
  이 경로에서 자동 처리된다. **직접 `<text>` 를 만들지 마라.**
- 한글 설명은 같은 함수에 그대로 넣으면 한글체로 나온다.

---

## 1. `vessel` — 용기 가족  (기출 93장 회복, 1순위)

시안 §1. 대기열 1~5위(`vessel_content` 62 · `syringe_piston` 55 · `vessel_round` 41 ·
`glassware` 37 · `stopcock` 22)를 한 타입으로 덮는다.

```js
{
  type: "vessel",
  x, y, w, h,                 // 크기박스
  kind: "box",                // beaker|flask|test_tube|cylinder_graduated|funnel|u_tube|burette|round|box
  liquid: 0.34,               // 액면 높이 0~1 (0이면 액체 없음)
  liquidColor: "#d9dcdf",     // 용액 색 (기출은 무채색)
  hasPiston: true,
  pistonAt: 0.66,             // 피스톤 위치 0~1 (아래=0)
  hasFix: true,               // 고정장치 ▼ 검은 삼각형 (벽이 수직인 kind 에서만)
  hasWeight: false,           // 피스톤 위 추
  hasStopcock: false,         // 위로 뻗는 관 + 꼭지
  hasTicks: false,            // 눈금
  text: "A(g) 2 mol\n1 L",    // 내부 텍스트 (줄바꿈으로 여러 줄)
  textPos: "middle",          // "top" | "middle" | "bottom"
  strokeLevel: 0, strokeWidth: 0.35, rotation: 0,
  locked: false, positionLocked: false, layerId: 1, order: 0,
}
```

- **액체는 용기 안쪽 모양을 따라야 한다.** `<clipPath>` 에 용기 내부 경로를 넣고
  가로로 긴 `<rect>` 를 잘라서 그린다(시안과 같은 방식). 액면선도 같은 클립으로 얇은 rect.
- **피스톤은 가는 회색 띠**다(높이 ≈ 용기 안폭의 6%). 회색 채움 + 위아래 검은 선.
  기출 `c2_2023_11_16` · `c2_2023_06_13` 확인 결과.
- **꼭지**는 관에 끼운 스풀 형태: 가운데 넓은 사각 + 위아래 짧은 플랜지 + 중앙 작은 원 +
  옆으로 뻗은 손잡이 막대와 끝의 작은 원. 시안 `stopcockAt()` 참고.
- `kind` 별 윤곽 경로·내부 경로·안쪽 상자는 시안의 `VK` 테이블에 전부 있다. 그대로 옮기되
  비율로 환산한다.
- 기본 크기(팔레트 드래그 시): 30 × 34 mm.

---

## 2. `chemmodel` — 원자·모형 가족  (기출 33장)

시안 §2-1·2-2·2-3·2-4·2-5 를 한 타입으로 묶는다. `kind` 로 갈래를 나눈다.

```js
{
  type: "chemmodel",
  x, y, w, h,
  kind: "atom",        // atom | shell | lattice | molecule | lewis
  // --- kind:"atom" (원자 구슬) ---
  symbol: "O",
  shade: true,               // 입체 음영(기출 형태). 끄면 평면 회색 원
  // --- kind:"shell" (전자 껍질 모형) ---
  shells: "2,8,2",           // 쉼표로 껍질별 전자 수
  dashedShell: true,
  // --- kind:"lattice" (결정 격자) ---
  cell: "fcc",               // sc | bcc | fcc | graphite
  ballRadius: 2.0,           // 공-막대 보기의 구슬 반지름 (시안 40 좌표계 기준)
  showEdge: true,            // 모서리 (숨은선은 점선)
  cut: false,                // 잘린 보기 = 공간채움 절단면
  // --- kind:"molecule" (분자 모형) ---
  molecule: "H2O",           // 아래 MOLECULES 20종 중 하나
  bondLength: 9,             // 시안 좌표계 기준
  bondAngle: 104.5,
  showGeoLabel: true,        // 아래 한글 이름 + 구조 이름
  // --- kind:"lewis" (루이스 전자점식) ---
  // symbol 재사용. 원자가 전자 수는 VALENCE 표에서 자동
  bracket: false,            // 대괄호 [ ]
  charge: "",                // 오른쪽 위 전하
  strokeLevel: 0, strokeWidth: 0.35, rotation: 0,
  locked: false, positionLocked: false, layerId: 1, order: 0,
}
```

- `MOLECULES` 20종과 각 분자의 `geo`(di|linear|bent|trig|pyr|tet)·리간드·결합차수·
  기본 결합각·한글 이름은 시안의 `MOLS` 상수를 **그대로** 옮긴다. 렌더러에서 export 해서
  인스펙터가 같은 목록을 쓰게 한다.
- `VALENCE` 표(H~Ar 18종)도 시안 그대로 옮겨 export.
- **결합선은 원자 표면에서 시작해 표면에서 끝난다.** 굵기 0.28×비율, 다중결합 간격 1.3×비율.
  결합각 호는 **그리지 않는다**(2차 지적 반영).
- `lattice` 의 잘린 보기: 면 3개(앞 z=0 · 위 y=1 · 오른쪽 x=1)를 아핀 변환한 뒤,
  각 면에 단면 원을 그리고 면 사각형으로 클립한다. 구 반지름은 구조별로 구가 서로 닿는 값:
  `sc = 0.5a` · `bcc = √3a/4` · `fcc = √2a/4`. 시안 `crystCut()` 참고.
- 기본 크기: 30 × 30 mm.

---

## 3. `particlebox` — 입자 상자

```js
{
  type: "particlebox",
  x, y, w, h,
  state: "gas",          // solid | liquid | gas
  count: 14,
  particleRadius: 1.15,  // 시안 좌표계(24폭) 기준 → 비율 환산
  motion: "none",        // none | trail | arrow  (고체에서는 무시)
  particleShape: "circle", // circle | square
  mix: false,            // 2종 혼합(홀수 번째를 진한 사각으로)
  seed: 7,               // 배치 난수 씨앗. 인스펙터의 [위치 섞기]가 이 값을 바꾼다
  strokeLevel: 0, strokeWidth: 0.35, rotation: 0,
  locked: false, positionLocked: false, layerId: 1, order: 0,
}
```

- **난수는 반드시 `seed` 로 재현 가능해야 한다.** `Math.random()` 금지 — 저장했다 열면
  배치가 달라진다. 시안의 `mulberry(seed)` 를 그대로 쓴다.
- 고체는 격자 배치, 액체는 아래쪽에 모이고 액면선 1개, 기체는 상자 전체에 흩어진다.
- 입자끼리 겹치지 않게 배치(재시도 60회).
- 인스펙터에 **[위치 섞기] 버튼**을 둔다 → `commit(t => { t.seed = (t.seed*16807+11) % 2147483647; })`
- 기본 크기: 26 × 26 mm.

---

## 4. `orbital` — 오비탈

```js
{
  type: "orbital",
  x, y, w, h,
  kind: "shape",        // "box"(오비탈 상자) | "shape"(오비탈 모양)
  // --- kind:"box" ---
  electrons: 8,         // 1~18. 아우프바우+훈트로 자동 배치
  showOrbitalLabels: true,
  // --- kind:"shape" ---
  orbital: "pz",        // s | pz | px | py
  showAxis: true,
  showNode: true,       // 마디면 점선
  showSymbol: true,
  strokeLevel: 0, strokeWidth: 0.35, rotation: 0,
  locked: false, positionLocked: false, layerId: 1, order: 0,
}
```

- 상자 순서는 `1s · 2s · 2p(3칸) · 3s · 3p(3칸)`. 한 칸에 하나씩 채운 뒤 짝을 짓는다(훈트).
  위 스핀 = 위로 향한 화살표, 아래 스핀 = 아래로 향한 화살표.
- 오비탈 모양은 **두 로브가 핵에서 만나는 물방울꼴**이다(레퍼런스 확인). 로브가 핵에서
  떨어져 있으면 틀린 그림. 시안 `lobe(len,wid)` 경로를 그대로 쓴다.
- 기본 크기: box 46 × 22 · shape 30 × 30 mm.

---

## 5. `bondgroup` — 구조식  (기출 42장, 2순위)

```js
{
  type: "bondgroup",
  x, y, w, h,
  molecule: "C2H4",     // 아래 BOND_MOLECULES 8종
  bondLength: 8,        // 시안 좌표계 기준
  symbolSize: 3.2,
  showKoreanName: true,
  strokeLevel: 0, strokeWidth: 0.35, rotation: 0,
  locked: false, positionLocked: false, layerId: 1, order: 0,
}
```

- `BOND_MOLECULES` = 시안 `BONDS` 상수 8종(H2O·CO2·N2·C2H2·C2H4·HCHO·NH3·CH3OH).
  각 항목 `{ a: [[기호, 상대x, 상대y], …], b: [[i, j, 결합차수], …], ko }`. 그대로 옮겨 export.
- 원자 기호 뒤에 흰 원을 깔아 결합선을 가린다(시안과 같음).
- 기본 크기: 40 × 26 mm.

---

## 6. `chemchart` — 막대·원그래프  (기출 23장)

```js
{
  type: "chemchart",
  x, y, w, h,
  kind: "bar",              // bar | pie
  values: "3,5,2,4",        // 쉼표
  names: "A,B,C,D",
  // --- bar ---
  xTitle: "물질", yTitle: "양(mol)",
  showGuide: true,          // 눈금값 점선(수선의 발)
  // --- pie ---
  colors: ["#ffffff","#c9c9c9","#8f8f8f","#e4e4e4","#6f6f6f"],  // 조각별
  showRatio: true,          // 하단 비율 표시
  showTick: false,          // 둘레 눈금
  strokeLevel: 0, strokeWidth: 0.35, rotation: 0,
  locked: false, positionLocked: false, layerId: 1, order: 0,
}
```

- 값 개수가 색 개수보다 많으면 색 배열을 순환한다.
- 기본 크기: bar 44 × 34 · pie 32 × 34 mm.

---

## 7. `axisbreak` — 축 생략 물결  (화학 11장 · 물리 7장)

**사선(≈)이 아니라 물결 두 줄**이다(기출 `c2_2024_09_03` 확인).

```js
{
  type: "axisbreak",
  x, y, w, h,           // 이 상자를 가로지르는 띠로 그린다
  dir: "horizontal",    // horizontal(가로로 자름) | vertical(세로로 자름)
  amp: 0.5,             // 물결 진폭(mm)
  gap: 1.6,             // 두 줄 간격(mm)
  period: 3.0,          // 물결 주기(mm)
  strokeLevel: 0, strokeWidth: 0.3, rotation: 0,
  locked: false, positionLocked: false, layerId: 1, order: 0,
}
```

- **두 물결선 사이는 흰색으로 채운다**(아래 그래프를 가린다). 흰 rect → 물결선 2개 순서.
- 기본 크기: 30 × 4 mm.

---

## 8. `chemgraph` — 반응 에너지·적정·상평형 프리셋

```js
{
  type: "chemgraph",
  x, y, w, h,
  kind: "energy",       // energy | titration | phase
  // --- energy (반응 에너지 도표) ---
  reactant: 0.42, product: 0.2, peak: 0.85,   // 0~1 높이
  showCatalyst: false,  // 촉매 곡선(점선)
  showMarks: true,      // Ea·ΔH 화살표
  // --- titration (중화 적정 곡선) ---
  acidType: "sw",       // sw(강산-강염기) | ww(약산-강염기)
  eqVolume: 0.5, eqPH: 7,
  showEqPoint: true,
  // --- phase (상평형 그림) ---
  isWater: true,        // 융해곡선이 왼쪽으로 기움
  triplePt: { x: 0.34, y: 0.3 },
  criticalPt: { x: 0.82, y: 0.82 },
  showRegionNames: true,
  strokeLevel: 0, strokeWidth: 0.35, rotation: 0,
  locked: false, positionLocked: false, layerId: 1, order: 0,
}
```

- 축은 화살촉 달린 2축. 축 이름은 kind 별 고정 문구를 쓴다
  (energy: 반응 경로/에너지 · titration: 넣어 준 염기의 부피/pH · phase: 온도/압력).
- 곡선 식은 시안 `eneSVG` · `titSVG` · `phaSVG` 를 그대로 옮긴다.
- 기본 크기: 44 × 34 mm.

---

## 9. `electrode` — 전극·전지  (기출 8장)

```js
{
  type: "electrode",
  x, y, w, h,
  solution: "KOH(aq)",
  liquidColor: "#c9cdd1",
  depth: 0.62,              // 액면 높이 0~1
  leftLabel: "산화 전극", rightLabel: "환원 전극",
  lampOn: true,             // 전구 빛살
  saltBridge: false,
  showElectronArrow: true,  // e⁻ 화살표
  strokeLevel: 0, strokeWidth: 0.35, rotation: 0,
  locked: false, positionLocked: false, layerId: 1, order: 0,
}
```

- 기출 `c2_2024_09_01`(연료 전지) 형태. 비커 + 용액 + 전극 막대 2개 + 도선 + 전구 + 받침.
- 전극은 위쪽이 액면 위로 나오는 세로 회색 막대(하이라이트 선 1개).
- 라벨은 상자 **아래**에 좌·우로. 기본 크기: 44 × 40 mm.

---

## 10. `periodic` — 주기율표

```js
{
  type: "periodic",
  x, y, w, h,
  periods: 4,            // 2 | 3 | 4  (1~2주기 / 1~3주기 / 1~4주기(K·Ca))
  highlight: "",         // 강조 원소 기호. 쉼표 ("Na,Cl")
  highlightSymbols: "",  // 강조 칸에 대신 넣을 가상 기호 ("X,Y") — 순서대로 대응
  showZ: true,           // 칸 왼쪽 위 원자번호
  metalShade: false,     // 금속 칸 회색
  strokeLevel: 0, strokeWidth: 0.35, rotation: 0,
  locked: false, positionLocked: false, layerId: 1, order: 0,
}
```

- 원소 표 `PERIODIC_ELEMENTS` = 시안 `PT` 상수 20종 `[기호, 원자번호, 주기, 족, 금속여부]`.
  족은 1·2·13~18 만 쓴다(전이금속 없음). 그대로 옮겨 export.
- 강조 칸은 테두리를 굵게 + 연한 파랑이 아니라 **회색 계열**로 칠한다(시험지는 무채색).
  `grayHex(200)` 정도.
- 기본 크기: 52 × 26 mm.

---

## 11. 팔레트 카테고리 (공용 배선 담당이 처리)

`js/templates.js` 의 `category` 문자열과 `js/subject-objects.js` 의 화학 `cats` 는
**글자까지 같아야** 팔레트에 나온다.

| 카테고리 | 들어가는 것 |
|---|---|
| `원자·주기율` | chemmodel(atom·shell·lewis) · orbital(box·shape) · periodic |
| `결합·분자` | chemmodel(molecule·lattice) · bondgroup |
| `실험 기구` | vessel 9종 · electrode |
| `물질의 상태` | particlebox |
| `반응·그래프` | chemchart(bar·pie) · chemgraph(energy·titration·phase) |
| `표시·주석` | axisbreak (생명과 공용 — brace·legend 가 이미 있다) |

## 12. 공용 배선 체크리스트 (새 타입 1개당 — 담당이 일괄 처리)

`docs/BIO_PARTS_SPEC.md` §8 과 동일. 빠뜨리면 **조용히** 깨진다.

1. `js/object-types.js` — `OBJECT_TYPE_IDS` + `OBJECT_TYPES` 행 (`sizeBox:1, boxFace:1`)
2. `js/render/<type>.js` (신규)
3. `js/render.js` — 재export
4. `js/render/scene.js` — import · `renderObject()` switch
5. `js/pick.js` — (크기박스 계열은 `SIZE_TYPES` 가 자동 처리 → 손댈 것 없음)
6. `js/transform.js` — (크기박스 계열은 손댈 것 없음)
7. `js/tools.js` — `SYMBOL_TOOLS` · `SHAPE_TYPE` · `makeShape` 분기 · 팩토리
8. `js/inspector/section-<type>.js` (신규) + `js/main.js` import·init
9. `js/templates.js` — 팔레트 등록 + `iconSampleObject` 아이콘 분기
10. `js/subject-objects.js` — 화학 `parts` 의 `cats`
