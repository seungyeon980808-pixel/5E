/** Preview-only registration. Matrices map points without changing graph data. */
export const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);
export function validMatrix(m) {
  return Array.isArray(m) && m.length === 6 && m.every(Number.isFinite) && Math.abs(m[0] * m[3] - m[1] * m[2]) > 1e-10;
}
export function mapPoint(m, p) { return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }; }
export function inverseMatrix(m) {
  if (!validMatrix(m)) throw new Error('정렬 기준점이 겹치거나 한 직선에 있습니다.');
  const d = m[0] * m[3] - m[1] * m[2];
  return [m[3]/d, -m[1]/d, -m[2]/d, m[0]/d, (m[2]*m[5]-m[3]*m[4])/d, (m[1]*m[4]-m[0]*m[5])/d];
}
export function multiplyMatrix(a, b) {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
export function fitThreePoints(from, to) {
  if (![from, to].every(points => Array.isArray(points) && points.length === 3 && points.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y)))) throw new Error('기준점 3개를 지정하세요.');
  const basis = p => [p[1].x-p[0].x,p[1].y-p[0].y,p[2].x-p[0].x,p[2].y-p[0].y,p[0].x,p[0].y];
  const result = multiplyMatrix(basis(to), inverseMatrix(basis(from)));
  if (!validMatrix(result)) throw new Error('서로 다른 축의 기준점을 선택하세요.');
  return result;
}
export function sourceFrameMatrix(reference, plane) {
  const p = reference.plotBox || { x:0, y:0, w:reference.width, h:reference.height };
  if (![p.x,p.y,p.w,p.h,plane.x,plane.y,plane.w,plane.h].every(Number.isFinite) || Math.min(p.w,p.h,plane.w,plane.h) <= 0) throw new Error('원본의 크기를 확인할 수 없습니다.');
  if (reference.plotBox) return [plane.w/p.w,0,0,plane.h/p.h,plane.x-p.x*plane.w/p.w,plane.y-p.y*plane.h/p.h];
  // A manual reference has no calibration: contain it without stretching it.
  const s = Math.min(plane.w/p.w, plane.h/p.h);
  return [s,0,0,s,plane.x+(plane.w-p.w*s)/2,plane.y+(plane.h-p.h*s)/2];
}
export function axisLandmarks(plane) {
  const clamp = n => Math.max(0,Math.min(1,n));
  const fx = plane.axisPlacement?.y?.mode === 'fraction' && Number.isFinite(plane.axisPlacement.y.value) ? clamp(plane.axisPlacement.y.value) : null;
  const fy = plane.axisPlacement?.x?.mode === 'fraction' && Number.isFinite(plane.axisPlacement.x.value) ? clamp(plane.axisPlacement.x.value) : null;
  const edge = plane.axisVariant === 'box' || plane.xScale === 'log' || plane.yScale === 'log';
  // The renderer treats value mode as the mathematical zero axis (its value field is disabled).
  // Only preserved reconstructed axes clamp zero to the frame; ordinary axes may be outside it.
  const zeroFraction = (min,max) => plane.reconstruction?.preserveAxes ? clamp(-min/(max-min)) : -min/(max-min);
  const x = plane.x + plane.w * (edge ? (plane.axisVariant === 'box' ? fx ?? 0 : 0) : fx ?? zeroFraction(plane.xMin,plane.xMax));
  const y = plane.y + plane.h * (1 - (edge ? (plane.axisVariant === 'box' ? fy ?? 0 : 0) : fy ?? zeroFraction(plane.yMin,plane.yMax)));
  // On top/right axes use the opposite end, so the basis never collapses.
  const right = Math.abs(plane.x+plane.w-x) > plane.w*0.1;
  const top = Math.abs(plane.y-y) > plane.h*0.1;
  return { points:[{x,y},{x:right?plane.x+plane.w:plane.x,y},{x,y:top?plane.y:plane.y+plane.h}], xEnd:right?'오른쪽':'왼쪽', yEnd:top?'위쪽':'아래쪽' };
}
export function traceMatrixForPlane(value, plane) {
  const state=normalizeTraceState(value);
  if(!state.frame)return state.graphMatrix;
  const basis=p=>[p.w,0,0,p.h,p.x,p.y];
  const change=multiplyMatrix(basis(plane),inverseMatrix(basis(state.frame)));
  return multiplyMatrix(multiplyMatrix(change,state.graphMatrix),inverseMatrix(change));
}
export function normalizeTraceState(value = {}) {
  return { version:1, wipePosition:Number.isFinite(value.wipePosition)?Math.max(0,Math.min(1,value.wipePosition)):0.5, mode:['graph','overlay','side','wipe'].includes(value.mode)?value.mode:'graph', opacity:Number.isFinite(value.opacity)?Math.max(0,Math.min(1,value.opacity)):0.65, graphMatrix:validMatrix(value.graphMatrix)?[...value.graphMatrix]:[...IDENTITY], ...(['x','y','w','h'].every(k=>Number.isFinite(value.frame?.[k])) && value.frame.w>0 && value.frame.h>0 ? {frame:{x:value.frame.x,y:value.frame.y,w:value.frame.w,h:value.frame.h}} : {}) };
}
