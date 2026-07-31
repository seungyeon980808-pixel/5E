# 인수인계 — 화학 기출 도판 분해 완료, 다음은 부품 제작 (2026-07-31)

## 무엇을 했나

화학 기출 도판 **280장(c1 120 + c2 160, 2023~2027)을 전부 분해**해서
"5E가 화학에서 무엇을 못 그리는가"를 숫자로 확정했다.

| 산출물 | 무엇 |
|---|---|
| `docs/FIGURE_DECOMPOSE_SPEC_CHEM.md` | **화학 어휘 부록.** 물리판 규격의 §2 어휘·§2.5 층배정·§3 blocker id 를 덮어쓴다 |
| `docs/figure-atlas-c.jsonl` | 280장 분해 데이터 (1장 = 1줄) |
| `docs/PART_FREQUENCY_CHEM.md` | 부품 대기열 + 요소 동시출현표 (자동 생성) |
| `docs/atlas-parts-c/batch-01~28.jsonl` | 배치 원본 |
| `tools/atlas-merge.py` | **과목 인자 추가.** 물리는 `python tools/atlas-merge.py`, 화학은 `... chem` |

## 결과

| | 장수 | 비율 |
|---|---:|---:|
| 완벽 재현 (지금 상태로 가능) | 76 | 27% |
| 일부만 | 190 | 68% |
| 재현 불가 (삽화) | 14 | 5% |

**천장은 235장(84%)** — 물리(79%)보다 높다. 화학은 삽화 비중이 낮기 때문이다.

패널 종류: scene 288 · **graph 117** · diagram 52 · illustration 27 · table 6

## 핵심 발견 — 대기열 1~5위가 전부 **한 가족**이다

| 장수 | id | 무엇 |
|---:|---|---|
| 62 | `vessel_content` | 용기 + 액면선 + 회색 채움 + 내부 텍스트 묶음 |
| 55 | `syringe_piston` | 실린더 + 높이가 변수인 피스톤 띠 |
| 41 | `vessel_round` | 안에 텍스트가 들어가는 원형·구형 강철 용기 |
| 37 | `glassware` | 비커·삼각플라스크·시험관·눈금실린더·깔때기·U자관·뷰렛 |
| 22 | `stopcock` | 꼭지·밸브 |

겹치는 장이 많아 **따로 세면 안 된다.** 실제로 계산하면:

```
용기 계열(위 5개 + stopper·membrane·partition·electrode·salt_bridge 등)
  → 걸린 도판 120장
  → 이 계열만 만들면 그중 93장이 그대로 full 로 올라간다
  → 완벽 재현 76장(27%) → 169장(60%)
```

**부품 하나가 아니라 "용기 가족" 하나를 만들면 재현율이 27%에서 60%로 뛴다.**
물리에서 `dim_group` 하나가 89장을 살린 것과 같은 구조이고, 규모는 더 크다.

나머지 두 묶음은 그 다음이다.

| 계열 | 포함 | 걸린 장 | 이것만 만들면 full 로 |
|---|---|---:|---:|
| 입자·모형 | `atom_sphere` `shell_model` `crystal_lattice` `molecule_geom` `lewis_dots` `bond_multi` `orbital_box` | 38 | 33 |
| 차트·표 | `bar_chart` `pie_sector` `axis_break` `data_table` | 35 | 29 |

구성 문제로 남는 것: `panel_flow` 22장(패널을 화살표로 잇는 배치), `data_table` 6장.

## 다음에 할 일 — 제안

### 1순위: 용기 가족 (93장)

낱개 부품 5개를 따로 만들지 말고 **`vessel` 타입 하나 + kind 로 갈래**를 두는 것을 제안한다.
물리의 `apparatus`/`optics` 가 `kind` 로 여러 기구를 담는 것과 같은 방식이고,
`js/object-types.js` 에 행 하나만 추가하면 MCP 에도 자동 노출된다.

```
vessel  kind: beaker | flask | test_tube | cylinder_graduated | funnel
              | u_tube | burette | round(원형 강철용기) | box(사각 용기)
        옵션:  liquidLevel(0~1, 액면 높이 → 회색 채움 자동)
              pistonAt(0~1, 있으면 피스톤 띠 + 고정장치)
              stopcock(꼭지 위치), innerText(내부 여러 줄 텍스트)
```

이 한 타입이 `vessel_content` + `syringe_piston` + `vessel_round` + `glassware`
+ `stopcock` 을 전부 덮는다. 액면·피스톤이 **파라미터**라서 "물 높이를 바꾸면
전부 다시 그린다"는 문제가 사라지는 것이 핵심이다.

만든 뒤 `vessel_content` 가 blocker 인 도판 3장을 MCP 로 재현해 수정 횟수를 잰다(목표 2회 이내).

### 2순위: 입자·모형 가족 (33장)

`atom_sphere`(음영 있는 3D 구슬)가 이 가족의 기반이다. 이것 없이는
`shell_model`·`crystal_lattice`·`molecule_geom` 이 다 반쪽이 된다. 구슬 먼저.

### 3순위: 차트·표 (29장)

`bar_chart`(17장)와 `axis_break`(11장)는 **물리 대기열에도 있다**(`axis_break` 7장,
`data_table` 10장). 만들면 두 과목이 같이 산다 — 과목 전용 부품보다 우선순위를 높게 볼 근거다.

### 팔레트·과목 UI

`js/templates.js` 의 category 는 아직 물리 5종(공통·역학·회로·전자기학·광학)뿐이다.
화학 부품을 만들면 카테고리를 추가하고 `js/subject-objects.js` 의 화학 파트
"준비 중입니다" 플레이스홀더를 실제 부품에 연결해야 한다.

## ⚠️ 판독 품질에 대해 알아둘 것

**오진 방지는 잘 작동했다.** 물리에서 오진 274건을 낸 원인(그래프 모달 기능 누락)을
규격 §0.5 에 화학판으로 다시 적어 넣었고, 28개 배치가 전부 "수선의 발·곡선 라벨·
범례·치수선·순서도 상자를 blocker 로 적지 않았다"고 보고했다. 화학은 graph 패널이
117개나 되므로 이 방어가 없었으면 피해가 물리보다 컸을 것이다.

**어휘 표류는 있었다.** 배치별 서브에이전트가 같은 물건을 다른 이름으로 적는 일이
반복됐다(막대를 `misc:bar`/`misc:bar_column`, 전극을 세 배치가 각각 `misc:electrode` 신설).
대응은 두 가지로 했다:
1. 도중에 발견될 때마다 규격 §2 에 정식 편입하고 §3 끝에 **"어휘 표류 방지" 표**를 넣었다
2. `tools/atlas-merge.py` 의 `CANON`/`PROMOTED` 로 **집계 단계에서 정본으로 합친다**
   (화학에만 적용. 물리 483장은 건드리지 않는다 — 회귀 검증 완료)

**남은 불확실 1건**: 배치 24가 "원형 용기 안 텍스트"를 `rect+text 조합으로 되니 full"
로 판정한 반면 다른 배치들은 `vessel_round` blocker 로 적었다. 41장짜리 항목이므로
용기 타입을 만들 때 이 경계를 한 번 확인하는 게 좋다.

**JSONL 문법 오류 8줄**: 배치 15(1줄)·21(7줄)에서 `panels` 배열의 닫는 `]` 가 빠졌다.
기계적으로 복구했고(복구 후 필수 키·구조 검증 통과), 최종 280줄 전부 유효하다.

## 다시 만들기

```
python tools/atlas-merge.py chem     # 화학 집계
python tools/atlas-merge.py          # 물리 집계 (기존 그대로)
```
