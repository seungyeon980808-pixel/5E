/* 11-20: 시안 조작은 오른쪽 알약 하나로. 평소엔 방문자 화면 그대로(?view=mock이면 시안 표시로 시작). */
(function(){
  'use strict';
  const R=document.documentElement,q=new URLSearchParams(location.search);
  if(q.get('view')!=='mock')R.dataset.view='visitor';
  if(q.get('phone')==='1'||window.self!==window.top)return; // 휴대폰 미리보기 안에서는 알약 없음
  const p=document.createElement('div');p.className='mkp';p.innerHTML=`
    <button type="button" class="mkp-pill" aria-expanded="false" title="시안 조작 열기·닫기"><i></i><span>시안</span></button>
    <div class="mkp-panel" role="dialog" aria-label="시안 조작">
      <b class="mkp-h">시안 조작</b>
      <label class="mkp-row"><span>번호·의견 막대 보이기</span><input type="checkbox" data-x="mock"></label>
      <div class="mkp-row"><span>화면</span><span class="mkp-seg"><button type="button" data-t="dark">어두운</button><button type="button" data-t="light">밝은</button></span></div>
      <label class="mkp-row"><span>갤러리 느낌</span><input type="checkbox" data-x="look"></label>
      <button type="button" class="mkp-btn" data-x="phone">휴대폰으로 보기 <kbd>390</kbd></button>
      <button type="button" class="mkp-btn" data-x="text">문구 탭 열기 <kbd>T</kbd></button>
      <a class="mkp-btn" href="options-1120.html" target="_blank" rel="noopener">시안 비교판 열기 ↗</a>
      <p class="mkp-note">이 알약은 시안에만 있고 실제 페이지에는 없습니다.</p>
    </div>`;
  document.body.appendChild(p);
  const pill=p.querySelector('.mkp-pill'),cb=k=>p.querySelector(`[data-x="${k}"]`);
  pill.onclick=()=>{const on=!p.classList.contains('open');p.classList.toggle('open',on);pill.setAttribute('aria-expanded',on);sync()};
  addEventListener('keydown',e=>{if(e.key==='Escape')p.classList.remove('open')});
  function sync(){cb('mock').checked=R.dataset.view!=='visitor';cb('look').checked=R.dataset.look==='gallery';
    p.querySelectorAll('[data-t]').forEach(b=>b.classList.toggle('on',(R.dataset.theme==='light')===(b.dataset.t==='light')))}
  cb('mock').onchange=e=>{if(e.target.checked)delete R.dataset.view;else R.dataset.view='visitor'};
  cb('look').onchange=e=>{if(e.target.checked)R.dataset.look='gallery';else delete R.dataset.look;try{localStorage.setItem('5e-look',e.target.checked?'gallery':'')}catch(_){}};
  p.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{const l=b.dataset.t==='light';if(l)R.dataset.theme='light';else delete R.dataset.theme;try{localStorage.setItem('5e-landing-theme',l?'light':'dark')}catch(_){}sync()});
  cb('text').onclick=()=>{const t=document.getElementById('ttBtn');if(t)t.click();else addEventListener('load',()=>document.getElementById('ttBtn')?.click(),{once:true})};
  // 휴대폰 미리보기(시안에서만): 같은 페이지를 390×844 휴대폰 틀 안에 띄움
  cb('phone').onclick=()=>{p.classList.remove('open');let o=document.querySelector('.mkphone');if(o){o.remove();return}
    o=document.createElement('div');o.className='mkphone';
    const u=new URL(location.href);u.searchParams.set('phone','1');u.searchParams.delete('tab');u.hash='';
    o.innerHTML=`<div class="mkphone-bar"><b>휴대폰 미리보기</b><span>390 × 844 · 시안에서만</span><button type="button" data-w="390">iPhone</button><button type="button" data-w="360">작은 폰</button><button type="button" data-w="768">태블릿</button><button type="button" class="x" aria-label="닫기">닫기 ✕</button></div><div class="mkphone-dev"><iframe title="휴대폰 미리보기" src="${u.href}"></iframe></div>`;
    document.body.appendChild(o);const dev=o.querySelector('.mkphone-dev');
    o.querySelectorAll('[data-w]').forEach(b=>b.onclick=()=>{const w=+b.dataset.w;dev.style.width=w+'px';dev.style.height=(w>600?1024:844)+'px';o.querySelector('span').textContent=`${w} × ${w>600?1024:844} · 시안에서만`});
    o.querySelector('.x').onclick=()=>o.remove();o.addEventListener('click',e=>{if(e.target===o)o.remove()})};
  sync();
})();
