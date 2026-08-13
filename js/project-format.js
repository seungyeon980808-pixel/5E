import { rebuildGroups } from "./transform.js?v=1.4.0";
import { migrateObjectList } from "./project-object-migration.js?v=1.4.0";

export const DEFAULT_ARTBOARD = { w: 90, h: 60 };

const SCHEMA_VERSION = "0.17";
const ROOT_EXTENSIONS = Symbol("projectRootExtensions");
const PAGE_EXTENSIONS = Symbol("projectPageExtensions");
// Root and page extensions stay opaque in live state, then serialize re-emits
// them. Object extensions remain directly on the copied object records.
// Reserved root fields are current/transient state or legacy drawing inputs.
const ROOT_RESERVED_FIELDS = new Set([
  "version", "pages", "activePageId",
  "objects", "guides", "layers", "artboard", "groups",
  "undoStack", "redoStack", "selectedIds", "selectedGuideId", "targetedId",
  "draft", "draftText", "activeTool", "activeLayerId", "viewBox",
]);
const PAGE_RESERVED_FIELDS = new Set(["id", "name", "meta", "objects", "guides", "layers", "artboard"]);

function extensionFields(record, reservedFields) {
  return Object.fromEntries(
    Object.entries(record || {}).filter(([field]) => !reservedFields.has(field)),
  );
}

function keepExtensions(record, key, extensions) {
  Object.defineProperty(record, key, { value: extensions, configurable: true });
  return record;
}

function sanitizeGuides(guides) {
  return Array.isArray(guides)
    ? guides.filter((guide) => guide && (guide.axis === "x" || guide.axis === "y") && typeof guide.position === "number")
    : [];
}

function sanitizeArtboard(artboard) {
  const validWidth = artboard && Number.isFinite(artboard.w) && artboard.w > 0;
  const validHeight = artboard && Number.isFinite(artboard.h) && artboard.h > 0;
  return validWidth && validHeight
    ? { w: artboard.w, h: artboard.h }
    : { ...DEFAULT_ARTBOARD };
}

function sanitizeMeta(meta) {
  return {
    number: meta && typeof meta.number === "string" ? meta.number : "",
    points: meta && typeof meta.points === "string" ? meta.points : "",
  };
}

let loadSequence = 0;

function makePageId() {
  return `page_load_${Date.now().toString(36)}_${++loadSequence}`;
}

function migratePage(page, index) {
  return {
    ...extensionFields(page, PAGE_RESERVED_FIELDS),
    id: page && page.id ? page.id : makePageId(),
    name: page && typeof page.name === "string" && page.name ? page.name : `페이지 ${index + 1}`,
    meta: sanitizeMeta(page && page.meta),
    objects: migrateObjectList(page && page.objects),
    guides: sanitizeGuides(page && page.guides),
    layers: Array.isArray(page && page.layers) && page.layers.length ? page.layers : null,
    artboard: sanitizeArtboard(page && page.artboard),
  };
}

export function migrate(data) {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data.pages)) {
    const pages = data.pages.map((page, index) => migratePage(page, index));
    const activePageId = pages.some((page) => page.id === data.activePageId)
      ? data.activePageId
      : (pages[0] ? pages[0].id : null);
    return { ...data, pages, activePageId };
  }
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

export function serialize(state) {
  const pages = (state.pages || []).map((page) => {
    const active = page.id === state.activePageId;
    return {
      ...(page[PAGE_EXTENSIONS] || {}),
      id: page.id,
      name: page.name,
      meta: page.meta || { number: "", points: "" },
      objects: active ? state.objects : page.objects,
      guides: active ? state.guides : page.guides,
      layers: active ? state.layers : page.layers,
      artboard: active ? state.artboard : page.artboard,
    };
  });
  return {
    ...(state[ROOT_EXTENSIONS] || {}),
    version: SCHEMA_VERSION,
    pages,
    activePageId: state.activePageId,
  };
}

function defaultLayers() {
  return [
    { id: 1, name: "레이어 1", visible: true },
    { id: 2, name: "레이어 2", visible: true },
    { id: 3, name: "레이어 3", visible: true },
  ];
}

export function applyLoadedState(state, data) {
  state.update((live) => {
    const pages = data.pages.map((page) => keepExtensions({
      id: page.id,
      name: page.name,
      meta: page.meta || { number: "", points: "" },
      objects: Array.isArray(page.objects) ? page.objects : [],
      guides: Array.isArray(page.guides) ? page.guides : [],
      layers: Array.isArray(page.layers) && page.layers.length ? page.layers : defaultLayers(),
      artboard: page.artboard || { ...DEFAULT_ARTBOARD },
    }, PAGE_EXTENSIONS, extensionFields(page, PAGE_RESERVED_FIELDS)));
    keepExtensions(live, ROOT_EXTENSIONS, extensionFields(data, ROOT_RESERVED_FIELDS));
    live.pages = pages;
    const active = pages.find((page) => page.id === data.activePageId) || pages[0];
    live.activePageId = active.id;
    live.objects = active.objects;
    live.guides = active.guides;
    live.layers = active.layers;
    live.artboard = active.artboard;
    rebuildGroups(live);
    live.undoStack = [];
    live.redoStack = [];
    live.selectedIds = [];
    live.selectedGuideId = null;
    live.targetedId = null;
    live.draft = null;
    live.draftText = null;
    if (!live.layers.some((layer) => layer.id === live.activeLayerId)) {
      live.activeLayerId = live.layers[0] ? live.layers[0].id : 1;
    }
  });
}
