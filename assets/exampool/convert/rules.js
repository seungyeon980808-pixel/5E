// 기출 PDF 줄 → 문항 칸 규칙(AI 없음). 변환기(es/)가 읽은 줄 위치·상자 테두리·그림·표 위치만으로 나눈다.
// - 상자: PDF의 네 변(선 4개 또는 사각형)으로 찾는다. 상자 안 줄·그림·표는 상자 칸(조건·실험)으로.
// - 문단: 문항 번호 줄 기준 본문 왼쪽(B)에서 한 글자쯤 들여 쓴 줄이 새 문단. 더 들여 쓴 줄(가운데 수식·그림 이름)은 따로.
// - 발문: 변환기가 '이에 대한…'으로 찾은 줄, 없으면 상자 밖 마지막 '?' 문단(뒤따르는 '(단, …)'·[3점] 포함).
// 좌표: 상자·그림·표는 위가 0인 PDF 좌표, 줄의 y는 아래가 0이라 pageHeight로 뒤집는다.

// 줄 하나의 글. 수식은 $스크립트$. 그림 런은 뺀다.
export const runsText=runs=>(runs||[]).filter(r=>r.kind!=='figure').map(r=>r.kind==='equation'?`$${String(r.script||r.value||'').trim()}$`:String(r.value||'')).join('');
export const clean=s=>String(s||'').replace(/\s+/g,' ').replace(/\$\s*\$/g,'').trim();
export const MARK=/^(\[[^\]]{1,12}\]|〔[^〕]{1,12}〕|\((가|나|다|라|마|바|사)\)\s?|[◦○•ㆍ·∙]\s?|[※*]\s?)/;
export const HEAD=/^[\[〔［]\s*([^\]〕］]{1,12}?)\s*[\]〕］]$/;
const CAPTION=/^(\s*\((가|나|다|라|마|바)\)\s*)+$/;
const INDENT=[5.5,17],OPEN_STEP=11;

// 상자: 선 4개(왼·오른 세로선 높이가 같고 아래 가로선이 폭을 덮는 것) 또는 테두리 사각형.
export function frameRects(frames=[]){
  const near=(a,b,t=2.2)=>Math.abs(a-b)<=t,H=[],V=[],R=[];
  for(const f of frames){const [x0,y0,x1,y1]=f.box;
    if(f.type==='rect'){if(f.paint!=='fill'&&x1-x0>60&&y1-y0>14)R.push({box:[x0,y0,x1,y1],titled:false});continue;}
    if(y1-y0<1.5&&x1-x0>6)H.push({y:(y0+y1)/2,x0,x1});else if(x1-x0<1.5&&y1-y0>14)V.push({x:(x0+x1)/2,y0,y1});}
  const cover=(segs,a,b)=>{const s=segs.map(h=>[Math.max(a,h.x0),Math.min(b,h.x1)]).filter(([p,q])=>q>p).sort((m,n)=>m[0]-n[0]);let len=0,end=a;for(const [p,q] of s){if(q<=end)continue;len+=q-Math.max(p,end);end=q;}return len/(b-a);};
  for(const a of V)for(const b of V){if(b.x-a.x<60||!near(a.y0,b.y0)||!near(a.y1,b.y1))continue;
    const top=H.filter(h=>near(h.y,a.y0)),bot=H.filter(h=>near(h.y,a.y1));
    if(cover(bot,a.x,b.x)<.9||cover(top,a.x,b.x)<.3)continue;
    // 사이에 같은 높이 세로선이 있으면 표 칸이다(가장 바깥만 남긴다).
    R.push({box:[a.x,Math.min(a.y0,b.y0),b.x,Math.max(a.y1,b.y1)],titled:cover(top,a.x,b.x)<.97});}
  const same=(p,q)=>p.box.every((v,i)=>Math.abs(v-q.box[i])<2.5);
  return R.filter((r,i)=>R.findIndex(q=>same(q,r))===i);
}
const yOv=(a,b)=>Math.min(a[3],b[3])-Math.max(a[1],b[1]);
const inside=(box,x,y,m=2)=>x>=box[0]-m&&x<=box[2]+m&&y>=box[1]-m&&y<=box[3]+m;
const contains=(a,b,m=2)=>a[0]<=b[0]+m&&a[1]<=b[1]+m&&a[2]>=b[2]-m&&a[3]>=b[3]-m;

// 변환 결과 → 흐름 항목(줄·그림·표). 선지는 뺀다.
export function flowItems(structure){
  const ph=structure.pageHeight,out=[];
  for(const b of structure.blocks||[]){
    if(b.role==='choice')continue;
    if(b.kind==='table'){out.push({k:'table',block:b,box:b.box,role:b.role});continue;}
    for(const r of b.runs||[])if(r.kind==='figure')out.push({k:'figure',run:r,box:r.sourceBox,role:b.role});
    const text=clean(runsText(b.runs));if(!text)continue;
    const L=b.sourceLine;
    out.push({k:'line',role:b.role,label:b.label||'',text,left:L?.left,right:L?.right,base:L&&ph?ph-L.y:null,h:L?.height||10,opening:!!L?.opening,geo:!!L});
  }
  return out;
}

// 흐름 항목에 상자를 붙인다. 표·그림 테두리, 보기 상자, 글이 없는 상자는 뺀다.
export function assignBoxes(items,frames){
  const tables=items.filter(i=>i.k==='table'&&i.box),figs=items.filter(i=>i.k==='figure'&&i.box);
  let rects=frameRects(frames).filter(r=>!tables.some(t=>contains(r.box,t.box,3)&&contains(t.box,r.box,3))&&!tables.some(t=>contains(t.box,r.box,3))&&!figs.some(f=>contains(f.box,r.box,4)));
  const lineIn=(r,l)=>l.geo&&Number.isFinite(l.base)&&l.left>=r.box[0]-2&&l.right<=r.box[2]+2&&l.base>=r.box[1]&&l.base<=r.box[3]+1;
  rects=rects.filter(r=>!items.some(l=>l.k==='line'&&l.role==='bogi'&&lineIn(r,l))&&items.some(l=>l.k==='line'&&l.role!=='bogi'&&lineIn(r,l)));
  // 가장 바깥 상자만(상자 안 표 칸·작은 상자는 안쪽 내용).
  rects=rects.filter(r=>!rects.some(q=>q!==r&&contains(q.box,r.box,1)&&!contains(r.box,q.box,1)));
  for(const it of items){
    const r=it.k==='line'?rects.find(r=>lineIn(r,it)):it.box?rects.find(r=>inside(r.box,(it.box[0]+it.box[2])/2,(it.box[1]+it.box[3])/2)):null;
    if(r)it.rect=r;
  }
  return rects;
}

// 줄 → 문단. 같은 상자(또는 상자 밖) 안에서만 잇는다.
export function paragraphs(lines,{B}={}){
  const out=[];let cur=null,prev=null;
  const lefts=lines.filter(l=>l.geo&&!l.opening).map(l=>l.left);
  const base=Number.isFinite(B)?B:lefts.length?Math.min(...lefts):null;
  for(const l of lines){
    const t=l.text,d=Number.isFinite(base)&&l.geo?l.left-base:0;
    // 매달린 들여쓰기: ◦·(가)로 시작한 문단의 다음 줄은 더 들여 써도 잇는다.
    const hanging=cur&&cur.mark&&!cur.display&&l.geo&&l.left>cur.firstLeft+3&&(cur.lines.length===1||Math.abs(l.left-prev.left)<2.5)&&!MARK.test(t)&&!HEAD.test(t);
    const display=d>INDENT[1]&&!hanging&&!(prev&&prev.geo&&Math.abs(l.left-prev.left)<2&&cur?.display);
    // (가)·(나)로 시작하는 줄은 앞 줄이 문장 끝이거나 들여쓰기가 바뀔 때만 새 문단(줄바꿈으로 줄 머리에 온 (나)는 잇는다).
    const markStart=MARK.test(t)&&(/^[◦○•ㆍ※*\[〔]/.test(t)||!prev||!prev.geo||!l.geo||(!prev.opening&&Math.abs(l.left-prev.left)>2)||/([.:?!)\]〕]|다)$/.test(prev.text));
    let start=!cur||l.opening||(prev&&l.role!==prev.role)||markStart||HEAD.test(t)||CAPTION.test(t)||display||cur.display||cur.head||cur.caption;
    // 들여 쓴 줄(본문 왼쪽 + 한 글자): 새 문단. 매달린 들여쓰기는 잇는다.
    if(!start&&!hanging&&d>=INDENT[0]&&d<=INDENT[1]&&!(prev?.geo&&Math.abs(l.left-prev.left)<2))start=true;
    if(start){cur={lines:[l],text:t,firstLeft:l.left,display,head:HEAD.test(t),caption:CAPTION.test(t),mark:MARK.test(t)};out.push(cur);}
    else{cur.lines.push(l);cur.text+=(/[\-‐]$/.test(cur.text)?'':' ')+t;}
    prev=l;
  }
  return out.map(p=>({...p,text:clean(p.text)}));
}

// 발문 문장 시작: '?' 앞 마지막 문장 끝 뒤.
export function askStart(text){
  const q=text.indexOf('?');if(q<0)return 0;let st=0;
  for(const m of text.slice(0,q).matchAll(/(다\.|요\.|\.\)|\.)\s+(?=\S)/g))st=m.index+m[0].length;
  return st;
}
export const THREE=/\s*\[\s*3\s*점\s*\]\s*$/;

// 전체 분석: 흐름을 상자·문단으로 묶고 발문·짝 머리줄을 떼어 낸다.
export function analyze(structure,item={}){
  const items=flowItems(structure);
  const rects=assignBoxes(items,structure.frames||[]);
  const geoLines=items.filter(i=>i.k==='line'&&i.geo&&i.role!=='bogi');
  // 문항 번호 줄: 변환기 표시가 없으면 흐름의 첫 줄(번호 글자 위치가 줄의 왼쪽).
  const opening=geoLines.find(l=>l.opening)||geoLines[0];if(opening)opening.opening=true;
  const outside=geoLines.filter(l=>!l.rect&&!l.opening).map(l=>l.left);
  const B=opening?opening.left+OPEN_STEP:outside.length?Math.min(...outside):null;
  // 흐름을 마디(문단 묶음·그림·표·상자)로
  const nodes=[];let run=[];
  const flush=()=>{if(run.length){for(const p of paragraphs(run,{B:run[0].rect?undefined:B}))nodes.push({k:'para',...p,rect:run[0].rect||null});run=[];}};
  // 글 옆 그림·표(가로로 겹치지 않음)는 흐름 순서가 문단 중간에 끼므로 그 글 묶음 뒤로 미룬다.
  const flow=items.filter(it=>!(it.k==='line'&&it.role==='bogi'));
  const besideAt=k=>{const it=flow[k];if(!it.box)return false;const p=flow.slice(0,k).reverse().find(x=>x.k==='line'),n=flow.slice(k+1).find(x=>x.k==='line');
    const apart=l=>l&&l.geo&&l.rect===it.rect&&(l.right<=it.box[0]+2||l.left>=it.box[2]-2)&&Number.isFinite(l.base)&&l.base>=it.box[1]-2&&l.base<=it.box[3]+l.h+14;
    return apart(p)&&apart(n);};
  let deferred=[];
  for(const [k,it] of flow.entries()){
    if(it.k==='line'&&(!run.length||run[0].rect===it.rect)){run.push(it);continue;}
    if(it.k!=='line'&&run.length&&besideAt(k)){deferred.push({...it,rect:it.rect||null});continue;}
    flush();nodes.push(...deferred);
  // 이어진 그림·표는 위→아래, 같은 높이면 왼→오른 순서로.
  for(let i=0;i<nodes.length;){if(nodes[i].k==='para'){i++;continue;}let j=i;while(j<nodes.length&&nodes[j].k!=='para'&&nodes[j].rect===nodes[i].rect)j++;
    const seg=nodes.slice(i,j);if(seg.every(n=>n.box))seg.sort((a,b)=>yOv(a.box,b.box)>4?a.box[0]-b.box[0]:a.box[1]-b.box[1]);nodes.splice(i,j-i,...seg);i=j;}deferred=[];
    if(it.k==='line'){run.push(it);continue;}
    nodes.push({...it,rect:it.rect||null});
  }
  flush();nodes.push(...deferred);
  // 이어진 그림·표는 위→아래, 같은 높이면 왼→오른 순서로.
  for(let i=0;i<nodes.length;){if(nodes[i].k==='para'){i++;continue;}let j=i;while(j<nodes.length&&nodes[j].k!=='para'&&nodes[j].rect===nodes[i].rect)j++;
    const seg=nodes.slice(i,j);if(seg.every(n=>n.box))seg.sort((a,b)=>yOv(a.box,b.box)>4?a.box[0]-b.box[0]:a.box[1]-b.box[1]);nodes.splice(i,j-i,...seg);i=j;}
  // 발문
  let ask='',header=null;
  const askRole=nodes.findIndex(n=>n.k==='para'&&n.lines.some(l=>l.role==='ask'));
  let ai=-1;
  if(askRole>=0)ai=askRole;
  else for(let i=nodes.length-1;i>=0;i--){const n=nodes[i];if(n.k==='para'&&!n.rect&&n.text.includes('?')){ai=i;break;}}
  if(ai<0){for(let i=nodes.length-1;i>=0;i--)if(nodes[i].k==='para'&&!nodes[i].rect){ai=i;break;}}
  let pre=nodes,post=[];
  if(ai>=0){
    const n=nodes[ai],st=n.lines[0].role==='ask'?0:askStart(n.text);
    const head=st>0?n.text.slice(0,st).trim():'';
    const askParts=[n.text.slice(st).trim()];
    pre=nodes.slice(0,ai);if(head)pre.push({...n,text:head,lines:n.lines});
    for(const m of nodes.slice(ai+1)){
      if(m.k==='para'&&!m.rect&&(item.form==='pair'||item.choiceShape==='table')&&!header&&isHeader(m.text)){header=headerCells(m.text);continue;}
      if(m.k==='para'&&!m.rect&&!m.display&&!m.caption&&!m.head)askParts.push(m.text);else post.push(m);
    }
    ask=clean(askParts.join(' '));
  }
  if(!header&&(item.form==='pair'||item.choiceShape==='table')){
    // 머리줄이 발문 앞에 온 경우(드묾)
    const i=pre.findIndex(m=>m.k==='para'&&!m.rect&&isHeader(m.text));if(i>=0){header=headerCells(pre[i].text);pre.splice(i,1);}
  }
  const three=THREE.test(ask)||/\[\s*3\s*점\s*\]/.test(ask);ask=ask.replace(/\s*\[\s*3\s*점\s*\]\s*/g,' ').trim();
  return {items,rects,nodes:[...pre,...post],ask,three,header,B};
}

// 선지표 머리줄: 짧은 낱말 2~6개(㉠ ㉡, A B C, (가) (나), 수식 한 덩이 등).
export function isHeader(t){const c=headerCells(t);return c.length>=2&&c.length<=6&&c.every(x=>x.replace(/\$[^$]*\$/g,'X').length<=12)&&!/[.?]$/.test(t);}
export function headerCells(t){return tokens(t);}
// 공백으로 나누되 $…$ 수식 안 공백은 나누지 않는다.
export function tokens(t){const out=[];let cur='',eq=false;for(const ch of String(t).trim()){if(ch==='$')eq=!eq;if(/\s/.test(ch)&&!eq){if(cur)out.push(cur);cur='';}else cur+=ch;}if(cur)out.push(cur);return out;}

// 짝 고르기 선지표: 줄의 낱말 위치로 열을 맞춘다. 선지가 여러 단(① ② 한 줄)이면 단마다 같은 머리줄이 반복된다.
// 반환: {header:[…], rows:[[…]×5]} 또는 null.
export function pairTable(structure){
  const L=(structure.lineCells||[]).filter(l=>l.words?.length).map(l=>({y:l.y,h:l.height||10,words:l.words.map(w=>({x0:w.x0,x1:w.x1,t:clean(runsText(w.runs))})).filter(w=>w.t&&!/^￼/.test(w.t))})).filter(l=>l.words.length).sort((a,b)=>b.y-a.y);
  const first=L.findIndex(l=>l.words.some(w=>/^①/.test(w.t)));if(first<0)return null;
  const rows=[];
  for(const l of L.slice(first)){
    if(!l.words.some(w=>/^[①②③④⑤]/.test(w.t)))break;
    let cur=null;
    for(const w of l.words){const m=w.t.match(/^([①②③④⑤])\s*(.*)$/);
      if(m){cur={mark:m[1],x:w.x0,words:[]};rows.push(cur);if(m[2]){const k=(w.x1-w.x0)*(1-[...m[2]].length/[...w.t].length);cur.words.push({x0:w.x0+k,x1:w.x1,t:m[2]});}}
      else if(cur)cur.words.push(w);}
    if(rows.some(r=>r.mark==='⑤'))break;
  }
  if(rows.length!==5)return null;
  const starts=[];for(const x of rows.map(r=>r.x).sort((a,b)=>a-b))if(!starts.length||x-starts.at(-1)>6)starts.push(x);
  const blockOf=x=>{let k=0;starts.forEach((s,i)=>{if(x>=s-4)k=i;});return k;};
  const center=w=>(w.x0+w.x1)/2;
  // 머리줄: 첫 선지 줄 바로 위, 짧은 낱말들, 물음표 없음.
  let header=null;const up=L[first-1];
  if(up&&up.y-L[first].y<L[first].h*3&&up.words.length>=2&&up.words.every(w=>w.t.replace(/\$[^$]*\$/g,'X').length<=14)&&!/[?.]$/.test(up.words.at(-1).t)){
    const own=up.words.filter(w=>blockOf(center(w))===0);
    if(own.length>=1)header=own.map(w=>({t:w.t,c:center(w)-starts[0]}));
  }
  // 머리줄이 첫 선지 줄에 붙어 읽힌 경우(낱말 끝마다 $A$·$B$…)
  // 머리줄 글자(A·B·C…)가 첫 선지 줄 낱말 끝 수식에 붙어 읽힌 경우: '강자성체$A$', '$XA$선'.
  if(!header){const r1=rows[0].words,HM=/^(.*?)\$([^$]*?)([A-Z])\$(\S{0,3})$/;
    const ms=r1.map(w=>w.t.match(HM));
    if(r1.length>=2&&ms.every(Boolean)&&ms.every((m,i)=>m[3].charCodeAt(0)===ms[0][3].charCodeAt(0)+i)){
      header=ms.map((m,i)=>({t:`$${m[3]}$`,c:center(r1[i])-starts[0]}));
      r1.forEach((w,i)=>{const m=ms[i];w.t=clean(m[1]+(m[2]?`$${m[2]}$`:'')+m[4]);});}}
  if(!header){// 머리줄 없음: 첫 단 낱말 중심을 묶어 열을 만든다.
    const cs=rows.flatMap(r=>r.words.map(w=>center(w)-starts[blockOf(r.x)])).sort((a,b)=>a-b),cl=[];
    for(const c of cs){if(cl.length&&c-cl.at(-1).at(-1)<14)cl.at(-1).push(c);else cl.push([c]);}
    header=cl.map(g=>({t:'',c:g.reduce((a,b)=>a+b,0)/g.length}));
  }
  const cols=header.length;
  const out=rows.map(r=>{const cells=Array(cols).fill('');const s=starts[blockOf(r.x)];
    for(const w of r.words){const c=center(w)-s;let j=0;header.forEach((h,i)=>{if(Math.abs(h.c-c)<Math.abs(header[j].c-c))j=i;});cells[j]=clean(cells[j]+' '+w.t);}
    return cells;});
  return {header:header.map(h=>h.t),rows:out};
}

// 수식 안 괄호: 평가원 PDF에서 ( )는 본문 글꼴로 찍힌다(원본 글 채점 기준과 같게). 수식 밖 글로 뺀다.
// '$(mol)$' → '($mol$)', '$A(g)$' → '$A$($g$)'. 상태 기호 글자(g·l·s)는 시험마다 글꼴이 달라 수식에 둔다. 중괄호 안(분수·\text)은 그대로.
export function splitEquationParens(str){
  return String(str||'').replace(/\$([^$\n]+)\$/g,(all,s)=>{
    if(/\\left|\\right|\\begin/.test(s)||!/[()]/.test(s))return all;
    const parts=[];let math='',depth=0;
    const push=(kind,v)=>{if(!v)return;const last=parts.at(-1);if(last?.kind===kind)last.v+=v;else parts.push({kind,v});};
    for(let i=0;i<s.length;i++){const ch=s[i];
      if(ch==='\\'){const m=s.slice(i).match(/^\\[A-Za-z]+|^\\./);math+=m[0];i+=m[0].length-1;continue;}
      if(ch==='{')depth++;if(ch==='}')depth--;
      if(depth===0&&(ch==='('||ch===')')){
        push('math',math);math='';
        push('text',ch);continue;}
      math+=ch;}
    push('math',math);
    if(depth!==0)return all;
    return parts.map(p=>p.kind==='text'?p.v:p.v.trim()?`$${p.v.trim()}$`:p.v).join('');
  });
}
// 문항 안 모든 글에 적용.
export function mapQuestionText(q,f){// 자료표 칸은 변환기 그대로(작은 글꼴 표).
  q.ask=f(q.ask);
  for(const b of q.blocks){if(typeof b.text==='string')b.text=f(b.text);for(const l of b.lines||[])l.text=f(l.text);}
  for(const c of q.choices)c.text=f(c.text);
  for(const r of q.choiceTable?.cells||[])for(const c of r)if(typeof c.value==='string')c.value=f(c.value);
}
