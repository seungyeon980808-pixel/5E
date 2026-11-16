/* Diagnostic only: never snaps points or declares visual acceptance.
 * Nearby labels/guides may also contain ink, so a match is not proof of a curve. */
export function reviewSourceAnchors(plan, raster, { tolerancePx = 3, searchRadiusPx = 8 } = {}) {
  const { width, height, data } = raster || {}, box = plan?.source?.plotBox;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || data?.length !== width * height * 4 || width !== plan?.source?.width || height !== plan?.source?.height || !box) throw Error('Bound source raster required');
  if (!Number.isFinite(tolerancePx) || tolerancePx < 0 || !Number.isInteger(searchRadiusPx) || searchRadiusPx < 1 || searchRadiusPx > 12 || tolerancePx >= searchRadiusPx) throw Error('Bounded pixel tolerance required');
  const observations = [];
  for (const series of plan.series || []) {
    if (series.kind !== 'points' || series.coordinateSpace !== 'normalized' || series.lineVisible === false) continue;
    const markers = new Set((series.endpoints || []).map(e => e.index));
    (series.points || []).forEach((point, index) => {
      if (markers.has(index) || series.markerShape === 'open-circle') return;
      const x = box.x + point.x * box.w, y = box.y + (1 - point.y) * box.h;
      let distance = Infinity;
      for (let py = Math.max(0, Math.floor(y) - searchRadiusPx); py <= Math.min(height - 1, Math.ceil(y) + searchRadiusPx); py++) {
        for (let px = Math.max(0, Math.floor(x) - searchRadiusPx); px <= Math.min(width - 1, Math.ceil(x) + searchRadiusPx); px++) {
          const d = Math.hypot(px - x, py - y); if (d > searchRadiusPx || d >= distance) continue;
          const i = (py * width + px) * 4;
          if (data[i + 3] >= 128 && .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2] <= 128) distance = d;
        }
      }
      observations.push({ seriesId: series.id, pointIndex: index, x, y, distancePx: Number.isFinite(distance) ? distance : null, needsReview: distance > tolerancePx });
    });
  }
  return { schema: '5e.graph-source-anchor-review/v1', tolerancePx, searchRadiusPx, checked: observations.length, flagged: observations.filter(p => p.needsReview).length, visualAcceptance: false, coordinatesChanged: false, observations };
}
