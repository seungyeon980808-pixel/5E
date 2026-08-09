# 반복 삽화 자산 후보 감사

> 이 문서는 메타데이터 전용 감사 결과다. 기출 PNG를 복사·수정·생성하지 않았다.

## 결론

- 전체 기출 라이브러리: **3,961문항**
- 도식 아틀라스 설명이 있는 문항: **936문항 (23.63%)**
- 시각 메타데이터가 없어 유형을 단정하지 않은 문항: **3,025문항**
- blocker 출현: 사람 **63**, 차량 **28**, 손 **19** (중복 문항 포함 110건, 고유 문항 89개)
- 별도 말풍선 blocker: **31건**. 코드 자산은 빈 외곽만 제공하고 현재 source/request가 말풍선을 명시할 때만 사용한다.

따라서 63/28/19는 전체 3,961문항의 실제 삽화 총량이 아니라 **936개 수동 분석 아틀라스에서 확인된 blocker mention**이다. 나머지 3,025문항을 ‘없음’으로 세지 않는다.

## 재사용 우선 후보

| candidate | status | evidence | 정확한 사용 범위 |
| --- | --- | --- | --- |
| `existing_hand_grip` | implemented_safe_wrapper_provenance_locked | 3 | Layered one-hand grip around an incline block, entering from the same side as the source pose. |
| `existing_hand_press` | implemented_safe_wrapper_exact_scene_only | 1 | Dashed/ghost two-finger hand compressing the spring in the source arrangement. |
| `candidate_student_trio_seated_dialogue` | implemented_code_native | 13 | Three seated students at a desk/round table; labels remain separate and blank bubble outlines are opt-in only for a source-confirmed bubble scene. |
| `candidate_spacecraft_flat_shell_family` | implemented_code_native | 18 | Flat evaluation-style spacecraft/rocket shell with optional window and internal apparatus layers. |

후보는 원본 픽셀 재사용 허가가 아니다. 신규 후보는 여러 기출에서 반복된 기능만 추출한 **새 원본 선화/파라메트릭 자산**이다. 라벨과 실험 장치는 별도 객체로 남기며, 빈 말풍선 외곽도 명시적으로 요청된 경우에만 별도 그룹으로 생성한다.

## 보류한 유사군

| cluster | evidence | 보류 이유 |
| --- | --- | --- |
| `defer_student_trio_standing_dialogue` | 1 | Only one occurrence satisfies all strict pose/group/action fields; other board-dialogue notes do not state standing pose. |
| `defer_astronaut_observer` | 12 | Rows often combine an embedded occupant and an external observer in one panel, while direction and exact pose are usually absent. |
| `defer_road_vehicle_family` | 7 | The notes mix bus interior, bus front, side-road cars, autonomous sedan, and truck scenes; one shared silhouette is not evidenced. |
| `defer_vertical_hand_grip` | 4 | Repeated vertical contact exists, but targets include rod, tube, charged-object apparatus, and burette/flask with different occlusion geometry. |
| `defer_gloved_lab_hands` | 2 | Only two gloved scenes are described and their actions differ (cotton-on-skin versus two-hand burette/flask handling). |

출현 횟수가 있어도 자세·방향·접촉이 섞였으면 자산 후보로 승격하지 않았다.

## 기존 손 자산

| asset | source | files | eligible occurrences | 검수 |
| --- | --- | --- | --- | --- |
| `hand_grip` | `p1_2025_06_19` | hand_grip.png, hand_grip_back.png, hand_grip_front.png | 3 | 파일 존재; 범용성 검수 필요 |
| `hand_press` | `p1_2024_11_08` | hand_press.png | 1 | 파일 존재; 범용성 검수 필요 |

- `hand_grip`: back/front 분할은 합성에 유용하지만 새 자세를 증명하지 않는다. 작은 원문 표식처럼 보이는 픽셀 가능성을 포함해 문자·기호 오염을 수동 검수해야 한다.
- `hand_press`: 점선 ghost 압축 자세의 정확한 원본 장면에만 대응한다. 실선 손이나 일반 누르기로 변환하지 않는다.

## person (63)

### 과목 세부 영역

| cluster | mentions |
| --- | --- |
| `역학` | 27 |
| `현대물리학` | 23 |
| `광학` | 8 |
| `역동적인화학반응` | 4 |
| `전자기학` | 3 |
| `원자의세계` | 1 |
| `항상성과몸의조절` | 1 |

과목 세부 영역은 다중 라벨이므로 표 합계가 blocker mention보다 클 수 있다.

### subtype

| cluster | mentions |
| --- | --- |
| `student_group` | 32 |
| `astronaut_or_space_observer` | 12 |
| `apparatus_operator` | 5 |
| `vehicle_occupant` | 5 |
| `anatomical_fragment` | 2 |
| `contextual_person` | 2 |
| `teacher` | 2 |
| `generic_person` | 1 |
| `observer` | 1 |
| `unknown` | 1 |

### pose

| cluster | mentions |
| --- | --- |
| `unknown` | 31 |
| `seated` | 16 |
| `standing` | 9 |
| `anatomical_fragment` | 2 |
| `running` | 2 |
| `hand_raised` | 1 |
| `pulling` | 1 |
| `pushing` | 1 |

### orientation

| cluster | mentions |
| --- | --- |
| `unknown` | 63 |

### contact

| cluster | mentions |
| --- | --- |
| `not_described` | 30 |
| `inside_vehicle` | 14 |
| `seated_at_table_or_desk` | 14 |
| `beside_projectile` | 2 |
| `standing_on_scale_or_platform` | 2 |
| `pushing_object` | 1 |

### action

| cluster | mentions |
| --- | --- |
| `dialogue` | 32 |
| `demonstrate_or_observe` | 10 |
| `not_described` | 10 |
| `stand` | 4 |
| `pull` | 3 |
| `run` | 2 |
| `eat` | 1 |
| `push` | 1 |

메타데이터 충족률 — panel 98.41%, pose 50.79%, orientation 0%, contact 52.38%, action 84.13%.

## vehicle (28)

### 과목 세부 영역

| cluster | mentions |
| --- | --- |
| `역학` | 20 |
| `현대물리학` | 12 |
| `광학` | 3 |
| `역동적인화학반응` | 1 |
| `전자기학` | 1 |
| `화학의첫걸음` | 1 |

과목 세부 영역은 다중 라벨이므로 표 합계가 blocker mention보다 클 수 있다.

### subtype

| cluster | mentions |
| --- | --- |
| `spacecraft_or_rocket` | 18 |
| `road_car_or_truck` | 4 |
| `road_bus` | 3 |
| `bicycle_wheel` | 1 |
| `cart` | 1 |
| `military_ship` | 1 |

### pose

| cluster | mentions |
| --- | --- |
| `not_applicable` | 28 |

### orientation

| cluster | mentions |
| --- | --- |
| `unknown` | 18 |
| `rightward` | 5 |
| `multiple_unspecified` | 2 |
| `opposed_directions` | 2 |
| `circular_path` | 1 |

### contact

| cluster | mentions |
| --- | --- |
| `space` | 18 |
| `road_or_lane` | 3 |
| `not_described` | 2 |
| `track_or_ground` | 2 |
| `circular_path` | 1 |
| `water` | 1 |
| `wheel_only` | 1 |

### action

| cluster | mentions |
| --- | --- |
| `moving` | 18 |
| `not_described` | 5 |
| `static_context` | 3 |
| `orbital_motion` | 1 |
| `rebound_or_collision` | 1 |

메타데이터 충족률 — panel 100%, pose 100%, orientation 35.71%, contact 92.86%, action 82.14%.

## hand (19)

### 과목 세부 영역

| cluster | mentions |
| --- | --- |
| `역학` | 8 |
| `역동적인화학반응` | 4 |
| `전자기학` | 2 |
| `고체지구` | 1 |
| `광학` | 1 |
| `화학의첫걸음` | 1 |

과목 세부 영역은 다중 라벨이므로 표 합계가 blocker mention보다 클 수 있다.

### subtype

| cluster | mentions |
| --- | --- |
| `solid_or_not_described` | 16 |
| `gloved` | 2 |
| `dashed_ghost` | 1 |

### pose

| cluster | mentions |
| --- | --- |
| `grip` | 12 |
| `press` | 3 |
| `unknown` | 3 |
| `touch` | 1 |

### orientation

| cluster | mentions |
| --- | --- |
| `unknown` | 9 |
| `target_vertical` | 5 |
| `target_inclined` | 3 |
| `target_horizontal` | 2 |

### contact

| cluster | mentions |
| --- | --- |
| `rod_or_tube` | 6 |
| `block` | 4 |
| `instrument_or_tool` | 2 |
| `spring` | 2 |
| `burette_or_flask` | 1 |
| `knife` | 1 |
| `not_described` | 1 |
| `pump_bottle` | 1 |
| `skin_or_cotton` | 1 |

### action

| cluster | mentions |
| --- | --- |
| `grip` | 12 |
| `press` | 3 |
| `unknown` | 3 |
| `touch` | 1 |

메타데이터 충족률 — panel 94.74%, pose 84.21%, orientation 52.63%, contact 94.74%, action 84.21%.

## 해석 제한과 다음 단계

1. 사람 방향은 아틀라스 문장에서 거의 서술되지 않는다. 방향을 임의 추정하지 않았고, 자산 제작 시 좌/우 변형을 별도 승인해야 한다.
2. `flat` 투영은 같은 실루엣이라는 뜻이 아니다. 특히 우주선은 쉘 비율·창·탑승자·내부 실험 장치를 분리한다.
3. 손은 접촉 대상과 선 스타일이 일치할 때만 기존 자산을 매칭한다. 장갑·양손·도구 조작은 별도 계열이다.
4. 전체 라이브러리의 나머지 3,025문항까지 확정하려면 별도의 사람 검수 또는 비전 라벨링 패스가 필요하다. 현재 보고서는 그 부분을 추정하지 않는다.
5. 세부 출처·panel ref·`doNotGeneralize`는 JSON 매니페스트가 정본이다.

정본: `docs/engine-v2/ILLUSTRATION_ASSET_CANDIDATES.json`
