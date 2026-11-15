import {saveOut,savedText} from './save-out.js';
import {renumberDocument} from '../../../js/rhwp-exam-layout-tools.js?v=1.7.0-four-session-integration';
import {attachGapView,questionElements} from './typeset-gaps.js';
import {attachTypesetSettings} from './typeset-settings.js';
import {marksEnabled,setMarksEnabled} from '../../../js/rhwp-exam-marks.js?v=1.7.0-four-session-integration';
import {fitQuestionLines,fitQuestionParagraph} from './line-fit.js';
import {readSchoolForm as readSchoolDocument,formStructure} from './standard-from-hwp.js';
import {KICE_STANDARD,standardForPaper,resolveStandard} from './typeset-standard.js';
import {RhwpExamBridge} from '../../../js/rhwp-exam-bridge.js?v=1.7.0-four-session-integration';
import {buildExamDocument,assembleExamChecked,assembleFormChecked,fillFormPageCount,clearFormBody} from './exam-build.js';
import {examPage,examPlan} from './exam-layout.js';
import {buildTextMap,mapTextEdit,applyTextEdit} from './text-sync.js';
import {loadImage} from './image-load.js';
import {attachPlacementLayer} from './placement-layer.js';
import {applyTableCommand} from './table-ops.js';
import {snapshotTableAt,tableFromSnapshot} from './table-read.js';
import {PictureSettings} from '../../../js/rhwp-exam-picture-controls.js?v=1.7.0-four-session-integration';
import {buildQuestionHtml,verifyNativeQuestion,skeletonKey,decodeNativeText} from './handoff.js';
import {applyTightBogi,applyKiceTallLines,questionFingerprint,typesetMatches,renderedContent,toBase64,fromBase64,materializeEquations,normalizeQuestionImport,applyQuestionIndent,applyReferenceBogiIndent,applyCellEquationLines,applyFloatingPictures,growCellsToContent,applyCellFloatingPictures,settleFloatingPictures,applyFloatingTable,centerBogiBoxes,applyLiftTallEquations,anchorRaisedTables,anchorRaisedTablesOpen,widenBelowPictures,resettleBesidePictures,LAYOUT_VERSION,centerCellPictures,fixedLabelSpaces} from './typeset-model.js?v=1014-compact-panel';
import {QUESTION_PAGE_MODE,frameProfile,questionPageProfile,fitQuestionPage,questionPageMetrics,validateQuestionPage,resizeQuestionDocument} from './question-page.js?v=1014-compact-panel';
import {applyTableAlignment,applyHangingIndent} from '../../../js/rhwp-exam-table-controls.js?v=1.7.0-four-session-integration';
import {nativeLayoutSignature,nativeImageSignature} from './native-transfer.js?v=1014-compact-panel';
import {exportLayoutHwpx} from './native-hwpx.js?v=1014-compact-panel';
import {assertNativeLayout,nativeLayoutIssues} from './native-layout-check.js?v=1014-compact-panel';
import {attachTypesetView} from './typeset-view.js';
import {createNativeTextMeasurer} from './native-text-measure.js';
import {compactSavedBogi} from './compact-bogi.js';
import {nativeRuns,planPatches,applyPatches,layoutKey} from './live-patch.js';

const parse=value=>typeof value==='string'?JSON.parse(value):value;
// 한 화면에 엔진 SVG를 여럿 둘 때 안의 이름(id·clipPath)이 겹치지 않게(10-24 같은 문제).
let uniqueSeq=0;
const uniqueSvg=svg=>{const pre='u'+(++uniqueSeq)+'-';return svg.replace(/\bid="([^"]+)"/g,(m,id)=>`id="${pre}${id}"`).replace(/url\(#([^)]+)\)/g,(m,id)=>`url(#${pre}${id})`).replace(/(xlink:href|href)="#([^"]+)"/g,(m,attr,id)=>`${attr}="#${pre}${id}"`);};
// 글자 폭 재기: 학교 양식 틀(source.kind 'hwp', 10-29)은 양식 글꼴·장평·자간으로, 그 밖(수능 틀·복제 틀)은 예전 그대로.
const measurers=new Map();
function measurerFor(Document,standard){
  const school=standard?.source?.kind==='hwp'&&standard.text?.font,key=school?`${standard.text.font}|${standard.text.ratio}|${standard.text.spacing}`:'';
  if(!measurers.has(key))measurers.set(key,school?createNativeTextMeasurer(Document,{font:standard.text.font,factor:(standard.text.ratio+standard.text.spacing)/100}):createNativeTextMeasurer(Document));
  return measurers.get(key);
}
// 틀 보기용 빈 그림 자리: 옅은 점선 상자에 이름. PNG라야 한글 엔진이 받는다.
const ghostFigures=new Map();
function ghostFigure(width,height,label){
  const key=`${width}x${height}:${label||''}`;if(ghostFigures.has(key))return ghostFigures.get(key);
  const scale=2,canvas=window.document.createElement('canvas');canvas.width=width*scale;canvas.height=height*scale;const g=canvas.getContext('2d');g.scale(scale,scale);
  g.fillStyle='#f4f5f6';g.fillRect(0,0,width,height);g.strokeStyle='#b8bdc3';g.lineWidth=1;g.setLineDash([4,3]);g.strokeRect(.5,.5,width-1,height-1);
  g.fillStyle='#9aa0a6';g.textAlign='center';g.textBaseline='middle';
  const line=(text,size,y)=>{let px=size;do g.font=`${px}px "Apple SD Gothic Neo",sans-serif`;while(g.measureText(text).width>width-12&&--px>7);g.fillText(text,width/2,y);};
  line('자료',13,height/2);
  const figure={name:'자료 자리.png',data:canvas.toDataURL('image/png'),width,height};ghostFigures.set(key,figure);return figure;
}
const SKELETON={skeleton:true,ghostFigure};
// 문서 첫 문단은 구역 정보를 품는 자리라 시험지로 옮길 때 빠진다(native-transfer sourceStart:1). 높이가 거의 없는 빈 문단으로 둔다.
const LEAD='<p style="margin:0;font-size:1pt;line-height:100%"> </p>';
const normalized=text=>String(text).replace(/\s+/g,' ').trim();
export function createTypesetter({host,status,paper,columns,save,download,onSave,onPlacement,onTextEdit,onDiverge,onSlot,standardOf=()=>KICE_STANDARD,standardsOf=()=>[],onGap,onStandard,onSetting}){
  let autoTimer=0,autoTries=0;
  // 조판 자동 저장(10-23 A2): 고친 뒤 1.5초 쉬면 저장하고, 새로 만든 조판은 바로 저장한다. 「조판 저장」 단추는 없앴다. 실패할 때만 알린다.
  function scheduleAuto(delay=1500){clearTimeout(autoTimer);autoTimer=setTimeout(()=>{autoSaveNow().catch(()=>{});},delay);}
  async function autoSaveNow(){
    if(!ready||loading||fitting||lineFitting||!dirty||!q)return;
    // 빈 칸(회색 「자료」·「발문」 자리)이 있으면 저장하지 않는다 — 채우면 그때 자동 저장.
    if(skeletonKey(q)){message('비어 있는 칸이 있어 조판은 채운 뒤 자동 저장됩니다.');return;}
    if(bridge&&[...bridge.editor.element.contentDocument.querySelectorAll('.modal-overlay')].some(n=>n.getClientRects().length))return scheduleAuto(3000);
    try{const s=await snapshot();if(!s){if(++autoTries<3)scheduleAuto(800);return;}autoTries=0;await onSave(s,q.id);dirty=false;userDirty=false;patchDirty=false;message('자동 저장됨');}
    catch(e){autoTries=0;message(`조판을 자동 저장하지 못했습니다: ${e.message}`,true);}
  }
  let settings=null,gaps=null,lockedFor='',lineFitTimer=0,lineFitting=false;
  // 한글 창에서 글을 고치면 입력이 0.3초 멈춘 뒤 커서가 있는 문단만, 커서 줄부터 아래로 자간을 다시 맞춘다(10-22 O1). 한 번의 되돌리기 단계.
  // 표 칸 안·수식·그림이 든 문단은 건너뛴다(만들 때 규칙과 같음). 글자 위치(커서)는 그대로. host.dataset.lineFit: 마지막 결과(검사·문제 찾기용).
  function scheduleLineFit(){clearTimeout(lineFitTimer);lineFitTimer=setTimeout(()=>{try{
      const S=std(q);if(!S.fit?.on||!ready||loading||!bridge?.input){host.dataset.lineFit='skip:off';return;}const pos=bridge.input.getCursorPosition?.();
      if(!pos||pos.cellPath?.length||Number.isInteger(pos.cellIndex)){host.dataset.lineFit='skip:cell';return;}
      lineFitting=true;const r=bridge.transaction('line-fit',()=>fitQuestionParagraph(bridge.wasm.borrowDocumentHandle(),pos.sectionIndex||0,pos.paragraphIndex,{low:S.fit.low,high:S.fit.high,shortLastLine:S.fit.shortLastLine,base:S.text.spacing,from:pos.charOffset||0}));
      host.dataset.lineFit=r?.skip?'skip:'+r.skip:r?.reverted?'reverted':r?.changed?'changed':'same';
      bridge.deps.eventBus.emit('document-changed');
    }catch(e){host.dataset.lineFit='error:'+String(e?.message||e).slice(0,80);}finally{requestAnimationFrame(()=>{lineFitting=false;});}},300);}
  // 문항마다 그 문항의 조판 기준(문항 → 시험지 → 수능 틀)으로 조판한다(10-22 조판 기준).
  const std=value=>standardOf(value)||KICE_STANDARD,stdKey=value=>JSON.stringify(std(value));
  // 등록한 학교 양식의 틀(양식을 등록할 때 같이 저장한 조판 기준).
  // form.standard(11-01): 등록 창 「조판 확정」 견본은 아직 저장하지 않은 초안 틀로 묶는다.
  const formStandardOf=form=>{const s=form?.standard||form?.standardId&&standardsOf().find(x=>x.id===form.standardId);return s?resolveStandard(s):null;};
  // 지금 조판에 쓴 기준(열 때 값). 기준 값을 바꾸면 내용이 같아도 다시 만든다.
  let qStd='';
  let userDirty=false,patchDirty=false;
  let textMap=null,syncTimer=0,placer=null,owners=null,bridge=null,starting=null,q=null,fingerprint='',baselineText='',baselineEquations='',baselineImages='',opening=0,loading=false,ready=false,pictureSettings,fitting=false,fitFrame=0,lastProfile,metricsCache,view,dirty=false,patching=false,updating=Promise.resolve(),measurer=null,changingProfile=Promise.resolve();
  const message=(text,error=false)=>{status.textContent=text;status.title=text;status.dataset.error=String(error);
    // 구조 잠금에 막혔을 때(11-01 사용자: 그림이 왜 안 옮겨지나) 안내로 끝내지 않고 그 자리에서 잠금을 풀게 한다. 고른 그림은 그대로라 바로 끌면 된다.
    if(error&&String(text).startsWith('구조 잠금 중')){const b=Object.assign(host.ownerDocument.createElement('button'),{type:'button',className:'ts-unlock',textContent:'잠금 풀고 옮기기'});
      b.onclick=e=>{e.stopPropagation();if(bridge?.tableLayoutLocked)host.parentElement.querySelector('#typeset-lock')?.click();bridge?.input?.textarea?.focus({preventScroll:true});};status.append(' ',b);}};// 카드 미리보기 칸에서는 한 줄로 줄이므로 전체 글은 풍선으로
  const document=()=>bridge.wasm.borrowDocumentHandle();
  // 엔진이 화면용 글자 폭(Canvas2D 보조 측정)을 켜 둔 동안 SVG를 그리면 「Canvas2D supplemental metrics are active; select portable metrics」로
  // 거부해 카드에 「미리보기를 그리지 못했습니다」가 떴다(10-25). SVG는 엔진 다리의 portable 글자 폭으로 그린다.
  const svgOf=(doc,page)=>typeof bridge?.wasm?.withPortableMetrics==='function'?bridge.wasm.withPortableMetrics(()=>doc.renderPageSvg(page)):doc.renderPageSvg(page);
  // 문서를 다시 읽으면 한글 편집기가 자기 입력칸으로 초점을 가져간다(빈 문서 만들기·읽기마다, 겹치면 여러 번). 그러면 카드 칸 입력과
  // ⌘Z·⇧⌘Z가 한글 창으로 넘어간다. 한글 창 밖에 초점이 있을 때 읽는 동안만 편집기의 focus()를 막고, 그 사이 한글 창을 누르거나 치면 바로 푼다.
  let quietLoads=0,quietProto=null,quietFocus=null;
  const unquiet=()=>{if(quietProto){quietProto.focus=quietFocus;quietProto=null;}};
  const keepingFocus=async task=>{
    const frame=host.querySelector('iframe'),view=frame?.contentWindow,inner=frame?.contentDocument,page=globalThis.document;
    if(!view||!inner||host.contains(page.activeElement)||inner.hasFocus())return task();
    if(!inner.__fiveEQuiet){inner.__fiveEQuiet=true;for(const type of ['pointerdown','keydown'])inner.addEventListener(type,unquiet,true);}
    if(quietLoads++===0){quietProto=view.HTMLElement.prototype;quietFocus=quietProto.focus;quietProto.focus=function(){};}
    try{return await task();}finally{if(--quietLoads===0)unquiet();}};
  // 문서를 다시 여는 동안(그림 크기·배치처럼 글자만 고칠 수 없는 변경) 한글 창이 잠깐 비어 깜빡였다.
  // 다시 열기 직전에 보이는 쪽을 한 장으로 떠서 그 자리에 덮어 두고, 새 쪽이 그려지면 살짝 흐려지며 걷는다.
  function freeze(){try{const frame=host.querySelector('iframe'),inner=frame?.contentDocument,sc=inner?.querySelector('#scroll-container');if(!sc||!sc.querySelector('canvas'))return null;
    const fr=frame.getBoundingClientRect(),hr=host.getBoundingClientRect(),dpr=Math.min(2,globalThis.devicePixelRatio||1),c=globalThis.document.createElement('canvas');
    c.width=Math.round(fr.width*dpr);c.height=Math.round(fr.height*dpr);c.className='typeset-freeze';c.setAttribute('aria-hidden','true');
    c.style.cssText=`position:absolute;left:${fr.left-hr.left}px;top:${fr.top-hr.top}px;width:${fr.width}px;height:${fr.height}px;z-index:15;pointer-events:none;transition:opacity 140ms ease-out`;
    const g=c.getContext('2d');g.scale(dpr,dpr);g.fillStyle=getComputedStyle(sc).backgroundColor||'#fff';g.fillRect(0,0,fr.width,fr.height);
    for(const cv of sc.querySelectorAll('canvas')){const r=cv.getBoundingClientRect();if(r.bottom<0||r.top>fr.height||!r.width)continue;try{g.drawImage(cv,r.left,r.top,r.width,r.height);}catch{}}
    // 11-15: 엔진 창 위에 얹힌 그림(빈 자료 칸 「자료」, 칸 그림 등 img)도 덮개에 — 덮개 동안 빠져 보였다.
    for(const im of sc.querySelectorAll('img')){const r=im.getBoundingClientRect();if(!im.complete||!im.naturalWidth||r.bottom<0||r.top>fr.height||!r.width||getComputedStyle(im).visibility==='hidden')continue;try{g.drawImage(im,r.left,r.top,r.width,r.height);}catch{}}
    if(getComputedStyle(host).position==='static')host.style.position='relative';host.append(c);
    // 11-15(사용자 승인 8): 덮개에 조판 부호(빨간 V·초록 선, 엔진 창 안 SVG)와 간격 띠(점선, ts-gap-layer)도 함께 — 덮개 동안 부호가 사라졌다 나타났다.
    {const extra=[],ox=fr.left-hr.left,oy=fr.top-hr.top;
      const marks=inner?.querySelector('[data-exam-marks]');if(marks&&getComputedStyle(marks).display!=='none'){const m=marks.cloneNode(true);m.removeAttribute('data-exam-marks');m.style.position='absolute';m.style.left=(ox+(parseFloat(marks.style.left)||0))+'px';m.style.top=(oy+(parseFloat(marks.style.top)||0))+'px';m.style.zIndex='15';m.style.transition='opacity 140ms ease-out';host.append(m);extra.push(m);}
      for(const layer of host.querySelectorAll('.ts-gap-layer,.placement-layer')){if(layer.hidden||!layer.childElementCount)continue;const k=layer.cloneNode(true);k.classList.add('ts-gap-frozen');k.style.zIndex='15';k.style.pointerEvents='none';k.style.transition='opacity 140ms ease-out';layer.after(k);extra.push(k);}
      c._extra=extra;}
    // 11-14 2차 25: 그림 크기를 바꾼 직후면 그 그림만 떼어 새 크기로 부드럽게 줄이고(0.26초), 새 쪽이 그려지면 함께 걷는다.
    const hint=host.__fiveEResizeHint;host.__fiveEResizeHint=null;
    if(hint&&performance.now()-hint.at<1500&&Math.abs(hint.scale-1)>.001){const r=hint.rect,ox=fr.left-hr.left,oy=fr.top-hr.top,p=globalThis.document.createElement('canvas');
      p.width=Math.max(1,Math.round(r.w*dpr));p.height=Math.max(1,Math.round(r.h*dpr));p.getContext('2d').drawImage(c,(r.x-ox)*dpr,(r.y-oy)*dpr,r.w*dpr,r.h*dpr,0,0,p.width,p.height);
      g.fillStyle='#fff';g.fillRect(r.x-ox,r.y-oy,r.w,r.h);
      const origin=hint.align==='왼쪽'?'left top':hint.align==='오른쪽'?'right top':'center top';
      p.style.cssText=`position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;z-index:16;pointer-events:none;transform-origin:${origin};transition:transform 260ms cubic-bezier(.22,.75,.2,1),opacity 140ms ease-out`;
      host.append(p);requestAnimationFrame(()=>requestAnimationFrame(()=>{p.style.transform=`scale(${hint.scale})`;}));c._piece=p;}
    return c;}catch{return null;}}
  const thaw=c=>{if(!c)return;const p=c._piece,x=c._extra||[];setTimeout(()=>requestAnimationFrame(()=>{c.style.opacity='0';if(p)p.style.opacity='0';for(const n of x)n.style.opacity='0';setTimeout(()=>{c.remove();p?.remove();for(const n of x)n.remove();},160);}),p?280:160);};
  const loadKeepingFocus=async(bytes,name)=>{const snap=freeze();try{return await keepingFocus(()=>bridge.load(bytes,name));}finally{thaw(snap);}};
  // 학교 양식 틀이면 양식 여백·단 간격(frame)을 함께 — 문항마다 다르므로 그 문항(value)의 틀로.
  const profileFor=value=>({paper:paper.value,columns:Number(columns.value),...frameProfile(value&&std(value))}),profile=()=>profileFor(q);
  const metricsOutput=host.parentElement.querySelector('#typeset-metrics');
  const guideLayer=window.document.createElement('div');guideLayer.className='question-guide-layer';guideLayer.setAttribute('aria-hidden','true');
  const guide=window.document.createElement('div');guide.className='question-height-guide';guide.hidden=true;
  const guideLabel=window.document.createElement('span');guide.append(guideLabel);guideLayer.append(guide);host.append(guideLayer);
  function drawGuide(){
    placer?.refresh();gaps?.draw();settings?.draw();
    guide.hidden=true;if(!ready||loading||!host.getClientRects().length)return;
    const m=metricsCache||questionPageMetrics(document(),profile()),placement=bridge.pagePlacement(0);
    metricsOutput.textContent=`본문 폭 ${m.bodyWidthMm.toFixed(1)}mm · 문항 ${m.usedHeightMm.toFixed(1)} / 출력 기준 ${Math.round(m.targetHeightMm)}mm${m.exceeded?' · 출력 기준 높이 초과':''}`;
    metricsOutput.dataset.exceeded=String(m.exceeded);
    const viewport=bridge.figureViewport();if(!placement||!viewport)return;
    const rect=host.getBoundingClientRect();guideLayer.style.left=`${viewport.x-rect.left}px`;guideLayer.style.top=`${viewport.y-rect.top}px`;guideLayer.style.width=`${viewport.w}px`;guideLayer.style.height=`${viewport.h}px`;
    const p=parse(document().getPageDef(0)),limit=p.marginTop/75+m.targetHeightMm*(7200/25.4)/75;
    if(limit>=p.height/75)return;
    const point=bridge.parentPoint(placement.x+p.marginLeft/75*placement.scale,placement.y+limit*placement.scale);
    guide.style.left=`${point.x-viewport.x}px`;guide.style.top=`${point.y-viewport.y}px`;guide.style.width=`${m.bodyWidthMm*(7200/25.4)/75*placement.scale*point.scaleX}px`;
    guideLabel.textContent=`출력 기준 높이 ${Math.round(m.targetHeightMm)}mm`;guide.hidden=false;
  }
  function fitLive(){
    if(!ready||loading||fitting)return;
    fitting=true;
    try{validateQuestionPage(document(),profile());const result=fitQuestionPage(document(),profile(),{setPage:p=>bridge.wasm.setPageDef(0,p)});metricsCache=result;
      if(result.changed)bridge.deps.eventBus.emit('document-changed');
      drawGuide();
    }finally{fitting=false;}
  }
  function scheduleFit(){if(fitting||fitFrame||!ready)return;fitFrame=requestAnimationFrame(()=>{fitFrame=0;try{fitLive();}catch(e){message(e.message,true);}});}
  const equationScripts=async bytes=>{const zip=await JSZip.loadAsync(new Uint8Array(bytes)),xml=await zip.file('Contents/section0.xml').async('string');return [...xml.matchAll(/<hp:script>([\s\S]*?)<\/hp:script>/g)].map(m=>m[1]).join('\n');};
  async function ensure(){
    if(!starting)starting=RhwpExamBridge.create(host,{showEditingBorders:true,tableLayoutLocked:true,onChange:error=>{if(patching&&!error){scheduleFit();return;}if(lineFitting)return;if(ready&&!loading&&!fitting){dirty=true;userDirty=true;patchDirty=false;message(error?error.message:'조판 수정 중 · 잠시 뒤 자동 저장',!!error);scheduleFit();scheduleTextSync();if(!error){scheduleLineFit();scheduleAuto();}}},onEdit:(_id,ref)=>{
      // 11-14(시안 review-1114 1-7): 미리보기에서 그림을 두 번 누르면 고치는 곳(문항 카드의 그 칸)으로 간다 — 옛 그림 설정 창은 열지 않는다.
      if(placer?.jumpRef?.(ref))return;bridge.selectPicture(ref);
    }}).then(async b=>{bridge=b;bridge.setLayoutRules(true);bridge.setPictureResizeAllowed(true);await keepingFocus(()=>bridge.newDocument());bridge.watchView(drawGuide);view=attachTypesetView(bridge,host);gaps=attachGapView({bridge,host,panel:host.parentElement,context:()=>({ready:ready&&!loading,q,owners,standard:std(q),standards:standardsOf()}),onGap,onStandard});settings=attachTypesetSettings({panel:host.parentElement,context:()=>({q,standard:std(q),standards:standardsOf()}),preview:(value,standard)=>previewSheet(value,standard),onApply:a=>onSetting?.({apply:a.standard,exception:a.exception}),onStandard});placer=attachPlacementLayer({bridge,host,hint:host.parentElement.querySelector('#placement-hint-text'),onActivate:(action,block,ref)=>{if(action==='settings'){bridge.selectPicture(ref);pictureSettings.open(bridge.pictureLayout(ref),save,{ref,generation:bridge.generation,inlineAlignment:!!bridge.paragraphTarget(ref)});return;}onSlot?.(action,block,q?.id);},onApply:(fn,text,opt)=>{/* 11-14 3차 36: 문서에서 이미 바꾼 변경(그림 크기)은 이 문서의 문항에도 바로 반영해 「다시 조판」 판정이 일어나지 않게 하고, 저장할 모양으로 표시 */if(opt?.native&&q){try{fn(q);dirty=true;userDirty=true;requestAnimationFrame(()=>placer?.refresh());}catch{}}return onPlacement?.(fn,text,q?.id,opt);},canEdit:()=>{if(!ready||loading)return false;if(dirty){message('한글 창에 저장 전 수정이 있어 배치를 바꿀 수 없습니다. 조판 저장 후 다시 끌어 주세요.',true);return false;}return true;}});bridge.onPictureResized=(ref,width)=>placer?.nativeResized(ref,width);
{/* 11-15: 미리보기 자료 표에서 되는 일(글·⌘화살표 칸 크기·굵게·정렬)은 그 자리에서 문서만 바꾸고 다시 조판하지 않는다.
   칸 크기를 바꾸면 바깥 자료 칸 줄 자리를 바로 다시 잡고(엔진이 옛 높이를 남겨 칸이 크게 늘었다: 표 +20px에 바깥 +151px),
   잠시 뒤 표 전체(칸 글·열 폭·줄 높이·칸 모양)를 읽어 카드 표 자료로 옮긴다 — 다시 조판해도 같은 표가 나온다.
   줄·칸 넣기·지우기·합치기 같은 표 모양 명령은 표 편집 창으로 연다(엔진이 표 안의 표는 이 명령을 바깥 틀 표에 적용한다). */
  const inp=bridge.input;if(inp&&!inp.__fiveETableHook){inp.__fiveETableHook=true;const run=inp.executeOperation.bind(inp);
    inp.executeOperation=(op,...a)=>{const here=ready&&!loading&&q?dataTableHere():null;if(!here)return run(op,...a);
      const type=op?.kind==='command'?op.command?.type:op?.operationType;rememberBefore(here);
      if(op?.kind==='snapshot'&&typeof op.operation==='function'){const f=op.operation;op={...op,operation:(...b)=>{const r=f(...b);settleTable(here);return r;}};}
      const r=run(op,...a);
      if(!/^(insertText|deleteText|insertTab|splitParagraph|mergeParagraph)/.test(String(type||'')))queueTableSync(here.block.id);
      return r;};}};
bridge.input.examTableEdit=id=>{try{if(!ready||loading||!q)return false;{const here=dataTableHere();if(here){bridge.input.exitCellSelectionMode?.();onSlot?.('table-window',here.block,q.id);return true;}}// 11-15: 표 모양 명령은 표 편집 창으로.
  const pos=bridge.input.getCursorPosition?.(),item=placer?.tableAt?.(pos);if(!item?.block||item.block.kind!=='table')return false;
  let range=null;const sel=bridge.input.getSelectedCellRange?.();if(sel&&Number.isInteger(sel.startRow))range=[sel.startRow,sel.startCol,sel.endRow,sel.endCol];
  if(!range){const boxes=JSON.parse(bridge.wasm.borrowDocumentHandle().getTableCellBboxesByPath(pos.sectionIndex??0,pos.parentParaIndex,JSON.stringify(pos.cellPath))||'[]'),last=pos.cellPath.at(-1),box=boxes.find(b=>b.cellIdx===(last.cellIndex??last.cellIdx));if(!box)return false;range=[box.row,box.col,box.row,box.col];}
  let text='';const blockId=item.block.id;try{const probe=JSON.parse(JSON.stringify(item.block.table));text=applyTableCommand(probe,id,range);}catch(e){message(e.message,true);bridge.input.exitCellSelectionMode?.();return true;}
  bridge.input.exitCellSelectionMode?.();onPlacement?.(x=>{const b=x.blocks.find(v=>v.id===blockId);if(!b||b.kind!=='table')return false;applyTableCommand(b.table,id,range);return true;},`${item.block.label||'표'} · ${text}`,q.id);return true;
}catch{return false;}};pictureSettings=new PictureSettings(host.parentElement,{onApply:(value,context)=>{if(context.generation!==bridge.generation)throw Error('다시 그림을 선택하세요.');bridge.applyPictureLayout(context.ref,value);},onError:e=>message(e.message,true)});return b;}).catch(e=>{starting=null;throw e;});
    return starting;
  }
  async function prepareFigure(f){const image=await loadImage(f.data);if(image.naturalWidth*image.naturalHeight>40000000)throw Error('사진 크기를 줄여주세요.');if(!f.data.startsWith('data:image/png;')){const canvas=window.document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext('2d').drawImage(image,0,0);f.data=canvas.toDataURL('image/png');}return {...f,width:image.naturalWidth,height:image.naturalHeight};}
  // 저장된 조판을 열 때도 그림·표의 주인을 알아야 한다. 그림을 실제로 읽지 않는 가벼운 계획으로 순서만 얻는다.
  const BLANK='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  async function planOwners(value){const plan=await buildQuestionHtml(value,async f=>({...f,data:BLANK,width:f.width||100,height:f.height||100}),questionPageProfile(profileFor(value),1200,std(value)).width,{...SKELETON,standard:std(value)});return {images:plan.imageOwners,tables:plan.tableOwners,shapes:plan.tables,texts:plan.textSegments,places:plan.placeSegments};}
  // standard: 조판 설정 미리보기(10-23)처럼 저장하지 않은 초안 틀로 그릴 때.
  async function generate(value,prof=profileFor(value),{quiet=false,standard=null}={}){
    // 용지 맞춤: B4 문항은 A4 기준 간격을 단 폭 비율만큼 되돌린다(standardForPaper).
    const stdv=standardForPaper(standard||std(value),prof.paper);
    const Document=document().constructor,d=Document.createEmpty();let bytes,owners;
    try{d.createBlankDocument();const config=questionPageProfile(prof,1200,stdv);d.setPageDef(0,JSON.stringify(config.page));d.setColumnDef(0,1,0,true,0);
      const plan=await buildQuestionHtml(value,prepareFigure,config.width,{native:true,measureText:measurerFor(Document,stdv),...SKELETON,standard:stdv});owners={images:plan.imageOwners,tables:plan.tableOwners,shapes:plan.tables,texts:plan.textSegments,places:plan.placeSegments};const result=parse(d.pasteHtml(0,0,0,LEAD+plan.html));if(!result.ok)throw Error('문항 조판을 만들지 못했습니다.');
      bytes=await materializeEquations(Document,JSZip,await normalizeQuestionImport(d.exportHwpx(),JSZip,{standard:stdv}),plan.equations);
      const checked=new Document(bytes);try{const styled=new Document(await applyReferenceBogiIndent(checked,JSZip));try{styled.reflowLinesegs();if(plan.cellFloats?.length)applyCellFloatingPictures(styled,plan.cellFloats);centerCellPictures(styled);if(stdv.parts?.labelSpace==='fixed')fixedLabelSpaces(styled);applyQuestionIndent(styled,value.number,{body:true,askLead:plan.askLead,askIndent:plan.askIndent,hangPx:plan.bodyIndent});
        if(stdv.source?.kind==='hwp')centerBogiBoxes(styled);
        // 어울림은 내어쓰기 뒤에 건다. 문단 모양을 나중에 바꾸면 한글 엔진이 그림 옆 줄 폭을 잘못 잡는다.
        if(plan.floats.length||plan.floatTable){applyFloatingPictures(styled,plan.floats);applyFloatingTable(styled,plan.floatTable,value.number);styled.reflowLinesegs();settleFloatingPictures(styled,{front:stdv.source?.kind==='hwp'});}
        // 윗줄부터 자간 맞춤(조판 기준 fit, 10-22 C-5): 내어쓰기·어울림 뒤, 쪽 높이 맞춤 전. 수능 틀은 그림 옆 글(어울림)이 있는 문항을 건너뛴다.
        // 학교 양식(11-02, 사용자: 자간을 맞춰 어색한 줄바꿈이 없게)은 그림 옆으로 좁힌 문단·수식 든 문단도 맞춘다(line-fit school).
        {const S=stdv,school=stdv.source?.kind==='hwp';if(S.fit?.on&&(school||!plan.floats.length&&!plan.floatTable)){fitQuestionLines(styled,{low:S.fit.low,high:S.fit.high,shortLastLine:S.fit.shortLastLine,base:S.text.spacing,school});if(school&&plan.floats.length)for(const [sec,para] of resettleBesidePictures(styled))fitQuestionParagraph(styled,sec,para,{low:S.fit.low,high:S.fit.high,shortLastLine:S.fit.shortLastLine,base:S.text.spacing,school});}}
        if(stdv.source?.kind==='hwp')growCellsToContent(styled);
        fitQuestionPage(styled,prof);verifyNativeQuestion(styled,plan);bytes=await applyCellEquationLines(exportLayoutHwpx(styled,XLSX.CFB),JSZip);}finally{styled.free();}}finally{checked.free();}
      // 학교 틀(11-02 사용자 거듭 지적): 그림 아래로 내려간 줄은 단 폭으로(widenBelowPictures) — 시험지·내보낸 파일만이 아니라 문항 화면·한글 창·카드 그림도 같게.
      // 끌어올리기보다 먼저(넓히기가 다시 저장하며 줄 배치를 새로 잡는다). 한글 창 글 연동(buildTextMap)은 공백·문단 나눔을 하나로 보고 찾아 문단이 나뉘어도 맞는다.
      if(stdv.source?.kind==='hwp')bytes=widenForForm(Document,bytes,stdv);
      // 학교 틀: 키 큰 수식 줄을 끌어올린다(수식이 줄 맨 위에, 다음 줄은 그대로 — applyLiftTallEquations).
      if(stdv.source?.kind==='hwp')bytes=await applyLiftTallEquations(bytes,JSZip,Document);
      // 수능 틀: 〈보기〉 분수 줄 사이를 원본처럼(잉크 기준) — 11-06 applyTightBogi.
      // 수능 틀: 본문·선지 키 큰 수식 줄 위 빈틈을 원본처럼 — 11-07 applyKiceTallLines.
      else bytes=await applyTightBogi(await applyKiceTallLines(bytes,JSZip,Document),JSZip);
      if(plan.warnings.length&&!quiet)message(plan.warnings.join(' '));
    }finally{d.free();}
    return {bytes,owners};
  }
  // 11-15 표 편집 창: 문항 안 표 하나만 담은 한글 문서 — 문항 조판 때와 같은 폭·글자·열 폭·수식(조판 계획에서 그 표가 받은 폭 그대로).
  async function open(value){
    const seq=++opening;loading=true;ready=false;host.dataset.ready='false';metricsCache=null;guide.hidden=true;metricsOutput.textContent='';cancelAnimationFrame(fitFrame);fitFrame=0;save.disabled=true;download.disabled=true;paper.disabled=true;columns.disabled=true;message('실제 한글 문서로 조판하는 중…');placer?.clear();owners=null;textMap=null;clearTimeout(syncTimer);
    try{await ensure();if(seq!==opening)return;const next=structuredClone(value),nextFingerprint=await questionFingerprint(next);
      const saved=await typesetMatches(next.typeset,next)&&[9,10,LAYOUT_VERSION].includes(next.typeset.layoutVersion)?next.typeset:null;
      // 기준 용지: 문항에 정한 용지(q.paper) → 저장한 조판의 용지 → 수능 형태 B4(10-28: 새 문항도 기출과 같은 단 폭). 저장한 조판과 다르면 같은 단 폭 문서를 새 용지로 옮긴다.
      paper.value=next.paper||saved?.profile.paper||'B4';columns.value=String(saved?.profile.columns||2);
      let bytes;if(saved)bytes=fromBase64(saved.bytes);else({bytes,owners}=await generate(next));
      if(saved)owners=await planOwners(next);
      if(saved&&(saved.pageMode!==QUESTION_PAGE_MODE||saved.profile.paper!==paper.value)){
        // Retain the user's approved native formatting while moving the same
        // column width onto the new question paper; never rebuild it as HTML.
        const Document=document().constructor,old=new Document(bytes);
        try{bytes=resizeQuestionDocument(old,profileFor(next),XLSX.CFB);}finally{old.free();}
      }
      if(saved&&saved.layoutVersion<LAYOUT_VERSION){
        const Document=document().constructor,old=new Document(bytes);let compact;
        // 옛 조판(E2, 10-25): 〈보기〉 여백 정리에 더해 〈보기〉 내어쓰기 기본값을 건다 — 새 조판과 같은 함수, 내용·사용자 서식은 그대로.
        try{const tidy=new Document(await compactSavedBogi(old,next,JSZip,XLSX.CFB));try{compact=new Document(await applyReferenceBogiIndent(tidy,JSZip));}finally{tidy.free();}
          compact.reflowLinesegs();fitQuestionPage(compact,profileFor(next));assertNativeLayout(compact);
          if(normalized(parse(old.getTextFileText())).replace(/\s/g,'')!==normalized(parse(compact.getTextFileText())).replace(/\s/g,''))throw Error('보기 여백을 정리하면서 내용이 달라졌습니다.');
          bytes=exportLayoutHwpx(compact,XLSX.CFB);
        }finally{compact?.free();old.free();}
      }
      q=next;qStd=stdKey(next);fingerprint=nextFingerprint;
      await loadKeepingFocus(bytes,`${q.number}번 문항.hwpx`);host.append(guideLayer);
      // 다른 문항을 열면 다시 잠근다. 같은 문항을 다시 조판할 때(간격 조절·기준 바꾸기)는 사용자가 정한 잠금 상태를 그대로 둔다(10-22).
      const keepLock=true;lockedFor=value.id;// 10-23: 조판 칸은 늘 구조 잠금(틀은 「조판 설정」에서만). 그림 세부 크기만 잠금 예외.
      bridge.setTableLayoutLocked(keepLock);resize.setAttribute('aria-pressed',String(keepLock));
      baselineText=normalized(parse(document().getTextFileText()));baselineEquations=await equationScripts(bytes);
      baselineImages=await nativeImageSignature(document());ready=true;host.dataset.ready='true';dirty=!saved;userDirty=false;patchDirty=false;view.refresh();if(!saved)scheduleAuto(600);
      bridge.input.cursor.moveTo({sectionIndex:0,paragraphIndex:1,charOffset:0});
      validateQuestionPage(document(),profile());lastProfile=profile();message('문항 길이에 맞춰 용지 높이 자동 조절 · 구조 잠금(글만 고침) · 내어쓰기 Shift+Tab(표 칸 안 Ctrl+Shift+Tab · 맥은 ⌥⇧Tab)');
      try{assertNativeLayout(document());}catch(e){message(e.message,true);}
      if(owners)placer?.setModel({question:q,owners});
      textMap=owners?.texts?buildTextMap(decodeNativeText(parse(document().getTextFileText())),owners.texts.map(s=>({...s}))):null;
    }finally{if(seq===opening){loading=false;save.disabled=!ready;download.disabled=!ready;paper.disabled=!ready;columns.disabled=!ready;if(ready){fitLive();drawGuide();}}}
  }
  // 한글 창에서 고친 글을 잠시 뒤 시트 칸에 반영한다. 반영하면 이 문항의 기준 글도 새 글로 바뀐다.
  // ── 11-15 미리보기 자료 표 직접 고치기 ──
  const stepKey=st=>[st.controlIndex??st.controlIdx,st.cellIndex??st.cellIdx,st.cellParaIndex??st.cellParaIdx??0].join(':');
  const stepOf=st=>({controlIndex:st.controlIndex??st.controlIdx,cellIndex:st.cellIndex??st.cellIdx,cellParaIndex:st.cellParaIndex??st.cellParaIdx??0});
  // 지금 커서(칸 고르기 포함)가 든 문항 자료 표 — 화면 자리로 배치 층의 표를 찾고(tableAt), 표의 엔진 경로(바깥 칸 경로·개체 번호)는 커서에서 얻는다.
  // (엔진 배치 정보는 바깥 칸 안 표의 경로를 주지 않아 자리로만 짝지을 수 있다.)
  const tablePlaces=new Map();
  function dataTableHere(){try{const inp=bridge.input,cur=inp.cursor,doc=document();
      const blk=cur?.isInCellSelectionMode?.()?inp.getSelectedCellBlock?.():null;
      let sec,ppi,path,rect;
      if(blk?.cellPath?.length){sec=blk.sec??0;ppi=blk.ppi;path=blk.cellPath;const boxes=parse(doc.getTableCellBboxesByPath(sec,ppi,JSON.stringify(path)))||[],b0=boxes[0];if(!b0)return null;rect={pageIndex:b0.pageIndex??0,x:b0.x+b0.w/2,y:b0.y,height:b0.h};}
      else{const pos=inp.getCursorPosition?.();if(!pos?.cellPath?.length||!pos.cursorRect)return null;sec=pos.sectionIndex??0;ppi=pos.parentParaIndex;path=pos.cellPath;rect=pos.cursorRect;}
      const item=placer?.tableAt?.({cellPath:path,cursorRect:rect});if(!item?.block||item.block.kind!=='table')return null;
      const last=path.at(-1),place={sec,ppi,ci:last.controlIndex??last.controlIdx,prefix:path.slice(0,-1).map(stepOf)};tablePlaces.set(item.block.id,place);
      return {block:item.block,item,place};}catch{return null;}}
  const tableBefore=new Map();let tableTimer=0;const tableQueue=new Set();
  function rememberBefore(here){if(tableBefore.has(here.block.id))return;try{tableBefore.set(here.block.id,snapshotTableAt(document(),here.place));}catch{}}
  // 바깥 칸(표를 품은 칸부터 맨 바깥까지)의 문단을 한 번씩 건드려 엔진이 줄 자리를 새 표 높이로 다시 잡게 한다(실측: 표 +20px에 바깥 칸 +151px → +20px).
  function settleTable(here){try{const doc=document(),{sec,ppi,ci,prefix}=here.place,J=JSON.stringify;
      for(let d=prefix.length-1;d>=0;d--){const base=prefix.slice(0,d+1).map((st,i)=>i===d?{...st,cellParaIndex:0}:st),n=Number(doc.getCellParagraphCountByPath(sec,ppi,J(base)))||0;
        for(let i=0;i<n;i++){const path=J(base.map((st,k)=>k===d?{...st,cellParaIndex:i}:st));doc.insertTextInCellByPath(sec,ppi,path,0,'\u200b');doc.deleteTextInCellByPath(sec,ppi,path,0,1);}}
      // 표 구조가 바뀌면 배치 층이 표를 다시 찾을 수 있게 표 모양(줄·칸 수)을 바로 맞춘다.
      const dims=parse(doc.getTableCellBboxesByPath(sec,ppi,J([...prefix,{controlIndex:ci,cellIndex:0,cellParaIndex:0}])))||[];
      if(dims.length&&owners?.tables){const i=owners.tables.findIndex(o=>o?.kind==='block'&&o.id===here.block.id);if(i>=0&&owners.shapes?.[i])owners.shapes[i]={...owners.shapes[i],rows:Math.max(...dims.map(b=>b.row+(b.rowSpan||1))),cols:Math.max(...dims.map(b=>b.col+(b.colSpan||1)))};}
    }catch(e){console.warn('[5E_exam] 표 바깥 칸 다시 잡기 실패',e);}}
  function queueTableSync(id){tableQueue.add(id);clearTimeout(tableTimer);tableTimer=setTimeout(()=>{const ids=[...tableQueue];tableQueue.clear();for(const x of ids)void syncTable(x);},380);}
  async function syncTable(id){try{if(!ready||loading||!q||!onTextEdit)return;const place=tablePlaces.get(id),b=q.blocks.find(x=>x.id===id);if(!place||!b||b.kind!=='table')return;placer?.refresh?.();
      const snap=snapshotTableAt(document(),place),before=tableBefore.get(id)||snap,next=tableFromSnapshot(b.table,before,snap);
      tableBefore.set(id,snap);if(JSON.stringify(next)===JSON.stringify(b.table))return;
      b.table=next;
      // 한글 창 글 짝짓기(textMap): 이 표 칸 조각을 새 칸 글로 바꾼다(줄·칸이 늘거나 줄어도 글 짝짓기가 이어진다).
      const encoded=parse(document().getTextFileText()),raw=decodeNativeText(encoded);
      if(textMap){const segs=textMap.segments.filter(x=>!(x.owner?.kind==='cell'&&x.owner.table===id)),at=textMap.segments.findIndex(x=>x.owner?.kind==='cell'&&x.owner.table===id);
        const mine=[];snap.cells.forEach((row,r)=>row.forEach((cell,c)=>{if(cell.text)mine.push({owner:{kind:'cell',table:id,r,c},value:cell.text});}));
        segs.splice(at<0?segs.length:at,0,...mine);textMap=buildTextMap(raw,segs);}
      baselineText=normalized(encoded);fingerprint=await questionFingerprint(q);dirty=true;userDirty=true;
      onTextEdit([{owner:{kind:'tableAll',id},value:structuredClone(next)}],q.id);message(`${b.label||'표'} 표를 문항 카드에 반영했습니다 · 조판은 자동 저장됩니다.`);
    }catch(e){console.warn('[5E_exam] 표 읽기 실패',e);}}
  // 11-15 표 편집 창: 문항 안 표 하나만 담은 작은 한글 문서 — 문항 조판 때와 같은 폭·글자·열 폭·수식(조판 계획에서 그 표가 받은 폭 그대로).
  // 쪽은 표 폭 + 좁은 여백이라 창에서 표가 쪽 폭 가득 크게 보인다.
  let DocumentClass=null;
  async function tableDoc(value,id){await ensure();
    for(let i=0;i<80&&!DocumentClass;i++){const d=document();if(d)DocumentClass=d.constructor;else await new Promise(r=>setTimeout(r,100));}
    if(!DocumentClass)throw Error('한글 엔진이 아직 준비되지 않았습니다 — 잠시 뒤 다시 눌러 주세요.');
    const prof=profileFor(value),stdv=standardForPaper(std(value),prof.paper),config=questionPageProfile(prof,1200,stdv),Document=DocumentClass,measureText=measurerFor(Document,stdv);
    const blank=async f=>({...f,data:BLANK,width:f.width||100,height:f.height||100});
    const full=await buildQuestionHtml(value,blank,config.width,{native:true,measureText,...SKELETON,standard:stdv});
    const args=full.tableArgs?.[id]||{width:config.width,room:config.width};
    const plan=await buildQuestionHtml(value,prepareFigure,config.width,{native:true,measureText,...SKELETON,standard:stdv,tableOnly:{id,...args}});
    const hu=px=>Math.round(px*75),margin=hu(12),page={...config.page,width:hu(args.room)+2*margin,height:Math.max(hu(260),hu(args.room)),marginLeft:margin,marginRight:margin,marginTop:margin,marginBottom:margin,marginHeader:0,marginFooter:0};
    const d=Document.createEmpty();
    try{d.createBlankDocument();d.setPageDef(0,JSON.stringify(page));d.setColumnDef(0,1,0,true,0);
      const result=parse(d.pasteHtml(0,0,0,LEAD+plan.html));if(!result.ok)throw Error('표 문서를 만들지 못했습니다.');
      const bytes=await materializeEquations(Document,JSZip,await normalizeQuestionImport(d.exportHwpx(),JSZip,{standard:stdv}),plan.equations);
      return {bytes,room:args.room,width:args.width};
    }finally{d.free();}}
  function scheduleTextSync(){clearTimeout(syncTimer);syncTimer=setTimeout(()=>void syncText(),80);}
  function cellEditAtCursor(){try{const pos=bridge.input.getCursorPosition?.(),item=placer?.tableAt?.(pos);if(!item?.block||item.block.kind!=='table'||!pos?.cellPath?.length)return null;
    const doc=bridge.wasm.borrowDocumentHandle(),sec=pos.sectionIndex??0,path=JSON.stringify(pos.cellPath),last=pos.cellPath.at(-1);
    const boxes=parse(doc.getTableCellBboxesByPath(sec,pos.parentParaIndex,path))||[],box=boxes.find(b=>b.cellIdx===(last.cellIndex??last.cellIdx));if(!box)return null;
    const len=doc.getCellParagraphLengthByPath(sec,pos.parentParaIndex,path),got=doc.getTextInCellByPath(sec,pos.parentParaIndex,path,0,len);let t;try{t=JSON.parse(got);}catch{t=got;}
    const text=(t&&typeof t==='object'?t.text:t)||'',value=String(text).replace(/[\u200b\u2060]/g,'').trim();
    const was=String(item.block.table?.cells?.[box.row]?.[box.col]?.value??'');
    return {owner:{kind:'cell',table:item.block.id,r:box.row,c:box.col},value,raw:value,formula:was.includes('$')};}catch{return null;}}
  async function syncText(){
    if(!ready||loading||!textMap||!onTextEdit||!q)return;
    // 시트와 잇는 글은 문자 참조(&#9702;)를 글자로 되돌린 것, 저장 비교용 기준 글(baselineText)은 엔진이 꺼낸 그대로.
    const encoded=parse(document().getTextFileText()),raw=decodeNativeText(encoded),result=mapTextEdit(textMap,raw);
    if(result.unchanged)return;
    // 11-15: 표 칸에 쓴 글은 커서가 든 칸으로 짝짓는다. 빈 칸은 비교할 글이 없어 글 비교가 앞 칸(「구분」·지문) 끝에 붙였다.
    // 글 비교가 실패했거나 다른 칸을 골랐을 때만 커서 칸을 쓴다. 수식($)이 든 칸은 엔진 글에 수식 원문이 없어 덮어쓰지 않는다.
    const cur=cellEditAtCursor(),same=(a,b)=>a?.kind==='cell'&&b?.kind==='cell'&&a.table===b.table&&a.r===b.r&&a.c===b.c;
    if(cur&&!cur.formula&&(!result.ok||!result.changes.some(c=>same(c.owner,cur.owner)))){
      const id=q.id,changes=[{owner:cur.owner,value:cur.value}];applyTextEdit(q,cur.owner,cur.value);
      const segs=textMap.segments.map(x=>same(x.owner,cur.owner)?{...x,value:cur.raw}:x);if(!segs.some(x=>same(x.owner,cur.owner)))segs.push({owner:cur.owner,value:cur.raw});
      textMap=buildTextMap(raw,segs);baselineText=normalized(encoded);fingerprint=await questionFingerprint(q);
      onDiverge?.(false);if(onTextEdit(changes,id))message('한글에서 쓴 표 칸 글을 문항 카드 표에 반영했습니다.');return;}
    if(!result.ok){message(result.reason,true);onDiverge?.(true);return;}
    onDiverge?.(false);
    const id=q.id,changes=result.changes.map(c=>({owner:c.owner,value:c.value}));
    for(const c of result.changes){applyTextEdit(q,c.owner,c.value);textMap.segments[c.index].value=c.full;}
    textMap=buildTextMap(raw,textMap.segments);baselineText=normalized(encoded);fingerprint=await questionFingerprint(q);
    if(!onTextEdit(changes,id))return;
    message('한글에서 고친 글을 시트에 반영했습니다 · 조판은 자동 저장됩니다.');
  }
  // 시트에서 고친 글을 한글 창에 바로 넣는다. 같은 문항이고 글 조각의 구성이 같으면 바뀐 문단만 바꾸고(서식·저장 전 조판 유지),
  // 구성이 바뀌었거나 짝을 찾지 못하면 false — 부르는 쪽이 다시 그린다. 차례로 하나씩 처리한다.
  function update(value){const run=updating.then(()=>patchFrom(value));updating=run.catch(()=>{});return run;}
  async function patchFrom(value){
    if(!ready||loading||!q||!owners?.texts||!textMap||value?.id!==q.id)return false;
    if(qStd!==stdKey(value))return false;
    if(contentKey(q)===contentKey(value))return true;
    if(layoutKey(q)!==layoutKey(value)||skeletonKey(q)!==skeletonKey(value))return false;
    const seq=opening,next=structuredClone(value),Document=document().constructor;
    const plan=await buildQuestionHtml(next,async f=>({...f,data:BLANK,width:f.width||100,height:f.height||100}),questionPageProfile(profileFor(next),1200,std(next)).width,{native:true,measureText:measurerFor(Document,std(next)),...SKELETON,standard:std(next)});
    if(seq!==opening||!ready||loading)return false;
    if(JSON.stringify([plan.imageOwners,plan.tableOwners,plan.tables])!==JSON.stringify([owners.images,owners.tables,owners.shapes]))return false;
    const patches=planPatches(textMap.segments,plan.textSegments,nativeRuns(document()));
    if(!patches)return false;
    if(patches.length){
      patching=true;
      try{bridge.transaction('sheet-text',()=>{applyPatches(bridge.wasm,patches);return true;});}
      finally{requestAnimationFrame(()=>{patching=false;});}
      // 저장해 둔 조판이 있는 문항이면 바뀐 글로 다시 저장되게 표시한다 — 예전에는 표시하지 않아 저장본이 옛 글 기준으로 남고,
      // 다른 문항에 갔다 오면 「내용이 다름」으로 시트에서 새로 조판되어 서식 조정이 모두 사라졌다(H14).
      if(value.typeset){dirty=true;if(!userDirty)patchDirty=true;}
      message('시트에서 고친 글을 한글 창에 바로 넣었습니다.');
    }
    q=next;qStd=stdKey(next);owners={images:plan.imageOwners,tables:plan.tableOwners,shapes:plan.tables,texts:plan.textSegments,places:plan.placeSegments};
    const encoded=parse(document().getTextFileText()),raw=decodeNativeText(encoded);
    textMap=buildTextMap(raw,owners.texts.map(s=>({...s})));baselineText=normalized(encoded);fingerprint=await questionFingerprint(q);
    placer?.setModel({question:q,owners});scheduleFit();
    return true;
  }
  async function snapshot(){
    if(!bridge||!q||loading||!ready)throw Error('조판이 준비된 뒤 다시 시도하세요.');
    if(skeletonKey(q)){const keys=skeletonKey(q).split('|'),count=k=>keys.filter(x=>x===k||x.startsWith(k+':')).length,names=[['ask','발문'],['block','글'],['figure','그림']].filter(([k])=>count(k)).map(([k,n])=>`${n} ${count(k)}곳`).join(', ');
      throw Error(`비어 있는 칸(${names})은 틀로만 보여 주므로 조판을 저장하지 않습니다. 채우거나 구성에서 지운 뒤 저장하세요.`);}
    fitLive();validateQuestionPage(document(),profile());assertNativeLayout(document());
    const bytes=exportLayoutHwpx(document(),XLSX.CFB),Document=document().constructor,reopened=new Document(bytes);
    try{
      assertNativeLayout(reopened);
      if(normalized(parse(reopened.getTextFileText()))!==baselineText||await equationScripts(bytes)!==baselineEquations||await nativeImageSignature(reopened)!==baselineImages)throw Error('글·수식·그림 내용이 시트와 달라졌습니다. 내용은 시트에서 수정하고 조판을 다시 여세요. 서식 조정은 그대로 저장할 수 있습니다.');
      validateQuestionPage(reopened,profile());
      // Compare every page's actual text positions, font size/spacing, table
      // geometry/merges and picture crop/wrap. Editor-only guides are omitted.
      if(nativeLayoutSignature(document())!==nativeLayoutSignature(reopened)){
        // An empty paragraph can reflow after changing its insertion font.
        // Show the reopened output itself and require a review of that result;
        // never mark an earlier, different rendering as approved.
        loading=true;try{await loadKeepingFocus(new Uint8Array(bytes),`${q.number}번 문항.hwpx`);}finally{loading=false;}
        message('최종 저장 모양으로 갱신했습니다 · 잠시 뒤 자동 저장됩니다.');return null;
      }
      return {bytes:toBase64(bytes),fingerprint,baselineText,profile:profile(),pageMode:QUESTION_PAGE_MODE,metrics:questionPageMetrics(reopened,profile()),pageDef:parse(document().getPageDef(0)),columnDef:parse(document().getColumnDef(0)),savedAt:new Date().toISOString(),layoutVersion:LAYOUT_VERSION,verified:true};
    }finally{reopened.free();}
  }
  async function commit(){
    await changingProfile;
    if(bridge&&[...bridge.editor.element.contentDocument.querySelectorAll('.modal-overlay')].some(n=>n.getClientRects().length))throw Error('열려 있는 조판 설정을 적용하거나 취소한 뒤 문항을 전환하세요.');
    if(!ready||!dirty)return;
    if(skeletonKey(q)){dirty=false;userDirty=false;patchDirty=false;return;}
    // 바로 넣기(H14)로만 켜진 저장은 모양 확인이 필요하면 조용히 넘긴다 — 오타 하나 고쳤다고 문항 전환이 막히지 않게.
    // 11-03: 처음 열 때의 자동 저장도 같다(사람이 한글 창에서 고친 것이 아님). 검사(수식·글자 겹침 등)에 걸리면 저장하지 않고 넘어가며,
    // 경고는 문항 탭의 「!」로 남긴다. 예전에는 실패 → 원래 문항으로 되돌려 다시 그림 → 또 저장 시도가 끝없이 되풀이돼 화면이 멈췄다.
    let s;try{s=await snapshot();}catch(e){if(userDirty)throw e;skipped={id:q.id,message:e.message};dirty=false;patchDirty=false;return;}
    if(!s){if(!userDirty){dirty=false;patchDirty=false;return;}throw Error('저장될 모양으로 갱신했습니다 · 잠시 뒤 자동 저장됩니다.');}
    await onSave(s,q.id);dirty=false;userDirty=false;patchDirty=false;
  }
  save.onclick=async()=>{save.disabled=true;try{const s=await snapshot();if(!s)return;await onSave(s,q.id);dirty=false;userDirty=false;patchDirty=false;message('조판 저장됨 · HWPX 재열기 후 모양 검수 완료');}catch(e){message(e.message,true);}finally{save.disabled=!ready;}};
  download.onclick=async()=>{download.disabled=true;try{const s=await snapshot();if(!s)return;await onSave(s,q.id);dirty=false;userDirty=false;patchDirty=false;const saved=await saveOut(fromBase64(s.bytes),`${q.managementId||q.number}번 문항.hwpx`,'application/vnd.hancom.hwpx',{open:true});message(saved.desktop?savedText(saved,'편집 가능한 HWPX'):'편집 가능한 HWPX를 내려받았습니다.');}catch(e){message(e.message,true);}finally{download.disabled=!ready;}};
  const changeProfile=async()=>{
    if(!bridge||loading||!ready)return;loading=true;save.disabled=true;download.disabled=true;paper.disabled=true;columns.disabled=true;guide.hidden=true;
    try{const next=profile(),bytes=resizeQuestionDocument(document(),next,XLSX.CFB),cursor=bridge.input.getCursorPosition();
      await loadKeepingFocus(bytes,`${q.number}번 문항.hwpx`);host.append(guideLayer);bridge.input.cursor.moveTo(cursor);lastProfile=next;metricsCache=null;dirty=true;view.fit();
      message('기준 단 폭 변경됨 · 잠시 뒤 자동 저장됩니다.');
    }catch(e){paper.value=lastProfile.paper;columns.value=String(lastProfile.columns);message(e.message,true);}
    finally{loading=false;save.disabled=false;download.disabled=false;paper.disabled=false;columns.disabled=false;drawGuide();}
  };
  paper.onchange=()=>{changingProfile=changeProfile();};columns.onchange=()=>{changingProfile=changeProfile();};
  const align=host.parentElement.querySelector('#typeset-table-align'),indent=host.parentElement.querySelector('#typeset-indent'),resize=host.parentElement.querySelector('#typeset-lock');
  resize.onclick=()=>{if(!ready||loading)return;bridge.setTableLayoutLocked(!bridge.tableLayoutLocked);resize.setAttribute('aria-pressed',String(bridge.tableLayoutLocked));message(bridge.tableLayoutLocked?'구조 잠금 · 글만 고칠 수 있습니다. 표·그림의 크기나 틀은 잠금을 풀고 바꾸세요.':'구조 잠금 풀림 · 표·그림의 크기와 틀을 고칠 수 있습니다. 다 고치면 다시 잠그세요.');};
  align.onchange=()=>{try{if(!ready||loading)return;applyTableAlignment(bridge,align.value);message('표 위치 변경됨 · 잠시 뒤 자동 저장됩니다.');}catch(e){message(e.message,true);}finally{align.value='';}};
  indent.onclick=()=>{try{if(!ready||loading)return;if(!applyHangingIndent(bridge))throw Error('본문에서 들여쓸 위치를 클릭하세요.');message('다음 줄이 커서 위치에 맞춰집니다 · 잠시 뒤 자동 저장됩니다.');bridge.input.textarea.focus();}catch(e){message(e.message,true);}};
  const contentKey=value=>JSON.stringify(renderedContent(value));
  // form: 등록한 학교 양식({bytes,structure}) — 주면 그 양식 위에 묶는다. password는 암호 양식일 때 선생님이 입력한 것(남기지 않음).
  // order: 나형처럼 문항 순서를 바꿔 묶을 때(문항 id 순서) — 묶은 뒤 번호를 다시 매긴다.
  // 그림 아래로 내려간 줄을 단 폭으로(widenBelowPictures, 11-02) — 학교 양식으로 새로 조판한 문항에. 보낼 때(buildExam)와 시험지 미리보기(pageSheetsNow)가 같은 모양이 되게 한 곳에서.
  const widenForForm=(Document,bytes,s)=>widenBelowPictures(Document,bytes,XLSX.CFB,s.fit?.on?{low:s.fit.low,high:s.fit.high,shortLastLine:s.fit.shortLastLine,base:s.text?.spacing}:null);
  // 11-11 사용자 「hwp로 보내는 게 왜 이렇게 오래 걸리냐」: 같은 시험지·같은 내용이면 묶은 결과를 다시 쓴다(두 번째 보내기부터 바로).
  // 키에는 문항 순서·나형 순서·양식·쪽 띄움과 각 문항의 내용·조판(저장된 조판 크기·판)·틀을 넣는다 — 하나라도 바뀌면 새로 묶는다.
  const builtExams=new Map();
  const examBuildKey=(data,examSet,form,order)=>{try{return JSON.stringify({i:examSet.items,o:order,f:form?.id||null,a:examSet.after||null,b:examSet.breaks||null,
    q:examSet.items.map(id=>{const v=data.questions.find(x=>x.id===id);return v?[contentKey(v),v.typeset?.bytes?.length||0,typeof v.typeset?.bytes==='string'?v.typeset.bytes.slice(-96):0,v.typeset?.revision||v.typeset?.savedAt||0,JSON.stringify(v.typeset?.profile||null),stdKey(v)]:null;})});}catch{return null;}};
  async function buildExam(data,examSet,{form=null,password='',order=null}={}){
    const key=examBuildKey(data,examSet,form,order),hit=key&&builtExams.get(key);
    if(hit){console.debug('[5E_exam] 시험지 묶기: 같은 내용이라 앞서 묶은 결과를 씀');return new Uint8Array(hit);}
    const t0=performance.now(),bytes=await buildExamFresh(data,examSet,{form,password,order});
    console.debug(`[5E_exam] 시험지 묶기 ${Math.round(performance.now()-t0)}ms · ${examSet.items.length}문항${form?' · 학교 양식':''}`);
    if(key){builtExams.clear();builtExams.set(key,new Uint8Array(bytes));}
    return bytes;
  }
  async function buildExamFresh(data,examSet,{form=null,password='',order=null}={}){
    if(order)examSet={...examSet,items:[...order]};
    await ensure();const Document=document().constructor,template=form?await openForm(form.bytes,password):null;
    // 단 폭이 섞인 시험지(빈 시험지): 배치·점검 화면과 같게, 시험지 단 폭과 다른 문항만 그 단 폭으로 새로 조판해 묶는다.
    let rewidth=null,structure=null;
    if(!template){const plan=examPlan(data,examSet);
      if(plan.mixed){rewidth=new Map();
        for(const x of plan.items)if((x.q.typeset?.profile?.paper||x.q.paper||'B4')!==plan.page.paper){await pause();const e=await sheetEntry(Document,x.q,plan.page.paper);rewidth.set(x.id,{bytes:e.bytes,height:Number.isFinite(e.height)?e.height:60});}}}
    else{
      // 학교 양식(10-29): 양식 구조는 지금 코드로 다시 읽는다(예전에 등록한 양식도 문단 번호 문항·꼬리를 알아보게).
      // 이 양식 틀로 조판하지 않은 문항(수능 틀 문항, 기출 등)은 양식 틀로 새로 조판해 넣는다 — 문항에 저장한 조판은 그대로 둔다.
      try{structure=formStructure(template);}catch{structure=form.structure||{};}
      const fstd=formStandardOf(form);
      if(fstd){rewidth=new Map();
        for(const x of examPlan(data,examSet).items){if(std(x.q).id===fstd.id&&x.q.typeset?.verified&&x.q.typeset?.profile?.paper===fstd.paper.size)continue;
          await pause();let e=await sheetEntry(Document,x.q,fstd.paper.size,fstd);
          // 보낼 때는 저장 조판과 같은 기준으로 검사한다(10-30): 학교 틀로 새로 조판한 문항이 넘치면 그 문항을 학교 틀로 열어 고치게 한다.
          // 그 전에 스스로 고쳐 본다(11-01 밤샘 「조판 스트레스 0」): 좁은 단(B5·3단·1단 학습지)에서 표 칸 글이 넘치면 표를 단 폭 가득 넓혀 다시 조판한다.
          const layoutError=bytes=>{const d=new Document(bytes);try{assertNativeLayout(d,{lenient:true});return null;}catch(err){return err;}finally{d.free();}};
          if(!e.saved){let err=layoutError(e.bytes);
            // 1) 표를 단 폭 가득 2) 거기에 표 칸 안 여백을 반으로 — 차례로 해 보고 처음 통과한 조판을 쓴다.
            // 상자·〈보기〉 좌우 안 여백도 반으로(긴 수식 뒤 「이다.」처럼 끊을 수 없는 줄이 칸 여백을 몇 px 넘는 경우).
            if(err){const wide=structuredClone(x.q);for(const b of wide.blocks)if(b.kind==='table')b.size=100;const half=v=>Math.max(.3,(Number(v)||1)/2),g=fstd.gaps||{};
              const tight={...structuredClone(fstd),parts:{...fstd.parts,cellPad:half(fstd.parts?.cellPad)},gaps:{...g,boxPadSide:half(g.boxPadSide),bogiPadLeft:half(g.bogiPadLeft),bogiPadRight:half(g.bogiPadRight)}};
              for(const s of x.q.blocks.some(b=>b.kind==='table')?[fstd,tight]:[tight]){const e2=await sheetEntry(Document,wide,fstd.paper.size,s);if(!layoutError(e2.bytes)){e=e2;err=null;break;}}}
            if(err){const failed=Error(`${x.q.number}번 문항이 학교 양식 단에서 ${err.message}`);failed.questionId=x.id;failed.frameId=fstd.id;throw failed;}}
          // 그림 아래로 내려간 줄은 단 폭으로(widenBelowPictures, 11-02). 문항이 짧아지기만 해서 쪽 나눔 계획은 그대로 안전하다.
          rewidth.set(x.id,{bytes:widenForForm(Document,e.bytes,fstd),height:Number.isFinite(e.height)?e.height:60});}}
    }
    // 학교 양식은 묶을 때마다 새로 연다(걸친 문항을 넘겨 다시 묶기). 처음 연 문서는 구조를 읽는 데만 쓴다.
    template?.free();    const {document:exam}=await buildExamDocument(Document,data,examSet,{between:pause,openTemplate:form?()=>openForm(form.bytes,password):null,columns:structure?.columns||2,bodyStart:structure?.firstQuestion??form?.structure?.firstQuestion??-1,tailStart:structure?.tailStart??-1,rewidth,structure,keep:form?.keep||{},settleOpen:d=>anchorRaisedTablesOpen(exportLayoutHwpx(d,XLSX.CFB),XLSX.CFB,Document)});
    try{if(order)renumberDocument(exam);let bytes=exportLayoutHwpx(exam,XLSX.CFB);
      // 학교 양식: 묶을 때 엔진이 줄 배치를 다시 계산해 문항에서 끌어올린 수식 줄이 되돌아간다 — 보낼 파일에서 한 번 더(이 뒤 최종 검사도 이 파일로).
      if(form)bytes=await applyLiftTallEquations(bytes,JSZip,Document);
      if(form)bytes=anchorRaisedTables(bytes,XLSX.CFB,Document);
      // 학교 양식 최종 검사(10-31): 보낼 파일을 다시 열어 글 겹침·칸 넘침이 있으면 깨진 시험지를 내보내지 않는다(양식 머리 표처럼 쪽 너비인 양식 자체 표는 빼고).
      if(form){const check=new Document(bytes);try{const head=structure?.firstQuestion??form.structure?.firstQuestion??0,issue=nativeLayoutIssues(check).find(i=>!/단 너비나 인쇄 영역/.test(i.reason)&&!(Number.isInteger(i.para)&&i.para<head)&&!i.withinBorder&&!i.graze);/*학교 양식 자체 머리 부분(배점·안내 상자 글)은 우리가 만든 글이 아니라 검사에서 뺀다(11-01 대왕중 원안지 양식).*/
        if(issue)throw Error(`시험지 ${issue.page}쪽에서 ${issue.reason}${issue.text?` (「${issue.text}」)`:''}. 배치·점검 화면에서 그 쪽을 확인하세요.`);}finally{check.free();}}
      return bytes;}finally{exam.free();}
  }
  // 인쇄·PDF: 묶은 시험지를 쪽마다 엔진 SVG로(화면 그림과 같음).
  async function examPagesSvg(bytes){await ensure();const Document=document().constructor,d=new Document(new Uint8Array(bytes));try{const page=parse(d.getPageDef(0)),out=[];for(let i=0;i<d.pageCount();i++)out.push(uniqueSvg(svgOf(d,i)));return {pages:out,widthMm:page.width/(7200/25.4),heightMm:page.height/(7200/25.4)};}finally{d.free();}}
  // 한글 창에서 바꾼 것을 버린다(시트에 반영되지 않은 수정 포함). 다음 open이 시트 내용으로 다시 그린다.
  function discard(){clearTimeout(syncTimer);dirty=false;userDirty=false;patchDirty=false;ready=false;onDiverge?.(false);}
  // 틀(회색 안내)만 달라지는 변경: 빈 칸에 처음 쓰거나 다 지울 때. 문단 글 바꾸기로는 안 되고(안내는 회색) 다시 그려야 한다.
  const skeletonOnly=value=>!!q&&value?.id===q.id&&layoutKey(q)===layoutKey(value)&&skeletonKey(q)!==skeletonKey(value);
  // 쪽 전체: 문항마다 한글 문서를 구해(열린 문항은 지금 한글 창, 저장한 조판, 아니면 미리보기 칸과 같은 새 조판)
  // 시험지를 만들 때와 같은 방식으로 한 문서에 합친 뒤 쪽마다 SVG로 그린다. HTML로 흉내 내지 않는다.
  const fresh=new Map();
  // 11-15(사용자 승인 2): 조판 결과를 이 기기에 저장 — 문항 조판(틀·용지·조판 기준별)과 묶은 시험지 문서. 껐다 켜도 다시 조판하지 않는다.
  // 열쇠 = 문항 지면 내용(contentKey)·용지·조판 기준 전체 + 저장 판(TYPESET_CACHE_VERSION). 하나라도 다르면 새로 조판한다(옛 결과를 쓰지 않게).
  // ※ 조판 엔진·조판 규칙(handoff·exam-build 등)을 고치면 TYPESET_CACHE_VERSION을 올려 저장한 결과를 모두 버린다.
  const TYPESET_CACHE_VERSION='1.7.0-1115b|'+LAYOUT_VERSION;
  const tcache=(()=>{let dbp=null;const open=()=>dbp||=new Promise(res=>{try{const r=indexedDB.open('5e-typeset-cache',1);r.onupgradeneeded=()=>{for(const n of ['q','a'])if(!r.result.objectStoreNames.contains(n))r.result.createObjectStore(n);};r.onsuccess=()=>res(r.result);r.onerror=()=>res(null);}catch{res(null);}});
    const tx=async(store,mode,fn)=>{const db=await open();if(!db)return null;return new Promise(res=>{try{const t=db.transaction(store,mode),st=t.objectStore(store),r=fn(st);t.oncomplete=()=>res(r?.result??null);t.onerror=t.onabort=()=>res(null);}catch{res(null);}});};
    const LIMIT={q:600,a:8};let writes=0;
    const prune=async store=>{const db=await open();if(!db)return;try{const t=db.transaction(store,'readwrite'),st=t.objectStore(store),all=st.getAll(),keys=st.getAllKeys();t.oncomplete=null;all.onsuccess=()=>{keys.onsuccess=()=>{const rows=keys.result.map((k,i)=>[k,all.result[i]?.at||0]).sort((x,y)=>y[1]-x[1]);const t2=db.transaction(store,'readwrite');for(const [k] of rows.slice(LIMIT[store]))t2.objectStore(store).delete(k);};};}catch{}};
    return {get:async(store,slot,key)=>{const v=await tx(store,'readonly',st=>st.get(slot));return v&&v.key===TYPESET_CACHE_VERSION+'|'+key?v:null;},
      put:(store,slot,key,val)=>{void tx(store,'readwrite',st=>st.put({...val,key:TYPESET_CACHE_VERSION+'|'+key,at:Date.now()},slot)).then(()=>{if(++writes%25===0)void prune(store);});}};})();
  // 문항·쪽 하나마다 잠깐 쉬어 그사이 화면 그리기·입력을 받는다(문항 많은 시험지에서 화면이 통째로 멈추지 않게).
  const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
  // 쉬는 사이 쪽 전체를 떠났으면(alive가 false) 남은 일을 하지 않는다.
  const cancelled=()=>Object.assign(Error('쪽 전체 그리기를 멈췄습니다.'),{cancelled:true});
  // standardOverride(10-29): 학교 양식 시험지처럼 문항의 틀과 다른 틀로 그릴 때.
  async function sheetEntry(Document,value,paperOverride='',standardOverride=null){
    const own={paper:paperOverride||value.paper||value.typeset?.profile?.paper||'B4',columns:2,...frameProfile(standardOverride||std(value))};
    if(!paperOverride&&ready&&!loading&&q?.id===value.id&&contentKey(q)===contentKey(value))
      return {bytes:exportLayoutHwpx(document(),XLSX.CFB),profile:profile(),height:questionPageMetrics(document(),profile()).usedHeightMm,saved:!dirty&&!!value.typeset?.verified&&await typesetMatches(value.typeset,value)};
    // 보기 전용이라 저장한 조판이 지금 문항과 맞는지만 가볍게 본다(문서를 미리 열어 검사하지 않음). 시험지 HWPX를 만들 때는 openApprovedQuestion으로 엄격히 검사한다.
    const t=value.typeset;
    if((!standardOverride||std(value).id===standardOverride.id)&&t?.verified&&t.layoutVersion===LAYOUT_VERSION&&t.pageMode===QUESTION_PAGE_MODE&&t.profile?.paper===own.paper&&await typesetMatches(t,value))return {bytes:fromBase64(t.bytes),profile:t.profile,height:t.metrics?.usedHeightMm,saved:true};
    // 기억 칸은 문항·용지·틀마다 따로(11-02): 한 칸을 기본 틀과 학교 양식 틀이 번갈아 덮어써 쪽을 그릴 때마다 모든 문항을 두 번씩 새로 조판했다(20문항 21.6초→12.9초).
    const slot=value.id+'|'+own.paper+'|'+(standardOverride?.id||''),key=contentKey(value)+'|'+own.paper+(standardOverride?'|'+JSON.stringify(standardOverride):''),hit=fresh.get(slot);
    if(hit?.key!==key){const stored=await tcache.get('q',slot,key);
      if(stored?.bytes)fresh.set(slot,{key,bytes:stored.bytes,height:stored.height});
      else{const {bytes}=await generate(structuredClone(value),own,{quiet:true,standard:standardOverride}),doc=new Document(bytes);
        try{fresh.set(slot,{key,bytes,height:questionPageMetrics(doc,own).usedHeightMm});}finally{doc.free();}const e=fresh.get(slot);tcache.put('q',slot,key,{bytes:e.bytes,height:e.height});}}
    const entry=fresh.get(slot);return {bytes:entry.bytes,profile:own,height:entry.height,saved:false};
  }
  // 문항 하나를 한글 엔진이 그린 그림(SVG)으로(10-24 지적 10): 시험지 화면의 문항 카드·미리보기가 가운데 조판 쪽과 똑같아 보이게.
  // 쪽 그리기와 같은 문항 문서(sheetEntry 캐시)를 쓰고, 여백을 뺀 글 자리(본문 폭 × 쓴 높이)만 보이게 viewBox를 자른다.
  const svgCache=new Map();let svgSeq=0;
  // 엔진 일(쪽 그리기 · 문항 그림)은 한 번에 하나씩 — 같은 엔진을 동시에 쓰면 쪽 그림이 깨진다(10-24).
  let engineLock=Promise.resolve();
  const serial=fn=>{const run=engineLock.then(fn,fn);engineLock=run.catch(()=>{});return run;};
  const questionSvg=value=>serial(()=>questionSvgNow(value));
  async function questionSvgNow(value){
    await ensure();const Document=document().constructor,e=await sheetEntry(Document,value),key=value.id+'|'+e.bytes.length+'|'+e.height;
    const hit=svgCache.get(value.id);if(hit?.key===key)return hit.out;
    const d=new Document(e.bytes);
    try{const p=parse(d.getPageDef(0)),u=v=>v/75,m0=u(p.marginLeft),y0=u(p.marginTop),right=u(p.width-p.marginRight);
      // 문항 문서가 여러 쪽이면(긴 문항) 쪽마다 실제로 그린 자리(글·표·그림)만 잘라 위아래로 잇는다 — 첫 쪽만 그리면 보기·선지가 빠졌다.
      // 왼쪽 끝은 실제 글 자리(번호 「1.」은 내어쓰기로 본문 여백보다 왼쪽), 아래 끝은 그린 것의 맨 아래.
      const parts=[];
      for(let i=0;i<d.pageCount();i++){
        const marks=[...(parse(d.getPageTextLayout(i)).runs||[]),...(parse(d.getPageControlLayout(i)).controls||[])].filter(r=>[r.x,r.y,r.h].every(Number.isFinite)&&String(r.text??'x').trim());
        if(!marks.length)continue;
        const top=Math.min(y0,...marks.map(r=>r.y)),bottom=Math.max(...marks.map(r=>r.y+r.h));
        parts.push({i,x:Math.min(m0,...marks.map(r=>r.x)),top,h:bottom-top+2});
      }
      if(!parts.length)parts.push({i:0,x:m0,top:y0,h:40});
      const x=Math.min(...parts.map(q=>q.x))-3,w=right-x+3,H=parts.reduce((a,q)=>a+q.h,0)+6;
      // SVG 안 이름(id·clipPath 등)을 쪽·문항마다 다르게 — 한 화면의 여러 엔진 SVG(카드 · 쪽)가 같은 이름을 쓰면 서로의 잘라내기를 덮어 쪽 글이 잘린다(10-24).
      const rename=(svg,pre)=>svg.replace(/\bid="([^"]+)"/g,(m,id)=>`id="${pre}${id}"`).replace(/url\(#([^)]+)\)/g,(m,id)=>`url(#${pre}${id})`).replace(/(xlink:href|href)="#([^"]+)"/g,(m,attr,id)=>`${attr}="#${pre}${id}"`);
      let at=3;const inner=parts.map(q=>{const piece=rename(svgOf(d,q.i),'q'+(++svgSeq)+'-').replace(/<svg\b([^>]*)>/,(m,attrs)=>`<svg${attrs.replace(/\s(x|y|width|height|viewBox|style)="[^"]*"/g,'')} x="0" y="${at}" width="${w}" height="${q.h}" viewBox="${x} ${q.top} ${w} ${q.h}" overflow="hidden">`);at+=q.h;return piece;}).join('');
      const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${H}" preserveAspectRatio="xMidYMin meet" style="display:block;width:100%;height:auto">${inner}</svg>`;
      const out={svg,width:w,height:H};svgCache.set(value.id,{key,out});return out;
    }finally{d.free();}
  }
  let assembled=null,skipped=null,assembledPlain=null;
  // 지난번 단 나눔(시험지·양식별) — 다음 묶기를 거기서 시작한다(assembleFormChecked seed). 이 컴퓨터에 작게 기억.
  const planSeed={get(k){try{return JSON.parse(localStorage.getItem('5e.sheet.plan.'+k)||'null');}catch{return null;}},set(k,v){try{if(v)localStorage.setItem('5e.sheet.plan.'+k,JSON.stringify(v));}catch{}}};
  const pageSheets=(...args)=>serial(()=>pageSheetsNow(...args));
  // progress(11-02 조판 중 표시): {stage:'items'|'form'|'place'|'draw', i, n} — 시험지 화면이 단계·진행 막대를 그린다.
  async function pageSheetsNow(data,exam,focusId,{alive=()=>true,form=null,progress=()=>{}}={}){
    const step=async()=>{await pause();if(!alive())throw cancelled();};
    await ensure();const Document=document().constructor,ids=exam?.items?.length?exam.items:[focusId],items=[];
    // 학교 양식 시험지(11-02): 양식 틀로 저장하지 않은 문항은 아래에서 양식 틀로 새로 조판하니, 기본 틀 조판은 건너뛴다(처음 그리기 절반).
    const fstd=form&&formStandardOf(form);
    for(const [k,id] of ids.entries()){const value=data.questions.find(x=>x.id===id);if(!value)continue;progress({stage:'items',i:k+1,n:ids.length});if(items.length)await step();const e=fstd&&std(value).id!==fstd.id?{bytes:null,profile:null,height:60,saved:false}:await sheetEntry(Document,value);
      const after=Math.max(0,Number(exam?.after?.[id])||0);
      items.push({id,q:value,bytes:e.bytes,profile:e.profile,height:(Number.isFinite(e.height)?e.height:60)+after,after,breakBefore:!!exam?.breaks?.[id],saved:e.saved});}
    if(!items.length)throw Error('쪽에 놓을 문항이 없습니다.');
    // 용지·쪽 나눔은 실제 시험지(exam-layout)와 같은 규칙: 모두 같은 용지로 조판했으면 그 용지 2단, 섞였으면 수능 형태 B4 2단.
    let sheet=examPage(items.map(x=>({q:{typeset:{profile:x.profile}}})));
    const rewidth=[];let built;
    if(fstd){
      // 학교 양식(10-29): 보낼 때(buildExam)와 같게 — 양식 틀로 조판하지 않은 문항은 양식 틀로 새로 조판해 양식 위에 묶는다.
      for(const [k,x] of items.entries()){if(std(x.q).id===fstd.id&&x.saved&&x.profile?.paper===fstd.paper.size){x.bytes=widenForForm(Document,x.bytes,fstd);continue;}progress({stage:'form',i:k+1,n:items.length});await step();const e=await sheetEntry(Document,x.q,fstd.paper.size,fstd);Object.assign(x,{bytes:widenForForm(Document,e.bytes,fstd),profile:e.profile,height:(Number.isFinite(e.height)?e.height:60)+x.after,saved:false});rewidth.push(x.q.number);}
      // 묶은 결과 기억(11-02): 묶기·점검이 쪽 그리기 시간의 대부분(20문항 약 10초)이라, 문항·양식이 그대로면 지난번 묶은 문서를 다시 연다.
      const akey=JSON.stringify([form.id||'',form.bytes?.length||0,form.keep||{},fstd,items.map(x=>[x.id,contentKey(x.q),x.bytes?.length||0,x.after,x.breakBefore])]);
      if(assembled?.key!==akey){const st=await tcache.get('a','form|'+(exam?.id||'')+'|'+(form.id||''),akey);if(st?.bytes)assembled={key:akey,bytes:st.bytes,meta:st.meta,columns:st.columns};}
      if(assembled?.key===akey){sheet={...sheet,paper:fstd.paper.size,columns:assembled.columns};built={...assembled.meta,document:new Document(assembled.bytes),pages:[]};}
      else{progress({stage:'place'});
      const first=await openForm(form.bytes,'');let structure;try{structure=formStructure(first);}finally{first.free();}
      sheet={...sheet,paper:fstd.paper.size,columns:structure.columns||2};
      const skey='form|'+(exam?.id||'')+'|'+(form.id||'');
      const b=await assembleFormChecked(Document,{items,openTemplate:()=>openForm(form.bytes,''),bodyStart:structure.firstQuestion,tailStart:structure.tailStart,columns:sheet.columns,open:item=>new Document(item.bytes),between:step,structure,keep:form.keep||{},settleOpen:d=>anchorRaisedTablesOpen(exportLayoutHwpx(d,XLSX.CFB),XLSX.CFB,Document),
        seed:planSeed.get(skey),onPhase:name=>progress({stage:name})});
      planSeed.set(skey,b.plan);
      try{fillFormPageCount(b.document);}catch{}
      // 양식 위에 넣은 직후의 문서는 엔진이 머리 표·〈보기〉 자리를 옛 위치로 그린다(10-29 실측: 2번이 제목 표와 겹침). 저장한 모양으로 다시 열어 그린다 — 문단 번호는 같다.
      let againBytes;try{againBytes=exportLayoutHwpx(b.document,XLSX.CFB);}finally{b.document.free();}
      // 표만 든 문단이 앞 글보다 위로 올라가는 양식(원안지 r01)은 그 문단에 줄 정보를 준다(anchorRaisedTables, 11-02). 보낼 때와 같은 처리.
      againBytes=anchorRaisedTables(againBytes,XLSX.CFB,Document);
      const {document:_,...meta}=b;assembled={key:akey,bytes:againBytes,meta,columns:sheet.columns};try{tcache.put('a','form|'+(exam?.id||'')+'|'+(form.id||''),akey,{bytes:againBytes,meta,columns:sheet.columns});}catch{}
      built={...b,document:new Document(againBytes),pages:[]};
      }
    }else{
    // 단 폭이 다른 용지로 조판한 문항(10-23 지적 2-3: B4 문항이 A4 단에서 넘쳐 겹침)은 화면에서는 시험지 단 폭으로 새로 조판해 놓는다.
    for(const x of items)if(x.profile?.paper!==sheet.paper){await step();const e=await sheetEntry(Document,x.q,sheet.paper);Object.assign(x,{bytes:e.bytes,profile:e.profile,height:(Number.isFinite(e.height)?e.height:60)+x.after,saved:false});rewidth.push(x.q.number);}
    // 11-06(11-04 지적): 기본 틀 시험지도 묶은 결과를 기억한다 — 정답·해설·성취기준처럼 지면에 안 나오는 값만 고치면 다시 묶지 않는다
    // (열쇠 = 쪽 모양·문항별 지면 내용·조판 크기·여백·나눔). 학교 양식 쪽(assembled)과 같은 방식.
    const pkey=JSON.stringify([sheet,items.map(x=>[x.id,contentKey(x.q),x.bytes?.length||0,x.after,x.breakBefore])]);
    if(assembledPlain?.key!==pkey){const st=await tcache.get('a','plain|'+(exam?.id||''),pkey);if(st?.bytes)assembledPlain={key:pkey,bytes:st.bytes,meta:st.meta};}
    if(assembledPlain?.key===pkey)built={...assembledPlain.meta,document:new Document(assembledPlain.bytes),pages:[]};
    else{progress({stage:'place'});built=await assembleExamChecked(Document,{items,sheet,open:item=>new Document(item.bytes),between:step});
      try{const {document:_,...meta}=built;assembledPlain={key:pkey,bytes:exportLayoutHwpx(built.document,XLSX.CFB),meta};tcache.put('a','plain|'+(exam?.id||''),pkey,{bytes:assembledPlain.bytes,meta});}catch{assembledPlain=null;}}
    }
    const {document:target,ranges,pages,moved,tall}=built;
    try{
      const p=parse(target.getPageDef(0)),width=p.width/75,height=p.height/75;
      // 쪽마다 문항별 차지한 자리(시험지 전체 보기에서 다른 문항을 두 번 눌러 그 카드로 가기, 10-22). focus = 지금 문항.
      const spans=items.map(x=>[x.id,...(ranges.get(x.id)||[-1,-1])]),owner=r=>r.secIdx===0?spans.find(([,a,b])=>r.paraIdx>=a&&r.paraIdx<b)?.[0]:undefined;
      const rel=b=>({x:b.x/width,y:b.y/height,w:(b.r-b.x)/width,h:(b.b-b.y)/height});
      const out=[];progress({stage:'draw'});
      for(let i=0;i<target.pageCount();i++){
        const found=new Map();
        // 글 줄로 문항 자리를 먼저 잡고, 그림·표는 같은 단(가로로 겹침)일 때만 넓힌다 — 엔진이 그림·표를 엉뚱한 문단 번호로
        // 보고할 때가 있어(rhwp 0.8.7) 문항 상자가 옆 단까지 넓어지던 문제(10-23).
        const pd=parse(target.getPageDef(0)),mL=pd.marginLeft/75,colW=(pd.width-pd.marginLeft-pd.marginRight)/75/sheet.columns,colOf=x=>Math.max(0,Math.min(sheet.columns-1,Math.floor((x+1-mL)/colW)));
        // 한 문항이 두 단에 걸치면 상자도 단마다 하나씩(10-23 지적 2-2) — 열쇠는 「문항|단」.
        const grow=(id0,r)=>{const id=id0+'|'+colOf(r.x),box=found.get(id);found.set(id,box?{x:Math.min(box.x,r.x),y:Math.min(box.y,r.y),r:Math.max(box.r,r.x+r.w),b:Math.max(box.b,r.y+r.h)}:{x:r.x,y:r.y,r:r.x+r.w,b:r.y+r.h});};
        const ok=r=>owner(r)!==undefined&&[r.x,r.y,r.w,r.h].every(Number.isFinite);
        const filled=r=>String(r.text||'').replace(/\u2060/g,'').trim();
        // 칸 안 글 줄의 paraIdx는 칸 안쪽 번호라 문항 범위와 맞지 않는다 — 맨 바깥 글 줄만.
        for(const r of parse(target.getPageTextLayout(i)).runs)if(!(r.cellPath||[]).length&&ok(r)&&filled(r))grow(owner(r),r);
        // 그림·표는 같은 문항이 그 단에 글 줄로 이미 자리를 잡았을 때만 넓힌다. 다른 표 안에 완전히 든 것은 엉뚱한 문단 번호일 수 있어 뺀다.
        const ctl=parse(target.getPageControlLayout(i)).controls.filter(r=>ok(r)&&!(r.cellPath||[]).length),inside=(c,o)=>o!==c&&o.x<=c.x+.5&&o.y<=c.y+.5&&o.x+o.w>=c.x+c.w-.5&&o.y+o.h>=c.y+c.h-.5&&o.w*o.h>c.w*c.h;
        for(const r of ctl){if(ctl.some(o=>inside(r,o)))continue;const box=found.get(owner(r)+'|'+colOf(r.x)),cx=r.x+r.w/2;if(!box||cx<box.x-4||cx>box.r+4)continue;grow(owner(r),r);}
        if(i)await step();
        const boxes=[...found].map(([key,b])=>({id:key.split('|')[0],...rel(b)})),focus=boxes.find(b=>b.id===focusId);
        // 11-06: 쪽 그림도 SVG 안 이름(cell-clip-8 등)을 쪽마다 다르게 — 같은 화면의 다른 엔진 SVG(문항 카드·미리보기)와 이름이 겹치면
        // 브라우저가 먼저 나온 잘라내기를 써서 표 칸(〈보기〉·선지·그림 칸) 안이 비어 보였다. 한글 화면은 캔버스라 멀쩡했다.
        out.push({svg:uniqueSvg(svgOf(target,i)),width,height,focus:focus&&{x:focus.x,y:focus.y,w:focus.w,h:focus.h},boxes});
      }
      // 문항 하나가 여러 상자(단·쪽)로 나뉘면 첫 상자에만 이름표, 마지막 상자에만 여백 막대를 단다.
      const all=out.flatMap(p=>p.boxes);for(const id of new Set(all.map(b=>b.id))){all.filter(b=>b.id===id).forEach((b,i,mine)=>{b.first=i===0;b.last=i===mine.length-1;});}
      const oversized=[...new Set([...pages.filter(p=>p.oversized).flatMap(p=>p.columns.flat()),...tall])];
      return {pages:out,paper:sheet.paper,columns:sheet.columns,moved,oversized,rewidth,unsaved:items.filter(x=>!x.saved).map(x=>x.q.number),warning:'',form:!!fstd};
    }finally{target.free();}
  }
  // 학교 양식(한글 파일)을 엔진으로 열어 조판 기준 값을 읽는다(10-22 C-6). 열린 문항 조판에는 손대지 않는다.
  // 암호 걸린 한글 파일: 선생님이 입력한 암호(password)로 연다. 암호는 이 함수 밖으로 남기지 않는다.
  async function openForm(bytes,password){await ensure();const Document=document().constructor,data=new Uint8Array(bytes);
    try{return password?Document.openWithPassword(data,password):new Document(data);}
    catch(e){const text=String(e?.message||e);if(/비밀번호|암호|password/i.test(text)){const error=new Error(password?'암호가 맞지 않습니다. 다시 입력하세요.':'암호가 걸린 한글 파일입니다. 암호를 입력하세요.');error.needsPassword=true;throw error;}throw e;}}
  async function readSchoolForm(bytes,fileName,password){const d=await openForm(bytes,password);let read,structure,sample=null;
    try{read=readSchoolDocument(d,{fileName});structure=formStructure(d);try{sample=questionSample(d,structure);}catch{}}finally{d.free();}
    let empty=null;try{empty=await emptyForm(bytes,password,structure);}catch{}
    return {...read,structure,sample,empty};}
  // 11-15(사용자: 양식에 필요한 것만 남기기): 학교 양식 가볍게 — 문항 자리(첫 문항 문단 ~ 꼬리 앞)의 그림·그리기 개체를 빼고,
  // 아무 데서도 쓰지 않게 된 그림 파일을 지운다. 머리 표·배점·꼬리말·쪽 설정·글꼴·문항 글(조판 기준 읽기에 씀)은 그대로.
  // 뺀 뒤 양식 구조(첫 문항·꼬리·단·머리 표)가 원본과 같은지 엔진으로 다시 읽어 확인하고, 다르면 null(원본 그대로 쓴다).
  async function slimForm(bytes,fileName='양식.hwpx',password=''){
    const d=await openForm(bytes,password);let hwpx,structure;
    try{structure=formStructure(d);hwpx=d.exportHwpx();}finally{d.free();}
    if(!(structure.firstQuestion>=0))return null;
    // 엔진(다른 창)이 돌려준 바이트는 이 창의 압축 도구가 못 읽어 이 창 배열로 복사한다.
    const zip=await JSZip.loadAsync(new Uint8Array(hwpx)),secName=Object.keys(zip.files).find(n=>/(^|\/)Contents\/section0\.xml$/i.test(n));if(!secName)return null;
    let xml=await zip.file(secName).async('string');
    const tops=[];{let depth=0,cur=null;const re=/<hp:p\b[^>]*>|<\/hp:p>/g;let m;while((m=re.exec(xml))){if(m[0][1]==='/'){depth--;if(depth===0&&cur){cur.end=m.index+m[0].length;tops.push(cur);cur=null;}}else{if(depth===0)cur={start:m.index};depth++;}}}
    const from=structure.firstQuestion,to=structure.tailStart>=0?Math.min(structure.tailStart,tops.length):tops.length;if(from>=to)return null;
    const OBJ=/<hp:(pic|container|ole|rect|ellipse|arc|polygon|curve|line|connectLine|textart|chart)\b[\s\S]*?<\/hp:\1>/g;let removed=0;
    for(let i=to-1;i>=from;i--){const p=tops[i],seg=xml.slice(p.start,p.end),out=seg.replace(OBJ,()=>{removed++;return '';});if(out!==seg)xml=xml.slice(0,p.start)+out+xml.slice(p.end);}
    if(!removed)return null;
    zip.file(secName,xml);
    // 쓰지 않게 된 그림 파일·목록 지우기
    const used=new Set();for(const n of Object.keys(zip.files))if(/\.xml$/i.test(n)){const t=n===secName?xml:await zip.file(n).async('string');for(const m of t.matchAll(/binaryItemIDRef="([^"]+)"/g))used.add(m[1]);}
    const hpfName=Object.keys(zip.files).find(n=>/content\.hpf$/i.test(n));
    if(hpfName){let hpf=await zip.file(hpfName).async('string');const drop=[];
      hpf=hpf.replace(/<opf:item\b[^>]*\/>/g,tag=>{const id=tag.match(/\bid="([^"]+)"/)?.[1],href=tag.match(/\bhref="([^"]+)"/)?.[1]||'';if(/^BinData\//i.test(href)&&id&&!used.has(id)){drop.push(href);return '';}return tag;});
      zip.file(hpfName,hpf);for(const h of drop){const n=Object.keys(zip.files).find(x=>x.endsWith(h));if(n)zip.remove(n);}}
    if(zip.files.mimetype)zip.file('mimetype',await zip.file('mimetype').async('string'),{compression:'STORE'});
    const out=await zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:6}});
    // 확인: 다시 열어 구조가 같은지
    const Document=document().constructor,check=new Document(out);let s2;try{s2=formStructure(check);}finally{check.free();}
    const same=['firstQuestion','tailStart','columns','headTables'].every(k=>s2[k]===structure[k])&&(s2.parts||[]).length===(structure.parts||[]).length;
    if(!same){console.warn('[5E_exam] 양식 가볍게: 구조가 달라 원본을 씁니다',structure,s2);return null;}
    return {bytes:out,structure:s2,removed,before:bytes.byteLength??bytes.length,after:out.length,fileName:String(fileName).replace(/\.hwpx?$/i,'')+'.hwpx'};
  }
  // 양식 등록 창 견본(10-29 시안 ①): 원본 첫 문항이 그려진 자리만 잘라 낸 쪽 그림.
  // 견본은 그림 없는 짧은 문항(한 쪽 한 단 안, 다른 문단과 겹치지 않음) 가운데 첫 것 — 없으면 첫 문항.
  function questionSample(d,structure){
    const starts=structure.questionParas||[],end=structure.tailStart>0?structure.tailStart:d.getParagraphCount(0),pd=parse(d.getPageDef(0)),pageH=pd.height/75;
    const layouts=Array.from({length:d.pageCount()},(_,page)=>({page,marks:[...(parse(d.getPageTextLayout(page)).runs||[]),...(parse(d.getPageControlLayout(page)).controls||[])].filter(r=>!(r.cellPath||[]).length&&[r.x,r.y,r.w,r.h].every(Number.isFinite))}));
    const region=(a,b)=>{const hit=layouts.map(l=>({page:l.page,mine:l.marks.filter(r=>r.paraIdx>=a&&r.paraIdx<b),others:l.marks.filter(r=>!(r.paraIdx>=a&&r.paraIdx<b))})).filter(l=>l.mine.length);if(hit.length!==1)return null;
      // 한글 「문단 번호」(1.)는 글 줄로 오지 않는다 — 왼쪽을 번호 자리(약 5mm)만큼 더 연다.
      const {page,mine,others}=hit[0],x=Math.min(...mine.map(r=>r.x))-22,y=Math.min(...mine.map(r=>r.y))-4,w=Math.max(...mine.map(r=>r.x+r.w))-x+4,h=Math.max(...mine.map(r=>r.y+r.h))-y+4;
      const clash=others.some(r=>r.x<x+w&&r.x+r.w>x&&r.y<y+h&&r.y+r.h>y&&String(r.text??'x').trim());
      return {page,x,y,w,h,image:mine.some(r=>r.type==='image'),clash};};
    let pick=null;
    for(let i=0;i<starts.length&&!pick;i++){const r=region(starts[i],starts[i+1]??end);if(r&&!r.image&&!r.clash&&r.h<pageH*.4)pick=r;}
    pick||=starts.length?region(starts[0],starts[1]??end):null;if(!pick)return null;
    {const {page,x,y,w,h}=pick;
      const svg=uniqueSvg(svgOf(d,page)).replace(/<svg\b([^>]*)>/,(m,attrs)=>`<svg${attrs.replace(/\s(width|height|viewBox|style|preserveAspectRatio)="[^"]*"/g,'')} viewBox="${x} ${y} ${w} ${h}" preserveAspectRatio="xMinYMin meet" style="display:block;width:100%;height:auto;background:#fff">`);
      return {svg,width:w,height:h};
    }
  }
  // 빈 틀(10-29 시안 ①): 예시 문항을 비운 양식을 쪽마다 그리고, 「남길 것」을 끄면 가릴 자리·문항 자리(쪽 비율)를 같이 준다.
  async function emptyForm(bytes,password,structure){
    const d=await openForm(bytes,password);
    try{
      clearFormBody(d,structure.firstQuestion,structure.tailStart);
      const again=new (d.constructor)(exportLayoutHwpx(d,XLSX.CFB));
      try{
        const pd=parse(again.getPageDef(0)),W=pd.width/75,H=pd.height/75,rel=r=>({x:r.x/W,y:r.y/H,w:r.w/W,h:r.h/H});
        const parts=(structure.parts||[]),ctl=(parse(again.getPageControlLayout(0)).controls||[]).filter(c=>!(c.cellPath||[]).length&&c.type==='table');
        const mask={head:[],score:[]};for(const part of parts){const c=ctl.find(c=>c.paraIdx===part.para);if(c)(part.kind==='head'?mask.head:mask.score).push(rel(c));}
        const footTop=(pd.height-pd.marginBottom)/75,cols=structure.columns||1,left=pd.marginLeft/75,right=(pd.width-pd.marginRight)/75,gap=8,colW=(right-left-gap*(cols-1))/cols;
        const pages=[];
        for(let i=0;i<again.pageCount();i++){
          const top=i===0?Math.max(pd.marginTop/75,...ctl.map(c=>c.y+c.h))+4:pd.marginTop/75;
          const slots=Array.from({length:cols},(_,k)=>rel({x:left+k*(colW+gap),y:top,w:colW,h:footTop-top-4}));
          pages.push({svg:uniqueSvg(svgOf(again,i)),slots,foot:rel({x:0,y:footTop,w:W,h:H-footTop})});
        }
        return {pages,width:W,height:H,mask};
      }finally{again.free();}
    }finally{d.free();}
  }
  // 화면 없이 조판 만들기(10-23 A2): 저장한 조판이 없거나 낡은 문항을 새로 조판해 승인된 조판으로 만든다(시험지로 보낼 때).
  // 지금 열린 문항이면 열린 한글 창 모양(교사가 다듬은 것)을 그대로 저장한다.
  async function autoTypeset(value){
    await ensure();
    if(skeletonKey(value))throw Error(`${value.number}번 문항에 비어 있는 칸이 있어 조판을 만들 수 없습니다. 채우거나 구성에서 지우세요.`);
    if(ready&&!loading&&q?.id===value.id&&contentKey(q)===contentKey(value)){const s=await snapshot()||await snapshot();if(s){dirty=false;userDirty=false;patchDirty=false;return s;}}
    const own={paper:value.paper||value.typeset?.profile?.paper||'B4',columns:2,...frameProfile(std(value))},Document=document().constructor;
    const {bytes:raw}=await generate(structuredClone(value),own,{quiet:true}),d=new Document(raw);
    try{fitQuestionPage(d,own);assertNativeLayout(d);const bytes=exportLayoutHwpx(d,XLSX.CFB),re=new Document(bytes);
      try{assertNativeLayout(re);validateQuestionPage(re,own);
        return {bytes:toBase64(bytes),fingerprint:await questionFingerprint(value),baselineText:normalized(parse(re.getTextFileText())),profile:own,pageMode:QUESTION_PAGE_MODE,metrics:questionPageMetrics(re,own),pageDef:parse(re.getPageDef(0)),columnDef:parse(re.getColumnDef(0)),savedAt:new Date().toISOString(),layoutVersion:LAYOUT_VERSION,verified:true,auto:true};
      }finally{re.free();}
    }finally{d.free();}
  }
  // 조판 설정 팝업의 미리보기(10-23 B, 시안 typeset-settings-1023-v3): 초안 틀로 이 문항을 새로 조판해 깨끗한 쪽 그림으로.
  // 편집 창과 따로 그린다(편집용 칸 테두리 없음). 겹쳐 그리기용으로 요소 자리·글 줄·개체 자리(쪽 px)도 준다.
  async function previewSheet(value,standard){
    await ensure();const own={paper:value.paper||value.typeset?.profile?.paper||'B4',columns:2,...frameProfile(standard||std(value))},Document=document().constructor;
    const {bytes,owners:o}=await generate(structuredClone(value),own,{quiet:true,standard}),raw=new Document(bytes);
    // 문항 쪽 높이를 내용에 맞춘 뒤(한 쪽에 다 들어가게) 다시 열어 그린다 — 자동 조판과 같은 순서.
    let d;try{fitQuestionPage(raw,own);d=new Document(exportLayoutHwpx(raw,XLSX.CFB));}finally{raw.free();}
    try{const page=parse(d.getPageDef(0));
      return {svg:uniqueSvg(svgOf(d,0)),width:page.width/75,height:page.height/75,page,elements:questionElements(d,value,o?.places||o?.texts),
        runs:parse(d.getPageTextLayout(0)).runs,controls:parse(d.getPageControlLayout(0)).controls};
    }finally{d.free();}
  }
  // 학교 양식 시험지에서 양식 틀로 새로 조판할 문항(10-30): 그 문항은 보내기 전에 제 틀로 조판해 둘 필요가 없다.
  const retypesForForm=(value,form)=>{const f=formStandardOf(form);return !!f&&!(std(value).id===f.id&&value.typeset?.verified&&value.typeset?.profile?.paper===f.paper.size);};
  // 11-14 3차 37: 그림 편집 창 ⌘Enter로 고친 그림 — 같은 비율이면 열린 문서의 그 그림만 바꿔 끼운다(문서 전체 다시 조판 없음). 비율이 다르면 false(예전처럼 다시 조판).
  async function swapFigure(id,figure){try{
    if(!bridge||!ready||loading||!q||!figure?.data)return false;const b=q.blocks.find(v=>v.id===id);if(!b?.figure?.data)return false;const item=placer?.itemOf?.(id);if(!item)return false;
    const size=async src=>{const i=new Image();i.src=src;await i.decode();return {w:i.naturalWidth,h:i.naturalHeight};};const [a,n]=await Promise.all([size(b.figure.data),size(figure.data)]);
    if(!(a.w>0&&n.w>0))return false;
    const bin=atob(String(figure.data).split(',')[1]||''),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
    // 11-15: 라벨로 그림 영역 비율이 바뀌어도 다시 조판하지 않는다 — 폭은 그대로 두고 높이만 새 비율로 맞춘다(전에는 2% 넘게 바뀌면 문서 전체를 다시 조판해 느렸다).
    bridge.transaction('swap-figure',()=>{const pr=parse(bridge.properties(item.ref));bridge.writeFigure(item.ref,{bytes,pixelWidth:n.w,pixelHeight:n.h},'card-'+id);
      if(pr?.width>0&&Math.abs(a.h/a.w-n.h/n.w)>.002)bridge.setProperties(item.ref,{width:pr.width,height:Math.round(pr.width*n.h/n.w)});return true;});
    b.figure=JSON.parse(JSON.stringify(figure));dirty=true;userDirty=true;requestAnimationFrame(()=>placer?.refresh());return true;
  }catch{return false;}}
  return {slimForm,tableDoc,swapFigure,retypesForForm,questionSvg,previewSheet,autoTypeset,examPagesSvg,readSchoolForm,open,update,commit,buildExam,pageSheets,discard,skeletonOnly,get questionId(){return q?.id;},takeSkipped(){const v=skipped;skipped=null;return v;},matches:value=>ready&&!!q&&contentKey(q)===contentKey(value)&&qStd===stdKey(value),get dirty(){return dirty;},refreshView:()=>view?.fit()};
}
