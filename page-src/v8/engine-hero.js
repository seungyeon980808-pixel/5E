/* 첫 화면 v3 (11-17) — v7.js 뒤에 읽는다. 대상: section.studio.hero3 (v8/hero-v3.html).
   흐름(처음 보일 때 한 번, 약 4초): 바탕화면 → ⌘Space → 스포트라이트에 「5E」 입력 → Return
   → 5E 준비 창(출시본 실제 준비 단계 글 두 순간: 기출 문항·검색 색인 / 출제 화면, 그리고 준비 완료) → 시작 창.
   시작 창에서는 image·exam·hwp 카드 hover를 끊김 없이 돌린다. 손대면 멈추고, 손 뗀 뒤 2.5초에 이어서.
   카드를 누르면 그 묶음(#g-image 등)으로 내려간다. */
(function(){
  'use strict';
  const st=document.querySelector('#studio.hero3');if(!st)return;
  const win=st.querySelector('#appwin'),typed=st.querySelector('.h3-typed'),appName=st.querySelector('.h3-app'),clock=st.querySelector('.h3-clock');
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const cls=(k,on=true)=>st.classList.toggle(k,on);

  // 메뉴 막대 시계: 보는 사람의 지금 시각(실제 macOS 표기)
  try{const d=new Date(),h=d.getHours(),m=String(d.getMinutes()).padStart(2,'0');
    clock.textContent=`${d.getMonth()+1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]}) ${h<12?'오전':'오후'} ${h%12||12}:${m}`}catch(e){}

  // 앞 그림은 그대로 두고 새 그림만 위에서 — 둘 다 반투명해져 뒤가 비치는 일이 없게
  const show=(k,fast)=>{const gs=[...win.querySelectorAll('.g')],nx=gs.find(g=>g.dataset.g===k),cu=gs.find(g=>g.classList.contains('on'));if(!nx||nx===cu)return;
    gs.forEach(g=>{if(g!==nx&&g!==cu)g.classList.remove('on','prev','fast')});if(cu){cu.classList.remove('on','fast');cu.classList.add('prev')}
    nx.classList.remove('prev');nx.classList.toggle('fast',!!fast);void nx.offsetWidth;nx.classList.add('on')};
  async function keys(which,hold){st.dataset.keys=which;await wait(16);cls('h3-keys-on');await wait(90);cls('h3-keys-down');await wait(hold);cls('h3-keys-down',false);return ()=>cls('h3-keys-on',false)}

  let hovering=false,lastTouch=0,ready=false;
  function toReady(){ready=true;cls('h3-spot-on',false);cls('h3-res-on',false);cls('h3-app');(appName.dataset.app==='5E'?appName.innerHTML='__LOGO5E__':appName.textContent=appName.dataset.app);show('ready');cls('h3-ready')}

  async function intro(){
    if(reduce){toReady();return loop()}
    await (window.__5eIntro||Promise.resolve());await wait(250);
    // ⌘Space → 스포트라이트
    const offA=await keys('cmdspace',140);cls('h3-spot-on');await wait(260);offA();
    await wait(220);
    for(const ch of ['5','E']){typed.textContent+=ch;await wait(170)}
    cls('h3-res-on');await wait(520);
    // Return → 5E 열림
    const offB=await keys('ret',110);cls('h3-enter');await wait(120);offB();
    cls('h3-spot-out');await wait(260);
    cls('h3-spot-on',false);cls('h3-res-on',false);cls('h3-spot-out',false);cls('h3-enter',false);
    (appName.dataset.app==='5E'?appName.innerHTML='__LOGO5E__':appName.textContent=appName.dataset.app);show('load-1',true);cls('h3-app');
    // 준비는 짧게 — 실제 준비 단계 글 두 순간 + 준비 완료
    await wait(800);show('load-2');await wait(850);show('load-done');await wait(600);
    show('ready');ready=true;cls('h3-ready');
    await wait(1300);loop();
  }

  // 카드 hover를 끊김 없이 — 사람이 손대면 멈춤, 손 뗀 뒤 2.5초에 이어서
  async function loop(){
    if(reduce)return;
    const order=['image','exam','hwp'];let i=0;
    for(;;){
      if(hovering||performance.now()-lastTouch<2500||document.hidden||window.__heroOff){await wait(400);continue}
      show(order[i%3]);await wait(1100);
      if(hovering)continue;
      show('ready');await wait(300);i++;
      if(i%3===0&&window.__h3montage){st.classList.add('h3-mont');await window.__h3montage(()=>hovering);st.classList.remove('h3-mont');show('ready');await wait(900)}
    }
  }

  let started=false;
  new IntersectionObserver(es=>{if(es[0].isIntersecting&&!started){started=true;intro()}},{threshold:.3}).observe(st.querySelector('#nb'));
  st.querySelectorAll('.h3hot').forEach(h=>{
    h.addEventListener('pointerenter',()=>{if(!ready)return;hovering=true;show(h.dataset.k)});
    h.addEventListener('pointerleave',()=>{if(!ready)return;hovering=false;lastTouch=performance.now();show('ready')});
    h.addEventListener('focus',()=>{if(ready){hovering=true;show(h.dataset.k)}});
    h.addEventListener('blur',()=>{if(ready){hovering=false;lastTouch=performance.now();show('ready')}});
    h.addEventListener('click',()=>{const t=document.getElementById(h.dataset.go);t&&t.scrollIntoView({behavior:'smooth',block:'start'})});
  });
})();
