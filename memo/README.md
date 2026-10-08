# 5E 메모

`https://5e.ai.kr/memo/`에서 사용하는 공유 메모장입니다. 화면은 GitHub Pages, 데이터와 Google 로그인은 Supabase를 사용합니다. 처음에는 빈 작업판이며 예시 메모를 서버에 넣지 않습니다.

## 현재 연결 상태

동기화 클라이언트, 서버 규칙, 테스트, 기존 사이트를 보존하는 배포 워크플로를 구현했습니다. 실제 Supabase 프로젝트 및 Google OAuth 설정은 아직 연결하지 않았습니다. `config.js`의 빈 값은 의도적인 미설정 상태입니다. 이 상태에서는 저장하거나 배포 성공을 표시하지 않습니다.

## 프로젝트 연결

1. Supabase 프로젝트에 `supabase/migrations/20261009010000_memo.sql`을 적용합니다.
2. 관리자 권한으로 `private.memo_owners`에 실제 주인장 Google 이메일을 소문자로 등록합니다. 처음 로그인한 사람이 주인장이 되는 방식은 사용하지 않습니다.
3. Google Cloud에서 웹 OAuth 클라이언트를 설정합니다. 웹 출처는 `https://www.5e.ai.kr`, `https://5e.ai.kr`이며, Google 리디렉션 URI는 해당 Supabase 프로젝트의 `/auth/v1/callback`입니다. 클라이언트 ID와 비밀 키는 Supabase Google 제공자 설정에만 저장합니다.
4. Supabase Auth의 Site URL은 `https://www.5e.ai.kr/memo/`, 허용 리디렉션 URL은 이 주소와 `https://5e.ai.kr/memo/`입니다. 로컬 OAuth 시험을 할 때만 실제 미리보기 주소의 `/memo/`를 추가합니다.
5. `memo/config.js`에 공개 프로젝트 URL과 publishable key(또는 기존 anon key)를 넣습니다. service-role/secret 키는 여기에 넣지 않습니다. 배포 시 같은 공개 값을 GitHub repository variables `MEMO_SUPABASE_URL`, `MEMO_SUPABASE_PUBLISHABLE_KEY`로 지정할 수도 있습니다.
6. 서로 다른 브라우저에서 실서버 메모 작성·수정·삭제, Google 주인장 로그인, 다른 계정의 보관함 거부를 확인한 뒤 `Memo Route` 워크플로를 실행합니다. `base_run`은 **현재 배포된** 성공한 OurDocs Route 또는 Memo Route 실행 번호여야 합니다.

Google 설정: https://supabase.com/docs/guides/auth/social-login/auth-google

## 저장 규칙

- 방문자는 로그인 없이 최근 24시간의 같은 작업판을 읽고 수정합니다.
- 메모를 포스트잇으로 꺼내면 같은 레코드를 전환합니다. 최초 작성 시간은 유지됩니다.
- 최초 작성 시간은 서버만 지정합니다. 수정·이동·색상 변경으로 공개 시간을 늘릴 수 없습니다.
- 24시간이 지난 메모와 포스트잇은 데이터베이스 RLS가 숨깁니다. 지정한 이메일의 검증된 Google identity만 보관함을 읽습니다.
- Realtime 이벤트는 새 조회를 요청하는 신호로만 사용합니다. 이벤트에 담긴 과거 내용은 화면에 사용하지 않습니다. 주기적 조회와 창 포커스 복귀로 누락된 변경도 갱신합니다.
- 메모 작성 중 내용과 미완료 포스트잇 수정은 해당 브라우저에 임시 보관합니다. 공개 메모 전체나 주인장 보관함을 로컬에 캐시하지 않습니다. 저장 실패는 성공으로 표시하지 않습니다.
- 동시에 수정한 메모는 버전 충돌을 알립니다. 사용자가 `다시 시도`하면 최신 서버 버전을 기준으로 자신의 수정 필드만 다시 적용합니다.

## 검사

```sh
npm ci --prefix memo
npm test --prefix memo
node --test desktop/memo-publication.test.cjs
# Playwright가 설치된 환경
node memo/tests/browser.mjs
```

데이터베이스 검사는 PGlite의 실제 PostgreSQL 엔진에서 익명/다른 Google 계정/주인장 역할을 전환하여 실행합니다. 브라우저 검사는 실제 화면과 Supabase SDK를 같은 엔진에 연결한 로컬 계약 검사입니다. Google identity와 OAuth endpoint는 시험용 fixture이며 실제 Google 로그인을 검증했다는 의미가 아닙니다.

배포는 기존 Pages artifact의 모든 파일 해시를 먼저 확인하고 메모 자산만 추가합니다. 서버 준비 검사와 Google 제공자 활성화 검사를 통과하기 전에는 게시하지 않습니다. `_work`의 로컬 결과물, 데이터베이스 마이그레이션, npm 의존성 폴더는 사이트에 게시하지 않습니다. 이후 전체 웹 릴리스에도 메모 자산을 포함하도록 배포 목록에 등록했습니다.

## 화면

어두운 보라·남색 작업판, 600px 메모 도구와 212px 포스트잇을 유지합니다. 제목은 선택이며 데스크톱에서는 포스트잇을 드래그 또는 방향키로 이동합니다. 좁은 화면에서는 편집할 수 있는 목록으로 정렬됩니다. 글꼴은 Pretendard Variable 1.3.9(OFL), Supabase SDK는 2.117.3(MIT)입니다.
