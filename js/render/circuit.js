/* ===== RENDER/CIRCUIT: two-terminal circuit element symbols ===== */

import {
  SVG_NS,
  grayHex,
  cLine,
  cText,
  fillTextWithRomanRuns,
  applyObjectLabelFont,
} from "./core.js?v=1.2.0";
import { CIRCUIT_BODY_MM, DEFAULT_TEXT_SIZE_MM, DEFAULT_TEXT_FONT } from "../state.js?v=1.2.0";
import { measureFormula, renderFormula } from "../formula.js?v=1.2.0";

/* ===== CIRCUIT: branch-B atomic symbol (two terminals p1/p2, like a line) =====
 *
 * CORE INVARIANT — symmetric leads: the element BODY is always centered on the
 * midpoint of p1–p2 and is a FIXED world size (CIRCUIT_BODY_MM along the axis), so
 * the two leads (terminal → body edge) are ALWAYS equal by construction. Lead
 * lengths are NOT stored; they are derived here. If |p1–p2| < CIRCUIT_BODY_MM the
 * body fills the whole span and the leads are zero-length (clamped, never negative).
 *
 * Geometry is single-source via circuitGeom(); renderCircuit draws the shared
 * skeleton (leads + label) and dispatches the BODY by `element` through
 * CIRCUIT_ELEMENTS, so Steps 2–3 add elements by adding cases only. */
const CIRCUIT_BODY_HALF_H = CIRCUIT_BODY_MM * 0.2; // default body box half-height (perp to axis)
const CIRCUIT_HEIGHT_ELEMENTS = new Set(["resistor", "inductor", "capacitor", "voltmeter", "ammeter"]);

function circuitHalfHeight(obj) {
  const defaultHeight = obj && (obj.element === "voltmeter" || obj.element === "ammeter")
    ? CIRCUIT_CIRCLE_R * 2
    : CIRCUIT_BODY_HALF_H * 2;
  const h = obj && CIRCUIT_HEIGHT_ELEMENTS.has(obj.element) && Number.isFinite(obj.height)
    ? obj.height
    : defaultHeight;
  return Math.max(0.5, h) / 2;
}

// Derive all projection geometry from the two stored terminals. `half` is the
// body half-length along the axis (clamped so it never exceeds the span).
function circuitGeom(obj) {
  const p1 = obj.p1, p2 = obj.p2;
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const L = Math.hypot(dx, dy) || 0.0001;
  const ux = dx / L, uy = dy / L;       // unit vector along p1→p2
  const px = -uy, py = ux;              // unit vector perpendicular to the axis
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const half = Math.min(CIRCUIT_BODY_MM, L) / 2;
  const heightScale = circuitHalfHeight(obj) / CIRCUIT_BODY_HALF_H;
  const bodyStart = { x: mid.x - ux * half, y: mid.y - uy * half };
  const bodyEnd   = { x: mid.x + ux * half, y: mid.y + uy * half };
  return { p1, p2, dx, dy, L, ux, uy, px, py, mid, half, heightScale, bodyStart, bodyEnd };
}

// World-space 4-corner polygon of the element body box (for hit-testing). Shared
// with tools.js so the clickable box matches exactly what renderCircuit draws.
export function circuitBodyPolygon(obj) {
  const g = circuitGeom(obj);
  const { mid, ux, uy, px, py, half } = g;
  const hh = circuitHalfHeight(obj);
  return [
    { x: mid.x - ux * half - px * hh, y: mid.y - uy * half - py * hh },
    { x: mid.x + ux * half - px * hh, y: mid.y + uy * half - py * hh },
    { x: mid.x + ux * half + px * hh, y: mid.y + uy * half + py * hh },
    { x: mid.x - ux * half + px * hh, y: mid.y - uy * half + py * hh },
  ];
}

/* ----- shared circuit body helpers (projection-only, reused by every element) ----- */
const CIRCUIT_CIRCLE_R = CIRCUIT_BODY_MM * 0.32;   // circle-body radius (ac/unknown/lamp/meters)
const CIRCUIT_CAP_GAP_DEFAULT = 2;                 // capacitor plate gap default (mm); mirrors tools.js makeCircuit

// Point at axis-offset `a` (along p1→p2) and perp-offset `o`, in world coords.
function circuitPt(geo, a, o) {
  return { x: geo.mid.x + geo.ux * a + geo.px * o, y: geo.mid.y + geo.uy * a + geo.py * o };
}

// Circle body + short connectors from circle edge to the lead ends (ac/unknown/lamp/meters).
function circuitCircleBody(g, geo, sw, color, obj) {
  const r = obj ? Math.max(0.25, circuitHalfHeight(obj)) : CIRCUIT_CIRCLE_R;
  const c = document.createElementNS(SVG_NS, "circle");
  c.setAttribute("cx", geo.mid.x); c.setAttribute("cy", geo.mid.y);
  c.setAttribute("r", r);
  c.setAttribute("fill", "none");
  c.setAttribute("stroke", color);
  c.setAttribute("stroke-width", sw);
  g.appendChild(c);
  if (geo.half > r) {
    g.appendChild(cLine(circuitPt(geo, -geo.half, 0), circuitPt(geo, -r, 0), sw, color));
    g.appendChild(cLine(circuitPt(geo, r, 0), circuitPt(geo, geo.half, 0), sw, color));
  }
}

/* ----- per-element BODY drawers (dispatch on obj.element). The shared skeleton
 * (leads + label) lives in renderCircuit; each drawer paints ONLY the body in the
 * geo's axis/perp frame, so it rotates with the placement and stays centered. */
const CIRCUIT_ELEMENTS = {
  // resistor: a zig-zag (sawtooth) along the p1→p2 axis — the Korean exam standard.
  // 6 alternating peaks; the first/last points sit on the axis so the leads meet it
  // cleanly. ux/uy (axis) and px/py (perp) already encode the tilt, so the points
  // come out rotated with no transform needed. No fill.
  resistor(g, geo, sw, color) {
    const { mid, ux, uy, px, py, half } = geo;
    const amp = half * 0.35 * geo.heightScale;            // peak amplitude, perp to axis
    const ts   = [0, 1/12, 3/12, 5/12, 7/12, 9/12, 11/12, 1];
    const offs = [0,  amp, -amp,  amp, -amp,  amp, -amp,  0]; // alternating peaks
    const pts = ts.map((t, i) => {
      const a = (2 * t - 1) * half;                       // axis coord: -half … +half
      const o = offs[i];
      return `${mid.x + ux * a + px * o},${mid.y + uy * a + py * o}`;
    }).join(" ");
    const poly = document.createElementNS(SVG_NS, "polyline");
    poly.setAttribute("points", pts);
    poly.setAttribute("fill", "none");
    poly.setAttribute("stroke", color);
    poly.setAttribute("stroke-width", sw);
    g.appendChild(poly);
  },

  // dc_source: long(+) & short(−) bars ⟂ axis with a small gap at center.
  dc_source(g, geo, sw, color) {
    const H = CIRCUIT_BODY_HALF_H, half = geo.half;
    const d = half * 0.18;                                         // half-gap between the bars
    g.appendChild(cLine(circuitPt(geo, -half, 0), circuitPt(geo, -d, 0), sw, color));              // lead → long bar
    g.appendChild(cLine(circuitPt(geo, d, 0), circuitPt(geo, half, 0), sw, color));                // short bar → lead
    g.appendChild(cLine(circuitPt(geo, -d, -H), circuitPt(geo, -d, H), sw, color));                // long (+)
    g.appendChild(cLine(circuitPt(geo, d, -H * 0.5), circuitPt(geo, d, H * 0.5), sw, color));       // short (−)
  },

  // ac_source: circle body with a sine wave (∿) inside.
  ac_source(g, geo, sw, color) {
    circuitCircleBody(g, geo, sw, color);
    const aMax = CIRCUIT_CIRCLE_R * 0.7, amp = CIRCUIT_CIRCLE_R * 0.45, N = 24;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const a = -aMax + (2 * aMax) * (i / N);
      const o = Math.sin((a / aMax) * Math.PI) * amp;
      const p = circuitPt(geo, a, o);
      pts.push(`${p.x},${p.y}`);
    }
    const wave = document.createElementNS(SVG_NS, "polyline");
    wave.setAttribute("points", pts.join(" "));
    wave.setAttribute("fill", "none");
    wave.setAttribute("stroke", color);
    wave.setAttribute("stroke-width", sw);
    g.appendChild(wave);
  },

  // capacitor: two EQUAL parallel bars ⟂ axis, separated by obj.gap (world mm).
  capacitor(g, geo, sw, color, obj) {
    const H = circuitHalfHeight(obj);
    const half = geo.half;
    let gap = (obj && Number.isFinite(obj.gap)) ? obj.gap : CIRCUIT_CAP_GAP_DEFAULT;
    gap = Math.min(gap, half * 1.6);                              // keep plates inside the body span
    const d = gap / 2;
    g.appendChild(cLine(circuitPt(geo, -half, 0), circuitPt(geo, -d, 0), sw, color));   // lead → plate
    g.appendChild(cLine(circuitPt(geo, d, 0), circuitPt(geo, half, 0), sw, color));      // plate → lead
    g.appendChild(cLine(circuitPt(geo, -d, -H), circuitPt(geo, -d, H), sw, color));      // plate 1
    g.appendChild(cLine(circuitPt(geo, d, -H), circuitPt(geo, d, H), sw, color));        // plate 2
  },

  // inductor: 4 semicircle bumps along the axis (bulging to perp+).
  inductor(g, geo, sw, color) {
    const half = geo.half, bumps = 4;
    const R = (2 * half) / bumps / 2;                             // bump radius
    const pts = [];
    for (let b = 0; b < bumps; b++) {
      const ac = -half + R * (2 * b + 1);                         // bump center along axis
      const steps = 10;
      for (let s = (b === 0 ? 0 : 1); s <= steps; s++) {
        const th = Math.PI * (s / steps);                        // 0 → π semicircle
        const p = circuitPt(geo, ac - R * Math.cos(th), R * Math.sin(th) * geo.heightScale);
        pts.push(`${p.x},${p.y}`);
      }
    }
    const coil = document.createElementNS(SVG_NS, "polyline");
    coil.setAttribute("points", pts.join(" "));
    coil.setAttribute("fill", "none");
    coil.setAttribute("stroke", color);
    coil.setAttribute("stroke-width", sw);
    g.appendChild(coil);
  },

  // unknown: circle body with a "?" inside.
  unknown(g, geo, sw, color) {
    circuitCircleBody(g, geo, sw, color);
    cText(g, geo.mid.x, geo.mid.y, "?", CIRCUIT_CIRCLE_R * 1.2, color);
  },

  // diode: filled triangle along axis + cathode bar at the tip; two terminal labels.
  diode(g, geo, sw, color, obj) {
    const H = CIRCUIT_BODY_HALF_H, half = geo.half;
    const triHalf = half * 0.6;
    g.appendChild(cLine(circuitPt(geo, -half, 0), circuitPt(geo, -triHalf, 0), sw, color)); // lead → base
    g.appendChild(cLine(circuitPt(geo, triHalf, 0), circuitPt(geo, half, 0), sw, color));   // bar → lead
    const b1 = circuitPt(geo, -triHalf, -H), b2 = circuitPt(geo, -triHalf, H), apex = circuitPt(geo, triHalf, 0);
    const tri = document.createElementNS(SVG_NS, "polygon");
    tri.setAttribute("points", `${b1.x},${b1.y} ${b2.x},${b2.y} ${apex.x},${apex.y}`);
    tri.setAttribute("fill", color);
    tri.setAttribute("stroke", color);
    tri.setAttribute("stroke-width", sw);
    g.appendChild(tri);
    g.appendChild(cLine(circuitPt(geo, triHalf, -H), circuitPt(geo, triHalf, H), sw, color)); // cathode bar
    const tl = (obj && obj.terminalLabels) || ["", ""];
    const size = DEFAULT_TEXT_SIZE_MM * 0.8;
    const sign = geo.py <= 0 ? 1 : -1;                            // perpendicular toward screen-up
    const off = H + size * 0.7;
    if ((tl[0] ?? "") !== "") cText(g, geo.p1.x + geo.px * off * sign, geo.p1.y + geo.py * off * sign, tl[0], size, color, null, null, obj?.labelType);
    if ((tl[1] ?? "") !== "") cText(g, geo.p2.x + geo.px * off * sign, geo.p2.y + geo.py * off * sign, tl[1], size, color, null, null, obj?.labelType);
  },

  // lamp: circle body with an ✕ inside.
  lamp(g, geo, sw, color) {
    circuitCircleBody(g, geo, sw, color);
    const d = CIRCUIT_CIRCLE_R * 0.6;
    g.appendChild(cLine(circuitPt(geo, -d, -d), circuitPt(geo, d, d), sw, color));
    g.appendChild(cLine(circuitPt(geo, -d, d), circuitPt(geo, d, -d), sw, color));
  },

  // ammeter: circle body with "A" inside.
  ammeter(g, geo, sw, color, obj) {
    circuitCircleBody(g, geo, sw, color, obj);
    cText(g, geo.mid.x, geo.mid.y, "A", Math.max(0.25, circuitHalfHeight(obj)) * 1.2, color);
  },

  // voltmeter: circle body with "V" inside.
  voltmeter(g, geo, sw, color, obj) {
    circuitCircleBody(g, geo, sw, color, obj);
    cText(g, geo.mid.x, geo.mid.y, "V", Math.max(0.25, circuitHalfHeight(obj)) * 1.2, color);
  },
};

function renderCircuit(obj) {
  const sw = obj.strokeWidth ?? 0.2;
  const color = grayHex(obj.strokeLevel);
  const geo = circuitGeom(obj);
  const { p1, p2, ux, uy, px, py, mid, half, bodyStart, bodyEnd, L } = geo;

  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;

  const seg = (a, b) => {
    const l = document.createElementNS(SVG_NS, "line");
    l.setAttribute("x1", a.x); l.setAttribute("y1", a.y);
    l.setAttribute("x2", b.x); l.setAttribute("y2", b.y);
    l.setAttribute("stroke", color);
    l.setAttribute("stroke-width", sw);
    return l;
  };

  // Shared skeleton — leads: terminal → body edge. Equal by construction; drawn
  // only when there is leftover wire (clamped to zero-length when the body fills
  // the whole span, so no overlapping/negative wire).
  if (L > CIRCUIT_BODY_MM) {
    g.appendChild(seg(p1, bodyStart));
    g.appendChild(seg(bodyEnd, p2));
  }

  // BODY — dispatch on element; obj is passed for element-specific fields
  // (capacitor.gap, diode.terminalLabels). All body geometry is derived here.
  (CIRCUIT_ELEMENTS[obj.element] || CIRCUIT_ELEMENTS.resistor)(g, geo, sw, color, obj);

  // Shared skeleton — label: a single text just above the box (only if non-empty),
  // using the world-unit physics/tool label convention.
  if ((obj.label ?? "") !== "") {
    const size = DEFAULT_TEXT_SIZE_MM;
    // Offset along the perpendicular toward screen-up (smaller y) so the label
    // sits "above" the box regardless of the placement tilt.
    const sign = py <= 0 ? 1 : -1;
    const off = CIRCUIT_BODY_HALF_H + size * 0.6;
    const lx = mid.x + px * off * sign;
    const ly = mid.y + py * off * sign;
    if (obj.labelType !== "label") {
      // 물리량(기본): 수식 엔진으로 — R_1이 R₁로, theta가 θ로 (anglearc와 동일 정책).
      const fm = measureFormula(obj.label, size, {
        family: obj.fontFamily || DEFAULT_TEXT_FONT, weight: "normal", style: "normal",
      });
      const fmEl = renderFormula({
        x: lx - fm.w / 2, y: ly - fm.h / 2,
        source: obj.label, fontSize: size,
        fontFamily: obj.fontFamily || DEFAULT_TEXT_FONT,
      });
      if (fmEl) g.appendChild(fmEl);
      return g;
    }
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("x", lx);
    t.setAttribute("y", ly);
    t.setAttribute("font-size", size);
    applyObjectLabelFont(t, obj.labelType);
    t.setAttribute("fill", color);
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("dominant-baseline", "middle");
    if (obj.halo !== false) {
      t.setAttribute("paint-order", "stroke");
      t.setAttribute("stroke", "white");
      t.setAttribute("stroke-width", size * 0.16);
      t.setAttribute("stroke-linejoin", "round");
    }
    fillTextWithRomanRuns(t, obj.label);
    g.appendChild(t);
  }

  return g;
}

export { renderCircuit };
