import { worldFromMath, mathFromWorld, planeAsY2 } from '../function-graph/coords.js?v=1.7.0-four-session-integration';
import { sampleShapeSegment } from '../function-graph/shape-preserving.js?v=1.7.0-four-session-integration';

export const GRAPH_FEATURE_DEFAULTS = Object.freeze({ markerShape:'none', markerSize:0.8, lineVisible:true, regionFillLevel:220, regionOpacity:1 });
export function normalizedToMath(plane, q) {
  return mathFromWorld(plane,plane.x+q.x*plane.w,plane.y+(1-q.y)*plane.h);
}
// Return geometry or a visible error: unsupported areas must never become an
// unrelated polygon silently. Input specs always retain their coordinate space.
export function buildRegionGeometry(spec, plane, series = []) {
  const fail=error=>({ok:false,mathPoints:[],points:[],error});
  if (!spec || !plane) return fail('영역 설정과 좌표평면이 필요합니다.');
  if (spec.axis==='y2' && !plane.y2?.enabled) return fail('오른쪽 축이 없습니다.');
  const p=spec.axis==='y2'?planeAsY2(plane):plane;
  const normalized=spec.coordinateSpace==='normalized';
  const map=q=>normalized?normalizedToMath(p,q):{...q};
  const xmin=normalized?0:p.xMin,xmax=normalized?1:p.xMax,ymin=normalized?0:p.yMin,ymax=normalized?1:p.yMax;
  let raw;
  const rect=(a,b,c,d)=>[{x:a,y:c},{x:b,y:c},{x:b,y:d},{x:a,y:d}];
  if (spec.kind==='x-band') raw=rect(spec.from,spec.to,ymin,ymax);
  else if (spec.kind==='y-band') raw=rect(xmin,xmax,spec.from,spec.to);
  else if (spec.kind==='rect') raw=rect(spec.xMin,spec.xMax,spec.yMin,spec.yMax);
  else if (spec.kind==='polygon') raw=spec.points;
  else if (spec.kind==='between') {
    const find=id=>series.find(s=>s.id===id || s.reconstruction?.seriesId===id || s.seriesId===id);
    const sourceUpper=find(spec.upperSeriesId),sourceLower=find(spec.lowerSeriesId);
    const worldSeries=s=>{if(!s)return s;const pts=s.points || s.mathPoints.map(q=>worldFromMath(p,q.x,q.y));const hs=s.handles || s.mathPoints.map((q,i)=>{const h=s.handlesMath?.[i];if(!h)return null;const a=worldFromMath(p,q.x+h.ix,q.y+h.iy),b=worldFromMath(p,q.x+h.ox,q.y+h.oy);return {inX:a.x,inY:a.y,outX:b.x,outY:b.y};});return {...s,mathPoints:pts,handlesMath:hs.every(Boolean)?hs.map((h,i)=>({ix:h.inX-pts[i].x,iy:h.inY-pts[i].y,ox:h.outX-pts[i].x,oy:h.outY-pts[i].y})):[]};};
    const upper=worldSeries(sourceUpper),lower=worldSeries(sourceLower);
    if (!upper || !lower || sourceUpper===sourceLower) return fail('서로 다른 두 계열이 필요합니다.');
    if ([upper,lower].some(s=>(s.axis||'y')!==(spec.axis||'y') || s.breaks?.length || s.closed || !s.mathPoints?.length || s.mathPoints.some((q,i,a)=>i&&q.x<=a[i-1].x))) return fail('동일 축의 연속 증가 x 계열만 영역을 만들 수 있습니다.');
    if (!(Number.isFinite(spec.from)&&Number.isFinite(spec.to)&&spec.to>spec.from)) return fail('두 곡선의 공통 구간을 지정하십시오.');
    const from=worldFromMath(p,map({x:spec.from,y:ymin}).x,p.yMin).x,to=worldFromMath(p,map({x:spec.to,y:ymin}).x,p.yMin).x;
    if ([upper,lower].some(s=>from<s.mathPoints[0].x || to>s.mathPoints.at(-1).x)) return fail('두 계열의 공통 범위를 벗어났습니다.');
    const at=(s,x)=>{
      let i=s.mathPoints.findIndex((q,i,a)=>i<a.length-1&&x>=q.x&&x<=a[i+1].x);
      if (i<0) return null;
      let lo=0,hi=1;
      for(let n=0;n<40;n++){let t=(lo+hi)/2;const q=sampleShapeSegment(s.mathPoints,s.handlesMath||[],i,t,s.segmentModes||[]);if(q.x<x)lo=t;else hi=t;}
      return sampleShapeSegment(s.mathPoints,s.handlesMath||[],i,(lo+hi)/2,s.segmentModes||[]);
    };
    // Check control x monotonicity too: folded Beziers are not functions of x.
    for(const s of [upper,lower]) for(let i=0;i<s.mathPoints.length-1;i++) {
      if(!s.handlesMath?.length || s.segmentModes?.[i]==='line')continue;
      const a=s.mathPoints[i],b=s.mathPoints[i+1],c=a.x+s.handlesMath[i].ox,d=b.x+s.handlesMath[i+1].ix;
      if(c<a.x||d<c||d>b.x)return fail('x 방향으로 접히는 곡선은 영역을 만들 수 없습니다.');
    }
    // Include every anchor, even when a narrow feature falls between uniform
    // samples. Validate the complete displayed Bezier interval before filling.
    const xs=[...new Set([from,to,...Array.from({length:257},(_,i)=>from+(to-from)*i/256),...[upper,lower].flatMap(s=>s.mathPoints.map(q=>q.x).filter(x=>x>from&&x<to))])].sort((a,b)=>a-b);
    const epsilon=Math.max(1,p.h)*1e-9;
    const yBounds=(s,left,right)=>{
      const mid=(left+right)/2,i=s.mathPoints.findIndex((q,i,a)=>i<a.length-1&&mid>=q.x&&mid<=a[i+1].x);
      if(i<0)return null;
      const start=s.mathPoints[i],end=s.mathPoints[i+1];
      if(!s.handlesMath?.length || s.segmentModes?.[i]==='line') {
        const values=[left,right].map(x=>start.y+(end.y-start.y)*(x-start.x)/(end.x-start.x));return [Math.min(...values),Math.max(...values)];
      }
      const parameter=x=>{let lo=0,hi=1;for(let n=0;n<48;n++){const t=(lo+hi)/2,q=sampleShapeSegment(s.mathPoints,s.handlesMath,i,t,s.segmentModes||[]);if(q.x<x)lo=t;else hi=t;}return (lo+hi)/2;};
      const lo=parameter(left),hi=parameter(right),ys=[start.y,start.y+s.handlesMath[i].oy,end.y+s.handlesMath[i+1].iy,end.y];
      const A=-ys[0]+3*ys[1]-3*ys[2]+ys[3],B=2*(ys[0]-2*ys[1]+ys[2]),C=ys[1]-ys[0];
      const ts=[lo,hi];
      if(Math.abs(A)<1e-14){if(Math.abs(B)>1e-14)ts.push(-C/B);}else{const d=B*B-4*A*C;if(d>=0){ts.push((-B+Math.sqrt(d))/(2*A),(-B-Math.sqrt(d))/(2*A));}}
      const values=ts.filter(t=>t>=lo&&t<=hi).map(t=>{const u=1-t;return u*u*u*ys[0]+3*u*u*t*ys[1]+3*u*t*t*ys[2]+t*t*t*ys[3];});
      return [Math.min(...values),Math.max(...values)];
    };
    const sameGeometry=JSON.stringify([upper.mathPoints,upper.handlesMath,upper.segmentModes||[]])===JSON.stringify([lower.mathPoints,lower.handlesMath,lower.segmentModes||[]]);
    let checks=0;
    const ordered=(left,right,depth=0)=>{
      const mid=(left+right)/2;
      for(const x of [left,mid,right]){const a=at(upper,x),b=at(lower,x);if(!a||!b||a.y>b.y+epsilon)return false;}
      const a=yBounds(upper,left,right),b=yBounds(lower,left,right);
      if(!a||!b)return false;
      if(a[1]<=b[0]+epsilon)return true;
      // If neither curve varies by more than numerical tolerance here, any
      // unresolved crossing is below the coordinate precision of this graph.
      if(Math.max(a[1],b[1])-Math.min(a[0],b[0])<=epsilon)return true;
      if(depth>=40 || ++checks>20000 || mid===left || mid===right)return false;
      return ordered(left,mid,depth+1)&&ordered(mid,right,depth+1);
    };
    if(!sameGeometry)for(let i=0;i<xs.length-1;i++)if(!ordered(xs[i],xs[i+1]))return fail('위·아래 곡선이 교차하거나 순서를 확정할 수 없습니다.');
    const top=[],bottom=[];
    for(const x of xs){const a=at(upper,x),b=at(lower,x);if(!a||!b||a.y>b.y+epsilon)return fail('위·아래 곡선이 교차하거나 순서가 바뀝니다.');top.push({x,y:a.y});bottom.push({x,y:b.y});}
    const points=[...top,...bottom.reverse()],mathPoints=points.map(q=>mathFromWorld(p,q.x,q.y));
    return {ok:true,mathPoints,points};
  } else return fail('지원하지 않는 영역 종류입니다.');
  if(!Array.isArray(raw)||raw.length<3||raw.length>4096||raw.some(q=>!Number.isFinite(q?.x)||!Number.isFinite(q?.y)))return fail('유효한 영역 좌표가 필요합니다.');
  // Observed caption backgrounds can cross the plot border while remaining
  // inside the source image, just like their text and leaders. Do not clip them.
  const source = plane.reconstruction?.source, box = source?.plotBox;
  const sourceBounded = normalized && ['rect', 'polygon'].includes(spec.kind)
    && [source?.width, source?.height, box?.w, box?.h].every(v => Number.isFinite(v) && v > 0)
    && [box?.x, box?.y].every(Number.isFinite);
  const bounds = sourceBounded ? { xmin: -box.x / box.w, xmax: (source.width - box.x) / box.w,
    ymin: 1 - (source.height - box.y) / box.h, ymax: 1 + box.y / box.h } : { xmin, xmax, ymin, ymax };
  if(raw.some(q=>q.x<bounds.xmin||q.x>bounds.xmax||q.y<bounds.ymin||q.y>bounds.ymax))return fail('영역이 축 또는 원본 이미지 범위를 벗어났습니다.');
  if(spec.kind==='x-band'&&!(spec.to>spec.from)||spec.kind==='y-band'&&!(spec.to>spec.from)||spec.kind==='rect'&&!(spec.xMax>spec.xMin&&spec.yMax>spec.yMin))return fail('영역 범위는 증가해야 합니다.');
  const mathPoints=raw.map(map),points=mathPoints.map(q=>worldFromMath(p,q.x,q.y));
  if(points.some(q=>!Number.isFinite(q.x)||!Number.isFinite(q.y)))return fail('영역을 축에 배치할 수 없습니다.');
  return {ok:true,mathPoints,points};
}
