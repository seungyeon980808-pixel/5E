# 인수인계 — 기출 도판 분석 완료, 다음은 부품 제작 (2026-07-31)

## 무엇을 했나

물리 기출 도판 **483장(2023~2027)을 전부 분해**해서 "5E가 무엇을 못 그리는가"를
숫자로 확정했다. 결과는 `docs/PART_FREQUENCY.md`, 원본은 `docs/figure-atlas.jsonl`.

| | 장수 | 비율 |
|---|---:|---:|
| 완벽 재현 (지금 상태로 가능) | 208 | 43% |
| 일부만 | 239 | 49% |
| 재현 불가 (삽화·사진) | 36 | 7% |

**천장은 382장(79%).** 나머지 21%는 사람·차량·사진이 든 문항이라 5E 대상이 아니다.

## 다음에 할 일 — 순서대로

### 1순위: `dim_group` (치수 표시) 조립체 — ✅ **완료 (2026-07-31)**

MCP `add_dimension` + `lib/builders.js` 의 `buildDimension` 으로 들어갔다.
직선 도구(`lineMode:"lengthArrow"`)의 확장이며 새 객체 타입은 만들지 않았다.
연속 치수는 `dims` 배열 — 공유 기준점의 연장선이 자동으로 합쳐진다.
검증: `p2_2023_11_15`(연속 치수 5칸)·`p2_2023_06_17`(빗면 평행 L·3L)·`p1_2023_09_16`(d, bothBars)
재현 — 수정 **1회 · 1회 · 0회**. 규약은 `tools/mcp-5e/CONVENTIONS.md`.
**서버 코드를 고쳤으므로 Claude Code 재시작 후에 도구가 보인다.**

<details><summary>원래 계획(참고용)</summary>

#### `dim_group` (치수 표시) 조립체 — **89장을 단독으로 살린다**

압도적 1순위다. 2위(트랜지스터 9장)의 10배.

**무엇이 없나 (정확히)**: 치수선 본체는 이미 완성돼 있다 —
`line` 의 `lineMode:"lengthArrow"` 가 **양끝 화살촉 + 끝 캡(`dimensionVariant`) +
가운데 라벨(`dimensionLabel`)** 을 한 객체로 그린다.
없는 것은 **두 기준점에서 뻗는 점선 연장선을 자동 정렬해주는 것**뿐이다.
지금은 `line` 2개를 손으로 맞춘다.

**만들 것**: MCP 도구 하나 + 내부 빌더.

```
add_dimension(from:{x,y}, to:{x,y}, label:"4h",
              direction:"vertical"|"horizontal",
              extend: 12,              // 연장선 길이(mm)
              labelPos:"left"|"right"|"above"|"below",
              caps:"bothBars")         // dimensionVariant 그대로
```

→ 점선 연장선 2개(`line`, dash) + 치수선 1개(`lineMode:"lengthArrow"`) 를 계산해서 넣는다.
`tools/mcp-5e/lib/builders.js` 의 `buildCircuitLoop`·`buildGraph` 가 같은 패턴이니 그걸 따른다.

**검증**: 만든 뒤 `dim_group` 이 blocker 인 도판 3장을 실제로 재현해
수정 횟수를 잰다. 목표는 2회 이내(지금 3~4회).

</details>

### 2순위 — ✅ **완료 (2026-07-31)**

| 항목 | 무엇으로 | 어디에 |
|---|---|---|
| `transistor` 11장 | 실험 기구 `kind:"transistor"` (npn/pnp/원 두르기) | `js/render/optics-apparatus.js` |
| `axis_break` 7장 | 실험 기구 `kind:"axis_break"` — **두 빗금 사이가 뒤를 가린다** | 같은 파일 |
| `leader_group` 12장 | `labeler` 에 꺾임점 `elbow` 추가 | `js/render/annotations.js` |
| `rig_attach` 13장 | MCP `add_stand_rig` (스탠드 가로대 s·레일 위 운반대) | `tools/mcp-5e/lib/rig.js` |
| `diagonal_wiring` 5장 | **오진이었다** — 소자는 원래 사선에 놓인다. `add_circuit` 에 `wires` 입력만 추가 | `tools/mcp-5e/lib/builders.js` |
| 삽화(손 12장 등) | **그리지 않는다** — 기출 PDF 600dpi에서 오려 `add_part` | `docs/PARTS_PIPELINE.md` |
| `data_table` 10장 | **분모에서 제외** — 표는 5E가 목표하는 객체가 아니다(교사 결정) | — |

재현율(표 10장 제외, 분모 473): **43% → 64%**(치수+사선) → 부품 4종으로 **69%**,
삽화를 다 오리면 **95%** 가 천장이다.

<details><summary>원래 계획(참고용)</summary>

#### 나머지 부품 (합쳐도 100장 미만)

| 장수 | id | 종류 |
|---:|---|---|
| 13 | `rig_attach` | 묶음 — 레일 위 운반대, 벽 충격기 부착 |
| 12 | `leader_group` | 묶음 — **꺾인 지시선**. `labeler` 는 직선만 지원 |
| 11 | `transistor` | 낱개 — `circuit.element` enum 에 추가 |
| 10 | `data_table` | 구성 — 표 |
| 8 | `power_supply` | 낱개 — 전원 장치 상자 |
| 7 | `axis_break` | 낱개 — 축 생략 기호 ≈ |

</details>

### 3순위: 조립체 기본값 — 일부 완료

`add_incline_scene` 에 적용했다: 이름 없는 블록에 A·B·C 자동(`autoName`, 기출 90%),
패널 이름 `(가)`·`(나)`(`panel`, 기출 52%). 범용 `add_scene`(빗면이 아닌 장면)은 남아 있다.

#### (원래 계획)

`PART_FREQUENCY.md` 의 "요소 동시출현" 표를 근거로 `add_scene` 기본값을 정한다.
장면 패널 416개 기준 — 이름표 90%, 물리량 68%, 한글 부품명 53%, 점선 기준선 42%.
**80% 이상이면 기본값 ON**, 30~80%는 파라미터.

이게 "빗면에 상자" 한마디로 그림이 나오게 하는 단계다.

## ⚠️ 반드시 지킬 것 — 이번에 크게 데인 지점

**"5E에 이 부품이 없다"고 판단하기 전에 반드시 세 곳을 다 본다.**

1. `describe_schema` 의 객체 타입 28종 — **`kind`/`element` 값까지**
   (`solid3d.wedge`=입체 빗면, `circuit.inductor`=코일, `optics.point_light`=점광원 …)
2. **그래프 만들기 모달**(`js/graph/graph-modal.js`) — 수선의 발 · 가이드라인 ·
   범례 · 화살표(곡선 접선) · 표시점
3. 렌더 코드(`js/render/*.js`) — 옵션이 주석에만 적힌 경우가 있다

이번에 **오진 274건**이 나왔다. 원인은 판독 담당에게 준 "5E가 가진 것" 목록에
**모달 기능이 통째로 빠져 있었던 것**. 그래프 점선 격자·범례·곡선 중간 화살촉을
전부 "없다"고 판정했는데 셋 다 모달에 있었다. 오진만 걷어내니 완벽 재현이
26% → 43% 로 올랐다 — **아무것도 만들지 않고**.

규격 문서 `FIGURE_DECOMPOSE_SPEC.md` §0.5 에 이 표들이 다 들어 있다. 그걸 먼저 읽어라.

## 이번에 만든 것

| 파일 | 무엇 |
|---|---|
| `docs/FIGURE_DECOMPOSE_SPEC.md` | 판독 규격. §0.5(5E가 가진 것) 가 핵심 |
| `docs/figure-atlas.jsonl` | 483장 분해 데이터 (1장=1줄) |
| `docs/PART_FREQUENCY.md` | 부품 대기열 + 요소 동시출현표 (자동 생성) |
| `docs/atlas-report.html` | 원본 도판 옆에 분해 결과를 나란히 보는 리포트 |
| `tools/atlas-merge.py` | 배치 합치기 + 집계 생성 |
| `tools/atlas-report.py` | 리포트 생성 |
| `tools/mcp-5e/lib/images.js` | **MCP 이미지 삽입** — `srcPath` 로 파일을 넣으면 data URI 로 내장 |

### MCP `image` 지원 (이번에 뚫음)

삽화는 만들지 않고 **원본에서 잘라 얹는다**. 이제 MCP 로 된다:

```
add_objects([{ type:"image", x:10, y:10, srcPath:"C:\\...\\crop.png" }])
```

`w`/`h` 생략 시 원본 비율로 채운다(기본 폭 60mm). 크롭은 미리 잘라서 경로를 준다.
**서버 코드를 고쳤으므로 Claude Code 재시작이 필요하다.**

## 서버·확인

```
python tools/atlas-report.py      # 리포트 다시 만들기
python tools/atlas-merge.py       # 집계 다시 만들기
```
리포트는 `.claude/launch.json` 의 `atlas-report`(포트 8310)로 띄운다.
