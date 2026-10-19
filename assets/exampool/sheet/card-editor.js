// 문항 카드: 문항 하나를 인쇄 순서대로 쓰는 입력 화면(밝은 종이 위 상자). 왼쪽은 시험지·보관함 문항 목록,
// 오른쪽은 라이브러리(기출·교과서·기준·자료·지면·AI). 엑셀형 표는 시험지의 '전체 표'로만 남긴다.
import {WORKFLOWS,KINDS,formOf,formLosses,applyForm} from './model.js';
import {FORMS,STRUCTS} from './templates.js';
import {SHAPE_ICONS} from './new-question.js';
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
  page:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h10v17H7z"/><path d="M9.5 8h5M9.5 11h5M9.5 14h3"/></svg>',
  card:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
  out:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>',
  panelL:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M9 4.5v15"/></svg>',
  panelR:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M15 4.5v15"/></svg>',
  search:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/></svg>',
};
// 시안 4: 왼쪽 라이브러리(기출·교과서·기준·자료) · 가운데 문항 카드(쪽 전체로 바꿔 보기) · 오른쪽 미리보기|AI.
const TABS=[['past','기출'],['textbooks','교과서'],['standards','기준'],['references','자료']];
const slotsOf=q=>{const out=[];const walk=p=>{for(const b of q.blocks.filter(x=>x.parent===p)){if(b.kind==='figure'||b.kind==='table')out.push(b);walk(b.id);}};walk(null);return out;};
// 유형·자료 구조는 새 문항 창에서 정한다. 카드 머리 줄에는 이름표로만 보이고, 눌렀을 때만 유형 바꾸기 메뉴가 열린다.
const STRUCT_SHORT={two:'자료 2개',big:'큰 자료 1개',small:'작은 자료 1개',condition:'조건 상자',many:'자료 3개 이상',experiment:'실험 상자',none:'글만'};
const shapeIco=k=>`<svg class="ico shape" viewBox="0 0 24 24" aria-hidden="true">${SHAPE_ICONS[k]||''}</svg>`;
const CHEV='<svg class="ico chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
const CHECK='<svg class="ico tick" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>';
const bogiOf=q=>q.blocks.find(b=>b.kind==='bogi');
const isCombo=q=>q.type==='합답형';
const CHANNEL=/^\/preview(?:\/|$)/.test(location.pathname)?'5e.preview:':'';// 공개 프리뷰는 저장 이름을 분리
const store={get(k,d){try{return JSON.parse(localStorage.getItem(CHANNEL+'exampool-card:'+k))??d;}catch{return d;}},set(k,v){try{localStorage.setItem(CHANNEL+'exampool-card:'+k,JSON.stringify(v));}catch{}}};

// 완성 조건: 발문·자료(그림/표가 모두 찬 자리)·보기(합답형)·선지·정답. 모두 차면 AI 검토를 요청할 수 있다.
export function completeness(q){
  const slots=slotsOf(q),filled=slots.filter(b=>b.kind==='table'?b.table.cells.flat().some(c=>c.value||c.figure):!!b.figure).length;
  const bogi=bogiOf(q),lines=bogi?bogi.lines.filter(l=>l.text.trim()).length:0;
  const choices=q.style==='대응표'?5:q.choices.filter(c=>c.text.trim()||c.figure).length;
  const items=[['발문',!!q.ask.trim(),''],['자료',filled===slots.length,slots.length?`${filled}/${slots.length}`:''],...(isCombo(q)?[['보기',!!bogi&&lines===bogi.lines.length&&lines>0,bogi?`${lines}/${bogi.lines.length}`:'']]:[]),['선지',choices===5,`${choices}/5`],['정답',q.type==='서술형'?!!q.modelAnswer.trim():q.answer!==null,'']];
  return {items,done:items.every(x=>x[1])};
}

export function createCardEditor(root,api){
  const panels={nav:store.get('nav',true),lib:store.get('lib',true),tab:TABS.some(([k])=>k===store.get('tab','past'))?store.get('tab','past'):'past',right:store.get('right','paper'),rightOpen:store.get('rightOpen',true),view:'card'};
  let pastIndex=null,pastIndexLoading=null,pastItems=null,pastItemsKey='',pastFilter=store.get('past',{subject:'',part:'',year:'',query:''}),renderedFor=null;
  const q=()=>api.question();

  // 위쪽 번호 탭: 문항마다 완성도 고리·단계 색·검토 의견 표시. 접힌 목록 대신 번호가 늘 보인다.
  function tabsHtml(){
    const ctx=api.context(),list=ctx.questions;
    return `<nav class="cv-qtabs" aria-label="${E(ctx.label)} 문항">${list.map((x,i)=>{const {items}=completeness(x),pct=Math.round(items.filter(v=>v[1]).length/items.length*100),open=x.authoring?.issues?.filter(v=>v.status==='open').length||0,stale=x.authoring?.stale?.length||0;
      return `<button type="button" class="cv-qtab st-${workflowOf(x)}" data-cv-open="${x.id}" aria-current="${x.id===q()?.id}" title="${E((ctx.numbered?`${i+1}번 · `:'')+questionSubtitle(x))} · ${WORKFLOWS[workflowOf(x)]} · 완성도 ${pct}%${stale?' · 다시 확인 '+stale:''}"><span class="ring" style="--p:${pct}"><span class="num">${ctx.numbered?i+1:E(x.number||i+1)}</span></span>${stale||open?'<i class="flag">!</i>':''}</button>`;}).join('')}<button type="button" class="cv-qtab add" data-cv="new" title="새 문항">${ICON.plus}</button></nav>`;
  }
  function slotsHtml(x){
    const tiles=slotsOf(x).map(b=>{
      const name=E(b.label||KINDS[b.kind]);
      if(b.kind==='figure'&&b.figure)return `<div class="cv-tile"><div class="pic"><img src="${E(b.figure.data)}" alt="${name}"></div><div class="cap"><b>${name}</b>그림${b.figure.editable?.source?' · 5E':''}<span class="sp"></span><button type="button" class="mini" data-cvslot-act="pick" data-cvslot="${b.id}" title="5E에서 다시 잘라 넣기">다시 가져오기</button></div></div>`;
      if(b.kind==='table'){const t=b.table;return `<div class="cv-tile"><div class="pic table-pic"><table>${t.cells.slice(0,4).map((row,r)=>`<tr>${row.slice(0,4).map(c=>`<${r<t.headerRows?'th':'td'}>${E(c.value).slice(0,8)}</${r<t.headerRows?'th':'td'}>`).join('')}</tr>`).join('')}</table></div><div class="cap"><b>${name}</b>표 ${t.rows}×${t.cols}<span class="sp"></span><button type="button" class="mini" data-cvslot-act="table" data-cvslot="${b.id}">표 편집</button></div></div>`;}
      return `<div class="cv-tile empty"><div class="pic"><button type="button" class="btn go" data-cvslot-act="pick" data-cvslot="${b.id}">${ICON.pic}5E에서 그림 가져오기</button><button type="button" class="btn" data-cvslot-act="to-table" data-cvslot="${b.id}">${ICON.table}표 만들기</button></div><div class="cap"><b>${name}</b>빈 자리<span class="sp"></span><button type="button" class="mini" data-cvslot-act="remove" data-cvslot="${b.id}" title="이 자리 지우기">지우기</button></div></div>`;
    }).join('');
    // 칸 더하기는 하나: 빈 칸이 생기고, 그림을 가져올지 표를 만들지는 그 칸 안에서 고른다.
    return `${tiles?`<div class="cv-tiles">${tiles}</div>`:''}<button type="button" class="cv-add-row" data-cvslot-act="add-figure">${ICON.plus}자료 칸 추가<span>빈 칸이 생기고, 칸에서 그림을 가져오거나 표를 만듭니다</span></button>`;
  }
  function linesHtml(b,key,ph){
    return `<div class="rows">${b.lines.map((l,i)=>`<div class="ig"><span>${E(key==='bogi'?l.label:l.label)}</span><input data-cvline="${key}" data-i="${i}" value="${E(l.text)}" placeholder="${E(ph)}"><button type="button" class="ig-x" data-cvline-remove="${key}" data-i="${i}" title="이 줄 지우기" aria-label="이 줄 지우기">×</button></div>`).join('')}
      <button type="button" class="link add" data-cvline-add="${key}">+ ${key==='bogi'?'보기':key==='steps'?'과정':'대화'} 추가</button></div>`;
  }
  function choicesHtml(x){
    if(x.type==='서술형')return `<div class="f-field"><label for="cv-model">모범 답안</label><textarea id="cv-model" data-cvf="answer" rows="3">${E(x.modelAnswer)}</textarea></div>`;
    if(x.style==='대응표'){
      // 대응표 선지: 카드에서 바로 채운다(맨 윗줄은 열 제목, 아래 다섯 줄이 ①~⑤). 열은 1~6개.
      const t=x.choiceTable;
      return `<div class="f-field"><label title="대응표 · 맨 윗줄은 열 제목, 동그라미로 정답">선지<span class="lay"><button type="button" class="link" data-cvct-col="-1" ${t.cols<=1?'disabled':''}>− 열</button><button type="button" class="link" data-cvct-col="1" ${t.cols>=6?'disabled':''}>+ 열</button></span></label>
        <table class="cv-ctable"><thead><tr><th></th>${t.cells[0].map((c,j)=>`<th><input data-cvct="0:${j}" value="${E(c.value)}" placeholder="열 ${j+1}" aria-label="열 제목 ${j+1}"></th>`).join('')}</tr></thead>
        <tbody>${t.cells.slice(1).map((row,i)=>`<tr class="${x.answer===i?'on':''}"><th><label><input type="radio" name="cv-ans" data-cvans="${i}" ${x.answer===i?'checked':''} aria-label="${NUM[i]} 정답">${NUM[i]}</label></th>${row.map((c,j)=>`<td><input data-cvct="${i+1}:${j}" value="${E(c.value)}" aria-label="${NUM[i]} ${j+1}열"></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    if(isCombo(x)){
      const letters=(bogiOf(x)?.lines||[]).map(l=>l.label).filter(Boolean),pool=letters.length?letters:['ㄱ','ㄴ','ㄷ'];
      return `<div class="f-field"><label title="보기 ${pool.join('·')}을 눌러 조합을 만들고, 동그라미로 정답을 고릅니다">선지<button type="button" class="link" data-cv="common-combos" style="margin-left:auto">자주 쓰는 조합으로 채우기</button></label>
        <div class="rows">${x.choices.map((c,i)=>{const on=new Set(c.text.split(/\s*,\s*/).filter(Boolean));return `<div class="combo-row${x.answer===i?' on':''}"><input type="radio" name="cv-ans" data-cvans="${i}" ${x.answer===i?'checked':''} aria-label="${NUM[i]} 정답"><span class="no">${NUM[i]}</span><div class="pills">${pool.map(l=>`<button type="button" data-cvcombo="${i}" data-letter="${E(l)}" aria-pressed="${on.has(l)}">${E(l)}</button>`).join('')}</div><span class="read">${E(c.text)||'—'}</span>${x.answer===i?'<span class="ans">정답</span>':''}</div>`;}).join('')}</div></div>`;
    }
    const lay=x.choiceLayout||'';
    return `<div class="f-field"><label title="값·식·낱말·문장을 한 줄씩 · 동그라미로 정답">선지<span class="lay">${[['','자동'],['한 줄','한 줄'],['2열','2열'],['세로','세로']].map(([v,t])=>`<button type="button" class="link" data-cvlayout="${v}" aria-pressed="${lay===v}">${t}</button>`).join('')}</span></label>
      <div class="rows">${x.choices.map((c,i)=>`<label class="ig choice-row${x.answer===i?' on':''}"><input type="radio" name="cv-ans" data-cvans="${i}" ${x.answer===i?'checked':''}><span>${NUM[i]}</span><input data-cvchoice="${i}" value="${E(c.text)}" placeholder="${NUM[i]} 선지"></label>`).join('')}</div></div>`;
  }
  let shapeOpen=false;
  function shapeHtml(x){
    const f=formOf(x),st=STRUCTS[x.structure]?x.structure:null;
    const menu=shapeOpen?`<div class="cv-shape-menu" role="menu" aria-label="유형 바꾸기"><div class="m-head">유형 <span>보기·선지 칸만 바뀌고 쓴 글은 남습니다</span></div>${Object.entries(FORMS).map(([k,v])=>`<button type="button" role="menuitemradio" aria-checked="${k===f}" data-cvform="${k}">${shapeIco(k)}<span class="n">${E(v.name)}</span><span class="d">${E(v.desc)}</span>${k===f?CHECK:''}</button>`).join('')}</div>`:'';
    return `<div class="cv-shape-wrap"><button type="button" class="cv-shape" data-cv="shape" aria-haspopup="menu" aria-expanded="${shapeOpen}" title="새 문항 창에서 정한 틀 · 눌러서 유형 바꾸기">${shapeIco(f)}<b>${E(FORMS[f].name)}</b>${st?`<span class="st">${E(STRUCT_SHORT[st])}</span>`:''}${CHEV}</button>${menu}</div>`;
  }
  function setShape(open){if(shapeOpen===open)return;shapeOpen=open;const w=root.querySelector('.cv-shape-wrap'),x=q();if(w&&x)w.outerHTML=shapeHtml(x);}
  function formHtml(x){
    const bogi=bogiOf(x),steps=x.blocks.find(b=>b.kind==='steps'),talk=x.blocks.find(b=>b.kind==='dialogue');
    const passages=x.blocks.filter(b=>b.kind==='text');
    const {items,done}=completeness(x);
    return `<div class="cv-writer"><div class="w-head"><span class="qno">${x.number?E(x.number)+'번':'번호 없음'} 문항</span>
        ${shapeHtml(x)}
        <span class="sp"></span>
        <div class="stage" role="group" aria-label="문항 단계">${Object.entries(WORKFLOWS).map(([k,v])=>`<button type="button" data-cvstage="${k}" aria-pressed="${workflowOf(x)===k}"><i class="dot st-${k}"></i>${v}</button>`).join('')}</div></div>
      <form class="sheet-form" onsubmit="return false">
        <section class="f-sec plan"><div class="f-sec-head"><h3 title="인쇄되지 않는 정보">출제 설계</h3></div>
          <div class="f-row2"><div class="f-field"><label>성취기준</label><div class="pick">${x.standardCode?`<b>${E(x.standardCode)}</b>`:'<span class="ph">오른쪽 \'기준\'에서 골라 연결합니다</span>'}<button type="button" class="link" data-cv="open-standards">${x.standardCode?'바꾸기':'찾기'}</button></div></div>
            <div class="f-field"><label for="cv-intent">출제 의도</label><input id="cv-intent" data-cvf="intent" value="${E(x.intent)}" placeholder="평가할 개념과 학생이 할 일"></div></div></section>
        <section class="f-sec"><div class="f-sec-head"><h3 title="인쇄 순서대로 채웁니다">문항 내용</h3></div>
          <div class="f-field"><label for="cv-passage" title="자료 앞에 오는 설명">지문</label>${passages.length>1?`<p class="hint">지문이 ${passages.length}개인 문항입니다. 첫 지문만 여기서 고치고, 나머지는 구성 시트에서 고칩니다.</p>`:''}<textarea id="cv-passage" data-cvf="passage" rows="2" placeholder="자료 앞에 오는 설명 글 (없으면 비워 둡니다)">${E(passages[0]?.text||'')}</textarea></div>
          <div class="f-field"><label title="그림은 5E에서 잘라 가져오고, 표는 칸 수를 정해 만듭니다">자료</label>${slotsHtml(x)}</div>
          ${steps?`<div class="f-field"><label title="(가)·(나)는 자동으로 붙습니다">실험 과정</label>${linesHtml(steps,'steps','과정을 입력하세요')}</div>`:''}
          ${talk?`<div class="f-field"><label title="이름 칸에 학생 이름, 오른쪽에 말">대화</label>${linesHtml(talk,'dialogue','말을 입력하세요')}</div>`:''}
          <div class="f-field"><label for="cv-ask">발문</label><div class="with-tail"><textarea id="cv-ask" data-cvf="ask" rows="2" placeholder="학생에게 물을 문장">${E(x.ask)}</textarea><label class="toggle"><input type="checkbox" data-points3 ${x.points===3?'checked':''}> 3점</label></div></div>
          ${isCombo(x)?`<div class="f-field"><label title="ㄱ·ㄴ·ㄷ은 자동으로 붙습니다">보기</label>${bogi?linesHtml(bogi,'bogi','보기 내용을 입력하세요'):'<button type="button" class="btn" data-cvline-add="bogi">+ 보기 만들기</button>'}</div>`:''}
          ${choicesHtml(x)}
          <details class="f-more"${store.get('more',false)?' open':''}><summary>해설 · 단원 · 출처 · 배점</summary>
            <div class="f-row3"><div class="f-field"><label>대단원</label><input data-cvf="unitLarge" value="${E(x.unitLarge||'')}"></div><div class="f-field"><label>중단원</label><input data-cvf="unitMiddle" value="${E(x.unitMiddle||'')}"></div><div class="f-field"><label>배점</label><input data-cvf="points" value="${E(x.points)}" inputmode="decimal"></div></div>
            <div class="f-row2"><div class="f-field"><label>출처</label><input data-cvf="source" value="${E(x.source)}" placeholder="자체 제작 · 교과서 · 기출 변형"></div><div class="f-field"><label>문항관리번호</label><input data-cvf="managementId" value="${E(x.managementId||'')}"></div></div>
            <div class="f-field"><label>해설</label><textarea data-cvf="explanation" rows="3" placeholder="정답 근거">${E(x.explanation)}</textarea></div></details>
        </section>
        <footer class="f-foot"><div class="checks" id="cv-checks">${checksHtml(items)}</div><span class="sp"></span><button type="button" class="btn go" data-cv="review" ${done?'':'title="발문·자료·보기·선지·정답을 채우면 검토가 정확해집니다"'}>${ICON.star}AI 검토 요청</button></footer>
      </form></div>`;
  }
  const checksHtml=items=>items.map(([k,ok,n])=>`<span class="${ok?'ok':''}">${ok?'✓ ':''}${k}${n&&!ok?` ${n}`:''}</span>`).join('');
  function libHtml(){
    const tabs=TABS.map(([k,t])=>`<button type="button" data-cvtab="${k}" aria-pressed="${panels.tab===k}">${t}</button>`).join('');
    const x=q(),refs=x?.references||[];
    return `<aside class="cv-lib cv-left"${panels.lib?'':' hidden'} aria-label="라이브러리"><div class="cv-ph"><b>라이브러리</b><span>읽고 근거로 연결</span></div><div class="lp-tabs">${tabs}</div>
      <div class="lp-body" data-cvbody="past" ${['past','textbooks'].includes(panels.tab)?'':'hidden'}></div>
      <div class="lp-body lp-docked" data-cvbody="docked" ${['standards','references'].includes(panels.tab)?'':'hidden'}></div>
      <div class="lp-linked"><b>이 문항의 근거 ${refs.length}</b><span>${refs.slice(0,4).map(r=>E(r.label)).join(' · ')||'기출·교과서·기준에서 「근거로 연결」을 누르면 여기에 모입니다'}</span></div></aside>`;
  }
  const unseenAi=x=>{const seen=store.get('aiSeen:'+x.id,0);return (x.reviews||[]).slice(seen).filter(m=>m.role==='ai').length;};
  function rightHtml(){
    const x=q(),badge=x&&panels.right!=='ai'?unseenAi(x):0;
    return `<aside class="cv-right"${panels.rightOpen?'':' hidden'} aria-label="미리보기와 AI"><div class="cv-ph"><div class="seg cv-rseg" role="group" aria-label="오른쪽 칸"><button type="button" data-cvright="paper" aria-pressed="${panels.right==='paper'}">${ICON.page}미리보기</button><button type="button" data-cvright="ai" aria-pressed="${panels.right==='ai'}">${ICON.star}AI${badge?`<i class="badge">${badge}</i>`:''}</button></div><span class="sp"></span><small>${x?E(x.number||'')+'번 문항':''}</small></div>
      <div class="cv-rbody" data-cvbody="paper" ${panels.right==='paper'?'':'hidden'}><div class="cv-hwp" id="cv-hwp">${x?'':'<p class="pv-empty">문항을 고르면 한글 조판이 보입니다.</p>'}</div></div>
      <div class="cv-rbody ai-body" data-cvbody="ai" ${panels.right==='ai'?'':'hidden'}></div></aside>`;
  }
  // 가운데 머리줄: 왼쪽 끝 라이브러리 버튼, 번호 탭, 문항 카드|쪽 전체, 한글에서 손보기, 오른쪽 끝 미리보기·AI 버튼.
  function barHtml(){
    return `<div class="cv-bar"><button type="button" class="btn icon pt" data-cv="toggle-lib" aria-pressed="${panels.lib}" title="라이브러리 열기/닫기">${ICON.panelL}</button>${tabsHtml()}
      <div class="seg cv-vseg" role="group" aria-label="가운데 보기"><button type="button" data-cvview="card" aria-pressed="${panels.view==='card'}" title="문항 카드">${ICON.card}<span>문항 카드</span></button><button type="button" data-cvview="page" aria-pressed="${panels.view==='page'}" title="쪽 전체">${ICON.page}<span>쪽 전체</span></button></div>
      <span class="vsep"></span><button type="button" class="btn icon pt" data-cv="toggle-right" aria-pressed="${panels.rightOpen}" title="미리보기·AI 열기/닫기">${ICON.panelR}</button></div>`;
  }
  const splitHtml=k=>`<div class="cv-split" data-cvsplit="${k}" role="separator" aria-orientation="vertical" title="끌어서 폭 바꾸기 · 두 번 누르면 기본 폭"></div>`;
  // 기본 폭(시안 4): 화면 너비의 38%·28.5%(1440px 화면 → 545·410, 1920px → 730·547). 끈 폭은 기억한다.
  function widths(){const w=root.clientWidth||1440;return {lw:store.get('lw',Math.round(Math.min(760,Math.max(300,w*0.38)))),rw:store.get('rw',Math.round(Math.min(600,Math.max(340,w*0.285))))};}
  function render(){shapeOpen=false;
    const x=q();
    const keep=root.querySelector('.cv-writer')?.scrollTop||0,same=renderedFor===x?.id;
    api.dock?.(null);// 다시 그리기 전에 붙여 둔 자료 열람을 원래 자리로 돌려놓는다(같이 지워지지 않게).
    const {lw,rw}=widths();root.style.setProperty('--cv-lw',lw+'px');root.style.setProperty('--cv-rw',rw+'px');
    const center=x?(panels.view==='page'?'<div class="cv-page" id="cv-page"><p class="pv-empty">쪽을 그리는 중…</p></div>':formHtml(x)):'<div class="cv-writer"><p class="pv-empty">위의 ＋로 새 문항을 만들거나 번호를 고르세요.</p></div>';
    root.innerHTML=libHtml()+(panels.lib?splitHtml('left'):'')+`<section class="cv-center">${barHtml()}${center}</section>`+(panels.rightOpen?splitHtml('right'):'')+rightHtml();
    if(same&&panels.view==='card')root.querySelector('.cv-writer').scrollTop=keep;
    renderedFor=x?.id;
    if(panels.lib)api.dock?.(['standards','references'].includes(panels.tab)?panels.tab:null,root.querySelector('[data-cvbody="docked"]'));
    if(panels.lib&&['past','textbooks'].includes(panels.tab))renderPast();
    placeHwp(panels.rightOpen&&panels.right==='paper'&&!!x);
    if(panels.rightOpen&&panels.right==='ai'){renderAi();markAiSeen();}
    if(panels.view==='page')void renderPage();
    root.querySelector('.cv-qtab[aria-current="true"]')?.scrollIntoView?.({block:'nearest',inline:'nearest'});
    root.querySelectorAll('.cv-writer textarea').forEach(fit);
  }
  // 가운데 보기 전환: 한글 조판에서 나가면 한글 창을 닫는다(조판 저장은 창의 「조판 저장」으로).
  function setView(v){panels.view=v==='hwp'?'card':v;render();}
  // 한글 조판 창(5e_hwp)은 안에 편집기 프레임이 있어 DOM에서 옮기면 처음부터 다시 읽는다(문항 전환 15초).
  // 그래서 카드를 다시 그려도 지워지지 않는 층 하나에 한 번만 붙이고, 그 층을 미리보기 칸(#cv-hwp) 위에 겹쳐 둔다.
  const hwpLayer=document.createElement('div');hwpLayer.className='cv-hwp-layer';hwpLayer.hidden=true;document.body.append(hwpLayer);api.hwpDock?.(hwpLayer);// 편집기 프레임이 생기기 전에 붙여 둔다.
  let hwpSlotWatch=null,hwpWanted=false;
  function alignHwp(){const slot=root.querySelector('#cv-hwp');const show=hwpWanted&&slot&&!root.hidden&&!root.closest('[hidden]');hwpLayer.hidden=!show;if(!show)return;
    const r=slot.getBoundingClientRect();Object.assign(hwpLayer.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});}
  function placeHwp(show){hwpWanted=show;hwpSlotWatch?.disconnect();
    const slot=root.querySelector('#cv-hwp');if(show&&slot){hwpSlotWatch=new ResizeObserver(alignHwp);hwpSlotWatch.observe(slot);api.hwpDock?.(hwpLayer);api.hwpOpen?.();}else api.hwpClose?.();
    alignHwp();}
  new MutationObserver(alignHwp).observe(root,{attributes:true,attributeFilter:['hidden']});window.addEventListener('resize',alignHwp);
  function markAiSeen(){const x=q();if(x)store.set('aiSeen:'+x.id,(x.reviews||[]).length);}
  const fit=t=>{t.style.height='auto';t.style.height=Math.max(t.scrollHeight+2,44)+'px';};
  function refreshLight(){const x=q();if(!x)return;const c=root.querySelector('#cv-checks');if(c)c.innerHTML=checksHtml(completeness(x).items);if(panels.rightOpen&&panels.right==='paper')schedulePaper();
    const tabs=root.querySelector('.cv-qtabs');if(tabs){const sc=tabs.scrollLeft;tabs.outerHTML=tabsHtml();root.querySelector('.cv-qtabs').scrollLeft=sc;}}
  let paperTimer=0;const schedulePaper=()=>{clearTimeout(paperTimer);paperTimer=setTimeout(renderPaper,250);};
  // 미리보기: 실제 단 폭(86mm)으로 한 번 조판한 모양을 칸에 맞춰 확대·축소만 한다(폭이 바뀌어도 줄바꿈 그대로). 문항 하나를 스크롤 없이.
  async function renderPaper(){const x=q(),n=root.querySelector('#cv-paper');if(!x||!n)return;
    const {html,width}=await api.columnPreview(x);if(q()!==x||!n.isConnected)return;
    n.innerHTML=`<div class="cv-fitbox"><article class="cv-col" style="width:${width}px">${html}</article></div>`;fitPaper();}
  function fitPaper(){const n=root.querySelector('#cv-paper'),box=n?.querySelector('.cv-fitbox'),col=box?.firstElementChild;if(!col)return;
    col.style.transform='none';const W=col.offsetWidth,H=col.offsetHeight,aw=n.clientWidth-24,ah=n.clientHeight-24;if(!W||!H||aw<=0)return;
    const s=Math.max(.2,Math.min(aw/W,ah>40?ah/H:aw/W));col.style.transform=`scale(${s})`;box.style.width=W*s+'px';box.style.height=H*s+'px';}
  new ResizeObserver(()=>{fitPaper();fitPage();alignHwp?.();}).observe(root);
  // 쪽 전체: 시험지에 든 문항이면 그 시험지의 쪽 배치(2단)로, 보관함 문항이면 이 문항만 놓은 쪽으로 가운데에 크게 보여 준다.
  async function renderPage(){const x=q(),n=root.querySelector('#cv-page');if(!x||!n)return;
    const plan=await api.pagePlan(x);if(q()!==x||!n.isConnected)return;
    const cells=await Promise.all(plan.pages.map(async page=>Promise.all(page.columns.map(async col=>Promise.all(col.map(async id=>{const qq=api.find(id);if(!qq)return '';const {html,width}=await api.columnPreview(qq);return `<div class="pg-q${id===x.id?' now':''}" data-pgq="${id}"><div class="pg-qi" style="width:${width}px">${html}</div></div>`;}))))));
    if(q()!==x||!n.isConnected)return;
    n.innerHTML=`<div class="pg-head"><b>${E(plan.title)}</b><span>${plan.pages.length}쪽 · 실제 조판 비율(A4 2단) · 쪽 나눔은 조판 높이로 추정</span><span class="sp"></span><button type="button" class="mini" data-cvview="card">문항 카드로</button></div>`+
      plan.pages.map((page,p)=>`<figure class="pg-sheet"><div class="pg-cols">${cells[p].map(col=>`<div class="pg-col">${col.join('')}</div>`).join('')}</div><figcaption>${p+1} / ${plan.pages.length}</figcaption></figure>`).join('');
    fitPage();n.querySelector('.pg-q.now')?.scrollIntoView({block:'center'});}
  function fitPage(){const n=root.querySelector('#cv-page');if(!n)return;for(const col of n.querySelectorAll('.pg-col')){const w=col.clientWidth;for(const q of col.querySelectorAll('.pg-q')){const inner=q.firstElementChild;inner.style.transform='none';const s=w/inner.offsetWidth;inner.style.transform=`scale(${s})`;q.style.height=inner.offsetHeight*s+'px';}}}

  // 기출: 5E 라이브러리(기출 그림 3,961문항)를 과목·단원·연도·핵심어로 걸러 본다.
  // 5E 라이브러리 연결: 공유 폴더·자료팩·기출 PDF에서 쪽이나 영역을 골라 가져온다(5E 라이브러리 선택기).
  function libraryHtml(){
    const picks=api.libraryPicks?.()||[],textbook=panels.tab==='textbooks';
    return `<div class="lib5e"><p>${textbook?'교과서는':'기출은'} 5E 라이브러리(공유 폴더·자료팩·PDF)에서 고릅니다. 쪽이나 영역을 고르면 여기로 돌아옵니다.</p>
      <button type="button" class="btn go" data-cvlib="${textbook?'textbook':'past'}">${ICON.search}5E 라이브러리에서 고르기</button></div>
      ${picks.length?`<h4 class="lib5e-h">가져온 자료 ${picks.length}</h4><div class="lib5e-picks">${picks.map((p,i)=>`<figure class="lib5e-pick"><img src="${E(p.data)}" alt="${E(p.name)}"><figcaption><b>${E(p.source?.documentTitle||p.name)}</b><span>${p.source?.pageNumber?p.source.pageNumber+'쪽':''}${p.source?.title&&p.source.title!==p.source?.documentTitle?' · '+E(p.source.title):''}</span><span class="acts"><button type="button" class="mini" data-cvpick-link="${i}">근거로 연결</button><button type="button" class="mini" data-cvpick-slot="${i}">그림 칸에 넣기</button></span></figcaption></figure>`).join('')}</div>`:''}`;
  }
  // 기출 목록: 과학탐구 전체 기출(조사 색인 assets/exampool/convert/data). 과목 파일은 고를 때 읽는다(과목을 안 고르면 전부).
  // 카드 모양·필터·핵심어는 예전 그대로이고, 핵심어는 문항 본문 글까지 찾는다. 「변형」은 이 기출을 편집 가능한 한글 문항(AI 없음)으로 바꿔 새 카드로 연다.
  const F={id:0,year:1,month:2,no:3,page:4,box:5,pdfFile:6,parts:7,tags:8,hasFigure:9,record:10,text:11};
  const MONTH={'06':'6월 모평','09':'9월 모평','11':'수능'};
  async function loadPast(subjects){
    pastIndex||=await(pastIndexLoading||=fetch(new URL('../convert/data/index.json',import.meta.url)).then(r=>{if(!r.ok)throw Error();return r.json();}));
    const want=subjects.length?subjects:pastIndex.subjects.map(v=>v[0]),key=want.join(',');if(pastItems&&pastItemsKey===key)return pastItems;
    const lists=await Promise.all(want.map(code=>(loadPast.cache[code]||=fetch(new URL(`../convert/data/${code}.json`,import.meta.url)).then(r=>{if(!r.ok)throw Error();return r.json();})).then(rows=>rows.map(r=>({code,label:pastIndex.subjects.find(v=>v[0]===code)?.[1]||code,row:r})))));
    pastItems=lists.flat().map(({code,label,row})=>({id:row[F.id],subject:code,subjectLabel:label,year:row[F.year],month:row[F.month],no:row[F.no],page:row[F.page],box:row[F.box],pdfFile:row[F.pdfFile],publicPath:pastIndex.files[row[F.pdfFile]],parts:row[F.parts]||[],tags:row[F.tags]||[],hasFigure:!!row[F.hasFigure],record:row[F.record],text:row[F.text]||'',
      title:`${row[F.year]}학년도 ${MONTH[row[F.month]]||row[F.month]+'월'} ${label} ${row[F.no]}번`})).sort((a,b)=>b.year-a.year||String(a.month).localeCompare(String(b.month))||a.subject.localeCompare(b.subject)||(+a.no)-(+b.no));
    pastItemsKey=key;return pastItems;
  }
  loadPast.cache={};
  const pastItem=id=>pastItems?.find(v=>v.id===id);
  async function renderPast(){
    const body=root.querySelector('[data-cvbody="past"]');if(!body)return;
    if(panels.tab==='textbooks'){body.innerHTML=libraryHtml();return;}
    const typing=document.activeElement?.dataset?.cvpast==='query',f=pastFilter;
    let items;try{if(!pastItems)body.innerHTML='<p class="lp-count">기출 목록을 불러오는 중…</p>';
      await loadPast([]);const code=pastIndex.subjects.find(v=>v[1]===f.subject)?.[0];items=await loadPast(code?[code]:[]);}
    catch{body.innerHTML=libraryHtml()+'<p class="lp-count">기출 목록을 불러오지 못했습니다.</p>';pastIndexLoading=null;return;}
    if(!body.isConnected)return;
    const subjects=pastIndex.subjects.map(v=>v[1]),parts=[...new Set(items.flatMap(i=>i.parts))].sort(),years=[...new Set(items.map(i=>i.year))].sort((a,b)=>b-a);
    const words=f.query?f.query.split(/\s+/).filter(Boolean):[];
    const list=items.filter(i=>(!f.part||i.parts.includes(f.part))&&(!f.year||String(i.year)===String(f.year))&&(!words.length||words.every(w=>(i.title+' '+i.parts.join(' ')+' '+i.tags.join(' ')+' '+i.text).includes(w))));
    const total=pastIndex.subjects.reduce((n,v)=>n+v[2],0);
    const sel=(k,vals,label)=>`<select data-cvpast="${k}" aria-label="${label}"><option value="">${label}</option>${vals.map(v=>`<option${String(f[k])===String(v)?' selected':''}>${E(v)}</option>`).join('')}</select>`;
    const thumb=i=>{const card=pastIndex.cards.replace('{id}',encodeURIComponent(i.id)),local=i.hasFigure?new URL(`../../exam-library/images/${encodeURIComponent(i.id)}.png`,import.meta.url).href:'';
      return `<img loading="lazy" src="${E(card)}" alt="${E(i.title)}" data-past-thumb="${E(i.id)}" data-fallback="${E(local)}">`;};
    body.innerHTML=libraryHtml()+`<details class="lib-builtin"${store.get('builtinOpen',true)?' open':''}><summary>기출 문항 목록 · 과학탐구 ${total.toLocaleString()}문항</summary><div class="lp-filter">${sel('subject',subjects,'과목')}${sel('part',parts,'단원')}${sel('year',years,'연도')}</div>
      <label class="lp-search">${ICON.search}<input data-cvpast="query" value="${E(f.query)}" placeholder="핵심어·본문 단어 (예: 자기장, 오비탈)"></label>
      <p class="lp-count">기출 ${total.toLocaleString()}문항 중 <b>${list.length.toLocaleString()}</b>문항${list.length>40?' · 앞 40개':''}</p>
      <div class="past-list">${list.slice(0,40).map(i=>`<figure class="past">${thumb(i)}<figcaption><b>${E(i.title)}</b><span>${E([...i.parts,...i.tags].slice(0,3).join(' · '))}</span><span class="acts"><button type="button" class="mini" data-cvlink="${E(i.id)}">근거로 연결</button><button type="button" class="mini go-mini" data-cvconvert="${E(i.id)}" title="편집 가능한 한글 문항으로 바꿔 새 문항 카드로 엽니다(AI 없음)">변형</button></span></figcaption></figure>`).join('')}</div></details>`;
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
    body.innerHTML=`<div class="ai-scope" title="${E(x.number||'')}번 문항과 함께 설계·수정·검토합니다 · 변경안은 「적용」을 눌러야 문항에 들어갑니다"><b>${E(x.number||'')}번 문항</b>과 함께 설계·수정·검토합니다 · 변경안은 「적용」을 눌러야 문항에 들어갑니다</div>
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
    if(t.dataset.cvct){const [r,c]=t.dataset.cvct.split(':').map(Number);edit('choiceTable',()=>{x.choiceTable.cells[r][c].value=t.value;delete x.choiceTable.cells[r][c].raw;});return;}
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
  root.addEventListener('error',e=>{const img=e.target;if(!img?.dataset?.pastThumb)return;const fb=img.dataset.fallback;
    if(fb&&!img.src.includes(fb)){img.src=fb;return;}const p=document.createElement('p');p.className='past-text';p.textContent=(pastItem(img.dataset.pastThumb)?.text||'').slice(0,160);img.replaceWith(p);},true);
  root.addEventListener('toggle',e=>{if(e.target.matches?.('details.f-more'))store.set('more',e.target.open);if(e.target.matches?.('details.lib-builtin'))store.set('builtinOpen',e.target.open);},true);
  root.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;const x=q(),d=b.dataset;
    if(d.cvOpen){api.open(d.cvOpen);return;}
    if(d.cvtab){setPanel('tab',d.cvtab);return;}
    if(d.cvright){panels.rightOpen=true;store.set('rightOpen',true);setPanel('right',d.cvright);return;}
    if(d.cvview){setView(d.cvview);return;}
    if(d.cv==='to-page'){setView('page');return;}
    if(d.cv==='toggle-lib'){setPanel('lib',!panels.lib);return;}
    if(d.cv==='toggle-right'){setPanel('rightOpen',!panels.rightOpen);return;}
    if(d.cv==='new'){api.newQuestion();return;}
    if(d.cvlib){api.pickLibrary?.(d.cvlib);return;}
    if(d.cvpickLink!==undefined){api.libraryAction?.('link',Number(d.cvpickLink));return;}
    if(d.cvpickSlot!==undefined){api.libraryAction?.('slot',Number(d.cvpickSlot));return;}
    if(d.cvconvert){const i=pastItem(d.cvconvert);if(i)api.convertPast?.(i);return;}
    if(d.cvlink){const i=pastItem(d.cvlink);if(i&&x)api.edit(()=>{x.references.push({target:'question',label:i.title,quote:[...i.parts,...i.tags].join(', ')});});api.status?.(`${i?.title} 을(를) 근거로 연결했습니다.`);return;}
    if(!x)return;
    if(d.cv==='shape'){setShape(!shapeOpen);if(shapeOpen)root.querySelector('.cv-shape-menu [aria-checked="true"]')?.focus();return;}
    if(d.cvform){const k=d.cvform;setShape(false);if(k===formOf(x))return;
      const lost=formLosses(x,k);if(lost.length){const n=lost.reduce((s,b)=>s+b.lines.filter(l=>l.text.trim()).length,0);if(!confirm(`${FORMS[k].name}(으)로 바꾸면 ${lost[0].kind==='bogi'?'보기':'대화'} ${n}줄을 지웁니다. 바꿀까요?`))return;}
      api.edit(()=>applyForm(x,k));api.status?.(`${FORMS[k].name}(으)로 바꿨습니다.`);return;}
    if(d.cvstage){api.edit(()=>{x.workflow=d.cvstage;});return;}
    if(d.cvslotAct){api.slot(d.cvslotAct,x,d.cvslot);return;}
    if(d.cvlineAdd){const key=d.cvlineAdd;api.edit(()=>{let blk=x.blocks.find(v=>v.kind===key);if(!blk){writeField(x,key,'');blk=x.blocks.find(v=>v.kind===key);}const value=fieldValue(x,key);writeField(x,key,value?value+'\n':key==='dialogue'?'학생 A: ':'');});return;}
    if(d.cvlineRemove){const key=d.cvlineRemove,i=Number(d.i);api.edit(()=>{const blk=x.blocks.find(v=>v.kind===key);blk.lines.splice(i,1);if(key==='bogi'){const L=['ㄱ','ㄴ','ㄷ','ㄹ','ㅁ','ㅂ','ㅅ','ㅇ'];blk.lines.forEach((l,j)=>l.label=L[j]||String(j+1));}else if(key==='steps'){const C=['(가)','(나)','(다)','(라)','(마)','(바)','(사)','(아)'];blk.lines.forEach((l,j)=>l.label=C[j]||`(${j+1})`);}});return;}
    if(d.cvcombo!==undefined){const i=Number(d.cvcombo),letter=d.letter;api.edit(()=>{const set=new Set(x.choices[i].text.split(/\s*,\s*/).filter(Boolean));set.has(letter)?set.delete(letter):set.add(letter);const order=(bogiOf(x)?.lines||[]).map(l=>l.label);x.choices[i].text=normalizeCombo([...set].sort((a,b)=>order.indexOf(a)-order.indexOf(b)).join(', '));});return;}
    if(d.cv==='common-combos'){api.edit(()=>{x.choices.forEach((c,i)=>c.text=COMMON[i]);});return;}
    if(d.cvlayout!==undefined){api.edit(()=>{if(d.cvlayout)x.choiceLayout=d.cvlayout;else delete x.choiceLayout;});return;}
    if(d.cv==='open-standards'){panels.lib=true;store.set('lib',true);setPanel('tab','standards');return;}
    if(d.cv==='sheet'){api.sheet();return;}
    if(d.cvctCol){const add=Number(d.cvctCol)>0;api.edit(()=>{const t=x.choiceTable;if(add&&t.cols<6){t.cells.forEach(r=>r.push({value:''}));t.cols++;}else if(!add&&t.cols>1){t.cells.forEach(r=>r.pop());t.cols--;t.merges=t.merges.filter(m=>m.c+m.cs<=t.cols);}});return;}
    if(d.cv==='typeset'){api.typeset();return;}
    if(d.cv==='review'){panels.rightOpen=true;store.set('rightOpen',true);panels.right='ai';store.set('right','ai');render();api.ai(x,{kind:'review',text:'검토해 줘'});return;}
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
  // 유형 메뉴: 바깥을 누르거나 Esc면 닫는다.
  document.addEventListener('pointerdown',e=>{if(shapeOpen&&!e.target.closest?.('.cv-shape-wrap'))setShape(false);});
  root.addEventListener('keydown',e=>{if(shapeOpen&&e.key==='Escape'){e.preventDefault();setShape(false);root.querySelector('.cv-shape')?.focus();}});
  root.addEventListener('keydown',e=>{if(e.target.id==='cv-ai-input'&&e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();root.querySelector('[data-cv="ai-send"]')?.click();}});
  // 칸 경계 끌기: 왼쪽 경계는 라이브러리 폭, 오른쪽 경계는 미리보기·AI 폭. 두 번 누르면 기본 폭.
  root.addEventListener('pointerdown',e=>{const sp=e.target.closest('.cv-split');if(!sp)return;e.preventDefault();sp.setPointerCapture(e.pointerId);sp.classList.add('drag');document.body.classList.add('cv-dragging');
    const k=sp.dataset.cvsplit,rect=root.getBoundingClientRect(),min=k==='left'?240:300,max=Math.max(min,rect.width-440-(k==='left'?(panels.rightOpen?root.querySelector('.cv-right').offsetWidth:0):(panels.lib?root.querySelector('.cv-left').offsetWidth:0)));
    // 잡은 곳에서 움직인 만큼만 폭을 바꾼다(바깥 여백이 있어도 잡는 순간 칸이 튀지 않음).
    const x0=e.clientX,w0=root.querySelector(k==='left'?'.cv-left':'.cv-right').getBoundingClientRect().width;
    const move=ev=>{const w=Math.round(Math.max(min,Math.min(max,k==='left'?w0+ev.clientX-x0:w0-(ev.clientX-x0))));root.style.setProperty(k==='left'?'--cv-lw':'--cv-rw',w+'px');fitPaper();};
    const up=ev=>{sp.classList.remove('drag');document.body.classList.remove('cv-dragging');sp.removeEventListener('pointermove',move);sp.removeEventListener('pointerup',up);store.set(k==='left'?'lw':'rw',parseInt(getComputedStyle(root).getPropertyValue(k==='left'?'--cv-lw':'--cv-rw')));fitPaper();fitPage();};
    sp.addEventListener('pointermove',move);sp.addEventListener('pointerup',up);});
  root.addEventListener('dblclick',e=>{const sp=e.target.closest('.cv-split');if(!sp)return;store.set(sp.dataset.cvsplit==='left'?'lw':'rw',null);render();});
  // 한글 창에서 고친 글을 카드 칸에 옮긴다(입력 중인 칸은 건드리지 않는다). 카드 전체를 다시 그리지 않아 한글 창 입력이 끊기지 않는다.
  function syncFields(target){const x=q();if(!x||x!==target)return;
    for(const t of root.querySelectorAll('[data-cvf]')){if(t===document.activeElement)continue;const f=t.dataset.cvf;
      const v=f==='passage'?(x.blocks.find(b=>b.kind==='text')?.text||''):f==='answer'?(x.modelAnswer||''):f==='points'?String(x.points??''):String(x[f]??'');
      if(t.value!==v){t.value=v;if(t.tagName==='TEXTAREA')fit(t);}}
    refreshLight();}
  return {render,refreshLight,setView,syncFields,refreshLibrary(){if(panels.lib&&['past','textbooks'].includes(panels.tab))renderPast();},showHwp(){panels.rightOpen=true;panels.right='paper';store.set('rightOpen',true);store.set('right','paper');render();},refreshAi(){if(panels.rightOpen&&panels.right==='ai'){renderAi();markAiSeen();}else{const r=root.querySelector('.cv-rseg [data-cvright="ai"]');if(r&&q()){const n=unseenAi(q());r.querySelector('.badge')?.remove();if(n)r.insertAdjacentHTML('beforeend',`<i class="badge">${n}</i>`);}}},showAi(){panels.rightOpen=true;store.set('rightOpen',true);panels.right='ai';store.set('right','ai');render();},toggleNav(){setPanel('nav',!panels.nav);},get navOpen(){return panels.nav;},get tab(){return panels.tab;}};
}
