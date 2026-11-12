// 아이디어 판(11-12, 시안 5e-design-mockups/exam-idea-panels-1112.html).
// 문항 하나를 만들기 위한 생각 판: 메모·그림·링크 카드를 놓고 잇고, 고른 글·그림을 문항 카드로 보낸다.
//  · 판은 data.ideas에 문항과 함께 저장된다. 판마다 이어진 문항(questionIds)을 기억한다.
//  · 판 화면은 하나(el)만 만들어 두고 「판 모음」 화면과 문항 카드 화면 사이를 옮겨 붙인다(다시 그려도 쓰던 메모·고른 것이 남게).
//  · 판 카드 위에는 단추를 두지 않는다. 오른쪽 단추 = 차림표(보내기·모양·색·잇기·복제·삭제), 왼쪽 단추 = 고르기·옮기기.
//  · 칸이 좁아지면 판을 자르지 않고 통째로 비율로 줄인다(75%까지). ⌘+휠로 바꾸면 그 배율을 지키고 「맞춤」이면 다시 자동.
import {qIcon} from './status-icons.js';

const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const now=()=>new Date().toISOString();
const uid=()=>crypto.randomUUID();
export const ideaIcon=(title=false)=>qIcon('idea',.25,{title});
const SVG=p=>`<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
const IC={
  plus:SVG('<path d="M12 5v14M5 12h14"/>'),
  pic:SVG('<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4.5 18 5-5 3.5 3.5 2.5-2.5 4 4"/>'),
  table:SVG('<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15"/>'),
  link:SVG('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  close:SVG('<path d="M6 6l12 12M18 6 6 18"/>'),
  doc:SVG('<path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5v4h4"/>'),
};
const STYLES=[['','기본'],['outline','윤곽'],['light','밝게'],['compact','접기']];
const COLORS=['','#e5675e','#e3b94f','#5fae7f','#6f9ce6'];

export function newBoard(title='새 아이디어 판'){return {id:uid(),title,questionIds:[],items:[],links:[],createdAt:now(),updatedAt:now()};}
export function boardsFor(data,qid){return (data.ideas||[]).filter(b=>b.questionIds?.includes(qid));}
export function boardMeta(b){const n=t=>b.items.filter(i=>i.type===t).length,parts=[['memo','메모'],['image','그림'],['link','링크']].map(([t,s])=>n(t)?`${s} ${n(t)}`:'').filter(Boolean);
  const d=new Date(b.updatedAt||b.createdAt),today=new Date();const when=d.toDateString()===today.toDateString()?'오늘':`${d.getMonth()+1}-${String(d.getDate()).padStart(2,'0')}`;
  return [...parts,when].join(' · ');}
// 판 이름(새 판일 때): 「새 아이디어 판」, 「새 아이디어 판 2」…
export function nextBoardTitle(data){const used=new Set((data.ideas||[]).map(b=>b.title));if(!used.has('새 아이디어 판'))return '새 아이디어 판';let i=2;while(used.has(`새 아이디어 판 ${i}`))i++;return `새 아이디어 판 ${i}`;}

// 그림 파일 → 판에 넣을 data URL(긴 변 1600px까지 줄이고, 문항 카드 그림 형식(png·jpeg·webp)으로).
export function readImage(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(r.error);r.onload=()=>{const img=new Image();img.onerror=()=>reject(Error('그림을 읽지 못했습니다.'));img.onload=()=>{
  const k=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));const w=Math.max(1,Math.round(img.naturalWidth*k)),h=Math.max(1,Math.round(img.naturalHeight*k));
  const keep=/^data:image\/(png|jpeg|webp);base64,/.test(r.result)&&k===1;if(keep){resolve({data:r.result,w,h});return;}
  const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);resolve({data:c.toDataURL(/png|gif|svg/.test(file.type)?'image/png':'image/jpeg',.9),w,h});};img.src=r.result;};r.readAsDataURL(file);});}

const hostOf=u=>{try{return new URL(u).hostname.replace(/^www\./,'');}catch{return u;}};

// 판 모음 화면(11-12): 「출제 중인 문항」과 같은 틀 — 제목·개수 · 보기 바꾸기(카드 / 파일 이름) · 점선 줄(새 판) · 찾기 · 카드 격자 또는 줄 목록.
// 판은 문항에 묶이지 않는다. 두 번 누르면 작업 칸에 올라간다(문항 카드가 열려 있으면 그 옆에 판 2 : 카드 1).
export function renderIdeasList(root,data,api){
  const q=(api.query||'').trim().toLowerCase(),all=data.ideas||[];
  const list=[...all].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).filter(b=>!q||b.title.toLowerCase().includes(q)||b.items.some(i=>`${i.title||''} ${i.text||''}`.toLowerCase().includes(q)));
  const thumb=b=>{const its=b.items.slice(0,30);if(!its.length)return '<span class="iv-th-empty">빈 판</span>';
    const hOf=i=>i.h||(i.type==='image'&&i.nw?(i.w||200)*i.nh/i.nw+30:i.type==='link'?52:110);
    const x0=Math.min(...its.map(i=>i.x)),y0=Math.min(...its.map(i=>i.y));
    let W=Math.max(400,Math.max(...its.map(i=>i.x-x0+(i.w||240)))+40),H=Math.max(200,Math.max(...its.map(i=>i.y-y0+hOf(i)))+40);W=Math.max(W,H*8/9);H=Math.max(H,W*8/9);
    return its.map(i=>{const st=`left:${(i.x-x0+20)/W*100}%;top:${(i.y-y0+20)/H*100}%;width:${(i.w||240)/W*100}%;height:${Math.max(4,hOf(i)/H*100)}%`;
      return i.type==='image'?`<i class="img" style="${st}"><img src="${E(i.src)}" alt=""></i>`:`<i class="${i.style==='light'?'w':''}" style="${st}"></i>`;}).join('');};
  const day=iso=>{const d=new Date(iso);return Number.isFinite(d.getTime())?`${d.getMonth()+1}-${String(d.getDate()).padStart(2,'0')}`:'';};
  const cnt=(b,t)=>b.items.filter(i=>i.type===t).length;
  const mode=api.mode==='rows'?'rows':'grid';
  const GRID='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>';
  const ROWS='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></svg>';
  const body=!list.length?`<p class="lv-emptyline">${q?'찾는 판이 없습니다.':'아직 아이디어 판이 없습니다. 「새 아이디어 판」으로 시작하세요.'}</p>`
    :mode==='grid'?`<div class="lv-grid iv-grid">${list.map(b=>`<div class="lv-card iv-card" data-iv-open="${b.id}" tabindex="0" title="두 번 누르면 엽니다"><div class="lv-thumb iv-th">${thumb(b)}</div><div class="lv-meta">${ideaIcon()}<span class="lv-title" data-iv-name>${E(b.title)}</span><small>${day(b.updatedAt||b.createdAt)}</small></div></div>`).join('')}</div>`
    :`<div class="iv-rows"><div class="iv-r iv-hd"><span></span><span>이름</span><span>메모</span><span>그림</span><span>고친 날</span></div>${list.map(b=>`<div class="iv-r" data-iv-open="${b.id}" tabindex="0" title="두 번 누르면 엽니다">${ideaIcon()}<span data-iv-name>${E(b.title)}</span><small>${cnt(b,'memo')}</small><small>${cnt(b,'image')}</small><small>${day(b.updatedAt||b.createdAt)}</small></div>`).join('')}</div>`;
  root.innerHTML=`<div class="lv-head"><h1>아이디어 판</h1><p>${all.length}개</p><div class="lv-vt" role="group" aria-label="보기 방식"><button type="button" data-iv-mode="grid" aria-pressed="${mode==='grid'}" title="카드 모아 보기">${GRID}</button><button type="button" data-iv-mode="rows" aria-pressed="${mode==='rows'}" title="파일 이름으로 보기">${ROWS}</button></div></div>
    <div class="lv-addbar"><button type="button" class="lv-add go" data-iv-new>${IC.plus}새 아이디어 판</button><span class="lv-addhint">두 번 누르면 엽니다${api.benchCard?` · 지금 열린 「${E(api.benchCard)}」 옆에 판 2 : 카드 1로`:''} · 오른쪽 단추 = 이름 바꾸기·지우기</span></div>
    <div class="lv-chips"><label class="lv-search"><input data-iv-search value="${E(api.query||'')}" placeholder="판 이름·메모 찾기" aria-label="판 찾기"></label></div>
    ${body}`;
}

// 판 화면(하나만 만들어 옮겨 붙임).
export function createIdeaBoard(app){
  const el=document.createElement('section');el.className='ib';el.tabIndex=-1;el.setAttribute('aria-label','아이디어 판');
  el.innerHTML=`<div class="ib-head"><span class="ib-title" title="두 번 눌러 이름 바꾸기">${ideaIcon()}<span class="ib-name"></span></span><span class="ib-sep"></span>
    <button type="button" class="ib-tb primary" data-ib="memo" title="새 메모 (N)">${IC.plus}<span class="lb">메모</span><kbd>N</kbd></button>
    <button type="button" class="ib-tb" data-ib="image" title="그림 넣기 · 끌어다 놓거나 ⌘V로 붙여도 됩니다">${IC.pic}<span class="lb">그림</span></button>
    <button type="button" class="ib-tb" data-ib="table" title="표 넣기 · 두 번 눌러 칸에 적기">${IC.table}<span class="lb">표</span></button>
    <button type="button" class="ib-tb" data-ib="link" title="링크 넣기">${IC.link}<span class="lb">링크</span></button>
    <span class="sp"></span>
    <button type="button" class="ib-tb ib-card" data-ib="card"></button><span class="ib-sep"></span>
    <button type="button" class="ib-zoom" data-ib="fit" title="판 전체가 보이게 맞춤 · ⌘+휠로 확대·축소"><b>100%</b><i></i><span>맞춤</span></button>
    <button type="button" class="ib-x" data-ib="close" title="아이디어 닫기 (⌥I)" aria-label="아이디어 닫기">${IC.close}</button></div>
    <div class="ib-wrap"><div class="ib-world"><svg class="ib-links"><defs><marker id="ib-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z"/></marker></defs><g></g></svg></div>
      <p class="ib-empty" hidden>빈 곳을 두 번 눌러 메모를 쓰세요 · 그림은 끌어다 놓거나 ⌘V</p>
      <p class="ib-hint">빈 곳 두 번 = 새 메모 · 오른쪽 단추 = 차림표 · 메모 글 고르기 = 문항 카드로 · ⌘+휠 = 확대·축소</p></div>
    <input type="file" accept="image/*" multiple hidden>
    <div class="ib-float ib-menu" role="menu"></div><div class="ib-float ib-sel"></div><div class="ib-float ib-pop"></div>`;
  const $=s=>el.querySelector(s),wrap=$('.ib-wrap'),world=$('.ib-world'),linksG=$('.ib-links g'),file=$('input[type=file]');
  let board=null,ctx={},picked=null,zoomMan=null,pan={x:0,y:0},undo=[],linking=null,selText='',editing=null;

  // ── 저장 ──
  // 저장할 때 카드 높이를 같이 적어 둔다(판 모음의 작은 그림을 실제 모양대로 그리려고).
  const save=()=>{if(!board)return;for(const i of board.items){const n=node(i.id);if(n&&n.offsetHeight)i.h=n.offsetHeight;}board.updatedAt=now();app.save();};
  const snap=()=>{if(!board)return;undo.push({items:board.items.map(i=>({...i})),links:board.links.map(l=>[...l])});if(undo.length>40)undo.shift();};
  const item=id=>board?.items.find(i=>i.id===id);
  const node=id=>world.querySelector(`.ib-it[data-id="${CSS.escape(id)}"]`);
  const say=(m,err)=>app.status?.(m,err);

  // ── 그리기 ──
  function itemHtml(i){const acc=i.color?`<i class="ib-acc" style="background:${E(i.color)}"></i>`:'';const cls=`ib-it ib-${i.type}${i.style?' st-'+i.style:''}${picked===i.id?' picked':''}`;
    const pos=`left:${i.x}px;top:${i.y}px;${i.w?`width:${i.w}px;`:''}`;
    if(i.type==='image')return `<div class="${cls}" data-id="${E(i.id)}" style="${pos}">${acc}<img src="${E(i.src)}" alt="" draggable="false"><div class="ib-cap">${E(i.title||'')}</div></div>`;
    if(i.type==='table'){const cells=i.cells||[];return `<div class="${cls}" data-id="${E(i.id)}" style="${pos}">${acc}<table class="ib-tbl">${cells.map(row=>`<tr>${row.map(c=>`<td>${E(c)}</td>`).join('')}</tr>`).join('')}</table></div>`;}
    if(i.type==='link')return `<div class="${cls}" data-id="${E(i.id)}" style="${pos}">${acc}<span class="ib-li">${IC.link}</span><div class="ib-lt"><b>${E(i.title||hostOf(i.url))}</b><small>${E(hostOf(i.url))}</small></div><button type="button" class="ib-open" data-ib-open title="${E(i.url)}">열기</button></div>`;
    return `<div class="${cls}" data-id="${E(i.id)}" style="${pos}">${acc}<h4 class="ib-mt">${E(i.title||'')}</h4><div class="ib-mb">${E(i.text||'')}</div></div>`;}
  function draw(){if(!board)return;world.querySelectorAll('.ib-it').forEach(n=>n.remove());world.insertAdjacentHTML('beforeend',board.items.map(itemHtml).join(''));
    $('.ib-empty').hidden=board.items.length>0;world.querySelectorAll('.ib-image img').forEach(img=>{if(!img.complete)img.addEventListener('load',()=>{drawLinks();fit();},{once:true});});
    drawLinks();fit();}
  function box(id){const n=node(id),i=item(id);if(!n||!i)return null;return {x:i.x,y:i.y,w:n.offsetWidth,h:n.offsetHeight};}
  function drawLinks(){if(!board)return;linksG.innerHTML=board.links.map(([a,b])=>{const p=box(a),q=box(b);if(!p||!q)return '';
    let d;const pcx=p.x+p.w/2,qcx=q.x+q.w/2;
    if(q.x>p.x+p.w-10||p.x>q.x+q.w-10){const right=q.x>p.x;const x1=right?p.x+p.w:p.x,y1=p.y+p.h/2,x2=right?q.x:q.x+q.w,y2=q.y+q.h/2,dx=Math.max(40,Math.abs(x2-x1)/2)*(right?1:-1);d=`M${x1},${y1} C${x1+dx},${y1} ${x2-dx},${y2} ${x2},${y2}`;}
    else{const down=q.y>p.y;const y1=down?p.y+p.h:p.y,y2=down?q.y:q.y+q.h,dy=Math.max(30,Math.abs(y2-y1)/2)*(down?1:-1);d=`M${pcx},${y1} C${pcx},${y1+dy} ${qcx},${y2-dy} ${qcx},${y2}`;}
    return `<path d="${d}" marker-end="url(#ib-ar)"/>`;}).join('');}

  // ── 배율: 자르지 않고 비율로(75%까지) ──
  const bounds=()=>{let w=600,h=380;for(const i of board?.items||[]){const b=box(i.id);if(!b)continue;w=Math.max(w,b.x+b.w);h=Math.max(h,b.y+b.h);}return {w:w+24,h:h+24};};
  const autoS=()=>{const b=bounds();return Math.max(.75,Math.min(1,(wrap.clientWidth-24)/b.w,(wrap.clientHeight-40)/b.h));};
  const scale=()=>zoomMan??autoS();
  function fit(){if(!wrap.clientWidth)return;const s=scale();world.style.transform=`translate(${12+pan.x}px,${10+pan.y}px) scale(${s.toFixed(3)})`;
    $('.ib-zoom b').textContent=Math.round(s*100)+'%';$('.ib-zoom').classList.toggle('man',zoomMan!=null||pan.x!==0||pan.y!==0);}
  new ResizeObserver(()=>{if(zoomMan==null&&autoS()>.75)pan={x:0,y:0};fit();}).observe(wrap);
  const live=()=>{world.classList.add('live');clearTimeout(live.t);live.t=setTimeout(()=>world.classList.remove('live'),160);};
  const toWorld=(cx,cy)=>{const r=wrap.getBoundingClientRect(),s=scale();return {x:(cx-r.left-12-pan.x)/s,y:(cy-r.top-10-pan.y)/s};};
  wrap.addEventListener('wheel',e=>{e.preventDefault();live();if(e.metaKey||e.ctrlKey){zoomMan=Math.max(.4,Math.min(2,scale()*(1-e.deltaY*.004)));}else{pan.x-=e.deltaX;pan.y-=e.deltaY;}fit();},{passive:false});

  // ── 고르기 ──
  function pick(id){picked=id;world.querySelectorAll('.ib-it.picked').forEach(n=>n.classList.remove('picked'));if(id)node(id)?.classList.add('picked');}
  const floats=()=>el.querySelectorAll('.ib-float');
  function closeFloats(except){floats().forEach(f=>{if(f!==except)f.classList.remove('show');});app.aim?.(null);}
  function place(f,cx,cy){const r=el.getBoundingClientRect();f.classList.add('show');const w=f.offsetWidth,h=f.offsetHeight;f.style.left=Math.max(6,Math.min(cx-r.left,r.width-w-6))+'px';f.style.top=Math.max(44,Math.min(cy-r.top,r.height-h-6))+'px';}

  // ── 새 카드 ──
  function add(it,{edit=false}={}){snap();const i={style:'',color:'',...it,id:uid()};board.items.push(i);draw();pick(i.id);save();if(edit)startEdit(i.id,true);return i;}
  function newMemo(x,y){add({type:'memo',x:Math.round(x),y:Math.round(y),w:240,title:'',text:''},{edit:true});}
  const center=()=>{const r=wrap.getBoundingClientRect();return toWorld(r.left+r.width/2,r.top+r.height/2);};
  async function addImages(files,at){const imgs=[...files].filter(f=>f.type.startsWith('image/'));if(!imgs.length)return;let p=at||center();
    for(const f of imgs){try{const {data,w,h}=await readImage(f);const width=Math.min(280,Math.max(140,w));add({type:'image',x:Math.round(p.x),y:Math.round(p.y),w:width,src:data,title:f.name.replace(/\.[a-z0-9]+$/i,'').slice(0,80),nw:w,nh:h});p={x:p.x+24,y:p.y+24};}catch(e){say(e.message,true);}}}
  function addLinkPop(){const f=$('.ib-pop');f.innerHTML=`<form class="ib-linkform"><label>링크 주소<input name="u" placeholder="https://…" required></label><label>이름 (선택)<input name="t" placeholder="예: 자기장 시뮬레이션"></label><div class="ib-pop-acts"><button type="button" data-cancel>취소</button><button class="go">넣기</button></div></form>`;
    const b=$('[data-ib="link"]').getBoundingClientRect();place(f,b.left,b.bottom+6);f.querySelector('input').focus();
    f.querySelector('[data-cancel]').onclick=()=>f.classList.remove('show');
    f.querySelector('form').onsubmit=e=>{e.preventDefault();let u=f.querySelector('[name=u]').value.trim();if(!/^[a-z]+:/i.test(u))u='https://'+u;const c=center();add({type:'link',x:Math.round(c.x-125),y:Math.round(c.y-26),w:250,url:u,title:f.querySelector('[name=t]').value.trim().slice(0,120)});f.classList.remove('show');};}

  // ── 메모 쓰기(두 번 눌러) ──
  function startEdit(id,fresh=false){const n=node(id),i=item(id);if(!n||!i)return;editing=id;n.classList.add('editing');
    const parts=i.type==='memo'?[n.querySelector('.ib-mt'),n.querySelector('.ib-mb')]:i.type==='image'?[n.querySelector('.ib-cap')]:i.type==='table'?[...n.querySelectorAll('td')]:[n.querySelector('.ib-lt b')];
    parts.forEach(p=>{p.contentEditable='plaintext-only';if(p.contentEditable!=='plaintext-only')p.contentEditable='true';});
    if(i.type==='memo'){const t=n.querySelector('.ib-mt');t.dataset.ph='제목';n.querySelector('.ib-mb').dataset.ph='생각을 적으세요';(fresh?t:n.querySelector('.ib-mb')).focus();}else parts[0].focus();
    if(!fresh){const s=getSelection(),r=document.createRange();r.selectNodeContents(document.activeElement);r.collapse(false);s.removeAllRanges();s.addRange(r);}}
  function endEdit(){if(!editing)return;const id=editing;editing=null;const n=node(id),i=item(id);if(!n||!i)return;n.classList.remove('editing');n.querySelectorAll('[contenteditable]').forEach(p=>p.removeAttribute('contenteditable'));
    const txt=s=>(n.querySelector(s)?.innerText||'').replace(/ /g,' ').replace(/\n+$/,'');
    let changed=false;const set=(k,v)=>{if((i[k]||'')!==v){if(!changed)snap();changed=true;i[k]=v;}};
    if(i.type==='memo'){set('title',txt('.ib-mt').trim().slice(0,200));set('text',txt('.ib-mb').slice(0,20000));if(!i.title&&!i.text){board.items=board.items.filter(x=>x!==i);board.links=board.links.filter(([a,b])=>a!==id&&b!==id);draw();save();return;}}
    else if(i.type==='table'){const next=[...n.querySelectorAll('tr')].map(tr=>[...tr.children].map(td=>td.innerText.replace(/\u00a0/g,' ').trim().slice(0,500)));if(JSON.stringify(next)!==JSON.stringify(i.cells)){snap();changed=true;i.cells=next;}}
    else if(i.type==='image')set('title',txt('.ib-cap').trim().slice(0,120));else set('title',txt('.ib-lt b').trim().slice(0,120));
    if(changed){drawLinks();save();}}
  el.addEventListener('focusout',e=>{if(!editing)return;const n=node(editing);if(n&&e.relatedTarget&&n.contains(e.relatedTarget))return;setTimeout(()=>{const n2=node(editing);if(n2&&n2.contains(document.activeElement))return;endEdit();},0);});

  // ── 누르기·끌기 ──
  wrap.addEventListener('dblclick',e=>{const n=e.target.closest('.ib-it');if(n){if(!e.target.closest('.ib-open'))startEdit(n.dataset.id);return;}const p=toWorld(e.clientX,e.clientY);newMemo(p.x-20,p.y-14);});
  wrap.addEventListener('pointerdown',e=>{if(e.button!==0)return;closeFloats();el.focus({preventScroll:true});const n=e.target.closest('.ib-it');
    if(linking&&n&&n.dataset.id!==linking){snap();if(!board.links.some(([a,b])=>a===linking&&b===n.dataset.id))board.links.push([linking,n.dataset.id]);linking=null;el.classList.remove('linking');drawLinks();save();e.preventDefault();return;}
    if(linking){linking=null;el.classList.remove('linking');}
    if(!n){if(editing)endEdit();pick(null);const x0=e.clientX,y0=e.clientY,p0={...pan};wrap.setPointerCapture(e.pointerId);wrap.classList.add('panning');
      const mv=ev=>{pan={x:p0.x+ev.clientX-x0,y:p0.y+ev.clientY-y0};live();fit();};const up=()=>{wrap.removeEventListener('pointermove',mv);wrap.removeEventListener('pointerup',up);wrap.classList.remove('panning');};
      wrap.addEventListener('pointermove',mv);wrap.addEventListener('pointerup',up);return;}
    const id=n.dataset.id;if(editing&&editing!==id)endEdit();pick(id);
    if(editing===id||e.target.closest('.ib-open'))return;
    if(n.classList.contains('ib-memo')&&e.target.closest('.ib-mb')&&!n.classList.contains('st-compact'))return;// 메모 글은 글 고르기
    e.preventDefault();const i=item(id),x0=e.clientX,y0=e.clientY,l0=i.x,t0=i.y,s=scale();let moved=false;wrap.setPointerCapture(e.pointerId);
    const mv=ev=>{const dx=(ev.clientX-x0)/s,dy=(ev.clientY-y0)/s;if(!moved&&Math.abs(dx)+Math.abs(dy)<3)return;if(!moved){snap();moved=true;n.classList.add('moving');}i.x=Math.round(l0+dx);i.y=Math.round(t0+dy);n.style.left=i.x+'px';n.style.top=i.y+'px';drawLinks();};
    const up=()=>{wrap.removeEventListener('pointermove',mv);wrap.removeEventListener('pointerup',up);n.classList.remove('moving');if(moved){save();if(zoomMan==null)fit();}};
    wrap.addEventListener('pointermove',mv);wrap.addEventListener('pointerup',up);});
  world.addEventListener('click',e=>{const o=e.target.closest('[data-ib-open]');if(!o)return;const i=item(o.closest('.ib-it').dataset.id);if(i?.url)window.open(i.url,'_blank','noopener');});

  // ── 문항 카드로 보내기 ──
  const SEND={memo:[['passage','지문'],['ask','발문'],['bogi','보기 한 줄'],['ref','근거로 남기기']],image:[['figure','자료 칸에 넣기'],['ref','근거로 남기기']],table:[['table','자료 칸에 표로 넣기']],link:[['ref','근거로 남기기']]};
  const payloadOf=i=>i.type==='table'?{table:i.cells,text:(i.cells||[]).flat().join(' ')}:i.type==='image'?{figure:{name:(i.title||'아이디어 그림').slice(0,200)+(/png/.test(i.src.slice(0,30))?'.png':'.jpg'),data:i.src},text:i.title||''}:i.type==='link'?{text:`${i.title||hostOf(i.url)} ${i.url}`.trim()}:{text:[i.title,i.text].filter(Boolean).join('\n')};
  function send(field,payload){if(!ctx.canSend?.()){ctx.onCard?.();say('문항 카드를 먼저 여세요 · 판 머리의 「문항 카드」',true);return;}if(!payload.text&&!payload.figure&&!payload.table){say('보낼 글이 없습니다.',true);return;}ctx.send?.(field,payload,board);}

  // ── 오른쪽 단추 차림표 ──
  wrap.addEventListener('contextmenu',e=>{const n=e.target.closest('.ib-it');e.preventDefault();if(!n){const p=toWorld(e.clientX,e.clientY);const f=$('.ib-menu');f.innerHTML=`<div class="ib-sec"><button type="button" class="row" data-m="memo">새 메모<small>두 번 누르기</small></button><button type="button" class="row" data-m="image">그림 넣기…</button></div>`;place(f,e.clientX+2,e.clientY+2);
      f.querySelector('[data-m=memo]').onclick=()=>{closeFloats();newMemo(p.x,p.y);};f.querySelector('[data-m=image]').onclick=()=>{closeFloats();file.click();};return;}
    if(editing&&editing!==n.dataset.id)endEdit();const i=item(n.dataset.id);pick(i.id);$('.ib-sel').classList.remove('show');
    const can=ctx.canSend?.();const f=$('.ib-menu');
    f.innerHTML=`<div class="ib-sec"><h5>문항 카드로 보내기${can?'':' · 카드가 닫혀 있음'}</h5>${SEND[i.type].map(([k,t])=>`<button type="button" class="row" data-send="${k}"${can?'':' disabled'}>${t}</button>`).join('')}${can?'':'<button type="button" class="row go" data-m="card">문항 카드 열기</button>'}</div>
      <div class="ib-sec"><h5>모양</h5><div class="ib-styles">${STYLES.map(([k,t])=>`<button type="button" data-style="${k}" aria-pressed="${(i.style||'')===k}"><i class="ib-sw ib-sw-${k||'base'}"></i>${t}</button>`).join('')}</div>
      <h5>색 점</h5><div class="ib-dots">${COLORS.map(c=>`<button type="button" data-color="${c}" aria-pressed="${(i.color||'')===c}" style="${c?`background:${c}`:''}" title="${c?'색 점':'없음'}"></button>`).join('')}</div></div>
      ${i.type==='table'?`<div class="ib-sec"><h5>표</h5><div class="ib-tblops"><button type="button" data-t="r+">＋ 줄</button><button type="button" data-t="c+">＋ 칸</button><button type="button" data-t="r-">− 줄</button><button type="button" data-t="c-">− 칸</button></div></div>`:''}
      <div class="ib-sec"><button type="button" class="row" data-m="link">잇기 시작<small>다음에 누르는 카드로</small></button>${i.type!=='link'?`<button type="button" class="row" data-m="edit">${i.type==='memo'?'고쳐 쓰기':i.type==='table'?'칸에 적기':'이름 고치기'}<small>두 번 누르기</small></button>`:''}<button type="button" class="row" data-m="dup">복제<small>⌘D</small></button><button type="button" class="row danger" data-m="del">지우기<small>⌫</small></button></div>`;
    place(f,e.clientX+2,e.clientY+2);
    f.querySelectorAll('[data-send]').forEach(b=>{b.onmouseenter=()=>app.aim?.(b.dataset.send);b.onmouseleave=()=>app.aim?.(null);b.onclick=()=>{closeFloats();send(b.dataset.send,payloadOf(i));};});
    f.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{const c=i.cells,op=b.dataset.t;snap();if(op==='r+'&&c.length<20)c.push(c[0].map(()=>''));if(op==='c+'&&c[0].length<10)c.forEach(row=>row.push(''));if(op==='r-'&&c.length>1)c.pop();if(op==='c-'&&c[0].length>1)c.forEach(row=>row.pop());closeFloats();draw();save();});
    f.querySelectorAll('[data-style]').forEach(b=>b.onclick=()=>{snap();i.style=b.dataset.style;closeFloats();draw();save();});
    f.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{snap();i.color=b.dataset.color;closeFloats();draw();save();});
    f.querySelector('[data-m="card"]')?.addEventListener('click',()=>{closeFloats();ctx.onCard?.();});
    f.querySelector('[data-m="link"]').onclick=()=>{closeFloats();linking=i.id;el.classList.add('linking');say('이을 카드를 누르세요 · 빈 곳을 누르면 그만둡니다');};
    f.querySelector('[data-m="edit"]')?.addEventListener('click',()=>{closeFloats();startEdit(i.id);});
    f.querySelector('[data-m="dup"]').onclick=()=>{closeFloats();dup(i);};
    f.querySelector('[data-m="del"]').onclick=()=>{closeFloats();remove(i.id);};});
  function dup(i){add({...i,id:undefined,x:i.x+24,y:i.y+24});}
  function remove(id){snap();board.items=board.items.filter(x=>x.id!==id);board.links=board.links.filter(([a,b])=>a!==id&&b!==id);picked=null;draw();save();say('카드를 지웠습니다 · ⌘Z로 되돌리기');}

  // ── 메모 글 고르기 → 위에 뜨는 줄 ──
  document.addEventListener('pointerup',e=>{if(!el.isConnected||e.target.closest?.('.ib-sel'))return;setTimeout(()=>{const s=getSelection(),a=s.anchorNode&&(s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement),f=$('.ib-sel');
    if(!s.isCollapsed&&a&&el.contains(a)&&a.closest('.ib-mb')&&!a.closest('.editing')){selText=s.toString().trim();if(!selText){f.classList.remove('show');return;}const r=s.getRangeAt(0).getBoundingClientRect(),can=ctx.canSend?.();
      f.innerHTML=`<span class="ib-sel-l">고른 글 → 문항 카드</span><i></i>${[['passage','지문'],['ask','발문'],['bogi','보기 한 줄']].map(([k,t])=>`<button type="button" data-send="${k}"${can?'':' disabled title="문항 카드를 열면 보낼 수 있습니다"'}>${t}</button>`).join('')}`;
      place(f,r.left-10,r.top-44);f.querySelectorAll('[data-send]').forEach(b=>{b.onmouseenter=()=>app.aim?.(b.dataset.send);b.onmouseleave=()=>app.aim?.(null);b.onclick=()=>{f.classList.remove('show');send(b.dataset.send,{text:selText});getSelection().removeAllRanges();};});}
    else f.classList.remove('show');},0);});
  $('.ib-sel').addEventListener('pointerdown',e=>e.preventDefault());

  // ── 머리 줄 ──
  el.querySelector('.ib-head').addEventListener('click',e=>{const b=e.target.closest('[data-ib]');if(!b)return;const k=b.dataset.ib;
    if(k==='memo'){const c=center();newMemo(c.x-120,c.y-50);}
    else if(k==='image')file.click();
    else if(k==='link')addLinkPop();
    else if(k==='table'){const c=center();add({type:'table',x:Math.round(c.x-150),y:Math.round(c.y-50),w:300,cells:[['','',''],['','',''],['','','']]},{edit:true});}
    else if(k==='fit'){zoomMan=null;pan={x:0,y:0};live();fit();}
    else if(k==='close'){endEdit();ctx.onClose?.();}
    else if(k==='card')ctx.onCard?.(b);});
  $('.ib-title').addEventListener('dblclick',()=>{const n=$('.ib-name');n.contentEditable='true';n.focus();const r=document.createRange();r.selectNodeContents(n);getSelection().removeAllRanges();getSelection().addRange(r);
    const done=ok=>{n.removeAttribute('contenteditable');const t=n.textContent.trim().slice(0,80);if(ok&&t&&t!==board.title){board.title=t;save();ctx.onRename?.();}n.textContent=board.title;};
    n.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();n.blur();}if(e.key==='Escape'){e.preventDefault();n.onblur=null;done(false);}};n.onblur=()=>done(true);});
  file.onchange=()=>{void addImages(file.files);file.value='';};
  wrap.addEventListener('dragover',e=>{if([...e.dataTransfer.types].some(t=>t==='Files'||t==='text/uri-list'||t==='text/plain')){e.preventDefault();wrap.classList.add('drop');}});
  wrap.addEventListener('dragleave',()=>wrap.classList.remove('drop'));
  wrap.addEventListener('drop',e=>{e.preventDefault();wrap.classList.remove('drop');const p=toWorld(e.clientX,e.clientY);if(e.dataTransfer.files.length){void addImages(e.dataTransfer.files,p);return;}
    const u=e.dataTransfer.getData('text/uri-list')||'',t=e.dataTransfer.getData('text/plain')||'';if(/^https?:\/\//.test(u||t.trim()))add({type:'link',x:Math.round(p.x),y:Math.round(p.y),w:250,url:(u||t).trim().split('\n')[0],title:''});else if(t.trim())add({type:'memo',x:Math.round(p.x),y:Math.round(p.y),w:240,title:'',text:t.slice(0,20000)});});
  document.addEventListener('paste',e=>{if(!el.isConnected||!el.contains(document.activeElement)||editing||document.activeElement.isContentEditable)return;const files=[...e.clipboardData.files];
    if(files.length){e.preventDefault();void addImages(files);return;}const t=e.clipboardData.getData('text/plain');if(!t.trim())return;e.preventDefault();const c=center();
    if(/^https?:\/\/\S+$/.test(t.trim()))add({type:'link',x:Math.round(c.x-125),y:Math.round(c.y),w:250,url:t.trim(),title:''});else add({type:'memo',x:Math.round(c.x-120),y:Math.round(c.y-40),w:240,title:'',text:t.slice(0,20000)});});
  el.addEventListener('keydown',e=>{if(editing){if(e.key==='Escape'){e.preventDefault();endEdit();el.focus();return;}
      if(e.key==='Tab'&&e.target.tagName==='TD'){e.preventDefault();const tds=[...node(editing).querySelectorAll('td')],k=tds.indexOf(e.target)+(e.shiftKey?-1:1);const t=tds[(k+tds.length)%tds.length];t.focus();const rg=document.createRange();rg.selectNodeContents(t);getSelection().removeAllRanges();getSelection().addRange(rg);}return;}if(e.target.closest('input,textarea,[contenteditable]'))return;
    const m=e.metaKey||e.ctrlKey;
    if(m&&e.key.toLowerCase()==='z'&&!e.shiftKey){e.preventDefault();e.stopPropagation();const u=undo.pop();if(u){board.items=u.items;board.links=u.links;picked=null;draw();save();}else say('판에서 되돌릴 것이 없습니다.');return;}
    if(m&&e.key.toLowerCase()==='d'&&picked){e.preventDefault();const i=item(picked);if(i)dup(i);return;}
    if((e.key==='Backspace'||e.key==='Delete')&&picked){e.preventDefault();e.stopPropagation();remove(picked);return;}
    if(e.key==='Enter'&&picked){e.preventDefault();startEdit(picked);return;}
    if(!m&&!e.altKey&&e.key.toLowerCase()==='n'&&!e.isComposing){e.preventDefault();const c=center();newMemo(c.x-120,c.y-50);return;}
    if(e.key==='Escape'){if(linking){linking=null;el.classList.remove('linking');return;}closeFloats();pick(null);}});
  document.addEventListener('pointerdown',e=>{if(!e.target.closest?.('.ib-float'))floats().forEach(f=>{if(!f.classList.contains('ib-sel'))f.classList.remove('show');});},true);

  // ── 붙이기 ──
  function mount(parent,boardId,options={}){const b=(app.data().ideas||[]).find(x=>x.id===boardId);if(!b){parent.textContent='판을 찾지 못했습니다.';return false;}
    if(board?.id!==b.id){if(editing)endEdit();board=b;undo=[];picked=null;zoomMan=null;pan={x:0,y:0};linking=null;}else board=b;
    ctx=options;$('.ib-name').textContent=b.title;
    const cb=$('.ib-card');cb.hidden=!options.cardButton;if(options.cardButton){cb.innerHTML=options.cardButton.html;cb.classList.toggle('on',!!options.cardButton.on);cb.title=options.cardButton.title||'';}
    if(el.parentElement!==parent)parent.append(el);draw();requestAnimationFrame(()=>{drawLinks();fit();});return true;}
  return {el,mount,refresh:()=>{if(board&&el.isConnected){board=(app.data().ideas||[]).find(x=>x.id===board.id)||board;$('.ib-name').textContent=board.title;draw();}},boardId:()=>board?.id||null,endEdit};
}
