# RHWP 이미지 재반영 확대 오류 수정 및 검증

2026-10-09 · `perf/rhwp-typing-latency` · 기준 커밋 `757287ca107a6142d8f5d24dd658ba7b2a175bee`

## 결과

그림을 수정한 뒤 시험지에 다시 넣을 때 **그림 틀 안의 이미지만 확대·잘리는 오류**를 수정했다. 별도 성능 작업 폴더에 반영했으며, 기존 타이핑 성능 변경은 유지했다. 수정 코드는 현재 `http://127.0.0.1:4189/?mode=pro&mobile=0&exam=1`에서 제공한다.

- 문서의 가로 폭, 배치 기준, 회전·반전, 표 셀 연결을 유지한다.
- 원본 편집에서 크롭을 바꾸면 선택한 영역 전체를 표시하고 가로 폭에 맞춰 높이를 계산한다.
- 크롭이 그대로인 라벨 편집은 기존 가로·세로 크기를 유지한다.
- 외부 문서의 그림을 등록할 때 기존 크롭 모양과 그림 틀을 유지하고, 전체 원본 래스터는 5E 배경 객체로 보관한다.
- HWP/HWPX 재열기 및 `.5e` 프로젝트 복원 후에도 같은 방식으로 편집한다.
- 이전 버그로 생긴 특정 크롭 초기화 상태는 저장된 5E 내보내기 영역으로 복구한다. 해당 그림의 **원본 편집 → 시험지에 반영 → 기존 영역 확인**을 한 번 실행하면 문서의 배율도 정상화된다.

## 원인과 수정

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

## 검증 결과

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

## 재실행

프로젝트의 설치된 Node/Playwright 환경에서 실행한다. `PLAYWRIGHT_MODULE`은 필요할 때 설치 경로를 지정할 수 있다.

```sh
node --test tests/test-rhwp-exam-image-scale.mjs
node tests/run-browser-tests.cjs --only test-rhwp-exam-image-scale-browser.cjs
```

하네스의 `EXAM_ENGINE=webkit` 또는 `chromium`으로 엔진을 선택할 수 있다. `EXAM_EXTERNAL_FIXTURES=/외부/문서/폴더`를 지정하면 독립 문서를 추가 검증한다. `EVIDENCE_DIR`로 결과 저장 폴더를 바꿀 수 있다. 지정하지 않으면 `_work/rhwp/verification/image-scale`에 기록한다.

수정 전/후 비교는 `BASELINE_RHWP_BRIDGE=/수정전/rhwp-exam-bridge.js`로 한다. 이 파일은 테스트 HTTP route에서만 대체하며 작업 파일을 덮어쓰지 않는다. `SCALE_ADAPTER_ONLY=1`, `SCALE_WORKFLOW_ONLY=1`, `SCALE_CORPUS_ONLY=1`로 범위를 좁힐 수 있다.

`tests/suite-manifest.json`에 새 단위/브라우저 테스트를 등록했다. 기존 수동 타이핑 profiler도 명시적 HWP 입력이 필요한 수동 하네스로 분류해 정식 테스트 실행기의 목록 검사가 통과하도록 했다.

## 보관한 증거와 기존 변경 보존

로컬 증거 폴더: `_work/rhwp/verification/image-scale-final/`

- `results.json`: 엔진 버전과 172개 검사 기록. 이 중 6개는 그림 없는 외부 파일의 열기 검사다.
- `verification-summary.json`: 검증 집계 및 이전 성능 파일 보존 확인.
- `*-fixed.png`, `*-external-test-image.hwpx.png`: 실제 수정·복원 후 화면.
- `*.5e`: 테스트에서 저장·복원한 프로젝트.
- `*-final.log`, `unit.log`: 최종 검증 로그.
- `red-baseline/`: 동일 하네스에서 수정 전 확대 오류를 잡은 기록.

기존 `docs/RHWP_TYPING_PERFORMANCE.md`, `tests/profile-rhwp-exam-typing.cjs`, `tests/test-rhwp-exam-typing-browser.cjs`는 작업 시작 시점과 SHA-256이 동일하다. bridge/workspace의 기존 성능 변경 추가 줄도 유지했다. 원래 `codex/rhwp-exam-workspace` 폴더, 주 작업 폴더의 제품 코드, 배포 상태는 변경하지 않았다. 커밋·병합·푸시는 하지 않았다.
