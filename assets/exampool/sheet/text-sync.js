// 한글 창에서 고친 글을 시트 칸으로 되돌린다.
// 한글 문서 전체 글(공백을 하나로 맞춘 것)에서 생성할 때의 글 조각 위치를 찾아 두고,
// 바뀐 부분이 한 조각 안에 있으면 그 조각의 주인(발문·지문·보기 항목·표 칸·선지)에 반영한다.
// 두 조각에 걸치거나(문단 합치기 등) 번호·기호를 고쳤으면 덮어쓰지 않고 이유를 알린다.
import {cellValue} from './model.js';

// 한글로 넣을 때 바꿔 넣는 괄호(handoff text: 〈〉→<>, 〔〕→[])는 같은 글자로 본다 — 한 글자씩 바뀌어 위치는 그대로.
const SAME={'\u3008':'<','\u3009':'>','\u3014':'[','\u3015':']'};
// 공백 묶음을 한 칸으로 줄이고 앞뒤를 자른 글과, 각 글자의 원래 위치.
export function normMap(value){
  const v=String(value??''),idx=[];let text='',space=false;
  for(let i=0;i<v.length;i++){
    if(/\s/.test(v[i])){if(text)space=true;continue;}
    if(v[i]==='\u2060'||v[i]==='\u0332')continue; // 폭 없는 글자 · 결합 밑줄 문자(밑줄 표시)는 글로 보지 않는다 // 조판이 넣은 폭 없는 글자(줄 첫머리 수식 앞)는 글로 보지 않는다
    if(space){text+=' ';idx.push(i-1);space=false;}
    text+=SAME[v[i]]||v[i];idx.push(i);
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
  return {doc,raw:String(docText??''),spans,segments};
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
  const d0=diffRegion(map.doc,next),ins0=next.slice(d0.start,d0.endNew);
  // 공백을 하나로 맞춘 글에서는 '앞 칸 끝에 이어 쓰기'와 '다음 칸 앞에 쓰기'가 같아 보인다.
  // 원래 문서 글에서 고친 자리 바로 뒤가 문단 나눔이면 앞 칸 쪽, 바로 앞이 문단 나눔이면 다음 칸 쪽을 먼저 본다.
  const rd=diffRegion(map.raw||'',String(docText??'')),old=map.raw||'';
  const rightBreak=/[\r\n]/.test(old[rd.endOld]||''),leftBreak=/[\r\n]/.test(old[rd.start-1]||'');
  // 같은 글자가 이어지면 바뀐 자리를 한 칸씩 옮겨도 같은 결과다(예: '다. ' 뒤 'ABC ' 삽입 = '다.' 뒤 ' ABC').
  const slides=dir=>{const out=[];let r={...d0},ins=ins0;
    for(let k=0;k<4;k++){const cut=ins||map.doc.slice(r.start,r.endOld);if(!cut)break;
      if(dir<0){const c=map.doc[r.start-1];if(c===undefined||c!==cut.at(-1))break;r={start:r.start-1,endOld:r.endOld-1,endNew:r.endNew-1};if(ins)ins=c+ins.slice(0,-1);}
      else{const c=map.doc[r.endOld];if(c===undefined||c!==cut[0])break;r={start:r.start+1,endOld:r.endOld+1,endNew:r.endNew+1};if(ins)ins=ins.slice(1)+c;}
      out.push({r,ins});}
    return out;};
  const order=rightBreak&&!leftBreak?[...slides(-1),{r:d0,ins:ins0},...slides(1)]:[{r:d0,ins:ins0},...slides(1),...slides(-1)];
  const within=r=>map.spans.filter(sp=>r.start>=sp.start&&r.endOld<=sp.end);
  const fits=({r})=>{const h=within(r);if(h.length!==1)return false;const seg=map.segments[h[0].index];if(!seg.owner)return false;const pn=normMap(seg.value).idx.filter(i=>i<(seg.owner.prefix||0)).length;return r.start-h[0].start>=pn;};
  const pick=order.find(fits)||order.find(c=>within(c.r).length===1)||{r:d0,ins:ins0};
  const d=pick.r,inserted=pick.ins,hit=within(d);
  if(hit.length!==1){
    const touched=map.spans.filter(sp=>d.start<sp.end&&d.endOld>sp.start);
    return {ok:false,reason:touched.length>1?'두 칸 이상에 걸친 수정(문단 합치기·나누기 등)은 시트에 반영하지 않았습니다. 되돌리거나 시트에서 고치세요.':'시트 칸과 짝을 찾지 못한 글(빈 칸에 처음 쓴 값, 수식이 든 글, 번호·기호·제목 등)을 고쳤습니다. 되돌리고 시트에서 입력하세요.'};
  }
  const sp=hit[0],seg=map.segments[sp.index];
  if(!seg.owner)return {ok:false,reason:'번호·기호·제목처럼 시트 칸에 없는 글을 고쳤습니다. 되돌리거나 시트에서 고치세요.'};
  const prefix=seg.owner.prefix||0,prefixNorm=normMap(seg.value).idx.filter(i=>i<prefix).length;
  // 꼬리(suffix): [3점]·〔 〕의 닫는 괄호처럼 프로그램이 붙인 끝 글자. 고칠 수 없다.
  const suffix=seg.owner.suffix||0,tailNorm=normMap(seg.value).idx.filter(i=>i>=seg.value.length-suffix).length,segLen=sp.end-sp.start;
  const a=d.start-sp.start,b=d.endOld-sp.start;
  if(a<prefixNorm)return {ok:false,reason:'문항 번호·①·ㄱ. 같은 앞머리는 한글 창에서 바꿀 수 없습니다. 시트에서 고치세요.'};
  if(suffix&&b>segLen-tailNorm)return {ok:false,reason:'[3점]·〔 〕처럼 프로그램이 붙인 글은 한글 창에서 바꿀 수 없습니다. 배점·이름은 시트에서 고치세요.'};
  const full=replaceNormalized(seg.value,a,b,inserted);
  // 빈 칸 자리표(U+2060 등 폭 0 글자)는 데이터에 남기지 않는다.
  const field=full.slice(prefix,full.length-suffix).replace(/[\u200b\u2060]/g,'').replace(/^\s+/,'');
  // 원래 칸 끝에 없던 공백(앞머리 'ㄱ. '의 띄어쓰기 등)은 붙이지 않는다.
  const was=seg.value.slice(prefix,seg.value.length-suffix),value=/\s$/.test(was)?field:field.replace(/\s+$/,'');
  return {ok:true,changes:[{index:sp.index,owner:seg.owner,full,value}]};
}

// 시트 데이터에 반영한다. 바뀐 칸이 없으면 false.
export function applyTextEdit(q,owner,value){
  const blockOf=id=>{const b=q.blocks.find(x=>x.id===id);if(!b)throw Error('고친 글의 구성을 찾지 못했습니다.');return b;};
  const tableOf=id=>id==='choices'?q.choiceTable:blockOf(id).table;
  switch(owner.kind){
    case 'ask':q.ask=value;return true;
    case 'block':blockOf(owner.id).text=value;return true;
    case 'label':{const v=value.trim();if(!v)throw Error('묶음 이름을 비울 수 없습니다.');blockOf(owner.id).label=v;return true;}
    // 상자 안 항목 줄(handoff ITEM_LEAD): 원래 앞머리(keep)를 그대로 두고 그 줄만 바꾼다.
    case 'blockLine':{const blk=blockOf(owner.id),rows=String(blk.text||'').split(/\r?\n/);if(!(owner.line<rows.length))throw Error('고친 항목을 찾지 못했습니다.');rows[owner.line]=(owner.keep||'')+value;blk.text=rows.join('\n');return true;}
    case 'line':{const l=blockOf(owner.block).lines?.find(x=>x.id===owner.id);if(!l)throw Error('고친 항목을 찾지 못했습니다.');l.text=value;return true;}
    case 'choice':{const c=q.choices.find(x=>x.id===owner.id);if(!c)throw Error('고친 선지를 찾지 못했습니다.');c.text=value;return true;}
    case 'cell':{const t=tableOf(owner.table),cell=t?.cells[owner.r]?.[owner.c];if(!cell)throw Error('고친 표 칸을 찾지 못했습니다.');cell.value=cellValue(value);return true;}
    case 'note':{const t=tableOf(owner.table);if(!t)throw Error('고친 표를 찾지 못했습니다.');t.note=value;return true;}
    default:throw Error('이 글은 시트에 반영할 수 없습니다.');
  }
}
