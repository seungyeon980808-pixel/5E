/* ===== RENDER/FIELD: 전기력선(chargefield) · 자기력선(fieldlines) =====
 *
 * 왜 파라미터 객체인가: 이 그림들은 "곡선을 손으로 흉내 내면 반드시 틀린다".
 * 전하 크기가 조금만 달라져도 몇 개가 상대 전하로 들어가고 몇 개가 무한대로 빠지는지가
 * 통째로 바뀌고, 선끼리 만나서도 안 된다. 그래서 실제 장을 따라 선을 추적한다.
 *
 *   E(p) = Σ qᵢ (p−rᵢ)/|p−rᵢ|³        (자기력선은 자석 양 끝의 ±m 점원으로 같은 식)
 *
 * 규약(교과서):
 *   · 선의 개수는 전하 크기에 비례한다. +2q는 +q의 두 배.
 *   · 선은 +에서 나와 −로 들어가고, 서로 만나지 않는다.
 *   · 큰 쪽에서만 씨앗을 뿌려 추적한다 → 작은 쪽에 닿는 선과 무한대로 빠지는 '열린 선'이
 *     저절로 갈린다(같은 선을 두 번 그리지 않는다).
 *
 * 2026-07-26 교사 검토에서 고친 것 세 가지 — 지우지 말 것:
 *   ① 화살촉은 '선을 따라 잰 거리'에 놓는다. 선 길이의 비율로 놓으면 대각선 방향 선의
 *      화살촉이 더 멀리 찍혀 점전하 그림이 삐뚤어 보인다.
 *   ② 추적 범위는 그림 틀보다 훨씬 넓게 잡고, 틀 밖은 잘라서 그린다. 틀만큼만 추적하면
 *      크게 도는 선이 잘려 "나가는 선만 있고 들어오는 선이 없는" 물리적 오류가 난다.
 *   ③ 중립점(장이 상쇄되는 자리)으로 향하다 멈춘 선은 아예 그리지 않는다. 그리면 허공에서
 *      꺾여 끊긴 것처럼 보인다. 단 이 판정은 '전하 무리 근처'에서만 해야 한다 —
 *      절대 세기로 재면 멀리 도는 선까지 약하다는 이유로 잘린다.
 *
 * 좌표계: 세계 mm. p1/p2 계열이라 line·spring과 같은 이동·회전 경로를 탄다.
 */

import { SVG_NS, grayHex, makeArrowHead } from "./core.js?v=1.2.0";
import { withLineLabel } from "./labels.js?v=1.2.0";

export const CHARGEFIELD_DEFAULTS = {
  kind: "pair",        // single | pair | uniform
  q1: 1, q2: -1,       // 전하 크기(부호 포함)
  lines: 12,           // 가장 큰 전하에서 나가는 선 개수
  arrowDist: 6,        // 화살촉을 놓을 거리(mm, 선을 따라 잰 값)
  chargeR: 1.9,        // 점전하 원 반지름(mm)
  showCharge: true,
  label1: "", label2: "",
};

export const FIELDLINES_DEFAULTS = {
  kind: "bar",         // bar(막대자석) | wire(직선 도선)
  lines: 14,
  showMagnet: true,
  magnetThick: 5.2,    // 자석 몸통 두께(mm)
  rings: 3,            // wire: 동심원 개수
  into: false,         // wire: 전류가 지면으로 들어가는 방향이면 ⊗
};

/* ---------- 장 계산 · 선 추적 (단일 출처) ---------- */
const STEP = 0.28;                 // 기준 걸음(mm). 실제 걸음은 전하와의 거리에 따라 늘어난다
const CANCEL_RATIO = 0.02;         // 중립점 판정: 실제 합성 세기 / 각 전하 세기의 합

function fieldAt(chs, p) {
  let ex = 0, ey = 0;
  for (const c of chs) {
    const dx = p.x - c.x, dy = p.y - c.y, r2 = dx * dx + dy * dy;
    if (r2 < 1e-9) continue;
    const r3 = Math.pow(r2, 1.5);
    ex += c.q * dx / r3; ey += c.q * dy / r3;
  }
  return { x: ex, y: ey };
}
function unitField(chs, p, dir) {
  const e = fieldAt(chs, p), m = Math.hypot(e.x, e.y);
  if (!(m > 1e-11)) return null;
  return { x: dir * e.x / m, y: dir * e.y / m, mag: m };
}

/* 선 하나 추적. 반환 { pts, arc(누적 호 길이), stop }
 *   stop: "sink"(반대 전하에 닿음) | "far"(추적 범위 밖) | "stall"(중립점) | "steps" */
function traceLine(chs, start, dir, { bounds, stopR, maxSteps = 20000 }) {
  const pts = [{ ...start }], arc = [0];
  let p = { ...start }, total = 0, stop = "steps";
  let span = 0;
  for (const a of chs) for (const b of chs) span = Math.max(span, Math.hypot(a.x - b.x, a.y - b.y));
  const nearR = Math.max(span * 3, 6);   // 중립점 판정을 적용할 '전하 무리 근처' 반경

  for (let i = 0; i < maxSteps; i++) {
    let rmin = Infinity;
    for (const c of chs) rmin = Math.min(rmin, Math.hypot(p.x - c.x, p.y - c.y));
    const h = STEP * Math.max(1, Math.min(40, rmin / 6));
    const k1 = unitField(chs, p, dir);
    if (!k1) { stop = "stall"; break; }
    if (rmin < nearR) {
      let raw = 0;
      for (const c of chs) { const r = Math.hypot(p.x - c.x, p.y - c.y); if (r > 1e-6) raw += Math.abs(c.q) / (r * r); }
      if (raw > 0 && k1.mag / raw < CANCEL_RATIO) { stop = "stall"; break; }
    }
    const p2 = { x: p.x + k1.x * h / 2, y: p.y + k1.y * h / 2 }, k2 = unitField(chs, p2, dir) || k1;
    const p3 = { x: p.x + k2.x * h / 2, y: p.y + k2.y * h / 2 }, k3 = unitField(chs, p3, dir) || k2;
    const p4 = { x: p.x + k3.x * h, y: p.y + k3.y * h }, k4 = unitField(chs, p4, dir) || k3;
    const np = { x: p.x + h * (k1.x + 2 * k2.x + 2 * k3.x + k4.x) / 6,
                 y: p.y + h * (k1.y + 2 * k2.y + 2 * k3.y + k4.y) / 6 };
    total += Math.hypot(np.x - p.x, np.y - p.y); p = np;
    pts.push({ ...p }); arc.push(total);
    let hit = false;
    for (const c of chs) { if (c.q * dir < 0 && Math.hypot(p.x - c.x, p.y - c.y) < stopR) { hit = true; break; } }
    if (hit) { stop = "sink"; break; }
    if (p.x < bounds[0] || p.x > bounds[2] || p.y < bounds[1] || p.y > bounds[3]) { stop = "far"; break; }
  }
  return { pts, arc, stop };
}

/* 점원 집합 → 선 다발. 큰 쪽에서만 씨앗을 뿌린다. */
export function traceFieldLines(chs, { lines = 12, reach = 3000, stopR = 1.0 } = {}) {
  const bounds = [-reach, -reach, reach, reach];
  const pos = chs.filter((c) => c.q > 0), neg = chs.filter((c) => c.q < 0);
  const sumP = pos.reduce((a, c) => a + c.q, 0), sumN = -neg.reduce((a, c) => a + c.q, 0);
  const fromPos = sumP >= sumN;
  const seeds = fromPos ? pos : neg, dir = fromPos ? 1 : -1;
  if (!seeds.length) return [];
  const unit = Math.max(...seeds.map((c) => Math.abs(c.q)));
  const out = [];
  for (const c of seeds) {
    const n = Math.max(3, Math.round(lines * Math.abs(c.q) / unit));
    for (let j = 0; j < n; j++) {
      const a = 2 * Math.PI * (j + 0.5) / n;
      const st = { x: c.x + stopR * 0.95 * Math.cos(a), y: c.y + stopR * 0.95 * Math.sin(a) };
      const tr = traceLine(chs, st, dir, { bounds, stopR });
      if (tr.stop === "stall") continue;          // 중립점에서 멈춘 선은 그리지 않는다(위 ③)
      if (tr.pts.length > 4) out.push(tr);
    }
  }
  return out;
}

// 그림 틀 밖은 잘라 낸다(위 ②). 크게 도는 선은 두 도막으로 보인다 — 교과서 그림과 같다.
function clipRuns(pts, fr) {
  const runs = []; let cur = [];
  for (const p of pts) {
    if (p.x >= fr[0] && p.x <= fr[2] && p.y >= fr[1] && p.y <= fr[3]) cur.push(p);
    else { if (cur.length > 2) runs.push(cur); cur = []; }
  }
  if (cur.length > 2) runs.push(cur);
  return runs;
}
function idxAtArc(arc, d) { for (let i = 1; i < arc.length; i++) if (arc[i] >= d) return i; return -1; }

/* ---------- 전기력선 기하 ---------- */
export function chargeFieldGeometry(obj) {
  const p1 = obj.p1 || { x: 0, y: 0 }, p2 = obj.p2 || { x: 10, y: 0 };
  const kind = obj.kind || CHARGEFIELD_DEFAULTS.kind;
  const q1 = Number.isFinite(obj.q1) ? obj.q1 : CHARGEFIELD_DEFAULTS.q1;
  const q2 = Number.isFinite(obj.q2) ? obj.q2 : CHARGEFIELD_DEFAULTS.q2;
  const sep = Math.max(1, Math.hypot(p2.x - p1.x, p2.y - p1.y));
  let charges, frame;
  if (kind === "single") {
    // p2는 그림 반경을 정한다(끌면 그림이 커진다). 전하는 p1 하나.
    charges = [{ x: p1.x, y: p1.y, q: q1 || 1 }];
    frame = [p1.x - sep, p1.y - sep, p1.x + sep, p1.y + sep];
  } else if (kind === "uniform") {
    // p1·p2가 마주 보는 두 모서리 → 그 사각형이 평행판 사이 영역.
    const x0 = Math.min(p1.x, p2.x), x1 = Math.max(p1.x, p2.x);
    const y0 = Math.min(p1.y, p2.y), y1 = Math.max(p1.y, p2.y);
    charges = [];
    frame = [x0, y0, x1, y1];
  } else {
    charges = [{ x: p1.x, y: p1.y, q: q1 }, { x: p2.x, y: p2.y, q: q2 }];
    const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
    frame = [cx - sep * 1.45, cy - sep * 1.15, cx + sep * 1.45, cy + sep * 1.15];
  }
  return { p1, p2, kind, q1, q2, sep, charges, frame };
}

export function chargeFieldBBox(o) {
  const { frame } = chargeFieldGeometry(o);
  const pad = (o.strokeWidth ?? 0.25) + 1;
  return { x: frame[0] - pad, y: frame[1] - pad, w: frame[2] - frame[0] + pad * 2, h: frame[3] - frame[1] + pad * 2 };
}

/* ---------- 자기력선 기하 ---------- */
export function fieldLinesGeometry(obj) {
  const p1 = obj.p1 || { x: -8, y: 0 }, p2 = obj.p2 || { x: 8, y: 0 };
  const kind = obj.kind || FIELDLINES_DEFAULTS.kind;
  const sep = Math.max(1, Math.hypot(p2.x - p1.x, p2.y - p1.y));
  if (kind === "wire") {
    // p1 = 도선 위치, p2 = 가장 바깥 원 위의 점(반지름).
    return { p1, p2, kind, sep, charges: [], frame: [p1.x - sep, p1.y - sep, p1.x + sep, p1.y + sep] };
  }
  // 막대자석: p1 = N극 끝, p2 = S극 끝. 양 끝에 세기가 같은 ±m 점원을 둔다
  // (같은 크기라 선의 개수와 좌우 모양이 저절로 대칭이 된다).
  const m = 1.6;
  const charges = [{ x: p1.x, y: p1.y, q: m }, { x: p2.x, y: p2.y, q: -m }];
  const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
  const frame = [cx - sep * 1.5, cy - sep * 1.12, cx + sep * 1.5, cy + sep * 1.12];
  return { p1, p2, kind, sep, charges, frame };
}

export function fieldLinesBBox(o) {
  const { frame } = fieldLinesGeometry(o);
  const pad = (o.strokeWidth ?? 0.25) + 1;
  return { x: frame[0] - pad, y: frame[1] - pad, w: frame[2] - frame[0] + pad * 2, h: frame[3] - frame[1] + pad * 2 };
}

/* ---------- 공통 그리기 조각 ---------- */
function mkPath(d, color, sw) {
  const el = document.createElementNS(SVG_NS, "path");
  el.setAttribute("d", d);
  el.setAttribute("fill", "none");
  el.setAttribute("stroke", color);
  el.setAttribute("stroke-width", sw);
  el.setAttribute("stroke-linecap", "round");
  el.setAttribute("stroke-linejoin", "round");
  return el;
}
function mkLine(x1, y1, x2, y2, color, sw) {
  const el = document.createElementNS(SVG_NS, "line");
  el.setAttribute("x1", x1); el.setAttribute("y1", y1);
  el.setAttribute("x2", x2); el.setAttribute("y2", y2);
  el.setAttribute("stroke", color); el.setAttribute("stroke-width", sw);
  el.setAttribute("stroke-linecap", "round");
  return el;
}
function mkText(x, y, s, size, color, anchor = "middle", italic = false) {
  const t = document.createElementNS(SVG_NS, "text");
  t.setAttribute("x", x); t.setAttribute("y", y);
  t.setAttribute("font-size", size);
  t.setAttribute("text-anchor", anchor);
  t.setAttribute("fill", color);
  t.setAttribute("font-family", '"Times New Roman", serif');
  if (italic) t.setAttribute("font-style", "italic");
  t.textContent = s;
  return t;
}
// 선 다발을 틀 안쪽만 그리고, 지정한 호 길이 자리에 화살촉을 얹는다.
function paintLines(g, traced, frame, color, sw, arrowSpec) {
  for (const ln of traced) {
    for (const run of clipRuns(ln.pts, frame)) {
      g.appendChild(mkPath("M " + run.map((p) => p.x.toFixed(2) + " " + p.y.toFixed(2)).join(" L "), color, sw));
    }
    const total = ln.arc[ln.arc.length - 1];
    const dists = arrowSpec.mode === "fraction"
      ? arrowSpec.at.map((f) => total * f)
      : arrowSpec.at;
    for (const d of dists) {
      const i = idxAtArc(ln.arc, d);
      if (i < 1 || i > ln.pts.length - 2) continue;
      const q = ln.pts[i];
      if (q.x < frame[0] || q.x > frame[2] || q.y < frame[1] || q.y > frame[3]) continue;
      const a = ln.pts[i - 1], b = ln.pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      g.appendChild(makeArrowHead(q.x, q.y, (b.x - a.x) / len, (b.y - a.y) / len, sw * 1.3, color));
    }
  }
}

/* ---------- 전기력선 렌더 ---------- */
export function renderChargeField(obj) {
  const sw = obj.strokeWidth ?? 0.25;
  const color = grayHex(obj.strokeLevel);
  const geo = chargeFieldGeometry(obj);
  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;

  const lines = Math.max(2, Math.round(obj.lines ?? CHARGEFIELD_DEFAULTS.lines));
  const chargeR = Math.max(0.4, obj.chargeR ?? CHARGEFIELD_DEFAULTS.chargeR);
  const showCharge = obj.showCharge !== false;

  if (geo.kind === "uniform") {
    // 평행판 균일장: 위·아래 판 사이를 곧은 화살표로 채운다(시험 그림 표준).
    const [x0, y0, x1, y1] = geo.frame;
    const w = x1 - x0, plate = Math.max(0.9, Math.min(1.6, w * 0.045));
    const flip = !!obj.flip;
    if (obj.showPlates !== false) {
      [[y0, flip ? "−" : "+"], [y1 - plate, flip ? "+" : "−"]].forEach(([py, sign], i) => {
        const r = document.createElementNS(SVG_NS, "rect");
        r.setAttribute("x", x0); r.setAttribute("y", py);
        r.setAttribute("width", w); r.setAttribute("height", plate);
        r.setAttribute("fill", grayHex(obj.plateLevel ?? 217));
        r.setAttribute("stroke", color); r.setAttribute("stroke-width", sw);
        g.appendChild(r);
        g.appendChild(mkText(x0 - chargeR * 1.4, py + (i ? plate * 2.2 : plate * 0.2), sign, chargeR * 1.7, color));
      });
    }
    for (let i = 0; i < lines; i++) {
      const x = x0 + w * (i + 0.5) / lines;
      const a = flip ? y1 - plate - 0.2 : y0 + plate + 0.2;
      const b = flip ? y0 + plate + 0.2 : y1 - plate - 0.2;
      const uy = b > a ? 1 : -1;
      g.appendChild(mkLine(x, a, x, b - uy * sw * 4.5, color, sw * 1.15));
      g.appendChild(makeArrowHead(x, b, 0, uy, sw * 1.15, color));
    }
    return withLineLabel(g, obj);
  }

  const traced = traceFieldLines(geo.charges, { lines, stopR: Math.max(0.8, chargeR * 0.55) });
  const arrowDist = Math.max(0.5, obj.arrowDist ?? CHARGEFIELD_DEFAULTS.arrowDist);
  paintLines(g, traced, geo.frame, color, sw, { mode: "dist", at: [arrowDist] });

  if (showCharge) {
    geo.charges.forEach((c, i) => {
      const lv = Number.isFinite(obj.chargeLevel) ? obj.chargeLevel : (c.q > 0 ? 255 : 217);
      const cir = document.createElementNS(SVG_NS, "circle");
      cir.setAttribute("cx", c.x); cir.setAttribute("cy", c.y); cir.setAttribute("r", chargeR);
      cir.setAttribute("fill", grayHex(lv));
      cir.setAttribute("stroke", color); cir.setAttribute("stroke-width", sw * 1.6);
      g.appendChild(cir);
      g.appendChild(mkText(c.x, c.y + chargeR * 0.55, c.q > 0 ? "+" : "−", chargeR * 1.7, color));
      const lab = i === 0 ? obj.label1 : obj.label2;
      if (lab) g.appendChild(mkText(c.x, c.y - chargeR - 1, lab, chargeR * 1.5, color, "middle", true));
    });
  }
  return withLineLabel(g, obj);
}

/* ---------- 자기력선 렌더 ---------- */
export function renderFieldLines(obj) {
  const sw = obj.strokeWidth ?? 0.25;
  const color = grayHex(obj.strokeLevel);
  const geo = fieldLinesGeometry(obj);
  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;

  if (geo.kind === "wire") {
    // 직선 도선: 지면에 수직인 도선 둘레의 동심원 + 진행 방향 화살촉.
    const rings = Math.max(1, Math.round(obj.rings ?? FIELDLINES_DEFAULTS.rings));
    const rMax = geo.sep, r0 = Math.max(1.2, rMax * 0.3);
    const cir = (r) => {
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("cx", geo.p1.x); c.setAttribute("cy", geo.p1.y); c.setAttribute("r", r);
      c.setAttribute("fill", "none"); c.setAttribute("stroke", color); c.setAttribute("stroke-width", sw);
      return c;
    };
    const into = !!obj.into;
    for (let i = 0; i < rings; i++) {
      const r = r0 + (rMax - r0) * (rings === 1 ? 1 : i / (rings - 1));
      g.appendChild(cir(r));
      // 오른손 법칙: 나오는 방향(⊙)이면 반시계, 들어가는 방향(⊗)이면 시계.
      g.appendChild(makeArrowHead(geo.p1.x + r, geo.p1.y, 0, into ? 1 : -1, sw * 1.3, color));
    }
    const wr = Math.max(0.9, r0 * 0.42);
    const c0 = document.createElementNS(SVG_NS, "circle");
    c0.setAttribute("cx", geo.p1.x); c0.setAttribute("cy", geo.p1.y); c0.setAttribute("r", wr);
    c0.setAttribute("fill", "#ffffff"); c0.setAttribute("stroke", color); c0.setAttribute("stroke-width", sw * 1.6);
    g.appendChild(c0);
    if (into) {
      const k = wr * 0.62;
      g.appendChild(mkLine(geo.p1.x - k, geo.p1.y - k, geo.p1.x + k, geo.p1.y + k, color, sw * 1.2));
      g.appendChild(mkLine(geo.p1.x - k, geo.p1.y + k, geo.p1.x + k, geo.p1.y - k, color, sw * 1.2));
    } else {
      const d = document.createElementNS(SVG_NS, "circle");
      d.setAttribute("cx", geo.p1.x); d.setAttribute("cy", geo.p1.y); d.setAttribute("r", wr * 0.38);
      d.setAttribute("fill", color); d.setAttribute("stroke", "none");
      g.appendChild(d);
    }
    return withLineLabel(g, obj);
  }

  const lines = Math.max(2, Math.round(obj.lines ?? FIELDLINES_DEFAULTS.lines));
  const traced = traceFieldLines(geo.charges, { lines, stopR: 1.3 });
  // 화살촉은 각 선의 호 길이 25%·75% 두 자리 — 선이 N→S로 좌우 대칭이라 화살촉도
  // 정확히 대칭이 되고, N 쪽에만 몰리지 않는다(2026-07-26 교사 지적).
  paintLines(g, traced, geo.frame, color, sw, { mode: "fraction", at: [0.25, 0.75] });

  if (obj.showMagnet !== false) {
    const { p1, p2 } = geo;
    const ax = (p2.x - p1.x) / geo.sep, ay = (p2.y - p1.y) / geo.sep;
    const nx = -ay, ny = ax;
    const th = Math.max(1, obj.magnetThick ?? FIELDLINES_DEFAULTS.magnetThick) / 2;
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const quad = (a, b) => {
      const pts = [
        `${(a.x + nx * th).toFixed(2)},${(a.y + ny * th).toFixed(2)}`,
        `${(b.x + nx * th).toFixed(2)},${(b.y + ny * th).toFixed(2)}`,
        `${(b.x - nx * th).toFixed(2)},${(b.y - ny * th).toFixed(2)}`,
        `${(a.x - nx * th).toFixed(2)},${(a.y - ny * th).toFixed(2)}`,
      ].join(" ");
      const el = document.createElementNS(SVG_NS, "polygon");
      el.setAttribute("points", pts);
      el.setAttribute("stroke", color); el.setAttribute("stroke-width", sw * 1.8);
      return el;
    };
    const nHalf = quad(p1, mid), sHalf = quad(mid, p2);
    nHalf.setAttribute("fill", grayHex(obj.poleLevel ?? 217));
    sHalf.setAttribute("fill", "#ffffff");
    g.appendChild(nHalf); g.appendChild(sHalf);
    const size = th * 1.25;
    g.appendChild(mkText((p1.x + mid.x) / 2, (p1.y + mid.y) / 2 + size * 0.35, "N", size, color));
    g.appendChild(mkText((mid.x + p2.x) / 2, (mid.y + p2.y) / 2 + size * 0.35, "S", size, color));
  }
  return withLineLabel(g, obj);
}
