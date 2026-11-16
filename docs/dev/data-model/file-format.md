# 파일 형식: `.5e` 하나로 통일 (1.7.1에서 구현 중)

## 1. 방향 (결정)

| 원칙 | 내용 |
|---|---|
| 저장 | 세 프로그램의 「저장」(⌘S)은 언제나 `.5e` 하나 |
| 내보내기 | 다른 프로그램이 쓰는 결과물: HWPX·HWP·PDF·PNG·엑셀 |
| 불러오기 | 다른 곳에서 만든 것·옛 형식: `.xlsx`, `.hwp`·`.hwpx`, 그림, 옛 `.exampool`·`.json` |
| 열기 | `.5e`만. 확장자가 아니라 안쪽 바이트로 종류를 판단하고, 맞는 프로그램으로 넘겨 열기. 경고로 끝내지 않음 |
| 범위 | 1.7.1은 **형식 통일까지**(결정 A). 시험지를 파일 단위로 열고 그 파일에 저장하는 구조 변경과 세 프로그램을 `.5e` 하나에 통째로 묶는 것은 뒤로 |

이유: 「저장이 아니라 내보내기여야 한다. 기본 저장은 정해진 확장자를 쓴다」(사용자 10-27). 5E_exam은 지금 프로젝트를 엑셀로 저장해 형식이 프로그램마다 달랐습니다.

## 2. 지금 상태 (1.7.0)

| 프로그램 | 「저장」이 만드는 것 | 열기 |
|---|---|---|
| 5E_image | `.5e` (압축 파일, `kind:'drawing'`) | `.5e`, 옛 `.json`, 원본 포함 PNG |
| 5E_hwp | `.5e` (`kind:'exam'`, 안에 `document.hwpx`) | `.5e`, `.5exam`, `.json` / 불러오기 `.hwp`·`.hwpx` |
| 5E_exam | ⌘S = 엑셀 `.xlsx`, 시험지 ⋯ = `.exampool`(JSON) | `.xlsx`, `.exampool`, `.json` |
| 예전 ExamPool(숨김) | `.exampool`(v1) | 같음 |

5E_exam의 실제 작업 자료는 파일이 아니라 브라우저 보관함(IndexedDB 한 칸)이고, 설치판은 자동 저장·백업을 사용자 문서 폴더에 둡니다.

### `.5e` 상자 (`js/fivee-project.js`)

| 항목 | 내용 |
|---|---|
| 겉 | 압축하지 않은 ZIP. 1.6.x의 `.5e`는 UTF-8 JSON(그림)이었고 ZIP이 아니면 지금도 JSON 그림으로 읽음 |
| `manifest.json` | `{format:'5e-project', version:1, kind, projectId, name, assets:[…]}` |
| `project.json` | 원자료에서 `data:image/…;base64,…` 글자를 모두 찾아 `{"$5eAsset": i}`로 바꾼 JSON(같은 그림은 한 번만) |
| `assets/i` | 그림 원본 바이트 |
| `document.hwpx` | `kind:'exam'`일 때만 |
| 한도 | 상자 128 MiB, 다시 펼 때 512 MiB, 깊이 100, 그림 9,997개 |
| 종류 넘김 | 5E_image에서 `exam`을 열면 묻고 5E_hwp로, 5E_hwp에서 `drawing`을 열면 그림 작업대로 |

## 3. 설계

### 3-1. `kind` 하나 추가

`manifest.version`은 1 그대로 두고 `kind`만 늘립니다. 1.7.0이 모르는 `kind`를 만나면 「지원하는 5E 프로젝트 파일이 아닙니다」로 거절하므로 옛 판이 잘못 여는 일은 없습니다.

| `kind` | 화면 이름 | 여는 프로그램 | 1.7.1 |
|---|---|---|---|
| `drawing` | 그림 | 5E_image | 그대로 |
| `exam` | 한글 시험지 | 5E_hwp | 그대로 |
| `sheet` (새로) | 문항 · 시험지 | 5E_exam | 새로. `project.json` 안은 `5e-question-sheet-v2` 묶음(문항·자료·시험지·학교 양식·성취기준), 학교 양식은 `forms/<id>.hwpx`로, 그림은 `assets/`로 빠짐(base64 JSON보다 약 ¼ 작아짐) |

- `scope`: `exam`(시험지 하나 + 그 문항) / `library`(보관함 전체). 여는 쪽은 둘 다 기존 「불러올 문항 확인」 창으로 들임.
- 자료(`documents`)의 PDF는 1.7.1에서는 JSON 안에 둠(크기가 문제가 되면 1.8.0에서 판단).

### 3-2. 프로그램별 저장·내보내기·불러오기

| 프로그램 | 저장(⌘S) | 내보내기 | 불러오기 |
|---|---|---|---|
| 5E_image | `.5e` (그대로) | PNG·SVG·원본 포함 PNG | 그림, 옛 `.json` |
| 5E_hwp | `.5e` (그대로) | HWPX·PDF | `.hwp`·`.hwpx`, 옛 `.5exam`·`.json` |
| 5E_exam | **`.5e` (`kind:'sheet'`)**. 시험지 화면이면 그 시험지, 아니면 보관함 전체 | 엑셀, 엑셀 양식, 시험지 HWPX, 분류표 | 엑셀, 옛 `.exampool`, `.json` |

5E_exam 메뉴는 글자만 바뀝니다(`엑셀 내려받기` → `저장` / `내보내기 › 엑셀` / `불러오기 › 엑셀·옛 문항 파일`). 시험지 ⋯ 메뉴의 「시험지 파일로 저장」은 이름 그대로 두고 결과만 `.5e`로 바꿉니다. 화면이 바뀌므로 시안 승인을 거칩니다.

### 3-3. 옛 형식

| 옛 형식 | 1.7.1 | 이유 |
|---|---|---|
| `.5e` JSON(1.6.x 그림) | 계속 엶. 다시 저장하면 ZIP `.5e` | 1.6.3 사용자 업데이트 보장 |
| 옛 `.json` 그림 | 「불러오기」로만(바이트로 알아보면 엶) | 해석 코드가 같아 유지 비용 0 |
| `.5exam` | 파일 고르기 목록에서 뺌. 이름을 `.5e`로 바꿔 오면 1.7.1 동안만 엶, 1.8.0에서 코드째 삭제 | 개발 중에만 쓰이고 사실상 사용자 본인뿐 |
| `.exampool`(두 형식) | 5E_exam 「불러오기」로 계속 받음 | 실제 사용 중인 시험지 파일이 이 형식 |
| `.xlsx` | 「불러오기 › 엑셀」 / 「내보내기 › 엑셀」 | 사용자 지시 |
| 윈도우 실행형 프로젝트 `.exe`·맥 `.zip` | 빼기 | 만드는 길이 이미 죽어 있음(호출 0) |
| 조판 틀(`.5e-typeset.json`), 팔레트(`.hwpal`·`.hwpc`), 설정·백업 | 그대로 | 프로젝트가 아니라 설정·틀 파일 |

### 3-4. 호환

| 방향 | 결과 |
|---|---|
| 1.6.3 파일 → 1.7.1 | 열림(검사 `tests/test-data-compat-1.6.3-browser.cjs`) |
| 1.7.0 파일 → 1.7.1 | `drawing`·`exam` 그대로, `.xlsx`·`.exampool`은 5E_exam 불러오기 |
| 1.7.1 `sheet` → 1.7.0 | 1.7.0이 거절(데이터 손상 없음). 엑셀로 내보내 전달 |
| 1.7.1 ZIP `.5e` → 1.6.3 | 못 엶(1.7.0부터 이미 그랬음) |

### 3-5. 설치판: `.5e` 두 번 눌러 열기

지금은 파일 연결이 없습니다. 화면 쪽 받는 곳(`js/project-launch.js`의 `initProjectLaunch`)은 이미 있지만 preload에 `project` 다리가 없어 죽어 있습니다.

| 층 | 할 일 |
|---|---|
| `package.json` `build` | `fileAssociations`(확장자 `5e`, 이름 「5E 프로젝트」, 문서 아이콘). 맥은 `UTExportedTypeDeclarations`(`public.data` 계열, ZIP으로 선언하지 않음: 1.6.x `.5e`는 JSON) 추가를 권장 |
| `desktop/main.cjs` | `ready` 전에 `open-file` 처리(맥 Finder/Dock), 한 번만 실행 잠금과 `second-instance`(윈도우), 첫 실행 `process.argv`에서 `.5e` 경로 찾기. 확장자·크기(128 MiB)를 확인한 뒤 바이트를 읽어 화면이 준비되면 보냄. **경로는 화면에 넘기지 않음** |
| `desktop/preload.cjs` | `project: { onOpen, ready, saveBytes }` |
| 화면 | `openProject`가 `kind:'sheet'`을 5E_exam으로 넘기는 분기 추가 |
| 설치판 5E_exam 저장 | `desktop/exam-files.cjs`의 허용 종류에 `5e`를 더함(지금 `.exampool` 저장이 이 목록에 없어 설치판에서 실패하는 결함과 같은 자리) |

## 4. 구현 순서와 검사

| 순서 | 일 |
|---|---|
| F1 | `.5e`에 `kind:'sheet'` 추가(만들기·읽기·검사), 학교 양식을 `forms/`로 |
| F2 | 5E_exam 저장·시험지 저장을 `.5e`로, 엑셀은 내보내기/불러오기로, 불러오기가 바이트로 종류를 가려 받기 |
| F3 | 어느 프로그램에서 열든 `kind`로 맞는 프로그램에 넘김 |
| F4 | 파일 고르기 목록 정리(`.5exam`·`.json` 제거) |
| F5·F6 | 설치판 파일 연결, `open-file`·한 번만 실행·preload 다리 |
| F7 | `exam-files.cjs` 허용 종류에 `5e` |
| F8 | 예전 ExamPool 저장 길·실행형 프로젝트 길 삭제(덜어내기와 함께) |

통과해야 할 검사: 세 프로그램의 저장 → 열기 왕복, 5E_exam 보관함 전체·시험지 하나 왕복(문항·시험지·자료·그림 수와 조판 기준 동일), 엑셀 내보내기 → 불러오기 왕복, 다른 프로그램에서 열었을 때 넘겨 열기(Lite는 Pro로 바꾸는 길), 알 수 없는 `kind`·깨진 ZIP·128 MiB 초과는 작업을 그대로 두고 알림만, 1.6.3·1.7.0·옛 `.exampool` 열기, 설치판에서 앱이 꺼진 채/떠 있을 때 두 번 누르기(맥·윈도우), 만든 앱의 문서 형식 선언과 윈도우 연결 등록.

관련 기존 검사: `tests/test-fivee-project.mjs`, `tests/test-rhwp-exam-project.mjs`, `tests/test-project-file-policy.mjs`, `tests/test-project-file-size-browser.cjs`, `tests/test-data-compat-1.6.3-browser.cjs`, `desktop/preview-project-save.test.cjs`.

## 5. 미결·뒤로 미룸

| 항목 | 상태 |
|---|---|
| 세 프로그램 저장 방식(저장 창으로 이름·위치 고르기 vs 자동 저장) | 추천은 저장 창(확인 필요) |
| 열린 파일에 덮어 저장(⌘S) / 다른 이름으로(⇧⌘S) | 추천은 넣기, 새 기능인지 기본 동작 보완인지 확인 필요 |
| `.5e` 상자가 PDF 자료도 `assets/`로 뺄지 | 1.7.1은 그대로 |
| 문서 아이콘 모양 | 앱 아이콘 + 종이 하나 추천(시안) |
| 5E_exam을 파일 단위 구조로 바꾸기, 문항 하나를 파일 하나로 | 1.8.0 이후 |
| `.5e` 안 AI용 글자 원고, 웹 `file_handlers`, 미리보기 썸네일, 최근 연 파일 | 뒤로 |
