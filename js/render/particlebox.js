/* ===== RENDER/PARTICLEBOX: 입자 상자(크기박스 계열) =====
 *
 * 물질의 상태(고체·액체·기체)를 입자 모형으로 보여 주는 상자다.
 * 시안은 docs/chem-parts-proposal.html 의 `pboxSVG()` 이고, 그 코드가 정본이다.
 * 시안 좌표계는 **상자 한 변 24** (x0=14, y0=5, W=24, H=24) 기준이라
 * 여기서는 그 24 를 obj.w / obj.h 로 환산해서 좌표를 **직접 계산**한다
 * (legend.js·pedigree.js 와 같은 방식 — <g transform> 스케일을 쓰지 않으므로
 *  선 굵기가 상자 크기에 딸려 늘어나지 않는다).
 *
 * ── 난수 ──────────────────────────────────────────────
 * `Math.random()` 을 쓰면 **저장했다 다시 열 때 배치가 달라진다.**
 * 그래서 시안과 똑같이 mulberry32 결정적 난수를 `obj.seed` 로 돌린다.
 * 씨앗은 시안과 같게 `seed * 1000 + count` 로 섞는다 — 입자 수를 바꿔도
 * 배치가 통째로 바뀌어 보이도록 한 것이다.
 * 인스펙터의 [위치 섞기] 버튼이 obj.seed 자체를 바꾼다.
 *
 * 스키마 — docs/CHEM_PARTS_SPEC.md §3
 *   x, y, w, h       크기박스(이동·리사이즈는 앱이 처리). 기본 26 × 26 mm
 *   state            "solid" | "liquid" | "gas"
 *   count            입자 수 (14)
 *   particleRadius   입자 반지름. **시안 좌표계(상자 24폭) 기준값** (1.15)
 *   motion           "none" | "trail" | "arrow"  — 고체에서는 무시
 *   particleShape    "circle" | "square"
 *   mix              2종 혼합(홀수 번째를 진한 사각으로)
 *   seed             배치 난수 씨앗 (7)
 */

import { SVG_NS, grayHex, makeArrowHead } from "./core.js?v=1.3.0";

export const PARTICLE_STATES = ["solid", "liquid", "gas"];
export const PARTICLE_MOTIONS = ["none", "trail", "arrow"];
export const PARTICLE_SHAPES = ["circle", "square"];

const VB = 24;            // 시안 좌표계에서의 상자 한 변
const DEF_COUNT = 14;
const DEF_RADIUS = 1.15;  // 시안 좌표계 기준
const DEF_SEED = 7;

const LIQUID_LEVEL = 0.42;   // 액면선의 상자 안 높이 비율 (시안 y0 + H*0.42)
const OVERLAP = 2.05;        // 중심거리 > r * OVERLAP 이면 안 겹친 것으로 본다
const MAX_TRIES = 60;        // 재시도 60회 후 포기(명세 §3)

const FILL_LIGHT = grayHex(216);   // #d8d8d8 — 1종 입자
const FILL_DARK = grayHex(74);     // #4a4a4a — 2종 혼합의 둘째 입자

/* 시안의 mulberry32 — 씨앗만 같으면 항상 같은 수열이 나온다. */
function mulberry(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function num(v, dflt, min = 0) {
  return Number.isFinite(v) && v >= min ? v : dflt;
}

function pick(v, list, dflt) {
  return list.includes(v) ? v : dflt;
}

/* ----- 배치 계산 -----
 * 렌더러와 (앞으로 필요해질) 바깥에서 같은 값을 쓰도록 배치를 한 곳에서만 정한다.
 * 반환 { x, y, w, h, r, k, state, motion, shape, mix, levelY, points[] }
 *   k         시안 좌표 → mm 환산 배율. 가로·세로가 달라도 입자가 찌그러지지
 *             않도록 **짧은 변 기준 한 값**만 쓴다.
 *   points[]  { x, y, a }  a = 움직임 방향(라디안)
 *   levelY    액면선 y (액체가 아니면 null)
 */
export function particleBoxLayout(obj) {
  const x = num(obj.x, 0, -Infinity);
  const y = num(obj.y, 0, -Infinity);
  const w = num(obj.w, 26, 0.1);
  const h = num(obj.h, 26, 0.1);

  const state = pick(obj.state, PARTICLE_STATES, "gas");
  const shape = pick(obj.particleShape, PARTICLE_SHAPES, "circle");
  const motionRaw = pick(obj.motion, PARTICLE_MOTIONS, "none");
  const motion = state === "solid" ? "none" : motionRaw;   // 고체에서는 무시(명세 §3)
  const mix = obj.mix === true;

  const k = Math.min(w, h) / VB;                            // 시안 → mm
  const n = Math.max(1, Math.round(num(obj.count, DEF_COUNT, 1)));
  // 반지름은 상자의 절반을 넘지 못하게 잘라 준다(작은 상자에서 여백이 음수가 되는 것 방지).
  const r = Math.min(num(obj.particleRadius, DEF_RADIUS, 0.01) * k, w / 4, h / 4);
  const m = r + 0.6 * k;                                    // 여백 = r + 0.6 (시안)

  const innerW = Math.max(0, w - m * 2);
  const innerH = Math.max(0, h - m * 2);
  const levelY = state === "liquid" ? y + h * LIQUID_LEVEL : null;

  const points = [];
  if (state === "solid") {
    // 격자 배치 — 정사각에 가까운 c×c 격자에 순서대로 채운다.
    const c = Math.ceil(Math.sqrt(n));
    const div = c - 1 || 1;
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / c), col = i % c;
      points.push({
        x: x + m + innerW * (c === 1 ? 0.5 : col / div),
        y: y + m + innerH * (c === 1 ? 0.5 : row / div),
        a: 0,
      });
    }
  } else {
    // 액체·기체 — 결정적 난수로 뿌리되 이미 놓인 입자와 겹치면 다시 뽑는다.
    const rnd = mulberry(num(obj.seed, DEF_SEED, -Infinity) * 1000 + n);
    // 액체는 액면선 아래쪽에만 모인다(시안: y0 + H*0.42 + m*0.2 부터 H*0.58 - m*1.2 폭).
    const liqTop = y + h * LIQUID_LEVEL + m * 0.2;
    const liqSpan = Math.max(0, h * (1 - LIQUID_LEVEL) - m * 1.2);
    for (let i = 0; i < n; i++) {
      let px = x + m, py = y + m, ok = false, tries = 0;
      while (!ok && tries < MAX_TRIES) {
        tries++;
        px = x + m + rnd() * innerW;
        py = state === "liquid" ? liqTop + rnd() * liqSpan : y + m + rnd() * innerH;
        ok = points.every((p) => Math.hypot(p.x - px, p.y - py) > r * OVERLAP);
      }
      // 60회 실패하면 마지막 후보를 그냥 쓴다(시안과 동일 — 무한 루프 금지).
      points.push({ x: px, y: py, a: rnd() * Math.PI * 2 });
    }
  }

  return { x, y, w, h, r, k, state, motion, shape, mix, levelY, points };
}

export function particleBoxBBox(obj) {
  const L = particleBoxLayout(obj);
  return { x: L.x, y: L.y, w: L.w, h: L.h };
}

/* ----- 움직임 표시 -----
 * 입자보다 **먼저** 그려야 꼬리가 입자 뒤로 들어간다(시안 주석과 동일).
 */
function motionNode(g, p, L, color, sw) {
  const { r, k } = L;
  const ca = Math.cos(p.a), sa = Math.sin(p.a);

  if (L.motion === "arrow") {
    const x1 = p.x + ca * (r + 0.4 * k), y1 = p.y + sa * (r + 0.4 * k);
    const hx = p.x + ca * (r + 2.2 * k), hy = p.y + sa * (r + 2.2 * k);
    const ln = document.createElementNS(SVG_NS, "line");
    ln.setAttribute("x1", x1); ln.setAttribute("y1", y1);
    ln.setAttribute("x2", hx); ln.setAttribute("y2", hy);
    ln.setAttribute("stroke", color);
    ln.setAttribute("stroke-width", sw * 0.74);
    ln.setAttribute("stroke-linecap", "round");
    g.appendChild(ln);
    // 화살촉은 다른 부품과 같은 공용 경로(core.makeArrowHead)를 쓴다.
    g.appendChild(makeArrowHead(hx, hy, ca, sa, sw * 0.74, color));
    return;
  }

  // 속도선(꼬리) — 뒤쪽으로 나란한 3줄.
  const tx = p.x - ca * (r + 2.6 * k), ty = p.y - sa * (r + 2.6 * k);
  for (let i = 0; i < 3; i++) {
    const off = (i - 1) * 0.9 * k;
    const nx = -sa * off, ny = ca * off;
    const ln = document.createElementNS(SVG_NS, "line");
    ln.setAttribute("x1", p.x - ca * (r + 0.5 * k) + nx);
    ln.setAttribute("y1", p.y - sa * (r + 0.5 * k) + ny);
    ln.setAttribute("x2", tx + nx * 0.6);
    ln.setAttribute("y2", ty + ny * 0.6);
    ln.setAttribute("stroke", color);
    ln.setAttribute("stroke-width", sw * 0.57);
    ln.setAttribute("stroke-linecap", "round");
    g.appendChild(ln);
  }
}

export function renderParticleBox(obj) {
  const color = grayHex(obj.strokeLevel ?? 0);
  const sw = obj.strokeWidth ?? 0.35;
  const g = document.createElementNS(SVG_NS, "g");
  const L = particleBoxLayout(obj);

  // ----- 상자 -----
  const box = document.createElementNS(SVG_NS, "rect");
  box.setAttribute("x", L.x); box.setAttribute("y", L.y);
  box.setAttribute("width", L.w); box.setAttribute("height", L.h);
  box.setAttribute("fill", "none");
  box.setAttribute("stroke", color);
  box.setAttribute("stroke-width", sw * 1.43);   // 시안 0.5 ÷ 기본 0.35
  g.appendChild(box);

  // ----- 액면선 -----
  if (L.levelY != null) {
    const lv = document.createElementNS(SVG_NS, "line");
    lv.setAttribute("x1", L.x); lv.setAttribute("y1", L.levelY);
    lv.setAttribute("x2", L.x + L.w); lv.setAttribute("y2", L.levelY);
    lv.setAttribute("stroke", color);
    lv.setAttribute("stroke-width", sw * 0.71);
    g.appendChild(lv);
  }

  // ----- 입자 -----
  L.points.forEach((p, i) => {
    const second = L.mix && i % 2 === 1;
    const fill = second ? FILL_DARK : FILL_LIGHT;
    if (L.motion !== "none") motionNode(g, p, L, color, sw);

    // 2종 혼합의 둘째 입자는 모양으로도 구분되게 항상 사각으로 그린다(시안).
    const shape = second ? "square" : L.shape;
    let node;
    if (shape === "square") {
      node = document.createElementNS(SVG_NS, "rect");
      node.setAttribute("x", p.x - L.r); node.setAttribute("y", p.y - L.r);
      node.setAttribute("width", L.r * 2); node.setAttribute("height", L.r * 2);
    } else {
      node = document.createElementNS(SVG_NS, "circle");
      node.setAttribute("cx", p.x); node.setAttribute("cy", p.y);
      node.setAttribute("r", L.r);
    }
    node.setAttribute("fill", fill);
    node.setAttribute("stroke", color);
    node.setAttribute("stroke-width", sw * 0.63);
    g.appendChild(node);
  });

  const rot = obj.rotation ?? 0;
  if (rot) g.setAttribute("transform", `rotate(${rot} ${L.x + L.w / 2} ${L.y + L.h / 2})`);
  if (obj.opacity != null && obj.opacity !== 1) g.setAttribute("opacity", obj.opacity);
  if (obj.id) g.dataset.id = obj.id;
  return g;
}
