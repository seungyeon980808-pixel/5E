/* Explicit bounded denoising for observed anchors. Exact data is never fitted. */
export function fitObservedCurve(points, options = {}) {
  const originalPoints = (points || []).map(p => ({ ...p }));
  const result = originalPoints.map(p => ({ ...p }));
  const bad = error => ({ ok: false, points: result, originalPoints, changedIndices: [], error });
  if (!Array.isArray(points) || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return bad('유효한 관찰점이 필요합니다.');
  if (!options.enabled) return { ok: true, points: result, originalPoints, changedIndices: [] };
  if (options.certainty === 'exact') return bad('정확한 데이터에는 관찰 곡선 맞춤을 적용할 수 없습니다.');
  const tolerance = options.tolerance;
  if (!Number.isFinite(tolerance) || tolerance <= 0) return bad('양수 허용 오차가 필요합니다.');
  const protect = new Set([0, points.length - 1, ...(options.protectedIndices || [])]);
  for (const b of options.breaks || []) { protect.add(b - 1); protect.add(b); }
  (options.segmentModes || []).forEach((m,i) => { if (m === 'line') { protect.add(i); protect.add(i+1); } });
  // Preserve significant extrema. Small reversals below tolerance are observational
  // noise; explicit protectedIndices retain even a small scientifically real peak.
  for (let i=1;i<points.length-1;i++) {
    const a=points[i-1],b=points[i],c=points[i+1];
    if ((b.x-a.x)*(c.x-b.x)<=0) { protect.add(i-1);protect.add(i);protect.add(i+1); }
    if ((b.y-a.y)*(c.y-b.y)<0 && Math.min(Math.abs(b.y-a.y),Math.abs(c.y-b.y))>tolerance) protect.add(i);
  }
  // Only remove sub-tolerance reversals/plateau jitter. Do not smooth every
  // sample: that would round significant shoulders even with bounded error.
  for (let i=1;i<points.length-1;i++) {
    if (protect.has(i)) continue;
    const a=points[i-1],b=points[i],c=points[i+1];
    const reversal=(b.y-a.y)*(c.y-b.y)<0;
    if (!reversal || c.x===a.x) continue;
    const target=a.y+(c.y-a.y)*(b.x-a.x)/(c.x-a.x);
    if (Math.abs(target-b.y)<=tolerance) result[i].y=target;
  }
  const changedIndices=result.flatMap((p,i)=>p.y!==points[i].y?[i]:[]);
  return { ok:true,points:result,originalPoints,changedIndices,protectedIndices:[...protect].sort((a,b)=>a-b) };
}
