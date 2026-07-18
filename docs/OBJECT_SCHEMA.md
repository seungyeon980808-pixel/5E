# OBJECT_SCHEMA — 객체 타입×속성 지도

<!-- ===== META ===== -->

| 항목 | 내용 |
|---|---|
| 목적 | 타입×속성 지도 — 구조 파악과 Claude Code 세션 토큰 절감용 |
| 버전 | v1.1.0 |
| 날짜 | 2026-07-19 (표 본문은 v0.40.0 조사분 + 이후 델타 반영) |
| 유지 규칙 | **객체 스키마를 바꾸는 커밋은 이 문서도 같이 갱신한다** |

> ⚠️ **`render.js:NNNN` 형태의 줄번호 인용은 전부 죽었다.** v0.41.0에서 렌더러가 분해되어
> `js/render.js`는 11줄짜리 재export 껍데기이고, 실제 코드는 `js/render/` 아래
> (`scene.js`·`shapes.js`·`labels.js`·`coordplane.js`·`circuit.js`·`annotations.js`·`gauge.js`…)에 있다.
> 디스패치는 `js/render/scene.js`의 `renderObject()`다. 파일명만 믿고 줄번호는 다시 찾을 것.

- 근거는 전부 실제 코드(생성 경로·렌더러·변환 코드)이며, 추정한 항목은 `(확인 필요)`로 표시했다.
- "생성 시 기본값"은 도구/템플릿 생성 코드 기준. 인스펙터에서 나중에 붙는 속성은 `(인스펙터 추가)`로 표시 — 생성 직후 객체에는 없는 필드다.
- 좌표·길이 단위는 전부 world mm (1 world unit = 1 mm).

<!-- ===== TYPE INDEX ===== -->

## 1. 타입 총람 (21종)

정본은 `js/object-types.js`의 `OBJECT_TYPE_IDS`이며, `js/render/scene.js`의 `renderObject()`
디스패치와 1:1로 대응한다. 생성 경로가 여러 개인 타입은 모두 표기.

> 아래 표는 18종까지만 상세하다. v0.40.0 이후 추가된 **3종**은 §1-2에 따로 적었다.

| # | type | 분류 | 지오메트리 | 생성 경로 |
|---|------|------|-----------|----------|
| 1 | `rect` | 박스(branch A) | x/y/w/h | tools.js `makeShape` (R 드래그), image-import-mock.js `baseShape` |
| 2 | `ellipse` | 박스 | x/y/w/h | tools.js `makeShape` (O) |
| 3 | `triangle` | 박스 | x/y/w/h + flipX/flipY | tools.js `makeShape` (Y) |
| 4 | `line` | 끝점(branch B) | p1/p2 | tools.js `makeLine` (L 두 클릭), image-import-mock.js `baseLine` |
| 5 | `polyline` | 점열 | points[] | tools.js `makePolyline` (P 클릭-클릭), image-import-mock.js `basePolyline` |
| 6 | `curve` | 점열(Catmull-Rom) | points[] | tools.js `makeCurve` (C), tools.js `setupFreeDraw` (F 자유곡선 → closed) |
| 7 | `text` | 텍스트 | x/y (앵커) | tools.js `_commitText` (T), image-import-mock.js `baseText` |
| 8 | `formula` | 수식 | x/y + w/h(측정값) | tools.js `_commitText`(수식 모드), tools.js `commitFormulaEditor` (FX) |
| 9 | `image` | 래스터 | x/y/w/h | image-paste.js `insertImageObject` (Ctrl+V), image-cutout.js, project-io.js(이미지 삽입) |
| 10 | `svgAsset` | 내장 SVG 심볼 | x/y/w/h | tools.js `makeShape` (SVGASSET 도구; 도르래/수레, svg-assets.js 레지스트리) |
| 11 | `axes` | 좌표축(atomic) | x/y/w/h | templates.js `TEMPLATES.axes.make` (뷰 중앙에 즉시 생성) |
| 12 | `anglearc` | 각도 호 | 꼭짓점 x/y + radius/각도 | tools.js `makeAngleArcDraft` (ARC 도구), image-import-mock.js `baseAngleArc` |
| 13 | `rightangle` | 직각 표시 | 꼭짓점 x/y + size/angle | tools.js `makeRightAngleDraft` (RIGHTANGLE) |
| 14 | `labeler` | 지시선+이름 | p1/p2 | tools.js `makeLabelerDraft` (LABELER), image-import-mock.js `baseLabeler` |
| 15 | `circuit` | 회로 소자 | p1/p2 (양 단자) | tools.js `makeCircuit` (CIRCUIT + element 변형) |
| 16 | `optics` | 광학/역학 박스 심볼 | x/y/w/h + kind | tools.js `makeShape` (OPTICS + kind), tools.js `setupNodePlacement` (점 단일 클릭) |
| 17 | `apparatus` | 실험 기구 | x/y/w/h + kind | tools.js `makeShape` (APPARATUS + kind) |
| 18 | `pendulum` | 단진자 | p1(고정점)/p2(추 중심) | tools.js `makePendulum` (PENDULUM 드래그) |

### 1-2. v0.40.0 이후 추가된 3종

| # | type | 분류 | 지오메트리 | 생성 경로 |
|---|------|------|-----------|----------|
| 19 | `coordplane` | 박스(branch A) | x/y/w/h + 축 범위·격자 | `function-graph/defaults.js makeDefaultCoordplane`, `graph/graph-modal.js buildFrame` |
| 20 | `funcgraph` | 점열(baked) + math 스펙 | `points[]` + `expr`/`planeId` | `function-graph/insert.js`, `graph/graph-modal.js`, `tools/click-placement.js` |
| 21 | `gauge` | 자·각도기 | x/y/w/h + kind | `tools.js makeShape` (RULER/PROTRACTOR → 같은 type) |

**`coordplane` 고유 필드**: `xNeg`/`xPos`/`yNeg`/`yPos`(축별 음·양 방향 칸 수 — 비대칭 평면),
`gridCountXPos`/`XNeg`/`YPos`/`YNeg`, `tickStepX`/`tickStepY`(눈금 한 칸 값, 0.1 단위),
`tickLabelMode`, `labelOrigin`(원점 라벨, 기본 `"O"` · 비우면 숨김), `lockAspect:true`.

**`funcgraph` 고유 필드** — 월드 점을 baked 저장하고 재편집용 math 스펙을 함께 보관한다:

| 필드 | 뜻 |
|---|---|
| `points[]` / `mathPoints[]` | 렌더용 월드 점 / 재편집용 math 좌표 |
| `expr`, `sourceKind` | 수식 문자열, `"expr"` 또는 `"points"` |
| `domainMin`/`domainMax`/`domainAuto` | 정의역 |
| `rangeMin`/`rangeMax` | **치역** — 벗어난 구간은 `breaks`로 끊긴다 |
| `breaks[]` | 끊긴 run의 시작 인덱스(평면 밖·치역 밖). 빈 배열 = 연속 |
| `handles[]` / `handlesMath[]` | 베지어 제어점(월드) / 앵커 기준 math 오프셋 |
| `curveStyle`, `curvature` | `"straight"`(꺾은선) / `"smooth"`(자유곡선), 곡률 |
| `markerXs`, `guideXs`, `arrowSpecs` | 표시점 · 수선의 발 · 화살표 |
| `endLabel`, `endLabelSize`, `offset{dx,dy}`, `autoExtend`, `planeId` | 끝 라벨, 이동 오프셋, 소속 평면 |

> ⚠️ **`js/project-io.js`의 백필이 이 필드들을 아직 따라오지 못했다.** `breaks`·`handles`·
> `rangeMin/Max`·`markerXs`·`sourceKind`, 그리고 `line.dimensionLabelSize`,
> `coordplane.gridCountXPos/Neg`·`labelOrigin`은 백필 목록에 없다. §2의 "새 필드를 더하면
> 백필도 같이" 불변 규칙이 실제로 깨져 있는 상태다 — 옛 파일을 열 때 렌더러의 기본값에
> 의존하고 있으니, 손볼 때 함께 정리할 것.

<!-- ===== COMMON PROPS ===== -->

## 2. 공통 속성

"전 타입 공통"으로 보이는 필드도 실제로는 예외가 있다. 아래 표의 "적용" 열이 근거.

| 속성 | 의미 | 적용 범위 / 예외 |
|---|---|---|
| `id` | 고유 id (`obj_<time36>_<n>` / `_tpl<n>` / `_img<n>`) | 전 타입. 커밋 시점에 부여 (draft는 `id:null`) |
| `type` | 렌더/변환 디스패치 키 | 전 타입 |
| `layerId` | 소속 레이어 (기본 `s.activeLayerId`, 초기 1) | 전 타입 |
| `order` | 레이어 내 z-순서 (커밋 시 `objects.length`) | 전 타입 |
| `locked` | 전체 잠금 (선택은 되나 변형 불가) | 전 타입, 기본 `false` |
| `positionLocked` | 위치 잠금 (제자리 회전/리사이즈만) | 전 타입, 기본 `false` |
| `strokeLevel` | 선 회색 단계 (0=검정, 255=흰색; render.js `grayHex`) | **text/formula/image 제외** 전 타입 |
| `strokeWidth` | 선 두께 mm (기본 0.2 = `DEFAULT_STROKE_WIDTH`) | **text/formula/image 제외**. svgAsset은 0으로 생성 |
| `rotation` | 회전 각도(deg). 저장 방식은 §4 참조 | 박스형 + text/formula만 **해석**됨. line/polyline/curve는 생성 시 `rotation:0`이 있으나 렌더가 읽지 않음(사장 필드) |
| `groupId` | 소속 그룹 id (Ctrl+G 시 부여, transform.js:1045) | 그룹된 객체만. `state.groups[]`와 쌍 |
| `labelType` | 라벨 서체 종류 `"quantity"`(Times 이탤릭) \| `"label"`(신명중명조 정체) | 라벨을 가진 타입만 (rect 기본 `"label"`, 나머지 `"quantity"`). line은 생성 시 없음(인스펙터 추가) |
| `dashLength` / `dashGap` | 점선 대시/간격 mm (0=실선) | rect/ellipse/triangle/optics/apparatus/svgAsset(makeShape 공통) + line/polyline/curve. 나머지 타입엔 없음 |
| `fillLevel` / `fillNone` / `fillStyle` | 채움 회색 단계 / 투명 / 패턴(`solid\|dots\|cross\|hatch`) | 박스형(makeShape) + polyline/curve(닫힘 시 유효). §5 참조 |
| `opacity` | 불투명도 0~1 | **image 전용** (renderImage만 해석, render.js:1566) |

- `flipY`(triangle)는 생성 시 없음 — 렌더가 `?? false`로 해석 (render.js:898).
- 저장 파일 로드 시 project-io.js가 타입별 기본값을 역보충(backfill)한다 (project-io.js:91-166).

<!-- ===== PER-TYPE ===== -->

## 3. 타입별 고유 속성

공통 속성(§2)은 반복하지 않는다. "해석 위치"는 그 필드를 실제로 읽는 코드.

### 3-1. rect

| 속성 | 의미 | 기본값(생성 시) | 해석 위치 |
|---|---|---|---|
| `x,y,w,h` | 좌상단 + 크기 | 드래그 범위 | render.js:renderRect |
| `labelType` | 내부 라벨 서체 | `"label"` (블록명 A/B/C 정체 기본) | render.js:withBoxLabel |
| `label` | 라벨 텍스트 | (인스펙터 추가) | render.js:withBoxLabel |
| `labelPos` | 라벨 위치 `center\|above\|below\|left\|right` | (인스펙터 추가; 렌더 기본 `center`) | render.js:withBoxLabel |
| `labelSize` | 라벨 크기 mm | (인스펙터 추가; 렌더 기본 3.7) | render.js:withBoxLabel |

### 3-2. ellipse

rect와 동일 구조(withBoxLabel 라벨 포함), 단 `labelType` 기본은 `"quantity"` (tools.js:makeShape). bbox → cx/cy/rx/ry로 투영 (render.js:renderEllipse).

### 3-3. triangle

| 속성 | 의미 | 기본값 | 해석 위치 |
|---|---|---|---|
| `flipX` | 직각 꼭짓점 좌우 반전 | `b.x < a.x` (드래그 방향) | render.js:renderTriangle |
| `flipY` | 상하 반전 | 없음(렌더 기본 false) | render.js:renderTriangle |

라벨 없음 (renderTriangle은 withBoxLabel을 거치지 않음).

### 3-4. line (tools.js:makeLine)

| 속성 | 의미 | 기본값 | 해석 위치 |
|---|---|---|---|
| `p1,p2` | 두 끝점 `{x,y}` | 클릭 두 점 | render.js:renderLine |
| `lineMode` | `solid\|arrow\|middleArrow\|midInward\|lengthArrow` | `"solid"` | render.js:renderLine |
| `lineStyle` | 구버전 별칭(호환 유지) | `"solid"` | render.js:renderLine(fallback) |
| `arrowVariant` | 화살표 방향 `right\|left\|both` | `"right"` | render.js:renderLine |
| `dimensionVariant` | 길이표시 막대 `basic\|rightBar\|leftBar\|bothBars` | `"basic"` | render.js:renderLine(lengthArrow) |
| `arrowHead` | `none\|end\|start\|both` (구버전 `center` 마이그레이션됨) | `"none"` | render.js:renderLine |
| `dashLength,dashGap` | 점선 | 0, 0 | render.js:applyDash |
| `partialDash` | 부분 점선 on/off | (인스펙터 추가) | render.js:renderLine:1130 |
| `dashRatio` | 실선 구간 비율 0~1 | (인스펙터 추가; 렌더 기본 0.5) | render.js:renderLine |
| `dashFlip` | 부분 점선 방향 반전 | (인스펙터 추가) | render.js:renderLine |
| `dimensionLabel` | 길이표시 텍스트 | (인스펙터 추가; 렌더 기본 `"d"`) | render.js:renderLine:1222 |
| `label` / `labelShow` / `labelFlip` / `labelSize` / `labelType` | 중점 위 직립 라벨 | (인스펙터 추가; inspector.js:502-590) | render.js:withLineLabel |
| `rotation` | **사장 필드** (렌더 미사용; 각도는 p1→p2에서 파생) | 0 | — |

### 3-5. polyline (tools.js:makePolyline)

| 속성 | 의미 | 기본값 | 해석 위치 |
|---|---|---|---|
| `points[]` | 꼭짓점 배열 `{x,y}` | 클릭 점들 | render.js:renderPolyline |
| `arrowHead` | `none\|end\|start\|both\|center` | `"none"` | render.js:renderPolyline |
| `dashLength,dashGap` | 점선 | 0, 0 | render.js:applyDash |
| `closed` | false=열린 polyline / true=채움 polygon | `false` | render.js:renderPolyline, transform.js |
| `fillLevel,fillNone,fillStyle` | 닫힘 시 채움 | 255, false, `"solid"` | render.js:resolveFill |
| `rounded` | 경사면처리(모서리 필렛, 렌더 전용 — points 불변) | `false` | render.js:roundedPolylinePath |
| `cornerRadius` | 필렛 back-off 거리 mm | `10` | render.js:roundedPolylinePath |
| `rotation` | **사장 필드** | 0 | — |

### 3-6. curve (tools.js:makeCurve / setupFreeDraw)

polyline과 같은 구조에서 `rounded`/`cornerRadius` 없음. Catmull-Rom 경로로 투영.

| 속성 | 의미 | 기본값 | 비고 |
|---|---|---|---|
| `points[]` | 앵커점 | 클릭 점들 / RDP 단순화된 자유곡선 점 | |
| `closed` | 닫힘(부드럽게 폐곡선+채움) | C도구 `false` / F자유곡선 `true` | render.js:renderCurve |
| `arrowHead` | 필드는 있으나 **curve 렌더는 화살표 미지원** | `"none"` | tools.js:1964 주석 |
| `fillLevel,fillNone,fillStyle` | 닫힘 시 채움 | C: 255/false/solid, F: 255/false/solid + `strokeWidth:0`(테두리 없음) | tools.js:681-698 |

### 3-7. text (tools.js:_commitText, 신규 생성 분기 3046-3078)

strokeLevel/strokeWidth/fill **없음**. 색은 렌더에서 `#0d1117` 고정.

| 속성 | 의미 | 기본값 | 해석 위치 |
|---|---|---|---|
| `x,y` | 좌상단 앵커 (dominant-baseline: hanging) | 클릭 점 | render.js:renderText |
| `text` | 내용 (`\n` 멀티라인 → tspan) | 입력값 | render.js:renderText |
| `textRuns[]` | `[{text, style{role,fontFamily,fontSize,fontWeight,italic,underline,strikeout}}]` — 팔레트 심볼(구간/물리량) 런 | `normalizeTextRuns(draft)` | render.js:appendStyledTextRuns, state.js:normalizeTextRuns |
| `fontSize` | 크기 mm (기본 3.7 = `DEFAULT_TEXT_SIZE_MM`) | 3.7 | render.js:renderText |
| `fontFamily` | 글꼴 (기본 돋움 시스템 스택) | `DEFAULT_TEXT_FONT` | render.js:applySvgTextFont |
| `fontWeight` / `fontStyle` / `italic` | 굵기/스타일 | `"normal"` / `"normal"` / `false` | state.js:resolveTextFontStyle |
| `letterSpacing` | 자간 (수식 폰트일 때 -0.04em) | `null` | state.js:resolveTextLetterSpacing |
| `underline` / `strikeout` | 밑줄/취소선 | `false` | render.js:renderText |
| `rotation` | 좌상단 앵커 기준 회전 | 0 | render.js:renderText:1534 |

### 3-8. formula (tools.js:_commitText 수식 분기 / commitFormulaEditor)

| 속성 | 의미 | 기본값 | 해석 위치 |
|---|---|---|---|
| `source` | 한 줄 brace-문법 수식 문자열 | 입력값(정규화) | formula.js:renderFormula |
| `rawSource` | 편집기 원본 문자열 (텍스트 편집기 경유 생성 시) | 입력값. FX 편집기 생성 경로엔 **없음** | tools.js:startEditingTextObject |
| `x,y` | 좌상단 앵커 | 클릭 점 | formula.js:renderFormula |
| `w,h` | `measureFormula` 측정값 (재편집 시 갱신) | 측정값 | tools.js:3267-3268 |
| `fontSize,fontFamily,fontWeight,italic` | 서체 | 3.7 / `DEFAULT_TEXT_FONT` / normal / false | formula.js:fontOf |
| `fontStyle,letterSpacing,underline,strikeout` | 텍스트 편집기 경유 생성 시에만 존재 | — | tools.js:3046-3056 |
| `rotation` | 박스 중심 기준 회전 | 0 | formula.js:renderFormula:373 |

### 3-9. image (image-paste.js:insertImageObject)

| 속성 | 의미 | 기본값 | 해석 위치 |
|---|---|---|---|
| `src` | data URL (png/jpeg base64) | 붙여넣은 데이터 | render.js:renderImage |
| `x,y,w,h` | 배치 박스 (아트보드 90%에 맞춤) | fitToArtboard 결과 | render.js:renderImage |
| `mode` | `"edit"` \| `"background"` | `"edit"` | inspector.js, render.js:615 |
| `opacity` | 불투명도 0~1 | `1` | render.js:1566 |
| `aspectLocked` | 비율 고정 리사이즈 | `true` | transform.js:470 |
| `exportable` | 내보내기 포함 여부 | `true` | svg-export.js:isHidden |
| `imageSelectionLocked` | 이미지 전용 선택 잠금(트레이싱 참고용) | `false` | render.js:615, tools.js:501 |
| `cutouts[]` | 지우기 영역 `{type:"rect",x,y,w,h}` 또는 `{type:"path"\|"lasso",points[],brushWidth}` — 이미지 자체 좌표계 0~1 비율 | `[]` | render.js:1572-1632(mask) |
| `recognized` | 객체화(이미지→객체) 인식 완료 플래그 | 로드 시 backfill `false` | project-io.js:121 |
| `rotation` | 박스 중심 회전 | 0 | render.js:renderImage |

### 3-10. svgAsset (tools.js:makeShape SVGASSET 분기 1830-1839)

| 속성 | 의미 | 기본값 | 해석 위치 |
|---|---|---|---|
| `assetId` | 내장 에셋 키 `"pulley"` \| `"cart"` | 무장된 심볼 | render.js:renderSvgAsset → svg-assets.js:getSvgAsset |
| `name` | 표시 이름 (도르래/역학 수레) | 에셋 name | inspector |
| `src` | (선택) dataUri 오버라이드 — 없으면 에셋 dataUri | 없음 | render.js:1644 |
| `x,y,w,h` | 배치 박스 | 드래그 | render.js:renderSvgAsset |
| `lockAspect` | 비율 고정 | `true` | transform.js(리사이즈) |
| `fillNone` / `strokeWidth` | 형식상 존재 (`true` / `0`) — 렌더는 `<image>`라 미사용 | true / 0 | — |

### 3-11. axes (templates.js:TEMPLATES.axes.make)

| 속성 | 의미 | 기본값 | 해석 위치 |
|---|---|---|---|
| `x,y,w,h` | bbox (원점 = 중심) | 뷰 중앙, 44×34 | render.js:renderAxes |
| `axisVariant` | `cross`(십자) \| `quadrant`(1사분면 L자) \| `single`(수평선만) | `"cross"` | render.js:1714 |
| `showTicks` | 눈금 표시 | `true` | render.js:1733 |
| `tickSpacing` | 눈금 간격 mm | `5` | render.js:1734 |
| `labelX` / `labelY` | 축 라벨 (single이면 labelY 무시) | `"x"` / `"y"` | render.js:1765-1766 |
| `labelType` | 라벨 서체 | `"quantity"` | render.js:applyObjectLabelFont |
| `rotation` | bbox 중심(=원점) 회전 | 0 | render.js:1770 |

### 3-12. anglearc (tools.js:makeAngleArcDraft)

| 속성 | 의미 | 기본값 | 해석 위치 |
|---|---|---|---|
| `x,y` | 호의 꼭짓점(vertex) | 클릭 1 | render.js:renderAngleArc |
| `radius` | 반지름 mm | 클릭 1→2 거리 (템플릿 make는 14) | render.js:1788 |
| `startAngle` | 시작 각(deg, **수학 관례**: CCW 양수, +Y 위) | 클릭 2 방향 | render.js:1789 |
| `sweepAngle` | 벌어짐 각(deg, CCW 양수) | 클릭 3으로 결정 (미리보기 기본 60) | render.js:1790 |
| `label` | 라벨 | `"θ"` | render.js:1824 |
| `showLabel` | 라벨 표시 | `true` | render.js:1824 |
| `labelType` | 라벨 서체 | `"quantity"` | render.js:1833 |

### 3-13. rightangle (tools.js:makeRightAngleDraft)

| 속성 | 의미 | 기본값 | 해석 위치 |
|---|---|---|---|
| `x,y` | 꼭짓점 | 클릭 1 | render.js:renderRightAngle |
| `size` | 한 변 길이 mm | 클릭 1→2 거리 (최소 0.3) | render.js:1945 |
| `angle` | 첫 변 방향 각(deg, **SVG 화면 관례**) | 클릭 2 방향 | render.js:1946 |
| `orientation` | 사각형이 펼쳐지는 쪽 `1 \| -1` | 클릭 3의 외적 부호 (기본 1) | render.js:1947 |

### 3-14. labeler (tools.js:makeLabelerDraft)

| 속성 | 의미 | 기본값 | 해석 위치 |
|---|---|---|---|
| `p1` | 지시선 앵커(그래프 쪽) | 클릭 1 | render.js:renderLabeler |
| `p2` | 라벨 위치 | 클릭 2 | render.js:renderLabeler |
| `text` | 라벨 내용 (멀티라인 가능) | `"㉠"` (생성 직후 편집기 자동 오픈) | render.js:makeUprightLabel |
| `labelType` | 서체 종류 | `"label"` | render.js |
| `fontFamily` | 글꼴 | `DEFAULT_TEXT_FONT`(돋움 스택) | render.js:1929 |
| `labelSize` | 글자 크기 mm | `3.7` | render.js:1887 |
| `textRuns[]` | 팔레트 심볼(구간/물리량) 스타일 런 | (편집기에서 추가) | render.js:1927-1933 |
| `italic` / `fontWeight` | (인스펙터/편집기 추가) | — | render.js:1930-1931 |

지시선 길이는 렌더에서 텍스트 블록 크기로 파생 — 저장 안 함.

### 3-15. circuit (tools.js:makeCircuit)

| 속성 | 의미 | 기본값 | 해석 위치 |
|---|---|---|---|
| `element` | `resistor\|dc_source\|ac_source\|capacitor\|inductor\|unknown\|diode\|lamp\|ammeter\|voltmeter` | 무장된 element (기본 `"resistor"`) | render.js:renderCircuit → CIRCUIT_ELEMENTS |
| `p1,p2` | 좌/우 단자 (도선 leads·몸체 위치는 렌더 파생) | 클릭 두 점 | render.js:circuitGeom |
| `label` | 몸체 위 라벨 (빈 문자열 허용) | `""` | render.js:2577 |
| `labelType` | 라벨 서체 | `"quantity"` | render.js:2587 |
| `height` | 몸체 높이 mm (resistor/inductor/capacitor/voltmeter/ammeter만) | 3.2 (계기류 5.12) | render.js 소자 렌더러 |
| `gap` | 축전기 극판 간격 mm (capacitor만) | `2` (`CIRCUIT_CAP_GAP_DEFAULT`) | render.js capacitor |
| `terminalLabels` | 다이오드 단자 라벨 `["",""]` (diode만) | `["",""]` | render.js diode |

몸체 길이는 상수 `CIRCUIT_BODY_MM = 8` (state.js:220) — 저장 안 함.

### 3-16. optics (tools.js:makeShape OPTICS 분기 1774-1791 / setupNodePlacement)

박스형 공통 필드 + 아래 고유 필드. `fillNone` 기본 `true`(윤곽선만).

| 속성 | 의미 | 기본값 | 해석 위치 |
|---|---|---|---|
| `kind` | `convex_lens\|concave_lens\|convex_mirror\|concave_mirror\|plane_mirror\|object_arrow\|screen\|point_light\|support_tri\|pivot\|node\|bar_magnet\|pulley(구형)` | 무장된 kind (기본 `"convex_lens"`) | render.js:renderOptics → OPTICS_KINDS |
| `label` | bbox 아래 라벨 | `""` | render.js:2814 |
| `showLabel` | 라벨 표시 | `false` | render.js:2814 |
| `labelType` | 라벨 서체 | `"quantity"` | render.js:2816 |
| `labelPos` | node(점) 전용: 라벨 위/아래 `above\|below` | node일 때 `"above"` | render.js:2835 |
| `centerLine` | 볼록/오목렌즈 전용 중앙 점선 `none\|top\|bottom\|full` | `"none"` | render.js:drawCenterLine |

node 단일 클릭 생성(tools.js:761-770)은 기본 크기 ≈2.27mm 정사각 bbox + `strokeWidth:0.3`.

### 3-17. apparatus (tools.js:makeShape APPARATUS 분기 1792-1829)

박스형 공통 필드 + kind별 필드. `fillNone` 기본 `true`.

| 속성 | 의미 | 기본값 | 해석 위치 |
|---|---|---|---|
| `kind` | `wire\|compass\|pulley\|clamp\|scale` | 무장된 kind (기본 `"wire"`) | render.js:renderApparatus |
| `templateId` | 참조 템플릿 id (APPARATUS_TEMPLATE_IDS) | kind 매핑값 | tools.js:64 |
| `label` | 라벨 필드 — **renderApparatus가 읽지 않음 (확인 필요: 사장 필드로 추정)** | `""` | — |
| — wire | `length`(≥18) / `thickness`(1.8) / `gap`(=thickness) / `angle`(0) | 좌기 | render.js wire 렌더러 |
| — compass | `needleAngle`(-90) / `lockAspect`(true) | 좌기 | render.js compass |
| — pulley | `variant`(`"basic"`) / `lockAspect`(true), w=size×1.18 | 좌기 | render.js pulley |
| — clamp | `flipped`(false) / `lockAspect`(true) | 좌기 | render.js clamp |
| — scale | `displayText`(`"0.99 N"`) / `lockAspect`(true) | 좌기 | render.js scale |

### 3-18. pendulum (tools.js:makePendulum)

| 속성 | 의미 | 기본값 | 해석 위치 |
|---|---|---|---|
| `p1` | 고정점(pivot)/천장 지지대 | 드래그 시작 | render.js:pendulumGeometry |
| `p2` | 실제 추(bob) 중심 | 드래그 끝 | render.js:pendulumGeometry |
| `bobRadius` | 추 반지름 mm | `clamp(2, L×0.16, 8)` (render.js:pendulumBobRadius) | render.js:2456 |
| `showCenterGhost` | 중앙 잔상(수직 아래 점선 진자) | `true` | render.js:2490 |
| `showSymmetricGhost` | 대칭 잔상(수직선 대칭 점선 진자) | `true` | render.js:2494 |
| `showLengthLabel` | 길이 라벨 표시 | `true` | render.js:2530 |
| `lengthLabel` | 길이 라벨 텍스트 | `"L_B"` | render.js:2538 |
| `labelType` | 라벨 서체 | `"quantity"` | render.js |
| `labelSize` | 라벨 크기 mm | (인스펙터 추가; 렌더 기본 3.7) | render.js:2536 |

잔상 위치·수직 노멀은 전부 렌더 파생(pendulumGeometry) — 저장 안 함.

<!-- ===== ROTATION STORAGE ===== -->

## 4. 회전 저장 방식

근거: transform.js 회전 드래그(1256-1345), 그룹 회전(1347-1397), PageUp/PageDown 회전(840-980), `applyAngleDeg`(219-243), `rotatePolyPoints`(53-61).

| 저장 방식 | 타입 | 피벗 | 비고 |
|---|---|---|---|
| `rotation` 필드 (deg) | rect, ellipse, triangle, image, svgAsset, axes, optics, apparatus | bbox 중심 | 렌더에서 `rotate(deg cx cy)` 그룹 변환 |
| `rotation` 필드 (deg) | text | 좌상단 앵커 (x,y) | render.js:1534 |
| `rotation` 필드 (deg) | formula | 측정 박스 중심 | formula.js:373 |
| `startAngle`에 흡수 | anglearc | 꼭짓점(vertex) — x/y 불변 | 화면 CW 드래그 = startAngle 감소 (transform.js:1311) |
| `angle`에 흡수 | rightangle | 꼭짓점 | transform.js:1321 |
| **좌표에 베이크** (p1/p2 직접 회전) | line, circuit, labeler, pendulum | 그룹 회전: 그룹 bbox 중심 / labeler 단독 회전: 자체 bbox 중심 | 별도 회전 필드 없음. line/circuit의 각도는 p1→p2에서 파생(objectAngleDeg) |
| **좌표에 베이크** (points[] 직접 회전) | polyline, curve | 닫힘: 자체 bbox 중심(rotate 도구) / 열림: 그룹 회전 시 그룹 피벗 | `rotatePolyPoints` |

주의:
- line/polyline/curve의 생성 시 `rotation:0` 필드는 **사장 필드** — 어떤 코드도 읽지 않는다.
- rotate 도구의 코너 핸들 회전이 지원되는 것: 박스형 8종 + anglearc + rightangle + 닫힌 polyline/curve + labeler. line/circuit/pendulum은 rotate 도구에서도 끝점 핸들만 나온다(render.js:3220).
- pendulum은 그룹 회전 분기(transform.js:1374-1392)에 명시 케이스가 없어 박스형 else로 떨어진다 — w/h가 없어 정상 동작하지 않을 수 있음 **(확인 필요)**.

<!-- ===== FEATURE MATRIX ===== -->

## 5. 타입별 지원 기능 매트릭스

O = 지원, X = 미지원, 부분 = 조건부. 근거: transform.js(리사이즈/회전/그룹), snap.js(스냅 후보), render.js(라벨/채움/핸들), svg-export.js(내보내기).

| type | 크기조절 | 회전 | 그룹 | 스냅 후보 제공 | 라벨 | 채우기 | 내보내기 |
|---|---|---|---|---|---|---|---|
| rect | O (bbox 8핸들) | O (rotation) | O | 부분 (모서리 edge-snap 대상) | O (내부/외곽, withBoxLabel) | O | O |
| ellipse | O | O | O | 부분 (윤곽 스냅 대상) | O (withBoxLabel) | O | O |
| triangle | O | O | O | 부분 (edge-snap 대상) | X | O | O |
| line | O (끝점 p0/p1) | 부분 (끝점 드래그·그룹 회전·각도 입력; rotate 핸들 없음) | O | O (끝점) | O (labelShow/labelFlip) | X | O |
| polyline | O (꼭짓점 / 닫힘 시 bbox) | 부분 (닫힘: rotate 도구 O / 열림: 그룹 회전만) | O | O (첫·끝점, edge 대상) | X | 부분 (closed=true일 때만) | O |
| curve | O (꼭짓점 / 닫힘 시 bbox) | 부분 (polyline과 동일) | O | O (첫·끝점, 접선 대상) | X | 부분 (closed=true일 때만) | O |
| text | 부분 (단독 핸들 없음; 그룹 리사이즈 시 fontSize 스케일) | 부분 (rotation 필드는 있으나 rotate 핸들 없음 — 그룹 회전으로 설정) | O | X | — (자신이 텍스트) | X | O |
| formula | X (핸들 없음; w/h는 측정값) | 부분 (rotation 렌더는 지원, 그룹 회전 경유) | O | X | — | X | O |
| image | O (aspectLocked 기본) | O | O | X | X | X (opacity로 대체) | 부분 (exportable / 참고 이미지 제외 옵션) |
| svgAsset | O (lockAspect 기본) | O | O | X | X | X | O |
| axes | O | O | O | X | O (labelX/labelY) | X | O |
| anglearc | O (radius 스케일, 꼭짓점 고정) | O (startAngle) | O | X | O (label/showLabel) | X | O |
| rightangle | O (size 스케일) | O (angle) | O | X | X | X | O |
| labeler | O (끝점 p0/p1) | O (rotate 도구: bbox 중심 베이크) | O | X | — (자신이 라벨) | X | O |
| circuit | O (단자 끝점) | 부분 (끝점 드래그·그룹 회전·각도 입력) | O | O (양 단자) | O (몸체 위 label) | X | O |
| optics | O | O | O | 부분 (object_arrow 꼭짓점 head만) | O (showLabel; node는 labelPos) | 부분 (필드는 있으나 kind 렌더러가 대부분 무시 — 확인 필요) | O |
| apparatus | O | O | O | X | X (label 필드 사장 — 확인 필요) | 부분 (동일 — 확인 필요) | O |
| pendulum | O (pivot/bob 끝점; 그룹 리사이즈 시 bobRadius 동반 스케일) | 부분 (끝점 드래그·각도 입력; 그룹 회전 동작 확인 필요) | O | O (pivot/bob/잔상 중심) | O (lengthLabel) | X | O |

보충:
- **스냅 후보 제공**(snap.js:collectPrioritySnapPoints): line/circuit 끝점, polyline/curve 첫·끝점, optics object_arrow 화살촉, pendulum pivot/bob/잔상. 그 외 rect/triangle/line/polyline은 edge-snap **대상**(EDGE_TARGET_TYPES), ellipse/rect는 도형-도형 스냅 **이동자**(SHAPE_TYPES)로도 참여.
- **내보내기**: 모든 타입이 renderObject 경유로 SVG/PNG에 포함. 제외 규칙 — 비이미지 타입은 `exportable === false`면 숨김, image는 참고 이미지(imageSelectionLocked 또는 background+locked)를 옵션으로 제외, 레이어 `visible:false`는 전부 제외 (svg-export.js:50-55). 가이드/그리드/draft는 애초에 objects 밖이라 미포함.
- **그룹**: Ctrl+G는 타입 제한 없음 (locked 객체만 제외, transform.js:1041-1056).

<!-- ===== END ===== -->
