/* ===== RENDER/GROUNDARC: 수평면 위에 누운 원호 =====
 *
 * 기출(p2_2024_11_13)에서 바닥의 거리 d를 나타내는 그 점선 호다. 바닥에 그린 원은
 * 화면에서 (기울어진) 타원이 되므로 일반 원호 도구로는 절대 안 나온다.
 *
 * 스키마
 *   p1   호의 중심(화면 좌표)
 *   p2   호의 시작점(화면 좌표) — 중심에서 이 점까지가 반지름이고, 방향이 시작각이다
 *   sweep  벌림각(도, 바닥 기준). 음수면 반대 방향.
 *   dashed 점선 여부(기본 켬 — 기출의 거리 표시는 전부 점선이다)
 *   projAngle  다른 입체·좌표축과 같아야 하는 투영각
 *
 * ── 바닥 ↔ 화면 좌표 ────────────────────────────────────────────────
 * 바닥면의 두 기저를 화면에 얹으면
 *   e1 = (1, 0)             바닥의 "오른쪽"
 *   e2 = (cos α, -sin α)    바닥의 "안쪽"(깊이)
 * 이므로 바닥 좌표 (u, v)는 화면에서 C + u·e1 + v·e2 다. 역변환도 닫힌 식으로 나온다:
 *   v = -sy / sin α ,  u = sx - v·cos α
 * 이 한 쌍이 이 파일 전부의 근거다. 호는 바닥에서 원이므로 (u,v)=(R cos t, R sin t)를
 * 넣어 표본을 뽑으면 끝이다 — SVG 타원 호의 회전·플래그를 손으로 맞출 필요가 없다.
 */

import { SVG_NS, grayHex } from "./core.js?v=1.2.0";

export const DEFAULT_SWEEP_DEG = 90;
const SAMPLES = 40;

function basis(obj) {
  const deg = Number.isFinite(obj.projAngle) ? obj.projAngle : 50;
  const a = (deg * Math.PI) / 180;
  return { ca: Math.cos(a), sa: Math.sin(a) || 0.5 };
}

/* 화면 델타 → 바닥 좌표 (u, v) */
export function screenToGround(obj, sx, sy) {
  const { ca, sa } = basis(obj);
  const v = -sy / sa;
  return { u: sx - v * ca, v };
}

/* 바닥 좌표 → 화면 절대 좌표 */
function groundToScreen(obj, cx, cy, u, v) {
  const { ca, sa } = basis(obj);
  return { x: cx + u + v * ca, y: cy - v * sa };
}

/* 호의 표본점. 렌더·픽·bbox가 모두 이걸 쓴다. */
export function groundArcPoints(obj, n = SAMPLES) {
  const c = obj.p1 || { x: 0, y: 0 };
  const s = obj.p2 || c;
  const g = screenToGround(obj, s.x - c.x, s.y - c.y);
  const R = Math.hypot(g.u, g.v);
  const t0 = Math.atan2(g.v, g.u);
  const sweep = ((Number.isFinite(obj.sweep) ? obj.sweep : DEFAULT_SWEEP_DEG) * Math.PI) / 180;
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    const t = t0 + sweep * (i / n);
    pts.push(groundToScreen(obj, c.x, c.y, R * Math.cos(t), R * Math.sin(t)));
  }
  return pts;
}

export function groundArcBBox(obj) {
  const pts = groundArcPoints(obj, 24);
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

/* 바닥에서 잰 반지름(mm). 인스펙터가 "거리 d"로 보여 준다 — 화면상 길이가 아니라
 * 바닥에서의 실제 길이라야 그림 안의 다른 거리와 비교가 된다. */
export function groundArcRadius(obj) {
  const c = obj.p1 || { x: 0, y: 0 };
  const s = obj.p2 || c;
  const g = screenToGround(obj, s.x - c.x, s.y - c.y);
  return Math.hypot(g.u, g.v);
}

export function renderGroundArc(obj) {
  const stroke = grayHex(obj.strokeLevel ?? 0);
  const sw = obj.strokeWidth ?? 0.2;
  const g = document.createElementNS(SVG_NS, "g");

  const path = document.createElementNS(SVG_NS, "polyline");
  path.setAttribute("points", groundArcPoints(obj).map((p) => `${p.x},${p.y}`).join(" "));
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", stroke);
  path.setAttribute("stroke-width", sw);
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-linecap", "round");
  if (obj.dashed !== false) path.setAttribute("stroke-dasharray", `${sw * 5} ${sw * 4}`);
  g.appendChild(path);

  // 중심에서 양 끝으로 긋는 반지름 선(옵션) — "이 거리가 d다"를 분명히 할 때 쓴다.
  if (obj.showRadii) {
    const pts = groundArcPoints(obj, 2);
    for (const end of [pts[0], pts[pts.length - 1]]) {
      const ln = document.createElementNS(SVG_NS, "line");
      ln.setAttribute("x1", obj.p1.x); ln.setAttribute("y1", obj.p1.y);
      ln.setAttribute("x2", end.x); ln.setAttribute("y2", end.y);
      ln.setAttribute("stroke", stroke);
      ln.setAttribute("stroke-width", sw);
      ln.setAttribute("stroke-dasharray", `${sw * 5} ${sw * 4}`);
      g.appendChild(ln);
    }
  }

  if (obj.opacity != null && obj.opacity !== 1) g.setAttribute("opacity", obj.opacity);
  if (obj.id) g.dataset.id = obj.id;
  return g;
}
