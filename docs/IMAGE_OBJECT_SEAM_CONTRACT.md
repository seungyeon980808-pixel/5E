# 이미지→객체 이음새(seam) 계약 — 2026-07-04

> Day 4 (A). `image-dev`가 무엇을 만들어 어디에 꽂는지 명문화. work-dev는 이 문서만 보고
> `image-dev` 산출물을 받아들일 수 있어야 하고, `image-dev`는 이 문서만 보고 자기 코드가
> 계약을 지키는지 확인할 수 있어야 한다. **코드 무수정 문서 — 병렬 세션 충돌 0.**

## 1. 이음새(seam)가 왜 있나

"이미지를 어떻게 객체로 바꾸나(생산자)"와 "변환된 객체를 아트보드에 어떻게 넣나(소비자)"는
독립적인 문제다. 이 둘을 분리해두면 생산자(로컬 벡터화, 장차 다른 알고리즘, 한때 검토했던
외부 API 등)가 몇 개든 늘어나도 소비자는 하나만 유지하면 된다. §4(HANDOFF_20260704.md)에서
외부 API를 뺀 것도 이 이음새가 이미 있었기 때문에 가능했다.

**계약: 생산자는 `image-to-object-v1` 스키마의 JSON(또는 그 JSON에 대응하는 in-memory 객체)을
만들고, 소비자(`js/image-import-mock.js`)는 그것을 검증→좌표변환→미리보기→삽입한다.**

## 2. 스키마 (생산자가 지켜야 하는 출력 형태)

정의: `docs/qa-fixtures/image_to_object_mock_v1.json` (예시), 파서: `js/image-import-mock.js`
의 `parseMockImport(rawText, artboard)`.

```jsonc
{
  "version": "image-to-object-v1",      // 고정 문자열, 반드시 일치
  "source": { "width": 1200, "height": 800 }, // 원본 이미지 픽셀 크기 (좌표 매핑 기준)
  "objects": [ /* 아래 타입별 스키마 */ ],
  "warnings": ["선택: 생산자가 미리 남기고 싶은 경고 문자열"]
}
```

지원 타입(대소문자 무관, 별칭 자동 인식 — `image-import-mock.js`의 `TYPE_ALIASES` 참고):

| type | 필수 필드 | 비고 |
|---|---|---|
| `line` | `p1{x,y}`, `p2{x,y}` | `arrowHead`: none/end/start/both |
| `arrow` | `p1`, `p2` | `line`과 동일 변환, 기본 화살표 `end` |
| `rect`/`rectangle` | `x,y,w,h` 또는 `sourceBox{x,y,w,h}` | |
| `ellipse`/`oval` | `x,y,w,h` 또는 `sourceBox` | |
| `circle` | `cx,cy,r` (없으면 box로 대체) | 내부적으로 ellipse(w=h)로 변환 |
| `triangle` | `x,y,w,h` 또는 `sourceBox` | |
| `polyline`/`polygon` | `points:[{x,y}, …]` (2개 이상) | `closed: true/false` |
| `text` | `x,y`, `text` | `fontSize` 생략 시 기본값 |
| `labeler`/`callout` | `p1,p2`, `text` | `labelSize` 생략 시 기본값 |
| `anglearc`/`angle`/`arc` | `x,y`(꼭짓점), `radius`, `startAngle`, `sweepAngle` | `label` 생략 시 "θ" |

- 좌표계: **이미지 픽셀 공간**(원점 좌상단, y 아래로 증가). 소비자가 아트보드 world mm로
  자동 변환(비율 유지, 아트보드의 90%에 맞춰 중앙 배치) — 생산자는 신경 쓸 필요 없음.
- `strokeWidth`는 **world mm 단위로 이미 완성된 값**(픽셀 아님) — 생략 시 0.2mm 기본.
- `confidence`, `sourceBox`, `_note` 등 스펙 밖 필드는 파서가 무시 — 자유롭게 추가 가능.
- 지원하지 않는 `type`이나 필수 필드 누락 객체는 **건너뛰고 `warnings`에 기록**(전체 실패 아님).

## 3. 소비자(삽입 지점)

`js/image-import-mock.js`의 `parseMockImport()` + `initImageImportMock(state)`:
검증 → world 좌표 변환 → 캔버스 미리보기 → "객체로 삽입" 클릭 시 `state.update()` 1회로
전체 삽입(Undo 1스텝). 파일명이 "mock"이라 버릴 코드처럼 보이지만 **실제 삽입 백엔드**다.

현재는 `<input type="file">` 로컬 JSON 파일 선택 경로만 있음. 생산자가 브라우저 메모리에서
바로 JSON을 만든다면(파일을 거치지 않고), `parseMockImport(JSON.stringify(data), artboard)`를
직접 호출해 같은 삽입 로직을 재사용할 수 있음 — **파일 I/O가 계약의 일부가 아니라 JSON 형태만
계약**이므로 이 확장은 소비자 쪽 최소 수정(함수 호출 지점 추가)으로 가능.

## 4. ⚠ 확인된 현재 상태 불일치 (image-dev 세션에 전달)

`image-dev` 브랜치의 실동작 파이프라인(`js/image-objectify.js`, 커밋 `ad629e3`)은 위 계약을
**타지 않고** 자체적으로 `state.update()`를 직접 호출해 폴리곤(polyline, 채움 기반 윤곽/구멍)과
텍스트를 삽입한다 — `parseMockImport`/`image-import-mock.js` 미사용.

이것이 반드시 문제는 아니다: `image-objectify.js`가 만드는 결과물(다수의 채움 폴리곤 + 그룹)은
`image-to-object-v1`의 `polyline` 타입 범위 안에 있으므로, **이론적으로는 v1 JSON을 거쳐도
표현 가능**하다. 다만 현재 구현은 그 경로를 우회해 `groupId`/`applyNewObjectStyleDefaults`
같은 삽입 세부사항을 자체 보유하고 있다.

**권고 (image-dev 판단, 강제 아님):**
- 지금 당장 리팩토링할 필요는 없음 — `image-objectify.js`는 work-dev 소유 파일을 건드리지
  않으므로 병합 시 충돌은 없다.
- 다만 **차기 정리 시점(work-dev 병합 전)** 에 `image-objectify.js`의 분석 결과(`analysis.components`)를
  v1 JSON(`objects: [{type:"polyline", points, closed, sourceBox}, …]`)으로 직렬화하고
  `parseMockImport`를 거치도록 바꾸면: (a) 삽입 로직 중복 제거, (b) 그룹핑·Undo·스타일 기본값이
  한 곳(소비자)에서만 관리되어 향후 두 번째 생산자가 붙어도 재작업 0.
- 텍스트 대체(`textMode: "replace"`) 같은 `image-objectify.js` 고유 UX는 v1 스키마 밖의
  일이므로 계약과 무관 — 생산자가 v1 JSON을 만들기 *전에* 알아서 처리하면 됨.

## 5. 변경 시 지켜야 할 것

- `version` 문자열, 필수 필드명은 **되돌리기 비싼 결정** — 바꾸려면 이 문서 + `image-import-mock.js`
  + `docs/qa-fixtures/image_to_object_mock_v1.json`을 함께 갱신.
- 신규 지원 타입 추가는 `TYPE_ALIASES` + `CONVERTERS`(둘 다 `image-import-mock.js`)에 대응 항목
  추가로 충분 — 이 문서의 표에도 행 추가.
- work-dev 병렬 규칙(§7, HANDOFF_20260704.md) 유지: image-dev는 `js/tools.js`·`js/inspector*`·
  `js/render*` 수정 금지, `?v=` 범프는 work-dev에서만.
