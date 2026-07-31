/* ===== RENDER/CORE: shared SVG primitives + path/geometry helpers ===== */
// Bottom layer of the js/render/ module split — imports only app-level modules
// (state, text-rendering), never other js/render/ modules.

import {
  DEFAULT_TEXT_FONT,
  TOOL_LABEL_FONT_FAMILY,
  EQUATION_LETTER_SPACING,
  VARIABLE_LABEL_FONT_STYLE,
  OBJECT_LABEL_TYPES,
  OBJECT_LABEL_QUANTITY_FONT_FAMILY,
  OBJECT_LABEL_TEXT_FONT_FAMILY,
  resolveTextLetterSpacing,
} from "../state.js?v=1.3.0";
import { fillSvgTextWithRomanRuns } from "../text-rendering.js?v=1.3.0";

const SVG_NS = "http://www.w3.org/2000/svg";

/* ----- 라벨 글자색: 항상 검정 고정 -----
 * 라벨은 주인 도형의 선·면 색을 따라가지 않는다(2026-07-31 교사 지적). 회색 띠(마찰 구간)나
 * 옅은 선에 라벨을 달면 글자까지 회색으로 흐려져 시험지 인쇄에서 읽히지 않았다.
 * 독립 text 객체가 이미 쓰던 값과 같은 먹색으로 통일한다. */
const LABEL_INK = "#0d1117";

/* ----- grayscale level (0??55) ??hex; 0 = black, 255 = white (DESIGN 7-2) ----- */
function grayHex(level = 0) {
  const v = Math.max(0, Math.min(255, Math.round(level)));
  const h = v.toString(16).padStart(2, "0");
  return `#${h}${h}${h}`;
}

/* ----- dashes (line/polyline/curve): SVG stroke-dasharray in world units (mm) ----- */
// Solid = dashLength 0 (or gap 0) ??no dasharray attribute set at all (DESIGN: presets).
function applyDash(el, obj) {
  const dl = obj.dashLength ?? 0;
  const dg = obj.dashGap ?? 0;
  if (dl > 0 && dg > 0) el.setAttribute("stroke-dasharray", `${dl} ${dg}`);
}

/* ----- arrowhead: filled triangle pointing in (dirX, dirY), tip at (tipX, tipY) -----
 * opts로 크기·홈 깊이를 조절할 수 있다(기본값은 원래 비율 그대로 — 축 주석·광학·구간화살표
 * 등 opts 없이 부르는 다른 모든 곳은 전혀 바뀌지 않는다). 직선/폴리라인 끝 화살표(shapes.js)만
 * 요구에 따라 더 크고, 아래쪽(홈) 각도가 더 넓은 값을 명시적으로 넘긴다 — 위쪽(끝) 각도는
 * lenMul:widthMul 비율(1.8/4.5)을 그대로 유지해 안 변한다. */
function makeArrowHead(tipX, tipY, dirX, dirY, strokeWidth, color, opts = {}) {
  const lenMul = opts.lenMul ?? 4.5;
  const widthMul = opts.widthMul ?? 1.8;
  const notchRatio = opts.notchRatio ?? 0.3;
  const length     = strokeWidth * lenMul;
  const halfWidth  = strokeWidth * widthMul;
  const notchDepth = length * notchRatio;

  const perpX = -dirY, perpY = dirX;

  const baseX = tipX - dirX * length;
  const baseY = tipY - dirY * length;

  const leftX  = baseX + perpX * halfWidth;
  const leftY  = baseY + perpY * halfWidth;
  const rightX = baseX - perpX * halfWidth;
  const rightY = baseY - perpY * halfWidth;

  const notchX = tipX - dirX * (length - notchDepth);
  const notchY = tipY - dirY * (length - notchDepth);

  const poly = document.createElementNS(SVG_NS, "polygon");
  poly.setAttribute("points", `${tipX},${tipY} ${leftX},${leftY} ${notchX},${notchY} ${rightX},${rightY}`);
  poly.setAttribute("fill", color);
  poly.setAttribute("stroke", "none");
  return poly;
}

/* ----- rotate point (px,py) about center (cx,cy) by deg degrees (SVG clockwise) ----- */
export function rotPt(px, py, cx, cy, deg) {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r), sin = Math.sin(r);
  const dx = px - cx, dy = py - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/* ----- point + travel direction at 50% of a polyline's total path length ----- */
// Used by polyline "center" arrowhead: visually natural midpoint of the whole path.
function polylineMidpoint(pts) {
  if (!pts || pts.length < 2) return null;
  const segLens = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const L = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    segLens.push(L);
    total += L;
  }
  if (total === 0) return null;
  const target = total / 2;
  let acc = 0;
  for (let i = 0; i < segLens.length; i++) {
    if (acc + segLens[i] >= target) {
      const a = pts[i], b = pts[i + 1];
      const L = segLens[i] || 1;
      const t = (target - acc) / L;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx: (b.x - a.x) / L, dy: (b.y - a.y) / L };
    }
    acc += segLens[i];
  }
  return null;
}

/* ----- rounded corners (경사면처리): per-vertex quadratic fillet path ----- */
// Projection only — NEVER mutates points[]. Each interior vertex V becomes a
// quadratic Bezier whose CONTROL point is V itself, so straight slope/flat
// segments stay perfectly straight and only the joints round off (this is a
// per-vertex fillet, NOT a spline through all points). The back-off distance is
// clamped to a QUARTER of each adjacent segment, so each end loses at most 1/4
// and at least half of every segment ALWAYS stays straight (straight runs
// dominate, fillets stay narrow — as in the reference inclined-plane figure).
// Open path: P0 and Pn are left sharp (arrowhead direction unaffected).
function roundedPolylinePath(pts, radius, closed) {
  const P = pts || [];
  const n = P.length;
  if (n < 2) return "";
  const r = Math.max(0, radius || 0);
  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  // point on segment V→T, `off` world units away from V (toward T)
  const backoff = (V, T, off) => {
    const L = dist(V, T);
    if (L === 0) return { x: V.x, y: V.y }; // zero-length segment: no movement
    return { x: V.x + ((T.x - V.x) / L) * off, y: V.y + ((T.y - V.y) / L) * off };
  };

  if (closed) {
    if (n < 3) return ""; // nothing to round below a triangle
    let d = "";
    for (let i = 0; i < n; i++) {
      const V = P[i];
      const A = P[(i - 1 + n) % n];
      const B = P[(i + 1) % n];
      const off = Math.min(r, 0.25 * dist(A, V), 0.25 * dist(V, B));
      const p1 = backoff(V, A, off);
      const p2 = backoff(V, B, off);
      d += i === 0 ? `M ${p1.x} ${p1.y}` : ` L ${p1.x} ${p1.y}`;
      d += ` Q ${V.x} ${V.y} ${p2.x} ${p2.y}`;
    }
    return d + " Z"; // Z draws the straight remainder of the wrap-around edge
  }

  let d = `M ${P[0].x} ${P[0].y}`;
  for (let i = 1; i < n - 1; i++) {
    const V = P[i];
    const A = P[i - 1];
    const B = P[i + 1];
    const off = Math.min(r, 0.25 * dist(A, V), 0.25 * dist(V, B));
    const p1 = backoff(V, A, off);
    const p2 = backoff(V, B, off);
    d += ` L ${p1.x} ${p1.y} Q ${V.x} ${V.y} ${p2.x} ${p2.y}`;
  }
  return d + ` L ${P[n - 1].x} ${P[n - 1].y}`;
}

/* ----- Catmull-Rom spline ??SVG cubic Bezier path string ----- */
// Passes through every anchor point. 2-point degenerate case = straight line.
function catmullRomPath(pts) {
  if (!pts || pts.length < 2) return "";
  if (pts.length === 2) {
    return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  }
  const n = pts.length;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, n - 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

/* ----- Catmull-Rom spline closed loop ??SVG cubic Bezier path string + Z ----- */
function catmullRomClosedPath(pts) {
  if (!pts || pts.length < 3) return "";
  const n = pts.length;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
  }
  d += " Z";
  return d;
}

/* ----- curve outline as a flat list of {x,y} samples (for snapping/hit-tests) -----
 * Mirrors catmullRomPath / catmullRomClosedPath exactly (same control points), so
 * the sampled polyline tracks the rendered curve. Projection-only; never mutates
 * obj.points. Closed curves include the wrap-around span. */
export function curveSamplePoints(obj, samplesPerSeg = 12) {
  const pts = (obj && obj.points) || [];
  const n = pts.length;
  if (n < 2) return pts.map((p) => ({ x: p.x, y: p.y }));
  if (n === 2) return [{ x: pts[0].x, y: pts[0].y }, { x: pts[1].x, y: pts[1].y }];
  const closed = obj.closed === true && n >= 3;
  const evalSeg = (p0, p1, p2, p3, t) => {
    const cp1x = p1.x + (p2.x - p0.x) / 6, cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6, cp2y = p2.y - (p3.y - p1.y) / 6;
    const u = 1 - t;
    const x = u * u * u * p1.x + 3 * u * u * t * cp1x + 3 * u * t * t * cp2x + t * t * t * p2.x;
    const y = u * u * u * p1.y + 3 * u * u * t * cp1y + 3 * u * t * t * cp2y + t * t * t * p2.y;
    return { x, y };
  };
  const out = [{ x: pts[0].x, y: pts[0].y }];
  const segCount = closed ? n : n - 1;
  for (let i = 0; i < segCount; i++) {
    const p0 = closed ? pts[(i - 1 + n) % n] : pts[Math.max(i - 1, 0)];
    const p1 = closed ? pts[i] : pts[i];
    const p2 = closed ? pts[(i + 1) % n] : pts[i + 1];
    const p3 = closed ? pts[(i + 2) % n] : pts[Math.min(i + 2, n - 1)];
    for (let s = 1; s <= samplesPerSeg; s++) out.push(evalSeg(p0, p1, p2, p3, s / samplesPerSeg));
  }
  return out;
}

// A plain world-space stroke segment between two {x,y} points.
function cLine(a, b, sw, color) {
  const l = document.createElementNS(SVG_NS, "line");
  l.setAttribute("x1", a.x); l.setAttribute("y1", a.y);
  l.setAttribute("x2", b.x); l.setAttribute("y2", b.y);
  l.setAttribute("stroke", color); l.setAttribute("stroke-width", sw);
  return l;
}
/* 라벨 세로 중심 보정(em). dominant-baseline:"central"은 글자의 잉크가 아니라 em 박스를
   기준으로 중심을 잡는다. 수식 글꼴(Latin Modern Roman)은 fontBoundingBox.ascent가 1.125em로
   커서 central 기준선이 베이스라인 위 0.4175em에 놓이는데, 실제 잉크 중심은 소문자 0.215em·
   대문자 0.34em이라 글자가 눈에 띄게 아래로 처졌다.

   대신 dominant-baseline을 지정하지 않고(=alphabetic) y를 이 값만큼 내린다. 값은 대문자
   높이의 절반에 해당해, 상자 안 글자를 x-높이가 아니라 cap-height 기준으로 앉히는 조판
   관행과 맞는다. 부수 효과로 dominant-baseline을 무시하는 외부 SVG 임포터(HWP·일러스트
   레이터)에서도 위치가 맞는다.

   글자별 실측이 아니라 단일 상수인 이유: ① 한 그림 안의 같은 글자가 항상 같은 높이에
   놓여야 하고 ② 내보내기 경로에서 getBBox가 0을 반환하기 때문. */
export const LABEL_OPTICAL_CENTER_EM = 0.316;

/* ===== 잉크 중앙 보정 — 사각형 라벨 전용 (2026-07-27 교사 결정) =====
 * 위 상수 하나로는 상자 안 라벨을 중앙에 못 놓는다는 게 실측으로 확인됐다.
 *   · 세로: 대문자는 0.34em, 소문자는 0.215em이 필요해 0.316 하나로는 소문자가 처진다.
 *   · 가로: text-anchor:middle 은 잉크가 아니라 advance(자간 포함)를 중앙에 놓는다.
 *     이탤릭(물리량)은 글자가 기울어 잉크 중심이 오른쪽으로 밀리고, 그 양이 글자마다
 *     다르다(실측: A 0.006em, m 0.072em, M 0.111em, T 0.132em). 상수로는 못 맞춘다.
 * 그래서 사각형 라벨만 글자별로 재서 맞춘다. 측정은 koMeasure와 같은 canvas measureText —
 * getBBox는 내보내기 경로에서 0을 돌려주므로 여기서도 쓸 수 없다.
 * 잴 수 없으면(글꼴 미로드·빈 문자열 등) null을 돌려주고, 호출부는 기존 상수로 되돌아간다.
 *
 *   text            : 한 줄 평문
 *   sizeMm          : 글자 크기(mm) — 반환값도 같은 단위(mm)다
 *   font            : { style, weight, family } — <text>에 실제 적용된 값
 *   letterSpacingEm : 자간(em). 수식 글꼴은 -0.04em이 붙어 중심이 더 밀린다
 * 반환 { dx, dy } : 앵커에 더할 가로 보정, baseline에 더할 세로 보정 */
export function labelInkOffsets(text, sizeMm, font = {}, letterSpacingEm = 0) {
  const s = String(text ?? "");
  if (!s || !(sizeMm > 0)) return null;
  if (!_koCtx) _koCtx = document.createElement("canvas").getContext("2d");
  const ctx = _koCtx;
  const hasLs = "letterSpacing" in ctx;
  try {
    /* 라벨 실물 크기(3.7mm)로 그대로 재면 안 된다 — 브라우저가 잉크 상자를 정수 픽셀로
     * 반올림해, 서로 다른 글자가 같은 값으로 뭉개진다(실측: 세로 보정이 0.405/0.270
     * 두 값으로만 나왔다). 큰 기준 크기로 재고 비례로 줄인다. */
    const REF = 400;
    const k = sizeMm / REF;
    ctx.font = `${font.style || "normal"} ${font.weight || "normal"} ${REF}px ${font.family || "serif"}`;
    if (hasLs) ctx.letterSpacing = `${letterSpacingEm * REF}px`;
    const m = ctx.measureText(s);
    const l = -m.actualBoundingBoxLeft, r = m.actualBoundingBoxRight;
    const t = -m.actualBoundingBoxAscent, b = m.actualBoundingBoxDescent;
    if (![l, r, t, b, m.width].every(Number.isFinite) || m.width <= 0) return null;
    return { dx: -(((l + r) / 2) - m.width / 2) * k, dy: -((t + b) / 2) * k };
  } catch {
    return null;
  } finally {
    if (hasLs) ctx.letterSpacing = "0px";
  }
}

/* ===== 라벨 녹아웃(배경 지우기) — 모든 라벨 공통 =====
 * 왜 필요한가: 흰 테두리(halo)는 글리프 '윤곽'만 따라간다. 그래서 글자와 글자 사이 틈으로
 * 밑에 깔린 선이 그대로 비쳤다("4.5 m" 치수선에서 숫자 사이로 선이 지나가던 문제).
 * 라벨이 차지하는 구간 전체를 흰 사각형으로 한 번 지우고 그 위에 글자를 얹으면,
 * 라벨 시작~끝까지 선이 깨끗하게 끊긴다.
 *
 * 측정은 canvas measureText로 한다 — getBBox는 내보내기 경로에서 0을 돌려주기 때문
 * (이 파일 위쪽 LABEL_OPTICAL_CENTER_EM 주석과 같은 이유).
 */
let _koCtx = null;
function koMeasure(lines, sizeMm, fontCss) {
  if (!_koCtx) _koCtx = document.createElement("canvas").getContext("2d");
  _koCtx.font = fontCss;
  let w = 0;
  for (const ln of lines) w = Math.max(w, _koCtx.measureText(ln).width);
  return w;
}

/* 라벨 뒤에 깔 흰 사각형을 만든다. 없으면(빈 문자열 등) null.
 *   lines        : 줄 배열(측정용 평문)
 *   x, baselineY : 첫 줄 baseline 기준점 — makeUprightLabel과 같은 좌표계
 *   anchor       : "middle" | "start" | "end" (text-anchor와 같은 의미)
 *   lineHeight   : 여러 줄일 때 줄 간격(mm). 블록은 baselineY를 중심으로 상하 대칭.
 */
/* ===== 라벨 가림(할로) — 앱 전체의 단일 출처 =====
 * 가림은 <b>글자 모양대로만</b> 한다. 굵기 = 글자 크기 × HALO_RATIO.
 *   · 배율이라 라벨이 커지면 가림도 같이 커진다.
 *   · 선 굵기에 비례시키면 안 된다 — 굵은 치수선에 작은 라벨을 쓸 때 테두리가 글자를 삼킨다.
 *   · 예전엔 라벨 뒤에 흰 사각형을 통째로 깔았는데, 글자 폭보다 넓게 지워져
 *     <b>옆 글자까지 지워지는</b> 문제가 있었다(2026-07-26 교사 지적, 실측 왼쪽 0.9mm).
 *     사각형이 꼭 필요한 그림(회색 면 위 등)을 위해 makeLabelKnockout은 남겨 두고,
 *     객체의 labelBg 필드가 켜졌을 때만 쓴다.
 */
export const HALO_RATIO = 0.13;

/* 치수선(길이표시) 라벨만 더 넓게 가린다.
 * 치수 라벨은 **선 위에 얹혀** 있어서 기본 가림(0.13)으로는 글자 사이로 선이 그대로
 * 지나간다 — 기출 도판은 라벨 자리에서 선이 끊긴 것처럼 보인다. 그래서 이 라벨만
 * 배율을 올린다. 다른 라벨까지 올리면 옆 글자를 지운다(2026-07-26 교사 지적). */
export const DIM_HALO_RATIO = 0.34;

export function applyGlyphHalo(node, sizeMm, ratio) {
  const r = (Number.isFinite(ratio) && ratio >= 0) ? ratio : HALO_RATIO;
  const w = sizeMm * r;
  const targets = node.tagName === "text" ? [node] : node.querySelectorAll("text, tspan");
  (targets.length !== undefined ? Array.from(targets) : [targets]).forEach((t) => {
    t.setAttribute("paint-order", "stroke");
    t.setAttribute("stroke", "white");
    t.setAttribute("stroke-width", w);
    t.setAttribute("stroke-linejoin", "round");
  });
  if (node.tagName === "text") {
    node.setAttribute("paint-order", "stroke");
    node.setAttribute("stroke", "white");
    node.setAttribute("stroke-width", w);
    node.setAttribute("stroke-linejoin", "round");
  }
}

export function makeLabelKnockout(lines, x, baselineY, sizeMm, opts = {}) {
  const arr = (Array.isArray(lines) ? lines : [String(lines ?? "")]).map((s) => String(s ?? ""));
  if (!arr.length || arr.every((s) => s.trim() === "")) return null;
  const size = Number(sizeMm) > 0 ? Number(sizeMm) : 3.7;
  const family = opts.fontFamily || "serif";
  const style = opts.fontStyle || "normal";
  const weight = opts.fontWeight || "normal";
  const w = koMeasure(arr, size, `${style} ${weight} ${size}px ${family}`);
  if (!(w > 0)) return null;

  const anchor = opts.anchor || "middle";
  const lh = opts.lineHeight || size * 1.2;
  const n = arr.length;
  // 좌우는 아주 조금만(글자 옆 선이 바짝 붙어 보이지 않을 만큼), 위아래는 글자 높이를 덮게.
  const padX = size * 0.14;
  const padTop = size * 0.82;
  const padBot = size * 0.26;
  const firstBase = baselineY - (lh * (n - 1)) / 2;   // makeUprightLabel의 다중 줄 배치와 동일
  const left = anchor === "middle" ? x - w / 2 - padX : anchor === "end" ? x - w - padX : x - padX;
  const top = firstBase - padTop;
  const h = padTop + padBot + lh * (n - 1);

  const r = document.createElementNS(SVG_NS, "rect");
  r.setAttribute("x", left);
  r.setAttribute("y", top);
  r.setAttribute("width", w + padX * 2);
  r.setAttribute("height", h);
  r.setAttribute("fill", "white");
  r.setAttribute("stroke", "none");
  r.setAttribute("pointer-events", "none");
  return r;
}

// A centered glyph (shared by circle-body elements + diode terminal labels + optics label).
function cText(g, x, y, text, size, color, fontFamily = null, fontStyle = null, labelType = null) {
  const t = document.createElementNS(SVG_NS, "text");
  t.setAttribute("x", x);
  t.setAttribute("y", y + size * LABEL_OPTICAL_CENTER_EM);
  t.setAttribute("font-size", size);
  if (fontFamily || fontStyle) {
    applySvgTextFont(t, {
      family: fontFamily || TOOL_LABEL_FONT_FAMILY,
      style: fontStyle || VARIABLE_LABEL_FONT_STYLE,
      letterSpacing: fontFamily ? resolveTextLetterSpacing({ fontFamily }) : EQUATION_LETTER_SPACING,
    });
  } else {
    applyObjectLabelFont(t, labelType);
  }
  t.setAttribute("fill", color);
  t.setAttribute("text-anchor", "middle");
  // dominant-baseline은 일부러 지정하지 않는다 — 위 y 보정이 대신한다.
  fillTextWithRomanRuns(t, text);
  g.appendChild(t);
}

// A stroke segment in the optics box (optional thicker `width`).
function oLine(g, x1, y1, x2, y2, sw, color, width) {
  const l = document.createElementNS(SVG_NS, "line");
  l.setAttribute("x1", x1); l.setAttribute("y1", y1);
  l.setAttribute("x2", x2); l.setAttribute("y2", y2);
  l.setAttribute("stroke", color); l.setAttribute("stroke-width", width || sw);
  g.appendChild(l);
}
// A quadratic-arc stroke (lens/mirror curves).
function oQuad(g, x0, y0, cx, cy, x1, y1, sw, color) {
  const p = document.createElementNS(SVG_NS, "path");
  p.setAttribute("d", `M ${x0} ${y0} Q ${cx} ${cy} ${x1} ${y1}`);
  p.setAttribute("fill", "none");
  p.setAttribute("stroke", color); p.setAttribute("stroke-width", sw);
  g.appendChild(p);
}
// Point on a quadratic Bézier at parameter t (for mirror hatch placement).
function quadPt(x0, y0, cx, cy, x1, y1, t) {
  const u = 1 - t;
  return { x: u * u * x0 + 2 * u * t * cx + t * t * x1, y: u * u * y0 + 2 * u * t * cy + t * t * y1 };
}
// Filled dot (point light / node / pivot center / pulley axle).
function oDot(g, cx, cy, r, color) {
  const c = document.createElementNS(SVG_NS, "circle");
  c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", r);
  c.setAttribute("fill", color);
  g.appendChild(c);
}
// Short 45° hatch ticks along a vertical line x=X, on side `sign` (mirror backing/screen).
function hatchVLine(g, X, top, bottom, sign, sw, color) {
  const n = 6, len = Math.min((bottom - top) * 0.12, 2) + 0.4;
  for (let i = 1; i <= n; i++) {
    const y = top + (bottom - top) * (i / (n + 1));
    oLine(g, X, y, X + sign * len, y - len, sw, color);
  }
}
// Thin vertical dashed line (lens optical-axis / center line). Follows the body
// color/strokeLevel but is drawn thinner than the lens outline.
function oDashV(g, x, y1, y2, sw, color) {
  const l = document.createElementNS(SVG_NS, "line");
  l.setAttribute("x1", x); l.setAttribute("y1", y1);
  l.setAttribute("x2", x); l.setAttribute("y2", y2);
  l.setAttribute("stroke", color);
  l.setAttribute("stroke-width", Math.max(sw * 0.6, 0.1));
  l.setAttribute("stroke-dasharray", "1.2 1");
  l.setAttribute("fill", "none");
  g.appendChild(l);
}

function applySvgTextFont(t, { family, style = "normal", weight = null, letterSpacing = null }) {
  t.setAttribute("font-family", family || DEFAULT_TEXT_FONT);
  t.setAttribute("font-style", style || "normal");
  if (weight) t.setAttribute("font-weight", weight);
  if (letterSpacing != null) t.setAttribute("letter-spacing", letterSpacing);
  else t.removeAttribute("letter-spacing");
}

/* ----- roman-numeral serif runs -----
 * Fill a <text>/<tspan> with `str`, wrapping standalone ASCII I/II/III runs in
 * the same serif/Myeongjo child <tspan> used by labeler text. Non-roman runs stay
 * in the parent's font. Export reuses renderObject, so SVG/PNG follow this path. */
const fillTextWithRomanRuns = fillSvgTextWithRomanRuns;

function resolveLabelType(labelType, fallback = "quantity") {
  return OBJECT_LABEL_TYPES.includes(labelType) ? labelType : fallback;
}

function applyObjectLabelFont(t, labelType, fallback = "quantity") {
  const resolved = resolveLabelType(labelType, fallback);
  if (resolved === "label") {
    applySvgTextFont(t, {
      family: OBJECT_LABEL_TEXT_FONT_FAMILY,
      style: "normal",
      letterSpacing: "normal",
    });
    return;
  }
  // 물리량 라벨 = 텍스트 도구 "수식" 글꼴과 완전히 동일하게 렌더한다: 수식 글꼴 자간
  // (EQUATION_LETTER_SPACING)까지 맞춘다. font-family가 EQUATION_FONT_FAMILY이므로
  // fillTextWithRomanRuns의 숫자 정자화(wantsUprightDigits)도 자동으로 적용된다.
  applySvgTextFont(t, {
    family: OBJECT_LABEL_QUANTITY_FONT_FAMILY,
    style: VARIABLE_LABEL_FONT_STYLE,
    letterSpacing: EQUATION_LETTER_SPACING,
  });
}

export {
  SVG_NS,
  LABEL_INK,
  grayHex,
  applyDash,
  makeArrowHead,
  polylineMidpoint,
  roundedPolylinePath,
  catmullRomPath,
  catmullRomClosedPath,
  quadPt,
  cLine,
  cText,
  oLine,
  oQuad,
  oDot,
  hatchVLine,
  oDashV,
  applySvgTextFont,
  fillTextWithRomanRuns,
  applyObjectLabelFont,
};
