# 5E — 프로젝트 지침 (Claude 자동 참조)

> 루트 `project/CLAUDE.md`(사용자 대원칙)를 먼저 따르고, 이 문서는 **5E 저장소 안에서만** 추가로 적용한다.
> 최종 갱신: 2026-07-18

## 무엇인가

과학 교사가 **시험지에 넣을 그림**을 만드는 웹 앱. 바닐라 JS + SVG, 빌드 없음.
GitHub Pages 배포(`main` 브랜치 기준), 저장소 `seungyeon980808-pixel/5E`.

## 지금 상태

- 코드 버전 **v1.0.2** — 마지막 GitHub Release도 v1.0.2
- **버전 범프는 릴리즈 시점에만.** 커밋을 쌓다가 묶어서 v1.0.3으로 올린다.
  임의로 올리지 않는다(UI 푸터 문자열 + `?v=` 캐시버스트 281곳이 한 값으로 묶여 있다).
- 워크트리 8개가 동시에 존재한다 → **`docs/BRANCH_MAP.md`를 먼저 볼 것.**

## 작업 전에 반드시

1. **어느 폴더인지 확인한다.** 워크트리가 8개고 포트가 겹치는 곳이 있다(`docs/BRANCH_MAP.md`).
2. **`git status`로 미커밋 상태를 본다.** 폴더마다 무관한 WIP가 떠 있는 경우가 있다.
3. **수정 후 캐시를 의심한다.** 모든 모듈이 `?v=1.0.2`로 로드된다 —
   버전을 안 올리면 브라우저가 옛 파일을 계속 쓴다. 검증은 하드리프레시(Ctrl+F5) 또는
   포트를 바꿔서(=origin이 달라져 캐시 무효) 한다. **캐시 때문에 버전을 올리지는 않는다.**

## 문서 지도 — 무엇을 할 때 무엇을 읽나

| 하려는 일 | 읽을 문서 |
|---|---|
| 폴더·브랜치·포트 확인 | `docs/BRANCH_MAP.md` ← **항상 먼저** |
| 구조·스키마·좌표계 결정 확인 | `DESIGN.md` 1~12장 |
| **UI 배치·컨트롤 선택** | `DESIGN.md` **13장 (UI 조립 원칙)** |
| 기능이 어떻게 동작하는지 | `docs/USER_GUIDE.md` (2260줄, 전 기능 8개 장) |
| UI 개편 방향 검토 | `docs/DESIGN_PROPOSALS_20260710.md` (5개 제안 + 종합 추천) |
| 다음에 뭘 만들지 | `docs/FEATURE_PROPOSALS_20260710.md` (로드맵 20선) |
| 알려진 결함 확인 | `docs/BUG_AUDIT_20260710.md` (47건) |
| 객체 데이터 구조 | `docs/OBJECT_SCHEMA.md` |
| 브랜치 병합 | `docs/MERGE_PLAYBOOK.md` |

- `docs/`의 **날짜가 박힌 문서는 그 시점 스냅샷**이다. 현재 상태로 믿지 말고 작성일을 확인한다.
- 위 4개 조사 문서(USER_GUIDE / DESIGN_PROPOSALS / FEATURE_PROPOSALS / BUG_AUDIT)의
  기준 버전은 **v0.54.14**다. 이후 변경분은 따로 확인해야 한다.

## 코드 지형

```
index.html          단일 진입점. 모든 모듈을 ?v=로 로드
js/state.js         상태 + 상수(DEFAULT_TEXT_SIZE_MM, ptToMm 등)
js/render/          그리기: shapes·labels·coordplane·scene·annotations…
js/inspector/       우측 패널: section-*.js 로 타입별 분리, context.js가 공용 위젯
js/graph/           그래프 만들기 모달(좌표 탭 + 함수 탭)
js/function-graph/  함수 파서·샘플러·모달
js/project-io.js    저장/열기 + 마이그레이션(구파일 호환 백필이 여기 다 있음)
js/pages.js         다중 페이지(아트보드) 하단 탭
```

## 자주 하는 실수

- **버전 올리기**: 사용자 지시 없이 올리지 않는다. 다음 patch 번호는 **마지막 GitHub Release 기준**으로 센다.
- **파일째 충돌 해소**: 3-way 병합에서 `git checkout --ours -- <file>`은 git이 이미 auto-merge 해둔
  반대편 내용까지 날린다. 충돌 마커 블록 단위로만 해소한다.
- **`.bat` 인코딩**: ASCII + CRLF. UTF-8/LF이면 한국어 Windows cmd가 깨진다.
- **id를 바꾸며 UI 개편**: 마크업을 재배치할 때 `id`를 유지하면 이벤트 배선을 안 건드려도 된다(13장).
- **스크린샷 도구**: 이 환경에서 브라우저 스크린샷은 타임아웃된다. `javascript_tool`로 DOM·계산값을
  읽어 검증하고, 필요하면 결과를 위젯으로 렌더해 보여준다.

## 검증 습관

문법 검사(`node --check`)만으로 끝내지 않는다. 서버를 띄우고 실제로 열어
**원래 기능(만들기·저장·재편집)까지** 동작하는지 확인한 뒤 보고한다.
