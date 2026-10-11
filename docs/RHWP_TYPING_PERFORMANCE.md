# 5E / RHWP typing latency: 2026-10-09

## 결론

실제 `2026 원안 양식.hwp`에서 입력 중 반복되는 5E 그림 목록 조회와
연결 검사를 확인하고, 조합/연속 입력이 끝난 뒤 실행하도록 수정했다.
문서 변경이 없는 키 이동은 그림 목록 캐시를 재사용한다.

**실제 macOS Safari 한글 입력기의 심한 지연을 해결했다고 판단할 근거는
아직 없다.** 아래 타이밍은 Playwright WebKit의 합성 DOM 입력이다.
실제 문서에서는 RHWP의 렌더링과 커서 계산이 더 큰 비용이었다.
RHWP 바이너리/렌더링 알고리즘은 이번 패치에서 변경하지 않았다.

## 작업 기준과 문서

- 기준 커밋: `757287ca107a6142d8f5d24dd658ba7b2a175bee`.
- 브랜치: `perf/rhwp-typing-latency`.
- 별도 작업 폴더:
  `/Users/parkseungyeon/.codex/worktrees/rhwp-typing-performance/5E`.
- 원래 `codex/rhwp-exam-workspace` 작업 폴더는 수정하지 않았다.
- 문서: `2026 원안 양식.hwp`, 102400 bytes, 1 page, 그림 없음.
- SHA-256:
  `3014f66c2e1ef1ec9db577a939e7f1d523559aae56d0504f0b9f93ccbf2eb8f5`.
- Studio/SDK: 기존 고정 0.8.7, canvas2d. WASM 및 vendor 파일 변경 없음.

문서의 RHWP `getFieldList()` 결과는 빈 배열이었다. 헤더의 **고사 구분**
칸을 입력 칸으로 비교했으며, 이 칸은 RHWP form field가 아닌 표 셀이다.
존재하지 않는 native form field를 검증했다고 보고하지 않는다.

## 확인한 원인과 비용

1. 기존 `keyup`은 매번 별도 RAF 목록 갱신을 예약했다. 목록 UI가 같아도
   `documentPictures()`는 서명 비교 전에 모든 페이지를 조회했다.
2. `document-changed`는 목록과 연결 검사를 즉시 시작했다. 표 조합에서
   이 후처리가 `input.isComposing === true`인 동안에도 실행됐다.
3. page-local 입력은 `document-mutated`만 보낼 수 있다. 기존 bridge가
   이 이벤트를 듣지 않아 로컬 입력의 revision/자동 저장 통지가 누락될 수 있었다.
4. 전체 저장은 입력 정지 900 ms 뒤 실행된다. 이 문서에서는 전체 프로젝트
   저장의 수정 전 중앙값이 5-6 ms였으므로 주된 병목으로 보지 않는다.
   다만 긴 조합 중에는 저장을 시작하지 않도록 막았다.
5. RHWP의 text-local API에는 조판 비용도 포함된다. 별도의 `refreshLayout`
   호출만으로 전체 조판 비용을 설명할 수 없다.

수정 전 한글 20글자의 CPU 중앙값:

| 위치 | 5E 목록 CPU | 페이지/제어 조회 CPU | RHWP raster CPU | 주요 커서 geometry CPU |
| --- | ---: | ---: | ---: | ---: |
| 본문 | 16 ms | 11 ms | 1069 ms | body rect 197 ms |
| 표 | 25 ms | 22 ms | full + patch 274 ms | cell rect 184 ms |
| 헤더 입력 칸 | 23 ms | 조회 83회 | 1221 ms | 원시 기록 참조 |

목록 CPU 안에 페이지 조회 CPU가 포함된다. inclusive span들을 더하면
중복 계산된다. 모든 계측은 top frame의 같은 시계를 사용하며,
동기 CPU와 비동기 wall span을 구분한다. 수정 후 native raster 비용은
본문 1068 ms, 표 279 ms, 헤더 1202 ms로 거의 그대로 남았다.

## 수정 방식과 변경 파일

- `js/rhwp-exam-bridge.js`: 문서 generation/revision별 그림 목록 캐시,
  `document-mutated` 구독, 설명/이미지 교체 시 캐시 무효화.
- `js/rhwp-exam-workspace.js`: RAF 갱신 예약 하나로 통합. 문서 후처리는
  입력 정지 160 ms 후 목록/연결 검사로 통합. 조합 중 목록/연결 검사와
  자동 저장을 보류하고 조합 종료/취소 뒤 재개. 저장 전 미처리 연결 검사를
  기다린다. 원래 900 ms 저장 간격과 저장 중 변경 재캡처는 유지한다.
- `tests/profile-rhwp-exam-typing.cjs`: 실제 문서 경로를 받아 반복 계측.
  계측 코드는 테스트의 HTTP route에만 삽입되고 제품 코드에 남지 않는다.
- `tests/test-rhwp-exam-typing-browser.cjs`: 제어된 브라우저 시계로
  1200 ms 조합, 중복 예약, 캐시, 저장 재개, 빈 조합 취소를 검증.
- `tests/suite-manifest.json`: 새 회귀 검증을 기존 브라우저 실행기에 등록.
- 이 보고서.

## 동일 조건 전후 측정

macOS / Apple M5, Node 24.21.0, Playwright 1.62.1 WebKit,
1440 x 950 viewport, RHWP zoom 100%, 동일 로컬 origin과 문서.
매 반복마다 새 context로 같은 파일을 열었다. 각 위치에서 한글 20글자,
영문 20글자, 입력한 영문 20글자 삭제를 같은 순서로 수행했다.
각 조건 5회 중앙값이다.

- 본문: section 0, paragraph 4, charOffset 0.
- 표: parent paragraph 5, control 0, cell 0, cell paragraph 0.
- 헤더 입력 칸: parent paragraph 0, control 4, cell 6, cell paragraph 0.
- 한글은 글자마다 `compositionstart`, `ㅎ/하/한` input, `compositionend`.
  중간 keyup도 발행한다. 각 fragment 뒤 RAF, 각 글자 뒤 두 RAF로
  렌더링 기회를 동일하게 줬다. 아래 전체 시간에는 이 pacing이 포함된다.
- 실제 삽입/삭제 20개가 반영됐는지 커서 offset으로 확인했다.

| 위치 | 입력 | 수정 전 전체 시간 | 수정 후 전체 시간 | 입력 중 전체 페이지 조회 |
| --- | --- | ---: | ---: | ---: |
| 본문 | 한글 조합 | 2267 ms | 2146 ms | 65 -> 0 |
| 표 | 한글 조합 | 1883 ms | 1850 ms | 84 -> 0 |
| 헤더 입력 칸 | 한글 조합 | 2499 ms | 2476 ms | 83 -> 0 |
| 본문 | 영문 | 902 ms | 919 ms | 22 -> 0 |
| 표 | 영문 | 950 ms | 966 ms | 32 -> 0 |
| 헤더 입력 칸 | 영문 | 1069 ms | 932 ms | 38 -> 0 |
| 본문 | 삭제 | 950 ms | 898 ms | 20 -> 0 |
| 표 | 삭제 | 883 ms | 863 ms | 25 -> 0 |
| 헤더 입력 칸 | 삭제 | 984 ms | 932 ms | 35 -> 0 |

한글 전체 시간 변화는 본문 -5.3%, 표 -1.8%, 헤더 -0.9%이다.
영문 본문/표는 오히려 소폭 늘었다. 반복 조회 제거와 조합 중 후처리
제거는 확인됐지만, 전체 체감 속도의 큰 개선이나 특정 함수의 단독 개선
비율을 주장하지 않는다. native 렌더링 비용과 실행 간 변동이 남아 있다.

입력 중 0회는 조회 자체를 없앴다는 의미가 아니다. 입력 정지 뒤 연결 검사,
목록 표시와 저장을 수행한다. 저장 단계의 페이지 조회는 중앙값 2회에서
1회가 됐다. 수정 후 전체 저장 wall 중앙값은 본문/표 run 9 ms,
헤더 run 10 ms였다. 헤더의 저장 계측은 기존 `stableSave` 경로를 사용한다.
변경 중 단일 `saveNow`가 null을 반환한 실패 시도는 성공 결과에서 제외했다.

원시 기록은 Git에 넣지 않은 `_work/rhwp/typing-performance/`의
`baseline.json`, `after.json`, `baseline-header.json`, `after-header.json`에 있다.
각 반복의 event duration, RAF interval, 위치, inclusive/exclusive span과
composition-active 호출 개수를 보관한다.

## 회귀 검증과 남은 한계

- 전체 단위: 462개 중 461 통과, 실패 0, 기존 선택 실행 기하 검증 1개 제외.
  처음 실행은 `js-yaml`이 없는 환경에서 실패했다. 기존 설치의 정확한
  4.3.2를 `NODE_PATH`로 지정한 뒤 정상 통과했다. 의존성 파일 변경 없음.
- 선택 실행인 실제 Chromium/WebKit 기하 검증도 별도로 실행해 17/17 통과,
  실패/제외 0을 확인했다.
- 기존 워크플로우 6개를 root/preview x Chromium/WebKit 네 조합으로 통과.
  HWP/HWPX 열기/저장, 취소/재선택/손상 파일 복구, 한 탭 한 그림,
  이름 동기화, 복사 분리, 본문/표 삽입, 원본 편집 복귀와 재전송,
  라벨/지시선 더블클릭, 크롭 유지/조정, AI 이력과 미반영 초안의
  .5e 저장/재열기, native/drawing/inline undo/redo를 포함한다.
- 새 조합 회귀는 Chromium/WebKit에서 통과. 수정 전에는 조합 중 목록
  조회 조건에서 실패했고, 수정 후에는 장시간 조합/취소 중 무거운 후처리
  없음, 종료 후 연결 검사 1회, keyup 40개당 RAF 1회, 수정 없는 이동의
  페이지 조회 0회, 900 ms 뒤 자동 저장 재개를 확인했다.
- 데스크톱 주석 IPC 계약은 `--ipc-only`로 통과. Electron 실행 파일을
  확보하지 못해 실제 두 창의 포커스/왕복은 이번 수정에서 다시 실행하지 못했다.
- 시스템 WebKit(Bun.WebView)에서 실제 파일의 열기/표시와 1440/390 폭을
  확인했다. DOM 파일 입력으로 열었으며 실제 Safari 파일 선택/IME 검증이 아니다.
  Omowright QA는 CDP session 오류로 실패하여 이 화면 검증을 대신 사용했다.
- LSP 서버(typescript-language-server / biome)가 없어 LSP 진단은 미실행.
  변경 JS/CJS는 `node --check`와 실제 회귀 테스트로 확인했다.
- macOS 화면 기록/손쉬운 사용 권한이 거부되어 **실제 Safari의 한글 입력,
  사용자 키 입력부터 paint까지 지연, 사용자 원래 위치에서의 심한 지연**은
  미검증이다. 실제 native form field도 이 파일에 없으므로 미검증이다.

실제 Safari 확인은 Terminal에 화면 기록과 손쉬운 사용 권한을 허용하고
앱을 완전히 종료/재실행한 뒤 진행해야 한다. 같은 원안 파일, 위 위치,
100% 배율과 viewport를 유지하고 실제 한글 입력기의 이벤트/paint trace를
비교해야 한다. 현재 결과만으로 native raster나 커서 계산을 생략하는
패치를 추가하면 조합 표시/조판 정확성을 검증할 수 없다.

## 재현 명령

이 작업 폴더에서 문서의 실제 경로를 `RHWP_DOCUMENT`로 지정한다.
설치된 프로젝트 Playwright가 없으면 `PLAYWRIGHT_MODULE`에 1.62.1
설치 경로를 지정한다. 제품 코드는 계측에 필요한 전역 API를 노출하지 않는다.

```sh
node tests/test-rhwp-exam-typing-browser.cjs
test -f "$RHWP_DOCUMENT" &&
  MEASURE_PHASE=local REPETITIONS=5 node tests/profile-rhwp-exam-typing.cjs
RHWP_GEOMETRY_BROWSER=1 node --test tests/test-rhwp-exam-geometry.mjs
node tests/test-rhwp-exam-desktop.cjs --ipc-only
```

위 명령은 테스트 도우미가 임시 포트의 로컬 서버를 시작/종료한다.
수정 전 비교는 기준 커밋의 제품 코드에 같은 profile script를 사용한다.
문서 본체와 편집 결과는 저장소에 추가하지 않는다.
