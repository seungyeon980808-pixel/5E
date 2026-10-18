// 기출 PDF 문항의 그림·도표 영역 찾기와 자르기(AI 없음).
// 1) pdf.js 연산자 목록에서 그림 후보를 모은다: 벡터 그림·비트맵(paintImageXObject 위치)·괘선 표.
// 2) 수식 줄·상자 테두리·본문 글은 후보에서 뺀다.
// 3) 후보를 인쇄용 배율(scale 4 ≈ 288dpi)로 그려 픽셀을 본다. 흰 세로 고랑과 (가)·(나) 캡션 띠로 나란한 그림을 나누고,
//    캡션 글자는 자른 그림에서 뺀다(ExamPool이 캡션을 따로 찍음).
// 좌표는 모두 PDF pt, 위가 0(문항 색인 box와 같은 좌표계).
import {readQuestionPdf,renderFigureCanvas} from './es/pdf-viewer.mjs?v=library-release-20261011-3';
import {drawingPrimitives,figureRegions,analyse} from './es/pdf-drawings.mjs?v=readability-20261004-4';

const CAPTION=/^\s*[(（]\s*([가-하])\s*[)）]\s*$/u;
const CHOICE=/[①②③④⑤]/u;
const LETTERS=['가','나','다','라','마','바','사','아'];
const inBox=(b,[x,y],pad=0)=>x>=b[0]-pad&&x<=b[2]+pad&&y>=b[1]-pad&&y<=b[3]+pad;
const mid=b=>[(b[0]+b[2])/2,(b[1]+b[3])/2];
const area=b=>Math.max(0,b[2]-b[0])*Math.max(0,b[3]-b[1]);
const union=(a,b)=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])];
const inter=(a,b)=>{const r=[Math.max(a[0],b[0]),Math.max(a[1],b[1]),Math.min(a[2],b[2]),Math.min(a[3],b[3])];return r[0]<r[2]&&r[1]<r[3]?r:null;};
const gapX=(a,b)=>Math.max(0,a[0]-b[2],b[0]-a[2]),gapY=(a,b)=>Math.max(0,a[1]-b[3],b[1]-a[3]);
const overlapX=(a,b)=>Math.min(a[2],b[2])-Math.max(a[0],b[0]),overlapY=(a,b)=>Math.min(a[3],b[3])-Math.max(a[1],b[1]);

function aborted(signal){if(signal?.aborted)throw signal.reason||new DOMException('취소했습니다.','AbortError');}

// ---------------------------------------------------------------------------------------------
// 1·2) PDF에서 그림 후보

function candidates(item,pdf){
  const H=pdf.pageHeight,q=item.box;
  const prims=drawingPrimitives(pdf.operations,pdf.OPS,H);
  const page=analyse(prims,pdf.content.items,H);
  const regions=figureRegions(prims,pdf.content.items,H);
  const body=page.bodySize;
  const inQ=b=>inBox(q,mid(b));
  const chains=page.chains.filter(c=>inQ(c.box));
  const prose=chains.filter(c=>c.protected);
  const frames=page.containers.filter(c=>(c.kind==='frame'||c.kind==='background')&&inQ(c.box));
  const images=prims.filter(p=>p.type==='image'&&inQ(p.box));
  const out=[];
  for(const r of regions){
    if(!inQ(r.ink))continue;
    const ink=r.ink,h=ink[3]-ink[1],w=ink[2]-ink[0];
    // 수식 줄: 본문 줄 높이의 띠가 본문 바로 위·아래에 붙어 있다(그림 글꼴로 찍은 반응식·수식 비트맵 포함).
    const flow=prose.some(c=>overlapX(c.box,ink)>Math.min(w,c.box[2]-c.box[0])*.3&&gapY(c.box,ink)<body*1.2);
    if(h<=body*2.4&&w>=h*3.5&&flow)continue;
    // 본문 크기 글자가 후보 대부분을 덮으면 그림이 아니라 글(상자 속 글·수식)이다.
    const big=chains.filter(c=>c.size>=body*.85&&inBox(ink,mid(c.box),1));
    const textArea=big.reduce((s,c)=>s+area(inter(c.box,ink)||[0,0,0,0]),0);
    if(h<=body*3.2&&textArea>area(ink)*.45)continue;
    const imgArea=images.filter(p=>inBox(ink,mid(p.box),1)).reduce((s,p)=>s+area(p.box),0);
    const kind=r.kind!=='image'?'vector':imgArea>=area(ink)*.85?'raster':'mixed';
    out.push({box:r.box,ink,kind});
  }
  // 괘선 표(조사 기록의 table). 선택지 표·<보기>는 빼고, 그림 후보와 겹치는 표도 뺀다.
  for(const t of page.tables){
    if(!inQ(t.box))continue;
    if(t.chains.some(c=>CHOICE.test(c.str)||/보\s*기/u.test(c.str)))continue;
    if(out.some(o=>area(inter(o.box,t.box)||[0,0,0,0])>area(t.box)*.3))continue;
    out.push({box:t.box,ink:t.box,kind:'vector',table:true});
  }
  // 한 그림의 조각(겹치거나 아주 가까운 후보)을 합친다. 사이에 본문이 끼면 합치지 않는다.
  const between=b=>prose.some(c=>inBox(b,mid(c.box),-0.5)&&!out.some(o=>inBox(o.box,mid(c.box),-0.5)));
  for(let changed=true;changed;){changed=false;
    outer:for(let i=0;i<out.length;i++)for(let j=i+1;j<out.length;j++){
      const a=out[i],b=out[j];if(a.table||b.table)continue;
      const u=union(a.box,b.box);
      const near=(overlapY(a.box,b.box)>0&&gapX(a.box,b.box)<=body*2.2)||(overlapX(a.box,b.box)>0&&gapY(a.box,b.box)<=body*.8)||area(inter(a.box,b.box)||[0,0,0,0])>0;
      if(!near||between(u))continue;
      out[i]={box:u,ink:union(a.ink,b.ink),kind:a.kind===b.kind?a.kind:'mixed'};out.splice(j,1);changed=true;break outer;
    }}
  // 그림 상자 밖으로 삐져나간 영역은 문항 영역으로 자른다.
  for(const o of out)o.box=[Math.max(q[0],o.box[0]),Math.max(q[1],o.box[1]),Math.min(q[2],o.box[2]),Math.min(q[3],o.box[3])];
  return {out:out.filter(o=>o.box[2]-o.box[0]>4&&o.box[3]-o.box[1]>4),page,chains,prose,frames,body};
}

// ---------------------------------------------------------------------------------------------
// 3) 픽셀: 패널 나누기와 캡션 띠

function inkMap(canvas){
  const {width:W,height:H}=canvas,d=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  const ink=new Uint8Array(W*H);
  for(let i=0,p=0;i<W*H;i++,p+=4)ink[i]=(d[p]*299+d[p+1]*587+d[p+2]*114)/1000<215?1:0;
  return {ink,W,H};
}
const rect=(x0,y0,x1,y1)=>({x0,y0,x1,y1});
function projection(m,r,axis){// axis 'x': 열마다 잉크 수
  const n=axis==='x'?r.x1-r.x0:r.y1-r.y0,a=new Uint32Array(n);
  for(let y=r.y0;y<r.y1;y++){const row=y*m.W;for(let x=r.x0;x<r.x1;x++)if(m.ink[row+x])a[axis==='x'?x-r.x0:y-r.y0]++;}
  return a;
}
function runs(a,minGap){// 잉크가 있는 구간들(빈 칸 minGap 미만은 이어 붙임)
  const out=[];let s=-1,last=-1;
  for(let i=0;i<a.length;i++)if(a[i]){if(s<0)s=i;else if(i-last>minGap){out.push([s,last+1]);s=i;}last=i;}
  if(s>=0)out.push([s,last+1]);return out;
}
function trim(m,r){
  const xs=runs(projection(m,r,'x'),1e9),ys=runs(projection(m,r,'y'),1e9);
  if(!xs.length)return null;
  return rect(r.x0+xs[0][0],r.y0+ys[0][0],r.x0+xs[0][1],r.y0+ys[0][1]);
}
// 패널 아래쪽(또는 중간)의 (가) 꼴 캡션 띠. paren: 좁은 괄호 두 개가 글자 하나를 감싼 모양.
function captionBands(m,r,s,body){
  const bands=runs(projection(m,r,'y'),Math.round(1.2*s)).map(([a,b])=>({y0:r.y0+a,y1:r.y0+b}));
  const res=[];
  bands.forEach((band,k)=>{
    const hpt=(band.y1-band.y0)/s;
    if(hpt<body*.45||hpt>body*1.5)return;
    const br=rect(r.x0,band.y0,r.x1,band.y1),cols=runs(projection(m,br,'x'),Math.round(.9*s));
    if(!cols.length)return;
    const x0=r.x0+cols[0][0],x1=r.x0+cols.at(-1)[1],wpt=(x1-x0)/s;
    if(wpt>body*3.4)return;
    const above=bands.slice(0,k);if(!above.length)return;
    const gapAbove=(band.y0-above.at(-1).y1)/s;if(gapAbove<1.2)return;
    const tall=above.some(b=>(b.y1-b.y0)/s>=body*1.6)||(above.at(-1).y1-above[0].y0)/s>=body*2.5;if(!tall)return;
    // 괄호: 가장 왼쪽·오른쪽 잉크 덩어리가 좁고 띠 높이만큼 길다.
    const fine=runs(projection(m,br,'x'),0);
    const narrow=c=>(c[1]-c[0])/s<=body*.42;
    const paren=fine.length>=3&&narrow(fine[0])&&narrow(fine.at(-1))&&wpt>=body*.9&&wpt<=body*2.6;
    res.push({y0:band.y0,y1:band.y1,x0,x1,paren,last:k===bands.length-1,below:bands.slice(k+1)});
  });
  return res;
}

// 한 후보 캔버스를 패널로 나눈다. 결과: [{r(픽셀), caption:{y0,..}|null}]
function panels(m,s,body){
  const full=rect(0,0,m.W,m.H);
  const bottomCaption=r=>{const t=trim(m,r);if(!t)return null;const c=captionBands(m,t,s,body).find(b=>b.last);return c?{t,c}:null;};
  // 세로 고랑으로 나누기: 고랑 폭 5pt 이상.
  const cols=runs(projection(m,full,'x'),Math.round(5*s)).filter(([a,b])=>(b-a)/s>=3);
  let segs=cols.map(([a,b])=>rect(a,0,b,m.H));
  if(segs.length>1){
    const capped=segs.map(r=>!!bottomCaption(r)?.c.paren);
    if(capped.filter(Boolean).length>=2){
      // 캡션 없는 조각은 가장 가까운 캡션 조각에 붙인다.
      const groups=segs.map((r,i)=>capped[i]?[r]:null);
      segs.forEach((r,i)=>{if(capped[i])return;let best=-1,d=1e9;
        groups.forEach((g,j)=>{if(!g)return;const dd=Math.max(0,segs[j].x0-r.x1,r.x0-segs[j].x1);if(dd<d){d=dd;best=j;}});
        groups[best].push(r);});
      segs=groups.filter(Boolean).map(g=>g.reduce((a,b)=>rect(Math.min(a.x0,b.x0),0,Math.max(a.x1,b.x1),m.H)));
    }else segs=[full];
  }else segs=[full];
  // 각 조각 안에서 위아래로 쌓인 패널: 중간의 괄호 캡션 띠 아래에 다시 그림이 있으면 나눈다.
  const out=[];
  for(const seg of segs){
    let r=trim(m,seg);if(!r)continue;
    for(let guard=0;guard<6;guard++){
      const bands=captionBands(m,r,s,body);
      const cut=bands.find(b=>b.paren&&!b.last&&b.below.some(x=>(x.y1-x.y0)/s>=body*1.6));
      if(!cut)break;
      const top=trim(m,rect(r.x0,r.y0,r.x1,cut.y1));
      if(top)out.push(top);
      r=trim(m,rect(r.x0,cut.y1,r.x1,r.y1));if(!r)break;
    }
    if(r)out.push(r);
  }
  return out.map(r=>{
    const c=captionBands(m,r,s,body).find(b=>b.last);
    // 캡션으로 떼는 것은 (가) 꼴(괄호)일 때만. "A: X선" 같은 이름표는 그림 내용으로 남긴다.
    if(c&&c.paren){const fig=trim(m,rect(r.x0,r.y0,r.x1,c.y0));if(fig)return {r:fig,cap:c,whole:r};}
    return {r,cap:null,whole:r};
  });
}

function crop(canvas,r){
  const c=document.createElement('canvas');c.width=r.x1-r.x0;c.height=r.y1-r.y0;
  const g=c.getContext('2d',{alpha:false});g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(canvas,-r.x0,-r.y0);
  return c.toDataURL('image/png');
}

/**
 * 문항(item: corpus.json 항목)의 그림·도표를 원본 위→아래, 왼→오른 순서로 돌려준다.
 * [{data:'data:image/png;base64,…', box:[x0,y0,x1,y1](PDF pt, 위가 0), page, caption:'(가)'|null, kind:'vector'|'raster'|'mixed', widthPt}]
 */
export async function detectFigures(item,{signal,scale=4}={}){
  aborted(signal);
  const pdf=await readQuestionPdf(item,{signal});
  const {out:cands,chains,prose,frames,body}=candidates(item,pdf);
  const figs=[];
  for(const cand of cands){
    aborted(signal);
    const pad=1.5,box=[cand.box[0]-pad,cand.box[1]-pad,cand.box[2]+pad,cand.box[3]+pad].map((v,i)=>i<2?Math.max(item.box[i],v):Math.min(item.box[i],v));
    const canvas=await renderFigureCanvas({...item,box,displayBox:box},scale,{signal});
    const g=canvas.getContext('2d');g.fillStyle='#fff';
    const toPx=b=>[(b[0]-box[0])*scale,(b[1]-box[1])*scale,(b[2]-b[0])*scale,(b[3]-b[1])*scale];
    // 본문 글과 상자 테두리는 그림이 아니다: 후보 잉크 밖의 본문 글, 테두리 선을 흰색으로 지운다.
    for(const c of prose)if(!inBox(cand.ink,mid(c.box),0.5))g.fillRect(...toPx([c.box[0]-.5,c.box[1]-.5,c.box[2]+.5,c.box[3]+.5]));
    for(const f of frames){const b=f.box,e=1.4;
      if(inBox(b,[cand.box[0],cand.box[1]])&&inBox(b,[cand.box[2],cand.box[3]])&&!(area(b)<=area(cand.box)*1.05))
        for(const edge of [[b[0]-e,b[1]-e,b[2]+e,b[1]+e],[b[0]-e,b[3]-e,b[2]+e,b[3]+e],[b[0]-e,b[1]-e,b[0]+e,b[3]+e],[b[2]-e,b[1]-e,b[2]+e,b[3]+e]])g.fillRect(...toPx(edge));}
    const m=inkMap(canvas);
    for(const p of panels(m,scale,body)){
      const padPx=Math.round(2*scale),r=rect(Math.max(0,p.r.x0-padPx),Math.max(0,p.r.y0-padPx),Math.min(m.W,p.r.x1+padPx),Math.min(m.H,p.r.y1+padPx));
      if(p.cap)r.y1=Math.min(r.y1,p.cap.y0-1);
      const pt=[box[0]+r.x0/scale,box[1]+r.y0/scale,box[0]+r.x1/scale,box[1]+r.y1/scale];
      if(pt[2]-pt[0]<6||pt[3]-pt[1]<6)continue;
      let caption=null;
      if(p.cap){const cb=[box[0]+p.cap.x0/scale,box[1]+p.cap.y0/scale,box[0]+p.cap.x1/scale,box[1]+p.cap.y1/scale];
        const t=chains.find(c=>CAPTION.test(c.str)&&inBox(cb,mid(c.box),2));caption=t?t.str.replace(/\s+/gu,'').replace('（','(').replace('）',')'):'?';}
      figs.push({data:crop(canvas,r),box:pt,page:item.page,caption,kind:cand.kind,widthPt:pt[2]-pt[0]});
    }
  }
  // 읽는 순서: 위→아래(같은 줄은 왼→오른).
  figs.sort((a,b)=>overlapY(a.box,b.box)>Math.min(a.box[3]-a.box[1],b.box[3]-b.box[1])*.4?a.box[0]-b.box[0]:a.box[1]-b.box[1]);
  // 글자로 읽지 못한 비트맵 캡션은 순서대로 (가)(나)…를 붙인다.
  let k=0;for(const f of figs){if(!f.caption)continue;if(f.caption==='?')f.caption=`(${LETTERS[k]||'?'})`;const i=LETTERS.indexOf(f.caption[1]);k=(i>=0?i:k)+1;}
  return figs;
}

// ---------------------------------------------------------------------------------------------
// 검사용

export async function debugOverlay(item){
  const pdf=await readQuestionPdf(item),{out,frames}=candidates(item,pdf),s=1.5,q=item.box;
  const figs=await detectFigures(item);
  const c=await renderFigureCanvas(item,s),g=c.getContext('2d');
  const draw=(b,col,w=2)=>{g.strokeStyle=col;g.lineWidth=w;g.strokeRect((b[0]-q[0])*s,(b[1]-q[1])*s,(b[2]-b[0])*s,(b[3]-b[1])*s);};
  frames.forEach(x=>draw(x.box,'#0a0',1));out.forEach(x=>draw(x.box,'#f80',1));figs.forEach(f=>draw(f.box,'#f00',2));
  g.fillStyle='#f00';g.font='bold 14px sans-serif';figs.forEach((f,i)=>g.fillText(`${i+1}${f.caption||''}`,(f.box[0]-q[0])*s+3,(f.box[1]-q[1])*s+14));
  return [{data:c.toDataURL('image/png')}];
}
