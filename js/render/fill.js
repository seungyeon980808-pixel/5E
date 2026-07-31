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
  /* ----- 암상(岩相) 무늬 4종 — 지구과학 지질 단면 (2026-07-31) -----
   * 지질 도판에서 무늬는 장식이 아니라 '무슨 암석인가'를 말하는 정보다.
   * 기존 4종(solid/dots/cross/hatch)으로는 석회암·화산암·심성암·셰일을 구분할 수
   * 없어 기출 6장이 재현 불가였다(docs/SURVEY_earth_20260731.md §5).
   * 타일 한 장이 그대로 이어붙는 것을 전제로 좌표를 잡는다 — 경계에서 무늬가
   * 끊겨 보이면 안 되므로, 타일 밖으로 나가는 획은 반대편에 짝을 하나 더 둔다. */
  else if (style === "brick") {
    // 벽돌(석회암): 가로 줄눈 2개 + 세로 줄눈을 한 칸씩 엇갈려 쌓는다.
    const h = tile / 2;
    line(0, 0, tile, 0);
    line(0, h, tile, h);
    line(tile / 2, 0, tile / 2, h);        // 위 칸 세로 줄눈: 가운데
    line(0, h, 0, tile);                   // 아래 칸 세로 줄눈: 양 끝(엇갈림)
    line(tile, h, tile, tile);
  } else if (style === "vees") {
    // v (화산암·응회암): 위아래로 엇갈린 작은 v 두 개.
    const a = tile * 0.22;
    const v = (cx, cy) => { line(cx - a, cy - a, cx, cy); line(cx, cy, cx + a, cy - a); };
    v(tile * 0.28, tile * 0.34);
    v(tile * 0.72, tile * 0.84);
  } else if (style === "plus") {
    // + (화강암 등 심성암): 십자를 엇갈려 둘.
    const d = tile * 0.16;
    const plus = (cx, cy) => { line(cx - d, cy, cx + d, cy); line(cx, cy - d, cx, cy + d); };
    plus(tile * 0.3, tile * 0.3);
    plus(tile * 0.75, tile * 0.75);
  } else if (style === "hlines") {
    // 가로줄(셰일·이암): 층리를 나타내는 가는 수평선.
    line(0, tile * 0.25, tile, tile * 0.25);
    line(0, tile * 0.75, tile, tile * 0.75);
  }
  return pat;
}

export { resolveFill };
