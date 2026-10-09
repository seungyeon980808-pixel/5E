import { MemoCloud, DAY } from './cloud.js';
const $ = id => document.getElementById(id);
const board = $('board'), input = $('memo-input'), titleInput = $('memo-title'), save = $('save-button');
const colors = ['lilac','amber','slate','rose'], smallBoard = matchMedia('(max-width:1199px)');
const clamp = (v,min,max) => Math.min(max,Math.max(min,v));
let cloud, ready=false, busy=false, titleOpen=false, owner=false, session=null, maxZ=0;
let entries=[], archiveEntries=[], recentMore=false, archiveMore=false, statusTimer, refreshSerial=0;
let createAttempt=null,attachments=[],attachmentsReady=false,mediaEpoch=0,viewerNote=null;
const mediaCache=new Map();
const pending = new Map(), cards = new Map();
const config = window.MEMO_CONFIG || {};
const storageKey = '5e-memo-drafts-v1:' + (config.apiUrl || 'unconfigured');
function now() { return cloud ? cloud.now() : Date.now(); }
function recent(e) { return e.created + DAY > now(); }
function announce(message,error=false) {
  clearTimeout(statusTimer); $('status').textContent=message; $('status').className='status visible'+(error?' error':'');
  statusTimer=setTimeout(()=>$('status').classList.remove('visible'),4000);
}
function connection(text,state='ready',retry=false) {
  $('connection-text').textContent=text; $('connection').dataset.state=state; $('retry-button').hidden=!retry;
}
function persist() {
  try { localStorage.setItem(storageKey,JSON.stringify({draft:input.value,title:titleInput.value,titleOpen,createAttempt,
    pending:[...pending].map(([id,p])=>[id,{patch:{...p.sent,...p.patch},version:p.version}])})); }
  catch { announce('작성 중인 내용을 브라우저에 임시 저장할 수 없어요.',true); }
}
try {
  const stored=JSON.parse(localStorage.getItem(storageKey)||'null');
  if(stored) { input.value=typeof stored.draft==='string'?stored.draft:''; titleInput.value=typeof stored.title==='string'?stored.title:'';
    titleOpen=!!stored.titleOpen; createAttempt=stored.createAttempt;
    for(const [id,p] of stored.pending||[]) pending.set(id,{...p,paused:true,inFlight:false}); }
} catch {}
function icon(name) {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('class','icon'); svg.setAttribute('aria-hidden','true');
  const use=document.createElementNS('http://www.w3.org/2000/svg','use'); use.setAttribute('href','#i-'+name); svg.append(use); return svg;
}
function iconButton(name,label,fn) {
  const button=document.createElement('button'); button.type='button'; button.className='icon-button'; button.setAttribute('aria-label',label); button.title=label;
  button.append(icon(name)); button.addEventListener('click',fn); return button;
}
function titleState() {
  $('title-row').hidden=!titleOpen; $('title-toggle').setAttribute('aria-expanded',String(titleOpen));
  $('title-toggle').replaceChildren(icon(titleOpen?'close':'plus'),document.createTextNode(titleOpen?'제목 접기':'제목 추가'));
}
function syncButton() { save.disabled=!ready||busy||!attachmentsReady||(!input.value.trim()&&!attachments.length); save.firstChild.textContent=busy?'저장 중…':'저장'; $('add-sticky').disabled=!ready||busy; $('attach-image').disabled=busy||!attachmentsReady; }
function ageText(created) {
  const m=Math.max(0,Math.floor((now()-created)/60000));
  return m<1?'방금':m<60?m+'분 전':m<1440?Math.floor(m/60)+'시간 전':Math.floor(m/1440)+'일 전';
}
function remainingText(created) { return Math.min(24,Math.max(1,Math.ceil((created+DAY-now())/3600000)))+'시간 남음'; }
async function copyNote(note,button) {
  try {
    await navigator.clipboard.writeText(note.title.trim()?note.title.trim()+'\n'+note.body:note.body);
    const prev=[...button.childNodes].map(n=>n.cloneNode(true)); button.replaceChildren(icon('check'));
    if(button.classList.contains('sticky-copy')) button.append(document.createTextNode('복사됨'));
    button.setAttribute('data-copied',''); announce('메모를 복사했어요.');
    setTimeout(()=>{button.replaceChildren(...prev);button.removeAttribute('data-copied');},1500);
  } catch { announce('복사를 허용하거나 메모를 직접 선택해 복사해 주세요.',true); }
}
function renderList(target,items,isArchive=false) {
  unwatchMedia(target);target.replaceChildren();
  if(!items.length) { const empty=document.createElement('li');empty.className='empty';empty.textContent=isArchive?'아직 보관된 메모가 없어요.':ready?'위에 첫 메모를 적어보세요.':'메모를 불러오는 중이에요.';target.append(empty); }
  for(const note of items) {
    const item=document.createElement('li');item.className='note';item.dataset.id=note.id;
    const text=document.createElement('div');text.className='note-text';
    if(note.title) { const h=document.createElement('h3');h.className='note-title';h.textContent=note.title;text.append(h); }
    const body=document.createElement('div');body.className='note-body';
    let url;try { const u=new URL(note.body.trim());if(['http:','https:'].includes(u.protocol)&&! /\s/.test(note.body.trim())) url=u; } catch {}
    if(url) { const a=document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=note.body;body.append(a); }else body.textContent=note.body;
    const meta=document.createElement('div');meta.className='note-meta';
    meta.textContent=ageText(note.created)+(isArchive?' · '+(note.kind==='sticky'?'포스트잇':'메모'):' · '+remainingText(note.created));
    text.append(body);addNoteMedia(note,text);text.append(meta);
    const actions=document.createElement('div');actions.className='note-actions';
    if(!isArchive) { const pin=iconButton('note','포스트잇으로 꺼내기',()=>addSticky(note));pin.classList.add('pin-note');actions.append(pin); }
    const copy=iconButton('copy',(note.title||note.body)+' 복사',()=>copyNote(note,copy));copy.classList.add('copy');if(note.title||note.body)actions.append(copy);
    item.append(text,actions);target.append(item);
  }
}
function renderNotes() {
  const list=entries.filter(e=>e.kind==='memo'&&recent(e)).sort((a,b)=>b.created-a.created);
  $('note-count').textContent=list.length;renderList($('notes'),list);$('recent-more').hidden=!recentMore;
}
function renderArchive() {
  const signedIn=!!session;
  $('archive-account').hidden=!signedIn; $('account-email').textContent=session?.user?.email||'';
  $('google-button').hidden=signedIn; $('archive-notes').hidden=!owner; $('archive-more').hidden=!owner||!archiveMore;
  $('archive-message').textContent=owner?'24시간이 지난 메모와 포스트잇을 모아두었어요.':signedIn?'이 계정은 주인장이 아니어서 보관함을 열 수 없어요.':'24시간이 지난 메모는 주인장 보관함에서 확인하세요.';
  if(owner) renderList($('archive-notes'),archiveEntries,true);else $('archive-notes').replaceChildren();
}
function renderAll() {
  pruneMedia();renderNotes();
  const visible=entries.filter(e=>e.kind==='sticky'&&recent(e)); const ids=new Set(visible.map(e=>e.id));
  for(const [id,{card,observer}] of cards) if(!ids.has(id)){observer.disconnect();unwatchMedia(card);card.remove();cards.delete(id);}
  for(const note of visible) {
    maxZ=Math.max(maxZ,note.z); let view=cards.get(note.id);
    if(!view) view=renderSticky(note);
    else {
      view.note=note;const {card,heading,body}=view;
      if(document.activeElement!==heading) heading.value=note.title;
      if(document.activeElement!==body) body.value=note.body;
      card.dataset.color=note.color;card.style.zIndex=note.z+10;card.style.setProperty('--tilt',note.tilt+'deg');card.setAttribute('aria-label','포스트잇: '+(note.title||'제목 없음'));positionSticky(note,card);
      card.querySelector('.sticky-age').textContent=remainingText(note.created);updateStickyMedia(note,view);
    }
  }
  layoutStickies();renderArchive();
}
function merge(rows,append=false) {
  const current=new Map(entries.map(e=>[e.id,e])); const next=append?[...entries]:[];
  for(const row of rows) {
    const existing=current.get(row.id);const p=pending.get(row.id);
    if(existing) {
      // Keep an active local edit visible. The version used by its write remains fixed.
      const dragging=cards.get(row.id)?.card.classList.contains('dragging');
      const position=dragging?{x:existing.x,y:existing.y}:{};
      Object.assign(existing,row,p?.sent||{},p?.patch||{},position); if(!next.includes(existing))next.push(existing);
    } else next.push({...row,...(p?.patch||{})});
  }
  entries=next;
}
async function refresh(append=false) {
  if(!cloud)return false;
  const serial=++refreshSerial;
  try {
    const last=entries.at(-1); const result=await cloud.snapshot(false,append&&last?{id:last.id,created_at:last.created_at}:null);
    if(serial!==refreshSerial)return false;
    ready=true;owner=result.owner;recentMore=result.more;merge(result.entries,append);
    if(owner&&!$('archive-view').hidden) await loadArchive(false);
    if(!owner){archiveEntries=[];archiveMore=false;}
    renderAll();syncButton();updateConnection();return true;
  } catch { if(serial!==refreshSerial)return false;connection('연결이 끊겼어요. 작성 중인 내용은 남아 있어요.','error',true);syncButton();return false; }
}
function updateConnection() {
  if(pending.size)connection([...pending.values()].some(p=>p.paused)?'저장하지 못한 포스트잇 수정이 있어요.':'포스트잇 저장 중…', [...pending.values()].some(p=>p.paused)?'error':'loading',[...pending.values()].some(p=>p.paused));
  else connection('모든 기기에서 같은 메모');
}
async function loadArchive(append) {
  const last=archiveEntries.at(-1);const authUser=session?.user?.id;
  const result=await cloud.snapshot(true,append&&last?{id:last.id,created_at:last.created_at}:null);
  if(authUser!==session?.user?.id||!owner)return;
  archiveEntries=append?[...archiveEntries,...result.entries]:result.entries;archiveMore=result.more;renderArchive();
}
function mutationError(error) {
  return error.code==='40001'?'다른 기기에서 수정한 메모예요. 내 수정을 다시 저장하려면 다시 시도를 누르세요.':error.code==='42501'?'24시간이 지나 주인장 보관함으로 이동했어요.':error.code==='P0002'?'다른 기기에서 삭제한 메모예요.':'저장하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.';
}
function queue(note,patch) {
  Object.assign(note,patch);
  let p=pending.get(note.id);
  if(!p){p={patch:{},version:note.version,paused:false,inFlight:false};pending.set(note.id,p);}
  Object.assign(p.patch,patch);persist();updateConnection();
  clearTimeout(p.timer);p.timer=setTimeout(()=>flush(note.id),450);
}
async function flush(id) {
  const p=pending.get(id);if(!p||p.inFlight||p.paused||!cloud)return;
  const patch=p.patch;p.sent=patch;p.patch={};p.inFlight=true;persist();
  try {
    const updated=await cloud.update(id,p.version,patch);p.version=updated.version;
    const note=entries.find(e=>e.id===id);if(note)Object.assign(note,updated,p.patch);
    if(!Object.keys(p.patch).length)pending.delete(id);
    p.sent=null;p.inFlight=false;persist();renderAll();updateConnection();if(pending.has(id))flush(id);
  } catch(error) {
    p.patch={...patch,...p.patch};p.sent=null;p.inFlight=false;p.paused=true;persist();announce(mutationError(error),true);updateConnection();
    if(error.code==='42501'||error.code==='P0002'){pending.delete(id);persist();await refresh();}
  }
}
function positionSticky(note,card) {
  if(smallBoard.matches)return;
  card.style.left=10+note.x*Math.max(0,board.clientWidth-card.offsetWidth-20)+'px';
  card.style.top=10+note.y*Math.max(0,board.clientHeight-card.offsetHeight-20)+'px';
}
function setPosition(note,card,left,top) {
  note.x=clamp((left-10)/Math.max(1,board.clientWidth-card.offsetWidth-20),0,1);
  note.y=clamp((top-10)/Math.max(1,board.clientHeight-card.offsetHeight-20),0,1);positionSticky(note,card);
}
function renderSticky(note) {
  const card=document.createElement('article');card.className='sticky';card.dataset.id=note.id;card.dataset.color=note.color;
  card.style.setProperty('--tilt',note.tilt+'deg');card.style.zIndex=note.z+10;card.setAttribute('aria-label','포스트잇: '+(note.title||'제목 없음'));
  const view={note,card};cards.set(note.id,view);
  const bar=document.createElement('div');bar.className='sticky-bar';
  const handle=document.createElement('button');handle.type='button';handle.className='drag-handle';handle.append(icon('grip'),document.createTextNode('포스트잇'));handle.setAttribute('aria-label','포스트잇 이동');
  const color=iconButton('note','포스트잇 색상 바꾸기',()=>{queue(view.note,{color:colors[(colors.indexOf(view.note.color)+1)%4]});card.dataset.color=view.note.color;});
  color.replaceChildren();const dot=document.createElement('span');dot.className='color-dot';dot.setAttribute('aria-hidden','true');color.append(dot);
  const remove=iconButton('close','포스트잇 삭제',async()=>{
    remove.disabled=true;
    try {const p=pending.get(note.id);if(p){p.paused=false;await flush(note.id);if(pending.has(note.id))throw Error('pending');}
      await cloud.delete(note.id,view.note.version);entries=entries.filter(e=>e.id!==note.id);renderAll();announce('포스트잇을 지웠어요.');$('add-sticky').focus({preventScroll:true});}
    catch(error){announce(mutationError(error),true);remove.disabled=false;await refresh();}
  });
  bar.append(handle,color,remove);
  const heading=document.createElement('input');heading.className='sticky-title';heading.type='text';heading.placeholder='제목 (선택)';heading.maxLength=160;heading.value=note.title;heading.setAttribute('aria-label','포스트잇 제목 (선택)');
  const body=document.createElement('textarea');body.className='sticky-body';body.rows=3;body.maxLength=100000;body.placeholder='생각을 놓아두세요.';body.value=note.body;body.spellcheck=false;body.setAttribute('aria-label','포스트잇 메모');
  view.heading=heading;view.body=body;
  heading.addEventListener('input',()=>{queue(view.note,{title:heading.value});card.setAttribute('aria-label','포스트잇: '+(heading.value||'제목 없음'));});
  body.addEventListener('input',()=>{queue(view.note,{body:body.value});updateStickyMedia(view.note,view);});
  const footer=document.createElement('footer');footer.className='sticky-footer';
  const age=document.createElement('span');age.className='sticky-age';age.textContent=remainingText(note.created);
  const copy=document.createElement('button');copy.type='button';copy.className='sticky-copy';copy.append(icon('copy'),document.createTextNode('복사'));copy.addEventListener('click',()=>copyNote(view.note,copy));footer.append(age,copy);
  const media=document.createElement('div');media.className='sticky-media';view.media=media;
  card.append(bar,heading,body,media,footer);updateStickyMedia(note,view);$('stickies').append(card);positionSticky(note,card);
  function bringForward(){queue(view.note,{z:++maxZ});card.style.zIndex=view.note.z+10;}
  card.addEventListener('pointerdown',bringForward);card.addEventListener('focusin',bringForward);
  let drag;
  handle.addEventListener('pointerdown',event=>{
    if(smallBoard.matches||event.button!==0||drag)return;
    event.preventDefault();handle.focus({preventScroll:true});drag={pointer:event.pointerId,x:event.clientX,y:event.clientY,left:card.offsetLeft,top:card.offsetTop};
    handle.setPointerCapture(event.pointerId);card.classList.add('dragging');
  });
  handle.addEventListener('pointermove',event=>{if(drag?.pointer===event.pointerId)setPosition(view.note,card,drag.left+event.clientX-drag.x,drag.top+event.clientY-drag.y);});
  function endDrag(){if(!drag)return;drag=null;card.classList.remove('dragging');queue(view.note,{x:view.note.x,y:view.note.y});}
  handle.addEventListener('pointerup',endDrag);handle.addEventListener('pointercancel',endDrag);handle.addEventListener('lostpointercapture',endDrag);window.addEventListener('blur',endDrag);
  handle.addEventListener('keydown',event=>{
    if(smallBoard.matches||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();const step=event.shiftKey?40:12;
    setPosition(view.note,card,card.offsetLeft+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0),card.offsetTop+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0));queue(view.note,{x:view.note.x,y:view.note.y});
  });
  view.observer=new ResizeObserver(()=>positionSticky(view.note,card));view.observer.observe(card);return view;
}
async function addSticky(source) {
  if(!ready||busy)return;
  if(source&&!recent(source)){await refresh();announce('24시간이 지나 보관함으로 이동했어요.');return;}
  busy=true;syncButton();renderAttachments();
  const n=entries.filter(e=>e.kind==='sticky').length,slots=[[.08,.15],[.87,.10],[.04,.66],[.88,.68],[.2,.03],[.64,.76]],slot=slots[n%slots.length];
  const patch={kind:'sticky',color:colors[n%4],x:clamp(slot[0]+n%3*.025,.01,.98),y:clamp(slot[1]+n%3*.035,.01,.98),tilt:n%2?2:-2,z:++maxZ};
  try {
    const result=source?await cloud.update(source.id,source.version,patch):await cloud.create(crypto.randomUUID(),{...patch,title:'',body:''});
    const existing=entries.find(e=>e.id===result.id);if(existing)Object.assign(existing,result);else entries.unshift(result);
    renderAll();const card=cards.get(result.id)?.card;
    if(card){if(smallBoard.matches)card.scrollIntoView({block:'center',behavior:'instant'});card.querySelector('.sticky-body').focus({preventScroll:true});}
    announce(source?'메모를 포스트잇으로 꺼냈어요.':'새 포스트잇을 붙였어요.');
  } catch(error){announce(mutationError(error),true);connection('포스트잇을 저장하지 못했어요.','error',true);}
  finally{busy=false;syncButton();renderAttachments();}
}
function layoutStickies() {
  for(const {card,note} of cards.values())positionSticky(note,card);
  $('move-hint').textContent=smallBoard.matches?'포스트잇을 눌러 바로 편집하세요.':'포스트잇 윗부분을 잡아 자유롭게 옮기세요.';
  for(const h of document.querySelectorAll('.drag-handle')){h.disabled=smallBoard.matches;h.title=smallBoard.matches?'넓은 화면에서 자유롭게 옮길 수 있어요.':'드래그로 이동 · 방향키로 조금씩 이동';}
}
let imageDB;
async function draftDB(){
  if(!imageDB)imageDB=new Promise((resolve,reject)=>{const r=indexedDB.open('5e-memo-image-drafts',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return imageDB;
}
let imageDraftWrites=Promise.resolve();
function saveImageDraft(){
  const selected=attachments.map(a=>({id:a.id,file:a.file}));
  imageDraftWrites=imageDraftWrites.catch(()=>{}).then(async()=>{
    const images=await Promise.all(selected.map(async a=>({id:a.id,type:a.file.type,bytes:await a.file.arrayBuffer()})));
    const db=await draftDB();await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');if(images.length)tx.objectStore('drafts').put(images,storageKey);else tx.objectStore('drafts').delete(storageKey);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
  }).catch(()=>{if(selected.length)announce('이미지 임시 저장이 안 됐어요. 이 탭에서 메모를 저장해 주세요.',true);});
  return imageDraftWrites;
}

async function restoreImageDraft(){
  try{const db=await draftDB(),stored=await new Promise((resolve,reject)=>{const r=db.transaction('drafts').objectStore('drafts').get(storageKey);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});for(const a of (stored||[]).slice(0,4)){const file=a.bytes instanceof ArrayBuffer?new Blob([a.bytes],{type:a.type}):a.file;if(file instanceof Blob&&file.size<=5000000)attachments.push({id:a.id,file,url:URL.createObjectURL(file)});}}
  catch{/* Pasting still works without persistent browser storage. */}
  attachmentsReady=true;renderAttachments();syncButton();
}
function renderAttachments(){
  const target=$('draft-images');target.replaceChildren();target.hidden=!attachments.length;
  for(const [index,a] of attachments.entries()){
    const frame=document.createElement('div');frame.className='draft-image';const image=document.createElement('img');image.src=a.url;image.alt='첨부할 이미지 '+(index+1);
    const remove=iconButton('close','첨부 이미지 '+(index+1)+' 제거',()=>{URL.revokeObjectURL(a.url);attachments=attachments.filter(other=>other.id!==a.id);renderAttachments();saveImageDraft();syncButton();input.focus();});remove.disabled=busy;frame.append(image,remove);target.append(frame);
  }
}
async function attachFiles(files){
  if(busy||!attachmentsReady)return;
  for(const file of files){
    if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)){announce('PNG, JPEG, WebP, GIF 이미지를 넣어 주세요.',true);continue;}
    if(file.size>5000000){announce('이미지는 한 장당 5MB까지 넣을 수 있어요.',true);continue;}
    if(attachments.length>=4){announce('한 메모에 이미지는 4장까지 넣을 수 있어요.',true);break;}
    attachments.push({id:crypto.randomUUID(),file,url:URL.createObjectURL(file)});
  }renderAttachments();saveImageDraft();syncButton();input.focus();
}
$('memo-form').addEventListener('paste',event=>{const files=[...(event.clipboardData?.items||[])].filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean);if(files.length){event.preventDefault();attachFiles(files);}});
$('attach-image').addEventListener('click',()=>$('image-input').click());
$('image-input').addEventListener('change',event=>{attachFiles([...event.target.files]);event.target.value='';});
$('memo-form').addEventListener('dragover',event=>{if([...event.dataTransfer.items].some(item=>item.kind==='file'))event.preventDefault();});
$('memo-form').addEventListener('drop',event=>{if(event.dataTransfer.files.length){event.preventDefault();attachFiles([...event.dataTransfer.files]);}});
const mediaObserver=new IntersectionObserver(records=>{for(const r of records)if(r.isIntersecting){mediaObserver.unobserve(r.target);r.target.loadMemoMedia?.();}},{rootMargin:'120px'});
function unwatchMedia(target){for(const node of target.querySelectorAll('.note-media'))mediaObserver.unobserve(node);}
function clearMedia(){
  mediaEpoch++;for(const cached of mediaCache.values())if(cached.url)URL.revokeObjectURL(cached.url);mediaCache.clear();for(const view of cards.values())view.mediaSignature=null;
  if($('media-viewer').open)$('media-viewer').close();$('viewer-image').removeAttribute('src');viewerNote=null;
}
function pruneMedia(){
  for(const [key,cached] of mediaCache)if(!owner&&cached.expires<=now()){if(cached.url)URL.revokeObjectURL(cached.url);mediaCache.delete(key);}
  if(viewerNote&&!owner&&!recent(viewerNote)){$('media-viewer').close();$('viewer-image').removeAttribute('src');viewerNote=null;}
}
function firstLink(text){const match=text.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[),.;!?\]}]+$/,'');try{const u=new URL(match);u.hash='';return u.href;}catch{return null;}}
function cachedMedia(key,note,load){
  let cached=mediaCache.get(key);if(cached)return cached.promise;const epoch=mediaEpoch;cached={expires:note.created+DAY};mediaCache.set(key,cached);
  cached.promise=load().then(result=>{if(epoch!==mediaEpoch||(!owner&&!recent(note)))throw Error('Media access changed');if(result?.blob)cached.url=URL.createObjectURL(result.blob);return {...result,src:cached.url};}).catch(error=>{if(mediaCache.get(key)===cached)mediaCache.delete(key);throw error;});return cached.promise;
}
function openImage(note,src){if(!owner&&!recent(note))return;viewerNote=note;$('viewer-image').src=src;$('media-viewer').showModal();}
$('close-media').addEventListener('click',()=>$('media-viewer').close());
$('media-viewer').addEventListener('close',()=>{$('viewer-image').removeAttribute('src');viewerNote=null;});
function addNoteMedia(note,target){
  for(const [index,id] of (note.image_ids||[]).entries()){
    const button=document.createElement('button');button.type='button';button.className='note-media image-attachment';button.setAttribute('aria-label','첨부 이미지 '+(index+1)+' 크게 보기');button.textContent='이미지 불러오는 중…';const epoch=mediaEpoch;
    button.loadMemoMedia=async()=>{
      try{const data=await cachedMedia('image:'+id,note,async()=>({blob:await cloud.media('/images/'+id)}));if(!button.isConnected||epoch!==mediaEpoch)return;
        const image=document.createElement('img');image.src=data.src;image.alt='첨부 이미지 '+(index+1);image.decoding='async';button.replaceChildren(image);button.onclick=()=>openImage(note,data.src);
      }catch{if(button.isConnected){button.textContent='이미지 다시 불러오기';button.onclick=()=>button.loadMemoMedia();}}
    };target.append(button);mediaObserver.observe(button);
  }
  const url=firstLink(note.body);if(!url)return;const frame=document.createElement('div');frame.className='note-media link-media preview-pending';target.append(frame);const epoch=mediaEpoch;
  frame.loadMemoMedia=async()=>{
    try{const data=await cachedMedia('link:'+note.id+':'+url,note,async()=>{const info=await cloud.preview(note.id);if(!info||info.url!==url)return null;return {...info,blob:await cloud.media('/entries/'+note.id+'/thumbnail')};});
      if(!frame.isConnected||epoch!==mediaEpoch)return;if(!data?.src){frame.remove();return;}
      const link=document.createElement('a');link.className='link-preview';link.href=url;link.target='_blank';link.rel='noopener noreferrer';
      const image=document.createElement('img');image.src=data.src;image.alt='';image.decoding='async';image.onerror=()=>frame.remove();
      const text=document.createElement('span'),title=document.createElement('strong'),domain=document.createElement('span');title.textContent=data.title||new URL(url).hostname;domain.textContent=new URL(url).hostname;text.append(title,domain);link.append(image,text);frame.classList.remove('preview-pending');frame.append(link);
    }catch{frame.remove();}
  };mediaObserver.observe(frame);
}
function updateStickyMedia(note,view){const signature=JSON.stringify([note.image_ids,firstLink(note.body)]);if(view.mediaSignature===signature)return;view.mediaSignature=signature;unwatchMedia(view.media);view.media.replaceChildren();addNoteMedia(note,view.media);}

$('title-toggle').addEventListener('click',()=>{titleOpen=!titleOpen;titleState();persist();(titleOpen?titleInput:input).focus();});
input.addEventListener('input',()=>{syncButton();persist();});titleInput.addEventListener('input',persist);
$('memo-form').addEventListener('submit',async event=>{
  event.preventDefault();if(!ready||busy||!attachmentsReady||(!input.value.trim()&&!attachments.length))return;
  const submittedBody=input.value,submittedTitle=titleInput.value,submittedImages=[...attachments];
  const body=submittedBody.trim(),title=submittedTitle.trim(),signature=JSON.stringify([title,body,submittedImages.map(a=>a.id)]);
  if(createAttempt?.signature!==signature)createAttempt={id:crypto.randomUUID(),signature};persist();busy=true;syncButton();renderAttachments();
  try {
    for(const image of submittedImages)await cloud.upload(image.id,image.file);
    const result=await cloud.create(createAttempt.id,{kind:'memo',title,body,image_ids:submittedImages.map(a=>a.id)});
    if(!entries.some(e=>e.id===result.id))entries.unshift(result);
    if(input.value===submittedBody && titleInput.value===submittedTitle){input.value='';titleInput.value='';titleOpen=false;}
    for(const image of submittedImages){URL.revokeObjectURL(image.url);attachments=attachments.filter(a=>a.id!==image.id);}renderAttachments();saveImageDraft();
    createAttempt=null;titleState();persist();renderNotes();announce('메모를 저장했어요.');input.focus({preventScroll:true});updateConnection();
  } catch(error){announce(error.code==='IMAGE_TOO_LARGE'?'이미지는 한 장당 5MB까지 넣을 수 있어요.':error.code==='IMAGE_TYPE'?'PNG, JPEG, WebP, GIF 이미지를 넣어 주세요.':mutationError(error),true);connection('메모를 저장하지 못했어요. 입력 내용은 남아 있어요.','error',true);}
  finally{busy=false;syncButton();renderAttachments();}
});
$('memo-form').addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter'&&!event.isComposing){event.preventDefault();if(!save.disabled)$('memo-form').requestSubmit();}});
if(!/Mac|iPhone|iPad/.test(navigator.platform))$('mod-key').textContent='Ctrl';
$('add-sticky').addEventListener('click',()=>addSticky());
$('archive-toggle').addEventListener('click',async()=>{
  const opening=$('archive-toggle').getAttribute('aria-expanded')!=='true';$('archive-toggle').setAttribute('aria-expanded',String(opening));
  $('recent-view').hidden=opening;$('archive-view').hidden=!opening;
  $('archive-toggle').replaceChildren(icon(opening?'back':'archive'),document.createTextNode(opening?'메모로':'보관함'));
  $('desk-title').replaceChildren(icon(opening?'archive':'note'),document.createTextNode(opening?'주인장 보관함':'빠른 메모'));renderArchive();
  if(opening&&owner)try{await loadArchive(false);}catch{announce('보관함을 불러오지 못했어요. 다시 시도해 주세요.',true);}
});
$('logout-button').addEventListener('click',()=>{cloud?.logout();window.google?.accounts.id.disableAutoSelect();refresh();});
$('recent-more').addEventListener('click',()=>refresh(true));
$('archive-more').addEventListener('click',async()=>{try{await loadArchive(true);}catch{announce('보관된 메모를 더 불러오지 못했어요.',true);}});
$('retry-button').addEventListener('click',async()=>{
  $('retry-button').disabled=true;
  try {
    if(!await refresh())return;
    for(const [id,p] of pending){const e=entries.find(e=>e.id===id);if(!e){pending.delete(id);continue;}p.version=e.version;p.paused=false;await flush(id);}
    persist();updateConnection();
  } finally { $('retry-button').disabled=false; }
});
new ResizeObserver(layoutStickies).observe(board);smallBoard.addEventListener('change',layoutStickies);
window.addEventListener('online',()=>refresh());window.addEventListener('focus',()=>refresh());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
window.addEventListener('beforeunload',event=>{persist();if(pending.size||busy){event.preventDefault();event.returnValue='';}});
restoreImageDraft();titleState();syncButton();renderAll();
setInterval(()=>{renderAll();if(!document.hidden)refresh();},5000);
function authState(user){
  if(session?.user?.id===user?.id&&session?.user?.expires_at===user?.expires_at)return;
  clearMedia();session=user?{user}:null;owner=false;archiveEntries=[];archiveMore=false;renderArchive();
}
async function setupGoogle(){
  try{
    await new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
      const timeout=setTimeout(()=>reject(Error('Google login timeout')),15000);
      script.onload=()=>{clearTimeout(timeout);resolve();};script.onerror=()=>{clearTimeout(timeout);reject(Error('Google login unavailable'));};document.head.append(script);
    });
    window.google.accounts.id.initialize({client_id:config.googleClientId,auto_select:false,callback:async response=>{
      try{await cloud.login(response.credential);await refresh();announce('Google 계정으로 로그인했어요.');}
      catch{announce('Google 로그인을 확인하지 못했어요. 다시 로그인해 주세요.',true);}
    }});
    $('google-button').replaceChildren();
    window.google.accounts.id.renderButton($('google-button'),{type:'standard',theme:'filled_black',size:'medium',text:'signin_with',shape:'pill',locale:'ko',width:180});
  }catch{
    const button=document.createElement('button');button.className='google';button.type='button';button.textContent='Google 로그인 다시 연결';button.addEventListener('click',()=>{button.disabled=true;setupGoogle();});$('google-button').replaceChildren(button);
  }
}
async function initialize() {
  let url;try{url=new URL(config.apiUrl);}catch{}
  if(!url||url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||! /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(config.googleClientId||'')){
    connection('메모 연결을 준비 중이에요.','error');return;
  }
  cloud=new MemoCloud(config,authState);await refresh();setupGoogle();
}
initialize().catch(()=>connection('메모 연결을 확인하지 못했어요. 새로고침해 주세요.','error',true));
