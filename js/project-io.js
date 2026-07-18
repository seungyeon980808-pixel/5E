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

import { rebuildGroups } from "./transform.js?v=1.0.4";
import { screenToWorld } from "./viewport.js?v=1.0.4";
import { applyNewObjectStyleDefaults, migrateObjectStyleMode } from "./style-mode.js?v=1.0.4";
import { showConfirm } from "./ui-dialogs.js?v=1.0.4";
import { downscaleIfNeeded } from "./image-paste.js?v=1.0.4";
import { DEFAULT_TEXT_SIZE_MM, DEFAULT_TEXT_FONT, normalizeTextRuns, textRunsToText } from "./state.js?v=1.0.4";
import { LABEL_CAPABLE_TYPES } from "./object-types.js?v=1.0.4";
import { insertImageFromSrc } from "./image-paste.js?v=1.0.4";
import { addPage } from "./pages.js?v=1.0.4";

// Schema version of the saved file. Distinct from the app UI version.
// 0.15 adds editing guides; older files without them load with an empty guide list.
// 0.16 adds coordplane + funcgraph (함수 그래프); older files simply lack both types,
// so their backfill target is 0 — loading an old file stays a no-op for them.
// 0.17 adds 다중 페이지(아트보드): the file now stores pages[] (each = objects/guides/
// layers/artboard + 문항 메타). Older files (single-page, top-level objects) are
// wrapped into one page by migrate(), so every previous save still loads intact.
const SCHEMA_VERSION = "0.17";

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

// LABEL_CAPABLE_TYPES from object-types.js registry.

function normalizeLabelType(value, fallback = "quantity") {
  return value === "quantity" || value === "label" ? value : fallback;
}

/* ----- migrateObjectList: normalize/backfill one objects[] array ----- */
// Extracted so both the legacy top-level objects[] and every page's objects[]
// go through the exact same per-object migration.
function migrateObjectList(objects) {
  if (!Array.isArray(objects)) return [];
  return objects.map((obj) => {
      const next = {
        ...obj,
        positionLocked: obj.positionLocked ?? false,
      };
      if (LABEL_CAPABLE_TYPES.has(next.type)) {
        // labeler(콜아웃)만 "label"(정체) 기본; 사각형을 포함한 나머지 도형은
        // "quantity"(물리량·수식 글꼴) 기본이다. An explicit labelType is always
        // preserved, so a rect switched to "라벨" reloads as 신명중명조 정체.
        next.labelType = normalizeLabelType(next.labelType, next.type === "labeler" ? "label" : "quantity");
      }
      migrateObjectStyleMode(next);
      if (next.type === "text") {
        next.italic = next.italic ?? false;
        if (Array.isArray(next.textRuns) && next.textRuns.length) {
          next.textRuns = normalizeTextRuns(next);
          next.text = next.text ?? textRunsToText(next.textRuns);
        }
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
        // styled 심볼 run(구간/물리량)이 저장돼 있으면 정규화해 복원한다. 없으면 그대로
        // 두어(예전 라벨) 렌더가 일반 텍스트 경로를 타게 한다 — 하위 호환.
        if (Array.isArray(next.textRuns) && next.textRuns.length) {
          next.textRuns = normalizeTextRuns(next);
          next.text = next.text ?? textRunsToText(next.textRuns);
        }
      }
      if (next.type === "image") {
        // Image workflow fields. Older background-mode files are kept visible and
        // manageable, but their old non-interactive background flag maps to the
        // explicit image-only selection lock.
        const oldBackgroundLocked = next.mode === "background" && next.locked === true && next.recognized !== true;
        next.mode = next.mode === "background" ? "background" : "edit";
        next.opacity = typeof next.opacity === "number" ? next.opacity : 1;
        next.aspectLocked = next.aspectLocked ?? true;
        next.exportable = next.exportable ?? true;
        next.cutouts = Array.isArray(next.cutouts) ? next.cutouts : [];
        next.imageSelectionLocked = next.imageSelectionLocked ?? oldBackgroundLocked;
        next.locked = oldBackgroundLocked ? false : (next.locked ?? false);
        if (next.imageSelectionLocked) next.positionLocked = false;
        next.recognized = next.recognized === true;
      }
      if (next.type === "pendulum") {
        // Older/partial files: backfill every editable option so render + inspector
        // have a complete object. bobRadius omitted → derived from length at render.
        next.p1 = next.p1 ?? { x: 0, y: 0 };
        next.p2 = next.p2 ?? { x: next.p1.x, y: next.p1.y + 30 };
        next.showCenterGhost = next.showCenterGhost ?? true;
        next.showSymmetricGhost = next.showSymmetricGhost ?? true;
        next.showLengthLabel = next.showLengthLabel ?? true;
        next.lengthLabel = next.lengthLabel ?? "L_B";
        next.labelType = "quantity";
        next.strokeLevel = next.strokeLevel ?? 0;
        next.strokeWidth = next.strokeWidth ?? 0.2;
      }
      if (next.type === "svgAsset") {
        next.assetId = next.assetId ?? "pulley";
        next.x = next.x ?? 0;
        next.y = next.y ?? 0;
        next.w = next.w ?? 43;
        next.h = next.h ?? 38;
        next.rotation = next.rotation ?? 0;
        next.lockAspect = next.lockAspect ?? true;
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
      if (next.type === "coordplane") {
        // 좌표평면(§3-1): 박스 + 표시 범위 + 격자/눈금/숫자라벨. labelType은 위
        // LABEL_CAPABLE_TYPES 경로에서 정규화된다(기본 "quantity").
        next.x = next.x ?? 0; next.y = next.y ?? 0;
        next.w = next.w ?? 80; next.h = next.h ?? 80;
        next.rotation = next.rotation ?? 0;
        next.lockAspect = next.lockAspect ?? true;      // square cells on resize
        next.axisVariant = next.axisVariant ?? "cross"; // 십자/L자/직선
        next.xMin = next.xMin ?? -5; next.xMax = next.xMax ?? 5;
        next.yMin = next.yMin ?? -5; next.yMax = next.yMax ?? 5;
        next.gridStepX = next.gridStepX ?? 1; next.gridStepY = next.gridStepY ?? 1;
        next.tickStepX = next.tickStepX ?? 1; next.tickStepY = next.tickStepY ?? 1; // 숫자 눈금 한칸값

        next.showAxisLines = next.showAxisLines ?? true;
        next.showGrid = next.showGrid ?? false;
        next.showTicks = next.showTicks ?? true;
        next.showTickLabels = next.showTickLabels ?? false;
        next.tickLabelSize = next.tickLabelSize ?? 2.6;
        // 눈금 라벨 모드(그래프 도구): 없음/숫자/문자. 구파일은 showTickLabels로 유도.
        next.tickLabelMode = next.tickLabelMode ?? (next.showTickLabels ? "number" : "none");
        next.tickTextX = Array.isArray(next.tickTextX) ? next.tickTextX : [];
        next.tickTextY = Array.isArray(next.tickTextY) ? next.tickTextY : [];
        // 그래프 도구: 눈금/격자 칸 수 캡(gridCountX/Y)은 spread로 보존. 격자 초과분만 백필.
        next.gridOver = Number.isFinite(next.gridOver) ? next.gridOver : (next.gridCountX !== undefined ? 0.5 : 0);
        next.labelScale = Number.isFinite(next.labelScale) ? next.labelScale : 1; // 글씨 크기 배율
        next.labelX = next.labelX ?? "x"; next.labelY = next.labelY ?? "y";
        next.showAxisLabels = next.showAxisLabels ?? true;
        next.axisLabelSize = next.axisLabelSize ?? 3.5;
        next.showOrigin = next.showOrigin ?? true;
        next.exportable = next.exportable ?? true;
        next.strokeLevel = next.strokeLevel ?? 0;
        next.strokeWidth = next.strokeWidth ?? 0.2;
      }
      if (next.type === "funcgraph") {
        // 함수 그래프(§3-2): points[]는 월드 mm로 구운 캐시(렌더 실체). planeId는
        // 쓰기 경로(재샘플·평행이동)에서만 참조. 열린 스트로크(closed:false 고정).
        next.expr = next.expr ?? "";
        next.domainMin = next.domainMin ?? -5;
        next.domainMax = next.domainMax ?? 5;
        next.planeId = next.planeId ?? null;
        next.points = Array.isArray(next.points) ? next.points : [];
        next.closed = false;
        next.strokeLevel = next.strokeLevel ?? 0;
        next.strokeWidth = next.strokeWidth ?? 0.2;
        next.dashLength = next.dashLength ?? 0;
        next.dashGap = next.dashGap ?? 0;
        next.labelShow = next.labelShow ?? false;
      }
      return next;
    });
}

/* ----- sanitizeGuides / sanitizeArtboard: shared normalizers ----- */
function sanitizeGuides(guides) {
  return Array.isArray(guides)
    ? guides.filter((g) => g && (g.axis === "x" || g.axis === "y") && typeof g.position === "number")
    : [];
}
function sanitizeArtboard(artboard) {
  // typeof NaN도 "number"라 기존 검사(=== "number")만으로는 0/음수/NaN이 그대로
  // 통과해 viewport.js의 나눗셈이 Infinity/NaN으로 붕괴한다. 유한 양수인지까지 확인.
  const okW = artboard && Number.isFinite(artboard.w) && artboard.w > 0;
  const okH = artboard && Number.isFinite(artboard.h) && artboard.h > 0;
  return (okW && okH)
    ? { w: artboard.w, h: artboard.h }
    : { ...DEFAULT_ARTBOARD };
}
function sanitizeMeta(meta) {
  return {
    number: meta && typeof meta.number === "string" ? meta.number : "",
    points: meta && typeof meta.points === "string" ? meta.points : "",
  };
}

let _loadSeq = 0;
function makePageId() { return `page_load_${Date.now().toString(36)}_${++_loadSeq}`; }

/* ----- migratePage: normalize one page record (objects + guides + layers + meta) ----- */
function migratePage(page, index) {
  return {
    id: page && page.id ? page.id : makePageId(),
    name: page && typeof page.name === "string" && page.name ? page.name : `페이지 ${index + 1}`,
    meta: sanitizeMeta(page && page.meta),
    objects: migrateObjectList(page && page.objects),
    guides: sanitizeGuides(page && page.guides),
    layers: Array.isArray(page && page.layers) && page.layers.length ? page.layers : null,
    artboard: sanitizeArtboard(page && page.artboard),
  };
}

/* ----- migrate: bring an older saved file up to the current schema -----
 * 0.17 introduced pages[]. Files saved before that carry a single drawing at the
 * top level (objects/guides/layers/artboard) and NO pages field — we wrap them
 * into a single page here, so every previous save keeps loading intact. */
export function migrate(data) {
  if (!data || typeof data !== "object") return data;

  // New (0.17+) format: already has pages[]. Normalize each page.
  if (Array.isArray(data.pages)) {
    const pages = data.pages.map((p, i) => migratePage(p, i));
    const activePageId = pages.some((p) => p.id === data.activePageId)
      ? data.activePageId
      : (pages[0] ? pages[0].id : null);
    return { ...data, pages, activePageId };
  }

  // Legacy single-page file: wrap the top-level drawing into page 1.
  if (!Array.isArray(data.objects)) return data;
  const page = migratePage({
    name: "페이지 1",
    objects: data.objects,
    guides: data.guides,
    layers: data.layers,
    artboard: data.artboard,
  }, 0);
  return { ...data, pages: [page], activePageId: page.id };
}

/* ----- serialize: build the saved-file object from live state ----- */
// Emits pages[]; the active page's live top-level 4 fields are substituted in so
// unsaved edits on the current page are captured without a prior write-back call.
export function serialize(s) {
  const pages = (s.pages || []).map((p) => {
    const isActive = p.id === s.activePageId;
    return {
      id: p.id,
      name: p.name,
      meta: p.meta || { number: "", points: "" },
      objects: isActive ? s.objects : p.objects,
      guides: isActive ? s.guides : p.guides,
      layers: isActive ? s.layers : p.layers,
      artboard: isActive ? s.artboard : p.artboard,
    };
  });
  return {
    version: SCHEMA_VERSION,
    pages,
    activePageId: s.activePageId,
    // groups omitted on purpose — derived from obj.groupId on load.
  };
}

/* ----- saveProject: write the current drawing as a .json file -----
 * Chromium/Edge(showSaveFilePicker): 사용자가 저장 폴더 + 파일명을 직접 고른다(요구:
 * "어디에 어떻게 저장될지 정할 수 있어야"). 그 외 브라우저·취소 외 오류 → 기존처럼
 * 브라우저 기본 다운로드로 폴백. 피커는 클릭 제스처 안에서 첫 await로 불러야 한다
 * (svg-export.js pickSaveHandle와 동일 패턴 — 여기선 project-io 자립을 위해 인라인). */
async function saveProject(state) {
  const json = JSON.stringify(serialize(state.get()), null, 2);
  const blob = new Blob([json], { type: "application/json" });

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: DEFAULT_FILENAME,
        types: [{ description: "5E 프로젝트 파일", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return;   // 사용자가 저장 취소 → 아무것도 안 함
      // 권한 거부/기타 오류 → 아래 기본 다운로드로 폴백
    }
  }

  // 폴백: 브라우저 기본 다운로드(다운로드 폴더로 저장, 위치 선택 없음).
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = DEFAULT_FILENAME;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ----- defaultLayers: fresh 3-layer set for pages saved without layers ----- */
function defaultLayers() {
  return [
    { id: 1, name: "레이어 1", visible: true },
    { id: 2, name: "레이어 2", visible: true },
    { id: 3, name: "레이어 3", visible: true },
  ];
}

/* ----- applyLoaded: replace drawing data through the store (re-renders) ----- */
// data.pages[] is guaranteed by migrate(). The active page's 4 fields are lifted
// to the top level (the live drawing), the rest stay in s.pages — the same swap
// structure pages.js maintains, so render/pick/etc. read the active page as before.
export function applyLoaded(state, data) {
  // 이미지 배치 대기 상태(_placement)가 남아있으면 정리한다 — 프로젝트를 새로
  // 불러와 objects가 통째로 교체되는데 대기 중이던 placeholder id를 계속 들고
  // 있으면 이후 클릭/Escape 처리가 존재하지 않는 오브젝트를 참조하게 된다.
  if (_placement) {
    _placement = null;
    if (_placementHint) _placementHint.hidden = true;
  }
  state.update((s) => {
    const pages = data.pages.map((p) => ({
      id: p.id,
      name: p.name,
      meta: p.meta || { number: "", points: "" },
      objects: Array.isArray(p.objects) ? p.objects : [],
      guides: Array.isArray(p.guides) ? p.guides : [],
      layers: Array.isArray(p.layers) && p.layers.length ? p.layers : defaultLayers(),
      artboard: p.artboard || { ...DEFAULT_ARTBOARD },
    }));
    s.pages = pages;
    const active = pages.find((p) => p.id === data.activePageId) || pages[0];
    s.activePageId = active.id;

    // Lift the active page's data to the live top-level fields.
    s.objects = active.objects;
    s.guides = active.guides;
    s.layers = active.layers;
    s.artboard = active.artboard;

    // Groups are derived from groupId — rebuild rather than trust the file.
    rebuildGroups(s);

    // Fresh session for the opened file: drop history + selection.
    s.undoStack = [];
    s.redoStack = [];
    s.selectedIds = [];
    s.selectedGuideId = null;
    s.targetedId = null;
    s.draft = null;
    s.draftText = null;

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
  reader.onload = async () => {
    try {
      const raw = JSON.parse(reader.result);
      const data = migrate(raw);

      // Structural sanity check before touching live state. migrate() guarantees
      // a pages[] array (legacy single-page files are wrapped into one page).
      if (
        !data ||
        typeof data !== "object" ||
        !Array.isArray(data.pages) ||
        data.pages.length === 0 ||
        !data.pages.every((p) => p && Array.isArray(p.objects))
      ) {
        throw new Error("필요한 데이터(pages) 형식이 올바르지 않습니다.");
      }

      // 파일이 유효하다고 확인된 뒤에만 묻는다(깨진 파일은 확인창 없이 바로 에러).
      // applyLoaded는 undoStack까지 비워 되돌릴 수 없는 '대체'다 — 폴더에 섞여 있던
      // .json이 캔버스에 실수로 떨어지거나 '열기'를 잘못 눌러도 아무 확인 없이
      // 현재 작업 전체가 사라지던 것을 막는다.
      const ok = await showConfirm(
        "현재 작업을 이 프로젝트 파일로 대체할까요?\n저장하지 않은 현재 작업은 사라집니다.",
        { title: "프로젝트 열기", okText: "열기", cancelText: "취소" },
      );
      if (!ok) return;

      applyLoaded(state, data);
    } catch (err) {
      // On any failure, do NOT corrupt current state — just warn.
      alert("프로젝트 파일을 열 수 없습니다.\n" + (err && err.message ? err.message : err));
    }
  };
  reader.onerror = () => alert("파일을 읽는 중 오류가 발생했습니다.");
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
    const rawSrc = e.target.result;
    const img = new Image();
    img.onload = async () => {
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
      // 붙여넣기(Ctrl+V) 경로는 고해상도 원본을 downscaleIfNeeded로 축소해 저장하는데,
      // 드래그앤드롭만 이 처리가 없어 스마트폰 사진 같은 고해상도 원본이 그대로 저장돼
      // 프로젝트 파일·자동저장 스냅샷을 수십 MB로 부풀렸다 — 같은 축소를 적용한다.
      // 캔버스 위 표시 크기(w/h, 위 스케일)는 원본 픽셀 수와 무관해 변하지 않는다.
      const { src } = await downscaleIfNeeded(rawSrc, { w: img.naturalWidth, h: img.naturalHeight });
      let objectId;
      state.update((s) => {
        // 이미지 삽입을 undo 스택에 기록(예전엔 누락돼 Ctrl+Z가 삽입 이전의 다른 작업까지
        // 한꺼번에 되돌렸음 — 클립보드 붙여넣기 경로와 동일하게 스냅샷 push + redo clear).
        const snap = JSON.parse(JSON.stringify(s.objects));
        const newObj = applyNewObjectStyleDefaults({
          id: `obj_${Date.now().toString(36)}_img${++_imgIdCounter}`,
          type: "image",
          src,
          x,
          y,
          w,
          h,
          rotation: 0,
          mode: "edit",
          opacity: 1,
          aspectLocked: true,
          exportable: true,
          cutouts: [],
          locked: false,
          positionLocked: false,
          imageSelectionLocked: false,
          layerId: s.activeLayerId,
          order: s.objects.length,
        });
        objectId = newObj.id;
        s.objects.push(newObj);
        s.undoStack.push(snap);
        s.redoStack = [];
        s.selectedIds = [newObj.id];
        s.targetedId = null;
        s.activeTool = "V";
      });
      beginImagePlacement(state, objectId);
    };
    img.src = rawSrc;
  };
  reader.readAsDataURL(file);
}

/* ----- initProjectIO: wire the top-bar buttons + hidden file input ----- */
export function initProjectIO(state, svg) {
  const saveBtn = document.getElementById("project-save");
  const openBtn = document.getElementById("project-open");
  const imageImportBtn = document.getElementById("image-import");

  _placementHint = document.createElement("div");
  _placementHint.className = "image-placement-hint";
  _placementHint.textContent = "원하는 크기로 조정이 완료되면 Enter를 눌러주세요.";
  _placementHint.hidden = true;
  const canvasWrap = svg && svg.closest(".canvas-wrap");
  if (canvasWrap) canvasWrap.appendChild(_placementHint);

  window.addEventListener("keydown", (e) => {
    if (!_placement || (e.key !== "Enter" && e.key !== "Escape")) return;
    // 캡처 단계+stopImmediatePropagation이라 조건이 _placement뿐이면 포커스가 어디 있든
    // 가로챈다 — 이미지 배치 확정 대기 중에 페이지 이름 변경/수식 편집기 같은 다른 입력이
    // 열려 있으면 그 다이얼로그의 Enter/Escape가 아예 도달하지 못하고 대신 이미지가
    // 확정/삭제된다. 다른 곳(tools.js 등)과 같은 INPUT/TEXTAREA/contentEditable 가드로,
    // 실제로 다른 입력에 포커스가 가 있을 때는 그쪽 처리를 우선시킨다.
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
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

  // ===== 이미지 불러오기: 다중 파일 + '한 페이지에 넣기' / '페이지별로 넣기' =====
  // 클릭 시 우측 서브메뉴에서 배치 방식을 고른다. 배치는 비대화형 자동 배치
  // (아트보드 원점 기준 fit). '한 페이지'는 겹침 방지용 카스케이드 오프셋.
  const imageInput = document.createElement("input");
  imageInput.type = "file";
  imageInput.accept = "image/png,image/jpeg";
  imageInput.multiple = true;
  imageInput.style.display = "none";
  document.body.appendChild(imageInput);

  let importMode = "single-page"; // 'single-page' | 'per-page'

  const fileToDataURL = (file) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(new Error("read fail"));
      r.readAsDataURL(file);
    });

  // 모든 이미지를 현재 페이지에 (겹치지 않게 살짝 카스케이드)
  async function importOnePage(files) {
    const OFF = 4; // mm
    let i = 0;
    for (const file of files) {
      try {
        const src = await fileToDataURL(file);
        await insertImageFromSrc(state, src, { at: { x: 0, y: 0 }, offset: { dx: i * OFF, dy: i * OFF } });
      } catch (_) { /* 디코드 실패 파일은 건너뜀 */ }
      i++;
    }
  }

  // 이미지마다 새 페이지 (현재 페이지가 비어 있으면 첫 장은 현재 페이지 재사용)
  async function importPerPage(files) {
    const startEmpty = (state.get().objects || []).length === 0;
    let i = 0;
    for (const file of files) {
      try {
        const src = await fileToDataURL(file);
        if (!(i === 0 && startEmpty)) addPage(state);
        await insertImageFromSrc(state, src, { at: { x: 0, y: 0 } });
      } catch (_) { /* 디코드 실패 파일은 건너뜀 */ }
      i++;
    }
  }

  imageInput.addEventListener("change", async () => {
    const files = Array.from(imageInput.files || []);
    imageInput.value = "";
    if (!files.length) return;
    if (importMode === "per-page") await importPerPage(files);
    else await importOnePage(files);
  });

  // 파일 메뉴 리스트 안, 우측 플라이아웃 서브메뉴
  if (imageImportBtn) {
    const fileMenuList = imageImportBtn.closest(".file-menu-list");
    const submenu = document.createElement("div");
    submenu.className = "file-submenu";
    submenu.hidden = true;
    submenu.innerHTML =
      '<button type="button" class="file-menu-item file-submenu-item" data-mode="single-page">' +
        '<span class="fsi-title">한 페이지에 넣기</span>' +
        '<span class="fsi-desc">고른 이미지를 모두 지금 페이지에 배치합니다. 겹치지 않게 조금씩 어긋나게 놓입니다.</span>' +
      '</button>' +
      '<button type="button" class="file-menu-item file-submenu-item" data-mode="per-page">' +
        '<span class="fsi-title">페이지별로 넣기</span>' +
        '<span class="fsi-desc">이미지 한 장마다 새 페이지를 만들어 하나씩 배치합니다.</span>' +
      '</button>';
    (fileMenuList || imageImportBtn.parentElement).appendChild(submenu);

    const closeSub = () => {
      submenu.hidden = true;
      imageImportBtn.setAttribute("aria-expanded", "false");
    };

    imageImportBtn.addEventListener("click", (e) => {
      // top-menu의 '리스트 클릭=닫기'/outside-click 로 상단 메뉴가 닫히지 않도록 차단
      e.stopPropagation();
      const willOpen = submenu.hidden;
      submenu.hidden = !willOpen;
      imageImportBtn.setAttribute("aria-expanded", String(willOpen));
    });

    submenu.addEventListener("click", (e) => {
      const b = e.target.closest("[data-mode]");
      if (!b) return;
      importMode = b.dataset.mode;
      closeSub();
      imageInput.click(); // 이 클릭은 버블 → 파일 메뉴가 닫힌다
    });

    // 파일 메뉴 버튼을 다시 누르면 서브메뉴 상태 초기화
    const fileBtn = document.getElementById("file-menu-btn");
    if (fileBtn) fileBtn.addEventListener("click", closeSub);
  }

  // Drag-and-drop image import on the canvas.
  if (svg) {
    svg.addEventListener("dragover", (e) => e.preventDefault());
    svg.addEventListener("drop", (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      // JSON 프로젝트 파일도 드래그앤드랍 지원(요구): 상단 '열기'와 동일하게 로드(현재 작업 대체).
      // 일부 OS에서 .json의 MIME이 비어 있을 수 있어 확장자도 함께 본다.
      if (file.type === "application/json" || /\.json$/i.test(file.name)) {
        openProject(state, file);
        return;
      }
      if (!file.type.startsWith("image/")) return;
      const vb = state.get().viewBox;
      const pos = screenToWorld(svg, vb, e.clientX, e.clientY);
      readImageFile(file, pos, state);
    });
  }
}
