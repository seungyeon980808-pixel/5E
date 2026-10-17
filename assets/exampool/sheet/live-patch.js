// 시트에서 고친 글을 한글 창의 같은 문단에 바로 넣는다(다시 그리지 않음).
// 문항을 새로 조판했을 때의 글 조각과 지금 글 조각의 주인·순서가 같고,
// 바뀐 조각마다 한글 문서에서 같은 글을 가진 문단 하나를 찾을 때만 한다. 하나라도 못 하면 null(다시 그려야 함).
import {diffRegion} from './text-sync.js';
import {labelInDocument} from './handoff.js';

const norm=v=>String(v??'').replace(/⁠/g,'').replace(/\s+/g,' ').trim();
const ownerKey=o=>JSON.stringify(o??null);
// 글자 위치가 한글 엔진과 어긋날 수 있는 글(수식·그림 같은 개체 자리, 두 칸짜리 글자)은 바로 넣지 않는다.
const unsafe=v=>/[\u0000-\u0009\u000b-\u001f￼\ud800-\udfff]/.test(v);

// 글을 뺀 문항 모양: 구성·순서·묶음·배치·크기·간격·표 크기·병합·그림·선지 표현·번호. 이것이 같아야 글만 바꿔 넣을 수 있다.
// 구성 이름은 한글에 찍히는지 여부만 본다(찍히는 이름의 글은 글 조각으로 비교한다).
export function layoutKey(q){
  const blank=t=>t&&{...t,cells:t.cells.map(row=>row.map(({value,raw,...cell})=>cell)),note:''};
  return JSON.stringify({number:q.number,type:q.type,style:q.style,choiceLayout:q.choiceLayout,
    blocks:q.blocks.map(({text,label,lines,table,...b})=>({...b,shown:labelInDocument({...b,label}),lines:lines?.map(({text,...l})=>l),table:blank(table)})),
    choices:q.choices.map(({text,...c})=>c),choiceTable:blank(q.choiceTable)});
}

// 한글 문서의 문단을 문서 순서대로: 본문 문단, 그 안 표의 칸 문단(겹친 표 포함).
export function nativeRuns(doc,section=0){
  const runs=[],J=JSON.stringify;
  const isTable=(parent,path)=>{try{doc.getCellInfoByPath(section,parent,J(path));return true;}catch{return false;}};
  const walkTable=(parent,base,controlIndex)=>{
    for(let cellIndex=0;isTable(parent,[...base,{controlIndex,cellIndex,cellParaIndex:0}]);cellIndex++){
      const count=doc.getCellParagraphCountByPath(section,parent,J([...base,{controlIndex,cellIndex,cellParaIndex:0}]));
      for(let cellParaIndex=0;cellParaIndex<count;cellParaIndex++){
        const path=[...base,{controlIndex,cellIndex,cellParaIndex}],length=doc.getCellParagraphLengthByPath(section,parent,J(path));
        runs.push({section,parent,path,text:length?doc.getTextInCellByPath(section,parent,J(path),0,length):''});
        for(let c=0;c<4;c++)if(isTable(parent,[...path,{controlIndex:c,cellIndex:0,cellParaIndex:0}]))walkTable(parent,path,c);
      }
    }
  };
  for(let para=0,count=doc.getParagraphCount(section);para<count;para++){
    const length=doc.getParagraphLength(section,para);
    runs.push({section,para,path:null,text:length?doc.getTextRange(section,para,0,length):''});
    const positions=doc.getControlTextPositions(section,para),controls=(typeof positions==='string'?JSON.parse(positions||'[]'):positions||[]).length;
    for(let c=0;c<controls;c++)if(isTable(para,[{controlIndex:c,cellIndex:0,cellParaIndex:0}]))walkTable(para,[],c);
  }
  return runs;
}

// before: 지금 한글 창에 들어 있는 글 조각(값은 시트와 같게 유지됨), after: 새로 조판한 글 조각(wrapped 포함).
export function planPatches(before,after,runs){
  if(before.length!==after.length)return null;
  const patches=[],used=new Set();
  for(let i=0;i<before.length;i++){
    const a=before[i],b=after[i];
    if(ownerKey(a.owner)!==ownerKey(b.owner))return null;
    if(a.value===b.value)continue;
    if(a.math||b.math||typeof b.wrapped!=='string'||unsafe(b.wrapped))return null;
    // 같은 글이 여러 곳에 있으면 순서로 짝짓는다. 조각이 아닌 같은 글(제목 등)이 섞여 개수가 다르면 하지 않는다.
    const key=norm(a.value),same=before.filter(s=>norm(s.value)===key),hits=runs.filter(r=>norm(r.text)===key);
    if(hits.length!==same.length)return null;
    const run=hits[same.indexOf(a)];
    if(!run||used.has(run)||unsafe(run.text.replace(/\n/g,'')))return null;
    // 표 칸 안 글은 줄 수가 같을 때만(칸 높이를 줄 수로 미리 정해 두었다). 본문 문단은 늘거나 줄어도 된다.
    if(run.path&&run.text.split('\n').length!==b.wrapped.split('\n').length)return null;
    used.add(run);patches.push({run,text:b.wrapped});
  }
  return patches;
}

const ok=result=>{const r=typeof result==='string'?JSON.parse(result):result;if(!r?.ok)throw Error('한글 창에 글을 넣지 못했습니다.');};
// 바뀐 구간만 지우고 넣는다. 앞뒤 같은 글자의 글자 모양은 그대로 남는다.
export function applyPatches(wasm,patches){
  for(const {run,text} of patches){
    const d=diffRegion(run.text,text),remove=d.endOld-d.start,insert=text.slice(d.start,d.endNew);
    if(run.path){
      const path=JSON.stringify(run.path);
      if(remove)ok(wasm.deleteTextInCellByPath(run.section,run.parent,path,d.start,remove));
      if(insert)ok(wasm.insertTextInCellByPath(run.section,run.parent,path,d.start,insert));
    }else{
      if(remove)ok(wasm.deleteText(run.section,run.para,d.start,remove));
      if(insert)ok(wasm.insertText(run.section,run.para,d.start,insert));
    }
  }
}
