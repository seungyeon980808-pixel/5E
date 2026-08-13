# 5E 좌표·함수 네이티브 기능 지도

작성 기준: 2026-08-10 현재 코드. 이 문서는 기출 그래프 변환기가 사용해도 되는 기능과 사용하면 안 되는 우회 방식을 고정한다.

## 1. 핵심 구조

- 좌표 틀은 `coordplane` 객체 하나가 소유한다.
- 각 데이터 계열은 같은 `planeId`를 가리키는 `funcgraph` 객체가 소유한다.
- 그래프 모달은 `coordplane + funcgraph N개`를 한 번에 만들고 다시 편집한다.
- `points`는 캔버스에 실제로 그리는 월드 mm 좌표이고, `mathPoints`·수식·원본 요소 스펙은 재편집과 재투영에 사용한다.
- 좌표와 계열을 함께 움직일 때는 동일 `groupId`를 사용한다.
- 새 그래프 전용 객체나 래스터 이미지를 만들지 않는다.

실제 생성 경로: `js/graph/graph-modal.js`의 `applyCfg → buildFrame → prepareSeries → commitCreate/commitEdit`.

## 2. coordplane이 자체적으로 해결하는 기능

### 축과 범위

| 기능 | 네이티브 필드 | 편집 경로 |
|---|---|---|
| 십자·ㄴ자·ㅏ자·직선 축 | `axisVariant` (`cross`, `quadrant`, `halfcross`, `single`) | 좌표 탭 형태 선택 |
| 양·음 방향 범위 | `xMin/xMax/yMin/yMax`, `graphCfg` | x+/x−/y+/y− 범위 |
| 축 끝 화살표 여백 | `padXPos/padXNeg/padYPos/padYNeg` | 고급 옵션 |
| 회전·박스 크기 | `x/y/w/h/rotation/lockAspect` | 캔버스 변형 |
| 오른쪽 y축 | `y2.enabled`, `y2Min/y2Max`, `labelY2`, `tickTextY2`, `showTickY2` | 오른쪽 세로축 옵션 |

### 격자와 눈금

| 기능 | 네이티브 필드 | 비고 |
|---|---|---|
| 격자 표시 | `showGrid` | 평가원식 옅은 점선 |
| x/y 격자 간격 | `gridStepX/gridStepY` | 축별 독립 |
| 비대칭 격자 칸 수 | `gridCountXPos/Neg`, `gridCountYPos/Neg` | 축 팔별 독립 |
| 격자 끝 돌출 범위 | `gridOverXPos/Neg`, `gridOverYPos/Neg` | 네 방향 독립 |
| 눈금선 표시 | `showTicks` | 축과 별도 |
| 숫자 눈금 | `showTickLabels`, `tickLabelMode:"number"` | 자동 숫자 |
| 직접 문자 눈금 | `tickTextX/tickTextY`, `tickLabelMode:"text"` | 첨자·수식 혼합 가능 |
| 배수 문자 눈금 | `graphTickMode:"multiple"`, `tickBaseX/Y` | `t₀, 2t₀, 3t₀…` |
| 눈금별 위치 조정 | `tickOffX/tickOffY` | 별도 텍스트 객체 불필요 |

### 축 이름과 원점

| 기능 | 네이티브 필드 | 비고 |
|---|---|---|
| x/y 축 이름 | `labelX/labelY` | `renderGraphLabel` 사용 |
| 축 이름별 표시 | `showAxisLabelX/Y` | 독립 on/off |
| 축 이름 크기 | `axisLabelSize`, `axisLabelScale` | 셀 크기 연동 |
| 축 이름 위치 | `labelXOffset/YOffset`, `labelXPos/YPos` | 드래그 재편집 가능 |
| 축 이름 분수 | `labelX/labelY` 안의 `\\frac{분자}{분모}` | 수식 객체 없이 라벨 내부 렌더 |
| 가로 y축 제목 | `labelYLayout:"horizontal"` | 분수·일반 문장용 기본 모드 |
| 평가원식 세로 y축 제목 | `labelYLayout:"vertical"` | 탭으로 나눈 복수 세로 열 |
| 원점 | `showOrigin`, `labelOrigin` | `0`, `O`, 사용자 값 |

### 좌표평면 독립 표시 기능

| 기능 | 네이티브 필드 | 저장 좌표 |
|---|---|---|
| 자유 표시점 | `annMarkers` | 수학 좌표 |
| 자유 수선 | `annGuides` | 수학 좌표 |
| 자유 화살표 | `annArrows` | 수학 좌표와 방향 |
| 두 점 가이드라인 | `guideLines` | 수학 좌표 두 점 |
| 점+이름 라벨 | `annLabelPoints` | 점, 글자, 거리, 각도, 크기 |
| 범례 | `legends` | 위치와 행별 선 견본·문자 |
| 음영 구간 | `bands` | 축, 시작값, 끝값, 명도, 라벨 |
| 축 생략 표시 | `axisBreaks` | 축, 위치, 크기 |
| 사각 프레임 | `showFrame` | 산점도·막대형 외곽판 |
| 범위 막대 | `ranges` | 두 수학 좌표, 끝막대, 라벨 |
| 치수선 | `dimensions` | 두 수학 좌표, 끝 형식, 라벨 |
| 지시선 | `leaders` | 두 수학 좌표, 라벨 |

`annLabelPoints`와 범례 문자는 `coordplane` 내부 데이터다. 독립 `text` 객체를 위에 얹는 방식과 다르며, 그래프 편집·이동·리사이즈에 종속된다.

## 3. funcgraph가 자체적으로 해결하는 기능

### 계열 종류

| 종류 | 핵심 필드 | 네이티브 동작 |
|---|---|---|
| 해석 함수 | `expr`, `domainMin/Max`, `domainAuto`, `rangeMin/Max` | 파서·샘플러로 재생성 |
| 직선·꺾은선 | `sourceKind:"points"`, `mathPoints`, `curveStyle:"straight"` | 수학 점 재편집 |
| 자동 곡선 | `curveStyle:"smooth"`, `curvature` | 점을 통과하는 Catmull-Rom |
| 자유 베지어 | `handles`, `handlesMath` | 앵커별 입·출 제어점 |
| 막대 | `sourceKind:"bar"`, `barItems`, `barWidthRatio`, `barFill`, `bars` | funcgraph 내부 막대 렌더 |

### 계열 스타일과 부가 기능

| 기능 | 네이티브 필드 |
|---|---|
| 실선·점선·파선 | `dashLength/dashGap` |
| 선 굵기·회색도 | `strokeWidth/strokeLevel` |
| 좌/우 y축 선택 | `axis:"y"` 또는 `"y2"` |
| 끝 라벨 | `endLabel/endLabelSize` |
| 자동 연장 | `autoExtend` |
| 함수 평행 이동 | `offset {dx,dy}` |
| 불연속 구간 | `breaks` |
| 곡선 아래 면적 | `area {from,to,baseY,level,edges,label}` |

### 계열에 붙는 표시 요소

| 기능 | 재편집 원본 | 렌더 데이터 |
|---|---|---|
| 표시점 | `markerXs` | `markers` |
| 축까지 수선 | `guideXs` | `guideSegs` |
| 접선 방향 화살촉 | `arrowSpecs` | `arrowMarks` |

이 요소들은 `funcgraph` 내부에 저장된다. 곡선과 함께 이동·회전·리사이즈되며 별도 점·선·텍스트 객체를 생성하지 않는다.

## 4. 막대 채우기 규약

그래프 모달이 쓰는 정식 변환은 다음과 같다.

| 사용자 선택 | `bars.fillStyle` | `bars.fillLevel` |
|---|---:|---:|
| 회색 | `solid` | `170` |
| 흰색 | `solid` | `255` |
| 빗금 | `hatch` | `0` |
| 점 | `dots` | `0` |
| 교차 | `cross` | `0` |

`fillStyle:"gray"`는 공용 채우기 엔진의 정식 값이 아니다. 변환기가 이 별칭을 그대로 렌더 객체에 넣으면 회색 막대가 흰색으로 보일 수 있다.

## 5. 편집·변형·저장 계약

- 더블클릭 재편집은 `openGraphModal(planeId)`로 동일 모달을 연다.
- 편집 시 평면 박스는 유지하고 계열을 네이티브 원본 스펙에서 다시 만든다.
- `project-io.js`는 coordplane과 funcgraph 필드를 보존하고 구버전 기본값을 보충한다.
- `transform.js:mapFgElements`는 `markers`, `guideSegs`, `arrowMarks`, 베지어 핸들을 계열 본체와 같이 변형한다.
- 그룹 리사이즈는 평면과 funcgraph를 같은 비율로 변형한다.
- 내보내기는 일반 5E 장면 렌더 경로를 그대로 사용한다.

## 6. 변환기가 금지하는 우회 방식

- 원본 이미지 또는 잘라낸 그래프를 캔버스에 이미지로 삽입하지 않는다.
- 축 제목을 독립 `text`/`formula` 객체로 덮지 않는다.
- 눈금 문자를 독립 텍스트 객체로 배치하지 않는다.
- 계열명을 독립 텍스트 객체로 붙이지 않는다.
- 점 이름을 독립 텍스트로 붙이지 않는다. `annLabelPoints`를 사용한다.
- 막대 이름을 독립 텍스트로 붙이지 않는다. `barItems[].label`을 사용한다.
- 면적 라벨을 독립 텍스트로 붙이지 않는다. `area.label`을 사용한다.
- 범례를 선·상자·텍스트 객체 묶음으로 흉내 내지 않는다. `legends`를 사용한다.
- 수선과 화살표를 곡선 위에 별도 선으로 덧씌우지 않는다. 계열 또는 평면의 네이티브 표시 필드를 사용한다.
- 네이티브 기능이 부족하면 fixture를 우회 제작하지 않고 먼저 그 기능을 확장한다.

## 7. 현재 확인된 기능 공백 또는 연결 오류

- GraphSpec 막대 변환은 모달의 `barFillFields` 규약으로 교정되었다. 회색은 `solid + 170`이다.
- 축별 눈금 표시용 `showTickX/showTickY`가 coordplane에 추가되었고 GraphSpec의 `ticksX/ticksY`와 연결되었다.
- 범위선·치수선·지시선은 별도 선·텍스트 객체 대신 coordplane 내부 수학 좌표 필드로 흡수되었다.
- 축 라벨은 `\\frac{}{}` 분수를 직접 소유하며, y축 가로/세로 모드를 그래프 편집기에서 선택한다.
- 막대 범주 A·B·C와 Ⅰ·Ⅱ·Ⅲ은 변수 수식이 아니라 이름표이므로 네이티브 막대 렌더에서 정자로 표시한다.
- 현재 범례 렌더는 선 견본 중심이다. 막대용 흰색·회색·빗금 사각 견본은 네이티브 범례 확장이 필요하다.
- 평면 범위 변경 뒤 계열의 표시점·수선·화살표를 재베이크하는 일부 구형 편집 경로에는 알려진 한계가 있다. 통합 그래프 모달 경로를 기준으로 검증한다.

## 8. 변환 테스트 재개 조건

다음 항목을 모두 만족한 뒤 기출 변환을 다시 시작한다.

1. GraphSpec의 각 필드가 위 네이티브 필드 하나로 명확히 매핑된다.
2. 별도 텍스트 객체가 생성되지 않는다는 자동 검사가 통과한다.
3. 생성 결과를 그래프 모달로 다시 열어 축·계열·라벨·표시 요소가 편집된다.
4. 이동·그룹 리사이즈 후 계열과 표시 요소가 분리되지 않는다.
5. 저장 후 다시 열어 동일 필드가 보존된다.
6. 실제 렌더에서 회색 막대, 눈금 on/off, 라벨 위치가 네이티브 모달 결과와 동일하다.

## 9. 코드 근거

- 통합 생성·재편집: `js/graph/graph-modal.js`
- 좌표·함수 렌더: `js/render/coordplane.js`
- 혼합 그래프 라벨: `js/render/graph-label.js`
- 수학↔월드 좌표: `js/function-graph/coords.js`
- 수식 파서·샘플러: `js/function-graph/parser.js`, `sampler.js`
- 기본 좌표평면: `js/function-graph/defaults.js`
- 변형 종속성: `js/transform.js`
- 저장·마이그레이션: `js/project-io.js`
- MCP 생성 경로: `tools/mcp-5e/lib/builders.js`, `schema.js`
