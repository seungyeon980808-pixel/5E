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

import { rebuildGroups } from "./transform.js?v=0.36.5";
import { screenToWorld } from "./viewport.js?v=0.36.5";
import { applyNewObjectStyleDefaults, migrateObjectStyleMode } from "./style-mode.js?v=0.36.5";
import { DEFAULT_TEXT_SIZE_MM, DEFAULT_TEXT_FONT } from "./state.js?v=0.36.5";

// Schema version of the saved file. Distinct from the app UI version.
// 0.15 adds editing guides; older files without them load with an empty guide list.
const SCHEMA_VERSION = "0.15";

// Default artboard size for files saved before the artboard field existed.
const DEFAULT_ARTBOARD = { w: 90, h: 60 };

// Default download filename for a saved project.
const DEFAULT_FILENAME = "physics_drawing.json";
const APPARATUS_TEMPLATE_IDS = {
  wire: "E001",
  compass: "E002",
  pulley: "M001",
  clamp: "M004",
  scale: "M003",
};

const LABEL_CAPABLE_TYPES = new Set(["rect", "ellipse", "line", "axes", "anglearc", "labeler", "circuit", "optics"]);

function normalizeLabelType(value, fallback = "quantity") {
  return value === "quantity" || value === "label" ? value : fallback;
}

/* ----- migrate: bring an older saved file up to the current schema ----- */
// Currently only "0.13" exists, so this is a pass-through. As the schema
// evolves, insert version-specific transforms here, e.g.:
//   if (data.version === "0.13") { data = upgrade_0_13_to_0_14(data); }
function migrate(data) {
  if (!data || !Array.isArray(data.objects)) return data;
  return {
    ...data,
    objects: data.objects.map((obj) => {
      const next = {
        ...obj,
        positionLocked: obj.positionLocked ?? false,
      };
      if (LABEL_CAPABLE_TYPES.has(next.type)) {
        next.labelType = normalizeLabelType(next.labelType, next.type === "labeler" ? "label" : "quantity");
      }
      migrateObjectStyleMode(next);
      if (next.type === "text") {
        next.italic = next.italic ?? false;
      }
      if (next.type === "formula") {
        next.italic = next.italic ?? false;
        next.rawSource = next.rawSource ?? next.source ?? "";
      }
      if (next.type === "polyline") {
        // 경사면처리 fields: old files lack them → default to sharp corners.
        next.rounded = next.rounded ?? false;
        next.cornerRadius = next.cornerRadius ?? 10;
      }
      if (next.type === "optics" && next.kind === "object_arrow") {
        next.dashLength = next.dashLength ?? 0;
        next.dashGap = next.dashGap ?? 0;
      }
      if (next.type === "anglearc") {
        next.radius = next.radius ?? 14;
        next.startAngle = next.startAngle ?? 0;
        next.sweepAngle = next.sweepAngle ?? 60;
      }
      if (next.type === "rightangle") {
        next.size = next.size ?? 6;
        next.angle = next.angle ?? 0;
        next.orientation = next.orientation ?? 1;
      }
      if (next.type === "labeler") {
        next.p1 = next.p1 ?? { x: 0, y: 0 };
        next.p2 = next.p2 ?? { x: next.p1.x + 12, y: next.p1.y - 6 };
        next.text = next.text ?? "㉠";
        // Older files lack fontFamily → default to the Dotum-first normal stack
        // (render.js falls back to the same default when this is absent).
        next.fontFamily = next.fontFamily ?? DEFAULT_TEXT_FONT;
        next.labelSize = next.labelSize ?? DEFAULT_TEXT_SIZE_MM;
        next.strokeLevel = next.strokeLevel ?? 0;
        next.strokeWidth = next.strokeWidth ?? 0.2;
      }
      if (next.type === "svgAsset") {
        next.x = next.x ?? 0;
        next.y = next.y ?? 0;
        next.w = next.w ?? 20;
        next.h = next.h ?? 20;
        next.rotation = next.rotation ?? 0;
        next.lockedAspectRatio = next.lockedAspectRatio ?? true;
        next.lockAspect = next.lockAspect ?? next.lockedAspectRatio;
        next.svgViewBox = next.svgViewBox ?? "0 0 1 1";
        next.svgContent = next.svgContent ?? "";
      }
      if (next.type === "apparatus") {
        next.kind = next.kind ?? "wire";
        next.templateId = next.templateId ?? APPARATUS_TEMPLATE_IDS[next.kind] ?? null;
        next.x = next.x ?? 0;
        next.y = next.y ?? 0;
        next.w = next.w ?? 20;
        next.h = next.h ?? 12;
        next.rotation = next.rotation ?? 0;
        if (next.kind === "wire") {
          next.length = next.length ?? next.w ?? 24;
          next.angle = next.angle ?? 0;
          next.thickness = next.thickness ?? next.gap ?? 1.8;
          next.gap = next.gap ?? next.thickness;
        }
        if (next.kind === "compass") next.needleAngle = next.needleAngle ?? -90;
        if (next.kind === "compass" || next.kind === "pulley" || next.kind === "clamp" || next.kind === "scale") {
          next.lockAspect = next.lockAspect ?? true;
        }
        if (next.kind === "pulley") next.variant = next.variant ?? "basic";
        if (next.kind === "clamp") next.flipped = next.flipped ?? false;
        if (next.kind === "scale") next.displayText = next.displayText ?? "0.99 N";
      }
      return next;
    }),
  };
}

/* ----- serialize: build the saved-file object from live state ----- */
function serialize(s) {
  return {
    version: SCHEMA_VERSION,
    objects: s.objects,
    guides: s.guides,
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
    s.guides = Array.isArray(data.guides)
      ? data.guides.filter((guide) => guide && (guide.axis === "x" || guide.axis === "y")
          && typeof guide.position === "number")
      : [];
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
    s.selectedGuideId = null;
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

const SVG_ALLOWED_TAGS = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "title", "desc"]);
const SVG_ALLOWED_ATTRS = new Set([
  "id", "class", "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
  "width", "height", "points", "viewBox", "transform", "fill", "fill-opacity", "fill-rule",
  "stroke", "stroke-opacity", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit",
  "stroke-dasharray", "stroke-dashoffset", "opacity", "display", "visibility", "clip-rule", "style",
]);
const SVG_LENGTH_RE = /^\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)/i;

function parseSvgLength(value, fallback = 0) {
  const match = String(value ?? "").match(SVG_LENGTH_RE);
  return match ? parseFloat(match[1]) : fallback;
}

function parseViewBox(root) {
  const raw = root.getAttribute("viewBox");
  if (raw) {
    const nums = raw.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
    if (nums.length === 4 && nums[2] > 0 && nums[3] > 0) {
      return { x: nums[0], y: nums[1], w: nums[2], h: nums[3], text: nums.join(" ") };
    }
  }
  const w = parseSvgLength(root.getAttribute("width"), 100);
  const h = parseSvgLength(root.getAttribute("height"), 100);
  return { x: 0, y: 0, w: Math.max(1, w), h: Math.max(1, h), text: `0 0 ${Math.max(1, w)} ${Math.max(1, h)}` };
}

function styleValue(style, prop) {
  const match = String(style || "").match(new RegExp(`${prop}\\s*:\\s*([^;]+)`, "i"));
  return match ? match[1].trim() : "";
}

function isWhitePaint(value) {
  const v = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  return v === "white" || v === "#fff" || v === "#ffffff" || v === "rgb(255,255,255)" || v === "rgba(255,255,255,1)";
}

function elementFill(el) {
  return el.getAttribute("fill") || styleValue(el.getAttribute("style"), "fill");
}

function numberAttr(el, name, fallback = 0) {
  return parseSvgLength(el.getAttribute(name), fallback);
}

function coversViewBoxRect(el, vb) {
  const xRaw = el.getAttribute("x");
  const yRaw = el.getAttribute("y");
  const wRaw = el.getAttribute("width");
  const hRaw = el.getAttribute("height");
  if (String(wRaw).trim() === "100%" && String(hRaw).trim() === "100%") return true;
  const x = numberAttr(el, "x", 0);
  const y = numberAttr(el, "y", 0);
  const w = numberAttr(el, "width", 0);
  const h = numberAttr(el, "height", 0);
  const eps = Math.max(vb.w, vb.h, 1) * 0.002;
  const xOk = Math.abs(x - vb.x) <= eps || (!xRaw && Math.abs(vb.x) <= eps);
  const yOk = Math.abs(y - vb.y) <= eps || (!yRaw && Math.abs(vb.y) <= eps);
  return xOk && yOk && Math.abs(w - vb.w) <= eps && Math.abs(h - vb.h) <= eps;
}

function pathLooksLikeViewBoxRect(el, vb) {
  const d = String(el.getAttribute("d") || "");
  const tokens = d.match(/[a-zA-Z]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  let cmd = "";
  let x = 0, y = 0;
  const pts = [];
  const isCmd = (token) => /^[a-zA-Z]$/.test(token);
  for (let i = 0; i < tokens.length;) {
    if (isCmd(tokens[i])) cmd = tokens[i++];
    const c = cmd;
    if (c === "M" || c === "L") {
      while (i + 1 < tokens.length && !isCmd(tokens[i])) {
        x = Number(tokens[i++]); y = Number(tokens[i++]);
        if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y });
        if (c === "M") cmd = "L";
      }
    } else if (c === "m" || c === "l") {
      while (i + 1 < tokens.length && !isCmd(tokens[i])) {
        x += Number(tokens[i++]); y += Number(tokens[i++]);
        if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y });
        if (c === "m") cmd = "l";
      }
    } else if (c === "H") {
      while (i < tokens.length && !isCmd(tokens[i])) { x = Number(tokens[i++]); if (Number.isFinite(x)) pts.push({ x, y }); }
    } else if (c === "h") {
      while (i < tokens.length && !isCmd(tokens[i])) { x += Number(tokens[i++]); if (Number.isFinite(x)) pts.push({ x, y }); }
    } else if (c === "V") {
      while (i < tokens.length && !isCmd(tokens[i])) { y = Number(tokens[i++]); if (Number.isFinite(y)) pts.push({ x, y }); }
    } else if (c === "v") {
      while (i < tokens.length && !isCmd(tokens[i])) { y += Number(tokens[i++]); if (Number.isFinite(y)) pts.push({ x, y }); }
    } else {
      i++;
    }
  }
  if (pts.length < 4) return false;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const eps = Math.max(vb.w, vb.h, 1) * 0.002;
  return Math.abs(minX - vb.x) <= eps && Math.abs(minY - vb.y) <= eps &&
    Math.abs((maxX - minX) - vb.w) <= eps && Math.abs((maxY - minY) - vb.h) <= eps;
}

function removeObviousSvgBackgrounds(root, vb) {
  for (const el of Array.from(root.querySelectorAll("rect,path"))) {
    if (!isWhitePaint(elementFill(el))) continue;
    const tag = el.tagName.toLowerCase();
    const isBackground = tag === "rect" ? coversViewBoxRect(el, vb) : pathLooksLikeViewBoxRect(el, vb);
    if (isBackground) el.remove();
  }
}

function sanitizeSvgStyle(value) {
  return String(value || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/url\s*\(|@import|expression\s*\(/i.test(part))
    .join("; ");
}

function sanitizeSvgMarkup(source) {
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  const parseError = doc.querySelector("parsererror");
  const root = doc.documentElement;
  if (parseError || !root || root.tagName.toLowerCase() !== "svg") {
    throw new Error("SVG 파일 형식이 올바르지 않습니다.");
  }
  const vb = parseViewBox(root);
  Array.from(root.querySelectorAll("script,foreignObject,iframe,image,style,link,metadata,use")).forEach((el) => el.remove());
  Array.from(root.querySelectorAll("*")).forEach((el) => {
    const tag = el.tagName.toLowerCase();
    if (!SVG_ALLOWED_TAGS.has(tag)) {
      el.remove();
      return;
    }
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name;
      const lower = name.toLowerCase();
      const value = attr.value || "";
      if (lower.startsWith("on") || lower.includes(":")) {
        el.removeAttribute(name);
        return;
      }
      if (!SVG_ALLOWED_ATTRS.has(name) && !SVG_ALLOWED_ATTRS.has(lower)) {
        el.removeAttribute(name);
        return;
      }
      if (/url\s*\(|javascript:|data:/i.test(value) && lower !== "d") {
        el.removeAttribute(name);
        return;
      }
      if (lower === "style") {
        const safeStyle = sanitizeSvgStyle(value);
        if (safeStyle) el.setAttribute(name, safeStyle);
        else el.removeAttribute(name);
      }
    });
  });
  removeObviousSvgBackgrounds(root, vb);
  return { svgViewBox: vb.text, svgContent: root.innerHTML, viewBox: vb };
}

function readSvgFile(file, dropPos, state) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const { svgViewBox, svgContent, viewBox } = sanitizeSvgMarkup(String(reader.result || ""));
      const { w: artboardW, h: artboardH } = state.get().artboard;
      const scale = Math.min((artboardW * 0.45) / viewBox.w, (artboardH * 0.45) / viewBox.h, 1);
      const w = Math.max(1, viewBox.w * scale);
      const h = Math.max(1, viewBox.h * scale);
      const center = dropPos || { x: 0, y: 0 };
      const minX = -artboardW / 2;
      const minY = -artboardH / 2;
      const x = Math.min(Math.max(center.x - w / 2, minX), artboardW / 2 - w);
      const y = Math.min(Math.max(center.y - h / 2, minY), artboardH / 2 - h);
      state.update((s) => {
        const snap = JSON.parse(JSON.stringify(s.objects));
        const id = `obj_${Date.now().toString(36)}_svg${++_imgIdCounter}`;
        s.objects.push(applyNewObjectStyleDefaults({
          id,
          type: "svgAsset",
          x, y, w, h,
          rotation: 0,
          lockedAspectRatio: true,
          lockAspect: true,
          svgViewBox,
          svgContent,
          locked: false,
          positionLocked: false,
          layerId: s.activeLayerId,
          order: s.objects.length,
        }));
        s.undoStack.push(snap);
        s.redoStack = [];
        s.selectedIds = [id];
        s.targetedId = null;
        s.activeTool = "V";
      });
    } catch (err) {
      alert("SVG를 삽입할 수 없습니다.\n" + (err && err.message ? err.message : err));
    }
  };
  reader.onerror = () => alert("SVG 파일을 읽는 중 오류가 발생했습니다.");
  reader.readAsText(file);
}

/* ----- image import: file-picker + drag-and-drop helper ----- */
let _imgIdCounter = 0;
let _placement = null;
let _placementHint = null;

function finishImagePlacement(state) {
  if (!_placement) return;
  _placement = null;
  if (_placementHint) _placementHint.hidden = true;
  state.update((s) => { s.activeTool = "V"; });
}

function cancelImagePlacement(state) {
  if (!_placement) return;
  const { objectId } = _placement;
  _placement = null;
  if (_placementHint) _placementHint.hidden = true;
  state.update((s) => {
    s.objects = s.objects.filter((o) => o.id !== objectId);
    s.selectedIds = (s.selectedIds || []).filter((id) => id !== objectId);
    s.targetedId = null;
    s.activeTool = "V";
  });
}

function beginImagePlacement(state, objectId) {
  finishImagePlacement(state);
  _placement = { objectId };
  if (_placementHint) _placementHint.hidden = false;
}

function readImageFile(file, dropPos, state) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const src = e.target.result;
    const img = new Image();
    img.onload = () => {
      const { w: artboardW, h: artboardH } = state.get().artboard;
      const scale = Math.min(
        (artboardW * 0.9) / img.naturalWidth,
        (artboardH * 0.9) / img.naturalHeight
      );
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      const center = dropPos || { x: 0, y: 0 };
      const minX = -artboardW / 2;
      const minY = -artboardH / 2;
      const x = Math.min(Math.max(center.x - w / 2, minX), artboardW / 2 - w);
      const y = Math.min(Math.max(center.y - h / 2, minY), artboardH / 2 - h);
      let objectId;
      state.update((s) => {
        const newObj = applyNewObjectStyleDefaults({
          id: `obj_${Date.now().toString(36)}_img${++_imgIdCounter}`,
          type: "image",
          src,
          x,
          y,
          w,
          h,
          rotation: 0,
          locked: false,
          positionLocked: false,
          layerId: s.activeLayerId,
          order: s.objects.length,
        });
        objectId = newObj.id;
        s.objects.push(newObj);
        s.selectedIds = [newObj.id];
        s.targetedId = null;
        s.activeTool = "V";
      });
      beginImagePlacement(state, objectId);
    };
    img.src = src;
  };
  reader.readAsDataURL(file);
}

/* ----- initProjectIO: wire the top-bar buttons + hidden file input ----- */
export function initProjectIO(state, svg) {
  const saveBtn = document.getElementById("project-save");
  const openBtn = document.getElementById("project-open");
  const imageImportBtn = document.getElementById("image-import");
  const svgImportBtn = document.getElementById("svg-import");

  _placementHint = document.createElement("div");
  _placementHint.className = "image-placement-hint";
  _placementHint.textContent = "원하는 크기로 조정이 완료되면 Enter를 눌러주세요.";
  _placementHint.hidden = true;
  const canvasWrap = svg && svg.closest(".canvas-wrap");
  if (canvasWrap) canvasWrap.appendChild(_placementHint);

  window.addEventListener("keydown", (e) => {
    if (!_placement || (e.key !== "Enter" && e.key !== "Escape")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === "Escape") cancelImagePlacement(state);
    else finishImagePlacement(state);
  }, true);

  // Hidden file input for project JSON, created here so index.html stays markup-only.
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

  // Hidden file input for SVG asset import.
  const svgInput = document.createElement("input");
  svgInput.type = "file";
  svgInput.accept = ".svg,image/svg+xml";
  svgInput.style.display = "none";
  document.body.appendChild(svgInput);

  if (svgImportBtn) svgImportBtn.addEventListener("click", () => svgInput.click());

  svgInput.addEventListener("change", () => {
    const file = svgInput.files && svgInput.files[0];
    if (file) readSvgFile(file, null, state);
    svgInput.value = "";
  });

  // Hidden file input for image import.
  const imageInput = document.createElement("input");
  imageInput.type = "file";
  imageInput.accept = "image/png,image/jpeg";
  imageInput.style.display = "none";
  document.body.appendChild(imageInput);

  if (imageImportBtn) imageImportBtn.addEventListener("click", () => imageInput.click());

  imageInput.addEventListener("change", () => {
    const file = imageInput.files && imageInput.files[0];
    if (file) readImageFile(file, null, state);
    imageInput.value = "";
  });

  // Drag-and-drop image import on the canvas.
  if (svg) {
    svg.addEventListener("dragover", (e) => e.preventDefault());
    svg.addEventListener("drop", (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      const vb = state.get().viewBox;
      const pos = screenToWorld(svg, vb, e.clientX, e.clientY);
      if (file && (file.type === "image/svg+xml" || /\.svg$/i.test(file.name || ""))) {
        readSvgFile(file, pos, state);
        return;
      }
      if (!file || !file.type.startsWith("image/")) return;
      readImageFile(file, pos, state);
    });
  }
}
