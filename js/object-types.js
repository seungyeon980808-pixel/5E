/* ===== OBJECT TYPES — single source of per-type classification ===== */
//
// WHY THIS FILE EXISTS (DESIGN follow-up): behavior for each object type used to
// be encoded as hand-written `o.type === "rect" || o.type === ...` chains copied
// across pick.js, render/scene.js, transform.js, snap.js and project-io.js.
// Adding ONE new type meant editing ~6 identical lists by hand; forgetting one
// produced a SILENT bug (object won't move / has no bbox / won't save). This
// table is the ONE place a type declares which behavior-classes it belongs to.
// The category Sets below are DERIVED from it, so a new type is added by adding
// a single row here.
//
// This introduces NO behavior change: every derived Set reproduces the exact
// membership of the literal list it replaced. The original literals are kept as
// `// was:` comments at each migrated call site for cross-checking.

// Canonical id list — mirrors the switch in render/scene.js renderObject().
export const OBJECT_TYPE_IDS = [
  "rect", "ellipse", "triangle",
  "line", "polyline", "curve", "funcgraph",
  "text", "formula",
  "image", "svgAsset",
  "axes", "coordplane",
  "anglearc", "rightangle", "labeler",
  "circuit", "optics", "apparatus", "pendulum",
];

// Per-type classification flags. Each flag names a behavior-class that some
// module dispatches on. Only flags that were duplicated across modules (or are
// core storage-model facts) live here; purely local single-type branches stay
// in their own module.
//
//  sizeBox        : stored as {x,y,w,h}; participates in box move/resize/bbox
//  boxFace        : its axis-aligned bbox IS its exact clickable face (no shaped interior)
//  shape          : a basic drawable primitive (rect / ellipse / triangle)
//  flip           : supports horizontal/vertical flip in rotate mode
//  lineTol        : hit-tested as a thin stroke (wide click band), not a face
//  points         : stored as a points[] array
//  textMeasured   : hit/bbox measured from the live rendered <text> element
//  label          : can carry a name/quantity label (LABEL_CAPABLE)
//  snapEdge       : contributes finite contact edges as a snap target
//  snapLineTarget : contributes line/segment snap targets
//  snapLineLike   : treated as a line-like body for endpoint snapping
export const OBJECT_TYPES = {
  rect:       { sizeBox: 1, boxFace: 1, shape: 1, flip: 1, label: 1, snapEdge: 1 },
  ellipse:    { sizeBox: 1, shape: 1, flip: 1, label: 1 },
  triangle:   { sizeBox: 1, shape: 1, flip: 1, snapEdge: 1 },
  line:       { lineTol: 1, label: 1, snapEdge: 1, snapLineTarget: 1, snapLineLike: 1 },
  polyline:   { points: 1, lineTol: 1, snapEdge: 1, snapLineTarget: 1, snapLineLike: 1 },
  curve:      { points: 1, lineTol: 1, snapLineLike: 1 },
  funcgraph:  { points: 1, lineTol: 1 },
  text:       { textMeasured: 1 },
  formula:    { textMeasured: 1 },
  image:      { sizeBox: 1, boxFace: 1 },
  svgAsset:   { sizeBox: 1, boxFace: 1, flip: 1 },
  axes:       { sizeBox: 1, boxFace: 1, label: 1 },
  coordplane: { sizeBox: 1, boxFace: 1, label: 1 },
  anglearc:   { label: 1 },
  rightangle: {},
  labeler:    { label: 1 },
  circuit:    { lineTol: 1, label: 1, snapLineLike: 1 },
  optics:     { sizeBox: 1, boxFace: 1, flip: 1, label: 1 },
  apparatus:  { sizeBox: 1, boxFace: 1, flip: 1 },
  pendulum:   { lineTol: 1 },
};

// Derive the Set of type ids whose row has `flag` truthy.
function typesWith(flag) {
  return new Set(OBJECT_TYPE_IDS.filter((t) => OBJECT_TYPES[t] && OBJECT_TYPES[t][flag]));
}

// Category Sets — each replaces a literal list previously duplicated in a module.
// (member counts noted so a future edit can sanity-check it did not drift)
export const SIZE_TYPES             = typesWith("sizeBox");        // 9: rect ellipse triangle image svgAsset axes coordplane optics apparatus
export const BOX_FACE_TYPES         = typesWith("boxFace");        // 7: rect image svgAsset axes coordplane optics apparatus
export const SHAPE_TYPES            = typesWith("shape");          // 3: rect ellipse triangle
export const FLIP_TYPES             = typesWith("flip");           // 6: rect ellipse triangle svgAsset optics apparatus
export const LINE_TOL_TYPES         = typesWith("lineTol");        // 6: line polyline curve funcgraph circuit pendulum
export const POINT_ARRAY_TYPES      = typesWith("points");         // 3: polyline curve funcgraph
export const TEXT_MEASURED_TYPES    = typesWith("textMeasured");   // 2: text formula
export const LABEL_CAPABLE_TYPES    = typesWith("label");          // 9: rect ellipse line axes coordplane anglearc labeler circuit optics
export const SNAP_EDGE_TARGET_TYPES = typesWith("snapEdge");       // 4: rect triangle line polyline
export const SNAP_LINE_TARGET_TYPES = typesWith("snapLineTarget"); // 2: line polyline
export const SNAP_LINE_LIKE_TYPES   = typesWith("snapLineLike");   // 4: line circuit polyline curve

// Convenience predicate for the most-duplicated classification (box size object).
export function isSizeObject(o) { return !!o && SIZE_TYPES.has(o.type); }
