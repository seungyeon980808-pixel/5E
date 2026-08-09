import { renderObject } from "./render.js?v=1.4.3";
import { makeFillPattern } from "./render/fill.js?v=1.4.0";

const SVG_NS = "http://www.w3.org/2000/svg";
let insertSerial = 0;

function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function fastSceneToSvgDataUrl({ objects = [], artboard = { w: 160, h: 90 } } = {}) {
  const w = Math.max(20, Number(artboard.w) || 160);
  const h = Math.max(20, Number(artboard.h) || 90);
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttribute("viewBox", `${-w / 2} ${-h / 2} ${w} ${h}`);
  svg.setAttribute("width", String(Math.round(w * 8)));
  svg.setAttribute("height", String(Math.round(h * 8)));
  const defs = document.createElementNS(SVG_NS, "defs");
  svg.appendChild(defs);
  for (const obj of objects) {
    const pattern = makeFillPattern(obj);
    if (pattern) defs.appendChild(pattern);
  }
  for (const obj of objects) {
    const rendered = renderObject(obj);
    if (rendered) svg.appendChild(rendered);
  }
  const source = new XMLSerializer().serializeToString(svg);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
}

const SCALAR_LENGTH_FIELDS = new Set([
  "strokeWidth", "radius", "symbolRadius", "particleRadius", "leadLength",
  "waveLength", "waveAmp", "cornerRadius", "fontSize", "tickLength",
]);

function scalePoint(point, scale) {
  if (!point || typeof point !== "object") return;
  if (Number.isFinite(point.x)) point.x *= scale;
  if (Number.isFinite(point.y)) point.y *= scale;
}

function scaleObject(obj, scale) {
  if (Number.isFinite(obj.x)) obj.x *= scale;
  if (Number.isFinite(obj.y)) obj.y *= scale;
  if (Number.isFinite(obj.w)) obj.w *= scale;
  if (Number.isFinite(obj.h)) obj.h *= scale;
  scalePoint(obj.p1, scale);
  scalePoint(obj.p2, scale);
  if (Array.isArray(obj.points)) obj.points.forEach((point) => scalePoint(point, scale));
  for (const field of SCALAR_LENGTH_FIELDS) {
    if (Number.isFinite(obj[field])) obj[field] *= scale;
  }
  return obj;
}

export function insertFastSceneIntoState(state, scene, { fitRatio = 0.9 } = {}) {
  if (!state || !scene?.objects?.length) throw new Error("삽입할 빠른 벡터 장면이 없습니다.");
  const current = state.get();
  const source = scene.artboard || { w: 160, h: 90 };
  const scale = Math.min(
    (current.artboard.w * fitRatio) / Math.max(1, Number(source.w) || 160),
    (current.artboard.h * fitRatio) / Math.max(1, Number(source.h) || 90),
    1,
  );
  const objects = clone(scene.objects).map((obj) => scaleObject(obj, scale));
  const stamp = `${Date.now().toString(36)}_${++insertSerial}`;
  const idMap = new Map(objects.map((obj, index) => [obj.id, `obj_ai_${stamp}_${index + 1}`]));
  const groupId = objects.length > 1 ? `grp_ai_${stamp}` : null;
  for (const obj of objects) {
    const previousId = obj.id;
    obj.id = idMap.get(previousId);
    for (const key of ["planeId", "parentId", "sourceId"]) {
      if (obj[key] && idMap.has(obj[key])) obj[key] = idMap.get(obj[key]);
    }
    if (groupId) obj.groupId = groupId;
  }

  state.update((draft) => {
    draft.undoStack.push(clone(draft.objects));
    draft.redoStack = [];
    const addedIds = [];
    for (const obj of objects) {
      obj.layerId = draft.activeLayerId;
      obj.order = draft.objects.length;
      draft.objects.push(obj);
      addedIds.push(obj.id);
    }
    if (groupId) (draft.groups = draft.groups || []).push({ id: groupId, memberIds: [...addedIds] });
    draft.selectedIds = addedIds;
    draft.targetedId = null;
    draft.activeTool = "V";
  });
  return { added: objects.length, ids: objects.map((obj) => obj.id), scale };
}
