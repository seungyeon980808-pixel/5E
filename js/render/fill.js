/* ===== RENDER/FILL: fill resolution + grayscale fill patterns ===== */

import { SVG_NS, grayHex } from "./core.js?v=0.54.14";
import { resolveObjectStyle } from "../style-mode.js?v=0.54.14";

/* ===== FILL PATTERNS (grayscale only ??mark color = grayHex(obj.fillLevel)) ===== */
// Tile size / dot radius / mark stroke are fixed world-unit (mm) values, cheap to
// tune. Patterns are per-object (id = pat_{obj.id}) and rebuilt every render, so a
// different fillLevel per object never collides.
const PAT_TILE   = 3.2;  // pattern tile edge (mm)
const PAT_DOT_R  = 0.55; // dot radius (mm)
const PAT_STROKE = 0.35; // cross/hatch mark stroke width (mm)

/* ----- which objects can carry a fill (shared by render + pattern builder) ----- */
// rect/ellipse/triangle always; a polyline or curve only once it is closed.
function isFillable(obj) {
  return obj.type === "rect" || obj.type === "ellipse" || obj.type === "triangle"
      || obj.type === "optics"
      || (obj.type === "polyline" && obj.closed === true)
      || (obj.type === "curve"    && obj.closed === true);
}

/* ----- resolve an object's fill attribute (DESIGN 5-3: empty still clickable) ----- */
//   fillNone            ??"transparent"
//   fillStyle "solid"   ??grayHex(fillLevel)
//   otherwise (pattern) ??url(#pat_{id})
function resolveFill(obj) {
  if (obj.fillNone) return "transparent";
  const style = obj.fillStyle ?? "solid";
  if (style === "solid" || !obj.id) return grayHex(obj.fillLevel);
  return `url(#pat_${obj.id})`;
}

/* ----- build a <pattern> for one object, or null when it needs no pattern ----- */
// Each tile starts with a fill="transparent" base rect so the empty area between
// marks still captures clicks (DESIGN 5-3), exactly like a transparent solid fill.
export function makeFillPattern(obj) {
  obj = resolveObjectStyle(obj);
  const style = obj.fillStyle ?? "solid";
  if (!obj.id || obj.fillNone || style === "solid" || !isFillable(obj)) return null;

  const mark = grayHex(obj.fillLevel);
  const pat = document.createElementNS(SVG_NS, "pattern");
  pat.setAttribute("id", `pat_${obj.id}`);
  pat.setAttribute("patternUnits", "userSpaceOnUse");
  pat.setAttribute("width", PAT_TILE);
  pat.setAttribute("height", PAT_TILE);

  const base = document.createElementNS(SVG_NS, "rect");
  base.setAttribute("width", PAT_TILE);
  base.setAttribute("height", PAT_TILE);
  base.setAttribute("fill", "transparent");
  pat.appendChild(base);

  const line = (x1, y1, x2, y2) => {
    const l = document.createElementNS(SVG_NS, "line");
    l.setAttribute("x1", x1); l.setAttribute("y1", y1);
    l.setAttribute("x2", x2); l.setAttribute("y2", y2);
    l.setAttribute("stroke", mark);
    l.setAttribute("stroke-width", PAT_STROKE);
    pat.appendChild(l);
  };

  if (style === "dots") {
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", PAT_TILE / 2);
    c.setAttribute("cy", PAT_TILE / 2);
    c.setAttribute("r", PAT_DOT_R);
    c.setAttribute("fill", mark);
    pat.appendChild(c);
  } else if (style === "cross") {
    const m = PAT_TILE / 2, d = PAT_TILE * 0.22; // ??arm half-length
    line(m - d, m - d, m + d, m + d);
    line(m - d, m + d, m + d, m - d);
  } else if (style === "hatch") {
    // 45째 parallel lines. The main anti-diagonal tiles seamlessly; the two
    // half-corner segments fill the seams so the lines read as continuous.
    line(0, PAT_TILE, PAT_TILE, 0);
    line(-PAT_TILE / 2, PAT_TILE / 2, PAT_TILE / 2, -PAT_TILE / 2);
    line(PAT_TILE / 2, PAT_TILE * 1.5, PAT_TILE * 1.5, PAT_TILE / 2);
  }
  return pat;
}

export { resolveFill };
