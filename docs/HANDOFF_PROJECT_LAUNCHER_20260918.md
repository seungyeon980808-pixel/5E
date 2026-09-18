# 실행형 프로젝트 저장·열기 인계 (2026-09-18)

## 가져올 커밋

- 기능 커밋: `bf08683f7c40a3b3b0ea20dcdddac0edaeb026c2`
- 제목: 실행형 프로젝트 저장·열기와 Windows 실행기 경량화
- 원본 브랜치: `codex/5e-sharing-0918`
- 원본 작업트리: `/Users/parkseungyeon/.codex/worktrees/1afc/5E`
- 부모 커밋: `7ce6c2c2bb1618443e580cfbbe7ada61fdbbf574`

같은 저장소의 다른 브랜치에서는 기능 커밋 하나를 cherry-pick한다. 원본 작업트리에는 공유 기능 변경이 미커밋 상태로 남아 있으므로 폴더 전체 복사나 dirty 파일 덮어쓰기로 전달하지 않는다. 이 인계 문서와 프롬프트는 기능 커밋 이후 별도 문서 커밋으로 기록한다. 푸시·프리뷰 배포·설치본 생성은 하지 않았다.

```sh
git show --stat bf08683f7c40a3b3b0ea20dcdddac0edaeb026c2
git cherry-pick bf08683f7c40a3b3b0ea20dcdddac0edaeb026c2
```

다른 저장소라면 해당 Git 객체를 먼저 전달해야 한다. 현재 브랜치는 upstream이 없으며 원격으로 푸시되지 않았다. 로컬에서 만든 개발 파일을 다른 PC에서도 바로 실행할 수 있는 배포 결과로 취급하지 않는다.

## 포함한 변경

- macOS 개발 앱의 프로젝트 `.app` 저장, 승인한 파란 ICNS, 설치 앱 수신 지원 표시와 파일 수신.
- macOS 패키지 API의 ZIP 전달. `.app` 폴더 묶음을 브라우저에서 전달하기 위해 이전 구현자가 선택한 방식이며, 별도로 요청된 추가 기능은 아니다. 압축 해제가 필요해 사용자의 즉시 더블클릭 요구와 함께 재검토가 필요하다. Windows 경량화 작업에서 이 흐름은 변경하지 않았다.
- Windows x64 프로젝트 `.exe` 저장, 같은 파란 ICO, 설치 지원 앱 등록 확인과 앱 우선/웹 대체 경로.
- Windows 실행기를 C와 기본 운영체제 API로 교체: 아이콘 포함 88,576바이트. 기존 7,174,656바이트 대비 98.77% 감소. 프로젝트 원본·설정·라이선스·footer는 별도로 더해진다.
- 프로젝트 원본 SHA-256·크기 검증, 웹에서 `.exe`를 실행하지 않고 데이터만 불러오기, 미저장 작업 대체 확인, 소유권이 확인된 임시 복사본만 정리.
- 저장 위치에 기존 실행형 프로젝트가 있으면 이전 파일을 보존. 다른 앱/실행 파일 덮어쓰기 방지.
- 웹 패키지/수신 API, 개발 서버 연결, Windows NSIS 등록 hook과 수동 검증 워크플로.

주요 파일은 `desktop/project-package.cjs`, `desktop/windows-project-package.cjs`, `desktop/project-open.cjs`, `desktop/project-launcher/`, `js/project-launch.js`, `js/windows-project-source.mjs`, `experiments/web-codex-auth/project-routes.cjs`다. 기존 main/preload/project-io/project-status/package 설정의 연결 변경도 같은 커밋에 포함한다. 실행기·아이콘 바이너리는 실행에 필요하므로 소스와 함께 가져온다. Windows Go 코드는 형식 상호운용 검사에 남아 있으며 배포 실행기 빌드는 C 코드가 담당한다.

`experiments/web-codex-auth/sharing-dev.cjs`는 기존 파일명/함수명을 유지했지만 이 기능 커밋에는 프로젝트 API와 정적 편집기 제공만 포함했다. 공유 store/routes 의존성은 없다. 동일 파일의 공유 기능 추가분은 원본 작업트리에 미커밋 상태로 보존했다.

## 통합 시 주의

1. 대상 브랜치의 미커밋 변경, 사용자 프로필과 PDF 자료 경로, 실행 중인 앱을 먼저 확인하고 보존한다. 자동 reset/clean/stash-pop을 하지 않는다.
2. 공유 기능, 공유 버튼과 CSS, AI 작업대 상태 전달 및 remote-trial 변경은 이번 커밋에 포함되지 않는다. 원본 작업트리에서 추가로 가져오지 않는다.
3. 충돌은 기능 의도로 해결한다. 특히 `desktop/main.cjs`, `desktop/preload.cjs`, `js/main.js`, `js/project-io.js`, `package.json`, gateway 연결을 통째로 덮어쓰지 않는다.
4. 기존 개발 실행은 `scripts/start-library-repair-dev.command`를 사용한다. 화면은 새로고침, 데스크톱 수신 변경은 재시작한다. 설치본은 배포 확인 지시가 있을 때만 만든다.
5. 원본 작업트리의 분석 plist, 임시 캡처와 빌드 폴더를 추가로 가져오지 않는다. `build/project-launcher.nsh`는 필요한 NSIS 소스이므로 예외로 커밋에 포함했다.
6. 이번 기능 커밋에 추가된 vendor 원본/라이선스와 기존 검토 문서에는 공백 검사 안내가 있다. vendor 파일은 원본 그대로 보존했으며 실행 실패는 아니다. 후속 문서 커밋의 공백 검사는 별도로 수행한다.

## 직접 검증한 내용

공유 기능을 제외해 stage한 정확한 기능 소스를 별도 폴더에 추출해 검사했다. 관련 Node 테스트 34개 중 30개 통과, 실패 0개, Windows 전용 4개는 macOS에서 명시적으로 건너뛰었다.

```sh
node --test tests/test-project-package.cjs tests/test-windows-project-package.cjs desktop/project-open.test.cjs desktop/project-status.test.cjs tests/test-project-file-extension.mjs tests/test-windows-native-launcher.cjs tests/test-windows-native-adapters.cjs
```

같은 별도 폴더의 실제 웹 개발 서버와 Chromium에서 메뉴 저장 → 새 편집기 불러오기를 수행했다. 다운로드한 파일은 205,643바이트이고 한국어·내장 이미지·두 페이지/객체 수 3·1이 복원됐다. 손상 파일은 거부하면서 현재 문서를 보존했고 페이지 오류는 0개였다. 호스트는 macOS이며 Windows 선택만 설정했다. 실제 Windows 운영체제 실행 검증은 아니다.

기능 커밋 이전에는 Zig 0.15.2 Windows x64 실행기/테스트 드라이버 크로스 빌드, C 정적 분석, 실제 macOS 개발 앱에서 원본 복원과 PDF 검색 1,312항목/‘생명’ 38결과를 확인했다. 실행기 SHA-256은 `7de61f5117b211f21d87c708f7c8b0a1617f71e282ef4edd015df7da00f10827`이다. 기존 리뷰 보고서는 당시 baseline과 미커밋 실행기 해시에 대한 기록이며, 통합 후 새 브랜치 전체를 검토한 것으로 주장하지 않는다.

## 통합 후 직접 확인할 순서와 합격 기준

- 개발 앱에서 도해·한국어·이미지와 두 페이지를 만들고 저장한다. macOS는 `.app`, Windows는 `.exe`가 저장되어야 한다. 해당 개발 앱의 파일을 열어 원본이 복원되면 합격이다.
- 현재 작업을 수정한 뒤 다른 저장 파일을 연다. 취소하면 현재 작업이 유지되고, 열기를 선택하면 저장 원본으로 복원되어야 한다.
- 웹 테스트는 `node experiments/web-codex-auth/sharing-dev.cjs 19624`로 별도 서버를 실행한다. 포트가 이미 사용 중이면 다른 포트를 선택하고 그 PC의 localhost로 접속한다. Windows 선택에서 새 `.exe`를 저장하고 일반 프로젝트 불러오기로 읽어 원본이 복원되어야 한다. API 없는 정적 웹은 기존 `.5e` 저장을 유지한다.
- 실제 Windows PC가 있으면 저장한 `.exe`를 탐색기에서 더블클릭한다. 지원 설치 앱 없음 → 기본 브라우저 복원, 업데이트된 지원 앱 등록 있음 → 설치 앱 복원이 합격 기준이다. 앱 종료/실행 상태 모두 확인한다. 원본 `.exe`는 남아 있어야 한다.
- 자료 라이브러리 연결과 기존 검색이 유지되어야 한다. 테스트는 분리한 데이터로 수행한다.

## 남은 검증과 배포 조건

실제 Windows 탐색기 아이콘·더블클릭·WinHTTP/레지스트리/프로세스 테스트·설치 앱 cold/warm 수신·NSIS 설치 등록은 미검증이다. 실제 Windows PC/VM이 이 세션에 없었다. Windows 전용 테스트에는 Zig 0.15.2가 필요하다. 워크플로는 manual dispatch이며 원격 실행하지 않았다.

Developer ID/공증/Gatekeeper와 Authenticode/SmartScreen 등 인터넷 다운로드 배포 검증, 공개 웹 패키지/수신 API 배포도 남아 있다. localhost가 들어간 파일의 주소는 여는 PC 자신을 가리키므로 다른 PC 테스트는 그 PC의 서버에서 저장하거나 실제 배포 API로 생성해야 한다. 현재 개발 파일을 경고 없이 열리는 범용 배포 파일로 안내하지 않는다.

상세 동작·기존 확인 기록은 `docs/PROJECT_OPEN_0918.md`, `docs/WINDOWS_PROJECT_OPEN_0918.md`, `docs/PROJECT_OPEN_TASKS.md`, `.omo/evidence/windows-launcher-lightweight.md`를 확인한다. 통합 결과 보고는 소스·개발 실행창·설치본·프리뷰 반영 여부를 구분한다. 통합 요청만으로 푸시·배포·설치본 생성은 승인되지 않는다.
