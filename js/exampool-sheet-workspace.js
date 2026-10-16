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
  function close(){if(!host)return;host.hidden=true;const app=document.querySelector('body>.app');if(app)app.inert=!document.querySelector('#rhwp-exam-workspace')?.hidden||!document.querySelector('#exampool-workspace')?.hidden;focusReturn?.focus();}
  entry.addEventListener('click',open);
  window.addEventListener('message',async e=>{
    if(e.origin!==location.origin||e.source!==frame?.contentWindow||e.data?.channel!=='5e-question-sheet')return;
    const m=e.data,send=result=>frame.contentWindow.postMessage({channel:'5e-question-sheet',qid:m.qid,key:m.key,requestId:m.requestId,...result},location.origin);
    if(m.action==='close'){close();return;}if(busy){send({error:'전송 작업을 마친 뒤 다시 시도하세요.'});return;}busy=true;
    try {
      if(m.action==='handoff'){
        const result=await examWorkspace.receiveStructuredQuestion(m.packet);
        send({action:'handoff-ready',requestId:m.requestId,warnings:result.warnings});close();return;
      }
      if(m.action==='capture'){
        services.commitActiveText?.();const source=copy(services.serialize(state.get()));source.pages=source.pages.filter(p=>p.id===source.activePageId);const {active}=services.prepareLoadedProject(copy(source));if(!active.objects.length)throw Error('5E에서 그림을 만든 뒤 가져오세요.');const bounds=getContentBounds({...state.get(),...active});if(!bounds||bounds.w<=0||bounds.h<=0||(bounds.w/25.4*300)*(bounds.h/25.4*300)>40000000)throw Error('그림 영역을 줄인 뒤 가져오세요.');
        const assetId=m.key.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80),id=crypto.randomUUID(),name=active.name.slice(0,200);source.pages[0].meta={...source.pages[0].meta,exampoolLink:{questionId:m.qid,assetId}};await services.ensureEmbeddedFonts();const render={bounds,options:{includeReferenceImages:true,excludeAllImages:false}},result=await services.rasterizeExportCanvas({...state.get(),...active},{dpi:300,...render}),blob=await new Promise((resolve,reject)=>result.canvas.toBlob(b=>b?resolve(b):reject(Error('그림을 가져오지 못했습니다.')),'image/png'));
        const png=asData(embedEditablePng(new Uint8Array(services.insertPngPhys(await blob.arrayBuffer(),300)),{id,name,version:1,source,render,link:{tabId:m.qid,assetId}},services.prepareLoadedProject));if(png.length>8*1024*1024)throw Error('엑셀에 보관할 그림은 5 MB 이하로 줄여주세요.');send({action:'figure-ready',figure:{name,data:png,editable:{id,name,png,source,render,capturedAt:new Date().toISOString(),widthMm:result.widthMm,heightMm:result.heightMm,pixelWidth:result.canvas.width,pixelHeight:result.canvas.height}}});
        state.update(v=>{const page=v.pages.find(p=>p.id===source.activePageId);if(page)page.meta={...page.meta,exampoolLink:{questionId:m.qid,assetId}};});
      }
      if(m.action==='read-figure'){const figure=copy(m.figure),bytes=Uint8Array.from(atob(figure.data.split(',')[1]),c=>c.charCodeAt(0)),original=readEditablePng(bytes,services.prepareLoadedProject);if(original)figure.editable={...original,png:figure.data};send({action:'figure-ready',figure});}
      if(m.action==='edit-figure'){const source=m.figure?.editable?.source;if(!source)throw Error('이 그림에는 5E 원본이 없습니다.');const assetId=m.key.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80),linked=state.get().pages.find(p=>p.meta?.exampoolLink?.questionId===m.qid&&p.meta.exampoolLink.assetId===assetId);if(linked)services.switchPage(state,linked.id);else{const page=services.prepareLoadedProject(copy(source)).active;page.id='pool_'+crypto.randomUUID();page.meta={...page.meta,exampoolLink:{questionId:m.qid,assetId}};state.update(v=>v.pages.push(page));services.switchPage(state,page.id);}close();services.centerView();}
    }catch(error){send({error:error.message});}finally{busy=false;}
  });
  if(new URLSearchParams(location.search).get('sheet')==='1')open();
  return {open,close};
}
