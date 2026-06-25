export const OBJECT_STYLE_MODES = {
  exam: "exam",
  free: "free",
};

export const KICE_EXAM_STYLE = {
  strokeWidth: 0.2,
  helperStrokeWidth: 0.12,
  fontFamily: '"Noto Serif KR", "Batang", "Times New Roman", serif',
  dashLength: 0.45,
  dashGap: 0.3,
  arrowStrokeScale: 1,
  objectArrowStrokeScale: 0.9,
  lensCenterLine: "full",
};

export function getObjectStyleMode(obj) {
  return obj && obj.styleMode === OBJECT_STYLE_MODES.exam
    ? OBJECT_STYLE_MODES.exam
    : OBJECT_STYLE_MODES.free;
}

export function getExamPresetForObject(obj) {
  const preset = {
    strokeWidth: KICE_EXAM_STYLE.strokeWidth,
    fontFamily: KICE_EXAM_STYLE.fontFamily,
  };
  if (!obj) return preset;

  if (supportsDashPreset(obj)) {
    preset.dashLength = (obj.dashLength ?? 0) > 0 ? KICE_EXAM_STYLE.dashLength : 0;
    preset.dashGap = (obj.dashGap ?? 0) > 0 ? KICE_EXAM_STYLE.dashGap : 0;
  }
  if (obj.type === "optics" && (obj.kind === "convex_lens" || obj.kind === "concave_lens")) {
    preset.centerLine = (obj.centerLine || "none") === "none" ? "none" : KICE_EXAM_STYLE.lensCenterLine;
  }
  if (obj.type === "optics" && obj.kind === "object_arrow") {
    preset.strokeWidth = KICE_EXAM_STYLE.strokeWidth * KICE_EXAM_STYLE.objectArrowStrokeScale;
  }
  return preset;
}

export function resolveObjectStyle(obj) {
  if (!obj || getObjectStyleMode(obj) !== OBJECT_STYLE_MODES.exam) return obj;
  return { ...obj, ...getExamPresetForObject(obj), _sourceObject: obj };
}

export function applyNewObjectStyleDefaults(obj, mode = OBJECT_STYLE_MODES.exam) {
  if (!obj) return obj;
  obj.styleMode = mode === OBJECT_STYLE_MODES.free ? OBJECT_STYLE_MODES.free : OBJECT_STYLE_MODES.exam;
  return obj;
}

export function migrateObjectStyleMode(obj) {
  if (!obj) return obj;
  if (obj.styleMode !== OBJECT_STYLE_MODES.exam && obj.styleMode !== OBJECT_STYLE_MODES.free) {
    obj.styleMode = OBJECT_STYLE_MODES.free;
  }
  return obj;
}

export function prepareObjectStyleModeSwitch(obj, nextMode) {
  if (!obj) return false;
  const mode = nextMode === OBJECT_STYLE_MODES.exam ? OBJECT_STYLE_MODES.exam : OBJECT_STYLE_MODES.free;
  if (getObjectStyleMode(obj) === mode) return false;
  if (mode === OBJECT_STYLE_MODES.exam) {
    obj._freeStyleInitialized = true;
  }
  if (mode === OBJECT_STYLE_MODES.free && !obj._freeStyleInitialized) {
    Object.assign(obj, getExamPresetForObject(obj));
    obj._freeStyleInitialized = true;
  }
  obj.styleMode = mode;
  return true;
}

function supportsDashPreset(obj) {
  return ["rect", "ellipse", "triangle", "line", "polyline", "curve"].includes(obj.type)
    || (obj.type === "optics" && obj.kind === "object_arrow");
}
