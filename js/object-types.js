/* ===== OBJECT TYPES — single source of per-type classification ===== */
//
// WHY THIS FILE EXISTS (DESIGN follow-up): behavior for each object type used to
// be encoded as hand-written `o.type === "rect" || o.type === ...` chains copied
// across pick.js, render/scene.js, transform.js, snap.js and project-io.js.
// Adding ONE new type meant editing ~6 identical lists by hand; forgetting one
// produced a SILENT bug (object won't move / has no bbox / won't save). This
// table is the ONE place a type declares which behavior-classes it belongs to.
// The category Sets below are DERIVED from it, so a new type is added by adding
// a single row here.
//
// This introduces NO behavior change: every derived Set reproduces the exact
// membership of the literal list it replaced. The original literals are kept as
// `// was:` comments at each migrated call site for cross-checking.

// Canonical id list — mirrors the switch in render/scene.js renderObject().
export const OBJECT_TYPE_IDS = [
  "rect", "ellipse", "triangle",
  "line", "polyline", "curve", "funcgraph",
  "text", "formula",
  "image", "svgAsset",
  "axes", "coordplane",
  "anglearc", "rightangle", "labeler",
  "circuit", "optics", "apparatus", "pendulum", "spring",
  "chargefield", "fieldlines", "standingwave",
  "gauge",
  "solid3d",
  "parabola",
  "groundarc",
  // 생명과학 부품(2026-07-31) — 기출 69장 조사 결과. 규격은 docs/BIO_PARTS_SPEC.md
  "brace", "chromosome", "bilayer", "neuron",
  "legend", "pedigree",
  // 화학 부품(2026-07-31) — 기출 280장 전수 분해 결과. 규격은 docs/CHEM_PARTS_SPEC.md
  "vessel", "chemmodel", "particlebox", "orbital", "bondgroup",
  "chemchart", "axisbreak", "chemgraph", "electrode", "periodic",
];

// Per-type classification flags. Each flag names a behavior-class that some
// module dispatches on. Only flags that were duplicated across modules (or are
// core storage-model facts) live here; purely local single-type branches stay
// in their own module.
//
//  sizeBox        : stored as {x,y,w,h}; participates in box move/resize/bbox
//  boxFace        : its axis-aligned bbox IS its exact clickable face (no shaped interior)
//  shape          : a basic drawable primitive (rect / ellipse / triangle)
//  flip           : supports horizontal/vertical flip in rotate mode
//  lineTol        : hit-tested as a thin stroke (wide click band), not a face
//  points         : stored as a points[] array
//  textMeasured   : hit/bbox measured from the live rendered <text> element
//  label          : can carry a name/quantity label (LABEL_CAPABLE)
//  snapEdge       : contributes finite contact edges as a snap target
//  snapLineTarget : contributes line/segment snap targets
//  snapLineLike   : treated as a line-like body for endpoint snapping
//  endpointHandles: 선택하면 p1/p2 자리에 끌 수 있는 끝점 핸들이 생긴다
//                   (scene.js 핸들 그리기 + transform.js 핸들 드래그 3곳이 공유)
//  angleSnap      : **그릴 때** Ctrl/Cmd를 누르면 방향이 15° 단위로 이산화된다.
//                   직선 도구와 같은 조작이라 "두 점으로 방향을 정하는" 타입은 전부 켠다.
//                   ※ 이미 만든 뒤 끝점을 끌 때의 이산화는 이 플래그가 아니라
//                     endpointHandles 쪽(transform.js)이 담당한다 — 둘은 별개 경로다.
export const OBJECT_TYPES = {
  rect:       { sizeBox: 1, boxFace: 1, shape: 1, flip: 1, label: 1, snapEdge: 1 },
  ellipse:    { sizeBox: 1, shape: 1, flip: 1, label: 1 },
  triangle:   { sizeBox: 1, shape: 1, flip: 1, snapEdge: 1 },
  line:       { lineTol: 1, label: 1, snapEdge: 1, snapLineTarget: 1, snapLineLike: 1, endpointHandles: 1, angleSnap: 1 },
  polyline:   { points: 1, lineTol: 1, snapEdge: 1, snapLineTarget: 1, snapLineLike: 1 },
  curve:      { points: 1, lineTol: 1, snapLineLike: 1 },
  funcgraph:  { points: 1, lineTol: 1 },
  text:       { textMeasured: 1 },
  formula:    { textMeasured: 1 },
  image:      { sizeBox: 1, boxFace: 1 },
  svgAsset:   { sizeBox: 1, boxFace: 1, flip: 1 },
  axes:       { sizeBox: 1, boxFace: 1, label: 1 },
  coordplane: { sizeBox: 1, boxFace: 1, label: 1 },
  anglearc:   { label: 1 },
  rightangle: {},
  labeler:    { label: 1, lineTol: 1, endpointHandles: 1 },
  circuit:    { lineTol: 1, label: 1, snapLineLike: 1, endpointHandles: 1 },
  optics:     { sizeBox: 1, boxFace: 1, flip: 1, label: 1 },
  apparatus:  { sizeBox: 1, boxFace: 1, flip: 1 },
  pendulum:   { lineTol: 1, endpointHandles: 1, angleSnap: 1 },
  // spring = 용수철. p1/p2 계열(line·circuit·pendulum과 같은 가족).
  // snapLineLike: 끝점이 블록 모서리에 자석처럼 붙어야 해서 켠다(요구).
  // endpointHandles: 만든 뒤 끝점을 끌어 길이·방향을 고칠 수 있어야 한다(2026-07-26 지시).
  spring:     { lineTol: 1, label: 1, snapLineLike: 1, endpointHandles: 1, angleSnap: 1 },
  // 장(場) 그림·정상파도 p1/p2 계열이다. 전기력선·자기력선은 두 점이 '전하(극) 위치'라
  // 끌면 그림 전체가 다시 계산되고, 정상파는 두 점이 '줄·관의 양 끝'이다.
  chargefield:  { lineTol: 1, label: 1, endpointHandles: 1, angleSnap: 1 },
  fieldlines:   { lineTol: 1, label: 1, endpointHandles: 1, angleSnap: 1 },
  standingwave: { lineTol: 1, label: 1, snapLineLike: 1, endpointHandles: 1, angleSnap: 1 },
  // gauge = 자·각도기 측정 가이드(kind: ruler|protractor). 크기박스로 이동/리사이즈/
  // bbox/저장을 그대로 상속. boxFace로 bbox 전체가 클릭 면이 되어 선택이 쉽다.
  gauge:      { sizeBox: 1, boxFace: 1 },
  // solid3d = 경사 투영 입체(kind: box|cylinder|wedge). 그려지는 도형 전체가 bbox 안에
  // 들어가도록 렌더러가 앞면을 깎기 때문에(render/solid3d.js), 크기박스 계열의 이동·
  // 리사이즈·bbox·저장을 손댈 것 없이 그대로 물려받는다. boxFace로 bbox 전체가 클릭 면.
  // snapEdge: 블록을 상판 모서리에 붙일 때 자석이 필요해서 켠다(rect와 같은 취급).
  solid3d:    { sizeBox: 1, boxFace: 1, flip: 1, label: 1, snapEdge: 1 },
  // parabola = 포물선 궤적. p1/p2가 **바닥(그림자)의 출발점·도달점**이라 정상파·용수철과
  // 같은 두 점 계열이다. snapLineLike로 끝점이 블록·상판 모서리에 붙는다.
  parabola:   { lineTol: 1, label: 1, snapLineLike: 1, endpointHandles: 1, angleSnap: 1 },
  // groundarc = 수평면에 누운 원호(거리 표시). p1=중심, p2=시작점이라 두 점 계열이다.
  groundarc:  { lineTol: 1, label: 1, endpointHandles: 1, angleSnap: 1 },

  /* ----- 생명과학 부품 (2026-07-31) — 규격은 docs/BIO_PARTS_SPEC.md -----
   * 앞의 넷은 전부 p1/p2 두 점 계열이다(용수철·정상파와 같은 가족). 두 점이
   * "묶는 구간의 양 끝"(brace) · "염색체의 위아래 끝"(chromosome) ·
   * "막의 좌우 끝"(bilayer) · "세포체와 축삭 말단"(neuron)이라, 끝점을 끌면
   * 길이와 기울기가 함께 정해진다.
   *
   * label 을 brace 에만 켠 이유: 중괄호는 꼭짓점에 글자 하나가 붙는 흔한 구조라
   * 공용 라벨 기능이 그대로 맞는다. 나머지 셋은 라벨이 여러 개거나(염색체의
   * 대립유전자 4칸) 자리가 정해져 있어(막 안팎, 자극 지점) 각자 필드로 갖는다.
   * 여기에 label 을 켜면 공용 라벨이 하나 더 생겨 글자가 겹친다. */
  brace:      { lineTol: 1, label: 1, endpointHandles: 1, angleSnap: 1 },
  chromosome: { lineTol: 1, endpointHandles: 1, angleSnap: 1 },
  bilayer:    { lineTol: 1, endpointHandles: 1, angleSnap: 1 },
  neuron:     { lineTol: 1, endpointHandles: 1, angleSnap: 1 },
  // 범례·가계도는 "상자 안에 맞춰 그리는" 것이라 크기박스 계열이다. 이동·리사이즈·
  // bbox·저장을 그대로 물려받고, 렌더러는 주어진 x,y,w,h 안에 배치만 계산한다.
  legend:     { sizeBox: 1, boxFace: 1 },
  pedigree:   { sizeBox: 1, boxFace: 1 },

  /* ----- 화학 부품 10종 (2026-07-31) — 규격은 docs/CHEM_PARTS_SPEC.md -----
   * 열 종 **전부 크기박스 계열**로 통일했다. 생명과학 때 p1/p2 계열을 넷 만들면서
   * transform.js 의 리터럴 4벌을 손으로 맞춰야 했는데(BIO_PARTS_SPEC §8-6), 화학 부품은
   * "상자 안에 그림을 맞춰 그리는" 성격이라 두 점을 끌 이유가 없다. 크기박스로 두면
   * 이동·리사이즈·bbox·저장·픽이 전부 SIZE_TYPES 경로로 자동 처리돼 배선 지점이 줄어든다.
   *
   * label 을 켜지 않은 이유: 화학 도판의 글자는 "용기 안 내용물"(vessel.text)·
   * "축 이름"(chemchart)처럼 부품마다 자리가 정해져 있어 각자 필드로 갖는다. 공용 라벨을
   * 겹쳐 켜면 글자가 두 번 나온다(생명과학 chromosome·bilayer 와 같은 판단). 그림 밖
   * 지시선 라벨이 필요하면 이미 있는 labeler 를 쓴다. */
  vessel:      { sizeBox: 1, boxFace: 1 },
  chemmodel:   { sizeBox: 1, boxFace: 1 },
  particlebox: { sizeBox: 1, boxFace: 1 },
  orbital:     { sizeBox: 1, boxFace: 1 },
  bondgroup:   { sizeBox: 1, boxFace: 1 },
  chemchart:   { sizeBox: 1, boxFace: 1 },
  axisbreak:   { sizeBox: 1, boxFace: 1 },
  chemgraph:   { sizeBox: 1, boxFace: 1 },
  electrode:   { sizeBox: 1, boxFace: 1 },
  periodic:    { sizeBox: 1, boxFace: 1 },
};

// Derive the Set of type ids whose row has `flag` truthy.
function typesWith(flag) {
  return new Set(OBJECT_TYPE_IDS.filter((t) => OBJECT_TYPES[t] && OBJECT_TYPES[t][flag]));
}

// Category Sets — each replaces a literal list previously duplicated in a module.
// (member counts noted so a future edit can sanity-check it did not drift)
export const SIZE_TYPES             = typesWith("sizeBox");        // 11: rect ellipse triangle image svgAsset axes coordplane optics apparatus gauge solid3d
export const BOX_FACE_TYPES         = typesWith("boxFace");        // 9: rect image svgAsset axes coordplane optics apparatus gauge solid3d
export const SHAPE_TYPES            = typesWith("shape");          // 3: rect ellipse triangle
export const FLIP_TYPES             = typesWith("flip");           // 7: rect ellipse triangle svgAsset optics apparatus solid3d
export const LINE_TOL_TYPES         = typesWith("lineTol");        // 7: line polyline curve funcgraph circuit pendulum labeler
export const POINT_ARRAY_TYPES      = typesWith("points");         // 3: polyline curve funcgraph
export const TEXT_MEASURED_TYPES    = typesWith("textMeasured");   // 2: text formula
export const LABEL_CAPABLE_TYPES    = typesWith("label");          // 10: rect ellipse line axes coordplane anglearc labeler circuit optics solid3d (+장/정상파·용수철)
export const SNAP_EDGE_TARGET_TYPES = typesWith("snapEdge");       // 5: rect triangle line polyline solid3d
export const SNAP_LINE_TARGET_TYPES = typesWith("snapLineTarget"); // 2: line polyline
export const SNAP_LINE_LIKE_TYPES   = typesWith("snapLineLike");   // 4: line circuit polyline curve
// 10: line circuit labeler pendulum spring chargefield fieldlines standingwave
//     parabola groundarc — 예전엔 이 목록이 scene.js·transform.js에 네 벌 복사돼 있었다.
// 포물선을 추가하며 한 벌을 빠뜨려 "만들고 나면 끝점을 못 고치는" 사고가 났고,
// 같은 시기 main에서도 같은 목록에 4종을 손으로 더 적고 있었다(병합 충돌). 정본은 여기다.
export const ENDPOINT_HANDLE_TYPES  = typesWith("endpointHandles");
// 12: line pendulum spring chargefield fieldlines standingwave parabola groundarc
//     brace chromosome bilayer neuron — 그릴 때 Ctrl/Cmd로 15° 이산화되는 타입.
// 예전엔 tools.js에 리터럴 5종("line","spring","chargefield","fieldlines","standingwave")
// 으로만 적혀 있어서, 그 뒤에 추가된 p1/p2 타입들(포물선·원호·진자·생명 부품 4종)이
// 조용히 빠져 있었다. endpointHandles와 같은 이유로 정본을 여기로 옮긴다.
export const ANGLE_SNAP_TYPES       = typesWith("angleSnap");

// Convenience predicate for the most-duplicated classification (box size object).
export function isSizeObject(o) { return !!o && SIZE_TYPES.has(o.type); }

/* ----- 텍스트 최상단 정책 -----
 * 시험지 그림에서 글자는 무엇에도 가려지면 안 된다(평가원 관례). 렌더(scene.js)와
 * 픽(pick.js hitTest)이 이 함수를 '같이' 써서 보이는 순서와 클릭 순서가 항상 일치한다.
 * text/formula를 배열 순서를 보존한 채 맨 뒤(=맨 위)로 올린다. 저장 데이터(objects[])의
 * 순서는 건드리지 않는다 — 이건 표시·픽 전용 view다. */
export const FLOAT_TOP_TYPES = TEXT_MEASURED_TYPES; // text, formula
export function zOrderObjects(objects) {
  const list = objects || [];
  let needs = false;
  for (let i = 0, seenTop = false; i < list.length; i++) {
    if (FLOAT_TOP_TYPES.has(list[i].type)) seenTop = true;
    else if (seenTop) { needs = true; break; }   // 텍스트 '뒤'에 비텍스트가 있음 → 재배열 필요
  }
  if (!needs) return list;
  const base = [], top = [];
  for (const o of list) (FLOAT_TOP_TYPES.has(o.type) ? top : base).push(o);
  return base.concat(top);
}
