# 부품 대기열 · 요소 빈도 — 화학 기출 도판 280장 집계

> `figure-atlas-c.jsonl` 에서 자동 생성. 다시 만들려면 `python tools/atlas-merge.py chem`.
> 규격은 `FIGURE_DECOMPOSE_SPEC.md`.

## 재현 현황

| | 장수 | 비율 |
|---|---:|---:|
| 완벽 재현 | 76 | 27% |
| 일부만 | 190 | 68% |
| 재현 불가 | 14 | 5% |

**부품을 전부 만들었을 때 천장: 235장 (84%)** — 나머지는 삽화·구성 문제라 5E 대상이 아니다.

패널 종류: scene 288 · graph 117 · diagram 52 · illustration 27 · table 6

## 부품 대기열 — 만들 것

장수가 곧 우선순위다. 한 항목을 만들면 그만큼의 도판이 등급 상승한다.

| 장수 | 종류 | id |
|---:|---|---|
| 62 | 묶음 부품 | `vessel_content` |
| 55 | 낱개 부품 | `syringe_piston` |
| 41 | 낱개 부품 | `vessel_round` |
| 37 | 낱개 부품 | `glassware` |
| 25 | 낱개 부품 | `atom_sphere` |
| 22 | 구성 문제 | `panel_flow` |
| 22 | 낱개 부품 | `stopcock` |
| 17 | 묶음 부품 | `bar_chart` |
| 12 | 묶음 부품 | `shell_model` |
| 11 | 묶음 부품 | `crystal_lattice` |
| 11 | 낱개 부품 | `axis_break` |
| 9 | 묶음 부품 | `molecule_geom` |
| 6 | 구성 문제 | `data_table` |
| 6 | 묶음 부품 | `pie_sector` |
| 6 | 낱개 부품 | `electrode` |
| 5 | 묶음 부품 | `bond_multi` |
| 3 | 묶음 부품 | `lewis_dots` |
| 1 | 낱개 부품 | `membrane` |
| 1 | 묶음 부품 | `zoom_callout` |
| 1 | 낱개 부품 | `power_supply` |
| 1 | 낱개 부품 | `led_lamp` |
| 1 | 묶음 부품 | `leader_group` |
| 1 | 낱개 부품 | `stopper` |
| 1 | 낱개 부품 | `tube_clamp` |
| 1 | 묶음 부품 | `orbital_box` |
| 1 | 묶음 부품 | `salt_bridge` |
| 1 | 낱개 부품 | `shaded_apparatus` |
| 1 | 묶음 부품 | `cube_section` |

## 삽화 — 만들지 않는다

원본에서 잘라 `image` 로 얹는다(MCP `add_objects` 의 `srcPath`).

| 장수 | id |
|---:|---|
| 8 | `person` |
| 8 | `lab_bench` |
| 6 | `speech_bubble` |
| 5 | `hand` |
| 3 | `note_paper` |
| 3 | `food` |
| 2 | `product_package` |
| 2 | `photo` |
| 2 | `vehicle` |
| 1 | `gas_canister` |
| 1 | `blackboard` |

## 요소 동시출현 — 장면(scene) 패널 288개

**80% 이상이면 조립체 기본값 ON**, 30~80%는 파라미터, 30% 미만은 제외.

| 요소 | 패널 수 | 비율 |
|---|---:|---:|
| `label_formula` | 239 | 83% |
| `vessel` | 210 | 73% |
| `label_qty` | 191 | 66% |
| `label_panel` | 168 | 58% |
| `piston` | 104 | 36% |
| `leader_line` | 102 | 35% |
| `label_partname` | 99 | 34% |
| `liquid_zone` | 72 | 25% |
| `arrow_process` | 61 | 21% |
| `atom_ball` | 47 | 16% |
| `label_caption` | 41 | 14% |
| `tube` | 34 | 12% |
| `label_name` | 25 | 9% |
| `stopcock` | 25 | 9% |
| `shell_model` | 23 | 8% |
| `crystal_cell` | 18 | 6% |
| `dim_line` | 18 | 6% |
| `frame_box` | 16 | 6% |
| `guide_dash` | 15 | 5% |
| `label_unit` | 15 | 5% |
| `molecule_model` | 14 | 5% |
| `bond_line` | 14 | 5% |
| `label_roman` | 14 | 5% |
| `instrument` | 13 | 5% |
| `wire` | 13 | 5% |

## 요소 동시출현 — 그래프(graph) 패널 117개

**80% 이상이면 조립체 기본값 ON**, 30~80%는 파라미터, 30% 미만은 제외.

| 요소 | 패널 수 | 비율 |
|---|---:|---:|
| `plane` | 112 | 96% |
| `axis_title` | 110 | 94% |
| `tick_label` | 106 | 91% |
| `guide_dash` | 75 | 64% |
| `axis_tick` | 57 | 49% |
| `label_name` | 57 | 49% |
| `label_panel` | 51 | 44% |
| `curve` | 50 | 43% |
| `point_marker` | 36 | 31% |
| `bar` | 33 | 28% |
| `label_formula` | 26 | 22% |
| `label_circled` | 25 | 21% |
| `frame_box` | 16 | 14% |
| `line` | 12 | 10% |
| `label_qty` | 11 | 9% |
| `axis_break` | 9 | 8% |
| `label_unit` | 7 | 6% |
| `leader_line` | 6 | 5% |
| `pie_sector` | 5 | 4% |
| `legend` | 4 | 3% |
| `label_roman` | 4 | 3% |
| `grid_lines` | 3 | 3% |
| `label_caption` | 2 | 2% |
