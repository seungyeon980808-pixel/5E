// Bounded native leader routes. Coordinates are data, never arbitrary SVG commands.
export function normalizeLeaderRoutes(value, normalized = true) {
  if (!Array.isArray(value) || !value.length || value.length > 13) return null;
  const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && (!normalized || p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1) ? {x:p.x,y:p.y} : null;
  const result = [];
  for (const r of value) {
    if (!r || !['straight','polyline','quadratic','cubic'].includes(r.kind) || !['label','frame'].includes(r.attachment) || !['none','open-arrow','filled-arrow','circle'].includes(r.end)) return null;
    const start=point(r.start), target=point(r.target), controls=Array.isArray(r.controls)?r.controls.map(point):[];
    const count={straight:0,quadratic:1,cubic:2}[r.kind];
    if (!start || !target || controls.some(p=>!p) || (r.kind==='polyline' ? controls.length<1 || controls.length>12 : controls.length!==count)) return null;
    if (r.controls !== undefined && !Array.isArray(r.controls)) return null;
    if (r.endRadius !== undefined && (!Number.isFinite(r.endRadius) || r.endRadius <= 0 || r.endRadius > (normalized ? .05 : 100))) return null;
    result.push({...(r.endRadius !== undefined ? {endRadius:r.endRadius} : {}),kind:r.kind,attachment:r.attachment,end:r.end,start,target,controls});
  }
  return result;
}
export function mapLeaderRoutes(routes, map) {
  return routes.map(r=>{ const target=map(r.target); const radius=r.endRadius;
    const scaled=radius===undefined?{}:{endRadius:Math.hypot(map({x:r.target.x+radius,y:r.target.y}).x-target.x,map({x:r.target.x+radius,y:r.target.y}).y-target.y)};
    return {...r,...scaled,start:map(r.start),target,controls:r.controls.map(map)}; });
}
export function leaderRoutePoints(routes) { return (routes||[]).flatMap(r=>[r.start,...r.controls,r.target]); }
// Route observations remain immutable. A label attachment is a projection of
// today's native glyph block, not the source image's independently sized text.
export function attachLeaderRoutesToLabel(routes, { center, w, h, rotation = 0, gap = 0 }) {
  const angle = rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const hw = w / 2 + gap, hh = h / 2 + gap;
  return (routes || []).map(route => {
    let start = { ...route.start };
    if (route.attachment === 'label') {
      // A repeated control at the label center has no direction. Use the first
      // following observed point; never manufacture or relocate a target.
      const toward = [...route.controls, route.target, route.start]
        .find(point => Math.hypot(point.x - center.x, point.y - center.y) > 1e-9);
      if (toward) {
        const dx = toward.x - center.x, dy = toward.y - center.y;
        const lx = c * dx + s * dy, ly = -s * dx + c * dy;
        const scale = Math.min(Math.abs(lx) > 1e-9 ? hw / Math.abs(lx) : Infinity,
          Math.abs(ly) > 1e-9 ? hh / Math.abs(ly) : Infinity);
        start = { x: center.x + dx * scale, y: center.y + dy * scale };
      } else start = { ...center };
    }
    return { ...route, start, target: { ...route.target }, controls: route.controls.map(point => ({ ...point })) };
  });
}
export function leaderPath(r) {
  const p=v=>`${v.x} ${v.y}`;
  return `M ${p(r.start)} `+(r.kind==='quadratic'?`Q ${p(r.controls[0])} ${p(r.target)}`:r.kind==='cubic'?`C ${p(r.controls[0])} ${p(r.controls[1])} ${p(r.target)}`:[...r.controls,r.target].map(v=>`L ${p(v)}`).join(' '));
}
export function sampleLeaderRoute(r, steps=64) {
  if (r.kind==='straight'||r.kind==='polyline') return [r.start,...r.controls,r.target];
  return Array.from({length:steps+1},(_,i)=>{const t=i/steps,u=1-t,a=r.start,b=r.controls[0],c=r.kind==='cubic'?r.controls[1]:r.target,d=r.target;
    return r.kind==='quadratic'?{x:u*u*a.x+2*u*t*b.x+t*t*c.x,y:u*u*a.y+2*u*t*b.y+t*t*c.y}:{x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y};});
}
export function renderLeaderRoutes(g, routes, {color,sw,applyDash,obj}) {
  const ns='http://www.w3.org/2000/svg';
  const add=(tag,attrs)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);g.appendChild(e);return e;};
  for(const r of routes){const path=add('path',{d:leaderPath(r),fill:'none',stroke:color,'stroke-width':sw,'stroke-linecap':'round','stroke-linejoin':'round','data-label-leader-route':r.kind});applyDash(path,obj);
    const last=r.controls.at(-1)||r.start,dx=r.target.x-last.x,dy=r.target.y-last.y,len=Math.hypot(dx,dy),size=Math.max(.8,sw*4);
    if(r.end==='circle'){add('circle',{cx:r.target.x,cy:r.target.y,r:r.endRadius||size*.55,fill:'white',stroke:color,'stroke-width':sw});continue;}
    if(!len||r.end==='none')continue;
    const ux=dx/len,uy=dy/len,a={x:r.target.x-size*ux+size*.45*uy,y:r.target.y-size*uy-size*.45*ux},b={x:r.target.x-size*ux-size*.45*uy,y:r.target.y-size*uy+size*.45*ux};
    add('path',{d:`M ${a.x} ${a.y} L ${r.target.x} ${r.target.y} L ${b.x} ${b.y}`+(r.end==='filled-arrow'?' Z':''),fill:r.end==='filled-arrow'?color:'none',stroke:color,'stroke-width':sw,'stroke-linejoin':'round'});
  }
}
