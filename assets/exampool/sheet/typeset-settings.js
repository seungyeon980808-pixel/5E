// 「⚙ 조판 설정」(10-23 사용자 결정, 시안 5e-design-mockups/typeset-settings-1023-v3.html — 명세 Desktop/project/spec-b-typeset-settings.md).
// 화면 위에 뜨는 팝업 하나: 왼쪽 설정 판(336px) + 오른쪽 자체 미리보기 판. 평소 조판 칸(카드 오른쪽 한글 창)은 건드리지 않는다.
// 고친 값은 초안이라 미리보기에만 보이고, 「모든 문항에 적용」을 눌러야 틀에 저장되어 그 틀을 쓰는 모든 문항에 걸린다.
// 「이 문항만 예외」를 켜고 적용하면 이 문항만 쓰는 복사본에 저장한다.
// 미리보기: 초안 틀로 이 문항을 새로 조판한 깨끗한 쪽 그림(편집용 칸 테두리 없음) 위에 고른 부분 파란 띠·나머지 흐리게,
// 조판 부호(고정 띄어쓰기 큰 빨간 V · 내어쓰기 기준선·안 여백 초록 선), 간격 보기(초록 띠)를 겹쳐 그린다.
import {KICE_STANDARD,KICE_ID} from './typeset-standard.js';

const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const get=(o,path)=>path.split('.').reduce((v,k)=>v?.[k],o);
const setPath=(o,path,v)=>{const ks=path.split('.'),last=ks.pop();let t=o;for(const k of ks){t[k]=Array.isArray(t[k])?[...t[k]]:{...t[k]};t=t[k];}t[last]=v;};
const MM_PER_PX=25.4/96;
const ICON={
  gear:'<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  gaps:'<path d="M4 6h16M4 18h16M12 9v6M10 11l2-2 2 2M10 13l2 2 2-2"/>',
  marks:'<path d="M5 8l3.5 7L12 8" stroke="#da3633"/><path d="M17 5v14M15 5h4" stroke="rgba(46,160,67,.95)"/>',
  dim:'<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  chev:'<path d="m6 9 6 6 6-6"/>',
};
const svg=(name,size=16)=>`<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;
export const settingsButtonHtml=()=>`<button type="button" id="typeset-settings" class="ts-settings-open" aria-haspopup="dialog" aria-expanded="false" title="조판 설정 — 글꼴·간격·상자·표·〈보기〉·선지·쪽을 한곳에서">${svg('gear',15)}<span>조판 설정</span></button>`;

// 값 칸: n 이름, p 기준 경로, u 단위, step·min·max, hl 미리보기에서 함께 켜는 자리(pad·hang·gap). sel 고르기, tog 켜고 끄기, info 안내.
const N=(p,n,u,step,min,max,hl='')=>({t:'num',p,n,u,step,min,max,hl});
const S=(p,n,opts)=>({t:'sel',p,n,opts});
const T=(p,n,on=true,off=false)=>({t:'tog',p,n,on,off});
const I=(n,text)=>({t:'info',n,text});
const G=(h,rows,tip='')=>({h,rows,tip});
const textTabs={
  '글자':[G('글자',[[S('text.font','글꼴',['함초롬바탕','함초롬돋움','신명 중명조']),N('text.size','크기','pt',.5,6,20)],[N('text.ratio','장평','%',1,50,200),N('text.spacing','자간','%',1,-50,50)]],'지문·발문·선지가 함께 씁니다')],
  '문단':[G('문단',[[N('text.lineSpacing','줄 간격','%',5,80,300),S('text.align','정렬',[['justify','양쪽'],['left','왼쪽']])],[S('text.break','한글 단위',[['word','어절'],['char','글자']])]],'줄 나눔 「어절」은 낱말 가운데에서 줄을 끊지 않습니다')],
  '줄 맞춤':[G('윗줄부터 자간 맞춤',[[T('fit.on','켜기')],[N('fit.low','자간 최소','%',1,-20,0),N('fit.high','자간 최대','%',1,0,20)],[N('fit.shortLastLine','짧은 끝 줄','%',1,0,50)]],'입력할 때 자동으로 걸립니다')],
};
const isBox=b=>b.kind==='group'&&(b.boxed===true||b.boxed===undefined&&b.label==='실험')||b.kind==='steps'||b.kind==='dialogue';
export const PARTS=[
  {k:'text',name:'지문',tabs:textTabs,match:b=>b.kind==='text'},
  {k:'box',name:'자료 상자',match:isBox,tabs:{'상자':[G('안 여백',[[N('gaps.boxPadSide','좌우','mm',.1,0,20,'pad'),N('gaps.boxPadTop','위','mm',.1,0,20,'pad')],[N('gaps.boxPadBottom','아래','mm',.1,0,20,'pad')]]),
      G('선 · 뒤 간격',[[N('parts.rule','선 굵기','mm',.01,.05,1),N('gaps.after','뒤 간격','mm',.1,0,20,'gap')]]),G('폭',[[I('너비','번호 뒤부터 단 끝까지(고정)')]])]}},
  {k:'table',name:'상자 안 표',match:b=>b.kind==='table'||isBox(b),tabs:{'표/셀':[G('칸',[[N('parts.cellPad','칸 안 여백','mm',.01,0,5),N('parts.tableLineSpacing','칸 줄 간격','%',5,80,300)]]),
      G('선',[[N('parts.rule','선 굵기','mm',.01,.05,1)]]),G('크기',[[I('전체 폭','고정 · 열 비율만 미리보기에서')]])]}},
  {k:'figure',name:'그림',match:b=>b.kind==='figure'||b.kind==='group'&&b.layout==='나란히'&&b.boxed!==true,tabs:{'그림':[G('크기',[[I('너비','칸 폭에 꽉 채움 · 높이는 비율대로')],[I('세부 크기','평소 화면에서 그림 모서리를 끌어 조절')]]),
      G('뒤 간격',[[N('gaps.after','뒤 간격','mm',.1,0,20,'gap')]])]}},
  {k:'ask',name:'발문',match:'ask',tabs:{...textTabs,'간격':[G('앞 간격(더함)',[[N('gaps.ask','발문 앞','mm',.1,0,20,'gap')]])]}},
  {k:'bogi',name:'〈보기〉',match:b=>b.kind==='bogi',tabs:{
    '상자':[G('제목',[[S('parts.bogiTitle','글',['<보 기>','<보기>']),N('parts.bogiTitlePad','칸 좌우','mm',.01,0,5)],[N('parts.bogiTitleWidth','칸 폭','mm',.1,5,40),N('parts.bogiTitleRow','1행','mm',.01,.5,10)]],'칸 폭은 최소 폭 — 제목 글이 더 넓으면 글에 맞춰 넓어집니다 · 1행은 위 선까지 높이'),
      G('안 여백',[[N('gaps.bogiPadLeft','왼쪽','mm',.1,0,20,'pad'),N('gaps.bogiPadRight','오른쪽','mm',.1,0,20,'pad')],[N('gaps.bogiPadTop','위','mm',.1,0,20,'pad'),N('gaps.bogiPadBottom','아래','mm',.1,0,20,'pad')]]),
      G('ㄱ·ㄴ·ㄷ',[[N('parts.bogiLineSpacing','줄 간격','%',5,80,300,'hang'),S('parts.hanging','내어쓰기',[[true,'자동']])],[T('parts.labelSpace','「ㄱ.」 뒤 고정 띄어쓰기','fixed','space')]],'내어쓰기는 기호(ㄱ.) 폭만큼 자동'),
      G('선 · 뒤 간격',[[N('parts.rule','선 굵기','mm',.01,.05,1),N('gaps.choices','뒤 간격','mm',.1,0,20,'gap')]],'뒤 간격은 다음 선지 앞 간격과 같은 값 — 간격의 주인은 하나')],
    '글자':textTabs['글자'],
    '문단':textTabs['문단']}},
  {k:'choices',name:'선지',match:'choices',tabs:{'선지 배열':[G('탭 간격',[[N('parts.choiceTabs.0','5개 한 줄','mm',.1,5,60),N('parts.choiceTabs.1','3+2','mm',.1,10,80)],[N('parts.choiceTabs.2','2개씩','mm',.1,20,100)]],'① 시작선부터 · 가장 긴 선지가 들어갈 때만 이 간격'),
      G('기호',[[T('parts.labelSpace','「ㄱ.」「①」 뒤 고정 띄어쓰기','fixed','space')]]),G('앞 간격(더함)',[[N('gaps.choices','선지 앞','mm',.1,0,20,'gap')]])]}},
  {k:'gaps',name:'간격',match:null,tabs:{'간격':[G('요소 앞에 더하는 간격',[[N('gaps.text','지문','mm',.1,0,20,'gap'),N('gaps.material','자료','mm',.1,0,20,'gap')],[N('gaps.ask','발문','mm',.1,0,20,'gap'),N('gaps.bogi','〈보기〉','mm',.1,0,20,'gap')],[N('gaps.choices','선지','mm',.1,0,20,'gap')]],'간격의 주인은 하나 — 앞 요소 아래와 더하지 않습니다'),
      G('자료 뒤 간격',[[N('gaps.after','상자·표·그림 뒤','mm',.1,0,20,'gap')]])]}},
  {k:'paper',name:'쪽·단',match:null,tabs:{'편집 용지':[G('단',[[S('paper.columns','단 수',[[2,'2단'],[1,'1단']]),N('paper.columnGap','단 간격','mm',.5,0,30)]]),
      G('여백',[[N('paper.margin.top','위','mm',1,5,40),N('paper.margin.bottom','아래','mm',1,5,40)],[N('paper.margin.left','왼쪽','mm',1,5,40),N('paper.margin.right','오른쪽','mm',1,5,40)]])]}},
];
const ALL_FIELDS=PARTS.flatMap(x=>Object.values(x.tabs).flat().flatMap(g=>g.rows.flat()));
const fieldOf=p=>ALL_FIELDS.find(f=>f.p===p);
const decimals=(step,u)=>u==='mm'?2:String(step).includes('.')?String(step).split('.')[1].length:0;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export function attachTypesetSettings({panel,context,preview,onApply,onStandard}){
  const doc=panel.ownerDocument;
  const controls=panel.querySelector('.typeset-view-controls');
  if(!controls.querySelector('#typeset-settings'))controls.querySelector('.ts-scope')?.insertAdjacentHTML('afterend',settingsButtonHtml());
  const opener=controls.querySelector('#typeset-settings');
  const back=doc.createElement('div');back.className='tsx-back';back.hidden=true;doc.body.append(back);
  let scrolled='',part='bogi',tab=0,menu=false,draft=null,saved=null,exception=false,hot='',view={gaps:false,marks:true,dim:true,zoom:'fit'},sheet=null,seq=0,timer=0;

  const base=()=>context().standard||KICE_STANDARD;
  const ownException=()=>{const {q}=context(),s=base();return !!q&&s.source?.kind==='exception'&&s.source.qid===q.id;};
  const value=p=>{const v=get(draft,p);return v===undefined?get(KICE_STANDARD,p):v;};
  const dirty=()=>!!draft&&(!same(draft,saved)||exception!==ownException());

  function field(f){
    if(f.t==='info')return `<div class="tsx-f info"><span class="n">${E(f.n)}</span><span class="v">${E(f.text)}</span></div>`;
    const v=value(f.p),kv=get(KICE_STANDARD,f.p),diff=!same(v,kv),tip=diff?` title="수능 틀 ${E(f.t==='tog'?(kv===f.on?'켬':'끔'):kv)}${f.u&&f.t==='num'?E(f.u):''}과 다름"`:'',cls=`${diff?' diff':''}${hot&&hot===f.p?' hot':''}`;
    if(f.t==='tog')return `<label class="tsx-f tog${cls}"${tip}><span class="n">${E(f.n)}</span><input type="checkbox" data-p="${f.p}" ${v===f.on?'checked':''}><span class="sw" aria-hidden="true"></span></label>`;
    if(f.t==='sel')return `<label class="tsx-f sel${cls}"${tip}><span class="n">${E(f.n)}</span><select data-p="${f.p}">${f.opts.map(o=>{const [ov,ol]=Array.isArray(o)?o:[o,o];return `<option value="${E(ov)}" ${String(ov)===String(v)?'selected':''}>${E(ol)}</option>`;}).join('')}</select>${svg('chev',12)}</label>`;
    return `<label class="tsx-f num${cls}"${tip} data-hl="${f.hl}" data-fp="${f.p}"><span class="n" data-scrub>${E(f.n)}</span><input inputmode="decimal" data-p="${f.p}" data-step="${f.step}" data-min="${f.min}" data-max="${f.max}" data-u="${f.u||''}" value="${Number(v).toFixed(decimals(f.step,f.u))}"><span class="u">${E(f.u||'')}</span></label>`;
  }
  const changed=k=>Object.values(PARTS.find(x=>x.k===k).tabs).flat().flatMap(g=>g.rows.flat()).some(f=>f.p&&!same(value(f.p),get(KICE_STANDARD,f.p)));
  function leftHtml(){
    const {standards=[]}=context(),P=PARTS.find(x=>x.k===part),names=Object.keys(P.tabs);if(tab>=names.length)tab=0;
    const shared=standards.filter(x=>x.source?.kind!=='exception'),pick=ownException()?base().source?.from||KICE_ID:base().id,pickName=(pick===KICE_ID?'수능 틀':shared.find(x=>x.id===pick)?.name)||'수능 틀';
    return `<section class="tsx-pane tsx-left" aria-label="설정">
      <header class="tsx-ph"><b>조판 설정</b><span class="sp"></span>
        <label class="tsx-pick" title="틀 — 이 틀을 쓰는 모든 문항에 걸립니다"><span>${E(pickName)}</span>${svg('chev',14)}<select data-std-pick aria-label="틀">${[[KICE_ID,'수능 틀'],...shared.map(x=>[x.id,x.name])].map(([id,n])=>`<option value="${E(id)}" ${id===pick?'selected':''}>${E(n)}</option>`).join('')}</select></label>
        <button type="button" class="tsx-ic" data-menu aria-label="틀 메뉴" aria-expanded="${menu}" title="학교 양식에서 읽어 오기 · 파일로 내보내기">${svg('more')}</button></header>
      ${menu?`<div class="tsx-menu" role="menu"><button role="menuitem" data-act="school">학교 양식(한글 파일)에서 읽어 오기…</button><button role="menuitem" data-act="export">틀 파일로 내보내기</button><button role="menuitem" data-act="import">틀 파일 가져오기…</button><button role="menuitem" data-act="saveAs">지금 틀을 새 이름으로 저장…</button><hr><button role="menuitem" data-act="kice">값을 수능 틀 값으로(초안)</button><button role="menuitem" data-act="detail">한글 도구 전체 열기(상세 조판)</button></div>`:''}
      <div class="tsx-body">
        <div class="tsx-parts" role="tablist" aria-label="부분">${PARTS.map(x=>`<button type="button" role="tab" data-part="${x.k}" aria-selected="${x.k===part}">${E(x.name)}${changed(x.k)?'<i class="d" title="수능 틀과 다른 값 있음"></i>':''}</button>`).join('')}</div>
        ${names.length>1?`<div class="tsx-seg" role="tablist">${names.map((n,i)=>`<button type="button" role="tab" data-tab="${i}" aria-selected="${i===tab}">${E(n)}</button>`).join('')}</div>`:''}
        ${P.tabs[names[tab]].map(g=>`<div class="tsx-grp"><div class="tsx-gh">${E(g.h)}${g.tip?`<span class="tsx-tip" tabindex="0" title="${E(g.tip)}" aria-label="${E(g.tip)}">${svg('info',14)}</span>`:''}</div>${g.rows.map(r=>`<div class="tsx-row${r.length===1?' one':''}">${r.map(field).join('')}</div>`).join('')}</div>`).join('')}
      </div>
      <footer class="tsx-pf"><label class="tsx-exc"><input type="checkbox" data-exception ${exception?'checked':''}><span class="sw" aria-hidden="true"></span>이 문항만 예외</label><span class="sp"></span>
        <button type="button" class="tsx-b" data-revert ${dirty()?'':'disabled'}>되돌리기</button><button type="button" class="tsx-b go" data-apply ${dirty()?'':'disabled'}>${exception?'이 문항에 적용':'모든 문항에 적용'}</button></footer>
      <input type="file" accept=".json,application/json" hidden data-std-file>
    </section>`;
  }
  function rightHtml(){
    const {q}=context();
    return `<section class="tsx-pane tsx-right" aria-label="미리보기">
      <header class="tsx-ph"><b class="tsx-pvtitle">${q?`${E(q.number)}번 미리보기`:'미리보기'}</b><span class="sp"></span>
        <button type="button" class="tsx-ic" data-view="gaps" aria-pressed="${view.gaps}" title="간격 보기 — 요소 사이 초록 띠와 mm">${svg('gaps')}</button>
        <button type="button" class="tsx-ic" data-view="marks" aria-pressed="${view.marks}" title="조판 부호 — 고정 띄어쓰기 빨간 V · 내어쓰기·여백 초록 선">${svg('marks')}</button>
        <button type="button" class="tsx-ic" data-view="dim" aria-pressed="${view.dim}" title="고른 부분 말고 흐리게">${svg('dim')}</button>
        <label class="tsx-pick" title="배율"><span>${{fit:'맞춤',1:'100%',1.5:'150%'}[view.zoom]}</span>${svg('chev',14)}<select data-zoom aria-label="배율"><option value="fit" ${view.zoom==='fit'?'selected':''}>맞춤</option><option value="1" ${view.zoom==='1'?'selected':''}>100%</option><option value="1.5" ${view.zoom==='1.5'?'selected':''}>150%</option></select></label></header>
      <div class="tsx-pv"><div class="tsx-paper"><p class="tsx-wait">조판하는 중…</p></div></div>
    </section>`;
  }
  function render(){
    if(back.hidden)return;
    const scroll=back.querySelector('.tsx-body')?.scrollTop||0,pvScroll=back.querySelector('.tsx-pv')?.scrollTop||0,focusP=doc.activeElement?.dataset?.p;
    back.innerHTML=`<section class="tsx-pop" role="dialog" aria-modal="true" aria-label="조판 설정">${leftHtml()}${rightHtml()}</section>`;
    const body=back.querySelector('.tsx-body');if(body)body.scrollTop=scroll;
    if(focusP){const n=back.querySelector(`[data-p="${CSS.escape(focusP)}"]`);n?.focus();if(n?.select&&n.matches('input:not([type=checkbox])'))n.select();}
    paint();const pv=back.querySelector('.tsx-pv');if(pv&&sheet)pv.scrollTop=pvScroll;
  }
  // ── 미리보기: 초안 틀로 새로 조판(0.3초 쉬면) → 쪽 그림 + 겹쳐 그리기
  function refresh(delay=300){clearTimeout(timer);timer=setTimeout(async()=>{const my=++seq,{q}=context();if(!q||!draft)return;
    try{const r=await preview(q,structuredClone(draft));if(my!==seq||back.hidden)return;sheet=r;paint();}
    catch(e){if(my===seq){const p=back.querySelector('.tsx-paper');if(p)p.innerHTML=`<p class="tsx-wait error">미리보기를 그리지 못했습니다: ${E(e.message)}</p>`;}}},delay);}
  function paint(){
    const paper=back.querySelector('.tsx-paper');if(!paper||!sheet)return;
    const W=sheet.width,H=sheet.height,pg=sheet.page,mL=pg.marginLeft/75,mR=pg.marginRight/75,mT=pg.marginTop/75;
    const pct=(v,t)=>(v/t*100).toFixed(3)+'%',box=(x,y,w,h,cls,extra='')=>`<i class="${cls}" style="left:${pct(x,W)};top:${pct(y,H)};width:${pct(Math.max(0,w),W)};height:${pct(Math.max(0,h),H)}"${extra}></i>`;
    const {q}=context(),P=PARTS.find(x=>x.k===part),els=sheet.elements||[];
    const ids=new Set(!P.match||!q?[]:typeof P.match==='string'?[P.match]:q.blocks.filter(b=>!b.parent&&P.match(b)).map(b=>b.id));
    if(P.k==='table')for(const b of q?.blocks||[])if(b.kind==='table'&&b.parent){let t=b;while(t?.parent)t=q.blocks.find(x=>x.id===t.parent);if(t)ids.add(t.id);}
    const sel=els.filter(e=>ids.has(e.id)),others=els.filter(e=>!ids.has(e.id));
    let over='';
    if(view.dim&&sel.length)for(const e of others)over+=box(mL-2,e.top-2,W-mL-mR+4,e.bottom-e.top+4,'tsx-dim');
    for(const e of sel)over+=box(mL-9,e.top,3,e.bottom-e.top,'tsx-bar');
    // 간격 보기: 이웃한 요소 사이 초록 띠 + mm
    if(view.gaps||hot&&fieldOf(hot)?.hl==='gap')for(let i=1;i<els.length;i++){const a=els[i-1],b=els[i],g=b.top-a.bottom;if(g<0.5)continue;over+=box(mL,a.bottom,W-mL-mR,g,'tsx-gap',` data-mm="${(g*MM_PER_PX).toFixed(1)}mm"`);}
    // 조판 부호: 고른 부분의 안 여백(상자·〈보기〉 맨 바깥 표)과 내어쓰기 기준선(둘째 줄부터 시작 x), 고정 띄어쓰기 빨간 V
    if(view.marks)for(const e of sel){
      const runs=(sheet.runs||[]).filter(r=>Number.isFinite(r.y)&&r.y>=e.top-1&&r.y+r.h<=e.bottom+1&&String(r.text||'').replace(/\u2060/g,'').trim());
      const tbl=(sheet.controls||[]).filter(c=>c.type==='table'&&!(c.cellPath||[]).length&&c.y>=e.top-1&&c.y+c.h<=e.bottom+1).sort((a,b)=>b.w*b.h-a.w*a.h)[0];
      const pad=P.k==='bogi'?{l:'gaps.bogiPadLeft',r:'gaps.bogiPadRight',t:'gaps.bogiPadTop',b:'gaps.bogiPadBottom'}:P.k==='box'?{l:'gaps.boxPadSide',r:'gaps.boxPadSide',t:'gaps.boxPadTop',b:'gaps.boxPadBottom'}:null;
      if(tbl&&pad){const px=k=>Number(value(k))/MM_PER_PX,L=px(pad.l),R=px(pad.r),T=px(pad.t),B=px(pad.b),on=k=>hot===pad[k]?' on':'';
        // 〈보기〉는 제목 줄 아래 본문 칸이 기준: 첫 ㄱ 줄 위 - 안 여백 위
        const firstRun=runs.filter(r=>r.y>tbl.y+4&&!String(r.text).includes('보')).sort((a,b)=>a.y-b.y)[0];
        const y0=P.k==='bogi'&&firstRun?firstRun.y-T:tbl.y,y1=tbl.y+tbl.h,h=y1-y0;
        if(on('l'))over+=box(tbl.x,y0,L,h,'tsx-padfill');if(on('r'))over+=box(tbl.x+tbl.w-R,y0,R,h,'tsx-padfill');
        if(on('t'))over+=box(tbl.x,y0,tbl.w,T,'tsx-padfill');if(on('b'))over+=box(tbl.x,y1-B,tbl.w,B,'tsx-padfill');
        over+=box(tbl.x+L,y0,0,h,'tsx-vl'+on('l'))+box(tbl.x+tbl.w-R,y0,0,h,'tsx-vl'+on('r'))+box(tbl.x,y0+T,tbl.w,0,'tsx-hl'+on('t'))+box(tbl.x,y1-B,tbl.w,0,'tsx-hl'+on('b'));}
      // 내어쓰기 기준선: 둘째 줄부터 들여 시작하는 x(가장 흔한 값) 하나에 위아래로 긴 초록 선(위 작은 삼각형)
      const starts=new Map();for(const r of runs){const k=Math.round(r.y);starts.set(k,Math.min(starts.get(k)??Infinity,r.x));}
      const rows=[...starts].sort((a,b)=>a[0]-b[0]),hangs=[];for(let i=1;i<rows.length;i++)if(rows[i][1]>rows[i-1][1]+6)hangs.push(Math.round(rows[i][1]));
      if(hangs.length){const hx=hangs.sort((a,b)=>hangs.filter(v=>v===b).length-hangs.filter(v=>v===a).length)[0],ys=runs.filter(r=>r.x<hx-6).map(r=>r.y),y0=Math.min(...(ys.length?ys:runs.map(r=>r.y))),y1=Math.max(...runs.map(r=>r.y+r.h));over+=box(hx,y0,0,y1-y0,'tsx-hang'+(hot==='parts.bogiLineSpacing'?' on':''));}
      // 고정 띄어쓰기: 「ㄱ.」「①」 바로 뒤 빈칸 가운데에 큰 빨간 V(조판 기준이 fixed일 때)
      if(value('parts.labelSpace')==='fixed')for(const r of runs){const t=String(r.text),m=t.match(/^\s*([ㄱ-ㅎ]\.|[①-⑤])\s/);if(!m)continue;
        const i=m[0].length-1,cx=Array.isArray(r.charX)&&r.charX.length>i?(()=>{const rel=r.charX[0]<r.x-1,at=j=>(rel?r.x:0)+(r.charX[j]??(r.charX[i]+r.h*.3));return (at(i)+at(i+1))/2;})():r.x+r.w*(i+.5)/Math.max(1,t.length);
        if(Number.isFinite(cx))over+=box(cx,r.y-r.h*.45,r.h*.62,r.h*.6,'tsx-v');}
    }
    // 눈금자: 고른 부분 첫 문단의 첫 줄 시작(▽)과 둘째 줄부터(△)
    let ruler='';const e0=sel[0];
    if(e0){const rs=(sheet.runs||[]).filter(r=>r.y>=e0.top-1&&r.y<=e0.bottom&&String(r.text||'').trim()).sort((a,b)=>a.y-b.y||a.x-b.x);
      if(rs.length){const y0=Math.round(rs[0].y),first=Math.min(...rs.filter(r=>Math.round(r.y)===y0).map(r=>r.x)),rest=rs.filter(r=>Math.round(r.y)!==y0),second=rest.length?Math.min(...rest.map(r=>r.x)):first;
        ruler=`<i class="tsx-mk t" style="left:${pct(first,W)}"></i><i class="tsx-mk b" style="left:${pct(second,W)}"></i>`;}}
    const zoom=view.zoom==='fit'?'':` style="width:${Math.round(W*Number(view.zoom))}px;max-width:none"`;
    paper.outerHTML=`<div class="tsx-paper"${zoom}><div class="tsx-ruler" style="margin-left:${pct(mL,W)};margin-right:${pct(mR,W)}">${ruler.replace(/left:([\d.]+)%/g,(m,v)=>`left:${((Number(v)/100*W-mL)/(W-mL-mR)*100).toFixed(3)}%`)}</div><div class="tsx-sheet" style="aspect-ratio:${W}/${H}">${sheet.svg.replace('<svg ','<svg style="display:block;width:100%;height:auto" ')}<div class="tsx-over">${over}</div></div></div>`;
    // 고른 부분이 미리보기 창 안에 보이게(부분을 바꿨을 때만 — 값을 고치거나 마우스를 올릴 때는 그대로)
    const pv=back.querySelector('.tsx-pv'),key=`${q?.id}:${part}:${view.zoom}`;
    if(pv&&sel.length&&scrolled!==key){scrolled=key;const sh=back.querySelector('.tsx-sheet'),y=sh.offsetTop+sel[0].top/H*sh.offsetHeight,y2=sh.offsetTop+sel.at(-1).bottom/H*sh.offsetHeight;
      pv.scrollTop=y2-y<pv.clientHeight-48?Math.max(0,(y+y2)/2-pv.clientHeight/2):Math.max(0,y-24);}
  }
  // ── 열기·닫기
  function open(){
    const {q}=context();if(!q)return;
    scrolled='';saved=structuredClone(base());draft=structuredClone(saved);exception=ownException();menu=false;hot='';sheet=null;
    back.hidden=false;opener.setAttribute('aria-expanded','true');render();refresh(0);
    back.querySelector('[data-part][aria-selected="true"]')?.focus();
  }
  function close(force=false){
    if(back.hidden)return;
    if(!force&&dirty()&&!doc.defaultView.confirm('적용하지 않은 값이 있습니다. 적용하지 않고 닫을까요?'))return;
    back.hidden=true;back.innerHTML='';opener.setAttribute('aria-expanded','false');draft=null;sheet=null;
  }
  function commit(p,v){
    const f=fieldOf(p);
    if(f?.t==='num'){v=Number(v);if(!Number.isFinite(v))return render();v=Number(Math.min(f.max,Math.max(f.min,v)).toFixed(decimals(f.step,f.u)));}
    setPath(draft,p,v);render();refresh();
  }
  opener.addEventListener('click',()=>back.hidden?open():close());
  back.addEventListener('pointerdown',e=>{if(e.target===back)close();});
  back.addEventListener('click',async e=>{
    const t=e.target;
    if(t.closest('[data-menu]')){menu=!menu;return render();}
    const pb=t.closest('[data-part]');if(pb){part=pb.dataset.part;tab=0;menu=false;return render();}
    const tb=t.closest('[data-tab]');if(tb){tab=Number(tb.dataset.tab);return render();}
    const vb=t.closest('[data-view]');if(vb){view[vb.dataset.view]=!view[vb.dataset.view];return render();}
    if(t.closest('[data-revert]')){draft=structuredClone(saved);exception=ownException();render();return refresh(0);}
    if(t.closest('[data-apply]')){const ok=await onApply?.({standard:structuredClone(draft),exception});if(ok!==false)close(true);return;}
    const act=t.closest('[data-act]')?.dataset.act;
    if(act){menu=false;
      if(act==='school'){close(true);onStandard?.({school:true});return;}
      if(act==='export'){onStandard?.({download:true});return render();}
      if(act==='import'){back.querySelector('[data-std-file]').click();return;}
      if(act==='saveAs'){const name=doc.defaultView.prompt('새 틀 이름',`${base().name} (복사)`);if(name?.trim()){close(true);await onStandard?.({saveAs:name.trim()});}return;}
      if(act==='kice'){const keep={id:draft.id,name:draft.name,source:draft.source,base:draft.base,version:draft.version};draft={...structuredClone(KICE_STANDARD),...keep};render();return refresh(0);}
      if(act==='detail'){close(true);panel.querySelector('#typeset-detail')?.click();return;}
      return render();}
  });
  back.addEventListener('change',e=>{
    const t=e.target;
    if(t.matches('[data-std-pick]')){if(dirty()&&!doc.defaultView.confirm('적용하지 않은 값은 버리고 다른 틀로 바꿀까요?'))return render();close(true);onStandard?.({pick:t.value});return;}
    if(t.matches('[data-zoom]')){view.zoom=t.value;return render();}
    if(t.matches('[data-exception]')){exception=t.checked;return render();}
    if(t.matches('[data-std-file]')){const file=t.files?.[0];if(file){close(true);onStandard?.({importFile:file});}t.value='';return;}
    const p=t.dataset.p;if(!p)return;const f=fieldOf(p);
    if(f.t==='tog')commit(p,t.checked?f.on:f.off);
    else if(f.t==='sel'){const k=typeof get(KICE_STANDARD,p);commit(p,k==='number'?Number(t.value):k==='boolean'?t.value==='true':t.value);}
    else commit(p,t.value);
  });
  back.addEventListener('keydown',e=>{
    const t=e.target;
    if(e.key==='Escape'){e.preventDefault();if(menu){menu=false;return render();}return close();}
    if(!t.matches?.('input[data-step]'))return;
    if(e.key==='Enter'){t.blur();return;}
    if(e.key!=='ArrowUp'&&e.key!=='ArrowDown')return;
    e.preventDefault();const step=Number(t.dataset.step)*(e.shiftKey?10:1)*(e.key==='ArrowUp'?1:-1);
    commit(t.dataset.p,Math.round((Number(t.value)+step)*100)/100);
  });
  // 이름을 좌우로 끌면 값이 바뀐다(4px마다 한 단계). 끄는 동안은 미리보기만 늦춰 다시 그린다.
  back.addEventListener('pointerdown',e=>{
    const label=e.target.closest('[data-scrub]');if(!label)return;
    const input=label.parentElement.querySelector('input');const step=Number(input.dataset.step),x0=e.clientX,v0=Number(input.value),p=input.dataset.p;
    label.setPointerCapture(e.pointerId);e.preventDefault();
    const move=ev=>{const f=fieldOf(p),v=Math.min(f.max,Math.max(f.min,Math.round((v0+Math.round((ev.clientX-x0)/4)*step)*100)/100));input.value=v.toFixed(decimals(step,f.u));setPath(draft,p,v);refresh(250);};
    const up=()=>{label.removeEventListener('pointermove',move);label.removeEventListener('pointerup',up);render();};
    label.addEventListener('pointermove',move);label.addEventListener('pointerup',up);
  });
  // 값 칸에 마우스를 올리면 그 자리(안 여백·간격)를 미리보기에서 함께 켠다
  back.addEventListener('pointerover',e=>{const f=e.target.closest?.('[data-fp]');const next=f?.dataset.fp||'';if(next!==hot){hot=next;back.querySelectorAll('.tsx-f.hot').forEach(n=>n.classList.remove('hot'));if(f)f.classList.add('hot');paint();}});
  return {
    // 문항이 바뀌면 열린 팝업은 닫는다(초안은 그 문항 기준). 그 밖에는 할 일 없음.
    draw(){const {q}=context();if(!back.hidden&&q&&back.querySelector('.tsx-pvtitle')&&!back.querySelector('.tsx-pvtitle').textContent.startsWith(String(q.number)))close(true);},
    open,close:()=>close(true),get isOpen(){return !back.hidden;},
  };
}
