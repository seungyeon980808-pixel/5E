// 한글 창에서 고친 글을 시트 칸으로 되돌린다.
// 한글 문서 전체 글(공백을 하나로 맞춘 것)에서 생성할 때의 글 조각 위치를 찾아 두고,
// 바뀐 부분이 한 조각 안에 있으면 그 조각의 주인(발문·지문·보기 항목·표 칸·선지)에 반영한다.
// 두 조각에 걸치거나(문단 합치기 등) 번호·기호를 고쳤으면 덮어쓰지 않고 이유를 알린다.
import {cellValue} from './model.js';

// 공백 묶음을 한 칸으로 줄이고 앞뒤를 자른 글과, 각 글자의 원래 위치.
export function normMap(value){
  const v=String(value??''),idx=[];let text='',space=false;
  for(let i=0;i<v.length;i++){
    if(/\s/.test(v[i])){if(text)space=true;continue;}
    if(space){text+=' ';idx.push(i-1);space=false;}
    text+=v[i];idx.push(i);
  }
  return {text,idx};
}
const norm=v=>normMap(v).text;

// 문서 글에서 조각들의 위치를 찾는다. 앞에서부터 차례로 찾고, 못 찾으면 처음부터 다시 찾는다.
export function buildTextMap(docText,segments){
  const doc=norm(docText),spans=[],used=[];
  let from=0;
  for(const [index,seg] of segments.entries()){
    const s=norm(seg.value);if(!s)continue;
    let at=doc.indexOf(s,from);
    if(at<0){at=-1;for(let k=doc.indexOf(s);k>=0;k=doc.indexOf(s,k+1))if(!used.some(u=>k<u[1]&&k+s.length>u[0])){at=k;break;}}
    if(at<0)continue;
    spans.push({index,start:at,end:at+s.length,owner:seg.owner});used.push([at,at+s.length]);
    if(at>=from)from=at+s.length;
  }
  spans.sort((a,b)=>a.start-b.start);
  return {doc,spans,segments};
}

// 두 글의 바뀐 한 구간. 앞뒤 공통 부분을 뺀다.
export function diffRegion(a,b){
  let s=0;while(s<a.length&&s<b.length&&a[s]===b[s])s++;
  let e=0;while(e<a.length-s&&e<b.length-s&&a[a.length-1-e]===b[b.length-1-e])e++;
  return {start:s,endOld:a.length-e,endNew:b.length-e};
}

// 조각 원문에서 정규화 위치 [a,b)를 바꾼 새 원문.
function replaceNormalized(value,a,b,insert){
  const {text,idx}=normMap(value),len=text.length,end=len?idx[len-1]+1:0;
  const from=a<len?idx[a]:end,to=b<len?idx[b]:end;
  return value.slice(0,from)+insert+value.slice(to);
}

export function mapTextEdit(map,docText){
  const next=norm(docText);
  if(next===map.doc)return {unchanged:true};
  const d=diffRegion(map.doc,next),inserted=next.slice(d.start,d.endNew);
  // 바뀐 구간을 감싸는 조각. 조각 끝에 이어 쓰기(삽입)도 그 조각으로 본다.
  const hit=map.spans.filter(sp=>d.start>=sp.start&&d.endOld<=sp.end);
  if(hit.length!==1){
    const touched=map.spans.filter(sp=>d.start<sp.end&&d.endOld>sp.start);
    return {ok:false,reason:touched.length>1?'두 칸 이상에 걸친 수정(문단 합치기·나누기 등)은 시트에 반영하지 않았습니다. 되돌리거나 시트에서 고치세요.':'시트 칸과 짝을 찾지 못한 글(빈 칸에 처음 쓴 값, 수식이 든 글, 번호·기호·제목 등)을 고쳤습니다. 되돌리고 시트에서 입력하세요.'};
  }
  const sp=hit[0],seg=map.segments[sp.index];
  if(!seg.owner)return {ok:false,reason:'번호·기호·제목처럼 시트 칸에 없는 글을 고쳤습니다. 되돌리거나 시트에서 고치세요.'};
  const prefix=seg.owner.prefix||0,prefixNorm=normMap(seg.value).idx.filter(i=>i<prefix).length;
  const a=d.start-sp.start,b=d.endOld-sp.start;
  if(a<prefixNorm)return {ok:false,reason:'문항 번호·①·ㄱ. 같은 앞머리는 한글 창에서 바꿀 수 없습니다. 시트에서 고치세요.'};
  const full=replaceNormalized(seg.value,a,b,inserted);
  // 빈 칸 자리표(ZWSP)는 데이터에 남기지 않는다.
  const field=full.slice(prefix).replace(/\u200b/g,'').replace(/^\s+/,'');
  return {ok:true,changes:[{index:sp.index,owner:seg.owner,full,value:field}]};
}

// 시트 데이터에 반영한다. 바뀐 칸이 없으면 false.
export function applyTextEdit(q,owner,value){
  const blockOf=id=>{const b=q.blocks.find(x=>x.id===id);if(!b)throw Error('고친 글의 구성을 찾지 못했습니다.');return b;};
  const tableOf=id=>id==='choices'?q.choiceTable:blockOf(id).table;
  switch(owner.kind){
    case 'ask':q.ask=value;return true;
    case 'block':blockOf(owner.id).text=value;return true;
    case 'label':{const v=value.trim();if(!v)throw Error('묶음 이름을 비울 수 없습니다.');blockOf(owner.id).label=v;return true;}
    case 'line':{const l=blockOf(owner.block).lines?.find(x=>x.id===owner.id);if(!l)throw Error('고친 항목을 찾지 못했습니다.');l.text=value;return true;}
    case 'choice':{const c=q.choices.find(x=>x.id===owner.id);if(!c)throw Error('고친 선지를 찾지 못했습니다.');c.text=value;return true;}
    case 'cell':{const t=tableOf(owner.table),cell=t?.cells[owner.r]?.[owner.c];if(!cell)throw Error('고친 표 칸을 찾지 못했습니다.');cell.value=cellValue(value);return true;}
    case 'note':{const t=tableOf(owner.table);if(!t)throw Error('고친 표를 찾지 못했습니다.');t.note=value;return true;}
    default:throw Error('이 글은 시트에 반영할 수 없습니다.');
  }
}
