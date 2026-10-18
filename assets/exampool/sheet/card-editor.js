// 문항 카드: 문항 하나를 인쇄 순서대로 쓰는 입력 화면(밝은 종이 위 상자). 왼쪽은 시험지·보관함 문항 목록,
// 오른쪽은 라이브러리(기출·교과서·기준·자료·지면·AI). 엑셀형 표는 시험지의 '전체 표'로만 남긴다.
import {WORKFLOWS,KINDS} from './model.js';
import {fieldValue,writeField} from './vertical.js';
import {normalizeCombo} from './choice-text.js';
import {workflowOf,previewHtml,questionSubtitle} from './views.js';
import {AXES,AXIS_LABEL,JUDGEMENT_LABEL} from '../authoring/schema.js';
import {labelOf} from '../authoring/session.js';

const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const NUM=['①','②','③','④','⑤'];
const COMMON=['ㄱ','ㄷ','ㄱ, ㄴ','ㄴ, ㄷ','ㄱ, ㄴ, ㄷ'];
const ICON={
  pic:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16l4-4 4 4 4-6 4 6"/><rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/></svg>',
  table:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 10h16M4 15h16M10 4v16"/></svg>',
  plus:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  star:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.2 5.3L20 9l-4.4 3.8L17 18.5 12 15.6 7 18.5l1.4-5.7L4 9l5.8-.7z"/></svg>',
  left:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
  right:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
  search:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/></svg>',
};
const TABS=[['past','기출'],['textbooks','교과서'],['standards','기준'],['references','자료'],['paper','지면'],['ai','AI']];
const slotsOf=q=>{const out=[];const walk=p=>{for(const b of q.blocks.filter(x=>x.parent===p)){if(b.kind==='figure'||b.kind==='table')out.push(b);walk(b.id);}};walk(null);return out;};
const bogiOf=q=>q.blocks.find(b=>b.kind==='bogi');
const isCombo=q=>q.type==='합답형';
const store={get(k,d){try{return JSON.parse(localStorage.getItem('exampool-card:'+k))??d;}catch{return d;}},set(k,v){try{localStorage.setItem('exampool-card:'+k,JSON.stringify(v));}catch{}}};

// 완성 조건: 발문·자료(그림/표가 모두 찬 자리)·보기(합답형)·선지·정답. 모두 차면 AI 검토를 요청할 수 있다.
export function completeness(q){
  const slots=slotsOf(q),filled=slots.filter(b=>b.kind==='table'?b.table.cells.flat().some(c=>c.value||c.figure):!!b.figure).length;
  const bogi=bogiOf(q),lines=bogi?bogi.lines.filter(l=>l.text.trim()).length:0;
  const choices=q.style==='대응표'?5:q.choices.filter(c=>c.text.trim()||c.figure).length;
  const items=[['발문',!!q.ask.trim(),''],['자료',filled===slots.length,slots.length?`${filled}/${slots.length}`:''],...(isCombo(q)?[['보기',!!bogi&&lines===bogi.lines.length&&lines>0,bogi?`${lines}/${bogi.lines.length}`:'']]:[]),['선지',choices===5,`${choices}/5`],['정답',q.type==='서술형'?!!q.modelAnswer.trim():q.answer!==null,'']];
  return {items,done:items.every(x=>x[1])};
}

export function createCardEditor(root,api){
  const panels={nav:store.get('nav',true),list:store.get('list',true),lib:store.get('lib',true),tab:store.get('tab','past')};
  let manifest=null,manifestLoading=null,pastFilter=store.get('past',{subject:'',part:'',year:'',query:''}),renderedFor=null;
  const q=()=>api.question();

  function listHtml(){
    const ctx=api.context(),list=ctx.questions;
    return `<aside class="cv-list${panels.list?'':' folded'}"><div class="cv-list-head"><span>${E(ctx.label)} <b>${list.length}</b></span><button type="button" class="fold" data-cv="fold-list" title="${panels.list?'문항 목록 접기':'문항 목록 펴기'}">${panels.list?ICON.left:ICON.right}</button></div>
      ${list.map((x,i)=>`<button type="button" class="cv-qi" data-cv-open="${x.id}" aria-current="${x.id===q()?.id}"><span class="n">${ctx.numbered?i+1:'·'}</span><span class="t">${E(questionSubtitle(x))}</span><span class="m"><i class="dot st-${workflowOf(x)}"></i>${WORKFLOWS[workflowOf(x)]} · ${Number(x.points)||0}점</span></button>`).join('')}
      <button type="button" class="cv-new" data-cv="new">${ICON.plus}<span>새 문항</span></button></aside>`;
  }
  function slotsHtml(x){
    const tiles=slotsOf(x).map(b=>{
      const name=E(b.label||KINDS[b.kind]);
      if(b.kind==='figure'&&b.figure)return `<div class="cv-tile"><div class="pic"><img src="${E(b.figure.data)}" alt="${name}"></div><div class="cap"><b>${name}</b>그림${b.figure.editable?.source?' · 5E':''}<span class="sp"></span><button type="button" class="mini" data-cvslot-act="pick" data-cvslot="${b.id}" title="5E에서 다시 잘라 넣기">다시 가져오기</button></div></div>`;
      if(b.kind==='table'){const t=b.table;return `<div class="cv-tile"><div class="pic table-pic"><table>${t.cells.slice(0,4).map((row,r)=>`<tr>${row.slice(0,4).map(c=>`<${r<t.headerRows?'th':'td'}>${E(c.value).slice(0,8)}</${r<t.headerRows?'th':'td'}>`).join('')}</tr>`).join('')}</table></div><div class="cap"><b>${name}</b>표 ${t.rows}×${t.cols}<span class="sp"></span><button type="button" class="mini" data-cvslot-act="table" data-cvslot="${b.id}">표 편집</button></div></div>`;}
      return `<div class="cv-tile empty"><div class="pic"><button type="button" class="btn go" data-cvslot-act="pick" data-cvslot="${b.id}">${ICON.pic}5E에서 그림 가져오기</button><button type="button" class="btn" data-cvslot-act="to-table" data-cvslot="${b.id}">${ICON.table}표 만들기</button></div><div class="cap"><b>${name}</b>빈 자리<span class="sp"></span><button type="button" class="mini" data-cvslot-act="remove" data-cvslot="${b.id}" title="이 자리 지우기">지우기</button></div></div>`;
    }).join('');
    return `<div class="cv-tiles">${tiles}<div class="cv-add-slot"><button type="button" class="cv-add-tile" data-cvslot-act="add-figure">${ICON.pic}그림 자리</button><button type="button" class="cv-add-tile" data-cvslot-act="add-table">${ICON.table}표 자리</button></div></div>`;
  }
  function linesHtml(b,key,ph){
    return `<div class="rows">${b.lines.map((l,i)=>`<div class="ig"><span>${E(key==='bogi'?l.label:l.label)}</span><input data-cvline="${key}" data-i="${i}" value="${E(l.text)}" placeholder="${E(ph)}"><button type="button" class="ig-x" data-cvline-remove="${key}" data-i="${i}" title="이 줄 지우기" aria-label="이 줄 지우기">×</button></div>`).join('')}
      <button type="button" class="link add" data-cvline-add="${key}">+ ${key==='bogi'?'보기':key==='steps'?'과정':'대화'} 추가</button></div>`;
  }
  function choicesHtml(x){
    if(x.type==='서술형')return `<div class="f-field"><label for="cv-model">모범 답안</label><textarea id="cv-model" data-cvf="answer" rows="3">${E(x.modelAnswer)}</textarea></div>`;
    if(x.style==='대응표')return `<div class="f-field"><label>선지 <em>대응표 선지는 표 시트에서 채웁니다</em></label><button type="button" class="btn" data-cv="choice-table">${ICON.table}선지 대응표 열기</button></div>`;
    if(isCombo(x)){
      const letters=(bogiOf(x)?.lines||[]).map(l=>l.label).filter(Boolean),pool=letters.length?letters:['ㄱ','ㄴ','ㄷ'];
      return `<div class="f-field"><label>선지 <em>보기 ${pool.join('·')}을 눌러 조합을 만들고, 동그라미로 정답을 고릅니다</em><button type="button" class="link" data-cv="common-combos" style="margin-left:auto">자주 쓰는 조합으로 채우기</button></label>
        <div class="rows">${x.choices.map((c,i)=>{const on=new Set(c.text.split(/\s*,\s*/).filter(Boolean));return `<div class="combo-row${x.answer===i?' on':''}"><input type="radio" name="cv-ans" data-cvans="${i}" ${x.answer===i?'checked':''} aria-label="${NUM[i]} 정답"><span class="no">${NUM[i]}</span><div class="pills">${pool.map(l=>`<button type="button" data-cvcombo="${i}" data-letter="${E(l)}" aria-pressed="${on.has(l)}">${E(l)}</button>`).join('')}</div><span class="read">${E(c.text)||'—'}</span>${x.answer===i?'<span class="ans">정답</span>':''}</div>`;}).join('')}</div></div>`;
    }
    const lay=x.choiceLayout||'';
    return `<div class="f-field"><label>선지 <em>값·식·낱말·문장을 한 줄씩 · 동그라미로 정답</em><span class="lay">${[['','자동'],['한 줄','한 줄'],['2열','2열'],['세로','세로']].map(([v,t])=>`<button type="button" class="link" data-cvlayout="${v}" aria-pressed="${lay===v}">${t}</button>`).join('')}</span></label>
      <div class="rows">${x.choices.map((c,i)=>`<label class="ig choice-row${x.answer===i?' on':''}"><input type="radio" name="cv-ans" data-cvans="${i}" ${x.answer===i?'checked':''}><span>${NUM[i]}</span><input data-cvchoice="${i}" value="${E(c.text)}" placeholder="${NUM[i]} 선지"></label>`).join('')}</div></div>`;
  }
  function formHtml(x){
    const bogi=bogiOf(x),steps=x.blocks.find(b=>b.kind==='steps'),talk=x.blocks.find(b=>b.kind==='dialogue');
    const passages=x.blocks.filter(b=>b.kind==='text');
    const {items,done}=completeness(x);
    return `<div class="cv-writer"><div class="w-head"><span class="qno">${x.number?E(x.number)+'번':'번호 없음'} 문항</span>
        <div class="typeseg" role="group" aria-label="문항 유형">${[['합답형','합답형'],['객관식','정답형'],['서술형','서술형']].map(([v,t])=>`<button type="button" data-cvtype="${v}" aria-pressed="${x.type===v}">${t}</button>`).join('')}</div>
        <span class="sp"></span>
        <div class="stage" role="group" aria-label="문항 단계">${Object.entries(WORKFLOWS).map(([k,v])=>`<button type="button" data-cvstage="${k}" aria-pressed="${workflowOf(x)===k}"><i class="dot st-${k}"></i>${v}</button>`).join('')}</div></div>
      <form class="sheet-form" onsubmit="return false">
        <section class="f-sec plan"><div class="f-sec-head"><h3>출제 설계</h3><span>인쇄되지 않는 정보</span></div>
          <div class="f-row2"><div class="f-field"><label>성취기준</label><div class="pick">${x.standardCode?`<b>${E(x.standardCode)}</b>`:'<span class="ph">오른쪽 \'기준\'에서 골라 연결합니다</span>'}<button type="button" class="link" data-cv="open-standards">${x.standardCode?'바꾸기':'찾기'}</button></div></div>
            <div class="f-field"><label for="cv-intent">출제 의도</label><input id="cv-intent" data-cvf="intent" value="${E(x.intent)}" placeholder="평가할 개념과 학생이 할 일"></div></div></section>
        <section class="f-sec"><div class="f-sec-head"><h3>문항 내용</h3><span>인쇄 순서대로 채웁니다</span></div>
          <div class="f-field"><label for="cv-passage">지문 <em>자료 앞에 오는 설명</em></label>${passages.length>1?`<p class="hint">지문이 ${passages.length}개인 문항입니다. 첫 지문만 여기서 고치고, 나머지는 구성 시트에서 고칩니다.</p>`:''}<textarea id="cv-passage" data-cvf="passage" rows="2" placeholder="자료 앞에 오는 설명 글 (없으면 비워 둡니다)">${E(passages[0]?.text||'')}</textarea></div>
          <div class="f-field"><label>자료 <em>그림은 5E에서 잘라 가져오고, 표는 칸 수를 정해 만듭니다</em></label>${slotsHtml(x)}</div>
          ${steps?`<div class="f-field"><label>실험 과정 <em>(가)·(나)는 자동으로 붙습니다</em></label>${linesHtml(steps,'steps','과정을 입력하세요')}</div>`:''}
          ${talk?`<div class="f-field"><label>대화 <em>이름 칸에 학생 이름, 오른쪽에 말</em></label>${linesHtml(talk,'dialogue','말을 입력하세요')}</div>`:''}
          <div class="f-field"><label for="cv-ask">발문</label><div class="with-tail"><textarea id="cv-ask" data-cvf="ask" rows="2" placeholder="학생에게 물을 문장">${E(x.ask)}</textarea><label class="toggle"><input type="checkbox" data-points3 ${x.points===3?'checked':''}> 3점</label></div></div>
          ${isCombo(x)?`<div class="f-field"><label>보기 <em>ㄱ·ㄴ·ㄷ은 자동으로 붙습니다</em></label>${bogi?linesHtml(bogi,'bogi','보기 내용을 입력하세요'):'<button type="button" class="btn" data-cvline-add="bogi">+ 보기 만들기</button>'}</div>`:''}
          ${choicesHtml(x)}
          <details class="f-more"${store.get('more',false)?' open':''}><summary>해설 · 단원 · 출처 · 배점</summary>
            <div class="f-row3"><div class="f-field"><label>대단원</label><input data-cvf="unitLarge" value="${E(x.unitLarge||'')}"></div><div class="f-field"><label>중단원</label><input data-cvf="unitMiddle" value="${E(x.unitMiddle||'')}"></div><div class="f-field"><label>배점</label><input data-cvf="points" value="${E(x.points)}" inputmode="decimal"></div></div>
            <div class="f-row2"><div class="f-field"><label>출처</label><input data-cvf="source" value="${E(x.source)}" placeholder="자체 제작 · 교과서 · 기출 변형"></div><div class="f-field"><label>문항관리번호</label><input data-cvf="managementId" value="${E(x.managementId||'')}"></div></div>
            <div class="f-field"><label>해설</label><textarea data-cvf="explanation" rows="3" placeholder="정답 근거">${E(x.explanation)}</textarea></div></details>
        </section>
        <footer class="f-foot"><div class="checks" id="cv-checks">${checksHtml(items)}</div><span class="sp"></span><button type="button" class="btn" data-cv="sheet">전체 표에서 보기</button><button type="button" class="btn go" data-cv="review" ${done?'':'title="발문·자료·보기·선지·정답을 채우면 검토가 정확해집니다"'}>${ICON.star}AI 검토 요청</button></footer>
      </form></div>`;
  }
  const checksHtml=items=>items.map(([k,ok,n])=>`<span class="${ok?'ok':''}">${ok?'✓ ':''}${k}${n&&!ok?` ${n}`:''}</span>`).join('');
  function libHtml(){
    const tabs=TABS.map(([k,t])=>`<button type="button" data-cvtab="${k}" aria-pressed="${panels.tab===k}"${k==='ai'?' class="ai-tab"':''}>${t}</button>`).join('');
    const rail=TABS.map(([k,t])=>`<button type="button" data-cvrail="${k}"${k==='ai'?' class="ai-tab"':''}>${t}</button>`).join('');
    const x=q(),refs=x?.references||[];
    return `<aside class="cv-lib${panels.lib?'':' folded'}"><div class="rail"><button type="button" class="fold" data-cv="fold-lib" title="오른쪽 패널 펴기">${ICON.left}</button>${rail}</div>
      <div class="lp-tabs"><button type="button" class="fold" data-cv="fold-lib" title="오른쪽 패널 접기">${ICON.right}</button>${tabs}</div>
      <div class="lp-body" data-cvbody="past" ${panels.tab==='past'?'':'hidden'}></div>
      <div class="lp-body lp-docked" data-cvbody="docked" ${['textbooks','standards','references'].includes(panels.tab)?'':'hidden'}></div>
      <div class="lp-body" data-cvbody="paper" ${panels.tab==='paper'?'':'hidden'}><div class="cv-paper" id="cv-paper"></div><div class="lp-actions"><button type="button" class="btn" data-cv="typeset">한글 조판 열기</button><span class="note">조판은 기출 규칙대로 자동입니다. 마무리 손질은 5e_hwp에서 시험지 한 부로 합니다.</span></div></div>
      <div class="lp-body ai-body" data-cvbody="ai" ${panels.tab==='ai'?'':'hidden'}></div>
      <div class="lp-linked"><b>이 문항의 근거 ${refs.length}</b><span>${refs.slice(0,4).map(r=>E(r.label)).join(' · ')||'기출·교과서·기준에서 「근거로 연결」을 누르면 여기에 모입니다'}</span></div></aside>`;
  }

  function render(){
    const x=q();
    const keep=root.querySelector('.cv-writer')?.scrollTop||0,same=renderedFor===x?.id;
    api.dock?.(null);// 다시 그리기 전에 붙여 둔 자료 열람 패널을 원래 자리로 돌려놓는다(같이 지워지지 않게).
    root.innerHTML=listHtml()+(x?formHtml(x):'<div class="cv-writer"><p class="pv-empty">왼쪽에서 문항을 고르거나 「새 문항」을 누르세요.</p></div>')+libHtml();
    if(same)root.querySelector('.cv-writer').scrollTop=keep;
    renderedFor=x?.id;
    api.dock?.(['textbooks','standards','references'].includes(panels.tab)?panels.tab:null,root.querySelector('[data-cvbody="docked"]'));
    if(panels.tab==='past')renderPast();if(panels.tab==='paper')renderPaper();if(panels.tab==='ai')renderAi();
    root.querySelectorAll('.cv-writer textarea').forEach(fit);
  }
  const fit=t=>{t.style.height='auto';t.style.height=Math.max(t.scrollHeight+2,44)+'px';};
  function refreshLight(){const x=q();if(!x)return;const c=root.querySelector('#cv-checks');if(c)c.innerHTML=checksHtml(completeness(x).items);if(panels.tab==='paper')schedulePaper();
    const cur=root.querySelector(`.cv-qi[data-cv-open="${x.id}"] .t`);if(cur)cur.textContent=questionSubtitle(x);}
  let paperTimer=0;const schedulePaper=()=>{clearTimeout(paperTimer);paperTimer=setTimeout(renderPaper,250);};
  async function renderPaper(){const x=q(),n=root.querySelector('#cv-paper');if(!x||!n)return;n.innerHTML=await previewHtml(x);}

  // 기출: 5E 라이브러리(기출 그림 3,961문항)를 과목·단원·연도·핵심어로 걸러 본다.
  async function renderPast(){
    const body=root.querySelector('[data-cvbody="past"]');if(!body)return;
    const typing=document.activeElement?.dataset?.cvpast==='query';
    if(!manifest){body.innerHTML='<p class="lp-count">기출 목록을 불러오는 중…</p>';try{manifest=await(manifestLoading||=fetch('/assets/exam-library/manifest.json').then(r=>{if(!r.ok)throw Error();return r.json();}));}catch{body.innerHTML='<p class="lp-count">기출 라이브러리를 불러오지 못했습니다.</p>';manifestLoading=null;return;}}
    const items=manifest.items,subjects=[...new Set(items.map(i=>i.subjectLabel))],f=pastFilter;
    const list=items.filter(i=>(!f.subject||i.subjectLabel===f.subject)&&(!f.part||i.parts.includes(f.part))&&(!f.year||String(i.year)===f.year)&&(!f.query||[i.title,...i.tags,...i.parts].join(' ').includes(f.query)));
    const sel=(k,vals,label)=>`<select data-cvpast="${k}" aria-label="${label}"><option value="">${label}</option>${vals.map(v=>`<option${String(f[k])===String(v)?' selected':''}>${E(v)}</option>`).join('')}</select>`;
    body.innerHTML=`<div class="lp-filter">${sel('subject',subjects,'과목')}${sel('part',manifest.parts,'단원')}${sel('year',manifest.years,'연도')}</div>
      <label class="lp-search">${ICON.search}<input data-cvpast="query" value="${E(f.query)}" placeholder="핵심어 (예: 자기장, 운동량)"></label>
      <p class="lp-count">5E 라이브러리 기출 ${items.length.toLocaleString()}문항 중 <b>${list.length.toLocaleString()}</b>문항${list.length>40?' · 앞 40개':''}</p>
      <div class="past-list">${list.slice(0,40).map(i=>`<figure class="past"><img loading="lazy" src="/assets/exam-library/images/${encodeURIComponent(i.file)}" alt="${E(i.title)}"><figcaption><b>${E(i.title)}</b><span>${E([...i.parts,...i.tags].slice(0,3).join(' · '))}</span><button type="button" class="mini" data-cvlink="${E(i.id)}">근거로 연결</button></figcaption></figure>`).join('')}</div>`;
    if(typing){const n=body.querySelector('[data-cvpast="query"]');n.focus();n.setSelectionRange(n.value.length,n.value.length);}
  }

  // AI: 이 문항과 대화하며 설계·수정·검토한다. 변경안은 「적용」을 눌러야 문항에 들어간다.
  const AXIS_STATE={none:'미검토',pass:'통과',issue:'문제 있음',unverified:'확인 필요',stale:'다시 검토'};
  const PATH_LABEL={ask:'발문',passage:'지문',explanation:'해설',modelAnswer:'모범 답안',intent:'출제 의도',standardCode:'성취기준',answer:'정답',choices:'선지 전체',bogi:'보기',choice:'선지',block:'구성',table:'표',type:'유형',points:'배점'};
  const changeLine=c=>{const where=c.path==='bogi'&&c.line!==undefined?`보기 ${typeof c.line==='number'?['ㄱ','ㄴ','ㄷ','ㄹ','ㅁ'][c.line]:c.line}`:c.path==='choice'?`선지 ${NUM[Number(c.index)]||''}`:c.path==='answer'?'정답':c.id?`${PATH_LABEL[c.path]} ${c.id}`:PATH_LABEL[c.path]||c.path;
    const value=c.path==='answer'?NUM[Number(c.value)-1]||c.value:c.path==='table'?`${c.cells?.length||0}행 표`:String(c.value??'');return `<li><b>${E(where)}</b> ${E(value.length>240?value.slice(0,240)+'…':value)}</li>`;};
  function authoringStrip(x){
    const a=x.authoring;if(!a)return '';
    const axes=AXES.map(k=>`<span class="ax ax-${a.review.axes[k].status}" title="${E(a.review.axes[k].note||'')}">${AXIS_LABEL[k]} · ${AXIS_STATE[a.review.axes[k].status]}</span>`).join('');
    const stale=a.stale.length?`<p class="au-stale">다시 확인: ${a.stale.map(s=>`<span title="${E(s.reason)}">${E(labelOf(x,s.target))}</span>`).join(' · ')}</p>`:'';
    const pending=a.requirements.pending.length?`<p class="au-pending">확인 필요: ${a.requirements.pending.map(E).join(' · ')}</p>`:'';
    const open=a.issues.filter(i=>i.status==='open');
    const history=a.history.length>1?`<details class="au-history"><summary>수정 이력 ${a.history.length}개</summary><ol>${[...a.history].reverse().map(h=>`<li><span>버전 ${h.revision} · ${({ai:'AI 변경안',teacher:'직접 수정',revert:'되돌리기',import:'시작'})[h.by]}</span> ${E(h.summary)}${h.revision!==a.revision?` <button type="button" class="mini" data-cvrevert="${h.revision}">이 버전으로</button>`:' <em>지금</em>'}</li>`).join('')}</ol></details>`:'';
    const issues=open.length?`<details class="au-issues"><summary>남은 쟁점 ${open.length}개</summary><ul>${open.map(i=>`<li>${E(i.text)}</li>`).join('')}</ul></details>`:'';
    const fp=api.figurePending?.(x),staleFig=new Set(a.stale.filter(t=>t.target.startsWith('figure:')).map(t=>t.target.slice(7)));
    const figs=a.figures.length||fp?`<div class="au-figlist">${a.figures.map(f=>{const b=x.blocks.find(v=>v.id===f.blockId);return `<div class="au-figrow${staleFig.has(f.blockId)?' stale':''}"><b>${E(b?.label||'그림')}</b> <span>${f.kind==='graph'?'그래프 · 편집 가능':'그림 · 비트맵'}${staleFig.has(f.blockId)?' · 조건이 바뀜, 다시 확인':''}</span> <button type="button" class="mini" data-cvremake="${E(f.blockId)}">다시 만들기</button>${f.kind==='graph'&&f.graph?` <button type="button" class="mini" data-cvgraphedit="${E(f.blockId)}">그래프 편집</button>`:''}</div>`;}).join('')}${fp?`<div class="au-figrow pending">${fp.kind==='graph'?'그래프를':'그림을'} 만드는 중… <span class="au-elapsed" data-since="${E(fp.at)}"></span></div>`:''}</div>`:'';
    return `<div class="au-strip"><div class="au-axes"><b>버전 ${a.revision}</b>${axes}</div>${stale}${pending}${figs}${issues}${history}</div>`;
  }
  function aiMessage(x,m,i){
    if(m.role==='me')return `<div class="msg me">${E(m.text)}</div>`;
    const p=m.proposalId?x.authoring?.proposals.find(p=>p.id===m.proposalId):null;
    const proposal=p?`<div class="suggest proposal${p.state!=='current'?' old':''}"><div class="sg-head">변경안${p.state!=='current'?' · 지난 버전 기준':''}</div><p>${E(p.summary)}</p><ul class="chg">${p.changes.slice(0,20).map(changeLine).join('')}</ul><div class="sg-act"><button type="button" class="mini go-mini" data-cvprop="${E(p.id)}" data-act="apply">적용</button><button type="button" class="mini" data-cvprop="${E(p.id)}" data-act="reject">거절</button></div></div>`:m.proposalId?'<p class="sg-done">변경안을 처리했습니다.</p>':'';
    const questions=m.questions?.length?`<ul class="ask-back">${m.questions.map(q=>`<li>${E(q)}</li>`).join('')}</ul>`:'';
    const items=m.items?.length?`<ol class="rv">${m.items.map(it=>`<li>${it.field?`<b>${E(it.field)}</b> `:''}${E(it.text)}</li>`).join('')}</ol>`:'';
    const notes=m.notes?.length?`<ul class="au-notes">${m.notes.map(n=>`<li>${E(n)}</li>`).join('')}</ul>`:'';
    const ev=m.evidence?.length?`<details class="au-ev"><summary>근거 ${m.evidence.length}개</summary><ul>${m.evidence.map(e=>`<li><b>${E(JUDGEMENT_LABEL[e.judgement]||e.judgement)}</b> ${E(e.target)} · ${E(e.claim)}${e.title?` <span>(${E(e.title)})</span>`:''}</li>`).join('')}</ul></details>`:'';
    const figs=m.figures?.length?`<div class="au-figs">${m.figures.map((f,j)=>`<div class="au-fig"><b>${f.kind==='graph'?'그래프':'그림'} · ${E(f.slot)}</b><p>${E(f.description)}</p><button type="button" class="mini go-mini" data-cvfig="${i}:${j}">${f.kind==='graph'?'그래프 만들기':'그림 만들기'}</button></div>`).join('')}</div>`:'';
    const meta=m.meta?.model?`<span class="au-meta">${E(m.meta.model)} · ${Math.round((m.meta.ms||0)/1000)}초${m.meta.live?'':' · 대역 응답'}</span>`:'';
    const legacy=m.suggestion?`<div class="suggest"><div class="sg-head">${E(m.suggestion.field)} · 제안</div><p>${E(m.suggestion.text)}</p><div class="sg-act"><button type="button" class="mini go-mini" data-ai-apply="${i}">적용</button></div></div>`:'';
    return `<div class="msg ai${m.error?' err':''}${m.stale?' old':''}">${E(m.text)}${questions}${items}${notes}${proposal}${legacy}${figs}${ev}${meta}</div>`;
  }
  function renderAi(){
    const body=root.querySelector('[data-cvbody="ai"]'),x=q();if(!body||!x)return;
    const log=x.reviews||[],typing=document.activeElement?.id==='cv-ai-input',draft=root.querySelector('#cv-ai-input')?.value||'',pending=api.aiPending?.(x);
    body.innerHTML=`<div class="ai-scope"><b>${E(x.number||'')}번 문항</b>과 함께 설계·수정·검토합니다 · 변경안은 「적용」을 눌러야 문항에 들어갑니다</div>
      ${authoringStrip(x)}
      <div class="chat">${log.length?log.map((m,i)=>aiMessage(x,m,i)).join(''):'<p class="ai-empty">만들 문항을 말하거나(예: 두 물체의 운동을 비교하는 수능형 문항, 속도–시간 그래프, 계산보다 조건 해석) 「검토해 줘」를 보내세요.</p>'}${pending?`<div class="msg ai pending">${E(pending.text||'AI가 답을 쓰는 중…')} <span class="au-elapsed" data-since="${E(pending.since||'')}"></span> <button type="button" class="mini" data-cv="ai-cancel">취소</button></div>`:''}</div>
      <div class="quick">${['새 문항 초안','검토해 줘','발문 다듬기','오답 선지 만들기'].map(t=>`<button type="button" class="mini" data-ai-quick="${t}"${pending?' disabled':''}>${t}</button>`).join('')}</div>
      <div class="composer"><textarea id="cv-ai-input" rows="2" placeholder="이 문항에 대해 AI에게 요청하세요 (예: ㄴ을 참으로 바꾸고 그래프 구간을 하나 줄여줘)">${E(draft)}</textarea><button type="button" class="btn go" data-cv="ai-send"${pending?' disabled':''}>보내기</button></div>`;
    const chat=body.querySelector('.chat');chat.scrollTop=chat.scrollHeight;
    // 기다린 시간 표시(1초마다). 답이 오면 다시 그리면서 사라진다.
    clearInterval(renderAi.timer);const els=[...body.querySelectorAll('.au-elapsed')];if(els.length){const tick=()=>els.forEach(el=>{const s=Math.round((Date.now()-Date.parse(el.dataset.since))/1000);el.textContent=Number.isFinite(s)?`${s}초`:'';});tick();renderAi.timer=setInterval(()=>{if(!els[0].isConnected){clearInterval(renderAi.timer);return;}tick();},1000);}
    if(typing){const n=body.querySelector('#cv-ai-input');n.focus();n.setSelectionRange(n.value.length,n.value.length);}
  }

  function setPanel(k,v){panels[k]=v;store.set(k,v);render();}
  function edit(field,fn,light=true){api.edit(fn,{key:`card:${q()?.id}:${field}`,light});if(light)refreshLight();}

  root.addEventListener('input',e=>{
    const t=e.target,x=q();if(!x)return;
    if(t.matches('textarea'))fit(t);
    if(t.dataset.cvf){const f=t.dataset.cvf;edit(f,()=>{if(f==='passage'){const b=x.blocks.find(v=>v.kind==='text');if(b)b.text=t.value;else writeField(x,'passage',t.value);}else if(f==='points'){if(t.value.trim()!==''&&Number.isFinite(Number(t.value)))x.points=Number(t.value);}else writeField(x,f,t.value);});return;}
    if(t.dataset.cvline){const key=t.dataset.cvline,b=x.blocks.find(v=>v.kind===key),i=Number(t.dataset.i);edit(key,()=>{b.lines[i].text=t.value;});return;}
    if(t.dataset.cvchoice){const i=Number(t.dataset.cvchoice);edit('choices',()=>{x.choices[i].text=t.value;});return;}
    if(t.dataset.cvpast==='query'){pastFilter.query=t.value.trim();store.set('past',pastFilter);clearTimeout(t._timer);t._timer=setTimeout(renderPast,250);}
  });
  root.addEventListener('change',e=>{
    const t=e.target,x=q();
    if(t.dataset.cvpast&&t.dataset.cvpast!=='query'){pastFilter[t.dataset.cvpast]=t.value;store.set('past',pastFilter);renderPast();return;}
    if(!x)return;
    if(t.dataset.cvans!==undefined){api.edit(()=>{x.answer=Number(t.dataset.cvans);});return;}
    if(t.matches('[data-points3]')){api.edit(()=>{x.points=t.checked?3:2;});return;}
  });
  root.addEventListener('toggle',e=>{if(e.target.matches?.('details.f-more'))store.set('more',e.target.open);},true);
  root.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;const x=q(),d=b.dataset;
    if(d.cvOpen){api.open(d.cvOpen);return;}
    if(d.cvtab){setPanel('tab',d.cvtab);return;}
    if(d.cvrail){panels.lib=true;store.set('lib',true);setPanel('tab',d.cvrail);return;}
    if(d.cv==='fold-list'){setPanel('list',!panels.list);return;}
    if(d.cv==='fold-lib'){setPanel('lib',!panels.lib);return;}
    if(d.cv==='new'){api.newQuestion();return;}
    if(d.cvlink){const i=manifest?.items.find(v=>v.id===d.cvlink);if(i&&x)api.edit(()=>{x.references.push({target:'question',label:i.title,quote:[...i.parts,...i.tags].join(', ')});});api.status?.(`${i?.title} 을(를) 근거로 연결했습니다.`);return;}
    if(!x)return;
    if(d.cvtype){if(d.cvtype===x.type)return;api.edit(()=>{writeField(x,'type',d.cvtype);if(d.cvtype==='합답형')x.style='조합';else if(x.style==='조합')x.style='문장·수식';});return;}
    if(d.cvstage){api.edit(()=>{x.workflow=d.cvstage;});return;}
    if(d.cvslotAct){api.slot(d.cvslotAct,x,d.cvslot);return;}
    if(d.cvlineAdd){const key=d.cvlineAdd;api.edit(()=>{let blk=x.blocks.find(v=>v.kind===key);if(!blk){writeField(x,key,'');blk=x.blocks.find(v=>v.kind===key);}const value=fieldValue(x,key);writeField(x,key,value?value+'\n':key==='dialogue'?'학생 A: ':'');});return;}
    if(d.cvlineRemove){const key=d.cvlineRemove,i=Number(d.i);api.edit(()=>{const blk=x.blocks.find(v=>v.kind===key);blk.lines.splice(i,1);if(key==='bogi'){const L=['ㄱ','ㄴ','ㄷ','ㄹ','ㅁ','ㅂ','ㅅ','ㅇ'];blk.lines.forEach((l,j)=>l.label=L[j]||String(j+1));}else if(key==='steps'){const C=['(가)','(나)','(다)','(라)','(마)','(바)','(사)','(아)'];blk.lines.forEach((l,j)=>l.label=C[j]||`(${j+1})`);}});return;}
    if(d.cvcombo!==undefined){const i=Number(d.cvcombo),letter=d.letter;api.edit(()=>{const set=new Set(x.choices[i].text.split(/\s*,\s*/).filter(Boolean));set.has(letter)?set.delete(letter):set.add(letter);const order=(bogiOf(x)?.lines||[]).map(l=>l.label);x.choices[i].text=normalizeCombo([...set].sort((a,b)=>order.indexOf(a)-order.indexOf(b)).join(', '));});return;}
    if(d.cv==='common-combos'){api.edit(()=>{x.choices.forEach((c,i)=>c.text=COMMON[i]);});return;}
    if(d.cvlayout!==undefined){api.edit(()=>{if(d.cvlayout)x.choiceLayout=d.cvlayout;else delete x.choiceLayout;});return;}
    if(d.cv==='open-standards'){panels.lib=true;store.set('lib',true);setPanel('tab','standards');return;}
    if(d.cv==='sheet'){api.sheet();return;}
    if(d.cv==='choice-table'){api.choiceTable();return;}
    if(d.cv==='typeset'){api.typeset();return;}
    if(d.cv==='review'){panels.lib=true;store.set('lib',true);panels.tab='ai';store.set('tab','ai');render();api.ai(x,{kind:'review',text:'검토해 줘'});return;}
    if(d.aiQuick){const kind=d.aiQuick==='검토해 줘'?'review':d.aiQuick==='새 문항 초안'?'draft':'chat';api.ai(x,{kind,text:d.aiQuick==='새 문항 초안'?'지금까지 정한 요구사항으로 새 문항 초안을 만들어 줘. 정하지 않은 것은 가정으로 남겨 줘.':d.aiQuick});return;}
    if(d.cv==='ai-send'){const input=root.querySelector('#cv-ai-input'),text=input?.value.trim();if(!text)return;input.value='';api.ai(x,{kind:/^검토/.test(text)?'review':'chat',text});return;}
    if(d.cv==='ai-cancel'){api.cancelAi?.(x);return;}
    if(d.cvprop){api.proposal?.(x,d.cvprop,d.act);return;}
    if(d.cvrevert!==undefined){api.revert?.(x,Number(d.cvrevert));return;}
    if(d.cvfig){const [i,j]=d.cvfig.split(':').map(Number),f=x.reviews?.[i]?.figures?.[j];if(f)api.figure?.(x,f);return;}
    if(d.cvremake){const request=prompt('어떻게 고칠까요? (비우면 같은 설명으로 다시 만듭니다)','');if(request===null)return;api.remakeFigure?.(x,d.cvremake,request.trim());return;}
    if(d.cvgraphedit){api.editGraph?.(x,d.cvgraphedit);return;}
    if(d.aiApply!==undefined){const m=x.reviews?.[Number(d.aiApply)];if(m?.suggestion)api.applySuggestion(x,m.suggestion);return;}
  });
  root.addEventListener('keydown',e=>{if(e.target.id==='cv-ai-input'&&e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();root.querySelector('[data-cv="ai-send"]')?.click();}});
  return {render,refreshLight,refreshAi(){if(panels.tab==='ai'&&panels.lib!==false)renderAi();},toggleNav(){setPanel('nav',!panels.nav);},get navOpen(){return panels.nav;},get tab(){return panels.tab;}};
}
