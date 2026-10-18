import {RhwpExamBridge} from '/js/rhwp-exam-bridge.js?v=1014-compact-panel';
import {buildExamDocument} from './exam-build.js';
import {buildTextMap,mapTextEdit,applyTextEdit} from './text-sync.js';
import {loadImage} from './image-load.js';
import {attachPlacementLayer} from './placement-layer.js';
import {PictureSettings} from '/js/rhwp-exam-picture-controls.js?v=1.7.0-four-session-integration';
import {buildQuestionHtml,verifyNativeQuestion,skeletonKey} from './handoff.js';
import {questionFingerprint,typesetMatches,renderedContent,toBase64,fromBase64,materializeEquations,normalizeQuestionImport,applyQuestionIndent,applyReferenceBogiIndent,applyCellEquationLines,applyFloatingPictures,settleFloatingPictures,LAYOUT_VERSION} from './typeset-model.js?v=1014-compact-panel';
import {QUESTION_PAGE_MODE,questionPageProfile,fitQuestionPage,questionPageMetrics,validateQuestionPage,resizeQuestionDocument} from './question-page.js?v=1014-compact-panel';
import {applyTableAlignment,applyHangingIndent} from '/js/rhwp-exam-table-controls.js?v=1014-compact-panel';
import {nativeLayoutSignature,nativeImageSignature} from './native-transfer.js?v=1014-compact-panel';
import {exportLayoutHwpx} from './native-hwpx.js?v=1014-compact-panel';
import {assertNativeLayout} from './native-layout-check.js?v=1014-compact-panel';
import {attachTypesetView} from './typeset-view.js';
import {createNativeTextMeasurer} from './native-text-measure.js';
import {compactSavedBogi} from './compact-bogi.js';
import {nativeRuns,planPatches,applyPatches,layoutKey} from './live-patch.js';

const parse=value=>typeof value==='string'?JSON.parse(value):value;
// 틀 보기용 빈 그림 자리: 옅은 점선 상자에 이름. PNG라야 한글 엔진이 받는다.
const ghostFigures=new Map();
function ghostFigure(width,height,label){
  const key=`${width}x${height}:${label||''}`;if(ghostFigures.has(key))return ghostFigures.get(key);
  const scale=2,canvas=window.document.createElement('canvas');canvas.width=width*scale;canvas.height=height*scale;const g=canvas.getContext('2d');g.scale(scale,scale);
  g.fillStyle='#f4f5f6';g.fillRect(0,0,width,height);g.strokeStyle='#b8bdc3';g.lineWidth=1;g.setLineDash([4,3]);g.strokeRect(.5,.5,width-1,height-1);
  g.fillStyle='#9aa0a6';g.textAlign='center';g.textBaseline='middle';
  const line=(text,size,y)=>{let px=size;do g.font=`${px}px "Apple SD Gothic Neo",sans-serif`;while(g.measureText(text).width>width-12&&--px>7);g.fillText(text,width/2,y);};
  line('자료',13,height/2-9);line('그림·표는 카드에서 넣기',10,height/2+9);
  const figure={name:'자료 자리.png',data:canvas.toDataURL('image/png'),width,height};ghostFigures.set(key,figure);return figure;
}
const SKELETON={skeleton:true,ghostFigure};
// 문서 첫 문단은 구역 정보를 품는 자리라 시험지로 옮길 때 빠진다(native-transfer sourceStart:1). 높이가 거의 없는 빈 문단으로 둔다.
const LEAD='<p style="margin:0;font-size:1pt;line-height:100%"> </p>';
const normalized=text=>String(text).replace(/\s+/g,' ').trim();
export function createTypesetter({host,status,paper,columns,save,download,onSave,onPlacement,onTextEdit,onDiverge,onSlot}){
  let textMap=null,syncTimer=0,placer=null,owners=null,bridge=null,starting=null,q=null,fingerprint='',baselineText='',baselineEquations='',baselineImages='',opening=0,loading=false,ready=false,pictureSettings,fitting=false,fitFrame=0,lastProfile,metricsCache,view,dirty=false,patching=false,updating=Promise.resolve(),measurer=null,changingProfile=Promise.resolve();
  const message=(text,error=false)=>{status.textContent=text;status.dataset.error=String(error);};
  const document=()=>bridge.wasm.borrowDocumentHandle();
  const profile=()=>({paper:paper.value,columns:Number(columns.value)});
  const metricsOutput=host.parentElement.querySelector('#typeset-metrics');
  const guideLayer=window.document.createElement('div');guideLayer.className='question-guide-layer';guideLayer.setAttribute('aria-hidden','true');
  const guide=window.document.createElement('div');guide.className='question-height-guide';guide.hidden=true;
  const guideLabel=window.document.createElement('span');guide.append(guideLabel);guideLayer.append(guide);host.append(guideLayer);
  function drawGuide(){
    placer?.refresh();
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
    if(!starting)starting=RhwpExamBridge.create(host,{showEditingBorders:true,tableLayoutLocked:true,onChange:error=>{if(patching&&!error){scheduleFit();return;}if(ready&&!loading&&!fitting){dirty=true;message(error?error.message:'조판 수정 중 · 완료하면 조판 저장을 누르세요.',!!error);scheduleFit();scheduleTextSync();}},onEdit:(_id,ref)=>{
      bridge.selectPicture(ref);pictureSettings.open(bridge.pictureLayout(ref),save,{ref,generation:bridge.generation,inlineAlignment:!!bridge.paragraphTarget(ref)});
    }}).then(async b=>{bridge=b;await bridge.newDocument();bridge.watchView(drawGuide);view=attachTypesetView(bridge,host);placer=attachPlacementLayer({bridge,host,hint:host.parentElement.querySelector('#placement-hint-text'),onActivate:(action,block,ref)=>{if(action==='settings'){bridge.selectPicture(ref);pictureSettings.open(bridge.pictureLayout(ref),save,{ref,generation:bridge.generation,inlineAlignment:!!bridge.paragraphTarget(ref)});return;}onSlot?.(action,block,q?.id);},onApply:(fn,text)=>onPlacement?.(fn,text,q?.id),canEdit:()=>{if(!ready||loading)return false;if(dirty){message('한글 창에 저장 전 수정이 있어 배치를 바꿀 수 없습니다. 조판 저장 후 다시 끌어 주세요.',true);return false;}return true;}});pictureSettings=new PictureSettings(host.parentElement,{onApply:(value,context)=>{if(context.generation!==bridge.generation)throw Error('다시 그림을 선택하세요.');bridge.applyPictureLayout(context.ref,value);},onError:e=>message(e.message,true)});return b;}).catch(e=>{starting=null;throw e;});
    return starting;
  }
  async function prepareFigure(f){const image=await loadImage(f.data);if(image.naturalWidth*image.naturalHeight>40000000)throw Error('사진 크기를 줄여주세요.');if(!f.data.startsWith('data:image/png;')){const canvas=window.document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext('2d').drawImage(image,0,0);f.data=canvas.toDataURL('image/png');}return {...f,width:image.naturalWidth,height:image.naturalHeight};}
  // 저장된 조판을 열 때도 그림·표의 주인을 알아야 한다. 그림을 실제로 읽지 않는 가벼운 계획으로 순서만 얻는다.
  const BLANK='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  async function planOwners(value){const plan=await buildQuestionHtml(value,async f=>({...f,data:BLANK,width:f.width||100,height:f.height||100}),questionPageProfile(profile()).width,SKELETON);return {images:plan.imageOwners,tables:plan.tableOwners,shapes:plan.tables,texts:plan.textSegments};}
  async function generate(value){
    const Document=document().constructor,d=Document.createEmpty();let bytes;
    try{d.createBlankDocument();const config=questionPageProfile(profile());d.setPageDef(0,JSON.stringify(config.page));d.setColumnDef(0,1,0,true,0);
      const plan=await buildQuestionHtml(value,prepareFigure,config.width,{native:true,measureText:createNativeTextMeasurer(Document),...SKELETON});owners={images:plan.imageOwners,tables:plan.tableOwners,shapes:plan.tables,texts:plan.textSegments};const result=parse(d.pasteHtml(0,0,0,LEAD+plan.html));if(!result.ok)throw Error('문항 조판을 만들지 못했습니다.');
      bytes=await materializeEquations(Document,JSZip,await normalizeQuestionImport(d.exportHwpx(),JSZip),plan.equations);
      const checked=new Document(bytes);try{const styled=new Document(await applyReferenceBogiIndent(checked,JSZip));try{styled.reflowLinesegs();applyQuestionIndent(styled,value.number,{body:true,askLead:plan.askLead,askIndent:plan.askIndent});
        // 어울림은 내어쓰기 뒤에 건다. 문단 모양을 나중에 바꾸면 한글 엔진이 그림 옆 줄 폭을 잘못 잡는다.
        if(plan.floats.length){applyFloatingPictures(styled,plan.floats);styled.reflowLinesegs();settleFloatingPictures(styled);}fitQuestionPage(styled,profile());verifyNativeQuestion(styled,plan);bytes=await applyCellEquationLines(exportLayoutHwpx(styled,XLSX.CFB),JSZip);}finally{styled.free();}}finally{checked.free();}
      if(plan.warnings.length)message(plan.warnings.join(' '));
    }finally{d.free();}
    return bytes;
  }
  async function open(value){
    const seq=++opening;loading=true;ready=false;host.dataset.ready='false';metricsCache=null;guide.hidden=true;metricsOutput.textContent='';cancelAnimationFrame(fitFrame);fitFrame=0;save.disabled=true;download.disabled=true;paper.disabled=true;columns.disabled=true;message('실제 한글 문서로 조판하는 중…');placer?.clear();owners=null;textMap=null;clearTimeout(syncTimer);
    try{await ensure();if(seq!==opening)return;const next=structuredClone(value),nextFingerprint=await questionFingerprint(next);
      const saved=await typesetMatches(next.typeset,next)&&[9,10,LAYOUT_VERSION].includes(next.typeset.layoutVersion)?next.typeset:null;
      // 기준 용지: 문항에 정한 용지(q.paper) → 저장한 조판의 용지 → A4. 저장한 조판과 다르면 같은 단 폭 문서를 새 용지로 옮긴다.
      paper.value=next.paper||saved?.profile.paper||'A4';columns.value=String(saved?.profile.columns||2);
      let bytes=saved?fromBase64(saved.bytes):await generate(next);
      if(saved)owners=await planOwners(next);
      if(saved&&(saved.pageMode!==QUESTION_PAGE_MODE||saved.profile.paper!==paper.value)){
        // Retain the user's approved native formatting while moving the same
        // column width onto the new question paper; never rebuild it as HTML.
        const Document=document().constructor,old=new Document(bytes);
        try{bytes=resizeQuestionDocument(old,profile(),XLSX.CFB);}finally{old.free();}
      }
      if(saved&&saved.layoutVersion<LAYOUT_VERSION){
        const Document=document().constructor,old=new Document(bytes);let compact;
        try{compact=new Document(await compactSavedBogi(old,next,JSZip,XLSX.CFB));compact.reflowLinesegs();fitQuestionPage(compact,profile());assertNativeLayout(compact);
          if(normalized(parse(old.getTextFileText())).replace(/\s/g,'')!==normalized(parse(compact.getTextFileText())).replace(/\s/g,''))throw Error('보기 여백을 정리하면서 내용이 달라졌습니다.');
          bytes=exportLayoutHwpx(compact,XLSX.CFB);
        }finally{compact?.free();old.free();}
      }
      q=next;fingerprint=nextFingerprint;
      await bridge.load(bytes,`${q.number}번 문항.hwpx`);host.append(guideLayer);
      bridge.setTableLayoutLocked(true);resize.setAttribute('aria-pressed','false');
      baselineText=normalized(parse(document().getTextFileText()));baselineEquations=await equationScripts(bytes);
      baselineImages=await nativeImageSignature(document());ready=true;host.dataset.ready='true';dirty=false;view.refresh();
      bridge.input.cursor.moveTo({sectionIndex:0,paragraphIndex:1,charOffset:0});
      validateQuestionPage(document(),profile());lastProfile=profile();message('문항 길이에 맞춰 용지 높이 자동 조절 · 표 크기 잠금 · Shift+Tab으로 내어쓰기');
      try{assertNativeLayout(document());}catch(e){message(e.message,true);}
      if(owners)placer?.setModel({question:q,owners});
      textMap=owners?.texts?buildTextMap(parse(document().getTextFileText()),owners.texts.map(s=>({...s}))):null;
    }finally{if(seq===opening){loading=false;save.disabled=!ready;download.disabled=!ready;paper.disabled=!ready;columns.disabled=!ready;if(ready){fitLive();drawGuide();}}}
  }
  // 한글 창에서 고친 글을 잠시 뒤 시트 칸에 반영한다. 반영하면 이 문항의 기준 글도 새 글로 바뀐다.
  function scheduleTextSync(){clearTimeout(syncTimer);syncTimer=setTimeout(()=>void syncText(),80);}
  async function syncText(){
    if(!ready||loading||!textMap||!onTextEdit||!q)return;
    const raw=parse(document().getTextFileText()),result=mapTextEdit(textMap,raw);
    if(result.unchanged)return;
    if(!result.ok){message(result.reason,true);onDiverge?.(true);return;}
    onDiverge?.(false);
    const id=q.id,changes=result.changes.map(c=>({owner:c.owner,value:c.value}));
    for(const c of result.changes){applyTextEdit(q,c.owner,c.value);textMap.segments[c.index].value=c.full;}
    textMap=buildTextMap(raw,textMap.segments);baselineText=normalized(raw);fingerprint=await questionFingerprint(q);
    if(!onTextEdit(changes,id))return;
    message('한글에서 고친 글을 시트에 반영했습니다 · 서식까지 남기려면 조판 저장을 누르세요.');
  }
  // 시트에서 고친 글을 한글 창에 바로 넣는다. 같은 문항이고 글 조각의 구성이 같으면 바뀐 문단만 바꾸고(서식·저장 전 조판 유지),
  // 구성이 바뀌었거나 짝을 찾지 못하면 false — 부르는 쪽이 다시 그린다. 차례로 하나씩 처리한다.
  function update(value){const run=updating.then(()=>patchFrom(value));updating=run.catch(()=>{});return run;}
  async function patchFrom(value){
    if(!ready||loading||!q||!owners?.texts||!textMap||value?.id!==q.id)return false;
    if(contentKey(q)===contentKey(value))return true;
    if(layoutKey(q)!==layoutKey(value)||skeletonKey(q)!==skeletonKey(value))return false;
    const seq=opening,next=structuredClone(value),Document=document().constructor;
    const plan=await buildQuestionHtml(next,async f=>({...f,data:BLANK,width:f.width||100,height:f.height||100}),questionPageProfile(profile()).width,{native:true,measureText:measurer||=createNativeTextMeasurer(Document),...SKELETON});
    if(seq!==opening||!ready||loading)return false;
    if(JSON.stringify([plan.imageOwners,plan.tableOwners,plan.tables])!==JSON.stringify([owners.images,owners.tables,owners.shapes]))return false;
    const patches=planPatches(textMap.segments,plan.textSegments,nativeRuns(document()));
    if(!patches)return false;
    if(patches.length){
      patching=true;
      try{bridge.transaction('sheet-text',()=>{applyPatches(bridge.wasm,patches);return true;});}
      finally{requestAnimationFrame(()=>{patching=false;});}
      message('시트에서 고친 글을 한글 창에 바로 넣었습니다.');
    }
    q=next;owners={images:plan.imageOwners,tables:plan.tableOwners,shapes:plan.tables,texts:plan.textSegments};
    const raw=parse(document().getTextFileText());
    textMap=buildTextMap(raw,owners.texts.map(s=>({...s})));baselineText=normalized(raw);fingerprint=await questionFingerprint(q);
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
        loading=true;try{await bridge.load(new Uint8Array(bytes),`${q.number}번 문항.hwpx`);}finally{loading=false;}
        message('최종 저장 모양으로 갱신했습니다. 글·표·그림 배치를 확인한 뒤 조판 저장을 다시 누르세요.');return null;
      }
      return {bytes:toBase64(bytes),fingerprint,baselineText,profile:profile(),pageMode:QUESTION_PAGE_MODE,metrics:questionPageMetrics(reopened,profile()),pageDef:parse(document().getPageDef(0)),columnDef:parse(document().getColumnDef(0)),savedAt:new Date().toISOString(),layoutVersion:LAYOUT_VERSION,verified:true};
    }finally{reopened.free();}
  }
  async function commit(){
    await changingProfile;
    if(bridge&&[...bridge.editor.element.contentDocument.querySelectorAll('.modal-overlay')].some(n=>n.getClientRects().length))throw Error('열려 있는 조판 설정을 적용하거나 취소한 뒤 문항을 전환하세요.');
    if(!ready||!dirty)return;
    if(skeletonKey(q)){dirty=false;return;}
    const s=await snapshot();if(!s)throw Error('저장될 모양을 확인하고 조판 저장을 누르세요.');
    await onSave(s,q.id);dirty=false;
  }
  save.onclick=async()=>{save.disabled=true;try{const s=await snapshot();if(!s)return;await onSave(s,q.id);dirty=false;message('조판 저장됨 · HWPX 재열기 후 모양 검수 완료');}catch(e){message(e.message,true);}finally{save.disabled=!ready;}};
  download.onclick=async()=>{download.disabled=true;try{const s=await snapshot();if(!s)return;await onSave(s,q.id);dirty=false;const a=window.document.createElement('a'),url=URL.createObjectURL(new Blob([fromBase64(s.bytes)],{type:'application/vnd.hancom.hwpx'}));a.href=url;a.download=`${q.managementId||q.number}번 문항.hwpx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);message('편집 가능한 HWPX를 내려받았습니다.');}catch(e){message(e.message,true);}finally{download.disabled=!ready;}};
  const changeProfile=async()=>{
    if(!bridge||loading||!ready)return;loading=true;save.disabled=true;download.disabled=true;paper.disabled=true;columns.disabled=true;guide.hidden=true;
    try{const next=profile(),bytes=resizeQuestionDocument(document(),next,XLSX.CFB),cursor=bridge.input.getCursorPosition();
      await bridge.load(bytes,`${q.number}번 문항.hwpx`);host.append(guideLayer);bridge.input.cursor.moveTo(cursor);lastProfile=next;metricsCache=null;dirty=true;view.fit();
      message('기준 단 폭 변경됨 · 글·표·그림 배치를 확인하고 조판 저장을 누르세요.');
    }catch(e){paper.value=lastProfile.paper;columns.value=String(lastProfile.columns);message(e.message,true);}
    finally{loading=false;save.disabled=false;download.disabled=false;paper.disabled=false;columns.disabled=false;drawGuide();}
  };
  paper.onchange=()=>{changingProfile=changeProfile();};columns.onchange=()=>{changingProfile=changeProfile();};
  const align=host.parentElement.querySelector('#typeset-table-align'),indent=host.parentElement.querySelector('#typeset-indent'),resize=host.parentElement.querySelector('#typeset-resize');
  resize.onclick=()=>{if(!ready||loading)return;bridge.setTableLayoutLocked(!bridge.tableLayoutLocked);resize.setAttribute('aria-pressed',String(!bridge.tableLayoutLocked));message(bridge.tableLayoutLocked?'표 크기 잠금 · 마우스로 경계를 움직여도 크기는 유지됩니다.':'표 크기 조절 켜짐 · 표 경계를 드래그한 뒤 다시 끄세요.');};
  align.onchange=()=>{try{if(!ready||loading)return;applyTableAlignment(bridge,align.value);message('표 위치 변경됨 · 조판 저장을 누르세요.');}catch(e){message(e.message,true);}finally{align.value='';}};
  indent.onclick=()=>{try{if(!ready||loading)return;if(!applyHangingIndent(bridge))throw Error('본문에서 들여쓸 위치를 클릭하세요.');message('다음 줄이 커서 위치에 맞춰집니다 · 조판 저장을 누르세요.');bridge.input.textarea.focus();}catch(e){message(e.message,true);}};
  const contentKey=value=>JSON.stringify(renderedContent(value));
  async function buildExam(data,examSet){
    await ensure();const Document=document().constructor,{document:exam}=await buildExamDocument(Document,data,examSet);
    try{return exportLayoutHwpx(exam,XLSX.CFB);}finally{exam.free();}
  }
  // 한글 창에서 바꾼 것을 버린다(시트에 반영되지 않은 수정 포함). 다음 open이 시트 내용으로 다시 그린다.
  function discard(){clearTimeout(syncTimer);dirty=false;ready=false;onDiverge?.(false);}
  // 틀(회색 안내)만 달라지는 변경: 빈 칸에 처음 쓰거나 다 지울 때. 문단 글 바꾸기로는 안 되고(안내는 회색) 다시 그려야 한다.
  const skeletonOnly=value=>!!q&&value?.id===q.id&&layoutKey(q)===layoutKey(value)&&skeletonKey(q)!==skeletonKey(value);
  return {open,update,commit,buildExam,discard,skeletonOnly,get questionId(){return q?.id;},matches:value=>ready&&!!q&&contentKey(q)===contentKey(value),get dirty(){return dirty;},refreshView:()=>view?.fit()};
}
