# Windows 실제 환경 검증 작업 명세

## 작업 지시

이 문서와 `docs/EDITOR_USABILITY_QA.md`를 읽고, 전달받은 일반 편집기 수정본을 **실제 Windows의 대화형 데스크톱 세션**에서 검증한다. 기존 Mac에서의 Win32 모의 검증을 Windows 검증으로 대신하지 않는다. 자동 시험과 실제 키보드·시스템 클립보드·파일 대화상자 수동 시험을 수행하고 결과 보고서를 남긴다. 이번 작업은 검증과 결함 기록이며, 수정·커밋·푸시·배포는 별도 지시 없이는 수행하지 않는다.

## 1. 검증 대상 확보

- 원본 작업 브랜치: `codex/editor-usability`. 기준 HEAD: `fc75e368cec7b5d0b409480ab3804fac25570e14`.
- GitHub의 `codex/editor-usability` 브랜치를 fetch한 뒤, 이 명세와 사용성 수정이 포함된 최신 커밋을 검증한다. 위 기준 HEAD는 수정 전 출발점이므로 검증 대상으로 사용하지 않는다. 실제 검증 HEAD를 기록하고 원격 브랜치와 일치하는지 확인한다. Mac의 `node_modules`는 복사하지 않는다.
- `js/editor-clipboard.js`, `js/page-history.js`, `js/project-status.js`, `desktop/editor-usability-browser.cjs`, 신규 회귀 테스트들과 `package.json`의 `test:editor`, `test:editor:browser`가 포함됐는지 확인한다. 이 목록만 복사해서는 안 되며 나머지 수정 파일도 필요하다.
- 인수한 커밋 SHA, `git status --short`, 전달 방식과 파일 목록을 기록한다. 변경이 누락됐다면 대상 확보 실패로 보고하고 구버전 시험을 진행하지 않는다.
- 실제 Windows 버전/빌드, CPU 아키텍처, 키보드 배열·한글 IME, 배율, Node·npm·브라우저·Electron·Playwright 버전을 기록한다. Windows VM도 가능하지만 VM 여부와 클립보드 공유 설정을 명시한다. WSL/Linux 실행은 대체 불가다.

## 2. 준비 및 자동 시험

Windows PowerShell에서 저장소 루트로 이동한다. 아래 명령은 Windows에서 실행할 지시이며 이 문서 작성 환경에서 실행 검증한 명령은 아니다. Node는 기존 검증에 사용한 24.x를 우선한다. Python 3과 화면이 표시되는 Chromium 실행 환경이 필요하다.

```powershell
node --version
npm.cmd --version
node -p "process.platform"
# 반드시 win32인지 확인
$qaOut = Join-Path $env:TEMP ("5e-windows-qa-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path $qaOut | Out-Null
git rev-parse HEAD | Out-File (Join-Path $qaOut "revision.txt")
git status --short | Out-File (Join-Path $qaOut "worktree.txt")
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed" }
npm.cmd run test:editor *> (Join-Path $qaOut "editor-tests.log")
if ($LASTEXITCODE -ne 0) { throw "Editor tests failed; inspect the log" }
```

명세 작성 시 전용 시험은 **84개 통과**가 기준이다. 시험 수가 달라졌다면 변경 이유를 기록하고 누락 여부를 확인한다.

이미 설치된 Playwright가 있으면 해당 모듈의 절대 경로를 `PLAYWRIGHT_MODULE`에 지정한다. 없으면 저장소 의존성을 바꾸지 않고 별도 임시 디렉터리에 설치한다. 설치한 버전을 반드시 보고서에 기록한다.

```powershell
$qaTools = Join-Path $qaOut "tools"
npm.cmd install --prefix "$qaTools" --no-audit --no-fund playwright
if ($LASTEXITCODE -ne 0) { throw "Playwright installation failed" }
$env:PLAYWRIGHT_MODULE = Join-Path $qaTools "node_modules\playwright"
node (Join-Path $env:PLAYWRIGHT_MODULE "cli.js") --version
node (Join-Path $env:PLAYWRIGHT_MODULE "cli.js") install chromium
if ($LASTEXITCODE -ne 0) { throw "Chromium installation failed" }
$env:EDITOR_QA_URL = "http://127.0.0.1:19424"
$env:EDITOR_QA_OUT = $qaOut
```

별도 PowerShell 창을 열어 **같은 저장소 루트**에서 서버를 실행한다. 포트 사용 중이면 기존 프로세스를 종료하지 말고 다른 빈 포트를 선택하고 `EDITOR_QA_URL`도 맞춘다.

```powershell
Get-NetTCPConnection -LocalPort 19424 -State Listen -ErrorAction SilentlyContinue
# 출력이 없어 포트가 비어 있는 경우만 실행
py -3 -m http.server 19424 --bind 127.0.0.1
```

원래 PowerShell 창에서 실행한다. 자동 시험 중 마우스·키보드·클립보드를 다른 작업에 사용하지 않는다.

```powershell
npm.cmd run test:editor:browser *> (Join-Path $qaOut "browser.log")
if ($LASTEXITCODE -ne 0) { throw "Browser test failed; inspect log and trace" }
Get-Content (Join-Path $qaOut "browser-results.json")
```

성공 조건: 종료 코드 0, Windows 결과의 `platform: "Win32"`, `host: "win32"`, `native: true`, 모든 시나리오 `pass: true`. MacIntel 결과는 이 환경에서 모의 시험임을 명시한다. 하네스는 headed Chromium으로 실제 Windows Control 키·OS 클립보드·파일 선택기를 사용한다. 단, 저장 피커는 하네스에서 다운로드 방식으로 대체되므로 다음 수동 시험이 필수다.

## 3. 실제 Windows 수동 시험

자동 시험과 별도로 Edge 또는 Chrome의 새 테스트 프로필에서 로컬 주소를 연다. 확장 프로그램과 기존 사용자 데이터가 섞이지 않게 한다. 이어서 Windows 데스크톱 앱에서도 아래 핵심 항목 W01–W08을 반복한다. 브라우저 통과만으로 Electron 앱 통과를 선언하지 않는다.

데스크톱 앱은 저장소의 `npm.cmd run desktop`으로 실행한다. 실행 전 아래와 같이 별도 사용자 데이터 경로를 지정한다. AI 생성·로그인·유료 호출은 필요하지 않다.

```powershell
$env:FIVE_E_DEV_USER_DATA = Join-Path $qaOut "electron-profile"
npm.cmd run desktop
```

| ID | 실제 조작 | 기대 결과 |
| --- | --- | --- |
| W01 | 사각형 두 개를 만들고 선택. Ctrl+C/V, Ctrl+X, Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z를 각각 실행. 다른 도구를 선택한 뒤 붙여넣기. | 복제·잘라내기·복구가 한 번씩 동작. 두 Redo 방식 모두 동작. 붙여넣기 후 선택 도구. Windows 키를 Ctrl 대용으로 요구하지 않음. |
| W02 | 객체 복사 후 그림판에서 작은 그림의 선택 영역을 복사하거나 캡처 도구로 화면 일부를 캡처하고 편집기에 Ctrl+V. 이어서 메모장의 일반 텍스트를 복사해 붙여넣기. | 이미지 한 개만 삽입되고 이전 객체가 중복 삽입되지 않음. 외부 일반 텍스트를 붙일 때 이전 객체가 다시 생기지 않음. 이미지 삽입 Undo 가능. |
| W03 | 그룹 복사 후 원본과 복제본을 각각 선택·이동. 잠근 객체를 포함해 잘라내기. 평면과 연결 그래프 복사, 단독 그래프 복사. | 두 그룹이 독립적. 잠긴 객체 보존. 복제 평면·그래프 관계 정상, 원본 이동이 복제본에 잘못 영향 주지 않음. |
| W04 | 텍스트 편집/인스펙터 입력에서 Ctrl+A/C/X/V/Z 사용. 한글 IME로 입력·조합하며 도구 문자 키 누르기. 선택 상자·확인 모달에서도 편집 단축키 확인. | 입력 내용에 작용하며 캔버스 객체가 삭제·복제되지 않음. 한글 조합 중 도구 전환 없음. 모달 뒤 도구·내보내기 실행 없음. IME 시험은 실제 키보드로 수행. |
| W05 | 일반 입력값을 수정한 상태에서 Ctrl+S/O. 별도로 모달이 열린 상태 및 한글 조합 중 Ctrl+S/O. | 일반 입력값을 확정하고 프로젝트 저장/열기 실행. 모달·조합 중 중첩 파일 창이나 브라우저 HTML 저장창이 열리지 않음. |
| W06 | 캔버스 클릭 후 Space로 이동. Space 또는 방향키를 누른 상태로 Alt+Tab해 다른 앱에서 키를 놓고 복귀. 도형 이동 및 일반 도구 사용. | 팬·키 반복이 붙잡힌 상태로 남지 않음. 이전 도구 버튼이 Space로 재실행되지 않음. |
| W07 | A페이지 편집 → B 생성·편집 → A 복귀·Undo. A 삭제 확인 → 생존 페이지에서 Undo. 복구 A를 새로 편집한 뒤 생존 페이지에서 Redo. | 페이지별 기록 유지. 삭제 Undo는 현재 페이지를 유지하며 탭 복구. 복구 후 편집한 페이지를 오래된 삭제 Redo가 지우지 않음. |
| W08 | 실제 Ctrl+S 저장 창에서 취소 후 다시 저장. 한글·공백이 있는 새 경로로 `.5e` 저장하고 Ctrl+O로 재열기. 수정 후 상태 표시 확인. | 취소를 저장 완료로 표시하지 않음. 저장·재열기 후 페이지/객체 유지. 추가 편집은 미저장 표시. 복구용 저장과 파일 저장 상태를 구별. |
| W09 | 저장 창을 연 채 취소/완료를 시험하고, 가능하면 저장 대기 중 다른 편집을 시도. 파일 피커 미지원 환경이면 다운로드로 저장 후 재열기. | 실제 지원 경로를 기록. 다운로드는 '다운로드 요청됨'으로 표시. 저장 이후 변경이 생기면 완료로 덮어쓰지 않음. OS 모달 때문에 동시 편집이 불가능하면 미실행 사유를 기록하고 단위 시험으로 구분. |
| W10 | 파일 메뉴를 키보드로 열어 방향키·Home/End·Escape 확인. Windows 100%와 125% 배율에서 상태 표시 확인. | 항목 이동 정상, Escape 후 메뉴 버튼으로 포커스 복귀. Windows 단축키 안내가 Ctrl 기준. 저장 상태 글자 겹침 없음. |

추가 경계 조건: 큰 로컬 이미지를 붙여넣고 즉시 페이지 전환을 반복해, 늦게 읽힌 이미지가 다른 페이지에 끼어들지 않는지 확인한다. 타이밍을 재현하지 못하면 통과 대신 '수동 재현 불가, 단위 시험만 통과'로 기록한다. 클립보드 쓰기 거부·디스크 실패도 OS에서 실제 재현하지 않았다면 실환경 통과로 세지 않는다.

## 4. 판정·보고·정리

- 자동 결과 JSON·로그·trace ZIP·스크린샷·저장한 시험용 `.5e` 파일을 보존한다. 각 수동 항목에 PASS / FAIL / BLOCKED / 미실행과 실행 표면(브라우저/Electron)을 기록한다.
- FAIL은 최소 재현 순서, 기대/실제 동작, 빈 프로젝트에서도 재현되는지, 브라우저·앱 버전, 콘솔 오류와 화면 증거를 남긴다. 실패를 숨기거나 테스트를 약화하지 않는다.
- 최종 보고서는 `docs/WINDOWS_EDITOR_VERIFICATION_RESULT.md`에 작성한다. 환경/대상 식별 → 자동 시험 결과 → W01–W10 표 → 발견 결함 → 미검증 범위 → 증거 경로 순서로 작성한다. 실제 수행하지 않은 항목을 통과로 기재하지 않는다.
- 데이터 손실, 잘못된 페이지 삽입, 일반 Ctrl 단축키 불능은 차단 결함이다. 자동 Windows 네이티브 시험과 브라우저/Electron 핵심 항목이 모두 통과해야 'Windows 핵심 검증 통과'로 판정한다. 환경 준비 실패는 제품 결함과 분리한다.
- 전체 `npm test`는 선택 사항이다. 기존 Mac 기준은 546개 중 544개 통과이고, `test-ai-comparison-sizing.mjs`와 `test-ai-white-png-integration.mjs`에 기존 실패가 있었다. Windows에서 발생한 실패를 이름만 보고 기존 문제로 단정하지 말고 메시지·원인을 대조한다.
- 끝나면 본인이 시작한 로컬 서버를 해당 창에서 Ctrl+C로 종료하고 시험 앱을 닫는다. 공용 서버·다른 작업 프로세스는 종료하지 않는다. 결과 파일은 남기고 테스트용 환경 변수는 해당 세션 종료로 정리한다.
