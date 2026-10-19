// 문항 관리 화면: 왼쪽 분류, 카드 보기, 시험지 구성. 모두 같은 문항 데이터를 보는 화면이다.
import {WORKFLOWS} from './model.js';
import {buildQuestionHtml} from './handoff.js';
import {examPlan} from './exam-layout.js';
import {loadImage} from './image-load.js';
import {pageProfile} from './typeset-model.js';

const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const workflowOf=q=>q.workflow||'draft';
export const TITLES={draft:'초안',review:'검토 중',complete:'완성'};
const NEXT={draft:'review',review:'complete',complete:'draft'};
const ICON={up:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>',down:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',remove:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',add:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'};

export function questionTitle(q){return q.managementId||`${q.number||'번호 미입력'}번 문항`;}
export function questionSubtitle(q){return q.unitSmall||q.unitMiddle||q.ask||'발문을 입력하세요';}

export function renderSide(root,data,view){
  const counts={draft:0,review:0,complete:0};for(const q of data.questions)counts[workflowOf(q)]++;
  for(const [k,v] of Object.entries(counts))root.querySelector(`[data-count="${k}"]`).textContent=v;
  root.querySelector('[data-count="exam"]').textContent=data.examSet?.items.length||0;
  root.querySelectorAll('.side-item[data-view]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.view===view.name&&(view.name!=='cards'||b.dataset.status===view.status))));
}

// 카드 미리보기: 학생용 문항 모양(HTML). 같은 내용이면 다시 만들지 않는다.
async function previewFigure(f){
  const image=await loadImage(f.data);let data=f.data;
  if(!data.startsWith('data:image/png;')){const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;c.getContext('2d').drawImage(image,0,0);data=c.toDataURL('image/png');}
  return {...f,data,width:image.naturalWidth,height:image.naturalHeight};
}
const previews=new Map();
// 발문이 비어 있으면 조판 HTML 만들기가 「발문을 입력한 뒤…」로 멈춘다. 그때는 틀(skeleton)로 한 번 더 만들어
// 이미 쓴 지문·그림은 보이고 빈 자리만 흐린 안내로 둔다(예전에는 미리보기 전체가 안내 한 줄로 바뀌었다).
async function safeQuestionHtml(q,width){
  try{return (await buildQuestionHtml(q,previewFigure,width)).html;}catch{}
  try{return (await buildQuestionHtml(q,previewFigure,width,{skeleton:true})).html;}catch{}
  return `<p>${E(q.ask||'발문을 입력하면 미리보기가 보입니다.')}</p>`;
}
export async function previewHtml(q){return preview(q);}
// 실제 시험지 단 폭(A4 2단, 여백 15mm, 단 간격 8mm → 86mm)으로 만든 문항 HTML. 화면에서는 확대·축소만 한다.
const columns=new Map();
export async function columnPreview(q){
  const width=pageProfile({paper:'A4',columns:2}).width,{typeset,references,workflow,reviews,authoring,...content}=q,key=JSON.stringify(content);
  const hit=columns.get(q.id);if(hit?.key===key)return {html:hit.html,width};
  const html=await safeQuestionHtml(q,width);
  columns.set(q.id,{key,html});return {html,width};
}
async function preview(q){
  const {typeset,references,workflow,reviews,authoring,...content}=q,key=JSON.stringify(content);
  const hit=previews.get(q.id);if(hit?.key===key)return hit.html;
  const html=await safeQuestionHtml(q);
  previews.set(q.id,{key,html});return html;
}

export function filteredQuestions(data,{status,query,type}){
  const text=String(query||'').toLowerCase();
  return data.questions.filter(q=>workflowOf(q)===status&&(!type||q.type===type)&&(!text||[q.number,q.ask,q.managementId,q.unitLarge,q.unitMiddle,q.unitSmall,...(q.concepts||[])].join(' ').toLowerCase().includes(text)));
}

export function renderCards(root,data,view,currentId){
  const list=filteredQuestions(data,view),grid=root.querySelector('#cards-grid'),inExam=new Set(data.examSet?.items||[]);
  root.querySelector('#cards-title').textContent=TITLES[view.status];
  root.querySelector('#cards-count').textContent=`${list.length}개 문항`;
  if(!list.length){grid.innerHTML=`<p class="cards-empty">${view.status==='draft'?'새 문항을 만들거나 엑셀을 올리세요.':view.status==='review'?'검토할 문항이 없습니다. 카드의 단계 표시를 누르거나 위쪽 상태를 「검토 필요」로 바꾸면 여기에 모입니다.':'완성한 문항이 없습니다.'}</p>`;return;}
  grid.innerHTML=list.map(q=>`<article class="q-card" data-card="${q.id}" aria-current="${q.id===currentId}">
    <button type="button" class="q-card-open" data-open="${q.id}" aria-label="${E(questionTitle(q))} 열기"><div class="q-card-paper"><div class="q-card-doc" data-preview="${q.id}"></div></div></button>
    <div class="q-card-meta"><div><strong>${E(questionSubtitle(q))}</strong><span>${E(questionTitle(q))} · ${E(q.type)}</span></div>
    <label class="q-card-exam" title="시험지에 넣기"><input type="checkbox" data-exam="${q.id}" ${inExam.has(q.id)?'checked':''}><span>시험지</span></label></div>
    <div class="q-card-foot"><button type="button" class="q-status" data-status="${workflowOf(q)}" data-advance="${q.id}" title="눌러서 다음 단계로: ${WORKFLOWS[NEXT[workflowOf(q)]]}">${WORKFLOWS[workflowOf(q)]}</button>${q.typeset?.verified?'<span class="q-ready">조판 저장됨</span>':'<span class="q-pending">조판 전</span>'}<button type="button" class="q-card-delete" data-delete="${q.id}" title="문항 삭제" aria-label="${E(questionTitle(q))} 삭제"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10.5 11v5M13.5 11v5"/></svg></button></div>
  </article>`).join('');
  // 미리보기는 실제 단 폭(540px) 그대로 그리고 카드 폭에 맞춰 줄인다.
  const fit=()=>grid.querySelectorAll('.q-card-paper').forEach(p=>{const d=p.firstElementChild;if(d)d.style.transform=`scale(${Math.min(1,(p.clientWidth-32)/540)})`;});
  fit();
  for(const q of list)void preview(q).then(html=>{const n=grid.querySelector(`[data-preview="${q.id}"]`);if(n){n.innerHTML=html;fit();}});
}

export function renderExam(root,data){
  const {items,pages,missing}=examPlan(data),inExam=new Set(items.map(x=>x.id));
  root.querySelector('#exam-summary').textContent=items.length?`${items.length}문항 · ${pages.length}쪽${missing.length?` · 조판 저장 필요 ${missing.length}`:''}`:'';
  root.querySelector('#exam-build').disabled=!items.length||!!missing.length;
  root.querySelector('#exam-items').innerHTML=items.length?items.map((x,i)=>`<li data-exam-item="${x.id}"><span class="exam-no">${i+1}</span><div><strong>${E(questionTitle(x.q))}</strong><span>${E(questionSubtitle(x.q))}</span><em>${x.measured?`${x.height.toFixed(0)}mm`:'높이 추정'}${x.ready?'':' · 조판 저장 필요'}</em></div>
    <button type="button" data-exam-move="up" aria-label="위로">${ICON.up}</button><button type="button" data-exam-move="down" aria-label="아래로">${ICON.down}</button><button type="button" data-exam-remove aria-label="빼기">${ICON.remove}</button></li>`).join(''):'<li class="exam-empty">카드에서 「시험지」를 체크하거나 아래에서 문항을 넣으세요.</li>';
  const rest=data.questions.filter(q=>!inExam.has(q.id));
  root.querySelector('#exam-candidates').innerHTML=rest.map(q=>`<li><div><strong>${E(questionTitle(q))}</strong><span>${E(questionSubtitle(q))}</span></div><button type="button" data-exam-add="${q.id}">${ICON.add}넣기</button></li>`).join('')||'<li class="exam-empty">모든 문항을 넣었습니다.</li>';
  const byId=new Map(items.map(x=>[x.id,x])),number=new Map(items.map((x,i)=>[x.id,i+1]));
  root.querySelector('#exam-pages').innerHTML=pages.map((page,p)=>`<figure class="exam-page" data-oversized="${page.oversized}"><div class="exam-sheet">${page.columns.map(col=>`<div class="exam-col">${col.map(id=>{const x=byId.get(id);return `<div class="exam-q" data-ready="${x.ready}" style="height:${Math.min(100,x.height/267*100)}%"><b>${number.get(id)}</b><span>${E(questionSubtitle(x.q))}</span></div>`;}).join('')}</div>`).join('')}</div><figcaption>${p+1}쪽${page.oversized?' · 한 단보다 긴 문항':''}</figcaption></figure>`).join('')||'<p class="cards-empty">넣은 문항이 없습니다.</p>';
}
