# 함수 그래프 + 좌표평면 — 기획 문서 (2026-07-05)

<!-- ===== META ===== -->

| 항목 | 내용 |
|---|---|
| 목적 | "함수 입력 → 좌표평면에 그래프" 기능의 설계·스키마·단계별 구현 계획 확정 |
| 세션 | 기획 전용(Fable). 이 문서 시점에 **코드는 미작성** |
| 기준 브랜치/버전 | `work-dev` / v0.46.0 (구현 시작 버전은 사용자가 지정) |
| 스택 | 바닐라 JS + SVG, 빌드 없음(ES 모듈 직접 로드) — 재논의 없음 |
| 관련 문서 | `docs/HANDOFF_20260704.md`(전체 맥락), `docs/OBJECT_SCHEMA.md`(타입×속성 지도) |
| 확정 상태 | A~G 7개 결정 **사용자 확인 완료**(아래 §2). 열린 질문은 §12 |

> 병렬 `image-dev` 세션과 파일 충돌을 피하기 위해 **새 영역(신규 파일 위주)**으로 설계했다.
> `image-*.js`는 건드리지 않는다.

<!-- ===== 1. OVERVIEW ===== -->

## 1. 개요와 요구사항 매핑

수식(지수·로그·삼각·다항 등)을 입력하면 좌표평면 위에 그래프를 그리고, 시험문제 그림으로
쓸 수 있게 편집·내보내기하는 기능. 요구사항과 구현 단계 배치:

| # | 요구사항 | 단계 | 관련 결정 |
|---|---|---|---|
| 1 | 상용 함수 대부분 지원(지수·로그·삼각·다항) | MVP | D |
| 2 | "함수 입력" 버튼 → 모달 | MVP | E |
| 3 | 모달 미리보기(좌표평면 + 함수 모양 + 스케일 조정) | MVP | C, E |
| 4 | 정의역을 드래그로 한정 | MVP | E |
| 5 | 생성 함수를 곡선처럼 자유 변형 | MVP(곡선 변환) | A |
| 6 | 좌표평면 출력 on/off | MVP | B, F |
| 7 | 한 평면에 함수 여러 개 + 평면 내 모양 조절 | MVP | B, C, A |
| 8 | 점 찍기 → 점선 수선 → 좌표 라벨 | **확장** | G |

<!-- ===== 2. DECISIONS ===== -->

## 2. 확정된 핵심 결정 (A~G) — 되돌리기 비싼 것

### A. 함수의 데이터 모델 — **하이브리드(수식 보존 + 곡선 변환)**
- **결정**: 함수를 `수식 + 정의역 + planeId + 샘플 점 캐시`를 가진 **새 `funcgraph` 타입**으로 저장한다.
  수식으로 태어나므로 재편집·정의역 조정 가능(요구 7). 개별 점을 손으로 주무르고 싶으면
  인스펙터의 **"곡선으로 변환"** 버튼으로 일반 `curve`로 굽는다(한 방향, 요구 5).
- **근거**: 요구 5(자유 변형)와 요구 7(수식 재편집)는 한 객체에 동시 충족이 어렵다. "똑똑한
  함수 객체 + 필요할 때만 곡선으로 굽는 탈출구"로 두 요구를 분리 충족한다.
- **트레이드오프**: 함수 상태와 곡선 상태 2가지를 다뤄야 하고, 곡선→함수 역변환은 없다(수용 가능,
  동작이 명확). funcgraph는 개별 점 핸들이 없다(수식 구동) — 점 편집은 곡선 변환 후.

### B. 좌표평면과 함수의 관계 — **평면 독립 + 함수가 id로 참조**
- **결정**: 좌표평면을 **새 `coordplane` 타입**(수학 좌표계를 소유)으로 만들고, 각 함수는
  `planeId`로 그 평면을 참조한다. 한 평면에 여러 함수 = 같은 `planeId` 공유(요구 7).
  기존 그룹(`groupId`)과 동일한 **느슨한 id 결합** — 플랫 배열 아키텍처에 자연스럽다.
- **평면 출력 on/off(요구 6)**: 평면의 공통 필드 `exportable`를 토글. 평면을 내보내기에서 빼도
  함수 객체는 자기 점을 갖고 독립 렌더되므로 "함수만 출력"이 성립한다.
- **기존 `axes`와의 관계**: `axes`(순수 장식 십자축)는 **그대로 두고**, `coordplane`을 별도 신설한다.
  기존 저장 파일 호환을 깨지 않기 위함. (장기적으로 축 병합 여부는 §12 열린 질문.)
- **트레이드오프**: 참조 무결성(참조하는 평면이 삭제되면?) 처리 필요 → §13 리스크에서 정책 명시.

### C. 수학좌표 ↔ 월드 mm 매핑 — **박스 기준(bbox + 범위 → 단위 자동)**
- **결정**: 평면은 `bbox(x,y,w,h, 월드 mm)`와 `표시 범위([xMin,xMax]×[yMin,yMax], 수학 단위)`를 갖는다.
  "1단위=몇 mm"는 저장하지 않고 **파생 계산**(단일 진실=bbox+범위). 평면을 캔버스에서 리사이즈하면
  그래프가 통째로 확대/축소된다(기존 모든 오브젝트와 동일한 직관). 매핑 공식은 §4.
- **근거**: 기존 오브젝트가 전부 bbox 기반이라 리사이즈/스냅/그룹 로직과 일관. 미리보기 모달도
  동일 공식을 쓰므로 미리보기 = 결과물(WYSIWYG).
- **트레이드오프**: "1단위=정확히 N mm"가 리사이즈 후 고정되지 않는다. 시험 그림(시각용, 정밀 제도 아님)엔 무해.

### D. 수식 파서 — **바닐라 미니 파서 자체 구현(외부 라이브러리 없음)**
- **결정**: `eval` 없이 토크나이저 + 재귀하강 파서를 직접 둔다(신규 `js/function-graph/parser.js`).
  화이트리스트: 숫자, `x`, `+ - * / ^`, 단항 `-`, 괄호, 함수
  `sin cos tan asin acos atan sinh cosh tanh log(상용) ln exp sqrt abs floor ceil round sign`,
  상수 `pi e`. 각도는 **라디안 기본**.
- **근거**: "빌드 없음·바닐라" 원칙 + `eval` 보안/안정성 회피. math.js 번들은 무빌드 원칙과 충돌.
  약 150줄로 요구 함수 전부 커버, `compile(expr)→fn(x)`로 1회 컴파일 후 재사용.
- **재사용**: 라벨 표기(`y=f(x)`)는 기존 `formula.js` 렌더러 + 그리스문자 맵 재사용(§7).
  (기존 formula.js는 **렌더 전용, 평가 불가** — 평가기는 신규.)

### E. 정의역 제한 UX — **모달 미리보기에서 자르기 우선**
- **결정**: 모달 미리보기 위 **세로 핸들 2개**로 생성 구간 `[domainMin, domainMax]`를 지정(자른 영역 음영).
  기존 `runAreaCapture`(드래그→월드좌표 변환) 패턴 재사용. 삽입 후 재조정은 인스펙터 숫자칸(MVP),
  캔버스 끝핸들 재조정은 **확장**.
- **버튼 위치**: 좌측 패널 `TEMPLATES`에 새 "함수" 카테고리로 추가(회로/광학과 동일 등록 방식).
  단, 일반 도구처럼 무장(arm)하는 대신 클릭 시 **모달을 연다**.

### F. 저장 스키마 확장 & 내보내기 — **기계적**
- `project-io.js`의 `SCHEMA_VERSION "0.15" → "0.16"`, `migrate()`에 `coordplane`/`funcgraph` backfill 추가.
- `docs/OBJECT_SCHEMA.md`에 2개 타입 추가(18→20종) — **구현 커밋에서 함께 갱신**(이 기획 세션엔 미수정).
- **`svg-export.js`는 무수정**: `renderObject` 디스패치에 등록만 하면 자동 내보내기(조사로 확인, §7).
- 버전 범프 지점(현재 **4곳**): index footer, `?v=`, `main.js` 배너, CSS `?v=`. **버전 숫자는 사용자 지정.**

### G. 점 + 점선 + 라벨(요구 8) — **MVP 독립 → 확장 앵커링**
- **MVP**: 기존 점(`optics` node) + 점선(`line` + DASH_PRESETS) + 텍스트를 스냅으로 찍어 **시각 결과만**.
  자동 추종 없음.
- **확장**: `(planeId, x값)`에 종속된 **앵커 마커**로 승격 — 함수/평면이 변형되면 점·점선 수선·좌표 라벨이
  자동 추종. 렌더 조각(점선 스타일·node 점·라벨러)은 재사용, 데이터만 신규.
- **근거**: 첫 버전을 가볍게. 재사용 조각이 이미 다 있어 MVP 비용 최소.

> **참고**: 평면↔함수의 결합(B/C, 요구 7)과 점/라벨↔함수의 결합(G, 요구 8)은 다른 문제다.
> 평면→함수 재샘플 결합은 MVP에 포함(§10), 점/라벨 앵커링은 확장.

<!-- ===== 3. SCHEMA DRAFT ===== -->

## 3. 데이터 스키마 초안

공통 필드(id·type·layerId·order·locked·positionLocked·strokeLevel·strokeWidth·rotation·groupId·exportable)는
기존 규약을 따른다. 아래는 타입별 고유 필드.

### 3-1. `coordplane` (신규, atomic — 뷰 중앙 즉시 생성)

| 속성 | 의미 | 기본값 | 단위 |
|---|---|---|---|
| `x,y,w,h` | 그리기 박스(bbox) | 뷰 중앙, 예 60×48 | 월드 mm |
| `rotation` | bbox 중심 회전 | 0 | deg |
| `xMin,xMax` | x축 표시 범위 | -5, 5 | 수학 단위 |
| `yMin,yMax` | y축 표시 범위 | -5, 5 | 수학 단위 |
| `gridStepX,gridStepY` | 격자/눈금 간격 | 1, 1 | 수학 단위 |
| `showAxisLines` | 축선 표시 | true | — |
| `showGrid` | 격자 표시 | false | — |
| `showTicks` | 눈금 표시 | true | — |
| `showTickLabels` | **눈금 숫자 라벨**(기존 axes에 없던 것) | false | — |
| `tickLabelSize` | 눈금 라벨 크기 | 2.6 | mm |
| `labelX,labelY` | 축 이름 | "x","y" | — |
| `labelType` | 라벨 서체 | "quantity" | — |
| `exportable` | **내보내기 포함(요구 6 on/off)** | true | — |

- 파생값(저장 안 함): `unitX = w/(xMax−xMin)`, `unitY = h/(yMax−yMin)`, 원점 월드좌표(§4).
- 렌더: 신규 `renderCoordplane` — 기존 `renderAxes`(annotations.js) 로직 확장(축선·화살표·눈금 +
  **숫자 라벨·격자**). 회전은 `rotate(deg cx cy)` 그룹 변환(axes와 동일).

### 3-2. `funcgraph` (신규, 수식 구동 곡선)

| 속성 | 의미 | 기본값 | 비고 |
|---|---|---|---|
| `expr` | 수식 문자열 | 입력값 | 예 `"sin(x)"`, `"x^2-3*x+1"` |
| `domainMin,domainMax` | 생성 정의역(수학 x) | 드래그 지정 | 요구 4 |
| `planeId` | 소속 평면 참조 | 생성 시 평면 id | 요구 7(느슨한 결합) |
| `points[]` | **월드 mm로 구운 샘플 점 캐시** | 샘플링 결과 | 렌더가 그리는 실체 |
| `closed` | 닫힘 | false | 함수는 열린 스트로크 |
| `strokeLevel,strokeWidth` | 선 색/두께 | 0, 0.2 | curve와 동일 |
| `dashLength,dashGap` | 점선 | 0, 0 | DASH_PRESETS 재사용 |
| `label,labelShow` | `y=f(x)` 표기 | ""/false | **확장**(formula 렌더 재사용) |

- **핵심 설계**: `points[]`는 **월드 좌표로 베이크**된 캐시. 따라서 렌더/히트테스트/bbox/내보내기/스냅이
  기존 `curve`와 **완전히 동일하게** 취급된다(특별 코드 최소화). 평면 참조는 **쓰기 경로에서만** 쓴다:
  - 수식/정의역 편집 → 재샘플
  - 평면 범위/리사이즈 변경 → 의존 함수 재샘플
  - 평면 이동(translate) → 의존 함수 점을 같은 Δ로 평행이동(재샘플 불필요)
- **개별 점 핸들 없음**(수식 구동). 자유 변형은 "곡선으로 변환"(type을 `curve`로, 메타 필드 제거,
  `points[]` 유지) 후 기존 curve 점편집(transform.js:424-437)으로.
- 렌더: `renderFuncgraph`는 기존 `catmullRomPath`(core.js:147) 재사용 — 사실상 curve 렌더 위임.

### 3-3. `graphmarker` (확장 — 요구 8 앵커 마커)

| 속성 | 의미 |
|---|---|
| `planeId` | 소속 평면 |
| `refFuncId` | (선택) 종속 함수 — 곡선 위 점이면 함수 참조 |
| `mathX` | 앵커의 수학 x(함수 위면 y는 f(x) 파생) |
| `mathX,mathY` | (자유점이면) 수학 좌표 직접 |
| `dropX,dropY` | x축/y축 수선 on/off |
| `showCoordLabel` | 좌표 라벨 표시 |

- 화면 위치·점선 수선·라벨을 **전부 파생 렌더**(평면 매핑 + 함수 평가). 함수/평면이 바뀌면 자동 추종.
- 렌더 재사용: 점선(line dash), node 점, 라벨러/텍스트(§7). MVP는 이 타입 없이 독립 오브젝트로 흉내.

<!-- ===== 4. MAPPING ===== -->

## 4. 좌표 매핑 명세 (결정 C)

평면 `P(x,y,w,h, xMin,xMax,yMin,yMax)` 기준:

```
unitX = w / (xMax − xMin)          // mm per 수학 x단위
unitY = h / (yMax − yMin)          // mm per 수학 y단위

worldX(mx) = x + (mx − xMin) * unitX
worldY(my) = y + (yMax − my) * unitY     // y 뒤집기(수학 위 = 화면 위)

원점(0,0) 월드 = ( worldX(0), worldY(0) )   // 0이 범위 안일 때만 축이 화면에 교차
```

- 역변환 `mathFromWorld`도 대칭으로 제공(정의역 드래그 → 수학 x 환산에 사용).
- 회전: 평면 단독 회전은 평면 그래픽에만 `rotate` 적용. **그래프 전체 회전**은 평면+함수를
  그룹(Ctrl+G) 후 회전(점 베이크) — MVP 정책. 평면 단독 회전 시 함수 자동 회전은 확장.
- 공용 헬퍼는 신규 `js/function-graph/coords.js`에 두고 sampler·모달·인스펙터·(확장)마커가 공유.

<!-- ===== 5. PARSER ===== -->

## 5. 수식 파서/평가기 명세 (결정 D)

- `tokenize(str)` → 토큰열, `parse(tokens)` → AST, `compile(expr)` → `fn(x): number`.
- 평가 실패(정의역 밖: `log(-1)`, `tan` 점근 등) → `NaN`/`Infinity` 반환.
- 샘플링(`sampler.js`): `[domainMin,domainMax]`를 N등분(예 200~400) → `fn(x)` → `worldX/worldY`로 매핑 →
  `NaN/Inf`는 선 끊기(MVP는 해당 점 스킵) → **RDP 단순화**(geometry.js:29-43, eps≈0.3~0.6mm)로 80~150점 축약.
- 불연속/점근선 정교 처리(구간 분할), 각도 degree 토글은 **확장**(§12).

<!-- ===== 6. UX FLOW ===== -->

## 6. UX 플로우 (결정 E)

1. 좌측 패널 "함수" 카테고리 → **"함수 입력"** 클릭 → 모달 오픈(`.modal-overlay` 재사용, style.css:451-660).
2. 모달 = **좌: 수식 입력 + 범위/스케일 컨트롤, 우: 실시간 미리보기 SVG**
   (settings.js의 `defaults-preview-svg` 2열 패턴 재사용, settings.js:57-149).
   미리보기는 **draft coordplane + draft funcgraph를 실제 렌더러로 그림** → WYSIWYG.
3. 스케일 조정 = draft 평면의 범위(xMin…yMax) 편집 → 즉시 재샘플.
4. **정의역 드래그**: 미리보기 위 세로 핸들 2개로 `[domainMin,domainMax]` 지정(음영). `runAreaCapture`
   드래그 패턴 재사용(export-dialog.js:118-209).
5. 확인 → 캔버스에 `coordplane`(신규 or 재사용) + `funcgraph` 커밋, 자동 선택 + 인스펙터 오픈.
6. 같은 평면에 함수 추가 = 평면 선택 상태에서 다시 "함수 입력"(planeId 물려받음). 요구 7.

<!-- ===== 7. REUSE MAP ===== -->

## 7. 기존 모듈 재사용 지점 (조사 근거)

| 재사용 대상 | 파일:라인 | 용도 |
|---|---|---|
| `renderAxes`(축선·화살표·눈금·회전) | render/annotations.js:23-117 | `renderCoordplane` 확장 출발점 |
| `catmullRomPath`(순수, path 문자열) | render/core.js:147-166 | funcgraph/미리보기 곡선 |
| `renderCurve` | render/shapes.js:353-372 | funcgraph 렌더 위임 |
| `simplifyRDP` | geometry.js:29-43 | 샘플 점 축약 |
| curve 점편집/평행이동 | transform.js:424-437 / 273-289 | 곡선 변환 후 자유 변형 / funcgraph 이동 |
| `formula.js` 렌더 + GREEK 맵 | formula.js:345-376 / 39-47 | `y=f(x)` 라벨(확장) |
| 통합 텍스트/수식 편집기 | text-editor.js:1490,1558 | (참고) 입력 UI 패턴 |
| 모달 CSS/구조 | style.css:451-660, export-dialog.js:49-95 | 함수 입력 모달 |
| 2열+미리보기 모달 | settings.js:57-149,133-138 | 모달 레이아웃 |
| 영역 드래그(screen→world) | export-dialog.js:118-209 | 정의역 드래그 |
| draft 미리보기 상태·패턴 | state.js:264, tools.js:828-867 | 생성 미리보기 |
| DASH_PRESETS(실선/0.2·0.2/0.5·0.3/1.0·0.3) | inspector/widgets.js:15-21 | 점선 수선(요구 8) |
| optics node 점(≈2.27mm, sw 0.3) | tools.js:642-705, optics-apparatus.js:127 | 점(요구 8) |
| 라벨러(지시선+수평 라벨) | annotations.js:225-283 | 좌표 라벨(요구 8) |
| `renderObject` 자동 내보내기 | svg-export.js:111-154, isHidden:50-55 | 신규 타입 자동 export |

<!-- ===== 8. NEW FILES ===== -->

## 8. 신규 파일 구조 (image-dev와 충돌 없는 새 영역)

```
js/function-graph/
  parser.js     토크나이저 + 재귀하강 평가기(compile → fn(x))
  coords.js     worldFromMath / mathFromWorld / unit 계산(평면 공유 헬퍼)
  sampler.js    expr + domain + plane → 월드 점[](파서·매핑·RDP 결합)
  modal.js      "함수 입력" 모달(입력·미리보기·정의역 드래그·커밋)
js/render/
  coordplane.js renderCoordplane(축·격자·눈금·숫자라벨)  ※ annotations.js에 둬도 됨
                renderFuncgraph(= catmullRomPath 위임)     ※ shapes.js에 둬도 됨
js/inspector/
  section-coordplane.js  범위·격자·눈금·라벨·출력 on/off
  section-funcgraph.js   수식(모달 재오픈)·정의역·선/점선·"곡선으로 변환"
```

<!-- ===== 9. TYPE ADD CHECKLIST ===== -->

## 9. 새 타입 추가 체크리스트 (건드릴 기존 파일)

`coordplane`·`funcgraph` 2종에 대해(조사로 역산):

| 파일 | 작업 | funcgraph | coordplane |
|---|---|---|---|
| render/scene.js:710 | `renderObject` case 추가 + `singleObjBBox`(756-814) | curve처럼 points bbox | axes처럼 x/y/w/h |
| render/(shapes/coordplane).js | 렌더 함수 | 위임 | 신규 |
| templates.js:36+ | TEMPLATES 등록 | "함수 입력"(모달 트리거) | atomic 즉시 생성 |
| project-io.js:20,45-170 | SCHEMA 0.16 + backfill | 필드 기본값 | 필드 기본값 |
| pick.js:135-140,246 | hitTest + getObjectBBox | curve 패턴 | axes 패턴 |
| transform.js:273-406 | applyDelta/handle/objectCenter | 이동=점평행이동, 리사이즈 없음(평면 통해) | bbox 리사이즈 → **의존 함수 재샘플** |
| snap.js | 스냅 앵커(선택) | 첫·끝점(curve식) | — |
| state.js | 상수(기본 범위·샘플수) | 공유 | 공유 |
| svg-export.js | **무수정** | ✔ | ✔ |
| index.html/main.js/CSS | 버전 4곳 + 모달 마운트 배선 | 공통 | 공통 |

<!-- ===== 10. PLAN ===== -->

## 10. 단계별 구현 계획 (MVP → 확장)

### MVP (요구 1·2·3·4·5·6·7) — 권장 순서
1. **파서/평가기 + 좌표 헬퍼**(`parser.js`, `coords.js`) — 순수 로직, 단위 테스트 쉬움. 먼저.
2. **`coordplane` 타입**: 스키마·`renderCoordplane`·templates 즉시생성·인스펙터(범위/눈금/숫자라벨/출력 on-off)·
   project-io backfill. (축은 기존 axes 확장으로 빠르게)
3. **`funcgraph` 타입**: `sampler.js`로 월드 점 생성 → curve 렌더 위임. 이동/선택/내보내기는 curve 재사용.
4. **함수 입력 모달**(`modal.js`): 2열 미리보기 + 스케일 조정 + **정의역 드래그** + 커밋(평면+함수).
5. **평면→함수 재샘플 결합**: 평면 범위/리사이즈 변경 시 의존 funcgraph 재샘플, 평면 이동 시 평행이동.
6. **"곡선으로 변환"** 버튼(요구 5) + **평면 출력 on/off**(요구 6) 마무리.
7. 버전 범프(사용자 지정) + OBJECT_SCHEMA.md 갱신 + all_types 픽스처 회귀.

### 확장 (요구 8 + 심화)
8. **`graphmarker`**(요구 8): 점→점선 수선→좌표 라벨, 함수/평면 자동 추종.
9. 캔버스에서 정의역 끝핸들 재조정, 함수 수직 스케일 핸들, 수식 캔버스 재편집.
10. `y=f(x)` 라벨 자동 부착(formula 렌더 재사용), 평면 단독 회전 시 함수 동반 회전.
11. 불연속/점근선 구간 분할, degree/radian 토글, y범위 자동맞춤, π 눈금 라벨, 교점 표시.

<!-- ===== 11. SAVE/EXPORT ===== -->

## 11. 저장·마이그레이션·내보내기 (결정 F)

- `SCHEMA_VERSION "0.15"→"0.16"`. `migrate()`에 두 타입 backfill 추가(pendulum 예시 project-io.js:123-135 패턴).
- 구버전 파일: 두 타입이 없으므로 backfill 대상 0 → 문제 없음.
- 신버전 파일을 구버전 앱에서 열면: `renderObject` 미등록 타입 → **기본 case 동작 확인 필요**(§13).
- 내보내기: `renderObject` 등록만으로 SVG/PNG 자동 포함. `exportable=false`인 평면만 숨김(요구 6).

<!-- ===== 12. OPEN QUESTIONS ===== -->

## 12. 열린 질문 (구현 전 사용자 확인 권장)

1. **각도 단위**: 삼각함수 기본 라디안으로 시작 OK? degree 토글은 확장으로 미룸?
2. **기존 `axes`와 `coordplane` 공존 vs 병합**: 당분간 공존(축=장식, 평면=그래프)로 두되, 나중에
   axes를 coordplane의 축소 모드로 흡수할지?
3. **여러 함수 구분**: 프로젝트가 회색조 지향 → 색 대신 **점선 패턴/라벨**로 구분(맞는지)?
4. **눈금 라벨 형식**: MVP는 일반 숫자. 분수·π배수·소수 자리수 제어는 확장으로?
5. **y범위 기본값·자동맞춤**: 기본 [-5,5]로 시작하고 "자동맞춤" 버튼은 확장?
6. **정의역 밖 처리 표시**: 끊긴 구간을 그냥 비울지, 점근선 안내를 줄지(확장)?

<!-- ===== 13. RISKS ===== -->

## 13. 리스크 & 완화

- **참조 무결성**: `funcgraph.planeId`가 가리키는 평면 삭제 시 → 정책: 평면 삭제 시 의존 함수도 함께
  삭제할지 묻거나, 함수를 "곡선으로 변환"해 독립화(권장: 삭제 전 안내 + 곡선화 승격).
- **재샘플 성능**: 함수 다수 × 점 다수. RDP로 점 억제 + 평면 편집 시에만 재샘플 → 실사용 무리 없음.
- **구버전 앱 호환**: 신규 타입을 `renderObject` 기본 case가 조용히 무시하는지 구현 초기에 확인(크래시 방지).
- **회전 혼용**: 평면=`rotation` 필드, 함수=점 베이크. 그래프 전체 회전은 그룹 회전으로 통일(MVP).
- **image-dev 충돌**: 신규 파일 위주 + `image-*.js` 무수정으로 충돌 위험 최소. 공통 수정 파일
  (render/scene, transform, pick, project-io, templates)은 work-dev에서만 손대는 규칙 유지.

<!-- ===== END ===== -->
