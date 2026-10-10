# 그래프 재구성 계약 v1

`preview/js/graph/reconstruction-contract.js`는 원본 관찰 결과와 네이티브 객체 변환 사이의 데이터 경계다. 래스터 생성·수식 자동 피팅·값 잘라 맞추기·자동 범위 조정을 수행하지 않는다. 기존 `coordplane` 및 `funcgraph`(수학 좌표, 끊김, 막대, 핸들)를 사용하기 위한 입력이다.

## API와 판정

- `GRAPH_PLAN_SCHEMA = '5e.graph-reconstruction/v1'`
- `validateGraphPlan(input, {source?})`: `{ok, plan, errors, review, blocked}` 반환. 입력을 수정하지 않는다.
- `parseGraphPlanResponse(text, options)`: JSON 하나 또는 JSON 코드 펜스 하나만 허용하고 같은 검증 결과를 반환한다.
- `buildGraphExtractionPrompt(source)`: 같은 계약 및 원본 바인딩을 포함한 관찰 프롬프트를 만든다.

관찰 프롬프트 v7은 그래프 자체를 대상으로 한다. `(가)`·`(나)` 같은 외부 패널 구분, 문제 본문과 주변 장치는 추출하지 않는다.
`kind:guide`의 `orientation:horizontal`은 관찰점에서 y축까지의 수평 점선, `vertical`은 x축까지의 수직 점선이다.
수평·수직 보조선이 함께 있으면 별도 두 항목으로 기록한다. 글씨와 점선의 출력 스타일은 네이티브 평면의
`axisLabelSize`·`tickLabelSize`·`originLabelSize`·`guideStyle`에 저장한다. 스타일 변경은 계열 좌표를 변경하지 않는다.

`ok`는 구조·범위·관계 검사 결과다. **`ok:true`여도 `blocked:true`이면 삽입하면 안 된다.** data 모드의 미확정 축, 축 생략 등 미지원 유형과 unknown 계열은 검수 후 새로운 유효 계약이 필요하다. observed 모드는 수치를 임의로 확정하지 않고 관찰 모양을 편집한다. `observed`는 형태 관찰이며 검수 의무가 자동 추가된다. 전달된 빈 review 배열로 의무를 제거할 수 없다. 실제 수치·과학적 의미의 정확성은 이 구조 검증만으로 인증되지 않는다.

## 필드

```text
schema: 5e.graph-reconstruction/v1
source: {id, hash, width, height, plotBox:{x,y,w,h}}
variant?: cartesian | axis-break | nonuniform (cartesian 외 유형은 검수 차단)
axes: {x:Axis, y:Axis, y2?:Axis}
series: Series[]
annotations: Annotation[]
review: [{path,reason,sourceBox?:{x,y,w,h}}]
```

원본 크기와 사각형은 원본 픽셀 단위다. `id/hash/width/height`는 호출자가 전달한 원본과 일치해야 한다. 호출자가 plotBox도 고정했다면 그것도 일치해야 한다. 그렇지 않으면 AI가 관찰한 plotBox를 원본 내부인지 검사한다. 원본 ID만으로 캐시를 재사용하면 안 된다.

```text
Axis = {scale:linear|unknown|log, title:string, unit:string,
        min:number|null, max:number|null, step:number|null,
        ticks?:[{value:number,label:string}],
        orientation?:horizontal|vertical|rotate}
Series = {id, kind:points|expression|bar, axis:y|y2,
          certainty:exact|observed|unknown, coordinateSpace:data|normalized,
          label?:string,
          points?:[{x,y}], breaks?:[index], endpoints?:[{index,kind:open|closed,fillLevel?,markerSize?}],
          handlesMath?:[{ix,iy,ox,oy}],
          expression?:string, domain?:{min,max},
          candidateExpression?:string, observedPoints?:[{x,y}], approximation?:object,
          items?:[{label,value}], widthRatio?:number,
          area?:{enabled:boolean,min,max}}
Annotation = {id,kind:text|point|guide|legend,text,x,y,
              axis?:y|y2,coordinateSpace?:data|normalized,
              orientation:horizontal|vertical|rotate,
              seriesId?,pointIndex?,anchorX?,sourcePointIndex?,endStyle?:open|closed|none}
```

- `exact`: 원본에 명시된 값 또는 식. 형태로 추정한 함수를 exact로 만들지 않는다.
- `observed`: 관찰한 형태. normalized는 x=왼쪽0/오른쪽1, y=아래0/위1인 표시용 위치이며 데이터값이 아니다. exact와 normalized를 함께 사용할 수 없다.
- `unknown`: 검수 필요이며 삽입 차단. 알 수 없는 축의 min/max/step은 모두 null이다. 수치 축이 없으면 data 좌표를 주장할 수 없다.
- `breaks`는 새 구간이 시작하는 점 인덱스다. 0은 허용하지 않으며 중복 없이 증가해야 한다.
- `endpoints`의 index는 같은 계열의 점을 참조한다. 필드 이름과 달리 계열 양 끝뿐 아니라 모든 내부 마커도 포함한다. open/closed를 각각 빈 원/채운 점으로 보존한다. 5개 점에 마커가 있으면 인덱스 0~4를 모두 기록한다.
- `handlesMath`는 점당 하나인 베지어 상대 제어점이며 좌표와 동일한 단위를 사용한다.
- 정확한 expression은 원본에 적힌 식의 우변과 명시 정의역을 수용한다. 원본 `y = x`는 expression `x`와 annotations의 원문 `y = x`로 구분한다. 관찰 곡선의 근사 expression은 아래 수식 편집 계약을 따른다. 식의 문법 검사는 기존 함수 샘플러에서 수행한다. 잘못된 응답을 받아서 등식 좌변을 몰래 제거하지 않는다.
- 프롬프트의 GRAPH_SOURCE_BINDING_JSON은 호출자 바인딩이며, GRAPH_PLAN_EXAMPLE_JSON / GRAPH_EXPRESSION_EXAMPLE_JSON은 검증 가능한 전체 예시다. source.plotBox는 항상 중첩 필드이며 최상위 plotBox를 수선하지 않는다. 입력 바인딩에 plotBox가 없으면 예시는 전체 이미지 사각형을 사용하되 모델은 실제 관찰 영역을 기록해야 한다.
- bar는 계열 `base` 또는 항목 `base`를 명시할 수 있다. 생략 시 0이며 축에 기준값이 없으면 삽입을 차단한다. 로그 막대의 기준값은 양수여야 한다. 항목별 `fillLevel`을 보존하며 최소값으로 기준선을 추측하지 않는다.
- area가 활성화된 y/y2 값 축에 0이 포함되지 않으면 음영 기준선을 확인해야 하므로 삽입을 차단한다. 양수·음수 구간에 임의 기준선을 추가하거나 최소값으로 잘라 맞추지 않는다.
- area는 x축까지의 음영 구간이다. 임의 영역이나 두 곡선 사이 음영으로 해석하지 않는다.
- 라벨이 없으면 빈 문자열 또는 생략을 유지한다. 단위와 첨자는 문자열의 의미를 유지하고 5E의 기존 텍스트·수식 렌더링을 사용한다.

원본·표시·데이터를 구별하는 메타데이터와 검수 항목은 변환 후에도 보존해야 한다. 사용자가 데이터로 확정하거나 편집한 뒤 이전 AI 분석 결과를 덮어쓰지 않도록 요청 세대·계약 버전·원본 해시를 묶어 관리한다.

## 예산과 실패

### 기존 표시 좌표 피팅 계약 (v18; 새 물리 복원은 아래 v20 참조)

프롬프트 v18은 원본에 인쇄된 식을 우선 사용하고, 식이 없는 연속 곡선은 관찰점과 선택적인 `candidateExpression`을 요청한다. 후보 수식을 그대로 확정하지 않는다. `preferAnalyticGraphPlan`은 선형·2/3차·역수·지수·주기·포화 형태의 짧은 수식을 표시 공간에서 대조한다. 최대 관찰점 편차는 축 높이의 0.8%이며, 중간 곡선·극값·계열 간 교점도 검사한다. 실제 물리식·단위·축 수치를 추론하는 절차가 아니다.

통과한 계열은 `kind:'expression'`, `certainty:'observed'`와 원래 `observedPoints`를 보관한다. `approximation`은 `provenance:'image-fit'`, 방법 버전, 함수 계열, 허용 오차, 최대/RMS/중간 편차 및 `errorSpace:'normalized-display'`를 담는다. 검증기는 원래 점과 수식에서 오차를 다시 계산한다. 마커 인덱스·끊김·폐곡선·산점도·수동 핸들 등을 안전하게 보존할 수 없거나 단순 수식이 기준을 통과하지 못하면 원래 점 계열을 유지한다. 원래 관찰과 맞지 않는 수식을 만들어 성공으로 세지 않는다.

수식 변환 시 점 인덱스에 연결된 표기는 `seriesId + anchorX`로 바꾼다. 원래 표기 위치와 끝점을 유지하고, 수식 편집 후 같은 x에서 계산한 높이 변화만 반영한다. 사용자가 표기를 직접 이동하면 곡선 연결을 해제한다. 네이티브 `funcgraph.expr`이 재편집 원본이며 `points`/`mathPoints`는 렌더링용 계산 결과다. data/log 축의 정규화 수식은 해당 수치축의 수식으로 변환한다.

작업 이력의 `attempts[].plan`과 `rawResponse`는 원래 추출을 보존한다. 수식 변환 결과는 별도 `acceptedPlan`과 `analyticFit`에 남고 최종 편집 결과·캐시는 검증한 수식을 사용한다. 이전 v17 캐시는 새 요청에 재사용하지 않는다. UI에서 사용자가 편집한 네이티브 객체는 최초 계획으로 다시 생성하지 않는다.

계열 32개, 계열당 점 4096개, 축당 눈금 256개, 내부 표기 256개, 검수 512개, 문자열 2048자, 응답 1 MB를 상한으로 사용한다. 수치는 유한값이며 절댓값 1e12 이하다. 순환 참조, 비JSON 값, 프로토타입 키, 과도한 깊이는 거절한다. 잘못된 좌표·끝점·축 참조와 범위 밖 데이터는 오류로 반환한다. 값을 수정해 통과시키지 않는다.

## 시험지 표현 확장 (2026-10-04)

- `coordinateMode:'observed'`는 원본의 모양을 편집하는 표시 좌표 모드다. 네이티브 평면은 0..1을 사용하고 물리량·단위·원래 축 수치는 `reconstruction.axes`에 보존한다. 모르는 수치를 발명하지 않는다. 이 모드는 `certainty:'observed'`, `coordinateSpace:'normalized'`인 점 계열 또는 검증한 근사 expression을 허용한다. 미지원 variant는 계속 차단한다. observed 모드의 로그 표기는 원래 축 메타데이터로 남고 렌더 좌표는 0..1 선형 표시 공간이다. 실제 로그 좌표 계산은 data 모드의 양수 수치축을 사용한다.
- 이 모드의 눈금은 `{value:number|null,label,position:0..1,displayMath?}`다. `position`은 표시 위치이며 `value`를 확정하지 않는다. `axisPlacement:{x?,y?}`의 각 값은 `{mode:'zero'}` 또는 `{mode:'fraction',value:0..1}`로 축선 위치를 곡선 수치와 분리한다. 파동의 중앙 기준선과 막전위의 하단 시간축을 표현한다.
- 축 `titlePosition:{x,y}`는 plotBox 기준 정규화 위치이며 영역 밖이라도 원본 이미지 내부이면 허용한다. `titleAnchor`, `displayTitle`, `displayMath`는 표시 설정이다. 원래 제목·단위와 별도로 보존한다.
- `style:{labelSize?,fontSizePx?,labelWeight?,strokeWidth?,guideStyle?}`: 크기·선 굵기는 mm, `fontSizePx`는 원본 본문 글자의 눈에 보이는 높이(px)이며 배치 크기로 환산한다. 이 경로는 `reconstruction.labelSizeMode:source-height`를 저장하고 실제 서체의 글리프 높이로 em 크기를 계산한다. 일반 그래프와 명시적인 `labelSize` mm 입력의 기존 축소 정책은 유지한다. 개별 annotation의 `fontSizePx`도 같은 높이 정책을 사용한다. `labelWeight`는 100..900, 보조선은 `{strokeWidth,dashLength,dashGap}`이다.
- 점 계열은 `curveStyle`, `handlesMode:'shape-preserving'`, `segmentModes:['line'|'smooth',...]`, `closed`, `lineStyle`, `dashLength/dashGap`, `strokeWidth`를 보존한다. 자동 곡선은 인접 관찰점의 높이 범위를 넘지 않으며 수동 핸들과 구분한다. `breaks`가 있으면 경로를 닫지 않는다.
- `arrowSpecs:[{segmentIndex,t:0..1,dir:1|-1,strokeWidth?}]`는 구간 안의 진행 방향이다. 점을 편집하면 실제 직선/곡선 접선에서 화살표를 다시 계산한다.
- 내부 표기의 `kind:'leader'|'arrow'`, `to:{x,y}`, `fontSizePx`, `fontWeight`, `displayText`를 지원한다. source 내부의 plotBox 바깥 표기를 허용하며 외부 패널 이름은 생성하지 않는다.

이 확장은 표현·편집 계약이다. 기존 모델 프롬프트가 이 필드를 모두 자동 관찰한다고 보장하지 않는다. `exam-reviewed-plans/`는 기존 실제 모델의 관찰점을 유지하고 원본을 검수하여 표시 설정을 추가한 회귀 표본이다.

구조 검증에 실패한 응답 중 원본 바인딩이 안전한 초안은 `unvalidatedPlan`으로 따로 저장한다. 삽입은 계속 차단하며 원문과 오류를 남긴다. 사용자가 유효한 검수 결과를 저장하면 정상 계획으로 전환한다. 다른 원본 응답과 안전하지 않은 JSON은 검수 초안으로 채택하지 않는다.

## 대표 표본과 검증 범위

`tests/fixtures/graph-reconstruction/`의 표본은 아래 실제 관찰 한 건을 제외하면 모두 **합성 계약 입력**이다. 실제 시험지 인식률이나 실제 AI 모델 품질을 나타내지 않는다.

| 표본 | 검증하는 계약 |
|---|---|
| linear / unlabelled | 선형 축·점 계열, 빈 라벨을 보존 |
| units-negative | 음수 범위, 단위와 의미 첨자 m/s² |
| letter-ticks | t₁/t₂ 문자 눈금과 실제 수치 위치 구별 |
| discontinuity | 구간 사이 선 연결 금지 정보 |
| open-dot | 빈 원·채운 점 인덱스 |
| shade | x축까지의 음영 구간 |
| dual-y | 오른쪽 y축 참조와 범위 |
| vertical | 내부 세로쓰기 방향 |
| observed | 정규화된 모양 관찰 및 자동 검수 의무 |
| unknown-scale | 숫자 발명 방지·삽입 차단 |
| actual-axisbreak-observation | 실제 원본의 수동 관찰, 미지원 축 생략 차단 |

실제 원본 `assets/exam-library/images/c2_2024_09_03.png`를 화면으로 확인했다. 밀도·온도(℃), −4, A/B/C 점, 점선 수선, y축의 물결 생략선이 보인다. 전체 수치 범위와 곡선 함수는 확정할 수 없다. JSON에는 원본 SHA-256과 크기를 묶고 unknown 축과 axis-break 검수만 기록했다. **실제 AI 추출 결과가 아니며 네이티브 재현 완료 표본도 아니다.**

실행: `EVIDENCE_DIR=<경로> node tests/test-graph-reconstruction-contract.mjs` (Node >=24.21.0 <25). 결과는 stdout 및 `results.json`에 시나리오별 pass 이진 판정으로 기록한다. 네이티브 삽입·편집·이동·실행 취소·저장 검증은 별도 브라우저 하네스에서 수행한다.


## 엔진 표현 계약 확장 (2026-10-05)

이 확장은 직접 구성한 입력의 표현·편집 계약이다. AI 관찰 프롬프트 v7이 아래 필드를 자동으로 추출하는 정확도는 이번 작업에서 검증하지 않았다.

- `axes.x/y/y2.scale:'log'`: data 모드의 유한 양수 min/max, 밑 10 좌표 변환과 지수 눈금. 0/음수 로그 데이터와 범위를 허용하지 않는다. normalized 위치는 실제 수치 축의 역변환을 거쳐 해당 데이터 좌표로 바뀐다.
- `frame:{variant,arrowX,arrowY,arrowY2,arrowLength,arrowWidth,strokeWidth,tickTop,tickRight}`: box 프레임, 독립 화살촉, 기본 false인 위/오른쪽 눈금. 네이티브 필드는 `axisVariant`, `axisArrow*`, `boxTickTop/Right`다.
- series의 `lineVisible`, `markerShape`, `markerSize`, `markerStrokeWidth`, `dashPattern`, 막대 항목 `fillLevel/base`를 보존한다. 범례 행도 점 기호·크기와 선 표시 여부를 지정한다.
- `regions:[{id,kind,axis,coordinateSpace,...}]`: x/y-band는 from/to, rect는 xMin/xMax/yMin/yMax, polygon은 points, between은 upperSeriesId/lowerSeriesId와 from/to를 사용한다. 농도 level와 불투명도 opacity를 보존한다. between은 같은 축의 연속 단조-x 계열만 지원하고 잘못된 구간·접힘·교차를 조용히 채우지 않는다. 기존 `area`의 0 기준 의미는 바꾸지 않는다.
- `fit`는 명시적 관찰점 보정이며 exact 거부, 허용 오차, 보호 인덱스, 끊김·직선·endpoint 보호를 적용한다. 원본 관찰점과 변경 인덱스를 저장한다. 수식 추정이나 임의의 전체 곡선 평활화가 아니다.
- 내부 표기와 범례 크기는 편집 가능하다. 표 붙여넣기는 x/y 원시 데이터를 읽으며 정확 데이터의 기본값을 임의로 매끈하게 만들지 않는다.

`tests/fixtures/graph-engine-coverage/`의 8종은 수동 엔진 검증 입력이다. 이전 관찰 자료를 시작점으로 설정을 직접 구성했고 산점도는 직접 추적했다. 추가 추적·스타일 변경은 `fidelity-provenance.json`에 기록했다. AI 호출은 0회다.


## 원본 경계 및 개별 마커 확장 (2026-10-06)

observed 모드의 0..1은 축 프레임의 표시 기준이며 곡선 제한이 아니다. 계열 점과 영역 꼭짓점은 plotBox의 0..1 밖이어도 원본 이미지 내부에 매핑되면 허용한다. 축 길이를 늘리거나 값을 잘라내지 않는다. 원본 밖의 좌표는 거절한다. data 모드의 수치 범위 검사와 눈금 position 0..1 제한은 유지한다.

`series[].endpoints[].markerSize`는 양수 개별 반지름(mm)이며 생략하면 계열 기본 크기를 사용한다. `fillLevel`은 closed 마커의 0 검정~255 흰색이다. 곡선 추적을 위한 관찰점은 실제 인쇄된 점과 다르며, 희소 마커는 endpoints로만 표시한다. 전역 markerShape와 명시한 endpoints가 중복되는 인덱스는 개별 마커가 우선한다.

`source-anchor-review.js`의 `reviewSourceAnchors(plan,raster)`는 평가용 진단이다. 실제 원본 래스터에 매핑한 곡선 관찰점의 가까운 검은 픽셀을 찾아 기본 3px 초과를 표시하며 좌표를 수정하지 않는다. 보조선·글자도 잉크이고 점선의 빈 구간은 잉크가 없으므로 자동 일치 인증이나 자동 수정 근거로 사용하지 않는다. 제품 UI의 자동 검수 기능으로 연결한 것은 아니다.


## 기준점 기반 물리 함수 복원 (2026-10-06)

추출 프롬프트 `graph-observation-v20-relation-anchors`는 모델이 곡선별 `candidateFamily`와 `relationAnchors:[{xTickLabel,yTickLabel}]`를 반환하도록 요구한다. 라벨 참조는 축의 실제 눈금 이름과 같아야 한다. 숫자 또는 같은 기호의 배수 눈금은 데이터 좌표의 단위로 사용한다. 미지 눈금은 알려진 power-law 관계로 계산될 때만 확정 기준점으로 취급한다. 그림 위치에서 임의로 반올림하여 확정하지 않는다.

`physics-family-fit-v1`은 기준점 등식부터 계수를 계산한다. 선형 계수의 독립 조건이 부족하거나, 진동의 진폭·위상·주기를 식별할 정보가 부족하면 식으로 성공 처리하지 않는다. 탐색한 지수·주기 후보도 충분한 독립 기준점을 정확히 통과해야 한다. 관찰점은 증가·감소, 의미 있는 극값, 휘는 방향, 교차 관계, 선 간 차이 검수에 사용한다. 짧은 정수·분수·두 자리 계수와 근호 계수를 우선하며, 제약을 깨는 반올림은 허용하지 않는다.

기준점의 수직 오차는 그래프 높이의 `1e-7` 이하, 관찰 선 대비 표시 좌표 거리 최대 4%, RMS 1.5% 이하를 허용한다. 이 오차는 AI가 관찰한 선과의 차이이며 원본 이미지 전체를 직접 비교한 영상 지표가 아니다. 각각 `maxDeviation`, `rmsDeviation`, `anchorDeviation`으로 보존한다. 함수의 정확한 물리적 법칙을 증명한다고 주장하지 않는다.

작업대의 신규 복원은 `requirePhysics:true`로 실행한다. 함수·기준점이 부족한 응답을 일반 이미지 회귀식으로 재변환하지 않는다. 기존 API의 명시되지 않은 과거 입력에만 기존 표시 좌표 피팅을 유지한다. 실패 곡선에는 `analyticFitFailure`를 남기며, 점 경로는 식 변환 성공에 포함하지 않는다. 산점도·닫힌 경로·구간 경계·방향 화살표는 점 객체로 보존할 수 있다. 로그축·오른쪽 축·수치 없는 도해의 기준점 기반 수식 변환은 아직 제한되며, 그려진 모양은 기존 점 그래프로 유지한다.

네이티브 그래프는 기존 ② 함수 입력칸으로 편집한다. 편집 후 관찰 오차는 재측정하지 않으므로 UI에 최초 자동 결과의 측정값임을 밝힌다. 모델은 작업대와 독립 가져오기 창에서 Sol 6.1 / medium으로 고정하고, 제공되지 않으면 대체 모델로 요청하지 않는다.


## 원본 축 화살촉 크기 보존 (2026-10-07)

`frame.arrowLength/arrowWidth`는 폭 70mm의 기준 그래프에서 사용하는 mm 값이다. 네이티브 삽입 시 두 값에 `box.w/70`을 적용하여 배치 크기에 따른 그래프 대비 비율을 유지한다. 기존 `axisArrowLength/axisArrowWidth` 편집칸을 사용하며 새 입력 항목은 만들지 않는다.

첫 복원 중 사용자 수정 지시·직전 결과·스타일 참조가 없는 요청에서 원본 래스터의 축 끝 근처를 제한된 범위로 측정한다. 축 선과 구별되는 대칭·수렴 화살촉만 길이와 폭을 수용한다. 축별 크기가 25% 이상 다르거나 불명확하면 응답의 크기를 보존한다. 측정 버전 `source-axis-arrow-size-v1`은 캐시 키에 포함한다. 원문 응답/관찰 계획은 유지하고 적용된 크기와 측정 기록은 `acceptedPlan`과 `sourceArrowSize`에 남긴다. 곡선 점·기준점·함수는 변경하지 않는다. 이번 변경은 축 화살촉 크기에 한정하며 계열 방향 화살표, 화살촉 모양, 끝 위치 자동 정렬은 포함하지 않는다.

`test-graph-source-arrow-size.mjs`와 `test-graph-source-arrow-browser.cjs`는 합성 원본의 측정→적용, 명시적 수정 지시 보존, 35/70/140mm 배치, SVG 출력(각 치수 오차 2px 이내), 저장/재열기를 검증했다. Chromium·WebKit 및 기존 엔진 렌더 회귀 검사를 통과했다. 실제 물질파 원본의 측정값은 길이 19px, 폭 x축 13px/y축 12px이며 기존 설정은 약 11px/7px다. 물질파 기준 입력 재렌더·편집·저장/재열기 결과는 `outputs/physics-arrow-20261007/`다. 신규 AI 호출 0회이며 전체 20종 자동 복원 평가가 아니다. 전체 단위 335/336 통과, 기존 PNG 압축 바이트 재현 실패 1건은 유지된다.

## 물리 평가 결과 집계 강화 (2026-10-07)

`tools/evaluate-physics-graphs.mjs`는 실제 생성한 계획/객체/SVG에 `result-audit.json`을 추가한다. 식 개수·기준점으로 계수를 계산한 식 개수·점 경로와 식 변환 실패 이유, 관찰선 대비 오차를 기록한다. 평가 목록의 기대 식 개수 충족은 물리 법칙 또는 함수 종류의 정답 인증이 아니다. 원본/출력 축 화살촉 치수는 원본 좌표의 래스터에서 독립 측정하며 각 치수 2px 이내인지 비교한다. 측정이 불명확하면 통과·불일치 대신 미측정으로 남긴다. 글자 높이는 관찰한 px 값과 네이티브 크기 설정의 대응 검사이고, 원본 OCR 또는 실제 출력 글리프 잉크 높이 일치 검사와 구별한다. 수학 폰트 임베딩도 별도로 기록한다. 가짜 굴곡 수와 물리 법칙 인증은 아직 자동 집계하지 않는다.

보고 도구는 보존된 실제 결과만 정리하고 새 AI 요청을 보내지 않는다. 과거 자료에 스타일 측정이 없으면 합격이나 실패를 발명하지 않는다. 공급자의 429/사용량/인증 오류가 발생하면 남은 입력에 같은 요청을 반복하지 않고 미실행 수를 기록한다. 원본별 해석 실패·시간 초과는 이 공급자 중단 조건과 구별한다. 제품 UI·프롬프트·기존 그래프 객체는 이 평가 도구 변경으로 수정하지 않는다.

단위 및 실제 물질파 원본을 사용한 Chromium·WebKit 검사에서 작은 화살촉 불일치 감지→수정 크기 통과, 기존 두 수식/관찰점 보존, 글자 크기 매핑/폰트 임베딩을 검증했다. 기준 입력이며 실제 AI 생성이 아니다. 과거 20개 첫 응답으로 보고서 생성도 검증했다. 현재 새 20개는 입력 해시/중복/고정 모델·프롬프트 사전검사만 통과했고 계정 사용량 제한으로 새 모델 요청 0회다. 전체 단위 338/339 통과(기존 PNG 압축 바이트 실패 1). 검증 및 보고서: `.omo/evidence/physics-audit-20261007/`, `outputs/physics-audit-20261007/`.


## 2026-10-07 관계 우선 복원 (v21)

Sol 6.1/medium 유지. 프롬프트는 graph-observation-v21-physics-processes다. 관찰점은 증거이며 식/기본 도형이 편집 원본이다. 직선·꺾은선·막대는 기본 도형 재현으로 함수 복원 실패와 구별한다.

- 극값의 y'=0 관계도 사용해 사인파 진폭·중심·주기·위상을 계산한다. 최소 3개 검증된 교대 극값에서 cos 식을 유도하며 저장 계약에서도 같은 식을 다시 계산한다.
- physicsModel:{kind:'inverse-superposition',power:-1|-2,poles:[2~4개],groupId?,ratios?,zeroTicks?,reason?}: x와 같은 단위의 특이점 항을 합한다. -2의 기본 방향은 sign(x-pole), directed:false는 방향 없는 크기다. ratios는 문제 조건이 명시한 값만 제공한다. 같은 장의 분리 구간만 groupId를 공유한다. 독립 곡선은 자동으로 계수를 공유하지 않는다.
- 눈금 접점·영점은 계수 계산 제약이다. 미확정 자유 계수는 relative-amplitude 또는 relative-amplitude-with-relations로 보고한다. 영점을 보존하는 작은 정수비와 공통 높이를 사용할 수 있지만 전하/전류 크기 인증이 아니다.
- PV 경로의 명시적 line/smooth 경계를 과정별로 분해한다. 양의 단조 곡선의 endpoint-power는 끝점 비로 지수를 계산한다. 조건 없이는 등온·단열로 확정하지 않는다. 맞춤 실패나 영역 참조 충돌이면 전체 원본 경로를 유지한다.
- 수치 없는 그림은 relative-diagram이며 원점은 그려진 축이다. 실제 단위가 아니다. 선형 눈금 축은 tick-label-units를 유지한다. 로그축/오른쪽 축은 이 추가 분해 대상이 아니다.
- 함수 방향 화살표는 점 인덱스 대신 정의역 x 접점이다. 끝점·라벨·보조선은 anchorX로 연결하며 PV 직선은 vertexBindings로 인접 함수 끝점을 따라간다. 기존 ② 함수/좌표/표시 UI를 사용한다.
- physics-relation-fit-v1 계약은 모델·계수·접점·오차를 재계산한다. 프레임 밖으로 이어지는 함수의 양 끝은 시각 비교에서만 잘라 측정한다. 내부 범위 이탈/특이점을 연결하지 않으며 식과 정의역은 유지한다.

검증: 물리 함수/관계 28시나리오, 기출 5종 Chromium/WebKit의 식 편집·연결점 변경·실행 취소·저장·재열기. 전체 단위 339/340, 기존 PNG 압축 바이트 검사 실패 1개 유지. 결과 outputs/physics-relations-20261007/. 새 AI 요청 0회, 보존 응답 재처리와 명시적 구조 보충이다. v21 AI 인식 성공률/새 20개 평가/물리 법칙 유일성 인증으로 보고하지 않는다.
