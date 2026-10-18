// Keep quantities and units separate in the plan; store real line breaks in
// editable labels so preview, canvas and SVG export share the same typography.
export function descriptionAxisTitle(axis, which = 'y') {
  let caption = String(axis.displayTitle ?? axis.displayMath ?? axis.title ?? '').trim();
  const unit = String(axis.unit ?? '').trim();
  if (!unit) return caption;
  // Some plans redundantly include the same unit in the caption. Remove only
  // the declared unit, never guess that a function's argument is a unit.
  const escaped = [...unit].filter(c => !/\s/.test(c)).map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
  caption = caption.replace(new RegExp('\\s*[（(]\\s*' + escaped + '\\s*[)）]\\s*$'), '').trim();
  return [caption, `(${unit})`].filter(Boolean).join(which === 'x' ? '' : '\n');
}

// Artwork only: no data limits, ticks, observations or function values change.
// Titles stay below x / left of y, including interior axes. Fit an unusually
// wide title into the available margin instead of moving it across its axis.
export function descriptionTitleLayout({ which, right, top, axisX, axisY, viewport, width, height, gap, tickClearance = 0 }) {
  const availableWidth = which === 'x' ? viewport.right - viewport.left - 2 * gap : axisX - viewport.left - 2 * gap;
  const below = Math.max(gap, tickClearance);
  const availableHeight = which === 'x' ? viewport.bottom - axisY - below - gap : viewport.bottom - viewport.top - 2 * gap;
  const sizeScale = Math.min(1, Math.max(0, availableWidth) / Math.max(width, 1e-12), Math.max(0, availableHeight) / Math.max(height, 1e-12));
  const w = width * sizeScale, h = height * sizeScale;
  if (which === 'x') return {
    x: Math.max(viewport.left + gap + w / 2, Math.min(viewport.right - gap - w / 2, right)),
    y: axisY + below + h / 2, anchor: 'middle', sizeScale,
  };
  return { x: axisX - gap - w / 2, y: Math.max(viewport.top + gap + h / 2, top), anchor: 'middle', sizeScale };
}

// Converging curves often finish almost together. Place their names near
// separated interior peaks instead of printing two labels on the same tail.
// Returns artwork positions only; the series' sampled coordinates stay intact.
export function descriptionSeriesLabelPositions(series, size) {
  const named = series.filter(s => s.endLabel && s.points?.length > 2);
  const collided = new Set();
  for (let i=0;i<named.length;i++) for(let j=i+1;j<named.length;j++) {
    const a=named[i].points.at(-1),b=named[j].points.at(-1);
    if(Math.abs(a.x-b.x)<size*2 && Math.abs(a.y-b.y)<size*1.6) { collided.add(named[i]);collided.add(named[j]); }
  }
  const placed=[];
  for(const s of collided) {
    const peak=s.points.reduce((best,p)=>p.y<best.y?p:best,s.points[0]);
    const pos={series:s,x:peak.x+size*.8,y:peak.y-size*.75,to:{...peak}};
    while(placed.some(p=>Math.abs(p.x-pos.x)<size*3 && Math.abs(p.y-pos.y)<size*1.6))pos.y+=size*1.8;
    placed.push(pos);
  }
  return placed;
}

// Only move artwork. Never delete a requested tick or round its data value.
// Hand-positioned labels stay put; automatic labels can use another row.
export function descriptionTickLabelLanes(labels, gap) {
  const placed = [];
  const pinned = labels.filter(label=>label.pinned).map(label=>({...label,dy:0}));
  const row = Math.max(0, ...labels.map(label => label.height)) + gap;
  for (const label of [...labels].sort((a,b) => a.x-b.x)) {
    let dy = 0;
    const overlap = other => Math.abs(label.x-other.x) < (label.width+other.width)/2+gap
      && label.y+dy < other.y+other.dy+other.height+gap
      && label.y+dy+label.height+gap > other.y+other.dy;
    if (!label.pinned) while (placed.some(overlap) || pinned.some(overlap)) dy += row;
    placed.push({...label,dy});
  }
  return placed;
}
