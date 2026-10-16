# 5E 1.7.0 Preview

공개 프리뷰 <https://www.5e.ai.kr/preview/> 는 2026-10-16에 `feature/1.7.0/four-session-integration`의 `c1e5b4a8b14901310f95b87e54911110a55ac240`으로 게시했습니다(main의 `Preview Release` 워크플로 run 38841354851). 변경 내용은 [1.7.0 프리뷰 요약](../docs/PREVIEW_NOTES_v1.7.0.md)을 보세요.

- 게시본은 이 폴더가 아니라 해당 커밋의 루트 `index.html`·`js`·`css`·`assets`·`fonts`·`vendor`를 `/preview/`로 옮겨 만듭니다. 이때 제목과 버전 표시가 `1.7.0 Preview`로, 모든 리소스 주소가 소스 커밋으로 고정됩니다(`scripts/preview-publication.cjs`).
- 게시 작업은 정식 루트(1.6.3)와 `/memo/`·`/hub/`·`/bug/`·`/1.6.0/` 등 다른 경로의 파일이 하나도 바뀌지 않았는지 해시로 대조한 뒤에만 Pages에 올립니다. 정식 편집기와 1.7.0 기능은 섞이지 않습니다.
- 이 폴더의 `index.html`은 로컬·브라우저 검사에서 `/preview/` 진입점을 재현하는 용도입니다.
- 브라우저 설정, IndexedDB, AI 세션 선택은 `5e.preview:` 접두사를 써서 정식 사이트의 데이터와 분리합니다. manifest는 상대 시작 주소와 범위를 쓰고, service worker는 등록하지 않습니다. 데스크톱 전용 로컬 연동은 데스크톱 앱이 필요합니다.
- 프리뷰의 문제 신고 버튼은 <https://5e.ai.kr/bug/> (별도 경로, Cloudflare Worker `5e-bug-api`)를 새 탭으로 엽니다. 편집기 그림·파일·로그를 자동으로 보내지 않습니다.

프리뷰 게시는 [`docs/RELEASE_HOLD.md`](../docs/RELEASE_HOLD.md)의 설치판 보류 조건을 해제하지 않습니다.

## 이전 기록

2026-09-26에 관찰한 1.6.0 Preview는 Pages 소스 `codex/preview-1.6.0:/`의 `09f94d830a7cec15632aa5286f6cffbe58e5f39f`였습니다. 당시 후보 문서 기준 구현은 `8d98bab0f5c9f762a6d8ed6ca8c50e4e369d4013`이었고, 최종 출시 SHA가 아닙니다.
