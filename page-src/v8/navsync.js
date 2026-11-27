/* 11-20 밤: 메뉴 칸 하나 = 페이지 구역 하나. 진행선은 지금 읽는 구역의 칸 안에서 그 구역을 읽은 만큼 차오름. */
(function(){
  'use strict';
  const links=document.querySelector('.nav__links');if(!links)return;
  const T={'#g-image':'g-image','#g-exam':'g-exam','#g-hwp':'g-hwp','#g-clipboard':'g-clipboard','#arch':'arch','#history':'hx','#download':'download','#faq':'faq'};
  const line=document.createElement('i');line.className='navnow';links.appendChild(line);
  let items=[];
  function collect(){items=[...links.querySelectorAll('a')].map(a=>{const h=a.getAttribute('href');const id=T[h]||h.slice(1);const el=document.getElementById(id)||(h==='#history'&&document.getElementById('history'));return el?{a,el}:null}).filter(Boolean)}
  function upd(){if(!items.length)collect();if(!items.length)return;
    const ref=scrollY+innerHeight*.35,lr=links.getBoundingClientRect();
    const tops=items.map(o=>o.el.getBoundingClientRect().top+scrollY);
    const foot=document.querySelector('footer');const end=foot?foot.getBoundingClientRect().top+scrollY:document.documentElement.scrollHeight;
    let k=-1,p=0;for(let i=0;i<items.length;i++){if(ref>=tops[i]){k=i;const e=i+1<tops.length?tops[i+1]:end;p=Math.max(0,Math.min(1,(ref-tops[i])/Math.max(1,e-tops[i])))}}
    items.forEach((o,i)=>o.a.classList.toggle('now',i===k));
    if(k<0){line.style.width='0px';return}
    const r=items[k].a.getBoundingClientRect(),x0=items[0].a.getBoundingClientRect().left-lr.left;
    line.style.left=x0+'px';line.style.width=Math.max(0,(r.left-lr.left)+r.width*p-x0)+'px'}
  let rq=0;const qu=()=>{if(!rq)rq=requestAnimationFrame(()=>{rq=0;upd()})};
  addEventListener('scroll',qu,{passive:true});addEventListener('resize',()=>{items=[];qu()});
  addEventListener('load',()=>{items=[];setTimeout(qu,300)});setTimeout(()=>{items=[];qu()},1200);
})();
/* 11-20 밤: 메뉴에 마우스를 올리면 아래에 한 줄 — 천천히 떠오르고, 칸 사이를 옮겨 가면 글만 바뀜 */
(function(){
  'use strict';
  const links=document.querySelector('.nav__links');if(!links||!matchMedia('(hover:hover)').matches)return;
  const CAP={'#g-image':'어떤 그림도, 평가원 스타일로','#g-exam':'문항부터 시험지까지','#g-hwp':'한글 없이, 인쇄 직전까지','#g-clipboard':'담고, 꺼내고. 어디서든','#arch':'한눈에 보는 5E','#history':'따로 시작해, 하나가 되기까지','#download':'Mac · Windows · 웹','#faq':'궁금한 건 여기서'};
  const tip=document.createElement('div');tip.className='navcap';tip.setAttribute('aria-hidden','true');tip.innerHTML='<span></span>';document.body.appendChild(tip);
  const sp=tip.firstChild;let hideT=0,shown=false;
  const place=a=>{const r=a.getBoundingClientRect(),nav=document.querySelector('.nav__inner').getBoundingClientRect();tip.style.left=(r.left+r.width/2)+'px';tip.style.top=(nav.bottom+10)+'px'};
  links.querySelectorAll('a').forEach(a=>{const t=CAP[a.getAttribute('href')];if(!t)return;
    a.addEventListener('mouseenter',()=>{clearTimeout(hideT);place(a);if(shown){sp.classList.remove('in');void sp.offsetWidth}sp.textContent=t;sp.classList.add('in');tip.classList.add('on');shown=true});
    a.addEventListener('mouseleave',()=>{hideT=setTimeout(()=>{tip.classList.remove('on');sp.classList.remove('in');shown=false},120)})});
  addEventListener('scroll',()=>{if(shown){tip.classList.remove('on');shown=false}},{passive:true});
})();
