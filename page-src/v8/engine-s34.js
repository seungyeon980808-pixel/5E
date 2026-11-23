/* 장면 3·4용 추가 엔진 (s34 세션) — wipe-scene.js 와 같은 자리(.wfit)·같은 단계 목록(.steps li)·같은 손대면 멈춤 규칙.
   wipe-scene.js 보다 「먼저」 넣을 것: WIPE[id].engine==='s34' 인 장면을 이 엔진이 맡고 data-wipe 를 떼어 wipe-scene 이 건너뛰게 한다.
   더한 기능
   1) 겹친 비교(손잡이)를 화면 한 장(layer)에 붙일 수 있음: layers[i].wipe = {rect:{x,y,w,h}, base, top, tagA, tagB}
      → 그 장이 보일 때 timeline 의 sweep 이 그 장의 손잡이를 움직이고, 사용자가 끌 수도 있음.
   2) 커서: timeline 항목에 cur:{x,y} (화면 좌표, 1440×900 기준) · click:true → 핵심 누름에만 커서·눌림 표시. cur:null 이면 숨김.
   3) 확대(클로즈업): {do:'zoom', rect:{x,y,w,h}|null, ms} → 같은 촬영본을 CSS 로 확대(2배 촬영본이라 1.5배까지 선명).
   states[k] 에 zoom·p·layers·cap, reset 은 확대도 풀어 줌. */
(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const css=`
.s34-win{position:relative;width:100%;border:1px solid var(--line-strong,#eeeeef29);border-radius:10px;overflow:hidden;background:#0b0e14;box-shadow:0 1px 0 #ffffff0a inset,0 30px 100px -30px #000000d0}
.s34-zoom{position:absolute;inset:0;transform-origin:0 0;will-change:transform}
.s34-img{position:absolute;inset:0;width:100%;height:100%;display:block;user-select:none;pointer-events:none}
.s34-lay{position:absolute;inset:0;opacity:0;will-change:opacity}
.s34-lay>.s34-img{position:absolute}
.s34-paper{position:absolute;background:#fff;overflow:hidden;cursor:ew-resize;touch-action:none;user-select:none;pointer-events:auto}
.s34-paper img{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none}
.s34-top{position:absolute;inset:0;clip-path:inset(0 100% 0 0);will-change:clip-path}
.s34-cur{position:absolute;left:0;top:0;width:2.1%;opacity:0;pointer-events:none;transition:opacity .25s;z-index:5;filter:drop-shadow(0 2px 3px #0009)}
.s34-cur svg{display:block;width:100%;height:auto}
.s34-ring{position:absolute;left:0;top:0;width:3.2%;aspect-ratio:1;border-radius:50%;border:2px solid rgb(var(--accent-rgb,127 205 214));opacity:0;pointer-events:none;transform:translate(-50%,-50%) scale(.4);z-index:4}
.s34-ring.go{animation:s34ring .55s ease-out}
@keyframes s34ring{0%{opacity:.95;transform:translate(-50%,-50%) scale(.35)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.25)}}
`;
function addCss(){if($('#s34-css'))return;const s=document.createElement('style');s.id='s34-css';s.textContent=css;document.head.append(s)}
function scene(sec,D){
  addCss();
  const fit=$('.wfit',sec),lis=$$('.steps li',sec),hint=$('.hint span',sec),hintDef=hint?hint.textContent:'';
  const C=D.chrome,W=C.w,H=C.h,pc=(v,t)=>v/t*100+'%';
  const st=document.createElement('div');st.className='wstage';
  const wipeHtml=w=>`<div class="s34-paper" style="left:${pc(w.rect.x,W)};top:${pc(w.rect.y,H)};width:${pc(w.rect.w,W)};height:${pc(w.rect.h,H)}">
      <img src="${w.base}" alt="${w.baseAlt||''}"><div class="s34-top"><img src="${w.top}" alt=""></div>
      <div class="whandle"><i></i></div><span class="wtag a">${w.tagA||'원본'}</span><span class="wtag b">${w.tagB||'결과'}</span></div>`;
  st.innerHTML=`<div class="s34-win" style="aspect-ratio:${W}/${H}">
     <div class="s34-zoom">
       <img class="s34-img" src="${C.off}" alt="${C.alt||'5E 실제 화면'}">
       ${D.layers.map((l,i)=>`<div class="s34-lay" data-i="${i}"><img class="s34-img" src="${l.src}" alt="">${l.wipe?wipeHtml(l.wipe):''}</div>`).join('')}
       <div class="s34-ring"></div>
       <div class="s34-cur"><svg viewBox="0 0 24 28"><path d="M2 1.5v21.2l5.6-5.2 3.6 8.3 3.6-1.6-3.5-8.2h7.8z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg></div>
     </div>
   </div>
   <div class="wcap"><span class="wcap-t"></span><span class="wsrc">${D.source||''}</span></div>`;
  fit.append(st);
  const zoomEl=$('.s34-zoom',st),lays=$$('.s34-lay',st),cap=$('.wcap-t',st),curEl=$('.s34-cur',st),ring=$('.s34-ring',st);
  const papers=lays.map(l=>$('.s34-paper',l));
  let gen=0,idle=0;const op=new Array(lays.length).fill(0);const P=new Array(lays.length).fill(0);
  let Z={x:0,y:0,w:W,h:H},cur={x:W/2,y:H/2,on:false};
  function applyZ(z){Z=z;const s=W/z.w;zoomEl.style.transform=`scale(${s}) translate(${-z.x/W*100}%,${-z.y/H*100}%)`}
  function setCur(x,y){cur.x=x;cur.y=y;curEl.style.left=pc(x,W);curEl.style.top=pc(y,H)}
  function showCur(on){cur.on=on;curEl.style.opacity=on?1:0}
  function clickFx(){ring.style.left=pc(cur.x,W);ring.style.top=pc(cur.y,H);ring.classList.remove('go');void ring.offsetWidth;ring.classList.add('go')}
  function setP(i,v){const p=papers[i];if(!p)return;P[i]=v;$('.s34-top',p).style.clipPath=`inset(0 ${100-v}% 0 0)`;$('.whandle',p).style.left=v+'%';$('.wtag.a',p).style.opacity=v>92?0:1;$('.wtag.b',p).style.opacity=v<8?0:1}
  function showHandle(i,on){const p=papers[i];if(!p)return;$$('.whandle,.wtag',p).forEach(e=>e.classList.toggle('on',on))}
  function setL(i,v){op[i]=v;lays[i].style.opacity=v;lays[i].style.pointerEvents=v>.5?'auto':'none'}
  const topWipe=()=>{let t=-1;op.forEach((v,i)=>{if(v>.5&&papers[i])t=i});return t};
  function step(k){lis.forEach((li,j)=>li.classList.toggle('on',j===k))}
  function caption(t){cap.textContent=t||''}
  class Abort extends Error{}
  const wait=ms=>{const g=gen;return new Promise((res,rej)=>setTimeout(()=>g===gen?res():rej(new Abort()),ms))};
  function tween(ms,fn){const g=gen;return new Promise((res,rej)=>{const t0=performance.now();const f=n=>{if(g!==gen)return rej(new Abort());const k=Math.min(1,(n-t0)/ms);fn(ease(k));k<1?requestAnimationFrame(f):res()};requestAnimationFrame(f)})}
  const full={x:0,y:0,w:W,h:H};
  async function play(from=0){const T=D.timeline;
    for(let j=from;j<T.length;j++){const a=T[j];const jobs=[];
      if(a.step!=null)step(a.step);
      if(a.cap!==undefined)caption(a.cap);
      if(a.cur===null)showCur(false);
      else if(a.cur){const c0={...cur},c1=a.cur;if(!cur.on){setCur(c1.x,c1.y);showCur(true)}else jobs.push(tween(a.curMs||380,k=>setCur(c0.x+(c1.x-c0.x)*k,c0.y+(c1.y-c0.y)*k)))}
      await Promise.all(jobs);
      if(a.click)clickFx();
      if(a.do==='reset'){showCur(false);const f=op.slice(),z0={...Z};papers.forEach((_,i)=>showHandle(i,false));await tween(a.ms||700,k=>{lays.forEach((_,i)=>setL(i,f[i]*(1-k)));applyZ({x:z0.x*(1-k),y:z0.y*(1-k),w:z0.w+(W-z0.w)*k,h:z0.h+(H-z0.h)*k})});papers.forEach((_,i)=>setP(i,0))}
      else if(a.do==='sweep'){const i=a.i??topWipe();if(i>=0){showHandle(i,true);const a0=P[i];await tween(a.ms||1500,k=>setP(i,a0+(a.to-a0)*k))}}
      else if(a.do==='hide'){const i=a.i??topWipe();if(i>=0)showHandle(i,false)}
      else if(a.do==='zoom'){const z0={...Z},z1=a.rect||full;await tween(a.ms||700,k=>applyZ({x:z0.x+(z1.x-z0.x)*k,y:z0.y+(z1.y-z0.y)*k,w:z0.w+(z1.w-z0.w)*k,h:z0.h+(z1.h-z0.h)*k}))}
      else if(a.do==='layer'){const i=a.i,a0=op[i],oth=a.only?op.slice():null;if(a.p!=null)setP(i,a.p);lays[i].style.zIndex=(window.__zTop=(window.__zTop||10)+1);await tween(Math.max(600,(a.ms||450)*1.4),k=>setL(i,a0+(a.to-a0)*k));if(oth)lays.forEach((_,q)=>{if(q!==i&&oth[q])setL(q,0)})}
      if(a.hold)await wait(a.hold);
    }}
  async function run(from=0){if(reduce)return;++gen;try{await play(from);for(;;){await play(0)}}catch(e){if(!(e instanceof Abort))console.error(e)}}
  function touch(){gen++;showCur(false);sec.classList.add('touched');if(hint)hint.textContent='직접 해 보는 중 · 손을 떼면 곧 다시 이어서 보여 드려요';clearTimeout(idle);idle=setTimeout(release,3500)}
  function release(){sec.classList.remove('touched');if(hint)hint.textContent=hintDef;
    const t1=op.reduce((m,v,i)=>v>.5?i:m,-1);run(D.resume[t1+1]??0)}
  // 겹친 비교 손잡이 끌기
  papers.forEach((p,i)=>{if(!p)return;const mv=e=>{const r=p.getBoundingClientRect();setP(i,Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)))};
    p.addEventListener('pointerdown',e=>{e.preventDefault();touch();showHandle(i,true);p.setPointerCapture(e.pointerId);mv(e);
      const up=()=>{p.removeEventListener('pointermove',mv);p.removeEventListener('pointerup',up);clearTimeout(idle);idle=setTimeout(release,2500)};p.addEventListener('pointermove',mv);p.addEventListener('pointerup',up)})});
  // 단계 눌러 그 모습으로
  lis.forEach((li,k)=>li.querySelector('button').addEventListener('click',()=>{touch();step(k);const s=D.states[k]||{};
    lays.forEach((_,i)=>setL(i,(s.layers||[]).includes(i)?1:0));papers.forEach((_,i)=>{showHandle(i,s.p!=null&&(s.layers||[]).includes(i));setP(i,s.p??100)});applyZ(s.zoom||full);caption(s.cap||'')}));
  applyZ(full);step(0);caption(D.timeline[0].cap||'');
  // 보일 때만 돌리고, 화면 밖이면 멈춤(버벅임 방지)
  if(!reduce){let on=false;new IntersectionObserver(es=>{const v=es[0].isIntersecting;if(v&&!on){on=true;run(0)}else if(!v&&on){on=false;gen++}},{rootMargin:'150px 0px'}).observe(sec)}
}
const Wd=window.WIPE||{};
$$('[data-wipe]').forEach(sec=>{const id=sec.dataset.wipe,d=Wd[id];if(d&&d.engine==='s34'){sec.removeAttribute('data-wipe');sec.dataset.wipe34=id;scene(sec,d)}});
})();
