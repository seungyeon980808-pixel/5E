// 11-15 미리보기에서 한글처럼 고친 표 → 문항 카드 표 자료(맨 위 표·바깥 칸 안 표 모두).
// 칸 글(수식은 $…$로), 합친 칸, 열 폭·줄 높이, 칸 모양(바탕색·굵게·기울임·밑줄·글자 색·정렬·칸 선)을 읽는다.
// 고치기 전 모습(before)과 비교해 바뀐 것만 자료에 남긴다 — 그대로인 열 폭·줄 높이·칸 글은 원래 자료 그대로.
import {tidyEquationScript,joinTildeEquations} from './equation-script.js';

const parse=v=>{if(v&&typeof v==='object')return v;try{return JSON.parse(v);}catch{return null;}};
const tryCall=(fn,fallback=null)=>{try{return fn();}catch{return fallback;}};
// 한글 선 종류 → 칸 선 종류(handoff cellStyleCss).
const LINE_TYPE=t=>t===0?'none':t===1?'solid':[3,7].includes(t)?'dotted':t>=8&&t<=11?'double':'dashed';
const clean=v=>String(v??'').replace(/[​⁠﻿]/g,'').replace(/[   -]/g,' ');
const squash=v=>String(v??'').split('\n').map(l=>l.replace(/[ \t]+/g,' ').trim()).join('\n').trim();
// 카드 값이 조판에 들어갈 때 바뀌는 수식 글(tidyEquationScript)까지 맞춰 비교한다 — 고치지 않은 칸은 원래 값을 그대로 둔다.
// 수식($…$)을 뺀 글 — 엔진이 수식 원문을 주지 않는 미리보기 표 칸과 견줄 때.
const plain=v=>squash(clean(String(v??'').replace(/\$[^$\n]+\$/g,' ')));
const asTypeset=v=>squash(clean(joinTildeEquations(String(v??'')).replace(/\$([^$\n]+)\$/g,(m,x)=>`$${tidyEquationScript(x)}$`)));

// 표 자리: sec·ppi(바깥 문단)·ci(표 개체 번호)·prefix(표를 품은 바깥 칸 경로, 맨 위 표면 []).
export function findTable(doc){
  const ctr=parse(doc.getControls())||[],t=ctr.find(c=>c.ctrlId==='tbl'&&c.list===0);
  return t?{sec:0,ppi:t.para,ci:t.controlIndex,prefix:[]}:null;
}

function bounds(values){const out=[];for(const v of values.sort((a,b)=>a-b))if(!out.length||v-out[out.length-1]>1.5)out.push(v);return out;}

// 칸 하나의 글(문단은 줄바꿈, 수식은 $script$ 자리에).
const cellPath=(at,k,p)=>JSON.stringify([...at.prefix,{controlIndex:at.ci,cellIndex:k,cellParaIndex:p}]);
// 칸 글. 맨 위 표는 수식 원문까지($script$), 바깥 칸 안 표(미리보기)는 엔진이 수식 원문을 주지 않아 글만 — 수식 칸은 원래 카드 값과 짝지어 지킨다.
function cellText(doc,at,k,eqLists){
  const path=p=>cellPath(at,k,p),top=!at.prefix.length;
  const n=Math.max(1,Number(tryCall(()=>doc.getCellParagraphCountByPath(at.sec,at.ppi,path(0)),1))||1),lines=[];
  for(let p=0;p<n;p++){
    const len=Number(tryCall(()=>doc.getCellParagraphLengthByPath(at.sec,at.ppi,path(p)),0))||0;
    const got=len?tryCall(()=>doc.getTextInCellByPath(at.sec,at.ppi,path(p),0,len),''):'';const t=parse(got);
    let text=String((t&&typeof t==='object'?t.text:got)??'');
    const eqs=[];if(top)for(let i=0;i<40;i++){const e=parse(tryCall(()=>doc.getEquationProperties(at.sec,at.ppi,i,k,p)));if(!e||typeof e.script!=='string')break;eqs.push(e.script);}
    if(eqs.length){const pos=(eqLists.get(k)?.get(p)||[]).slice(0,eqs.length);
      // 자리를 모르면(엔진 목록과 수가 다르면) 글 끝에 차례로 붙인다.
      const at2=pos.length===eqs.length?pos:eqs.map(()=>text.length);
      for(let i=eqs.length-1;i>=0;i--){const o=Math.max(0,Math.min(text.length,at2[i]));text=text.slice(0,o)+`$${eqs[i].trim()}$`+text.slice(o);}}
    lines.push(text);
  }
  return squash(clean(lines.join('\n')));
}

// 엔진 목록(getControls)의 칸 속 수식 → 칸·문단별 글자 자리. 목록 번호(list)는 칸 차례대로 매겨지므로, 수식이 든 칸 차례와 짝짓는다.
function equationPositions(doc,at,cells){
  if(at.prefix.length)return new Map();
  const ctr=(parse(doc.getControls())||[]).filter(c=>c.ctrlId==='eqed'&&c.list>0);
  const byList=new Map();for(const c of ctr){if(!byList.has(c.list))byList.set(c.list,[]);byList.get(c.list).push(c);}
  const withEq=cells.filter(k=>parse(tryCall(()=>doc.getEquationProperties(at.sec,at.ppi,0,k,0)))||[1,2,3].some(p=>parse(tryCall(()=>doc.getEquationProperties(at.sec,at.ppi,0,k,p)))));
  const lists=[...byList.keys()].sort((a,b)=>a-b),out=new Map();
  if(lists.length!==withEq.length)return out;
  lists.forEach((l,i)=>{const m=new Map();for(const c of byList.get(l)){if(!m.has(c.para))m.set(c.para,[]);m.get(c.para).push(c.pos);}for(const v of m.values())v.sort((a,b)=>a-b);out.set(withEq[i],m);});
  return out;
}

function cellStyle(doc,at,k){
  const path=cellPath(at,k,0);
  const cp=parse(tryCall(()=>doc.getCellPropertiesByPath(at.sec,at.ppi,path)))||{};
  const ch=parse(tryCall(()=>doc.getCellCharPropertiesAtByPath(at.sec,at.ppi,path,0)))||{};
  // 문단 정렬: 맨 위 표는 칸 문단 모양으로, 바깥 칸 안 표는 칸 글 HTML(text-align)로 읽는다(수식 칸은 읽지 못해 원래 값을 지킨다 → alignKnown).
  let pa=null;if(!at.prefix.length)pa=parse(tryCall(()=>doc.getCellParaPropertiesAt(at.sec,at.ppi,at.ci,k,0)));
  else{const len=Number(tryCall(()=>doc.getCellParagraphLengthByPath(at.sec,at.ppi,path),0))||0,html=String(tryCall(()=>doc.exportSelectionInCellHtmlByPath(at.sec,at.ppi,path,0,0,0,Math.max(len,1)),'')||'');
    const m=html.match(/<p[^>]*text-align:\s*(left|right|center|justify)/i);if(m)pa={alignment:m[1].toLowerCase()};}
  pa=pa||{};
  const s={};if(!pa.alignment)Object.defineProperty(s,'alignUnknown',{value:true});
  if(cp.fillType&&cp.fillType!=='none'&&/^#[0-9a-f]{6}$/i.test(cp.fillColor||'')&&cp.fillColor.toLowerCase()!=='#ffffff')s.bg=cp.fillColor.toLowerCase();
  if(ch.bold)s.bold=true;if(ch.italic)s.italic=true;if(ch.underline)s.underline=true;
  if(/^#[0-9a-f]{6}$/i.test(ch.textColor||'')&&ch.textColor.toLowerCase()!=='#000000')s.color=ch.textColor.toLowerCase();
  if(['left','right','justify'].includes(pa.alignment))s.align=pa.alignment;
  if(cp.verticalAlign===0)s.valign='top';else if(cp.verticalAlign===2)s.valign='bottom';
  const sides={top:cp.borderTop,right:cp.borderRight,bottom:cp.borderBottom,left:cp.borderLeft},lines={};let plain=true;
  for(const [key,b] of Object.entries(sides)){if(!b)continue;const type=LINE_TYPE(Number(b.type));lines[key]={type,width:Number(b.width)||0,color:/^#[0-9a-f]{6}$/i.test(b.color||'')?b.color.toLowerCase():'#000000'};
    if(type!=='solid'||lines[key].width>1||lines[key].color!=='#000000')plain=false;}
  if(!plain)s.lines=lines;
  return Object.keys(s).length||s.alignUnknown?s:null;
}

// 문서의 표 모습: 칸 상자·행열·합친 칸·열 폭·줄 높이·칸 글·칸 모양.
export function snapshotTable(doc){const at=findTable(doc);if(!at)throw Error('표를 찾지 못했습니다.');return snapshotTableAt(doc,at);}
export function snapshotTableAt(doc,at){
  at={sec:at.sec??0,ppi:at.ppi,ci:at.ci,prefix:at.prefix||[]};
  const boxes=(parse(doc.getTableCellBboxesByPath(at.sec,at.ppi,cellPath(at,0,0)))||[]).filter(b=>b&&Number.isInteger(b.row));
  if(!boxes.length)throw Error('표 칸을 읽지 못했습니다.');
  const rows=Math.max(...boxes.map(b=>b.row+(b.rowSpan||1))),cols=Math.max(...boxes.map(b=>b.col+(b.colSpan||1)));
  if(rows>30||cols>12)throw Error(`표는 30줄·12칸까지입니다(지금 ${rows}줄 × ${cols}칸).`);
  const xs=bounds(boxes.flatMap(b=>[b.x,b.x+b.w])),ys=bounds(boxes.flatMap(b=>[b.y,b.y+b.h]));
  const colPx=xs.length===cols+1?xs.slice(1).map((v,i)=>v-xs[i]):Array(cols).fill((xs.at(-1)-xs[0])/cols);
  const rowPx=ys.length===rows+1?ys.slice(1).map((v,i)=>v-ys[i]):Array(rows).fill((ys.at(-1)-ys[0])/rows);
  const eqPos=equationPositions(doc,at,boxes.map(b=>b.cellIdx));
  const cells=Array.from({length:rows},()=>Array.from({length:cols},()=>({value:''}))),merges=[];
  for(const b of boxes){const c=cells[b.row][b.col];c.value=cellText(doc,at,b.cellIdx,eqPos);c.text=c.value;const st=cellStyle(doc,at,b.cellIdx);if(st){if(st.alignUnknown)c.alignUnknown=true;if(Object.keys(st).length)c.style={...st};}
    if((b.rowSpan||1)>1||(b.colSpan||1)>1)merges.push({r:b.row,c:b.col,rs:b.rowSpan||1,cs:b.colSpan||1});}
  return {rows,cols,cells,merges,colPx,rowPx,nested:at.prefix.length>0};
}

const near=(a,b,tol=1.5)=>a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<=tol);
const round=v=>Math.round(v*100)/100;

// 고치기 전 모습(before) · 고친 뒤 모습(after) · 원래 카드 표(base) → 새 카드 표.
export function tableFromSnapshot(base,before,after){
  const same=after.rows===before.rows&&after.cols===before.cols&&JSON.stringify(after.merges)===JSON.stringify(before.merges);
  const t={...structuredClone(base),rows:after.rows,cols:after.cols,merges:after.merges};
  t.headerRows=Math.min(base.headerRows||0,after.rows);
  // 줄·칸이 바뀌었으면 글이 같은 칸들로 옮겨 간 자리(dr,dc)를 어림한다 — 수식 칸(엔진이 수식 원문을 안 주는 미리보기 표)을 원래 값과 짝짓는 데 쓴다.
  let shift=[0,0];if(!same){const votes=new Map();after.cells.forEach((row,r)=>row.forEach((cell,c)=>{const v=squash(cell.value);if(!v)return;const hits=[];(base.cells||[]).forEach((brow,br)=>brow.forEach((bc,bcI)=>{if(plain(bc.value)===v)hits.push([r-br,c-bcI]);}));if(hits.length===1){const k=hits[0].join(',');votes.set(k,(votes.get(k)||0)+1);}}));
    const best=[...votes].sort((a,b)=>b[1]-a[1])[0];if(best)shift=best[0].split(',').map(Number);}
  t.cells=after.cells.map((row,r)=>row.map((cell,c)=>{
    const old=same?base.cells?.[r]?.[c]:base.cells?.[r-shift[0]]?.[c-shift[1]]||null,out={value:cell.value};
    // 고치지 않은 칸은 원래 값(수식 원문·띄어쓰기 그대로). 미리보기 표는 수식을 뺀 글로 비교한다.
    if(old&&(asTypeset(old.value)===squash(cell.value)||after.nested&&String(old.value).includes('$')&&plain(old.value)===squash(cell.value)))out.value=old.value;
    if(old?.figure)out.figure=old.figure;if(old?.raw!==undefined&&out.value===old.value)out.raw=old.raw;
    const style={...(cell.style||{})};if(cell.alignUnknown&&old?.style?.align)style.align=old.style.align;if(Object.keys(style).length)out.style=style;
    return out;}));
  // 합친 칸 뒤에 숨은 칸은 비운다(카드 표 규칙).
  for(const m of t.merges)for(let r=m.r;r<m.r+m.rs;r++)for(let c=m.c;c<m.c+m.cs;c++)if(r!==m.r||c!==m.c)t.cells[r][c]={value:''};
  // 열 폭: 바뀐 때만 비율로 남긴다. 기출 표(원본 열 폭)는 열 수가 같으면 원본 단위로 고쳐 적는다.
  // 열 수가 같으면 열 폭이 실제로 바뀐 때만 고정한다(합치기·글만 고친 표는 예전처럼 글 길이로 나눔). 열 수가 바뀌면 글 길이로 다시 나눈다.
  // viewRatio는 카드 칸 그림에만 쓰는 지금 모습(조판과 같은 비율로 보이게) — 조판 폭은 정하지 않는다.
  t.viewRatio=after.colPx.map(round);
  const widthChanged=after.cols===before.cols&&!near(after.colPx,before.colPx);
  if(widthChanged){const total=after.colPx.reduce((a,b)=>a+b,0);
    if(Array.isArray(base.colWidths)&&base.colWidths.length===after.cols&&after.cols===before.cols){const sum=base.colWidths.reduce((a,b)=>a+Number(b),0);t.colWidths=after.colPx.map(v=>round(v*sum/total));}
    else{delete t.colWidths;delete t.rowHeights;t.colRatio=after.colPx.map(round);const was=before.colPx.reduce((a,b)=>a+b,0);if(Math.abs(total-was)>1.5||Array.isArray(base.colRatio))t.colTotal=round(total);else delete t.colTotal;}}
  // 줄 높이: 바뀐 줄만(한글처럼 키운 높이는 minRowPx — 글이 들어가는 높이보다 작게는 안 줄어든다).
  const rowChanged=after.rows===before.rows&&!near(after.rowPx,before.rowPx);
  if(rowChanged){const prev=Array.isArray(base.minRowPx)?base.minRowPx:[];const next=after.rowPx.map((v,r)=>Math.abs(v-before.rowPx[r])<=1.5?Number(prev[r])||0:round(v));
    if(next.some(v=>v>0))t.minRowPx=next;else delete t.minRowPx;}
  else if(after.rows!==before.rows)delete t.minRowPx;
  return t;
}
