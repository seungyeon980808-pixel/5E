# 5e-google-drive-gateway — 드라이브 공개 폴더 게이트웨이

드라이브에 「링크가 있는 모든 사용자」로 공유한 폴더에서 PDF·JSON만 골라 내려 주는 Worker입니다. 드라이브 API 키는 Worker 비밀값으로만 갖고 있고, 응답에는 키가 나가지 않습니다.

## 이 폴더의 소스가 어디서 왔나 (11-19)

- 지금 배포된 판은 **버전 `19c7cef6`(2026-11-03, OmO 「경로 조각별 조회로 Too many subrequests 해결」)**입니다. 이 판의 소스 폴더(`~/Work/2026-11-02_5e-omo-인계/gateway/fix/`)는 지워져서 어디에도 없었습니다.
- 11-19에 `npx wrangler@4 init --from-dash 5e-google-drive-gateway`로 배포본을 받았습니다(읽기만). 받은 묶음 `worker.js`의 소스맵에 원본 `worker.mjs`가 그대로 들어 있어 그것을 꺼냈습니다.
  - 이 폴더에서 `npx wrangler@4 deploy --dry-run --outdir <임시>`로 묶은 결과가 배포본 `worker.js`와 주석 줄을 빼고 같습니다.
- `wrangler.jsonc`의 값은 배포본 설정(`name`·`compatibility_date 2026-09-15`·`workers_dev`·`preview_urls`) 그대로이고, `account_id`만 다른 `cloudflare/*` 설정처럼 적었습니다.
- 9월 첫 판은 비공개 보관 저장소 `5E-archive`의 `backup/20261028/5E-integration-hub` 갈래 `services/google-drive-gateway/`(커밋 `fd75e8a8`·`3cc6d833`)에 있습니다.

### 9월 판과 다른 점

| | 9월 판(`fd75e8a8`) | 지금 배포본(`19c7cef6`, 이 폴더) |
|---|---|---|
| 파일 찾기 | 폴더 전체를 훑어(깊이 8, **1,024개 한도**) 경로 → 파일 id 표를 만들어 5분 기억 | **요청한 경로만 조각마다** `name = '…' and '<부모>' in parents`로 찾음(요청당 드라이브 조회 최대 32번) |
| 기억 | 폴더마다 표 하나 | 경로마다 5분, 최대 256개(넘으면 가장 오래된 것부터 버림) |
| 이름 | NFC로만 비교 | NFC·NFD 둘 다 물어봄(맥에서 올린 분해형 한글 이름) |
| 같은 이름 | 표 만들 때 409 | 찾을 때 409(`AMBIGUOUS_PATH`) |
| 바뀐 까닭 | 하위 폴더가 많은 큰 폴더를 훑다가 「Too many subrequests」(무료 Worker 요청 한 번에 외부 호출 50개)로 실패 | — |

응답 머리글·오류 JSON 모양은 두 판이 같습니다.

## 주소

```
GET|HEAD https://5e-google-drive-gateway.5e-desktop.workers.dev/v1/google-drive/folders/<폴더 id>/public/<폴더 안 경로>
GET|HEAD …/folders/<폴더 id>/resource/<resourceKey>/<폴더 안 경로>
```

- PDF(`application/pdf`)와 JSON만 내려 줍니다. 다른 파일·폴더는 404.
- `OPTIONS`는 204, 그 밖의 방법은 405.

## 5E에서 쓰는 곳

| 곳 | 무엇 |
|---|---|
| `assets/pdf-library/google-drive.json` | `gatewayBaseUrl` — 라이브러리 「5E 제공」 공유 폴더(`1N46Woe4…`) |
| `js/pdf-library/static-mirror.js` | 정적 Worker `5e-exam-pdf`를 먼저 쓰고, 없으면 이 게이트웨이로 넘어감 |
| `assets/exampool/convert/es/drive-source.mjs` | `PUBLIC_BASE`(5E 공유 폴더)·`EXPANSION_BASE`(기출확장_국영수사탐 `1ckc6lPT…`) — 기출 탐색기와 같은 코드 |

기출확장을 정적 Worker로 옮기는 준비는 `cloudflare/exam-ext/README.md`에 있습니다.

## 비밀값

| 이름 | 무엇 | 넣는 법 |
|---|---|---|
| `GOOGLE_DRIVE_API_KEY` | 구글 드라이브 API 키(공개 파일 읽기용) | `npx wrangler@4 secret put GOOGLE_DRIVE_API_KEY --config cloudflare/google-drive-gateway/wrangler.jsonc` |

소스와 이 저장소에는 키가 없습니다. 지금 배포본에 등록된 비밀값은 이것 하나뿐입니다(`wrangler secret list`, 11-19). 없으면 503 `GATEWAY_NOT_CONFIGURED`를 돌려줍니다.

## 검사

```
node --test cloudflare/google-drive-gateway/worker.test.mjs
```

9월 검사 2개(키가 응답에 안 나감, 잘못된·쓰기 요청 거절)를 이 판에 맞추고, 3개(중첩 경로·NFD 이름, 같은 이름 409, 키 없음 503)를 더했습니다. `tests/suite-manifest.json`에는 아직 넣지 않았습니다.

## 다시 올릴 때 (사용자 승인 뒤에만)

```
cd cloudflare/google-drive-gateway
npx wrangler@4 deploy --dry-run --outdir /tmp/gw   # 먼저 묶음만 확인
npx wrangler@4 deploy
```

비밀값은 다시 올려도 그대로 남습니다.
