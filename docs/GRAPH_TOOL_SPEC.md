# 평가원 그래프 도구 명세 (feat/graph-tool)

작성 근거: 기출 물리 그래프 26장(`graph_reference/`) 분석 + 사용자 요구 17항 + 기존 코드 인프라 정밀 조사(서브에이전트 3종).
목표: **정확한 평가원식 그래프를 쉽게 그린다.** 데이터 자료변환(수치 산점도)은 특수 케이스였고, 본체는 "축 틀 + 라벨 + 스타일 있는 선 몇 개 + 표시점/안내선"이다.

---

## 0. 대원칙 (기출에서 도출)

- 대부분의 그래프는 **정확한 수치가 없다.** 틀을 그리고 각 부분에 **물리량 라벨(t₀, 2t₀, v₀…)** 을 직접 넣는다. 숫자 눈금이 오히려 특수 케이스.
- **점선 격자는 옵션.** 더 흔한 건 "특정 점 → x·y축으로 수선의 발(투영 안내선)".
- **직선·꺾은선이 함수 곡선보다 흔하다.** 여러 계열을 겹쳐 그린다(실선/점선 구분 + 선끝 라벨).
- 축 형태 3종: **ㄴ자(1사분면) / ㅏ자(반십자: x는 0부터, y는 ±) / 십자(공간좌표)**. 음수가 있어도 x축은 왼쪽으로 안 뻗는 경우가 많다(ㅏ자).
- 라벨: **한글=기본 정자체, 영문 변수=이탤릭 수식체**(한 문자열 안에서 혼용). 줄바꿈·분수·첨자 가능. 라벨이 선 위에 뜨고 얇은 흰 테두리로 선을 부드럽게 끊는다.
- 원점 문자: 데이터/개형 그래프는 **"0"**, 공간 좌표평면만 **"O"**.

---

## 1. 아키텍처 결정 (되돌리기 비싼 결정 — 확정 필요)

**새 객체 타입을 만들지 않는다. 기존 `coordplane`(축 프레임) + `funcgraph`(계열)를 확장한다.**

근거(조사 결과):
- `coordplane`은 축 형태(cross/quadrant/single)·labelX/Y/Origin·grid·ticks·박스 리사이즈·저장/로드를 이미 보유(`render/coordplane.js`, `project-io.js:170`).
- `funcgraph`는 **같은 `planeId`를 공유하는 여러 개가 이미 겹쳐 렌더**된다. `insertFunctionGraphs`가 이미 다계열을 한 번에 커밋(`function-graph/insert.js:83`). per-object `strokeWidth/dashLength/strokeLevel` 존재 → 계열별 스타일이 이미 가능.
- 이 방식이면 "그래프 도구"와 "함수 입력"이 **애초에 같은 객체**라 나중 통합이 공짜.
- 새 타입은 markers/guides에만 필요할 수 있으나, 선례(data-plot)는 **표준 `node`(점)·`line` 객체를 worldFromMath로 배치**해 render/pick/transform/save 무수정으로 재사용.

### 확장 지점 요약
| 대상 | 현재 | 확장 |
|---|---|---|
| coordplane | axisVariant cross/quadrant/single, labelX/Y/Origin(LaTeX 유사) | ㄴ/ㅏ 정확화, `gridMode`(none/box/full), 눈금을 `{pos,label}` 목록으로(커스텀 라벨), 라벨 혼합폰트+멀티라인+수식, 원점 0/O, 데이터-끝 범위 |
| funcgraph | expr+baked points[], stroke/dash | `sourceKind`("expr"｜"points"), 수동 `mathPoints[]`(재베이크 가능), `curveStyle`("smooth"｜"straight"｜"step"), 선끝 `label`/`labelShow` 배선, 구간 화살표 |
| markers | (없음) | `node` 점 객체 + `planeId` + `graphRole:"marker"`, worldFromMath 배치 |
| guides | (없음) | `line`(점선) 객체 + `planeId` + `graphRole:"guide"`, 점→각 축 수선 |

> ⚠️ 조사 gotcha: `funcgraph.points[]`는 **월드 mm로 구운 캐시**다. 평면 range 변경 시 재샘플은 `plane-modal.js`/`section-funcgraph.js`에서만 일어나고 **캔버스 드래그 리사이즈에는 미구현**(백로그). 수동 points 계열은 `mathPoints[]`(수학좌표 원본)를 저장해 재베이크 가능하게 한다. 그룹 이동(translate)은 points가 같이 옮겨져 문제없음.

---

## 2. 객체 모델 (확장 스키마)

### coordplane (확장)
```
axisVariant: "quadrant"(ㄴ) | "halfcross"(ㅏ, 신규) | "cross"(십자)
   ㄴ: x·y 모두 0부터. y이름=화살표 좌측, x이름=화살표 하단, 원점 라벨 좌하단
   ㅏ: x는 0부터 오른쪽만, y는 위아래. 원점 라벨은 원점 "좌측"
gridMode: "none" | "box"(데이터 사각형까지 격자) | "guides-only"
box: 데이터 끝까지 타이트(기본). 좌·하단 여백 0. 정의역 확장은 수동
ticks: [{ pos:number, label:string|null, show:bool }]  // 자동(숫자) 또는 커스텀(t₀)
originLabel: { text:"0"|"O"|커스텀, show:bool }
labelX / labelY: { text(멀티라인·수식·혼합폰트), show:bool }   // 라벨별 on/off
1:1 정사각 기본, 리사이즈로 비율 조정
```

### funcgraph (확장 = "계열")
```
sourceKind: "expr" | "points"
expr, domainMin/Max        // sourceKind==expr
mathPoints: [{x,y}]        // sourceKind==points (수학좌표 원본, 재베이크용)
points: [{x,y}]            // 렌더용 baked world-mm (양쪽 공통)
curveStyle: "smooth"(Catmull) | "straight"(직선분) | "step"(계단)
strokeLevel, strokeWidth(축보다 두껍게 기본), dashLength/Gap(실선/점선)
endLabel: { text, show }   // 선끝 라벨(수식 가능)
segmentArrows: [{ fromIdx, toIdx, style }]  // 구간 화살표(중간2/끝2, 직선도구 옵션 체계)
markerXs: [number]         // 표시점 정의역 목록 → ● 자동 배치
```

### markers / guides (표준 객체 재사용)
```
node(점): worldFromMath(plane, x, y)로 배치, graphRole:"marker", planeId
line(안내선): 점 → x축/y축 수선(점선), graphRole:"guide", planeId, 축쪽 라벨 옵션
```

---

## 3. 라벨 렌더러 (신규 공용 헬퍼 — 가장 큰 단일 빌드)

조사 결론: **혼합 폰트+멀티라인+수식+halo를 한 번에 하는 기존 함수는 없다. 조합해야 한다.**
- 한글/라틴 세그먼터 신설(유니코드 범위, `splitRomanRuns` 방식): 한글런 vs 라틴/수식런 교대 분해
- 한글런 → 정자 `OBJECT_LABEL_TEXT_FONT_FAMILY`
- 라틴/수식런 → `formula.js`의 `parseFormula`+`layout`(첨자·분수·그리스·함수정자·숫자정자) — advance를 `layoutRow`처럼 좌→우 누적
- 멀티라인: `\n` 분해 후 dy=fontSize*1.2~1.4 (formula.js는 멀티라인 미지원 → 줄 단위로 감싸기)
- halo: 모든 결과 `<text>`에 `paint-order:stroke; stroke:white; stroke-width:size*0.16; stroke-linejoin:round` (기존 `makeUprightLabel` 방식) → 라벨이 선 위에서 깔끔히 끊김
- z-order: 라벨을 계열보다 **뒤(later sibling)** 에 append → 위에 그려짐

→ `renderGraphLabel(text, {x,y,anchor,baseline,size,color})` 헬퍼로 만들어 축이름·눈금·선끝·원점·안내선 라벨 전부가 공유.

---

## 4. 증분 계획 (Phase)

**Phase 1 — 축 틀 정확화 (골격, 라벨러 포함)**
- axisVariant ㄴ/ㅏ/십자 정확 렌더 + 라벨 위치 규칙(ㄴ: y좌상/x우하, ㅏ: 원점 좌측)
- gridMode(none/box) + 격자를 데이터 사각형까지만(꼬리 제거)
- 눈금 라벨 간격 대칭·타이트, 원점 0/O + 위치
- **혼합폰트+멀티라인+수식 라벨 렌더러**(§3) — 축이름/원점/눈금에 적용, 라벨별 on/off
- → 이것만으로 기출 26장 중 ~17장의 "빈 틀"이 정확해짐

**Phase 2 — 계열**
- 수동 points 계열(직선·꺾은선) 1급 지원 + 다계열 겹치기
- 계열별 실선/점선, 직선/계단/곡선, 선끝 라벨
- 함수식 계열은 기존 sampler 재사용해 흡수

**Phase 3 — 점 기능**
- 표시점(정의역 x → ● 자동), 투영 안내선(점 → 축 점선 + 축 라벨), 구간 화살표(중간2/끝2)

**Phase 4 — 완성도**
- 라벨 우선 z-order/halo 정착, 커스텀 눈금 라벨, 정의역 확장, 축 생략 ≈, 범례 박스

---

## 5. 기존 기능과의 관계
- 함수 입력(F) → 이 도구의 "expr 계열"로 흡수(추후).
- 데이터 자료변환(5E_hub의 v0.54.27) → "points/수치 계열"로 흡수(추후). 그동안 만든 그리드 입력·미리보기·그룹화·재편집 로직 재활용 가능. **당장은 5E_hub에 그대로 두고 건드리지 않음.**

## 6. 저장/그룹/undo 계약 (반드시 준수)
- 삽입/편집은 `state.update` 안에서 undo 스냅샷 1개(`JSON.parse(JSON.stringify(st.objects))` → undoStack, redoStack=[]).
- 그룹: 생성 객체 전부에 공유 `groupId` + `s.groups.push({id,memberIds})` (전체선택 리사이즈 조건 = 선택 전부 동일 groupId).
- 저장: `project-io.js:migrateObjectList`에 신규 필드 백필 추가. points[]는 그대로 신뢰(로드 시 재샘플 안 함).
- 공유 모듈 import는 앱과 동일 `?v=` 유지(state 싱글턴).
