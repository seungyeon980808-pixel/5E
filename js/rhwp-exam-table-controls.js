// The pinned Studio resizes selected cells with Ctrl+arrows. Extend that same
// native operation to a caret in one cell, preserving Studio's selection paths.
const installed=new WeakSet();
const parse=value=>typeof value==='string'?JSON.parse(value):value;
function cellList(document,pos){
  const lists=parse(document.getCursorModel()).lists;
  const path=pos.cellPath?.length?pos.cellPath:[{controlIndex:pos.controlIndex,cellIndex:pos.cellIndex,cellParaIndex:pos.cellParaIndex}];
  let list,hostPara=pos.parentParaIndex;
  const cellIds=new Set(lists.filter(l=>l.isCell).map(l=>l.listId));
  for(const step of path){
    list=lists.find(l=>l.isCell&&l.sectionIndex===pos.sectionIndex&&l.hostPara===hostPara&&l.controlIndex===step.controlIndex&&l.cellIndex===step.cellIndex&&(list?l.hostListId===list.listId:!cellIds.has(l.hostListId)));
    if(!list)throw Error('표의 셀을 다시 클릭하세요.');
    hostPara=step.cellParaIndex;
  }
  return list;
}

export function applyTableAlignment(bridge,alignment){
  if(!['left','center','right'].includes(alignment))throw Error('표 위치를 선택하세요.');
  const pos=bridge.input.getCursorPosition();
  if(!bridge.input.cursor.isInCell())throw Error('위치를 바꿀 표의 셀을 먼저 클릭하세요.');
  const document=bridge.wasm.borrowDocumentHandle(),list=cellList(document,pos);
  return bridge.transaction('table-alignment',()=>{
    const props=JSON.stringify({alignment});
    const result=parse((pos.cellPath?.length||1)>1?document.applyParaFormatAtCursor(list.hostListId,list.hostPara,props):document.applyParaFormat(pos.sectionIndex,pos.parentParaIndex,props));
    if(result?.ok===false)throw Error('표 위치를 변경하지 못했습니다.');return result;
  });
}

export function applyHangingIndent(bridge){
  const input=bridge.input,cursor=input?.cursor;
  if(!cursor||cursor.hasSelection()||['isInHeaderFooter','isInFootnote','isInTextBox','isInCellSelectionMode','isInTableObjectSelection','isInPictureObjectSelection'].some(k=>cursor[k]?.()))return false;
  const document=bridge.wasm.borrowDocumentHandle(),pos=input.getCursorPosition(),inCell=cursor.isInCell();
  const rect=offset=>parse(inCell?document.getCursorRectByPath(pos.sectionIndex,pos.parentParaIndex,JSON.stringify(pos.cellPath?.length?pos.cellPath:[{controlIndex:pos.controlIndex,cellIndex:pos.cellIndex,cellParaIndex:pos.cellParaIndex}]),offset):document.getCursorRect(pos.sectionIndex,pos.paragraphIndex,offset));
  const start=rect(0),caret=rect(pos.charOffset),indent=-Math.round(Math.max(0,caret.x-start.x)*150);
  bridge.transaction('hanging-indent',()=>{
    const props=JSON.stringify({indent});
    const result=inCell?document.applyParaFormatAtCursor(cellList(document,pos).listId,pos.cellPath?.at(-1)?.cellParaIndex??pos.cellParaIndex,props):document.applyParaFormat(pos.sectionIndex,pos.paragraphIndex,props);
    const checked=parse(result);if(checked?.ok===false)throw Error('내어쓰기를 적용하지 못했습니다.');return checked;
  });
  return true;
}

export function installTableShortcuts(bridge) {
  const doc=bridge.editor.element.contentDocument;
  if(installed.has(doc))return;installed.add(doc);
  doc.addEventListener('keydown',event=>{
    if(bridge.tableLayoutLocked&&(event.ctrlKey||event.metaKey&&bridge.input?.cursor.isInCellSelectionMode())&&!event.altKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)&&event.target===bridge.input?.textarea&&(bridge.input.cursor.isInCell()||bridge.input.cursor.isInCellSelectionMode()||bridge.input.cursor.isInTableObjectSelection())){
      event.preventDefault();event.stopImmediatePropagation();return;
    }
    if(event.key==='Tab'&&event.shiftKey&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.isComposing&&event.target===bridge.input?.textarea){
      try{if(applyHangingIndent(bridge)){event.preventDefault();event.stopImmediatePropagation();}}catch(error){event.preventDefault();event.stopImmediatePropagation();bridge.onChange?.(error);}return;
    }
    if(!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing || event.keyCode===229 || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    const input=bridge.input,cursor=input?.cursor;
    if(event.target!==input?.textarea || !cursor?.isInCell() || cursor.isInTextBox() || cursor.isInCellSelectionMode() || cursor.isInTableObjectSelection() || cursor.isInPictureObjectSelection() || cursor.hasSelection() || bridge.editor.element.ownerDocument.querySelector('#rhwp-exam-workspace[aria-busy="true"]'))return;
    const pos=input.getCursorPosition(),nested=pos.cellPath?.length>1,cellIdx=pos.cellPath?.at(-1)?.cellIndex ?? pos.cellIndex;
    if(!Number.isInteger(cellIdx))return;
    const wasm=bridge.wasm,path=nested?JSON.stringify(pos.cellPath):null;
    let props;
    try {props=nested?wasm.getCellPropertiesByPath(pos.sectionIndex,pos.parentParaIndex,path,cellIdx):wasm.getCellProperties(pos.sectionIndex,pos.parentParaIndex,pos.controlIndex,cellIdx);}catch{return;}
    if(props.cellProtect)return;
    const delta=['ArrowRight','ArrowDown'].includes(event.key)?300:-300;
    const change={cellIdx,[event.key==='ArrowLeft'||event.key==='ArrowRight'?'widthDelta':'heightDelta']:delta};
    event.preventDefault();event.stopImmediatePropagation();
    try {bridge.transaction('resize-cell-keyboard',()=>{
      const result=nested?wasm.resizeTableCellsByPath(pos.sectionIndex,pos.parentParaIndex,path,[change]):wasm.resizeTableCells(pos.sectionIndex,pos.parentParaIndex,pos.controlIndex,[change]);
      if(result?.ok===false)throw new Error('이 셀의 크기를 바꾸지 못했습니다.');
      return result;
    });}catch(error){bridge.onChange?.(error);}
  },true);
}
