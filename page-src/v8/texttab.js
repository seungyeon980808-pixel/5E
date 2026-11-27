/* 11-20: 시안 안 「문구」 탭 — 페이지의 모든 문장을 한 줄씩 보고, 누르면 그 자리로 가 빛나고, 옆 칸에 코멘트(127.0.0.1:8967에 저장) */
(function(){
  'use strict';
  const API='http://127.0.0.1:8967',R=document.documentElement;
  const SEC={'첫 화면':'studio','문구 화면':'manif','메뉴 줄':null,'묶음 제목':null,'architecture':'arch','history':'hx','download':'download','웹과 설치판':'download','FAQ':'faq','맨 아래':null};
  const SCN={1:'f-S1',2:'f-S2',3:'f-S3',4:'f-S4',5:'f-S5',6:'f-S6',7:'f-S8',8:'f-S9'};
  const norm=s=>(s||'').replace(/[\s·—\-–›「」〈〉()/.,:?]/g,'');
  let built=false,panel,cm={},tm=null;
  function secFor(h){const m=h.match(/장면\s*(\d)/);if(m)return SCN[m[1]];for(const k in SEC)if(h.startsWith(k))return SEC[k];return null}
  function find(text,sid){const parts=text.split(' / ').map(norm).filter(Boolean);const want=parts[0]||norm(text);if(!want)return null;
    const root=(sid&&document.getElementById(sid))||document;
    const els=[...root.querySelectorAll('h1,h2,h3,p,li,.mf,.wcap,.where,.addr,a,span,b,button')].filter(e=>!e.closest('.ttab,.mockbar'));
    let best=null;for(const e of els){const t=norm(e.innerText||e.textContent);if(t.includes(want.slice(0,24))&&(!best||t.length<norm(best.innerText).length))best=e}
    return best||(sid&&document.getElementById(sid))}
  function go(text,sid,mf){const el=find(text,sid);if(!el)return;
    if(mf){const ms=[...document.querySelectorAll('.mf')];const k=ms.findIndex(m=>norm(m.innerText).includes(norm(text.split(' / ')[0])));const d=document.querySelectorAll('.mf-dots button')[k];if(d)d.click()}
    el.scrollIntoView({behavior:'smooth',block:'center'});el.classList.remove('tt-flash');void el.offsetWidth;el.classList.add('tt-flash');setTimeout(()=>el.classList.remove('tt-flash'),2600)}
  function save(st){fetch(API+'/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cm)}).then(r=>st.textContent=r.ok?'저장됨 '+new Date().toLocaleTimeString('ko-KR'):'저장 실패').catch(()=>st.textContent='저장 안 됨 — 코멘트 서버(8967)가 꺼져 있음')}
  async function build(){built=true;panel=document.createElement('aside');panel.className='ttab';
    panel.innerHTML='<header><b>문구 전체</b><span class="tt-n"></span><label><input type="checkbox" class="tt-only"> 코멘트 단 것만</label><button type="button" class="tt-x" aria-label="닫기">×</button></header><p class="tt-st">문장을 누르면 페이지의 그 자리로 갑니다 · 코멘트는 적는 즉시 저장</p><div class="tt-list">불러오는 중…</div>';
    document.body.appendChild(panel);const st=panel.querySelector('.tt-st'),list=panel.querySelector('.tt-list');
    panel.querySelector('.tt-x').onclick=()=>toggle(false);
    panel.querySelector('.tt-only').onchange=e=>panel.classList.toggle('only',e.target.checked);
    let items=[];try{items=await (await fetch(API+'/items')).json();cm=await (await fetch(API+'/comments')).json()}catch(e){list.textContent='코멘트 서버(127.0.0.1:8967)를 켜야 목록이 보입니다.';return}
    let h='',sid=null,n=0;const out=[];
    for(const [k,a,b] of items){if(k==='h'){h=a;sid=secFor(a);out.push(`<h4>${a}</h4>`);continue}n++;
      const v=cm[a]||'';out.push(`<div class="tt-it${v.trim()?' has':''}" data-sid="${sid||''}" data-mf="${h.startsWith('문구 화면')?1:''}"><i>${a}</i><div class="tt-t" role="button" tabindex="0">${b.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/ \/ /g,'<br>')}</div><textarea data-k="${a}" rows="1" placeholder="코멘트">${v.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</textarea></div>`)}
    list.innerHTML=out.join('');panel.querySelector('.tt-n').textContent=n+'개';
    list.addEventListener('click',e=>{const t=e.target.closest('.tt-t');if(!t)return;const it=t.closest('.tt-it');list.querySelectorAll('.tt-it.cur').forEach(x=>x.classList.remove('cur'));it.classList.add('cur');go(t.innerText.replace(/\n/g,' / '),it.dataset.sid,it.dataset.mf)});
    list.addEventListener('input',e=>{const ta=e.target.closest('textarea');if(!ta)return;const v=ta.value;if(v.trim())cm[ta.dataset.k]=v;else delete cm[ta.dataset.k];ta.closest('.tt-it').classList.toggle('has',!!v.trim());st.textContent='저장하는 중…';clearTimeout(tm);tm=setTimeout(()=>save(st),600)})}
  function toggle(on){if(on&&!built)build();R.classList.toggle('tt-on',on);const b=document.getElementById('ttBtn');if(b)b.classList.toggle('on',on)}
  const bar=document.querySelector('.mockbar');
  if(bar){const b=document.createElement('button');b.id='ttBtn';b.type='button';b.className='theme-toggle';b.textContent='문구 탭';b.onclick=()=>toggle(!R.classList.contains('tt-on'));bar.insertBefore(b,bar.firstChild.nextSibling)}
  addEventListener('keydown',e=>{if(e.target.closest('input,textarea,[contenteditable]'))return;if(e.key==='t'||e.key==='T'||e.key==='ㅅ')toggle(!R.classList.contains('tt-on'))});
  if(/[?&]tab=text/.test(location.search))toggle(true);
})();
