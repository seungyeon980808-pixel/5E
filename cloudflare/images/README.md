# 5e-images — 그림 세 묶음 Worker (초안, 아직 올리지 않음)

5E가 쓰는 그림 세 묶음을 저장소·사이트 대신 Cloudflare Workers 정적 파일로 내보내기 위한 준비입니다.

| 묶음 | 저장소 위치 | Worker 경로 | 개수·크기(11-16) |
|---|---|---|---|
| 쪽 미리보기 | `assets/pdf-library/previews/<sha>/<쪽>[-thumb].webp` | `previews/…` | 4,026개 · 121MB |
| 과학 부품 SVG | `assets/parts-library/svg/<파일>.svg` | `parts/…` | 4,374개 · 120MB |
| 기출 문항 그림 | `assets/exam-library/images/<id>.png` | `exam/…` | 3,955개 · 299MB |

합계 12,355개(무료 한도 Worker당 2만 개의 62%), 한 파일 25MiB 넘는 것 없음.

## 주소는 한 곳에서

앱의 그림 주소는 모두 `js/library/image-hosts.js`가 만듭니다. 지금 `IMAGE_WORKER_BASE`는 빈 값이라 1.7.0과 같은 주소를 씁니다.

- 웹: 같은 사이트의 `assets/…` 상대 경로
- 설치판: 쪽 미리보기·기출 문항 그림은 설치 파일에 없으므로 `https://www.5e.ai.kr/assets/…`에서 받음. 부품 SVG는 설치 파일에 들어 있음
- 기출 카드 그림(`exam-search` 저장소)은 이 Worker와 상관없이 그대로

## 올리는 순서 (사용자 승인 뒤)

1. 묶음 만들기: `node data/images/build-bundle.mjs` → `data/images/out/site/` (링크만, 복사 안 함)
2. 올리기: `cd cloudflare/images && npx wrangler@4 deploy --config wrangler.jsonc`
3. 확인: `curl -sI https://5e-images.<계정 하위 주소>.workers.dev/previews/<sha>/1.webp` 가 200이고 `access-control-allow-origin: *`인지, `parts/`·`exam/`도 하나씩
4. 주소 바꾸기: `js/library/image-hosts.js`의 `IMAGE_WORKER_BASE`에 Worker 주소(끝에 `/`)를 넣음 — 이 한 줄만
5. 웹 검사·설치판 검사 뒤 배포

## 주의

- **사이트의 `assets/pdf-library/previews`·`assets/exam-library/images`는 바로 지우지 않습니다.** `IMAGE_WORKER_BASE`가 빈 1.7.1 설치판은 쪽 미리보기·기출 문항 그림을 `www.5e.ai.kr`에서 받습니다. 설치판 사용자가 Worker 주소가 들어간 판으로 업데이트한 뒤에 사이트에서 뺍니다.
- 부품 SVG를 웹에서 Worker로 돌리면 `js/parts-library.js`(`LIB_BASE`)와 `js/ai-reference-search.js`도 `partsSvgUrl()`을 써야 합니다(1.7.1 갈래 C 보고서 「맡은 파일 밖」).
- 쪽 미리보기는 PDF sha로 이름이 정해져 내용이 바뀌지 않으므로 오래 캐시(`immutable`)합니다. 다시 만들면 앱의 `PREBUILT_PREVIEW_REVISION`(`js/library/provider.js`)을 올립니다.
