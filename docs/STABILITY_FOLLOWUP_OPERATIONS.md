# 5E 안정화 후속 작업 기록

## 범위와 기준 — 2026-10-06

사용자는 라이브러리 속도 개선을 먼저 로컬 main의 1.6.2로 통합하고, 그 위에서 A1만 별도 작업 트리의 1.6.3 후보로 구현하도록 요청했다. A1 이후 main 병합·push·태그·배포·기기 설치·유료 AI 호출은 금지된다. 전체 릴리스 상태는 HOLD다.

시작 프롬프트: `/Users/parkseungyeon/.aside/u/0/sessions/2026-09-16_rKNWIu7453BF5amW/artifacts/5E-Codex-시작프롬프트.txt`
연결 인계서: 같은 폴더의 `5E-개선계획-Codex-인계.md`. 두 문서를 읽었다.
정식 소스 기준: `f50bb507acc4b29e1d3c56fdf2ed3431ebc7f206` (1.6.1, 원격 main과 일치 확인).
라이브러리 개선 기준: `c86b1fcb0dafa0c81f8bacdbf0ae34294faa315e` (`feature/1.7.0/library-speed`). 1.7.0 전체가 아니라 해당 개선을 정식 root 코드로 옮겼다.

## 1.6.2 라이브러리 통합

작업 폴더: `/Users/parkseungyeon/.codex/worktrees/5e-162-library-release/5E`.
PDF 페이지는 기존 사전 생성 이미지를 먼저 보여주고, 크롭은 미리보기에서 즉시 조작할 수 있게 한다. 원본으로 교체할 때 화면 위치·배율을 보존한다. 최종 삽입·객체화·AI 전송에는 원본 품질을 사용한다. 썸네일 동시 작업은 3개로 제한하고 지나간 검색의 대기 작업을 취소한다. 정식 소스의 연속 페이지 창 정리 동작을 보존했다.

실제 검사 (Node 24.21.0):
- `npm run test:unit`: 320/320 PASS, 실패 0.
- 정식 root 모듈 대상 `test-stable-library-progressive-crop-browser.cjs`: Chromium/WebKit 각각 8개 시나리오 PASS. 빠른 편집, 로딩 표시, 미리보기 크롭 승인, 원본 전환 위치 유지, 승인 크롭 원본 보강, 실패 재시도, 깨진 미리보기 대체, 지난 페이지 응답 무시.
- `npm run verify:release-identity`: 1.6.2 OK.
- `git diff --check`: PASS. Preview/mobile/고정 1.6.0 경로 변경 없음.
- 증거: 작업 폴더 `.omo/evidence/release162/unit.log`, `browser/test-stable-library-progressive-crop-browser/results.json` (로컬 비공개).

원래 로컬 main 폴더 `/Users/parkseungyeon/Documents/Codex/2026-09-06/x20/5E`는 오래된 `9dce8a6b1acf3949b8a033788626f4ec4a00ea5c`에 있고 18,474건의 기존 변경이 있다. 기존 파일·index를 덮어쓰지 않기 위해 그 폴더의 브랜치 이름만 `preserved/main-before-1.6.2-20261006`으로 보존하고, 검증한 별도 폴더에서 정식 기준 커밋의 main에 1.6.2를 fast-forward 병합한다. 보존 대상 상태의 SHA-256(상태 목록): `17ffba81b14f22f2c2eb6f3a73f1b314054ed77b896b0c1590902141654f2a31`. 이는 파일 내용 전체의 해시가 아니라 기존 변경 목록의 식별자다.

초기 카탈로그 로딩과 첫 원본 PDF 다운로드는 여전히 느릴 수 있다. 실서비스 배포·원격 push·태그 생성은 하지 않았다. 공개 stableWeb 1.6.1과 기존 HOLD 항목을 유지한다. 작업 브랜치와 실제 공개 버전을 구분한다.

## 다음 단계

이 통합본에서 별도 작업 트리를 만들어 A1(일반 .5e/.json 프로젝트 읽기 전 용량 제한)만 구현·검증하고 1.6.3 후보로 기록한다. A2 이미지 입력 제한은 이번 범위가 아니다.
