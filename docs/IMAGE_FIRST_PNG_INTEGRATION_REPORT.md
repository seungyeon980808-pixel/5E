> 이 문서는 이전 단계의 조건·검증 기록을 포함합니다. 현재 제품의 첫 변환은 승인된 고정 요청으로 PNG 1장만 생성하며 사전 AI 관찰·자동 검수·자동 교정을 실행하지 않습니다. 최신 운영 조건은 `IMAGE_WORKBENCH_OPERATIONS.md` 앞부분을 우선합니다.

# 첫 PNG 제품 연결 기록 · 2026-09-08

## 결과와 범위

현재 프로젝트의 실제 이미지 작업창 변환 버튼에 승인된 첫 변환 조건을 연결하고, 분리 환경의 부분 수정 코드도 기준선과 비교하여 병합했다. 실제 AI 생성은 이번 작업 전체에서 **1회**, 결과 PNG 1장이다. 자동 재시도·선행 AI 관찰·자동 검수·자동 교정은 실행하지 않았다. 품질 승인은 사용자에게 남아 있다.

브랜치 `feat/image-improvement`, HEAD `4251a803128ac8963c4f8018418a03c0558781ea` 유지. 커밋·푸시·배포·설치본 교체 없음. 기존 dirty/untracked 작업과 원본·승인 이미지 보존.

백업 및 모든 검사 근거의 루트는 `/Users/parkseungyeon/Documents/Codex/5E-image-backup-20260908-ohIcMp`이다. 이하 B는 이 경로를 뜻한다.

## 실행 경로

제품 경로는 `desktop/main.cjs → index.html → js/ai-panel.js → fiveEDesktop IPC → sendTurn → codex app-server thread/start → turn/start`이다. 이번에는 현재 프로젝트의 index.html과 JS, 현재 desktop/main.cjs를 그대로 읽는 B/product-adapter.cjs를 사용했다. Electron 전송 표면만 HTTP/SSE로 연결하고 실제 제품 파일 첨부 및 **평가원식으로 만들기** 버튼을 브라우저에서 조작했다. 별도 검사용 도판 UI에만 연결한 것이 아니다.

실행 주소는 `http://127.0.0.1:19382`이다. 어댑터는 B/real-call-used.json을 첫 요청 전에 배타적으로 기록하여 추가 실제 요청을 차단한다. 이 파일을 지우거나 우회하지 말 것. 이 제한은 이번 검증 어댑터의 호출 예산 보호이며, 제품 전체의 영구 1회 제한은 아니다.

Electron 직접 실행은 준비된 창을 확인하지 못했다. 따라서 위 결과는 실제 백엔드를 사용하는 제품 브라우저 경로 검증이며 Electron 네이티브 또는 Windows 설치본 E2E 통과를 뜻하지 않는다. 설치본 변경 없이 네이티브 검증을 할 수 있는 실행 환경은 후속 확인이 필요하다.

## 생성 조건과 산출물

- 모델 `gpt-5.6-sol`, reasoning `medium`, service tier `priority`. 실제 사용 가능 모델 목록과 전송 요청에서 확인했다. 대체 모델 없음.
- 승인 프로토콜의 generation-prompt.txt와 common-request.txt를 고정 사용. generation prompt SHA256: `8d6180f311791d497469d93cbc0eff98919b0d376d84a958f2b391c475e14067`.
- 대표 입력: 기존 승인 24개 중 `selection/unit-01/U01-1.png`, 1450×600, 455292 bytes. 원본과 전송 입력 바이트 동일. STYLE 없음, 그림별 추가 프롬프트 없음.
- 요청 시각: 2026-09-08 12:00:28.447 UTC. imageCallCount=1, imageFailedCount=0. 첫 이미지 수신 뒤 정상 자동 종료를 위한 interrupted 이벤트가 있었으며 생성 실패나 재시도가 아니다.
- 보존 결과: B/evidence/U01-1-first-product.png, **1950×807, 836183 bytes**.
- 네이티브 생성 파일: `/Users/parkseungyeon/.codex/generated_images/01a080e4-1ef2-7ba3-b849-2b79b85644ae/exec-2772d801-e317-4cf4-baf0-6720ce6c3fe4.png`.
- 두 파일 SHA256 동일: `0f8387e04c188ccea1c268acdf12b1d2ebbed56b8d0f1d0955bcdd500356ed11`.

전체 변환 출력은 후처리·양자화·OCR·SVG 대체 없이 보존했다. 불투명 PNG이며 두 비커, 전환 화살표와 왼쪽 침전은 보인다. 그러나 독립 픽셀 검사에서 R=G=B가 아닌 픽셀이 **487745개**로, 엄밀한 무채색 조건은 통과하지 않는다. 이 결과를 자동으로 고치거나 재생성하지 않았다. 테스트 개수는 이미지 품질 점수가 아니다.

## 구간별 시간

| 구간 | 실제 AI 1회 | 최종 코드의 로컬 보존 PNG 재생 |
|---|---:|---:|
| 클라이언트 입력 준비 | 17 ms | 50 ms |
| AI 응답 대기 | 62841.9 ms | 168.6 ms (모의 응답, AI 성능 아님) |
| 전체 PNG 합성 | 0 ms (합성 작업 없음) | 0 ms (합성 작업 없음) |
| PNG 픽셀 검사 | 표시와 합쳐 50.5 ms | 70.3 ms |
| 이미지 decode 및 DOM 등록 | 위 합산값에 포함 | 0.9 ms |

실제 백엔드 totalMs=62827, prepareMs=658, imageStartMs=37894, imageToolMs=24906. 백엔드 준비 시간은 클라이언트 AI 응답 대기에 포함되므로 더해서 계산하지 않는다. 이미지 도구 시작 전 약 37.9초에는 스레드 준비·모델 처리·스킬 읽기 등이 포함되며 전부 대기열 시간이라고 단정할 수 없다. 병목은 AI 응답 구간이다. 모델·해상도·품질을 낮추는 변경은 하지 않았다.

실제 생성 이후 PNG 검사를 Canvas 경유에서 원시 RGBA decode로 바꾸고 검사/표시 계측 및 비동기 표시 중 stale 차단을 보완했다. 따라서 실제 1회의 검사와 표시 시간을 소급해서 분리할 수 없다. 최종 코드는 같은 PNG를 재생하여 검증했으며 추가 실제 생성은 없다. DOM 등록 시간은 화면 compositor/paint 완료 시간이 아니다. 로컬 재생 입력은 결과 PNG여서 실제 원본 입력의 준비 성능과 직접 비교할 수 없다. 세부 기록: B/evidence/client-timing.jsonl, runtime-events.jsonl, local-replay-timing.json(마지막 항목이 최종 코드).

## 새 검증과 한계

- 기준선 tracked diff와 초기 현재 diff 동일 확인. baseline 파일 지문 차이는 운영 문서뿐이었다. 전달 묶음 15개 SHA 확인 후 기존 파일은 패치로 병합했다. 과거 445개 로그를 현재 검사로 재사용하지 않았으며 병합 직후 새로 445개를 실행했다.
- 최종 **npm test 451 pass / 0 fail**. 검사 전후 HEAD, tracked diff SHA, 대상 코드·테스트 19개 파일 SHA 동일. B/evidence/final-tests.log와 final-fingerprint*.json에 기록했다. 이 보고서와 운영 기록 추가는 이후 문서 변경이다.
- 현재 제품 UI + LOCAL MOCK으로 범위 지정 → 확인 → 후보 비교 → 명시적 적용을 실행했다. 브라우저 결과와 독립 재생 PNG SHA 동일. 허용 영역 x[395,766), y[186,394), 내부 변경 62211개, **외부 RGBA 변경 0개**. 독립 디코더로 저장 후 재읽기 검사했다. B/evidence/mock-png-verification.json 참조.
- 지연 모의 응답 중 버전을 변경하면 이전 후보가 나타나지 않고 버전 수가 유지됨을 새로 확인했다. decode 대기 중 작업 변경 회귀 검사도 추가했다. 사용자 적용 전 원본 교체 없음. 부분 수정 AI는 호출하지 않았다.
- 실제 결과의 미리보기 src, 페이지에 삽입된 image href, 실행 취소/다시 실행, 페이지 새로고침 후 복원 PNG가 생성 원본 바이트와 같음을 확인했다. 최종 코드에서도 보존 결과를 복원했다.
- **PNG 저장 버튼은 눌렀지만 브라우저 다운로드 완료 이벤트 및 사용자 다운로드 경로를 확인하지 못했다.** 생성기의 실제 파일 저장·재읽기는 검증됐으나 제품 다운로드 완료를 통과로 보고하지 않는다.
- 현재 PNG 디코더 지원은 8bit 비인터레이스 RGB/RGBA이다. 지원하지 않는 PNG까지 검증됐다고 일반화하지 않는다. 실제 scoped AI 품질, Electron 네이티브, Windows, 다양한 이미지의 품질은 미검증이다.
- 읽기 전용 검토자의 제한된 단일 호출 경로 검토에서 계측 혼합·문구·표시 stale 경계 지적을 반영했다. 이는 네이티브 E2E나 최종 사용자 품질 승인에 해당하지 않는다.

## 이번 변경 파일

기존 파일 수정: `js/ai-panel.js`, `js/ai-workbench.js`, `js/ai-png-inspection.js`, `tests/test-ai-png-inspection.mjs`.

신규 구현: `js/ai-approved-first-png.js`, `js/ai-scoped-edit.js`, `js/ai-scoped-edit-png.js`, `js/ai-scoped-edit-session.js`, `js/ai-scoped-edit-comparison.js`.

신규 검사: `tests/helpers/scoped-edit-png-fixture.mjs`, `tests/test-ai-approved-first-png.mjs`, `tests/test-ai-scoped-edit.mjs`, `tests/test-ai-scoped-edit-comparison.mjs`, `tests/test-ai-scoped-edit-panel-integration.mjs`, `tests/test-ai-scoped-edit-panel.mjs`, `tests/test-ai-scoped-edit-png-adapter.mjs`, `tests/test-ai-scoped-edit-png.mjs`, `tests/test-ai-scoped-edit-review-state.mjs`, `tests/test-ai-scoped-edit-timing.mjs`.

문서: 이 보고서 추가 및 `docs/IMAGE_WORKBENCH_OPERATIONS.md` 앞부분 갱신. git status의 나머지 기존 변경은 이번 작업의 성과로 계산하지 않는다.

## 안전한 복구

B/worktree-files.tar.gz는 시작 시 tracked 및 untracked 비무시 파일의 백업이고 B/tracked.diff, status.txt, HEAD.txt는 당시 상태다. 전체 압축을 프로젝트 위에 덮어쓰거나 reset/clean하지 말 것.

B/own-existing-file-changes.patch는 시작 당시 파일에서 이번 최종 코드까지의 차이만 담는다. 후속 변경이 없는지 먼저 대조한 다음 `git apply --reverse --check`로 적용 가능성을 확인하고 이번 변경만 역패치할 수 있다. 충돌하면 자동 복원하지 말고 B/original-edited-files의 원본과 수동 병합한다. B/own-added-files.json의 이번 신규 파일은 참조 관계를 되돌린 후 별도 폴더로 이동하여 보존한다. 문서는 이번 제목 구간과 새 보고서만 분리 보관한다.

검증용 모의 서버는 종료했다. 실제 결과 확인용 어댑터만 남겼으며 B/real-call-used.json을 유지한다. 모든 서버를 종료하려면 해당 product-adapter.cjs 프로세스만 종료하면 된다. 추가 실제 AI 생성 및 설치본 교체는 별도 사용자 승인 범위다.
