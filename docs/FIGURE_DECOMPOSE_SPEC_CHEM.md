# 화학 도판 분해 — 어휘 부록 (FIGURE_DECOMPOSE_SPEC_CHEM.md)

> **이 문서만 읽지 마라.** `FIGURE_DECOMPOSE_SPEC.md`(물리판)를 먼저 읽고,
> 이 문서를 **덮어쓰기 패치**로 적용한다. 패널 층 구조·6층·repro 등급·blockers
> 규칙·JSONL 스키마는 물리판 그대로다. 이 문서는 **어휘와 오진 방지표만** 바꾼다.
>
> 대상: `subject ∈ {c1, c2}` 이고 `year >= 2023` 인 **280장**
> 산출물: `docs/figure-atlas-c.jsonl` (물리 `figure-atlas.jsonl` 에 섞지 않는다)
> 최초 작성 2026-07-31. 근거: 균등 표본 24장 정찰.

---

## 0. 화학 도판은 물리와 무엇이 다른가 — 먼저 알아야 할 것

정찰 24장에서 나온 사실이다. 이걸 모르면 판정이 어긋난다.

1. **그래프가 압도적 주류다.** 24장 중 그래프 패널이 절반 가까이다. 물리처럼
   빗면·물체가 있는 `scene` 은 드물다. 대신 **좌표평면 + 곡선 2~3개 + 점선 보조선**이
   가장 흔한 단일 패턴이다.
2. **"그림"이 아니라 "텍스트를 담은 도형"이 많다.** 원형 강철 용기 안에 `A(g) 2 mol`
   두 줄, 사각 상자 안에 물질명과 농도 — 도형 자체는 원·사각형 하나뿐이고 내용은 전부 글자다.
3. **화학식 텍스트가 거의 모든 장에 있다.** `CO_2(s)`, `A(g)`, `[HA]`, `NaOH(aq)`.
   아래첨자·위첨자·이탤릭 상태기호가 붙는다.
4. **실험 장치는 물리보다 훨씬 단순하다.** 비커·실린더·원형 용기 정도이고,
   물리의 도르래·레일 같은 정밀 조립이 아니다. 다만 **5E에 용기 부품이 하나도 없다.**
5. **표는 생각보다 적다.** 정찰 24장에서 표 격자는 0장이었다. (본 분해에서 확인할 것)

---

## 0.5 5E가 이미 갖고 있는 것 — **화학판. blocker로 적기 전에 반드시 본다**

물리 분해에서 **오진 274건**이 났다. 원인은 그래프 모달 기능을 안 본 것이었다.
**화학은 그래프가 주류이므로 같은 실수를 하면 피해가 물리보다 크다.**

### ⚠️ 가장 중요 — 이 셋을 blocker 로 적으면 100% 오진이다

정찰 24장에서 **7/8 빈도로 나온** 것들이다. 셋 다 그래프 모달에 이미 있다.

| 그리려는 것 | 어디에 있나 |
|---|---|
| **눈금값에서 곡선·점까지 가로 점선 + 거기서 축으로 내리는 세로 점선**(항상 쌍으로 나오는 그것) | 그래프 모달 **"수선의 발"**(`annGuides`). 화학 도판에서 가장 흔한 요소다. **절대 blocker 아니다** |
| **곡선·점에 직접 붙은 이름표**(`X(l)`, `A`/`B`/`C`, `Ⅰ`/`Ⅱ`/`Ⅲ`) | 그래프 모달 **"표시점"** 라벨 + `curve`/`line` 의 `label` |
| **두 점 사이 임의 점선 / 긴 가로 기준선** | 그래프 모달 **"가이드라인"**(`guideLines`) |

그 외 그래프 모달에 있는 것: **범례**(`legends`), **곡선 접선 방향 화살촉**, **표시점 ●**,
**곡선 아래 음영**(`curve` 의 `closed`+`fillLevel`).

### 화학식·수식 텍스트 — 전부 된다. blocker 로 적지 마라

`formula` 타입과 대부분 타입의 `label` 이 LaTeX 유사 문법을 받는다.

| 쓰려는 것 | 문법 |
|---|---|
| 아래첨자 화학식 | `CO_2` `H_2O` `C_12H_22O_11` |
| 위첨자 전하 | `A^{2+}` `OH^-` `\delta^+` |
| 상태기호 | 그냥 `A(g)` `NaOH(aq)` `CO_2(s)` — 괄호 안 그대로 |
| 농도 대괄호 | `[HA]` `[C]_0` |
| 분수 | `\frac{[HA]}{[A^-]}` `\frac{1}{2}` |
| 그리스문자 | `\theta` `\delta` |
| 로마숫자 | `text` 에 `{roman1}`~`{roman12}` |
| 단위 붙은 축 이름 | `몰 농도(M)` — 괄호 안 한글도 정상 |

### 물리판 §0.5 표는 화학에서도 그대로 유효하다

특히 화학에서 자주 오해할 것만 다시 적는다.

| 그리려는 것 | 쓰는 것 |
|---|---|
| **입체 상자·원기둥·평면·3D축** | `solid3d` 의 `kind`: `box` `slab` `cylinder` `wedge` `desk` `axes3d` `plane` |
| **궤도·동심원·점선 원** | `ellipse` 에 `dashLength`/`dashGap` — **전자 껍질의 동심원은 이걸로 된다** |
| **회색 채운 영역**(피스톤 띠·액체) | `rect`/`polyline` 의 `fillLevel`+`fillStyle`(`solid` `dots` `cross` `hatch`) |
| **곡선 아래 음영** | `curve` 의 `closed`+`fillLevel` |
| **굽은(호형) 화살표** | `curve`(점 3개) + `arrowHead:"end"` — **blocker 아니다** |
| **그래프 배경 격자·축·눈금** | `coordplane` 이 한꺼번에 그린다 |
| **직선 지시선 + 라벨** | `labeler` — 단 **직선만**. 꺾인 지시선은 없다 |
| **치수선**(양끝 화살촉+캡+라벨) | `line` 의 `lineMode:"lengthArrow"` 한 객체로. 연속 치수는 MCP `add_dimension` |
| **마름모 판단상자·둥근 상자**(순서도) | `polyline`(closed) / `rect` 조합 — **순서도는 blocker 아니다** |
| **사각 테두리 상자 안에 여러 줄 텍스트** | `rect` + `text` 두 개. 조합으로 된다 |

### 아직 진짜로 없는 것 (화학 관련)

| 없는 것 | 비고 |
|---|---|
| **유리 기구**(비커·삼각플라스크·시험관·눈금실린더·깔때기) | `svgAsset` 레지스트리에 `pulley`·`cart` 둘뿐. **화학의 최대 공백** |
| **주사기형 실린더 + 피스톤** 묶음 | 용기 윤곽 + 회색 띠 + 지시선의 묶음 관계가 없다 |
| **전자 껍질 모형** 묶음 | 동심원(ellipse 점선)과 전자 점(작은 원)은 되지만, **껍질별 전자 개수를 넣으면 각도를 자동 배분**해 주는 것이 없다 |
| **루이스 전자점식** | 원소 기호 둘레 8방향 점 쌍 배치를 자동으로 해 주는 것이 없다 |
| **결정 격자**(투시 입방체 + 꼭짓점 구슬) | `solid3d.box` 는 있으나 꼭짓점·면심에 구슬을 자동 배치하는 것이 없다 |
| **음영 있는 3D 구슬**(원자) | 평면 `ellipse` 는 되지만 하이라이트·그림자가 있는 구 표현이 없다 |
| **꺾인 지시선** | 물리와 동일 (`leader_group`) |
| **축 끊김 기호(≈)** | 물리와 동일 (`axis_break`) |

---

## 2. 화학 요소 어휘 (물리판 §2를 이걸로 대체)

**물리판 §2의 어휘 중 화학에도 그대로 쓰는 것은 유지**하고(아래 "공용" 표시),
화학 전용을 추가한다. 여기 없으면 `misc:<id>` 로 적는다.

### ① 골격
`plane` 좌표평면(공용) · `ground` 바닥/받침면(공용) ·
`frame_box` 그림을 감싸는 테두리 사각틀(공용) · `table_grid` 표 격자(공용) ·
`zoom_circle` **확대 원 테두리** — 그림 일부를 확대해 담는 원형 틀 ·
`orbital_box` **오비탈 상자 칸** — 전자 배치를 나타내는 정사각 칸(1칸·3칸 줄) ·
`vessel` **용기 윤곽** — 비커·실린더·플라스크·시험관·강철 용기·원형 용기.
어떤 용기인지는 `note` 에 적는다 ·
`flow_frame` 순서도·상자 도표의 **틀 상자**(테두리만, 내용은 annot)

### ② 영역
`liquid_zone` **액체 영역**(회색 채운 부분 + 액면선) ·
`gas_zone` **기체 영역**(용기 안 빈 공간을 명시적으로 표시한 경우만) ·
`area_fill` 곡선 아래 음영(공용) · `region` 그 밖의 의미 있는 영역 음영(공용) ·
`shade_band` 의미 없는 음영 띠(공용)

### ③ 물체
`piston` **피스톤**(회색 가로 띠) · `stopcock` **꼭지·스톱콕**(밸브) ·
`stopper` **마개**(고무·유리 마개 — 꼭지와 다른 물건이다) ·
`atom_ball` **원자 구슬**(음영 있는 구 포함) · `molecule_model` **분자 모형**(구슬 2개 이상 + 결합선) ·
`shell_model` **전자 껍질 모형**(핵 + 동심원 + 전자점) ·
`lewis_dots` **루이스 전자점식**(기호 둘레 점) ·
`crystal_cell` **결정 격자 단위세포**(투시 입방체 + 구슬) ·
`ion_circle` **이온 기호가 든 동그라미**(중화 반응 모형 등) ·
`particle_dot` **입자 점**(기체 입자 산포, 개별 의미 없는 작은 원 무리) ·
`bond_line` **결합선**(단일·이중·삼중 — 구조식의 −, =, ≡) ·
`flow_node` 순서도 상자·마름모(공용) ·
`bar` **막대그래프의 막대**(축 위에 세운 사각 기둥) ·
`pie_sector` **원그래프 부채꼴**(원을 반지름 선으로 나눈 조각) ·
`solid_chunk` **고체 덩어리·더미** — 비커 속 금속 조각, 용기 바닥의 앙금·고체 더미 ·
`partition` **칸막이** — 용기 안을 나누는 얇은 격벽(피스톤과 달리 움직이지 않는다) ·
`membrane` **반투막** — U자관 바닥 등의 막 ·
`weight` **추** — 피스톤 위에 얹은 누름추 ·
`fixing_device` **고정 장치** — 피스톤을 붙잡아 두는 속 채운 검은 삼각형 표시 ·
`curve` 곡선(공용) · `line` 직선(공용) · `point_marker` 점 표시(공용) ·
`stand` 받침대·스탠드(공용) · `heat_source` 열원·가열 장치(공용) ·
`instrument` 그 밖의 선으로 그린 실험 기구(공용) · `illust` 삽화 덩어리(공용)

### ④ 연결
`tube` **유리관·연결관**(용기와 용기를 잇는 관) · `wire` 도선(공용) ·
`rod` 막대(공용) · `string` 실(공용)

### ⑤ 보조
`guide_dash` **점선 기준선**(공용) — ⚠️ 그래프의 수선의 발도 이것으로 적는다.
blocker 아니다 ·
`arrow_process` **과정 전이 화살표** — 패널과 패널 사이, 반응 전→후, 조작을 나타내는 화살표.
물리의 `arrow_transition` 을 화학에서는 이 이름으로 통일한다 ·
`arrow_motion` 이동·흐름 화살표(공용) · `arrow_electron` **전자 이동 화살표** ·
`spin_arrow` **스핀 화살표**(오비탈 상자 안 위/아래 화살표 쌍 — 이동 화살표가 아니다) ·
`dim_line` 치수선(공용) · `leader_line` 지시선(공용) ·
`angle_arc` 각도 호(공용, 결합각 표시) · `axis_tick` 눈금 표시선(공용) ·
`axis_break` 축 생략 기호(공용) · `ref_point` 기준점(공용) ·
`bracket_charge` **대괄호 [ ] 묶음 + 오른쪽 위 전하 첨자** ·
`plus_sign` 반응식의 **+ 기호**(도형 사이에 놓인 큰 +) ·
`grid_lines` 배경 점선 격자(공용) · `trajectory` 점선 궤적(공용)

### ⑥ 주석
`label_name` 이름표(A, B, X)(공용) · `label_qty` 물리량(공용) ·
`label_panel` 패널 이름((가))(공용) · `label_roman` 로마숫자(공용) ·
`label_unit` 단위(공용) · `label_partname` 한글 부품 이름표("피스톤","꼭지")(공용) ·
`label_caption` 상태 설명문("반응 전","물 x mL 추가")(공용) ·
`legend` 기호 범례 블록(공용) · `tick_label` 눈금 값(공용) ·
`axis_title` 축 이름(공용) ·
`label_formula` **화학식 라벨** — `CO_2(s)`, `A(g)`, `[HA]`. 물질을 가리키는 글자.
**화학에서 가장 흔한 주석이므로 `label_name` 과 반드시 구분한다** ·
`label_circled` **원문자 기호**(㉠㉡㉢, ①②③, ㄱㄴㄷ)

> **`label_formula` vs `label_name` 경계**: 화학식·상태기호가 붙으면 `label_formula`
> (`A(g)`, `NaOH(aq)`, `CO_2`). 가상 기호나 순수 이름이면 `label_name`(`X`, `Y`, `(가)`의 A).
> 애매하면 `label_formula`.

### 그래프 전용 (물리와 동일)
`plane` · `curve` · `line` · `point_marker` · `area_fill` · `axis_break`

---

## 2.5 층 배정표 (물리판 §2.5를 이걸로 대체)

| 키 | 들어가는 어휘 |
|---|---|
| `skeleton` | `plane` `ground` `frame_box` `table_grid` **`vessel`** **`flow_frame`** **`zoom_circle`** **`orbital_box`** |
| `zone` | **`liquid_zone`** **`gas_zone`** `area_fill` `region` `shade_band` |
| `object` | **`piston`** **`stopcock`** **`stopper`** **`atom_ball`** **`molecule_model`** **`shell_model`** **`lewis_dots`** **`crystal_cell`** **`ion_circle`** **`particle_dot`** **`bond_line`** **`bar`** **`pie_sector`** **`solid_chunk`** **`partition`** **`membrane`** **`weight`** **`fixing_device`** `flow_node` `curve` `line` `point_marker` `stand` `heat_source` `instrument` `illust` |
| `link` | **`tube`** `wire` `rod` `string` |
| `aux` | `guide_dash` **`arrow_process`** `arrow_motion` **`arrow_electron`** **`spin_arrow`** `dim_line` `leader_line` `angle_arc` `axis_tick` `axis_break` `ref_point` **`bracket_charge`** **`plus_sign`** `grid_lines` `trajectory` |
| `annot` | `label_name` `label_qty` `label_panel` `label_roman` `label_unit` `label_partname` `label_caption` `legend` `tick_label` `axis_title` **`label_formula`** **`label_circled`** |

---

## 3. blockers — 화학 전용 id 목록 (물리판 §3의 id 표에 추가)

`what` 은 반드시 아래 **짧은 영문 id** 중 하나로 적는다. 설명은 `note` 에.

| `type` | id | 무엇 |
|---|---|---|
| part | `glassware` | 유리 기구 — 비커·삼각플라스크·시험관·눈금실린더·깔때기. **어떤 것인지는 note 에** |
| part | `vessel_round` | 원형·구형 강철 용기(내부에 텍스트가 들어가는 그것) |
| part | `syringe_piston` | 실린더 + 피스톤 묶음(피스톤 높이가 변수) |
| part | `stopcock` | 꼭지·스톱콕 기호 |
| part | `atom_sphere` | 음영·하이라이트 있는 3D 원자 구슬 |
| part | `axis_break` | 축 생략 기호 ≈ (물리와 공용) |
| assembly | `shell_model` | 전자 껍질 — 핵 + 껍질별 전자 개수를 넣으면 각도 자동 배분 |
| assembly | `lewis_dots` | 루이스 전자점식 — 기호 둘레 8방향 점 쌍 자동 배치 |
| assembly | `crystal_lattice` | 결정 격자 — 투시 입방체 꼭짓점·면심에 구슬 자동 배치 |
| assembly | `molecule_geom` | 분자 모형 — 결합각(104.5°, 정사면체)을 넣으면 원자 위치 자동 계산 |
| assembly | `bond_multi` | 이중·삼중 결합의 평행선 간격 자동 |
| assembly | `vessel_content` | 용기 + 액면선 + 회색 채움 + 내부 텍스트 묶음 |
| assembly | `bar_chart` | 막대그래프 — 축 위 범주별 막대 자동 배치·간격 |
| assembly | `pie_sector` | 원그래프 — 분수·비율을 넣으면 부채꼴 각도 자동 배분 |
| assembly | `zoom_callout` | 확대 콜아웃 — 원본의 한 점에서 확대 원으로 뻗는 깔때기꼴 연결 |
| assembly | `leader_group` | 꺾인 지시선 묶음 (물리와 공용) |
| assembly | `dim_group` | 치수 표시 (물리와 공용 — **MCP `add_dimension` 으로 이미 완료됐다. blocker 로 적지 마라**) |
| layout | `data_table` | 표 (물리와 공용) |
| layout | `panel_flow` | 패널 여러 개를 화살표로 잇는 배치 |
| illustration | `person` `hand` `vehicle` `food` `photo` `note_paper` `speech_bubble` `lab_bench` `product_package` | 삽화 — 만들지 않는다 |

### ⚠️ 어휘 표류 방지 — 이미 정해진 이름을 다시 만들지 마라

배치 1~5에서 같은 물건이 서로 다른 `misc:` 이름으로 적히는 일이 실제로 일어났다
(`misc:bar` vs `misc:bar_column`, `misc:solid_pile` vs `misc:solid_chunk` vs
`misc:precipitate`, `misc:pie_chart` vs `misc:pie_sector`). 집계가 흩어지면
"이걸 만들면 몇 장이 사는가"를 못 센다. **아래가 정본이다.**

| 이렇게 적어라 | 이렇게 적지 마라 |
|---|---|
| `bar` (object) | ~~misc:bar_column~~ ~~misc:bar~~ |
| `pie_sector` (object) | ~~misc:pie_chart~~ ~~misc:sector_circle~~ |
| `solid_chunk` (object) | ~~misc:precipitate~~ ~~misc:solid_pile~~ ~~misc:solid_chunk~~ |
| `zoom_circle` (skeleton) | ~~misc:zoom_circle~~ |
| `stopper` (object) | ~~misc:stopper~~ |
| `orbital_box` (skeleton) + `spin_arrow` (aux) | ~~misc:orbital_box~~ ~~misc:spin_arrow~~ |
| `partition` (object) | ~~misc:partition~~ |
| `membrane` (object) | ~~misc:membrane~~ |
| `weight` (object) | ~~misc:weight~~ |
| `fixing_device` (object) | ~~misc:fixing_device~~ ~~instrument 로 흡수~~ |

셋 다 `misc:` 접두사 없이 정식 어휘가 됐다. blocker 로 적을 때도 위 §3 표의
`bar_chart` / `pie_sector` / `zoom_callout` id 를 쓴다.

---

## 4. JSONL 스키마 (물리판 §4와 동일. `subject` 만 c1/c2)

```json
{
  "file": "c2_2024_11_05.png",
  "year": 2024, "subject": "c2", "no": 5,
  "tags": [],
  "repro": "full",
  "blockers": [],
  "projection": "flat",
  "panels": [
    {
      "name": "(가)",
      "kind": "graph",
      "elements": {
        "skeleton": ["plane"],
        "zone": [],
        "object": ["curve"],
        "link": [],
        "aux": ["guide_dash", "axis_tick"],
        "annot": ["axis_title", "tick_label", "label_formula", "label_panel"]
      },
      "assets": [],
      "note": "증기압력-온도 곡선 2개, 곡선 끝에 X(l)·Y(l) 라벨"
    }
  ]
}
```

`assets` 에 쓸 값(화학): `beaker` `flask` `test_tube` `cylinder_graduated` `funnel`
`vessel_round` `piston` `stopcock` `burner`. 없으면 빈 배열.

---

## 5. 작업 절차

1. 물리판 `FIGURE_DECOMPOSE_SPEC.md` 를 읽고, 이 문서로 어휘를 덮어쓴다.
2. 배정받은 파일을 `Read` 로 하나씩 본다.
3. 장당 JSON 1줄을 `docs/figure-atlas-c.jsonl` 에 **append**. 기존 줄을 건드리지 않는다.
4. 처리한 파일명을 `docs/.atlas-done-c.txt` 에 append.

**하지 않을 것**
- 어휘에 없는 이름 만들기 → `misc:` 접두사
- 좌표·치수 측정
- **§0.5 에 있는 것을 blocker 로 적기** ← 가장 흔한 실수
