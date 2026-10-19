// 새 문항 창: ① 유형 → ② 자료 구조, 클릭 2번으로 문항 틀을 확정한다. 배치는 자동.
// 승인된 시안(5e-design-mockups/new-question.html)과 같은 동작: 빈도순 정렬·추천 2개·물음표로 설명과 비율·마우스를 올리면 예시 문항과 '엑셀에서 채울 칸' 강조.
import {SUBJECTS,FORMS,STRUCTS,rankForms,rankStructs,sameShape,autoLayout,sheetCells} from './templates.js';
import {previewHtml} from './new-question-preview.js';

const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// 문항 틀을 줄여 그린 선 그림(24칸·선 1.3). 문자 기호는 쓰지 않는다.
export const SHAPE_ICONS={
  combo:'<path d="M4 4h12"/><rect x="4" y="8" width="16" height="9" rx=".8"/><path d="M7 11h7M7 14h5M4 20.5h3M10 20.5h3M16 20.5h4"/>',
  single:'<path d="M4 4h14M4 7.5h10"/><path d="M4 13h2M8.5 13h2M13 13h2M17.5 13h2.5"/><path d="M4 18h16" opacity=".4"/>',
  pair:'<path d="M4 4h12"/><path d="M8 9h2.5M12.5 9h2.5M17 9h2.5"/><path d="M4 13h1.5M8 13h2.5M12.5 13h2.5M17 13h2.5M4 17h1.5M8 17h2.5M12.5 17h2.5M17 17h2.5"/>',
  talk:'<path d="M4 4h12"/><path d="M4 9h10v5H8l-2.5 2v-2H4z"/><path d="M10 15.5h10v4.5h-1.5V22l-2.5-2H10z"/>',
  essay:'<path d="M4 4h14M4 7.5h10"/><rect x="4" y="11" width="16" height="9" rx=".8"/><path d="M7 14.5h10M7 17h6"/>',
  small:'<path d="M4 5h9M4 8.5h9M4 12h9M4 15.5h9M4 19h16"/><rect x="15" y="4" width="5" height="12" rx=".6"/>',
  big:'<path d="M4 4h16M4 7.5h12"/><rect x="4" y="11" width="16" height="9" rx=".8"/>',
  two:'<path d="M4 4h16M4 7.5h11"/><rect x="4" y="11" width="7" height="9" rx=".8"/><rect x="13" y="11" width="7" height="9" rx=".8"/>',
  many:'<path d="M4 4h16M4 7.5h11"/><rect x="3" y="11" width="5" height="9" rx=".6"/><rect x="9.5" y="11" width="5" height="9" rx=".6"/><rect x="16" y="11" width="5" height="9" rx=".6"/>',
  condition:'<path d="M4 4h16"/><rect x="4" y="8" width="16" height="12" rx=".8"/><path d="M7 11.5h10M7 14.5h10M7 17.5h6"/>',
  experiment:'<rect x="4" y="4" width="16" height="16" rx=".8"/><path d="M7 7h6M7 9.5h9"/><rect x="7" y="13" width="10" height="5"/><path d="M7 15.5h10M12 13v5"/>',
  none:'<path d="M4 5h16M4 9h16M4 13h16M4 17h10"/>'
};
const HELP='<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.6a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.1-2.4 3.4"/><path d="M12 17h.01" stroke-width="2.2"/></svg>';
const CHECK='<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" style="width:12px;height:12px;stroke-width:2.4"><path d="m5 12 5 5 9-10"/></svg>';
const thumb=k=>`<span class="nq-thumb"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${SHAPE_ICONS[k]}</svg></span>`;
const pct=(n,d)=>d?n/d*100:0,fmt=v=>v.toFixed(1);

export function createNewQuestionDialog(dialog,{onCreate}){
  dialog.innerHTML=`<header class="nq-head"><h2 id="nq-title">새 문항</h2><div class="nq-crumbs" data-nq="crumbs"></div><div class="nq-spacer"></div><button type="button" class="nq-tool nq-icon" data-nq="close" aria-label="닫기"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header>
<section class="nq-col" data-nq="steps"></section>
<section class="nq-preview"><div class="nq-pv"><div class="nq-preview-head"><span>예시 문항</span><span data-nq="match"></span></div><div data-nq="paper"></div><div class="nq-sources" data-nq="sources"></div></div></section>
<aside class="nq-cells"><h3>문항 카드에서 채울 칸</h3><p class="nq-muted">틀을 확정하면 이 칸만 흰색으로 열립니다. ①·ㄱ. 같은 번호는 적지 않습니다.</p><div class="nq-sheet" data-nq="sheet"></div></aside>
<footer class="nq-foot"><div class="nq-summary" data-nq="summary"></div><div class="nq-spacer"></div><button type="button" class="nq-tool" data-nq="reset">처음부터</button><button type="button" class="nq-go" data-nq="go" disabled><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 10h16M4 15h16M10 4v16"/></svg>엑셀에서 작성 <span class="nq-kbd">Enter</span></button></footer>`;
  dialog.setAttribute('aria-labelledby','nq-title');
  const part=k=>dialog.querySelector(`[data-nq="${k}"]`);
  const pick={form:null,struct:null},info={form:false,struct:false};let hover=null;const subject='all';

  function optHtml(step,o,label,desc,total){
    const p=pct(o.n,total);
    return `<button type="button" class="nq-opt" data-step="${step}" data-k="${o.k}" aria-pressed="${pick[step]===o.k}">${thumb(o.k)}<span class="nq-opt-text"><span class="nq-opt-name">${E(label)}${o.rec?'<span class="nq-rec">추천</span>':''}</span><span class="nq-opt-desc">${E(desc)} · ${o.n.toLocaleString()}문항</span></span><span class="nq-stat"><span class="nq-bar"><i style="width:${Math.min(100,p)}%"></i></span><b>${fmt(p)}%</b></span></button>`;
  }
  function stepHtml(n,key,title,state,context,body,note=''){
    const names=key==='form'?FORMS:STRUCTS;
    return `<div class="nq-step" data-step-key="${key}" data-state="${state}" data-info="${info[key]}"><div class="nq-step-head"><span class="nq-num">${state==='done'?CHECK:n}</span><span class="nq-step-title">${title}</span><span class="nq-step-value">${pick[key]?E(names[pick[key]].name):''}</span><button type="button" class="nq-help" data-help="${key}" aria-pressed="${info[key]}" aria-label="${title} 설명과 비율 보기" title="설명과 비율 보기">${HELP}</button></div><div class="nq-context">${context}</div><div class="nq-opts">${body}</div>${note}</div>`;
  }
  function render(){
    const forms=rankForms(subject);
    const s1=stepHtml(1,'form','유형',pick.form?'done':'now',`${SUBJECTS[subject]} <b>${forms.total.toLocaleString()}문항</b> 기준, 많은 순서. 선지는 유형에 따라 자동으로 정해집니다.`,
      forms.list.map(o=>optHtml('form',o,FORMS[o.k].name,FORMS[o.k].desc,forms.total)).join(''));
    const structs=rankStructs(subject,pick.form);
    const s2=stepHtml(2,'struct','자료 구조',pick.struct?'done':pick.form?'now':'wait',
      pick.form?`${FORMS[pick.form].name} <b>${structs.total.toLocaleString()}문항</b> 중 자료가 들어가는 형태, 많은 순서`:'유형을 고르면 그 유형 안의 비율로 다시 정렬됩니다.',
      structs.list.map(o=>optHtml('struct',o,STRUCTS[o.k].name,STRUCTS[o.k].desc,structs.total)).join(''),
      '<p class="nq-note">배치는 자동입니다(가장 많이 쓰인 배치). 바꾸려면 만든 뒤 한글 창에서 자료를 끌어 옮깁니다. 목록 밖 모양(본문 표 2개, 그림 선지, 선지 표 칸 그림)은 구성 편집에서 바꿉니다.</p>');
    part('steps').innerHTML=s1+s2;
    renderPreview();
    // 단계 칸을 다시 그리면 눌렀던 단추가 사라져 초점이 창 밖으로 빠졌다(숫자·Backspace·Enter가 더 안 먹음). 다음에 고를 곳으로 옮긴다.
    if(dialog.open&&!dialog.contains(document.activeElement)){const next=pick.form&&pick.struct?part('go'):dialog.querySelector(`.nq-opt[data-step="${pick.form?'struct':'form'}"]`);next?.focus({preventScroll:true});}
  }
  function current(){const s={type:pick.form,struct:pick.struct};if(hover)s[hover.step==='form'?'type':'struct']=hover.k;s.layout=autoLayout(subject,s.type,s.struct);return s;}
  function renderPreview(){
    const s=current(),hl=hover?(hover.step==='form'?'type':'struct'):null;
    part('paper').innerHTML=previewHtml(s,hl);
    part('sheet').innerHTML=s.type?sheetCells(s.type,s.struct).map(([k,v,g])=>`<div class="${hl&&g===hl?'hl':''}"><span>${E(k)}</span><span>${E(v)}</span></div>`).join(''):'';
    const all=rankForms(subject).total,same=s.type&&s.struct?sameShape(subject,s.type,s.struct):[];
    part('match').textContent=same.length?`같은 모양 기출 ${same.length}문항 (${fmt(pct(same.length,all))}%)`:'';
    const ex=same.slice().sort((a,b)=>b[6].localeCompare(a[6],'ko')).slice(0,3).map(r=>`${SUBJECTS[r[0]]} ${r[6]}`);
    part('sources').innerHTML=ex.length?`<b>같은 모양 기출</b> ${E(ex.join(' · '))}${same.length>3?` 외 ${same.length-3}문항`:''}`:'';
    part('crumbs').innerHTML=[['form',FORMS,'유형'],['struct',STRUCTS,'자료 구조']].map(([k,m,t])=>`<span data-on="${!!pick[k]}">${E(pick[k]?m[pick[k]].name:t)}</span>`).join('<span aria-hidden="true">/</span>');
    const done=pick.form&&pick.struct;part('go').disabled=!done;
    part('summary').innerHTML=done?`<b>${E(FORMS[pick.form].name)} · ${E(STRUCTS[pick.struct].name)}</b> · 2번 클릭으로 확정 · 배치 자동`:`${(pick.form?1:0)+(pick.struct?1:0)} / 2 선택 · 유형과 자료 구조만 고르면 됩니다`;
  }
  const create=()=>{if(pick.form&&pick.struct&&onCreate({form:pick.form,struct:pick.struct,subject})!==false)dialog.close();};
  dialog.addEventListener('click',e=>{
    const h=e.target.closest('.nq-help');if(h){info[h.dataset.help]=!info[h.dataset.help];render();return;}
    const b=e.target.closest('.nq-opt');if(b){pick[b.dataset.step]=b.dataset.k;hover=null;render();return;}
    if(e.target.closest('[data-nq="close"]'))dialog.close();
    if(e.target.closest('[data-nq="reset"]')){pick.form=pick.struct=null;hover=null;render();}
    if(e.target.closest('[data-nq="go"]'))create();
  });
  // 왼쪽 버튼은 다시 그리지 않아 클릭이 끊기지 않는다. 예시와 칸 안내만 바꾼다.
  dialog.addEventListener('mouseover',e=>{const b=e.target.closest('.nq-opt'),next=b?{step:b.dataset.step,k:b.dataset.k}:null;if(JSON.stringify(next)!==JSON.stringify(hover)){hover=next;renderPreview();}});
  dialog.addEventListener('keydown',e=>{
    if(e.target.tagName==='SELECT'||e.metaKey||e.ctrlKey||e.altKey)return;
    if(/^[1-9]$/.test(e.key)){dialog.querySelectorAll(`.nq-opt[data-step="${pick.form?'struct':'form'}"]`)[Number(e.key)-1]?.click();e.preventDefault();}
    else if(e.key==='Backspace'){if(pick.struct)pick.struct=null;else pick.form=null;render();e.preventDefault();}
    else if(e.key==='Enter'&&pick.form&&pick.struct&&!e.target.closest('[data-nq="close"],[data-nq="reset"],.nq-help')){create();e.preventDefault();}
  });
  return {open(){pick.form=pick.struct=null;hover=null;render();dialog.showModal();dialog.querySelector('.nq-opt')?.focus();},get pick(){return {...pick,subject};}};
}
