# 5e-exam-ext — 기출확장_국영수사탐 문제지 정적 Worker (준비만, 아직 올리지 않음)

기출 탐색기(`5e.ai.kr/examlibrary` → exam-search)의 국어·영어·수학·사회탐구 문제지 PDF 401개는 지금 드라이브 게이트웨이(`cloudflare/google-drive-gateway/`)로만 나갑니다. 과탐 PDF처럼 Cloudflare Workers 정적 파일로 옮기기 위한 준비입니다.

| | 값 |
|---|---|
| 파일 | 문제지 401개(국어 37·영어 37·수학 57·사회탐구 270), **897,812,448바이트**. 정답표 313개는 사이트가 안 써서 뺌 |
| 목록 | `data/exam-ext/files.json`(경로·바이트·드라이브 MD5) |
| Worker 경로 | `v1/기출문제/기출확장_국영수사탐/<과목>/<파일>` — 기출 탐색기 `publicPath` 그대로 |
| 한도 | 무료 Worker당 2만 개·파일당 25MiB → 401개(2%), 가장 큰 파일 11.3MB |
| 왜 따로 | `5e-exam-pdf`(9,375개)에 넣어도 한도 안이지만, 다시 올리기·되돌리기를 나누려고 |

## 만들고 올리는 순서

1. 목록(이미 있음, 다시 만들 때만): `EXAM_SEARCH_FILES=<exam-search data/files.json> node data/exam-ext/list-from-exam-search.mjs`
2. PDF 모으기(둘 중 하나)
   - 게이트웨이에서 받기: `EXAM_EXT_SRC=<폴더> node data/exam-ext/fetch-from-gateway.mjs` — 크기·MD5를 드라이브 값과 맞춰 봄, 다시 실행하면 받은 것은 건너뜀
   - 또는 드라이브 「기출확장_국영수사탐」을 동기화한 폴더(모양이 같음: `<과목>/<파일>`)
3. 묶음: `EXAM_EXT_SRC=<폴더> node data/exam-ext/build-site.mjs` → `data/exam-ext/site/`(링크만, git 무시). 없는 파일·크기·MD5·25MiB를 먼저 검사
4. **올리기(사용자 승인 뒤)**: `npx wrangler@4 deploy --config cloudflare/exam-ext/wrangler.jsonc`
5. 확인: `node data/exam-ext/verify-deploy.mjs` — 401개 HEAD 200·크기·CORS

11-19에 1~3까지 해 두었습니다. 받은 PDF와 묶음은 `~/Work/2026-11-19_1.8.0-이미지엔진/L1/exam-ext/`에 있습니다(보고서 `L1.md`).

## 올린 뒤 바꿀 코드

### 기출 탐색기 (exam-search 저장소, 공개 배포 필요)

`drive-source.mjs`(origin/main `0dae9633` 기준)는 **모든 PDF를 게이트웨이로만** 받습니다. 5E에 있는 같은 이름 파일은 11-03에 과탐 정적 주소 먼저(`fromStatic`)가 더해졌지만, exam-search `origin/main`에는 아직 없습니다(로컬 `codex/*` 갈래에만 있음).

1. 상수 추가: `const EXT_BASE = 'https://5e-exam-ext.5e-desktop.workers.dev/v1/';`
2. `downloadDriveFile(path)`: `기출문제/기출확장_국영수사탐/`로 시작하면 먼저 `EXT_BASE + path`(조각마다 `encodeURIComponent`)를 8초 멈춤 감시로 받고, 실패하면 지금처럼 게이트웨이 6번 재시도. 과탐 `fromStatic`을 아직 안 받았다면 같이 들여옴.
3. `driveLink(path)`(원본 PDF 새 창 링크: `app.js` 371·837·891·1186줄, `editable-editor.mjs` 182줄, `study.mjs`): 기출확장은 `EXT_BASE + path`를 돌려주게 바꿈. 링크는 넘어가는 길이 없으므로 Worker를 올리고 `verify-deploy.mjs`가 401/401 통과한 뒤에 바꿈.
4. 검사: `test_drive_source.mjs`의 기출확장 경로 기대값, `test_release_data.mjs`(401개 수는 그대로).
5. 배포 후 실제 화면에서 국어·사탐 PDF 한 개씩 고해상도 보기·한글 변환.

### 5E (이 저장소)

- `assets/exampool/convert/es/drive-source.mjs`: exam-search와 같은 파일이므로 위 1~3을 똑같이. 지금 `fromStatic`이 기출확장을 일부러 빼고 있음(`!path.startsWith('기출문제/기출확장_국영수사탐/')`) → 기출확장은 `EXT_BASE`로 보내는 갈래를 하나 더.
- `js/pdf-library/static-mirror.js` 11줄의 같은 제외 조건: 5E 라이브러리 자료(공유 폴더 `1N46Woe4…`)에는 기출확장 경로가 없어 실제로는 안 씀(C2 조사). 바꾸지 않아도 됨.
- 5E 안에서 기출확장 PDF를 직접 부르는 곳은 없습니다.

### 그 뒤

- 몇 주 지켜보고 드라이브 「기출확장_국영수사탐」 폴더 공유를 「제한됨」으로 돌릴지 사용자가 정함(돌리면 게이트웨이로 넘어가는 길은 끊김).
- 맥 사본 `~/Documents/Codex/2026-09-06/x20/exam-search-public/기출확장_국영수사탐/`(0.86GB)과 11-19에 받은 폴더는 드라이브가 원본이므로 올린 뒤 더미.
