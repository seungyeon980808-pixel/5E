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
  const choiceish=b=>chains.some(c=>inBox(b,mid(c.box),-0.5)&&(CHOICE.test(c.str)||/보\s*기/u.test(c.str)));
  // 칸 속에 그림이 든 괘선 표는 표 전체가 그림 하나다(칸마다 원그래프 등).
  const cells=page.containers.filter(c=>c.kind==='cell');
  for(const f of page.containers){
    const own=cells.filter(c=>inBox(f.box,mid(c.box),-0.5));
    // 표 자신의 칸이어야 한다(바깥 자료 상자 속의 작은 표 칸은 세지 않음): 왼쪽 위 칸이 상자 모서리에 붙는다.
    if(f.kind!=='frame'||!inQ(f.box)||own.length<4||!own.some(c=>Math.abs(c.box[0]-f.box[0])<2&&Math.abs(c.box[1]-f.box[1])<2)||choiceish(f.box))continue;
    const inside=out.filter(o=>inBox(f.box,mid(o.ink),-0.5));
    if(!inside.length)continue;
    for(const o of inside)out.splice(out.indexOf(o),1);
    out.push({box:f.box,ink:f.box,kind:inside.some(o=>o.kind!=='vector')?'mixed':'vector',table:true});
  }
  // 괘선 표(조사 기록의 table). 선택지 표·<보기>는 빼고, 그림 후보와 겹치는 표도 뺀다.
  for(const t of page.tables){
    if(!inQ(t.box))continue;
    if(choiceish(t.box))continue;
    if(out.some(o=>area(inter(o.box,t.box)||[0,0,0,0])>area(t.box)*.3))continue;
    out.push({box:t.box,ink:t.box,kind:'vector',table:true});
  }
  // 선택지 ①~⑤ 자리의 그림(그래프 고르기 등)은 문항 그림이 아니다.
  const firstChoice=Math.min(...chains.filter(c=>/^\s*①/u.test(c.str)).map(c=>c.box[1]));
  for(let i=out.length-1;i>=0;i--)if(mid(out[i].box)[1]>firstChoice-body*.3)out.splice(i,1);
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
const rect=(x0,y0,x1,y1)=>({x0:Math.round(x0),y0:Math.round(y0),x1:Math.round(x1),y1:Math.round(y1)});
function projection(m,r,axis){// axis 'x': 열마다 잉크 수
  const n=axis==='x'?r.x1-r.x0:r.y1-r.y0,a=new Uint32Array(n);
  for(let y=r.y0;y<r.y1;y++){const row=y*m.W;for(let x=r.x0;x<r.x1;x++)if(m.ink[row+x])a[axis==='x'?x-r.x0:y-r.y0]++;}
  return a;
}
function runs(a,minGap){// 잉크가 있는 구간들(빈 칸 minGap 미만은 이어 붙임)
  const out=[];let s=-1,last=-1;
  for(let i=0;i<a.length;i++)if(a[i]){if(s<0)s=i;else if(i-last-1>minGap){out.push([s,last+1]);s=i;}last=i;}
  if(s>=0)out.push([s,last+1]);return out;
}
function trim(m,r){
  const xs=runs(projection(m,r,'x'),1e9),ys=runs(projection(m,r,'y'),1e9);
  if(!xs.length)return null;
  return rect(r.x0+xs[0][0],r.y0+ys[0][0],r.x0+xs[0][1],r.y0+ys[0][1]);
}
// 8방향 연결 잉크 덩어리.
function components(m){
  const {W,H,ink}=m,seen=new Uint8Array(W*H),stack=new Int32Array(W*H),out=[];
  for(let start=0;start<W*H;start++){
    if(!ink[start]||seen[start])continue;
    let top=0,x0=W,y0=H,x1=-1,y1=-1,n=0;stack[top++]=start;seen[start]=1;
    while(top){const i=stack[--top],x=i%W,y=(i-x)/W;n++;
      if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
      for(let dy=-1;dy<=1;dy++){const yy=y+dy;if(yy<0||yy>=H)continue;
        for(let dx=-1;dx<=1;dx++){const xx=x+dx;if(xx<0||xx>=W)continue;const j=yy*W+xx;if(ink[j]&&!seen[j]){seen[j]=1;stack[top++]=j;}}}}
    out.push({x0,y0,x1:x1+1,y1:y1+1,n});
  }
  return out;
}
const hasInk=(m,r)=>{for(let y=Math.max(0,r.y0);y<Math.min(m.H,r.y1);y++){const row=y*m.W;for(let x=Math.max(0,r.x0);x<Math.min(m.W,r.x1);x++)if(m.ink[row+x])return true;}return false;};

// 괄호 캡션 (가)(나)…: 가늘고 긴 '(' 뒤에 글자 덩어리, 같은 높이의 ')'(또는 'ㅏ)'처럼 붙은 덩어리)로 끝나고 둘레가 비어 있다.
// "어머니"·"A: X선" 같은 이름표, f(x) 같은 수식 괄호는 모양·둘레 조건에서 빠진다.
function findCaptions(m,comps,s,body,texts){
  const B=body*s,caps=[];
  // 자리 확인: 아래 캡션은 바로 아래가 비고 위에 그림이 있다. 옆 캡션은 왼쪽이 비고 오른쪽에 그림이 붙는다.
  const place=(g,free)=>{
    // 그래프 속 곡선 이름표 (가)는 같은 줄 양옆에 그림이 붙어 있다.
    const lateral=hasInk(m,rect(g.x0-B,g.y0,g.x0-2,g.y1))&&hasInk(m,rect(g.x1+2,g.y0,g.x1+B,g.y1));
    const solo=!hasInk(m,rect(g.x0-B*.6,g.y0,g.x0-2,g.y1))&&!hasInk(m,rect(g.x1+2,g.y0,g.x1+B*.6,g.y1));// "전압(V)"처럼 글자에 붙은 괄호가 아니다
    const bottom=free&&solo&&!lateral&&!hasInk(m,rect(g.x0-B*.5,g.y1+2,g.x1+B*.5,g.y1+B*.8))&&hasInk(m,rect(g.x0-B*1.5,g.y0-B*3.5,g.x1+B*1.5,g.y0-2));
    const h=g.y1-g.y0,side=!hasInk(m,rect(g.x0-B*1.5,g.y0,g.x0-2,g.y1))&&hasInk(m,rect(g.x1+2,g.y0-h*.5,g.x1+B*4,g.y1+h*.5));
    return bottom||side?{...g,bottom,side}:null;};
  for(const t of texts){const c=place(t,true);if(c)caps.push({...c,text:true});}
  const lefts=comps.filter(c=>{const h=c.y1-c.y0,w=c.x1-c.x0;return h/s>=body*.5&&h/s<=body*1.4&&w<=h*.36&&w>=h*.06;});
  for(const L of lefts){
    const h=L.y1-L.y0,tol=h*.15;
    if(caps.some(c=>c.x0<=L.x1&&c.x1>=L.x0&&c.y0<=L.y1&&c.y1>=L.y0))continue;
    const near=comps.filter(c=>c!==L&&c.x0>=L.x1-1&&c.x0<=L.x0+h*2.6&&c.y0>=L.y0-tol&&c.y1<=L.y1+tol).sort((p,q)=>p.x0-q.x0);
    const chain=[];let right=L.x1;
    for(const c of near){if(c.x0-right>h*.5)break;chain.push(c);right=Math.max(right,c.x1);if(right-L.x0>h*2.6)break;}
    let end=-1;
    chain.forEach((c,k)=>{if(k>=1&&(c.y1-c.y0)>=h*.8&&Math.abs(c.y0-L.y0)<=tol&&Math.abs(c.y1-L.y1)<=tol)end=k;});
    if(end<1)continue;
    const group=[L,...chain.slice(0,end+1)];
    const g={x0:L.x0,y0:Math.min(...group.map(c=>c.y0)),x1:Math.max(...group.map(c=>c.x1)),y1:Math.max(...group.map(c=>c.y1))};
    const wd=g.x1-g.x0;if(wd<h*1.0||wd>h*2.6)continue;
    const inner=chain.slice(0,end);if(inner.length>4)continue;
    // 가~하는 모두 모음 'ㅏ'로 끝난다: 오른쪽에 길쭉한 세로획(또는 ')'와 붙은 'ㅏ)'), 그 왼쪽에 자음.
    // (A)·(℃)·(atm) 같은 단위 괄호를 거른다.
    const closing=chain[end],wide=(closing.x1-closing.x0)>=h*.4;
    const vowel=wide?closing:inner.at(-1),cons=wide?inner:inner.slice(0,-1);
    const syllable=!wide&&inner.length===1&&(inner[0].x1-inner[0].x0)>=h*.65&&(inner[0].y1-inner[0].y0)>=h*.7;// 자모가 붙은 '나'
    if(!syllable&&(!vowel||(vowel.y1-vowel.y0)<h*.55||(!wide&&(vowel.x1-vowel.x0)>h*.5)||!cons.length||cons.every(c=>(c.x1-c.x0)<h*.25)))continue;
    const margin=Math.max(.8*s,h*.15);
    const clear=(right,top)=>!comps.some(c=>!group.includes(c)&&c.x0<g.x1+right&&c.x1>g.x0-margin&&c.y0<g.y1+margin&&c.y1>g.y0-top);
    // 옆 캡션은 오른쪽 그림에, 아래 캡션은 위 그림에 바짝 붙기도 한다.
    const thin=Math.round(.3*s),sideFree=clear(thin,margin),bottomFree=clear(margin,thin);
    if(!sideFree&&!bottomFree)continue;
    const c=place(g,bottomFree);if(c&&(c.bottom||sideFree))caps.push({...c,side:c.side&&sideFree});
  }
  return caps;
}

// 한 후보 캔버스를 캡션 기준으로 패널로 나눈다. 결과: [{r(픽셀), cap|null}] (캡션 순서)
function panels(m,s,body,texts,split=true,given=null){
  const whole=trim(m,rect(0,0,m.W,m.H));if(!whole)return [];
  let caps=given||(split?findCaptions(m,components(m),s,body,texts):[]);
  if(globalThis.__capsDebug)globalThis.__capsDebug.push({caps:caps.map(c=>[c.x0/s,c.y0/s,c.x1/s,c.y1/s,!!c.text,c.bottom,c.side]),whole:[whole.x0/s,whole.y0/s,whole.x1/s,whole.y1/s]});
  // 옆 캡션: 왼쪽 가장자리에 세로로 늘어서고 바로 오른쪽에 그림이 붙어 있다. 아니면 아래 캡션만 쓴다.
  const side=caps.length>1&&caps.every(c=>c.side&&(c.x0-whole.x0)/s<body*2)&&caps.some(c=>!c.bottom);
  if(!side&&!given)caps=caps.filter(c=>c.bottom);
  const original=m.ink.slice();
  // 캡션 글자는 그림에서 뺀다.
  for(const c of caps)for(let y=Math.max(0,c.y0-2);y<Math.min(m.H,c.y1+2);y++)m.ink.fill(0,y*m.W+Math.max(0,c.x0-2),y*m.W+Math.min(m.W,c.x1+2));
  if(caps.length<=1){
    // 캡션이 하나뿐이면 그림 맨 아래에 있을 때만 캡션으로 뗀다(그래프 속 곡선 이름표 (가)는 그대로 둔다).
    const c=caps[0];
    if(c&&(whole.y1-c.y1)>body*s*.5){m.ink.set(original);return [{r:whole,cap:null,cell:rect(0,0,m.W,m.H)}];}
    const r=trim(m,whole);return r?[{r,cap:c||null,cell:rect(0,0,m.W,m.H)}]:[];}
  const cx=c=>(c.x0+c.x1)/2,cy=c=>(c.y0+c.y1)/2;
  const cutAt=(axis,a,b,r)=>{// a..b 사이에서 잉크가 가장 적은 줄(빈 줄이 길게 이어지면 그 가운데)
    a=Math.round(a);b=Math.round(b);if(b<=a)return a;
    const proj=projection(m,axis==='x'?rect(a,r.y0,b,r.y1):rect(r.x0,a,r.x1,b),axis);
    let best=0,bv=Infinity,run=0,bestRun=0;
    for(let i=0;i<proj.length;i++){if(proj[i]<bv){bv=proj[i];best=i;run=1;bestRun=1;}else if(proj[i]===bv){run++;if(run>bestRun){bestRun=run;best=i-Math.floor(run/2);}}else run=0;}
    return a+best;};
  const cells=[];
  if(side){
    caps.sort((p,q)=>p.y0-q.y0);
    const cuts=caps.slice(1).map((c,i)=>cutAt('y',cy(caps[i]),cy(c),whole));
    caps.forEach((c,i)=>cells.push({r:rect(whole.x0,i?cuts[i-1]:whole.y0,whole.x1,i<cuts.length?cuts[i]:whole.y1),cap:c}));
  }else{
    // 아래 캡션: 가로로 겹치는 캡션끼리 한 열(위아래로 쌓인 패널).
    const sorted=[...caps].sort((p,q)=>cx(p)-cx(q)),cols=[];
    for(const c of sorted){const col=cols.at(-1);if(col&&col.some(o=>o.x0<c.x1+body*s&&c.x0<o.x1+body*s))col.push(c);else cols.push([c]);}
    const xcuts=cols.slice(1).map((col,i)=>cutAt('x',Math.max(...cols[i].map(cx)),Math.min(...col.map(cx)),whole));
    const grid=cols.length>1&&cols.every(col=>col.length===cols[0].length)&&cols[0].length>1;
    cols.forEach((col,i)=>{
      const x0=i?xcuts[i-1]:whole.x0,x1=i<xcuts.length?xcuts[i]:whole.x1;
      col.sort((p,q)=>p.y0-q.y0);
      col.forEach((c,j)=>cells.push({r:rect(x0,j?col[j-1].y1+1:whole.y0,x1,j<col.length-1?c.y1+1:whole.y1),cap:c,row:j,col:i}));
    });
    // 2×2처럼 칸이 고르면 줄 순서((가)(나)/(다)(라)), 아니면 열 순서.
    if(grid)cells.sort((p,q)=>p.row-q.row||p.col-q.col);
  }
  if(globalThis.__capsDebug)globalThis.__capsDebug.push({side,cells:cells.map(c=>[c.r.x0/s,c.r.y0/s,c.r.x1/s,c.r.y1/s])});
  const out=cells.flatMap(c=>{const r=trim(m,c.r);return r?[{r,cap:c.cap,cell:c.r}]:[];});
  // 나눈 조각이 너무 작으면(그래프 속 이름표를 캡션으로 본 경우) 그 캡션을 빼고 다시 나눈다.
  const wa=(whole.x1-whole.x0)*(whole.y1-whole.y0),size=p=>(p.r.x1-p.r.x0)*(p.r.y1-p.r.y0);
  const bad=out.filter(p=>(p.r.x1-p.r.x0)<body*s*2.5||size(p)<wa*.03);
  if(out.length<caps.length||bad.length){
    m.ink.set(original);
    const drop=bad.length?bad.reduce((a,b)=>size(a)<size(b)?a:b).cap:null;
    const keep=caps.filter(c=>c!==drop&&out.some(p=>p.cap===c));
    if(keep.length===caps.length)return [{r:whole,cap:null,cell:rect(0,0,m.W,m.H)}];
    return panels(m,s,body,texts,true,keep);
  }
  return out;
}

function crop(canvas,r){
  const c=document.createElement('canvas');c.width=r.x1-r.x0;c.height=r.y1-r.y0;
  const g=c.getContext('2d',{alpha:false});g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(canvas,-r.x0,-r.y0);
  return c.toDataURL('image/png');
}

// 후보 하나를 그려 픽셀 잉크 지도를 만든다. 본문 글과 상자 테두리는 그림이 아니므로 흰색으로 지운다.
async function prepare(item,cand,{chains,prose,frames},scale,signal){
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
    // 글자로 찍힌 캡션 (가)(나)의 픽셀 위치.
    const texts=chains.filter(c=>CAPTION.test(c.str)&&inBox(box,mid(c.box))).map(c=>rect(Math.floor((c.box[0]-box[0])*scale),Math.floor((c.box[1]-box[1])*scale),Math.ceil((c.box[2]-box[0])*scale),Math.ceil((c.box[3]-box[1])*scale)));
  return {canvas,g,m,box,texts};
}

/**
 * 문항(item: corpus.json 항목)의 그림·도표를 원본 위→아래, 왼→오른 순서로 돌려준다.
 * [{data:'data:image/png;base64,…', box:[x0,y0,x1,y1](PDF pt, 위가 0), page, caption:'(가)'|null, kind:'vector'|'raster'|'mixed', widthPt}]
 */
export async function detectFigures(item,{signal,scale=4}={}){
  aborted(signal);
  const pdf=await readQuestionPdf(item,{signal});
  const ctx=candidates(item,pdf),{out:cands,chains,body}=ctx;
  const figs=[];
  for(const cand of cands){
    aborted(signal);
    const {canvas,g,m,box,texts}=await prepare(item,cand,ctx,scale,signal);
    const order=[];
    for(const p of panels(m,scale,body,texts,!cand.table)){
      const padPx=Math.round(2*scale),r=rect(Math.max(p.cell.x0,p.r.x0-padPx),Math.max(p.cell.y0,p.r.y0-padPx),Math.min(p.cell.x1,p.r.x1+padPx),Math.min(p.cell.y1,p.r.y1+padPx));
      const pt=[box[0]+r.x0/scale,box[1]+r.y0/scale,box[0]+r.x1/scale,box[1]+r.y1/scale];
      if(pt[2]-pt[0]<6||pt[3]-pt[1]<6)continue;
      let caption=null;
      if(p.cap){const cb=[box[0]+p.cap.x0/scale,box[1]+p.cap.y0/scale,box[0]+p.cap.x1/scale,box[1]+p.cap.y1/scale];
        const t=chains.find(c=>CAPTION.test(c.str)&&inBox(cb,mid(c.box),2));caption=t?t.str.replace(/\s+/gu,'').replace('（','(').replace('）',')'):'?';}
      // 캡션 자리를 지운 잉크로 다시 자른다(캔버스에도 흰색으로).
      if(p.cap)g.fillRect(p.cap.x0-2,p.cap.y0-2,p.cap.x1-p.cap.x0+4,p.cap.y1-p.cap.y0+4);
      order.push({r,box:pt,caption});
    }
    for(const o of order)figs.push({data:crop(canvas,o.r),box:o.box,page:item.page,caption:o.caption,kind:cand.kind,widthPt:o.box[2]-o.box[0],group:cands.indexOf(cand)});
  }
  // 읽는 순서: 위→아래(같은 줄은 왼→오른).
  // 후보끼리는 위→아래(같은 줄은 왼→오른), 한 후보 안에서는 캡션 순서.
  const groupBox=new Map();for(const f of figs)groupBox.set(f.group,groupBox.has(f.group)?union(groupBox.get(f.group),f.box):f.box);
  const before=(a,b)=>overlapY(a,b)>Math.min(a[3]-a[1],b[3]-b[1])*.4?a[0]-b[0]:a[1]-b[1];
  figs.sort((a,b)=>a.group===b.group?0:before(groupBox.get(a.group),groupBox.get(b.group)));
  for(const f of figs)delete f.group;
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
export async function debugCaps(item){
  const pdf=await readQuestionPdf(item),{out,body,chains}=candidates(item,pdf),s=4,res=[];
  for(const cand of out){const box=cand.box;const canvas=await renderFigureCanvas({...item,box,displayBox:box},s);const m=inkMap(canvas);
    const comps=components(m);const h=c=>(c.y1-c.y0)/s;
    const lefts=comps.filter(c=>{const hh=c.y1-c.y0,w=c.x1-c.x0;return hh/s>=body*.5&&hh/s<=body*1.4&&w<=hh*.36&&w>=hh*.06;});
    res.push({cand:cand.box,kind:cand.kind,comps:comps.length,lefts:lefts.map(c=>[c.x0/s,c.y0/s,(c.x1-c.x0)/s,h(c)]),caps:findCaptions(m,comps,s,body,[]).map(c=>[c.x0/s,c.y0/s,c.x1/s,c.y1/s,c.bottom,c.side])});}
  return {res,caps:globalThis.__capsDebug};
}
export async function debugPanels(item){
  globalThis.__capsDebug=[];
  const pdf=await readQuestionPdf(item),ctx=candidates(item,pdf),s=4,res=[];
  for(const cand of ctx.out){const {m,texts,box}=await prepare(item,cand,ctx,s);
    res.push({box,panels:panels(m,s,ctx.body,texts).map(p=>({r:[p.r.x0/s,p.r.y0/s,p.r.x1/s,p.r.y1/s],cell:[p.cell.x0/s,p.cell.y0/s,p.cell.x1/s,p.cell.y1/s],cap:p.cap&&[p.cap.x0/s,p.cap.y0/s,p.cap.x1/s,p.cap.y1/s]}))});}
  return {res,caps:globalThis.__capsDebug};
}
export async function debugCanvas(item){
  const pdf=await readQuestionPdf(item),ctx=candidates(item,pdf),out=[];
  for(const cand of ctx.out){const {canvas}=await prepare(item,cand,ctx,2);out.push({data:canvas.toDataURL('image/png'),cand,prose:ctx.prose.filter(c=>!inBox(cand.ink,mid(c.box),0.5)&&inter(c.box,cand.box)).map(c=>[c.str,c.box])});}
  return out;
}
