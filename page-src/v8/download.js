/* 11-20: 메뉴(영어) + 내려받기 섹션 — Mac · Windows · 웹 세 칸. 최신 릴리스 파일을 GitHub에서 읽어 버튼 한 번으로. */
(function(){
  'use strict';
  const REPO='seungyeon980808-pixel/5E',PAGE=`https://github.com/${REPO}/releases/latest`,WEB='https://www.5e.ai.kr';
  // ① 메뉴: clipboard · architecture · history · download
  const links=document.querySelector('.nav__links');
  const go=(id,alt)=>e=>{const t=document.getElementById(id)||(alt&&document.getElementById(alt));if(t){e.preventDefault();t.scrollIntoView({behavior:'smooth'})}};
  if(links){const c=links.querySelector('a[href="#g-clipboard"]');if(c)c.textContent='clipboard';
    [['architecture','arch'],['history','hx','history'],['download','download'],['FAQ','faq']].forEach(([t,id,alt])=>{if(links.querySelector(`a[data-nav="${t}"]`))return;
      const li=document.createElement('li');li.innerHTML=`<a href="#${id}" data-nav="${t}">${t}</a>`;links.appendChild(li);li.firstChild.addEventListener('click',go(id,alt))})}
  // ② 이 컴퓨터
  const ua=navigator.userAgent,mobile=/iPhone|iPad|Android/i.test(ua)||(navigator.maxTouchPoints>1&&/Macintosh/.test(ua));
  const os=mobile?'mobile':/Windows/i.test(ua)?'win':/Macintosh|Mac OS X/i.test(ua)?'mac':'other';
  const ICON={mac:'<svg viewBox="0 0 16 16"><path d="M11.2 8.5c0-1.5 1.2-2.2 1.3-2.3-.7-1-1.8-1.2-2.2-1.2-.9-.1-1.8.6-2.3.6s-1.2-.5-2-.5C4.9 5.1 3.9 5.7 3.4 6.7c-1.1 1.9-.3 4.8.8 6.3.5.8 1.1 1.6 1.9 1.6.8 0 1-.5 2-.5s1.2.5 2 .5 1.3-.8 1.8-1.5c.6-.8.8-1.6.8-1.7 0 0-1.5-.6-1.5-2.9zM9.8 4c.4-.5.7-1.2.6-1.9-.6 0-1.3.4-1.8.9-.4.4-.7 1.1-.6 1.8.7.1 1.3-.3 1.8-.8z" fill="currentColor"/></svg>',
    win:'<svg viewBox="0 0 16 16"><path d="M1 2.8l5.7-.8v5.5H1zm6.4-.9L15 1v6.5H7.4zM1 8.3h5.7v5.5L1 13zm6.4 0H15V15l-7.6-1.1z" fill="currentColor"/></svg>',
    web:'<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M1.8 8h12.4M8 1.7c2 2 2 10.6 0 12.6M8 1.7c-2 2-2 10.6 0 12.6" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>'};
  const sec=document.createElement('section');sec.className='wrap dlsec';sec.id='download';
  sec.innerHTML=`<div class="group"><b>download</b><span>최신판 <i class="dl-v">…</i></span></div>
  <div class="dl3">
    <div class="dl3-c" data-k="mac">${ICON.mac}<b>Mac</b><span class="dl3-s">Apple 칩 · .dmg</span><div class="dl3-b"><a class="dl3-go" href="${PAGE}">내려받기</a></div></div>
    <div class="dl3-c" data-k="win">${ICON.win}<b>Windows</b><span class="dl3-s">64비트 · .exe</span><div class="dl3-b"><a class="dl3-go" href="${PAGE}">내려받기</a></div></div>
    <div class="dl3-c" data-k="web">${ICON.web}<b>웹</b><span class="dl3-s">www.5e.ai.kr</span><div class="dl3-b"><a class="dl3-go" href="${WEB}" target="_blank" rel="noopener">열기</a><button type="button" class="dl3-cp">링크 복사</button></div></div>
  </div>
  <p class="dl3-foot">인텔 Mac은 <a class="dl3-x" href="${PAGE}">여기</a> · <a href="${PAGE}" target="_blank" rel="noopener">이번 판에서 바뀐 것</a></p>`;
  const closing=document.getElementById('start');if(closing)closing.remove(); // 11-20: 「주소 하나면 됩니다」 뺌
  const foot=document.querySelector('footer');if(foot)foot.parentNode.insertBefore(sec,foot);else document.body.appendChild(sec);
  const cp=sec.querySelector('.dl3-cp');cp.addEventListener('click',()=>{const done=()=>{cp.textContent='복사됨';setTimeout(()=>cp.textContent='링크 복사',1500)};(navigator.clipboard?navigator.clipboard.writeText(WEB+'/'):Promise.reject()).then(done).catch(()=>{const t=document.createElement('textarea');t.value=WEB+'/';document.body.appendChild(t);t.select();try{document.execCommand('copy');done()}catch(_){}t.remove()})});
  const mine=os==='win'?'win':os==='mac'?'mac':os==='mobile'?'web':'';if(mine)sec.querySelector(`.dl3-c[data-k="${mine}"]`).classList.add('mine');
  const navDl=document.querySelector('.navlk a.lk.dl');
  fetch(`https://api.github.com/repos/${REPO}/releases/latest`,{headers:{Accept:'application/vnd.github+json'}}).then(r=>r.ok?r.json():Promise.reject()).then(rel=>{
    const as=rel.assets||[],find=re=>as.find(a=>re.test(a.name)),mb=a=>Math.round(a.size/1048576)+'MB';
    sec.querySelector('.dl-v').textContent=rel.tag_name;
    const m=find(/macos-arm64\.dmg$/),x=find(/macos-x64\.dmg$/),w=find(/windows-x64\.exe$/);
    if(m){const a=sec.querySelector('[data-k="mac"] .dl3-go');a.href=m.browser_download_url;sec.querySelector('[data-k="mac"] .dl3-s').textContent=`Apple 칩 · .dmg · ${mb(m)}`}
    if(w){const a=sec.querySelector('[data-k="win"] .dl3-go');a.href=w.browser_download_url;sec.querySelector('[data-k="win"] .dl3-s').textContent=`64비트 · .exe · ${mb(w)}`}
    if(x)sec.querySelector('.dl3-x').href=x.browser_download_url;
    const pick=os==='win'?w:os==='mac'?m:null;if(navDl&&pick){navDl.href=pick.browser_download_url;navDl.removeAttribute('target')}
  }).catch(()=>{sec.querySelector('.dl-v').textContent='';});
})();
