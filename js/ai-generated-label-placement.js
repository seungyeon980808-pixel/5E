import { EDITABLE_IMAGE_LABEL_PLAN_VERSION, freezeLabelPlan, parseEditableImageLabelPlan } from './ai-editable-image-labels.js?v=1.7.0-four-session-integration';
import { fontForLabelRole } from './ai-label-typography.js?v=1.7.0-four-session-integration';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const normalized = ({x,y}, w, h) => ({x:clamp(x/w, 0, 1), y:clamp(y/h, 0, 1)});
const world = ({x,y}, w, h) => ({x:x*w, y:y*h});
const dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
const roleFor = role => role === 'coef' ? 'quantity' : role;
const subscript = '₀₁₂₃₄₅₆₇₈₉';

function renderedText(text) {
  const normalRoman = text.replace(/[Ⅰ-Ⅻ]/gu, value => value.normalize('NFKC'));
  return normalRoman.replace(/_\{(\w+)\}|_(\w+)/g, (match, grouped, simple) => {
    const sub = grouped || simple;
    if (/^\d+$/.test(sub)) return Array.from(sub, n => subscript[Number(n)]).join('');
    return `_{${sub}}`;
  });
}

async function imagePixels(src) {
  const image = new Image();
  image.src = src;
  await image.decode();
  const scale = Math.min(1, 780/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas = document.createElement('canvas');
  const w = canvas.width = Math.max(1, Math.round(image.naturalWidth*scale));
  const h = canvas.height = Math.max(1, Math.round(image.naturalHeight*scale));
  const ctx = canvas.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle = 'white';
  ctx.fillRect(0,0,w,h);
  ctx.drawImage(image,0,0,w,h);
  const rgba = ctx.getImageData(0,0,w,h).data;
  const gray = new Uint8Array(w*h);
  for (let i=0;i<gray.length;i++) gray[i] = (77*rgba[4*i]+150*rgba[4*i+1]+29*rgba[4*i+2])>>8;
  return {ctx,gray,w,h};
}

function regionAt(gray,w,h,p) {
  let x0=clamp(Math.round(p.x),0,w-1), y0=clamp(Math.round(p.y),0,h-1);
  if (gray[y0*w+x0]<145) {
    const x=x0,y=y0;
    let seed=null;
    for (let r=1;r<9 && !seed;r++) {
      seed=[[x+r,y],[x-r,y],[x,y+r],[x,y-r]]
        .find(([sx,sy])=>sx>=0&&sx<w&&sy>=0&&sy<h&&gray[sy*w+sx]>=145);
    }
    if (!seed) return null;
    [x0,y0]=seed;
  }
  const origin=y0*w+x0, shade=gray[origin];
  const seen=new Uint8Array(w*h), todo=new Int32Array(w*h);
  todo[0]=origin; seen[origin]=1;
  let cursor=0,count=1,sx=0,sy=0,left=x0,right=x0,top=y0,bottom=y0;
  const push = k => {
    if (seen[k] || Math.abs(gray[k]-shade)>28 || gray[k]<132) return;
    seen[k]=1; todo[count++]=k;
  };
  while(cursor<count) {
    if (count>gray.length*.28) return null;
    const index=todo[cursor++], x=index%w, y=Math.floor(index/w);
    sx+=x; sy+=y;
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    if(x>0) push(index-1);
    if(x<w-1) push(index+1);
    if(y>0) push(index-w);
    if(y<h-1) push(index+w);
  }
  if (left===0 && right===w-1 && top===0 && bottom===h-1) return null;
  return { x:sx/count, y:sy/count, w:right-left+1, h:bottom-top+1 };
}

function outsideMask(gray,w,h) {
  // A coarse flood fill closes small gaps in a silhouette before looking for exterior whitespace.
  const step=4, width=Math.ceil(w/step), height=Math.ceil(h/step);
  const outside=new Uint8Array(width*height);
  for (let y=0;y<h;y++) for(let x=0;x<w;x++) {
    if(gray[y*w+x]>=225) continue;
    const cx=Math.floor(x/step), cy=Math.floor(y/step);
    for(let j=Math.max(0,cy-1);j<=Math.min(height-1,cy+1);j++) {
      for(let i=Math.max(0,cx-1);i<=Math.min(width-1,cx+1);i++) outside[j*width+i]=2;
    }
  }
  const queue=[];
  const push=(x,y)=>{
    const i=y*width+x;
    if(!outside[i]) { outside[i]=1; queue.push([x,y]); }
  };
  for(let x=0;x<width;x++) { push(x,0); push(x,height-1); }
  for(let y=0;y<height;y++) { push(0,y); push(width-1,y); }
  for(let i=0;i<queue.length;i++){
    const [x,y]=queue[i];
    if(x>0) push(x-1,y);
    if(x+1<width) push(x+1,y);
    if(y>0) push(x,y-1);
    if(y+1<height) push(x,y+1);
  }
  return (x,y)=>outside[Math.floor(y/step)*width+Math.floor(x/step)]===1;
}

function dimensionEnds(gray,w,h,p,fontPx) {
  let best=null;
  const radius=Math.floor(fontPx);
  for(const horizontal of [true,false]) {
    const center=Math.round(horizontal?p.x:p.y);
    const axis=Math.round(horizontal?p.y:p.x);
    const length=horizontal?w:h, breadth=horizontal?h:w;
    for(let screen=axis-radius;screen<=axis+radius;screen++){
      if(screen<0||screen>=breadth) continue;
      const dark=t=>gray[horizontal?screen*w+t:t*w+screen]<138;
      const limit=Math.ceil(fontPx*1.1);
      const trace=sign=>{
        let hit=null, count=0, gap=0;
        for(let t=center;t>=0&&t<length&&gap<=limit;t+=sign){
          if(dark(t)){hit=t;gap=0;count++;} else gap++;
        }
        return {hit,count};
      };
      const a=trace(-1),b=trace(1);
      if(a.hit===null || b.hit===null || a.count+b.count<fontPx*.8) continue;
      const score=a.count+b.count-Math.abs(screen-axis)*2;
      if(best && score<=best.score) continue;
      const at=t=>horizontal?{x:t,y:screen}:{x:screen,y:t};
      best={score,ends:[at(a.hit),at(b.hit)]};
    }
  }
  return best?.ends;
}

function crosses(a,b,c,d) {
  const cross = (p,q,r) => (q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  return cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0;
}

function buildPlacement({ctx,gray,w,h}, input) {
  const fontPx = Math.max(11, Math.min(w,h)*.062);
  const occupied=[], leaders=[];
  const isOutside = input.some(label=>label.kind==='leader') ? outsideMask(gray,w,h) : null;
  const darkness = (x,y) => gray[clamp(Math.round(y),0,h-1)*w+clamp(Math.round(x),0,w-1)];
  const inside = (p,tw,ph) => ({x:clamp(p.x,tw/2,w-tw/2),y:clamp(p.y,ph/2,h-ph/2)});
  const box = (p,tw,ph) => ({l:p.x-tw/2,r:p.x+tw/2,t:p.y-ph/2,b:p.y+ph/2});
  const clear = (p,tw,ph,white) => {
    const b=box(p,tw,ph);
    const clearance=fontPx*.13;
    if (b.l<0 || b.t<0 || b.r>=w || b.b>=h || occupied.some(o=>o.l<b.r&&o.r>b.l&&o.t<b.b&&o.b>b.t)) return false;
    if (white && isOutside && ![b.l,p.x,b.r].every(x=>[b.t,p.y,b.b].every(y=>isOutside(x,y)))) return false;
    for (let y=Math.ceil(b.t-clearance);y<b.b+clearance;y+=2) {
      for (let x=Math.ceil(b.l-clearance);x<b.r+clearance;x+=2) if (darkness(x,y)<(white?225:146)) return false;
    }
    return true;
  };
  const crossing = (a,b) => {
    if (leaders.some(([c,d])=>crosses(a,b,c,d))) return 1;
    let ink=0;
    for(let i=2;i<36;i++) {
      const t=i/40;
      if(darkness(b.x+(a.x-b.x)*t,b.y+(a.y-b.y)*t)<140) ink++;
    }
    return ink/34;
  };
  const search = (p,tw,ph,anchor=null) => {
    const center=inside(p,tw,ph);
    let best=null,bestScore=Infinity;
    const consider=position=>{
      if(!clear(position,tw,ph,!!anchor)) return;
      const score=dist(position,p)+(anchor ? crossing(anchor,position)*w : 0);
      if(score<bestScore){best=position;bestScore=score;}
    };
    consider(center);
    if(bestScore===0) return best;
    const step=Math.max(3,fontPx*.45);
    for(let distance=step;distance<=fontPx*5.5;distance+=step) {
      if(distance-step>bestScore) break;
      for(let angle=0;angle<Math.PI*2;angle+=Math.PI/8) consider({x:p.x+Math.cos(angle)*distance,y:p.y+Math.sin(angle)*distance});
    }
    return best || center;
  };
  const order={angle:0,dim:1,in:2,beside:3,leader:4};
  return [...input].sort((a,b)=>order[a.kind]-order[b.kind]).map(label=>{
    const text=renderedText(label.text);
    const role=roleFor(label.role);
    const font=fontForLabelRole(role);
    ctx.font = `${font.italic ? 'italic ' : ''}${fontPx}px ${font.fontFamily}`;
    const tw=Math.min(w*.96,ctx.measureText(text.replace(/[{}_]/g,'')).width+fontPx*.45);
    const ph=fontPx*1.15;
    const anchor=world(label.anchor,w,h);
    let p=world(label.position,w,h), size=fontPx, haloRatio=0;
    switch(label.kind) {
      case 'angle':
        p=inside(p,tw,ph);
        break;
      case 'dim': {
        const ends=label.ends?.map(end=>world(end,w,h)) || dimensionEnds(gray,w,h,p,fontPx);
        if (ends && dist(...ends)>2) {
          const [a,b]=ends, span=dist(a,b);
          p={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
          if(span<Math.max(fontPx*2.6,tw*1.6)){
            const nx=(b.y-a.y)/span, ny=(a.x-b.x)/span;
            const offset=Math.abs(nx)*tw/2+Math.abs(ny)*ph/2+fontPx*.35;
            const sides=[1,-1].map(sign=>({x:p.x+sign*nx*offset,y:p.y+sign*ny*offset}));
            p=sides.find(side=>clear(side,tw,ph,true)) || search(sides[0],tw,ph);
          } else haloRatio=.34;
        }
        p=inside(p,tw,ph);
        break;
      }
      case 'in': {
        const region=regionAt(gray,w,h,p);
        if(!region || region.w<6 || region.h<4){p=inside(p,tw,ph);break;}
        const fit=Math.min(1,region.h*.55/fontPx,region.w*.82/tw);
        if(fit>=.45){
          size=fontPx*fit;
          p=inside(region,tw*fit,ph*fit);
        } else {
          const side=region.w>=region.h
            ? {x:region.x,y:region.y-region.h/2-ph*.75}
            : {x:region.x+region.w/2+tw*.6,y:region.y};
          p=search(side,tw,ph);
        }
        break;
      }
      default:
        p=search(p,tw,ph,label.kind==='leader'?anchor:null);
    }
    if(label.kind==='leader') leaders.push([anchor,p]);
    const ratio=size/fontPx;
    occupied.push(box(p,tw*ratio,ph*ratio));
    return {...label,text,role,position:normalized(p,w,h),anchor:normalized(anchor,w,h),measuredSize:size/h,haloRatio};
  });
}

export async function createGeneratedImageLabelPlan(located, image, { signal } = {}) {
  if (!located?.labels?.length) return null;
  const placed = buildPlacement(await imagePixels(image), located.labels);
  signal?.throwIfAborted();
  const inputs = placed.map((label, i) => ({
    id: `generated-label-${i+1}`, text:label.text, evidence:label.text, sourceKind:'request',
    anchor:label.anchor, position:label.position, mode:label.kind==='leader'?'leader':'text',
    contentMode:/[_^{}]/.test(label.text)?'formula':'plain',
    typography:{role:label.role},
  }));
  // These exact strings come from the scene plan, not the coordinate reader.
  const evidence=placed.map(label=>label.text).join('\n');
  const payload={version:2,reviewRequired:located.missing>0,labels:inputs};
  const parsed=parseEditableImageLabelPlan(`<5e-editable-labels>${JSON.stringify(payload)}</5e-editable-labels>`,evidence);
  const byId=new Map(inputs.map((entry, i)=>[entry.id,placed[i]]));
  const labels=parsed.labels.map(label=>{
    const { measuredSize,haloRatio }=byId.get(label.id);
    return {...label,measuredSize,haloRatio};
  });
  return labels.length ? freezeLabelPlan({...parsed,version:EDITABLE_IMAGE_LABEL_PLAN_VERSION,frozen:true,origin:'figure-generation',labels}) : null;
}
