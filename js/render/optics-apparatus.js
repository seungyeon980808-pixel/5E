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
import { makeLabelEl } from "./labels.js?v=1.3.0";
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
    const el = makeLabelEl(obj.label, obj.x + obj.w / 2, obj.y + obj.h + size * 0.8, size,
      { labelType: obj.labelType });
    if (el) g.appendChild(el);
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
  else if (kind === "transistor") drawTransistor(g, obj, sw, color);
  else if (kind === "device_box") drawDeviceBox(g, obj, sw, color);
  else if (kind === "speaker") drawSpeaker(g, obj, sw, color);
  else if (kind === "phototube") drawPhototube(g, obj, sw, color);
  else if (kind === "slit") drawSlit(g, obj, sw, color);
  else if (kind === "thermometer") drawThermometer(g, obj, sw, color);
  else if (kind === "bar_magnet") drawBarMagnet(g, obj, sw, color);
  else if (kind === "fringe_pattern") drawFringePattern(g, obj, sw, color);

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

/* ===== 시험지 장치 기호 7종 (2026-07-31, 도판 483장 집계 기반) =====
 * 삽화(사람·차량)가 아니라 **선 그림 기호**다 — 오리지 않고 그린다.
 * 전부 상자(x,y,w,h) 투영이라 rect 와 같은 조작(이동·리사이즈·회전)을 공짜로 얻는다. */

/* 장치 상자 — 기출에서 가장 흔한 도구(전원 장치·계측기·인터페이스·광원·저항 상자,
 * 합쳐 60회). 전부 "라벨 붙은 사각 상자 + 단자"라서 부품 하나로 덮는다.
 *   label      상자 안 글자("전원 장치", "저항 상자" …). 없으면 빈 상자
 *   terminals  단자 개수(기본 2, 0이면 없음) / termSide 단자가 붙는 변(기본 "bottom")
 *   plusMinus  true 면 첫·끝 단자 옆에 +− 표기(전원 장치)
 *   emit       "left"|"right" — 빛이 나가는 주둥이(광원 상자)
 * 상자 안은 흰색으로 뒤를 가린다(장치가 도선 위에 얹히는 그림이 많다). */
function drawDeviceBox(g, obj, sw, color) {
  const { x, y, w, h } = obj;
  const box = document.createElementNS(SVG_NS, "rect");
  box.setAttribute("x", x); box.setAttribute("y", y);
  box.setAttribute("width", w); box.setAttribute("height", h);
  box.setAttribute("fill", "#fff");
  box.setAttribute("stroke", color); box.setAttribute("stroke-width", sw);
  g.appendChild(box);

  if (obj.emit === "left" || obj.emit === "right") {           // 광원 주둥이
    const sgn = obj.emit === "right" ? 1 : -1;
    const bx = obj.emit === "right" ? x + w : x;
    const nh = Math.min(h * 0.34, 6), nw = Math.max(w * 0.1, 2.2);
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", `M ${bx} ${y + h / 2 - nh / 2} L ${bx + sgn * nw} ${y + h / 2 - nh * 0.3} ` +
      `L ${bx + sgn * nw} ${y + h / 2 + nh * 0.3} L ${bx} ${y + h / 2 + nh / 2} Z`);
    p.setAttribute("fill", "#fff"); p.setAttribute("stroke", color); p.setAttribute("stroke-width", sw);
    g.appendChild(p);
  }

  const n = Number.isFinite(obj.terminals) ? obj.terminals : 2;
  if (n > 0) {
    const side = obj.termSide || "bottom";
    const r = Math.max(Math.min(w, h) * 0.05, sw * 1.6, 0.7);
    const horiz = side === "bottom" || side === "top";
    const L = horiz ? w : h;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : 0.3 + (0.4 * i) / (n - 1);      // 가운데 몰아 배치(기출 관행)
      const tx = horiz ? x + L * t : (side === "left" ? x : x + w);
      const ty = horiz ? (side === "bottom" ? y + h : y) : y + L * t;
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("cx", tx); c.setAttribute("cy", ty); c.setAttribute("r", r);
      c.setAttribute("fill", "#fff"); c.setAttribute("stroke", color); c.setAttribute("stroke-width", sw);
      g.appendChild(c);
      if (obj.plusMinus && n >= 2 && (i === 0 || i === n - 1)) {
        const s = Math.max(Math.min(w, h) * 0.16, 2.2);
        const off = side === "bottom" ? -s * 0.75 : s * 0.9;    // 단자 위(상자 안쪽)에 표기
        cText(g, tx, ty + (horiz ? off : 0), i === 0 ? "+" : "−", s, color);
      }
    }
  }
  if ((obj.label ?? "") !== "") {
    const size = obj.labelSize || Math.min(h * 0.34, w / Math.max(String(obj.label).length, 1) * 0.9, 4.2);
    // 장치 이름("전원 장치")은 정자가 기본이지만, R_1 처럼 첨자를 적으면 수식으로 간다.
    const el = makeLabelEl(obj.label, x + w / 2, y + h / 2, size,
      { labelType: obj.labelType ?? (/[_^]/.test(String(obj.label)) ? "quantity" : "label") });
    if (el) g.appendChild(el);
  }
}

/* 스피커(음원) — 몸통 상자 + 나팔 사다리꼴 + 소리 호 2개. 기출 12회.
 *   facing "right"(기본)|"left" · showWaves 소리 호(기본 true) */
function drawSpeaker(g, obj, sw, color) {
  const { x, y, w, h } = obj;
  const sgn = obj.facing === "left" ? -1 : 1;
  const x0 = obj.facing === "left" ? x + w : x;              // 몸통 쪽 기준
  const bodyW = w * 0.34, coneW = w * 0.3;
  const body = document.createElementNS(SVG_NS, "rect");
  body.setAttribute("x", Math.min(x0, x0 + sgn * bodyW)); body.setAttribute("y", y + h * 0.28);
  body.setAttribute("width", bodyW); body.setAttribute("height", h * 0.44);
  body.setAttribute("fill", "#fff"); body.setAttribute("stroke", color); body.setAttribute("stroke-width", sw);
  g.appendChild(body);
  const bx = x0 + sgn * bodyW;
  const cone = document.createElementNS(SVG_NS, "path");
  cone.setAttribute("d", `M ${bx} ${y + h * 0.34} L ${bx + sgn * coneW} ${y + h * 0.06} ` +
    `L ${bx + sgn * coneW} ${y + h * 0.94} L ${bx} ${y + h * 0.66} Z`);
  cone.setAttribute("fill", "#fff"); cone.setAttribute("stroke", color); cone.setAttribute("stroke-width", sw);
  g.appendChild(cone);
  if (obj.showWaves !== false) {
    const cx0 = bx + sgn * coneW + sgn * w * 0.06;
    for (const k of [0.55, 1]) {
      const r = w * 0.16 * k + w * 0.04;
      const a = document.createElementNS(SVG_NS, "path");
      a.setAttribute("d", `M ${cx0 + sgn * r * 0.35} ${y + h / 2 - r} ` +
        `A ${r} ${r} 0 0 ${sgn > 0 ? 1 : 0} ${cx0 + sgn * r * 0.35} ${y + h / 2 + r}`);
      a.setAttribute("fill", "none"); a.setAttribute("stroke", color); a.setAttribute("stroke-width", sw);
      g.appendChild(a);
    }
  }
}

/* 광전관 — 유리관(원) 안 왼쪽에 금속판(음극) 호, 오른쪽에 집전 막대, 아래로 리드 2개.
 * 기출 8회(광전효과 단원 단골). facing "right" = 빛이 오른쪽에서 들어옴(금속판이 왼쪽). */
function drawPhototube(g, obj, sw, color) {
  const { x, y, w, h } = obj;
  const cx = x + w / 2, cy = y + h * 0.44;
  const R = Math.min(w, h * 0.88) / 2 * 0.92;
  const sgn = obj.facing === "left" ? -1 : 1;                // 금속판이 반대쪽
  const c = document.createElementNS(SVG_NS, "circle");
  c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", R);
  c.setAttribute("fill", "#fff"); c.setAttribute("stroke", color); c.setAttribute("stroke-width", sw);
  g.appendChild(c);
  const plate = document.createElementNS(SVG_NS, "path");    // 금속판: 원 안쪽을 따라가는 호(굵게)
  const pr = R * 0.62;
  plate.setAttribute("d", `M ${cx - sgn * pr * Math.cos(Math.PI / 4)} ${cy - pr * Math.sin(Math.PI / 4)} ` +
    `A ${pr} ${pr} 0 0 ${sgn > 0 ? 0 : 1} ${cx - sgn * pr * Math.cos(Math.PI / 4)} ${cy + pr * Math.sin(Math.PI / 4)}`);
  plate.setAttribute("fill", "none"); plate.setAttribute("stroke", color);
  plate.setAttribute("stroke-width", sw * 2.4);
  g.appendChild(plate);
  oLine(g, cx + sgn * R * 0.45, cy, cx + sgn * R * 0.2, cy, sw, color);   // 집전 막대
  oDot(g, cx + sgn * R * 0.45, cy, Math.max(sw * 1.6, R * 0.06), color);
  // 리드: 금속판·집전극 → 관 아래 밖으로
  oLine(g, cx - sgn * pr, cy, cx - sgn * pr, y + h, sw, color);
  oLine(g, cx + sgn * R * 0.45, cy, cx + sgn * R * 0.45, y + h, sw, color);
}

/* 슬릿 판 — 세로 벽에 틈이 뚫린 판. 기출 9회(단일·이중 슬릿 간섭).
 *
 * 세 값을 사용자가 직접 정한다(2026-07-31 교사 지시):
 *   slits    틈 개수 (1 이상). 1이면 단일, 2면 이중 슬릿
 *   slitLen  틈 하나의 길이 mm (기본 1.6)
 *   slitGap  이웃한 틈의 **중심 간 거리** mm (기본 4). 개수가 1이면 쓰이지 않는다
 * 틈 무리는 판의 세로 가운데에 모인다. 판 밖으로 넘치면 판 높이에 맞춰 줄인다 —
 * 사용자가 개수를 올리다가 그림이 깨지지 않게.
 *
 * 틈으로 뒤가 보여야 하므로 판은 '채운 사각 조각'들로 그린다(뚫린 구멍이 아니라
 * 남은 살을 그리는 방식). 그래서 뒤의 광선·격자가 틈으로 그대로 비친다. */
function slitGeom(obj) {
  const h = obj.h;
  const n = Math.max(1, Math.round(obj.slits || 1));
  let len = Math.max(obj.slitLen ?? 1.6, 0.2);
  let gap = Math.max(obj.slitGap ?? 4, len + 0.2);        // 틈끼리 겹치지 않게
  const span = n === 1 ? len : gap * (n - 1) + len;        // 무리 전체 높이
  if (span > h * 0.94 && span > 0) {                       // 판을 넘치면 비율대로 축소
    const k = (h * 0.94) / span;
    len *= k; gap *= k;
  }
  return { n, len, gap };
}

function drawSlit(g, obj, sw, color) {
  const { x, y, w, h } = obj;
  const { n, len, gap } = slitGeom(obj);
  const cy = y + h / 2;
  const first = cy - (n === 1 ? 0 : (gap * (n - 1)) / 2);
  const holes = [];
  for (let i = 0; i < n; i++) {
    const c = first + gap * i;
    holes.push([c - len / 2, c + len / 2]);
  }
  let cur = y;
  const segs = [];
  for (const [a, b] of holes) { segs.push([cur, a]); cur = b; }
  segs.push([cur, y + h]);
  for (const [a, b] of segs) {
    if (b - a < 0.03) continue;
    const r = document.createElementNS(SVG_NS, "rect");
    r.setAttribute("x", x); r.setAttribute("y", a);
    r.setAttribute("width", w); r.setAttribute("height", b - a);
    r.setAttribute("fill", color);
    g.appendChild(r);
  }
}

/* 온도계 — 구(수은 구) + 관 + 눈금. 기출 6회. level 0~1 = 수은 기둥 높이(기본 0.55). */
function drawThermometer(g, obj, sw, color) {
  const { x, y, w, h } = obj;
  const cx = x + w / 2;
  const bulbR = Math.min(w / 2, h * 0.12);
  const bulbY = y + h - bulbR;
  const stemW = bulbR * 0.9;
  const stem = document.createElementNS(SVG_NS, "rect");
  stem.setAttribute("x", cx - stemW / 2); stem.setAttribute("y", y);
  stem.setAttribute("width", stemW); stem.setAttribute("height", h - bulbR * 1.6);
  stem.setAttribute("rx", stemW / 2);
  stem.setAttribute("fill", "#fff"); stem.setAttribute("stroke", color); stem.setAttribute("stroke-width", sw);
  g.appendChild(stem);
  const b = document.createElementNS(SVG_NS, "circle");
  b.setAttribute("cx", cx); b.setAttribute("cy", bulbY); b.setAttribute("r", bulbR);
  b.setAttribute("fill", color);
  g.appendChild(b);
  const lv = Math.min(Math.max(obj.level ?? 0.55, 0), 1);
  const topY = y + (h - bulbR * 2) * (1 - lv);
  oLine(g, cx, bulbY - bulbR * 0.5, cx, topY, sw * 2, color);            // 수은 기둥
  for (let i = 1; i <= 4; i++) {                                          // 눈금
    const ty = y + (h - bulbR * 2.4) * (i / 5);
    oLine(g, cx + stemW / 2, ty, cx + stemW / 2 + w * 0.18, ty, sw, color);
  }
}

/* 막대자석 — N/S 반반. northSide "left"(기본)|"right". 기출 자기 단원 단골. */
function drawBarMagnet(g, obj, sw, color) {
  const { x, y, w, h } = obj;
  const horiz = w >= h;
  const box = document.createElementNS(SVG_NS, "rect");
  box.setAttribute("x", x); box.setAttribute("y", y);
  box.setAttribute("width", w); box.setAttribute("height", h);
  box.setAttribute("fill", "#fff"); box.setAttribute("stroke", color); box.setAttribute("stroke-width", sw);
  g.appendChild(box);
  if (horiz) oLine(g, x + w / 2, y, x + w / 2, y + h, sw, color);
  else oLine(g, x, y + h / 2, x + w, y + h / 2, sw, color);
  const size = Math.min(horiz ? h * 0.55 : w * 0.55, (horiz ? w : h) * 0.2);
  const first = obj.northSide === "right" ? "S" : "N";
  const second = first === "N" ? "S" : "N";
  if (horiz) {
    cText(g, x + w * 0.25, y + h / 2, first, size, color);
    cText(g, x + w * 0.75, y + h / 2, second, size, color);
  } else {
    cText(g, x + w / 2, y + h * 0.25, first, size, color);
    cText(g, x + w / 2, y + h * 0.75, second, size, color);
  }
}

/* 간섭무늬 — 스크린 띠 안에 밝/어둡 줄무늬. 기출 4회(이중슬릿 결과 표시).
 * stripes 어두운 줄 수(기본 5) — 가운데가 밝은 무늬가 되도록 홀수 권장. */
function drawFringePattern(g, obj, sw, color) {
  const { x, y, w, h } = obj;
  const box = document.createElementNS(SVG_NS, "rect");
  box.setAttribute("x", x); box.setAttribute("y", y);
  box.setAttribute("width", w); box.setAttribute("height", h);
  box.setAttribute("fill", "#fff"); box.setAttribute("stroke", color); box.setAttribute("stroke-width", sw);
  g.appendChild(box);
  const n = Math.max(obj.stripes || 5, 1);
  const period = h / (n + 1);
  const dark = Math.min(period * 0.55, h * 0.12);
  for (let i = 1; i <= n; i++) {
    const cy = y + period * i;
    const r = document.createElementNS(SVG_NS, "rect");
    r.setAttribute("x", x + sw); r.setAttribute("y", cy - dark / 2);
    r.setAttribute("width", w - sw * 2); r.setAttribute("height", dark);
    r.setAttribute("fill", color);
    g.appendChild(r);
  }
}

/* 트랜지스터 — 기출 483장 중 11장(2위 부품). 회로 소자(circuit)가 아니라 실험 기구로
 * 둔 이유: circuit 은 p1·p2 **두 단자**짜리 모델인데 트랜지스터는 단자가 셋이다.
 * 상자(x,y,w,h)로 놓고 세 단자를 상자 변에 내보내면 도선을 아무 방향으로나 붙일 수 있다.
 *
 *   왼쪽 변 가운데 = 베이스(B) · 오른쪽 위 = 컬렉터(C) · 오른쪽 아래 = 이미터(E)
 *   variant: "npn"(기본, 화살촉이 이미터 쪽으로 나감) | "pnp"(베이스 쪽으로 들어옴)
 *   circled: true 면 몸통을 원으로 감싼다(교과서 표기)
 *   showTerminals: false 면 단자 동그라미를 뺀다(기본은 켬 — 기출이 단자마다 ○를 찍는다)
 */
function drawTransistor(g, obj, sw, color) {
  const { x, y, w, h } = obj;
  const cy = y + h / 2;
  const barX = x + w * 0.38;                       // 베이스 막대
  const barTop = y + h * 0.2, barBot = y + h * 0.8;
  const legX = x + w * 0.84;                       // 컬렉터·이미터가 꺾여 나가는 세로선
  const cJoin = { x: barX, y: y + h * 0.32 };      // 막대에서 갈라지는 점
  const eJoin = { x: barX, y: y + h * 0.68 };
  const cBend = { x: legX, y: y + h * 0.16 };
  const eBend = { x: legX, y: y + h * 0.84 };
  const r = Math.max(Math.min(w, h) * 0.055, sw * 1.1);

  if (obj.circled) {
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", x + w * 0.55); c.setAttribute("cy", cy);
    c.setAttribute("r", Math.min(w, h) * 0.42);
    c.setAttribute("fill", "none"); c.setAttribute("stroke", color); c.setAttribute("stroke-width", sw);
    g.appendChild(c);
  }
  oLine(g, barX, barTop, barX, barBot, sw * 1.6, color);      // 베이스 막대(굵게)
  oLine(g, x, cy, barX, cy, sw, color);                        // 베이스 리드
  oLine(g, cJoin.x, cJoin.y, cBend.x, cBend.y, sw, color);     // 컬렉터 사선
  oLine(g, cBend.x, cBend.y, legX, y, sw, color);              // 컬렉터 단자까지
  oLine(g, eJoin.x, eJoin.y, eBend.x, eBend.y, sw, color);     // 이미터 사선
  oLine(g, eBend.x, eBend.y, legX, y + h, sw, color);          // 이미터 단자까지

  // 화살촉: 이미터 사선의 가운데. npn 은 바깥(이미터 쪽), pnp 는 안쪽(막대 쪽).
  const out = (obj.variant || "npn") !== "pnp";
  const dx = eBend.x - eJoin.x, dy = eBend.y - eJoin.y;
  const L = Math.hypot(dx, dy) || 1;
  const ux = (dx / L) * (out ? 1 : -1), uy = (dy / L) * (out ? 1 : -1);
  const tip = out
    ? { x: eJoin.x + dx * 0.62, y: eJoin.y + dy * 0.62 }
    : { x: eJoin.x + dx * 0.38, y: eJoin.y + dy * 0.38 };
  const len = Math.max(Math.min(w, h) * 0.18, sw * 3.2), half = len * 0.42;
  const head = document.createElementNS(SVG_NS, "polygon");
  head.setAttribute("points",
    `${tip.x},${tip.y} ${tip.x - ux * len + -uy * half},${tip.y - uy * len + ux * half} ` +
    `${tip.x - ux * len - -uy * half},${tip.y - uy * len - ux * half}`);
  head.setAttribute("fill", color);
  g.appendChild(head);

  if (obj.showTerminals !== false) {                 // 단자 ○(속 빈 원) — 기출 표기
    for (const [tx, ty] of [[x, cy], [legX, y], [legX, y + h]]) {
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("cx", tx); c.setAttribute("cy", ty); c.setAttribute("r", r);
      c.setAttribute("fill", "#fff");
      c.setAttribute("stroke", color); c.setAttribute("stroke-width", sw);
      g.appendChild(c);
    }
  }
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
