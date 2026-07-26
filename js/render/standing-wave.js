/* ===== RENDER/STANDING-WAVE: 정상파 (standingwave) — p1→p2 파라미터 객체 =====
 *
 * 왜 파라미터 객체인가: 배진동 차수를 바꾸면 마디·배 위치가 전부 달라진다. 손으로 그리면
 * 차수를 바꿀 때마다 처음부터 다시 그려야 하고, 마디 위치를 눈대중으로 찍게 된다.
 *
 * 매질별 포락선 A(u), u = 0→1 (p1→p2)
 *   줄(양끝 고정)   : sin(nπu)          — 양끝이 마디
 *   열린관(양끝 열림): cos(nπu)          — 양끝이 배
 *   닫힌관(한쪽 막힘): 막힌 쪽이 마디, 열린 쪽이 배 → 홀수 배진동만 존재
 *
 * 마디 위치는 위 식의 영점을 **직접 풀어서** 찍는다. 샘플링해서 |A|가 작은 곳을 찾으면
 * 중복·누락이 난다(2026-07-26 실측으로 확인).
 *
 * 좌표계: 세계 mm. p1/p2 계열이라 line·spring과 같은 이동·회전 경로를 탄다.
 */

import { SVG_NS, grayHex, applyDash } from "./core.js?v=1.3.0";
import { withLineLabel } from "./labels.js?v=1.3.0";

export const STANDINGWAVE_DEFAULTS = {
  medium: "string",   // string(줄) | open(열린관) | closed(닫힌관)
  n: 2,               // 몇 배 진동 (닫힌관은 홀수만)
  amplitude: 4.2,     // 배의 높이(mm)
  closedEnd: "p1",    // 닫힌관에서 막힌 쪽: p1 | p2
  showNodes: true,    // 마디 ● 표시
};

/* 닫힌관은 짝수 배진동이 물리적으로 없다 — 값이 짝수로 들어오면 가까운 홀수로 맞춘다. */
export function normalizeHarmonic(medium, n) {
  const v = Math.max(1, Math.round(n || 1));
  if (medium !== "closed") return v;
  return v % 2 === 1 ? v : v + 1;
}

export function standingWaveGeometry(obj) {
  const p1 = obj.p1 || { x: 0, y: 0 };
  const p2 = obj.p2 || { x: 30, y: 0 };
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const L = Math.hypot(dx, dy);
  const ax = L > 0 ? dx / L : 1, ay = L > 0 ? dy / L : 0;
  const nx = -ay, ny = ax;
  const medium = obj.medium || STANDINGWAVE_DEFAULTS.medium;
  const n = normalizeHarmonic(medium, obj.n ?? STANDINGWAVE_DEFAULTS.n);
  const amp = Math.max(0.3, obj.amplitude ?? STANDINGWAVE_DEFAULTS.amplitude);
  const closedAtP1 = (obj.closedEnd || STANDINGWAVE_DEFAULTS.closedEnd) !== "p2";
  const wall = amp + 1.8;          // 관 벽·고정단까지의 거리

  const A = (u) => medium === "string" ? Math.sin(n * Math.PI * u)
    : medium === "open" ? Math.cos(n * Math.PI * u)
    : (closedAtP1 ? Math.sin(n * Math.PI * u / 2) : Math.cos(n * Math.PI * u / 2));

  // 마디 위치(식의 영점). 샘플링하지 않는다.
  const nodes = [];
  if (medium === "string") { for (let i = 0; i <= n; i++) nodes.push(i / n); }
  else if (medium === "open") { for (let i = 0; i < n; i++) nodes.push((2 * i + 1) / (2 * n)); }
  else if (closedAtP1) { for (let i = 0; 2 * i / n <= 1 + 1e-9; i++) nodes.push(2 * i / n); }
  else { for (let i = 0; (2 * i + 1) / n <= 1 + 1e-9; i++) nodes.push((2 * i + 1) / n); }

  const at = (t, s) => ({ x: p1.x + ax * t + nx * s, y: p1.y + ay * t + ny * s });
  return { p1, p2, L, ax, ay, nx, ny, medium, n, amp, wall, closedAtP1, A, nodes, at };
}

export function standingWaveBBox(o) {
  const { p1, p2, wall } = standingWaveGeometry(o);
  const pad = wall + (o.strokeWidth ?? 0.5);
  const minX = Math.min(p1.x, p2.x) - pad, maxX = Math.max(p1.x, p2.x) + pad;
  const minY = Math.min(p1.y, p2.y) - pad, maxY = Math.max(p1.y, p2.y) + pad;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function renderStandingWave(obj) {
  const sw = obj.strokeWidth ?? 0.5;
  const color = grayHex(obj.strokeLevel);
  const geo = standingWaveGeometry(obj);
  const { at, A, wall, amp, L, medium, nodes } = geo;
  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;

  const line = (a, b, w, dashed) => {
    const el = document.createElementNS(SVG_NS, "line");
    el.setAttribute("x1", a.x); el.setAttribute("y1", a.y);
    el.setAttribute("x2", b.x); el.setAttribute("y2", b.y);
    el.setAttribute("stroke", color); el.setAttribute("stroke-width", w);
    el.setAttribute("stroke-linecap", "round");
    if (dashed) { el.setAttribute("stroke-dasharray", "1.2 0.8"); }
    return el;
  };

  if (medium === "string") {
    // 줄: 양끝 고정 — 해칭 금지 규약에 따라 회색 블록으로. 축을 따라 도는 다각형이라
    // 세로·비스듬으로 세워도 벽이 함께 돈다(2026-07-26 교사 지적으로 고침).
    [[0, 1], [L, -1]].forEach(([t, dir]) => {
      const q = [at(t, -wall), at(t + dir * 2.2, -wall), at(t + dir * 2.2, wall), at(t, wall)];
      const el = document.createElementNS(SVG_NS, "polygon");
      el.setAttribute("points", q.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" "));
      el.setAttribute("fill", grayHex(obj.wallLevel ?? 217));
      el.setAttribute("stroke", color); el.setAttribute("stroke-width", sw * 0.7);
      g.appendChild(el);
    });
  } else {
    g.appendChild(line(at(0, -wall), at(L, -wall), sw * 0.9));
    g.appendChild(line(at(0, wall), at(L, wall), sw * 0.9));
    if (medium === "closed") {
      const t = geo.closedAtP1 ? 0 : L;
      g.appendChild(line(at(t, -wall), at(t, wall), sw * 0.9));
    }
  }

  // 진동 중심선(가는 파선) — 포락선보다 먼저 깔린다
  g.appendChild(line(at(0, 0), at(L, 0), Math.max(0.12, sw * 0.3), true));

  // 포락선 두 가닥(위·아래 대칭)
  [1, -1].forEach((sgn) => {
    let d = "";
    for (let i = 0; i <= 200; i++) {
      const u = i / 200, p = at(L * u, sgn * amp * A(u));
      d += (i ? " L " : "M ") + p.x.toFixed(2) + " " + p.y.toFixed(2);
    }
    const el = document.createElementNS(SVG_NS, "path");
    el.setAttribute("d", d); el.setAttribute("fill", "none");
    el.setAttribute("stroke", color); el.setAttribute("stroke-width", sw);
    el.setAttribute("stroke-linecap", "round"); el.setAttribute("stroke-linejoin", "round");
    applyDash(el, obj);
    g.appendChild(el);
  });

  if (obj.showNodes !== false) {
    nodes.forEach((u) => {
      const p = at(L * u, 0);
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("cx", p.x); c.setAttribute("cy", p.y);
      c.setAttribute("r", Math.max(0.35, sw * 1.24));
      c.setAttribute("fill", color); c.setAttribute("stroke", "none");
      g.appendChild(c);
    });
  }

  return withLineLabel(g, obj);
}
