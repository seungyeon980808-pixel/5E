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

## 2026-10-07 — 1.6.2 웹 배포 후속 (아직 공개 반영 전)

사용자가 1.6.2 태깅과 정식 웹 배포를 명시적으로 승인했다. 이전 A1의 1.6.3 분리/비배포 조건은 그대로 유지한다. 설치판 HOLD도 유지한다.

원격 release/1.6.2 검사 37466554941의 첫 시도는 WebKit AI 취소 대기 하나에서 timeout, 두 번째 시도는 그 취소 검사가 통과하고 lifecycle 테스트의 VM long-task 50ms 기준에서 실패했다. 동일 d4ebfc13 소스에 대한 로컬 취소/다중 선택 19개 검사는 통과했다. 하나의 전체 원격 실행이 성공했다고 기록하지 않는다.

`test-ai-workspace-lifecycle-browser.cjs`의 성능 판정을 기존 polish 검사와 같은 정책으로 맞췄다. GitHub Actions에서 명시된 성능 참조가 있을 때만 helper가 전체 Preview 트리/lock/methodology 지문, 모든 실제 Mac 8개 시나리오·120개 trusted click sample·cleanup·오류 부재를 검증하고 VM 시간은 진단 값으로 기록한다. 기존 선택된 결과/디코딩/소유권/취소/기능 assert는 계속 원격에서 실행한다. 로컬 및 별도 성능 진단 워크플로는 기존 <100ms/50ms 기준을 그대로 적용한다. 임계값 변경이나 단순 skip을 하지 않았다. 테스트 파일이 성능 methodology 지문에 포함되므로 새 실제 Mac 기록이 없으면 배포 게이트는 통과할 수 없다.

수정 후 로컬 lifecycle 10개 검사는 기존 live timing 기준으로 통과했다. 새 native 측정 첫 실행은 Mac이 잠겨 WebKit 30 작업 시나리오가 timeout 되었고 전체 8개 중 7개 통과/1개 취소로 종료했다. 이를 완료 기록으로 capture하거나 이전 수치의 지문만 수정해 재사용하지 않았다. 잠금 해제 후 전체를 새 디렉터리에서 다시 실행해야 한다. 테스트에 사용한 브라우저 프로세스는 종료된 것을 확인했다.

`Test`와 웹 source 검사에 CI 진단 파일을 보존하도록 설정했다. 실패 시 trace/작업 상태를 보고 재현 원인을 판단하기 위한 것이며 gate/검사 범위를 줄이지 않는다. 후보 표기 날짜를 2026.10.07로 맞췄다. 릴리즈 메타데이터의 stableWeb 1.6.2는 게시 목표이며 공개 영수증과 성공한 publish run을 확인하기 전 완료로 해석하지 않는다. 태그는 아직 로컬에만 있으며 원격 main은 여전히 f50bb507이다.


## A1 기존 체크포인트 기록 — 아래 상태는 2026-10-06 당시 기록

## 1.6.3 A1 — 완료

실행 식별자: `2026-10-06-A1-project-file-size`. 별도 폴더: `/Users/parkseungyeon/.codex/worktrees/5e-163-project-file-size/5E`, 브랜치: `fix/1.6.3/project-file-size`. 시작 SHA: `99d60ab1b513d3cb86ad1a322dc329ab2f2fcf9e`. 이 단계는 main에 병합하지 않았다.

### 변경과 입력 경로

- `js/project-file-policy.js`: 일반 프로젝트의 인코딩된 파일 용량 상한 128 MiB(134,217,728바이트)를 한 곳에 정의. 미만/동일 허용, 초과 거부. 한국어 안내에는 실제 바이트·MiB, 상한, 이미지 해상도 축소/페이지 분할 해결책, 기존 작업 보존을 표시.
- `js/project-io.js`: 공통 `openProject`에서 FileReader 생성보다 앞에 검사. 파일 메뉴의 숨김 file input(change)과 SVG `#canvas` drop이 같은 함수로 들어온다. MIME JSON 및 .5e/.json 확장자 처리와 동일 파일 재선택을 위한 input 초기화는 유지. .exe의 기존 64 MiB 검사·구조 검증·저장 스키마 0.17은 유지.
- `js/main.js`, `js/settings.js`, `js/autosave.js`, `js/view-mode.js`, `js/mcp-bridge.js`, `index.html`: 정식 모듈의 프로젝트 I/O import/cache URL을 일치시켜 중복 인스턴스와 구버전 캐시 사용을 방지. 위 소비 모듈의 동작 자체는 변경하지 않음.
- `package.json`, `package-lock.json`, `manifest.json`, `js/release-receipt.js`, `release-channels.json`, `index.html`: 후보 1.6.3 식별. 공개 stableWeb 1.6.1·HOLD·Preview 1.7.0·mobile·고정 1.6.0 보존. 태그 이름 문자열은 후보 메타데이터이며 실제 태그를 생성하지 않음.
- `tests/test-project-file-policy.mjs`, `tests/test-project-file-size-browser.cjs`, `tests/suite-manifest.json`: 새 단위/정식 root 브라우저 검사를 공식 runner에 등록.
- 후보 릴리즈 노트·HOLD 안내와 이 단일 운영 문서 갱신.

### 상한 근거와 한계

이미지 객체화 제한 64 MiB는 디코딩 전 원본 파일의 상한이다. 프로젝트에 넣으면 base64 텍스트만 약 85.34 MiB가 되고 다른 도형/스타일/페이지 데이터도 포함된다. 128 MiB는 원본 64 MiB 이미지 하나와 약 42.66 MiB의 나머지 데이터 여유를 허용하면서 백업 복원의 누적 256 MiB보다 작은 텍스트 입력 예산이다. 다수 대형 이미지가 든 기존 프로젝트를 모두 열 수 있다는 보장은 없다. 128 MiB를 넘는 정상 프로젝트도 이제 거부된다.

이 검사는 파일 바이트 예산이며, JSON 문자열/객체·base64 이미지 디코딩·픽셀·렌더링 메모리의 전체 상한이 아니다. 상한 내 파일도 메모리를 많이 사용할 수 있다. 실제 메모리 장애를 재현하거나 128 MiB 실물 파일을 생성한 검사가 아니다. 경계는 작은 실제 File의 size 메타데이터만 주입했다. 일반 이미지 가져오기(A2), 백업 생성/복원 예산 일치(A3), URL/#project 및 데스크톱 launch payload 경로의 사전 예산은 이번에 고치지 않았다. 백업의 항목 64 MiB/누적 256 MiB는 유지하며 128 MiB 프로젝트의 백업 복원 호환성은 A3의 별도 판단이 필요하다.

### 새로 실행한 검사

Node 24.21.0, 잠금 의존성 `npm ci --ignore-scripts` 사용. 의존성 업그레이드/기기 설치 없음.

| 검사 | 실제 결과 |
|---|---|
| `npm run test:unit` | 323/323 PASS, 실패·skip 0 |
| 공식 runner `--only test-project-file-size-browser.cjs` | Chromium/WebKit 각각 PASS, 정식 root 모듈 사용 |
| 정상 이미지 왕복 | 실제 권리 확인 PNG UI 가져오기 → 실제 10,745바이트 .5e 다운로드 → 새 컨텍스트 파일 선택·열기. PNG 원본 base64 바이트와 전체 문서가 스키마 기본값 적용 후 동일 |
| 경계 | 상한-1/상한은 읽기·파싱 후 열기 취소 가능. 상한+1은 picker 2회 및 .5e/.json drop에서 FileReader 생성/읽기/표식 JSON 파싱 모두 0회 |
| 보존 | 실제 그리기와 undo로 양쪽 history를 채운 문서에서 초과 거부·동일 파일 재선택·유효 파일 열기 취소·picker 취소·깨진 파일 입력 모두 문서/선택/target/undo/redo/활성 페이지/viewBox/저장 표시 동일 |
| 기존 관련 라이브러리 검사 | `--only test-stable-library-progressive-crop-browser.cjs`: Chromium/WebKit 각각 8개 시나리오 새 실행 PASS |
| `npm run verify:release-identity` | 1.6.3 OK |
| `git diff --check` | PASS |
| 임시 서버 종료 | 공식 runner 종료 후 A1 테스트 주소 연결 거부 확인 (`server-cleanup.json`) |

브라우저 검사에서 OS 네이티브 저장창 대신 실제 파일 다운로드를 사용했다. OS 저장창·설치판·실계정 AI·전체 browser suite를 통과했다고 주장하지 않는다. 기존 WebKit Abort trap은 이번 두 검사에서 재현되지 않았다. 처음 검사 스크립트의 SVG id와 자동 복구 저장 표시의 타이밍을 조정하고 다시 실행했다. 초기 후보 제목 버전 누락도 수정한 뒤 전체 단위를 재실행했다. 최종 결과만 통과로 기록한다.

증거는 이 작업 폴더 `.omo/evidence/a1/`의 `unit.log`, `browser.log`, `browser/test-project-file-size-browser/results.json`, 실제 `.5e` 및 안내 스크린샷, `related-library.log`, `server-cleanup.json`, `source-binding.json`에 있으며 Git에는 넣지 않았다. A1 검사 결과는 새 실행이다. 이전 1.7.0 실서비스 측정 시간은 A1 소스의 새 성능 측정으로 재사용하지 않았다. 1.6.2 검사 기록은 그 통합 커밋의 기록이며 1.6.3 전체 검사의 대체 증거가 아니다.

최종 보존 재확인: 원래 작업 폴더의 상태 목록 지문 동일, 로컬 main은 위 1.6.2 SHA, 원격 main은 `f50bb507acc4b29e1d3c56fdf2ed3431ebc7f206`. A1의 Preview/mobile/1.6.0 tracked diff 없음. push·태그·배포·설치판 발행·기기 설치·유료/실계정 AI 호출·원본 삭제·HOLD 해제는 하지 않았다.

## 다음 작업 한 개 — 미착수

A2: 일반 이미지 가져오기·드롭의 읽기 전 단일/다중 파일 용량·합산 예산 검사. 이번 세션에서는 시작하지 않았다.


## 검사 소스 지문

운영 문서 자체를 제외한 코드·검사·후보 메타데이터의 SHA-256이다. 검사 후 제품 코드를 변경하지 않았다.

| 파일 | SHA-256 |
|---|---|
| `docs/RELEASE_HOLD.md` | `d23f826c6b3613ce4f029f51eabd0c685ee60147df55ebe9cda9354029113e8f` |
| `docs/RELEASE_NOTES_v1.6.3.md` | `27cd2d8aaffe425c7449f52c5f5d5e66fa1618f3bcb3f0defaa5819b7c7b2740` |
| `index.html` | `e15132aaa906943b212cf934e31f108bf219023be08031f73e01a1802c8dc263` |
| `js/autosave.js` | `1e3fc554ff0fe77f675c053b8b0237e2861bce31c2c8ce7c64ab111549002cfb` |
| `js/main.js` | `63a677e42012ceb4e40c9ab9040e39f8b5b8cb9b3e7bafa1655881a323d7fe84` |
| `js/mcp-bridge.js` | `c5605f1353f26a51720e727ac6315be7a9c549ae6cb28b1cadd2d2c5923f1fe7` |
| `js/project-file-policy.js` | `dc9284cd737b67801e645b887899ba9aad8c405400dd1c919151fdd88e418d0e` |
| `js/project-io.js` | `50e739ec9bef72230e96d764554a14c9f0302e7dbe0ad46efbec43b9f9708aed` |
| `js/release-receipt.js` | `17896a6e1914559954c7c7bf59564deaffe5da6e384160e43d9f8f7c811fbb89` |
| `js/settings.js` | `57e7450836a12bd449e193599f2ac3d545143e09b4d90bb3f093a4c6afafcf7b` |
| `js/view-mode.js` | `ee2cfc027b7bba395f8fb3fa12ba4ee2af0bf591e9a519821508d405141b044a` |
| `manifest.json` | `75226733fdd05f27123649d13fac4fff28622f16e5b7752e056088cf1298376d` |
| `package-lock.json` | `25ec08b9031c2155e4f3ec7b9bb1e67b5e7723a140a03c202be6843a7051116d` |
| `package.json` | `8fe1fed5c529222767e2b7e50a4d4fbf6ad6732bd1d97d34e9a76a89c4da8c4c` |
| `release-channels.json` | `25d36e1a5138bf76c6261347c383c35add99976b5fc95ab317110f73cf521800` |
| `tests/suite-manifest.json` | `18493371d363f471780362e7a8b580bd1349b5a628df42f7b4e2b2fb38396cae` |
| `tests/test-project-file-policy.mjs` | `9275f250a74e40dac2ef939599dc45b396d2b6674a7bd16c2c51bad68605f466` |
| `tests/test-project-file-size-browser.cjs` | `ab31b0e8f0b0b787169e695e082120c6f1381447ccc8ae47a1cd65d159024a3c` |

권리 확인 PNG SHA-256: `8d61e85b08a2bad52528c9f51567410f8aee84031c41bf12eb6c069be5c2aeab`. Tracked diff(운영 문서 제외) SHA-256: `c0aca156ad649826e14505a8ac2827cb0e9c89edebb1b83fbe89cc037eabd62f`.

A1 구현·검사 체크포인트 완료 SHA: `f9332cd7ee44dba7256ac116d38dd3ec55405129`. 이후 운영 문서에 이 SHA를 기록하는 문서 전용 커밋을 추가한다. 제품 코드·검사 파일 지문은 그대로다.


## 1.6.3 초기 라이브러리 작업 — 2026-10-07

현재 공개 웹과 main은 1.6.2(df09ba5e860ecf25fcba6e0d9bb07249a8e259cd)다. 기존 A1 브랜치를 그대로 보존하고 feature/1.6.3/library-startup 별도 작업 트리에 필요한 변경을 통합한다. 정식 웹의 목록 우선 표시·검증된 목록 캐시·검색 준비 상태를 구현하고 A1을 최종 소스에서 재검수한다. A2/A3/의존성 정리와 main 병합·push·태그·배포는 이번 범위 밖이다.

### 목록 우선 표시 구현 — 2026-10-07

- 기준: 공개 1.6.2 소스 df09ba5e860ecf25fcba6e0d9bb07249a8e259cd에서 분기한 `feature/1.6.3/library-startup`.
- 기존 A1 구현 f9332cd7ee44dba7256ac116d38dd3ec55405129를 통합했으며 원래 A1 작업 트리는 보존했습니다.
- 검증된 공개 카탈로그에서 파일명·페이지 수·원본 식별값만 추린 177,043바이트 목록을 먼저 표시합니다. 본문 검색과 PDF 원본은 뒤에서 필요에 따라 준비합니다.
- 저장된 목록을 먼저 사용하고 원격 변경을 확인합니다. 손상된 목록·저장소 제한은 안전한 원격 조회로 대체합니다.
- 본문 검색이 준비되기 전에는 파일명 검색임을 안내합니다. 입력한 검색어를 보존하고 준비 후 다시 검색합니다.
- 색인만 바뀔 때는 원본 열기와 크롭 상태를 무효화하지 않습니다. 카탈로그 교체는 진행 중인 크롭 창을 닫을 때 적용합니다.
- 웹에서 사용하지 않는 부품 목록, 목록 표시 전 PDF 런타임 로딩, 보이지 않는 구형 검색 화면의 중복 검색을 제거했습니다.
- 구현과 검수 결과는 아래 최종 검수 절에 기록했습니다.
- main 병합·push·태그·배포·설치·유료 AI 호출은 이번 작업에 포함하지 않습니다.


### 최종 검수와 측정 — 2026-10-07

검사·측정 대상 소스: `6249c0aa70113a52558065e03939702fdde8fbfb`. 이후 변경은 운영·릴리즈 문서만이며 제품 코드와 검사 입력은 같습니다. 화면 반응 기준은 동일한 Preview/검사 방식/잠금 파일 조합의 `538849638b4b65b602cd9c45ebb4fb4866d3119b`에서 새로 측정했습니다.

| 검사 | 실제 결과 |
|---|---|
| 공식 기본 검사 | 336개 통과, 실패·취소·건너뜀 0 |
| 정식 root 라이브러리 초기 표시 | Chromium/WebKit 10개 시나리오 통과: 검색 준비 전 목록, 페이지·확대·스크롤·자르기 영역·검색어 보존, 카탈로그 교체 지연, 검색 실패 재시도, 손상 저장 목록/부트스트랩 누락 복구, 늦은 응답/재열기 중복 방지 |
| A1 재검수 | Chromium/WebKit 실제 10,745바이트 프로젝트 저장·새 창 재열기·PNG 출력. 초과 파일 읽기/파싱 0회, 128 MiB 경계, 드롭, 취소, 손상 파일 때 기존 상태 보존 |
| 기존 크롭 | Chromium/WebKit 각 8개 시나리오 통과 |
| 공식 전체 브라우저 검사 | 41개 묶음 실행: 최초 40개 통과, 기존 AI 경과시간 검사 1개 묶음 시간초과. 제품 코드·검사 변경 없이 그 묶음 단독 재실행, 2개 시나리오 모두 통과. 최초 전체 실행이 무실패였다고 주장하지 않음 |
| 화면 반응 | 실제 Mac의 창을 표시한 8개 시나리오, 신뢰된 클릭 120개 모두 100ms 미만. 첫 Chromium 스크린샷 시간초과는 같은 소스에서 해당 시나리오 재실행으로 확인. 전체 브라우저 실행에서는 8개 모두 새로 통과 |
| 릴리즈 식별 | 1.6.3 후보 일치 검사와 화면 반응 기준의 소스 일치 검사 통과 |
| 보존 | 원래 18,474개 변경 상태 목록의 NUL 지문 동일(17ffba81…). main df09ba5e…, 기존 A1 0f5f8b7c… 유지. Preview/mobile/1.6.0 변경 없음. 원격 main과 v1.6.2 지시 커밋도 df09ba5e… |
| 정리 | 이번 실제 자료 측정에 사용한 로컬 서버 18962/18963/18964 종료 확인 |

#### 실제 자료의 성능

같은 Mac(Apple M5), Node 24.21.0, Chromium 151.0.7922.34, 1440×900 화면, headless에서 첫 방문/재방문 각각 5회입니다. 첫 방문은 새 브라우저 저장소, 재방문은 같은 저장소의 새 페이지입니다. 공용 CDN과 회선 상태는 통제하지 않았습니다. 1.6.2는 같은 날 앞선 실행의 5회 기록(df09ba5e…), 1.6.3은 최종 소스 6249c0aa…의 새 5회 기록입니다. 이전 1.7.0 또는 Preview 측정치를 사용하지 않았습니다.

| 단계 | 1.6.2 중앙값 / 최대 | 1.6.3 중앙값 / 최대 |
|---|---:|---:|
| 첫 방문 목록 표시 | 8,508 / 9,822ms | 107 / 127ms |
| 재방문 목록 표시 | 845 / 864ms | 140 / 197ms |
| 첫 방문 본문 검색 자료 준비 | 8,508 / 9,822ms | 8,136 / 8,634ms |
| 재방문 본문 검색 자료 준비 | 845 / 864ms | 736 / 854ms |

목록 표시 대기 감소는 중앙값 기준 첫 방문 98.7%, 재방문 83.4%입니다. 첫 방문 1–2초 및 재방문 0.5초 목표를 이번 로컬 측정에서 달성했습니다. 실제 공개 도메인의 1.6.3 측정은 배포 후 별도 확인해야 합니다. 본문 검색 준비 시간 자체가 크게 줄었다고 주장하지 않습니다.

실제 공개 교과서·기출 PDF의 원본 전환도 확인했습니다(각 1회). 교과서 316쪽: 365ms에 편집 가능, 20,053ms에 768px 미리보기→1,219px 원본. 기출 1쪽: 326ms에 편집 가능, 3,039ms에 707px→1,684px 원본. 두 경우 화면 Y 위치 변화 0px, 페이지 오류 0. 원본 해상도·크기·다운로드 병목은 그대로이며, 저장된 목록이 전체 본문이나 원본 PDF를 대체하지 않습니다.

#### 증거와 한계

로컬 비공개 `.omo/evidence/library-startup/`: `unit-final.log`, `full-browser.log`, `elapsed-retry.log`, `full-browser/`, `physical-reference/`, `source-binding.json`, `preservation.json`, `startup-measurements.json`, `startup-summary.json`, `live-original-results.json`, 실제 화면 PNG, `server-cleanup.json`. 최초 시간초과 기록도 보존했습니다.

반복 측정은 Chromium, 기능 검수는 Chromium/WebKit입니다. OS 네이티브 저장창·설치판·기기·실계정/유료 AI 호출은 검증하지 않았습니다. 전체 검사 첫 실행의 기존 경과시간 테스트에서 시간초과가 있었으며 단독 재검 통과만으로 그 간헐성을 해결했다고 주장하지 않습니다. A2 이미지 입력 제한과 A3 백업 예산은 아직 미착수입니다.

#### 다음 작업 하나

A2: 일반 이미지 가져오기·드롭에서 읽기 전 단일·다중 파일 용량과 합산 예산을 확인합니다. 이번 세션에서 시작하지 않았습니다. main 병합·push·태그·배포는 별도 사용자 지시가 필요합니다.
