// 저장한 문항 조판(한 단 폭 문항 용지)을 2단 시험지 한 문서로 모은다(문항들이 모두 B4로 조판됐으면 B4, 아니면 A4).
// 문항 용지의 본문 폭은 시험지 한 단과 같아서, 문단을 그대로 옮기면 줄바꿈이 유지된다. HTML로 다시 만들지 않는다.
import {pageProfile} from './typeset-model.js?v=1014-compact-panel';
import {openApprovedQuestion,nativeInsertOptions} from './native-transfer.js?v=1014-compact-panel';
import {examPlan,paperMixMessage} from './exam-layout.js';

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
      target.setPageDef(0,JSON.stringify(config.page));target.setColumnDef(0,sheet.columns,0,true,config.spacing);}
    for(const [i,item] of items.entries()){
      const source=await open(item);
      try{
        if(!template&&i>0&&starts.has(item.id)){
          const last=target.getParagraphCount(0)-1;const r=parse(target.insertColumnBreak(0,last,target.getParagraphLength(0,last)));
          if(r&&r.ok===false)throw Error('시험지의 단 나누기를 넣지 못했습니다.');
        }
        const before=target.getParagraphCount(0);
        const result=parse(target.importParagraphBlock(source,nativeInsertOptions(source,0,before)));
        if(!result?.operationResult?.result?.inserted&&result?.ok===false)throw Error(`${item.q.number}번 문항을 시험지에 넣지 못했습니다.`);
        // 문항 아래 여백(10-23 지적 9): 문항 마지막 문단의 「문단 아래」 간격으로 넣는다(1pt = 200).
        if(item.after>0){const last=target.getParagraphCount(0)-1;target.applyParaFormat(0,last,JSON.stringify({spacingAfter:Math.round(item.after*72/25.4*200)}));}
        ranges.set(item.id,[before,target.getParagraphCount(0)]);
      }finally{source.free();}
      if(between&&i<items.length-1)await between();
    }
    return {document:target,ranges};
  }catch(e){target.free();throw e;}
}

export async function buildExamDocument(Document,data,exam=data.exams?.[0],{between,template=null,bodyStart=-1}={}){
  const {items,pages,page:sheet,missing,mixed}=examPlan(data,exam);
  if(!items.length)throw Error('시험지에 넣을 문항을 고르세요.');
  if(missing.length)throw Error(`조판을 저장하지 않은 문항이 있습니다: ${missing.map(x=>x.q.number+'번').join(', ')}. 각 문항의 조판을 저장한 뒤 다시 만드세요.`);
  if(mixed&&!template)throw Error(paperMixMessage(mixed));
  const {document}=await assembleExamDocument(Document,{items,pages,sheet,template,bodyStart,open:item=>openApprovedQuestion(Document,item.q,item.q.typeset).catch(e=>{throw Error(`${item.q.number}번 문항: ${e.message}`);}),between});
  return {document,pages,count:items.length};
}
