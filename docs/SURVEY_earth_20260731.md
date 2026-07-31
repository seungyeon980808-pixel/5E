# 지구과학 기출 도판 실태 조사 (SURVEY_earth_20260731.md)

> 대상: 2026학년도 6평·9평·수능, `e1_2026_*`·`e2_2026_*` **104장 전부**.
> 원본 데이터: `docs/figure-atlas-e.jsonl` (104줄, 스키마는 `FIGURE_DECOMPOSE_SPEC.md` §4).
> 집계 스크립트: `docs/atlas-aggregate-e.py`. 처리 목록: `docs/.atlas-done-e.txt`.
> 성격: 전수 분해가 아니라 **실태 조사** — 무엇이 들어 있고, 무엇을 만들면 몇 장이 사는가.
> 작성 2026-07-31.

---

## 0. 한 줄 결론

지금 5E로 **36%(37장)가 full**. 병목은 물리와 완전히 다르다 —
부품이 아니라 **① 지도(해안선·지구본), ② 등치선 다발, ③ 그래프 확장(이중축·세로쓰기·산점)**이다.
저비용 확장 ~10건으로 **52%(54장)**, 지도·사진을 크롭 경로로 처리하면 **최대 68%(71장)**까지 간다.

---

## 1. repro 분포

| 등급 | 장수 | % |
|---|---:|---:|
| full | 37 | 36% |
| partial | 57 | 55% |
| none | 10 | 10% |

회차별로 고르다 (full 5~9장/회차). 특정 회차 쏠림 없음.

| 회차 | 장수 | full | partial | none |
|---|---:|---:|---:|---:|
| e1 6평 | 17 | 5 | 11 | 1 |
| e1 9평 | 18 | 6 | 11 | 1 |
| e1 수능 | 17 | 5 | 12 | 0 |
| e2 6평 | 17 | 6 | 7 | 4 |
| e2 9평 | 20 | 9 | 9 | 2 |
| e2 수능 | 15 | 6 | 7 | 2 |

---

## 2. 패널 종류 분포 (총 142패널)

| kind | 개수 | % |
|---|---:|---:|
| scene | 67 | 47% |
| graph | 44 | 31% |
| illustration | 24 | 17% |
| diagram | 5 | 4% |
| table | 2 | 1% |

- **graph 31%는 좋은 신호가 맞았다.** 그래프 패널 대부분이 기존 그래프 모달(수선의 발·가이드라인·표시점·범례·분수 축이름)로 blocker 없이 끝났다. 물리에서 났던 오진 유형은 판독 단계에서 걸러냈다(각 배치가 coordplane.js·graph-modal.js·fill.js를 직접 확인).
- **주의**: scene 47%의 실체는 물리식 "장면"이 아니라 **지도(해안선+등치선)와 단면(지층·해수·판)** 두 갈래다. §1 경계규칙상 곡선 없는 좌표 도식·지도·단면이 전부 scene으로 들어간 결과다.

---

## 3. misc 빈도 상위 (장 수 기준) = 지구과학 어휘 확장안

| misc id | 장수 | 무엇 |
|---|---:|---|
| `misc:contour_line` | 8 | 등치선(등고선·등수심선·등주시선·등편각선…) |
| `misc:isobar` | 7 | 등압선 |
| `misc:map_outline` | 6 | 해안선·대륙 윤곽 지도 배경 (`coastline_map`·`base_map` 표기 포함 시 10+) |
| `misc:scale_bar` | 5 | 지도·현미경 축척 막대 |
| `misc:strata_section` | 3 | 지층 단면 (+`strata_block` 4, `strata_column` 1 — 계열 합산 시 8) |
| `misc:landmass` | 3 | 회색 육지 채움 |
| `misc:orbit_path` | 3 | 공전 궤도 (+`orbit_ring` 1) |
| `misc:globe_grid` | 3 | 지구본 경위선 격자 (+`map_graticule`·`polar_grid` 각 1) |
| `misc:rock_pattern` | 3 | 암상 무늬 채움 |
| `misc:label_circled` | 3 | ㉠㉡ 원문자 라벨 (부품은 이미 있음 — 어휘만 필요) |
| `misc:weather_front` / `misc:storm_track` | 각 2 | 전선 기호 / 태풍 진로 |
| `misc:point_scatter` | 2 | 대량 산점 (+`scatter_cloud` blocker 2) |
| `misc:celestial_body`·`misc:celestial_point`·`misc:celestial_arc` | 각 1~2 | 천체·천구 계열 |
| `misc:volcano`·`misc:magma_chamber`·`misc:fault_line`·`misc:unconformity` | 각 1~2 | 지질 단면 요소 |

**정식 어휘 편입 권고**: ① `contour_line`(등압선·등고선·등수심선을 전부 흡수하는 등치선 1어휘 — 계열 합산 15장+), ② `map_outline`, ③ `strata_section`, ④ `scale_bar`, ⑤ `orbit_path`·`celestial_body`(천체 계열), ⑥ `rock_pattern`.
생명과학 misc(`bar`·`bar_chart`·`brace` 등)와 겹치는 것은 막대그래프 하나 — id는 `bar_chart`로 이미 통일돼 있다.

---

## 4. blockers 빈도표 (장 수, 동의어 병합 후)

판독자마다 갈린 표기를 병합했다: `coastline_map`·`base_map`·`continent_outline`→`map_outline`,
`contour_label`→`contour_set`, `strata_texture`·`brick_hatch`·`wavy_layer`→`rock_pattern`,
`unconformity_line`→`unconformity_wave`. (jsonl 원본은 판독 당시 표기 그대로다.)

| blocker | type | 장수 | 단독 blocker인 partial |
|---|---|---:|---:|
| `map_outline` 지도 배경 | part/illustration 혼재 | **14** | 7 |
| `photo` 사진·위성영상 | illustration | 11 | 0 |
| `rock_pattern` 암상 무늬 채움 | part | 6 | 1 |
| `dual_axis` 이중 y축 | layout | 5 | 3 |
| `contour_set` 등치선 다발+인라인 라벨 | assembly | 5 | 2 |
| `scale_bar` 축척 막대 | assembly | 5 | 1 |
| `vertical_text` 한글 세로쓰기 축이름 | assembly | 4 | 1 |
| `globe_grid` 지구본 경위선 | part | 3 | 3 |
| `unconformity_wave` 부정합 물결선 | part | 3 | 0 |
| `person`·`speech_bubble` 등 삽화 | illustration | 각 2~3 | 0 |
| `point_scatter`+`scatter_cloud` 대량 산점 | part/assembly | 4 | 2 |
| `dashdot_line` 일점쇄선 | part | 2 | 2 |
| `weather_front` 전선 기호 | part | 2 | 0 |
| `block_arrow` 속 빈 굵은 화살표 | part | 2 | 1 |
| `grid_3d` 3D 격자 | assembly | 2 | 1 |
| 그 외 1장짜리 | — | 각 1 | — |

---

## 5. 결론 — 싸게 되는 것 / 비싼 것

### (가) 기존 타입 조합·옵션 추가로 되는 것

| 것 | 비용 | 회복 기여 |
|---|---|---|
| `dashdot_line` | `applyDash`가 dashLength/dashGap 2값뿐인 게 원인. 공용 dashPattern 도입 한 번 | 2장(전부 단독) |
| `open_marker` 빈 원 표시점 | coordplane `annMarkers`에 fill 옵션 | 1장 |
| `scale_bar` | `line.lineMode:"lengthArrow"` 변형(끝 바+위 라벨) 조립체 | 5장 |
| `vertical_text` | 회전은 되나 글자 세워 쌓기가 없음 — 텍스트 스택 옵션/조립체 | 4장 |
| `rock_pattern` | `fill.js` fillStyle 4종(solid/dots/cross/hatch)에 벽돌·v·+·가로줄 추가 | 6장 |

### (나) 새 타입/기능 1개 추가로 되는 것

| 것 | 비용 | 회복 기여 |
|---|---|---|
| `dual_axis` 이중 y축 | 그래프 모달+coordplane에 오른쪽 축 1개 | 5장(단독 3) |
| `contour_set` | 등치선 다발+선을 끊는 인라인 값 라벨 — 지구과학판 `dim_group` | 5장 |
| `point_scatter` 산점 배열 입력 | 그래프 모달 표시점은 낱개라 수백 점 불가. 좌표 배열 1회 입력 | 4장 |
| `weather_front` 전선 기호 | 반원·삼각 반복이 붙는 곡선 타입 | 2장 |
| `bar_chart` | **생명과학 조사에서도 상위 대기열** — 만들면 두 과목이 같이 산다 | 2장(+생명 다수) |

### (다) svgAsset/크롭 확충이 필요한 것

- **`map_outline`(14장) — 지구과학 단일 최대 병목.** 한반도·동아시아·세계 해안선은 파라미터로 못 그린다. 권고: 기출 PDF 600dpi 크롭(`PARTS_PIPELINE.md` 경로) 또는 해안선 SVG 자산 3~4종(한반도·동아시아·태평양·세계) 내장. 자산화하면 반복 사용률이 가장 높다.
- `globe_grid`(3장)는 경위선이 타원 곡선이라 **파라미터 타입으로도 가능** — (나)로 승격 후보.
- `volcano`·`sun_symbol`·`galaxy_symbol`·`crescent_moon`·`sphere_shaded` 각 1~2장 — 빈도가 낮아 보류.

### (라) 만들 가치 없는 것 (크롭 경로)

`photo`(11장) · `person`·`speech_bubble`·`blackboard`·`hand`·`tree` 등 삽화 · `star_field`·`celestial_sphere`. 원본 크롭을 `image`로 얹는다.

### 우선순위 Top 5 — (가)+(나)에서 회복 장수 순

| 순위 | 것 | 장수 기여 | 비고 |
|---:|---|---:|---|
| 1 | `rock_pattern` fillStyle 확장 | 6 | 지질 단면 계열 전체의 전제 |
| 2 | `dual_axis` 이중 y축 | 5 | 단독 blocker 3장 — 즉효 최대 |
| 3 | `contour_set` 등치선 조립체 | 5 | misc 1·2위(등치선 15장+)의 완성판 |
| 4 | `scale_bar` 조립체 | 5 | lengthArrow 변형이라 초저비용 |
| 5 | `vertical_text` 세로쓰기 | 4 | 그래프 축이름에 거의 매장 등장 |

**누적 효과**: (가)+(나) 전부(±10건) 구현 시 partial 17장이 full로 → **54장(52%)**.
여기에 `map_outline` 자산/크롭까지 → **66장(63%)**, 사진 크롭 포함 최대 **71장(68%)**.
나머지 32%는 복합 삽화·3D 블록다이어그램 등 고비용 잔여다.

---

## 6. 다음 판단 (사용자 결정 대기 — 이 세션에서는 구현하지 않았다)

1. **4과목 공통 부품 먼저**: `bar_chart`(생명+지구), `dual_axis`(지구+생명 이중축), `dashdot_line`(전 과목 그래프). `HANDOFF_survey_bio_earth.md` "합류 지점" 원칙대로 과목 전용보다 우선.
2. **지도 조달 방식 결정**: 크롭 vs 내장 SVG 자산 3~4종. 14장이 걸려 있다.
3. **어휘 통합**: §3의 편입 권고를 물리·화학·생명 misc 표와 합쳐 `FIGURE_DECOMPOSE_SPEC.md` §2를 4과목판으로 개정.
