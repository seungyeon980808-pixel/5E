# 부품 대기열 · 요소 빈도 — 물리 기출 도판 483장 집계

> `figure-atlas.jsonl` 에서 자동 생성. 다시 만들려면 `python tools/atlas-merge.py`.
> 규격은 `FIGURE_DECOMPOSE_SPEC.md`.

## 재현 현황

| | 장수 | 비율 |
|---|---:|---:|
| 완벽 재현 | 208 | 43% |
| 일부만 | 239 | 49% |
| 재현 불가 | 36 | 7% |

**부품을 전부 만들었을 때 천장: 382장 (79%)** — 나머지는 삽화·구성 문제라 5E 대상이 아니다.

패널 종류: scene 416 · graph 126 · illustration 75 · circuit 70 · table 12 · diagram 1

## 부품 대기열 — 만들 것

장수가 곧 우선순위다. 한 항목을 만들면 그만큼의 도판이 등급 상승한다.

| 장수 | 종류 | id |
|---:|---|---|
| 129 | 묶음 부품 | `dim_group` |
| 13 | 묶음 부품 | `rig_attach` |
| 12 | 묶음 부품 | `leader_group` |
| 11 | 낱개 부품 | `transistor` |
| 10 | 구성 문제 | `data_table` |
| 8 | 낱개 부품 | `power_supply` |
| 7 | 낱개 부품 | `axis_break` |
| 6 | 낱개 부품 | `speech_bubble` |
| 6 | 낱개 부품 | `speaker` |
| 5 | 낱개 부품 | `phototube` |
| 5 | 구성 문제 | `diagonal_wiring` |
| 4 | 낱개 부품 | `fringe_pattern` |
| 3 | 낱개 부품 | `double_slit` |
| 3 | 낱개 부품 | `arrow_hook` |
| 3 | 낱개 부품 | `thermometer` |
| 2 | 낱개 부품 | `point_cloud` |
| 2 | 낱개 부품 | `motor` |
| 2 | 낱개 부품 | `paddle_wheel` |
| 2 | 묶음 부품 | `stand_assembly` |
| 2 | 낱개 부품 | `calorimeter` |
| 1 | 묶음 부품 | `zoom_callout` |
| 1 | 낱개 부품 | `bar_magnet` |
| 1 | 묶음 부품 | `speech_bubble` |
| 1 | 낱개 부품 | `wavy_photon_arrow` |
| 1 | 낱개 부품 | `pencil` |
| 1 | 낱개 부품 | `arrow_transition` |
| 1 | 낱개 부품 | `solenoid` |
| 1 | 묶음 부품 | `arc_sector_fill` |
| 1 | 낱개 부품 | `led` |
| 1 | 낱개 부품 | `oscilloscope` |
| 1 | 낱개 부품 | `slit` |
| 1 | 낱개 부품 | `transformer_core` |
| 1 | 낱개 부품 | `variable_resistor` |
| 1 | 낱개 부품 | `polygon_mass` |
| 1 | 낱개 부품 | `water_tank` |
| 1 | 낱개 부품 | `light_sensor` |
| 1 | 낱개 부품 | `led_lamp` |
| 1 | 낱개 부품 | `foil_plate` |
| 1 | 낱개 부품 | `piezo_element` |
| 1 | 낱개 부품 | `power_supply_box` |
| 1 | 묶음 부품 | `transformer_core` |
| 1 | 낱개 부품 | `coil_wound` |
| 1 | 묶음 부품 | `capacitor_dielectric` |
| 1 | 낱개 부품 | `speaker_cart` |
| 1 | 낱개 부품 | `hook` |
| 1 | 묶음 부품 | `domain_marker` |
| 1 | 낱개 부품 | `force_sensor` |
| 1 | 낱개 부품 | `speed_gate` |
| 1 | 낱개 부품 | `laptop` |
| 1 | 낱개 부품 | `pn_box` |
| 1 | 낱개 부품 | `gas_particles` |
| 1 | 낱개 부품 | `piston_cylinder` |
| 1 | 낱개 부품 | `sand_pile` |
| 1 | 낱개 부품 | `string_break` |
| 1 | 낱개 부품 | `collision_burst` |
| 1 | 낱개 부품 | `dot_cloud` |
| 1 | 낱개 부품 | `earth_ground` |
| 1 | 낱개 부품 | `antenna` |
| 1 | 낱개 부품 | `eye_symbol` |
| 1 | 낱개 부품 | `photogate` |
| 1 | 낱개 부품 | `spacetime_grid` |
| 1 | 묶음 부품 | `coil_wrap` |
| 1 | 낱개 부품 | `monitor` |
| 1 | 묶음 부품 | `rainbow_bands` |
| 1 | 낱개 부품 | `arrow_merge` |
| 1 | 낱개 부품 | `curling_stone` |
| 1 | 낱개 부품 | `space_station` |
| 1 | 낱개 부품 | `sound_meter` |
| 1 | 낱개 부품 | `flag` |
| 1 | 낱개 부품 | `break_mark` |
| 1 | 낱개 부품 | `laser_box` |
| 1 | 묶음 부품 | `sector_fill` |
| 1 | 묶음 부품 | `dielectric_capacitor` |
| 1 | 낱개 부품 | `rubber_stopper` |
| 1 | 낱개 부품 | `tube` |
| 1 | 묶음 부품 | `submerged_fill` |

## 삽화 — 만들지 않는다

원본에서 잘라 `image` 로 얹는다(MCP `add_objects` 의 `srcPath`).

| 장수 | id |
|---:|---|
| 51 | `person` |
| 26 | `vehicle` |
| 15 | `speech_bubble` |
| 12 | `hand` |
| 10 | `blackboard` |
| 3 | `photo` |
| 2 | `device` |
| 2 | `lab_apparatus` |
| 2 | `whiteboard` |
| 2 | `thermometer` |
| 2 | `apparatus_drawing` |
| 2 | `lab_bench` |
| 1 | `appliance` |
| 1 | `eye` |
| 1 | `calorimeter` |
| 1 | `drone` |
| 1 | `speaker` |
| 1 | `camera` |
| 1 | `spacecraft` |
| 1 | `laser_pointer` |
| 1 | `microscope` |
| 1 | `paddle_wheel` |
| 1 | `power_supply` |
| 1 | `solenoid_spool` |
| 1 | `field_sensor` |
| 1 | `laptop` |
| 1 | `space_station` |
| 1 | `desk` |
| 1 | `campsite` |
| 1 | `photo_image` |
| 1 | `smartwatch` |
| 1 | `helmet` |

## 요소 동시출현 — 장면(scene) 패널 416개

**80% 이상이면 조립체 기본값 ON**, 30~80%는 파라미터, 30% 미만은 제외.

| 요소 | 패널 수 | 비율 |
|---|---:|---:|
| `label_name` | 374 | 90% |
| `label_qty` | 281 | 68% |
| `label_partname` | 222 | 53% |
| `label_panel` | 215 | 52% |
| `guide_dash` | 175 | 42% |
| `arrow_motion` | 167 | 40% |
| `ref_point` | 149 | 36% |
| `axis` | 147 | 35% |
| `ground` | 145 | 35% |
| `dim_line` | 122 | 29% |
| `block` | 108 | 26% |
| `tick_label` | 106 | 25% |
| `ball` | 84 | 20% |
| `right_angle` | 81 | 19% |
| `ghost` | 77 | 19% |
| `string` | 76 | 18% |
| `angle_arc` | 66 | 16% |
| `trajectory` | 54 | 13% |
| `label_caption` | 52 | 12% |
| `wire` | 51 | 12% |
| `label_roman` | 51 | 12% |
| `axis_tick` | 50 | 12% |
| `charge` | 50 | 12% |
| `incline` | 47 | 11% |
| `leader_line` | 39 | 9% |

## 요소 동시출현 — 그래프(graph) 패널 126개

**80% 이상이면 조립체 기본값 ON**, 30~80%는 파라미터, 30% 미만은 제외.

| 요소 | 패널 수 | 비율 |
|---|---:|---:|
| `plane` | 124 | 98% |
| `tick_label` | 124 | 98% |
| `label_qty` | 102 | 81% |
| `label_panel` | 89 | 71% |
| `guide_dash` | 86 | 68% |
| `curve` | 70 | 56% |
| `line` | 59 | 47% |
| `label_name` | 56 | 44% |
| `label_unit` | 24 | 19% |
| `point_marker` | 22 | 17% |
| `axis_tick` | 19 | 15% |
| `grid_lines` | 14 | 11% |
| `axis_title` | 13 | 10% |
| `label_caption` | 11 | 9% |
| `axis_break` | 8 | 6% |
| `leader_line` | 8 | 6% |
| `label_roman` | 6 | 5% |
| `arrow_transition` | 5 | 4% |
| `arrow_motion` | 4 | 3% |
| `dim_line` | 4 | 3% |
| `area_fill` | 3 | 2% |
| `axis` | 2 | 2% |
| `legend` | 2 | 2% |
| `arrow_direction` | 2 | 2% |
| `misc:arrow_transition` | 1 | 1% |

## 어휘에 없던 것 (`misc:`) — 편입 후보

| 항목 | 횟수 |
|---|---:|
| `misc:person` | 6 |
| `misc:speech_bubble` | 5 |
| `misc:power_supply` | 5 |
| `misc:cart` | 5 |
| `misc:light_source` | 4 |
| `misc:galvanometer` | 4 |
| `misc:object_arrow` | 4 |
| `misc:speaker` | 4 |
| `misc:coil` | 3 |
| `misc:energy_level` | 3 |
| `misc:wavefront` | 3 |
| `misc:phototube` | 3 |
| `misc:thermometer` | 3 |
| `misc:spectral_line` | 3 |
| `misc:orbit_arc` | 3 |
| `misc:arrow_rotation` | 3 |
| `misc:magnet` | 3 |
| `misc:magnetic_domain` | 3 |
| `misc:panel_frame` | 3 |
| `misc:charge_sign` | 3 |
