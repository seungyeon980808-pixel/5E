import {block,parentOptions} from '../sheet/model.js';

const bounded=(v,min,max,fallback)=>Number.isFinite(Number(v))?Math.max(min,Math.min(max,Number(v))):fallback;
export function groupMetrics(q,b){
  const children=q.blocks.filter(c=>c.parent===b.id);
  return {gap:bounded(b.gapMm??2,0,6,2),columns:children.map(c=>`minmax(0,${bounded(c.slotWeight??1,1,4,1)}fr)`).join(' ')};
}
export function materialTree(q){
  const out=[];
  function walk(parent,depth){for(const b of q.blocks.filter(b=>b.parent===parent)){
    if(parent||!['text','bogi'].includes(b.kind))out.push({b,depth});
    if(b.kind==='group')walk(b.id,depth+1);
  }}
  walk(null,0);return out;
}
// Work on a copy so rejected parent/size changes cannot leave a partial edit.
export function updateMaterial(q,id,key,value){
  const next=structuredClone(q),b=next.blocks.find(b=>b.id===id);if(!b)throw Error('자료를 찾지 못했습니다.');
  if(key==='parent'){
    if(value&&!parentOptions(next,b).some(p=>p.id===value))throw Error('자기 자신이나 하위 묶음 안으로 옮길 수 없습니다.');
    b.parent=value||null;
  }else if(key==='label')b.label=String(value).slice(0,240);
  else if(key==='slotWeight')b.slotWeight=bounded(value,1,4,1);
  else if(key==='tableAlign'&&b.kind==='table'&&['left','center','right'].includes(value))b.tableAlign=value;
  else if(b.kind==='group'&&key==='layout'&&['세로','나란히'].includes(value))b.layout=value;
  else if(b.kind==='group'&&key==='boxed')b.boxed=value===true||value==='true';
  else if(b.kind==='group'&&key==='gapMm')b.gapMm=bounded(value,0,6,2);
  else throw Error('이 객체에서는 사용할 수 없는 설정입니다.');
  return next;
}
export function moveMaterial(q,id,direction){
  const next=structuredClone(q),b=next.blocks.find(b=>b.id===id);if(!b)return next;
  const siblings=next.blocks.filter(x=>x.parent===b.parent),at=siblings.indexOf(b),other=siblings[at+(direction<0?-1:1)];
  if(other){const a=next.blocks.indexOf(b),c=next.blocks.indexOf(other);[next.blocks[a],next.blocks[c]]=[next.blocks[c],next.blocks[a]];}
  return next;
}
export function insertMaterial(q,kind,selectedId){
  if(q.blocks.length>=80)throw Error('자료는 한 문항에 80개까지 넣을 수 있습니다.');
  if(!['figure','table','row','box'].includes(kind))throw Error('자료 종류를 확인하세요.');
  const next=structuredClone(q),selected=next.blocks.find(b=>b.id===selectedId),parent=selected?.kind==='group'?selected.id:selected?.parent||null;
  const b=block(['row','box'].includes(kind)?'group':kind,parent,({row:'가로 묶음',box:'자료 상자',figure:'사진',table:'표'})[kind]);
  if(kind==='row')b.layout='나란히';if(kind==='box')b.boxed=true;
  next.blocks.push(b);return {question:next,id:b.id};
}
