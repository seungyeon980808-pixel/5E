// ExamPool 화면: 왼쪽 메뉴(문항 보관함·시험지), 문항 보관함, 시험지 목록, 시험지 안(문항 순서·쪽 배치·보내기).
import {examStats,examChecks,ANSWER_MARK} from './exam-review.js';
import {WORKFLOWS} from './model.js';
import {EXAM_STATUS,libraryQuestions,examById} from './exams.js';
import {examPlan} from './exam-layout.js';
import {questionTitle,questionSubtitle,workflowOf,previewHtml} from './views.js';
import {loadStandards} from './standards-data.js';
import {store,ICON as CARD_ICON} from './card-shared.js';
import {stepsMarkup,renderStep1,frameOf} from './exam-flow.js';
import {renderStep3} from './exam-place.js';

const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ICON={
  more:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/></svg>',
  plus:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  star:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>',
  box:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M4 9h16M10 13h4"/></svg>',
  doc:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z"/><path d="M9.5 11h5M9.5 14.5h5"/></svg>',
  done:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  grip:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="1"/><circle cx="15" cy="7" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="17" r="1"/><circle cx="15" cy="17" r="1"/></svg>',
  up:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>',
  down:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  out:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h12M13 7l5 5-5 5"/></svg>',
  table:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 10h16M4 15h16M10 4v16"/></svg>',
  card:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
};
const dot=q=>`<i class="dot st-${workflowOf(q)}"></i>`;
const stage=q=>`${dot(q)}${WORKFLOWS[workflowOf(q)]}`;
const when=iso=>{const d=new Date(iso);return Number.isFinite(d.getTime())?`${d.getMonth()+1}월 ${d.getDate()}일`:'';};

// 왼쪽 메뉴: 새 문항 · 문항 보관함 · 시험지(출제 중 / 출제 완료).
export function renderNav(root,data,view){
  const drafting=data.exams.filter(e=>e.status==='drafting'),done=data.exams.filter(e=>e.status==='done');
  const cur=(name,id)=>view.name===name||(id&&view.examId===id&&['exam','card','desk'].includes(view.name))?'true':'false';
  const examItem=e=>`<button type="button" class="nav sub" data-nav="exam" data-exam="${e.id}" aria-current="${view.examId===e.id&&view.name!=='library'?'true':'false'}" title="${E(e.title)}"><span>${E(e.title)}</span><b>${e.items.length}</b></button>`;
  root.innerHTML=`<button type="button" id="side-new" class="side-new">${ICON.plus}새 문항</button>
    <button type="button" class="nav" data-nav="library" aria-current="${(view.name==='library'&&view.lib?.mark!=='star')||view.name==='card'&&!view.examId?'true':'false'}">${ICON.box}<span>문항 보관함</span><b>${libraryQuestions(data).length}</b></button>
    <p class="side-label">모아 보기</p>
    <button type="button" class="nav" data-nav="stars" aria-current="${view.name==='library'&&view.lib?.mark==='star'?'true':'false'}" title="별표한 기출·내 문항 — 문항 보관함 「★ 별표만」과 같음">${ICON.star}<span>별표한 문항</span><b>${Object.keys(store.get('stars',{})).length}</b></button>
    <p class="side-label">시험지<button type="button" class="side-add" data-nav="new-exam" title="새 시험지" aria-label="새 시험지">${ICON.plus}</button></p>
    <button type="button" class="nav" data-nav="exams" data-status="drafting" aria-current="${cur('exams')==='true'&&view.status!=='done'?'true':'false'}">${ICON.doc}<span>출제 중</span><b>${drafting.length}</b></button>
    ${drafting.map(examItem).join('')}
    <button type="button" class="nav" data-nav="exams" data-status="done" aria-current="${view.name==='exams'&&view.status==='done'?'true':'false'}">${ICON.done}<span>출제 완료</span><b>${done.length}</b></button>
    ${done.slice(0,5).map(examItem).join('')}
    <p class="side-foot">문항 하나는 카드로 쓰고,<br>시험지에서 모아 5E_hwp로 보냅니다</p>`;
}

// 빈 문항(발문·지문·자료·보기·선지에 글도 그림도 없음)은 큰 흰 미리보기 대신 낮은 점선 자리로 보인다.
const filled=v=>typeof v==='string'?!!v.trim():!!v;
const tableFilled=t=>!!t&&/"(?:text|value)":"\s*[^"\s]/.test(JSON.stringify(t));
export function isBlank(q){
  if(filled(q.ask)||filled(q.passage))return false;
  for(const b of q.blocks||[])if(filled(b.text)||b.figure||(b.lines||[]).some(l=>filled(l.text))||(b.kind==='table'&&tableFilled(b.table)))return false;
  return !(q.choices||[]).some(c=>filled(c.text)||c.figure);
}
// 성취기준 글(카드에 한 줄로): 교육과정 자료를 한 번만 읽어 둔다. 다 읽으면 보관함 카드의 그 줄만 다시 채운다.
let stdText=null;const stdWait=loadStandards().then(d=>{stdText=new Map((d?.standards||[]).map(s=>[s.code,s.text]));}).catch(()=>{stdText=new Map();});
const stdLine=q=>q.standardCode?`<code>${E(q.standardCode)}</code>${E(stdText?.get(q.standardCode)||'')}`:'<i>성취기준 없음</i>';
// 문항 보관함: 시험지에 넣지 않은 문항 카드.
export function renderLibrary(root,data,view){
  const filter=view.stage||'all',query=String(view.query||'').toLowerCase();
  // 별표·메모(10-23 지적 1·2): 기출과 같은 저장소(이 기기에만), 키 'q:<id>'.
  const stars=store.get('stars',{}),memos=store.get('memos',{}),mark=view.mark||'';
  const all=libraryQuestions(data),list=all.filter(q=>(!mark||(mark==='star'?stars['q:'+q.id]:memos['q:'+q.id]))&&(filter==='all'||workflowOf(q)===filter)&&(!query||[q.number,q.ask,q.unitLarge,q.unitMiddle,q.managementId,...(q.concepts||[])].join(' ').toLowerCase().includes(query)));
  const seg=[['all','전체'],...Object.entries(WORKFLOWS)].map(([k,v])=>`<button type="button" data-lib-stage="${k}" aria-pressed="${filter===k}">${v}</button>`).join('');
  const exams=data.exams.filter(e=>e.status==='drafting');
  root.innerHTML=`<div class="pv-head"><div><h1>문항 보관함</h1><p>시험지에 넣지 않은 문항 ${all.length}개 · 카드를 열어 쓰거나 시험지로 보냅니다</p></div><div class="pv-tools"><div class="seg">${seg}</div><div class="seg" role="group" aria-label="모아 보기">${[['','모두'],['star','★ 별표만'],['memo','메모 있음']].map(([k,v])=>`<button type="button" data-lib-mark="${k}" aria-pressed="${mark===k}">${v}</button>`).join('')}</div><input id="lib-query" value="${E(view.query||'')}" placeholder="내용·단원 찾기" aria-label="보관함 검색"></div></div>
    <div class="pv-grid">${list.length?list.map(q=>`<article class="pv-card" data-card="${q.id}"><button type="button" class="lp-star pv-star" data-pool-star="q:${q.id}" aria-pressed="${!!stars['q:'+q.id]}" aria-label="${stars['q:'+q.id]?'별표 빼기':'별표'}" title="별표 — 「★ 별표만」으로 모아 보기">${CARD_ICON.star}</button>
      ${isBlank(q)?`<button type="button" class="pv-thumb is-blank" data-open-card="${q.id}" aria-label="${E(questionTitle(q))} 열기"><span><b>빈 문항</b>눌러서 쓰기</span></button>`:`<button type="button" class="pv-thumb" data-open-card="${q.id}" aria-label="${E(questionTitle(q))} 열기"><div class="pv-doc" data-preview="${q.id}"></div></button>`}
      <div class="pv-meta" title="${E(questionSubtitle(q))}"><p class="pv-plan"><span class="pv-k">기준</span><span class="pv-v">${stdLine(q)}</span></p><p class="pv-plan"><span class="pv-k">의도</span><span class="pv-v">${q.intent?E(q.intent):'<i>출제의도 없음</i>'}</span></p>
        <div class="pv-row pv-actions"><span class="pv-st">${stage(q)}<span>· ${E(q.type)}</span></span>${exams.length?`<select data-to-exam="${q.id}" aria-label="시험지에 넣기"><option value="">시험지에 넣기…</option>${exams.map(e=>`<option value="${e.id}">${E(e.title)}</option>`).join('')}<option value="__new">+ 새 시험지</option></select>`:`<button type="button" class="mini" data-to-exam-new="${q.id}">새 시험지에 넣기</button>`}<button type="button" class="mini danger" data-delete="${q.id}" title="문항 삭제">삭제</button></div></div>
    </article>`).join(''):`<p class="pv-empty">${view.loadError?E(view.loadError):all.length?'조건에 맞는 문항이 없습니다.':'보관함이 비어 있습니다. 「새 문항」으로 시험지에 넣지 않은 문항을 만들어 둘 수 있습니다.'}</p>`}</div>`;
  fillPreviews(root,data);
  if(!stdText)stdWait.then(()=>{if(!root.isConnected)return;root.querySelectorAll('.pv-card').forEach(c=>{const q=data.questions.find(x=>x.id===c.dataset.card),v=c.querySelector('.pv-plan .pv-v');if(q?.standardCode&&v)v.innerHTML=stdLine(q);});});
}

// 시험지 목록: 출제 중 / 출제 완료.
export function renderExams(root,data,view){
  const row=e=>{const qs=e.items.map(id=>data.questions.find(q=>q.id===id)).filter(Boolean),n=k=>qs.filter(q=>workflowOf(q)===k).length,total=qs.length||1;
    return `<article class="pv-exam" data-exam-row="${e.id}"><div><b>${E(e.title)}</b><span>${qs.length}문항 · 배점 ${qs.reduce((a,q)=>a+(Number(q.points)||0),0)} · ${e.status==='done'&&e.sentAt?`5E_hwp로 보낸 날 ${when(e.sentAt)}`:`고친 날 ${when(e.updatedAt)}`}</span></div>
      <div class="bar3" title="완성 ${n('complete')} · 검토 중 ${n('review')} · 초안 ${n('draft')}"><i style="width:${n('complete')/total*100}%;background:var(--st-complete)"></i><i style="width:${n('review')/total*100}%;background:var(--st-review)"></i><i style="width:${n('draft')/total*100}%;background:var(--st-draft)"></i></div>
      ${e.status==='done'?'<span class="badge done">출제 완료</span>':'<span class="badge">출제 중</span>'}<button type="button" class="btn" data-nav="exam" data-exam="${e.id}">열기</button></article>`;};
  const drafting=data.exams.filter(e=>e.status==='drafting'),done=data.exams.filter(e=>e.status==='done');
  root.innerHTML=`<div class="pv-head"><div><h1>시험지</h1><p>시험지 한 부를 문항 하나하나로 나눠 만듭니다. 출제 완료한 시험지도 열어서 고칠 수 있습니다.</p></div><div class="pv-tools"><button type="button" class="btn go" data-nav="new-exam">${ICON.plus}새 시험지</button></div></div>
    <h2 class="pv-sub">출제 중</h2>${drafting.map(row).join('')||'<p class="pv-empty">출제 중인 시험지가 없습니다.</p>'}
    <h2 class="pv-sub">출제 완료</h2>${done.map(row).join('')||'<p class="pv-empty">아직 출제 완료한 시험지가 없습니다.</p>'}`;
}

// 시험지 안: 문항 순서(= 시험지 구성), 한눈에 보기, 쪽 배치, 5E_hwp로 보내기.
export function renderExam(root,data,examId,{forms=[],step=3,step2=null,place=null}={}){
  const exam=examById(data,examId);if(!exam){root.innerHTML='<p class="pv-empty">시험지를 찾지 못했습니다.</p>';return;}
  const {items,pages,missing}=examPlan(data,exam),qs=items.map(x=>x.q),count=k=>qs.filter(q=>workflowOf(q)===k).length;
  const lib=libraryQuestions(data);
  root.innerHTML=`<div class="pv-head"><div class="pv-title"><input id="exam-title" value="${E(exam.title)}" maxlength="200" aria-label="시험지 이름">${exam.status==='done'?'<span class="badge done">출제 완료</span>':'<span class="badge">출제 중</span>'}</div>
      <div class="pv-tools"><button type="button" class="ef-pill" data-ef-step="1" title="틀 · 시험지 속성 바꾸기">틀 · ${E(frameOf(exam,forms).name)}</button><div class="pv-more"><button type="button" class="btn pv-more-btn" data-exam-more aria-haspopup="menu" aria-expanded="false" aria-label="시험지 메뉴" title="시험지 메뉴">${ICON.more}</button>
        <div class="top-menu" role="menu" hidden><button type="button" role="menuitem" data-exam-act="cards">문항 카드로 보기</button><button type="button" role="menuitem" data-exam-act="sheet" title="여러 문항을 표 한 장에서 한꺼번에 고칩니다">표로 한꺼번에 고치기</button><button type="button" role="menuitem" data-exam-act="download">HWPX로 내려받기</button><button type="button" role="menuitem" data-exam-act="variant" title="문항 순서를 섞은 나형 시험지(HWPX, 번호 다시 매김)와 가·나형 정답 대응표">나형(순서 섞기) 내려받기</button><button type="button" role="menuitem" data-exam-act="print" title="한글 엔진이 그린 쪽 그대로 인쇄 창을 엽니다. PDF는 인쇄 창의 「PDF로 저장」">인쇄·PDF</button><button type="button" role="menuitem" data-exam-act="blueprint" title="이원목적분류표와 정답표를 엑셀 한 파일(두 시트)로">이원목적분류표·정답표(엑셀)</button><button type="button" role="menuitem" data-exam-act="status">${exam.status==='done'?'출제 중으로 되돌리기':'출제 완료로 옮기기'}</button></div></div>
      <button type="button" class="btn go" data-exam-act="send">${ICON.out}5E_hwp로 보내기</button></div></div>
    <div class="ef-stepbar">${stepsMarkup(step)}</div>
    ${step===1?renderStep1(exam,data,forms):step===2&&step2?step2(exam):''}
    ${step===3?renderStep3(exam,data,forms,items,place||{lv:'list',zoom:'page',noGoal:false}):''}`;
  if(step===3)fillPreviews(root,data);
}

async function fillPreviews(root,data){
  // 시험지 화면 카드(.ep-doc)는 한글 엔진 그림으로 앱이 채운다(10-24 지적 10).
  for(const n of root.querySelectorAll('[data-preview]:not(.ep-doc)')){const q=data.questions.find(x=>x.id===n.dataset.preview);if(!q)continue;n.innerHTML=await previewHtml(q);}
}
