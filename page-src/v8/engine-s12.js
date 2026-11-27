/* engine-s12 — wipe-scene.js 확장판(그대로 바꿔 끼워도 기존 S2~S9 설정이 같게 돈다).
   더한 것
   1) pre: [{src}]  — 겹침 장면 앞에 보여 줄 실제 앱 화면(창 전체 크기). 타임라인 {do:'pre', i, ms}로 i번 화면을 겹쳐 띄우고, i:-1이면 걷어 내 작업대(겹침 장면)를 드러낸다.
   2) 커서 — 어느 동작에든 cur:{x,y}(앱 화면 px, 1440×900 기준)를 주면 커서가 그리로 미끄러지고, click:true면 누름 물결. cur:null이면 커서를 숨긴다. curAfter:true면 화면을 바꾼 뒤에 움직인다.
   3) states[k].pre / states[k].cur — 단계 단추를 누르면 그 앞쪽 화면을 보여 줌. states[k].next — 손을 뗀 뒤 이어 갈 타임라인 위치. dragNext — 그림을 끌다 놓은 뒤 이어 갈 위치.
   window.WIPE = {S1:{chrome,pre,base,wipe,layers,steps,states,timeline,...}} */
(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const CUR='<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 2l15 10.5-6.6 1.2 3.9 7.4-2.9 1.5-3.9-7.5L4 20z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
function scene(sec,D){
  const fit=$('.wfit',sec),lis=$$('.steps li',sec),hint=$('.hint span',sec),hintDef=hint?hint.textContent:'';
  const C=D.chrome,R=C.rect,pc=(v,t)=>v/t*100+'%',PRE=D.pre||[];
  const st=document.createElement('div');st.className='wstage';
  st.innerHTML=`<div class="wwin" style="aspect-ratio:${C.w}/${C.h}">
     <img class="wchrome off" src="${C.off}" alt="${C.alt||'5E 실제 화면'}">
     ${C.on?`<img class="wchrome on" src="${C.on}" alt="">`:''}
     ${R?`<div class="wpaper" style="left:${pc(R.x,C.w)};top:${pc(R.y,C.h)};width:${pc(R.w,C.w)};height:${pc(R.h,C.h)}">
       <img class="wl w-base" src="${D.base}" alt="${D.baseAlt||''}">
       <div class="wl w-top"><img src="${D.wipe}" alt=""></div>
       ${D.layers.map((l,i)=>l.full?'':`<img class="wl w-lay" data-i="${i}" src="${l.src}" alt="">`).join('')}
       <div class="whandle"><i></i></div>
       <span class="wtag a">${D.tagA||'원본'}</span><span class="wtag b">${D.tagB||'결과'}</span>
     </div>`:''}
     ${D.layers.map((l,i)=>l.full?`<img class="wchrome w-lay" data-i="${i}" src="${l.src}" alt="">`:'').join('')}
     ${PRE.map((f,i)=>`<img class="wchrome w-pre" data-i="${i}" src="${f.src}" alt="${f.alt||''}">`).join('')}
     ${PRE.length||D.cursor?`<div class="wcur">${CUR}<b></b></div>`:''}
   </div>
   <div class="wcap"><span class="wcap-t"></span><span class="wsrc">${D.source||''}</span></div>`;
  fit.append(st);
  const dv=()=>document.createElement('div');const win=$('.wwin',st),paper=$('.wpaper',st)||dv(),top=$('.w-top',st)||dv(),handle=$('.whandle',st)||dv(),lays=$$('.w-lay',st).sort((a,b)=>a.dataset.i-b.dataset.i),pres=$$('.w-pre',st),cur=$('.wcur',st)||dv(),cap=$('.wcap-t',st),tagA=$('.wtag.a',st)||dv(),tagB=$('.wtag.b',st)||dv(),chOn=$('.wchrome.on',st)||dv();
  let p=0,gen=0,idle=0,touched=false,lastState=-1;
  const op=new Array(lays.length).fill(0),po=new Array(pres.length).fill(0);
  function setP(v){p=v;top.style.clipPath=`inset(0 ${100-v}% 0 0)`;handle.style.left=v+'%';tagA.style.opacity=v>92?0:1;tagB.style.opacity=v<8?0:1}
  function setL(i,v){op[i]=v;lays[i].style.opacity=v;chOn.style.opacity=Math.max(0,...op.filter((_,j)=>!(D.layers[j]||{}).full))}
  function setPre(i,v){po[i]=v;pres[i].style.opacity=v;paper.style.pointerEvents=Math.max(0,...po)>.5?'none':''}
  function showHandle(on){handle.classList.toggle('on',on);tagA.classList.toggle('on',on);tagB.classList.toggle('on',on)}
  function step(k){lis.forEach((li,j)=>li.classList.toggle('on',j===k))}
  function caption(t){cap.textContent=t||''}
  function curTo(c,instant){if(!c){cur.classList.remove('on');return}
    cur.style.transition=instant?'none':'';cur.style.left=pc(c.x,C.w);cur.style.top=pc(c.y,C.h);cur.classList.add('on')}
  function ripple(){cur.classList.remove('click');void cur.offsetWidth;cur.classList.add('click')}
  class Abort extends Error{}
  const wait=ms=>{const g=gen;return new Promise((res,rej)=>setTimeout(()=>g===gen?res():rej(new Abort()),ms))};
  function tween(ms,fn){const g=gen;return new Promise((res,rej)=>{const t0=performance.now();const f=n=>{if(g!==gen)return rej(new Abort());const k=Math.min(1,(n-t0)/ms);fn(ease(k));k<1?requestAnimationFrame(f):res()};requestAnimationFrame(f)})}
  async function play(from=0){const T=D.timeline;
    for(let j=from;j<T.length;j++){const a=T[j];
      if(a.step!=null)step(a.step);
      if(a.cap!==undefined)caption(a.cap);
      const moveCur=async()=>{const was=cur.classList.contains('on');curTo(a.cur,!was);if(a.cur&&was)await wait(a.curMs||420);if(a.cur&&a.click){ripple();await wait(160)}};
      if(a.cur!==undefined&&!a.curAfter)await moveCur();
      if(a.do==='reset'){showHandle(false);curTo(null);const f=op.slice(),pp=p;await tween(a.ms||700,k=>{lays.forEach((_,i)=>setL(i,f[i]*(1-k)));setP(pp*(1-k))})}
      else if(a.do==='sweep'){showHandle(true);const a0=p;await tween(a.ms||2000,k=>setP(a0+(a.to-a0)*k))}
      else if(a.do==='hide'){showHandle(false)}
      else if(a.do==='layer'){const i=a.i,a0=op[i],oth=a.only?op.slice():null;lays[i].style.zIndex=(window.__zTop=(window.__zTop||10)+1);await tween(Math.max(600,(a.ms||500)*1.4),k=>setL(i,a0+(a.to-a0)*k));if(oth)lays.forEach((_,q)=>{if(q!==i&&oth[q])setL(q,0)})}
      else if(a.do==='pre'){const i=a.i,f=po.slice();
        if(i>=0&&a.under){/* 겹침 장면 상태를 먼저 맞춤: 이전 회차 흔적 지우기 */lays.forEach((_,q)=>setL(q,0));setP(0);showHandle(false)}
        if(i>=0){pres[i].style.zIndex=2;pres.forEach((e,q)=>{if(q!==i)e.style.zIndex=1})}
        await tween(a.ms||450,k=>{if(i>=0){setPre(i,f[i]+(1-f[i])*k)}else pres.forEach((_,q)=>{if(f[q])setPre(q,f[q]*(1-k))})});
        if(i>=0)pres.forEach((_,q)=>{if(q!==i&&po[q])setPre(q,0)})}
      if(a.cur!==undefined&&a.curAfter)await moveCur();
      if(a.hold)await wait(a.hold);
    }}
  async function run(from=0){if(reduce)return;const g=++gen;try{await play(from);for(;;){await play(0)}}catch(e){if(!(e instanceof Abort))console.error(e)}}
  function touch(){touched=true;gen++;sec.classList.add('touched');if(hint)hint.textContent='직접 해 보는 중 · 손을 떼면 곧 다시 이어서 보여 드려요';clearTimeout(idle);idle=setTimeout(release,3500)}
  function release(){touched=false;sec.classList.remove('touched');if(hint)hint.textContent=hintDef;
    const s=D.states[lastState];
    if(lastState===-2&&D.dragNext!=null)return run(D.dragNext);
    if(s&&s.next!=null)return run(s.next);
    // 예전 방식(wipe-scene.js와 같음): 지금 보이는 모습에 맞는 곳부터
    const t1=op.reduce((m,v,i)=>v>.5?i:m,-1);run(t1>=0?(D.resume[t1+1]??0):(p>50?(D.resume[1]??0):(D.resume[0]??0)))}
  // 손잡이 끌기
  const mv=e=>{const r=paper.getBoundingClientRect();setP(Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)))};
  paper.addEventListener('pointerdown',e=>{e.preventDefault();touch();lastState=-2;curTo(null);pres.forEach((_,i)=>setPre(i,0));showHandle(true);lays.forEach((_,i)=>setL(i,0));paper.setPointerCapture(e.pointerId);paper.classList.add('drag');mv(e);
    const up=()=>{paper.classList.remove('drag');paper.removeEventListener('pointermove',mv);paper.removeEventListener('pointerup',up);clearTimeout(idle);idle=setTimeout(release,2500)};paper.addEventListener('pointermove',mv);paper.addEventListener('pointerup',up)});
  // 앞쪽 화면이 덮고 있을 때 누르면 겹침 장면으로 넘어가 바로 끌 수 있게
  win.addEventListener('pointerdown',e=>{if(e.target.closest('.wpaper'))return;if(Math.max(0,...po)>.5){touch();lastState=-2;curTo(null);pres.forEach((_,i)=>setPre(i,0));lays.forEach((_,i)=>setL(i,0));setP(50);showHandle(true);caption('손잡이를 끌어 원본과 비교해 보세요')}});
  // 단계 눌러 그 모습으로, 잠시 뒤 그 다음부터 이어서
  lis.forEach((li,k)=>li.querySelector('button').addEventListener('click',()=>{touch();lastState=k;step(k);const s=D.states[k]||{};showHandle(!!s.handle);setP(s.p??100);lays.forEach((_,i)=>setL(i,(s.layers||[]).includes(i)?1:0));
    pres.forEach((_,i)=>setPre(i,i===s.pre?1:0));if(s.pre!=null)pres[s.pre].style.zIndex=2;curTo(s.cur||null,true);caption(s.cap||'')}));
  setP(0);step(0);caption(D.timeline[0].cap||'');
  if(PRE.length&&D.timeline[0].do==='pre'){setPre(D.timeline[0].i,1)}
  // 보일 때만 돌리고, 화면 밖이면 멈춤(버벅임 방지)
  if(!reduce){let on=false;new IntersectionObserver(es=>{const v=es[0].isIntersecting;if(v&&!on){on=true;run(0)}else if(!v&&on){on=false;gen++}},{rootMargin:'150px 0px'}).observe(sec)}
}
const W=window.WIPE||{};
$$('[data-wipe]').forEach(sec=>{const d=W[sec.dataset.wipe];if(d)scene(sec,d)});
})();
