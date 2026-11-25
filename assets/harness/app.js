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
const toast=t=>{const e=$('#toast');e.textContent=t;e.classList.add('on');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('on'),2200);};
const nowIso=()=>new Date().toISOString();
let work=null,tab='plan',sub=null,busy=0;
const log=[];// 화면 사건 기록(검진용): window.__harnessLog
window.__harnessLog=log;const note=(kind,data={})=>{log.push({at:nowIso(),kind,...data});if(log.length>500)log.shift();};

// ── 본창과 주고받기 ──
const pending=new Map();
const post=msg=>window.parent.postMessage({channel:'5e-harness',...msg},OWN);
function call(action,payload,{onProgress}={}){const requestId=crypto.randomUUID();return new Promise((resolve,reject)=>{pending.set(requestId,{resolve,reject,onProgress,action});post({action,requestId,...payload});});}
addEventListener('message',e=>{if(e.source!==window.parent||e.data?.channel!=='5e-harness')return;const m=e.data;
  if(m.action==='theme'){document.documentElement.dataset.theme=m.theme==='light'?'light':'dark';document.documentElement.dataset.palette=m.palette==='graphite'?'graphite':'classic';return;}
  if(m.action==='tool-opened'){document.body.classList.add('tool-on');return;}if(m.action==='tool-closed'){document.body.classList.remove('tool-on');$$('.side .nav').forEach(n=>n.classList.remove('on'));return;}
  if(m.action==='evidence-ready'){const p=pending.get(m.requestId);if(p){pending.delete(m.requestId);p.resolve(m.result);}return;}
  if(m.action==='author-progress'){pending.get(m.requestId)?.onProgress?.(m.progress);return;}
  if(m.action==='library-picked'){if(m.items?.length){work.sources.picked=[...(work.sources.picked||[]),...m.items.map(x=>({name:x.name,at:nowIso()}))];toast(`라이브러리에서 ${m.items.length}개를 가져왔어요`);save();}return;}
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
function save(){clearTimeout(saveTimer);saveTimer=setTimeout(async()=>{try{await idbSet('work:'+work.projectId,work);const list=(await idbGet('list'))||[];const i=list.findIndex(x=>x.id===work.projectId);const row={id:work.projectId,title:work.meta.title||'새 시험지',head:work.head,stage:work.meta.stage,at:nowIso()};if(i>=0)list[i]=row;else list.unshift(row);await idbSet('list',list.slice(0,30));await idbSet('last',work.projectId);$('#footSave').textContent='자동 저장됨 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});renderSide(list);}catch(e){$('#footSave').textContent='자동 저장 실패: '+e.message;note('save-fail',{error:e.message});}},400);}
async function saveFile(){const bytes=await buildExamsetFile(work);const name=`${(work.meta.title||'시험지').replace(/[\\/:*?"<>|]/g,'_')}.5e`;
  const desk=window.parent.fiveEDesktop?.examFiles;if(desk){const r=await desk.save({name,ext:'5e',bytes});toast('저장했어요: '+r.name);note('file-save',{bytes:bytes.length,desktop:true});return;}
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes]));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);toast('시험지 파일을 내려받았어요');note('file-save',{bytes:bytes.length});}
// 1.7.x 시험지·문항 파일(.5e sheet·.exampool·엑셀)은 새 시험지로 「복사해 가져온다」(결정 17·18 가정). 문항은 그대로, 설계표는 문항에서 거꾸로 채움, 판 v0.1.
async function importSheet(name,bytes){const read=await readSheetFile(name,bytes,{});if(read.kind!=='sheet')throw Error('그림·한글 시험지 파일은 image·hwp에서 여세요.');
  const p=read.pending,exam=p.exams?.[0],ids=exam?.items?.length?exam.items:p.questions.map(q=>q.id),w=X.newExamset({title:exam?.title||name.replace(/\.[^.]+$/,'')});
  const FORM_OF={합답형:'combo',서술형:'essay'};for(const id of ids){const q=clone(p.questions.find(x=>x.id===id));if(!q)continue;
    // 명세 4-5: 옛 근거 references[]를 출제 기록 근거로 옮긴다(직접 지지·교사).
    if(q.references?.length){const a=ensureAuthoring(q);for(const r of q.references){const t=/^(block|line|choice):/.test(r.target)?r.target:r.target==='question'?'question':q.blocks.some(b=>b.id===r.target)?'block:'+r.target:q.blocks.some(b=>b.lines?.some(l=>l.id===r.target))?'line:'+r.target:q.choices.some(c=>c.id===r.target)?'choice:'+r.target:'question';
      a.evidence.push({id:crypto.randomUUID(),target:t,claim:String(r.quote||r.label||'').slice(0,4000)||'(옛 근거)',judgement:'direct',by:'teacher',note:'옛 파일 근거에서 옮김',reviewVersion:null,at:nowIso(),source:{kind:'document',title:String(r.label||'').slice(0,600),quote:String(r.quote||'').slice(0,6000),page:Number.isInteger(r.page)?r.page:null}});}}
    X.addQuestion(w,q,{by:'import'});
    w.plan.push({no:w.plan.length+1,qid:q.id,unit:q.unitSmall||q.unitMiddle||'',standards:q.standardCode?[q.standardCode]:[],difficulty:q.difficulty||'',points:q.points,form:q.form||FORM_OF[q.type]||'single',structure:q.structure||'',twist:q.intent||'',figure:q.blocks.some(b=>b.kind==='figure'&&b.figure?.data)?'reuse':'none',basis:[],status:'set',by:'teacher',seen:true});}
  X.setMeta(w,'itemCount',w.items.length,'teacher');X.setMeta(w,'pointsTotal',X.computeStats(X.orderedQuestions(w)).pointsTotal,'teacher');w.meta.stage='review';
  X.commitVersion(w,{summary:`가져옴: ${name}`});w.chat.push({role:'ai',text:`「${name}」에서 문항 ${w.items.length}개를 새 시험지로 복사해 왔어요(원래 파일은 그대로). 과목과 범위를 알려 주시면 근거 검토를 이어서 할게요.`,at:nowIso()});return w;}
async function openFile(file){const bytes=new Uint8Array(await file.arrayBuffer());if(peekKind(bytes)!=='examset'){try{work=await importSheet(file.name,bytes);sub=null;tab='review';save();render();note('import-sheet',{n:work.items.length});toast('기존 시험지를 복사해 왔어요');}catch(e){toast('가져오지 못했어요: '+e.message);note('import-sheet-fail',{error:e.message});}return;}
  try{const w=await parseExamsetFile(bytes);work=w;sub=null;save();render();toast('시험지를 열었어요 · '+(work.head||'v0.0'));note('file-open',{head:work.head});}catch(e){toast('열지 못했어요: '+e.message);note('file-open-fail',{error:e.message});}}

// ── 대화 ──
function say(role,text,extra={}){const m={role,text,at:nowIso(),...extra};(sub?subThread(sub):work.chat).push(m);save();renderThread();return m;}
function subThread(qid){const s=work.sessions.find(x=>x.scope==='q:'+qid)||(work.sessions.push({id:crypto.randomUUID(),scope:'q:'+qid,parent:'exam',provider:'codex',startedAt:nowIso(),thread:[]}),work.sessions.at(-1));s.thread ||= [];return s.thread;}
// 진행 줄: 화면을 다시 그려도 남는다(11-25 완주 2: render가 대화를 다시 그리며 진행 줄을 지워, 초안 16문항·그림 그리는 동안 진행이 안 보였다).
const acts=new Set();
function act(text){const el=document.createElement('div');el.className='msg a';el.innerHTML=`<div class="act"><span class="dot"></span>${E(text)}</div>`;acts.add(el);$('#thread').append(el);$('#scroll').scrollTop=1e7;
  return {set:t=>{el.querySelector('.act').lastChild.textContent=t;},done:()=>{acts.delete(el);el.remove();}};}
async function send(){const ta=$('#input'),text=ta.value.trim();if(!text||busy)return;ta.value='';say('me',text);busy++;$('#bSend').disabled=true;
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
  const found=[];for(const kind of ['curriculum','past']){try{const r=await call('evidence',{request:{kind,terms:terms.slice(0,4),sentence:`${m.subject?.value||''} ${terms.join(' ')}`,limit:kind==='past'?6:4}});for(const e of r.results||[])found.push(e);note('plan-evidence',{evKind:kind,available:r.available,n:(r.results||[]).length,warning:r.warning||''});}catch(e){note('plan-evidence-fail',{evKind:kind,error:e.message});}}
  for(const h of await folderHits([terms.join(' '),text].join(' '),4))found.push(h);
  work.sources.planEvidence=found.map(e=>({ref:e.ref,kind:e.kind,title:e.title,page:e.page||null,quote:String(e.quote||'').slice(0,600)}));return work.sources.planEvidence;}
async function examTurn(text){
  const ev=await planEvidence(text);
  const prompt=buildExamPrompt(work,{text,ledger:ledgerForPrompt(),rules:rulesFor()})+(ev.length?`\n\n[근거 검색 결과 · 후보일 뿐, 설계표 basis·standards에 title로만 인용]\n${ev.map(e=>`- ${e.kind} · ${e.title}${e.page?` · ${e.page}쪽`:''}: ${e.quote}`).join('\n')}`:'');const a=act('생각하는 중…');
  try{let r=await call('turn',{scope:'exam:'+work.projectId,text:prompt}),parsed=parseExamResponse(r.text);
    if(!parsed.ok){a.set('형식을 고쳐 다시 받는 중…');r=await call('turn',{scope:'exam:'+work.projectId,text:prompt+'\n\n[앞 응답 형식 오류 — 고쳐서 JSON만]\n'+parsed.errors.join('\n')});parsed=parseExamResponse(r.text);}
    if(!parsed.ok)throw Error('AI 응답 형식이 맞지 않아요: '+parsed.errors.join(' / '));note('exam-turn',{ms:r.ms,model:r.model});return {...parsed.value,_ms:r.ms,_model:r.model};}
  finally{a.done();}
}
async function examSend(text){
  // 1) 「반영해」: 먼저 대장 상태를 교사 말대로 맞춘 뒤(AI는 decided만 표시), 코드가 결정된 것만 반영한다.
  const apply=wantsApply(text),discuss=wantsDiscussOnly(text);
  if(/다 달았|코멘트 (다|봐|읽|확인)/.test(text)&&work.comments.some(c=>c.status==='new')){await triageComments(text);return;}
  // 정답 분포 맞추기(AI 대화를 거치지 않음): 안 만들기 / 교사가 그 안을 반영하라고 할 때
  if(/정답 ?분포.*(맞춰|맞추|고르게)/.test(text)&&!apply){await rebalanceAnswers();return;}
  if(/정답 ?분포 ?안/.test(text)&&apply){for(const c of work.comments.filter(c=>c.status==='talk'&&/^\(정답 분포 맞추기\)/.test(c.text)))X.updateComment(work,c.id,{status:'decided',decision:c.text});await applyNow('정답 분포 맞추기');return;}
  const shownPlan=(work.planProposals||[]).slice();// 교사가 이미 본 설계표 안만 받을 수 있다(이번 턴에 새로 나온 안은 아직 못 봤음)
  const v=await examTurn(text);
  absorb(v,text,{allowDecided:!discuss});
  say('ai',v.reply,{asks:v.questions||[],model:v._model,ms:v._ms,ruleCards:(v.rules||[]).map(r=>({text:r.text,id:crypto.randomUUID()}))});
  if(discuss){note('discuss-only');return;}
  const planAsk=shownPlan.length&&(/설계표.*(반영|적용)|추천대로|그 안대로|제안대로/.test(text));
  if(planAsk){const n=applyPlanProposals(shownPlan);say('ai',`설계표 ${n}칸을 안대로 바꿨어요.`);}
  if(apply&&!(planAsk&&!work.comments.some(c=>c.status==='decided'))){await applyNow('교사 지시: '+text.slice(0,80));return;}
  if(wantsFinal(text)){declareFinal();return;}
  if(wantsDraft(text)){await draftAll();return;}
  if(wantsSolve(text)&&work.questions.length){const v=work.versions.find(x=>x.label===work.head)||{label:work.head||'v0.0'};await solveChanged({label:v.label,changed:work.items.slice()});return;}
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
      if(real.length)say('ai',`설계표는 이미 보셨으니 바꾸지 않았어요. 바꿀 안 ${real.length}칸: ${real.slice(0,6).map(p=>`${p.no}번 ${summarizeRow(p.before)} → ${summarizeRow(p.after)}`).join(' / ')}${real.length>6?` 외 ${real.length-6}칸`:''}. 이대로 하려면 「설계표 반영해」라고 해 주세요.`);if(work.meta.stage==='design'&&work.plan.length)tab='plan';}}
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
  work.meta.stage='draft';const a=act(`문항 ${rows.length}개 쓰는 중 · 0/${rows.length}`);let done=0,fails=[];
  const one=async row=>{try{await draftRow(row).catch(e=>{note('draft-retry',{no:row.no,error:e.message});return draftRow(row);});}catch(e){fails.push({no:row.no,error:e.message});note('draft-fail',{no:row.no,error:e.message});}finally{done++;a.set(`문항 ${rows.length}개 쓰는 중 · ${done}/${rows.length}`);save();render();}};// 문항마다 저장: 도중에 앱을 꺼도 다 쓴 문항은 남고, 다시 「초안 써 줘」 하면 빈 칸만 쓴다
  const queue=[...rows];const workers=Array.from({length:3},async()=>{while(queue.length)await one(queue.shift());});await Promise.all(workers);a.done();
  const v=commit(`초안 ${rows.length-fails.length}문항`,{changed:rows.filter(r=>r.qid).map(r=>r.qid)});
  say('ai',`초안 ${v.label}이 나왔어요(${rows.length-fails.length}문항${fails.length?` · 못 쓴 문항 ${fails.map(f=>f.no+'번').join(', ')} — 다시 「초안 써 줘」라고 하면 그 칸만 써요`:''}). 「문항 검토」에서 문항마다 오른쪽 아래에 편하게 코멘트를 적어 주세요. 근거·해설·검토는 각 문항의 단추를 누르면 열려요.`,{stats:v.stats});
  tab='review';work.meta.stage='review';save();render();
  // 완주 3: AI가 정해 준 정답 번호를 다 따르지 않아 4연속이 생겼다 → 고르지 않으면 알리고, 맞추기는 교사가 말할 때 「안」으로만(결정: 정답 분포 맞추기도 제안)
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
  a.done();say('ai',`정답 분포를 맞추는 안을 문항 ${pick.length}개에 붙였어요(${pick.map(p=>`${p.q.number}번 ${CIRCLED[p.q.answer]}→${CIRCLED[p.to-1]}`).join(', ')}). 아직 바꾸지 않았어요. 이대로 하려면 「정답 분포 안 그대로 반영해」라고 해 주세요.`,{ledger:true});tab='review';save();}
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
  const r=await call('author',{packet:packetFor(q,{kind:'draft',text:text+(fh.length?'\n\n'+folderPrompt(fh):'')})});const resp=r.response;
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
  say('ai',`코멘트 ${fresh.length}개를 읽었어요. 아직 아무것도 고치지 않았어요. 문항마다 「지금 → 바꿀 안」을 붙여 두었어요. 그대로 할 것을 말씀해 주시면 「결정됨」으로 두고, 「반영해」라고 하시면 결정된 것만 반영해요.`,{ledger:true,counts:cnt});tab='review';save();
}
function beforeOf(q,changes){return changes.map(c=>{try{if(c.path==='bogi'){const b=q.blocks.find(b=>b.kind==='bogi');const l=typeof c.line==='string'?b?.lines.find(l=>l.label===c.line):b?.lines[Number(c.line)];return l?.text??'';}
  if(c.path==='choice'){return q.choices[Number(c.index??c.line)]?.text??'';}if(c.path==='answer')return q.answer==null?'':String(q.answer+1);if(c.path==='passage')return q.blocks.find(b=>b.kind==='text'&&!b.parent)?.text??'';
  if(c.path==='block')return q.blocks.find(b=>b.id===c.id||b.label===c.id)?.text??'';return typeof q[c.path]==='string'?q[c.path]:'';}catch{return '';}});}

// 반영: 결정된 코멘트에 딸린 제안만 적용 → 판 올림 → 바뀐 문항만 다시 풂.
// 교사가 분명히 「반영해」라고 했는데 안(proposal)이 없을 때: 결정 내용으로 안을 만든다(state agreed). 반영은 applyDecided가 한다.
async function proposalFrom(q,text,commentIds){try{const r=await call('author',{packet:packetFor(q,{kind:'chat',text})});const changes=proposalChanges(q,r.response.proposal);if(!changes.length){note('proposal-empty',{no:q.number});return null;}
  const pid=X.addProposal(work,{qid:q.id,changes,before:beforeOf(q,changes),summary:r.response.proposal?.summary||'교사 결정대로',comments:commentIds,effects:{answer:changes.some(c=>c.path==='answer')}});X.setProposalState(work,pid,'agreed');note('proposal-from-decision',{no:q.number,changes:changes.length});return pid;}
  catch(e){note('proposal-from-decision-fail',{no:q.number,error:e.message});return null;}}
async function applyNow(why){
  const bare=work.comments.filter(c=>c.status==='decided'&&!(c.proposals||[]).some(pid=>work.proposals.find(p=>p.id===pid&&['current','agreed'].includes(p.state))));
  if(bare.length){const a=act(`결정된 코멘트 ${bare.length}개를 고칠 칸으로 옮기는 중…`);for(const c of bare){const q=work.questions.find(x=>x.id===c.qid);if(!q)continue;
      await proposalFrom(q,`교사가 이 코멘트를 이렇게 하기로 정하고 반영하라고 했다. 정한 대로 문항을 고칠 proposal.changes를 만들어라. 정한 것 밖은 건드리지 마.\n[코멘트] ${c.text}\n[정한 것] ${c.decision||c.gist||''}\n[교사 말] ${why}`,[c.id]);}a.done();}
  const before=work.questions.map(q=>[q.id,JSON.stringify(stripMeta(q))]);
  const r=X.applyDecided(work);const changed=r.changedQids||[];
  // 완주 3: 「결정됨」인데 바꿀 곳을 못 찾은 코멘트(이미 그렇게 쓰여 있는 경우 등)가 말 없이 빠졌다 → 함께 알린다.
  const noNos=[...new Set((r.noProposal||[]).map(id=>work.questions.find(q=>q.id===work.comments.find(c=>c.id===id)?.qid)?.number).filter(Boolean))];
  const noTxt=noNos.length?` · ${noNos.join('·')}번은 정하신 대로 바꿀 곳을 찾지 못했어요(이미 그렇게 쓰여 있을 수 있어요) — 「결정됨」으로 두었으니 확인해 주세요`:'';
  if(!changed.length&&r.errors?.length){const nos=[...new Set(r.errors.map(e=>work.questions.find(q=>q.id===e.qid)?.number).filter(Boolean))];say('ai',`${nos.join('·')}번은 글로 고칠 수 없는 안(그림 등)이라 반영하지 못하고 「결정됨」으로 남겼어요${noTxt}. 바뀐 것은 없어요. 그림은 image에서 고쳐 주세요.`);note('apply-errors',{n:r.errors.length});return;}
  if(!changed.length){say('ai',`반영할 것이 없어요${r.noProposal?.length?` (결정됐지만 고칠 칸으로 옮기지 못한 코멘트 ${r.noProposal.length}개 — 「결정됨」으로 남겨 뒀어요)`:''}${r.skipped?.length?` (잠긴 칸이라 건너뛴 것 ${r.skipped.length}개)`:''}. 아직 의논 중인 것은 그대로 뒀어요.`);note('apply-empty',{noProposal:r.noProposal?.length||0});return;}
  const v=commit(why,{changed,applied:r});const talk=work.comments.filter(c=>c.status==='talk').length;
  const failedNos=[...new Set((r.errors||[]).map(e=>work.questions.find(q=>q.id===e.qid)?.number).filter(Boolean))];
  // 11-25 완주 2: 그림 코멘트(그림 높이·글자 크기)는 글로 고칠 수 없어 적용에 실패했는데 결과 문구가 말하지 않았다 → 이유와 다음 길
  say('ai',`반영했어요 → ${v.label}. 바뀐 문항 ${changed.map(id=>work.questions.find(q=>q.id===id)?.number+'번').join(', ')}${talk?` · 의논 중 ${talk}개는 그대로`:''}${r.skipped?.length?` · 직접 고친 칸이라 건너뛴 것 ${r.skipped.length}개`:''}${failedNos.length?` · ${failedNos.join('·')}번은 글로 고칠 수 없는 안(그림 등)이라 「결정됨」으로 남겼어요 — 그림은 「문항 검토」의 그림 칸을 두 번 눌러 image에서 고쳐 주세요`:''}${noTxt}.`,{stats:v.stats});
  note('apply',{label:v.label,changed:changed.length,skipped:r.skipped?.length||0,unchangedOthers:before.filter(([id,h])=>!changed.includes(id)).every(([id,h])=>JSON.stringify(stripMeta(work.questions.find(q=>q.id===id)))===h)});
  void solveChanged(v);
}
const stripMeta=q=>{const {authoring,reviews,typeset,seen,figureSpecs,...rest}=q;return rest;};
function commit(summary,{changed=[],applied}={}){const v=X.commitVersion(work,{summary,changed,applied:applied?.applied||{}});save();render();note('version',{label:v.label,stats:v.stats});return v;}
function declareFinal(){const v=X.declareFinal(work);work.meta.stage='final';save();render();say('ai',`${v.label}으로 정했어요. 정답 배열 ${v.stats.answers.map(a=>a?CIRCLED[a-1]:'·').join(' ')} · 배점 합계 ${v.stats.pointsTotal}점. 시험지 탭에서 exam으로 보내 조판·한글로 내보낼 수 있어요.`,{stats:v.stats});note('final',{label:v.label});}

// 문항의 실제 그림(풀이 검사에 첨부 — 11-25 완주 1: 글만 보내 그림 문항은 두 모델 모두 「그림 누락」으로 못 풂)
const figuresOf=q=>[...q.blocks.filter(b=>b.kind==='figure'&&b.figure?.data&&b.figure.data.length<6e6).map(b=>({name:(b.label||'그림')+'.png',data:b.figure.data})),...q.choices.map((c,i)=>c.figure?.data?{name:'선지 '+CIRCLED[i]+'.png',data:c.figure.data}:null).filter(Boolean)].slice(0,6);
// 풀이 검사: 판의 바뀐 문항만, 두 모델이 정답·해설 없이 새 맥락에서 따로 푼다(결정 8 + 4 가정).
async function solveChanged(v){const ids=(v.changed||[]).filter(id=>work.questions.some(q=>q.id===id&&q.type!=='서술형'));if(!ids.length)return;
  const a=act(`정답·해설 가린 문항지로 두 모델 풀이 — 바뀐 문항 ${ids.length}개`);let done=0;
  const doneIds=[];
  const one=async id=>{const q=work.questions.find(x=>x.id===id);if(!q)return;const runs=[];doneIds.push(id);
    // 생명과학 시나리오: 그림 칸이 비어 있는 문항도 두 모델에게 보내 「그림 없음」만 받고 크레딧을 썼다 → 그림이 다 들어온 뒤에 푼다.
    const empty=q.blocks.filter(b=>b.kind==='figure'&&!b.figure?.data);if(empty.length){X.recordCheck(work,{qid:id,version:v.label,contentHash:null,runs:[],verdict:'skipped',skipped:`그림 칸 ${empty.length}개가 비어 있어 아직 풀지 않음`});note('solve-skip-figure',{no:q.number});a.set(`두 모델 풀이 · ${++done}/${ids.length}`);return;}
    for(const s of SOLVERS){let last=null;for(const model of [s.model,...(s.fallback||[])]){try{const r=await call('turn',{scope:`solve:${model}:${id}`,text:buildSolvePrompt(q),model,effort:'medium',attachments:figuresOf(q)});const p=parseSolve(r.text);last={provider:'codex',model:r.model||model,isolated:true,answer:p.ok?p.value.answer:null,multiple:p.value?.multiple||[],note:p.value?.note||(p.ok?'':'형식 오류'),ms:r.ms};break;}
        catch(e){last={provider:'codex',model,isolated:true,answer:null,note:'풀지 못함: '+e.message,ms:0};note('solve-retry',{model,error:e.message.slice(0,120)});}}runs.push(last);}
    const ans=Number.isInteger(q.answer)?q.answer+1:null,vd=verdict(ans,runs);X.recordCheck(work,{qid:id,version:v.label,contentHash:null,runs,verdict:vd,skipped:runs.every(r=>r.answer==null)?'풀이 실패':null});
    note('solve',{no:q.number,verdict:vd,answers:runs.map(r=>r.answer)});a.set(`두 모델 풀이 · ${++done}/${ids.length}`);render();};
  const queue=[...ids];await Promise.all(Array.from({length:1},async()=>{while(queue.length)await one(queue.shift());}));a.done();
  const ck=doneIds.map(id=>work.checks.filter(c=>c.qid===id&&c.version===v.label).at(-1)).filter(Boolean),bad=ck.filter(c=>c.verdict!=='pass');
  // 완주 6: 초안 직후엔 그림이 아직 없어 「그림이 아직 없음」이 16줄 나왔다(곧 뒤에서 그림을 그림) → 그런 문항은 한 줄로 묶는다.
  const waitFig=bad.filter(c=>c.verdict==='skipped'&&/그림 칸/.test(c.skipped||''));
  if(waitFig.length&&waitFig.length===bad.length&&ck.length-bad.length===0){say('ai',`${v.label}: 그림이 들어가야 풀 수 있는 문항 ${waitFig.length}개는 그림을 넣은 뒤 두 모델이 풀어요.`);save();return;}
  const used=[...new Set(ck.flatMap(c=>c.runs.filter(r=>r.answer!=null||!/^풀지 못함/.test(r.note||'')).map(r=>r.model)))];
  say('ai',`${v.label} 두 모델 풀이(한 회사 두 모델: ${used.join('·')||SOLVERS.map(s=>s.label).join('·')}${used.some(m=>!SOLVERS.some(s=>s.model===m))?' — 기본 둘째 모델이 막혀 대신 푼 모델이 있어요':''}) — 문항 ${ck.length}개 중 통과 ${ck.length-bad.length}${bad.length?` · 확인 필요 ${bad.filter(c=>!waitFig.includes(c)).map(c=>`${work.questions.find(q=>q.id===c.qid)?.number}번(${({doubt:'두 모델 답이 갈림',fail:'두 모델 모두 정답과 다름',single:'한 모델만 풂',skipped:c.skipped&&/그림 칸/.test(c.skipped)?'그림이 아직 없음':'풀지 못함'})[c.verdict]||c.verdict})`).join(', ')}`:''}${waitFig.length?` · 그림을 기다리는 문항 ${waitFig.length}개`:''}. 고칠지는 말씀해 주시면 정해요.`);save();}

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
async function drawFigure(qid,i,{bg=false}={}){const q=work.questions.find(x=>x.id===qid),spec=q?.figureSpecs?.[i];if(!spec)return false;if(!bg)busy++;const a=bg?{set(){},done(){}}:act(`${q.number}번 그림 그리는 중…`);
  try{const r=await call('figure',{qid,kind:spec.kind,description:spec.description,mustNot:spec.mustNot||[]});
    let slot=q.blocks.find(b=>b.kind==='figure'&&!b.figure?.data);
    if(!slot){toast('빈 그림 칸이 없어 새 그림 칸을 만들었어요');slot={id:crypto.randomUUID(),parent:null,kind:'figure',label:spec.kind==='graph'?'그래프':'그림',text:'',layout:'세로',figure:null};q.blocks.push(slot);}
    slot.figure={name:`${spec.kind==='graph'?'그래프':'그림'}.png`,data:r.data,...(r.width?{width:r.width,height:r.height}:{})};spec.done=true;work.dirty=true;save();render();note('figure',{no:q.number,ms:r.ms,bg});if(!bg)toast(`${q.number}번 그림을 넣었어요`);return true;}
  catch(e){note('figure-fail',{no:q?.number,error:e.message});const wasSub=sub;sub=null;if(!bg)say('ai',`${q?.number}번 ${spec.kind==='graph'?'그래프':'그림'}을 그리지 못했어요: ${e.message} · 문항의 그림 칸은 그대로예요. 「문항 검토」 → ${q?.number}번 「그림」에서 다시 「그리기」를 누르거나, image에서 직접 그려 넣을 수 있어요.`,{error:true});sub=wasSub;render();return false;}finally{a.done();if(!bg)busy--;}}
// v8 초안 단계(「초안 v0.1 · 그림 8장」): 초안 뒤 빈 그림 칸을 뒤에서 차례로 그린다(빈 칸 처음 채우기 — 결정 7). 대화는 막지 않는다. 다 그리면 판을 올리고 그 문항만 다시 푼다.
async function drawAll(){const jobs=[];for(const q of X.orderedQuestions(work))(q.figureSpecs||[]).forEach((f,i)=>{if(!f.done&&q.blocks.some(b=>b.kind==='figure'&&!b.figure?.data))jobs.push({qid:q.id,i,no:q.number});});if(!jobs.length)return;
  const a=act(`그림 ${jobs.length}장 그리는 중 · 0/${jobs.length} (그동안 대화해도 돼요)`);let done=0;const ok=[],fail=[];const queue=[...jobs];
  await Promise.all(Array.from({length:2},async()=>{while(queue.length){const j=queue.shift();(await drawFigure(j.qid,j.i,{bg:true})?ok:fail).push(j);a.set(`그림 ${jobs.length}장 그리는 중 · ${++done}/${jobs.length} (그동안 대화해도 돼요)`);}}));a.done();
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
async function sendToExam(){try{const bundle=X.toSheetBundle(work);const blob=buildSheetProject(bundle,{name:work.meta.title||'시험지'});const bytes=new Uint8Array(await blob.arrayBuffer());
  post({action:'open-project',name:`${work.meta.title||'시험지'}.5e`,bytes});work.outputs.push({version:work.head,kind:'exam-sheet',at:nowIso()});work.meta.stage=work.meta.stage==='final'?'final':'typeset';save();note('to-exam',{bytes:bytes.length});toast('exam으로 보냈어요 · 불러올 내용 확인 창에서 「적용」을 누르면 시험지로 들어가요');}
  catch(e){toast('exam으로 보내지 못했어요: '+e.message);note('to-exam-fail',{error:e.message});}}

// ── 그리기 ──
const tex=s=>String(s??'').split(/(\$[^$]+\$)/g).map(part=>{if(/^\$[^$]+\$$/.test(part)){try{return window.katex?katex.renderToString(part.slice(1,-1),{throwOnError:false}):E(part.slice(1,-1));}catch{return E(part);}}return E(part).replace(/\n/g,'<br>');}).join('');
function dot(q,key){const s=X.cellEvidence(q,key);if(s==='ok')return '';return `<span class="edot ${s}" data-ev="${E(q.id)}|${E(key)}" title="${s==='waived'?'근거 없음 — 예외로 진행':s==='problem'?'근거와 맞지 않는 곳이 있어요':'근거가 아직 없어요 · 누르면 보기'}"></span>`;}
function paperHtml(q){let h=`<p class="q" data-cell="${E(q.id)}|ask"><b>${E(q.number)}.</b> `;const blocks=q.blocks.filter(b=>!b.parent);const first=blocks.find(b=>b.kind==='text'&&b.text);
  if(first)h+=`<span data-cell="${E(q.id)}|block:${E(first.id)}">${tex(first.text)}${dot(q,'block:'+first.id)}</span></p>`;else h+='</p>';
  for(const b of q.blocks){if(b===first||b.kind==='bogi')continue;
    if(b.kind==='text'&&b.text)h+=`<p data-cell="${E(q.id)}|block:${E(b.id)}">${tex(b.text)}${dot(q,'block:'+b.id)}</p>`;
    else if(b.kind==='figure')h+=b.figure?.data?`<img class="fig" src="${b.figure.data}" alt="${E(b.label)}" data-cell="${E(q.id)}|block:${E(b.id)}">`:`<span class="figslot">${E(b.label||'그림')} · 아직 그림 없음</span>`;
    else if(b.kind==='table')h+=`<table class="dt" data-cell="${E(q.id)}|block:${E(b.id)}">${b.table.cells.map(r=>`<tr>${r.map(c=>`<td>${tex(c.value)}</td>`).join('')}</tr>`).join('')}</table>`;
    else if(b.lines)h+=`<div class="box">${b.lines.map(l=>`<p data-cell="${E(q.id)}|line:${E(l.id)}">${E(l.label)} ${tex(l.text)}${dot(q,'line:'+l.id)}</p>`).join('')}</div>`;}
  h+=`<p data-cell="${E(q.id)}|ask">${tex(q.ask)} <span class="pt">[${E(q.points)}점]</span>${dot(q,'ask')}</p>`;
  const bogi=q.blocks.find(b=>b.kind==='bogi'&&b.lines?.some(l=>String(l.text||'').trim()));if(bogi)h+=`<div class="bogi">${bogi.lines.map(l=>`<p data-cell="${E(q.id)}|line:${E(l.id)}">${E(l.label)}. ${tex(l.text)}${dot(q,'line:'+l.id)}</p>`).join('')}</div>`;
  if(q.type!=='서술형')h+=`<div class="choices${q.choices.some(c=>String(c.text).length>14)?' v':''}">${q.choices.map((c,i)=>`<p data-cell="${E(q.id)}|choice:${E(c.id)}">${CIRCLED[i]} ${tex(c.text)}</p>`).join('')}</div>`;
  return h;}
function statsLine(s){if(!s)return '';const c=s.countByNumber||{};return `정답 ${s.answers.map(a=>a?CIRCLED[a-1]:'·').join(' ')} · ${[1,2,3,4,5].map(n=>`${CIRCLED[n-1]}${c[n]||0}`).join(' ')} · 최대 연속 ${s.longestRun} · 합계 ${s.pointsTotal}점`;}
function renderThread(){const list=sub?subThread(sub):work.chat;
  $('#thread').innerHTML=list.map((m,i)=>m.role==='me'?`<div class="msg u"><p>${E(m.text)}</p></div>`:`<div class="msg a${m.error?' err':''}">${String(m.text).split(/\n+/).map(p=>`<p>${E(p)}</p>`).join('')}${(m.asks||[]).length?`<div class="ledger"><div class="lh">꼭 정해야 해요</div>${m.asks.map(a=>`<div class="lr"><span class="ln">?</span><span>${E(a)}</span></div>`).join('')}</div>`:''}${m.stats?`<p class="note2">${E(statsLine(m.stats))}</p>`:''}${m.ledger?ledgerHtml():''}${(m.ruleCards||[]).filter(r=>!r.done).map(r=>`<div class="rulec" data-rule="${E(r.id)}" data-msg="${i}"><svg class="i s"><use href="#i-book"/></svg> 이걸 규칙으로 저장할까요? <b>「${E(r.text)}」</b><span class="sp"></span><button class="btn sm" data-layer="global">전체</button><button class="btn sm" data-layer="subject">과목</button><button class="btn sm" data-layer="exam">이 시험지</button><button class="btn sm gh" data-layer="no">아니요</button></div>`).join('')}${m.model?`<p class="note2">${E(m.model)}${m.ms?` · ${Math.round(m.ms/1000)}초`:''}</p>`:''}</div>`).join('');
  for(const el of acts)$('#thread').append(el);$('#scroll').scrollTop=1e7;}
const ST={new:'새 코멘트',talk:'의논 중',decided:'결정됨',applied:'반영됨',dropped:'안 함'},SC={new:'b-ok',talk:'b-talk',decided:'b-ok',applied:'b-done',dropped:'b-ok'};
function ledgerHtml(){const list=work.comments.filter(c=>c.status!=='dropped').slice(-20);if(!list.length)return '';return `<div class="ledger"><div class="lh">코멘트 대장 · ${E(work.head||'v0.0')}</div>${list.map(c=>`<div class="lr"><span class="ln">${E(work.questions.find(q=>q.id===c.qid)?.number||'전체')}번</span><span>${E(c.gist||c.text).slice(0,80)}</span><span class="cst ${SC[c.status]}">${ST[c.status]}</span></div>`).join('')}</div>`;}
function renderPlan(){const m=work.meta,chip=(k,label,fmt=v=>v)=>{const x=m[k];if(!x||x.value==null||x.value==='')return `<span class="c miss"><b>${label}</b>아직</span>`;return `<span class="c${x.by==='ai'?' ai':''}"><b>${label}</b>${E(fmt(x.value))}</span>`;};
  const list=v=>Array.isArray(v)?v.join(' · '):typeof v==='object'?Object.entries(v).map(([k,n])=>k+n).join(' · '):v;
  $('#t-plan').innerHTML=`<div class="cond">${chip('subject','과목')}${chip('range','범위',list)}${chip('itemCount','문항',v=>v+'문항')}${chip('pointsTotal','총점',v=>v+'점')}${chip('pointKinds','배점',v=>list(v))}${chip('difficulty','난이도',list)}${chip('emphasis','강조',list)}${chip('form','양식')}</div>`+
   (work.plan.length?`<table class="ptable"><tr><th class="num">번호</th><th>소단원</th><th>난이도</th><th>배점</th><th>유형</th><th>그림</th><th>상태</th></tr>${work.plan.map(r=>`<tr data-row="${r.no}" class="${r.seen?'':'seen-no'}"><td>${r.no}</td><td>${E(r.unit)}</td><td>${E(r.difficulty)}</td><td>${E(r.points)}점</td><td>${E(r.form||'')}</td><td>${E(({reuse:'재활용',convert:'기출 변형',new:'새로',code:'코드 그래프',none:'없음'})[r.figure]||'')}</td><td class="${({set:'s-ok',choosing:'s-pick',empty:'s-empty',redesign:'s-talk'})[r.status]||''}">${r.qid?'문항 있음':({set:'잡힘',choosing:'고르는 중',empty:'빈자리',redesign:'다시 설계 중'})[r.status]||''}</td></tr>`).join('')}</table>`:`<div class="empty-note">대화할수록 위에서부터 채워져요. 과목·범위·문항 수·총점이 정해지면 설계표를 잡아요.${X.missingBlocking(work).length?`<br>아직 정할 것: ${X.missingBlocking(work).map(k=>({subject:'과목',range:'범위',itemCount:'문항 수',pointsTotal:'총점'})[k]).join(' · ')}`:''}</div>`);
  // 설계표를 화면에 보였으면 「교사가 봄」(경계 규칙의 seen)
  if(tab==='plan'&&!$('#rp').closest('.panel-off')){let changed=false;for(const r of work.plan)if(!r.seen){r.seen=true;changed=true;}const ks=Object.keys(m).filter(k=>m[k]&&typeof m[k]==='object'&&'seen' in m[k]&&!m[k].seen&&m[k].value!=null);if(ks.length){X.markSeen(work,ks);changed=true;}if(changed)save();}
}
function renderReview(){const qs=X.orderedQuestions(work);if(!qs.length){$('#t-review').innerHTML='<div class="empty-note">아직 문항이 없어요. 설계표가 잡히면 「초안 써 줘」라고 말해 주세요.</div>';return;}
  $('#t-review').innerHTML=qs.map(q=>{const cs=work.comments.filter(c=>c.qid===q.id&&c.status!=='dropped'),props=(work.proposals||[]).filter(p=>p.qid===q.id&&!['applied','rejected'].includes(p.state)),miss=X.cellKeys(q).some(k=>X.cellEvidence(q,k.key)==='missing');
    const ck=work.checks.filter(c=>c.qid===q.id).at(-1),ex=explanationParts(q);
    return `<section class="qrow" data-q="${E(q.id)}"><div class="qleft kq">${paperHtml(q)}</div><div class="qright">
<div class="qmeta">${E(q.number)}번 · ${E(work.plan.find(r=>r.qid===q.id)?.unit||'')} · ${E(work.plan.find(r=>r.qid===q.id)?.difficulty||'')} · ${E(q.points)}점 · 정답 ${q.answer!=null?CIRCLED[q.answer]:'—'}${miss?'<span class="exdot" title="근거 없는 칸이 있어요"></span>':''}<span class="sp"></span><button class="btn sm" data-sub="${E(q.id)}"><svg class="i s"><use href="#i-msg"/></svg>이 문항 대화</button></div>
<div class="qtabs"><button data-pane="ev">근거</button><button data-pane="sol">해설</button><button data-pane="chk">검토</button>${(q.figureSpecs||[]).filter(f=>!f.done).length?'<button data-pane="fig">그림</button>':''}</div>
<div class="qpane" data-p="ev" hidden>${X.cellKeys(q).map(k=>{const st=X.cellEvidence(q,k.key),list=(q.authoring?.evidence||[]).filter(e=>e.target===k.key);return `<div class="ev${st!=='ok'?' ev-x':''}"><b>${E(k.label)}</b><span>${list.length?list.map(e=>E((e.source?.title||'')+(e.source?.page?` ${e.source.page}쪽`:'')+' · '+e.claim)).join('<br>'):st==='waived'?'근거 없음 — 예외로 진행':'근거 없음'}</span></div>`;}).join('')}</div>
<div class="qpane" data-p="sol" hidden>${ex.parts.map(p=>`<p><b>${E(p.key)}</b> ${tex(p.text)}${p.ox?` → ${p.ox==='o'?'옳다':'옳지 않다'}`:''}</p>`).join('')||'(해설 없음)'}</div>
<div class="qpane" data-p="chk" hidden>${ck?`${ck.runs.map(r=>`<div class="chk-row"><b>${E(r.model)}</b><span>${r.answer?CIRCLED[r.answer-1]:'—'} · ${E(r.note)}</span></div>`).join('')}<p><b>결론</b> ${E(({pass:'두 모델 일치 · 정답과 같음',doubt:'두 모델 답이 갈림',fail:'두 모델 모두 정답과 다름',single:'한 모델만 풂',skipped:'풀지 못함'})[ck.verdict]||ck.verdict)} (${E(ck.version)} · 한 회사 두 모델)</p>`:'아직 풀이 검사 전이에요.'}</div>
${(q.figureSpecs||[]).length?`<div class="qpane" data-p="fig" hidden>${q.figureSpecs.map((f,i)=>`<p>${f.done?'✓ ':''}${E(f.kind==='graph'?'그래프':'그림')} · ${E(f.description).slice(0,220)} ${f.done?'':`<button class="btn sm" data-draw="${E(q.id)}|${i}">그리기</button>`}</p>`).join('')}</div>`:''}
<div class="cbox2"><div class="ch">문항 전체${cs.length?` · 코멘트 ${cs.length}`:''}<span class="sp"></span></div>
<div class="clist">${cs.map(c=>`<div class="ci"><div class="ctext">${E(c.text)} <span class="cst ${SC[c.status]}">${ST[c.status]}</span></div>${c.answer?`<div class="cans">${E(c.answer).slice(0,600)}</div>`:''}</div>`).join('')}</div>
${props.map(p=>`<div class="prop"><b>지금 → 바꿀 안</b> · ${E(p.summary)}${p.changes.slice(0,6).map((c,i)=>`<div><span class="pb">${E(String(p.before?.[i]??'').slice(0,120))}</span> → <span class="pa">${E(String(c.value??'').slice(0,160))}</span></div>`).join('')}</div>`).join('')}
<textarea data-comment="${E(q.id)}" placeholder="편하게 코멘트를 적어 주세요 · ⌘↵로 쌓기"></textarea></div></div></section>`;}).join('')+'<div style="height:70px"></div>';
  $$('#t-review .qrow').forEach(row=>{const qid=row.dataset.q;const q=work.questions.find(x=>x.id===qid);if(q&&!q.seen){q.seen=true;}});
}
function renderSheet(){const qs=X.orderedQuestions(work),m=work.meta;const s=X.computeStats(qs);
  $('#t-sheet').innerHTML=`<div class="sheetwrap"><div class="sheetnote"><svg class="i s"><use href="#i-hwp"/></svg>미리보기 기준 — 시험지 모양은 조판 단계(exam·hwp)에서 확정해요. 내용은 바꾸지 않아요.</div>
<div class="sheetbar"><button class="btn sm pri" id="bToExam">exam으로 보내 조판</button><button class="btn sm" id="bHwpx">한글에서 고친 판 가져오기</button><button class="btn sm" id="bFinal">${work.head&&/^v[1-9]/.test(work.head)?'다음 확정판 선언':'v1.0 선언'}</button><button class="btn sm" id="bSaveFile">시험지 파일 저장(.5e)</button></div>
<div class="paper2"><div class="ph1"><span class="l">${E([m.term?.value,m.examName?.value].filter(Boolean).join(' '))}</span><span class="m">${E(m.subject?.value||'')}</span><span class="r">${E(m.grade?.value||'')}</span></div><div class="ph2"></div>
<div class="cols2">${qs.map(q=>`<div class="kq qblock">${paperHtml(q)}</div>`).join('')||'<p class="empty-note">문항이 없어요.</p>'}</div></div>
<div class="anskey"><b>정답표 · ${E(work.head||'v0.0')}</b><table><tr>${qs.map(q=>`<th>${E(q.number)}</th>`).join('')}</tr><tr>${qs.map(q=>`<td>${q.answer!=null?CIRCLED[q.answer]:'서술'}</td>`).join('')}</tr><tr>${qs.map(q=>`<td>${E(q.points)}</td>`).join('')}</tr></table><p class="note2">${E(statsLine(s))}</p></div></div>`;}
function renderSide(list){const box=$('#examList');if(!box)return;box.innerHTML=(list||[]).slice(0,12).map(x=>`<button class="exam${work&&x.id===work.projectId?' on':''}" data-open="${E(x.id)}">${E(x.title)}<small>${E(x.head||'v0.0')} · ${E(({design:'설계 중',draft:'쓰는 중',review:'검토 중',typeset:'조판 중',final:'확정'})[x.stage]||'')}</small></button>`).join('');}
function render(){if(!work)return;const title=work.meta.title||'새 시험지';$('#exTitle').textContent=title;$('#pTitle').textContent=title;
  $('#verChat').textContent=work.head||'v0.0';$('#verBtn').firstChild.textContent=(work.head||'v0.0')+(work.dirty?' · 고친 것 있음':'')+' ';
  $('#crumb').classList.toggle('has-sub',!!sub);if(sub)$('#subName').textContent=(work.questions.find(q=>q.id===sub)?.number||'')+'번 문항';
  $$('#seg button').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));for(const t of ['plan','review','sheet'])$('#t-'+t).hidden=t!==tab;
  const c=X.commentCounts(work);$('#counts').textContent=`코멘트 ${work.comments.length} · 의논 중 ${c.talk||0} · 결정 ${c.decided||0} · 반영 ${c.applied||0}`;
  $('#dock2').hidden=tab!=='review'||!(c.decided||c.talk||c.new);$('#dock2').innerHTML=`<span>새 코멘트 <b>${c.new||0}</b> · 결정된 것 <b>${c.decided||0}</b> · 의논 중 <b>${c.talk||0}</b></span>${c.new?'<button class="btn sm" id="bTriage">코멘트 보내기</button>':''}<button class="btn sm pri" id="bApply"${c.decided?'':' disabled'}>결정된 것만 반영</button>`;
  $('#footMid').textContent=`${work.questions.length}문항 · 판 ${work.versions.length}개`;
  if(tab==='plan')renderPlan();else if(tab==='review')renderReview();else renderSheet();renderThread();}

// ── 입력 ──
$('#bSend').onclick=send;$('#input').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();send();}});
$('#seg').onclick=e=>{const b=e.target.closest('button[data-tab]');if(!b)return;tab=b.dataset.tab;render();};
document.addEventListener('click',async e=>{const t=e.target;
  const subB=t.closest('[data-sub]');if(subB){sub=subB.dataset.sub;render();$('#input').focus();return;}
  if(t.closest('#subBack')){sub=null;render();return;}
  const qt=t.closest('.qtabs button');if(qt){const row=qt.closest('.qright'),on=!qt.classList.contains('on');row.querySelectorAll('.qtabs button').forEach(x=>x.classList.remove('on'));row.querySelectorAll('.qpane').forEach(p=>p.hidden=true);if(on){qt.classList.add('on');row.querySelector(`.qpane[data-p="${qt.dataset.pane}"]`).hidden=false;}return;}
  const cell=t.closest('[data-cell],.edot');if(cell){showEvidence(cell);return;}
  const rule=t.closest('.rulec button');if(rule){const card=rule.closest('.rulec'),m=work.chat[+card.dataset.msg],r=m?.ruleCards?.find(x=>x.id===card.dataset.rule);if(!r)return;const layer=rule.dataset.layer;r.done=true;
    if(layer==='exam')work.rules.exam.push({id:r.id,layer:'exam',text:r.text,at:nowIso()});else if(layer!=='no')setGlobalRules([...globalRules(),{id:r.id,layer,subject:work.meta.subject?.value||'',text:r.text,at:nowIso()}]);note('rule',{layer});save();render();toast(layer==='no'?'저장하지 않았어요':'규칙으로 저장했어요');return;}
  if(t.closest('#bApply')){await applyNow('결정된 것만 반영');render();return;}
  if(t.closest('#bTriage')){busy++;try{await triageComments('');}finally{busy--;render();}return;}
  const draw=t.closest('[data-draw]');if(draw){const [qid,i]=draw.dataset.draw.split('|');await drawFigure(qid,+i);return;}
  if(t.closest('#bToExam')){await sendToExam();return;}if(t.closest('#bHwpx')){$('#fHwpx').click();return;}if(t.closest('#bFinal')){declareFinal();return;}if(t.closest('#bSaveFile')){await saveFile();return;}
  if(t.closest('#bExport')){tab='sheet';render();return;}
  if(t.closest('#verBtn')||t.closest('#bHist')){const m=$('#histMenu');m.hidden=!m.hidden;m.innerHTML=work.versions.slice().reverse().map(v=>`<div class="hv"><b>${E(v.label)}</b><span>${E(v.summary)} · ${new Date(v.at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span><button class="btn sm" data-restore="${E(v.label)}">이 판으로</button></div>`).join('')||'<div class="hv"><span>아직 판이 없어요</span></div>';return;}
  const rs=t.closest('[data-restore]');if(rs){X.restoreVersion(work,rs.dataset.restore);$('#histMenu').hidden=true;save();render();say('ai',`${rs.dataset.restore} 내용으로 되돌렸어요. 옛 판은 그대로 남아 있어요.`);note('restore',{label:rs.dataset.restore});return;}
  const nav=t.closest('.side [data-tool]');if(nav){const tl=nav.dataset.tool;if(tl==='lib'){post({action:'library'});return;}$$('.side .nav').forEach(n=>n.classList.toggle('on',n===nav));post({action:'tool',tool:tl});note('tool',{tool:tl});return;}
  if(t.closest('[data-go="home"]')){post({action:'home'});return;}
  if(t.closest('[data-go="new"]')){work=X.newExamset({title:''});X.setMeta(work,'stage','design');sub=null;tab='plan';save();render();say('ai','어떤 시험지를 만들까요? 과목·범위·문항 수·총점을 알려 주시면 설계표부터 잡아요.');return;}
  const op=t.closest('[data-open]');if(op){const w=await idbGet('work:'+op.dataset.open);if(w){work=w;sub=null;post({action:'home'});render();}return;}
  if(t.closest('#bOpen')){$('#fOpen').click();return;}if(t.closest('#bFolder')){$('#fFolder').click();return;}
  if(t.closest('#bClip')){post({action:'tool',tool:'exam'});toast('클립보드는 exam 화면의 서랍을 써요(하네스 공용 서랍은 아직이에요)');note('blocked',{what:'clipboard-shared'});return;}
  if(t.closest('#bPane')||t.closest('#bClose')){$('#work').classList.toggle('panel-off');$('#work').classList.remove('panel-full');return;}
  if(t.closest('#bFull')){$('#work').classList.toggle('panel-full');$('#work').classList.remove('panel-off');return;}
  if(t.closest('#bSide')){$('#app').classList.toggle('side-off');return;}
  if(!t.closest('#histMenu,#verBtn,#bHist'))$('#histMenu').hidden=true;
  if(!t.closest('#evpop,[data-cell],.edot'))$('#evpop').hidden=true;
});
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

// ── 시작 ──
(async()=>{post({action:'ready'});try{const last=await idbGet('last');if(last)work=await idbGet('work:'+last);renderSide((await idbGet('list'))||[]);}catch{}
  if(!work){work=X.newExamset({title:''});X.setMeta(work,'stage','design');work.chat.push({role:'ai',text:'어떤 시험지를 만들까요? 과목·범위·문항 수·총점을 알려 주시면 설계표부터 잡아요. 교과서·학습지가 있으면 「자료 폴더」로 등록해 주세요.',at:nowIso()});}
  work.proposals ||= [];render();note('boot',{head:work.head});})();
window.__harness={get work(){return work;},get sub(){return sub;},openSub:id=>{sub=id;render();},closeSub:()=>{sub=null;render();},get busy(){return busy;},log,render,send:t=>{$('#input').value=t;return send();},applyNow,triageComments,draftAll,declareFinal,sendToExam,importHwpx,saveFile,openFile,X};
