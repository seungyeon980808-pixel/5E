/* ===== TEMPLATES (the SINGLE object registry — DESIGN 1-1) ===== */
//
// One registry is the source of truth for EVERY library object. The left panel is
// rendered FROM this registry (no hardcoded buttons in index.html), and each entry
// only POINTS AT the existing creation path — it never re-implements geometry.
//
// Every entry carries:
//   label     — Korean button text ("볼록렌즈")
//   category  — "공통" | "회로" | "광학" | "역학" (drives panel grouping)
//   keywords  — search hints for a future symbol search (filled plausibly)
//   kind      — "atomic" : ONE object dropped immediately at view center
//               "shape"  : arms an existing placement tool; the user draws on canvas
//   create    — wiring to the EXISTING pipeline (NO new geometry here):
//                 atomic → { } plus a make(at) that returns the object data
//                 shape  → { tool, element? | kind? } recorded before arming the tool
//
// Two creation pipelines are preserved EXACTLY as before:
//   * atomic  → instantiate() pushes make()'s object through the store.
//   * shape   → armSymbol() (tools.js) records the variant (_circuitElement /
//               _opticsKind) then arms CIRCUIT / OPTICS / ARC, which build the
//               geometry on canvas drag/click via makeShape()/makeCircuit()/the ARC
//               tool. The registry only names which tool + variant to arm.

import { state } from "./state.js?v=1.4.0";
import { armSymbol } from "./tools.js?v=1.5.3";
import { renderObject } from "./render.js?v=1.4.0";
import { applyNewObjectStyleDefaults } from "./style-mode.js?v=1.4.0";
import { getSvgAsset } from "./svg-assets.js?v=1.4.0";
import { TOOL_ICONS } from "./tool-icons.js?v=1.4.0";
import { openGraphModal } from "./graph/graph-modal.js?v=1.4.0";

const DEFAULT_STROKE_WIDTH = 0.2; // world units (mm) — matches tools.js shapes

// Monotonic suffix so two instantiations within the same millisecond differ.
let _tplIdCounter = 0;

/* ===== SYMBOL REGISTRY (keyed by symbolId — the UNIQUE per-object id) ===== */
export const TEMPLATES = {
  /* ----- 공통: angle arc -----
   * NOTE: the "axes" CREATION button/shortcut (X) was removed here (확정 항목 ⑥) —
   * the "axes" TYPE itself (render/pick/inspector/object-types) is kept as-is for
   * old save-file compatibility; only this registry entry is gone. */

  /* COORDPLANE — the independent "좌표평면" creation button was removed here
   * (확정 항목 ⑦). The "coordplane" TYPE, makeDefaultCoordplane, its renderer
   * (render/coordplane.js), and its inspector (section-coordplane.js) are all
   * kept untouched — 함수 입력 auto-creates a coordplane internally
   * (function-graph/insert.js) whenever none is selected, so funcgraph literally
   * cannot exist without this foundation. */

  /* FUNCGRAPH — "함수 입력". kind "funcinput": clicking opens the formula input
   * (interim prompt now; §10-④ 모달 later) instead of arming a tool or dropping an
   * atomic object. The insert path (function-graph/insert.js) creates the funcgraph
   * on the selected coordplane, or a fresh plane if none is selected. */
  funcgraph: {
    kind: "funcinput",
    category: "공통",
    label: "함수 입력",
    keywords: ["함수", "그래프", "수식", "function", "graph", "sin", "cos", "log", "y=f(x)", "지수", "로그", "삼각"],
    create: {},
  },

  /* GRAPH — "그래프". kind "graph": 좌표 틀(coordplane)을 독립적으로 삽입한다(함수 없이도).
   * 클릭 시 설정 모달(형태 ㄴ/ㅏ/십자·축이름·격자·원점)을 연다. 함수·물체는 이 틀 위에
   * 얹는다. graph-modal.js가 richLabels/gridToData 플래그를 켠 coordplane을 만든다. */
  graph: {
    kind: "graph",
    category: "공통",
    hidden: true,   // 좌측 팔레트에서 뺌 — 고급 기능 "좌표/함수 생성" 버튼 + F 단축키로 진입(요구)
    label: "좌표/함수 생성",
    keywords: ["그래프", "좌표", "좌표평면", "함수", "중간점", "축", "틀", "graph", "axis", "coordinate", "plane", "격자", "L자", "ㄴ자", "sin", "cos"],
    create: {},
  },

  /* ANGLE ARC — shape (arms the two-click ARC tool in tools.js). The placement
   * tool owns the geometry (makeAngleArcDraft): click 1 = vertex, click 2 = start
   * point. make() below is kept for reference; the button never calls it. */
  anglearc: {
    kind: "shape",
    category: "공통",
    label: "각도 호",
    keywords: ["각도", "호", "angle", "arc", "세타", "theta", "θ"],
    create: { tool: "ARC" },
    make(at) {
      return {
        type: "anglearc",
        x: at.x,                    // arc vertex sits AT the drop point
        y: at.y,
        radius: 14,                 // world units (mm); resizable afterwards
        startAngle: 0,              // math convention (CCW positive, +Y up)
        sweepAngle: 60,             // opening of the arc (deg); CCW positive
        label: "θ",
        labelType: "quantity",
        showLabel: true,
        strokeLevel: 0,             // 0 = black (DESIGN 2-2)
        strokeWidth: DEFAULT_STROKE_WIDTH,
        locked: false,
        positionLocked: false,
      };
    },
  },

  /* ----- 회로: circuit elements — each arms the two-click CIRCUIT tool with a
   * specific element (tools.js makeCircuit reads _circuitElement). ----- */
  rightangle: {
    kind: "shape",
    category: "공통",
    label: "직각 표시",
    keywords: ["직각", "right angle", "90", "marker"],
    create: { tool: "RIGHTANGLE" },
    make(at) {
      return {
        type: "rightangle",
        x: at.x,
        y: at.y,
        size: 6,
        angle: 0,
        orientation: 1,
        strokeLevel: 0,
        strokeWidth: DEFAULT_STROKE_WIDTH,
        locked: false,
        positionLocked: false,
      };
    },
  },

  /* LABELER — shape (arms the two-click LABELER tool in tools.js). Click 1 =
   * leader-line start (on/near the graph), click 2 = label position. Draws a short
   * leader with a small end-gap, then an upright label (circled-letter presets). */
  labeler: {
    kind: "shape",
    category: "공통",
    label: "라벨러",
    keywords: ["라벨", "이름", "지시선", "label", "leader", "callout", "ㄱㄴㄷ", "보기"],
    create: { tool: "LABELER" },
  },

  wire: { kind: "shape", category: "전자기학", label: "도선", keywords: ["도선", "전선", "wire", "conductor"], create: { tool: "APPARATUS", kind: "wire" } },
  compass: { kind: "shape", category: "전자기학", label: "나침반", keywords: ["나침반", "compass", "needle", "magnetic"], create: { tool: "APPARATUS", kind: "compass" } },
  clamp: { kind: "shape", category: "역학", label: "클램프", keywords: ["클램프", "스탠드", "clamp", "stand"], create: { tool: "APPARATUS", kind: "clamp" } },
  scale: { kind: "shape", category: "역학", label: "저울", keywords: ["저울", "디지털저울", "scale", "balance"], create: { tool: "APPARATUS", kind: "scale" } },
  bar_magnet: { kind: "shape", category: "전자기학", label: "막대자석", keywords: ["자석", "막대자석", "N극", "S극", "magnet"], create: { tool: "APPARATUS", kind: "bar_magnet" } },
  speaker: { kind: "shape", category: "역학", label: "스피커", keywords: ["스피커", "음원", "소리", "음파", "speaker"], create: { tool: "APPARATUS", kind: "speaker" } },
  thermometer: { kind: "shape", category: "열역학", label: "온도계", keywords: ["온도계", "온도", "thermometer"], create: { tool: "APPARATUS", kind: "thermometer" } },
  phototube: { kind: "shape", category: "광학", label: "광전관", keywords: ["광전관", "광전 효과", "광전자", "phototube"], create: { tool: "APPARATUS", kind: "phototube" } },
  slit: { kind: "shape", category: "광학", label: "슬릿", keywords: ["슬릿", "단일 슬릿", "이중 슬릿", "간섭", "slit"], create: { tool: "APPARATUS", kind: "slit" } },
  fringe_pattern: { kind: "shape", category: "광학", label: "간섭무늬", keywords: ["간섭무늬", "무늬", "밝은 무늬", "fringe"], create: { tool: "APPARATUS", kind: "fringe_pattern" } },
  transistor: { kind: "shape", category: "전자기학", label: "트랜지스터", keywords: ["트랜지스터", "transistor", "npn", "pnp", "증폭", "베이스", "컬렉터", "이미터"], create: { tool: "APPARATUS", kind: "transistor" } },

  // 회로 심볼 순서 = 팔레트 표시 순서(JS 객체는 삽입 순서 보존). 사용자 지정 3열 배열:
  //   저항 / 코일 / 축전기 · 직류전원 / 교류전원 / 전구 · 전류계 / 전압계 / 다이오드 · 미지소자
  // element 값과 symbolId는 참조가 걸려 있어 절대 변경 금지 — 순서와 label(전지→직류전원)만 조정.
  resistor:  { kind: "shape", category: "회로", label: "저항",     keywords: ["저항", "resistor", "옴", "ohm", "R"],            create: { tool: "CIRCUIT", element: "resistor" } },
  inductor:  { kind: "shape", category: "회로", label: "코일",     keywords: ["코일", "인덕터", "inductor", "coil", "L"],        create: { tool: "CIRCUIT", element: "inductor" } },
  capacitor: { kind: "shape", category: "회로", label: "축전기",   keywords: ["축전기", "콘덴서", "capacitor", "condenser", "C"], create: { tool: "CIRCUIT", element: "capacitor" } },
  dc_source: { kind: "shape", category: "회로", label: "직류전원", keywords: ["직류전원", "전지", "전원", "직류", "dc", "battery", "source"], create: { tool: "CIRCUIT", element: "dc_source" } },
  ac_source: { kind: "shape", category: "회로", label: "교류전원", keywords: ["교류", "ac", "전원", "source", "sine"],          create: { tool: "CIRCUIT", element: "ac_source" } },
  lamp:      { kind: "shape", category: "회로", label: "전구",     keywords: ["전구", "램프", "lamp", "bulb", "light"],          create: { tool: "CIRCUIT", element: "lamp" } },
  ammeter:   { kind: "shape", category: "회로", label: "전류계",   keywords: ["전류계", "ammeter", "A", "전류"],                 create: { tool: "CIRCUIT", element: "ammeter" } },
  voltmeter: { kind: "shape", category: "회로", label: "전압계",   keywords: ["전압계", "voltmeter", "V", "전압"],               create: { tool: "CIRCUIT", element: "voltmeter" } },
  galvanometer: { kind: "shape", category: "회로", label: "검류계", keywords: ["검류계", "galvanometer", "G", "유도 전류"], create: { tool: "CIRCUIT", element: "galvanometer" } },
  motor: { kind: "shape", category: "회로", label: "전동기", keywords: ["전동기", "모터", "motor", "M"], create: { tool: "CIRCUIT", element: "motor" } },
  led: { kind: "shape", category: "회로", label: "LED", keywords: ["LED", "발광", "다이오드", "led"], create: { tool: "CIRCUIT", element: "led" } },
  device_box: { kind: "shape", category: "회로", label: "장치 상자", keywords: ["전원 장치", "장치", "계측기", "인터페이스", "광원", "저항 상자", "상자", "device", "box"], create: { tool: "APPARATUS", kind: "device_box" } },
  diode:     { kind: "shape", category: "회로", label: "다이오드", keywords: ["다이오드", "diode", "정류"],                      create: { tool: "CIRCUIT", element: "diode" } },
  unknown:   { kind: "shape", category: "회로", label: "미지소자", keywords: ["미지", "소자", "unknown", "box", "element"],      create: { tool: "CIRCUIT", element: "unknown" } },

  /* ----- 광학: lenses / mirrors / object / screen / point source — each arms the
   * OPTICS tool (rect-style size-drag) with a specific kind (tools.js makeShape
   * reads _opticsKind). ----- */
  /* 렌즈·거울 5종은 팔레트에서 갈래 하나로 묶는다(2026-07-31 교사 지시).
   * 버튼 얼굴은 오목렌즈이고, 누르면 다섯이 팝오버로 쭉 나온다. 검색(Ctrl+F)·단축키·
   * 저장파일은 개별 id를 그대로 쓰므로 hidden 만 붙인다. */
  optics_group:   { kind: "group", category: "광학", label: "렌즈·거울",
                    keywords: ["렌즈", "거울", "볼록", "오목", "평면", "lens", "mirror", "광학"],
                    variants: ["concave_lens", "convex_lens", "concave_mirror", "convex_mirror", "plane_mirror"] },

  convex_lens:    { hidden: true, kind: "shape", category: "광학", label: "볼록렌즈", keywords: ["볼록", "렌즈", "convex", "lens"],            create: { tool: "OPTICS", kind: "convex_lens" } },
  concave_lens:   { hidden: true, kind: "shape", category: "광학", label: "오목렌즈", keywords: ["오목", "렌즈", "concave", "lens"],           create: { tool: "OPTICS", kind: "concave_lens" } },
  convex_mirror:  { hidden: true, kind: "shape", category: "광학", label: "볼록거울", keywords: ["볼록", "거울", "convex", "mirror"],          create: { tool: "OPTICS", kind: "convex_mirror" } },
  concave_mirror: { hidden: true, kind: "shape", category: "광학", label: "오목거울", keywords: ["오목", "거울", "concave", "mirror"],         create: { tool: "OPTICS", kind: "concave_mirror" } },
  plane_mirror:   { hidden: true, kind: "shape", category: "광학", label: "평면거울", keywords: ["평면", "거울", "plane", "mirror"],           create: { tool: "OPTICS", kind: "plane_mirror" } },
  object_arrow:   { kind: "shape", category: "광학", label: "물체",     keywords: ["물체", "화살표", "object", "arrow"],         create: { tool: "OPTICS", kind: "object_arrow" } },
  screen:         { kind: "shape", category: "광학", label: "스크린",   keywords: ["스크린", "screen", "벽"],                    create: { tool: "OPTICS", kind: "screen" } },
  point_light:    { kind: "shape", category: "광학", label: "점광원",   keywords: ["점광원", "광원", "point", "light", "source"], create: { tool: "OPTICS", kind: "point_light" } },

  /* ----- 역학: pulley / supports / pivot / node / magnet — also arm the OPTICS
   * size-drag tool with a specific kind. ----- */
  pulley: {
    kind: "shape",
    category: "역학",
    label: "도르래",
    keywords: ["도르래", "pulley", "활차"],
    create: { tool: "SVGASSET", kind: "pulley" },
  },
  cart: {
    kind: "shape",
    category: "역학",
    label: "역학 수레",
    keywords: ["수레", "역학", "역학 수레", "cart", "mechanics cart"],
    create: { tool: "SVGASSET", kind: "cart" },
  },
  // 분류는 반드시 CATEGORY_ORDER에 있는 이름이어야 한다. 없는 이름("전기")을 쓰면
  // 팔레트에도, 과목별 아코디언에도 안 나온다 — 스위치 2종이 그렇게 숨어 있었다.
  sw_open:     { kind: "shape", category: "회로", label: "스위치",     keywords: ["스위치", "switch", "개폐기", "S1"], create: { tool: "CIRCUIT", element: "switch" } },
  sw_spdt:     { kind: "shape", category: "회로", label: "전환 스위치", keywords: ["전환", "스위치", "spdt", "a b"], create: { tool: "CIRCUIT", element: "switch_spdt" } },
  pulley_ceiling: { kind: "shape", category: "역학", label: "천장 도르래", keywords: ["도르래", "천장", "고정도르래", "pulley"], create: { tool: "APPARATUS", kind: "pulley", props: { variant: "ceiling" } } },
  // 장(場) 그림·정상파 — 두 점(전하·극·양끝)을 끌어 배치한다.
  /* 통합 버튼 — 누르면 팝오버가 떠 갈래를 한 번 더 고른다(기존 텍스트·라벨러 버튼과 같은 방식).
   * 실제 배치는 variants가 가리키는 항목이 하고, 그 항목들은 팔레트에서 숨긴다. */
  ef_group:    { kind: "group", category: "전자기학", label: "전기력선", keywords: ["전기력선", "전하", "점전하", "field", "charge"],
                 variants: ["ef_pair", "ef_single"] },
  stw_group:   { kind: "group", category: "광학", label: "정상파", keywords: ["정상파", "줄", "기주", "열린관", "닫힌관", "standing"],
                 variants: ["stw_string", "stw_open", "stw_closed"] },

  ef_pair:     { hidden: true, kind: "shape", category: "전자기학", label: "전기력선",     keywords: ["전기력선", "전하", "쿨롱", "field", "charge"], create: { tool: "CHARGEFIELD", props: { kind: "pair" } } },
  ef_single:   { hidden: true, kind: "shape", category: "전자기학", label: "점전하 전기력선", keywords: ["점전하", "전기력선", "단일", "field"], create: { tool: "CHARGEFIELD", props: { kind: "single", q1: 1 } } },
  ef_uniform:  { kind: "shape", category: "전자기학", label: "평행판 균일장", keywords: ["평행판", "균일장", "전기장", "uniform"], create: { tool: "CHARGEFIELD", props: { kind: "uniform" } } },
  mag_bar:     { kind: "shape", category: "전자기학", label: "자기력선",     keywords: ["자기력선", "자석", "자기장", "magnet", "field"], create: { tool: "FIELDLINES", props: { kind: "bar" } } },
  mag_wire:    { kind: "shape", category: "전자기학", label: "도선 자기장",  keywords: ["도선", "자기장", "동심원", "앙페르", "wire"], create: { tool: "FIELDLINES", props: { kind: "wire" } } },
  stw_string:  { hidden: true, kind: "shape", category: "광학", label: "정상파(줄)",   keywords: ["정상파", "줄", "마디", "배", "standing"], create: { tool: "STANDINGWAVE", props: { medium: "string" } } },
  stw_open:    { hidden: true, kind: "shape", category: "광학", label: "정상파(열린관)", keywords: ["정상파", "열린관", "기주", "standing"], create: { tool: "STANDINGWAVE", props: { medium: "open" } } },
  stw_closed:  { hidden: true, kind: "shape", category: "광학", label: "정상파(닫힌관)", keywords: ["정상파", "닫힌관", "기주", "standing"], create: { tool: "STANDINGWAVE", props: { medium: "closed", n: 3 } } },
  spring:      { kind: "shape", category: "역학", label: "용수철",   keywords: ["용수철", "스프링", "spring", "탄성"], create: { tool: "SPRING" } },
  pendulum:    { kind: "shape", category: "역학", label: "단진자",   keywords: ["진자", "단진자", "pendulum", "추", "bob", "흔들이"], create: { tool: "PENDULUM" } },
  node:        { kind: "shape", category: "공통", label: "점",       keywords: ["점", "마디", "연결점", "node", "joint"], create: { tool: "OPTICS", kind: "node" } },
  /* ----- 입체(경사 투영, 실험 단계) — render/solid3d.js -----------------------------
   * 갈래가 11개까지 늘어 역학 팔레트를 통째로 잡아먹었는데, 아직 실험 단계라 그만한
   * 자리값을 못 한다(2026-07-26 사용자 판단). 그래서 **통합 버튼 하나**로 접는다.
   * 방식은 전기력선·정상파와 같은 kind:"group" + variants다 — 누르면 팝오버가 떠
   * 갈래를 고르고, 팝오버 안 버튼이 실제 배치를 arm 한다.
   * 접은 항목은 **오브젝트 검색(Ctrl+F)** 으로도 나오고, 이미 저장된 파일도 그대로 열린다.
   * 놓은 뒤에 갈래를 바꾸고 싶으면 인스펙터 "입체 > 종류"를 쓴다.
   * 갈래는 renderer 넷(box/cylinder/wedge/desk + plane/axes3d)을 공유한다: 판·원판은
   * 각각 직육면체·원기둥의 납작한 프리셋일 뿐이라 별도 렌더러가 없다. ----------------- */
  solid_group:    { kind: "group", category: "역학", label: "입체(실험)",
                    keywords: ["입체", "3D", "직육면체", "블록", "상자", "판", "상판", "원기둥", "원판", "받침", "빗면", "경사면", "책상", "실험대", "수평면", "바닥", "좌표축", "포물선", "원호", "box", "cuboid", "slab", "cylinder", "wedge", "desk", "plane", "axes"],
                    variants: ["solid_box", "solid_slab", "solid_cylinder", "solid_disk", "solid_wedge", "solid_desk", "solid_plane", "solid_axes3d", "solid_axesgnd", "groundarc", "parabola"] },
  solid_box:      { kind: "shape", category: "역학", hidden: true, label: "직육면체", keywords: ["직육면체", "블록", "상자", "입체", "3D", "box", "block", "cuboid"], create: { tool: "SOLID3D", kind: "box" } },
  solid_slab:     { kind: "shape", category: "역학", hidden: true, label: "판·상판", keywords: ["판", "상판", "책상", "실험대", "바닥", "입체", "slab", "table", "plate"], create: { tool: "SOLID3D", kind: "slab" } },
  solid_cylinder: { kind: "shape", category: "역학", hidden: true, label: "원기둥", keywords: ["원기둥", "실린더", "추", "자석", "봉", "입체", "cylinder", "rod"], create: { tool: "SOLID3D", kind: "cylinder" } },
  solid_disk:     { kind: "shape", category: "역학", hidden: true, label: "원판·받침", keywords: ["원판", "받침", "스탠드", "디스크", "입체", "disk", "base"], create: { tool: "SOLID3D", kind: "cylinder" } },
  solid_wedge:    { kind: "shape", category: "역학", hidden: true, label: "빗면", keywords: ["빗면", "경사면", "삼각기둥", "쐐기", "입체", "wedge", "incline", "ramp"], create: { tool: "SOLID3D", kind: "wedge" } },
  solid_desk:     { kind: "shape", category: "역학", hidden: true, label: "실험대·책상", keywords: ["책상", "실험대", "탁자", "테이블", "다리", "입체", "desk", "table", "bench"], create: { tool: "SOLID3D", kind: "desk" } },
  solid_plane:    { kind: "shape", category: "역학", hidden: true, label: "수평면", keywords: ["수평면", "바닥", "평면", "지면", "판", "plane", "ground", "floor"], create: { tool: "SOLID3D", kind: "plane" } },
  solid_axes3d:   { kind: "shape", category: "역학", hidden: true, label: "3차원 좌표축", keywords: ["좌표축", "3차원", "3D", "xyz", "축", "공간", "axes", "coordinate"], create: { tool: "SOLID3D", kind: "axes3d" } },
  solid_axesgnd:  { kind: "shape", category: "역학", hidden: true, label: "평면 위 좌표축", keywords: ["좌표축", "바닥", "수평면", "xy", "2축", "평면", "ground axes"], create: { tool: "SOLID3D", kind: "axes3d", props: { variant: "ground" } } },
  // 원호·포물선은 solid3d가 아닌 별도 타입이라 "종류" 드롭다운으로는 못 바꾼다.
  // 같이 실험 단계라 접어 두되, 검색으로는 나온다.
  groundarc:      { kind: "shape", category: "역학", hidden: true, label: "평면 위 원호", keywords: ["원호", "호", "거리", "바닥", "수평면", "arc", "distance"], create: { tool: "GROUNDARC" } },
  // 포물선: 두 번 끄는 게 아니라 **바닥의 출발점 → 도달점**을 끈다. 깊이 방향으로 끌면
  // 안쪽으로 날아가는 3D 궤적이 된다(바닥 점선이 그 느낌을 만든다).
  parabola:       { kind: "shape", category: "역학", hidden: true, label: "포물선 궤적", keywords: ["포물선", "궤적", "포사체", "던지기", "비스듬히", "parabola", "projectile", "trajectory"], create: { tool: "PARABOLA" } },

  /* ===== 생명과학 부품 (2026-07-31) =====
   * 기출 69장 조사(docs/SURVEY_bio_20260731.md)에서 나온 병목을 부품으로 만든 것.
   * 카테고리 이름은 subject-objects.js 의 생명과학 아코디언 이름과 **글자까지 같아야**
   * 팔레트에 나온다(templates.js 위쪽 주석의 그 함정 — 지금도 axis_break 가 그래서 안 보인다). */
  bilayer:    { kind: "shape", category: "세포학", label: "인지질 이중층", keywords: ["인지질", "이중층", "세포막", "막", "지질", "bilayer", "membrane", "lipid"], create: { tool: "BILAYER" } },
  neuron:     { kind: "shape", category: "동식물학", label: "뉴런", keywords: ["뉴런", "신경", "신경세포", "축삭", "가지돌기", "시냅스", "neuron", "axon"], create: { tool: "NEURON" } },
  chromosome: { kind: "shape", category: "유전학", label: "염색체", keywords: ["염색체", "염색분체", "동원체", "상동", "대립유전자", "chromosome", "chromatid"], create: { tool: "CHROMOSOME" } },
  pedigree:   { kind: "shape", category: "유전학", label: "가계도", keywords: ["가계도", "가계", "유전", "세대", "발현", "보인자", "pedigree"], create: { tool: "PEDIGREE" } },
  // 중괄호·범례는 생명 전용이 아니다(물리·화학·지구에서도 쓴다). 지금은 생명 패널에만
  // 노출하고, 다른 과목 패널을 손댈 때 같은 카테고리를 그쪽 cats 에도 넣으면 된다.
  brace:      { kind: "shape", category: "표시·주석", label: "중괄호", keywords: ["중괄호", "괄호", "묶음", "구획", "brace", "bracket"], create: { tool: "BRACE" } },
  legend:     { kind: "shape", category: "표시·주석", label: "범례", keywords: ["범례", "기호 설명", "legend", "key"], create: { tool: "LEGEND" } },

  /* ===== 화학 부품 (2026-07-31) =====
   * 기출 280장 전수 분해(docs/PART_FREQUENCY_CHEM.md)에서 나온 대기열을 부품으로 만든 것.
   * 카테고리 이름은 subject-objects.js 의 화학 아코디언 이름과 **글자까지 같아야** 팔레트에 나온다.
   * 용기는 대기열 1~5위를 한 타입으로 덮으므로(93장) kind 별로 버튼을 따로 낸다. */
  vessel_beaker:   { kind: "shape", category: "실험 기구", label: "비커", keywords: ["비커", "beaker", "용기", "유리"], create: { tool: "VESSEL", props: { kind: "beaker", text: "", hasPiston: false, liquid: 0.45 } } },
  vessel_flask:    { kind: "shape", category: "실험 기구", label: "삼각플라스크", keywords: ["삼각플라스크", "플라스크", "flask"], create: { tool: "VESSEL", props: { kind: "flask", text: "", hasPiston: false, liquid: 0.4 } } },
  vessel_tube:     { kind: "shape", category: "실험 기구", label: "시험관", keywords: ["시험관", "test tube", "튜브"], create: { tool: "VESSEL", props: { kind: "test_tube", text: "", hasPiston: false, liquid: 0.45 } } },
  vessel_cylinder: { kind: "shape", category: "실험 기구", label: "눈금실린더", keywords: ["눈금실린더", "메스실린더", "cylinder", "부피"], create: { tool: "VESSEL", props: { kind: "cylinder_graduated", text: "", hasPiston: false, liquid: 0.5, hasTicks: true } } },
  vessel_funnel:   { kind: "shape", category: "실험 기구", label: "깔때기", keywords: ["깔때기", "funnel", "거름", "여과"], create: { tool: "VESSEL", props: { kind: "funnel", text: "", hasPiston: false, liquid: 0 } } },
  vessel_utube:    { kind: "shape", category: "실험 기구", label: "U자관", keywords: ["U자관", "유자관", "u tube", "수은"], create: { tool: "VESSEL", props: { kind: "u_tube", text: "", hasPiston: false, liquid: 0.4 } } },
  vessel_burette:  { kind: "shape", category: "실험 기구", label: "뷰렛", keywords: ["뷰렛", "burette", "적정"], create: { tool: "VESSEL", props: { kind: "burette", text: "", hasPiston: false, liquid: 0.6, hasTicks: true } } },
  vessel_round:    { kind: "shape", category: "실험 기구", label: "강철 용기", keywords: ["강철 용기", "원형 용기", "구형", "기체"], create: { tool: "VESSEL", props: { kind: "round", hasPiston: false, liquid: 0 } } },
  vessel_piston:   { kind: "shape", category: "실험 기구", label: "실린더+피스톤", keywords: ["실린더", "피스톤", "기체", "부피", "보일"], create: { tool: "VESSEL", props: { kind: "box", liquid: 0 } } },
  electrode:  { kind: "shape", category: "실험 기구", label: "전극·전지", keywords: ["전극", "전지", "갈바니", "전기분해", "염다리", "electrode"], create: { tool: "ELECTRODE" } },

  chem_atom:  { kind: "shape", category: "원자·주기율", label: "원자 구슬", keywords: ["원자", "구슬", "입자", "atom"], create: { tool: "CHEMMODEL", props: { kind: "atom" } } },
  chem_shell: { kind: "shape", category: "원자·주기율", label: "전자 껍질", keywords: ["전자 껍질", "껍질", "전자 배치", "보어", "shell"], create: { tool: "CHEMMODEL", props: { kind: "shell" } } },
  chem_lewis: { kind: "shape", category: "원자·주기율", label: "전자점식", keywords: ["전자점식", "루이스", "원자가 전자", "lewis"], create: { tool: "CHEMMODEL", props: { kind: "lewis" } } },
  orbital_box:{ kind: "shape", category: "원자·주기율", label: "오비탈 상자", keywords: ["오비탈", "상자", "전자 배치", "스핀", "아우프바우"], create: { tool: "ORBITAL", props: { kind: "box" } } },
  orbital_sh: { kind: "shape", category: "원자·주기율", label: "오비탈 모양", keywords: ["오비탈", "s 오비탈", "p 오비탈", "아령", "orbital"], create: { tool: "ORBITAL", props: { kind: "shape" } } },
  periodic:   { kind: "shape", category: "원자·주기율", label: "주기율표", keywords: ["주기율표", "주기", "족", "원소", "periodic"], create: { tool: "PERIODIC" } },

  chem_molecule: { kind: "shape", category: "결합·분자", label: "분자 모형", keywords: ["분자", "모형", "결합각", "구조", "molecule"], create: { tool: "CHEMMODEL", props: { kind: "molecule" } } },
  chem_lattice:  { kind: "shape", category: "결합·분자", label: "결정 격자", keywords: ["결정", "격자", "단위세포", "면심", "체심", "흑연"], create: { tool: "CHEMMODEL", props: { kind: "lattice" } } },
  bondgroup:     { kind: "shape", category: "결합·분자", label: "구조식", keywords: ["구조식", "결합", "이중결합", "삼중결합", "bond"], create: { tool: "BONDGROUP" } },

  particlebox: { kind: "shape", category: "물질의 상태", label: "입자 상자", keywords: ["입자", "상자", "고체", "액체", "기체", "상태 변화", "확산"], create: { tool: "PARTICLEBOX" } },

  chart_bar:  { kind: "shape", category: "반응·그래프", label: "막대그래프", keywords: ["막대", "막대그래프", "bar"], create: { tool: "CHEMCHART", props: { kind: "bar" } } },
  chart_pie:  { kind: "shape", category: "반응·그래프", label: "원그래프", keywords: ["원그래프", "파이", "비율", "조성", "pie"], create: { tool: "CHEMCHART", props: { kind: "pie", values: "1,3", names: "X,Y" } } },
  graph_ene:  { kind: "shape", category: "반응·그래프", label: "반응 에너지", keywords: ["반응 에너지", "엔탈피", "활성화 에너지", "발열", "흡열"], create: { tool: "CHEMGRAPH", props: { kind: "energy" } } },
  graph_tit:  { kind: "shape", category: "반응·그래프", label: "적정 곡선", keywords: ["적정", "중화", "당량점", "pH", "titration"], create: { tool: "CHEMGRAPH", props: { kind: "titration" } } },
  graph_pha:  { kind: "shape", category: "반응·그래프", label: "상평형 그림", keywords: ["상평형", "삼중점", "임계점", "phase"], create: { tool: "CHEMGRAPH", props: { kind: "phase" } } },

  axisbreak:  { kind: "shape", category: "표시·주석", label: "축 생략", keywords: ["축 생략", "물결", "생략 기호", "break"], create: { tool: "AXISBREAK" } },

  /* ===== 지구과학 (2026-07-31) — 규격은 docs/EARTH_PARTS_SPEC.md =====
   * 전용 타입을 만들지 않았다. 전선·등치선·산점은 본질이 곡선·꺾은선이라
   * 기존 도구(C 곡선 · P 꺾은선 · L 선 · RECT)에 필드만 얹는다(props).
   * 그래서 만들고 나면 꼭짓점을 찝어 구부리는 동작이 그대로 따라온다.
   * 필드가 실제로 붙는 자리: tools.js makeShape(드래그) / tools/click-placement.js
   * commitClickShape(클릭배치). */

  // ----- 지질학: 암상 무늬는 '무슨 암석인가'를 말하는 정보다(장식이 아니다) -----
  strata_lime: { kind: "shape", category: "지질학", label: "석회암 층", keywords: ["석회암", "지층", "벽돌", "단면", "limestone"], create: { tool: "RECT", props: { fillStyle: "brick", fillLevel: 0 } } },
  strata_volc: { kind: "shape", category: "지질학", label: "화산암 층", keywords: ["화산암", "응회암", "지층", "단면", "volcanic"], create: { tool: "RECT", props: { fillStyle: "vees", fillLevel: 0 } } },
  strata_plut: { kind: "shape", category: "지질학", label: "심성암 층", keywords: ["심성암", "화강암", "관입", "지층", "granite"], create: { tool: "RECT", props: { fillStyle: "plus", fillLevel: 0 } } },
  strata_shale:{ kind: "shape", category: "지질학", label: "셰일 층", keywords: ["셰일", "이암", "층리", "지층", "shale"], create: { tool: "RECT", props: { fillStyle: "hlines", fillLevel: 0 } } },
  // 부정합면 — 물결치는 접촉면. 곡선을 굵게 그어 지층 경계로 쓴다.
  unconformity:{ kind: "shape", category: "지질학", label: "부정합면", keywords: ["부정합", "접촉면", "물결", "경계", "unconformity"], create: { tool: "C", props: { strokeWidth: 0.4 } } },

  // ----- 해양학 -----
  isobath:    { kind: "shape", category: "해양학", label: "등수심선", keywords: ["등수심선", "등치선", "수심", "해저", "isobath"], create: { tool: "C", props: { inlineLabel: "100", inlineLabelT: 0.5 } } },
  scalebar:   { kind: "shape", category: "해양학", label: "축척 막대", keywords: ["축척", "스케일바", "지도", "거리", "scale"], create: { tool: "L", props: { lineMode: "scaleBar", scaleBarVariant: "bars", dimensionLabel: "0 - 200 km" } } },

  // ----- 기상학: 전선 기호 4종 + 등압선 -----
  front_cold: { kind: "shape", category: "기상학", label: "한랭 전선", keywords: ["한랭전선", "전선", "삼각", "일기도", "cold front"], create: { tool: "C", props: { frontKind: "cold", frontGap: 7 } } },
  front_warm: { kind: "shape", category: "기상학", label: "온난 전선", keywords: ["온난전선", "전선", "반원", "일기도", "warm front"], create: { tool: "C", props: { frontKind: "warm", frontGap: 7 } } },
  front_stat: { kind: "shape", category: "기상학", label: "정체 전선", keywords: ["정체전선", "장마", "전선", "일기도", "stationary"], create: { tool: "C", props: { frontKind: "stationary", frontGap: 7 } } },
  front_occl: { kind: "shape", category: "기상학", label: "폐색 전선", keywords: ["폐색전선", "전선", "일기도", "occluded"], create: { tool: "C", props: { frontKind: "occluded", frontGap: 7 } } },
  isobar:     { kind: "shape", category: "기상학", label: "등압선", keywords: ["등압선", "등치선", "기압", "일기도", "isobar"], create: { tool: "C", props: { inlineLabel: "1000", inlineLabelT: 0.5 } } },

  // ----- 천문학: 산점(H-R도·은하 분포) -----
  scatter:    { kind: "shape", category: "천문학", label: "산점", keywords: ["산점", "산점도", "H-R도", "분포", "별", "scatter"], create: { tool: "P", props: { markerOnly: true } } },
  scatter_o:  { kind: "shape", category: "천문학", label: "산점(속 빈 원)", keywords: ["산점", "빈 원", "구분", "H-R도", "scatter"], create: { tool: "P", props: { markerOnly: true, markerOpen: true } } },
};

/* ===== INSTANTIATE: atomic creation entry point ===== */
// atomic → push ONE object through the store (undo snapshot + auto-select),
// exactly like drawing a shape (tools.js) or importing an image (project-io.js).
export function instantiate(symbolId, atCanvasPoint) {
  const def = TEMPLATES[symbolId];
  if (!def) {
    console.warn(`[templates] unknown symbol: ${symbolId}`);
    return;
  }
  if (def.kind !== "atomic") {
    // Non-atomic symbols arm a placement tool instead (see onSymbolClick).
    console.warn(`[templates] "${symbolId}" is not atomic — use the placement tool`);
    return;
  }

  const at = atCanvasPoint || { x: 0, y: 0 };
  const obj = applyNewObjectStyleDefaults(def.make(at));

  state.update((s) => {
    // Snapshot pre-creation objects so a single Ctrl+Z removes this symbol.
    const snap = JSON.parse(JSON.stringify(s.objects));
    obj.id = `obj_${Date.now().toString(36)}_tpl${++_tplIdCounter}`;
    obj.order = s.objects.length;
    obj.layerId = s.activeLayerId;
    s.objects.push(obj);
    s.undoStack.push(snap);
    s.redoStack = [];
    s.selectedIds = [obj.id]; // auto-select the new symbol
    s.targetedId = null;
    s.activeTool = "V";       // ensure the select tool is armed
  });
}

/* ===== RENDER THE LEFT-PANEL LIBRARY FROM THE REGISTRY ===== */
// Categories are rendered as collapsible sections (same markup as the hardcoded
// 공통 도구 / 고급 기능 sections, so the existing collapse delegation works). Each
// button carries data-symbol="<symbolId>" — a UNIQUE id, not a shared tool name.
const CATEGORY_ORDER = ["공통", "함수", "회로", "전자기학", "광학", "역학", "열역학",
  // 생명과학 (2026-07-31)
  "세포학", "동식물학", "유전학",
  // 지구과학 (2026-07-31) — docs/EARTH_PARTS_SPEC.md
  "지질학", "해양학", "기상학", "천문학",
  "표시·주석"];

/* ===== ICON RENDERING — reuse the REAL renderers (render.js) at small scale =====
 *
 * Each button shows a mini SVG preview built by calling the object's EXISTING
 * render function (renderObject) on a representative data object, then flattening
 * it to a single currentColor silhouette. Because the geometry comes straight from
 * the renderer, any future edit to a shape updates its icon automatically. No icon
 * is hand-drawn here — we only choose representative sizes + a clean data variant. */
const SVG_NS = "http://www.w3.org/2000/svg";
const ICON_PX = 19;          // tool-ico render box (matches css .tool-btn kbd .tool-ico)
const ICON_STROKE_PX = 1.3;  // target on-screen stroke weight (≈ the base-tool icons)
const CIRCUIT_PALETTE_LABELS = { resistor: "R", inductor: "L", capacitor: "C", voltmeter: "V", ammeter: "A" };
const SHORTCUT_LABELS = { anglearc: "A", rightangle: "Shift+A", node: "N", labeler: "Shift+T", funcgraph: "F" };

// Representative bounding boxes (world mm) per OPTICS kind — only drives the icon's
// aspect ratio; the viewBox auto-fits afterwards. fillNone keeps shapes hollow.
const OPTICS_ICON_BOX = {
  convex_lens:    { w: 13, h: 22 },
  concave_lens:   { w: 13, h: 22 },
  convex_mirror:  { w: 12, h: 22 },
  concave_mirror: { w: 12, h: 22 },
  plane_mirror:   { w: 10, h: 22 },
  screen:         { w: 10, h: 22 },
  object_arrow:   { w: 12, h: 22 },
  point_light:    { w: 18, h: 18 },
  node:           { w: 16, h: 16 },
  pivot:          { w: 18, h: 18 },
  pulley:         { w: 18, h: 18 },
};

const APPARATUS_ICON_BOX = {
  wire: { w: 26, h: 6 },
  compass: { w: 18, h: 18 },
  pulley: { w: 18, h: 18 },
  clamp: { w: 18, h: 24 },
  scale: { w: 26, h: 18 },
  transistor: { w: 20, h: 20 },
  device_box: { w: 26, h: 14 },
  speaker: { w: 18, h: 14 },
  phototube: { w: 16, h: 20 },
  slit: { w: 4, h: 22 },
  thermometer: { w: 7, h: 22 },
  bar_magnet: { w: 26, h: 9 },
  fringe_pattern: { w: 7, h: 22 },
};

// 입체 아이콘: symbolId별 대표 상자(월드 mm). 판·원판은 납작하게 잡아야 버튼만 보고
// 직육면체·원기둥과 구분된다.
// (아이콘은 bbox 직접 지정이다 — 캔버스의 "드래그=앞면" 해석을 거치지 않는다.)
const SOLID3D_ICON_BOX = {
  solid_box:      { w: 20, h: 20, depth: 9 },
  solid_slab:     { w: 26, h: 16, depth: 16 },
  solid_cylinder: { w: 12, h: 24, depth: 6 },
  solid_disk:     { w: 26, h: 13, depth: 6 },
  solid_wedge:    { w: 26, h: 20, depth: 9 },
  solid_desk:     { w: 26, h: 24, depth: 12 },
  solid_axes3d:   { w: 24, h: 24, depth: 14 },
  solid_axesgnd:  { w: 26, h: 18, depth: 14 },
  solid_plane:    { w: 28, h: 15, depth: 14 },
};

// Build the data object that the REAL renderer turns into the icon.
/* 화학 부품 아이콘 상자 — 도구코드별 {타입, 크기, 기본필드, 아이콘 전용 덮어쓰기}.
 * iconOnly 는 팔레트 props 보다 뒤에 얹혀 **아이콘에서만** 글자를 지운다(16px 가독성). */
const CHEM_ICON_BOX = {
  VESSEL:      { type: "vessel", w: 18, h: 22, props: { kind: "box", liquid: 0.4, hasPiston: false }, iconOnly: { text: "", hasStopcock: false } },
  CHEMMODEL:   { type: "chemmodel", w: 22, h: 22, props: { kind: "atom", symbol: "O" }, iconOnly: { showGeoLabel: false } },
  PARTICLEBOX: { type: "particlebox", w: 20, h: 20, props: { state: "gas", count: 9, particleRadius: 1.4 } },
  ORBITAL:     { type: "orbital", w: 22, h: 22, props: { kind: "shape", orbital: "pz" }, iconOnly: { showSymbol: false, electrons: 4, showOrbitalLabels: false } },
  BONDGROUP:   { type: "bondgroup", w: 24, h: 16, props: { molecule: "CO2", bondLength: 7 }, iconOnly: { showKoreanName: false } },
  CHEMCHART:   { type: "chemchart", w: 22, h: 20, props: { kind: "bar", values: "2,4,3", names: "" }, iconOnly: { xTitle: "", yTitle: "", showGuide: false, showRatio: false } },
  AXISBREAK:   { type: "axisbreak", w: 22, h: 6, props: { dir: "horizontal", amp: 0.8, gap: 2, period: 4 } },
  CHEMGRAPH:   { type: "chemgraph", w: 24, h: 20, props: { kind: "energy" }, iconOnly: { showMarks: false, showRegionNames: false, showEqPoint: false } },
  ELECTRODE:   { type: "electrode", w: 24, h: 20, props: {}, iconOnly: { solution: "", leftLabel: "", rightLabel: "", showElectronArrow: false } },
  PERIODIC:    { type: "periodic", w: 26, h: 13, props: { periods: 3 }, iconOnly: { showZ: false, metalShade: true } },
};

function iconSampleObject(id, def) {
  // axes + anglearc carry a make() → reuse the real geometry verbatim.
  if (typeof def.make === "function") {
    const o = def.make({ x: 0, y: 0 });
    if (o.type === "axes") {          // strip ticks/labels so the silhouette stays clean
      o.showTicks = false;
      o.labelX = "";
      o.labelY = "";
    }
    if (o.type === "coordplane") {    // clean cross-axes silhouette for the 16px icon
      o.showTicks = false;
      o.showTickLabels = false;
      o.showGrid = false;
      o.labelX = "";
      o.labelY = "";
    }
    if (o.type === "anglearc") {
      o.label = "θ";
      o.showLabel = true;
    }
    return o;
  }
  const c = def.create || {};
  if (c.tool === "CIRCUIT") {
    // horizontal two-terminal element, 16mm span (8mm body + equal leads).
    return {
      type: "circuit", element: c.element,
      p1: { x: -8, y: 0 }, p2: { x: 8, y: 0 },
      strokeLevel: 0, strokeWidth: 0.5, label: "",
    };
  }
  if (c.tool === "OPTICS") {
    const b = OPTICS_ICON_BOX[c.kind] || { w: 18, h: 22 };
    return {
      type: "optics", kind: c.kind,
      x: -b.w / 2, y: -b.h / 2, w: b.w, h: b.h, rotation: 0,
      strokeLevel: 0, strokeWidth: 0.6, showLabel: false, fillNone: true,
    };
  }
  if (c.tool === "APPARATUS") {
    const b = APPARATUS_ICON_BOX[c.kind] || { w: 20, h: 16 };
    const sample = {
      type: "apparatus", kind: c.kind,
      x: -b.w / 2, y: -b.h / 2, w: b.w, h: b.h, rotation: 0,
      strokeLevel: 0, strokeWidth: 0.6, fillNone: true,
    };
    if (c.kind === "wire") Object.assign(sample, { length: 24, gap: 1.4, angle: -18 });
    if (c.kind === "compass") sample.needleAngle = -90;
    if (c.kind === "pulley") sample.variant = "basic";
    if (c.kind === "clamp") sample.flipped = false;
    if (c.kind === "scale") sample.displayText = "0.99 N";
    return sample;
  }
  if (c.tool === "GROUNDARC") {
    return {
      type: "groundarc", p1: { x: -6, y: 8 }, p2: { x: 12, y: 8 },
      sweep: 110, dashed: false, projAngle: 50,
      strokeLevel: 0, strokeWidth: 0.6, showLabel: false,
    };
  }
  if (c.tool === "PARABOLA") {
    return {
      type: "parabola", p1: { x: -12, y: 8 }, p2: { x: 12, y: 8 },
      apex: 13, showShadow: true, showApex: false,
      strokeLevel: 0, strokeWidth: 0.6, showLabel: false,
    };
  }
  /* ----- 생명과학 부품 아이콘 표본 (docs/BIO_PARTS_SPEC.md) -----
   * 아이콘은 렌더러가 그린 그림을 그대로 축소한 것이므로, 16px에서 알아볼 수 있게
   * "가장 그 부품다운" 값을 고른다(개수는 줄이고 굵기는 키운다). */
  if (c.tool === "BRACE") {
    return {
      type: "brace", p1: { x: 0, y: -11 }, p2: { x: 0, y: 11 },
      depth: 6, flipSide: false, showLabel: false,
      strokeLevel: 0, strokeWidth: 0.6,
    };
  }
  if (c.tool === "CHROMOSOME") {
    return {
      type: "chromosome", p1: { x: 0, y: -11 }, p2: { x: 0, y: 11 },
      chromatidWidth: 4.4, chromatidGap: 2.4, centromere: 0.32,
      fillStyle: "solid", fillLevel: 255, homologPair: false, showLabels: false,
      strokeLevel: 0, strokeWidth: 0.6,
    };
  }
  if (c.tool === "BILAYER") {
    return {
      type: "bilayer", p1: { x: -12, y: 0 }, p2: { x: 12, y: 0 },
      unitCount: 6, thickness: 11, headRadius: 2, proteins: [],
      labelOuter: "", labelInner: "",
      strokeLevel: 0, strokeWidth: 0.6,
    };
  }
  if (c.tool === "NEURON") {
    return {
      type: "neuron", p1: { x: -8, y: 0 }, p2: { x: 13, y: 0 },
      somaRadius: 4.2, dendrites: 4, terminals: 3, showStim: false,
      strokeLevel: 0, strokeWidth: 0.6,
    };
  }
  if (c.tool === "LEGEND") {
    return {
      type: "legend", x: -11, y: -8, w: 22, h: 16,
      items: [{ sample: "solid", text: "" }, { sample: "dash", text: "" }],
      direction: "vertical", border: true, padding: 2, sampleWidth: 13, fontSize: 2.8,
      strokeLevel: 0, strokeWidth: 0.6,
    };
  }
  if (c.tool === "PEDIGREE") {
    return {
      type: "pedigree", x: -12, y: -9, w: 24, h: 18,
      gen2Kids: 2, gen3Kids: 0, gen3Parent: 0, symbolRadius: 3,
      showNumbers: false, affected: "3", affectedFill: "hatch", carrier: "",
      strokeLevel: 0, strokeWidth: 0.6,
    };
  }
  /* 화학 부품 10종 — 팔레트 아이콘. 16px 안에서 읽히도록 글자·부속을 덜어 낸다.
   * (docs/CHEM_PARTS_SPEC.md) props 를 마지막에 얹어 팔레트가 고른 갈래가 이긴다. */
  if (CHEM_ICON_BOX[c.tool]) {
    const b = CHEM_ICON_BOX[c.tool];
    return {
      type: b.type,
      x: -b.w / 2, y: -b.h / 2, w: b.w, h: b.h, rotation: 0,
      strokeLevel: 0, strokeWidth: 0.6,
      ...b.props,
      ...(c.props || {}),
      // 아이콘에서는 글자를 빼거나 줄인다 — 16px에서 뭉개져 검은 덩어리로 보인다.
      ...(b.iconOnly || {}),
    };
  }
  if (c.tool === "SOLID3D") {
    const b = SOLID3D_ICON_BOX[id] || { w: 20, h: 18, depth: 6 };
    // _outline: 면을 비운 윤곽선 모드. monochrome()이 fill을 currentColor로 바꾸기 때문에
    // 면을 칠한 채로는 16px 아이콘이 새까만 덩어리가 된다(render/solid3d.js 참고).
    return {
      type: "solid3d", kind: c.kind,
      x: -b.w / 2, y: -b.h / 2, w: b.w, h: b.h, rotation: 0,
      depth: b.depth, projAngle: 50, shade: 2, axis: "v",
      strokeLevel: 0, strokeWidth: 0.6, showLabel: false, _outline: true,
      // 좌표축 아이콘은 16px 안에서 글자가 뭉개지므로 축 이름을 뺀다(선만 남긴다).
      axisLabels: false,
      // 팔레트가 지정한 갈래(예: 평면 위 좌표축의 variant)를 얹는다 — 안 얹으면
      // 두 버튼이 똑같은 아이콘으로 보인다.
      ...(c.props || {}),
    };
  }
  /* ----- 지구과학 부품 아이콘 표본 (docs/EARTH_PARTS_SPEC.md) -----
   * 전용 타입이 없어 곡선·꺾은선·선·사각형 위에 필드를 얹은 것들이라, 아이콘도
   * 같은 타입의 표본에 그 필드를 그대로 얹어 만든다. 16px에서 알아보게 기호는
   * 크고 성기게(frontGap↑ frontSize↑), 값 라벨은 짧게 둔다. */
  if (c.tool === "C") {
    return {
      type: "curve",
      points: [{ x: -13, y: 4 }, { x: -2, y: -4 }, { x: 13, y: 3 }],
      closed: false, strokeLevel: 0, strokeWidth: 0.8,
      ...(c.props || {}),
      // 아이콘용 덮어쓰기 — 실제 기본값(간격 7mm)이면 16px 안에 기호가 뭉친다.
      ...(c.props && c.props.frontKind ? { frontGap: 11, frontSize: 5 } : {}),
      ...(c.props && c.props.inlineLabel ? { inlineLabel: "10", inlineLabelSize: 5 } : {}),
    };
  }
  if (c.tool === "P" && c.props && c.props.markerOnly) {
    return {
      type: "polyline",
      points: [{ x: -11, y: 5 }, { x: -4, y: -5 }, { x: 3, y: 2 }, { x: 11, y: -6 }],
      strokeLevel: 0, strokeWidth: 0.5, markerSize: 5,
      ...(c.props || {}),
    };
  }
  if (c.tool === "L" && c.props && c.props.lineMode === "scaleBar") {
    return {
      type: "line", p1: { x: -12, y: 3 }, p2: { x: 12, y: 3 },
      strokeLevel: 0, strokeWidth: 0.8,
      ...(c.props || {}),
      dimensionLabel: "",   // 16px에서 글자는 뭉개진다 — 막대 모양만 보인다
    };
  }
  if (c.tool === "RECT" && c.props && c.props.fillStyle) {
    return {
      type: "rect", x: -11, y: -8, w: 22, h: 16, rotation: 0,
      strokeLevel: 0, strokeWidth: 0.6, fillNone: false,
      // 무늬 타일을 키워야 16px 안에서 벽돌·v·+·줄이 구분된다(기본 3.2mm면 뭉갠다).
      fillTile: 6,
      ...(c.props || {}),
    };
  }
  return null;
}

// Flatten any rendered element tree to one currentColor silhouette (so it inherits
// the button's text color and turns white on the active/blue state).
function monochrome(node) {
  if (node.nodeType !== 1) return;
  const stroke = node.getAttribute("stroke");
  if (stroke && stroke !== "none" && stroke !== "transparent") node.setAttribute("stroke", "currentColor");
  const fill = node.getAttribute("fill");
  if (fill && fill !== "none" && fill !== "transparent") node.setAttribute("fill", "currentColor");
  for (const child of node.children) monochrome(child);
}

// Force a uniform stroke-width across the tree (in world units) — normalizes the
// on-screen weight regardless of how big the sample object is.
function setStrokeWidth(node, sw) {
  if (node.nodeType !== 1) return;
  if (node.hasAttribute("stroke-width")) node.setAttribute("stroke-width", sw);
  for (const child of node.children) setStrokeWidth(child, sw);
}

export function buildSymbolIcon(id, def = TEMPLATES[id]) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "tool-ico");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  /* 팔레트 전용 아이콘 정본(js/tool-icons.js)이 있으면 그것을 쓴다. 렌더러 출력을 축소한
   * 자동 아이콘은 22px에서 뭉개져 무슨 도구인지 안 보였다(2026-07-27 교사 지적).
   * 여기 없는 id만 아래의 개별 분기 → svgAsset → 렌더러 자동 생성 순으로 넘어간다. */
  if (TOOL_ICONS[id]) {
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.dataset.fixedIcon = "1";   // sizeIconViewBox가 재단·굵기변경을 건너뛰게 한다
    svg.innerHTML = TOOL_ICONS[id];
    return svg;
  }

  if (id === "anglearc") {
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.innerHTML =
      '<path d="M4 16 L4 5 M4 16 L15 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M8 16 A4 4 0 0 0 4 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>' +
      '<text x="8.8" y="12.8" font-size="6" font-family="serif" fill="currentColor">θ</text>';
    return svg;
  }

  if (id === "funcgraph") {
    // A curve rising over a small L-shaped axis pair (represents "함수 입력").
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.innerHTML =
      '<path d="M3.5 3 L3.5 16.5 L17 16.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M4 14 Q9 3.5 17 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';
    return svg;
  }

  if (id === "graph") {
    // ㄴ자 축 + 점선 격자(빈 좌표 틀 상징).
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.innerHTML =
      '<path d="M4 3 L4 16 L17 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<g stroke="currentColor" stroke-width="0.7" stroke-dasharray="1.4 1" opacity="0.75">' +
      '<line x1="8.3" y1="6" x2="8.3" y2="16"/><line x1="12.6" y1="6" x2="12.6" y2="16"/>' +
      '<line x1="4" y1="11.8" x2="17" y2="11.8"/><line x1="4" y1="7.6" x2="17" y2="7.6"/></g>';
    return svg;
  }

  if (id === "labeler") {
    // A short leader line from a graph anchor up to an upright circled letter.
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.innerHTML =
      '<path d="M3 17 L10 8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' +
      '<circle cx="3" cy="17" r="1.4" fill="currentColor"/>' +
      '<text x="13.5" y="8.5" font-size="9" font-family="serif" text-anchor="middle" dominant-baseline="middle" fill="currentColor">㉠</text>';
    return svg;
  }

  /* pulley_ceiling · ef_* · mag_* · stw_* · spring · pendulum · cart 의 손그림 아이콘은
   * 2026-07-27 팔레트 아이콘 전면 개편 때 js/tool-icons.js 로 옮겼다(위의 TOOL_ICONS 분기).
   * 여기 남은 분기는 tool-icons.js 가 다루지 않는 공통 도구 4종뿐이다. */


  // Generic svgAsset icon: any new SVG_ASSETS entry (see js/svg-assets.js) whose
  // TEMPLATES id matches an asset id renders its OWN artwork as the button icon
  // automatically — no per-asset branch needed here unless it looks bad (add a
  // hand-drawn override above, like "cart", only when that happens).
  const asset = getSvgAsset(id);
  if (asset) {
    svg.setAttribute("viewBox", `0 0 ${asset.naturalWidth} ${asset.naturalHeight}`);
    svg.innerHTML = `<image href="${asset.dataUri}" x="0" y="0" width="${asset.naturalWidth}" height="${asset.naturalHeight}" preserveAspectRatio="xMidYMid meet"/>`;
    return svg;
  }

  const obj = iconSampleObject(id, def);
  if (!obj) return svg;
  const el = renderObject(obj);   // EXISTING renderer — icon stays in sync with the real shape
  if (!el) return svg;
  monochrome(el);
  svg.appendChild(el);
  return svg;                     // viewBox + stroke set after it goes live (needs getBBox)
}

// viewBox needs the svg LIVE in the DOM (getBBox). Fit it to the content and give
// every icon the same on-screen stroke weight.
export function sizeIconViewBox(svg) {
  /* 팔레트 전용 아이콘(js/tool-icons.js)은 손대지 않는다. 이 함수는 렌더러에서 뽑아 온
   * 아이콘을 버튼에 맞게 재단하려고 만든 것이라, 20×20으로 크기·여백·선 굵기를 이미
   * 맞춰 둔 아이콘에 적용하면 ① viewBox를 내용에 딱 붙게 잘라 서로 다른 배율로 커지고
   * ② setStrokeWidth가 1.5/1.05/0.8 위계를 한 값으로 덮어쓴다. */
  if (svg.dataset.fixedIcon) return;
  const g = svg.firstElementChild;
  if (!g) return;
  let bb;
  try { bb = g.getBBox(); } catch { return; }
  if (!bb || (bb.width <= 0 && bb.height <= 0)) return;
  const pad = Math.max(bb.width, bb.height) * 0.14 + 0.6;
  const vbW = bb.width + pad * 2, vbH = bb.height + pad * 2;
  svg.setAttribute("viewBox", `${bb.x - pad} ${bb.y - pad} ${vbW} ${vbH}`);
  const scale = ICON_PX / Math.max(vbW, vbH);   // uniform-fit (preserveAspectRatio meet)
  setStrokeWidth(g, ICON_STROKE_PX / scale);
}

// Build one registry symbol button (UNIQUE data-symbol id) + queue its icon for sizing.
/* 통합 버튼의 갈래 팝오버. 공통 도구의 .tool-chooser 마크업·CSS를 그대로 쓴다. */
function makeGroupButton(id, def, pending) {
  const btn = document.createElement("button");
  btn.className = "tool-btn";
  btn.type = "button";
  btn.dataset.symbolGroup = id;
  btn.title = def.label;
  btn.setAttribute("aria-label", def.label);
  btn.setAttribute("aria-haspopup", "true");
  const kbd = document.createElement("kbd");
  const first = def.variants[0];
  const icon = buildSymbolIcon(first, TEMPLATES[first]);
  kbd.appendChild(icon);
  pending.push(icon);
  btn.appendChild(kbd);

  const pop = document.createElement("div");
  pop.className = "tool-chooser";
  pop.hidden = true;
  pop.setAttribute("role", "menu");
  pop.setAttribute("aria-label", def.label + " 갈래 선택");
  def.variants.forEach((vid) => {
    const v = TEMPLATES[vid];
    if (!v) return;
    const opt = document.createElement("button");
    opt.className = "tool-chooser-opt";
    opt.type = "button";
    opt.dataset.symbol = vid;              // 기존 클릭 위임이 그대로 배치를 arm 한다
    opt.setAttribute("role", "menuitem");
    // 아이콘은 반드시 .chooser-ico로 감싼다 — CSS(.tool-chooser-opt .chooser-ico svg)가
    // 22px로 묶어 주는 규칙이 이 클래스에 걸려 있다. 안 감싸면 svg가 제 크기대로 커져
    // 항목 하나가 100px 가까이 된다(갈래 2~3개짜리 그룹에서는 안 드러났던 문제).
    const ic = buildSymbolIcon(vid, v);
    pending.push(ic);
    const icoWrap = document.createElement("span");
    icoWrap.className = "chooser-ico";
    icoWrap.appendChild(ic);
    opt.appendChild(icoWrap);
    const t = document.createElement("span");
    t.className = "chooser-txt";
    const tb = document.createElement("b");
    tb.textContent = v.label;
    t.appendChild(tb);
    opt.appendChild(t);
    // 팝오버는 #tool-list 밖(body)에 붙으므로 패널의 클릭 위임이 닿지 않는다 → 직접 배선.
    opt.addEventListener("click", () => activateTemplate(vid));
    pop.appendChild(opt);
  });
  document.body.appendChild(pop);

  let sized = false;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = pop.hidden;
    document.querySelectorAll(".tool-chooser").forEach((c) => { c.hidden = true; });
    if (!willOpen) return;
    pop.hidden = false;
    // 팝오버는 hidden인 동안 getBBox가 0이라 아이콘 viewBox를 못 잡는다(pending 사이징이
    // 이 시점엔 실패한다) → 처음 보이게 된 뒤 한 번 맞춘다.
    if (!sized) { pop.querySelectorAll("svg.tool-ico").forEach((s) => sizeIconViewBox(s)); sized = true; }
    const r = btn.getBoundingClientRect();
    // 버튼 오른쪽이 아니라 **패널 오른쪽 끝** 기준으로 붙인다 — 안쪽 열 버튼에서 열면
    // 팝오버가 팔레트 위로 올라타 아이콘을 덮었다.
    const panel = btn.closest(".panel-left");
    const anchorRight = panel ? panel.getBoundingClientRect().right : r.right;
    pop.style.left = Math.round(Math.max(anchorRight, r.right) + 6) + "px";
    // 화면 아래로 넘치면 위로 끌어올린다 — 갈래가 많은 그룹(입체 11종)은 그냥 두면 잘린다.
    const top = Math.min(Math.max(r.top, 8), Math.max(window.innerHeight - pop.offsetHeight - 8, 8));
    pop.style.top = Math.round(top) + "px";
  });
  pop.addEventListener("click", () => { pop.hidden = true; });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".tool-chooser") && !e.target.closest("[data-symbol-group]")) pop.hidden = true;
  });
  return btn;
}

function makeSymbolButton(id, def, pending) {
  if (def.kind === "group") return makeGroupButton(id, def, pending);
  const btn = document.createElement("button");
  btn.className = "tool-btn";             // square icon button (reuses active styling)
  btn.type = "button";
  btn.dataset.symbol = id;               // UNIQUE per-object id — drives the single-highlight fix
  btn.title = SHORTCUT_LABELS[id] ? `${def.label} (${SHORTCUT_LABELS[id]})` : def.label;
  btn.setAttribute("aria-label", btn.title); // keep tooltip + a11y label consistent

  const kbd = document.createElement("kbd");
  const label = CIRCUIT_PALETTE_LABELS[id];
  if (label) {
    const letter = document.createElement("span");
    letter.className = "tool-letter";
    letter.textContent = label;
    kbd.appendChild(letter);
  } else {
    const icon = buildSymbolIcon(id, def);
    kbd.appendChild(icon);
    pending.push(icon);
  }
  btn.appendChild(kbd);
  return btn;
}

/* 과목별 파트 아코디언(subject-objects.js)이 카테고리 심볼 버튼을 채울 때 사용.
 * 반환: 만든 버튼 수. 아이콘 svg들은 sizer 배열로 넘겨 '보이게 된 뒤' 크기를 맞춘다
 * (접힌 아코디언 안에서는 getBBox가 0이라 즉시 사이징 불가 → 첫 펼침 때 호출). */
export function renderSymbolsForCategories(container, categories, sizer) {
  // hidden 항목은 팔레트에서만 뺀다 — 레지스트리에는 남아 있어 오브젝트 검색(Ctrl+F)·
  // 커맨드 팔레트·저장파일 호환은 그대로다.
  const ids = Object.keys(TEMPLATES).filter((id) => categories.includes(TEMPLATES[id].category) && !TEMPLATES[id].hidden);
  for (const id of ids) container.appendChild(makeSymbolButton(id, TEMPLATES[id], sizer));
  return ids.length;
}

function renderPanel() {
  const host = document.getElementById("symbol-sections");
  if (!host) return;
  host.replaceChildren();

  const pending = []; // icon svgs to size once they are live in the DOM

  // 공통(category:"공통") 심볼(라벨러/함수/점/각도호/직각)은 index.html '공통 도구'
  // 그리드에 하드코딩 버튼(data-symbol)으로 직접 배치했으므로, 여기서는 팔레트에
  // 다시 그리지 않는다(중복 방지). 레지스트리 항목 자체는 검색/instantiate/키보드
  // 단축키가 참조하므로 삭제하지 않는다.
  for (const cat of CATEGORY_ORDER) {
    if (cat === "공통") continue; // 하드코딩 버튼으로 상단 그리드에 이미 존재
    const ids = Object.keys(TEMPLATES).filter((id) => TEMPLATES[id].category === cat && !TEMPLATES[id].hidden);
    if (!ids.length) continue;

    const section = document.createElement("div");
    section.className = "tool-section";

    const header = document.createElement("div");
    header.className = "tool-section-header";
    header.innerHTML = `${cat} <span class="toggle-icon">▾</span>`;

    const body = document.createElement("div");
    body.className = "tool-section-body";   // 3-col icon grid (same as 공통 도구)

    for (const id of ids) {
      body.appendChild(makeSymbolButton(id, TEMPLATES[id], pending));
    }

    section.appendChild(header);
    section.appendChild(body);
    host.appendChild(section);
  }

  // Now that the sections are live, fit each icon's viewBox to its content.
  for (const svg of pending) sizeIconViewBox(svg);
}

/* ----- click → creation (functionally identical to the old per-button wiring) ----- */
export function activateTemplate(symbolId) {
  const def = TEMPLATES[symbolId];
  if (!def) return;
  if (def.kind === "atomic") {
    // Drop one object at the current view center, like before.
    const vb = state.get().viewBox;
    const center = { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 };
    instantiate(symbolId, center);
  } else if (def.kind === "funcinput") {
    // 함수 입력: 통합 그래프 모달로 일원화(입구 하나). 좌표 탭 먼저.
    openGraphModal();
  } else if (def.kind === "graph") {
    // 그래프: open the coordinate-frame config modal (형태·라벨·격자·원점 + 삽입).
    openGraphModal();
  } else {
    // shape → record the variant + arm the shared placement tool (tools.js).
    const c = def.create || {};
    armSymbol(symbolId, c.tool, c.element ?? c.kind, c.props);
  }
}

/* ===== WIRE THE LEFT-PANEL LIBRARY ===== */
export function initTemplates(svg) {
  renderPanel();
  const panel = document.getElementById("tool-list");
  if (!panel) return;
  panel.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-symbol]");
    if (!btn) return;
    activateTemplate(btn.dataset.symbol);
  });
}
