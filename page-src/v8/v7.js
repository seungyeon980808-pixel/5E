/* 5E 소개 시안 v6 — 장면 엔진. 장면은 화면에 보일 때 저절로 돌고, 사람이 손대면 멈춰서 따라온다(10초 뒤 다시 재생). */
(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
class Abort extends Error{}

/* ---------- 페이지 공통 ---------- */
$$('[data-badge]').forEach(el=>{if(el.dataset.note)return;const t=el.textContent.replace(/\s+/g,' ').trim();el.dataset.note=t.length>110?t.slice(0,110)+'…':t;});
const root=document.documentElement,sb=$$('.swatch button');
function setA(k){root.dataset.accent=k;sb.forEach(b=>b.setAttribute('aria-pressed',b.dataset.a===k));try{localStorage.setItem('accent4',k)}catch(e){}}
let saved='teal';try{saved=localStorage.getItem('accent4')||'teal'}catch(e){}
setA(saved);sb.forEach(b=>b.addEventListener('click',()=>setA(b.dataset.a)));
const tg=$('#toggleTags');
try{if(localStorage.getItem('notags')==='1'){document.body.classList.add('notags');tg.textContent='번호 보이기';}}catch(e){}
tg.addEventListener('click',()=>{const on=document.body.classList.toggle('notags');tg.textContent=on?'번호 보이기':'번호 숨기기';try{localStorage.setItem('notags',on?'1':'0')}catch(e){}});
$('#copyAddr').addEventListener('click',function(){const b=this;(navigator.clipboard?navigator.clipboard.writeText('https://www.5e.ai.kr/'):Promise.reject()).then(()=>{b.textContent='복사됨';setTimeout(()=>b.textContent='복사',1600)}).catch(()=>{})});
const rio=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');rio.unobserve(e.target)}}),{rootMargin:'0px 0px -6% 0px'});
$$('.rise').forEach(el=>rio.observe(el));

const navEl=$('.nav'),stEl=$('#studio');if(navEl&&stEl)new IntersectionObserver(es=>navEl.classList.toggle('light',es[0].isIntersecting),{rootMargin:'-70px 0px -92% 0px'}).observe(stEl);
const CUR='<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 2 L4 20 L9 15.4 L12.3 22.6 L15.2 21.3 L12 14.2 L19 14.2 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;

/* ---------- 장면 엔진 ---------- */
function scene(sec,def){
  if(!sec)return null;
  const win=$('.win',sec),fit=$('.fit',sec),stage=$('.stage',win),lis=$$('.steps li',sec),hint=$('.hint',sec),hintT=hint&&hint.querySelector('span'),hintDef=hintT&&hintT.textContent;
  const cur=document.createElement('div');cur.className='cursor';cur.innerHTML=CUR;win.append(cur);
  let gen=0,fast=false,visible=false,running=false,paused=false,idle=0;
  const ctx={win,stage,sec,scale:1,s:win,
    get fast(){return fast},
    alive(g){if(g!==gen)throw new Abort()},
    gen(){return gen},
    wait(ms){const g=gen;if(fast)return Promise.resolve().then(()=>{if(g!==gen)throw new Abort()});return new Promise((res,rej)=>setTimeout(()=>g===gen?res():rej(new Abort()),ms))},
    tween(ms,fn){const g=gen;if(fast){fn(1);return Promise.resolve()}return new Promise((res,rej)=>{const t0=performance.now();const tick=now=>{if(g!==gen)return rej(new Abort());const p=Math.min(1,(now-t0)/ms);fn(ease(p),p);p<1?requestAnimationFrame(tick):res()};requestAnimationFrame(tick)})},
    pos(el,fx=.5,fy=.5){const r=el.getBoundingClientRect(),w=win.getBoundingClientRect();return[(r.left-w.left+r.width*fx)/ctx.scale,(r.top-w.top+r.height*fy)/ctx.scale]},
    rect(el){const r=el.getBoundingClientRect(),w=stage.getBoundingClientRect(),k=ctx.scale;return{x:(r.left-w.left)/k,y:(r.top-w.top)/k,w:r.width/k,h:r.height/k}},
    async move(el,fx,fy){if(fast)return;cur.classList.add('show');const[x,y]=ctx.pos(el,fx,fy);cur.style.transform=`translate(${x}px,${y}px)`;await ctx.wait(820)},
    async click(el,fx,fy){if(fast)return;if(el)await ctx.move(el,fx,fy);cur.classList.remove('click');void cur.offsetWidth;cur.classList.add('click');el&&el.classList&&el.classList.add('press');await ctx.wait(170);el&&el.classList&&el.classList.remove('press')},
    hideCursor(){cur.classList.remove('show')},
    async type(el,text,ms=70,prop){prop=prop||('value' in el&&el.tagName==='INPUT'?'value':'textContent');if(fast){el[prop]=text;el.dispatchEvent(new Event('input'));return}el.classList.add('typing');for(let i=1;i<=text.length;i++){el[prop]=text.slice(0,i);el.dispatchEvent(new Event('input'));await ctx.wait(ms)}el.classList.remove('typing')},
    touch(){touch()}
  };
  function fitScale(){const k=fit.clientWidth/760;ctx.scale=k;win.style.transform=`scale(${k})`;fit.style.height=(win.offsetHeight*k)+'px'}
  addEventListener('resize',fitScale);fitScale();
  function setStep(i){lis.forEach((li,j)=>{li.classList.toggle('on',j===i);const b=li.querySelector('.bar i');if(!b)return;b.style.transition='none';b.style.width=j<i?'100%':'0';if(j===i&&!fast&&!paused){void b.offsetWidth;b.style.transition=`width ${(def.durs&&def.durs[i])||3000}ms linear`;b.style.width='100%'}})}
  function stop(){gen++;ctx.hideCursor();running=false}
  async function run(){
    if(running||reduce)return;running=true;const g=++gen;
    try{for(;;){def.reset(ctx);await ctx.wait(500);for(let i=0;i<def.steps.length;i++){setStep(i);await def.steps[i](ctx,g)}await ctx.wait(def.hold||2800);ctx.hideCursor()}}
    catch(e){if(!(e instanceof Abort))console.error(e)}
    if(g===gen)running=false;
  }
  function markPaused(on){paused=on;win.classList.toggle('touched',on);if(hint){hint.classList.toggle('paused',on);hintT.textContent=on?'직접 만지는 중 · 손을 떼면 잠시 뒤 다시 재생':hintDef}}
  function scheduleResume(){clearTimeout(idle);idle=setTimeout(()=>{markPaused(false);if(visible)run()},10000)}
  function touch(){if(!paused){stop();markPaused(true);lis.forEach(li=>{const b=li.querySelector('.bar i');if(b){b.style.transition='none'}})}scheduleResume()}
  async function jump(i){
    stop();markPaused(true);def.reset(ctx);fast=true;win.classList.add('nofx');
    try{for(let k=0;k<i;k++){setStep(k);await def.steps[k](ctx,gen)}}catch(e){}
    fast=false;void win.offsetWidth;win.classList.remove('nofx');
    const g=++gen;setStep(i);try{await def.steps[i](ctx,g)}catch(e){if(!(e instanceof Abort))console.error(e)}
    ctx.hideCursor();scheduleResume();
  }
  lis.forEach((li,i)=>li.querySelector('button').addEventListener('click',()=>jump(i)));
  ['pointerdown','keydown'].forEach(t=>stage.addEventListener(t,e=>{if(e.isTrusted)touch()},true));
  stage.addEventListener('pointermove',e=>{if(paused)scheduleResume()});
  new IntersectionObserver(es=>{visible=es[0].isIntersecting;if(visible){fitScale();if(!paused)run()}else{stop()}},{threshold:.3}).observe(win);
  def.reset(ctx);
  if(def.wire)def.wire(ctx);
  if(reduce&&def.steps){fast=true;(async()=>{for(const s of def.steps)await s(ctx,gen)})().catch(()=>{}).finally(()=>fast=false)}
  return ctx;
}

/* 끌기 도우미 */
function drag(el,{start,move,end}){
  el.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();el.setPointerCapture(e.pointerId);start&&start(e);
    const mv=ev=>move(ev),up=ev=>{el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);end&&end(ev)};
    el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up)});
}

/* ---------- 0 첫 화면: 노트북 열기(psy.ai.kr entrance.js와 같은 경첩 움직임) → 실제 시작 창 ---------- */
(function(){
  const st=$('#studio');if(!st)return;
  const win=$('#appwin');
  // 앞 사진은 그대로 두고 새 사진만 위에서 서서히 — 둘 다 반투명해져 뒤가 비치는 일이 없게
  const show=k=>{const fs=$$('.f',win),nx=fs.find(f=>f.dataset.f===k),cu=fs.find(f=>f.classList.contains('on'));if(!nx||nx===cu)return;
    fs.forEach(f=>{if(f!==nx&&f!==cu)f.classList.remove('on','prev')});if(cu){cu.classList.remove('on');cu.classList.add('prev')}nx.classList.remove('prev');nx.classList.add('on')};
  const anim=(el,kf,d,e='cubic-bezier(.4,0,.2,1)')=>el.animate(kf,{duration:d,easing:e,fill:'forwards'}).finished.catch(()=>{});
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  let opened=false,hovering=false;
  async function open(){
    if(opened)return;opened=true;
    if(reduce){show('ready');st.classList.add('app','ready');return}
    await wait(250);show('1');st.classList.add('app');await wait(1300);show('2');await wait(1700);show('3');await wait(1500);show('ready');st.classList.add('ready');
    await wait(1400);
    for(let r=0;r<2;r++)for(const k of ['image','exam','hwp']){if(hovering)return;show(k);await wait(1500);if(hovering)return;show('ready');await wait(350)}
  }
  new IntersectionObserver(es=>{if(es[0].isIntersecting)open()},{threshold:.3}).observe($('#nb'));
  $$('.hot',win).forEach(h=>{
    h.addEventListener('pointerenter',()=>{hovering=true;show(h.dataset.k)});
    h.addEventListener('pointerleave',()=>show('ready'));
    h.addEventListener('click',()=>{const t=document.getElementById(h.dataset.go);t&&t.scrollIntoView({behavior:'smooth',block:'start'})});
  });
})();

/* ---------- 1 교과서 그림 ---------- */
scene($('#f1'),(()=>{
  let w,board,lbl,segs,btn,toast;const cut=v=>board.style.setProperty('--cut',v+'%');
  const seg=k=>segs.forEach((s,i)=>s.classList.toggle('on',i===k));
  return{durs:[4200,2600,3600],hold:2600,
    reset(c){w=c.win;board=$('.board',w);lbl=$('.lbl',w);segs=$$('.seg span',w);btn=$('[data-act=confirm]',w);toast=$('.toast',w);
      w.dataset.s='0';cut(0);lbl.textContent='온도 센서';seg(0);toast.classList.remove('show');btn.classList.remove('pulse')},
    steps:[
      async c=>{w.dataset.s='0';await c.wait(700);seg(1);await c.tween(2200,t=>cut(t*100));await c.wait(300);await c.tween(900,t=>cut(100-t*48));await c.wait(900);await c.tween(700,t=>cut(52+t*48));seg(2)},
      async c=>{w.dataset.s='0';btn.classList.add('pulse');await c.click(btn);btn.classList.remove('pulse');w.dataset.s='1';cut(100);c.hideCursor();toast.classList.add('show');await c.wait(1900);toast.classList.remove('show')},
      async c=>{w.dataset.s='2';await c.wait(400);await c.click(lbl,.5,.5);lbl.textContent='';await c.wait(200);await c.type(lbl,'온도계',160,'textContent');c.hideCursor();await c.wait(1200)}
    ],
    wire(c){const b=$('.board',c.win);
      drag(b,{start:e=>{if(e.target.classList.contains('lbl')&&c.win.dataset.s==='2')return;c.touch();c.win.dataset.s='0';seg(1);mv(e)},move:e=>mv(e)});
      function mv(e){if(c.win.dataset.s!=='0')return;const r=b.getBoundingClientRect();cut(Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)))}
      $('.lbl',c.win).addEventListener('pointerdown',e=>{if(c.win.dataset.s==='2')e.stopPropagation()},true);
      $('[data-act=confirm]',c.win).addEventListener('click',()=>{c.touch();c.win.dataset.s='2';cut(100);const t=$('.toast',c.win);t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1800)});
      segs=$$('.seg span',c.win);segs.forEach((s,i)=>s.addEventListener('click',()=>{c.touch();c.win.dataset.s='0';seg(i);board.style.setProperty('--cut',[0,52,100][i]+'%')}));
    }
  };
})());

/* ---------- 2 기출 라벨 ---------- */
scene($('#f2'),(()=>{
  let w,Ls,cnt,on,off;
  const home=[];
  return{durs:[1800,2800,5200],hold:2400,
    reset(c){w=c.win;Ls=$$('.L',w);cnt=$('.cnt',w);on=$('.lon',w);off=$('.loff',w);
      if(!home.length)Ls.forEach(l=>home.push([l.style.left,l.style.top]));Ls.forEach((l,i)=>{l.classList.remove('on');l.style.left=home[i][0];l.style.top=home[i][1]});
      w.dataset.s='0';w.classList.remove('lbloff');on.classList.add('on');off.classList.remove('on');cnt.textContent='0'},
    steps:[
      async c=>{w.dataset.s='0';await c.wait(1500)},
      async c=>{w.dataset.s='1';await c.wait(500);for(let i=0;i<Ls.length;i++){Ls[i].classList.add('on');cnt.textContent=i+1;await c.wait(120)}await c.wait(900)},
      async c=>{w.dataset.s='2';Ls.forEach(l=>l.classList.add('on'));cnt.textContent=Ls.length;
        await c.click(off);off.classList.add('on');on.classList.remove('on');w.classList.add('lbloff');await c.wait(1300);
        await c.click(on);on.classList.add('on');off.classList.remove('on');w.classList.remove('lbloff');await c.wait(500);
        const l=Ls[11];await c.move(l);l.classList.add('drag');const x0=parseFloat(l.style.left),y0=parseFloat(l.style.top);
        await c.tween(900,t=>{l.style.left=(x0-6*t)+'%';l.style.top=(y0-9*t)+'%';const[x,y]=c.pos(l);$('.cursor',w).style.transform=`translate(${x}px,${y}px)`});
        l.classList.remove('drag');c.hideCursor();await c.wait(800)}
    ],
    wire(c){const fig=$('.fig',c.win);
      const ensure=()=>{if(c.win.dataset.s!=='2'){c.win.dataset.s='2';$$('.L',c.win).forEach(l=>l.classList.add('on'));$('.cnt',c.win).textContent=$$('.L',c.win).length}};
      $$('.L',c.win).forEach(l=>{let ox,oy;drag(l,{start:e=>{c.touch();ensure();l.classList.add('drag');const r=l.getBoundingClientRect();ox=e.clientX-(r.left+r.width/2);oy=e.clientY-(r.top+r.height/2)},
        move:e=>{const r=fig.getBoundingClientRect();l.style.left=((e.clientX-ox-r.left)/r.width*100)+'%';l.style.top=((e.clientY-oy-r.top)/r.height*100)+'%'},end:()=>l.classList.remove('drag')})});
      $('.lon',c.win).addEventListener('click',()=>{c.touch();ensure();c.win.classList.remove('lbloff');$('.lon',c.win).classList.add('on');$('.loff',c.win).classList.remove('on')});
      $('.loff',c.win).addEventListener('click',()=>{c.touch();ensure();c.win.classList.add('lbloff');$('.loff',c.win).classList.add('on');$('.lon',c.win).classList.remove('on')});
      fig.addEventListener('pointerdown',()=>ensure());
    }
  };
})());

/* ---------- 그래프(가열 곡선) 공용 ---------- */
function heat(){return{p0:[62,196],p1:[88,148],p2:[150,148],p3:[222,90],p4:[286,90]}}
function renderHeat(svg,P,o={}){
  $('.curve',svg).setAttribute('points',[P.p0,P.p1,P.p2,P.p3,P.p4].map(p=>p.join(',')).join(' '));
  const d=$('.dash',svg);if(d){d.setAttribute('y1',P.p3[1]);d.setAttribute('y2',P.p3[1]);d.setAttribute('x2',P.p3[0])}
  const t1=$('.t1',svg);if(t1)t1.setAttribute('y',P.p3[1]+5);
  const h1=$('.h1',svg),h2=$('.h2',svg);if(h1){h1.setAttribute('cx',P.p2[0]);h1.setAttribute('cy',P.p2[1])}if(h2){h2.setAttribute('cx',P.p3[0]);h2.setAttribute('cy',P.p3[1])}
  const la=$('.la',svg),lb=$('.lb',svg),lc=$('.lc',svg);
  if(la){la.setAttribute('y',P.p1[1]-10);lb.setAttribute('y',P.p2[1]-10);lc.setAttribute('x',(P.p2[0]+P.p3[0])/2-12);lc.setAttribute('y',(P.p2[1]+P.p3[1])/2-6)}
}
function svgPt(svg,e){const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.getScreenCTM().inverse())}

/* ---------- 3 그래프 복원 ---------- */
scene($('#f3'),(()=>{
  let w,svg,P,dots,unit,t1,abc,toast;
  const line=(x)=>P.p0[1]+(P.p3[1]-P.p0[1])*((x-P.p0[0])/(P.p3[0]-P.p0[0]));
  return{durs:[2200,1800,5600],hold:2600,
    reset(c){w=c.win;svg=$('svg.g',w);dots=$$('.pts circle',w);unit=$('.unit',w);t1=$('.t1',w);abc=$('.abc',w);toast=$('.toast',w);
      P=heat();renderHeat(svg,P);w.dataset.s='0';dots.forEach(d=>d.classList.remove('on'));unit.textContent='(K)';t1.textContent='T₁';t1.setAttribute('font-style','italic');abc.style.opacity=1;toast.classList.remove('show')},
    steps:[
      async c=>{w.dataset.s='0';await c.wait(400);for(const d of dots){d.classList.add('on');await c.wait(190)}await c.wait(400)},
      async c=>{w.dataset.s='1';await c.wait(1500)},
      async c=>{w.dataset.s='2';await c.wait(300);const h=$('.h1',svg);await c.move(h);const y1=P.p1[1],y2=P.p2[1],t1y=line(P.p1[0]),t2y=line(P.p2[0]);
        await c.tween(1100,t=>{P.p1[1]=y1+(t1y-y1)*t;P.p2[1]=y2+(t2y-y2)*t;abc.style.opacity=1-t;renderHeat(svg,P);const[x,y]=c.pos(h);$('.cursor',w).style.transform=`translate(${x}px,${y}px)`});
        await c.click(unit);unit.textContent='(';await c.type(unit,'(℃)',140,'textContent');
        await c.click(t1);t1.setAttribute('font-style','normal');t1.textContent='';await c.type(t1,'78',160,'textContent');c.hideCursor();toast.classList.add('show');await c.wait(1600);toast.classList.remove('show')}
    ],
    wire(c){const s=$('svg.g',c.win);
      const ensure=()=>{if(c.win.dataset.s!=='2'){c.win.dataset.s='2'}};
      drag($('.h1',s),{start:()=>{c.touch();ensure();$('.h1',s).classList.add('drag')},move:e=>{const y=Math.max(40,Math.min(214,svgPt(s,e).y));P.p1[1]=P.p2[1]=y;renderHeat(s,P)},end:()=>$('.h1',s).classList.remove('drag')});
      drag($('.h2',s),{start:()=>{c.touch();ensure();$('.h2',s).classList.add('drag')},move:e=>{const y=Math.max(30,Math.min(P.p2[1]-6,svgPt(s,e).y));P.p3[1]=P.p4[1]=y;renderHeat(s,P)},end:()=>$('.h2',s).classList.remove('drag')});
      $('.unit',s).addEventListener('click',()=>{c.touch();ensure();const u=$('.unit',s);u.textContent=u.textContent==='(K)'?'(℃)':'(K)'});
      $('.t1',s).addEventListener('click',()=>{c.touch();ensure();const u=$('.t1',s);const k=u.textContent==='T₁';u.textContent=k?'78':'T₁';u.setAttribute('font-style',k?'normal':'italic')});
      s.addEventListener('pointerdown',ensure);
    }
  };
})());

/* ---------- 4 문항 복원 ---------- */
scene($('#f4'),(()=>{
  let w,boxes,slots;
  const slotOf=k=>slots.find(s=>s.dataset.k===k);
  return{durs:[2400,5200,3800],hold:2600,
    reset(c){w=c.win;boxes=$$('.seg-box',w);slots=$$('.slot',w);boxes.forEach(b=>b.classList.remove('on','hot'));
      slots.forEach(s=>{s.classList.remove('fill','hot');const t=$('.tx',s);if(t.dataset.full!==undefined)t.textContent='';});$('.slot[data-k=fig] img',w).style.opacity=0;$$('.fly',w).forEach(f=>f.remove())},
    steps:[
      async c=>{await c.wait(300);for(const b of boxes){b.classList.add('on');await c.wait(380)}await c.wait(500)},
      async c=>{for(const b of boxes){const s=slotOf(b.dataset.k),a=c.rect(b),z=c.rect(s);
          if(!c.fast){const f=document.createElement('div');f.className='fly';f.style.setProperty('--c',getComputedStyle(b).getPropertyValue('--c'));Object.assign(f.style,{left:a.x+'px',top:a.y+'px',width:a.w+'px',height:a.h+'px'});c.stage.append(f);void f.offsetWidth;
            Object.assign(f.style,{left:z.x+'px',top:z.y+'px',width:z.w+'px',height:z.h+'px',opacity:.2});await c.wait(800);f.remove()}
          s.classList.add('fill');const t=$('.tx',s);if(t.dataset.full!==undefined)t.textContent=t.dataset.full;else $('img',s).style.opacity=1;await c.wait(180)}
        await c.wait(500)},
      async c=>{const s=slotOf('bogi'),t=$('.tx',s);await c.click(s,.3,.6);s.classList.add('hot');
        t.innerHTML='ㄱ. <mark class="hl">복사층은 B</mark>이다.  ㄴ. 적색 거성의 중심핵에서는 주로 p-p 반응이 일어난다.  ㄷ. ㉠ 단계의 별 내부에서는 철보다 무거운 원소가 생성된다.';await c.wait(700);
        const m=$('mark',t);m.textContent='';m.classList.remove('hl');m.classList.add('typing');await c.type(m,'대류층은 A',150,'textContent');m.classList.remove('typing');c.hideCursor();await c.wait(1300);s.classList.remove('hot')}
    ],
    wire(c){$$('.seg-box',c.win).forEach(b=>{const s=$$('.slot',c.win).find(x=>x.dataset.k===b.dataset.k);
      b.addEventListener('pointerenter',()=>{c.touch();b.classList.add('on','hot');s.classList.add('hot','fill');const t=$('.tx',s);if(t.dataset.full!==undefined&&!t.textContent)t.textContent=t.dataset.full;const im=$('img',s);if(im)im.style.opacity=1});
      b.addEventListener('pointerleave',()=>{b.classList.remove('hot');s.classList.remove('hot')})})}
  };
})());

/* ---------- 5 라이브러리와 조판 ---------- */
scene($('#f5'),(()=>{
  const DATA=[['별의 내부 구조와 진화','2022 6월 모평 · 지구과학Ⅰ 7번','k','주계열성 대류층 복사층'],['용해도 곡선과 석출량','2023 수능 · 화학Ⅰ 12번','k',''],['H-R도와 주계열성','2024 3월 학평 · 지구과학Ⅰ 9번','h',''],['등가속도 운동','2023 9월 모평 · 물리학Ⅰ 5번','k',''],['주계열성의 에너지원','2021 수능 · 지구과학Ⅰ 14번','k',''],['세포 분열과 DNA 상대량','2022 10월 학평 · 생명과학Ⅰ 8번','h',''],['중화 반응과 이온 수','2024 7월 학평 · 화학Ⅰ 16번','h',''],['별의 질량과 수명','2025 6월 모평 · 지구과학Ⅰ 11번','k','주계열성 수명']];
  let w,inp,rows,cnt,c1,c2,qn,toast,n=0;
  const esc=s=>s.replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
  function clean(q){return q.replace(/[ㄱ-ㆎ]+$/,'').trim()}
  function filter(){const q=clean(inp.value);let k=0,h=0;
    rows.forEach((r,i)=>{const d=DATA[i],hit=!q||(d[0]+' '+d[3]).includes(q);r.classList.toggle('gone',!hit);if(hit){d[2]==='k'?k++:h++}
      $('.t',r).innerHTML=q&&d[0].includes(q)?esc(d[0]).replace(esc(q),'<mark class="hl">'+esc(q)+'</mark>'):esc(d[0])});
    cnt.textContent=q?`평가원 ${k} · 학평 ${h}`:'8,412문항'}
  function add(i,anim=true){const r=rows[i];if(r.classList.contains('done'))return;r.classList.add('done');$('.add',r).textContent='✓';n++;
    const q=document.createElement('div');q.className='qb';if(!anim)q.style.animation='none';
    q.innerHTML=`<span class="no">${n}.</span>${esc(DATA[i][0])}<div class="ln"></div><div class="ln" style="width:${70+((i*13)%25)}%"></div>${i%2?'':'<div class="fg"></div>'}<div class="ch"><i></i><i></i><i></i><i></i><i></i></div>`;
    (c1.children.length<2?c1:c2).append(q);qn.textContent=n+'문항';$('.tn',w).textContent=n}
  return{durs:[3000,3600,2600],hold:2400,
    reset(c){w=c.win;inp=$('input',w);cnt=$('.count',w);c1=$('.c1',w);c2=$('.c2',w);qn=$('.qn',w);toast=$('.toast',w);
      const box=$('.rows',w);if(!box.children.length){box.innerHTML=DATA.map(d=>`<div class="row" draggable="false"><span class="b ${d[2]==='h'?'h':''}"></span><span class="t">${esc(d[0])}</span><button class="add" type="button">＋</button><span class="src">${esc(d[1])}</span></div>`).join('')}
      rows=$$('.row',w);rows.forEach(r=>{r.classList.remove('done');$('.add',r).textContent='＋'});inp.value='';n=0;c1.innerHTML='';c2.innerHTML='';qn.textContent='0문항';toast.classList.remove('show');filter()},
    steps:[
      async c=>{await c.click(inp,.2,.5);for(const s of ['ㅈ','주','주ㄱ','주계','주계ㅇ','주계여','주계열','주계열ㅅ','주계열성']){inp.value=s;filter();await c.wait(c.fast?0:130)}await c.wait(500)},
      async c=>{const vis=rows.map((r,i)=>i).filter(i=>!rows[i].classList.contains('gone')).slice(0,3);for(const i of vis){await c.click($('.add',rows[i]));add(i,!c.fast);await c.wait(450)}},
      async c=>{c.hideCursor();toast.classList.add('show');await c.wait(2000);toast.classList.remove('show')}
    ],
    wire(c){const box=$('.rows',c.win),sheet=$('.minib4',c.win);
      $('input',c.win).addEventListener('input',e=>{if(e.isTrusted){c.touch()}filter()});
      box.addEventListener('click',e=>{const b=e.target.closest('.add');if(!b)return;c.touch();add(rows.indexOf(b.closest('.row')))});
      box.addEventListener('pointerdown',e=>{const r=e.target.closest('.row');if(!r||e.target.closest('.add'))return;e.preventDefault();c.touch();const i=rows.indexOf(r);
        const g=document.createElement('div');g.className='ghost';g.textContent=DATA[i][0];document.body.append(g);
        const mv=ev=>{g.style.left=ev.clientX+12+'px';g.style.top=ev.clientY+8+'px';const s=sheet.getBoundingClientRect();sheet.classList.toggle('over',ev.clientX>s.left&&ev.clientX<s.right&&ev.clientY>s.top&&ev.clientY<s.bottom)};
        const up=ev=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up);g.remove();if(sheet.classList.contains('over'))add(i);sheet.classList.remove('over')};
        mv(e);addEventListener('pointermove',mv);addEventListener('pointerup',up)});
    }
  };
})());

/* ---------- 6 AI 대화 ---------- */
scene($('#f6'),(()=>{
  const Q=['주계열성 진화로 3점 문항 만들어 줘','그래프가 들어간 문항으로 바꿔 줘','〈보기〉는 세 개로 해 줘'];
  const A=['기출 3문항을 참고해 <b>카드를 채웠어요.</b> 자료는 별의 진화 도식으로 넣었습니다.','자료를 <b>H-R도 그래프</b>로 바꿨어요. 축 이름은 그대로 고칠 수 있습니다.','〈보기〉를 <b>세 개</b>로 맞췄어요. 정답은 ③으로 두었습니다.'];
  const STEM='그림 (가)는 질량이 태양과 같은 별의 내부 구조를, (나)는 이 별의 진화 과정을 나타낸 것이다.';
  const BOGI='ㄱ. A는 대류층이다.  ㄴ. ㉠ 단계에서 중심핵은 수축한다.  ㄷ. 주계열 단계에서 p-p 반응이 우세하다.';
  const CH='① ㄱ  ② ㄴ  ③ ㄱ, ㄷ  ④ ㄴ, ㄷ  ⑤ ㄱ, ㄴ, ㄷ';
  let w,msgs,sugg,cin,slots;
  function bub(cls,html){const b=document.createElement('div');b.className='bub '+cls;b.innerHTML=html;msgs.append(b);while(msgs.children.length>4)msgs.firstChild.remove();return b}
  async function play(c,i,phase){
    if(phase===0){sugg.forEach((s,j)=>s.classList.toggle('on',j===i));await c.click(sugg[i]);await c.type(cin,Q[i],45,'textContent');await c.wait(300);bub('me',Q[i]);cin.textContent='';c.hideCursor()}
    if(phase===1){const b=bub('ai','<span class="dots3"><i></i><i></i><i></i></span>');await c.wait(1500);b.innerHTML=A[i]}
    if(phase===2){const S=k=>slots.find(s=>s.dataset.k===k);
      const st=S('stem');st.classList.add('hot');await c.type($('.tx',st),STEM,c.fast?0:16,'textContent');st.classList.remove('hot');
      const f=S('fig');f.classList.add('hot');$('.tx',f).innerHTML=i===1?'<img src="img/kice-graph.png" alt="">':'<img src="img/c-q5-fig.jpg" alt="">';await c.wait(500);f.classList.remove('hot');
      const bo=S('bogi');bo.classList.add('hot');await c.type($('.tx',bo),BOGI,c.fast?0:14,'textContent');bo.classList.remove('hot');
      const ch=S('ch');ch.classList.add('hot');await c.type($('.tx',ch),CH,c.fast?0:14,'textContent');ch.classList.remove('hot')}
  }
  return{durs:[2800,1800,5600],hold:3000,
    reset(c){w=c.win;msgs=$('.msgs',w);sugg=$$('.sugg button',w);cin=$('.cin',w);slots=$$('.slot',w);msgs.innerHTML='';cin.textContent='';sugg.forEach(s=>s.classList.remove('on'));
      slots.forEach(s=>{$('.tx',s).textContent='';s.classList.remove('hot')});$('.slot[data-k=fig] .tx',w).innerHTML='<div class="ph">자료 자리</div>'},
    steps:[c=>play(c,0,0),c=>play(c,0,1),c=>play(c,0,2)],
    wire(c){$$('.sugg button',c.win).forEach((b,i)=>b.addEventListener('click',async e=>{if(!e.isTrusted)return;c.touch();const g=c.gen();
      try{slots.forEach(s=>{if(s.dataset.k!=='fig')$('.tx',s).textContent=''});sugg.forEach((s,j)=>s.classList.toggle('on',j===i));bub('me',Q[i]);await play(c,i,1);await play(c,i,2)}catch(err){}}))}
  };
})());

/* ---------- 7 카드 안 편집 ---------- */
const GSVG='<svg viewBox="0 0 320 250"><defs><marker id="ah7" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#111"/></marker></defs><line x1="62" y1="222" x2="300" y2="222" stroke="#111" stroke-width="1.6" marker-end="url(#ah7)"/><line x1="62" y1="222" x2="62" y2="22" stroke="#111" stroke-width="1.6" marker-end="url(#ah7)"/><text x="18" y="40" font-size="18" fill="#111">온도</text><text class="unit" x="20" y="64" font-size="18" fill="#111">(K)</text><line class="dash" x1="62" y1="90" x2="222" y2="90" stroke="#111" stroke-dasharray="4 3"/><text class="t1" x="34" y="95" font-size="17" fill="#111">78</text><polyline class="curve" points="" fill="none" stroke="#111" stroke-width="2.6" stroke-linejoin="round"/><g class="abc" font-size="16" fill="#111"><text class="la" x="92" y="168">A</text><text class="lb" x="124" y="168">B</text><text class="lc" x="190" y="128">C</text></g><text x="54" y="244" font-size="16" fill="#111">0</text><text x="262" y="246" font-size="16" fill="#111">시간</text><circle class="pt h1" r="7"/><circle class="pt h2" r="7"/></svg>';
scene($('#f7'),(()=>{
  let w,slot,mir,inl,inp,toast,P,PM,unitV;
  function rend(){renderHeat($('svg',slot),P);$('.unit',slot.querySelector('svg')).textContent=unitV}
  function place(c){const r=c.rect(slot);inl.style.left=(r.x+8)+'px';inl.style.top=Math.min(r.y+r.h+6,400)+'px'}
  function commit(){PM=JSON.parse(JSON.stringify(P));renderHeat($('svg',mir),PM);$('.unit',mir).textContent=unitV}
  return{durs:[1800,4600,2400],hold:2600,
    reset(c){w=c.win;slot=$('.gslot',w);mir=$('.gmirror',w);inl=$('.inl',w);inp=$('input',inl);toast=$('.toast',w);
      if(!slot.innerHTML){slot.innerHTML=GSVG;mir.innerHTML=GSVG.replace('ah7','ah7m').replace('url(#ah7)','url(#ah7m)').replace('url(#ah7)','url(#ah7m)')}
      P=heat();unitV='(K)';rend();commit();slot.classList.remove('editing');inl.classList.remove('show');inp.value='(K)';toast.classList.remove('show')},
    steps:[
      async c=>{await c.click(slot,.5,.5);slot.classList.add('editing');place(c);inl.classList.add('show');await c.wait(600)},
      async c=>{slot.classList.add('editing');place(c);inl.classList.add('show');const h=$('.h1',slot);await c.move(h);const y0=P.p1[1];
        await c.tween(1000,t=>{P.p1[1]=P.p2[1]=y0+(176-y0)*t;rend();const[x,y]=c.pos(h);$('.cursor',w).style.transform=`translate(${x}px,${y}px)`});
        await c.click(inp,.3,.5);inp.focus({preventScroll:true});inp.value='';await c.type(inp,'(℃)',150,'value');inp.blur()},
      async c=>{await c.click($('[data-act=ok]',w));slot.classList.remove('editing');inl.classList.remove('show');commit();c.hideCursor();toast.classList.add('show');await c.wait(1600);toast.classList.remove('show')}
    ],
    wire(c){const s=()=>$('svg',slot);
      slot.addEventListener('click',()=>{c.touch();slot.classList.add('editing');place(c);inl.classList.add('show')});
      setTimeout(()=>{['h1','h2'].forEach(k=>{const el=$('.'+k,slot);drag(el,{start:()=>{c.touch();slot.classList.add('editing');place(c);inl.classList.add('show');el.classList.add('drag')},
        move:e=>{const y=svgPt(s(),e).y;if(k==='h1'){P.p1[1]=P.p2[1]=Math.max(100,Math.min(214,y))}else{P.p3[1]=P.p4[1]=Math.max(30,Math.min(P.p2[1]-6,y))}rend()},end:()=>el.classList.remove('drag')})})},0);
      inp.addEventListener('input',e=>{if(e.isTrusted)c.touch();unitV=inp.value;rend()});
      $('[data-act=ok]',c.win).addEventListener('click',e=>{if(!e.isTrusted)return;c.touch();slot.classList.remove('editing');inl.classList.remove('show');commit();toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1500)});
    }
  };
})());

/* ---------- 8 시험지 위에서 ---------- */
scene($('#f8'),(()=>{
  let w,fw,im,ai,scan,menu,ledit,inp,lbl,reflow,toast;
  function showMenu(mode,c){menu.innerHTML=mode==='conv'?'<button class="ai" data-act="conv">AI 변환</button><button data-act="none">그래프 복원</button><button data-act="none">그림 편집</button>':'<button class="ai" data-act="ok">확정</button><button data-act="again">다시</button><button data-act="cmp">원본과 비교</button>';
    const s=c.rect(fw);menu.style.left=(s.x+s.w/2-110)+'px';menu.style.top=(Math.min(s.y+s.h+8,380))+'px';menu.classList.add('show')}
  let cv=0;const clip=v=>{cv=v;ai.style.clipPath=`inset(0 ${100-v}% 0 0)`;scan.style.left=v+'%'};
  return{durs:[4600,2600,4400],hold:2600,
    reset(c){w=c.win;fw=$('.figwrap',w);im=$('.im',fw);ai=$('img.ai',fw);scan=$('.scan',fw);menu=$('.menu',w);ledit=$('.ledit',w);inp=$('input',ledit);lbl=$('.lbl',fw);reflow=$('.reflow',w);toast=$('.toast',w);
      w.dataset.s='0';clip(0);scan.style.opacity=0;im.style.aspectRatio='468/297';lbl.textContent='온도 센서';inp.value='온도 센서';menu.classList.remove('show');ledit.classList.remove('show');reflow.classList.remove('show');toast.classList.remove('show');fw.classList.remove('sel')},
    steps:[
      async c=>{await c.click(fw,.5,.5);fw.classList.add('sel');showMenu('conv',c);await c.wait(500);await c.click($('[data-act=conv]',menu));menu.classList.remove('show');c.hideCursor();
        scan.style.opacity=1;await c.tween(2000,t=>clip(t*100));scan.style.opacity=0;await c.wait(300)},
      async c=>{clip(100);showMenu('ok',c);await c.wait(400);await c.click($('[data-act=ok]',menu));menu.classList.remove('show');fw.classList.remove('sel');c.hideCursor();
        reflow.classList.add('show');im.style.aspectRatio='1634/1136';await c.wait(1100);reflow.classList.remove('show');toast.classList.add('show');await c.wait(1100);toast.classList.remove('show')},
      async c=>{w.dataset.s='2';im.style.aspectRatio='1634/1136';clip(100);ledit.classList.add('show');await c.wait(400);await c.click(inp,.4,.5);inp.value='';await c.type(inp,'온도계',170,'value');
        await c.click($('[data-act=apply]',ledit));ledit.classList.remove('show');w.dataset.s='0';c.hideCursor();toast.classList.add('show');await c.wait(1500);toast.classList.remove('show')}
    ],
    wire(c){
      fw.addEventListener('click',e=>{if(!e.isTrusted)return;c.touch();fw.classList.add('sel');showMenu(cv>=99?'ok':'conv',c)});
      menu.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b||!e.isTrusted)return;c.touch();const a=b.dataset.act;menu.classList.remove('show');
        if(a==='conv'){scan.style.opacity=1;const t0=performance.now();const tick=n=>{const p=Math.min(1,(n-t0)/1600);clip(p*100);p<1?requestAnimationFrame(tick):(scan.style.opacity=0,showMenu('ok',c))};requestAnimationFrame(tick)}
        else if(a==='ok'){fw.classList.remove('sel');reflow.classList.add('show');im.style.aspectRatio='1634/1136';setTimeout(()=>{reflow.classList.remove('show');w.dataset.s='2';ledit.classList.add('show')},1000)}
        else if(a==='again'){clip(0);showMenu('conv',c)}
        else if(a==='cmp'){clip(50);showMenu('ok',c)}});
      inp.addEventListener('input',()=>{lbl.textContent=inp.value});
      inp.addEventListener('focus',()=>{c.touch();w.dataset.s='2'});
      $('[data-act=apply]',ledit).addEventListener('click',e=>{if(!e.isTrusted)return;c.touch();ledit.classList.remove('show');w.dataset.s='0';toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1500)});
    }
  };
})());

/* ---------- 9 클립보드 ---------- */
scene($('#f9'),(()=>{
  let w,items,drawer,list,dc,pastes,key,clip=[],hov=null;
  const NAMES=['그래프 · 가열 곡선','문항 5 · 자료','기출 그림'];
  function cap(t,c){key.textContent=t;key.classList.add('show');setTimeout(()=>key.classList.remove('show'),900)}
  function copy(i,c,anim=true){if(clip.includes(i))return;clip.unshift(i);const it=items[i];it.classList.add('picked');setTimeout(()=>it.classList.remove('picked'),700);
    if(anim&&c){const a=c.rect($('img',it)),z=c.rect(drawer);const f=document.createElement('img');f.src=$('img',it).src;Object.assign(f.style,{position:'absolute',left:a.x+'px',top:a.y+'px',width:a.w+'px',height:a.h+'px',objectFit:'contain',background:'#fff',borderRadius:'3px',zIndex:20,transition:'all .7s cubic-bezier(.65,0,.35,1)',boxShadow:'0 8px 24px rgba(0,0,0,.4)'});c.stage.append(f);void f.offsetWidth;Object.assign(f.style,{left:(z.x+z.w-40)+'px',top:(z.y+4)+'px',width:'34px',height:'24px',opacity:.4});setTimeout(()=>f.remove(),720)}
    renderList()}
  function renderList(){list.innerHTML=clip.length?clip.map(i=>`<div class="di" data-i="${i}"><img src="${$('img',items[i]).src}" alt=""><span>${NAMES[i]}</span></div>`).join(''):'<div class="empty">복사한 것이 여기 쌓입니다</div>';dc.textContent=clip.length?clip.length+'개 · ⇧⌘V':'⇧⌘V'}
  function paste(i){const d=document.createElement('div');d.className='pasted';d.innerHTML=`<img src="${$('img',items[i]).src}" alt="">`;pastes.append(d);while(pastes.children.length>2)pastes.firstChild.remove();drawer.classList.add('closed')}
  return{durs:[3600,1600,3000],hold:2800,
    reset(c){w=c.win;items=$$('.itm',w);drawer=$('.drawer',w);list=$('.list',drawer);dc=$('.dc',drawer);pastes=$('.pastes',w);key=$('.keycap',w);clip=[];renderList();pastes.innerHTML='';drawer.classList.add('closed');items.forEach(i=>i.classList.remove('hov','picked'))},
    steps:[
      async c=>{for(const i of [0,1]){await c.move(items[i],.5,.4);items[i].classList.add('hov');await c.wait(300);cap('⌘C');copy(i,c,!c.fast);await c.wait(900);items[i].classList.remove('hov')}},
      async c=>{c.hideCursor();cap('⇧⌘V');drawer.classList.remove('closed');await c.wait(1200)},
      async c=>{drawer.classList.remove('closed');const di=$('.di[data-i="0"]',drawer);if(di){await c.move(di);di.classList.add('hov');await c.click(di)}paste(0);c.hideCursor();await c.wait(1600)}
    ],
    wire(c){items.forEach((it,i)=>{it.addEventListener('click',e=>{if(!e.isTrusted)return;c.touch();cap('⌘C');copy(i,c)});it.addEventListener('pointerenter',()=>hov=i);it.addEventListener('pointerleave',()=>hov=null)});
      list.addEventListener('click',e=>{const d=e.target.closest('.di');if(!d)return;c.touch();paste(+d.dataset.i)});
      $('.dh',drawer).addEventListener('click',()=>{c.touch();drawer.classList.toggle('closed')});
      let inside=false;c.stage.addEventListener('pointerenter',()=>inside=true);c.stage.addEventListener('pointerleave',()=>inside=false);
      addEventListener('keydown',e=>{if(!inside||!(e.metaKey||e.ctrlKey))return;const k=e.key.toLowerCase();
        if(k==='c'&&hov!==null){e.preventDefault();c.touch();cap('⌘C');copy(hov,c)}else if(k==='v'&&e.shiftKey){e.preventDefault();c.touch();cap('⇧⌘V');drawer.classList.toggle('closed')}else if(k==='v'&&clip.length){e.preventDefault();c.touch();cap('⌘V');paste(clip[0])}});
    }
  };
})());

/* ---------- 10 어떤 양식이든 ---------- */
scene($('#f10'),(()=>{
  const QS=[{fg:1,l:3},{fg:0,l:2,bx:1},{fg:1,l:2},{fg:0,l:4},{fg:0,l:2,bx:1}];
  const FORMS=[
    {name:'수능형 B4 2단',W:300,H:400,pad:16,cols:2,gap:14,hdr:'<div style="display:flex;justify-content:space-between;align-items:end;border-bottom:2px solid #222;padding-bottom:5px;font-size:8px;font-weight:600"><span>2026학년도 2학기 중간고사</span><b style="font-size:12px">통합과학</b><span>1학년</span></div>',box:0},
    {name:'○○고 원안지 A4 1단',W:286,H:404,pad:18,cols:1,gap:0,hdr:'<div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;border:1px solid #444;padding:5px 7px;font-size:8px"><div><b style="font-size:10.5px">2026 2학기 중간고사 · 통합과학</b><div style="color:#555;margin-top:2px">1학년 ( )반 ( )번 이름 (        )</div></div><div style="display:grid;grid-template-columns:repeat(3,22px);border:1px solid #444;text-align:center;font-size:6.5px"><span style="border-right:1px solid #444">담당</span><span style="border-right:1px solid #444">부장</span><span>교감</span><span style="height:14px;border-top:1px solid #444;border-right:1px solid #444"></span><span style="border-top:1px solid #444;border-right:1px solid #444"></span><span style="border-top:1px solid #444"></span></div></div>',box:0},
    {name:'학습지 A4 상자형',W:300,H:400,pad:16,cols:2,gap:10,hdr:'<div style="display:flex;align-items:center;gap:8px;font-size:8px"><b style="font-size:12px;padding:2px 8px;background:#222;color:#f7f6f2;border-radius:3px">별의 진화</b><span style="color:#666">2학년 지구과학Ⅰ · 학습지 3</span></div>',box:1}];
  let w,pg,hdr,fq,vl,fms,qs;
  function layout(i,c){const F=FORMS[i];fms.forEach((b,j)=>b.classList.toggle('on',j===i));$('.fmn',w).textContent=F.name;
    pg.style.width=F.W+'px';pg.style.height=F.H+'px';pg.style.padding=F.pad+'px';hdr.innerHTML=F.hdr;
    const inner=F.W-2*F.pad,cw=(inner-(F.cols-1)*F.gap)/F.cols;vl.style.opacity=F.cols>1&&!F.box?1:0;vl.style.left=(F.W/2)+'px';
    let col=0,y=0;const top=10,maxH=F.H-2*F.pad-hdr.offsetHeight-top-6;
    qs.forEach((q,k)=>{q.style.width=cw+'px';q.querySelector('.inner').className='inner'+(F.box?' box':'');const h=q.offsetHeight;
      if(y+h>maxH&&col<F.cols-1){col++;y=0}q.style.transform=`translate(${col*(cw+F.gap)}px,${y}px)`;q.style.opacity=(y+h>maxH+4)?0:1;y+=h+(F.box?8:10)})}
  return{durs:[2600,2600,2600],hold:600,
    reset(c){w=c.win;pg=$('.pg',w);hdr=$('.hdr',pg);fq=$('.flowq',pg);vl=$('.vline',pg);fms=$$('.fm',w);
      if(!fq.children.length){fq.innerHTML=QS.map((q,k)=>`<div class="q10"><div class="inner"><span class="no">${k+1}.</span>${'<div class="ln"></div>'.repeat(q.l)}${q.fg?'<div class="fg"></div>':''}${q.bx?'<div style="border:1px solid #9b988f;padding:2px 5px;margin:4px 0"><div class="ln" style="width:80%"></div><div class="ln" style="width:60%"></div></div>':''}<div class="ch"><i></i><i></i><i></i><i></i><i></i></div></div></div>`).join('')}
      qs=$$('.q10',fq);layout(0,c)},
    steps:[async c=>{layout(0,c);await c.wait(2400)},async c=>{layout(1,c);await c.wait(2400)},async c=>{layout(2,c);await c.wait(2400)}],
    wire(c){$$('.fm',c.win).forEach((b,i)=>b.addEventListener('click',e=>{if(!e.isTrusted)return;c.touch();layout(i,c);$$('.steps li',c.sec).forEach((li,j)=>li.classList.toggle('on',j===i))}))}
  };
})());

})();
