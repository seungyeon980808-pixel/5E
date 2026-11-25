import {embedEditablePng,readEditablePng} from './editable-png.js?v=1.7.0-four-session-integration';
import {getContentBounds} from './svg-export.js?v=1.7.0-four-session-integration';
import {syncAppLock} from './app-lock.js?v=1.7.0-four-session-integration';
// PATHFIX(11-20): AI 오류를 출제 칸에 영어 원문(「Error invoking remote method …」) 대신 한국어로 보내고, 설치판 오류 기록에 남긴다.
import {aiErrorText,aiErrorCode,reportAiError} from './ai-error-copy.js?v=1.7.0-four-session-integration';
const aiFail=(where,error)=>{reportAiError(where,error);return aiErrorText(error);};
// 11-22: 연결이 필요한 실패(설치 없음 → install, 로그인 없음 → login). 그 밖은 ''.
const connectionNeed=error=>{const code=aiErrorCode(error);return code==='CODEX_NOT_FOUND'?'install':code==='CODEX_NOT_LOGGED_IN'?'login':'';};
const copy=v=>structuredClone(v);
// 설치형(file://)은 출처가 열리지 않아 location.origin으로 보낸 신호가 버려진다 — '*'로 보내고 받을 때는 출제 창에서 왔는지로 가린다.
const FILE_MODE=location.protocol==='file:',OWN=FILE_MODE?'*':location.origin;
const asData=bytes=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return 'data:image/png;base64,'+btoa(s);};
let harnessPromise,enginesPromise;
const engines=()=>enginesPromise||=(window.fiveEFigureEngines?Promise.resolve(window.fiveEFigureEngines):import('./exampool-figure-engines.js?v=1.7.0-four-session-integration').then(x=>x.createFigureEngines()));
// 시험에서 대역 하네스를 넣을 수 있게 window.fiveEAuthoringHarness를 먼저 본다.
// 11-25 밤샘: 출제 엔진을 처음 부를 때 인터넷이 끊겨 있으면 「Failed to fetch dynamically imported module …」 영어 원문이 문항 대화에 그대로 떴다.
const MODULE_FAIL='AI 출제 기능을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 요청하세요. 입력한 내용은 그대로입니다.';
const authoring=()=>window.fiveEAuthoringHarness?Promise.resolve(window.fiveEAuthoringHarness):harnessPromise||=(import('./exampool-authoring-harness.js?v=1.7.0-four-session-integration').then(x=>x.createAuthoringHarness()).catch(error=>{harnessPromise=null;throw Object.assign(Error(MODULE_FAIL),{cause:error});}));
export function initQuestionSheet(state,services,examWorkspace){
  // 5E_ExamPool 버튼(button-design.js가 만든 자리)이 문항 시트를 연다. 없으면 같은 자리에 만든다.
  let entry=document.getElementById('exam-pool-open');
  if(!entry){entry=document.createElement('button');entry.id='exam-pool-open';entry.type='button';entry.className='object-search-trigger';entry.textContent='5E_ExamPool';document.querySelector('.image-workflow-hub')?.append(entry);}
  entry.disabled=false;entry.title='5E_exam · 문항 만들기';
  let host,frame,focusReturn,busy=false;
  // 그림 고르기 중(「5E에서 잘라 넣기」)에 출제 칸을 다시 열면 고르기를 취소하고 연다 — 예전엔 고르기 상자가 가려지고 전송 잠금이 안 풀려
  // 「한글로 보내기」·그림 가져오기가 모두 막혔다(M6).
  // 11-04: 시작 창이 떠 있는 동안 출제 칸을 숨긴 채 미리 불러 둔다 — 처음 exam으로 넘어갈 때 기다림·버벅임 줄이기.
  function prewarm(){if(host)return;open({silent:true});}
  // Lite는 출제 칸을 열지 않는다(11-14). 1.7.1 B1: 말없이 끝내지 않고 「정식판에서 됩니다」 안내 → Pro로 바꾸면 이어서 연다(view-mode.js requirePro).
  const liteBlocked=(what,resume)=>{if(document.documentElement.dataset.mode!=='lite')return false;void Promise.resolve(window.fiveERequirePro?.(what)??false).then(ok=>{if(ok&&document.documentElement.dataset.mode!=='lite')resume();});return true;};
  function open(opts={}){if(!opts.silent&&liteBlocked('5E_exam 문항 만들기',()=>open(opts)))return;if(picking){picking.cancel();return;}if(!host){host=document.createElement('section');host.id='exampool-sheet-workspace';host.setAttribute('aria-label','문항 시트');host.setAttribute('role','dialog');host.setAttribute('aria-modal','true');host.style.cssText='position:fixed;inset:0;z-index:1250;background:var(--ds-app);';frame=document.createElement('iframe');frame.setAttribute('aria-label','5E_exam 문항 시트');/* title이면 Safari가 화면 위에 말풍선으로 띄운다 */frame.src=new URL('../assets/exampool/sheet/index.html',import.meta.url).href+(new URLSearchParams(location.search).get('sheet-example')==='1'?'?example=1':'');frame.style.cssText='width:100%;height:100%;border:0;display:block;opacity:0;transition:opacity 200ms cubic-bezier(.2,0,0,1)';/* 첫 열기: 안 문서가 다 그려진 뒤 흐려졌다 또렷해지게(빈 칸 → 내용이 휙 뜨지 않게), 1.5초가 지나면 그냥 보인다 */frame.addEventListener('load',()=>{const start=performance.now(),show=()=>{if(frame.contentDocument?.querySelector('.side [data-pool]')||performance.now()-start>1500)frame.style.opacity='1';else requestAnimationFrame(show);};show();},{once:true});host.append(frame);document.body.append(host);}
    if(opts.silent){host.hidden=true;return;}
    focusReturn=document.activeElement;host.hidden=false;host.style.bottom='0';/* ExamPool 상태 줄 하나에 5E 버전·문제 신고를 함께 두므로 5E 아래 막대는 덮는다(아래 막대 두 줄 → 한 줄). */syncAppLock();}
  // 사용자가 출제 칸을 닫거나(✕) 한글로 보낼 때: 휙 사라지지 않게 0.16초 흐려지며 닫는다(app-switch.css의 .app-leaving). 움직임 줄이기 설정이면 바로.
  function fadeClose(){if(!host||host.hidden)return;if(matchMedia('(prefers-reduced-motion: reduce)').matches){close();return;}host.classList.add('app-leaving');setTimeout(()=>{host.classList.remove('app-leaving');close();},160);}
  function close(){if(!host)return;host.hidden=true;document.documentElement.classList.remove('exampool-modal');syncAppLock();focusReturn?.focus();}
  // 5E 그림을 ExamPool 문항의 그림 칸으로 보낸다. region(mm)이 있으면 그 영역만, 없으면 그림 전체.
  async function captureFigure(m,send,region=null){
        services.commitActiveText?.();const source=copy(services.serialize(state.get()));source.pages=source.pages.filter(p=>p.id===source.activePageId);const {active}=services.prepareLoadedProject(copy(source));if(!active.objects.length)throw Error('캔버스가 비어 있습니다');const bounds=region||getContentBounds({...state.get(),...active});if(!bounds||bounds.w<=0||bounds.h<=0||(bounds.w/25.4*300)*(bounds.h/25.4*300)>40000000)throw Error('그림 영역을 줄인 뒤 가져오세요.');
        const assetId=m.key.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80),id=crypto.randomUUID(),name=active.name.slice(0,200);source.pages[0].meta={...source.pages[0].meta,exampoolLink:{questionId:m.qid,assetId}};await services.ensureEmbeddedFonts();const render={bounds,options:{includeReferenceImages:true,excludeAllImages:false}},result=await services.rasterizeExportCanvas({...state.get(),...active},{dpi:300,...render}),blob=await new Promise((resolve,reject)=>result.canvas.toBlob(b=>b?resolve(b):reject(Error('그림을 가져오지 못했습니다.')),'image/png'));
        const png=asData(embedEditablePng(new Uint8Array(services.insertPngPhys(await blob.arrayBuffer(),300)),{id,name,version:1,source,render,link:{tabId:m.qid,assetId}},services.prepareLoadedProject));if(png.length>8*1024*1024)throw Error('엑셀에 보관할 그림은 5 MB 이하로 줄여주세요.');send({action:'figure-ready',figure:{name,data:png,editable:{id,name,png,source,render,capturedAt:new Date().toISOString(),widthMm:result.widthMm,heightMm:result.heightMm,pixelWidth:result.canvas.width,pixelHeight:result.canvas.height}}});
        state.update(v=>{const page=v.pages.find(p=>p.id===source.activePageId);if(page)page.meta={...page.meta,exampoolLink:{questionId:m.qid,assetId}};});
      
  }
  // 그림 자리 더블클릭 → 5E 그림 화면에서 보낼 영역을 손잡이로 정하고 '이 자리에 넣기'. 문항 창은 잠시 숨긴다.
  let picking=null;
  async function pickFromLibrary(m,send){
    const {openPdfReferencePicker}=await import('./pdf-library/reference-picker.js?v=1.7.0-four-session-integration');
    const app=document.querySelector('body>.app');host.hidden=true;syncAppLock();
    const back=document.createElement('button');back.type='button';back.className='exampool-library-back';back.textContent='5E_exam으로 돌아가기';
    back.style.cssText='position:fixed;z-index:2147483000;left:50%;bottom:64px;transform:translateX(-50%);height:38px;padding:0 18px;border:0;border-radius:19px;background:var(--go-bg,#152137);color:var(--go-ink,#cfe1ff);box-shadow:inset 0 0 0 1px var(--go-line,#6ba4f8),0 6px 20px rgba(0,0,0,.4);font:inherit;font-size:13px;cursor:pointer';
    let done=false,closeLibrary=null;const finish=items=>{if(done)return;done=true;back.remove();closeLibrary?.();open();send({action:'library-picked',items});};
    back.onclick=()=>finish([]);document.body.append(back);
    const pack=r=>({data:r.dataUrl||r.src,name:String(r.name||'라이브러리 자료').slice(0,200),source:r.source?{documentTitle:r.source.documentTitle||'',title:r.source.title||'',pageNumber:Number.isInteger(r.source.pageNumber)?r.source.pageNumber:null,rect:r.source.rect||null,sha256:r.source.documentHash||r.source.sha256||null,locator:r.source.locator||null,provider:r.source.provider||null}:null});
    try{await openPdfReferencePicker({onAdd:r=>{finish([pack(r)]);return ['exampool'];},onAddMany:list=>{finish(list.map(pack));return list.map(()=>'exampool');},onStatus:()=>{},onClose:()=>finish([]),bindClose:fn=>{closeLibrary=fn;},trigger:back});}
    catch(error){back.remove();open();done=true;send({action:'library-picked',items:[],error:error.message});}
  }
  async function pickFigure(m,send,options={}){
    services.commitActiveText?.();
    const page=()=>services.prepareLoadedProject(copy(services.serialize(state.get()))).active;
    // 그림 화면이 비어 있어도 막지 않는다(10-27): 캔버스로 나가 아트보드 가운데에 영역 상자를 띄우고, 그 자리에서 그리거나 붙여 넣게 한다.
    const first=page(),empty=!first.objects.length,A=state.get().artboard||{w:90,h:60};
    const blank=(art=A)=>{const w=Math.round((art||A).w*0.6),h=Math.round(w*0.75);return {x:-w/2,y:-h/2,w,h};};
    let bounds=copy(options.bounds||(empty?blank():getContentBounds({...state.get(),...first})));if(!bounds||bounds.w<=0||bounds.h<=0)bounds=blank();
    const {ExamRegionSurface}=await import('./rhwp-exam-picture-controls.js?v=1.7.0-four-session-integration');
    host.hidden=true;const app=document.querySelector('body>.app');syncAppLock();
    const canvasRect=()=>{const c=document.querySelector('#canvas');return c?.getScreenCTM()&&c;};
    const geometry=()=>{const c=canvasRect(),mx=c?.getScreenCTM();if(!mx)return null;const p=new DOMPoint(bounds.x,bounds.y).matrixTransform(mx);return {x:p.x,y:p.y,w:bounds.w*mx.a,h:bounds.h*mx.d};};
    const viewport=()=>{const r=document.querySelector('#canvas')?.getBoundingClientRect();return r&&{x:r.x,y:r.y,w:r.width,h:r.height};};
    const session=()=>({bounds,name:`5E_exam ${m.label||'그림'} 자리`,geometry,viewport});
    // 상자를 손으로 고치기 전에는 그림을 따라간다(10-28): 빈 캔버스에 나중에 그리거나 붙여 넣은 그림이 처음 상자보다 크면 잘렸고,
    // 다른 페이지 탭으로 바꿔도 상자가 처음 페이지 크기 그대로였다.
    let adjusted=!!options.bounds,fitFrame=0;
    const region=new ExamRegionSurface(document.body,{source:true,onChange:next=>{adjusted=true;bounds=copy(next);region.show(session());},onError:error=>say(error.message)});
    const refit=()=>{fitFrame=0;if(adjusted||!picking)return;const value=state.get(),objects=value.objects||[];
      const fit=objects.length?getContentBounds(value):null;const next=fit&&fit.w>0&&fit.h>0?fit:blank(value.artboard);
      if(JSON.stringify(next)!==JSON.stringify(bounds)){bounds=copy(next);region.show(session());}
      if(objects.length)region.root.querySelector('.exam-edit-badge')?.setAttribute('hidden','');};
    const stopFit=state.subscribe?.(()=>{if(!fitFrame)fitFrame=requestAnimationFrame(refit);});
    const say=text=>{const badge=region.root.querySelector('.exam-edit-badge');badge.hidden=false;badge.textContent=text;};
    region.root.classList.add('exampool-pick');
    const actions=region.heading.querySelector('.exam-region-actions');
    const button=(text,primary)=>{const b=document.createElement('button');b.type='button';b.textContent=text;if(primary)b.className='exam-primary';actions.append(b);return b;};
    const cancel=button(options.cancel||'취소'),apply=button(options.apply||'이 자리에 넣기',true);
    let raf=0;const follow=()=>{region.position();raf=requestAnimationFrame(follow);};
    let esc=null;
    const finish=()=>{stopFit?.();cancelAnimationFrame(fitFrame);cancelAnimationFrame(raf);region.hide();region.root.remove();picking=null;if(esc)document.removeEventListener('keydown',esc,true);host.hidden=false;syncAppLock();frame?.contentWindow?.focus?.();};
    return new Promise(resolve=>{
      picking={cancel:()=>{finish();send({action:'pick-cancelled'});resolve();}};
      cancel.onclick=()=>picking.cancel();
      apply.onclick=async()=>{apply.disabled=true;try{await captureFigure(m,send,copy(bounds));finish();resolve();}catch(error){apply.disabled=false;say(error.message);}};
      // 적용·취소로 끝나도 Esc 감시를 떼도록 finish에서 지운다(예전엔 쌓였다 — M6 덧붙임).
      esc=e=>{if(e.key==='Escape'&&picking){e.preventDefault();picking.cancel();}};document.addEventListener('keydown',esc,true);
      region.show(session());follow();
      if(empty)say('그림을 그리거나 붙여 넣으세요');
    });
  }
  // 문항 창 안에서 대화 창이 뜨면 바깥 5E 상태 줄·튜토리얼 말풍선도 같이 흐린다(문항 창 안쪽은 스스로 흐린다).
  if(!document.getElementById('exampool-modal-style')){const style=document.createElement('style');style.id='exampool-modal-style';style.textContent='html.exampool-modal .app-footer,html.exampool-modal .tut-pointout,html.exampool-modal .tut-pointout-ring{filter:blur(8px);pointer-events:none}';document.head.append(style);}
  entry.addEventListener('click',open);
  // 맨 위 줄 프로그램 전환(app-switch.js): 다른 프로그램으로 갈 때 출제 칸을 닫는다.
  window.addEventListener('5e:exampool-close',close);
  // 5E 라이브러리 창 「보내기 → 5E_exam 문항 카드로」: 문항 창을 열고(처음이면 다 읽힐 때까지 기다림) 「가져온 자료」로 넘긴다.
  // 1.7.1 B1ⓒ: Lite에서 받으면 예전엔 받았다고 표시한 뒤 열기가 막혀 자료가 말없이 사라졌다 — 받아 두고 안내, Pro로 바꾸면 이어서 넣는다.
  window.addEventListener('5e:exampool-receive',e=>{const items=e.detail?.items;if(!Array.isArray(items)||!items.length||entry.disabled)return;e.detail.accepted=true;
    const deliver=()=>setTimeout(async()=>{open();if(!frame)return;const until=Date.now()+30000;
      while(Date.now()<until){const doc=frame.contentDocument,bar=doc?.querySelector('#status');if(doc?.readyState==='complete'&&bar&&bar.textContent!=='준비 중')break;await new Promise(r=>setTimeout(r,100));}
      frame.contentWindow?.postMessage({channel:'5e-question-sheet',action:'library-picked',items,reveal:true},OWN);},0);
    if(!liteBlocked('5E_exam 문항 카드로 보내기',deliver))deliver();});
  // 11-05 시안 v13: 5E 라이브러리 「문항 카드로 / 시험지에 넣기」(기출 id) — 문항 창을 열고(처음이면 다 읽힐 때까지) 「변형」 줄로 넘긴다.
  // 11-20 「시험지 통째로 변환」: whole(시험 이름·번호순 문항·문항 그림)이 있으면 학평처럼 기출 id가 하나도 없어도 받는다(모두 그림 문항으로).
  window.addEventListener('5e:exampool-past',e=>{const ids=e.detail?.ids,whole=e.detail?.whole&&Array.isArray(e.detail.whole.rows)&&e.detail.whole.rows.length?e.detail.whole:null;if(!Array.isArray(ids)||(!ids.length&&!whole)||entry.disabled)return;e.detail.accepted=true;
    const deliver=()=>setTimeout(async()=>{open();if(!frame)return;const until=Date.now()+30000;
      while(Date.now()<until){const doc=frame.contentDocument,bar=doc?.querySelector('#status');if(doc?.readyState==='complete'&&bar&&bar.textContent!=='준비 중')break;await new Promise(r=>setTimeout(r,100));}
      frame.contentWindow?.postMessage({channel:'5e-question-sheet',action:'library-past',ids,toExam:!!e.detail.toExam,...(whole?{whole}:{})},OWN);},0);
    if(!liteBlocked(whole?'시험지 통째로 변환':e.detail.toExam?'시험지에 넣기':'5E_exam 문항 카드로 보내기',deliver))deliver();});
  // 11-14 시안 review-1114b 2번: 문항 카드 칸에서 연 AI 작업의 상태(도는 중·끝·실패)를 출제 칸에 알려 칸 위에 표시한다.
  // 카드 그림에서 AI 창을 연 원본 그림(라벨 크기를 원본 글자 높이로 맞출 때 씀). 열쇠 = 문항|칸.
  const cardRefs=new Map();window.addEventListener('5e:ai-open-reference',e=>{const c=e.detail?.hwpTarget?.examCard,src=e.detail?.reference?.dataUrl;if(c&&src){cardRefs.set(c.qid+'|'+c.key,src);if(cardRefs.size>40)cardRefs.delete(cardRefs.keys().next().value);}});
  window.addEventListener('5e:hwp-ai-task',e=>{const {taskId,workState,target}=e.detail||{},card=target?.examCard;if(!card||!taskId||!frame?.contentWindow)return;
    if(!['busy','completed','failed'].includes(workState))return;
    frame.contentWindow.postMessage({channel:'5e-question-sheet',action:'ai-job',qid:card.qid,key:card.key,taskId,state:workState,kind:target.kind==='graph'?'graph':'image',label:target.label||''},OWN);
    // 11-15(시안 flow-1115 A 결정 2): 프로그램이 뒤에 있을 때(다른 앱 사용 중) 끝나면 맥 알림도 — 누르면 5E를 앞으로.
    if(workState!=='busy'&&!document.hasFocus()&&typeof Notification==='function')try{const go=()=>{const n=new Notification(workState==='failed'?'5E · AI 그림 작업 실패':'5E · AI 그림 작업 끝',{body:`${target.label||'그림'} — 5E로 돌아와 결과를 확인하세요.`,silent:false});n.onclick=()=>{try{window.focus();}catch{}n.close();};};
      if(Notification.permission==='granted')go();else if(Notification.permission!=='denied')Notification.requestPermission().then(p=>{if(p==='granted')go();}).catch(()=>{});}catch{}});
  // 11-11: AI 창 「문항 카드에 넣기」 → 그 카드의 그림 자리로.
  window.addEventListener('5e:hwp-inplace-ai',async event=>{const d=event.detail,card=d?.target?.examCard;if(!card||!frame?.contentWindow)return;
    // 11-14 지적 19·20: 그래프 결과는 객체를 그림으로 그리고 그래프 원본을 품어 넣는다(칸을 열면 그래프 편집 창).
    if(d.graph){host.hidden=false;syncAppLock?.();
      try{const {graphFigure}=await import('./exampool-card-figure-edit.js?v=1.7.0-four-session-integration');const figure=await graphFigure(d.graph,d.name||'AI 그래프',{state,services});
        frame.contentWindow.postMessage({channel:'5e-question-sheet',action:'figure-ready',qid:card.qid,key:card.key,figure},OWN);}
      catch(error){frame.contentWindow.postMessage({channel:'5e-question-sheet',qid:card.qid,key:card.key,error:`그래프를 칸에 넣지 못했습니다: ${error.message||error} — AI 창의 「캔버스에 넣기」로 그래프를 고친 뒤 다시 넣어 보세요.`},OWN);}
      return;}
    if(!d.image?.data){frame.contentWindow.postMessage({channel:'5e-question-sheet',qid:card.qid,key:card.key,error:'넣을 결과 그림을 찾지 못했습니다. AI 창에서 결과를 다시 고른 뒤 넣으세요.'},OWN);return;}
    // 11-15(시안 flow-1115 C): 라벨 복원 결과면 그림 + 편집할 수 있는 라벨 객체(원본을 품은 그림)로 — 간이 편집기에서 라벨을 바로 고친다.
    if(d.labelPlan?.labels?.length){host.hidden=false;syncAppLock?.();
      try{const {labeledImageFigure}=await import('./exampool-card-figure-edit.js?v=1.7.0-four-session-integration');const figure=await labeledImageFigure(d,d.name||'AI 결과',{state,services,originalSrc:cardRefs.get(card.qid+'|'+card.key)||null});
        frame.contentWindow.postMessage({channel:'5e-question-sheet',action:'figure-ready',qid:card.qid,key:card.key,figure},OWN);return;}
      catch(error){console.warn('[5E_exam] 라벨 객체로 넣지 못해 그림으로 넣습니다',error);}}
    let {width,height}=d.image;if(!(width>0&&height>0)){try{const i=new Image();i.src=d.image.data;await i.decode();width=i.naturalWidth;height=i.naturalHeight;}catch{}}
    host.hidden=false;syncAppLock?.();
    frame.contentWindow.postMessage({channel:'5e-question-sheet',action:'figure-ready',qid:card.qid,key:card.key,figure:{name:d.name||'AI 결과',data:d.image.data,width,height}},OWN);});
  // 5E_image에서 자세히(정밀 편집): 원본을 5E 그림 화면에 열고 「5E_exam에 반영」으로 이 자리에 다시 넣는다.
  async function detailEdit(m,send){const source=m.figure?.editable?.source;if(!source)throw Error('이 그림에는 5E 원본이 없습니다.');const assetId=m.key.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80),linked=state.get().pages.find(p=>p.meta?.exampoolLink?.questionId===m.qid&&p.meta.exampoolLink.assetId===assetId);if(linked)services.switchPage(state,linked.id);else{const page=services.prepareLoadedProject(copy(source)).active;page.id='pool_'+crypto.randomUUID();page.meta={...page.meta,exampoolLink:{questionId:m.qid,assetId}};state.update(v=>v.pages.push(page));services.switchPage(state,page.id);}services.centerView();
        // 편집기에서 수정: 5E 그림 편집기로 넘어가 원본을 고친 뒤, 보낼 영역을 확인하고 '5E_exam에 반영'으로 그 자리에 다시 넣는다.
        await pickFigure(m,send,{bounds:m.figure?.editable?.render?.bounds,apply:'5E_exam에 반영',cancel:'돌아가기'});}
  // 11-22(결함 10·11): 5E 연결 화면(설치판: 「AI」 연결 정보·설치 안내/GPT 로그인, 웹: 로그인 창)을 연다. 시트는 iframe이라 이 본창에서 이벤트를 보낸다.
  // qid가 있으면 연결이 갖춰진 뒤 시트에 「같은 요청 다시」를 알린다(resumeAi). 여러 번 불려도 마지막 것만 이어 간다.
  let resumeSeq=0;
  function openConnection(qid){const seq=++resumeSeq;
    const resumeAi=qid?()=>{if(seq!==resumeSeq)return;frame?.contentWindow?.postMessage({channel:'5e-question-sheet',action:'author-resume',qid},OWN);}:null;
    window.dispatchEvent(new CustomEvent('5e:web-login-request',{detail:resumeAi?{resumeAi}:{}}));}
  window.addEventListener('message',async e=>{
    if((!FILE_MODE&&e.origin!==location.origin)||e.source!==frame?.contentWindow||e.data?.channel!=='5e-question-sheet')return;
    const m=e.data,send=result=>frame.contentWindow.postMessage({channel:'5e-question-sheet',qid:m.qid,key:m.key,requestId:m.requestId,...result},OWN);
    if(m.action==='modal'){document.documentElement.classList.toggle('exampool-modal',!!m.open&&!host.hidden);return;}
    if(m.action==='close'){fadeClose();return;}
    // 출제 대화: 시간이 오래 걸리므로 다른 전송 작업을 막지 않는다. 문항별 작업 범위로 따로 실행한다.
    // 11-22(결함 10·11): Codex 없음·로그인 없음이면 경고로 끝내지 않고 연결 화면(설치 안내·GPT 로그인)을 바로 열고, 연결되면 같은 요청을 다시 보낸다.
    if(m.action==='author'){authoring().then(h=>h.request(m.packet,{requestId:m.requestId,onProgress:progress=>send({action:'author-progress',progress})})).then(result=>send({action:'author-ready',result}),error=>{
      const need=error?.cancelled?'':connectionNeed(error);
      send({action:'author-ready',error:error?.cancelled?(error.message||String(error)):aiFail('exampool:author',error),cancelled:!!error?.cancelled,need});
      // 설치판은 연결 화면을 바로 연다. 웹판은 말풍선의 「연결 화면 열기」로 연다(로그인 창이 화면을 덮어 쓰던 카드를 가리지 않게).
      if(need&&window.fiveEDesktop&&!window.fiveEDesktop.web)openConnection(m.qid);});return;}
    if(m.action==='login'){openConnection(m.resume?m.qid:null);return;}
    // 11-11 사용자: 문항 카드 그림에서도 한글처럼 바로 AI 이미지 변환으로 — 결과는 「문항 카드에 넣기」로 그 그림 자리에 돌아온다.
    if(m.action==='ai-figure'){const f=m.figure;if(!f?.data){send({error:'변환할 그림이 없습니다.'});return;}
      window.dispatchEvent(new CustomEvent('5e:ai-open-reference',{detail:{reference:{dataUrl:f.data,name:m.label||'그림',sourceKind:'exam-figure'},conversionKind:m.kind==='graph'?'graph':'image',hwpTarget:{examCard:{qid:m.qid,key:m.key},label:m.label||'그림'}}}));return;}
    if(m.action==='author-cancel'){void authoring().then(h=>h.cancel(m.cancelId));return;}
    // 문항의 그림·그래프 만들기·그래프 세부 편집도 오래 걸리므로 전송 잠금 밖에서 실행한다.
    // 5E 라이브러리(공유 폴더·자료팩·기출 PDF)에서 고르기: 문항 창을 잠시 내리고 5E 라이브러리 선택기를 연다.
    if(m.action==='library-pick'){void pickFromLibrary(m,send);return;}
    if(m.action==='figure-create'){engines().then(e=>m.kind==='graph'?e.graph({qid:m.qid,description:m.description,prior:m.prior?.graph||null}):e.image({qid:m.qid,description:m.description,mustNot:m.mustNot||[],prior:m.prior?.data||null})).then(result=>send({action:'figure-made',result:{kind:m.kind,...result}}),error=>send({action:'figure-made',error:aiFail('exampool:figure-create',error)}));return;}
    if(m.action==='figure-edit-graph'){engines().then(e=>e.editGraph(m.graph)).then(result=>send({action:'figure-made',result:result?{kind:'graph',edited:true,...result}:null,cancelled:!result}),error=>send({action:'figure-made',error:aiFail('exampool:figure-edit-graph',error)}));return;}
    // 11-14(시안 review-1114 1-4·1-5): 카드 칸 그림 편집 — 그래프 객체면 그래프 창, 아니면 5E_hwp와 같은 「그림 편집 중」 창.
    // 11-14 지적 22: 클립보드의 그래프(객체)를 카드 칸에 넣은 뒤 — 그래프 원본을 품은 그림으로 바꿔 돌려준다.
    if(m.action==='ai-job-open'||m.action==='ai-job-send'){const ai=examWorkspace?.getAiPanel?.();
      Promise.resolve(!ai||!ai.hasHwpTask?.(m.taskId)?false:m.action==='ai-job-send'?ai.sendHwpTask?.(m.taskId):Promise.resolve(ai.openHwpTask(m.taskId)).then(()=>true)).then(ok=>{if(!ok)send({action:'ai-job-gone',taskId:m.taskId,error:'그 AI 작업 창이 이미 닫혔습니다 — 칸 그림을 두 번 눌러 AI를 다시 여세요.'});},error=>send({action:'ai-job-gone',taskId:m.taskId,error:error.message||String(error)}));return;}
    if(m.action==='graph-figure'){import('./exampool-card-figure-edit.js?v=1.7.0-four-session-integration').then(x=>x.graphFigure(m.graph,m.name,{state,services})).then(figure=>send({action:'figure-ready',figure}),error=>send({error:`그래프 원본을 붙이지 못했습니다(그림으로는 들어갔습니다): ${error.message||error}`}));return;}
    // 11-15(시안 material-1115 Q3): 카드 빈 자료 칸 「그래프」 — 빈 좌표 평면으로 그래프 편집 창, 적용하면 그 칸에 그래프 그림.
    if(m.action==='new-graph'){import('./exampool-card-figure-edit.js?v=1.7.0-four-session-integration').then(x=>x.newCardGraph(m,{send,state,services})).catch(err=>send({error:err.message||String(err)}));return;}
    if(m.action==='edit-figure'){import('./exampool-card-figure-edit.js?v=1.7.0-four-session-integration').then(x=>x.editCardFigure(m,{send,state,services,frame,onDetail:d=>{if(busy){send({error:'전송 작업을 마친 뒤 다시 시도하세요.'});return;}busy=true;detailEdit(d,send).catch(err=>send({error:err.message})).finally(()=>{busy=false;});}})).catch(err=>send({error:err.message||String(err)}));return;}
    if(busy){send({error:'전송 작업을 마친 뒤 다시 시도하세요.'});return;}busy=true;
    try {
      if(m.action==='exam-handoff'){
        await examWorkspace.receiveExamDocument(m.bytes,m.title);send({action:'exam-handoff-ready',requestId:m.requestId});fadeClose();return;
      }
      // AI 검토·대화: 검토 하네스가 window.fiveEReviewHarness.request(묶음)로 붙는다. 아직 없으면 알린다.
      if(m.action==='review'){
        const harness=window.fiveEReviewHarness;if(typeof harness?.request!=='function')throw Error('검토 하네스가 아직 연결되지 않았습니다. 하네스가 준비되면 이 자리에서 바로 검토합니다.');
        const result=await harness.request(m.packet);send({action:'review-ready',requestId:m.requestId,result});return;
      }
      if(m.action==='handoff'){
        const result=await examWorkspace.receiveStructuredQuestion(m.packet);
        send({action:'handoff-ready',requestId:m.requestId,warnings:result.warnings});fadeClose();return;
      }
      if(m.action==='capture'){await captureFigure(m,send);}
      if(m.action==='pick-figure'){await pickFigure(m,send);return;}
      if(m.action==='read-figure'){const figure=copy(m.figure),bytes=Uint8Array.from(atob(figure.data.split(',')[1]),c=>c.charCodeAt(0)),original=readEditablePng(bytes,services.prepareLoadedProject);if(original)figure.editable={...original,png:figure.data};send({action:'figure-ready',figure});}
      if(m.action==='edit-figure-detail'){await detailEdit(m,send);return;}
    }catch(error){send({error:aiFail('exampool:'+(m.action||'sheet'),error)});}finally{busy=false;}
  });
  if(new URLSearchParams(location.search).get('sheet')==='1')open();
  // 작업 화면이 뜬 뒤 한가할 때(2초 뒤) 출제 칸을 숨긴 채 미리 불러 둔다 — 처음 exam 전환이 바로 열리게.
  // 11-14 사용자: 「로딩을 조금 더 느리게 해서 미리 준비할 수 있는 건 다 준비」 — 시작 화면이 있으면 그 로딩에서 미리 연다(main.js). 없을 때만 예전처럼 2초 뒤.
  window.fiveEPrewarmExam=()=>{prewarm();const f=host?.querySelector('iframe');return new Promise(res=>{const t0=performance.now(),tick=()=>{const d=f?.contentDocument;if((d?.querySelector('.side [data-pool]')&&d.querySelector('#status')?.textContent!=='준비 중')||performance.now()-t0>20000)res();else setTimeout(tick,120);};tick();});};
  if(!navigator.webdriver&&!document.getElementById('start-screen'))setTimeout(()=>(window.requestIdleCallback||(f=>setTimeout(f,0)))(()=>prewarm()),2000);
  return {open,close,prewarm};
}
