# 평가원 그래프 복원 실행 기록

작업 브랜치: `fix/analyable-function`. 기준 HEAD: `068afcb1`.
기존 수정 파일 13개와 미추적 파일 3개는 커밋 대상에서 제외했다.
읽기 전용 자문은 사용자의 실행 지시로 해제됐으며 배포·푸시는 하지 않았다.

첫 검증된 수정: `ea2995f0` (`fix(graph): restore editable formulas without losing source relationships`).
두 번째 검증된 수정: `c7365e64` (`fix(graph): keep valid geometry through incomplete relation fitting`).
세 번째 검증된 수정: `e6f18d2b` (`fix(graph): preserve single axes and unboxed source legends`).
최신 파이프라인은 `graph-pipeline-v4`이며 원본 응답을 다시 요청하지 않고
추가 실제 응답에서 드러난 일반적인 경계·관계 보존 문제를 보완했다.

## 원인과 수정

1. 보조선의 끝점과 곡선 내부 접점을 혼동했다. 계수 계산은 연결된 곡선 점,
   관계 검사는 유한 선분을 사용하고 원래 보조선 길이는 유지한다.
2. 표시 점과 AI의 `candidateFamily:none`이 수식화 시도 또는 미완료 표시를
   막았다. 표시 점/화살표를 네이티브 연결로 보존하며 none도 프로그램이 검증한다.
3. 합쳐진 궤적은 표시된 접선 불연속과 독립 초기 방향에서 분리한다.
   축 눈금과 기준점에서 저차원 근호식을 계산하며 필요한 관찰 계수의 출처를 명시한다.
4. 프레임 밖의 정상 원 마커가 전체 캘리브레이션을 막았다. 원본 이미지 안의
   관찰만 허용해 다른 정상 계열을 함께 처리한다.
5. 새 직선의 축 접촉 잉크가 한 픽셀 미만의 경계 오차로 거부됐다.
   표시 원점과 축 접점을 독립 제약으로 사용하며 원본 픽셀 기준으로 측정한다.
6. 상대 P-V 곡선의 none 후보, 축 절단 및 새 식의 교차 검사가 전체 출력을
   막을 수 있었다. 관계를 바꾸는 식만 관찰 기하로 복원하고 나머지를 보존한다.
   축 절단은 확인되지 않은 전역 물리 좌표로 승격하지 않는다.
7. 품질 오류는 구조 유효성·출처 바인딩과 분리한다. 검수 상태를 유지하면서
   네이티브 편집·캐시·복구·저장 결과를 제공한다.
8. 원본의 단일 축 `x`를 엔진의 `single`로 매핑하지 않아 y축이 추가됐다.
   실제 SVG 선 개수까지 검사하도록 회귀를 확장해 두 도형에서 제거했다.
   구현되지 않은 세로 단일 축 `y`는 계약에서 거부한다.
9. 기존 박스 범례 기본값이 관찰된 무테두리 견본에 테두리·배경·높이 오프셋을
   추가했다. 무테두리의 빈 표기 한 행은 관찰된 선 위치로 렌더하고 선택
   영역은 투명하게 유지한다. 명시적 `frame:true`와 일반 수동 그래프의
   기존 박스 스타일은 유지한다.

문항 ID 또는 정답은 제품 코드에 넣지 않았다. 실제 응답은 회귀 fixture와
평가 자료이며, 제품의 계수는 눈금·끝점·초기 방향·관찰에서 계산한다.

## 실제 실행과 평가

저장 응답 5개는 추가 AI 호출 없이 먼저 재검증했다. 생성·관계·수식화·
편집·저장/재열기를 모두 통과했고 수식은 8개다. 정밀 스타일은 별도 판정했다.

그 뒤 고정 `gpt-6.1-sol / medium`으로 기존 5개와 새 15개를 원본별 한 번
실행했다. 총 20회이며 대체 모델과 자동 재시도는 없었다. 모든 최초 응답에서
네이티브 결과를 생성·편집·저장했다. 코드 보완 후 같은 응답을 무호출로
재처리했고 최종 20개도 실제 편집·다운로드·재열기를 통과했다.

| 최종 실제 20개 판정 | 결과 |
| --- | --- |
| 생성 / 편집 / 저장·재열기 | 각각 20/20 |
| 원본 관계 | 17 통과, 2 검수, 1 실패 |
| 정밀 스타일 | 12 검수, 8 실패 |
| 대상 수식화 | 11 통과, 9 미완료; 함수식 21개 |

거짓 교차가 있는 P-V 관찰은 실패로 기록했다. 추가 y축과 범례 박스는
일반 코드 수정으로 제거했으나 과대·잘린·겹치는 글자와 궤적 굽음 차이는
검수 또는 스타일 실패다. 자동 결과를 수동 보정해 성공률을 올리지 않았다.

파일은 `outputs/graph-restoration-20261008/index.html`과 `README.md`에서
선택한다. 최종 자동 `.5e`와 별도 UI 편집 시험본을 구분한다. HTML은 모든
이미지·스타일·스크립트를 포함하고 네트워크를 사용하지 않는다.

## 검증 근거

Node v24.21.0. 저장소 밖의 기존 Playwright/js-yaml 설치를 환경 변수로
사용했으며 패키지·lockfile은 변경하지 않았다.

관련 함수군 36, 해석 복원 25, 계약 36, 품질 17, 워크플로 44 시나리오가
통과했다. Chromium/WebKit 스타일·작업대 회귀와 25개 최종 파일의 no-op,
실제 변경, undo/redo, 다운로드·재열기 및 JSON 필드 보존이 통과했다.
단위 전체 명령의 Node 검사 347개 중 346개 통과이며
`tests/test-rights-clear-smoke-fixture.mjs:27`의 PNG 고정 샘플 압축 바이트
불일치 1개는 이번 변경 밖이고 수정하지 않았다.

WebKit 보고서는 1440px/390px, 밝은/어두운 네 조건에서 모든 이미지 로드,
수평 넘침 없음, 오류 없음, 네트워크 요청 0을 확인했다. Safari로 실제
보고서를 열었지만 macOS 캡처/접근성 권한 때문에 실앱 화면 캡처는 미검증이다.
LSP는 미설치여서 Node 구문·실행 검사와 whitespace 검사로 대체했다.

최종 스타일 회귀는 수정 전에 `actual:'x', expected:'single'`에서 실패했고,
수정 뒤 Chromium/WebKit 모두 단일 축 SVG 선 1개, 관찰 범례의 테두리 없음/
선 높이 일치, 명시적·수동 박스 유지 및 잘못된 frame 타입 거부를 통과했다.

재현 명령:

```sh
node tools/replay-graph-responses.mjs outputs/graph-live-20261008/manifest.json \
  .omo/evidence/graph-live-20261008 outputs/graph-restoration-20261008/replay
node tools/replay-graph-responses.mjs outputs/graph-restoration-20261008/manifest.json \
  outputs/graph-restoration-20261008/live \
  outputs/graph-restoration-20261008/final-automatic --allow-quality-review
PLAYWRIGHT_MODULE=/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright \
  PREVIEW_URL=http://127.0.0.1:8797/preview/ \
  node tools/verify-restored-graphs.cjs outputs/graph-restoration-20261008/manifest.json \
  outputs/graph-restoration-20261008/final-automatic \
  outputs/graph-restoration-20261008/live-delivery
node tools/build-graph-restoration-report.mjs \
  outputs/graph-restoration-20261008/manifest.json outputs/graph-restoration-20261008
```

실제 AI 실행은 opt-in과 원본별 미실행 확인을 요구한다. 완료된 목록을
재실행하지 말고 위 무호출 재검증 도구를 사용한다.
