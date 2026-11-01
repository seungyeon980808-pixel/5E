const parse=value=>typeof value==='string'?JSON.parse(value):value;
const EPS=.8;
const intersects=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>EPS&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>EPS;
const outside=(rect,box,pad={})=>rect.x<box.x+(pad.left||0)-EPS||rect.x+rect.w>box.x+box.w-(pad.right||0)+EPS||rect.y<box.y+(pad.top||0)-EPS||rect.y+rect.h>box.y+box.h-(pad.bottom||0)+EPS;
const snippet=text=>String(text).trim().slice(0,22);

// Inspect the native renderer's geometry, including each ancestor cell of a
// nested table. Matching serialization alone can otherwise approve a layout
// that looks identically wrong before and after saving.
export function nativeLayoutIssues(document){
  const issues=[],seen=new Set();
  // para: 문제 글이 속한 본문 문단(칸 안 글은 그 표의 문단) — 학교 양식 자체 머리 부분 문제를 가려낼 때 쓴다(11-01).
  const add=(page,text,reason,cell,para,extra={})=>{
    const key=JSON.stringify([page,text,reason,cell?.row,cell?.col]);if(seen.has(key))return;seen.add(key);
    issues.push({page:page+1,text:snippet(text),reason,...cell?{row:cell.row+1,col:cell.col+1}:{},...Number.isInteger(para)?{para}:{},...extra});
  };
  for(let page=0;page<document.pageCount();page++){
    const runs=parse(document.getPageTextLayout(page)).runs.filter(run=>run.text.trim());
    const controls=parse(document.getPageControlLayout(page)).controls;
    const cache=new Map();
    const cellBounds=(run,depth)=>{
      const path=run.cellPath.slice(0,depth),key=JSON.stringify([run.secIdx,run.parentParaIdx,path.map(v=>[v.controlIndex,v.cellIndex,v.cellParaIndex])]);
      if(cache.has(key))return cache.get(key);
      const json=JSON.stringify(path),index=path.at(-1).cellIndex;
      const boxes=parse(document.getTableCellBboxesByPath(run.secIdx,run.parentParaIdx,json)),box=boxes.find(cell=>cell.cellIdx===index&&cell.pageIndex===page);
      // 엔진이 그 쪽의 칸 자리를 주지 않는 표(11-01 밤샘 가짜 양식 f10·f14·f16: 학교 양식의 배경색 한 칸 떠 있는 제목 표)는 칸 넘침 검사만 건너뛴다 —
      // 예전에는 여기서 멈춰 시험지를 통째로 내보내지 못했다. 글 겹침 검사는 그대로 한다.
      if(!box){cache.set(key,null);return null;}
      const props=parse(document.getCellPropertiesByPath(run.secIdx,run.parentParaIdx,json,index));
      const pad=props.applyInnerMargin?{left:props.paddingLeft/75,right:props.paddingRight/75,top:props.paddingTop/75,bottom:props.paddingBottom/75}:{};
      const result={box,pad};cache.set(key,result);return result;
    };
    for(const run of runs){
      // h is the entire line height, including an inline fraction. fontSize
      // describes this text's glyph box; testing h would flag valid formulas.
      const rect={x:run.x,y:run.y,w:run.w,h:run.fontSize||run.h};
      for(let depth=1;depth<=(run.cellPath?.length||0);depth++){
        const bound=cellBounds(run,depth);if(!bound)break;const {box,pad}=bound;
        // withinBorder: 칸 안 여백에만 들어가고 칸 테두리는 넘지 않음(학교 양식에서는 깨짐으로 보지 않는다 — 11-01 밤샘).
        if(outside(rect,box,pad))add(page,run.text,'글이 셀의 여백이나 테두리를 넘습니다',box,run.parentParaIdx,{withinBorder:!outside(rect,box)});
      }
    }
    // Distinct lines/paragraphs must not share glyph space. Runs of different
    // scripts on the same line are adjacent and pass this test naturally.
    for(let i=0;i<runs.length;i++)for(let j=i+1;j<runs.length;j++){
      const a=runs[i],b=runs[j];
      if(intersects({...a,h:a.fontSize||a.h},{...b,h:b.fontSize||b.h}))add(page,a.text+' / '+b.text,'글자가 서로 겹칩니다. 줄 간격과 셀 높이를 확인하세요',null,Math.max((a.cellPath||[]).length?a.parentParaIdx:a.paraIdx,(b.cellPath||[]).length?b.parentParaIdx:b.paraIdx));
    }
    for(const control of controls.filter(c=>c.type==='image'||c.type==='equation')){
      // graze: 수식 상자 아래·위가 옆줄 글 상자에 2px 이하로만 닿음(글자 획은 겹치지 않음) — 학교 양식에서는 깨짐으로 보지 않는다(11-02 밤샘 물리 「자기 선속」 1.5px).
      for(const run of runs){const r={...run,h:run.fontSize||run.h};if(intersects(control,r))add(page,run.text,`${control.type==='equation'?'수식':'그림'}과 글자가 겹칩니다. 크기와 어울림을 확인하세요`,null,null,{graze:control.type==='equation'&&Math.min(control.y+control.h,r.y+r.h)-Math.max(control.y,r.y)<=2});}
    }
    const sec=runs[0]?.secIdx??controls[0]?.secIdx??0,definition=parse(document.getPageDef(sec)),columns=parse(document.getColumnDef(sec));
    const left=(definition.marginLeft+definition.marginGutter)/75,right=(definition.width-definition.marginRight)/75,top=definition.marginTop/75,bottom=(definition.height-definition.marginBottom)/75;
    const count=columns.columnCount,gap=columns.spacing/75,width=(right-left-gap*(count-1))/count;
    if(columns.sameWidth)for(const c of controls.filter(c=>c.type==='table')){
      const col=Math.min(count-1,Math.max(0,Math.floor((c.x-left+.8)/(width+gap))));
      if(outside(c,{x:left+col*(width+gap),y:top,w:width,h:bottom-top}))add(page,'표','표가 단 너비나 인쇄 영역을 넘습니다');
    }
  }
  return issues;
}

// lenient(학교 양식): 칸 여백에만 조금 들어간 글, 수식 상자가 옆줄에 2px 이하로 닿은 것은 넘어가 준다 — 끊을 수 없는 「수식이다.」 줄 등. 칸 테두리를 넘거나 글끼리 겹치면 그대로 막는다.
export function assertNativeLayout(document,{lenient=false}={}){
  const issue=nativeLayoutIssues(document).find(i=>!(lenient&&(i.withinBorder||i.graze)));
  if(issue)throw Error(`${issue.page}쪽${issue.row?` · 표 ${issue.row}행 ${issue.col}열`:''}: ${issue.reason}${issue.text?` (“${issue.text}”)`:''}. 배치를 수정한 뒤 조판 저장을 누르세요.`);
}
