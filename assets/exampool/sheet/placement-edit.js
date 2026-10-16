// 한글 창에서 끌어 놓은 결과를 문항 데이터(순서·묶음·폭 비율·크기)로 바꾼다.
// 좌표는 저장하지 않는다. 화면은 이 데이터로 다시 그린다.
import {block} from './model.js';
import {snapSize,RATIO_MAX} from './placement.js';

const gcd2=values=>values.reduce((x,y)=>{const g=(a,b)=>b?g(b,a%b):a;return g(x,y);});
const children=(q,id)=>q.blocks.filter(b=>b.parent===id);
const find=(q,id)=>{const b=q.blocks.find(x=>x.id===id);if(!b)throw Error('구성을 찾지 못했습니다. 문항을 다시 여세요.');return b;};
// 끌어서 자동으로 만든 가로 묶음 표시. 사용자가 만든 묶음(이름·상자)은 비어도 지우지 않는다.
const AUTO='가로 묶음';

// 두 폭의 비율을 작은 정수 쌍으로. 합이 RATIO_MAX를 넘지 않는 쌍 중 가장 가까운 것.
export function ratioPair(left,right){
  const f=left/(left+right);let best=[1,1],err=Infinity;
  for(let a=1;a<RATIO_MAX;a++)for(let b=1;a+b<=RATIO_MAX;b++){const e=Math.abs(a/(a+b)-f)+(a+b)*1e-4;if(e<err){err=e;best=[a,b];}}
  const g=(x,y)=>y?g(y,x%y):x,d=g(best[0],best[1]);return [best[0]/d,best[1]/d];
}

// 자식이 하나만 남은 자동 가로 묶음은 풀고, 빈 자동 묶음은 지운다.
function tidy(q,groupId){
  const g=q.blocks.find(b=>b.id===groupId);if(!g||g.kind!=='group'||g.label!==AUTO||g.boxed)return;
  const kids=children(q,g.id);
  if(kids.length>1)return;
  if(kids.length===1){const only=kids[0];only.parent=g.parent;delete only.ratio;q.blocks.splice(q.blocks.indexOf(only),1);q.blocks.splice(q.blocks.indexOf(g),0,only);}
  q.blocks.splice(q.blocks.indexOf(g),1);
}
function detach(q,b){const from=b.parent;q.blocks.splice(q.blocks.indexOf(b),1);return from;}
function insertNear(q,b,target,after){q.blocks.splice(q.blocks.indexOf(target)+(after?1:0),0,b);}

// 끈 구성을 대상의 왼쪽/오른쪽에 둔다 → 가로 묶음. widths는 화면 폭(px)으로 비율을 정한다.
export function placeBeside(q,dragId,targetId,side,{dragWidth,targetWidth}={}){
  if(dragId===targetId)return false;
  const drag=find(q,dragId),target=find(q,targetId);
  for(let p=target;p;p=q.blocks.find(x=>x.id===p.parent))if(p.id===drag.id)throw Error('묶음을 자기 안에 놓을 수 없습니다.');
  const after=side==='right',parent=q.blocks.find(x=>x.id===target.parent);
  const from=detach(q,drag);
  if(parent?.layout==='나란히'){
    drag.parent=parent.id;insertNear(q,drag,target,after);
    if(children(q,parent.id).some(c=>c.ratio!==undefined)&&drag.ratio===undefined)drag.ratio=1;
  }else{
    const g=block('group',target.parent,AUTO);g.layout='나란히';g.boxed=false;
    q.blocks.splice(q.blocks.indexOf(target),0,g);
    target.parent=g.id;drag.parent=g.id;insertNear(q,drag,target,after);
    if(dragWidth>0&&targetWidth>0){const [a,b]=after?ratioPair(targetWidth,dragWidth):ratioPair(dragWidth,targetWidth);const [first,second]=after?[target,drag]:[drag,target];first.ratio=a;second.ratio=b;}
    else{delete target.ratio;delete drag.ratio;}
  }
  if(from!==drag.parent)tidy(q,from);
  return true;
}

// 끈 구성을 대상의 위/아래(같은 묶음, 세로 순서)로 옮긴다.
export function placeAround(q,dragId,targetId,where){
  if(dragId===targetId)return false;
  const drag=find(q,dragId),target=find(q,targetId);
  for(let p=target;p;p=q.blocks.find(x=>x.id===p.parent))if(p.id===drag.id)throw Error('묶음을 자기 안에 놓을 수 없습니다.');
  const from=detach(q,drag);drag.parent=target.parent;insertNear(q,drag,target,where==='after');
  const parent=q.blocks.find(x=>x.id===drag.parent);if(parent?.layout!=='나란히')delete drag.ratio;
  if(from!==drag.parent)tidy(q,from);
  return true;
}

// 손잡이로 바꾼 폭(px) → 칸 폭 대비 %(5% 눈금).
export function resizeTo(q,id,width,available){
  const b=find(q,id);if(!(available>0))return false;
  const size=snapSize(width/available*100);
  if(size===100){if(b.size===undefined)return false;delete b.size;return true;}
  if(b.size===size)return false;b.size=size;return true;
}

// 가로 묶음 안 두 이웃의 경계를 옮긴 결과 → 정수 폭 비율.
export function setPairRatio(q,leftId,rightId,leftWidth,rightWidth){
  const l=find(q,leftId),r=find(q,rightId);
  if(l.parent!==r.parent)throw Error('같은 가로 묶음의 이웃끼리만 폭을 나눌 수 있습니다.');
  const kids=children(q,l.parent);for(const k of kids)if(k.ratio===undefined)k.ratio=1;
  // 두 칸의 합(나머지 칸과의 비율)은 그대로 두고 두 칸 사이만 나눈다. 모두 정수가 되도록 같은 배수로 늘린 뒤 줄인다.
  const gcd=(x,y)=>y?gcd(y,x%y):x,total=l.ratio+r.ratio;let [a,b]=ratioPair(leftWidth,rightWidth);
  const g=gcd(total,a+b),others=kids.filter(k=>k!==l&&k!==r);
  let next=new Map([...others.map(k=>[k,k.ratio*(a+b)/g]),[l,a*total/g],[r,b*total/g]]);
  const all=gcd2([...next.values()]);next=new Map([...next].map(([k,v])=>[k,v/all]));
  if([...next.values()].some(v=>v>RATIO_MAX)){
    // 정수로 정확히 못 맞추면 두 칸 비율만 맞추고 나머지는 둔다.
    const scale=Math.max(1,Math.round(total/(a+b)));l.ratio=Math.min(RATIO_MAX,a*scale);r.ratio=Math.min(RATIO_MAX,b*scale);
  }else for(const [k,v] of next)k.ratio=v;
  if(kids.every(k=>k.ratio===1))kids.forEach(k=>delete k.ratio);
  return true;
}
