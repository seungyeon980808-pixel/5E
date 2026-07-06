# 도구 UX 개편 백로그 (2026-07-06)

> `refactor/engine-core`(타입 레지스트리 + tools.js 분리 + 폰트 WOFF2)를 허브에 병합한 뒤,
> **별도 브랜치**에서 진행할 QA 후속 작업. 아래 8건은 리팩토링 회귀가 아니라 **기능 변경 요청**이다.
> (①②는 리팩토링 이전 동작을 그대로 보존한 상태에서 "바꿔달라"는 요청, ③~⑧은 신규 기능.)

## 진행 방식
- 허브 병합 완료 후 허브에서 새 브랜치(예: `feat/tool-ux-revamp`) 분기.
- 나머지 feat/* 브랜치는 허브로 통일(모두 옛 허브 HEAD라 fast-forward).
- 각 항목 브라우저 스모크 테스트(그리기·단축키·저장/불러오기)로 검증 후 커밋.

## 확정 항목

### ① 라벨러 입력 = 텍스트 도구와 동일
- 현재: 라벨러는 `_openSmallTextEditor`(전용 폰트/크기·빠른문자), 텍스트 도구는 `_openUnifiedTextEditor`.
- 변경: 라벨러도 `_openUnifiedTextEditor`를 옵션(`isLabeler`)으로 열게 통일. 커밋 경로엔 이미 라벨러 분기 있음(p1/p2·labelSize 스키마 유지). 통합 후 `_openSmallTextEditor` 제거.
- 파일: `js/text-editor.js`, `js/tools/click-placement.js(commitLabeler)`. 위험 中.

### ② 자유그리기 기본값
- `js/tools/free-draw.js` 커밋 객체: `strokeLevel 0→255`, `strokeWidth 0→0.2`, 채움 흰색(현 `fillLevel:255` 유지). 위험 低.

### ③ Shift+상하 방향키로 선 굵기 ±0.1mm
- `js/transform.js:783` 방향키 핸들러 맨 앞에 분기: `Shift+ArrowUp/Down` → 선택된(굵기 있는) 개체 `strokeWidth` ±0.1(최소 0), 첫 키다운에 undo 스냅샷. 현재 Shift+방향키 미사용. 위험 低~中.

### ⑤ 자르기 단축키 E
- `js/tools.js:235` `key==="k"→CUT`를 `key==="e"`로. (현재 자르기는 K에 매핑돼 있음. E는 미사용.) 위험 低.

## 결정 필요 항목

### ④ 각도 도구 통합 (A=호, Shift+A=직각, Tab 전환)
- `js/tools.js:226` `a`를 shift 분기(무shift=호, Shift+A=직각). 직각의 Shift+G는 폐기(Shift+A로 이전; 마침 Shift+G는 그룹해제와 충돌하던 키).
- ARC/RIGHTANGLE 도구 켜진 상태에서 Tab 키다운 → 두 변형 토글(preventDefault). 새 상호작용 핸들러 추가.
- **결정**: Shift+G를 직각 별칭으로 남길지 → **권장: Shift+A로만**.

### ⑥ 좌표축(X) 삭제 — 공통 도구
- `js/templates.js:41` axes 레지스트리 제거 + `js/tools.js:225` X 단축키 제거(버튼 자동 사라짐).
- **결정**: `axes` **타입**(렌더/픽/인스펙터/object-types 분류)은 유지할지 → **권장: 유지**(옛 저장파일 호환, 위험 低). 완전 제거는 그 파일 깨질 수 있어 비권장.

### ⑦ 좌표평면 삭제 — ⚠️ 완전 삭제 불가
- `js/function-graph/insert.js:26-30`: 함수그래프 삽입 시 선택된 좌표평면이 없으면 **좌표평면을 자동 생성**하고 그 좌표계로 함수를 샘플링. 즉 **함수그래프는 좌표평면 위에서만 존재**.
- 가능: `함수` 카테고리의 **"좌표평면" 독립 생성 버튼만 제거**(`js/templates.js:73`).
- 유지 필수: `coordplane` 타입·`makeDefaultCoordplane`·렌더·좌표평면 인스펙터(자동 생성 평면 편집용).
- **결정**: 이 해석("독립 버튼만 삭제, 타입은 함수 토대로 유지") 확인 필요.

### ⑧ 함수 입력 → 공통 도구 + 단축키 F — ⚠️ F 충돌
- `js/templates.js:89` funcgraph `category "함수"→"공통"` + 단축키 F.
- 충돌: **F는 현재 자유그리기**(`js/tools.js:238`).
- **결정(필수)**: F를 함수입력에 주면 자유그리기는 (a) 버튼 전용 / (b) 다른 키(D·W·B·Z 등)?
- ⑦⑧ 후 `함수` 카테고리는 비므로 섹션 사라짐.

## 확인 대기 중인 4가지 결정
| # | 결정 | 권장 |
|---|---|---|
| ⑧ | F 충돌 시 자유그리기 처리 | 버튼 전용(또는 지정 키) |
| ⑦ | 좌표평면 = 독립버튼만 삭제·타입 유지 | 예 |
| ⑥ | 좌표축 = 생성만 제거·타입 유지 | 예 |
| ④ | 직각 Shift+G 별칭 유지 | Shift+A로만 |
