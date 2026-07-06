/* ===== RENDER/ANNOTATIONS: axes, angle arc, right-angle mark, labeler ===== */

import {
  SVG_NS,
  grayHex,
  makeArrowHead,
  fillTextWithRomanRuns,
  applyObjectLabelFont,
} from "./core.js?v=0.50.7";
import { makeUprightLabel, estimateLabelBlock } from "./labels.js?v=0.50.7";
import {
  DEFAULT_TEXT_FONT,
  DEFAULT_TEXT_SIZE_MM,
  normalizeTextRuns,
  hasStyledTextRuns,
} from "../state.js?v=0.50.7";

/* ----- axes: one atomic symbol — both axis lines + arrowheads + ticks + labels
 * drawn in a SINGLE pass into one <g>. Ticks/labels are PROJECTIONS computed
 * here from the data (x/y/w/h/showTicks/tickSpacing/label*), never stored as
 * separate objects — mirroring how text is one box, not per-glyph. Mathematical
 * convention: +X points right, +Y points UP (screen-up = smaller SVG y). ----- */
function renderAxes(obj) {
  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;

  // Transparent body rect over the whole bbox: makes the symbol behave as ONE
  // solid object — the entire box is a click/drag target (mirrors a rect's fill,
  // DESIGN 5-3) so body-drag move works from anywhere inside, not only on a line.
  const body = document.createElementNS(SVG_NS, "rect");
  body.setAttribute("x", obj.x);
  body.setAttribute("y", obj.y);
  body.setAttribute("width", obj.w);
  body.setAttribute("height", obj.h);
  body.setAttribute("fill", "transparent");
  g.appendChild(body);

  const color = grayHex(obj.strokeLevel);
  const sw = obj.strokeWidth || 0.2;
  const cx = obj.x + obj.w / 2; // origin = bbox center
  const cy = obj.y + obj.h / 2;
  const left = obj.x, right = obj.x + obj.w;
  const top = obj.y, bottom = obj.y + obj.h; // SVG: top has the smaller y

  const addLine = (x1, y1, x2, y2) => {
    const l = document.createElementNS(SVG_NS, "line");
    l.setAttribute("x1", x1); l.setAttribute("y1", y1);
    l.setAttribute("x2", x2); l.setAttribute("y2", y2);
    l.setAttribute("stroke", color);
    l.setAttribute("stroke-width", sw);
    g.appendChild(l);
  };

  // ----- axis variant: which arms exist + which sides get ticks -----
  // cross    → H+V through origin, all four arms; arrows on +X & +Y.
  // quadrant → origin → right and origin → up only (L-shape); arrows on +X & +Y.
  // single   → one horizontal line; arrow on +X only (labelY/Y-arm ignored).
  const variant = obj.axisVariant || "cross";
  const hasYArm   = variant !== "single";          // vertical arm present?
  const negXArm   = variant === "cross";           // arm to the left of origin?
  const negYArm   = variant === "cross";           // arm below origin?
  const bothSides = variant === "cross";           // ticks on the − side too?

  // ----- arrowheads scaled 1.5× for the axis only (shared makeArrowHead untouched) -----
  const headSw = sw * 1.5;       // inflated stroke-width → head grows 1.5×
  const head = headSw * 4.5;     // arrowhead length at this scale (matches makeArrowHead)

  // ----- axis lines (shortened slightly so the arrowheads cap the ends) -----
  addLine(negXArm ? left : cx, cy, right - head * 0.6, cy);              // X axis (→ +X)
  if (hasYArm) addLine(cx, negYArm ? bottom : cy, cx, top + head * 0.6); // Y axis (→ +Y, up)

  // ----- arrowheads at the +X (right) and +Y (top) ends -----
  g.appendChild(makeArrowHead(right, cy, 1, 0, headSw, color));            // +X → pointing right
  if (hasYArm) g.appendChild(makeArrowHead(cx, top, 0, -1, headSw, color)); // +Y → pointing up

  // ----- tick marks: stepped out from the origin; − side only when bothSides -----
  if (obj.showTicks) {
    const step = Math.max(obj.tickSpacing || 5, 0.5);
    const tHalf = sw * 4; // tick half-length (perpendicular to its axis)
    // X-axis ticks (skip the origin); stop short of the arrowhead.
    for (let d = step; d <= obj.w / 2 - head * 0.6; d += step) {
      addLine(cx + d, cy - tHalf, cx + d, cy + tHalf);
      if (bothSides) addLine(cx - d, cy - tHalf, cx - d, cy + tHalf);
    }
    // Y-axis ticks (skip the origin); stop short of the arrowhead.
    if (hasYArm) {
      for (let d = step; d <= obj.h / 2 - head * 0.6; d += step) {
        addLine(cx - tHalf, cy - d, cx + tHalf, cy - d);                   // +Y (up) side
        if (bothSides) addLine(cx - tHalf, cy + d, cx + tHalf, cy + d);    // −Y (down) side
      }
    }
  }

  // ----- axis labels (equation font, near each arrow tip) -----
  const labelSize = Math.max(sw * 14, 3);
  const addLabel = (text, lx, ly, anchor, baseline) => {
    if (!text) return;
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("x", lx);
    t.setAttribute("y", ly);
    t.setAttribute("font-size", labelSize);
    applyObjectLabelFont(t, obj.labelType);
    t.setAttribute("fill", color);
    t.setAttribute("text-anchor", anchor);
    t.setAttribute("dominant-baseline", baseline);
    fillTextWithRomanRuns(t, text);
    g.appendChild(t);
  };
  addLabel(obj.labelX, right, cy + labelSize * 0.9, "end", "hanging");  // below +X tip
  if (hasYArm) addLabel(obj.labelY, cx - labelSize * 0.5, top, "end", "hanging"); // left of +Y tip

  // ----- rotation: whole symbol turns about its origin (bbox center) -----
  const rot = obj.rotation ?? 0;
  if (rot) g.setAttribute("transform", `rotate(${rot} ${cx} ${cy})`);

  return g;
}

/* ----- anglearc: one atomic symbol — the angle θ drawn in a SINGLE pass.
 * Geometry lives in data (vertex x/y, radius, startAngle, sweepAngle in MATH
 * convention: CCW positive, +Y up). The drawn arc + label are pure PROJECTIONS;
 * the two rays are intentionally NOT drawn (the user adds those with the line
 * tool). A transparent pie-sector body makes the whole wedge ONE solid
 * click/drag target — mirroring how renderAxes lays a transparent body so the
 * symbol behaves as one indivisible object. Rotation is encoded in startAngle
 * (no group transform), keeping the arc data-as-truth. ----- */
function renderAngleArc(obj) {
  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;

  const vx = obj.x, vy = obj.y;                 // vertex (world/SVG coords)
  const r = Math.max(obj.radius || 0, 0.0001);
  const a0 = obj.startAngle || 0;
  const sweep = obj.sweepAngle ?? 0;
  const a1 = a0 + sweep;
  const color = grayHex(obj.strokeLevel);
  const sw = obj.strokeWidth || 0.2;

  // math angle (deg, CCW, +Y up) → SVG point (y down): up = smaller SVG y.
  const pt = (deg) => {
    const rad = (deg * Math.PI) / 180;
    return { x: vx + r * Math.cos(rad), y: vy - r * Math.sin(rad) };
  };
  const p0 = pt(a0), p1 = pt(a1);
  const largeArc = Math.abs(sweep) > 180 ? 1 : 0;
  // math CCW (screen counterclockwise) = SVG sweep-flag 0; CW (negative) = 1.
  const sweepFlag = sweep >= 0 ? 0 : 1;

  // Transparent pie-sector body (vertex → start → arc → close): one solid target.
  const body = document.createElementNS(SVG_NS, "path");
  body.setAttribute("d",
    `M ${vx} ${vy} L ${p0.x} ${p0.y} ` +
    `A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${p1.x} ${p1.y} Z`);
  body.setAttribute("fill", "transparent");
  body.setAttribute("stroke", "none");
  g.appendChild(body);

  // The visible arc (no fill).
  const arc = document.createElementNS(SVG_NS, "path");
  arc.setAttribute("d",
    `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${p1.x} ${p1.y}`);
  arc.setAttribute("fill", "none");
  arc.setAttribute("stroke", color);
  arc.setAttribute("stroke-width", sw);
  g.appendChild(arc);

  // Label (default θ) at the arc midpoint, just OUTSIDE the radius.
  if (obj.showLabel !== false && obj.label) {
    const labelSize = Math.max(sw * 14, 3);
    const mid = a0 + sweep / 2;
    const rad = (mid * Math.PI) / 180;
    const lr = r + labelSize * 0.9;
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("x", vx + lr * Math.cos(rad));
    t.setAttribute("y", vy - lr * Math.sin(rad));
    t.setAttribute("font-size", labelSize);
    applyObjectLabelFont(t, obj.labelType);
    t.setAttribute("fill", color);
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("dominant-baseline", "middle");
    fillTextWithRomanRuns(t, obj.label);
    g.appendChild(t);
  }

  return g;
}

function renderRightAngle(obj) {
  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;
  const color = grayHex(obj.strokeLevel);
  const sw = obj.strokeWidth || 0.2;
  const size = Math.max(obj.size || 4, 0.1);
  const angle = (obj.angle || 0) * Math.PI / 180;
  const side = (obj.orientation ?? 1) >= 0 ? 1 : -1;
  const ux = Math.cos(angle), uy = Math.sin(angle);
  const vx = -uy * side, vy = ux * side;
  const p0 = { x: obj.x, y: obj.y };
  const p1 = { x: p0.x + ux * size, y: p0.y + uy * size };
  const p2 = { x: p1.x + vx * size, y: p1.y + vy * size };
  const p3 = { x: p0.x + vx * size, y: p0.y + vy * size };

  const body = document.createElementNS(SVG_NS, "polygon");
  body.setAttribute("points", `${p0.x},${p0.y} ${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`);
  body.setAttribute("fill", "transparent");
  body.setAttribute("stroke", "none");
  g.appendChild(body);

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y}`);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", color);
  path.setAttribute("stroke-width", sw);
  g.appendChild(path);
  return g;
}

/* ----- labeler: a short leader line (지시선) from a graph anchor to an upright
 * NAME label (이름). Data: p1 = anchor (on/near the graph), p2 = label position,
 * text = label content (circled-letter preset by default), labelSize = mm. The
 * leader runs from p1 toward p2 but stops a SMALL gap short of p2, then the upright
 * (non-rotating) label sits at p2 in the tool label font, upright/normal
 * (makeUprightLabel, Group 6 / v0.31.0). Pure projection — both points are the
 * truth and round-trip on save/load. ----- */
function renderLabeler(obj) {
  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;
  const color = grayHex(obj.strokeLevel);
  const sw = obj.strokeWidth || 0.2;
  const a = obj.p1 || { x: 0, y: 0 };
  const b = obj.p2 || a;
  const size = obj.labelSize || DEFAULT_TEXT_SIZE_MM;

  // Leader from the anchor toward the label, stopping at the edge of the label's
  // (multiline-aware) text block so the line never crosses the glyphs. The block
  // is upright and centered on b (matching makeUprightLabel), so its axis-aligned
  // bounds are valid under any labeler rotation (which rotates a/b in world space).
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const ux = dist ? dx / dist : 0, uy = dist ? dy / dist : 0;
  // Small visual gap (~2-4px equivalent) between the leader tip and the text edge.
  const pad = size * 0.25;
  const { hw, hh } = estimateLabelBlock(obj.text, size, pad);
  // Distance from b back along the leader to where it crosses the padded block:
  // the nearer of the vertical/horizontal faces (ray-vs-centered-box).
  const tx = Math.abs(ux) > 1e-6 ? hw / Math.abs(ux) : Infinity;
  const ty = Math.abs(uy) > 1e-6 ? hh / Math.abs(uy) : Infinity;
  const tBox = Math.min(tx, ty);
  const lead = dist - tBox;                // leader length, trimmed to the block edge
  // Fall back safely when the anchor sits inside (or within the gap of) the text
  // block: skip the leader entirely rather than draw a line over the glyphs.
  if (lead > 0.05) {
    const ex = a.x + ux * lead, ey = a.y + uy * lead;
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", a.x);
    line.setAttribute("y1", a.y);
    line.setAttribute("x2", ex);
    line.setAttribute("y2", ey);
    line.setAttribute("stroke", color);
    line.setAttribute("stroke-width", sw);
    line.setAttribute("stroke-linecap", "round");
    g.appendChild(line);
  }

  // Upright (non-rotating) callout text at p2. The labeler is an editable text
  // object: its default style is Dotum-first NORMAL text (not 물리량 italic). A
  // per-object fontFamily (set in the inspector 글씨체 control) overrides the
  // default; if absent, fall back to the system Dotum stack.
  // 팔레트로 삽입한 구간(Times 정체)·물리량(Times 이탤릭) styled run이 있으면 런 단위로
  // 렌더한다(편집기 미리보기와 일치). 없으면 기존 일반 텍스트(구간 I/II/III 세리프 자동)
  // 경로를 그대로 사용해 예전 라벨과 100% 동일하게 그린다.
  const styled = hasStyledTextRuns(obj);
  const lbl = makeUprightLabel(obj.text, b.x, b.y, color, size, {
    fontFamily: obj.fontFamily || DEFAULT_TEXT_FONT,
    fontStyle: obj.italic === true ? "italic" : "normal",
    fontWeight: obj.fontWeight || "normal",
    styled,
    runs: styled ? normalizeTextRuns(obj) : null,
  });
  if (lbl) g.appendChild(lbl);

  return g;
}

export { renderAxes, renderAngleArc, renderRightAngle, renderLabeler };
