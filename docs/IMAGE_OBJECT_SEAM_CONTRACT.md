# 이미지→객체 현재 이음새 계약

이 문서는 현재 저장소에서 호출 가능한 이미지 객체화 경로만 설명한다. 과거의
`image-to-object-v1` JSON과 `js/image-import-mock.js` 제안은
[`docs/archive/HANDOFF_20260704.md`](archive/HANDOFF_20260704.md) 및
[`docs/archive/IMAGE_TO_OBJECT_API_DESIGN_20260630.md`](archive/IMAGE_TO_OBJECT_API_DESIGN_20260630.md)에
보존되어 있다. 그 파일과 `parseMockImport()`는 현재 작업 트리의 API가 아니며 새 호출자가
의존해서는 안 된다.

## 1. 호출 가능한 분석 경계

순수 입력 경계는 `js/image-analysis.js`다.

```js
import { inspectImageData, analyzeImageData } from "./js/image-analysis.js";

const inspected = inspectImageData({ width, height, data });
const { result, inkRatio } = analyzeImageData({ width, height, data, options });
```

- `width`, `height`는 양의 정수이고 `data`는 정확히 `width * height * 4` 바이트의 RGBA
  `Uint8ClampedArray`/`Uint8Array`/`ArrayBuffer`여야 한다.
- 처리 최대 변은 `MAX_PROCESS_DIMENSION`(현재 2000px)이고, 불투명 화소 중 어두운 화소 비율이
  `MAX_DENSE_INK_RATIO`(현재 0.55)를 넘으면 분석은 오류로 끝난다.
- `inspectImageData()`는 입력과 잉크 비율만 검사한다. `analyzeImageData()`가 같은 검사를 거쳐
  `vectorizeImage()` 결과와 `inkRatio`를 반환한다.

브라우저 UI는 `js/image-analysis-controller.js`의
`createImageAnalysisController()`를 사용한다. 컨트롤러는 한 번에 한 분석만 소유한다. 새 분석은
기존 분석을 `SUPERSEDED`로 끝내며, 취소/닫힘은 워커를 종료한다. 워커를 만들 수 없으면 비동기
fallback으로 분석하지만, fallback이 워커와 같은 응답성을 보장한다는 뜻은 아니다.

## 2. 객체 삽입 경계

`js/image-objectify.js`의 `initImageObjectify(state)`가 UI를 설치하고,
`openObjectifyWithFile(file)`가 설치 후 파일 진입점을 제공한다. 삽입은 이 모듈이
`state.update()` 안에서 수행하므로 한 번의 객체화 삽입은 한 Undo 스냅샷이 된다.

분석 결과는 별도 공개 JSON 스키마가 아니라 현재 객체 스키마로 직접 매핑된다.

| 분석 결과 | 삽입 객체 |
|---|---|
| ellipse/ring | `ellipse` |
| rectangle/ring | `rect` |
| 가는 선 | `line` / `polyline` / `curve` |
| 닫힌 잉크 윤곽과 구멍 | 채움 `polyline` 또는 `curve` |
| 텍스트 후보 | 유지, 제거 또는 `text` 대체(사용자 옵션) |

분석 좌표는 원본 픽셀이고 삽입 전에 world mm로 환산한다. 생성되는 `strokeWidth`도 픽셀 두께에
삽입 scale을 곱해 world mm로 저장한다. 상세 필드와 저장 호환 규칙은
[`OBJECT_SCHEMA.md`](OBJECT_SCHEMA.md)를 정본으로 삼는다.

## 3. 변경 규칙

- `analyzeImageData({ width, height, data, options })`와
  `createImageAnalysisController()`는 이 문서가 보장하는 현재 코드 경계다. 반환 내부 구조를
  다른 모듈의 공개 파일 형식으로 취급하지 않는다.
- 새 객체 유형이나 저장 필드를 추가하면 `js/project-io.js`의 로드 호환과
  `docs/OBJECT_SCHEMA.md`를 함께 검토한다.
- 역사 자료는 재현과 출처용으로 남긴다. 역사 제안의 경로나 스키마를 현재 API로 되살려
  표현하지 않는다.
