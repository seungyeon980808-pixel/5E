/* 실제 앱 촬영본 장면 — 실제 화면 한 장을 무대로, 그 위에서 진짜로 만져 볼 수 있게.
   가만히 두면 찍은 순서대로 저절로 돌고(마우스 화살표가 실제로 누른 자리로 감),
   사람이 손대면 멈추고 그 사람이 하는 대로 따라간다.
   - 다음에 누를 곳이 빛난다 → 누르면 그 동작이 일어나고, 다음 누를 곳까지 이어서 보여 준다
   - compare: 원본과 변환본 사이 손잡이 끌기 / toggle: 라벨 켜고 끄기 / switch: 조판 틀 바꾸기
   - labeler: 그림 위를 눌러 지시선을 긋고 라벨 글자 쓰기
   window.REAL = {S1:{w,h,frames:[{src,step,hold,cursor,click}],controls:{...}}} (build.py가 만든다) */
(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const CUR='<svg viewBox="0 0 24 24"><path d="M4 2 L4 20 L9 15.4 L12.3 22.6 L15.2 21.3 L12 14.2 L19 14.2 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
class Abort extends Error{}
const el=(tag,cls,html)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e};

function player(sec,data){
  const C=data.controls||{};
  const fit=$('.rfit',sec),lis=$$('.steps li',sec),hint=$('.hint span',sec),hintBox=$('.hint',sec),hintDef=hint?hint.textContent:'';
  const W=data.w,H=data.h,F=data.frames;
  const stage=el('div','rstage');stage.style.aspectRatio=W+'/'+H;
  const cam=el('div','rcam');stage.append(cam);
  const imgs=F.map((f,i)=>{const im=el('img','rf');im.src=f.src;im.alt='';im.decoding='async';if(i>1)im.loading='lazy';cam.append(im);return im});
  const pos=(o,x,y,w,h)=>{o.style.left=x/W*100+'%';o.style.top=y/H*100+'%';if(w!=null){o.style.width=w/W*100+'%';o.style.height=h/H*100+'%'}};
  // 비교 손잡이
  let cmp=null;
  if(C.compare){const r=C.compare.rect;cmp=el('div','rcmp');pos(cmp,r.x,r.y,r.w,r.h);
    cmp.innerHTML=`<div class="rcmp-a"><img src="${C.compare.src}" alt=""></div><div class="rcmp-h"><i></i></div><span class="rcmp-t a">원본</span><span class="rcmp-t b">변환본</span>`;cam.append(cmp)}
  // 라벨 달기 판
  let lab=null;
  if(C.labeler){const r=C.labeler.rect;lab=el('div','rlab');pos(lab,r.x,r.y,r.w,r.h);lab.innerHTML='<svg preserveAspectRatio="none"></svg><div class="rlab-tip">그림 위를 눌러 지시선을 그어 보세요</div>';cam.append(lab)}
  // 틀 바꾸기
  let sw=null;
  if(C.switch){sw=el('div','rsw');sw.innerHTML=C.switch.labels.map((t,j)=>`<button type="button" data-j="${j}">${t}</button>`).join('');stage.append(sw)}
  // 사진 바꾸기: 앞 사진(원본)을 덮어 두고 빛줄이 지나가며 걷어 내 변환본이 드러나게
  let conv=null,hit=null;
  if(C.convert){const r=C.convert.rect;conv=el('div','rconv');pos(conv,r.x,r.y,r.w,r.h);
    conv.innerHTML=`<div class="rconv-a"><img src="${F[C.convert.before].src}" alt="" style="width:${W/r.w*100}%;left:${-r.x/r.w*100}%;top:${-r.y/r.h*100}%"></div><i class="rconv-s"></i>`;cam.append(conv);
    hit=el('button','rconv-hit');hit.type='button';hit.setAttribute('aria-label','사진 바꾸기');pos(hit,r.x,r.y,r.w,r.h);cam.append(hit)}
  function convert(){if(!conv)return;conv.classList.add('on');const t0=performance.now();
    const tick=n=>{const p=Math.min(1,(n-t0)/1500);const e=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;conv.style.setProperty('--cut',e*100+'%');if(p<1)requestAnimationFrame(tick);else setTimeout(()=>conv.classList.remove('on'),150)};
    conv.style.setProperty('--cut','0%');requestAnimationFrame(tick)}
  const cur=el('div','rcur',CUR);cam.append(cur);
  const nxt=el('button','rnext');nxt.type='button';nxt.setAttribute('aria-label','여기를 눌러 보세요');cam.append(nxt);
  let tog=null;
  if(C.toggle){tog=el('button','rnext rtog');tog.type='button';tog.setAttribute('aria-label','켜고 끄기');pos(tog,C.toggle.at.x,C.toggle.at.y);cam.append(tog)}
  fit.append(stage);

  let i=-1,gen=0,paused=false,idle=0,visible=false,running=false;
  const inSet=(s,k)=>s&&s.indexOf(k)>=0;
  function camera(f,k){const z=f.zoom!=null?f.zoom:(f.cursor&&k>0&&W>=1300&&!paused?1.3:1);
    if(z===1||!f.cursor){cam.style.transform='none';return}
    const cl=(v,lo)=>Math.min(0,Math.max(lo,v));
    cam.style.transform=`translate(${cl(.5-f.cursor.x/W*z,1-z)*100}%,${cl(.5-f.cursor.y/H*z,1-z)*100}%) scale(${z})`}
  function placeCur(c){if(!c)return;cur.style.transform=`translate(${c.x/W*stage.clientWidth}px,${c.y/H*stage.clientHeight}px)`}
  function nextClick(k){for(let j=k;j<F.length;j++){if(F[j].click&&F[j].cursor)return j;}return -1}
  function show(k){const pv=i;i=k;imgs.forEach((im,j)=>{im.classList.toggle('on',j===k);im.classList.toggle('prev',j===pv&&pv!==k)});const f=F[k];
    lis.forEach((li,j)=>li.classList.toggle('on',j===f.step));
    if(f.cursor){cur.classList.add('show');placeCur(f.cursor)}else cur.classList.remove('show');
    camera(f,k);
    // 다음에 누를 곳: 지금 장면에서 실제로 누른 자리
    const c=f.click&&f.cursor&&k<F.length-1?f.cursor:null;
    nxt.classList.toggle('can',!!c);if(c)pos(nxt,c.x,c.y);
    if(cmp)cmp.classList.toggle('on',inSet(C.compare.frames,k));
    if(tog)tog.classList.toggle('can',inSet(C.toggle.frames,k)&&paused);
    if(lab){lab.classList.toggle('on',inSet(C.labeler.frames,k)&&paused);}
    if(sw){$$('button',sw).forEach(b=>b.classList.toggle('on',C.switch.frames[+b.dataset.j]===k));sw.classList.toggle('on',paused||inSet(C.switch.frames,k))}
    if(conv){if(k===C.convert.after&&pv!==k&&pv>=0)convert();hit.classList.toggle('can',inSet(C.convert.from,k));if(paused&&inSet(C.convert.from,k))nxt.classList.remove('can')}
  }
  const wait=ms=>{const g=gen;return new Promise((res,rej)=>setTimeout(()=>g===gen?res():rej(new Abort()),ms))};
  function ripple(){cur.classList.remove('click');void cur.offsetWidth;cur.classList.add('click')}
  function bars(step,ms){lis.forEach((li,j)=>{const b=$('.bar i',li);if(!b)return;b.style.transition='none';b.style.width=j<step?'100%':'0';if(j===step&&ms){void b.offsetWidth;b.style.transition=`width ${ms}ms linear`;b.style.width='100%'}})}
  function stepTime(s){return F.filter(f=>f.step===s).reduce((a,f)=>a+(f.hold||1400)+700,0)}
  function setCut(p){if(cmp){cmp.style.setProperty('--cut',p+'%')}}
  async function sweep(){if(!cmp)return;const g=gen;const t0=performance.now();await new Promise((res,rej)=>{const tick=n=>{if(g!==gen)return rej(new Abort());const p=Math.min(1,(n-t0)/2600);const e=p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;setCut(100-e*100+(p>.75?0:0));p<1?requestAnimationFrame(tick):res()};requestAnimationFrame(tick)});
    const t1=performance.now();await new Promise((res,rej)=>{const tick=n=>{if(g!==gen)return rej(new Abort());const p=Math.min(1,(n-t1)/900);setCut(p*50);p<1?requestAnimationFrame(tick):res()};requestAnimationFrame(tick)})}
  async function run(){if(running||reduce)return;running=true;const g=++gen;
    try{for(;;){let last=-1;for(let k=0;k<F.length;k++){const f=F[k];
          if(f.step!==last){last=f.step;bars(f.step,stepTime(f.step))}
          show(k);if(cmp&&k===C.compare.frames[0]){setCut(100);await wait(500);await sweep()}
          await wait(f.hold||1400);if(f.click&&f.cursor){ripple();await wait(260)}}
        await wait(1800)}}
    catch(e){if(!(e instanceof Abort))console.error(e)}
    if(g===gen)running=false}
  function stop(){gen++;running=false}
  function pause(){if(!paused){paused=true;stop();sec.classList.add('touched');stage.classList.add('live');if(hint){hintBox.classList.add('paused');hint.textContent='직접 해 보는 중 · 빛나는 곳을 누르거나 끌어 보세요'}bars(-1);show(Math.max(i,0))}
    clearTimeout(idle);idle=setTimeout(resume,15000)}
  function resume(){paused=false;sec.classList.remove('touched');stage.classList.remove('live');if(hint){hintBox.classList.remove('paused');hint.textContent=hintDef}if(lab)$('svg',lab).innerHTML='',$$('.rlab-t',lab).forEach(e=>e.remove());if(visible)run()}
  // 누른 뒤: 다음 누를 곳이 나올 때까지(입력·끌기 같은 중간 장면) 이어서 보여 준다
  async function playTo(k){const g=++gen;try{show(k);let j=k;while(j<F.length-1&&!(F[j].click&&F[j].cursor)){await wait(Math.min(F[j].hold||1200,1300));j++;show(j)}}catch(e){}}
  function go(k){pause();k=Math.max(0,Math.min(F.length-1,k));playTo(k)}
  nxt.addEventListener('click',e=>{e.stopPropagation();pause();ripple();setTimeout(()=>playTo(i+1),200)});
  stage.addEventListener('pointerdown',()=>pause(),true);
  stage.addEventListener('pointermove',()=>{if(paused){clearTimeout(idle);idle=setTimeout(resume,15000)}});
  lis.forEach((li,s)=>li.querySelector('button').addEventListener('click',()=>{const k=F.findIndex(f=>f.step===s);go(k<0?0:k)}));
  addEventListener('keydown',e=>{if(!sec.matches(':hover')||e.target.closest('input,[contenteditable]'))return;if(e.key==='ArrowRight'){go(i+1)}else if(e.key==='ArrowLeft'){go(i-1)}});
  // 비교 손잡이 끌기
  if(cmp){const mv=e=>{const r=cmp.getBoundingClientRect();setCut(Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)))};
    cmp.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();pause();cmp.setPointerCapture(e.pointerId);cmp.classList.add('drag');mv(e);
      const up=()=>{cmp.classList.remove('drag');cmp.removeEventListener('pointermove',mv);cmp.removeEventListener('pointerup',up)};cmp.addEventListener('pointermove',mv);cmp.addEventListener('pointerup',up)})}
  if(tog)tog.addEventListener('click',e=>{e.stopPropagation();pause();ripple();const [a,b]=C.toggle.frames;show(i===a?b:a)});
  if(hit)hit.addEventListener('click',e=>{e.stopPropagation();pause();ripple();show(C.convert.after)});
  if(sw)$$('button',sw).forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();pause();stop();show(C.switch.frames[+b.dataset.j])}));
  // 라벨 달기: 한 번 눌러 가리킬 곳, 한 번 더 눌러 글자 자리 → 글자 쓰고 Enter
  if(lab){const svg=$('svg',lab);let a=null,line=null;
    const pt=e=>{const r=lab.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*100,y:(e.clientY-r.top)/r.height*100}};
    lab.addEventListener('pointerdown',e=>{if(e.target.closest('.rlab-t'))return;e.stopPropagation();pause();const p=pt(e);
      if(!a){a=p;svg.insertAdjacentHTML('beforeend',`<circle cx="${p.x}%" cy="${p.y}%" r="2.5" fill="#111"/><line x1="${p.x}%" y1="${p.y}%" x2="${p.x}%" y2="${p.y}%" stroke="#111" stroke-width="1.6"/>`);line=svg.lastElementChild;lab.classList.add('drawing')}
      else{line.setAttribute('x2',p.x+'%');line.setAttribute('y2',p.y+'%');const t=el('div','rlab-t');t.contentEditable='true';t.spellcheck=false;t.style.left=p.x+'%';t.style.top=p.y+'%';if(p.x<a.x)t.classList.add('l');lab.append(t);t.focus();
        t.addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();t.blur()}ev.stopPropagation()});t.addEventListener('blur',()=>{t.contentEditable='false';if(!t.textContent.trim())t.textContent='라벨'});
        a=null;line=null;lab.classList.remove('drawing');lab.classList.add('used')}});
    lab.addEventListener('mousedown',e=>{if(!e.target.closest('.rlab-t'))e.preventDefault()});
    lab.addEventListener('pointermove',e=>{if(a&&line){const p=pt(e);line.setAttribute('x2',p.x+'%');line.setAttribute('y2',p.y+'%')}})}
  let ready=null;const prep=()=>ready||(ready=Promise.all(imgs.map(im=>{im.loading='eager';return im.decode().catch(()=>{})})));
  new IntersectionObserver(es=>{if(es[0].isIntersecting)prep()},{rootMargin:'900px 0px'}).observe(stage);
  new IntersectionObserver(es=>{visible=es[0].isIntersecting;if(visible){prep().then(()=>{if(visible&&!paused)run()})}else stop()},{threshold:.3}).observe(stage);
  addEventListener('resize',()=>{const f=F[i];if(f&&f.cursor)placeCur(f.cursor)});
  show(0);setCut(100);
}
const R=window.REAL||{};
$$('[data-real]').forEach(sec=>{const d=R[sec.dataset.real];if(d&&d.frames&&d.frames.length)player(sec,d)});
})();
