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
  const border=[...outside].filter(i=>!search.ringIgnore?.has(i));
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
// 11-09 라벨 안정화: AI 탐색 상자가 글자를 비켜 가거나(테두리가 구조선·글자를 지남) AI가 「삭제 가능성」만 보류한 글자 라벨은
// AI가 본 글자 자리(typography.bounds)를 씨앗으로 실제 글자 잉크를 다시 찾아 좁은 탐색 상자를 만든다. 지울 권한은 그대로
// 아래 픽셀 검사(닫힌 단색 테두리·고립 잉크·대비·긴 선 없음)가 준다. 원문·소속·구조가 불확실한 라벨, 지시선 라벨,
// 여러 줄 라벨, 큰 상자는 다시 찾지 않는다.
const glyphWeight=ch=>/[\uAC00-\uD7A3\u3260-\u327F\u2460-\u2473]/.test(ch)?1:/[\u3131-\u318E\u2160-\u217F]/.test(ch)?.8
  :/[A-Za-z0-9]/.test(ch)?.65:/[\u2070-\u209C]/.test(ch)?.4:/\s/.test(ch)?.3:.45;
// 11-09 라벨 안정화(동그라미 글자): 시험지 그림의 ㉠·㉡·ⓐ 같은 동그라미 글자를 AI는 보통 글자(ㄱ·ㄴ·a)로 읽는다. 고리 안의 한 글자 라벨은
// 고리까지 그 글자의 획이므로 함께 지우고 동그라미 글자로 복원한다. 대문자·숫자는 고리 안에 있어도 물체(공·입자)일 수 있어 바꾸지 않는다.
const CIRCLED_BASE=new Map([...[...'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ'].map((c,i)=>[c,String.fromCharCode(0x3260+i)]),
  ...[...'가나다라마바사아자차카타파하'].map((c,i)=>[c,String.fromCharCode(0x326E+i)]),...[...'abcdefghijklmnopqrstuvwxyz'].map((c,i)=>[c,String.fromCharCode(0x24D0+i)])]);
const CIRCLED_TEXT=new Set(CIRCLED_BASE.values());
export function circledLabelText(text) {const t=String(text||'').trim();return CIRCLED_TEXT.has(t)?t:CIRCLED_BASE.get(t)||null;}
// 11-09 라벨 안정화: AI가 준 보호·불확실 상자 가운데, 다시 찾은 글자(글자 덩어리만 지움)를 막아야 하는 것은 「소속이 불확실한 픽셀」과
// 그림 일부를 가리키는 보호 상자뿐이다. 다른 라벨의 원문·지우기 불확실, 경로·배치 불확실은 그 라벨·그 경로의 일이고(AI가 라벨마다 넉넉한
// 상자를 줘 이웃 글자를 막았다), 그림 넓이의 절반 넘게 덮는 보호 상자는 어느 픽셀이 구조인지 알려 주지 않는다.
const ownershipUncertainty=u=>!u.domain || u.domain==='ownership';
const informativeProtected=r=>!(boundsOK(r?.bounds) && r.bounds.w*r.bounds.h>.5);
export function localTextSearchFromGlyphInk({data,width,height,label,plan}={}) {
  const t=label?.typography?.bounds,raw=String(label?.text||''),text=raw.replace(/[_^]\{([^{}]*)\}/g,'$1');
  if(!boundsOK(t) || !text.trim() || /\n/.test(raw) || t.h>.6 || t.w>.8 || t.h*height>160) return {rejected:'unsupported-observed-text-box'};
  const tx0=t.x*width,ty0=t.y*height,tx1=(t.x+t.w)*width,ty1=(t.y+t.h)*height,th=ty1-ty0,tw=tx1-tx0;
  if(th<6) return {rejected:'observed-text-too-small'};
  const pad=Math.max(6,Math.round(th));
  const ex0=Math.max(0,Math.floor(tx0-pad-tw*.5)),ey0=Math.max(0,Math.floor(ty0-pad)),ex1=Math.min(width,Math.ceil(tx1+pad+tw*.5)),ey1=Math.min(height,Math.ceil(ty1+pad));
  const ew=ex1-ex0,eh=ey1-ey0;
  if(ew<4 || eh<4) return {rejected:'observed-text-too-small'};
  const ring=[];
  for(let x=ex0;x<ex1;x++) ring.push(ey0*width+x,(ey1-1)*width+x);
  for(let y=ey0;y<ey1;y++) ring.push(y*width+ex0,y*width+ex1-1);
  if(ring.some(i=>data[i*4+3]!==255)) return {rejected:'transparent-pixels'};
  const med=k=>{const a=ring.map(i=>data[i*4+k]).sort((p,q)=>p-q);return a[Math.floor(a.length/2)];};
  const bg=[med(0),med(1),med(2),255],isInk=i=>data[i*4+3]!==255 || rgbaDistance(data,i*4,bg)>48;
  const seen=new Int32Array(ew*eh).fill(-1),comps=[];
  for(let y=ey0;y<ey1;y++) for(let x=ex0;x<ex1;x++) {
    const li=(y-ey0)*ew+x-ex0;
    if(seen[li]>=0 || !isInk(y*width+x)) continue;
    const id=comps.length,c={x0:x,y0:y,x1:x,y1:y,n:0,edge:false},stack=[li];seen[li]=id;
    while(stack.length) {
      const k=stack.pop(),cx=ex0+k%ew,cy=ey0+Math.floor(k/ew);c.n++;
      if(cx<c.x0)c.x0=cx;if(cx>c.x1)c.x1=cx;if(cy<c.y0)c.y0=cy;if(cy>c.y1)c.y1=cy;
      if(cx===ex0 || cy===ey0 || cx===ex1-1 || cy===ey1-1) c.edge=true;
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
        const nx=cx+dx,ny=cy+dy;
        if((!dx&&!dy) || nx<ex0 || ny<ey0 || nx>=ex1 || ny>=ey1) continue;
        const nk=(ny-ey0)*ew+nx-ex0;
        if(seen[nk]<0 && isInk(ny*width+nx)) {seen[nk]=id;stack.push(nk);}
      }
    }
    comps.push(c);
  }
  // 넓힌 영역 테두리까지 이어진 덩어리는 구조선이다(글자가 거기에 붙어 있으면 그 글자는 다시 찾지 않는다).
  let inner=comps.filter(c=>!c.edge);const hOf=c=>c.y1-c.y0+1;
  // 점선·파선: 크기가 비슷한 작은 덩어리가 같은 줄에 고르게 4개 이상 늘어서 있으면 선의 조각이다 — 글자로 묶거나 붙이지 않는다.
  // 곡선(점선 호)도 잡도록: 크기가 비슷한 작은 덩어리끼리 조각 크기의 4배 안에 이어져 4개 이상 사슬을 이루면 선의 조각으로 본다.
  {const small=inner.filter(c=>hOf(c)<=th*.3 && c.x1-c.x0+1<=th*.6),dotted=new Set();
   const cx=c=>(c.x0+c.x1)/2,cy=c=>(c.y0+c.y1)/2,sz=c=>Math.max(hOf(c),c.x1-c.x0+1);
   const near=(a,o)=>a!==o && Math.abs(hOf(o)-hOf(a))<=2 && Math.abs((o.x1-o.x0)-(a.x1-a.x0))<=3 && Math.hypot(cx(o)-cx(a),cy(o)-cy(a))<=4*Math.max(sz(a),sz(o));
   const seenC=new Set();
   for(const c of small){if(seenC.has(c))continue;const chain=[c],stack=[c];seenC.add(c);
     while(stack.length){const k=stack.pop();for(const o of small)if(!seenC.has(o)&&near(k,o)){seenC.add(o);chain.push(o);stack.push(o);}}
     if(chain.length>=4) chain.forEach(o=>dotted.add(o));}
   if(dotted.size) inner=inner.filter(c=>!dotted.has(c));}
  // 한글 라벨: 한 글자 안에서 위아래로 쌓인 자모(「힘」의 ㅎ·ㅁ)는 한 덩어리로 묶는다 — 따로 두면 가장 큰 자모만 글자로 잡혀
  // 아래 받침이 남거나 글자 높이를 작게 잰다. 묶은 높이가 AI 글자 높이의 1.3배를 넘으면(글자 위 점·작은 원) 묶지 않는다.
  if(/[\uAC00-\uD7A3]/.test(text)) {
    for(let merged=true;merged;) {
      merged=false;
      outer: for(let i=0;i<inner.length;i++) for(let j=i+1;j<inner.length;j++) {
        const a=inner[i],c=inner[j],xo=Math.min(a.x1,c.x1)-Math.max(a.x0,c.x0)+1,gap=Math.max(c.y0-a.y1,a.y0-c.y1);
        // AI가 본 글자 줄(위아래 0.15글자 여유) 안에 가운데가 있는 덩어리끼리만 묶는다(글자 위의 점·작은 원은 줄 밖).
        const inBand=o=>(o.y0+o.y1)/2>=ty0-th*.15 && (o.y0+o.y1)/2<=ty1+th*.15;
        if(!inBand(a) || !inBand(c)) continue;
        const u={x0:Math.min(a.x0,c.x0),y0:Math.min(a.y0,c.y0),x1:Math.max(a.x1,c.x1),y1:Math.max(a.y1,c.y1),edge:false,parts:[...(a.parts||[a]),...(c.parts||[c])]};
        if(xo>=Math.min(a.x1-a.x0+1,c.x1-c.x0+1)*.5 && gap<=th*.35 && hOf(u)<=th*1.3 && u.x1-u.x0+1<=th*1.3) {inner=inner.filter((_,k)=>k!==i&&k!==j);inner.push(u);merged=true;break outer;}
      }
    }
  }
  // 씨앗은 AI 글자 자리에 닿는 덩어리 가운데 글자 크기인 것만(글자를 둘러싼 상자·틀은 글자가 아니다).
  // 범례 기호(●▲■)처럼 속이 찬 덩어리, 화살표·막대처럼 가로로 긴 덩어리는 글자가 아니다(원문에 그런 기호·긴 줄표가 있으면 예외).
  const symbolText=/[●▲■◆▼►◀★◎※]/.test(text),wideText=/[—–→←↔⟶~]/.test(text);
  const glyphLike=c=>{const w=c.x1-c.x0+1,h=hOf(c),fill=(c.parts||[c]).reduce((s,p)=>s+(p.n||0),0)/(w*h);
    if(!symbolText && fill>.66 && w>3 && h>3 && w/h<2 && h/w<2) return false;
    if(!wideText && w/h>2.2 && h>=4) return false;
    return true;};
  inner=inner.filter(glyphLike);
  const seeds=inner.filter(c=>c.x1>=tx0-th*.25 && c.x0<=tx1+th*.25 && c.y1>=ty0-th*.25 && c.y0<=ty1+th*.25 && hOf(c)<=th*1.3 && c.x1-c.x0+1<=tw+th*2);
  if(!seeds.length) return {rejected:'no-glyph-at-observed-position'};
  const H=Math.max(...seeds.map(hOf));
  if(H<5) return {rejected:'glyph-too-small'};
  // 가장 큰 글자 덩어리의 줄 높이에 절반 이상 걸치는 것만 같은 줄의 글자로 본다(글자 바로 위·아래의 점·작은 원 표시는 글자가 아니다).
  const main=seeds.find(c=>hOf(c)===H),onLine=c=>Math.min(main.y1,c.y1)-Math.max(main.y0,c.y0)+1>=hOf(c)*.5;
  const big=c=>hOf(c)>=H*.4,chosen=new Set();let box=null;
  const add=c=>{chosen.add(c);box=box?{x0:Math.min(box.x0,c.x0),y0:Math.min(box.y0,c.y0),x1:Math.max(box.x1,c.x1),y1:Math.max(box.y1,c.y1)}:{x0:c.x0,y0:c.y0,x1:c.x1,y1:c.y1};};
  seeds.filter(c=>big(c) && onLine(c)).forEach(add);
  if(!box) return {rejected:'no-text-sized-glyph'};
  // 같은 줄의 이웃 글자(글자 사이 0.6H 안)를 차례로 더한다 — AI 자리가 한 글자쯤 비켜 있어도 라벨 글자 전체를 잡는다.
  for(let grew=true;grew;) {
    grew=false;
    for(const c of inner) {
      if(chosen.has(c) || !big(c) || !onLine(c) || hOf(c)>H*1.25) continue;
      const overlap=Math.min(box.y1,c.y1)-Math.max(box.y0,c.y0)+1,gap=Math.max(c.x0-box.x1,box.x0-c.x1);
      if(overlap>=hOf(c)*.5 && gap<=H*.6) {add(c);grew=true;}
    }
  }
  // 작은 덩어리(받침·점·쌍점)는 글자 줄 상자 안에 있을 때만 붙인다. 첨자·앞뒤 부호는 라벨 원문에 있을 때만 옆의 것을 붙인다
  // (루이스 점, 글자 옆 위치 점처럼 글자 밖의 작은 구조는 그대로 둔다).
  const line={...box},script=/[\u2070-\u209C]|[_^]\{/.test(raw),lead=/^[(\-−+:·.,]/.test(text.trim()),tail=/[)\-−+:·.,]$/.test(text.trim());
  for(const c of inner) {
    if(chosen.has(c)) continue;
    const inside=c.x0>=line.x0-1 && c.x1<=line.x1+1 && c.y0>=line.y0-1 && c.y1<=line.y1+1;
    const overlap=Math.min(line.y1,c.y1)-Math.max(line.y0,c.y0)+1;
    const right=c.x0>line.x1 && c.x0-line.x1<=H*.35,left=c.x1<line.x0 && line.x0-c.x1<=H*.35;
    if(inside || (script || tail) && right && overlap>=hOf(c)*.3 || lead && left && overlap>=hOf(c)*.5) add(c);
  }
  // 다른 덩어리를 둘러싸는 덩어리(틀·원 테두리)가 섞이면 글자만 가려낼 수 없다.
  const picked=[...chosen],encloses=(o,c)=>o.x0<c.x0 && o.x1>c.x1 && o.y0<c.y0 && o.y1>c.y1;
  // 동그라미 글자: 고른 글자 덩어리를 고리 하나가 둘러싸면 고리까지 이 글자의 획이다. 고리는 넓힌 영역 테두리에 닿지 않는 한 덩어리로,
  // 가로세로 비 0.8~1.25, 속이 비고(채움 0.45 미만), 네 모서리가 비어 있으며(네모 틀이 아님), 글자가 가운데(지름의 15% 안)에 지름의 0.35~0.85 크기로 있다.
  const circledTarget=circledLabelText(text);let circledText=null;
  if(circledTarget) {
    const glyphs=picked.filter(c=>!picked.some(o=>o!==c && encloses(c,o)));
    const g=glyphs.reduce((u,c)=>u?{x0:Math.min(u.x0,c.x0),y0:Math.min(u.y0,c.y0),x1:Math.max(u.x1,c.x1),y1:Math.max(u.y1,c.y1)}:{x0:c.x0,y0:c.y0,x1:c.x1,y1:c.y1},null);
    const ringShape=o=>{
      const ow=o.x1-o.x0+1,oh=o.y1-o.y0+1,D=Math.max(ow,oh),gs=Math.max(g.x1-g.x0+1,g.y1-g.y0+1);
      if(ow/oh<.8 || ow/oh>1.25 || o.n/(ow*oh)>=.45 || gs<D*.35 || gs>D*.85) return false;
      if(Math.abs(g.x0+g.x1-o.x0-o.x1)/2>D*.15 || Math.abs(g.y0+g.y1-o.y0-o.y1)/2>D*.15) return false;
      const id=comps.indexOf(o),k=Math.max(2,Math.round(D*.1));let corner=0;
      for(const [cx0,cy0] of [[o.x0,o.y0],[o.x1-k+1,o.y0],[o.x0,o.y1-k+1],[o.x1-k+1,o.y1-k+1]])
        for(let yy=cy0;yy<cy0+k;yy++) for(let xx=cx0;xx<cx0+k;xx++) if(seen[(yy-ey0)*ew+xx-ex0]===id) corner++;
      return corner<=4;
    };
    const ring=g && comps.filter(o=>!o.edge && encloses(o,g) && ringShape(o)).sort((p,q)=>(p.x1-p.x0)-(q.x1-q.x0))[0];
    if(ring && picked.every(c=>c===ring || glyphs.includes(c))) {
      chosen.clear();glyphs.forEach(c=>chosen.add(c));chosen.add(ring);
      box={x0:ring.x0,y0:ring.y0,x1:ring.x1,y1:ring.y1};circledText=circledTarget;
    }
  }
  if(!circledText && picked.some(o=>picked.some(c=>c!==o && encloses(o,c)))) return {rejected:'enclosing-frame'};
  // 글자 수에 맞는 너비여야 한다(일부만 잡거나 이웃 라벨·구조를 삼키지 않게).
  const weight=[...text].reduce((s,ch)=>s+glyphWeight(ch),0),bw=box.x1-box.x0+1,bh=box.y1-box.y0+1;
  if(!circledText && (bw<weight*H*.45 || bw>weight*H*1.35+H*.6)) return {rejected:bw<weight*H*.45?'glyphs-narrower-than-text':'glyphs-wider-than-text'};
  // 찾은 덩어리가 AI가 본 글자 상자보다 높이·너비 모두 절반도 안 되면(점선 조각·점이 씨앗이 된 경우) 글자가 아니다.
  if(H<th*.5 && bw<tw*.5) return {rejected:'glyph-much-smaller-than-observed'};
  for(const other of plan?.labels || []) {
    if(other===label || other.id===label.id || other.sourceRef!==1 || !boundsOK(other.typography?.bounds)) continue;
    const o=other.typography.bounds,iw=Math.min((o.x+o.w)*width,box.x1+1)-Math.max(o.x*width,box.x0),ih=Math.min((o.y+o.h)*height,box.y1+1)-Math.max(o.y*height,box.y0);
    if(iw>0 && ih>0 && iw*ih>bw*bh*.3) return {rejected:'other-label-overlap'};
  }
  const x=Math.max(0,box.x0-3),y=Math.max(0,box.y0-3),r=Math.min(width,box.x1+4),b=Math.min(height,box.y1+4);
  // 상자 근처를 지나는 다른 잉크(구조선·점)는 이 라벨 것이 아니다 — 그 픽셀과 1px 둘레는 지울 범위에서 빼고, 닫힌 테두리의 단색 판정에서도 뺀다.
  // 글자 덩어리는 그것과 떨어져 있어야 하며(붙어 있으면 위 덩어리 단계에서 글자로 고르지 않는다), 지우는 것은 여전히 검증된 글자 잉크뿐이다.
  const chosenIds=new Set([...chosen].flatMap(c=>(c.parts||[c]).map(p=>comps.indexOf(p)))),foreign=new Set();
  for(let yy=Math.max(ey0,y-2);yy<Math.min(ey1,b+2);yy++) for(let xx=Math.max(ex0,x-2);xx<Math.min(ex1,r+2);xx++) {
    const id=seen[(yy-ey0)*ew+xx-ex0];
    if(id<0 || chosenIds.has(id)) continue;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {const fx=xx+dx,fy=yy+dy;if(fx>=0 && fy>=0 && fx<width && fy<height) foreign.add(fy*width+fx);}
  }
  // 지울 수 있는 범위는 고른 글자 덩어리와 그 3px 둘레뿐 — 상자 안의 다른 옅은 잉크(점선 조각 끝 등)는 넣지 않는다.
  const corridor=new Set();
  for(let yy=Math.max(ey0,y);yy<Math.min(ey1,b);yy++) for(let xx=Math.max(ex0,x);xx<Math.min(ex1,r);xx++) {
    const id=seen[(yy-ey0)*ew+xx-ex0];
    if(id<0 || !chosenIds.has(id)) continue;
    for(let dy=-3;dy<=3;dy++) for(let dx=-3;dx<=3;dx++) {const fx=xx+dx,fy=yy+dy;if(fx>=x && fy>=y && fx<r && fy<b) corridor.add(fy*width+fx);}
  }
  return {bounds:{x:x/width,y:y/height,w:(r-x)/width,h:(b-y)/height},background:bg,foreignPixels:foreign,glyphPixels:corridor,glyphBounds:{x:box.x0/width,y:box.y0/height,w:bw/width,h:bh/height},...(circledText?{circledText}:{})};
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
  // 11-09 라벨 안정화(동그라미 글자): 고리 안 한 글자 라벨은 AI 탐색 상자(보통 글자만 감쌈)로 지우면 고리가 남는다 —
  // AI 탐색을 쓰지 않고 아래 다시 찾기 길(고리 포함)로만 지운다. 다시 찾기 조건(소속·원문 확실, 지시선 아님)은 그대로다.
  const circledLocal=new Map();
  for(const label of plan.labels || []) {
    if(label.sourceRef!==1 || label.scope!=='general' || label.ownershipReviewRequired || label.mode!=='text' || !circledLabelText(label.text)) continue;
    if((plan.uncertainties || []).some(u=>u.labelId===label.id && (u.domain!=='removal' || (u.component || 'text')!=='text')) || (plan.removalRegions || []).some(r=>r.labelId===label.id)) continue;
    const local=localTextSearchFromGlyphInk({data,width,height,label,plan});
    if(local.circledText) circledLocal.set(label.id,local);
  }
  const grouped=new Map();
  for(const r of plan.inkSearchRegions || []) {
    if(circledLocal.has(r.labelId)) continue;
    const label=plan.labels.find(l=>l.id===r.labelId && l.sourceRef===1 && l.scope==='general' && !l.ownershipReviewRequired);
    if(!label || r.sourceRef!==1 || r.ownership!=='confirmed' || !boundsOK(r.bounds) || !rgbaOK(r.background) || r.background[3]!==255 || !['text','leader','endpoint'].includes(r.component) || r.backgroundMode!==undefined && (r.backgroundMode!=='sample-flat' || r.component!=='text')) {issues.push({code:'unconfirmed-ink-search',id:r.id,labelId:r.labelId});continue;}
    let pixels;
    let edgePixels=null;
    if(r.component==='text') {
      const b=r.bounds; pixels=[];
      // 11-09: 글자 후보 상자가 그림 가장자리 줄까지 닿으면(손 X선 「A: X선」의 「:」 OCR 상자가 맨 아래 줄까지) 닫힌 바깥 테두리를
      // 잴 수 없어 글자 전체를 보류했다. 단색 표본 탐색만 가장자리에서 1px 안으로 당기고, 빠진 가장자리 줄은 아래에서 잉크가 없는지 확인한다.
      const inset=r.backgroundMode==='sample-flat'?1:0;edgePixels=inset?[]:null;
      for(let y=Math.floor(b.y*height);y<Math.min(height,Math.ceil((b.y+b.h)*height));y++) for(let x=Math.floor(b.x*width);x<Math.min(width,Math.ceil((b.x+b.w)*width));x++) {
        if(inset && (x===0 || y===0 || x===width-1 || y===height-1)) edgePixels.push(y*width+x); else pixels.push(y*width+x);
      }
    } else if(r.component==='leader' && r.kind==='path' || r.component==='endpoint' && r.kind==='ellipse') pixels=shapePixels(r,width,height);
    if(!pixels?.length || pixels.length>Math.min(200000,width*height*.2)) {issues.push({code:'invalid-ink-search-shape',id:r.id,labelId:r.labelId});continue;}
    const group=grouped.get(r.labelId)||[];group.push({...r,searchPixels:pixels,...(edgePixels?.length?{edgePixels}:{})});grouped.set(r.labelId,group);
  }
  const derive=(labelId,searches,uMask,issues,pMask=protectedMask)=>{
    const sampled=searches.some(r=>r.backgroundMode==='sample-flat');
    if(sampled && (searches.length!==1 || searches[0].component!=='text')) {issues.push({code:'unsupported-sampled-ink-search',id:labelId});return false;}
    const measured=sampled?sampleFlatTextBackground(data,searches[0],width,height):null;
    if(sampled && !measured) {issues.push({code:'non-flat-search-border',id:labelId});return false;}
    // 가장자리에서 뺀 줄에 실제 글자 잉크가 있으면 잘린 글자다 — 지우지 않고 그대로 보류한다(지울 범위는 넓어지지 않음).
    if(sampled && searches[0].edgePixels?.some(i=>data[i*4+3]!==255 || rgbaDistance(data,i*4,measured.background)>measured.inkTolerance)) {issues.push({code:'clipped-annotation-ink',id:labelId});return false;}
    const bg=measured?.background || searches[0].background;
    if(!sampled && searches.some(r=>!r.background.every((v,k)=>v===bg[k]))) {issues.push({code:'inconsistent-ink-background',id:labelId});return false;}
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
        if(pMask[i] || uMask[i]) {unsafe='protected-or-uncertain-ink';break;}
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
    if(unsafe || !ink.size || ink.size>allowed.size*.75) {issues.push({code:unsafe||(!ink.size?'empty-annotation-ink':'non-flat-annotation-search'),id:labelId});return false;}
    const labelRegions=[];
    for(const r of searches) {
      const pixels=r.searchPixels.filter(i=>ink.has(i));
      if(!pixels.length) {issues.push({code:'empty-annotation-component',id:r.id,labelId,component:r.component});continue;}
      const {searchPixels,...observation}=r;
      labelRegions.push({...observation,...(measured?{background:measured.background,backgroundTolerance:measured.backgroundTolerance,backgroundEvidence:{borderPixels:measured.borderPixels,method:'closed-near-flat-border'}}:{}),method:'flat-background',pixels});
    }
    if(labelRegions.length!==searches.length) return false;
    regions.push(...labelRegions);
    return true;
  };
  for(const [labelId, searches] of grouped) derive(labelId,searches,uncertainMask,issues);
  // 11-09 라벨 안정화: 글자 라벨의 탐색이 없거나(AI가 삭제 가능성만 보류) 실패했으면, 실제 글자 잉크로 다시 찾은 좁은 상자로
  // 같은 픽셀 검사를 한 번 더 한다. 이 라벨 자신의 「삭제 가능성」 보류 영역만 검사에서 빼고, 다른 불확실 영역·보호 영역은 그대로다.
  const localTextSearches=[],localTextSearchRejections=[],derivedIds=new Set(regions.map(r=>r.labelId));
  // 다시 찾은 글자의 픽셀 검사: 그림 절반 넘게 덮는 보호 상자는 빼고, 작은 보호 영역·보존 표식·그래프 라벨은 그대로 지킨다.
  const localProtected=new Uint8Array(width*height);
  addBounds(localProtected,[...(plan.protectedRegions || []).filter(informativeProtected),...(plan.preservedMarks || []),...(plan.excludedLabels || []).filter(l=>l.scope==='graph')],width,height);
  for(const label of plan.labels || []) {
    if(label.sourceRef!==1 || label.scope!=='general' || label.ownershipReviewRequired || label.mode!=='text' || derivedIds.has(label.id)) continue;
    const own=(plan.uncertainties || []).filter(u=>u.labelId===label.id);
    if(own.some(u=>u.domain!=='removal' || (u.component || 'text')!=='text')) continue;
    if((plan.removalRegions || []).some(r=>r.labelId===label.id)) continue;
    const local=circledLocal.get(label.id) || localTextSearchFromGlyphInk({data,width,height,label,plan});
    if(!local.bounds) {localTextSearchRejections.push({labelId:label.id,reason:local.rejected});continue;}
    const b=local.bounds,searchPixels=[],edgePixels=[];
    for(let y=Math.floor(b.y*height);y<Math.min(height,Math.ceil((b.y+b.h)*height));y++) for(let x=Math.floor(b.x*width);x<Math.min(width,Math.ceil((b.x+b.w)*width));x++) {
      const i=y*width+x;
      if(local.foreignPixels.has(i) || !local.glyphPixels.has(i)) continue;
      if(x===0 || y===0 || x===width-1 || y===height-1) edgePixels.push(i); else searchPixels.push(i);
    }
    const search={id:`local-text-${label.id}`,labelId:label.id,sourceRef:1,ownership:'confirmed',component:'text',bounds:{...b},background:local.background,
      backgroundMode:'sample-flat',origin:'local-glyph-ink',ringIgnore:local.foreignPixels,searchPixels,...(edgePixels.length?{edgePixels}:{})};
    const uMask=new Uint8Array(width*height);
    addBounds(uMask,(plan.uncertainties || []).filter(u=>u.labelId!==label.id && ownershipUncertainty(u)),width,height);
    const localIssues=[];
    if(!derive(label.id,[search],uMask,localIssues,localProtected)) localTextSearchRejections.push({labelId:label.id,reason:`pixel-check:${localIssues[0]?.code || 'failed'}`,bounds:{...b}});
    else {
      for(let k=issues.length-1;k>=0;k--) if(issues[k].id===label.id || issues[k].labelId===label.id) issues.splice(k,1);
      localTextSearches.push({labelId:label.id,bounds:{...b},glyphBounds:local.glyphBounds,...(local.circledText?{text:local.circledText}:{})});
    }
  }
  return {regions,issues,localTextSearches,localTextSearchRejections};
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
  // 다시 찾은 글자 영역(origin local-glyph-ink)은 소속 불확실·그림 일부 보호 상자만 막는다(위 ownershipUncertainty·informativeProtected).
  const localProtected=new Uint8Array(width*height),localUncertain=new Uint8Array(width*height);
  addBounds(localProtected,[...(plan.protectedRegions || []).filter(informativeProtected),...(plan.preservedMarks || []),...(plan.excludedLabels || []).filter(l=>l.scope==='graph')],width,height);
  addBounds(localUncertain,(plan.uncertainties || []).filter(ownershipUncertainty),width,height);
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
    const local=r.origin==='local-glyph-ink';
    if(pixels.some(i=>(local?localUncertain:uncertainMask)[i])) { issues.push({code:'uncertain-overlap',id:r.id,labelId:r.labelId}); continue; }
    const overlapsProtected=pixels.some(i=>(local?localProtected:protectedMask)[i]);
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
  // 실제 글자 잉크로 다시 찾아 픽셀로 확인한 라벨은, 그 라벨 자신의 「삭제 가능성」 보류가 풀린 것으로 본다(원문·소속·구조 보류는 그대로).
  const resolved=new Set((derived.localTextSearches || []).map(s=>s.labelId));
  const basePlan=resolved.size?{...plan,uncertainties:(plan.uncertainties || []).filter(u=>!(resolved.has(u.labelId) && u.domain==='removal' && (u.component || 'text')==='text'))}:plan;
  const derivedPlan=derived.regions.length && existingMaskValid?{...basePlan,removalMasks:{version:1,coordinateSpace:'source-pixels',width,height,regions:[...(plan.removalMasks?.version===1 && plan.removalMasks.width===width && plan.removalMasks.height===height ? plan.removalMasks.regions||[]:[]),...derived.regions],protectedPixels:plan.removalMasks?.protectedPixels||[],uncertainPixels:plan.removalMasks?.uncertainPixels||[]}}:plan;
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
  const result={data:output,width,height,appliedMask,appliedRegions,pending,removedLabelIds,deferredLabels,report:{derivedInkRegions:derived.regions.length,localTextSearches:derived.localTextSearches||[],localTextSearchRejections:derived.localTextSearchRejections||[],issues:issues.map(issue=>({...issue,message:describeExamRemovalIssue(issue,plan)})),outsideMaskChanged:0},calls:{localRestore:0,fullGeneration:0}};
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
      // 저장 검사는 지운 라벨 순서가 원본 계획 순서와 같아야 통과한다. 맨 뒤에 붙인 채 두면 저장마다 예외가 나 작업대가 멈췄다(H12).
      const order=new Map(plan.labels.map((label,i)=>[label.id,i]));
      result.removedLabelIds.sort((a,b)=>(order.get(a)??Infinity)-(order.get(b)??Infinity));
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
