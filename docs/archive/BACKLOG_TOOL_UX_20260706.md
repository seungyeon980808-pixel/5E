# 도구 UX 개편 백로그 (2026-07-06)

> `refactor/engine-core`(타입 레지스트리 + tools.js 분리 + 폰트 WOFF2)를 허브에 병합한 뒤,
> **별도 브랜치**에서 진행할 QA 후속 작업. 아래 8건은 리팩토링 회귀가 아니라 **기능 변경 요청**이다.
> (①②는 리팩토링 이전 동작을 그대로 보존한 상태에서 "바꿔달라"는 요청, ③~⑧은 신규 기능.)

## 진행 방식
- 허브 병합 완료 후 허브에서 새 브랜치(예: `feat/tool-ux-revamp`) 분기.
- 나머지 feat/* 브랜치는 허브로 통일(모두 옛 허브 HEAD라 fast-forward).
- 각 항목 브라우저 스모크 테스트(그리기·단축키·저장/불러오기)로 검증 후 커밋.

## 확정 항목

### ① 라벨러 입력 = 텍스트 도구와 동일 — ✅ 이미 완료 상태였음 (2026-07-06 확인)
- 이 문서를 쓸 때의 전제("라벨러는 현재 `_openSmallTextEditor` 사용")가 낡아 있었다.
  실제로는 `git log -S`로 확인 결과 v0.44.0(`tools.js`→`text-editor.js` 추출) 때 이미
  라벨러가 `openLabelerTextEditor()`를 통해 `_openUnifiedTextEditor`를 쓰도록 끝나 있었다
  (`js/text-editor.js:87-110`, 생성 경로 `js/tools/click-placement.js:326`, 더블클릭
  재편집 경로 `js/tools.js:391`). 커밋 경로도 `editingType==="labeler"` 분기로
  p1/p2·labelSize·textRuns·fontFamily를 정확히 보존한다(`js/text-editor.js:1345-1368`).
- `_openSmallTextEditor`는 지금 **각도 호(anglearc) 라벨/기호 편집 전용**으로만 남아있고
  (`openAngleArcLabelEditor`, `js/text-editor.js:111-112`) 이건 별개 기능이라 건드리지 않음
  — 문서가 시킨 대로 삭제했다면 각도 라벨 편집이 깨졌을 것.
- 브라우저 스모크로 라벨러 두 클릭 생성 → "라벨 텍스트 입력" 제목의 통합 에디터
  (`.unified-text-editor`) 오픈 확인, Esc 취소 확인. 코드 변경 없음.

### ② 자유그리기 기본값
- `js/tools/free-draw.js` 커밋 객체: `strokeLevel 0→255`, `strokeWidth 0→0.2`, 채움 흰색(현 `fillLevel:255` 유지). 위험 低.

### ③ Shift+상하 방향키로 선 굵기 ±0.1mm
- `js/transform.js:783` 방향키 핸들러 맨 앞에 분기: `Shift+ArrowUp/Down` → 선택된(굵기 있는) 개체 `strokeWidth` ±0.1(최소 0), 첫 키다운에 undo 스냅샷. 현재 Shift+방향키 미사용. 위험 低~中.

### ⑤ 자르기 단축키 E
- `js/tools.js:235` `key==="k"→CUT`를 `key==="e"`로. (현재 자르기는 K에 매핑돼 있음. E는 미사용.) 위험 低.

## 결정 확정 (가정 명시 — 되돌리기 싼 결정이라 확인 없이 진행, 새 세션에서 발견 시 뒤집기 쉬움)

### ④ 각도 도구 통합 (A=호, Shift+A=직각, Tab 전환)
- `js/tools.js:226` `a`를 shift 분기(무shift=호, Shift+A=직각).
- **확정**: 직각의 기존 Shift+G는 **폐기**(Shift+A로만 이전). Shift+G는 그룹해제와 충돌하던 키라 정리 이점도 있음.
- ARC/RIGHTANGLE 도구 켜진 상태에서 Tab 키다운(preventDefault) → 두 변형 토글. 새 상호작용 핸들러 추가.

### ⑥ 좌표축(X) 삭제 — 공통 도구
- `js/templates.js:41` axes 레지스트리 제거 + `js/tools.js:225` X 단축키 제거(버튼 자동 사라짐).
- **확정**: `axes` **타입**(렌더/픽/인스펙터/object-types 분류)은 **유지**(옛 저장파일 호환, 위험 低). 삭제하는 건 "생성 버튼/단축키"뿐.

### ⑦ 좌표평면 삭제 — ⚠️ 완전 삭제 불가
- `js/function-graph/insert.js:26-30`: 함수그래프 삽입 시 선택된 좌표평면이 없으면 **좌표평면을 자동 생성**하고 그 좌표계로 함수를 샘플링. 즉 **함수그래프는 좌표평면 위에서만 존재**.
- **확정**: `함수` 카테고리의 **"좌표평면" 독립 생성 버튼만 제거**(`js/templates.js:73`, symbolId `coordplane`).
- 유지 필수: `coordplane` **타입**·`makeDefaultCoordplane`·렌더(`js/render/coordplane.js`)·좌표평면 인스펙터(`section-coordplane.js`) — 함수그래프가 삽입될 때 내부적으로 자동 생성해 쓰는 토대이므로 절대 건드리지 않는다.

### ⑧ 함수 입력 → 공통 도구 + 단축키 F — ⚠️ F 충돌
- `js/templates.js:89` funcgraph `category "함수"→"공통"` + 단축키 F 부여.
- 충돌 해소: **F는 현재 자유그리기**(`js/tools.js:238`) → **확정**: 자유그리기는 버튼 전용으로 전환, 단축키 F는 회수해 함수입력에 재할당. (자유그리기 자체는 삭제하지 않음, 단축키만 뺌)
- ⑦⑧ 완료 후 `함수` 카테고리 항목이 없어지므로 좌측 패널에서 그 카테고리 섹션 자체가 사라짐(정상).

## 구현 순서 제안
1. **②③⑤** (독립·저위험, 한 배치로 묶어 처리): 자유그리기 기본값 → Shift+방향키 굵기 → 자르기 E
2. **⑧→⑥→⑦** (묶어서, 좌측 패널 재편 순서. ⑧을 먼저 해서 F를 자유그리기에서 회수한 뒤 나머지 정리): 함수입력 공통이동+F → 좌표축 삭제 → 좌표평면 버튼 삭제
3. **④** (독립, Tab 상호작용 신규라 별도 검증)
4. **①** (가장 무거움 — text-editor.js 편집기 통합, 마지막에 단독 진행 권장)

각 항목 완료 후 브라우저 스모크 테스트(그리기·단축키·저장/불러오기) 후 커밋. 항목 간 의존 없으므로 순서 조정 가능.
