/* ===== STRICT CODE-NATIVE ILLUSTRATION ASSETS =============================
 *
 * Original, deterministic evaluation-style line art for the two illustration
 * families that passed the strict 3,961-exam / 936-atlas reuse audit.
 * Nothing here embeds or traces exam pixels.  Output is the existing limited
 * fast-scene contract, then ordinary editable 5E objects.
 *
 * Diagram-mode invariants:
 * - no text, numbers, symbols, labels, leaders or arrows;
 * - white fills, with gray only for a physically distinct spacecraft window;
 * - optional devices are closed enums and default to none;
 * - semantic components receive separate group ids after compilation.
 */

import {
  FAST_SCENE_SCHEMA_ID,
  auditDiagramObjects,
  compileFastScene,
} from "./ai-scene-fastpath.js";

export const ILLUSTRATION_ASSET_CATALOG_VERSION = "5e-strict-illustration-assets@1";

const CATALOG = Object.freeze({
  student_trio_seated_dialogue: Object.freeze({
    id: "student_trio_seated_dialogue",
    title: "Seated student trio (diagram-only)",
    auditEvidence: 13,
    implementation: "original-code-native",
    components: Object.freeze(["table", "student_1", "student_2", "student_3", "bubble_1", "bubble_2", "bubble_3"]),
    blankSpeechBubbleAuditEvidence: 31,
    speechBubblePolicy: "Default none. Blank outlines require speechBubbleEvidence:'source' or 'request'; text remains a separate 5E edit.",
    sourcePixelsEmbedded: false,
    doNotGeneralize: Object.freeze([
      "Do not reuse for standing, teacher, portrait-only, or apparatus-operation poses.",
      "Do not add labels or speech-bubble text; blank outlines require explicit source evidence.",
      "Do not add chairs, screens, laboratory apparatus, or other props by assumption.",
    ]),
    note: "Three distinct seated figures and one table. Optional source-confirmed bubble outlines never contain text.",
  }),
  spacecraft_flat_shell: Object.freeze({
    id: "spacecraft_flat_shell",
    title: "Composable flat spacecraft shell",
    auditEvidence: 18,
    implementation: "original-code-native",
    components: Object.freeze(["shell", "window", "occupant", "device"]),
    sourcePixelsEmbedded: false,
    doNotGeneralize: Object.freeze([
      "Do not reuse as a road vehicle, cart, ship, or bicycle family.",
      "Do not infer a window, occupant, device, direction, path, or experiment-specific structure.",
      "Do not merge shell, occupant, window, or device provenance into one baked image.",
    ]),
    note: "Shell, window, occupant and an explicitly requested device compile to separate editable groups.",
  }),
});

export const ILLUSTRATION_ASSET_CATALOG = CATALOG;
export const ILLUSTRATION_ASSET_IDS = Object.freeze(Object.keys(CATALOG));

const TABLE_SHAPES = new Set(["rect", "round"]);
const SPEECH_BUBBLES = new Set(["none", "three_blank"]);
const SPEECH_BUBBLE_EVIDENCE = new Set(["source", "request"]);
const BUBBLE_TAILS = new Set(["down_left", "down", "down_right"]);
const SHELL_PROPORTIONS = new Set(["compact", "long"]);
const FACINGS = new Set(["left", "right"]);
const WINDOWS = new Set(["none", "single", "wide"]);
const OCCUPANTS = new Set(["none", "seated"]);
const DEVICES = new Set(["none", "point_source", "detector_box", "plane_mirror"]);
const DEVICE_SLOTS = new Set(["rear", "center", "front"]);

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertOptions(options, allowed, assetId) {
  if (!plainObject(options)) throw new TypeError(`${assetId} options must be an object.`);
  const extra = Object.keys(options).filter((key) => !allowed.has(key));
  if (extra.length) throw new RangeError(`${assetId} does not allow option(s): ${extra.join(", ")}.`);
}

function enumOption(value, fallback, allowed, name) {
  const selected = value == null ? fallback : String(value);
  if (!allowed.has(selected)) throw new RangeError(`${name} must be one of: ${[...allowed].join(", ")}.`);
  return selected;
}

function artboard(value, fallback, name) {
  if (value == null) return { ...fallback };
  if (!plainObject(value)) throw new TypeError(`${name} must be {w,h}.`);
  const w = Number(value.w), h = Number(value.h);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 100 || w > 300 || h < 60 || h > 180) {
    throw new RangeError(`${name} must stay within w=100..300 and h=60..180 mm.`);
  }
  return { w, h };
}

function scene(board, elements) {
  return { schema: FAST_SCENE_SCHEMA_ID, mode: "diagram", artboard: board, elements };
}

function definition(board) {
  const elements = [];
  const componentByElement = [];
  const push = (component, ...items) => {
    for (const item of items) {
      elements.push(item);
      componentByElement.push(component);
    }
  };
  return { board, elements, componentByElement, push };
}

function studentFigure(cx, variant) {
  const lean = variant === "left" ? -1.2 : variant === "right" ? 1.2 : 0;
  const hx = cx + lean;
  const shoulderY = -11;
  const arms = variant === "left"
    ? { leftElbow: [-9.0, -3.0], leftHand: [-7.2, 6.0], rightElbow: [7.0, -5.0], rightHand: [5.6, 6.6] }
    : variant === "right"
      ? { leftElbow: [-7.0, -5.0], leftHand: [-5.6, 6.6], rightElbow: [9.0, -3.0], rightHand: [7.2, 6.0] }
      : { leftElbow: [-8.2, -4.2], leftHand: [-6.0, 6.5], rightElbow: [7.5, -3.7], rightHand: [6.4, 6.2] };
  return [
    { type: "ellipse", box: [hx - 3.6, -23, 7.2, 8.2], tone: "white", fill: true },
    {
      type: "curve",
      points: [[hx - 3.0, -17.0], [cx - 5.2, -10.5], [cx - 4.4, 1.5], [cx, 5.0], [cx + 4.4, 1.5], [cx + 5.2, -10.5], [hx + 3.0, -17.0]],
      closed: true, fill: true, tone: "white", arrow: "none",
    },
    { type: "polyline", points: [[cx - 4.6, shoulderY], [cx + arms.leftElbow[0], arms.leftElbow[1]], [cx + arms.leftHand[0], arms.leftHand[1]]], fill: false, arrow: "none" },
    { type: "polyline", points: [[cx + 4.6, shoulderY], [cx + arms.rightElbow[0], arms.rightElbow[1]], [cx + arms.rightHand[0], arms.rightHand[1]]], fill: false, arrow: "none" },
    { type: "polyline", points: [[cx - 2.2, 3.5], [cx - 6.0, 13.5], [cx - 9.0, 18.0]], fill: false, arrow: "none" },
    { type: "polyline", points: [[cx + 2.2, 3.5], [cx + 6.0, 13.5], [cx + 9.0, 18.0]], fill: false, arrow: "none" },
    // A short hair contour gives a readable head direction without gray fill.
    { type: "curve", points: [[hx - 2.8, -19.1], [hx, -22.0], [hx + 2.8, -19.1]], closed: false, fill: false, arrow: "none" },
  ];
}

function blankSpeechBubble(cx, tailDirection) {
  const offset = tailDirection === "down_left" ? -5.5 : tailDirection === "down_right" ? 5.5 : 0;
  const left = cx - 18, right = cx + 18, top = -42.5, bottom = -29.5;
  return {
    type: "curve",
    points: [
      [left + 4, top], [right - 4, top], [right, top + 4], [right, bottom - 3],
      [cx + 5, bottom], [cx + offset, -25.5], [cx - 5, bottom],
      [left, bottom - 3], [left, top + 4],
    ],
    closed: true,
    fill: true,
    tone: "white",
    arrow: "none",
  };
}

function createStudentTrioDefinition(options) {
  assertOptions(options, new Set([
    "artboard", "tableShape", "speechBubbles", "speechBubbleEvidence", "bubbleTails",
  ]), "student_trio_seated_dialogue");
  const board = artboard(options.artboard, { w: 150, h: 90 }, "student_trio_seated_dialogue.artboard");
  const tableShape = enumOption(options.tableShape, "rect", TABLE_SHAPES, "tableShape");
  const speechBubbles = enumOption(options.speechBubbles, "none", SPEECH_BUBBLES, "speechBubbles");
  if (speechBubbles !== "none" && !SPEECH_BUBBLE_EVIDENCE.has(options.speechBubbleEvidence)) {
    throw new RangeError("Blank speech bubbles require speechBubbleEvidence:'source' or 'request'; never add them by assumption.");
  }
  if (speechBubbles === "none" && options.speechBubbleEvidence != null) {
    throw new RangeError("speechBubbleEvidence is only allowed when speechBubbles:'three_blank'.");
  }
  if (options.bubbleTails != null && speechBubbles === "none") {
    throw new RangeError("bubbleTails is only allowed when speechBubbles:'three_blank'.");
  }
  const rawTails = options.bubbleTails == null
    ? ["down_right", "down", "down_left"]
    : options.bubbleTails;
  if (!Array.isArray(rawTails) || rawTails.length !== 3) throw new TypeError("bubbleTails must contain exactly three directions.");
  const bubbleTails = rawTails.map((tail, index) => enumOption(tail, "down", BUBBLE_TAILS, `bubbleTails[${index}]`));
  const d = definition(board);

  // Legs are behind the figures and tabletop; no chairs or unrequested props.
  d.push("table",
    { type: "line", from: [-42, 15], to: [-42, 35], arrow: "none" },
    { type: "line", from: [42, 15], to: [42, 35], arrow: "none" },
  );
  const centers = [-42, 0, 42];
  const variants = ["right", "neutral", "left"];
  centers.forEach((cx, index) => d.push(`student_${index + 1}`, ...studentFigure(cx, variants[index])));
  if (speechBubbles === "three_blank") {
    centers.forEach((cx, index) => d.push(`bubble_${index + 1}`, blankSpeechBubble(cx, bubbleTails[index])));
  }
  if (tableShape === "round") {
    d.push("table", { type: "ellipse", box: [-66, 3.5, 132, 19], tone: "white", fill: true });
  } else {
    d.push("table", { type: "rect", box: [-66, 5, 132, 14], tone: "white", fill: true });
  }
  return { scene: scene(board, d.elements), componentByElement: d.componentByElement };
}

function mirrorPoint(point, facing) {
  return facing === "right" ? point : [-point[0], point[1]];
}

function mirrorBox(raw, facing) {
  if (facing === "right") return raw;
  return [-raw[0] - raw[2], raw[1], raw[2], raw[3]];
}

function occupantFigure(cx, cy, facing) {
  const side = facing === "right" ? 1 : -1;
  return [
    { type: "ellipse", box: [cx - 2.2, cy - 10.0, 4.4, 5.0], tone: "white", fill: true },
    { type: "polyline", points: [[cx, cy - 5.0], [cx, cy + 3.0], [cx + side * 3.4, cy + 6.5]], fill: false, arrow: "none" },
    { type: "polyline", points: [[cx, cy - 3.2], [cx + side * 4.0, cy - 0.5], [cx + side * 6.0, cy - 0.5]], fill: false, arrow: "none" },
    { type: "polyline", points: [[cx, cy + 2.5], [cx - side * 2.5, cy + 7.0], [cx - side * 5.2, cy + 7.0]], fill: false, arrow: "none" },
  ];
}

function deviceElements(device, x, facing) {
  if (device === "point_source") {
    return [{ type: "ellipse", box: [x - 2.0, -2.0, 4.0, 4.0], tone: "white", fill: true }];
  }
  if (device === "detector_box") {
    return [{ type: "rect", box: [x - 4.0, -5.0, 8.0, 10.0], tone: "white", fill: true }];
  }
  if (device === "plane_mirror") {
    return [{ type: "rect", box: [x - 0.8, -8.0, 1.6, 16.0], tone: "gray", fill: true }];
  }
  return [];
}

function createSpacecraftDefinition(options) {
  assertOptions(options, new Set(["artboard", "proportions", "facing", "window", "occupant", "device", "deviceSlot"]), "spacecraft_flat_shell");
  const board = artboard(options.artboard, { w: 160, h: 80 }, "spacecraft_flat_shell.artboard");
  const proportions = enumOption(options.proportions, "long", SHELL_PROPORTIONS, "proportions");
  const facing = enumOption(options.facing, "right", FACINGS, "facing");
  const window = enumOption(options.window, "none", WINDOWS, "window");
  const occupant = enumOption(options.occupant, "none", OCCUPANTS, "occupant");
  const device = enumOption(options.device, "none", DEVICES, "device");
  const deviceSlot = enumOption(options.deviceSlot, "front", DEVICE_SLOTS, "deviceSlot");
  if (occupant !== "none" && window === "none") throw new RangeError("occupant requires an explicit single or wide window.");
  if (device !== "none" && window === "none") throw new RangeError("device requires an explicit single or wide window.");
  if (occupant !== "none" && device !== "none" && window !== "wide") {
    throw new RangeError("occupant plus device requires the wide window so components do not overlap.");
  }
  if (occupant !== "none" && device !== "none" && deviceSlot === "rear") {
    throw new RangeError("rear device slot is reserved for the seated occupant.");
  }

  const d = definition(board);
  const halfW = proportions === "long" ? 66 : 56;
  const halfH = proportions === "long" ? 18 : 21;
  const noseX = halfW;
  const rearX = -halfW;
  const shoulderX = proportions === "long" ? 40 : 33;
  const shellPath = [
    [rearX, 0], [rearX + 9, -halfH], [shoulderX, -halfH], [noseX, 0],
    [shoulderX, halfH], [rearX + 9, halfH],
  ].map((point) => mirrorPoint(point, facing));
  d.push("shell", {
    type: "curve", points: shellPath, closed: true, fill: true, tone: "white", arrow: "none",
  });

  if (window !== "none") {
    const raw = window === "wide" ? [-37, -11, 65, 22] : [-24, -10, 30, 20];
    d.push("window", { type: "ellipse", box: mirrorBox(raw, facing), tone: "gray", fill: true });
  }

  d.push("shell",
    { type: "line", from: mirrorPoint([rearX + 10, -halfH + 2], facing), to: mirrorPoint([rearX + 10, halfH - 2], facing), arrow: "none" },
    { type: "line", from: mirrorPoint([shoulderX, -halfH + 1], facing), to: mirrorPoint([shoulderX, halfH - 1], facing), arrow: "none" },
  );

  if (occupant === "seated") {
    const x = facing === "right" ? -20 : 20;
    d.push("occupant", ...occupantFigure(x, 0, facing));
  }
  if (device !== "none") {
    const canonicalSlot = { rear: -21, center: 0, front: 21 }[deviceSlot];
    const x = facing === "right" ? canonicalSlot : -canonicalSlot;
    d.push("device", ...deviceElements(device, x, facing));
  }
  return { scene: scene(board, d.elements), componentByElement: d.componentByElement };
}

function createDefinition(id, options) {
  if (!CATALOG[id]) throw new RangeError(`Unknown strict illustration asset "${String(id)}".`);
  if (id === "student_trio_seated_dialogue") return createStudentTrioDefinition(options);
  return createSpacecraftDefinition(options);
}

export function listIllustrationAssets() {
  return ILLUSTRATION_ASSET_IDS.map((id) => ({
    ...CATALOG[id],
    components: [...CATALOG[id].components],
    doNotGeneralize: [...CATALOG[id].doNotGeneralize],
  }));
}

export function getIllustrationAssetMetadata(id) {
  const item = CATALOG[id];
  return item ? { ...item, components: [...item.components], doNotGeneralize: [...item.doNotGeneralize] } : null;
}

export function createIllustrationAssetScene(id, options = {}) {
  return createDefinition(id, options).scene;
}

/** Compile and preserve separately editable semantic groups. */
export function compileIllustrationAsset(id, options = {}, compileOptions = {}) {
  const created = createDefinition(id, options);
  const idPrefix = String(compileOptions.idPrefix || `illustration_${id}`).replace(/[^a-z0-9_-]/gi, "_").slice(0, 40);
  const result = compileFastScene(created.scene, { ...compileOptions, mode: "diagram", idPrefix });
  if (result.objects.length !== created.componentByElement.length) {
    result.errors.push({
      code: "component_mapping_mismatch",
      path: "$.elements",
      message: "Illustration element-to-component mapping no longer matches compiler output.",
    });
    result.valid = false;
    result.supported = false;
    return { ...result, assetId: id, catalogVersion: ILLUSTRATION_ASSET_CATALOG_VERSION, components: {} };
  }
  const components = {};
  result.objects.forEach((object, index) => {
    const role = created.componentByElement[index];
    const groupId = `${idPrefix}_${role}`;
    object.groupId = groupId;
    object.assetRole = role;
    if (!components[role]) components[role] = { groupId, objectIds: [] };
    components[role].objectIds.push(object.id);
  });
  const violations = auditDiagramObjects(result.objects);
  if (violations.length) {
    result.errors.push(...violations.map((violation) => ({ ...violation, code: "strict_asset_diagram_invariant" })));
    result.valid = false;
    result.supported = false;
  }
  return {
    ...result,
    assetId: id,
    catalogVersion: ILLUSTRATION_ASSET_CATALOG_VERSION,
    components,
    provenance: {
      implementation: "original-code-native",
      auditManifest: "docs/engine-v2/ILLUSTRATION_ASSET_CANDIDATES.json",
      sourcePixelsEmbedded: false,
      doNotGeneralize: [...CATALOG[id].doNotGeneralize],
    },
  };
}
