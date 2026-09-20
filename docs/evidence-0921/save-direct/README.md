# 프로젝트 저장 간소화

- 승인된 변경: 앱에서 이름을 먼저 묻는 단계를 지원 브라우저·설치형에서 제거한다.
- 매 저장 클릭 시 로컬 시간으로 `YYYYMMDD_HHmm.5e` 기본 이름을 만든다. UTC 변환을 하지 않는다.
- Chromium 파일 선택 API를 첫 await로 호출하므로 클릭 사용자 활성화를 유지한다. 네이티브 선택창에서 이름과 폴더를 지정한다.
- 취소는 저장·다운로드·성공 표시를 하지 않는다. 쓰기 실패는 안내만 표시하며 다운로드로 우회하지 않는다.
- Safari는 파일 선택 API가 없으므로 timestamp를 편집할 수 있는 간단한 앱 창과 다운로드 설정 안내를 유지한다. 사이트가 Safari 저장 폴더를 강제로 선택하거나 OS 선택창을 보장하지 않는다.
- 이미지 내보내기 `pickSaveHandle`은 연결된 내보내기 폴더 확인 및 오류 시 다운로드 우회가 포함되어 있으므로 재사용하지 않았다. 동일한 File System Access API 방식을 사용하되 프로젝트 저장의 명시적 취소·오류 의미를 유지한다.
- 설치형 bridge에는 timestamp suggestedName을 전달한다. 실제 desktop 구현은 이 배포 트리에 없어 OS dialog 동작은 여기서 직접 검증할 수 없다.

검증: desktop/preview-project-save.test.cjs 11개. native-check.cjs는 실제 Chromium 버튼 클릭으로 picker가 사용자 활성화 안에서 호출되고 앱 이름창이 없으며 timestamp가 전달되는 것을 API fixture로 검증한다. 실제 OS 저장창 스크린샷이라는 의미가 아니다. Safari 경로는 WebKit 및 Chromium에서 API 없는 상태로 실제 파일 다운로드와 재열기를 검증한다. 기존 save/browser-check.cjs를 최신 기본값과 버튼에 맞췄다.
