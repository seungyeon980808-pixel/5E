// 저장한 문항 조판(한 단 폭 문항 용지)을 2단 시험지 한 문서로 모은다(문항들이 모두 B4로 조판됐으면 B4, 아니면 A4).
// 문항 용지의 본문 폭은 시험지 한 단과 같아서, 문단을 그대로 옮기면 줄바꿈이 유지된다. HTML로 다시 만들지 않는다.
import {pageProfile} from './typeset-model.js?v=1014-compact-panel';
import {openApprovedQuestion,nativeInsertOptions} from './native-transfer.js?v=1014-compact-panel';
import {examPlan,paperMixMessage,paginateQuestions} from './exam-layout.js';

const parse=v=>typeof v==='string'?JSON.parse(v):v;

// 문항 문서들을 차례로 시험지 한 문서에 옮긴다. open(item)은 그 문항의 한글 문서를 연다(닫기는 여기서).
// 돌려주는 ranges: 문항마다 시험지 문서 안의 문단 범위 [start,end).
// between: 문항 하나를 넣을 때마다 기다릴 일(화면이 멈추지 않게 잠깐 쉬기). 없으면 쉬지 않는다.
// template(10-22 S3): 학교 양식 문서(열린 것)를 주면 그 위에 묶는다 — 양식의 쪽·단·머리말·제목 표는 그대로 두고,
// bodyStart(첫 문항 문단)부터 끝까지 지운 자리에 문항을 붙인다. 쪽 배치(단 나누기)는 양식이 흘리는 대로 둔다.
export function clearFormBody(target,bodyStart){
  const count=target.getParagraphCount(0);if(bodyStart<0||bodyStart>=count)return;
  for(let p=count-1;p>=Math.max(1,bodyStart);p--){const r=parse(target.deleteParagraph(0,p));if(r&&r.ok===false)throw Error('양식의 예시 문항을 비우지 못했습니다.');}
  if(bodyStart===0){const n=target.getParagraphLength(0,0);if(n)target.deleteText(0,0,0,n);}
}
export async function assembleExamDocument(Document,{items,pages,sheet,open,between,template=null,bodyStart=-1}){
  // 단이 시작되는 문항: 그 앞에 단 나누기를 넣는다(첫 문항 제외).
  const starts=new Set();for(const page of pages)for(const column of page.columns)if(column.length)starts.add(column[0]);
  const target=template||Document.createEmpty(),ranges=new Map();
  try{
    if(template)clearFormBody(target,bodyStart);
    else{target.createBlankDocument();
      const config=pageProfile({paper:sheet.paper,columns:sheet.columns});
      target.setPageDef(0,JSON.stringify(config.page));target.setColumnDef(0,sheet.columns,0,true,config.spacing);
      // 맨 위 빈 문단(쪽·단 설정이 든 문단이라 지우지 못함)은 줄 높이를 거의 0으로 — 첫 단만 한 줄 아래에서 시작해 옆 단과 위 끝이 어긋나지 않게(10-23).
      // 빈 문단의 줄 높이는 글자 크기를 따르므로 폭 없는 글자(U+2060) 하나를 1pt로 둔다(문항 조판의 빈 칸과 같은 방법).
      target.insertText(0,0,0,'\u2060');target.applyCharFormat(0,0,0,1,JSON.stringify({fontSize:100}));target.applyParaFormat(0,0,JSON.stringify({lineSpacingType:'Percent',lineSpacing:100,spacingBefore:0,spacingAfter:0}));}
    for(const [i,item] of items.entries()){
      const source=await open(item);
      try{
        const before=target.getParagraphCount(0);
        const result=parse(target.importParagraphBlock(source,nativeInsertOptions(source,0,before)));
        if(!result?.operationResult?.result?.inserted&&result?.ok===false)throw Error(`${item.q.number}번 문항을 시험지에 넣지 못했습니다.`);
        // 첫 문항: 단 맨 위 문단처럼 「문단 위」 간격 없이(엔진은 단 나누기 뒤 첫 문단의 위 간격을 빼므로 옆 단 문항과 위 끝을 맞춘다).
        if(!template&&i===0)target.applyParaFormat(0,before,JSON.stringify({spacingBefore:0}));
        // 단 나누기는 넣은 문항의 첫 문단 앞에 건다(10-23 지적 2). 앞 문항 끝 문단에 걸면, 그 문단이 표(그림 선지 등)뿐일 때
        // 글 길이가 0이라 표 앞에서 나뉘어 앞 문항의 선지가 다음 단·쪽으로 넘어갔다.
        if(!template&&i>0&&starts.has(item.id)){
          const r=parse(target.insertColumnBreak(0,before,0));
          if(r&&r.ok===false)throw Error('시험지의 단 나누기를 넣지 못했습니다.');
        }
        // 「다음 문단과 함께」(10-23 지적 2): 문항의 마지막 문단을 뺀 모든 문단에 걸어 엔진이 문항 중간(발문·〈보기〉·선지 사이)에서 단을 나누지 않게 한다.
        for(let p=before;p<target.getParagraphCount(0)-1;p++)target.applyParaFormat(0,p,JSON.stringify({keepWithNext:true}));
        // 문항 아래 여백(10-23 지적 9): 문항 마지막 문단의 「문단 아래」 간격으로 넣는다(1pt = 200).
        if(item.after>0){const last=target.getParagraphCount(0)-1;target.applyParaFormat(0,last,JSON.stringify({spacingAfter:Math.round(item.after*72/25.4*200)}));}
        ranges.set(item.id,[before,target.getParagraphCount(0)]);
      }finally{source.free();}
      if(between&&i<items.length-1)await between();
    }
    return {document:target,ranges};
  }catch(e){target.free();throw e;}
}

// 그린 결과로 본 문항 자리(10-23 지적 2): 문항마다 맨 바깥 글 줄·그림·표가 놓인 첫 자리와 끝 자리(쪽 × 단 수 + 단).
// 어림 높이로 나눈 단이 실제와 달라 선지만 다음 단·쪽으로 흘러가는지 여기서 잡는다.
export function itemPlaces(doc,ranges,columns){
  const pd=parse(doc.getPageDef(0)),mL=pd.marginLeft/75,colW=(pd.width-pd.marginLeft-pd.marginRight)/75/columns;
  const colOf=x=>Math.max(0,Math.min(columns-1,Math.floor((x+1-mL)/colW))),spans=[...ranges].map(([id,[a,b]])=>({id,a,b})),out=new Map();
  for(let page=0;page<doc.pageCount();page++){
    // 표 안에 든 표·그림이 칸 경로 없이 엉뚱한 문단 번호로 보고될 때가 있다(rhwp 0.8.7) → 다른 맨 바깥 표·그림 안에 완전히 들어가면 뺀다.
    const ctl=(parse(doc.getPageControlLayout(page)).controls||[]).filter(c=>!(c.cellPath||[]).length&&[c.x,c.y,c.w,c.h].every(Number.isFinite));
    const inside=(c,o)=>o!==c&&o.x<=c.x+.5&&o.y<=c.y+.5&&o.x+o.w>=c.x+c.w-.5&&o.y+o.h>=c.y+c.h-.5&&o.w*o.h>c.w*c.h;
    const marks=[...(parse(doc.getPageTextLayout(page)).runs||[]).filter(r=>String(r.text||'').replace(/\u2060/g,'').trim()),...ctl.filter(c=>!ctl.some(o=>inside(c,o)))];
    for(const r of marks){
      if((r.cellPath||[]).length||(r.secIdx??0)!==0||!Number.isFinite(r.x))continue;
      const span=spans.find(x=>r.paraIdx>=x.a&&r.paraIdx<x.b);if(!span)continue;
      const at=page*columns+colOf(r.x),o=out.get(span.id);
      if(!o)out.set(span.id,{first:at,last:at});else{o.first=Math.min(o.first,at);o.last=Math.max(o.last,at);}
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

// rewidth: 시험지 단 폭과 다르게 조판한 문항을 그 단 폭으로 새로 조판한 것(문항 id → {bytes,height}). 저장한 조판은 그대로 둔다.
export async function buildExamDocument(Document,data,exam=data.exams?.[0],{between,template=null,bodyStart=-1,rewidth=null}={}){
  const plan=examPlan(data,exam),{pages,page:sheet,missing,mixed}=plan;
  const items=rewidth?plan.items.map(x=>rewidth.has(x.id)?{...x,height:rewidth.get(x.id).height+x.after}:x):plan.items;
  if(!items.length)throw Error('시험지에 넣을 문항을 고르세요.');
  if(missing.length)throw Error(`조판을 저장하지 않은 문항이 있습니다: ${missing.map(x=>x.q.number+'번').join(', ')}. 각 문항의 조판을 저장한 뒤 다시 만드세요.`);
  if(mixed&&!template&&!rewidth)throw Error(paperMixMessage(mixed));
  const open=item=>rewidth?.has(item.id)?Promise.resolve(new Document(rewidth.get(item.id).bytes))
    :openApprovedQuestion(Document,item.q,item.q.typeset).catch(e=>{throw Error(`${item.q.number}번 문항: ${e.message}`);});
  // 학교 양식 위에서는 양식이 흘리는 대로(「다음 문단과 함께」만), 빈 시험지는 그린 결과로 확인해 문항을 통째로 넘긴다.
  if(template){const {document}=await assembleExamDocument(Document,{items,pages,sheet,template,bodyStart,open,between});return {document,pages,count:items.length};}
  const built=await assembleExamChecked(Document,{items,sheet,open,between});
  return {document:built.document,pages:built.pages,count:items.length};
}
