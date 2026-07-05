/* ===== CUT GEOMETRY — 삽입 후 자르기(가위/칼/올가미) 분할 수학 =====
//
// 순수 함수 모듈 (DOM/스토어 접근 없음) — Node 단위 테스트 가능. cut-tool.js가
// 이 함수들을 써서 캔버스 객체를 나눈다. 자르기 대상은 획 계열(line/polyline/
// curve)뿐 — 이들은 점 배열로 다뤄 분할 후 같은 타입의 새 객체들로 방출한다.
//
//   · 가위(scissors): 클릭 지점에서 경로를 둘로 (닫힌 경로는 그 지점에서 열림)
//   · 칼(knife):      직선 a→b와의 교차점마다 경로 분할 (닫힌 2교차 = 두 링)
//   · 올가미(lasso):  올가미 폴리곤 경계와의 교차점마다 경로 분할 (안/밖 조각 독립)
// 대상이 아니거나 교차가 없으면 null 반환 → 호출자는 원본 유지. */

function round3(v) { return Math.round(v * 1000) / 1000; }
function dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }

// 선분 (ax,ay)-(bx,by) 위에서 점 (px,py)에 가장 가까운 점 + 매개변수 t.
function segClosest(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay; const L2 = dx * dx + dy * dy || 1e-9;
  let t = ((px - ax) * dx + (py - ay) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + dx * t, y: ay + dy * t, t };
}
// 선분 ab와 cd의 교차점 {x,y,t(ab 위),u(cd 위)} 또는 null.
function segSegIntersect(a, b, c, d) {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denom;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + rx * t, y: a.y + ry * t, t, u };
}
export function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

export function isCuttable(o) {
  return o && (o.type === "line" || o.type === "polyline" || o.type === "curve");
}
// 객체 → 점 배열(월드). line은 [p1,p2], polyline/curve는 points.
function objPoints(o) {
  if (o.type === "line") return [{ x: o.p1.x, y: o.p1.y }, { x: o.p2.x, y: o.p2.y }];
  if (o.type === "polyline" || o.type === "curve") return (o.points || []).map((p) => ({ x: p.x, y: p.y }));
  return null;
}
// 분할 조각(점 배열) → 원본 스타일을 물려받은 새 객체. line도 3점 이상이면 polyline로.
function makePiece(o, pts, closed) {
  const base = JSON.parse(JSON.stringify(o));
  delete base.id; delete base.groupId;
  const P = pts.map((p) => ({ x: round3(p.x), y: round3(p.y) }));
  if (o.type === "line" && P.length === 2 && !closed) {
    base.p1 = P[0]; base.p2 = P[1];
    return base;
  }
  if (o.type === "line") { base.type = "polyline"; base.arrowHead = "none"; }
  base.points = P;
  base.closed = !!closed;
  if (base.type === "polyline" || base.type === "curve") base.fillNone = closed ? base.fillNone : true;
  return base;
}
// 연속 중복점 제거(0길이 세그먼트 방지).
function dedupe(pts) {
  const out = [];
  for (const p of pts) if (!out.length || dist2(out[out.length - 1].x, out[out.length - 1].y, p.x, p.y) > 1e-6) out.push(p);
  return out;
}

/* ----- 가위: 클릭 지점에서 분할 ----- */
export function cutScissors(o, point) {
  if (!isCuttable(o)) return null;
  const pts = objPoints(o);
  if (pts.length < 2) return null;
  const closed = !!o.closed;
  const segCount = closed ? pts.length : pts.length - 1;
  let best = { d: Infinity, seg: -1, pt: null };
  for (let i = 0; i < segCount; i++) {
    const s0 = pts[i], s1 = pts[(i + 1) % pts.length];
    const c = segClosest(point.x, point.y, s0.x, s0.y, s1.x, s1.y);
    const d = dist2(point.x, point.y, c.x, c.y);
    if (d < best.d) best = { d, seg: i, pt: { x: c.x, y: c.y } };
  }
  if (best.seg < 0) return null;
  if (closed) {
    // 닫힌 경로를 한 점에서 자르면 그 점에서 열린 경로가 된다(한 객체).
    const rot = [best.pt];
    for (let k = best.seg + 1; k < pts.length; k++) rot.push(pts[k]);
    for (let k = 0; k <= best.seg; k++) rot.push(pts[k]);
    rot.push(best.pt);
    const d = dedupe(rot);
    return d.length >= 2 ? [makePiece(o, d, false)] : null;
  }
  const left = dedupe([...pts.slice(0, best.seg + 1), best.pt]);
  const right = dedupe([best.pt, ...pts.slice(best.seg + 1)]);
  const out = [];
  if (left.length >= 2) out.push(makePiece(o, left, false));
  if (right.length >= 2) out.push(makePiece(o, right, false));
  return out.length >= 2 ? out : null;
}

// 경로를 (경로 순서로 정렬된) 교차점들에서 조각내기 — 칼·올가미 공용.
// crossings: [{seg, t, pt}] (열린 경로 기준). 닫힌 경로는 별도 처리.
function splitOpenAtCrossings(o, pts, crossings) {
  crossings.sort((a, b) => a.seg - b.seg || a.t - b.t);
  const pieces = [];
  let cur = [pts[0]];
  let ci = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    while (ci < crossings.length && crossings[ci].seg === i) {
      cur.push(crossings[ci].pt);
      pieces.push(cur);
      cur = [{ x: crossings[ci].pt.x, y: crossings[ci].pt.y }];
      ci++;
    }
    cur.push(pts[i + 1]);
  }
  pieces.push(cur);
  return pieces.map((p) => dedupe(p)).filter((p) => p.length >= 2).map((p) => makePiece(o, p, false));
}

// 경로 세그먼트들과 절단 기하(칼=선분, 올가미=폴리곤)의 교차점 목록.
function pathCrossings(pts, closed, hitSeg) {
  const crossings = [];
  const N = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < N; i++) {
    const s0 = pts[i], s1 = pts[(i + 1) % pts.length];
    for (const X of hitSeg(s0, s1)) crossings.push({ seg: i, t: X.t, pt: { x: X.x, y: X.y } });
  }
  return crossings;
}

/* ----- 칼: 직선 a→b 와의 교차점마다 분할 ----- */
export function cutKnife(o, a, b) {
  if (!isCuttable(o)) return null;
  const pts = objPoints(o);
  if (pts.length < 2) return null;
  const closed = !!o.closed;
  const hitSeg = (s0, s1) => { const X = segSegIntersect(s0, s1, a, b); return X ? [X] : []; };
  const crossings = pathCrossings(pts, closed, hitSeg);
  if (!crossings.length) return null;
  if (closed) {
    if (crossings.length !== 2) return null; // 2교차만 두 링으로 분할(그 외는 원본 유지)
    crossings.sort((u, v) => u.seg - v.seg || u.t - v.t);
    const [c0, c1] = crossings;
    const ringA = [c0.pt];
    for (let k = c0.seg + 1; k <= c1.seg; k++) ringA.push(pts[k]);
    ringA.push(c1.pt);
    const ringB = [c1.pt];
    for (let k = (c1.seg + 1) % pts.length; k !== (c0.seg + 1) % pts.length; k = (k + 1) % pts.length) {
      ringB.push(pts[k]);
      if (ringB.length > pts.length + 2) break;
    }
    ringB.push(c0.pt);
    const A = dedupe(ringA), B = dedupe(ringB);
    const out = [];
    if (A.length >= 3) out.push(makePiece(o, A, true));
    if (B.length >= 3) out.push(makePiece(o, B, true));
    return out.length >= 2 ? out : null;
  }
  return splitOpenAtCrossings(o, pts, crossings);
}

/* ----- 올가미: 폴리곤 경계와의 교차점마다 분할 (안/밖 조각이 독립 객체로) ----- */
export function cutLasso(o, poly) {
  if (!isCuttable(o) || !poly || poly.length < 3) return null;
  const pts = objPoints(o);
  if (pts.length < 2) return null;
  const closed = !!o.closed;
  const hitSeg = (s0, s1) => {
    const xs = [];
    for (let j = 0, k = poly.length - 1; j < poly.length; k = j++) {
      const X = segSegIntersect(s0, s1, poly[k], poly[j]);
      if (X) xs.push(X);
    }
    xs.sort((u, v) => u.t - v.t);
    return xs;
  };
  const crossings = pathCrossings(pts, closed, hitSeg);
  if (!crossings.length) return null;
  if (closed) {
    // 닫힌 경로: 올가미 경계에서 열어 조각들로(2교차면 열린 조각 2개).
    // 시작점을 첫 교차 이후로 회전시켜 열린 경로로 만든 뒤 동일 분할.
    crossings.sort((u, v) => u.seg - v.seg || u.t - v.t);
    const rotated = [];
    for (let k = 0; k < pts.length; k++) rotated.push(pts[k]);
    rotated.push(pts[0]);                       // 닫힘을 명시적 마지막 세그먼트로
    const openCrossings = crossings.map((c) => ({ ...c }));
    return splitOpenAtCrossings(o, rotated, openCrossings);
  }
  return splitOpenAtCrossings(o, pts, crossings);
}

// 점에서 객체 획까지의 최소 거리(가위 대상 선택용).
export function distanceToObject(o, point) {
  if (!isCuttable(o)) return Infinity;
  const pts = objPoints(o);
  if (!pts || pts.length < 2) return Infinity;
  const closed = !!o.closed;
  const N = closed ? pts.length : pts.length - 1;
  let best = Infinity;
  for (let i = 0; i < N; i++) {
    const s0 = pts[i], s1 = pts[(i + 1) % pts.length];
    const c = segClosest(point.x, point.y, s0.x, s0.y, s1.x, s1.y);
    const d = dist2(point.x, point.y, c.x, c.y);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// 디스패처: mode·geom으로 객체를 잘라 조각 반환. 못 자르면 null.
export function cutObject(o, mode, geom) {
  if (mode === "scissors") return cutScissors(o, geom.point);
  if (mode === "knife") return cutKnife(o, geom.a, geom.b);
  if (mode === "lasso") return cutLasso(o, geom.poly);
  return null;
}
