/* ===== AI SCENE FAST PATH ==================================================
 *
 * A small, DOM-free compiler for the deterministic 5E vector path.
 *
 * The image assistant may return the deliberately limited JSON format below.
 * This module validates that payload, keeps only explicitly supported fields,
 * expands semantic/composite elements (for example graph -> coordplane +
 * funcgraph), and returns ordinary objects consumed by the existing 5E
 * renderers.  It does not mutate application state and is safe to use from a
 * Web Worker or from Node tests.
 *
 * Coordinates are 5E world millimetres.  Box x/y are the top-left corner;
 * points use the same centred-artboard coordinate system as stored 5E objects.
 */

import { OBJECT_TYPE_IDS } from "./object-types.js";

export const FAST_SCENE_SCHEMA_ID = "5e-fast-scene@1";
export const FAST_SCENE_MODES = Object.freeze(["diagram", "complete"]);

const DEFAULT_ARTBOARD = Object.freeze({ w: 160, h: 80 });
const LIMITS = Object.freeze({
  maxPayloadChars: 256 * 1024,
  maxElements: 128,
  maxSeries: 8,
  maxPointsPerElement: 2048,
  maxCoordinate: 5000,
  minArtboard: 20,
  maxArtboard: 500,
});

const CIRCUIT_ELEMENTS = new Set([
  "resistor", "dc_source", "ac_source", "capacitor", "inductor",
  "diode", "lamp", "ammeter", "voltmeter", "galvanometer", "motor",
  "led", "unknown", "switch", "switch_spdt",
]);
const DIAGRAM_TEXT_CIRCUITS = new Set(["ammeter", "voltmeter", "galvanometer", "motor", "unknown"]);

const APPARATUS_KINDS = new Set([
  "wire", "compass", "pulley", "clamp", "scale", "transistor",
  "device_box", "speaker", "phototube", "slit", "thermometer",
  "bar_magnet", "fringe_pattern", "electroscope",
]);
const DIAGRAM_UNSAFE_APPARATUS = new Set(["scale", "bar_magnet", "transistor"]);

const OPTICS_KINDS = new Set([
  "convex_lens", "concave_lens", "convex_mirror", "concave_mirror",
  "plane_mirror", "object_arrow", "point_light", "screen", "pulley", "node",
]);

const VESSEL_KINDS = new Set([
  "beaker", "flask", "test_tube", "cylinder_graduated", "funnel",
  "u_tube", "burette", "round", "box",
]);
const PARTICLE_STATES = new Set(["solid", "liquid", "gas"]);
const PARTICLE_SHAPES = new Set(["circle", "square"]);
const GRAPH_VARIANTS = new Set(["cross", "quadrant", "halfcross", "single"]);

const KIND_ALIASES = Object.freeze({
  block: "rect",
  pulley: "pulley",
  circuit_element: "circuit",
  optical: "optics",
  container: "vessel",
  particles: "particlebox",
  particle_box: "particlebox",
  annotation: "annotation",
});

const SUPPORTED_KINDS = new Set([
  "rect", "ellipse", "triangle", "line", "polyline", "curve",
  "circuit", "apparatus", "pulley", "spring", "optics", "vessel",
  "particlebox", "graph", "pedigree", "annotation",
]);

const COMMON_FIELDS = new Set([
  "type", "kind", "box", "x", "y", "w", "h", "rotation", "strokeWidth",
  "tone", "label",
]);

const TYPE_FIELDS = Object.freeze({
  rect: ["fill"],
  ellipse: ["fill"],
  triangle: ["fill", "flipX", "flipY"],
  line: ["from", "to", "p1", "p2", "dashed", "arrow"],
  polyline: ["points", "closed", "dashed", "arrow", "fill"],
  curve: ["points", "closed", "dashed", "arrow", "fill"],
  circuit: ["from", "to", "p1", "p2", "element", "closed", "throwTo", "bodyScale"],
  apparatus: [
    "apparatusKind", "variant", "facing", "slits", "leafSpread", "needleAngle",
    "showWaves", "emit", "terminals", "termSide",
  ],
  pulley: ["variant"],
  spring: ["from", "to", "p1", "p2", "turns", "radius", "leadLength", "springStyle", "dashed"],
  optics: ["opticsKind", "centerLine", "fill"],
  vessel: [
    "vesselKind", "liquid", "hasPiston", "pistonAt", "hasFix", "hasWeight",
    "hasStopcock", "hasTicks",
  ],
  particlebox: ["state", "count", "particleRadius", "particleShape", "mix", "seed", "motion"],
  graph: [
    "xRange", "yRange", "axisVariant", "grid", "ticks", "showNumbers",
    "axisLabels", "series",
  ],
  pedigree: [
    "gen2Kids", "gen3Kids", "gen3Parent", "symbolRadius", "affected", "carrier",
    "affectedFill", "carrierFill", "showNumbers",
  ],
  annotation: ["at", "text", "fontSize", "weight"],
});

const RENDERED_TEXT_FIELDS = Object.freeze([
  "label", "text", "source", "rawSource", "displayText", "dimensionLabel",
  "inlineLabel", "labelX", "labelY", "labelOrigin", "xTitle", "yTitle",
  "solution", "leftLabel", "rightLabel",
]);

const FALSE_IN_DIAGRAM = Object.freeze([
  "showLabel", "labelShow", "showLabels", "showNumbers", "showAxisLabels",
  "showAxisLabelX", "showAxisLabelY", "showTickLabels", "showOrigin", "showMarks",
  "showGeoLabel", "showSymbol", "showOrbitalLabels", "showKoreanName",
  "showRegionNames", "showEqPoint", "showRatio", "showElectronArrow",
  "axisLabels", "showLengthLabel",
]);

export const FAST_SCENE_CONTRACT = Object.freeze({
  schema: FAST_SCENE_SCHEMA_ID,
  coordinates: "5E world millimetres; box x/y is top-left; artboard is centred at 0,0",
  modes: FAST_SCENE_MODES,
  root: ["schema", "mode", "artboard", "elements"],
  kinds: Object.freeze(Array.from(SUPPORTED_KINDS)),
  aliases: KIND_ALIASES,
  limits: LIMITS,
});

function nowMs() {
  return globalThis.performance && typeof globalThis.performance.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}

function isPlainObject(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function issue(code, path, message, extra = {}) {
  return { code, path, message, ...extra };
}

function parsePayload(input, errors) {
  if (typeof input !== "string") {
    if (!isPlainObject(input)) errors.push(issue("scene_type", "$", "Scene must be a JSON object or JSON string."));
    return isPlainObject(input) ? input : null;
  }
  if (input.length > LIMITS.maxPayloadChars) {
    errors.push(issue("payload_too_large", "$", `Scene JSON exceeds ${LIMITS.maxPayloadChars} characters.`));
    return null;
  }
  let src = input.trim();
  const fence = src.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) src = fence[1];
  try {
    const value = JSON.parse(src);
    if (!isPlainObject(value)) {
      errors.push(issue("scene_type", "$", "Scene JSON root must be an object."));
      return null;
    }
    return value;
  } catch (err) {
    errors.push(issue("json_parse", "$", `Invalid scene JSON: ${err.message}`));
    return null;
  }
}

function numeric(v, path, ctx, options = {}) {
  if (!Number.isFinite(v)) {
    ctx.errors.push(issue("number_required", path, "A finite number is required."));
    return null;
  }
  let out = v;
  if (options.integer) out = Math.round(out);
  if (options.min != null && out < options.min) {
    if (options.clamp) {
      ctx.warnings.push(issue("number_clamped", path, `Value was clamped to ${options.min}.`, { from: out, to: options.min }));
      out = options.min;
    } else {
      ctx.errors.push(issue("number_range", path, `Value must be at least ${options.min}.`));
      return null;
    }
  }
  if (options.max != null && out > options.max) {
    if (options.clamp) {
      ctx.warnings.push(issue("number_clamped", path, `Value was clamped to ${options.max}.`, { from: out, to: options.max }));
      out = options.max;
    } else {
      ctx.errors.push(issue("number_range", path, `Value must not exceed ${options.max}.`));
      return null;
    }
  }
  return out;
}

function point(value, path, ctx) {
  const raw = Array.isArray(value)
    ? { x: value[0], y: value[1], length: value.length }
    : isPlainObject(value) ? { x: value.x, y: value.y, length: 2 } : null;
  if (!raw || raw.length !== 2) {
    ctx.errors.push(issue("point_required", path, "Point must be [x,y] or {x,y}."));
    return null;
  }
  const x = numeric(raw.x, `${path}.x`, ctx, { min: -LIMITS.maxCoordinate, max: LIMITS.maxCoordinate });
  const y = numeric(raw.y, `${path}.y`, ctx, { min: -LIMITS.maxCoordinate, max: LIMITS.maxCoordinate });
  return x == null || y == null ? null : { x, y };
}

function endpoints(el, path, ctx) {
  const p1 = point(el.from ?? el.p1, `${path}.from`, ctx);
  const p2 = point(el.to ?? el.p2, `${path}.to`, ctx);
  if (p1 && p2 && p1.x === p2.x && p1.y === p2.y) {
    ctx.errors.push(issue("zero_length", path, "Endpoints must be different."));
    return null;
  }
  return p1 && p2 ? { p1, p2 } : null;
}

function box(el, path, ctx) {
  const raw = Array.isArray(el.box)
    ? { x: el.box[0], y: el.box[1], w: el.box[2], h: el.box[3], length: el.box.length }
    : { x: el.x, y: el.y, w: el.w, h: el.h, length: 4 };
  if (raw.length !== 4) {
    ctx.errors.push(issue("box_required", `${path}.box`, "Box must be [x,y,w,h]."));
    return null;
  }
  const x = numeric(raw.x, `${path}.x`, ctx, { min: -LIMITS.maxCoordinate, max: LIMITS.maxCoordinate });
  const y = numeric(raw.y, `${path}.y`, ctx, { min: -LIMITS.maxCoordinate, max: LIMITS.maxCoordinate });
  const w = numeric(raw.w, `${path}.w`, ctx, { min: 0.1, max: LIMITS.maxCoordinate });
  const h = numeric(raw.h, `${path}.h`, ctx, { min: 0.1, max: LIMITS.maxCoordinate });
  return [x, y, w, h].some((v) => v == null) ? null : { x, y, w, h };
}

function points(value, path, ctx, min = 2) {
  if (!Array.isArray(value) || value.length < min) {
    ctx.errors.push(issue("points_required", path, `At least ${min} points are required.`));
    return null;
  }
  if (value.length > LIMITS.maxPointsPerElement) {
    ctx.errors.push(issue("too_many_points", path, `No more than ${LIMITS.maxPointsPerElement} points are allowed.`));
    return null;
  }
  const out = value.map((p, i) => point(p, `${path}[${i}]`, ctx));
  return out.some((p) => !p) ? null : out;
}

function enumValue(value, allowed, fallback, path, ctx) {
  if (value == null) return fallback;
  if (allowed.has(value)) return value;
  ctx.errors.push(issue("enum_value", path, `Unsupported value "${String(value)}".`, { allowed: Array.from(allowed) }));
  return null;
}

function bool(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function rotation(el, path, ctx) {
  if (el.rotation == null) return 0;
  return numeric(el.rotation, `${path}.rotation`, ctx, { min: -360, max: 360, clamp: true }) ?? 0;
}

function strokeWidth(el, path, ctx) {
  if (el.strokeWidth == null) return 0.35;
  return numeric(el.strokeWidth, `${path}.strokeWidth`, ctx, { min: 0.15, max: 0.8, clamp: true }) ?? 0.35;
}

function canonicalKind(el) {
  const declared = typeof el.type === "string" ? el.type : el.kind;
  return KIND_ALIASES[declared] || declared;
}

function allowedFieldsFor(kind) {
  return new Set([...COMMON_FIELDS, ...(TYPE_FIELDS[kind] || [])]);
}

function reportIgnoredFields(el, kind, path, ctx) {
  const allowed = allowedFieldsFor(kind);
  for (const key of Object.keys(el)) {
    if (allowed.has(key)) continue;
    const item = issue("field_ignored", `${path}.${key}`, `Field "${key}" is not part of the fast-scene contract and was ignored.`);
    (ctx.strict ? ctx.errors : ctx.warnings).push(item);
  }
}

function baseObject(type, el, path, ctx) {
  return {
    type,
    locked: false,
    positionLocked: false,
    layerId: ctx.layerId,
    strokeLevel: 0,
    strokeWidth: strokeWidth(el, path, ctx),
  };
}

function fillFields(el, path, ctx) {
  const tone = enumValue(el.tone, new Set(["white", "gray", "none"]), "white", `${path}.tone`, ctx);
  const fill = el.fill === false || tone === "none" ? "none" : tone;
  return {
    fillNone: fill === "none",
    fillLevel: fill === "gray" ? 224 : 255,
    fillStyle: "solid",
  };
}

function dashFields(el) {
  return el.dashed ? { dashLength: 2.2, dashGap: 1.6 } : { dashLength: 0, dashGap: 0 };
}

function arrowHead(el, path, ctx) {
  const raw = el.arrow === true ? "end" : (el.arrow || "none");
  const allowed = new Set(["none", "end", "start", "both"]);
  if (!allowed.has(raw)) {
    ctx.errors.push(issue("enum_value", `${path}.arrow`, `Unsupported arrow value "${String(raw)}".`));
    return "none";
  }
  if (ctx.mode === "diagram" && raw !== "none") {
    ctx.warnings.push(issue("diagram_arrow_removed", `${path}.arrow`, "Arrow was removed in diagram mode."));
    return "none";
  }
  return raw;
}

function applyOptionalLabel(obj, el, path, ctx) {
  const raw = typeof el.label === "string" ? el.label.trim().slice(0, 120) : "";
  if (ctx.mode === "diagram") {
    if (raw) ctx.warnings.push(issue("diagram_label_removed", `${path}.label`, "Label was removed in diagram mode."));
    obj.label = "";
    obj.showLabel = false;
    obj.labelShow = false;
    return obj;
  }
  if (raw) {
    obj.label = raw;
    obj.showLabel = true;
    obj.labelShow = true;
    obj.labelType = "label";
  }
  return obj;
}

function normalizeForDiagram(obj) {
  for (const key of RENDERED_TEXT_FIELDS) if (key in obj) obj[key] = "";
  for (const key of FALSE_IN_DIAGRAM) obj[key] = false;
  if ("terminalLabels" in obj) obj.terminalLabels = ["", ""];
  if (obj.type === "line" || obj.type === "polyline" || obj.type === "curve") {
    obj.arrowHead = "none";
    if (obj.type === "line") obj.lineMode = "solid";
  }
  if (obj.type === "particlebox") obj.motion = obj.motion === "trail" ? "trail" : "none";
  if (obj.type === "coordplane") {
    obj.showAxisLines = false;
    obj.showAxisLabels = false;
    obj.showTickLabels = false;
    obj.tickLabelMode = "none";
    obj.showOrigin = false;
    obj.arrowMarks = [];
    obj.arrowPolys = [];
  }
  if (obj.type === "pedigree") obj.showNumbers = false;
  return obj;
}

function objectBBox(obj) {
  if ([
    "rect", "ellipse", "triangle", "optics", "apparatus", "vessel", "particlebox",
    "coordplane", "pedigree", "text",
  ].includes(obj.type)) return { x: obj.x, y: obj.y, w: obj.w || 0, h: obj.h || 0 };
  if (obj.p1 && obj.p2) {
    return {
      x: Math.min(obj.p1.x, obj.p2.x), y: Math.min(obj.p1.y, obj.p2.y),
      w: Math.abs(obj.p2.x - obj.p1.x), h: Math.abs(obj.p2.y - obj.p1.y),
    };
  }
  if (Array.isArray(obj.points) && obj.points.length) {
    const xs = obj.points.map((p) => p.x), ys = obj.points.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  return null;
}

function translateObject(obj, dx, dy) {
  if (Number.isFinite(obj.x)) obj.x += dx;
  if (Number.isFinite(obj.y)) obj.y += dy;
  if (obj.p1 && Number.isFinite(obj.p1.x) && Number.isFinite(obj.p1.y)) {
    obj.p1 = { ...obj.p1, x: obj.p1.x + dx, y: obj.p1.y + dy };
  }
  if (obj.p2 && Number.isFinite(obj.p2.x) && Number.isFinite(obj.p2.y)) {
    obj.p2 = { ...obj.p2, x: obj.p2.x + dx, y: obj.p2.y + dy };
  }
  if (Array.isArray(obj.points)) {
    obj.points = obj.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
  }
}

/* Some live model turns still interpret x/y as browser-canvas coordinates even
 * though the contract says the artboard origin is centred.  Correct that only
 * when the evidence is unambiguous enough to be safe:
 *   1. every non-annotation object's bbox is known;
 *   2. the whole geometry fits inside 0..w / 0..h; and
 *   3. at least one object would be outside the true centred artboard.
 *
 * An all-positive scene that also fits the centred bounds is intentionally left
 * alone.  Once detected, annotations are translated with the scene so complete
 * mode labels retain their spatial relationship to the geometry. */
function normalizeSceneOrigin(ctx) {
  const geometry = ctx.objects.filter((obj) => !["text", "formula", "labeler"].includes(obj.type));
  if (!geometry.length) return;
  const boxes = geometry.map(objectBBox);
  if (boxes.some((b) => !b || ![b.x, b.y, b.w, b.h].every(Number.isFinite))) return;

  const eps = 0.01;
  const fitsTopLeft = boxes.every((b) => (
    b.x >= -eps && b.y >= -eps
    && b.x + b.w <= ctx.artboard.w + eps
    && b.y + b.h <= ctx.artboard.h + eps
  ));
  if (!fitsTopLeft) return;

  const hx = ctx.artboard.w / 2, hy = ctx.artboard.h / 2;
  const exceedsCentred = boxes.some((b) => (
    b.x < -hx - eps || b.y < -hy - eps
    || b.x + b.w > hx + eps || b.y + b.h > hy + eps
  ));
  if (!exceedsCentred) return;

  const dx = -hx, dy = -hy;
  ctx.objects.forEach((obj) => translateObject(obj, dx, dy));
  ctx.originNormalization = { applied: true, from: "top-left", to: "centered", dx, dy };
  ctx.warnings.push(issue(
    "origin_normalized",
    "$.elements",
    "Scene geometry used top-left artboard coordinates and was translated to the centred 5E coordinate system.",
    { dx, dy },
  ));
}

function addObject(ctx, obj, tag = "obj") {
  if (!OBJECT_TYPE_IDS.includes(obj.type)) {
    ctx.errors.push(issue("internal_output_type", "$", `Compiler produced unknown 5E type "${obj.type}".`));
    return null;
  }
  if (ctx.mode === "diagram") normalizeForDiagram(obj);
  const safeTag = String(tag).replace(/[^a-z0-9_-]/gi, "_").slice(0, 28) || "obj";
  obj.id = `${ctx.idPrefix}_${String(ctx.objects.length + 1).padStart(3, "0")}_${safeTag}`;
  obj.order = ctx.objects.length;
  ctx.objects.push(obj);
  return obj;
}

function compileShape(kind, el, path, ctx) {
  const b = box(el, path, ctx);
  if (!b) return;
  const obj = {
    ...baseObject(kind, el, path, ctx), ...b, ...fillFields(el, path, ctx),
    rotation: rotation(el, path, ctx),
  };
  if (kind === "triangle") {
    obj.flipX = bool(el.flipX);
    obj.flipY = bool(el.flipY);
  }
  applyOptionalLabel(obj, el, path, ctx);
  addObject(ctx, obj, kind);
}

function compileLine(kind, el, path, ctx) {
  if (kind === "line") {
    const ep = endpoints(el, path, ctx);
    if (!ep) return;
    const obj = {
      ...baseObject("line", el, path, ctx), ...ep, ...dashFields(el),
      rotation: 0, lineMode: "solid", lineStyle: "solid", arrowHead: arrowHead(el, path, ctx),
    };
    applyOptionalLabel(obj, el, path, ctx);
    addObject(ctx, obj, "line");
    return;
  }
  const pts = points(el.points, `${path}.points`, ctx);
  if (!pts) return;
  const obj = {
    ...baseObject(kind, el, path, ctx), points: pts, ...dashFields(el),
    closed: bool(el.closed), arrowHead: arrowHead(el, path, ctx),
    ...fillFields(el, path, ctx), rotation: 0,
  };
  addObject(ctx, obj, kind);
}

function compileCircuit(el, path, ctx) {
  const ep = endpoints(el, path, ctx);
  const element = enumValue(el.element, CIRCUIT_ELEMENTS, "resistor", `${path}.element`, ctx);
  if (!ep || !element) return;
  if (ctx.mode === "diagram" && DIAGRAM_TEXT_CIRCUITS.has(element)) {
    ctx.unsupported.push(issue("diagram_intrinsic_text", `${path}.element`, `${element} contains an intrinsic text glyph in the current renderer.`));
    return;
  }
  const obj = {
    ...baseObject("circuit", el, path, ctx), ...ep, element,
    label: "", labelType: "quantity", terminalLabels: ["", ""],
  };
  if (element === "switch") obj.closed = bool(el.closed);
  if (element === "switch_spdt") obj.throwTo = el.throwTo === "b" ? "b" : "a";
  if (el.bodyScale != null) obj.bodyScale = numeric(el.bodyScale, `${path}.bodyScale`, ctx, { min: 0.5, max: 2, clamp: true });
  applyOptionalLabel(obj, el, path, ctx);
  addObject(ctx, obj, `circuit_${element}`);
}

function compileApparatus(kind, el, path, ctx) {
  const b = box(el, path, ctx);
  const apparatusKind = kind === "pulley" ? "pulley" : (el.apparatusKind || el.kind || "wire");
  const selected = enumValue(apparatusKind, APPARATUS_KINDS, "wire", `${path}.apparatusKind`, ctx);
  if (!b || !selected) return;
  if (ctx.mode === "diagram" && DIAGRAM_UNSAFE_APPARATUS.has(selected)) {
    ctx.unsupported.push(issue("diagram_intrinsic_annotation", `${path}.apparatusKind`, `${selected} contains intrinsic text or an arrow in the current renderer.`));
    return;
  }
  const obj = {
    ...baseObject("apparatus", el, path, ctx), ...b, kind: selected,
    rotation: rotation(el, path, ctx), fillNone: true,
  };
  if (selected === "pulley") obj.variant = ["basic", "ceiling", "wall"].includes(el.variant) ? el.variant : "basic";
  if (selected === "compass" && el.needleAngle != null) obj.needleAngle = numeric(el.needleAngle, `${path}.needleAngle`, ctx, { min: -360, max: 360, clamp: true });
  if (selected === "speaker") {
    obj.facing = el.facing === "left" ? "left" : "right";
    obj.showWaves = el.showWaves !== false;
  }
  if (selected === "phototube") obj.emit = el.emit === "left" ? "left" : (el.emit === "right" ? "right" : "none");
  if (selected === "slit") obj.slits = numeric(el.slits ?? 1, `${path}.slits`, ctx, { min: 1, max: 8, integer: true, clamp: true });
  if (selected === "electroscope") obj.leafSpread = numeric(el.leafSpread ?? 0.55, `${path}.leafSpread`, ctx, { min: 0, max: 1, clamp: true });
  if (selected === "device_box") {
    obj.label = "";
    obj.plusMinus = false;
    obj.terminals = numeric(el.terminals ?? 2, `${path}.terminals`, ctx, { min: 0, max: 8, integer: true, clamp: true });
    obj.termSide = ["top", "bottom", "left", "right"].includes(el.termSide) ? el.termSide : "bottom";
  }
  addObject(ctx, obj, selected);
}

function compileSpring(el, path, ctx) {
  const ep = endpoints(el, path, ctx);
  if (!ep) return;
  const obj = {
    ...baseObject("spring", el, path, ctx), ...ep, ...dashFields(el),
    turns: numeric(el.turns ?? 14, `${path}.turns`, ctx, { min: 2, max: 40, integer: true, clamp: true }),
    radius: numeric(el.radius ?? 2, `${path}.radius`, ctx, { min: 0.2, max: 12, clamp: true }),
    leadLength: numeric(el.leadLength ?? 2, `${path}.leadLength`, ctx, { min: 0, max: 30, clamp: true }),
    springStyle: el.springStyle === "line" ? "line" : "helix",
    label: "", labelShow: false, labelType: "quantity",
  };
  applyOptionalLabel(obj, el, path, ctx);
  addObject(ctx, obj, "spring");
}

function compileOptics(el, path, ctx) {
  const b = box(el, path, ctx);
  const opticsKind = el.opticsKind || el.kind || "convex_lens";
  const selected = enumValue(opticsKind, OPTICS_KINDS, "convex_lens", `${path}.opticsKind`, ctx);
  if (!b || !selected) return;
  if (ctx.mode === "diagram" && selected === "object_arrow") {
    ctx.unsupported.push(issue("diagram_intrinsic_arrow", `${path}.opticsKind`, "object_arrow is forbidden in diagram mode."));
    return;
  }
  const obj = {
    ...baseObject("optics", el, path, ctx), ...b, kind: selected,
    rotation: rotation(el, path, ctx), fillNone: true, fillLevel: 255, fillStyle: "solid",
    showLabel: false, label: "",
  };
  if (["solid", "dash", "dot", "none"].includes(el.centerLine)) obj.centerLine = el.centerLine;
  applyOptionalLabel(obj, el, path, ctx);
  addObject(ctx, obj, selected);
}

function compileVessel(el, path, ctx) {
  const b = box(el, path, ctx);
  const vesselKind = el.vesselKind || el.kind || "beaker";
  const selected = enumValue(vesselKind, VESSEL_KINDS, "beaker", `${path}.vesselKind`, ctx);
  if (!b || !selected) return;
  const obj = {
    ...baseObject("vessel", el, path, ctx), ...b, kind: selected,
    rotation: rotation(el, path, ctx), text: "",
    liquid: numeric(el.liquid ?? 0, `${path}.liquid`, ctx, { min: 0, max: 1, clamp: true }),
    hasPiston: bool(el.hasPiston),
    pistonAt: numeric(el.pistonAt ?? 0.5, `${path}.pistonAt`, ctx, { min: 0, max: 1, clamp: true }),
    hasFix: bool(el.hasFix), hasWeight: bool(el.hasWeight),
    hasStopcock: bool(el.hasStopcock), hasTicks: bool(el.hasTicks),
  };
  addObject(ctx, obj, `vessel_${selected}`);
}

function compileParticleBox(el, path, ctx) {
  const b = box(el, path, ctx);
  const state = enumValue(el.state, PARTICLE_STATES, "gas", `${path}.state`, ctx);
  const particleShape = enumValue(el.particleShape, PARTICLE_SHAPES, "circle", `${path}.particleShape`, ctx);
  if (!b || !state || !particleShape) return;
  let motion = ["none", "trail", "arrow"].includes(el.motion) ? el.motion : "none";
  if (ctx.mode === "diagram" && motion === "arrow") {
    ctx.warnings.push(issue("diagram_arrow_removed", `${path}.motion`, "Particle motion arrows were removed in diagram mode."));
    motion = "none";
  }
  const obj = {
    ...baseObject("particlebox", el, path, ctx), ...b, state, particleShape, motion,
    rotation: rotation(el, path, ctx),
    count: numeric(el.count ?? 14, `${path}.count`, ctx, { min: 1, max: 100, integer: true, clamp: true }),
    particleRadius: numeric(el.particleRadius ?? 1.15, `${path}.particleRadius`, ctx, { min: 0.2, max: 4, clamp: true }),
    mix: bool(el.mix),
    seed: numeric(el.seed ?? 7, `${path}.seed`, ctx, { min: 0, max: 1_000_000, integer: true, clamp: true }),
  };
  addObject(ctx, obj, `particles_${state}`);
}

function numberRange(value, fallback, path, ctx) {
  const raw = value == null ? fallback : value;
  if (!Array.isArray(raw) || raw.length !== 2) {
    ctx.errors.push(issue("range_required", path, "Range must be [min,max]."));
    return null;
  }
  const lo = numeric(raw[0], `${path}[0]`, ctx, { min: -10000, max: 10000 });
  const hi = numeric(raw[1], `${path}[1]`, ctx, { min: -10000, max: 10000 });
  if (lo != null && hi != null && hi <= lo) {
    ctx.errors.push(issue("range_order", path, "Range maximum must be greater than minimum."));
    return null;
  }
  return lo == null || hi == null ? null : [lo, hi];
}

function graphPointToWorld(p, b, xr, yr, path, ctx) {
  let dx = p.x, dy = p.y;
  if (dx < xr[0] || dx > xr[1] || dy < yr[0] || dy > yr[1]) {
    const cx = Math.max(xr[0], Math.min(xr[1], dx));
    const cy = Math.max(yr[0], Math.min(yr[1], dy));
    ctx.warnings.push(issue("graph_point_clamped", path, "Graph point outside the declared range was clamped.", { from: [dx, dy], to: [cx, cy] }));
    dx = cx; dy = cy;
  }
  return {
    x: b.x + ((dx - xr[0]) / (xr[1] - xr[0])) * b.w,
    y: b.y + b.h - ((dy - yr[0]) / (yr[1] - yr[0])) * b.h,
  };
}

function addDiagramAxes(ctx, b, xr, yr, variant, stroke, path) {
  const before = ctx.objects.length;
  const addAxis = (p1, p2, tag) => addObject(ctx, {
    type: "line", p1, p2, strokeLevel: 0, strokeWidth: stroke,
    locked: false, positionLocked: false, layerId: ctx.layerId,
    lineMode: "solid", lineStyle: "solid", arrowHead: "none", dashLength: 0, dashGap: 0,
  }, tag);
  const zeroX = b.x + ((0 - xr[0]) / (xr[1] - xr[0])) * b.w;
  const zeroY = b.y + b.h - ((0 - yr[0]) / (yr[1] - yr[0])) * b.h;
  if (variant === "quadrant") {
    addAxis({ x: b.x, y: b.y + b.h }, { x: b.x + b.w, y: b.y + b.h }, "graph_x_axis");
    addAxis({ x: b.x, y: b.y + b.h }, { x: b.x, y: b.y }, "graph_y_axis");
    return;
  }
  if (variant === "single") {
    const y = yr[0] <= 0 && yr[1] >= 0 ? zeroY : b.y + b.h / 2;
    addAxis({ x: b.x, y }, { x: b.x + b.w, y }, "graph_axis");
    return;
  }
  if (yr[0] <= 0 && yr[1] >= 0) addAxis({ x: b.x, y: zeroY }, { x: b.x + b.w, y: zeroY }, "graph_x_axis");
  if (xr[0] <= 0 && xr[1] >= 0) {
    const top = variant === "halfcross" ? Math.max(b.y, zeroY) : b.y;
    addAxis({ x: zeroX, y: top }, { x: zeroX, y: b.y + b.h }, "graph_y_axis");
  }
  if (ctx.objects.length === before) ctx.warnings.push(issue("graph_axes_missing", path, "Neither zero axis intersects the graph range."));
}

function compileGraph(el, path, ctx) {
  const b = box(el, path, ctx);
  const xr = numberRange(el.xRange, [-5, 5], `${path}.xRange`, ctx);
  const yr = numberRange(el.yRange, [-5, 5], `${path}.yRange`, ctx);
  const variant = enumValue(el.axisVariant, GRAPH_VARIANTS, "cross", `${path}.axisVariant`, ctx);
  if (!b || !xr || !yr || !variant) return;
  const complete = ctx.mode === "complete";
  const plane = addObject(ctx, {
    ...baseObject("coordplane", el, path, ctx), ...b,
    rotation: 0, lockAspect: true, axisVariant: variant,
    xMin: xr[0], xMax: xr[1], yMin: yr[0], yMax: yr[1],
    gridStepX: 1, gridStepY: 1, tickStepX: 1, tickStepY: 1,
    showAxisLines: complete,
    showGrid: el.grid !== false,
    showTicks: complete && el.ticks !== false,
    showTickLabels: complete && bool(el.showNumbers),
    tickLabelMode: complete && bool(el.showNumbers) ? "number" : "none",
    showAxisLabels: complete && bool(el.axisLabels),
    showAxisLabelX: complete && bool(el.axisLabels),
    showAxisLabelY: complete && bool(el.axisLabels),
    labelX: complete && bool(el.axisLabels) ? "x" : "",
    labelY: complete && bool(el.axisLabels) ? "y" : "",
    showOrigin: false, labelOrigin: "", exportable: true,
  }, "graph_plane");
  if (!plane) return;
  if (!complete) addDiagramAxes(ctx, b, xr, yr, variant, plane.strokeWidth, path);

  const series = el.series == null ? [] : el.series;
  if (!Array.isArray(series)) {
    ctx.errors.push(issue("series_required", `${path}.series`, "Graph series must be an array."));
    return;
  }
  if (series.length > LIMITS.maxSeries) {
    ctx.errors.push(issue("too_many_series", `${path}.series`, `No more than ${LIMITS.maxSeries} series are allowed.`));
    return;
  }
  series.forEach((s, i) => {
    const sp = `${path}.series[${i}]`;
    if (!isPlainObject(s)) {
      ctx.errors.push(issue("series_type", sp, "Graph series must be an object."));
      return;
    }
    const data = points(s.points, `${sp}.points`, ctx);
    if (!data) return;
    const mapped = data.map((p, pi) => graphPointToWorld(p, b, xr, yr, `${sp}.points[${pi}]`, ctx));
    const width = numeric(s.strokeWidth ?? el.strokeWidth ?? 0.35, `${sp}.strokeWidth`, ctx, { min: 0.15, max: 0.8, clamp: true }) ?? 0.35;
    addObject(ctx, {
      type: "funcgraph", planeId: plane.id, points: mapped, closed: false,
      strokeLevel: 0, strokeWidth: width, dashLength: s.dashed ? 2.2 : 0,
      dashGap: s.dashed ? 1.6 : 0, label: "", labelShow: false,
      sourceKind: "points", curveStyle: s.style === "straight" ? "straight" : "smooth",
      locked: false, positionLocked: false, layerId: ctx.layerId,
    }, `graph_series_${i + 1}`);
  });
}

function indexCsv(value, path, ctx) {
  if (value == null || value === "") return "";
  const raw = Array.isArray(value) ? value : String(value).split(",");
  const out = [];
  for (let i = 0; i < raw.length; i += 1) {
    const n = numeric(Number(raw[i]), `${path}[${i}]`, ctx, { min: 1, max: 99, integer: true });
    if (n != null && !out.includes(n)) out.push(n);
  }
  return out.join(",");
}

function compilePedigree(el, path, ctx) {
  const b = box(el, path, ctx);
  if (!b) return;
  const fills = new Set(["solid", "gray", "hatch", "cross"]);
  const obj = {
    ...baseObject("pedigree", el, path, ctx), ...b,
    rotation: rotation(el, path, ctx),
    gen2Kids: numeric(el.gen2Kids ?? 3, `${path}.gen2Kids`, ctx, { min: 1, max: 12, integer: true, clamp: true }),
    gen3Kids: numeric(el.gen3Kids ?? 0, `${path}.gen3Kids`, ctx, { min: 0, max: 12, integer: true, clamp: true }),
    gen3Parent: numeric(el.gen3Parent ?? 0, `${path}.gen3Parent`, ctx, { min: 0, max: 11, integer: true, clamp: true }),
    symbolRadius: numeric(el.symbolRadius ?? 2.6, `${path}.symbolRadius`, ctx, { min: 0.5, max: 8, clamp: true }),
    affected: indexCsv(el.affected, `${path}.affected`, ctx),
    carrier: indexCsv(el.carrier, `${path}.carrier`, ctx),
    affectedFill: enumValue(el.affectedFill, fills, "hatch", `${path}.affectedFill`, ctx),
    carrierFill: enumValue(el.carrierFill, fills, "gray", `${path}.carrierFill`, ctx),
    showNumbers: ctx.mode === "complete" && bool(el.showNumbers),
  };
  addObject(ctx, obj, "pedigree");
}

function compileAnnotation(el, path, ctx) {
  if (ctx.mode === "diagram") {
    ctx.warnings.push(issue("diagram_annotation_removed", path, "Annotation element was omitted in diagram mode."));
    return;
  }
  const at = point(el.at ?? [el.x, el.y], `${path}.at`, ctx);
  if (!at) return;
  const text = typeof el.text === "string" ? el.text.trim().slice(0, 240) : "";
  if (!text) {
    ctx.errors.push(issue("text_required", `${path}.text`, "Annotation text is required."));
    return;
  }
  const fontSize = numeric(el.fontSize ?? 3.7, `${path}.fontSize`, ctx, { min: 1.5, max: 12, clamp: true });
  addObject(ctx, {
    type: "text", x: at.x, y: at.y, text, fontSize,
    fontWeight: el.weight === "bold" ? "bold" : "normal",
    rotation: rotation(el, path, ctx), locked: false, positionLocked: false,
    layerId: ctx.layerId,
  }, "annotation");
}

function compileElement(el, index, ctx) {
  const path = `$.elements[${index}]`;
  if (!isPlainObject(el)) {
    ctx.errors.push(issue("element_type", path, "Element must be an object."));
    return;
  }
  const kind = canonicalKind(el);
  if (!SUPPORTED_KINDS.has(kind)) {
    ctx.unsupported.push(issue("unsupported_kind", `${path}.type`, `Fast path does not support "${String(kind)}".`, { kind }));
    return;
  }
  reportIgnoredFields(el, kind, path, ctx);
  if (["rect", "ellipse", "triangle"].includes(kind)) compileShape(kind, el, path, ctx);
  else if (["line", "polyline", "curve"].includes(kind)) compileLine(kind, el, path, ctx);
  else if (kind === "circuit") compileCircuit(el, path, ctx);
  else if (kind === "apparatus" || kind === "pulley") compileApparatus(kind, el, path, ctx);
  else if (kind === "spring") compileSpring(el, path, ctx);
  else if (kind === "optics") compileOptics(el, path, ctx);
  else if (kind === "vessel") compileVessel(el, path, ctx);
  else if (kind === "particlebox") compileParticleBox(el, path, ctx);
  else if (kind === "graph") compileGraph(el, path, ctx);
  else if (kind === "pedigree") compilePedigree(el, path, ctx);
  else if (kind === "annotation") compileAnnotation(el, path, ctx);
}

function normalizeArtboard(value, ctx) {
  const raw = value == null ? DEFAULT_ARTBOARD : value;
  if (!isPlainObject(raw)) {
    ctx.errors.push(issue("artboard_type", "$.artboard", "Artboard must be an object with w and h."));
    return { ...DEFAULT_ARTBOARD };
  }
  const w = numeric(raw.w ?? raw.width, "$.artboard.w", ctx, { min: LIMITS.minArtboard, max: LIMITS.maxArtboard });
  const h = numeric(raw.h ?? raw.height, "$.artboard.h", ctx, { min: LIMITS.minArtboard, max: LIMITS.maxArtboard });
  return w == null || h == null ? { ...DEFAULT_ARTBOARD } : { w, h };
}

function warnOutOfBounds(ctx) {
  const hx = ctx.artboard.w / 2, hy = ctx.artboard.h / 2;
  for (const obj of ctx.objects) {
    const b = objectBBox(obj);
    if (!b) continue;
    if (b.x < -hx || b.y < -hy || b.x + b.w > hx || b.y + b.h > hy) {
      ctx.warnings.push(issue("outside_artboard", `$.objects.${obj.id}`, "Object extends outside the artboard.", { bbox: b }));
    }
  }
}

/**
 * Return invariant violations for objects intended for 그림형/diagram mode.
 * This is intentionally independent from compilation so stored or hand-built
 * object arrays can be checked before they are inserted into the canvas.
 */
export function auditDiagramObjects(objects) {
  const violations = [];
  (objects || []).forEach((obj, index) => {
    const path = `$[${index}]`;
    if (!obj || typeof obj !== "object") {
      violations.push(issue("object_type", path, "Expected a 5E object."));
      return;
    }
    if (["text", "formula", "labeler"].includes(obj.type)) violations.push(issue("diagram_text_type", `${path}.type`, `${obj.type} is forbidden in diagram mode.`));
    for (const key of RENDERED_TEXT_FIELDS) {
      if (typeof obj[key] === "string" && obj[key].trim()) violations.push(issue("diagram_text", `${path}.${key}`, "Rendered text is forbidden in diagram mode."));
    }
    if (Array.isArray(obj.terminalLabels) && obj.terminalLabels.some((v) => String(v || "").trim())) violations.push(issue("diagram_text", `${path}.terminalLabels`, "Terminal labels are forbidden in diagram mode."));
    if (["line", "polyline", "curve"].includes(obj.type) && obj.arrowHead && obj.arrowHead !== "none") violations.push(issue("diagram_arrow", `${path}.arrowHead`, "Arrowheads are forbidden in diagram mode."));
    if (obj.type === "line" && obj.lineMode && obj.lineMode !== "solid") violations.push(issue("diagram_line_mode", `${path}.lineMode`, "Annotated line modes are forbidden in diagram mode."));
    if (obj.type === "particlebox" && obj.motion === "arrow") violations.push(issue("diagram_arrow", `${path}.motion`, "Particle arrows are forbidden in diagram mode."));
    if (obj.type === "coordplane" && obj.showAxisLines !== false) violations.push(issue("diagram_axis_arrow", `${path}.showAxisLines`, "The current coordplane renderer adds axis arrows."));
    if (obj.type === "pedigree" && obj.showNumbers !== false) violations.push(issue("diagram_numbers", `${path}.showNumbers`, "Pedigree numbers are forbidden in diagram mode."));
    if (obj.type === "optics" && obj.kind === "object_arrow") violations.push(issue("diagram_arrow", `${path}.kind`, "Object arrow is forbidden in diagram mode."));
    if (obj.type === "circuit" && DIAGRAM_TEXT_CIRCUITS.has(obj.element)) violations.push(issue("diagram_intrinsic_text", `${path}.element`, "Circuit element renders a text glyph."));
    if (obj.type === "apparatus" && DIAGRAM_UNSAFE_APPARATUS.has(obj.kind)) violations.push(issue("diagram_intrinsic_annotation", `${path}.kind`, "Apparatus renders intrinsic text or an arrow."));
  });
  return violations;
}

/**
 * Validate, normalize and compile a limited scene JSON payload.
 *
 * The result is useful even when unsupported is false: callers can show precise
 * diagnostics or choose the raster fallback without attempting a canvas insert.
 */
export function compileFastScene(input, options = {}) {
  const started = nowMs();
  const errors = [], warnings = [], unsupported = [];
  const root = parsePayload(input, errors);
  const ctx = {
    errors, warnings, unsupported, objects: [], artboard: { ...DEFAULT_ARTBOARD },
    mode: "diagram", strict: options.strict === true,
    layerId: Number.isInteger(options.layerId) ? options.layerId : 1,
    idPrefix: String(options.idPrefix || "ai_scene").replace(/[^a-z0-9_-]/gi, "_").slice(0, 40) || "ai_scene",
    originNormalization: { applied: false, from: "centered", to: "centered", dx: 0, dy: 0 },
  };
  if (!root) return finishResult(ctx, started, 0);

  const rootAllowed = new Set(["schema", "mode", "artboard", "elements"]);
  for (const key of Object.keys(root)) {
    if (rootAllowed.has(key)) continue;
    const item = issue("field_ignored", `$.${key}`, `Root field "${key}" was ignored.`);
    (ctx.strict ? errors : warnings).push(item);
  }
  if (root.schema != null && root.schema !== FAST_SCENE_SCHEMA_ID) {
    errors.push(issue("schema_version", "$.schema", `Expected schema "${FAST_SCENE_SCHEMA_ID}".`));
  }
  const requestedMode = options.mode || root.mode || "diagram";
  if (!FAST_SCENE_MODES.includes(requestedMode)) errors.push(issue("scene_mode", "$.mode", `Mode must be ${FAST_SCENE_MODES.join(" or ")}.`));
  else ctx.mode = requestedMode;
  ctx.artboard = normalizeArtboard(root.artboard, ctx);

  if (!Array.isArray(root.elements)) errors.push(issue("elements_required", "$.elements", "Scene elements must be an array."));
  else if (root.elements.length > LIMITS.maxElements) errors.push(issue("too_many_elements", "$.elements", `No more than ${LIMITS.maxElements} elements are allowed.`));
  else root.elements.forEach((el, index) => compileElement(el, index, ctx));

  normalizeSceneOrigin(ctx);
  warnOutOfBounds(ctx);
  if (ctx.mode === "diagram") {
    for (const violation of auditDiagramObjects(ctx.objects)) {
      errors.push(issue("diagram_invariant", violation.path, violation.message, { cause: violation.code }));
    }
  }
  return finishResult(ctx, started, Array.isArray(root.elements) ? root.elements.length : 0);
}

function finishResult(ctx, started, inputElements) {
  const compileMs = Math.max(0, nowMs() - started);
  return {
    schema: FAST_SCENE_SCHEMA_ID,
    mode: ctx.mode,
    artboard: ctx.artboard,
    objects: ctx.objects,
    valid: ctx.errors.length === 0,
    supported: ctx.errors.length === 0 && ctx.unsupported.length === 0,
    errors: ctx.errors,
    warnings: ctx.warnings,
    unsupported: ctx.unsupported,
    stats: {
      inputElements,
      outputObjects: ctx.objects.length,
      compileMs,
      requiresRasterFallback: ctx.unsupported.length > 0,
      originNormalization: ctx.originNormalization,
    },
  };
}

/** Support-only view used by a router before choosing vector or raster. */
export function assessFastSceneSupport(input, options = {}) {
  const result = compileFastScene(input, options);
  return {
    valid: result.valid,
    supported: result.supported,
    errors: result.errors,
    warnings: result.warnings,
    unsupported: result.unsupported,
    stats: result.stats,
  };
}

/** Alias with an explicit name for call sites that insert returned 5E objects. */
export function convertFastSceneToObjects(input, options = {}) {
  return compileFastScene(input, options);
}
