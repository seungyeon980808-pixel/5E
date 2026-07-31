# 새 세션용 프롬프트 — 생명과학·지구과학 도판 실태 조사

> 물리는 483장 전수 분해가 끝났고(`figure-atlas.jsonl`), 화학은 280장 전수 분해를
> 별도 세션에서 진행 중이다. 생명·지구는 **전수 분해가 아니라 실태 조사**다.
> 2026학년도 3개 시험(6평·9평·수능)만 보고 "무엇이 들어 있나"를 확인한 뒤,
> 싸게 구현되는 것이 보이면 그것만 만든다.
>
> 아래 두 블록을 각각 **새 세션에 통째로 붙여넣는다.** 순서는 지구 → 생명을 권한다
> (지구가 장수가 많고 부품화 가능성이 높아 먼저 하면 어휘 정리가 생명에도 재활용된다).
>
> 작성 2026-07-31.

---

## 실제 대상 장수 (파일명으로 실측)

기출 라이브러리에는 **도판이 있는 문항만** 들어 있다. 120문항 중 그림 있는 것만 세면:

| 과목 | 6평 | 9평 | 수능(11) | 합 |
|---|---:|---:|---:|---:|
| b1 생명과학1 | 13 | 13 | 11 | 37 |
| b2 생명과학2 | 15 | 10 | 7 | 32 |
| **생명 계** | | | | **69** |
| e1 지구과학1 | 17 | 18 | 17 | 52 |
| e2 지구과학2 | 17 | 20 | 15 | 52 |
| **지구 계** | | | | **104** |

파일명 규칙: `<과목>_2026_<06|09|11>_<문항2자리>.png`
경로: `5E_main\assets\exam-library\images\`

---

## 프롬프트 A — 지구과학 (먼저)

```
[한국어] 5E 프로젝트에서 지구과학 기출 도판 실태 조사를 한다. 목적은 전수 분해가
아니라 "지구과학 도판에 무엇이 들어 있고, 5E로 무엇을 그릴 수 있나"를 확인하는 것이다.
작업 폴더는 C:\Users\user\Desktop\project\51_5E\5E_main 이다.

[대상] assets/exam-library/images/ 중 파일명이 e1_2026_ 또는 e2_2026_ 으로 시작하는
104장 전부 (6평 06 · 9평 09 · 수능 11).

[먼저 읽을 것 — 순서대로]
1. docs/FIGURE_DECOMPOSE_SPEC.md 전체. 특히 §0.5 "5E가 이미 갖고 있는 것"과
   §2 요소 어휘, §2.5 층 배정표, §3 재현 등급/blockers 규칙.
2. docs/HANDOFF_atlas_20260731.md — 물리에서 오진 274건이 났던 이유.
   "없다"고 판정하기 전에 반드시 세 곳(객체 타입의 kind/element 값, 그래프 모달
   js/graph/graph-modal.js 의 기능, 렌더 코드 js/render/*.js)을 다 확인한다.

[산출물]
- docs/figure-atlas-e.jsonl — 1장 = JSON 1줄. 스키마는 SPEC §4 그대로.
  ※ 물리 집계가 오염되므로 figure-atlas.jsonl 에 절대 섞지 않는다.
- docs/SURVEY_earth_20260731.md — 조사 보고서(아래 항목 필수)

[물리 어휘가 안 맞는다 — 이게 핵심이다]
SPEC §2 어휘는 물리 기준이라 지구과학 도판의 상당수가 안 맞을 것이다.
억지로 비슷한 이름에 우겨넣지 말고 misc:<자유표기> 로 적어라.
misc 빈도표가 이번 조사의 가장 중요한 산출물이다 — 그게 곧 "지구과학 어휘 확장안"이 된다.
예상되는 것: 지층 단면(습곡·단층·부정합), 일기도(등압선·전선기호), 해수 연직 단면,
천체 궤도·위상, 별의 등급-온도 도표(H-R), 판 경계 모식도, 해구·해령 단면.
이런 것을 misc:strata_section, misc:weather_front 처럼 소문자+밑줄 영문 id 로 적는다.

[보고서에 반드시 넣을 것]
1. repro 분포 (full / partial / none 장수와 %) — 지금 5E로 몇 %가 그려지나
2. 패널 종류 분포 (scene / graph / circuit / table / diagram / illustration)
   ※ 지구과학은 graph 비율이 높을 것으로 예상된다. 높다면 그건 좋은 신호다
     (기존 그래프 모달로 이미 되는 것이므로)
3. misc 빈도 상위 20 — 어휘에 없던 것. 각각 몇 장에 나오나
4. blockers 빈도표 (type별: part / assembly / illustration / layout)
   = 부품 제작 대기열. "이걸 만들면 몇 장이 full 로 올라가는가"를 숫자로
5. **싸게 되는 것 / 비싼 것 분류** — 이게 결론이다. 각 blocker를
   (가) 기존 타입 조합·옵션 추가로 되는 것
   (나) 새 타입 1개 추가로 되는 것 (js/object-types.js 에 행 추가 + 렌더러/인스펙터/팔레트)
   (다) SVG 자산(svgAsset) 확충이 필요한 것
   (라) 만들 가치 없는 것(삽화·사진)
   으로 나누고, (가)와 (나) 중 회복 장수가 큰 순서로 5개까지 추린다

[작업 방법]
서브에이전트로 10장씩 나눠 판독하고 각자 figure-atlas-e.jsonl 에 append 한다.
처리한 파일명은 docs/.atlas-done-e.txt 에 append (중단·재개용).
좌표·치수는 재지 않는다. 요소 목록만 뽑는다.

[하지 말 것]
- 이 세션에서 부품을 구현하지 마라. 조사와 보고서까지가 이번 범위다.
  구현은 보고서를 보고 사용자가 판단한 뒤 시작한다.
- 버전 번호를 올리지 마라.
- 어휘에 없는 이름을 임의로 만들지 마라. misc: 접두사를 쓴다.

[English]
Survey earth-science exam figures in the 5E project. Work in
C:\Users\user\Desktop\project\51_5E\5E_main. Target: all 104 PNGs under
assets/exam-library/images/ whose filenames start with e1_2026_ or e2_2026_.

First read docs/FIGURE_DECOMPOSE_SPEC.md in full (especially §0.5 "what 5E already
has", §2 controlled vocabulary, §2.5 layer assignment, §3 repro grades and blockers),
then docs/HANDOFF_atlas_20260731.md to understand why 274 false "missing part"
verdicts happened in the physics pass. Before declaring anything missing, check all
three places: object type kind/element enums, the graph modal (js/graph/graph-modal.js),
and the render code (js/render/*.js).

Produce docs/figure-atlas-e.jsonl (one JSON per line, schema per SPEC §4 — never
append to figure-atlas.jsonl, it would contaminate the physics aggregate) and
docs/SURVEY_earth_20260731.md.

The physics vocabulary will not fit earth science. Do not force-fit; use the
misc:<id> prefix with lowercase_underscore English ids. The misc frequency table is
the single most valuable output — it becomes the earth-science vocabulary proposal.

The report must contain: (1) repro distribution, (2) panel kind distribution,
(3) top-20 misc frequency, (4) blockers frequency by type = the part-building queue
with "how many figures does this unlock", and (5) the conclusion — classify each
blocker as (a) doable by combining/extending existing types, (b) doable with one new
type in js/object-types.js, (c) needs svgAsset artwork, (d) not worth building,
then list the top 5 from (a)+(b) by figures recovered.

Use subagents reading 10 files each, appending to the jsonl and to
docs/.atlas-done-e.txt. Do not measure coordinates — element lists only.
Do NOT implement any parts in this session; survey and report only. Do not bump the
version number.

Do not ask clarifying questions. Make reasonable assumptions and proceed.
```

---

## 프롬프트 B — 생명과학 (지구과학 다음)

```
[한국어] 5E 프로젝트에서 생명과학 기출 도판 실태 조사를 한다. 목적은 전수 분해가
아니라 "생명과학 도판에 무엇이 들어 있고, 5E로 무엇을 그릴 수 있나"를 확인하는 것이다.
작업 폴더는 C:\Users\user\Desktop\project\51_5E\5E_main 이다.

[대상] assets/exam-library/images/ 중 파일명이 b1_2026_ 또는 b2_2026_ 으로 시작하는
69장 전부 (6평 06 · 9평 09 · 수능 11).

[먼저 읽을 것 — 순서대로]
1. docs/FIGURE_DECOMPOSE_SPEC.md 전체. 특히 §0.5 "5E가 이미 갖고 있는 것"과
   §2 요소 어휘, §2.5 층 배정표, §3 재현 등급/blockers 규칙.
2. docs/HANDOFF_atlas_20260731.md — 물리에서 오진 274건이 났던 이유.
   "없다"고 판정하기 전에 반드시 세 곳(객체 타입의 kind/element 값, 그래프 모달
   js/graph/graph-modal.js 의 기능, 렌더 코드 js/render/*.js)을 다 확인한다.
3. docs/SURVEY_earth_20260731.md — 지구과학 조사를 먼저 했다면 그 보고서.
   거기서 만든 misc 어휘 중 생명에도 쓰이는 것(표, 지시선, 모식도 화살표 등)은
   같은 id 를 재사용한다. 어휘가 갈라지면 나중에 합칠 때 다시 봐야 한다.

[산출물]
- docs/figure-atlas-b.jsonl — 1장 = JSON 1줄. 스키마는 SPEC §4 그대로.
  ※ figure-atlas.jsonl 에 절대 섞지 않는다.
- docs/SURVEY_bio_20260731.md — 조사 보고서

[생명과학은 성격이 둘로 갈린다 — 반드시 나눠서 집계하라]
보고서에서 아래 두 부류를 **따로** 집계한다. 섞으면 판단이 안 된다.

(1) 기하학적 부류 — 가계도, 퍼넷 사각형, 염색체·DNA 모식도, 세포 분열 단계 도식,
    표(자료 제시형), 그래프, 흐름도. 이건 물리와 같은 방식(파라미터형 새 타입)으로
    싸게 만들 수 있다. **생명과학 문항의 상당수가 사실 표와 도식이다.**
(2) 유기적 부류 — 세포 구조, 기관·해부도, 신경·근육 모식도, 생물 개체 그림.
    이건 파라미터로 못 그린다. svgAsset(내장 SVG 자산) 확충으로만 풀린다.
    현재 svgAsset 레지스트리에는 pulley, cart 단 2개뿐이다.

blockers 를 적을 때 (1)에 속하면 type:"part" 또는 "assembly",
(2)에 속하면 type:"part" 로 적되 note 에 "svgAsset 필요"라고 반드시 남긴다.

[물리 어휘가 안 맞는다]
misc:<자유표기> 를 적극 쓴다. 소문자+밑줄 영문 id.
예상: misc:pedigree(가계도), misc:punnett, misc:chromosome, misc:data_table_bio,
misc:cell_diagram, misc:neuron 등. misc 빈도표가 곧 생명과학 어휘 확장안이다.

[보고서에 반드시 넣을 것]
1. repro 분포 (full / partial / none)
2. 패널 종류 분포. 특히 table 패널이 몇 %인가 — 생명은 표 비중이 높을 것으로 예상되고,
   표는 물리에서도 data_table 로 대기열에 있던 항목이라 만들면 두 과목이 같이 산다
3. misc 빈도 상위 20
4. blockers 빈도표 (type별)
5. **기하학적 부류 / 유기적 부류로 나눈 결론.** 기하학적 쪽에서 회복 장수가 큰
   순서로 5개, 유기적 쪽은 "어떤 SVG 자산이 몇 장에 필요한가" 목록만.
   유기적 쪽은 이번에 만들지 않는다 — 조달 방법을 사용자가 따로 결정한다

[작업 방법]
서브에이전트로 10장씩 나눠 판독하고 각자 figure-atlas-b.jsonl 에 append 한다.
처리한 파일명은 docs/.atlas-done-b.txt 에 append.
좌표·치수는 재지 않는다.

[하지 말 것]
- 이 세션에서 부품을 구현하지 마라. 조사와 보고서까지가 이번 범위다.
- 버전 번호를 올리지 마라.
- 유기적 부류(세포·해부도) SVG 자산을 임의로 그리기 시작하지 마라.

[English]
Survey biology exam figures in the 5E project. Work in
C:\Users\user\Desktop\project\51_5E\5E_main. Target: all 69 PNGs under
assets/exam-library/images/ whose filenames start with b1_2026_ or b2_2026_.

First read docs/FIGURE_DECOMPOSE_SPEC.md in full, then
docs/HANDOFF_atlas_20260731.md (why 274 false "missing part" verdicts happened —
always check object type kind/element enums, the graph modal, and render code before
declaring something missing), then docs/SURVEY_earth_20260731.md if the earth-science
survey ran first, and reuse its misc ids where they apply.

Produce docs/figure-atlas-b.jsonl (schema per SPEC §4 — never append to
figure-atlas.jsonl) and docs/SURVEY_bio_20260731.md.

Biology splits into two kinds and the report MUST tally them separately:
(1) geometric — pedigrees, Punnett squares, chromosome/DNA schematics, cell-division
stage diagrams, data tables, graphs, flowcharts. These are cheap: same parametric
new-type approach as physics.
(2) organic — cell structure, organ/anatomy drawings, neuron and muscle schematics.
These cannot be parameterized; they need svgAsset artwork (the registry currently
holds only pulley and cart). When a blocker falls in this group, note "svgAsset 필요".

Use misc:<lowercase_underscore_id> freely for vocabulary the physics spec lacks; the
misc frequency table is the biology vocabulary proposal.

Report must contain: repro distribution, panel kind distribution (call out the table
panel share — data_table is already in the physics queue, so building it pays off in
both subjects), top-20 misc frequency, blockers by type, and a conclusion split into
geometric (top 5 by figures recovered) vs organic (list only: which svgAsset assets,
how many figures each). Do not build organic assets in this session.

Use subagents reading 10 files each. Do not measure coordinates. Do NOT implement
parts. Do not bump the version number.

Do not ask clarifying questions. Make reasonable assumptions and proceed.
```

---

## 두 세션이 끝난 뒤 합류 지점

세 과목(화학·생명·지구) 보고서가 모이면 다음을 판단한다.

1. **공통 부품 먼저.** 세 과목에 걸쳐 나오는 것(`data_table` 표, 꺾인 지시선
   `leader_group`, 모식도 화살표)은 물리 대기열에도 이미 있다. 한 번 만들면 4과목이
   같이 산다 — 과목 전용 부품보다 우선순위가 높다.
2. **어휘 통합.** 세 개의 misc 빈도표를 합쳐 `FIGURE_DECOMPOSE_SPEC.md` §2 어휘를
   4과목판으로 개정한다.
3. **팔레트 카테고리 신설.** `js/templates.js` 의 category 는 지금 물리 5종
   (공통·역학·회로·전자기학·광학)뿐이다. 과목별 카테고리를 추가하고
   `js/subject-objects.js` 의 "준비 중입니다" 플레이스홀더를 실제 파트에 연결한다.
