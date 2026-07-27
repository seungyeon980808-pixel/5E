/* ===== RENDER/OPTICS-APPARATUS: optics symbols + lab apparatus symbols ===== */

import {
  SVG_NS,
  grayHex,
  applyDash,
  makeArrowHead,
  quadPt,
  cText,
  oLine,
  oQuad,
  oDot,
  hatchVLine,
  oDashV,
} from "./core.js?v=1.3.0";
import { resolveFill } from "./fill.js?v=1.3.0";
import { DEFAULT_TEXT_SIZE_MM } from "../state.js?v=1.3.0";

/* ===== OPTICS: branch-A box symbol (x/y/w/h/rotation), kind-dispatched =====
 *
 * Reuses the rect/ellipse interaction skeleton wholesale (creation, selection,
 * resize, rotate, hit-test) — only the render differs. Every symbol is drawn as
 * a PROJECTION from the bounding box and is symmetric about the box's horizontal
 * axis (the optical axis). A transparent body rect makes the whole box one
 * click/drag target (like renderAxes). Rotation is one group transform about the
 * box center, matching renderRect. */

// Optional center dashed line through a lens. centerLine: "none"|"top"|"bottom"|"full".
// "top" = upper half (lens top→center), "bottom" = lower half (center→bottom).
function drawCenterLine(g, obj, sw, color) {
  const mode = obj.centerLine || "none";
  if (mode === "none") return;
  const cx = obj.x + obj.w / 2;
  const top = obj.y, bottom = obj.y + obj.h, cy = obj.y + obj.h / 2;
  let y1 = top, y2 = bottom;
  if (mode === "top") { y2 = cy; }
  else if (mode === "bottom") { y1 = cy; }
  oDashV(g, cx, y1, y2, sw, color);
}
// Mirror = vertical arc bowing `sign` in x + hatch ticks on the back (bulge) side.
function drawMirror(g, obj, sw, color, sign) {
  const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
  const top = obj.y, bottom = obj.y + obj.h;
  const cpx = cx + obj.w * 0.32 * sign;
  oQuad(g, cx, top, cpx, cy, cx, bottom, sw, color);
  const n = 6, len = Math.min(obj.h * 0.12, 2) + 0.4;
  for (let i = 1; i <= n; i++) {
    const p = quadPt(cx, top, cpx, cy, cx, bottom, i / (n + 1));
    oLine(g, p.x, p.y, p.x + sign * len, p.y - len, sw, color);
  }
}

const OPTICS_KINDS = {
  // convex_lens: two outward-bowed arcs meeting at sharp top & bottom vertices
  // (eye shape). No arrowheads. Optional center dashed line via centerLine.
  convex_lens(g, obj, sw, color) {
    const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
    const top = obj.y, bottom = obj.y + obj.h, bow = obj.w * 0.5;
    oQuad(g, cx, top, cx - bow, cy, cx, bottom, sw, color);   // left bulge
    oQuad(g, cx, top, cx + bow, cy, cx, bottom, sw, color);   // right bulge
    drawCenterLine(g, obj, sw, color);
  },
  // concave_lens: ")(" inward arcs with flat caps (pinched middle / bowtie).
  // No arrowheads. Optional center dashed line via centerLine.
  concave_lens(g, obj, sw, color) {
    const cy = obj.y + obj.h / 2;
    const left = obj.x, right = obj.x + obj.w, top = obj.y, bottom = obj.y + obj.h;
    const bow = obj.w * 0.32;
    oLine(g, left, top, right, top, sw, color);                   // top cap
    oLine(g, left, bottom, right, bottom, sw, color);             // bottom cap
    oQuad(g, left, top, left + bow, cy, left, bottom, sw, color);    // ")" bulge right
    oQuad(g, right, top, right - bow, cy, right, bottom, sw, color); // "(" bulge left
    drawCenterLine(g, obj, sw, color);
  },
  // convex_mirror: arc bowing right + hatch ticks on the back (right) side.
  convex_mirror(g, obj, sw, color) { drawMirror(g, obj, sw, color, 1); },
  // concave_mirror: arc bowing left + hatch ticks on the back (left) side.
  concave_mirror(g, obj, sw, color) { drawMirror(g, obj, sw, color, -1); },
  // object_arrow: thick UP arrow spanning h at the box center x.
  object_arrow(g, obj, sw, color) {
    const cx = obj.x + obj.w / 2, top = obj.y, bottom = obj.y + obj.h;
    const bodyWidth = Math.max(sw * 2.5, 0.5);
    const headSw = Math.max(sw * 3, 0.7);
    const arrowLen = headSw * 4.5 * 0.7;
    const shaftTop = Math.min(bottom, top + arrowLen);
    const shaft = document.createElementNS(SVG_NS, "line");
    shaft.setAttribute("x1", cx);
    shaft.setAttribute("y1", bottom);
    shaft.setAttribute("x2", cx);
    shaft.setAttribute("y2", shaftTop);
    shaft.setAttribute("stroke", color);
    shaft.setAttribute("stroke-width", bodyWidth);
    applyDash(shaft, obj);
    g.appendChild(shaft);
    g.appendChild(makeArrowHead(cx, top, 0, -1, headSw, color));
  },
  // pulley: circle (dia = min(w,h)) + small center axle dot. No rope.
  pulley(g, obj, sw, color) {
    const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
    const r = Math.min(obj.w, obj.h) / 2;
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", r);
    c.setAttribute("fill", resolveFill(obj));
    c.setAttribute("stroke", color); c.setAttribute("stroke-width", sw);
    g.appendChild(c);
    oDot(g, cx, cy, Math.max(r * 0.12, 0.4), color);
  },
  // plane_mirror: vertical straight line + back-side hatch ticks.
  plane_mirror(g, obj, sw, color) {
    const cx = obj.x + obj.w / 2, top = obj.y, bottom = obj.y + obj.h;
    oLine(g, cx, top, cx, bottom, sw, color);
    hatchVLine(g, cx, top, bottom, 1, sw, color);
  },
  // point_light: small filled circle + short radial rays.
  point_light(g, obj, sw, color) {
    const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
    const m = Math.min(obj.w, obj.h);
    oDot(g, cx, cy, m * 0.16, color);
    const rIn = m * 0.26, rOut = m * 0.48;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      oLine(g, cx + Math.cos(a) * rIn, cy + Math.sin(a) * rIn,
               cx + Math.cos(a) * rOut, cy + Math.sin(a) * rOut, sw, color);
    }
  },
  // node: small filled circle only (wire junction).
  node(g, obj, sw, color) {
    oDot(g, obj.x + obj.w / 2, obj.y + obj.h / 2, Math.min(obj.w, obj.h) * 0.22, color);
  },
  // screen: a thick vertical bar with hatch ticks on one side (projection screen).
  screen(g, obj, sw, color) {
    const cx = obj.x + obj.w / 2, top = obj.y, bottom = obj.y + obj.h;
    oLine(g, cx, top, cx, bottom, sw, color, Math.max(sw * 3, 0.8));
    hatchVLine(g, cx, top, bottom, 1, sw, color);
  },
};

/* 회전축(pivot)·받침대(support_tri)·막대자석(bar_magnet)은 2026-07-26 교사 지시로
 * 코드에서 삭제했다. 막대자석은 자기력선 도구(fieldlines)에서 '자기력선 끄기'로 대체한다. */
function renderOptics(obj) {
  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;
  const color = grayHex(obj.strokeLevel);
  const sw = obj.strokeWidth || 0.2;

  // Transparent body over the whole bbox: the symbol behaves as ONE click/drag
  // target (mirrors renderAxes), so a hollow lens/mirror is grabbable anywhere.
  const body = document.createElementNS(SVG_NS, "rect");
  body.setAttribute("x", obj.x); body.setAttribute("y", obj.y);
  body.setAttribute("width", obj.w); body.setAttribute("height", obj.h);
  body.setAttribute("fill", "transparent");
  g.appendChild(body);

  (OPTICS_KINDS[obj.kind] || OPTICS_KINDS.convex_lens)(g, obj, sw, color);

  // Optional label below the bbox (toggled by showLabel, like the anglearc label).
  if (obj.showLabel && (obj.label ?? "") !== "") {
    const size = DEFAULT_TEXT_SIZE_MM;
    cText(g, obj.x + obj.w / 2, obj.y + obj.h + size * 0.8, obj.label, size, color, null, null, obj.labelType);
  }

  const rot = obj.rotation ?? 0;
  if (rot) {
    const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
    g.setAttribute("transform", `rotate(${rot} ${cx} ${cy})`);
  }

  // Node label (Feature G): a horizontal text above/below the dot that must NEVER
  // rotate with the object. Rendered in an un-rotated wrapper OUTSIDE g's rotate
  // transform; the dot sits at the rotation center, so its position is unaffected.
  if (obj.kind === "node" && (obj.label ?? "") !== "") {
    const wrap = document.createElementNS(SVG_NS, "g");
    if (obj.id) { wrap.dataset.id = obj.id; delete g.dataset.id; }
    wrap.appendChild(g);
    const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
    const dotR = Math.min(obj.w, obj.h) * 0.22;
    const size = DEFAULT_TEXT_SIZE_MM;
    const ly = (obj.labelPos ?? "above") === "below"
      ? cy + dotR + size * 0.7
      : cy - dotR - size * 0.7;
    cText(wrap, cx, ly, obj.label, size, color, null, null, obj.labelType);
    return wrap;
  }
  return g;
}

function renderApparatus(obj) {
  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;
  const body = document.createElementNS(SVG_NS, "rect");
  body.setAttribute("x", obj.x);
  body.setAttribute("y", obj.y);
  body.setAttribute("width", obj.w);
  body.setAttribute("height", obj.h);
  body.setAttribute("fill", "transparent");
  g.appendChild(body);

  const color = grayHex(obj.strokeLevel);
  const sw = obj.strokeWidth || 0.2;
  const kind = obj.kind || "wire";
  if (kind === "wire") drawWire(g, obj, sw, color);
  else if (kind === "compass") drawCompass(g, obj, sw, color);
  else if (kind === "pulley") drawPulley(g, obj, sw, color);
  else if (kind === "clamp") drawClamp(g, obj, sw, color);
  else if (kind === "scale") drawScale(g, obj, sw, color);

  const rot = obj.rotation ?? 0;
  if (rot) {
    const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
    g.setAttribute("transform", `rotate(${rot} ${cx} ${cy})`);
  }
  return g;
}

function drawWire(g, obj, sw, color) {
  const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
  const length = Math.max(obj.length || obj.w || 20, 1);
  const thickness = Math.max(obj.thickness ?? obj.gap ?? Math.max(sw * 6, 1.8), sw * 2.5, 0.2);
  const angle = (obj.angle || 0) * Math.PI / 180;
  const wire = document.createElementNS(SVG_NS, "rect");
  wire.setAttribute("x", cx - length / 2);
  wire.setAttribute("y", cy - thickness / 2);
  wire.setAttribute("width", length);
  wire.setAttribute("height", thickness);
  wire.setAttribute("rx", thickness / 2);
  wire.setAttribute("fill", "#e6e6e6");
  wire.setAttribute("stroke", color);
  wire.setAttribute("stroke-width", sw);
  wire.setAttribute("transform", `rotate(${angle * 180 / Math.PI} ${cx} ${cy})`);
  g.appendChild(wire);
}

function drawCompass(g, obj, sw, color) {
  const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
  const r = Math.min(obj.w, obj.h) / 2 * 0.88;
  const c = document.createElementNS(SVG_NS, "circle");
  c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", r);
  c.setAttribute("fill", "none"); c.setAttribute("stroke", color); c.setAttribute("stroke-width", sw);
  g.appendChild(c);
  const deg = obj.needleAngle ?? -90;
  const rad = deg * Math.PI / 180;
  const ux = Math.cos(rad), uy = Math.sin(rad);
  const px = -uy, py = ux;
  const tip = { x: cx + ux * r * 0.72, y: cy + uy * r * 0.72 };
  const tail = { x: cx - ux * r * 0.72, y: cy - uy * r * 0.72 };
  const half = r * 0.13;
  const needle = document.createElementNS(SVG_NS, "polygon");
  needle.setAttribute("points",
    `${tip.x},${tip.y} ${cx + px * half},${cy + py * half} ${tail.x},${tail.y} ${cx - px * half},${cy - py * half}`);
  needle.setAttribute("fill", "#d9d9d9");
  needle.setAttribute("stroke", color);
  needle.setAttribute("stroke-width", sw);
  g.appendChild(needle);
  oLine(g, cx - px * half * 0.8, cy - py * half * 0.8, cx + px * half * 0.8, cy + py * half * 0.8, sw * 0.7, color);
  oDot(g, cx, cy, Math.max(r * 0.08, sw * 1.2), color);
}

function drawPulley(g, obj, sw, color) {
  const variant = obj.variant || "basic";
  // 천장/벽 고정형: 시험 그림의 고정 도르래(고정판 + 브래킷 + 홈 있는 바퀴).
  // 기존 basic/simple(팔+볼트 달린 형태)과 형태가 아예 달라 별도 경로로 그린다.
  if (variant === "ceiling" || variant === "wall") {
    drawMountedPulley(g, obj, sw, color, variant);
    return;
  }
  const cx = obj.x + obj.w * 0.38, cy = obj.y + obj.h * 0.38;
  const r = Math.min(obj.w, obj.h) * 0.34;
  const outer = document.createElementNS(SVG_NS, "circle");
  outer.setAttribute("cx", cx); outer.setAttribute("cy", cy); outer.setAttribute("r", r);
  outer.setAttribute("fill", "none"); outer.setAttribute("stroke", color); outer.setAttribute("stroke-width", sw);
  g.appendChild(outer);
  const inner = document.createElementNS(SVG_NS, "circle");
  inner.setAttribute("cx", cx); inner.setAttribute("cy", cy); inner.setAttribute("r", r * 0.72);
  inner.setAttribute("fill", "none"); inner.setAttribute("stroke", color); inner.setAttribute("stroke-width", sw * 0.85);
  g.appendChild(inner);
  const axleR = Math.max(r * 0.24, 0.65);
  const axle = document.createElementNS(SVG_NS, "circle");
  axle.setAttribute("cx", cx); axle.setAttribute("cy", cy); axle.setAttribute("r", axleR);
  axle.setAttribute("fill", "#b8b8b8");
  axle.setAttribute("stroke", color);
  axle.setAttribute("stroke-width", sw * 0.8);
  g.appendChild(axle);
  if (variant !== "simple") {
    const armAngle = Math.PI / 4;
    const ux = Math.cos(armAngle), uy = Math.sin(armAngle);
    const px = -uy, py = ux;
    const start = { x: cx + ux * axleR * 0.7, y: cy + uy * axleR * 0.7 };
    const end = { x: obj.x + obj.w * 0.82, y: obj.y + obj.h * 0.78 };
    const half = Math.max(r * 0.13, sw * 2);
    const arm = document.createElementNS(SVG_NS, "polygon");
    arm.setAttribute("points",
      `${start.x + px * half},${start.y + py * half} ${end.x + px * half},${end.y + py * half} ${end.x - px * half},${end.y - py * half} ${start.x - px * half},${start.y - py * half}`);
    arm.setAttribute("fill", "white");
    arm.setAttribute("stroke", color);
    arm.setAttribute("stroke-width", sw);
    g.appendChild(arm);
    const boltR = Math.max(r * 0.16, 0.45);
    const bolt = document.createElementNS(SVG_NS, "circle");
    bolt.setAttribute("cx", end.x);
    bolt.setAttribute("cy", end.y);
    bolt.setAttribute("r", boltR);
    bolt.setAttribute("fill", "#b8b8b8");
    bolt.setAttribute("stroke", color);
    bolt.setAttribute("stroke-width", sw * 0.8);
    g.appendChild(bolt);
  }
}

/* 천장·벽 고정 도르래. pulleyGeom과 같은 기하를 쓴다(스냅 앵커와 그림이 어긋나지 않게). */
function drawMountedPulley(g, obj, sw, color, variant) {
  const { cx, cy, r } = pulleyGeom(obj);
  const line = (x1, y1, x2, y2, w) => {
    const l = document.createElementNS(SVG_NS, "line");
    l.setAttribute("x1", x1); l.setAttribute("y1", y1);
    l.setAttribute("x2", x2); l.setAttribute("y2", y2);
    l.setAttribute("stroke", color); l.setAttribute("stroke-width", w || sw);
    l.setAttribute("stroke-linecap", "round");
    g.appendChild(l);
  };
  const circle = (rr, fill, w) => {
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", rr);
    c.setAttribute("fill", fill); c.setAttribute("stroke", color);
    c.setAttribute("stroke-width", w || sw);
    g.appendChild(c);
    return c;
  };
  /* 2026-07-26 교사 지시(사진 참고)로 모양을 바꿨다.
   *   · 바퀴는 <b>도넛</b>이다 — 바깥 원과 안쪽 원 사이(림)가 연회색으로 차 있고,
   *     안쪽(홈 안)은 흰색이다. 예전엔 전체를 흰색으로 칠하고 안쪽 원을 선으로만 그렸다.
   *   · 축은 <b>진회색 원</b>.
   *   · 브래킷은 흰색으로 채운 띠라 바퀴 위를 지나가는 것처럼 보인다. */
  const rimOuter = r, rimInner = r * 0.74;
  const RIM_FILL = "#d9d9d9";     // 림(연회색)
  const AXLE_FILL = "#8f8f8f";    // 축(진회색)

  // 고정판(천장/벽) — 바퀴 뒤에 먼저.
  if (variant === "wall") {
    line(obj.x, cy - r * 1.05, obj.x, cy + r * 1.05, sw * 2.2);
  } else {
    line(cx - r * 1.05, obj.y, cx + r * 1.05, obj.y, sw * 2.2);
  }

  // 도넛 림: 바깥 원을 연회색으로 채우고, 안쪽 원을 흰색으로 덮는다.
  circle(rimOuter, RIM_FILL, sw * 1.1);
  circle(rimInner, "#ffffff", sw * 0.9);

  /* 브래킷 — 고정판에서 내려와 **축을 감싸고 닫히는 U자(요크)**.
   * 예전에는 흰 띠 + 양쪽 세로선 2개뿐이라 축 부근에서 아래가 열려 있었고,
   * 그래서 지지대가 중간에 뚝 끊긴 것처럼 보였다(2026-07-27 교사 지적).
   * 이제 한 path로 "내려가기 → 축 둘레 반원 → 올라오기"를 그린다. 흰 채움은
   * 그대로라 여전히 바퀴 위를 지나가는 것처럼 보인다. */
  const bw = r * 0.30;   // 브래킷 반폭 = 요크 반원의 반지름
  const yoke = document.createElementNS(SVG_NS, "path");
  yoke.setAttribute("d", variant === "wall"
    // 벽 고정: 왼쪽에서 들어와 축 오른쪽으로 돌아 나간다.
    ? `M ${obj.x} ${cy - bw} L ${cx} ${cy - bw} A ${bw} ${bw} 0 0 1 ${cx} ${cy + bw} L ${obj.x} ${cy + bw}`
    // 천장 고정: 위에서 내려와 축 아래로 돌아 올라간다.
    : `M ${cx - bw} ${obj.y} L ${cx - bw} ${cy} A ${bw} ${bw} 0 0 0 ${cx + bw} ${cy} L ${cx + bw} ${obj.y}`);
  yoke.setAttribute("fill", "#ffffff");
  yoke.setAttribute("stroke", color);
  yoke.setAttribute("stroke-width", sw);
  yoke.setAttribute("stroke-linejoin", "round");
  g.appendChild(yoke);

  // 축 — 진회색 원.
  circle(Math.max(r * 0.20, 0.45), AXLE_FILL, sw * 0.9);
}

function drawClamp(g, obj, sw, color) {
  const left = obj.x, top = obj.y, w = obj.w, h = obj.h;
  const dir = obj.flipped ? -1 : 1;
  const standX = left + (obj.flipped ? w * 0.64 : w * 0.64);
  const rodY = top + h * 0.18;
  const rodStart = standX - dir * w * 0.5;
  const rodEnd = standX + dir * w * 0.22;
  const tubeW = Math.max(w * 0.055, sw * 2.8);
  const tubeFill = "#e6e6e6";
  const vRod = document.createElementNS(SVG_NS, "rect");
  vRod.setAttribute("x", standX - tubeW / 2);
  vRod.setAttribute("y", top + h * 0.08);
  vRod.setAttribute("width", tubeW);
  vRod.setAttribute("height", h * 0.82);
  vRod.setAttribute("fill", tubeFill);
  vRod.setAttribute("stroke", color);
  vRod.setAttribute("stroke-width", sw);
  g.appendChild(vRod);
  const hRod = document.createElementNS(SVG_NS, "rect");
  hRod.setAttribute("x", Math.min(rodStart, rodEnd));
  hRod.setAttribute("y", rodY - tubeW / 2);
  hRod.setAttribute("width", Math.abs(rodEnd - rodStart));
  hRod.setAttribute("height", tubeW);
  hRod.setAttribute("fill", tubeFill);
  hRod.setAttribute("stroke", color);
  hRod.setAttribute("stroke-width", sw);
  g.appendChild(hRod);
  const bw = w * 0.17, bh = h * 0.08;
  const block = document.createElementNS(SVG_NS, "rect");
  block.setAttribute("x", standX - bw / 2);
  block.setAttribute("y", rodY - bh / 2);
  block.setAttribute("width", bw);
  block.setAttribute("height", bh);
  block.setAttribute("fill", "#d9d9d9");
  block.setAttribute("stroke", color);
  block.setAttribute("stroke-width", sw);
  g.appendChild(block);
  const knob = document.createElementNS(SVG_NS, "circle");
  knob.setAttribute("cx", standX);
  knob.setAttribute("cy", rodY);
  knob.setAttribute("r", Math.max(bh * 0.3, 0.45));
  knob.setAttribute("fill", "#f2f2f2");
  knob.setAttribute("stroke", color);
  knob.setAttribute("stroke-width", sw);
  g.appendChild(knob);
  oDot(g, standX, rodY, Math.max(bh * 0.14, 0.2), color);
  const baseY = top + h * 0.86;
  const base = document.createElementNS(SVG_NS, "path");
  base.setAttribute("d",
    `M ${left + w * 0.40} ${baseY} L ${left + w * 0.88} ${baseY} L ${left + w * 0.88} ${baseY + h * 0.08} L ${left + w * 0.68} ${baseY + h * 0.08} L ${left + w * 0.66} ${baseY + h * 0.045} L ${left + w * 0.52} ${baseY + h * 0.045} L ${left + w * 0.50} ${baseY + h * 0.08} L ${left + w * 0.40} ${baseY + h * 0.08} Z`);
  base.setAttribute("fill", "#ededed");
  base.setAttribute("stroke", color);
  base.setAttribute("stroke-width", sw);
  g.appendChild(base);
}

function drawScale(g, obj, sw, color) {
  const x = obj.x, y = obj.y, w = obj.w, h = obj.h;
  const top = y + h * 0.08;
  const platform = document.createElementNS(SVG_NS, "rect");
  platform.setAttribute("x", x + w * 0.25);
  platform.setAttribute("y", top);
  platform.setAttribute("width", w * 0.5);
  platform.setAttribute("height", h * 0.12);
  platform.setAttribute("fill", "none");
  platform.setAttribute("stroke", color);
  platform.setAttribute("stroke-width", sw);
  g.appendChild(platform);
  oLine(g, x + w * 0.32, top + h * 0.16, x + w * 0.68, top + h * 0.16, sw, color);
  const body = document.createElementNS(SVG_NS, "rect");
  body.setAttribute("x", x + w * 0.08);
  body.setAttribute("y", y + h * 0.28);
  body.setAttribute("width", w * 0.84);
  body.setAttribute("height", h * 0.55);
  body.setAttribute("rx", Math.min(w, h) * 0.07);
  body.setAttribute("fill", "#e6e6e6");
  body.setAttribute("stroke", color);
  body.setAttribute("stroke-width", sw);
  g.appendChild(body);
  const display = document.createElementNS(SVG_NS, "rect");
  display.setAttribute("x", x + w * 0.13);
  display.setAttribute("y", y + h * 0.43);
  display.setAttribute("width", w * 0.48);
  display.setAttribute("height", h * 0.25);
  display.setAttribute("rx", Math.min(w, h) * 0.035);
  display.setAttribute("fill", "none");
  display.setAttribute("stroke", color);
  display.setAttribute("stroke-width", sw * 0.8);
  g.appendChild(display);
  cText(g, x + w * 0.37, y + h * 0.555, obj.displayText || "0.99 N", Math.min(w * 0.105, h * 0.21), color);
  oDot(g, x + w * 0.72, y + h * 0.55, h * 0.07, color);
  oDot(g, x + w * 0.83, y + h * 0.55, h * 0.07, color);
  const footY = y + h * 0.83;
  const feet = document.createElementNS(SVG_NS, "path");
  feet.setAttribute("d",
    `M ${x + w * 0.18} ${footY} L ${x + w * 0.32} ${footY} L ${x + w * 0.32} ${y + h * 0.88} L ${x + w * 0.16} ${y + h * 0.88} Q ${x + w * 0.14} ${y + h * 0.88} ${x + w * 0.18} ${footY} Z ` +
    `M ${x + w * 0.68} ${footY} L ${x + w * 0.82} ${footY} Q ${x + w * 0.86} ${y + h * 0.88} ${x + w * 0.84} ${y + h * 0.88} L ${x + w * 0.68} ${y + h * 0.88} Z`);
  feet.setAttribute("fill", "#e6e6e6");
  feet.setAttribute("stroke", color);
  feet.setAttribute("stroke-width", sw);
  g.appendChild(feet);
}

export { renderOptics, renderApparatus };

/* ----- 도르래 기하 + 실이 걸리는 접선점 -----
 * drawPulley(apparatus)와 **같은 식**을 쓴다. 예전엔 이 함수가 optics 쪽 기하를 따라가
 * 실제 그림과 어긋났다(그래서 스냅 앵커가 엉뚱한 곳에 붙었다).
 * 접선점(좌/우)은 snap.js가 실 끝점 자석으로 쓴다. */
export function pulleyGeom(obj) {
  const v = obj.variant || "basic";
  if (v === "ceiling") {
    const r = Math.min(obj.w / 2, obj.h * 0.40);
    return { cx: obj.x + obj.w / 2, cy: obj.y + obj.h - r, r };
  }
  if (v === "wall") {
    const r = Math.min(obj.h / 2, obj.w * 0.40);
    return { cx: obj.x + obj.w - r, cy: obj.y + obj.h / 2, r };
  }
  // basic / simple — drawPulley의 기존 식 그대로
  return { cx: obj.x + obj.w * 0.38, cy: obj.y + obj.h * 0.38, r: Math.min(obj.w, obj.h) * 0.34 };
}
export function pulleyAnchors(obj) {
  const { cx, cy, r } = pulleyGeom(obj);
  return [
    { x: cx - r, y: cy, role: "rimLeft" },
    { x: cx + r, y: cy, role: "rimRight" },
    { x: cx, y: cy, role: "axle" },
  ];
}
