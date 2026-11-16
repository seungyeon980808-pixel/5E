// 11-11: 설명으로 만든 그래프에서 글자(곡선 이름·점 이름·구간 이름)가 곡선과 겹치면 가까운 빈자리로 옮긴다.
// 그래프 값·곡선은 바꾸지 않고 글자 위치만 옮긴다. 지시선이 붙어 있으면 지시선 시작점도 함께 옮긴다.
import { worldFromMath, mathFromWorld, planeAsY2 } from '../function-graph/coords.js?v=1.7.0-four-session-integration';

const glyphWidth = ch => /[가-힣ㄱ-ㅎ㉠-㉯]/.test(ch) ? 1 : /[A-Z0-9]/.test(ch) ? 0.68 : 0.56;
// LaTeX 꼴(t_0, \frac)은 대충 보이는 글자만 센다.
const visible = text => String(text || '').replace(/\\[a-z]+/gi, 'x').replace(/[_^{}\\]/g, '');
export function estimateLabelBox(text, size) {
  const chars = [...visible(text)];
  const w = Math.max(size * 0.6, chars.reduce((sum, ch) => sum + glyphWidth(ch), 0) * size);
  return { w, h: size * 1.15 };
}
function segHitsRect(a, b, r) {
  if (Math.max(a.x, b.x) < r.l || Math.min(a.x, b.x) > r.r || Math.max(a.y, b.y) < r.t || Math.min(a.y, b.y) > r.b) return false;
  const inside = p => p.x >= r.l && p.x <= r.r && p.y >= r.t && p.y <= r.b;
  if (inside(a) || inside(b)) return true;
  const cross = (p, q, s, t) => { const d = (q.x - p.x) * (t.y - s.y) - (q.y - p.y) * (t.x - s.x); if (Math.abs(d) < 1e-12) return false;
    const u = ((s.x - p.x) * (t.y - s.y) - (s.y - p.y) * (t.x - s.x)) / d, v = ((s.x - p.x) * (q.y - p.y) - (s.y - p.y) * (q.x - p.x)) / d; return u >= 0 && u <= 1 && v >= 0 && v <= 1; };
  const c = [{ x: r.l, y: r.t }, { x: r.r, y: r.t }, { x: r.r, y: r.b }, { x: r.l, y: r.b }];
  return c.some((p, i) => cross(a, b, p, c[(i + 1) % 4]));
}
const rectHits = (r, polylines) => polylines.some(pts => pts.some((p, i) => i > 0 && segHitsRect(pts[i - 1], p, r)));
const rectsOverlap = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

export function avoidLabelCurveOverlap(plane, series, { labelSize } = {}) {
  const polylines = series.filter(s => Array.isArray(s.points) && s.points.length > 1 && s.lineVisible !== false).map(s => s.points);
  if (!polylines.length || !Array.isArray(plane.graphAnnotations)) return 0;
  const box = { l: plane.x, r: plane.x + plane.w, t: plane.y, b: plane.y + plane.h };
  const placed = [];
  let moved = 0;
  for (const a of plane.graphAnnotations) {
    if (a.kind !== 'text' || !a.text || a.coordinateSpace !== 'data' || a.orientation === 'vertical' || !Number.isFinite(a.x) || !Number.isFinite(a.y)) continue;
    const p = a.axis === 'y2' ? planeAsY2(plane) : plane;
    const size = a.size || a.fontSize || labelSize || 4;
    const { w, h } = estimateLabelBox(a.displayText ?? a.text, size);
    const pad = size * 0.18;
    const at = worldFromMath(p, a.x, a.y);
    const rectAt = c => ({ l: c.x - w / 2 - pad, r: c.x + w / 2 + pad, t: c.y - h / 2 - pad, b: c.y + h / 2 + pad });
    const ok = c => { const r = rectAt(c); return !rectHits(r, polylines) && !placed.some(q => rectsOverlap(q, r)); };
    let best = at;
    if (!ok(at)) {
      const dirs = [[0, -1], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1], [1, 0], [-1, 0]];
      search: for (let k = 1; k <= 8; k++) for (const [dx, dy] of dirs) {
        const c = { x: at.x + dx * k * size * 0.45, y: at.y + dy * k * size * 0.45 };
        const r = rectAt(c);
        if (r.l < box.l - w || r.r > box.r + w || r.t < box.t - h || r.b > box.b + h) continue;
        if (ok(c)) { best = c; break search; }
      }
    }
    placed.push(rectAt(best));
    if (best !== at) {
      const m = mathFromWorld(p, best.x, best.y);
      // 같은 자리에서 시작하던 지시선은 시작점을 함께 옮긴다.
      for (const l of plane.graphAnnotations) if (l.kind === 'leader' && Math.abs(l.x - a.x) < 1e-9 && Math.abs(l.y - a.y) < 1e-9) { l.x = m.x; l.y = m.y; }
      a.x = m.x; a.y = m.y; moved++;
    }
  }
  return moved;
}
