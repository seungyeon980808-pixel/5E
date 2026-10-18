# 1.6.3 → 1.7.0 저장 데이터 호환 (2026-10-19)

정식 1.6.3(www.5e.ai.kr, `v1.6.3` 태그) 사용자가 1.7.0으로 업데이트했을 때 브라우저에 저장된 작업이
깨지지 않는지 확인한 기록이다. 정식 출시는 1.7.0을 같은 주소의 루트(`/`)로 올리므로, 같은 출처의
같은 저장소 이름을 1.7.0이 그대로 읽어야 한다.

- 검사: `tests/test-data-compat-1.6.3-browser.cjs` (chromium·webkit, suite-manifest `DATA-COMPAT-1.6.3-TO-1.7.0`)
- 고정 자료: `tests/fixtures/data-compat-1.6.3/` — 실제 1.6.3을 띄워 만든 것
  - `generate-fixture.cjs`: `v1.6.3`을 임시 폴더로 꺼내 로컬 서버로 띄우고, 화면을 직접 조작해 데이터를 만든 뒤 저장소를 뜬다
  - `storage.json`: 1.6.3 브라우저 저장소 전체(localStorage 11개, IndexedDB 3개)
  - `project-1.6.3.5e`: 1.6.3 [파일 → 프로젝트 저장] 결과(JSON)
  - `settings-backup-1.6.3.zip`: 1.6.3 [설정 → 전체 저장(백업)] 결과(설정 + 내 오브젝트 + 그림)
  - `storage-dump.cjs`: 저장소를 JSON으로 뜨고 같은 이름·버전·구조로 되살리는 도우미
- 실행: `APP_ENTRY=/ EVIDENCE_DIR=<빈폴더> node tests/run-browser-tests.cjs --only test-data-compat-1.6.3-browser.cjs`
- 고정 자료 다시 만들기: `node tests/fixtures/data-compat-1.6.3/generate-fixture.cjs` (Chromium으로 1.6.3을 조작)

## 1.6.3이 만든 대표 데이터

| 무엇 | 내용 |
| --- | --- |
| 그림 | 1쪽: 사각형·타원·직선·글자("1.6.3 글자 F=ma")·좌표평면+함수 그래프(y=x^2/4, 끝 라벨 A), 2쪽: 사각형. 아트보드 95×50 |
| 라이브러리 | 내 오브젝트 "1.6.3 상자"(분류 "호환 검사", 과목 화학) |
| 설정 | 화면 색 화이트(`theme=light`), 과목 화학, 화면 크기 110%(`wide`), 단축키 기준 Windows, 도구 기본값(선 0.35mm·글자 4mm·격자 5mm) |
| AI 작업 기록 | AI 작업대 상태(작업 1) — AI 호출 없이 1.6.3이 부팅 때 만드는 기록 |
| 저장 파일 | 프로젝트 파일(.5e, JSON), 설정 백업(ZIP) |

## 저장 위치 비교

루트(`/`) 기준. `5e.preview:` 접두사는 1.6.3·1.7.0 모두 `js/preview-storage.js`의 `previewStorage`가 붙인다
(1.6.3 정식 루트도 이 접두사를 쓴다 — 이름과 달리 "프리뷰 전용"이 아니다).

| 저장 위치 | 1.6.3 | 1.7.0 | 달라진 점 | 검사 |
| --- | --- | --- | --- | --- |
| 자동 저장 | IDB `5e-preview-autosave` v1 (`snapshots`, `checkpoints`, autoIncrement `id`), 옛 `5e-autosave` 읽기 | 같음(`js/autosave.js` 내용 동일, import 버전만 다름) | 없음 | 복구 확인창 → 두 쪽·7개 그림 필드 단위 일치 |
| 키-값 저장소 | IDB `5e.preview:5e-store` v1 `kv` (내 오브젝트 `5e.personalObjects`, 내보내기 폴더, 공유 기록, AI 묶음) | 같음 + 1.7.0이 새 키 추가(AI 작업 기록 journal 등) | 새 키만 추가 | 내 오브젝트 표시·삽입, 기록 보존 |
| AI 작업대 | IDB `5e.preview:5e-ai-image-tasks` v1 `tasks`(keyPath `key`) | 같음 | 없음 | `workspace` 기록·작업 탭 보존 |
| AI 결과 캐시·묶음 | IDB `5e.preview:5e-ai-output-cache` v1, `5e.preview:5e-ai-batch-v1` v1 | 같음 | 없음 | (AI 호출이 필요해 자료 없음 — 이름·버전 코드 비교) |
| PDF 자료집 | IDB `5e.preview:5e-pdf-packs` v1 (`packs`, `assets`) | 같음 | 없음 | (Drive 내려받기가 필요해 자료 없음 — 코드 비교) |
| 1.7.0 새 저장소 | — | IDB `5e-rhwp-exam` v1 `drafts`, `5e.preview:5e-ai-label-background`, `5e.preview:5e-graph-reconstruction` | 새로 생김(1.6.3 데이터와 겹치지 않음) | — |
| 설정 키 | `5e.preview:` + `theme`, `phyDraw.defaults`, `5e.subject`, `5e.screenSize`, `5e.shortcutPlatform`, `5e.previewBackgrounds`, `5e.refmemo`, `5e.mode`, `5e.objectBrowser.v1`, `5e.objectFavorites.v1`, `5e.objectRecent.v1`, `5e.toolSections.v1`, `5e.tutorial.*`, `5e.mcpBridge`, `5e.desktopHandoff.v1`, `5e.googleDriveLibrary.v1`, `5e-pdf-crop-overrides-v1` | 같은 이름·같은 접두사. 화면 색은 `theme`(dark/light) + 새 키 `5e.palette`(접두사 없음, graphite/classic) | `theme=light` → 화이트, `dark` → 다크네이비(`5e.palette` 없으면 classic). 도구 기본값은 `js/tool-defaults.js`로 옮겼지만 키·mm 단위 그대로 | 화면 색·과목·화면 크기·격자·새 도형 선 굵기 |
| AI·라이브러리 키(접두사 없음) | `5e.aiParallelWorkspaces.v1`, `5e.aiTaskTransfers.v1`, `5e.aiActiveTask.v1`, `5e.aiPrimaryWorkspace.v1`, `5e.aiModel` 등, `5e.aiConversationMessages*`, `5e.unified-library.*` | `channelStorage`: 루트(`/`)에서는 접두사 없음, `/preview/`에서만 `5e.preview:` | 루트 기준 같음 | localStorage 11개 키 값이 1.7.0 부팅·복구 뒤에도 그대로 |
| 1.7.0 새 키 | — | 접두사 없음: `5e.palette`, `5e.visitor.v1`, `5e.loading.stageTimes.v1`, sessionStorage `5e.aiLoginIntent.v1` / 접두사 붙음: `5e.autoSnap` | 새로 생김(1.6.3 키와 겹치지 않음) | — |
| 프로젝트 파일 | `.5e` = UTF-8 JSON(`version: "0.17"`), `.json`도 열림 | `.5e` = ZIP 패키지(`manifest.json` `format: 5e-project`, `version: 1` + `project.json` + `assets/`). 열 때 ZIP이 아니면 옛 JSON으로 읽음(`parseFiveEProject`) | **저장 형식이 바뀜**(1.7.0이 저장한 `.5e`는 1.6.3에서 못 엶). 1.6.3 파일은 1.7.0에서 열림. 그림 스키마는 0.17 그대로 | 1.6.3 `.5e` 열기 → 필드 단위 일치 |
| 설정 백업 | ZIP(`backup.json` `kind: 5E-settings`, `version: 1` + 프로젝트) | 같은 형식으로 읽음 | 없음 | 불러오기 → 설정·내 오브젝트·그림 복원 |
| 데스크톱 앱 | `win.loadFile(index.html)`(file 출처) | 같음(시험지 창만 별도 partition `persist:5e-exam-workspace`) | 기본 창 출처 같음 | 데스크톱은 실행하지 않음(코드 비교) |

## 검사 결과

`APP_ENTRY=/` 로 두 번 연속 통과(chromium·webkit). 확인한 것:

1. 1.6.3 저장소를 그대로 넣고 1.7.0을 열면 "이전에 작업하던 도해가 남아 있습니다" 복구 확인이 뜨고, 복구하면
   1.6.3 두 쪽의 그림이 1.7.0 직렬화 결과와 필드 단위로 같다(1.7.0이 더한 필드는 허용).
2. 1.7.0이 부팅·복구하면서 1.6.3의 localStorage 값 11개, IndexedDB 3개(이름·버전·저장소·기록)를 지우거나 바꾸지 않는다.
3. 화면 색 화이트·과목 화학·화면 크기 110%·격자 5mm가 그대로 시작되고, 새 사각형에 선 굵기 0.35mm가 적용된다.
4. 내 오브젝트 "1.6.3 상자"가 목록에 보이고 누르면 같은 모양으로 캔버스에 들어간다.
5. AI 작업대 기록(작업 1)이 그대로 읽힌다.
6. 1.6.3 프로젝트 파일(.5e JSON)을 [파일 → 열기]로 열면 그림이 같다.
7. 1.6.3 설정 백업(ZIP)을 [설정 → 불러오기]로 복원하면 그림·화면 색이 바로, 과목·화면 크기·단축키 기준·도구 기본값·내 오브젝트는 다시 열었을 때 반영된다.

마이그레이션 코드는 따로 없다 — 1.7.0이 1.6.3과 같은 이름·버전을 그대로 읽고, 프로젝트 파일만 `parseFiveEProject`가
ZIP이 아니면 옛 JSON으로 읽는다. 검사는 이 경로들을 고정한다.

## 발견한 점(편집기 코드는 고치지 않음)

- 데이터가 깨지는 문제는 찾지 못했다.
- 되돌아가기(1.7.0 → 1.6.3)는 보장되지 않는다: 1.7.0이 저장한 `.5e`는 ZIP이라 1.6.3에서는 "프로젝트 파일을 열 수 없습니다" 알림이 뜬다(1.6.3 `openProject`가 글자로 읽어 JSON으로 해석 — 코드 기준, 실행 확인은 안 함).
  출시 뒤 1.6.3으로 롤백(`docs/RELEASE_ROLLBACK.md`)하면 그 사이에 1.7.0에서 저장한 프로젝트 파일은 1.6.3에서 열리지 않는다.
  같은 브라우저 저장소(자동 저장)는 그림 스키마가 0.17 그대로라 영향이 적지만 검사하지 않았다.
- 설정 백업을 불러오면 과목·화면 크기는 다시 열어야 바뀐다(1.6.3과 같은 동작, 코드 주석에 "후속 과제"로 적혀 있음).
- 검사하지 않은 것: AI 대화 기록·AI 결과 캐시·PDF 자료집처럼 바깥 연결(ChatGPT·Google Drive)이 있어야 생기는 데이터는
  고정 자료에 없다(이름·버전·키는 코드로만 비교). Safari 실제 브라우저와 데스크톱 앱은 실행하지 않았다.
