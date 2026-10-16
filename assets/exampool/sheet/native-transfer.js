import {questionFingerprint,fromBase64,pageProfile,LAYOUT_VERSION} from './typeset-model.js?v=1014-compact-panel';
import {exportLayoutHwpx} from './native-hwpx.js?v=1014-compact-panel';
import {assertNativeLayout} from './native-layout-check.js?v=1014-compact-panel';
import {QUESTION_PAGE_MODE,validateQuestionPage} from './question-page.js?v=1014-compact-panel';
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const norm=v=>String(v).replace(/\s+/g,' ').trim();
export async function nativeImageSignature(document){
  const seen=new Set(),images=[];
  for(let page=0;page<document.pageCount();page++)for(const control of parse(document.getPageControlLayout(page)).controls){
    if(control.type!=='image')continue;
    const path=JSON.stringify(control.cellPath||[]),key=JSON.stringify([control.secIdx,control.paraIdx,path,control.controlIdx]);
    if(seen.has(key))continue;seen.add(key);
    const bytes=new Uint8Array(document.getControlImageData(control.secIdx,control.paraIdx,path,control.controlIdx));
    const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
    images.push([...hash].map(v=>v.toString(16).padStart(2,'0')).join(''));
  }
  // Moving a picture is a layout edit. Adding, deleting or replacing its
  // content belongs in the data sheet and must invalidate the approval.
  return images.sort().join('\n');
}
export function nativeLayoutSignature(document){
  const pages=[];
  for(let page=0;page<document.pageCount();page++){
    const text=parse(document.getPageTextLayout(page)).runs.filter(run=>run.text.length>0).map(({charShapeId,paraShapeId,secIdx,paraIdx,charStart,...run})=>run);
    const controls=parse(document.getPageControlLayout(page)).controls.map(({stableIndex,secIdx,paraIdx,controlIdx,cellPath,...control})=>{
      if(control.cells)control.cells=control.cells.map(({cellIdx,...cell})=>cell);
      if(control.type==='image'){
        const props=cellPath?.length?parse(document.getCellPicturePropertiesByPath(secIdx,paraIdx,JSON.stringify(cellPath),controlIdx)):parse(document.getPictureProperties(secIdx,paraIdx,controlIdx));
        const {binaryDataId,description,...layout}=props;control.pictureLayout=layout;
      }
      return control;
    });
    pages.push({text,controls});
  }
  return JSON.stringify(pages);
}
export function exportCompatibleHwp(document,CFB){
  assertNativeLayout(document);
  // Native paragraph import registers picture bytes, but the pinned engine's
  // HWP DocInfo raw stream can retain the previous binary count. Reopening its
  // native HWPX rebuilds those records without retypesetting through HTML.
  const canonical=new document.constructor(exportLayoutHwpx(document,CFB));
  try{
    assertNativeLayout(canonical);
    if(nativeLayoutSignature(document)!==nativeLayoutSignature(canonical))throw Error('HWP 저장 전후 배치가 다릅니다. HWPX로 저장하고 조판을 확인하세요.');
    const bytes=canonical.exportHwp(),checked=new document.constructor(bytes);
    try{if(JSON.parse(checked.getTextFileText())!==JSON.parse(canonical.getTextFileText()))throw Error('HWP 저장 시 글이 달라졌습니다. HWPX로 저장하세요.');
      // Force decoding all pictures before returning bytes: a broken binary
      // reference must fail before the user receives a damaged HWP file.
      for(let page=0;page<checked.pageCount();page++)for(const c of parse(checked.getPageControlLayout(page)).controls)if(c.type==='image')checked.getControlImageData(c.secIdx,c.paraIdx,JSON.stringify(c.cellPath||[]),c.controlIdx);
      if(nativeLayoutSignature(canonical)!==nativeLayoutSignature(checked))throw Error('HWP로 다시 열었을 때 줄 간격·개체 배치 차이가 확인됐습니다. 검수한 모양을 유지하려면 한글 저장 (.hwpx)을 사용하세요.');
    }finally{checked.free();}
    return bytes;
  }finally{canonical.free();}
}
export function exportVerifiedHwpx(document,CFB){
  assertNativeLayout(document);
  const bytes=exportLayoutHwpx(document,CFB),checked=new document.constructor(bytes);
  try{
    assertNativeLayout(checked);
    if(nativeLayoutSignature(document)!==nativeLayoutSignature(checked))throw Error('HWPX 저장 전후 모양이 달라졌습니다. 문항 조판에서 최종 모양을 확인하고 다시 저장하세요.');
    return bytes;
  }finally{checked.free();}
}
export async function openApprovedQuestion(Document,question,typeset){
  if(!typeset?.verified||typeset.layoutVersion!==LAYOUT_VERSION||typeset.fingerprint!==await questionFingerprint(question))throw Error('현재 문항의 조판을 저장한 뒤 다시 보내세요.');
  const source=new Document(fromBase64(typeset.bytes));
  try{
    assertNativeLayout(source);
    if(source.getSectionCount()!==1||source.getParagraphCount(0)<2)throw Error('조판 문서의 구역을 확인하세요.');
    if(norm(parse(source.getTextFileText()))!==typeset.baselineText)throw Error('조판 문서와 문항 내용이 다릅니다. 다시 조판을 저장하세요.');
    const config=pageProfile(typeset.profile),page=parse(source.getPageDef(0)),column=parse(source.getColumnDef(0)),expected=typeset.pageDef||config.page;
    if(typeset.pageMode===QUESTION_PAGE_MODE)validateQuestionPage(source,typeset.profile);
    if(['width','height','marginLeft','marginRight','marginTop','marginBottom','marginGutter'].some(k=>page[k]!==expected[k])||column.columnCount!==(typeset.pageMode===QUESTION_PAGE_MODE?1:typeset.profile.columns)||!column.sameWidth)throw Error('조판 화면의 용지·단 설정을 다시 저장하세요.');
    return source;
  }catch(e){source.free();throw e;}
}
export function nativeInsertOptions(source,section,insertBefore,dryRun=false){
  return JSON.stringify({request:{sourceSection:0,sourceStart:1,sourceEnd:source.getParagraphCount(0),targetSection:section,insertBefore,count:1},dryRun});
}
export function sameColumnGeometry(source,target,section=0){
  const a=parse(source.getPageDef(0)),b=parse(target.getPageDef(section)),ac=parse(source.getColumnDef(0)),bc=parse(target.getColumnDef(section));
  return ['width','height','marginLeft','marginRight','marginTop','marginBottom','marginGutter'].every(k=>a[k]===b[k])&&ac.columnCount===bc.columnCount&&ac.sameWidth===bc.sameWidth&&ac.spacing===bc.spacing;
}
