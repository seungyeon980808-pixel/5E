# CSP(콘텐츠 보안 정책) 제안 — 보안 점검 M3

- 작성: 2026-10-19, 브랜치 `fix/1.7.0/security`
- 상태: **제안만. 화면 코드·운영 설정에는 아직 넣지 않았습니다.** 적용 방식은 사용자 결정입니다(아래 "결정할 것").

## 먼저 알아야 할 제약

1. **운영 사이트는 Report-Only를 쓸 수 없습니다.**
   `www.5e.ai.kr`은 DNS(가비아)가 GitHub Pages를 바로 가리킵니다(응답 `Server: GitHub.com`, Cloudflare를 거치지 않음, 2026-10-19 HEAD 요청 1회로 확인).
   GitHub Pages는 응답 머리말을 바꿀 수 없고, `<meta http-equiv>`는 `Content-Security-Policy-Report-Only`와 `frame-ancestors`·`report-uri`를 지원하지 않습니다.
   그래서 "운영에 Report-Only로 먼저 걸고 위반 보고를 모으는" 방식은 지금 구조로는 불가능합니다.
2. 대신 **로컬에서 Report-Only 머리말을 붙여 실제 흐름을 돌려 보는 검사**를 만들었습니다(`scripts/csp-report-only-probe.cjs`). 운영에는 아무것도 보내지 않습니다.

## 조사 결과: 편집기(`/`, `/preview/`)가 실제로 쓰는 출처

로컬 미리보기 서버에 초안 정책을 Report-Only로 붙이고 Chromium·WebKit에서 아래 흐름을 돌렸습니다.
처음 화면 로드(구글 글꼴 실제 로드 포함) → 튜토리얼 목록 → 시험지 미리보기 → 한글(HWP) 작업실(rhwp WebAssembly·iframe) → 글자 인식(Tesseract Worker·WebAssembly).

| 종류 | 출처 | 근거 |
|---|---|---|
| 스크립트 | 같은 출처, 인라인 2개(팔레트 초기화·프로젝트 패키지 설정) | `index.html` 45·67줄. 해시로 허용 |
| WebAssembly | `'wasm-unsafe-eval'` 필요 | rhwp 작업실, Tesseract. 엄격한 정책에서 Chromium이 위반 보고 |
| 스타일 | 같은 출처, 인라인 스타일 속성(17곳+, JS가 `style.cssText`로 많이 씀), `fonts.googleapis.com` | `'unsafe-inline'` 없이는 화면이 깨짐 |
| 글꼴 | `fonts.gstatic.com`, `cdn.jsdelivr.net`(rhwp 스튜디오 iframe 안 CSS), `data:` | WebKit에서 iframe 위반으로 확인 |
| 이미지 | 같은 출처, `data:`(CSS 아이콘 SVG), `blob:`(시험지 미리보기·캡처) | 두 엔진 모두 위반으로 확인 |
| Worker | 같은 출처(PDF 검색), `blob:`(Tesseract) | Chromium·WebKit 위반으로 확인 |
| iframe | 같은 출처(`/vendor/rhwp-studio/`) | |
| 연결(fetch) | 같은 출처, 방문자 집계·문제 게시판 Worker, `five-e-ai-runtime-probe.onrender.com`(ChatGPT 연결·작업 공유), `raw.githubusercontent.com`(지도 자료), `http://127.0.0.1:*`(MCP 브리지) | 코드 조사(`js/web-ai-connection.js`, `js/ai-sharing-ui.js`, `js/ai-map-assets-data.js`, `js/mcp-bridge.js`). 이 흐름들은 검사에서 실제로 부르지 않음 |

결과: 아래 초안으로 **두 엔진 모두 위반 0건**. 엄격한 정책(`default-src 'self'`만)으로 돌리면 위 항목들이 모두 위반으로 잡혀, 검사가 실제로 위반을 잡는 것도 확인했습니다.

## 편집기 정책 초안

파일: `docs/security/csp-editor-draft.txt`

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval' 'sha256-6J13xoNSozd2mH1AJl3KuLPsdiB1hD3ZvL7QP+gJZ6k=' 'sha256-+c+fChzr4b4A9xVtNKq3Yfmcbli9o3ahnUjLndo441s=';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net;
img-src 'self' data: blob:;
connect-src 'self' data: blob: https://5e-visitor-stats.5e-desktop.workers.dev https://5e-bug-api.5e-desktop.workers.dev https://five-e-ai-runtime-probe.onrender.com https://raw.githubusercontent.com http://127.0.0.1:*;
worker-src 'self' blob:;
frame-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self'
```

이 정책이 막는 것: 다른 출처 스크립트 실행, 인라인 `<script>`·`onerror=` 같은 이벤트 속성 실행(M4 같은 실수가 실제 공격으로 이어지는 길), 외부로 데이터 보내기(허용 목록 밖 `fetch`), `<object>`, `<base>` 바꿔치기.
막지 못하는 것: 인라인 스타일(`'unsafe-inline'`), 같은 출처에 올라간 파일, 클릭재킹(`frame-ancestors`는 meta로 안 됨).

주의:
- 인라인 스크립트를 고치면 해시가 바뀝니다. `index.html` 인라인 스크립트 2개를 `js/` 파일로 옮기면 해시 없이 `'self'`만으로 됩니다(권장).
- `http://127.0.0.1:*`는 MCP 브리지용입니다. 공개 사이트에서 이 기능을 끄면 빼는 편이 안전합니다.
- 로컬 미리보기(`127.0.0.1:<포트>`)는 같은 출처라 그대로 됩니다. 데스크톱 앱(Electron)은 별도 확인이 필요합니다.

## 다른 화면 초안(코드 조사만, 브라우저 검사 안 함)

| 화면 | 초안 |
|---|---|
| `/bug/` | `default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https://5e-bug-api.5e-desktop.workers.dev; connect-src https://5e-bug-api.5e-desktop.workers.dev; object-src 'none'; base-uri 'self'` |
| `/memo/` | `default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; frame-src https://accounts.google.com/gsi/; connect-src https://5e-memo-api.5e-desktop.workers.dev https://accounts.google.com/gsi/; font-src 'self'; object-src 'none'; base-uri 'self'` (Google 로그인 공식 안내 기준) |
| `/examlibrary/` | `default-src 'none'; script-src 'sha256-kjwj3HBXVqcjDToToExkrTKYCVgEX0SLep/5sRpJ8yA='; style-src 'unsafe-inline'; frame-src https://seungyeon980808-pixel.github.io; base-uri 'none'` |
| `/ourdocs/` | `default-src 'none'; script-src 'sha256-RJPaYBNGLxCsQcCccIGO8nGJ/O2AvVpw/vzBRvFZ1YU='; style-src 'unsafe-inline'; frame-src https://ourdocs-cloud.5e-desktop.workers.dev; base-uri 'none'` |

## 검사 방법

```bash
node scripts/csp-report-only-probe.cjs
```

다른 정책 파일로: `node scripts/csp-report-only-probe.cjs <정책 파일> <결과.json>`. 위반이 있으면 종료 코드 1과 함께 단계·지시어·주소를 출력합니다.
아직 검사하지 않은 흐름: ChatGPT 연결 로그인 창, 작업 공유, 문항 라이브러리(Google Drive 묶음), 지도 자료 불러오기, MCP 브리지, 문제 신고 창. 적용 전에 이 흐름도 추가해야 합니다.

## 결정할 것(사용자)

1. **어떻게 걸지**
   - (가) 지금 구조 유지 + `<meta>`로 **바로 강제**: `/preview/`에 먼저 넣고, 위 검사에 남은 흐름을 추가한 뒤 정식으로. 위반이 생기면 기능이 바로 멈추므로 검사 범위가 중요합니다.
   - (나) `5e.ai.kr` DNS를 Cloudflare로 옮겨 프록시를 켜고 응답 머리말(Transform Rule)로 **Report-Only → 강제** 순서로 걸기. `frame-ancestors`·보고 주소도 쓸 수 있지만 DNS·인증서·운영 구조가 바뀝니다.
   - (다) 출시 뒤로 미루고 로컬 검사만 CI에 넣기.
2. 인라인 스크립트 2개를 파일로 옮길지(해시 관리가 필요 없어짐).
3. 공개 사이트에서 MCP 브리지(`127.0.0.1`) 연결을 허용할지.
