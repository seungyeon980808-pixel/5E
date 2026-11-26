// 1.8.0 출제 하네스 화면(iframe). 시안 v8(11-24 승인)의 흐름: 시작(꼭 묻기) → 설계표 → 초안(문항 = 하위 세션) → 코멘트 대장 → 문항 대화
// → 「반영해」 → 판 v0.x(정답 배열·개수·배점 합) → 두 모델 풀이 → 한글에서 고친 판 차이 보고 → 조판(exam으로) → v1.0 선언.
// 원칙: 고치라는 뜻이 분명할 때만 고친다. AI가 낸 것은 모두 「제안」이고, 반영은 교사 말(wantsApply)이나 단추로만 한다.
// 빈 칸을 처음 채우는 것(설계표 빈 행, 초안)은 알아서 하고 보여 준다(결정 7 가정).
import * as X from './model/examset.js';
import {buildExamsetFile,parseExamsetFile} from './model/file.js';
import {hwpxText,diffAgainst} from './model/hwpx.js';
import {newQuestion,applyForm,clone,block} from '../exampool/sheet/model.js';
import {explanationParts} from '../exampool/sheet/explanation.js';
import {proposalChanges,ensureAuthoring,recordReview} from '../exampool/authoring/session.js';
import {applyChanges,checkAnswerStructure} from '../exampool/authoring/contract.js';
import {buildSheetProject,readSheetFile} from '../exampool/sheet/sheet-file.js';
import {peekKind} from './model/file.js';
import {readFolder,searchFolder,folderPrompt,ocrImages} from './folder.js';
import {parseExamResponse,buildExamPrompt,wantsApply,wantsDiscussOnly,wantsDraft,wantsFinal,wantsSolve,parseSolve,buildSolvePrompt,verdict} from './ai.js';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const FILE_MODE=location.protocol==='file:',OWN=FILE_MODE?'*':location.origin;
const CIRCLED='①②③④⑤',FORM_TYPE={combo:'합답형',single:'객관식',pair:'객관식',talk:'객관식',essay:'서술형'};
const SOLVERS=[{model:'gpt-6.1-sol',label:'GPT-6.1-Sol'},{model:'gpt-6-astra',label:'GPT-6-Astra',fallback:['gpt-6-luna']}];// 결정 4 가정: Codex 안 두 모델, 「한 회사 두 모델」. 완주 1: astra가 429로 막혀 대신 luna
const toast=(t,ms=2200)=>{const e=$('#toast');e.textContent=t;e.classList.add('on');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('on'),ms);};
const nowIso=()=>new Date().toISOString();
let work=null,tab='plan',sub=null,busy=0,drafting=null;
const log=[];// 화면 사건 기록(검진용): window.__harnessLog
window.__harnessLog=log;const note=(kind,data={})=>{log.push({at:nowIso(),kind,...data});if(log.length>500)log.shift();};

// ── 본창과 주고받기 ──
const pending=new Map();
const post=msg=>window.parent.postMessage({channel:'5e-harness',...msg},OWN);
function call(action,payload,{onProgress,group}={}){const requestId=crypto.randomUUID();return new Promise((resolve,reject)=>{pending.set(requestId,{resolve,reject,onProgress,action,group});post({action,requestId,...payload});})
  .then(r=>{if(['turn','author'].includes(action))setAI('ok');return r;},e=>{if(e.need)setAI(e.need);throw e;});}
// 멈추기(시안7 1번): 그 묶음의 진행 중 요청을 본창에 취소로 알리고, 여기서도 바로 끝낸다.
function cancelGroup(group){let n=0;for(const [id,p] of pending)if(p.group===group){post({action:'cancel',requestId:id});pending.delete(id);p.reject(Object.assign(Error('멈춤'),{cancelled:true}));n++;}note('stop',{group,n});return n;}
addEventListener('message',e=>{if(e.source!==window.parent||e.data?.channel!=='5e-harness')return;const m=e.data;
  if(m.action==='theme'){document.documentElement.dataset.theme=m.theme==='light'?'light':'dark';document.documentElement.dataset.palette=m.palette==='graphite'?'graphite':'classic';if(m.pref)colorPref=m.pref;markTheme();return;}
  if(m.action==='tool-opened'){document.body.classList.add('tool-on');curTool=m.tool||curTool;return;}if(m.action==='tool-back'){document.body.classList.remove('tool-on');$$('.side .nav').forEach(n=>n.classList.remove('on'));showView(pristine(work)?'home':'work');return;}if(m.action==='tool-closed'){document.body.classList.remove('tool-on');$$('.side .nav').forEach(n=>n.classList.remove('on'));return;}
  if(m.action==='evidence-ready'){const p=pending.get(m.requestId);if(p){pending.delete(m.requestId);p.resolve(m.result);}return;}
  if(m.action==='author-progress'){pending.get(m.requestId)?.onProgress?.(m.progress);return;}
  if(m.action==='library-picked'){if(m.error)toast('라이브러리를 열지 못했어요: '+m.error);if(m.items?.length){const got=m.items.filter(x=>/^data:image\//.test(x.data||'')).map(x=>({id:crypto.randomUUID(),name:x.name||'라이브러리 자료',data:x.data,at:nowIso()}));
      work.sources.picked=[...(work.sources.picked||[]),...got];const wasSub=sub;sub=null;say('ai',`라이브러리에서 그림 ${got.length}개를 골랐어요. 어디에 넣을까요?`,{pick:got.map(g=>g.id)});sub=wasSub;render();note('library-picked',{n:got.length});}return;}
  const p=pending.get(m.requestId);if(!p)return;pending.delete(m.requestId);
  if(m.error){p.reject(Object.assign(Error(m.error),{need:m.need,cancelled:m.cancelled,opened:m.opened}));return;}p.resolve(m.result);});
// 연결 화면에서 로그인을 마치면: 마지막 교사 말을 같은 대화에 이어서 다시 보낸다(말풍선은 다시 쌓지 않음).
addEventListener('message',e=>{if(e.source!==window.parent||e.data?.channel!=='5e-harness'||e.data.action!=='resume'||busy)return;const last=[...(sub?subThread(sub):work.chat)].reverse().find(m=>m.role==='me');if(!last)return;note('resume');busy++;(sub?subSend(last.text):examSend(last.text)).catch(failMsg).finally(()=>{busy--;render();});});

// ── 저장(자동: IndexedDB 한 칸 / 파일: .5e examset) ──
const DB='5e-harness';
const idb=()=>new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
async function idbSet(key,val){const d=await idb();await new Promise((res,rej)=>{const t=d.transaction('files','readwrite');t.objectStore('files').put(val,key);t.oncomplete=res;t.onerror=()=>rej(t.error);});}
async function idbGet(key){const d=await idb();return new Promise((res,rej)=>{const r=d.transaction('files').objectStore('files').get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
let saveTimer=0;
function save(){clearTimeout(saveTimer);saveTimer=setTimeout(async()=>{try{await idbSet('work:'+work.projectId,work);const list=(await idbGet('list'))||[];const i=list.findIndex(x=>x.id===work.projectId);const row={id:work.projectId,title:work.meta.title||'새 시험지',head:work.head,stage:work.meta.stage,at:nowIso(),empty:pristine(work),n:work.questions.length};if(i>=0)list[i]=row;else list.unshift(row);await idbSet('list',list.slice(0,30));await idbSet('last',work.projectId);$('#footSave').textContent='자동 저장됨 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});renderSide(list);}catch(e){$('#footSave').textContent='자동 저장 실패: '+e.message;note('save-fail',{error:e.message});}},400);}
async function saveFile(){const bytes=await buildExamsetFile(work);const name=`${(work.meta.title||'시험지').replace(/[\\/:*?"<>|]/g,'_')}.5e`;
  const desk=window.parent.fiveEDesktop?.examFiles;if(desk){const r=await desk.save({name,ext:'5e',bytes});toast('저장했어요: '+r.name);note('file-save',{bytes:bytes.length,desktop:true});return;}
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes]));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);toast('시험지 파일을 내려받았어요');note('file-save',{bytes:bytes.length});}
// 1.7.x 시험지·문항 파일(.5e sheet·.exampool·엑셀)은 새 시험지로 「복사해 가져온다」(결정 17·18 가정). 문항은 그대로, 설계표는 문항에서 거꾸로 채움, 판 v0.1.
// 원본 비교용 지문: 내용 칸만(출제 기록·조판 등은 뺌)
const qHash=q=>{const t=JSON.stringify([q.ask,q.answer,q.points,(q.blocks||[]).map(b=>[b.kind,b.text||'',(b.lines||[]).map(l=>l.text),b.table?.cells?.map(r=>r.map(c=>c.value)),b.figure?.data?b.figure.data.length:0]),(q.choices||[]).map(c=>c.text)]);let h=0;for(let i=0;i<t.length;i++)h=(h*31+t.charCodeAt(i))|0;return (h>>>0).toString(36)+'.'+t.length;};
async function importSheet(name,bytes){const read=await readSheetFile(name,bytes,{});if(read.kind!=='sheet')throw Error('그림·한글 시험지 파일은 image·hwp에서 여세요.');
  const p=read.pending,exam=p.exams?.[0],ids=exam?.items?.length?exam.items:p.questions.map(q=>q.id),w=X.newExamset({title:exam?.title||name.replace(/\.[^.]+$/,'')});
  const FORM_OF={합답형:'combo',서술형:'essay'};for(const id of ids){const q=clone(p.questions.find(x=>x.id===id));if(!q)continue;
    // 명세 4-5: 옛 근거 references[]를 출제 기록 근거로 옮긴다(직접 지지·교사).
    if(q.references?.length){const a=ensureAuthoring(q);for(const r of q.references){const t=/^(block|line|choice):/.test(r.target)?r.target:r.target==='question'?'question':q.blocks.some(b=>b.id===r.target)?'block:'+r.target:q.blocks.some(b=>b.lines?.some(l=>l.id===r.target))?'line:'+r.target:q.choices.some(c=>c.id===r.target)?'choice:'+r.target:'question';
      a.evidence.push({id:crypto.randomUUID(),target:t,claim:String(r.quote||r.label||'').slice(0,4000)||'(옛 근거)',judgement:'direct',by:'teacher',note:'옛 파일 근거에서 옮김',reviewVersion:null,at:nowIso(),source:{kind:'document',title:String(r.label||'').slice(0,600),quote:String(r.quote||'').slice(0,6000),page:Number.isInteger(r.page)?r.page:null}});}}
    const srcNo=q.number,h=qHash(q);X.addQuestion(w,q,{by:'import'});q.origin={...(q.origin||{}),by:'import',source:{file:name,no:srcNo,id,hash:h,at:nowIso()}};
    w.plan.push({no:w.plan.length+1,qid:q.id,unit:q.unitSmall||q.unitMiddle||'',standards:q.standardCode?[q.standardCode]:[],difficulty:q.difficulty||'',points:q.points,form:q.form||FORM_OF[q.type]||'single',structure:q.structure||'',twist:q.intent||'',figure:q.blocks.some(b=>b.kind==='figure'&&b.figure?.data)?'reuse':'none',basis:[],status:'set',by:'teacher',seen:true});}
  X.setMeta(w,'itemCount',w.items.length,'teacher');X.setMeta(w,'pointsTotal',X.computeStats(X.orderedQuestions(w)).pointsTotal,'teacher');w.meta.stage='review';
  X.commitVersion(w,{summary:`가져옴: ${name}`});w.chat.push({role:'ai',text:`「${name}」에서 문항 ${w.items.length}개를 새 시험지로 복사해 왔어요(원래 파일은 그대로). 과목과 범위를 알려 주시면 근거 검토를 이어서 할게요.`,at:nowIso()});return w;}
// 같은 원본 파일을 다시 열면: 그 파일에서 복사해 간 시험지들과 문항마다 비교해, 원본이 고쳐진 문항을 그 시험지에 알림으로 남긴다(지금 시험지 문항은 그대로).
async function noteOriginChanges(name,w){try{const list=(await idbGet('list'))||[];const fresh=new Map(w.questions.map(q=>[q.origin?.source?.id,q.origin?.source?.hash]));
    for(const row of list){if(row.id===w.projectId)continue;const old=await idbGet('work:'+row.id);if(!old)continue;const changed=old.questions.filter(q=>q.origin?.source?.file===name&&fresh.has(q.origin.source.id)&&fresh.get(q.origin.source.id)!==q.origin.source.hash);
      if(!changed.length)continue;old.originNotices=[...(old.originNotices||[]),{file:name,at:nowIso(),nos:changed.map(q=>q.number),shown:false}];await idbSet('work:'+row.id,old);note('origin-changed',{exam:row.title,n:changed.length});}}catch(e){note('origin-check-fail',{error:e.message});}}
async function openFile(file){const bytes=new Uint8Array(await file.arrayBuffer());if(peekKind(bytes)!=='examset'){try{work=await importSheet(file.name,bytes);void noteOriginChanges(file.name,work);sub=null;work.ui={tab:'review',manual:false};tab='review';showView('work');save();render();note('import-sheet',{n:work.items.length});toast('기존 시험지를 복사해 왔어요');}catch(e){toast('가져오지 못했어요: '+e.message);note('import-sheet-fail',{error:e.message});}return;}
  try{const w=await parseExamsetFile(bytes);work=w;sub=null;tab=initialTab(work);showView('work');save();render();toast('시험지를 열었어요 · '+(work.head||'v0.0'));note('file-open',{head:work.head});}catch(e){toast('열지 못했어요: '+e.message);note('file-open-fail',{error:e.message});}}

// ── 대화 ──
function say(role,text,extra={}){const m={role,text,at:nowIso(),...extra};if(role==='ai'&&doneLogs.length)m.logs=doneLogs.splice(0);(sub?subThread(sub):work.chat).push(m);save();renderThread();return m;}
function subThread(qid){const s=work.sessions.find(x=>x.scope==='q:'+qid)||(work.sessions.push({id:crypto.randomUUID(),scope:'q:'+qid,parent:'exam',provider:'codex',startedAt:nowIso(),thread:[]}),work.sessions.at(-1));s.thread ||= [];return s.thread;}
// 진행 줄: 화면을 다시 그려도 남는다(11-25 완주 2: render가 대화를 다시 그리며 진행 줄을 지워, 초안 16문항·그림 그리는 동안 진행이 안 보였다).
const acts=new Set();
const doneLogs=[];
const PAST=[[/맞추는 안 만드는 중/,'맞추는 안 만듦'],[/쓰는 중/,'씀'],[/그리는 중/,'그림'],[/읽는 중/,'읽음'],[/생각하는 중/,'생각함'],[/비교하는 중/,'비교함'],[/만드는 중/,'만듦'],[/옮기는 중/,'옮김'],[/받는 중/,'받음'],[/찾는 중/,'찾음'],[/푸는 중/,'풂']];
const pastOf=t=>{let x=String(t).replace(/…/g,'').replace(/\s*\(그동안 대화해도 돼요\)/,'');for(const [r,v] of PAST)x=x.replace(r,v);return x.trim();};
function act(text,{onStop}={}){const t0=Date.now(),steps=[];let last=text;const el=document.createElement('div');el.className='msg a';el.innerHTML=`<div class="act"><span class="dot"></span><span class="at">${E(text)}</span>${onStop?'<button class="btn sm hx-stop" title="다 쓴 것은 남기고 나머지는 멈춰요">멈추기</button>':''}</div>`;
  if(onStop)el.querySelector('.hx-stop').onclick=()=>{const b=el.querySelector('.hx-stop');b.disabled=true;b.textContent='멈추는 중…';onStop();};acts.add(el);$('#thread').append(el);$('#scroll').scrollTop=1e7;
  return {set:t=>{last=t;el.querySelector('.at').textContent=t;},step:t=>{steps.push(String(t));},done:()=>{acts.delete(el);el.remove();const sec=Math.round((Date.now()-t0)/1000);if(sec>=2||steps.length)doneLogs.push({title:pastOf(last)+(sec>=2?` · ${sec}초`:''),steps:steps.slice(-10),at:nowIso()});}};}
async function send(){const ta=$('#input'),text=ta.value.trim();if(!text||busy)return;if(view!=='work')showView('work');if(work.ui?.manual)work.ui.manual=false;/* 결정 V2: 탭을 직접 누르면 그 뒤 자동 넘김을 멈추되, 선생님이 새로 시키면 다시 따라간다 */ta.value='';say('me',text);busy++;$('#bSend').disabled=true;
  try{sub?await subSend(text):await examSend(text);}catch(e){failMsg(e);}finally{busy--;$('#bSend').disabled=false;render();}}
function failMsg(e){note('ai-fail',{error:e.message,need:e.need});const text=e.need==='login'?(e.opened?'GPT 로그인이 필요해요. 연결 화면을 열었어요 — 로그인하면 같은 말을 이어서 보내요. 쓰던 내용은 그대로예요.':'GPT 로그인이 필요해요. 왼쪽 아래 「5E」를 눌러 5E 화면의 AI 연결에서 로그인한 뒤 같은 말을 다시 보내 주세요. 쓰던 내용은 그대로예요.'):e.need==='install'?(e.opened?'이 컴퓨터에 Codex가 없어요. 연결 화면을 열었어요 — 설치하면 같은 말을 이어서 보내요.':'이 컴퓨터에 Codex가 없어 AI를 부르지 못했어요. AI 연결 화면에서 설치한 뒤 다시 보내 주세요.'):e.cancelled?'요청을 취소했어요. 바뀐 것은 없어요.':`AI 답을 받지 못했어요: ${e.message} · 바뀐 것은 없어요. 같은 말을 다시 보내면 이어서 해요.`;say('ai',text,{error:true});}

// 자료 폴더 색인(이 기기에만): 시험지마다 IndexedDB 'folder:<id>'.
let folderIndex=null,folderFor=null;
async function getFolder(){if(folderFor===work.projectId)return folderIndex;folderFor=work.projectId;folderIndex=await idbGet('folder:'+work.projectId).catch(()=>null);return folderIndex;}
// 교사 말로 먼저 찾고(묻힌 낱말이 없게) 문항 글로 보탠다 — 폴더 시나리오: 문항 글이 섞여 「7등급 625배」가 든 학습지를 놓쳤다.
async function folderHits(query,k=3,extra=''){const idx=await getFolder();let hits=idx?searchFolder(idx,query,{k}):[];if(idx&&extra&&hits.length<k){const more=searchFolder(idx,extra,{k}).filter(h=>!hits.some(x=>x.rel===h.rel&&x.title===h.title));hits=[...hits,...more].slice(0,k).map((h,i)=>({...h,ref:`fd-${i+1}-${h.ref.split('-').pop()}`}));}if(hits.length)note('folder-hits',{n:hits.length,top:hits[0].title});return hits;}
const SRC_KIND={textbook:'textbook',past:'past',worksheet:'document',document:'document'};
const hitEvidence=hits=>hits.map(h=>[h.ref,{kind:SRC_KIND[h.kind]||'document',title:(h.kind==='worksheet'?'학습지 · ':'')+h.title,quote:h.quote,page:h.page,ref:h.ref}]);
// 시험지 대화(큰 세션)
const globalRules=()=>{try{return JSON.parse(localStorage.getItem('5e.harness.rules')||'[]');}catch{return [];}};
const setGlobalRules=list=>{try{localStorage.setItem('5e.harness.rules',JSON.stringify(list.slice(-200)));}catch{}};
const rulesFor=()=>[...globalRules().filter(r=>r.layer==='global'||r.layer==='subject'&&r.subject===work.meta.subject?.value),...(work.rules.exam||[])];
function ledgerForPrompt(){return work.comments.filter(c=>['new','talk','decided'].includes(c.status)).map(c=>({id:c.id,no:work.questions.find(q=>q.id===c.qid)?.number||null,status:c.status,text:c.text,proposal:(c.proposals||[]).map(pid=>work.proposals?.find?.(p=>p.id===pid)?.summary).filter(Boolean).join(' / ')}));}
// 설계표를 잡기 전(막는 칸이 다 찼고 설계표가 비었을 때) 교육과정·기출 근거를 찾아 시험지 대화에 함께 넘긴다(근거 중심, 결정 3).
// 11-25 완주 2: 과목·범위가 들어온 바로 그 턴에는 아직 「막는 칸이 빔」이라 검색을 건너뛰어, 설계표가 근거 없이 잡혔다 → 설계표가 비었으면 교사 말에서도 검색어를 뽑는다.
async function planEvidence(text=''){const m=work.meta;
  // 완주 6: 설계표가 생긴 뒤에는 폴더를 다시 찾지 않아 둘째 턴부터 「근거 없음」이라 말했다 → 설계표가 있으면 교사 말로 폴더만 찾는다.
  if(work.plan.length){const fh=await folderHits(text,3);return fh.map(e=>({ref:e.ref,kind:e.kind,title:e.title,page:e.page||null,quote:String(e.quote||'').slice(0,600)}));}const terms=[[].concat(m.range?.value||[]).join(' '),m.subject?.value||'',text].join(' ').split(/[,·:\s]+/).filter(t=>t.length>1&&!/교과서|쪽|\d|하자|해\s?줘|이야|만들|출제|문항|기말|중간|시험|다시|수업|강조|앞쪽|힘|주고|최상|보통|쉬움|^상$|^과목|이름/.test(t)).filter((t,i,a)=>a.indexOf(t)===i).slice(0,6);if(!terms.length)return [];
  const found=[];for(const kind of pastOn()?['curriculum','past']:['curriculum']){try{const r=await call('evidence',{request:{kind,terms:terms.slice(0,4),sentence:`${m.subject?.value||''} ${terms.join(' ')}`,limit:kind==='past'?6:4}});for(const e of r.results||[])found.push(e);note('plan-evidence',{evKind:kind,available:r.available,n:(r.results||[]).length,warning:r.warning||''});}catch(e){note('plan-evidence-fail',{evKind:kind,error:e.message});}}
  for(const h of await folderHits([terms.join(' '),text].join(' '),4))found.push(h);
  if(found.length)planSteps.push(`근거 후보 ${found.length}개 — ${[...new Set(found.map(e=>({curriculum:'교육과정',past:'기출',textbook:'교과서',worksheet:'학습지'})[e.kind]||'자료'))].join('·')}`);work.sources.planEvidence=found.map(e=>({ref:e.ref,kind:e.kind,title:e.title,page:e.page||null,quote:String(e.quote||'').slice(0,600)}));return work.sources.planEvidence;}
const planSteps=[];
async function examTurn(text){
  planSteps.length=0;const ev=await planEvidence(text);
  const prompt=buildExamPrompt(work,{text,ledger:ledgerForPrompt(),rules:rulesFor()})+(ev.length?`\n\n[근거 검색 결과 · 후보일 뿐, 설계표 basis·standards에 title로만 인용]\n${ev.map(e=>`- ${e.kind} · ${e.title}${e.page?` · ${e.page}쪽`:''}: ${e.quote}`).join('\n')}`:'');const a=act('생각하는 중…');for(const x of planSteps)a.step(x);if(work.questions.length)a.step(`지금 문항 ${work.questions.length}개 글을 함께 봄`);
  // 규칙 시험(rule4): 「초안 써 줘」에 시험지 대화가 1~3번 문항 글을 통째로 답한 뒤 하위 세션이 다시 씀(두 번 듦·글이 달라 헷갈림) → 초안 지시면 답을 짧게.
  const draftNote=wantsDraft(text)?'\n\n[이번 말은 초안 쓰기 지시다. 문항 글은 문항마다 따로 쓰니 reply에 문항·선지·정답을 쓰지 말고, 초안 전에 정해 둘 것만 1~2문장으로 말한다.]':'';
  const attachments=pendingAttach.splice(0);
  try{let r=await call('turn',{scope:'exam:'+work.projectId,text:prompt+draftNote+(attachments.length?`\n\n[교사가 라이브러리에서 고른 그림 ${attachments.length}장을 함께 붙였다: ${attachments.map(a=>a.name).join(', ')}]`:''),...(attachments.length?{attachments}:{})}),parsed=parseExamResponse(r.text);
    if(!parsed.ok){a.set('형식을 고쳐 다시 받는 중…');r=await call('turn',{scope:'exam:'+work.projectId,text:prompt+draftNote+'\n\n[앞 응답 형식 오류 — 고쳐서 JSON만]\n'+parsed.errors.join('\n')});parsed=parseExamResponse(r.text);}
    if(!parsed.ok)throw Error('AI 응답 형식이 맞지 않아요: '+parsed.errors.join(' / '));note('exam-turn',{ms:r.ms,model:r.model});return {...parsed.value,_ms:r.ms,_model:r.model};}
  finally{a.done();}
}
async function examSend(text){
  // 1) 「반영해」: 먼저 대장 상태를 교사 말대로 맞춘 뒤(AI는 decided만 표시), 코드가 결정된 것만 반영한다.
  const apply=wantsApply(text),discuss=wantsDiscussOnly(text);
  // 시안7 1번: 초안을 쓰는 동안에도 말할 수 있다. 다만 「반영해」는 쓰기가 끝난 뒤에 처리(쓰는 중인 문항과 섞이지 않게).
  if(drafting&&apply&&!discuss){drafting.applyAfter=text;say('ai','초안을 다 쓴 뒤에 반영할게요. 그동안 나온 문항에 코멘트를 더 달아도 돼요.');return;}
  if(drafting&&wantsDraft(text)){say('ai',`지금 초안을 쓰고 있어요(${drafting.done.length}/${drafting.rows.length}). 다 쓰면 알려 드릴게요.`);return;}
  if(/다 달았|코멘트 (다|봐|읽|확인)/.test(text)&&work.comments.some(c=>c.status==='new')){await triageComments(text);return;}
  // 정답 분포 맞추기(AI 대화를 거치지 않음): 안 만들기 / 교사가 그 안을 반영하라고 할 때
  if(/정답 ?분포.*(맞춰|맞추|고르게)/.test(text)&&!apply){await rebalanceAnswers();return;}
  if(/정답 ?분포 ?안/.test(text)&&apply){for(const c of work.comments.filter(c=>c.status==='talk'&&/^\(정답 분포 맞추기\)/.test(c.text)))X.updateComment(work,c.id,{status:'decided',decision:c.text});await applyNow('정답 분포 맞추기');return;}
  const metaBefore=Object.fromEntries(Object.entries(work.meta).map(([k,v])=>[k,JSON.stringify(v?.value??null)])),planBefore=work.plan.length;
  const shownPlan=(work.planProposals||[]).slice();// 교사가 이미 본 설계표 안만 받을 수 있다(이번 턴에 새로 나온 안은 아직 못 봤음)
  const v=await examTurn(text);
  absorb(v,text,{allowDecided:!discuss});
  const decided=Object.entries(work.meta).filter(([k,x])=>META_LABEL_H[k]&&x&&x.by==='ai'&&x.value!=null&&JSON.stringify(x.value)!==metaBefore[k]).map(([k,x])=>({k:META_LABEL_H[k],v:fmtMeta(x.value)}));
  const art=!planBefore&&work.plan.length?{tab:'plan',icon:'table',title:'설계표',sub:`${work.plan.length}문항 · ${[...new Set(work.plan.flatMap(r=>r.standards||[]))].length?`성취기준 ${[...new Set(work.plan.flatMap(r=>r.standards||[]))].length}개 · `:''}배점 합 ${work.plan.reduce((n,r)=>n+(Number(r.points)||0),0)}점`}:null;
  say('ai',v.reply,{decided,art,asks:v.questions||[],choices:cleanChoices(v.choices),model:v._model,ms:v._ms,ruleCards:(v.rules||[]).map(r=>({text:r.text,id:crypto.randomUUID()}))});
  if(discuss){note('discuss-only');return;}
  const planAsk=shownPlan.length&&(/설계표.*(반영|적용)|추천대로|그 안대로|제안대로/.test(text));
  if(planAsk){const n=applyPlanProposals(shownPlan);say('ai',`설계표 ${n}칸을 안대로 바꿨어요.`);}
  if(apply&&!(planAsk&&!work.comments.some(c=>c.status==='decided'))){await applyNow('교사 지시: '+text.slice(0,80));return;}
  if(wantsBump(text)){bumpVersion('판 올리기');return;}
  if(wantsFinal(text)){declareFinal();return;}
  if(wantsDraft(text)){void draftAll().catch(failMsg);return;}// 뒤에서 쓴다 — 보내기 칸은 바로 다시 쓸 수 있다
  if(wantsSolve(text)&&work.questions.length){if(pendingCount()||work.dirty){bumpVersion('풀이 검사 전 판 올리기');return;}const v=work.versions.find(x=>x.label===work.head)||{label:work.head||'v0.0'};await solveChanged({label:v.label,changed:work.items.slice()});return;}
}
function absorb(v,text,{allowDecided=true}={}){
  // 시험지 정보: 교사가 말한 것(teacher)은 늘 넣고, AI 기본값(ai)은 아직 교사가 정하지도 보지도 않은 칸에만.
  const PLACEHOLDER=/^(미지정|미정|없음|모름|알 수 없음|확인 필요|n\/a|unknown|-)$/i;
  for(const [k,val] of Object.entries(v.meta||{})){if(val===''||val==null||(Array.isArray(val)&&!val.length)||(typeof val==='string'&&PLACEHOLDER.test(val.trim())))continue;const by=v.metaBy?.[k]==='teacher'?'teacher':'ai',cur=work.meta[k];
    if(by==='teacher'||!cur||cur.value==null||X.canAiChange(cur))X.setMeta(work,k,val,by);}
  // 완주 5: 첫 턴에 AI가 추정한 과목(「과학」)으로 만든 제목이, 선생님이 과목을 바로잡아도 그대로였다 → 자동으로 만든 제목은 시험지 정보가 바뀌면 다시 만든다(가져온 파일 제목·직접 정한 제목은 그대로).
  if(!work.meta.title||work.meta.title==='새 시험지'||work.meta.titleAuto){const t=[work.meta.term?.value,work.meta.examName?.value,work.meta.subject?.value].filter(Boolean).join(' · ');if(t){work.meta.title=t;work.meta.titleAuto=true;}}
  // 설계표: 막는 칸이 비었으면 받지 않는다(결정 3). AI 행은 교사가 안 본 것만 바꾸고, 본 행은 제안으로.
  const missing=X.missingBlocking(work);
  // 물리학 완주: 「난이도는 상2·중4·하2로」처럼 교사가 직접 시킨 설계표 변경까지 「이미 본 칸」이라 막혔다 → 교사 지시(planBy=teacher)는 바로 반영.
  // 안전장치: 상의만 하자는 말이 아니고, 교사 말에 설계표 낱말이 있을 때만 교사 지시로 받는다.
  const teacherPlan=v.planBy==='teacher'&&!wantsDiscussOnly(text)&&/난이도|배점|번은|번을|번 문항|설계|유형|그림|문항|순서|단원|소단원|점/.test(text);
  if(Array.isArray(v.plan)&&v.plan.length){if(missing.length)note('plan-blocked',{missing});else{const before=JSON.stringify(work.plan.map(r=>[r.no,r.unit,r.difficulty,r.points,r.form,r.figure]));const r=X.setPlanRows(work,teacherPlan?v.plan.filter(x=>!work.plan.find(p=>p.no===x.no)?.qid):v.plan,teacherPlan?'teacher':'ai');if(teacherPlan){note('plan-teacher',{applied:r.applied.length});if(JSON.stringify(work.plan.map(r=>[r.no,r.unit,r.difficulty,r.points,r.form,r.figure]))!==before)say('ai','말씀하신 대로 설계표를 바꿨어요(문항이 아직 없는 칸만).');}const real=(r.proposals||[]).filter(p=>summarizeRow(p.before)!==summarizeRow(p.after)||(p.before?.twist||'')!==(p.after?.twist||''));
      // 11-25 완주 2: 교사가 본 설계표 칸의 안이 16칸 전체 긴 글로만 나오고(같은 칸 포함) 받아들일 길이 없었다 → 바뀌는 칸만 짧게, 저장해 두었다가 「설계표 반영해·추천대로」면 바꿈
      work.planProposals=real.map(p=>({no:p.no,after:p.after,at:nowIso()}));
      if(real.length)say('ai',`설계표는 이미 보셨으니 바꾸지 않았어요. 바꿀 안 ${real.length}칸: ${real.slice(0,6).map(p=>`${p.no}번 ${summarizeRow(p.before)} → ${summarizeRow(p.after)}`).join(' / ')}${real.length>6?` 외 ${real.length-6}칸`:''}. 이대로 하려면 「설계표 반영해」라고 해 주세요.`);if(work.meta.stage==='design'&&work.plan.length)autoTab('plan');}}
  for(const x of v.ledger||[]){const c=work.comments.find(c=>c.id===x.id);if(!c||['applied','dropped'].includes(c.status))continue;
    if(x.status==='decided'&&!allowDecided)continue;X.updateComment(work,c.id,{status:x.status,...(x.gist?{gist:x.gist}:{}),...(x.answer?{answer:x.answer}:{}),...(x.status==='decided'?{decision:x.gist||text}:{})});}
  save();
}
function applyPlanProposals(list=work.planProposals||[]){let n=0;for(const p of list){const row=work.plan.find(r=>r.no===p.no);if(!row||row.qid)continue;Object.assign(row,{...p.after,no:row.no,qid:row.qid,by:'teacher',seen:true});n++;}work.planProposals=[];save();note('plan-apply',{n});return n;}
const summarizeRow=r=>r?[r.unit,r.difficulty,r.points!=null?r.points+'점':'',r.form].filter(Boolean).join(' · '):'(빈 칸)';

// 초안: 설계표의 빈 문항 칸마다 하위 세션(출제 대화 엔진, kind=draft)으로 쓴다 — 빈 칸 처음 채우기라 바로 넣는다.
async function draftAll(){
  const rows=work.plan.filter(r=>!r.qid&&r.status!=='empty');if(!rows.length){say('ai','설계표에 아직 쓸 문항 칸이 없어요. 설계표부터 같이 정해요.');return;}
  // 11-25 완주 2: 문항을 따로 쓰니 정답이 ①1·②2·③5·④7·⑤0으로 몰리고 3연속이 생겼다 → 쓰기 전에 객관식 칸마다 정답 번호를 고르게 정해 준다(워크플로 기본값: 고르게, 3연속 없음).
  const taken=X.orderedQuestions(work).filter(q=>q.type!=='서술형'&&Number.isInteger(q.answer)).map(q=>q.answer+1);const need=rows.filter(r=>r.form!=='essay');const tgt=balancedAnswers(need.length,taken);need.forEach((r,i)=>{r.answerTarget=tgt[i];});
  // 시안7 1번(11-26): 16문항이 다 끝날 때까지(11~21분) 아무것도 못 봤다 → 첫 문항이 나오면 바로 「문항 검토」로, 나온 문항부터 보고 코멘트. 진행 줄에 「멈추기」.
  work.meta.stage='draft';const queue=[...rows];drafting={rows,writing:new Set(),done:[],stopped:false,applyAfter:null};const D=drafting;let fails=[],prog=null;
  const a=act(`문항 ${rows.length}개 쓰는 중 · 0/${rows.length}`,{onStop:()=>{D.stopped=true;queue.length=0;cancelGroup('draft');}});
  const one=async row=>{if(D.stopped)return;D.writing.add(row.no);render();
    try{await draftRow(row).catch(e=>{if(D.stopped||e.cancelled)throw e;note('draft-retry',{no:row.no,error:e.message});return draftRow(row);});
      D.done.push(row.no);const nos=[...D.done].sort((x,y)=>x-y).join('·');
      if(!prog){prog=say('ai','');autoTab('review');}prog.text=`${nos}번이 나왔어요. 오른쪽 「문항 검토」에서 바로 보고 코멘트를 달 수 있어요. 나머지는 쓰는 대로 아래에 붙어요.`;}
    catch(e){if(!(D.stopped&&e.cancelled)){fails.push({no:row.no,error:e.message});note('draft-fail',{no:row.no,error:e.message});}}
    finally{D.writing.delete(row.no);a.set(`문항 ${rows.length}개 쓰는 중 · ${D.done.length}/${rows.length}`);save();render();}};// 문항마다 저장: 도중에 앱을 꺼도 다 쓴 문항은 남고, 다시 「초안 써 줘」 하면 빈 칸만 쓴다
  const workers=Array.from({length:3},async()=>{while(queue.length&&!D.stopped)await one(queue.shift());});await Promise.all(workers);a.done();drafting=null;
  const left=rows.filter(r=>!r.qid).length;
  if(!D.done.length){render();say('ai',D.stopped?'멈췄어요. 아직 다 쓴 문항이 없어 바뀐 것은 없어요. 「초안 써 줘」라고 하면 다시 써요.':`초안을 쓰지 못했어요(${fails.map(f=>f.no+'번').join(', ')}). 「초안 써 줘」라고 하면 다시 써요.`,{error:!D.stopped});return;}
  const v=commit(`초안 ${D.done.length}문항`,{changed:rows.filter(r=>r.qid).map(r=>r.qid)});
  say('ai',D.stopped?`멈췄어요. 다 쓴 ${D.done.length}문항은 남겨 ${v.label}에 넣었고, ${left}칸은 비워 뒀어요 — 「초안 이어서 써 줘」라고 하면 그 칸만 써요.`:`초안 ${v.label}이 나왔어요(${D.done.length}문항${fails.length?` · 못 쓴 문항 ${fails.map(f=>f.no+'번').join(', ')} — 다시 「초안 써 줘」라고 하면 그 칸만 써요`:''}). 「문항 검토」에서 문항마다 오른쪽 아래에 편하게 코멘트를 적어 주세요. 근거·해설·검토는 각 문항의 단추를 누르면 열려요.`,{stats:v.stats,art:{tab:'sheet',icon:'file',title:`시험지 ${v.label}`,sub:`${work.questions.length}문항 · 정답 ${[1,2,3,4,5].map(n=>CIRCLED[n-1]+(v.stats.countByNumber?.[n]||0)).join(' ')} · ${v.stats.pointsTotal}점`}});
  autoTab('sheet');work.meta.stage='review';save();render();
  if(D.applyAfter){await applyNow('교사 지시(초안 뒤): '+D.applyAfter.slice(0,80));}
  // 완주 3: AI가 정해 준 정답 번호를 다 따르지 않아 4연속이 생겼다 → 고르지 않으면 알리고, 맞추기는 교사가 말할 때 「안」으로만(결정: 정답 분포 맞추기도 제안)
  // 멈췄으면 여기까지(정답 분포 알림·풀이 검사·그림 그리기를 이어서 하지 않는다 — 검사: 멈춘 뒤 정답 분포 알림이 마지막 말로 나왔다)
  if(D.stopped)return;
  const c=v.stats.countByNumber,vals=[1,2,3,4,5].map(n=>c[n]||0);if(v.stats.longestRun>=3||Math.max(...vals)-Math.min(...vals)>=2)say('ai',`정답 분포가 고르지 않아요(${[1,2,3,4,5].map(n=>CIRCLED[n-1]+(c[n]||0)).join(' ')} · 같은 번호 최대 ${v.stats.longestRun}연속). 맞추려면 「정답 분포 맞춰 줘」라고 해 주세요. 어느 문항을 어떻게 바꿀지 안부터 보여 드려요.`);
  void solveChanged(v).then(()=>drawAll());
}
// 정답 분포 맞추기: 바꿀 문항을 골라 「정답이 ⓧ이 되게」 안을 만든다(반영은 교사가 「반영해」).
async function rebalanceAnswers(){const qs=X.orderedQuestions(work).filter(q=>q.type!=='서술형'&&Number.isInteger(q.answer));const ans=qs.map(q=>q.answer+1);
  const count=[0,0,0,0,0,0];ans.forEach(a=>count[a]++);const want=Math.floor(ans.length/5),pick=[];
  for(let i=0;i<qs.length;i++){const a=ans[i],run=i>=2&&ans[i-1]===a&&ans[i-2]===a;if(count[a]>Math.ceil(ans.length/5)||run){const to=[1,2,3,4,5].filter(n=>n!==ans[i-1]&&n!==ans[i+1]).sort((x,y)=>count[x]-count[y])[0];if(to&&count[to]<count[a]){pick.push({q:qs[i],to});count[a]--;count[to]++;ans[i]=to;}}}
  if(!pick.length){say('ai','지금 정답 분포에서 바꿀 문항이 없어요.');return;}
  const a=act(`정답 분포 맞추는 안 만드는 중 · 문항 ${pick.length}개`);
  for(const {q,to} of pick){const cid=X.addComment(work,{qid:q.id,text:`(정답 분포 맞추기) 정답을 ${CIRCLED[to-1]}로`,onVersion:work.head});
    const pid=await proposalFrom(q,`시험지 정답 분포를 고르게 하려고 이 문항의 정답을 ${CIRCLED[to-1]}로 옮기려 한다. 문항 내용·정오는 그대로 두고 선지 순서(합답형이면 보기 내용이나 선지 조합)를 바꿔 정답이 ${CIRCLED[to-1]}이 되게 하는 proposal.changes를 만들어라. 해설의 정답 번호도 함께.`,[cid]);
    if(pid){X.setProposalState(work,pid,'current');X.updateComment(work,cid,{status:'talk',answer:`정답을 ${CIRCLED[q.answer]} → ${CIRCLED[to-1]}로 옮기는 안`});}else X.updateComment(work,cid,{status:'talk',answer:'안을 만들지 못했어요'});}
  a.done();say('ai',`정답 분포를 맞추는 안을 문항 ${pick.length}개에 붙였어요(${pick.map(p=>`${p.q.number}번 ${CIRCLED[p.q.answer]}→${CIRCLED[p.to-1]}`).join(', ')}). 아직 바꾸지 않았어요. 이대로 하려면 「정답 분포 안 그대로 반영해」라고 해 주세요.`,{ledger:true});autoTab('sheet');save();}
function packetFor(q,{kind,text}){const a=ensureAuthoring(q),{typeset,reviews,authoring,origin,seen,locks,...question}=clone(q);
  const m=work.meta;return {format:'exampool-authoring-request-v1',kind,text,question,previewHtml:'',
    // 결정 7: 저장한 출제 규칙(전체·과목·이 시험지)은 문항 요청마다 「명시 요구」로 함께 넘긴다(예전엔 초안에만 들어가 코멘트·문항 대화에선 무시됐다).
    authoring:{revision:a.revision,target:{subject:m.subject?.value||'',scope:[].concat(m.range?.value||[]).join(', '),schoolLevel:m.grade?.value||''},requirements:{...a.requirements,explicit:[...new Set([...(a.requirements?.explicit||[]),...rulesFor().map(r=>'출제 규칙: '+r.text)])].slice(0,50)},issues:(a.issues||[]).filter(i=>i.status==='open').map(i=>i.text).slice(-8),stale:[],axes:null,recentHistory:[]},
    teacherEdits:(q.locks||[]).map(l=>`직접 고친 칸: ${l.key}`),conversation:(subThreadIf(q.id)||[]).slice(-12).map(({role,text})=>({role,text})),contentHash:null,
    figureCount:q.blocks.filter(b=>b.kind==='figure'&&b.figure?.data).length,figures:q.blocks.filter(b=>b.kind==='figure'&&b.figure?.data&&b.figure.data.length<6e6).map(b=>({blockId:b.id,label:b.label||'그림',data:b.figure.data}))};}
const subThreadIf=qid=>work.sessions.find(x=>x.scope==='q:'+qid)?.thread;
function balancedAnswers(n,taken=[]){const count=[0,0,0,0,0,0];for(const a of taken)count[a]++;const out=[];
  for(let i=0;i<n;i++){const order=[1,2,3,4,5].sort((x,y)=>count[x]-count[y]||Math.random()-.5);out.push(order[0]);count[order[0]]++;}
  for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
  for(let i=2;i<out.length;i++)if(out[i]===out[i-1]&&out[i]===out[i-2]){const k=out.findIndex((x,j)=>j>i&&x!==out[i]);if(k>0)[out[i],out[k]]=[out[k],out[i]];}
  return out;}
async function draftRow(row){
  const q=newQuestion(String(row.no),FORM_TYPE[row.form]||'합답형');try{if(row.form)applyForm(q,row.form);}catch{}q.points=Number(row.points)||q.points;
  // 설계표에 그림이 있는 문항은 빈 그림 칸을 먼저 둔다 — AI가 그 칸의 제작 명세(figures)를 쓰게(11-25 밤샘 완주 1: 초안 16문항에 그림 명세 0).
  const needFigure=row.figure&&row.figure!=='none';if(needFigure&&!q.blocks.some(b=>b.kind==='figure'))q.blocks.splice(1,0,block('figure',null,row.figure==='code'?'그래프':'그림'));
  const m=work.meta,rules=rulesFor().map(r=>'- '+r.text).join('\n');
  const text=`새 문항 초안을 써 줘. 시험: ${[m.subject?.value,m.grade?.value,m.examName?.value].filter(Boolean).join(' ')} · 범위: ${[].concat(m.range?.value||[]).join(', ')}.
설계표 ${row.no}번: 소단원 ${row.unit||''} · 난이도 ${row.difficulty||''} · 배점 ${row.points||''}점 · 유형 ${row.form||''} · 자료 구조 ${row.structure||''} · 평가할 사고 ${row.twist||''} · 그림 ${row.figure||''}.
${rules?`출제 규칙:\n${rules}\n`:''}근거(교과서 쪽·학습지·기출)를 evidenceUsed에 대고${needFigure?`, 이 문항은 그림이 있는 문항이니 빈 「${row.figure==='code'?'그래프':'그림'}」 칸의 제작 명세를 figures에 꼭 1개 이상 써 줘(slot은 그 칸 이름, ${row.figure==='convert'?'기출 그림을 바탕으로 바꿔 그리는 명세':row.figure==='code'?'kind=graph, 축·단위·값을 정확히':'kind=image'})`:''}. ${row.answerTarget?`정답은 ${'①②③④⑤'[row.answerTarget-1]}이 되게 써 줘(시험지 전체 정답 분포를 고르게 맞춘 것). 합답형이면 옳은 보기 조합이 ${'①②③④⑤'[row.answerTarget-1]} 자리 선지가 되게.`:''}`;
  const fh=await folderHits(`${row.unit||''} ${row.twist||''} ${[].concat(m.range?.value||[]).join(' ')}`);
  const r=await call('author',{packet:packetFor(q,{kind:'draft',text:text+(fh.length?'\n\n'+folderPrompt(fh):'')})},{group:'draft'});const resp=r.response;
  const changes=proposalChanges(q,resp.proposal);const {question,errors}=applyChanges(q,changes);
  Object.assign(q,question);
  // 생명과학 시나리오: 합답형 칸으로 만들었는데 AI가 객관식으로 써서 빈 〈보기〉 상자가 남았다 → 합답형이 아니면 빈 보기 상자는 뺀다(빈 칸 정리).
  if(q.type!=='합답형')q.blocks=q.blocks.filter(b=>!(b.kind==='bogi'&&!b.lines?.some(l=>String(l.text||'').trim())));
  X.ensureExplanationIds?.(q);ensureAuthoring(q);recordReview(q,{...resp,review:resp.review},{evidence:new Map([...(r.evidence||[]).map(e=>[e.ref,{kind:e.kind,title:e.title,quote:e.quote,page:e.page||null,ref:e.ref}]),...hitEvidence(fh)])});
  // 밤샘 규칙 시험(rule3): 발문·글이 모두 빈 문항 3개가 「초안」으로 들어갔다 → 빈 문항은 넣지 않고 다시 쓴다.
  const blank=!String(q.ask||'').trim()&&!q.blocks.some(b=>String(b.text||'').trim()||(b.lines||[]).some(l=>String(l.text||'').trim()))&&!q.choices.some(c=>String(c.text||'').trim());
  if(blank){note('draft-blank',{no:row.no,changes:changes.length,errors:errors.map(e=>String(e).slice(0,120))});throw Error('AI가 빈 문항을 돌려줬어요');}
  q.figureSpecs=(resp.figures||[]).slice(0,6);X.addQuestion(work,q,{planNo:row.no});X.linkItem(work,row.no,q.id);
  subThread(q.id).push({role:'ai',text:resp.reply,at:nowIso(),model:r.meta?.model,ms:r.meta?.ms});
  note('draft',{no:row.no,ms:r.meta?.ms,changes:changes.length,errors:errors.length,figures:q.figureSpecs.length});
}

// 코멘트: 「다 달았어」 → 문항마다 하위 세션에 코멘트를 넘겨 「지금 → 바꿀 안」만 받는다. 아무것도 고치지 않는다.
async function triageComments(text){
  const fresh=work.comments.filter(c=>c.status==='new'),byQ=new Map();for(const c of fresh)(byQ.get(c.qid)||byQ.set(c.qid,[]).get(c.qid)).push(c);
  const a=act(`코멘트 ${fresh.length}개 읽는 중…`);let n=0;
  for(const [qid,list] of byQ){const q=work.questions.find(x=>x.id===qid);if(!q){for(const c of list)X.updateComment(work,c.id,{status:'talk',answer:'문항이 없어요.'});continue;}
    const body=list.map((c,i)=>`${i+1}) ${c.target?`[${c.target}] `:''}${c.text}`).join('\n'),fh=await folderHits(body,3,(q.ask||'')+' '+q.blocks.map(b=>b.text||'').join(' '));
    try{const r=await call('author',{packet:packetFor(q,{kind:'chat',text:`교사 코멘트(${list.length}개):\n${body}\n\n코멘트마다 요지를 말하고, 질문이면 근거로 먼저 답해. 고칠 것이 있으면 바꿀 안을 proposal.changes에 꼭 넣어(이것은 「제안」일 뿐이고 앱은 교사가 「반영해」라고 하기 전까지 문항을 바꾸지 않는다). 질문만 있어 고칠 것이 없으면 proposal은 null. 정답·분포가 바뀌면 그 영향도 reply에 써. reply에 「바꿨습니다」라고 쓰지 마.${fh.length?'\n\n'+folderPrompt(fh):''}`})});
      const resp=r.response,changes=proposalChanges(q,resp.proposal);let pid=null;
      if(changes.length)pid=X.addProposal(work,{qid,changes,before:beforeOf(q,changes),summary:resp.proposal?.summary||'AI 안',comments:list.map(c=>c.id),effects:{answer:changes.some(c=>c.path==='answer')}});
      for(const c of list)X.updateComment(work,c.id,{status:'talk',answer:resp.reply.slice(0,1200),proposals:pid?[pid]:[]});
      subThread(qid).push({role:'ai',text:resp.reply,at:nowIso(),proposalId:pid});note('triage',{qid,comments:list.length,proposal:!!pid,ms:r.meta?.ms});
    }catch(e){for(const c of list)X.updateComment(work,c.id,{status:'talk',answer:'AI 답을 받지 못했어요: '+e.message});note('triage-fail',{qid,error:e.message});}
    a.set(`코멘트 읽는 중 · 문항 ${++n}/${byQ.size}`);render();}
  a.done();const cnt=X.commentCounts(work);
  say('ai',`코멘트 ${fresh.length}개를 읽었어요. 아직 아무것도 고치지 않았어요. 문항마다 「지금 → 바꿀 안」을 붙여 두었어요. 그대로 할 것을 말씀해 주시면 「결정됨」으로 두고, 「반영해」라고 하시면 결정된 것만 반영해요.`,{ledger:true,counts:cnt,art:{tab:'sheet',icon:'file',title:`시험지 ${work.head||'v0.0'} · 제안 ${openProposals().length}`,sub:`코멘트 ${fresh.length} · 시험지 위에서 받기·거절`}});autoTab('sheet');save();
}
function beforeOf(q,changes){return changes.map(c=>{try{if(c.path==='bogi'){const b=q.blocks.find(b=>b.kind==='bogi');const l=typeof c.line==='string'?b?.lines.find(l=>l.label===c.line):b?.lines[Number(c.line)];return l?.text??'';}
  if(c.path==='choice'){return q.choices[Number(c.index??c.line)]?.text??'';}if(c.path==='answer')return q.answer==null?'':String(q.answer+1);if(c.path==='passage')return q.blocks.find(b=>b.kind==='text'&&!b.parent)?.text??'';
  if(c.path==='block')return q.blocks.find(b=>b.id===c.id||b.label===c.id)?.text??'';return typeof q[c.path]==='string'?q[c.path]:'';}catch{return '';}});}

// 반영: 결정된 코멘트에 딸린 제안만 적용 → 판 올림 → 바뀐 문항만 다시 풂.
// 교사가 분명히 「반영해」라고 했는데 안(proposal)이 없을 때: 결정 내용으로 안을 만든다(state agreed). 반영은 applyDecided가 한다.
async function proposalFrom(q,text,commentIds){try{const r=await call('author',{packet:packetFor(q,{kind:'chat',text})});const changes=proposalChanges(q,r.response.proposal);if(!changes.length){note('proposal-empty',{no:q.number});return null;}
  const pid=X.addProposal(work,{qid:q.id,changes,before:beforeOf(q,changes),summary:r.response.proposal?.summary||'교사 결정대로',comments:commentIds,effects:{answer:changes.some(c=>c.path==='answer')}});X.setProposalState(work,pid,'agreed');note('proposal-from-decision',{no:q.number,changes:changes.length});return pid;}
  catch(e){note('proposal-from-decision-fail',{no:q.number,error:e.message});return null;}}
async function applyNow(why,{only=null}={}){
  const bare=work.comments.filter(c=>c.status==='decided'&&(!only||only.includes(c.id))&&!(c.proposals||[]).some(pid=>work.proposals.find(p=>p.id===pid&&['current','agreed'].includes(p.state))));
  if(bare.length){const a=act(`결정된 코멘트 ${bare.length}개를 고칠 칸으로 옮기는 중…`);for(const c of bare){const q=work.questions.find(x=>x.id===c.qid);if(!q)continue;
      await proposalFrom(q,`교사가 이 코멘트를 이렇게 하기로 정하고 반영하라고 했다. 정한 대로 문항을 고칠 proposal.changes를 만들어라. 정한 것 밖은 건드리지 마.\n[코멘트] ${c.text}\n[정한 것] ${c.decision||c.gist||''}\n[교사 말] ${why}`,[c.id]);}a.done();}
  const before=work.questions.map(q=>[q.id,JSON.stringify(stripMeta(q))]);
  const hold=only?work.comments.filter(c=>c.status==='decided'&&!only.includes(c.id)):[];hold.forEach(c=>{c.status='talk';});let r;try{r=X.applyDecided(work);}finally{hold.forEach(c=>{c.status='decided';});}const changed=r.changedQids||[];
  // 완주 3: 「결정됨」인데 바꿀 곳을 못 찾은 코멘트(이미 그렇게 쓰여 있는 경우 등)가 말 없이 빠졌다 → 함께 알린다.
  const noNos=[...new Set((r.noProposal||[]).map(id=>work.questions.find(q=>q.id===work.comments.find(c=>c.id===id)?.qid)?.number).filter(Boolean))];
  const noTxt=noNos.length?` · ${noNos.join('·')}번은 정하신 대로 바꿀 곳을 찾지 못했어요(이미 그렇게 쓰여 있을 수 있어요) — 「결정됨」으로 두었으니 확인해 주세요`:'';
  if(!changed.length&&r.errors?.length){const nos=[...new Set(r.errors.map(e=>work.questions.find(q=>q.id===e.qid)?.number).filter(Boolean))];say('ai',`${nos.join('·')}번은 글로 고칠 수 없는 안(그림 등)이라 반영하지 못하고 「결정됨」으로 남겼어요${noTxt}. 바뀐 것은 없어요. 그림은 image에서 고쳐 주세요.`);note('apply-errors',{n:r.errors.length});return;}
  if(!changed.length){say('ai',`반영할 것이 없어요${r.noProposal?.length?` (결정됐지만 고칠 칸으로 옮기지 못한 코멘트 ${r.noProposal.length}개 — 「결정됨」으로 남겨 뒀어요)`:''}${r.skipped?.length?` (잠긴 칸이라 건너뛴 것 ${r.skipped.length}개)`:''}. 아직 의논 중인 것은 그대로 뒀어요.`);note('apply-empty',{noProposal:r.noProposal?.length||0});return;}
  // 결정 13: 반영은 문항에만 넣고 판은 쌓아 둔다(「판 올려」 때 한 번에).
  work.pendingApplied=mergeApplied(work.pendingApplied,r.applied);for(const id of changed)work.pendingEdits=[...(work.pendingEdits||[]),{qid:id,key:'apply',label:'반영('+why.replace(/^교사 지시: /,'').slice(0,24)+')',at:nowIso()}];work.dirty=true;save();render();
  const v={label:work.head,stats:X.computeStats(X.orderedQuestions(work))};const talk=work.comments.filter(c=>c.status==='talk').length;
  const failedNos=[...new Set((r.errors||[]).map(e=>work.questions.find(q=>q.id===e.qid)?.number).filter(Boolean))];
  // 11-25 완주 2: 그림 코멘트(그림 높이·글자 크기)는 글로 고칠 수 없어 적용에 실패했는데 결과 문구가 말하지 않았다 → 이유와 다음 길
  if(only){toast(`${changed.map(id=>work.questions.find(q=>q.id===id)?.number+'번').join(', ')} 제안을 받았어요 · 판에 안 들어간 고침 ${pendingCount()}${r.skipped?.length?` · 직접 고친 칸이라 건너뛴 것 ${r.skipped.length}개`:''}`,3200);note('accept',{changed:changed.length});return;}
  say('ai',`반영했어요(판에는 아직 안 넣음 · 판에 안 들어간 고침 ${pendingCount()}). 바뀐 문항 ${changed.map(id=>work.questions.find(q=>q.id===id)?.number+'번').join(', ')}${talk?` · 의논 중 ${talk}개는 그대로`:''}${r.skipped?.length?` · 직접 고친 칸이라 건너뛴 것 ${r.skipped.length}개`:''}${failedNos.length?` · ${failedNos.join('·')}번은 글로 고칠 수 없는 안(그림 등)이라 「결정됨」으로 남겼어요 — 그림은 「문항 검토」의 그림 칸을 두 번 눌러 image에서 고쳐 주세요`:''}${noTxt}. 한 묶음이 끝나면 「판 올려」라고 해 주세요 — 판에 넣고 바뀐 문항을 두 모델이 다시 풀어요.`,{stats:v.stats});
  note('apply',{label:v.label,changed:changed.length,skipped:r.skipped?.length||0,unchangedOthers:before.filter(([id,h])=>!changed.includes(id)).every(([id,h])=>JSON.stringify(stripMeta(work.questions.find(q=>q.id===id)))===h)});
}
const stripMeta=q=>{const {authoring,reviews,typeset,seen,figureSpecs,...rest}=q;return rest;};
function commit(summary,{changed=null,applied}={}){const ap=mergeApplied(work.pendingApplied,applied?.applied);const v=X.commitVersion(work,{summary,changed:changed&&changed.length?changed:null,applied:ap});work.pendingEdits=[];work.pendingApplied=null;save();render();note('version',{label:v.label,stats:v.stats});return v;}
const mergeApplied=(a,b)=>({proposals:[...(a?.proposals||[]),...(b?.proposals||[])],comments:[...(a?.comments||[]),...(b?.comments||[])],direct:[...(a?.direct||[]),...(b?.direct||[])]});
// 결정 13(11-26): 판 올리기 = 커밋 같은 행위. 「반영해」·칸 직접 고침은 문항에 바로 들어가고 판에는 쌓아 둔다. 판은 「판 올려」·풀이 검사·한글 내보내기·v1.0 선언 때.
const pendingCount=()=>(work.pendingEdits||[]).length;
function bumpVersion(why='판 올리기',{solve=true,quiet=false}={}){if(!pendingCount()&&!work.dirty){if(!quiet)say('ai',`판에 안 들어간 고침이 없어요. 지금 판은 ${work.head||'v0.0'}이에요.`);return null;}
  const list=work.pendingEdits||[],nos=[...new Set(list.map(x=>work.questions.find(q=>q.id===x.qid)?.number).filter(Boolean))];
  const v=commit(`${why}: ${list.length?list.slice(0,6).map(x=>`${work.questions.find(q=>q.id===x.qid)?.number||''}번 ${x.label}`).join(' · ')+(list.length>6?` 외 ${list.length-6}`:''):'고친 것'}`);
  if(!quiet)say('ai',`${v.label}로 올렸어요${nos.length?` · 바뀐 문항 ${nos.map(n=>n+'번').join(', ')}`:''}.${solve?' 바뀐 문항을 두 모델이 다시 풀어요.':''}`,{stats:v.stats,art:{tab:'sheet',icon:'file',title:`시험지 ${v.label}`,sub:`바뀐 문항 ${nos.length}개 · 판 기록에서 두 판 비교`}});note('bump',{label:v.label,n:list.length});if(solve)void solveChanged(v);return v;}
const wantsBump=t=>/판\s*(을\s*)?올려|판\s*올리기|새\s*판으로|판 만들어/.test(String(t||''))&&!wantsDiscussOnly(t);
function declareFinal(){const v=X.declareFinal(work);work.pendingEdits=[];work.pendingApplied=null;work.meta.stage='final';save();render();say('ai',`${v.label}으로 정했어요. 정답 배열 ${v.stats.answers.map(a=>a?CIRCLED[a-1]:'·').join(' ')} · 배점 합계 ${v.stats.pointsTotal}점. 시험지 탭에서 exam으로 보내 조판·한글로 내보낼 수 있어요.`,{stats:v.stats});note('final',{label:v.label});}

// 문항의 실제 그림(풀이 검사에 첨부 — 11-25 완주 1: 글만 보내 그림 문항은 두 모델 모두 「그림 누락」으로 못 풂)
const figuresOf=q=>[...q.blocks.filter(b=>b.kind==='figure'&&b.figure?.data&&b.figure.data.length<6e6).map(b=>({name:(b.label||'그림')+'.png',data:b.figure.data})),...q.choices.map((c,i)=>c.figure?.data?{name:'선지 '+CIRCLED[i]+'.png',data:c.figure.data}:null).filter(Boolean)].slice(0,6);
// 풀이 검사: 판의 바뀐 문항만, 두 모델이 정답·해설 없이 새 맥락에서 따로 푼다(결정 8 + 4 가정).
async function solveChanged(v){const ids=(v.changed||[]).filter(id=>work.questions.some(q=>q.id===id&&q.type!=='서술형'));if(!ids.length)return;
  let stopS=false;const queue0=[];const a=act(`정답·해설 가린 문항지로 두 모델 풀이 — 바뀐 문항 ${ids.length}개`,{onStop:()=>{stopS=true;queue0.length=0;cancelGroup('solve');}});let done=0;
  const doneIds=[];
  const one=async id=>{const q=work.questions.find(x=>x.id===id);if(!q)return;const runs=[];doneIds.push(id);
    // 생명과학 시나리오: 그림 칸이 비어 있는 문항도 두 모델에게 보내 「그림 없음」만 받고 크레딧을 썼다 → 그림이 다 들어온 뒤에 푼다.
    const empty=q.blocks.filter(b=>b.kind==='figure'&&!b.figure?.data);if(empty.length){X.recordCheck(work,{qid:id,version:v.label,contentHash:null,runs:[],verdict:'skipped',skipped:`그림 칸 ${empty.length}개가 비어 있어 아직 풀지 않음`});note('solve-skip-figure',{no:q.number});a.set(`두 모델 풀이 · ${++done}/${ids.length}`);return;}
    // 점검 탭(시안7 4번): 수준·교육과정 판정도 같이 묻는다. 교육과정 원문 후보는 근거 DB(교육과정)에서 그 문항 소단원·범위로 찾는다.
    const row=work.plan.find(r=>r.qid===id),m=work.meta;let cur=[];try{const terms=[row?.unit,...[].concat(m.range?.value||[])].filter(Boolean).join(' ').split(/[,·:\s]+/).filter(t=>t.length>1).slice(0,4);if(terms.length){const er=await call('evidence',{request:{kind:'curriculum',terms,sentence:`${m.subject?.value||''} ${terms.join(' ')}`,limit:3}});cur=(er.results||[]).map(e=>({title:e.title,quote:String(e.quote||'').slice(0,500)}));}}catch(e){note('check-curriculum-fail',{error:e.message});}
    const ctx={subject:m.subject?.value||'',grade:m.grade?.value||'',unit:row?.unit||'',curriculum:cur};
    for(const s of SOLVERS){let last=null;for(const model of [s.model,...(s.fallback||[])]){try{if(stopS)break;const r=await call('turn',{scope:`solve:${model}:${id}`,text:buildSolvePrompt(q,ctx),model,effort:'medium',attachments:figuresOf(q)},{group:'solve'});const p=parseSolve(r.text);last={provider:'codex',model:r.model||model,isolated:true,answer:p.ok?p.value.answer:null,multiple:p.value?.multiple||[],note:p.value?.note||(p.ok?'':'형식 오류'),level:p.value?.level||null,levelNote:p.value?.levelNote||'',curriculum:p.value?.curriculum||null,curriculumNote:p.value?.curriculumNote||'',judge:p.value?.judge||null,ms:r.ms};break;}
        catch(e){last={provider:'codex',model,isolated:true,answer:null,note:'풀지 못함: '+e.message,ms:0};note('solve-retry',{model,error:e.message.slice(0,120)});}}runs.push(last);}
    const ans=Number.isInteger(q.answer)?q.answer+1:null,vd=verdict(ans,runs);X.recordCheck(work,{qid:id,version:v.label,contentHash:null,runs,verdict:vd,skipped:runs.every(r=>r.answer==null)?'풀이 실패':null});const lastCk=work.checks.filter(c=>c.qid===id).at(-1);if(lastCk)lastCk.curriculumRefs=cur;
    note('solve',{no:q.number,verdict:vd,answers:runs.map(r=>r.answer)});a.set(`두 모델 풀이 · ${++done}/${ids.length}`);render();};
  queue0.push(...ids);await Promise.all(Array.from({length:1},async()=>{while(queue0.length&&!stopS)await one(queue0.shift());}));a.done();
  if(stopS){say('ai',`풀이 검사를 멈췄어요. 끝난 문항 결과는 남겼어요. 다시 하려면 「풀이 검사해 줘」라고 해 주세요.`);save();return;}
  const ck=doneIds.map(id=>work.checks.filter(c=>c.qid===id&&c.version===v.label).at(-1)).filter(Boolean),bad=ck.filter(c=>c.verdict!=='pass');
  // 완주 6: 초안 직후엔 그림이 아직 없어 「그림이 아직 없음」이 16줄 나왔다(곧 뒤에서 그림을 그림) → 그런 문항은 한 줄로 묶는다.
  const waitFig=bad.filter(c=>c.verdict==='skipped'&&/그림 칸/.test(c.skipped||''));
  if(waitFig.length&&waitFig.length===bad.length&&ck.length-bad.length===0){say('ai',`${v.label}: 그림이 들어가야 풀 수 있는 문항 ${waitFig.length}개는 그림을 넣은 뒤 두 모델이 풀어요.`);save();return;}
  const used=[...new Set(ck.flatMap(c=>c.runs.filter(r=>r.answer!=null||!/^풀지 못함/.test(r.note||'')).map(r=>r.model)))];
  say('ai',`${v.label} 두 모델 풀이(한 회사 두 모델: ${used.join('·')||SOLVERS.map(s=>s.label).join('·')}${used.some(m=>!SOLVERS.some(s=>s.model===m))?' — 기본 둘째 모델이 막혀 대신 푼 모델이 있어요':''}) — 문항 ${ck.length}개 중 통과 ${ck.length-bad.length}${bad.length?` · 확인 필요 ${bad.filter(c=>!waitFig.includes(c)).map(c=>`${work.questions.find(q=>q.id===c.qid)?.number}번(${({doubt:'두 모델 답이 갈림',fail:'두 모델 모두 정답과 다름',single:'한 모델만 풂',skipped:c.skipped&&/그림 칸/.test(c.skipped)?'그림이 아직 없음':'풀지 못함'})[c.verdict]||c.verdict})`).join(', ')}`:''}${waitFig.length?` · 그림을 기다리는 문항 ${waitFig.length}개`:''}. 고칠지는 말씀해 주시면 정해요.`,{art:{tab:'check',icon:'list',title:`점검 · ${v.label}`,sub:`통과 ${ck.length-bad.length} · 확인 필요 ${bad.filter(c=>!waitFig.includes(c)).length}`}});save();}

// 문항 대화(하위 세션)
async function subSend(text){const q=work.questions.find(x=>x.id===sub);if(!q)throw Error('문항이 없어요');
  if(wantsApply(text)){let props=(work.proposals||[]).filter(p=>p.qid===q.id&&['current','agreed'].includes(p.state));
    if(!props.length){const lastAi=[...subThread(q.id)].reverse().find(m=>m.role==='ai'&&!m.error&&m.text);if(!lastAi){say('ai','이 문항에 반영할 안이 없어요. 어떻게 바꿀지 먼저 말씀해 주세요.');return;}
      const pid=await proposalFrom(q,`교사가 바로 앞에서 합의한 안을 그대로 반영하라고 했다(「${text}」). 아래 합의 내용을 문항에 옮길 proposal.changes를 만들어라. 합의에 없는 칸은 건드리지 마.\n[합의한 안]\n${lastAi.text}`,[]);if(!pid){say('ai','합의한 안을 고칠 칸으로 옮기지 못했어요. 바꿀 곳을 한 번 더 짚어 주세요. 바뀐 것은 없어요.',{error:true});return;}props=[work.proposals.find(p=>p.id===pid)];}
    for(const p of props){p.state='agreed';for(const cid of p.comments||[])X.updateComment(work,cid,{status:'decided'});if(!p.comments?.length){const cid=X.addComment(work,{qid:q.id,text:'(문항 대화에서 정함) '+p.summary,onVersion:work.head});X.updateComment(work,cid,{status:'decided',proposals:[p.id]});}}
    await applyNow(`${q.number}번 문항 대화에서 반영`);return;}
  const discuss=wantsDiscussOnly(text),fh=await folderHits(text,3,(q.ask||'')+' '+q.blocks.map(b=>b.text||'').join(' '));
  const r=await call('author',{packet:packetFor(q,{kind:/^검토/.test(text)?'review':'chat',text:discuss?text+'\n(교사가 고치지 말고 상의하자고 했다: proposal은 null로 두고 대화로만 답해.)':text+'\n(안을 말할 때는 그 안을 proposal.changes에도 넣어 줘. 앱은 교사가 「반영해」라고 하기 전까지 문항을 바꾸지 않는다.)'+(fh.length?'\n\n'+folderPrompt(fh):'')})},{onProgress:p=>{}});
  const resp=r.response,changes=discuss?[]:proposalChanges(q,resp.proposal);let pid=null;
  if(changes.length)pid=X.addProposal(work,{qid:q.id,changes,before:beforeOf(q,changes),summary:resp.proposal?.summary||'AI 안',comments:[],effects:{answer:changes.some(c=>c.path==='answer')}});
  // 폴더 시나리오: 검토 답에 거의 늘 고칠 안이 같이 와서 근거·검토 축 기록을 건너뛰었다(칸 근거 0) → 안이 있어도 지금 판의 축·근거는 기록(풀이는 안 기준이라 뺌).
  const evMap=new Map([...(r.evidence||[]).map(e=>[e.ref,{kind:e.kind,title:e.title,quote:e.quote,page:e.page||null,ref:e.ref}]),...hitEvidence(fh)]);
  if(changes.length){if(resp.review||resp.evidenceUsed?.length)recordReview(q,{review:resp.review,evidenceUsed:resp.evidenceUsed},{evidence:evMap});}
  else if(resp.review||resp.solve||resp.evidenceUsed?.length)recordReview(q,resp,{evidence:evMap});
  say('ai',resp.reply+(pid?'\n\n아직 고치지 않았어요. 이대로 할지 말씀해 주시고, 고치려면 「반영해」라고 해 주세요.':''),{proposalId:pid,asks:resp.questions||[],model:r.meta?.model,ms:r.meta?.ms});
  note('sub',{qid:q.id,proposal:!!pid,discuss,ms:r.meta?.ms,kind:/^검토/.test(text)?'review':'chat',evidenceUsed:(resp.evidenceUsed||[]).map(e=>e.ref+'→'+e.target).slice(0,8),folder:fh.map(h=>h.ref),review:!!resp.review,recorded:(q.authoring?.evidence||[]).length});
}

// ── 그림(제작 명세 → 기존 그림 엔진). 빈 그림 칸에 넣는 것은 빈 칸 채우기 ──
const drawingQ=new Set();
async function drawFigure(qid,i,{bg=false}={}){const q=work.questions.find(x=>x.id===qid),spec=q?.figureSpecs?.[i];if(!spec)return false;drawingQ.add(qid);render();if(!bg)busy++;const a=bg?{set(){},done(){}}:act(`${q.number}번 그림 그리는 중…`);
  try{const r=await call('figure',{qid,kind:spec.kind,description:spec.description,mustNot:spec.mustNot||[]},{group:'figure'});
    let slot=q.blocks.find(b=>b.kind==='figure'&&!b.figure?.data);
    if(!slot){toast('빈 그림 칸이 없어 새 그림 칸을 만들었어요');slot={id:crypto.randomUUID(),parent:null,kind:'figure',label:spec.kind==='graph'?'그래프':'그림',text:'',layout:'세로',figure:null};q.blocks.push(slot);}
    slot.figure={name:`${spec.kind==='graph'?'그래프':'그림'}.png`,data:r.data,...(r.width?{width:r.width,height:r.height}:{})};spec.done=true;work.dirty=true;save();render();note('figure',{no:q.number,ms:r.ms,bg});if(!bg)toast(`${q.number}번 그림을 넣었어요`);return true;}
  catch(e){note('figure-fail',{no:q?.number,error:e.message});const wasSub=sub;sub=null;if(!bg)say('ai',`${q?.number}번 ${spec.kind==='graph'?'그래프':'그림'}을 그리지 못했어요: ${e.message} · 문항의 그림 칸은 그대로예요. 「문항 검토」 → ${q?.number}번 「그림」에서 다시 「그리기」를 누르거나, image에서 직접 그려 넣을 수 있어요.`,{error:true});sub=wasSub;render();return false;}finally{drawingQ.delete(qid);a.done();if(!bg)busy--;}}
// v8 초안 단계(「초안 v0.1 · 그림 8장」): 초안 뒤 빈 그림 칸을 뒤에서 차례로 그린다(빈 칸 처음 채우기 — 결정 7). 대화는 막지 않는다. 다 그리면 판을 올리고 그 문항만 다시 푼다.
async function drawAll(){const jobs=[];for(const q of X.orderedQuestions(work))(q.figureSpecs||[]).forEach((f,i)=>{if(!f.done&&q.blocks.some(b=>b.kind==='figure'&&!b.figure?.data))jobs.push({qid:q.id,i,no:q.number});});if(!jobs.length)return;
  const queue=[...jobs];let stopF=false;const a=act(`그림 ${jobs.length}장 그리는 중 · 0/${jobs.length} (그동안 대화해도 돼요)`,{onStop:()=>{stopF=true;queue.length=0;cancelGroup('figure');}});let done=0;const ok=[],fail=[];
  await Promise.all(Array.from({length:2},async()=>{while(queue.length){const j=queue.shift();(await drawFigure(j.qid,j.i,{bg:true})?ok:fail).push(j);a.set(`그림 ${jobs.length}장 그리는 중 · ${++done}/${jobs.length} (그동안 대화해도 돼요)`);}}));a.done();
  if(stopF&&!ok.length){say('ai','그림 그리기를 멈췄어요. 그림 칸은 그대로예요. 「문항 검토」의 「그림」에서 하나씩 그릴 수 있어요.');return;}
  if(ok.length){const v=commit(`그림 ${ok.length}장`,{changed:[...new Set(ok.map(j=>j.qid))]});say('ai',`그림 ${ok.length}장을 빈 그림 칸에 넣어 ${v.label}로 올렸어요${fail.length?` · 못 그린 것 ${fail.length}장(${[...new Set(fail.map(j=>j.no))].join('·')}번) — 「문항 검토」의 「그림」에서 다시 그리기`:''}. 그림이 들어간 문항을 두 모델이 다시 풀어요.`,{stats:v.stats});note('draw-all',{ok:ok.length,fail:fail.length});void solveChanged(v);}
  else say('ai',`그림을 그리지 못했어요(${fail.length}장). 「문항 검토」의 「그림」에서 다시 그리거나 image에서 직접 넣어 주세요.`,{error:true});}

// ── 한글에서 고친 판: 차이 보고까지만(결정 2) ──
async function importHwpx(file){const a=act('받은 한글 파일과 지금 판을 문항별로 비교하는 중…');
  try{const paras=await hwpxText(new Uint8Array(await file.arrayBuffer()));const d=diffAgainst(paras,X.orderedQuestions(work));
    work.imports.push({id:crypto.randomUUID(),at:nowIso(),name:file.name,against:work.head,diff:d,state:'reported'});save();
    const lines=[...d.order.map(o=>`순서 · ${o.no}번 자리 바뀜(${o.from}→${o.to})`),...d.text.map(t=>`글 · ${t.no}번 「${String(t.before).slice(0,40)}」 → 「${String(t.after).slice(0,40)}」`),...d.missing.map(m=>`빠짐 · ${m.no}번 ${m.what}`),...d.points.map(p=>`배점 · ${p.no}번 ${p.before}→${p.after??'없음'}`)];
    say('ai',`받은 파일(${file.name})과 ${work.head||'지금'} 판을 비교했어요. 아직 원본에 반영하지 않았어요.\n${lines.length?lines.map(l=>'- '+l).join('\n'):'- 눈에 띄는 차이가 없어요.'}\n반영할 것은 말씀해 주시면 「지금 → 바꿀 안」으로 만들어 둘게요.`,{diff:true});note('hwpx-diff',{n:lines.length});}
  catch(e){say('ai','한글 파일을 읽지 못했어요: '+e.message,{error:true});note('hwpx-fail',{error:e.message});}finally{a.done();}}

// ── 조판: exam으로 보내 학교 양식 조판·한글 내보내기 ──
async function sendToExam(){if(pendingCount()||work.dirty)bumpVersion('exam으로 보내기 전 판 올리기',{solve:false});try{const bundle=X.toSheetBundle(work);const blob=buildSheetProject(bundle,{name:work.meta.title||'시험지'});const bytes=new Uint8Array(await blob.arrayBuffer());
  post({action:'open-project',name:`${work.meta.title||'시험지'}.5e`,bytes});work.outputs.push({version:work.head,kind:'exam-sheet',at:nowIso()});work.meta.stage=work.meta.stage==='final'?'final':'typeset';save();note('to-exam',{bytes:bytes.length});toast('exam으로 보냈어요 · 불러올 내용 확인 창에서 「적용」을 누르면 시험지로 들어가요');}
  catch(e){toast('exam으로 보내지 못했어요: '+e.message);note('to-exam-fail',{error:e.message});}}

// ── 그리기 ──
const tex=s=>String(s??'').split(/(\$[^$]+\$)/g).map(part=>{if(/^\$[^$]+\$$/.test(part)){try{return window.katex?katex.renderToString(part.slice(1,-1),{throwOnError:false}):E(part.slice(1,-1));}catch{return E(part);}}return E(part).replace(/\n/g,'<br>');}).join('');
function dot(q,key){const s=X.cellEvidence(q,key);if(s==='ok')return '';return `<span class="edot ${s}" data-ev="${E(q.id)}|${E(key)}" title="${s==='waived'?'근거 없음 — 예외로 진행':s==='problem'?'근거와 맞지 않는 곳이 있어요':'근거가 아직 없어요 · 누르면 보기'}"></span>`;}
function paperHtml(q,opt={}){const LK=key=>opt.locks&&(q.locks||[]).some(l=>l.key===key)?'<span class="lockx" title="직접 고친 칸 — AI가 덮어쓰지 않아요"><svg class="i s"><use href="#i-lock"/></svg>직접 고침</span>':'';const T=(key,txt)=>{const x=opt.ins?.get(key);return (x?`<span class="del">${tex(txt)}</span> <span class="ins">${tex(x)}</span>`:tex(txt))+LK(key);};let h=`<p class="q" data-cell="${E(q.id)}|ask"><b>${E(q.number)}.</b> `;const blocks=q.blocks.filter(b=>!b.parent);const first=blocks.find(b=>b.kind==='text'&&b.text);
  if(first)h+=`<span data-cell="${E(q.id)}|block:${E(first.id)}">${T('block:'+first.id,first.text)}${dot(q,'block:'+first.id)}</span></p>`;else h+='</p>';
  for(const b of q.blocks){if(b===first||b.kind==='bogi')continue;
    if(b.kind==='text'&&b.text)h+=`<p data-cell="${E(q.id)}|block:${E(b.id)}">${T('block:'+b.id,b.text)}${dot(q,'block:'+b.id)}</p>`;
    else if(b.kind==='figure')h+=b.figure?.data?`<img class="fig" src="${b.figure.data}" alt="${E(b.label)}" data-cell="${E(q.id)}|block:${E(b.id)}">`:drawingQ.has(q.id)?`<div class="drawing" data-figslot="${E(q.id)}|${E(b.id)}">${E(b.label||'그림')} 그리는 중…</div>`:`<span class="figslot" data-figslot="${E(q.id)}|${E(b.id)}">${E(b.label||'그림')} · 아직 그림 없음</span>`;
    else if(b.kind==='table')h+=`<table class="dt" data-cell="${E(q.id)}|block:${E(b.id)}">${b.table.cells.map((r,ri)=>`<tr>${r.map((c,ci)=>`<td data-tcell="${E(q.id)}|block:${E(b.id)}|${ri}|${ci}">${tex(c.value)}</td>`).join('')}</tr>`).join('')}</table>`;
    else if(b.lines)h+=`<div class="box">${b.lines.map(l=>`<p data-cell="${E(q.id)}|line:${E(l.id)}">${E(l.label)} ${T('line:'+l.id,l.text)}${dot(q,'line:'+l.id)}</p>`).join('')}</div>`;}
  h+=`<p data-cell="${E(q.id)}|ask">${T('ask',q.ask)} <span class="pt">[${E(q.points)}점]</span>${dot(q,'ask')}</p>`;
  const bogi=q.blocks.find(b=>b.kind==='bogi'&&b.lines?.some(l=>String(l.text||'').trim()));if(bogi)h+=`<div class="bogi">${bogi.lines.map(l=>`<p data-cell="${E(q.id)}|line:${E(l.id)}">${E(l.label)}. ${T('line:'+l.id,l.text)}${dot(q,'line:'+l.id)}</p>`).join('')}</div>`;
  if(q.type!=='서술형')h+=`<div class="choices${q.choices.some(c=>String(c.text).length>14)?' v':''}">${q.choices.map((c,i)=>`<p data-cell="${E(q.id)}|choice:${E(c.id)}">${CIRCLED[i]} ${T('choice:'+c.id,c.text)}</p>`).join('')}</div>`;
  return h;}
function statsLine(s){if(!s)return '';const c=s.countByNumber||{};return `정답 ${s.answers.map(a=>a?CIRCLED[a-1]:'·').join(' ')} · ${[1,2,3,4,5].map(n=>`${CIRCLED[n-1]}${c[n]||0}`).join(' ')} · 최대 연속 ${s.longestRun} · 합계 ${s.pointsTotal}점`;}
function curQid(){if(sub)return sub;const box=$('#t-review');if(tab!=='review'||!box)return work.questions.length?X.orderedQuestions(work)[0].id:null;const top=box.getBoundingClientRect().top;const rows=[...box.querySelectorAll('.qrow[data-q]')];const r=rows.find(x=>x.getBoundingClientRect().bottom>top+40);return r?.dataset.q||rows[0]?.dataset.q||null;}
function pickHtml(m){const list=(m.pick||[]).map(id=>(work.sources.picked||[]).find(p=>p.id===id)).filter(Boolean);if(!list.length)return '';if(m.pickDone)return `<p class="note2">${E(m.pickDone)}</p>`;
  const cq=work.questions.find(q=>q.id===curQid());const opts=X.orderedQuestions(work).map(q=>`<option value="${E(q.id)}">${E(q.number)}번</option>`).join('');
  return `<div class="pickrow">${list.map(p=>`<figure><img src="${p.data}" alt="${E(p.name)}"><figcaption>${E(p.name)}</figcaption></figure>`).join('')}</div>
<div class="pickbtns">${cq?`<button class="btn sm" data-pickto="${E(cq.id)}">${E(cq.number)}번 그림 칸에 넣기</button>`:''}${opts?`<select class="picksel" data-pickq title="다른 문항 고르기"><option value="">다른 문항 고르기</option>${opts}</select>`:''}<button class="btn sm" data-pickchat>대화에 첨부만</button></div>
<p class="note2">넣으면 출처(${E(list.map(p=>p.name).join(' · '))})가 그 문항 근거에 남아요.</p>`;}
function placePicked(msg,qid){const q=work.questions.find(x=>x.id===qid);if(!q)return;const list=(msg.pick||[]).map(id=>(work.sources.picked||[]).find(p=>p.id===id)).filter(Boolean);
  for(const p of list){let slot=q.blocks.find(b=>b.kind==='figure'&&!b.figure?.data);if(!slot){slot={id:crypto.randomUUID(),parent:null,kind:'figure',label:'그림',text:'',layout:'세로',figure:null};const ai=q.blocks.findIndex(b=>b.kind==='bogi');ai>=0?q.blocks.splice(ai,0,slot):q.blocks.push(slot);}
    slot.figure={name:p.name+'.png',data:p.data};X.lockCell(q,'block:'+slot.id);const a=ensureAuthoring(q);a.evidence.push({id:crypto.randomUUID(),target:'block:'+slot.id,claim:'라이브러리에서 가져온 그림',judgement:'direct',by:'teacher',note:'라이브러리',reviewVersion:null,at:nowIso(),source:{kind:'document',title:p.name,quote:'',page:null}});
    work.pendingEdits=[...(work.pendingEdits||[]),{qid:q.id,key:'block:'+slot.id,label:'라이브러리 그림',at:nowIso()}];}
  work.dirty=true;msg.pickDone=`${q.number}번 그림 칸에 넣었어요(${list.length}장). 직접 넣은 그림이라 잠겨 있고, 다음 「판 올리기」 때 판에 들어가요.`;save();render();note('library-place',{no:q.number,n:list.length});}
let pendingAttach=[];
function renderThread(){const list=sub?subThread(sub):work.chat;
  $('#thread').innerHTML=list.map((m,i)=>m.role==='me'?`<div class="msg u"><p>${E(m.text)}</p></div>`:`<div class="msg a${m.error?' err':''}">${logsHtml(m,i)}${String(m.text).split(/\n+/).map(p=>`<p>${E(p)}</p>`).join('')}${decHtml(m)}${artHtml(m)}${(m.asks||[]).length?`<div class="ledger"><div class="lh">꼭 정해야 해요</div>${m.asks.map(a=>`<div class="lr"><span class="ln">?</span><span>${E(a)}</span></div>`).join('')}</div>`:''}${choicesHtml(m,i)}${m.stats?`<p class="note2">${E(statsLine(m.stats))}</p>`:''}${m.ledger?ledgerHtml():''}${m.pick?pickHtml(m):''}${(m.ruleCards||[]).filter(r=>!r.done).map(r=>`<div class="rulec" data-rule="${E(r.id)}" data-msg="${i}"><svg class="i s"><use href="#i-book"/></svg> 이걸 규칙으로 저장할까요? <b>「${E(r.text)}」</b><span class="sp"></span><button class="btn sm" data-layer="global">전체</button><button class="btn sm" data-layer="subject">과목</button><button class="btn sm" data-layer="exam">이 시험지</button><button class="btn sm gh" data-layer="no">아니요</button></div>`).join('')}${m.model?`<p class="note2">${E(m.model)}${m.ms?` · ${Math.round(m.ms/1000)}초`:''}</p>`:''}</div>`).join('');
  for(const el of acts)$('#thread').append(el);$('#scroll').scrollTop=1e7;}
const ST={new:'새 코멘트',talk:'의논 중',decided:'결정됨',applied:'반영됨',dropped:'안 함'},SC={new:'b-ok',talk:'b-talk',decided:'b-ok',applied:'b-done',dropped:'b-ok'};
function ledgerHtml(){const list=work.comments.filter(c=>c.status!=='dropped').slice(-20);if(!list.length)return '';return `<div class="ledger"><div class="lh">코멘트 대장 · ${E(work.head||'v0.0')}</div>${list.map(c=>`<div class="lr"><span class="ln">${E(work.questions.find(q=>q.id===c.qid)?.number||'전체')}번</span><span>${E(c.gist||c.text).slice(0,80)}</span><span class="cst ${SC[c.status]}">${ST[c.status]}</span></div>`).join('')}</div>`;}
function renderPlan(){const m=work.meta,chip=(k,label,fmt=v=>v)=>{const x=m[k];if(!x||x.value==null||x.value==='')return `<span class="c miss"><b>${label}</b>아직</span>`;return `<span class="c${x.by==='ai'?' ai':''}"><b>${label}</b>${E(fmt(x.value))}</span>`;};
  const list=v=>Array.isArray(v)?v.join(' · '):typeof v==='object'?Object.entries(v).map(([k,n])=>k+n).join(' · '):v;
  $('#t-plan').innerHTML=`<div class="cond">${chip('subject','과목')}${chip('range','범위',list)}${chip('itemCount','문항',v=>v+'문항')}${chip('pointsTotal','총점',v=>v+'점')}${chip('pointKinds','배점',v=>list(v))}${chip('difficulty','난이도',list)}${chip('emphasis','강조',list)}${chip('form','양식')}</div>`+
   (work.plan.length?`<table class="ptable"><tr><th class="num">번호</th><th>성취기준</th><th>소단원</th><th>난이도</th><th>배점</th><th>유형</th><th>근거</th><th>그림</th><th>상태</th></tr>${work.plan.map(r=>{const A=r.by==='ai'?' class="auto" data-pfix':'';return `<tr data-row="${r.no}" class="${r.seen?'':'seen-no'}"><td>${r.no}</td><td${A}>${E((r.standards||[]).join(', '))}</td><td${A}>${E(r.unit)}</td><td${A}><span class="lv${/상|어려/.test(r.difficulty||'')?' h':/하|쉬/.test(r.difficulty||'')?' e':''}">${E(r.difficulty)}</span></td><td${A}>${E(r.points)}점</td><td${A}>${E(({combo:'합답형',single:'객관식',pair:'객관식',talk:'대화형',essay:'서술형'})[r.form]||r.form||'')}</td><td class="${r.by==='ai'?'auto bas':'bas'}"${r.by==='ai'?' data-pfix':''}>${E((r.basis||[]).map(b=>typeof b==='string'?b:(b?.title||b?.ref||'')).filter(Boolean).slice(0,2).join(', '))}</td><td${A}>${E(({reuse:'재활용',convert:'기출 변형',new:'새로',code:'코드 그래프',none:'없음'})[r.figure]||'')}</td><td class="${({set:'s-ok',choosing:'s-pick',empty:'s-empty',redesign:'s-talk'})[r.status]||''}">${r.qid?'문항 있음':({set:'잡힘',choosing:'고르는 중',empty:'빈자리',redesign:'다시 설계 중'})[r.status]||''}</td></tr>`;}).join('')}${work.plan.some(r=>r.by==='ai')?'<tr><td colspan="9" class="auto">점선 칸은 AI가 정한 것 — 눌러서 바꿀 수 있어요</td></tr>':''}</table>${planNote()}`:`<div class="empty-note">대화할수록 위에서부터 채워져요. 과목·범위·문항 수·총점이 정해지면 설계표를 잡아요.${X.missingBlocking(work).length?`<br>아직 정할 것: ${X.missingBlocking(work).map(k=>({subject:'과목',range:'범위',itemCount:'문항 수',pointsTotal:'총점'})[k]).join(' · ')}`:''}</div>`);
  // 설계표를 화면에 보였으면 「교사가 봄」(경계 규칙의 seen)
  if(tab==='plan'&&!$('#rp').closest('.panel-off')){let changed=false;for(const r of work.plan)if(!r.seen){r.seen=true;changed=true;}const ks=Object.keys(m).filter(k=>m[k]&&typeof m[k]==='object'&&'seen' in m[k]&&!m[k].seen&&m[k].value!=null);if(ks.length){X.markSeen(work,ks);changed=true;}if(changed)save();}
}
// ── 판 메뉴·두 판 나란히 보기(시안7 3·7번) ──
let compare=null;
function drawHist(){const m=$('#histMenu'),pn=pendingCount(),list=work.pendingEdits||[];
  m.innerHTML=(pn?`<div class="hvtop"><div class="hvrow"><b>고침 ${pn}</b><span>${E(list.slice(0,4).map(x=>`${work.questions.find(q=>q.id===x.qid)?.number||''}번 ${x.label}`).join(' · '))}${list.length>4?` 외 ${list.length-4}`:''}</span><button class="btn sm pri" id="bBump">판 올리기 ${E(X.nextLabel?X.nextLabel(work.head):'')}</button></div><div class="hvnote">「판 올려」라고 말해도 돼요. 풀이 검사·한글 내보내기·v1.0 선언 때는 자동으로 올라가요.</div></div>`:'')+
   (work.versions.slice().reverse().map(v=>`<div class="hv"><input type="checkbox" data-cmp="${E(v.label)}" title="두 판 비교에 고르기"><b>${E(v.label)}</b><span>${E(v.summary)} · ${new Date(v.at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span><button class="btn sm" data-restore="${E(v.label)}">이 판으로</button></div>`).join('')||'<div class="hv"><span>아직 판이 없어요</span></div>')+
   (work.versions.length>=2?`<div class="hvfoot"><span>판 두 개를 고르면</span><button class="btn sm pri" id="bCmp" disabled>두 판 비교</button></div>`:'');}
function renderCompare(){const va=work.versions.find(v=>v.label===compare.a),vb=work.versions.find(v=>v.label===compare.b);if(!va?.snapshot||!vb?.snapshot){compare=null;return false;}
  const A=new Map(va.snapshot.questions.map(q=>[q.id,q])),B=new Map(vb.snapshot.questions.map(q=>[q.id,q])),order=[...vb.snapshot.items,...va.snapshot.items.filter(id=>!vb.snapshot.items.includes(id))];
  const ch=order.filter(id=>JSON.stringify(stripMeta(A.get(id)||{}))!==JSON.stringify(stripMeta(B.get(id)||{})));const L=work.versions.map(v=>v.label);
  const sel=k=>`<select data-cmpsel="${k}">${L.map(l=>`<option${l===compare[k]?' selected':''}>${E(l)}</option>`).join('')}</select>`;
  const numOf=id=>(B.get(id)||A.get(id))?.number||'?';
  $('#t-review').innerHTML=`<div class="cmpbar"><b>두 판 비교</b>${sel('a')}<span>↔</span>${sel('b')}<span class="sp"></span><span>바뀐 문항 ${ch.length}개${ch.length?' · ':''}${ch.map(id=>`<u data-cmpgo="${E(id)}">${E(numOf(id))}번</u>`).join(' ')}</span><button class="btn sm" id="cmpClose">닫기</button></div>`+
    (ch.length?ch.map(id=>`<section class="cmprow" data-q="${E(id)}"><div class="cmpcol"><div class="cmplab">${E(compare.a)}</div><div class="kq cmppaper" data-side="a">${A.get(id)?paperHtml(A.get(id)):'<p class="empty-note">이 판에는 없는 문항</p>'}</div></div><div class="cmpcol"><div class="cmplab">${E(compare.b)}</div><div class="kq cmppaper" data-side="b">${B.get(id)?paperHtml(B.get(id)):'<p class="empty-note">이 판에서 빠진 문항</p>'}</div></div></section>`).join(''):'<div class="empty-note">두 판의 문항 내용이 같아요.</div>')+'<div style="height:70px"></div>';
  // 바뀐 칸 색: 화면 글이 아니라 두 판의 데이터로 칸마다 비교한다(옛 판 빨강+취소선, 새 판 초록).
  const val=(q,cell,tcell)=>{if(!q)return null;if(tcell){const [,k,r,c]=tcell.split('|');const b=q.blocks.find(x=>x.id===k.slice(6));return b?.table?.cells?.[+r]?.[+c]?.value??null;}
    const k=cell.split('|')[1];if(k.startsWith('block:')){const b=q.blocks.find(x=>x.id===k.slice(6));if(b?.kind==='figure')return b.figure?.data?String(b.figure.data.length)+b.figure.data.slice(-64):'';if(b?.kind==='table')return null;}const F=cellField(q,k);return F?F.get():null;};
  for(const row of $$('#t-review .cmprow')){const id=row.dataset.q,qa=A.get(id),qb=B.get(id);
    for(const side of ['a','b'])for(const el of row.querySelectorAll(`[data-side="${side}"] [data-cell],[data-side="${side}"] td[data-tcell]`)){if(el.classList.contains('q')||el.tagName==='TABLE')continue;
      const x=val(qa,el.dataset.cell,el.dataset.tcell),y=val(qb,el.dataset.cell,el.dataset.tcell);if(x===y)continue;el.classList.add(side==='a'?'hx-del':'hx-add');}}
  return true;}
// 근거 없는 칸(시안7 6번, 섞은 안): 3개 이하면 칸마다 점, 많으면 문항 머리에 숫자 하나 — 누르면 그 칸들에 점이 켜짐(그림 시험지에서 점 93개가 읽기 어려웠음).
const EV_DOTS_MAX=3,evShow=new Set();
function renderReview(){if(compare&&renderCompare())return;const qs=X.orderedQuestions(work);if(!qs.length){$('#t-review').innerHTML=drafting?`<section class="qrow hx-writing"><span class="dot"></span>${drafting.rows.length}문항 쓰는 중 · 첫 문항이 나오면 여기에 바로 보여요</section>`:'<div class="empty-note">아직 문항이 없어요. 설계표가 잡히면 「초안 써 줘」라고 말해 주세요.</div>';return;}
  const html=qs.map(q=>{const cs=work.comments.filter(c=>c.qid===q.id&&c.status!=='dropped'),props=(work.proposals||[]).filter(p=>p.qid===q.id&&!['applied','rejected'].includes(p.state)),ph=paperHtml(q),missN=(ph.match(/class="edot missing"/g)||[]).length,miss=X.cellKeys(q).some(k=>X.cellEvidence(q,k.key)==='missing'),many=missN>EV_DOTS_MAX&&!evShow.has(q.id);
    const ck=work.checks.filter(c=>c.qid===q.id).at(-1),ex=explanationParts(q);
    return `<section class="qrow" data-q="${E(q.id)}"><div class="qleft kq${many?' dots-off':''}">${ph}</div><div class="qright">
<div class="qmeta"><span class="qmt">${E(q.number)}번 · ${E(work.plan.find(r=>r.qid===q.id)?.unit||'')} · ${E(work.plan.find(r=>r.qid===q.id)?.difficulty||'')} · ${E(q.points)}점 · 정답 ${q.answer!=null?CIRCLED[q.answer]:'—'}</span><span class="qtags">${(q.locks||[]).length?`<span class="lockn" title="직접 고친 칸은 AI가 덮어쓰지 않아요">직접 고친 칸 ${q.locks.length}</span>`:''}${missN>EV_DOTS_MAX?`<span class="evn${evShow.has(q.id)?' on':''}" data-evn="${E(q.id)}" title="누르면 그 칸들에 점이 켜져요">근거 없는 칸 ${missN}</span>`:miss?'<span class="exdot" title="근거 없는 칸이 있어요"></span>':''}${q.origin?.source?`<span class="srcn" title="보관함(옛 파일)에서 복사해 온 문항 · 원본은 그대로">출처 ${E(String(q.origin.source.file).replace(/\.[^.]+$/,''))} ${E(q.origin.source.no)}번</span>`:''}</span><span class="sp"></span><button class="btn sm" data-sub="${E(q.id)}"><svg class="i s"><use href="#i-msg"/></svg>이 문항 대화</button></div>
<div class="qtabs"><button data-pane="ev">근거</button><button data-pane="sol">해설</button><button data-pane="chk">검토</button>${(q.figureSpecs||[]).filter(f=>!f.done).length?'<button data-pane="fig">그림</button>':''}</div>
<div class="qpane" data-p="ev" hidden>${X.cellKeys(q).map(k=>{const st=X.cellEvidence(q,k.key),list=(q.authoring?.evidence||[]).filter(e=>e.target===k.key);return `<div class="ev${st!=='ok'?' ev-x':''}"><b>${E(k.label)}</b><span>${list.length?list.map(e=>E((e.source?.title||'')+(e.source?.page?` ${e.source.page}쪽`:'')+' · '+e.claim)).join('<br>'):st==='waived'?'근거 없음 — 예외로 진행':'근거 없음'}</span></div>`;}).join('')}</div>
<div class="qpane" data-p="sol" hidden>${ex.parts.map(p=>`<p><b>${E(p.key)}</b> ${tex(p.text)}${p.ox?` → ${p.ox==='o'?'옳다':'옳지 않다'}`:''}</p>`).join('')||'(해설 없음)'}</div>
<div class="qpane" data-p="chk" hidden>${ck?`${ck.runs.map(r=>`<div class="chk-row"><b>${E(r.model)}</b><span>${r.answer?CIRCLED[r.answer-1]:'—'} · ${E(r.note)}</span></div>`).join('')}<p><b>결론</b> ${E(({pass:'두 모델 일치 · 정답과 같음',doubt:'두 모델 답이 갈림',fail:'두 모델 모두 정답과 다름',single:'한 모델만 풂',skipped:'풀지 못함'})[ck.verdict]||ck.verdict)} (${E(ck.version)} · 한 회사 두 모델)</p>`:'아직 풀이 검사 전이에요.'}</div>
${(q.figureSpecs||[]).length?`<div class="qpane" data-p="fig" hidden>${q.figureSpecs.map((f,i)=>`<p>${f.done?'✓ ':''}${E(f.kind==='graph'?'그래프':'그림')} · ${E(f.description).slice(0,220)} ${f.done?'':`<button class="btn sm" data-draw="${E(q.id)}|${i}">그리기</button>`}</p>`).join('')}</div>`:''}
<div class="cbox2"><div class="ch">문항 전체${cs.length?` · 코멘트 ${cs.length}`:''}<span class="sp"></span></div>
<div class="clist">${cs.map(c=>`<div class="ci"><div class="ctext">${E(c.text)} <span class="cst ${SC[c.status]}">${ST[c.status]}</span></div>${c.answer?`<div class="cans">${E(c.answer).slice(0,600)}</div>`:''}</div>`).join('')}</div>
${props.map(p=>`<div class="prop"><b>지금 → 바꿀 안</b> · ${E(p.summary)}${p.changes.slice(0,6).map((c,i)=>`<div><span class="pb">${E(String(p.before?.[i]??'').slice(0,120))}</span> → <span class="pa">${E(String(c.value??'').slice(0,160))}</span></div>`).join('')}</div>`).join('')}
<textarea data-comment="${E(q.id)}" placeholder="편하게 코멘트를 적어 주세요 · ⌘↵로 쌓기"></textarea></div></div></section>`;}).join('')+(drafting?`<section class="qrow hx-writing"><span class="dot"></span>${drafting.writing.size?[...drafting.writing].sort((x,y)=>x-y).join('·')+'번 쓰는 중':''}${(()=>{const w=drafting.rows.filter(r=>!r.qid&&!drafting.writing.has(r.no)).map(r=>r.no);return w.length?`${drafting.writing.size?' · ':''}${w.length>2?`${w[0]}~${w.at(-1)}`:w.join('·')}번 기다리는 중`:'';})()}</section>`:'')+'<div style="height:70px"></div>';
  // 칸 그 자리 편집 중이면 그 문항 칸은 다시 그리지 않는다(문항이 새로 들어오거나 코멘트가 붙어도 편집이 끊기지 않게). 노드를 옮기면 초점이 빠지므로 둘레만 바꾼다.
  const box=$('#t-review'),keep=editing&&box.querySelector(`.qrow[data-q="${editing.qid}"]`);
  if(keep){const tmp=document.createElement('div');tmp.innerHTML=html;const nodes=[...tmp.children],i=nodes.findIndex(n=>n.dataset?.q===editing.qid);
    if(i>=0){for(const c of [...box.children])if(c!==keep)box.removeChild(c);keep.before(...nodes.slice(0,i));keep.after(...nodes.slice(i+1));}else box.innerHTML=html;}
  else box.innerHTML=html;
  $$('#t-review .qrow').forEach(row=>{const qid=row.dataset.q;const q=work.questions.find(x=>x.id===qid);if(q&&!q.seen){q.seen=true;}});
}
function renderSheet(){if(editing&&editing.el?.closest?.('#t-sheet')&&document.contains(editing.el))return;const qs=X.orderedQuestions(work),m=work.meta;const s=X.computeStats(qs);const open=openProposals();let pinNo=0;
  $('#t-sheet').innerHTML=`<div class="sheetwrap"><div class="sheetnote"><svg class="i s"><use href="#i-hwp"/></svg>미리보기 기준 — 시험지 모양은 조판 단계(exam·hwp)에서 확정해요. 내용은 바꾸지 않아요.</div>
<div class="sheetbar"><button class="btn sm pri" id="bToExam">exam으로 보내 조판</button><button class="btn sm" id="bHwpx">한글에서 고친 판 가져오기</button><button class="btn sm" id="bFinal">${work.head&&/^v[1-9]/.test(work.head)?'다음 확정판 선언':'v1.0 선언'}</button><button class="btn sm" id="bSaveFile">시험지 파일 저장(.5e)</button></div>
<div class="paper2"><div class="ph1"><span class="l">${E([m.term?.value,m.examName?.value].filter(Boolean).join(' '))}</span><span class="m">${E(m.subject?.value||'')}</span><span class="r">${E(m.grade?.value||'')}</span></div><div class="ph2"></div>
<div class="cols2">${qs.map(q=>{const props=open.filter(p=>p.qid===q.id),cs=work.comments.filter(c=>c.qid===q.id&&['new','talk','decided'].includes(c.status)),ck=work.checks.filter(c=>c.qid===q.id).at(-1),warn=ck&&['doubt','fail'].includes(ck.verdict);
  return `<div class="kq qblock" data-q="${E(q.id)}">${paperHtml(q,{ins:insMap(q,props),locks:true})}${props.map(p=>suggHtml(q,p,open.indexOf(p)+1,open.length)).join('')}${resolvedHtml(q)}<span class="pins">${cs.length?`<span class="pin" data-pin="${E(q.id)}" title="코멘트 ${cs.length}개 · 누르면 보기">${++pinNo}</span>`:''}${warn?`<span class="pin w" data-pin="${E(q.id)}" title="풀이 검사: ${E(({doubt:'두 모델 답이 갈림',fail:'두 모델 모두 정답과 다름'})[ck.verdict])}">!</span>`:''}</span></div>`;}).join('')||'<p class="empty-note">문항이 없어요.</p>'}</div></div>
<div class="anskey"><b>정답표 · ${E(work.head||'v0.0')}</b><table><tr>${qs.map(q=>`<th>${E(q.number)}</th>`).join('')}</tr><tr>${qs.map(q=>`<td>${q.answer!=null?CIRCLED[q.answer]:'서술'}</td>`).join('')}</tr><tr>${qs.map(q=>`<td>${E(q.points)}</td>`).join('')}</tr></table><p class="note2">${E(statsLine(s))}</p></div></div>`;placeSuggs();}
const STAGE={design:'설계 중',draft:'쓰는 중',review:'검토 중',typeset:'조판 중',final:'확정'};
const termOf=t=>{const d=t?new Date(t):new Date(),y=d.getFullYear(),m=d.getMonth()+1;return m>=3&&m<=8?y+'-1':m>=9?y+'-2':(y-1)+'-2';};
// 시안 v7: 제안 상자는 바뀌는 문단 바로 아래
function placeSuggs(){for(const sg of $$('#t-sheet .sugg[data-skey]')){const k=sg.dataset.skey;if(!k)continue;const blk=sg.closest('.qblock');const cell=blk?.querySelector(`[data-cell="${CSS.escape(blk.dataset.q+'|'+k)}"]`);if(!cell)continue;const host=cell.closest('.box,.bogi,.choices')||cell.closest('p')||cell;if(blk.contains(host))host.after(sg);}}
function renderSide(list){sideList=list||[];const box=$('#examList');if(!box)return;const rows=sideList.filter(x=>!x.empty||(work&&x.id===work.projectId&&view==='work'));const now=termOf();
  const btn=x=>`<button class="exam${work&&x.id===work.projectId&&view==='work'?' on':''}" data-open="${E(x.id)}">${E(x.title)}<small>${E(x.head||'v0.0')} · ${E(STAGE[x.stage]||'')}</small></button>`;
  const cur=rows.filter(x=>termOf(x.at)===now),old=rows.filter(x=>termOf(x.at)!==now);
  box.innerHTML=`<div class="grp">이번 학기</div>${cur.slice(0,12).map(btn).join('')||'<div class="side-empty">아직 없어요</div>'}${old.length?`<div class="grp">지난 학기</div>${old.slice(0,8).map(btn).join('')}`:''}`;}
function showOriginNotices(){for(const n of work.originNotices||[])if(!n.shown){n.shown=true;const wasSub=sub;sub=null;say('ai',`원본 「${n.file}」이 이 시험지로 가져온 뒤에 고쳐졌어요: ${n.nos.map(x=>x+'번').join(', ')}. 이 시험지의 문항은 그대로예요. 원본처럼 바꾸려면 그 문항에서 말해 주세요.`);sub=wasSub;}}
function render(){if(!work)return;showOriginNotices();const title=work.meta.title||'새 시험지';$('#exTitleT').textContent=title;$('#pTitle').textContent=title;work.ui={...(work.ui||{}),tab};renderChrome();
  $('#verChat').textContent=work.head||'v0.0';$('#verBtn').firstChild.textContent=(work.head||'v0.0')+' ';
  let pc=$('#pendChip');if(!pc){pc=document.createElement('span');pc.id='pendChip';pc.className='pendchip';pc.title='판 메뉴에서 「판 올리기」 또는 「판 올려」라고 말하기';$('#verBtn').after(pc);}const pn=pendingCount();pc.hidden=!pn;pc.textContent=`판에 안 들어간 고침 ${pn}`;
  $('#crumb').classList.toggle('has-sub',!!sub);if(sub)$('#subName').textContent=(work.questions.find(q=>q.id===sub)?.number||'')+'번 문항';
  $$('#seg button').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));for(const t of ['plan','review','sheet','check'])$('#t-'+t).hidden=t!==tab;
  const c=X.commentCounts(work);$('#counts').textContent=`코멘트 ${work.comments.length} · 의논 중 ${c.talk||0} · 결정 ${c.decided||0} · 반영 ${c.applied||0}`;
  $('#dock2').hidden=tab!=='review'||!(c.decided||c.talk||c.new);$('#dock2').innerHTML=`<span>새 코멘트 <b>${c.new||0}</b> · 결정된 것 <b>${c.decided||0}</b> · 의논 중 <b>${c.talk||0}</b></span>${c.new?'<button class="btn sm" id="bTriage">코멘트 보내기</button>':''}<button class="btn sm pri" id="bApply"${c.decided?'':' disabled'}>결정된 것만 반영</button>`;
  $('#input').placeholder=drafting?'쓰는 동안에도 나온 문항에 코멘트·질문할 수 있어요':'말로 시키기 · @3번처럼 문항 지목 · 고칠 때는 「반영해」라고 말해야 고쳐요';
  if(tab==='plan')renderPlan();else if(tab==='review')renderReview();else if(tab==='check')renderCheck();else renderSheet();renderThread();}
// ── 점검 탭(결정 6 · 시안7 4번): 교과서 대조 · 수준 · 교육과정 · 두 모델 판정 · 종합 · 고친 점. PDF·한글 내보내기는 동결 뒤. ──
function renderCheck(){const qs=X.orderedQuestions(work);if(!qs.length){$('#t-check').innerHTML='<div class="empty-note">아직 문항이 없어요.</div>';return;}
  const KIND={textbook:'교과서',past:'기출',document:'자료',curriculum:'교육과정'};let cnt={그대로:0,고치면:0,none:0,missing:0};
  const rows=qs.map(q=>{const ck=work.checks.filter(c=>c.qid===q.id&&c.runs?.length).at(-1),plan=work.plan.find(r=>r.qid===q.id);
    const ev=(q.authoring?.evidence||[]).filter(e=>e.source&&['direct','conditional','derived'].includes(e.judgement));const miss=(paperHtml(q).match(/class="edot missing"/g)||[]).length;if(miss)cnt.missing++;
    const tb=[...new Set(ev.map(e=>`${KIND[e.source.kind]||e.source.kind||''} ${e.source.title||''}${e.source.page?` ${e.source.page}쪽`:''}`.trim()))].slice(0,3).join(', ');
    const A=ck?.runs?.[0],B=ck?.runs?.[1];const j=r=>r?.judge||(r&&Number.isInteger(r.answer)?(r.answer===(q.answer!=null?q.answer+1:null)?'그대로':'고치면'):'—');
    const lv=[A,B].map(r=>r?.level).filter(Boolean),cu=[A,B].map(r=>r?.curriculum).filter(Boolean),cuNote=[A,B].map(r=>r?.curriculumNote).find(Boolean)||'';
    const total=!ck?'—':(ck.verdict!=='pass'||[A,B].some(r=>j(r)==='고치면')||lv.includes('넘음')||cu.includes('어긋남'))?'고치면':'그대로';if(total==='—')cnt.none++;else cnt[total]++;
    const fixed=work.versions.filter(v=>v.changed?.includes(q.id)&&v.from).map(v=>v.label);const pend=(work.pendingEdits||[]).filter(x=>x.qid===q.id).length;
    const cls=t=>t==='고치면'?'ck-fix':'ck-ok';
    return `<tr data-ckgo="${E(q.id)}"><td class="num">${E(q.number)}</td><td>${E(plan?.unit||q.unitSmall||'')}</td><td>${tb?E(tb):''}${miss?`<span class="ck-miss">${tb?' · ':''}근거 없는 칸 ${miss}</span>`:''}</td><td>${lv.length?E([...new Set(lv)].join('/')==='안'?`${work.meta.grade?.value||'학년'} 안`:[...new Set(lv)].join(' / ')):'—'}</td><td>${cu.length?E(cuNote?cuNote.slice(0,90):[...new Set(cu)].join(' / ')):'—'}</td><td class="${cls(j(A))}">${E(j(A))}</td><td class="${cls(j(B))}">${E(j(B))}</td><td class="${cls(total)}">${E(total)}</td><td>${E(fixed.join(', '))}${pend?`${fixed.length?' · ':''}판에 안 들어간 고침 ${pend}`:''}</td></tr>`;}).join('');
  const lastV=work.checks.at(-1)?.version||work.head||'v0.0';
  $('#t-check').innerHTML=`<div class="ckwrap"><div class="ckhead">기준: ① 교과서·학습지만으로 풀 수 있는가 ② ${E(work.meta.grade?.value||'학년')} 수준을 넘지 않는가 ③ 교육과정(성취기준 해설·적용 시 고려 사항)에 어긋나지 않는가 · 두 모델이 서로 안 보고 따로 판정 · 판 ${E(lastV)}</div>
<table class="ptable ckt"><tr><th class="num">번호</th><th>소단원</th><th>교과서 대조</th><th>수준</th><th>교육과정</th><th>모델 A</th><th>모델 B</th><th>종합</th><th>고친 점</th></tr>${rows}</table>
<div class="cksum">요약: ${qs.length}문항 중 그대로 ${cnt.그대로} · 고치면 ${cnt.고치면}${cnt.none?` · 아직 검사 전 ${cnt.none}`:''} · 근거 없는 칸이 있는 문항 ${cnt.missing} · 줄을 누르면 그 문항 검토로</div></div>`;}

// ── 입력 ──
$('#bSend').onclick=send;$('#input').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();send();}});
$('#seg').onclick=e=>{const b=e.target.closest('button[data-tab]');if(!b)return;tab=b.dataset.tab;work.ui={...(work.ui||{}),tab,manual:true};save();render();};
document.addEventListener('click',async e=>{const t=e.target;if(t.closest?.('.hx-edit,.eq-help,.eq-back'))return;
  const subB=t.closest('[data-sub]');if(subB){sub=subB.dataset.sub;render();$('#input').focus();return;}
  if(t.closest('#subBack')){sub=null;render();return;}
  const qt=t.closest('.qtabs button');if(qt){const row=qt.closest('.qright'),on=!qt.classList.contains('on');row.querySelectorAll('.qtabs button').forEach(x=>x.classList.remove('on'));row.querySelectorAll('.qpane').forEach(p=>p.hidden=true);if(on){qt.classList.add('on');row.querySelector(`.qpane[data-p="${qt.dataset.pane}"]`).hidden=false;}return;}
  const cell=t.closest('[data-cell],.edot');if(cell){if(cell.closest('#t-sheet')&&!cell.classList.contains('edot')){sheetClick(cell);return;}showEvidence(cell);return;}
  const rule=t.closest('.rulec button');if(rule){const card=rule.closest('.rulec'),m=work.chat[+card.dataset.msg],r=m?.ruleCards?.find(x=>x.id===card.dataset.rule);if(!r)return;const layer=rule.dataset.layer;r.done=true;
    if(layer==='exam')work.rules.exam.push({id:r.id,layer:'exam',text:r.text,at:nowIso()});else if(layer!=='no')setGlobalRules([...globalRules(),{id:r.id,layer,subject:work.meta.subject?.value||'',text:r.text,at:nowIso()}]);note('rule',{layer});save();render();toast(layer==='no'?'저장하지 않았어요':'규칙으로 저장했어요');return;}
  if(t.closest('#bApply')){await applyNow('결정된 것만 반영');render();return;}
  if(t.closest('#bTriage')){busy++;try{await triageComments('');}finally{busy--;render();}return;}
  const draw=t.closest('[data-draw]');if(draw){const [qid,i]=draw.dataset.draw.split('|');await drawFigure(qid,+i);return;}
  if(t.closest('#bToExam')){await sendToExam();return;}if(t.closest('#bHwpx')){$('#fHwpx').click();return;}if(t.closest('#bFinal')){declareFinal();return;}if(t.closest('#bSaveFile')){await saveFile();return;}
  if(t.closest('#bExport')){tab='sheet';render();return;}
  if(t.closest('#verBtn')||t.closest('#bHist')||t.closest('#pendChip')){const m=$('#histMenu');m.hidden=!m.hidden;drawHist();return;}
  const ck=t.closest('#histMenu input[data-cmp]');if(ck){const on=$$('#histMenu input[data-cmp]:checked');if(on.length>2)on.filter(x=>x!==ck).slice(0,on.length-2).forEach(x=>x.checked=false);$('#bCmp').disabled=$$('#histMenu input[data-cmp]:checked').length!==2;return;}
  if(t.closest('#bCmp')){const on=$$('#histMenu input[data-cmp]:checked').map(x=>x.dataset.cmp);if(on.length!==2)return;const L=work.versions.map(v=>v.label);on.sort((a,b)=>L.indexOf(a)-L.indexOf(b));compare={a:on[0],b:on[1]};tab='review';$('#histMenu').hidden=true;render();note('compare',compare);return;}
  if(t.closest('#bBump')){$('#histMenu').hidden=true;bumpVersion('판 올리기');return;}
  if(t.closest('#cmpClose')){compare=null;render();return;}
  const pt=t.closest('[data-pickto],[data-pickchat]');if(pt){const i=$$('#thread .msg').indexOf(pt.closest('.msg'));const msg=(sub?subThread(sub):work.chat).filter(Boolean)[i];if(!msg?.pick)return;
    if(pt.dataset.pickchat!==undefined){const list=msg.pick.map(id=>(work.sources.picked||[]).find(p=>p.id===id)).filter(Boolean);pendingAttach.push(...list.map(p=>({name:p.name+'.png',data:p.data})));msg.pickDone=`다음에 보내는 말에 그림 ${list.length}장을 함께 붙여요.`;save();render();$('#input').focus();return;}
    placePicked(msg,pt.dataset.pickto);return;}
  const evn=t.closest('[data-evn]');if(evn){const id=evn.dataset.evn;evShow.has(id)?evShow.delete(id):evShow.add(id);render();return;}
  const ckg=t.closest('tr[data-ckgo]');if(ckg){tab='review';compare=null;render();$(`#t-review .qrow[data-q="${ckg.dataset.ckgo}"]`)?.scrollIntoView({block:'start'});return;}
  const cg=t.closest('[data-cmpgo]');if(cg){const el=$(`.cmprow[data-q="${cg.dataset.cmpgo}"]`);el?.scrollIntoView({block:'start',behavior:'smooth'});return;}
  const rs=t.closest('[data-restore]');if(rs){X.restoreVersion(work,rs.dataset.restore);$('#histMenu').hidden=true;save();render();say('ai',`${rs.dataset.restore} 내용으로 되돌렸어요. 옛 판은 그대로 남아 있어요.`);note('restore',{label:rs.dataset.restore});return;}
  const nav=t.closest('.side [data-tool]');if(nav){const tl=nav.dataset.tool;if(tl==='lib'){post({action:'library'});return;}curTool=tl;$$('.side .nav').forEach(n=>n.classList.toggle('on',n===nav));post({action:'tool',tool:tl});note('tool',{tool:tl});return;}
  if(t.closest('[data-go="home"]')){post({action:'home'});closeAll();showView('home');return;}
  if(t.closest('[data-go="new"]')){post({action:'home'});closeAll();if(!pristine(work))newWork();showView('home');return;}
  const op=t.closest('[data-open]');if(op){closeAll();const w=await idbGet('work:'+op.dataset.open);if(w){work=w;work.proposals ||= [];sub=null;compare=null;tab=initialTab(work);post({action:'home'});showView('work');render();}return;}
  if(t.closest('#bOpen')){$('#fOpen').click();return;}if(t.closest('#bFolder')){$('#fFolder').click();return;}
  if(t.closest('#bClip')){toggleClip();return;}
  if(t.closest('#bPane')||t.closest('#bClose')){$('#work').classList.toggle('panel-off');$('#work').classList.remove('panel-full');return;}
  if(t.closest('#bFull')){$('#work').classList.toggle('panel-full');$('#work').classList.remove('panel-off');return;}
  if(t.closest('#bSide')){$('#app').classList.toggle('side-off');return;}
  if(!t.closest('#histMenu,#verBtn,#bHist,#pendChip'))$('#histMenu').hidden=true;
  if(!t.closest('#evpop,[data-cell],.edot'))$('#evpop').hidden=true;
});
document.addEventListener('change',e=>{const ps=e.target.closest?.('select[data-pickq]');if(ps&&ps.value){const i=$$('#thread .msg').indexOf(ps.closest('.msg'));const msg=(sub?subThread(sub):work.chat)[i];if(msg?.pick)placePicked(msg,ps.value);return;}
  const sel=e.target.closest?.('select[data-cmpsel]');if(!sel||!compare)return;compare={...compare,[sel.dataset.cmpsel]:sel.value};render();});
document.addEventListener('keydown',e=>{const ta=e.target.closest?.('textarea[data-comment]');if(ta&&e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();const text=ta.value.trim();if(!text)return;X.addComment(work,{qid:ta.dataset.comment,text,onVersion:work.head});ta.value='';save();render();note('comment',{qid:ta.dataset.comment});toast('코멘트를 쌓았어요 · 다 달면 「다 달았어」라고 말해 주세요');}
  const m=e.metaKey||e.ctrlKey;if(m&&e.key==='s'){e.preventDefault();void saveFile();}if(m&&e.key==='o'){e.preventDefault();$('#fOpen').click();}if(m&&!e.shiftKey&&e.key==='.'){e.preventDefault();$('#work').classList.toggle('panel-off');}if(m&&e.shiftKey&&(e.key==='.'||e.key==='>')){e.preventDefault();$('#work').classList.toggle('panel-full');}if(m&&e.key==='\\'){e.preventDefault();$('#app').classList.toggle('side-off');}
  if(m&&e.altKey){const k={Digit1:'image',Digit2:'exam',Digit3:'hwp'}[e.code];if(k){e.preventDefault();post({action:'tool',tool:k});}if(e.code==='Digit0'){e.preventDefault();post({action:'home'});}}});
function showEvidence(el){const [qid,key]=(el.dataset.cell||el.dataset.ev||'').split('|');const q=work.questions.find(x=>x.id===qid);if(!q||!key)return;$$('.kq .pick').forEach(x=>x.classList.remove('pick'));el.classList.add?.('pick');
  const list=(q.authoring?.evidence||[]).filter(e=>e.target===key),st=X.cellEvidence(q,key),label=X.cellKeys(q).find(k=>k.key===key)?.label||key;const pop=$('#evpop');
  pop.innerHTML=`<div class="h">${E(q.number)}번 · ${E(label)} 근거<span class="x">닫기</span></div>${list.length?list.map(e=>`<div class="ev${['missing','unreadable','refuted','conflict'].includes(e.judgement)?' ev-x':''}"><b>${E(({direct:'직접 지지',conditional:'조건부',derived:'도출',refuted:'반박',missing:'미확보',conflict:'충돌',unreadable:'판독 미확인'})[e.judgement]||e.judgement)}</b><span>${E((e.source?.title||'출처 없음')+(e.source?.page?` ${e.source.page}쪽`:''))} · ${E(e.claim)}</span></div>`).join(''):''}${st==='waived'?'<div class="ev ev-x"><span>근거 없음 — 예외로 진행</span></div>':st!=='ok'?`<div class="ev ev-x"><span>이 칸에 붙은 근거가 없어요 · 「예외로 진행」하려면 이유를 남겨 주세요</span></div><input id="wvReason" placeholder="예: 수업 시간에 실험으로 다룸" style="width:100%;margin-top:6px"><button class="btn sm" id="wvOk" style="margin-top:6px">예외로 진행</button>`:''}`;
  const r=el.getBoundingClientRect();pop.hidden=false;pop.style.left=Math.min(innerWidth-320,r.right+8)+'px';pop.style.top=Math.min(innerHeight-220,r.top)+'px';pop.querySelector('.x').onclick=()=>{pop.hidden=true;};
  const ok=pop.querySelector('#wvOk');if(ok)ok.onclick=()=>{const reason=pop.querySelector('#wvReason').value.trim();if(!reason){toast('이유를 한 줄 적어 주세요');return;}X.addWaiver(q,key,{reason,by:'teacher'});pop.hidden=true;save();render();note('waiver',{key});};}
$('#fOpen').onchange=()=>{const f=$('#fOpen').files[0];$('#fOpen').value='';if(f)openFile(f);};
$('#fHwpx').onchange=()=>{const f=$('#fHwpx').files[0];$('#fHwpx').value='';if(f)importHwpx(f);};
$('#fFolder').onchange=async()=>{const files=[...$('#fFolder').files];$('#fFolder').value='';if(!files.length)return;const root=files[0].webkitRelativePath.split('/')[0];
  work.sources={...work.sources,folder:{path:root,label:root},files:files.filter(f=>/\.(pdf|hwpx?|pptx?|docx?|png|jpe?g|txt)$/i.test(f.name)).slice(0,300).map(f=>({id:crypto.randomUUID(),rel:f.webkitRelativePath,kind:/교과서/.test(f.webkitRelativePath)?'textbook':/학습지/.test(f.webkitRelativePath)?'worksheet':/기출/.test(f.webkitRelativePath)?'past':'document',bytes:f.size,readAt:null}))};
  save();const a=act(`자료 폴더 「${root}」 읽는 중…`);busy++;try{const idx=await readFolder(files,{onProgress:p=>a.set(`자료 폴더 읽는 중 · ${p.i+1}/${p.n} ${p.rel.split('/').pop()}`)});await idbSet('folder:'+work.projectId,idx);folderIndex=idx;folderFor=work.projectId;
    const pages=idx.reduce((n,f)=>n+f.pages.filter(Boolean).length,0),bad=idx.filter(f=>f.error).length,imgs=files.filter(f=>/\.(png|jpe?g|webp|gif|heic)$/i.test(f.name)).length;for(const f of work.sources.files){const hit=idx.find(x=>x.rel===f.rel);if(hit){f.readAt=nowIso();f.pages=hit.pages.length;}}save();
    say('ai',`자료 폴더 「${root}」를 등록했어요(파일 ${work.sources.files.length}개, 글을 읽은 쪽 ${pages}쪽${bad?` · 못 읽은 파일 ${bad}개`:''}${imgs?` · 사진 ${imgs}장은 뒤에서 글자를 읽는 중이에요`:''}). 이제 설계·초안·코멘트 때 이 폴더에서 근거 후보를 찾아 함께 봐요. 내용은 이 컴퓨터에만 두고 시험지 파일에는 경로만 남겨요.`);note('folder',{files:work.sources.files.length,pages,bad});}
  catch(e){say('ai','자료 폴더를 읽지 못했어요: '+e.message+' · 파일 목록만 기억했어요.',{error:true});note('folder-fail',{error:e.message});}finally{a.done();busy--;render();}
  // 그림 파일은 뒤에서 글자를 읽는다(대화는 막지 않음). 다 읽으면 색인에 더하고 알린다.
  const pics=files.filter(f=>/\.(png|jpe?g|webp)$/i.test(f.name));if(!pics.length)return;const pid=work.projectId,b=act(`사진 ${pics.length}장 글자 읽는 중…`);const t0=Date.now();
  try{const got=await ocrImages(pics,{onProgress:p=>b.set(`사진 글자 읽는 중 · ${p.i+1}/${p.n} ${p.rel.split('/').pop()}`)});const idx=[...((await idbGet('folder:'+pid))||[]).filter(f=>!f.ocr),...got];await idbSet('folder:'+pid,idx);if(work.projectId===pid){folderIndex=idx;folderFor=pid;}
    const ok=got.filter(g=>g.pages[0]?.length>40).length;say('ai',`사진 ${pics.length}장의 글자를 읽었어요(글이 나온 것 ${ok}장, ${Math.round((Date.now()-t0)/1000)}초). 이제 교과서 쪽 사진도 근거 후보로 써요. 사진에서 읽은 글은 틀린 글자가 있을 수 있어 근거에 「사진에서 읽은 글」이라고 적어요.`);note('ocr',{n:pics.length,ok,sec:Math.round((Date.now()-t0)/1000)});}
  catch(e){say('ai','사진 글자를 읽지 못했어요: '+e.message+' · 글 파일만 근거로 써요.',{error:true});note('ocr-fail',{error:e.message});}finally{b.done();render();}};
// 패널 넓이 끌기(시안 v8 그대로)
(()=>{const sp=$('#splitter'),wEl=$('#splitW'),w=$('#work');let on=false;const set=x=>{const r=w.getBoundingClientRect();const v=Math.max(460,Math.min(r.width-360,r.right-x));w.style.setProperty('--pw',v+'px');wEl.textContent='결과물 '+Math.round(v)+'px · 대화 '+Math.round(r.width-v)+'px';};
  sp.addEventListener('pointerdown',e=>{on=true;sp.setPointerCapture(e.pointerId);sp.classList.add('drag');document.body.classList.add('resizing');set(e.clientX);});sp.addEventListener('pointermove',e=>{if(on)set(e.clientX);});
  const end=()=>{on=false;sp.classList.remove('drag');document.body.classList.remove('resizing');};sp.addEventListener('pointerup',end);sp.addEventListener('pointercancel',end);sp.addEventListener('dblclick',()=>w.style.removeProperty('--pw'));})();

// ── 칸 그 자리 편집(결정 6 · 시안7 2번) ──
// 「문항 검토」 종이의 칸을 두 번 누르면 그 칸이 편집 상자가 된다. 글은 그대로 치고, 수식은 exam 문항 카드와 같은 수식 입력기(누르면 그 수식만 원문 띠 + 작은 도우미).
// 고친 칸은 「직접 고침」으로 잠겨 AI 안이 덮어쓰지 않고(결정 12), 판에는 다음 「판 올리기」 때 들어간다(결정 13).
const EQV='?v=1.7.0-four-session-integration';// exam이 쓰는 것과 같은 모듈 주소(같은 인스턴스)
let editing=null,eqF=null,eqI=null;
const eqMods=async()=>{eqF||=import('../../js/eq/eq-fields.js'+EQV);eqI||=import('../../js/eq/eq-input.js'+EQV);return [await eqF,await eqI];};
function cellField(q,key,r,c){
  if(key==='ask')return {get:()=>q.ask||'',set:v=>{q.ask=v;},prefix:'',suffix:` <span class="pt">[${E(q.points)}점]</span>`,lock:'ask',label:'발문'};
  if(key.startsWith('block:')){const b=q.blocks.find(x=>x.id===key.slice(6));if(!b)return null;
    if(b.kind==='table'){if(r==null)return null;const cell=b.table?.cells?.[+r]?.[+c];if(!cell)return null;return {get:()=>String(cell.value??''),set:v=>{cell.value=v;},prefix:'',suffix:'',lock:key,label:'표 칸'};}
    if(b.kind!=='text')return null;return {get:()=>b.text||'',set:v=>{b.text=v;},prefix:'',suffix:'',lock:key,label:b.label||'자료 글'};}
  if(key.startsWith('line:')){const id=key.slice(5);for(const b of q.blocks){const l=(b.lines||[]).find(x=>x.id===id);if(l)return {get:()=>l.text||'',set:v=>{l.text=v;},prefix:E(l.label)+(b.kind==='bogi'?'. ':' '),suffix:'',lock:key,label:'보기 '+l.label};}return null;}
  if(key.startsWith('choice:')){const i=q.choices.findIndex(x=>x.id===key.slice(7));if(i<0)return null;return {get:()=>q.choices[i].text||'',set:v=>{q.choices[i].text=v;},prefix:CIRCLED[i]+' ',suffix:'',lock:key,label:'선지 '+CIRCLED[i]};}
  return null;}
async function startEdit(el,{init=null,fromProposal=null}={}){if(editing)await finishEdit();const [qid,key,r,c]=(el.dataset.tcell||el.dataset.cell||'').split('|');const q=work.questions.find(x=>x.id===qid);if(!q||!key)return;const F=cellField(q,key,r,c);if(!F)return;
  $('#evpop').hidden=true;$$('.kq .pick').forEach(x=>x.classList.remove('pick'));const cs=getComputedStyle(el);
  const ta=document.createElement('textarea');ta.className='hx-ta';ta.value=init??F.get();Object.assign(ta.style,{fontFamily:cs.fontFamily,fontSize:cs.fontSize,lineHeight:cs.lineHeight,letterSpacing:cs.letterSpacing,color:cs.color,textAlign:el.tagName==='TD'?'center':'justify'});
  const wrap=document.createElement('span');wrap.className='hx-edit';el.innerHTML=F.prefix?`<span class="hx-pre">${F.prefix}</span>`:'';el.append(wrap);wrap.append(ta);if(F.suffix)el.insertAdjacentHTML('beforeend',F.suffix);el.classList.add('hx-editing');
  editing={qid,el,ta,F,orig:F.get(),wrap,fromProposal};const [m]=await eqMods();m.attachMathFields(wrap,{selector:'textarea.hx-ta'});
  let ce=null;for(let i=0;i<40&&!(ce=wrap.querySelector('.eq-ce'));i++)await new Promise(r=>setTimeout(r,50));if(!ce){note('edit-fail',{key});editing=null;render();return;}
  ce.focus();const rg=document.createRange();rg.selectNodeContents(ce);rg.collapse(false);const sl=getSelection();sl.removeAllRanges();sl.addRange(rg);
  ce.addEventListener('keydown',e=>{if(e.isComposing)return;if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();finishEdit();}else if(e.key==='Escape'&&!wrap.querySelector('.eq-band')){e.preventDefault();finishEdit();}});
  // 편집 상자 밖으로 초점이 나가면 끝(수식 도우미·큰 편집기를 쓰는 동안은 아님)
  ce.addEventListener('focusout',()=>setTimeout(()=>{if(editing?.wrap!==wrap)return;if(wrap.contains(document.activeElement)||document.querySelector('.eq-back'))return;finishEdit();},150));
  note('edit-start',{no:q.number,key:F.lock});}
async function finishEdit(){const e=editing;if(!e)return;editing=null;const [,mi]=await eqMods();const ce=e.wrap.querySelector('.eq-ce');let v=e.ta.value;
  if(ce){// exam 입력기는 수식 띠를 닫을 때 뒤에 빈칸 하나를 넣는다(새 수식을 이어 칠 때 쓰려고). 원래 글에서 그 수식 바로 뒤에 빈칸이 없었으면 뺀다.
    // 수식은 차례로 맞춘다(고친 수식은 글이 달라져도 같은 자리): 원래 n번째 수식 뒤에 빈칸이 없었으면 n번째 칩 뒤 빈칸을 뺀다.
    const tight=[...e.orig.matchAll(/\$[^$\n]+\$(\s?)/g)].map(x=>!x[1]),chips=[...ce.querySelectorAll('.eq-chip')];
    if(chips.length===tight.length)chips.forEach((chip,i)=>{const n=chip.nextSibling;if(tight[i]&&n?.nodeType===3&&n.data.startsWith(' '))n.data=n.data.slice(1);});
    v=mi.htmlToMath(ce);}
  v=v.replace(/ /g,' ');const q=work.questions.find(x=>x.id===e.qid);
  if(q&&v!==e.orig&&e.fromProposal){const p=work.proposals.find(x=>x.id===e.fromProposal);if(p){p.state='rejected';for(const cid of p.comments||[])if(work.comments.some(c=>c.id===cid))X.updateComment(work,cid,{status:'applied'});resolved.set(p.id,{kind:'edit',qid:q.id,summary:p.summary});}}
  if(q&&v!==e.orig){e.F.set(v);X.lockCell(q,e.F.lock);work.pendingEdits=[...(work.pendingEdits||[]),{qid:q.id,key:e.F.lock,label:e.F.label,at:nowIso()}];work.dirty=true;save();note('cell-edit',{no:q.number,key:e.F.lock});toast(`${q.number}번 ${e.F.label}을 고쳤어요 · 직접 고친 칸은 AI가 덮어쓰지 않아요`);}
  render();}
document.addEventListener('dblclick',e=>{if(!['review','sheet'].includes(tab)||!work)return;clearTimeout(clickT);const el=e.target.closest('#t-review .kq td[data-tcell],#t-review .kq [data-cell],#t-sheet .kq td[data-tcell],#t-sheet .kq [data-cell]');if(el?.tagName==='IMG'){e.preventDefault();void figToImage(el);return;}if(!el||el.tagName==='IMG'||el.classList.contains('q')||el.tagName==='TABLE'||el.closest('.hx-edit'))return;e.preventDefault();void startEdit(el);});

// ── 시작 ──
(async()=>{post({action:'ready'});try{const last=await idbGet('last');if(last)work=await idbGet('work:'+last);renderSide((await idbGet('list'))||[]);}catch{}
  if(!work){work=X.newExamset({title:''});X.setMeta(work,'stage','design');work.chat.push({role:'ai',text:'어떤 시험지를 만들까요? 과목·범위·문항 수·총점을 알려 주시면 설계표부터 잡아요. 교과서·학습지가 있으면 「자료 폴더」로 등록해 주세요.',at:nowIso()});}
  work.proposals ||= [];tab=initialTab(work);showView(pristine(work)?'home':'work');render();note('boot',{head:work.head});})();
window.__harness={bumpVersion,get compare(){return compare;},setCompare:c=>{compare=c;render();},get drafting(){return drafting;},get editing(){return editing;},startEdit,finishEdit,get work(){return work;},get sub(){return sub;},openSub:id=>{sub=id;render();},closeSub:()=>{sub=null;render();},get busy(){return busy;},log,render,send:t=>{$('#input').value=t;return send();},applyNow,triageComments,draftAll,declareFinal,sendToExam,importHwpx,saveFile,openFile,X};

// ════════ 시안 v7 반영(11-26 오후 · 결정 V1~V6) ════════
// 첫 화면 · 선생님 메뉴(화면 색·설정) · 시험지 이름 메뉴 · 시험지 위 코멘트·AI 제안(받기·거절·직접 고치기) · 아래 줄 · 지금 단계
// · 고르기 카드 · 작업 기록 접기 · 클립보드 서랍 · 찾기(⌘K) · 단축키. 결정: ~/Work/2026-11-24_1.8.0-하네스/결정.md 「11-26 오후」.
let view='work',sideList=[],colorPref='navy',aiState='';
function markTheme(){$$('#meMenu [data-theme-set]').forEach(b=>{b.querySelector('.ck').textContent=b.dataset.themeSet===colorPref?'✓':'';});}
function setAI(s){if(aiState===s)return;aiState=s;const t={ok:'GPT 연결됨',login:'AI 로그인 필요 — 누르면 연결',install:'Codex 설치 필요'}[s]||'AI 연결 확인 전';const u=$('#usage');if(u)u.textContent=t;}
const PAST_KEY='5e.harness.past';
const pastOn=()=>{try{return localStorage.getItem(PAST_KEY)!=='0';}catch{return true;}};
const pristine=w=>!!w&&!w.questions.length&&!w.plan.length&&!w.chat.some(m=>m.role==='me');
function initialTab(w){if(w.ui?.tab)return w.ui.tab;return w.questions.length?(['typeset','final'].includes(w.meta.stage)?'sheet':'review'):'plan';}
// V2: 문항 없음=설계표, 첫 문항=문항 검토, 초안 끝=시험지. 선생님이 탭을 직접 누른 뒤에는 넘기지 않는다.
function autoTab(t){if(!work||work.ui?.manual)return;tab=t;work.ui={...(work.ui||{}),tab:t};}
function newWork(){work=X.newExamset({title:''});X.setMeta(work,'stage','design');work.proposals=[];work.ui={tab:'plan',manual:false};sub=null;tab='plan';compare=null;save();render();}
function showView(v){view=v;$('#vHome').hidden=v!=='home';$('#work').hidden=v!=='work';renderSide(sideList);if(v==='home'){void renderHome();setTimeout(()=>$('#homeIn')?.focus(),30);}note('view',{v});}

// ── 첫 화면 ──
const ago=t=>{const m=Math.round((Date.now()-new Date(t).getTime())/60000);if(m<1)return '방금';if(m<60)return m+'분 전';const h=Math.round(m/60);if(h<24)return h+'시간 전';if(h<48)return '어제';const d=new Date(t);return `${d.getMonth()+1}월 ${d.getDate()}일`;};
const thumb=n=>{const L=[...Array(Math.max(3,Math.min(5,n||3)))].map((_,i)=>`<i${i%3===1?' class="s"':''}></i>`).join(''),R=[...Array(Math.max(3,Math.min(4,(n||3)-1)))].map((_,i)=>`<i${i%2===0?' class="s"':''}></i>`).join('');return `<div class="thumb"><div>${L}</div><div>${R}</div></div>`;};
async function renderHome(){let list=[];try{list=(await idbGet('list'))||[];}catch{}const rec=list.filter(x=>!x.empty).slice(0,3);
  $('#recWrap').hidden=!rec.length;$('#recCards').innerHTML=rec.map(x=>`<button class="card" data-open="${E(x.id)}">${thumb(x.n)}<b>${E(x.title)}</b><small>${E(x.head||'v0.0')} · ${E(STAGE[x.stage]||'')} · ${E(ago(x.at))}</small></button>`).join('');
  $('#homePast').classList.toggle('on',pastOn());const f=pristine(work)&&work.meta.form?.by==='teacher'?work.meta.form.value:null;$('#homeForm span').textContent=f?`양식 · ${String(f).replace(/\.[^.]+$/,'').slice(0,18)}`:'학교 양식';$('#homeForm').classList.toggle('on',!!f);}
function startFromHome(){const v=$('#homeIn').value.trim();if(!v){$('#homeIn').focus();return;}if(!pristine(work))newWork();$('#homeIn').value='';showView('work');$('#input').value=v;note('home-start');void send();}
$('#homeSend').onclick=startFromHome;
$('#homeIn').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();startFromHome();}});
$('#fForm').onchange=async()=>{const f=$('#fForm').files[0];$('#fForm').value='';if(!f)return;if(view==='home'&&!pristine(work))newWork();X.setMeta(work,'form',f.name,'teacher');try{await idbSet('form:'+work.projectId,new Uint8Array(await f.arrayBuffer()));}catch{}save();render();void renderHome();toast(`학교 양식 「${f.name}」을 이 시험지에 걸었어요 · 조판 때 이 양식으로`);note('form',{name:f.name});};

// ── 고르기 카드(시안 v7 7번) · 작업 기록 ──
const cleanChoices=list=>(Array.isArray(list)?list:[]).filter(c=>c&&typeof c.ask==='string'&&Array.isArray(c.options)&&c.options.length>=2).slice(0,2).map(c=>({ask:c.ask.slice(0,300),why:String(c.why||'').slice(0,300),options:c.options.slice(0,4).map(o=>typeof o==='string'?{label:o.slice(0,120),desc:''}:{label:String(o?.label||'').slice(0,120),desc:String(o?.desc||'').slice(0,200)}).filter(o=>o.label),recommend:Number.isInteger(c.recommend)?c.recommend:-1})).filter(c=>c.options.length>=2);
function choicesHtml(m,i){return (m.choices||[]).map((c,k)=>c.picked!=null?`<div class="done"><svg class="i s" style="color:var(--tx3)"><use href="#i-check"/></svg><span class="k">${E(c.ask.slice(0,40))}</span>${E(c.options[c.picked]?.label||c.typed||'')}</div>`:
  `<div class="ask" data-ask="${i}|${k}"><div class="hd"><span class="req">꼭 정해야 해요</span></div><div class="q">${E(c.ask)}${c.why?`<small>${E(c.why)}</small>`:''}</div>${c.options.map((o,j)=>`<button class="opt" data-opt="${i}|${k}|${j}"><span class="n">${j+1}</span><span><b>${E(o.label)}${j===c.recommend?'<span class="rc">추천</span>':''}</b>${o.desc?`<span class="d">${E(o.desc)}</span>`:''}</span></button>`).join('')}<div class="ft">숫자 키로 고르기 · 입력창에 직접 써도 돼요</div></div>`).join('');}
function pickChoice(i,k,j){const list=sub?subThread(sub):work.chat,m=list[i],c=m?.choices?.[k];if(!c||c.picked!=null||busy)return;c.picked=j;save();$('#input').value=c.options[j].label;note('choice',{j});void send();}
function logsHtml(m,i){return (m.logs||[]).map((l,j)=>`<button class="alog" data-log="${i}-${j}"><span class="dot"></span>${E(l.title)}${l.steps?.length?'<svg class="i s"><use href="#i-right"/></svg>':''}</button>${l.steps?.length?`<div class="actlog" data-logp="${i}-${j}" hidden>${l.steps.map(x=>`<div>${E(x)}</div>`).join('')}</div>`:''}`).join('');}

// ── 시험지 위 AI 제안(결정 V1: 섞은 안) ──
const resolved=new Map();// 이번에 받거나 거절한 제안(되돌리기 표시용)
const openProposals=()=>(work.proposals||[]).filter(p=>['current','agreed'].includes(p.state)&&work.questions.some(q=>q.id===p.qid));
const TEXT_PATHS=new Set(['ask','passage','block','bogi','choice']);
function insMap(q,props){const m=new Map();for(const p of props)p.changes.forEach(c=>{if(!TEXT_PATHS.has(c.path)||typeof c.value!=='string'||c.op==='add')return;const ks=X.changeKeys(q,c);if(ks.length!==1||ks[0]==='question')return;if(!m.has(ks[0]))m.set(ks[0],c.value);});return m;}
const isFigChange=(q,c)=>c.path==='block'&&q.blocks.find(b=>b.id===c.id||b.label===c.id)?.kind==='figure';
function otherChanges(q,p){return p.changes.map((c,i)=>isFigChange(q,c)?`그림: ${E(String(c.value||'').slice(0,80))}`:c.path==='answer'?`정답 ${Number.isInteger(+p.before?.[i])&&p.before[i]!==''?CIRCLED[+p.before[i]-1]||p.before[i]:'—'} → ${Number.isInteger(+c.value)?CIRCLED[+c.value-1]||c.value:E(c.value)}`:c.path==='points'?`배점 ${E(p.before?.[i]??'')} → ${E(c.value)}점`:['explanation','modelAnswer'].includes(c.path)?'해설 고침':c.path==='table'?'표 고침':c.path==='type'?'문항 유형 바꿈':c.op==='add'?'〈보기〉 줄 더함':!TEXT_PATHS.has(c.path)?E(c.path)+' 고침':'').filter(Boolean);}
function suggHtml(q,p,i,n){const figOnly=p.changes.length>0&&p.changes.every(c=>isFigChange(q,c));const cm=(p.comments||[]).map(id=>work.comments.find(c=>c.id===id)).filter(Boolean)[0];const others=otherChanges(q,p);
  const firstKey=[...insMap(q,[p]).keys()][0]||'';
  return `<div class="sugg" data-sugg="${E(p.id)}" data-skey="${E(firstKey)}"><div class="h"><svg class="i s"><use href="#i-spark"/></svg>AI 제안 · ${E(q.number)}번 ${E(String(p.summary||'').slice(0,48))}<span class="sp"></span>${i}/${n}</div>${cm?`<div class="why">코멘트 「${E(String(cm.gist||cm.text).slice(0,90))}」</div>`:''}${others.length?`<div class="why">${others.join(' · ')}</div>`:''}${p.touchesLock?'<div class="why">직접 고친 칸은 건드리지 않아요</div>':''}
${figOnly?'<div class="why">그림은 글로 바꿀 수 없어요 · image에서 고친 뒤 클립보드 서랍에서 그림 칸으로 끌어 놓으면 이 제안은 끝나요</div>':''}
<div class="acts">${figOnly?`<button class="btn pri" data-sfig="${E(p.id)}"><svg class="i s"><use href="#i-img"/></svg>image에서 고치기</button>`:`<button class="btn pri" data-acc="${E(p.id)}"><svg class="i s"><use href="#i-check"/></svg>받기</button>`}<button class="btn" data-rej="${E(p.id)}"><svg class="i s"><use href="#i-x"/></svg>거절</button>${figOnly?'':`<button class="btn" style="margin-left:auto" data-sedit="${E(p.id)}">직접 고치기</button>`}</div></div>`;}
function resolvedHtml(q){return [...resolved.entries()].filter(([,r])=>r.qid===q.id).map(([pid,r])=>`<div class="resolved"><svg class="i s"><use href="#i-${r.kind==='rej'?'x':'check'}"/></svg>${({acc:'받음',rej:'거절함',edit:'직접 고침'})[r.kind]} · ${E(String(r.summary||'').slice(0,40))}${r.kind==='rej'?` <button class="btn sm gh" data-unrej="${E(pid)}">되돌리기</button>`:''}</div>`).join('');}
function ensureDecided(p,why){p.state='agreed';let cids=(p.comments||[]).filter(id=>work.comments.some(c=>c.id===id));
  if(!cids.length){const cid=X.addComment(work,{qid:p.qid,text:`(${why}) ${p.summary||'AI 제안'}`,onVersion:work.head});X.updateComment(work,cid,{proposals:[p.id]});p.comments=[...(p.comments||[]),cid];cids=[cid];}
  for(const id of cids)X.updateComment(work,id,{status:'decided',decision:why});return cids;}
async function acceptProposal(pid){const p=work.proposals.find(x=>x.id===pid);if(!p||busy)return;const cids=ensureDecided(p,'시험지에서 받기');resolved.set(pid,{kind:'acc',qid:p.qid,summary:p.summary});busy++;try{await applyNow('시험지에서 받기',{only:cids});}finally{busy--;render();}}
function rejectProposal(pid){const p=work.proposals.find(x=>x.id===pid);if(!p)return;p.state='rejected';for(const cid of p.comments||[]){const c=work.comments.find(x=>x.id===cid);if(c&&!['applied','dropped'].includes(c.status)&&!work.proposals.some(o=>o.id!==pid&&o.comments?.includes(cid)&&['current','agreed'].includes(o.state)))X.updateComment(work,cid,{status:'dropped'});}
  resolved.set(pid,{kind:'rej',qid:p.qid,summary:p.summary});work.dirty=true;save();render();note('reject',{pid});toast(`${work.questions.find(q=>q.id===p.qid)?.number}번 제안을 거절했어요`);}
function undoReject(pid){const p=work.proposals.find(x=>x.id===pid);if(!p)return;p.state='current';for(const cid of p.comments||[]){const c=work.comments.find(x=>x.id===cid);if(c?.status==='dropped')X.updateComment(work,cid,{status:'talk'});}resolved.delete(pid);save();render();}
async function applyAllOpen(){const open=openProposals();if(!open.length){toast('반영할 제안이 없어요');return;}for(const p of open){ensureDecided(p,'모두 반영');resolved.set(p.id,{kind:'acc',qid:p.qid,summary:p.summary});}busy++;try{await applyNow('모두 반영');}finally{busy--;render();}}
function nextSugg(){const all=$$('#t-sheet .sugg');if(!all.length){toast('남은 제안이 없어요');return;}const top=$('#t-sheet').getBoundingClientRect().top+60;const s=all.find(x=>x.getBoundingClientRect().top>top)||all[0];s.scrollIntoView({block:'center',behavior:'smooth'});s.animate([{boxShadow:'0 0 0 0 rgba(107,164,248,.6)'},{boxShadow:'0 0 0 8px rgba(107,164,248,0)'}],{duration:900});}

// ── 결과물 칸 머리·아래 줄 ──
let curTool=null,lastCrumb='';
function renderChrome(){if(!work)return;const ct=work.meta.title||'새 시험지';if(ct!==lastCrumb){lastCrumb=ct;post({action:'crumb',title:ct});}const qs=work.questions,st=work.meta.stage;
  const nonEssay=qs.filter(q=>q.type!=='서술형'),checked=nonEssay.length>0&&nonEssay.every(q=>work.checks.some(k=>k.qid===q.id&&k.runs?.length)),exported=(work.outputs||[]).length>0||st==='final';
  const S=[['계획',work.plan.length>0&&!X.missingBlocking(work).length],['작성',qs.length>0&&!drafting&&work.plan.every(r=>r.qid||r.status==='empty')],['검토',checked||exported],['검사',checked&&!work.checks.some(k=>['doubt','fail'].includes(k.verdict)&&k.version===work.head)],['내보내기',exported]];
  const now=S.findIndex(x=>!x[1]);$('#steps').innerHTML=S.map(([n,ok],i)=>i===now?`<b><span class="d now"></span>${n}</b>`:`<span><span class="d${ok?' ok':''}"></span>${n}</span>`).join('<i></i>');
  let dk=$('#dock');if(!dk){dk=document.createElement('div');dk.id='dock';dk.className='dock';$('#rp').append(dk);}
  const open=openProposals(),c=X.commentCounts(work),cm=(c.new||0)+(c.talk||0)+(c.decided||0);dk.hidden=tab!=='sheet'||!(open.length||cm)||!!compare;
  dk.innerHTML=`<span class="c"><b>제안 ${open.length}</b> · 코멘트 ${cm}</span><span class="sep"></span>${c.new?'<button class="btn sm" id="bTriage">코멘트 보내기</button>':''}<button class="btn sm" id="bNext"${open.length?'':' disabled'}>하나씩 보기</button><button class="btn sm" id="bApply"${c.decided?'':' disabled'}>결정된 것만 반영</button><button class="btn sm pri" id="bApplyAll"${open.length?'':' disabled'}>모두 반영 <kbd style="color:inherit;opacity:.6">⌘↵</kbd></button>`;
  $('#aiMeta').textContent=`${pendingAttach.length?`그림 ${pendingAttach.length}장 붙임 · `:''}기출 참고 ${pastOn()?'켬':'끔'}`;$('#aiMeta').title='GPT로 쓰고, 풀이 검사는 두 모델이 따로 풀어요';
  $('#footMid').textContent=`${qs.length}문항 · 판 ${work.versions.length}개 · Copyright © 2026 박승연 | SMOE`;}

// ── 메뉴(시안 v7) ──
function closeAll(){$$('.menu').forEach(m=>{if(m.id!=='histMenu')m.hidden=true;});$('#cPop').hidden=true;$('#findPop').hidden=true;$('#scrim').hidden=true;$$('.qblock.pick').forEach(x=>x.classList.remove('pick'));}
function openMenu(sel,anchor,{up=false,right=false}={}){closeAll();const m=$(sel),r=anchor.getBoundingClientRect();m.hidden=false;$('#scrim').hidden=false;const w=m.offsetWidth,h=m.offsetHeight;
  m.style.left=Math.max(8,Math.min(innerWidth-w-8,right?r.right-w:r.left))+'px';m.style.top=(up?Math.max(8,r.top-h-6):Math.min(innerHeight-h-8,r.bottom+6))+'px';m.style.bottom='auto';}

// ── 시험지에서 문항 글 누르기 = 코멘트(시안 v7 11번) ──
let clickT=0,cmt=null;
function sheetClick(cell){clearTimeout(clickT);clickT=setTimeout(()=>openComment(cell),240);}
function cellLabel(q,key){if(!key)return '문항 전체';if(key==='ask')return '발문';const k=X.cellKeys(q).find(x=>x.key===key);if(k)return k.label;if(key.startsWith('choice:'))return '선지';if(key.startsWith('line:'))return '〈보기〉';const b=q.blocks.find(x=>'block:'+x.id===key);return b?.kind==='figure'?(b.label||'그림'):b?.kind==='table'?'표':'자료';}
function openComment(cell,{thread=false}={}){if(!work)return;closeAll();const [qid,key]=(cell.dataset.cell||cell.dataset.tcell||cell.dataset.pin||'').split('|');const q=work.questions.find(x=>x.id===qid);if(!q)return;
  const k=cell.dataset.pin?null:key||null;cmt={qid,key:k,el:cell};cell.closest('.qblock')?.classList.add('pick');
  $('#cpH').textContent=`${q.number}번 · 코멘트`;const cat=k==='ask'?'ask':k?.startsWith('line:')?'bogi':k?.startsWith('choice:')?'choice':k?.startsWith('block:')?'data':'';const CATS=[['','문항 전체'],['ask','발문'],['data','자료'],['bogi','〈보기〉'],['choice','선지'],['explanation','해설']];
  $('#cpSeg').innerHTML=CATS.filter(([c])=>c!=='bogi'||q.blocks.some(b=>b.kind==='bogi')).map(([c,l])=>c&&c===cat&&k!=='ask'?`<button data-tg="${E(k)}" class="on">${E(cellLabel(q,k))}</button>`:`<button data-tg="${c==='ask'?'ask':c==='explanation'?'explanation':c?'cat:'+c:''}"${(c===cat&&(k==='ask'||!k))||(!k&&!c)?' class="on"':''}>${l}</button>`).join('');
  const cs=work.comments.filter(c=>c.qid===q.id&&c.status!=='dropped');const th=$('#cpThread');th.hidden=!cs.length;th.innerHTML=cs.slice(-6).map(c=>`<div class="ct"><b>선생님</b> ${E(c.text)} <span class="cst ${SC[c.status]}">${ST[c.status]}</span>${c.answer?`<div class="ai">${E(String(c.answer).slice(0,260))}</div>`:''}</div>`).join('');
  $('#cpEdit').hidden=!k||!cellField(q,k.split('|')[0]);const p=$('#cPop'),r=cell.getBoundingClientRect();p.hidden=false;$('#scrim').hidden=false;const h=p.offsetHeight;
  p.style.left=Math.max(8,Math.min(innerWidth-p.offsetWidth-8,r.left))+'px';p.style.top=(r.bottom+h+12<innerHeight?r.bottom+6:Math.max(8,r.top-h-6))+'px';$('#cpIn').value='';setTimeout(()=>$('#cpIn').focus(),20);note('comment-open',{no:q.number,key:k});}
function addCmt(){if(!cmt)return;const v=$('#cpIn').value.trim();if(!v){$('#cpIn').focus();return;}const tg=$('#cpSeg .on')?.dataset.tg||null;
  X.addComment(work,{qid:cmt.qid,target:tg||null,text:v,onVersion:work.head});closeAll();save();render();note('comment',{qid:cmt.qid,target:tg});toast('코멘트를 쌓았어요 · 다 달면 아래 「코멘트 보내기」나 「다 달았어」',2800);}
$('#cpAdd').onclick=addCmt;$('#cpCancel').onclick=closeAll;$('#scrim').onclick=closeAll;
$('#cpIn').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();addCmt();}if(e.key==='Escape'){e.preventDefault();closeAll();}});
$('#cpSeg').onclick=e=>{const b=e.target.closest('button');if(!b)return;$$('#cpSeg button').forEach(x=>x.classList.toggle('on',x===b));};
$('#cpEdit').onclick=()=>{const el=cmt?.el;closeAll();if(el&&document.contains(el))void startEdit(el);};

// ── 그림: 두 번 누르면 클립보드에 넣고 image로(결정 V4) · 클립보드 서랍(결정 V3) ──
const drawerMod=()=>import('../../js/drawer.js?v=1.7.0-four-session-integration');
const CLIP_MIME='application/x-5e-drawer',CKIND={img:'그림',graph:'그래프',eq:'수식',text:'글',obj:'5E 그림'};
async function figToImage(img){const [qid]=(img.dataset.cell||'').split('|');const q=work.questions.find(x=>x.id===qid);
  try{await (await drawerMod()).clipAdd({src:img.src,name:`${q?.number||''}번 그림`,source:'5E 출제',w:img.naturalWidth,h:img.naturalHeight});}catch(e){toast('클립보드에 넣지 못했어요: '+e.message);return;}
  post({action:'tool',tool:'image'});note('fig-to-image',{no:q?.number});toast(`${q?.number}번 그림을 클립보드에 넣고 image를 열었어요 · ⇧⌘V로 꺼내 고친 뒤 ⌘C, 여기 서랍에서 그림 칸으로 끌어 놓으면 바뀌어요`,6000);}
let clipOn=false,clipSub=null;
async function toggleClip(on=!clipOn){clipOn=on;$('#clipD').classList.toggle('on',on);if(on){await renderClip();if(!clipSub){try{clipSub=(await drawerMod()).onClipChange(()=>{if(clipOn)void renderClip();});}catch{}}}note('clip',{on});}
async function renderClip(){const box=$('#clipList');let list=[];try{list=await (await drawerMod()).clipList();}catch(e){box.innerHTML=`<p class="empty-note">클립보드를 읽지 못했어요: ${E(e.message)}</p>`;return;}
  box.innerHTML=list.length?list.map(it=>`<div class="clipi" draggable="true" data-clip="${E(it.id)}" title="끌어서 대화·그림 칸에 넣기 · 두 번 누르면 대화에 붙이기"><div class="k">${E(CKIND[it.kind]||'그림')} · ${E(it.source)}<span class="sp"></span>${E(ago(it.at))}</div><div class="im"><img src="${it.src}" alt="${E(it.name)}"></div>${it.text?`<p class="ct">${E(it.text.slice(0,140))}</p>`:''}</div>`).join(''):'<p class="empty-note">클립보드가 비어 있어요. image·exam·hwp에서 ⌘C로 넣거나, 시험지 그림을 두 번 누르면 들어와요.</p>';}
$('#clipX').onclick=()=>toggleClip(false);
document.addEventListener('dragstart',e=>{const it=e.target.closest?.('.clipi');if(!it)return;e.dataTransfer.setData(CLIP_MIME,it.dataset.clip);e.dataTransfer.setData('text/plain',it.querySelector('img')?.alt||'그림');e.dataTransfer.effectAllowed='copy';document.body.classList.add('hx-dragging');});
document.addEventListener('dragend',()=>{document.body.classList.remove('hx-dragging');$$('.hx-drop').forEach(x=>x.classList.remove('hx-drop'));});
const dropTarget=t=>t.closest?.('#t-review img.fig,#t-sheet img.fig,[data-figslot],.composer');
document.addEventListener('dragover',e=>{if(![...(e.dataTransfer?.types||[])].includes(CLIP_MIME))return;const d=dropTarget(e.target);$$('.hx-drop').forEach(x=>{if(x!==d)x.classList.remove('hx-drop');});if(!d)return;e.preventDefault();d.classList.add('hx-drop');});
document.addEventListener('drop',async e=>{const id=e.dataTransfer?.getData(CLIP_MIME);if(!id)return;const d=dropTarget(e.target);$$('.hx-drop').forEach(x=>x.classList.remove('hx-drop'));if(!d)return;e.preventDefault();
  const mod=await drawerMod(),it=await mod.clipGet(id);if(!it?.src)return;
  if(d.classList.contains('composer')){pendingAttach.push({name:it.name+'.png',data:it.src});render();toast('다음에 보내는 말에 그림을 붙여요');note('clip-to-chat');void mod.clipConsume(id);return;}
  const [qid,bid]=(d.dataset.figslot||d.dataset.cell||'').split('|');const q=work.questions.find(x=>x.id===qid);if(!q)return;const key=d.dataset.figslot?'block:'+bid:bid;const b=q.blocks.find(x=>'block:'+x.id===key);if(!b)return;
  b.figure={name:it.name+'.png',data:it.src,...(it.w?{width:it.w,height:it.h}:{})};X.lockCell(q,key);
  for(const p of openProposals().filter(p=>p.qid===q.id&&p.changes.length&&p.changes.every(c=>isFigChange(q,c)&&(c.id===b.id||c.id===b.label)))){p.state='applied';for(const cid of p.comments||[])if(work.comments.some(c=>c.id===cid))X.updateComment(work,cid,{status:'applied'});resolved.set(p.id,{kind:'edit',qid:q.id,summary:p.summary});}work.pendingEdits=[...(work.pendingEdits||[]),{qid:q.id,key,label:'그림 바꿈(클립보드)',at:nowIso()}];work.dirty=true;save();render();void mod.clipConsume(id);
  toast(`${q.number}번 그림을 바꿨어요 · 직접 넣은 그림이라 잠겨 있고, 다음 「판 올리기」 때 판에 들어가요`,3200);note('clip-to-figure',{no:q.number});});
document.addEventListener('dblclick',e=>{const it=e.target.closest?.('.clipi');if(!it)return;void (async()=>{const mod=await drawerMod(),x=await mod.clipGet(it.dataset.clip);if(!x?.src)return;pendingAttach.push({name:x.name+'.png',data:x.src});render();toast('다음에 보내는 말에 그림을 붙여요');})();});

// ── 찾기(⌘K) ──
let findItems=[],findSel=0;
async function openFind(){closeAll();let list=[];try{list=((await idbGet('list'))||[]).filter(x=>!x.empty);}catch{}
  const cmd=(label,kbd,run)=>({kind:'기능',label,kbd,run});
  findItems=[cmd('새 시험지','⌘N',()=>{if(!pristine(work))newWork();showView('home');}),cmd('시험지 열기','⌘O',()=>$('#fOpen').click()),cmd('시험지 파일 저장(.5e)','⌘S',()=>saveFile()),cmd('시험지 공유 파일 저장(.html)','',()=>shareHtml()),
    cmd('image','⌥⌘1',()=>post({action:'tool',tool:'image'})),cmd('exam','⌥⌘2',()=>post({action:'tool',tool:'exam'})),cmd('hwp','⌥⌘3',()=>post({action:'tool',tool:'hwp'})),cmd('라이브러리','⌥⌘4',()=>post({action:'library'})),cmd('클립보드','⇧⌘V',()=>toggleClip(true)),
    cmd('화면 색 바꾸기','⌘⇧L',()=>post({action:'color-mode',mode:'next'})),cmd('설정','⌘,',()=>post({action:'settings'})),cmd('판 기록','',()=>{showView('work');$('#histMenu').hidden=false;drawHist();}),
    ...list.map(x=>({kind:'시험지',label:x.title,sub:`${x.head||'v0.0'} · ${STAGE[x.stage]||''}`,run:()=>$(`#examList [data-open="${CSS.escape(x.id)}"]`)?.click()||openById(x.id)})),
    ...X.orderedQuestions(work).map(q=>({kind:'문항',label:`${q.number}번 ${String(q.ask||q.blocks.find(b=>b.text)?.text||'').replace(/\$[^$]*\$/g,'').slice(0,60)}`,sub:work.meta.title||'',run:()=>{showView('work');tab='review';work.ui={...(work.ui||{}),tab,manual:true};render();$(`#t-review .qrow[data-q="${CSS.escape(q.id)}"]`)?.scrollIntoView({block:'start'});}}))];
  $('#findPop').hidden=false;$('#scrim').hidden=false;$('#findIn').value='';findSel=0;drawFind();setTimeout(()=>$('#findIn').focus(),10);note('find');}
async function openById(id){const w=await idbGet('work:'+id);if(w){work=w;work.proposals ||= [];sub=null;compare=null;tab=initialTab(work);showView('work');render();}}
const findShown=()=>{const v=$('#findIn').value.trim().toLowerCase();return findItems.filter(x=>!v||(x.label+' '+(x.sub||'')+' '+x.kind).toLowerCase().includes(v)).slice(0,14);};
function drawFind(){const L=findShown();findSel=Math.min(findSel,Math.max(0,L.length-1));$('#findList').innerHTML=L.map((x,i)=>`<button class="fi${i===findSel?' on':''}" data-fi="${i}"><span class="fk">${E(x.kind)}</span><span class="fl">${E(x.label)}</span>${x.sub?`<small>${E(x.sub)}</small>`:''}${x.kbd?`<kbd>${E(x.kbd)}</kbd>`:''}</button>`).join('')||'<p class="empty-note">찾는 것이 없어요</p>';}
function runFind(i){const x=findShown()[i];if(!x)return;closeAll();x.run();note('find-run',{kind:x.kind});}
$('#findIn').addEventListener('input',()=>{findSel=0;drawFind();});
$('#findIn').addEventListener('keydown',e=>{if(e.isComposing)return;if(e.key==='ArrowDown'){e.preventDefault();findSel++;drawFind();}else if(e.key==='ArrowUp'){e.preventDefault();findSel=Math.max(0,findSel-1);drawFind();}else if(e.key==='Enter'){e.preventDefault();runFind(findSel);}else if(e.key==='Escape'){e.preventDefault();closeAll();}});
$('#findList').onclick=e=>{const b=e.target.closest('[data-fi]');if(b)runFind(+b.dataset.fi);};

// ── 시험지 이름 메뉴 ──
function renameInline(){const t=$('#exTitleT');const inp=document.createElement('input');inp.className='hx-rename';inp.value=work.meta.title||'';t.replaceWith(inp);inp.focus();inp.select();
  let fin=false;const done=ok=>{if(fin||!inp.isConnected)return;fin=true;inp.replaceWith(t);const v=inp.value.trim();if(ok&&v&&v!==work.meta.title){work.meta.title=v;work.meta.titleAuto=false;save();note('rename');}render();};
  inp.addEventListener('keydown',e=>{if(e.isComposing)return;if(e.key==='Enter'){e.preventDefault();done(true);}if(e.key==='Escape'){e.preventDefault();done(false);}});inp.addEventListener('blur',()=>done(true));}
function duplicateWork(){const w=JSON.parse(JSON.stringify(work));w.projectId=crypto.randomUUID();w.meta.title=(work.meta.title||'시험지')+' 사본';w.meta.titleAuto=false;w.ui={tab,manual:false};work=w;sub=null;compare=null;save();render();toast('복제해 새 시험지로 열었어요 · 원래 시험지는 그대로예요');note('duplicate');}
// 시험지 공유: 받는 사람이 브라우저로 열어 보는 한 파일(.html). 5E가 없어도 보인다. 코멘트·근거 점은 빼고 지금 판의 시험지만.
async function shareHtml(){try{const css=(await Promise.all(['harness.css?v=1.8.0-harness','live.css?v=1.8.0-harness'].map(u=>fetch(u).then(r=>r.text())))).join('\n');const m=work.meta,qs=X.orderedQuestions(work);
  const body=`<div class="paper2"><div class="ph1"><span class="l">${E([m.term?.value,m.examName?.value].filter(Boolean).join(' '))}</span><span class="m">${E(m.subject?.value||'')}</span><span class="r">${E(m.grade?.value||'')}</span></div><div class="ph2"></div><div class="cols2">${qs.map(q=>`<div class="kq qblock">${paperHtml(q)}</div>`).join('')}</div></div>`.replace(/<span class="edot[^"]*"[^>]*><\/span>/g,'');
  const html=`<!doctype html><html lang="ko" data-theme="light" data-palette="classic" data-radius="b"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${E(work.meta.title||'시험지')} ${E(work.head||'')}</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"><style>${css}\nbody{overflow:auto;height:auto;background:#e9eaec}.share-head{max-width:900px;margin:24px auto 10px;font:13px/1.5 var(--ds-font);color:#555}.paper2{margin:0 auto 40px}</style></head><body><div class="share-head"><b>${E(work.meta.title||'시험지')}</b> · ${E(work.head||'v0.0')} · ${E(new Date().toLocaleDateString('ko-KR'))} · 5E 출제 하네스에서 공유</div>${body}</body></html>`;
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([html],{type:'text/html'}));a.download=`${(work.meta.title||'시험지').replace(/[\\/:*?"<>|]/g,'_')} ${work.head||''} 공유.html`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000);toast('공유 파일(.html)을 저장했어요 · 받는 사람은 브라우저로 열면 돼요');note('share');}
  catch(e){toast('공유 파일을 만들지 못했어요: '+e.message);}}

// ── 누르기 ──
document.addEventListener('click',async e=>{const t=e.target;if(!t.closest)return;
  if(t.closest('#bMe')){openMenu('#meMenu',$('#bMe'),{up:true});return;}
  const th=t.closest('[data-theme-set]');if(th){colorPref=th.dataset.themeSet;markTheme();post({action:'color-mode',mode:colorPref});closeAll();return;}
  if(t.closest('#miSettings')){closeAll();post({action:'settings'});return;}if(t.closest('#miKeys')){closeAll();post({action:'settings',which:'shortcuts'});return;}
  if(t.closest('#exTitle')){openMenu('#exMenu',$('#exTitle'));return;}
  if(t.closest('#exRename')){closeAll();renameInline();return;}if(t.closest('#exDup')){closeAll();duplicateWork();return;}if(t.closest('#exShare')||t.closest('#bShare')){closeAll();await shareHtml();return;}if(t.closest('#exSave')){closeAll();await saveFile();return;}
  if(t.closest('#exPool')){closeAll();await sendToExam();return;}if(t.closest('#exHwp')){closeAll();await sendToExam();setTimeout(()=>post({action:'tool',tool:'hwp'}),1200);toast('시험지를 exam에 넣고 hwp를 열어요 · 불러올 내용 확인 창에서 「적용」',3500);return;}
  if(t.closest('#bHelp')){openMenu('#helpMenu',$('#bHelp'),{right:true});return;}
  if(t.closest('#bFind')){await openFind();return;}
  if(t.closest('#bToolAsk')){const tl=curTool;post({action:'home'});document.body.classList.remove('tool-on');showView('work');$('#input').value=(tl?'@'+tl+' ':'');$('#input').focus();note('tool-ask',{tool:tl});return;}
  if(t.closest('#bPic')){post({action:'library'});return;}
  const chip=t.closest('[data-fill]');if(chip){$('#homeIn').value=chip.dataset.fill;$('#homeIn').focus();return;}
  if(t.closest('[data-openfile]')||t.closest('#homeOpen')){$('#fOpen').click();return;}
  if(t.closest('#homePlus')){if(!pristine(work))newWork();$('#fFolder').click();return;}
  if(t.closest('#homeForm')){$('#fForm').click();return;}
  if(t.closest('#homePast')){try{localStorage.setItem(PAST_KEY,pastOn()?'0':'1');}catch{}void renderHome();renderChrome();toast(pastOn()?'기출 참고를 켰어요 · 설계·초안 때 기출을 근거로 찾아요':'기출 참고를 껐어요 · 교육과정·자료 폴더만 봐요');return;}
  const appc=t.closest('.appc[data-tool]');if(appc){post({action:'tool',tool:appc.dataset.tool});return;}
  const opt=t.closest('[data-opt]');if(opt){const [i,k,j]=opt.dataset.opt.split('|').map(Number);pickChoice(i,k,j);return;}
  const lg=t.closest('[data-log]');if(lg){const p=$(`[data-logp="${lg.dataset.log}"]`);if(p){p.hidden=!p.hidden;lg.querySelector('svg')?.style.setProperty('transform',p.hidden?'':'rotate(90deg)');}return;}
  const acc=t.closest('[data-acc]');if(acc){await acceptProposal(acc.dataset.acc);return;}
  const rej=t.closest('[data-rej]');if(rej){rejectProposal(rej.dataset.rej);return;}
  const ur=t.closest('[data-unrej]');if(ur){undoReject(ur.dataset.unrej);return;}
  const sf=t.closest('[data-sfig]');if(sf){const p=work.proposals.find(x=>x.id===sf.dataset.sfig);const q=work.questions.find(x=>x.id===p?.qid);const c=p?.changes.find(c=>isFigChange(q,c));const b=c&&q.blocks.find(x=>x.id===c.id||x.label===c.id);const img=b&&$(`#t-sheet img.fig[data-cell="${CSS.escape(q.id+'|block:'+b.id)}"]`);if(img)await figToImage(img);else toast('이 그림 칸이 비어 있어요 · image에서 그려 클립보드에 넣은 뒤 그림 칸으로 끌어 놓으세요',3500);return;}
  const se=t.closest('[data-sedit]');if(se){const p=work.proposals.find(x=>x.id===se.dataset.sedit);const q=work.questions.find(x=>x.id===p?.qid);if(!p||!q)return;const ins=insMap(q,[p]);const [key,val]=[...ins.entries()][0]||[];
    const el=key&&$(`#t-sheet [data-cell="${CSS.escape(q.id+'|'+key)}"]`);if(el){await startEdit(el,{init:val,fromProposal:p.id});}else toast('이 제안은 글 칸이 아니라 그 자리에서 고칠 수 없어요 · 「이 문항 대화」에서 말로 고쳐 주세요',3200);return;}
  if(t.closest('#bApplyAll')){await applyAllOpen();return;}
  if(t.closest('#bNext')){nextSugg();return;}
  const pin=t.closest('[data-pin]');if(pin){clearTimeout(clickT);openComment(pin);return;}
});
document.addEventListener('keydown',e=>{const m=e.metaKey||e.ctrlKey;const inField=!!e.target.closest?.('input,textarea,select,[contenteditable]')||e.target.isContentEditable||!!editing;
  if(e.key==='Escape'){if(!$('#findPop').hidden||!$('#cPop').hidden||$$('.menu').some(x=>!x.hidden&&x.id!=='histMenu')){closeAll();return;}if(clipOn){toggleClip(false);return;}}
  if(m&&!e.shiftKey&&!e.altKey&&(e.key==='k'||e.key==='K')){e.preventDefault();void openFind();return;}
  if(m&&!e.shiftKey&&!e.altKey&&(e.key==='n'||e.key==='N')){e.preventDefault();post({action:'home'});if(!pristine(work))newWork();showView('home');return;}
  if(m&&e.shiftKey&&(e.code==='KeyV')){e.preventDefault();void toggleClip();return;}
  if(m&&e.shiftKey&&(e.code==='KeyL')){e.preventDefault();post({action:'color-mode',mode:'next'});return;}
  if(m&&!e.shiftKey&&e.key===','){e.preventDefault();post({action:'settings'});return;}
  if(m&&e.altKey&&e.code==='Digit4'){e.preventDefault();post({action:'library'});return;}
  if(m&&e.altKey&&e.code==='Digit0'){showView('home');return;}
  if(m&&e.key==='Enter'&&tab==='sheet'&&!inField&&openProposals().length){e.preventDefault();void applyAllOpen();return;}
  // 고르기 카드: 입력칸 밖에서 숫자 키
  if(!inField&&!m&&/^[1-4]$/.test(e.key)){const list=sub?subThread(sub):work?.chat||[];const i=list.length-1,c=list[i]?.choices?.findIndex(x=>x.picked==null);if(i>=0&&c>=0){const j=+e.key-1;if(list[i].choices[c].options[j]){e.preventDefault();pickChoice(i,c,j);}}}
});
window.__harness.showView=showView;window.__harness.openFind=openFind;window.__harness.toggleClip=toggleClip;window.__harness.openComment=openComment;window.__harness.acceptProposal=acceptProposal;window.__harness.rejectProposal=rejectProposal;window.__harness.applyAllOpen=applyAllOpen;Object.defineProperty(window.__harness,'view',{get:()=>view});Object.defineProperty(window.__harness,'tab',{get:()=>tab});
// ── 대화: 알아서 정한 것 · 결과물 카드(시안 v7) · 설계표 분포 줄 ──
const META_LABEL_H={subject:'과목',grade:'학년',term:'학기',examName:'시험',range:'범위',itemCount:'문항 수',pointsTotal:'총점',pointKinds:'배점',difficulty:'난이도',emphasis:'강조',form:'양식'};
const fmtMeta=v=>Array.isArray(v)?v.join(' · '):v&&typeof v==='object'?Object.entries(v).map(([k,n])=>`${k} ${n}`).join(' · '):String(v);
function decHtml(m){if(!m.decided?.length)return '';return `<div class="dec"><div class="h">알아서 정한 것 · 바꿀 것만 말씀하시면 돼요</div><ul>${m.decided.map(d=>`<li><span class="k">${E(d.k)}</span><span class="v" data-decfix="${E(d.k)}" title="눌러서 바꾸기">${E(d.v)}</span></li>`).join('')}</ul></div>`;}
function artHtml(m){const a=m.art;if(!a)return '';return `<button class="art" data-arttab="${E(a.tab)}"><span class="ic"><svg class="i"><use href="#i-${E(a.icon||'file')}"/></svg></span><span><b>${E(a.title)}</b><small>${E(a.sub||'')}</small></span><span class="sp"></span><svg class="i s" style="color:var(--ds-ink-3)"><use href="#i-right"/></svg></button>`;}
function planNote(){const rows=work.plan;if(!rows.length)return '';const dif={};for(const r of rows)if(r.difficulty)dif[r.difficulty]=(dif[r.difficulty]||0)+1;const pts=rows.reduce((n,r)=>n+(Number(r.points)||0),0),std=[...new Set(rows.flatMap(r=>r.standards||[]))];
  const qs=X.orderedQuestions(work).filter(q=>Number.isInteger(q.answer)),cnt=[0,0,0,0,0,0];qs.forEach(q=>cnt[q.answer+1]++);
  return `<div class="note" style="margin-top:14px"><b>분포</b> — ${Object.entries(dif).map(([k,n])=>`${E(k)} ${n}`).join(' · ')||'난이도 아직'} &nbsp;|&nbsp; 배점 합 ${pts}점${work.meta.pointsTotal?.value?` / ${E(work.meta.pointsTotal.value)}점`:''}${qs.length?` &nbsp;|&nbsp; 정답 ${[1,2,3,4,5].map(n=>CIRCLED[n-1]+' '+cnt[n]).join(' · ')}`:''}${std.length?` &nbsp;|&nbsp; 성취기준 ${std.length}개`:''}</div>`;}
document.addEventListener('click',e=>{const t=e.target;if(!t.closest)return;
  const at=t.closest('[data-arttab]');if(at){tab=at.dataset.arttab;compare=null;work.ui={...(work.ui||{}),tab,manual:true};if($('#work').classList.contains('panel-off'))$('#work').classList.remove('panel-off');save();render();return;}
  const df=t.closest('[data-decfix]');if(df){$('#input').value=`${df.dataset.decfix}은 `;$('#input').focus();return;}
  const pf=t.closest('#t-plan td[data-pfix]');if(pf){const tr=pf.closest('tr'),col=$('#t-plan .ptable tr').children[pf.cellIndex]?.textContent||'';$('#input').value=`설계표 ${tr.dataset.row}번 ${col}을 `;$('#input').focus();return;}
});
