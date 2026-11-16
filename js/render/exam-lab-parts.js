/* Independent illustrated laboratory parts. All geometry stays inside x/y/w/h.
 * These shapes are based on survey crops C04/C05/C06/C09/C20/E24. No labels,
 * vessels, clamps or wires are baked into the part. Missing fields use defaults.
 */
import { SVG_NS } from "./core.js?v=1.7.0-four-session-integration";

export const EXAM_LAB_PART_KINDS = new Set([
  "rubber_stopper", "dropping_funnel", "glass_tube", "metal_electrode", "stirrer", "pipe_valve",
]);
const clamp = (v, lo, hi, fallback) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : fallback));
function el(g, tag, attrs) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  g.appendChild(n); return n;
}
function gradient(defs, id, stops) {
  const n = el(defs, "linearGradient", { id, x1: "0%", y1: "0%", x2: "100%", y2: "0%" });
  for (const [offset, color] of stops) el(n, "stop", { offset, "stop-color": color });
  return `url(#${id})`;
}

export function drawExamLabPart(g, obj, sw, color) {
  if (!EXAM_LAB_PART_KINDS.has(obj.kind)) return false;
  const { x, y, w, h } = obj;
  const X = t => x + w * t, Y = t => y + h * t;
  const attrs = { stroke: color, "stroke-width": sw, "stroke-linejoin": "round", "stroke-linecap": "round" };
  const path = (d, fill = "none", extra = {}) => el(g, "path", { d, fill, ...attrs, ...extra });
  const ellipse = (cx, cy, rx, ry, fill = "none", extra = {}) => el(g, "ellipse", { cx, cy, rx, ry, fill, ...attrs, ...extra });
  const line = (x1, y1, x2, y2, extra = {}) => el(g, "line", { x1, y1, x2, y2, ...attrs, ...extra });
  // Unique object IDs are supplied by placement and project IO. Prefix isolates
  // parts from vessel gradients, including multiple instances in one export.
  const id = `lab-${obj.id || obj.kind}-${x}-${y}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  const defs = el(g, "defs", {});
  const glass = gradient(defs, id + "-glass", [["0%", "#d0d0d0"], ["24%", "#fafafa"], ["65%", "#fff"], ["100%", "#cacaca"]]);
  const metal = gradient(defs, id + "-metal", [["0%", "#767676"], ["27%", "#c2c2c2"], ["65%", "#a5a5a5"], ["100%", "#666"]]);
  const rubber = gradient(defs, id + "-rubber", [["0%", "#595959"], ["35%", "#9a9a9a"], ["76%", "#808080"], ["100%", "#484848"]]);

  function tap(cx, cy, span, radius) {
    const angle = clamp(obj.valveAngle, 0, 90, 0);
    const shaft = el(g, "g", { transform: `rotate(${angle} ${cx} ${cy})`, "data-valve-angle": angle });
    el(shaft, "path", { d: `M ${cx-span} ${cy-radius*.5} L ${cx+span*.6} ${cy-radius*.5} Q ${cx+span} ${cy-radius*.7} ${cx+span} ${cy} Q ${cx+span} ${cy+radius*.7} ${cx+span*.6} ${cy+radius*.5} L ${cx-span} ${cy+radius*.5} Z`, fill: "#e0e0e0", ...attrs });
    el(shaft, "ellipse", { cx: cx+span*.8, cy, rx: span*.13, ry: radius*.46, fill: "#9d9d9d", ...attrs });
    el(g, "rect", { x: cx-radius*.8, y: cy-radius, width: radius*1.6, height: radius*2, rx: radius*.18, fill: "#f8f8f8", ...attrs });
    ellipse(cx, cy, radius*.43, radius*.43, "#fff");
  }

  if (obj.kind === "rubber_stopper") {
    const taper = clamp(obj.taper, 0, .3, .04), holes = Math.round(clamp(obj.holeCount, 0, 3, 2));
    const mask = el(defs, "mask", { id: id+"-holes", maskUnits: "userSpaceOnUse", x, y, width: w, height: h });
    el(mask, "rect", { x, y, width: w, height: h, fill: "white" });
    const holeXs = Array.from({ length: holes }, (_, i) => X(.5+(i-(holes-1)/2)*.19));
    // Transparent apertures allow a separately placed tube behind the stopper.
    for (const hx of holeXs) el(mask, "ellipse", { cx: hx, cy: Y(.21), rx: w*.055, ry: h*.075, fill: "black" });
    const body = el(g, "g", { mask: `url(#${id}-holes)` });
    el(body, "path", { d: `M ${X(.1)} ${Y(.21)} L ${X(.1+taper)} ${Y(.82)} Q ${X(.5)} ${Y(.97)} ${X(.9-taper)} ${Y(.82)} L ${X(.9)} ${Y(.21)} Z`, fill: rubber, ...attrs });
    el(body, "ellipse", { cx: X(.5), cy: Y(.21), rx: w*.4, ry: h*.16, fill: "#9b9b9b", ...attrs });
    for (const hx of holeXs) ellipse(hx, Y(.21), w*.055, h*.075, "none", { "data-stopper-hole": "true" });
  } else if (obj.kind === "dropping_funnel") {
    const bodyH = h*clamp(obj.funnelBodyRatio,.2,1,1), FY = t => y+bodyH*t;
    const cx = X(.5), reservoir = `M ${X(.24)} ${FY(.065)} Q ${X(.31)} ${FY(.15)} ${X(.24)} ${FY(.22)} C ${X(.12)} ${FY(.39)} ${X(.33)} ${FY(.49)} ${X(.43)} ${FY(.57)} L ${X(.43)} ${FY(.64)} L ${X(.57)} ${FY(.64)} L ${X(.57)} ${FY(.57)} C ${X(.67)} ${FY(.49)} ${X(.88)} ${FY(.39)} ${X(.76)} ${FY(.22)} Q ${X(.69)} ${FY(.15)} ${X(.76)} ${FY(.065)} Z`;
    path(reservoir, glass);
    const clip = el(defs, "clipPath", { id: id+"-cavity" });
    el(clip, "path", { d: reservoir });
    const level = clamp(obj.liquid, 0, 1, 0);
    if (level > 0) {
      const fy = FY(.57-level*.43), fill = obj.liquidColor || "#c6c6c6";
      const fluid = el(g, "g", { "clip-path": `url(#${id}-cavity)`, "data-liquid-level": level });
      el(fluid, "rect", { x: X(.17), y: fy, width: w*.66, height: FY(.66)-fy, fill });
      el(fluid, "ellipse", { cx, cy: fy, rx: w*.34, ry: bodyH*.018, fill, ...attrs, "stroke-width": sw*.7 });
    }
    path(reservoir);
    path(`M ${X(.29)} ${FY(.12)} Q ${X(.33)} ${FY(.19)} ${X(.29)} ${FY(.24)} C ${X(.21)} ${FY(.39)} ${X(.37)} ${FY(.47)} ${X(.46)} ${FY(.54)}`, "none", { stroke: "#fff", "stroke-width": sw*1.8 });
    ellipse(cx, FY(.065), w*.29, bodyH*.036, "#f8f8f8");
    ellipse(cx, FY(.065), w*.23, bodyH*.018, "none", { "stroke-width": sw*.7 });
    path(`M ${X(.44)} ${FY(.64)} L ${X(.44)} ${Y(.965)} L ${X(.56)} ${Y(.965)} L ${X(.56)} ${FY(.64)} Z`, glass);
    tap(cx, FY(.7), Math.min(w*.4, bodyH*.2), Math.min(w*.092, bodyH*.034));
    ellipse(cx, Y(.965), w*.06, bodyH*.009, "#fff");
  } else if (obj.kind === "glass_tube") {
    const bend = clamp(obj.bendAt, .15, .8, .23), dia = Math.min(Math.min(w,h)*clamp(obj.tubeWidthRatio,.02,.16,.09), w*.09, h*.07);
    const r = Math.min(w*.08, h*.06, dia*1.5), by = Y(bend), vx = X(.86);
    const inlet = clamp(obj.inletDepth, .05, Math.max(.05,.94-bend), .35);
    const d = obj.tubeRoute === "bridge"
      ? `M ${X(.08)} ${by+h*inlet} V ${by+r} Q ${X(.08)} ${by} ${X(.08)+r} ${by} H ${vx-r} Q ${vx} ${by} ${vx} ${by+r} V ${Y(.95)}`
      : `M ${X(.06)} ${by} H ${vx-r} Q ${vx} ${by} ${vx} ${by+r} V ${Y(.95)}`;
    path(d, "none", { "stroke-width": dia+sw*2, "data-tube-bend": bend });
    path(d, "none", { stroke: "#f4f4f4", "stroke-width": dia });
    path(d, "none", { stroke: "#fff", "stroke-width": dia*.44 });
    if (obj.tubeRoute === "bridge") ellipse(X(.08), by+h*inlet, dia*.5, dia*.13, "#fff", { "stroke-width": sw*.7 });
    else ellipse(X(.06), by, dia*.13, dia*.5, "#fff", { "stroke-width": sw*.7 });
    ellipse(vx, Y(.95), dia*.5, dia*.13, "#fff", { "stroke-width": sw*.7 });
  } else if (obj.kind === "metal_electrode") {
    const depth = clamp(obj.depthRatio, .02, .2, .12), dx = w*depth, dy = h*.09, sideY = h*depth*.16;
    const x0 = X(.14), x1 = X(.84)-dx, y0 = Y(.06)+dy+sideY, y1 = Y(.94);
    path(`M ${x0} ${y0} L ${x0+dx} ${y0-sideY} L ${x1+dx} ${y0-dy-sideY} L ${x1} ${y0-dy} Z`, "#ededed");
    path(`M ${x1} ${y0-dy} L ${x1+dx} ${y0-dy-sideY} L ${x1+dx} ${y1-dy-sideY} L ${x1} ${y1-dy} Z`, "#a3a3a3");
    path(`M ${x0} ${y0} L ${x1} ${y0-dy} L ${x1} ${y1-dy} L ${x0} ${y1} Z`, "#dedede");
    line(x0+w*.08, y0+h*.01, x0+w*.08, y1-h*.035, { stroke: "#fff", "stroke-width": sw*.8 });
  } else if (obj.kind === "stirrer") {
    const cx = X(.5), loop = clamp(obj.loopRatio, .25, .85, .68), loopRx = w*loop/2, rodW = Math.min(w*.13,h*.045);
    const rod = `M ${cx-rodW/2} ${Y(.22)} L ${cx-rodW/2} ${Y(.84)} L ${cx+rodW/2} ${Y(.84)} L ${cx+rodW/2} ${Y(.22)} Z`;
    path(rod, metal);
    ellipse(cx, Y(.89), loopRx, h*.053, "none", { "stroke-width": Math.min(rodW*.6,w*.06), stroke: "#888", "data-stirrer-loop": loop });
    path(`M ${cx-w*.12} ${Y(.045)} L ${cx-w*.12} ${Y(.26)} Q ${cx} ${Y(.28)} ${cx+w*.12} ${Y(.26)} L ${cx+w*.12} ${Y(.045)} Z`, metal);
    ellipse(cx, Y(.045), w*.12, h*.015, "#bdbdbd");
    path(`M ${cx-w*.15} ${Y(.32)} L ${cx-w*.15} ${Y(.344)} Q ${cx} ${Y(.355)} ${cx+w*.15} ${Y(.344)} L ${cx+w*.15} ${Y(.32)} Z`, metal);
    ellipse(cx, Y(.32), w*.15, h*.012, "#b7b7b7");
  } else if (obj.kind === "pipe_valve") {
    const cx = X(.5), cy = Y(.65), dia = Math.min(w*.13,h*.15);
    path(`M ${X(.025)} ${cy-dia/2} H ${X(.975)} V ${cy+dia/2} H ${X(.025)} Z`, glass);
    const unit = el(g, "g", { transform: `rotate(${clamp(obj.valveAngle,0,90,0)} ${cx} ${cy})`, "data-valve-angle": clamp(obj.valveAngle,0,90,0) });
    const shaftW = Math.min(w*.075,h*.08), span = Math.min(h*.47,w*.35);
    const knobRx = Math.min(w*.14,h*.16), knobRy = Math.min(h*.044,w*.06);
    el(unit, "rect", { x: cx-shaftW/2, y: cy-span, width: shaftW, height: span+h*.04, fill: "#e6e6e6", ...attrs });
    el(unit, "ellipse", { cx, cy: cy-span, rx: knobRx, ry: knobRy, fill: "#f4f4f4", ...attrs });
    el(unit, "ellipse", { cx, cy: cy+h*.04, rx: knobRx*.85, ry: knobRy*.7, fill: "#eee", ...attrs });
    path(`M ${cx-w*.1} ${cy-dia*.85} H ${cx+w*.1} L ${cx+w*.1} ${cy-dia*.55} L ${cx+w*.066} ${cy-dia*.3} V ${cy+dia*.3} L ${cx+w*.1} ${cy+dia*.55} V ${cy+dia*.85} H ${cx-w*.1} V ${cy+dia*.55} L ${cx-w*.066} ${cy+dia*.3} V ${cy-dia*.3} L ${cx-w*.1} ${cy-dia*.55} Z`, "#f8f8f8");
    line(X(.04), cy, X(.39), cy, { stroke: "#fff", "stroke-width": sw*.75 });
    line(X(.61), cy, X(.96), cy, { stroke: "#fff", "stroke-width": sw*.75 });
  }
  return true;
}
