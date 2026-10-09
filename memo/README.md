# 5E 메모

`https://5e.ai.kr/memo/`의 공유 메모장입니다. 화면은 GitHub Pages, 저장 API는 Cloudflare Workers, 메모 데이터는 D1을 사용합니다. 공개 작업판에는 로그인 없이 메모와 링크를 적습니다. 제목은 선택이고 포스트잇을 편집·이동할 수 있습니다.

## 연결 구성

- Worker: `5e-memo-api`, D1: `5e-memo`. 기존 서비스와 별개로 생성합니다.
- `memo/worker/wrangler.jsonc`: 실제 Cloudflare 계정과 D1 바인딩, 공개 Google 웹 클라이언트 ID.
- `OWNER_EMAIL`: Workers secret에 지정한 주인장 Google 이메일을 저장합니다. 처음 로그인한 사람이 주인장이 되지 않습니다.
- `memo/config.js`: 공개 Worker URL과 Google 클라이언트 ID만 포함합니다. Cloudflare 토큰, Google 비밀 키, 이메일은 웹 자산에 넣지 않습니다.
- Google 웹 클라이언트의 허용 JavaScript 출처에 `https://www.5e.ai.kr`, `https://5e.ai.kr`가 필요합니다. 기존 Google 리디렉션 설정은 유지합니다.

## 서버 준비와 배포

```sh
npm ci --prefix memo
npm test --prefix memo
node memo/tests/browser.mjs
node scripts/memo-worker-config.cjs
memo/node_modules/.bin/wrangler d1 migrations apply DB --remote --config memo/worker/wrangler.jsonc
npm run deploy:worker --prefix memo
memo/node_modules/.bin/wrangler secret put OWNER_EMAIL --config memo/worker/wrangler.jsonc
```

실제 서버와 Google 로그인을 확인한 뒤 GitHub의 `Memo Route` 워크플로를 실행합니다. `base_run`은 현재 게시된 성공한 OurDocs Route 또는 Memo Route 실행 번호입니다. 기존 사이트의 파일 해시를 확인하고 메모의 7개 자산만 덧붙입니다. 이후 전체 웹 배포에도 같은 자산이 포함됩니다. 설정을 덮어쓸 경우 공개 repository variables `MEMO_API_URL`, `MEMO_GOOGLE_CLIENT_ID`를 사용합니다.

## 저장과 동기화

- 메모와 포스트잇은 같은 D1 레코드입니다. 포스트잇으로 전환하거나 내용·색상·위치를 바꿔도 최초 작성 시간은 유지됩니다.
- 작성 시간은 데이터베이스가 지정합니다. 서버 조회·수정·삭제 모두 최초 작성 후 24시간 경계를 검사합니다. 화면에서만 숨기는 방식이 아닙니다.
- 24시간이 지난 내용은 계속 D1에 보관하고, 지정한 Google 계정만 보관함을 조회할 수 있습니다.
- Google ID 토큰의 서명, 발급자, 클라이언트 ID, 유효 시간, 이메일 인증 여부를 Workers에서 검증합니다. 서명된 계정 이메일을 주인장과 비교합니다.
- Google 로그인 토큰은 해당 탭의 sessionStorage에만 저장하며 로그아웃·만료 때 지웁니다. 보관함 내용은 브라우저 저장소에 캐시하지 않습니다. 로그아웃 전에 시작한 응답도 다시 보관함을 열지 못합니다.
- 열린 화면은 5초마다 조회하고, 창 포커스·다시 연결·저장 직후에도 갱신합니다. 실시간 소켓 서비스는 사용하지 않습니다.
- 작성 중인 내용과 미완료 포스트잇 수정만 localStorage에 임시 보관합니다. 실패한 저장을 성공으로 표시하지 않습니다.
- 동시 수정은 레코드 버전으로 검사합니다. `다시 시도`는 새 서버 버전에 자신의 수정 필드를 적용합니다. 생성 UUID를 재사용해 재시도로 중복 메모가 생기지 않습니다.
- SQL, Worker 코드·npm 의존성·로컬 증거는 GitHub Pages에 게시하지 않습니다. 웹에서는 D1을 직접 호출하지 않습니다.

## 검증 범위

자동 검사는 workerd와 SQLite D1의 격리된 환경에서 실제 Worker 코드를 실행합니다. Google RSA 키와 토큰은 시험용 fixture이고, 실제 Google 제공자 로그인을 증명하지 않습니다. 브라우저 검사는 Chromium·WebKit 및 데스크톱·휴대폰 크기에서 기기 간 공유, 제목·복사·포스트잇, 실패·재시도·충돌, 서버 시간 경계, 보관함·로그아웃·만료를 확인합니다. 실제 연결과 게시 상태는 배포 결과 및 실서버 검사로 별도 확인합니다.

## 화면

600px의 컴팩트한 메모 도구와 212px 포스트잇, 어두운 보라·남색 공간감을 유지합니다. 데스크톱은 드래그·방향키 이동을 지원하고 좁은 화면은 편집 가능한 목록으로 정렬합니다. 글꼴은 Pretendard Variable 1.3.9(OFL)입니다.
