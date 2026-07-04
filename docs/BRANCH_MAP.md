# 폴더 ↔ 브랜치 ↔ 역할 지도 (BRANCH_MAP.md)

> 2026-07-03 세션 교훈: "이 폴더 = 이 브랜치 = 이 역할"이 문서에 없으면 오진이 생긴다.
> 폴더에서 브랜치를 바꾸지 말 것. 브랜치가 필요하면 폴더를 만든다.

## 현재 지도 (2026-07-04)

| 폴더 (`51_5E\` 아래) | 브랜치 | 포트 | 역할 | 상태 |
|---|---|---|---|---|
| `5E_work_dev` | `work-dev` | 8000 | **주 개발 라인** — 리팩토링·버그픽스·버전 범프는 여기서만 | 활성 |
| `5E_image_dev` | `image-dev` | 8002 | 이미지→객체 연결 작업 전용 (git worktree) | 활성 |
| `5E` | `main` | 8080 | 배포 기준(GitHub Pages) | 병합 시에만 갱신 |
| `5E_obj_dev` | `object-dev` | 8001 | ~~오브젝트 개발~~ → **v0.40.0에 병합 완료, 구식** | 폐기 예정 |

## image-dev 브랜치 규칙 (병렬 작업 충돌 방지)

1. **`?v=` 버전 범프 금지** — 버전은 work-dev에서만 올린다. 테스트 시 캐시는 Ctrl+F5.
2. **수정 금지 파일**: `js/tools.js`, `js/inspector.js`, `js/render.js`, `js/render/*`, `js/inspector/*`
   (work-dev에서 분리 리팩토링 진행 중 — 겹치면 병합 지옥)
3. **수정 허용 범위**: `js/image-import-mock.js`, `js/image-objectify.js`, 신규 파일(`js/image-api.js` 등),
   `proxy/` 폴더(서버리스 프록시 — 새 폴더라 충돌 없음), `index.html`은 버튼/모달 추가 등 최소한만.
4. **수명 최대 2일** — 매일 저녁 work-dev에 병합하거나, work-dev를 image-dev로 당겨와서(git merge work-dev) 벌어지지 않게 유지.

## 서버 실행

```
cd C:\Users\user\Desktop\project\51_5E\5E_image_dev
python -m http.server 8002
```

브라우저 주소창의 포트로 지금 어느 폴더를 보고 있는지 항상 확인할 것 (8000=work-dev, 8002=image-dev).
