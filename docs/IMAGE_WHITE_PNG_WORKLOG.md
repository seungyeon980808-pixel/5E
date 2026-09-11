> 이 문서는 이전 단계의 조건·검증 기록을 포함합니다. 현재 제품의 첫 변환은 승인된 고정 요청으로 PNG 1장만 생성하며 사전 AI 관찰·자동 검수·자동 교정을 실행하지 않습니다. 최신 운영 조건은 `IMAGE_WORKBENCH_OPERATIONS.md` 앞부분을 우선합니다.

# 흰 배경 단일 생성 개선 작업

> 아래는 이전 단계의 기록이다. 2026-09-07 후속 승인으로 현재 정책은 **생성 1회 + 독립 검수 + 명확한 오류에만 교정 최대 1회 + 재검수**로 변경됐다. 현재 명세와 구현·차단 상태는 `IMAGE_REVIEW_SPEC.md`, `IMAGE_WORKBENCH_OPERATIONS.md`를 우선한다. 후처리 금지는 유지한다.

## 범위와 상태
- 기준 HEAD: 4251a803128ac8963c4f8018418a03c0558781ea, feat/image-improvement.
- 원본 Desktop/5E 수정 없음. 별도 x20/5E에서 구현. 커밋·푸시·배포 없음.
- 목표: diagram+raster에서 의미 구조 보존, 표면 묘사 절제, 흰 불투명 PNG를 생성 1회로 확보.
- 투명화, 팔레트/임계값 처리, 자동 교정, OCR, 객체화 확대는 범위 밖.

## 구조·운영
- UI: 그림 첨부 후 요청 입력 없이 생성 가능. 흰 배경 경로에서 복잡도 선택 숨김, 생성 1회/후처리 없음 안내. 결과 PNG 저장/기존 캔버스 삽입.
- API: 기존 Electron Codex send/event 유지. 신규 외부 서비스·권한·네트워크 경로 없음.
- Prompt: ai-white-png.js 전용 규칙. 기존 ai-prompt.js의 투명 배경 지침을 섞지 않음. 명시 첨부는 입력으로 사용 가능, 외부 검색/도구 대체 금지.
- Data: 원본 data:image/png URL 그대로 보존. 기존 투명화 함수는 white 경로에서 호출하지 않음.
- Cache: WHITE_PNG_VERSION + outputWorkflow + 투명배경 false/팔레트 false로 legacy cache 분리. 동일 입력 재사용은 기존 기능 유지.
- Batch: 동일 전용 prompt/원본 보존 경로. white는 complex preference와 무관하게 단일 pass.
- Legacy: 사용자가 선택한 complete/asset 경로는 기존 동작 유지. 다른 기능의 출력을 흰 배경으로 강제하지 않음.
- 문서: 파일 업로드·PNG 출력만. 문서/HWP/OCR 변경 없음.
- 모바일: 변경 검증 범위 아님. 데스크톱 UI와 Mac 어댑터 시험에 한정.
- 배포: 없음. Windows 설치판/Electron 창 검증 아님.

## 평가 근거
- 실제 평가원 2025 수능 화학I 1·19번, 생명과학I 13·15번 도판 확인. 삽화와 구조 도식 구분.
- 전체 평가원 그림의 명암/입체를 일괄 금지하는 일반론 아님. 이번 목표는 구조 도식 subtype.
- 구조: 객체 수/층/접촉/안팎 관계/배치. 스타일: 필요 없는 질감·제품 묘사. 마감: 흰 배경/불투명/선과 면 손실 없음.
- 결과 3종과 원본을 보존하고 모델·설정·생성 횟수·시간 기록. 다른 모델·입력으로 시행된 과거 결과와 시간 차이를 인과 효과로 주장하지 않음.

## 검증
- 최초 통합 unit: 263 pass, 0 fail. 실제 UI 및 생성 시험 진행 중.
- Mac 임시 HTTP/SSE 어댑터로 실제 Codex 연결. 브라우저 포트 18767. 제품 코드의 IPC 교체가 아닌 시험용 외부 어댑터.
- 생성 성공과 사용 가능 판정은 분리. 순백색/알파 조건을 모델이 항상 만족한다고 보장하지 않음.
- 실제 결과 및 독립 코드 리뷰 반영 후 아래 최종 기록 갱신.

## 최종 기록 (2026-09-07)
- 신규/회귀 unit **267 pass, 0 fail**, git diff --check 통과. 테스트 로그는 세션 tmp/white-final-tests.log.
- 독립 리뷰에서 PNG 오류를 성공으로 처리하는 문제, HTTPS 원본 미지원, 늦은 done 이벤트의 오류 덮임 발견 후 수정. 실제 addPreview/finishCurrentTurnUi 함수 추출 실행 회귀 테스트 3개 포함.
- 기존 실제 생성 PNG 719,694 bytes를 새 출력 함수에 전달: SHA-256 일치, 변환 함수 호출 0회. 새 AI 생성 성공 증거와는 구분.
- 최종 UI: 그림형+raster에서 복잡도 숨김과 흰 배경 단일 생성 안내, complete 선택 시 기존 복잡도 복원 확인.
- [blocked] 새 그림 품질/시간 절감: Sol/low/priority 단건 시험관 1회와 일괄 3개 모두 결과 없음. 단건은 23초·생성 호출 0회. 일괄은 37.334/35.593/41.893초, 각 pass 1로 실패. 수집된 응답은 첨부 샌드박스 접근 제한을 보고. 근본 원인 확정 아님.
- 반복 실패 이후 추가 유료/생성 요청 중단. 권한 확대·sandbox 변경·보안 우회 없음.
- 이번 결과에서 개선 PNG 3장이 확보됐다고 주장하지 않음. PNG 저장/캔버스 삽입의 새 실제 생성 end-to-end도 미확인.
- 다음 작업은 허용된 정상 앱 실행환경에서 첨부 접근 문제를 진단하고 동일 입력 단일 생성 재검증. 구현은 미커밋 상태 유지.
- 임시 시험 서버: 18767이 최종 UI 확인 인스턴스. 앞선 18766은 PATH 누락으로 로그인 불가였음. 해당 임시 프로세스 종료 시 OS 권한 거부가 있었으므로 종료 완료로 보고하지 않음.

## 첨부 접근 제한 원인 진단
- Codex logs_2.sqlite에서 2026-09-07 07:52:21/07:53:05 UTC 실제 imagegen tool 오류 확인: `fs sandbox helper failed ... exit status: 71: sandbox-exec: sandbox_apply: Operation not permitted`.
- 전달된 LocalImage 경로와 imagegen referenced_image_paths는 동일. imageCallCount=0은 도구 요청 자체가 없었다는 뜻이 아님: 입력 파일을 읽기 위한 sandbox helper가 imageGeneration 이벤트 이전에 실패함.
- 이미지와 무관한 제한적 `/usr/bin/sandbox-exec ... /usr/bin/true`도 현재 도구 환경에서 동일 exit 71로 실패. 파일별 ACL/PNG/후처리 오류가 아니라 이 실행환경의 macOS sandbox 초기화 실패로 확인.
- 해결 준비: 같은 read-only/never 설정을 유지한 정상 Terminal 실행용 `artifacts/5e-attachment-diagnosis/start-normal-mac.cjs`. sandbox 생성 사전검사 통과 시에만 localhost:18769 실행.
- 에이전트가 상위 도구 실행 제한을 우회하여 실행하지 않음. 사용자 정상 Terminal 시작 후 동일 모델/첨부로 검증을 이어가야 해결 확정 가능.

## 정상 실행 복구 및 실제 재시험 결과
- 사용자 정상 Terminal에서 start-normal-mac.cjs 실행: 제한적 sandbox-exec 사전검사 통과. localhost:18769 연결 확인.
- 정상 환경의 혈관·증류 imagegen이 temp/5e-codex의 referenced_image_paths를 직접 읽어 생성 성공. temp와 userData를 합치거나 read-only/never를 해제하지 않았음. 따라서 위의 첨부 접근 blocker는 해결됨.
- 첫 v1.0 시험관: Sol 42.055초 / imagegen 19.100초 / 호출1. 생성 성공이나 원본 노랑·적갈색 잔류. 실제 도구 prompt에 pale-yellow/red-brown 보존 문구가 들어간 것을 로그로 확인.
- v1.1: R=G=B 무채색 계약과 원본 색 복제 금지를 이미지 도구 prompt까지 전달하도록 보완. 추가 호출이나 후처리는 도입하지 않음.
- v1.1 시험관 Sol: 52.224초 / imagegen 21.484초 / 호출1.
- v1.1 혈관 Sol: 87.370초 / imagegen 45.978초 / 호출1.
- v1.1 증류 Sol: 312.651초 동안 imagegen 시작 없음. 에이전트가 대기 낭비를 제한하기 위해 취소. 실패 시간을 제외해 속도가 향상됐다고 주장하지 않음.
- v1.1 증류 Luna 별도 시험: 54.973초 / imagegen 41.737초 / 호출1. 모델 변경이므로 Sol과 동일 조건 비교 아님.
- 새 결과 세 장 모두 코드가 받은 data URL 디코딩 바이트와 Codex savedPath PNG SHA-256 일치. 투명 픽셀0. 실제 PNG 저장 버튼 다운로드 684,258bytes와 시험관 미리보기 바이트 일치. 시험관(v1.0)·증류(v1.1) 캔버스 삽입 UI 확인.
- **품질 미통과 항목:** 흰색으로 보이는 배경에도 미세한 픽셀 편차/질감이 남아 순백색 배경을 완벽히 충족하지 않음. 시험관 cap 단순화/층비율 검토 필요. 혈관 혈소판 누락(육안 원본6→결과5) 및 과밀 질감. 증류에서 외부 용액 영역이 사라지고 내부 작은 용기 액체 표현으로 바뀌어 과학적 구조 보존 실패. 세 결과를 완성품으로 확정하지 않음.
- 최종 테스트 268 pass/0 fail. 생성 실패 해결과 생성 품질 완성은 별도 판정.
- 근거: artifacts/5e-attachment-diagnosis, artifacts/5e-white-png-verified. 원본 저장소·보안 설정·backend main/thread profile 수정 없음. 커밋·푸시·배포 없음.
