/* ===== VERIFIED PHYSICAL COASTLINE ASSETS ================================
 *
 * Runtime wrapper for the generated Natural Earth land-coastline data.
 *
 * Safety boundary:
 * - callers must select one of the four audited variants explicitly;
 * - output is always 5E fast-scene diagram mode;
 * - no labels, numbers, symbols, leaders, arrows or political borders;
 * - geometry is fitted with one uniform scale, so geographic proportions are
 *   not distorted;
 * - malformed, empty or stale generated data fails closed before compilation.
 */

import {
  MAP_ASSET_DATA_VERSION,
  MAP_ASSET_SOURCE,
  MAP_ASSET_VARIANTS,
} from "./ai-map-assets-data.js";
import {
  FAST_SCENE_SCHEMA_ID,
  auditDiagramObjects,
  compileFastScene,
} from "./ai-scene-fastpath.js";

export const VERIFIED_MAP_RUNTIME_VERSION = "5e-verified-map-runtime@1";
export const VERIFIED_MAP_VARIANT_IDS = Object.freeze([
  "world",
  "pacific",
  "east_asia",
  "korean_peninsula",
]);

const TITLES = Object.freeze({
  world: "World physical coastline",
  pacific: "Pacific physical coastline",
  east_asia: "East Asia physical coastline",
  korean_peninsula: "Korean Peninsula physical coastline",
});

const EXPECTED_GEOMETRY_POLICY = "physical land coastline only; no political boundaries";
const ALLOWED_OPTIONS = new Set([
  "mode", "artboard", "padding", "strokeWidth", "fillLand", "landTone", "fullDetail",
]);
const MAX_RINGS = 128;
const UI_ELEMENT_BUDGET = 120;
const UI_LAND_BUDGET = 42;
const MAX_POINTS_PER_RING = 2048;
const MIN_ARTBOARD = 20;
const MAX_ARTBOARD = 500;

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function finitePair(value) {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
}

function dataError(message) {
  return new Error(`Verified map data is unavailable or invalid: ${message}`);
}

function validateSource() {
  if (!isPlainObject(MAP_ASSET_SOURCE)) throw dataError("source metadata is missing.");
  if (MAP_ASSET_SOURCE.geometry !== EXPECTED_GEOMETRY_POLICY) {
    throw dataError("the source geometry policy is not physical-coastline-only.");
  }
  for (const field of ["name", "url", "commit", "sha256", "coastlineUrl", "coastlineSha256", "license"]) {
    if (typeof MAP_ASSET_SOURCE[field] !== "string" || !MAP_ASSET_SOURCE[field].trim()) {
      throw dataError(`source.${field} is missing.`);
    }
  }
  if (!/^https:\/\//.test(MAP_ASSET_SOURCE.url)) throw dataError("source.url must be HTTPS.");
  if (!/^https:\/\//.test(MAP_ASSET_SOURCE.coastlineUrl)) throw dataError("source.coastlineUrl must be HTTPS.");
  if (!/^[a-f0-9]{40}$/i.test(MAP_ASSET_SOURCE.commit)) throw dataError("source.commit is not pinned.");
  if (!/^[a-f0-9]{64}$/i.test(MAP_ASSET_SOURCE.sha256)) throw dataError("source.sha256 is not pinned.");
  if (!/^[a-f0-9]{64}$/i.test(MAP_ASSET_SOURCE.coastlineSha256)) throw dataError("source.coastlineSha256 is not pinned.");
}

function validateVariantData(id) {
  const item = MAP_ASSET_VARIANTS?.[id];
  if (!isPlainObject(item)) throw dataError(`variant "${id}" is missing.`);
  if (!finitePair(item.sourceSize) || item.sourceSize.some((value) => value <= 0)) {
    throw dataError(`variant "${id}" has an invalid sourceSize.`);
  }
  if (!Array.isArray(item.bbox) || item.bbox.length !== 4 || !item.bbox.every(Number.isFinite)) {
    throw dataError(`variant "${id}" has an invalid bbox.`);
  }
  if (!(item.bbox[0] < item.bbox[2] && item.bbox[1] < item.bbox[3])) {
    throw dataError(`variant "${id}" has a degenerate bbox.`);
  }
  if (!Array.isArray(item.rings) || item.rings.length === 0) {
    throw dataError(`variant "${id}" has no coastline rings.`);
  }
  if (item.rings.length > MAX_RINGS) {
    throw dataError(`variant "${id}" exceeds the ${MAX_RINGS}-ring fast-scene limit.`);
  }
  const [sourceWidth, sourceHeight] = item.sourceSize;
  let pointCount = 0;
  item.rings.forEach((ring, ringIndex) => {
    if (!isPlainObject(ring) || typeof ring.hole !== "boolean") {
      throw dataError(`variant "${id}" ring ${ringIndex} has invalid metadata.`);
    }
    if (!Array.isArray(ring.points) || ring.points.length < 3 || ring.points.length > MAX_POINTS_PER_RING) {
      throw dataError(`variant "${id}" ring ${ringIndex} has an invalid point count.`);
    }
    ring.points.forEach((point, pointIndex) => {
      if (!finitePair(point)) throw dataError(`variant "${id}" ring ${ringIndex} point ${pointIndex} is invalid.`);
      if (point[0] < -1e-4 || point[1] < -1e-4 || point[0] > sourceWidth + 1e-4 || point[1] > sourceHeight + 1e-4) {
        throw dataError(`variant "${id}" ring ${ringIndex} point ${pointIndex} is outside sourceSize.`);
      }
    });
    pointCount += ring.points.length;
  });
  if (Number.isFinite(item.ringCount) && item.ringCount !== item.rings.length) {
    throw dataError(`variant "${id}" ringCount does not match its rings.`);
  }
  if (Number.isFinite(item.pointCount) && item.pointCount !== pointCount) {
    throw dataError(`variant "${id}" pointCount does not match its rings.`);
  }
  if (item.coastlines != null) {
    if (!Array.isArray(item.coastlines)) throw dataError(`variant "${id}" has invalid coastlines.`);
    if (item.coastlines.length > MAX_RINGS) {
      throw dataError(`variant "${id}" exceeds the ${MAX_RINGS}-coastline batch limit.`);
    }
    let coastlinePointCount = 0;
    item.coastlines.forEach((coastline, coastlineIndex) => {
      if (!isPlainObject(coastline) || !Array.isArray(coastline.points)
        || coastline.points.length < 2 || coastline.points.length > MAX_POINTS_PER_RING) {
        throw dataError(`variant "${id}" coastline ${coastlineIndex} has an invalid point count.`);
      }
      coastline.points.forEach((point, pointIndex) => {
        if (!finitePair(point)) {
          throw dataError(`variant "${id}" coastline ${coastlineIndex} point ${pointIndex} is invalid.`);
        }
        if (point[0] < -1e-4 || point[1] < -1e-4 || point[0] > sourceWidth + 1e-4 || point[1] > sourceHeight + 1e-4) {
          throw dataError(`variant "${id}" coastline ${coastlineIndex} point ${pointIndex} is outside sourceSize.`);
        }
      });
      coastlinePointCount += coastline.points.length;
    });
    if (Number.isFinite(item.coastlineCount) && item.coastlineCount !== item.coastlines.length) {
      throw dataError(`variant "${id}" coastlineCount does not match its coastlines.`);
    }
    if (Number.isFinite(item.coastlinePointCount) && item.coastlinePointCount !== coastlinePointCount) {
      throw dataError(`variant "${id}" coastlinePointCount does not match its coastlines.`);
    }
  }
  return item;
}

function assertCatalog() {
  if (typeof MAP_ASSET_DATA_VERSION !== "string" || !MAP_ASSET_DATA_VERSION.trim()) {
    throw dataError("data version is missing.");
  }
  validateSource();
  VERIFIED_MAP_VARIANT_IDS.forEach(validateVariantData);
}

function requireVariant(id) {
  if (typeof id !== "string" || !id.trim()) {
    throw new TypeError(`A verified map variant is required (${VERIFIED_MAP_VARIANT_IDS.join(", ")}).`);
  }
  if (!VERIFIED_MAP_VARIANT_IDS.includes(id)) {
    throw new RangeError(`Unknown verified map variant "${id}". Choose: ${VERIFIED_MAP_VARIANT_IDS.join(", ")}.`);
  }
  assertCatalog();
  return validateVariantData(id);
}

function cloneSource() {
  return {
    name: MAP_ASSET_SOURCE.name,
    url: MAP_ASSET_SOURCE.url,
    commit: MAP_ASSET_SOURCE.commit,
    sha256: MAP_ASSET_SOURCE.sha256,
    coastlineUrl: MAP_ASSET_SOURCE.coastlineUrl,
    coastlineSha256: MAP_ASSET_SOURCE.coastlineSha256,
    license: MAP_ASSET_SOURCE.license,
    geometry: MAP_ASSET_SOURCE.geometry,
  };
}

function metadata(id, item) {
  return {
    id,
    title: TITLES[id],
    runtimeVersion: VERIFIED_MAP_RUNTIME_VERSION,
    dataVersion: MAP_ASSET_DATA_VERSION,
    bbox: [...item.bbox],
    sourceSize: [...item.sourceSize],
    groupCount: item.groupCount,
    ringCount: item.rings.length,
    pointCount: item.rings.reduce((sum, ring) => sum + ring.points.length, 0),
    coastlineCount: Array.isArray(item.coastlines) ? item.coastlines.length : 0,
    coastlinePointCount: Array.isArray(item.coastlines)
      ? item.coastlines.reduce((sum, coastline) => sum + coastline.points.length, 0)
      : 0,
    geometry: EXPECTED_GEOMETRY_POLICY,
    politicalBorders: false,
    renderedAnnotations: false,
    uiElementBudget: UI_ELEMENT_BUDGET,
    source: cloneSource(),
  };
}

/** Return detached metadata for all four pinned, verified variants. */
export function listVerifiedMapMetadata() {
  assertCatalog();
  return VERIFIED_MAP_VARIANT_IDS.map((id) => metadata(id, validateVariantData(id)));
}

/** Compatibility-friendly catalog name; returns the same detached records. */
export function listVerifiedMaps() {
  return listVerifiedMapMetadata();
}

/** Metadata lookup is non-throwing for unknown IDs; scene creation is strict. */
export function getVerifiedMapMetadata(id) {
  if (!VERIFIED_MAP_VARIANT_IDS.includes(id)) return null;
  assertCatalog();
  return metadata(id, validateVariantData(id));
}

function parseOptions(id, item, options) {
  if (!isPlainObject(options)) throw new TypeError(`${id} map options must be an object.`);
  const extra = Object.keys(options).filter((key) => !ALLOWED_OPTIONS.has(key));
  if (extra.length) {
    throw new RangeError(`${id} map does not allow option(s): ${extra.join(", ")}. Labels, arrows and political borders are not runtime options.`);
  }
  if (options.mode != null && options.mode !== "diagram") {
    throw new RangeError("Verified maps are diagram-mode only.");
  }
  let board;
  if (options.artboard == null) {
    board = { w: item.sourceSize[0], h: item.sourceSize[1] };
  } else {
    if (!isPlainObject(options.artboard)) throw new TypeError(`${id}.artboard must be {w,h}.`);
    const w = Number(options.artboard.w), h = Number(options.artboard.h);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < MIN_ARTBOARD || h < MIN_ARTBOARD || w > MAX_ARTBOARD || h > MAX_ARTBOARD) {
      throw new RangeError(`${id}.artboard must stay within ${MIN_ARTBOARD}..${MAX_ARTBOARD} mm per side.`);
    }
    board = { w, h };
  }
  const padding = options.padding == null ? 2.5 : Number(options.padding);
  if (!Number.isFinite(padding) || padding < 0 || padding >= Math.min(board.w, board.h) / 2) {
    throw new RangeError(`${id}.padding must be non-negative and leave a non-empty drawing area.`);
  }
  const strokeWidth = options.strokeWidth == null ? 0.35 : Number(options.strokeWidth);
  if (!Number.isFinite(strokeWidth) || strokeWidth < 0.15 || strokeWidth > 0.8) {
    throw new RangeError(`${id}.strokeWidth must stay within 0.15..0.8 mm.`);
  }
  if (options.fillLand != null && typeof options.fillLand !== "boolean") {
    throw new TypeError(`${id}.fillLand must be boolean.`);
  }
  if (options.fullDetail != null && typeof options.fullDetail !== "boolean") {
    throw new TypeError(`${id}.fullDetail must be boolean.`);
  }
  const fillLand = options.fillLand === true;
  const fullDetail = options.fullDetail === true;
  const landTone = options.landTone == null ? "gray" : String(options.landTone);
  if (!new Set(["gray", "white"]).has(landTone)) {
    throw new RangeError(`${id}.landTone must be gray or white.`);
  }
  return { board, padding, strokeWidth, fillLand, landTone, fullDetail };
}

function round(value) {
  return Number(value.toFixed(5));
}

function polygonArea(points) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index], next = points[(index + 1) % points.length];
    sum += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(sum) / 2;
}

function polylineLength(points) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
  }
  return total;
}

function selectLargestRingGroups(rings, budget) {
  const groups = [];
  let current = null;
  rings.forEach((ring, sourceIndex) => {
    if (!ring.hole || !current) {
      current = { score: polygonArea(ring.points), items: [] };
      groups.push(current);
    }
    current.items.push({ item: ring, sourceIndex });
  });
  groups.sort((left, right) => right.score - left.score || left.items[0].sourceIndex - right.items[0].sourceIndex);
  const selected = [];
  for (const group of groups) {
    if (selected.length + group.items.length > budget) continue;
    selected.push(...group.items);
  }
  return selected;
}

function selectLongestPaths(paths, budget) {
  return paths
    .map((item, sourceIndex) => ({ item, sourceIndex, score: polylineLength(item.points) }))
    .sort((left, right) => right.score - left.score || left.sourceIndex - right.sourceIndex)
    .slice(0, budget)
    .map(({ item, sourceIndex }) => ({ item, sourceIndex }));
}

function buildScene(id, item, options, allowFullDetail = false) {
  const { board, padding, strokeWidth, fillLand, landTone, fullDetail } = parseOptions(id, item, options);
  if (fullDetail && !allowFullDetail) {
    throw new RangeError("fullDetail is available only through compileVerifiedMap().");
  }
  const [sourceWidth, sourceHeight] = item.sourceSize;
  const scale = Math.min(
    (board.w - padding * 2) / sourceWidth,
    (board.h - padding * 2) / sourceHeight,
  );
  if (!Number.isFinite(scale) || scale <= 0) throw dataError(`variant "${id}" cannot fit the requested artboard.`);
  const transformPoints = (points) => points.map(([x, y]) => [
      round((x - sourceWidth / 2) * scale),
      round((y - sourceHeight / 2) * scale),
    ]);
  const hasDedicatedCoastlines = Array.isArray(item.coastlines) && item.coastlines.length > 0;
  let landSources = [];
  let coastlineSources = [];
  if (hasDedicatedCoastlines) {
    if (fullDetail) {
      landSources = fillLand ? item.rings.map((ring, sourceIndex) => ({ item: ring, sourceIndex })) : [];
      coastlineSources = item.coastlines.map((coastline, sourceIndex) => ({ item: coastline, sourceIndex }));
    } else if (fillLand) {
      landSources = selectLargestRingGroups(item.rings, Math.min(UI_LAND_BUDGET, UI_ELEMENT_BUDGET));
      coastlineSources = selectLongestPaths(item.coastlines, UI_ELEMENT_BUDGET - landSources.length);
    } else {
      coastlineSources = selectLongestPaths(item.coastlines, UI_ELEMENT_BUDGET);
    }
  } else {
    // Compatibility with data built before the dedicated coastline extraction.
    coastlineSources = selectLargestRingGroups(item.rings, fullDetail ? MAX_RINGS : UI_ELEMENT_BUDGET);
  }
  const landElements = landSources.map(({ item: ring }) => ({
      type: "curve",
      points: transformPoints(ring.points),
      closed: true,
      fill: true,
      tone: ring.hole ? "white" : landTone,
      arrow: "none",
      strokeWidth,
    }));
  const coastlineElements = hasDedicatedCoastlines
    ? coastlineSources.map(({ item: coastline }) => ({
      type: "polyline",
      points: transformPoints(coastline.points),
      closed: false,
      fill: false,
      arrow: "none",
      strokeWidth,
    }))
    // Generated data before coastline extraction remains usable, but falls
    // back to closed ring outlines instead of claiming artificial precision.
    : coastlineSources.map(({ item: ring }) => ({
      type: "curve",
      points: transformPoints(ring.points),
      closed: true,
      fill: false,
      arrow: "none",
      strokeWidth,
    }));
  const elements = [...landElements, ...coastlineElements];
  return {
    scene: {
      schema: FAST_SCENE_SCHEMA_ID,
      mode: "diagram",
      artboard: board,
      elements,
    },
    scale,
    padding,
    fillLand,
    fullDetail,
    landTone,
    landSources,
    coastlineSources,
    landElementCount: landElements.length,
    coastlineElementCount: coastlineElements.length,
    hasDedicatedCoastlines,
  };
}

/** Create editable coastline-only fast-scene JSON for an explicit variant. */
export function createVerifiedMapScene(id, options = {}) {
  const item = requireVariant(id);
  return buildScene(id, item, options, false).scene;
}

function compileSceneBatches(scene, compileOptions, idPrefix) {
  const batches = [];
  for (let start = 0; start < scene.elements.length; start += MAX_RINGS) {
    batches.push(scene.elements.slice(start, start + MAX_RINGS));
  }
  const compiled = batches.map((elements, index) => compileFastScene({
    ...scene,
    elements,
  }, {
    ...compileOptions,
    mode: "diagram",
    idPrefix: `${idPrefix.slice(0, 34)}_b${index + 1}`,
  }));
  const objects = [];
  for (const batch of compiled) {
    for (const object of batch.objects) {
      object.order = objects.length;
      objects.push(object);
    }
  }
  return {
    schema: FAST_SCENE_SCHEMA_ID,
    mode: "diagram",
    artboard: { ...scene.artboard },
    objects,
    valid: compiled.every((batch) => batch.valid),
    supported: compiled.every((batch) => batch.supported),
    errors: compiled.flatMap((batch) => batch.errors),
    warnings: compiled.flatMap((batch) => batch.warnings),
    unsupported: compiled.flatMap((batch) => batch.unsupported),
    stats: {
      inputElements: scene.elements.length,
      outputObjects: objects.length,
      compileMs: compiled.reduce((sum, batch) => sum + batch.stats.compileMs, 0),
      requiresRasterFallback: compiled.some((batch) => batch.stats.requiresRasterFallback),
      batchCount: compiled.length,
      originNormalization: compiled.map((batch) => batch.stats.originNormalization),
    },
  };
}

/** Compile a verified map to native 5E curves and preserve ring provenance. */
export function compileVerifiedMap(id, options = {}, compileOptions = {}) {
  const item = requireVariant(id);
  if (!isPlainObject(compileOptions)) throw new TypeError("Verified map compile options must be an object.");
  if (compileOptions.mode != null && compileOptions.mode !== "diagram") {
    throw new RangeError("Verified maps are diagram-mode only.");
  }
  const built = buildScene(id, item, options, true);
  const idPrefix = String(compileOptions.idPrefix || `verified_map_${id}`)
    .replace(/[^a-z0-9_-]/gi, "_").slice(0, 40) || `verified_map_${id}`;
  // A detailed map can contain up to 128 land rings plus 128 coastline paths.
  // Each local batch respects the fast-scene limit; only already-normalized
  // native objects are merged. No model or raster fallback is involved.
  const result = compileSceneBatches(built.scene, compileOptions, idPrefix);
  // Filled Natural Earth polygons are only a land mask.  Their strokes would
  // expose source polygon seams, so make each stroke the same gray/white as its
  // fill.  The following open polyline objects carry the actual black physical
  // coastlines.  The legacy no-coastline fallback intentionally keeps black
  // ring outlines.
  if (built.hasDedicatedCoastlines && built.fillLand) {
    result.objects.slice(0, built.landElementCount).forEach((object) => {
      object.strokeLevel = object.fillLevel;
    });
  }
  const violations = auditDiagramObjects(result.objects);
  if (violations.length) {
    result.errors.push(...violations.map((violation) => ({
      ...violation,
      code: "verified_map_diagram_invariant",
    })));
    result.valid = false;
    result.supported = false;
  }
  const rings = built.landElementCount > 0
    ? result.objects.slice(0, built.landElementCount).map((object, index) => ({
      objectId: object.id,
      sourceIndex: built.landSources[index].sourceIndex,
      hole: built.landSources[index].item.hole,
      pointCount: built.landSources[index].item.points.length,
    }))
    : [];
  const coastlines = result.objects.slice(built.landElementCount).map((object, index) => ({
    objectId: object.id,
    sourceIndex: built.coastlineSources[index].sourceIndex,
    pointCount: built.coastlineSources[index].item.points.length,
    closedFallback: !built.hasDedicatedCoastlines,
  }));
  return {
    ...result,
    assetId: `verified_map:${id}`,
    mapVariant: id,
    runtimeVersion: VERIFIED_MAP_RUNTIME_VERSION,
    dataVersion: MAP_ASSET_DATA_VERSION,
    source: cloneSource(),
    metadata: metadata(id, item),
    fit: { scale: built.scale, padding: built.padding },
    rendering: {
      fillLand: built.landElementCount > 0,
      fillLandRequested: built.fillLand,
      fullDetail: built.fullDetail,
      landTone: built.landTone,
      dedicatedCoastlines: built.hasDedicatedCoastlines,
      elementBudget: built.fullDetail ? null : UI_ELEMENT_BUDGET,
      sourceRingsOmitted: item.rings.length - built.landSources.length,
      sourceCoastlinesOmitted: (built.hasDedicatedCoastlines ? item.coastlines.length : item.rings.length)
        - built.coastlineSources.length,
    },
    rings,
    coastlines,
  };
}
