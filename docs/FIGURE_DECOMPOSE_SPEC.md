# 기출 도판 일괄 분해 명세 (FIGURE_DECOMPOSE_SPEC.md)

> **무엇인가**: 물리 기출 도판 483장(2023~2027)을 같은 잣대로 분해해
> **요소 동시출현표**를 만들기 위한 규격. 이 표가 곧 `add_scene` 조립체의 기본값이 된다.
>
> **왜 규격이 필요한가**: 판독은 서브에이전트가 나눠 한다. 어휘를 통제하지 않으면
> "수평면 띠 / 바닥 / 지면"처럼 제각각 적혀 집계가 불가능해지고 483장을 다시 봐야 한다.
>
> 상위 문서: `FIGURE_DESIGN_PRINCIPLES.md` §19(그림 분해). 이 문서는 그 대량 적용판이다.
> 최초 작성 2026-07-31.

---

## 0. 대상과 산출물

- **대상**: `assets/exam-library/images/` 중 `subject ∈ {p1, p2}` 이고 `year >= 2023` 인 483장
- **산출물 1**: `docs/figure-atlas.jsonl` — 도판 1장당 JSON 1줄 (원본 데이터)
- **산출물 2**: `docs/PART_FREQUENCY.md` — 동시출현표 (집계 결과, 스크립트로 생성)

---

## 0.5 5E가 이미 갖고 있는 것 — **blocker로 적기 전에 반드시 이 표부터 본다**

2026-07-31 재판독에서 **blocker 5건이 오진**으로 확인됐다. 원인은 판독 담당이
타입 이름 한 줄(`describe_schema` 요약)만 보고 세부 옵션을 안 봤기 때문이다.
아래는 실제 코드(`js/render/*.js`)를 읽어 확인한 사실이다. **이 표에 있는 걸
blocker로 적으면 틀린 것이다.**

**전용 타입은 `kind`/`element` 값까지 봐야 한다.** 타입 이름만 보고 "없다"고 판정한 게
오진의 대부분이었다. 아래가 실제로 지원되는 값의 전부다.

| 그리려는 것 | 쓰는 것 |
|---|---|
| **입체 상자·판·원기둥·쐐기(입체 빗면)·책상·3D축·평면** | `solid3d` 의 `kind`: `box` `slab` `cylinder` **`wedge`** `desk` `axes3d` `plane` — 경사 투영으로 그려진다 |
| **물결 화살표**(광자·전자기파) | `line` 의 `lineMode: "wavyArrow"` (`waveLength`·`waveAmp` 조절) |
| **선 중간 화살촉** | `line` 의 `lineMode`: `middleArrow` `midInward` `lengthArrow` |
| **막대자석**(N/S극 포함) | `fieldlines` 의 `kind:"bar"` + `showMagnet` — 자석 몸체까지 그려진다 |
| **직선 도선 주위 자기장**(동심원·⊗) | `fieldlines` 의 `kind:"wire"` (`rings`·`into`) |
| **전기력선**(두 전하·점전하·평행판) | `chargefield` 의 `kind`: `pair` `single` `uniform` |
| **점광원 / 스크린 / 물체 화살표** | `optics` 의 `kind`: `point_light` `screen` `object_arrow` |
| **볼록·오목 렌즈, 볼록·오목·평면 거울** | `optics` 의 `kind`: `convex_lens` `concave_lens` `convex_mirror` `concave_mirror` `plane_mirror` |
| **도르래**(2종) | `optics` 의 `pulley` / `apparatus` 의 `pulley` |
| **코일·인덕터** | `circuit` 의 `element: "inductor"` (회로 안) / `spring` 의 `springStyle:"helix"` (역학) |
| **교류 전원 · 다이오드 · 축전기 · 전구 · 전류계 · 전압계 · 스위치(단·양극)** | `circuit` 의 `element`: `ac_source` `diode` `capacitor` `lamp` `ammeter` `voltmeter` `switch` `switch_spdt` `unknown` |
| **숫자 표시창 달린 전자저울** | `apparatus` 의 `kind:"scale"` — `displayText` 로 숫자를 넣는다 |
| **나침반 · 클램프 · 도선** | `apparatus` 의 `kind`: `compass` `clamp` `wire` |
| **단진자** | `pendulum` (p1=고정점, p2=추) |
| **정상파**(줄·열린관·닫힌관) | `standingwave` 의 `medium`: `string` `open` `closed` |
| **포물선 궤적** | `parabola` (p1·p2 = 바닥 그림자의 출발·도달점) |
| **바닥에 누운 거리 표시 점선 호** | `groundarc` (p1=중심, p2=시작점) — 이 용도 전용 타입 |
| **자·각도기** | `gauge` 의 `kind`: `ruler` `protractor` |
| **곡선 아래 음영**(적분 넓이) | `curve` 의 `closed`+`fillLevel`+`fillStyle` |
| **곡선에 화살촉** | `curve` 의 `arrowHead`: `none` `end` `start` `both` |
| **띠·영역 음영**(에너지띠·스펙트럼대 등) | `rect`/`polyline` 의 `fillLevel`+`fillStyle`(`solid` `dots` `cross` `hatch`) |
| **궤도·원형 점선** | `ellipse` 에 `dashLength`/`dashGap` |
| **그래프 배경 격자** | `coordplane` 이 축·격자·눈금을 함께 그린다 — 격자를 blocker로 적지 마라 |
| **굽은(호형) 화살표** | `curve`(점 3개) + `arrowHead:"end"` — **확정. blocker로 적지 마라** |
| **분수·루트 라벨**(√3/2 d 등) | `formula` 타입(중괄호 수식 문법) — blocker로 적지 마라 |
| **마름모·둥근 상자**(흐름도) | `polyline`(closed) / `rect` 로 조합 가능 |
| **지시선 + 라벨**(㉠㉡) | `labeler` — 단 **직선 지시선만**, 꺾인 지시선은 없음 |
| **로마숫자 Ⅰ Ⅱ Ⅲ** | `text` 에 `{roman1}`~`{roman12}` |
| **첨자·그리스문자** | 대부분 타입의 `label` 에 `theta_1` `R_1` 처럼 쓰면 자동 변환 |

### ⚠️ 객체 타입만 보면 안 된다 — **모달·도구의 기능**도 봐야 한다

2026-07-31 오진 142건의 원인이 이것이다. `describe_schema` 로 객체 타입만 확인하고
**그래프 만들기 모달(`js/graph/graph-modal.js`)의 기능을 안 봤다.**

| 그리려는 것 | 어디에 있나 |
|---|---|
| **그래프 눈금값→점 점선**(가로+세로 쌍) | 그래프 모달 **"수선의 발"** (`annGuides`) |
| **두 점 사이 임의 점선** | 그래프 모달 **"가이드라인"** (`guideLines`) |
| **기호 범례 블록**(선 견본 + 설명) | 그래프 모달 **"범례"** (`legends`) — 드래그로 위치 조정 |
| **곡선 중간 화살촉**(접선 방향) | 그래프 모달 **"화살표"** — 곡선 위를 클릭하면 접선 방향으로 놓인다 |
| **곡선 위 표시점 ●** | 그래프 모달 **"표시점"** |
| **치수선 + 양끝 화살촉 + 끝 캡 + 라벨** | `line` 의 `lineMode:"lengthArrow"` **한 객체로 전부** — `dimensionVariant`(basic/leftBar/rightBar/bothBars)로 끝 캡, `dimensionLabel` 로 가운데 라벨 |

**앞으로 blocker 를 적기 전에 이 표와 위 표를 둘 다 확인하라.**

**아직 진짜로 없는 것** (2026-07-31 확인):

| 없는 것 | 왜 없다고 보나 |
|---|---|
| 치수 표시의 **점선 연장선 자동 정렬** | 치수선 본체(화살촉·캡·라벨)는 `line.lineMode:"lengthArrow"` 한 객체로 완성된다. 없는 건 **두 기준점에서 뻗는 점선 연장선을 자동으로 맞춰주는 것**뿐 — 지금은 `line` 2개를 손으로 정렬한다 |
| **꺾인 지시선** | `labeler` 는 p1→p2 **직선만**. 중간에 꺾이는 지시선이 없다 |
| 트랜지스터 기호 | `circuit.element` enum에 없음 |

**애매해서 함부로 blocker로 적으면 안 되는 것** — 새 부품이 아니라 **기존 것을
조합하는 방법**을 모르는 경우일 수 있다. 확신 없으면 blocker로 적되 `note` 에
"기존 부품으로 조합 가능한지 불확실"이라고 적어라:

| 것 | 아마도 |
|---|---|
| 축 생략 기호(≈) | 짧은 대각선 `line` 2개로 이미 조합 가능할 수 있다 |
| 점을 점선 원이 감싼 마커 | `ellipse`(점선) + 점 하나로 이미 가능할 수 있다 |

---

## 1. 층 구조 — 패널이 최상위다

`FIGURE_DESIGN_PRINCIPLES.md` §19의 6층 위에 **패널 층**을 하나 얹는다.
기출 도판의 최상위 단위는 그림 하나가 아니라 `(가)/(나)` 배치이기 때문이다.

```
도판 (파일 1장)
└─ 패널[]  ← (가)/(나)/(다) 또는 무명 단일
   └─ ①골격 ②영역 ③물체 ④연결 ⑤보조 ⑥주석
```

### 패널 종류 (`panel.kind`) — 이 5개만 쓴다

| 값 | 뜻 |
|---|---|
| `scene` | 물리 장면 (빗면·수평면·물체·실 등) |
| `graph` | 좌표평면 + 곡선 |
| `circuit` | 회로도 |
| `table` | 표. 격자는 `skeleton`에 `table_grid`, 머리글·칸 내용은 전부 `annot`에 `label_*` 로 넣는다 |
| `diagram` | 흐름도·개념도 — 마름모·둥근 상자·흐름 화살표로 된 도식. **삽화가 아니다**(도형이라 대부분 재현 가능) |
| `illustration` | 삽화 중심 (사람·기구 그림) — 5E 재현 대상 아님 |

### 패널 경계 규칙 (2026-07-31 1차 테스트에서 추가)

판정이 갈렸던 네 경우를 못박는다. **여기 규칙이 §1 표보다 우선한다.**

| 상황 | 판정 |
|---|---|
| 좌표축 위에 물체를 배치했는데 곡선이 없다 | `scene` (골격에 `axis`). `graph`는 **곡선·직선이 있을 때만** |
| 삽화가 섞였지만 장면을 지탱하는 건 골격(빗면·레일·벽)이다 | `scene` + `repro: partial` |
| 삽화가 그림의 전부다 (사람·기구가 주인공) | `illustration` + `repro: none` |
| 한 패널 안에 Ⅰ·Ⅱ·Ⅲ 상태가 쌓여 있다 | **패널 1개.** 패널은 원본 이름((가)/(나)) 단위로만 센다. 상태는 `label_roman`으로 표시 |
| 패널 이름이 (가)/(나)가 아니라 **P/Q, A/B** 같은 표기다 | 원본 표기를 그대로 `name` 에 쓴다 |
| **이름 없는** 그림 여럿이 한 장에 나란히 있다 | 그림 수만큼 패널로 세되 `name` 을 가로면 `"좌"`/`"우"`, 셋이면 `"좌"`/`"중"`/`"우"`, 세로면 `"상"`/`"하"`, 셋이면 `"상"`/`"중"`/`"하"` 로 적는다. `null` 이 둘 이상이면 구분이 안 돼 금지 |
| 삽화가 주인공인데 **자료 부분(그래프·치수)은 재현 가능**하다 | `illustration` + **`repro: "partial"`**. `none` 은 그림 전체가 삽화일 때만. §1 표보다 이 줄이 우선한다 |

### 6층의 뜻 (요소를 어느 층에 넣나)

| 층 | 넣는 것 |
|---|---|
| ① 골격 | 장면을 지탱하는 것 — 빗면, 수평면, 벽, 천장, 트랙, 축 |
| ② 영역 | 면적을 가진 구분 — 마찰 구간, 매질 영역, 자기장 영역, 음영 띠 |
| ③ 물체 | 움직이거나 놓인 것 — 블록, 구슬, 추, 전하, 렌즈 |
| ④ 연결 | 물체를 잇는 것 — 실, 용수철, 막대, 도선 |
| ⑤ 보조 | 의미를 나르는 선 — 화살표, 점선 기준선, 치수선, 각도 호, 직각 표시 |
| ⑥ 주석 | 글자 — 이름표, 물리량, 패널 이름, 단위, 로마숫자 |

---

## 2. 요소 어휘 (통제 목록) — **여기 없는 이름을 쓰지 않는다**

새 요소가 나오면 `misc:<자유표기>` 로 적고 넘어간다. 나중에 `misc` 빈도를 세어
어휘에 정식 편입할지 판단한다. **임의로 비슷한 이름을 만들지 않는다.**

### ① 골격
`incline` 빗면 · `ground` 수평면/지면 · `ceiling` 천장 · `wall` 벽 ·
`track` 곡선 트랙 · `axis` 축(그래프 아님, 장면 속 기준축) ·
`rail` 평평한 지지 구조(광학 레일·실험대 상판·직선 레일) · `interface` 매질 경계선 ·
`table_grid` 표의 격자(`table` 패널에서) · `frame_box` 그림을 감싸는 테두리 사각틀

### ② 영역
`friction_zone` 마찰 구간 · `medium_zone` 매질 영역 · `field_zone` 장 영역 ·
`shade_band` 의미 없는 음영 띠 ·
`region` 그 밖의 의미 있는 구간·영역 음영(운동 종류별 구간, 다각형 음영 등)

### ③ 물체
`block` 사각 물체 · `ball` 원형 물체 · `hanging_mass` 매달린 추 ·
`cylinder` 원기둥 · `charge` 점전하 · `charged_body` 대전체(막대·구) ·
`stand` 받침대(절연 받침대 포함) · `ghost` 점선 처리된 이전/이후 위치 ·
`cart` 수레·운반대(부품은 `svgAsset.cart` 로 있다) · `magnet` 자석 몸체(N/S극) ·
`coil` 코일·솔레노이드 · `energy_level` 에너지 준위 가로선 ·
`wavefront` 파면(평행선·동심원) · `slit` 슬릿 ·
**광학**: `light_source` 광원(점광원·광원상자) · `lens` 렌즈 · `mirror` 거울 ·
`screen` 스크린 · `tank` 수조·용기 · `prism` 프리즘 · `object_arrow` 물체 화살표 ·
**열역학**: `piston` 피스톤·실린더 · `gas_particle` 기체 입자 점 · `heat_source` 열원 ·
**도식**: `flow_node` 흐름도 상자·마름모 ·
**삽화 요소**: `illust` — 사람·손·차량·우주선·말풍선·칠판·사진 등 삽화 덩어리.
요소 어휘는 이 하나로 통일하고 무엇인지는 `note` 에 적는다(blockers 에는 `person` `vehicle`
같은 구체 id 로 따로 적는다) ·
**실험 기구**: `instrument` — 선으로 그린 실험 기구 전반(전원 장치, 광전관, 확성기,
검류계, 온도계, 열량계, 저울, 광센서, 속도 측정기 등). **요소 어휘는 이 하나로 통일**하고,
어떤 기구인지는 패널 `note` 에 적는다. 부품이 없어 못 그리면 `blockers` 에 구체적 id
(`phototube` `power_supply` `speaker` 등)로 따로 적는다 — 요소 이름과 부품 대기열은 별개다.

### ④ 연결
`string` 실 · `spring` 용수철 · `rod` 막대 · `wire` 도선

### ⑤ 보조
`arrow_motion` 운동 방향 화살표 · `arrow_force` 힘/가속도 화살표 ·
`arrow_field` 장 방향 화살표 · `dim_line` 치수선 · `guide_dash` 점선 기준선 ·
`angle_arc` 각도 호 · `right_angle` 직각 표시 ·
`leader_line` 지시선(라벨에서 대상으로 뻗는 꺾은 선) ·
`ref_point` 기준점(장면 속 검은 점 p, P) ·
`arrow_current` 전류 방향 화살표 · `field_symbol` 장 방향 기호 격자(× · •) ·
`range_bar` 축 위 대역 범위 밑줄 · `axis_tick` 눈금 표시선(라벨 아님) ·
`arrow_transition` 상태·과정 전이 화살표 (에너지 준위 전이, A→B 과정, 흐름도 화살표 모두) ·
`trajectory` 점선 궤적 ·
`light_ray` 광선(진행 경로 선) · `grid_lines` 배경 점선 격자 ·
`arrow_direction` 축 밖 방향 지시 화살표("파장 증가" 등) ·
`arrow_wave` 물결 화살표(광자·전자기파) — 부품은 있다(`line.lineMode:"wavyArrow"`)

### ⑥ 주석
`label_name` 이름표(A, B, P) · `label_qty` 물리량(3m, v₀, θ) ·
`label_panel` 패널 이름((가)) · `label_roman` 로마숫자(Ⅰ, Ⅱ) · `label_unit` 단위 ·
`label_partname` **부품 이름표(한글)** — "천장" "실" "수평면" "막대" "레일" ·
`label_caption` 상태 설명문 — "충돌 전", "B가 A와 충돌한 후" ·
`legend` 기호 범례 블록 — "×: 들어가는 방향", "◜: 시계 방향" ·
`axis_title` 축 이름("속력", "시간") — 눈금값(`tick_label`)과 구분한다

> **`label_partname` vs `label_name` 경계**: 그림 속 **구조물·부품**을 가리키면
> `label_partname`("수평면", "천장", "레일"). 대상의 **종류·분류 이름**이면
> `label_name`("감마선", "X선", "라디오파", "A", "P").

### 회로 전용 (`circuit` 패널에서만)
`resistor` 저항 · `resistor_box` 저항상자 · `battery` 전지 · `switch` 스위치 ·
`ammeter` 전류계 · `voltmeter` 전압계 · `lamp` 전구 · `capacitor` 축전기 ·
`transistor` 트랜지스터 · `diode` 다이오드/pn 소자 · `ac_source` 교류 전원(∿) ·
`terminal_node` 단자 동그라미

### 그래프 전용 (`graph` 패널에서만)
`plane` 좌표평면 · `curve` 곡선 · `line` 직선 · `point_marker` 점 표시 ·
`area_fill` 곡선 아래 음영 · `axis_break` 축 생략 기호(≈)

### 패널 종류와 무관한 어휘
`tick_label` 눈금 값(0, d, 2d, 10⁻¹²) — **`scene` 패널의 축 눈금값도 이것으로 적는다.**
같은 시각 요소가 패널 종류에 따라 다른 이름이 되면 집계가 어긋나기 때문이다.

---

---

## 2.5 층 배정표 — **어휘마다 들어갈 키가 정해져 있다**

`elements` 의 키는 `skeleton / zone / object / link / aux / annot` 6개로 고정이다.
§2의 모든 어휘가 **어느 키에 들어가는지 아래 표로 결정된다. 판단하지 마라.**

> 이 표가 없으면 에이전트마다 `resistor`를 object에 넣거나 link에 넣어
> 집계 단계에서야 어긋난 게 드러난다. 그때는 483장을 다시 봐야 한다.

| 키 | 들어가는 어휘 |
|---|---|
| `skeleton` | `incline` `ground` `ceiling` `wall` `track` `axis` **`plane`**(좌표평면) **`interface`**(매질 경계선) |
| `zone` | `friction_zone` `medium_zone` `field_zone` `shade_band` **`area_fill`** |
| `object` | `block` `ball` `hanging_mass` `cylinder` `charge` `charged_body` `stand` `ghost` `coil` `energy_level` `slit` · **광학**: `light_source` `lens` `mirror` `screen` `tank` `prism` · **회로 부품 전부**(`resistor` `resistor_box` `battery` `switch` `ammeter` `voltmeter` `lamp` `capacitor` `transistor` `diode` `ac_source` `terminal_node`) · **`curve` `line` `point_marker`**(그래프의 곡선·직선·점) |
| `link` | `string` `spring` `rod` **`wire`**(도선) |
| `aux` | `arrow_motion` `arrow_force` `arrow_field` `arrow_current` `arrow_transition` `arrow_wave` `dim_line` `guide_dash` `angle_arc` `right_angle` `leader_line` `ref_point` `field_symbol` `range_bar` `axis_tick` **`axis_break`** `trajectory` `light_ray` `grid_lines` `wavefront` |
| `annot` | `label_name` `label_qty` `label_panel` `label_roman` `label_unit` `label_partname` `label_caption` `legend` **`tick_label`** |

**`misc:` 항목의 층**은 스스로 판단해 가장 가까운 키에 넣고, `note` 에 왜 그 층인지 한 마디 적어라.

### 갈리기 쉬운 두 경우 (2026-07-31 2차 테스트에서 추가)

| 상황 | 판정 |
|---|---|
| **도선 고리**(원형·사각)가 장면의 주인공이다 | `object` 에 `wire` 를 넣는다. `link` 의 `wire` 는 **회로 배선일 때만** |
| 수평면과 빗면이 짧은 **곡선으로 이어진다** | `ground` + `incline` 만 쓴다. `track` 은 **곡선 자체가 장면의 주인공일 때만**(언덕형 트랙 등) |

---

## 3. 재현 등급 (`repro`)

| 값 | 기준 |
|---|---|
| `full` | 5E의 기존 타입·자산만으로 전부 그릴 수 있다 |
| `partial` | 일부만 가능 (예: 삽화가 섞였지만 자료 부분은 재현 가능) |
| `none` | 삽화·사진 중심 — 5E 대상 아님 |

**판정은 보수적으로.** 애매하면 `partial`.

### `blockers` — 왜 full이 아닌지 반드시 남긴다 (2026-07-31 추가)

**적기 전에 §0.5 를 반드시 확인한다.** 거기 있는 걸 blocker로 적으면 오진이다.

`repro` 가 `partial` 또는 `none` 이면 **최상위에 `blockers` 배열을 반드시 적는다.**
등급만 있고 이유가 없으면 "무엇을 만들면 되는가"에 답할 수 없어 데이터가 무용해진다.

```json
"repro": "partial",
"blockers": [
  {"what": "transistor", "type": "part"},
  {"what": "안전모를 쓴 사람", "type": "illustration"}
]
```

| `type` | 뜻 | 나중에 할 조치 |
|---|---|---|
| `part` | 5E에 그 **부품·기호가 없다** | 부품으로 만든다 |
| `assembly` | 부품은 있는데 **묶음 관계**가 없다 (치수 표시 등) | 조립체로 만든다 |
| `illustration` | **사람·손·차량·건물·풍경** 등 5E가 만들 물건이 아닌 것 | 만들지 않는다. 원본 크롭을 `image` 로 얹는다 |
| `layout` | 표·복잡한 다중 배치 등 **구성** 문제 | 5E 구조 과제로 따로 분류 |

`repro: "full"` 이면 `blockers` 는 빈 배열 `[]`.

### `what` 은 반드시 **짧은 영문 id** 로 쓴다 (2026-07-31 재판독에서 추가)

자유 문장으로 적으면 같은 것이 다르게 표현돼 **집계가 안 된다.**
실제로 1차 재판독에서 "치수선 묶음(양끝 화살표…)" 과 "높이 치수 표시(점선 기준선…)" 이
같은 물건인데 따로 세어져, 6장짜리 1순위가 1장짜리 6종으로 흩어졌다.

**설명은 `what` 이 아니라 패널 `note` 에 적어라.** `what` 은 아래 id 중 하나다.

| `type` | id | 무엇 |
|---|---|---|
| assembly | `dim_group` | 치수 표시 — 기준선/점선 + 양방향 화살표 + 값 라벨 |
| assembly | `legend_block` | 기호 범례 블록 (×: 들어가는 방향 …) |
| assembly | `dash_grid` | 눈금값에서 점까지 뻗는 점선 격자(가로+세로 쌍) |
| assembly | `area_under_curve` | 곡선과 축 사이를 닫아 칠한 음영 |
| assembly | `arc_distance` | 두 점 사이 거리를 나타내는 점선 호 + 라벨 |
| assembly | `marker_ring` | 통과점 마커 — 검은 점을 점선 원이 감쌈 |
| assembly | `mid_arrowhead` | 선·곡선 중간에 얹는 진행 방향 화살촉 |
| assembly | `leader_group` | 라벨에서 대상으로 뻗는 꺾은 지시선 묶음 |
| assembly | `stand_assembly` | 받침대 묶음 — 받침판 + 기둥 + 얹힌 물체 |
| assembly | `rig_attach` | 기구 부착 묶음 — 레일 위 운반대, 벽의 충격기 등 |
| part | `axis_break` | 축 생략 기호 (≈) |
| part | `arrow_arc` | 굽은(호형) 화살표 — 원형 전류 방향 등 |
| part | `arrow_hook` | U자형 되돌이 화살표 |
| part | `balance_scale` | 전자저울 (표시창 + 받침판) |
| part | `transistor` · `diode` · `ac_source` | 회로 소자 기호 |
| layout | `diagonal_wiring` | 직교 배선으로 안 되는 대각선 회로 배치 |
| illustration | `person` `vehicle` `helmet` `hand` `speech_bubble` `blackboard` `lab_bench` **`photo`**(사진·X선·열화상) | 삽화 — 만들지 않는다 |

**검류계(G)는 `circuit.ammeter` 의 라벨을 바꾸면 되므로 blocker 로 적지 마라.**
같은 이유로 전압계·저항상자(`unknown`)도 이미 있는 것으로 본다.

### `part` 와 `illustration` 의 경계 (2026-07-31 추가)

실험 기구 그림에서 이 둘이 계속 헷갈렸다. **기준은 "선으로 그린 도구인가"다.**

| 것 | 어느 쪽 |
|---|---|
| 전원 장치 상자, 솔레노이드 보빈, 디지털 온도계, 열량계, 검류계, 광전관, 이중 슬릿 | **`part`** — 선으로 그린 실험 기구다. 만들 가치가 있으니 빈도를 세야 한다 |
| 사람, 손, 차량, 우주선, 안전모, 칠판, 실험대, 말풍선, 사진 | **`illustration`** — 5E가 만들 물건이 아니다 |

애매하면 `part` 로 적어라. 빈도가 낮으면 나중에 안 만들면 그만이지만,
`illustration` 으로 적으면 집계에서 아예 빠져 판단 기회를 잃는다.

**목록에 없으면 새 id 를 만들되 규칙을 지켜라**: 소문자 영문 + 밑줄, 두 단어 이내,
**무엇인지**를 가리킬 것(어디에 쓰였는지가 아니라). 상세는 `note` 로.

---

## 4. JSONL 스키마 (1장 = 1줄)

```json
{
  "file": "p1_2024_06_05.png",
  "year": 2024, "subject": "p1", "no": 5,
  "tags": ["마찰력", "빗면"],
  "repro": "full",
  "blockers": [],
  "projection": "flat",
  "panels": [
    {
      "name": "(가)",
      "kind": "scene",
      "elements": {
        "skeleton": ["incline"],
        "zone": [],
        "object": ["block", "hanging_mass"],
        "link": ["string"],
        "aux": ["arrow_motion", "arrow_force"],
        "annot": ["label_name", "label_qty", "label_panel"]
      },
      "assets": ["pulley"],
      "note": "빗면 위 블록 A와 도르래 너머 매달린 B"
    }
  ]
}
```

| 필드 | 규칙 |
|---|---|
| `repro` | §3의 3값 중 하나 |
| `projection` | `flat`(평면) / `oblique`(경사 투영 입체) / `mixed` |
| `panels[].name` | 원본 표기 그대로. 없으면 `null` |
| `elements.*` | §2 어휘. **중복 없이, 등장하면 1회만** (개수는 세지 않는다) |
| `assets` | 전용 부품이 필요한 것: `pulley` `lens` `mirror` `pendulum` `scale` `clamp` `stand`(받침대·절연 받침대) `spring_scale`(용수철저울) |
| `note` | 한 줄. 조립 관계를 적는다 (무엇이 무엇에 붙어 있나) |

**개수를 세지 않는 이유**: 우리가 알고 싶은 건 "무엇이 **함께** 나오는가"이지
"몇 개 나오는가"가 아니다. 개수를 세면 판독 시간이 몇 배가 되고 일관성도 떨어진다.

---

## 5. 서브에이전트 작업 절차

1. 이 문서를 읽는다 (§2 어휘가 핵심).
2. 배정받은 파일 목록(10장)을 `Read` 로 하나씩 본다.
3. 장당 JSON 1줄을 만든다.
4. `docs/figure-atlas.jsonl` 에 **append** 한다. 기존 줄을 건드리지 않는다.
5. 처리한 파일명을 `docs/.atlas-done.txt` 에 append 한다 (중단·재개용).

**하지 않을 것**
- 어휘에 없는 이름 만들기 → `misc:` 접두사를 쓴다
- 좌표·치수 측정 → 이 작업은 **요소 목록**만 뽑는다. 좌표는 재현할 때 잰다
- 이미지를 확대해 세부 확인 → 한눈에 안 보이면 그 요소는 관례가 아니다

---

## 6. 집계

`docs/PART_FREQUENCY.md` 를 스크립트로 만든다. 뽑을 것:

- **패널 종류 분포** — `scene` 이 몇 %인가 (조립체 투자 우선순위)
- **`repro` 분포** — 5E 재현 대상이 실제 몇 장인가
- **장면 패널의 요소 동시출현표** — `incline` 이 있을 때 함께 나오는 요소의 비율
  → **80% 이상이면 조립체 기본값 ON**, 30~80%는 파라미터, 30% 미만은 제외
- **`misc:` 빈도 상위** — 어휘에 빠진 것
- **`blockers` 빈도표 (`type` 별)** — **부품 제작 대기열**.
  `part` 상위 = 만들 낱개 부품 순위, `assembly` 상위 = 만들 조립체 순위.
  "이 부품 하나를 만들면 몇 장이 `full` 로 올라가는가"가 그대로 투자 근거가 된다.
  `illustration` 은 만들지 않는다 — 원본 크롭 합성 경로로 보낸다.

이 표가 `add_scene(kind:"incline_friction", ...)` 의 기본값 명세다.
