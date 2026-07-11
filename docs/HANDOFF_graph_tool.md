# 인수인계서 — 5E 그래프 도구 (feat/graph-tool)

작성: 2026-07-11. 이전 세션 컨텍스트 소진으로 새 세션에서 이어서 작업.

---

## 0-L. 최신: v0.54.30-graph — x이름 더 왼쪽 + 꺾은선 완성=Enter/우클릭 (2026-07-12, 미커밋)
1. **x이름 더 왼쪽**(coordplane): x = right+nameSize*0.06 → **right−nameSize*0.35**(팁보다 4.5mm 왼쪽 = 화살표 아래쪽).
2. **꺾은선 완성 = Enter/우클릭**(graph-modal): 미리보기 dblclick 완료 제거 → svg `contextmenu`(우클릭, preventDefault)+window `keydown` Enter(입력칸 타이핑 중 제외)로 `finishPointsSeries()`(=_sel −1). 중복점 pop 불필요. 힌트 문구 "Enter 또는 우클릭이면 완료".
검증(preview_eval,콘솔0): x이름 팁−4.5mm, 우클릭·Enter 각각 편집기 숨김(완료), 힌트 갱신.

## 0-K. v0.54.29-graph — x축 이름 = 숫자 행 baseline 정렬 (2026-07-12, 미커밋)
사용자 "빨간 점까지 이동": x이름을 **눈금 숫자·원점과 같은 줄(baseline)**에. top정렬(hanging)→baseline정렬("alphabetic")로, y=worldY0+tickGap+numSize*0.78, x=right+nameSize*0.06. 검증: x이름 baseline이 t₀ baseline과 delta 0, 화살표 우측 0.8mm. 콘솔0.

## 0-J. v0.54.27-graph — x축 이름 위치 버그 수정 (2026-07-12, 미커밋)
**"x가 전혀 이동하지 않음"**: xNameY가 `showTicks && tickMode!=="none"`일 때만 축 근처(worldY0+tickGap)였고, **눈금 라벨이 없는 기본 그래프**에선 else 분기(worldY0+tIn+nameSize*0.35 ≈ 5.5mm 아래)라 예전 위치 그대로였음. → **분기 제거, 항상 worldY0+tickGap**(축 아래 top 0.89mm, 화살표 우측). 검증: top 5.5→0.89mm, x=화살표우측 2.3mm. 콘솔0.

## 0-I. v0.54.26-graph — 세부 다듬기 7건 + 잠금 정정 (2026-07-12, 미커밋)
**잠금 정정**: "위치 고정"=평면이 아니라 **함수(계열)만** 잠금(요구). commitCreate/commitEdit에서 plane.positionLocked 제거, funcgraph만 positionLocked(prepareSeries). 의도는 `plane.seriesLock`에 저장(재편집 복원). loadFromPlane이 seriesLock 우선 로드.
1. **한글 더 작게 + 글씨크기 조절**: graph-label KO_SCALE 0.82→**0.72**. 모달에 **글씨 크기(%) 스텝퍼**(cfg.labelScale, setLabelSizes·endSize에 곱, plane.labelScale 저장, project-io 백필).
2. **원점 작게·가까이**(coordplane): addName에 size 파라미터 추가 → 원점만 nameSize*0.82, 오프셋 축소.
3. **x눈금 라벨 좌·상**: tickGap `numSize*0.1+sw*2`→**`0.04+sw*1.5`**(위), x라벨 x를 **−numSize*0.14**(좌, 첨자 보정).
4. **x축 짧게 + x이름**: PAD_X 1.9→**1.6**. x이름 = 화살표 우측(right+nameSize*0.18) 눈금줄 높이(hanging top-align, start).
5. **끝 라벨 근접**(renderFuncgraph): 오프셋 0.35→**0.18**.
6. **점선 성기게**(LINE_STYLES): 점선 0.5/1.0→**1.6/1.2**, 파선 1.4/0.6→2.4/1.3.
7. **스냅 2배**(clientToMath): 1/4→**1/8**칸.
검증(preview_eval,콘솔0): labelScale 0.8→axisLabelSize 5.2, 잠금(평면 false/계열 true), 한글 9.22, 원점 10.5, 점선 dash 1.6/1.2, xMax 5.6, 스냅 4.375 보존, x이름 화살표우측 top정렬. 아티팩트 갱신.
**남은 것**: ⑩구간 화살표 4옵션, 커밋(지시 대기).

## 0-H. v0.54.25-graph — 가로축 라벨 위로·x화살표 길게·한글 축소 (2026-07-12, 미커밋)
겹쳐비교 지적 3건:
1. **가로축 라벨 위로**(coordplane): tickGap `numSize*0.35+sw*1.5`→**`numSize*0.1+sw*2`**(축~라벨 top 4.3→1.7mm), 원점 gap `nameSize*0.35`→**0.12**.
2. **x 화살표 더 길게**(graph-modal): PAD 단일→**PAD_X=1.9 / PAD_Y=1.3**(x축 여백만 늘림). applyCfg·dataBounds·loadFromPlane 반영. 박스가 x로 더 넓어짐.
3. **한글 축소**(graph-label): 한글 런만 `KO_SCALE=0.82`배(라틴/수식은 그대로). 폭 측정도 koSize로.
검증(preview_eval, 콘솔0): x여백 1.9칸/y 1.3칸, 한글 10.5(축이름 12.8×0.82), 라벨 top gap 1.7mm. 아티팩트 갱신.
**남은 것**: ⑩구간 화살표 4옵션, 커밋(지시 대기).

## 0-G. v0.54.24-graph — x축 이름을 화살표 바로 아래 중앙정렬 (2026-07-12, 미커밋)
ㄴ/ㅏ x이름이 화살표 오른쪽으로 삐져나오던 걸 **화살표 tip 바로 아래 중앙정렬**로(coordplane: `right + nameSize*0.12, "start"` → `right, "middle"`). 검증: xName 중앙이 tip(84.8)과 일치, 축 아래. 콘솔0.

## 0-F. v0.54.23-graph — 갈고리 화살표·축여백·격자초과·라벨근접확대 (2026-07-12, 미커밋)

사용자 5건:
1. **화살표 갈고리형**(coordplane appendArrow): 단순 삼각형 → 뒤가 파인 **4점 폴리곤**(tip→날개(뒤·넓게)→notch(가운데·앞으로 파임)→날개). len sw*6.2·half 2.5·notch 2.6. 축선은 notch까지만(shaftGap=headSw*3.6)로 깔끔히 이음.
2. **축 여백**(graph-modal): PAD 0.55→**1.3**(마지막 눈금→화살표 1.3칸). 박스가 cx+1.3. **눈금/격자는 gridCountX/Y=cx로 캡**(coordplane 신규 지원) → 남는 여백은 순수 화살표 마진.
3. **격자 반칸 초과**(coordplane): `gridOver`(=0.5) — 격자 사각형이 마지막 눈금 밖으로 0.5칸 더(세로선은 데이터까지만, 가로선이 반칸 초과). 사진4.
4. **라벨 근접+확대**: tickGap tIn+numSize*0.5 → **numSize*0.35+sw*1.5**(축에 바짝). endLabel 오프셋 0.6→0.35. 크기 +30%: axisLabelSize cell*0.62→**0.8**, tick 0.52→**0.68**, endLabel 0.52→**0.68**.
- **coordplane 리팩터**: 눈금/격자/라벨 3구역이 공통 `kx`/`ky`(gridCount 캡 or tickRange) + `skipTickX/Y`(gridCount·gridToData면 atEdge 스킵 안 함) 사용. `dataBounds(plane)`(graph-modal)로 점 스냅 클램프·함수 기본정의역을 데이터 끝(눈금+반칸)까지로(화살표 마진 밖 안 나감). project-io gridOver 백필.

검증(preview_eval, 콘솔0): 화살표 4점, 마지막눈금→화살표 1.3칸, 격자 0.5칸 초과·세로격자 데이터까지, 눈금 안쪽만, 라벨 10.88/12.8(cell16). **실제 렌더 SVG 아티팩트 갱신**(사진2·3·4 비교).

**남은 것**: ⑩구간 화살표 4옵션(중간2/끝2), 러버밴드 실사용, 커밋(지시 대기).

---

## 0-E. v0.54.22-graph — 눈금 안쪽만·글씨 확대·격자 원복 (2026-07-12, 미커밋)

사용자 재지적 3건(v0.54.21의 격자 점 변경은 오해였음):
1. **격자 원복**: 점(dot) → 원래 대시(`gdash`/`sw*0.5`)로 되돌림.
2. **눈금 안쪽으로만**(coordplane, 요구 핵심): 눈금이 축 바깥으로 안 튀어나옴. x축 눈금=위로만(아래는 yBoth일 때만), y축 눈금=오른쪽만(왼쪽은 xBoth일 때만). `tHalf`(±) → `tIn=sw*3.4`(단방향). ㄴ자면 x아래·y왼쪽 미돌출. 십자는 양쪽 유지. tickGap/x이름 y도 tIn 기준으로.
3. **글씨 확대**: setLabelSizes axisLabelSize cell*0.5→**0.62**, tickLabelSize 0.42→**0.52**, endLabelSize 0.42→**0.52**.

검증(preview_eval, 콘솔0): xTicksNoBelow=true, yTicksNoLeft=true, 격자 dasharray 복귀, tick/axis 크기 상향(cell16→8.32/9.92). **실제 렌더 SVG를 직렬화해 아티팩트로 사진1과 비교 제시**(웹폰트 못 불러 수식은 세리프 대체되나 위치·크기·눈금방향은 실물).

**남은 것**: ⑩구간 화살표 4옵션(중간2/끝2), 러버밴드·스냅 실사용 확인, 커밋(지시 대기).

---

## 0-D. v0.54.21-graph — 모달 레이아웃 효율화 + 격자/눈금/스냅 (2026-07-12, 미커밋)

사용자 6건:
1. **칸 수 한 줄 + 스텝 버튼**(graph-modal HTML): 가로/세로를 한 `.gm-field`에, 각 `[−][입력][＋]`. `.gm-step`/`.gm-stepnum` CSS(style.css). bump(key,±1) 배선.
2. **축 이름 한 줄**: 가로/세로축 이름 textarea를 flex 2칸(각 rows=2)으로 나란히.
3. **격자/눈금/원점 순서 한 줄**: 체크박스 3개(+원점 0/O 토글) 한 `.gm-field`에 이 순서로.
4. **눈금 라벨 인라인**: "눈금 라벨" 제목 + [없음][숫자][직접] 버튼 한 줄. 직접입력 시 x/y 입력칸은 아래 별도 field.
5. **격자 = 점(dot), 눈금 짧게**(coordplane): 격자를 대시→**둥근 점**(dasharray `0.01 gap`+round cap, 점지름 sw*0.8, 칸당 ~5개 = cellW*0.2). 눈금 마크 tHalf sw*4→**2.6**(1.56mm, 종전 2.4). 사진2 매칭.
6. **스냅 2배 조밀**(graph-modal clientToMath): 칸의 1/2→**1/4**(0.25). 포인터 이산 간격 절반으로 정밀.

검증(preview_eval, 콘솔0): 스텝버튼 존재·동작(5→6→4)·한줄✓, 축이름 한줄✓, 격자/눈금/원점 순서 한줄✓, 눈금라벨 인라인(3버튼)✓, 격자 dotted(dash "0.01 3.24" round, w0.24, 10선)✓, 눈금길이 1.56✓, 스냅 0.25✓. 스텝숫자칸 46px.

**남은 것**: ⑩구간 화살표 4옵션(중간2/끝2), 러버밴드·스냅 실사용 확인(0폭뷰포트라 클릭시뮬 불가), 커밋(지시 대기).

---

## 0-C. v0.54.20-graph — 사진 매칭 다듬기 (2026-07-12, 미커밋)

사용자가 목표그래프(사진)와 자기 결과 비교 → 8건 지적. 반영:
1. **꺾은선 그리는 과정 노출**(graph-modal): 미리보기에서 점 계열 그릴 때 **러버밴드**(마지막 점→커서 점선 + 커서 고스트 ●), 더블클릭=완료(중복점 pop 후 _sel=-1). 기존 꺾은선 도구 느낌.
2. **정의역 적당히 벗어나기**: clientToMath 클램프를 정수 칸([0,cx])→**박스 전체([xMin,xMax] = 마지막 눈금+PAD)**로. s_A가 4t_0 살짝 넘어 내려가는 것 가능(검증: x=4.5 저장, cx=4).
3. **글씨 기본 크게**: `setLabelSizes(plane)` = axisLabelSize=cell*0.5, tickLabelSize=cell*0.42, endLabelSize=cell*0.42. buildFrame·commitEdit에서 호출(셀=w/범위). (셀 9mm→축이름 4.5, 눈금 3.8. 종전 3.5/2.6)
4. **그래프 위치 고정 옵션**: cfg.lockPosition + 모달 체크박스 "생성 후 위치 고정" → plane·계열 전부 positionLocked=true(이동 잠금, transform.js:25 isPositionMovable). 편집모드도 로드/반영.
5. **화살표 슬림하게**(coordplane appendArrow): len sw*4.6→5.4, half 1.7→1.45 (길고 뾰족).
6. **선 굵기 대비**: plane.strokeWidth=0.3(축), 계열 기본 0.5(실선 굵게). 격자=축*0.5.
7. **x축 이름 배치**(coordplane, ㄴ/ㅏ): 화살표 오른쪽옆이 아니라 **눈금 라벨과 같은 줄, 화살표 오른편**(worldY0+tickGap, start, right+size*0.12). y이름=화살표 왼쪽 위.
8. **L자 격자 데이터 밖 안 나감**: gridToData가 이미 [0..cx]×[0..cy]로 가둠 — 렌더 검증 gridOutsideData=0 확인(구버전 결과라 사진2가 튀어나온 것).

검증(preview_eval, 콘솔0): 위치고정(plane+계열 positionLocked)✓, 라벨크기 상향(4.5/3.8/3.8)✓, 선굵기(축0.3/계열0.5)✓, 정의역초과(x=4.5저장)✓, 화살표(len2.43·w1.3 슬림)✓, x이름 축아래+오른편✓, L격자 미돌출(gridOut=0)✓, 문자눈금✓. ⚠️러버밴드는 0폭뷰포트라 클릭시뮬 불가 — 코드경로만(좌표텍스트 경로는 검증). **화면 스크린샷 불가(0폭)** — 실제 화면 확인은 사용자 몫.

**남은 것**: ⑩구간 화살표 4옵션(중간2/끝2), 러버밴드 실사용 확인, 격자 점선→점(dot) 스타일 검토(사진은 점), 커밋(지시 대기).

---

## 0-B. v0.54.19-graph — 통합 제작기 개편 (사용자 감사 피드백 반영, 미커밋)

사용자 점검에서 6건 지적 → 감사 결과 원 17요구 중 4건 부분·1건 오구현·문자눈금 누락 확인 → 전면 수정:

1. **단위·괄호 정자화** (`render/graph-label.js`): 라벨 런을 한글/수식(이탤릭)/**단위(괄호 안, 정자)** 3종으로 분해. `(m/s)`·`(m/s^2)` 첨자 포함 전부 정자. ⚠️ `resolveTextFontStyle`(state.js)이 수식글꼴을 강제 이탤릭하므로 렌더 후 unit 런의 font-style만 normal로 덮어씀(폭은 normal 기준 측정이라 일치).
2. **그래프 모달 전면 개편** (`graph/graph-modal.js` 재작성): 사용자 워크플로 "**좌표 세팅 → 그 위에 함수 세팅 → 출력하면 완성**"을 한 모달에서. ① 좌표 틀(형태/칸수/축이름/원점토글/격자/눈금/눈금라벨) + ② 계열(＋함수식, ＋직선·꺾은선) + 실시간 미리보기. **직선·꺾은선은 미리보기 클릭으로 점 찍기(반 칸 스냅) 또는 좌표 텍스트 입력**("0,0 1,2 3,2") 둘 다. 만들기 = plane+funcgraph N개 한 번에(undo 1회).
   - **편집 모드**: `openGraphModal(planeId)` — plane+자식 계열 로드, 적용 시 평면 갱신(박스 x/y/w/h 보존)+계열 전량 교체. `plane.graphCfg={cx,cy}`로 칸 수 복원.
   - **원점 = 토글 버튼**(0↔O, 입력칸 제거). **눈금 표시 체크박스**(showTicks 옵션화). **눈금 라벨 3모드**: 없음/숫자/직접(문자 눈금 — 쉼표 구분 `t_0, 2t_0`, 수식 렌더).
3. **문자 눈금 렌더** (`render/coordplane.js`): `tickLabelMode`("none"/"number"/"text") + `tickTextX/Y[]`. text 모드 = 양의 k=1,2,3… 눈금에 배열 순서대로(rich 경로 renderGraphLabel → 첨자 가능). 구파일은 showTickLabels로 유도(project-io 백필).
4. **x축 이름 위치 수정** (`render/coordplane.js`): ㄴ/ㅏ에서 화살표 오른쪽 → **화살표 바로 아래**(anchor middle). 눈금 라벨 있으면 그 아래로 자동 회피(tickGap+numSize*1.35).
5. **인스펙터 슬림화** (`inspector/section-coordplane.js` 재작성): 설정 더미(형태/범위/토글들/허브) 전부 제거 → **"그래프 편집…" 버튼 + 내보내기 포함**만. 편집 버튼·더블클릭(tools.js) 모두 richLabels면 graph-modal(편집모드), 아니면 구 plane-modal.

검증(전부 preview_eval, 콘솔에러 0): 모달 생성흐름(문자눈금+함수+꺾은선4점 → 3객체 커밋)✓, 원점토글 0→O✓, 편집모드(칩 로드·칸수 5→7 적용·박스 보존·계열 재베이크)✓, 괄호정자(styles: v:italic, (m/s):normal)✓, 문자눈금 렌더✓, x이름 화살표 아래 배치✓, 눈금 on/off 렌더✓, 슬림 인스펙터✓.

**남은 것**: ⑩구간 화살표 방향 4옵션(중간2/끝2 — 현재 끝 화살표 고정, section-funcgraph), 격자 기본값 검토(현재 on), F단축키·명령팔레트가 여는 구 함수입력 모달과 통합 모달의 관계 정리(현재 공존 — 동작엔 문제 없음), 캔버스 리사이즈 재베이크(기존 백로그). 커밋은 사용자 지시 대기.

---

## 0. 새 세션 시작 명령 (이걸로 시작하세요)

새 Claude Code 세션을 **`C:\Users\user\Desktop\project\51_5E`** 에서 열고, 첫 프롬프트로:

```
branches/5E_graph_dev 워크트리(브랜치 feat/graph-tool)에서 그래프 도구를 이어서 만든다.
docs/HANDOFF_graph_tool.md 와 docs/GRAPH_TOOL_SPEC.md 를 먼저 읽고 현재 상태를 파악해라.
메모리의 5e-graph-tool 도 참고. 다음 작업 = "3입구(그래프/함수입력/계열추가)를 그래프 하나로
통합" + Phase 3(수선의발·표시점·구간화살표). 코드 건드리기 전에 현재 파일들 먼저 읽어 확인할 것.
Do not ask clarifying questions unless blocked. Make reasonable assumptions and proceed.
```

- 프리뷰: 이미 떠 있으면 재사용, 아니면 `preview_start`로 **launch.json의 "graph-dev"**(포트 8300, `branches/5E_graph_dev`) 실행. 직접 bat로 열려면 `branches/5E_graph_dev/run-server.bat`(포트 8198).
- ⚠️ **이 환경은 뷰포트 0폭** → 화면 캡처·화면좌표 클릭 시뮬 불가. 검증은 **DOM 구조/속성 + 순수함수 dynamic import**로 한다(아래 6번).

---

## 1. 위치·구조 (헷갈리지 말 것)

| 항목 | 값 |
|---|---|
| 저장소 root | `51_5E/5E_hub` (git repo) |
| 그래프 작업 워크트리 | `51_5E/branches/5E_graph_dev` ← **여기서만 작업** |
| 브랜치 | `feat/graph-tool` (base = integration-hub `0c9bd7a`) |
| 프리뷰 포트 | 8300(claude preview) / 8198(run-server.bat) |
| 화면 하단 버전표시 | `v0.54.16-graph` 로 갱신해둠(그냥 표시용, ?v=캐시버스팅과 무관) |
| 모듈 캐시버스팅 | 전 파일 `?v=0.54.16` 통일. **파일 수정 후엔 sed로 전체 bump**(6번 참고) 안 하면 브라우저가 옛 모듈 캐시함 |

**데이터 자료변환(5E_hub, integration-hub)은 손대지 않는다** — 별개. 추후 흡수 예정.
**다른 세션이 5E_hub/5E_uimodes_dev에서 병렬 작업 중** — 건드리지 말 것.

---

## 2. 핵심 아키텍처 (이미 확정·구현됨)

**새 객체 타입 안 만듦. 기존 `coordplane`(축틀) + `funcgraph`(계열) 확장.**
- 세 입구(그래프/함수입력/계열추가)가 **전부 같은 데이터 모델**을 만든다: coordplane 1개 + 그 위 funcgraph N개(같은 `planeId` 공유 → 자동으로 겹쳐 렌더).
- 그래서 "한 기능으로 통합"은 **데이터는 이미 통합**돼 있고, **UI 입구만 3개로 갈라진 것**이 문제. (사용자 지적 = 정확)

### coordplane 확장 필드 (graph-modal이 세팅)
`axisVariant`("quadrant"ㄴ/"halfcross"ㅏ/"cross"십자/"single"직선), `richLabels`(혼합 라벨러 on), `gridToData`(격자 데이터끝까지 꼬리없이), `showAxisLabelX/Y`(라벨별 on/off), `labelX/labelY`(멀티라인·수식 가능), `labelOrigin`("0"/"O"), 나머지는 기존(xMin/xMax/yMin/yMax/gridStepX/Y/showGrid/showTicks/showTickLabels/tickLabelSize/axisLabelSize/showOrigin).

### funcgraph 확장 필드
`sourceKind`("expr" 함수식 | "points" 수동클릭계열), `mathPoints[]`(points계열의 수학좌표 원본, 재투영용), `points[]`(렌더용 baked world-mm), `curveStyle`("straight" 직선/꺾은선 | "smooth" Catmull-Rom), `endLabel`(끝 라벨, 수식 가능), `dashLength/dashGap`(실선/점선), `strokeWidth`, `planeId`.

---

## 3. 완료된 것 (검증 완료)

### Phase 1 — 축틀 (신규 파일 2개 + coordplane 개편)
- **`js/render/graph-label.js`** (신규): 혼합 라벨러. export `renderGraphLabel(text, {x,y,size,color,anchor,vAlign,halo,lineGap})`, `measureGraphLabel`. 한글=돋움정자, 영문/수식=formula.js(이탤릭변수·정자숫자·첨자·분수), `\n`멀티라인, 흰 halo. **축이름·눈금·원점·끝라벨 전부 이걸 공유.**
- **`js/render/coordplane.js`** 개편: halfcross(ㅏ) 신설, xBoth/yBoth 분리, gridToData(격자 데이터끝 clean rect), tick간격 대칭, 원점 위치 variant별(ㄴ좌하/ㅏ좌측/십자중앙), rich 라벨러 통합. 새 동작은 `richLabels`/`gridToData` 플래그 분기 → **기존 함수그래프 무손상(검증됨)**.
- **`js/graph/graph-modal.js`** (신규) + `openGraphModal`: "그래프" 설정모달(형태·칸수·축이름수식멀티라인·원점0O·격자·눈금숫자 + 실시간 미리보기 renderCoordplane재사용 + 삽입). coordplane 1개 삽입.
- 등록: `templates.js`에 `graph`(kind"graph")+activateTemplate분기+아이콘. `index.html` 공통도구 그리드에 "그래프" 버튼(함수입력 옆). ※공통심볼은 index.html 하드코딩.

### Phase 2 일부 — 계열 추가 (요구 ④⑬)
- **`js/tools/click-placement.js`**: `SERIES` 도구 추가. 폴리라인처럼 클릭으로 점 찍고 더블클릭/Enter로 완료 → `commitSeries()`가 funcgraph(sourceKind:"points", curveStyle:"straight") 생성. 선택 평면 있으면 그 위에, 없으면 새 평면. mathFromWorld로 수학좌표 저장 + worldFromMath로 baked.
- **`js/render/coordplane.js`** `renderFuncgraph`: 이제 `<g>` 반환(선 path + 끝라벨). `straightPathD`(직선계열) vs `funcgraphPathD`(곡선). `endLabel`을 renderGraphLabel로 마지막 점 옆에 렌더(halo).
- **`js/render/scene.js`** `makeHitTwin`: 직선계열(sourceKind points/curveStyle straight)은 히트영역도 polyline으로(곡선 아님).
- **`js/inspector/section-funcgraph.js`**: "끝 라벨" 입력 추가. sourceKind==points면 수식/정의역 행 숨김.
- 등록: `index.html`에 "계열 추가"(data-tool="SERIES") 버튼(그래프 옆). tools.js setupButtons가 data-tool 자동 배선.

### 검증 결과(전부 DOM/순수함수로)
그래프 삽입✓, 계열 커밋(직선 M L L L)✓, 좌표왕복변환✓, 끝라벨 v_0첨자+halo✓, 인스펙터 가드✓, 콘솔에러0.

---

## 3.5 이번 세션 완료 (v0.54.17-graph, 미커밋·미푸시) — ★A 통합 + Phase 3

**전부 DOM/순수함수로 end-to-end 검증(0폭 뷰포트). 콘솔에러 0.**

### ★ A. 3입구 → "그래프" 하나로 통합 (완료)
- **좌측 툴바에서 "함수 입력"·"계열 추가" 버튼 제거** (`index.html`). 남은 그래프 입구 = "그래프" 버튼 하나.
- **함수 입력 F 단축키는 유지**: `tools.js`에서 `activateSymbolShortcut("funcgraph")`(제거된 버튼을 click하던 경로)를 **`openFunctionModal()` 직접 호출**로 교체(import 추가). 선택된 평면 위에 얹거나 없으면 새 평면.
- **`section-coordplane.js`가 허브**: 상단에 "그래프 요소" 블록 신설 — `＋ 함수`(openFunctionModal, 선택 평면 재사용), `＋ 점 계열`(setActiveTool("SERIES"), 선택 평면 재사용) + **계열 목록**(이 평면의 funcgraph 나열, 클릭 시 그 계열 선택 → 함수 인스펙터). `sync()`에서 `rebuildSeriesList` 호출.
- `tools.js`: `setActiveTool`을 **export**로 전환(허브 버튼이 SERIES 도구를 arm).

### B. Phase 3 — 점·안내선·화살표 (완료, `section-funcgraph.js`)
funcgraph 인스펙터에 "그래프 요소" 블록 추가. **전부 표준 객체 재사용**(SPEC §2) — 새 타입 없음, renderFuncgraph 무수정:
- **⑨표시점 ●**: 정의역 x 입력 → `optics/node`(검은 점) 생성. `graphRole:"marker"`, `planeId`.
- **①수선의 발**: 정의역 x 입력 → 계열 위 점에서 x축·y축으로 **점선 `line` 2개**(graphRole:"guide"). 원점 위 점이면 스킵.
- **⑩구간 화살표**: 정의역 [x₁~x₂] → 곡선을 따라간 `polyline`(arrowHead:"end", x₁→x₂ 방향, graphRole:"arrow").
- 좌표 계산: `worldYAtX(baked points[], worldX)` 선형보간 + `worldXFromMathX/worldYFromMathY`(coords.js). 계열 x범위 밖이면 alert.
- `addElements(build)`: 선택 계열+평면 찾아 build이 만든 객체들 커밋(undo 1회, 자동선택). project-io는 `{...obj}` spread라 `graphRole/planeId` 자동 보존(백필 불필요).

**캐시버스팅**: 전 모듈 `?v=0.54.17` 통일, 화면 하단 표시 `v0.54.17-graph`.

### 검증 결과(preview_eval, 실제 DOM 핸들러 구동)
plane(−5..5, 10mm/unit) + y=x 계열로: 표시점 x=1→node(60,40)✓, 수선 x=1→line 2개[(60,40)→(60,50)],[(60,40)→(50,40)] 점선✓, 화살표 −2~2→polyline[(30,70),(70,30)] arrowHead end✓, 허브 계열목록 "y=x"✓, ＋함수/＋점계열 배선✓, F단축키✓, undo 3✓, graphRole 객체 렌더 무오류✓.

### C. 더블클릭 재편집 (완료 — 결정: plane-modal 유지)
coordplane 더블클릭(tools.js:412)이 이미 `openPlaneModal`을 연다. **graph-modal(생성 마법사)보다 plane-modal이 더 완전한 편집기**라 유지하기로 결정:
- draft = 깊은복사라 **그래프 도구 플래그(richLabels/gridToData/showAxisLabelX·Y/labelOrigin) 전부 보존**(commit이 DRAFT_FIELDS만 덮어씀).
- **범위 변경 시 소속 함수 계열(expr) 자동 재샘플**(plane-modal.js:240-248) — 그래프 도구 평면에서도 검증됨.
- 검증(preview_eval): richLabels 평면 더블클릭→plane-modal 열림✓, xMax 5→8 커밋✓, 플래그 5종 보존✓, y=x 계열 새 범위로 재베이크(x=5가 world 100→76.9)✓.
- 미세 backlog: plane-modal엔 축이름 개별 on/off(showAxisLabelX/Y)가 없어(단일 showAxisLabels만) 그 토글은 개별 편집 불가 — 필요 시 plane-modal에 행 추가.

### 남은 것 (다음 세션)
- 미룸: 캔버스 드래그 리사이즈 시 마커/수선/화살표 및 점 계열 points[] 재베이크(공통 백로그), 점 계열의 비단조 x에서 화살표/보간 정확도, plane-modal 축이름 개별토글, 커밋(사용자 지시 대기).

---

## 4. (구) 다음 작업 (우선순위) — A/Phase3은 위 3.5에서 완료됨

### ★ A. 3입구 → "그래프" 하나로 통합 (사용자 최우선 요청)
현 상태: 좌측에 "그래프"/"함수 입력(F)"/"계열 추가" 3버튼. 데이터는 같은데 입구만 갈림.
**목표 UX**: "그래프" 하나로 시작 → 우측 인스펙터 "좌표평면" 패널(section-coordplane.js)이 그래프의 **컨트롤 허브**가 됨:
  - "+ 함수 추가"(openFunctionModal 재사용, 선택된 평면 위에)
  - "+ 점 계열 추가"(SERIES 도구 arm, 선택된 평면 위에)
  - 계열 목록(끝라벨·선종류 편집)
그리고 좌측 "함수 입력"·"계열 추가" 버튼 제거(또는 그래프 안으로 숨김).
- 관련: `js/inspector/section-coordplane.js`(축설정 이미 있음, 여기 이어붙임), `js/function-graph/insert.js`(insertFunctionGraph는 선택평면 재사용 규칙 이미 있음), `templates.js`(funcgraph/graph 엔트리).
- 주의: 함수입력(F 단축키)·계열추가를 아예 없애면 기존 사용자 흐름 깨질 수 있으니, 통합하되 진입만 그래프 경유로.

### B. Phase 3 — 점·안내선·화살표
- **①투영 안내선**: 점 지정 → x축·y축으로 점선 수선 + 축 위 라벨. (표준 line 객체 재사용, graphRole:"guide", planeId. worldFromMath로 배치)
- **⑨표시점(●)**: 함수/계열 위 정의역 x 지정 → 그 점에 검은 점. (node 재사용 or funcgraph.markerXs[])
- **⑩구간 화살표**: 구간 선택 → 화살표(직선도구의 중간2/끝2 옵션 체계 재사용). funcgraph.segmentArrows[] 또는 line 오버레이.

### C. 더블클릭 재편집
그래프(coordplane) 더블클릭 → 설정모달 다시 열기. (데이터자료변환엔 있었음: plane.dataPlot 스펙 저장 + tools.js dblclick 분기 패턴 참고. 단 그건 5E_hub에만 있으니 여기선 새로 구현). 지금 coordplane 더블클릭은 plane-modal.js(openPlaneModal)를 열게 돼 있음(tools.js:~412) — graph-modal로 바꿀지 결정 필요.

---

## 5. 남은 17요구 대비표
완료: ②③⑤⑥(축이름한정)⑦⑧⑪⑫⑬⑭⑮⑯⑰ + ④(계열겹치기)
남음: ①(수선의발) ⑨(표시점) ⑩(구간화살표) + 통합UI + 더블클릭재편집

---

## 6. 검증·버전 규칙 (반드시 지킬 것)
- **파일 수정 후 캐시버스팅**: `cd branches/5E_graph_dev && find js -name '*.js' -exec sed -i -E 's/\?v=0\.54\.[0-9]+/?v=0.54.NN/g' {} + && sed -i -E 's/\?v=0\.54\.[0-9]+/?v=0.54.NN/g' index.html` (NN 올림). 안 하면 리로드해도 옛 모듈 캐시됨. **state.js 등 공유모듈은 반드시 앱과 동일 ?v=**(다르면 별개 싱글턴 → 상태 갈림. dynamic import 테스트 때도 앱과 같은 버전 써야 함).
- **뷰포트 0폭**: 화면좌표 클릭/스크린샷 불가. 검증은 ①`preview_eval`로 `import('/js/x.js?v=현재버전')` 순수함수 호출 ②DOM 구조/속성 조회 ③버튼 `.click()` + 상태 확인. 화면→월드 변환 필요한 클릭은 시뮬 불가(로직은 coords.js 순수함수로 왕복검증).
- 미커밋(사용자 지시 대기). 커밋·푸시 하지 말 것.

## 7. run-server.bat 포트 정리(이미 수정함)
main=8190, hub=8199, graph_dev=8198, uimodes_dev=8197. (전부 8100 하드코딩 버그였음). 52_5E_map(별개 프로젝트)=8100.
