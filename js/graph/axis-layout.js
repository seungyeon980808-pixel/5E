// Shared defaults and last-tick geometry. Explicit ticks remain authoritative;
// estimating a cell size must never replace their values or labels.
const finite = Number.isFinite;
const tidy = n => Number(n.toPrecision(10));

export function inferAxisStep(axis) {
  if (finite(axis.step) && axis.step > 0) return axis.step;
  const values = [...new Set((axis.ticks || []).map(t => t.value).filter(finite))].sort((a,b) => a-b);
  const gaps = values.slice(1).map((v,i) => v-values[i]).filter(v => v > 1e-9).sort((a,b) => a-b);
  const target = gaps.length ? gaps[Math.floor(gaps.length/2)] : (axis.max-axis.min)/5;
  if (!(target > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const nice = [1,2,2.5,5,10].map(v => v*magnitude).sort((a,b) => Math.abs(a-target)-Math.abs(b-target))[0];
  return tidy(!gaps.length || Math.abs(nice-target)/target < .04 ? nice : target);
}

export function axisTickBounds(plane, axis, ticks = plane[`explicitTicks${axis.toUpperCase()}`]) {
  const min=plane[`${axis}Min`], max=plane[`${axis}Max`], step=plane[`gridStep${axis.toUpperCase()}`] || 1;
  const values=(ticks || []).map(t => t.value).filter(v => finite(v) && v >= min-1e-9 && v <= max+1e-9);
  return {
    min: values.some(v => v < 0) ? Math.min(...values) : min < 0 ? Math.ceil(min/step)*step : min,
    max: values.some(v => v > 0) ? Math.max(...values) : Math.floor(max/step)*step,
    step,
  };
}

export function axisMargins(plane, axis, ticks) {
  const bounds=axisTickBounds(plane,axis,ticks);
  return { positive: tidy(Math.max(0,(plane[`${axis}Max`]-bounds.max)/bounds.step)),
    negative: tidy(Math.max(0,(bounds.min-plane[`${axis}Min`])/bounds.step)) };
}

// Some imports retain a rectangular grid as individual guides. Extend only a
// connected set of parallel guides with shared ends; a point's single
// projection, leader, or curve anchor must retain its position.
export function extendGuideGrid(annotations, plane, key, value) {
  if (plane.xScale === 'log' || plane.yScale === 'log') return annotations;
  const near=(a,b)=>Math.abs(a-b)<1e-7;
  const groups={horizontal:[],vertical:[]};
  for (const a of annotations) {
    if (a.kind !== 'guide' || a.axis === 'y2' || !a.to || ![a.x,a.y,a.to.x,a.to.y].every(finite)) continue;
    const horizontal=near(a.y,a.to.y),vertical=near(a.x,a.to.x);
    if (horizontal === vertical) continue;
    const kind=horizontal?'horizontal':'vertical',axis=horizontal?'x':'y';
    const lo=Math.min(a[axis],a.to[axis]),hi=Math.max(a[axis],a.to[axis]);
    let group=groups[kind].find(g=>near(g.lo,lo)&&near(g.hi,hi));
    if (!group) groups[kind].push(group={lo,hi,items:[]});
    group.items.push(a);
  }
  const candidates=[];
  const x=axisTickBounds(plane,'x'),y=axisTickBounds(plane,'y');
  for (const h of groups.horizontal) for (const v of groups.vertical) {
    const xs=v.items.map(a=>a.x),ys=h.items.map(a=>a.y);
    if (new Set(xs).size<2 || new Set(ys).size<2) continue;
    // The guides must cross each other and reach the outer ticks. Unrelated
    // projections and small rectangles elsewhere in the plot are excluded.
    if (h.lo>x.min+.02*x.step || h.hi<x.max-.02*x.step || v.lo>y.min+.02*y.step || v.hi<y.max-.02*y.step) continue;
    if (xs.some(n=>n<h.lo-.02*x.step || n>h.hi+.02*x.step) || ys.some(n=>n<v.lo-.02*y.step || n>v.hi+.02*y.step)) continue;
    candidates.push({h,v});
  }
  if (candidates.length !== 1) return annotations;
  const axis=key.includes('X')?'x':'y',negative=key.endsWith('Neg'),bounds=axis==='x'?x:y;
  const end=(negative?bounds.min-value*bounds.step:bounds.max+value*bounds.step);
  const items=new Set((axis==='x'?candidates[0].h:candidates[0].v).items);
  return annotations.map(a=>{
    if (!items.has(a)) return a;
    const startIsLow=a[axis]<a.to[axis],copy={...a,to:{...a.to}};
    if (negative === startIsLow) copy[axis]=tidy(end);else copy.to[axis]=tidy(end);
    return copy;
  });
}
