# 기출 그래프 AI → 5E 자산 명세

## 목표

기출문제 이미지 속 그래프를 한 장의 래스터 이미지로 붙이지 않고, 기존 5E 편집기가 이해하는
`coordplane`과 `funcgraph` 및 그래프 주석 데이터로 변환한다. 변환된 그래프는 이동·크기 변경,
축/눈금 수정, 계열 점 수정, 라벨과 가이드 수정이 가능해야 한다.

## 완료 기준: 구조적 동형 재현

색상과 출판물의 픽셀 질감은 평가원 흑백 스타일로 정규화해도 된다. 그러나 다음 구조는 원본과
일치해야 하며, 하나라도 유실되면 완료로 보지 않는다.

- 패널 수와 패널 배치
- 축의 개수·방향·범위·스케일·생략·이중축 여부
- 계열 수, 각 계열의 선형/곡선/산점/막대/영역 종류와 선 스타일
- 꺾임·극값·교점·불연속·열린점/닫힌점·기준점의 수학적 위치
- 눈금, 격자, 음영 구간, 범위 막대, 치수선, 가이드선, 화살표
- 라벨의 대상·문구·회전·지시선 연결과 범례 대응

`npm run audit:exam-graphs:strict`가 기출 그래프 어휘를 실제 GraphSpec/5E 컴파일 경로와 대조한다.
단순히 어휘를 알고 있는 것만으로는 통과하지 않으며, 손실 없는 네이티브 표현 경로가 없는
구성요소가 하나라도 남아 있으면 실패한다.

### 원본별 검증 게이트

- `npm run build:exam-graph-ledger`: 네 과목 아틀라스의 그래프 패널 314개를 실제 PNG의 크기·SHA-256과 연결한다.
- `npm run measure:exam-graphs`: OpenCV로 축 사각형·종횡비·격자선·표시점 후보를 제안한다. 제안값만으로는 검증 완료가 아니다.
- `tests/fixtures/exam-graphs/*.json`: 사람이 원본과 대조해 확정한 crop, 그래프 box, GraphSpec, 구조 assertion을 저장한다.
- `npm run audit:exam-graph-fixtures`: 원본 해시, 정규화 crop, 그래프 종횡비, 축 범위, 계열 종류·수,
  점 위치, 격자, 가이드, 화살표, 라벨, 음영, 축 생략, 치수선, 지시선을 다시 검사한다.
- `npm run audit:exam-graph-fixtures:strict`: 314개 fixture가 전부 검증되기 전에는 실패한다.

자동 계측은 후보 생성에만 사용한다. 축 화살촉·라벨 halo·회색 띠 때문에 선 검출이 끊길 수 있으므로,
각 fixture의 `status:verified`는 원본 육안 대조와 구조 assertion 통과가 모두 끝난 경우에만 부여한다.

## 기출 라이브러리 기준선

2026-08-10의 물리·화학·생명·지구 도판 분해 색인 전체를 검사한 결과:

- 그래프 패널 314개, 그래프가 포함된 도판 275개
- 곡선 169, 직선 78, 표시점 70
- 막대 계열 40여 패널, 원그래프 5패널
- 수선/점선 가이드 192, 격자 23, 축 생략 18
- 이중축 blocker 표기 10건
- 눈금 라벨 300, 축 제목 194, 계열/점 이름 153, 패널 이름 144

`npm run audit:exam-graphs`는 네 개 `figure-atlas*.jsonl`을 다시 읽어 새 그래프 어휘가
분류 없이 들어왔는지 검사한다. 알 수 없는 어휘가 생기면 실패시켜 조용한 래스터 폴백을 막는다.

## AI 입력 계약

기존 `5e-fast-scene@1`의 `graph` 요소를 확장한다. 이미지 모델은 픽셀이나 5E mm로 곡선의
내부 점을 추측하지 않고, 먼저 축의 수학 좌표로 복원한다. 결정론적 컴파일러가 이 좌표를
5E 세계 좌표로 변환한다.

```json
{
  "type": "graph",
  "box": [-60, -35, 110, 70],
  "xRange": [0, 5],
  "yRange": [0, 5],
  "axisVariant": "quadrant",
  "xLabel": "전압(V)",
  "yLabel": "전류(A)",
  "frame": true,
  "grid": true,
  "series": [{
    "kind": "scatter",
    "points": [
      { "x": 1, "y": 4, "label": "(가)" },
      { "x": 3, "y": 2, "label": "(나)" }
    ]
  }]
}
```

### 축과 주석

- 축: `xRange`, `yRange`, `axisVariant`, `xLabel`, `yLabel`, `originLabel`
- 간격: `xStep`, `yStep`, `y2Step`; 생략하면 축 범위에서 읽기 좋은 간격을 자동 계산
- 눈금: `showNumbers`, `tickTextX`, `tickTextY`
- 글자 크기: `axisLabelSize`, `axisLabelSizeX`, `axisLabelSizeY`, `tickLabelSize`(mm). x/y축 제목은 원본에 맞춰 독립 지정하며, 생략할 때만 공통값 또는 칸 크기에 맞춰 자동 계산
- 한글 상대 크기: `labelHangulScale`(0.5–1.5). 기본 0.72이며 평가원 원본의 한글/수식 비율을 그래프 내부 속성으로 보정
- 선 굵기: `axisStrokeWidth`, `seriesStrokeWidth`, 계열별 `strokeWidth`(0.15–2mm). 축과 데이터 계열을 독립 보정
- 틀: `grid`, `frame`
- 오른쪽 축: `y2Range`, `y2Label`, `tickTextY2`; 계열은 `axis:"y2"`
- 주석: `markers`, `guides`, `guideLines`, `labels`, `arrows`, `legends`, `axisBreaks`
- 패널: 한 장면에 여러 `graph` 요소를 넣고 각각 `panelLabel`을 둔다. 정확한 번호 위치는
  `panelLabelAt:[x,y]`의 수학 좌표로 지정하며 번호 역시 coordplane 내부 라벨로 저장된다.

### 글꼴 기울임 규칙

- **물리량 기호만 이탤릭**으로 쓴다. 예: `x`, `t`, `v`, `I`, `P`, `V`, `E`, `f`, `λ`.
- **이름표·계열명·점 이름·범주 라벨은 정자**로 쓴다. 예: `A`, `B`, `C`, `㉠`, `(가)`, `고체`, `단열`, `a에 연결`.
- 한글 설명, 숫자, 괄호, 단위는 정자로 쓴다. 예: `시간`, `전압`, `(m/s)`, `(atm)`, `100`.
- 축 제목은 물리량 문맥이므로 혼합 조판한다. `v_y (m/s)`에서는 `v_y`만 이탤릭이고 단위는 정자다.
- `series.label`과 점의 `label`은 기본적으로 이름표이므로 정자다.
- 예외적으로 라벨 자체가 물리량일 때만 `labelRole:"quantity"`를 명시한다. 기본값은 `labelRole:"label"`이다.

### 계열

- `kind:"line"`: 직선/꺾은선
- `kind:"curve"`: 앵커를 지나는 매끄러운 곡선
- `kind:"scatter"`: 선 없는 표시점 집합
- `kind:"bar"`: 막대 집합. `barWidth`, `fillStyle:white|gray|hatch` 지원
- 공통: `points`, `dashed`, `dashLength`, `dashGap`, `markers`, `label`, `labelRole`, `axis`
- 정밀 곡선: `curvature` 또는 점과 같은 길이의 `handles:[{ix,iy,ox,oy}]`. 핸들은 각 앵커 기준
  수학 좌표 오프셋이며, 5E의 베지어 핸들 편집기로 그대로 다시 열린다.
- 면적: `area:{from,to,base,level,label,edges}`
- 점/곡선 라벨: 배열점 대신 `{x,y,label,labelRole,labelSize,labelAngle,labelDistance,labelRotation,labelMarker}` 사용.
  `labelAngle`은 기준점에서 라벨이 놓일 방향, `labelRotation`은 글자 자체 회전각이며,
  `labelMarker:true`일 때만 라벨 기준점의 점을 그린다.

### 원그래프

`chartKind:"pie"`와 `values:[{value,label,tone}]`을 사용한다. 각 부채꼴은 닫힌 `polyline`,
각 글자는 `text` 자산으로 만들어져 개별 편집된다.

## 5E 출력 규칙

- 직교 그래프 한 패널 = `coordplane` 1개 + 필요한 `funcgraph` N개
- 산점도 점/점 라벨/수선/범례/축 생략은 평면의 의미 속성으로 저장
- 계열 원본은 `mathPoints`에 유지하고 렌더 좌표는 `points`에 저장
- 계열은 `planeId`로 평면과 연결하며 `positionLocked:true`로 생성
- 막대는 기존 `funcgraph.bars`, 면적은 기존 `funcgraph.area` 렌더 경로 사용
- 그래프 모달이 알지 못하는 신규 속성도 평면 객체에 남아 저장/불러오기에서 유실되지 않아야 한다.

## 현재 경계

- 색상은 현재 5E 그래프 렌더러의 흑백/회색 규칙을 따른다.
- 실제 이미지에서 축·OCR·곡선 좌표를 추출하는 비전 단계는 다음 단계다. 이번 단계는 비전 모델이
  반환할 의미 스키마와 네이티브 컴파일 결과를 고정한다.
- 3차원 그래프, 로그축, 극좌표는 현재 기출 색인 핵심 어휘에 없으며 별도 버전에서 추가한다.
