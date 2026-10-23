// 「⚙ 조판 설정」(10-23 사용자 결정, 시안 5e-design-mockups/typeset-settings-1023-v3.html).
// 평소 조판 칸에서는 글만 고치고(구조 늘 잠금), 틀은 이 설정 판 하나에서 바꾼다. 미리보기는 옆의 실제 조판 칸 그대로.
// 값은 조판 기준(typeset-standard.js)에 들어가 그 기준을 쓰는 모든 문항에 걸린다. 「이 문항만 예외」는 그 문항만 쓰는 복사본.
// 고른 부분은 미리보기에 파란 띠로 표시(조판 부호의 빨간 V·초록 선과 겹치지 않게 단 바깥 왼쪽).
import {KICE_STANDARD,KICE_ID} from './typeset-standard.js';
import {questionElements} from './typeset-gaps.js';

const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const get=(o,path)=>path.split('.').reduce((v,k)=>v?.[k],o);
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const ICON={
  gear:'<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  close:'<path d="M6 6l12 12M18 6L6 18"/>',
  gaps:'<path d="M4 6h16M4 18h16M12 9v6M10 11l2-2 2 2M10 13l2 2 2-2"/>',
  marks:'<path d="M5 8l3.5 7L12 8" stroke="#da3633"/><path d="M17 5v14M15 5h4" stroke="rgba(46,160,67,.95)"/>',
  chev:'<path d="m6 9 6 6 6-6"/>',
};
const svg=(name,size=16)=>`<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;
export const settingsButtonHtml=()=>`<button type="button" id="typeset-settings" class="ts-settings-open" aria-haspopup="dialog" aria-expanded="false" title="조판 설정 — 글꼴·간격·상자·표·〈보기〉·선지·쪽을 한곳에서(모든 문항에 적용)">${svg('gear',15)}<span>조판 설정</span></button>`;

// 값 칸: n 이름, p 기준 경로, u 단위, step·min·max. sel=고르기, tog=켜고 끄기(on/off 값).
const N=(p,n,u,step,min,max)=>({t:'num',p,n,u,step,min,max});
const S=(p,n,opts)=>({t:'sel',p,n,opts});
const T=(p,n,on=true,off=false)=>({t:'tog',p,n,on,off});
const I=(n,text)=>({t:'info',n,text});
const textTabs={
  '글자':[{h:'글자 (지문·발문·선지 공통)',rows:[[S('text.font','글꼴',['함초롬바탕','함초롬돋움','신명 중명조']),N('text.size','크기','pt',.5,6,20)],[N('text.ratio','장평','%',1,50,200),N('text.spacing','자간','%',1,-50,50)]]}],
  '문단':[{h:'문단',rows:[[N('text.lineSpacing','줄 간격','%',5,80,300),S('text.align','정렬',[['justify','양쪽'],['left','왼쪽']])]]},{h:'줄 나눔',rows:[[S('text.break','한글 단위',[['word','어절'],['char','글자']])]]}],
  '줄 맞춤':[{h:'윗줄부터 자간 맞춤 (입력할 때 자동)',rows:[[T('fit.on','켜기')],[N('fit.low','자간 최소','%',1,-20,0),N('fit.high','자간 최대','%',1,0,20)],[N('fit.shortLastLine','짧은 끝 줄','%',1,0,50)]]}],
};
export const PARTS=[
  {k:'text',name:'지문',tabs:textTabs,match:b=>b.kind==='text'},
  {k:'box',name:'자료 상자',match:b=>b.kind==='group'&&(b.boxed===true||b.boxed===undefined&&b.label==='실험')||b.kind==='steps'||b.kind==='dialogue',
    tabs:{'상자':[{h:'안 여백',rows:[[N('gaps.boxPadSide','좌우','mm',.1,0,20),N('gaps.boxPadTop','위','mm',.1,0,20)],[N('gaps.boxPadBottom','아래','mm',.1,0,20)]]},
      {h:'선 · 뒤 간격',rows:[[N('parts.rule','선 굵기','mm',.01,.05,1),N('gaps.after','뒤 간격','mm',.1,0,20)]]},
      {h:'폭',rows:[[I('너비','번호 뒤부터 단 끝까지(고정)')]]}]}},
  {k:'table',name:'상자 안 표',match:b=>b.kind==='table'||b.kind==='group'&&(b.boxed===true||b.boxed===undefined&&b.label==='실험'),
    tabs:{'표/셀':[{h:'칸',rows:[[N('parts.cellPad','칸 안 여백','mm',.01,0,5),N('parts.tableLineSpacing','칸 줄 간격','%',5,80,300)]]},
      {h:'선',rows:[[N('parts.rule','선 굵기','mm',.01,.05,1)]]},
      {h:'크기',rows:[[I('전체 폭','고정 · 열 비율만 미리보기에서')]]}]}},
  {k:'figure',name:'그림',match:b=>b.kind==='figure'||b.kind==='group'&&b.layout==='나란히'&&b.boxed!==true,
    tabs:{'그림':[{h:'크기',rows:[[I('너비','칸 폭에 꽉 채움 · 높이는 비율대로')],[I('세부 크기','미리보기에서 그림 모서리를 끌어 조절')]]},
      {h:'뒤 간격',rows:[[N('gaps.after','뒤 간격','mm',.1,0,20)]]}]}},
  {k:'ask',name:'발문',match:'ask',tabs:{...textTabs,'간격':[{h:'앞 간격(더함)',rows:[[N('gaps.ask','발문 앞','mm',.1,0,20)]]}]}},
  {k:'bogi',name:'〈보기〉',match:b=>b.kind==='bogi',
    tabs:{'보기 상자':[{h:'제목',rows:[[N('parts.bogiTitleWidth','칸 폭','mm',.1,5,40),N('parts.bogiTitlePad','칸 좌우','mm',.01,0,5)]]},
      {h:'안 여백',rows:[[N('gaps.bogiPadSide','좌우','mm',.1,0,20),N('gaps.bogiPadTop','위','mm',.1,0,20)],[N('gaps.bogiPadBottom','아래','mm',.1,0,20)]]},
      {h:'ㄱ·ㄴ·ㄷ',rows:[[N('parts.bogiLineSpacing','줄 간격','%',5,80,300)],[T('parts.labelSpace','「ㄱ.」「①」 뒤 고정 띄어쓰기','fixed','space')]]},
      {h:'선 · 앞 간격',rows:[[N('parts.rule','선 굵기','mm',.01,.05,1),N('gaps.bogi','앞 간격','mm',.1,0,20)]]}]}},
  {k:'choices',name:'선지',match:'choices',
    tabs:{'선지 배열':[{h:'탭 간격 (① 시작선부터 · 들어갈 때만)',rows:[[N('parts.choiceTabs.0','5개 한 줄','mm',.1,5,60),N('parts.choiceTabs.1','3+2','mm',.1,10,80)],[N('parts.choiceTabs.2','2개씩','mm',.1,20,100)]]},
      {h:'기호',rows:[[T('parts.labelSpace','「ㄱ.」「①」 뒤 고정 띄어쓰기','fixed','space')]]},
      {h:'앞 간격(더함)',rows:[[N('gaps.choices','선지 앞','mm',.1,0,20)]]}]}},
  {k:'gaps',name:'간격',match:null,
    tabs:{'간격':[{h:'요소 앞에 더하는 간격',rows:[[N('gaps.text','지문','mm',.1,0,20),N('gaps.material','자료','mm',.1,0,20)],[N('gaps.ask','발문','mm',.1,0,20),N('gaps.bogi','〈보기〉','mm',.1,0,20)],[N('gaps.choices','선지','mm',.1,0,20)]]},
      {h:'자료 뒤 간격 (상자·표·그림)',rows:[[N('gaps.after','뒤 간격','mm',.1,0,20)]]}]}},
  {k:'paper',name:'쪽·단',match:null,
    tabs:{'편집 용지':[{h:'단',rows:[[S('paper.columns','단 수',[[2,'2단'],[1,'1단']]),N('paper.columnGap','단 간격','mm',.5,0,30)]]},
      {h:'여백',rows:[[N('paper.margin.top','위','mm',1,5,40),N('paper.margin.bottom','아래','mm',1,5,40)],[N('paper.margin.left','왼쪽','mm',1,5,40),N('paper.margin.right','오른쪽','mm',1,5,40)]]}]}},
];
// 표시 자릿수: mm 값은 0.01까지(1.54처럼 원본 환산값이 잘리지 않게), 나머지는 단계 자릿수.
const decimals=(step,u)=>u==='mm'?2:String(step).includes('.')?String(step).split('.')[1].length:0;

export function attachTypesetSettings({bridge,host,panel,context,onSetting,onStandard,gaps,marks}){
  const doc=host.ownerDocument;
  const controls=panel.querySelector('.typeset-view-controls');
  if(!controls.querySelector('#typeset-settings'))controls.querySelector('.ts-scope')?.insertAdjacentHTML('afterend',settingsButtonHtml());
  const open=controls.querySelector('#typeset-settings');
  const pop=doc.createElement('section');pop.className='ts-settings';pop.hidden=true;pop.setAttribute('role','dialog');pop.setAttribute('aria-label','조판 설정');
  doc.body.append(pop);
  const layer=doc.createElement('div');layer.className='ts-part-layer';layer.hidden=true;host.append(layer);
  let part='bogi',tab=0,menu=false,timer=0,pending=null;

  const standard=()=>context().standard||KICE_STANDARD;
  const exceptionOn=()=>{const {q}=context(),s=standard();return !!q&&s.source?.kind==='exception'&&s.source.qid===q.id;};
  const value=f=>{const v=get(standard(),f.p);return v===undefined?get(KICE_STANDARD,f.p):v;};
  function field(f){
    if(f.t==='info')return `<div class="tsf info"><span class="n">${E(f.n)}</span><span class="v">${E(f.text)}</span></div>`;
    const v=value(f),base=get(KICE_STANDARD,f.p),diff=JSON.stringify(v)!==JSON.stringify(base)?' diff':'',title=diff?` title="수능 틀 ${E(base)}${f.u?E(f.u):''}와 다름"`:'';
    if(f.t==='tog')return `<label class="tsf tog${diff}"${title}><span class="n">${E(f.n)}</span><input type="checkbox" data-p="${f.p}" ${v===f.on?'checked':''}><span class="sw" aria-hidden="true"></span></label>`;
    if(f.t==='sel')return `<label class="tsf sel${diff}"${title}><span class="n">${E(f.n)}</span><select data-p="${f.p}">${f.opts.map(o=>{const [ov,ol]=Array.isArray(o)?o:[o,o];return `<option value="${E(ov)}" ${String(ov)===String(v)?'selected':''}>${E(ol)}</option>`;}).join('')}</select>${svg('chev',12)}</label>`;
    return `<label class="tsf num${diff}"${title}><span class="n" data-scrub="${f.p}">${E(f.n)}</span><input inputmode="decimal" data-p="${f.p}" data-step="${f.step}" data-u="${f.u||''}" data-min="${f.min}" data-max="${f.max}" value="${Number(v).toFixed(decimals(f.step,f.u))}"><span class="u">${E(f.u||'')}</span></label>`;
  }
  const fieldOf=p=>PARTS.flatMap(x=>Object.values(x.tabs).flat().flatMap(g=>g.rows.flat())).find(f=>f.p===p);
  function render(){
    const {q,standards=[]}=context(),s=standard(),P=PARTS.find(x=>x.k===part),names=Object.keys(P.tabs);if(tab>=names.length)tab=0;
    const shared=standards.filter(x=>x.source?.kind!=='exception');
    const pick=exceptionOn()?s.source?.from||KICE_ID:s.id;
    const changed=k=>{const X=PARTS.find(x=>x.k===k);return Object.values(X.tabs).flat().flatMap(g=>g.rows.flat()).some(f=>f.p&&JSON.stringify(value(f))!==JSON.stringify(get(KICE_STANDARD,f.p)));};
    pop.innerHTML=`<header class="tss-head"><b>조판 설정</b><span class="sp"></span>
      <label class="tss-pick" title="틀 — 이 틀을 쓰는 모든 문항에 걸립니다"><select data-std-pick aria-label="틀">${[[KICE_ID,'수능 틀'],...shared.map(x=>[x.id,x.name])].map(([id,n])=>`<option value="${E(id)}" ${id===pick?'selected':''}>${E(n)}</option>`).join('')}</select>${svg('chev',12)}</label>
      <button type="button" class="tss-ic" data-menu aria-label="틀 메뉴" aria-expanded="${menu}">${svg('more')}</button>
      <button type="button" class="tss-ic" data-close aria-label="조판 설정 닫기">${svg('close')}</button></header>
      ${menu?`<div class="tss-menu" role="menu"><button role="menuitem" data-act="saveAs">지금 틀을 새 이름으로 저장…</button><button role="menuitem" data-act="export">틀 파일로 내보내기</button><button role="menuitem" data-act="import">틀 파일 가져오기…</button><button role="menuitem" data-act="school">학교 양식(한글 파일)에서 만들기…</button><hr><button role="menuitem" data-act="reset">이 틀 값을 수능 틀 값으로 되돌리기</button><button role="menuitem" data-act="detail">한글 도구 전체 열기(상세 조판)</button></div>`:''}
      <div class="tss-body">
        <div class="tss-parts" role="tablist" aria-label="부분">${PARTS.map(x=>`<button type="button" role="tab" data-part="${x.k}" aria-selected="${x.k===part}">${E(x.name)}${changed(x.k)?'<i class="d" title="수능 틀과 다른 값 있음"></i>':''}</button>`).join('')}</div>
        ${names.length>1?`<div class="tss-tabs" role="tablist">${names.map((n,i)=>`<button type="button" role="tab" data-tab="${i}" aria-selected="${i===tab}">${E(n)}</button>`).join('')}</div>`:''}
        ${P.tabs[names[tab]].map(g=>`<div class="tss-grp"><div class="tss-gh">${E(g.h)}</div>${g.rows.map(r=>`<div class="tss-row${r.length===1?' one':''}">${r.map(field).join('')}</div>`).join('')}</div>`).join('')}
        <div class="tss-view"><button type="button" data-view="gaps" aria-pressed="${!!gaps?.on}" title="요소 사이 간격 보기">${svg('gaps',15)}간격 보기</button><button type="button" data-view="marks" aria-pressed="${!!marks?.enabled()}" title="조판 부호(고정 띄어쓰기 빨간 V · 내어쓰기 초록 선)">${svg('marks',15)}조판 부호</button></div>
      </div>
      <footer class="tss-foot"><label class="tss-exc" title="이 문항만 다른 값으로 — 끄면 틀 값으로 돌아갑니다"><input type="checkbox" data-exception ${exceptionOn()?'checked':''}><span class="sw" aria-hidden="true"></span>${q?`${E(q.number)}번만 예외`:'이 문항만 예외'}</label><span class="sp"></span><span class="tss-note">바꾸면 바로 적용 · ${exceptionOn()?'이 문항만':'모든 문항'}</span></footer>
      <input type="file" accept=".json,application/json" hidden data-std-file>`;
    place();drawPart();
  }
  function place(){
    if(pop.hidden)return;
    const r=panel.getBoundingClientRect(),w=336,vw=doc.documentElement.clientWidth;
    const left=r.left-w-8>=8?r.left-w-8:Math.max(8,vw-w-8);
    Object.assign(pop.style,{left:`${left}px`,top:`${Math.max(8,r.top)}px`,height:`${Math.max(320,Math.min(r.height,doc.documentElement.clientHeight-16))}px`,width:`${w}px`});
  }
  // 고른 부분: 미리보기 왼쪽 단 바깥에 파란 띠 + 이름
  function drawPart(){
    layer.replaceChildren();layer.hidden=true;
    const ctx=context(),P=PARTS.find(x=>x.k===part);
    if(pop.hidden||!ctx.ready||!ctx.q||!P?.match||!host.getClientRects().length)return;
    let d;try{d=bridge.wasm.borrowDocumentHandle();}catch{return;}
    const placement=bridge.pagePlacement(0),viewport=bridge.figureViewport();if(!placement||!viewport)return;
    const rect=host.getBoundingClientRect();
    Object.assign(layer.style,{left:`${viewport.x-rect.left}px`,top:`${viewport.y-rect.top}px`,width:`${viewport.w}px`,height:`${viewport.h}px`});
    const page=parse(d.getPageDef(0)),mL=page.marginLeft/75;
    const pt=(x,y)=>{const p=bridge.parentPoint(placement.x+x*placement.scale,placement.y+y*placement.scale);return {x:p.x-viewport.x,y:p.y-viewport.y};};
    const ids=new Set(typeof P.match==='string'?[P.match]:ctx.q.blocks.filter(b=>!b.parent&&P.match(b)).map(b=>b.id));
    // 상자 안 표: 표를 담은 맨 바깥 상자 자리
    if(P.k==='table')for(const b of ctx.q.blocks)if(b.kind==='table'&&b.parent){let t=b;while(t.parent)t=ctx.q.blocks.find(x=>x.id===t.parent)||{};if(t.id)ids.add(t.id);}
    for(const el of questionElements(d,ctx.q,ctx.owners?.texts).filter(e=>ids.has(e.id))){
      const a=pt(Math.max(0,mL-3),el.top),b=pt(mL,el.bottom);
      const bar=doc.createElement('span');bar.className='ts-part-bar';Object.assign(bar.style,{left:`${a.x-3}px`,top:`${a.y}px`,height:`${Math.max(8,b.y-a.y)}px`});
      const tag=doc.createElement('span');tag.className='ts-part-tag';tag.textContent=P.name;Object.assign(tag.style,{left:`${a.x-3}px`,top:`${a.y}px`});
      layer.append(bar,tag);
    }
    layer.hidden=!layer.childElementCount;
  }
  function commit(p,v){
    const f=fieldOf(p);
    if(f?.t==='num'){v=Number(v);if(!Number.isFinite(v))return render();v=Number(Math.min(f.max,Math.max(f.min,v)).toFixed(decimals(f.step,f.u)));}
    pending={p,v};clearTimeout(timer);timer=setTimeout(flush,350);
    const input=pop.querySelector(`input[data-p="${CSS.escape(p)}"]`);if(input&&f?.t==='num'&&doc.activeElement!==input)input.value=v.toFixed(decimals(f.step,f.u));
  }
  async function flush(){clearTimeout(timer);const x=pending;pending=null;if(!x)return;await onSetting?.({path:x.p,value:x.v});}
  function setOpen(v){
    pop.hidden=!v;open.setAttribute('aria-expanded',String(v));panel.toggleAttribute('data-settings-open',v);
    if(v){render();pop.querySelector('[data-part][aria-selected="true"]')?.focus();}else{flush();menu=false;layer.hidden=true;}
  }
  open.addEventListener('click',()=>setOpen(pop.hidden));
  pop.addEventListener('click',async e=>{
    const t=e.target;
    if(t.closest('[data-close]'))return setOpen(false);
    if(t.closest('[data-menu]')){menu=!menu;return render();}
    const pb=t.closest('[data-part]');if(pb){part=pb.dataset.part;tab=0;return render();}
    const tb=t.closest('[data-tab]');if(tb){tab=Number(tb.dataset.tab);return render();}
    const vb=t.closest('[data-view]');if(vb){if(vb.dataset.view==='gaps')gaps?.toggle();else marks?.toggle();return render();}
    const act=t.closest('[data-act]')?.dataset.act;
    if(act){menu=false;
      if(act==='saveAs'){const name=prompt('새 틀 이름',`${standard().name} (복사)`);if(name?.trim())await onStandard?.({saveAs:name.trim()});}
      else if(act==='export')onStandard?.({download:true});
      else if(act==='import')return pop.querySelector('[data-std-file]').click();
      else if(act==='school')onStandard?.({school:true});
      else if(act==='reset')await onSetting?.({reset:true});
      else if(act==='detail')panel.querySelector('#typeset-detail')?.click();
      return render();}
  });
  pop.addEventListener('change',async e=>{
    const t=e.target;
    if(t.matches('[data-std-pick]'))return onStandard?.({pick:t.value});
    if(t.matches('[data-exception]'))return onSetting?.({exception:t.checked});
    if(t.matches('[data-std-file]')){const file=t.files?.[0];if(file)onStandard?.({importFile:file});t.value='';return;}
    const p=t.dataset.p;if(!p)return;const f=fieldOf(p);
    if(f.t==='tog')commit(p,t.checked?f.on:f.off);
    else if(f.t==='sel')commit(p,typeof get(KICE_STANDARD,p)==='number'?Number(t.value):t.value);
    else commit(p,t.value);
  });
  pop.addEventListener('keydown',e=>{
    const t=e.target;
    if(e.key==='Escape'){e.preventDefault();return setOpen(false);}
    if(!t.matches('input[data-step]'))return;
    if(e.key==='Enter'){t.blur();return;}
    if(e.key!=='ArrowUp'&&e.key!=='ArrowDown')return;
    e.preventDefault();const step=Number(t.dataset.step)*(e.shiftKey?10:1)*(e.key==='ArrowUp'?1:-1);
    const v=Math.min(Number(t.dataset.max),Math.max(Number(t.dataset.min),Math.round((Number(t.value)+step)*100)/100));t.value=v.toFixed(decimals(t.dataset.step,t.dataset.u));commit(t.dataset.p,v);
  });
  // 이름을 좌우로 끌면 값이 바뀐다(4px마다 한 단계). 화살표 글자 대신.
  pop.addEventListener('pointerdown',e=>{
    const label=e.target.closest('[data-scrub]');if(!label)return;
    const input=label.parentElement.querySelector('input');const step=Number(input.dataset.step),x0=e.clientX,v0=Number(input.value);
    label.setPointerCapture(e.pointerId);e.preventDefault();
    const move=ev=>{const v=Math.min(Number(input.dataset.max),Math.max(Number(input.dataset.min),Math.round((v0+Math.round((ev.clientX-x0)/4)*step)*100)/100));input.value=v.toFixed(decimals(step,input.dataset.u));commit(input.dataset.p,v);};
    const up=()=>{label.removeEventListener('pointermove',move);label.removeEventListener('pointerup',up);};
    label.addEventListener('pointermove',move);label.addEventListener('pointerup',up);
  });
  doc.defaultView.addEventListener('resize',()=>{place();drawPart();});
  return {
    // 조판이 새로 그려지거나(값 바뀜) 미리보기 칸이 움직이면 다시 그린다.
    draw(){if(pop.hidden)return;if(doc.activeElement&&pop.contains(doc.activeElement)&&doc.activeElement.matches('input'))return drawPart();render();},
    open:()=>setOpen(true),close:()=>setOpen(false),get isOpen(){return !pop.hidden;},
  };
}
