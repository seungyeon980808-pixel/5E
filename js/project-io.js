/* ===== PROJECT I/O (save / open editable source as JSON) ===== */
//
// This is the *editable source* format — the data needed to reconstruct the
// drawing — and is separate from image export (built later). We serialize only
// the persistent drawing data; transient session state (undo/redo, selection,
// active tool/layer, viewBox) is deliberately NOT saved.
//
// Groups are NOT stored: each object already carries `groupId`, and groups are
// derived from it everywhere (see transform.js rebuildGroups + the undo engine,
// which snapshots only `objects` and rebuilds groups). groupId is the single
// source of truth, so we rebuild groups on load via that same helper.

import { rebuildGroups } from "./transform.js?v=0.16.3";

// Schema version of the saved file. Distinct from the app UI version.
// 0.14 adds `artboard` (page size). Older files without it default to 90×60.
const SCHEMA_VERSION = "0.14";

// Default artboard size for files saved before the artboard field existed.
const DEFAULT_ARTBOARD = { w: 90, h: 60 };

// Default download filename for a saved project.
const DEFAULT_FILENAME = "physics_drawing.json";

/* ----- migrate: bring an older saved file up to the current schema ----- */
// Currently only "0.13" exists, so this is a pass-through. As the schema
// evolves, insert version-specific transforms here, e.g.:
//   if (data.version === "0.13") { data = upgrade_0_13_to_0_14(data); }
function migrate(data) {
  return data;
}

/* ----- serialize: build the saved-file object from live state ----- */
function serialize(s) {
  return {
    version: SCHEMA_VERSION,
    objects: s.objects,
    layers: s.layers,
    // artboard: page size (single source of truth for export/render dimensions).
    artboard: s.artboard,
    // groups omitted on purpose — derived from obj.groupId on load.
  };
}

/* ----- saveProject: download current drawing as a .json file ----- */
function saveProject(state) {
  const json = JSON.stringify(serialize(state.get()), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = DEFAULT_FILENAME;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ----- applyLoaded: replace drawing data through the store (re-renders) ----- */
function applyLoaded(state, data) {
  state.update((s) => {
    // Replace the persistent drawing data.
    s.objects = data.objects;
    s.layers = data.layers;
    // Restore artboard; older files (no artboard field) default to 90×60.
    s.artboard = (data.artboard && typeof data.artboard.w === "number"
                  && typeof data.artboard.h === "number")
      ? { w: data.artboard.w, h: data.artboard.h }
      : { ...DEFAULT_ARTBOARD };
    // Groups are derived from groupId — rebuild rather than trust the file.
    rebuildGroups(s);

    // Fresh session for the opened file: drop history + selection.
    s.undoStack = [];
    s.redoStack = [];
    s.selectedIds = [];
    s.targetedId = null;
    s.draft = null;

    // Keep activeLayerId valid against the loaded layers.
    if (!s.layers.some((l) => l.id === s.activeLayerId)) {
      s.activeLayerId = s.layers[0] ? s.layers[0].id : 1;
    }
    // viewBox is left as-is on purpose (do not restore saved view).
  });
}

/* ----- openProject: read a .json file and load it into state ----- */
function openProject(state, file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const raw = JSON.parse(reader.result);
      const data = migrate(raw);

      // Structural sanity check before touching live state.
      if (
        !data ||
        typeof data !== "object" ||
        !Array.isArray(data.objects) ||
        !Array.isArray(data.layers)
      ) {
        throw new Error("필요한 데이터(objects/layers) 형식이 올바르지 않습니다.");
      }

      applyLoaded(state, data);
    } catch (err) {
      // On any failure, do NOT corrupt current state — just warn.
      alert("프로젝트 파일을 열 수 없습니다.\n" + (err && err.message ? err.message : err));
    }
  };
  reader.onerror = () => alert("파일을 읽는 중 오류가 발생했습니다.");
  reader.readAsText(file);
}

/* ----- initProjectIO: wire the top-bar buttons + hidden file input ----- */
export function initProjectIO(state) {
  const saveBtn = document.getElementById("project-save");
  const openBtn = document.getElementById("project-open");

  // Hidden file input, created here so index.html stays markup-only.
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json";
  fileInput.style.display = "none";
  document.body.appendChild(fileInput);

  if (saveBtn) saveBtn.addEventListener("click", () => saveProject(state));

  if (openBtn) openBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) openProject(state, file);
    // Reset so selecting the same file again still fires "change".
    fileInput.value = "";
  });
}
