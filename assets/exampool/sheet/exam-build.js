// 저장한 문항 조판(한 단 폭 문항 용지)을 2단 시험지 한 문서로 모은다(문항들이 모두 B4로 조판됐으면 B4, 아니면 A4).
// 문항 용지의 본문 폭은 시험지 한 단과 같아서, 문단을 그대로 옮기면 줄바꿈이 유지된다. HTML로 다시 만들지 않는다.
import {pageProfile} from './typeset-model.js';
import {openApprovedQuestion,nativeInsertOptions} from './native-transfer.js?v=1014-compact-panel';
import {examPlan} from './exam-layout.js';

const parse=v=>typeof v==='string'?JSON.parse(v):v;

// 문항 문서들을 차례로 시험지 한 문서에 옮긴다. open(item)은 그 문항의 한글 문서를 연다(닫기는 여기서).
// 돌려주는 ranges: 문항마다 시험지 문서 안의 문단 범위 [start,end).
export async function assembleExamDocument(Document,{items,pages,sheet,open}){
  // 단이 시작되는 문항: 그 앞에 단 나누기를 넣는다(첫 문항 제외).
  const starts=new Set();for(const page of pages)for(const column of page.columns)if(column.length)starts.add(column[0]);
  const target=Document.createEmpty(),ranges=new Map();
  try{
    target.createBlankDocument();
    const config=pageProfile({paper:sheet.paper,columns:sheet.columns});
    target.setPageDef(0,JSON.stringify(config.page));target.setColumnDef(0,sheet.columns,0,true,config.spacing);
    for(const [i,item] of items.entries()){
      const source=await open(item);
      try{
        if(i>0&&starts.has(item.id)){
          const last=target.getParagraphCount(0)-1;const r=parse(target.insertColumnBreak(0,last,target.getParagraphLength(0,last)));
          if(r&&r.ok===false)throw Error('시험지의 단 나누기를 넣지 못했습니다.');
        }
        const before=target.getParagraphCount(0);
        const result=parse(target.importParagraphBlock(source,nativeInsertOptions(source,0,before)));
        if(!result?.operationResult?.result?.inserted&&result?.ok===false)throw Error(`${item.q.number}번 문항을 시험지에 넣지 못했습니다.`);
        ranges.set(item.id,[before,target.getParagraphCount(0)]);
      }finally{source.free();}
    }
    return {document:target,ranges};
  }catch(e){target.free();throw e;}
}

export async function buildExamDocument(Document,data,exam=data.exams?.[0]){
  const {items,pages,page:sheet,missing}=examPlan(data,exam);
  if(!items.length)throw Error('시험지에 넣을 문항을 고르세요.');
  if(missing.length)throw Error(`조판을 저장하지 않은 문항이 있습니다: ${missing.map(x=>x.q.number+'번').join(', ')}. 각 문항의 조판을 저장한 뒤 다시 만드세요.`);
  const {document}=await assembleExamDocument(Document,{items,pages,sheet,open:item=>openApprovedQuestion(Document,item.q,item.q.typeset)});
  return {document,pages,count:items.length};
}
