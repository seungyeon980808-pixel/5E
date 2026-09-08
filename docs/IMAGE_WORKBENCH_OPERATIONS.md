## 2026-09-08 사용자 기능 확인 후 로컬 커밋

- 구현·회귀 테스트 체크포인트: `f5170d86` (`feat(image): integrate one-shot PNG workbench and scoped edits`).
- 커밋 직전 `npm test` 467/467 통과. 실제 AI 추가 호출 없이 기존 검증된 코드를 기록. 푸시·배포·설치본 교체 없음.
- 사용자 수동 변환은 횟수 제한 없음. 에이전트의 실제 AI 변환 호출 제한과 구분한다. 아래 과거 보고서의 어댑터 1회 차단 설명은 당시 검증 조건이다.

## 2026-09-08 작업실 UI·코멘트 키보드·비교 정렬

- 작업 삭제 되돌리기 제거. 삭제 확인창은 기존 패널/텍스트/테두리/강조색 토큰 사용. 이미지 후보 확인창은 넓은 크기 유지.
- 점·영역 코멘트 선택 후 Delete 또는 Backspace로 삭제. 입력 필드/조합 입력/실행 중/확인창 표시 중에는 코멘트 삭제 차단. 코멘트 선택 시 작업실에 포커스를 두며 텍스트 편집은 편집란에서 수행.
- 나란히 비교에서 두 제목 영역과 이미지 카드 제목 높이를 통일. 원본 전용 중복 요약 줄은 나란히 보기에서 숨김. 양쪽 이미지의 표시 높이를 동일하게 계산하며 원래 종횡비 유지. PNG 바이트/마스크/생성 조건 변경 없음.
- 새 npm test 467/467. 동일 제품 코드 LOCAL MOCK 브라우저: 원본/결과 top=268px, height=152px 일치; 점 선택 Delete 삭제 1→0; 텍스트 Backspace는 코멘트 유지; 확인창 시각 검사 및 삭제 후 되돌리기 버튼 0 확인. 점/영역 키보드 보호·서로 다른 종횡비 정렬은 행동 회귀 검사 추가. 실제 AI 0회.
- 변경 파일 및 지문 `.omo/evidence/workbench-polish/verification.json`; 이번 작업 전 소스 `before/`. 복구는 해당 백업과 비교하여 이번 변경만 역적용. 설치본 교체/커밋 없음.

## 2026-09-08 빈 작업 깜빡임·삭제 수정

- 빈 탭 전환에서 overlay의 `modal-overlay-fade`가 실행되어 캔버스가 잠깐 보임을 LOCAL MOCK 실제 브라우저로 재현. 작업실 overlay 애니메이션을 제거했고 변경 후 `animation:none`, `opacity:1` 확인.
- × 클릭의 native `window.confirm`이 브라우저 입력을 막는 현상 재현. 제품 내부 `scopedDialog`로 변경. 마지막 탭 삭제 시 자동으로 같은 workspace에 탭을 생성하던 동작 제거. 빈 workspace 저장을 복원 시에도 유지하며 다른 작업으로 이동. 삭제 되돌리기 제공. 모든 작업을 삭제한 경우에만 새 빈 작업을 제공.
- 신규 검사: LOCAL MOCK에서 삭제 7→6, 되돌리기 6→7, 다시 삭제·새로고침 후 6 유지, 삭제 취소 시 7 유지. npm test 464/464. 실제 AI 호출 0, PNG 생성/재인코딩 없음. 기존 생성 설정 변경 없음.
- 변경: js/ai-panel.js, js/ai-task-workspaces.js, css/ai-panel.css 및 관련 회귀 테스트. 근거 `.omo/evidence/task-empty-delete/`. 복구는 `before/`와 비교해 이번 변경만 역적용. 기존 작업 저장소를 삭제하지 않는다.

## 2026-09-08 작업 목록·선택 복원 수정

- `js/ai-task-workspaces.js`: 기존/신규 scope의 실제 이미지 작업을 한 목록에 표시. active scope+task를 저장하고 IndexedDB 복원 완료 뒤 선택을 복원한다. 진행 중 scope와 신규 scope의 독립 실행 유지.
- `js/ai-panel.js`: 실제 탭 목록/선택 API 제공. 현재 작업 초기화는 확인창 뒤 해당 작업만 비우며 busy에서는 먼저 취소 완료를 안내한다.
- 새 검사: npm test 460/460. 포트 19386 LOCAL MOCK에서 목록 왕복·입력 보존·새로고침 선택 복원·동시 busy 2→0·초기화 시 타 작업 결과 보존을 직접 확인.
- 실제 AI 호출 0회. 실제 제품 서버 19382는 동일 정적 파일을 제공하며 이미 열린 탭은 새로고침해야 새 코드를 읽는다. Electron 설치본 교체 없음.
- 근거: `.omo/evidence/image-task-navigation/verification.json`, `tests.log`. 복구: `before/`의 두 JS 파일과 현재 변경을 비교하여 이번 변경만 역적용. 기존 저장소/PNG를 삭제하지 않는다.
- 제한: 과거 legacy scope 내부의 다른 탭은 해당 scope 변환 중 기존 잠금 유지. 새 작업은 독립 scope로 생성되어 이동·동시 변환 가능.

# 이미지 작업창·검수 통합 운영 기록

## 최신 진행: 독립 이미지 작업 동시 실행
- 변환 중 새 작업 버튼을 막던 전역 busy 제한을 제거했다. 새 작업은 독립 패널 컨트롤러·DOM·대화·IndexedDB 저장소를 가지며 기존 작업창으로 돌아갈 수 있다. 기존 저장 탭은 첫 작업창에 그대로 복원된다.
- desktop/main.cjs의 Codex 실행 상태를 clientScope별 런타임으로 분리했다. 요청·이벤트·취소·종료를 작업창별로 라우팅하여 한 작업의 완료나 취소가 다른 작업을 종료하지 않는다. desktop/preload.cjs와 localhost:19382 어댑터도 같은 scope를 전달한다.
- 새 npm test 457/457 통과. 신규6개: 브리지 격리2, 모의 프로세스 기반 백엔드 격리4. 이전 단일 전역 busy를 요구하던 정적 검사는 새 요구사항에 맞춰 갱신했다. 로그: `/Users/parkseungyeon/Documents/Codex/5E-image-backup-20260908-ohIcMp/evidence/concurrent-tests.log`.
- 현재 제품 UI + LOCAL MOCK에서 두 작업이 동시에 busy=true, 각 결과1개, 추가 두 작업 중 하나만 취소하면 다른 작업은 완료됨을 확인했다. 새로고침 후 작업창4개의 결과 수 [1,1,1,0]와 입력 각1개 복원 확인. 실제 AI 호출은 0회이며 실제 병렬 생성 품질/서비스 제한을 검증한 것은 아니다.
- 사용자 기존 작업이 완료된 상태에서 실제 로컬 어댑터를 재시작했다. 브라우저 최신 코드에서 기존 사용자 탭2개·현재 결과2개 복원과 AI 사용 가능 확인. 설치본 교체 없음.
- 이번 변경 파일: js/ai-task-workspaces.js(신규), js/ai-panel.js, js/ai-workbench.js, desktop/main.cjs, desktop/preload.cjs, desktop/codex-parallel-scopes.test.cjs(신규), tests/test-ai-task-bridge.mjs(신규), desktop/ai-post-image-unlock.test.cjs, desktop/codex-client.test.cjs, tests/test-ai-image-comments.mjs, tests/test-ai-panel-local-bypass.mjs. 기존 unrelated dirty 작업 유지.
- 한계: 작업창별 Codex 프로세스는 서버 종료까지 유지된다. 실행 중 페이지 새로고침의 작업 재접속은 이번 지원 범위가 아니며, 완료된 결과의 저장·복원만 확인했다. 백업 concurrent-before/에 프런트엔드·preload·어댑터 변경 전 파일 보존. 복구 시 전체 덮어쓰기 대신 이번 차이만 대조하여 되돌릴 것.

## 최신 사용자 테스트 권한 갱신
- 사용자가 직접 실행하는 변환은 테스트를 위해 1회 제한을 해제하도록 명시적으로 승인했다. 에이전트가 실행하는 실제 변환만 기존 1회 제한을 유지한다(이미 사용 완료).
- localhost:19382 어댑터의 공통 요청 차단을 제거하고 서버를 재시작했다. 이번 변경에서 실제 AI 호출은 0회이며 모델·프롬프트·품질 조건은 변경하지 않았다. 어댑터는 클릭 주체를 기술적으로 구분하지 않으므로 에이전트는 추가 변환 버튼을 누르거나 send 요청을 보내지 않는다.
- 이전 기록의 real-call-used.json은 과거 1회 생성 근거로 보존하지만 더 이상 사용자 요청 차단에 사용하지 않는다. 백업의 product-adapter.before-user-unlock.cjs에 이전 어댑터를 보존했다.

## 최신 진행: 현재 제품 첫 PNG 연결 및 실제 생성 1회 (2026-09-08)
- 기존 dirty/untracked 백업 후 기준선 비교·부분 수정 코드 병합 완료. 실제 제품 변환 버튼에 승인 공통 프롬프트와 gpt-5.6-sol / medium / priority 고정 조건 연결. STYLE·선행 AI 관찰·자동 검수·자동 교정 없음.
- 실제 제품 UI와 현재 desktop/main.cjs를 HTTP/SSE 어댑터로 연결해 U01-1 실제 AI 1회 실행, PNG 한 장 보존. 추가 실제 호출 없음. Electron/Windows 네이티브 통과로 간주하지 않는다.
- 새 최종 검사 451/451 및 검사 전후 코드 지문 일치. 새 LOCAL MOCK 부분 수정 검사에서 영역 밖 RGBA 변경 0, 명시적 적용·stale 차단 확인. 실제 PNG 바이트 동일 저장·재읽기·페이지 삽입·복원 확인. 브라우저 다운로드 완료는 미확인.
- 실제 AI 응답 약 62.842초. 실제 검사/표시는 합산 50.5ms이며 이후 최종 코드의 분리 계측은 보존 PNG 로컬 재생으로만 확인했다. 품질 최종 판단은 사용자에게 남으며 엄밀한 무채색 픽셀 조건은 미통과. 자동 재생성하지 않았다.
- 상세 산출물·실행 경로·변경 파일·한계·복구: [IMAGE_FIRST_PNG_INTEGRATION_REPORT.md](IMAGE_FIRST_PNG_INTEGRATION_REPORT.md). 백업: `/Users/parkseungyeon/Documents/Codex/5E-image-backup-20260908-ohIcMp`. 커밋·푸시·배포·설치본 교체 없음.
- 아래 기록은 이전 이력이며 원프로젝트 미반영/반영 승인 대기 등의 상태는 이 항목으로 갱신한다.

## 최신 진행: 영역 밖 픽셀 보존 (2026-09-08)
- 사용자 최종 승인: 수정2개를 포함한 교과서24개 확정. 생성 모델·프롬프트·품질조건은 유지하고, 속도·영역수정·변경비교만 개선한다.
- 절대 계약: 허용 영역 밖의 RGBA 픽셀 불변. 전체 변환 후처리는 금지하며 부분 수정의 선택 영역 교체만 승인된 설계 범위다.
- 분리 worktree: `/Users/parkseungyeon/.aside/u/0/sessions/2026-09-07_bTSr3fYASfFkTKSA/tmp/5e-scoped-edit-core`. 기존 dirty소스까지 복사, 원본 코드에 미통합. baseline은 artifacts/5e-scoped-edit-core-01/baseline.json 및 baseline-tracked.diff.
- 완료: js/ai-scoped-edit.js 및 단위검사7개. 테스트 전용 PNG 저장·재읽기 검사3개 추가. 부모가 총10 pass/0 fail 재실행 확인. 실제U01-3 입력복사·투명/반투명·불연속mask 검증. PNG코덱은 8bit RGB/RGBA 비인터레이스 한정, 제품지원으로 간주하지 않는다.
- 어댑터·검증 화면 완료: caBX provenance는입력decode허용·편집출력재사용금지·removedMetadata로명시, 원본색메타데이터유지. 부모가전체15tests통과재확인. 실제브라우저 http://127.0.0.1:60549/index.html 에서영역드래그(x517…1284,y60…189)→검증실행→실제PNG재디코드후외부RGBA차이0, 내부변경87706픽셀확인. 신규AI호출없음. 원본파일/승인이미지미변경. 이화면은검증용이며현재5E미연결.
- 연결점 분석 완료: R85K2fXhq3vSegsw가 submit/request snapshot, resolveGeneratedRaster→addPreview, stage/commit, save/insert, 자동검수·교정충돌지점을확인.
- 연결 작업 중단·복구: juu57E0uGwDjIBMQ가 fetch failed로종료. 부모가ai-panel.js의baseline해시일치와신규session/test파일부재를확인했으므로기존735줄diff를이작업의성과로계산하지않음.
- 부모 직접 구현 완료: js/ai-scoped-edit-session.js 및 tests/test-ai-scoped-edit-panel.mjs. 원본·정수영역private복사,범위확인/수정안준비/사용자적용분리,task/epoch/version/selectionRevision/source byte변경차단,preview바이트copy,폐기/중복/다른세션적용차단. 실행검사8개추가,전체23pass/0fail부모확인. 아직UI실행검사가아님.
- UI 코드 작성 완료: 8wxUZGcsR5AlxH5L이분리worktree js/ai-panel.js 및신규tests/test-ai-scoped-edit-panel-integration.mjs를작성. 부모가31/31재실행확인(신규7실행+1정적). HTML범위확인/후보적용dialog,task/version/영역고정,별도transport,accepted PNG만addPreview연결. 실제브라우저검증은아직아님.
- 부모 연결 결함 수정: 정상first-image자동interrupt후interrupted종료를실패로판단하는문제수정,confirmed/recovered에status필드가없는정상경로도허용하되사용자취소/PNG없음/명시실패차단. 반례2개추가후33/33재실행. 새버튼이기존CSS에서숨겨지는문제발견해고정footer로이동. 기존생성/코멘트적용버튼의사용자후속수정도영역제한경로로보내우회방지(첫변환및내부기존snapshot경로유지). footer/라우팅의실제브라우저검증대기.
- 브라우저 검증 완료(한정): HICu7FDsU39IzoIC harness를 http://127.0.0.1:55778/?delay=80&terminal=completed 에서부모실행확인. 실제worktree UI+LOCAL MOCK,실AI호출없음. 기존코멘트반영버튼→정수범위확인진입,확인취소시mock로그23→23/원본불변,후보취소시원본불변,자동first-image interrupting→interrupted 응답→후보→명시적적용성공. 버전2추가및버전1존속을DOM options로확인(Playwright중첩locator.count는1오표시하여DOM재확인). 적용PNG=후보PNG bytes동일. 독립테스트코덱으로디스크PNG재디코드:1774x887,허용[355,798)x[178,399),내부79450변경/외부RGBA0변경. artifacts/5e-scoped-edit-ui-check/browser-pixel-verification.json,ui-original/proposal/accepted.png,browser-snapshots.json,browser-mock-log.json. tmp/scoped-ui-applied-proof.png. UI검증시ai-panel SHA256 acae50d0f3c896c4fecbd99597606a3d3bd8e14cd97dd2ec163fa9c4a00e0e3b. 저장버튼실제다운로드/재열기/삽입/브라우저stale반례/확대비교는미검증. 원프로젝트미반영,실AI/Electron/Windows E2E아님.
- 완료 표시 수정/재열기 확인: PuxGdFnuEAZPXww6 산출물독립검토후부모가일반alreadyEditable까지scoped-applied로오인하는default를제거. 별도검증된scoped register만상태전달. 부모35/35재실행(신규2개는정적+순수함수검사혼합). 브라우저새로고침→원본버전1복원→동일범위scoped후보→적용해버전3생성,정확한'부분 수정 적용 완료/시각자동검수미실시'표시확인. 다시새로고침/작업실열기후PNG bytes불변및완료상태존속. 새PNG는앞서독립RGBA검사한ui-accepted.png와전체bytes동일. artifacts/5e-scoped-edit-ui-check/review-restore-verification.json,review-state-tests.log,review-state-fingerprints.txt. tmp/scoped-ui-restored-proof.png. 브라우저내작업자동저장/복원검사이지OS파일저장/다운로드/삽입E2E아님.
- 비교 연결/실제브라우저검증 완료(한정): XRkLFfR3olAAI8KT 3파일산출물40tests부모재실행후실UI에서maskCanvas가0픽셀로비는결함발견. 원인은viewPane이paint후width/height재설정. 부모가Canvasreset행동을반영한mock반례실패재현→크기설정후그리기로수정. 전체맞춤(초기15%,1~400%)/fit버튼추가. 부모41/41통과. 실제브라우저에서maskBitmap79450픽셀,400%공통폭7096px,실휠scroll 세뷰동일(left909.09088/top454.54544),확대후에도mask79450,전체맞춤복귀15%확인. 비교후적용버전4 PNG가앞서독립검사한ui-accepted.png와전체bytes동일. artifacts/5e-scoped-edit-ui-check/comparison-browser-verification.json,comparison-tests.log. tmp/scoped-comparison-proof.png는미적용후보비교를찍은검사증거이며현재화면상태는아님. Canvas는별도mask만,원본/후보PNG재인코딩없음. OS저장/삽입/stale브라우저반례는미검증.
- 페이지 삽입/실제 다운로드 완료(브라우저 한정): 부모가55778 worktreeUI 버전4 '페이지에 넣고 닫기' 클릭→실제페이지 SVG image href의PNG가ui-accepted.png와전체bytes동일확인(래스터PNG를SVG컨테이너에삽입한것이며SVG그림대체아님). 삽입되돌리기시이미지0개,다시실행시동일PNG복원. 'PNG 저장'실제클릭→Chrome download id55 complete,image/png,944102bytes, /Users/parkseungyeon/Downloads/생성 결과 4.png. 디스크파일재읽기→검증본과전체bytes동일. artifacts/5e-scoped-edit-ui-check/downloaded-ui-result.png복사및download-verification.json,insertion-verification.json. Electron네이티브파일선택/Windows검사아님.
- 계측 코드 완료: X4EgBrD7QhtzO4w0가js/ai-panel.js 및신규tests/test-ai-scoped-edit-timing.mjs 작성. 부모코드독립읽기및npm test 444/444재실행. timingObserver동기예외비간섭,범위확인대기/AI수신/합성/후보비교확인/등록구분. 주의:candidate-review는비교DOM준비까지포함하므로순수사용자대기아님. 실제속도개선은아직하지않음. artifacts/5e-scoped-edit-ui-check/timing-full-tests.log.
- 로컬 측정 완료: v1XquqZ8N75h8dEC 결과를부모JSON확인. warmup1+5회 Node실제PNG처리평균457.38ms(424.31~516.49),합성검증307.47ms,비교decode64.14ms,session41.10ms,prepare30.68ms. 매회sourceSHA불변/등록PNG검증본bytes동일. AI0/사용자대기0/브라우저DOM없음,실제AI또는브라우저속도개선아님. evidence performance/scoped-panel-node-benchmark-result.json 및fingerprints. 보존검사를생략하는최적화는하지않음.
- 브라우저 stale 결함 발견/수정: 부모가최신코드에서delayed LOCAL MOCK생성대기중version1→4선택변경해재현. workbench는화면/dataset을바꾸지만ai-panel handler의if(busy)return이내부ID갱신을버려후보가열리는결함. 적용안하고취소. 부모가scopedbusy선택이벤트는ID/revision갱신및transport.fail처리, getCurrent에visible selector/dataset/live ID일치검사추가. npm test445/445. 같은실UI동작재검사에서즉시차단및뒤늦은completed응답후에도버전4개유지/후보0확인. artifacts/5e-scoped-edit-ui-check/stale-ui-repro.json,stale-ui-fixed.json,stale-fix-tests.log. tmp/scoped-stale-block-proof.png. 네트워크작업interrupt는미구현이고결과적용차단임을구분.
- 반영 전 검토 묶음 완료: YQ7SG9ibNqB1i01R 읽기전용독립검토 no-blocker-with-scope. 부모가수정후정상UI경로도추가실행하여버전5등록성공/검증본PNG전체bytes동일확인(final-positive-verification.json). 마지막npm test445/445를새로실행하며전후HEAD/전체tracked diff SHA/대상15파일SHA일치검증. source15파일을영구artifacts/5e-scoped-edit-review-ready-01에복사하고ZIP내15파일도manifest SHA와동일확인. zip=artifacts/5e-scoped-edit-review-ready-01.zip. README/manifest/final-npm-test.log포함. 설치앱/전체프로젝트가아니며현재원프로젝트변경과기준선대조후병합해야함.
- 현재 실행중인 구현/검토 작업 없음. 반영 승인 대기: 원프로젝트코드반영/실AI/Electron/Windows검사는하지않았음. 실제생성속도개선은미완료(로컬계측만),안전검사생략안함. 사용자의새승인없이원프로젝트를덮어쓰거나AI를새로호출하지말것. 다음은반영여부결정및승인범위의병합/재검증.
- 예정 검증 화면: artifacts/5e-scoped-edit-core-01/preview/. 테스트 복사본으로만 동작하고 AI 신규호출 없음. 실제PNG 기반 영역밖0 검증 후에만 표시, 현재5E에는 미연결임을 화면에 명시한다.
- 미완료: 확대/이동/복수영역/지원불가 등브라우저추가반례, 기존5E UI연결·저장/재열기, 속도 병목 측정·개선. 순수핵심·제한PNG코덱검증과한번의브라우저성공을전체제품E2E로일반화하지않는다.
- 진행 소통: 작업 종료와 현재 실행중을 구분해 보고한다. 다음작업을 실제로 실행하지 않았으면 진행중이라고 하지 않는다. heartbeat goSCopHMW1nM9d75로 5분 간격 진행 확인·보고를 설정했다(현재단계 우선4회). 완료 또는 중단시정리, 필요시후속확인확보. 검증 화면 빌더: tmp/5e-scoped-edit-preview/build-preview.mjs. 검증용화면은실제브라우저1건확인했으나제품5E연결은미완료.
- 아래 내용은 앞선 작업 이력이다. 상태 충돌 시 이 최신 진행 항목을 우선한다.

## 현재 사용자 협업: 평가원 대조 10회 사이클
- 사용자가 각 결과를 직접 평가한다. 최신 요청에 따라 1회차 피드백 후 2~6회차를 5개 묶음으로 생성·제시하고 일괄 피드백을 받는다. 각 입력의 첫 PNG는 1개이며 자동 평가·자동 교정·선행 10장 생성은 하지 않는다.
- 누적 명세: `docs/USER_FEEDBACK_STYLE_SPEC.md`. 사용자 확인 규칙과 장치별 시험 가설을 분리한다. 이전 에이전트 검수 점수를 사용자 승인으로 대체하지 않는다.
- 근거: `/Users/parkseungyeon/.aside/u/0/sessions/2026-09-07_bTSr3fYASfFkTKSA/artifacts/5e-user-feedback-cycles/`.
- 이번 회차 호출은 별도 사전 AI 관찰·검수·교정을 생략한 단일 생성이다. 일반 제품 UI의 기본 흐름·설정까지 변경한 것은 아니다.
- 1회차: 평가원 2025학년도 화학I 19번 첫 피스톤 용기 ↔ OpenStax University Physics V2 Fig.3.11. System 색/경계는 설명용 영역이라는 사용자 피드백을 U-003으로 반영했다. 전체 스타일를 승인받았다는 뜻은 아니다.
- 2~6회차: 수레 충돌 / 도르래 / 회로 / 기체 혼합 / 원통형 피스톤. 동일 명세 버전으로 요청하고 사용자 묶음 평가를 기다린다. 실제 장치와 다른 STYLE 부품은 복사하지 않는다.

## 최신 현황: 2026-09-08 승인된 첫 PNG 비교 재개
- 사용자의 비교 진행·재개 승인에 따라 기존 야간 마감 이후 이 제한 시험을 실행했다. 제품 코드·모델·고정 요청을 바꾸지 않았고 자동 교정·후처리·삽입·커밋·푸시·배포는 하지 않았다.
- OpenStax University Physics V1 Fig.14.16 유압계 INPUT 1건으로 A(재구성 v1.2 직접), B(현재 관찰+v1.7, STYLE 없음), C(B+화학I 피스톤 STYLE)를 비교했다. A는 역사적 런타임 자체가 아닌 보존된 프롬프트 재현용 조건이다. A/B의 차이를 관찰 JSON 단독 효과로 해석하지 않는다.
- 공통 Sol medium/priority, 동일 INPUT 바이트·표시선 선택. B/C는 INPUT만 본 Sol high 관찰 1회(77.835초)를 공유했다. 각 조건의 네이티브 첫 PNG 1개(1283×1226)를 보존했다.
- 육안 블라인드 검수는 A에 대응하는 sample-3을 우세로 보았다. 단, 정밀 측정에서 A도 피스톤 두께/너비가 원본보다 약26~31% 작다. B/C는 이 두께 비율이 더 가깝지만 오른쪽 용기 높이/너비는 각각 약34%/19% 커졌다. 오른쪽/왼쪽 피스톤 너비 비는 원본1.815, A1.814, B1.718, C1.883이다. 좌표는 선 중심·내부 바닥 기준이며 원본 바닥 약±2px 불확실성을 갖는 진단값이다.
- 세 결과 모두 두 피스톤·두 용기·연결 통로와 연속 유체 점유, 표시 제거를 유지했다. 독립 검수의 최초 '통로가 비었다' 판정은 벽과 통로 혼동이었으며 확대 재판독으로 정정했다. 초기 보고서도 별도 보존했다.
- 세 결과 모두 불투명하지만 엄격한 R=G=B 및 순백 배경 표본 검사에 실패했다. 이는 허용색 보정 없이 원본 PNG를 검사한 결과이며 시각적으로 뚜렷한 색채가 있다는 뜻은 아니다.
- 생성 구간은 A56.756초/B62.314초/C70.276초. 관찰을 포함한 개별 작업 환산은 약57/140/148초이며 실제 관찰은 공유1회만 실행했다. 제품 검수·교정 시간은 포함하지 않았다.
- 이전 A 240초 무출력 중단과 재개 중 실험 guard가 정상 스킬 읽기를 차단한 시도는 별도 보존했다. 두 건을 시각 품질 실패로 계산하지 않는다. 이후 허용된 스킬 문서 읽기만 열어 세 PNG를 확보했다. 각 성공적인 이미지 수신 기록에는 제품의 `5e/image-finalization: interrupting`과 terminal `interrupted`가 있으며 일반적인 `completed`나 Electron E2E 성공으로 표기하지 않는다.
- 결론: 단일 표본에서 최신 방식의 일관된 우위는 입증되지 않았다. 관찰/STYLE을 품질 개선을 이유로 기본 강제 경로로 승격하는 결정은 보류한다. 기능 제거·기본값 변경은 수행하지 않았다. 새 코드 회귀는 실행하지 않았으며, 기존 스냅샷과 해당5개 코드 파일의 byte SHA 동일성만 새로 확인했다.
- 근거: `/Users/parkseungyeon/.aside/u/0/sessions/2026-09-07_bTSr3fYASfFkTKSA/artifacts/5e-first-output-comparison-01/`의 `results`, `resume-*-response.json`, `evaluation`, `closeout.json`. 별도 미검증 항목과 앞선 시험 한계는 아래 이력을 따른다.

## 앞선 현황: 2026-09-08 야간 작업 마감
아래는 야간 마감 당시 기준의 이력이다. 이후 진행 상태와 비교 결과는 위 최신 현황을 우선한다.

### 구현 및 확인 완료
- 코드 기준: structure-spec1.3.0 / white-PNG1.7.0 / image-review1.6.0 / mark-policy1.1.0 / reference-roles1.1.0. 승인 경로·브랜치·기준 HEAD는 아래 범위를 유지하며 커밋·푸시·배포하지 않았다.
- 새 작업에서 교과서 INPUT_SOURCE와 평가원 STYLE_REFERENCE를 분리한다. 역할 선택은 첫 요청 전에 가능하며 저장/복원·캐시 서명에 반영된다. STYLE은 구조 관찰·객체 계수·원본 코멘트 근거에서 제외된다.
- 구조 관찰 INPUT만 → 생성 INPUT/STYLE → 독립 검수·자동 교정·재검수 INPUT/STYLE/CANDIDATE. STYLE 포함 지원은 첫 PNG 변환과 자동 교정 최대1회이며, 수동 추가 수정·대화·일괄 지원으로 확대 해석하지 않는다.
- 화살표·추세선·보조선/지시선 선택을 생성/검수/교정에 동일하게 전달한다. 의도된 제거는 실패가 아니며, 실제 관·도선·경계·계측 눈금은 구분해 보호한다.
- 필수 시각 gate는 8개: object-counts, inside-outside, liquid-occupancy, connections, composition-state, black-fill-meaning, presentation, request-scope. 픽셀 계약 불일치가 있으면 최종 검수 상태를 pass로 승격하지 않는다. 출력 PNG 후처리는 하지 않는다.
- 검수 좌표는 실제 전송 후보 PNG의 너비/높이를 각각 기준으로 한다. 숫자가 아닌 좌표와 경계 초과를 거부하며 AI bbox를 검증된 마스크로 취급하지 않는다.
- 최신 전체 회귀는 **399 pass / 0 fail**. 마지막 코드 지문 확인까지 변경 없음. 이는 코드·전송 계약 근거이며 시각 품질 개선 수치가 아니다. 실제 보고서5개 형식 호환, 실제 PNG A→A→B 오프라인 전송 재생도 확인했다.

### 실제 그림 시험의 결론
- 실제 교과서 회로 첫 PNG는 주요 계수/전기적 연결을 유지했지만 국소 비율·도선 배치와 픽셀 계약에서 미달했다. 고정 후보의 새 검수1회는 비율/경로 실패를 탐지했다.
- 실제 교과서 액주계 첫 변환·자동 교정에서는 액면 순서/연결은 유지됐으나, 교정이 실제 눈금까지 삭제하는 퇴보가 있었다. 새 눈금 검수1회는 이를 실패로 탐지했다. 별도 좌표 규칙 시험1회는 같은 후보에서 자 외곽과 bbox의 위치 대응이 개선됐다.
- 이 시험들은 제한된 사례의 실패 탐지·위치 대응 근거다. 평가원 자기재현을 교과서 변환 품질로 계산하지 않았으며 전체 과목 일반화, 첫 생성 품질 향상 또는 사용 가능한 완제품을 입증하지 않았다. 미달 PNG는 채택·삽입하지 않았다.

### 남은 한계와 실행 상태
- [blocked] 생성 자체의 엄격한 무채색 및 구조/상대 비율 보존은 미충족. 후처리로 보정하지 않는다.
- [미검증] 새 눈금 보호 규칙을 적용한 첫 생성·자동 교정 품질, 액면의 상대 높이/점유 비율 정밀 대조, 다른 후보에서의 AI bbox 신뢰성, 내부 image-tool reference ID binding, 실제 Electron/Windows E2E.
- 최근 확인한 실제 실행은 localhost:18769 HTTP/SSE 어댑터, 역할 UI 모의 검증은 localhost:58365다. 네이티브 앱 E2E나 이후 시점의 서버 가동을 보증하지 않는다. 마지막 실제 검수는 completed이며 새로고침/복원 후 기존 후보와 needs-attention 상태가 유지됐다.
- 05:00 이후 새 실험은 시작하지 않는다. 마감 단계에서는 코드 변경 없이 근거·문서 상태만 확인한다. 최신 결속: artifacts/5e-bbox-contract-verification/{verification,closeout}.json. 원본/스타일/생성 바이트 및 각 시험의 제한은 아래 날짜별 기록과 해당 evidence 파일을 따른다.

## 범위와 승인
- 2026-09-07 사용자 승인: 명세 정리, 제한형 검수 루프, 비교 중심 UI, Sol medium 생성 + Sol high 검수. 기존 단일 생성 절대 제한을 '생성1 + 오류시 교정1'로 변경하는 제안 승인.
- 저장소: /Users/parkseungyeon/Documents/Codex/2026-09-06/x20/5E, feat/image-improvement, 기준4251a803128ac8963c4f8018418a03c0558781ea.
- 원본 Desktop/5E 변경 금지. 커밋·푸시·배포 금지. 기존 미커밋 변경 보존.
- 후처리·투명화·양자화·OCR·문자 조판·객체화·문서 처리 확대는 범위 밖.

## 초기 병렬구현 기록
초기 구현 당시 기록이며, 현재 활성 위임이나 서버 상태를 뜻하지 않는다. 최신 상태는 날짜별 기록을 따른다.
| 담당 | 작업 공간 | 소유 파일 | 상태 |
|---|---|---|---|
| 통합 담당 | x20/5E | docs/IMAGE_REVIEW_SPEC.md, 이 문서, 독립 픽셀 측정·통합검증 | 구현·오프라인 검증 완료, 실제 AI 검증 차단 |
| 검수 구현 | tmp/5e-review-worktree | js/ai-panel.js, js/ai-white-png.js, 신규 검수 모듈, 검수 테스트 | 통합 및 반례 보강 완료 |
| UI 구현 | tmp/5e-ui-worktree | index.html, css/ai-panel.css, js/ai-workbench.js, UI 테스트 | 통합 및 브라우저 보완 완료 |
- 두 detached worktree는 기준HEAD + 이번 작업 시작 시점의 미커밋 변경으로 초기화. 담당 파일만 본 작업 공간에 가져온다. 다른 작업자의 변경과 reset/clean으로 충돌시키지 않는다.

## 화면
- 입력 작업 목록, 원본/결과 비교 영역, 검수/수정 영역.
- 생성과 검수 상태를 구별. 결과 버전 보존. 기존 PNG 저장·캔버스 삽입·영역 코멘트 유지.
- 긴 대화·계정·토큰·모델 선택은 상세 영역. 밝은 중성 배경·흰 도판 면·선과 구분선·기능 강조색 하나.
- 모바일 완전 지원은 아직 검증되지 않음. 1440x900 및 좁은 창에서 겹침/잘림 점검 예정.

## API·보안
- 기존 window.fiveEDesktop.send/onEvent/interrupt와 Electron Codex app-server 계약 사용.
- 실제 AI 시험은 정상 macOS Terminal의 localhost:18769 HTTP/SSE 어댑터를 사용한다. 이번 역할 UI 회귀는 localhost:58365 모의 브리지다. 가동 여부는 각 시험에서 새로 확인하며, 실제 Electron 창이나 Windows 설치판 E2E와 동일하다고 주장하지 않는다.
- desktop main/thread profile의 read-only/never 유지. 권한·sandbox 확대, 외부 API·계정 생성 없음.
- 현 backend resolveTurnPlan은 chat+ephemeralRender 요청을 image 목적으로 분류한다. 독립 검수 문맥은 새 thread로 만들 수 있으나 정확한 서버 purpose 표기는 통합 시 확인 필요. 검수 중 이미지 호출을 성공으로 간주하면 안 됨.

## 데이터·문서·권한
- 원본과 AI 생성 PNG 바이트 보존. 픽셀 검사는 측정만 하며 수정하지 않음.
- 검수 결과는 후보별로 귀속. 탭을 바꿔도 다른 그림의 검수 판정이 섞이지 않게 검증.
- 검수 없이 생성된 기존 캐시를 '검수 통과'로 사용하지 않음.
- 초기 구현의 캐시·일괄 처리 지원 범위는 통합 결과에 따라 아래에 기록.
- 문서/HWP/OCR 처리·조판·새 저장소·원격 업로드 없음.

## 완료 조건
1. 실제 호출 설정 Sol medium 생성 / Sol high 독립 검수 확인.
2. pass 종료, fail→교정→재검수, uncertain/오류, 취소/늦은 이벤트, 최대2회 생성 회귀 테스트.
3. 원본·생성본 비교, 버전 선택, 검수 표시, PNG 저장·캔버스 삽입 확인.
4. 알려진 실제 오류를 검수자가 탐지하는지 원본 대조. 탐지 실패는 미통과로 기록.
5. 신규 생성 결과의 실제 품질/시간/바이트 측정. 가짜 이벤트 시험과 실제 실행 근거 분리.
6. Windows/Electron·전체 과목 품질·시간 절감 일반화 등 미검증 사항 명시.

## 진행 및 검증 기록
- 시작 상태: 기존 268개 테스트 기록. 이번 변경 후 새 검증 전이므로 기존 통과를 신규 완료 근거로 사용하지 않음.
- 신규 명세 작성: IMAGE_REVIEW_SPEC.md. 기존 자료의 공식 사례/내부규칙/합성 벤치마크/실제 회귀를 구분. 공식 도판 추가 확보는 아직 하지 않음.

## 초기 통합 시점의 상태 (이력)
- 검수 담당·UI 담당의 소유 파일만 본 작업 브랜치에 통합. 통합 담당이 실제 브라우저에서 드러난 기본 모델 표시 불일치·이전 버전의 교정 중 상태 잔류·탭 상태 잔류·선택 버전 수정 대상·숨김 CSS 충돌·좁은 화면 원본 우선 표시를 수정했다.
- 기본값 마이그레이션: Sol medium. 이후 사용자가 고급 설정에서 선택한 모델/추론은 실제 호출에도 반영한다. 숨겨진 강제 Sol 치환 없음. 독립 검수는 Sol high 고정이며 사용할 수 없으면 명시적으로 실패한다.
- 단건 루프 구현: 첫 생성 후 새 ephemeral thread에서 원본+후보 검수. 확정 fail에만 교정 1회. uncertain/잘못된 JSON/누락된 근거/중복 gate/상충 항목/예상 밖 이미지 생성/취소·연결 오류는 통과하지 않는다. 추가 생성 최대1회.
- 필수 gate 7개: object-counts, inside-outside, liquid-occupancy, connections, composition-state, black-fill-meaning, presentation.
- 검수 thread 요청 payload는 purpose chat + ephemeralRender true. 기존 backend가 이를 purpose image로 분류하지만 실제 검수 요청은 JSON-only이며 새 thread다. 별도 review backend 목적 유형을 새로 추가한 것으로 보고하지 않는다.
- 메타데이터·원본/초안/교정본·선택 후보는 현재 창의 작업 탭 상태에 보존. 새로고침 이후 AI 작업 이력의 영구 복원은 새로 구현하지 않았다.
- white 캐시 읽기는 비활성화. 검수 pass 결과만 기존 캐시 쓰기 대상으로 허용되지만 현재 white 경로에서 재사용하지 않는다. 캐시 기반 속도 향상 주장 없음.
- **일괄 변환 제한:** 기존 배치 경로는 새 검수 제어기를 사용하지 않는다. 검수 체크가 켜진 white 경로에서 대기열 시작을 비활성화하고 진입점도 차단. 미검수 일괄 결과를 검수 완료로 표시하지 않음. 그림별 새 작업으로 처리해야 한다.
- 파일 검사: ai-png-inspection.js가 브라우저에서 디코딩된 픽셀의 알파·채널편차·백색/어두운색 비율을 측정. 원본 data URL과 PNG 바이트는 바꾸지 않는다. 알파 불충족·검사 오류는 최종 통과/캐시 저장을 막음. 미세한 RGB 편차는 별도 측정값이며 AI 시각 검수 pass가 엄격한 R=G=B 보증은 아님.
- 전체 작업 elapsed는 첫 생성 시작점을 포함한다. 90초 이상이면 경과 시간과 취소 가능 안내를 표시한다. 자동 지연 재시도/새 모델 전환은 하지 않음. 속도 향상은 미검증.

## 초기 통합 시점에 실행한 검증 (이력)
- 최종 `npm test`: **304 pass / 0 fail**, `git diff --check` 통과.
- 별도 반례7개 추가: 근거 빈칸, 추가 스타일 실패, 중복gate 덮어쓰기, 심각도 누락issue, 검수 중 예상 밖 이미지, 중복done, 취소된 준비작업의 다음run 침범. 최초7실패 후 보강한 최종7통과.
- 실제 브라우저+오프라인 mock transport: generation Sol medium → review Sol high → correction Sol medium → re-review Sol high 4요청 확인. 입력 첨부수 1→2→2→2. 새 AI 이미지나 실제 Sol 검수로 간주하지 않음.
- uncertain 보고서에서는 생성1+검수1로 종료, 추가 생성 없음. 이전 초안을 선택해 수정 요청하면 prompt의 수정 대상 이름이 실제 선택한 '생성 결과 1'로 전달됨 확인.
- 버전 선택·오류 bbox 강조·탭 초기화·선택 버전/검수정보 복원 확인.
- PNG 저장 버튼으로 받은 기존 fixture 928,095bytes가 원래 PNG SHA-256과 동일. 캔버스에 새 이미지 객체 삽입 확인. 이전 실제 생성 PNG를 사용한 UI/E2E 시험이지 새 생성 품질 증거가 아님.
- 900×700 iframe 실제 viewport에서 원본 우선→생성 후 결과 우선 전환, 생성 버튼이 viewport 내에 있음 확인. 1440×900 iframe에서 나란히 비교와 검수 패널 경계가 viewport 내에 있음 확인. 현재 브라우저 창은 외부 사용자 세션이므로 강제 크기 변경하지 않았음. iframe이 부모 창보다 큰 경우 일부 pointer click 도구가 실제 버튼을 누르지 못해, 측정 후 시험틀의 버튼 DOM click으로 해당 시험만 진행.
- 결과 근거: 이번 세션 artifacts/5e-reviewed-workbench (호출 목록, 단위 테스트, 저장 무결성, 회귀 원본 해시, 실제 서버 blocker).

## [blocked] 실제 품질·시간 검증과 재개
- 정상 Terminal 서버 localhost18769가 종료되어 연결 거절(ECONNREFUSED, HTTP000). 이번 후속 작업에서 실제 검수 호출0, 실제 이미지 생성0.
- 사용자에게 기존 start-normal-mac.cjs를 정상 Terminal에서 한 번 다시 실행하도록 요청했다. 샌드박스 우회·권한 확대·제한 실행환경에서 재생성 시도 없음.
- 재개 명령: `node ~/.aside/u/0/sessions/2026-09-07_bTSr3fYASfFkTKSA/artifacts/5e-attachment-diagnosis/start-normal-mac.cjs`
- 서버 시작 후 ① 기존 증류 실패 후보를 새 검수자가 실제로 탐지하는지 확인 ② 시험관·증류·혈관을 실제 새 경로로 생성/검수 ③ AI 판정과 원본을 사람이 재대조 ④ 실패/중단 시간 포함 채택 시간·호출수 기록.
- 검수자의 실제 오류 탐지율·교정 후 구조 보존·검정 면 억제·순백색/무채색 완성도·Sol/Luna 속도 비교는 아직 미검증. 기존3건을 고정 회귀로만 쓰며 미사용 입력 시험도 추후 필요.
- Windows 설치판/Electron 창, 모바일 기기, 여러 장 검수, 새로고침 뒤 AI 작업 이력 영구 복원은 이번 완료 주장에 포함하지 않음.
- 오프라인 시험 서버18770은 실제 AI 없는 임시 테스트 도구. 종료 시도에 OS Operation not permitted가 반환되어 종료했다고 보고하지 않으며 재시도/우회하지 않음. 원본 저장소 변경·커밋·푸시·배포 없음.

## 2026-09-07 코멘트 중심 작업창 실제 구현 착수
- 사용자 승인: 1안 오른쪽 코멘트형 기본 + 3안 원본/결과 비교. 별도 '변경 금지' 도구 제거. 첫 생성은 평가원식 변환, 후속 수정은 요청 외 부분 보존을 기본 계약으로 한다.
- 시안 HTML은 제품과 별개다. 이번 단계부터 실제 index.html/css/JS 경로에 연결하며, 실제 연결/모의 시험/실제 AI 품질 검증을 분리한다.
- 작업 소유권: tmp/comments-core가 js/** 및 tests/** (fixture 제외), tmp/comments-ui가 index.html/css/ai-panel.css. 모두 현 HEAD+미커밋 복사본의 독립 worktree. 통합 담당은 이 문서·임시 시험 하니스·통합 후 실제 브라우저 검증을 담당. 다른 소유 파일을 통합 전 동시에 수정하지 않는다.
- 공유 UI 계약: data-ai-comments(list), data-ai-comment-editor(textarea), data-ai-comment-save/delete, data-ai-comment-tool=pan|point|area, data-ai-comments-apply, data-ai-side-tab=comments|chat, data-ai-comments-panel/chat-panel. 기존 data hooks 유지.
- 목표: 그림 좌표/입력·후보 버전에 귀속된 점·영역 코멘트, 일괄 반영, 임시저장, 삭제 확인/되돌리기, 삽입 성공 후 닫기, 실패 시 유지. 페이지 이미지와 작업을 연결해 재편집·명시적 교체·undo까지 검증한다.
- 재개 전 확인: localhost18769 HTTP000, localhost18770 HTTP200. 18770은 오프라인 모의 전송이다. 사용자가 정상 Terminal 서버를 다시 켜도록 안내했으며, 제한 환경에서 sandbox 우회 실행하지 않는다.
- 통합 체크리스트: 기본 요청 없는 생성 / 코멘트만으로 수정 / 요청 밖 보존 검수 / 점·영역과 이동 구분 / 확대·보기 전환 후 좌표 / 원본·선택 후보 귀속 / 버전별 미해결코멘트 / 실패·취소·늦은 완료 / 저장실패 안내 / 성공시에만 닫기 / 삽입PNG 무재인코딩 / 교체 geometry·undo / 재개와 탭별 상태 격리.
- 위 항목은 착수 범위이며 아직 완료 또는 품질 향상 주장 아님. 완료 근거는 후속 기록으로 추가한다.

### 통합 담당 사전 감사 반례
- 기존 image-paste.js는 2000px 초과 이미지를 재인코딩 축소하며 insertImageFromSrc 반환값이 없다. AI 결과 삽입/교체에는 원 PNG 보존과 명확한 반환/성공 확인이 필요하되 일반 붙여넣기 정책은 바꾸지 않는다.
- 기존 beginWhiteImageReview는 원본 첨부+새 후보만 보낸다. 후속 수정의 '요청 밖 유지'를 검사하려면 **수정 전 선택 후보**도 구분된 역할로 독립 검수에 전달해야 한다. 최초 원본만으로는 직전 결과 대비 무관한 변형을 검증할 수 없다.
- 기존 commentPrompt는 과거 결과의 코멘트까지 수집한다. 버전에 귀속된 적용 대상/완료 코멘트를 구분하지 않으면 이전 지시가 재적용될 수 있다. 해당 반례는 통합 후 요청 payload에서 확인한다.

## 2026-09-07 코멘트 작업실 통합 완료 (최신 상태)
앞의 밝은 시안·7개 gate·304개 테스트·이력 미복원 기록은 이전 단계의 이력이다.

- 실제 제품 코드에 통합했다. 결과 크게 + 오른쪽 코멘트 기본, 원본 비교 선택 가능. 기존 Cool Slate 테마 상속. 별도 변경 금지 도구 없음.
- 점/영역 코멘트, 포인터 드래그 생성, 이동 도구, 숫자 좌표 편집, 마커-목록 연결, 자동 임시저장. 원본과 현재 선택 버전의 코멘트만 다음 요청에 포함한다. 이전 코멘트는 원래 버전에 남는다.
- IndexedDB에 AI 작업/이미지/후보/코멘트/검수 메타데이터를 보관하고 새로고침 후 복원한다. 같은 origin 범위로, 다른 포트·브라우저·프로필로 자동 이관하지 않는다. 저장 실패 안내 제공. 원격 동기화 아님.
- 독립 검수 첨부: 원본 + 새 후보 + 구분된 수정 전 선택 버전. request-scope를 포함한 필수 gate 8개. 의도적으로 요청한 위치/개수 변경은 원본 불일치만으로 실패시키지 않는다. 코멘트별 개별 완료 배지는 아직 없고 요청 단위 반영/보존 gate다.
- 생성 medium → 검수 high → 명확한 fail에서만 교정 medium 1회 → 재검수 high 유지. 요청 외 보존은 기본 계약이다.
- PNG 바이트 그대로 페이지 중앙 삽입, 새 이미지 선택, 성공시에만 작업실 닫기. 삽입 중 UI 잠금, 실패 시 작업실 유지.
- 페이지 이미지의 aiTaskId/aiCandidateId로 재편집 연결. 같은 작업 이미지 하나를 선택한 경우 명시적 확인 후 교체. 위치·크기·회전·레이어·undo 보존. 취소는 새 삽입으로 전환하지 않음. 비동기 디코딩 중 페이지/문서/선택/잠금/대상 변경 거절.

### 이번 단계에서 새로 실행한 검증
- 전체 npm test **334 pass / 0 fail**, git diff --check 통과. 이전 밝은/비교 기본 시안 정적 기대값 3개는 승인된 다크/코멘트 기본안으로 갱신했다. 전체 테스트를 새로 실행한 결과다.
- 실제 브라우저 + 모의 응답 http://127.0.0.1:58365/: 점 생성, 실제 포인터 드래그 영역 생성, 코멘트/좌표 편집, 2코멘트 일괄 요청, 버전 귀속, 새로고침 복원, 원본 비교 전환 확인.
- 모의 요청 4개에서 medium/high/medium/high, 점·영역 지시, 요청 외 보존 문구, 검수의 수정 전 버전 첨부와 request-scope 전달 확인. 실제 AI 품질 증거가 아님.
- 페이지 2 삽입 직후 SVG x=14.132992327365727,y=3,w=61.734015345268546,h=54로 90×60 페이지 안. 패널 닫힘과 새 이미지 선택 확인. 후보와 삽입 SVG의 PNG data URL 1,237,482자가 완전히 동일. 삽입 undo도 실제 화면 확인.
- 재편집 시 같은 작업/버전 복원과 '선택 이미지 교체 후 닫기' 표시 확인. 실제 교체 상태 변경·실패 무변경·geometry·undo·프로젝트 JSON roundtrip은 실행형 단위 테스트로 검증했다. 브라우저 native confirm 클릭까지 자동화한 E2E로 과장하지 않는다.
- 900×700 실제 iframe viewport 확인. 삽입 버튼 x=738.14,y=655.09,w=141.95,h=30으로 화면 안. 네이티브 모바일/터치 완전 지원은 미검증.
- 근거: 세션 artifacts/5e-comments-implemented/offline-request-evidence.json, tests-334.log. 시각 확인: 세션 tmp/comments-implemented-default.png, comments-implemented-compare.png, comments-implemented-narrow.png, comments-page-inserted.png.

### 남은 경계
- [blocked] 정상 Terminal localhost18769는 마지막 확인도 HTTP000. 이번 단계 실제 AI 생성/검수 0회. 위 재개 명령 실행 후 실제 구조 보존·정확도·시간 검증이 필요하다.
- PNG 재생성은 영역 밖 픽셀 완전 고정 편집기가 아니다. 검수자의 실제 요청 외 변화 탐지율도 미검증.
- 원본 Desktop/5E 수정 없음. feat/image-improvement, HEAD4251a803128ac8963c4f8018418a03c0558781ea 유지. 커밋·푸시·배포 없음.

- 최종 시각 보완: 공통 heading CSS가 도구줄을 세로로 만드는 우선순위 충돌을 수정했다. 실제 최종 기본 화면의 flex-direction=row, 높이28.9986px 및 저장 버튼의 밝은 글자색을 확인하고 334개 전체 테스트를 다시 실행했다. 900px/비교 스크린샷은 이 마지막 CSS 선택자 보완 직전 관측이며, 최종 파일에 결합된 재실행 증거로 과장하지 않는다. 최종 기본 화면 스크린샷은 보완 후 새로 저장했다.

## 2026-09-07 20:40 이후 실제 서버 재개와 자동 종료 반례
- 사용자가 정상 Terminal 서버를 재시작했고18769 HTTP200 확인. 실제 첫시험 시작11:40:33Z. 증류 원본에서 생성2회·검수1회 진행 후239.5초에 '취소됨'으로 끝나 재검수 미완료. 모의가 아닌 실제 PNG 두 장은 artifacts/5e-live-reviewed/distillation-first.png 및 distillation-corrected.png에 보존했다.
- 첫 검수는 내부 용기/액체 관계는 통과시켰으나 전면부품 수, 넓은 검정면, 음영을 지적했다. 별도 시각 대조에서도 교정본의 검정면 감소는 확인했지만 작은 컵 길이/침수 깊이 보존은 uncertain. 이 결과를 최종통과로 주장하지 않는다.
- 코드 반례: desktop의 정상 이미지 완료 뒤 trailing narration을 끊는 scoped finalization interrupt가 completeCorrection에서 사용자취소로 해석됐다. 기존 모의 테스트에는 이 실제시퀀스가 없었다. 새로운 반례2개 실패 재현 후 수정.
- 수정: correction 턴의 명시적 interrupting marker + 실제 수신 후보 + 오류 없음일 때만 interrupted 종료를 재검수로 연결. unmarked interruption 및 명시적 user cancel은 계속 취소. JSON 검수 턴에는 예외를 적용하지 않는다. scoped recovering 상태만 stopped를 견디고 recovered/recoveryFailed를 기다린다. 새 교정 후보에는 이전 후보의 실패 보고서를 물려주지 않는다.
- 전체 npm test 새 실행 **339 pass / 0 fail**, git diff --check 통과. 프런트엔드만 수정해 서버 재시작은 불필요했다.
- 수정 후 실제 재시험은11:56:21.859Z 시작, 작업명 distillation-live-recheck. 기존 결과는 별도 작업에 보존. 아직 진행 중이며 최종판정 미확정. 실제 이벤트 이름/턴/종료상태만 recheck-events.jsonl에 기록하는 수동 SSE 진단을10분 한정 시작했다. 생성 이미지/인증정보를 이벤트 로그에 복제하지 않는다.
- 다음 확인은 현재 세션의 one-shot heartbeat가 이어간다. 실서버 차단은 해제됐지만 실제 품질검증은 아직 완료가 아니다.

## 2026-09-07 실제 재시험 종료: 흐름 정상, 품질 미통과
- distillation-live-recheck: 11:56:21.859Z 시작,12:02:19.238Z 마지막 turn/completed. UI357.1초, 생성2회·검수2회, 최종 needs-attention/검수실패. 추가 생성하지 않았다.
- 실제 이벤트에서 교정 턴01a07bbc-1509-7731-81d1-8081f8f3656c가12:01:03.731Z interrupting→interruptAccepted→turn/completed(interrupted)로 끝난 뒤12:01:05.172Z 새 검수 턴이 시작되고 정상completed했다. 따라서 자동interrupt 오인 수정은 실제 동일 종료시퀀스로 확인했다. process recovery 강제종료 경로는 이번 실제 실행에서 발생하지 않았으며 단위테스트 근거와 구분한다.
- 최종 앱 검수는 얼음 조각수가 대략4~5개에서8개 이상으로 늘었다며 object-counts/request-scope 실패. 나머지 포함/액체/연결/배치/검정면/표현은 통과. 원본이 흐릿해 세부 얼음 수 확정에는 한계가 있으므로 이 한 건으로 검수 정확도 일반화하지 않는다.
- 별도 시각 대조는 검정면·음영 감소를 확인했으나 작은컵 비율/상대배치 및 내부 액체 판독에 우려를 제시했다. 원본의 흐린 투명 경계를 엄밀히 측정한 결과가 아니므로 세부 방향/수치는 확정하지 않는다. 최종 채택/페이지 삽입하지 않았다.
- 실제 픽셀 검사:1341×1173,1,572,993pixels,비불투명0. 완전무채색 아니오,chromaticPixels330677,채널차이>3비율0.24%,maxChannelDifference12,전체exactWhiteShare19.89%,테두리순백20.10%,darkPixelShare1.95%. 전체백색비율은 배경 분할 측정이 아니지만 순백 배경/정확한R=G=B 보장은 성립하지 않는다. 후처리로 몰래 보정하지 않았다.
- 근거 PNG는 버전ID에 결합한 recheck-generated-5.png(초안),recheck-generated-6.png(교정본). recheck-capture-before-status-read.png는 상태 전환 시점 캡처여서 첫버전 근거로 사용하지 않는다. recheck-final-review.txt, recheck-pixel-measurements.txt, recheck-events.jsonl 보존. 최종 실화면 증거 tmp/live-recheck-final.png.
- 최신 전체 코드 테스트339통과. 이번 완료 주장은 증류 한 사례의 실행흐름과 실패기록까지이며, 시험관/혈관 재시험·실제 코멘트 영역 밖 보존·검수 정확도·네이티브Windows/Electron 검증은 아직 남는다. 원본 수정·커밋·푸시·배포 없음.

## 새 사례 학습 1차: 공식 도판 3건의 관찰 데이터
- 사용자 승인으로 이전에 분석하지 않았던2025수능 화학Ⅰ4번,생명과학Ⅰ14·16번을 분석했다. 모델 가중치 재훈련/파인튜닝이 아니라 사례 기반 구조·표현 명세 연구다. 실제 이미지 생성 호출·제품 코드 변경 없음.
- 기존 공식PDF를 aside.pdf로4096px 재렌더링해 crop을 보관. 학습묶음은 세션 artifacts/5e-learning-round1/learning-cases.json 및 *-hires.png. PDF·crop해시,페이지·문항·crop좌표,객체ID·관계·불확실성·금지변경 포함. 그림을읽는객체분석을자동화한제품기능이아니라 이번에분석자가작성한사례데이터다.
- 화학4:2개 용기묘사와각용기내부바닥의고체영역2개,상태변화화살표1개. 낮은해상도에서독립분석자가회색을외부그림자로오인했으나, 고해상도 원호안쪽/접촉 및B(s)근거재검토후철회했다. 정확질량비율은면적으로추정하지않음.
- 생명14:원형세포8개(1→1→2→4),정자아이콘4개,화살표11개. ⓐⓑ·Ⅱ및주석지시선은개체에서제외. 총12개묘사를동시존재개체수로해석하지않음. 발생관계화살표와삭제할주석선을구분.
- 생명16:상태3개/상태화살표2개. 각상태에큰나무3+작은나무2=5개아이콘,전체묘사15개를독립줄기기준으로재확인. 저해상도큰수관만세면하층작은나무를누락한다. 실제방형구조사개체수와동일시하지않음.
- 기존 IMAGE_CONVERSION_MANIFEST.schema.json의객체·관계개념은참조했으나,상태변화/주석역할/불확실성필드가부족해이번파일은관찰sidecar다. 기존스키마완전호환또는생성기실제연결완료로보고하지않는다. 필드참조·ID중복·명시개수·원본해시확인은데이터무결성검사이며변환품질시험이아님.
- 3건모두분석용이며새로운원본→이상적변환정답쌍이나미사용평가표본이아니다. 1개시험연도2개과목표본이므로평가원전체규정·모델정확도향상으로일반화하지않음. 원본Desktop/5E수정·커밋·푸시·배포 없음.

## 야간 작업 운영 지시 · 2026-09-07 22시대 갱신
- 사용자 최종 지시: 다양한 제공 평가원 기출을 먼저 확인하고 과목·유형을 순환한다. 자료 선별/시각 관찰/독립 검증/좁은 코드 단위는 적절한 서브에이전트에 위임하고 조정 세션에는 요약과 근거만 회수한다.
- 같은 사례/가설은 제한된 횟수만 시험한다. 반복해도 무효과 또는 퇴보면 보류하고 다른 유형·결함으로 이동한다. 판단/승인이 필요한 항목도 보류 목록으로 분리하고 중간 질문 없이 가역 작업을 지속한다.
- 종료 시각은 **2026-09-08 05:00 Asia/Seoul**이다. 이전 08:00 계획을 대체한다. 재개 heartbeat `OTpcVyS4iCqxVPWJ`와 종료 정리 `swkQdfMdfdUfZ2Tp`를 05:00 기준으로 갱신했다.
- 작업 경로는 `/Users/parkseungyeon/Documents/Codex/2026-09-06/x20/5E`, 브랜치는 `feat/image-improvement`. 기본 Project cwd `hande`는 별개 제품이다. 원본 Desktop/5E 수정·reset/clean·커밋·푸시·배포·설치·사용자 데이터 삭제 금지.

### 연결한 실험 프로토타입과 최초 대조 결과
- `js/ai-structure-spec.js`에 Sol high 별도 시각 관찰 턴, 엄격한 JSON 검증(원본별 관찰·객체·관계·표식 역할·불확실성), 유형별 보존 계약을 구현했다. 예제의 고정 개수를 새 입력에 넣지 않는다.
- 단일 white PNG 요청은 원본을 contact sheet로 합치지 않고 분리 전송하며, 분석 JSON을 첫 생성·검수·교정에 동일하게 전달한다. 원본별 transport SHA-256과 분석 시간은 `structureRecord`에 보관한다. 분석 턴은 생성 금지, 잘못된 응답/실패/취소/타임아웃은 생성으로 넘어가지 않는다. 텍스트만 입력/일괄 변환은 아직 이 사전 분석의 적용 범위가 아니다.
- 실제 시험은 2025 생명과학Ⅰ14번 고해상도 crop 한 건. 분석26.3초, 생성1회·검수1회, 총109.8초. 사전 개수 힌트 없이 1→1→2→4→4를 읽었고 첫 PNG의 개수와 화살표11개는 보존되었다. 생성/검수 요청의 명세 일치와 전송 이미지가 원본 PNG인 것을 해시로 확인했다.
- 그러나 이것은 개선 성공이 아니다. 기존 white prompt v1.2.0을 같은 원본·Sol medium·생성1회·동일 Sol high 검수 기준으로 비교했다. 기존도 개수/분기 시각 검수 통과, 총약92.0초였다. 학습에 사용한 사례의 대조이지 미사용 일반화 표본이 아니다.
- 직접 지정한 원 중심 수직 ROI의 RGB≤100 외곽선 높이 측정: 원본의 3단계 왼쪽 원/최상단 원=39/50=0.780, 기존=148/190≈0.779, 새 프로토타입=167/178≈0.938. 이 표본에서 새 방식은 상대 크기가 퇴보했다. 자동 검수는 이를 놓쳤다. 이 결과를 품질 향상으로 채택하지 않는다.
- 실제 imageGeneration 완료 이벤트의 `revisedPrompt`까지 확인: 기존은 3단계 원을 `medium circular cells`로, 새 경로는 `two same-sized large outlined circles`로 기술했다. 새 관찰 JSON은 크기 비율을 명시하지 않았다. 상대 비율 누락/추상화가 원인 후보이며, 한 번의 비결정적 대조로 인과를 확정하지 않는다.
- 두 PNG 모두 완전 무채색 미충족: 기존 chromaticPixels457204, 새270046. 이것은 낮아졌다고 통과시킬 수 있는 점수가 아니다. 새 파일은1199×1312, 전체불투명, 최대 채널차11이었다. 후처리는 하지 않았다.
- 시각 pass를 그대로 전체 pass로 표시하던 픽셀 게이트 누락을 수정했다. `enforcePngAcceptance`가 완전무채색/불투명 검사 실패·누락을 needs-attention으로 낮추며, 저장 작업 복원에도 적용한다. 실제 앱 재로드 후 새 결과가 파일검사 미통과로 표시됨을 확인. 캔버스 삽입/채택하지 않음.
- 전체 회귀 최신355 pass/0 fail. 실제 생성은 이후 보완한 취소/복원 게이트 이전에 실행되었으며, 생성·검수 프롬프트 일치는 별도 확인했다. 최종 오류 경로는 새 단위 테스트, 복원 게이트는 실제 UI로 검증했다. 최종 코드 전체 E2E나 Electron 네이티브 E2E로 과장하지 않는다.
- 증거: 세션 artifacts/5e-structure-connected/{live-trial.json,observed-structure.json,live-summary.json,first-result-1.png,baseline-trial.json,baseline-first-result.png,baseline-white-png-v1.2.0.js,paired-pixel-measurements.json,new-actual-renderer-prompt.txt,baseline-actual-renderer-prompt.txt,tests.log}.

### 현재 위임과 다음 우선순위
- `gyx44QTfPTh4iQJG`: 제공 기출 레퍼런스의 실제 경로와 다양한 과목/유형8~12개 선별(읽기전용).
- `CO5ntbLmdLstGxNv`: 별도 `tmp/structure-render-prompt-worker`에서 `js/ai-events.js`와 `tests/test-ai-events.mjs`만 수정. revisedPrompt→rendererPrompt 보존. 부모는 패널/검수 후보의 진단 메타데이터 연결 담당.
- 앞선 코드 검토 한 건이 잘못된 hande 저장소를 읽어 폐기됐다. 재검토의 'unscoped 이벤트 수용'/'해시를 모델 프롬프트에 넣기' 제안은 그대로 채택하지 않음: unscoped는 의도적으로 귀속 불가 처리하고 해시는 클라이언트 바인딩 증거다. 실제 cancel UI는 transport.interrupt도 호출한다. 예약 직후 동기 취소가 send 자체를 막는 반례는 추가했다.
- 우선순위: 다양한 새 입력으로 순환하면서 상대 크기·비율 명세와 실제 rendererPrompt의 일치를 보완한다. 세포 사례를 계속 재생성하지 않는다. 무채색 후처리 정책 변경과 애매한 과학적 의미는 보류하고 다른 개선을 진행한다.

## 사용자 목표 재확정 및 표시선 옵션 · 야간 2차
- **입력=교과서 그림 crop, 평가원 기출=STYLE_REFERENCE.** 기출 자체를 다시 그린 결과는 보조 재현시험일 뿐 실제 목표 성능 근거가 아니다. 앞선 생명14 대조도 이 범위로 한정한다.
- 사용자 승인 기능: 변환 전에 화살표(구조 표시만/모두 유지/모두 제거), 추세선(유지/제거), 보조선·지시선(유지/제거)을 선택한다. 실제 윤곽·관·도선·층 경계는 표시선과 구분해 보존한다. 의도적으로 제거한 표시를 개수·연결 보존 실패로 오판하지 않는다.
- `js/ai-mark-policy.js`의 정규화/계약을 첫 생성·검수·교정·일괄 요청에 연결했다. 작업별 선택, 후보별 적용 선택, 캐시 옵션에 보존하고 실행 중 선택을 잠근다. 기본 정리 문구의 무조건 지시선/화살표 삭제를 선택 계약으로 대체했다. `WHITE_PNG_VERSION=1.4.0`.
- UI 위임 변경을 검토·통합한 뒤, 실제 주 변환 버튼은 data-ai-comments-apply임을 확인하여 선택 블록을 그 앞에 배치했다. 일반 viewport에서 선택 변경 후 새로고침 복원(keep/remove/keep)을 확인했다. 기존 900×700 iframe fixture에서 세 select와 주 변환 버튼이 모두 viewport 내부인 것도 좌표로 확인했다. 직접 viewport resize/locator screenshot API는 오류여서 fixture와 전체 screenshot으로 검증했다. tmp/mark-policy-narrow-proof.png가 화면 근거.
- 회귀 현재361 pass/0 fail. 이 숫자는 옵션 전달/저장/회귀 근거이며 실제 이미지가 옵션을 지킨다는 품질 근거는 별도다.
- rendererPrompt 보존도 연결했다: `ai-events.js`의 완료 imageGeneration.revisedPrompt → 최초/교정 후보 및 작업 저장. PNG 바이트를 변형하지 않는다. UI에 HTML로 출력하지 않으며 독립 검수에 생성기 지시를 추가해 정답으로 유도하지 않는다.

### 레퍼런스와 새 교과서 원본 QA
- 자료탐색 agent의 과거 생명13/15 유형명은 오독이라 사용하지 않는다(실제 근절/염색체). 새 물리·지구 기출4개는 별도 시각 agent가 확인했다: p1_2026_11_09 도르래/사람 장치; p1_2026_06_08 수레 충돌+속도 그래프; e1_2026_06_07 지층/관입/단층+확대도; e1_2026_09_03 지도·경로·시점 도식. 공식 출처 재다운로드가 아닌 기존 manifest/실물 기준임을 구분한다. 각 그림의 의미 있는 패턴·선 종류를 무조건 장식으로 지우지 않는다.
- 기존 교과서 입력은 시험관·증류·혈관3건만 실제로 찾았다. 다양한 새 입력은 공개 출판사 자료에서 확보하고 원본/생성본을 섞지 않는다.
- 공개 미래엔 원문에서 첫 추출된 gravitational-lens/ocean-profiles는 도판이 잘렸고 첫 파일은 JPEG를PNG확장자로 저장한 문제도 있어 **rejected_incomplete** 처리했다. 이 상태를 변환 원본 성공 확보로 보고하지 않는다.
- 1회 재추출 후 부모도 완전한 도판을 직접 확인했다: artifacts/textbook-input-expansion/miraen-2015-physics2-p063-escape-velocity-complete.png(지구 크기3단계·위성6개·방향/치수 표시), miraen-2022-earth-p017-figure-i4-complete.png(밀도·수온 수직분포, 축/곡선/강조구간/주석). SOURCE_METADATA.json에 공식 URL·교육과정·쪽·접근일·QA 상태가 있다. 공개 접근이 재배포 허가를 뜻하지 않으며 연구용 crop만 보관한다.
- 현재 실AI 진행: 실제 앱18769의 새 작업에 탈출속도 교과서 crop을 넣고 **arrows=remove / trendLines=keep / leaders=remove**로 실행. 사전 개수 힌트 없이 원본 분석부터 진행 중. page의 window.__markTrial에 구조/요청/이벤트/검수 근거를 수집 중이므로 다음 재개 시 중복 호출하거나 reload하지 말고 먼저 진행 상태를 확인한다. 완료 후 artifacts/5e-textbook-mark-policy로 보관 예정. 이 시험은 평가원 그림이 아니라 실제 교과서 입력이다.
- 진행 중 코드 위임 없음. 자료/시각/UI/rendererPrompt 위임은 회수 완료. 판단이 필요한 선 역할이나 무채색 후처리 변경은 보류, 같은 실패 반복보다 다른 입력과 결함으로 이동한다.

### 탈출 속도 교과서 실제 시험 종료
- 진행 상태 갱신: 위 시험은 **종료**했으며 `window.__markTrial`과 `artifacts/5e-textbook-mark-policy/escape-trial.json`에 보관했다. 재개 시 중복 실행하지 않는다.
- 원본 분석45.4초, 실제 생성1회+독립 검수1회, 전체145.7초. 사전 객체 숫자를 주입하지 않고 원본에서 천체3묘사·위성6개를 읽었다. 세 도형의 큰/중간/작은 순서, 사진/세부 부품의 불확실성도 기록했다.
- 최초PNG `escape-first-1.png`: 부모 직접 확인상 원본의 모든 독립 화살표/치수 표시와 글자가 제거되고 천체3·위성6은 남았다. 검수도 선택적 화살표 제거를 연결 소실 실패로 오판하지 않았다. 생성기 실제 지시는 `escape-renderer-prompt-1.txt`.
- **전체 성공 아님**: 시각 검수는 pass였으나 chromaticPixels=85,379, maxChannelDifference=14로 최종 needs-attention. 후처리하지 않았고 삽입/채택하지 않았다. 부모 관찰상 원형 천체와 위성이 원본보다 커지고 천체 사이 비율에도 차이가 있다. 크기 순서만 맞았다는 AI pass를 정밀 비율 보존 근거로 쓰지 않는다. 정량 측정은 후속 확인 필요.
- 다음은 같은 도판 재생성 대신 미사용 해양 밀도·수온 그래프 입력으로 순환한다. 크기·배치 수치 표현/검수 가설은 별도 좁은 단계에서 설계하고 검증한다. 완전 무채색의 프롬프트 한계와 후처리 정책은 판단 필요 보류로 남긴다.
- 옵션/UI 통합 후 전체회귀를 새로 실행하여361 pass/0 fail, git diff --check 통과. 커밋/푸시/배포/원본 저장소 변경 없음.

## 야간 3차 · 미사용 교과서 해양 그래프와 경계 오독
- 23:33 KST 재개: 올바른 경로/feat/image-improvement 확인. 활성 코드 위임 및 실AI 없음 확인 후 실행. 입력은 미래엔2022 지구과학 p17 그림I-4 완전 crop(480×470). 기출 자기재현 아님. arrows=keep / trendLines=remove / leaders=remove. 실제 원자료 곡선은 제거 대상 추세선과 구별한다.
- 구버전 구조관찰52.3초, 첫 생성+검수 뒤 명시fail로 교정1회, 전체338.4초, 생성2/검수2, 최종needs-attention. 첫 PNG1131×1391 chromaticPixels383682; 교정343858. 모두 불투명이나 완전무채색 실패. 후처리/삽입/채택 없음. 이 표본은 이후 진단에 사용했으므로 더 이상 미사용 검증셋으로 분류하지 않는다.
- 첫 결과에서 원자료곡선2개·화살표2개 유지, 문자/점선 안내선/주석상자 제거를 확인. 흑백 색상변환 자체는 실패가 아니다. 양방향 표시의 짧은 수평 연결선이 부속인지 비화살표보조선인지는 보류.
- 실질 결함: 수동 지정 플롯ROI 기준 원본242×265(가로세로비0.913), 첫 PNG806×1224(0.658). 단순 전체 확대가 아니라 플롯 자체의 비율이 약28% 감소했다. 곡선 교점 및 오른쪽 심층 수직구간도 오른쪽으로 이동. 정확 교점 퍼센트는 정밀측정하지 않아 확정하지 않는다.
- 원본의 옅은파란 강조면은 x약84~324/y약134~174의 전체폭 수평 띠다. 관찰JSON은 이를 곡선/상단과 맞닿는 면으로 오독했고 실제 rendererPrompt에도 `upper-left ... touching top/left ... curve A`가 들어갔다. 첫 PNG와 교정PNG 모두 상단부터 좌측 절반을 채워 틀렸다. 검수 역시 원본이 곡선경계 면이라는 잘못된 설명을 반복했다. 베이지 장식배경판 제거도 객체누락으로 오판했다. 자동 관찰·자동 검수의 합의가 정답 근거가 아님을 확인.
- 별도 시각 agent도 처음엔 원본을 쐐기, 다음엔 출력띠를 전체폭으로 오독했다. 원본/생성PNG 직접 재확인과 픽셀표본으로 정정했다. `fill-pixel-probes.json`: 원본 플롯 y14%에서 x5/25/50/75/95% 모두청색(대략R190/B250), 후보는좌측약절반만회색(~217), 우측백색(~254). y4% 원본은 곡선외백색이나 후보좌측은회색이다. 수동ROI/점표본이며 자동 전체영역 분할이나 출력보정이 아니다.

### 좁은 코드 보완과 제한된 관찰 전용 확인
- `ai-structure-spec.js` v1.1.0: graph profile에서 면의 상하좌우 경계를 각각 확인, 면 위 곡선과 경계/접촉 혼동 금지, 플롯비율/교점/끝점 보존을 요구. 확인된 비과학적 배경장식만decorative로 기록하며 색/배경위치만으로 자료·층을 장식 취급하지 않는다. payload version1은 JSON골격, 별도문자열버전은 규칙/프롬프트판본이며 unknown role/profile은fail-closed.
- `ai-image-review.js` v1.2.0: 큰/중간/작은 순서만으로 비율pass 금지, 균일 확대와 개별 확대/종횡비 변형 구별, 강조면경계를 원본에서 재확인, 장식배경제거와 실제자료구획누락 구별. 코드검토의 rank-only 제안은 현재실패를 해결하지 못하므로 채택하지 않았다. 새 bbox/비율 수치 강제도 보류.
- 같은 해양PNG를 더 생성하지 않았다. 새 관찰프롬프트만 Sol high HTTP/SSE chat 한 턴으로 시험(90.3초). REPL 동적module import는 사용불가라 Node로 제품 함수의 요청을 구성하고 기존 어댑터로 전송. 이미지도구없음/엄격JSON검증통과. 전체UI 생성E2E가 아니라 관찰 전용 probe다.
- probe는 잘못된 곡선-contact 단정을 없애고 경계불확실성을 남겼으며 베이지를decorative로 구별했다. **그러나 강조면을 여전히0~1000구획으로 부정확하게 기술**했고 좌우경계도 확정하지 못했다. 프롬프트만으로 원본 경계 문제가 해결됐다고 채택하지 않는다. 수평안내선을structural로 묶은 분류도 있어 선역할 최종판정은 사용자선택 및 원본대조 우선. 이 가설의 같은원본 추가생성/재관찰은 보류하고 다른 입력으로 이동한다.
- 새 검수v1.2의 실AI 재검수/새 첫PNG 성능은 아직 미검증. 새 코드의 목적은 구별·불확실성 보존이며 품질향상 입증이 아니다. 독립읽기검토에서 즉시 깨지는 유효성/범위 오류는 발견되지 않았고 버전구분 주의점은 주석에 명시했다.
- 근거: artifacts/5e-ocean-graph-trial/{baseline-trial.json,observation.json,candidate-1.png,candidate-2.png,renderer-prompt-1.txt,renderer-prompt-2.txt,baseline-structure-spec-v1.0.0.js,fill-pixel-probes.json,observer-probe-request.json,observer-probe-events.json,observer-probe-parsed.json,tests.log}.
- 모든 실AI 종료 및 근거 저장 후 앱18769를reload했다. 다음시험에서 실제보내는관찰v1.1/검수v1.2인지 확인해야 한다. 새로고침 후 저장 작업 복원을 마무리한다. 코드수정은 위2모듈+tests/test-ai-structure-spec.mjs와 이문서만. 커밋/푸시/배포/설치/원본수정 없음.
- 활성 위임: QAjc4cgL77zORfo9가 새 공식화학교과서 입자/용해/층 INPUT 1건 수집 중. 쓰기범위는 artifacts/textbook-input-expansion-round2/chemistry/만, 코드수정/AI생성없음. 결과의 완전한 도판/출처를 부모가 재확인한 뒤 다음 순환에 사용한다.

### 3차 종료 상태 갱신
- 앱 재로드 후 저장 작업5개/해양 후보2개와 keep/remove/remove 선택 및 needs-attention 판정 복원 확인. 원본+교정본 비교 화면으로 두었다. tmp/ocean-graph-failed-comparison.png가 현재 상태 근거. 실AI 실행 중인 요청 없음. reload로 `__markTrial`/`__boundaryProbe`는 사라졌으므로 다음 시험 계측을 새로 설치한다.
- 화학원본 수집도 완료. 첫 viewport PNG는 부모가 오른쪽 용기 잘림/검정여백을 발견해 rejected_incomplete로 분리했고 사용하지 않는다. 1회보완으로 실제공식WebP를직접다운로드해sips로전체1300×333 PNG형식변환. 부모가최종도판4개용기/2개상태/2개밸브가모두보이는것을확인했다. 생성후처리가아니라공식입력자산의포맷변환이며원WebP도보존.
- 다음 미사용 INPUT: artifacts/textbook-input-expansion-round2/chemistry/openstax-chemistry2e-fig11-3-helium-argon-mixing.png. OpenStax Chemistry2e §11.1 Fig11.3. SOURCE.md에공식URL/책라이선스기록(저작권확대해석금지). 입자종류·식별가능한개수·분포와밸브열림/닫힘/관연결이핵심. 글자만제거하며밸브구조를지우지않고원색유지자체를요구하지않는다. 아직실변환하지않았다.
- 현재 활성 위임 없음. 최종전체회귀/코드지문은 artifacts/5e-ocean-graph-trial/verification.json에 기록한다. 새 규칙의 전체PNG개선/미사용일반화는 여전히 미검증이며, 관찰전용probe의 부분적불확실성표현 개선과 구분한다.

## 야간 4차 · 실제 화학 입자 혼합 입력
- 00:01 KST 시작, 올바른pwd/feat/image-improvement 및 활성작업없음 확인. OpenStax Chemistry2e Fig11.3의 완전PNG1300×333 사용. 기본선택 structural/keep/remove. 원본계수/진단crop/숫자는 생성모델에 주입하지 않았다.
- 실제 UI 전송에서 구조관찰v1.1.0, 독립검수v1.2.0 확인. 관찰51.1초, 생성2/검수2(최초+명시fail 뒤 교정1회), 전체316.8초, 최종needs-attention. 원형용기4개/밸브2개/두상태와분리→혼합관계는보존되었지만 입자개수/국소배치 실패. 같은그림추가생성없음.
- 원본관찰은4개입자무리의수를null로남겼다. 허위숫자를만들지는않았지만 정확개수보존계약까지확립하지못했다. rendererPrompt는one-for-one as closely as possible/approximate relative placement라고표현하며 실제입자배치를재작성했다. 문구의인과효과는이한번으로단정하지않는다.
- 부모와독립시각검산으로확인한첫PNG 반례: 닫힘상태왼쪽연결목의작은입자 원본1→후보4(+3); 열림상태왼쪽구형본체의큰입자 원본15→후보12(-3). 후보연결목의별도큰입자1개는본체계수에서제외. 원본열림왼쪽작은입자는본체14+목1로확대재계수했다. 다른구획전체의정확개수는이번확정근거로사용하지않는다.
- 독립시각agent도초기에원본열림왼쪽큰입자14/작은입자13으로누락했다. 원본청색연결요소검출+확대오버레이로15/14로정정. threshold25/30/35에서열림왼쪽청색15검출이안정했고각후보를실물로확인했다. 다른구획은threshold에따라결과가달라 자동카운터정답으로승격하지않았다. 임의±1보증도철회. 자동CV도진단이며이미지생성의정답학습/입력으로쓰지않음.
- 검수v1.2도원본전체수가null인상태에서연결목입자가늘어난구체적반례를발견해fail 처리했다. 교정후에도그반례가남았다. 이검수동작확인은이전버전보다개선되었다는대조실험이아니다.
- 첫PNG1774×887,교정2172×724. 교정chromaticPixels328971/max채널차12,불투명. 시각presentation pass라도파일조건/구조실패때문에전체통과아님. 두저장PNG가실제Codex savedPath PNG와SHA256동일함을확인: 출력후처리없음/채택·삽입없음.
- 원본binding의transportSha256은raw PNG바이트가아니라UTF-8 dataURL문자열해시(ai-panel.js2294). raw해시와비교한초기검산은기준오류였고해당계산으로정정하여입력동일성확인했다. source파일SHA와dataURL SHA를분리해verification.json에보관.
- 이미지도구이벤트에는action(generate/edit)/reference-image IDs가노출되지않았다. 해당ephemeral렌더스레드의로컬rollout도찾지못해도구내부입력binding은inconclusive. 실제caller로원본이전송됨/rendererPrompt의Image1서술과,도구내부바인딩확정은구별한다. Codex가PATH에없고프로세스조회도권한차단되어추측하거나우회하지않았다.
- 제품코드변경없음. 직전364통과근거의HEAD/tracked diff/36개파일지문을문서갱신전에모두재확인하여재사용했다. 이번새검증은실AI사례/국소계수반례/전송바인딩/네이티브PNG동일성이다. 단위테스트를품질향상근거로쓰지않는다.
- 근거 artifacts/5e-gas-mixing-trial/{trial.json,candidate-1.png,candidate-2.png,renderer-prompt-1.txt,renderer-prompt-2.txt,source-blue-components.json,verification.json}. tmp/gas-source-open-left-count-overlay.png는원본진단오버레이이며생성결과아님. 현재실AI완료,계측window.__gasTrial유지. 앱은6번째작업의교정본과원본비교/검수실패상태.

### 다음 순환 및 확인할 가설
- 다음INPUT후보 OpenStax Biology2e Fig30.26 잎단면. 전체asset(상단조직도식+하단전자현미경)은직접다운로드완료. 부모가전체를확인했고, 원도식PNG의투명배경이검정으로보이는부분이있어, zIvx3ltAqQ5mlx6V가공식흰배경표시와동일하게상단완전도식만INPUT crop을만드는중. 원WebP/전체PNG보존; 생성OUTPUT보정아님. 파일범위 artifacts/textbook-input-expansion-round2/biology/뿐. 다른활성위임/코드수정없음.
- 현재첫생성의첨부는INPUT원본1개뿐이다. 평가원은사례관찰에서추출한텍스트규칙으로활용중이며 실제STYLE_REFERENCE이미지를생성기첨부로전달하는경로는아직없다. 향후별도가설로원본과시각스타일참고를명시적으로분리한제한적대조를검토한다. 이경우스타일참고는구조관찰/원본객체수에서제외하고,스타일향상으로개수·연결실패를상쇄하지않는다. 현재이를구현·개선완료라고보고하지않는다.

### 4차 종료 갱신
- 생명INPUT선택본완료/부모직접시각확인: artifacts/textbook-input-expansion-round2/biology/openstax-biology2e-fig30-26-top-diagram-white.png (825×470). 투명부분을공식흰배경표시로합성하여라벨이보이고상단조직도식/하단기공·화살표/전체경계가완전하다. 사진은입력선택에서만제외했으며원자산보존. SOURCE.md에좌표/해시/처리내역.
- 다음실험은이그림의상하표피·책상/해면조직·기공/공변세포·얇은큐티클 경계와 관계에주목한다. 단순외곽프레임과실제층경계를구별한다. 아직이그림을생성모델에보내지않았다.
- 현재모든위임및실AI종료. tmp/gas-neck-counterexample.png는부모·독립검증된1→4계수반례의균일확대비교(진단그림,원본/생성PNG변형아님). 제품코드변경없음,추가생성없음. 이문서만최신인계상태로갱신했다.

## 2026-09-08 00:32~01:02 잎 단면 / 시각 스타일 역할 프로토타입

### 범위와 충돌 확인
- 승인된 x20/5E에서 pwd, feat/image-improvement, HEAD 4251a803128ac8963c4f8018418a03c0558781ea 확인. 활성 child 없음과 UI 실AI 대기 상태 확인 후 시작했다.
- 초기 code_explorer가 잘못된 hande/TS 경로를 읽은 결과는 즉시 폐기했다. 그 위임의 파일 변경은 없었고, 부모가 절대경로로 직접 구현했다. 후속 독립 검토는 올바른 경로 확인을 첫 단계로 요구한 default 위임으로 수행했고 명백한 오류를 보고하지 않았다(테스트 실행은 부모).

### 기준 조건: 교과서 INPUT만, 실제 작업실
- 미사용 OpenStax Biology 2e Fig30.26 상단 완전 crop, structural arrows / keep trends / remove leaders. 별도 Sol high 구조 관찰 v1.1.0 → 생성 v1.4.0 → 검수 v1.2.0. 생성 2회, 검수 2회, 약 451.2초, 최종 needs-attention. 채택/삽입 없음.
- 첫 PNG에서 원본 기공 화살표 2개(상향 1, 하향 1)가 화살촉 3개(상향 2, 하향 1)로 증가했다. 부모와 독립 시각 대조가 일치한다. 교정 뒤에도 상표피-책상조직 접촉 실패와 픽셀 계약 실패가 남았다.

### 코드: 선택적 역할 분리 프로토타입
- 새 js/ai-reference-roles.js: INPUT_SOURCE / STYLE_REFERENCE / CANDIDATE를 첨부 번호로 분리. analysisAttachments에는 INPUT만 반환, 원본-스타일 동일 데이터 및 중복 스타일/스타일만 있는 요청을 거부. 무스타일 경로에는 추가 계약 없음.
- buildWhitePngPrompt v1.5.0, buildImageReviewPrompt v1.3.0에 optional referenceRoleContract 연결. 생성/수정/검수 문구가 스타일을 원본 계수로 취급하지 않게 한다. tests/test-ai-reference-roles.mjs 추가.
- **제품 UI의 스타일 선택, 작업 저장/복원, 캐시, 자동 교정 orchestration에는 아직 연결하지 않았다.** 현재 제품 기본 경로는 여전히 INPUT만 첨부한다. 다음 연결 작업 때 위 네 부분을 함께 다뤄야 한다.
- 신규 실행 전체 회귀 369 pass / 0 fail, diff --check 통과. 이것은 계약/회귀 근거이지 시각 품질 향상 근거가 아니다.

### 스타일 조건: 별도 제어 요청, 첫 PNG만
- 같은 INPUT, 같은 Sol medium, 같은 원본 구조 관찰을 고정했다. 평가원 생명과학I 14번(5e-learning-round1/bio-q14-hires.png)은 STYLE_REFERENCE로만 두 번째 첨부했다. 관찰 재호출/숫자 수동 주입/교정/재생성 없음. 무스타일 프롬프트 재구성은 버전 표기 외 기준 조건과 동일함을 assert했다.
- 실제 rendererPrompt에서 Image 1=구조의 유일한 근거, Image 2=표현만 참고, Image 2 객체·분기·화살표 복제 금지까지 확인했다. 단, 이미지도구 내부 reference ID/binding은 여전히 inconclusive. caller 첨부와 renderer 문구 확인을 내부 binding 입증으로 바꾸지 않는다.
- 생성 PNG 1개가 나왔으나 약 93.4초에 어댑터의 image-finalization interrupting 뒤 native turn이 interrupted로 끝났다. probe의 종료 상태는 failed로 보존했다. **성공한 전체 변환 경로로 승격하지 않는다.** 나온 PNG는 진단에만 사용했다.
- 별도 Sol high 검수 v1.3.0은 completed 후 fail(약 107.4초). 픽셀은 불투명하나 유채색 픽셀 386,886 / 1,572,967, 최대 채널 차 12로 완전 무채색 실패.
- 원본과 대조하면 상표피 접촉/좌우 조직 경계에서 부분적 보존 개선이 보이지만 화살표 2→3은 그대로다. 시각 참고+역할 문구 묶음의 단일 진단 사례일 뿐, 참고 이미지 단독 효과나 일반화·개선 완료를 주장하지 않는다.
- 하표피 4개와 공변세포 2개가 부분집합인지 독립 추가 부품인지, 하단 큐티클의 정확한 범위는 관찰자 해석이 갈린다. 자동 검수의 관련 fail 사유도 곧 정답은 아니다. 이 항목은 확정 계수/퇴보 근거에서 제외하고 실제 폐곡선·층 범위를 다시 확인해야 한다. 확정 반례는 2→3 화살표와 픽셀 계약이다.

### 근거와 다음 단위
- artifacts/5e-leaf-style-trial/: baseline-trial.json, baseline-1/2.png, style-request.json, style-plan.json, style-events.json, style-finalization-events.json, style-1.png, 각 renderer, style-review-request/events/response, style-pixel-check.json, verification.json.
- 세 PNG 모두 실제 Codex savedPath 파일과 SHA-256 일치. INPUT data URL 해시도 구조 관찰 source binding과 일치한다. 생성 출력 후처리 없음.
- tmp/leaf-arrows-comparison.png는 부분 확대 진단 그림이며 원본/생성 파일 자체는 바꾸지 않았다.
- 이번 단위 종료 시 실AI 요청과 위임은 종료했다. 같은 잎 원본은 더 생성하지 않는다. 다음은 다른 교과서 유형 또는 역할의 UI/캐시/저장/교정 연결 중 작은 독립 단위로 진행한다. 자동 관찰의 부분집합-추가 부품 혼동은 별도 가설로 보류한다. Electron native E2E는 여전히 미검증.

## 2026-09-08 01:04~01:18 스타일 포함 검수 컨트롤러 연결
- 승인된 pwd/feat/image-improvement 브랜치를 다시 확인했고, 활성 child 없음과 실제 18769 작업실의 대기 상태 확인 후 진행했다. 이번 단위의 실제 AI 호출은 0회이며 잎 단면 재생성도 없었다.
- js/ai-image-review.js v1.3.1: optional styleAttachments를 시작 시 검증·스냅샷한다. 검수 → 교정 → 재검수 모두 INPUT_SOURCE, STYLE_REFERENCE, CANDIDATE 순서를 컨트롤러가 소유한다. 원본 이름도 INPUT에서만 계산한다. 교정 콜백이 스타일을 빠뜨리거나 잘못된 후보 첨부를 반환해도 순서와 역할 계약, 고정 표시선 계약을 컨트롤러가 유지한다. 교정 1회 제한은 그대로다.
- 잘못된 스타일 입력은 기존 활성 검수를 취소하기 전에 거부한다. 후보 준비 중 취소, 후보 준비 중/검수 전송 후 id·이름·data 변경은 실패로 닫아 오래된 pass를 적용하지 않는다. 실제 교정 이미지 수신에 따른 정상 후보 교체에는 새 binding을 만든다. DOM 카드 등을 가진 기존 후보 객체를 JSON 복제하지 않으므로 기존 UI 객체 참조 방식은 유지했다.
- 독립 코드 검토가 후보의 비동기 변경 반례를 지적했고, 부모가 fail-closed 방식으로 구현했다. 같은 후보 변경 위험이 있는 기존 INPUT 전용 경로에도 적용했고, 스타일 있음/없음 각각에서 준비 중 변경과 전송 후 변경을 확인하는 4개 테스트를 추가했다. 처음에는 정상 교정 후보 수신 시 binding 갱신 누락으로 회귀 1개가 실패했고, 수신 지점 갱신 후 정상 교체와 변조 차단이 함께 통과했다.
- 새 import로 data URL 방식 반례 테스트의 상대경로 해석이 깨졌던 문제는 tests/test-ai-review-counterexamples.mjs를 실제 file URL import로 고쳐 해결했다. FIVE_E_REVIEW_MODULE 경로 선택 기능도 유지했다.
- 최신 전체 회귀 **377 pass / 0 fail**, git diff --check 통과. 코드/이벤트 계약의 근거이며 시각 품질 근거가 아니다.
- 기록된 실제 교과서·평가원·생성 PNG를 사용한 **오프라인 전송 재생**도 최종 코드에서 새로 실행했다. 원본/스타일 바이트 동일성, 후보 A → 교정 요청 A → 재검수 B, 표시선 계약, 최종 needs-attention과 추가 교정 없음 확인. 실제 모델 생성/검수나 Electron E2E로 보고하지 않는다.
- 근거: artifacts/5e-style-controller-verification/replay-final.json (최종 코드 해시·HEAD·당시 tracked diff·실제 PNG 해시), tmp/style-controller-tests.log. replay.json은 후보 변경 차단 보강 전 중간 재생이며 최신 근거는 replay-final.json이다.
- **남음:** 제품 UI의 이미지 역할 선택, 최초 생성/구조 관찰의 역할 분리, 작업 저장·복원/캐시 키, ai-panel의 styleAttachments 전달을 함께 연결해야 한다. 지금 UI 기본 경로는 여전히 INPUT만이다. 코드 위임은 없었고 부모가 비중첩 범위에서 구현했다. 모든 위임과 실AI는 종료 상태다.

## 2026-09-08 01:25~01:44 역할 저장·캐시 데이터 계층 / 회로 INPUT 확보
- 승인 pwd와 feat/image-improvement 확인, 시작 시 활성 child 없음 확인. 부모 코드 작업과 공개 자료 확보 위임은 파일 범위가 분리되었다. 실AI 호출 0회, 생성 PNG 후처리 없음.
- ai-reference-roles v1.1.0: getReferenceRole/partitionReferenceItems 추가. 누락된 옛 역할만 INPUT으로 읽고, 알 수 없는 역할과 명시적 null은 차단한다. 직접 planImageReferences를 호출해도 명시적 역할과 inputs/styleReferences/candidate 위치가 모순되면 거부한다. 이 우회 반례는 독립 코드 검토에서 발견해 수정·검증했다.
- ai-panel의 실제 snapshotImageItem에 referenceRole을 보존했다. 잘못된 값을 INPUT으로 덮어쓰거나 사용자 기록에서 없애지 않는다. Node snapshot → JSON → snapshot 경로에서 확인했으며, 실제 브라우저 IndexedDB 재시작 검증이라고 부르지 않는다.
- ai-remote-input-plan remote-input-v3 / cache schema 5e-ai-output-v3: 캐시 서명에 referenceRole을 포함하고 동일 픽셀의 INPUT과 STYLE을 중복 제거로 합치지 않는다. 기존 primary/reference 선호 역할과 의미 역할은 별도 필드다. 역할 교체, 스타일 바이트 변경, 첨부 순서 변경 시 키가 다르다. 구 캐시 항목이나 작업 데이터를 직접 삭제하지 않았다.
- 기존 contact-sheet 합성 경로는 활성 STYLE_REFERENCE를 거부한다. 스타일을 원본과 합성해 구조로 오인시키지 않고, 별도 역할 흰 PNG 경로를 사용하도록 막는다. 비활성 스타일은 기존 prune 후 제외된다.
- 최신 전체 회귀 **383 pass / 0 fail**, diff --check 통과. 실제 회로 JPEG와 평가원 PNG의 snapshot/JSON 왕복에서 역할·바이트 보존, INPUT만 분석 첨부 1개, 전체 생성 첨부 2개, 역할 교체에 따른 캐시 키 차이를 새로 확인했다. 이는 데이터/전송 계약 검증이지 모델 품질이나 UI E2E 증거가 아니다.
- 근거: artifacts/5e-style-storage-verification/real-image-roundtrip.json, verification.json, tmp/style-storage-tests.log.
- 공개 교과서 다음 후보: artifacts/textbook-input-expansion-round3/circuit/openstax-college-physics-2e-figure-21-5-original.jpg (875×544). OpenStax College Physics 2e 공식 Fig21.5의 **전체 다단계 혼합회로 도판**이다. 부모도 직접 확인했다. 설명의 ‘7개 저항’은 최초 회로에 관한 것이므로 전체 다단계 파일의 총수와 혼동하지 않는다. 아직 모델에 보내지 않았다.
- 먼저 받은 Fig21.6은 부모가 하단 반환도선의 캔버스 경계 접촉을 발견했다. 확대 재검토 후 ‘완전함’ 주장을 철회하고 HOLD / 경계 민감 시험 제외로 SOURCE.md에 명시했다. 원본 보존, 패딩이나 도선 보완 없음. 대체 Fig21.5와 공식 출처/해시는 같은 SOURCE.md에 있다.
- **남음:** UI 역할 선택, 최초 생성·구조 관찰·코멘트의 INPUT/STYLE 분리, ai-panel의 styleAttachments 전달과 이를 통한 실제 저장/복원·캐시 E2E를 함께 연결한다. 데이터 계층과 검수 컨트롤러만 준비되었고, 현재 사용자 UI는 여전히 INPUT만 첨부한다. 모든 위임과 실AI 요청은 종료 상태다.

## 2026-09-08 01:47~02:35 역할 UI 및 최초 생성 연결
- 승인 경로/브랜치/HEAD 유지. 부모가 UI 범위만 수정했고 독립 검토는 읽기 전용. 이번 단위 실AI 0회. 커밋/푸시/배포/사용자 데이터 삭제 없음.
- 카드에 `변환 원본`/`표현 참고` 선택기를 추가했다. 최초 요청 전에만 역할 변경 가능. 비교 선택기도 두 역할을 구분하며 역할·표시선 선택은 작업 snapshot/IndexedDB 저장·복원에 유지된다.
- 최초 흰 PNG: 구조 관찰에는 INPUT만, 생성에는 INPUT→STYLE, 검수/교정/재검수에는 INPUT→STYLE→CANDIDATE. 캐시 descriptor에는 STYLE을 포함하고 원본 코멘트·구조 근거에서는 제외한다.
- **지원은 원본이 있는 새 작업의 첫 PNG 변환과 자동 교정 1회다.** STYLE 포함 대화/수동 추가 수정/일괄은 명시 차단한다. 무스타일 기존 경로 유지.
- 독립 검토가 코멘트 모듈의 자체 역할 가드 누락을 지적했다. `isImageCommentTarget`으로 caller 필터 없이도 STYLE·null·미확인 역할의 원본 코멘트 작성/표시를 막았다. 기존 코멘트 데이터는 지우지 않는다.
- 실제 브라우저에서 STYLE 전용 sentinel 코멘트를 만들고 역할을 바꿨다. 저장에는 남고 UI 코멘트 수는 0이며, 5개 요청 모두 sentinel이 없었다. 회로 JPEG+평가원 PNG의 모의 흐름에서 첨부 수 1→2→3→3→3, SOURCE/STYLE 바이트 일치, 표시선 계약, 후보 A→교정 A→재검수 B 및 최종 needs-attention 확인.
- 후보는 기록된 실제 잎 PNG 두 장을 모의 출력으로 사용했다. **회로 변환 품질 시험이 아니다.** 저장 PNG SHA-256은 1617×972 fixture와 각각 일치. 기존 AI 전송 최적화는 검수용 사본만 1536×923 PNG로 축소한다. 처음의 전송본=저장 원본 assertion은 잘못된 가정으로 실패했고, 저장 원본 보존과 전송 사본 일관성으로 구분해 검증했다. 출력 후처리 없음.
- 역할 선택기의 대비 오류를 테마 --bg-input으로 수정했다. Chromium ::details-content의 자동 높이 때문에 참고 이미지가 40px로 축소되는 현상도 부모 높이를 공유하게 수정했다. 최종 카드 578px, 이미지 488×534px, 선택기 글자 rgb(230,237,243)/배경 rgb(13,17,23).
- 최신 새 실행 **387 pass / 0 fail**, diff --check 통과. tests/test-ai-reference-role-ui.mjs 추가. 코드/모의 UI 근거이지 과학 구조 정확도 근거가 아니다.
- 근거: artifacts/5e-style-ui-verification/mock-trace-final.json, assertions.json, stored-workspace-summary.json, stored-native-png-hashes.json, verification.json. mock-trace.json은 앞선 동일 PNG fixture 중간 기록. 화면: tmp/style-role-ui-proof.jpg.
- **남음:** 실제 18769 새 작업으로 미사용 Fig21.5 첫 변환 1회 및 첫 PNG 구조·비율·연결/픽셀 독립 검수. Fig21.6 HOLD. 내부 이미지도구 reference ID binding 및 Electron 네이티브 E2E는 inconclusive/미검증. 모델 품질 향상은 아직 입증되지 않았다.

## 2026-09-08 02:40~03:05 실제 회로 첫 PNG / 자동 검수의 비율 누락
- 실제 18769를 대기 상태에서 새로고침하고 새 작업으로 OpenStax Fig21.5 INPUT + bio-q14-hires STYLE을 추가했다. 화살표 모두 유지 / 추세선 유지 / 보조선 제거. 실제 호출은 관찰 Sol high(1첨부) → 생성 Sol medium(2첨부) → 검수 Sol high(3첨부), 총3회. PNG 생성1, 검수1, 자동 교정0. 같은 회로를 다시 생성하지 않는다.
- 원본/STYLE 바이트는 각 단계에서 SHA 일치. 첫 PNG 1591×989는 실제 Codex savedPath와 바이트 일치. 이미지 생성 항목은 completed였으나 PNG 수신 후 어댑터 finalization으로 native turn은 interrupted 종료했다. UI는 이후 독립 검수까지 진행했다. 전체 성공·품질 통과로 승격하지 않는다.
- 부모와 독립 시각 관찰: 저항 7→4→3→2→1(총17), 전원5, 화살표4 및 병렬/직렬 전기적 연결은 유지. 문자·점선 설명 타원 제거는 선택대로다. 다만 전기적 등가와 실제 도선 배치/비율 보존은 다르다.
- 확정 비율 반례: 첫 패널 상단 병렬 묶음의 실제 실선 외곽 가로/세로 비 약1.43→1.98. 자연 픽셀의 국소 선 투영 측정이며 전체 그림 크기 차이와 무관하다. 원본 (186,44)~(289,116), 결과 (346,75)~(574,190). 오른쪽 아래 병렬 묶음도 원본의 별도 하단 가로선+중앙 귀환 연결 구간 대신 외곽 하단선에 직접 합쳐져 배치가 변했다. 전기적 연결 오류라고 부르지는 않는다.
- 원래 자동 시각 검수는 **pass**였고 위 비율·배선 변화를 놓쳤다. 원본 관찰도 오른쪽 묶음을 '위쪽 선과 아래쪽 귀환선 사이'로 요약해 중간 연결 구간을 분리하지 않았다. 전기적 등가/패널 순서만으로 geometry pass하는 새 반례다. 자동 관찰·검수 합의를 정답으로 쓰지 않는다.
- 픽셀 검사: nonOpaque 0, chromatic 222765/1573499, 최대 채널 차10, exactWhiteShare 0.23558. 최종 gate가 needs-attention으로 닫았다. 자동 교정이 없는 이유는 raw 시각 검수가 pass였고 최종 픽셀 gate에서만 실패했기 때문이다. 출력 후처리·채택·캔버스 삽입 없음.
- 실제 어댑터 새로고침 후 INPUT/STYLE 역할, 화살표 keep, 후보/검수 상태 복원과 후보 PNG 바이트 보존도 확인. 네이티브 Electron 저장/삽입 E2E는 아니다.
- 근거: artifacts/5e-circuit-style-first-trial/의 first.png, first-renderer.txt, trial-final.json, source-observation.json, raw-review.json, verification.json, geometry-measurement.json, restore-summary.json. 진단용 폭 정규화 비교: tmp/circuit-first-geometry.png. 실제 UI: tmp/circuit-real-ui-proof.jpg. 진단 crop은 원본/생성 파일이나 모델 입력을 변경하지 않는다.
- 다음 작은 단위는 회로·관·분기망의 실제 경로/중간 연결선/국소 종횡비 관찰 및 검수 규칙 보강이다. 이 한 사례의 계수·좌표를 프롬프트에 주입하지 않는다. STYLE 효과의 일반화나 생성 품질 개선은 미입증. 이번 실제 요청과 독립 위임은 모두 종료했다.

## 2026-09-08 03:05~03:20 경로·국소 비율 일반 규칙 / 고정 후보 재검수
- structure-spec v1.2.0에 routing 관찰 유형을 추가했다. 회로·관·분기망의 기능적 연결과 실제 경로, 별도 연결선/중간 구간/빈 간격, 실선 외곽 기준 국소 비율을 나눠 기록한다. 관찰이 불확실하면 확정 수치를 만들지 않는다. JSON envelope version1 및 기존 자료 호환 유지.
- white-PNG v1.6.0: 명시 변경 요청 없는 등가 배선 재설계, 중간 구간의 귀환선 합치기, balanced spacing 명목의 국소 비율 변경을 금지했다. 이 제한을 실제 rendererPrompt까지 전달하도록 요구한다. 회로 사례의 17개·좌표·측정 비율은 템플릿에 넣지 않았다.
- review v1.4.0: connections와 실제 경로 형상/비율을 별도로 판단한다. 보존 실선 외곽을 같은 폭 등으로 정규화해 대조하며, 차이가 있으면 composition-state/request-scope에 기록한다. 명시적 사용자 수정과 표시선 선택은 우선한다.
- 새 실행 **390 pass / 0 fail**, diff --check 통과. 추가3개는 routing JSON/계약, 최초·교정 전달, 직접 정규화 대조와 사례 숫자 미주입을 검증한다.
- 이미 나온 회로 첫 PNG를 **재생성 없이 검수만 1회** 했다. 실제 Sol high, 같은 INPUT/STYLE/CANDIDATE 바이트, 같은 원래 요청/관찰/표시선/역할 계약. 바꾼 것은 검수 버전과 일반 판정 규칙 블록뿐이다. 관찰은 원래 v1.1.0 기록을 그대로 유지했으므로 새 routing 관찰·생성 자체의 시험은 아니다.
- native completed, 이미지 생성 이벤트0. 새 검수는 전기적 연결·계수 pass를 유지하면서 하단 두 폐회로의 정방형화와 우측 두 회로의 납작해진 비율을 composition-state/request-scope fail로 지적했다. 앞서 놓친 후보의 비율 실패를 이번 한 번은 탐지했다.
- 이는 고정 후보 1건의 탐지 결과이며 검수 일반화·오탐률이나 새 생성 품질 향상의 증명은 아니다. 상단 병렬 묶음과 하단 연결 구간의 모든 차이를 독립적으로 열거한 것도 아니다. 실제 작업의 첫 자동 검수 기록을 새 보고서로 덮어쓰지 않았다.
- 근거: artifacts/5e-routing-review-counterexample/request.json, prompt.txt, response-events.json, report.json, verification.json. 새 이미지 생성0, 출력 후처리0. 다음에는 미사용 액주계 교과서 입력 확보 후 새 관찰·생성 경로를 한 번 시험한다.

## 2026-09-08 03:20~04:21 액주계 첫 시험 / 계측 눈금 보호
- 미사용 OpenStax University Physics Volume 1 Fig14.12 전체 도판(975×333)을 INPUT으로, 기존 bio-q14-hires를 STYLE로 사용했다. SOURCE.md와 SHA-256은 artifacts/textbook-input-expansion-round4/manometer/에 보존. 원본 그림·생성 PNG 후처리 없음.
- 실제 18769 작업실에서 관찰1 → 생성1 → 검수1 → 자동 교정1 → 재검수1, 총5회, 첨부 수1→2→3→3→3. 각 단계 SOURCE/STYLE 바이트와 후보 A→교정 A→재검수 B 바인딩을 assertion으로 확인했다. 당시 structure1.2.0 / white1.6.0 / review1.4.0 / mark-policy1.0.0. 새 routing 관찰이 material/stages/nested와 함께 선택되었다.
- 원본 및 두 PNG에서 (a) 등액면, (b) 화면 왼쪽 개방·오른쪽 벌브 연결 및 왼쪽 액면 높음, (c) 왼쪽 개방·오른쪽 jar 연결 및 왼쪽 액면 낮음을 확인했다. 이는 액면 순서 확인이지 정규화된 액면 높이·채움 비율까지 보존되었다는 증거가 아니다. 첫 보조 판독의 좌우 오류는 원본 재확인 후 정정했다.
- 첫 PNG 2146×733, 교정 PNG1813×868. 각각 native savedPath와 SHA-256 일치. 첫 검수는 jar 내용물 윗경계가 낮아진 점을 올바르게 지적했지만, 실제 눈금선도 주석으로 오인해 삭제하도록 했다. source observation에도 눈금선이 annotation으로 잘못 분류되어 있었다. 첫 renderer는 실제 눈금을 남겼으나 교정 renderer는 세 자의 모든 눈금 삭제를 명시했다.
- 교정은 jar 내용물 윗경계를 원본에 가깝게 올렸지만 실제 자를 빈 막대로 바꿨다. 원본 jar 상부는 라벨 위로 내용물이 뚜껑 가까이 보인다. 독립 보조 판독의 '원본은 아래쪽만 채움' 주장은 확대 원본 확인 후 철회했다. 라벨 뒤 낱개 수·정확한 내부 경계는 확정하지 않는다. 자동 또는 독립 판독이라는 이유만으로 정답으로 취급하지 않는다.
- 기존 재검수는 raw pass였지만 최종 픽셀 gate는 needs-attention. 두 PNG 모두 nonOpaque0, chromatic216680/324101, 최대 채널 차13/11. 채택·삽입하지 않았다. 캔버스 크기 차이만으로 구조 왜곡을 확정하지 않으며, 개별 상대 크기·액체 점유 비율은 추가 검증 대상이다.
- 일반 계측 표식 규칙 보강: mark-policy1.1.0 / structure1.3.0 / white1.7.0 / review1.5.0. 실제 자·계기·눈금실린더·좌표축의 눈금선을 문자·숫자·단위 및 설명용 지시선과 구분한다. 명시적 눈금 삭제 요청이 없으면 보호하며, 잘못된 자동 annotation 분류나 이전 검수의 삭제 제안이 이를 뒤집지 않도록 했다. UI 도움말도 실제 눈금선 보존을 명시한다.
- 전체 회귀 최신 **393 pass / 0 fail**, diff --check 통과. 최초 실행은 비관련 motif 성능 시간 제한1건 실패(1500회 5426ms), 코드 변경 없이 해당 파일14/14(성능 항목92ms)와 전체393/393 재실행 통과. 최초 실패와 재실행 로그를 모두 tmp/calibration-*에 남겼다. 신규3개는 12개 표시선 조합, 관찰/검수 분류, 첫 생성/교정의 눈금 보호 문구를 검증한다. 시각 품질 보증은 아니다.
- 고정 교정 후보에 새 검수1.5.0만 실제 Sol high로 1회 적용했다. SOURCE/STYLE/CANDIDATE 바이트 및 기존 요청·관찰·표시선 문맥은 그대로이고 검수 버전/판정 규칙만 변경했다. native completed, 외부 도구/새 이미지 생성0. 이전 pass와 달리 presentation/request-scope fail, 세 자의 눈금 누락을 major로 탐지했다. 원래 작업의 보고서는 덮어쓰지 않았다.
- 이 결과는 고정 반례1건의 탐지 근거다. 새 눈금 보호 규칙을 적용한 실제 생성/자동 교정은 아직 시험하지 않았다. AI bbox는 스키마 유효성과 별개로 위치 정확성이 미검증이다. 이번 보고서의 세로 범위가 실제 자 전체보다 작아 보이므로 정밀 위치 근거로 사용하지 않는다.
- 근거: artifacts/5e-manometer-style-first-trial/{trial-final,source-observation,review-1,review-2,verification}.json 및 candidate-1/2.png, renderer-1/2.txt. artifacts/5e-calibration-review-counterexample/{request,response-events,report,verification}.json. 진단 비교 tmp/manometer-calibration-comparison.png와 jar 확대 tmp/manometer-source-jar.png는 원본/결과 파일을 수정하지 않은 별도 진단 사본이다.
- 이번 단위 실제 요청과 위임은 종료. 추가 생성은 시작하지 않는다. 내부 이미지 도구 reference ID binding은 inconclusive, Electron 네이티브 E2E는 미검증이다. 커밋·푸시·배포·설치·사용자 데이터 삭제 없음. 남은 핵심은 생성 자체의 구조/완전 무채색 충족, 상대 액면/비율의 정밀 대조, AI bbox 신뢰성 검증이다.

## 2026-09-08 04:23 이후 검수 좌표 기준 분리 및 타입·경계 가드
- 야간 heartbeat 재개 시 승인 절대경로의 pwd/feat/image-improvement 확인. 읽기 전용 상태 위임으로 다른 활성 child 없음과 루틴 UNTIL 05:00 확인. 실제 18769의 기존 요청 completed 및 UI 대기 상태 확인 후 부모가 js/ai-image-review.js와 해당 테스트만 수정했다. 별도 코드 작성 위임·원본 Desktop 변경 없음.
- review1.6.0: 검수에 실제 전송하는 prepared CANDIDATE PNG의 IHDR에서 너비/높이만 읽어 bbox 분모를 명시한다. native 저장본이나 STYLE 크기는 사용하지 않는다. 헤더 판독은 PNG 완전성·픽셀 검증이 아니며 이미지를 바꾸지 않는다. x/width는 전체 너비, y/height는 전체 높이로 나누고, 형상 비교용 폭 정규화·정사각형 패딩·미리보기/crop 좌표계와 구분한다. 좌표 확신이 없으면 bbox를 생략하도록 한다.
- bbox 좌표 null/boolean/문자열/배열 값 등을 Number()로 0 또는 숫자로 바꾸던 경로를 차단했다. JSON 숫자만 허용하고, 명시적 null을 w/h 별칭으로 대체하지 않는다. 정상 숫자 배열 bbox와 숫자 w/h 별칭은 유지한다. 교정 요청에는 bbox가 검증된 마스크가 아닌 위치 가설임을 명시하고, 대상과 맞지 않는 박스의 임의 재척도·삭제 허가 해석을 금지했다.
- 독립 읽기 전용 코드 검토가 기존 1.000001 허용오차로 경계 밖의 양수 영역이 통과하는 반례를 찾았다. x/y=1에서 시작하거나 실제 합이1을 넘는 영역을 차단하고 회귀를 추가했다. 신규 총6개, 최신 전체 **399 pass / 0 fail**, diff --check 통과. 처음의 신규 STYLE 테스트는 기존 harness의 가짜 original 문자열 때문에 거부되어, 타입 계약에 맞는 synthetic IHDR fixture로 고쳤다. fixture는 이미지 유효성·시각 품질 근거가 아니다.
- 보존된 액주계 native PNG 두 장과 실제 전송 PNG를 사용해 컨트롤러를 오프라인 재생했다. review A → correction A → review B, 첨부3→3→3, SOURCE/STYLE 바이트 유지, 최종 needs-attention, 추가 교정 없음. prepared 크기는 **1536×524 →1536×735**이며 native2146×733/1813×868와 분리했다. 처음의 525 높이 가정 assertion은 틀렸고 실제 IHDR를 독립 Buffer read로 확인해524로 정정했다. 출력 파일 SHA 불변. 이 재생 자체는 실제 AI0회다.
- 보존된 실제 보고서5개(회로 첫 검수·경로 반례·액주계 첫/교정 검수·눈금 반례)는 새 parser에서도 형식 호환됨을 확인했다. 기존의 잘못된 pass를 재평가하거나 정답으로 승격한 것은 아니다.
- 별도 제한 시험: 눈금 반례와 같은 SOURCE/STYLE/CANDIDATE 및 판정 문맥을 고정하고, 검수 버전과 bbox footer만 바꿔 실제 Sol high 검수1회. 객체 위치나 측정 bbox는 모델에 넣지 않았다. native completed, 새 이미지 생성0, 금지 도구0. 눈금 누락 presentation/request-scope fail은 유지됐으며 세로 좌표는 이전 y0.045/h0.29에서 y0.098/h0.59로 바뀌었다.
- 후보의 세 빈 자를 수동으로 분리한 ROI에서 가장 큰 8-연결 검정 픽셀 성분의 외곽을 측정했다. 앞선 ROI 전체 외곽 방식은 (b)/(c) 인접 U관 픽셀을 포함해 폐기하고 별도 연결 성분으로 분리했다. 최종 자 외곽은 (157,86,48,510), (566,86,45,510), (1258,86,45,510). 이는 진단 측정이며 생성 출력이나 모델 입력을 수정하지 않았다.
- 해당 외곽 대비 bbox IoU는 이전0.347/0.336/0.336에서 새0.971/0.915/0.942, 대상 포함률은 약99.7%/100%/99.5%였다. **한 고정 후보에서의 위치 대응 결과**이며 일반화·정확한 분할·과학 구조 또는 첫 생성 품질의 개선 증명은 아니다. 원본 작업 보고서는 덮어쓰지 않았다.
- 근거: artifacts/5e-bbox-contract-verification/의 replay.json, recorded-report-compatibility.json, request.json, response-events.json, report.json, ruler-measurements-final.json, bbox-comparison.json, verification.json. 이전 ruler-measurements.json은 인접 선 포함 중간 측정이다. tmp/bbox-contract-tests-final.log 및 bbox-location-comparison.png(진단 표시만 추가, 생성PNG불변).
- 브라우저에서 모듈 import를 직접 확인하려던 REPL 시도는 도구 제한으로 전송 전에 차단되었다. 이를 브라우저 모듈 실행 증거로 보고하지 않는다. 실제 요청은 검증한 Node 모듈로 구성해 별도 전송했으며 실패한 준비 시도에서는 native 호출이 없었다. 종료 후 작업실 새로고침/복원을 완료했다. 제공 중인 review JS와 작업 파일의 바이트 일치, 기존 generated-25/26 및 needs-attention 유지 확인. 종료 시 scoped 코드 지문이 바뀌지 않아 최신399/399 회귀 근거를 재사용하고 diff --check만 새로 실행했다(closeout.json). native Electron E2E는 여전히 미검증. 추가 생성·커밋·푸시·배포·설치·사용자 데이터 삭제 없음.

## 2026-09-08 07:00 새 사용자 승인: 기존/현재 첫 PNG 비교 준비
- 사용자가 권고한 기존 방식과 현재 방식의 제한된 비교를 새로 승인하고 시작을 지시했다. 위 05:00 종료 규칙은 이전 야간 회차에 적용되며, 이 절은 새 승인 작업이다. 원본 보존·후처리/커밋/푸시/배포/설치/사용자 데이터 삭제 금지는 유지한다.
- 승인 절대경로/pwd/feat/image-improvement/기준HEAD 확인. 현재 제품 코드와 기존399 회귀를 보존하고, 먼저 재현 가능한 기준 요청과 미사용 교과서 INPUT·적합한 STYLE을 읽기 전용으로 감사한다.
- 계획: 첫 표본1건에서 모델·표시선·입력 바이트를 고정하고 기존 직접변환 / 현재 무STYLE / 현재 STYLE의 첫 PNG를 조건별1회만 생성한다. 자동 교정은 비교에서 제외한다. 외부 구조관찰 유무 및 STYLE 이외에 달라지는 프롬프트 규칙은 명시하며 개별 변경의 인과효과로 과대해석하지 않는다.
- 독립 평가 기준과 원본 관찰은 모델 요청에 숫자 정답으로 주입하지 않는다. 조건명 비공개 대조와 네이티브 PNG/rendererPrompt/시간/픽셀 검사를 분리한다. 기준선과 표본 확정 전 새 실제 AI 호출은 시작하지 않았다.

### 07시 비교 준비 중 확인한 기준선·실행 차단
- 재현 가능한 기존 조건은 artifacts/5e-structure-connected/baseline-white-png-v1.2.0.js다. 이는 과거에도 역재구성한 builder이며 최초 역사적 실행 전체의 원본 스냅샷이 아니다. 이번 A는 ‘재구성 v1.2 직접변환 조건’으로 명명한다. 현재 B는 structure1.3/white1.7이므로 JSON 유무 외의 일반 규칙도 다르다. A/B 차이를 JSON 단독 인과효과로 보고하지 않는다.
- 재점검에서 이전 첫 PNG 직접 퇴보 대조도 확인: 생명14 재현의 상대 원 높이 원본0.780, 재구성 기존조건0.778947, 당시 관찰추가조건0.938202. paired-pixel-measurements.json과 실제 두 PNG에 근거한다. 앞선 사용자 요약에서 이 직접 대조를 빠뜨린 점을 정정했다. 평가원 자기재현·당시 과도기 버전 사례이며 최신 교과서 일반 성능으로 확대하지 않는다.
- 제품 코드 변경 없이 A/B/C 관련 규칙 파일을 artifacts/5e-first-output-comparison-01/contracts/에 고정하고 해시를 protocol-preparation.json에 기록했다. 보존된 무효한/미확정 입력을 억지로 재사용하지 않는다.
- localhost18769는 미기동. 동일 보안 사전검사가 sandbox_apply: Operation not permitted로 실패했다. 정상 Terminal 외부 실행·sandbox 비활성화 등 우회는 하지 않는다. 사용자가 기존 start-normal-mac.cjs를 Terminal에서 실행해야 실제 생성이 가능하며, 해당 한 단계만 안내했다. 아직 실제 AI 호출0이다.
- 새 공식 INPUT 후보 Fig3.12는 부모의 직접 이미지 확인에서 다수의 개별 입자점과 경계 접촉이 발견되어 이번 정량 비교에서는 HOLD. 원본은 보존하고 대체 도판을 별도로 검토한다. STYLE후보 화학2025수능19번은 부모도 3개 피스톤 용기/상태 화살표를 직접 확인했다.
