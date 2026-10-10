// Display observed omission marks without inventing the missing scale interval.
export function observedAxisBreakMarks(plan) {
  if (plan.variant !== 'axis-break' || plan.coordinateMode !== 'observed') return [];
  const explicit = (Array.isArray(plan.annotations) ? plan.annotations : []).filter(a => a?.kind === 'text' && typeof a.text === 'string' && /^[≈~∿]+$/.test(a.text.trim()) && a.coordinateSpace === 'normalized');
  const marks = explicit.map(a => ({ ...a }));
  const b = plan.source?.plotBox;
  if (!b) return marks;
  for (const [i, r] of (Array.isArray(plan.review) ? plan.review : []).entries()) {
    if (!r?.sourceBox || !/생략|axis.?break|omission/i.test(r.reason || '')) continue;
    const q = r.sourceBox, x = (q.x + q.w / 2 - b.x) / b.w, y = 1 - (q.y + q.h / 2 - b.y) / b.h;
    const xAxis = plan.axisPlacement?.x?.mode === 'fraction' ? plan.axisPlacement.x.value : 0;
    const yAxis = plan.axisPlacement?.y?.mode === 'fraction' ? plan.axisPlacement.y.value : 0;
    const onX = Math.abs(y - xAxis) <= .04, onY = Math.abs(x - yAxis) <= .04;
    if (onX === onY || x < -.04 || x > 1.04 || y < -.04 || y > 1.04 || marks.some(a => Math.hypot(a.x - x, a.y - y) < .05)) continue;
    marks.push({ id: `observed-axis-break-${i}`, kind: 'text', text: '≈', x: onY ? yAxis : x, y: onX ? xAxis : y,
      axis: 'y', coordinateSpace: 'normalized', orientation: onX ? 'rotate' : 'horizontal', fontSizePx: Math.max(q.w, q.h), observationSourceBox: { ...q } });
  }
  return marks;
}
