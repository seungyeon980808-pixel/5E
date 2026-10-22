import {pageProfile} from './typeset-model.js?v=1014-compact-panel';
import {exportLayoutHwpx} from './native-hwpx.js?v=1014-compact-panel';
import {assertNativeLayout} from './native-layout-check.js?v=1014-compact-panel';

export const QUESTION_PAGE_MODE='question-column';
const HU=7200/25.4, PAD=Math.round(3*HU), MAX_HEIGHT=Math.round(1200*HU);
const parse=v=>typeof v==='string'?JSON.parse(v):v;

// The exam profile determines the body width. The editable document itself
// has one column and a content-sized physical page, independently of A4/B4/A3.
// standard: 조판 기준(여백·단 간격) — 학교 기준이면 그 단 폭으로 문항을 조판한다(10-22 S4). 없으면 수능 틀.
export function questionPageProfile(profile={paper:'A4',columns:2},heightMm=1200,standard){
  const exam=pageProfile(profile,standard),p=exam.page;
  const body=Math.floor((p.width-p.marginLeft-p.marginRight-exam.spacing*(profile.columns-1))/profile.columns);
  return {page:{...p,width:body+2*PAD,height:Math.round(heightMm*HU),marginLeft:PAD,marginRight:PAD,marginTop:PAD,marginBottom:PAD},
    bodyWidth:body,targetHeight:p.height-p.marginTop-p.marginBottom,width:exam.width,spacing:0};
}

export function questionPageMetrics(document,profile){
  const config=questionPageProfile(profile),p=parse(document.getPageDef(0)),count=document.pageCount();
  let used=0;
  for(let page=0;page<count;page++){
    const runs=parse(document.getPageTextLayout(page)).runs;
    const controls=parse(document.getPageControlLayout(page)).controls;
    let bottom=p.marginTop/75;
    for(const r of [...runs,...controls])if(Number.isFinite(r.y)&&Number.isFinite(r.h))bottom=Math.max(bottom,r.y+r.h);
    // Include intentional empty paragraphs and the final insertion line.
    if(page===count-1){
      const last=document.getParagraphCount(0)-1;
      const caret=parse(document.getCursorRect(0,last,document.getParagraphLength(0,last)));
      if(caret.pageIndex===page||caret.page===page||count===1)bottom=Math.max(bottom,caret.y+caret.height||caret.y+caret.h||bottom);
    }
    used+=(page<count-1?p.height-p.marginBottom:bottom*75)-p.marginTop;
  }
  return {bodyWidthMm:config.bodyWidth/HU,usedHeightMm:Math.max(0,used/HU),targetHeightMm:config.targetHeight/HU,
    exceeded:used>config.targetHeight+HU*.5,pages:count};
}

// A long question may continue on native pages; it still belongs to one ID and
// one sheet column. 1200mm limits raster size, never the amount of content.
export function fitQuestionPage(document,profile,{setPage=p=>document.setPageDef(0,JSON.stringify(p))}={}){
  let page=parse(document.getPageDef(0)),changed=false;
  const write=height=>{page={...page,height};const result=parse(setPage(page));if(result?.ok===false)throw Error('문항 용지 높이를 갱신하지 못했습니다.');changed=true;};
  while(document.pageCount()>1&&page.height<MAX_HEIGHT)write(Math.min(MAX_HEIGHT,Math.ceil(page.height*2)));
  let metrics=questionPageMetrics(document,profile);
  if(metrics.pages===1){
    // Keep a small editing cushion; round up to mm to avoid height oscillation.
    const height=Math.min(MAX_HEIGHT,Math.round(Math.max(45,Math.ceil(metrics.usedHeightMm+12))*HU));
    if(height!==page.height){write(height);metrics=questionPageMetrics(document,profile);}
  }
  return {...metrics,changed};
}

export function validateQuestionPage(document,profile){
  const expected=questionPageProfile(profile).page,p=parse(document.getPageDef(0)),c=parse(document.getColumnDef(0));
  if(['width','marginLeft','marginRight','marginTop','marginBottom','marginHeader','marginFooter','marginGutter'].some(k=>p[k]!==expected[k])||c.columnCount!==1||!c.sameWidth||c.spacing!==0)
    throw Error('문항 전용 용지 규격이 달라졌습니다. 상단의 기준 시험지·단 설정을 다시 선택하세요.');
  if(!(p.height>p.marginTop+p.marginBottom))throw Error('문항 용지 높이를 확인하세요.');
}

export function resizeQuestionDocument(document,profile,CFB){
  const Document=document.constructor,staged=new Document(exportLayoutHwpx(document,CFB));let settled,checked;
  try{
    staged.setPageDef(0,JSON.stringify(questionPageProfile(profile).page));staged.setColumnDef(0,1,0,true,0);
    // Width changes in the pinned engine retain stale table-flow offsets in
    // memory. Reopen offscreen before measuring or displaying the new paper.
    settled=new Document(exportLayoutHwpx(staged,CFB));fitQuestionPage(settled,profile);
    const bytes=exportLayoutHwpx(settled,CFB);checked=new Document(bytes);validateQuestionPage(checked,profile);assertNativeLayout(checked);
    if(parse(document.getTextFileText())!==parse(checked.getTextFileText()))throw Error('규격 변경 중 문항 내용이 달라졌습니다. 기존 조판을 유지합니다.');
    return bytes;
  }finally{checked?.free();settled?.free();staged.free();}
}
