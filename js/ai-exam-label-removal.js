import { normalizeImageLabelWorkflow } from './ai-image-label-workflow.js?v=1.7.0-four-session-integration';

// A union of distant annotation masks must not turn local restoration into a full-image request.
export const EXAM_LOCAL_RESTORE_AREA_LIMIT = 0.5;

export function describeExamRemovalIssue(issue, plan) {
  if(issue.message) return issue.message;
  const label=plan.labels?.find(l=>l.id===(issue.labelId||issue.id));
  const subject=label?`‘${label.text}’ 라벨`: '라벨';
  const reasons={
    'label-removal-mask-missing':'제거할 글자 획이 검증되지 않아 원본을 유지했습니다.',
    'label-removal-component-missing':'지시선 또는 끝점 제거 영역이 확인되지 않아 원본을 유지했습니다.',
    'non-flat-search-border':'주변 배경이 단색으로 확인되지 않았습니다. 상자 경계·구조선과 겹치거나 탐색 영역이 부정확할 수 있습니다.',
    'protected-or-uncertain-ink':'글자 획이 보호 구조 또는 불확실한 영역과 겹쳐 지우지 않았습니다.',
    'ink-connected-outside-search':'글자 주변 획이 탐색 영역 밖의 구조와 연결되어 지우지 않았습니다.',
    'clipped-annotation-ink':'글자 획이 이미지 가장자리에서 잘려 지우지 않았습니다.',
    'unclassified-line-in-text-search':'글자 영역에 긴 선이 포함되어 과학 구조 보존을 위해 지우지 않았습니다.',
    'insufficient-text-contrast':'글자와 배경의 대비를 확인하지 못해 지우지 않았습니다.',
    'source-uncertainty':issue.reason || '원본 판독에 불확실한 부분이 남았습니다.',
  };
  return `${subject}: ${reasons[issue.code] || '제거 영역을 안전하게 확인하지 못했습니다.'}`;
}

const abort = signal => { if (signal?.aborted) { const e = new Error('기출 국소 제거가 취소되었습니다.'); e.name = 'AbortError'; e.code = 'AI_TURN_CANCELLED'; throw e; } };
const abortable = (promise, signal) => {
  if (!signal) return promise;
  abort(signal);
  return new Promise((resolve,reject) => {
    const onAbort=()=>{try {abort(signal);} catch(error) {reject(error);}};
    signal.addEventListener('abort',onAbort,{once:true});
    Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',onAbort));
  });
};
const dimensions = (w, h) => { if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0 || w * h > 40000000) throw new TypeError('잘못된 원본 픽셀 크기'); };
const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
const boundsOK = b => b && [b.x,b.y,b.w,b.h].every(Number.isFinite) && b.x >= 0 && b.y >= 0 && b.w > 0 && b.h > 0 && b.x+b.w <= 1.000001 && b.y+b.h <= 1.000001;
const rgbaOK = a => (Array.isArray(a) || ArrayBuffer.isView(a)) && a.length === 4 && Array.from(a).every(n => Number.isInteger(n) && n >= 0 && n <= 255);
const sameRGBA = (a, offset, b) => b.every((n, k) => a[offset + k] === n);
const rgbaDistance = (data, offset, bg) => Math.max(...bg.map((v,k)=>Math.abs(data[offset+k]-v)));
// Opt-in only: an observed, isolated text search may have compression noise.
// Measure its closed border, never infer deletion ownership from a label bbox.
function sampleFlatTextBackground(data, search, width, height) {
  const allowed = new Set(search.searchPixels), outside=new Set();
  for(const i of allowed) {
    const x=i%width,y=Math.floor(i/width);
    if(x===0 || y===0 || x===width-1 || y===height-1) return null;
    for(const neighbor of [i-1,i+1,i-width,i+width]) if(!allowed.has(neighbor)) outside.add(neighbor);
  }
  // The search perimeter may itself contain the last antialiased glyph pixel.
  // Measure the closed exterior ring; it grants no additional deletion pixels.
  const border=[...outside];
  if(border.length<12 || border.some(i=>data[i*4+3]!==255)) return null;
  const quantile=(a,q)=>a.sort((a,b)=>a-b)[Math.floor((a.length-1)*q)];
  const bg=[0,1,2].map(k=>quantile(border.map(i=>data[i*4+k]),.5)).concat(255);
  // Model colour is a sanity bound, not a replacement for measured pixels.
  if(bg.some((v,k)=>Math.abs(v-search.background[k])>32)) return null;
  const distances=border.map(i=>rgbaDistance(data,i*4,bg));
  if(quantile(distances,.9)>16 || Math.max(...distances)>32) return null;
  const b=search.bounds,midX=(b.x+b.w/2)*width,midY=(b.y+b.h/2)*height;
  const halves=[border.filter(i=>i%width<midX),border.filter(i=>i%width>=midX),border.filter(i=>Math.floor(i/width)<midY),border.filter(i=>Math.floor(i/width)>=midY)];
  if(halves.some(items=>items.length<3 || [0,1,2].some(k=>Math.abs(quantile(items.map(i=>data[i*4+k]),.5)-bg[k])>8))) return null;
  // The measured noise envelope separates faint/antialiased ink from background;
  // a fixed 20-level cutoff left genuine glyph edges outside the derived mask.
  const inkTolerance=Math.max(2,Math.max(...distances)+1);
  if(inkTolerance>24) return null;
  return {background:bg,backgroundTolerance:Math.max(20,quantile(distances,.9)+8),inkTolerance,borderPixels:border.length};
}
const inPolygon = (x,y,ps) => {
  let inside = false;
  for (let i=0,j=ps.length-1;i<ps.length;j=i++) {
    const a=ps[i],b=ps[j];
    if ((a.y>y)!==(b.y>y) && x < (b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
};
const segmentDistance = (x,y,a,b) => {
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy || 1)));
  return Math.hypot(x-a.x-t*dx,y-a.y-t*dy);
};
function shapePixels(region,width,height) {
  let test, box;
  if (region.kind === 'polygon' && Array.isArray(region.points) && region.points.length >= 3 && region.points.length <= 256 && region.points.every(point)) {
    const ps=region.points.map(p=>({x:p.x*width,y:p.y*height}));
    box={x:Math.min(...ps.map(p=>p.x)),y:Math.min(...ps.map(p=>p.y)),right:Math.max(...ps.map(p=>p.x)),bottom:Math.max(...ps.map(p=>p.y))};
    test=(x,y)=>inPolygon(x,y,ps);
  } else if (region.kind === 'path' && Array.isArray(region.points) && region.points.length >= 2 && region.points.length <= 256 && region.points.every(point) && Number.isFinite(region.width) && region.width > 0 && region.width <= .1) {
    const ps=region.points.map(p=>({x:p.x*width,y:p.y*height})),r=region.width*Math.min(width,height)/2;
    box={x:Math.min(...ps.map(p=>p.x))-r,y:Math.min(...ps.map(p=>p.y))-r,right:Math.max(...ps.map(p=>p.x))+r,bottom:Math.max(...ps.map(p=>p.y))+r};
    test=(x,y)=>ps.slice(1).some((p,i)=>segmentDistance(x,y,ps[i],p)<=r);
  } else if (region.kind === 'ellipse' && boundsOK(region.bounds)) {
    const b=region.bounds,cx=(b.x+b.w/2)*width,cy=(b.y+b.h/2)*height,rx=b.w*width/2,ry=b.h*height/2;
    box={x:b.x*width,y:b.y*height,right:(b.x+b.w)*width,bottom:(b.y+b.h)*height};
    test=(x,y)=>((x-cx)/rx)**2+((y-cy)/ry)**2<=1;
  } else return null;
  const pixels=[];
  for(let y=Math.max(0,Math.floor(box.y));y<Math.min(height,Math.ceil(box.bottom));y++)
    for(let x=Math.max(0,Math.floor(box.x));x<Math.min(width,Math.ceil(box.right));x++) if(test(x+.5,y+.5)) pixels.push(y*width+x);
  return pixels;
}
function addBounds(mask,items,width,height) {
  for(const item of items || []) {
    if (item.sourceRef != null && item.sourceRef !== 1) continue;
    const b=item.bounds || item.bbox;
    if(!boundsOK(b)) continue;
    for(let y=Math.floor(b.y*height);y<Math.min(height,Math.ceil((b.y+b.h)*height));y++)
      for(let x=Math.floor(b.x*width);x<Math.min(width,Math.ceil((b.x+b.w)*width));x++) mask[y*width+x]=1;
  }
}
/** Confirmed search boxes locate ink; only bounded, isolated components become masks.
 * Any connected ink escaping the declared owned union defers the whole label.
 * Legacy regions require exact background matching. sample-flat text regions
 * additionally require a closed, measured near-flat border and strong ink.
 */
export function deriveExamAnnotationInkMasks({data,width,height,plan}={}) {
  dimensions(width,height);
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray) || data.length!==width*height*4) throw new TypeError('RGBA 원본이 필요합니다.');
  const protectedMask=new Uint8Array(width*height),uncertainMask=new Uint8Array(width*height),issues=[],regions=[];
  addBounds(protectedMask,[...(plan.protectedRegions||[]),...(plan.preservedMarks||[]),...(plan.excludedLabels||[]).filter(l=>l.scope==='graph')],width,height);
  addBounds(uncertainMask,plan.uncertainties,width,height);
  const grouped=new Map();
  for(const r of plan.inkSearchRegions || []) {
    const label=plan.labels.find(l=>l.id===r.labelId && l.sourceRef===1 && l.scope==='general' && !l.ownershipReviewRequired);
    if(!label || r.sourceRef!==1 || r.ownership!=='confirmed' || !boundsOK(r.bounds) || !rgbaOK(r.background) || r.background[3]!==255 || !['text','leader','endpoint'].includes(r.component) || r.backgroundMode!==undefined && (r.backgroundMode!=='sample-flat' || r.component!=='text')) {issues.push({code:'unconfirmed-ink-search',id:r.id,labelId:r.labelId});continue;}
    let pixels;
    if(r.component==='text') {
      const b=r.bounds; pixels=[];
      for(let y=Math.floor(b.y*height);y<Math.min(height,Math.ceil((b.y+b.h)*height));y++) for(let x=Math.floor(b.x*width);x<Math.min(width,Math.ceil((b.x+b.w)*width));x++) pixels.push(y*width+x);
    } else if(r.component==='leader' && r.kind==='path' || r.component==='endpoint' && r.kind==='ellipse') pixels=shapePixels(r,width,height);
    if(!pixels?.length || pixels.length>Math.min(200000,width*height*.2)) {issues.push({code:'invalid-ink-search-shape',id:r.id,labelId:r.labelId});continue;}
    const group=grouped.get(r.labelId)||[];group.push({...r,searchPixels:pixels});grouped.set(r.labelId,group);
  }
  for(const [labelId, searches] of grouped) {
    const sampled=searches.some(r=>r.backgroundMode==='sample-flat');
    if(sampled && (searches.length!==1 || searches[0].component!=='text')) {issues.push({code:'unsupported-sampled-ink-search',id:labelId});continue;}
    const measured=sampled?sampleFlatTextBackground(data,searches[0],width,height):null;
    if(sampled && !measured) {issues.push({code:'non-flat-search-border',id:labelId});continue;}
    const bg=measured?.background || searches[0].background;
    if(!sampled && searches.some(r=>!r.background.every((v,k)=>v===bg[k]))) {issues.push({code:'inconsistent-ink-background',id:labelId});continue;}
    const strongInk=i=>data[i*4+3]!==255 || rgbaDistance(data,i*4,bg)>Math.max(20,measured?.backgroundTolerance||0);
    const isInk=i=>{
      if(!sampled) return !sameRGBA(data,i*4,bg);
      if(strongInk(i)) return true;
      if(rgbaDistance(data,i*4,bg)<=measured.inkTolerance) return false;
      // Weak antialias pixels need a neighboring observed core, not just a bbox.
      const x=i%width,y=Math.floor(i/width);
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
        if(x+dx>=0 && x+dx<width && y+dy>=0 && y+dy<height && strongInk((y+dy)*width+x+dx)) return true;
      }
      return false;
    };
    const allowed=new Set(searches.flatMap(r=>r.searchPixels)),ink=new Set([...allowed].filter(isInk)),visited=new Set();
    let unsafe=null;
    for(const seed of ink) {
      if(visited.has(seed)) continue;
      const stack=[seed],component=[];visited.add(seed);
      while(stack.length && !unsafe) {
        const i=stack.pop(),x=i%width,y=Math.floor(i/width);component.push(i);
        if(protectedMask[i] || uncertainMask[i]) {unsafe='protected-or-uncertain-ink';break;}
        // An edge-clipped component cannot establish a closed ownership boundary.
        if(x===0 || y===0 || x===width-1 || y===height-1) {unsafe='clipped-annotation-ink';break;}
        for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
          if(!dx&&!dy) continue;
          const j=(y+dy)*width+x+dx;
          if(!isInk(j)) continue;
          if(!allowed.has(j)) {unsafe='ink-connected-outside-search';break;}
          if(!visited.has(j)) {visited.add(j);stack.push(j);}
        }
      }
      if(unsafe) break;
      if(sampled && !component.some(i=>[0,1,2].reduce((s,k)=>s+bg[k]-data[i*4+k],0)/3>=Math.max(24,measured.inkTolerance*2))) {unsafe='insufficient-text-contrast';break;}
      if(searches.every(r=>r.component==='text')) {
        const xs=component.map(i=>i%width),ys=component.map(i=>Math.floor(i/width));
        const extent=a=>a.reduce((b,n)=>[Math.min(b[0],n),Math.max(b[1],n)],[Infinity,-Infinity]);
        const xb=extent(xs),yb=extent(ys),cw=xb[1]-xb[0]+1,ch=yb[1]-yb[0]+1;
        if(Math.max(cw/ch,ch/cw)>12 && Math.max(cw,ch)>8) {unsafe='unclassified-line-in-text-search';break;}
      }
    }
    if(unsafe || !ink.size || ink.size>allowed.size*.75) {issues.push({code:unsafe||(!ink.size?'empty-annotation-ink':'non-flat-annotation-search'),id:labelId});continue;}
    const labelRegions=[];
    for(const r of searches) {
      const pixels=r.searchPixels.filter(i=>ink.has(i));
      if(!pixels.length) {issues.push({code:'empty-annotation-component',id:r.id,labelId,component:r.component});continue;}
      const {searchPixels,...observation}=r;
      labelRegions.push({...observation,...(measured?{background:measured.background,backgroundTolerance:measured.backgroundTolerance,backgroundEvidence:{borderPixels:measured.borderPixels,method:'closed-near-flat-border'}}:{}),method:'flat-background',pixels});
    }
    if(labelRegions.length===searches.length) regions.push(...labelRegions);
  }
  return {regions,issues};
}
/** Observation boxes never grant erasure authority. Only explicit label-owned shapes do. */
export function buildExamLabelRemovalMasks(plan,width,height,workflow) {
  dimensions(width,height);
  const policy=normalizeImageLabelWorkflow(workflow || {imageKind:'exam',labelResult:'remove'}, {requireExplicit:true});
  if(policy.imageKind!=='exam') throw new TypeError('기출 픽셀 경로에 일반 이미지를 보낼 수 없습니다.');
  if (!plan || !Array.isArray(plan.labels)) throw new TypeError('원본 라벨 계획이 필요합니다.');
  const protectedMask=new Uint8Array(width*height),uncertainMask=new Uint8Array(width*height),mask=new Uint8Array(width*height),issues=[],regions=[];
  addBounds(protectedMask,[...(plan.protectedRegions || []),...(plan.preservedMarks || []),...(plan.excludedLabels || []).filter(l=>l.scope==='graph')],width,height);
  addBounds(uncertainMask,plan.uncertainties,width,height);
  const labels=new Map(plan.labels.filter(l=>l.scope==='general' && l.sourceRef===1 && !l.ownershipReviewRequired).map(l=>[l.id,l]));
  const raw=plan.removalMasks;
  const validRaw=raw?.version===1 && raw.coordinateSpace==='source-pixels' && raw.width===width && raw.height===height;
  if(raw && !validRaw) issues.push({code:'invalid-pixel-mask-frame'});
  for(const i of validRaw ? raw.protectedPixels || [] : []) if(Number.isInteger(i)&&i>=0&&i<mask.length) protectedMask[i]=1;
  for(const i of validRaw ? raw.uncertainPixels || [] : []) if(Number.isInteger(i)&&i>=0&&i<mask.length) uncertainMask[i]=1;
  const input=[...(Array.isArray(plan.removalRegions)?plan.removalRegions:[]),...(validRaw && Array.isArray(raw.regions)?raw.regions:[])];
  for(const r of input) {
    const owner=r.owner || 'label';
    if(!['label','auxiliary','scientific-arrow'].includes(owner) || owner==='label' && !labels.has(r.labelId) || (r.sourceRef != null && r.sourceRef !== 1) || !(r.ownership==='confirmed' || r.ownership==='label' && r.confirmed===true)) {
      issues.push({code:'unconfirmed-removal-region',id:r.id,labelId:r.labelId}); continue;
    }
    if(owner==='auxiliary' && policy.auxiliaryMarks!=='remove' || owner==='scientific-arrow' && policy.scientificArrows!=='remove') continue;
    let pixels;
    if(validRaw && raw.regions?.includes(r)) pixels=Array.isArray(r.pixels)&&r.pixels.every(i=>Number.isInteger(i)&&i>=0&&i<mask.length)?[...new Set(r.pixels)]:null;
    else pixels=shapePixels(r,width,height);
    if(!pixels?.length) { issues.push({code:'invalid-or-empty-removal-shape',id:r.id,labelId:r.labelId}); continue; }
    if(pixels.some(i=>uncertainMask[i])) { issues.push({code:'uncertain-overlap',id:r.id,labelId:r.labelId}); continue; }
    const overlapsProtected=pixels.some(i=>protectedMask[i]);
    const method=r.method==='local-restore'||overlapsProtected?'local-restore':'flat-background';
    regions.push({...r,pixels,method,overlapsProtected}); for(const i of pixels) mask[i]=1;
  }
  for(const label of labels.values()) {
    const owned=regions.filter(r=>r.labelId===label.id);
    if(!owned.length) issues.push({code:'label-removal-mask-missing',id:label.id});
    else for(const component of label.mode==='leader'?['text','leader','endpoint']:label.mode==='text'?['text']:[]) if(!owned.some(r=>r.component===component)) issues.push({code:'label-removal-component-missing',id:label.id,component});
  }
  for(const label of plan.labels.filter(l=>l.ownershipReviewRequired)) issues.push({code:'label-ownership-uncertain',id:label.id});
  for(const uncertainty of plan.uncertainties || []) issues.push({code:'source-uncertainty',id:uncertainty.id||uncertainty.labelId,labelId:uncertainty.labelId,reason:uncertainty.reason});
  return {mask,protectedMask,uncertainMask,regions,issues};
}
function flatBackground(data,region,width,height,allMask) {
  const ring=new Set();
  for(const i of region.pixels) {
    const x=i%width,y=Math.floor(i/width);
    for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx=x+dx,ny=y+dy,j=ny*width+nx;
      if(nx>=0 && nx<width && ny>=0 && ny<height && !allMask[j]) ring.add(j);
    }
  }
  if(ring.size < 3) return null;
  if(region.backgroundMode==='sample-flat') {
    if(region.backgroundEvidence?.method!=='closed-near-flat-border' || !Number.isFinite(region.backgroundTolerance) || region.backgroundTolerance>24 || !rgbaOK(region.background)) return null;
    return [...ring].every(i=>data[i*4+3]===255 && rgbaDistance(data,i*4,region.background)<=region.backgroundTolerance)?region.background:null;
  }
  const first=ring.values().next().value,bg=Array.from(data.slice(first*4,first*4+4));
  if(![...ring].every(i=>sameRGBA(data,i*4,bg))) return null;
  if(region.background !== undefined && (!rgbaOK(region.background)|| !bg.every((n,k)=>n===region.background[k]))) return null;
  return bg;
}
function updateRemovalReport(result,original) {
  for(const label of result.deferredLabels) for(const issue of result.report.issues) {
    if(issue.labelIds?.includes(label.labelId) && !label.reasons.some(r=>r.code===issue.code)) label.reasons.push({...issue});
  }
  result.mask=new Uint8Array(result.appliedMask);
  result.report.removedLabelIds=[...result.removedLabelIds];
  result.report.deferredLabels=result.deferredLabels;
  result.report.removalMasks={version:1,coordinateSpace:'source-pixels',width:result.width,height:result.height,
    regions:result.appliedRegions.map(r=>({id:r.id,labelId:r.labelId,owner:r.owner||'label',sourceRef:1,component:r.component,method:r.method,pixels:[...r.pixels]}))};
  result.report.status=result.deferredLabels.length || result.pending.length || result.report.issues.length
    ? result.removedLabelIds.length?'partial':'review' : 'complete';
  result.report.removalReadiness=result.report.status==='complete'?'pixel-verified':'needs-review';
  result.report.pendingRegions=result.pending.map(r=>r.id);
  result.report.changedPixels=result.appliedMask.reduce((sum,applied,i)=>sum+(applied && !sameRGBA(result.data,i*4,Array.from(original.subarray(i*4,i*4+4)))?1:0),0);
  result.report.unchanged=result.report.changedPixels===0;
}
/** Stage each label's entire owned union before committing any of its pixels. */
export function removeExamLabelPixels({data,width,height,plan,workflow,signal}={}) {
  abort(signal); dimensions(width,height);
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray) || data.length!==width*height*4) throw new TypeError('RGBA 원본이 필요합니다.');
  const derived=deriveExamAnnotationInkMasks({data,width,height,plan});
  const existingMaskValid=!plan.removalMasks || plan.removalMasks.version===1 && plan.removalMasks.coordinateSpace==='source-pixels' && plan.removalMasks.width===width && plan.removalMasks.height===height;
  const derivedPlan=derived.regions.length && existingMaskValid?{...plan,removalMasks:{version:1,coordinateSpace:'source-pixels',width,height,regions:[...(plan.removalMasks?.version===1 && plan.removalMasks.width===width && plan.removalMasks.height===height ? plan.removalMasks.regions||[]:[]),...derived.regions],protectedPixels:plan.removalMasks?.protectedPixels||[],uncertainPixels:plan.removalMasks?.uncertainPixels||[]}}:plan;
  const built=buildExamLabelRemovalMasks(derivedPlan,width,height,workflow),output=new Uint8ClampedArray(data),pending=[],appliedMask=new Uint8Array(width*height),issues=[...built.issues,...derived.issues];
  const groups=new Map(plan.labels.filter(l=>l.sourceRef===1 && l.scope==='general').map(l=>[l.id,[]]));
  for(const region of built.regions) {
    const key=(region.owner||'label')==='label'?region.labelId:region;
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(region);
  }
  // Shared pixels do not establish exclusive ownership, even if one owner defers.
  const owners=new Map();
  for(const [key,regions] of groups) for(const r of regions) for(const i of r.pixels) {
    if(owners.has(i) && owners.get(i)!==key) {
      for(const owner of [key,owners.get(i)]) if(!issues.some(issue=>issue.code==='overlapping-removal-owners' && issue.id===owner)) issues.push({code:'overlapping-removal-owners',id:owner});
    } else owners.set(i,key);
  }
  // A rejected label still owns its observed search footprint. A second label
  // must not delete that label's glyphs merely because its own extraction passed.
  for(const search of plan.inkSearchRegions || []) {
    if(search.sourceRef!==1 || !groups.has(search.labelId) || !boundsOK(search.bounds)) continue;
    let pixels;
    if(search.component==='text') {
      const b=search.bounds;pixels=[];
      for(let y=Math.floor(b.y*height);y<Math.min(height,Math.ceil((b.y+b.h)*height));y++) for(let x=Math.floor(b.x*width);x<Math.min(width,Math.ceil((b.x+b.w)*width));x++) pixels.push(y*width+x);
    } else pixels=shapePixels(search,width,height);
    for(const i of pixels || []) {
      const owner=owners.get(i);
      if(owner!==undefined && owner!==search.labelId) for(const id of [owner,search.labelId]) {
        if(!issues.some(issue=>issue.code==='overlapping-removal-owners' && issue.id===id)) issues.push({code:'overlapping-removal-owners',id});
      }
    }
  }
  const removedLabelIds=[],deferredLabels=[],appliedRegions=[];
  for(const [key,regions] of groups) {
    abort(signal);
    const label=typeof key==='string';
    const reasons=issues.filter(issue=>issue.labelId===key || issue.id===key || issue.code==='invalid-pixel-mask-frame').map(issue=>({...issue,message:describeExamRemovalIssue(issue,plan)}));
    if(reasons.length) {if(label) deferredLabels.push({labelId:key,reasons});continue;}
    const ownedMask=new Uint8Array(width*height);
    for(const r of regions) for(const i of r.pixels) ownedMask[i]=1;
    const backgrounds=regions.map(r=>r.method==='flat-background'?flatBackground(data,r,width,height,ownedMask):null);
    if(backgrounds.some(bg=>!bg)) {
      // Include already-flat companions in the same bounded restoration transaction.
      pending.push(...regions);
      if(label) deferredLabels.push({labelId:key,reasons:regions.filter((r,i)=>!backgrounds[i]).map(r=>({code:'label-component-needs-local-restore',id:r.id,labelId:key,component:r.component,message:describeExamRemovalIssue({labelId:key},plan)}))});
      continue;
    }
    regions.forEach((r,k)=>{for(const i of r.pixels) {output.set(backgrounds[k],i*4);appliedMask[i]=1;}});
    appliedRegions.push(...regions);
    if(label) removedLabelIds.push(key);
  }
  const result={data:output,width,height,appliedMask,appliedRegions,pending,removedLabelIds,deferredLabels,report:{derivedInkRegions:derived.regions.length,issues:issues.map(issue=>({...issue,message:describeExamRemovalIssue(issue,plan)})),outsideMaskChanged:0},calls:{localRestore:0,fullGeneration:0}};
  updateRemovalReport(result,data);
  return result;
}
/** One crop-only callback; it never receives or returns a full-frame regeneration. */
export async function restoreExamLabelPixels({data,width,height,plan,workflow,signal,localRestore}={}) {
  const result=removeExamLabelPixels({data,width,height,plan,workflow,signal});
  if(result.pending.length && typeof localRestore==='function') {
    abort(signal);
    const indices=[...new Set(result.pending.flatMap(r=>r.pixels))],xs=indices.map(i=>i%width),ys=indices.map(i=>Math.floor(i/width));
    // Reduce rather than spread large masks into function arguments.
    const x=xs.reduce((a,b)=>Math.min(a,b),width),y=ys.reduce((a,b)=>Math.min(a,b),height),right=xs.reduce((a,b)=>Math.max(a,b),0)+1,bottom=ys.reduce((a,b)=>Math.max(a,b),0)+1;
    const w=right-x,h=bottom-y,areaRatio=w*h/(width*height);
    if ((w===width && h===height) || areaRatio>=EXAM_LOCAL_RESTORE_AREA_LIMIT) {
      result.report.issues.push({code:'local-restore-region-too-large',labelIds:[...new Set(result.pending.map(r=>r.labelId).filter(Boolean))],reason:'분리된 제거 영역의 합집합이 국소 복원 한도를 초과하여 원본 전체 생성으로 처리하지 않았습니다.',crop:{x,y,width:w,height:h},source:{width,height},areaRatio,exclusiveAreaLimit:EXAM_LOCAL_RESTORE_AREA_LIMIT});
      updateRemovalReport(result,data);
      return result;
    }
    const crop=new Uint8ClampedArray(w*h*4),mask=new Uint8Array(w*h);
    for(let cy=0;cy<h;cy++) crop.set(data.subarray(((y+cy)*width+x)*4,((y+cy)*width+x+w)*4),cy*w*4);
    for(const i of indices) mask[(Math.floor(i/width)-y)*w+i%width-x]=1;
    result.calls.localRestore=1;
    try {
      const restored=await abortable(Promise.resolve().then(()=>localRestore({data:crop,width:w,height:h,mask:new Uint8Array(mask),origin:{x,y},signal,regions:result.pending.map(({pixels,...r})=>r),policy:'restore-label-owned-pixels-only; preserve-scientific-structure; no-global-generation'})),signal);
      abort(signal);
      if(!restored || restored.width!==w || restored.height!==h || !(restored.data instanceof Uint8ClampedArray || restored.data instanceof Uint8Array) || restored.data.length!==crop.length) throw new TypeError('국소 복원 결과의 픽셀 크기가 원본 영역과 다릅니다.');
      // A callback must explicitly report that it inspected remaining annotation and structure.
      if(restored.verified !== true) throw new Error('국소 복원의 잔여 주석·과학 구조 검증이 필요합니다.');
      for(let i=0;i<mask.length;i++) if(mask[i]) {
        const dest=(y+Math.floor(i/w))*width+x+i%w;
        result.data.set(restored.data.subarray(i*4,i*4+4),dest*4);result.appliedMask[dest]=1;
      }
      const restoredIds=new Set(result.pending.filter(r=>(r.owner||'label')==='label').map(r=>r.labelId));
      result.appliedRegions.push(...result.pending.map(r=>({...r,method:'local-restore'})));
      result.removedLabelIds.push(...restoredIds);
      result.deferredLabels=result.deferredLabels.filter(l=>!restoredIds.has(l.labelId));
      result.pending=[];
    } catch(error) {
      abort(signal);
      result.report.issues.push({code:'local-restore-failed',labelIds:[...new Set(result.pending.map(r=>r.labelId).filter(Boolean))],message:String(error.message||error)});
    }
  }
  abort(signal);
  updateRemovalReport(result,data);
  return result;
}
export async function removeExamLabelsFromDataUrl({dataUrl,plan,workflow,signal,localRestore}={}) {
  const p=normalizeImageLabelWorkflow(workflow,{requireExplicit:true});
  if(p.imageKind!=='exam') throw new TypeError('기출 원본 보존 경로에 일반 이미지를 보낼 수 없습니다.');
  abort(signal);
  if(typeof dataUrl!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl)) throw new TypeError('지원되는 원본 이미지 데이터가 필요합니다.');
  const image=new Image();
  await abortable(new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('원본 이미지를 읽을 수 없습니다.'));image.src=dataUrl;}),signal);
  abort(signal);const width=image.naturalWidth,height=image.naturalHeight;dimensions(width,height);
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
  const original=ctx.getImageData(0,0,width,height);
  const result=await restoreExamLabelPixels({data:original.data,width,height,plan,workflow:p,signal,localRestore});
  abort(signal);ctx.putImageData(new ImageData(result.data,width,height),0,0);
  // No changed pixels returns the original encoding too.
  const changed=result.data.some((v,i)=>v!==original.data[i]);
  const outputUrl=changed?canvas.toDataURL('image/png'):dataUrl;
  if(changed) {
    const check=new Image();
    await abortable(new Promise((resolve,reject)=>{check.onload=resolve;check.onerror=()=>reject(new Error('국소 제거 결과를 읽을 수 없습니다.'));check.src=outputUrl;}),signal);
    abort(signal);ctx.clearRect(0,0,width,height);ctx.drawImage(check,0,0);
    const decoded=ctx.getImageData(0,0,width,height).data;
    for(let i=0;i<decoded.length;i++) if(!result.mask[Math.floor(i/4)] && decoded[i]!==original.data[i]) throw new Error('기출 제거 마스크 밖의 픽셀이 변경되어 결과를 적용하지 않았습니다.');
  }
  return {dataUrl:outputUrl,width,height,removedLabelIds:result.removedLabelIds,deferredLabels:result.deferredLabels,mask:result.mask,appliedMask:result.appliedMask,report:result.report,calls:result.calls};
}
