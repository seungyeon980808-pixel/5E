import {embedEditablePng,readEditablePng} from './editable-png.js?v=1.7.0-four-session-integration';
import {getContentBounds} from './svg-export.js?v=1.7.0-four-session-integration';
const copy=v=>structuredClone(v);
const asData=bytes=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return 'data:image/png;base64,'+btoa(s);};
export function initQuestionSheet(state,services,examWorkspace){
  // 5E_ExamPool 버튼(button-design.js가 만든 자리)이 문항 시트를 연다. 없으면 같은 자리에 만든다.
  let entry=document.getElementById('exam-pool-open');
  if(!entry){entry=document.createElement('button');entry.id='exam-pool-open';entry.type='button';entry.className='object-search-trigger';entry.textContent='5E_ExamPool';document.querySelector('.image-workflow-hub')?.append(entry);}
  entry.disabled=false;entry.title='5E_ExamPool · 엑셀과 한글로 문항 만들기';
  let host,frame,focusReturn,busy=false;
  function open(){if(!host){host=document.createElement('section');host.id='exampool-sheet-workspace';host.setAttribute('aria-label','문항 시트');host.setAttribute('role','dialog');host.setAttribute('aria-modal','true');host.style.cssText='position:fixed;inset:0;z-index:1250;background:var(--ds-app);';frame=document.createElement('iframe');frame.title='ExamPool 문항 시트';frame.src='/assets/exampool/sheet/index.html'+(new URLSearchParams(location.search).get('sheet-example')==='1'?'?example=1':'');frame.style.cssText='width:100%;height:100%;border:0;display:block';host.append(frame);document.body.append(host);}
    focusReturn=document.activeElement;host.hidden=false;host.style.bottom=(document.querySelector('.app-footer')?.getBoundingClientRect().height||24)+'px';const app=document.querySelector('body>.app');if(app)app.inert=true;}
  function close(){if(!host)return;host.hidden=true;document.documentElement.classList.remove('exampool-modal');const app=document.querySelector('body>.app');if(app)app.inert=!document.querySelector('#rhwp-exam-workspace')?.hidden||!document.querySelector('#exampool-workspace')?.hidden;focusReturn?.focus();}
  // 5E 그림을 ExamPool 문항의 그림 칸으로 보낸다. region(mm)이 있으면 그 영역만, 없으면 그림 전체.
  async function captureFigure(m,send,region=null){
        services.commitActiveText?.();const source=copy(services.serialize(state.get()));source.pages=source.pages.filter(p=>p.id===source.activePageId);const {active}=services.prepareLoadedProject(copy(source));if(!active.objects.length)throw Error('5E에서 그림을 만든 뒤 가져오세요.');const bounds=region||getContentBounds({...state.get(),...active});if(!bounds||bounds.w<=0||bounds.h<=0||(bounds.w/25.4*300)*(bounds.h/25.4*300)>40000000)throw Error('그림 영역을 줄인 뒤 가져오세요.');
        const assetId=m.key.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80),id=crypto.randomUUID(),name=active.name.slice(0,200);source.pages[0].meta={...source.pages[0].meta,exampoolLink:{questionId:m.qid,assetId}};await services.ensureEmbeddedFonts();const render={bounds,options:{includeReferenceImages:true,excludeAllImages:false}},result=await services.rasterizeExportCanvas({...state.get(),...active},{dpi:300,...render}),blob=await new Promise((resolve,reject)=>result.canvas.toBlob(b=>b?resolve(b):reject(Error('그림을 가져오지 못했습니다.')),'image/png'));
        const png=asData(embedEditablePng(new Uint8Array(services.insertPngPhys(await blob.arrayBuffer(),300)),{id,name,version:1,source,render,link:{tabId:m.qid,assetId}},services.prepareLoadedProject));if(png.length>8*1024*1024)throw Error('엑셀에 보관할 그림은 5 MB 이하로 줄여주세요.');send({action:'figure-ready',figure:{name,data:png,editable:{id,name,png,source,render,capturedAt:new Date().toISOString(),widthMm:result.widthMm,heightMm:result.heightMm,pixelWidth:result.canvas.width,pixelHeight:result.canvas.height}}});
        state.update(v=>{const page=v.pages.find(p=>p.id===source.activePageId);if(page)page.meta={...page.meta,exampoolLink:{questionId:m.qid,assetId}};});
      
  }
  // 그림 자리 더블클릭 → 5E 그림 화면에서 보낼 영역을 손잡이로 정하고 '이 자리에 넣기'. 문항 창은 잠시 숨긴다.
  let picking=null;
  async function pickFigure(m,send,options={}){
    services.commitActiveText?.();
    const page=()=>services.prepareLoadedProject(copy(services.serialize(state.get()))).active;
    const first=page();if(!first.objects.length){send({error:'5E 그림 화면에서 그림을 만든 뒤 다시 더블클릭하세요.'});return;}
    let bounds=copy(options.bounds||getContentBounds({...state.get(),...first}));if(!bounds||bounds.w<=0||bounds.h<=0){send({error:'5E 그림의 영역을 찾지 못했습니다.'});return;}
    const {ExamRegionSurface}=await import('./rhwp-exam-picture-controls.js?v=1.7.0-four-session-integration');
    host.hidden=true;const app=document.querySelector('body>.app');if(app)app.inert=false;
    const canvasRect=()=>{const c=document.querySelector('#canvas');return c?.getScreenCTM()&&c;};
    const geometry=()=>{const c=canvasRect(),mx=c?.getScreenCTM();if(!mx)return null;const p=new DOMPoint(bounds.x,bounds.y).matrixTransform(mx);return {x:p.x,y:p.y,w:bounds.w*mx.a,h:bounds.h*mx.d};};
    const viewport=()=>{const r=document.querySelector('#canvas')?.getBoundingClientRect();return r&&{x:r.x,y:r.y,w:r.width,h:r.height};};
    const session=()=>({bounds,name:`ExamPool ${m.label||'그림'} 자리`,geometry,viewport});
    const region=new ExamRegionSurface(document.body,{source:true,onChange:next=>{bounds=copy(next);region.show(session());},onError:error=>say(error.message)});
    const say=text=>{const badge=region.root.querySelector('.exam-edit-badge');badge.hidden=false;badge.textContent=text;};
    region.root.classList.add('exampool-pick');
    const actions=region.heading.querySelector('.exam-region-actions');
    const button=(text,primary)=>{const b=document.createElement('button');b.type='button';b.textContent=text;if(primary)b.className='exam-primary';actions.append(b);return b;};
    const cancel=button(options.cancel||'취소'),apply=button(options.apply||'이 자리에 넣기',true);
    let raf=0;const follow=()=>{region.position();raf=requestAnimationFrame(follow);};
    const finish=()=>{cancelAnimationFrame(raf);region.hide();region.root.remove();picking=null;host.hidden=false;if(app)app.inert=true;frame?.contentWindow?.focus?.();};
    return new Promise(resolve=>{
      picking={cancel:()=>{finish();send({action:'pick-cancelled'});resolve();}};
      cancel.onclick=()=>picking.cancel();
      apply.onclick=async()=>{apply.disabled=true;try{await captureFigure(m,send,copy(bounds));finish();resolve();}catch(error){apply.disabled=false;say(error.message);}};
      document.addEventListener('keydown',function esc(e){if(e.key==='Escape'&&picking){e.preventDefault();document.removeEventListener('keydown',esc,true);picking.cancel();}},true);
      region.show(session());follow();
    });
  }
  // 문항 창 안에서 대화 창이 뜨면 바깥 5E 상태 줄·튜토리얼 말풍선도 같이 흐린다(문항 창 안쪽은 스스로 흐린다).
  if(!document.getElementById('exampool-modal-style')){const style=document.createElement('style');style.id='exampool-modal-style';style.textContent='html.exampool-modal .app-footer,html.exampool-modal .tut-pointout,html.exampool-modal .tut-pointout-ring{filter:blur(8px);pointer-events:none}';document.head.append(style);}
  entry.addEventListener('click',open);
  window.addEventListener('message',async e=>{
    if(e.origin!==location.origin||e.source!==frame?.contentWindow||e.data?.channel!=='5e-question-sheet')return;
    const m=e.data,send=result=>frame.contentWindow.postMessage({channel:'5e-question-sheet',qid:m.qid,key:m.key,requestId:m.requestId,...result},location.origin);
    if(m.action==='modal'){document.documentElement.classList.toggle('exampool-modal',!!m.open&&!host.hidden);return;}
    if(m.action==='close'){close();return;}if(busy){send({error:'전송 작업을 마친 뒤 다시 시도하세요.'});return;}busy=true;
    try {
      if(m.action==='exam-handoff'){
        await examWorkspace.receiveExamDocument(m.bytes,m.title);send({action:'exam-handoff-ready',requestId:m.requestId});close();return;
      }
      // AI 검토·대화: 검토 하네스가 window.fiveEReviewHarness.request(묶음)로 붙는다. 아직 없으면 알린다.
      if(m.action==='review'){
        const harness=window.fiveEReviewHarness;if(typeof harness?.request!=='function')throw Error('검토 하네스가 아직 연결되지 않았습니다. 하네스가 준비되면 이 자리에서 바로 검토합니다.');
        const result=await harness.request(m.packet);send({action:'review-ready',requestId:m.requestId,result});return;
      }
      if(m.action==='handoff'){
        const result=await examWorkspace.receiveStructuredQuestion(m.packet);
        send({action:'handoff-ready',requestId:m.requestId,warnings:result.warnings});close();return;
      }
      if(m.action==='capture'){await captureFigure(m,send);}
      if(m.action==='pick-figure'){await pickFigure(m,send);return;}
      if(m.action==='read-figure'){const figure=copy(m.figure),bytes=Uint8Array.from(atob(figure.data.split(',')[1]),c=>c.charCodeAt(0)),original=readEditablePng(bytes,services.prepareLoadedProject);if(original)figure.editable={...original,png:figure.data};send({action:'figure-ready',figure});}
      if(m.action==='edit-figure'){const source=m.figure?.editable?.source;if(!source)throw Error('이 그림에는 5E 원본이 없습니다.');const assetId=m.key.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80),linked=state.get().pages.find(p=>p.meta?.exampoolLink?.questionId===m.qid&&p.meta.exampoolLink.assetId===assetId);if(linked)services.switchPage(state,linked.id);else{const page=services.prepareLoadedProject(copy(source)).active;page.id='pool_'+crypto.randomUUID();page.meta={...page.meta,exampoolLink:{questionId:m.qid,assetId}};state.update(v=>v.pages.push(page));services.switchPage(state,page.id);}services.centerView();
        // 편집기에서 수정: 5E 그림 편집기로 넘어가 원본을 고친 뒤, 보낼 영역을 확인하고 'ExamPool에 반영'으로 그 자리에 다시 넣는다.
        await pickFigure(m,send,{bounds:m.figure?.editable?.render?.bounds,apply:'ExamPool에 반영',cancel:'돌아가기'});return;}
    }catch(error){send({error:error.message});}finally{busy=false;}
  });
  if(new URLSearchParams(location.search).get('sheet')==='1')open();
  return {open,close};
}
