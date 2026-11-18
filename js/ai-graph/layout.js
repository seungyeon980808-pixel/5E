// 그림으로 만드는 그래프(1.8.0 옵션 엔진) ④ 그리기 — 자리 정하기(DOM 없음).
// image_generator graphdraw/page.html draw()를 옮겼다. 선·점·화살표는 도형 목록으로, 글자는 「후보 자리 중 가장 덜 겹치는 곳」으로.
// 글자 크기 재기(measure)와 글자 HTML 만들기(labelHtml)는 주입받는다 → 브라우저에서는 KaTeX로 실제 재고, node 검사에서는 가짜로 잰다.
// 단위는 mm. 결과 도형·글자 자리는 draw.js가 SVG·PNG로 옮긴다.
import { compileExpr } from './expr.js?v=1.7.0-four-session-integration';

export const STY = Object.freeze({
  W: 56, H: 38, axis: 0.2, curve: 0.38, guide: 0.12, tick: 0.9, arrowL: 2.2, arrowW: 1.15,
  mathMm: 2.9, koMm: 2.45, tickMathMm: 2.7, dash: [1.25, 0.85], gdash: [0.45, 0.35], pad: 0.45,
});
export const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ㉠-㉯ⓐ-ⓩ①-⑳]/;

// 점을 지나는 부드러운 곡선(단조 3차 보간, 꼭짓점을 넘치지 않음)
export function smoothPts(P) {
  const n = P.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((P[i + 1][1] - P[i][1]) / ((P[i + 1][0] - P[i][0]) || 1e-9));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = P[i], [x1, y1] = P[i + 1], h = x1 - x0;
    for (let k = 0; k < 24; k++) {
      const t = k / 24, t2 = t * t, t3 = t2 * t;
      out.push([x0 + h * t, (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m[i + 1]]);
    }
  }
  out.push(P[n - 1]);
  return out;
}

export const ARROW_PAD = 0.15; // 화살촉과 글자 사이 최소 여백(mm). 크게 잡으면 끝 눈금이 밀려 축 이름과 부딪힘(H-R도 3000)
export const boxHit = (a, b, pad) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

// p: prepare()를 거친 설계. env: { measure(html, mm) → {w,h,dx,dy}(mm), labelHtml(src, role) → html }
export function layoutGraph(p, { measure, labelHtml }) {
  const tx = (v) => (p.xLog ? Math.log10(Math.max(v, 1e-12)) : v), ty = (v) => (p.yLog ? Math.log10(Math.max(v, 1e-12)) : v);
  const fx = (x) => (tx(x) - tx(p.xMin)) / (tx(p.xMax) - tx(p.xMin)), fy = (y) => (ty(y) - ty(p.yMin)) / (ty(p.yMax) - ty(p.yMin));
  // yReverse(E8): 수심·지하 깊이처럼 세로 값이 아래로 커지는 그래프 — 가로축이 위, 세로축 화살표가 아래를 향한다.
  const yRev = !!p.yReverse;
  const W = STY.W, H = STY.H, X = (x) => (p.xReverse ? 1 - fx(x) : fx(x)) * W, Y = (y) => (yRev ? fy(y) * H : H - fy(y) * H);
  const ox = (p.xReverse || p.xLog) ? 0 : X(Math.min(Math.max(0, p.xMin), p.xMax)), oy = p.yLog ? (yRev ? 0 : H) : Y(Math.min(Math.max(0, p.yMin), p.yMax));
  // 가로축에서 그림 바깥쪽(보통은 아래, yReverse면 위)으로 d만큼 떨어진 글자 상자의 위 y / 그림 안쪽으로 d만큼
  const outY = (d, h) => (yRev ? oy - d - h : oy + d), inY = (d, h) => (yRev ? oy + d : oy - h - d);
  const segs = [];   // 장애물 선분(mm)
  const arrowBoxes = []; // 화살촉 상자(mm)
  const shapes = [];
  const parts = { axes: [], xTicks: [], yTicks: [], curves: 0, curveNames: [], marks: 0, guides: 0, skippedSeries: [] };
  const line = (x1, y1, x2, y2, w, dash, role, obstacle = true) => { shapes.push({ type: 'line', x1, y1, x2, y2, w, dash: dash || null, role }); if (obstacle) segs.push([[x1, y1], [x2, y2]]); };
  const arrow = (x, y, dx, dy, role) => {
    const L = STY.arrowL, Wd = STY.arrowW, px = -dy, py = dx;
    const tip = [x, y], b1 = [x - dx * L + px * Wd / 2, y - dy * L + py * Wd / 2], b2 = [x - dx * L - px * Wd / 2, y - dy * L - py * Wd / 2], n = [x - dx * L * 0.72, y - dy * L * 0.72];
    shapes.push({ type: 'arrow', tip, b1, n, b2, role }); segs.push([tip, n]);
    // 화살촉 전체를 글자가 피할 상자로(E1 smoke: 원본은 세로축 이름 끝이 화살촉에 닿았음)
    const xs = [tip[0], b1[0], b2[0]], ys = [tip[1], b1[1], b2[1]];
    arrowBoxes.push({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), role });
  };
  // 축
  const xEnd = W + 3.2, yEnd = yRev ? H + 3.2 : -3.2, yDir = yRev ? 1 : -1;
  line(Math.min(X(p.xMin), X(p.xMax), ox), oy, xEnd - 0.4, oy, STY.axis, null, 'axis-x'); arrow(xEnd, oy, 1, 0, 'axis-x');
  line(ox, Y(p.yMin), ox, yEnd - yDir * 0.4, STY.axis, null, 'axis-y'); arrow(ox, yEnd, 0, yDir, 'axis-y');
  parts.axes.push('x', 'y');
  // 곡선
  const curves = [];
  (p.series || []).forEach((s, i) => {
    let pts = [];
    if (s.points && s.points.length > 1) {
      pts = s.points.filter((q) => Array.isArray(q) && Number.isFinite(+q[0]) && Number.isFinite(+q[1])).map(([a, b]) => [X(+a), Y(+b)]);
      if (s.smooth && pts.length > 2) pts = smoothPts(pts);
    } else if (s.expr) {
      const d = s.domain || [p.xMin, p.xMax];
      let f = null;
      try { f = compileExpr(s.expr); } catch { parts.skippedSeries.push(i); }
      if (f) for (let k = 0; k <= 400; k++) { const x = d[0] + (d[1] - d[0]) * k / 400, y = f(x); if (Number.isFinite(y) && y >= p.yMin - 1e-9 && y <= p.yMax + 1e-9) pts.push([X(x), Y(y)]); }
    }
    if (pts.length < 2) return;
    const sw = s.thin ? STY.guide * 1.4 : STY.curve, da = s.thin ? (s.dashed === false ? null : STY.gdash) : (s.dashed ? STY.dash : null);
    shapes.push({ type: 'polyline', pts, w: sw, dash: da, role: s.thin ? 'thin' : 'curve', series: i });
    if (s.thin) { for (let k = 0; k + 1 < pts.length; k += 4) segs.push([pts[k], pts[Math.min(k + 4, pts.length - 1)]]); return; }
    parts.curves++;
    curves.push({ i, pts, label: s.label, labelAt: s.labelAt });
  });
  // 점(검은 점·빈 원)
  const markPts = [];
  for (const mk of p.marks || []) {
    if (!Number.isFinite(+mk.x) || !Number.isFinite(+mk.y)) continue;
    const mx = X(+mk.x), my = Y(+mk.y), r = 0.55;
    if (mk.style !== 'none') shapes.push({ type: 'circle', cx: mx, cy: my, r, fill: mk.style === 'open' ? '#fff' : '#000', w: STY.axis, role: 'mark' });
    markPts.push({ x: mx, y: my, name: mk.name });
    parts.marks++;
  }
  // 보조 점선
  for (const g of p.guides || []) {
    const gx = X(g.x), gy = Y(g.y);
    if (Math.abs(gy - oy) > 0.3) line(gx, gy, gx, oy, STY.guide, STY.gdash, 'guide');
    if (Math.abs(gx - ox) > 0.3) line(gx, gy, ox, gy, STY.guide, STY.gdash, 'guide');
    parts.guides++;
  }
  // 눈금선(안쪽으로 짧게)
  for (const t of p.xTicks || []) line(X(t.value), oy, X(t.value), oy + (yRev ? 1 : -1) * STY.tick * 0.6, STY.axis, null, 'tick-x');
  for (const t of p.yTicks || []) line(ox, Y(t.value), ox + STY.tick * 0.6, Y(t.value), STY.axis, null, 'tick-y');

  // ---- 글자 자리 정하기 ----
  const dens = [];
  for (const [a, b] of segs) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 0.25)); for (let j = 0; j <= n; j++) dens.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]); }
  const curvePts = curves.map((c) => {
    const o = [];
    for (let k = 0; k + 1 < c.pts.length; k++) { const [a, b] = [c.pts[k], c.pts[k + 1]]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 0.25)); for (let j = 0; j < n; j++) o.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]); }
    o.push(c.pts.at(-1));
    return o;
  });
  const placed = [];
  const inBox = (b, [x, y], pad) => x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad;
  const cost = (b) => {
    let c = 0; const pad = STY.pad;
    for (const q of dens) if (inBox(b, q, pad * 0.6)) c += 1;
    curvePts.forEach((ps) => { for (const q of ps) if (inBox(b, q, pad)) c += 3; });
    for (const o of placed) if (boxHit(b, o, pad)) c += 50;
    for (const q of markPts) if (inBox(b, [q.x, q.y], 0.9)) c += 30;
    for (const a of arrowBoxes) if (boxHit(b, a, ARROW_PAD)) c += 50;
    return c;
  };
  const labels = [];
  const add = (src, role, mm, cands, kind, extra = {}) => { const html = labelHtml(src, role), m = measure(html, mm); labels.push({ src: String(src), html, mm, m, cands: cands(m), kind, ...extra }); };
  // 축 이름: y는 화살표 끝 왼쪽 위, x는 화살표 끝 아래
  // (원본 ox - m.w - 0.8은 화살촉 반폭 0.575와 너무 가까워 끝 글자가 닿았다 → 화살촉에서 ARROW_PAD 넘게 띄움)
  const yGap = STY.arrowW / 2 + ARROW_PAD + 0.25;
  const yTip = (m, k) => (yRev ? yEnd - m.h * (1 - k) : yEnd - m.h * k); // 세로축 화살표 끝 곁(위쪽 화살표면 그대로, 아래쪽이면 위아래를 뒤집음)
  const pastTip = (m, d) => (yRev ? yEnd + d : yEnd - m.h - d);        // 화살표 끝 너머
  if (p.labelY) add(p.labelY, 'axis', STY.mathMm, (m) => [[ox - m.w - yGap, yTip(m, 0.35)], [ox + yGap, yTip(m, 0.35)], [ox - m.w / 2, pastTip(m, 0.6)], [ox - m.w - yGap, pastTip(m, 0.4)]], 'axis', { axis: 'y' });
  if (p.labelX) add(p.labelX, 'axis', STY.mathMm, (m) => [[xEnd - m.w, outY(1.6, m.h)], [xEnd + 0.8, oy - m.h / 2], [xEnd - m.w * 0.5, outY(1.6, m.h)], [xEnd - m.w, outY(4.6, m.h)], [xEnd - m.w, inY(1.2, m.h)]], 'axis', { axis: 'x' });
  // 원점 0(E8): 두 축이 실제로 x=0·y=0에서 만날 때(한쪽이 음수까지 내려가 축이 가운데 지나도) 원점에 0.
  // 한 축만 0에서 시작하면(예: 시각 0~24시, 기압 950~1010) 그 축 눈금 자리에 0을 둔다(prepare가 0 눈금을 빼므로 여기서 채움).
  // 눈금 글자가 값과 다른 숫자인 축(예: 세로 값은 지수 4인데 글자는 10^4)은 값 0이 글자 0이 아니므로 0을 더하지 않는다
  const plainScale = (ticks) => (ticks || []).every((t) => { const n = Number(String(t.label).replace(/[−–]/g, '-').trim()); return !/^[-+]?[\d.]+/.test(String(t.label).replace(/[−–]/g, '-').trim()) || (Number.isFinite(n) && Math.abs(n - t.value) < 1e-9 * Math.max(1, Math.abs(t.value))); });
  const xAtZero = !p.xLog && !p.xReverse && p.xMin <= 0 && p.xMax >= 0 && plainScale(p.xTicks);
  const yAtZero = !p.yLog && p.yMin <= 0 && p.yMax >= 0 && plainScale(p.yTicks);
  if (p.originLabel || (p.xMin === 0 && p.yMin === 0) || (xAtZero && yAtZero)) add(p.originLabel || '0', 'value', STY.tickMathMm, (m) => [[ox - m.w - 0.5, outY(0.6, m.h)], [ox - m.w / 2, outY(0.6, m.h)]], 'tick', { key: true, axis: 'o' });
  for (const t of p.xTicks || []) if (t.label) add(t.label, 'value', STY.tickMathMm, (m) => { const cx = X(t.value) - m.w / 2, y0 = outY(0.85, m.h), y1 = inY(0.9, m.h); return [[cx, y0], [cx + m.w * 0.25, y0], [cx - m.w * 0.25, y0], [cx, outY(1.35, m.h)], [cx, y1], [cx + m.w * 0.25, y1], [cx - m.w * 0.25, y1]]; }, 'tick', { key: t.key, axis: 'x' });
  for (const t of p.yTicks || []) if (t.label) add(t.label, 'value', STY.tickMathMm, (m) => { const x0 = ox - m.w - 1.15, cy = Y(t.value) - m.h / 2; return [[x0, cy], [x0 - 0.6, cy], [x0, cy - m.h * 0.2], [x0, cy + m.h * 0.2], [x0 - 1.2, cy],
    // 가까운 핵심 눈금 둘(예: −70·−80)이 맞붙을 때 위아래로 반 칸 비켜 둠(E8)
    [x0, cy - m.h * 0.5], [x0, cy + m.h * 0.5]]; }, 'tick', { key: t.key, axis: 'y' });
  // 한 축만 0에서 시작할 때의 0(핵심 눈금이 아님): 다른 눈금을 다 놓은 뒤 남는 자리에, 막히면 뺀다
  if (!(p.originLabel || (xAtZero && yAtZero))) {
    if (xAtZero) add('0', 'value', STY.tickMathMm, (m) => [[ox - m.w / 2, outY(0.85, m.h)], [ox - m.w - 0.5, outY(0.6, m.h)]], 'tick', { key: false, axis: 'x' });
    else if (yAtZero) add('0', 'value', STY.tickMathMm, (m) => [[ox - m.w - 1.15, oy - m.h / 2], [ox - m.w - 1.15, oy - m.h * 0.9]], 'tick', { key: false, axis: 'y' });
  }
  markPts.forEach((q) => { if (!q.name) return; add(q.name, /^[A-Za-z]+(_\w+)?$/.test(q.name) ? 'name' : 'value', STY.mathMm, (m) => [[q.x + 0.9, q.y - m.h - 0.5], [q.x - m.w - 0.9, q.y - m.h - 0.5], [q.x + 0.9, q.y + 0.5], [q.x - m.w - 0.9, q.y + 0.5], [q.x - m.w / 2, q.y - m.h - 1.0], [q.x - m.w / 2, q.y + 1.0], [q.x + 1.1, q.y - m.h / 2], [q.x - m.w - 1.1, q.y - m.h / 2],
    // 가까운 자리가 모두 곡선·눈금에 막힐 때(E8 항체 그래프: 가로축 위 점 이름이 눈금 30과 겹침) 한 겹 더 바깥
    [q.x + 2.2, q.y - m.h - 2.2], [q.x - m.w - 2.2, q.y - m.h - 2.2], [q.x - m.w / 2, q.y - m.h - 3.0], [q.x + 2.2, q.y + 2.2], [q.x - m.w - 2.2, q.y + 2.2], [q.x - m.w / 2, q.y + 3.0]], 'mark'); });
  for (const t of p.lineLabels || []) if (t.text && Number.isFinite(+t.x)) add(t.text, 'value', STY.tickMathMm * 0.9, (m) => { const x = X(+t.x), y = Y(+t.y); return [[x + 0.6, y - m.h - 0.4], [x + 0.6, y + 0.4], [x - m.w - 0.6, y - m.h - 0.4], [x - m.w - 0.6, y + 0.4],
    [x - m.w / 2, y - m.h - 1.6], [x - m.w / 2, y + 1.6], [x + 2.0, y - m.h / 2], [x - m.w - 2.0, y - m.h / 2]]; }, 'mark');
  // 곡선 이름: 자기 곡선을 따라 끝 쪽부터, 다른 곡선보다 자기 곡선에 가까운 자리
  curves.forEach((c, ci) => {
    if (!c.label) return;
    add(c.label, /[A-Za-z]/.test(c.label) && !/[a-z]_|\\/.test(c.label) ? 'name' : 'value', STY.mathMm, (m) => {
      const o = []; const ps = curvePts[ci];
      if (c.labelAt) { const [ax, ay] = [X(c.labelAt[0]), Y(c.labelAt[1])]; o.push([ax - m.w / 2, ay - m.h / 2]); }
      for (let f = 1; f >= 0.05; f -= 0.03) {
        const q = ps[Math.floor((ps.length - 1) * f)];
        for (const [dx, dy] of [[0.9, -m.h - 0.7], [0.9, 0.7], [-m.w - 0.9, -m.h - 0.7], [-m.w - 0.9, 0.7], [1.2, -m.h / 2], [-m.w - 1.2, -m.h / 2], [-m.w / 2, -m.h - 1.1], [-m.w / 2, 1.1]]) o.push([q[0] + dx, q[1] + dy]);
      }
      return o;
    }, 'curve', { ci });
  });

  // 놓는 순서: 눈금 → 점 → 축 이름 → 곡선 이름. 후보를 차례로 보며 비용 0이면 바로, 아니면 가장 싼 곳.
  const order = [...labels.filter((l) => l.kind === 'tick'), ...labels.filter((l) => l.kind === 'mark'), ...labels.filter((l) => l.kind === 'axis'), ...labels.filter((l) => l.kind === 'curve')];
  const report = [];
  for (const l of order) {
    let best = null, bestC = 1e9;
    l.cands.forEach(([x, y], idx) => {
      if (bestC < 0.5 && l.kind !== 'curve') return;
      const b = { x, y, w: l.m.w, h: l.m.h };
      let c = cost(b) + idx * 0.01;
      if (l.kind === 'curve') { // 다른 곡선에 더 가까우면 헷갈리므로 벌점
        const dist = (ps) => Math.min(...ps.map((q) => Math.hypot(q[0] - (x + l.m.w / 2), q[1] - (y + l.m.h / 2))));
        const own = dist(curvePts[l.ci]), other = Math.min(Infinity, ...curvePts.filter((_, k) => k !== l.ci).map(dist));
        if (other < own * 1.15) c += 5;
        if (own > 6) c += own;
      }
      if (b.x < -14 || b.y < -12 || b.x + b.w > W + 14 || b.y + b.h > H + 10) c += 100;
      if (c < bestC) { bestC = c; best = b; }
    });
    // 눈금이 겹치면(핵심 값이 아니면) 빼고, 핵심 값은 남긴다
    if (bestC >= 1 && l.kind === 'tick' && !l.key) { report.push('눈금 뺌: ' + l.src); l.dropped = true; continue; }
    if (bestC >= 1) report.push('겹침 남음 ' + bestC.toFixed(1) + ': ' + l.src);
    placed.push(best); l.at = best; l.cost = bestC;
  }
  for (const l of order) {
    if (!l.at) continue;
    if (l.kind === 'tick' && l.axis === 'x') parts.xTicks.push(l.src);
    if (l.kind === 'tick' && l.axis === 'y') parts.yTicks.push(l.src);
    if (l.kind === 'curve') parts.curveNames.push(l.src);
  }
  // 판 크기(글자까지 다 들어가게)
  const axesBox = yRev ? { x: -0.5, y: -0.5, w: xEnd + 1, h: yEnd + 1 } : { x: -0.5, y: yEnd - 0.5, w: xEnd + 1, h: H - yEnd + 1 };
  const all = [...placed, axesBox, { x: X(p.xMin), y: Y(p.yMin), w: 0, h: 0 }];
  const bx = Math.min(...all.map((b) => b.x)) - 1.2, by = Math.min(...all.map((b) => b.y)) - 1.2;
  const bw = Math.max(...all.map((b) => b.x + b.w * 1.08)) - bx + 2.5, bh = Math.max(...all.map((b) => b.y + b.h), Y(p.yMin)) - by + 1.2;
  return {
    shapes,
    labels: order.filter((l) => l.at),
    bounds: { x: bx, y: by, w: bw, h: bh },
    report,
    n: report.filter((r) => r.startsWith('겹침')).length,
    parts,
    arrowBoxes,
  };
}

// 놓인 글자 상자끼리 실제로 겹치는 쌍(여백 없이). 그린 뒤 검사용.
export function labelOverlaps(boxes, pad = 0) {
  const list = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (boxHit(boxes[i], boxes[j], pad)) list.push([i, j]);
  return list;
}
