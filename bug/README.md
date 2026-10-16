# 5E 문제 게시판

`https://5e.ai.kr/bug/`의 문제 신고 게시판입니다. 편집기의 문제 신고 버튼은 이 페이지를 새 탭으로 열기만 하고, 그림·파일·로그를 자동으로 보내지 않습니다.

- 화면: GitHub Pages(`bug/index.html`, `board.css`, `board.js`, `config.js`, `draft.js`, `capture.js` — `bug/assets.json`)
- API: Cloudflare Worker `5e-bug-api` (`bug/worker/`), 글은 D1 `5e-bug-board`, 첨부 이미지는 Workers KV `5e-bug-images`
  (계정에 R2가 켜져 있지 않아 추가 활성화가 필요 없는 KV를 쓴다. 삭제한 이미지는 다른 지역에서 최대 1분 정도 남아 보일 수 있다.)
- API·저장소·DB 구조·Worker 코드는 Pages에 올리지 않습니다(`scripts/bug-publication.cjs`가 막습니다).
- 로컬: `node scripts/bug-board-server.cjs`(SQLite·파일 저장, 포트 61910). 미리보기 서버가 같은 출처의 `/api/bug-board`를 넘겨 주므로 운영 서버로 시험 신고가 가지 않습니다.

## 권한

- 로그인 없이 신고합니다. 글 비밀번호(8자 이상)는 PBKDF2 해시로만 저장하고, 수정·삭제·추가 내용·이미지 공개 설정에 씁니다.
- 첨부 이미지는 기본 비공개이며 작성자(비밀번호 확인)와 관리자만 봅니다. 이미지마다 공개를 고를 수 있습니다.
- 관리자는 Worker secret `ADMIN_TOKEN`(24자 이상)으로 접속합니다. 접속 키는 브라우저 탭(sessionStorage)에만 보관합니다.
- 쓰기 요청은 허용 출처(`ALLOWED_ORIGINS`)와 `X-5E-Report: 1` 머리말이 있어야 하며, 쓰기·비밀번호 확인에 횟수 제한이 있습니다.

## 서버 준비와 배포 (Cloudflare 계정 소유자가 실행)

```bash
npx wrangler@4.149.0 d1 create 5e-bug-board        # 출력된 database_id를 bug/worker/wrangler.jsonc에 넣고 커밋
npx wrangler@4.149.0 kv namespace create 5e-bug-images   # 출력된 id를 bug/worker/wrangler.jsonc의 kv_namespaces에 넣고 커밋
npx wrangler@4.149.0 d1 execute 5e-bug-board --remote --file bug/schema.sql --config bug/worker/wrangler.jsonc
npx wrangler@4.149.0 secret put ADMIN_TOKEN --config bug/worker/wrangler.jsonc   # 24자 이상 무작위 키, 따로 보관
npx wrangler@4.149.0 deploy --config bug/worker/wrangler.jsonc
```

배포된 주소가 `https://5e-bug-api.5e-desktop.workers.dev`인지 확인합니다(`bug/config.js`가 이 주소를 씁니다). 다르면 `bug/config.js`를 고쳐 커밋합니다.

그다음 GitHub에서 main 기준으로 `Bug Route` 워크플로를 실행합니다. `base_run`은 현재 게시된 성공한 Memo·Hub·Bug Route 또는 1.7.0 Preview 실행 번호입니다. 워크플로는 기존 공개 파일이 하나도 바뀌지 않았는지, 실제 Worker가 응답하고 다른 출처의 쓰기를 거부하는지 확인한 뒤에만 `/bug/`를 추가합니다.

## 검사

- `node --test tests/test-bug-board-api.mjs` — 권한·비공개 이미지·충돌·형식 검사(로컬 SQLite, Worker와 같은 계약)
- `node tests/test-bug-board-browser.cjs` — Chromium·WebKit 화면 흐름
- `node --test desktop/bug-publication.test.cjs` — 게시 범위·준비 확인
