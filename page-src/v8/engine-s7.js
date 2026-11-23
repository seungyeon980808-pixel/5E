/* 장면 7(설정 id S8) 전용 엔진 — 「시험지 위에서 바로 고치기」.
   출시본 5E 1.7.0을 실제로 조작해 찍은 화면(시험지 → 그림 편집 창 → 적용 → 시험지)을 같은 자리에서 바꾸고,
   편집 창 단계에서는 카메라를 편집 창으로 당겨 「라벨 없는 실제 결과 그림」 위에 실제 라벨(자리·글자·크기 그대로)을
   HTML로 얹는다. 방문자는 라벨을 끌어 옮기거나 눌러 글자를 바꿔 볼 수 있다. 손대지 않으면 계속 돈다.

   설정: window.WIPE.S8 (scene-S8.json) 에 engine:"s7" 이 있으면 이 엔진이 맡는다.
   wipe-scene.js 보다 먼저 읽혀도, 나중에 읽혀도 동작한다(먼저면 data-wipe 를 떼어 wipe-scene 이 건너뛰게 하고,
   나중이면 wipe-scene 이 만든 무대를 치우고 다시 만든다). */
(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const NS='http://www.w3.org/2000/svg';

function scene(sec,D){
  const S=D.s7,C=D.chrome,W=C.w,H=C.h,E=S.edit;
  const fit=$('.wfit',sec)||$('.rfit',sec);if(!fit)return;
  fit.innerHTML='';sec.classList.add('s7');
  const lis=$$('.steps li',sec),hintEl=$('.hint span',sec),hintDef=S.hint||(hintEl?hintEl.textContent:'');
  if(hintEl)hintEl.textContent=hintDef;
  const pc=(v,t)=>(v/t*100)+'%';
  const st=document.createElement('div');st.className='wstage s7stage';
  st.innerHTML=`<div class="wwin s7win" style="aspect-ratio:${W}/${H}">
    <div class="s7cam">
      <img class="wchrome s7base" src="${C.off}" alt="${C.alt||'5E 실제 화면'}">
      ${D.layers.map((l,i)=>`<img class="wchrome s7f" data-i="${i}" src="${l.src}" alt="" loading="lazy" decoding="async">`).join('')}
      <div class="s7edit" style="left:${pc(E.rect.x,W)};top:${pc(E.rect.y,H)};width:${pc(E.rect.w,W)};height:${pc(E.rect.h,H)}">
        <img class="s7bare" src="${E.base}" alt="${E.alt||''}" draggable="false">
        <svg class="s7lead" viewBox="0 0 ${E.rect.w} ${E.rect.h}" preserveAspectRatio="none"></svg>
        ${E.before?`<div class="s7before"><div class="s7bimg"><img src="${E.before.src}" alt="${E.before.alt||'변환 전 기출 그림'}" style="width:${E.before.wPct}%" draggable="false"></div><div class="s7bh"><i></i></div><span class="s7bt a">변환 전 · 기출 원본</span><span class="s7bt b">변환 후 · 5E</span></div>`:''}
      </div>
      <div class="s7cmp"><div class="s7cmpimg"><img alt="" draggable="false"></div><div class="s7bh"><i></i></div><span class="s7bt a"></span><span class="s7bt b"></span></div>
      ${(S.zoom||[]).map((z,i)=>`<div class="s7zoom" data-z="${i}">
         <div class="s7zfrom" style="left:${pc(z.from.x,W)};top:${pc(z.from.y,H)};width:${pc(z.from.w,W)};height:${pc(z.from.h,H)}"></div>
         <div class="s7zbox" style="left:${pc(z.at.x,W)};top:${pc(z.at.y,H)};width:${pc(z.at.w,W)};height:${pc(z.at.h,H)}"><img src="${z.src}" alt="${z.alt||''}" loading="lazy"><span>${z.tag||''}</span></div>
       </div>`).join('')}
      <div class="s7cur"><svg viewBox="0 0 24 24"><path d="M5 2.5v17.2l4.3-4.1 2.9 6.6 2.9-1.3-2.9-6.5h6z"/></svg><i></i></div>
    </div>
  </div>
  <div class="wcap"><span class="wcap-t"></span><span class="wsrc">${D.source||''}</span></div>`;
  fit.append(st);
  const win=$('.s7win',st),cam=$('.s7cam',st),frames=$$('.s7f',st),edit=$('.s7edit',st),lead=$('.s7lead',st),cur=$('.s7cur',st),capEl=$('.wcap-t',st),zooms=$$('.s7zoom',st);

  // 창 크기에 맞춘 비율(라벨 글자 크기용)
  const ro=new ResizeObserver(()=>{win.style.setProperty('--k',win.clientWidth/W)});ro.observe(win);

  // ---------- 라벨 ----------
  const labs=E.labels.map(L=>{const el=document.createElement('div');el.className='s7lab'+(L.serif?' serif':'')+(L.lead?' lead':'');el.dataset.id=L.id;
    el.innerHTML=`<span class="s7t" spellcheck="false">${L.t}</span>`;el.style.setProperty('--fs',L.fs||L.h*.9);edit.append(el);
    const o={L,el,t:$('.s7t',el),x:L.x,y:L.y,txt:L.t,line:null};
    if(L.lead){o.line=document.createElementNS(NS,'line');lead.append(o.line)}
    return o});
  const byId=id=>labs.find(o=>o.L.id===id);
  function place(o){o.el.style.left=pc(o.x-E.rect.x,E.rect.w);o.el.style.top=pc(o.y-E.rect.y,E.rect.h);o.el.style.width=pc(o.L.w,E.rect.w);o.el.style.height=pc(o.L.h,E.rect.h);
    if(o.line){const a=o.L.lead,e=o.L.leadEnd,bx=e?o.x+(e.x-o.L.x):Math.max(o.x,Math.min(a.x,o.x+o.L.w)),by=e?o.y+(e.y-o.L.y):Math.max(o.y,Math.min(a.y,o.y+o.L.h));
      // 지시선은 라벨 상자 가장 가까운 점에서 가리키는 곳까지
      o.line.setAttribute('x1',a.x-E.rect.x);o.line.setAttribute('y1',a.y-E.rect.y);o.line.setAttribute('x2',bx-E.rect.x);o.line.setAttribute('y2',by-E.rect.y)}}
  function setTxt(o,t){o.txt=t;if(o.t.textContent!==t)o.t.textContent=t}
  function labelsTo(which){labs.forEach(o=>{const L=o.L,e=which==='end'&&L.end?L.end:L;o.x=e.x??L.x;o.y=e.y??L.y;setTxt(o,e.t??L.t);
    o.el.classList.toggle('gone',!!(which!=='end'&&L.added));if(o.line)o.line.classList.toggle('gone',!!(which!=='end'&&L.added));place(o)})}
  // 글자 크기 — 실제 라벨 상자(앱이 그린 글자 폭)에 맞게 한 번 재서 고정
  function fitFonts(){const cv=document.createElement('canvas').getContext('2d');
    labs.forEach(o=>{const ff=getComputedStyle(o.t).fontFamily;cv.font=`100px ${ff}`;const m=cv.measureText(o.L.t).width||100;
      let fs=100*o.L.w/m;const hmax=o.L.h*1.25;if(fs>hmax)fs=hmax;o.el.style.setProperty('--fs',fs.toFixed(2))})}
  fitFonts();if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fitFonts);
  labelsTo('start');
  function labelsOn(v){edit.classList.toggle('on',v)}

  // ---------- 카메라 ----------
  // 카메라: 이름 붙은 사각형(S.cams, 창 좌표)으로 당기고 민다. 'full' 은 전체 화면.
  //  하위 호환: S.cam 하나만 있으면 이름 'edit'.
  const FULL={x:0,y:0,w:W,h:H},CAMS=Object.assign({full:FULL},S.cams||{},S.cam?{edit:S.cam}:{});
  let camR={...FULL};
  const camOf=n=>n===true?(CAMS.edit||FULL):(n&&CAMS[n])||FULL;
  function camSetR(r){camR={...r};const s=Math.min(W/r.w,H/r.h),tX=W/2-(r.x+r.w/2)*s,tY=H/2-(r.y+r.h/2)*s;
    cam.style.transform=`translate(${tX/W*100}%,${tY/H*100}%) scale(${s})`}
  const lerpR=(a,b,k)=>({x:a.x+(b.x-a.x)*k,y:a.y+(b.y-a.y)*k,w:a.w+(b.w-a.w)*k,h:a.h+(b.h-a.h)*k});
  function camSet(n){camSetR(typeof n==='number'?lerpR(FULL,CAMS.edit||FULL,n):camOf(n))}
  camSet((D.states[0]&&D.states[0].cam)||'full');

  // ---------- 화면(실제 촬영) ----------
  const bf=$('.s7before',st),bimg=bf&&$('.s7bimg',bf),bh=bf&&$('.s7bh',bf);let bp=100;
  function wipeSet(p){if(!bf)return;bp=p;bimg.style.clipPath=`inset(0 ${100-p}% 0 0)`;bh.style.left=p+'%'}
  function wipeOn(v){if(bf)bf.classList.toggle('on',v)}
  if(bf){const mv=e=>{const r=bf.getBoundingClientRect();wipeSet(Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)))};
    bf.addEventListener('pointerdown',e=>{if(!bf.classList.contains('on'))return;e.preventDefault();e.stopPropagation();touch();bf.setPointerCapture(e.pointerId);mv(e);
      const up=()=>{bf.removeEventListener('pointermove',mv);bf.removeEventListener('pointerup',up);later(3000)};bf.addEventListener('pointermove',mv);bf.addEventListener('pointerup',up)})}
  const cmp=$('.s7cmp',st),cmpImg=$('.s7cmpimg',cmp),cmpH=$('.s7bh',cmp);let cp=100;
  function cmpSet(p){cp=p;cmpImg.style.clipPath=`inset(0 ${100-p}% 0 0)`;cmpH.style.left=p+'%'}
  function cmpOn(v){cmp.classList.toggle('on',v)}
  {const mv=e=>{const r=cmp.getBoundingClientRect();cmpSet(Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)))};
   cmp.addEventListener('pointerdown',e=>{if(!cmp.classList.contains('on'))return;e.preventDefault();e.stopPropagation();touch();cmp.setPointerCapture(e.pointerId);mv(e);
     const up=()=>{cmp.removeEventListener('pointermove',mv);cmp.removeEventListener('pointerup',up);later(3000)};cmp.addEventListener('pointermove',mv);cmp.addEventListener('pointerup',up)})}
  const op=new Array(frames.length).fill(0);
  function setF(i,v){op[i]=v;frames[i].style.opacity=v}
  function showNow(i){frames.forEach((_,j)=>setF(j,j===i?1:0))}
  function zoomOn(i,v){zooms.forEach((z,j)=>z.classList.toggle('on',j===i&&v))}
  function step(k){lis.forEach((li,j)=>li.classList.toggle('on',j===k))}
  function caption(t){capEl.textContent=t||''}
  function curAt(x,y,vis=true){cur.style.left=pc(x,W);cur.style.top=pc(y,H);cur.classList.toggle('on',vis);cur._x=x;cur._y=y}
  function click(dbl){cur.classList.remove('clk','dbl');void cur.offsetWidth;cur.classList.add(dbl?'dbl':'clk')}

  class Abort extends Error{}
  let gen=0,idle=0,touched=false,editing=false,stateK=0;
  const wait=ms=>{const g=gen;return new Promise((res,rej)=>setTimeout(()=>g===gen?res():rej(new Abort()),ms))};
  function tween(ms,fn){const g=gen;return new Promise((res,rej)=>{const t0=performance.now();const f=n=>{if(g!==gen)return rej(new Abort());const k=Math.min(1,(n-t0)/ms);fn(ease(k));k<1?requestAnimationFrame(f):res()};requestAnimationFrame(f)})}

  async function act(a){
    switch(a.do){
      case 'show':{const i=a.i,f=op.slice(),ms=Math.max(560,(a.ms||450)*1.4);if(i>=0){frames[i].style.zIndex=(window.__s7z=(window.__s7z||5)+1);await tween(ms,k=>setF(i,f[i]+(1-f[i])*k));frames.forEach((_,j)=>{if(j!==i)setF(j,0)})}else{await tween(ms,k=>frames.forEach((_,j)=>setF(j,f[j]*(1-k))))}break}
      case 'cursor':{const x0=cur._x??a.x,y0=cur._y??a.y;cur.classList.add('on');await tween(a.ms||600,k=>curAt(x0+(a.x-x0)*k,y0+(a.y-y0)*k));break}
      case 'curhide':cur.classList.remove('on');break;
      case 'click':click(a.dbl);break;
      case 'cam':{const r0={...camR},r1=camOf(a.to===1?true:a.to===0?'full':a.to);await tween(a.ms||700,k=>camSetR(lerpR(r0,r1,k)));break}
      case 'labels':labelsOn(!!a.on);if(a.reset)labelsTo('start');break;
      case 'drag':{const o=byId(a.id),e=o.L.end,x0=o.x,y0=o.y,gx=o.L.grab?o.L.grab.x:o.L.w/2,gy=o.L.grab?o.L.grab.y:o.L.h/2;
        await act({do:'cursor',x:x0+gx,y:y0+gy,ms:450});o.el.classList.add('hot');
        await tween(a.ms||900,k=>{o.x=x0+(e.x-x0)*k;o.y=y0+(e.y-y0)*k;place(o);curAt(o.x+gx,o.y+gy)});o.el.classList.remove('hot');break}
      case 'type':{const o=byId(a.id),to=a.text??o.L.end.t;await act({do:'cursor',x:o.x+o.L.w/2,y:o.y+o.L.h*.8,ms:380});click();o.el.classList.add('hot');
        await wait(160);setTxt(o,'');o.el.classList.add('caret');await wait(220);for(const ch of to){setTxt(o,o.txt+ch);await wait(a.per||170)}await wait(250);o.el.classList.remove('hot','caret');break}
      case 'leader':{const o=byId(a.id);await act({do:'cursor',x:o.L.lead.x,y:o.L.lead.y,ms:420});click();
        o.line.classList.remove('gone');const x1=+o.line.getAttribute('x1'),y1=+o.line.getAttribute('y1'),x2=+o.line.getAttribute('x2'),y2=+o.line.getAttribute('y2');
        await tween(a.ms||600,k=>{o.line.setAttribute('x2',x1+(x2-x1)*k);o.line.setAttribute('y2',y1+(y2-y1)*k);curAt(o.L.lead.x+(x2-x1)*k,o.L.lead.y+(y2-y1)*k)});
        click();o.el.classList.remove('gone');setTxt(o,'');o.el.classList.add('caret','hot');for(const ch of o.L.t){await wait(170);setTxt(o,o.txt+ch)}await wait(250);o.el.classList.remove('caret','hot');break}
      case 'zoom':zoomOn(a.i,a.on!==false);break;
      case 'wipe':{wipeOn(true);const p0=a.from??bp;await tween(a.ms||1200,k=>wipeSet(p0+(a.to-p0)*k));break}
      case 'wipeoff':wipeOn(false);break;
      case 'cmp':{if(a.src){$('img',cmpImg).src=a.src;$('.s7bt.a',cmp).textContent=a.ta||'고치기 전';$('.s7bt.b',cmp).textContent=a.tb||'고친 뒤';cmpSet(a.from??100)}cmpOn(true);const p0=cp;await tween(a.ms||1400,k=>cmpSet(p0+(a.to-p0)*k));break}
      case 'cmpoff':cmpOn(false);break;
      case 'reset':{zoomOn(-1,false);wipeOn(false);cmpOn(false);labelsOn(false);cur.classList.remove('on');const f=op.slice();const r0={...camR},r1=camOf(D.states[0]&&D.states[0].cam);await tween(a.ms||500,k=>{frames.forEach((_,j)=>setF(j,f[j]*(1-k)));camSetR(lerpR(r0,r1,k))});labelsTo('start');break}
    }
  }
  async function play(from=0){const T=D.timeline;
    for(let j=from;j<T.length;j++){const a=T[j];if(a.step!=null){step(a.step);stateK=a.step}if(a.cap!==undefined)caption(a.cap);
      if(a.do)await act(a);if(a.hold)await wait(a.hold)}}
  async function run(from=0){if(reduce)return;const g=++gen;try{await play(from);for(;;){await play(0)}}catch(e){if(!(e instanceof Abort))console.error(e)}}

  // ---------- 손대기 ----------
  function hint(t){if(hintEl)hintEl.textContent=t}
  function touch(){touched=true;gen++;sec.classList.add('touched');cur.classList.remove('on');hint(S.hintTouch||'직접 해 보는 중 · 손을 떼면 곧 다시 이어서 보여 드려요');clearTimeout(idle)}
  function later(ms=3000){clearTimeout(idle);idle=setTimeout(()=>{if(editing)return later(ms);release()},ms)}
  function release(){touched=false;sec.classList.remove('touched');hint(hintDef);run(D.resume[stateK]??0)}
  function applyState(k){const s=D.states[k]||{};stateK=k;wipeOn(!!s.wipe);cmpOn(false);if(s.wipe)wipeSet(50);step(k);showNow(s.frame??-1);camSet(s.cam||'full');labelsOn(!!s.labels);labelsTo(s.labels==='end'?'end':'start');zoomOn(s.zoom??-1,s.zoom!=null);caption(s.cap||'');cur.classList.remove('on')}
  lis.forEach((li,k)=>li.querySelector('button').addEventListener('click',()=>{touch();applyState(k);
    if(D.states[k]&&D.states[k].labels){hint(S.hintEdit||'라벨을 끌어 옮기거나, 눌러서 글자를 바꿔 보세요')}later(3500)}));

  // 라벨 끌기·고치기 — 실제 앱처럼: 끌면 옮겨지고(지시선은 따라옴), 누르면 글자 고치기
  labs.forEach(o=>{const el=o.el;let sx,sy,ox,oy,moved=false,pid=null;
    el.addEventListener('pointerdown',e=>{if(!edit.classList.contains('on')||o.el.classList.contains('gone'))return;if(el.classList.contains('editing'))return;
      e.preventDefault();touch();pid=e.pointerId;el.setPointerCapture(pid);const r=edit.getBoundingClientRect();
      sx=e.clientX;sy=e.clientY;ox=o.x;oy=o.y;moved=false;o._sc=E.rect.w/r.width;el.classList.add('hot')});
    el.addEventListener('pointermove',e=>{if(pid!==e.pointerId)return;const dx=(e.clientX-sx)*o._sc,dy=(e.clientY-sy)*o._sc;if(!moved&&Math.hypot(e.clientX-sx,e.clientY-sy)<4)return;moved=true;
      o.x=Math.max(E.rect.x-o.L.w*.3,Math.min(E.rect.x+E.rect.w-o.L.w*.7,ox+dx));o.y=Math.max(E.rect.y-o.L.h*.3,Math.min(E.rect.y+E.rect.h-o.L.h*.7,oy+dy));place(o)});
    const up=e=>{if(pid!==e.pointerId)return;pid=null;el.classList.remove('hot');if(!moved){startEdit(o)}else later(3000)};
    el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up)});
  function startEdit(o){editing=true;const t=o.t;o.el.classList.add('editing');t.contentEditable='plaintext-only';if(t.contentEditable!=='plaintext-only')t.contentEditable='true';t.focus();
    const rg=document.createRange();rg.selectNodeContents(t);const sl=getSelection();sl.removeAllRanges();sl.addRange(rg);hint(S.hintType||'글자를 바꾼 뒤 Enter — 시험지 쪽 라벨이 이렇게 바뀝니다')}
  function endEdit(o){const t=o.t;t.contentEditable='false';o.el.classList.remove('editing');o.txt=t.textContent.replace(/\s+/g,' ').trim()||o.L.t;t.textContent=o.txt;editing=false;later(3000)}
  labs.forEach(o=>{o.t.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key==='Escape'||e.key==='Tab'){e.preventDefault();o.t.blur()}e.stopPropagation()});
    o.t.addEventListener('blur',()=>{if(o.el.classList.contains('editing'))endEdit(o)});
    o.t.addEventListener('input',()=>{touch()})});

  applyState(0);caption(D.timeline[0].cap||'');
  if(reduce){applyState(1)}else{
    // 화면에 들어왔을 때만 돈다
    let started=false;const io=new IntersectionObserver(es=>{es.forEach(en=>{if(en.isIntersecting&&!started){started=true;run(0)}else if(!en.isIntersecting&&started&&!touched){gen++;started=false;applyState(0)}})},{threshold:.25});io.observe(win)}
}

function boot(){const W=window.WIPE||{};
  for(const [id,d] of Object.entries(W)){if(!d||d.engine!=='s7')continue;
    $$(`[data-wipe="${id}"],[data-s7="${id}"]`).forEach(sec=>{if(sec.dataset.s7done)return;sec.dataset.s7done='1';sec.dataset.s7=id;sec.removeAttribute('data-wipe');scene(sec,d)})}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
// wipe-scene.js 가 먼저 돌았어도 data-wipe 는 그대로라 위에서 잡힌다(그 무대는 scene()이 비운다).
// wipe-scene.js 가 나중에 돌면 data-wipe 가 이미 없으므로 건너뛴다.
boot();
})();
