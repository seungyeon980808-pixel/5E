/* ===== CODE-NATIVE EXAM MOTIF CATALOG =====================================
 *
 * Deterministic, text-free assemblies for the gaps found by the 2026-08-09
 * exam-library audit.  A motif expands to the deliberately small fast-scene
 * contract and is then compiled by ai-scene-fastpath.js into ordinary 5E
 * objects.  This file does not touch the DOM or application state.
 *
 * Important scope boundary: these are geometry scaffolds, not semantic labels.
 * They never emit text, numbers, arrows or leader lines. Generic coastlines
 * remain schematic, while the verified-map shortcut exposes only four pinned
 * physical coastline datasets and never political boundaries.
 */

import { FAST_SCENE_SCHEMA_ID, compileFastScene } from "./ai-scene-fastpath.js";
import { compileIllustrationAsset, createIllustrationAssetScene } from "./ai-illustration-assets.js";
import { compileVerifiedMap, createVerifiedMapScene } from "./ai-map-assets.js";
import { pulleyAnchors, pulleyGeom } from "./render/optics-apparatus.js";

export const MOTIF_CATALOG_VERSION = "5e-motif-catalog@5";

const MOTIFS = Object.freeze({
  panel_flow: Object.freeze({
    id: "panel_flow",
    title: "Panel flow scaffold",
    auditOccurrences: 22,
    coverage: "vector-safe",
    note: "Uniform chemistry/process panels joined by plain transition lines; arrows and captions are left for 5E editing.",
  }),
  dual_axis_plot: Object.freeze({
    id: "dual_axis_plot",
    title: "Dual-axis plot scaffold",
    auditOccurrences: 9,
    coverage: "vector-safe",
    note: "Left and right y axes share one plotting rectangle. Tick marks have no numeric labels.",
  }),
  orthogonal_wiring: Object.freeze({
    id: "orthogonal_wiring",
    title: "Orthogonal wiring scaffold",
    auditOccurrences: 5,
    coverage: "vector-safe-shared",
    note: "Axis-aligned circuit routes with explicit topology and optional unlabeled terminal nodes.",
  }),
  diagonal_wiring: Object.freeze({
    id: "diagonal_wiring",
    title: "Diagonal wiring scaffold",
    auditOccurrences: 5,
    coverage: "vector-safe-shared",
    note: "Direct or explicitly routed diagonal circuit paths with optional unlabeled terminal nodes.",
  }),
  contour_bundle: Object.freeze({
    id: "contour_bundle",
    title: "Contour bundle scaffold",
    auditOccurrences: 6,
    coverage: "vector-safe",
    note: "Deterministic nested or parallel isolines. Values and inline labels are intentionally omitted.",
  }),
  coastline_schematic: Object.freeze({
    id: "coastline_schematic",
    title: "Generic coastline scaffold",
    auditOccurrences: 0,
    coverage: "schematic-only",
    note: "Generic land-water boundary only; never substitutes for Korea, East Asia, Pacific or world-map outlines.",
    requiresIntent: "schematic",
  }),
  verified_map_outline: Object.freeze({
    id: "verified_map_outline",
    title: "Verified physical coastline outline",
    auditOccurrences: 14,
    coverage: "verified-code-native",
    variants: Object.freeze(["world", "pacific", "east_asia", "korean_peninsula"]),
    note: "Pinned Natural Earth physical coastlines only. No political borders, place names, labels, arrows or in-scene overlays.",
  }),
  student_trio_seated_dialogue: Object.freeze({
    id: "student_trio_seated_dialogue",
    title: "Seated student trio illustration",
    auditOccurrences: 13,
    blankSpeechBubbleAuditOccurrences: 31,
    coverage: "strict-code-native",
    note: "Original diagram-only vector assembly. Blank speech-bubble outlines are opt-in and require explicit source/request evidence.",
  }),
  spacecraft_flat_shell: Object.freeze({
    id: "spacecraft_flat_shell",
    title: "Composable flat spacecraft illustration",
    auditOccurrences: 18,
    coverage: "strict-code-native",
    note: "Original shell, window, occupant and closed-enum device layers; all optional content defaults to none.",
  }),
  simple_series_circuit: Object.freeze({
    id: "simple_series_circuit",
    title: "Four-part rectangular series circuit",
    auditElementEvidence: Object.freeze({ circuitPanels: 70, battery: 50, resistor: 45, switch: 31, lamp: 4, batteryResistorSwitchPanels: 16, exactFourPartPanels: 0 }),
    repeatabilityFixtureOccurrences: 1,
    coverage: "strict-code-native",
    note: "Fixed dc-source / switch / resistor / lamp series topology from the repeatability fixture. The switch state must be explicit.",
  }),
  fixed_pulley_spring_loads: Object.freeze({
    id: "fixed_pulley_spring_loads",
    title: "Fixed pulley with spring and matching blank load shapes",
    auditElementEvidence: Object.freeze({ block: 112, hangingMass: 42, spring: 17, pulleyMassPanels: 19, springBlockPanels: 15, exactPulleySpringPanels: 1 }),
    repeatabilityFixtureOccurrences: 1,
    coverage: "strict-code-native",
    note: "One fixed ceiling pulley, one continuous rope, one plain load and one spring-plus-matching-shape branch; no mass value, force arrow or label is inferred.",
  }),
  lens_mirror_screen_bench: Object.freeze({
    id: "lens_mirror_screen_bench",
    title: "Lens, plane mirror and screen alignment",
    auditElementEvidence: Object.freeze({ lens: 6, mirror: 1, screen: 7, opticalRailPanels: 3, exactThreePartPanels: 0 }),
    repeatabilityFixtureOccurrences: 1,
    coverage: "strict-code-native",
    note: "Exactly one explicit lens, one plane mirror at an explicit angle and one screen; rays and axis arrows are omitted.",
  }),
  vessel_particle_comparison: Object.freeze({
    id: "vessel_particle_comparison",
    title: "Vessel and particle-state comparison",
    auditElementEvidence: Object.freeze({ vessel: 211, liquidZone: 77, exactComparisonCandidates: 3 }),
    repeatabilityFixtureOccurrences: 1,
    coverage: "strict-code-native",
    note: "One explicit vessel state beside one explicit particle box. Motion is always none and every scientific state option is required.",
  }),
  logistic_population_graph: Object.freeze({
    id: "logistic_population_graph",
    title: "Unlabeled logistic population curve",
    auditOccurrences: 2,
    auditElementEvidence: Object.freeze({ graphPanels: 314, axis: 182, curve: 169, populationTag: 17 }),
    repeatabilityFixtureOccurrences: 1,
    coverage: "fixture-locked-code-native",
    note: "Generic monotone S-curve only. It does not infer measured values, units, carrying-capacity labels or an organism context.",
  }),
});

export const AI_MOTIF_CATALOG = MOTIFS;
export const AI_MOTIF_IDS = Object.freeze(Object.keys(MOTIFS));

export const AI_MOTIF_PROMPT_REFERENCE = `
Audited or fixture-locked high-level motif shortcut (use as the sole element only):
{"type":"motif","motif":"MOTIF_ID","options":{}}
The scene root already owns the artboard. NEVER repeat artboard inside motif options. Put artboard dimensions at the scene root only, and keep motif options limited to the fields shown below.
- panel_flow: {panelCount:2..5,panelType:"vessel|particlebox|box",vesselKind:"beaker|flask|test_tube|cylinder_graduated|funnel|u_tube|burette|round|box",states:[{liquid:0..1,hasPiston:boolean,pistonAt:0..1,hasFix:boolean,hasWeight:boolean,hasStopcock:boolean,hasTicks:boolean,state:"solid|liquid|gas",count:1..100,mix:boolean,tone:"white|gray|none"}]}; for particlebox panels always set state and count on every state entry.
- dual_axis_plot: {plotBox:[x,y,w,h],xRange:[min,max],leftRange:[min,max],rightRange:[min,max],tickCount:2..12,leftSeries:[{points:[[x,y],...],style:"straight|smooth"}],rightSeries:[...]}
- orthogonal_wiring: {nodes:[{id:"node",at:[x,y]}],edges:[{from:"node",to:"node",bend:"horizontal-first|vertical-first",via:[[x,y],...]}],showNodes:boolean}
- diagonal_wiring: {nodes:[{id:"node",at:[x,y]}],edges:[{from:"node",to:"node",via:[[x,y],...]}],showNodes:boolean}
- contour_bundle: {box:[x,y,w,h],count:2..12,variant:"nested|parallel"}
- coastline_schematic: {intent:"schematic",variant:"peninsula|bay|islands"}; never use for named or exact geography.
- verified_map_outline: {variant:"world|pacific|east_asia|korean_peninsula",fillLand:false,padding?:number,strokeWidth?:number}; variant is mandatory. This motif contains physical coastlines only: no political boundaries, place names, labels, symbols, leaders or arrows. Use it as the only motif/element and return the map alone; add scientific overlays later in the 5E editor.
- student_trio_seated_dialogue: {tableShape:"rect|round",speechBubbles:"none|three_blank",speechBubbleEvidence:"source|request",bubbleTails:["down_left|down|down_right",... exactly 3]}; blank bubbles are allowed only when the source/request explicitly contains speech bubbles.
- spacecraft_flat_shell: {proportions:"compact|long",facing:"left|right",window:"none|single|wide",occupant:"none|seated",device:"none|point_source|detector_box|plane_mirror",deviceSlot:"rear|center|front"}; window, occupant and device default to none and must never be inferred.
- simple_series_circuit: {switchState:"open|closed"}; exact fixed topology only: dc source on the left, switch on top, resistor on the right and lamp on the bottom. switchState is mandatory. Exact open-switch options: {"switchState":"open"}.
- fixed_pulley_spring_loads: {springTurns?:2..40,springRadius?:0.5..6}; exact assembly only: one ceiling-fixed pulley, matching blank rectangular load shapes, left direct rope branch and right spring-then-load branch. Matching appearance does not assert equal mass. Default exact options: {}.
- lens_mirror_screen_bench: {lensKind:"convex_lens",mirrorRotation:45}; both exact fixture fields are mandatory. Do not generalize to another lens, angle, ray construction, axis or object arrow.
- vessel_particle_comparison: {vesselKind:"beaker",liquid:0.45,particleState:"gas",particleCount:16,particleShape:"circle",mix:false}; every exact fixture field is mandatory, no alternative value is accepted, and particle motion is always none.
- logistic_population_graph: {}; one fixed, visible, generic unlabeled S-curve only, with no adjustable data, grid, tick labels, arrows, units or carrying-capacity line.
The shortcut expands locally to ordinary fast-scene elements. It is diagram-only and never emits text, numbers, labels, leader lines or arrows.
`;

const VESSEL_KINDS = new Set([
  "beaker", "flask", "test_tube", "cylinder_graduated", "funnel",
  "u_tube", "burette", "round", "box",
]);
const PANEL_TYPES = new Set(["vessel", "particlebox", "box"]);
const CONTOUR_VARIANTS = new Set(["nested", "parallel"]);
const COAST_VARIANTS = new Set(["peninsula", "bay", "islands"]);
const SWITCH_STATES = new Set(["open", "closed"]);
const SAFE_LENS_KINDS = new Set(["convex_lens"]);

function finite(value, fallback, name) {
  const selected = value == null ? fallback : Number(value);
  if (!Number.isFinite(selected)) throw new TypeError(`${name} must be a finite number.`);
  return selected;
}

function bounded(value, fallback, name, min, max, integer = false) {
  let selected = finite(value, fallback, name);
  if (integer) selected = Math.round(selected);
  if (selected < min || selected > max) throw new RangeError(`${name} must be between ${min} and ${max}.`);
  return selected;
}

function enumOption(value, fallback, allowed, name) {
  const selected = value == null ? fallback : String(value);
  if (!allowed.has(selected)) throw new RangeError(`${name} must be one of: ${Array.from(allowed).join(", ")}.`);
  return selected;
}

function point(value, fallback, name) {
  const selected = value == null ? fallback : value;
  if (!Array.isArray(selected) || selected.length !== 2) throw new TypeError(`${name} must be [x,y].`);
  return [finite(selected[0], 0, `${name}[0]`), finite(selected[1], 0, `${name}[1]`)];
}

function range(value, fallback, name) {
  const selected = value == null ? fallback : value;
  if (!Array.isArray(selected) || selected.length !== 2) throw new TypeError(`${name} must be [min,max].`);
  const lo = finite(selected[0], fallback[0], `${name}[0]`);
  const hi = finite(selected[1], fallback[1], `${name}[1]`);
  if (hi <= lo) throw new RangeError(`${name} maximum must be greater than minimum.`);
  return [lo, hi];
}

function box(value, fallback, name = "box") {
  const selected = value == null ? fallback : value;
  if (!Array.isArray(selected) || selected.length !== 4) throw new TypeError(`${name} must be [x,y,w,h].`);
  const out = selected.map((v, i) => finite(v, fallback[i], `${name}[${i}]`));
  if (out[2] <= 0 || out[3] <= 0) throw new RangeError(`${name} width and height must be positive.`);
  return out;
}

function artboard(options, fallback) {
  const raw = options.artboard || fallback;
  const w = bounded(raw.w, fallback.w, "artboard.w", 20, 500);
  const h = bounded(raw.h, fallback.h, "artboard.h", 20, 500);
  return { w, h };
}

function baseScene(board, elements) {
  return { schema: FAST_SCENE_SCHEMA_ID, mode: "diagram", artboard: board, elements };
}

function strictOptions(options, allowed, id) {
  const extra = Object.keys(options).filter((key) => !allowed.has(key));
  if (extra.length) throw new RangeError(`${id} does not allow option(s): ${extra.join(", ")}.`);
}

function strictMotifBoard(options, id, fallback, minimum) {
  if (options.artboard != null) {
    if (!options.artboard || typeof options.artboard !== "object" || Array.isArray(options.artboard)) {
      throw new TypeError(`${id}.artboard must be {w,h}.`);
    }
    const extra = Object.keys(options.artboard).filter((key) => key !== "w" && key !== "h");
    if (extra.length) throw new RangeError(`${id}.artboard does not allow field(s): ${extra.join(", ")}.`);
  }
  const board = artboard(options, fallback);
  if (board.w < minimum.w || board.h < minimum.h) {
    throw new RangeError(`${id}.artboard must be at least ${minimum.w} x ${minimum.h} mm.`);
  }
  return board;
}

function requiredOption(options, key, id) {
  if (!Object.hasOwn(options, key)) throw new TypeError(`${id}.${key} is required.`);
  return options[key];
}

function scaledGeometry(board) {
  const scale = Math.min(board.w / 160, board.h / 90);
  return {
    scale,
    p(x, y) { return [x * scale, y * scale]; },
    b(x, y, w, h) { return [x * scale, y * scale, w * scale, h * scale]; },
  };
}

function simpleSeriesCircuit(options) {
  const id = "simple_series_circuit";
  strictOptions(options, new Set(["switchState", "artboard"]), id);
  const switchState = enumOption(requiredOption(options, "switchState", id), null, SWITCH_STATES, `${id}.switchState`);
  const board = strictMotifBoard(options, id, { w: 160, h: 90 }, { w: 120, h: 70 });
  const { p } = scaledGeometry(board);

  const left = -58, right = 58, top = -28, bottom = 28;
  const verticalGap = 11, horizontalGap = 18;
  const elements = [
    { type: "circuit", element: "dc_source", from: p(left, -verticalGap), to: p(left, verticalGap) },
    { type: "circuit", element: "switch", from: p(-horizontalGap, top), to: p(horizontalGap, top), closed: switchState === "closed" },
    { type: "circuit", element: "resistor", from: p(right, -verticalGap), to: p(right, verticalGap) },
    { type: "circuit", element: "lamp", from: p(-horizontalGap, bottom), to: p(horizontalGap, bottom) },
    { type: "polyline", points: [p(left, -verticalGap), p(left, top), p(-horizontalGap, top)], closed: false, fill: false, arrow: "none" },
    { type: "polyline", points: [p(horizontalGap, top), p(right, top), p(right, -verticalGap)], closed: false, fill: false, arrow: "none" },
    { type: "polyline", points: [p(right, verticalGap), p(right, bottom), p(horizontalGap, bottom)], closed: false, fill: false, arrow: "none" },
    { type: "polyline", points: [p(-horizontalGap, bottom), p(left, bottom), p(left, verticalGap)], closed: false, fill: false, arrow: "none" },
  ];
  return baseScene(board, elements);
}

function ropeArc(cx, cy, radius) {
  const points = [];
  for (let i = 0; i <= 12; i += 1) {
    const angle = Math.PI + (Math.PI * i) / 12;
    points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  return points;
}

function fixedPulleySpringLoads(options) {
  const id = "fixed_pulley_spring_loads";
  strictOptions(options, new Set(["springTurns", "springRadius", "artboard"]), id);
  const springTurns = bounded(options.springTurns, 12, `${id}.springTurns`, 2, 40, true);
  const springRadius = bounded(options.springRadius, 2.4, `${id}.springRadius`, 0.5, 6);
  const board = strictMotifBoard(options, id, { w: 160, h: 90 }, { w: 120, h: 75 });
  const { scale, b } = scaledGeometry(board);
  const pulleyBox = b(-12, -38, 24, 24);
  const pulleyObject = {
    x: pulleyBox[0], y: pulleyBox[1], w: pulleyBox[2], h: pulleyBox[3], variant: "ceiling",
  };
  const geometry = pulleyGeom(pulleyObject);
  const anchors = pulleyAnchors(pulleyObject);
  const leftAnchor = anchors.find((anchor) => anchor.role === "rimLeft");
  const rightAnchor = anchors.find((anchor) => anchor.role === "rimRight");
  const blockWidth = 20 * scale, blockHeight = 16 * scale;
  const leftBlockY = 8 * scale, rightBlockY = 24 * scale;
  const leftLoadBox = [leftAnchor.x - blockWidth / 2, leftBlockY, blockWidth, blockHeight];
  const rightLoadBox = [rightAnchor.x - blockWidth / 2, rightBlockY, blockWidth, blockHeight];
  const springTop = [rightAnchor.x, -10 * scale];

  return baseScene(board, [
    { type: "pulley", box: pulleyBox, variant: "ceiling" },
    { type: "curve", points: ropeArc(geometry.cx, geometry.cy, geometry.r), closed: false, fill: false, arrow: "none" },
    { type: "line", from: [leftAnchor.x, leftAnchor.y], to: [leftAnchor.x, leftBlockY], arrow: "none" },
    { type: "line", from: [rightAnchor.x, rightAnchor.y], to: springTop, arrow: "none" },
    { type: "spring", from: springTop, to: [rightAnchor.x, rightBlockY], turns: springTurns, radius: springRadius * scale },
    { type: "rect", box: leftLoadBox, tone: "white" },
    { type: "rect", box: rightLoadBox, tone: "white" },
  ]);
}

function lensMirrorScreenBench(options) {
  const id = "lens_mirror_screen_bench";
  strictOptions(options, new Set(["lensKind", "mirrorRotation", "artboard"]), id);
  const lensKind = enumOption(requiredOption(options, "lensKind", id), null, SAFE_LENS_KINDS, `${id}.lensKind`);
  const mirrorRotation = finite(requiredOption(options, "mirrorRotation", id), null, `${id}.mirrorRotation`);
  if (mirrorRotation !== 45) throw new RangeError(`${id}.mirrorRotation must be exactly 45.`);
  const board = strictMotifBoard(options, id, { w: 160, h: 90 }, { w: 120, h: 70 });
  const { b } = scaledGeometry(board);
  return baseScene(board, [
    { type: "optics", opticsKind: lensKind, box: b(-56, -28, 16, 56), centerLine: "none" },
    { type: "optics", opticsKind: "plane_mirror", box: b(9, -18, 6, 36), rotation: mirrorRotation, centerLine: "none" },
    { type: "optics", opticsKind: "screen", box: b(50, -28, 5, 56), centerLine: "none" },
  ]);
}

function vesselParticleComparison(options) {
  const id = "vessel_particle_comparison";
  strictOptions(options, new Set([
    "vesselKind", "liquid", "particleState", "particleCount", "particleShape", "mix", "artboard",
  ]), id);
  const vesselKind = enumOption(requiredOption(options, "vesselKind", id), null, new Set(["beaker"]), `${id}.vesselKind`);
  const liquid = bounded(requiredOption(options, "liquid", id), null, `${id}.liquid`, 0, 1);
  if (liquid !== 0.45) throw new RangeError(`${id}.liquid must be exactly 0.45.`);
  const particleState = enumOption(requiredOption(options, "particleState", id), null, new Set(["gas"]), `${id}.particleState`);
  const particleCount = bounded(requiredOption(options, "particleCount", id), null, `${id}.particleCount`, 1, 100, true);
  if (particleCount !== 16) throw new RangeError(`${id}.particleCount must be exactly 16.`);
  const particleShape = enumOption(requiredOption(options, "particleShape", id), null, new Set(["circle"]), `${id}.particleShape`);
  const mix = requiredOption(options, "mix", id);
  if (typeof mix !== "boolean") throw new TypeError(`${id}.mix must be boolean.`);
  if (mix !== false) throw new RangeError(`${id}.mix must be false.`);
  const board = strictMotifBoard(options, id, { w: 160, h: 90 }, { w: 120, h: 70 });
  const { b } = scaledGeometry(board);
  return baseScene(board, [
    {
      type: "vessel", vesselKind, box: b(-55, -22, 26, 42), liquid,
      hasPiston: false, hasFix: false, hasWeight: false, hasStopcock: false, hasTicks: false,
    },
    {
      type: "particlebox", box: b(20, -18, 36, 36), state: particleState,
      count: particleCount, particleShape, mix, seed: 271, motion: "none",
    },
  ]);
}

function logisticPopulationGraph(options) {
  const id = "logistic_population_graph";
  strictOptions(options, new Set(["artboard"]), id);
  const xRange = [0, 10], yRange = [0, 10];
  const board = strictMotifBoard(options, id, { w: 160, h: 90 }, { w: 120, h: 70 });
  const { b } = scaledGeometry(board);
  const points = [
    [0, 0.5], [1, 0.7], [2, 1.1], [3, 2], [4, 4.2], [5, 6.5],
    [6, 8], [7, 8.8], [8, 9.2], [9, 9.4], [10, 9.5],
  ];
  return baseScene(board, [{
    type: "graph", box: b(-55, -30, 110, 60), xRange, yRange,
    axisVariant: "quadrant", grid: false, ticks: false, showNumbers: false, axisLabels: false,
    series: [{ style: "smooth", points }],
  }]);
}

function cleanState(raw) {
  const state = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    liquid: bounded(state.liquid, 0, "panelState.liquid", 0, 1),
    hasPiston: state.hasPiston === true,
    pistonAt: bounded(state.pistonAt, 0.5, "panelState.pistonAt", 0, 1),
    hasFix: state.hasFix === true,
    hasWeight: state.hasWeight === true,
    hasStopcock: state.hasStopcock === true,
    hasTicks: state.hasTicks === true,
    particleState: enumOption(state.state, "gas", new Set(["solid", "liquid", "gas"]), "panelState.state"),
    count: bounded(state.count, 12, "panelState.count", 1, 100, true),
    mix: state.mix === true,
    tone: enumOption(state.tone, "white", new Set(["white", "gray", "none"]), "panelState.tone"),
  };
}

function panelFlow(options) {
  const board = artboard(options, { w: 160, h: 72 });
  const count = bounded(options.panelCount, 3, "panelCount", 2, 5, true);
  const panelType = enumOption(options.panelType, "vessel", PANEL_TYPES, "panelType");
  const panelW = bounded(options.panelWidth, panelType === "vessel" ? 24 : 28, "panelWidth", 8, 60);
  const panelH = bounded(options.panelHeight, panelType === "vessel" ? 38 : 28, "panelHeight", 8, 60);
  const margin = bounded(options.margin, 12, "margin", 2, 50);
  const usable = board.w - margin * 2 - panelW * count;
  if (usable < 8 * (count - 1)) throw new RangeError("Artboard is too narrow for the requested panel count and size.");
  const gap = usable / (count - 1);
  const startX = -board.w / 2 + margin;
  const y = -panelH / 2;
  const vesselKind = enumOption(options.vesselKind, "beaker", VESSEL_KINDS, "vesselKind");
  const states = Array.isArray(options.states) ? options.states : [];
  const elements = [];

  for (let i = 0; i < count; i += 1) {
    const x = startX + i * (panelW + gap);
    const state = cleanState(states[i]);
    if (panelType === "vessel") {
      elements.push({
        type: "vessel", kind: vesselKind, box: [x, y, panelW, panelH],
        liquid: state.liquid, hasPiston: state.hasPiston,
        pistonAt: state.pistonAt, hasFix: state.hasFix,
        hasWeight: state.hasWeight, hasStopcock: state.hasStopcock,
        hasTicks: state.hasTicks,
      });
    } else if (panelType === "particlebox") {
      elements.push({
        type: "particlebox", box: [x, y, panelW, panelH], state: state.particleState,
        count: state.count, mix: state.mix, seed: 17 + i * 29, motion: "none",
      });
    } else {
      elements.push({ type: "rect", box: [x, y, panelW, panelH], tone: state.tone });
    }
    if (i < count - 1 && options.connectors !== false) {
      elements.push({
        type: "line",
        from: [x + panelW + Math.min(3, gap * 0.2), 0],
        to: [x + panelW + gap - Math.min(3, gap * 0.2), 0],
        arrow: "none",
      });
    }
  }
  return baseScene(board, elements);
}

function normalizeSeries(series, name) {
  if (series == null) return [];
  if (!Array.isArray(series)) throw new TypeError(`${name} must be an array.`);
  return series.map((entry, index) => {
    const raw = entry && typeof entry === "object" && !Array.isArray(entry) ? entry : { points: entry };
    if (!Array.isArray(raw.points) || raw.points.length < 2) throw new TypeError(`${name}[${index}].points needs at least two points.`);
    return {
      points: raw.points.map((p, pi) => point(p, [0, 0], `${name}[${index}].points[${pi}]`)),
      style: raw.style === "straight" ? "straight" : "smooth",
      dashed: raw.dashed === true,
      strokeWidth: bounded(raw.strokeWidth, 0.35, `${name}[${index}].strokeWidth`, 0.15, 0.8),
    };
  });
}

function dataToWorld(p, plot, xr, yr) {
  const [x, y, w, h] = plot;
  return [
    x + ((p[0] - xr[0]) / (xr[1] - xr[0])) * w,
    y + h - ((p[1] - yr[0]) / (yr[1] - yr[0])) * h,
  ];
}

function dualAxisPlot(options) {
  const board = artboard(options, { w: 160, h: 90 });
  const plot = box(options.plotBox, [-60, -30, 120, 60], "plotBox");
  const xRange = range(options.xRange, [0, 10], "xRange");
  const leftRange = range(options.leftRange, [0, 10], "leftRange");
  const rightRange = range(options.rightRange, [0, 100], "rightRange");
  const tickCount = bounded(options.tickCount, 5, "tickCount", 2, 12, true);
  const tickLength = bounded(options.tickLength, 1.7, "tickLength", 0.5, 5);
  const leftSeries = normalizeSeries(options.leftSeries, "leftSeries");
  const rightSeries = normalizeSeries(options.rightSeries, "rightSeries");
  const [x, y, w, h] = plot;
  const elements = [{
    type: "graph", box: plot, xRange, yRange: leftRange, axisVariant: "quadrant",
    grid: options.grid === true, ticks: false, showNumbers: false, axisLabels: false,
    series: leftSeries,
  }];

  elements.push({ type: "line", from: [x + w, y], to: [x + w, y + h], arrow: "none" });
  for (let i = 1; i < tickCount; i += 1) {
    const ty = y + h - (i / tickCount) * h;
    elements.push({ type: "line", from: [x - tickLength, ty], to: [x + tickLength, ty], arrow: "none" });
    elements.push({ type: "line", from: [x + w - tickLength, ty], to: [x + w + tickLength, ty], arrow: "none" });
  }
  for (let i = 1; i < tickCount; i += 1) {
    const tx = x + (i / tickCount) * w;
    elements.push({ type: "line", from: [tx, y + h - tickLength], to: [tx, y + h + tickLength], arrow: "none" });
  }
  for (const series of rightSeries) {
    const mapped = series.points.map((p) => dataToWorld(p, plot, xRange, rightRange));
    elements.push({
      type: series.style === "straight" ? "polyline" : "curve",
      points: mapped, dashed: series.dashed, strokeWidth: series.strokeWidth,
      closed: false, fill: false, arrow: "none",
    });
  }
  return baseScene(board, elements);
}

function resolveNode(value, nodes, name) {
  if (typeof value === "string") {
    if (!nodes.has(value)) throw new RangeError(`${name} references unknown node "${value}".`);
    return nodes.get(value);
  }
  return point(value, [0, 0], name);
}

function dedupePoints(points) {
  return points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
}

function defaultNetwork(strategy) {
  if (strategy === "diagonal") {
    return {
      nodes: [
        { id: "a", at: [-48, 26] }, { id: "b", at: [0, -28] }, { id: "c", at: [48, 26] },
      ],
      edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "a" }],
    };
  }
  return {
    nodes: [
      { id: "a", at: [-48, -24] }, { id: "b", at: [48, -24] },
      { id: "c", at: [48, 24] }, { id: "d", at: [-48, 24] },
    ],
    edges: [
      { from: "a", to: "b" }, { from: "b", to: "c" },
      { from: "c", to: "d" }, { from: "d", to: "a" },
    ],
  };
}

function wiring(options, strategy) {
  const board = artboard(options, { w: 160, h: 90 });
  const fallback = defaultNetwork(strategy);
  const rawNodes = options.nodes == null ? fallback.nodes : options.nodes;
  const rawEdges = options.edges == null ? fallback.edges : options.edges;
  if (!Array.isArray(rawNodes) || rawNodes.length < 2) throw new TypeError("nodes must contain at least two entries.");
  if (!Array.isArray(rawEdges) || rawEdges.length < 1) throw new TypeError("edges must contain at least one entry.");
  const nodes = new Map();
  rawNodes.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new TypeError(`nodes[${index}] must be an object.`);
    const id = String(entry.id || "").trim();
    if (!id || nodes.has(id)) throw new RangeError(`nodes[${index}].id must be unique and non-empty.`);
    nodes.set(id, point(entry.at, [0, 0], `nodes[${index}].at`));
  });
  const elements = [];
  rawEdges.forEach((edge, index) => {
    if (!edge || typeof edge !== "object" || Array.isArray(edge)) throw new TypeError(`edges[${index}] must be an object.`);
    const start = resolveNode(edge.from, nodes, `edges[${index}].from`);
    const end = resolveNode(edge.to, nodes, `edges[${index}].to`);
    const via = edge.via == null ? [] : edge.via;
    if (!Array.isArray(via)) throw new TypeError(`edges[${index}].via must be an array.`);
    let routed = [start, ...via.map((p, pi) => point(p, [0, 0], `edges[${index}].via[${pi}]`)), end];
    if (strategy === "orthogonal" && via.length === 0 && start[0] !== end[0] && start[1] !== end[1]) {
      const bend = edge.bend === "vertical-first" ? [start[0], end[1]] : [end[0], start[1]];
      routed = [start, bend, end];
    }
    routed = dedupePoints(routed);
    if (strategy === "orthogonal") {
      for (let pi = 1; pi < routed.length; pi += 1) {
        if (routed[pi - 1][0] !== routed[pi][0] && routed[pi - 1][1] !== routed[pi][1]) {
          throw new RangeError(`edges[${index}] contains a diagonal segment in orthogonal mode.`);
        }
      }
    }
    elements.push(routed.length === 2
      ? { type: "line", from: routed[0], to: routed[1], arrow: "none", dashed: edge.dashed === true }
      : { type: "polyline", points: routed, arrow: "none", dashed: edge.dashed === true, fill: false });
  });
  if (options.showNodes !== false) {
    const radius = bounded(options.nodeRadius, 1.2, "nodeRadius", 0.5, 4);
    for (const at of nodes.values()) {
      elements.push({ type: "ellipse", box: [at[0] - radius, at[1] - radius, radius * 2, radius * 2], tone: "white" });
    }
  }
  return baseScene(board, elements);
}

function ellipsePoints(cx, cy, rx, ry, count, phase, wobble) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const a = (Math.PI * 2 * i) / count;
    const wave = 1 + wobble * Math.sin(a * 3 + phase);
    out.push([cx + Math.cos(a) * rx * wave, cy + Math.sin(a) * ry * wave]);
  }
  return out;
}

function contourBundle(options) {
  const board = artboard(options, { w: 150, h: 90 });
  const area = box(options.box, [-60, -32, 120, 64]);
  const count = bounded(options.count, 5, "count", 2, 12, true);
  const variant = enumOption(options.variant, "nested", CONTOUR_VARIANTS, "variant");
  const custom = options.paths;
  const elements = [];
  if (custom != null) {
    if (!Array.isArray(custom) || custom.length < 2 || custom.length > 12) throw new RangeError("paths must contain 2 to 12 contour paths.");
    custom.forEach((pathValue, index) => {
      if (!Array.isArray(pathValue) || pathValue.length < 2) throw new TypeError(`paths[${index}] needs at least two points.`);
      elements.push({
        type: "curve", points: pathValue.map((p, pi) => point(p, [0, 0], `paths[${index}][${pi}]`)),
        closed: options.closed === true, fill: false, arrow: "none",
      });
    });
    return baseScene(board, elements);
  }
  const [x, y, w, h] = area;
  if (variant === "nested") {
    const cx = x + w / 2, cy = y + h / 2;
    for (let i = 0; i < count; i += 1) {
      const fraction = 1 - i * (0.72 / count);
      elements.push({
        type: "curve",
        points: ellipsePoints(cx, cy, (w / 2) * fraction, (h / 2) * fraction, 24, i * 0.71, 0.035),
        closed: true, fill: false, arrow: "none",
      });
    }
  } else {
    for (let row = 0; row < count; row += 1) {
      const pts = [];
      const baseY = y + ((row + 0.5) / count) * h;
      for (let col = 0; col <= 16; col += 1) {
        const px = x + (col / 16) * w;
        const py = baseY + Math.sin((col / 16) * Math.PI * 2 + row * 0.63) * Math.min(2.2, h / count * 0.18);
        pts.push([px, py]);
      }
      elements.push({ type: "curve", points: pts, closed: false, fill: false, arrow: "none" });
    }
  }
  return baseScene(board, elements);
}

const COAST_PATHS = Object.freeze({
  peninsula: Object.freeze([
    [0.12, 0.12], [0.30, 0.17], [0.34, 0.31], [0.47, 0.36], [0.42, 0.50],
    [0.57, 0.59], [0.50, 0.74], [0.36, 0.87], [0.20, 0.78], [0.25, 0.60],
    [0.13, 0.48], [0.21, 0.32], [0.12, 0.12],
  ]),
  bay: Object.freeze([
    [0.08, 0.22], [0.24, 0.15], [0.43, 0.24], [0.58, 0.18], [0.76, 0.28],
    [0.65, 0.43], [0.47, 0.38], [0.34, 0.52], [0.50, 0.66], [0.75, 0.59],
    [0.88, 0.76],
  ]),
  islands: Object.freeze([
    [0.08, 0.26], [0.25, 0.15], [0.44, 0.23], [0.57, 0.16], [0.78, 0.31],
    [0.84, 0.50], [0.68, 0.65], [0.48, 0.58], [0.35, 0.78], [0.15, 0.70], [0.08, 0.26],
  ]),
});

function mapPath(pathValue, area) {
  const [x, y, w, h] = area;
  return pathValue.map(([nx, ny]) => [x + nx * w, y + ny * h]);
}

function coastlineSchematic(options) {
  const named = String(options.region || options.geography || "").trim();
  if (options.intent !== "schematic" || named) {
    throw new RangeError("coastline_schematic requires intent:'schematic' and cannot accept a named region; use a verified SVG/map asset for exact geography.");
  }
  const board = artboard(options, { w: 150, h: 90 });
  const area = box(options.box, [-65, -36, 130, 72]);
  const variant = enumOption(options.variant, "peninsula", COAST_VARIANTS, "variant");
  const elements = [{
    type: "curve", points: mapPath(COAST_PATHS[variant], area),
    closed: variant !== "bay", fill: false, arrow: "none",
  }];
  if (variant === "islands") {
    const [x, y, w, h] = area;
    const islands = [[0.79, 0.72, 0.08, 0.07], [0.61, 0.82, 0.05, 0.045], [0.88, 0.55, 0.04, 0.04]];
    islands.forEach(([ix, iy, iw, ih]) => {
      elements.push({
        type: "curve", points: ellipsePoints(x + ix * w, y + iy * h, iw * w / 2, ih * h / 2, 16, 0, 0),
        closed: true, fill: false, arrow: "none",
      });
    });
  }
  return baseScene(board, elements);
}

function verifiedMapOptions(options) {
  const allowed = new Set(["variant", "fillLand", "artboard", "padding", "strokeWidth"]);
  const extra = Object.keys(options).filter((key) => !allowed.has(key));
  if (extra.length) {
    throw new RangeError(`verified_map_outline does not allow option(s): ${extra.join(", ")}. Maps cannot include labels, overlays, arrows or political boundaries.`);
  }
  if (typeof options.variant !== "string" || !options.variant.trim()) {
    throw new TypeError("verified_map_outline requires an explicit variant: world, pacific, east_asia or korean_peninsula.");
  }
  if (options.fillLand != null && typeof options.fillLand !== "boolean") {
    throw new TypeError("verified_map_outline.fillLand must be boolean.");
  }
  return {
    variant: options.variant,
    mapOptions: {
      fillLand: options.fillLand === true,
      ...(options.artboard == null ? {} : { artboard: options.artboard }),
      ...(options.padding == null ? {} : { padding: options.padding }),
      ...(options.strokeWidth == null ? {} : { strokeWidth: options.strokeWidth }),
    },
  };
}

export function listAiMotifs() {
  return AI_MOTIF_IDS.map((id) => ({ ...MOTIFS[id] }));
}

export function getAiMotifMetadata(id) {
  const item = MOTIFS[id];
  return item ? { ...item } : null;
}

export function createAiMotifScene(id, options = {}) {
  if (!MOTIFS[id]) throw new RangeError(`Unknown AI motif "${String(id)}".`);
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("Motif options must be an object.");
  if (id === "panel_flow") return panelFlow(options);
  if (id === "dual_axis_plot") return dualAxisPlot(options);
  if (id === "orthogonal_wiring") return wiring(options, "orthogonal");
  if (id === "diagonal_wiring") return wiring(options, "diagonal");
  if (id === "contour_bundle") return contourBundle(options);
  if (id === "simple_series_circuit") return simpleSeriesCircuit(options);
  if (id === "fixed_pulley_spring_loads") return fixedPulleySpringLoads(options);
  if (id === "lens_mirror_screen_bench") return lensMirrorScreenBench(options);
  if (id === "vessel_particle_comparison") return vesselParticleComparison(options);
  if (id === "logistic_population_graph") return logisticPopulationGraph(options);
  if (id === "verified_map_outline") {
    const map = verifiedMapOptions(options);
    return createVerifiedMapScene(map.variant, map.mapOptions);
  }
  if (id === "student_trio_seated_dialogue" || id === "spacecraft_flat_shell") {
    return createIllustrationAssetScene(id, options);
  }
  return coastlineSchematic(options);
}

export function createAiMotif(id, options = {}) {
  return { id, version: MOTIF_CATALOG_VERSION, metadata: getAiMotifMetadata(id), scene: createAiMotifScene(id, options) };
}

export function compileAiMotif(id, options = {}, compileOptions = {}) {
  if (id === "verified_map_outline") {
    if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("Motif options must be an object.");
    const map = verifiedMapOptions(options);
    return compileVerifiedMap(map.variant, map.mapOptions, {
      ...compileOptions,
      idPrefix: compileOptions.idPrefix || `motif_${id}`,
    });
  }
  if (id === "student_trio_seated_dialogue" || id === "spacecraft_flat_shell") {
    return compileIllustrationAsset(id, options, {
      ...compileOptions,
      idPrefix: compileOptions.idPrefix || `motif_${id}`,
    });
  }
  return compileFastScene(createAiMotifScene(id, options), {
    ...compileOptions,
    mode: "diagram",
    idPrefix: compileOptions.idPrefix || `motif_${id}`,
  });
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function parseSceneInput(input) {
  if (typeof input !== "string") return input;
  let source = input.trim();
  const fenced = source.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) source = fenced[1].trim();
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new SyntaxError(`Motif scene JSON is invalid: ${error?.message || error}`);
  }
}

function assertMotifElement(element) {
  if (!isPlainObject(element)) throw new TypeError("The motif request must be an object.");
  const allowed = new Set(["type", "motif", "options"]);
  const extra = Object.keys(element).filter((key) => !allowed.has(key));
  if (extra.length) throw new RangeError(`Motif request contains unsupported field(s): ${extra.join(", ")}.`);
  if (element.type !== "motif") throw new RangeError("High-level motif request type must be 'motif'.");
  if (typeof element.motif !== "string" || !MOTIFS[element.motif]) {
    throw new RangeError(`Unknown AI motif "${String(element.motif)}".`);
  }
  if (element.options != null && !isPlainObject(element.options)) throw new TypeError("Motif request options must be an object.");
}

function sameExplicitArtboard(left, right) {
  if (!isPlainObject(left) || !isPlainObject(right)) return false;
  const hasOnlyDimensions = (value) => {
    const keys = Object.keys(value);
    return keys.length === 2 && keys.includes("w") && keys.includes("h");
  };
  if (!hasOnlyDimensions(left) || !hasOnlyDimensions(right)) return false;
  const leftW = Number(left.w), leftH = Number(left.h);
  const rightW = Number(right.w), rightH = Number(right.h);
  return Number.isFinite(leftW) && Number.isFinite(leftH)
    && leftW === rightW && leftH === rightH;
}

/**
 * Expand the single high-level motif shortcut accepted from Luna.
 *
 * Ordinary parsed fast-scene objects are returned by identity and are never
 * cloned or mutated. JSON strings are parsed first. A mixed scene (motif plus
 * hand-written elements) is rejected so a high-level request cannot smuggle
 * labels or silently change the audited assembly.
 */
export function expandAiMotifScene(input) {
  const root = parseSceneInput(input);
  if (!isPlainObject(root)) throw new TypeError("Scene must be a JSON object or JSON string.");

  if (root.type === "motif") {
    assertMotifElement(root);
    return createAiMotifScene(root.motif, root.options || {});
  }

  if (!Array.isArray(root.elements)) return root;
  const motifElements = root.elements.filter((element) => isPlainObject(element) && element.type === "motif");
  if (motifElements.length === 0) return root;
  if (motifElements.length !== 1 || root.elements.length !== 1) {
    throw new RangeError("A motif request must be the scene's sole element.");
  }
  const allowedRoot = new Set(["schema", "mode", "artboard", "elements"]);
  const extraRoot = Object.keys(root).filter((key) => !allowedRoot.has(key));
  if (extraRoot.length) throw new RangeError(`Motif scene contains unsupported root field(s): ${extraRoot.join(", ")}.`);
  if (root.schema != null && root.schema !== FAST_SCENE_SCHEMA_ID) {
    throw new RangeError(`Motif scene schema must be '${FAST_SCENE_SCHEMA_ID}'.`);
  }
  if (root.mode != null && root.mode !== "diagram") throw new RangeError("Audited motif shortcuts are diagram-mode only.");
  assertMotifElement(motifElements[0]);
  const requested = motifElements[0];
  const options = { ...(requested.options || {}) };
  if (root.artboard != null && options.artboard != null) {
    if (!sameExplicitArtboard(root.artboard, options.artboard)) {
      throw new RangeError("Motif artboard at the scene root conflicts with options.artboard.");
    }
    delete options.artboard;
  }
  if (root.artboard != null) options.artboard = root.artboard;
  return createAiMotifScene(requested.motif, options);
}

/** Compile ordinary scenes and high-level motif scenes through one safe entry. */
export function compileFastSceneWithMotifs(input, compileOptions = {}) {
  const root = parseSceneInput(input);
  const expanded = expandAiMotifScene(root);
  const request = root?.type === "motif"
    ? root
    : Array.isArray(root?.elements) && root.elements.length === 1 && root.elements[0]?.type === "motif"
      ? root.elements[0]
      : null;
  if (request?.motif === "verified_map_outline") {
    const options = { ...(request.options || {}) };
    if (root !== request && root.artboard != null) options.artboard = root.artboard;
    const map = verifiedMapOptions(options);
    return compileVerifiedMap(map.variant, map.mapOptions, {
      ...compileOptions,
      idPrefix: compileOptions.idPrefix || "ai_scene",
    });
  }
  if (request && (request.motif === "student_trio_seated_dialogue" || request.motif === "spacecraft_flat_shell")) {
    const options = { ...(request.options || {}) };
    if (root !== request && root.artboard != null) options.artboard = root.artboard;
    return compileIllustrationAsset(request.motif, options, {
      ...compileOptions,
      idPrefix: compileOptions.idPrefix || "ai_scene",
    });
  }
  return compileFastScene(expanded, compileOptions);
}
