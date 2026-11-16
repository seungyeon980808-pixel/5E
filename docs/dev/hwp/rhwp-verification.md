# rhwp 확인 기록 (그림 배율·그림 조절·입력 성능)

> 1.7.1 정리: 아래 문서를 한 파일로 모았습니다 — `RHWP_IMAGE_SCALE_VERIFICATION.md`, `RHWP_PICTURE_CONTROLS_VERIFICATION.md`, `RHWP_TYPING_PERFORMANCE.md`. 내용은 원문 그대로이며 개인 경로만 지웠습니다.

---

## RHWP 이미지 재반영 확대 오류 수정 및 검증

2026-10-09 · `perf/rhwp-typing-latency` · 기준 커밋 `757287ca107a6142d8f5d24dd658ba7b2a175bee`

### 결과

그림을 수정한 뒤 시험지에 다시 넣을 때 **그림 틀 안의 이미지만 확대·잘리는 오류**를 수정했다. 별도 성능 작업 폴더에 반영했으며, 기존 타이핑 성능 변경은 유지했다. 수정 코드는 현재 `http://127.0.0.1:4189/?mode=pro&mobile=0&exam=1`에서 제공한다.

- 문서의 가로 폭, 배치 기준, 회전·반전, 표 셀 연결을 유지한다.
- 원본 편집에서 크롭을 바꾸면 선택한 영역 전체를 표시하고 가로 폭에 맞춰 높이를 계산한다.
- 크롭이 그대로인 라벨 편집은 기존 가로·세로 크기를 유지한다.
- 외부 문서의 그림을 등록할 때 기존 크롭 모양과 그림 틀을 유지하고, 전체 원본 래스터는 5E 배경 객체로 보관한다.
- HWP/HWPX 재열기 및 `.5e` 프로젝트 복원 후에도 같은 방식으로 편집한다.
- 이전 버그로 생긴 특정 크롭 초기화 상태는 저장된 5E 내보내기 영역으로 복구한다. 해당 그림의 **원본 편집 → 시험지에 반영 → 기존 영역 확인**을 한 번 실행하면 문서의 배율도 정상화된다.

### 원인과 수정

이 RHWP 빌드는 그림 속성의 `originalWidth/Height`와 렌더링 이미지의 `originalSizeHu`에 서로 다른 기준을 사용한다. 그림 속성 창의 크롭 값도 원본 이미지 좌표와 같은 값이 아니다.

기존 코드는 `assignPictureImage()` 뒤 `cropLeft/Top/Right/Bottom: 0`을 설정했다. 이 setter는 크롭 끝을 **그림 틀의 원래 크기**로 바꾼다. 렌더러에는 더 큰 원본 이미지 좌표가 남아 있으므로 전체 PNG의 일부를 그림 틀에 확대해 표시했다. `originalWidth/Height`를 setter에 전달해도 해당 원본 이미지 좌표를 수정하지 못했다.

동일 하네스에서 수정 전 WebKit은 그림 틀 226.765625px에 내부 이미지 599.984375px를 표시했고, `inner image width` 검증이 실패했다. 수정 후에는 내부 이미지와 그림 틀의 크기 및 좌표가 일치한다.

`js/rhwp-exam-bridge.js`는 다음을 담당한다.

1. 실제 paint 데이터에서 원본 좌표와 크롭 영역을 읽는다. 숨겨진 편집 화면이나 가상 페이지에 있는 그림도 DOM 위치 없이 처리한다.
2. 원본 좌표가 있으면 해당 좌표 전체를 덮도록 이미지 교체 API의 크롭 인자를 계산한다. 실제 PNG 해상도는 PNG 바이트에서 읽히므로 별도로 유지된다.
3. HWPX에서 원본 좌표가 생략된 경우에는 고정된 Studio의 `Wo/Ko` 추론 규칙을 따른다. 전체 이미지 크롭 끝 좌표, 실제 PNG 헤더 또는 등록 시 디코딩한 래스터 크기를 사용한다.
4. 전체 이미지를 뜻하는 0 크롭 값도 처리한다. 해석할 수 없는 원본이나 좌표는 문서 바이트를 바꾸기 전에 실패한다.
5. 그림 교체 후 높이만 조정하고, UI 크롭 setter로 다시 초기화하지 않는다.

`js/rhwp-exam-workspace.js`는 외부 그림의 기존 크롭을 표시용 PNG에 한 번 적용하고 전체 원본을 유지한다. 등록 도중 문서나 그림 속성이 바뀌었는지도 재확인한다. 이전 버그의 크롭 끝이 그림 속성의 원래 크기와 정확히 일치하고 UI가 크롭 없음으로 표시하는 경우에는 저장된 내보내기 영역을 다시 사용해 이중 크롭을 막는다.

RHWP SDK/Studio 0.8.7 및 WASM/vendor 파일은 변경하지 않았다. 고정된 원본 버전은 `1a76570e833917d15817415a53c09ad61ab3203f`다. API 계약은 [RHWP picture.rs](https://github.com/edwardkim/rhwp/blob/1a76570e833917d15817415a53c09ad61ab3203f/src/document_core/commands/object_ops/picture.rs)의 crop UI 변환과 `assign_picture_image_native`로 확인했다. RHWP를 업데이트할 때는 이 하네스를 다시 실행해야 한다.

### 검증 결과

환경: Node 24.19.0, Playwright 1.62.1, Chromium 151.0.7922.34, WebKit 26.5. 각 시나리오는 별도 브라우저 context와 합성 그림을 사용했다. 새 하네스는 `/api/*` 및 외부 네트워크 요청을 차단하고 로컬 Blob/Data 이미지만 허용한다. 실제 유료 AI 생성을 호출하지 않았다.

| 검증 | 결과 |
| --- | --- |
| 좌표·크롭 경계·PNG 원본·연결·객체·프로젝트 단위 테스트 | 70 통과, 0 실패, 선택적 geometry 브라우저 테스트 1개 미실행 |
| 새 이미지 하네스: 합성 렌더링 및 실제 UI | 164 검사 통과 |
| 독립 외부 HWP/HWPX 4개 × 2 엔진 | 8 문서 검사 통과; 그림이 있는 파일은 2회 실제 등록·수정·반영 |
| 기존 브라우저 회귀: workspace, drafts, file-menu, inline, graph-zoom, ai, typing | 7개 스위트, 26 시나리오 통과 |
| 동일 하네스 + 수정 전 bridge | 확대 오류 재현, 의도한 내부 이미지 크기 검증 실패 |
| 로컬 4189 HTTP 응답 및 제공 JS/작업 소스 비교 | HTML/JS 200, 수정 파일 내용 일치 |
| `git diff --check` | 통과 |

합성 렌더링 매트릭스는 본문, 큰 그림 틀, 네이티브 크롭, 표 셀, HWP 불러오기, HWPX 불러오기, 크롭한 HWPX 그림, 30도 회전/좌우 반전, 90도 회전/상하 반전을 포함한다. 각 경우에 1200×800, 300×200, 900×300, 600×900 PNG로 네 번 연속 교체한 뒤 실행 취소·다시 실행과 HWP/HWPX 저장·재열기를 확인했다.

DOM의 외부 그림 틀뿐 아니라 **내부 이미지의 CSS 크기·이동, 실제 PNG 해상도, 스크린샷 색상 픽셀**을 검사한다. 표의 의도된 셀 클리핑은 유지하고, 회전한 그림은 크기·변환 계약으로 검사한다. 실제 앱의 root/preview 화면에서는 외부 크롭 그림 등록 전후의 49개 픽셀 샘플, 과거 오류 재현 후 크롭 복구, 원본 재반영, 크롭 조정, 라벨 반영 및 새 저장소에서 `.5e` 재열기를 검증한다.

독립 문서는 기존 다운로드의 `form-02.hwp`, `hwp_table_test_saved.hwp`, `re-05-mixed-koen-hancom.hwp`, `test-image.hwpx`를 사용했다. 앞 세 파일은 그림이 없어서 열기를 확인했고, `test-image.hwpx`에서는 그림을 실제 등록하고 다시 반영했다. 사용자 스크린샷에 해당하는 원본 HWP 자체를 제공받아 검사했다고 보고하지 않는다.

실제 macOS Safari를 직접 조작한 수동 검증이나 한컴 데스크톱 프로그램에서의 교차 검증은 수행하지 않았다. WebKit 자동 검증과 RHWP 자체의 저장·재열기 결과다.

### 재실행

프로젝트의 설치된 Node/Playwright 환경에서 실행한다. `PLAYWRIGHT_MODULE`은 필요할 때 설치 경로를 지정할 수 있다.

```sh
node --test tests/test-rhwp-exam-image-scale.mjs
node tests/run-browser-tests.cjs --only test-rhwp-exam-image-scale-browser.cjs
```

하네스의 `EXAM_ENGINE=webkit` 또는 `chromium`으로 엔진을 선택할 수 있다. `EXAM_EXTERNAL_FIXTURES=/외부/문서/폴더`를 지정하면 독립 문서를 추가 검증한다. `EVIDENCE_DIR`로 결과 저장 폴더를 바꿀 수 있다. 지정하지 않으면 `_work/rhwp/verification/image-scale`에 기록한다.

수정 전/후 비교는 `BASELINE_RHWP_BRIDGE=/수정전/rhwp-exam-bridge.js`로 한다. 이 파일은 테스트 HTTP route에서만 대체하며 작업 파일을 덮어쓰지 않는다. `SCALE_ADAPTER_ONLY=1`, `SCALE_WORKFLOW_ONLY=1`, `SCALE_CORPUS_ONLY=1`로 범위를 좁힐 수 있다.

`tests/suite-manifest.json`에 새 단위/브라우저 테스트를 등록했다. 기존 수동 타이핑 profiler도 명시적 HWP 입력이 필요한 수동 하네스로 분류해 정식 테스트 실행기의 목록 검사가 통과하도록 했다.

### 보관한 증거와 기존 변경 보존

로컬 증거 폴더: `_work/rhwp/verification/image-scale-final/`

- `results.json`: 엔진 버전과 172개 검사 기록. 이 중 6개는 그림 없는 외부 파일의 열기 검사다.
- `verification-summary.json`: 검증 집계 및 이전 성능 파일 보존 확인.
- `*-fixed.png`, `*-external-test-image.hwpx.png`: 실제 수정·복원 후 화면.
- `*.5e`: 테스트에서 저장·복원한 프로젝트.
- `*-final.log`, `unit.log`: 최종 검증 로그.
- `red-baseline/`: 동일 하네스에서 수정 전 확대 오류를 잡은 기록.

기존 `docs/RHWP_TYPING_PERFORMANCE.md`, `tests/profile-rhwp-exam-typing.cjs`, `tests/test-rhwp-exam-typing-browser.cjs`는 작업 시작 시점과 SHA-256이 동일하다. bridge/workspace의 기존 성능 변경 추가 줄도 유지했다. 원래 `codex/rhwp-exam-workspace` 폴더, 주 작업 폴더의 제품 코드, 배포 상태는 변경하지 않았다. 커밋·병합·푸시는 하지 않았다.

---

## 그림 크기 조절·상단 도구·확대 전환 검증

2026-10-09 · `perf/rhwp-typing-latency` · 기준 커밋 `1e429aa5`

### 동작 기준

- 한글 문서의 기존 8개 조절점은 그림 전체를 비율 고정으로 확대·축소한다. 원본 PNG, 크롭 범위, 객체 좌표, 그림 버전과 탭 연결은 바뀌지 않는다.
- RHWP의 선택틀 한 개를 사용한다. 호스트의 별도 크롭 테두리와 8개 조절점은 문서에서 제거했다. 수정·설정 버튼은 그림 위쪽 바깥에 배치한다.
- 내보낼 영역·빈 공간 조정은 전체 5E 원본 편집기에서 수행한다. 숫자 또는 크롭 핸들로 조정하며 수정 반영은 현재 범위를 그대로 적용한다.
- 새 그림은 독립 문단에 가운데 정렬·글자처럼 취급·상하 5pt로 넣는다. 등록한 독립 문단의 글자처럼 취급 그림도 가운데 정렬한다. 기존 문제 문장과 공유하는 문단과 사용자가 나중에 선택한 정렬은 유지한다.
- 설정은 글자처럼 취급, 정렬, 상하 간격, 어울림 사용/사용 안 함과 고급 배치를 지원한다. 가운데의 좌우 간격은 0이며 별도의 필드를 표시하지 않는다.
- 원본 편집 중에는 그림 위에 배지만 표시하며 반영·전환은 기존 상단 보내기·시험지 버튼으로 한다. 문서 위의 라벨 편집은 수정 반영·돌아가기 버튼을 사용한다. 기본 파일 메뉴와 Cmd/Ctrl+S는 원본·미반영 수정도 저장한다.

### 원인과 수정

직전 구현은 문서의 크기 조절을 크롭 범위 변경으로 연결했다. 그래서 조절점을 움직이면 그림 내용이 커지는 대신 캔버스 범위가 늘었다. 이 경로를 제거하고 RHWP의 기존 단일 그림 드래그를 연결했다. 가로·세로를 같은 배율로 계산하며 문서 크기만 변경한다. 드래그 중에는 네이티브 미리보기 테두리만 갱신하고 놓을 때 네이티브 snapshot 실행 취소 한 건으로 저장한다. Esc는 반영 없이 취소한다. 떠 있는 그림의 오른쪽/아래 기준 오프셋 방향도 반영한다. 도형·선·다중 개체의 RHWP 동작에는 이 단일 그림 경로를 적용하지 않는다.

직전 확대는 줌과 스크롤을 순서대로 실행했다. 새 카메라는 280ms 동안 같은 animation frame과 cubic ease-out으로 둘을 함께 보간한다. RHWP의 줌 미리보기 상태로 기존 페이지 래스터를 유지하고 마지막 배율에서 다시 그린다. 라벨 배경 준비를 카메라와 병렬로 처리하며, 실패·문서 교체 시 미완료 편집 화면을 정리한다. 사용자 확대나 휠 조작은 전환을 중단하고 새 보기 설정을 보존한다. 모션 줄이기는 보간을 생략한다. 네이티브 문서 배치 갱신 완료도 도구 위치 갱신 이벤트에 포함한다.

일반 그림 로더는 검증한 크롭·배치 초안 메타데이터를 복원한다. 설정을 명시적으로 변경한 초안만 문서에 적용하므로 기존 본문의 양쪽 정렬을 라벨·원본 편집만으로 바꾸지 않는다.

### 하네스와 증거

- `tests/test-rhwp-exam-picture-resize.mjs`: 8개 조절점, 0/30/90/270도 회전, 최소 크기·비율 보존, 떠 있는 정렬 기준, 반영 전 문서 불변과 한 번의 반영.
- `tests/test-rhwp-exam-picture-controls-browser.cjs`: Chromium/WebKit × root/preview. 실제 네이티브 핸들 드래그, 하나의 선택틀, 그림 바깥 버튼, 동일 PNG·원본·크롭, 정렬·간격·어울림, 실행 취소/다시 실행/Esc, 라벨 반영 후 크기 유지, `.5e` 초안 복원과 HWP/HWPX 크기·배치 재열기, 독립·공유 본문과 표 문단 정렬.
- `tests/test-rhwp-exam-camera-browser.cjs`: 31페이지 HWP를 저장해 다시 열고 마지막 페이지에서 실제 더블클릭. 줌 단조성, 중간 래스터 재사용, 최종 화면 위치 차이, 프레임 간격, 모션 줄이기와 수동 확대 중단을 검사한다.
- 기존 workspace, file-menu, drafts, inline, graph-zoom, ai, image-scale, typing 회귀 검사. AI 공급자 호출은 하지 않는다. 화면 준비는 호스트의 busy 해제와 네이티브 다음 paint를 함께 기다리며, DOM 준비와 앱 준비 확인을 사용하며 외부 UI 글꼴 요청은 차단한다.

카메라 측정은 Chromium 18프레임·최대 16.8ms, WebKit 19프레임·최대 20ms이며 마지막 래스터와 미리보기 중심 차이는 각각 약 0.24px / 0.02px다. 31페이지 합성 HWP의 headless 측정이며 사용자 스크린샷의 원본 HWP 성능 수치로 해석하지 않는다.

증거는 `_work/rhwp/verification/picture-controls/`의 `report.json`, `final/`, `camera/report.json`, `document.png`, `settings.png`, `source.png`에 저장한다. 이미지 스케일 검증은 `_work/rhwp/verification/image-scale/results.json`의 164개 렌더링 비교를 포함한다. `_work`는 로컬 증거이며 게시하지 않는다.

최종 단위 검사: 479개 통과, 실패 0개, 선택적 검사 1개 건너뜀. 9개 회귀 브라우저 스위트와 추가 카메라 스위트가 통과했다. 첫 검사에서 나타난 외부 리소스 load 대기와 이전 paint를 대상으로 한 클릭을 하네스에서 보완하고 해당 스위트를 다시 검증했다. 최종 결과는 `final/aspect-report.json`이며 초기 실패 로그도 보관한다. 로컬 서버의 수정 JS/CSS 6개는 HTTP 200·no-store·작업 파일 일치를 확인했다. `git diff --check`도 통과했다.

실제 Safari 화면 확인 도구는 Mac 잠금 상태로 두 차례 접근을 거부했다. 사용자에게 잠금 해제를 요청했으며, 실제 Safari에서 화면을 표시했다고 보고하지 않는다.

### 범위

사용자 원본 HWP의 자동 검사와 한컴 데스크톱의 교차 열기는 포함하지 않는다. Playwright WebKit을 실제 Safari 수동 검증으로 표현하지 않는다. 중첩 표·머리말·꼬리말의 글자처럼 취급 문단 정렬은 RHWP 개체 속성으로 안내한다. 일반 본문과 단일 표 셀은 가운데 정렬을 지원한다.

로컬 주소: `http://127.0.0.1:4189/?mode=pro&mobile=0&exam=1&ui=aspect-resize`. 변경은 작업 폴더에 있으며 설치 앱 교체·배포·추가 커밋은 수행하지 않았다.


### 2026-10-10 편집 전환 후속 수정

원본 편집의 중복 반영·복귀 버튼을 제거하고 상단 보내기·시험지로 동작을 통일했다. 시험지 진입 시 편집 세션을 종료하며 resize·scroll 이벤트로 이전 영역이 다시 표시되지 않게 한다. 입력 중인 라벨·텍스트를 캡처 전에 확정하고 비동기 반영 중 전환을 막는다. 실패는 알림과 영역 패널에 표시하며 자동 저장 성공 안내가 오류를 지우지 않는다. AI 작업실도 상단 도구줄 아래에 표시해 기존 버튼을 사용할 수 있다. 라벨 중심에서 일부러 아래로 이동시키던 p2 핸들 오프셋은 제거했다.

`tests/test-rhwp-exam-edit-navigation-browser.cjs`는 Chromium/WebKit × root/preview에서 미반영 텍스트 복귀·재편집, 편집 영역 정리 후 resize/scroll, 확정 전 텍스트 보내기, PNG 내보내기 지연 중 버튼 잠금, 실제 내보내기 실패 알림·문서 보존·자동 저장·재시도를 검사한다. 인라인 테스트는 p2의 실제 라벨 중심 좌표와 핸들 위 더블클릭까지 검사한다. 두 파일은 단일 구현 값을 비교하는 데 그치지 않고 문서 그림과 원본 탭 사이의 반영 결과를 확인한다.

전체 단위 테스트 479개 통과, 선택 항목 1개 생략. 브라우저 11개 스위트(새 전환 테스트 및 camera, picture-controls, image-scale, typing, file-menu, inline, graph-zoom, drafts, workspace, ai)가 통과했다. 이미지 비율 164건을 포함한다. 31페이지 합성 HWP의 카메라 검사에서 Chromium 최대 프레임 간격 9.3ms, WebKit 21.0ms이며 전환 마지막 위치 차이는 각각 0.13px, 0.21px였다. 실사용 문서에서 발생한 기존 ‘수정 반영’ 실패의 정확한 조건은 동일하게 재현하지 못했으므로 이를 확정 원인으로 단정하지 않는다. 중복 버튼 경로는 제거했고 유지하는 보내기 경로의 성공·실패·재시도를 검증했다.

로컬 근거는 `_work/rhwp/verification/edit-navigation/`, `inline/`, `picture-controls/`, `ai/`, `image-scale/`와 `edit-navigation-unit.log`에 있다. 실행 의존성 js-yaml은 제품 변경 없이 Git 제외 폴더의 테스트 런타임에 설치했다. 이번 후속 검증은 웹 브라우저 범위이며 Electron 데스크톱 하네스는 재실행하지 않았다.

---

## 5E / RHWP typing latency: 2026-10-09

### 결론

실제 `2026 원안 양식.hwp`에서 입력 중 반복되는 5E 그림 목록 조회와
연결 검사를 확인하고, 조합/연속 입력이 끝난 뒤 실행하도록 수정했다.
문서 변경이 없는 키 이동은 그림 목록 캐시를 재사용한다.

**실제 macOS Safari 한글 입력기의 심한 지연을 해결했다고 판단할 근거는
아직 없다.** 아래 타이밍은 Playwright WebKit의 합성 DOM 입력이다.
실제 문서에서는 RHWP의 렌더링과 커서 계산이 더 큰 비용이었다.
RHWP 바이너리/렌더링 알고리즘은 이번 패치에서 변경하지 않았다.

### 작업 기준과 문서

- 기준 커밋: `757287ca107a6142d8f5d24dd658ba7b2a175bee`.
- 브랜치: `perf/rhwp-typing-latency`.
- 별도 작업 폴더에서 측정했다.
- 원래 `codex/rhwp-exam-workspace` 작업 폴더는 수정하지 않았다.
- 문서: `2026 원안 양식.hwp`, 102400 bytes, 1 page, 그림 없음.
- SHA-256:
  `3014f66c2e1ef1ec9db577a939e7f1d523559aae56d0504f0b9f93ccbf2eb8f5`.
- Studio/SDK: 기존 고정 0.8.7, canvas2d. WASM 및 vendor 파일 변경 없음.

문서의 RHWP `getFieldList()` 결과는 빈 배열이었다. 헤더의 **고사 구분**
칸을 입력 칸으로 비교했으며, 이 칸은 RHWP form field가 아닌 표 셀이다.
존재하지 않는 native form field를 검증했다고 보고하지 않는다.

### 확인한 원인과 비용

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

### 수정 방식과 변경 파일

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

### 동일 조건 전후 측정

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

### 회귀 검증과 남은 한계

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

### 재현 명령

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
