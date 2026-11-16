/* Parametric, print-oriented scientific illustrations.
 * References: C01/C02/C03/C08/C14/C19/E21/B19/B20/B21 in the 2026–2027
 * question survey. Silhouette, rim, glass thickness and occlusion are separate
 * paths; SVG stroke widths and text stay in drawing mm when resized.
 * Stored files without illustrationStyle/chromosomeForm keep their old style.
 */
import { SVG_NS } from "./core.js?v=1.7.0-four-session-integration";
import { vesselFill, vesselWidthAtHeight, thermometerScale, scaleNumber } from "../science-geometry.js?v=1.7.0-four-session-integration";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const number = (v, d) => Number.isFinite(v) ? v : d;
const node = (tag, attrs = {}) => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};
const append = (g, tag, attrs) => g.appendChild(node(tag, attrs));
const key = obj => `exam_${String(obj.id || "draft").replace(/[^a-zA-Z0-9_-]/g, "_")}`;
const path = (g, d, stroke, sw, fill = "none", attrs = {}) => append(g, "path", {
  d, fill, stroke, "stroke-width": sw, "stroke-linejoin": "round", "stroke-linecap": "round", ...attrs,
});
function gradient(defs, id, stops) {
  const el = append(defs, "linearGradient", { id, x1: "0%", y1: "0%", x2: "100%", y2: "0%" });
  for (const [offset, color, opacity = 1] of stops) append(el, "stop", { offset, "stop-color": color, "stop-opacity": opacity });
  return `url(#${id})`;
}
const GLASS = [["0%", "#9f9f9f", 0.25], ["9%", "#e3e3e3", 0.08], ["28%", "#fff", 0], ["78%", "#fff", 0], ["94%", "#b5b5b5", 0.12], ["100%", "#858585", 0.32]];

export const EXAM_VESSEL_KINDS = ["beaker", "flask", "round_flask", "test_tube", "cylinder_graduated", "burette", "u_tube", "tank"];
const SHAPES = {
  beaker: { inner: [7, 8, 86, 86],
    outer: "M 3 8 L 3 90 C 3 102 96 102 96 90 L 96 9",
    cavity: "M 7 8 L 7 90 C 7 99 93 99 93 90 L 93 8 Z",
    wall: "M 7 10 L 7 89 C 7 98 92 98 92 89 L 92 11", rim: [49.5, 7, 46.5, 4.8] },
  flask: { inner: [6, 6, 88, 88],
    outer: "M 31.5 4 L 31.5 32 L 2 89 C -1 102 101 102 98 89 L 68.5 32 L 68.5 4",
    cavity: "M 34.696 6 L 65.304 6 L 65.304 33.08 L 94 93 Q 50 101 6 93 L 34.696 33.08 Z",
    wall: "M 34.7 7 L 34.7 33.1 L 6 91 C 4 99 96 99 94 91 L 65.3 33.1 L 65.3 7", rim: [50, 4, 18.5, 2.6] },
  round_flask: { inner: [4, 4, 92, 92],
    outer: "M 29.5 3 L 29.5 32.214 A 49 35 0 1 0 70.5 32.214 L 70.5 3",
    cavity: "M 31.6 4 L 68.4 4 L 68.4 33.03 A 46 32.857 0 1 1 31.6 33.03 Z",
    wall: "M 31.6 5 L 31.6 33 A 46 32.86 0 1 0 68.4 33 L 68.4 5", rim: [50, 3, 20.5, 2.4] },
  test_tube: { inner: [20, 6, 60, 90],
    outer: "M 16 5 L 16 77 A 34 21 0 0 0 84 77 L 84 5",
    cavity: "M 20 6 L 80 6 L 80 78 A 30 18 0 0 1 20 78 Z",
    wall: "M 20 7 L 20 78 A 30 18 0 0 0 80 78 L 80 7", rim: [50, 5, 34, 2.7] },
  cylinder_graduated: { inner: [28, 4, 44, 79],
    outer: "M 24 4 L 24 82 Q 24 85 50 85 Q 76 85 76 82 L 76 4",
    cavity: "M 28 4 L 72 4 L 72 82 Q 50 86 28 82 Z",
    wall: "M 28 6 L 28 81 Q 50 85 72 81 L 72 6", rim: [50, 4, 26, 2.8] },
  burette: { inner: [37, 3, 26, 79],
    outer: "M 33 3 L 33 78 Q 33 82 45 84 L 45 94 Q 45 97 50 98 Q 55 97 55 94 L 55 84 Q 67 82 67 78 L 67 3",
    cavity: "M 37 3 L 63 3 L 63 79 Q 50 83 37 79 Z",
    wall: "M 37 4 L 37 79 M 63 4 L 63 79", rim: [50, 3, 17, 1.2] },
  u_tube: { inner: [4, 4, 92, 92],
    outer: "M 4 4 L 4 64 C 4 109 96 109 96 64 L 96 4 M 75 4 L 75 64 C 75 91 25 91 25 64 L 25 4",
    cavity: "M 4 4 L 25 4 L 25 64 C 25 91 75 91 75 64 L 75 4 L 96 4 L 96 64 C 96 109 4 109 4 64 Z",
    wall: "M 7 6 L 7 64 C 7 105 93 105 93 64 L 93 6", rim: null },
};
// Absolute coordinates, no group scale: line weight does not stretch.
function mapped(d, obj) {
  const args = { M: 2, L: 2, Q: 4, C: 6, A: 7, Z: 0 };
  const t = d.match(/[A-Za-z]|-?\d*\.?\d+/g) || []; const out = []; let i = 0;
  while (i < t.length) {
    const cmd = t[i++]; out.push(cmd); const a = t.slice(i, i + args[cmd]).map(Number); i += args[cmd];
    if (cmd === "A") out.push(a[0] * obj.w / 100, a[1] * obj.h / 100, a[2], a[3], a[4], obj.x + a[5] * obj.w / 100, obj.y + a[6] * obj.h / 100);
    else for (let k = 0; k < a.length; k += 2) out.push(obj.x + a[k] * obj.w / 100, obj.y + a[k + 1] * obj.h / 100);
  }
  return out.join(" ");
}
export function examVesselInterior(obj) {
  if (obj.illustrationStyle !== "exam") return null;
  if (obj.kind === "tank") {
    const depth = clamp(number(obj.depthRatio, 0.1), 0.02, 0.3), dx = obj.w * depth * 0.65, dy = obj.h * depth;
    return { x: obj.x, y: obj.y + dy + obj.h * 0.04, w: obj.w - dx, h: obj.h * (0.95 - depth) };
  }
  const a = SHAPES[obj.kind]?.inner;
  return a ? { x: obj.x + a[0] * obj.w / 100, y: obj.y + a[1] * obj.h / 100, w: a[2] * obj.w / 100, h: a[3] * obj.h / 100 } : null;
}
function ellipse(g, cx, cy, rx, ry, stroke, sw, fill = "none", attrs = {}) {
  return append(g, "ellipse", { cx, cy, rx, ry, stroke, "stroke-width": sw, fill, ...attrs });
}
function drawTank(g, obj, L) {
  const { x, y, w, h, sw, color, inner } = L;
  const dx = w - inner.w, dy = inner.y - y - h * 0.04, top = y + dy, bottom = y + h;
  const end = x + inner.w, partition = clamp(number(obj.partitionAt, 0.5), 0.05, 0.95);
  const fill = vesselFill(obj), split = !!obj.hasPartition;
  const p = (px, py) => `${px} ${py}`;
  // Far wall and bottom first; liquid faces; the near glass edges last.
  path(g, `M ${p(x + dx, y)} L ${p(x + w, y)} L ${p(x + w, bottom - dy)} L ${p(x + dx, bottom - dy)} Z`, "#aaa", sw * 0.65);
  path(g, `M ${p(x, bottom)} L ${p(end, bottom)} L ${p(x + w, bottom - dy)} L ${p(x + dx, bottom - dy)} Z`, "#999", sw * 0.65);
  const compartments = split ? [["left", x, inner.w * partition], ["right", x + inner.w * partition, inner.w * (1 - partition)]] : [["left", x, inner.w]];
  for (const [side, sx, width] of compartments) {
    const level = clamp(number(split ? obj[`${side}Liquid`] : fill.height, fill.height), 0, 1);
    if (!level) continue;
    const ly = inner.y + inner.h * (1 - level), col = side === "right" ? (obj.rightLiquidColor || obj.liquidColor || "#c9c9c9") : (obj.liquidColor || "#d1d1d1");
    path(g, `M ${p(sx, ly)} L ${p(sx + width, ly)} L ${p(sx + width, bottom)} L ${p(sx, bottom)} Z`, "none", 0, col, { "fill-opacity": 0.7, "data-liquid-side": side });
    path(g, `M ${p(sx, ly)} L ${p(sx + dx, ly - dy)} L ${p(sx + width + dx, ly - dy)} L ${p(sx + width, ly)} Z`, "#858585", sw * 0.55, col, { "fill-opacity": 0.4 });
    if (side === "right" || !split) path(g, `M ${p(sx + width, ly)} L ${p(sx + width + dx, ly - dy)} L ${p(sx + width + dx, bottom - dy)} L ${p(sx + width, bottom)} Z`, "#999", sw * 0.55, col, { "fill-opacity": 0.35 });
  }
  if (split) {
    const px = x + inner.w * partition, t = Math.max(sw * 1.3, w * 0.009);
    path(g, `M ${p(px, bottom)} L ${p(px, top)} L ${p(px + dx, y)} L ${p(px + dx, bottom - dy)} Z`, color, sw * 0.8, "#f2f2f2", { "fill-opacity": 0.55, "data-partition": "tank" });
    append(g, "rect", { x: px + dx - t / 2, y, width: t, height: Math.max(h * 0.04, dy), fill: "#d0d0d0", stroke: color, "stroke-width": sw * 0.7 });
    path(g, `M ${p(px + dx - t * 1.4, y + dy * 0.45)} L ${p(px + dx - t * 1.4, y + h * 0.07)} Q ${p(px + dx, y + h * 0.1)} ${p(px + dx + t * 1.4, y + h * 0.07)} L ${p(px + dx + t * 1.4, y + dy * 0.45)}`, color, sw * 0.6);
  }
  path(g, `M ${p(x, top)} L ${p(x, bottom)} L ${p(end, bottom)} L ${p(end, top)} M ${p(end, bottom)} L ${p(x + w, bottom - dy)} L ${p(x + w, y)}`, color, sw);
  // Rim with an actual thickness, as in the acrylic tank source.
  path(g, `M ${p(x, top)} L ${p(end, top)} L ${p(x + w, y)} L ${p(x + dx, y)} Z M ${p(x, top)} L ${p(x, top + h * 0.035)} L ${p(end, top + h * 0.035)} L ${p(x + w, y + h * 0.035)}`, color, sw * 0.85, "#fff");
  if (split) {
    const px = x + inner.w * partition + dx, t = Math.max(sw * 1.3, w * 0.009), handleY = y - h * 0.17;
    append(g, "rect", { x: px - t * 1.4, y: handleY, width: t * 2.8, height: h * 0.17 + dy,
      fill: "#f5f5f5", stroke: color, "stroke-width": sw * 0.75, "data-partition-handle": "tank" });
    path(g, `M ${px - t * 0.45} ${handleY + h * 0.02} L ${px - t * 0.45} ${y - h * 0.035} Q ${px} ${y - h * 0.02} ${px + t * 0.45} ${y - h * 0.035} L ${px + t * 0.45} ${handleY + h * 0.02}`, color, sw * 0.5);
  }

}
export function drawExamVessel(g, obj, L) {
  if (obj.kind === "tank") { drawTank(g, obj, L); return; }
  const S = SHAPES[obj.kind]; if (!S) return;
  const { inner, color, sw } = L, id = key(obj), defs = append(g, "defs");
  const glass = gradient(defs, id + "_wall", GLASS);
  const shade = gradient(defs, id + "_fluid", [["0%", "#858585", 0.17], ["32%", "#fff", 0.18], ["70%", "#fff", 0.05], ["100%", "#646464", 0.19]]);
  const clipPath = append(defs, "clipPath", { id: id + "_inside" }); append(clipPath, "path", { d: mapped(S.cavity, obj) });
  const clip = `url(#${id}_inside)`, fill = vesselFill(obj), fluid = obj.liquidColor || "#cecece";
  if (obj.kind === "u_tube") {
    for (const [side, sx, width, cx] of [["left", obj.x, obj.w * 0.5, obj.x + obj.w * 0.145], ["right", obj.x + obj.w * 0.5, obj.w * 0.5, obj.x + obj.w * 0.855]]) {
      const level = clamp(number(obj[`${side}Liquid`], fill.height), 0, 1), ly = inner.y + inner.h * (1 - level);
      if (!level) continue;
      append(g, "rect", { x: sx, y: ly, width, height: obj.y + obj.h - ly, fill: side === "right" ? (obj.rightLiquidColor || fluid) : fluid, "clip-path": clip, "data-liquid-side": side });
      ellipse(g, cx, ly, obj.w * 0.105, Math.min(obj.h * 0.015, obj.w * 0.04), "#888", sw * 0.5, "#e8e8e8", { "clip-path": clip });
    }
  } else if (fill.height > 0) {
    const ly = inner.y + inner.h * (1 - fill.height), rx = inner.w * vesselWidthAtHeight(obj.kind, fill.height) / 2;
    append(g, "rect", { x: obj.x - sw, y: ly, width: obj.w + sw * 2, height: obj.y + obj.h - ly, fill: fluid, "clip-path": clip, "data-liquid-volume": fill.volume });
    append(g, "rect", { x: obj.x, y: ly, width: obj.w, height: obj.y + obj.h - ly, fill: shade, "clip-path": clip });
    ellipse(g, inner.x + inner.w / 2, ly, rx, Math.min(rx * 0.16, obj.h * 0.035), "#878787", sw * 0.55, "#dedede", { "clip-path": clip });
  }
  if (obj.kind === "u_tube") {
    const mask = append(defs, "mask", { id: id + "_fluidmask", maskUnits: "userSpaceOnUse", x: obj.x, y: obj.y, width: obj.w, height: obj.h });
    for (const [side, sx] of [["left", obj.x], ["right", obj.x + obj.w / 2]]) {
      const level = clamp(number(obj[`${side}Liquid`], fill.height), 0, 1), ly = inner.y + inner.h * (1 - level);
      if (level > 0) append(mask, "rect", { x: sx, y: ly, width: obj.w / 2, height: obj.y + obj.h - ly, fill: "#fff" });
    }
    const shine = append(g, "g", { "clip-path": clip, mask: `url(#${id}_fluidmask)` });
    const d = mapped("M 14.5 4 L 14.5 64 C 14.5 101 85.5 101 85.5 64 L 85.5 4", obj);
    for (const fraction of [0.7, 0.55, 0.4, 0.25]) path(shine, d, "#fff", obj.w * 0.21 * fraction, "none", { opacity: 0.11 });
  }
  // Continuous glass edge strips rather than a solid opaque body.
  path(g, mapped(S.cavity, obj), "none", 0, glass);
  path(g, mapped(S.wall, obj), "#727272", sw * 0.55);
  path(g, mapped(S.outer, obj), color, sw);
  if (S.rim) {
    const [cx, cy, rx, ry] = S.rim;
    ellipse(g, obj.x + cx * obj.w / 100, obj.y + cy * obj.h / 100, rx * obj.w / 100, ry * obj.h / 100, color, sw * 0.8);
    ellipse(g, obj.x + cx * obj.w / 100, obj.y + cy * obj.h / 100, Math.max(rx - 2, 1) * obj.w / 100, Math.max(ry - 0.8, 0.3) * obj.h / 100, "#888", sw * 0.45);
  }
  if (obj.kind === "beaker") {
    path(g, mapped("M 82 3 Q 96 1 100 7 Q 98 10 94 11", obj), color, sw * 0.85);
    path(g, mapped("M 14 17 L 14 80 M 18 21 L 18 57", obj), "#fff", Math.max(sw, obj.w * 0.012), "none", { opacity: 0.55 });
  }
  if (obj.kind === "u_tube") for (const cx of [14.5, 85.5]) ellipse(g, obj.x + cx * obj.w / 100, obj.y + obj.h * 0.04, obj.w * 0.105, obj.h * 0.013, color, sw * 0.75);
  if (obj.kind === "cylinder_graduated") {
    path(g, mapped("M 26 85 L 7 93 L 7 96 L 93 96 L 93 93 L 74 85 M 7 93 L 93 93", obj), color, sw * 0.85, "#e9e9e9");
    ellipse(g, obj.x + obj.w * 0.5, obj.y + obj.h * 0.842, obj.w * 0.258, obj.h * 0.014, "#666", sw * 0.55);
  }
  if (obj.kind === "burette") {
    const cx = obj.x + obj.w * 0.5, cy = obj.y + obj.h * 0.847;
    const valve = append(g, "g", { transform: `rotate(${clamp(number(obj.valveAngle, 0), 0, 90)} ${cx} ${cy})` });
    path(valve, mapped("M 10 82 L 34 82 Q 40 79 47 82 L 60 82 L 60 81 Q 63 79 66 81 L 66 83 L 82 83 Q 86 79 90 82 L 90 88 Q 86 91 82 87 L 66 87 L 66 89 Q 63 91 60 89 L 60 88 L 47 88 Q 40 91 34 88 L 10 88 Z", obj), color, sw * 0.75, "#ececec");
    ellipse(valve, cx, cy, obj.w * 0.073, obj.h * 0.023, color, sw * 0.65, "#c4c4c4");
  }
  return clip;
}

export function drawExamThermometer(g, obj, sw, color) {
  const { x, y, w, h } = obj, cx = x + w * 0.38;
  const half = Math.min(w * 0.17, h * 0.04), top = y + h * 0.023, bottom = y + h * 0.985;
  const defs = append(g, "defs"), glass = gradient(defs, key(obj) + "_thermo", [["0%", "#8f8f8f"], ["20%", "#e4e4e4"], ["45%", "#fff"], ["75%", "#e7e7e7"], ["100%", "#939393"]]);
  const d = `M ${cx - half} ${top + half} Q ${cx - half} ${top} ${cx} ${top} Q ${cx + half} ${top} ${cx + half} ${top + half} L ${cx + half} ${bottom - half * 1.5} Q ${cx + half} ${bottom} ${cx} ${bottom} Q ${cx - half} ${bottom} ${cx - half} ${bottom - half * 1.5} Z`;
  path(g, d, color, sw * 0.8, glass);
  const scale = thermometerScale(obj), by = bottom - half * 1.8, ty = top + half * 2.5;
  const numeric = obj.temperatureMode === "value" || obj.temperatureMode !== "height" && Number.isFinite(obj.temperature);
  const level = numeric ? scale.level : clamp(number(obj.level, 0.55), 0, 1);
  // A slender reservoir and capillary, not the large black disk of the old icon.
  const r = half * 0.38;
  append(g, "rect", { x: cx - r * 0.45, y: ty, width: r * 0.9, height: by - ty, rx: r * 0.25, fill: "#f6f6f6", stroke: "#777", "stroke-width": sw * 0.4 });
  append(g, "rect", { x: cx - r * 0.34, y: by - (by - ty) * level, width: r * 0.68, height: (by - ty) * level, fill: "#454545", "data-temperature-column": numeric ? scale.value : scale.min + level * (scale.max - scale.min) });
  ellipse(g, cx, by + half * 0.13, r, half * 0.77, color, sw * 0.5, "#777");
  const major = numeric ? scale.marks : [0, 20, 40, 60, 80, 100];
  for (let i = 0; i < major.length; i++) {
    const v = major[i], f = numeric ? (v - scale.min) / (scale.max - scale.min) : v / 100;
    const yy = by - (by - ty) * f;
    path(g, `M ${cx + r + half * 0.14} ${yy} L ${cx + half * 0.94} ${yy}`, color, sw * 0.45);
    if (numeric && obj.showTemperatureNumbers !== false) {
      const text = append(g, "text", { x: cx + half * 1.2, y: yy, "font-family": "Arial, sans-serif", "font-size": Math.min(1.3, h * 0.033), "dominant-baseline": "middle", fill: color }); text.textContent = scaleNumber(v);
    }
    if (i + 1 < major.length) for (let j = 1; j < 5; j++) {
      const vf = f + ((numeric ? (major[i + 1] - scale.min) / (scale.max - scale.min) : major[i + 1] / 100) - f) * j / 5;
      const sy = by - (by - ty) * vf;
      path(g, `M ${cx + half * 0.58} ${sy} L ${cx + half * 0.94} ${sy}`, color, sw * 0.32);
    }
  }
}

export function chromosomeSpread(obj, geo) {
  const angle = clamp(number(obj.spreadAngle, 22), 0, 50) * Math.PI / 180;
  const upper = Math.max(0, geo.len * geo.centromere - geo.w) * Math.tan(angle);
  const lower = Math.max(0, geo.len * (1 - geo.centromere) - geo.w) * Math.tan(angle);
  return { upper, lower, half: Math.max(upper, lower) + geo.w * 0.7 };
}
export function drawExamChromatids(g, obj, geo, fill, stroke, sw) {
  const w = geo.w, top = -geo.len / 2, bottom = geo.len / 2;
  const cy = clamp(geo.centroY, top + Math.min(w, geo.len * 0.2), bottom - Math.min(w, geo.len * 0.2));
  const spread = chromosomeSpread(obj, geo), isSpread = obj.chromosomeForm === "spread" && geo.replicated;
  for (const shift of geo.shifts) {
    const group = append(g, "g", { transform: `translate(${shift} 0)` });
    if (isSpread) {
      for (const sign of [-1, 1]) {
        const wx = sign * w * 0.14;
        for (const [tx, ty] of [[sign * spread.upper, top + w * 0.62], [-sign * spread.lower, bottom - w * 0.62]]) {
          const dx = tx - wx, dy = ty - cy, len = Math.hypot(dx, dy) || 1;
          const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
          const p = (t, side) => `${wx + dx * t + nx * w * side} ${cy + dy * t + ny * w * side}`;
          path(group, `M ${p(0, 0.13)} C ${p(0.24, 0.3)} ${p(0.7, 0.55)} ${p(1, 0.38)}
            Q ${tx + ux * w * 0.55} ${ty + uy * w * 0.55} ${p(1, -0.38)}
            C ${p(0.7, -0.55)} ${p(0.24, -0.3)} ${p(0, -0.13)} Z`, stroke, sw * 0.5, fill, { "data-chromatid": sign });
        }
      }
      ellipse(group, 0, cy, w * 0.29, w * 0.29, stroke, sw * 0.55, "#f9f9f9");
    } else {
      for (const sign of geo.replicated ? [-1, 1] : [0]) {
        const cx = sign * geo.off, join = Math.min(w * 0.26, geo.len * 0.06);
        for (const [a, b] of [[top, cy - join], [cy + join, bottom]]) {
          const len = Math.max(b - a, 0.01), r = Math.min(w / 2, len / 2);
          append(group, "rect", { x: cx - w / 2, y: a, width: w, height: len, rx: r, fill, stroke, "stroke-width": sw * 0.75, "data-chromatid": sign });
        }
        ellipse(group, cx, cy, w * 0.37, Math.min(w * 0.37, geo.len * 0.065), stroke, sw * 0.65, "#bcbcbc");
      }
    }
  }
}

// Deterministic branching avoids jitter between edits and saved renders.
// Bounds use the Bezier control hull so small secondary branches cannot clip.
export function examNeuronGeometry(obj, geo) {
  const R = geo.R, parts = [], points = [];
  const at = (a, b) => ({ x: geo.p1.x + geo.u.x * a + geo.n.x * b, y: geo.p1.y + geo.u.y * a + geo.n.y * b });
  const p = (a, b) => { const q = at(a, b); points.push(q); return `${q.x} ${q.y}`; };
  const addPath = (d, width = 1, fill = "none") => parts.push({ d, width, fill });
  if (geo.len > R) addPath(`M ${p(R * 0.7, -R * 0.21)} C ${p(R * 1.6, -R * 0.15)} ${p(geo.len * 0.7, -R * 0.085)} ${p(geo.len, -R * 0.06)} L ${p(geo.len, R * 0.06)} C ${p(geo.len * 0.7, R * 0.085)} ${p(R * 1.6, R * 0.15)} ${p(R * 0.7, R * 0.21)} Z`, 0.65, "#fff");
  const count = clamp(Math.round(number(obj.dendrites, 5)), 0, 12);
  for (let i = 0; i < count; i++) {
    const a = (65 + 230 * (i + 0.35) / Math.max(count, 1)) * Math.PI / 180;
    const len = R * (1.65 + 0.22 * Math.sin(i * 1.7)), bend = R * 0.18 * Math.cos(i * 1.4);
    const c = Math.cos(a), s = Math.sin(a), n = { x: -s, y: c };
    const q = (t, side = 0) => [c * t + n.x * side, s * t + n.y * side];
    const b = q(R + len, bend), mid = q(R + len * 0.53, -bend), start = q(R * 0.75);
    addPath(`M ${p(start[0] + n.x * R * 0.13, start[1] + n.y * R * 0.13)} Q ${p(mid[0] + n.x * R * 0.07, mid[1] + n.y * R * 0.07)} ${p(...b)} Q ${p(mid[0] - n.x * R * 0.07, mid[1] - n.y * R * 0.07)} ${p(start[0] - n.x * R * 0.13, start[1] - n.y * R * 0.13)} Z`, 0.58, "#fff");
    for (const side of [-1, 1]) {
      const ba = a + side * (0.52 + i % 2 * 0.13), k = R * (0.82 + (i % 3) * 0.1);
      const end = [b[0] + Math.cos(ba) * k, b[1] + Math.sin(ba) * k];
      const m = [b[0] + Math.cos(ba - side * 0.2) * k * 0.52, b[1] + Math.sin(ba - side * 0.2) * k * 0.52];
      addPath(`M ${p(...b)} Q ${p(...m)} ${p(...end)}`, 0.66);
      const t = [end[0] + Math.cos(ba + side * 0.63) * R * 0.42, end[1] + Math.sin(ba + side * 0.63) * R * 0.42];
      addPath(`M ${p(...m)} Q ${p(end[0] - Math.sin(ba) * R * 0.12, end[1] + Math.cos(ba) * R * 0.12)} ${p(...t)}`, 0.45);
    }
  }
  const terminals = clamp(Math.round(number(obj.terminals, 3)), 0, 12);
  for (let i = 0; i < terminals; i++) {
    const a = (-68 + 136 * (i + 0.5) / Math.max(terminals, 1)) * Math.PI / 180;
    const a0 = [geo.len, 0], end = [geo.len + R * (1.1 + 0.2 * (i % 2)) * Math.cos(a), R * 1.6 * Math.sin(a)];
    addPath(`M ${p(...a0)} Q ${p(geo.len + R * 0.55, end[1] * 0.28)} ${p(...end)}`, 0.66);
    const mid = [geo.len + R * 0.55, end[1] * 0.28];
    const e2 = [end[0] + R * 0.32, end[1] + R * (i % 2 ? -0.35 : 0.35)];
    addPath(`M ${p(...mid)} Q ${p(end[0], end[1] * 0.66)} ${p(...e2)}`, 0.5);
  }
  addPath(`M ${p(R, 0)} C ${p(R * 0.72, -R * 0.48)} ${p(R * 0.54, -R * 0.62)} ${p(R * 0.22, -R * 0.76)} Q ${p(-R * 0.25, -R * 1.04)} ${p(-R * 0.72, -R * 0.58)} Q ${p(-R * 1.12, -R * 0.24)} ${p(-R * 0.84, R * 0.27)} Q ${p(-R * 0.79, R * 0.73)} ${p(-R * 0.15, R * 0.78)} C ${p(R * 0.49, R * 0.7)} ${p(R * 0.61, R * 0.33)} ${p(R, 0)} Z`, 0.8, "#fff");
  points.push(at(-R, -R), at(R, R));
  return { parts, points, nucleus: at(-R * 0.12, 0.03 * R) };
}
export function drawExamNeuron(g, obj, geo, stroke, sw) {
  const data = examNeuronGeometry(obj, geo);
  for (const part of data.parts) path(g, part.d, stroke, sw * part.width, part.fill);
  ellipse(g, data.nucleus.x, data.nucleus.y, geo.R * 0.31, geo.R * 0.31, stroke, sw * 0.45, "#c0c0c0");
  return data;
}
