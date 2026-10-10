# 4개 세션 통합을 위한 자동 라벨러 세션 인계

이 파일을 읽는 AI에게 전달하는 작업 지시다. 이전 대화가 없는 빈 세션을 기준으로 작성했다.

## 1. 지금 해야 할 일과 통합 범위

사용자는 4개 세션의 결과를 한 통합 세션에 하나씩 전달한 뒤 합치려 한다. 이 파일은 그중 **자동 라벨러 세션 한 건**이다. 나머지 세 세션의 이름·브랜치·파일 범위·병합 순서는 이 파일에서 추정하지 않는다.

이 인계를 받으면 아래 실제 파일과 Git 상태를 읽고, 수신한 세션 목록에 `자동 라벨러`를 등록하라. 변경 범위·겹치는 파일·검증·누락 위험을 요약하라. 다른 세션 자료가 들어올 때까지 이미 등록한 내용을 유지하고, 네 세션의 인계를 모두 받기 전에 임의로 한 세션을 먼저 합치지 마라. 네 세션이 모두 도착하면 공통 파일의 변경을 비교하여 통합 순서를 정하라. 병합 대상은 사용자가 지정한 실제 브랜치를 사용하라. 대상이 아직 정해지지 않았다면 충돌 지도와 통합 계획을 먼저 만든 뒤 대상만 확인하라.

실행 단계에서는 아래 확정된 커밋을 기준으로 통합 브랜치에서 기능을 합쳐 회귀 검증까지 완료하라. 라벨러의 누적 변경은 이미 한글로 커밋했으므로 다시 모아 중복 커밋하지 마라. 다른 세션의 미커밋 상태는 각 인계와 실제 Git 상태로 확인하라. 현재 작업 폴더의 전체 파일을 통합 폴더에 덮어쓰는 방식으로 합치지 마라. Git 충돌이 없다는 사실만으로 통합 성공을 선언하지 마라. 푸시·원격 배포·출시와 다른 작업 트리 삭제는 이 인계의 범위에 포함하지 않는다.

## 2. 소스의 정확한 위치와 현재 상태

| 항목 | 값 |
| --- | --- |
| 실제 수정 작업 트리 | `/Users/parkseungyeon/.codex/worktrees/5e-170-auto-labeler/5E` |
| 소스 브랜치 | `feature/1.7.0/auto-labeler` |
| 최신 제품 변경 확정 커밋 | `996b7e20f0ffd9a1ac316b1862592bc8ab1be447` |
| 한글 커밋 제목 | `자동 라벨러 편집·복구 개선 및 이미지 생성 분리` |
| 제품 커밋 전 HEAD | `b673a856c83bd472041c677d141c4809a56e7a9d` |
| 현재 `develop/1.7.0`과의 공통 조상 | `845b5e4946cb0e8bc6ed4b560b383661fcdfbe3e` |
| 사용자 기본 폴더·공용 도구 위치 | `/Users/parkseungyeon/Documents/Codex/2026-09-06/x20/5E` |
| 로컬 수정본 | `http://127.0.0.1:8826/preview/?mode=pro&label-background=20261010` |

**2026-10-10 사용자의 커밋 지시에 따라 누적 변경을 `996b7e20`으로 확정했다.** tracked 변경 83개와 당시 untracked 실제 파일 77개를 합친 160개 경로가 포함된다. 앞서 작성했던 “최신 수정은 미커밋” 안내는 더 이상 현재 상태가 아니다. 이 인계와 한글 커밋 메시지 파일은 별도 문서 커밋으로 같은 브랜치에 보존한다. 문서까지 포함한 최종 HEAD는 아래 명령으로 확인하라. 기본 폴더는 별도의 보존 브랜치이므로 그것을 이 세션의 소스로 오인하지 마라.

```sh
git -C /Users/parkseungyeon/.codex/worktrees/5e-170-auto-labeler/5E log -6 --oneline
git -C /Users/parkseungyeon/.codex/worktrees/5e-170-auto-labeler/5E status --short
git -C /Users/parkseungyeon/.codex/worktrees/5e-170-auto-labeler/5E rev-parse HEAD
```

제품 커밋 `996b7e20`에 아래 최신 파일이 실제로 들어 있는지 확인하라: `preview/js/ai-label-background.js`, `ai-login-handoff.js`, `label-leader-geometry.js`, `tests/test-label-background-invariance-browser.cjs`.

제품 커밋의 앞에는 공통 조상 뒤의 다음 네 커밋이 있다. 대상 브랜치가 이 기반을 포함하는지 `merge-base`와 실제 이력으로 확인하라. `996b7e20`만 cherry-pick하면 아래 기반이 빠질 수 있으므로, 기본은 소스 브랜치의 전체 변경을 통합하되 다른 세션에 이미 들어 있는 공통 커밋을 중복 적용하지 않는 것이다.

- `098b74c5`: 원본 라벨 계획 고정과 편집 라벨 합성 검수.
- `99543d63`: 원본 소속 고정과 픽셀 보존 워크플로.
- `706f97dc`: 작업대·큐·복구 흐름 통합.
- `b673a856`: 당시 원본 추적·스타일 계약. **`996b7e20`에 RHWP 하네스 수정이 들어 있으므로 이 커밋의 과거 스타일을 최신 기준으로 되살리지 마라.**

커밋 전 상태와 각 파일의 SHA-256 목록(복구·대조용 과거 스냅샷):

`/Users/parkseungyeon/.codex/worktrees/5e-170-auto-labeler/5E/.omo/evidence/merge-handoff-20261010/working-tree-inventory.json`

같은 폴더의 `tracked-working-tree.patch`는 제품 커밋 전 `b673a856` 대비 tracked 변경이고, `untracked-source-files.tar.gz`는 당시 미추적 소스·검사·fixture 보존본이다. 이제 Git 커밋이 통합의 기준이므로 이 보존본을 커밋 위에 다시 적용하지 마라. 원본 작업 트리가 바뀌거나 이동했을 때 대조·복구하는 로컬 보존본이다. 제품 커밋 준비 때 한 검사 파일의 불필요한 마지막 빈 줄만 정리했다. `.omo/evidence`는 ignored이며 브랜치 병합만으로 다른 위치에 옮겨지지 않는다. 보고서를 먼저 읽고 필요한 증거를 로컬에서 보존하라.

## 3. 먼저 읽을 문서

작업 트리 안의 다음 문서를 읽고 실제 코드와 대조하라. 오래된 절의 상태·검사 수치는 당시 기록이며 최신 완료 선언으로 사용하지 마라.

1. `AGENTS.md` 및 사용자가 통합 세션에 직접 제공한 최신 지침.
2. `docs/DEVELOPMENT_WORKFLOW.md`, `docs/BRANCH_MAP.md`.
3. `docs/IMAGE_LABEL_WORKFLOW.md` — 최신 2026-10-10 및 2026-10-09 절을 우선한다.
4. `docs/FEATURE_HANDOFF_1_7_0.md` — 라벨러 누적 작업·한계·서버 연결 전제.
5. `DESIGN.md`, `docs/BOX_SCOPED_EDIT_BORDER.md`.
6. 본 파일과 `docs/handoffs/auto-labeler-commit-message-ko-20261010.txt`.

아래 보고서는 이 작업 트리 기준 상대 경로다. 파일이 존재하는지 확인하고 읽어라.

| 보고서 | 의미 |
| --- | --- |
| `.omo/evidence/label-background-invariance-20261010/REPORT.md` | 최신 배경 PNG 분리, 이번 변경만의 diff, 55/55·16/16 검사와 Safari 화면 |
| `.omo/evidence/rhwp-image-harness-alignment-20261009/REPORT.md` | RHWP 생성 요청·전처리·RAW 조건 및 돋움 글꼴 수정 |
| `.omo/evidence/ai-login-resume-20261009/REPORT.md` | 로그인 전 이미지·크롭 보존, 인증 후 작업대 복귀·창 전환 |
| `.omo/evidence/labeler-performance-20261009-01a11e92/FIX_REPORT.md` | 타이핑 지연 원인·수정 구간·WebKit 계측과 측정 한계 |
| `.omo/evidence/labeler-diagnosis-fix-20261008-session-1039/FINAL_REPORT.md` | 외주 진단 결과, 편집·저장 통과와 그림 품질 미완료의 구별 |

## 4. 이 세션에서 보존할 결과와 주요 코드

### A. 기존 5E 라벨러로 편집하는 경로

AI 분석 라벨을 이미지에 굽는 대신 기존 5E 객체로 만든다. 출력 이미지가 배경이며 선택금지 상태이고 라벨은 편집·이동·저장 가능해야 한다. 라벨 내용·배치는 사람이 다듬을 수 있으며 위치가 조금 다르다는 이유만으로 생성 자체를 막는 흐름으로 되돌리지 마라.

사용자가 최종 승인한 클릭 동작은 **첫 클릭: 객체 선택과 핸들 표시 → 선택된 글자를 다시 클릭: 화면 안에서 간단 문구 편집**이다. 첫 클릭 즉시 입력창이 뜨던 과거 동작을 복원하지 마라. 상세 글꼴·기호·수식 편집은 작은 아이콘과 보조 클릭(맥 두 손가락 클릭 포함)을 통해 진입한다. 저장된 기본 돋움 설정과 의미별 수식·첨자 서식을 유지한다.

관련 파일: `preview/js/text-editor.js`, `pick.js`, `tools.js`, `tools/click-placement.js`, `transform.js`, `label-leader-geometry.js`, `render/annotations.js`, `render/scene.js`, `inspector/section-line.js`, `inspector/section-text.js`, `image-paste.js`, `svg-export.js`.

지시선이 글자 이동을 따라 연결되어야 한다. 선택 표시와 실제 선 경로가 같아야 하고, 투명하게 보이는 선·중앙과 어긋난 글자 이동 핸들·과하게 넓은 입력 영역을 되살리지 마라. 두 점을 확정한 뒤 Enter/Space로 끝내면 불필요한 커서 미리보기 점이 추가되지 않아야 한다. 기존 수동 라벨러와 AI 라벨 모두 확인하라.

### B. 입력 지연 감소

`store.js`의 update 사유를 구독자에 전달하고, 간단 텍스트 초안 입력인 `native-text-input`에서만 장면·뷰포트·속성 패널의 불필요한 전체 갱신을 건너뛴다. 자동 저장·동기 상태 알림·실행 취소를 끈 최적화로 바꾸지 마라. 확정·취소·드래그·줌·페이지 변경·파일 로딩은 정상 갱신되어야 한다.

관련 파일: `preview/js/store.js`, `canvas-image-bounds.js`, `text-editor.js`, `render/scene.js`, `main.js`, `viewport.js`, `inspector.js`. 다른 세션의 렌더링·입력 성능 수정과 겹치면 구독자 계약과 갱신 사유를 함께 검증하라. 기록된 WebKit p95 159→45ms는 특정 자료의 당시 측정이며 새 통합본의 Safari 속도 보장이 아니다.

### C. 라벨 분석·제거·초안·검수 계약

관련 파일: `preview/js/ai-source-label-plan.js`, `ai-source-observation-wire.js`, `ai-source-label-candidates.js`, `ai-source-candidate-contract.js`, `ai-label-source-geometry.js`, `ai-exam-label-removal.js`, `ai-editable-image-labels.js`, `ai-label-composite.js`, `ai-label-target-placement.js`, `ai-label-placement-harness.js`, `ai-label-verification.js`, `ai-label-review-draft.js`, `ai-image-label-workflow.js`, `ai-image-label-run.js`, JSON Schema 모듈과 관련 desktop 검사.

원본 분석은 그림 생성과 별개이고 Luna medium을 유지한다. 교과서 본문·캡션·말풍선·장식과 실제 그림 라벨·과학 삽화·그래프 표기를 구분한다. 기존 5E 라벨러와 기본 3.7mm/돋움 서식을 최대한 활용하며 원본 bbox에 맞춰 글꼴·크기를 제멋대로 바꾸지 마라. 기출은 전체 그림을 재생성하지 않고 안전하게 확인한 라벨 단위의 픽셀만 처리한다. 불확실한 원문 제거를 성공으로 기록하거나 지우지 않은 원문 위에 중복 라벨을 얹지 마라. 검수 필요 초안의 편집 가능성과 전체 품질 승인은 별개다.

### D. RHWP 이미지 하네스와 라벨 옵션 분리

일반 그림 생성은 RHWP의 승인 프롬프트·동일 첨부 전처리·첫 RAW PNG 반환을 사용한다. 관찰 JSON의 스타일·윤곽 추적·기하 고정 지시가 그림 생성 요청에 섞여 다시 독자 스타일을 강요하지 않아야 한다. 라벨 생성 로직을 RHWP 방식으로 교체한 작업이 아니다.

관련 파일: `preview/js/ai-approved-first-png.js`, `ai-image-style-contract.js`, `ai-image-review.js`, `ai-image-label-run.js`, **`ai-label-background.js`**, `ai-panel.js`, `tests/fixtures/rhwp-approved-first-contract.json`.

현재 기준의 프롬프트 SHA-256은 `8d6180f311791d497469d93cbc0eff98919b0d376d84a958f2b391c475e14067`이고 실행 버전은 `1.6.1`이다. RHWP 참고 작업 트리는 `/Users/parkseungyeon/.codex/worktrees/rhwp-typing-performance/5E`다. 다른 세션이 더 최신 승인 하네스를 인계하면 실제 내용을 비교하고 기준을 명시하라.

같은 원본·실제 그림 내용 요청·전처리 첨부·모델/추론/속도에서는 첫 배경 PNG를 그대로 재사용한다. 라벨 복원·관찰 계획·라벨 검수 정책은 배경 식별에 포함하지 않는다. 작업 후보와 별도 IndexedDB `5e.preview:5e-ai-label-background`를 사용하며 전체 검수 캐시와 섞지 않는다. 재시도의 `bypassCache` 때문에 RAW를 다시 생성하게 만들지 마라. 그림 요청 변경은 별개의 생성이고 명시적 정밀 복원 첨부도 키에 반영한다. 과거 생성 출처를 확인할 수 없는 후보를 최신 결과로 자동 인정하지 마라.

### E. 라이브러리·로그인·창 전환·UI·빠른 캡처

로그인 전 라이브러리에서 보낸 이미지와 실제 크롭 바이트·출처·순서·묶음 및 전송 의도를 보존한다. 인증 성공 후 준비한 작업대로 복귀하며 로그인만으로 유료 생성을 시작하지 않는다. 취소·새로고침·중복 응답·일부 저장 실패·늦은 응답도 고려한다.

관련 파일: `preview/js/ai-login-handoff.js`, `modal-surface-motion.js`, `web-login-ui.js`, `unified-library-ui.js`, `pdf-library/pdf-library-ui.js`, `main.js`, `ai-panel.js`, `ai-task-workspaces.js`, `ai-workbench.js`와 해당 CSS. 창 전환은 중단/재열기와 reduced motion을 지원해야 한다. 인증 비밀을 인계·저장 데이터에 추가하지 마라.

공통 버튼의 선택·비활성·곡률을 기존 프로그램 스타일로 정리했다. 결과 확인은 실제 사용할 수 있을 때 활성화한다. 로그·연결·검수 정보는 상단 아이콘으로 열며 하단에 중복 모델/추론 선택을 되살리지 않는다. `graph/graph-modal.js`, `function-graph/` 등에도 버튼 토큰 정리를 위한 수정이 있으므로 다른 그래프 세션의 기능 구현과 파일 전체 덮어쓰기를 하지 마라.

빠른 캡처는 `preview/js/quick-capture.js`, `desktop/quick-capture.test.cjs`, `preview/index.html`, 공통 CSS와 desktop 연결을 포함한다. 오른쪽 아이콘이나 macOS Option+C(다른 플랫폼 Alt+C)로 시작해 드래그 영역을 PNG로 클립보드에 복사한다. 입력창·모달에서 단축키가 가로채지 않아야 하고 복사 실패 상태를 숨기지 않아야 한다.

### F. 박스 수정 및 실험 후보

`ai-scoped-edit-*`, `ai-scoped-edit-png.js`, `docs/BOX_SCOPED_EDIT_BORDER.md`, `tests/helpers/box-edit-png-fixture.mjs`와 관련 검사에 국소 수정·경계·검증 및 짧은 명세 실험이 있다. **짧은 명세 후보를 기본 방식으로 몰래 채택하지 마라.** 기본 기존 방식과 박스 밖 보존 규칙을 유지하고, 다른 이미지 세션의 박스 처리 변경과 비교하라. 기본 코드인지 실험 도구인지 inventory와 실제 호출 경로로 확인하라.

## 5. 충돌 해결의 기준

네 세션에서 변경한 파일 목록과 실제 공통 조상을 먼저 비교하고 파일/함수 단위 충돌 표를 작성하라. 특히 다음 파일은 공통 경계다.

- `preview/js/ai-panel.js`, `ai-task-workspaces.js`, `ai-workbench.js`: 생성·라벨·로그인·박스 수정·재사용·저장 흐름을 함께 보존.
- `preview/js/main.js`, `store.js`, `viewport.js`, `render/scene.js`, `text-editor.js`, `pick.js`, `tools.js`, `inspector.js`: 입력 성능·선택·편집·초기화 계약을 함께 보존.
- `preview/index.html`, `preview/css/style.css`, `ai-panel.css` 등: 다른 세션의 새 UI와 이 세션의 토큰/버튼/비활성/모션을 기능별로 합침.
- `tests/suite-manifest.json`: 네 세션의 항목을 누락 없이 합치고 중복·분류 누락 검사.
- `docs/FEATURE_HANDOFF_1_7_0.md`, `IMAGE_LABEL_WORKFLOW.md`, `DESIGN.md`: 최신 합의와 실제 구현을 유지하고 옛 완료 수치를 새 검증으로 쓰지 않음.
- `desktop/main.cjs`, `preview/experiments/web-codex-auth/editor-bridge.js`: 단축키·첨부 경계·턴별 상태 및 폴링 계약 보존.

`ours` 또는 `theirs`를 파일 전체에 적용하여 한쪽 기능을 없애지 마라. 합친 뒤 각 기능의 import·초기화·이벤트·스토어·저장 출처·검사 등록까지 확인하라. 특히 preview/와 루트 js/의 서로 다른 제품 진입점을 확인하라. 라벨러 변경은 주로 preview이며 참고용 RHWP 루트 파일을 무조건 덮어쓰지 않는다.

source 브랜치의 커밋 파일 목록과 실제 작업 트리를 확인하라. 인계 이후 후속 미커밋 변경이 생겼다면 이 확정 커밋의 범위와 구별하라. 모의 응답·실험 도구와 제품 기본 경로를 구별하라. 버전 관리 밖 증거·로컬 HTML·계정 정보는 제품 커밋/공개 사이트에 넣지 않는다. 이 세션과 다른 세션의 같은 변경을 두 번 cherry-pick하지 않도록 실제 커밋 관계와 패치를 확인하라.

## 6. 검증 기준과 실행

최신 이 세션 검사 기록은 관련 단위 **55/55**, 핵심 브라우저 **16/16**, 전체 단위 **742/743**다. 확장 브라우저는 **21/23**으로 두 기존 실패가 남아 있다. 이 수치를 통합본의 검사 결과로 복사하지 말고 실행 후 새로 집계하라.

알려진 실패:

- `tests/test-rights-clear-smoke-fixture.mjs`: Node 24 PNG 압축 바이트 재현성. 임의로 기준 PNG를 재생성하거나 테스트를 약화하여 숨기지 마라.
- `test-ai-image-label-workflow-browser.cjs`: 라벨 없는 기출에서 비활성 삽입을 누르는 옛 검사 및 현재 숨겨진 종전 전체 재변환/정밀 복원 UI 검사. 최신 작업의 `browser-baseline.log`에 수정 전 재현을 보존했다. 해결하거나 남은 사유를 보고하고 전체 통과라고 말하지 마라.

Node 요구 범위는 `>=24.21.0 <25`. 이번 실행 파일은 `/Users/parkseungyeon/.local/share/mise/installs/node/24.21.0/bin/node`다. Playwright는 설치된 패키지를 사용한다. 이 컴퓨터의 환경 경로는 아래와 같으며 제품 코드에는 하드코딩하지 마라. js-yaml 경로가 없어지면 설치/캐시 위치를 다시 확인하라.

```sh
export NODE_PATH=/Users/parkseungyeon/.npm/_npx/7750544ccf494d8b/node_modules:/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules
```

통합 워크트리에서 지원 Node로 `desktop/run-unit-tests.cjs`를 실행하라. 영향 받은 브라우저 검사는 새 `EVIDENCE_DIR`에서 수행하라. 우선 검사:

| 범위 | 검사 파일 |
| --- | --- |
| RAW 배경 분리 | `desktop/ai-label-background.test.cjs`, `tests/test-label-background-invariance-browser.cjs` |
| RHWP 생성과 글꼴 | `tests/test-rhwp-labeler-harness.mjs`, `tests/test-rhwp-labeler-harness-browser.cjs` |
| 원본·초안·기출 계약 | `desktop/ai-image-label-run.test.cjs`, `desktop/ai-image-label-run-drafts.test.cjs`, `tests/test-ai-image-label-workflow-browser.cjs`, `tests/test-ai-editable-drafts-browser.cjs` |
| 실제 라벨 선택·간단/상세 편집 | `tests/test-labeler-selection-edit-browser.cjs`, `tests/test-labeler-interactions-browser.cjs`, `tests/test-label-inline-bounds-browser.cjs`, `tests/test-labeler-attached-leaders-browser.cjs` |
| 로그인·라이브러리 복귀 | `tests/test-ai-login-handoff.mjs`, `tests/test-ai-login-resume-browser.cjs`, `tests/test-modal-surface-motion.mjs` |
| UI·캡처·박스 처리 | `desktop/quick-capture.test.cjs`, `tests/test-ai-settings-panel-browser.cjs`, `tests/test-preview-box-edit-border.mjs` 및 `tests/test-preview-box-edit-*` |

통합 후 다음 동작을 직접 검증하고 한글로 보고하라.

1. 같은 원본/내용 요청에서 라벨 켜기→끄기 및 끄기→켜기: 배경 PNG 전체 바이트와 SHA 동일, 추가 그림 생성 0회.
2. 새로고침·다른 작업·저장 복구 후 같은 배경 재사용. 내용/원본/그림 모델 변경은 새 요청으로 구별.
3. 캔버스 삽입 후 배경 선택금지, 라벨 선택·문구 수정·이동·상세 편집·실행 취소/다시 실행·저장 재열기. 배경과 다른 객체 보존.
4. IME 한글 조합·Enter/Escape·Space 이동과 연속 타이핑에서 불필요한 전체 SVG 재생성이 돌아오지 않음.
5. 로그인 전 라이브러리 크롭 → 인증 → 해당 이미지가 들어 있는 AI 작업대. 취소·새로고침·중복 가져오기와 reduced motion.
6. 기출 전체 생성 0회·허가된 마스크 밖 픽셀 동일. 일반 RAW 보존과 초안/품질 승인 구별.
7. 네 세션 각각의 검증 및 공통 코드와 연결된 실제 시나리오. Safari 로컬 서버 응답과 실제 화면 표시.

모델/인증 고정 응답으로 검증한 것과 실제 계정의 새 생성 성공을 구별하라. 최신 작업은 유료 호출 0회다. 이전 실제 그림의 심장 원문 잔존·현미경 캡션·물 밀도 의미 손상 등 품질 한계가 완전히 해결됐다고 선언하지 마라. 캔버스 편집 가능성이 이미지 품질 승인과 같은 뜻은 아니다.

## 7. 커밋 및 통합 완료 보고

`996b7e20`의 실제 한글 커밋 메시지는 `/Users/parkseungyeon/.codex/worktrees/5e-170-auto-labeler/5E/docs/handoffs/auto-labeler-commit-message-ko-20261010.txt`에 보존했다. 최신 배경 분리 8개 파일만 전체 세션의 변경으로 오인하지 마라. 제품 누적 변경 160개 경로와 별도 인계 문서 커밋까지 소스 브랜치에서 확인하라. 통합 중 추가 수정·병합 커밋의 메시지도 한글로 작성하라.

완료 보고에는 네 세션의 소스 브랜치/최종 커밋, 통합 대상/최종 커밋, 충돌 해결한 파일과 선택한 동작, 새 검증 통과/실패 수와 증거, 남은 품질/계정 검증 제한, Safari 로컬 URL을 명시하라. 커밋·병합 등 구조 변경 뒤에는 공용 `/Users/parkseungyeon/Documents/Codex/2026-09-06/x20/5E/tools/update-branch-dashboard.py --if-changed`로 로컬 현황판을 갱신하라. 이 현황판은 공개 배포하지 않는다.

사용자의 최신 지시로 제품 변경을 한글 커밋 `996b7e20`에 확정했고 이 인계도 같은 브랜치에 커밋한다. 이 세션에서는 병합·푸시·배포하지 않았다. 기존 8826 로컬 서버는 사용자 확인용으로 유지 중이다.
