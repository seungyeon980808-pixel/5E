import {FORMAT,WORKFLOWS,TYPES,PRESETS,STYLES,KINDS,targetDisplay,uid,clone,copyTree,block,newQuestion,applyPreset,parentOptions,tableCovered,cellValue,mergeCells,migrate,fromLegacy,validate,duplicateQuestion} from './model.js';
import {workflowOf,questionTitle,questionSubtitle,TITLES,previewHtml,columnPreview} from './views.js';
import {renderNav,renderExams,renderExam} from './pool-views.js';
import {applyFrame,goalOf,frameOf,frameKey,openRegister,openNewExam,openFramePicker} from './exam-flow.js';
import {placeState,checkMarkup} from './exam-place.js';
import {examPlan} from './exam-layout.js';
import {pickState,renderStep2,fillStep2,refreshCart,poolEntries,editMeta,normTag,tagPopMarkup,menuMarkup} from './exam-pick.js';
import {renderLibraryView,installLibraryView,closeViewer,libState,past as pastData,loadPast} from './library-view.js';
import {createCardEditor,clearPastBusy} from './card-editor.js';
import {busyHtml,pastBusyHtml,store as cardStore} from './card-shared.js';
import {newExam,examById,examOf,libraryQuestions,addToExam,removeFromExam,moveInExam,dropBeforeIndex,renumberExam} from './exams.js';
import {applyTextEdit} from './text-sync.js';
import {loadImage} from './image-load.js';
import {exportExcel,importExcel,keepAppOnly} from './excel.js';
import {handoffQuestion} from './handoff.js';
import {createSheetGrid} from './grid.js';
import {applyGridValues,columnName} from './grid-model.js';
import {ROWS,fieldValue,writeField,applyVerticalValues} from './vertical.js';
import {ensureAuthoring,syncRevision,restoreRevision,makeRequest,classifyResponse,storeProposal,applyProposal,rejectProposal,proposalChanges,recordReview,recordConversation,previewStructure,labelOf} from '../authoring/session.js';
import {AXIS_LABEL} from '../authoring/schema.js';
import {reviewVersion} from '../authoring/review-version.js';
import {questionFromShape} from './templates.js';
import {createNewQuestionDialog} from './new-question.js';
import {validateStandard,standardFor,copyStandard,KICE_STANDARD,KICE_ID,exportStandard as exportStandardText,importStandard} from './typeset-standard.js';
import {createTypesetter} from './typeset.js?v=1018-card';
import {renderParts,applyPartChange,movePart} from './parts-view.js';
import {loadStandards} from './standards-data.js';
let grid=null,future=[];
let handoffRequest=null;
import {createPdfRuntimeLoader} from '../../../js/pdf-library/runtime-loader.js?v=1.7.0-four-session-integration';
const $=s=>document.querySelector(s),E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),labels=['①','②','③','④','⑤'];
const options=(values,value)=>values.map(v=>`<option ${v===value?'selected':''}>${E(v)}</option>`).join('');
const demo=new URLSearchParams(location.search).has('example'),embedded=window.parent!==window;
// 5E 안에서 열리면 5E 아래 막대를 덮으므로, 이 상태 줄 오른쪽에 5E 버전과 「문제 신고」를 같이 둔다.
if(embedded)try{const v=window.parent.document.querySelector('[data-release-version]')?.textContent.trim();const n=document.getElementById('host-version');if(v&&n){n.textContent='5E '+v;n.hidden=false;}document.getElementById('host-bug').hidden=false;}catch{}
if(demo){$('.brand-page').hidden=false;$('.brand-page').textContent='구조 예제';$('.brand-page').title='실제 문항과 별도 공간에 저장하는 편집 연습 예제입니다.';}
if(embedded)$('[data-change-summary]').hidden=true;
// 공개 프리뷰(/preview/…)는 정식 사이트와 같은 원점이라 저장소 이름에 '5e.preview:'를 붙여 분리한다(js/preview-storage.js channelStore와 같은 규칙).
// 루트(로컬 실행)는 지금까지 쓰던 이름 그대로 — 사용자가 로컬에 만든 문항이 그대로 보인다.
const CHANNEL=/^\/preview(?:\/|$)/.test(location.pathname)?'5e.preview:':'';
let database=null,revision=0,saveQueue=Promise.resolve(),saveStamp=0,saveBlocked=false,history=[],editKey='',cellNode=null,pending=null,imageTarget=null,selection=null,activeTab='composition',sourceTab='standards',sourceTarget='question',doc=null,page=1,sourceSeq=0,selectedStandard=null;
let data={format:FORMAT,questions:[],documents:[],exams:[]},current=null,standards=null;
// 아래 상태 막대. 빨간 글(오류)은 6초 뒤 지운다 — 그 사이 다른 문장이 오면 그 문장을 둔다.
let statusTimer=0;
// 오래 걸리는 일의 진행 표시: '…'로 끝나는 진행 문장(자동 저장 「저장 중…」 제외)이 오면 방금 누른 단추를
// 폭 그대로 고리로 바꾸고 상태 막대 앞에도 고리를 단다. 끝·실패 문장이 오면(또는 1분 뒤) 원래대로 돌린다.
let pressed=null,pressedAt=0,busyButton=null,busyTimer=0;
for(const type of ['pointerdown','keydown'])document.addEventListener(type,e=>{if(type==='keydown'&&e.key!=='Enter'&&e.key!==' ')return;const b=e.target.closest?.('button,label[for]');if(b){pressed=b;pressedAt=performance.now();}},true);
function releaseBusy(){clearTimeout(busyTimer);if(!busyButton)return;const b=busyButton;busyButton=null;if(b.dataset.busyLabel!==undefined){b.innerHTML=b.dataset.busyLabel;delete b.dataset.busyLabel;}b.removeAttribute('aria-busy');b.style.minWidth='';}
function markBusy(message){
  const busy=/…$/.test(message)&&message!=='저장 중…';$('#status').dataset.busy=String(busy);
  if(!busy){releaseBusy();return;}
  const b=pressed&&performance.now()-pressedAt<1500&&pressed.isConnected?pressed:null;
  if(!b||b===busyButton||b.hasAttribute('aria-busy'))return;
  releaseBusy();busyButton=b;b.style.minWidth=b.offsetWidth+'px';b.dataset.busyLabel=b.innerHTML;b.setAttribute('aria-busy','true');b.innerHTML=busyHtml(message.replace(/…$/,''));
  busyTimer=setTimeout(releaseBusy,60000);}
// 끝·실패 알림 카드(오른쪽 아래, 5E 「AI 완료」 알림과 같은 자리·모양): 진행 표시가 끝났을 때와 오류일 때 띄운다.
// 끝은 4초, 실패는 7초 뒤 사라진다. 카드는 누르기를 막지 않는다(밑의 단추를 그대로 누를 수 있게). 아래 상태 줄 문장은 그대로 남긴다.
let noticeTimer=0;
function notice(message,error=false){
  let n=document.getElementById('ep-notice');
  if(!n){n=document.createElement('div');n.id='ep-notice';n.setAttribute('role','status');n.setAttribute('aria-live','polite');n.innerHTML='<i aria-hidden="true"></i><p></p>';document.body.append(n);}
  clearTimeout(noticeTimer);n.dataset.error=String(error);n.querySelector('i').textContent=error?'!':'✓';n.querySelector('p').textContent=message;n.hidden=false;n.classList.remove('in');void n.offsetWidth;n.classList.add('in');
  noticeTimer=setTimeout(()=>{n.hidden=true;},error?7000:4000);}
let lastProgress=false;
function status(message,error=false,{keep=false}={}){clearTimeout(statusTimer);const progress=/…$/.test(message)&&message!=='저장 중…',finishing=lastProgress&&!progress&&!/^저장됨/.test(message);lastProgress=progress;$('#status').textContent=message;$('#status').dataset.error=String(error);markBusy(error?'':message);
  if(error||finishing)notice(message,error);
  if(error&&!keep)statusTimer=setTimeout(()=>{if($('#status').textContent!==message)return;$('#status').textContent='';$('#status').dataset.error='false';},6000);}
// 자료 열람 상태 문장: 라이브러리 칸에 붙어 있을 때는 칸 안 줄 대신 아래 상태 막대로 보낸다(오류는 빨간 글).
function sourceSay(message,error=false){$('#source-status').textContent=message;if($('#sources').classList.contains('docked'))status(message,error);}
function checkpoint(key=''){future=[];if(key&&editKey===key)return;history.push(copyTree(data));if(history.length>10)history.shift();editKey=key;$('#undo').disabled=false;$('#redo').disabled=true;}
// validated: 방금 validate(data)를 통과한 경우(mutate·불러오기) 다시 검사하지 않는다(문항이 많으면 입력마다 수십 ms).
function remember({validated=false}={}){
  if(!validated)try{validate(data);}catch(e){status(e.message,true);return;}
  // 저장은 입력이 멈춘 뒤 0.3초에 한 번(클릭·입력하는 순간 문항 전체를 저장소에 쓰느라 화면이 멈추지 않게). 창을 닫으면 바로 저장.
  if($('#status').dataset.error!=='true')status('저장 중…');clearTimeout(saveTimer);saveTimer=setTimeout(flushSave,300);}// 빨간 오류 안내는 저장 안내가 덮지 않는다
// 창을 닫거나 새로고침하면 보통 저장(IndexedDB)은 끝나지 못해 닫기 직전 0.3초의 입력이 사라졌다(M14, 크롬·사파리 모두 재현.
// 닫는 순간 연 IndexedDB 쓰기도 커밋되지 않는다). 닫을 때는 바로 써지는 localStorage에 아직 저장 안 된 문항만 남기고,
// 다음에 열 때 그 사이 다른 창이 저장하지 않았으면(판 번호가 그대로면) 이어 받는다. 4 MB를 넘으면(그림이 큰 문항) 남기지 않는다.
const UNLOAD_KEY=CHANNEL+'5e-exampool-unload';let dirtyIds=new Set(),dirtyAll=false;
function markDirty(only){if(only)dirtyIds.add(only.id);else dirtyAll=true;}
let saveTimer=0;window.addEventListener('pagehide',()=>{if(!saveTimer)return;clearTimeout(saveTimer);
  if(!saveBlocked&&!demo)try{const json=JSON.stringify({base:revision,at:Date.now(),...(dirtyAll?{all:data}:{questions:data.questions.filter(q=>dirtyIds.has(q.id))})});
    if(json.length<4e6)localStorage.setItem(UNLOAD_KEY,json);}catch{}
  flushSave({now:true});});
function flushSave({now=false}={}){saveTimer=0;
  const stamp=++saveStamp,run=()=>new Promise((resolve,reject)=>{
    if(stamp!==saveStamp){resolve();return;}
    if(!database||saveBlocked){reject(Error('자동 저장을 사용할 수 없습니다. 엑셀로 내려받아 보관하세요.'));return;}
    // 다른 창 저장 확인은 작은 판 번호('rev')만 읽는다(예전엔 저장마다 문항 전체(그림 포함 수십 MB)를 읽어 풀었다). 'rev'가 없는 예전 저장은 문항에서 읽는다.
    // 넣을 때 복제하지 않고 지금 데이터를 바로 넣는다(put이 그 자리에서 복사한다).
    const tx=database.transaction('state','readwrite'),store=tx.objectStore('state'),r=store.get('rev');let failure;
    const write=stored=>{if((stored||0)!==revision){failure=Error('다른 창에서 수정했습니다. 이 창의 입력은 엑셀로 내려받아 보관하고 다시 열어주세요.');saveBlocked=true;tx.abort();return;}store.put({...data,_revision:revision+1},'draft');store.put(revision+1,'rev');};
    r.onsuccess=()=>{if(r.result!==undefined){write(r.result);return;}const d=store.get('draft');d.onsuccess=()=>write(d.result?._revision);};
    tx.oncomplete=()=>{revision++;if(stamp===saveStamp&&!saveTimer){dirtyIds.clear();dirtyAll=false;}resolve();};tx.onerror=tx.onabort=()=>reject(failure||tx.error||Error('저장 공간이 부족합니다. 엑셀로 내려받아 보관하세요.'));
  });
  if(now){const direct=run();saveQueue=saveQueue.then(()=>direct,()=>direct);}else saveQueue=saveQueue.catch(()=>{}).then(run);
  void saveQueue.then(()=>{if(stamp===saveStamp&&$('#status').dataset.error!=='true')status('저장됨 · '+new Date().toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'}));}).catch(e=>status(e.message,true));
}
function mutate(fn,{render=true,key=''}={}){const only=key.startsWith('card:')?current:null;// 카드 입력은 그 문항만 바뀐다 → 그 문항만 검사
  const selectedId=current?.id,historyBefore=history.slice(),added=!key||editKey!==key,before=added?null:only&&data.questions.includes(only)?{i:data.questions.indexOf(only),q:clone(only)}:copyTree(data),redoBefore=future;try{checkpoint(key);const completed=completeKeys(only&&data.questions.includes(only)?only:null);fn();markDirty(only&&data.questions.includes(only)?only:null);demoteEdited(completed);validate(data,{only:only&&data.questions.includes(only)?only:null});if(render)renderAll();else queueSync();remember({validated:true});queueAuthoringSync();return true;}catch(e){const rollback=added?history.pop():before;if(rollback?.q){data.questions[rollback.i]=rollback.q;current=data.questions.find(q=>q.id===selectedId)||data.questions[0]||null;}else if(rollback){data=rollback;current=data.questions.find(q=>q.id===selectedId)||data.questions[0]||null;}future=redoBefore;history=historyBefore;$('#undo').disabled=!history.length;$('#redo').disabled=!future.length;editKey='';if(render)renderAll();status(e.message,true);return false;}}
let typesetStandards=[],typesetForms=[];
// 시험지 양식(학교 양식 파일 그대로): {id,name,fileName,encrypted,bytes,structure,standardId,createdAt}. 같은 state 저장소 'typesetForms' 칸.
async function saveTypesetForms(list){typesetForms=list;await new Promise((resolve,reject)=>{const t=database.transaction('state','readwrite');t.objectStore('state').put(typesetForms,'typesetForms');t.oncomplete=resolve;t.onerror=()=>reject(t.error);});return typesetForms;}
// 조판 기준 저장(성취기준 standards와 다른 것): 수능 틀은 내장이라 저장하지 않는다.
async function saveTypesetStandards(list){typesetStandards=list.filter(s=>s.id!=='kice').map(s=>{validateStandard(s);return s;});
  await new Promise((resolve,reject)=>{const t=database.transaction('state','readwrite');t.objectStore('state').put(typesetStandards,'typesetStandards');t.oncomplete=resolve;t.onerror=()=>reject(t.error);});return typesetStandards;}
async function boot(){try{
  database=await new Promise((resolve,reject)=>{const r=indexedDB.open(CHANNEL+(demo?'5e-exampool-structure-demo':'5e-exampool-structure'),2);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('state'))r.result.createObjectStore('state');if(!r.result.objectStoreNames.contains('backups'))r.result.createObjectStore('backups');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('다른 문항 창을 닫고 다시 열어주세요.'));});
  // 조판 기준 목록(10-22): 새 저장소를 만들면 DB 판을 올려야 하고 열린 다른 창이 막히므로, 같은 state 저장소의 'typesetStandards' 칸에 둔다.
  try{typesetStandards=(await new Promise((resolve,reject)=>{const r=database.transaction('state').objectStore('state').get('typesetStandards');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);})||[]).filter(s=>{try{return validateStandard(s);}catch{return false;}});}catch{typesetStandards=[];}
  // 저장소 계속 보관 요청(10-22): 브라우저가 오래 안 쓴 사이트 자료(문항·양식)를 지우지 않게. 거절돼도 그대로 쓴다.
  try{navigator.storage?.persist?.().catch(()=>{});}catch{}
  try{typesetForms=(await new Promise((resolve,reject)=>{const r=database.transaction('state').objectStore('state').get('typesetForms');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);})||[]).filter(f=>f&&f.id&&f.bytes);}catch{typesetForms=[];}
  let raw=await new Promise((resolve,reject)=>{const r=database.transaction('state').objectStore('state').get('draft');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}),copied=false;
  if(!raw&&!demo){
    const available=await indexedDB.databases?.()||[];
    if(available.some(d=>d.name===CHANNEL+'5e-exampool-sheet-concept')){const oldDB=await new Promise((resolve,reject)=>{const r=indexedDB.open(CHANNEL+'5e-exampool-sheet-concept');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{raw=await new Promise((resolve,reject)=>{const r=oldDB.transaction('state').objectStore('state').get('draft');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});copied=!!raw;}finally{oldDB.close();}}
    if(!raw&&available.some(d=>d.name===CHANNEL+'5e-exampool')){const {listQuestions,listResources}=await import('../../../js/exampool-store.js?v=1013-exampool'),qs=await listQuestions(),docs=await listResources();if(qs.length){raw={format:FORMAT,questions:qs.map(fromLegacy),documents:docs.map(d=>({id:d.id,name:d.title,kind:d.kind==='교과서'?'textbooks':'references',mime:d.mime,data:`data:${d.mime};base64,${d.base64}`,pages:d.pages}))};copied=true;}}
  }
  // 닫기 직전에 남긴 내용(M14). 그 뒤로 저장된 적이 없을 때만(판 번호가 같을 때만) 이어 받는다.
  let resumed=false;if(!demo){let unload=null;try{unload=JSON.parse(localStorage.getItem(UNLOAD_KEY)||'null');localStorage.removeItem(UNLOAD_KEY);}catch{}
    if(unload&&!copied&&unload.base===(raw?._revision||0)){
      if(unload.all?.format)raw={...unload.all,_revision:raw?._revision||0};
      else if(raw&&Array.isArray(unload.questions)&&unload.questions.length){const byId=new Map(unload.questions.map(q=>[q.id,q]));raw={...raw,questions:raw.questions.map(q=>byId.get(q.id)||q)};}
      resumed=raw!==null&&raw!==undefined;}}
  if(raw){revision=copied?0:raw._revision||0;data=migrate(raw);if(resumed)remember();if(copied||raw.format!==FORMAT){await new Promise((resolve,reject)=>{const tx=database.transaction('backups','readwrite');tx.objectStore('backups').put(raw,'before-structure-v2');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});status('기존 입력을 보존하고 문항 구성으로 옮겼습니다.');remember();}}
  else if(demo){data=validate(await(await fetch(new URL('./examples.json',import.meta.url))).json());remember();}
  current=data.questions[0]||null;{const first=data.exams.find(e=>e.status==='drafting'),param=new URLSearchParams(location.search).get('view');if(param==='desk'){view.name='desk';view.examId=examOf(data,current?.id)?.id||null;}else if(first){view.name='exam';view.examId=first.id;}else view.name='library';}renderAll();if(raw)status('저장한 문항을 열었습니다.');if(!raw&&!demo)status('새 문항 또는 엑셀 올리기로 시작하세요.');
}catch(e){// 열지 못한 이유는 사라지지 않게 둔다 — 6초 뒤 지워지면 빈 보관함만 남아 저장이 없어진 것처럼 보인다.
  saveBlocked=true;view.loadError='저장된 입력을 열지 못했습니다. 기존 저장은 보존했습니다. '+e.message;renderAll();status(view.loadError,true,{keep:true});}
  try{standards=await loadStandards();}catch{status('성취기준 자료를 불러오지 못했습니다. 자료 열람에서 다시 시도하세요.',true);}
}
// 전체 표(엑셀형): 시험지 안에서 열면 그 시험지 문항만 시험지 순서대로, 아니면 보관함 문항.
const sheetScope=()=>{const exam=view.examId&&examById(data,view.examId);return exam?exam.items.map(id=>data.questions.find(q=>q.id===id)).filter(Boolean):libraryQuestions(data);};
function renderRows(){const query=$('#filter').value.toLowerCase(),visible=sheetScope().filter(q=>(q.number+' '+q.ask+' '+q.standardCode+' '+q.source+' '+(q.managementId||'')+' '+(q.concepts||[]).join(' ')).toLowerCase().includes(query));
  const table=$('#registry');table.querySelector('colgroup').innerHTML='<col class="row-col"><col class="field-col">'+visible.map(()=>'<col class="question-col">').join('');
  sizeColumns(visible.length);
  table.tHead.innerHTML='<tr class="letters"><th></th><th>A</th>'+visible.map((q,c)=>`<th>${columnName(c+1)}</th>`).join('')+'</tr><tr><th></th><th>항목</th>'+visible.map(q=>`<th data-id="${q.id}" data-current="${q.id===current?.id}"><button data-preview="${q.id}" title="클릭: 문항 조판 열기 · 우클릭: 복제·삭제">${E(q.managementId||q.number+'번 문항')} <span>조판 보기</span></button></th>`).join('')+'</tr>';
  table.tHead.rows[1].cells[1].textContent='항목';
  $('#rows').innerHTML=ROWS.map((row,r)=>`<tr class="${[row.tall?'tall-row':'',row.more?'more-row':''].join(' ').trim()}"><th class="row-num" scope="row">${r+1}</th><th class="field-label" scope="row" title="${E(row.hint||'')}">${row.label}</th>${visible.map(q=>{const value=fieldValue(q,row.key),open=row.key==='choices'&&['대응표','그림·그래프'].includes(q.style)?q.style==='대응표'?'tables':'composition':row.open,attr=`data-field="${row.key}" aria-label="${E(q.number)}번 ${row.label}"`;return `<td data-id="${q.id}" data-hwp="${row.text&&(!row.optional||q.blocks.some(b=>b.kind===row.key))?'text':'off'}" ${open?`data-open="${open}" title="더블클릭 또는 F2로 편집"`:''}>${row.options?`<select ${attr}>${options(row.options,value)}</select>`:`<textarea ${attr} rows="1" maxlength="32767"${row.ph&&(!row.optional||q.blocks.some(b=>b.kind===row.key))?` placeholder="${E(row.ph)}"`:''}>${E(value)}</textarea>`}</td>`;}).join('')}</tr>`).join('');
  $('#count').textContent=visible.length===data.questions.length?`${data.questions.length}문항`:`${visible.length} / ${data.questions.length}문항`;$('#empty').hidden=!!data.questions.length;for(const id of ['duplicate','preview','edit-detail'])$('#'+id).disabled=!current;$('#detail').hidden=!current;
  fitRows();
}
// 자료 자리: 그림은 5E 그림 화면에서 영역을 잘라 넣고(문항 창에 끼워진 경우), 표는 칸 수만 정해 만든다.
const slotBlocks=q=>{const out=[];const walk=(parent,depth)=>{for(const b of q.blocks.filter(x=>x.parent===parent)){if(b.kind==='figure'||b.kind==='table')out.push(b);walk(b.id,depth+1);}};walk(null,0);return out;};
function pickFigure(q,id){
  const b=q.blocks.find(x=>x.id===id);if(!b)return;
  if(!embedded){imageTarget={qid:q.id,key:'block:'+id};$('#figure-file').click();return;}
  if($('#slot-dialog').open)$('#slot-dialog').close();
  status('5E 그림 화면에서 보낼 영역을 손잡이로 정하고 「이 자리에 넣기」를 누르세요. Esc로 취소합니다.');
  window.parent.postMessage({channel:'5e-question-sheet',action:'pick-figure',qid:q.id,key:'block:'+id,label:b.label||'그림'},location.origin);
}
function slotAction(action,q,id){
  const b=q.blocks.find(x=>x.id===id);if(!b)return;
  if(action==='pick')return pickFigure(q,id);
  if(action==='file'){imageTarget={qid:q.id,key:'block:'+id};$('#figure-file').click();return;}
  if(action==='edit'){window.parent.postMessage({channel:'5e-question-sheet',action:'edit-figure',qid:q.id,key:'block:'+id,label:b.label||'그림',figure:b.figure||null},location.origin);return;}
  if(action==='table')return openSlots(q,id);
}
function resizeTable(t,rows,cols,headerRows){
  const cells=Array.from({length:rows},(_,r)=>Array.from({length:cols},(_,c)=>t.cells[r]?.[c]||{value:''}));
  return {...t,rows,cols,headerRows:Math.min(headerRows,rows),cells,merges:t.merges.filter(m=>m.r+m.rs<=rows&&m.c+m.cs<=cols)};
}
function openSlots(q,focusId){
  if(!q)return;const list=slotBlocks(q),pane=$('#slot-list');
  if(!list.length){pane.innerHTML='<p class="muted">이 문항에는 그림·표 자리가 없습니다. \'구성\' 시트의 「+ 구성 추가」로 자리를 만드세요.</p>';}
  else pane.innerHTML=list.map(b=>{
    const name=E(b.label||KINDS[b.kind]),kind=`<select data-slot-kind="${b.id}" aria-label="${name} 종류"><option${b.kind==='figure'?' selected':''}>그림</option><option${b.kind==='table'?' selected':''}>표</option></select>`;
    const body=b.kind==='figure'
      ?`<div class="slot-thumb">${b.figure?`<img src="${E(b.figure.data)}" alt="">`:'<span>빈 자리</span>'}</div><div class="slot-actions">${embedded?`<button type="button" class="slot-main" data-slot-pick="${b.id}">5E에서 잘라 넣기</button>`:''}<button type="button" data-slot-file="${b.id}">파일에서 넣기</button>${b.figure?`<button type="button" data-slot-clear="${b.id}">비우기</button>`:''}</div>`
      :`<div class="slot-table"><label>행<input type="number" min="1" max="20" value="${b.table.rows}" data-slot-rows="${b.id}"></label><label>열<input type="number" min="1" max="12" value="${b.table.cols}" data-slot-cols="${b.id}"></label><label>머리 행<input type="number" min="0" max="3" value="${b.table.headerRows}" data-slot-head="${b.id}"></label></div><div class="slot-actions"><button type="button" class="slot-main" data-slot-table="${b.id}">표 만들기</button><button type="button" data-slot-sheet="${b.id}">표 시트에서 채우기</button></div>`;
    return `<section class="slot-row" data-slot="${b.id}"${b.id===focusId?' data-focus="true"':''}><div class="slot-name"><strong>${name}</strong>${kind}</div>${body}</section>`;
  }).join('');
  if(!$('#slot-dialog').open)$('#slot-dialog').showModal();
  (pane.querySelector('[data-focus] .slot-main')||pane.querySelector('.slot-main'))?.focus();
}
$('#slot-dialog').addEventListener('change',e=>{const n=e.target.closest('[data-slot-kind]');if(!n||!current)return;if(mutate(()=>applyPartChange(current,n.dataset.slotKind,'kind',n.value==='표'?KINDS.table:KINDS.figure)))openSlots(current,n.dataset.slotKind);else openSlots(current,n.dataset.slotKind);});
$('#slot-dialog').addEventListener('click',e=>{
  const n=e.target.closest('button');if(!n||!current)return;const q=current,d=n.dataset;
  if(d.slotPick)return pickFigure(q,d.slotPick);
  if(d.slotFile){imageTarget={qid:q.id,key:'block:'+d.slotFile};$('#figure-file').click();return;}
  if(d.slotClear){mutate(()=>{q.blocks.find(b=>b.id===d.slotClear).figure=null;});openSlots(q,d.slotClear);return;}
  if(d.slotTable){const id=d.slotTable,v=k=>Number($('#slot-list').querySelector(`[data-slot-${k}="${id}"]`).value);
    const rows=v('rows'),cols=v('cols'),head=v('head');
    if(mutate(()=>{if(![rows,cols,head].every(Number.isInteger)||rows<1||rows>20||cols<1||cols>12||head<0||head>3)throw Error('행은 1~20, 열은 1~12, 머리 행은 0~3으로 정하세요.');const b=q.blocks.find(x=>x.id===id);b.table=resizeTable(b.table,rows,cols,head);})){status(`표를 ${rows}행 × ${cols}열로 만들었습니다 · 글은 '표' 시트에서 채우세요.`);openSlots(q,id);}return;}
  if(d.slotSheet){$('#slot-dialog').close();sheetView='tables';renderSheetView();grid?.refresh({questionId:q.id});return;}
});
// 문항 열 폭: 문항이 적으면 열을 넓혀 화면을 채우고(A열은 그대로), 많으면 262px로 나란히 둔다.
function sizeColumns(n=$('#registry colgroup')?.querySelectorAll('.question-col').length||0){
  const table=$('#registry'),avail=table.closest('.registry')?.clientWidth||0,w=Math.round(Math.min(720,Math.max(262,(avail-137)/Math.max(1,n))));
  table.querySelectorAll('col.question-col').forEach(c=>c.style.width=w+'px');table.style.width=(136+n*w)+'px';
}
// 칸 높이: 줄 수에 맞춰 늘고 줄어든다(긴 선지·보기가 잘리지 않게). 글 칸은 두 줄, 나머지는 한 줄이 최소.
function fitRow(tr){
  const ts=[...tr?.querySelectorAll('textarea')||[]];if(!ts.length)return;
  const min=tr.classList.contains('tall-row')&&ts.some(t=>t.closest('td')?.dataset.hwp==='text')?52:33;
  ts.forEach(t=>t.style.height='auto');const h=Math.min(260,Math.max(min,...ts.map(t=>t.scrollHeight+1)));ts.forEach(t=>t.style.height=h+'px');
}
function fitRows(){document.querySelectorAll('#rows tr').forEach(fitRow);}
function refreshColumn(q){
  document.querySelectorAll(`#rows td[data-id="${q.id}"] textarea[data-field]`).forEach(t=>{if(t.closest('.grid-editing'))return;const v=fieldValue(q,t.dataset.field);if(t.value!==v)t.value=v;});
  if(current?.id===q.id&&sheetView==='parts')renderParts($('#sheet-parts'),current);
}
function choose(q){if(!q||q.id===current?.id)return;current=q;selection=null;sourceTarget='question';editKey='';document.querySelectorAll('#registry thead th[data-id]').forEach(n=>n.dataset.current=String(n.dataset.id===q.id));if($('#detail-dialog').open)renderDetail();renderSheetView();if(!$('#sources').hidden)renderSources();if(!$('#preview-dialog').hidden)void openTypeset();renderView();}
function openDetail(tab='composition'){if(!current)return;renderDetail();switchTab(tab);if(!$('#detail-dialog').open)$('#detail-dialog').showModal();}
function figureMarkup(f,key){return `<div class="figure-slot">${f?`<img src="${E(f.data)}" alt="${E(f.name)}"><span class="figure-name">${E(f.name)}</span>`:'<span class="muted">그림을 추가하세요.</span>'}<div class="figure-actions"><button data-action="image" data-image="${E(key)}">${f?'그림 바꾸기':'파일 열기'}</button>${embedded?`<button data-action="capture" data-image="${E(key)}">현재 5E 그림</button>`:''}${embedded&&f?.editable?.source?`<button data-action="edit-figure" data-image="${E(key)}">5E 원본 편집</button>`:''}${f?`<button data-action="clear-image" data-image="${E(key)}">그림 제거</button>`:''}</div></div>`;}
function renderBlocks(){let html='';const walk=(parent,depth)=>{for(const b of current.blocks.filter(x=>x.parent===parent)){html+=`<section class="block ${depth?'child':''}" data-block="${b.id}"><div class="block-header"><span class="kind">${KINDS[b.kind]}</span><input class="block-name" data-bfield="label" aria-label="${E(b.label)} 이름" value="${E(b.label)}" maxlength="240"><details class="block-options"><summary>배치·순서</summary><div><select data-bfield="parent" aria-label="${E(b.label)} 묶음"><option value="">문항에 배치</option>${parentOptions(current,b).map(x=>`<option value="${x.id}" ${b.parent===x.id?'selected':''}>${E(x.label)} 안에</option>`).join('')}</select>${b.kind==='group'?`<select data-bfield="layout" aria-label="${E(b.label)} 배치">${options(['세로','나란히'],b.layout)}</select><label><input type="checkbox" data-bboxed aria-label="${E(b.label)} 테두리 상자" ${b.boxed?'checked':''}>테두리 상자</label>`:''}<div class="block-tools"><button data-action="up" aria-label="${E(b.label)} 위로">↑</button><button data-action="down" aria-label="${E(b.label)} 아래로">↓</button><button data-action="reference" aria-label="${E(b.label)} 근거">근거</button><button data-action="remove-block" aria-label="${E(b.label)} 제거">×</button></div></div></details></div><div class="block-body">`;
    if(b.kind==='text')html+=`<textarea data-bfield="text" aria-label="${E(b.label)} 내용" rows="2" maxlength="32767" placeholder="설명이나 수식을 입력하세요"></textarea>`;
    if(b.kind==='figure')html+=figureMarkup(b.figure,'block:'+b.id)+`<input data-bfield="text" class="caption" aria-label="${E(b.label)} 설명" value="${E(b.text)}" placeholder="그림 설명 (선택)" maxlength="32767">`;
    if(b.kind==='table')html+=renderTable(b.table,b.id,false);
    if(b.kind==='group')html+=`<p class="muted">${current.blocks.filter(x=>x.parent===b.id).length}개 자료 · ${b.layout==='나란히'?'인쇄할 때 나란히 배치':'한 묶음 안에 순서대로 배치'}</p><button data-action="add-child">＋ 이 묶음에 추가</button>`;
    if(b.lines)html+=b.lines.map((l,i)=>`<div class="line-row" data-line="${l.id}"><input data-lfield="label" aria-label="${E(b.label)} ${i+1}항목 이름" value="${E(l.label)}" maxlength="120"><textarea data-lfield="text" aria-label="${E(b.label)} ${i+1}항목 내용" rows="1" maxlength="32767">${E(l.text)}</textarea><button data-action="line-reference" aria-label="${E(b.label)} ${i+1}항목 근거">근거</button><button data-action="remove-line" aria-label="${E(b.label)} ${i+1}항목 제거">×</button></div>`).join('')+`<button data-action="add-line" class="add-line">＋ 항목 추가</button>`;
    html+='</div></section>';walk(b.id,depth+1);}};walk(null,0);$('#blocks').innerHTML=html;
  for(const b of current.blocks.filter(b=>b.kind==='text'))$(`[data-block="${b.id}"] [data-bfield="text"]`).value=b.text;
}
function renderChoices(){const q=current;let html=`<div class="choices-head"><strong>${q.type==='서술형'?'모범답안':'선지'}</strong><span>${q.type==='서술형'?'정답·해설에만 표시':'왼쪽 원을 선택하면 정답으로 저장됩니다.'}</span>${q.style==='조합'&&q.type!=='서술형'?'<button data-action="combinations">보기 조합 채우기</button>':''}</div>`;
  if(q.type==='서술형')html+=`<textarea data-qfield="modelAnswer" aria-label="모범답안" rows="3" style="width:100%">${E(q.modelAnswer)}</textarea>`;
  else if(q.style==='대응표')html+=renderTable(q.choiceTable,'choices',false)+`<div class="choice-row">${labels.map((v,i)=>`<label><input type="radio" name="answer" data-answer="${i}" ${q.answer===i?'checked':''}> ${v}</label>`).join('')}</div>`;
  else html+=q.choices.map((c,i)=>`<div class="choice-row" data-choice="${c.id}"><input type="radio" name="answer" aria-label="${i+1}번을 정답으로" data-answer="${i}" ${q.answer===i?'checked':''}><label>${labels[i]}</label>${q.style==='그림·그래프'?`<div style="flex:1">${figureMarkup(c.figure,'choice:'+c.id)}<textarea data-choice-text aria-label="${i+1}번 선지 내용" rows="1" placeholder="그림 설명 (선택)">${E(c.text)}</textarea></div>`:`<textarea data-choice-text aria-label="${i+1}번 선지 내용" rows="1" maxlength="32767">${E(c.text)}</textarea>`}<button data-action="choice-reference" aria-label="${i+1}번 선지 근거">근거</button></div>`).join('');$('#choices').innerHTML=html;
}
function tableBy(id){return id==='choices'?current.choiceTable:current.blocks.find(b=>b.id===id)?.table;}
function renderTable(t,id,full){let html=`<div class="table-card" data-table="${id}"><div class="table-title"><strong>${id==='choices'?'선지 대응표':full?E(current.blocks.find(b=>b.id===id)?.label):'셀에 바로 입력'}</strong><span>${t.rows}행 × ${t.cols}열</span><label>머리글 <select data-tfield="headerRows" aria-label="${E(id==='choices'?'선지표':current.blocks.find(b=>b.id===id)?.label)} 머리글 행" ${id==='choices'?'disabled':''}>${Array.from({length:Math.min(t.rows,5)+1},(_,i)=>`<option value="${i}" ${i===t.headerRows?'selected':''}>${i}행</option>`).join('')}</select></label></div><div class="table-tools"><button data-action="row-add" ${id==='choices'?'disabled':''}>＋ 행</button><button data-action="col-add">＋ 열</button><details class="table-options"><summary>표 도구</summary><div><button data-action="row-remove" ${id==='choices'?'disabled':''}>− 마지막 행</button><button data-action="col-remove">− 마지막 열</button><button data-action="merge">셀 병합</button><button data-action="unmerge">병합 풀기</button><button data-action="cell-image">셀 그림</button><button data-action="cell-image-remove">셀 그림 제거</button><button data-action="diagonal">대각선 머리글</button></div></details><span class="selection-label">드래그·Shift+방향키로 범위 선택</span></div><div class="table-scroll"><table class="data-table" aria-label="${E(id==='choices'?'선지 대응표':current.blocks.find(b=>b.id===id)?.label)}"><colgroup><col style="width:30px">${'<col>'.repeat(t.cols)}</colgroup><thead><tr><th></th>${Array.from({length:t.cols},(_,i)=>`<th>${String.fromCharCode(65+i)}</th>`).join('')}</tr></thead><tbody>`;
  for(let r=0;r<t.rows;r++){html+=`<tr><th scope="row">${r+1}</th>`;for(let c=0;c<t.cols;c++){if(tableCovered(t,r,c))continue;const cell=t.cells[r][c],m=t.merges.find(m=>m.r===r&&m.c===c),sel=selection?.id===id&&r>=selection.range[0]&&r<=selection.range[2]&&c>=selection.range[1]&&c<=selection.range[3];html+=`<td data-r="${r}" data-c="${c}" data-header="${r<t.headerRows}" class="${sel?'selected ':''}${t.diagonal&&r===0&&c===0?'diagonal':''}" ${m?`rowspan="${m.rs}" colspan="${m.cs}"`:''}>${t.diagonal&&r===0&&c===0?`<div class="axes"><input data-axis="row" aria-label="행 축" value="${E(t.diagonal.row)}"><input data-axis="col" aria-label="열 축" value="${E(t.diagonal.col)}"></div>`:''}${cell.figure?`<img src="${E(cell.figure.data)}" alt="${E(cell.figure.name)}">`:''}<textarea rows="1" data-tcell aria-label="${E(id==='choices'?'선지표':current.blocks.find(b=>b.id===id)?.label)} ${String.fromCharCode(65+c)}${r+1}" maxlength="32767">${E(cell.value)}</textarea></td>`;}html+='</tr>';}
  return html+`</tbody></table></div><label class="table-note">단위·각주<input data-tfield="note" aria-label="표 단위·각주" value="${E(t.note)}" maxlength="32767" placeholder="예: 질량 kg · ㉠은 미지값"></label></div>`;
}
function renderDetail(){if(!current)return;$('#question-title').textContent=`${current.number||'번호 미입력'}번 문항`;$('#structure-count').textContent=current.blocks.length+'개 구성';$('#ask').value=current.ask;renderBlocks();renderChoices();$('#tables').innerHTML=current.blocks.filter(b=>b.kind==='table').map(b=>renderTable(b.table,b.id,true)).join('')+(current.style==='대응표'?renderTable(current.choiceTable,'choices',true):'')||'<p class="muted">구성 추가에서 표를 추가하세요. 그림을 표 안의 셀에도 넣을 수 있습니다.</p>';renderEvidence();switchTab(activeTab);grid?.refresh();}
// 완성한 문항의 내용이 바뀌면 점검으로 돌린다(상태는 내용이 아니다).
// 태그·난이도(보관함 분류)는 내용이 아니므로 바꿔도 완성 상태를 유지한다.
const contentOf=q=>{const {typeset,references,workflow,reviews,authoring,tags,difficulty,...c}=q;return JSON.stringify(c);};
function completeKeys(only=null){const m=new Map();for(const q of only?[only]:data.questions)if(q.workflow==='complete')m.set(q.id,contentOf(q));return m;}
function demoteEdited(keys){let n=0;for(const [id,k] of keys){const q=data.questions.find(x=>x.id===id);if(q?.workflow==='complete'&&contentOf(q)!==k){q.workflow='review';n++;}}if(n)setTimeout(()=>status(`완성한 문항 ${n}개의 내용이 바뀌어 점검할 문항으로 옮겼습니다.`),0);}
// 화면: cards(분류별 카드) · desk(5E_cell·5E_hwp 작업대) · exam(시험지 구성). 처음에는 문항이 있으면 카드로 연다.
let view={name:'library',status:'drafting',query:'',type:'',stage:'all',examId:null};
const appView=()=>view;// 쪽 그리기 안에서 지역 이름 view(그린 쪽)와 겹치지 않게
function renderView(){
  const panes={library:'#library-view',exams:'#exams-view',exam:'#examd-view',card:'#card-view'};
  for(const [name,sel] of Object.entries(panes))$(sel).hidden=view.name!==name;
  // 한글 조판 창은 한 번 미리보기에 붙으면 그 자리에 둔다(옮기면 편집기 프레임을 처음부터 다시 읽고 간결 화면이 풀린다). 카드를 떠나면 닫기만 한다.
  if(view.name!=='card'&&$('#preview-dialog').classList.contains('docked')&&!$('#preview-dialog').hidden)void requestTypeset(null);
  $('#cards-view').hidden=true;$('#exam-view').hidden=true;$('.workspace').hidden=view.name!=='desk';
  renderNav($('.side'),data,view);
  if(view.name==='library')renderLibraryView($('#library-view'),data,view,libApi);else closeViewer(libApi);
  if(view.name==='exams')renderExams($('#exams-view'),data,view);
  if(view.name==='exam'){const ex=examById(data,view.examId);
    // 시험지를 처음 열 때 단계: 문항이 없으면 ① 틀 · 속성, 있으면 ③ 배치 · 점검(10-24 세 단계).
    // 시험지를 열면: 문항이 있으면 배치·점검, 없으면 문항 고르기(10-24 시안 17 — ① 틀·속성은 「새 시험지」 창과 머리의 「틀」 표로).
    if(ex&&view.examStepFor!==ex.id){view.examStepFor=ex.id;view.examStep=ex.items.length?3:2;}
    const keep=$('#examd-view .ep-grid')?.scrollTop||0,oldSheet=$('#exam-sheet'),oldPages=oldSheet?.dataset.exam===String(ex?.id)&&oldSheet.querySelector('.pv-pg')?[...oldSheet.childNodes]:null,deskScroll=$('#examd-view .ex-desk')?.scrollTop||0;
    renderExam($('#examd-view'),data,view.examId,{forms:typesetForms,step:view.examStep||3,step2:e=>renderStep2(e,data,typesetForms,pickState(view),{busy:pastBusy}),place:placeState(view)});// 다시 그려도 이미 그린 쪽은 그대로 두고, 새 조판이 끝나면 한 번에 바꾼다 — 「그리는 중…」으로 비었다가 다시 나타나 깜빡였다(10-27 지적).
    if((view.examStep||3)===3){const n=$('#exam-sheet');if(n&&oldPages){n.replaceChildren(...oldPages);const d=$('#examd-view .ex-desk');if(d)d.scrollTop=deskScroll;}void fillExamSheet(ex);}fillEngineCards($('#examd-view'));if(view.examStep===2){fillStep2($('#examd-view'),data);if(!pastData.items)loadPast().then(()=>{if(view.name==='exam'&&view.examStep===2)renderView();}).catch(e=>status(e.message,true));const g=$('#examd-view .ep-grid');if(g)g.scrollTop=keep;}}
  if(view.name==='card'){let pref=null;try{pref=localStorage.getItem(CHANNEL+'exampool-nav');}catch{}document.querySelector('.shell-body').classList.toggle('nav-off',pref===null||pref==='0');if(pref!=='1')$('#toggle-nav').setAttribute('aria-pressed','false');cardEditor.render();}
  else{let pref=null;try{pref=localStorage.getItem(CHANNEL+'exampool-nav');}catch{}document.querySelector('.shell-body').classList.toggle('nav-off',pref==='0');}
  $('#toggle-lib').hidden=true;
  // 위쪽 막대: 카드 화면에서는 단계 칩이 카드에 있으므로 상태 선택을 숨기고, 시험지 문항이면 5E_hwp로 보내기를 보인다.
  // 시험지 화면에는 머리 줄에 같은 단추가 있으므로 위쪽 막대에는 두지 않는다(같은 단추 두 개).
  document.querySelector('.workflow-pick').hidden=view.name==='card';
  {const ex=view.name==='card'&&current?examOf(data,current.id):null;$('#send-hwp').hidden=!embedded||!ex;$('#send-hwp').dataset.exam=ex?.id||'';}
  const exam=view.examId&&examById(data,view.examId),list=sheetScope(),at=current?list.indexOf(current):-1;
  $('#crumb-view').textContent=view.name==='library'||(view.name==='card'&&!exam)?'문항 보관함':view.name==='exams'?'시험지':exam?`${exam.status==='done'?'출제 완료':'출제 중'} · ${exam.title}`:'문항 시트';
  {const q=['desk','card'].includes(view.name)&&current;$('#crumb-question').textContent=q?questionTitle(current):'';$('#crumb-question').title=q?`${questionTitle(current)} · ${questionSubtitle(current)}`:'';document.querySelector('.crumb-sep').hidden=!q;}
  // 이동 줄 앞 단계는 그 화면으로 가는 단추: 시험지 문항이면 그 시험지, 아니면 문항 보관함(보관함·시험지 목록 화면에서는 지금 화면이라 누를 일 없음).
  $('#crumb-view').disabled=!['card','desk'].includes(view.name);$('#crumb-view').title=$('#crumb-view').disabled?'':exam?'이 시험지 열기':'문항 보관함 열기';
  $('#question-position').textContent=list.length?`${at+1} / ${list.length}`:'0 / 0';
  $('#question-prev').disabled=at<=0;$('#question-next').disabled=at<0||at>=list.length-1;
  document.querySelector('.crumb-step').hidden=view.name!=='desk';
  $('#workflow').disabled=!current||view.name!=='desk';$('#workflow').value=current?workflowOf(current):'draft';
  document.querySelector('.workflow-pick').hidden=view.name!=='desk';
}
function show(name,extra={}){if(name!=='desk'&&grid?.finish()===false)return;view={...view,...extra,name};if(name==='desk'&&deskStale)renderDesk();renderView();if(name==='desk'){grid?.refresh({questionId:current?.id});}}
// 엑셀식 시트(줄·세부·표 시트·격자)는 그 화면이 보일 때만 그린다. 다른 화면에서는 미뤄 두었다가 show('desk')에서 그린다
// (문항 150개면 카드에서 단추 하나 누를 때마다 숨은 시트를 다시 그리느라 50ms·느린 컴퓨터 300ms가 들었다).
let deskStale=false;
function renderDesk(){cellNode=null;renderRows();if(current)renderDetail();renderSheetView();deskStale=false;}
function renderAll(){if(view.name==='desk'){cellNode=null;renderRows();}else deskStale=true;if($('#slot-dialog')?.open&&current)openSlots(current);if(view.name==='desk'){if(current)renderDetail();renderSheetView();}renderView();$('#undo').disabled=!history.length;$('#redo').disabled=!future.length;if(view.name==='desk')grid?.refresh({questionId:current?.id});syncTypeset(current);}
// 데이터는 하나: 시트·구성 값을 고치면 한글 창에 바로 반영한다. 글만 바뀌었으면 그 문단만 바꾸고(서식 유지),
// 구성·배치·선지 표현처럼 모양이 바뀌었으면 잠시 뒤 다시 그린다. value는 확정 전(입력 중) 값일 수도 있다.
let redrawTimer=0,syncSeq=0;
function syncTypeset(value){
  if(!typesetter||!value||$('#preview-dialog').hidden)return;
  const stale=!typesetter.matches(value);$('#typeset-refresh').hidden=!stale;if(!stale){clearTimeout(redrawTimer);return;}
  const seq=++syncSeq;
  void typesetter.update(value).catch(()=>false).then(done=>{if(seq!==syncSeq)return;if(done){clearTimeout(redrawTimer);$('#typeset-refresh').hidden=!!current&&typesetter.matches(current);}else if(value===current)scheduleRedraw();});
}
function scheduleRedraw(){clearTimeout(redrawTimer);redrawTimer=setTimeout(()=>{if(current&&typesetter&&!$('#preview-dialog').hidden&&!typesetter.matches(current))void requestTypeset(current);},450);}
// 구성 편집 창처럼 화면을 다시 그리지 않는 입력도 잠시 뒤 한글 창에 넣는다.
function queueSync(){clearTimeout(draftTimer);draftTimer=setTimeout(()=>syncTypeset(current),100);}// 카드 입력이 멈춘 뒤 0.1초에 조판(거의 실시간)
// 시트 칸에 입력하는 동안: 확정 전 값으로 만든 문항을 한글 창에 바로 넣는다(다시 그려야 하는 변경은 확정 때).
let draftTimer=0;
function previewDraft(d,value){
  clearTimeout(draftTimer);
  draftTimer=setTimeout(()=>{
    if(!current||!typesetter||$('#preview-dialog').hidden)return;
    if(!d?.table){syncTypeset(current);return;}
    try{
      const copy=clone(data),writes=[{r:d.r,c:d.c,value}];
      if(d.id==='registry')applyVerticalValues(copy,[...d.table.tHead.rows[1].cells].filter(n=>n.dataset.id).map(n=>n.dataset.id),writes,{});
      else applyGridValues(copy,{kind:'table',questionId:current.id,tableId:d.id},writes,{});
      const q=copy.questions.find(x=>x.id===typesetter.questionId);if(!q||typesetter.matches(q))return;
      const seq=++syncSeq;
      // 빈 칸에 처음 쓰는 글(회색 틀 → 글)은 입력하는 동안에도 다시 그려 보여 준다. 시트 칸의 입력 위치는 그대로 둔다.
      void typesetter.update(q).catch(()=>false).then(async ok=>{if(ok!==false||seq!==syncSeq||!typesetter.skeletonOnly(q))return;await grid.keepEditing(()=>typesetter.open(q));});
    }catch{/* 아직 맞지 않는 값(목록 밖 값 등)은 확정할 때 알린다 */}
  },60);
}
// 5E_cell 아래 시트 탭: 문항(가로 문항 시트) · 구성(선택 문항의 배치) · 표(선택 문항의 표).
let sheetView='registry';
function renderSheetView(){
  for(const name of ['registry','parts','tables'])$('#sheet-'+name).hidden=name!==sheetView;
  document.querySelectorAll('[data-sheet]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.sheet===sheetView)));
  if(sheetView==='parts')renderParts($('#sheet-parts'),current);
  if(sheetView==='tables'){const pane=$('#sheet-tables');if(!current){pane.innerHTML='<p class="parts-empty">문항을 선택하면 표가 보입니다.</p>';return;}
    if($('#detail-dialog').open){pane.innerHTML='<p class="parts-empty">구성 편집 창에서 표를 고치는 중입니다.</p>';return;}
    $('#tables').innerHTML='';pane.innerHTML=current.blocks.filter(b=>b.kind==='table').map(b=>renderTable(b.table,b.id,true)).join('')+(current.style==='대응표'?renderTable(current.choiceTable,'choices',true):'')||'<p class="parts-empty">이 문항에는 표가 없습니다. 구성 편집에서 표를 추가하세요.</p>';}
}
document.querySelectorAll('[data-sheet]').forEach(b=>b.addEventListener('click',()=>{if(grid?.finish()===false)return;sheetView=b.dataset.sheet;renderSheetView();grid?.refresh({questionId:current?.id});}));
$('#sheet-parts').addEventListener('change',e=>{const n=e.target.closest('[data-part]'),row=e.target.closest('[data-part-id]');if(!n||!row||!current)return;mutate(()=>applyPartChange(current,row.dataset.partId,n.dataset.part,n.value));});
$('#sheet-parts').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('input[data-part]')){e.preventDefault();e.target.blur();}});
$('#sheet-parts').addEventListener('click',e=>{if(e.target.closest('#parts-add')){if(current){addParent=null;$('#add-dialog').showModal();}return;}
  const rm=e.target.closest('[data-part-remove]'),rmRow=rm&&e.target.closest('[data-part-id]');
  if(rm&&rmRow&&current){const id=rmRow.dataset.partId;mutate(()=>{const ids=new Set([id]);let changed=true;while(changed){changed=false;for(const x of current.blocks)if(ids.has(x.parent)&&!ids.has(x.id)){ids.add(x.id);changed=true;}}for(const x of current.blocks)if(ids.has(x.id))x.lines?.forEach(l=>ids.add(l.id));current.blocks=current.blocks.filter(x=>!ids.has(x.id));current.references=current.references.filter(r=>!ids.has(r.target));});status('구성을 지웠습니다 · 되돌리기(⌘Z)로 복원할 수 있습니다.');return;}
const n=e.target.closest('[data-part-move]'),row=e.target.closest('[data-part-id]');if(!n||!row||!current)return;mutate(()=>{if(!movePart(current,row.dataset.partId,n.dataset.partMove))throw Error(n.dataset.partMove==='up'?'이미 묶음의 첫 구성입니다.':'이미 묶음의 마지막 구성입니다.');});});
function switchTab(tab){activeTab=tab;for(const name of ['composition','tables','evidence'])$('#'+name).hidden=name!==tab;document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));selection=null;grid?.refresh();}
function renderEvidence(){const q=current;$('#evidence').innerHTML=`<label class="evidence-row"><span>출처</span><input data-qfield="source" aria-label="출처" value="${E(q.source)}" placeholder="시험·교과서·쪽수 등"></label><label class="evidence-row"><span>출제 의도</span><textarea data-qfield="intent" aria-label="출제 의도" rows="2">${E(q.intent)}</textarea></label><label class="evidence-row"><span>해설</span><textarea data-qfield="explanation" aria-label="해설" rows="3">${E(q.explanation)}</textarea></label><div class="evidence-row"><span>성취기준</span><div><strong>${E(q.standardCode||'미연결')}</strong> <button data-action="open-standard">성취기준 찾기</button></div></div><div class="evidence-row"><span>연결 근거</span><div>${q.references.map((r,i)=>`<div class="ref-row"><button data-ref="${i}">${E(targetLabel(r.target))} · ${E(r.label)}<br><small>${E(r.quote)}</small></button><button data-remove-ref="${i}">해제</button></div>`).join('')||'<p class="muted">교과서나 참고자료를 열어 문항·그림·표·선지에 근거를 연결하세요.</p>'}<button data-action="open-docs">자료 연결</button></div></div>`;}
function targetLabel(target){return current?targetDisplay(current,target):'문항';}
function changeField(q,key,value){if(key==='points'){if(value===''||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>10000)throw Error('배점은 0~10,000 사이 숫자로 입력하세요.');q.points=Number(value);}else if(key==='answer')q.answer=value===''?null:Number(value);else if(key==='preset'){if(value!==q.preset)applyPreset(q,value);}else {q[key]=value;if(key==='type'&&value==='합답형'&&!q.blocks.some(b=>b.kind==='bogi'))q.blocks.push(block('bogi'));}}
document.addEventListener('focusout',()=>{editKey='';});
document.addEventListener('input',e=>{const n=e.target;if(grid?.manages(n)||n.tagName==='SELECT'||n.type==='radio'||!current)return;const key=n.dataset.field;
  if(key){mutate(()=>changeField(current,key,n.value),{render:false,key:current.id+':'+key});if(key==='ask')$('#ask').value=current.ask;if(key==='number')$('#question-title').textContent=current.number+'번 문항';$('#formula-value').value=n.value;return;}
  if(n.id==='ask'||n.dataset.qfield){const k=n.id==='ask'?'ask':n.dataset.qfield;mutate(()=>current[k]=n.value,{render:false,key:current.id+':'+k});if(k==='ask'){const cell=$(`#rows tr[data-id="${current.id}"] [data-field="ask"]`);if(cell)cell.value=n.value;}return;}
  const b=current.blocks.find(b=>b.id===n.closest('[data-block]')?.dataset.block);
  if(n.dataset.bfield&&b){mutate(()=>b[n.dataset.bfield]=n.value,{render:false,key:b.id+':'+n.dataset.bfield});return;}
  if(n.dataset.lfield&&b){const line=b.lines.find(l=>l.id===n.closest('[data-line]').dataset.line);mutate(()=>line[n.dataset.lfield]=n.value,{render:false,key:line.id+':'+n.dataset.lfield});return;}
  if(n.hasAttribute('data-choice-text')){const c=current.choices.find(c=>c.id===n.closest('[data-choice]').dataset.choice);mutate(()=>c.text=n.value,{render:false,key:c.id});return;}
  const card=n.closest('[data-table]');if(card){const t=tableBy(card.dataset.table);if(n.hasAttribute('data-tcell')){const td=n.closest('td'),r=Number(td.dataset.r),c=Number(td.dataset.c);mutate(()=>{t.cells[r][c].value=cellValue(n.value);delete t.cells[r][c].raw;},{render:false,key:card.dataset.table+':'+r+':'+c});$('#formula-value').value=n.value;}else if(n.dataset.tfield)mutate(()=>t[n.dataset.tfield]=n.value,{render:false,key:card.dataset.table+':'+n.dataset.tfield});else if(n.dataset.axis)mutate(()=>t.diagonal[n.dataset.axis]=n.value,{render:false,key:card.dataset.table+':axis:'+n.dataset.axis});}
});
document.addEventListener('change',e=>{const n=e.target;if(grid?.manages(n))return;if(n.tagName==='SELECT'&&n.dataset.field)mutate(()=>changeField(current,n.dataset.field,n.value));if(n.tagName==='SELECT'&&n.dataset.bfield){const b=current.blocks.find(b=>b.id===n.closest('[data-block]').dataset.block);mutate(()=>b[n.dataset.bfield]=n.dataset.bfield==='parent'?n.value||null:n.value);}if(n.tagName==='SELECT'&&n.dataset.tfield)mutate(()=>tableBy(n.closest('[data-table]').dataset.table)[n.dataset.tfield]=Number(n.value));if(n.hasAttribute('data-bboxed')){const b=current.blocks.find(b=>b.id===n.closest('[data-block]').dataset.block);mutate(()=>b.boxed=n.checked);}if(n.dataset.answer!==undefined)mutate(()=>current.answer=Number(n.dataset.answer));});
let addParent=null;
// (가)·(나)·(다) 자료 묶음에 칸을 더하면 다음 이름((라)…)을 붙인다. 그 밖에는 기본 이름.
// 자료 칸 이름: (아) 다음도 (자)…(하)로 이어 간다(8개뿐이라 아홉째부터 모두 「그림」으로 겹쳤다).
const CAPTIONS=['(가)','(나)','(다)','(라)','(마)','(바)','(사)','(아)','(자)','(차)','(카)','(타)','(파)','(하)'];
function nextMaterialLabel(q,parent,kind){const used=q.blocks.filter(b=>b.parent===parent).map(b=>b.label);return ['figure','table','group'].includes(kind)&&used.some(l=>CAPTIONS.includes(l))?CAPTIONS.find(c=>!used.includes(c))||KINDS[kind]:KINDS[kind];}
document.addEventListener('click',e=>{const n=e.target.closest('button'),row=e.target.closest('#rows tr[data-id]');if(row&&!grid?.manages(e.target))choose(data.questions.find(q=>q.id===row.dataset.id));
  if(!n)return;if(n.dataset.delete){askDelete(n.dataset.delete);return;}if(n.dataset.preview){choose(data.questions.find(q=>q.id===n.dataset.preview));void openTypeset();return;}if(n.dataset.close){$('#'+n.dataset.close).close();return;}if(n.dataset.tab){if(current)renderDetail();switchTab(n.dataset.tab);return;}if(n.dataset.source){sourceTab=n.dataset.source;selectedStandard=null;$('#source-search').value='';renderSources();return;}
  if(n.dataset.kind){mutate(()=>current.blocks.push(block(n.dataset.kind,addParent,nextMaterialLabel(current,addParent,n.dataset.kind))));$('#add-dialog').close();return;}
  if(n.dataset.ref!==undefined){openRef(current.references[Number(n.dataset.ref)]);return;}if(n.dataset.removeRef!==undefined){mutate(()=>current.references.splice(Number(n.dataset.removeRef),1));return;}
  const action=n.dataset.action;if(!action)return;const b=current?.blocks.find(b=>b.id===n.closest('[data-block]')?.dataset.block),card=n.closest('[data-table]'),id=card?.dataset.table,t=id?tableBy(id):null;
  try{
    if(action==='image'){imageTarget={qid:current.id,key:n.dataset.image};$('#figure-file').click();return;}
    if(action==='capture'||action==='edit-figure'){const key=n.dataset.image,holder=imageHolder(current,key);window.parent.postMessage({channel:'5e-question-sheet',action,qid:current.id,key,figure:holder?.figure||null},location.origin);return;}
    if(action==='clear-image'){mutate(()=>imageHolder(current,n.dataset.image).figure=null);return;}
    if(action==='line-reference'){sourceTarget=n.closest('[data-line]').dataset.line;showSources();return;}if(action==='reference'||action==='choice-reference'){sourceTarget=b?.id||n.closest('[data-choice]').dataset.choice;showSources();return;}
    if(action==='open-standard'){sourceTarget='question';sourceTab='standards';showSources();return;}
    if(action==='open-docs'){sourceTarget='question';sourceTab='references';showSources();return;}
    if(action==='add-child'){addParent=b.id;$('#add-dialog').showModal();return;}
    if(action==='remove-block'){mutate(()=>{const ids=new Set([b.id]);let changed=true;while(changed){changed=false;for(const x of current.blocks)if(ids.has(x.parent)&&!ids.has(x.id)){ids.add(x.id);changed=true;}}for(const x of current.blocks)if(ids.has(x.id))x.lines?.forEach(l=>ids.add(l.id));current.blocks=current.blocks.filter(x=>!ids.has(x.id));current.references=current.references.filter(r=>!ids.has(r.target));});status('구성을 제거했습니다. 되돌리기로 복원할 수 있습니다.');return;}
    if(action==='up'||action==='down'){mutate(()=>{const siblings=current.blocks.filter(x=>x.parent===b.parent),at=siblings.indexOf(b),other=siblings[at+(action==='up'?-1:1)];if(other){const i=current.blocks.indexOf(b),j=current.blocks.indexOf(other);[current.blocks[i],current.blocks[j]]=[current.blocks[j],current.blocks[i]];}});return;}
    if(action==='add-line'){mutate(()=>{if(b.lines.length>=30)throw Error('항목은 30개까지 입력할 수 있습니다.');const i=b.lines.length;b.lines.push({id:uid(),label:b.kind==='dialogue'?String.fromCharCode(65+i):b.kind==='bogi'?['ㄱ','ㄴ','ㄷ','ㄹ','ㅁ'][i]||String(i+1):`(${['가','나','다','라','마'][i]||i+1})`,text:''});});return;}
    if(action==='remove-line'){mutate(()=>{const id=n.closest('[data-line]').dataset.line;b.lines=b.lines.filter(l=>l.id!==id);current.references=current.references.filter(r=>r.target!==id);});return;}
    if(action==='combinations'){mutate(()=>{const bogi=current.blocks.find(b=>b.kind==='bogi');if(!bogi||bogi.lines.length<3)throw Error('세 개 이상의 보기를 먼저 추가하세요.');const [a,b,c]=bogi.lines.map(l=>l.label),values=[a,b,`${a}, ${b}`,`${b}, ${c}`,`${a}, ${b}, ${c}`];current.choices.forEach((c,i)=>{if(!c.text)c.text=values[i];});});return;}
    if(t){
      if(['merge','unmerge','cell-image','cell-image-remove'].includes(action)&&selection?.id!==id)throw Error('표에서 셀 또는 범위를 먼저 선택하세요.');
      if(action==='cell-image'){imageTarget={qid:current.id,key:`cell:${id}:${selection.range[0]}:${selection.range[1]}`};$('#figure-file').click();return;}
      mutate(()=>{if(action==='row-add'){if(t.rows>=30)throw Error('표는 30행까지 만들 수 있습니다.');t.cells.push(Array.from({length:t.cols},()=>({value:''})));t.rows++;}if(action==='col-add'){if(t.cols>=12)throw Error('표는 12열까지 만들 수 있습니다.');t.cells.forEach(row=>row.push({value:''}));t.cols++;}
        if(action==='row-remove'||action==='col-remove'){const isRow=action==='row-remove';if((isRow?t.rows:t.cols)<=1)throw Error('마지막 셀은 제거할 수 없습니다.');const removed=isRow?t.cells.at(-1):t.cells.map(row=>row.at(-1));if(removed.some(c=>c.value!==''||c.figure))throw Error('마지막 행·열에 입력한 내용이 있습니다. 먼저 비워주세요.');if(t.merges.some(m=>isRow?m.r+m.rs>=t.rows:m.c+m.cs>=t.cols))throw Error('마지막 행·열의 병합을 먼저 풀어주세요.');if(isRow){t.cells.pop();t.rows--;t.headerRows=Math.min(t.headerRows,t.rows);}else{t.cells.forEach(row=>row.pop());t.cols--;}}
        if(action==='merge')mergeCells(t,selection.range);if(action==='unmerge'){const [r,c,er,ec]=selection.range;t.merges=t.merges.filter(m=>!(r<m.r+m.rs&&er>=m.r&&c<m.c+m.cs&&ec>=m.c));}
        if(action==='cell-image-remove')t.cells[selection.range[0]][selection.range[1]].figure=null;
        if(action==='diagonal')t.diagonal=t.diagonal?null:{row:'행 항목',col:'열 항목'};
      });return;
    }
  }catch(err){status(err.message,true);}
});
function imageHolder(q,key){const [kind,id,r,c]=key.split(':');return kind==='block'?q.blocks.find(b=>b.id===id):kind==='choice'?q.choices.find(c=>c.id===id):kind==='cell'?(id==='choices'?q.choiceTable:q.blocks.find(b=>b.id===id)?.table)?.cells[Number(r)]?.[Number(c)]:null;}
// 새 문항: 유형 → 자료 구조 2번 클릭. 배치는 자동이고, 자료 종류는 만든 뒤 엑셀에서 칸마다 고른다.
// 기출 「변형」: 기출 PDF를 편집 가능한 한글 문항으로 바꿔(AI 없음, 변환 엔진 assets/exampool/convert) 새 문항 카드로 연다.
// 원본 PDF는 5E 공개 게이트웨이(공유 폴더 「기출문제」)에서 받는다. 원본 출처는 근거로 붙고, 기준 용지는 원본 비율(B4).
let convertingPast=null;
// 「변형」 진행 표시: 누른 단추 자리에 고리와 단계 글(준비 → 원본 받는 중 → 바꾸는 중 → 카드 여는 중)을 보인다.
// 목록이 다시 그려져도 card-editor가 pastBusy()를 보고 같은 표시를 그린다.
let pastBusy=null;
// 「변형」 작업 상자(10-23 지적 4): 오른쪽 아래에 단계(스캔 → 문항 카드 → 한글 조판)를 보여 주고, 처리하는 동안 다른 작업을 그대로 한다.
// 끝나면 바로 카드로 넘어가지 않고 「카드 보기」를 띄운다(보고 있던 화면을 빼앗지 않게).
const JOB_STEPS=['문항 스캔','문항 카드 작성','한글 조판 작성'],jobStep=stage=>/카드 여는|조판/.test(stage||'')?2:/한글 문항/.test(stage||'')?1:0;
function jobBox(){let n=document.querySelector('#job-box');if(!n){n=document.createElement('section');n.id='job-box';n.setAttribute('role','status');n.setAttribute('aria-live','polite');document.body.append(n);
  n.addEventListener('click',e=>{const open=e.target.closest('[data-job-open]');if(open){const q=data.questions.find(x=>x.id===open.dataset.jobOpen);if(q){current=q;openCard(q.id);cardEditor.showHwp?.();}n.hidden=true;return;}if(e.target.closest('[data-job-close]'))n.hidden=true;});}return n;}
function showJob(title,stage,{done=null,error=''}={}){const n=jobBox(),at=done?3:jobStep(stage);n.hidden=false;n.dataset.state=error?'error':done?'done':'busy';
  n.innerHTML=`<div class="job-head"><b>${E(error?'변형 실패':done?'변형 완료':'변형 중')}</b><span>${E(title)}</span><button type="button" data-job-close aria-label="닫기">×</button></div>${error?`<p class="job-err">${E(error)}</p>`:`<ol class="lp-steps">${JOB_STEPS.map((x,i)=>`<li data-at="${i<at?'done':i===at?'now':''}">${i+1}. ${x}</li>`).join('')}</ol>`}${done?`<button type="button" class="job-open" data-job-open="${E(done.id)}">${E(done.number)}번 카드 보기</button>`:''}`;
  for(const ol of document.querySelectorAll(`.lp-steps[data-steps]`))ol.querySelectorAll('li').forEach((li,i)=>li.dataset.at=i<at?'done':i===at?'now':'');}
function pastStage(stage){if(!pastBusy)return;pastBusy.stage=stage;showJob(pastBusy.title,stage);libView?.refreshJob();pickCart();
  for(const b of document.querySelectorAll(`[data-cvconvert="${CSS.escape(pastBusy.id)}"]`)){
    if(!b.hasAttribute('aria-busy')){b.style.minWidth=b.offsetWidth+'px';b.setAttribute('aria-busy','true');}b.innerHTML=busyHtml(stage);
    const f=b.closest('figure.past');if(f){f.toggleAttribute('data-busy',true);const o=f.querySelector('.past-busy');if(o)o.querySelector('span').textContent=stage;else f.querySelector('.past-pic')?.insertAdjacentHTML('afterend',pastBusyHtml(stage));}}
  status(`${pastBusy.title} · ${stage}… (AI 없음)`);}
// 실패하면 그 그림 위에 짧은 이유를 4초 남긴다(맨 아래 상태 줄만으로는 놓치기 쉬움).
function pastIdle(failure=''){const id=pastBusy?.id;pastBusy=null;if(id&&!failure)queueMicrotask(()=>clearPastBusy(document));queueMicrotask(()=>{libView?.refreshJob();pickCart();});if(id)for(const b of document.querySelectorAll(`[data-cvconvert="${CSS.escape(id)}"]`)){b.removeAttribute('aria-busy');b.style.minWidth='';b.textContent='변형';const f=b.closest('figure.past');f?.removeAttribute('data-busy');const o=f?.querySelector('.past-busy');
    if(o&&failure){o.dataset.error='true';o.querySelector('.busy-ring')?.remove();o.querySelector('span').textContent=failure;setTimeout(()=>o.remove(),4000);}else o?.remove();}}
async function convertPast(item){
  if(convertingPast){status(`${convertingPast} 을(를) 바꾸는 중입니다. 끝나면 다시 눌러 주세요.`);for(const b of document.querySelectorAll('[data-cvconvert][aria-busy]'))b.animate?.([{scale:1},{scale:1.08},{scale:1}],{duration:260,easing:'cubic-bezier(.2,.9,.25,1.06)'});return;}
  if(data.questions.length>=500){status('문항은 500개까지 만들 수 있습니다.',true);return;}
  convertingPast=item.title;pastBusy={id:item.id,title:item.title,stage:''};pastStage('준비 중');
  try{
    const engine=await import('../convert/kice-engine.js?v=1019-convert'),drive=await import('../convert/es/drive-source.mjs');
    engine.setPdfSource(name=>{const path=name===item.pdfFile?item.publicPath:null;if(!path)throw Error('원본 PDF 경로를 찾지 못했습니다.');pastStage('원본 받는 중');return Promise.resolve(drive.downloadDriveFile(path)).then(r=>{pastStage('한글 문항으로 바꾸는 중');return r;});});
    pastStage('원본 받는 중');
    const r=item.record||[];
    const source={id:item.id,subject:item.subject,title:item.title,page:item.page,box:item.box,pdfFile:item.pdfFile,publicPath:item.publicPath,no:String(item.no),
      ...(r.length?{form:r[0],struct:r[1],layout:r[2],choiceShape:r[3],choiceArrange:r[4]}:{})};
    const {question:q,diag}=await engine.convertKice(source,{number:String(data.questions.length+1)});
    q.references=[{target:'question',label:`원본 기출 · ${item.title}`.slice(0,300),quote:'',page:item.page}];if(!q.source||q.source===item.title)q.source=`기출 변형 · ${item.title}`.slice(0,300);
    q.workflow='draft';
    pastStage('카드 여는 중');
    const ok=mutate(()=>{data.questions.push(q);const exam=['exam','card','desk'].includes(view.name)&&view.examId&&examById(data,view.examId);if(exam){addToExam(data,exam.id,q.id);renumberExam(data,exam.id);}});
    if(!ok)return;
    showJob(item.title,'',{done:{id:q.id,number:q.number}});
    const warn=(diag?.notes||[]).filter(n=>/못|확인|제외|원본 참고/.test(n));
    const done=`${item.title} → ${q.number}번 문항으로 가져왔습니다 · 원본은 근거로 연결${warn.length?' · 확인: '+warn[0]:''}`;
    status(done);notice(done);setTimeout(()=>status(done),1500);// 자동 저장 표시가 덮지 않게 한 번 더
  }catch(e){pastIdle(`가져오지 못했습니다 · ${e.message}`);showJob(item.title,'',{error:e.message});status(`${item.title} 변환 실패: ${e.message}`,true);}
  finally{convertingPast=null;pastIdle();}
}
const newDialog=createNewQuestionDialog($('#new-dialog'),{onCreate:shape=>mutate(()=>{if(data.questions.length>=500)throw Error('문항은 500개까지 만들 수 있습니다.');current=questionFromShape(shape,String(data.questions.length+1));data.questions.push(current);activeTab='composition';const exam=['exam','card','desk'].includes(view.name)&&view.examId&&examById(data,view.examId);if(exam){addToExam(data,exam.id,current.id);renumberExam(data,exam.id);}})&&(show('card'),true)});
$('#new').onclick=()=>newDialog.open();
$('#edit-detail').onclick=()=>openDetail();
$('#detail-dialog').addEventListener('close',()=>{grid?.finish();renderRows();renderSheetView();grid?.refresh({questionId:current?.id});});
$('#add').onclick=()=>{addParent=null;$('#add-dialog').showModal();};$('#duplicate').onclick=()=>mutate(()=>{if(data.questions.length>=500)throw Error('문항은 500개까지 만들 수 있습니다.');current=duplicateQuestion(current);current.number=String(data.questions.length+1);data.questions.push(current);});
function replay(which){grid?.finish(true);const source=which==='redo'?future:history,destination=which==='redo'?history:future,old=source.pop();if(!old)return;destination.push(copyTree(data));const id=current?.id;data=old;current=data.questions.find(q=>q.id===id)||data.questions[0]||null;editKey='';renderAll();remember();}
$('#undo').onclick=()=>replay('undo');$('#redo').onclick=()=>replay('redo');
// 열 머리 우클릭: 조판 보기 · 복제 · 삭제. (휴지통을 열 머리에 두면 '조판 보기'를 누르다 삭제가 눌린다.)
const ctx=document.createElement('div');ctx.id='ctx-menu';ctx.setAttribute('role','menu');ctx.hidden=true;document.body.append(ctx);
const closeCtx=()=>{ctx.hidden=true;};
document.addEventListener('pointerdown',e=>{if(!ctx.hidden&&!ctx.contains(e.target))closeCtx();},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!ctx.hidden){e.preventDefault();closeCtx();}},true);
$('#registry').addEventListener('contextmenu',e=>{const th=e.target.closest('thead th[data-id]');if(!th)return;e.preventDefault();const q=data.questions.find(x=>x.id===th.dataset.id);if(!q)return;choose(q);
  ctx.innerHTML=`<button type="button" role="menuitem" data-ctx="preview">조판 보기</button><button type="button" role="menuitem" data-ctx="duplicate">복제</button><button type="button" role="menuitem" data-ctx="delete" class="danger">삭제…</button>`;
  ctx.hidden=false;const w=ctx.offsetWidth,h=ctx.offsetHeight;Object.assign(ctx.style,{left:Math.min(e.clientX,innerWidth-w-8)+'px',top:Math.min(e.clientY,innerHeight-h-8)+'px'});ctx.querySelector('button').focus();});
ctx.addEventListener('click',e=>{const b=e.target.closest('[data-ctx]');if(!b||!current)return;closeCtx();if(b.dataset.ctx==='preview')void openTypeset();else if(b.dataset.ctx==='duplicate')$('#duplicate').click();else askDelete(current.id);});
// 문항 삭제: 카드·시트 열 머리의 휴지통, 구성 편집의 '문항 삭제' 모두 같은 확인 창을 쓴다. 되돌리기로 살릴 수 있다.
let pendingDelete=null;
function askDelete(id){const q=data.questions.find(x=>x.id===id);if(!q||grid?.finish()===false)return;pendingDelete=id;$('#delete-message').textContent=`${q.managementId||q.number+'번 문항'}을 삭제합니다. 되돌리기(⌘Z)로 복원할 수 있습니다.`;$('#delete-dialog').showModal();}
$('#delete-question').onclick=()=>{if(current)askDelete(current.id);};
$('#delete-confirm').onclick=()=>{const id=pendingDelete;pendingDelete=null;if(!id)return;mutate(()=>{const at=data.questions.findIndex(q=>q.id===id);data.questions=data.questions.filter(q=>q.id!==id);removeFromExam(data,id);if(current?.id===id)current=data.questions[Math.min(at,data.questions.length-1)]||null;});$('#delete-dialog').close();status('문항을 삭제했습니다 · 되돌리기(⌘Z)로 복원할 수 있습니다.');};
$('#filter').oninput=()=>{renderRows();grid?.refresh();};
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(grid?.finish()!==false)$('#export').click();return;}if((e.metaKey||e.ctrlKey)&&['z','y'].includes(e.key.toLowerCase())&&!e.target.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]),textarea,select,[contenteditable]')){e.preventDefault();replay(e.shiftKey||e.key.toLowerCase()==='y'?'redo':'undo');return;}if(e.key==='Escape'&&!document.querySelector('dialog[open]'))closeSources();});
function download(bytes,name,mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'){const url=URL.createObjectURL(new Blob([bytes],{type:mime})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
$('#export').onclick=async()=>{try{status('엑셀 만드는 중…');const bytes=await exportExcel(window.XLSX,window.JSZip,data);download(bytes,'5E_exam-문항.xlsx');status('엑셀 내려받기 완료 · 구성·표·그림·자료와 5E 원본을 함께 보관합니다.');}catch(e){status(e.message,true);}};
$('#top-more').onclick=e=>{e.stopPropagation();const m=$('#top-menu');m.hidden=!m.hidden;$('#top-more').setAttribute('aria-expanded',String(!m.hidden));};
document.addEventListener('click',e=>{if(!e.target.closest('.top-more')){$('#top-menu').hidden=true;$('#top-more').setAttribute('aria-expanded','false');}});
$('#top-menu').addEventListener('click',()=>{$('#top-menu').hidden=true;});
$('#send-hwp').onclick=()=>{const exam=examById(data,$('#send-hwp').dataset.exam);if(exam)void sendExam(exam);};
$('#import').onclick=()=>$('#excel-file').click();$('#excel-file').onchange=async()=>{const file=$('#excel-file').files[0];if(!file)return;try{
  status('파일 확인 중…');if(/\.xlsx$/i.test(file.name))pending=await importExcel(window.XLSX,window.JSZip,await file.arrayBuffer());else{if(file.size>32*1024*1024)throw Error('32 MB 이하의 문항 파일을 선택하세요.');const v=JSON.parse(await file.text());if(v.format===FORMAT)pending={...validate(v),exams:Array.isArray(v.exams)?v.exams.map(e=>({...e,items:(e.items||[]).filter(id=>v.questions.some(q=>q.id===id))})):[],backedIds:v.questions.map(q=>q.id),warnings:[]};else{const {decodePoolBundle}=await import('../../../js/exampool-model.js?v=1013-exampool');const pack=decodePoolBundle(JSON.stringify(v));pending=validate({format:FORMAT,questions:pack.items.map(fromLegacy),documents:pack.resources.map(d=>({id:d.id,name:d.title,kind:d.kind==='교과서'?'textbooks':'references',mime:d.mime,data:`data:${d.mime};base64,${d.base64}`,pages:d.pages}))});pending.backedIds=pack.items.map(q=>q.id);pending.warnings=[];}}
  const matches=pending.questions.filter(q=>data.questions.some(x=>x.id===q.id)).length;$('#import-count').textContent=`${pending.questions.length}문항 · ${pending.documents.length}자료${pending.exams?.length?` · 시험지 ${pending.exams.length}개`:''} · 기존 문항과 일치 ${matches}개${pending.warnings?.length?' · '+pending.warnings.join(' '):''}`;$('#import-preview').innerHTML='<table><thead><tr><th>번호</th><th>답안형</th><th>구성</th><th>발문</th></tr></thead><tbody>'+pending.questions.slice(0,20).map(q=>`<tr><td>${E(q.number)}</td><td>${E(q.type)}</td><td>${q.blocks.length}개</td><td>${E(q.ask)}</td></tr>`).join('')+'</tbody></table>';$('#import-dialog').showModal();status('불러올 내용을 확인하세요. 적용 전에는 기존 입력이 바뀌지 않습니다.');
}catch(e){pending=null;status(e.message,true);}finally{$('#excel-file').value='';}};
$('#apply-import').onclick=()=>{if(!pending)return;const applied=mutate(()=>{const update=$('input[name="import-mode"]:checked').value==='update',docMap=new Map();for(const incoming of pending.documents){const existing=data.documents.find(d=>d.id===incoming.id);if(existing&&JSON.stringify(existing)!==JSON.stringify(incoming)){const d=clone(incoming);d.id=uid();data.documents.push(d);docMap.set(incoming.id,d.id);}else if(!existing)data.documents.push(clone(incoming));}
  const qidMap=new Map();for(const incoming of pending.questions){const q=update?clone(incoming):duplicateQuestion(incoming);qidMap.set(incoming.id,q.id);q.references.forEach(r=>{if(docMap.has(r.documentId))r.documentId=docMap.get(r.documentId);});const at=data.questions.findIndex(v=>v.id===q.id);if(update&&at>=0)data.questions[at]=keepAppOnly(q,data.questions[at]);else data.questions.push(q);current=data.questions[update&&at>=0?at:data.questions.length-1];}
  // 시험지도 함께 들여온다(H5): 문항 ID가 새로 매겨졌으면(복사본) 새 ID로 옮기고, 한 문항은 한 시험지에만 있게 다른 시험지에서는 뺀다.
  for(const incoming of pending.exams||[]){const items=incoming.items.map(id=>qidMap.get(id)).filter(Boolean);if(!items.length)continue;
    for(const e of data.exams)e.items=e.items.filter(id=>!items.includes(id));
    const same=update?data.exams.find(e=>e.id===incoming.id):null;
    if(same)Object.assign(same,{title:incoming.title,status:incoming.status,items,updatedAt:new Date().toISOString()});
    else data.exams.push({...newExam(incoming.title),status:incoming.status||'drafting',items,...(incoming.sentAt?{sentAt:incoming.sentAt}:{})});}if(data.questions.length>500||data.documents.length>40)throw Error('문항 500개 또는 자료 40개를 초과합니다.');});if(applied){$('#import-dialog').close();pending=null;}else $('#import-count').textContent=$('#status').textContent;};
function fileData(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('파일을 읽지 못했습니다.'));r.readAsDataURL(file);});}
$('#figure-file').onchange=async()=>{const file=$('#figure-file').files[0],owner=imageTarget;if(!file||!owner)return;try{if(file.size>5*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('5 MB 이하의 PNG·JPEG·WebP 그림을 선택하세요.');const value=await fileData(file),image=await loadImage(value);if(image.naturalWidth*image.naturalHeight>40000000)throw Error('그림 크기를 줄여주세요.');const figure={name:file.name,data:value,width:image.naturalWidth,height:image.naturalHeight};if(file.type==='image/png'&&embedded){window.parent.postMessage({channel:'5e-question-sheet',action:'read-figure',qid:owner.qid,key:owner.key,figure},location.origin);return;}mutate(()=>{const q=data.questions.find(q=>q.id===owner.qid),holder=imageHolder(q,owner.key);if(!holder)throw Error('그림을 넣을 구성을 찾지 못했습니다.');holder.figure=figure;});}catch(e){status(e.message,true);}finally{$('#figure-file').value='';imageTarget=null;}};
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==window.parent||e.data?.channel!=='5e-question-sheet')return;const m=e.data;if(m.error){if(m.requestId===handoffRequest){handoffRequest=null;$('#handoff').disabled=false;}status(m.error,true);return;}if(m.action==='handoff-ready'&&m.requestId===handoffRequest){handoffRequest=null;$('#handoff').disabled=false;status('한글로 보내기 완료'+(m.warnings?.length?' · '+m.warnings.join(' '):''));return;}if(m.action==='pick-cancelled'){status('그림 가져오기를 취소했습니다.');return;}if(m.action==='figure-ready')mutate(()=>{const q=data.questions.find(q=>q.id===m.qid),holder=q&&imageHolder(q,m.key);if(!holder)throw Error('그림을 넣을 구성을 찾지 못했습니다.');holder.figure=m.figure;});});
if(embedded){$('#handoff').hidden=false;$('#handoff').onclick=async()=>{if(!current||handoffRequest)return;try{const question=handoffQuestion(current);const {typesetMatches,LAYOUT_VERSION}=await import('./typeset-model.js?v=1014-compact-panel');if(!current.typeset||current.typeset.layoutVersion!==LAYOUT_VERSION||!await typesetMatches(current.typeset,current))throw Error('문항 조판을 열어 확인하고 조판 저장을 누른 뒤 보내세요.');await saveQueue;const requestId=uid();handoffRequest=requestId;$('#handoff').disabled=true;status('선택 문항을 한글로 보내는 중…');window.parent.postMessage({channel:'5e-question-sheet',action:'handoff',requestId,packet:{format:FORMAT,version:2,question,typeset:current.typeset}},location.origin);}catch(e){status(e.message,true);}};$('#return').hidden=false;$('#return').onclick=async()=>{await saveQueue.catch(()=>{});window.parent.postMessage({channel:'5e-question-sheet',action:'close'},location.origin);};}
$('#example').onclick=async()=>{try{const v=validate(await(await fetch(new URL('./examples.json',import.meta.url))).json());mutate(()=>{const qs=v.questions.map(duplicateQuestion);data.questions.push(...qs);current=qs[0];activeTab='composition';});}catch(e){status(e.message,true);}};
// Reference pane is deliberately closed until requested.
const loadRuntime=createPdfRuntimeLoader();let runtimeQueue=Promise.resolve();const runtimeTask=fn=>{const p=runtimeQueue.catch(()=>{}).then(async()=>fn(await loadRuntime()));runtimeQueue=p;return p;};
const bytes=data=>Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));
function showSources(){if($('#detail-dialog').open)$('#detail-dialog').close();$('#sources').hidden=false;$('#sources-toggle').setAttribute('aria-expanded','true');renderSources();}// 라이브러리 칸에 붙은 자료 열람(기준·자료 탭)은 칸이 주인이다 — 조판 열기·Esc가 칸 안 내용을 숨기지 않게 한다.
function closeSources(){if($('#sources').classList.contains('docked'))return;$('#sources').hidden=true;$('#sources-toggle').setAttribute('aria-expanded','false');sourceSeq++;}
$('#sources-toggle').onclick=()=>{sourceTarget='question';$('#sources').hidden?showSources():closeSources();};$('#sources-close').onclick=closeSources;$('#source-search').oninput=()=>{selectedStandard=null;renderSources();};
function refLinker(){return current?`<p class="muted">연결 대상: ${E(targetLabel(sourceTarget))}</p><textarea id="quote" class="source-quote" rows="2" placeholder="근거 문장 입력 (선택)" aria-label="근거 인용"></textarea><button id="attach-ref" class="primary" style="margin-top:8px">이 자료를 근거로 연결</button>`:'';}
const STD_KINDS=[['전체',[]],['중학교',['과학']],['공통',['통합과학1','통합과학2','과학탐구실험1','과학탐구실험2']],['일반 선택',['물리학','화학','생명과학','지구과학']],['진로 선택',['역학과 에너지','전자기와 양자','물질과 에너지','화학 반응의 세계','세포와 물질대사','생물의 유전','지구시스템과학','행성우주과학']],['융합 선택',['과학의 역사와 문화','기후변화와 환경생태','융합과학 탐구']]];
let stdPick=(()=>{try{return JSON.parse(localStorage.getItem('5e.exampool.stdPick'))||{kind:'전체',subject:''};}catch{return {kind:'전체',subject:''};}})();
function renderSources(){const query=$('#source-search').value.toLowerCase(),seq=++sourceSeq;$('#sources').dataset.tab=sourceTab;document.querySelectorAll('[data-source]').forEach(n=>n.setAttribute('aria-selected',String(n.dataset.source===sourceTab)));
  if(sourceTab==='standards'){
    if(!standards){$('#source-content').innerHTML='<p class="muted">성취기준 자료를 불러오는 중입니다.</p>';return;}const all=standards.standards||standards.items||[];
    if(selectedStandard){const s=selectedStandard;$('#source-content').innerHTML=`<button id="standard-back">목록으로</button><article class="standard-detail"><h3>${E(s.code)}</h3><p>${E(s.text)}</p>${s.explain?`<details open><summary>성취기준 해설</summary><p>${E(s.explain)}</p></details>`:''}<button id="use-standard" class="primary" ${!current?'disabled':''}>문항 성취기준으로 선택</button><p class="muted">${E(standards.source)}</p></article>`;$('#standard-back').onclick=()=>{selectedStandard=null;renderSources();};$('#use-standard').onclick=()=>{mutate(()=>{current.standardCode=s.code;{const u=standards.units?.find(u=>u.unit_no===s.unit_no);if(u&&!current.unitLarge)current.unitLarge=`${s.subject} › ${u.name}`;}current.references.push({target:sourceTarget,label:s.code,quote:s.text,standardCode:s.code});});renderSources();};return;}
    // 과목 고르기 두 단계(10-20 시안 16): ① 과목 성격 → ② 그 안의 과목. 마지막에 고른 것은 기억한다.
    const kinds=STD_KINDS.map(([k,subs])=>[k,k==='전체'?[]:subs.filter(n=>all.some(s=>s.subject===n))]),kind=kinds.find(([k])=>k===stdPick.kind)||kinds[0],subs=kind[1],sub=subs.includes(stdPick.subject)?stdPick.subject:'';
    const inKind=s=>kind[0]==='전체'||(sub?s.subject===sub:subs.includes(s.subject)),matches=all.filter(s=>inKind(s)&&[s.code,s.text,s.subject,s.explain].join(' ').toLowerCase().includes(query));
    $('#source-content').innerHTML=`<div class="std-kinds" role="group" aria-label="과목 성격">${kinds.map(([k])=>`<button type="button" data-stdkind="${E(k)}" aria-pressed="${k===kind[0]}">${E(k)}</button>`).join('')}</div>${subs.length?`<div class="std-subs" role="group" aria-label="과목"><button type="button" data-stdsub="" aria-pressed="${!sub}">모두</button>${subs.map(n=>`<button type="button" data-stdsub="${E(n)}" aria-pressed="${n===sub}">${E(n)}</button>`).join('')}</div>`:''}<p class="muted std-crumb">${E(kind[0]==='전체'?'전체 과목':kind[0]+' › '+(sub||'모두'))} · ${matches.length}개 성취기준</p>${matches.slice(0,150).map(s=>`<button class="standard-item" data-standard="${E(s.code)}"><strong>${E(s.code)} · ${E(s.subject)}</strong><span>${E(s.text)}</span></button>`).join('')}`;
    const keep=()=>{try{localStorage.setItem('5e.exampool.stdPick',JSON.stringify(stdPick));}catch{}renderSources();};
    $('#source-content').querySelectorAll('[data-stdkind]').forEach(n=>n.onclick=()=>{stdPick={kind:n.dataset.stdkind,subject:''};keep();});
    $('#source-content').querySelectorAll('[data-stdsub]').forEach(n=>n.onclick=()=>{stdPick={kind:kind[0],subject:n.dataset.stdsub};keep();});$('#source-content').querySelectorAll('[data-standard]').forEach(n=>n.onclick=()=>{selectedStandard=all.find(s=>s.code===n.dataset.standard);renderSources();});return;
  }
  const docs=data.documents.filter(d=>(sourceTab==='textbooks'?d.kind==='textbooks':d.kind!=='textbooks')&&[d.name,...d.pages].join(' ').toLowerCase().includes(query));if(!docs.some(d=>d.id===doc?.id)){doc=docs[0]||null;page=1;}
  if($('#sources').classList.contains('docked')){// 라이브러리 칸 안에서는 자료 고르기·쪽 넘김·근거 연결을 두 줄로 줄이고, 쪽은 칸 높이에 통째로 맞춘다.
    $('#source-content').innerHTML=`<div class="doc-bar">${docs.length?`<select id="doc-pick" aria-label="자료 고르기">${docs.map(d=>`<option value="${d.id}"${d.id===doc?.id?' selected':''}>${E(d.name)} · ${d.pages.length}쪽</option>`).join('')}</select>`:'<span class="muted">PDF·이미지·텍스트를 열어 원문을 확인하고 근거를 연결하세요.</span>'}<button id="add-doc" title="${sourceTab==='textbooks'?'교과서':'자료'} 파일 열기">파일 열기</button>${doc?'<button id="download-doc" title="원본 내려받기">원본</button>':''}</div>${doc?`<div class="doc-page" id="doc-view">원문 여는 중…</div><div class="doc-nav"><button id="prev-page" ${page<=1?'disabled':''} aria-label="이전 쪽">‹</button><input id="doc-page" type="number" aria-label="자료 쪽수" value="${page}" min="1" max="${doc.pages.length}"><span>/ ${doc.pages.length}</span><button id="next-page" ${page>=doc.pages.length?'disabled':''} aria-label="다음 쪽">›</button>${current?'<input id="quote" class="source-quote" placeholder="근거 문장 (선택)" aria-label="근거 인용"><button id="attach-ref" class="primary" title="'+E(targetLabel(sourceTarget))+'에 이 쪽을 근거로 연결">근거로 연결</button>':''}</div>`:''}`;
    if($('#doc-pick'))$('#doc-pick').onchange=e=>{doc=data.documents.find(d=>d.id===e.target.value);page=1;renderSources();};
  }else $('#source-content').innerHTML=`<div class="source-buttons"><button id="add-doc">${sourceTab==='textbooks'?'교과서 파일 열기':'자료 파일 열기'}</button>${$('#sources').classList.contains('docked')?'':'<button id="past-library">물리 기출 찾기</button>'}</div>${docs.map(d=>`<button class="doc-list" data-doc="${d.id}">${E(d.name)} · ${d.pages.length}쪽</button>`).join('')}${doc?`<div class="doc-nav"><button id="prev-page" ${page<=1?'disabled':''}>이전</button><input id="doc-page" type="number" aria-label="자료 쪽수" value="${page}" min="1" max="${doc.pages.length}"><span>/ ${doc.pages.length}쪽</span><button id="next-page" ${page>=doc.pages.length?'disabled':''}>다음</button><button id="download-doc">원본</button></div><div class="doc-page" id="doc-view">원문 여는 중…</div>${refLinker()}`:'<p class="muted">PDF·이미지·텍스트를 열어 원문을 확인하고 근거를 연결하세요.</p>'}`;
  $('#add-doc').onclick=()=>$('#source-file').click();if($('#past-library'))$('#past-library').onclick=loadPastLibrary;document.querySelectorAll('[data-doc]').forEach(n=>n.onclick=()=>{doc=data.documents.find(d=>d.id===n.dataset.doc);page=1;renderSources();});if(!doc)return;
  $('#prev-page').onclick=()=>{page--;renderSources();};$('#next-page').onclick=()=>{page++;renderSources();};$('#doc-page').oninput=e=>{if(e.target.value==='')return;page=Math.max(1,Math.min(doc.pages.length,Number(e.target.value)||1));$('#prev-page').disabled=page<=1;$('#next-page').disabled=page>=doc.pages.length;$('#doc-view').textContent='원문 여는 중…';const seq=++sourceSeq;void showDocument(doc,page,seq).catch(error=>{if(seq===sourceSeq)sourceSay(error.message,true);});};$('#doc-page').onchange=e=>{page=Math.max(1,Math.min(doc.pages.length,Number(e.target.value)||1));renderSources();};if($('#download-doc'))$('#download-doc').onclick=()=>download(bytes(doc.data),doc.name,doc.mime);$('#attach-ref').onclick=()=>{const quote=$('#quote').value;mutate(()=>current.references.push({target:sourceTarget,label:doc.name+' '+page+'쪽',documentId:doc.id,page,quote}));status(targetLabel(sourceTarget)+'에 자료의 쪽수와 근거를 연결했습니다.');};void showDocument(doc,page,seq).catch(e=>{if(seq===sourceSeq)sourceSay(e.message,true);});
}
async function showDocument(d,p,seq){if(d.mime==='application/pdf'){const result=await runtimeTask(async runtime=>{if(seq!==sourceSeq)return null;if(!runtime.getDocument(d.id))await runtime.openDocumentResource({id:d.id,title:d.name,source:{kind:'file',locator:d.id,displayName:d.name},data:bytes(d.data)},{id:d.id,title:d.name,pageCount:d.pages.length,pages:[],status:'indexed'});return seq===sourceSeq?runtime.renderPage({documentId:d.id,pageNumber:p,dpi:110}):null;});if(!result||seq!==sourceSeq)return;const url=await fileData(new Blob([result.bytes],{type:'image/png'}));if(seq===sourceSeq)$('#doc-view').innerHTML=`<img src="${url}" alt="${E(d.name)} ${p}쪽">`;}else if(seq===sourceSeq)$('#doc-view').innerHTML=d.mime.startsWith('image/')?`<img src="${E(d.data)}" alt="${E(d.name)}">`:`<pre>${E(d.pages[p-1])}</pre>`;}
async function addDocument(file,kind){if(file.size>5*1024*1024)throw Error('자료는 5 MB 이하로 열어주세요.');const mime=file.type||(/\.txt$/i.test(file.name)?'text/plain':'');if(!['application/pdf','image/png','image/jpeg','image/webp','text/plain'].includes(mime))throw Error('PDF·그림·텍스트 파일을 선택하세요.');const d={id:uid(),name:file.name,kind,mime,data:await fileData(file),pages:['']};if(mime==='application/pdf'){const record=await runtimeTask(r=>r.openDocument({id:d.id,title:d.name,source:{kind:'file',locator:d.id,displayName:d.name},data:bytes(d.data)}));d.pages=record.pages.map(p=>p.text);}if(mime==='text/plain')d.pages=[await file.text()];mutate(()=>{data.documents.push(d);doc=d;page=1;});renderSources();}
$('#source-file').onchange=async()=>{const file=$('#source-file').files[0];if(!file)return;try{if($('#sources').classList.contains('docked')){$('#source-search').value='';cardEditor.clearSourceSearch?.();}// 새로 연 파일이 지난 검색어에 걸러져 안 보이지 않게
sourceSay('자료 여는 중…');await addDocument(file,sourceTab==='textbooks'?'textbooks':'references');sourceSay('자료 원문을 열었습니다.');}catch(e){sourceSay(e.message,true);}finally{$('#source-file').value='';}};
function pastLabel(d){const m=(d.title||d.name||'').match(/^p([12])_(\d{4})_(06|09|11)\.pdf$/);return m?`${m[2]}학년도 · 물리학${m[1]==='1'?'Ⅰ':'Ⅱ'} · ${{'06':'6월 모의평가','09':'9월 모의평가','11':'수능'}[m[3]]}`:d.title||d.name;}
async function loadPastLibrary(){try{$('#source-content').innerHTML='<p class="muted">물리 기출 목록 여는 중…</p>';const payload=await(await fetch(new URL('../../pdf-library/catalog-bootstrap.json',import.meta.url))).json();const catalog=payload.payload?.catalog||payload;const docs=(catalog.documents||catalog.items||[]).filter(d=>/물리/.test(d.source?.locator||d.title||d.name||''));$('#source-content').innerHTML='<button id="back-docs">내 자료로</button><p class="muted">파일을 선택하면 원문을 열고 이 작업에 보관합니다.</p>'+docs.map((d,i)=>`<button class="doc-list" data-past="${i}">${E(pastLabel(d))}</button>`).join('');$('#back-docs').onclick=renderSources;document.querySelectorAll('[data-past]').forEach(n=>n.onclick=async()=>{try{const d=docs[Number(n.dataset.past)],locator=d.source?.locator||d.locator;const relative=locator.replace(/^5e\.shared\.drive\//,'');const url='https://5e-google-drive-gateway.5e-desktop.workers.dev/v1/google-drive/folders/1N46Woe4wIXs-PoUpVf0Uu4hPkSIUBqgX/public/'+relative.split('/').map(encodeURIComponent).join('/');sourceSay('기출 원문 여는 중…');const response=await fetch(url);if(!response.ok)throw Error('기출 원문을 열지 못했습니다.');const blob=await response.blob();await addDocument(new File([blob],(d.title||d.name).replace(/\.pdf$/i,'')+'.pdf',{type:'application/pdf'}),'past');sourceSay('기출 원문을 보관했습니다.');}catch(e){sourceSay(e.message,true);}});}catch(e){sourceSay(e.message,true);}}
function openRef(ref){sourceTarget=ref.target;if(ref.documentId){doc=data.documents.find(d=>d.id===ref.documentId);page=ref.page;sourceTab=doc?.kind==='textbooks'?'textbooks':'references';}else{sourceTab='standards';selectedStandard=(standards?.standards||[]).find(s=>s.code===ref.standardCode)||null;}showSources();}
let typesetter=null,typesetRequest,typesetTransition=null;
// 조판 기준(10-22): 문항 → 시험지 → 수능 틀. 간격 보기의 값 바꾸기와 기준 메뉴가 여기로 온다.
const typesetStandardOf=q=>q?standardFor(q,{exam:examOf(data,q.id),standards:typesetStandards}):KICE_STANDARD;
function refreshTypeset(){if(current&&typesetter){$('#typeset-refresh').hidden=false;void requestTypeset(current);}}
async function onTypesetGap(target,value,scope,stdKey){const q=current;if(!q)return;
  try{
    if(scope==='std'&&value!==undefined){
      const now=typesetStandardOf(q);let s=now.id===KICE_ID?(typesetStandards.find(x=>x.name==='수능 틀 (내 설정)')||copyStandard(KICE_STANDARD,{name:'수능 틀 (내 설정)'})):structuredClone(now);
      s.gaps={...s.gaps,[stdKey]:value};s.version=(s.version||1)+1;
      await saveTypesetStandards([...typesetStandards.filter(x=>x.id!==s.id),s]);
      if(q.standardId!==s.id)mutate(()=>{q.standardId=s.id;},{render:false});else refreshTypeset();
      status(`조판 기준 「${s.name}」의 간격을 ${value}mm로 바꿨습니다.`);return;
    }
    mutate(()=>{
      if(target.kind==='ask'||target.kind==='choices'){const k=target.kind+'Gap';if(value===undefined)delete q[k];else q[k]=value;}
      else{const b=q.blocks.find(x=>x.id===target.id);if(!b)return;if(value===undefined)delete b.gap;else b.gap=value;}
    },{render:false});
  }catch(e){status(e.message,true);}
}
// 「⚙ 조판 설정」(10-23): 값 하나를 틀에 넣는다. 수능 틀이면 「수능 틀 (내 설정)」으로 복제하고, 수능 틀을 쓰던 모든 문항이 그 틀을 쓴다.
// 「이 문항만 예외」는 지금 틀을 복제해 이 문항에만 걸고(source.kind='exception'), 끄면 원래 틀로 돌아간다.
const setPath=(o,path,v)=>{const ks=path.split('.'),last=ks.pop();let t=o;for(const k of ks){t[k]=Array.isArray(t[k])?[...t[k]]:{...t[k]};t=t[k];}t[last]=v;};
async function onTypesetSetting(a){const q=current;if(!q)return;
  try{
    const now=typesetStandardOf(q),own=now.source?.kind==='exception'&&now.source.qid===q.id;
    // 팝업의 「모든 문항에 적용」/「이 문항에 적용」: 초안 틀 전체를 한 번에 저장한다(값만 — 이름·출처는 저장할 틀 것을 지킨다).
    if(a.apply){
      const values=t=>{const s={...structuredClone(a.apply),id:t.id,name:t.name,base:t.base,source:t.source,version:(t.version||1)+1};validateStandard(s);return s;};
      if(a.exception){
        if(own){const s=values(now);await saveTypesetStandards([...typesetStandards.filter(x=>x.id!==s.id),s]);refreshTypeset();}
        else{const s=values(copyStandard(now,{name:`${now.name} · ${q.number}번만`,source:{kind:'exception',qid:q.id,from:now.id}}));
          await saveTypesetStandards([...typesetStandards,s]);mutate(()=>{q.standardId=s.id;},{render:false});}
        status(`${q.number}번에만 적용했습니다(예외).`);return true;}
      // 예외를 끄고 적용하면 이 문항은 원래 틀로 돌아가고, 초안 값은 그 틀(모든 문항)에 건다.
      let shared=now,drop=[];
      if(own){const from=now.source.from;shared=from&&from!==KICE_ID?typesetStandards.find(x=>x.id===from)||KICE_STANDARD:KICE_STANDARD;drop=[now.id];
        mutate(()=>{if(shared.id===KICE_ID)delete q.standardId;else q.standardId=shared.id;},{render:false});}
      const fromKice=shared.id===KICE_ID,target=fromKice?(typesetStandards.find(x=>x.name==='수능 틀 (내 설정)')||copyStandard(KICE_STANDARD,{name:'수능 틀 (내 설정)'})):shared,s=values(target);
      await saveTypesetStandards([...typesetStandards.filter(x=>x.id!==s.id&&!drop.includes(x.id)),s]);
      if(fromKice)mutate(()=>{for(const x of data.questions)if(!x.standardId&&typesetStandardOf(x).id===KICE_ID)x.standardId=s.id;},{render:false});else refreshTypeset();
      status(`틀 「${s.name}」에 적용했습니다 · 이 틀을 쓰는 모든 문항에 걸립니다.`);return true;
    }
    if(a.exception!==undefined){
      if(a.exception&&!own){const s=copyStandard(now,{name:`${now.name} · ${q.number}번만`,source:{kind:'exception',qid:q.id,from:now.id}});
        await saveTypesetStandards([...typesetStandards,s]);mutate(()=>{q.standardId=s.id;},{render:false});status(`${q.number}번만 예외로 — 이제 바꾸는 값은 이 문항에만 걸립니다.`);}
      else if(!a.exception&&own){const from=now.source.from;mutate(()=>{if(!from||from===KICE_ID)delete q.standardId;else q.standardId=from;},{render:false});
        await saveTypesetStandards(typesetStandards.filter(x=>x.id!==now.id));status(`${q.number}번 예외를 끄고 틀 값으로 돌아갔습니다.`);}
      return;}
    if(a.reset){if(now.id===KICE_ID)return;const s={...structuredClone(KICE_STANDARD),id:now.id,name:now.name,base:KICE_ID,source:now.source,version:(now.version||1)+1};
      await saveTypesetStandards([...typesetStandards.filter(x=>x.id!==s.id),s]);refreshTypeset();status(`「${s.name}」 값을 수능 틀 값으로 되돌렸습니다.`);return;}
    if(a.path){
      const fromKice=now.id===KICE_ID;let s=fromKice?(typesetStandards.find(x=>x.name==='수능 틀 (내 설정)')||copyStandard(KICE_STANDARD,{name:'수능 틀 (내 설정)'})):structuredClone(now);
      s=structuredClone(s);setPath(s,a.path,a.value);s.version=(s.version||1)+1;validateStandard(s);
      await saveTypesetStandards([...typesetStandards.filter(x=>x.id!==s.id),s]);
      if(fromKice)mutate(()=>{for(const x of data.questions)if(!x.standardId&&typesetStandardOf(x).id===KICE_ID)x.standardId=s.id;},{render:false});else refreshTypeset();
      status(own?`${q.number}번만 바꿨습니다.`:`틀 「${s.name}」을 바꿨습니다 · 이 틀을 쓰는 모든 문항에 적용`);
    }
  }catch(e){status(e.message,true);return false;}
}
// 기준 파일(.5e-typeset.json)에 이 기준으로 등록한 학교 양식 파일도 담는다(base64) — 다른 선생님이 가져오면 양식도 함께 등록.
const b64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);};
function standardFileText(standard){const form=typesetForms.find(f=>f.standardId===standard.id);const base=JSON.parse(exportStandardText(standard));
  if(form)base.form={name:form.name,fileName:form.fileName,encrypted:!!form.encrypted,structure:form.structure,base64:b64(new Uint8Array(form.bytes))};return JSON.stringify(base,null,2);}
async function onTypesetStandard(action){const q=current;
  try{
    if(action.error)throw Error(action.error);
    if(action.download){const s=typesetStandardOf(q),blob=new Blob([standardFileText(s)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${s.name.replace(/[\\/:*?"<>|]/g,'_')}.5e-typeset.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);return;}
    if(action.importFile){const raw=await action.importFile.text();return onTypesetStandard({imported:importStandard(raw),raw});}
    if(action.school){schoolFor=null;$('#school-file-input').value='';$('#school-file-input').click();return;}
    if(action.imported){const s=action.imported;delete s.form;await saveTypesetStandards([...typesetStandards.filter(x=>x.id!==s.id),s]);
      let raw=null;try{raw=JSON.parse(action.raw||'null');}catch{}const f=raw?.form;
      if(f?.base64){const bytes=Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0));await saveTypesetForms([...typesetForms,{id:'form_'+uid(),name:f.name||s.name,fileName:f.fileName||'양식.hwpx',encrypted:!!f.encrypted,bytes,structure:f.structure||{},standardId:s.id,createdAt:new Date().toISOString()}]);renderAll();}
      status(`조판 기준 「${s.name}」을 가져왔습니다${f?.base64?' · 시험지 양식도 등록했습니다':''}. 메뉴에서 고르면 이 문항에 씁니다.`);return;}
    if(action.saveAs){const s=copyStandard(typesetStandardOf(q),{name:action.saveAs});await saveTypesetStandards([...typesetStandards,s]);if(q)mutate(()=>{q.standardId=s.id;},{render:false});status(`조판 기준 「${s.name}」으로 저장했습니다.`);return;}
    // 학교 기준을 고르면 문항 기준 용지도 그 기준 용지로(단 폭이 기준을 따르게). 수능 틀로 돌아가면 용지는 그대로 둔다.
    // 틀 고르기(10-23): 틀은 모든 문항에 건다 — 「이 문항만 예외」로 둔 문항만 빼고.
    if(action.pick&&q){const s=typesetStandards.find(x=>x.id===action.pick);mutate(()=>{for(const x of data.questions){if(typesetStandardOf(x).source?.kind==='exception')continue;if(action.pick===KICE_ID)delete x.standardId;else{x.standardId=action.pick;if(s?.paper?.size)x.paper=s.paper.size;}}},{render:false});status(`틀 「${s?.name||'수능 틀'}」을 모든 문항에 걸었습니다.`);}
  }catch(e){status(e.message,true);}
}
// 학교 양식에서 기준 만들기: 파일 → 엔진으로 읽기 → 찾은 값 표 → 이름 붙여 저장하고 이 문항에 쓴다.
let schoolDraft=null,schoolFor=null;// schoolFor: 시험지 화면에서 등록하면 {exam} — 그 시험지 양식으로 고르고 문항 기준은 건드리지 않는다.
// 암호 입력 창: 선생님이 직접 넣는 암호만 받는다. 돌려준 뒤 입력칸을 비운다(저장·기록하지 않음).
function askPassword(message){const dialog=$('#password-dialog'),input=$('#password-input');$('#password-message').textContent=`${message} 암호는 이 파일을 여는 데만 쓰고 저장하지 않습니다.`;input.value='';
  return new Promise(resolve=>{dialog.addEventListener('close',()=>{const value=dialog.returnValue==='ok'&&input.value?input.value:null;input.value='';resolve(value);},{once:true});dialog.showModal();input.focus();});}
$('#school-file-input').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;
  try{status('학교 양식을 읽는 중…');typesetter||=makeTypesetter();const buffer=await file.arrayBuffer();let read=null,password='',message='';
    for(;;){try{read=await typesetter.readSchoolForm(buffer,file.name,password);break;}catch(error){if(!error.needsPassword)throw error;password=await askPassword(error.message);if(password===null){status('학교 양식 열기를 그만두었습니다.');return;}}}
    schoolDraft={standard:read.standard,structure:read.structure,bytes:new Uint8Array(buffer),fileName:file.name,encrypted:!!password};password='';
    {const st=read.structure;$('#school-structure').textContent=st.firstQuestion>=0?`양식 구조: ${st.pages}쪽 · ${st.columns}단 · 머리 표 ${st.headTables}개${st.header?' · 머리말':''}${st.footer?' · 꼬리말':''} · 문항 자리 ${st.firstQuestion+1}번째 문단부터(예시 문항 ${st.questions}개는 시험지를 묶을 때 비움)`:'양식 구조: 「1.」처럼 번호로 시작하는 문단을 못 찾아, 시험지를 묶으면 양식 끝에 문항을 붙입니다.';}
    $('#school-file').textContent=`${file.name} · 한글 엔진으로 읽은 값`;
    $('#school-rows').innerHTML=read.rows.map(r=>`<tr data-found="${r.found}"><td>${E(r.label)}</td><td>${E(r.value)}${r.note?`<small>${E(r.note)}</small>`:''}</td><td>${r.found?'읽음':'수능 틀'}</td></tr>`).join('');
    $('#school-name').value=read.standard.name;$('#school-keep-form').checked=true;$('#school-keep-form').disabled=!!schoolFor;$('#school-save').textContent=schoolFor?'양식으로 등록하고 이 시험지에 쓰기':'기준으로 저장하고 이 문항에 쓰기';$('#school-dialog').showModal();status('학교 양식을 읽었습니다. 값을 확인하고 저장하세요.');
  }catch(error){status(`학교 양식을 읽지 못했습니다: ${error.message}`,true);}
});
$('#school-save').addEventListener('click',async()=>{if(!schoolDraft)return;const name=$('#school-name').value.trim();if(!name){$('#school-name').focus();return;}
  try{const s={...schoolDraft.standard,name};validateStandard(s);await saveTypesetStandards([...typesetStandards,s]);
    let formId='';if($('#school-keep-form').checked||schoolFor){const d=schoolDraft;formId='form_'+uid();await saveTypesetForms([...typesetForms,{id:formId,name,fileName:d.fileName,encrypted:d.encrypted,bytes:d.bytes,structure:d.structure,standardId:s.id,createdAt:new Date().toISOString()}]);}
    $('#school-dialog').close();schoolDraft=null;
    if(schoolFor){const exam=examById(data,schoolFor.exam);schoolFor=null;if(exam)mutate(()=>{exam.formId=formId;exam.updatedAt=new Date().toISOString();});status(`학교 양식 「${name}」을 등록하고 이 시험지에 썼습니다.`);return;}
    renderAll();
    const q=current;if(q)mutate(()=>{q.standardId=s.id;if(s.paper?.size)q.paper=s.paper.size;},{render:false});status(`조판 기준 「${s.name}」을 만들어 이 문항에 썼습니다.`);}catch(error){status(error.message,true);}
});
function makeTypesetter(){return createTypesetter({standardOf:typesetStandardOf,standardsOf:()=>typesetStandards,onGap:onTypesetGap,onStandard:action=>action.exportText?standardFileText(action.exportText):onTypesetStandard(action),onSetting:onTypesetSetting,onSlot:(action,b,qid)=>{const q=data.questions.find(x=>x.id===qid);if(!q)return;if(current?.id!==q.id)choose(q);slotAction(action,q,b.id);},host:$('#native-editor'),status:$('#typeset-status'),paper:$('#paper-size'),columns:$('#paper-columns'),save:$('#typeset-save'),download:$('#typeset-download'),onSave:async(snapshot,questionId)=>{
          const target=data.questions.find(q=>q.id===questionId);if(!target)throw Error('문항이 삭제되어 조판을 저장할 수 없습니다.');
          const {questionFingerprint}=await import('./typeset-model.js?v=1014-compact-panel');
          if(snapshot.fingerprint!==await questionFingerprint(target))throw Error('시트 내용과 저장 전 조판 수정이 함께 바뀌었습니다. 시트 수정을 되돌린 뒤 조판을 저장하세요. 기존 조판 수정은 유지됩니다.');
          if(!mutate(()=>target.typeset=snapshot))throw Error('조판을 저장하지 못했습니다.');await saveQueue;
        },onDiverge:diverged=>{$('#typeset-discard').hidden=!diverged;},onTextEdit:(changes,questionId)=>{
          // 한글 창에서 고친 글: 같은 문항의 해당 칸만 바꾼다. 한글 창은 이미 그 글을 보여 주므로 다시 그리지 않는다.
          const target=data.questions.find(q=>q.id===questionId);if(!target)return false;
          // 시트 전체를 다시 그리면 입력 위치가 시트 칸으로 넘어가 한글 창 입력이 끊긴다. 그 문항 열의 칸 값만 바꾼다.
          // 연달아 치는 글은 되돌리기 한 번으로 묶는다.
          const ok=mutate(()=>{for(const c of changes)applyTextEdit(target,c.owner,c.value);},{render:false,key:'hwp-text:'+questionId});
          if(ok){refreshColumn(target);if(view.name==='card')cardEditor.syncFields?.(target);}return ok;
        },onPlacement:(fn,text,questionId)=>{
          // 한글 창에서 끌어 놓은 결과는 데이터(순서·묶음·폭 비율·크기)로만 저장한다. 화면은 자동으로 다시 그려진다.
          const target=data.questions.find(q=>q.id===questionId);if(!target)return;
          let changed=false;if(mutate(()=>{changed=fn(target)!==false;})){status(changed?text+' · 구성 시트에 반영':'배치가 그대로입니다.');if(changed){clearTimeout(redrawTimer);void requestTypeset(target);}}
        }});}
// 시험지 HWPX: 문항 조판 문서를 모은다. 한글 엔진은 조판 창과 같은 것을 쓴다.
async function buildExamBytes(exam,{order=null}={}){typesetter ||= makeTypesetter();
  const form=exam.formId?typesetForms.find(f=>f.id===exam.formId):null;if(exam.formId&&!form)throw Error('이 시험지에 고른 양식을 찾지 못했습니다. 시험지 화면에서 양식을 다시 고르세요.');
  if(!form)return typesetter.buildExam(data,exam,{order});
  let password='';for(;;){try{return await typesetter.buildExam(data,exam,{form,password,order});}catch(error){if(!error.needsPassword)throw error;password=await askPassword(error.message);if(password===null)throw Error('양식 암호를 넣지 않아 시험지를 만들지 않았습니다.');}finally{password='';}}}
// Serialize loads and saves. Fast column clicks keep the last request without
// allowing an older load or a save to bind to the newly selected question.
async function requestTypeset(value){
  typesetRequest=value;
  if(typesetTransition)return typesetTransition;
  typesetTransition=(async()=>{
    const panel=$('#preview-dialog');let lostFormat=false;
    while(typesetRequest!==undefined){
      let next=typesetRequest;typesetRequest=undefined;
      panel.setAttribute('aria-busy','true');
      try{
        // 한글 창이 보여 주는 문항이 시트와 같을 때만 서식을 저장한다. 시트에서 구성이 바뀌었다면 그 서식은 새 내용에 맞지 않으므로 버리고 다시 그린다.
        const shown=data.questions.find(q=>q.id===typesetter?.questionId);
        if(shown&&typesetter.matches(shown))await typesetter.commit();
        else if(typesetter?.dirty){typesetter.discard();lostFormat=true;}
        if(typesetRequest!==undefined)continue;
        if(next===null){// 닫을 때 초점은 창 안에 있었을 때만 「미리보기」 단추로 돌린다. 저장을 기다린 뒤 늦게 닫히므로, 그새 다른 칸에 치기 시작했으면 그대로 둔다(앞부분이 지워지던 원인).
          const focusWasInside=panel.contains(document.activeElement)||document.activeElement===document.body||!document.activeElement;
          panel.hidden=true;panel.dataset.expanded='false';$('#typeset-expand').setAttribute('aria-pressed','false');$('#typeset-expand').textContent='크게 보기';$('#preview').setAttribute('aria-expanded','false');if(focusWasInside)$('#preview').focus();continue;}
        next=data.questions.find(q=>q.id===next.id);if(!next)throw Error('문항이 삭제되었습니다. 다른 문항을 선택하세요.');
        closeSources();panel.hidden=false;$('#preview').setAttribute('aria-expanded','true');
        typesetter ||= makeTypesetter();
        $('#typeset-title').textContent=`${next.number}번 문항 조판`;
        if(!typesetter.matches(next)){await typesetter.open(next);if(lostFormat)status('구성이 바뀌어 한글 창을 다시 그렸습니다 · 저장하지 않은 서식 조정은 다시 해 주세요.');}else typesetter.refreshView();lostFormat=false;
        $('#typeset-refresh').hidden=true;
      }catch(e){
        typesetRequest=undefined;$('#typeset-status').textContent=e.message;$('#typeset-status').dataset.error='true';
        if(/내용이 시트와 달라|조판 설정을 적용/.test(e.message))$('#typeset-discard').hidden=!/내용이 시트와 달라/.test(e.message);
        const previous=data.questions.find(q=>q.id===typesetter?.questionId);if(previous){current=previous;renderRows();grid?.refresh({questionId:current.id});/* 카드도 그 문항으로 다시 그린다 — 화면은 새 문항 카드인데 입력이 옛 문항에 들어가 덮어쓰던 것(H6) */if(view.name==='card')renderView();$('#typeset-title').textContent=`${previous.number}번 문항 조판`;}
      }finally{panel.setAttribute('aria-busy','false');}
    }
  })();
  try{await typesetTransition;}finally{typesetTransition=null;}
}
async function openTypeset(){if(!current||grid?.finish()===false)return;if(view.name!=='card'){openCard(current.id);cardEditor.showHwp?.();return;}await requestTypeset(current);}
// 한글 조판은 문항 카드 오른쪽 미리보기에서만 연다(엑셀식 시트 옆 조판은 폐기).
$('#preview').onclick=()=>void openTypeset();
$('#typeset-close').onclick=()=>{if($('#preview-dialog').classList.contains('docked')){cardEditor.setView?.('card');return;}void requestTypeset(null);};
$('#typeset-refresh').onclick=()=>void openTypeset();
// 막힌 상태 빠져나가기: 두 번 눌러 확인한 뒤 한글 창 수정을 버리고 시트 내용으로 다시 그린다.
let discardArmed=0;
$('#typeset-discard').onclick=()=>{
  const b=$('#typeset-discard');
  if(!discardArmed){discardArmed=setTimeout(()=>{discardArmed=0;b.textContent='한글 창 수정 버리기';},4000);b.textContent='한 번 더 누르면 버립니다';return;}
  clearTimeout(discardArmed);discardArmed=0;b.textContent='한글 창 수정 버리기';b.hidden=true;
  typesetter?.discard();status('한글 창 수정을 버리고 시트 내용으로 다시 그립니다.');void requestTypeset(current);
};
grid=createSheetGrid({formula:$('#formula-value'),nameBox:$('#cell-address'),onStatus:status,onHistory:replay,onDraft:previewDraft,
  onOpen:(d,tab)=>{choose(data.questions.find(q=>q.id===d.table.tBodies[0].rows[d.r].querySelectorAll('td')[d.c].dataset.id));if(tab==='tables'){sheetView='tables';renderSheetView();grid?.refresh({questionId:current?.id});return;}openSlots(current);},
  onSelect:d=>{if(!d?.table)return;if(d.id==='registry'){selection=null;const cell=d.table.tBodies[0]?.rows[d.r]?.querySelectorAll('td')[d.c];if(cell&&d.user)choose(data.questions.find(q=>q.id===cell.dataset.id));}else selection={id:d.id,anchor:[d.r,d.c],range:[...d.range]};},
  onWrite:(d,writes,options)=>{const scope=d.id==='registry'?{kind:'registry',ids:[...d.table.tHead.rows[1].cells].filter(n=>n.dataset.id).map(n=>n.dataset.id),allowAppend:!$('#filter').value}:{kind:'table',questionId:current.id,tableId:d.id};return mutate(()=>scope.kind==='registry'?applyVerticalValues(data,scope.ids,writes,options):applyGridValues(data,scope,writes,options));}
});
$('#shortcuts').onclick=()=>$('#shortcuts-dialog').showModal();
$('#side-shortcuts').onclick=()=>$('#shortcuts-dialog').showModal();
document.addEventListener('keydown',e=>{if(e.key==='F1'){e.preventDefault();if(!$('#shortcuts-dialog').open)$('#shortcuts-dialog').showModal();}});
$('#question-prev').onclick=()=>{const list=sheetScope(),at=list.indexOf(current);if(at>0&&grid?.finish()!==false)choose(list[at-1]);};
$('#question-next').onclick=()=>{const list=sheetScope(),at=list.indexOf(current);if(at>=0&&at<list.length-1&&grid?.finish()!==false)choose(list[at+1]);};
$('#workflow').onchange=e=>{if(!current)return;const v=e.target.value;if(mutate(()=>{if(v==='draft')delete current.workflow;else current.workflow=v;}))status(`${questionTitle(current)} → ${TITLES[v]}`);};
// ── 문항 보관함 · 시험지 · 문항 카드 ──────────────────────────────────────────
function openCard(id){const q=data.questions.find(x=>x.id===id);if(!q)return;if(grid?.finish()===false)return;current=q;const exam=examOf(data,id);view.examId=exam?.id||null;show('card');}
function createExam(title){let exam;if(mutate(()=>{exam=newExam(title||`새 시험지 ${data.exams.length+1}`);data.exams.push(exam);}))return exam;return null;}
// 왼쪽 메뉴(다시 그려지므로 위임으로 받는다).
$('.side').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.id==='side-new'){$('#new').click();return;}
  const nav=b.dataset.nav;if(!nav)return;
  if(nav==='library'){view.examId=null;if(view.lib?.mark==='star')view.lib.mark='';show('library');}
  else if(nav==='stars'){view.examId=null;Object.assign(libState(view),{mark:'star',kind:'all',limit:40,open:-1});show('library');}
  else if(nav==='exams')show('exams',{status:b.dataset.status||'drafting'});
  else if(nav==='exam'){view.examId=b.dataset.exam;show('exam');}
  else if(nav==='new-exam')newExamDialog();
});
// 문항 보관함.
// 문항 보관함(10-23 다시 하기, 시안 exampool-viewer-1023): 기출 + 내 문항 한 목록, 문항 보기 창. 동작은 library-view.js.
const libApi={data:()=>data,view:()=>view,engine:(node,q)=>engineCard(node,q),rerender:()=>{if(view.name==='library')renderLibraryView($('#library-view'),data,view,libApi);},status:(m,err)=>status(m,err),
  openCard:id=>openCard(id),askDelete:id=>askDelete(id),convertPast:item=>void convertPast(item),pastBusy:()=>pastBusy,navChanged:()=>renderNav($('.side'),data,view),
  // 위쪽 경로: 문항 보기 창이 열려 있으면 「문항 보관함 › 제목」, 앞 단계를 누르면 창을 닫는다.
  crumb:title=>{if(view.name!=='library')return;$('#crumb-question').textContent=title;$('#crumb-question').title=title;document.querySelector('.crumb-sep').hidden=!title;$('#crumb-view').disabled=!title;$('#crumb-view').title=title?'문항 보관함으로 돌아가기':'';},
  toExamMenu:(qid,button)=>{const exams=data.exams.filter(e=>e.status==='drafting'),sel=document.createElement('select');sel.className='lv-btn';sel.setAttribute('aria-label','시험지에 넣기');
    sel.innerHTML=`<option value="">시험지 고르기…</option>${exams.map(e=>`<option value="${e.id}">${E(e.title)}</option>`).join('')}<option value="__new">+ 새 시험지</option>`;button.replaceWith(sel);sel.focus();
    sel.onchange=()=>{if(!sel.value)return;const exam=sel.value==='__new'?createExam():examById(data,sel.value);if(exam&&mutate(()=>{addToExam(data,exam.id,qid);renumberExam(data,exam.id);}))status(`「${exam.title}」에 넣었습니다 · 시험지 순서대로 번호를 다시 매겼습니다.`);};}};
const libView=installLibraryView($('#library-view'),libApi);
$('#exams-view').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.nav==='exam'){view.examId=b.dataset.exam;show('exam');}else if(b.dataset.nav==='new-exam')newExamDialog();});
// 시험지 안.
const examNow=()=>view.examId&&examById(data,view.examId);
$('#examd-view').addEventListener('change',e=>{const exam=examNow();if(!exam)return;
  if(e.target.id==='exam-title'){const title=e.target.value.trim()||exam.title;mutate(()=>{exam.title=title;exam.updatedAt=new Date().toISOString();});return;}
  if(e.target.id==='exam-from-library'&&e.target.value){const qid=e.target.value;mutate(()=>{addToExam(data,exam.id,qid);renumberExam(data,exam.id);});}
});
$('#examd-view').addEventListener('click',e=>{const exam=examNow(),b=e.target.closest('button');if(!exam||!b)return;const row=b.closest('[data-order]');
  if(b.matches('[data-exam-more]')){const menu=b.nextElementSibling,open=menu.hidden;menu.hidden=!open;b.setAttribute('aria-expanded',String(open));if(open)menu.querySelector('button')?.focus();return;}
  if(b.closest('.pv-more .top-menu')){const m=b.closest('.top-menu');m.hidden=true;m.previousElementSibling.setAttribute('aria-expanded','false');}
  if(b.dataset.openCard){openCard(b.dataset.openCard);return;}
  if(b.dataset.move&&row){const at=exam.items.indexOf(row.dataset.order);mutate(()=>{if(!moveInExam(data,exam.id,row.dataset.order,at+(b.dataset.move==='up'?-1:1)))throw Error('더 옮길 수 없습니다.');renumberExam(data,exam.id);});return;}
  if(b.dataset.out){mutate(()=>{removeFromExam(data,b.dataset.out);renumberExam(data,exam.id);});status('문항을 보관함으로 옮겼습니다.');return;}
  const act=b.dataset.examAct;if(!act)return;
  if(act==='cards'){if(exam.items[0])openCard(current&&exam.items.includes(current.id)?current.id:exam.items[0]);else $('#new').click();}
  else if(act==='sheet'){if(exam.items[0]&&!exam.items.includes(current?.id))current=data.questions.find(q=>q.id===exam.items[0]);show('desk');}
  else if(act==='status')mutate(()=>{exam.status=exam.status==='done'?'drafting':'done';exam.updatedAt=new Date().toISOString();});
  else if(act==='new')$('#new').click();
  else if(act==='send')void sendExam(exam);
  else if(act==='download')void sendExam(exam,{download:true});
  else if(act==='blueprint')void downloadBlueprint(exam);
  else if(act==='variant')void sendExam(exam,{download:true,variant:true});
  else if(act==='print')void sendExam(exam,{print:true});
  else if(act==='print-a4')void sendExam(exam,{print:'A4'});
});
// 시험지 만들기 세 단계(10-24, exam-flow.js): 단계 막대 · ① 틀 · 속성.
const goalEdit=(exam,fn)=>mutate(()=>{const g=goalOf(exam,typesetForms);fn(g);exam.goal={...g,edited:true};exam.updatedAt=new Date().toISOString();});
$('#examd-view').addEventListener('click',e=>{const exam=examNow(),t=e.target;if(!exam)return;
  if(t.closest('[data-ef-framepick]')){framePicker(exam);return;}
  const st=t.closest('[data-ef-step]');if(st){view.examStep=Number(st.dataset.efStep);renderView();$('#examd-view').scrollTop=0;return;}
  const fr=t.closest('[data-ef-frame]');if(fr){const key=fr.dataset.efFrame;mutate(()=>{applyFrame(exam,key,typesetForms);exam.updatedAt=new Date().toISOString();});status(`틀 「${frameOf(exam,typesetForms).name}」 기본값으로 시험지 속성을 채웠습니다.`);return;}
  if(t.closest('[data-ef-redef]')){mutate(()=>{applyFrame(exam,frameOf(exam,typesetForms).key,typesetForms);});return;}
  const on=t.closest('[data-ef-on]');if(on){const k=on.dataset.efOn;goalEdit(exam,g=>{g[k]=k==='total'?100:50;});return;}
  const off=t.closest('[data-ef-off]');if(off){e.preventDefault();const k=off.dataset.efOff;goalEdit(exam,g=>{g[k]=null;});return;}
  const adv=t.closest('[data-ef-adv]');if(adv){const k=adv.dataset.efAdv;goalEdit(exam,g=>{g[k]=!g[k];});return;}
  const rg=t.closest('[data-ef-range]');if(rg){const r=rg.dataset.efRange;goalEdit(exam,g=>{g.range=g.range.includes(r)?g.range.filter(x=>x!==r):[...g.range,r];});return;}
  if(t.closest('[data-ef-register]')){registerForm(id=>{mutate(()=>{applyFrame(exam,'form:'+id,typesetForms);exam.updatedAt=new Date().toISOString();});status('내 틀을 등록하고 이 시험지에 썼습니다 — 이 브라우저에 저장했습니다.');});return;}
  // 「목표 고치기」 창(10-24 시안 17): 열 때 목표를 적어 두고, 「닫기」는 되돌리고 「적용」은 그대로 둔다. 칸은 ① 시험지 속성과 같은 칸이라 고칠 때마다 점검에 바로 보인다.
  if(t.closest('[data-ex-goal-open]')){const st=placeState(view);st.goalPop=!st.goalPop;st.goalSnap=st.goalPop?JSON.parse(JSON.stringify(exam.goal||null)):null;renderView();return;}
  if(t.closest('[data-ex-goal-close]')){const st=placeState(view),snap=st.goalSnap;st.goalPop=false;st.goalSnap=null;if(snap&&JSON.stringify(snap)!==JSON.stringify(exam.goal))mutate(()=>{exam.goal=snap;});else renderView();return;}
  if(t.closest('[data-ex-goal-apply]')){const st=placeState(view);st.goalPop=false;st.goalSnap=null;renderView();status('시험지 목표를 바꿨습니다.');return;}
});
// 내 틀 등록 창(학교 시험지 양식 · 학습지) — 「새 시험지」 창과 ① 틀 칸이 같이 쓴다. onSaved(양식 id).
function registerForm(onSaved){openRegister({status:(m,err)=>status(m,err),readForm:readFormFile,saveForm:async({name,kind,draft})=>{
  const s={...draft.read.standard,name};validateStandard(s);await saveTypesetStandards([...typesetStandards,s]);const id='form_'+uid();
  await saveTypesetForms([...typesetForms,{id,name,kind,fileName:draft.fileName,encrypted:draft.encrypted,bytes:draft.bytes,structure:draft.read.structure,standardId:s.id,createdAt:new Date().toISOString()}]);
  onSaved(id);}});}
// 「틀 바꾸기」(10-24 결정 2): 틀만 바꾸고 핵심 목표(문항 수 · 총점 · 시간 · 과목 · 범위 · 규칙)는 그대로 둔다.
function changeFrame(exam,key){const g=goalOf(exam,typesetForms);applyFrame(exam,key,typesetForms);exam.goal={...exam.goal,subject:g.subject,range:g.range,nObj:g.nObj,nEssay:g.nEssay,total:g.total,time:g.time,points:g.points,diff:g.diff,rule:g.rule,edited:g.edited};exam.updatedAt=new Date().toISOString();}
function framePicker(exam){openFramePicker({forms:()=>typesetForms,current:frameKey(exam),
  pick:key=>{mutate(()=>changeFrame(exam,key));status(`틀을 「${frameOf(exam,typesetForms).name}」(으)로 바꿨습니다 — 핵심 목표는 그대로입니다.`);},
  register:()=>registerForm(id=>{mutate(()=>changeFrame(exam,'form:'+id));status('내 틀을 등록하고 이 시험지에 썼습니다 — 이 브라우저에 저장했습니다.');})});}
// 「새 시험지」 창(10-24 시안 17 안 A): 이름 · 틀 · 핵심 목표 → 「만들기」 → 바로 문항 고르기.
function newExamDialog(){openNewExam({forms:()=>typesetForms,name:`새 시험지 ${data.exams.length+1}`,status:(m,err)=>status(m,err),
  register:onSaved=>registerForm(id=>{status('내 틀을 등록했습니다 — 이 브라우저에 저장했습니다.');onSaved('form:'+id);}),
  create:({name,frame,goal})=>{let exam;const ok=mutate(()=>{exam=newExam(name);applyFrame(exam,frame,typesetForms);const def={...exam.goal};Object.assign(exam.goal,goal);exam.goal.edited=['nObj','nEssay','total','time'].some(k=>def[k]!==goal[k]);data.exams.push(exam);});
    if(!ok)return false;view.examId=exam.id;view.examStepFor=exam.id;view.examStep=2;show('exam');return true;}});}
$('#examd-view').addEventListener('change',e=>{const exam=examNow(),t=e.target;if(!exam)return;
  if(t.matches('[data-ef-subject]')){goalEdit(exam,g=>{g.subject=t.value;});return;}
  const k=t.dataset.efGoal;if(k){const v=Math.round(Number(t.value));if(!(Number.isFinite(v)&&v>=0&&v<=(k==='total'?1000:k==='time'?600:200))){status('0 이상의 정수로 적어 주세요.',true);renderView();return;}goalEdit(exam,g=>{g[k]=v;});}
});
// 시험지 화면 문항 카드 · 미리보기 = 한글 엔진이 그린 문항(10-24 지적 10, 가운데 조판 쪽과 같은 모양). 한 번에 하나씩 줄 세워 그린다.
let engineQueue=Promise.resolve();
function engineCard(node,q){node.classList.add('is-engine','is-loading');engineQueue=engineQueue.then(async()=>{if(!node.isConnected)return;try{typesetter||=makeTypesetter();const r=await typesetter.questionSvg(q);if(node.isConnected)node.innerHTML=r.svg;}catch(e){if(node.isConnected)node.innerHTML=`<p class="ep-fail">미리보기를 그리지 못했습니다: ${E(e.message)}</p>`;}finally{node.classList.remove('is-loading');}});return engineQueue;}
function fillEngineCards(root){for(const n of root.querySelectorAll('.ep-doc[data-preview]')){const q=data.questions.find(x=>x.id===n.dataset.preview);if(q)engineCard(n,q);}}
// ② 문항 고르기(exam-pick.js): 보관함 거르기 · 담기 · 분류·태그 창 · 여러 개 고르기.
function pickCart(){const exam=view.name==='exam'&&view.examStep===2&&examNow();if(exam)refreshCart($('#examd-view'),exam,data,typesetForms,pastBusy);}
const pickList=()=>{const exam=examNow();return exam?poolEntries(data,exam,{...pickState(view),limit:1e9}):[];};
const pickByKey=keys=>{const all=pickList(),want=new Set(keys);return all.filter(x=>want.has(x.key));};
let pickPop=null,pickMenu=null;
function closePick(){pickPop?.remove();pickPop=null;pickMenu?.remove();pickMenu=null;}
function floatAt(node,anchor,width){const b=anchor.getBoundingClientRect();node.style.left=Math.max(12,Math.min(innerWidth-width-12,b.left))+'px';const h=node.offsetHeight;node.style.top=(b.bottom+6+h>innerHeight-8?Math.max(8,b.top-h-6):b.bottom+6)+'px';}
function openTagPop(keys,anchor){closePick();const xs=pickByKey(keys);if(!xs.length)return;pickPop=document.createElement('div');pickPop.className='ep-pop';pickPop.dataset.keys=JSON.stringify(keys);document.body.append(pickPop);pickPop.innerHTML=tagPopMarkup(xs,data);floatAt(pickPop,anchor,340);pickPop.querySelector('[data-ep-taginput]')?.focus();}
function redrawPop(){if(!pickPop)return;const keys=JSON.parse(pickPop.dataset.keys),xs=pickByKey(keys);pickPop.innerHTML=tagPopMarkup(xs,data);pickPop.querySelector('[data-ep-taginput]')?.focus();}
function popEdit(fn){const xs=pickByKey(JSON.parse(pickPop.dataset.keys));editMeta({mutate:(f,o)=>mutate(f,o)},xs,fn);redrawPop();const g=$('#examd-view .ep-grid'),top=g?.scrollTop||0;renderView();const g2=$('#examd-view .ep-grid');if(g2)g2.scrollTop=top;}
function addPopTag(raw){const t=normTag(raw);if(!t)return;popEdit(m=>{if(!m.tags.includes(t))m.tags.push(t);return m;});}
document.addEventListener('pointerdown',e=>{if(pickPop&&!e.target.closest('.ep-pop,[data-ep-tag],[data-ep-bulktag]'))closePick();else if(pickMenu&&!e.target.closest('.ep-menu,[data-ep-menu]')){pickMenu.remove();pickMenu=null;}},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&(pickPop||pickMenu)){e.preventDefault();closePick();}
  if(e.target.matches?.('[data-ep-taginput]')&&(e.key==='Enter'||e.key===' ')&&!e.isComposing){e.preventDefault();addPopTag(e.target.value);}},true);
document.addEventListener('click',e=>{const t=e.target;if(!pickPop&&!pickMenu)return;
  if(pickMenu){const set=t.closest('[data-ep-set]');if(set){const s=pickState(view),k=set.dataset.epSet,f={subj:'subject',unit:'part',std:'std',lv:'lv',ty:'ty',sort:'sort'}[k];s[f]=set.dataset.v||(k==='sort'?'recent':'');s.limit=40;closePick();renderView();return;}}
  if(!pickPop||!t.closest('.ep-pop'))return;
  if(t.closest('[data-ep-popx]')){closePick();return;}
  const rm=t.closest('[data-ep-tagrm]');if(rm){const x=rm.dataset.epTagrm;popEdit(m=>{m.tags=m.tags.filter(y=>y!==x);return m;});return;}
  const ad=t.closest('[data-ep-tagadd]');if(ad){addPopTag(ad.dataset.epTagadd);return;}
  const lv=t.closest('[data-ep-lvset]');if(lv){const v=lv.dataset.epLvset;popEdit(m=>{m.lv=m.lv===v&&JSON.parse(pickPop.dataset.keys).length===1?'':v;return m;});}
});
document.addEventListener('change',e=>{const k=e.target.dataset?.epCls;if(!k||!pickPop)return;const v=e.target.value;if(v==='__keep')return;popEdit(m=>{m[k]=v;return m;});});
$('#examd-view').addEventListener('click',e=>{const exam=examNow(),t=e.target;if(!exam||view.examStep!==2)return;const s=pickState(view);
  const kd=t.closest('[data-ep-kind]');if(kd){s.kind=kd.dataset.epKind;s.limit=40;renderView();return;}
  const mn=t.closest('[data-ep-menu]');if(mn){const k=mn.dataset.epMenu;if(pickMenu?.dataset.k===k){closePick();return;}closePick();pickMenu=document.createElement('div');pickMenu.className='ep-menu';pickMenu.setAttribute('role','menu');pickMenu.dataset.k=k;document.body.append(pickMenu);pickMenu.innerHTML=menuMarkup(data,exam,s,k);floatAt(pickMenu,mn,200);return;}
  if(t.closest('[data-ep-star]')){s.star=!s.star;s.limit=40;renderView();return;}
  const tf=t.closest('[data-ep-tagf]');if(tf){const x=tf.dataset.epTagf;s.tags=s.tags.includes(x)?s.tags.filter(y=>y!==x):[...s.tags,x];s.limit=40;renderView();return;}
  if(t.closest('[data-ep-tagclear]')){s.tags=[];renderView();return;}
  if(t.closest('[data-ep-more]')){s.limit+=40;renderView();return;}
  if(t.closest('[data-ep-multi]')){s.multi=!s.multi;s.picked=[];closePick();renderView();return;}
  const bt=t.closest('[data-ep-bulktag]');if(bt){openTagPop([...s.picked],bt);return;}
  if(t.closest('[data-ep-bulktake]')){const xs=pickByKey(s.picked),mine=xs.filter(x=>x.kind==='mine'&&!exam.items.includes(x.id)),pasts=xs.filter(x=>x.kind==='past');
    if(mine.length)mutate(()=>{for(const x of mine)addToExam(data,exam.id,x.id);renumberExam(data,exam.id);});
    if(pasts.length)status(`기출 ${pasts.length}개는 하나씩 「담기」로 변형해 담아 주세요 — 지금은 내 문항 ${mine.length}개를 담았습니다.`);else status(`${mine.length}개를 담았습니다.`);
    s.multi=false;s.picked=[];renderView();return;}
  const tg=t.closest('[data-ep-tag]');if(tg){openTagPop([tg.dataset.epTag],tg);return;}
  const tk=t.closest('[data-ep-take]');if(tk){const key=tk.dataset.epTake,x=pickByKey([key])[0];if(!x)return;
    if(x.kind==='mine'){const inside=exam.items.includes(x.id);mutate(()=>{if(inside)removeFromExam(data,x.id);else addToExam(data,exam.id,x.id);renumberExam(data,exam.id);});status(inside?'문항을 시험지에서 뺐습니다.':'문항을 담았습니다 · 시험지 순서대로 번호를 다시 매겼습니다.');}
    else{status('기출은 편집할 수 있는 문항으로 바꿔 담습니다(오른쪽 담은 문항 칸).');void convertPast(x.i);setTimeout(pickCart,0);}
    return;}
  const out=t.closest('[data-ep-out]');if(out){mutate(()=>{removeFromExam(data,out.dataset.epOut);renumberExam(data,exam.id);});return;}
  if(s.multi){const card=t.closest('.ep-card');if(card){if(card.classList.contains('in'))return;const k=card.dataset.epKey;s.picked=s.picked.includes(k)?s.picked.filter(y=>y!==k):[...s.picked,k];card.classList.toggle('pk',s.picked.includes(k));card.querySelector('.ep-pick').textContent=s.picked.includes(k)?'✓':'';const b=$('#examd-view .ep-bulk');if(b){b.querySelector('b').textContent=`${s.picked.length}개 골랐음`;b.querySelectorAll('[data-ep-bulktag],[data-ep-bulktake]').forEach(n=>n.disabled=!s.picked.length);}return;}}
});
let pickQueryTimer=0;
$('#examd-view').addEventListener('input',e=>{if(!e.target.matches('[data-ep-query]'))return;const s=pickState(view);s.query=e.target.value;s.limit=40;clearTimeout(pickQueryTimer);pickQueryTimer=setTimeout(()=>{const at=e.target.selectionStart;renderView();const n=$('#examd-view [data-ep-query]');if(n){n.focus();n.setSelectionRange(at,at);}},220);});
// ③ 배치 · 점검(exam-place.js): 목록/카드 · 쪽 맞춤/폭 맞춤 · 목표 없이 보기 · 줄을 누르면 그 문항 쪽으로 · 마우스를 올리면 문항 전체.
$('#examd-view').addEventListener('click',e=>{const exam=examNow(),t=e.target;if(!exam||(view.examStep||3)!==3)return;const st=placeState(view);
  const lv=t.closest('[data-ex-lv]');if(lv){st.lv=lv.dataset.exLv;renderView();return;}
  const zm=t.closest('[data-ex-zoom]');if(zm){st.zoom=zm.dataset.exZoom;const n=$('#exam-sheet');n?.classList.toggle('ex-zoom-page',st.zoom==='page');n?.classList.toggle('ex-zoom-width',st.zoom==='width');document.querySelectorAll('[data-ex-zoom]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.exZoom===st.zoom)));return;}
  if(t.closest('[data-ex-ai]')){status('AI 내용 검토는 아직 연결 전입니다 — 지금은 문항 카드의 AI 검토를 문항마다 써 주세요.');return;}
  const oc=t.closest('div[data-open-card]');if(oc){openCard(oc.dataset.openCard);return;}
  const row=t.closest('.ex-lr[data-order],.ex-cc[data-order]');if(row&&!t.closest('.ex-tools')){examPick=row.dataset.order;document.querySelectorAll('#exam-order [data-order]').forEach(r=>r.classList.toggle('on',r===row));void fillExamSheet(exam).then(()=>document.querySelector(`.pv-pg-q[data-exam-pick="${CSS.escape(examPick||'')}"]`)?.scrollIntoView({block:'center',behavior:'smooth'}));}
});
$('#examd-view').addEventListener('change',e=>{if(!e.target.matches('[data-ex-nogoal]'))return;placeState(view).noGoal=e.target.checked;const exam=examNow();const c=$('#exam-check');if(exam&&c)c.innerHTML=checkMarkup(exam,data,typesetForms,examPlan(data,exam).items,placeState(view),null);void fillExamSheet(exam);});
{let tip=null;
  $('#examd-view').addEventListener('mouseover',async e=>{const r=e.target.closest('[data-ex-tip]');if(!r||(tip&&tip.dataset.id===r.dataset.exTip))return;const q=data.questions.find(x=>x.id===r.dataset.exTip);if(!q)return;
    tip?.remove();tip=document.createElement('div');tip.className='ex-tip';tip.dataset.id=q.id;tip.innerHTML='<div class="ep-doc"></div>';document.body.append(tip);
    const doc=tip.firstElementChild;await engineCard(doc,q);if(!tip?.isConnected||tip.dataset.id!==q.id)return;
    // 문항 전체(한글 엔진 그림): 폭 440px, 화면보다 길면 줄여서 전체가 보이게.
    const b=r.getBoundingClientRect(),avail=innerHeight-24;tip.style.width='440px';let h=tip.offsetHeight;if(h>avail){tip.style.width=Math.max(220,440*avail/h)+'px';h=tip.offsetHeight;}
    tip.style.left=Math.min(innerWidth-tip.offsetWidth-12,b.right+12)+'px';tip.style.top=Math.max(12,Math.min(innerHeight-h-12,b.top-20))+'px';tip.classList.add('on');});
  $('#examd-view').addEventListener('mouseout',e=>{const r=e.target.closest('[data-ex-tip]');if(r&&!r.contains(e.relatedTarget)){tip?.remove();tip=null;}});
  document.addEventListener('dragstart',()=>{tip?.remove();tip=null;},true);}
// 내 틀 등록 창이 한글 파일을 읽을 때: 암호는 선생님이 넣고, 여기서만 쓰고 남기지 않는다.
async function readFormFile(file){typesetter||=makeTypesetter();const buffer=await file.arrayBuffer();let read=null,password='';
  for(;;){try{read=await typesetter.readSchoolForm(buffer,file.name,password);break;}catch(error){if(!error.needsPassword)throw error;password=await askPassword(error.message);if(password===null){status('한글 파일 열기를 그만두었습니다.');return null;}}}
  const encrypted=!!password;password='';return {read,bytes:new Uint8Array(buffer),fileName:file.name,encrypted};}
// 시험지 양식 고르기: 5E 기본 / 등록한 학교 양식 / 새로 등록.
$('#examd-view').addEventListener('change',e=>{if(e.target.id!=='exam-form')return;const exam=examNow();if(!exam)return;const v=e.target.value;
  if(v==='__new'){e.target.value=exam.formId||'';schoolFor={exam:exam.id};$('#school-file-input').value='';$('#school-file-input').click();return;}
  mutate(()=>{if(v)exam.formId=v;else delete exam.formId;exam.updatedAt=new Date().toISOString();});status(v?`이 시험지는 「${typesetForms.find(f=>f.id===v)?.name}」 양식 위에 묶습니다.`:'이 시험지는 5E 기본 양식으로 묶습니다.');});
// 시험지 ⋯ 메뉴: 바깥을 누르거나 Esc면 닫는다.
const closeExamMenu=(focus=false)=>{for(const m of document.querySelectorAll('.pv-more .top-menu:not([hidden])')){m.hidden=true;const b=m.previousElementSibling;b.setAttribute('aria-expanded','false');if(focus)b.focus();}};
document.addEventListener('pointerdown',e=>{if(!e.target.closest?.('.pv-more'))closeExamMenu();},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.querySelector('.pv-more .top-menu:not([hidden])')){e.preventDefault();closeExamMenu(true);}},true);
// 끌어서 순서 바꾸기.
let dragId=null;
$('#examd-view').addEventListener('dragstart',e=>{const row=e.target.closest('[data-order]');if(!row)return;dragId=row.dataset.order;e.dataTransfer.effectAllowed='move';row.classList.add('dragging');});
$('#examd-view').addEventListener('dragover',e=>{if(!dragId)return;const row=e.target.closest('[data-order]');if(row){e.preventDefault();document.querySelectorAll('.pv-orow.drop-before').forEach(n=>n.classList.remove('drop-before'));row.classList.add('drop-before');}});
$('#examd-view').addEventListener('drop',e=>{const exam=examNow(),row=e.target.closest('[data-order]');if(!exam||!dragId||!row)return;e.preventDefault();const id=dragId,to=dropBeforeIndex(exam.items,id,row.dataset.order);dragId=null;if(to<0||to===exam.items.indexOf(id))return;mutate(()=>{moveInExam(data,exam.id,id,to);renumberExam(data,exam.id);});});
$('#examd-view').addEventListener('dragend',()=>{dragId=null;document.querySelectorAll('.pv-orow.dragging,.pv-orow.drop-before').forEach(n=>n.classList.remove('dragging','drop-before'));});
// 시험지 쪽 배치(10-23 지적 8·9): 실제 한글 조판으로 합친 쪽을 그리고, 문항을 누르면 바로 아래에 얇은 여백 막대.
let examPick=null,examSheetSeq=0;
async function fillExamSheet(exam){const n=document.querySelector('#exam-sheet');if(!n||!exam?.items.length)return;const seq=++examSheetSeq;
  typesetter||=makeTypesetter();let view;
  try{view=await typesetter.pageSheets(data,exam,examPick||exam.items[0],{alive:()=>seq===examSheetSeq&&n.isConnected});}catch(e){if(e.cancelled)return;if(seq===examSheetSeq&&n.isConnected)n.innerHTML=`<p class="pv-empty">쪽을 그리지 못했습니다: ${E(e.message)}</p>`;return;}
  if(seq!==examSheetSeq||!n.isConnected)return;
  const pct=v=>(v*100).toFixed(3)+'%',moved=new Set(view.moved||[]);
  // 배치 점검은 실제로 그린 쪽(한글 조판 높이) 기준으로 다시 쓴다(시험지 화면 처음 그릴 때는 어림 높이).
  {const c=document.querySelector('#exam-check');if(c)c.innerHTML=checkMarkup(exam,data,typesetForms,examPlan(data,exam).items,placeState(appView()),view);const info=document.querySelector('#exam-sheet-info');if(info)info.textContent=`${view.pages.length}쪽 · 한글 조판 그대로 · ${view.paper} ${view.columns}단${exam.formId?' · 학교 양식 위 모양은 보낼 때 확인':''}`;}
  n.innerHTML=view.pages.map((p,i)=>`<figure class="pv-pg" style="aspect-ratio:${p.width}/${p.height}">${p.svg.replace('<svg ','<svg style="display:block;width:100%;height:auto" ')}${(p.boxes||[]).map(b=>{const no=exam.items.indexOf(b.id)+1,picked=b.id===examPick,after=Number(exam.after?.[b.id])||0;
    // 여백(10-24 지적 12): 문항 아래 늘린 여백 자리를 빗금으로 — 아래에 밀려날 문항이 없어도 보인다. 쪽 높이(px)는 96dpi, 1mm = 96/25.4px.
    const gapH=b.last!==false&&after>0?after*96/25.4/p.height:0,gap=gapH?`<div class="pv-gapz" data-for="${E(b.id)}" style="left:${pct(b.x)};top:${pct(b.y+b.h)};width:${pct(b.w)};height:${pct(gapH)}" aria-hidden="true"><span>여백 ${after}mm</span></div>`:'';
    // 통째로 넘김(10-24 지적 13): 쪽 위 이름표 대신, 문항을 누르면 나오는 아래 막대에 까닭과 함께.
    const why=moved.has(b.id)?'<i></i><span class="pv-gapwhy" title="앞 단에 자리가 모자라 문항을 나누지 않고 통째로 다음 단·쪽으로 옮겼습니다">↪ 다음 단으로 옮김</span>':'';
    return `<button type="button" class="pv-pg-q${picked?' is-picked':''}" data-exam-pick="${E(b.id)}" aria-label="${no}번 문항 고르기${moved.has(b.id)&&b.first!==false?' · 자리가 모자라 다음 단으로 옮김':''}" style="left:${pct(b.x)};top:${pct(b.y)};width:${pct(b.w)};height:${pct(b.h)}"></button>${gap}${picked&&b.last!==false?`<div class="pv-gapbar" style="${b.x+b.w/2>.5?`right:${pct(1-b.x-b.w)}`:`left:${pct(b.x)}`};top:calc(${pct(b.y+b.h+gapH)} + 2px)" role="group" aria-label="${no}번 문항 아래 여백"><button type="button" data-exam-gap="-4" aria-label="여백 4mm 줄이기" ${after<=0?'disabled':''}>−</button><span>여백 ${after}mm</span><button type="button" data-exam-gap="4" aria-label="여백 4mm 늘리기">+</button><i></i><label><input type="checkbox" data-exam-break ${exam.breaks?.[b.id]?'checked':''}>다음 단에서 시작</label>${why}</div>`:''}`;}).join('')}<figcaption>${i+1} / ${view.pages.length}</figcaption></figure>`).join('');}
document.addEventListener('click',e=>{const pick=e.target.closest('[data-exam-pick]');if(!pick)return;examPick=pick.dataset.examPick===examPick?null:pick.dataset.examPick;
  const exam=view.examId&&examById(data,view.examId);if(exam)fillExamSheet(exam);});
document.addEventListener('click',e=>{const g=e.target.closest('[data-exam-gap]');if(!g||!examPick)return;const exam=view.examId&&examById(data,view.examId);if(!exam)return;
  if(!mutate(()=>{exam.after={...(exam.after||{})};const v=Math.max(0,(Number(exam.after[examPick])||0)+Number(g.dataset.examGap));if(v)exam.after[examPick]=v;else delete exam.after[examPick];exam.updatedAt=new Date().toISOString();},{render:false}))return;
  growGap(examPick,Number(exam.after?.[examPick])||0);queueExamSheet(exam);});
// 여백 ±(10-27 지적: 누를 때마다 쪽이 깜빡였다): 화면 전체를 다시 그리지 않고 빗금 여백만 바로 늘이고 줄인다(부드럽게).
// 한글 조판은 마지막으로 누른 뒤 0.35초에 한 번 — 끝나면 쪽을 한 번에 바꾼다.
let examSheetTimer=0;
function queueExamSheet(exam){clearTimeout(examSheetTimer);examSheetTimer=setTimeout(()=>void fillExamSheet(exam),350);}
function growGap(id,after){
  const bar=document.querySelector('#exam-sheet .pv-gapbar'),fig=bar?.closest('.pv-pg');if(!fig)return;
  const [,H]=String(fig.style.aspectRatio).split('/').map(Number),q=[...fig.querySelectorAll(`[data-exam-pick="${CSS.escape(id)}"]`)].at(-1);if(!H||!q)return;
  const pctOf=v=>parseFloat(v)||0,bottom=pctOf(q.style.top)+pctOf(q.style.height),gapH=after*96/25.4/H*100;
  let z=fig.querySelector(`.pv-gapz[data-for="${CSS.escape(id)}"]`);
  if(!z&&after>0){z=document.createElement('div');z.className='pv-gapz';z.dataset.for=id;z.setAttribute('aria-hidden','true');z.style.cssText=`left:${q.style.left};top:${bottom}%;width:${q.style.width};height:0%`;z.innerHTML='<span></span>';q.after(z);z.getBoundingClientRect();}
  if(z){z.style.height=`${gapH.toFixed(3)}%`;z.querySelector('span').textContent=after?`여백 ${after}mm`:'';}
  bar.style.top=`calc(${(bottom+gapH).toFixed(3)}% + 2px)`;bar.querySelector('span').textContent=`여백 ${after}mm`;bar.querySelector('[data-exam-gap="-4"]').disabled=after<=0;}
document.addEventListener('change',e=>{const c=e.target.closest('[data-exam-break]');if(!c||!examPick)return;const exam=view.examId&&examById(data,view.examId);if(!exam)return;
  if(mutate(()=>{exam.breaks={...(exam.breaks||{})};if(c.checked)exam.breaks[examPick]=true;else delete exam.breaks[examPick];exam.updatedAt=new Date().toISOString();},{render:false}))queueExamSheet(exam);});
// 5E_hwp로 보내기: 시험지 한 부(HWPX)를 5E 시험지 편집기에서 연다. 완성이 아닌 문항도 보낸다. 조판 저장이 없는 문항은 먼저 저장해야 한다.
let examRequest=null;
async function sendExam(exam,{download:asFile=false,variant=false,print=false}={}){
  if(!exam.items.length){status('시험지에 문항을 넣은 뒤 보내세요.',true);return;}
  // 조판 자동 저장(10-23 A2): 조판이 없거나 낡은 문항은 여기서 새로 조판해 저장한다(교사가 「조판 저장」을 누를 일 없음).
  {const {typesetMatches}=await import('./typeset-model.js?v=1014-compact-panel'),need=[];
    for(const id of exam.items){const q=data.questions.find(x=>x.id===id);if(q&&!(q.typeset?.verified&&await typesetMatches(q.typeset,q)))need.push(q);}
    if(need.length){typesetter||=makeTypesetter();
      for(const [i,q] of need.entries()){status(`조판 만드는 중 ${i+1}/${need.length} · ${q.number}번`);
        try{const t=await typesetter.autoTypeset(q);mutate(()=>{q.typeset=t;},{render:false});}catch(e){status(e.message,true);current=q;openCard(q.id);cardEditor.showHwp?.();return;}}
      await saveQueue;}}
  // 순서를 바꾸면 문항 번호가 바뀌어 저장한 조판과 맞지 않게 된다. 예전에는 만드는 도중 번호 없는 오류로 실패했다(M9). 먼저 모두 확인해 알린다.

  status('시험지를 만드는 중…');
  try{
    // 나형: 문항 순서를 섞어(시험지마다 늘 같은 순서) 묶고 번호를 다시 매긴다. 가·나형 정답 대응표(엑셀)도 함께 내려받는다.
    if(variant){const {shuffledOrder,answerRows}=await import('./exam-review.js');const qs=exam.items.map(id=>data.questions.find(q=>q.id===id));
      const order=shuffledOrder(exam.items,variantSeed(exam));
      // 한 번에 파일 하나만(사파리는 연달아 내려받기를 막거나 허락을 묻는다) — 가·나형 대응은 이원목적분류표·정답표 엑셀의 세 번째 시트.
      const bytes=await buildExamBytes(exam,{order});download(bytes,`${exam.title} (나형).hwpx`,'application/vnd.hancom.hwpx');
      status('나형 시험지(HWPX)를 내려받았습니다 · 가·나형 정답 대응은 「이원목적분류표·정답표(엑셀)」의 세 번째 시트에 있습니다.');return;}
    const bytes=await buildExamBytes(exam);
    if(print){await printExam(bytes,exam.title,print==='A4'?'A4':null);return;}
    if(asFile||!embedded){download(bytes,`${exam.title}.hwpx`,'application/vnd.hancom.hwpx');status(asFile?'시험지 HWPX를 내려받았습니다.':'5E 밖에서는 HWPX로 내려받았습니다.');return;}
    examRequest=uid();window.parent.postMessage({channel:'5e-question-sheet',action:'exam-handoff',requestId:examRequest,bytes,title:exam.title,qid:exam.id},location.origin);
  }catch(e){status(e.message,true);}
}
// 이원목적분류표·정답표: 엑셀 한 파일 두 시트(10-22).
// 나형 순서는 시험지마다 늘 같게(시험지 id로 씨앗).
const variantSeed=exam=>[...exam.id].reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,7);
async function downloadBlueprint(exam){try{const {blueprintRows,answerRows,shuffledOrder}=await import('./exam-review.js');const qs=exam.items.map(id=>data.questions.find(q=>q.id===id)).filter(Boolean);
  if(!qs.length){status('시험지에 문항을 넣은 뒤 내려받으세요.',true);return;}
  const X=window.XLSX,book=X.utils.book_new();X.utils.book_append_sheet(book,X.utils.aoa_to_sheet(blueprintRows(qs)),'이원목적분류표');X.utils.book_append_sheet(book,X.utils.aoa_to_sheet(answerRows(qs)),'정답표');
  {const order=shuffledOrder(exam.items,variantSeed(exam)),mark=['①','②','③','④','⑤'];X.utils.book_append_sheet(book,X.utils.aoa_to_sheet([['나형 번호','가형 번호','정답','배점'],...order.map((id,i)=>{const q=qs.find(x=>x.id===id);return [i+1,exam.items.indexOf(id)+1,q.type==='서술형'?'서술형':Number.isInteger(q.answer)?mark[q.answer]:'',Number(q.points)||0];})]),'가나형 대응');}
  download(X.write(book,{type:'array',bookType:'xlsx'}),`${exam.title} 이원목적분류표·정답표.xlsx`);status('이원목적분류표·정답표(엑셀)를 내려받았습니다.');}catch(e){status(e.message,true);}}
// 인쇄·PDF: 엔진이 그린 쪽(SVG)을 실제 용지 크기로 인쇄 창에 — PDF는 인쇄 창의 「PDF로 저장」.
// fit='A4': B4·A3 시험지를 통째로 A4에 줄여 찍는다(10-24 용지 원칙). 용지 비율이 같아 줄바꿈·그림 위치는 그대로, 크기만 약 82%(B4).
async function printExam(bytes,title,fit=null){typesetter||=makeTypesetter();const drawn=await typesetter.examPagesSvg(bytes),{pages}=drawn;
  const shrink=fit==='A4'&&drawn.widthMm>211,widthMm=shrink?210:drawn.widthMm,heightMm=shrink?297:drawn.heightMm;
  const frame=document.createElement('iframe');frame.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';frame.setAttribute('aria-hidden','true');document.body.append(frame);
  const doc=frame.contentDocument;doc.open();doc.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${E(title)}</title><style>@page{size:${widthMm.toFixed(1)}mm ${heightMm.toFixed(1)}mm;margin:0}html,body{margin:0}.p{width:${widthMm.toFixed(1)}mm;height:${heightMm.toFixed(1)}mm;page-break-after:always;overflow:hidden}.p svg{display:block;width:100%;height:100%}</style></head><body>${pages.map(svg=>`<div class="p">${svg}</div>`).join('')}</body></html>`);doc.close();
  await new Promise(r=>setTimeout(r,300));frame.contentWindow.focus();frame.contentWindow.print();status(`${pages.length}쪽 인쇄 창을 열었습니다${shrink?` · A4로 ${Math.round(210/drawn.widthMm*100)}% 줄임`:fit==='A4'?' · 이미 A4라 그대로':''} · PDF는 인쇄 창에서 「PDF로 저장」을 고르세요.`);setTimeout(()=>frame.remove(),60000);}
// 문항 카드 편집기.
const docked={home:null,next:null};
const hwpDock={home:null,next:null};
const cardEditor=createCardEditor($('#card-view'),{
  question:()=>current,
  context:()=>{const exam=view.examId&&examById(data,view.examId);return exam?{label:exam.title,numbered:true,questions:exam.items.map(id=>data.questions.find(q=>q.id===id)).filter(Boolean)}:{label:'문항 보관함',numbered:false,questions:libraryQuestions(data)};},
  open:id=>openCard(id),
  newQuestion:()=>$('#new').click(),
  status,
  edit:(fn,{key,light}={})=>{const ok=mutate(fn,light?{render:false,key}:{});if(ok&&light)renderNav($('.side'),data,view);return ok;},
  slot:(act,q,id)=>{
    if(act==='pick')return pickFigure(q,id);
    if(act==='table')return openSlots(q,id);
    if(act==='to-table'){if(mutate(()=>applyPartChange(q,id,'kind',KINDS.table)))openSlots(q,id);return;}
    if(act==='remove'){mutate(()=>{q.blocks=q.blocks.filter(b=>b.id!==id);q.references=q.references.filter(r=>r.target!==id);});return;}
    if(act==='add-figure'||act==='add-table'){const kind=act==='add-figure'?'figure':'table',side=q.blocks.find(b=>b.kind==='group'&&b.layout==='나란히'&&q.blocks.some(c=>c.parent===b.id&&(c.kind==='figure'||c.kind==='table'))),parent=side?.id||null;let made=null;
      if(mutate(()=>{made=block(kind,parent,nextMaterialLabel(q,parent,kind));q.blocks.push(made);})&&kind==='table')openSlots(q,made.id);return;}
  },
  sheet:()=>show('desk'),
  choiceTable:()=>{sheetView='tables';show('desk');renderSheetView();},
  typeset:()=>{cardEditor.showHwp?.();},
  libraryPicks:()=>libraryPicks,
  convertPast:item=>void convertPast(item),pastBusy:()=>pastBusy,
  pickLibrary:kind=>{if(!embedded){status('5E 안에서 열어야 5E 라이브러리를 쓸 수 있습니다.',true);return;}window.parent.postMessage({channel:'5e-question-sheet',action:'library-pick',requestId:uid(),qid:current?.id,kind},location.origin);status('5E 라이브러리에서 고르세요 · 다 고르면 자동으로 돌아옵니다.');},
  libraryAction:(act,i)=>{const p=libraryPicks[i],q=current;if(!p||!q)return;const where=[p.source?.documentTitle||p.name,p.source?.pageNumber?p.source.pageNumber+'쪽':''].filter(Boolean).join(' ');
    if(act==='link'){mutate(()=>{q.references.push({target:'question',label:('5E 라이브러리 · '+where).slice(0,300),quote:(p.source?.title&&p.source.title!==p.source.documentTitle?p.source.title:'').slice(0,2000)});},{render:false});cardEditor.render();status(`${where}을(를) 이 문항의 근거로 연결했습니다.`);return;}
    let slot=q.blocks.find(b=>b.kind==='figure'&&!b.figure);mutate(()=>{if(!slot){slot=block('figure',null,'그림');q.blocks.push(slot);}slot.figure={name:(where||'라이브러리 그림').slice(0,200)+'.png',data:p.data};});status(`${slot?.label||'그림 칸'}에 넣었습니다 · 출처: ${where}`);},
  hwpDock:container=>dockHwp(container),hwpOpen:()=>void openTypeset(),hwpClose:()=>{if(!$('#preview-dialog').hidden)void requestTypeset(null);},
  dock:(tab,container)=>{const node=$('#sources');if(!docked.home){docked.home=node.parentElement;docked.next=node.nextSibling;}
    if(tab&&container){container.append(node);node.hidden=false;node.classList.add('docked');sourceTarget='question';sourceTab=tab;renderSources();}
    else if(node.classList.contains('docked')){node.classList.remove('docked');node.hidden=true;docked.home.insertBefore(node,docked.next);}},
  ai:(q,req)=>void askAi(q,req),
  columnPreview:q=>columnPreview(q),find:id=>data.questions.find(x=>x.id===id)||null,
  pageSheets:async(q,options)=>{typesetter||=makeTypesetter();const exam=examOf(data,q.id);return {title:exam?exam.title:'문항 보관함 · 이 문항만',...await typesetter.pageSheets(data,exam,q.id,options)};},
  pagePlan:async q=>{const exam=examOf(data,q.id);if(!exam)return {title:'문항 보관함 · 이 문항만',pages:[{columns:[[q.id],[]]}]};const {examPlan}=await import('./exam-layout.js');const {pages}=examPlan(data,exam);return {title:exam.title,pages:pages.length?pages:[{columns:[[q.id],[]]}]};},
  cancelAi:q=>cancelAi(q),aiPending:q=>aiPending(q),login:()=>window.parent.postMessage({channel:'5e-question-sheet',action:'login'},location.origin),figure:(q,spec)=>createFigure(q,spec),remakeFigure:(q,id,req)=>remakeFigure(q,id,req),editGraph:(q,id)=>editGraphFigure(q,id),figurePending:q=>figurePending(q),proposal:(q,id,action)=>decideProposal(q,id,action),revert:(q,rev)=>revertAuthoring(q,rev),
  applySuggestion:(q,sg)=>{const map={발문:'ask',지문:'passage',보기:'bogi',선지:'choices',해설:'explanation'};const key=map[sg.field]||sg.key;if(!key){status('이 제안은 직접 칸에 옮겨 주세요.',true);return;}mutate(()=>{if(sg.line!==undefined&&key==='bogi'){const b=q.blocks.find(x=>x.kind==='bogi');if(b?.lines[sg.line])b.lines[sg.line].text=sg.text;else writeField(q,'bogi',[fieldValue(q,'bogi'),sg.text].filter(Boolean).join('\n'));}else writeField(q,key,sg.text);});status(`AI 제안을 ${sg.field}에 넣었습니다.`);},
});
// ── 출제 대화(대화형 출제·검토) ──
// 문항이 곧 화면의 문항이다. 요청에는 문항 ID·기준 버전·내용 해시·요청 ID를 묶고, 응답은 바로 쓰지 않는다:
// 변경안은 교사가 「적용」할 때까지 보관하고, 기다리는 동안 문항이 바뀌었으면 '지난 변경안'으로 남긴다.
// 한글 조판 창(5E_hwp)을 문항 카드 가운데 칸에 붙인다. 엑셀식 화면(5E_cell)을 거치지 않는다.
function dockHwp(container){const node=$('#preview-dialog');if(!hwpDock.home){hwpDock.home=node.parentElement;hwpDock.next=node.nextSibling;}
  if(container){if(node.parentElement!==container)container.append(node);node.classList.add('docked');}
  else if(node.classList.contains('docked')){node.classList.remove('docked');hwpDock.home.insertBefore(node,hwpDock.next);}}
let libraryPicks=[];// 5E 라이브러리에서 가져온 자료(이번 창에서만)
const authorRequests=new Map(),seenAuthor=new Set(),cancelledAuthor=new Set();
let authoringTimer=0,authoringChain=Promise.resolve();
const nowIso=()=>new Date().toISOString();
function queueAuthoringSync(){clearTimeout(authoringTimer);authoringTimer=setTimeout(()=>{for(const q of data.questions)if(q.authoring)void syncAuthoring(q.id,{by:'teacher'});},600);}
// 버전 기록은 비동기(해시)라 사본에서 계산한 뒤 출제 기록 칸만 옮긴다. 되돌리기 단계는 만들지 않는다.
function syncAuthoring(qid,opts={}){
  authoringChain=authoringChain.then(async()=>{
    const live=data.questions.find(x=>x.id===qid);if(!live)return null;
    const copy=clone(live);ensureAuthoring(copy);const r=await syncRevision(copy,opts);
    const now=data.questions.find(x=>x.id===qid);if(!now)return r;
    const a=ensureAuthoring(now),c=copy.authoring;
    if(a.contentHash===c.contentHash&&a.revision===c.revision)return r;
    Object.assign(a,{revision:c.revision,contentHash:c.contentHash,hashes:c.hashes,stale:c.stale,history:c.history,bank:c.bank,sessionId:c.sessionId});a.review.axes=c.review.axes;
    for(const p of a.proposals)if(p.state==='current'&&p.baseRevision!==a.revision)p.state='stale';
    try{validate(data);remember({validated:true});}catch(e){status(e.message,true);}
    if(view.name==='card'&&current?.id===qid)cardEditor.refreshAi?.();
    return r;
  }).catch(e=>{status('출제 기록: '+e.message,true);});
  return authoringChain;
}
// 지난 AI 답 이후 교사가 직접 고친 칸(다음 대화의 기준).
function teacherEditsSince(q){const h=q.authoring?.history||[],lastAi=[...h].reverse().find(x=>x.by==='ai');return h.filter(x=>x.by==='teacher'&&(!lastAi||x.revision>lastAi.revision)).map(x=>`버전 ${x.revision}: ${x.summary}`).slice(-8);}
function authoringSummary(q){const a=q.authoring;return {revision:a.revision,target:a.target,requirements:a.requirements,issues:a.issues.filter(i=>i.status==='open').map(i=>i.text).slice(-12),
  stale:a.stale.map(s=>`${labelOf(q,s.target)}: ${s.reason}`),axes:Object.fromEntries(Object.entries(a.review.axes).map(([k,v])=>[AXIS_LABEL[k],v.status])),
  recentHistory:a.history.slice(-5).map(h=>`버전 ${h.revision} (${({ai:'AI 변경안',teacher:'직접 수정',revert:'되돌리기',import:'시작'})[h.by]}): ${h.summary}`)};}
async function askAi(q,{kind,text}){
  const qid=q.id;if(view.name==='card')cardEditor.showAi?.();
  mutate(()=>{ensureAuthoring(q);(q.reviews ||= []).push({role:'me',text,at:nowIso(),kind});if(q.reviews.length>200)q.reviews.splice(0,q.reviews.length-200);},{render:false});
  if(view.name==='card')cardEditor.refreshAi?.();
  if(!embedded){mutate(()=>{q.reviews.push({role:'ai',text:'5E 안에서 열어야 AI 출제 대화를 쓸 수 있습니다.',at:nowIso(),error:true});},{render:false});cardEditor.refreshAi?.();return;}
  await syncAuthoring(qid,{by:'teacher'});
  const live=data.questions.find(x=>x.id===qid);if(!live)return;
  const req=makeRequest(live,kind),{typeset,reviews,authoring,...question}=clone(live);req.contentHash=(await reviewVersion(live)).version;authorRequests.set(req.requestId,req);
  const packet={format:'exampool-authoring-request-v1',kind,text,question,previewHtml:await previewHtml(live).catch(()=>''),authoring:authoringSummary(live),teacherEdits:teacherEditsSince(live),
    conversation:(live.reviews||[]).slice(-13,-1).map(({role,text})=>({role,text})),contentHash:req.contentHash,
    figureCount:live.blocks.filter(b=>b.kind==='figure'&&b.figure?.data).length+live.choices.filter(c=>c.figure?.data).length,figures:[...live.blocks.filter(b=>b.kind==='figure'&&b.figure?.data&&b.figure.data.length<6e6).map(b=>({blockId:b.id,label:b.label||'그림',data:b.figure.data})),...live.choices.map((c,i)=>c.figure?.data&&c.figure.data.length<6e6?{choiceId:c.id,label:'선지 '+'①②③④⑤'[i],data:c.figure.data}:null).filter(Boolean)]};// 그림 선지도 첨부한다(M23)
  if(view.name==='card')cardEditor.refreshAi?.();
  window.parent.postMessage({channel:'5e-question-sheet',action:'author',requestId:req.requestId,qid,packet},location.origin);
}
function cancelAi(q){for(const [id,req] of authorRequests)if(req.qid===q.id){cancelledAuthor.add(id);window.parent.postMessage({channel:'5e-question-sheet',action:'author-cancel',cancelId:id},location.origin);}cardEditor.refreshAi?.();}
const aiPending=q=>{const r=[...authorRequests.values()].find(r=>r.qid===q.id&&!cancelledAuthor.has(r.requestId));if(!r)return null;const p=r.progress||{};return {since:r.at,text:p.stage==='evidence'?`근거 DB에서 ${p.count}건 찾는 중…`:p.stage==='rewrite'?'찾은 근거로 답을 다시 쓰는 중…':p.round>1?'형식을 고쳐 다시 받는 중…':'AI가 답을 쓰는 중…'};};
async function receiveAuthor(m){
  const req=authorRequests.get(m.requestId);if(!req)return;authorRequests.delete(m.requestId);
  const found=data.questions.find(x=>x.id===req.qid),currentHash=found&&req.contentHash?(await reviewVersion(found)).version:null;
  const q=data.questions.find(x=>x.id===req.qid),verdict=classifyResponse(q,req,{seen:seenAuthor,cancelled:cancelledAuthor,currentHash});seenAuthor.add(req.requestId);
  if(verdict==='duplicate')return;
  if(verdict==='gone'){status('AI 답이 왔지만 그 문항이 없어 반영하지 않았습니다.',true);return;}
  if(verdict==='cancelled'){mutate(()=>{q.reviews.push({role:'ai',text:'요청을 취소했습니다. 늦게 온 답은 반영하지 않았습니다.',at:nowIso(),requestId:req.requestId,error:true});},{render:false});cardEditor.refreshAi?.();return;}
  if(m.error){mutate(()=>{q.reviews.push({role:'ai',text:m.error,at:nowIso(),requestId:req.requestId,error:true});},{render:false});cardEditor.refreshAi?.();return;}
  const {response,evidence=[],searches=[],meta={}}=m.result||{};
  if(!response){mutate(()=>{q.reviews.push({role:'ai',text:'AI 답을 읽지 못했습니다.',at:nowIso(),error:true});},{render:false});cardEditor.refreshAi?.();return;}
  const evidenceMap=new Map(evidence.map(e=>[e.ref,{kind:{curriculum:'curriculum',past:'past',claim:'paper',textbook:'textbook'}[e.kind]||'other',title:String(e.title||'').slice(0,600),ref:e.ref,quote:String(e.quote||'').slice(0,6000),page:Number.isInteger(e.page)&&e.page>0?e.page:null,sha256:/^[a-f0-9]{64}$/.test(e.sha256||'')?e.sha256:null,bbox:Array.isArray(e.bbox)&&e.bbox.length===4&&e.bbox.every(Number.isFinite)?e.bbox:null}]));
  const reflected=mutate(()=>{
    const stale=verdict==='stale',msg={role:'ai',text:String(response.reply||'').slice(0,20000),at:nowIso(),requestId:req.requestId,kind:req.kind,
      questions:(response.questions||[]).map(String).slice(0,3),figures:(response.figures||[]).slice(0,6).map(f=>({kind:f.kind,slot:String(f.slot||'new').slice(0,80),description:String(f.description).slice(0,3000),mustNot:(f.mustNot||[]).map(String).slice(0,6)})),
      items:(response.review?.items||[]).slice(0,30).map(it=>({field:String(it.target||''),text:[it.problem,it.fix&&`→ ${it.fix}`].filter(Boolean).join(' ').slice(0,2000),severity:it.severity})),
      searches:searches.slice(0,6),meta:{model:meta.model,ms:meta.ms,attempts:meta.attempts?.length||0,live:!!meta.live,guidelines:meta.guidelines},stale};
    // 요구사항·출제 대상·쟁점은 대화 기록이라 바로 남긴다. 검토 축·다시 푼 결과·근거는 '그 내용'에 묶는다:
    // 변경안이 있으면 변경안에 붙여 두었다가 적용할 때 새 버전에 기록하고, 없으면 지금 버전에 기록한다.
    const changes=proposalChanges(q,response.proposal),reviewPack={review:response.review||null,solve:response.solve||null,evidenceUsed:response.evidenceUsed||[],evidence:[...evidenceMap.entries()]};
    recordConversation(q,response);
    const structure=previewStructure(q,response);msg.notes=[...structure.problems,...structure.notes].map(p=>(changes.length?'변경안 기준: ':'')+p.text).slice(0,8);
    if(stale)msg.notes.unshift('기다리는 동안 문항 내용이 바뀌어(직접 수정 등), 이 답은 요청할 때의 내용 기준입니다. 검토 상태에는 반영하지 않았고 변경안은 확인 후 적용할 수 있습니다.');
    else if(!changes.length){const before=ensureAuthoring(q).evidence.length;recordReview(q,response,{evidence:evidenceMap,figuresSeen:meta.figuresSeen===true&&verdict==='current'});msg.evidence=q.authoring.evidence.slice(before).slice(-12).map(b=>({target:labelOf(q,b.target),judgement:b.judgement,title:b.source?.title||'',claim:b.claim}));}
    else msg.evidence=(response.evidenceUsed||[]).slice(0,12).map(e=>({target:String(e.target||''),judgement:evidenceMap.has(String(e.ref))?e.judgement:'missing',title:evidenceMap.get(String(e.ref))?.title||'',claim:String(e.claim||'')}));
    if(changes.length){const p=storeProposal(q,req,{summary:response.proposal.summary||'AI 변경안',changes,review:reviewPack},stale?'stale':'current');msg.proposalId=p.id;}
    (q.reviews ||= []).push(msg);if(q.reviews.length>200)q.reviews.splice(0,q.reviews.length-200);
    if(req.kind==='review'&&(q.workflow||'draft')==='draft')q.workflow='review';
  },{render:false});
  // 반영 중 예외가 나면 mutate가 통째로 되돌려 답이 흔적 없이 사라졌다(M24). 답 글만이라도 대화에 남기고 이유를 알린다.
  // 되돌리기로 문항 객체가 바뀌었을 수 있어 다시 찾는다.
  if(!reflected)mutate(()=>{const live=data.questions.find(x=>x.id===req.qid);if(!live)return;(live.reviews ||= []).push({role:'ai',text:String(response.reply||'').slice(0,20000)||'AI 답을 반영하지 못했습니다.',at:nowIso(),requestId:req.requestId,kind:req.kind,error:true,
    notes:['답의 일부 형식이 맞지 않아 변경안·검토 결과는 반영하지 못했습니다. 같은 요청을 한 번 더 보내 주세요.']});},{render:false});
  cardEditor.refreshAi?.();
}
// ── 그림·그래프: AI가 쓴 제작 명세로 기존 엔진을 불러 문항의 그림 칸에 넣는다 ──
// 그래프는 편집 가능한 그래프 객체(수식·데이터·축)를 출제 기록에 함께 둔다. 그림은 비트맵이다(벡터라고 하지 않는다).
const figureRequests=new Map();
function figureSlot(q,spec){
  const figs=q.blocks.filter(b=>b.kind==='figure');
  // 이름만 같은 칸은 비어 있을 때만 쓴다. 예전에는 이름이 같은 첫 칸(교사 그림이 든 칸)을 덮어썼다(M27).
  return figs.find(b=>b.id===spec.slot)||figs.find(b=>b.label===spec.slot&&!b.figure?.data)||figs.find(b=>!b.figure?.data)||null;
}
function createFigure(q,spec,{prior=null,blockId=null}={}){
  if(!embedded){status('5E 안에서 열어야 그림·그래프를 만들 수 있습니다.',true);return;}
  if([...figureRequests.values()].some(r=>r.qid===q.id)){status('이 문항의 그림·그래프를 만드는 중입니다.',true);return;}
  let slot=blockId?q.blocks.find(b=>b.id===blockId):figureSlot(q,spec);
  if(!slot){mutate(()=>{slot=block('figure',null,spec.kind==='graph'?'그래프':'그림');q.blocks.push(slot);});if(!slot)return;}
  const requestId=uid();figureRequests.set(requestId,{qid:q.id,blockId:slot.id,kind:spec.kind,description:spec.description,mustNot:spec.mustNot||[],at:nowIso(),before:slot.figure?.data||null});
  status(`${spec.kind==='graph'?'그래프를':'그림을'} 만드는 중입니다(${slot.label||'그림 칸'})…`);cardEditor.refreshAi?.();
  window.parent.postMessage({channel:'5e-question-sheet',action:'figure-create',requestId,qid:q.id,kind:spec.kind,description:spec.description,mustNot:spec.mustNot||[],prior},location.origin);
}
function figureLink(q,blockId){return q.authoring?.figures.find(f=>f.blockId===blockId)||null;}
function remakeFigure(q,blockId,request){const link=figureLink(q,blockId);if(!link)return;const b=q.blocks.find(x=>x.id===blockId);
  createFigure(q,{kind:link.kind,description:request?`${link.description}\n수정 요청: ${request}`:link.description,mustNot:link.mustNot||[]},{blockId,prior:link.kind==='graph'?{graph:link.graph}:{data:b?.figure?.data||null}});}
function editGraphFigure(q,blockId){const link=figureLink(q,blockId);if(!link?.graph){status('이 그림에는 편집 가능한 그래프 원본이 없습니다.',true);return;}
  const requestId=uid();figureRequests.set(requestId,{qid:q.id,blockId,kind:'graph',description:link.description,mustNot:link.mustNot||[],edit:true,at:nowIso()});
  window.parent.postMessage({channel:'5e-question-sheet',action:'figure-edit-graph',requestId,qid:q.id,graph:link.graph},location.origin);}
async function receiveFigure(m){
  const req=figureRequests.get(m.requestId);if(!req)return;figureRequests.delete(m.requestId);
  const q=data.questions.find(x=>x.id===req.qid);if(!q){status('그림이 왔지만 그 문항이 없어 넣지 않았습니다.',true);return;}
  if(m.cancelled){cardEditor.refreshAi?.();return;}
  if(m.error||!m.result?.data){status((req.kind==='graph'?'그래프':'그림')+' 만들기 실패: '+(m.error||'결과 없음'),true);mutate(()=>{(q.reviews ||= []).push({role:'ai',text:`${req.kind==='graph'?'그래프':'그림'} 만들기에 실패했습니다: ${m.error||'결과 없음'} · 문항의 그림 칸은 그대로입니다.`,at:nowIso(),error:true});},{render:false});cardEditor.refreshAi?.();return;}
  const r=m.result,hash=await sha256Text(r.data),asked=q.blocks.find(x=>x.id===req.blockId);
  if(!asked){status('그림 칸이 사라져 넣지 않았습니다.',true);return;}
  // 만드는 동안 그 칸을 표 등으로 바꿨거나 교사가 다른 그림을 넣었으면, 그 칸을 덮지 않고 새 그림 칸에 넣는다(M27).
  // 예전에는 표로 바뀐 칸에 그림을 넣어 보이지 않는 채 저장했다.
  const reuse=asked.kind==='figure'&&(asked.figure?.data||null)===req.before;let b=asked;
  const ok=mutate(()=>{
    if(!reuse){b=block('figure',null,req.kind==='graph'?'그래프':'그림');q.blocks.push(b);}
    b.figure={name:`${req.kind==='graph'?'그래프':'그림'} · ${(b.label||'').slice(0,40)}.png`,data:r.data,...(r.width?{width:r.width,height:r.height}:{})};
    const a=ensureAuthoring(q),link={blockId:b.id,kind:req.kind,description:req.description.slice(0,4000),mustNot:req.mustNot,resultHash:hash,editable:req.kind==='graph',engine:r.engine||null,model:r.model||null,ms:r.ms||null,revision:a.revision,at:nowIso(),...(r.graph?{graph:r.graph}:{}),...(r.issues?.length?{issues:r.issues}:{})};
    a.figures=a.figures.filter(f=>f.blockId!==b.id);a.figures.push(link);
    (q.reviews ||= []).push({role:'ai',text:`${r.edited?'그래프를 직접 편집한 결과를':req.kind==='graph'?'그래프를 만들어':'그림을 만들어'} ${b.label||'그림 칸'}에 넣었습니다${r.ms?` (${Math.round(r.ms/1000)}초)`:''}.${req.kind==='image'?' 비트맵 그림이라 선·글자를 고치려면 5E에서 편집하세요.':' 수식·데이터·축은 「그래프 편집」에서 고칠 수 있습니다.'} 실제 그림이 들어갔으니 「검토해 줘」로 그림과 문항을 함께 확인하세요.`,at:nowIso(),...(r.issues?.length?{notes:r.issues.map(x=>'그래프 확인: '+x)}:{})});
  });
  if(ok){status(`${b.label||'그림 칸'}에 ${req.kind==='graph'?'그래프를':'그림을'} 넣었습니다.`);void syncAuthoring(q.id,{by:r.edited?'teacher':'ai',summary:`${b.label||'그림'} ${r.edited?'그래프 직접 편집':req.kind==='graph'?'그래프 생성':'그림 생성'}`});}
}
async function sha256Text(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(v=>v.toString(16).padStart(2,'0')).join('');}
const figurePending=q=>[...figureRequests.values()].find(r=>r.qid===q.id)||null;
async function decideProposal(q,id,action,{force=false}={}){
  if(action==='reject'){mutate(()=>{rejectProposal(q,id);},{render:false});cardEditor.refreshAi?.();return;}
  let p=q.authoring?.proposals.find(x=>x.id===id);if(!p)return;
  // 버전 표시(state)는 입력이 멈춘 뒤 0.6초에 갱신된다. 그 틈에 교사가 고친 내용을 확인 없이 덮어쓰고, 옛 버전 검토를 새 버전 검토로
  // 기록했다(M26). 적용 직전에 지금 내용의 버전을 직접 계산해 비교한다.
  let stale=p.state!=='current';
  if(!stale){const {version}=await reviewVersion(q);stale=version!==q.authoring?.contentHash;}
  if(stale&&!force&&!confirm('이 변경안은 지난 버전을 기준으로 만들어졌습니다. 지금 내용 위에 적용할까요?'))return;
  q=data.questions.find(x=>x.id===q.id);p=q?.authoring?.proposals.find(x=>x.id===id);if(!p)return;
  let applied=null;const ok=mutate(()=>{applied=applyProposal(q,id,{force:true});});
  if(ok){status(`AI 변경안을 적용했습니다${applied.errors.length?` · 적용 못 한 변경 ${applied.errors.length}개: ${applied.errors[0].message}`:''} · 되돌리기(⌘Z)로 취소할 수 있습니다.`);
    void syncAuthoring(q.id,{by:'ai',summary:'AI 변경안: '+p.summary.slice(0,200)}).then(()=>{
      // 변경안을 만든 검토는 '변경안 그대로' 적용했을 때만 새 버전의 검토로 남긴다(일부만 적용됐거나 지난 변경안이면 남기지 않음).
      const live=data.questions.find(x=>x.id===q.id);if(!live||!p.review||applied.errors.length||stale)return;
      mutate(()=>{recordReview(live,{review:p.review.review,solve:p.review.solve,evidenceUsed:p.review.evidenceUsed},{evidence:new Map(p.review.evidence||[])});},{render:false});cardEditor.refreshAi?.();});}
}
function revertAuthoring(q,revision){
  if(!confirm(`버전 ${revision}의 내용으로 되돌릴까요? 지금 내용은 이력에 남습니다.`))return;
  if(mutate(()=>{restoreRevision(q,revision);}))void syncAuthoring(q.id,{by:'revert',summary:`버전 ${revision}으로 되돌림`});
}
// 출제 답은 같은 원점 + 이 창이 만든 요청 ID일 때만 받는다(WebKit은 비동기 응답의 e.source가 부모 창이 아닐 수 있다).
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.data?.channel!=='5e-question-sheet'||!authorRequests.has(e.data.requestId))return;
  if(e.data.action==='author-progress'){authorRequests.get(e.data.requestId).progress=e.data.progress;cardEditor.refreshAi?.();return;}
  if(e.data.action==='author-ready')receiveAuthor(e.data);});
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==window.parent||e.data?.channel!=='5e-question-sheet'||e.data.action!=='library-picked')return;const items=(e.data.items||[]).filter(x=>/^data:image\/(png|jpeg|webp);base64,/.test(x?.data||'')&&x.data.length<8*1024*1024);if(items.length){libraryPicks=[...items,...libraryPicks].slice(0,24);status(`5E 라이브러리에서 ${items.length}개를 가져왔습니다 · 근거로 연결하거나 그림 칸에 넣으세요.`);}if(e.data.reveal&&items.length)cardEditor.showPicks?.();else cardEditor.refreshLibrary?.();});
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.data?.channel!=='5e-question-sheet'||e.data.action!=='figure-made'||!figureRequests.has(e.data.requestId))return;void receiveFigure(e.data);});
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==window.parent||e.data?.channel!=='5e-question-sheet')return;const m=e.data;
  if(m.requestId&&m.requestId===examRequest){examRequest=null;if(m.error){status(m.error,true);return;}const exam=examById(data,m.qid);if(exam)mutate(()=>{exam.sentAt=new Date().toISOString();});status('시험지를 5E_hwp에서 열었습니다 · 최종 검수 후 「출제 완료로 옮기기」를 누르세요.');}
});
// 위쪽 막대: 로고는 문항 보관함(홈), 이동 줄 앞 단계는 보관함 또는 지금 문항이 든 시험지.
$('#brand-home').onclick=()=>{view.examId=null;show('library');};
// 맨 위 줄(5E 세 프로그램 공통): 다른 프로그램 이름을 누르면 5E에 전환을 부탁하고(app-switch.js), ↶ ↷는 시트의 되돌리기·다시 실행을 그대로 누른다(기록 하나).
document.addEventListener('click',e=>{const b=e.target.closest?.('button[data-app-switch]');if(!b)return;e.preventDefault();if(e.detail>1)return;/* 두 번 누름(M8) */if(window.parent!==window)window.parent.postMessage({channel:'5e-app-switch',app:b.dataset.appSwitch},location.origin);});
for(const [top,src] of [['#top-undo','#undo'],['#top-redo','#redo']]){const t=$(top),o=$(src);if(!t||!o)continue;t.onclick=()=>o.click();const sync=()=>{t.disabled=o.disabled;};sync();new MutationObserver(sync).observe(o,{attributes:true,attributeFilter:['disabled']});}
$('#crumb-view').onclick=()=>{if(view.name==='library'){libView.close();renderView();return;}if(view.examId&&examById(data,view.examId)&&view.name!=='exam')show('exam');else{view.examId=null;show('library');}};
// 왼쪽 메뉴·오른쪽 라이브러리 접기.
$('#toggle-nav').onclick=()=>{const off=!document.querySelector('.shell-body').classList.contains('nav-off');document.querySelector('.shell-body').classList.toggle('nav-off',off);$('#toggle-nav').setAttribute('aria-pressed',String(!off));try{localStorage.setItem(CHANNEL+'exampool-nav',off?'0':'1');}catch{}};
try{if(localStorage.getItem(CHANNEL+'exampool-nav')==='0'){document.querySelector('.shell-body').classList.add('nav-off');$('#toggle-nav').setAttribute('aria-pressed','false');}}catch{}
$('#toggle-lib').onclick=()=>$('#card-view [data-cv="toggle-lib"]')?.click();

await boot();
// 대화 창이 열리고 닫힐 때 바깥 5E에 알린다(상태 줄·튜토리얼 말풍선을 같이 흐리게).
if(embedded){let modal=false;const tell=()=>{const open=[...document.querySelectorAll('dialog')].some(d=>d.open&&d.matches(':modal'));if(open!==modal){modal=open;window.parent.postMessage({channel:'5e-question-sheet',action:'modal',open},location.origin);}};new MutationObserver(tell).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});}
// 칸 높이·열 폭은 입력하는 동안과 창 크기가 바뀔 때(한글 창 열고 닫기 포함) 다시 맞춘다.
$('#rows').addEventListener('input',e=>fitRow(e.target.closest('tr')));
new ResizeObserver(()=>{sizeColumns();fitRows();}).observe(document.querySelector('.registry'));
