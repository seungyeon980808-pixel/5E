# 5E AI 프록시 배포 안내

이 폴더는 5E 앱의 AI 도우미가 쓰는 **중계 서버(Cloudflare Worker)** 입니다.
브라우저는 Pollinations를 직접 못 부르므로, 이 Worker가 대신 부르고 결과를 돌려줍니다.
비밀 토큰(sk_)은 이 Worker 안에만 저장되고, 브라우저·저장소에는 절대 들어가지 않습니다.

배포는 **대시보드 방식(CLI 불필요, 권장)** 을 추천합니다. 약 10~15분, 무료.

---

## A. 대시보드로 배포 (CLI 없이)

### 1) Cloudflare 무료 가입
- https://dash.cloudflare.com 에서 이메일로 가입 (신용카드 불필요)

### 2) Worker 만들기
- 왼쪽 메뉴 **Workers & Pages** → **Create** → **Create Worker**
- 이름을 `5e-ai-proxy` 로 짓고 **Deploy** (일단 기본 코드로 배포됨)

### 3) 코드 붙여넣기
- 방금 만든 Worker → **Edit code**
- 편집기의 기존 내용을 모두 지우고, 이 폴더의 **`worker.js`** 내용을 통째로 붙여넣기
- **중요**: `worker.js` 위쪽 `ALLOWED_ORIGINS` 목록에 5E 앱이 열리는 주소가 있는지 확인.
  - GitHub Pages로 배포한다면 본인 도메인(예: `https://<계정>.github.io`)이 맞는지 확인/수정
- 오른쪽 위 **Deploy** 클릭

### 4) 토큰을 Secret으로 등록
- Worker 상세 페이지 → **Settings** → **Variables and Secrets**
- **Add** → 타입을 **Secret** 으로:
  - 이름(Variable name): `POLLINATIONS_TOKEN`
  - 값(Value): 발급받은 `sk_...` 토큰
- **Save / Deploy**

### 5) 주소 복사
- Worker 페이지 상단의 주소를 복사합니다. 형태:
  `https://5e-ai-proxy.<본인계정>.workers.dev`
- 이 주소를 5E 앱의 AI 도우미 하단 **[프록시 설정]** 에 한 번 붙여넣으면 끝입니다.

---

## B. CLI로 배포 (wrangler, 익숙한 경우)

```bash
cd cloudflare-worker
npx wrangler login
npx wrangler secret put POLLINATIONS_TOKEN   # 물어보면 sk_ 토큰 붙여넣기
npx wrangler deploy
```

배포 후 출력되는 `*.workers.dev` 주소를 5E 앱 [프록시 설정]에 입력합니다.

---

## 동작 점검

배포가 끝나면 아래로 확인할 수 있습니다(주소는 본인 것으로 교체).
브라우저 콘솔이나 터미널에서:

```bash
curl -X POST "https://5e-ai-proxy.<계정>.workers.dev" \
  -H "Content-Type: application/json" \
  -H "Origin: https://<계정>.github.io" \
  --data '{"messages":[{"role":"user","content":"안녕, 한 단어로 답해"}]}'
```

정상이면 JSON 응답이 오고, `Origin` 헤더를 빼거나 다른 값으로 주면 403(허용되지 않은 출처)이 옵니다.

## 보안 메모

- 이 Worker는 `ALLOWED_ORIGINS` 에 있는 사이트에서 온 요청만 처리합니다.
- 토큰은 Secret으로만 보관되어 코드/깃/브라우저 어디에도 노출되지 않습니다.
- 토큰이 걱정되면 Pollinations 대시보드에서 언제든 재발급(rotate) 후 4)만 다시 하면 됩니다.
