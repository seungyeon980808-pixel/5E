# 인수인계서 — 5E 그래프 도구 (feat/graph-tool)

작성: 2026-07-11, 갱신: 2026-07-12(v0.54.43). 컨텍스트 소진 시 새 세션에서 이어서 작업.

---

## ★★ 다음 세션 시작 (이걸 먼저 읽으세요) — 2026-07-12, v0.54.51

### 상태
- **미커밋·미푸시** (사용자 지시 대기 — **사용자가 곧 머지 예정이라 밝힘**). 워크트리 `51_5E/branches/5E_graph_dev`, 브랜치 `feat/graph-tool`, base=`0c9bd7a`, 최근 커밋 `1723f1d`(그 위 대량 미커밋 변경).
- 버전 **`v0.54.51-graph`**, 전 모듈 `?v=0.54.51`.
- **원 요구 17개 + 사용자 실사용 피드백 다수 반영 완료.** 상세 변경 로그는 아래 **0-A ~ 0-AA**(0-AA가 최신). 각 라운드 preview_eval 검증·콘솔0.
- 최근 대개편: **모달 중심 재설계**(2탭 좌표/함수 + 그래프요소를 fg에 baked) → 이후 15+회 피드백 반영.
- 0-AA: 툴 통합(텍스트+라벨러 / 각도+직각을 각각 1버튼+선택 팝오버로, 아이콘·단축키 유지)+armSymbol 하이라이트 버그 수정. 0-Z: 툴바 정리. 0-Y: 화살표 꼬리 stub clamp. **뷰포트 살아 있어 실클릭 시뮬로 검증 가능**(스크린샷은 여전히 타임아웃).

### 새 세션 시작 프롬프트(예시)
```
branches/5E_graph_dev 워크트리(feat/graph-tool)에서 그래프 도구를 이어서 만든다.
docs/HANDOFF_graph_tool.md 상단 "다음 세션 시작"부터 읽고, 최신 변경로그 0-U~0-P를 훑어 현재 상태
파악. GRAPH_TOOL_REDESIGN.md(모달 재설계 명세)·메모리 5e-graph-tool도 참고. 코드 건드리기 전
관련 파일 먼저 읽기. 다음 작업 = 사용자 실사용 피드백 또는 커밋/푸시 지시 대기.
Do not ask clarifying questions unless blocked. Make reasonable assumptions and proceed.
```

### 필수 작업 규칙 (반드시 지킬 것)
- **프리뷰**: launch.json `"graph-dev"`(포트 8300). 이미 떠 있으면 재사용, 아니면 `preview_start`.
- ⚠️ **뷰포트 0폭** → 스크린샷·화면 클릭/드래그 시뮬 **불가**. 검증은 `preview_eval`로: ①`import('/js/x.js?v=현재버전')` 순수함수/렌더 호출 ②모달을 실제 열어(openGraphModal) DOM 조작·state 심기→커밋→결과 검사(끝나면 state 원복). 마우스 배치(클릭 좌표→math)는 `getScreenCTM`이 null이라 **시뮬 불가** — 로직·데이터·렌더만 검증하고 실제 조작감은 사용자 확인.
- **파일 수정 후 캐시버스팅 전역 bump 필수**:
  `cd branches/5E_graph_dev && find js -name '*.js' -exec sed -i -E 's/\?v=0\.54\.51/?v=0.54.52/g' {} + && sed -i -E 's/\?v=0\.54\.51/?v=0.54.52/g' index.html && sed -i -E 's/v0\.54\.51-graph/v0.54.52-graph/g' index.html`
  안 하면 브라우저가 옛 모듈 캐시. **사용자에게는 항상 하드리프레시(Ctrl+Shift+R) 안내**(일반 F5는 캐시 잔존 사례 있었음).
- **커밋·푸시 금지**(사용자 지시 대기). Fable폴더·5E_hub·다른 워크트리 손대지 말 것.

### 현재 아키텍처 (중요)
- **새 객체 타입 없음**: `coordplane`(축틀+격자) + `funcgraph`(계열). 함수·직선·꺾은선·곡선 전부 funcgraph.
- **그래프 요소(표시점 ●/수선의 발/화살표)는 funcgraph에 baked**: `markers`/`guideSegs`/`arrowPolys`(세계좌표) + 원본 math 스펙 `markerXs`/`guideXs`/`arrowSpecs`. renderFuncgraph가 곡선과 함께 그림 → 미리보기·캔버스·저장·재편집 한 경로. **transform.js `mapFgElements`가 이동/리사이즈/회전 때 함께 변환**(안 하면 분리됨 — 0-T 참고).
- **묶기 기본 ON**: 생성 시 plane+fg가 같은 groupId 그룹 → 함께 이동.
- **입구**: 고급기능 "좌표(중간점)함수" 버튼(#graph-tool-open) + F 단축키 → `openGraphModal()`. 재편집=coordplane 더블클릭 / funcgraph 인스펙터 "그래프 편집…". 좌표 탭 먼저.

### 남은 것 / 백로그
1. 사용자 실사용 피드백 대기(마우스 배치·드래그 조작감은 0폭 환경에서 검증 불가 → 사용자 화면 확인 필수).
2. 그룹 리사이즈 시 funcgraph 곡선은 스케일만(재샘플 X) — 요소는 함께 감(mapFgElements). 필요 시 재샘플 결합.
3. 구 openFunctionModal(function-graph/modal.js)·data-plot.js = dead code(파일만 유지).
4. 커밋·푸시는 사용자 지시 대기.

### 핵심 파일 지도 (현행)
- `js/graph/graph-modal.js` — **통합 모달 본체**(2탭: 좌표 cfg + 함수 계열 + 미리보기 + 그래프요소 + 생성/편집). `openGraphModal(planeId?, startTab?)`. 화살표/표시점/수선 클릭 배치·곡률·자동연장·함수식 offset·배수눈금·축라벨드래그 전부 여기.
- `js/render/coordplane.js` — 좌표평면 렌더(축/격자/눈금[회색 TICK_LEVEL 140]/라벨/갈고리화살표) + `renderFuncgraph`(곡선[catmullRomPathT 곡률]+끝라벨+markers/guideSegs/arrowPolys). 축이름 `data-axisname` 태깅+오프셋.
- `js/render/graph-label.js` — 혼합 라벨러(한글정자/수식이탤릭/단위정자/멀티라인 촘촘줄간격 INTERLINE_GAP/halo/KO_SCALE).
- `js/transform.js` — **`mapFgElements`**(이동/리사이즈/회전 때 fg 요소 함께 변환), 그룹 이동·리사이즈·회전.
- `js/inspector/section-funcgraph.js` — 슬림(그래프 편집… + 곡선으로변환만). `section-coordplane.js` — 슬림(편집…+내보내기).
- `js/tools.js` — F 단축키·더블클릭 재편집(richLabels→openGraphModal), #graph-tool-open 배선.
- `js/templates.js` — graph 엔트리 hidden(고급기능 버튼으로 진입). datatable 삭제됨.
- `js/project-io.js` — `{...obj}` spread라 신규 필드 자동 보존(백필 불필요).
- 명세: `docs/GRAPH_TOOL_REDESIGN.md`(모달 재설계), `docs/GRAPH_TOOL_SPEC.md`(원 26장 기출분석+17요구).

---

## 0-AA. v0.54.50~51-graph — 툴 통합(텍스트+라벨러 / 각도+직각) + 하이라이트 버그 (2026-07-12, 미커밋)
사용자 3건:
1. **텍스트+라벨러 → 1버튼**(#tool-text-merged, 아이콘=텍스트) / **각도+직각 → 1버튼**(#tool-angle-merged, 아이콘=각도호). 누르면 옆에 **선택 팝오버**(.tool-chooser, position:fixed, 그리드 밖) → 둘 중 선택. **단축키 그대로**(T/Shift+T, A/Shift+A): 진짜 옵션 버튼(data-tool="T"/data-symbol="labeler"·"anglearc"·"rightangle")을 팝오버 안에 남겨둠 → activateSymbolShortcut의 querySelector가 숨겨진 버튼을 그대로 찾아 click(). **툴팁**: 통합 버튼 title에 두 기능 설명 함께(`&#10;` 개행).
2·3. 통합으로 자리가 나 **툴바 재배치**: 4줄=자유그리기/텍스트(통합)/각도(통합), 5줄=점/자/각도기(자·각도기를 점 옆으로).
- 배선: index.html 통합버튼+팝오버 DOM, css `.tool-chooser`/`.tool-chooser-opt`, tools.js `setupToolChoosers()`(팝오버 열기/닫기/위치·바깥클릭 닫기) + syncButtons에 통합버튼 하이라이트(activeTool T/labeler, anglearc/rightangle).
- **버그 수정(armSymbol 순서)**: `_activeSymbolId`를 맨 앞에 설정했더니, 비-심볼 도구(예: 텍스트 T)에서 심볼로 전환 시 중간의 `state.update(draft=null)`가 유발한 syncButtons(옛 도구=T)가 `!SYMBOL_TOOLS.has(T)`로 _activeSymbolId를 null로 지워 하이라이트가 사라졌음(라벨러/점 등 전부 영향받던 잠재 버그). → `_activeSymbolId` 설정을 state.update·setActiveTool **뒤로** 이동.
- 검증(preview_eval+키보드 이벤트): 행배치 [자유,텍스트,각도]/[점,자,각도기], 팝오버 열림·옵션선택→도구 arm·바깥클릭 닫힘, 단축키 T/Shift+T/A/Shift+A 전부 정상, 통합버튼·실버튼 하이라이트(라벨러 포함) 정상, node(OPTICS/node) 무손상, 콘솔0.

## 0-Z. v0.54.49-graph — 툴바 정리 + 진입 버튼 이름 변경 (2026-07-12, 미커밋)
사용자 머지 직전 마지막 정리 3건:
1. **각도 도구를 점 옆으로**: index.html 공통도구 그리드에서 anglearc 버튼의 `style="grid-column-start:1"` 제거 → 점(node) 옆으로 흐름. 결과 5줄 = 점 / 각도호 / 직각.
2. **자·각도기 한 줄 위로**: 위 변경의 자연 결과(anglearc가 새 줄을 강제하지 않으니 RULER/PROTRACTOR가 6줄로 당겨짐). RULER는 여전히 grid-column-start:1로 줄머리.
3. **"좌표(중간점)함수" → "좌표/함수 생성"**: index.html #graph-tool-open 버튼 텍스트 + templates.js graph.label + 관련 주석.
검증(preview_eval): 행 구성 [점,각도호,직각]/[자,각도기], graph 버튼 텍스트="좌표/함수 생성", anglearc 클릭 시 ARC 도구 arm, graph-tool-open 모달 열림, 콘솔0.

## 0-Y. v0.54.48-graph — 화살표 꼬리 선 밖 지그재그 stub 버그 수정 (2026-07-12, 미커밋)
사용자 스크린샷: 직선 (0,0)-(2,2)-(4,4)에 **x=1 화살표**를 찍으니 원점 근처에 이상한 꺾인 선(stub). 재현·측정: 화살표 poly가 `[(-0.8,1),(0,0),(1,1)]`. 원인 = ARROW_SPAN 1.8로 키운 뒤 꼬리 x = 1−1.8 = **−0.8**(선 시작 0보다 밖) → worldYAtX null → y가 ccy(=1)로 튀고, 사이 원점(0,0)이 poly에 끼어 지그재그.
- **수정**(bakeElements): 꼬리 x를 선의 x-범위 `[min(pts.x), max(pts.x)]`로 **clamp**. 벗어나면 끝점으로 잘려 arrow가 짧아질 뿐 stub 없음. 검증(실클릭+커밋+math역산): x=1 → poly `[(0,0),(1,1)]`(지그재그 제거·화살촉 (1,1)); x=2 → `[(0.2,0.2),(2,2)]`(정상 1.8칸); 우끝 반전 → 꼬리 clamp로 짧은 화살표. 콘솔0.

## 0-X. v0.54.46~47-graph — 화살표+50%·표시점−30%·물음표 클릭 팝오버 (2026-07-12, 미커밋)
사용자 3건:
1. **화살표 크기 +50%**: `ARROW_SPAN` 1.2→1.8(x-길이), `ARROW_SW` 신설 0.35→0.525(화살촉 두께=화살촉 크기 비례). coordplane 폴백도 0.525. 검증: 커밋 strokeWidth 0.525, x-span 1.8칸.
2. **표시점 크기 −30%**: coordplane renderFuncgraph 마커 반지름 `max(gsw*2.6,1.0)`→`max(gsw*1.82,0.7)`. strokeWidth 0.4 기준 1.04→0.728(정확히 0.70배). markerSize 명시값 있으면 그대로.
3. **물음표(?) 클릭 시 설명 팝오버**(신규 `setupHelpPopovers`): 종전엔 hover(title)만. 이제 클릭하면 title 텍스트를 배지 아래 fixed 팝오버로. 같은 배지 재클릭·바깥 클릭 시 닫힘. CSS `.gm-help-pop`. 배지 cursor help→pointer.
   - **버그 수정(중요)**: `.gm-help` 배지가 `<label class="gm-check">`(체크박스) 안에 있어(축 라벨 이동/묶기) 클릭이 라벨→체크박스로 전달돼 **두 번째 click(target=input)**이 발생, 팝오버가 떴다가 즉시 close()됨. 핸들러에 `e.preventDefault()` 추가로 라벨 전달 차단(체크박스 토글도 방지). 검증: 라벨 안 배지·span 안 배지(요소 3종) 모두 팝오버 뜸, 체크박스 미토글, 재클릭/바깥클릭 닫힘, 콘솔0.

## 0-W. v0.54.45-graph — 화살표 위치: 화살촉을 클릭 지점에 정확히 (2026-07-12, 미커밋)
사용자 재보고 "(2,2)에 찍었는데 화살표가 딴 데". 실클릭 시뮬로 측정하니 클릭 (2,2) → 화살촉이 math **2.486**(반 칸 앞)에 위치. 원인 = bakeElements가 클릭 x를 화살표 **중심**으로 삼아 구간 [x−½, x+½], 화살촉(arrowHead:"end")이 x+½에 찍힘. 눈이 가는 화살촉이 클릭점보다 앞서 "엉뚱한 데"로 보였음(0-U에서 중심배치로 바꾼 게 오히려 역효과).
- **수정**(graph-modal bakeElements 화살표 블록): **화살촉 = 클릭 x**, 꼬리 = 진행 반대쪽으로 ARROW_SPAN(1.2). poly = [꼬리 … 화살촉(마지막)] → arrowHead:"end"가 클릭 지점에 화살촉. 방향 반전(dir)은 화살촉을 그 자리에 둔 채 꼬리 쪽·화살촉 방향만 바꿈(제자리 반전 유지). 미리보기 고스트(원) 위치 = 화살촉 위치가 되어 WYSIWYG.
- 검증(실클릭+커밋+math 역산): 직선(0,0)-(3,3) (2,2)클릭 → 화살촉 (2,2)·꼬리 (0.8,0.8); 반전 → 화살촉 (2,2) 그대로·꼬리 (3.2,2); 곡선 → 화살촉이 클릭점(곡선 위)에 정확·고스트 일치. 콘솔0.

## 0-V. v0.54.44-graph — 화살표 곡선베이크 버그 수정 + 모달 UI 9건 개편 (2026-07-12, 미커밋)
**버그 "1,1에 화살표를 찍으면 엉뚱한 곳에 생성"**: 이번 세션은 뷰포트가 살아 있어(getScreenCTM 정상) **실클릭 시뮬 가능** → 꺾은선/함수식/커밋/재편집 전 경로에서 클릭 x는 정확히 저장됨을 확인. 진짜 원인 = **곡선(스무딩) 스타일**: 요소(화살표/표시점/수선)와 클릭 스냅(_selPts)이 꼭짓점을 **직선 보간**한 선 위에 베이크되는데 실제 렌더는 Catmull-Rom 곡선 → 곡률 100%에서 0.27칸, 240%에서 ~0.65칸 어긋남(화살표가 곡선에서 떠 보임). (사용자 화면이 구버전 캐시일 가능성도 → 버전 bump로 함께 해소, **하드리프레시 필수**.)
- **수정**: coordplane.js에 `smoothSamplePts(pts,t,segs=12)` 신설(렌더의 catmullRomPathT와 동일 기하로 Bézier 촘촘 샘플, export). graph-modal.js `geomPts(s,pts)` — 점 계열이 곡선 스타일이면 smoothSamplePts로 편 뒤 bakeElements/_selPts/prepareSeries(elementFields)에 사용. 함수식 계열은 이미 촘촘해 그대로.
- 검증(실클릭): 곡선 (0,0),(2,2),(4,0)에서 고스트·화살표 중점 mathY=1.125(그려진 곡선 위 정확) — 종전 직선보간이면 0.875. 커밋 arrowPolys 9점(곡선 따라감)·재편집 칩 복원·콘솔0.

**모달 UI 9건**(사용자 요구, 전부 preview_eval 검증):
1. 제목 "그래프 만들기" 오른쪽에 설명 "원하는 좌표를 설정하고 자유롭게 그래프를 그립니다."
2. 모양 라디오 → **드롭다운**(#gm-variant-sel) + 가로/세로 칸 수와 **한 줄**. 증감은 양옆 −/＋ 대신 **입력칸 ▲▼ 스핀 버튼**(.gm-spinnum, 스핀 항상 표시). gm-step/gm-stepnum·bump 배선 제거.
3. 가로축/세로축 이름 = 라벨+입력창 나란히 한 줄. 입력창 rows=1 + `field-sizing:content`(내용 길어지면 엑셀처럼 자동으로 아래로 늘어남, 35→74px 확인).
4. 축 라벨 이동 / 좌표·함수 묶기 **한 줄** + 설명은 **? 툴팁**(.gm-help, title 속성).
5. 눈금 라벨 행 flex-wrap:nowrap(한 줄 보장).
6. 좌표/성분 라벨 크기 **한 줄**, 칸 수와 같은 ▲▼ 양식.
7. 함수 탭 설명 전부 ? 툴팁으로(빈 힌트·점 찍기 안내·요소 사용법).
8. 자동 연장선 + 끝 라벨 **한 줄**(연장선 설명 ?). syncSeriesEditor autoExtRow display "inline-flex".
9. 그래프 요소 3종(표시점/수선의 발/화살표) **3열 그리드** 나란히.
- 검증: 4개 행 모두 370px 패널에 오버플로 없음·한 줄, gm-help 8개, 드롭다운/스핀/스케일 입력 동작, 편집 재진입 시 select 동기화. 콘솔0. ⚠️스크린샷은 이 환경에서 타임아웃(기존과 동일) — 실제 모양은 사용자 확인.

## 0-U. v0.54.43-graph — 탭해제·함수고급이동·데이터표삭제·눈금배수·화살표중심 (2026-07-12, 미커밋)
사용자 7건, 검증·콘솔0:
1. **좌표 탭 진입 시 함수 선택 해제**: setTab("coord")에서 _sel=-1·_placeMode·_activeDraw 리셋+재싱크.
2. **미리보기 밖 클릭 시 해제**: .gm-modal mousedown에서 target이 preview/series-editor/chips/tabs/add/actions 밖이면 _sel=-1.
3. **공통 "그래프"→고급 "좌표(중간점)함수"**: index.html 공통 graph 버튼 제거, 고급기능 data-plot 버튼→graph-tool-open("좌표(중간점)함수"). tools.js initTools에서 openGraphModal 배선. templates.js graph 엔트리 hidden:true+label 변경.
4. **데이터 표→산점도 삭제**: index.html data-plot 버튼 제거, templates.js datatable 엔트리·dataplot 분기·openDataPlotModal import 제거(data-plot.js는 dead지만 파일 유지).
5. **눈금 배수 모드**: tickMode "multiple" + cfg.tickBaseX/Y. genMultiples(base,count)=[base,2base,3base…]. applyCfg가 tickTextX=genMultiples, tickLabelMode="text". plane.graphTickMode/tickBaseX/Y 저장(재편집 복원). UI 배수 버튼+기준 입력행. 검증: "t_0"→[t_0,2t_0,…5t_0].
6·7. **화살표 클릭점 중심 배치 + 제자리 반전**: 기존은 클릭점=꼬리라 몸통이 한쪽으로(6 엉뚱), 반전 시 몸통 통째 이동(7 대칭). → 구간을 [x-½, x+½] **중심**으로. dir는 화살촉 끝만 결정(꼬리=x-dir·½, 촉=x+dir·½). 검증: dir±1 둘 다 구간 [wx(1.4),wx(2.6)] 동일, 촉만 반대편.
project-io {...obj} spread라 tickBaseX/Y·graphTickMode 자동 보존.

## 0-T. v0.54.42-graph — 요소분리 근본수정·곡률·함수식이동·화살표개편 (2026-07-12, 미커밋)
사용자 5건, 검증·콘솔0:
1. **수선/표시점/화살표 분리 근본 원인 수정**(transform.js): funcgraph 이동/리사이즈/회전 시 `points`만 변환되고 guideSegs/markers/arrowPolys는 안 됐음(=사진1 lower-left 유령). `mapFgElements(obj,orig,fn)` 헬퍼 신설, applyDelta(이동)·mapPt resize(769)·group rotate(1556)에서 points와 함께 호출.
2. **곡선 곡률 증감**(coordplane+modal): `catmullRomPathT(pts,t)`(t=텐션, k=t/6) + funcgraphPathD(pts,curvature). renderFuncgraph가 obj.curvature 전달. series.curvature(기본1, ±0.2, 0.4~2.4), UI는 **점 계열+곡선일 때만** 곡률 −/＋. 저장/로드/렌더. 검증: 140% 저장 1.4, path에 C.
3. **＋직선·꺾은선 → ＋직선·꺾은선·곡선** 라벨.
4. **함수식 자유 이동**: series.offset(math dx,dy) + applyOffset(worldPts,plane,offset). refreshPreview/prepareSeries expr 베이크에 적용, fg.offset 저장/로드. 미리보기에서 선택 expr 곡선에 투명 히트선 + mousedown 드래그(clientToWorld, window 리스너). 검증: offset {1,1}→points y 이동.
5. **화살표 클릭식 개편**: 기존 x1~x2+4방향 폐지. arrows=[{x,dir}]. "찍기"(_placeMode="arrow", 표시점/수선과 같은 위계) → 함수 클릭. bakeElements: 클릭 x에서 dir방향 ARROW_SPAN(1.2칸) 곡선 따라간 폴리라인+arrowHead end(기울기 동일). 칩 "x=N →/←", 라벨(×제외) 클릭→dir 전환. SEG_ARROW_MODES/arrowX1/X2/Dir/Add/_arrowMode 제거. 검증: 칩 →↔←, arrowSpecs {x,dir}, arrowPolys.
project-io {...obj} spread라 curvature/offset/arrowSpecs{x,dir} 자동 보존.

## 0-S. v0.54.41-graph — 라벨이동복원·줄간격·그룹통합·점선40%↓ (2026-07-12, 미커밋)
사용자 4건, 검증·콘솔0:
1. **축 라벨 이동 OFF→원위치 복원**: labelMove 해제 시 _cfg.labelXOffset/labelYOffset={0,0} 리셋. 검증: 커밋 plane offset {0,0}.
2. **멀티라인 줄간격 축소**(graph-label.js): 균일 lineHeight(size*1.3) 폐지 → 각 줄 실제 ascent/descent(한글은 koSize*0.82/0.18) + INTERLINE_GAP(size*0.12)로 촘촘히 쌓음. buildLine asc/desc를 내용 기준으로, renderGraphLabel/measureGraphLabel 재작성. 검증: "속도의\n성분\n(m/s)" 높이 21.6→15.96, 한글 줄 글자간격 ~3.5→0.72mm.
3. **격자·수선 그룹 통합**: 이미 묶기 기본 ON(task7)이라 plane+fg 동일 groupId, 수선/표시점은 fg에 baked(guideSegs/markers)라 fg와 함께 이동, 격자는 plane. 검증: groupHasPlaneAndFg·planeAndFgSameGroupId true. ⚠️사용자 사진3 분리는 묶기 前 생성 그래프거나 **그룹 리사이즈 시 funcgraph points 미재베이크**(공통 백로그) 가능성 — 이동은 통합됨.
4. **점선/파선 대시·간격 40%↓**: LINE_STYLES 점선 1.6/1.2→0.96/0.72, 파선 2.4/1.3→1.44/0.78. 수선 dash "0.9 0.7"→"0.54 0.42"(coordplane renderFuncgraph + 모달 고스트). 검증: 커밋 dashLength 0.96/dashGap 0.72, guideDash "0.54 0.42".

## 0-R. v0.54.40-graph — 좌표 탭 UI 정리 + 좌표 툴팁 (2026-07-12, 미커밋)
사용자 요구 4건, 검증·콘솔0:
1. **축 라벨 이동 토글을 축 이름 바로 아래로** 이동(묶기 필드에서 분리). 순서=세로축이름→축라벨이동→크기→묶기.
2. **가로/세로축 이름 on/off 체크박스 제거**(라벨 항상 표시). showX/showY DOM·wiring·sync 제거, defaultCfg/loadFromPlane에서 cfg.showX/showY=true 강제. applyCfg는 그대로 plane.showAxisLabelX/Y=cfg(항상 true).
3. **크기 라벨 rename**: "축 이름 크기"→**"좌표 라벨 크기"**(axisLabelScale), "눈금·성분 크기"→**"성분 라벨 크기"**(tickLabelScale).
4. **좌표 툴팁**: 함수 그리기(점 계열)·표시점/수선 배치 중 미리보기 mousemove에서 커서가 노리는 좌표 `(x, y)`를 **커서 바로 위**에 text로 표시(coordTip, 흰 halo). 배치 모드는 함수 위 점의 좌표(mathFromWorld), 그리기는 스냅 꼭짓점. ⚠️실제 표시는 0폭뷰포트라 시뮬 불가 — 요소 생성·배선만 검증.

## 0-Q. v0.54.39-graph — 자동연장선·묶기기본·빈클릭해제·글씨분리·축라벨이동 (2026-07-12, 미커밋)
사용자 요구 5건, 전부 preview_eval 검증·콘솔0:
1. **자동 연장선**(계열별 토글, 기본 off): `s.autoExtend`. 켜면 마지막 점에서 마지막 구간 방향으로 반 칸(0.5) 연장점 추가(`extendedMathPts`). 렌더·베이크(수선/표시점 매칭)엔 연장점 포함, `fg.mathPoints`(재편집 원본)엔 미포함. 파란 점 표시는 원본 s.pts만. 점 계열에만 UI 노출. 검증: points 2→3, mathPoints 2 유지, autoExtend 저장·로드.
2. **좌표·함수 묶기 = 기본 ON**: defaultCfg.lockPosition true. 검증: 체크박스 기본 체크, 커밋 시 groups 1.
3. **빈 화면 클릭 = 선택 해제**: `_activeDraw`(그리는 중인 점계열 idx) 도입. 그리는 중(_activeDraw===_sel)만 클릭=점추가·러버밴드, 그 외 빈 클릭은 `_sel=-1`(해제)→두 그래프 온전한 색. addSeries(점→_activeDraw set)·finish·칩클릭(-1)·openGraphModal(-1). 검증: 칩선택 후 svg클릭→에디터 숨김.
4. **글씨 크기 축/성분 분리**: labelScale→axisLabelScale(축 이름)+tickLabelScale(눈금·성분·끝라벨). setLabelSizes·endLabelSizeOf·applyCfg(둘 저장, labelScale=tick 호환)·loadFromPlane(신규 우선, 구 labelScale 폴백)·UI 2행·sync·wiring. 검증: 축150%→axisSize 5.1→7.9, tickSize 4.3 불변.
5. **축 라벨 이동**: cfg.labelMovable 토글 + plane.labelXOffset/labelYOffset{dx,dy}. coordplane addAxisName이 오프셋 적용+`data-axisname="x/y"` 태깅. 모달: labelMovable 켜면 미리보기 축이름 mousedown→window드래그로 오프셋 갱신+refreshPreview(clientToWorld). 검증: 태깅됨, 오프셋 dx10dy5→translate 정확히 +10+5. ⚠️실제 드래그는 0폭뷰포트라 시뮬 불가(오프셋 적용·태깅만 검증).
project-io는 {...obj} spread라 신규 필드(axisLabelScale/tickLabelScale/labelMovable/labelXOffset/labelYOffset/autoExtend) 자동 보존.

## 0-P. v0.54.38-graph — 표시점/수선 클릭 전용 + 배치 고스트 (2026-07-12, 미커밋)
사용자 요구: 표시점은 수치 입력 말고 **무조건 클릭**, 어디 찍히는지 **미리보기(고스트)**, 수선도 동일, 그리고 "수선이 제대로 생성 안 됨" 버그.
- **원인**: 표시점/수선을 점 없는(0점) 계열이나 함수 범위 밖 x에 추가할 수 있었고, 그러면 worldYAtX=null이라 안 그려지고 저장도 안 됨(사용자 스크린샷 "꺾은선 0점"+범위밖 수선 다수가 증거).
- **재설계**(graph-modal): 표시점/수선 x 수치입력+추가 버튼 **제거**, "찍기" 버튼만(클릭 전용). 배치 모드에서 미리보기 mousemove → **선택 계열 곡선 위 찍힐 점을 고스트로**(수선은 축까지 안내선 2개도) 미리 표시. 클릭은 **함수 위(worldYAtX≠null)일 때만** 등록 → 빈 계열·범위밖 찍힘 원천 차단. `_selPts`(선택 계열 baked points)를 refreshPreview에서 갱신, snapToFunc(커서 x→함수 y). 곡선 없는 계열서 arm하면 안내문구.
- 검증(preview_eval): 수치입력 제거·찍기 버튼, 빈계열 arm=고스트0+안내, 2점계열 arm=고스트1, 수선 arm=고스트1+안내선2. 콘솔0. ⚠️실제 배치 클릭은 0폭뷰포트(getScreenCTM null)라 시뮬 불가 — 고스트 생성·가드 로직만 검증, 사용자 화면 확인 필요.

## 0-O. v0.54.36~37-graph — 눈금 회색 강화 + 표시점 러버밴드 버그 (2026-07-12, 미커밋)
사용자 피드백 2건:
1. **눈금 회색 안 보임(캐시 의심)**: 코드는 정상(#737373)이었으나 더 확실히 밝게 `TICK_LEVEL 115→140`(#8c8c8c). 사용자 화면 미반영은 브라우저 캐시 가능성 → 하드리프레시(Ctrl+Shift+R) 안내.
2. **표시점 찍을 때 함수 끝에서 러버밴드 연장(버그)**: graph-modal refreshPreview의 `drawing`이 점 계열이면 항상 true라, 표시점 배치 모드(_placeMode)에서도 마지막점→커서 러버밴드가 그려짐. → `drawing = ...&& !_placeMode`. **추가**: markerClick/guideClick 토글 핸들러가 `refreshPreview()`를 안 불러 미리보기 미갱신 → 토글 시 refreshPreview() 호출 추가. 검증: 배치모드 arm 시 러버밴드·고스트 0개, 해제 시 복귀. 함수 그리기와 표시점 완전 분리.

## 0-N. v0.54.32~35-graph — 탭 모달 대개편 + 회색 눈금 (2026-07-12, 미커밋)

사용자 요구로 그래프 도구를 **모달 중심**으로 재설계. 명세=`docs/GRAPH_TOOL_REDESIGN.md`(확정 1~6·가정 A~F). show-me-the-prd로 대화 확정 후 구현. 6개 작업 전부 preview_eval 검증·콘솔0:
1. **눈금 회색**(coordplane.js): 눈금 표시선(tick marks)만 `TICK_LEVEL=115`(#737373) 회색, 축선·화살표·글자는 검정 유지. 격자 `GRID_LEVEL 135→160`(옅게)+짧은 대시(0.54, round). v0.54.32에서 눈금길이 tIn `sw*3.4→4.8`, 계열굵기 0.5→0.4, 라벨 −0.35mm(LABEL_TRIM), 위치고정=그룹묶기(positionLocked 폐지, commitCreate/Edit에서 groupId+groups).
2. **모달 2탭**(graph-modal.js): `.gm-right`를 [①좌표]+[②함수] 탭으로. `setTab()`, 미리보기 오른쪽 고정. openGraphModal(planeId, startTab="coord").
3. **선 모양(직선/곡선)**: 계열 편집기에 curveStyle 토글. prepareSeries/refreshPreview/loadFromPlane 배선.
4. **그래프 요소 모달 이관**(핵심): 표시점/수선/구간화살표(방향4옵션)를 함수 탭에서 계열별로. **Option B: fg에 세계좌표 베이크(markers/guideSegs/arrowPolys) + 원본 math 스펙(markerXs/guideXs/arrowSpecs) 저장, renderFuncgraph가 그림**(미리보기·캔버스·저장 한 경로, 재편집 라운드트립). 입력=미리보기 클릭(_placeMode)+x값 둘 다. renderFuncgraph가 renderPolyline(shapes.js) import해 화살표 그림.
5. **인스펙터 비우기**(section-funcgraph.js 재작성): 상세설정 전부 제거→"그래프 편집…"(openGraphModal)+"곡선으로 변환"만. 선 색·굵기는 공용 sec1.
6. **F 통합**(tools.js): F=openGraphModal(선택 평면/계열이면 편집모드, 없으면 새). templates.js funcinput도 openGraphModal로. 구 openFunctionModal(modal.js)은 dead code(파일 유지). + 함수 탭에 수식 도우미 버튼(sin/cos/√/π…) 이관.

**검증**: 회색눈금(#737373)·탭전환(좌표먼저)·선모양·요소(클릭arm+x값, 실시간 미리보기 circle/점선/화살표, 커밋 markers/guideSegs/arrowPolys+스펙, 재편집 칩복원)·인스펙터2버튼·도우미16개·F단축키(통합모달 좌표탭, 구모달 안뜸)·전체흐름(sin(x)+직선+표시점+화살표 커밋) 전부 통과. **미룸(P3)**: 미리보기 정의역 드래그 핸들 이관, 눈금 톤 실사용 확인, 편집모드 탭 기억.

## 0-M. v0.54.31-graph — ⑩ 구간 화살표 방향 4옵션 (2026-07-12, 미커밋)

유일하게 남았던 원 요구 ⑩ 구현 완료. 새 객체 타입 없이 기존 `polyline.arrowHead`/`arrowVariant`(직선 도구 `lineMode`/`middleArrow` 규약)를 재사용.

1. **`render/shapes.js` renderPolyline "center" 분기**: 중간 화살표에 `arrowVariant`(`"left"`=역방향/`"right"`·미지정=정방향, renderLine의 middleArrow와 동일 규약) 반영 — `polylineMidpoint`가 주는 진행방향(dx,dy)에 `flip = arrowVariant==="left" ? -1 : 1`을 곱함.
2. **`inspector/section-funcgraph.js` 구간 화살표 UI**: "화살표 방향" 4버튼 행 신설(끝→/끝←/중간→/중간←) — `SEG_ARROW_MODES` 테이블(값→{arrowHead, arrowVariant}) + 로컬 `segArrowMode`(토글, 액티브 버튼 하이라이트). "추가" 클릭 시 이 모드를 읽어 생성되는 polyline에 `arrowHead`(`end`/`start`/`center`)와 `arrowVariant`(center일 때만)를 배선. 잠금 시 4버튼 모두 비활성.
   - 끝→=`arrowHead:"end"`(기존 기본값과 동일, 하위호환), 끝←=`arrowHead:"start"`, 중간→=`arrowHead:"center",arrowVariant:"right"`, 중간←=`arrowHead:"center",arrowVariant:"left"`.
3. project-io는 `{...obj}` spread라 `arrowVariant` 백필 불필요(기존 line/polyline이 이미 쓰던 필드).

검증(preview_eval, 콘솔0): `renderPolyline({arrowHead:"center",arrowVariant:...})` 3종(undefined/right/left) — right·undefined 화살촉 폴리곤 동일(진행방향), left는 반대방향 확인. 인스펙터 4버튼 DOM 존재·클릭 시 활성 스타일 토글 확인. **state 싱글턴에 실제 coordplane+funcgraph 심어 4모드 각각 "추가" 클릭 → 생성된 polyline의 arrowHead/arrowVariant 4종 전부 기대값 일치** (끝→=end/-, 끝←=start/-, 중간→=center/right, 중간←=center/left). 잠금 시 4버튼 disabled 확인. 테스트 후 state 원복(라이브 캔버스 오염 없음).

**남은 것**: 사용자 실사용 피드백, 커밋(지시 대기).

## 0-L. v0.54.30-graph — x이름 더 왼쪽 + 꺾은선 완성=Enter/우클릭 (2026-07-12)
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

## 5. 17요구 대비표 — 전부 완료
①(수선의발)②③④(계열겹치기)⑤⑥⑦⑧⑨(표시점)⑩(구간화살표 방향4옵션, v0.54.31)⑪⑫⑬⑭⑮⑯⑰ + 통합UI(★A) + 더블클릭재편집(C). 남은 건 사용자 실사용 피드백과 커밋/푸시 지시뿐.

---

## 6. 검증·버전 규칙 (반드시 지킬 것)
- **파일 수정 후 캐시버스팅**: `cd branches/5E_graph_dev && find js -name '*.js' -exec sed -i -E 's/\?v=0\.54\.[0-9]+/?v=0.54.NN/g' {} + && sed -i -E 's/\?v=0\.54\.[0-9]+/?v=0.54.NN/g' index.html` (NN 올림). 안 하면 리로드해도 옛 모듈 캐시됨. **state.js 등 공유모듈은 반드시 앱과 동일 ?v=**(다르면 별개 싱글턴 → 상태 갈림. dynamic import 테스트 때도 앱과 같은 버전 써야 함).
- **뷰포트 0폭**: 화면좌표 클릭/스크린샷 불가. 검증은 ①`preview_eval`로 `import('/js/x.js?v=현재버전')` 순수함수 호출 ②DOM 구조/속성 조회 ③버튼 `.click()` + 상태 확인. 화면→월드 변환 필요한 클릭은 시뮬 불가(로직은 coords.js 순수함수로 왕복검증).
- 미커밋(사용자 지시 대기). 커밋·푸시 하지 말 것.

## 7. run-server.bat 포트 정리(이미 수정함)
main=8190, hub=8199, graph_dev=8198, uimodes_dev=8197. (전부 8100 하드코딩 버그였음). 52_5E_map(별개 프로젝트)=8100.
