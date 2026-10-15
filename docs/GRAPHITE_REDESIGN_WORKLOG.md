# 5E_image 그라파이트 재디자인 작업 기록

- 브랜치: `design/1.7.0/graphite-redesign` (기준: `feature/1.7.0/four-session-integration` @ 94466984)
- 작업 폴더: `/Users/parkseungyeon/Desktop/project/5e-design-system`
- 미리보기: `.claude/launch.json`의 `5e-design-system` (PORT 8894, scripts/preview-local-server.cjs)
- 확정 시안: `/Users/parkseungyeon/Desktop/project/5e-design-mockups/main.html`(5E_image), `index.html?v=4`(문항 작업실), `icons.html`(아이콘)
- 사용자 요청(2026-10-16 새벽): 최신 1.7.0에서 분기해 새 디자인을 **모든 패널·버튼에 일관되게** 완벽 적용. 밤새 진행. 사용량이 끝나면 5시 이후 이어서.

## 반드시 지킬 것
- 모든 대화·보고는 한국어.
- 기능·저장 데이터·id는 바꾸지 않는다(DESIGN.md 13-4). 마크업 이동은 id 유지.
- 어긋남 금지: 위쪽 막대 항목 세로 가운데, 패널 안 16px 시작선·끝선, 위쪽 막대 칸 경계 = 패널 경계, 패널 버튼은 상태와 상관없이 고정 위치. 바꿀 때마다 숫자로 측정.
- AGENTS.md: 수정 때마다 `index.html` 푸터 `[data-change-summary]` 배지 갱신(KST 날짜·시각), Safari에서 확인 후 보고. 푸시·배포 금지(로컬 커밋만).

## 확정 디자인 (시안 기준)
- 이름 **5E_image**: `5E`(Georgia 기울임 굵게 21px) + `_image`(IBM Plex 15px). 왼쪽 패널 폭 칸의 정가운데. 드롭다운 없음.
- 위쪽 막대 40px, 순서: [◧ 왼쪽 패널 버튼 · 맨 왼쪽 12px 고정] [5E_image] │ Pro|Lite │ ↶ ↷ │ 설정 파일 공유 튜토리얼 │ 자동정렬 격자 자유이동 캡처 🔍(기능 검색) …… 배율 │ [오른쪽 패널 폭 칸: ● ChatGPT 연결 ◐ ⛶ …… ◨ 오른쪽 패널 버튼 · 맨 오른쪽 12px 고정]
- 오른쪽 패널을 닫으면 ChatGPT·테마·전체화면 숨김. 패널을 닫으면 얇은 레일(52px): 왼쪽은 도구 1열, 오른쪽은 섹션 아이콘.
- 왼쪽 패널 160px(도구 3열, 버튼 높이 34), 오른쪽 224px. 섹션 제목은 글자 16px 시작, 접기 꺾쇠는 오른쪽 끝.
- 버튼: 테두리 없음 · 호버 옅은 면 · 선택 회색 면. 주요 버튼도 같은 회색 면. 파란 버튼 없음(그라파이트).
- 아이콘: 한 가족 선 아이콘(24칸, 1.5) — 메뉴 15 · 도구 17 · 위쪽 막대 18. 문자 기호(↶ ↷ ▤ ▦ ↥ ? ⓘ ▸) 금지.
- 기능 검색: 돋보기 아이콘, ⌘F·⌘K로 스포트라이트처럼 기능 검색(기존 Ctrl+K 명령 팔레트 활용).
- 작업대: 무늬 없음 + 원래 워터마크. 그라파이트 #35373b·5%, classic(남색) #0a0e14·4.5%.
- 글자 3단계 14 / 12.5 / 11. 높이 40 / 36 / 32 / 28. 움직이는 장식 효과 제거.

## 진행
- [x] 분기, 기준 화면 확인
- [x] `css/design-tokens.css` 규격 파일(팔레트 graphite/classic/light, 기존 변수 연결)
- [x] 규격 파일 연결(index.html), 팔레트 선택(localStorage `5e.palette`, 환경 설정 > 화면 > 화면 색)
- [x] 위쪽 막대 재배치(id 유지), Pro|Lite 세그먼트, 기능 검색 버튼 — 커밋 c3a4ae55
- [x] 왼쪽 도구 패널·속성 패널·페이지 탭·아래 기능 줄·푸터 — 커밋 bfa3f59c (16px 시작선 측정 확인)
- [x] 메뉴·대화상자·기능 검색(스포트라이트)·강조 면 대비·파란 고정색 보정 — 커밋 f520222f
- [x] 화이트 모드 눈금자 색(js/ruler.js), Lite 왕복 후 위쪽 막대 위치 유지 확인
- [x] Pro/Lite 막기는 실제 마우스 클릭만(키보드·.click()은 그대로 전환)
- [x] 테스트 기대값: undo 위치 `.toolbar-document #undo-btn`(preview-startup, lite-main)
- [x] 단위 테스트 1362 통과 / 0 실패
- [ ] 브라우저 테스트(playwright 필요 — 이 작업 폴더에 node_modules 없음, PLAYWRIGHT_MODULE 지정 필요)
- [ ] 패널 레일(52px): 지금은 기존처럼 0px로 접힘
- [ ] 아이콘 세트 교체(도구 패널·아래 기능 줄·속성 패널 아이콘)
- [ ] AI 패널·튜토리얼·로그인·문제 신고 세부 점검(색은 규격 변수로 이미 따라옴)
