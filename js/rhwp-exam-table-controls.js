// The pinned Studio resizes selected cells with Ctrl+arrows. Extend that same
// native operation to a caret in one cell, preserving Studio's selection paths.
const installed=new WeakSet();
export function installTableShortcuts(bridge) {
  const doc=bridge.editor.element.contentDocument;
  if(installed.has(doc))return;installed.add(doc);
  doc.addEventListener('keydown',event=>{
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
