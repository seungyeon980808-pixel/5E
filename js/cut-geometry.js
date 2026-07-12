/* ===== CUT GEOMETRY — 삽입 후 자르기(가위/칼) 분할 수학 =====
//
// 순수 함수 모듈 (DOM/스토어 접근 없음) — Node 단위 테스트 가능. cut-tool.js가
// 이 함수들을 써서 캔버스 객체를 나눈다. 자르기 대상은 획 계열(line/polyline/
// curve)뿐 — 이들은 점 배열로 다뤄 분할 후 같은 타입의 새 객체들로 방출한다.
//
//   · 가위(scissors): 클릭 지점에서 경로를 둘로 (닫힌 경로는 그 지점에서 열림)
//   · 칼(knife):      직선 a→b와의 교차점마다 경로 분할 (닫힌 도형은 2교차서 두 호로)
// 획·윤곽선 조각은 열린 경로로 방출한다(합성 변이 안 생기게). 단, 색을 채운
// 영역(객체화 덩어리 등)은 잘린 현(弦)을 따라 닫아 두 개의 "채워진" 조각으로 방출.
// 대상이 아니거나 교차가 없으면 null 반환 → 호출자는 원본 유지. */

import { curveBezierSeg, curveBezierSegClosed, evalBezier } from "./geometry.js?v=1.0.0";

// curve 객체의 렌더된 스플라인을 폴리라인으로 샘플링(제어점 직선이 아니라 실제 곡선
// 기준으로 잘리게). render/core.js의 curveSamplePoints와 동일한 Catmull-Rom 제어점 사용.
function curveSample(o, samplesPerSeg = 12) {
  const pts = o.points || [];
  const n = pts.length;
  if (n < 2) return pts.map((p) => ({ x: p.x, y: p.y }));
  if (n === 2) return [{ x: pts[0].x, y: pts[0].y }, { x: pts[1].x, y: pts[1].y }];
  const closed = o.closed === true && n >= 3;
  const out = [{ x: pts[0].x, y: pts[0].y }];
  const segCount = closed ? n : n - 1;
  for (let i = 0; i < segCount; i++) {
    const seg = closed ? curveBezierSegClosed(pts, i) : curveBezierSeg(pts, i);
    for (let s = 1; s <= samplesPerSeg; s++) out.push(evalBezier(seg, s / samplesPerSeg));
  }
  return out;
}

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
export function isCuttable(o) {
  return o && (o.type === "line" || o.type === "polyline" || o.type === "curve"
    || o.type === "ellipse" || o.type === "rect" || o.type === "triangle");
}
// 네이티브 도형(원/상자/삼각형)은 항상 닫힘; polyline/curve는 o.closed.
function objClosed(o) {
  return o.type === "ellipse" || o.type === "rect" || o.type === "triangle" || !!o.closed;
}
// 색을 채운 닫힌 영역인가(=렌더러가 fill을 그리는 도형). fillNone이면 윤곽선만 있는
// 도형/열린 획이므로 false. 이 판정으로 잘린 조각을 닫힌-채움으로 유지할지 정한다.
// (render/fill.js: obj.fillNone → "transparent" 규칙과 일치)
export function isFilledRegion(o) {
  return isCuttable(o) && objClosed(o) && !o.fillNone;
}
function rotatePt(px, py, cx, cy, deg) {
  if (!deg) return { x: px, y: py };
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  const dx = px - cx, dy = py - cy;
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}
// 원/상자/삼각형 → 닫힌 다각형 점 배열(회전 반영). 직선 칼이 볼록 도형을 항상 2점서
// 지나므로 깔끔히 두 조각으로 갈린다. 자른 조각은 닫힌 polyline로 방출된다.
function ellipsePolygon(o, n = 48) {
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2, rx = o.w / 2, ry = o.h / 2;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(rotatePt(cx + rx * Math.cos(a), cy + ry * Math.sin(a), cx, cy, o.rotation || 0));
  }
  return pts;
}
function rectPolygon(o) {
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2, d = o.rotation || 0;
  return [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]]
    .map(([x, y]) => rotatePt(x, y, cx, cy, d));
}
function trianglePolygon(o) {
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2, d = o.rotation || 0;
  const fx = !!o.flipX, fy = !!o.flipY;
  let v;
  if (!fx && !fy) v = [[o.x, o.y + o.h], [o.x + o.w, o.y + o.h], [o.x, o.y]];
  else if (fx && !fy) v = [[o.x + o.w, o.y + o.h], [o.x, o.y + o.h], [o.x + o.w, o.y]];
  else if (!fx && fy) v = [[o.x, o.y], [o.x + o.w, o.y], [o.x, o.y + o.h]];
  else v = [[o.x + o.w, o.y], [o.x, o.y], [o.x + o.w, o.y + o.h]];
  return v.map(([x, y]) => rotatePt(x, y, cx, cy, d));
}
// 객체 → 점 배열(월드). line은 [p1,p2], polyline/curve는 points, 도형은 다각형화.
function objPoints(o) {
  if (o.type === "line") return [{ x: o.p1.x, y: o.p1.y }, { x: o.p2.x, y: o.p2.y }];
  if (o.type === "curve") return curveSample(o);
  if (o.type === "polyline") return (o.points || []).map((p) => ({ x: p.x, y: p.y }));
  if (o.type === "ellipse") return ellipsePolygon(o);
  if (o.type === "rect") return rectPolygon(o);
  if (o.type === "triangle") return trianglePolygon(o);
  return null;
}
// 분할 조각(점 배열) → 원본 스타일을 물려받은 새 객체. line도 3점 이상이면 polyline로.
function makePiece(o, pts, closed) {
  const nativeShape = o.type === "ellipse" || o.type === "rect" || o.type === "triangle";
  const base = JSON.parse(JSON.stringify(o));
  delete base.id; delete base.groupId;
  const P = pts.map((p) => ({ x: round3(p.x), y: round3(p.y) }));
  if (o.type === "line" && P.length === 2 && !closed) {
    base.p1 = P[0]; base.p2 = P[1];
    return base;
  }
  // line·네이티브 도형 조각은 polyline로(반쪽 타원은 타원이 아니므로). 도형의
  // 위치/크기/회전 필드는 버리고 절대 점 좌표만 사용. fill/stroke는 원본 상속.
  if (o.type === "line" || nativeShape) {
    base.type = "polyline";
    base.arrowHead = base.arrowHead ?? "none";
    base.rounded = base.rounded ?? false;
    base.cornerRadius = base.cornerRadius ?? 10;
    base.dashLength = base.dashLength ?? 0;
    base.dashGap = base.dashGap ?? 0;
    delete base.x; delete base.y; delete base.w; delete base.h;
    delete base.flipX; delete base.flipY;
    base.rotation = 0;
  }
  base.points = P;
  base.closed = !!closed;
  if ((base.type === "polyline" || base.type === "curve") && !closed) base.fillNone = true;
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
  // 색을 채운 영역은 점 클릭 한 번으로 2D를 나눌 수 없다 → 가위로는 건드리지 않고
  // 원본 유지(예전엔 닫힌 경로가 열리며 채움이 사라졌음). 영역 분할은 칼로 가로지른다.
  if (isFilledRegion(o)) return null;
  const pts = objPoints(o);
  if (pts.length < 2) return null;
  const closed = objClosed(o);
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

// 같은 점의 중복 교차 제거 — 칼이 다각형 꼭짓점을 정확히 지날 때(축정렬 절단 등)
// 인접 두 세그먼트가 같은 점을 각각 교차로 잡아 개수가 부풀려지는 것 방지.
function dedupeCrossings(crossings) {
  const out = [];
  for (const c of crossings) {
    if (!out.some((d) => dist2(d.pt.x, d.pt.y, c.pt.x, c.pt.y) < 1e-4)) out.push(c);
  }
  return out;
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
  const closed = objClosed(o);
  const hitSeg = (s0, s1) => { const X = segSegIntersect(s0, s1, a, b); return X ? [X] : []; };
  const crossings = dedupeCrossings(pathCrossings(pts, closed, hitSeg));
  if (!crossings.length) return null;
  if (closed) {
    if (crossings.length !== 2) return null; // 2교차만 두 조각으로 분할(그 외는 원본 유지)
    crossings.sort((u, v) => u.seg - v.seg || u.t - v.t);
    const [c0, c1] = crossings;
    // 두 교차점에서 두 "호(arc)"가 나온다. 채운 영역이면 잘린 현(弦)을 따라 각각 닫아
    // 두 개의 채워진 조각으로 방출(색 유지). 윤곽선만 있는 도형이면 닫지 않고 열린
    // 호로 방출(합성 현이 안 그어지게) — 기존 동작 유지.
    const fillHalves = isFilledRegion(o);
    const arcA = [c0.pt];
    for (let k = c0.seg + 1; k <= c1.seg; k++) arcA.push(pts[k]);
    arcA.push(c1.pt);
    const arcB = [c1.pt];
    // 두 교차점이 같은 세그먼트(c0.seg===c1.seg)에 있으면 start===end라 while 루프가
    // 0회 실행돼 도형 대부분이 소실됐다. 순회 횟수를 미리 계산해(같은 세그먼트면 N,
    // 즉 나머지 전체를 한 바퀴) 그만큼 정점을 도는 카운트 루프로 교체.
    const stepsB = ((c0.seg - c1.seg + pts.length) % pts.length) || pts.length;
    let kB = (c1.seg + 1) % pts.length;
    for (let s = 0; s < stepsB; s++) { arcB.push(pts[kB]); kB = (kB + 1) % pts.length; }
    arcB.push(c0.pt);
    const A = dedupe(arcA), B = dedupe(arcB);
    // 채운 조각은 면적을 가지려면 3점 이상 필요(현으로 닫히므로). 획 조각은 2점이면 충분.
    const minPts = fillHalves ? 3 : 2;
    const out = [];
    if (A.length >= minPts) out.push(makePiece(o, A, fillHalves));
    if (B.length >= minPts) out.push(makePiece(o, B, fillHalves));
    return out.length >= 2 ? out : null;
  }
  return splitOpenAtCrossings(o, pts, crossings);
}

// 점에서 객체 획까지의 최소 거리(가위 대상 선택용).
export function distanceToObject(o, point) {
  if (!isCuttable(o)) return Infinity;
  const pts = objPoints(o);
  if (!pts || pts.length < 2) return Infinity;
  const closed = objClosed(o);
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

/* ----- 자유경로(가위): 그려진 폴리라인이 지나가는 곳마다 분할 ----- */
// 절단 경로에서 두 교차점 ca,cb '사이'의 그려진 정점들을 ca→cb 순서로 반환(끝점 제외).
// 직선(2점 경로)이면 항상 빈 배열 → 채운 조각이 곧은 현으로 닫힘(=칼과 동일).
function pathInterior(cutPts, ca, cb) {
  let a = ca, b = cb, rev = false;
  if (a.pseg > b.pseg || (a.pseg === b.pseg && a.u > b.u)) { a = cb; b = ca; rev = true; }
  const mids = [];
  for (let k = a.pseg + 1; k <= b.pseg; k++) mids.push({ x: cutPts[k].x, y: cutPts[k].y });
  if (rev) mids.reverse();
  return mids;
}
// 대상 경계 × 절단 경로 교차점. 각 교차에 대상 위치(seg,t)와 경로 위치(pseg,u) 기록.
function freehandCrossings(o, cut) {
  const pts = objPoints(o);
  if (!pts || pts.length < 2 || cut.length < 2) return null;
  const closed = objClosed(o);
  const raw = [];
  const N = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < N; i++) {
    const s0 = pts[i], s1 = pts[(i + 1) % pts.length];
    for (let j = 0; j < cut.length - 1; j++) {
      const X = segSegIntersect(s0, s1, cut[j], cut[j + 1]);
      if (X) raw.push({ seg: i, t: X.t, pseg: j, u: X.u, pt: { x: X.x, y: X.y } });
    }
  }
  return { pts, closed, crossings: dedupeCrossings(raw) };
}
// 절단 경로가 대상을 자르는 지점들(빨간 점 미리보기용). 못 자르면 [].
export function cutCrossingPoints(o, path) {
  if (!isCuttable(o)) return [];
  const cut = dedupe((path || []).map((p) => ({ x: p.x, y: p.y })));
  const r = freehandCrossings(o, cut);
  return r ? r.crossings.map((c) => c.pt) : [];
}
export function cutFreehand(o, path) {
  if (!isCuttable(o)) return null;
  const cut = dedupe((path || []).map((p) => ({ x: p.x, y: p.y })));
  if (cut.length < 2) return null;
  const r = freehandCrossings(o, cut);
  if (!r) return null;
  const { pts, closed, crossings } = r;
  if (!crossings.length) return null;
  if (!closed) return splitOpenAtCrossings(o, pts, crossings);
  if (crossings.length !== 2) return null; // 닫힌 도형은 2교차(관통)만 분할 — 그 외 원본 유지
  crossings.sort((u, v) => u.seg - v.seg || u.t - v.t);
  const [c0, c1] = crossings;
  const arcAInterior = [];
  for (let k = c0.seg + 1; k <= c1.seg; k++) arcAInterior.push(pts[k]);
  const arcBInterior = [];
  // 같은 세그먼트(c0.seg===c1.seg)일 때 0회 실행되던 버그를 카운트 루프로 교체
  // (같은 세그먼트면 N = 나머지 전체를 한 바퀴).
  const stepsBI = ((c0.seg - c1.seg + pts.length) % pts.length) || pts.length;
  let kBI = (c1.seg + 1) % pts.length;
  for (let s = 0; s < stepsBI; s++) { arcBInterior.push(pts[kBI]); kBI = (kBI + 1) % pts.length; }
  const fillHalves = isFilledRegion(o);
  if (!fillHalves) {
    // 윤곽선: 두 열린 호(절단 경로는 버림) — 기존 칼 동작과 동일.
    const A = dedupe([c0.pt, ...arcAInterior, c1.pt]);
    const B = dedupe([c1.pt, ...arcBInterior, c0.pt]);
    const out = [];
    if (A.length >= 2) out.push(makePiece(o, A, false));
    if (B.length >= 2) out.push(makePiece(o, B, false));
    return out.length >= 2 ? out : null;
  }
  // 채운 영역: 그려진 절단 경로를 공유 경계로 삼아 채운 두 조각으로.
  const A = dedupe([c0.pt, ...arcAInterior, c1.pt, ...pathInterior(cut, c1, c0)]);
  const B = dedupe([c1.pt, ...arcBInterior, c0.pt, ...pathInterior(cut, c0, c1)]);
  const out = [];
  if (A.length >= 3) out.push(makePiece(o, A, true));
  if (B.length >= 3) out.push(makePiece(o, B, true));
  return out.length >= 2 ? out : null;
}

// 디스패처: mode·geom으로 객체를 잘라 조각 반환. 못 자르면 null.
export function cutObject(o, mode, geom) {
  if (mode === "scissors") return cutScissors(o, geom.point);
  if (mode === "knife") return cutKnife(o, geom.a, geom.b);
  if (mode === "freehand" || mode === "path") return cutFreehand(o, geom.path);
  return null;
}
