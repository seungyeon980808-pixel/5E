// Creation defaults are data-only. Importing shape/project helpers must not
// initialize settings dialogs or attach browser event listeners.
import { previewStorage as localStorage } from './preview-storage.js?v=1.7.0-four-session-integration';
import { DEFAULT_TEXT_FONT, DEFAULT_TEXT_SIZE_MM, ptToMm, MIN_TEXT_PT } from './state.js?v=1.7.0-four-session-integration';

export const DEFAULTS_KEY = "phyDraw.defaults";
export const FACTORY_DEFAULTS = {
  strokeWidth: 0.2,      // mm
  strokeLevel: 0,        // 0 = black
  fillLevel: 255,        // opaque white default for new shapes
  textSizeMm: DEFAULT_TEXT_SIZE_MM,  // matches DEFAULT_TEXT_SIZE_MM
  textFont: DEFAULT_TEXT_FONT,       // css font-family string
  textWeight: "normal",
  textStyle: "normal",
  gridVisible: false,
  gridOpacity: 3,
  gridInterval: 10,
  rulerTickMm: 10,        // 자 눈금 간격(mm) — 새 자 생성 시 초깃값
  protractorTickDeg: 10,  // 각도기 눈금 간격(°)
};

export function loadDefaults() {
  try {
    const stored = JSON.parse(localStorage.getItem(DEFAULTS_KEY) || "{}");
    return { ...FACTORY_DEFAULTS, ...(stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {}) };
  } catch {
    return { ...FACTORY_DEFAULTS };
  }
}

export function finiteDefault(value, fallback, min = 0, max = Infinity) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

// 생성 지점에서만 호출한다. 가져온 프로젝트·기존 객체·AI 생성 결과를 일괄 재색칠하지 않는다.
// 부모의 도구 생성 경로와 텍스트 초안 진입점에서 재사용하도록 명시적으로 내보낸다.
export function getToolTextDefaults(d = loadDefaults()) {
  return {
    fontFamily: typeof d.textFont === "string" && d.textFont ? d.textFont : DEFAULT_TEXT_FONT,
    fontSize: finiteDefault(d.textSizeMm, DEFAULT_TEXT_SIZE_MM, ptToMm(MIN_TEXT_PT)),
    fontWeight: d.textWeight || "normal",
    fontStyle: d.textStyle || "normal",
    italic: d.textStyle === "italic",
  };
}

export function applyToolDefaultsToNewObject(object, d = loadDefaults()) {
  const next = { ...object };
  if ("strokeWidth" in next && Number(next.strokeWidth) > 0) next.strokeWidth = finiteDefault(d.strokeWidth, FACTORY_DEFAULTS.strokeWidth, 0.01);
  if ("strokeLevel" in next) next.strokeLevel = finiteDefault(d.strokeLevel, 0, 0, 255);
  if ("fillLevel" in next && !next.fillNone) next.fillLevel = finiteDefault(d.fillLevel, 255, 0, 255);
  if (next.type === "text") Object.assign(next, getToolTextDefaults(d));
  return next;
}
