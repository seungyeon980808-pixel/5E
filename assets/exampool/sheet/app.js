import {FORMAT,TYPES,PRESETS,STYLES,KINDS,targetDisplay,uid,clone,block,newQuestion,applyPreset,parentOptions,tableCovered,cellValue,mergeCells,migrate,fromLegacy,validate,duplicateQuestion} from './model.js';
import {renderSide,renderCards,renderExam,workflowOf,questionTitle,questionSubtitle,TITLES} from './views.js';
import {toggleExam,moveExam} from './exam-layout.js';
import {applyTextEdit} from './text-sync.js';
import {loadImage} from './image-load.js';
import {exportExcel,importExcel} from './excel.js';
import {handoffQuestion} from './handoff.js';
import {createSheetGrid} from './grid.js';
import {applyGridValues,columnName} from './grid-model.js';
import {ROWS,fieldValue,applyVerticalValues} from './vertical.js';
import {TEMPLATES,questionFromTemplate} from './templates.js';
import {createTypesetter} from './typeset.js?v=1014-compact-panel';
import {renderParts,applyPartChange,movePart} from './parts-view.js';
let grid=null,future=[];
let handoffRequest=null;
import {createPdfRuntimeLoader} from '/js/pdf-library/runtime-loader.js?v=1.7.0-four-session-integration';
const $=s=>document.querySelector(s),E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),labels=['①','②','③','④','⑤'];
const options=(values,value)=>values.map(v=>`<option ${v===value?'selected':''}>${E(v)}</option>`).join('');
const demo=new URLSearchParams(location.search).has('example'),embedded=window.parent!==window;
if(demo){$('.brand-page').textContent='문항 시트 · 구조 예제';$('.brand-page').title='실제 문항과 별도 공간에 저장하는 편집 연습 예제입니다.';}
if(embedded)$('[data-change-summary]').hidden=true;
let database=null,revision=0,saveQueue=Promise.resolve(),saveStamp=0,saveBlocked=false,history=[],editKey='',cellNode=null,pending=null,imageTarget=null,selection=null,activeTab='composition',sourceTab='standards',sourceTarget='question',doc=null,page=1,sourceSeq=0,selectedStandard=null;
let data={format:FORMAT,questions:[],documents:[]},current=null,standards=null;
function status(message,error=false){$('#status').textContent=message;$('#status').dataset.error=String(error);}
function checkpoint(key=''){future=[];if(key&&editKey===key)return;history.push(clone(data));if(history.length>10)history.shift();editKey=key;$('#undo').disabled=false;$('#redo').disabled=true;}
function remember(){
  try{validate(data);}catch(e){status(e.message,true);return;}
  const stamp=++saveStamp;status('저장 중…');saveQueue=saveQueue.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{
    if(stamp!==saveStamp){resolve();return;}const snapshot=clone(data);
    if(!database||saveBlocked){reject(Error('자동 저장을 사용할 수 없습니다. 엑셀로 내려받아 보관하세요.'));return;}
    const tx=database.transaction('state','readwrite'),store=tx.objectStore('state'),r=store.get('draft');let failure;
    r.onsuccess=()=>{if((r.result?._revision||0)!==revision){failure=Error('다른 창에서 수정했습니다. 이 창의 입력은 엑셀로 내려받아 보관하고 다시 열어주세요.');saveBlocked=true;tx.abort();return;}store.put({...snapshot,_revision:revision+1},'draft');};
    tx.oncomplete=()=>{revision++;resolve();};tx.onerror=tx.onabort=()=>reject(failure||tx.error||Error('저장 공간이 부족합니다. 엑셀로 내려받아 보관하세요.'));
  }));void saveQueue.then(()=>{if(stamp===saveStamp)status('저장됨 · '+new Date().toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'}));}).catch(e=>status(e.message,true));
}
function mutate(fn,{render=true,key=''}={}){const selectedId=current?.id,historyBefore=history.slice(),added=!key||editKey!==key,before=added?null:clone(data),redoBefore=future;try{checkpoint(key);const completed=completeKeys();fn();demoteEdited(completed);validate(data);if(render)renderAll();remember();return true;}catch(e){const rollback=added?history.pop():before;if(rollback){data=rollback;current=data.questions.find(q=>q.id===selectedId)||data.questions[0]||null;}future=redoBefore;history=historyBefore;$('#undo').disabled=!history.length;$('#redo').disabled=!future.length;editKey='';if(render)renderAll();status(e.message,true);return false;}}
async function boot(){try{
  database=await new Promise((resolve,reject)=>{const r=indexedDB.open(demo?'5e-exampool-structure-demo':'5e-exampool-structure',2);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('state'))r.result.createObjectStore('state');if(!r.result.objectStoreNames.contains('backups'))r.result.createObjectStore('backups');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('다른 문항 창을 닫고 다시 열어주세요.'));});
  let raw=await new Promise((resolve,reject)=>{const r=database.transaction('state').objectStore('state').get('draft');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}),copied=false;
  if(!raw&&!demo){
    const available=await indexedDB.databases?.()||[];
    if(available.some(d=>d.name==='5e-exampool-sheet-concept')){const oldDB=await new Promise((resolve,reject)=>{const r=indexedDB.open('5e-exampool-sheet-concept');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{raw=await new Promise((resolve,reject)=>{const r=oldDB.transaction('state').objectStore('state').get('draft');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});copied=!!raw;}finally{oldDB.close();}}
    if(!raw&&available.some(d=>d.name==='5e-exampool')){const {listQuestions,listResources}=await import('/js/exampool-store.js?v=1013-exampool'),qs=await listQuestions(),docs=await listResources();if(qs.length){raw={format:FORMAT,questions:qs.map(fromLegacy),documents:docs.map(d=>({id:d.id,name:d.title,kind:d.kind==='교과서'?'textbooks':'references',mime:d.mime,data:`data:${d.mime};base64,${d.base64}`,pages:d.pages}))};copied=true;}}
  }
  if(raw){revision=copied?0:raw._revision||0;data=migrate(raw);if(copied||raw.format!==FORMAT){await new Promise((resolve,reject)=>{const tx=database.transaction('backups','readwrite');tx.objectStore('backups').put(raw,'before-structure-v2');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});status('기존 입력을 보존하고 문항 구성으로 옮겼습니다.');remember();}}
  else if(demo){data=validate(await(await fetch('/assets/exampool/sheet/examples.json')).json());remember();}
  current=data.questions[0]||null;view.name=data.questions.length&&new URLSearchParams(location.search).get('view')!=='desk'?'cards':'desk';renderAll();if(raw)status('저장한 문항을 열었습니다.');if(!raw&&!demo)status('새 문항 또는 엑셀 올리기로 시작하세요.');
}catch(e){saveBlocked=true;renderAll();status('저장된 입력을 열지 못했습니다. 기존 저장은 보존했습니다. '+e.message,true);}
  try{standards=await(await fetch('/assets/exampool/standards.json')).json();}catch{status('성취기준 자료를 불러오지 못했습니다. 자료 열람에서 다시 시도하세요.',true);}
}
function renderRows(){const query=$('#filter').value.toLowerCase(),visible=data.questions.filter(q=>(q.number+' '+q.ask+' '+q.standardCode+' '+q.source+' '+(q.managementId||'')+' '+(q.concepts||[]).join(' ')).toLowerCase().includes(query));
  const table=$('#registry');table.querySelector('colgroup').innerHTML='<col class="row-col"><col class="field-col">'+visible.map(()=>'<col class="question-col">').join('');
  table.style.width=(186+visible.length*262)+'px';
  table.tHead.innerHTML='<tr class="letters"><th></th><th>A</th>'+visible.map((q,c)=>`<th>${columnName(c+1)}</th>`).join('')+'</tr><tr><th></th><th>항목</th>'+visible.map(q=>`<th data-id="${q.id}" data-current="${q.id===current?.id}"><button data-preview="${q.id}" title="클릭하여 문항 조판 열기">${E(q.managementId||q.number+'번 문항')} <span>조판 보기</span></button></th>`).join('')+'</tr>';
  table.tHead.rows[1].cells[1].textContent='항목';
  $('#rows').innerHTML=ROWS.map((row,r)=>`<tr class="${row.tall?'tall-row':''}"><th class="row-num" scope="row">${r+1}</th><th class="field-label" scope="row" title="${E(row.hint||'')}">${row.label}</th>${visible.map(q=>{const value=fieldValue(q,row.key),open=row.key==='choices'&&['대응표','그림·그래프'].includes(q.style)?q.style==='대응표'?'tables':'composition':row.open,attr=`data-field="${row.key}" aria-label="${E(q.number)}번 ${row.label}"`;return `<td data-id="${q.id}" ${open?`data-open="${open}" title="더블클릭 또는 F2로 편집"`:''}>${row.options?`<select ${attr}>${options(row.options,value)}</select>`:`<textarea ${attr} rows="1" maxlength="32767">${E(value)}</textarea>`}</td>`;}).join('')}</tr>`).join('');
  $('#count').textContent=visible.length===data.questions.length?`${data.questions.length}문항`:`${visible.length} / ${data.questions.length}문항`;$('#empty').hidden=!!data.questions.length;for(const id of ['duplicate','preview','edit-detail'])$('#'+id).disabled=!current;$('#detail').hidden=!current;
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
const contentOf=q=>{const {typeset,references,workflow,...c}=q;return JSON.stringify(c);};
function completeKeys(){const m=new Map();for(const q of data.questions)if(q.workflow==='complete')m.set(q.id,contentOf(q));return m;}
function demoteEdited(keys){let n=0;for(const [id,k] of keys){const q=data.questions.find(x=>x.id===id);if(q?.workflow==='complete'&&contentOf(q)!==k){q.workflow='review';n++;}}if(n)setTimeout(()=>status(`완성한 문항 ${n}개의 내용이 바뀌어 점검할 문항으로 옮겼습니다.`),0);}
// 화면: cards(분류별 카드) · desk(5E_cell·5e_hwp 작업대) · exam(시험지 구성). 처음에는 문항이 있으면 카드로 연다.
let view={name:'desk',status:'draft',query:'',type:''};
function renderView(){
  $('#cards-view').hidden=view.name!=='cards';$('#exam-view').hidden=view.name!=='exam';$('.workspace').hidden=view.name!=='desk';
  renderSide($('.side'),data,view);
  if(view.name==='cards')renderCards($('#cards-view'),data,view,current?.id);
  if(view.name==='exam')renderExam($('#exam-view'),data);
  const list=data.questions,at=current?list.indexOf(current):-1;
  $('#crumb-view').textContent=view.name==='exam'?'시험지 구성':view.name==='cards'?TITLES[view.status]:current?TITLES[workflowOf(current)]:'문항 시트';
  $('#crumb-question').textContent=view.name==='desk'&&current?`${questionTitle(current)} · ${questionSubtitle(current)}`:'';
  $('#question-position').textContent=list.length?`${at+1} / ${list.length}`:'0 / 0';
  $('#question-prev').disabled=at<=0;$('#question-next').disabled=at<0||at>=list.length-1;
  document.querySelector('.crumb-step').hidden=view.name!=='desk';
  $('#workflow').disabled=!current||view.name!=='desk';$('#workflow').value=current?workflowOf(current):'draft';
  document.querySelector('.workflow-pick').hidden=view.name!=='desk';
}
function show(name,extra={}){if(name!=='desk'&&grid?.finish()===false)return;view={...view,...extra,name};renderView();if(name==='desk'){grid?.refresh({questionId:current?.id});}}
function renderAll(){cellNode=null;renderRows();if(current)renderDetail();renderSheetView();renderView();$('#undo').disabled=!history.length;$('#redo').disabled=!future.length;grid?.refresh({questionId:current?.id});if(typesetter&&current&&!$('#preview-dialog').hidden){const stale=!typesetter.matches(current);$('#typeset-refresh').hidden=!stale;if(stale&&(typesetter.questionId===current.id||!typesetter.matches(current))){if(!typesetter.dirty)scheduleRedraw();else{$('#typeset-status').textContent='시트 내용 변경됨 · 한글 창의 저장 전 수정이 있어 자동으로 다시 그리지 않습니다. 조판 저장 후 문항 새로고침을 누르세요.';$('#typeset-status').dataset.error='false';}}}}
// 데이터는 하나: 시트·구성 값을 고치면 한글 창을 잠시 뒤 다시 그린다. 한글 창에 저장 전 수정이 있으면 덮어쓰지 않는다.
let redrawTimer=0;function scheduleRedraw(){clearTimeout(redrawTimer);redrawTimer=setTimeout(()=>{if(current&&typesetter&&!typesetter.dirty&&!$('#preview-dialog').hidden&&!typesetter.matches(current))void requestTypeset(current);},450);}
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
$('#sheet-parts').addEventListener('click',e=>{const n=e.target.closest('[data-part-move]'),row=e.target.closest('[data-part-id]');if(!n||!row||!current)return;mutate(()=>{if(!movePart(current,row.dataset.partId,n.dataset.partMove))throw Error(n.dataset.partMove==='up'?'이미 묶음의 첫 구성입니다.':'이미 묶음의 마지막 구성입니다.');});});
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
document.addEventListener('click',e=>{const n=e.target.closest('button'),row=e.target.closest('#rows tr[data-id]');if(row&&!grid?.manages(e.target))choose(data.questions.find(q=>q.id===row.dataset.id));
  if(!n)return;if(n.dataset.preview){choose(data.questions.find(q=>q.id===n.dataset.preview));void openTypeset();return;}if(n.dataset.close){$('#'+n.dataset.close).close();return;}if(n.dataset.tab){if(current)renderDetail();switchTab(n.dataset.tab);return;}if(n.dataset.source){sourceTab=n.dataset.source;selectedStandard=null;$('#source-search').value='';renderSources();return;}
  if(n.dataset.kind){mutate(()=>current.blocks.push(block(n.dataset.kind,addParent)));$('#add-dialog').close();return;}
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
let templateKey='plain';
$('#template-gallery').innerHTML=TEMPLATES.map(t=>`<button data-template="${t.id}" aria-pressed="${t.id===templateKey}"><div class="template-shape ${t.shape}" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><strong>${E(t.name)}</strong><span>${E(t.description)}</span><small>${E(t.source)}</small></button>`).join('');
$('#template-gallery').onclick=e=>{const b=e.target.closest('[data-template]');if(!b)return;templateKey=b.dataset.template;if(templateKey==='graph-choices'){$('#new-type').value='객관식';$('#new-style').value='그림·그래프';}$('#template-gallery').querySelectorAll('button').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));};
$('#new').onclick=()=>$('#new-dialog').showModal();$('#create').onclick=()=>{const ok=mutate(()=>{if(data.questions.length>=500)throw Error('문항은 500개까지 만들 수 있습니다.');current=questionFromTemplate(templateKey,String(data.questions.length+1),$('#new-type').value,$('#new-style').value);data.questions.push(current);activeTab='composition';});if(ok){$('#new-dialog').close();show('desk');}};
$('#edit-detail').onclick=()=>openDetail();
$('#detail-dialog').addEventListener('close',()=>{grid?.finish();renderRows();renderSheetView();grid?.refresh({questionId:current?.id});});
$('#add').onclick=()=>{addParent=null;$('#add-dialog').showModal();};$('#duplicate').onclick=()=>mutate(()=>{if(data.questions.length>=500)throw Error('문항은 500개까지 만들 수 있습니다.');current=duplicateQuestion(current);current.number=String(data.questions.length+1);data.questions.push(current);});
function replay(which){grid?.finish(true);const source=which==='redo'?future:history,destination=which==='redo'?history:future,old=source.pop();if(!old)return;destination.push(clone(data));const id=current?.id;data=old;current=data.questions.find(q=>q.id===id)||data.questions[0]||null;editKey='';renderAll();remember();}
$('#undo').onclick=()=>replay('undo');$('#redo').onclick=()=>replay('redo');
$('#delete-question').onclick=()=>{$('#delete-message').textContent=`${current.number}번 문항을 삭제합니다. 되돌리기로 복원할 수 있습니다.`;$('#delete-dialog').showModal();};$('#delete-confirm').onclick=()=>{mutate(()=>{const id=current.id;data.questions=data.questions.filter(q=>q.id!==id);if(data.examSet)data.examSet.items=data.examSet.items.filter(x=>x!==id);current=data.questions[0]||null;});$('#delete-dialog').close();};
$('#filter').oninput=()=>{renderRows();grid?.refresh();};
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(grid?.finish()!==false)$('#export').click();return;}if((e.metaKey||e.ctrlKey)&&['z','y'].includes(e.key.toLowerCase())&&!e.target.matches('input,textarea,select')){e.preventDefault();replay(e.shiftKey||e.key.toLowerCase()==='y'?'redo':'undo');return;}if(e.key==='Escape'&&!document.querySelector('dialog[open]'))closeSources();});
function download(bytes,name,mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'){const url=URL.createObjectURL(new Blob([bytes],{type:mime})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
$('#export').onclick=async()=>{try{status('엑셀 만드는 중…');const bytes=await exportExcel(window.XLSX,window.JSZip,data);download(bytes,'ExamPool-문항.xlsx');status('엑셀 내려받기 완료 · 구성·표·그림·자료와 5E 원본을 함께 보관합니다.');}catch(e){status(e.message,true);}};
$('#import').onclick=()=>$('#excel-file').click();$('#excel-file').onchange=async()=>{const file=$('#excel-file').files[0];if(!file)return;try{
  status('파일 확인 중…');if(/\.xlsx$/i.test(file.name))pending=await importExcel(window.XLSX,window.JSZip,await file.arrayBuffer());else{if(file.size>32*1024*1024)throw Error('32 MB 이하의 문항 파일을 선택하세요.');const v=JSON.parse(await file.text());if(v.format===FORMAT)pending={...validate(v),backedIds:v.questions.map(q=>q.id),warnings:[]};else{const {decodePoolBundle}=await import('/js/exampool-model.js?v=1013-exampool');const pack=decodePoolBundle(JSON.stringify(v));pending=validate({format:FORMAT,questions:pack.items.map(fromLegacy),documents:pack.resources.map(d=>({id:d.id,name:d.title,kind:d.kind==='교과서'?'textbooks':'references',mime:d.mime,data:`data:${d.mime};base64,${d.base64}`,pages:d.pages}))});pending.backedIds=pack.items.map(q=>q.id);pending.warnings=[];}}
  const matches=pending.questions.filter(q=>data.questions.some(x=>x.id===q.id)).length;$('#import-count').textContent=`${pending.questions.length}문항 · ${pending.documents.length}자료 · 기존 문항과 일치 ${matches}개${pending.warnings?.length?' · '+pending.warnings.join(' '):''}`;$('#import-preview').innerHTML='<table><thead><tr><th>번호</th><th>답안형</th><th>구성</th><th>발문</th></tr></thead><tbody>'+pending.questions.slice(0,20).map(q=>`<tr><td>${E(q.number)}</td><td>${E(q.type)}</td><td>${q.blocks.length}개</td><td>${E(q.ask)}</td></tr>`).join('')+'</tbody></table>';$('#import-dialog').showModal();status('불러올 내용을 확인하세요. 적용 전에는 기존 입력이 바뀌지 않습니다.');
}catch(e){pending=null;status(e.message,true);}finally{$('#excel-file').value='';}};
$('#apply-import').onclick=()=>{if(!pending)return;const applied=mutate(()=>{const update=$('input[name="import-mode"]:checked').value==='update',docMap=new Map();for(const incoming of pending.documents){const existing=data.documents.find(d=>d.id===incoming.id);if(existing&&JSON.stringify(existing)!==JSON.stringify(incoming)){const d=clone(incoming);d.id=uid();data.documents.push(d);docMap.set(incoming.id,d.id);}else if(!existing)data.documents.push(clone(incoming));}
  for(const incoming of pending.questions){const q=update?clone(incoming):duplicateQuestion(incoming);q.references.forEach(r=>{if(docMap.has(r.documentId))r.documentId=docMap.get(r.documentId);});const at=data.questions.findIndex(v=>v.id===q.id);if(update&&at>=0)data.questions[at]=q;else data.questions.push(q);current=q;}if(data.questions.length>500||data.documents.length>40)throw Error('문항 500개 또는 자료 40개를 초과합니다.');});if(applied){$('#import-dialog').close();pending=null;}else $('#import-count').textContent=$('#status').textContent;};
function fileData(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('파일을 읽지 못했습니다.'));r.readAsDataURL(file);});}
$('#figure-file').onchange=async()=>{const file=$('#figure-file').files[0],owner=imageTarget;if(!file||!owner)return;try{if(file.size>5*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('5 MB 이하의 PNG·JPEG·WebP 그림을 선택하세요.');const value=await fileData(file),image=await loadImage(value);if(image.naturalWidth*image.naturalHeight>40000000)throw Error('그림 크기를 줄여주세요.');const figure={name:file.name,data:value,width:image.naturalWidth,height:image.naturalHeight};if(file.type==='image/png'&&embedded){window.parent.postMessage({channel:'5e-question-sheet',action:'read-figure',qid:owner.qid,key:owner.key,figure},location.origin);return;}mutate(()=>{const q=data.questions.find(q=>q.id===owner.qid),holder=imageHolder(q,owner.key);if(!holder)throw Error('그림을 넣을 구성을 찾지 못했습니다.');holder.figure=figure;});}catch(e){status(e.message,true);}finally{$('#figure-file').value='';imageTarget=null;}};
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==window.parent||e.data?.channel!=='5e-question-sheet')return;const m=e.data;if(m.error){if(m.requestId===handoffRequest){handoffRequest=null;$('#handoff').disabled=false;}status(m.error,true);return;}if(m.action==='handoff-ready'&&m.requestId===handoffRequest){handoffRequest=null;$('#handoff').disabled=false;status('한글로 보내기 완료'+(m.warnings?.length?' · '+m.warnings.join(' '):''));return;}if(m.action==='figure-ready')mutate(()=>{const q=data.questions.find(q=>q.id===m.qid),holder=q&&imageHolder(q,m.key);if(!holder)throw Error('그림을 넣을 구성을 찾지 못했습니다.');holder.figure=m.figure;});});
if(embedded){$('#handoff').hidden=false;$('#handoff').onclick=async()=>{if(!current||handoffRequest)return;try{const question=handoffQuestion(current);const {questionFingerprint,LAYOUT_VERSION}=await import('./typeset-model.js?v=1014-compact-panel');if(!current.typeset||current.typeset.layoutVersion!==LAYOUT_VERSION||current.typeset.fingerprint!==await questionFingerprint(current))throw Error('문항 조판을 열어 확인하고 조판 저장을 누른 뒤 보내세요.');await saveQueue;const requestId=uid();handoffRequest=requestId;$('#handoff').disabled=true;status('선택 문항을 한글로 보내는 중…');window.parent.postMessage({channel:'5e-question-sheet',action:'handoff',requestId,packet:{format:FORMAT,version:2,question,typeset:current.typeset}},location.origin);}catch(e){status(e.message,true);}};$('#return').hidden=false;$('#return').onclick=async()=>{await saveQueue.catch(()=>{});window.parent.postMessage({channel:'5e-question-sheet',action:'close'},location.origin);};}
$('#example').onclick=async()=>{try{const v=validate(await(await fetch('/assets/exampool/sheet/examples.json')).json());mutate(()=>{const qs=v.questions.map(duplicateQuestion);data.questions.push(...qs);current=qs[0];activeTab='composition';});}catch(e){status(e.message,true);}};
// Reference pane is deliberately closed until requested.
const loadRuntime=createPdfRuntimeLoader();let runtimeQueue=Promise.resolve();const runtimeTask=fn=>{const p=runtimeQueue.catch(()=>{}).then(async()=>fn(await loadRuntime()));runtimeQueue=p;return p;};
const bytes=data=>Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));
function showSources(){if($('#detail-dialog').open)$('#detail-dialog').close();$('#sources').hidden=false;$('#sources-toggle').setAttribute('aria-expanded','true');renderSources();}function closeSources(){$('#sources').hidden=true;$('#sources-toggle').setAttribute('aria-expanded','false');sourceSeq++;}
$('#sources-toggle').onclick=()=>{sourceTarget='question';$('#sources').hidden?showSources():closeSources();};$('#sources-close').onclick=closeSources;$('#source-search').oninput=()=>{selectedStandard=null;renderSources();};
function refLinker(){return current?`<p class="muted">연결 대상: ${E(targetLabel(sourceTarget))}</p><textarea id="quote" class="source-quote" rows="2" placeholder="근거 문장 입력 (선택)" aria-label="근거 인용"></textarea><button id="attach-ref" class="primary" style="margin-top:8px">이 자료를 근거로 연결</button>`:'';}
function renderSources(){const query=$('#source-search').value.toLowerCase(),seq=++sourceSeq;document.querySelectorAll('[data-source]').forEach(n=>n.setAttribute('aria-selected',String(n.dataset.source===sourceTab)));
  if(sourceTab==='standards'){
    if(!standards){$('#source-content').innerHTML='<p class="muted">성취기준 자료를 불러오는 중입니다.</p>';return;}const all=standards.standards||standards.items||[];
    if(selectedStandard){const s=selectedStandard;$('#source-content').innerHTML=`<button id="standard-back">목록으로</button><article class="standard-detail"><h3>${E(s.code)}</h3><p>${E(s.text)}</p>${s.explain?`<details open><summary>성취기준 해설</summary><p>${E(s.explain)}</p></details>`:''}<button id="use-standard" class="primary" ${!current?'disabled':''}>문항 성취기준으로 선택</button><p class="muted">${E(standards.source)}</p></article>`;$('#standard-back').onclick=()=>{selectedStandard=null;renderSources();};$('#use-standard').onclick=()=>{mutate(()=>{current.standardCode=s.code;current.references.push({target:sourceTarget,label:s.code,quote:s.text,standardCode:s.code});});renderSources();};return;}
    const subject=$('#source-subject')?.value||'모든 과목',matches=all.filter(s=>(subject==='모든 과목'||s.subject===subject)&&[s.code,s.text,s.subject,s.explain].join(' ').toLowerCase().includes(query));$('#source-content').innerHTML=`<select id="source-subject" aria-label="성취기준 과목">${options(['모든 과목',...new Set(all.map(s=>s.subject))],subject)}</select><p class="muted">${matches.length}개 성취기준</p>${matches.slice(0,150).map(s=>`<button class="standard-item" data-standard="${E(s.code)}"><strong>${E(s.code)} · ${E(s.subject)}</strong><span>${E(s.text)}</span></button>`).join('')}`;$('#source-subject').onchange=renderSources;$('#source-content').querySelectorAll('[data-standard]').forEach(n=>n.onclick=()=>{selectedStandard=all.find(s=>s.code===n.dataset.standard);renderSources();});return;
  }
  const docs=data.documents.filter(d=>(sourceTab==='textbooks'?d.kind==='textbooks':d.kind!=='textbooks')&&[d.name,...d.pages].join(' ').toLowerCase().includes(query));if(!docs.some(d=>d.id===doc?.id)){doc=docs[0]||null;page=1;}
  $('#source-content').innerHTML=`<div class="source-buttons"><button id="add-doc">${sourceTab==='textbooks'?'교과서 파일 열기':'자료 파일 열기'}</button><button id="past-library">물리 기출 찾기</button></div>${docs.map(d=>`<button class="doc-list" data-doc="${d.id}">${E(d.name)} · ${d.pages.length}쪽</button>`).join('')}${doc?`<div class="doc-nav"><button id="prev-page" ${page<=1?'disabled':''}>이전</button><input id="doc-page" type="number" aria-label="자료 쪽수" value="${page}" min="1" max="${doc.pages.length}"><span>/ ${doc.pages.length}쪽</span><button id="next-page" ${page>=doc.pages.length?'disabled':''}>다음</button><button id="download-doc">원본</button></div><div class="doc-page" id="doc-view">원문 여는 중…</div>${refLinker()}`:'<p class="muted">PDF·이미지·텍스트를 열어 원문을 확인하고 근거를 연결하세요.</p>'}`;
  $('#add-doc').onclick=()=>$('#source-file').click();$('#past-library').onclick=loadPastLibrary;document.querySelectorAll('[data-doc]').forEach(n=>n.onclick=()=>{doc=data.documents.find(d=>d.id===n.dataset.doc);page=1;renderSources();});if(!doc)return;
  $('#prev-page').onclick=()=>{page--;renderSources();};$('#next-page').onclick=()=>{page++;renderSources();};$('#doc-page').oninput=e=>{if(e.target.value==='')return;page=Math.max(1,Math.min(doc.pages.length,Number(e.target.value)||1));$('#prev-page').disabled=page<=1;$('#next-page').disabled=page>=doc.pages.length;$('#doc-view').textContent='원문 여는 중…';const seq=++sourceSeq;void showDocument(doc,page,seq).catch(error=>{if(seq===sourceSeq)$('#source-status').textContent=error.message;});};$('#doc-page').onchange=e=>{page=Math.max(1,Math.min(doc.pages.length,Number(e.target.value)||1));renderSources();};$('#download-doc').onclick=()=>download(bytes(doc.data),doc.name,doc.mime);$('#attach-ref').onclick=()=>{const quote=$('#quote').value;mutate(()=>current.references.push({target:sourceTarget,label:doc.name+' '+page+'쪽',documentId:doc.id,page,quote}));status(targetLabel(sourceTarget)+'에 자료의 쪽수와 근거를 연결했습니다.');};void showDocument(doc,page,seq).catch(e=>{if(seq===sourceSeq)$('#source-status').textContent=e.message;});
}
async function showDocument(d,p,seq){if(d.mime==='application/pdf'){const result=await runtimeTask(async runtime=>{if(seq!==sourceSeq)return null;if(!runtime.getDocument(d.id))await runtime.openDocumentResource({id:d.id,title:d.name,source:{kind:'file',locator:d.id,displayName:d.name},data:bytes(d.data)},{id:d.id,title:d.name,pageCount:d.pages.length,pages:[],status:'indexed'});return seq===sourceSeq?runtime.renderPage({documentId:d.id,pageNumber:p,dpi:110}):null;});if(!result||seq!==sourceSeq)return;const url=await fileData(new Blob([result.bytes],{type:'image/png'}));if(seq===sourceSeq)$('#doc-view').innerHTML=`<img src="${url}" alt="${E(d.name)} ${p}쪽">`;}else if(seq===sourceSeq)$('#doc-view').innerHTML=d.mime.startsWith('image/')?`<img src="${E(d.data)}" alt="${E(d.name)}">`:`<pre>${E(d.pages[p-1])}</pre>`;}
async function addDocument(file,kind){if(file.size>5*1024*1024)throw Error('자료는 5 MB 이하로 열어주세요.');const mime=file.type||(/\.txt$/i.test(file.name)?'text/plain':'');if(!['application/pdf','image/png','image/jpeg','image/webp','text/plain'].includes(mime))throw Error('PDF·그림·텍스트 파일을 선택하세요.');const d={id:uid(),name:file.name,kind,mime,data:await fileData(file),pages:['']};if(mime==='application/pdf'){const record=await runtimeTask(r=>r.openDocument({id:d.id,title:d.name,source:{kind:'file',locator:d.id,displayName:d.name},data:bytes(d.data)}));d.pages=record.pages.map(p=>p.text);}if(mime==='text/plain')d.pages=[await file.text()];mutate(()=>{data.documents.push(d);doc=d;page=1;});renderSources();}
$('#source-file').onchange=async()=>{const file=$('#source-file').files[0];if(!file)return;try{$('#source-status').textContent='자료 여는 중…';await addDocument(file,sourceTab==='textbooks'?'textbooks':'references');$('#source-status').textContent='자료 원문을 열었습니다.';}catch(e){$('#source-status').textContent=e.message;}finally{$('#source-file').value='';}};
function pastLabel(d){const m=(d.title||d.name||'').match(/^p([12])_(\d{4})_(06|09|11)\.pdf$/);return m?`${m[2]}학년도 · 물리학${m[1]==='1'?'Ⅰ':'Ⅱ'} · ${{'06':'6월 모의평가','09':'9월 모의평가','11':'수능'}[m[3]]}`:d.title||d.name;}
async function loadPastLibrary(){try{$('#source-content').innerHTML='<p class="muted">물리 기출 목록 여는 중…</p>';const payload=await(await fetch('/assets/pdf-library/catalog-bootstrap.json')).json();const catalog=payload.payload?.catalog||payload;const docs=(catalog.documents||catalog.items||[]).filter(d=>/물리/.test(d.source?.locator||d.title||d.name||''));$('#source-content').innerHTML='<button id="back-docs">내 자료로</button><p class="muted">파일을 선택하면 원문을 열고 이 작업에 보관합니다.</p>'+docs.map((d,i)=>`<button class="doc-list" data-past="${i}">${E(pastLabel(d))}</button>`).join('');$('#back-docs').onclick=renderSources;document.querySelectorAll('[data-past]').forEach(n=>n.onclick=async()=>{try{const d=docs[Number(n.dataset.past)],locator=d.source?.locator||d.locator;const relative=locator.replace(/^5e\.shared\.drive\//,'');const url='https://5e-google-drive-gateway.5e-desktop.workers.dev/v1/google-drive/folders/1N46Woe4wIXs-PoUpVf0Uu4hPkSIUBqgX/public/'+relative.split('/').map(encodeURIComponent).join('/');$('#source-status').textContent='기출 원문 여는 중…';const response=await fetch(url);if(!response.ok)throw Error('기출 원문을 열지 못했습니다.');const blob=await response.blob();await addDocument(new File([blob],(d.title||d.name).replace(/\.pdf$/i,'')+'.pdf',{type:'application/pdf'}),'past');$('#source-status').textContent='기출 원문을 보관했습니다.';}catch(e){$('#source-status').textContent=e.message;}});}catch(e){$('#source-status').textContent=e.message;}}
function openRef(ref){sourceTarget=ref.target;if(ref.documentId){doc=data.documents.find(d=>d.id===ref.documentId);page=ref.page;sourceTab=doc?.kind==='textbooks'?'textbooks':'references';}else{sourceTab='standards';selectedStandard=(standards?.standards||[]).find(s=>s.code===ref.standardCode)||null;}showSources();}
let typesetter=null,typesetRequest,typesetTransition=null;
function makeTypesetter(){return createTypesetter({host:$('#native-editor'),status:$('#typeset-status'),paper:$('#paper-size'),columns:$('#paper-columns'),save:$('#typeset-save'),download:$('#typeset-download'),onSave:async(snapshot,questionId)=>{
          const target=data.questions.find(q=>q.id===questionId);if(!target)throw Error('문항이 삭제되어 조판을 저장할 수 없습니다.');
          const {questionFingerprint}=await import('./typeset-model.js?v=1014-compact-panel');
          if(snapshot.fingerprint!==await questionFingerprint(target))throw Error('시트 내용과 저장 전 조판 수정이 함께 바뀌었습니다. 시트 수정을 되돌린 뒤 조판을 저장하세요. 기존 조판 수정은 유지됩니다.');
          if(!mutate(()=>target.typeset=snapshot))throw Error('조판을 저장하지 못했습니다.');await saveQueue;
        },onTextEdit:(changes,questionId)=>{
          // 한글 창에서 고친 글: 같은 문항의 해당 칸만 바꾼다. 한글 창은 이미 그 글을 보여 주므로 다시 그리지 않는다.
          const target=data.questions.find(q=>q.id===questionId);if(!target)return false;
          return mutate(()=>{for(const c of changes)applyTextEdit(target,c.owner,c.value);});
        },onPlacement:(fn,text,questionId)=>{
          // 한글 창에서 끌어 놓은 결과는 데이터(순서·묶음·폭 비율·크기)로만 저장한다. 화면은 자동으로 다시 그려진다.
          const target=data.questions.find(q=>q.id===questionId);if(!target)return;
          let changed=false;if(mutate(()=>{changed=fn(target)!==false;})){status(changed?text+' · 구성 시트에 반영':'배치가 그대로입니다.');if(changed){clearTimeout(redrawTimer);void requestTypeset(target);}}
        }});}
// 시험지 HWPX: 문항 조판 문서를 모은다. 한글 엔진은 조판 창과 같은 것을 쓴다.
async function buildExamBytes(){typesetter ||= makeTypesetter();return typesetter.buildExam(data);}
// Serialize loads and saves. Fast column clicks keep the last request without
// allowing an older load or a save to bind to the newly selected question.
async function requestTypeset(value){
  typesetRequest=value;
  if(typesetTransition)return typesetTransition;
  typesetTransition=(async()=>{
    const panel=$('#preview-dialog');
    while(typesetRequest!==undefined){
      let next=typesetRequest;typesetRequest=undefined;
      panel.setAttribute('aria-busy','true');
      try{
        await typesetter?.commit();
        if(typesetRequest!==undefined)continue;
        if(next===null){panel.hidden=true;panel.dataset.expanded='false';$('#typeset-expand').setAttribute('aria-pressed','false');$('#typeset-expand').textContent='크게 보기';$('#preview').setAttribute('aria-expanded','false');$('#preview').focus();continue;}
        next=data.questions.find(q=>q.id===next.id);if(!next)throw Error('문항이 삭제되었습니다. 다른 문항을 선택하세요.');
        closeSources();panel.hidden=false;$('#preview').setAttribute('aria-expanded','true');
        typesetter ||= makeTypesetter();
        $('#typeset-title').textContent=`${next.number}번 문항 조판`;
        if(!typesetter.matches(next))await typesetter.open(next);else typesetter.refreshView();
        $('#typeset-refresh').hidden=true;
      }catch(e){
        typesetRequest=undefined;$('#typeset-status').textContent=e.message;$('#typeset-status').dataset.error='true';
        const previous=data.questions.find(q=>q.id===typesetter?.questionId);if(previous){current=previous;renderRows();grid?.refresh({questionId:current.id});$('#typeset-title').textContent=`${previous.number}번 문항 조판`;}
      }finally{panel.setAttribute('aria-busy','false');}
    }
  })();
  try{await typesetTransition;}finally{typesetTransition=null;}
}
async function openTypeset(){if(!current||grid?.finish()===false)return;await requestTypeset(current);}
$('#preview').onclick=()=>void openTypeset();
$('#typeset-close').onclick=()=>void requestTypeset(null);
$('#typeset-refresh').onclick=()=>void openTypeset();
grid=createSheetGrid({formula:$('#formula-value'),nameBox:$('#cell-address'),onStatus:status,onHistory:replay,
  onOpen:(d,tab)=>{choose(data.questions.find(q=>q.id===d.table.tBodies[0].rows[d.r].querySelectorAll('td')[d.c].dataset.id));openDetail(tab);},
  onSelect:d=>{if(!d?.table)return;if(d.id==='registry'){selection=null;const cell=d.table.tBodies[0]?.rows[d.r]?.querySelectorAll('td')[d.c];if(cell&&d.user)choose(data.questions.find(q=>q.id===cell.dataset.id));}else selection={id:d.id,anchor:[d.r,d.c],range:[...d.range]};},
  onWrite:(d,writes,options)=>{const scope=d.id==='registry'?{kind:'registry',ids:[...d.table.tHead.rows[1].cells].filter(n=>n.dataset.id).map(n=>n.dataset.id),allowAppend:!$('#filter').value}:{kind:'table',questionId:current.id,tableId:d.id};return mutate(()=>scope.kind==='registry'?applyVerticalValues(data,scope.ids,writes,options):applyGridValues(data,scope,writes,options));}
});
$('#shortcuts').onclick=()=>$('#shortcuts-dialog').showModal();
document.querySelectorAll('.side-item[data-view]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view,b.dataset.status?{status:b.dataset.status}:{})));
$('#side-new').onclick=()=>$('#new').click();$('#side-import').onclick=()=>$('#import').click();$('#side-shortcuts').onclick=()=>$('#shortcuts-dialog').showModal();
document.addEventListener('keydown',e=>{if(e.key==='F1'){e.preventDefault();if(!$('#shortcuts-dialog').open)$('#shortcuts-dialog').showModal();}});
$('#question-prev').onclick=()=>{const at=data.questions.indexOf(current);if(at>0&&grid?.finish()!==false)choose(data.questions[at-1]);};
$('#question-next').onclick=()=>{const at=data.questions.indexOf(current);if(at>=0&&at<data.questions.length-1&&grid?.finish()!==false)choose(data.questions[at+1]);};
$('#workflow').onchange=e=>{if(!current)return;const v=e.target.value;if(mutate(()=>{if(v==='draft')delete current.workflow;else current.workflow=v;}))status(`${questionTitle(current)} → ${TITLES[v]}`);};
$('#cards-filter').oninput=e=>{view.query=e.target.value;renderView();};$('#cards-type').onchange=e=>{view.type=e.target.value;renderView();};
$('#cards-grid').addEventListener('click',e=>{const open=e.target.closest('[data-open]');if(open){const q=data.questions.find(x=>x.id===open.dataset.open);if(q){choose(q);show('desk');}}});
$('#cards-grid').addEventListener('change',e=>{const box=e.target.closest('[data-exam]');if(box)mutate(()=>toggleExam(data,box.dataset.exam,box.checked));});
$('#exam-view').addEventListener('click',e=>{
  const add=e.target.closest('[data-exam-add]'),item=e.target.closest('[data-exam-item]');
  if(add){mutate(()=>toggleExam(data,add.dataset.examAdd,true));return;}
  if(!item)return;const id=item.dataset.examItem;
  if(e.target.closest('[data-exam-remove]'))mutate(()=>toggleExam(data,id,false));
  const move=e.target.closest('[data-exam-move]');if(move)mutate(()=>{if(!moveExam(data,id,move.dataset.examMove))throw Error('더 옮길 수 없습니다.');});
});
$('#exam-build').onclick=async()=>{
  const button=$('#exam-build');button.disabled=true;status('시험지 만드는 중…');
  try{const bytes=await buildExamBytes();download(bytes,`${data.examSet?.title||'5E_ExamPool-시험지'}.hwpx`,'application/vnd.hancom.hwpx');status('시험지 HWPX 내려받기 완료 · 저장한 문항 조판을 그대로 모았습니다.');}
  catch(e){status(e.message,true);}finally{renderView();}
};
await boot();
