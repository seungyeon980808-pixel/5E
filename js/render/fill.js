/* ===== RENDER/FILL: fill resolution + grayscale fill patterns ===== */

import { SVG_NS, grayHex } from "./core.js?v=1.3.0";
import { resolveObjectStyle } from "../style-mode.js?v=1.3.0";

/* ===== FILL PATTERNS (grayscale only ??mark color = grayHex(obj.fillLevel)) ===== */
// Tile size / dot radius / mark stroke are fixed world-unit (mm) values, cheap to
// tune. Patterns are per-object (id = pat_{obj.id}) and rebuilt every render, so a
// different fillLevel per object never collides.
const PAT_TILE   = 3.2;  // pattern tile edge (mm) — obj.fillTile 로 덮어쓸 수 있다
const PAT_DOT_R  = 0.55; // dot radius (mm)
const PAT_STROKE = 0.35; // cross/hatch mark stroke width (mm)

/* 자기장 기호 격자로 쓸 때 필요한 조절값(요구):
 *   fillTile     — 기호 간격(mm). 영역이 커져도 원하는 밀도로 유지된다.
 *   fillDotStyle — "filled"(●, 기본) | "ring"(⊙, 가운데 점 있는 원)
 * 평가원은 둘 다 쓴다: ● 는 단순 표기, ⊙ 는 '나오는 방향'을 또렷이 할 때. */
const PAT_TILE_MIN = 0.8, PAT_TILE_MAX = 20;

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
  const tile = Math.min(PAT_TILE_MAX, Math.max(PAT_TILE_MIN,
    Number.isFinite(obj.fillTile) ? obj.fillTile : PAT_TILE));
  const scale = tile / PAT_TILE;          // 기호 크기도 간격에 비례시켜 밀도가 자연스럽게
  const pat = document.createElementNS(SVG_NS, "pattern");
  pat.setAttribute("id", `pat_${obj.id}`);
  pat.setAttribute("patternUnits", "userSpaceOnUse");
  pat.setAttribute("width", tile);
  pat.setAttribute("height", tile);

  const base = document.createElementNS(SVG_NS, "rect");
  base.setAttribute("width", tile);
  base.setAttribute("height", tile);
  base.setAttribute("fill", "transparent");
  pat.appendChild(base);

  const line = (x1, y1, x2, y2) => {
    const l = document.createElementNS(SVG_NS, "line");
    l.setAttribute("x1", x1); l.setAttribute("y1", y1);
    l.setAttribute("x2", x2); l.setAttribute("y2", y2);
    l.setAttribute("stroke", mark);
    l.setAttribute("stroke-width", PAT_STROKE * scale);
    pat.appendChild(l);
  };

  if (style === "dots") {
    const m = tile / 2, r = PAT_DOT_R * scale;
    if (obj.fillDotStyle === "ring") {
      // ⊙ : 테두리 원 + 가운데 점 (자기장 '나오는 방향' 표기)
      const ring = document.createElementNS(SVG_NS, "circle");
      ring.setAttribute("cx", m); ring.setAttribute("cy", m); ring.setAttribute("r", r * 1.45);
      ring.setAttribute("fill", "none");
      ring.setAttribute("stroke", mark);
      ring.setAttribute("stroke-width", PAT_STROKE * scale);
      pat.appendChild(ring);
      const dot = document.createElementNS(SVG_NS, "circle");
      dot.setAttribute("cx", m); dot.setAttribute("cy", m); dot.setAttribute("r", r * 0.42);
      dot.setAttribute("fill", mark);
      pat.appendChild(dot);
    } else {
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("cx", m); c.setAttribute("cy", m); c.setAttribute("r", r);
      c.setAttribute("fill", mark);
      pat.appendChild(c);
    }
  } else if (style === "cross") {
    const m = tile / 2, d = tile * 0.22; // ??arm half-length
    line(m - d, m - d, m + d, m + d);
    line(m - d, m + d, m + d, m - d);
  } else if (style === "hatch") {
    // 45째 parallel lines. The main anti-diagonal tiles seamlessly; the two
    // half-corner segments fill the seams so the lines read as continuous.
    line(0, tile, tile, 0);
    line(-tile / 2, tile / 2, tile / 2, -tile / 2);
    line(tile / 2, tile * 1.5, tile * 1.5, tile / 2);
  }
  return pat;
}

export { resolveFill };
