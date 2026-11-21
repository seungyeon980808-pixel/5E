/* 11-19: ① 시연 중인 자리 드러내기 — 커서 둘레만 밝게, 나머지는 살짝 어둡게(커서를 따라감)
   ② 창 위에 「지금 보는 곳」 칩  ③ 첫 화면 커서  ④ 첫 화면 문구 시안 A/B/C 고르기 */
(function(){
  'use strict';
  const WHERE={S1:['5E_image','AI 이미지 작업대'],S2:['5E_image','AI 이미지 작업대'],S3:['5E_image','그래프 복원'],
    S4:['5E_exam','문항 카드 · 미리보기'],S5:['5E_exam','시험지 만들기'],S6:['5E_exam','양식에 조판'],
    S8:['5E_hwp','시험지 쪽에서 바로 고치기'],S9:['5E 클립보드','image → exam → hwp']};
  // 창 위 「지금 보는 곳」 칩만(커서 둘레 효과·쉬지 않는 반복은 뺌). 장면 창이 늦게 만들어지므로 다 붙을 때까지만 살핌
  let left=8;const scan=()=>{left=0;document.querySelectorAll('section[id^="f-S"]').forEach(sec=>{
    const w=WHERE[sec.id.slice(2)],win=sec.querySelector('.s7win,.s34-win,.wwin');if(!w)return;if(!win){left++;return}
    const host=win.parentNode;if(host.querySelector(':scope>.where'))return;
    const c=document.createElement('div');c.className='where';c.innerHTML=`<i></i><b>${w[0]}</b><span>${w[1]}</span>`;host.insertBefore(c,win)})};
  scan();const sid=setInterval(()=>{scan();if(!left)clearInterval(sid)},1000);

  // ③ 첫 화면 커서: 시작 창이 뜨면 나타나 카드 위를 따라감
  const st=document.querySelector('#studio.hero3'),aw=st&&st.querySelector('#appwin');
  if(aw){
    const hc=document.createElement('div');hc.className='h3cur';
    hc.innerHTML='<svg viewBox="0 0 24 28"><path d="M2 1.5v21.2l5.6-5.2 3.6 8.3 3.6-1.6-3.5-8.2h7.8z"/></svg>';aw.appendChild(hc);
    const pos={image:[44.9,26],exam:[65.6,27],hwp:[86.4,26]};
    const imgs=[...aw.querySelectorAll('.g')];
    const mo=new MutationObserver(()=>{
      if(!st.classList.contains('h3-ready'))return;hc.classList.add('on');
      const on=imgs.find(g=>g.classList.contains('on'));const k=on&&on.dataset.g;
      if(pos[k]){hc.style.left=pos[k][0]+'%';hc.style.top=pos[k][1]+'%'}
      else if(k==='ready'&&!hc.dataset.moved){hc.style.left='62%';hc.style.top='62%'}
    });
    imgs.forEach(g=>mo.observe(g,{attributes:true,attributeFilter:['class']}));mo.observe(st,{attributes:true,attributeFilter:['class']});
    st.addEventListener('pointermove',()=>{hc.classList.remove('on');hc.dataset.moved=1},{passive:true});
  }

  // ④ 첫 화면: 큰 「5E」만. 설명·단추는 문구 화면과 메뉴로. 문구 세 개는 한 화면에서 번갈아
  // 11-20: 메뉴 오른쪽 — 웹 · 인스타그램 · GitHub · 개인 페이지(내려받기는 아래 download 섹션에)
  const LINKS=`<a class="lk ico web" href="https://www.5e.ai.kr" target="_blank" rel="noopener" title="웹에서 쓰기 · www.5e.ai.kr" aria-label="웹에서 쓰기"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M1.8 8h12.4M8 1.7c2 2 2 10.6 0 12.6M8 1.7c-2 2-2 10.6 0 12.6" fill="none" stroke="currentColor" stroke-width="1.3"/></svg></a><a class="lk ico" href="https://www.instagram.com/5e_science" target="_blank" rel="noopener" title="5E 인스타그램 @5e_science" aria-label="5E 인스타그램"><svg viewBox="0 0 16 16"><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="3.6" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="2.9" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="11.8" cy="4.2" r=".9" fill="currentColor"/></svg></a><a class="lk ico gh" href="https://github.com/seungyeon980808-pixel/5E" target="_blank" rel="noopener" title="GitHub" aria-label="GitHub"><svg viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.81.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.67.07-.52.28-.87.51-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg></a><a class="lk ico" href="https://www.psy.ai.kr" target="_blank" rel="noopener" title="만든 사람 · psy.ai.kr" aria-label="만든 사람 개인 페이지"><svg viewBox="0 0 16 16"><circle cx="8" cy="5.4" r="2.8" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2.6 14.2c.6-2.8 2.8-4.3 5.4-4.3s4.8 1.5 5.4 4.3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></a>`;
  const cp=st&&st.querySelector('.studio__copy');
  if(cp){
    cp.innerHTML=`<h1 class="h3-big" aria-label="5E — 과학 시험지 편집기"><svg class="h3-logo" viewBox="0 0 220 130" aria-hidden="true"><path d="M39.3 125.6Q27.7 125.6 19.7 120.5Q11.8 115.4 11.8 108.4Q11.8 104.2 14.4 101.4Q17.1 98.5 21.6 98.5Q26.2 98.5 29 101.1Q31.9 103.7 31.9 107.9Q31.9 110.8 30.9 114.1Q29.9 117.4 29.2 119.2Q30.2 119.5 32.6 119.8Q34.9 120.2 37.2 120.2Q40.2 120.2 43.7 118.3Q47.2 116.4 50.1 112.8Q53.2 109 55.1 104.2Q56.9 99.4 56.9 92.3Q56.9 85.7 53.6 81.8Q50.3 77.9 44.2 77.9Q41.2 77.9 38.9 78.6Q36.6 79.4 34.4 80.6Q32.2 81.9 30.6 83.1Q29 84.4 27.2 86.2L22.9 84.6L37.9 40.9H87.4L83.7 57H39L32.6 76.8Q38 73.5 42.5 72.2Q47 70.8 52.4 70.8Q57.1 70.8 61.5 71.7Q65.9 72.7 70 75.4Q74 78 76.4 82.1Q78.8 86.2 78.8 92Q78.8 106.2 67.2 115.9Q55.5 125.6 39.3 125.6Z M175 20.9 170.1 42.1H165.6Q164.8 36.5 161.7 31.8Q158.6 27.2 155.1 26.4Q153.5 26 150.3 25.9Q147.2 25.8 145.2 25.8H133.7L126.2 58.4H134.2Q138.6 58.4 141.1 57.4Q143.6 56.4 145.7 54.7Q147.4 53.3 149.6 49.8Q151.8 46.3 152.7 43.9H157.1L149.1 78.6H144.7V76.4Q144.7 73.8 144.1 71Q143.6 68.2 142.8 67.1Q141.3 64.9 138.7 64.1Q136.2 63.4 133 63.4H125L119.7 86.5Q119.3 88.3 118.9 90.3Q118.6 92.4 118.6 93.3Q118.6 97 121.1 98Q123.5 99 130.1 99Q138.6 99 142.4 98.2Q146.3 97.5 148.2 96Q151.8 93 156.7 87Q161.6 81 163.4 78.1H167.6L160.1 104H82.7L83.7 99.7Q85.1 99.7 88 99.3Q90.9 99 92.3 98.6Q94.6 97.8 95.8 96.2Q97 94.6 97.5 92.6L110.9 34.4Q111.2 33.2 111.3 32.4Q111.4 31.6 111.4 31.2Q111.4 28.7 109 27.3Q106.5 26 100.8 25.1L101.8 20.9Z"/></svg></h1>`;
    const COPY=[['출제는 AI가 돕더라도,','결국 책임은 교사가 져야 합니다.'],['교사의 도구는','강사의 도구와 달라야 합니다.'],['우리는 교수자이면서','동시에 평가자입니다.']];
    const sec=document.createElement('section');sec.className='manif1';sec.id='manif';
    sec.innerHTML=`<div class="mf-stage">${COPY.map((c,i)=>`<h2 class="mf" data-i="${i}"><em>${c[0]}</em><br>${c[1]}</h2>`).join('')}</div>
      <div class="mf-dots">${COPY.map((_,i)=>`<button type="button" aria-label="문구 ${i+1}"><i></i></button>`).join('')}</div>
      <p class="mf-sub"><b>5E</b> 과학 평가문항 에디터. 그림, 출제, 조판까지 한 곳에서.</p>
`;
    st.after(sec);
    const hs=[...sec.querySelectorAll('.mf')],ds=[...sec.querySelectorAll('.mf-dots button')];let k=-1,tm=null,vis=false;
    const show=i=>{k=i;hs.forEach((h,j)=>{h.classList.toggle('on',j===i);h.classList.toggle('off',j!==i)});ds.forEach((d,j)=>{d.classList.toggle('on',j===i);d.classList.remove('run');if(j===i){void d.offsetWidth;d.classList.add('run')}});
      clearTimeout(tm);tm=setTimeout(()=>{if(vis&&!document.hidden)show((k+1)%3);else tm=null},2400)};
    ds.forEach((d,i)=>d.onclick=()=>show(i));
    new IntersectionObserver(es=>{vis=es[0].isIntersecting;if(vis&&(k<0||!tm))show(k<0?0:(k+1)%3)},{threshold:.4}).observe(sec);
  }
  // ⑥ 위 메뉴: 지금 묶음에 밑줄 + 메뉴 아래 진행 막대(P2), 클립보드 추가
  const links=document.querySelector('.nav__links');
  if(links){
    if(!links.querySelector('a[href="#g-clipboard"]')){const li=document.createElement('li');li.innerHTML='<a href="#g-clipboard">클립보드</a>';links.appendChild(li)}
    const inner=document.querySelector('.nav__inner');const pb=document.createElement('i');pb.className='navprog';inner.appendChild(pb);
    const gs=['image','exam','hwp','clipboard'].map(k=>[k,document.getElementById('g-'+k)]).filter(x=>x[1]);
    const hist=document.getElementById('history');
    const upd=()=>{const y=scrollY+innerHeight*.4;let cur=null;for(const [k,el] of gs){if(el.getBoundingClientRect().top+scrollY<y)cur=k}
      if(hist&&hist.getBoundingClientRect().top<innerHeight*.4)cur=null;
      links.querySelectorAll('a').forEach(a=>a.classList.toggle('cur',a.getAttribute('href')==='#g-'+cur));
      const H=document.documentElement.scrollHeight-innerHeight;pb.style.transform=`scaleX(${H>0?Math.min(1,scrollY/H):0})`};
    let rq=0;const qu=()=>{if(!rq)rq=requestAnimationFrame(()=>{rq=0;upd()})};addEventListener('scroll',qu,{passive:true});addEventListener('resize',qu);upd();
    const end=document.querySelector('.nav__end');if(end&&!end.querySelector('.navlk')){const w=document.createElement('div');w.className='navlk';w.innerHTML=LINKS;end.appendChild(w);const old=end.querySelector('a.btn--primary');if(old)old.style.display='none';
      const tb=document.createElement('button');tb.type='button';tb.className='lk thm';tb.setAttribute('aria-label','밝은 화면·어두운 화면');
      tb.innerHTML='<svg class="sun" viewBox="0 0 16 16"><circle cx="8" cy="8" r="3.2"/><path d="M8 .8v2M8 13.2v2M.8 8h2M13.2 8h2M2.9 2.9l1.4 1.4M11.7 11.7l1.4 1.4M2.9 13.1l1.4-1.4M11.7 4.3l1.4-1.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg><svg class="moon" viewBox="0 0 16 16"><path d="M13.6 10.4A6 6 0 0 1 5.6 2.4a6 6 0 1 0 8 8z"/></svg>';
      tb.onclick=()=>{const t=document.getElementById('themeToggle');if(t)t.click();else{const R=document.documentElement;if(R.dataset.theme==='light')delete R.dataset.theme;else R.dataset.theme='light'}};
      w.appendChild(tb)}
  }
  // ⑦ 들어올 때: 로고 쓰기(I1) → 노트북 열림(I4). 끝나면 첫 화면 연출(스포트라이트)을 시작
  if(st){
    const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    let done;window.__5eIntro=new Promise(r=>done=r);
    if(true){done()}else{ // 11-20: 인트로(로고 쓰기·뚜껑 열기) 뺌 — 열자마자 5E와 열린 노트북
      st.classList.add('h3-shut');
      const ov=document.createElement('div');ov.className='intro5e';ov.innerHTML='<svg viewBox="0 0 220 130"><text x="14" y="104">5E</text></svg>';
      document.body.appendChild(ov);document.documentElement.classList.add('intro-on');
      requestAnimationFrame(()=>ov.classList.add('draw'));
      setTimeout(()=>{ov.classList.add('fly');document.documentElement.classList.remove('intro-on')},1900);
      setTimeout(()=>{ov.remove();st.classList.remove('h3-shut')},2600);
      setTimeout(done,3700);
    }
  }
  // ⑧ 방문자 화면: 시안용 표시(번호표·의견 막대·색 고르기·위 안내줄)를 모두 숨김. ?view=visitor 또는 V 키
  {const R=document.documentElement,q=new URLSearchParams(location.search).get('view');if(q==='visitor')R.dataset.view='visitor';
   const bar=document.querySelector('.mockbar');if(bar&&!bar.querySelector('#visitorBtn')){const b=document.createElement('button');b.id='visitorBtn';b.type='button';b.className='theme-toggle';b.textContent='방문자 화면으로 보기';b.onclick=()=>{R.dataset.view='visitor';toast()};bar.appendChild(b)}
   const tip=document.createElement('div');tip.className='vtip';tip.textContent='방문자 화면 · V 키를 누르면 시안 모드로 돌아갑니다';document.body.appendChild(tip);
   function toast(){tip.classList.add('on');setTimeout(()=>tip.classList.remove('on'),2600)}
   if(R.dataset.view==='visitor')setTimeout(toast,400);
   addEventListener('keydown',e=>{if((e.key==='v'||e.key==='V')&&!e.metaKey&&!e.ctrlKey&&!/INPUT|TEXTAREA/.test(document.activeElement.tagName)&&!document.activeElement.isContentEditable){if(R.dataset.view==='visitor')delete R.dataset.view;else{R.dataset.view='visitor';toast()}}})}
  // ⑨ 첫 화면 노트북 안: 시작 창 다음에 실제 작업 장면을 차례로(출시본 v1.7.0 촬영)
  if(st){
    const sv=st.querySelector('.screen-viewport');
    const M=[['img/mont/s1v3-pre-lib.jpg','image','교과서에서 찾고'],['img/mont/s1v3-pre-conv.jpg','image','잘라 넣고 변환'],['img/mont/s1v3-chrome-on.jpg','image','평가원 스타일로'],
      ['img/mont/s3v3-b20.jpg','image','그래프는 살아있게'],['img/mont/s5v3-03-hits.jpg','exam','낱말로 기출 검색'],['img/mont/s4v3-09.jpg','exam','쓰면 바로 조판'],
      ['img/mont/s6v3-08-school.jpg','exam','내 학교 양식으로'],['img/mont/s7v4-a02.jpg','hwp','시험지 위에서 바로'],['img/mont/s9v3-s2.jpg','clipboard','세 프로그램을 하나로']];
    const mo=document.createElement('div');mo.className='h3mont';
    mo.innerHTML=M.map(m=>`<img alt="" decoding="async" data-src="${m[0]}">`).join('')+'<div class="h3mcap"><b></b><span></span></div>';
    sv.appendChild(mo);
    const ims=[...mo.querySelectorAll('img')],cb=mo.querySelector('.h3mcap b'),cs=mo.querySelector('.h3mcap span');
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    const ready=im=>{if(!im.src)im.src=im.dataset.src;return im.decode?im.decode().catch(()=>{}):Promise.resolve()};
    let heroVis=true;new IntersectionObserver(es=>{heroVis=es[0].isIntersecting;window.__heroOff=!heroVis},{threshold:.2}).observe(st);
    window.__h3montage=async(stop0)=>{const stop=()=>stop0()||!heroVis||document.hidden;await ready(ims[0]);mo.classList.add('on');
      for(let i=0;i<M.length;i++){if(stop())break;await ready(ims[i]);if(ims[i+1])ready(ims[i+1]);ims.forEach((im,j)=>{im.classList.toggle('on',j===i);if(j===i){im.classList.remove('kb');void im.offsetWidth;im.classList.add('kb')}});
        cb.textContent=M[i][1];cs.textContent=M[i][2];mo.classList.remove('capin');void mo.offsetWidth;mo.classList.add('capin');await w(2500)}
      mo.classList.remove('on');ims.forEach(im=>im.classList.remove('on'));await w(700)};
  }
  // ⑤ 늘 보이는 링크(첫 화면을 지나면)
  // ⑤ 11-20: 쓰기 단추는 메뉴 줄 한 곳으로(떠 있는 줄·문구 화면·마지막 화면 단추는 뺌)
  const cta=document.querySelector('.closing .cta-row');if(cta)cta.remove();
  const adr=document.querySelector('.closing .addr [data-badge="C-42"]');if(adr&&!adr.closest('a')){const a=document.createElement('a');a.href='https://www.5e.ai.kr';a.target='_blank';a.rel='noopener';a.className='addr-a';adr.parentNode.insertBefore(a,adr);a.appendChild(adr)}

  // ⑩ 11-20: 첫 화면 한 장에 노트북 끝까지 — 화면 높이에 맞춰 노트북 폭을 정함
  if(st){const fr=st.querySelector('.device-frame');
    const fit=()=>{if(!fr)return;const H=innerHeight,W=innerWidth;let w=Math.min(W*.92,1100);
      for(let k=0;k<3;k++){st.style.setProperty('--nb-w',w+'px','important');const top=fr.getBoundingClientRect().top+scrollY;
        const bottom=top+w/1.5*.905;const over=bottom-(H-Math.round(36+H*.06));if(Math.abs(over)<2)break;w=Math.max(320,Math.min(W*.92,1100,w-over*1.5/.905))}};
    fit();let rt=0;addEventListener('resize',()=>{cancelAnimationFrame(rt);rt=requestAnimationFrame(fit)});if(document.fonts)document.fonts.ready.then(fit)}

  // ⑪ 11-20: 직접 해 볼 수 있는 장면 — 알림으로 어디를 누를지 알려 줌
  const TRY={S1:[2,'손잡이를 끌어 원본과 비교해 보세요'],S2:[2,'손잡이를 끌어 원본과 비교해 보세요'],S3:[1,'손잡이를 끌어 원본 사진과 겹쳐 보세요'],
    S4:[0,''],S5:[0,''],S6:[0,''],S8:[1,'손잡이를 끌거나 라벨을 끌어 옮겨 보세요'],S9:[0,'']};
  const hintIO=new IntersectionObserver(es=>es.forEach(e=>{const h=e.target.__hint;if(!h||h.dataset.done)return;
    if(e.isIntersecting){clearTimeout(h.__t);h.__t=setTimeout(()=>h.classList.add('on'),900)}else{clearTimeout(h.__t);h.classList.remove('on')}}),{threshold:.55});
  let hl=8;const hscan=()=>{hl=0;document.querySelectorAll('section[id^="f-S"]').forEach(sec=>{const t=TRY[sec.id.slice(2)];if(!t||sec.__hint)return;
    const wh=sec.querySelector('.where');const steps=[...sec.querySelectorAll('button')].filter(b=>/^0\d/.test(b.textContent.trim()));
    if(!wh||!steps.length){hl++;return}
    const b=steps[t[0]]||steps[0],num=b.textContent.trim().slice(0,2),lab=b.textContent.trim().slice(2);
    const h=document.createElement('div');h.className='tryme';h.setAttribute('role','status');
    h.innerHTML=`<svg viewBox="0 0 24 28" aria-hidden="true"><path d="M2 1.5v21.2l5.6-5.2 3.6 8.3 3.6-1.6-3.5-8.2h7.8z"/></svg><b>직접 해 보기</b><span>${t[1]?`<em>${num}</em> 「${lab}」 누르고 ${t[1]}`:`번호를 누르면 그 장면에서 멈춥니다 — <em>${num}</em>부터 눌러 보세요`}</span><button type="button" aria-label="닫기">×</button>`;
    wh.appendChild(h);sec.__hint=h;b.classList.add('trythis');hintIO.observe(sec);
    const done=()=>{h.dataset.done=1;h.classList.remove('on');b.classList.remove('trythis')};
    h.querySelector('button').addEventListener('click',done);
    sec.addEventListener('pointerdown',e=>{if(e.target.closest('.tryme'))return;if(e.target.closest('button')===b||b.classList.contains('trythis')&&e.target.closest('button')){b.classList.remove('trythis');
      h.querySelector('span').textContent=t[1]?t[1]:'다른 번호도 눌러 보세요 · 잠시 두면 저절로 다시 이어집니다';setTimeout(done,t[1]?6000:3500)}},true)})};
  hscan();const hid=setInterval(()=>{hscan();if(!hl)clearInterval(hid)},1000);
})();
