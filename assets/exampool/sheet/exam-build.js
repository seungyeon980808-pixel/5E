// 저장한 문항 조판(한 단 폭 문항 용지)을 2단 시험지 한 문서로 모은다(문항들이 모두 B4로 조판됐으면 B4, 아니면 A4).
// 문항 용지의 본문 폭은 시험지 한 단과 같아서, 문단을 그대로 옮기면 줄바꿈이 유지된다. HTML로 다시 만들지 않는다.
import {pageProfile,spaceEquationOverlaps} from './typeset-model.js?v=1014-compact-panel';
import {openApprovedQuestion,nativeInsertOptions} from './native-transfer.js?v=1014-compact-panel';
import {examPlan,paperMixMessage,paginateQuestions} from './exam-layout.js';

const parse=v=>typeof v==='string'?JSON.parse(v):v;

// 문항 문서들을 차례로 시험지 한 문서에 옮긴다. open(item)은 그 문항의 한글 문서를 연다(닫기는 여기서).
// 돌려주는 ranges: 문항마다 시험지 문서 안의 문단 범위 [start,end).
// between: 문항 하나를 넣을 때마다 기다릴 일(화면이 멈추지 않게 잠깐 쉬기). 없으면 쉬지 않는다.
// template(10-22 S3): 학교 양식 문서(열린 것)를 주면 그 위에 묶는다 — 양식의 쪽·단·머리말·제목 표는 그대로 두고,
// bodyStart(첫 문항 문단)부터 끝까지 지운 자리에 문항을 붙인다. 쪽 배치(단 나누기)는 양식이 흘리는 대로 둔다.
// tailStart(10-29): 문항 뒤 꼬리(「◇ 끝 ◇」·답지 안내)가 시작하는 문단 — 그 앞까지만 비우고 꼬리는 남긴다. 돌려주는 값: 문항을 넣을 문단 자리.
// 꼬리가 있으면 문항은 꼬리 첫 문단 앞에 차례로 넣는다.
export function clearFormBody(target,bodyStart,tailStart=-1){
  const count=target.getParagraphCount(0);if(bodyStart<0||bodyStart>=count)return count;
  const end=tailStart>bodyStart&&tailStart<count?tailStart:count;
  for(let p=end-1;p>=Math.max(1,bodyStart);p--){const r=parse(target.deleteParagraph(0,p));if(r&&r.ok===false)throw Error('양식의 예시 문항을 비우지 못했습니다.');}
  if(bodyStart===0){const n=target.getParagraphLength(0,0);if(n)target.deleteText(0,0,0,n);}
  return Math.max(1,bodyStart);
}
// breaks(10-29): 학교 양식 위에서 그 앞에 단 나누기를 넣을 문항 id(그린 결과로 단에 걸친다고 본 문항).
export async function assembleExamDocument(Document,{items,pages,sheet,open,between,template=null,bodyStart=-1,tailStart=-1,breaks=null,keepTogether=true}){
  // 단이 시작되는 문항: 그 앞에 단 나누기를 넣는다(첫 문항 제외).
  const starts=new Set();for(const page of pages)for(const column of page.columns)if(column.length)starts.add(column[0]);
  const target=template||Document.createEmpty(),ranges=new Map();
  try{
    // at: 다음 문항을 넣을 문단 자리. 빈 시험지·꼬리 없는 양식은 늘 끝(문단 수).
    let at=-1;
    if(template){const start=clearFormBody(target,bodyStart,tailStart);if(start<target.getParagraphCount(0))at=start;}
    else{target.createBlankDocument();
      const config=pageProfile({paper:sheet.paper,columns:sheet.columns});
      target.setPageDef(0,JSON.stringify(config.page));target.setColumnDef(0,sheet.columns,0,true,config.spacing);
      // 맨 위 빈 문단(쪽·단 설정이 든 문단이라 지우지 못함)은 줄 높이를 거의 0으로 — 첫 단만 한 줄 아래에서 시작해 옆 단과 위 끝이 어긋나지 않게(10-23).
      // 빈 문단의 줄 높이는 글자 크기를 따르므로 폭 없는 글자(U+2060) 하나를 1pt로 둔다(문항 조판의 빈 칸과 같은 방법).
      target.insertText(0,0,0,'\u2060');target.applyCharFormat(0,0,0,1,JSON.stringify({fontSize:100}));target.applyParaFormat(0,0,JSON.stringify({lineSpacingType:'Percent',lineSpacing:100,spacingBefore:0,spacingAfter:0}));}
    for(const [i,item] of items.entries()){
      const source=await open(item);
      try{
        const before=at>=0?at:target.getParagraphCount(0),count0=target.getParagraphCount(0);
        const result=parse(target.importParagraphBlock(source,nativeInsertOptions(source,0,before)));
        if(!result?.operationResult?.result?.inserted&&result?.ok===false)throw Error(`${item.q.number}번 문항을 시험지에 넣지 못했습니다.`);
        // 첫 문항: 단 맨 위 문단처럼 「문단 위」 간격 없이(엔진은 단 나누기 뒤 첫 문단의 위 간격을 빼므로 옆 단 문항과 위 끝을 맞춘다).
        if(!template&&i===0)target.applyParaFormat(0,before,JSON.stringify({spacingBefore:0}));
        // 단 나누기는 넣은 문항의 첫 문단 앞에 건다(10-23 지적 2). 앞 문항 끝 문단에 걸면, 그 문단이 표(그림 선지 등)뿐일 때
        // 글 길이가 0이라 표 앞에서 나뉘어 앞 문항의 선지가 다음 단·쪽으로 넘어갔다.
        if(template?breaks?.has(item.id):i>0&&starts.has(item.id)){
          // 학교 양식(10-30): 첫 문단이 글 없이 그림·표만 든 문단(글 옆 그림 문항)이면 엔진이 나눌 때 개체를 앞 단에 남긴다 —
          // 폭 없는 글자(U+2060)를 맨 앞에 두면 개체까지 새 단으로 같이 간다(9·25번 실측).
          if(template&&!target.getParagraphLength(0,before))target.insertText(0,before,0,'\u2060');
          const r=parse(target.insertColumnBreak(0,before,0));
          if(r&&r.ok===false)throw Error('시험지의 단 나누기를 넣지 못했습니다.');
          // 학교 양식(10-31): 문단 맨 앞에서 나누면 빈 앞 문단이 남아 앞 단 끝에 한 줄을 차지한다 — 앞 단이 꽉 차면 그 빈 줄만 다음 단으로 넘어가고
          // 나누기가 단을 하나 더 넘겨 단이 통째로 비었다(14번). 나누기는 뒤 문단에 걸리므로 빈 앞 문단은 지운다.
          if(template&&r?.paraIdx===before+1&&!target.getParagraphLength(0,before))target.deleteParagraph(0,before);
        }
        // 「다음 문단과 함께」(10-23 지적 2): 문항의 마지막 문단을 뺀 모든 문단에 걸어 엔진이 문항 중간(발문·〈보기〉·선지 사이)에서 단을 나누지 않게 한다.
        const end=before+target.getParagraphCount(0)-count0;
        // 학교 양식(keepTogether 거짓, 10-31)은 묶지 않는다 — 단 나누기를 미리 계산해 넣는데, 엔진이 묶음 때문에 문항을 스스로 다음 단으로 넘기면
        // 그 앞 단 나누기가 한 단을 더 넘겨 단이 통째로 비었다(5쪽). 한 단보다 긴 문항을 묶으면 쪽 밖·꼬리말 위로 그리기도 했다(31번).
        if(keepTogether)for(let p=before;p<end-1;p++)target.applyParaFormat(0,p,JSON.stringify({keepWithNext:true}));
        // 문항 아래 여백(10-23 지적 9): 문항 마지막 문단의 「문단 아래」 간격으로 넣는다(1pt = 200).
        if(item.after>0){const last=end-1;target.applyParaFormat(0,last,JSON.stringify({spacingAfter:Math.round(item.after*72/25.4*200)}));}
        ranges.set(item.id,[before,end]);if(at>=0)at=end;
      }finally{source.free();}
      if(between&&i<items.length-1)await between();
    }
    return {document:target,ranges};
  }catch(e){target.free();throw e;}
}

// 그린 결과로 본 문항 자리(10-23 지적 2): 문항마다 맨 바깥 글 줄·그림·표가 놓인 첫 자리와 끝 자리(쪽 × 단 수 + 단).
// 어림 높이로 나눈 단이 실제와 달라 선지만 다음 단·쪽으로 흘러가는지 여기서 잡는다.
// skip(10-30): 문항 자리로 치지 않을 맨 바깥 개체(「다음 면에 계속」 표시 표 — 문항 끝 문단에 달려 쪽 바닥에 떠 있다).
export function itemPlaces(doc,ranges,columns,skip=null){
  const out=new Map();
  for(const [id,pieces] of itemBoxes(doc,ranges,columns,skip,{blank:false})){const at=[...pieces.keys()];out.set(id,{first:Math.min(...at),last:Math.max(...at)});}
  return out;
}
// 문항 조각(10-31): 문항마다 단 자리(at)별 위·아래 끝(px)과 그 단에 든 마지막 문단.
export function itemBoxes(doc,ranges,columns,skip=null,{blank=true}={}){
  const pd=parse(doc.getPageDef(0)),mL=pd.marginLeft/75,colW=(pd.width-pd.marginLeft-pd.marginRight)/75/columns;
  const colOf=x=>Math.max(0,Math.min(columns-1,Math.floor((x+1-mL)/colW))),spans=[...ranges].map(([id,[a,b]])=>({id,a,b})),out=new Map();
  for(let page=0;page<doc.pageCount();page++){
    // 표 안에 든 표·그림이 칸 경로 없이 엉뚱한 문단 번호로 보고될 때가 있다(rhwp 0.8.7) → 다른 맨 바깥 표·그림 안에 완전히 들어가면 뺀다.
    const ctl=(parse(doc.getPageControlLayout(page)).controls||[]).filter(c=>!(c.cellPath||[]).length&&[c.x,c.y,c.w,c.h].every(Number.isFinite)&&!skip?.(c));
    const inside=(c,o)=>o!==c&&o.x<=c.x+.5&&o.y<=c.y+.5&&o.x+o.w>=c.x+c.w-.5&&o.y+o.h>=c.y+c.h-.5&&o.w*o.h>c.w*c.h;
    // 빈 줄(문항 끝 빈 문단 등)도 센다(10-31): 빼고 재면 빈 줄만 다음 단으로 넘어가 그 뒤 단 나누기가 단 하나를 통째로 비웠다(5쪽).
    // blank 거짓(빈 시험지 걸침 검사, 예전 그대로): 보이는 글만 센다.
    const marks=[...(parse(doc.getPageTextLayout(page)).runs||[]).filter(r=>blank||String(r.text||'').replace(/\u2060/g,'').trim()),...ctl.filter(c=>!ctl.some(o=>inside(c,o)))];
    for(const r of marks){
      if((r.cellPath||[]).length||(r.secIdx??0)!==0||!Number.isFinite(r.x))continue;
      const span=spans.find(x=>r.paraIdx>=x.a&&r.paraIdx<x.b);if(!span)continue;
      // 첫 문단의 빈 조각은 빼다 — 단 나누기를 건 첫 문단은 나누기 앞 빈 줄이 앞 단에 남는다.
      if(!r.type&&r.paraIdx===span.a&&!String(r.text||'').replace(/\u2060/g,'').trim())continue;
      const at=page*columns+colOf(r.x),top=r.y,bottom=r.y+(r.h||0);
      if(!out.has(span.id))out.set(span.id,new Map());const pieces=out.get(span.id),o=pieces.get(at);
      if(!o)pieces.set(at,{top,bottom,para:r.paraIdx});else{o.top=Math.min(o.top,top);o.bottom=Math.max(o.bottom,bottom);o.para=Math.max(o.para,r.paraIdx);}
    }
  }
  return out;
}
// 묶고 → 그린 결과로 확인 → 걸친 문항은 그 앞에서 단을 나눠 다시 묶는다(안 바뀔 때까지, 많아야 문항 수만큼).
// 단 맨 위에서 시작했는데도 걸치는 문항은 한 단보다 길어 옮겨도 소용없으므로 그대로 두고 tall로 알린다.
export async function assembleExamChecked(Document,{items,sheet,open,between}){
  const forced=new Set();
  for(;;){
    const plan=items.map(x=>forced.has(x.id)?{...x,breakBefore:true}:x),pages=paginateQuestions(plan,{height:sheet.heightMm,columns:sheet.columns,gap:sheet.gapMm});
    const built=await assembleExamDocument(Document,{items:plan,pages,sheet,open,between});
    const places=itemPlaces(built.document,built.ranges,sheet.columns),tops=new Set(pages.flatMap(p=>p.columns.map(c=>c[0]).filter(Boolean)));
    const split=items.filter(x=>{const o=places.get(x.id);return o&&o.first!==o.last;}),next=split.find(x=>!tops.has(x.id)&&!forced.has(x.id));
    if(!next||forced.size>=items.length)return {...built,pages,moved:[...new Set([...pages.flatMap(p=>p.moved||[]),...forced])],tall:split.map(x=>x.id)};
    built.document.free();forced.add(next.id);
  }
}

// 남길 것(10-29 시안 ①): keep.head 머리 표 · keep.score 상자 · keep.foot 꼬리말. 끈 것만 지운다(문단은 남겨 문단 번호가 그대로).
export function applyFormKeep(doc,structure,keep={}){
  for(const part of [...(structure.parts||[])].reverse()){const on=part.kind==='head'?keep.head:keep.score;if(on===false){try{doc.deleteTableControl(0,part.para,part.ctrl);}catch{}}}
  if(keep.foot===false){let list=[];try{list=parse(doc.getHeaderFooterList()).items||[];}catch{}for(const it of list){try{doc.deleteHeaderFooter(it.sectionIdx,it.isHeader,it.applyTo);}catch{}}}
}
// 머리 표(10-31): 쪽 맨 위 첫 문단에 떠 있는 표가 「문단 기준」이면, 내용이 오른쪽 단까지 흐를 때 엔진이 왼쪽 단 표·글을 그 높이만큼 한 번 더 내렸다
// (1번 자리 문항의 표가 발문과 겹침). 첫 문단은 쪽 본문 맨 위라 「쪽 기준, 오프셋 0」과 보이는 자리가 같다 — 그렇게 바꿔 둔다.
export function pinFormHead(doc,structure){
  for(const part of structure.parts||[]){if(part.kind!=='head'||part.para!==0)continue;
    try{const t=parse(doc.getTableProperties(0,part.para,part.ctrl));
      // 글자처럼 놓인 머리 표가 단보다 넓으면(11-01 밤샘 가짜 양식 f01: 2단 양식에 쪽 너비 제목 표를 글 속에 넣음) 옆 단 글과 겹친다 —
      // 대왕중처럼 단 위에 떠서 글을 위아래로 밀어내는 표로 바꾼다(모양·크기는 그대로).
      if(t.treatAsChar){const cols=parse(doc.getPageInfo(0)).columns||[];if(cols.length>1&&t.tableWidth/75>cols[0].width+2)doc.setTableProperties(0,part.para,part.ctrl,JSON.stringify({treatAsChar:false,textWrap:'TopAndBottom',vertRelTo:'Para',vertAlign:'Top',vertOffset:0,horzRelTo:'Column',horzAlign:'Left',horzOffset:0}));}}catch{}}
  // 단보다 넓은 떠 있는 양식 표(머리 표 · 제목 상자 · 결재란)는 쪽에 고정한다 — 문단에 붙어 있으면 엔진이 옆 단 글을 밀어내지 않아
  // 오른쪽 단 첫 문항이 제목 상자 위에 그려졌다(11-01 밤샘 대왕중 원안지 양식). 지금 그려진 자리 그대로 두도록 쪽 기준 위치를 재서 맞춘다.
  const bodyStart=structure.firstQuestion>=0?structure.firstQuestion:1,cols=parse(doc.getPageInfo(0)).columns||[],colW=cols[0]?.width||Infinity;
  const look=()=>(parse(doc.getPageControlLayout(0)).controls||[]).filter(c=>c.type==='table'&&!(c.cellPath||[]).length&&c.paraIdx<bodyStart);
  const want=look().filter(c=>c.w>colW*1.5).map(c=>{let t;try{t=parse(doc.getTableProperties(0,c.paraIdx,c.controlIdx));}catch{return null;}return t.treatAsChar?null:{p:c.paraIdx,ci:c.controlIdx,y:c.y,off:Math.round(c.y*75)};}).filter(Boolean);
  // 1단 양식은 예전 규칙 그대로(머리 표를 쪽 맨 위에 고정) — 재서 맞춘 자리로 고정하면 엔진이 1단 글을 표 아래로 밀지 않아 겹쳤다(11-01 밤샘 f14).
  if(cols.length<2){for(const part of structure.parts||[]){if(part.kind!=='head'||part.para!==0)continue;try{const t=parse(doc.getTableProperties(0,part.para,part.ctrl));if(!t.treatAsChar&&t.vertRelTo==='Para'&&!t.vertOffset)doc.setTableProperties(0,part.para,part.ctrl,JSON.stringify({vertRelTo:'Page',vertOffset:0}));}catch{}}return;}
  if(!want.length)return;
  for(let round=0;round<3;round++){
    for(const w of want)try{doc.setTableProperties(0,w.p,w.ci,JSON.stringify({vertRelTo:'Page',vertAlign:'Top',vertOffset:w.off}));}catch{}
    const now=look();let off=false;for(const w of want){const c=now.find(c=>c.paraIdx===w.p&&c.controlIdx===w.ci);if(c&&Math.abs(c.y-w.y)>.5){w.off+=Math.round((w.y-c.y)*75);off=true;}}
    if(!off)break;
  }
}
// 「[배점 현황]」 상자(10-29): 「총 31문항」과 「4문항×2점 + … = 100점」을 넣은 문항에 맞춰 다시 쓴다. 다른 줄·글자 모양은 그대로.
export function fillFormScore(doc,structure,questions){
  const part=(structure.parts||[]).find(p=>p.score);if(!part||!questions.length)return false;
  const objective=questions.filter(q=>q.type!=='서술형'),essay=questions.filter(q=>q.type==='서술형');
  const formula=list=>{const by=new Map();for(const q of list){const v=Number(q.points)||0;by.set(v,(by.get(v)||0)+1);}const keys=[...by.keys()].sort((a,b)=>a-b);return keys.map(v=>`${by.get(v)}문항×${v}점`).join(' + ')+` = ${Math.round(list.reduce((a,q)=>a+(Number(q.points)||0),0)*100)/100}점`;};
  let changed=false;
  part.lines.forEach((text,k)=>{
    const pick=/서술/.test(text)?essay:/선택|객관/.test(text)?objective:questions;let next=text;
    if(/총\s*\d+\s*문항/.test(text))next=text.replace(/(총\s*)\d+(\s*문항)/,`$1${pick.length}$2`);
    else if(/\d+\s*문항\s*[×xX*]\s*\d/.test(text)&&/=\s*\d/.test(text))next=formula(/서술/.test(text)?essay:objective.length?objective:questions);
    // 「= 합계」 없이 「4문항×4점 + 16문항×5.25점」만 적은 줄은 합계 없이 다시 쓴다(11-02 밤샘 가짜 양식).
    else if(/^\s*\d+\s*문항\s*[×xX*]\s*\d/.test(text))next=formula(/서술/.test(text)?essay:objective.length?objective:questions).replace(/\s*=\s*[\d.]+점$/,'');
    // 다른 학교 표현(11-02 밤샘): 「선택형 20문항」「논술형 00문항」「(총100점 만점)」도 담은 문항으로 고친다(대왕중 원안지 양식 · 가짜 양식).
    else{const total=Math.round(questions.reduce((a,q)=>a+(Number(q.points)||0),0)*100)/100;
      next=next.replace(/((?:선택형|객관식)\s*:?\s*)\d+(\s*문항)/g,(m,a,b)=>a+objective.length+b).replace(/((?:서술형|논술형)\s*:?\s*)\d+(\s*문항)/g,(m,a,b)=>a+essay.length+b);
      if(!/=\s*\d/.test(text))next=next.replace(/(총\s*)\d+(?:\.\d+)?(\s*점)/,`$1${total}$2`);}
    if(next===text)return;
    const len=doc.getCellParagraphLength(0,part.para,part.ctrl,0,k),lead=String(doc.getTextInCell(0,part.para,part.ctrl,0,k,0,len)).search(/\S/);
    const from=Math.max(0,lead),body=String(doc.getTextInCell(0,part.para,part.ctrl,0,k,0,len)).trim().length;
    doc.deleteTextInCell(0,part.para,part.ctrl,0,k,from,body);doc.insertTextInCell(0,part.para,part.ctrl,0,k,from,next.trim());changed=true;
  });
  return changed;
}
// 「☞ 다음 면에 계속」(10-30 사용자 결정): 마지막 쪽만 빼고 쪽마다 오른쪽 단 맨 아래 고정 자리(오른쪽 맞춤).
// 자리는 오른쪽 단 맨 아래 한 줄(쪽 테두리 안). 아래 여백을 줄이면 양식의 쪽 테두리 밖으로 나가서(10-30 실측) 여백은 그대로 둔다.
// 그 줄에 걸리는 문항은 걸침 검사가 다음 단으로 넘긴다.
// 표시는 테두리 없는 한 칸 표(쪽 기준으로 떠 있음)에 양식 표시 문단의 글·글자 모양·문단 모양을 그대로 담는다.
// 엔진은 글 있는 문단에 표를 만들면 문단을 쪼갠다 — 양식 사본(source, 버릴 문서)에 표만 든 1pt 높이 문단을 만들어 두고 옮겨 붙인다.
export function reserveNextMark(doc,source,markPara,columns=2){
  if(markPara<0)return null;
  const J=JSON.stringify,len=source.getParagraphLength(0,markPara),raw=String(source.getTextRange(0,markPara,0,len)),text=raw.trim();if(!text)return null;
  const at=Math.max(0,raw.search(/\S/)),char=parse(source.getCharPropertiesAt(0,markPara,at)),shape=parse(source.getParaPropertiesAt(0,markPara,0));
  const height=Math.round((Number(char.fontSize)||1000)*1.4)+300,page=parse(doc.getPageDef(0)),width=Math.round((page.width-page.marginLeft-page.marginRight)/Math.max(1,columns)-1000),none={type:0,width:0,color:'#000000'};
  const tiny=p=>{if(!source.getParagraphLength(0,p))source.insertText(0,p,0,'⁠');source.applyCharFormat(0,p,0,1,J({fontSize:100}));source.applyParaFormat(0,p,J({lineSpacingType:'Percent',lineSpacing:100,spacingBefore:0,spacingAfter:0,keepWithNext:false,pageBreakBefore:false}));};
  source.deleteText(0,markPara,0,len);tiny(markPara);
  const r=parse(source.createTable(0,markPara,1,1,1));if(r?.ok===false)return null;
  const p=r.paraIdx,ci=r.controlIdx,t0=parse(source.getTableProperties(0,p,ci));
  source.setTableProperties(0,p,ci,J({treatAsChar:false,textWrap:'InFrontOfText',vertRelTo:'Paper',vertAlign:'Top',vertOffset:Math.round(page.height-page.marginBottom-page.marginFooter-height),horzRelTo:'Paper',horzAlign:'Left',horzOffset:Math.round(page.width-page.marginRight-width),allowOverlap:false,paddingTop:0,paddingBottom:0}));
  source.resizeTableCells(0,p,ci,J([{cellIdx:0,widthDelta:width-t0.tableWidth}]));
  source.setCellProperties(0,p,ci,0,J({borderLeft:none,borderRight:none,borderTop:none,borderBottom:none}));
  source.insertTextInCell(0,p,ci,0,0,0,text);
  try{source.setCellParaShapeId(0,p,ci,0,0,shape.paraShapeId);}catch{}
  try{source.setCharShapeIdInCell(0,p,ci,0,0,0,text.length,char.charShapeId);}catch{}
  // 표 문단 앞에 1pt 글자를 두면 표 컨트롤 순서가 바뀔 수 있어 표가 든 문단은 문단 모양만 줄인다.
  source.applyParaFormat(0,p,J({lineSpacingType:'Percent',lineSpacing:100,spacingBefore:0,spacingAfter:0,keepWithNext:false,pageBreakBefore:false}));
  return {text,height,source,para:p};
}
// 쪽마다 그 쪽에서 끝나는 마지막 문단 뒤에 표시 문단을 붙인다(뒤 쪽부터 — 앞 쪽 문단 번호는 그대로). 늘어난 문단만큼 문항 범위를 민다.
export function placeNextMarks(doc,mark,bodyStart,ranges){
  const marks=(page,count)=>[...(parse(doc.getPageTextLayout(page)).runs||[]),...(parse(doc.getPageControlLayout(page)).controls||[])].filter(r=>!(r.cellPath||[]).length&&(r.secIdx??0)===0&&Number.isInteger(r.paraIdx)&&r.paraIdx>=bodyStart&&r.paraIdx<count);
  const pd=parse(doc.getPageDef(0)),mid=pd.width/75/2,count=doc.getParagraphCount(0),anchors=[],missing=[];
  // 표시 문단(1pt)은 그 쪽 왼쪽 단의 마지막 문단 뒤에 붙인다(10-31): 오른쪽 단 끝에 붙이면 단이 꽉 찼을 때 다음 쪽으로 밀려
  // 표시가 다음 쪽에 그려지고 그 뒤 문항이 꼬리말 위로 밀렸다(31번). 왼쪽 단에서 넘치면 같은 쪽 오른쪽 단으로 갈 뿐이다.
  for(let page=0,pages=doc.pageCount();page<pages-1;page++){
    const next=new Set(marks(page+1,count).map(r=>r.paraIdx)),here=marks(page,count).filter(r=>!next.has(r.paraIdx)),left=here.filter(r=>r.x<mid),pick=left.length?left:here;
    if(pick.length)anchors.push(Math.max(...pick.map(r=>r.paraIdx)));else missing.push(page);}
  const out=new Map([...ranges].map(([id,r])=>[id,[...r]]));
  for(const p of [...new Set(anchors)].sort((a,b)=>b-a)){
    const before=doc.getParagraphCount(0),r=parse(doc.importParagraphBlock(mark.source,JSON.stringify({request:{sourceSection:0,sourceStart:mark.para,sourceEnd:mark.para+1,targetSection:0,insertBefore:p+1,count:1},dryRun:false})));
    const added=doc.getParagraphCount(0)-before;if(r?.ok===false||!added){missing.push(p);continue;}
    // 문항 끝 문단 바로 뒤에 붙은 표시 문단은 그 문항 범위에 넣지 않는다(10-31: 넣으면 표시 표가 그 문항이 표시 자리에 닿은 것으로 잡혀 1번이 오른쪽 단으로 밀렸다).
    for(const range of out.values()){if(range[0]>p)range[0]+=added;if(range[1]>p+1)range[1]+=added;}
  }
  return {ranges:out,missing};
}
// 표가 앞 글줄에 붙거나 겹침(10-31, 14번 〈보기〉 제목이 발문 끝 줄에 겹침): 양식 위에서 엔진이 글자처럼 놓인 표를 앞 글보다 위로 놓을 때가 있다.
// 문항 안 맨 바깥 표마다 같은 단의 바로 앞 문단 마지막 줄 아래와 비교해, 모자란 만큼 그 표 문단의 「문단 위」 간격을 더한다(1px = 75, 문단 간격은 1pt = 200 → px×150).
export function fixTableGaps(doc,ranges,{gap=8}={}){
  const spans=[...ranges].map(([,r])=>r);let fixed=0;
  for(let page=0;page<doc.pageCount();page++){
    const runs=(parse(doc.getPageTextLayout(page)).runs||[]).filter(r=>!(r.cellPath||[]).length&&String(r.text||'').replace(/\u2060/g,'').trim());
    for(const t of (parse(doc.getPageControlLayout(page)).controls||[]).filter(c=>c.type==='table'&&!(c.cellPath||[]).length)){
      if(!spans.some(([a,b])=>t.paraIdx>a&&t.paraIdx<b))continue;
      let props;try{props=parse(doc.getTableProperties(0,t.paraIdx,t.controlIdx));}catch{continue;}if(!props.treatAsChar)continue;
      const prev=runs.filter(r=>r.paraIdx===t.paraIdx-1&&Math.abs(r.x-t.x)<(t.w||400)&&r.y<t.y+t.h);if(!prev.length)continue;
      const bottom=Math.max(...prev.map(r=>r.y+(r.fontSize||r.h))),need=bottom+gap-t.y;if(need<=1)continue;
      const pp=parse(doc.getParaPropertiesAt(0,t.paraIdx,0));doc.applyParaFormat(0,t.paraIdx,JSON.stringify({spacingBefore:Math.round(((pp.spacingBefore||0)+need)*150)}));fixed++;
    }
  }
  if(fixed)doc.reflowLinesegs?.();
  return fixed;
}
// 표시 자리(오른쪽 단 맨 아래, stripTop px 아래)에 닿는 문항 id — 마지막 쪽은 표시가 없어 보지 않는다.
export function stripHits(doc,ranges,stripTop,mid){
  const spans=[...ranges].map(([id,[a,b]])=>({id,a,b})),out=new Set(),last=doc.pageCount()-1;
  for(let page=0;page<last;page++){
    const items=[...(parse(doc.getPageTextLayout(page)).runs||[]).filter(r=>String(r.text||'').replace(/\u2060/g,'').trim()),...(parse(doc.getPageControlLayout(page)).controls||[])];
    for(const r of items){if((r.cellPath||[]).length||!Number.isFinite(r.y)||r.x<mid)continue;
      const bottom=r.y+(r.type?r.h:(r.fontSize||r.h));if(bottom<=stripTop)continue;
      const span=spans.find(x=>r.paraIdx>=x.a&&r.paraIdx<x.b);if(span&&!(r.type==='table'&&r.h<=40&&r.y>=stripTop))out.add(span.id);}
  }
  return out;
}
// 표시가 놓인 쪽(다시 연 문서로 잰다): 쪽마다 표 칸 안 글에 표시 글이 있는지.
export function nextMarkPages(doc,text){
  const key=text.replace(/^\S+\s*/,'')||text,out=[];
  for(let page=0;page<doc.pageCount();page++)out.push((parse(doc.getPageTextLayout(page)).runs||[]).some(r=>(r.cellPath||[]).length&&String(r.text||'').includes(key)));
  return out;
}
// 1쪽 위 끝 맞추기(10-31 사용자 지적): 머리 표 아래에서 두 단이 같은 간격으로 시작하게 한다.
// 머리 표 바로 아래(gap+40px 안)에서 시작하는 단 첫 글·개체의 문단에 모자란 만큼 「문단 위」 간격을 더한다(배점 상자 단, 문항이 바로 오는 단 모두).
export function alignFormTop(doc,{bodyStart,columns,gap=8}){
  const pd=parse(doc.getPageDef(0)),mL=pd.marginLeft/75,colW=(pd.width-pd.marginLeft-pd.marginRight)/75/columns,colOf=x=>Math.max(0,Math.min(columns-1,Math.floor((x+1-mL)/colW)));
  const ctl=(parse(doc.getPageControlLayout(0)).controls||[]).filter(c=>!(c.cellPath||[]).length&&[c.x,c.y,c.w,c.h].every(Number.isFinite)&&(c.secIdx??0)===0);
  const wide=ctl.filter(c=>c.paraIdx<bodyStart&&c.w>colW*1.5);if(!wide.length)return 0;
  const head=Math.max(...wide.map(c=>c.y+c.h)),runs=(parse(doc.getPageTextLayout(0)).runs||[]).filter(r=>!(r.cellPath||[]).length&&(r.secIdx??0)===0&&String(r.text||'').replace(/\u2060/g,'').trim());
  let moved=0;
  for(let col=0;col<columns;col++){
    const els=[...runs,...ctl.filter(c=>!wide.includes(c))].filter(r=>Number.isInteger(r.paraIdx)&&colOf(r.x)===col&&r.y<head+gap+40);if(!els.length)continue;
    // 머리 표에 걸쳐 놓인 글(11-01 밤샘 가짜 양식 f03: 떠 있는 머리 표가 옆 단 글을 밀어내지 못함)도 머리 표 아래로 내린다.
    const first=els.reduce((a,b)=>b.y<a.y?b:a),need=head+gap-first.y;if(need<=.5)continue;
    const pp=parse(doc.getParaPropertiesAt(0,first.paraIdx,0));doc.applyParaFormat(0,first.paraIdx,JSON.stringify({spacingBefore:Math.round(((pp.spacingBefore||0)+need)*150)}));moved++;
  }
  // 줄 자리를 다시 계산한다 — 안 하면 저장한 뒤 다시 열 때 뒤 문단들이 옛 자리에 그려져 띄운 문단과 겹쳤다(11-01 밤샘 대왕중 원안지 양식 오른쪽 단).
  if(moved)doc.reflowLinesegs?.();
  return moved;
}
// 단 나누기 계획(10-31): 그린 결과로 문항마다 높이와 문항 사이 간격을 재고, 차례대로 단을 채워 새 단에서 시작할 문항을 한꺼번에 정한다.
// 문항은 통째로 넣는다(한 단에 다 들어가지 않으면 다음 단). 한 단보다 긴 문항은 단 맨 위에서 시작해 흘러가게 두고 tall로 알린다.
// 단 바닥: 오른쪽 단은 「다음 면에 계속」 자리(stripTop) 위, 왼쪽 단은 본문 끝. forced: 앞 계획대로 묶었는데도 걸쳐서 반드시 새 단에서 시작할 문항.
export function planFormBreaks(doc,items,boxes,{columns,stripTop=Infinity,forced=new Set()}){
  const pd=parse(doc.getPageDef(0)),top=(pd.marginTop+pd.marginHeader)/75,bottom=(pd.height-pd.marginBottom-pd.marginFooter)/75;
  const span=b=>b?[...b.values()].reduce((a,p)=>a+p.bottom-p.top,0):0,firstAt=b=>Math.min(...b.keys()),lastAt=b=>Math.max(...b.keys());
  const heights=items.map(x=>{const b=boxes.get(x.id);return b?span(b):(Number(x.height)||0)*96/25.4;});
  // 단 맨 위: 그 단에서 시작한 문항의 실제 위 끝(1쪽은 머리 표·배점 상자 아래). 모르면 본문 위 끝.
  const starts=new Map(),gaps=[];
  items.forEach((x,i)=>{const b=boxes.get(x.id),prev=i>0?boxes.get(items[i-1].id):null;if(!b)return;const at=firstAt(b);
    if(prev&&lastAt(prev)===at)gaps[i]=b.get(at).top-prev.get(at).bottom;else starts.set(at,Math.min(starts.get(at)??Infinity,b.get(at).top));});
  const known=gaps.filter(Number.isFinite).sort((a,b)=>a-b),gap=known.length?known[known.length>>1]:12;
  const topOf=at=>at<columns?(starts.get(at)??top):top,bottomOf=at=>(at%columns===columns-1?Math.min(stripTop,bottom):bottom)-1;
  const breaks=new Set(),tall=new Set();let at=0,y=topOf(0),first=true;
  items.forEach((x,i)=>{
    const h=heights[i],g=first?0:(Number.isFinite(gaps[i])?gaps[i]:gap);
    if(i>0&&(forced.has(x.id)||!first&&y+g+h>bottomOf(at))){at++;y=topOf(at);breaks.add(x.id);first=true;}
    else y+=first?0:g;
    let rest=h;if(y+rest>bottomOf(at)){tall.add(x.id);while(y+rest>bottomOf(at)){rest-=bottomOf(at)-y;at++;y=topOf(at);}}
    y+=rest;first=false;
  });
  return {breaks,tall};
}
// 단 아래 채우기(10-31 사용자 지적 「하단을 똑바로 채우라」): 엔진은 단 구분선을 단 내용 끝까지만 긋는다 — 마지막 단을 뺀 단마다
// 그 단 마지막 문항 끝 문단에 「문단 아래」 간격을 더해 단 끝을 본문 바닥 가까이로 내린다(보이는 글·개체는 그대로, 원래 양식처럼 선이 바닥까지).
// only: 채울 단 번호(at) 모음 — 없으면 채울 수 있는 단 전부. 돌려주는 값은 채운 단 번호 목록.
export function fillColumns(doc,items,ranges,boxes,{columns,pad=16,only=null}){
  const pd=parse(doc.getPageDef(0)),bottom=(pd.height-pd.marginBottom-pd.marginFooter)/75,lastIn=new Map();
  for(const x of items){const b=boxes.get(x.id);if(!b)continue;for(const [at,piece] of b){const o=lastIn.get(at);if(!o||piece.bottom>o.piece.bottom)lastIn.set(at,{id:x.id,piece,whole:b.size===1});}}
  if(!lastIn.size)return [];
  const end=Math.max(...lastIn.keys()),n=[];
  for(const [at,{id,piece,whole}] of lastIn){
    if(at>=end||!whole||only&&!only.has(at))continue;const need=bottom-pad-piece.bottom;if(need<2)continue;
    const p=ranges.get(id)[1]-1,pp=parse(doc.getParaPropertiesAt(0,p,0));
    doc.applyParaFormat(0,p,JSON.stringify({spacingAfter:Math.round(((pp.spacingAfter||0)+need)*150)}));n.push(at);
  }
  if(n.length)doc.reflowLinesegs?.();
  return n;
}
// 학교 양식 위에 묶기(10-29, 10-31 다시 짬): 한 번 묶어 그린 결과로 문항 높이를 재고(planFormBreaks) 새 단에서 시작할 문항을 한꺼번에 정해 다시 묶는다.
// 그래도 걸치는 문항이 있으면 그 문항은 반드시 새 단에서 시작하게 하고 높이를 다시 재 계획한다(보통 2~3번).
// 양식 문서는 묶을 때마다 새로 연다(openTemplate). 한 단보다 긴 문항은 단 맨 위에서 흘러가게 두고 tall로 알린다.
// settle(10-30): 양식 위에 넣은 직후 문서는 엔진이 옛 자리로 그린다 — 저장했다 다시 연 문서(화면·보낸 파일과 같은 모양)로 잰다.
export async function assembleFormChecked(Document,{items,openTemplate,bodyStart,tailStart,columns,open,between,structure=null,keep={},settle=null}){
  const again=d=>{if(!settle)return d;try{return settle(d);}finally{d.free();}};
  const build=async breaks=>{
    const template=await openTemplate();let mark=null,doc=null,ranges,marks=null;
    if(structure){applyFormKeep(template,structure,keep);pinFormHead(template,structure);if(keep.score!==false)try{fillFormScore(template,structure,items.map(x=>x.q));}catch{}
      if(keep.next!==false&&structure.nextMark>=0){const source=await openTemplate();try{mark=reserveNextMark(template,source,structure.nextMark,columns);}catch{mark=null;}finally{if(!mark)source.free();}}}
    try{
      const built=await assembleExamDocument(Document,{items,pages:[],sheet:null,template,bodyStart,tailStart,open,between,breaks,keepTogether:false});
      doc=again(built.document);ranges=built.ranges;
      if(alignFormTop(doc,{bodyStart,columns}))doc=again(doc);
      if(mark){ranges=placeNextMarks(doc,mark,bodyStart,ranges).ranges;doc=again(doc);const on=nextMarkPages(doc,mark.text),last=on.length-1;
        marks={text:mark.text,missing:on.map((v,i)=>i<last&&!v?i:-1).filter(i=>i>=0),extra:on[last]&&last>0?[last]:[]};}
      if(fixTableGaps(doc,ranges))doc=again(doc);
      // 합친 뒤 줄 자리가 바뀌어 수식이 아랫줄과 겹치면(10-31 set37 19번) 시험지에서도 띄운다.
      if(spaceEquationOverlaps(doc,{tables:true}))doc=again(doc);
    }catch(e){doc?.free();throw e;}finally{mark?.source.free();}
    const pd=parse(doc.getPageDef(0)),stripTop=mark?(pd.height-pd.marginBottom-pd.marginFooter-mark.height)/75-1:Infinity;
    // 양식 꼬리(「◇ 끝 ◇」·답지 안내, 10-31 set23): 마지막 문항 뒤 문단은 그 문항에 붙여 잰다 — 빼고 재면 꼬리가 단 바닥 테두리를 넘거나 옆 단으로 흘렀다.
    const last=items.at(-1)?.id,measure=new Map(ranges);if(last&&ranges.has(last))measure.set(last,[ranges.get(last)[0],doc.getParagraphCount(0)]);
    const skip=c=>c.type==='table'&&c.y>=stripTop&&c.h<=(mark?.height||0)/75+6,boxes=itemBoxes(doc,measure,columns,skip);
    return {doc,ranges,measure,marks,stripTop,boxes,skip,mid:pd.width/75/2};
  };
  // 걸침(단·쪽에 걸친 문항)과 표시 자리 닿음: 표시는 글 앞에 떠 있어 자리를 차지하지 않는다 — 마지막 쪽이 아닌 쪽의 오른쪽 단에서 표시 자리에 닿는 문항은 걸친 것으로 본다.
  const badOf=(b,tall)=>{const hits=Number.isFinite(b.stripTop)?stripHits(b.doc,b.measure,b.stripTop,b.mid):new Set();
    return items.filter(x=>{const p=b.boxes.get(x.id);return p&&(p.size>1||hits.has(x.id))&&!tall.has(x.id);});};
  const forced=new Set();let breaks=new Set(),tall=new Set(),b=await build(breaks);
  for(let round=0;round<8;round++){
    const bad=badOf(b,tall);
        if(round>0&&!bad.length)break;
    for(const x of bad)if(breaks.has(x.id)||round>0)forced.add(x.id);
    const plan=planFormBreaks(b.doc,items,b.boxes,{columns,stripTop:b.stripTop,forced});
    if(!bad.length&&plan.breaks.size===breaks.size&&[...plan.breaks].every(id=>breaks.has(id)))break;
    breaks=plan.breaks;tall=plan.tall;b.doc.free();b=await build(breaks);
  }
  // 단 아래 채우기 — 채운 뒤 쪽 수·문항 자리가 바뀌거나 새로 걸치는 문항이 생기면 그 채우기는 버린다(11-01 사용자 사진: 채움 간격이
  // 커서 〈보기〉 뒤 선지만 다음 쪽으로 밀렸다). 한꺼번에 채워 안 되면 단마다 하나씩 채워 보고 되는 단만 남긴다.
  if(settle){
    const key=m=>JSON.stringify(items.map(x=>[...(m.get(x.id)?.keys()||[])])),before=new Set(badOf(b,new Set()).map(x=>x.id));
    const tryFill=only=>{const copy=settle(b.doc),done=fillColumns(copy,items,b.ranges,b.boxes,{columns,only});if(!done.length){copy.free();return null;}
      const filled=again(copy),boxes=itemBoxes(filled,b.measure,columns,b.skip),next={...b,doc:filled,boxes};
      if(filled.pageCount()===b.doc.pageCount()&&key(boxes)===key(b.boxes)&&badOf(next,new Set()).every(x=>before.has(x.id)))return {next,done};
      filled.free();return {next:null,done};};
    const all=tryFill(null);
    if(all?.next){b.doc.free();b=all.next;}
    else if(all)for(const at of all.done){const one=tryFill(new Set([at]));if(one?.next){b.doc.free();b=one.next;}}
  }
  const left=badOf(b,new Set());
  return {document:b.doc,ranges:b.ranges,moved:[...breaks],tall:left.map(x=>x.id),marks:b.marks};
}

// 양식 머리말·꼬리말의 「총( 7 )쪽」(10-29): 양식을 만들 때 적은 쪽수를 실제로 묶은 쪽수로 바꾼다. 숫자만 바꾸고 나머지 글·서식은 그대로.
export function fillFormPageCount(doc){
  const pages=doc.pageCount();let list=[];try{list=parse(doc.getHeaderFooterList()).items||[];}catch{return 0;}
  let changed=0;
  for(const it of list){
    for(let p=0;;p++){let info;try{info=parse(doc.getHeaderFooterParaInfo(it.sectionIdx,it.isHeader,it.applyTo,p));}catch{break;}
      if(!info?.ok||typeof info.text!=='string')break;
      const m=/(총\s*\(?\s*)(\d{1,3})(\s*\)?\s*쪽)/.exec(info.text);
      if(m&&Number(m[2])!==pages){const at=m.index+m[1].length;
        doc.deleteTextInHeaderFooter(it.sectionIdx,it.isHeader,it.applyTo,p,at,m[2].length);doc.insertTextInHeaderFooter(it.sectionIdx,it.isHeader,it.applyTo,p,at,String(pages));changed++;}
      if(p+1>=(info.paraCount||1))break;}
  }
  return changed;
}

// rewidth: 시험지 단 폭과 다르게 조판한 문항을 그 단 폭으로 새로 조판한 것(문항 id → {bytes,height}). 저장한 조판은 그대로 둔다.
export async function buildExamDocument(Document,data,exam=data.exams?.[0],{between,template=null,openTemplate=null,columns=2,bodyStart=-1,tailStart=-1,rewidth=null,structure=null,keep={},settle=null}={}){
  const plan=examPlan(data,exam),{pages,page:sheet,missing,mixed}=plan;
  const items=rewidth?plan.items.map(x=>rewidth.has(x.id)?{...x,height:rewidth.get(x.id).height+x.after}:x):plan.items;
  if(!items.length)throw Error('시험지에 넣을 문항을 고르세요.');
  const unsaved=missing.filter(x=>!rewidth?.has(x.id));
  if(unsaved.length)throw Error(`조판을 저장하지 않은 문항이 있습니다: ${unsaved.map(x=>x.q.number+'번').join(', ')}. 각 문항의 조판을 저장한 뒤 다시 만드세요.`);
  if(mixed&&!template&&!openTemplate&&!rewidth)throw Error(paperMixMessage(mixed));
  const open=item=>rewidth?.has(item.id)?Promise.resolve(new Document(rewidth.get(item.id).bytes))
    :openApprovedQuestion(Document,item.q,item.q.typeset).catch(e=>{throw Error(`${item.q.number}번 문항: ${e.message}`);});
  // 학교 양식 위에서는 양식이 흘리는 대로(「다음 문단과 함께」만), 빈 시험지는 그린 결과로 확인해 문항을 통째로 넘긴다.
  if(openTemplate){const built=await assembleFormChecked(Document,{items,openTemplate,bodyStart,tailStart,columns,open,between,structure,keep,settle});try{fillFormPageCount(built.document);}catch{}return {document:built.document,ranges:built.ranges,pages,moved:built.moved,tall:built.tall,marks:built.marks,count:items.length};}
  if(template){const {document,ranges}=await assembleExamDocument(Document,{items,pages,sheet,template,bodyStart,tailStart,open,between});return {document,ranges,pages,count:items.length};}
  const built=await assembleExamChecked(Document,{items,sheet,open,between});
  return {document:built.document,pages:built.pages,count:items.length};
}
