import {newQuestion,block,makeTable,applyPreset,validate,tableCovered,duplicateQuestion,parentOptions} from '../sheet/model.js';
import {exportExcel,importExcel} from '../sheet/excel.js';
import {createSheetGrid} from '../sheet/grid.js';
import {groupMetrics,materialTree,updateMaterial,moveMaterial,insertMaterial} from './material-model.js';
import {splitLayout,paginateQuestions} from './workspace-layout.js';
import {encodeClipboard} from '../sheet/grid-model.js';
import {ROWS,fieldValue} from '../sheet/vertical.js';
import {WORKFLOWS,workflow,invalidate,writeRectangle,mergeWorkbook,createHistory,documentField,compoundField} from './workspace-model.js';

// This separate, persisted demo never writes the sheet's storage or native HWPX bytes.
const STORAGE='5e-card-workspace-concept-v2';
const icons={search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',folder:'<path d="M3 6h6l2 2h10v11H3z"/>',cards:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',list:'<path d="M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1"/>',back:'<path d="m13 5-7 7 7 7M6 12h15"/>',next:'<path d="m9 5 7 7-7 7"/>',check:'<path d="m5 12 4 4L19 6"/>',alert:'<path d="m12 3 10 18H2zM12 9v5M12 17v.2"/>',file:'<path d="M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h6"/>',up:'<path d="m6 15 6-6 6 6"/>',down:'<path d="m6 9 6 6 6-6"/>',grip:'<path d="M8 5h.1M16 5h.1M8 12h.1M16 12h.1M8 19h.1M16 19h.1"/>',text:'<path d="M3 5h18M3 10h18M3 15h14M3 20h10"/>',table:'<rect x="3" y="3" width="18" height="18"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',picture:'<rect x="3" y="3" width="18" height="18"/><circle cx="8" cy="8" r="2"/><path d="m3 18 6-6 4 4 3-3 5 5"/>'};
const icon=(name)=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.file}</svg>`;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=(s,root=document)=>root.querySelector(s);
let state={data:null,view:'library',qid:null,filter:'draft',type:'all',search:'',layout:'cards',selected:new Set(),order:[],contentTab:'text',metaTab:'info',detailTab:null,mobile:'paper',paper:'A4',columns:2,paperMode:'question',previewScale:'width',splitRatios:{question:.54,exam:.36},examTitle:'물리학Ⅰ 문항 모음'};
let persistTimer,toastTimer,materialId=null,materialQid=null;
const history=createHistory();
let activeDocPath=null,lastEditorQid=null,layoutObserver,examRevision=0;
const VIEW_STORAGE='5e-card-workspace-view-v1';
function saveView(){try{localStorage.setItem(VIEW_STORAGE,JSON.stringify({splitRatios:state.splitRatios}));}catch{}}
const snapshot=()=>({data:state.data,order:state.order,examTitle:state.examTitle});
function checkpoint(key){history.record(snapshot(),key);}
function updateHistoryButtons(){for(const [action,enabled] of [['undo',history.canUndo],['redo',history.canRedo]])document.querySelectorAll(`[data-action="${action}"]`).forEach(b=>b.disabled=!enabled);}
function replay(direction){const saved=history.replay(direction,snapshot());if(!saved){toast('더 이상 '+(direction==='undo'?'되돌릴':'다시 실행할')+' 내용이 없습니다.');return;}Object.assign(state,saved);if(!question())state.qid=state.data.questions[0]?.id;state.selected=new Set([...state.selected].filter(id=>state.data.questions.some(q=>q.id===id)));if(!question()&&state.view==='editor')state.view='library';persist();render();}


async function start(){
  try{const prefs=JSON.parse(localStorage.getItem(VIEW_STORAGE)||'null');for(const mode of ['question','exam']){const r=prefs?.splitRatios?.[mode];if(Number.isFinite(r)&&r>0&&r<1)state.splitRatios[mode]=r;}}catch{}

  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE)||'null');
    if(saved){validate(saved.data);state.data=saved.data;state.order=(saved.order||[]).filter(id=>saved.data.questions.some(q=>q.id===id));state.examTitle=String(saved.examTitle||state.examTitle);}
  }catch{localStorage.removeItem(STORAGE);}
  try{
    if(!state.data){const res=await fetch('../sheet/examples.json');if(!res.ok)throw Error('예제 문항을 불러오지 못했습니다.');state.data=seed(await res.json());state.order=state.data.questions.slice(0,3).map(q=>q.id);}
    if(!state.qid)state.qid=state.data.questions[0]?.id;
    render();
  }catch(e){$('#workspace').innerHTML=`<div class="empty-state"><h1>문항을 불러오지 못했습니다</h1><p>${esc(e.message)}</p><button class="button" data-action="reload">다시 불러오기</button></div>`;}
}
function seed(data){
  const titles=['충돌 실험과 운동량','에너지 전이의 대응 관계','시간에 따른 그래프'];
  data.questions.forEach((q,i)=>{q.cardTitle=titles[i];q.unitLarge=i<1?'역학과 에너지':i===1?'물질과 전자기장':'역학과 에너지';q.unitMiddle=i===1?'원자의 에너지':'물체의 운동';q.unitSmall=i===0?'운동량과 충격량':i===1?'에너지 준위':'운동의 표현';q.managementId=`PHY-${String(i+1).padStart(3,'0')}`;q.concepts=i===0?['운동량','충격량']:i===1?['에너지 준위']:['운동 그래프'];q.demo=true;});
  // Optional empty apparatus is omitted in this card example. Other diagrams are
  // explicitly illustrative geometry, not reconstructed official exam figures.
  data.questions[0].blocks=data.questions[0].blocks.filter(b=>b.kind!=='figure');
  data.questions[1].blocks.filter(b=>b.kind==='figure').forEach((b,i)=>b.figure=illustrativeFigure(i?'levels-b':'levels-a',b.label));
  data.questions[2].blocks.find(b=>b.kind==='figure').figure=illustrativeFigure('graph','운동 그래프');
  const force=newQuestion('4');Object.assign(force,{cardTitle:'질량과 가속도의 관계',unitLarge:'역학과 에너지',unitMiddle:'물체의 운동',unitSmall:'뉴턴 운동 법칙',managementId:'PHY-004',ask:'B의 가속도의 크기는?',answer:1,explanation:'같은 알짜힘이 작용할 때 가속도는 질량에 반비례한다. B의 질량은 A의 2배이므로 가속도는 1 m/s²이다.',source:'작업 흐름 시연을 위한 자체 작성 예제',concepts:['뉴턴 운동 법칙'],demo:true});force.blocks[0].text='수평면 위에 정지해 있는 물체 A, B에 같은 크기의 일정한 알짜힘을 각각 작용시켰다. A, B의 질량은 각각 1 kg, 2 kg이고, A의 가속도의 크기는 2 m/s²이다.';force.choices.forEach((c,i)=>c.text=['0.5 m/s²','1 m/s²','2 m/s²','4 m/s²','8 m/s²'][i]);
  const wave=newQuestion('5','객관식','글·수식');Object.assign(wave,{cardTitle:'파동의 속력과 파장',unitLarge:'파동과 정보 통신',unitMiddle:'파동의 성질',unitSmall:'파동의 진행',managementId:'PHY-005',ask:'파동 B의 파장은?',answer:2,explanation:'동일한 매질에서 파동의 속력은 같다. A의 속력은 4 m/s이므로 B의 파장은 4÷4=1 m이다.',source:'작업 흐름 시연을 위한 자체 작성 예제',concepts:['파동의 속력','파장'],demo:true});wave.blocks[0].text='표는 같은 매질에서 진행하는 두 파동 A, B의 진동수와 파장을 나타낸 것이다.';const wt=block('table',null,'파동의 측정값');wt.table=makeTable(3,3);[['파동','진동수 (Hz)','파장 (m)'],['A','2','2'],['B','4','㉠']].forEach((r,y)=>r.forEach((v,x)=>wt.table.cells[y][x].value=v));wave.blocks.push(wt);wave.choices.forEach((c,i)=>c.text=['0.25 m','0.5 m','1 m','2 m','4 m'][i]);
  const current=newQuestion('6','합답형','글·수식','조합');Object.assign(current,{cardTitle:'저항에 흐르는 전류',unitLarge:'물질과 전자기장',unitMiddle:'전기 에너지',unitSmall:'전류와 저항',managementId:'PHY-006',ask:'이에 대한 설명으로 옳은 것만을 〈보기〉에서 고른 것은?',answer:2,explanation:'전압이 일정할 때 전류는 저항에 반비례한다. 따라서 A에는 3 A, B에는 1.5 A가 흐르고, A의 전류가 B의 2배이다.',source:'작업 흐름 시연을 위한 자체 작성 예제',concepts:['옴의 법칙'],demo:true});current.blocks[0].text='전기 저항이 각각 2 Ω, 4 Ω인 저항 A, B의 양단에 각각 6 V의 일정한 전압을 걸어 주었다.';current.blocks.find(b=>b.kind==='bogi').lines.forEach((l,i)=>l.text=['A에 흐르는 전류의 세기는 3 A이다.','A에 흐르는 전류는 B의 2배이다.','B에 흐르는 전류의 세기는 3 A이다.'][i]);current.choices.forEach((c,i)=>c.text=['ㄱ','ㄷ','ㄱ, ㄴ','ㄴ, ㄷ','ㄱ, ㄴ, ㄷ'][i]);
  data.questions.push(force,wave,current);return validate(data);
}
function illustrativeFigure(kind,label){
  const canvas=document.createElement('canvas');canvas.width=520;canvas.height=310;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,520,310);ctx.strokeStyle='#222';ctx.fillStyle='#222';ctx.lineWidth=2.5;ctx.font='24px Georgia';
  const line=(x,y,ex,ey)=>{ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ex,ey);ctx.stroke();};
  const arrow=(x,y,ex,ey)=>{line(x,y,ex,ey);const a=Math.atan2(ey-y,ex-x);line(ex,ey,ex-12*Math.cos(a-.5),ey-12*Math.sin(a-.5));line(ex,ey,ex-12*Math.cos(a+.5),ey-12*Math.sin(a+.5));};
  if(kind==='graph'){arrow(70,265,480,265);arrow(70,265,70,30);ctx.fillText('t',478,293);ctx.fillText('v',38,37);ctx.fillText('O',39,291);line(75,235,415,65);ctx.setLineDash([7,6]);line(260,143,260,265);line(70,143,260,143);ctx.setLineDash([]);ctx.fillText('t₁',246,293);}
  else{[65,145,255].forEach((y,i)=>{line(90,y,450,y);ctx.fillText('n = '+(3-i),12,y+7);});if(kind==='levels-a'){arrow(180,70,180,246);arrow(330,150,330,246);ctx.fillText('a',190,168);ctx.fillText('b',342,207);}else{arrow(180,246,180,70);arrow(330,140,330,70);ctx.fillText('c',191,168);ctx.fillText('d',343,116);}}
  return {name:'시안용 자체 작성 도식 · '+label,data:canvas.toDataURL('image/png')};
}
function persist(){
  updateHistoryButtons();
  $('#save-state').textContent='저장 중…';clearTimeout(persistTimer);persistTimer=setTimeout(()=>{try{localStorage.setItem(STORAGE,JSON.stringify({data:state.data,order:state.order,examTitle:state.examTitle}));$('#save-state').textContent='이 브라우저에 저장됨';}catch{$('#save-state').textContent='저장 공간 부족 · 엑셀로 내려받으세요';}},250);
}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3300);}
function question(){return state.data.questions.find(q=>q.id===state.qid);}
function title(q){return q.cardTitle||q.managementId||`${q.number}번 문항`;}
function issues(q){
  const out=[];if(!q.ask.trim())out.push({title:'발문이 비어 있습니다',detail:'학생이 답해야 할 질문을 입력하세요.',tab:'text'});
  if(q.type==='서술형'?!q.modelAnswer.trim():q.answer===null)out.push({title:'정답을 지정해 주세요',detail:'출제 정보의 정답·해설에서 정답을 선택하세요.',tab:'answer'});
  const missing=q.blocks.filter(b=>b.kind==='figure'&&!b.figure);if(missing.length)out.push({title:`그림 ${missing.length}개가 비어 있습니다`,detail:missing.map(b=>b.label).join(', ')+' 자료를 연결하세요.',tab:'materials'});
  if(q.type!=='서술형'&&q.style!=='대응표'&&q.choices.some(c=>!c.text.trim()&&!c.figure))out.push({title:'선지에 빈 항목이 있습니다',detail:'빈 선지에 글이나 그림을 넣으세요.',tab:'choices'});
  if(!q.standardCode.trim())out.push({title:'성취기준이 연결되지 않았습니다',detail:'분류와 검토에 사용할 성취기준을 입력하세요.',tab:'info'});
  return out;
}
function sidebar(){
  return `<aside class="sidebar" aria-label="문항 분류"><p class="sidebar-heading">문항 관리</p>${Object.entries(WORKFLOWS).map(([key,label])=>`<button class="folder ${state.view!=='assembly'&&state.filter===key?'active':''}" data-action="folder" data-value="${key}">${icon(key==='review'?'alert':key==='complete'?'check':'folder')}<span>${label}</span><span>${state.data.questions.filter(q=>workflow(q)===key).length}</span></button>`).join('')}<div class="sidebar-separator"></div><button class="folder ${state.view==='assembly'?'active':''}" data-action="assembly">${icon('file')}<span>시험지 구성</span><span id="assembly-count">${state.order.length}</span></button><div class="sidebar-separator"></div><button class="folder" data-action="sheet">${icon('table')}<span>엑셀 시트</span></button><button class="folder" data-action="import">${icon('up')}<span>엑셀 올리기</span></button><button class="folder" data-action="shortcuts">${icon('list')}<span>기능·단축키</span></button><p class="sidebar-note">카드 ↔ 시트 ↔ 문항 편집<br>동일한 문항 데이터</p></aside>`;
}
function render(){
  if(state.view==='editor'&&state.qid!==lastEditorQid){activeDocPath=null;state.detailTab=null;lastEditorQid=state.qid;}
  if($('#materials-dialog').open&&materialQid!==state.qid)$('#materials-dialog').close();
  layoutObserver?.disconnect();
  const examScroll=$('#exam-canvas')?.scrollTop||0;
  document.body.dataset.workspaceView=state.view;
  document.body.classList.toggle('sheet-mode',['sheet','editor'].includes(state.view));
  $('#header-context').innerHTML=headerContext();
  // Keep the controller's original input and listeners when switching views.
  // Its visual home is the worksheet, not the surrounding 5E application shell.
  const formula=$('#sheet-formula');
  $('#workspace').before(formula);
  formula.hidden=!['sheet','editor'].includes(state.view);
  $('#workspace').innerHTML=`<div class="workspace-shell">${sidebar()}<div class="work-area">${state.view==='editor'?editor():state.view==='assembly'?assembly():state.view==='sheet'?sheet():library()}</div></div>`;
  $('#worksheet-formula-slot')?.append(formula);
  if($('#materials-dialog').open)renderMaterials();
  updateHistoryButtons();
  if(state.view==='editor'){setupLayout();measurePaper();syncFormatButtons();if($('#exam-canvas'))$('#exam-canvas').scrollTop=examScroll;}
  if(['sheet','editor'].includes(state.view)){sizeFocusRows();grid.refresh({questionId:state.qid});}
}
function filteredQuestions(){return state.data.questions.filter(q=>(state.filter==='all'||workflow(q)===state.filter)&&(state.type==='all'||q.type===state.type)&&(!state.search||[title(q),q.ask,q.managementId,q.unitLarge,q.unitSmall,...(q.concepts||[])].join(' ').toLowerCase().includes(state.search.toLowerCase())));}
function viewSwitch(){return `<div class="view-switch" aria-label="문항 보기 방식"><button data-action="layout" data-value="cards" class="${state.view==='library'&&state.layout==='cards'?'active':''}" title="카드 보기 · Alt+1">${icon('cards')}<span>카드</span></button><button data-action="sheet" class="${state.view==='sheet'?'active':''}" title="시트 보기 · Alt+2">${icon('table')}<span>시트</span></button></div>`;}
function library(){
  const questions=filteredQuestions();
  return `<section class="library-main"><div class="page-heading"><div><h1>${WORKFLOWS[state.filter]||'전체 문항'}</h1><p>문항을 확인하고, 카드를 열어 내용을 다듬으세요.</p></div><div class="page-heading-actions">${viewSwitch()}<button class="button small" data-action="check-all">${icon('check')} 점검</button><button class="button small mobile-new" data-action="new">+ 새 문항</button></div></div><div class="library-tools"><label class="search">${icon('search')}<input id="question-search" aria-label="문항 검색" placeholder="내용·단원·관리번호 검색" value="${esc(state.search)}"></label><select id="type-filter" class="filter-select" aria-label="문항 유형"><option value="all">모든 문항유형</option>${['객관식','합답형','서술형'].map(t=>`<option ${state.type===t?'selected':''}>${t}</option>`).join('')}</select><span class="results-label">${questions.length}개 문항</span><button class="button small quiet" data-action="reset-filters">전체 보기</button></div>${questions.length?`<div class="question-grid ${state.layout==='list'?'list':''}">${questions.map(q=>`<article class="question-card ${state.selected.has(q.id)?'selected':''}"><button class="card-open" data-action="open" data-id="${q.id}" aria-label="${esc(title(q))} 편집"><div class="card-preview">${documentHTML(q,false)}</div><div class="card-info"><h2 class="card-title">${esc(title(q))}</h2><div class="card-detail"><span>${esc(q.managementId||q.number+'번')}</span><span>·</span><span>${esc(q.type)}</span><span class="status" data-workflow="${workflow(q)}"><i class="status-dot"></i>${WORKFLOWS[workflow(q)]}</span></div></div></button><label class="card-checkbox"><input type="checkbox" data-select="${q.id}" aria-label="${esc(title(q))} 시험지에 선택" ${state.selected.has(q.id)?'checked':''}></label></article>`).join('')}</div>`:`<div class="empty-state"><h2>${state.search?'조건에 맞는 문항이 없습니다':(WORKFLOWS[state.filter]||'문항')+'이 없습니다'}</h2><p>문항 편집 화면의 상태를 바꾸면 이곳으로 이동합니다.</p><button class="button" data-action="reset-filters">전체 문항 보기</button></div>`}${state.selected.size?`<div class="selection-bar"><strong>${state.selected.size}개 선택</strong><button class="button quiet small" data-action="clear-selection">선택 해제</button><button class="button primary" data-action="add-selected">시험지에 담기 ${icon('next')}</button></div>`:''}</section>`;
}
function columnName(index){let s='';for(let n=index+1;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
// Both views render the same worksheet, with the same exported cell addresses.
function registry(qs,{focus=false}={}){
  const offset=focus?state.data.questions.indexOf(qs[0])+1:1;
  return `<table id="registry" data-orientation="vertical" data-grid-column-offset="${offset}" data-grid-row-offset="1" aria-label="${focus?'선택 문항 데이터 시트':'문항 데이터 시트'}"><colgroup><col class="row-number"><col class="field-name">${qs.map(()=>'<col class="question-col">').join('')}</colgroup><thead><tr><th></th><th>A</th>${qs.map((_,i)=>`<th>${columnName(i+offset)}</th>`).join('')}</tr><tr><th>1</th><th>항목</th>${qs.map(q=>`<th data-id="${q.id}"><button data-action="${focus?'sheet':'open'}" data-id="${q.id}" title="${focus?'전체 시트에서 이 문항 보기':'문항 열기'}">${esc(q.number)}번 문항</button><small data-workflow="${workflow(q)}">${WORKFLOWS[workflow(q)]}</small></th>`).join('')}</tr></thead><tbody>${ROWS.map((row,r)=>`<tr data-field-row="${row.key}"><th>${r+2}</th><th>${row.label}</th>${qs.map(q=>{
    const detail=compoundField(q,row.key);
    return `<td data-id="${q.id}" ${detail?'data-open="composition"':''}>${row.options?`<select data-field="${row.key}" aria-label="${esc(q.number+'번 '+row.label)}">${row.options.map(v=>`<option ${q[row.key]===v?'selected':''}>${esc(v)}</option>`).join('')}</select>`:`<textarea data-field="${row.key}" aria-label="${esc(q.number+'번 '+row.label)}" rows="${row.tall?3:1}" spellcheck="false">${esc(fieldValue(q,row.key))}</textarea>`}${detail?'<span class="compound-hint" aria-hidden="true">↗</span>':''}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table>`;
}
function sheet(){
  const qs=state.data.questions;
  return `<section class="sheet-workspace"><div class="office-titlebar excel-titlebar"><h2>5E_cell</h2><span class="office-title-detail">문항 데이터 · ${qs.length}문항</span><button data-action="library">카드로 보기</button></div><div class="sheet-toolbar">${viewSwitch()}<span class="toolbar-divider"></span><button class="button small" data-action="duplicate">복제</button><button class="button small" data-action="open-current">문항 편집</button><button class="button small" data-action="new">+ 문항 열</button><span class="sheet-hint">한 문항 = 한 열 · 엑셀 범위 붙여넣기</span><span>${qs.length}문항</span></div><div id="worksheet-formula-slot"></div><div class="sheet-scroll">${registry(qs)}</div><div class="worksheet-tabs"><span class="worksheet-tab active">문항</span><span class="worksheet-cell-state">항목은 행 · 문항은 열</span></div><div class="sheet-status"><span>방향키 이동 · F2 편집 · Tab 다음 셀 · Alt+Enter 줄바꿈 · ⌘/Ctrl+C/V 범위 복사·붙여넣기</span><button data-action="shortcuts">전체 단축키</button></div></section>`;
}
function focusSheet(q){
  const column=columnName(state.data.questions.indexOf(q)+1);
  return `<div class="data-column focus-sheet"><div class="office-titlebar excel-titlebar"><h2>5E_cell</h2><span class="office-title-detail">${column}열</span><div class="sheet-heading-actions"><button data-action="jump-field" data-value="ask">내용</button><button data-action="jump-field" data-value="standardCode">출제 정보</button><button data-action="content-tab" data-value="materials">사진·표</button><button data-action="cell-details" title="선택한 셀 상세 편집">셀 상세</button><button data-action="sheet" title="전체 문항을 엑셀 형태로 보기">전체 시트</button></div></div><div id="worksheet-formula-slot"></div><div class="sheet-scroll focus-sheet-scroll">${registry([q],{focus:true})}</div><section class="cell-details" id="cell-details" ${state.detailTab?'':'hidden'}><div class="detail-heading"><strong id="detail-title">${detailTitle()}</strong><button data-action="close-details" aria-label="셀 상세 닫기">닫기</button></div><div class="pane-content" id="content-fields">${state.detailTab?detailFields(q):''}</div></section><div class="worksheet-tabs"><span class="worksheet-tab active">문항</span><button data-action="sheet">전체 문항 보기</button><span class="worksheet-cell-state" id="cell-kind">시험지에 표시</span></div><div class="sheet-status"><span id="sheet-edit-hint">F2 편집 · Enter 확정 · Alt+Enter 줄바꿈</span><button data-action="shortcuts">단축키</button></div></div>`;
}
function detailTitle(){return ({text:'지문',materials:'자료·표·그림',choices:'보기·선지',info:'문항 이름·분류',answer:'정답·해설',references:'참고자료'})[state.detailTab]||'셀 상세';}
function detailFields(q){if(['info','answer','references'].includes(state.detailTab)){state.metaTab=state.detailTab;return metadataFields(q);}state.contentTab=state.detailTab;return contentFields(q);}
function openDetails(tab){
  const pane=$('#cell-details');if(!pane)return;
  if(tab==='materials'){
    if(grid.finish()===false)return;
    state.detailTab=null;pane.hidden=true;$('#content-fields').innerHTML='';
    materialQid=state.qid;renderMaterials();$('#materials-dialog').showModal();return;
  }
  state.detailTab=tab;pane.hidden=false;$('#detail-title').textContent=detailTitle();$('#content-fields').innerHTML=detailFields(question());
}
function rowFragments(key){return [...document.querySelectorAll('#question-paper [data-doc-path]')].filter(n=>documentField(question(),n.dataset.docPath)===key);}
function showCellLink(d){
  if(!d?.table)return;
  const key=ROWS[d.r]?.key,row=ROWS[d.r],q=state.data.questions.find(q=>q.id===d.table.tBodies[0].rows[d.r]?.querySelectorAll('td')[d.c]?.dataset.id);
  if(!q||!row)return;
  $('#cell-field').textContent=row.label;
  if(state.view!=='editor')return;
  const printed=['ask','materials','photos','passage','choices','bogi'].includes(key);
  $('#cell-kind').textContent=printed?'시험지에 표시':'출제 정보 · 인쇄 제외';
  $('#sheet-edit-hint').textContent=d.table.tBodies[0].rows[d.r]?.querySelectorAll('td')[d.c]?.dataset.open?'더블클릭 · F2로 표·그림 상세 편집':'F2 편집 · Enter 확정 · Alt+Enter 줄바꿈';
  document.querySelectorAll('.sheet-linked-fragment').forEach(n=>n.classList.remove('sheet-linked-fragment'));
  rowFragments(key).forEach(n=>n.classList.add('sheet-linked-fragment'));
  $('#linked-cell').textContent=$('#cell-address').textContent+' · '+row.label;
  if(d.user&&document.activeElement?.closest('#registry')&&printed){const target=rowFragments(key)[0];if(target)revealIn(target,$('#paper-canvas'));}
}
function revealIn(target,container){if(!target||!container||!container.getClientRects().length)return;const a=target.getBoundingClientRect(),b=container.getBoundingClientRect();if(a.top<b.top+68)container.scrollTop+=a.top-b.top-68;else if(a.bottom>b.bottom-8)container.scrollTop+=Math.min(a.top-b.top-68,a.bottom-b.bottom+8);}
function linkDocumentCell(path){
  const key=documentField(question(),path),row=ROWS.findIndex(r=>r.key===key);if(row<0)return;
  grid.selectCell({row,focus:false});
  revealIn($('#registry tbody').rows[row],$('.focus-sheet-scroll'));
}
function sizeFocusRows(){document.querySelectorAll('.focus-sheet-scroll textarea').forEach(n=>{n.style.height='0';const height=n.scrollHeight;n.style.height=Math.min(220,Math.max(33,height))+'px';n.style.overflowY=height>220?'auto':'hidden';});}
function syncRegistryValues(){
  document.querySelectorAll('#registry tbody td').forEach(td=>{
    const q=state.data.questions.find(q=>q.id===td.dataset.id),input=td.querySelector('[data-field]');if(!q||!input)return;
    input.value=fieldValue(q,input.dataset.field);const label=q.number+'번 '+ROWS.find(r=>r.key===input.dataset.field).label;input.setAttribute('aria-label',label);td.setAttribute('aria-label',label);
    if(compoundField(q,input.dataset.field)){td.dataset.open='composition';if(!$('.compound-hint',td))td.insertAdjacentHTML('beforeend','<span class="compound-hint" aria-hidden="true">↗</span>');}
    else{delete td.dataset.open;$('.compound-hint',td)?.remove();}
  });
  document.querySelectorAll('#registry thead th[data-id]').forEach(th=>{const q=state.data.questions.find(q=>q.id===th.dataset.id);if(q){$('button',th).textContent=q.number+'번 문항';$('small',th).textContent=WORKFLOWS[workflow(q)];$('small',th).dataset.workflow=workflow(q);}});
  sizeFocusRows();
}
function syncFocusCells(){
  syncRegistryValues();const d=grid.selected();if(d){const q=state.data.questions.find(q=>q.id===d.table.tBodies[0].rows[d.r]?.querySelectorAll('td')[d.c]?.dataset.id);if(q)$('#formula-value').value=fieldValue(q,ROWS[d.r].key);showCellLink(d);}
}
function refreshEditedQuestion(){
  // Keep the worksheet and toolbar nodes alive while committing a cell. Replacing
  // the page on pointerdown would swallow the button the user just clicked.
  syncRegistryValues();syncWorkflowControl();
  if(state.view==='editor'){$('#question-paper').innerHTML=documentHTML(question(),true);$('.editor-heading h1').textContent=title(question());measurePaper();showCellLink(grid.selected());}
}
const grid=createSheetGrid({formula:$('#formula-value'),nameBox:$('#cell-address'),onStatus:toast,onHistory:replay,
  onSelect:d=>{if(d?.user&&d.table){state.qid=d.table.tBodies[0].rows[d.r]?.querySelectorAll('td')[d.c]?.dataset.id||state.qid;}showCellLink(d);},
  onOpen:d=>{const key=ROWS[d.r]?.key;state.qid=d.table.tBodies[0].rows[d.r].querySelectorAll('td')[d.c].dataset.id;state.view='editor';state.mobile='content';render();openDetails(['choices','bogi'].includes(key)?'choices':key==='passage'?'text':'materials');},
  onDraft:(d,value)=>{if(state.view!=='editor')return;const paper=$('#question-paper');if(!paper)return;if(!d){paper.innerHTML=documentHTML(question(),true);measurePaper();showCellLink(grid.selected());return;}try{const next=writeRectangle(state.data,[state.qid],[{r:d.r,c:0,value}]);paper.innerHTML=documentHTML(next.questions.find(q=>q.id===state.qid),true);measurePaper();showCellLink(d);}catch{/* Invalid intermediate text is checked on commit. */}},
  onWrite:(d,writes,options)=>{try{const ids=[...d.table.tHead.rows[1].cells].filter(c=>c.dataset.id).map(c=>c.dataset.id),next=writeRectangle(state.data,ids,writes,options);checkpoint();state.data=next;persist();refreshEditedQuestion();return true;}catch(e){toast(e.message);return false;}}
});
function formatStyle(q,path){const f=q?.docFormats?.[path]||{};return `font-weight:${f.bold?'700':'400'};font-style:${f.italic?'italic':'normal'};text-decoration:${f.underline?'underline':'none'};text-align:${['left','center','right','justify'].includes(f.align)?f.align:'inherit'};${f.hanging?'padding-inline-start:1em;text-indent:-1em;':''}`;}
let renderingQuestion=null;
function fragment(value,path,editable){return `<span style="${formatStyle(renderingQuestion,path)}" ${editable?`class="editable-fragment" contenteditable="plaintext-only" role="textbox" aria-label="${esc(pathLabel(path))}" data-doc-path="${esc(path)}" spellcheck="false"`:''}>${esc(value)}</span>`;}
function pathLabel(path){if(path==='ask')return '발문';if(path.startsWith('choice:'))return `선지 ${Number(path.split(':')[1])+1}`;const [kind,id,r,c]=path.split(':'),b=question()?.blocks.find(b=>b.id===id);if(kind==='cell')return `${b?.label||'선지 표'} ${Number(r)+1}행 ${Number(c)+1}열`;if(kind==='line')return `${b?.label||'문항'} ${b?.lines.find(l=>l.id===r)?.label||''}`;return b?.label||'문항 내용';}
function tableHTML(t,id,editable,choice=false,align='center'){
  return `<table class="doc-table ${choice?'doc-choice-table':''}" data-table-align="${esc(align)}"><tbody>${t.cells.map((row,r)=>`<tr>${choice?`<td style="width:12%">${r?'①②③④⑤'[r-1]:''}</td>`:''}${row.map((c,x)=>{if(tableCovered(t,r,x))return '';const m=t.merges.find(m=>m.r===r&&m.c===x);const tag=r<t.headerRows?'th':'td';return `<${tag} ${m?`rowspan="${m.rs}" colspan="${m.cs}"`:''}>${c.figure?`<img src="${esc(c.figure.data)}" alt="${esc(c.figure.name)}" style="max-width:100%">`:fragment(c.value,`cell:${id}:${r}:${x}`,editable)}</${tag}>`;}).join('')}</tr>`).join('')}</tbody></table>`;
}
function renderBlock(q,b,editable){
  if(b.kind==='text')return b.text.trim()?`<p>${fragment(b.text,`block:${b.id}`,editable)}</p>`:'';
  if(b.kind==='figure')return b.figure?`<figure ${editable?'data-doc-field="photos" data-material-id="${b.id}" tabindex="0" role="button" title="사진 셀에서 그림 편집"':''} class="document-figure" style="width:${Math.max(15,Math.min(100,Number(b.widthPercent)||100))}%;margin-inline:auto"><img src="${esc(b.figure.data)}" alt="${esc(b.figure.name||b.label)}"><figcaption>${esc(b.label)}</figcaption></figure>`:`<div class="missing-figure">${esc(b.label)} · 그림을 연결하세요</div>`;
  if(b.kind==='table')return tableHTML(b.table,b.id,editable,false,b.tableAlign||q.tableAlign||'center')+(b.table.note?`<p class="table-note">${fragment(b.table.note,`note:${b.id}`,editable)}</p>`:'');
  if(b.kind==='group'){
    const children=q.blocks.filter(c=>c.parent===b.id),metrics=groupMetrics(q,b);
    return `<div class="${b.boxed?'material-box':'material-group'}">${b.boxed?`<p>${esc(b.label)}</p>`:''}<div class="material-children ${b.layout==='나란히'?'object-row':''}" style="gap:${metrics.gap}mm;${b.layout==='나란히'?`grid-template-columns:${metrics.columns}`:''}">${children.map(c=>`<div class="material-slot">${renderBlock(q,c,editable)}</div>`).join('')}</div></div>`;
  }
  if(['steps','bogi','dialogue'].includes(b.kind)){const lines=b.lines.map(l=>`<div class="doc-line"><span class="line-prefix">${esc(l.label)}${b.kind==='bogi'?'.':''}</span>${fragment(l.text,`line:${b.id}:${l.id}`,editable)}</div>`).join('');return b.kind==='bogi'?`<fieldset class="bogi"><legend>&lt;보 기&gt;</legend>${lines}</fieldset>`:`<div class="doc-steps">${b.kind==='steps'?`<p>${esc(b.label)}</p>`:''}${lines}</div>`;}
  return '';
}
function choicesHTML(q,editable){
  const nodes=q.choices.map((c,i)=>`<div class="doc-choice ${c.figure?'graph-choice':''}"><span>${'①②③④⑤'[i]}</span>${c.figure?`<img src="${esc(c.figure.data)}" alt="${esc(c.figure.name||'선지 그래프 '+(i+1))}">`:fragment(c.text,`choice:${i}`,editable)}</div>`);
  if(q.choices.some(c=>c.figure))return `<div class="doc-choices">${nodes.join('')}</div>`;
  const length=Math.max(...q.choices.map(c=>c.text.length)),total=q.choices.reduce((n,c)=>n+c.text.length,0);
  const layout=q.choiceLayout&&q.choiceLayout!=='auto'?q.choiceLayout:length>18?'vertical':length>8?'2+2+1':total<=14?'single':'3+2';
  const groups=layout==='vertical'?nodes.map(n=>[n]):layout==='2+2+1'?[nodes.slice(0,2),nodes.slice(2,4),nodes.slice(4)]:layout==='3+2'?[nodes.slice(0,3),nodes.slice(3)]:[nodes];
  return `<div class="choice-rows">${groups.map(g=>`<div class="doc-choices">${g.join('')}</div>`).join('')}</div>`;
}
function documentHTML(q,editable,number=q.number,{print=false}={}){
  const size=Math.max(12,Math.min(28,Number(q.docSize)||16)),spacing=Math.max(-1,Math.min(3,Number(q.docSpacing)||0)),leading=Math.max(1.2,Math.min(2.5,Number(q.docLeading)||1.6));
  renderingQuestion=q;
  const top=q.blocks.filter(b=>!b.parent);const opening=top.find(b=>b.kind==='text'&&b.text.trim());return `<div class="question-document" style="--doc-spacing:${spacing}px;--doc-leading:${leading};${editable||print?`font-size:${size}px`:''}"><div class="opening"><span class="opening-number">${esc(number)}.</span><div class="doc-body">${opening?renderBlock(q,opening,editable):fragment(q.ask,'ask',editable)}</div></div>${top.filter(b=>b!==opening).map(b=>renderBlock(q,b,editable)).join('')}${opening?`<p class="doc-ask">${fragment(q.ask,'ask',editable)}</p>`:''}${q.type==='서술형'?'<div style="height:50px;border-bottom:1px solid #ddd"></div>':q.style==='대응표'?tableHTML(q.choiceTable,'choices',editable,true):choicesHTML(q,editable)}</div>`;
}
function headerContext(){
  if(state.view!=='editor')return `<span class="workspace-name">${state.view==='sheet'?'문항 데이터':state.view==='assembly'?'시험지 구성':'문항 작업실'}</span>`;
  const q=question(),at=state.data.questions.indexOf(q);
  return `<div class="editor-heading"><button class="back-button" data-action="library" title="문항 카드로">${icon('back')}</button><h1>${esc(title(q))}</h1><div class="question-navigation"><button class="icon-button" data-action="previous" aria-label="이전 문항" ${!at?'disabled':''}>${icon('back')}</button><span class="question-position">${at+1}<span> / ${state.data.questions.length}</span></span><button class="icon-button" data-action="next" aria-label="다음 문항" ${at===state.data.questions.length-1?'disabled':''}>${icon('next')}</button></div><details class="question-menu"><summary><span class="workflow-label">${WORKFLOWS[workflow(q)]}</span> <span aria-hidden="true">⌄</span></summary><div class="command-menu"><label class="menu-label">문항 상태${workflowControl(q)}</label><button data-action="duplicate">문항 복제 <span>⌘⇧D</span></button><button data-action="add-current">시험지에 담기</button><button data-action="check">문항 점검</button></div></details><button class="icon-button header-check" data-action="check" aria-label="문항 점검" title="문항 점검">${icon('check')}</button></div>`;
}
function editor(){
  const q=question();return `<section class="editor"><div class="mobile-editor-tabs"><button data-action="mobile" data-value="content" class="${state.mobile==='content'?'active':''}">문항 시트</button><button data-action="mobile" data-value="paper" class="${state.mobile==='paper'?'active':''}">문항·시험지</button></div><div class="editor-grid show-${state.mobile}" data-paper-mode="${state.paperMode}">${focusSheet(q)}<div class="workspace-splitter" role="separator" tabindex="0" aria-label="시트와 한글 영역 너비 조절" aria-orientation="vertical" aria-valuemin="0" aria-valuemax="100" aria-valuenow="54" title="드래그 또는 ← →로 너비 조절 · 두 번 클릭하면 기본 너비"><span class="splitter-grip"></span></div><section class="typeset-pane" aria-labelledby="typeset-title">${typesetChrome(q)}<div class="single-document-tools" ${state.paperMode==='exam'?'hidden':''}>${compactFormatToolbar(q)}</div><div class="typeset-caption"><span id="linked-cell">같은 문항 · 같은 내용</span><span>A4 · 2단 / 본문 86 mm</span></div><div class="paper-canvas" id="paper-canvas" ${state.paperMode==='exam'?'hidden':''}>${paperRuler()}<div class="paper-preview-frame"><article class="question-paper" id="question-paper" aria-label="출력 모양 편집 시연">${documentHTML(q,true)}</article></div></div><div id="exam-canvas" class="exam-canvas" ${state.paperMode==='exam'?'':'hidden'}><div class="embedded-exam" id="embedded-exam"></div></div><div class="typeset-footnote"><span>${state.paperMode==='exam'?'A4 · 2단 · 배치 미리보기':'셀 ↔ 문항 · 양쪽 편집'}</span><span id="paper-measure">문항 높이 계산 중</span></div></section></div></section>`;
}
function typesetChrome(q){
  return `<div class="office-titlebar hwp-titlebar"><h2 id="typeset-title">5e_hwp</h2><div class="paper-mode-switch" role="group" aria-label="문항 보기 방식"><button data-action="paper-mode" data-value="question" aria-pressed="${state.paperMode==='question'}">한 문항</button><button data-action="paper-mode" data-value="exam" aria-pressed="${state.paperMode==='exam'}">시험지</button></div><span class="preview-kind" title="HTML 편집 시안입니다. 실제 HWPX 연결은 구현 전입니다.">시안</span><select id="preview-scale" aria-label="미리보기 배율"><option value="width" ${state.previewScale==='width'?'selected':''}>너비 맞춤</option><option value="page" ${state.previewScale==='page'?'selected':''}>전체 보기</option><option value="actual" ${state.previewScale==='actual'?'selected':''}>100%</option></select>${state.paperMode==='exam'?'<button class="subtle-button" data-action="assembly" title="시험지 문항과 순서 편집">구성 편집</button>':''}</div>`;
}
function compactFormatToolbar(q){
  return `<div class="format-toolbar compact-format-toolbar" aria-label="문항 편집 도구"><span class="font-name" title="현재 문항 글꼴">바탕</span><select id="doc-size" aria-label="조판 글자 크기">${[14,15,16,17,18].map(n=>`<option value="${n}" ${(q.docSize||16)===n?'selected':''}>${Number((n*.75).toFixed(1))} pt</option>`).join('')}</select><div class="format-group">${[['bold','굵게','<b>가</b>'],['italic','기울임','<i>가</i>'],['underline','밑줄','<u>가</u>']].map(([v,n,text])=>`<button data-action="format" data-value="${v}" aria-label="선택한 문단 ${n}" title="선택한 문단 ${n}">${text}</button>`).join('')}</div><details class="paragraph-tools"><summary title="문단·자간·표 설정" aria-label="문단 서식">${icon('text')}<span>문단</span></summary><div class="paragraph-popover"><label>자간<select id="doc-spacing" aria-label="조판 자간">${[-.5,0,.5,1].map(n=>`<option value="${n}" ${(q.docSpacing||0)===n?'selected':''}>${n}</option>`).join('')}</select></label><label>줄 간격<select id="doc-leading" aria-label="줄 간격">${[1.3,1.5,1.6,1.8,2].map(n=>`<option value="${n}" ${(q.docLeading||1.6)===n?'selected':''}>${Math.round(n*100)}%</option>`).join('')}</select></label><div class="format-group">${[['left','왼쪽'],['center','가운데'],['right','오른쪽'],['justify','양쪽']].map(([v,n])=>`<button data-action="align" data-value="${v}" title="선택한 문단 ${n} 정렬">${alignmentIcon(v)}</button>`).join('')}</div><button data-action="format" data-value="hanging" title="Shift+Tab">내어쓰기</button><button data-action="content-tab" data-value="materials">${icon('table')} 표·그림</button></div></details><span class="toolbar-hint">문단 선택 후 서식</span></div>`;
}
function paperRuler(){
  return `<div class="paper-ruler" aria-hidden="true"><div class="ruler-track">${Array.from({length:9},(_,i)=>`<span style="left:${i*10}mm">${i}</span>`).join('')}<i class="ruler-start"></i><i class="ruler-end"></i></div></div>`;
}
function workflowControl(q){return `<select class="workflow-select" id="question-workflow" aria-label="문항 작업 상태">${Object.entries(WORKFLOWS).map(([v,label])=>`<option value="${v}" ${workflow(q)===v?'selected':''}>${label}</option>`).join('')}</select>`;}
function alignmentIcon(value){
  const path={left:'M3 5h18M3 10h12M3 15h18M3 20h12',center:'M3 5h18M6 10h12M3 15h18M6 20h12',right:'M3 5h18M9 10h12M3 15h18M9 20h12',justify:'M3 5h18M3 10h18M3 15h18M3 20h18'}[value];
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
}
function inputField(label,path,value,{textarea=false,hint='',rows=3}={}){return `<label class="field ${textarea?'multiline':''}"><span>${label}</span>${textarea?`<textarea data-path="${esc(path)}" rows="${rows}">${esc(value)}</textarea>`:`<input data-path="${esc(path)}" value="${esc(value)}">`}${hint?`<small class="field-hint">${hint}</small>`:''}</label>`;}
function selectField(label,path,options,value){return `<label class="field"><span>${label}</span><select data-path="${esc(path)}">${options.map(v=>`<option value="${esc(Array.isArray(v)?v[0]:v)}" ${String(Array.isArray(v)?v[0]:v)===String(value)?'selected':''}>${esc(Array.isArray(v)?v[1]:v)}</option>`).join('')}</select></label>`;}
function lineFields(b){return `<div class="compact-lines">${b.lines.map(l=>`<label class="compact-line"><span>${esc(l.label)}${b.kind==='bogi'?'.':''}</span><textarea aria-label="${esc(b.label+' '+l.label)}" data-path="line:${b.id}:${l.id}">${esc(l.text)}</textarea></label>`).join('')}</div>`;}
function tableFields(t,id){return `<div class="table-editor"><table><tbody>${t.cells.map((row,r)=>`<tr>${row.map((c,x)=>{if(tableCovered(t,r,x))return '';const m=t.merges.find(m=>m.r===r&&m.c===x);return `<${r<t.headerRows?'th':'td'} ${m?`rowspan="${m.rs}" colspan="${m.cs}"`:''}><input aria-label="${r+1}행 ${x+1}열" data-path="cell:${id}:${r}:${x}" value="${esc(c.value)}"></${r<t.headerRows?'th':'td'}>`;}).join('')}</tr>`).join('')}</tbody></table></div>`;}
function contentFields(q){
  if(state.contentTab==='text')return `${q.blocks.filter(b=>b.kind==='text').map(b=>inputField(b.label,`block:${b.id}`,b.text,{textarea:true,rows:3})).join('')}${inputField('발문','ask',q.ask,{textarea:true,rows:2})}<div class="material-summary">${icon('table')}<div><strong>${esc(q.type)} · ${esc(q.preset)}</strong><p>${q.blocks.filter(b=>!['text','bogi','group'].includes(b.kind)).map(b=>esc(b.label)).join(' · ')||'별도 자료 없음'}</p></div><button class="button small" data-action="content-tab" data-value="materials">자료 편집</button></div>`;
  if(state.contentTab==='materials')return '<button class="button small" data-action="content-tab" data-value="materials">사진·표 관리 열기</button>';
  return `${selectField('선지 표현','style',['문장·수식','조합','대응표','그림·그래프'],q.style)}${selectField('선지 배치','choiceLayout',[['auto','내용에 맞춤'],['single','한 줄'],['3+2','3개 + 2개'],['2+2+1','2개 + 2개 + 1개'],['vertical','세로']],q.choiceLayout||'auto')}${q.blocks.filter(b=>b.kind==='bogi').map(b=>`<div class="section-label">보기 <span class="muted">가운데 제목 · 얇은 테두리 · 내어쓰기</span></div>${lineFields(b)}`).join('')}<div class="section-label">선지 <span class="muted">내용 길이에 맞춰 배치</span></div>${q.style==='대응표'?tableFields(q.choiceTable,'choices'):`<div class="compact-lines">${q.choices.map((c,i)=>`<label class="compact-line"><span>${'①②③④⑤'[i]}</span>${c.figure?`<div class="choice-figure-editor"><img src="${esc(c.figure.data)}" alt="선지 ${i+1} 그래프" style="max-width:160px;max-height:100px"><button class="button small" data-action="upload-figure" data-id="choice:${i}" aria-label="선지 ${i+1} 그림 교체">그림 교체</button></div>`:q.style==='그림·그래프'?`<button class="button small" data-action="upload-figure" data-id="choice:${i}" aria-label="선지 ${i+1} 그림 넣기">그림 넣기</button>`:`<textarea aria-label="선지 ${i+1}" data-path="choice:${i}">${esc(c.text)}</textarea>`}</label>`).join('')}</div>`}`;
}
function metadataFields(q){
  if(state.metaTab==='info')return `<div class="inline-fields">${inputField('관리번호','managementId',q.managementId)}${inputField('대단원','unitLarge',q.unitLarge)}</div><div class="inline-fields">${inputField('중단원','unitMiddle',q.unitMiddle)}${inputField('소단원','unitSmall',q.unitSmall)}</div>${inputField('성취기준','standardCode',q.standardCode,{hint:'예제에는 성취기준이 연결되어 있지 않습니다.'})}${inputField('핵심개념','concepts',(q.concepts||[]).join(', '),{hint:'쉼표로 구분해 여러 개를 입력할 수 있습니다.'})}${inputField('문항 이름','cardTitle',title(q))}`;
  if(state.metaTab==='answer'&&q.type==='서술형')return `${inputField('모범답안','modelAnswer',q.modelAnswer,{textarea:true,rows:3})}${inputField('배점','points',q.points)}${inputField('해설','explanation',q.explanation,{textarea:true,rows:3})}`;
  if(state.metaTab==='answer')return `<div class="inline-fields">${selectField('정답','answer',[['','미설정'],...[0,1,2,3,4].map(i=>[i,'①②③④⑤'[i]])],q.answer??'')}${inputField('배점','points',q.points)}</div>${inputField('해설','explanation',q.explanation,{textarea:true,rows:3})}${inputField('출제 의도','intent',q.intent,{textarea:true,rows:2})}`;
  return `${inputField('출처·근거 메모','source',q.source,{textarea:true,rows:2})}<div class="reference-row">${icon('file')}<div><strong>교과서·성취기준·참고자료</strong><p>자료를 펼쳐 보고 문항의 근거를 연결하는 자리입니다.</p></div></div><p class="info-note">시안에는 원문 자료를 연결하지 않았습니다. 기존 자료 열람 기능과 연결할 예정입니다.</p><a class="button small" style="margin-top:12px" href="../sheet/index.html?example=1" target="_blank" rel="noopener">기존 자료 열람 화면 열기 ${icon('next')}</a>`;
}
const materialKind=b=>({group:b.boxed?'자료 상자':b.layout==='나란히'?'가로 묶음':'세로 묶음',table:'표',figure:'사진',steps:'실험 과정',text:'설명',bogi:'보기',dialogue:'대화'})[b.kind]||b.kind;
function materialSelect(label,key,options,value,b){
  return `<label class="field"><span>${label}</span><select data-material="${key}" data-id="${b.id}">${options.map(([v,t])=>`<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
}
function renderMaterials(){
  const q=question(),tree=materialTree(q);if(!tree.some(({b})=>b.id===materialId))materialId=tree[0]?.b.id||null;
  const b=q.blocks.find(b=>b.id===materialId);
  $('#material-question').textContent=title(q);
  $('#material-tree').innerHTML=tree.map(({b,depth})=>`<button data-action="material-select" data-id="${b.id}" aria-pressed="${b.id===materialId}" style="padding-left:${12+depth*14}px"><span class="material-node-label">${esc(b.label||materialKind(b))}</span><small>${materialKind(b)}</small></button>`).join('')||'<p class="muted">사진·표를 추가하세요.</p>';
  $('#material-inspector').innerHTML=b?materialInspector(q,b):'<div class="materials-empty">사진과 표를 추가하거나, 자료 상자를 먼저 만드세요.<p>가로 묶음에 넣은 객체는 옆으로, 자료 상자 안에서는 지정한 순서로 배치됩니다.</p></div>';
  updateHistoryButtons();
}
function materialInspector(q,b){
  const siblings=q.blocks.filter(x=>x.parent===b.parent),at=siblings.indexOf(b),parent=q.blocks.find(x=>x.id===b.parent);
  const common=`<div class="material-inspector-heading"><strong>${materialKind(b)}</strong><div><button data-action="material-move" data-id="${b.id}" data-value="-1" ${at===0?'disabled':''}>위로</button><button data-action="material-move" data-id="${b.id}" data-value="1" ${at===siblings.length-1?'disabled':''}>아래로</button></div></div><label class="field"><span>이름</span><input data-material="label" data-id="${b.id}" maxlength="240" value="${esc(b.label)}"></label><div class="inline-fields">${materialSelect('넣을 위치','parent',[['','본문'],...parentOptions(q,b).map(p=>[p.id,p.label||materialKind(p)])],b.parent||'',b)}${parent?.layout==='나란히'?materialSelect('가로 폭 비율','slotWeight',[[1,'1'],[2,'2'],[3,'3'],[4,'4']],b.slotWeight||1,b):''}</div>`;
  if(b.kind==='group')return common+`<div class="inline-fields">${materialSelect('배치 방향','layout',[['세로','위아래'],['나란히','나란히']],b.layout,b)}${materialSelect('테두리','boxed',[['true','자료 상자'],['false','없음']],!!b.boxed,b)}${materialSelect('객체 사이 간격','gapMm',[[0,'0 mm'],[1,'1 mm'],[2,'2 mm'],[3,'3 mm'],[4,'4 mm'],[6,'6 mm']],b.gapMm??2,b)}</div><p class="info-note">이 묶음을 선택한 상태에서 사진·표를 추가하면 안에 들어갑니다. 기존 객체는 ‘넣을 위치’에서 옮기세요. 가로 묶음 안의 각 객체에 폭 비율을 지정할 수 있습니다.</p><div class="material-arrangement" style="${b.layout==='나란히'?`grid-template-columns:${groupMetrics(q,b).columns}`:''}">${q.blocks.filter(c=>c.parent===b.id).map(c=>`<button data-action="material-select" data-id="${c.id}">${esc(c.label||materialKind(c))}</button>`).join('')||'<span>아직 빈 묶음입니다.</span>'}</div>`;
  if(b.kind==='table')return common+`<div class="table-tools"><span>${b.table.rows}행 × ${b.table.cols}열</span><button data-action="table-row" data-id="${b.id}">행 추가</button><button data-action="table-col" data-id="${b.id}">열 추가</button><button data-action="table-unmerge" data-id="${b.id}">병합 풀기</button></div>${materialSelect('표 셀 정렬','tableAlign',[['center','가운데'],['left','왼쪽'],['right','오른쪽']],b.tableAlign||q.tableAlign||'center',b)}${tableFields(b.table,b.id)}${inputField('단위·각주',`note:${b.id}`,b.table.note,{textarea:true,rows:2})}`;
  if(b.kind==='figure')return common+`<div class="figure-editor">${b.figure?`<figure><img src="${esc(b.figure.data)}" alt="${esc(b.figure.name)}"></figure>`:'<p class="muted">PNG·JPEG·WebP 사진을 넣으세요.</p>'}${inputField('배치 칸 안에서 사진 폭 (%)',`figureWidth:${b.id}`,b.widthPercent||100)}<button class="button small" data-action="upload-figure" data-id="${b.id}">${b.figure?'사진 교체':'사진 넣기'}</button></div><p class="info-note">묶음 안의 독립된 사진 객체입니다. 현재 시안은 본문 흐름 배치이며 글자 어울림은 한글 연결 후 지원합니다.</p>`;
  return common+(b.lines?lineFields(b):inputField('내용',`block:${b.id}`,b.text,{textarea:true,rows:4}));
}
function commitMaterial(next,{refresh=true,key}={}){
  checkpoint(key);invalidate(next);state.data.questions[state.data.questions.findIndex(q=>q.id===next.id)]=next;
  persist();
  if(refresh)render();else{
    const label=$(`#material-tree button[data-id="${materialId}"] .material-node-label`);if(label)label.textContent=next.blocks.find(b=>b.id===materialId)?.label||'';
    $('#question-paper').innerHTML=documentHTML(next,true);syncFocusCells();measurePaper();syncWorkflowControl();
  }
}

function setPath(q,path,value){
  const [kind,id,a,c]=path.split(':');const b=q.blocks.find(b=>b.id===id);
  if(kind==='figureWidth'&&b)b.widthPercent=Math.max(15,Math.min(100,Number(value)||100));
  else if(kind==='block'&&b)b.text=value;
  else if(kind==='line'&&b)b.lines.find(l=>l.id===a).text=value;
  else if(kind==='note'&&b)b.table.note=value;
  else if(kind==='cell'){const t=id==='choices'?q.choiceTable:b?.table;if(t)t.cells[+a][+c].value=value;}
  else if(kind==='choice')q.choices[+id].text=value;
  else if(path==='answer')q.answer=value===''?null:Number(value);
  else if(path==='points')q.points=Math.min(10000,Math.max(0,Number(value)||0));
  else if(path==='concepts')q.concepts=value.split(',').map(v=>v.trim()).filter(Boolean).slice(0,100);
  else q[path]=value;
}
function reflect(path,value,fromPaper){
  const q=question();checkpoint(q.id+':'+path);setPath(q,path,value);invalidate(q);persist();updateHistoryButtons();syncWorkflowControl();
  if(fromPaper){document.querySelectorAll('[data-path]').forEach(el=>{if(el.dataset.path===path)el.value=value;});}
  else $('#question-paper').innerHTML=documentHTML(q,true);
  syncFocusCells();if(fromPaper)linkDocumentCell(path);
  measurePaper();
  if(path==='cardTitle')$('.editor-heading h1').textContent=title(q);
}
function splitWidth(){const g=$('.editor-grid');if(!g)return 0;const c=getComputedStyle(g);return g.clientWidth-parseFloat(c.paddingLeft)-parseFloat(c.paddingRight);}
function applySplit(){
  const g=$('.editor-grid'),handle=$('.workspace-splitter');if(!g||!handle)return;
  if(getComputedStyle(handle).display==='none'){g.style.gridTemplateColumns='';syncPreviewZoom();return;}
  const l=splitLayout(splitWidth(),state.splitRatios[state.paperMode]);
  g.style.gridTemplateColumns=`minmax(0,${l.left}px) ${l.gap}px minmax(0,${l.right}px)`;
  handle.setAttribute('aria-valuenow',String(Math.round(l.ratio*100)));
  handle.setAttribute('aria-valuetext',`시트 ${Math.round(l.ratio*100)}%, 한글 ${100-Math.round(l.ratio*100)}%`);
  syncPreviewZoom();
}
function setupLayout(){
  applySplit();layoutObserver=new ResizeObserver(()=>applySplit());layoutObserver.observe($('.editor-grid'));
}
function syncPreviewZoom(){
  if(state.view!=='editor')return;
  const exam=state.paperMode==='exam',canvas=$(exam?'#exam-canvas':'#paper-canvas'),page=$(exam?'#embedded-exam .exam-stack':'#question-paper');
  if(!canvas||!page||!canvas.clientWidth)return;
  let zoom=state.previewScale==='actual'?1:Math.min(1,(canvas.clientWidth-28)/Math.max(1,page.offsetWidth));
  if(state.previewScale==='page'){const height=exam?$('.exam-page',page)?.offsetHeight:page.offsetHeight;zoom=Math.min(zoom,(canvas.clientHeight-42)/Math.max(1,height||1));}
  zoom=Math.max(.1,zoom);const frame=page.parentElement;frame.style.width=`${page.offsetWidth*zoom}px`;frame.style.height=`${page.offsetHeight*zoom}px`;page.style.transform=`scale(${zoom})`;page.style.transformOrigin='top left';
  if(!exam&&$('.paper-ruler'))$('.paper-ruler').style.zoom=String(zoom);
}
let splitSession=null;
function finishSplit(cancel=false){
  if(!splitSession)return;const session=splitSession;splitSession=null;
  if(cancel)state.splitRatios[state.paperMode]=session.ratio;
  document.body.classList.remove('is-resizing');
  if(session.handle.hasPointerCapture(session.pointer))session.handle.releasePointerCapture(session.pointer);
  applySplit();if(!cancel)saveView();
}
document.addEventListener('pointerdown',e=>{
  document.querySelectorAll('.file-menu[open],.question-menu[open],.paragraph-tools[open]').forEach(menu=>{if(!menu.contains(e.target))menu.open=false;});
  const handle=e.target.closest('.workspace-splitter');if(!handle||e.button!==0)return;
  if(grid.finish()===false)return;e.preventDefault();handle.focus();
  splitSession={handle,pointer:e.pointerId,ratio:state.splitRatios[state.paperMode]};handle.setPointerCapture(e.pointerId);document.body.classList.add('is-resizing');
});
document.addEventListener('pointermove',e=>{
  if(!splitSession||e.pointerId!==splitSession.pointer)return;
  const g=$('.editor-grid'),c=getComputedStyle(g),left=g.getBoundingClientRect().left+parseFloat(c.paddingLeft);
  state.splitRatios[state.paperMode]=splitLayout(splitWidth(),(e.clientX-left-7)/Math.max(1,splitWidth()-14)).ratio;applySplit();
});
document.addEventListener('pointerup',()=>finishSplit());
document.addEventListener('pointercancel',()=>finishSplit(true));
window.addEventListener('blur',()=>finishSplit());
document.addEventListener('dblclick',e=>{if(e.target.closest('.workspace-splitter')){state.splitRatios[state.paperMode]=state.paperMode==='exam'?.36:.54;applySplit();saveView();}});
document.addEventListener('keydown',e=>{
  if(!e.target.matches('.workspace-splitter'))return;
  if(e.key==='Escape'){e.preventDefault();finishSplit(true);return;}
  if(!['ArrowLeft','ArrowRight','Home','End','Enter'].includes(e.key))return;e.preventDefault();
  const l=splitLayout(splitWidth(),state.splitRatios[state.paperMode]),step=e.shiftKey?.1:.02;
  state.splitRatios[state.paperMode]=e.key==='Home'?0:e.key==='End'?1:e.key==='Enter'?(state.paperMode==='exam'?.36:.54):l.ratio+(e.key==='ArrowRight'?step:-step);
  state.splitRatios[state.paperMode]=splitLayout(splitWidth(),state.splitRatios[state.paperMode]).ratio;applySplit();saveView();
});
async function renderExamPreview(){
  const host=$('#embedded-exam');if(!host||state.paperMode!=='exam')return;
  const revision=++examRevision,qs=state.order.map(id=>state.data.questions.find(q=>q.id===id)).filter(Boolean);
  if(!qs.length){host.innerHTML='<div class="exam-empty"><strong>시험지에 담은 문항이 없습니다</strong><p>현재 문항을 담거나 카드에서 문항을 선택하세요.</p><button class="button" data-action="add-current">현재 문항 담기</button></div>';$('#paper-measure').textContent='0문항';return;}
  const item=(q,i)=>`<section class="exam-flow-question ${state.qid===q.id?'current':''}" data-action="exam-question" data-id="${q.id}" role="button" tabindex="0" aria-label="${i+1}번 ${esc(title(q))} 선택" aria-pressed="${state.qid===q.id}" title="클릭하면 왼쪽 시트에 연결됩니다. 한 문항 보기에서 편집하세요.">${documentHTML(q,false,i+1,{print:true})}</section>`;
  const measure=document.createElement('div');measure.className='exam-measure-layer';measure.setAttribute('aria-hidden','true');measure.inert=true;measure.innerHTML=qs.map(item).join('');document.body.append(measure);
  try{
    await document.fonts.ready;
    await Promise.all([...measure.querySelectorAll('img')].map(img=>img.decode?.().catch(()=>{})||Promise.resolve()));
    if(revision!==examRevision||!host.isConnected||state.paperMode!=='exam')return;
    const heights=[...measure.children].map((n,i)=>({id:qs[i].id,height:Math.ceil(n.getBoundingClientRect().height)}));
    const pages=paginateQuestions(heights,{height:240*96/25.4,columns:2,gap:6*96/25.4});
    const pageHTML=(page,p)=>`<article class="exam-page ${page.oversized?'oversized':''}" aria-label="시험지 ${p+1}쪽"><header class="exam-print-header"><h2>${esc(state.examTitle)}</h2><div><span>이름 __________________</span><span>${qs.length}문항 · ${qs.reduce((n,q)=>n+q.points,0)}점</span></div></header><div class="exam-print-columns">${page.columns.map(col=>`<div class="exam-print-column">${col.map(id=>{const at=qs.findIndex(q=>q.id===id);return item(qs[at],at);}).join('')}</div>`).join('')}</div><footer class="exam-print-footer">${p+1} / ${pages.length}</footer></article>`;
    host.innerHTML=`${pages.some(p=>p.oversized)?'<p class="exam-overflow-note">한 단의 높이를 넘는 문항이 있습니다. 내용을 자르지 않고 길게 표시했습니다.</p>':''}<div class="exam-preview-frame"><div class="exam-stack">${pages.map(pageHTML).join('')}</div></div>`;
    $('#paper-measure').textContent=`${qs.length}문항 · ${pages.length}쪽 · 클릭해 문항 선택`;syncPreviewZoom();
  }finally{measure.remove();}
}
function measurePaper(){
  if(state.view!=='editor')return;
  if(state.paperMode==='exam'){renderExamPreview();return;}
  const measure=()=>{const el=$('#question-paper'),label=$('#paper-measure');if(!el||!label)return;const doc=$('.question-document',el);label.textContent=`높이 약 ${Math.round(doc.offsetHeight/325.039*86*10)/10} mm · 편집 시안`;syncPreviewZoom();};
  measure();requestAnimationFrame(measure);
}
function assembly(){
  const qs=state.order.map(id=>state.data.questions.find(q=>q.id===id)).filter(Boolean);const halfway=Math.ceil(qs.length/2);const columns=state.columns===1?[qs]:[qs.slice(0,halfway),qs.slice(halfway)];
  return `<section class="assembly"><aside class="assembly-sidebar"><div class="page-heading"><div><h1>시험지 구성</h1><p>순서를 바꾸면 문항 번호도 함께 바뀝니다.</p></div></div><label class="exam-name"><input id="exam-title" aria-label="시험지 제목" value="${esc(state.examTitle)}"></label><div class="exam-settings"><span>용지</span><select id="exam-paper" aria-label="시험지 용지"><option>A4</option></select><span>단</span><select id="exam-columns" aria-label="시험지 단 수"><option value="2" ${state.columns===2?'selected':''}>2단</option><option value="1" ${state.columns===1?'selected':''}>1단</option></select></div><ol class="assembly-order" aria-label="시험지 문항 순서">${qs.map((q,i)=>`<li class="assembly-item" draggable="true" data-drag-id="${q.id}">${icon('grip')}<span class="order">${i+1}</span><div class="item-content"><strong>${esc(title(q))}</strong><small>${esc(q.managementId||q.number+'번')} · ${q.points}점</small></div><div class="order-buttons"><button class="icon-button" data-action="move" data-id="${q.id}" data-value="-1" aria-label="${esc(title(q))} 위로" ${i===0?'disabled':''}>${icon('up')}</button><button class="icon-button" data-action="move" data-id="${q.id}" data-value="1" aria-label="${esc(title(q))} 아래로" ${i===qs.length-1?'disabled':''}>${icon('down')}</button></div><button class="remove-item" data-action="remove" data-id="${q.id}" aria-label="${esc(title(q))} 시험지에서 빼기">×</button></li>`).join('')||'<li class="assembly-empty">아직 담은 문항이 없습니다.<br>보관함에서 문항을 선택하세요.</li>'}</ol><div class="assembly-bottom"><p>${qs.length}개 문항 · ${qs.reduce((a,q)=>a+q.points,0)}점 <span class="muted">/ 배치 시연</span></p><button class="button" data-action="library">문항 더 담기 ${icon('next')}</button></div></aside><section class="exam-preview"><div class="exam-preview-toolbar"><span>A4 · ${state.columns}단 · 배치 미리보기</span><button class="button small" data-action="check-exam">${icon('check')} 구성 문항 점검</button></div><div class="exam-page"><h2 id="exam-heading">${esc(state.examTitle)}</h2><div class="exam-page-info"><span>이름: ______________</span><span>${qs.length}문항 / ${qs.reduce((a,q)=>a+q.points,0)}점</span></div><div class="exam-columns ${state.columns===1?'single':''}">${columns.map((col,ci)=>`<div class="exam-column">${col.map((q,i)=>`<section class="exam-question">${documentHTML(q,false,state.columns===1?i+1:ci*halfway+i+1)}</section>`).join('')}</div>`).join('')}</div><div class="exam-footer">배치 시안 · 실제 한글 시험지의 페이지 나눔은 연결 전입니다.</div></div></section></section>`;
}
function showValidation(questions){
  const all=questions.flatMap(q=>issues(q).map(i=>({...i,q})));const paper=$('#question-paper .question-document');const overflow=paper&&paper.scrollWidth>paper.clientWidth+1;
  $('#validation-body').innerHTML=`<div class="validation-summary">${questions.length}개 문항에서 <strong>${all.length}개 확인 항목</strong>이 있습니다.</div><ul class="validation-list">${all.map(i=>`<li>${icon('alert')}<div><strong>${questions.length>1?esc(title(i.q))+' · ':''}${esc(i.title)}</strong><p>${esc(i.detail)}</p></div><button class="button small" style="margin-left:auto" data-action="fix" data-id="${i.q.id}" data-value="${i.tab}">확인</button></li>`).join('')}${state.view==='editor'?`<li class="${overflow?'':'pass'}">${icon(overflow?'alert':'check')}<div><strong>${overflow?'본문 폭을 벗어난 내용이 있습니다':'현재 화면의 본문 폭 확인'}</strong><p>${overflow?'자료의 폭과 긴 수식을 확인하세요.':'현재 HTML 시안의 본문은 가로로 넘치지 않습니다.'}</p></div></li>`:''}</ul><p class="validation-disclaimer">빈 항목과 현재 화면의 넘침을 확인하는 기능입니다. 정답의 타당성, 물리 개념, 실제 한글 조판의 무결성을 검증한 결과는 아닙니다.</p>`;$('#validation-dialog').showModal();
}
const templates=[{name:'실험 + 표',preset:'실험',type:'합답형',style:'조합',note:'실험 과정 · 결과표 · 보기',icon:'table'},{name:'그림 비교',preset:'그림 비교',type:'객관식',style:'문장·수식',note:'(가) · (나) 그림 두 개',icon:'picture'},{name:'글 + 보기',preset:'글·수식',type:'합답형',style:'조합',note:'지문 · ㄱㄴㄷ · 조합 선지',icon:'text'},{name:'그림 + 표',preset:'그림·표',type:'객관식',style:'문장·수식',note:'그림과 측정값을 함께',icon:'table'},{name:'간단한 객관식',preset:'글·수식',type:'객관식',style:'문장·수식',note:'지문 · 발문 · 선지 5개',icon:'text'},{name:'서술형',preset:'글·수식',type:'서술형',style:'문장·수식',note:'지문 · 질문 · 답안',icon:'file'}];
function showTemplates(){$('#template-grid').innerHTML=templates.map((t,i)=>`<button class="template" data-action="create" data-value="${i}"><div class="template-visual">${icon(t.icon)}</div><strong>${t.name}</strong><span>${t.note}</span></button>`).join('');$('#template-dialog').showModal();}
function move(id,delta){const at=state.order.indexOf(id),next=at+delta;if(at<0||next<0||next>=state.order.length)return;checkpoint();[state.order[at],state.order[next]]=[state.order[next],state.order[at]];persist();render();}
async function downloadExcel(){
  if(grid.finish()===false)return;
  const btn=$('#excel-export');btn.disabled=true;btn.textContent='엑셀 준비 중…';try{const bytes=await exportExcel(window.XLSX,window.JSZip,state.data);const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download='5E-문항작업실.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('한 문항당 한 열로 엑셀 파일을 내려받았습니다.');}catch(e){toast('엑셀을 만들지 못했습니다: '+e.message);}finally{btn.disabled=false;btn.textContent='엑셀 내려받기';}
}

function syncWorkflowControl(){const el=$('#question-workflow');if(el)el.value=workflow(question());if($('.workflow-label'))$('.workflow-label').textContent=WORKFLOWS[workflow(question())];document.querySelectorAll('.sidebar [data-action=folder]').forEach(b=>b.lastElementChild.textContent=state.data.questions.filter(q=>workflow(q)===b.dataset.value).length);}
function syncFormatButtons(){const f=question()?.docFormats?.[activeDocPath]||{};document.querySelectorAll('[data-action="format"]').forEach(b=>{b.classList.toggle('active',!!f[b.dataset.value]);b.setAttribute('aria-pressed',String(!!f[b.dataset.value]));});}
function applyFormat(action,value){
  const q=question();if(!q||state.view!=='editor')return;
  if(!activeDocPath||!$(`[data-doc-path="${CSS.escape(activeDocPath)}"]`)){toast('먼저 미리보기에서 서식을 바꿀 문단을 클릭하세요.');return;}
  checkpoint();if(!q.docFormats||typeof q.docFormats!=='object'||Array.isArray(q.docFormats))q.docFormats={};if(!q.docFormats[activeDocPath]||typeof q.docFormats[activeDocPath]!=='object')q.docFormats[activeDocPath]={};const f=q.docFormats[activeDocPath];
  if(action==='align')f.align=value;else f[value]=!f[value];
  invalidate(q);persist();$('#question-paper').innerHTML=documentHTML(q,true);syncFormatButtons();syncWorkflowControl();updateHistoryButtons();measurePaper();showCellLink(grid.selected());
}
function duplicateCurrent(){
  if(grid.finish()===false)return;const old=question()||state.data.questions[0];if(!old)return;
  checkpoint();const q=duplicateQuestion(old);q.number=String(state.data.questions.length+1);q.managementId='';q.cardTitle=title(old)+' 복사';q.workflow='draft';
  // Preserve formatting while rebinding stable paths to the duplicate's IDs.
  const remap=new Map();old.blocks.forEach((b,i)=>{remap.set(b.id,q.blocks[i].id);b.lines?.forEach((l,j)=>remap.set(l.id,q.blocks[i].lines[j].id));});q.docFormats=Object.fromEntries(Object.entries(old.docFormats||{}).map(([path,f])=>[path.split(':').map(part=>remap.get(part)||part).join(':'),structuredClone(f)]));state.data.questions.push(q);state.qid=q.id;state.view='editor';state.filter='draft';persist();render();toast('문항을 복제했습니다.');
}
function editTable(action,id){
  const q=question(),b=q.blocks.find(b=>b.id===id),t=b?.table;if(!t)return;
  if(action==='table-row'&&t.rows>=30){toast('표는 30행까지 만들 수 있습니다.');return;}
  if(action==='table-col'&&t.cols>=12){toast('표는 12열까지 만들 수 있습니다.');return;}
  checkpoint();
  if(action==='table-row'){t.cells.push(Array.from({length:t.cols},()=>({value:''})));t.rows++;}
  if(action==='table-col'){t.cells.forEach(r=>r.push({value:''}));t.cols++;}
  if(action==='table-unmerge')t.merges=[];
  invalidate(q);persist();render();toast(action==='table-unmerge'?'병합을 풀었습니다. 되돌리기로 복원할 수 있습니다.':'기존 내용을 유지하고 '+(action==='table-row'?'행':'열')+'을 추가했습니다.');
}
async function uploadExcel(file){
  if(grid.finish()===false)return;
  const busy=$('#excel-file');busy.disabled=true;toast('엑셀의 문항·그림·표를 확인하고 있습니다…');
  try{
    if(file.size>40*1024*1024)throw Error('40 MB 이하의 XLSX 파일을 올리세요.');
    const incoming=await importExcel(window.XLSX,window.JSZip,await file.arrayBuffer());
    const merged=mergeWorkbook(state.data,incoming);checkpoint();state.data=merged.data;
    state.qid=incoming.questions[0]?.id||state.qid;state.view='sheet';persist();render();
    toast(`엑셀 반영: ${merged.updated}개 수정 · ${merged.added}개 추가${incoming.warnings?.length?' · 경고 '+incoming.warnings.length+'개 (기능 안내 확인)':''}`);
    if(incoming.warnings?.length){$('#shortcuts-body').innerHTML=`<p class="validation-disclaimer">읽은 문항을 반영했습니다. 아래 항목을 확인하세요. 가져오기는 되돌리기로 복원할 수 있습니다.</p><ul>${incoming.warnings.map(w=>`<li>${esc(typeof w==='string'?w:JSON.stringify(w))}</li>`).join('')}</ul>`;$('#shortcuts-dialog').showModal();}
  }catch(e){toast('엑셀을 반영하지 못했습니다: '+e.message);}
  finally{busy.disabled=false;}
}
function showShortcuts(){
  const groups=[
    ['문항·파일',[['카드 / 시트 / 문항 편집','Alt+1 / 2 / 3','사용 가능'],['새 문항·모양 선택','+ 새 문항 버튼','사용 가능'],['문항 복제','⌘/Ctrl+Shift+D','사용 가능'],['저장','⌘/Ctrl+S','브라우저 저장'],['되돌리기 / 다시 실행','⌘/Ctrl+Z / Shift+Z (또는 Ctrl+Y)','셀 변경·조판 서식·가져오기'],['문항 찾기','⌘/Ctrl+F','카드 화면 검색'],['엑셀 가져오기 / 내보내기','파일 메뉴','XLSX · 문항 ID 기준 병합']]],
    ['작업 공간',[['좌우 너비 조절','가운데 경계 드래그','문항 본문 폭 86mm 유지'],['키보드 너비 조절','경계 선택 후 ← / → · Shift로 크게','Enter·두 번 클릭: 기본 비율'],['조절 취소','드래그 중 Esc','시작 비율로 복원'],['한 문항 / 시험지','오른쪽 제목줄','문항 편집 / A4 2단 배치 미리보기'],['화면 배율','너비 맞춤 / 전체 보기 / 100%','문항 서식은 바뀌지 않음']]],
    ['시트 편집',[['셀 이동 / 범위 선택','방향키 / Shift+방향키','사용 가능'],['다음 / 이전 셀','Tab / Shift+Tab','사용 가능'],['다음 / 이전 행','Enter / Shift+Enter','사용 가능'],['셀 편집 / 취소','F2·더블클릭 / Esc','사용 가능'],['셀 안 줄바꿈','Alt+Enter','사용 가능'],['범위 복사·잘라내기·붙여넣기','⌘/Ctrl+C / X / V','엑셀의 탭·줄바꿈 유지'],['셀 내용 지우기','Delete 또는 Backspace','복합 자료는 별도 편집'],['행 처음 / 끝, 전체 선택','Home / End, ⌘/Ctrl+A','시트 안에서 동작'],['목록 열기','Alt+↓ 또는 목록 클릭','문항유형·자료 구성·선지 표현']]],
    ['문항 조판',[['본문·보기·선지·표 셀 수정','해당 내용을 클릭','대응 셀 선택·내용 즉시 반영'],['굵게 / 기울임 / 밑줄','⌘/Ctrl+B / I / U','선택한 문단 전체에 적용'],['내어쓰기','Shift+Tab','선택한 문단에 적용'],['글자 크기 / 자간 / 줄 간격','조판 도구 모음','문항 전체에 적용'],['왼쪽·가운데·오른쪽·양쪽 정렬','조판 도구 모음','선택한 문단에 적용'],['표 셀 정렬 / 행·열 추가 / 병합 풀기','자료 셀 → 상세 편집','가운데 기본 · 기존 값 보존'],['그림 넣기·교체 / 폭 조정','자료 셀 → 상세 편집','PNG·JPEG·WebP · 본문 흐름'],['보기·문항번호·선지의 줄 정렬','문항 모양에 기본 적용','번호와 본문을 분리해 줄바꿈 유지']]],
    ['실제 한글 연결이 필요한 기능',[['부분 글자 서식·서식 복사·글꼴·장평','한글 엔진 연결 후','이 시안에는 미연결'],['수식(LaTeX·한글 문법)·위/아래첨자','수식 객체와 원문을 함께 저장','이 시안에는 미연결'],['표 범위 병합·셀 분할·테두리·안쪽 여백','한글 표 도구 연결','이 시안에는 미연결'],['그림 어울림·글자처럼 취급·자르기·정렬','한글 개체 속성 연결','이 시안에는 미연결'],['찾아바꾸기·특수문자·탭 위치·문단 모양','한글 편집 메뉴 연결','이 시안에는 미연결'],['쪽·단 나누기·묶음 유지·머리/꼬리말','완성 시험지 구성 단계','현재 배열은 개념 미리보기'],['HWPX 생성·재열기·출력 비교 검수','단일 문항 데이터와 한글 객체 매핑','이 시안에는 미연결']]]
  ];
  $('#shortcuts-body').innerHTML=`<p class="help-intro">⌘는 Mac, Ctrl은 Windows 기준입니다. 시트 이동과 문항 조판의 단축키는 편집 위치에 따라 구분됩니다.</p>${groups.map(([name,rows])=>`<h3>${name}</h3><table class="shortcut-table"><thead><tr><th>기능</th><th>조작</th><th>지원 범위</th></tr></thead><tbody>${rows.map(row=>`<tr>${row.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('')}<p class="validation-disclaimer">오른쪽 조판은 HTML 편집 시안입니다. ‘기존 한글 도구’는 별도 예제로 실제 한글 엔진을 열며 현재 문항 내용은 전달하지 않습니다. 엑셀 파일에 없는 기존 문항은 유지합니다. 같은 문항 ID의 값은 가져온 파일로 갱신하며, 되돌리기로 가져오기 전체를 복원할 수 있습니다. 일반 엑셀은 이 작업실에서 내려받은 열 구조에 맞춰 작성해 주세요.</p>`;
  $('#shortcuts-dialog').showModal();
}

document.addEventListener('click',e=>{
  const figure=e.target.closest('[data-doc-field]');if(figure){grid.selectCell({row:ROWS.findIndex(r=>r.key===figure.dataset.docField),focus:false});materialId=figure.dataset.materialId||null;openDetails('materials');return;}
  const nav=e.target.closest('[data-view]');if(nav){state.view=nav.dataset.view;render();return;}
  const el=e.target.closest('[data-action]');if(!el)return;const {action,id,value}=el.dataset;
  el.closest('.command-menu')?.parentElement.removeAttribute('open');
  if(action==='paper-mode'){if(grid.finish()===false)return;state.paperMode=value;render();return;}
  if(action==='exam-question'){if(grid.finish()===false)return;state.qid=id;render();return;}
  if(action==='undo'||action==='redo'){replay(action);return;}
  if(action==='sheet'){if(grid.finish()===false)return;state.view='sheet';render();return;}
  if(action==='shortcuts'){showShortcuts();return;}
  if(action==='close-materials'){$('#materials-dialog').close();return;}
  if(action==='material-select'){materialId=id;renderMaterials();return;}
  if(action==='material-add'){
    try{const result=insertMaterial(question(),value,materialId);materialId=result.id;commitMaterial(result.question);}catch(error){toast(error.message);}return;
  }
  if(action==='material-move'){commitMaterial(moveMaterial(question(),id,Number(value)));return;}
  if(action==='close-help'){$('#shortcuts-dialog').close();return;}
  if(action==='import'){$('#excel-file').click();return;}
  if(action==='open-current'){if(state.qid){state.view='editor';render();}return;}
  if(action==='close-details'){state.detailTab=null;$('#cell-details').hidden=true;return;}
  if(action==='cell-details'){const key=ROWS[grid.selected()?.r]?.key;openDetails(['choices','bogi','style'].includes(key)?'choices':['materials','photos','preset'].includes(key)?'materials':key==='source'?'references':['answer','explanation','intent','points'].includes(key)?'answer':['ask','passage'].includes(key)?'text':'info');return;}
  if(action==='jump-field'){const row=ROWS.findIndex(r=>r.key===value);grid.selectCell({row,focus:true});return;}
  if(action==='duplicate'){duplicateCurrent();return;}
  if(action==='format'||action==='align'){applyFormat(action,value);return;}
  if(action.startsWith('table-')){editTable(action,id);return;}
  if(action==='reload')location.reload();
  else if(action==='open'){state.qid=id;state.view='editor';state.contentTab='text';state.metaTab='info';state.mobile='paper';render();}
  else if(action==='library'||action==='assembly'){state.view=action;render();}
  else if(action==='folder'){state.filter=value;state.search='';state.view='library';render();}
  else if(action==='layout'){state.view='library';state.layout=value;render();}
  else if(action==='reset-filters'){state.search='';state.type='all';state.filter='all';render();}
  else if(action==='clear-selection'){state.selected.clear();render();}
  else if(action==='add-selected'){checkpoint();const n=state.selected.size;for(const qid of state.selected)if(!state.order.includes(qid))state.order.push(qid);state.selected.clear();persist();state.view='assembly';render();toast(n+'개 문항을 시험지에 담았습니다.');}
  else if(action==='add-current'){checkpoint();if(!state.order.includes(state.qid)){state.order.push(state.qid);persist();$('#assembly-count').textContent=state.order.length;if(state.paperMode==='exam')renderExamPreview();toast('시험지에 담았습니다. 위쪽 시험지 구성에서 순서를 정하세요.');}else toast('이미 시험지에 담긴 문항입니다.');}
  else if(action==='content-tab'){openDetails(value);}
  else if(action==='meta-tab'){openDetails(value);}
  else if(action==='mobile'){state.mobile=value;render();}
  else if(action==='previous'||action==='next'){const qs=state.data.questions,at=qs.findIndex(q=>q.id===state.qid);state.qid=qs[at+(action==='next'?1:-1)]?.id||state.qid;render();}
  else if(action==='check')showValidation([question()]);
  else if(action==='check-all')showValidation(state.data.questions);
  else if(action==='check-exam')showValidation(state.data.questions.filter(q=>state.order.includes(q.id)));
  else if(action==='fix'){$('#validation-dialog').close();state.qid=id;state.view='editor';state.mobile='content';render();const field={text:'ask',choices:'choices',materials:'materials',info:'standardCode',answer:'answer'}[value]||'ask';grid.selectCell({row:ROWS.findIndex(r=>r.key===field),focus:true});if(value==='materials')openDetails('materials');}
  else if(action==='move')move(id,+value);
  else if(action==='remove'){checkpoint();state.order=state.order.filter(qid=>qid!==id);persist();render();}
  else if(action==='new')showTemplates();
  else if(action==='create'){checkpoint();const t=templates[+value],q=newQuestion(String(state.data.questions.length+1),t.type,t.preset,t.style);q.cardTitle='새 '+t.name+' 문항';q.managementId='PHY-'+String(state.data.questions.length+1).padStart(3,'0');q.demo=true;if(t.style==='조합')q.choices.forEach((c,i)=>c.text=['ㄱ','ㄴ','ㄱ, ㄴ','ㄴ, ㄷ','ㄱ, ㄴ, ㄷ'][i]);state.data.questions.push(q);state.qid=q.id;state.contentTab='text';state.metaTab='info';state.view='editor';state.mobile='content';$('#template-dialog').close();persist();render();}
  else if(action==='fit'){const page=$('#question-paper'),canvas=$('#paper-canvas'),ruler=$('.paper-ruler');const fitted=page.dataset.fit==='true';page.dataset.fit=String(!fitted);if(!fitted){const scale=Math.max(.1,Math.min(1,(canvas.clientHeight-55)/page.offsetHeight));page.style.zoom=scale;if(ruler)ruler.style.zoom=scale;el.textContent='너비 맞춤';}else{page.style.zoom='';if(ruler)ruler.style.zoom='';el.textContent='전체 보기';}}
  else if(action==='template-help')toast('지문 → 자료 → 보기 → 발문 → 선지 순서입니다. 자료·사진 셀을 더블클릭하면 상세 편집이 열립니다.');
  else if(action==='upload-figure'){const file=$('#figure-file');file.dataset.bid=id;file.click();}
});
document.addEventListener('input',e=>{
  const el=e.target;if(el.id==='question-search'){const start=el.selectionStart;state.search=el.value;render();const input=$('#question-search');input.focus();input.setSelectionRange(start,start);}
  else if(el.dataset.docPath)reflect(el.dataset.docPath,el.innerText.replace(/\r/g,''),true);
  else if(el.dataset.path&&el.tagName!=='SELECT')reflect(el.dataset.path,el.value,false);
  else if(el.id==='exam-title'){checkpoint('examTitle');state.examTitle=el.value;$('#exam-heading').textContent=el.value;persist();}
});
document.addEventListener('change',async e=>{
  const el=e.target;if(el.id==='excel-file'&&el.files[0]){await uploadExcel(el.files[0]);el.value='';return;}
  if(el.id==='question-workflow'){checkpoint();question().workflow=el.value;persist();render();toast(WORKFLOWS[el.value]+'으로 이동했습니다.');return;}
  if(el.dataset.select){el.checked?state.selected.add(el.dataset.select):state.selected.delete(el.dataset.select);render();}
  else if(el.id==='type-filter'){state.type=el.value;render();}
  else if(el.id==='exam-columns'){state.columns=+el.value;render();}
  else if(el.id==='preview-scale'){state.previewScale=el.value;syncPreviewZoom();}
  else if(el.dataset.material){
    try{commitMaterial(updateMaterial(question(),el.dataset.id,el.dataset.material,el.value),{refresh:el.dataset.material!=='label',key:question().id+':material:'+el.dataset.id+':'+el.dataset.material});}catch(error){toast(error.message);renderMaterials();}
  }
  else if(el.dataset.path){const q=question();if(el.dataset.path==='preset'){checkpoint();if(q.preset!==el.value)applyPreset(q,el.value);state.contentTab='materials';invalidate(q);persist();render();toast('자료 모양을 추가했습니다. 기존 내용은 보존했습니다.');}else if(['style','choiceLayout'].includes(el.dataset.path)){reflect(el.dataset.path,el.value,false);render();}else if(el.dataset.path==='type'){reflect('type',el.value,false);if(el.value==='합답형'&&!q.blocks.some(b=>b.kind==='bogi')){q.blocks.push(block('bogi'));persist();render();}}else reflect(el.dataset.path,el.value,false);}
  else if(['doc-size','doc-spacing','doc-leading'].includes(el.id)){checkpoint();const q=question();q[{'doc-size':'docSize','doc-spacing':'docSpacing','doc-leading':'docLeading'}[el.id]]=Number(el.value);invalidate(q);$('#question-paper').innerHTML=documentHTML(q,true);persist();measurePaper();syncWorkflowControl();updateHistoryButtons();}
  else if(el.id==='figure-file'&&el.files[0]){const file=el.files[0];if(file.size>4*1024*1024){toast('그림은 4 MB 이하로 넣으세요.');return;}if(!['image/png','image/jpeg','image/webp'].includes(file.type)){toast('PNG·JPEG·WebP 그림을 선택하세요.');return;}const bid=el.dataset.bid,q=question();const reader=new FileReader();reader.onload=()=>{const b=bid.startsWith('choice:')?q.choices[Number(bid.split(':')[1])]:q.blocks.find(b=>b.id===bid);if(b){checkpoint();invalidate(q);b.figure={name:file.name,data:reader.result};persist();render();toast('그림을 추가했습니다.');}};reader.onerror=()=>toast('그림을 읽지 못했습니다. 다시 선택하세요.');reader.readAsDataURL(file);}
});
let dragId=null;
document.addEventListener('dragstart',e=>{const item=e.target.closest('[data-drag-id]');if(!item)return;dragId=item.dataset.dragId;e.dataTransfer.setData('text/plain',dragId);e.dataTransfer.effectAllowed='move';item.classList.add('dragging');});
document.addEventListener('dragover',e=>{if(e.target.closest('[data-drag-id]')){e.preventDefault();e.dataTransfer.dropEffect='move';}});
document.addEventListener('drop',e=>{const target=e.target.closest('[data-drag-id]');if(!target||!dragId)return;e.preventDefault();const from=state.order.indexOf(dragId),to=state.order.indexOf(target.dataset.dragId);if(from>=0&&to>=0){checkpoint();state.order.splice(from,1);state.order.splice(to,0,dragId);persist();render();}dragId=null;});
document.addEventListener('dragend',()=>{dragId=null;document.querySelectorAll('.dragging').forEach(el=>el.classList.remove('dragging'));});
document.addEventListener('cut',e=>{
  if(!['sheet','editor'].includes(state.view)||!grid.manages(e.target)||e.target.closest('.grid-editing'))return;
  const d=grid.selected();if(!d)return;
  const ids=[...d.table.tHead.rows[1].cells].filter(c=>c.dataset.id).map(c=>c.dataset.id),[r,c,er,ec]=d.range,rows=[],writes=[];
  for(let y=r;y<=er;y++){const row=[];for(let x=c;x<=ec;x++){row.push(fieldValue(state.data.questions.find(q=>q.id===ids[x]),ROWS[y].key));writes.push({r:y,c:x,value:''});}rows.push(row);}
  try{const next=writeRectangle(state.data,ids,writes,{clear:true});e.preventDefault();e.clipboardData.setData('text/plain',encodeClipboard(rows));checkpoint();state.data=next;persist();render();toast('선택한 셀 내용을 잘라냈습니다. 자료·사진과 유형은 유지합니다.');}catch(error){e.preventDefault();toast(error.message);}
});
document.addEventListener('paste',e=>{if(!e.target.closest('[data-doc-path]'))return;e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));});
document.addEventListener('focusin',e=>{if(e.target.dataset.docPath){activeDocPath=e.target.dataset.docPath;syncFormatButtons();linkDocumentCell(activeDocPath);}});
document.addEventListener('keydown',e=>{
  if($('#materials-dialog').open&&!e.defaultPrevented&&!e.isComposing&&(e.metaKey||e.ctrlKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();replay(e.key.toLowerCase()==='y'||e.shiftKey?'redo':'undo');return;}
  if(e.defaultPrevented||e.isComposing||e.keyCode===229||document.querySelector('dialog[open]'))return;
  if(e.key==='Escape'){const menu=document.querySelector('.file-menu[open],.question-menu[open],.paragraph-tools[open]');if(menu){menu.open=false;menu.querySelector('summary').focus();e.preventDefault();return;}}
  if(e.target.matches('[data-doc-field],[data-action=exam-question]')&&['Enter',' '].includes(e.key)){e.preventDefault();e.target.click();return;}
  const mod=e.metaKey||e.ctrlKey,key=e.key.toLowerCase(),inText=e.target.matches('input,textarea,select,[contenteditable]');
  if(mod&&key==='s'){e.preventDefault();grid.finish();persist();toast('문항을 저장했습니다.');return;}
  if(mod&&['z','y'].includes(key)&&(!inText||e.target.closest('[data-doc-path]'))){e.preventDefault();replay(key==='y'||e.shiftKey?'redo':'undo');return;}
  if(mod&&e.shiftKey&&key==='d'){e.preventDefault();duplicateCurrent();return;}
  if(mod&&key==='f'&&state.view==='library'){e.preventDefault();$('#question-search')?.focus();return;}
  if(e.altKey&&!mod&&['1','2','3'].includes(key)){e.preventDefault();if(grid.finish()===false)return;state.view=key==='1'?'library':key==='2'?'sheet':'editor';if(state.view==='editor'&&!question())state.view='library';render();return;}
  if(e.target.closest('[data-doc-path]')&&((mod&&['b','i','u'].includes(key))||(e.shiftKey&&key==='tab'))){e.preventDefault();applyFormat('format',key==='tab'?'hanging':{b:'bold',i:'italic',u:'underline'}[key]);return;}
  if(e.key==='Escape'&&state.view==='editor'&&!inText){state.view='library';render();}
  if(e.key==='F1'){e.preventDefault();showShortcuts();}
});
$('#excel-export').addEventListener('click',()=>{document.querySelectorAll('.file-menu[open]').forEach(n=>n.open=false);downloadExcel();});$('#new-question').addEventListener('click',showTemplates);$('#close-validation').addEventListener('click',()=>$('#validation-dialog').close());$('#close-template').addEventListener('click',()=>$('#template-dialog').close());
$('#materials-dialog').addEventListener('close',()=>{materialQid=null;$('#material-tree').innerHTML='';$('#material-inspector').innerHTML='';$('.sheet-heading-actions [data-value=materials]')?.focus();});
window.addEventListener('pagehide',()=>{if(state.data)try{localStorage.setItem(STORAGE,JSON.stringify({data:state.data,order:state.order,examTitle:state.examTitle}));}catch{}});
start();
