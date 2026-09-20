# 승인된 후속 수정 검증

범위: L8 점진적 문항 렌더링, U6 인스펙터/상단 배치, S2 직접 저장창, U7 AI 패널 토글, M4 공유 복사 버튼. 이전 완료 기능의 재설계는 포함하지 않는다.

## 실행 순서
1. 현재 코드 및 기존 증거 확인: 완료.
2. 다섯 요구 구현과 각각의 브라우저 검사: 완료.
3. 통합 화면 검증 및 독립 검토: 완료. WebKit 카드 행 겹침과 모바일 중복 닫기를 보완한 뒤 새 독립 검토 2건 PASS. 제품 SHA: 09f9858877746aeaf2a1cf51a14d8fb83d7b026a. 보고서 final-review-a.md, final-review-b.md.
4. 커밋·배포·실제 URL 일치 확인: 완료. GitHub Pages built, 변경 제품 15개 SHA-256 일치(deployed-files.json). 쿼리 없는 https://www.5e.ai.kr/preview/ 에서 Chromium/WebKit 4개 폭 및 실제 Safari 검사 PASS(deployed/).

## 검증
- 기본 단위 테스트 57개 통과. 수정 JS 문법 검사 및 git diff --check 통과.
- layout-check.cjs: Chromium/WebKit × 1440/1024/768/375. 인스펙터 오른쪽 고정, 왼쪽 드래그, ChatGPT 조작부는 캔버스 열, 가로 눈금자 표시, AI 상단 토글의 열림/닫힘 위치 유지. 150% UI 배율 드래그도 검증한다.
- real-library.json: 실제 제공 자료 전체 8,834개, 처음 DOM 60개, 스크롤 후 120개.
- library-*-dom.json: 80개 fixture에서 초기 60/추가 80, 순서·기존 DOM·선택·스크롤 유지 및 필터 초기화.
- ../save-direct: 11개 저장/설정 회귀 테스트, 클릭 사용자 활성화 안에서 native picker 호출, 추가 이름 모달 없음. OS 창 자체는 API fixture이며 OS UI 검증이라고 주장하지 않는다.
- ../save: Chromium/WebKit 실제 timestamp 이름 입력, 취소, 다운로드·재열기. Safari는 API가 없어 브라우저 다운로드 설정을 따른다.
- ../share/results.json: 복사 88px/컨테이너378px(모바일295px), 회전 각도 변화, hover, focus, 실제 클립보드 일치, 초록색 성공·정지, reduced motion. API는 로컬 fixture이며 외부 공유를 전송하지 않는다. 배경 편집기는 script-stripped fixture라 공유 창의 크기만 이 검사 범위다.
- 실제 Safari WebDriver에서도 가로 눈금자·경계·저장/취소 확인. 화면이 꺼져 처음 PNG가 검게 캡처되어 해당 캡처는 폐기하고 Safari 활성화 후 다시 생성했다. 브라우저/코드 오류가 아닌 캡처 과정 문제였다.
- 자동 LSP는 worktree가 요청 cwd 밖이라는 도구 오류로 실행되지 않았다. 코드 진단 오류로 해석하지 않으며, 실제 브라우저 JS 오류 검사와 Node 문법 검사로 별도 검증했다.

## 화면 검토
capture-manifest.json에 PNG 이름·크기·서명을 기록한다. contact-*.png는 각 뷰포트의 모든 상단 상태를 모은 판이며 원본 전체 화면도 같은 폴더에 있다. header-diff.json은 기존 1440px 화면과의 비교로, 의도된 상단 이동 외 기존 영역 변화가 작은지 확인한다. 사용자 첨부는 결함 설명이며 픽셀 복제 목표가 아니다.
