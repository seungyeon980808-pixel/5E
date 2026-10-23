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
    // 「다음 단에서 시작」(10-23 지적 9): 이 단에 이미 문항이 있으면 다음 단(마지막 단이면 다음 쪽)으로.
    if(item.breakBefore&&used){if(column+1>=columns)nextPage();else{column++;used=0;}}
    const needed=item.height+(used?gap:0);
    // 다 들어가지 않으면 문항을 통째로 다음 단·쪽으로(지적 10) — 넘긴 문항은 page.moved에 남겨 배치 점검에 보인다.
    if(used+needed>height){if(column+1>=columns)nextPage();else{column++;used=0;}(page.moved||=[]).push(item.id);}
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
    // 문항 아래 여백(exam.after, mm)은 높이에 더하고, exam.breaks는 「다음 단에서 시작」(10-23 지적 9).
    const after=Math.max(0,Number(exam?.after?.[id])||0);
    return {id,q,height:(Number.isFinite(measured)?measured:estimate)+after,after,breakBefore:!!exam?.breaks?.[id],ready:!!q.typeset?.verified,measured:Number.isFinite(measured)};
  }).filter(Boolean);
}

// 시험지 용지: 넣을 문항이 모두 같은 용지(B4·A3)로 조판됐으면 그 용지 2단, 아니면 A4 2단. 문항 용지의 본문 폭이 시험지 한 단과 같아야 줄바꿈이 유지된다.
export function examPage(items){
  const papers=new Set(items.map(x=>x.q.typeset?.profile?.paper||x.q.paper||'A4'));
  const paper=papers.size===1?[...papers][0]:'A4',[,h]={A4:[210,297],B4:[257,364],A3:[297,420]}[paper]||[210,297];
  return paper===EXAM_PAGE.paper?EXAM_PAGE:{...EXAM_PAGE,paper,heightMm:h-30};
}
// 용지가 섞인 시험지: 저장한 조판은 그 용지의 단 폭으로 줄바꿈·표 폭이 정해져 있어 다른 용지 단에 넣으면 표가 단 밖으로 나간다.
// 섞였으면 용지마다 문항 번호를 돌려준다(하나면 null).
export function paperMix(items){
  const by=new Map();for(const x of items){const paper=x.q.typeset?.profile?.paper||x.q.paper||'A4';if(!by.has(paper))by.set(paper,[]);by.get(paper).push(x.q.number);}
  return by.size>1?[...by].map(([paper,numbers])=>({paper,numbers})):null;
}
export const paperMixMessage=mix=>`용지가 섞여 있습니다(${mix.map(m=>`${m.paper} ${m.numbers.map(n=>n+'번').join('·')}`).join(' / ')}). 문항 카드의 「상세 조판」에서 용지를 하나로 맞추고 조판 저장한 뒤 만드세요.`;
export function examPlan(data,exam=data.exams?.[0]){
  const items=examItems(data,exam),page=examPage(items);
  const pages=paginateQuestions(items,{height:page.heightMm,columns:page.columns,gap:page.gapMm});
  return {items,pages,page,missing:items.filter(x=>!x.ready),mixed:paperMix(items)};
}

