# mcp-5e 호출 규약 (CONVENTIONS)

> 설치는 `GUIDE_FOR_TEACHERS.md`(비개발자용) / `README.md`(개발자용).
> 이 문서는 **설치 후, Claude가 도구를 어떤 순서·문법으로 부르는가**를 정한다.
> 그리는 내용의 규칙(선·라벨·배치)은 `docs/FIGURE_DESIGN_PRINCIPLES.md`(바이블)가 정본이다.
> 작성 2026-07-31.

## 표준 호출 순서 (문법)

모든 그리기 작업은 이 여섯 단계를 따른다. 건너뛰어도 되는 단계는 표시해 뒀다.

```
① app_status                     연결 확인. 실패 안내문은 그대로 사용자에게 전달
② describe_schema (type 지정)     그 그림에 쓸 타입만. 21종 전체 나열은 첫 사용 때 한 번
③ set_page { page, create }      그림마다 페이지 하나. 기존 그림 위에 겹쳐 그리지 않는다
   set_artboard { w, h }          아트보드는 눈대중(바이블 §18) — 한 패널 90×60, 두 패널 150×50~60
④ add_objects / add_graph / add_circuit
                                  path 생략 = 열린 화면에 바로 (기본).
                                  한 그림을 여러 번에 나눠 넣지 말고 objects 배열로 한 번에
⑤ export_image                    눈 확인. 겹침·잘림·라벨 위치를 보고 고친다
⑥ remove_objects → ④ 반복         수정 루프. 목표 2회 이내(바이블 §8)
```

**저장은 사용자의 손으로.** 화면에 그린 결과가 마음에 들면 사용자가 `Ctrl+S`(프로젝트 저장)
한다. Claude가 파일을 덮어쓰지 않는다 — 들어온 변경은 전부 Ctrl+Z로 되돌릴 수 있는 상태를
유지한다.

## 페이지·이름 규약

- **그림 하나 = 페이지 하나.** `set_page`/`add_objects.page` 로 반드시 지정한다.
- 기출 재현 페이지 이름: `10번`, `17번` 처럼 문항 번호.
- 창작 페이지 이름: `창작1`, `창작2` ….
- 파일로 만들 때(`path` 지정)는 기존 파일을 덮지 않고 새 이름으로 (`…_v2.json`).

## 좌표·값 규약 (자주 틀리는 곳)

- 단위 **mm**, 원점 **아트보드 중앙**, +y **아래**.
- 선 굵기 0.35 / 그래프 계열 0.4 (바이블 §17). 점선은 §17의 명칭 표대로.
- 라벨은 주인 객체에 (`labelInner/labelOuter`, `label`) — 독립 `formula`/`text`는
  주인이 없는 글자뿐 (바이블 §1).

## 하지 말 것

- **브라우저 콘솔로 앱 내부 모듈을 직접 호출하지 않는다** (`import('/js/state.js')` 류).
  2026-07-31 세션에서 이 뒷길로 그렸는데, 이는 앱 개발자 환경에서만 가능하고
  undo 스택·그룹 상태를 앱과 다르게 만들 수 있다. MCP 도구로 안 되는 일을 만나면
  그 일을 **아래 '공백 목록'에 적고 도구를 보강**하는 게 옳다.
- `path` 모드로 열려 있는 파일을 직접 수정하지 않는다 (앱과 충돌).

## 알려진 공백 (도구 보강 목록)

2026-07-31 실작업에서 MCP만으로 안 돼서 뒷길을 쓰게 만든 것들.

| # | 공백 | 상태 |
|---|---|---|
| 1 | `add_graph` 가 **문자 눈금**(`tickTextX/Y`)·라벨 오프셋을 안 넘김 | ✅ **보강 완료** (2026-07-31) — `plane` 에 `tickTextX/Y`, `tickOffX/Y`, `labelXOffset/YOffset` 통과 |
| 2 | `add_graph` 에 **점 계열(꺾은선)** 이 없음 — `functions`(수식)만 | ✅ **보강 완료** (2026-07-31) — `series:[{points, curveStyle, dashLength…}]` 추가. 그래프 모달에서 "꺾은선 N점"으로 재편집됨 |
| 3 | **열린 화면을 파일로 저장**하는 도구가 없음 | 유지 — 저장은 사용자의 Ctrl+S (의도된 설계). 필요해지면 재논의 |

보강 후 문법 예 — v-t 계단 그래프가 순수 MCP 한 호출로 끝난다:

```
add_graph {
  at: {x: 40, y: 0},
  plane: { xMin:0, xMax:2.7, yMin:0, yMax:1.4, axisVariant:"quadrant",
           showGrid:false, showTicks:false, tickLabelMode:"text",
           tickTextX:["t_0","2t_0"], tickTextY:["v_0/3","","v_0"],
           labelX:"t", labelY:"A의 속도", richLabels:true,
           annGuides:[{x:1,y:0.333}], guideLines:[{x1:1,y1:1,x2:1,y2:0}] },
  series: [ { points:[[0,1],[1,1]] },
            { points:[[1,0.333],[2,0.333]] } ]
}
```

## 다른 사람에게 설치시키기 (요약)

`GUIDE_FOR_TEACHERS.md` 가 비개발자용 전체 안내다. 골자만:

1. **Node.js LTS 설치** (nodejs.org)
2. **5E 저장소 ZIP 다운로드** 후 압축 해제
3. `claude mcp add 5e -- node "<푼 경로>/tools/mcp-5e/server.js"`
4. 5E 를 `http://localhost` 또는 GitHub Pages 로 열고 **새로고침** → 왼쪽 아래 `MCP 연결됨` 배지 확인
5. Claude 에게 "지금 5E 화면에 ○○ 그려줘"

전제: Claude Code 를 쓸 수 있는 유료 구독. 5E 배포 페이지가 아니라 로컬 클론으로 열어도 된다.
