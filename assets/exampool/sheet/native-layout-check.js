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
  const add=(page,text,reason,cell)=>{
    const key=JSON.stringify([page,text,reason,cell?.row,cell?.col]);if(seen.has(key))return;seen.add(key);
    issues.push({page:page+1,text:snippet(text),reason,...cell?{row:cell.row+1,col:cell.col+1}:{}});
  };
  for(let page=0;page<document.pageCount();page++){
    const runs=parse(document.getPageTextLayout(page)).runs.filter(run=>run.text.trim());
    const controls=parse(document.getPageControlLayout(page)).controls;
    const cache=new Map();
    const cellBounds=(run,depth)=>{
      const path=run.cellPath.slice(0,depth),key=JSON.stringify([run.secIdx,run.parentParaIdx,path.map(v=>[v.controlIndex,v.cellIndex,v.cellParaIndex])]);
      if(cache.has(key))return cache.get(key);
      const json=JSON.stringify(path),index=path.at(-1).cellIndex;
      const box=parse(document.getTableCellBboxesByPath(run.secIdx,run.parentParaIdx,json)).find(cell=>cell.cellIdx===index&&cell.pageIndex===page);
      if(!box)throw Error('표의 글 위치를 확인하지 못했습니다. 조판을 다시 열어주세요.');
      const props=parse(document.getCellPropertiesByPath(run.secIdx,run.parentParaIdx,json,index));
      const pad=props.applyInnerMargin?{left:props.paddingLeft/75,right:props.paddingRight/75,top:props.paddingTop/75,bottom:props.paddingBottom/75}:{};
      const result={box,pad};cache.set(key,result);return result;
    };
    for(const run of runs){
      // h is the entire line height, including an inline fraction. fontSize
      // describes this text's glyph box; testing h would flag valid formulas.
      const rect={x:run.x,y:run.y,w:run.w,h:run.fontSize||run.h};
      for(let depth=1;depth<=(run.cellPath?.length||0);depth++){
        const {box,pad}=cellBounds(run,depth);
        if(outside(rect,box,pad))add(page,run.text,'글이 셀의 여백이나 테두리를 넘습니다',box);
      }
    }
    // Distinct lines/paragraphs must not share glyph space. Runs of different
    // scripts on the same line are adjacent and pass this test naturally.
    for(let i=0;i<runs.length;i++)for(let j=i+1;j<runs.length;j++){
      const a=runs[i],b=runs[j];
      if(intersects({...a,h:a.fontSize||a.h},{...b,h:b.fontSize||b.h}))add(page,a.text+' / '+b.text,'글자가 서로 겹칩니다. 줄 간격과 셀 높이를 확인하세요');
    }
    for(const control of controls.filter(c=>c.type==='image'||c.type==='equation')){
      for(const run of runs)if(intersects(control,{...run,h:run.fontSize||run.h}))add(page,run.text,`${control.type==='equation'?'수식':'그림'}과 글자가 겹칩니다. 크기와 어울림을 확인하세요`);
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

export function assertNativeLayout(document){
  const issue=nativeLayoutIssues(document)[0];
  if(issue)throw Error(`${issue.page}쪽${issue.row?` · 표 ${issue.row}행 ${issue.col}열`:''}: ${issue.reason}${issue.text?` (“${issue.text}”)`:''}. 배치를 수정한 뒤 조판 저장을 누르세요.`);
}
