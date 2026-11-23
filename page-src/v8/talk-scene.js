/* 11-21: 「말로 그리기」 장면 재생(1.7.2 생성 화면 바탕 + 실제 대화·결과 + 앱 로딩 모듈 page/talk/js) — 과목 칩 8개, 저절로 돌고 칩을 누르면 그 과목으로 */
(function(){
'use strict';
const sec=document.getElementById('f-TK');if(!sec)return;
const D=window.TALK||[];const fit=sec.querySelector('.wfit'),lis=[...sec.querySelectorAll('.steps li')];
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
fit.innerHTML=`<div class="tk"><div class="tk-in"><div class="tk-cam"><img class="bg" src="img/talk/chrome.jpg" alt="5E_image AI 이미지 · 생성 화면(1.7.2)"><div class="cv"><div class="sheet"></div></div><div class="log"></div><div class="ta"></div><div class="go"></div></div><span class="zoomtag">크게 보기</span></div></div><div class="tk-foot"><span class="src"></span><span><b>GPT 연결 필요</b> · 걸린 시간은 실제 시간</span></div>`;
const tk=fit.querySelector('.tk'),tin=fit.querySelector('.tk-in'),cam=fit.querySelector('.tk-cam'),cv=fit.querySelector('.cv'),ztag=fit.querySelector('.zoomtag'),sheet=tk.querySelector('.sheet'),log=tk.querySelector('.log'),ta=tk.querySelector('.ta'),go=tk.querySelector('.go'),src=fit.querySelector('.src');
const DRAW=[['요청을 그림 설계로 바꾸는 중','요청을 그림 설계로 바꿨어요'],['그릴 준비를 하는 중','그릴 준비를 마쳤어요'],['그림을 그리는 중','그림을 그렸어요'],['흑백으로 정리하는 중','흑백으로 정리했어요']];
const EDIT=[['고칠 곳을 찾는 중','고칠 곳을 찾았어요'],['그 부분을 고치는 중','그 부분을 고쳤어요'],['나머지가 그대로인지 확인하는 중','나머지가 그대로인지 확인했어요']];
let run=0,cur=0,auto=true;
const fitScale=()=>tin.style.setProperty('--s',tk.clientWidth/1440);fitScale();new ResizeObserver(fitScale).observe(tk);
D.forEach(d=>[...d.first,d.second].forEach(x=>{const im=new Image();im.src=x.src}));
class Stop extends Error{}
const wait=(ms,r)=>new Promise((ok,no)=>setTimeout(()=>r===run?ok():no(new Stop()),reduce?Math.min(ms,60):ms));
const el=(c,h)=>{const e=document.createElement('div');e.className=c;if(h!=null)e.innerHTML=h;return e};
const esc=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function chip(i,p){lis.forEach((li,k)=>{li.classList.toggle('on',k===i);const b=li.querySelector('.bar i');if(b){b.style.transition='none';b.style.width=k<i?'100%':'0%'}});}
function bar(i,ms){const b=lis[i]&&lis[i].querySelector('.bar i');if(!b)return;b.style.transition='none';b.style.width='0%';b.offsetWidth;b.style.transition=`width ${ms}ms linear`;b.style.width='100%'}
async function type(text,r){ta.innerHTML='';const n=text.length,step=Math.max(14,Math.min(38,2600/n));for(let k=1;k<=n;k++){ta.innerHTML=esc(text.slice(0,k))+'<span class="car"></span>';await wait(step,r)}}
function msg(c,h){const m=el('m '+c,h);log.append(m);requestAnimationFrame(()=>requestAnimationFrame(()=>m.classList.add('on')));while(log.children.length>6)log.firstChild.remove();return m}
// 실제 1.7.2 로딩 모듈(js/loading/workbench-loading.js)을 그대로 쓴다. 새 그림은 흰 종이(1536×1024)에서, 고치기는 앞 그림에서 시작.
const WAITS={draw:[600,1500,500,400],edit:[500,1300,450,350]};
const PH={draw:['index','draw','strip','grayscale'],edit:['edit-find','edit-apply','edit-verify','edit-finish']};
try{localStorage.setItem('5e.loading.stageTimes.v1',JSON.stringify({'figure:undefined:figure':[WAITS.draw],'figure-edit:undefined:figure-edit':[WAITS.edit]}))}catch(_){}
let LD=null,tok=0,paper=null;
const blankPaper=()=>{if(paper)return paper;const c=document.createElement('canvas');c.width=1536;c.height=1024;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,1536,1024);return paper=c.toDataURL('image/png')};
const ldReady=import('./talk/js/loading/workbench-loading.js').then(m=>{LD=m.createWorkbenchLoading({host:cv,legacy:sheet,panel:tin});});
async function loading(kind,source,result,r,title){await ldReady;const t=++tok;
  LD.begin({token:t,source,kind:kind==='draw'?'figure':'figure-edit',plan:kind==='draw'?'figure':'figure-edit',phased:true,title:title||null});
  for(let s=0;s<4;s++){LD.stage(PH[kind][s]);await wait(WAITS[kind][s],r)}
  await LD.finish({token:t,outcome:'done',result});}
async function rows(list,secs,r){const box=msg('status','<ul class="rows"></ul>'),ul=box.querySelector('ul');const t0=performance.now();
  for(let k=0;k<list.length;k++){[...ul.children].forEach(li=>{li.className='row';li.querySelector('span').textContent=li.dataset.done});
    const li=document.createElement('li');li.className='row cur';li.dataset.done=list[k][1];li.innerHTML=`<i></i><span>${list[k][0]}</span><time></time>`;ul.append(li);
    const share=Math.round(secs/list.length);li.querySelector('time').textContent=String(Math.round(secs*(k+1)/list.length)).padStart(2,'0')+'초';
    await wait((list.length===4?WAITS.draw:WAITS.edit)[k]||800,r)}
  [...ul.children].forEach(li=>{li.className='row';li.querySelector('span').textContent=li.dataset.done});return box}
async function show(imgs,cls){await Promise.all(imgs.map(s=>{const im=new Image();im.src=s;return im.decode().catch(()=>{})}));sheet.className='sheet'+(cls?' '+cls:'');sheet.innerHTML=imgs.map(s=>`<img src="${s}" alt="">`).join('');sheet.querySelectorAll('img').forEach(i=>i.classList.add('fresh'));requestAnimationFrame(()=>sheet.classList.add('on'))}
async function play(i,r){const d=D[i];cur=i;chip(i);bar(i,reduce?400:17000);
  log.innerHTML='';sheet.className='sheet';sheet.innerHTML='';ta.innerHTML='<span class="ph">그림에 대해 AI와 이야기하세요 · 그리기는 「이미지 생성」</span>';
  src.textContent=`${d.sub} · 1.7.2 실제 생성 결과`;
  await wait(500,r);await type(d.ask,r);await wait(350,r);go.classList.add('on');await wait(450,r);go.classList.remove('on');
  ta.innerHTML='';msg('user',esc(d.ask));await wait(300,r);
  const f=d.first.map(x=>x.src);const main=d.first[f.length>1?d.editScene:0];sheet.className='sheet';sheet.innerHTML='';
  await Promise.all([rows(DRAW,d.s1,r),loading('draw',blankPaper(),main.src,r)]);await wait(500,r);
  await show(f,f.length>1?'g2':'');LD.reset();
  msg('done',`<b>그림${f.length>1?' '+f.length+'장을':'을'} 그렸어요</b> <span>· ${d.s1}초</span>`);
  await wait(2300,r);
  await type(d.edit,r);await wait(300,r);go.classList.add('on');await wait(450,r);go.classList.remove('on');
  ta.innerHTML='';msg('user',esc(d.edit));await wait(300,r);
  if(f.length>1){await show([d.first[d.editScene].src]);await wait(500,r)}
  const prev=f.length>1?d.first[d.editScene]:d.first[0];sheet.innerHTML='';sheet.className='sheet';
  await Promise.all([rows(EDIT,d.s2,r),loading('edit',prev.src,d.second.src,r,'생성 결과 1에서 말한 곳만 고치고 있어요')]);await wait(500,r);
  await show([d.second.src]);LD.reset();msg('done',`<b>말한 곳만 고쳤어요</b> <span>· ${d.s2}초</span>`);
  await wait(900,r);await zoom(r);await wait(400,r)}
async function zoom(r){const im=sheet.querySelector('img');if(!im)return;const tb=tin.getBoundingClientRect(),s=tk.clientWidth/1440,ib=im.getBoundingClientRect();
  const x=(ib.left-tb.left)/s,y=(ib.top-tb.top)/s,w=ib.width/s,h=ib.height/s;const k=Math.min(1440*.94/w,900*.94/h);
  const tx=720-(x+w/2)*k,ty=450-(y+h/2)*k;cam.style.transform=`translate(${tx}px,${ty}px) scale(${k})`;ztag.classList.add('on');
  try{await wait(3600,r)}finally{cam.style.transform='';ztag.classList.remove('on')}await wait(1100,r)}
async function loop(start){const r=++run;let i=start;try{for(;;){await play(i,r);if(!auto)return;i=(i+1)%D.length}}catch(e){if(!(e instanceof Stop))throw e}}
lis.forEach((li,k)=>li.querySelector('button').addEventListener('click',()=>{auto=true;cam.style.transform='';ztag.classList.remove('on');LD&&LD.reset();loop(k)}));
let started=false;new IntersectionObserver(es=>{if(es[0].isIntersecting&&!started){started=true;loop(0)}},{threshold:.25}).observe(fit);
})();
