export function splitRegion(mode, points, width, height) {
  if (!['rectangle', 'freehand'].includes(mode) || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return null;
  const clean = points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map(({ x, y }) => ({ x: Math.max(0, Math.min(width, x)), y: Math.max(0, Math.min(height, y)) }));
  if (clean.length < (mode === 'rectangle' ? 2 : 3)) return null;
  const used = mode === 'rectangle' ? [clean[0], clean.at(-1)] : clean;
  const x = Math.floor(Math.min(...used.map(point => point.x))), y = Math.floor(Math.min(...used.map(point => point.y)));
  const w = Math.ceil(Math.max(...used.map(point => point.x))) - x, h = Math.ceil(Math.max(...used.map(point => point.y))) - y;
  if (w < 4 || h < 4) return null;
  if (mode === 'freehand') {
    const area = used.reduce((sum, point, i) => { const next = used[(i + 1) % used.length]; return sum + point.x * next.y - next.x * point.y; }, 0);
    if (Math.abs(area) < 8) return null;
  }
  return { mode, x, y, width: w, height: h, ...(mode === 'freehand' ? { points: used } : {}) };
}

export function rasterizeSplit(image, region) {
  const canvas = document.createElement('canvas'); canvas.width = region.width; canvas.height = region.height;
  const ctx = canvas.getContext('2d');
  if (region.mode === 'freehand') {
    ctx.beginPath(); region.points.forEach((point, i) => ctx[i ? 'lineTo' : 'moveTo'](point.x - region.x, point.y - region.y)); ctx.closePath(); ctx.clip();
  }
  ctx.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
  return canvas.toDataURL('image/png');
}
