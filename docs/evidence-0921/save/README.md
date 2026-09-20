# 저장·페이지 관리·단축키 검증

## 동작

- 네이티브 저장 API가 있으면 사전 앱 입력창 없이 바로 저장 대화상자를 연다. 기본 이름은 로컬 시각 `YYYYMMDD_HHmm.5e`이며 대화상자에서 이름·위치를 변경한다.
- 지원 브라우저는 저장 메뉴 클릭의 사용자 제스처 안에서 OS 파일 선택창을 연다.
- Safari는 다운로드 설정을 따른다는 설명을 확인 전에 표시한다. 파일 선택창 취소와 오류는 다운로드로 전환하지 않는다.
- 네이티브 API가 없는 브라우저에서만 타임스탬프 이름을 편집하는 간단한 다운로드 확인창을 표시한다.
- 페이지 탭의 상시 삭제 X를 없애고 더블클릭 또는 Enter/Space/F2로 관리 메뉴를 연다. 좌우 화살표로 탭을 이동한다.
- 단축키 설정은 실제 단축키 목록을 직접 연다. 메뉴명 끝 말줄임표를 제거하고 단축키를 함께 표시한다.

## 단축키 근거

- Adobe Illustrator 공식 기본 단축키: https://helpx.adobe.com/ca/illustrator/using/default-keyboard-shortcuts.html
- Adobe Illustrator 단축키 사용자화 지침: https://helpx.adobe.com/illustrator/desktop/get-started/preferences-and-settings/customize-keyboard-shortcuts.html
- 기본 도구 V/T/L, 저장 Mod+S, 실행 취소 Mod+Z 등 기존 바인딩을 유지한다.
- 설정 목록은 Illustrator의 Mod+Alt+Shift+K 패턴을 사용한다. 환경 설정은 Mod+,이다.
- 백업 B, 복원 R, 도구 기본값 D, 라이브러리 L, 객체화 T, AI A는 Mod+Alt+Shift를 붙인 **이 앱의 충돌 회피 배정**이며 업계 공통 표준이라는 의미가 아니다.
- 브라우저 예약 키 Mod+T(새 탭), Mod+L(주소창)를 가로채던 이전 핸들러를 제거했다.
- 메뉴, 툴팁, 실제 핸들러와 단축키 화면은 settings-shortcuts.js의 정의를 공유한다. 자유 키 재지정 기능은 추가하지 않았다.

## 실행

```sh
node --test desktop/preview-project-save.test.cjs tests/test-preview-usability-repair.mjs
PLAYWRIGHT_PATH=/path/to/playwright PREVIEW_URL=http://127.0.0.1:8767/preview/ node docs/evidence-0921/save/browser-check.cjs
```

브라우저 스크립트는 Chromium과 WebKit에서 저장 취소, 페이지 추가·이름 변경·삭제, 단축키 목록 진입, 이름을 지정한 `.5e` 다운로드와 파일 재열기를 확인한다. 다운로드 경로 검증을 위해 네이티브 파일 선택 API를 끈다. 네이티브 피커의 성공/취소/오류는 별도 단위 테스트로 검증한다. 실제 Safari 및 배포본 확인은 전체 작업 검증에서 수행한다.
