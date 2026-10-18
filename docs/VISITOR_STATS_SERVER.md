# 방문자 집계 서버

## 운영 서버 (2026-10-18 배포)

- **Cloudflare Worker `5e-visitor-stats`** — `https://5e-visitor-stats.5e-desktop.workers.dev/api/visitor-stats`
- 저장소: D1 `5e-visitor-stats` (`4a1580fd-b8bd-43ec-ad24-5a563a48ccf3`, 표는 `visitor/worker/migrations/0001_visitor_stats.sql`)
- 코드: `visitor/api.mjs`(API·저장소, 아래 계약과 같음), `visitor/worker/index.mjs`, `visitor/worker/wrangler.jsonc`. 검사 `tests/test-visitor-stats-worker.mjs`
- `index.html`의 `5e-visitor-stats-endpoint` 메타가 이 주소를 가리킨다(1.7.0 프리뷰만. 1.6.3 정식 화면에는 이 표시가 없다)
- HMAC 비밀값은 D1 `metadata` 표에 처음 요청 때 만들어 보존한다. **D1을 지우거나 비밀값만 바꾸면 같은 방문자가 다시 집계되므로 함부로 초기화하지 않는다**
- 요청 제한(주소당 분당 120회)은 Worker 인스턴스마다 따로 센다. 정확한 차단이 필요하면 Cloudflare 규칙을 쓴다
- 다시 배포: `npx wrangler@4 deploy --config visitor/worker/wrangler.jsonc` (표 변경은 `d1 migrations apply 5e-visitor-stats --remote --config …`)

## 로컬 Node 서버

`scripts/visitor-stats-server.cjs`는 Node.js **24.21.0 이상, 25 미만**의 내장 `node:sqlite`만 사용한다. 별도 패키지 설치가 필요하지 않다. 운영은 위 Worker를 쓰고, 이 서버는 로컬 확인·자체 호스팅용으로 남겨 둔다.

## 집계 기준

- `total`: 집계 시작 이후 한 번 이상 방문한 익명 브라우저 ID 수.
- `today`: 한국 시간(`Asia/Seoul`, UTC+9) 당일 방문한 서로 다른 익명 브라우저 ID 수.
- 같은 브라우저의 새로고침, 여러 탭, 동시 요청은 중복 집계하지 않는다. 다른 날짜에 재방문해도 누적은 증가하지 않는다.
- 브라우저 저장소 삭제, 다른 브라우저 또는 다른 기기는 별도 방문자로 집계된다. 사람의 정확한 인원수를 의미하지 않는다.
- 기존 방문 기록이 없으므로 새 데이터베이스는 0부터 시작한다. 과거 누적 방문 수를 추정하거나 채워 넣지 않는다.

프런트엔드는 `crypto.randomUUID()`로 만든 UUID v4 하나를 브라우저 저장소에 유지하고 방문 시 전송한다. 원본 UUID, IP, 이메일, 사용자 에이전트는 데이터베이스에 저장하지 않는다. UUID는 데이터베이스에 보존하는 비밀값으로 HMAC-SHA256 처리한 뒤 저장한다. 일별 중복 제거와 누적 중복 제거는 하나의 SQLite 트랜잭션에서 처리한다. 재시작 시 같은 DB와 비밀값을 그대로 사용한다.

## API / 프런트엔드 연결

두 메서드 모두 같은 경로를 사용한다.

```text
GET /api/visitor-stats
POST /api/visitor-stats
Content-Type: application/json
Origin: https://www.5e.ai.kr

{"visitorId":"91c9b7e4-42f2-4c20-bd89-e34c016dcc1a"}
```

정상 응답은 두 메서드 모두 아래 형식이며 숫자 필드는 JSON 숫자다.

```json
{"total":1,"today":1,"date":"2026-10-12","timezone":"Asia/Seoul"}
```

`GET`은 집계하지 않는다. `POST`를 반복해도 하루에 한 번만 반영된다. 응답은 `Cache-Control: no-store`이며 정확한 허용 Origin에만 CORS 헤더를 제공한다. 쿠키나 인증 자격 증명을 사용하지 않으므로 `credentials: 'omit'`로 요청한다. JSON 전송의 OPTIONS 사전 요청을 지원한다.

프런트엔드는 로컬 미리보기, 자동 검수, 파일/데스크톱 로컬 실행에서 POST를 보내지 않아야 한다. 운영 웹에서만 UUID를 생성·저장하고 방문을 전송한다. 이후 수치 갱신은 GET을 사용한다. 실패 시 숫자를 0으로 바꾸거나 기존 수치를 증가시키지 말고, 표시를 `—` 또는 최근 정상 응답으로 유지한다. `date`가 오늘과 다르면 이전 `today` 값을 오늘 이용자로 표시하지 않는다.

`js/visitor-stats.js`는 이 기준을 적용한다. `index.html`의 `5e-visitor-stats-endpoint` 메타 값은 기본 `/api/visitor-stats`이며, 별도 API를 배포하면 이 값을 HTTPS API URL로 변경한다. 새 한국 날짜에는 다시 방문을 기록하고, 같은 날짜의 갱신은 GET만 보낸다. 네트워크 요청은 앱 초기화가 끝난 뒤 실행하며 실패·시간 초과는 편집을 막지 않는다. 브라우저 저장소를 쓸 수 없으면 GET만 보내고 익명 방문을 부풀리지 않는다.

POST에는 반드시 명시적으로 허용한 Origin이 필요하다. 기본 허용 목록은 저장소의 운영 도메인인 `https://www.5e.ai.kr`, `https://5e.ai.kr`이다. 로컬 Origin은 기본적으로 거부한다. 알려진 봇/Headless UA, 자동화 도구, 빈 UA, prefetch 요청은 정상 수치를 반환하되 집계하지 않는다. 이는 기본 필터이며 Origin/UA를 위조하는 트래픽을 완전히 식별하는 인증 수단은 아니다.

## 실행과 영속 저장

macOS 기본 데이터 폴더는 `~/Library/Application Support/5E/visitor-stats`, Linux는 `${XDG_DATA_HOME:-~/.local/share}/5e/visitor-stats`, Windows는 `%LOCALAPPDATA%\5E\visitor-stats`다. 배포에서는 **웹 루트 밖의 전용 영속 볼륨**을 명시한다.

```sh
VISITOR_STATS_DATA_DIR=/var/lib/5e-visitor-stats \
VISITOR_STATS_ALLOWED_ORIGINS=https://www.5e.ai.kr,https://5e.ai.kr \
VISITOR_STATS_HOST=127.0.0.1 \
PORT=8796 \
/path/to/node-24.21.0 scripts/visitor-stats-server.cjs
```

프로젝트 루트에서 실행한다. `VISITOR_STATS_DATA_DIR`은 절대 경로여야 한다. 기본적으로 이 저장소 웹 루트 아래의 데이터 경로는 거부한다. 다른 웹 루트를 함께 사용하는 배포라면 `VISITOR_STATS_WEB_ROOT=/실제/웹루트`도 지정한다. DB 파일은 0600 권한으로 생성하며 서버는 정적 파일을 제공하지 않는다.

볼륨에는 `visitors.sqlite`와 SQLite의 `-wal`, `-shm` 파일이 생성될 수 있다. **DB를 Git, 웹 배포 산출물, 정적 공개 폴더에 넣지 않는다.** 배포 갱신과 재시작 때 같은 볼륨을 재사용한다. 비밀값만 교체하면 같은 방문자도 다른 해시로 집계되므로 DB와 비밀값을 분리해 초기화하지 않는다. 실행 중 백업은 SQLite backup API를 사용하고, 파일 복사 백업은 서버를 정상 종료한 후 수행한다.

기본 바인딩은 `127.0.0.1`이다. 컨테이너에서 외부 TLS 프록시가 접속해야 하면 `VISITOR_STATS_HOST=0.0.0.0`을 명시하고 서비스 네트워크를 제한한다. 자체 HTTPS 서버는 포함하지 않는다.

| 설정 | 기본값 | 용도 |
| --- | --- | --- |
| `PORT` | `8796` | 서버 포트; 테스트에서는 `0`으로 빈 포트 사용 가능 |
| `VISITOR_STATS_HOST` | `127.0.0.1` | HTTP 바인딩 주소 |
| `VISITOR_STATS_DATA_DIR` | 위 OS별 사용자 데이터 폴더 | DB와 비밀값을 보존할 전용 폴더 |
| `VISITOR_STATS_WEB_ROOT` | 이 저장소 루트 | 데이터 저장을 금지할 정적 웹 루트 |
| `VISITOR_STATS_ALLOWED_ORIGINS` | 위 운영 도메인 2개 | 쉼표로 구분한 정확한 HTTP(S) Origin; 와일드카드 불가 |
| `VISITOR_STATS_ALLOW_LOCAL` | 꺼짐 | `1`일 때만 허용 목록에 로컬 Origin을 넣을 수 있는 **테스트 전용** 예외 |
| `VISITOR_STATS_RATE_LIMIT` | `120` | 접속 피어당 한 윈도 안의 GET/POST 최대 요청 수 |
| `VISITOR_STATS_RATE_WINDOW_MS` | `60000` | 제한 윈도 길이(밀리초) |
| `VISITOR_STATS_BODY_LIMIT` | `1024` | POST 최대 바이트 수 |

속도 제한의 주소는 프로세스 내 임시 HMAC 키로만 보관하며 디스크에 기록하지 않는다. `X-Forwarded-For`를 신뢰하지 않는다. 프록시 뒤에서는 서버의 피어가 프록시 하나가 되므로 위 제한은 전체 트래픽 제한으로 작동한다. 운영 프록시에서 실제 클라이언트당 제한도 적용하고, 서버 한도는 예상 총 요청량에 맞게 설정한다. 무제한으로 높이지 않는다.

## 운영 URL 연결

정적 사이트만으로 이 서버를 실행할 수 없다. 지속 실행되는 Node 서비스와 영속 볼륨이 별도로 필요하다. 다음 두 방식 중 하나를 선택한다.

1. 사이트의 TLS 프록시가 `/api/visitor-stats`를 이 서버로 전달하도록 설정하고, 프런트엔드는 같은 Origin의 `/api/visitor-stats`를 사용한다.
2. 별도의 HTTPS 집계 API 호스트를 배포하고, 프런트엔드의 endpoint 설정에 해당 호스트의 `/api/visitor-stats`를 연결한다. 이 경우 프런트엔드 CSP `connect-src`에도 정확한 API 호스트를 허용해야 한다.

예를 들어 기존 `www.5e.ai.kr` Nginx 서버 블록 안의 경로 전달은 다음처럼 구성할 수 있다. 기존 사이트/AI API 설정을 덮어쓰지 않는다.

```nginx
location = /api/visitor-stats {
    proxy_pass http://127.0.0.1:8796;
    proxy_set_header Host $host;
    proxy_set_header Origin $http_origin;
    proxy_set_header User-Agent $http_user_agent;
    proxy_connect_timeout 2s;
    proxy_read_timeout 10s;
    client_max_body_size 1k;
}
```

프록시가 Origin을 운영 도메인으로 강제로 바꾸면 로컬 검수가 운영 방문으로 집계될 수 있으므로 **들어온 Origin을 그대로 전달한다**. 프록시의 별도 접속 로그 저장 정책도 확인한다. 서버 자체는 요청 식별자나 IP를 로그로 남기지 않는다.

정상적인 배포 순서는 영속 볼륨 준비 → Node 서비스 실행 → GET 정상 응답 확인 → 운영 HTTPS endpoint 연결 → 프런트엔드의 작은 푸터 표시 연결이다. 이 문서와 서버 구현은 배포 승인이 아니다.

## 오류와 검증

잘못된 Origin은 403, 잘못된 JSON/UUID는 400, 큰 본문은 413, JSON 이외의 형식은 415, 빈번한 요청은 429(`Retry-After` 포함), DB 실패는 503을 반환한다. DB 실패 응답에 파일 경로나 내부 오류를 노출하지 않는다. 읽기 오류를 정상 0으로 숨기지 않는다. 느린 POST 본문은 5초 후 408 처리하며 HTTP 시간 제한도 적용한다.

```sh
/path/to/node-24.21.0 --test tests/test-visitor-stats.cjs
```

검증 범위는 동시 중복 요청, 서로 다른 ID, KST 자정 경계, 재시작 및 여러 DB 연결의 중복 제거, 원본 ID/IP 비저장, 허용/로컬 Origin, 봇 제외, CORS, 본문 제한, 속도 제한, GET 무집계, DB 실패, CLI 재시작 보존이다.
