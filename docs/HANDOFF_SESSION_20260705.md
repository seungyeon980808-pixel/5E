# 세션 인수인계서 (2026-07-05) — 이미지 객체화 + 캔버스 자르기 도구

> 대상: 다음 Claude Code 세션. 이 문서 하나로 현재 상태·규칙·다음 할 일을 파악할 수 있다.
> **먼저 읽을 것**: ① 이 문서 → ② `docs/BRANCH_MAP.md`(브랜치 규칙, 위반 금지) → ③ 필요 시 아래 파일별 안내.

---

## 0. 한눈에 보는 현재 상태

**두 폴더 = 두 브랜치 = 두 작업 라인** (git worktree, `docs/BRANCH_MAP.md` 참조):

| 폴더 | 브랜치 | 포트 | 이 세션에서 한 일 | HEAD |
|---|---|---|---|---|
| `5E_image_dev` | `image-dev` | 8002 | 이미지 객체화(모달) 품질·전처리 | `332a8fd` |
| `5E_work_dev` | `work-dev` | 8000 | 캔버스 드래그선택 수정 + 자르기 도구 | `bc62b72` (자르기 관련) |

⚠ **work-dev에는 병렬 세션이 좌표평면·함수그래프(§10) 작업 중** — `6f61417`, `6a4173c`, `f8eae3b` 커밋은 이 세션 것이 아님. 그쪽 파일(funcgraph/coordplane 관련)은 건드리지 말 것.

---

## 1. image-dev (이미지 객체화 모달) — 완료 상태

기획서(레포 밖): `C:\Users\user\Desktop\Fable\그림추출(v4.0)\5E_인수인계서_v2.md`
품질 계획: `docs/IMAGE_OBJECTIFY_QUALITY_PLAN_20260704.md`

| 커밋 | 내용 |
|---|---|
| `b73c066` | §2-1 회색 다단계 임계화 · §2-2 원/링→ellipse · §2-3 코너 보존 스무딩 |
| `e431e40` | §2-4 글자 원본 크롭 이미지 모드(기본값) |
| `e0a7a60`→**`88ed32c` 되돌림** | §2-5 획 파이프라인 — 실사진에서 화살촉 소실·회색바 검정화·글자 왜곡으로 **되돌림 확정**. 사용자 결정: "완벽 재현 안 되면 의미 없다". 재도전 시 e0a7a60 참조(Guo-Hall 세선화 교훈 포함) |
| `206d0b6` | ✂ 분리(자르기) 브러시 + 삽입 시 그룹 해제 |
| `4fe5b8a` | 한글 삐침 버그 수정 — §2-3 `lineIntersect` 발산 가드(교점이 원시 코너서 4px 초과 이탈 시 폐기) |
| `2bf8a2f` | 전처리 모달 대형화(94vw×92vh 2단) + 휠줌/팬 + 🔗 묶기 브러시(묶음별 groupId 삽입) |
| `332a8fd` | 안내창(dropzone)을 미리보기 오버레이로 통합 |

**작업 파일**: `js/image-vectorize.js`(순수 알고리즘, Node 테스트 가능) + `js/image-objectify.js`(모달 UI).
**회귀 테스트**: `tests/` (`node tests/test-ellipse.mjs` 등 — ellipse 21·smooth 19·cut 4·spike ✅ 전부 통과 상태).

### image-dev 절대 규칙 (BRANCH_MAP)
- `?v=` 버전 범프 금지 (work-dev 전용). 테스트는 **Ctrl+F5**.
- **수정 금지**: `js/tools.js`, `js/inspector.js`, `js/render.js`, `js/render/*`, `js/inspector/*`
- 수정 허용: `image-vectorize.js` / `image-objectify.js` / 신규 파일 / index.html 최소한.

---

## 2. work-dev (캔버스) — 이 세션의 커밋

| 커밋 | 내용 |
|---|---|
| `6215503` | **마퀴(드래그) 선택을 기하 기반으로** — `js/pick.js`의 `marqueeHitsObject`. 열린 line/polyline/curve는 실제 획 선분↔선택사각 교차로 판정(경사면 bbox 오선택 버그 해결, 클릭과 일관) |
| `71693df` | **삽입 후 자르기 도구** — 가위/칼/올가미 탭. 신규 `js/cut-geometry.js`(순수 분할수학) + `js/cut-tool.js`(UI). `activeTool="CUT"`일 때만 동작 → tools.js 무수정(기존 핸들러가 V/도형 게이트라 no-op). 툴바 `data-tool="CUT"` 버튼 + main.js init |
| `fd741ee` | 자르기 패널 숨김 버그(`#id{display:flex}`가 `[hidden]` 무력화 — `#id[hidden]{display:none}`로 해결) + 위치 조정 |
| `bc62b72` | 자르기 강화 — 원/상자/삼각형 자르기(다각형화, 조각=닫힌 polyline), 칼 Ctrl 각도스냅(snapLineEnd 재사용), 커스텀 커서 정지 2상태(가위 근접 시 닫힘·칼 드래그 시 칼날), 자르기 중 전체 bbox 표시 |

**회귀 테스트**: `tests/test-cutgeom.mjs` (25케이스 통과 상태).
**미결 결정**: 오목 복잡 닫힌 도형(직선이 4+교차)의 칼 자르기는 미구현 — **올가미로 커버**하기로 사용자와 합의.

---

## 3. 다음 할 일 후보 (우선순위 제안)

1. **사용자 실사용 피드백 대기** — 자르기 도구(커서·감도·스냅각)와 전처리(브러시 감각) 다듬기.
2. **브랜치 병합 검토** — BRANCH_MAP 규칙상 image-dev 수명 최대 2일인데 이미 초과. work-dev(병렬 §10 세션 포함)와 병합 시점을 사용자와 협의. 병합은 work-dev 쪽에서.
3. image-dev §9 남은 단계: 그림 라이브러리(인덱스 JSON+검색+lazy 삽입), 일괄 태깅, 심볼 저장.
4. (보류) §2-5 획 파이프라인 재도전 — 화살촉 감지·글자 런 클러스터링을 갖춘 뒤에만.

---

## 4. 세션 노하우 (다음 세션이 반복하지 말 것)

- **CSS 주입 함정 2회 반복**: `#id{display:flex}` 주입 시 `[hidden]`이 무력화됨 → 반드시 `#id[hidden]{display:none}` 동반.
- **E2E 검증**: 교사님 서버(8000/8002)는 절대 죽이지 말고 launch.json에 임시 포트(8092~8094, `--directory` 옵션) 추가 → 검증 → 원복. 헤드리스에서 rAF 미발동(setTimeout 사용)·뷰포트 0×0(preview_resize 1280×800 선행) 주의.
- **알고리즘은 Node 먼저**: `image-vectorize.js`·`cut-geometry.js`는 import 없는 순수 모듈 — 합성 이미지 테스트로 회귀 검증 후 브라우저 확인(계획서 §5).
- 커밋 메시지에 검증 결과 명시하는 패턴 유지.

---

## 5. 다음 세션이 읽을 파일 (순서대로)

1. **이 문서** (`5E_image_dev/docs/HANDOFF_SESSION_20260705.md`)
2. `5E_image_dev/docs/BRANCH_MAP.md` — 폴더·브랜치·수정금지 규칙 (필수)
3. 작업이 **이미지 객체화**면: `docs/IMAGE_OBJECTIFY_QUALITY_PLAN_20260704.md` + `js/image-objectify.js`(UI 구조) / `js/image-vectorize.js`(섹션 헤더만 훑기 — 1300줄, 전체 읽기 금지)
4. 작업이 **캔버스 자르기/선택**이면: `5E_work_dev/js/cut-tool.js` + `js/cut-geometry.js` (+ `js/pick.js`의 `marqueeHitsObject` 부근만)
5. 자동 메모리(`image-objectify-handoff.md`)가 세션 시작 시 로드됨 — 이 문서와 중복이니 이 문서가 우선.
