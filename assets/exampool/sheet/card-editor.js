// 문항 카드: 문항 하나를 인쇄 순서대로 쓰는 입력 화면(밝은 종이 위 상자). 왼쪽은 시험지·보관함 문항 목록,
// 오른쪽은 라이브러리(기출·교과서·기준·자료·지면·AI). 엑셀형 표는 시험지의 '전체 표'로만 남긴다.
import {WORKFLOWS,KINDS,formOf,formLosses,applyForm} from './model.js';
import {FORMS,STRUCTS} from './templates.js';
import {fieldValue,writeField} from './vertical.js';
import {normalizeCombo} from './choice-text.js';
import {workflowOf,previewHtml,questionSubtitle} from './views.js';
import {AXES,AXIS_LABEL,JUDGEMENT_LABEL} from '../authoring/schema.js';
import {labelOf} from '../authoring/session.js';
import {croppedPastImage} from './past-crop.js';
import {markedQuestion,croppedQuestion,renderPage as renderPdfPage,pdfHref} from './past-pdf.js';

import {F,MONTH,shortTitle,norm,splitWords,pastScore} from './past-search.js';
import {busyHtml,pastBusyHtml,E,NUM,COMMON,COMBO_STATS,ICON,TABS,slotsOf,STRUCT_SHORT,shapeIco,CHEV,CHECK,bogiOf,isCombo,CHANNEL,store} from './card-shared.js';

// 완성 조건: 발문·자료(그림/표가 모두 찬 자리)·보기(합답형)·선지·정답. 모두 차면 AI 검토를 요청할 수 있다.
export function completeness(q){
  const slots=slotsOf(q),filled=slots.filter(b=>b.kind==='table'?b.table.cells.flat().some(c=>c.value||c.figure):!!b.figure).length;
  const bogi=bogiOf(q),lines=bogi?bogi.lines.filter(l=>l.text.trim()).length:0;
  const choices=q.style==='대응표'?5:q.choices.filter(c=>c.text.trim()||c.figure).length;
  const items=[['발문',!!q.ask.trim(),''],['자료',filled===slots.length,slots.length?`${filled}/${slots.length}`:''],...(isCombo(q)?[['보기',!!bogi&&lines===bogi.lines.length&&lines>0,bogi?`${lines}/${bogi.lines.length}`:'']]:[]),['선지',choices===5,`${choices}/5`],['정답',q.type==='서술형'?!!q.modelAnswer.trim():q.answer!==null,'']];
  return {items,done:items.every(x=>x[1])};
}

export function createCardEditor(root,api){
  const panels={nav:store.get('nav',true),lib:true/* 참고 자료 칸은 ExamPool을 열 때마다 열린 채로 시작(쓰는 동안 접는 것은 그대로) */,tab:TABS.some(([k])=>k===store.get('tab','past'))?store.get('tab','past'):'past',right:store.get('right','paper'),rightOpen:store.get('rightOpen',true),view:'card'};
  let pastIndex=null,pastIndexLoading=null,pastItems=null,pastItemsKey='',pastFilter=store.get('past',{subject:'',part:'',year:'',query:'',tokens:[]}),pastSyn=null,pastRefocus=false,pastAdvOpen=false,pastZoom=-1,pastZoomKey='',books=null,srcQuery=store.get('srcq',{standards:'',references:''}),pastComposing=false,pastEnterPending=false,renderedFor=null;
  if(!Array.isArray(pastFilter.tokens))pastFilter.tokens=[];
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
    const ox=(l,i)=>key!=='bogi'?'':`<span class="ox" role="group" aria-label="${E(l.label)} 옳음·틀림"><button type="button" class="o" data-cvtruth="${i}" data-v="1" aria-pressed="${l.truth===true}" title="옳은 보기">○</button><button type="button" class="x" data-cvtruth="${i}" data-v="0" aria-pressed="${l.truth===false}" title="틀린 보기">×</button></span>`;
    const x=q(),ev=l=>key!=='bogi'||!x?'':evChip(x,l.id)||(l.truth===true?evMiss():'');
    return `<div class="rows">${b.lines.map((l,i)=>`<div class="ig${key==='bogi'&&l.truth!==undefined?(l.truth?' t-o':' t-x'):''}${key==='bogi'&&l.truth===true&&x&&!refsOf(x,l.id).length?' ev-need':''}"><span>${E(key==='bogi'?l.label:l.label)}</span><textarea data-cvline="${key}" data-i="${i}" rows="1" placeholder="${E(ph)}" aria-label="${E(l.label)}">${E(l.text)}</textarea>${ev(l)}${ox(l,i)}<button type="button" class="ig-x" data-cvline-remove="${key}" data-i="${i}" title="이 줄 지우기" aria-label="이 줄 지우기">×</button></div>`).join('')}
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
      // 선지(시안 32): ㄱㄴㄷ 단추 줄 대신 한 줄 5칸에 바로 쓰고, 기출 통계 상위 조합을 눌러 채운다. 보기 ○×가 다 정해지면 옳은 것만 모은 조합이 정답으로 표시된다.
      const right=comboRight(x),ri=right?x.choices.findIndex(c=>normalizeCombo(c.text)===right):-1;
      const sugg=COMBO_STATS.top.map(([set,pct],k)=>`<button type="button" class="cv-sugg" data-cvcombofill="${k}" title="평가원 과학탐구 기출 〈보기〉 문항 ${COMBO_STATS.n.toLocaleString()}개 중 ${pct}%가 이 조합">${set.map(v=>E(v.replace(/,\s*/g,''))).join('/')}<em>${pct}%</em></button>`).join('');
      const note=right===null?'':ri>=0?`<p class="cv-autoans ok">옳은 보기 ${E(right)} → 정답 ${NUM[ri]}${x.answer===ri?'':' (동그라미를 맞춰 주세요)'}</p>`:`<p class="cv-autoans bad">${right?`옳은 보기 조합 「${E(right)}」이 선지에 없습니다`:'옳은 보기가 하나도 없습니다'}</p>`;
      return `<div class="f-field cv-row"><label data-tip="자주 쓰는 조합은 평가원 과학탐구 기출 〈보기〉 문항 ${COMBO_STATS.n.toLocaleString()}개에서 센 비율입니다. 보기의 ○·×를 다 정하면 정답 선지가 자동으로 표시됩니다." tabindex="0" aria-label="선지"><span class="vt">선지</span></label><div class="cv-v">
        <div class="cv-suggs"><span>추천</span>${sugg}</div>
        <div class="cv-combos">${x.choices.map((c,i)=>`<label class="combo-row${x.answer===i?' on':''}${ri===i?' right':''}"><input type="radio" name="cv-ans" data-cvans="${i}" ${x.answer===i?'checked':''} aria-label="${NUM[i]} 정답"><span class="no">${NUM[i]}</span><input data-cvchoice="${i}" value="${E(c.text)}" placeholder="—" aria-label="${NUM[i]} 조합">${evChip(x,c.id)||(x.answer===i?evMiss():'')}</label>`).join('')}</div>${note}</div></div>`;
    }
    const lay=x.choiceLayout||'';
    return `<div class="f-field"><label title="값·식·낱말·문장을 한 줄씩 · 동그라미로 정답">선지<span class="lay">${[['','자동'],['한 줄','한 줄'],['2열','2열'],['세로','세로']].map(([v,t])=>`<button type="button" class="link" data-cvlayout="${v}" aria-pressed="${lay===v}">${t}</button>`).join('')}</span></label>
      <div class="rows">${x.choices.map((c,i)=>`<label class="ig choice-row${x.answer===i?' on':''}"><input type="radio" name="cv-ans" data-cvans="${i}" ${x.answer===i?'checked':''}><span>${NUM[i]}</span><input data-cvchoice="${i}" value="${E(c.text)}" placeholder="${NUM[i]} 선지">${evChip(x,c.id)||(x.answer===i?evMiss():'')}</label>`).join('')}</div></div>`;
  }
  // 단원 자동(시안 35): 성취기준 코드 → 교육과정 자료의 대단원(「과목 › 대단원」). 자료에 중단원은 없어 중단원은 선택 입력.
  let stdData=null;fetch(new URL('../standards.json',import.meta.url)).then(r=>r.ok?r.json():null).then(d=>{stdData=d;if(q()?.standardCode&&!q()?.unitLarge)render();}).catch(()=>{});
  function unitOf(code){const s=stdData?.standards?.find(v=>v.code===code),u=s&&stdData.units?.find(v=>v.unit_no===s.unit_no);return u?`${s.subject} › ${u.name}`:'';}
  const SOURCES=['자체 제작','교과서','기출 변형','기타'];
  function sourceKind(x){const s=String(x.source||'');const k=SOURCES.find(v=>s.startsWith(v));if(k)return k;const orig=(x.references||[]).find(r=>/^원본 기출 · /.test(r.label));if(orig&&(!s||orig.label.endsWith(s)))return '기출 변형';return s?'기타':'';}
  // 문항관리번호(비어 있으면 「연도-과목-번호」로 제안): 과목은 단원 앞 글자, 없으면 「과학」.
  const autoManage=x=>`${new Date().getFullYear()}-${(x.unitLarge||unitOf(x.standardCode)||'과학').split(' › ')[0].replace(/\s+/g,'').slice(0,4)}-${String(x.number||'').padStart(2,'0')}`;
  // 해설 뼈대: 정답 + 보기마다 옳음·틀림과 연결한 근거 인용문. 이미 쓴 해설이 있으면 그 아래에 붙인다.
  function explanationSkeleton(x){const lines=[];if(Number.isInteger(x.answer)&&x.choices?.[x.answer])lines.push(`정답 ${NUM[x.answer]} ${x.choices[x.answer].text||''}`.trim());
    for(const l of bogiOf(x)?.lines||[]){const r=refsOf(x,l.id)[0]?.[0];lines.push(`${l.label}. ${l.truth===true?'(옳음) ':l.truth===false?'(틀림) ':''}${r?.quote?r.quote+' — '+r.label:''}`.trimEnd());}
    return lines.join('\n');}
  // 근거 표시(시안 34): 근거가 걸린 칸 옆 🔗N(올리면 출처·인용문, 누르면 그 쪽), 옳은 보기·정답 선지에 근거가 없으면 「근거 없음」.
  const refsOf=(x,t)=>(x.references||[]).map((r,i)=>[r,i]).filter(([r])=>r.target===t);
  function evChip(x,t){const rs=refsOf(x,t);if(!rs.length)return '';
    return `<button type="button" class="ev-chip" data-cvref="${rs[0][1]}" aria-label="근거 ${rs.length}개 · 눌러서 그 쪽 열기">${ICON.link}${rs.length}<span class="ev-tip" aria-hidden="true">${rs.map(([r])=>`<b>${E(r.label)}</b>${r.quote?`<q>${E(r.quote.slice(0,160))}${r.quote.length>160?'…':''}</q>`:''}${r.note?`<small>메모: ${E(r.note)}</small>`:''}`).join('')}<em>${rs[0][0].source?.path?'눌러서 그 쪽 열기 ›':''}</em></span></button>`;}
  const evMiss=()=>'<span class="ev-miss" title="옳은 보기·정답 선지에는 근거를 걸어 두세요 — 교과서·기출 쪽에서 글을 끌어 고르면 됩니다">근거 없음</span>';
  function evMissing(x){const out=[];(bogiOf(x)?.lines||[]).forEach(l=>{if(l.truth===true&&!refsOf(x,l.id).length)out.push('보기 '+l.label+'(옳음)');});
    if(Number.isInteger(x.answer)&&x.choices?.[x.answer]&&!refsOf(x,x.choices[x.answer].id).length)out.push('정답 '+NUM[x.answer]);return out;}
  // 보기 ○×가 모두 정해졌으면 옳은 것만 모은 조합(「ㄱ, ㄷ」), 하나라도 비었으면 null.
  function comboRight(x){const ls=bogiOf(x)?.lines||[];if(!ls.length||ls.some(l=>l.truth!==true&&l.truth!==false))return null;return normalizeCombo(ls.filter(l=>l.truth).map(l=>l.label).join(', '));}
  let shapeOpen=false;
  function shapeHtml(x){
    const f=formOf(x),st=STRUCTS[x.structure]?x.structure:null;
    const menu=shapeOpen?`<div class="cv-shape-menu" role="menu" aria-label="유형 바꾸기"><div class="m-head">유형 <span>보기·선지 칸만 바뀌고 쓴 글은 남습니다</span></div>${Object.entries(FORMS).map(([k,v])=>`<button type="button" role="menuitemradio" aria-checked="${k===f}" data-cvform="${k}">${shapeIco(k)}<span class="n">${E(v.name)}</span><span class="d">${E(v.desc)}</span>${k===f?CHECK:''}</button>`).join('')}</div>`:'';
    return `<div class="cv-shape-wrap"><button type="button" class="cv-shape" data-cv="shape" aria-haspopup="menu" aria-expanded="${shapeOpen}" title="새 문항 창에서 정한 틀 · 눌러서 유형 바꾸기">${shapeIco(f)}<b>${E(FORMS[f].name)}</b>${st?`<span class="st">${E(STRUCT_SHORT[st])}</span>`:''}${CHEV}</button>${menu}</div>`;
  }
  function setShape(open){if(shapeOpen===open)return;shapeOpen=open;const w=root.querySelector('.cv-shape-wrap'),x=q();if(w&&x)w.outerHTML=shapeHtml(x);if(open)fitShapeMenu();}
  // 좁은 카드 칸에서 메뉴가 칸 밖으로 나가 잘리지 않게: 칸 폭에 맞추고, 넘치면 왼쪽으로 당긴다.
  function fitShapeMenu(){const m=root.querySelector('.cv-shape-menu'),col=root.querySelector('.cv-writer')?.getBoundingClientRect();if(!m||!col)return;
    const room=col.width-16;if(m.offsetWidth>room)m.style.width=room+'px';
    const r=m.getBoundingClientRect(),over=r.right-(col.right-8);if(over>0)m.style.left=-Math.min(over,r.left-(col.left+8))+'px';}
  // 문항 카드(시안 32): 엑셀처럼 왼쪽 이름표 칸 + 오른쪽 내용, 안내 글은 ? 도움말 안, 입력칸은 내용 높이만큼, 배점은 맨 위(설계할 때 정함).
  const help=(t,l='도움말')=>`<button type="button" class="help" aria-label="${E(l)}" data-tip="${E(t)}">?</button>`;
  function formHtml(x){
    const bogi=bogiOf(x),steps=x.blocks.find(b=>b.kind==='steps'),talk=x.blocks.find(b=>b.kind==='dialogue');
    const passages=x.blocks.filter(b=>b.kind==='text');
    const {items,done}=completeness(x);
    // 이름표(시안 33): 두 글자는 세로로(지/문), 네 글자는 두 글자씩 두 줄(성취/기준). 안내는 이름표에 마우스를 올리면.
    const tag=n=>{const t=n.replace(/\s+/g,'');return t.length<=2?`<span class="vt">${E(t)}</span>`:`<span class="hz">${E(t.slice(0,2))}<br>${E(t.slice(2))}</span>`;};
    const row=(name,body,tip='',cls='',target='')=>`<div class="f-field cv-row${cls?' '+cls:''}"><label${tip?` data-tip="${E(tip)}" tabindex="0"`:''} aria-label="${E(name)}">${tag(name)}${target?evChip(x,target):''}</label><div class="cv-v">${body}</div></div>`;
    const missing=evMissing(x),refs=x.references||[];
    const evTable=refs.length||missing.length?`<table class="cv-evtab">${refs.map((r,i)=>`<tr data-cvrefrow="${i}"><td class="who"><span>${E(evTargetName(x,r.target))}</span></td><td class="src">${r.source?.path?`<button type="button" class="link" data-cvref="${i}" title="그 쪽 열기">${E(r.label)}</button>`:E(r.label)}</td><td class="q">${r.quote?`<q>${E(r.quote.slice(0,200))}${r.quote.length>200?'…':''}</q>`:'<span class="ph">쪽 전체</span>'}${r.note?`<small>${E(r.note)}</small>`:''}</td><td class="x"><button type="button" class="lp-ref-x" data-cvrefdel="${i}" title="이 근거 지우기" aria-label="이 근거 지우기">×</button></td></tr>`).join('')}${missing.length?`<tr class="miss"><td class="who">근거 없음</td><td colspan="3">${E(missing.join(' · '))} — 교과서·기출 쪽에서 글을 끌어 고르면 채워집니다</td></tr>`:''}</table>`:'<span class="ph">아직 없음 · 교과서·기출 쪽에서 글을 끌어 고르거나, 크게 보기에서 「근거로 연결」</span>';
    return `<div class="cv-writer"><div class="w-head"><span class="qno">${x.number?E(x.number)+'번':'번호 없음'} 문항</span>
        ${shapeHtml(x)}
        <span class="cv-pts" role="group" aria-label="배점">${[2,3].map(n=>`<button type="button" data-cvpoints="${n}" aria-pressed="${Number(x.points)===n}">${n}점</button>`).join('')}</span>
        <span class="sp"></span>
        <div class="stage" role="group" aria-label="문항 단계">${Object.entries(WORKFLOWS).map(([k,v])=>`<button type="button" data-cvstage="${k}" aria-pressed="${workflowOf(x)===k}" title="${v}"><i class="dot st-${k}"></i>${v}</button>`).join('')}</div></div>
      <form class="sheet-form cv-grid" onsubmit="return false">
        <section class="f-sec plan" aria-label="출제 설계">
          ${row('성취기준',`<div class="pick">${x.standardCode?`<b>${E(x.standardCode)}</b>`:'<span class="ph">고르지 않음</span>'}<button type="button" class="link" data-cv="open-standards">${x.standardCode?'바꾸기':'찾기'}</button></div>`,'왼쪽 참고 자료 칸을 「성취기준·교육과정」으로 바꿔 골라 연결합니다. 「찾기」를 눌러도 열립니다.')}
          ${row('출제의도',`<textarea id="cv-intent" data-cvf="intent" rows="1" placeholder="평가할 개념 · 학생이 할 일">${E(x.intent)}</textarea>`,'평가할 개념과 학생이 할 일을 한 줄로 적습니다. 예: 물질대사와 에너지 전환을 연결해 판단')}
          ${row('단원',(()=>{const auto=unitOf(x.standardCode);return `<div class="cv-unit">${!x.unitLarge&&auto?`<span class="cv-auto">성취기준에서 자동</span><b>${E(auto)}</b><button type="button" class="link" data-cvunit="${E(auto)}">넣기</button>`:`<input data-cvf="unitLarge" value="${E(x.unitLarge||'')}" placeholder="${auto?E(auto):'대단원 (성취기준을 고르면 자동)'}" aria-label="대단원">`}<input class="cv-mid" data-cvf="unitMiddle" value="${E(x.unitMiddle||'')}" placeholder="중단원(선택)" aria-label="중단원"></div>`;})(),'성취기준을 고르면 교육과정 자료의 「과목 › 대단원」이 채워집니다. 중단원은 필요하면 적습니다.')}</section>
        <section class="f-sec" aria-label="문항 내용">
          ${row('지문',`<textarea id="cv-passage" data-cvf="passage" rows="1" placeholder="자료 앞 설명 (없으면 비움)">${E(passages[0]?.text||'')}</textarea>`,passages.length>1?`지문이 ${passages.length}개인 문항입니다. 첫 지문만 여기서 고치고, 나머지는 구성 시트에서 고칩니다.`:'자료 앞에 오는 설명 글입니다. 없으면 비워 둡니다.',passages.length>1?'multi':'','passage')}
          ${row('자료',slotsHtml(x),'그림은 5E에서 잘라 가져오고, 표는 칸 수를 정해 만듭니다. 칸에 마우스를 올리면 바꾸기·지우기 단추가 보입니다.')}
          ${steps?row('실험과정',linesHtml(steps,'steps','과정을 입력하세요'),'(가)·(나)는 자동으로 붙습니다.'):''}
          ${talk?row('대화',linesHtml(talk,'dialogue','말을 입력하세요'),'이름 칸에 학생 이름, 오른쪽에 말'):''}
          ${row('발문',`<textarea id="cv-ask" data-cvf="ask" rows="1" placeholder="학생에게 물을 문장">${E(x.ask)}</textarea>`,'학생에게 묻는 문장','','ask')}
          ${isCombo(x)||bogi?row('보기',bogi?linesHtml(bogi,'bogi','보기 내용'):'<button type="button" class="btn" data-cvline-add="bogi">+ 보기 만들기</button>',isCombo(x)?'ㄱ·ㄴ·ㄷ은 자동으로 붙습니다. 오른쪽 ○(옳음)·×(틀림)를 정하면 정답 선지가 자동으로 표시됩니다.':'합답형이 아니지만 한글에 찍히는 보기입니다(엑셀에서 유형만 바꾼 경우). 필요 없으면 줄을 지우세요.'):''}
          ${choicesHtml(x)}
          ${row('해설',`<div class="cv-exp-tools"><button type="button" class="mini" data-cv="exp-skeleton" title="정답과 보기 ○×, 연결한 근거 인용문으로 해설 줄을 만듭니다">${ICON.star}보기 ○×·근거로 해설 뼈대 만들기</button></div><textarea data-cvf="explanation" rows="1" placeholder="정답 근거와 풀이">${E(x.explanation)}</textarea>`,'정답 근거와 풀이. 「뼈대 만들기」는 보기 ○×와 근거 인용문으로 줄을 만들고, 이미 쓴 해설이 있으면 그 아래에 붙입니다.')}
          ${row('근거',evTable,'이 문항의 근거: 교과서·기출 쪽에서 글을 끌어 고르거나 「이 쪽을 근거로」, 기출 크게 보기의 「근거로 연결」. 줄을 누르면 그 쪽이 열립니다. 한글 조판에는 찍히지 않습니다.','cv-evrow')}
          ${row('출처',(()=>{const k=sourceKind(x),orig=(x.references||[]).find(r=>/^원본 기출 · /.test(r.label)),books=[...new Set((x.references||[]).filter(r=>r.source?.kind==='textbook').map(r=>r.label))];
            const note=k==='기출 변형'?(String(x.source).replace(/^기출 변형\s*·?\s*/,'')||orig?.label.replace(/^원본 기출 · /,'')||''):k==='교과서'?(String(x.source).replace(/^교과서\s*·?\s*/,'')||books.join(' · ')):'';
            return `<div class="cv-src"><span class="cv-pts cv-srcseg" role="group" aria-label="출처">${SOURCES.map(v=>`<button type="button" data-cvsource="${v}" aria-pressed="${k===v}">${v}</button>`).join('')}</span>${k==='기타'?`<input data-cvf="source" value="${E(x.source)}" placeholder="출처 직접 입력" aria-label="출처">`:note?`<span class="cv-srcnote">${!String(x.source).includes(note)?'<span class="cv-auto">자동</span>':''}${E(note)}</span>`:''}</div>`;})(),'자체 제작·교과서·기출 변형·기타. 「변형」으로 가져온 문항은 원본 기출이, 교과서는 연결한 근거 쪽이 자동으로 적힙니다.')}
        </section>
        <div class="cv-meta">관리번호 <input data-cvf="managementId" value="${E(x.managementId||'')}" placeholder="${E(autoManage(x))}" aria-label="문항관리번호"><span>· 배점은 맨 위 2점|3점에서</span></div>
        <footer class="f-foot"><div class="checks" id="cv-checks">${checksHtml(items)}</div><span class="sp"></span><button type="button" class="btn go" data-cv="review" ${done?'':'title="발문·자료·보기·선지·정답을 채우면 검토가 정확해집니다"'}>${ICON.star}AI 검토 요청</button></footer>
      </form></div>`;
  }
  const checksHtml=items=>items.map(([k,ok,n])=>`<span class="${ok?'ok':''}">${ok?'✓ ':''}${k}${n&&!ok?` ${n}`:''}</span>`).join('');
  // 라이브러리 칸(시안 library-one-row.html): 머리 한 줄 = [검색 범위 ▾][검색창][상세검색][5E 라이브러리][근거 N], 높이 44로 가운데·오른쪽 머리 줄과 일직선.
  // 검색창·상세검색 안 내용은 범위마다 다르다(기출: 색인 조각·과목/단원/연도, 교과서: 쪽 번호·책, 기준·자료: 아래 자료 열람의 검색으로 보냄).
  function libHtml(){
    const x=q(),refs=x?.references||[],docked=['standards','references'].includes(panels.tab);
    // 범위 목록 맨 아래 「5E 라이브러리에서 가져오기…」: 어디서 찾을지 고르는 자리와 한곳에(머리 줄의 같은 모양 아이콘 두 개를 없앰).
    const scope=`<select class="lp-scope" data-cvscope aria-label="검색 범위">${TABS.map(([k,t])=>`<option value="${k}"${panels.tab===k?' selected':''}>${t}</option>`).join('')}<option disabled>──────────</option><option value="__lib">5E 라이브러리에서 가져오기…</option></select>`;
    const unit=panels.tab==='past'?['pastview',pastFilter.view==='page','문항별로 보기','시험지 쪽으로 보기']:panels.tab==='textbooks'?['bookview',pastFilter.bookview==='page','쪽 목록','한 쪽 크게 보기']:null;
    const seg=unit?`<span class="lp-seg lp-headseg" role="group" aria-label="보기 단위"><button type="button" data-cv${unit[0]}="q" aria-pressed="${!unit[1]}" title="${unit[2]}" aria-label="${unit[2]}">${ICON.grid}</button><button type="button" data-cv${unit[0]}="page" aria-pressed="${unit[1]}" title="${unit[3]}" aria-label="${unit[3]}">${ICON.page}</button></span>`:'';
    const linked='';// 근거는 문항 카드 맨 아래 「근거」 표로 옮겼다(시안 34).
    const search=docked?`<label class="lp-search">${ICON.search}<input data-cvsrc value="${E(root.querySelector('#source-search')?.value||document.querySelector('#source-search')?.value||'')}" placeholder="${panels.tab==='standards'?'코드·핵심어':'자료 이름·본문'}" aria-label="검색"></label>`:'';
    return `<aside class="cv-lib cv-left"${panels.lib?'':' hidden'} aria-label="참고 자료"><div class="lp-one">${panels.lib?`<button type="button" class="btn icon pt pane-close" data-cv="toggle-lib" aria-pressed="true" title="참고 자료 닫기" aria-label="참고 자료 닫기">${ICON.panelL}</button>`:''}${scope}<div class="lp-slot" data-cvslot="search">${search}</div>
      ${docked||panels.tab==='textbooks'?'':`<button type="button" class="lp-adv" data-cvadv aria-expanded="${pastAdvOpen}" title="상세검색: 과목·단원·연도">${ICON.sliders}<span>상세검색</span><i data-cvslot="advn" hidden></i></button>`}${seg}</div>
      <div class="lp-adv-pop" data-cvslot="adv"${pastAdvOpen&&!docked?'':' hidden'}></div>
      <div class="lp-body" data-cvbody="past" ${['past','textbooks'].includes(panels.tab)?'':'hidden'}></div>
      <div class="lp-body lp-docked" data-cvbody="docked" ${docked?'':'hidden'}></div>
      ${linked}</aside>`;
  }
  const unseenAi=x=>{const seen=store.get('aiSeen:'+x.id,0);return (x.reviews||[]).slice(seen).filter(m=>m.role==='ai').length;};
  function rightHtml(){
    const x=q(),badge=x&&panels.right!=='ai'?unseenAi(x):0;
    return `<aside class="cv-right"${panels.rightOpen?'':' hidden'} aria-label="AI · 조판"><div class="cv-ph">${paneRole('ai','AI · 조판')}<div class="seg cv-rseg" role="group" aria-label="오른쪽 칸"><button type="button" data-cvright="paper" aria-pressed="${panels.right==='paper'}">${ICON.page}미리보기</button><button type="button" data-cvright="ai" aria-pressed="${panels.right==='ai'}">${ICON.star}AI${badge?`<i class="badge">${badge}</i>`:''}</button></div><span class="sp"></span>${panels.right==='paper'&&x?`<span class="pane-acts"><button type="button" class="pane-act" data-cv="hwp-download" title="편집 가능한 HWPX 내려받기">HWPX</button><button type="button" class="pane-act go" data-cv="hwp-save" title="이 문항의 조판 저장">조판 저장</button></span>`:''}${panels.rightOpen?`<button type="button" class="btn icon pt pane-close" data-cv="toggle-right" aria-pressed="true" title="AI · 조판 닫기" aria-label="AI · 조판 닫기">${ICON.panelR}</button>`:''}</div>
      <div class="cv-rbody" data-cvbody="paper" ${panels.right==='paper'?'':'hidden'}><div class="cv-hwp" id="cv-hwp">${x?'':'<p class="pv-empty">문항을 고르면 한글 조판이 보입니다.</p>'}</div></div>
      <div class="cv-rbody ai-body" data-cvbody="ai" ${panels.right==='ai'?'':'hidden'}></div></aside>`;
  }
  // 세 칸의 머리 줄은 맨 앞에 칸 이름(참고 자료 · 문항 카드 · AI · 조판)을 같은 모양으로 둔다. 좌우 칸을 닫는 단추는 그 칸 머리 줄의
  // 바깥쪽 끝에 있고, 닫힌 칸은 화면 가장자리 세로 띠(railHtml)로 남아 누르면 다시 열린다.
  // 오른쪽 칸 이름 아이콘은 AI 탭(☆)과 겹치지 않게 「문서 + 반짝」 모양을 따로 쓴다.
  const PANE_ICON={lib:ICON.lib,card:ICON.card,ai:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4"/><path d="M10 11.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/></svg>'};
  const paneRole=(k,name)=>`<span class="pane-role" title="${name}">${PANE_ICON[k]}<span>${name}</span></span>`;
  const railHtml=(side,name)=>`<button type="button" class="pane-rail ${side}" data-cv="${side==='left'?'toggle-lib':'toggle-right'}" aria-pressed="false" title="${name} 열기" aria-label="${name} 열기">${side==='left'?ICON.panelL:ICON.panelR}<span>${name}</span></button>`;
  // 가운데 머리줄: 칸 이름, 번호 탭, 문항 카드|쪽 전체.
  function barHtml(){
    return `<div class="cv-bar">${paneRole('card','문항 카드')}${tabsHtml()}
      <div class="seg cv-vseg" role="group" aria-label="가운데 보기"><button type="button" data-cvview="card" aria-pressed="${panels.view==='card'}" title="문항 카드">${ICON.card}<span>문항 카드</span></button><button type="button" data-cvview="page" aria-pressed="${panels.view==='page'}" title="쪽 전체">${ICON.page}<span>쪽 전체</span></button></div>
</div>`;
  }
  const splitHtml=k=>`<div class="cv-split" data-cvsplit="${k}" role="separator" aria-orientation="vertical" title="끌어서 폭 바꾸기 · 두 번 누르면 기본 폭"></div>`;
  // 기본 폭(시안 4): 화면 너비의 38%·28.5%(1440px 화면 → 545·410, 1920px → 730·547). 끈 폭은 기억한다.
  function widths(){const w=root.clientWidth||1440;return {lw:store.get('lw',Math.round(Math.min(760,Math.max(300,w*0.38)))),rw:store.get('rw',Math.round(Math.min(600,Math.max(340,w*0.285))))};}
  // 창이 좁아지면 가운데 칸 최소 폭(300)을 남기도록 양쪽 칸을 비율대로 줄인다(저장한 폭은 그대로, 창이 넓어지면 되돌아감).
  // 칸 폭을 열 때 한 번만 정해, 넓은 창에서 연 뒤 창을 줄이면 오른쪽 칸이 창 밖으로 밀려 잘렸다.
  function applyWidths(){let {lw,rw}=widths();const cs=getComputedStyle(root),gut=parseFloat(cs.getPropertyValue('--cv-gutter'))||8;
    const room=root.clientWidth-parseFloat(cs.paddingLeft||0)-parseFloat(cs.paddingRight||0)-gut*((panels.lib?1:0)+(panels.rightOpen?1:0))-300,l=panels.lib?lw:0,r=panels.rightOpen?rw:0;
    if(room>0&&l+r>room){const k=room/(l+r);if(panels.lib)lw=Math.max(240,Math.round(lw*k));if(panels.rightOpen)rw=Math.max(300,Math.round(rw*k));}
    // 한쪽 칸을 접으면 남은 두 칸이 비워진 자리를 지금 비율 그대로 나눠 갖는다(저장한 폭은 세 칸이 다 열렸을 때의 기준값).
    scaleL=scaleR=1;
    if(panels.lib!==panels.rightOpen){const inner=root.clientWidth-parseFloat(cs.paddingLeft||0)-parseFloat(cs.paddingRight||0),rail=30+gut,c0=Math.max(300,inner-2*gut-lw-rw),avail=inner-gut-rail;
      if(panels.rightOpen){const n=Math.max(300,Math.round(avail*rw/(c0+rw)));scaleR=rw/n;rw=n;}else{const n=Math.max(240,Math.round(avail*lw/(c0+lw)));scaleL=lw/n;lw=n;}}
    root.style.setProperty('--cv-lw',lw+'px');root.style.setProperty('--cv-rw',rw+'px');}
  let scaleL=1,scaleR=1;
  function render(){shapeOpen=false;
    const x=q();
    const keep=root.querySelector('.cv-writer')?.scrollTop||0,same=renderedFor===x?.id;
    api.dock?.(null);// 다시 그리기 전에 붙여 둔 자료 열람을 원래 자리로 돌려놓는다(같이 지워지지 않게).
    // 기준·자료는 검색어를 범위마다 따로 기억한다(한쪽 검색어가 다른 쪽 목록을 거르지 않게).
    if(['standards','references'].includes(panels.tab)){const src=document.querySelector('#source-search');if(src)src.value=srcQuery[panels.tab]||'';}
    applyWidths();
    const center=x?(panels.view==='page'?'<div class="cv-page" id="cv-page"><p class="pv-empty">쪽을 그리는 중…</p></div>':formHtml(x)):'<div class="cv-writer"><p class="pv-empty">위의 ＋로 새 문항을 만들거나 번호를 고르세요.</p></div>';
    root.innerHTML=(panels.lib?'':railHtml('left','참고 자료'))+libHtml()+(panels.lib?splitHtml('left'):'')+`<section class="cv-center">${barHtml()}${center}</section>`+(panels.rightOpen?splitHtml('right'):'')+rightHtml()+(panels.rightOpen?'':railHtml('right','AI · 조판'));
    if(same&&panels.view==='card')root.querySelector('.cv-writer').scrollTop=keep;
    renderedFor=x?.id;
    if(panels.lib)api.dock?.(['standards','references'].includes(panels.tab)?panels.tab:null,root.querySelector('[data-cvbody="docked"]'));
    if(panels.lib&&['past','textbooks'].includes(panels.tab))renderPast();
    placeHwp(panels.rightOpen&&panels.right==='paper'&&!!x);syncHwpActs();
    if(panels.rightOpen&&panels.right==='ai'){renderAi();markAiSeen();}
    if(panels.view==='page')void renderPage();
    fitAll();taWatch();
    root.querySelector('.cv-qtab[aria-current="true"]')?.scrollIntoView?.({block:'nearest',inline:'nearest'});
    root.querySelectorAll('.cv-writer textarea').forEach(fit);
  }
  // 가운데 보기 전환: 한글 조판에서 나가면 한글 창을 닫는다(조판 저장은 창의 「조판 저장」으로).
  function setView(v){panels.view=v==='hwp'?'card':v;render();anim(root.querySelector('.cv-center .cv-page,.cv-center .cv-writer'),'ep-swap');}
  // 한글 조판 창(5e_hwp)은 안에 편집기 프레임이 있어 DOM에서 옮기면 처음부터 다시 읽는다(문항 전환 15초).
  // 그래서 카드를 다시 그려도 지워지지 않는 층 하나에 한 번만 붙이고, 그 층을 미리보기 칸(#cv-hwp) 위에 겹쳐 둔다.
  const hwpLayer=document.createElement('div');hwpLayer.className='cv-hwp-layer';hwpLayer.hidden=true;document.body.append(hwpLayer);api.hwpDock?.(hwpLayer);// 편집기 프레임이 생기기 전에 붙여 둔다.
  // 한글 창이 다시 그려지면 편집기가 스스로 초점을 가져가, 카드 칸에 이어 치던 글이 카드에 들어가지 않았다.
  // 마우스가 한글 창 위에 없는데 초점이 그 안으로 가면 사용자가 누른 것이 아니므로, 직전에 쓰던 칸으로 돌려준다.
  // 칸 머리 줄의 「HWPX · 조판 저장」은 숨긴 한글 창 머리 줄의 진짜 단추를 누른다. 쓸 수 있는지(disabled)도 따라간다.
  function syncHwpActs(){for(const [k,id] of [['hwp-download','#typeset-download'],['hwp-save','#typeset-save']]){const real=hwpLayer.querySelector(id),b=root.querySelector(`[data-cv="${k}"]`);if(b)b.disabled=!real||real.disabled;}}
  new MutationObserver(syncHwpActs).observe(hwpLayer,{subtree:true,attributes:true,attributeFilter:['disabled'],childList:true});
  let overHwp=false,lastFocus=null;hwpLayer.addEventListener('pointerenter',()=>{overHwp=true;});hwpLayer.addEventListener('pointerleave',()=>{overHwp=false;});
  // 편집기 안에서 스스로 잡는 초점은 이 문서에 focusin이 오지 않아, 창 blur·칸 focusout 뒤에 어디로 갔는지 본다.
  document.addEventListener('focusin',e=>{if(!hwpLayer.contains(e.target))lastFocus=e.target;},true);
  // 빈 곳을 누르면 쓰던 칸에서 나온 것이므로 돌려줄 칸을 잊는다.
  document.addEventListener('pointerdown',e=>{if(!hwpLayer.contains(e.target)&&!e.target.closest?.('input,textarea,select,button,[contenteditable],[tabindex]'))lastFocus=null;},true);
  // 번호 줄이 넘치면 마우스 휠(세로)로도 가로로 넘긴다(스크롤 막대는 숨겨져 있음).
  root.addEventListener('wheel',e=>{const t=e.target.closest?.('.cv-qtabs');if(!t||t.scrollWidth<=t.clientWidth||Math.abs(e.deltaX)>Math.abs(e.deltaY))return;e.preventDefault();t.scrollLeft+=e.deltaY;},{passive:false});
  root.tabIndex=-1;// 돌려줄 칸이 없을 때 초점을 받을 곳(Safari는 iframe.blur()로 초점이 빠지지 않는다)
  const reclaim=()=>setTimeout(()=>{const a=document.activeElement;if(!a||!hwpLayer.contains(a)||overHwp||hwpLayer.hidden)return;
    const back=lastFocus?.isConnected&&!lastFocus.closest('[hidden]')&&lastFocus!==document.body?lastFocus:root;back.focus({preventScroll:true});},0);
  window.addEventListener('blur',reclaim);document.addEventListener('focusout',reclaim,true);
  let hwpSlotWatch=null,hwpWanted=false;
  function alignHwp(){const slot=root.querySelector('#cv-hwp');const show=hwpWanted&&slot&&!root.hidden&&!root.closest('[hidden]');hwpLayer.hidden=!show;if(!show)return;
    const r=slot.getBoundingClientRect();Object.assign(hwpLayer.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});}
  function placeHwp(show){hwpWanted=show;hwpSlotWatch?.disconnect();
    const slot=root.querySelector('#cv-hwp');if(show&&slot){hwpSlotWatch=new ResizeObserver(()=>requestAnimationFrame(alignHwp));hwpSlotWatch.observe(slot);api.hwpDock?.(hwpLayer);api.hwpOpen?.();}else api.hwpClose?.();
    alignHwp();}
  new MutationObserver(alignHwp).observe(root,{attributes:true,attributeFilter:['hidden']});window.addEventListener('resize',alignHwp);
  function markAiSeen(){const x=q();if(x)store.set('aiSeen:'+x.id,(x.reviews||[]).length);}
  function fit(t){t.style.height='auto';t.style.height=Math.max(t.scrollHeight+2,30)+'px';}
  // 글 칸 높이는 칠 때만 맞추면, 처음 그릴 때와 칸 폭이 줄어 줄이 늘 때 글이 아래로 잘렸다. 그때도 맞춘다(폭이 바뀔 때만, 한 프레임에 한 번).
  function fitAll(){for(const n of root.querySelectorAll('.cv-writer textarea'))fit(n);}
  // 글 칸 폭 감시: 가운데 칸이 좁아지면 줄이 늘어난 만큼 칸도 아래로 늘어난다(잘려 보이지 않게). 높이만 바뀐 것은 무시.
  const taRO=new ResizeObserver(es=>{for(const e of es){const w=Math.round(e.contentRect.width);if(e.target._w!==w){e.target._w=w;fit(e.target);}}});
  function taWatch(){taRO.disconnect();root.querySelectorAll('.cv-writer textarea').forEach(t=>{t._w=Math.round(t.clientWidth);taRO.observe(t);});}
  {let lastW=0,raf=0;new ResizeObserver(es=>{const w=Math.round(es[0].contentRect.width);if(w===lastW)return;lastW=w;cancelAnimationFrame(raf);raf=requestAnimationFrame(fitAll);}).observe(root);}
  // 작은 클릭(배점·보기 ○×·추천 조합·단원·출처·해설 뼈대·근거 지우기)은 문항 카드 내용만 다시 그린다 — 참고 자료 칸·한글 창·AI 칸은 그대로라 화면이 멈추지 않는다.
  function cardEdit(field,fn){const x=q();if(!x)return;api.edit(fn,{key:`card:${x.id}:${field}`,light:true});renderCard();}
  function renderCard(){const x=q(),w=root.querySelector('.cv-writer');if(!x||!w||panels.view!=='card'){render();return;}
    const keep=w.scrollTop,focus=document.activeElement?.closest?.('.cv-writer')?document.activeElement.dataset:null;w.outerHTML=formHtml(x);const n=root.querySelector('.cv-writer');n.scrollTop=keep;
    fitAll();taWatch();refreshLight();if(focus?.cvf)n.querySelector(`[data-cvf="${focus.cvf}"]`)?.focus({preventScroll:true});}
  function refreshLight(){const x=q();if(!x)return;
    // 완성한 문항의 내용을 고치면 검토 중으로 돌아간다(app.js demoteEdited). 다시 그리지 않는 입력에서도 단계 단추를 맞춘다.
    for(const b of root.querySelectorAll('[data-cvstage]'))b.setAttribute('aria-pressed',String(b.dataset.cvstage===workflowOf(x)));
    const c=root.querySelector('#cv-checks');if(c)c.innerHTML=checksHtml(completeness(x).items);if(panels.rightOpen&&panels.right==='paper')schedulePaper();
    const tabs=root.querySelector('.cv-qtabs');if(tabs){const sc=tabs.scrollLeft;tabs.outerHTML=tabsHtml();root.querySelector('.cv-qtabs').scrollLeft=sc;}}
  let paperTimer=0;const schedulePaper=()=>{clearTimeout(paperTimer);paperTimer=setTimeout(renderPaper,250);};
  // 미리보기: 실제 단 폭(86mm)으로 한 번 조판한 모양을 칸에 맞춰 확대·축소만 한다(폭이 바뀌어도 줄바꿈 그대로). 문항 하나를 스크롤 없이.
  async function renderPaper(){const x=q(),n=root.querySelector('#cv-paper');if(!x||!n)return;
    const {html,width}=await api.columnPreview(x);if(q()!==x||!n.isConnected)return;
    n.innerHTML=`<div class="cv-fitbox"><article class="cv-col" style="width:${width}px">${html}</article></div>`;fitPaper();}
  function fitPaper(){const n=root.querySelector('#cv-paper'),box=n?.querySelector('.cv-fitbox'),col=box?.firstElementChild;if(!col)return;
    col.style.transform='none';const W=col.offsetWidth,H=col.offsetHeight,aw=n.clientWidth-24,ah=n.clientHeight-24;if(!W||!H||aw<=0)return;
    const s=Math.max(.2,Math.min(aw/W,ah>40?ah/H:aw/W));col.style.transform=`scale(${s})`;box.style.width=W*s+'px';box.style.height=H*s+'px';}
  // 크기를 바꾸는 일은 다음 그림 때 한 번에(관찰 콜백 안에서 크기를 바꾸면 Safari가 'ResizeObserver loop' 오류를 낸다).
  let fitFrame=0;new ResizeObserver(()=>{cancelAnimationFrame(fitFrame);fitFrame=requestAnimationFrame(()=>{if(!document.body.classList.contains('cv-dragging'))applyWidths();fitPaper();fitPage();alignHwp?.();});}).observe(root);
  // 쪽 전체: 시험지에 든 문항이면 그 시험지의 쪽 배치(2단)로, 보관함 문항이면 이 문항만 놓은 쪽으로 가운데에 크게 보여 준다.
  // 한글 엔진이 실제 시험지처럼 합친 문서를 쪽마다 SVG로 그린다(미리보기 칸·내려받는 HWPX와 같은 모양).
  let pageSeq=0;
  async function renderPage(){const x=q(),n=root.querySelector('#cv-page');if(!x||!n)return;const seq=++pageSeq;
    let view;try{view=await api.pageSheets(x,{alive:()=>seq===pageSeq&&n.isConnected&&q()===x});}catch(e){if(e.cancelled)return;if(seq===pageSeq&&n.isConnected)n.innerHTML=`<p class="pv-empty">쪽을 그리지 못했습니다: ${E(e.message)}</p>`;return;}
    if(seq!==pageSeq||q()!==x||!n.isConnected)return;
    const pct=v=>(v*100).toFixed(3)+'%',total=view.pages.length;
    n.innerHTML=`<div class="pg-head"><b>${E(view.title)}</b><span>${total}쪽 · 한글 조판 그대로(${E(view.paper)} ${view.columns}단)${view.unsaved.length?` · 조판 저장 전: ${E(view.unsaved.join(', '))}번`:''}</span><span class="sp"></span><button type="button" class="mini" data-cvview="card">문항 카드로</button></div>`+(view.warning?`<p class="pg-warn" role="alert" style="align-self:stretch;margin:0;font-size:var(--ds-text-meta);color:var(--ds-danger)">${E(view.warning)}</p>`:'')+
      view.pages.map((p,i)=>`<figure class="pg-sheet" data-native-page style="padding:0;aspect-ratio:${p.width}/${p.height}">${p.svg.replace('<svg ','<svg style="display:block;width:100%;height:auto" ')}${p.focus?`<i class="pg-now" aria-hidden="true" style="position:absolute;pointer-events:none;outline:2px solid var(--go-line,#6ba4f8);outline-offset:3px;left:${pct(p.focus.x)};top:${pct(p.focus.y)};width:${pct(p.focus.w)};height:${pct(p.focus.h)}"></i>`:''}<figcaption>${i+1} / ${total}</figcaption></figure>`).join('');
    n.querySelector('.pg-now')?.scrollIntoView({block:'center'});}
  function fitPage(){const n=root.querySelector('#cv-page');if(!n)return;for(const col of n.querySelectorAll('.pg-col')){const w=col.clientWidth;for(const q of col.querySelectorAll('.pg-q')){const inner=q.firstElementChild;inner.style.transform='none';const s=w/inner.offsetWidth;inner.style.transform=`scale(${s})`;q.style.height=inner.offsetHeight*s+'px';}}}

  // 5E 라이브러리 연결: 공유 폴더·자료팩·기출 PDF에서 쪽이나 영역을 골라 가져온다(5E 라이브러리 선택기). 단추는 도구 줄 끝 아이콘 하나,
  // 가져온 자료(5E 라이브러리 창 「보내기 → ExamPool」로 온 것 포함)는 목록 맨 위에 같은 카드로 놓는다.
  const pickBtn=kind=>`<button type="button" class="lp-pick" data-cvlib="${kind}" aria-label="5E 라이브러리에서 고르기" title="5E 라이브러리에서 고르기 — 공유 폴더·자료팩·PDF에서 쪽이나 영역을 골라 가져옵니다">${ICON.lib}</button>`;
  const picksHtml=()=>(api.libraryPicks?.()||[]).map((p,i)=>`<figure class="past pick"><img src="${E(p.data)}" alt="${E(p.name)}"><figcaption><b title="${E([p.source?.documentTitle||p.name,p.source?.pageNumber?p.source.pageNumber+'쪽':'',p.source?.title&&p.source.title!==p.source?.documentTitle?p.source.title:''].filter(Boolean).join(' · '))}">${E(p.source?.documentTitle||p.name)}${p.source?.pageNumber?' · '+p.source.pageNumber+'쪽':''}</b><span class="acts"><button type="button" class="mini" data-cvpick-link="${i}">근거로 연결</button><button type="button" class="mini" data-cvpick-slot="${i}">그림 칸에 넣기</button></span></figcaption></figure>`).join('');
  // 기출 목록: 과학탐구 전체 기출(조사 색인 assets/exampool/convert/data). 과목 파일은 고를 때 읽는다(과목을 안 고르면 전부).
  // 카드 모양·필터·핵심어는 예전 그대로이고, 핵심어는 문항 본문 글까지 찾는다. 「변형」은 이 기출을 편집 가능한 한글 문항(AI 없음)으로 바꿔 새 카드로 연다.
  // 카드에 보이는 짧은 제목은 5E 라이브러리 「문항」 탭과 같은 꼴: 「물리2 27년 6평 2번」(수능은 「27년 수능」). 근거 이름에는 긴 제목을 쓴다.
  async function loadPast(subjects){
    pastIndex||=await(pastIndexLoading||=fetch(new URL('../convert/data/index.json',import.meta.url)).then(r=>{if(!r.ok)throw Error();return r.json();}));
    pastSyn||=await fetch(new URL('../convert/data/synonyms.json',import.meta.url)).then(r=>r.ok?r.json():{}).then(d=>d.map||{}).catch(()=>({}));
    const want=subjects.length?subjects:pastIndex.subjects.map(v=>v[0]),key=want.join(',');if(pastItems&&pastItemsKey===key)return pastItems;
    const lists=await Promise.all(want.map(code=>(loadPast.cache[code]||=fetch(new URL(`../convert/data/${code}.json`,import.meta.url)).then(r=>{if(!r.ok)throw Error();return r.json();})).then(rows=>rows.map(r=>({code,label:pastIndex.subjects.find(v=>v[0]===code)?.[1]||code,row:r})))));
    pastItems=lists.flat().map(({code,label,row})=>({id:row[F.id],subject:code,subjectLabel:label,year:row[F.year],month:row[F.month],no:row[F.no],page:row[F.page],box:row[F.box],pdfFile:row[F.pdfFile],publicPath:pastIndex.files[row[F.pdfFile]],parts:row[F.parts]||[],tags:row[F.tags]||[],hasFigure:!!row[F.hasFigure],record:row[F.record],text:row[F.text]||'',
      title:`${row[F.year]}학년도 ${MONTH[row[F.month]]||row[F.month]+'월'} ${label} ${row[F.no]}번`,short:shortTitle(row[F.year],row[F.month],label,row[F.no])})).sort((a,b)=>b.year-a.year||String(a.month).localeCompare(String(b.month))||a.subject.localeCompare(b.subject)||(+a.no)-(+b.no));
    pastItemsKey=key;warmHay(pastItems);return pastItems;
  }
  // 검색용 글(hay)을 쉬는 틈에 조금씩 미리 만든다 — 첫 글자를 칠 때 8천여 문항을 한꺼번에 만드느라 입력이 멈추지 않게.
  function warmHay(list){let i=0;const idle=window.requestIdleCallback||(f=>setTimeout(()=>f({timeRemaining:()=>8}),30));
    const step=d=>{if(pastItems!==list)return;while(i<list.length&&d.timeRemaining()>2){if(pastSyn)hay(list[i]);i++;}if(i<list.length)idle(step);};idle(step);}
  loadPast.cache={};
  const pastItem=id=>pastItems?.find(v=>v.id===id);
  // 검색 색인(5e.ai.kr/examlibrary 기출 탐색기와 같은 규칙): 단어를 치고 Enter → 검색 칸 안의 단어 조각(최대 3개).
  // 조각을 모두 포함하는 문항만 남기고(띄어쓰기·대소문자 무시, 태그·단원의 비슷한 말 사전 포함), 제목·태그에 걸린 문항을 앞에 둔다.
  const hay=i=>{if(i._hay===undefined){const rel=[...i.tags,...i.parts].flatMap(n=>pastSyn?.[n]||[]);i._hay=norm([i.id,i.title,i.short,i.text,...i.tags,...i.parts,...rel].join(' '));i._hayNs=i._hay.replace(/\s+/gu,'');}return i;};
  function addPastWords(input){
    if(panels.tab==='textbooks'){pastFilter.query=input.value.trim();store.set('past',pastFilter);pastRefocus=true;renderPast();return;}
    const incoming=splitWords(input.value);if(!incoming.length)return;
    const joined=[...new Set([...pastFilter.tokens,...incoming])];
    if(joined.length>3){api.status?.('검색어는 최대 세 단어입니다. 단어를 줄여 주세요.',true);return false;}
    pastFilter.tokens=joined;pastFilter.query='';store.set('past',pastFilter);renderPast();
  }
  // 기출 카드 그림: 화면에 들어오는 것부터 문항 번호~선지 번호 줄로 잘라(past-crop.js) 넣는다. 그림 칸은 정사각 고정이라 읽혀도 칸이 움직이지 않는다(긴 문항은 아래만 잘림).
  function loadThumbs(body){
    const list=body.querySelector('.past-list');if(!list)return;
    const words=pastFilter.tokens.slice(),key=words.join('\u0001');
    // 형광펜은 검색어가 바뀔 때마다 다시 칠한다 — 결과 목록이 같아 카드를 그대로 다시 붙여도(pastCache) 예전 검색어 그림이 남지 않게.
    // 원래 카드 그림(data-base)으로 돌아간 뒤 새 검색어로 칠하고, 칠할 자리가 없으면 원래 그림 그대로.
    const mark=img=>{if(img.dataset.words===key)return;img.dataset.words=key;const pic=img.closest('.past-pic');pic?.removeAttribute('data-marked');
      if(img.dataset.base&&img.src!==img.dataset.base&&!img.dataset.fixed)img.src=img.dataset.base;else if(img.dataset.fixed)img.src=img.dataset.fixed;
      const i=words.length&&pastItem(img.dataset.pastThumb);if(!i?.publicPath||!Array.isArray(i.box))return;pic?.setAttribute('data-marking','');
      markedQuestion(i,words).then(r=>{if(r&&img.isConnected&&img.dataset.words===key){img.src=r.url;pic?.setAttribute('data-marked',r.count);}}).catch(()=>{}).finally(()=>{if(img.dataset.words===key)pic?.removeAttribute('data-marking');});};
    // 그림 픽셀로 자르기가 실패하면(쪽 번호·저작권까지 남은 원본) 원본 PDF 글자 위치로 문항만 다시 자른다(시안 28).
    const fix=img=>{const i=pastItem(img.dataset.pastThumb);if(!i?.publicPath||!Array.isArray(i.box))return;croppedQuestion(i).then(r=>{if(!r||!img.isConnected)return;img.dataset.fixed=r.url;if(!img.closest('[data-marked]'))img.src=r.url;}).catch(()=>{});};
    const show=img=>{if(img.dataset.loading)return;img.dataset.loading='1';croppedPastImage(img.dataset.card).then(src=>{if(img.isConnected){img.src=src;img.dataset.base=src;if(src===img.dataset.card)fix(img);mark(img);}else delete img.dataset.loading;});};
    // 이미 그림이 있는 카드(다시 붙인 목록)는 검색어만 다시 칠한다.
    list.querySelectorAll('img[data-card][data-base]').forEach(mark);
    if(!('IntersectionObserver' in window)){list.querySelectorAll('img[data-card]').forEach(show);return;}
    const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){io.unobserve(e.target);show(e.target);}}),{root:list,rootMargin:'400px 0px'});
    list.querySelectorAll('img[data-card]').forEach(img=>io.observe(img));
  }
  // 교과서: 5E 공유 자료(assets/pdf-library/catalog-bootstrap.json)의 「교과서」 PDF를 미리 만들어 둔 쪽 그림(previews/{sha}/{쪽}.webp)으로 본다.
  async function loadBooks(){
    books||=await fetch(new URL('../../pdf-library/catalog-bootstrap.json',import.meta.url)).then(r=>r.ok?r.json():null).then(d=>{const p=d?.payload;if(!p)return [];
      return p.catalog.documents.filter(x=>/\/교과서\//.test(x.source?.locator||'')).map(x=>{const path=x.source.locator.split('/').slice(1).join('/');return {id:x.id,title:x.title.replace(/\.pdf$/i,''),pages:x.pageCount,sha:p.checksums?.files?.[path]||'',path};}).filter(b=>b.sha);}).catch(()=>[]);
    return books;
  }
  const bookPage=(b,n,thumb)=>new URL(`../../pdf-library/previews/${b.sha}/${n}${thumb?'-thumb':''}.webp`,import.meta.url).href;
  const searchHtml=(placeholder,n)=>`<label class="lp-search">${ICON.search}<span class="lp-tokens">${pastFilter.tokens.map(w=>`<button type="button" class="lp-token" data-cvtoken="${E(w)}" aria-label="${E(w)} 단어 삭제" title="${E(w)} 단어 삭제">${E(w)}<span aria-hidden="true">×</span></button>`).join('')}</span><input data-cvpast="query" value="${E(pastFilter.query)}" placeholder="${placeholder}" aria-label="검색할 단어 입력(Enter로 색인 추가, 최대 3개)">${n}</label>`;
  function fillHead(search,adv,count){
    // 검색창은 조각·안내 글이 그대로면 바꾸지 않고 문항 수만 고친다 — 치는 중에 입력칸을 새로 만들지 않게(초점·글자 유지, 다시 그리기 줄임).
    const s=root.querySelector('[data-cvslot="search"]');
    if(s){const sig=search.replace(/ value="[^"]*"/,'').replace(/<span class="lp-n"[^>]*>[^<]*<\/span>/,'');const n=s.querySelector('.lp-n'),m=search.match(/<span class="lp-n"[^>]*>([^<]*)<\/span>/);
      const inp=s.querySelector('[data-cvpast="query"]');if(s.dataset.sig===sig&&inp){if(n&&m)n.textContent=m[1].replace(/&amp;/g,'&');const v=(search.match(/ value="([^"]*)"/)?.[1]||'').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');if(inp.value.trim()!==v)inp.value=v;}else{s.innerHTML=search;s.dataset.sig=sig;}}
    const pop=root.querySelector('[data-cvslot="adv"]'),was=pop?.contains(document.activeElement)?document.activeElement.dataset.cvpast:'';if(pop)pop.innerHTML=adv;
    if(was)pop.querySelector(`[data-cvpast="${was}"]`)?.focus({preventScroll:true});// 상세검색에서 고른 칸으로 커서를 돌려놓는다
    const n=root.querySelector('[data-cvslot="advn"]');if(n){n.textContent=count;n.hidden=!count;}
  }
  let pastCache={html:'',node:null};
  async function renderPast(){
    const body=root.querySelector('[data-cvbody="past"]');if(!body)return;
    const typing=pastRefocus||document.activeElement?.dataset?.cvpast==='query',f=pastFilter;pastRefocus=false;
    const refocus=()=>{if(typing){const n=root.querySelector('[data-cvpast="query"]');if(n){n.focus();n.setSelectionRange(n.value.length,n.value.length);}}};
    if(panels.tab==='textbooks'){
      const list=await loadBooks();if(!body.isConnected||panels.tab!=='textbooks')return;
      const b=list.find(v=>v.id===f.book)||list[0],p=picksHtml(),from=Math.max(1,Math.min(b?.pages||1,Number(f.query)||1));
      fillHead(`<label class="lp-search">${ICON.search}<input data-cvpast="query" value="${E(f.query)}" placeholder="쪽 번호" inputmode="numeric" aria-label="쪽 번호로 가기"><span class="lp-n">${b?b.pages+'쪽':''}</span></label>`,
        `<label>교과서<select data-cvpast="book" aria-label="교과서">${list.map(v=>`<option value="${E(v.id)}"${v===b?' selected':''}>${E(v.title)} · ${v.pages}쪽</option>`).join('')}</select></label><p class="lp-adv-note">5E 공유 자료의 교과서입니다. 쪽 번호를 치면 그 쪽부터 보입니다.</p>`,0);
      if(b&&f.bookview==='page'){const n=Math.max(1,Math.min(b.pages,/^\d+$/.test(f.query)?Number(f.query):Number(f.bookpage)||1));renderBookPage(body,list,b,n);refocus();return;}
      const pages=b?Array.from({length:Math.min(60,b.pages-from+1)},(_,k)=>from+k):[];
      body.innerHTML=`<div class="past-list">${p}${pages.map(n=>`<figure class="past book" data-book="${E(b.id)}" data-page="${n}"><div class="past-pic"><img loading="lazy" src="${E(bookPage(b,n,true))}" data-full="${E(bookPage(b,n))}" alt="${E(b.title)} ${n}쪽"></div><figcaption><b>${E(b.title)} ${n}쪽</b><span class="acts"><button type="button" class="mini" data-cvbooklink="${n}" title="이 쪽을 근거로 연결">${ICON.link}<span>근거</span></button></span></figcaption></figure>`).join('')}${!p&&!pages.length?'<p class="lp-count">교과서를 찾지 못했습니다. 「5E 라이브러리」에서 쪽이나 영역을 골라 가져올 수 있습니다.</p>':''}</div>`;
      refocus();reopenZoom();return;
    }
    let items;try{if(!pastItems)body.innerHTML='<p class="lp-count">기출 목록을 불러오는 중…</p>';
      await loadPast([]);const code=pastIndex.subjects.find(v=>v[1]===f.subject)?.[0];items=await loadPast(code?[code]:[]);}
    catch{body.innerHTML='<p class="lp-count">기출 목록을 불러오지 못했습니다.</p>';pastIndexLoading=null;return;}
    if(!body.isConnected||panels.tab!=='past')return;
    const subjects=pastIndex.subjects.map(v=>v[1]),parts=[...new Set(items.flatMap(i=>i.parts))].sort(),years=[...new Set(items.map(i=>i.year))].sort((a,b)=>b-a);
    const words=[...new Set([...f.tokens,...splitWords(f.query)])];
    const list=items.filter(i=>(!f.part||i.parts.includes(f.part))&&(!f.year||String(i.year)===String(f.year))&&(!words.length||(hay(i),words.every(w=>i._hay.includes(w)||i._hayNs.includes(w)))));
    if(words.length){const sc=new Map(list.map(i=>[i,pastScore(i,words)]));list.sort((a,b)=>sc.get(b)-sc.get(a));}
    const total=pastIndex.subjects.reduce((n,v)=>n+v[2],0);
    const sel=(k,vals,label)=>`<label>${label}<select data-cvpast="${k}" aria-label="${label}"><option value="">전체</option>${vals.map(v=>`<option${String(f[k])===String(v)?' selected':''}>${E(v)}</option>`).join('')}</select></label>`;
    const thumb=i=>{const card=pastIndex.cards.replace('{id}',encodeURIComponent(i.id)),local=i.hasFigure?new URL(`../../exam-library/images/${encodeURIComponent(i.id)}.png`,import.meta.url).href:'';
      return `<div class="past-pic"><img alt="${E(i.title)}" data-past-thumb="${E(i.id)}" data-card="${E(card)}" data-fallback="${E(local)}"></div>`;};
    fillHead(searchHtml(f.tokens.length?'단어 더하기':'단어+Enter',`<span class="lp-n" title="기출 ${total.toLocaleString()}문항 중">${list.length.toLocaleString()}문항</span>`),
      sel('subject',subjects,'과목')+sel('part',parts,'단원')+sel('year',years,'연도')+`<div class="lp-adv-foot"><span>6월·9월 모평, 수능</span><button type="button" class="mini" data-cvadvclear>모두 지우기</button></div>`,
      ['subject','part','year'].filter(k=>f[k]).length);
    if(f.view==='page'){renderPastPage(body,items,list,'');return;}
    const html=`<div class="past-list">${picksHtml()}${list.slice(0,40).map(i=>`<figure class="past"${api.pastBusy?.()?.id===i.id?' data-busy':''}>${thumb(i)}${api.pastBusy?.()?.id===i.id?pastBusyHtml(api.pastBusy().stage):''}<figcaption><b title="${E([i.title,...i.parts,...i.tags.slice(0,3)].join(' · '))}">${E(i.short)}</b><span class="acts"><button type="button" class="mini" data-cvlink="${E(i.id)}" title="이 문항의 근거로 연결">${ICON.link}<span>근거</span></button>${(busy=>`<button type="button" class="mini go-mini" data-cvconvert="${E(i.id)}" title="편집 가능한 한글 문항으로 바꿔 새 문항 카드로 엽니다(AI 없음)"${busy?' aria-busy="true"':''}>${busy?busyHtml(busy.stage):'변형'}</button>`)(api.pastBusy?.()?.id===i.id&&api.pastBusy())}</span></figcaption></figure>`).join('')}</div>`;
    // 카드를 다시 그려도 기출 목록 내용이 같으면 그 전 목록(이미 받은 그림 포함)을 그대로 다시 붙인다 — 매번 새로 만들면
    // 그림 40장을 다시 받고 레이아웃을 다시 계산해 「근거로 연결」 같은 작은 수정에도 화면이 60ms쯤 멈췄다.
    if(html===pastCache.html&&pastCache.node){body.replaceChildren(pastCache.node);loadThumbs(body);refocus();reopenZoom();return;}
    body.innerHTML=html;pastCache={html,node:body.firstElementChild};
    loadThumbs(body);refocus();reopenZoom();
  }
  // 쪽 종이(시안 30·31): 원본 PDF 쪽 + 검색어 형광펜 + 이미 건 근거 자리(주황) + 끌어서 고를 수 있는 글자 층.
  function mountPaper(paper,o,alive=()=>true){
    const width=Math.max(240,paper.clientWidth||300),saved=(q()?.references||[]).filter(r=>r.source?.path===o.path&&r.source.page===o.page).flatMap(r=>r.source.rects||[]);
    return renderPdfPage(o.path,o.page,o.words||[],width,{sha:o.kind==='textbook'?o.sha:'',saved}).then(r=>{if(!alive()||!paper.isConnected)return null;
      const sheet=document.createElement('div');sheet.className='lp-sheet';sheet.append(r.canvas,r.layer);paper.replaceChildren(sheet);paper.dataset.marked=r.count;
      paper._src={...o,sha:o.sha||r.sha,fp:r.fp};paper.dataset.selectable=r.textItems?'1':'0';
      if(!r.textItems)paper.insertAdjacentHTML('beforeend','<span class="lp-paper-note">이 쪽은 PDF에 글자 정보가 없어 글을 끌어 고를 수 없습니다 · 「이 쪽을 근거로」는 쓸 수 있습니다</span>');
      return r;});
  }
  function renderBookPage(body,list,b,pageNo){
    pastCache={html:'',node:null};
    body.innerHTML=`<div class="past-list lp-pageview"><div class="lp-viewbar"><select data-cvpast="book" aria-label="교과서">${list.map(v=>`<option value="${E(v.id)}"${v===b?' selected':''}>${E(v.title)} · ${v.pages}쪽</option>`).join('')}</select>
      <span class="lp-pnav"><button type="button" data-cvbookstep="-1" aria-label="이전 쪽"${pageNo<=1?' disabled':''}>‹</button><span data-cvslot="pageno">${pageNo} / ${b.pages}쪽</span><button type="button" data-cvbookstep="1" aria-label="다음 쪽"${pageNo>=b.pages?' disabled':''}>›</button></span>
      <button type="button" class="lp-pageref" data-cvpageref title="이 쪽 전체를 근거로 연결">이 쪽을 근거로</button><a class="lp-pdf" href="${E(pdfHref(b.path,pageNo))}" target="_blank" rel="noopener" title="교과서 PDF 원본을 새 창에서 열기">PDF</a></div>
      <div class="lp-paper" data-cvpaper><img class="lp-fallback" src="${E(bookPage(b,pageNo))}" alt="${E(b.title)} ${pageNo}쪽"><span class="lp-paper-wait over"><i aria-hidden="true"></i>원본 PDF 여는 중 · 열리면 글을 끌어 근거로 고를 수 있습니다</span></div>
      <p class="lp-count">쪽 위의 글을 마우스로 끌어 고르면 「근거로 추가」 창이 뜹니다.</p></div>`;
    const paper=body.querySelector('[data-cvpaper]'),seq=++pastPageSeq,src={path:b.path,page:pageNo,title:b.title,kind:'textbook',sha:b.sha,bookId:b.id};
    mountPaper(paper,src,()=>seq===pastPageSeq).catch(()=>{if(seq!==pastPageSeq||!paper.isConnected)return;paper._src=src;
      paper.querySelector('.lp-paper-wait')?.replaceWith(Object.assign(document.createElement('span'),{className:'lp-paper-note',textContent:'원본 PDF를 열지 못해 미리보기 그림을 보입니다 · 「이 쪽을 근거로」는 쓸 수 있습니다'}));});
  }
  // 근거 고르기 창(시안 31): 쪽의 글을 끌어 고르거나 「이 쪽을 근거로」를 누르면 뜬다. 고른 글·무엇의 근거인지·메모를 받아
  // 파일·쪽·원본 지문·고른 글 위치와 함께 문항 근거로 저장한다(출제 오류 시비·자기 검토 대비).
  let evPending=null;
  const evTargets=x=>{const out=[['question','문항 전체'],['passage','지문'],['ask','발문']];bogiOf(x)?.lines?.forEach(l=>out.push([l.id,'보기 '+l.label]));if(!['서술형'].includes(x.type)&&x.style!=='대응표')x.choices?.forEach((c,i)=>out.push([c.id,'선지 '+NUM[i]]));return out;};
  const evTargetName=(x,t)=>evTargets(x).find(v=>v[0]===t)?.[1]||'문항';
  function evOpen(ev){
    const x=q(),lib=root.querySelector('.cv-left');if(!x||!lib)return;evPending=ev;lib.querySelector('.ev-pop')?.remove();
    const lr=lib.getBoundingClientRect(),top=ev.anchor?Math.max(52,Math.min(lr.height-250,ev.anchor.bottom-lr.top+8)):52;
    lib.insertAdjacentHTML('beforeend',`<div class="ev-pop" role="dialog" aria-label="근거로 추가" style="top:${Math.round(top)}px"><div class="ev-h"><b>${ev.text?'고른 글을 근거로':'이 쪽 전체를 근거로'}</b><span>${E(ev.src.title)} ${ev.src.page}쪽</span></div>${ev.text?`<q>${E(ev.text.slice(0,300))}${ev.text.length>300?'…':''}</q>`:''}
      <label>무엇의 근거<select data-evtarget>${evTargets(x).map(([v,t])=>`<option value="${E(v)}">${E(t)}</option>`).join('')}</select></label><input data-evnote placeholder="메모(선택) 예: ㄷ의 근거 — ATP 저장" aria-label="메모">
      <div class="acts"><button type="button" class="mini" data-evcancel>취소</button><button type="button" class="mini go-mini" data-evadd>근거로 추가</button></div></div>`);
    lib.querySelector('.ev-pop [data-evtarget]').focus({preventScroll:true});
  }
  document.addEventListener('mouseup',()=>setTimeout(()=>{const sel=getSelection();if(!sel||sel.isCollapsed||!sel.rangeCount)return;const text=sel.toString().replace(/\s+/g,' ').trim();if(!text)return;
    const rg=sel.getRangeAt(0),node=rg.commonAncestorContainer,layer=(node.nodeType===1?node:node.parentElement)?.closest?.('.textLayer')||(node.nodeType===1&&node.querySelector?.('.textLayer')&&null);
    const paper=(layer||rg.startContainer.parentElement?.closest('.textLayer'))?.closest('[data-cvpaper]');if(!paper?._src||!root.contains(paper))return;
    const pr=paper.querySelector('.lp-sheet').getBoundingClientRect(),rects=[...rg.getClientRects()].filter(r=>r.width>1&&r.height>1&&r.left>=pr.left-1&&r.right<=pr.right+1).map(r=>({x:+((r.left-pr.left)/pr.width).toFixed(4),y:+((r.top-pr.top)/pr.height).toFixed(4),w:+(r.width/pr.width).toFixed(4),h:+(r.height/pr.height).toFixed(4)})).slice(0,40);
    evOpen({src:paper._src,text,rects,anchor:rg.getBoundingClientRect()});},0));
  // 쪽 보기(시안 17): 검색 결과에 나온 시험지를 원본 쪽 그대로 보고 넘긴다(공개 게이트웨이, 로그인 없음). 검색어는 형광펜(18).
  // 아래에는 그 쪽에 있는 문항이 나와 「근거·변형」을 바로 쓴다. 「PDF」는 시험지 원본을 새 창에서 연다.
  let pastPageSeq=0;
  function renderPastPage(body,items,list,seg){
    const f=pastFilter,exams=[];for(const i of list){if(i.publicPath&&!exams.some(x=>x.pdfFile===i.pdfFile))exams.push(i);}
    // 시험지 고르기: 최신 연도부터, 같은 해는 수능 → 9월 → 6월, 과목 이름순. [연도 ▾][시험 ▾][과목 ▾] 세 칸으로 나눠 고른다(한 목록에 다 늘어놓으면 찾기 어려움).
    exams.sort((a,b)=>b.year-a.year||Number(b.month)-Number(a.month)||String(a.subjectLabel).localeCompare(String(b.subjectLabel),'ko'));
    pastCache={html:'',node:null};
    if(!exams.length){body.innerHTML=`<div class="past-list"><div class="lp-viewbar">${seg}</div><p class="lp-count">볼 시험지가 없습니다. 검색어나 상세검색을 바꿔 보세요.</p></div>`;return;}
    const ex=exams.find(x=>x.pdfFile===f.pagefile)||exams[0],first=list.find(i=>i.pdfFile===ex.pdfFile),pageNo=Math.max(1,(ex.pdfFile===f.pagefile&&Number(f.pageno))||first?.page||1);if(f.pagefile!==ex.pdfFile||f.pageno!==pageNo){f.pagefile=ex.pdfFile;f.pageno=pageNo;store.set('past',f);}
    const examName=i=>`${i.year}학년도 ${MONTH[i.month]||i.month+'월'} ${i.subjectLabel}`;
    const onPage=items.filter(i=>i.pdfFile===ex.pdfFile&&Number(i.page)===pageNo).sort((a,b)=>(+a.no)-(+b.no)),hits=new Set(list.map(i=>i.id));
    const busy=api.pastBusy?.();
    body.innerHTML=`<div class="past-list lp-pageview"><div class="lp-viewbar">${seg}${(()=>{const firstOf=fn=>exams.find(fn)?.pdfFile,years=[...new Set(exams.map(x=>x.year))],months=[...new Set(exams.filter(x=>x.year===ex.year).map(x=>String(x.month)))],subs=exams.filter(x=>x.year===ex.year&&String(x.month)===String(ex.month));
        return `<span class="lp-exam-pick"><select data-cvpast="pagefile" aria-label="연도">${years.map(y=>`<option value="${E(firstOf(x=>x.year===y))}"${y===ex.year?' selected':''}>${y}학년도</option>`).join('')}</select><select data-cvpast="pagefile" aria-label="시험">${months.map(m=>`<option value="${E(firstOf(x=>x.year===ex.year&&String(x.month)===m))}"${m===String(ex.month)?' selected':''}>${E(MONTH[m]||m+'월')}</option>`).join('')}</select><select data-cvpast="pagefile" aria-label="과목">${subs.map(x=>`<option value="${E(x.pdfFile)}"${x===ex?' selected':''}>${E(x.subjectLabel)}</option>`).join('')}</select></span>`;})()}
      <span class="lp-pnav"><button type="button" data-cvpagestep="-1" aria-label="이전 쪽"${pageNo<=1?' disabled':''}>‹</button><span data-cvslot="pageno">${pageNo}쪽</span><button type="button" data-cvpagestep="1" aria-label="다음 쪽">›</button></span>
      <button type="button" class="lp-pageref" data-cvpageref title="이 쪽 전체를 근거로 연결">이 쪽을 근거로</button><a class="lp-pdf" href="${E(pdfHref(ex.publicPath,pageNo))}" target="_blank" rel="noopener" title="시험지 PDF 원본을 새 창에서 열기">PDF</a></div>
      <div class="lp-paper" data-cvpaper><span class="lp-paper-wait"><i aria-hidden="true"></i>원본 시험지 받는 중…</span></div>
      <div class="lp-qchips">${onPage.length?`<span class="lp-qnote">이 쪽의 문항</span>${onPage.map(i=>`<span class="lp-q${hits.has(i.id)?' on':''}" title="${E(i.title)}"><b>${E(i.no)}번</b><button type="button" class="mini" data-cvlink="${E(i.id)}" title="이 문항의 근거로 연결">${ICON.link}<span>근거</span></button><button type="button" class="mini go-mini" data-cvconvert="${E(i.id)}" title="편집 가능한 한글 문항으로 바꿔 새 문항 카드로 엽니다(AI 없음)"${busy?.id===i.id?' aria-busy="true"':''}>${busy?.id===i.id?busyHtml(busy.stage):'변형'}</button></span>`).join('')}`:'<span class="lp-qnote">이 쪽에는 색인된 문항이 없습니다</span>'}</div></div>`;
    const paper=body.querySelector('[data-cvpaper]'),seq=++pastPageSeq;
    mountPaper(paper,{path:ex.publicPath,page:pageNo,words:f.tokens.slice(),title:examName(ex),kind:'past'},()=>seq===pastPageSeq).then(r=>{if(!r||seq!==pastPageSeq)return;
      if(pageNo>r.pages){pastFilter.pageno=r.pages;store.set('past',pastFilter);renderPast();return;}
      const n=body.querySelector('[data-cvslot="pageno"]');if(n)n.textContent=`${pageNo} / ${r.pages}쪽`;const next=body.querySelector('[data-cvpagestep="1"]');if(next)next.disabled=pageNo>=r.pages;})
      .catch(()=>{if(seq===pastPageSeq&&paper.isConnected)paper.innerHTML='<span class="lp-paper-wait err">원본 시험지를 받지 못했습니다. 잠시 뒤 다시 누르거나 「PDF」로 열어 보세요.</span>';});
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
    // 연결 안 됨 안내에는 5E의 ChatGPT 연결 창을 여는 단추를 붙인다(카드 화면에는 로그인 단추가 따로 없음).
    const login=m.error&&/ChatGPT 로그인/.test(m.text||'')?`<div class="sg-act ai-login"><button type="button" class="mini go-mini" data-cv="ai-login">ChatGPT 로그인</button></div>`:'';
    return `<div class="msg ai${m.error?' err':''}${m.stale?' old':''}">${E(m.text)}${login}${questions}${items}${notes}${proposal}${legacy}${figs}${ev}${meta}</div>`;
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

  function setPanel(k,v){panels[k]=v;store.set(k,v);render();motion(k,v);}
  // 움직임(시안 exampool-motion.html): 칸을 열면 옆에서 0.22초 떠오르고, 닫으면 가운데가 부드럽게 다시 자리 잡는다. 보기를 바꾸면 새 내용만 0.2초 떠오른다.
  // 화면 구조는 바로 바뀌고(검사·키보드 그대로) 모양만 움직인다. 「동작 줄이기」 설정이면 CSS에서 모두 끈다.
  function anim(el,c){if(!el)return;el.classList.remove(c);void el.offsetWidth;el.classList.add(c);el.addEventListener('animationend',()=>el.classList.remove(c),{once:true});}
  function motion(k,v){
    if(k==='lib')anim(root.querySelector(v?'.cv-left':'.cv-center'),v?'ep-pane-in':'ep-reflow');
    if(k==='rightOpen'){anim(root.querySelector(v?'.cv-right':'.cv-center'),v?'ep-pane-in':'ep-reflow');if(v)anim(hwpLayer,'ep-pane-in');}
    if(k==='right')anim(panels.right==='paper'?hwpLayer:root.querySelector('.cv-rbody'),'ep-swap');
    if(k==='tab')anim(root.querySelector('.cv-left .lp-body:not([hidden])'),'ep-swap');
  }
  function edit(field,fn,light=true){api.edit(fn,{key:`card:${q()?.id}:${field}`,light});if(light)refreshLight();}

  root.addEventListener('input',e=>{
    const t=e.target,x=q();if(!x)return;
    if(t.matches('textarea'))fit(t);
    if(t.dataset.cvf){const f=t.dataset.cvf;edit(f,()=>{if(f==='passage'){const b=x.blocks.find(v=>v.kind==='text');if(b)b.text=t.value;else writeField(x,'passage',t.value);}else if(f==='points'){if(t.value.trim()!==''&&Number.isFinite(Number(t.value)))x.points=Number(t.value);}else writeField(x,f,t.value);});return;}
    if(t.dataset.cvline){const key=t.dataset.cvline,b=x.blocks.find(v=>v.kind===key),i=Number(t.dataset.i);edit(key,()=>{b.lines[i].text=t.value;});return;}
    if(t.dataset.cvct){const [r,c]=t.dataset.cvct.split(':').map(Number);edit('choiceTable',()=>{x.choiceTable.cells[r][c].value=t.value;delete x.choiceTable.cells[r][c].raw;});return;}
    if(t.dataset.cvchoice){const i=Number(t.dataset.cvchoice);edit('choices',()=>{x.choices[i].text=t.value;});return;}
    if(t.dataset.cvsrc!==undefined){srcQuery[panels.tab]=t.value;store.set('srcq',srcQuery);const src=document.querySelector('#source-search');if(src){src.value=t.value;src.dispatchEvent(new Event('input',{bubbles:true}));}return;}
    if(t.dataset.cvpast==='query'){pastFilter.query=t.value.trim();store.set('past',pastFilter);clearTimeout(t._timer);if(!pastComposing&&!e.isComposing)t._timer=setTimeout(renderPast,250);}
  });
  root.addEventListener('change',e=>{
    const t=e.target,x=q();
    if(t.dataset.cvscope!==undefined){if(t.value==='__lib'){t.value=panels.tab;api.pickLibrary?.(panels.tab==='textbooks'?'textbook':'past');return;}setPanel('tab',t.value);return;}
    if(t.dataset.cvpast==='pagefile')pastFilter.pageno=0;
    if(t.dataset.cvpast&&t.dataset.cvpast!=='query'){pastFilter[t.dataset.cvpast]=t.value;if(t.dataset.cvpast==='book')Object.assign(pastFilter,{query:'',bookpage:1});store.set('past',pastFilter);renderPast();return;}
    if(!x)return;
    if(t.dataset.cvans!==undefined){api.edit(()=>{x.answer=Number(t.dataset.cvans);});return;}
    if(t.matches('[data-points3]')){api.edit(()=>{x.points=t.checked?3:2;});return;}
  });
  root.addEventListener('error',e=>{const img=e.target;if(!img?.dataset?.pastThumb)return;const fb=img.dataset.fallback;
    if(fb&&!img.src.includes(fb)){img.src=fb;return;}const p=document.createElement('p');p.className='past-text';p.textContent=(pastItem(img.dataset.pastThumb)?.text||'').slice(0,160);img.replaceWith(p);},true);
  root.addEventListener('toggle',e=>{if(e.target.matches?.('details.f-more'))store.set('more',e.target.open);},true);
  root.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;const x=q(),d=b.dataset;
    if(d.cvOpen){api.open(d.cvOpen);return;}
    if(d.cvtab){setPanel('tab',d.cvtab);return;}
    if(d.cvright){panels.rightOpen=true;store.set('rightOpen',true);setPanel('right',d.cvright);return;}
    if(d.cvview){setView(d.cvview);return;}
    if(d.cvbookview){root.querySelector('.lp-zoom')?.remove();pastZoom=-1;pastZoomKey='';pastFilter.bookview=d.cvbookview;store.set('past',pastFilter);b.parentElement.querySelectorAll('button').forEach(n=>n.setAttribute('aria-pressed',n===b));renderPast().then(()=>anim(root.querySelector('[data-cvbody="past"]>.past-list'),'ep-swap'));return;}
    if(d.cvbookstep){const n=Number(root.querySelector('[data-cvslot="pageno"]')?.textContent.match(/\d+/)?.[0])||1;Object.assign(pastFilter,{bookpage:Math.max(1,n+Number(d.cvbookstep)),query:''});store.set('past',pastFilter);renderPast();return;}
    if(d.cvpageref!==undefined){const paper=root.querySelector('[data-cvpaper]');if(paper?._src)evOpen({src:paper._src,text:'',rects:[],anchor:null});return;}
    if(d.evcancel!==undefined){root.querySelector('.ev-pop')?.remove();evPending=null;getSelection()?.removeAllRanges();return;}
    if(d.evadd!==undefined){const ev=evPending,pop=root.querySelector('.ev-pop');if(ev&&x&&pop){const sel=pop.querySelector('[data-evtarget]'),target=sel.value,tname=sel.selectedOptions[0].textContent,note=pop.querySelector('[data-evnote]').value.trim(),s=ev.src;
        api.edit(()=>{x.references.push({target,label:`${s.title} ${s.page}쪽`,quote:(ev.text||'').slice(0,2000),page:s.page,note,source:{kind:s.kind,title:s.title,path:s.path,page:s.page,bookId:s.bookId||'',sha:s.sha||'',fp:s.fp||'',rects:ev.rects||[],at:new Date().toISOString()}});});
        api.status?.(`${s.title} ${s.page}쪽${ev.text?'의 고른 글':''}을 「${tname}」의 근거로 연결했습니다.`);}
      pop?.remove();evPending=null;getSelection()?.removeAllRanges();return;}
    if(d.cvref!==undefined){const r=x?.references[Number(d.cvref)],s=r?.source;if(!s?.path)return;
      if(s.kind==='textbook')Object.assign(pastFilter,{bookview:'page',bookpage:s.page,book:s.bookId||pastFilter.book,query:''});else Object.assign(pastFilter,{view:'page',pagefile:s.path.split('/').pop(),pageno:s.page});
      store.set('past',pastFilter);panels.lib=true;store.set('lib',true);panels.tab=s.kind==='textbook'?'textbooks':'past';store.set('tab',panels.tab);render();return;}
    if(d.cvrefdel!==undefined){const i=Number(d.cvrefdel);if(x?.references[i])cardEdit('references',()=>{x.references.splice(i,1);});return;}
    if(d.cvtopage){const i=pastItem(d.cvtopage);if(i){root.querySelector('.lp-zoom')?.remove();pastZoom=-1;pastZoomKey='';Object.assign(pastFilter,{view:'page',pagefile:i.pdfFile,pageno:Number(i.page)});store.set('past',pastFilter);render();}return;}
    if(d.cvpastview){root.querySelector('.lp-zoom')?.remove();pastZoom=-1;pastZoomKey='';pastFilter.view=d.cvpastview;store.set('past',pastFilter);b.parentElement.querySelectorAll('button').forEach(n=>n.setAttribute('aria-pressed',n===b));renderPast().then(()=>anim(root.querySelector('[data-cvbody="past"]>.past-list'),'ep-swap'));return;}
    if(d.cv==='to-page'){setView('page');return;}
    if(d.cv==='toggle-lib'){setPanel('lib',!panels.lib);return;}
    if(d.cv==='toggle-right'){setPanel('rightOpen',!panels.rightOpen);return;}
    if(d.cv==='hwp-download'||d.cv==='hwp-save'){hwpLayer.querySelector(d.cv==='hwp-save'?'#typeset-save':'#typeset-download')?.click();return;}
    if(d.cv==='new'){api.newQuestion();return;}
    if(d.cvadv!==undefined){pastAdvOpen=!pastAdvOpen;b.setAttribute('aria-expanded',pastAdvOpen);const pop=root.querySelector('[data-cvslot="adv"]');if(pop)pop.hidden=!pastAdvOpen;return;}
    if(d.cvpagestep){const n=root.querySelector('[data-cvslot="pageno"]')?.textContent.match(/\d+/);pastFilter.pageno=Math.max(1,(Number(n?.[0])||1)+Number(d.cvpagestep));store.set('past',pastFilter);renderPast();return;}
    if(d.cvadvclear!==undefined){Object.assign(pastFilter,{subject:'',part:'',year:''});store.set('past',pastFilter);renderPast();return;}
    if(d.cvbooklink!==undefined){const bk=books?.find(v=>v.id===(pastFilter.book||books[0]?.id))||books?.[0];if(bk&&x){api.edit(()=>{x.references.push({target:'question',label:`${bk.title} ${d.cvbooklink}쪽`,quote:''});});api.status?.(`${bk.title} ${d.cvbooklink}쪽을 근거로 연결했습니다.`);}return;}
    if(d.cvzoomnav!==undefined){zoomTo(pastZoom+Number(d.cvzoomnav));return;}
    if(d.cvzoomclose!==undefined){zoomTo(-1);return;}
    if(d.cvtoken!==undefined){pastFilter.tokens=pastFilter.tokens.filter(w=>w!==d.cvtoken);store.set('past',pastFilter);pastRefocus=true;renderPast();return;}
    if(d.cvlinked!==undefined){const a=b.closest('.cv-lib');const on=!a.classList.contains('show-linked');a.classList.toggle('show-linked',on);b.setAttribute('aria-expanded',on);return;}
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
    if(d.cvlineRemove){const key=d.cvlineRemove,i=Number(d.i);api.edit(()=>{const blk=x.blocks.find(v=>v.kind===key);blk.lines.splice(i,1);if(key==='bogi'&&!isCombo(x)&&!blk.lines.length){x.blocks=x.blocks.filter(v=>v!==blk);return;}if(key==='bogi'){const L=['ㄱ','ㄴ','ㄷ','ㄹ','ㅁ','ㅂ','ㅅ','ㅇ'];blk.lines.forEach((l,j)=>l.label=L[j]||String(j+1));}else if(key==='steps'){const C=['(가)','(나)','(다)','(라)','(마)','(바)','(사)','(아)'];blk.lines.forEach((l,j)=>l.label=C[j]||`(${j+1})`);}});return;}
    if(d.cvcombo!==undefined){const i=Number(d.cvcombo),letter=d.letter;api.edit(()=>{const set=new Set(x.choices[i].text.split(/\s*,\s*/).filter(Boolean));set.has(letter)?set.delete(letter):set.add(letter);const order=(bogiOf(x)?.lines||[]).map(l=>l.label);x.choices[i].text=normalizeCombo([...set].sort((a,b)=>order.indexOf(a)-order.indexOf(b)).join(', '));});return;}
    if(d.cvunit){cardEdit('unit',()=>{x.unitLarge=d.cvunit;});return;}
    if(d.cvsource){const k=d.cvsource,orig=(x.references||[]).find(r=>/^원본 기출 · /.test(r.label));cardEdit('source',()=>{x.source=k==='기출 변형'&&orig?`기출 변형 · ${orig.label.replace(/^원본 기출 · /,'')}`:k==='기타'?(sourceKind(x)==='기타'?x.source:''):k;});if(k==='기타')setTimeout(()=>root.querySelector('[data-cvf="source"]')?.focus(),0);return;}
    if(d.cv==='exp-skeleton'){const sk=explanationSkeleton(x);if(sk)cardEdit('explanation',()=>{x.explanation=x.explanation?.trim()?`${x.explanation.trimEnd()}\n\n${sk}`:sk;});setTimeout(()=>{const t=root.querySelector('[data-cvf="explanation"]');if(t){t.focus();t.setSelectionRange(t.value.length,t.value.length);}},0);return;}
    if(d.cvpoints){cardEdit('points',()=>{x.points=Number(d.cvpoints);});return;}
    if(d.cvtruth!==undefined){const l=bogiOf(x)?.lines?.[Number(d.cvtruth)];if(!l)return;const v=d.v==='1';cardEdit('truth',()=>{if(l.truth===v)delete l.truth;else l.truth=v;const right=comboRight(x);if(right!==null){const i=x.choices.findIndex(c=>normalizeCombo(c.text)===right);if(i>=0)x.answer=i;}});return;}
    if(d.cvcombofill!==undefined){const set=COMBO_STATS.top[Number(d.cvcombofill)]?.[0];if(set)cardEdit('choices',()=>{x.choices.forEach((c,i)=>c.text=set[i]);const right=comboRight(x);if(right!==null){const i=x.choices.findIndex(c=>normalizeCombo(c.text)===right);if(i>=0)x.answer=i;}});return;}
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
    if(d.cv==='ai-login'){api.login?.();return;}
    if(d.cvprop){api.proposal?.(x,d.cvprop,d.act);return;}
    if(d.cvrevert!==undefined){api.revert?.(x,Number(d.cvrevert));return;}
    if(d.cvfig){const [i,j]=d.cvfig.split(':').map(Number),f=x.reviews?.[i]?.figures?.[j];if(f)api.figure?.(x,f);return;}
    if(d.cvremake){const request=prompt('어떻게 고칠까요? (비우면 같은 설명으로 다시 만듭니다)','');if(request===null)return;api.remakeFigure?.(x,d.cvremake,request.trim());return;}
    if(d.cvgraphedit){api.editGraph?.(x,d.cvgraphedit);return;}
    if(d.aiApply!==undefined){const m=x.reviews?.[Number(d.aiApply)];if(m?.suggestion)api.applySuggestion(x,m.suggestion);return;}
  });
  // 유형 메뉴: 바깥을 누르거나 Esc면 닫는다.
  document.addEventListener('pointerdown',e=>{if(shapeOpen&&!e.target.closest?.('.cv-shape-wrap'))setShape(false);});
  root.addEventListener('keydown',e=>{if(!shapeOpen)return;if(e.key==='Escape'){e.preventDefault();setShape(false);root.querySelector('.cv-shape')?.focus();return;}
    // 메뉴(role=menu) 안에서 ↑↓·Home·End로 항목을 옮긴다.
    const items=[...root.querySelectorAll('.cv-shape-menu [data-cvform]')],i=items.indexOf(document.activeElement);
    const to={ArrowDown:(i+1)%items.length,ArrowUp:(i-1+items.length)%items.length,Home:0,End:items.length-1}[e.key];
    if(to!==undefined&&items.length){e.preventDefault();items[i<0&&e.key==='ArrowUp'?items.length-1:i<0&&e.key==='ArrowDown'?0:to].focus();}});
  // 한글 입력: 조합 중에는 목록을 다시 그리지 않고(입력 칸이 바뀌면 조합이 끊김), 조합 중 Enter는 마지막 글자가 확정된 뒤(compositionend) 조각으로 넣는다.
  // Safari는 조합 끝(compositionend)을 Enter보다 먼저 보내기도 한다 → 그때는 keyCode 229 Enter로 들어오므로 바로 넣는다.
  root.addEventListener('compositionstart',e=>{if(e.target.dataset?.cvpast==='query')pastComposing=true;});
  root.addEventListener('compositionend',e=>{const t=e.target;if(t.dataset?.cvpast!=='query')return;pastComposing=false;
    if(pastEnterPending){pastEnterPending=false;clearTimeout(t._timer);const v=t.value;t.value='';if(addPastWords({value:v})===false)t.value=v;}
    else{pastFilter.query=t.value.trim();store.set('past',pastFilter);clearTimeout(t._timer);t._timer=setTimeout(renderPast,250);}});
  root.addEventListener('keydown',e=>{const t=e.target;if(t.dataset?.cvpast!=='query')return;
    if(e.key==='Enter'&&(e.isComposing||pastComposing)){e.preventDefault();pastEnterPending=true;return;}
    // Enter 순간의 글을 바로 떼어 낸다(미루면 빠르게 이어 친 다음 단어가 같은 조각에 붙음: 「자석」 Enter 「질량」 → 「자석질량」).
    if(e.key==='Enter'){e.preventDefault();clearTimeout(t._timer);const v=t.value;t.value='';if(addPastWords({value:v})===false)t.value=v;}
    else if(e.key==='Backspace'&&!t.value&&pastFilter.tokens.length){e.preventDefault();pastFilter.tokens=pastFilter.tokens.slice(0,-1);store.set('past',pastFilter);renderPast();}});
  root.addEventListener('keydown',e=>{const t=e.target;if(t.dataset?.cvline&&e.key==='Enter'&&!e.isComposing&&!e.shiftKey){e.preventDefault();const all=[...root.querySelectorAll(`[data-cvline="${t.dataset.cvline}"]`)],n=all[all.indexOf(t)+1];n?.focus();}});
  root.addEventListener('keydown',e=>{if(e.target.id==='cv-ai-input'&&e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();root.querySelector('[data-cv="ai-send"]')?.click();}});
  // 칸 경계 끌기: 왼쪽 경계는 라이브러리 폭, 오른쪽 경계는 미리보기·AI 폭. 두 번 누르면 기본 폭.
  root.addEventListener('pointerdown',e=>{const sp=e.target.closest('.cv-split');if(!sp)return;e.preventDefault();sp.setPointerCapture(e.pointerId);sp.classList.add('drag');document.body.classList.add('cv-dragging');
    const k=sp.dataset.cvsplit,rect=root.getBoundingClientRect(),min=k==='left'?240:300,max=Math.max(min,rect.width-440-(k==='left'?(panels.rightOpen?root.querySelector('.cv-right').offsetWidth:0):(panels.lib?root.querySelector('.cv-left').offsetWidth:0)));
    // 잡은 곳에서 움직인 만큼만 폭을 바꾼다(바깥 여백이 있어도 잡는 순간 칸이 튀지 않음).
    const x0=e.clientX,w0=root.querySelector(k==='left'?'.cv-left':'.cv-right').getBoundingClientRect().width;
    // 창이 좁아 지금 폭이 이미 상한보다 넓으면, 상한을 지금 폭으로 둔다(잡는 순간 줄어들지 않고 줄이는 쪽으로만 움직임).
    const move=ev=>{const w=Math.round(Math.max(min,Math.min(Math.max(max,w0),k==='left'?w0+ev.clientX-x0:w0-(ev.clientX-x0))));root.style.setProperty(k==='left'?'--cv-lw':'--cv-rw',w+'px');fitPaper();};
    const up=ev=>{sp.classList.remove('drag');document.body.classList.remove('cv-dragging');sp.removeEventListener('pointermove',move);sp.removeEventListener('pointerup',up);store.set(k==='left'?'lw':'rw',Math.round(parseInt(getComputedStyle(root).getPropertyValue(k==='left'?'--cv-lw':'--cv-rw'))*(k==='left'?scaleL:scaleR)));fitPaper();fitPage();};
    sp.addEventListener('pointermove',move);sp.addEventListener('pointerup',up);});
  // 상세검색 창: 바깥을 누르면 닫힌다.
  root.addEventListener('pointerdown',e=>{if(!pastAdvOpen||e.target.closest?.('.lp-adv-pop,[data-cvadv]'))return;pastAdvOpen=false;const pop=root.querySelector('[data-cvslot="adv"]');if(pop)pop.hidden=true;root.querySelector('[data-cvadv]')?.setAttribute('aria-expanded','false');},true);
  // 문항(교과서 쪽) 더블클릭 → 라이브러리 칸 안에서 크게 보기. ← → 이전·다음, Esc 닫기.
  // 크게 보기 중에 카드 화면이 다시 그려지면(근거로 연결·화면 색 바꾸기 등) 같은 문항을 찾아 다시 띄운다. 목록에서 빠졌으면 닫는다.
  const zoomKey=f=>{const b=f.querySelector('[data-cvlink],[data-cvbooklink],[data-cvpick-link]');return b?JSON.stringify(b.dataset):'';};
  function reopenZoom(){if(!pastZoomKey)return;const figs=[...root.querySelectorAll('.cv-left .past-list figure.past')],i=figs.findIndex(f=>zoomKey(f)===pastZoomKey);if(i<0){pastZoom=-1;pastZoomKey='';root.querySelector('.lp-zoom')?.remove();return;}zoomTo(i);}
  // 크게 보기 아래 줄(시안 27): [시험지 쪽에서 보기][PDF] ··· [근거로 연결][변형]. 근거·변형은 목록 카드에서는 숨겨 두고 여기서만 보인다.
  function zoomFoot(f){const id=f.querySelector('[data-cvlink]')?.dataset.cvlink,i=id&&pastItem(id),acts=(f.querySelector('.acts')?.innerHTML||'').replace('<span>근거</span>','<span>근거로 연결</span>');
    return `${i?.publicPath?`<button type="button" class="mini" data-cvtopage="${E(i.id)}" title="이 문항이 있는 시험지 쪽을 봅니다">시험지 쪽에서 보기</button><a class="mini lp-pdf-link" href="${E(pdfHref(i.publicPath,i.page))}" target="_blank" rel="noopener" title="시험지 PDF 원본을 새 창에서 열기">PDF</a>`:''}<span class="sp"></span>${acts}`;}
  function zoomTo(i){
    root.querySelector('.lp-zoom')?.remove();
    const figs=[...root.querySelectorAll('.cv-left .past-list figure.past')],lib=root.querySelector('.cv-left');
    if(i<0||!figs.length||!lib){pastZoom=-1;pastZoomKey='';return;}
    pastZoom=Math.max(0,Math.min(figs.length-1,i));const f=figs[pastZoom];pastZoomKey=zoomKey(f);const img=f.querySelector('img'),b=f.querySelector('figcaption b');
    const src=img?.dataset.full||img?.getAttribute('src')||img?.dataset.card||'',meta=(b?.title||'').split(' · ').slice(1).join(' · ');
    lib.insertAdjacentHTML('beforeend',`<div class="lp-zoom" role="dialog" aria-label="크게 보기"><div class="lp-zoom-head"><b>${E(b?.textContent||'')}</b><span class="meta">${E(meta)}</span><span class="sp"></span><button type="button" class="mini" data-cvzoomnav="-1" aria-label="이전"${pastZoom?'':' disabled'}>${ICON.left}</button><span class="pos">${pastZoom+1} / ${figs.length}</span><button type="button" class="mini" data-cvzoomnav="1" aria-label="다음"${pastZoom<figs.length-1?'':' disabled'}>${ICON.right}</button><button type="button" class="mini" data-cvzoomclose aria-label="닫기 (Esc)" title="닫기 (Esc)">${ICON.close}</button></div><div class="lp-zoom-pic">${src?`<img src="${E(src)}" alt="${E(b?.textContent||'')}">`:''}</div><div class="lp-zoom-foot">${zoomFoot(f)}</div></div>`);
    root.querySelector('.lp-zoom [data-cvzoomclose]')?.focus({preventScroll:true});
    // 크게 보기는 원본 PDF에서 문항만 선명하게 다시 그린다(검색어가 있으면 형광펜 포함). 받는 동안·실패하면 카드 그림 그대로.
    const id=f.querySelector('[data-cvlink]')?.dataset.cvlink,item=id&&pastItem(id),zimg=root.querySelector('.lp-zoom-pic img');
    if(item?.publicPath&&Array.isArray(item.box)&&zimg){const key=pastZoomKey;zimg.closest('.lp-zoom-pic').setAttribute('data-marking','');croppedQuestion(item,pastFilter.tokens.slice()).then(r=>{if(r&&zimg.isConnected&&pastZoomKey===key)zimg.src=r.url;}).catch(()=>{}).finally(()=>zimg.closest('.lp-zoom-pic')?.removeAttribute('data-marking'));}
  }
  root.addEventListener('dblclick',e=>{const f=e.target.closest('.cv-left .past-list figure.past');if(!f||e.target.closest('button'))return;
    if(f.classList.contains('book')){Object.assign(pastFilter,{bookview:'page',bookpage:Number(f.dataset.page)||1,query:''});store.set('past',pastFilter);render();return;}zoomTo([...root.querySelectorAll('.cv-left .past-list figure.past')].indexOf(f));});
  // Esc·←→는 문서 전체에서 받는다(상세검색에서 고른 뒤 다시 그리면 커서가 칸 밖 body로 빠지기 때문, WebKit).
  root.ownerDocument.addEventListener('keydown',e=>{
    if(pastZoom>=0&&root.querySelector('.lp-zoom')){if(e.key==='Escape'){e.preventDefault();zoomTo(-1);return;}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){if(e.target.matches?.('input,textarea,select'))return;e.preventDefault();zoomTo(pastZoom+(e.key==='ArrowRight'?1:-1));return;}}
    if(pastAdvOpen&&e.key==='Escape'){pastAdvOpen=false;const pop=root.querySelector('[data-cvslot="adv"]');if(pop)pop.hidden=true;root.querySelector('[data-cvadv]')?.setAttribute('aria-expanded','false');}
  });
  root.addEventListener('dblclick',e=>{const sp=e.target.closest('.cv-split');if(!sp)return;store.set(sp.dataset.cvsplit==='left'?'lw':'rw',null);render();});
  // 한글 창에서 고친 글을 카드 칸에 옮긴다(입력 중인 칸은 건드리지 않는다). 카드 전체를 다시 그리지 않아 한글 창 입력이 끊기지 않는다.
  function syncFields(target){const x=q();if(!x||x!==target)return;
    for(const t of root.querySelectorAll('[data-cvf]')){if(t===document.activeElement)continue;const f=t.dataset.cvf;
      const v=f==='passage'?(x.blocks.find(b=>b.kind==='text')?.text||''):f==='answer'?(x.modelAnswer||''):f==='points'?String(x.points??''):String(x[f]??'');
      if(t.value!==v){t.value=v;if(t.tagName==='TEXTAREA')fit(t);}}
    refreshLight();}
  return {render,refreshLight,setView,syncFields,
    clearSourceSearch(){srcQuery[panels.tab]='';store.set('srcq',srcQuery);const n=root.querySelector('[data-cvsrc]');if(n)n.value='';},refreshLibrary(){if(panels.lib&&['past','textbooks'].includes(panels.tab))renderPast();},
    // 「보내기 → ExamPool」로 받은 자료가 보이게: 라이브러리 칸을 열고 기출·교과서 탭이 아니면 기출 탭으로(가져온 자료는 목록 맨 위).
    showPicks(){panels.lib=true;store.set('lib',true);if(!['past','textbooks'].includes(panels.tab)){panels.tab='past';store.set('tab','past');}render();},showHwp(){panels.rightOpen=true;panels.right='paper';store.set('rightOpen',true);store.set('right','paper');render();},refreshAi(){if(panels.rightOpen&&panels.right==='ai'){renderAi();markAiSeen();}else{const r=root.querySelector('.cv-rseg [data-cvright="ai"]');if(r&&q()){const n=unseenAi(q());r.querySelector('.badge')?.remove();if(n)r.insertAdjacentHTML('beforeend',`<i class="badge">${n}</i>`);}}},showAi(){panels.rightOpen=true;store.set('rightOpen',true);panels.right='ai';store.set('right','ai');render();},toggleNav(){setPanel('nav',!panels.nav);},get navOpen(){return panels.nav;},get tab(){return panels.tab;}};
}
