# 생명과학 기출 도판 실태 조사 (SURVEY_bio_20260731.md)

> **무엇인가**: 2026학년도 3개 시험(6평·9평·수능)의 생명과학1·2 도판 **69장 전수 판독** 결과.
> 전수 분해(물리 483장)가 아니라 **"무엇이 들어 있고 5E로 무엇을 그릴 수 있나"** 를 확인하는 조사다.
>
> 원본 데이터: `docs/figure-atlas-b.jsonl` (1장 = JSON 1줄, SPEC §4 스키마)
> 처리 목록: `docs/.atlas-done-b.txt`
> 판독 기준: `docs/FIGURE_DECOMPOSE_SPEC.md` · 오진 방지: `docs/HANDOFF_atlas_20260731.md`
>
> 작성 2026-07-31. 판독은 서브에이전트 7팀(10장씩) 분담, 어휘 통합은 사후 정규화.

---

## 0. 결론 세 줄

1. **지금 5E로 35%(24장)가 완전 재현된다.** 물리 43%보다 낮지만 바닥은 아니다.
2. **병목은 유기적 그림이 아니라 기하학적 조립체다.** 상위 blocker 6종 중 4종
   (`data_table` `bar_chart` `dual_axis` `legend_block`)이 파라미터형으로 싸게 만들 수 있는 것이다.
3. **`data_table` + `bar_chart` + `dual_axis` 3종이면 10장이 full 로 올라간다** (24 → 34장, 35% → 49%).
   이 중 `data_table` 은 물리 대기열에도 이미 있어 **두 과목이 같이 산다.**

---

## 1. repro 분포 — 지금 5E로 몇 %가 그려지나

| 등급 | 장수 | 비율 |
|---|---:|---:|
| `full` | 24 | **34.8%** |
| `partial` | 40 | 58.0% |
| `none` | 5 | 7.2% |

과목별:

| 과목 | 장수 | full | partial | none |
|---|---:|---:|---:|---:|
| b1 생명과학1 | 37 | 14 (37.8%) | 19 | 4 |
| b2 생명과학2 | 32 | 10 (31.3%) | 21 | 1 |

**물리와의 대비**: 물리 483장은 완벽 재현 43%, 천장(부품을 다 만들었을 때) 79%였다.
생명은 시작점이 35%로 조금 낮지만, `none` 이 7%뿐이라 **천장 자체는 물리보다 높다.**
물리는 삽화(사람·차량·실험대)가 `none` 을 두껍게 만들었는데, 생명 도판에는
삽화가 주인공인 그림이 5장뿐이다(천산갑·새 세밀화 등 도입부 삽화).

---

## 2. 패널 종류 분포 — **생명은 `scene` 과목이 아니다**

패널 97개 기준:

| 종류 | 패널 | 비율 | 도판 장수 |
|---|---:|---:|---:|
| `diagram` | 46 | **47.4%** | 34 |
| `graph` | 27 | 27.8% | 23 |
| `scene` | 11 | 11.3% | 8 |
| `illustration` | 7 | 7.2% | 6 |
| `table` | 6 | 6.2% | 6 |

**이게 이번 조사에서 가장 중요한 숫자다.** 물리는 `scene` 이 지배적이라
`add_scene(kind:"incline_friction")` 같은 **장면 조립체**가 투자 1순위였다.
생명은 `scene` 이 11%뿐이고 `incline` `ground` `string` 같은 물리 골격 어휘가
거의 쓰이지 않는다. **생명의 투자처는 `diagram`(흐름도·모식도)과 `graph` 다.**

`diagram` 이 47%인데도 재현율이 나쁘지 않은 이유는 `flow_node`(둥근 상자) +
`arrow_transition`(전이 화살표) 조합이 이미 되기 때문이다. 실제로 `full` 24장 중
상당수가 이 조합만으로 그려지는 대사 흐름도·순환도다.

### `table` 패널은 6.2%뿐 — 예상보다 적었다

핸드오프 문서는 "생명은 표 비중이 높을 것"으로 예상했지만 실제로는 6장이다.
**다만 우선순위는 여전히 높다.** 이유는 두 가지다.

- 표가 있는 6장은 **전부** `data_table` blocker에 걸려 있다. 즉 표는 "적지만 100% 막힌다".
- `data_table` 은 **물리 대기열에도 이미 있는 항목**이다. 화학·지구도 자료 제시형 표를
  쓸 가능성이 높아, 한 번 만들면 4과목이 같이 산다.

표 보유 도판: `b1_2026_11_13` `b2_2026_06_09` `b2_2026_06_17` `b2_2026_09_15`
`b2_2026_09_18` `b2_2026_11_18`

### 물리 어휘 중 잘 맞은 것

`label_name`(54장) `label_roman`(27) `tick_label`(26) `axis_title`(24) `plane`(23)
`arrow_transition`(19) `curve`(16) `guide_dash`(15) `dim_line`(15) `leader_line`(14)
`flow_node`(10) `legend`(10) — **주석·그래프 어휘는 과목 무관하게 재사용된다.**
못 쓰인 것은 골격·연결 계열(`incline` `ground` `ceiling` `string` `spring` `rod`)이다.

---

## 3. misc 빈도 상위 20 — 생명과학 어휘 확장안

판독 7팀이 각자 만든 id를 사후 정규화한 결과다
(`bar`/`bar_column`/`bar_chart` → `bar_chart`, `cell_outline`/`cell_boundary` → `cell_diagram` 등).

| 장수 | misc id | 무엇 | 부류 |
|---:|---|---|---|
| 5 | `misc:brace` | 큰 중괄호 `{` — 구획·항목 묶음 표시 | 기하 |
| 4~7 | `misc:bar_chart` | 막대그래프의 막대 | 기하 |
| 4 | `misc:cell_diagram` | 세포 윤곽 원·세포 전체 모식도 | 유기 |
| 4 | `misc:neuron` | 뉴런(세포체+가지돌기+축삭말단) | 유기 |
| 3 | `misc:chromosome` | 염색체 — 캡슐 2개 + 동원체 | **기하** |
| 3 | `misc:pedigree_symbol` | 가계도 기호(□○, 채우기 무늬) | 기하 |
| 2 | `misc:pedigree_line` | 가계도 세대선·형제선 | 기하 |
| 2 | `misc:cycle_ring` | 순환 도식의 큰 원 뼈대 | 기하 |
| 2 | `misc:sarcomere` | 근육 원섬유마디(Z선·필라멘트) | 기하 |
| 2 | `misc:axis_pointer` | 축 위 특정 위치를 가리키는 짧은 화살표 | 기하 |
| 2 | `misc:enzyme_shape` | 홈 파인 효소 덩어리 | 유기 |
| 2 | `misc:chem_equation` | 화학 반응식(NADP⁺, 2e⁻ 위첨자 포함) | 기하 |
| 2 | `misc:protein_complex` | 막단백질·수송 단백질 회색 타원 | 유기 |
| 2 | `misc:phospholipid_bilayer` | 인지질 이중층 단면 | 유기(반복패턴) |
| 2 | `misc:codon_triplet` | UUU 같은 3염기 문자열 | 기하 |
| 2 | `misc:dna_sequence` | 5'-AGATCT-3' 상보 가닥 쌍 텍스트 | 기하 |
| 1 | `misc:organelle` | 소기관(핵·소포체·골지체·미토콘드리아) | 유기 |
| 1 | `misc:gene_construct` | 캡슐형 유전자 지도(조절부위+프로모터+구조유전자) | 기하 |
| 1 | `misc:quadrat_grid` · `misc:species_marker` | 방형구 격자 + 종 마커 | 기하 |
| 1 | `misc:block_arrow` | 속 빈 굵은 화살표 ⇨ | 기하 |
| 1 | `misc:tree_branch` | 계통수 가지 | 기하 |

전체 57종은 `figure-atlas-b.jsonl` 에 있다. 나머지는 전부 1장짜리 유기적 그림
(`misc:trna` `misc:ribosome` `misc:dna_helix` `misc:mitochondrion` `misc:island_outline` 등).

> **예상이 빗나간 것**: 핸드오프가 예상한 `misc:punnett`(퍼넷 사각형)은 **69장에 한 장도 없었다.**
> `misc:pedigree`(가계도)도 3장뿐이다. 교과서적 이미지와 달리 실제 기출은
> **막대그래프·흐름도·표**가 훨씬 많다.

---

## 4. blockers 빈도표 — 부품 제작 대기열

type별 총계(도판 단위 중복 제거): `part` 44 · `assembly` 16 · `layout` 11 · `illustration` 5

정규화 후 id별 (몇 장에서 막고 있나):

| 장수 | type | id | 부류 |
|---:|---|---|---|
| 6 | layout | `data_table` (병합 셀 포함) | 기하 |
| 5 | assembly | `legend_block` | 기하 |
| 5 | part | `brace` | 기하 |
| 4 | assembly | `bar_chart` | 기하 |
| 4 | assembly | `dual_axis` (좌우 y축) | 기하 |
| 4 | part | `neuron` | 유기 |
| 4 | part | `organelle` | 유기 |
| 4 | part | `phospholipid_bilayer` | 유기 |
| 3 | part | `chromosome` | **기하** |
| 3 | part | `cell_diagram` | 유기 |
| 3 | assembly | `pedigree` | 기하 |
| 2 | part | `dash_dot_line` (일점쇄선) | 기하 |
| 2 | part | `chem_equation` | 기하 |
| 2 | part | `enzyme_shape` | 유기 |
| 2 | part | `nucleic_acid` (DNA 이중나선·tRNA) | 유기 |
| 2 | part | `protein_complex` | 유기 |
| 2 | part | `organ_drawing` (눈·근육 등 기관) | 유기 |
| 2 | layout | `seq_alignment` (상보 가닥 염기 정렬) | 기하 |
| 2 | illustration | `animal` | 삽화 |
| 1 | — | `sarcomere` `gene_construct` `gene_segment` `axis_break` `block_arrow` `landform` `spindle_fiber` `person` `hammer` `organism` | — |

### 오진 방지 결과 (§0.5 확인으로 blocker에서 뺀 것)

7팀 전부가 §0.5 표와 그래프 모달·렌더 코드를 확인했고, 그 결과 다음은 **blocker로 적지 않았다**:
호형 화살표(`curve`+`arrowHead`), 물결 화살표(`line.lineMode:"wavyArrow"`),
치수선 묶음(`lineMode:"lengthArrow"` — 물리 1순위였던 `dim_group` 은 이미 구현 완료),
회색 음영 띠(`rect.fillStyle`), 수선의 발·가이드라인(그래프 모달), 직선 지시선(`labeler`),
로마숫자(`{roman1}`), 가계도 채우기 무늬(`fillStyle: hatch/cross/solid` — `ellipse` 도 지원),
로그 눈금(`tickLabelMode:"text"`), 축 생략(`coordplane.breaks`).

**물리에서 274건 오진을 냈던 함정을 이번에는 피했다.** 특히 `dim_group` 계열은
15장에서 쓰였는데 전부 기존 기능으로 처리 가능해 blocker에서 빠졌다.

---

## 5. 결론 — 기하학적 부류 / 유기적 부류

### (가) 기하학적 부류 — **지금 만들 것.** 회복 장수 순

`full` 이 아닌 45장을 대상으로, "이 부품만 만들면 그 장이 full 이 되는가"로 계산했다.

| 순위 | 만들 것 | 단독 회복 | 분류 | 어떻게 |
|---:|---|---:|---|---|
| 1 | **`data_table`** (병합 셀 지원) | **4장** | (나) 새 타입 1개 | 행·열·병합 스펙을 받는 표 타입. **물리·화학·지구도 같이 산다** |
| 2 | **`bar_chart`** | **3장** | (가) 기존 확장 | 그래프 모달에 막대 계열 추가. `coordplane`+`rect` 로 손조합은 되나 정렬이 비싸다 |
| 3 | **`dual_axis`** (좌우 y축) | **3장** | (가) 기존 확장 | `coordplane` 에 `labelY2`/우측 눈금 추가. 현재 `labelY` 하나뿐 |
| 4 | **`chromosome`** | **2장** | (나) 새 타입 1개 | 캡슐 2개 + 동원체 점. **유기적으로 보이지만 실제로는 완전 파라미터형** |
| 5 | **`brace`** (중괄호) | 1장 | (나) 새 타입 1개 | 5장에서 쓰이는 관용구. 방향+진폭 2파라미터면 끝. **가장 싸다** |

**조합 효과가 크다:**

| 만들 조합 | 회복 | full 비율 |
|---|---:|---|
| `data_table` + `bar_chart` + `dual_axis` | **10장** | 35% → **49%** |
| 위 3종 + `chromosome` | 12장 | → **52%** |
| 위 4종 + `dash_dot_line` | **14장** | → **55%** |

> `legend_block` 은 5장에서 걸리지만 **단독 회복이 0**이다(항상 다른 blocker와 함께 나온다).
> 다만 그래프 모달의 범례는 그래프 내부 전용이라 `diagram` 패널에서 못 쓰는 게 원인이므로,
> **"모달 범례를 독립 객체로 빼기"** 는 비용이 낮다. 위 조합과 함께 하면 이득이 커진다.

### (나) 유기적 부류 — **이번에 만들지 않는다.** svgAsset 조달 목록

현재 `js/svg-assets.js` 레지스트리에는 `pulley` `cart` **2개뿐**이다.
아래는 "어떤 자산이 몇 장에 필요한가"만 적는다. 조달 방법(직접 작도 / 외주 / 공개 자산)은
사용자가 따로 결정한다.

| 장수 | 자산 | 쓰인 도판 |
|---:|---|---|
| 4 | `phospholipid_bilayer` 인지질 이중층 | b2_06_06, b2_06_16, b2_09_09, b2_09_13 |
| 4 | `organelle` 소기관(핵·소포체·골지체·미토콘드리아·리보솜) | b2_06_01, b2_06_13, b2_09_13, b2_11_04 |
| 4 | `neuron` 뉴런·신경 경로 | b1_06_10, b1_06_13, b1_09_15, b1_11_13 |
| 3 | `cell_diagram` 세포 윤곽·세균 | b1_06_03, b1_09_16, b2_11_04 |
| 2 | `enzyme_shape` 효소 덩어리 | b2_06_07, b2_11_03 |
| 2 | `nucleic_acid` DNA 이중나선·tRNA | b2_06_13, b2_06_20 |
| 2 | `protein_complex` 막단백질 | b2_09_09, b2_09_13 |
| 2 | `organ_drawing` 기관(눈·근육) | b1_06_10, b1_09_04 |
| 1 | `landform` 섬 윤곽·산 능선 | b2_09_04 |
| 1 | `spindle_fiber` 방추사 | b1_06_03 |

**주목**: `phospholipid_bilayer` 는 유기적으로 보이지만 **머리 원 + 두 갈래 꼬리의 반복 패턴**이라
파라미터형으로 만들 여지가 있다(개수·길이·굽힘만 있으면 된다). 유기 부류 중 유일하게
(나) 새 타입 경로로 넘어올 후보다. 4장으로 유기 부류 최다이기도 하다.

### (다) 삽화 — 만들지 않음

`animal` 2 · `person` 1 · `hammer` 1 · `organism` 1 (총 5장, `none` 판정과 대체로 일치).
원본 크롭을 `image` 로 얹는 경로로 보낸다.

---

## 6. 다음 단계 — 세 과목 합류 지점

핸드오프(`HANDOFF_survey_bio_earth.md` §"두 세션이 끝난 뒤")대로,
**지구과학 104장 조사(`SURVEY_earth_20260731.md`)가 아직 남아 있다.** 그 뒤에 판단할 것:

1. **공통 부품 먼저.** `data_table` 은 물리 대기열에도 있고 생명에서 1순위다.
   지구·화학 조사에서도 상위로 나오면 **4과목 공통 1순위로 확정**한다.
2. **어휘 통합.** 이 문서 §3의 misc 표를 지구·화학 것과 합쳐
   `FIGURE_DECOMPOSE_SPEC.md` §2 어휘를 4과목판으로 개정한다.
   ※ 이번 판독에서 7팀이 같은 물건을 다른 id로 적은 사례가 여럿 있었다
   (`bar`/`bar_column`/`bar_chart`). 개정 시 **정본 id를 문서에 박아야** 재발을 막는다.
3. **팔레트 카테고리 신설.** `js/templates.js` 의 category 는 물리 5종뿐이고
   `js/subject-objects.js` 에 "준비 중입니다" 플레이스홀더가 있다.
   생명 카테고리에 넣을 것: 표 · 막대그래프 · 가계도 · 염색체 · 흐름도.

**이 세션에서 구현한 것은 없다.** 조사와 보고서까지가 범위였다.
