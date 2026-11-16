# 5E 개요: 세 프로그램과 저장소 지도

5E는 과학 교사가 문항·그림·시험지를 만드는 출제 프로그램입니다. 웹(GitHub Pages)과 설치판(Electron, 맥·윈도우)이 같은 코드를 씁니다. 빌드 단계 없이 `index.html`이 `js/`·`css/`를 그대로 불러옵니다.

## 1. 세 프로그램 (맨 위 막대에서 전환)

| 이름 | 하는 일 | 주요 코드 |
|---|---|---|
| 5E_image | 과학 그림 편집, AI 이미지/그래프(변환·생성·복원), 좌표·함수 그래프, 에셋·과학 오브젝트 | `js/` (`ai-*`, `graph/`, `render/`, `inspector/`) |
| 5E_exam (옛 ExamPool) | 문항 카드, 엑셀과 한글 실시간 반영, 문항 보관함(기출 + 내 문항), 근거·성취기준, 기출 「변형」, 조판 설정, 시험지 만들기 | `assets/exampool/sheet/`, `assets/exampool/convert/` |
| 5E_hwp | 한글 문서 편집(rhwp), 양쪽 인스펙터, 점검·정답·배점 등 인쇄 전 조판 | `js/rhwp-exam-*`, `js/hwp-palette/` |
| 공통 | 세 앱 전환(`js/app-switch.js`), 맨 위 막대, 디자인 토큰(`css/design-tokens.css`, 저장소 루트 `DESIGN.md`) | |

세 프로그램은 서로 다른 프로그램입니다. Esc로 넘어가지 않고, 전환할 때는 새 프로그램을 먼저 열고 다 나타난 뒤 옛 것을 닫습니다(등장 0.18초·퇴장 0.16초). 이 규칙은 `tests/test-app-switch-browser.cjs`가 지킵니다.

### 역할 결정 (10-20)

| 프로그램 | 맡은 것 | 맡지 않는 것 |
|---|---|---|
| 5E_exam | **내용**: 무엇을 묻는가. 문항 만들기, 성취기준, 출제의도, 정답, 근거, 해설, 보관함 | 시험지 전체 모양 |
| 5E_hwp | **인쇄 전 최종 조판**: 어떻게 찍히는가. 용지·단·여백, 문항 배치, 점검, 인쇄 | 문항 내용을 새로 쓰는 일 |
| 5E_image | 그림·그래프 | |

- 문항을 새로 더하려면 5E_exam에서 만들어 보냅니다(5E_hwp에서 새로 쓰지 않음). 역할이 겹치는 부분(글자 고치기)은 받아들입니다.
- 시험지를 열 때 「내 컴퓨터의 파일」 또는 「5E_exam 시험지」를 고릅니다.
- 5E_hwp 기능 목록과 상태: [hwp/features.md](hwp/features.md). 이 역할 결정에 어긋나는 5E_hwp 교사용 기능(정답·배점·분류표·학생용 사본·선지 섞기·QR 등)은 1.7.1에서 덜어내는 후보입니다([roadmap.md](roadmap.md)).

## 2. 기능 영역별 문서

| 영역 | 문서 |
|---|---|
| 5E_exam 카드·보관함·새 문항 | [exam/cards-library.md](exam/cards-library.md), [exam/new-question.md](exam/new-question.md) |
| 기출 한글 복원(「변형」) | [exam/kice-convert.md](exam/kice-convert.md) |
| 조판 기준 | [typeset/standard.md](typeset/standard.md), [typeset/school-forms.md](typeset/school-forms.md) |
| 5E_hwp | [hwp/features.md](hwp/features.md), [hwp/symbol-palette.md](hwp/symbol-palette.md) |
| 확정 결정 | [decisions.md](decisions.md) |
| 일정·범위 | [roadmap.md](roadmap.md) |
| 검사 | [quality/testing.md](quality/testing.md) |
| 저장 형식 | [data-model/file-format.md](data-model/file-format.md) |

## 3. 저장소 폴더 지도 (1.7.0 기준)

| 폴더 | 내용 |
|---|---|
| `index.html`, `404.html`, `manifest.json` | 웹 입구 |
| `js/` (약 300파일 + 하위 `eq/`·`function-graph/`·`graph/`·`hwp-palette/`·`inspector/`·`library/`·`loading/`·`pdf-library/`·`render/`·`tools/`) | 5E_image 본체, AI 작업대(`ai-*`), 5E_hwp(`rhwp-exam-*`), 공통 |
| `css/`, `fonts/` | 스타일, 글꼴 |
| `assets/exampool/` | 5E_exam 본체: `sheet/`(카드·시트·시험지), `convert/`(기출 변환 엔진), `authoring/`, `forms/`, `answers/`, `standards.json` |
| `assets/` 나머지 | 아이콘, `asset-library/`, `exam-library/`·`pdf-library/`·`parts-library/`(큰 그림 묶음), `hwp-palette/`, `svg_object/` |
| `vendor/` | 외부 라이브러리: `rhwp-studio`·`rhwp-editor`(조판 엔진), `pdfjs`, `opencv`, `ocr`, `mathlive`, `fflate` |
| `desktop/` | Electron 설치판(`main.cjs`, `preload.cjs`, 파일·AI 연결·PDF 서비스)과 단위 검사(`*.test.cjs`) |
| `tests/` | 브라우저 검사·고정 자료·`known-failures.json` |
| `scripts/` | 배포·검사 보조 스크립트, 로컬 서버 |
| `tools/` | 보고서·그림 점검 도구, `kice-convert`, `mcp-5e` 등 |
| `exam-pdf/` | 기출 PDF Worker 설정, 미리 변환 |
| `bug/`, `visitor/` | 문제 신고 게시판, 방문자 집계(Worker + D1) |
| `print/`, `examlibrary/` | 5E 하위 프로그램 입구(교재 도구, 기출 탐색기) |
| `memo/`, `hub/`, `ourdocs/`, `docfinder/` | 다른 사이트의 입구(1.7.1에서 개인 사이트 저장소로 이전) |
| `experiments/web-codex-auth/` | 이름은 실험이지만 웹 5E AI 연결의 실제 코드(`editor-bridge.js`) |
| `preview/` | 옛 사본(1.7.1에서 없어짐) |
| `docs/` | 사용자 문서(`README.md`, `USER_GUIDE.md`, 릴리즈 노트, 단축키), `docs/dev/`는 개발 기록 |
| `.github/workflows/` | 검사·배포 워크플로(`test.yml`, `web-release.yml`, `windows-release.yml`, 사이트별 `*-route.yml` 등) |

### 1.7.1 구조 정리 방향 (진행 중)

`cloudflare/`(Worker 설정·소스)·`data/`(자료 재생성 스크립트)·`apps/`(하위 프로그램 입구) 폴더가 새로 생기고 `preview/`는 없어지며, `memo/`·`hub/`·`ourdocs/`·`docfinder/`는 개인 사이트 저장소로 옮겨 갑니다. 큰 그림 묶음 세 개(`assets/exam-library/images`, `assets/pdf-library/previews`, `assets/parts-library/svg`)는 Cloudflare Worker로 빠집니다. 폴더 이름은 확정이 아닙니다.

## 4. 바깥 서비스

| 서비스 | 하는 일 |
|---|---|
| GitHub Pages | 웹 배포(`5e.ai.kr`). 사이트 한도 1GB 근처라 1.7.1에서 Cloudflare 이전을 기획 중 |
| Cloudflare Worker | 평가원 PDF·목록, 학평, 방문자 집계(D1), 문제 신고, 드라이브 공유 폴더 연결 |
| 별도 실행 서버 | 웹에서 ChatGPT 로그인·AI 요청을 대신 보내는 서버(저장소 밖) |

원칙: 장기적으로 자료는 저장소와 Cloudflare 두 곳에만 둡니다.
