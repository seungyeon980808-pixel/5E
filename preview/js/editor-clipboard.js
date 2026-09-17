import { OBJECT_TYPE_IDS, SIZE_TYPES, TEXT_MEASURED_TYPES, ENDPOINT_HANDLE_TYPES } from "./object-types.js?v=1.6.0-preview-labeler-0917-1111";
import { blocksCanvasShortcut } from "./platform.js?v=1.6.0-preview-labeler-0917-1111";
import { showAlert } from "./ui-dialogs.js?v=1.6.0-preview-labeler-0917-1111";

const MIME = "application/x-5e-objects+json";
const FORMAT = "5e-clipboard";
let cloneSequence = 0;

export function cloneClipboardObjects(objects) {
  const stamp = `${Date.now().toString(36)}_${++cloneSequence}`;
  const ids = new Map(objects.map((obj, i) => [obj.id, `obj_${stamp}_${i}`]));
  const groups = new Map();
  return objects.map((source) => {
    const obj = JSON.parse(JSON.stringify(source));
    obj.id = ids.get(source.id);
    if (source.groupId) {
      if (!groups.has(source.groupId)) groups.set(source.groupId, `grp_${stamp}_${groups.size}`);
      obj.groupId = groups.get(source.groupId);
    }
    // A graph copied with its plane stays attached; a standalone graph keeps
    // baked geometry without retaining a reference into the source document.
    if (source.planeId != null) {
      if (ids.has(source.planeId)) obj.planeId = ids.get(source.planeId);
      else delete obj.planeId;
    }
    return obj;
  });
}

function blocked(event) {
  return blocksCanvasShortcut(event) || !!event.target?.closest?.(
    "#inspector, .text-editor-overlay, .font-modal-overlay, .text-ctx-menu");
}

function validGeometry(obj) {
  const point = value => value && Number.isFinite(value.x) && Number.isFinite(value.y);
  if (SIZE_TYPES.has(obj.type)) return point(obj) && Number.isFinite(obj.w) && obj.w > 0 && Number.isFinite(obj.h) && obj.h > 0;
  if (ENDPOINT_HANDLE_TYPES.has(obj.type)) return point(obj.p1) && point(obj.p2);
  if (["polyline", "curve", "funcgraph"].includes(obj.type)) return Array.isArray(obj.points) && obj.points.length > 0 && obj.points.every(point);
  if (TEXT_MEASURED_TYPES.has(obj.type)) return point(obj);
  if (obj.type === "anglearc") return point(obj) && Number.isFinite(obj.radius) && obj.radius > 0;
  if (obj.type === "rightangle") return point(obj) && Number.isFinite(obj.size) && obj.size > 0;
  return false;
}

function readObjects(data) {
  const raw = data.getData(MIME) || data.getData("text/plain");
  if (!raw) return null;
  let payload;
  try { payload = JSON.parse(raw); } catch { return null; }
  if (payload?.format !== FORMAT || payload.version !== 1 || !Array.isArray(payload.objects)) return null;
  const objects = payload.objects;
  if (!objects.length || objects.some(obj => !obj || typeof obj.id !== "string" || !OBJECT_TYPE_IDS.includes(obj.type))) return null;
  if (new Set(objects.map(obj => obj.id)).size !== objects.length) return null;
  if (!objects.every(validGeometry)) throw new Error("invalid clipboard geometry");
  return objects;
}

export function initObjectClipboard(state, insert, rebuildGroups) {
  const copy = (event, cutting) => {
    if (blocked(event)) return;
    const s = state.get();
    const selected = new Set(s.selectedIds || []);
    const planes = new Set(s.objects.filter(obj => selected.has(obj.id) && obj.type === "coordplane" && (!cutting || !obj.locked)).map(obj => obj.id));
    if (cutting) {
      for (const obj of s.objects) {
        if (obj.locked && planes.has(obj.planeId)) {
          selected.delete(obj.planeId);
          planes.delete(obj.planeId);
        }
      }
    }
    const objects = s.objects.filter(obj => (selected.has(obj.id) || planes.has(obj.planeId)) && (!cutting || !obj.locked));
    if (!objects.length) return;
    // Prevent native cut from removing DOM selections if writing is denied.
    event.preventDefault();
    try {
      if (!event.clipboardData) throw new Error("clipboard unavailable");
      const payload = JSON.stringify({ format: FORMAT, version: 1, objects });
      event.clipboardData.setData("text/plain", payload);
      event.clipboardData.setData(MIME, payload);
    } catch {
      void showAlert("클립보드에 복사하지 못했습니다. 원본은 유지됩니다. 다시 시도해 주세요.", { title: "복사 실패" });
      return;
    }
    if (!cutting) return;
    const ids = new Set(objects.map(obj => obj.id));
    state.update(current => {
      current.undoStack.push(JSON.parse(JSON.stringify(current.objects)));
      current.redoStack = [];
      current.objects = current.objects.filter(obj => !ids.has(obj.id));
      current.selectedIds = (current.selectedIds || []).filter(id => !ids.has(id));
      current.targetedId = null;
      rebuildGroups(current);
    });
  };
  document.addEventListener("copy", event => copy(event, false));
  document.addEventListener("cut", event => copy(event, true));
  document.addEventListener("paste", event => {
    if (blocked(event) || !event.clipboardData) return;
    try {
      const objects = readObjects(event.clipboardData);
      if (!objects) return;
      event.preventDefault();
      insert(objects);
    } catch {
      event.preventDefault();
      void showAlert("복사한 객체 데이터가 올바르지 않습니다. 원본에서 다시 복사해 주세요.", { title: "붙여넣기 실패" });
    }
  });
}
