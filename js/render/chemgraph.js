/* ===== RENDER/CHEMGRAPH: 화학 그래프 프리셋(크기박스 계열) =====
 *
 * 화학에서 되풀이해 나오는 그래프 3종을 손으로 좌표를 찍지 않고 값만 넣어
 * 만들 수 있게 한 프리셋이다.
 *   energy     반응 에너지 도표 (활성화 에너지 Ea · 반응 엔탈피 ΔH · 촉매 곡선)
 *   titration  중화 적정 곡선 (강산–강염기 / 약산–강염기 · 당량점)
 *   phase      상평형 그림 (승화·융해·기화 곡선 + 삼중점·임계점)
 *
 * 시안은 docs/chem-parts-proposal.html 의 `eneSVG()` · `titSVG()` · `phaSVG()` 이고,
 * 그 코드가 정본이다. 시안 좌표계는 셋 다 **52 × 40** 고정이라 여기서는 그 값을
 * obj.w / obj.h 로 환산해서 좌표를 **직접 계산**한다
 * (legend.js·particlebox.js 와 같은 방식 — <g transform> 스케일을 쓰지 않으므로
 *  선 굵기와 글자가 상자 크기에 딸려 찌그러지지 않는다).
 *
 * ── 환산 규칙 ────────────────────────────────────────
 *   sx = w / 52,  sy = h / 40   좌표는 축마다 따로 늘린다(그래프는 그래야 자연스럽다)
 *   k  = min(sx, sy)            글자 크기·점 반지름·점선 간격은 이 한 값만 쓴다
 *   선 굵기 = obj.strokeWidth * (시안굵기 / 0.35)   ← 시안 기본 굵기가 0.35
 *
 * 글자는 전부 renderGraphLabel 로 그린다(아래첨자·그리스 문자 처리가 여기 있다).
 *
 * 스키마 — docs/CHEM_PARTS_SPEC.md §8
 *   x, y, w, h        크기박스(이동·리사이즈는 앱이 처리). 기본 44 × 34 mm
 *   kind              "energy" | "titration" | "phase"
 *   -- energy --
 *   reactant 0.42 · product 0.2 · peak 0.85   0~1 높이
 *   showCatalyst false · showMarks true
 *   -- titration --
 *   acidType "sw"(강산–강염기) | "ww"(약산–강염기)
 *   eqVolume 0.5 · eqPH 7 · showEqPoint true
 *   -- phase --
 *   isWater true · triplePt {x,y} · criticalPt {x,y} · showRegionNames true
 */

import { SVG_NS, grayHex, applyDash, makeArrowHead } from "./core.js?v=1.3.0";
import { renderGraphLabel } from "./graph-label.js?v=1.3.0";

export const CHEMGRAPH_KINDS = ["energy", "titration", "phase"];
export const CHEMGRAPH_ACID_TYPES = ["sw", "ww"];

const VBW = 52;   // 시안 좌표계 가로
const VBH = 40;   // 시안 좌표계 세로
const BASE_SW = 0.35;   // 시안의 기본 선 굵기

/* 축 이름 — kind 별 고정 문구(명세 §8) */
const AXIS_NAMES = {
  energy: { x: "반응 경로", y: "에너지" },
  titration: { x: "넣어 준 염기의 부피", y: "pH" },
  phase: { x: "온도", y: "압력" },
};

/* 상평형 영역 이름 */
const PHASE_NAMES = { solid: "고체", liquid: "액체", gas: "기체", tp: "삼중점", cp: "임계점" };

const DEF = {
  reactant: 0.42, product: 0.2, peak: 0.85,
  eqVolume: 0.5, eqPH: 7,
  triplePt: { x: 0.34, y: 0.3 },
  criticalPt: { x: 0.82, y: 0.82 },
};

function num(v, dflt, min = -Infinity, max = Infinity) {
  return Number.isFinite(v) && v >= min && v <= max ? v : dflt;
}

function pick(v, list, dflt) {
  return list.includes(v) ? v : dflt;
}

function pt(v, dflt) {
  const o = v && typeof v === "object" ? v : {};
  return { x: num(o.x, dflt.x, 0, 1), y: num(o.y, dflt.y, 0, 1) };
}

/* ----- 배치 계산 -----
 * 렌더러와 바깥에서 같은 값을 쓰도록 환산을 한 곳에서만 정한다.
 * 반환 { x, y, w, h, sx, sy, k, kind, X(), Y() }
 *   X(u) · Y(v)  시안 좌표(0~52 · 0~40) → mm
 */
export function chemGraphLayout(obj) {
  const x = num(obj.x, 0);
  const y = num(obj.y, 0);
  const w = num(obj.w, 44, 0.1);
  const h = num(obj.h, 34, 0.1);
  const sx = w / VBW, sy = h / VBH;
  const k = Math.min(sx, sy);
  const kind = pick(obj.kind, CHEMGRAPH_KINDS, "energy");
  return {
    x, y, w, h, sx, sy, k, kind,
    X: (u) => x + u * sx,
    Y: (v) => y + v * sy,
  };
}

export function chemGraphBBox(obj) {
  const L = chemGraphLayout(obj);
  return { x: L.x, y: L.y, w: L.w, h: L.h };
}

/* ----- 그리기 도우미 (인자는 전부 시안 좌표) ----- */

function mkDraw(g, L, color, sw) {
  const { X, Y, k } = L;
  const width = (cw) => sw * (cw / BASE_SW);

  /* 선 하나. dash 는 시안 단위 배열([1.1, 0.8] 등). */
  function line(x1, y1, x2, y2, cw = 0.3, dash) {
    const el = document.createElementNS(SVG_NS, "line");
    el.setAttribute("x1", X(x1)); el.setAttribute("y1", Y(y1));
    el.setAttribute("x2", X(x2)); el.setAttribute("y2", Y(y2));
    el.setAttribute("stroke", color);
    el.setAttribute("stroke-width", width(cw));
    el.setAttribute("stroke-linecap", "round");
    if (dash) applyDash(el, { dashPattern: dash.map((v) => v * k) });
    g.appendChild(el);
    return el;
  }

  /* 경로. d 는 **이미 mm 로 환산된** 좌표 문자열이어야 한다. */
  function path(d, cw = 0.35, dash) {
    const el = document.createElementNS(SVG_NS, "path");
    el.setAttribute("d", d);
    el.setAttribute("fill", "none");
    el.setAttribute("stroke", color);
    el.setAttribute("stroke-width", width(cw));
    el.setAttribute("stroke-linecap", "round");
    el.setAttribute("stroke-linejoin", "round");
    if (dash) applyDash(el, { dashPattern: dash.map((v) => v * k) });
    g.appendChild(el);
    return el;
  }

  /* 화살표 = 짧게 자른 선 + 공용 화살촉(core.makeArrowHead).
   * 방향은 반드시 mm 공간에서 잰다(가로·세로 배율이 다르기 때문). */
  function arrow(x1, y1, x2, y2, cw = 0.32) {
    const ax = X(x1), ay = Y(y1), bx = X(x2), by = Y(y2);
    const d = Math.hypot(bx - ax, by - ay) || 1;
    const ux = (bx - ax) / d, uy = (by - ay) / d;
    const mw = width(cw);
    const len = mw * 4.5;   // makeArrowHead 의 기본 lenMul
    const el = document.createElementNS(SVG_NS, "line");
    el.setAttribute("x1", ax); el.setAttribute("y1", ay);
    el.setAttribute("x2", bx - ux * len); el.setAttribute("y2", by - uy * len);
    el.setAttribute("stroke", color);
    el.setAttribute("stroke-width", mw);
    el.setAttribute("stroke-linecap", "round");
    g.appendChild(el);
    g.appendChild(makeArrowHead(bx, by, ux, uy, mw, color));
  }

  function dot(cx, cy, r) {
    const el = document.createElementNS(SVG_NS, "circle");
    el.setAttribute("cx", X(cx)); el.setAttribute("cy", Y(cy));
    el.setAttribute("r", Math.max(0.05, r * k));
    el.setAttribute("fill", color);
    g.appendChild(el);
  }

  /* 글자 — 좌표는 시안, 크기는 k 배(스케일에 찌그러지지 않게 절대 크기로 계산). */
  function label(cx, cy, text, size = 2.5, anchor = "middle") {
    const node = renderGraphLabel(text, {
      x: X(cx), y: Y(cy), size: Math.max(0.5, size * k),
      color, anchor, vAlign: "baseline", halo: false,
    });
    if (node) g.appendChild(node);
  }

  /* 두 축(화살촉 달린) — 셋 다 같은 모양이라 여기서 한 번만 만든다. */
  function axes(x0, y0, W, H, kind) {
    arrow(x0, y0, x0 + W, y0, 0.25);
    arrow(x0, y0, x0, y0 - H - 1, 0.25);
    const nm = AXIS_NAMES[kind];
    label(x0 + W / 2, y0 + 5, nm.x, 2.5, "middle");
    if (kind === "titration") label(x0 - 2.6, y0 - H - 2, nm.y, 2.7, "start");
    else label(x0 - 3, y0 - H - 2, nm.y, 2.5, "start");
  }

  return { line, path, arrow, dot, label, axes, X, Y };
}

/* ══════════ energy — 반응 에너지 도표 (시안 eneSVG) ══════════ */
function drawEnergy(obj, D) {
  const x0 = 8, y0 = 33, W = 40, H = 27;
  const V = (v) => y0 - H * v;                 // 0~1 높이 → 시안 y
  const rea = num(obj.reactant, DEF.reactant, 0, 1);
  const pro = num(obj.product, DEF.product, 0, 1);
  const peak = num(obj.peak, DEF.peak, 0, 1);

  D.axes(x0, y0, W, H, "energy");

  const xa = x0 + 4, xb = x0 + 13, xc = x0 + 22, xd = x0 + 31, xe = x0 + 38;
  // 반응물 평탄 → 봉우리 → 생성물 평탄. 시안 curve() 와 같은 제어점.
  const curve = (pk) =>
    `M ${D.X(xa)} ${D.Y(V(rea))} L ${D.X(xb)} ${D.Y(V(rea))}` +
    ` C ${D.X(xb + 4)} ${D.Y(V(rea))} ${D.X(xc - 4)} ${D.Y(V(pk))} ${D.X(xc)} ${D.Y(V(pk))}` +
    ` C ${D.X(xc + 4)} ${D.Y(V(pk))} ${D.X(xd - 4)} ${D.Y(V(pro))} ${D.X(xd)} ${D.Y(V(pro))}` +
    ` L ${D.X(xe)} ${D.Y(V(pro))}`;

  // 촉매 곡선은 봉우리를 55% 만 올린 점선(먼저 그려 본 곡선 뒤로 보낸다).
  if (obj.showCatalyst === true) D.path(curve(rea + (peak - rea) * 0.55), 0.35, [1.4, 1]);
  D.path(curve(peak), 0.5);

  if (obj.showMarks !== false) {
    D.line(xa, V(rea), xc, V(rea), 0.2, [1.1, 0.8]);
    D.line(xa, V(pro), xe, V(pro), 0.2, [1.1, 0.8]);
    // Ea 는 양방향(위·아래 화살촉 둘 다)
    D.arrow(xb + 1.5, V(rea), xb + 1.5, V(peak), 0.26);
    D.arrow(xb + 1.5, V(peak), xb + 1.5, V(rea), 0.26);
    D.label(xb - 1.2, (V(rea) + V(peak)) / 2, "Ea", 2.5, "end");
    D.arrow(xd + 3, V(rea), xd + 3, V(pro), 0.26);
    D.label(xd + 4.6, (V(rea) + V(pro)) / 2, "ΔH", 2.5, "start");
  }
}

/* ══════════ titration — 중화 적정 곡선 (시안 titSVG) ══════════ */
function drawTitration(obj, D) {
  const x0 = 9, y0 = 33, W = 39, H = 27;
  const PX = (v) => x0 + W * v;                // 0~1 부피 → 시안 x
  const PY = (p) => y0 - H * (p / 14);         // pH 0~14 → 시안 y
  const type = pick(obj.acidType, CHEMGRAPH_ACID_TYPES, "sw");
  const eqV = num(obj.eqVolume, DEF.eqVolume, 0, 1);
  const eqPH = num(obj.eqPH, DEF.eqPH, 0, 14);

  D.axes(x0, y0, W, H, "titration");

  // 시작 pH: 강산 1, 약산 3. 끝 pH 13. 당량점에서 급격히 뛰는 시그모이드.
  const p0 = type === "sw" ? 1 : 3, p1 = 13;
  let d = "";
  for (let i = 0; i <= 90; i++) {
    const v = i / 90;
    const t = 1 / (1 + Math.exp(-(v - eqV) * 18));
    let p = p0 + (p1 - p0) * t;
    // 약산–강염기는 당량점 전에 완만한 완충 구간이 생긴다(시안과 같은 지수 보정).
    if (type === "ww" && v < eqV && eqV > 0) p = p0 + (eqPH - p0) * Math.pow(v / eqV, 0.35) * 0.72;
    d += (i ? " L " : "M ") + D.X(PX(v)).toFixed(3) + " " + D.Y(PY(p)).toFixed(3);
  }
  D.path(d, 0.5);

  if (obj.showEqPoint !== false) {
    const ex = PX(eqV), ey = PY(eqPH);
    D.line(x0, ey, ex, ey, 0.2, [1.1, 0.8]);
    D.line(ex, y0, ex, ey, 0.2, [1.1, 0.8]);
    D.dot(ex, ey, 0.8);
    D.label(ex + 1.6, ey - 1.4, "당량점", 2.3, "start");
    D.label(x0 - 1.2, ey + 0.9, String(Math.round(eqPH)), 2.3, "end");
  }
}

/* ══════════ phase — 상평형 그림 (시안 phaSVG) ══════════ */
function drawPhase(obj, D) {
  const x0 = 9, y0 = 33, W = 39, H = 27;
  const PX = (v) => x0 + W * v;
  const PY = (v) => y0 - H * v;
  const tp = pt(obj.triplePt, DEF.triplePt);
  const cp = pt(obj.criticalPt, DEF.criticalPt);
  const water = obj.isWater !== false;
  const names = obj.showRegionNames !== false;

  D.axes(x0, y0, W, H, "phase");

  const TX = PX(tp.x), TY = PY(tp.y);
  const CX = PX(cp.x), CY = PY(cp.y);

  // 승화 곡선 — 원점 근처에서 삼중점까지
  D.path(`M ${D.X(PX(0.04))} ${D.Y(PY(0.03))} Q ${D.X(PX(tp.x * 0.6))} ${D.Y(PY(tp.y * 0.35))} ${D.X(TX)} ${D.Y(TY)}`, 0.5);
  // 융해 곡선 — 물이면 왼쪽으로 기운다(얼음이 물보다 부피가 크기 때문)
  const mx = water ? PX(tp.x - 0.10) : PX(tp.x + 0.10);
  D.path(`M ${D.X(TX)} ${D.Y(TY)} Q ${D.X((TX + mx) / 2)} ${D.Y(PY((tp.y + 0.97) / 2))} ${D.X(mx)} ${D.Y(PY(0.97))}`, 0.5);
  // 기화 곡선 — 삼중점에서 임계점까지
  D.path(`M ${D.X(TX)} ${D.Y(TY)} Q ${D.X(PX((tp.x + cp.x) / 2))} ${D.Y(PY(tp.y + (cp.y - tp.y) * 0.35))} ${D.X(CX)} ${D.Y(CY)}`, 0.5);

  D.dot(TX, TY, 0.85);
  D.dot(CX, CY, 0.85);

  if (names) {
    D.label(PX(tp.x * 0.45), PY(0.78), PHASE_NAMES.solid, 2.6, "middle");
    D.label(PX((tp.x + cp.x) / 2 + 0.12), PY(0.78), PHASE_NAMES.liquid, 2.6, "middle");
    D.label(PX(cp.x * 0.72), PY(0.12), PHASE_NAMES.gas, 2.6, "middle");
    D.label(TX - 1.6, TY - 1.8, PHASE_NAMES.tp, 2.2, "end");
    D.label(CX + 1.4, CY - 1.4, PHASE_NAMES.cp, 2.2, "start");
  }
}

export function renderChemGraph(obj) {
  const color = grayHex(obj.strokeLevel ?? 0);
  const sw = obj.strokeWidth ?? 0.35;
  const g = document.createElementNS(SVG_NS, "g");
  const L = chemGraphLayout(obj);
  const D = mkDraw(g, L, color, sw);

  if (L.kind === "titration") drawTitration(obj, D);
  else if (L.kind === "phase") drawPhase(obj, D);
  else drawEnergy(obj, D);

  const rot = obj.rotation ?? 0;
  if (rot) g.setAttribute("transform", `rotate(${rot} ${L.x + L.w / 2} ${L.y + L.h / 2})`);
  if (obj.opacity != null && obj.opacity !== 1) g.setAttribute("opacity", obj.opacity);
  if (obj.id) g.dataset.id = obj.id;
  return g;
}
