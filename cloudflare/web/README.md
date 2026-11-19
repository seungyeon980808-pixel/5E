# 5e-web-preview — 웹 미리보기 Worker (1.7.1)

GitHub Pages(`www.5e.ai.kr`)에 올라갈 것과 같은 웹 사이트를 Cloudflare Workers 정적 파일로 띄워, 출시 전에 Safari 등에서 직접 써 보기 위한 미리보기입니다.

- 주소: `https://5e-web-preview.5e-desktop.workers.dev/`
- `www.5e.ai.kr`(GitHub Pages)·DNS·다른 Worker(`5e-images`, `5e-exam-pdf` 등)는 건드리지 않습니다.

## 무엇이 올라가나

`scripts/web-release.cjs`의 `stage()`(GitHub Pages 배포와 같은 함수)로 고른 파일 그대로입니다. 하위 프로그램은 사이트 주소대로 `/print/`, `/examlibrary/`, `/bug/`, `/hub/`, `/memo/`, `/ourdocs/`에 놓입니다.

다만 그림 Worker(`5e-images`)로 옮긴 두 묶음은 올리지 않습니다(`.assetsignore`).

| 빼는 것 | 앱이 받는 곳 |
|---|---|
| `assets/pdf-library/previews/**/*.webp` (쪽 미리보기, `manifest.js`는 남김) | `js/library/image-hosts.js` `pagePreviewUrl` → `5e-images/previews/…` |
| `assets/exam-library/images/` (기출 문항 그림) | `examFigureUrl` → `5e-images/exam/…` |
| `CNAME`, `.nojekyll` | GitHub Pages 전용 |

과학 부품 SVG(`assets/parts-library/svg/`)는 남깁니다. `js/parts-library.js`가 아직 같은 사이트의 상대 경로(`LIB_BASE`)로 SVG를 읽기 때문입니다.

없는 주소는 GitHub Pages처럼 가장 가까운 `404.html`을 404로 보여 줍니다(`not_found_handling: "404-page"`). `404.html`의 `/ourdocs/<이름>` 되돌리기도 그대로 돕니다.

## 만들기 → 올리기 → 확인

1. 만들기(깨끗한 커밋에서): `node data/web/build-site.mjs`
   → `data/web/out/site/` + `data/web/out/site-summary.json`(파일 수·크기). 한도(Worker당 2만 개, 한 파일 25MiB)를 넘으면 멈춥니다. 예전 `out/site`는 `~/.Trash`로 옮깁니다.
2. 올리기: `cd cloudflare/web && npx --yes wrangler@4 deploy --config wrangler.jsonc`
3. 확인:
   - `curl -sI https://5e-web-preview.5e-desktop.workers.dev/` → 200, `text/html`
   - `/bug/`, `/print/`, `/examlibrary/`, `/hub/`, `/js/main.js`, `/css/…` → 200
   - `/없는-주소` → 404이고 본문이 `404.html`
   - Safari로 열어 라이브러리 목록과 쪽 미리보기 그림(`5e-images`에서 옴)이 뜨는지

## www.5e.ai.kr과 다른 점

- 주소(출처)가 달라 브라우저 저장 공간(IndexedDB·localStorage)이 따로입니다. 미리보기에서 만든 것은 `www.5e.ai.kr`에 보이지 않습니다.
- 출처를 `5e.ai.kr`로만 허락하는 바깥 서비스(방문자 수, 문제 신고 게시판, 메모 구글 로그인 등)는 미리보기 주소에서 막힐 수 있습니다. 그 Worker들은 고치지 않습니다.
