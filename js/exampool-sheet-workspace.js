import {embedEditablePng,readEditablePng} from './editable-png.js?v=1.7.0-four-session-integration';
import {getContentBounds} from './svg-export.js?v=1.7.0-four-session-integration';
import {syncAppLock} from './app-lock.js?v=1.7.0-four-session-integration';
const copy=v=>structuredClone(v);
const asData=bytes=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return 'data:image/png;base64,'+btoa(s);};
let harnessPromise,enginesPromise;
const engines=()=>enginesPromise||=(window.fiveEFigureEngines?Promise.resolve(window.fiveEFigureEngines):import('./exampool-figure-engines.js?v=1.7.0-four-session-integration').then(x=>x.createFigureEngines()));
// 시험에서 대역 하네스를 넣을 수 있게 window.fiveEAuthoringHarness를 먼저 본다.
const authoring=()=>window.fiveEAuthoringHarness?Promise.resolve(window.fiveEAuthoringHarness):harnessPromise||=(import('./exampool-authoring-harness.js?v=1.7.0-four-session-integration').then(x=>x.createAuthoringHarness()));
export function initQuestionSheet(state,services,examWorkspace){
  // 5E_ExamPool 버튼(button-design.js가 만든 자리)이 문항 시트를 연다. 없으면 같은 자리에 만든다.
  let entry=document.getElementById('exam-pool-open');
  if(!entry){entry=document.createElement('button');entry.id='exam-pool-open';entry.type='button';entry.className='object-search-trigger';entry.textContent='5E_ExamPool';document.querySelector('.image-workflow-hub')?.append(entry);}
  entry.disabled=false;entry.title='5E_exam · 문항 만들기';
  let host,frame,focusReturn,busy=false;
  // 그림 고르기 중(「5E에서 잘라 넣기」)에 출제 칸을 다시 열면 고르기를 취소하고 연다 — 예전엔 고르기 상자가 가려지고 전송 잠금이 안 풀려
  // 「한글로 보내기」·그림 가져오기가 모두 막혔다(M6).
  function open(){if(picking){picking.cancel();return;}if(!host){host=document.createElement('section');host.id='exampool-sheet-workspace';host.setAttribute('aria-label','문항 시트');host.setAttribute('role','dialog');host.setAttribute('aria-modal','true');host.style.cssText='position:fixed;inset:0;z-index:1250;background:var(--ds-app);';frame=document.createElement('iframe');frame.setAttribute('aria-label','5E_exam 문항 시트');/* title이면 Safari가 화면 위에 말풍선으로 띄운다 */frame.src=new URL('../assets/exampool/sheet/index.html',import.meta.url).href+(new URLSearchParams(location.search).get('sheet-example')==='1'?'?example=1':'');frame.style.cssText='width:100%;height:100%;border:0;display:block;opacity:0;transition:opacity 200ms cubic-bezier(.2,0,0,1)';/* 첫 열기: 안 문서가 다 그려진 뒤 흐려졌다 또렷해지게(빈 칸 → 내용이 휙 뜨지 않게), 1.5초가 지나면 그냥 보인다 */frame.addEventListener('load',()=>{const start=performance.now(),show=()=>{if(frame.contentDocument?.querySelector('.side [data-pool]')||performance.now()-start>1500)frame.style.opacity='1';else requestAnimationFrame(show);};show();},{once:true});host.append(frame);document.body.append(host);}
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
  window.addEventListener('5e:exampool-receive',e=>{const items=e.detail?.items;if(!Array.isArray(items)||!items.length||entry.disabled)return;e.detail.accepted=true;
    setTimeout(async()=>{open();const until=Date.now()+30000;
      while(Date.now()<until){const doc=frame.contentDocument,bar=doc?.querySelector('#status');if(doc?.readyState==='complete'&&bar&&bar.textContent!=='준비 중')break;await new Promise(r=>setTimeout(r,100));}
      frame.contentWindow?.postMessage({channel:'5e-question-sheet',action:'library-picked',items,reveal:true},location.origin);},0);});
  window.addEventListener('message',async e=>{
    if(e.origin!==location.origin||e.source!==frame?.contentWindow||e.data?.channel!=='5e-question-sheet')return;
    const m=e.data,send=result=>frame.contentWindow.postMessage({channel:'5e-question-sheet',qid:m.qid,key:m.key,requestId:m.requestId,...result},location.origin);
    if(m.action==='modal'){document.documentElement.classList.toggle('exampool-modal',!!m.open&&!host.hidden);return;}
    if(m.action==='close'){fadeClose();return;}
    // 출제 대화: 시간이 오래 걸리므로 다른 전송 작업을 막지 않는다. 문항별 작업 범위로 따로 실행한다.
    if(m.action==='author'){authoring().then(h=>h.request(m.packet,{requestId:m.requestId,onProgress:progress=>send({action:'author-progress',progress})})).then(result=>send({action:'author-ready',result}),error=>send({action:'author-ready',error:error.message||String(error),cancelled:!!error.cancelled}));return;}
    if(m.action==='login'){window.dispatchEvent(new Event('5e:web-login-request'));return;}
    if(m.action==='author-cancel'){void authoring().then(h=>h.cancel(m.cancelId));return;}
    // 문항의 그림·그래프 만들기·그래프 세부 편집도 오래 걸리므로 전송 잠금 밖에서 실행한다.
    // 5E 라이브러리(공유 폴더·자료팩·기출 PDF)에서 고르기: 문항 창을 잠시 내리고 5E 라이브러리 선택기를 연다.
    if(m.action==='library-pick'){void pickFromLibrary(m,send);return;}
    if(m.action==='figure-create'){engines().then(e=>m.kind==='graph'?e.graph({qid:m.qid,description:m.description,prior:m.prior?.graph||null}):e.image({qid:m.qid,description:m.description,mustNot:m.mustNot||[],prior:m.prior?.data||null})).then(result=>send({action:'figure-made',result:{kind:m.kind,...result}}),error=>send({action:'figure-made',error:error.message||String(error)}));return;}
    if(m.action==='figure-edit-graph'){engines().then(e=>e.editGraph(m.graph)).then(result=>send({action:'figure-made',result:result?{kind:'graph',edited:true,...result}:null,cancelled:!result}),error=>send({action:'figure-made',error:error.message||String(error)}));return;}
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
      if(m.action==='edit-figure'){const source=m.figure?.editable?.source;if(!source)throw Error('이 그림에는 5E 원본이 없습니다.');const assetId=m.key.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80),linked=state.get().pages.find(p=>p.meta?.exampoolLink?.questionId===m.qid&&p.meta.exampoolLink.assetId===assetId);if(linked)services.switchPage(state,linked.id);else{const page=services.prepareLoadedProject(copy(source)).active;page.id='pool_'+crypto.randomUUID();page.meta={...page.meta,exampoolLink:{questionId:m.qid,assetId}};state.update(v=>v.pages.push(page));services.switchPage(state,page.id);}services.centerView();
        // 편집기에서 수정: 5E 그림 편집기로 넘어가 원본을 고친 뒤, 보낼 영역을 확인하고 '5E_exam에 반영'으로 그 자리에 다시 넣는다.
        await pickFigure(m,send,{bounds:m.figure?.editable?.render?.bounds,apply:'5E_exam에 반영',cancel:'돌아가기'});return;}
    }catch(error){send({error:error.message});}finally{busy=false;}
  });
  if(new URLSearchParams(location.search).get('sheet')==='1')open();
  return {open,close};
}
