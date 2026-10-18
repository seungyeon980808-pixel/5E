// 시험지 구성: 문항을 자르지 않고 A4 2단에 차례로 놓는다. 한 단보다 긴 문항은 자기 쪽을 따로 받는다.
export const EXAM_PAGE={paper:'A4',columns:2,heightMm:267,gapMm:6};

export function paginateQuestions(items,{height,columns=2,gap=0}){
  const pages=[];let page,column,used;
  function nextPage(){page={columns:Array.from({length:columns},()=>[]),oversized:false};pages.push(page);column=0;used=0;}
  for(const item of items){
    if(!page)nextPage();
    if(item.height>height){
      if(page.columns.some(c=>c.length))nextPage();
      page.columns[0].push(item.id);page.oversized=true;page=null;continue;
    }
    const needed=item.height+(used?gap:0);
    if(used+needed>height){if(column+1>=columns)nextPage();else{column++;used=0;}}
    page.columns[column].push(item.id);used+=item.height+(used?gap:0);
  }
  return pages;
}

// 문항마다 높이(mm)와 준비 상태. 조판을 저장하지 않은 문항은 높이를 추정하고 '조판 저장 필요'로 표시한다.
export function examItems(data,exam=data.exams?.[0]){
  const ids=exam?.items||[];
  return ids.map(id=>{
    const q=data.questions.find(x=>x.id===id);if(!q)return null;
    const measured=q.typeset?.metrics?.usedHeightMm;
    const estimate=60+q.blocks.length*18+(q.type==='서술형'?20:16);
    return {id,q,height:Number.isFinite(measured)?measured:estimate,ready:!!q.typeset?.verified,measured:Number.isFinite(measured)};
  }).filter(Boolean);
}

// 시험지 용지: 넣을 문항이 모두 같은 용지(B4·A3)로 조판됐으면 그 용지 2단, 아니면 A4 2단. 문항 용지의 본문 폭이 시험지 한 단과 같아야 줄바꿈이 유지된다.
export function examPage(items){
  const papers=new Set(items.map(x=>x.q.typeset?.profile?.paper||x.q.paper||'A4'));
  const paper=papers.size===1?[...papers][0]:'A4',[,h]={A4:[210,297],B4:[257,364],A3:[297,420]}[paper]||[210,297];
  return paper===EXAM_PAGE.paper?EXAM_PAGE:{...EXAM_PAGE,paper,heightMm:h-30};
}
export function examPlan(data,exam=data.exams?.[0]){
  const items=examItems(data,exam),page=examPage(items);
  const pages=paginateQuestions(items,{height:page.heightMm,columns:page.columns,gap:page.gapMm});
  return {items,pages,page,missing:items.filter(x=>!x.ready)};
}

