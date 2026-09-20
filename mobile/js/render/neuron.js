/* ===== RENDER/NEURON: 뉴런(신경세포) =====
 *
 * 규격 정본: docs/BIO_PARTS_SPEC.md §4. 필드 이름·기본값은 거기서만 가져온다.
 *
 * 스키마
 *   p1        신경세포체(soma) 중심
 *   p2        축삭 말단
 *   somaRadius        세포체 반지름(mm, 기본 3.4)
 *   dendrites         가지돌기 수(기본 5) — 축삭 반대 방향 ±68° 부채꼴
 *   terminals         축삭 말단 분기 수(기본 3)
 *   showStim/stimAt/stimLabel               자극 지점 화살표(기본 꺼짐, 0.45, "자극")
 *   showStimDistance/distanceLabel          세포체~자극 점선 + 거리 라벨(기본 켬, "d")
 *
 * ── 좌표계 ──────────────────────────────────────────────────────────
 * 모든 부속(가지돌기·말단·자극 표시)은 **축(p1→p2) 기준의 국소 좌표**로 만든다.
 *   u = p1→p2 단위벡터,  n = u 를 90° 돌린 것
 * 뉴런이 비스듬히 놓여도 부속이 축을 따라 같이 도는 이유가 이것뿐이다 —
 * 화면 x/y 로 직접 계산하는 자리는 이 파일에 하나도 없다.
 *
 * 화살촉은 절대 직접 그리지 않는다. 직선 도구(js/render/shapes.js)가 쓰는
 * core.js 의 makeArrowHead() 를 같은 옵션값으로 부른다(아래 LINE_ARROW_OPTS 주석).
 */

import { SVG_NS, grayHex, makeArrowHead } from "./core.js?v=1.4.0";
import { makeUprightLabel } from "./labels.js?v=1.4.0";
import { DEFAULT_TEXT_SIZE_MM } from "../state.js?v=1.4.0";

/* 직선/폴리라인 끝 화살표와 **완전히 같은 값**. shapes.js:27 의 LINE_ARROW_OPTS 가
 * 모듈 지역 상수라 import 할 수 없어 값만 옮겨 적는다(다른 파일을 건드리지 않는다는
 * 규칙 때문). 저기가 바뀌면 여기도 같이 바꿀 것. */
const LINE_ARROW_OPTS = { lenMul: 6.5, widthMul: 2.6, notchRatio: 0.16 };

/* 자극 화살표의 표준 길이(mm) — 축 아래에서 축까지 찌르는 길이 */
const STIM_ARROW_LEN = 5;
/* 거리 점선이 축에서 떨어지는 거리(mm) */
const DIST_OFFSET = 4.6;
/* 라벨이 화살표/점선에서 더 떨어지는 거리(mm) */
const LABEL_GAP = 2.6;

const DEND_SPREAD_DEG = 68;   // 가지돌기 부채꼴 반각(명세)
const TERM_SPREAD_DEG = 58;   // 말단 부채꼴 반각
const BRANCH_DEG = 30;        // 가지돌기 끝 두 갈래가 벌어지는 각

function num(v, d) { return Number.isFinite(v) ? v : d; }
function ipos(v, d) { const n = Math.round(num(v, d)); return n > 0 ? n : 0; }

/* 단위벡터 v 를 deg 만큼 돌린 것 */
function rotV(v, deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}
function add(p, v, k) { return { x: p.x + v.x * k, y: p.y + v.y * k }; }

/* 부채꼴 각도 목록: count 개를 -half ~ +half 에 균등 배치(1개면 정중앙) */
function fanAngles(count, half) {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const out = [];
  for (let i = 0; i < count; i += 1) out.push(-half + (2 * half * i) / (count - 1));
  return out;
}

/* ===== 기하 계산 — 렌더·픽·bbox 가 모두 이걸 쓴다 ===== */
export function neuronGeometry(obj) {
  const p1 = obj.p1 || { x: 0, y: 0 };
  const p2 = obj.p2 || { x: p1.x + 20, y: p1.y };
  const R = Math.max(0.4, num(obj.somaRadius, 3.4));

  let dx = p2.x - p1.x, dy = p2.y - p1.y;
  let len = Math.hypot(dx, dy);
  const u = len > 1e-6 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
  if (len <= 1e-6) len = 0;
  const n = { x: -u.y, y: u.x };            // 축의 법선
  const nDown = n.y >= 0 ? n : { x: -n.x, y: -n.y };   // 화면에서 "아래"쪽 법선
  const nUp = { x: -nDown.x, y: -nDown.y };

  const axonStart = add(p1, u, R);          // 축삭은 세포체 가장자리부터
  const axonLen = Math.max(0, len - R);

  // 가지돌기 — 축삭 **반대** 방향(-u) 부채꼴. 끝에서 두 갈래.
  const dendLen = R * 1.9;
  const branchLen = dendLen * 0.45;
  const dendrites = fanAngles(ipos(obj.dendrites, 5), DEND_SPREAD_DEG).map((a) => {
    const d = rotV({ x: -u.x, y: -u.y }, a);
    const a0 = add(p1, d, R * 0.94);        // 세포체 가장자리에서 출발
    const a1 = add(a0, d, dendLen);
    return {
      a: a0,
      b: a1,
      branches: [BRANCH_DEG, -BRANCH_DEG].map((bd) => add(a1, rotV(d, bd), branchLen)),
    };
  });

  // 축삭 말단 — p2 에서 부채꼴로 뻗는 짧은 선 + 끝의 작은 점
  const termLen = R * 0.85;
  const terminals = fanAngles(ipos(obj.terminals, 3), TERM_SPREAD_DEG).map((a) => {
    const d = rotV(u, a);
    return { a: p2, b: add(p2, d, termLen) };
  });

  // 자극 지점 — 0 = 세포체(축삭 시작), 1 = 축삭 끝
  const t = Math.min(1, Math.max(0, num(obj.stimAt, 0.45)));
  const stim = add(axonStart, u, axonLen * t);

  return { p1, p2, R, u, n, nDown, nUp, len, axonStart, axonLen, dendrites, terminals, stim, t };
}

/* bbox 계산용 대표점 — 세포체 원은 사방 R 로 따로 부풀린다 */
function extentPoints(obj, g) {
  const pts = [g.p1, g.p2, g.axonStart];
  pts.push(add(g.p1, { x: 1, y: 0 }, g.R), add(g.p1, { x: -1, y: 0 }, g.R));
  pts.push(add(g.p1, { x: 0, y: 1 }, g.R), add(g.p1, { x: 0, y: -1 }, g.R));
  for (const d of g.dendrites) { pts.push(d.a, d.b, ...d.branches); }
  for (const tm of g.terminals) { pts.push(tm.a, tm.b); }
  if (obj.showStim) {
    pts.push(g.stim, add(g.stim, g.nDown, STIM_ARROW_LEN + LABEL_GAP + DEFAULT_TEXT_SIZE_MM));
    if (obj.showStimDistance) {
      const off = DIST_OFFSET + LABEL_GAP + DEFAULT_TEXT_SIZE_MM;
      pts.push(add(g.p1, g.nUp, off), add(g.stim, g.nUp, off));
    }
  }
  return pts;
}

export function neuronBBox(obj) {
  const g = neuronGeometry(obj);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of extentPoints(obj, g)) {
    if (!p) continue;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/* ===== 렌더 ===== */
function line(g, a, b, stroke, sw, dash) {
  const l = document.createElementNS(SVG_NS, "line");
  l.setAttribute("x1", a.x); l.setAttribute("y1", a.y);
  l.setAttribute("x2", b.x); l.setAttribute("y2", b.y);
  l.setAttribute("stroke", stroke);
  l.setAttribute("stroke-width", sw);
  l.setAttribute("stroke-linecap", "round");
  if (dash) l.setAttribute("stroke-dasharray", dash);
  g.appendChild(l);
  return l;
}

export function renderNeuron(obj) {
  const stroke = grayHex(obj.strokeLevel ?? 0);
  const sw = obj.strokeWidth ?? 0.35;
  const geo = neuronGeometry(obj);
  const g = document.createElementNS(SVG_NS, "g");

  // ── 축삭: 세포체 가장자리 → p2 ──
  if (geo.axonLen > 0) line(g, geo.axonStart, geo.p2, stroke, sw);

  // ── 가지돌기: 축삭 반대 방향 부채꼴 + 끝에서 두 갈래 ──
  for (const d of geo.dendrites) {
    line(g, d.a, d.b, stroke, sw);
    for (const b of d.branches) line(g, d.b, b, stroke, sw * 0.85);
  }

  // ── 축삭 말단: 짧은 선 + 끝의 작은 점 ──
  const dotR = Math.max(sw * 1.5, 0.42);
  for (const tm of geo.terminals) {
    line(g, tm.a, tm.b, stroke, sw);
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", tm.b.x); c.setAttribute("cy", tm.b.y); c.setAttribute("r", dotR);
    c.setAttribute("fill", stroke); c.setAttribute("stroke", "none");
    g.appendChild(c);
  }

  // ── 세포체: 흰 채움 원 + 안쪽 회색 핵(0.34배). 축삭·가지돌기 뿌리를 덮도록 나중에 그린다 ──
  const soma = document.createElementNS(SVG_NS, "circle");
  soma.setAttribute("cx", geo.p1.x); soma.setAttribute("cy", geo.p1.y);
  soma.setAttribute("r", geo.R);
  soma.setAttribute("fill", "#ffffff");
  soma.setAttribute("stroke", stroke);
  soma.setAttribute("stroke-width", sw);
  g.appendChild(soma);

  const nuc = document.createElementNS(SVG_NS, "circle");
  nuc.setAttribute("cx", geo.p1.x); nuc.setAttribute("cy", geo.p1.y);
  nuc.setAttribute("r", geo.R * 0.34);
  nuc.setAttribute("fill", "#d9d9d9");
  nuc.setAttribute("stroke", stroke);
  nuc.setAttribute("stroke-width", sw * 0.8);
  g.appendChild(nuc);

  // ── 자극 지점: 축 아래에서 위로 찌르는 화살표 + 라벨 ──
  if (obj.showStim) {
    const tail = add(geo.stim, geo.nDown, STIM_ARROW_LEN);
    // 화살촉 길이만큼 대(shaft)를 물려 준다 — shapes.js 가 쓰는 것과 같은 계산
    // (length - notchDepth = sw * lenMul * (1 - notchRatio)).
    const back = sw * LINE_ARROW_OPTS.lenMul * (1 - LINE_ARROW_OPTS.notchRatio);
    const head = add(geo.stim, geo.nDown, Math.min(back, STIM_ARROW_LEN));
    line(g, tail, head, stroke, sw);
    g.appendChild(makeArrowHead(
      geo.stim.x, geo.stim.y, geo.nUp.x, geo.nUp.y, sw, stroke, LINE_ARROW_OPTS,
    ));

    const lp = add(geo.stim, geo.nDown, STIM_ARROW_LEN + LABEL_GAP);
    const lab = makeUprightLabel(obj.stimLabel ?? "자극", lp.x, lp.y, stroke,
      DEFAULT_TEXT_SIZE_MM, { labelType: "label" });
    if (lab) g.appendChild(lab);

    // ── 거리 표시: 세포체 중심 ~ 자극 지점, 축 위쪽에 점선 + 이탤릭 라벨 ──
    if (obj.showStimDistance) {
      const dash = `${sw * 5} ${sw * 4}`;
      const a0 = add(geo.p1, geo.nUp, DIST_OFFSET);
      const a1 = add(geo.stim, geo.nUp, DIST_OFFSET);
      line(g, a0, a1, stroke, sw * 0.8, dash);
      // 양 끝을 실제 지점으로 내리는 짧은 연결선
      line(g, geo.p1, add(geo.p1, geo.nUp, DIST_OFFSET + 0.8), stroke, sw * 0.8, dash);
      line(g, geo.stim, add(geo.stim, geo.nUp, DIST_OFFSET + 0.8), stroke, sw * 0.8, dash);

      const mid = { x: (a0.x + a1.x) / 2, y: (a0.y + a1.y) / 2 };
      const dp = add(mid, geo.nUp, LABEL_GAP);
      const dlab = makeUprightLabel(obj.distanceLabel ?? "d", dp.x, dp.y, stroke,
        DEFAULT_TEXT_SIZE_MM, { labelType: "quantity" });
      if (dlab) g.appendChild(dlab);
    }
  }

  if (obj.opacity != null && obj.opacity !== 1) g.setAttribute("opacity", obj.opacity);
  if (obj.id) g.dataset.id = obj.id;
  return g;
}
