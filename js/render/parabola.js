/* ===== RENDER/PARABOLA: 포물선 궤적 (비스듬히 던진 물체) =====
 *
 * 스키마
 *   p1, p2   **바닥(그림자)에서** 출발점과 도달점. 두 점 모두 화면 좌표다.
 *   apex     최고 높이(mm). p1→p2 선분에서 위로 얼마나 뜨는가.
 *   showShadow  바닥 점선(기본 켬)
 *   showApex    최고점 표시(점 + 그림자로 내린 수선, 기본 끔)
 *
 * ── 왜 깊이 값이 따로 없나 ──────────────────────────────────────────────
 * 3D 좌표를 따로 두지 않아도 된다. 사용자가 p2를 **깊이 방향(오른쪽 위)** 으로 끌면
 * 그 자체로 "안쪽으로 날아갔다"가 된다 — 경사 투영에서는 바닥 경로가 화면상 그냥
 * 직선이기 때문이다. 그래서 두 점은 교사가 생각하는 그대로 "여기서 던져 저기 떨어진다"
 * 이고, 3D 느낌은 바닥 점선이 만든다.
 *
 * 궤적 y = 선분 - 4·apex·t(1-t)  → t=0.5에서 정확히 apex만큼 뜬다(참 포물선).
 *
 * 바닥 점선은 기본으로 켠다. 궤적선만 있으면 위로 간 건지 안쪽으로 간 건지 읽히지
 * 않는다 — 기출도 그래서 그림자를 같이 그린다.
 */

import { SVG_NS, grayHex } from "./core.js?v=1.4.0";

export const DEFAULT_APEX_MM = 14;
const SAMPLES = 48;

const apexOf = (obj) => (Number.isFinite(obj.apex) ? obj.apex : DEFAULT_APEX_MM);

/* 궤적 표본점. 렌더·픽·bbox가 모두 이걸 써서 보이는 선과 잡히는 선이 어긋나지 않는다. */
export function parabolaPoints(obj, n = SAMPLES) {
  const a = obj.p1 || { x: 0, y: 0 };
  const b = obj.p2 || a;
  const h = apexOf(obj);
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    pts.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t - 4 * h * t * (1 - t),
    });
  }
  return pts;
}

export function parabolaBBox(obj) {
  const pts = parabolaPoints(obj, 24);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/* 최고점(t=0.5)과 그 바로 아래 그림자 점 */
export function parabolaApexPoints(obj) {
  const a = obj.p1 || { x: 0, y: 0 };
  const b = obj.p2 || a;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return { top: { x: mid.x, y: mid.y - apexOf(obj) }, foot: mid };
}

function line(x1, y1, x2, y2, stroke, sw, dash) {
  const el = document.createElementNS(SVG_NS, "line");
  el.setAttribute("x1", x1); el.setAttribute("y1", y1);
  el.setAttribute("x2", x2); el.setAttribute("y2", y2);
  el.setAttribute("stroke", stroke);
  el.setAttribute("stroke-width", sw);
  if (dash) el.setAttribute("stroke-dasharray", dash);
  return el;
}

export function renderParabola(obj) {
  const stroke = grayHex(obj.strokeLevel ?? 0);
  const sw = obj.strokeWidth ?? 0.3;
  const thin = sw * 0.6;                       // 보조선은 궤적보다 얇게
  const dash = `${sw * 5} ${sw * 4}`;
  const g = document.createElementNS(SVG_NS, "g");
  const a = obj.p1 || { x: 0, y: 0 };
  const b = obj.p2 || a;

  // 바닥 그림자(점선) — 궤적보다 먼저 그려 뒤에 깔린다.
  if (obj.showShadow !== false) {
    g.appendChild(line(a.x, a.y, b.x, b.y, stroke, thin, dash));
  }

  // 궤적
  const path = document.createElementNS(SVG_NS, "polyline");
  path.setAttribute("points", parabolaPoints(obj).map((p) => `${p.x},${p.y}`).join(" "));
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", stroke);
  path.setAttribute("stroke-width", sw);
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-linecap", "round");
  // 기출의 궤적은 대부분 점선이다(실제로 보이는 선이 아니라 "지나간 길"이라서).
  if (obj.dashed) path.setAttribute("stroke-dasharray", dash);
  g.appendChild(path);

  // 최고점: 점 + 그림자로 내린 수선
  if (obj.showApex) {
    const { top, foot } = parabolaApexPoints(obj);
    g.appendChild(line(top.x, top.y, foot.x, foot.y, stroke, thin, dash));
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("cx", top.x); dot.setAttribute("cy", top.y);
    dot.setAttribute("r", Math.max(sw * 2, 0.6));
    dot.setAttribute("fill", stroke);
    g.appendChild(dot);
  }

  if (obj.opacity != null && obj.opacity !== 1) g.setAttribute("opacity", obj.opacity);
  if (obj.id) g.dataset.id = obj.id;
  return g;
}
