# 그래프 엔진 표현 확장 — 2026-10-05

목표: AI 호출 없이 기준 입력으로 평가원 그래프 형태를 재현하고, 네이티브 편집·저장·재열기를 검증한다. 이후 AI 관찰 계약을 연결한다. 원본에 없는 데이터나 함수식을 확정하지 않는다.

## 기능 목록과 실행 순서

| 기능 | 현재 한계 | 이번 수정 및 수용 기준 |
|---|---|---|
| 스타일 | 생성/복원 기본값 불일치 | 축·계열·보조선 굵기, 독립 점 크기, 화살촉 길이/폭, 파선 길이/간격을 편집·보존 |
| 프레임 | 박스형을 계열로 우회 | axisVariant:box, 축 화살표 각각 선택, 네 변·안쪽 눈금·양수 시작 범위 |
| 로그축 | 변환 차단 | xScale/yScale/y2.scale:linear 또는 log, 양수 범위, 실제 forward/inverse 변환, 지수 눈금 |
| 계열 | 복원에서 점 계열 연결 강제 | lineVisible, markerShape:none/circle/open-circle/cross/plus/square, markerSize(반지름/반폭 mm) |
| 강조영역 | 곡선 아래만 일부 지원 | x-band/y-band/rect/polygon/between 영역, 농도·구간·좌표 모드·독립 편집, 곡선 뒤 배치 |
| 곡선 | 관찰 잡음까지 보간 | 명시적 허용 오차 내 관찰 곡선 맞춤, 원본 관찰점 보관, 정확 데이터 기본 무변경, 극값/교점/구간 보호 |
| 표기 | 크기·접점 유지 불균일 | 독립 크기, 점/계열 연결, 범위 변경 시 다시 배치, 정자 라벨 |
| 막대 | 채우기 계열 구분 손실 | 항목별 fillLevel 및 위치/기준선 설정 보관 |
| 검증 | 구조 통과와 시각 품질 혼동 | 8종 데이터 기반 재현 이미지, 비교/겹침, 실제 modal 편집·undo/redo·save/reopen, 기존 회귀 |

## 공동 구현 필드

- coordplane: `xScale`, `yScale` (미지정=linear), `y2.scale`; `axisVariant:'box'`; `boxTickTop/Right`(기본 false, 활성 y2 눈금은 독립); `axisArrowX/Y/Y2` (box 기본 false, 기존 기본 true); `axisArrowLength`, `axisArrowWidth`(mm, 미지정 기존 자동 크기).
- funcgraph: `lineVisible`(기본 true), `markerShape`(기본 none), `markerSize`(mm), 기존 `dashLength/dashGap`, 선택 `dashPattern:number[]`; `markerStrokeWidth`.
- 영역은 새 객체 타입 대신 `funcgraph`, `sourceKind:'region'`, `regionSpec`, `regionFillLevel`, `regionOpacity`, `mathPoints`, `points`, `closed:true`로 저장한다. 일반 계열보다 뒤에 그린다(객체 배열에서는 앞). 영역은 그래프 편집에서 별도 목록으로 다룬다.
- regionSpec: `{id,kind:x-band|y-band|rect|polygon|between,axis:y|y2,coordinateSpace:data|normalized,from?,to?,xMin?,xMax?,yMin?,yMax?,points?,upperSeriesId?,lowerSeriesId?,level?,opacity?}`. between은 연속 단조-x 두 계열의 공통 구간, 미지원 형상은 오류로 반환한다.
- native plan: `frame:{variant,arrowX,arrowY,arrowY2,arrowLength,arrowWidth,strokeWidth,tickTop,tickRight}`, `regions:regionSpec[]`; series의 lineVisible/markerShape/markerSize/dashPattern/fillLevel 등은 위 필드로 변환한다. 기존 v1 입력도 유지한다.
- 관찰 좌표는 0..1 표시 좌표를 계속 사용한다. 수치 축의 로그 메타데이터와 실제 수치 데이터 모드를 구별한다.
- 관찰 곡선 맞춤은 `fit:{enabled,tolerance,protectedIndices?}`를 명시한 경우만 적용하며 원본 관찰점을 별도로 유지한다. 정확 데이터는 기본 무변경.

## 검증 및 보고

첨부 8종을 고정 기준으로 삼는다. 직접 구성한 엔진 검증용 입력과 기존 실제 AI 원문 결과는 별도로 표시한다. 비교는 원본 plotBox 비율을 유지하며 글꼴 교체는 제외한다. 각 기능 수정 후 단위 검사, 통합 후 실제 브라우저 편집과 저장 검사, 마지막에 비교 이미지를 검수한다. 실패 첫 결과를 보존하고 원인별 수정과 재그리기를 기록한다. AI/과금 호출은 0회다.


## 구현 상태와 제한

- 위 엔진 필드와 편집 UI를 연결했다. 원시 x/y 데이터 붙여넣기, 계열별 기호와 선, 영역 목록, 내부 표기/범례 크기를 편집한다. 로그 범위는 양수만 허용하고 무효 입력은 적용 전 거절한다.
- 영역은 범위 변경 시 스펙에서 다시 만든다. 두 곡선 사이 영역은 같은 축의 연속 단조-x 계열과 공통 구간에 한정하며 불연속·접힘·역전·교차를 허용하지 않는다. 임의 위상 영역의 일반 해법을 구현했다고 주장하지 않는다.
- 관찰점 보정은 exact를 거절하고 y의 작은 역전만 tolerance 안에서 수정한다. x와 원본 관찰점을 보존하며 양끝·큰 극값·끊김·직선·명시 보호점과 endpoint 마커를 보호한다. 과학적 접점은 연결 인덱스로 보호해야 하며 자동 의미 판단을 가정하지 않는다.
- 무변경 편집은 기존 객체 JSON을 유지한다. 범위/척도 변경에는 공통 정·역 좌표 변환을 적용하고 연결 보조선 및 핸들을 다시 배치한다. 원래 0축으로 향한 수선은 로그축의 최솟값 경계에 연결한다.


## 그래프 엔진 재현 검증 — 2026-10-05

목표는 AI 인식에 앞서 기준 입력으로 평가원 그래프를 네이티브 객체로 표현·편집할 수 있는지 확인하는 것이다. `tests/fixtures/graph-engine-coverage/`의 8종은 **수동으로 구성·보정한 엔진 검증 입력**이며 AI 호출은 **0회**다. 이전 관찰 자료를 시작점으로 사용했고 산점도와 일부 곡선 어깨는 직접 추적했다. 기존 20종 AI 첫 결과를 보정하여 성공률로 다시 집계하지 않았다.

8종 모두 필수 표현을 지원하고 실제 더블클릭, 무변경 적용, 점 수정, 다른 계열 보존, undo/redo, 저장·빈 장면에 재열기, 동일 SVG, 재편집을 통과했다. 무변경 적용은 JSON 전체를 보존한다. 로더가 추가하는 기존 기본값은 별도로 기록하고 원래 존재한 필드 값은 정확하게 비교했다. 전달 파일 8개와 8페이지 통합 파일도 다시 열어 확인했다.

**`exactVisualMatch:false`**다. 실제 비교 이미지를 검수했으며 라벨 크기·간격, 일부 수동 추적 곡선/산점 위치 근사가 남는다. 글꼴 교체는 유보했다. 이 결과는 AI 인식 품질·처리 시간·모든 그래프의 지원이나 전체 출시 게이트 통과를 증명하지 않는다. between 영역의 교차/접힘 검증 등 추가 통합 검사는 별도로 최종 결과를 기록한다.

- 보고서·비교·겹쳐 보기·SVG·개별/통합 `.5e`: `outputs/graph-engine-20261005/`
- 최종 8종 편집 시나리오 및 원본 필드 비교: `.omo/evidence/graph-engine-20261005/reference-browser-r6/`
- 전달 파일/필터/이미지 검증: `outputs/graph-engine-20261005/delivery-verification.json`
- 첫 실패와 수정 전 시각 차이도 `.omo/evidence/graph-engine-20261005/reference-browser*`에 보존한다.

단위 분류: `test-graph-log-coordinates.mjs`, `test-graph-engine-model.mjs`. 브라우저 분류: `test-graph-engine-render.cjs`, `test-graph-plane-engine-browser.cjs`, `test-graph-engine-editor-browser.cjs`. 8종 원본 검증 `test-graph-engine-reference-browser.cjs`는 ignored 로컬 원본 출력 폴더와 실행 중인 미리보기가 필요하므로 deferred 수동 원본 검사로 등록한다. 범용 CI에서 원본 없이 실행 가능한 검사로 보고하지 않는다.

## 최종 확인 — 2026-10-05

첨부 8종은 필수 표현과 실제 더블클릭 편집·undo/redo·저장 후 재열기 8/8을 통과했다. 확장 편집 검사에서는 라벨의 표시 문자열과 독립 크기, 범례 기호, 박스 눈금 옵션, 로그축의 두 곡선 사이 영역을 직접 편집해 보존했다. 독립 검수에서 발견한 표시점 보호, 연결 화살표 끝점 추적, 좁은 곡선 교차 누락을 수정하고 재검증했다. 영역 순서 검사는 모든 기존 속성과 기하를 유지하면서 새 영역을 곡선 뒤에 배치하는 정상 order 갱신을 별도로 확인한다.

최종 모델 검사 9개와 그래프 브라우저 회귀를 통과했다. 전체 단위 검사는 329개 중 328개 통과했다. 그래프 변경과 무관하고 수정되지 않은 rights-clear PNG의 압축 바이트 완전 일치 검사 1개가 실패하여 전체 통과로 기록하지 않는다. 두 PNG의 압축을 풀어 scanline 픽셀이 동일함을 확인했다(`regression-final/png-compression-difference.json`). 실행 환경의 js-yaml은 기존 integration-hub NODE_PATH로 제공했다. 증거: `.omo/evidence/graph-engine-20261005/final-verification.json`, `regression-final/unit-r2.txt`, `regression-final/editor-r6/report.json`, `model-final-r2/results.json`.

관찰점 맞춤은 허용 오차 안의 작은 반전 잡음 제거다. 포화 곡선 기준 사례는 원본을 보고 직접 정한 앵커/핸들로 재현했으며 자동 맞춤만으로 그려진 결과로 보고하지 않는다. 두 곡선 사이 영역은 모든 앵커와 표시 공간 Bezier 극값 경계를 이용해 순서를 검사하고, 계산 한도 내 순서를 확정할 수 없으면 명시적으로 거부한다.
