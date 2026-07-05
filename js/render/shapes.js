/* ===== RENDER/SHAPES: rect / ellipse / triangle / line / polyline / curve / image / svgAsset ===== */

import {
  SVG_NS,
  grayHex,
  applyDash,
  makeArrowHead,
  polylineMidpoint,
  roundedPolylinePath,
  catmullRomPath,
  catmullRomClosedPath,
  fillTextWithRomanRuns,
  applyObjectLabelFont,
} from "./core.js?v=0.48.3";
import { withBoxLabel, withLineLabel } from "./labels.js?v=0.48.3";
import { resolveFill } from "./fill.js?v=0.48.3";
import { getSvgAsset } from "../svg-assets.js?v=0.48.3";

/* ----- rect: size-based shape (DESIGN 2-1 branch A) ----- */
function renderRect(obj) {
  const r = document.createElementNS(SVG_NS, "rect");
  r.setAttribute("x", obj.x);
  r.setAttribute("y", obj.y);
  r.setAttribute("width", obj.w);
  r.setAttribute("height", obj.h);

  // Fill: transparent (none) / solid gray / pattern url ??still clicks (DESIGN 5-3).
  r.setAttribute("fill", resolveFill(obj));
  // strokeLevel 0 = black (DESIGN 2-2). stroke-width is in world units.
  r.setAttribute("stroke", grayHex(obj.strokeLevel));
  r.setAttribute("stroke-width", obj.strokeWidth);
  applyDash(r, obj);

  if (obj.rotation) {
    const cx = obj.x + obj.w / 2;
    const cy = obj.y + obj.h / 2;
    r.setAttribute("transform", `rotate(${obj.rotation} ${cx} ${cy})`);
  }
  if (obj.id) r.dataset.id = obj.id;
  return withBoxLabel(r, obj);
}

/* ----- ellipse: size-based shape; bbox (x/y/w/h) ??cx/cy + rx/ry ----- */
function renderEllipse(obj) {
  const el = document.createElementNS(SVG_NS, "ellipse");
  el.setAttribute("cx", obj.x + obj.w / 2);
  el.setAttribute("cy", obj.y + obj.h / 2);
  el.setAttribute("rx", obj.w / 2);
  el.setAttribute("ry", obj.h / 2);

  // Fill: transparent (none) / solid gray / pattern url ??still clicks (DESIGN 5-3).
  el.setAttribute("fill", resolveFill(obj));
  el.setAttribute("stroke", grayHex(obj.strokeLevel));
  el.setAttribute("stroke-width", obj.strokeWidth);
  applyDash(el, obj);

  if (obj.rotation) {
    const cx = obj.x + obj.w / 2;
    const cy = obj.y + obj.h / 2;
    el.setAttribute("transform", `rotate(${obj.rotation} ${cx} ${cy})`);
  }
  if (obj.id) el.dataset.id = obj.id;
  return withBoxLabel(el, obj);
}

/* ----- triangle: right-angle corner determined by flipX 횞 flipY ----- */
// flipX false / flipY false: bottom-left   flipX true  / flipY false: bottom-right
// flipX false / flipY true:  top-left      flipX true  / flipY true:  top-right
function renderTriangle(obj) {
  const el = document.createElementNS(SVG_NS, "polygon");
  const flipX = obj.flipX ?? false;
  const flipY = obj.flipY ?? false;
  let pts;
  if (!flipX && !flipY) {
    pts = `${obj.x},${obj.y + obj.h} ${obj.x + obj.w},${obj.y + obj.h} ${obj.x},${obj.y}`;
  } else if (flipX && !flipY) {
    pts = `${obj.x + obj.w},${obj.y + obj.h} ${obj.x},${obj.y + obj.h} ${obj.x + obj.w},${obj.y}`;
  } else if (!flipX && flipY) {
    pts = `${obj.x},${obj.y} ${obj.x + obj.w},${obj.y} ${obj.x},${obj.y + obj.h}`;
  } else {
    pts = `${obj.x + obj.w},${obj.y} ${obj.x},${obj.y} ${obj.x + obj.w},${obj.y + obj.h}`;
  }
  el.setAttribute("points", pts);

  // Fill: transparent (none) / solid gray / pattern url ??still clicks (DESIGN 5-3).
  el.setAttribute("fill", resolveFill(obj));
  el.setAttribute("stroke", grayHex(obj.strokeLevel));
  el.setAttribute("stroke-width", obj.strokeWidth);
  applyDash(el, obj);

  if (obj.rotation) {
    const cx = obj.x + obj.w / 2;
    const cy = obj.y + obj.h / 2;
    el.setAttribute("transform", `rotate(${obj.rotation} ${cx} ${cy})`);
  }
  if (obj.id) el.dataset.id = obj.id;
  return el;
}

/* ----- line: endpoint-based shape (DESIGN 2-1 branch B); p1?뭦2, no fill ----- */
function renderLine(obj) {
  const savedArrowHead = obj.arrowHead ?? "none";
  // Files created before lineStyle used arrowHead="center" for midpoint arrows.
  let lineStyle = obj.lineMode ?? obj.lineStyle
    ?? (savedArrowHead === "center" ? "middleArrow" : savedArrowHead === "none" ? "solid" : "arrow");
  if (lineStyle === "dimensionArrow") lineStyle = "lengthArrow";
  if (!["solid", "arrow", "middleArrow", "midInward", "lengthArrow"].includes(lineStyle)) lineStyle = "solid";
  const arrowHead = lineStyle === "arrow"
    ? ({ right: "end", left: "start", both: "both" }[obj.arrowVariant] || savedArrowHead)
    : "none";
  const sw = obj.strokeWidth ?? 0.2;
  const color = grayHex(obj.strokeLevel);

  const dx = obj.p2.x - obj.p1.x;
  const dy = obj.p2.y - obj.p1.y;
  const L = Math.sqrt(dx * dx + dy * dy);

  let lx1 = obj.p1.x, ly1 = obj.p1.y;
  let lx2 = obj.p2.x, ly2 = obj.p2.y;
  let nx = 0, ny = 0;

  if (L > 0) {
    nx = dx / L; ny = dy / L;
    const arrowLen = sw * 4.5 * 0.7; // retract to notch: length - notchDepth (length * 0.3)
    if (arrowHead === "end") {
      lx2 -= nx * arrowLen; ly2 -= ny * arrowLen;
    } else if (arrowHead === "start") {
      lx1 += nx * arrowLen; ly1 += ny * arrowLen;
    } else if (arrowHead === "both") {
      lx2 -= nx * arrowLen; ly2 -= ny * arrowLen;
      lx1 += nx * arrowLen; ly1 += ny * arrowLen;
    } else if (lineStyle === "lengthArrow") {
      lx2 -= nx * arrowLen; ly2 -= ny * arrowLen;
      lx1 += nx * arrowLen; ly1 += ny * arrowLen;
    }
    // "center" and "none": no adjustment
  }

  // One <line> segment; strokeLevel 0 = black (DESIGN 2-2), stroke-width in world units.
  const mkSeg = (x1, y1, x2, y2, dashed) => {
    const seg = document.createElementNS(SVG_NS, "line");
    seg.setAttribute("x1", x1);
    seg.setAttribute("y1", y1);
    seg.setAttribute("x2", x2);
    seg.setAttribute("y2", y2);
    seg.setAttribute("stroke", color);
    seg.setAttribute("stroke-width", sw);
    if (dashed) applyDash(seg, obj);
    return seg;
  };

  // "부분 점선": solid for dashRatio of the drawn span (from p1, or p2 when dashFlip),
  // dashed for the rest. Only straight lines; needs a dash length to show the dashes.
  const usePartial = obj.partialDash === true && L > 0 && (obj.dashLength ?? 0) > 0;
  let bodyEls;
  if (usePartial) {
    const segLen = Math.hypot(lx2 - lx1, ly2 - ly1);
    const ux = segLen ? (lx2 - lx1) / segLen : 0;
    const uy = segLen ? (ly2 - ly1) / segLen : 0;
    const ratio = Math.max(0, Math.min(1, obj.dashRatio ?? 0.5));
    const solidLen = ratio * segLen;
    if (!obj.dashFlip) {
      const sx = lx1 + ux * solidLen, sy = ly1 + uy * solidLen;
      bodyEls = [mkSeg(lx1, ly1, sx, sy, false), mkSeg(sx, sy, lx2, ly2, true)];
    } else {
      const sx = lx2 - ux * solidLen, sy = ly2 - uy * solidLen;
      bodyEls = [mkSeg(sx, sy, lx2, ly2, false), mkSeg(lx1, ly1, sx, sy, true)];
    }
  } else {
    bodyEls = [mkSeg(lx1, ly1, lx2, ly2, true)];
  }

  if (lineStyle === "solid" || L === 0) {
    if (bodyEls.length === 1) {
      if (obj.id) bodyEls[0].dataset.id = obj.id;
      return withLineLabel(bodyEls[0], obj);
    }
    const gSolid = document.createElementNS(SVG_NS, "g");
    if (obj.id) gSolid.dataset.id = obj.id;
    bodyEls.forEach((b) => gSolid.appendChild(b));
    return withLineLabel(gSolid, obj);
  }

  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;
  bodyEls.forEach((b) => g.appendChild(b));

  if (arrowHead === "end") {
    g.appendChild(makeArrowHead(obj.p2.x, obj.p2.y, nx, ny, sw, color));
  } else if (arrowHead === "start") {
    g.appendChild(makeArrowHead(obj.p1.x, obj.p1.y, -nx, -ny, sw, color));
  } else if (arrowHead === "both") {
    g.appendChild(makeArrowHead(obj.p2.x, obj.p2.y, nx, ny, sw, color));
    g.appendChild(makeArrowHead(obj.p1.x, obj.p1.y, -nx, -ny, sw, color));
  } else if (lineStyle === "middleArrow") {
    const mx = (obj.p1.x + obj.p2.x) / 2;
    const my = (obj.p1.y + obj.p2.y) / 2;
    const direction = obj.arrowVariant === "left" ? -1 : 1;
    g.appendChild(makeArrowHead(mx, my, nx * direction, ny * direction, sw, color));
  } else if (lineStyle === "midInward") {
    // Two arrowheads at ~1/3 and ~2/3 of the span, BOTH pointing INWARD toward
    // the midpoint (→ on the left half, ← on the right half) — bidirectional
    // tension/compression. n = p1→p2 unit; left head aims +n, right head −n.
    const p13 = { x: obj.p1.x + (obj.p2.x - obj.p1.x) / 3, y: obj.p1.y + (obj.p2.y - obj.p1.y) / 3 };
    const p23 = { x: obj.p1.x + (obj.p2.x - obj.p1.x) * 2 / 3, y: obj.p1.y + (obj.p2.y - obj.p1.y) * 2 / 3 };
    g.appendChild(makeArrowHead(p13.x, p13.y, nx, ny, sw, color));
    g.appendChild(makeArrowHead(p23.x, p23.y, -nx, -ny, sw, color));
  } else if (lineStyle === "lengthArrow") {
    g.appendChild(makeArrowHead(obj.p2.x, obj.p2.y, nx, ny, sw, color));
    g.appendChild(makeArrowHead(obj.p1.x, obj.p1.y, -nx, -ny, sw, color));

    const dimensionVariant = ["basic", "rightBar", "leftBar", "bothBars"].includes(obj.dimensionVariant)
      ? obj.dimensionVariant
      : "basic";
    const capHalf = Math.max(sw * 4, 1.2);
    const addCap = (point) => {
      const cap = document.createElementNS(SVG_NS, "line");
      cap.setAttribute("x1", point.x - ny * capHalf);
      cap.setAttribute("y1", point.y + nx * capHalf);
      cap.setAttribute("x2", point.x + ny * capHalf);
      cap.setAttribute("y2", point.y - nx * capHalf);
      cap.setAttribute("stroke", color);
      cap.setAttribute("stroke-width", sw);
      g.appendChild(cap);
    };
    if (dimensionVariant === "leftBar" || dimensionVariant === "bothBars") addCap(obj.p1);
    if (dimensionVariant === "rightBar" || dimensionVariant === "bothBars") addCap(obj.p2);

    const label = document.createElementNS(SVG_NS, "text");
    const mx = (obj.p1.x + obj.p2.x) / 2;
    const my = (obj.p1.y + obj.p2.y) / 2;
    label.setAttribute("x", mx);
    label.setAttribute("y", my);
    label.setAttribute("fill", color);
    label.setAttribute("font-size", Math.max(2.5, sw * 8));
    // Match the straight-line external label (makeUprightLabel): HWP equation
    // stack so a dimension label (e.g. "Q") reads identically to a line
    // variable label (e.g. "H"). Style only — geometry/behavior unchanged.
    applyObjectLabelFont(label, obj.labelType);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("dominant-baseline", "central");
    label.setAttribute("paint-order", "stroke");
    label.setAttribute("stroke", "white");
    label.setAttribute("stroke-width", Math.max(0.8, sw * 3));
    label.setAttribute("stroke-linejoin", "round");
    fillTextWithRomanRuns(label, obj.dimensionLabel || "d");
    g.appendChild(label);
  }

  return withLineLabel(g, obj);
}

/* ----- polyline: many connected points, black stroke, no fill (click-to-click) ----- */
// Arrowheads use the SAME single arrowHead field + makeArrowHead() as renderLine
// (one setting for the whole line, no per-segment array):
//   end    = last point, direction of the last segment
//   both   = first point (reverse of first segment) + last point
//   center = 50% path-length point, pointing along travel direction
// The arrow-bearing END SEGMENT is retracted by the arrow length, like renderLine.
function renderPolyline(obj) {
  const sw = obj.strokeWidth ?? 0.2;
  const color = grayHex(obj.strokeLevel);
  const pts = obj.points || [];
  const n = pts.length;

  // ----- closed polyline: a filled <polygon> (fillable like rect/ellipse/triangle) -----
  // Arrowheads don't apply to a closed shape; it just takes the shared fill + dash.
  if (obj.closed === true) {
    // 경사면처리 on: a filled <path> with rounded joints (keeps the same fill).
    if (obj.rounded === true && n >= 3) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", roundedPolylinePath(pts, obj.cornerRadius ?? 10, true));
      path.setAttribute("fill", resolveFill(obj));
      path.setAttribute("stroke", color);
      path.setAttribute("stroke-width", sw);
      applyDash(path, obj);
      if (obj.id) path.dataset.id = obj.id;
      return path;
    }
    const poly = document.createElementNS(SVG_NS, "polygon");
    poly.setAttribute("points", pts.map((p) => `${p.x},${p.y}`).join(" "));
    poly.setAttribute("fill", resolveFill(obj));
    poly.setAttribute("stroke", color);
    poly.setAttribute("stroke-width", sw);
    applyDash(poly, obj);
    if (obj.id) poly.dataset.id = obj.id;
    return poly;
  }

  const arrowHead = obj.arrowHead ?? "none";

  // Unit directions of the first/last segments (for arrow placement + retraction).
  let endDir = null, startDir = null;
  if (n >= 2) {
    const a = pts[n - 2], b = pts[n - 1];
    const eL = Math.hypot(b.x - a.x, b.y - a.y);
    if (eL > 0) endDir = { x: (b.x - a.x) / eL, y: (b.y - a.y) / eL };
    const c = pts[0], d = pts[1];
    const sL = Math.hypot(d.x - c.x, d.y - c.y);
    if (sL > 0) startDir = { x: (d.x - c.x) / sL, y: (d.y - c.y) / sL };
  }

  // Working copy of the points; retract the arrow-bearing endpoints to the notch.
  const draw = pts.map((p) => ({ x: p.x, y: p.y }));
  const arrowLen = sw * 4.5 * 0.7; // matches renderLine: length - notchDepth
  if ((arrowHead === "end" || arrowHead === "both") && endDir) {
    draw[n - 1] = { x: pts[n - 1].x - endDir.x * arrowLen, y: pts[n - 1].y - endDir.y * arrowLen };
  }
  if ((arrowHead === "start" || arrowHead === "both") && startDir) {
    draw[0] = { x: pts[0].x + startDir.x * arrowLen, y: pts[0].y + startDir.y * arrowLen };
  }

  // 경사면처리 on: a <path> with rounded joints (sharp endpoints keep the
  // arrowhead direction intact); otherwise the plain <polyline>.
  let el;
  if (obj.rounded === true && n >= 3) {
    el = document.createElementNS(SVG_NS, "path");
    el.setAttribute("d", roundedPolylinePath(draw, obj.cornerRadius ?? 10, false));
  } else {
    el = document.createElementNS(SVG_NS, "polyline");
    el.setAttribute("points", draw.map((p) => `${p.x},${p.y}`).join(" "));
  }
  el.setAttribute("fill", "none");
  // strokeLevel 0 = black (DESIGN 2-2). stroke-width is in world units.
  el.setAttribute("stroke", color);
  el.setAttribute("stroke-width", sw);
  applyDash(el, obj);

  if (arrowHead === "none" || n < 2) {
    if (obj.id) el.dataset.id = obj.id;
    return el;
  }

  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;
  g.appendChild(el);

  if ((arrowHead === "end" || arrowHead === "both") && endDir) {
    g.appendChild(makeArrowHead(pts[n - 1].x, pts[n - 1].y, endDir.x, endDir.y, sw, color));
  }
  if ((arrowHead === "start" || arrowHead === "both") && startDir) {
    g.appendChild(makeArrowHead(pts[0].x, pts[0].y, -startDir.x, -startDir.y, sw, color));
  }
  if (arrowHead === "center") { // legacy project compatibility
    const m = polylineMidpoint(pts);
    if (m) g.appendChild(makeArrowHead(m.x, m.y, m.dx, m.dy, sw, color));
  }

  return g;
}

/* ----- curve: Catmull-Rom smooth path through anchors ----- */
function renderCurve(obj) {
  if (obj.closed === true && (obj.points || []).length >= 3) {
    const el = document.createElementNS(SVG_NS, "path");
    el.setAttribute("d", catmullRomClosedPath(obj.points));
    el.setAttribute("fill", obj.fillNone ? "transparent" : resolveFill(obj));
    el.setAttribute("stroke", grayHex(obj.strokeLevel));
    el.setAttribute("stroke-width", obj.strokeWidth);
    applyDash(el, obj);
    if (obj.id) el.dataset.id = obj.id;
    return el;
  }
  const el = document.createElementNS(SVG_NS, "path");
  el.setAttribute("d", catmullRomPath(obj.points));
  el.setAttribute("fill", "none");
  el.setAttribute("stroke", grayHex(obj.strokeLevel));
  el.setAttribute("stroke-width", obj.strokeWidth);
  applyDash(el, obj);
  if (obj.id) el.dataset.id = obj.id;
  return el;
}

/* ----- image: embedded raster via SVG <image> (href = base64 data URL) ----- */
function renderImage(obj) {
  const el = document.createElementNS(SVG_NS, "image");
  el.setAttribute("x", obj.x);
  el.setAttribute("y", obj.y);
  el.setAttribute("width", obj.w);
  el.setAttribute("height", obj.h);
  el.setAttribute("href", obj.src);
  el.setAttribute("preserveAspectRatio", "none");
  if (obj.opacity != null) el.setAttribute("opacity", obj.opacity);
  const rot = obj.rotation ?? 0;
  const cx = obj.x + obj.w / 2;
  const cy = obj.y + obj.h / 2;

  // ----- no erased regions → identical to the original plain <image> path -----
  const cutouts = Array.isArray(obj.cutouts) ? obj.cutouts : [];
  if (cutouts.length === 0) {
    if (obj.id) el.dataset.id = obj.id;
    if (rot !== 0) el.setAttribute("transform", `rotate(${rot},${cx},${cy})`);
    return el;
  }

  // ----- cutouts present → wrap the <image> in a <g> that carries its OWN <defs>
  // + <mask>, so the mask travels with the object node itself (works identically
  // in the live render AND standalone SVG export — both call renderObject). The
  // mask uses maskContentUnits="objectBoundingBox" so cutout fractions [0..1] map
  // to the image box automatically through move/resize/rotate (the group holds the
  // rotation; the mask lives in the pre-rotation box space). White = keep,
  // black = erased/transparent. Opacity on the <image> still multiplies. -----
  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;
  if (rot !== 0) g.setAttribute("transform", `rotate(${rot},${cx},${cy})`);

  const defs = document.createElementNS(SVG_NS, "defs");
  const maskId = `imgmask_${obj.id}`; // obj ids are unique → no cross-image collision
  const mask = document.createElementNS(SVG_NS, "mask");
  mask.setAttribute("id", maskId);
  mask.setAttribute("maskUnits", "objectBoundingBox");
  mask.setAttribute("maskContentUnits", "objectBoundingBox");

  const base = document.createElementNS(SVG_NS, "rect"); // whole image visible
  base.setAttribute("x", "0"); base.setAttribute("y", "0");
  base.setAttribute("width", "1"); base.setAttribute("height", "1");
  base.setAttribute("fill", "#ffffff");
  mask.appendChild(base);

  for (const cut of cutouts) {
    if (cut && cut.type === "rect") {
      const r = document.createElementNS(SVG_NS, "rect");
      r.setAttribute("x", cut.x); r.setAttribute("y", cut.y);
      r.setAttribute("width", cut.w); r.setAttribute("height", cut.h);
      r.setAttribute("fill", "#000000");
      mask.appendChild(r);
    } else if (cut && (cut.type === "path" || cut.type === "lasso")) {
      const pts = Array.isArray(cut.points) ? cut.points : [];
      if (pts.length < 3) continue;
      const bw = cut.brushWidth || 0.03;
      if (pts.length === 1) {
        // a single tap → a round dot of the brush radius
        const c = document.createElementNS(SVG_NS, "circle");
        c.setAttribute("cx", pts[0].x); c.setAttribute("cy", pts[0].y);
        c.setAttribute("r", bw / 2);
        c.setAttribute("fill", "#000000");
        mask.appendChild(c);
      } else {
        const poly = document.createElementNS(SVG_NS, "polygon");
        poly.setAttribute("points", pts.map((p) => `${p.x},${p.y}`).join(" "));
        poly.setAttribute("fill", "#000000");
        poly.setAttribute("stroke", "#000000");
        poly.setAttribute("stroke-width", bw);
        poly.setAttribute("stroke-linecap", "round");
        poly.setAttribute("stroke-linejoin", "round");
        mask.appendChild(poly);
      }
    }
  }
  defs.appendChild(mask);
  g.appendChild(defs);

  el.setAttribute("mask", `url(#${maskId})`);
  g.appendChild(el);
  return g;
}

/* ----- svgAsset: one selectable, image-like built-in SVG asset ----- */
function renderSvgAsset(obj) {
  const asset = getSvgAsset(obj.assetId);
  const href = obj.src || asset?.dataUri || "";
  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;

  const body = document.createElementNS(SVG_NS, "rect");
  body.setAttribute("x", obj.x);
  body.setAttribute("y", obj.y);
  body.setAttribute("width", obj.w);
  body.setAttribute("height", obj.h);
  body.setAttribute("fill", "transparent");
  g.appendChild(body);

  const image = document.createElementNS(SVG_NS, "image");
  image.setAttribute("x", obj.x);
  image.setAttribute("y", obj.y);
  image.setAttribute("width", obj.w);
  image.setAttribute("height", obj.h);
  image.setAttribute("href", href);
  image.setAttribute("preserveAspectRatio", "xMidYMid meet");
  g.appendChild(image);

  const rot = obj.rotation ?? 0;
  if (rot !== 0) {
    const cx = obj.x + obj.w / 2;
    const cy = obj.y + obj.h / 2;
    g.setAttribute("transform", `rotate(${rot},${cx},${cy})`);
  }
  return g;
}

export {
  renderRect,
  renderEllipse,
  renderTriangle,
  renderLine,
  renderPolyline,
  renderCurve,
  renderImage,
  renderSvgAsset,
};
