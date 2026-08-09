# Verified physical coastline assets

`js/ai-map-assets.js`는 지도형 기출 도식을 원격 이미지 생성 없이 즉시 만들기 위한 코드 네이티브
런타임이다. 런타임 데이터는 `js/ai-map-assets-data.js`에 고정되어 있으며 다음 네 변형만 명시적으로
선택할 수 있다.

- `world`
- `pacific`
- `east_asia`
- `korean_peninsula`

## 정확성과 안전 경계

- 원천은 Natural Earth `ne_50m_land` 육지 면과 `ne_50m_coastline` 물리 해안선이다.
- 두 원천 URL은 Natural Earth 저장소의 특정 커밋에 고정되어 있고 각각의 SHA-256을 함께 보존한다.
- 정치 경계, 분쟁 경계, 국가명, 지명, 숫자, 기호, 지시선과 화살표는 포함하지 않는다.
- 네 변형 중 하나를 호출자가 명시해야 한다. 이름 추측이나 유사 문자열 자동 선택은 하지 않는다.
- 모든 좌표에는 단일 축척을 적용하므로 가로·세로 비율을 서로 다르게 늘리지 않는다.
- 기본 장면은 가장 긴 해안선부터 최대 120개만 사용하고 육지 면을 끈다. 따라서 UI의 단일
  `expand → compileFastScene` 경로와 128요소 제한 안에 8요소의 추가 편집 여유를 남긴다.
- 육지 면을 켜면 큰 ring 그룹과 긴 해안선을 합쳐 최대 120개만 사용한다. 외곽 ring은 회색 또는
  흰색 면으로만 사용하고 그 선은 면색과 같게 숨긴다.
  검은 선은 생성 데이터의 별도 열린 `coastlines`만 사용하므로 원천 폴리곤의 내부 접합선이 드러나지 않는다.
- `fillLand:false`는 육지 면을 만들지 않고 해안선만 출력한다. 이전 생성 데이터에 `coastlines`가
  없을 때는 면도 만들지 않고 닫힌 ring 외곽선만 안전한 호환 경로로 사용한다.
- 생성 데이터가 비었거나, 좌표·개수·출처 정책이 일치하지 않으면 장면을 만들지 않고 오류를 낸다.

Natural Earth는 자사 벡터 데이터를 public domain으로 제공한다. 런타임에 네트워크 요청은 하지 않으며,
빌드 시 검증된 데이터만 저장소에 포함한다.

- 고정 원천: <https://github.com/nvkelso/natural-earth-vector>
- 이용 조건: <https://www.naturalearthdata.com/about/terms-of-use/>

## 인터페이스

```js
import {
  createVerifiedMapScene,
  compileVerifiedMap,
  getVerifiedMapMetadata,
  listVerifiedMapMetadata,
} from "./js/ai-map-assets.js";

const scene = createVerifiedMapScene("east_asia", {
  artboard: { w: 160, h: 90 },
  padding: 4,
  strokeWidth: 0.3,
  fillLand: true,
  landTone: "gray",
});

const compiled = compileVerifiedMap("korean_peninsula", {}, {
  idPrefix: "exam_map",
  layerId: 1,
});

const full = compileVerifiedMap("world", {
  fillLand: true,
  fullDetail: true,
});
```

`createVerifiedMapScene()`은 `5e-fast-scene@1` 그림형 JSON을 반환한다. `compileVerifiedMap()`은 현재
5E 캔버스에 바로 삽입할 수 있는 편집 가능한 `curve` 객체와 각 객체의 원천 ring 정보를 반환한다.
두 함수 모두 그림형만 허용한다.

`createVerifiedMapScene()`은 항상 120요소 이하이므로 일반 fast-scene 컴파일 경로에서 안전하다.
반면 `fullDetail:true` 상세 지도는 육지 면과 열린 해안선을 합쳐 128요소를 넘을 수 있다. 이 옵션은
`compileVerifiedMap()`만 허용하며, 128개 이하의 로컬 배치로 검증·컴파일한 뒤 정규화된 네이티브
객체만 병합한다.

허용되는 생성 옵션은 다음뿐이다.

- `mode`: 생략하거나 반드시 `diagram`
- `artboard`: 20–500 mm 범위의 `{w,h}`
- `padding`: 도식과 아트보드 가장자리 사이 여백
- `strokeWidth`: 0.15–0.8 mm
- `fillLand`: 기본 `false`; `true`이면 큰 육지 면과 긴 해안선을 120요소 예산 안에서 생성
- `landTone`: 육지 면의 `gray` 또는 `white`
- `fullDetail`: 기본 `false`; `true`는 `compileVerifiedMap()`에서만 허용하며 전체 ring/해안선을 배치 컴파일

라벨, 화살표, 정치 경계 등은 옵션으로도 요청할 수 없다. 필요한 라벨은 결과를 캔버스에 삽입한 뒤
5E의 별도 문자 객체로 후편집한다.

## 검증

```powershell
node --test tests/test-ai-map-assets.mjs
node --test tests/test-map-asset-builder.mjs
```

테스트는 네 변형 전부에 대해 다음을 확인한다.

- 고정 출처·커밋·SHA-256·public-domain 메타데이터
- 그림형 무문자·무화살표 불변식
- MCP `normalizeObject()` 통과
- 원본 비율 보존과 아트보드 내부 배치
- 명시적 변형 선택 및 위험 옵션 실패 폐쇄

생성 데이터를 원천에서 다시 만들 때는 두 고정 GeoJSON 파일을 내려받은 뒤 다음을 실행한다.
스크립트는 커밋에 대응하는 SHA-256이 다르면 출력을 거부한다.

```powershell
node scripts/engine-v2/build-map-assets.mjs `
  --source C:\path\to\ne_50m_land.geojson `
  --coastline C:\path\to\ne_50m_coastline.geojson
```
