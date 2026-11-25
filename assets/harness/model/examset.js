// 1.8.0 출제 하네스 — 시험지 한 벌(examset)의 작업 상태(work). 화면 없는 순수 모듈(브라우저·node 둘 다).
// 명세: ~/Work/2026-11-24_1.8.0-하네스/명세-시험지파일.md 3·4절. 문항 카드는 5e-question-sheet-v2 그대로 쓴다.
import {FORMAT,newQuestion,validate,copyTree,uid} from '../../exampool/sheet/model.js';
import {newExam} from '../../exampool/sheet/exams.js';
import {explanationParts} from '../../exampool/sheet/explanation.js';
import {fieldValue} from '../../exampool/sheet/vertical.js';
import {applyChanges} from '../../exampool/authoring/contract.js';
import {ensureAuthoring} from '../../exampool/authoring/session.js';

export const SCHEMA=1;
const now=()=>new Date().toISOString();
const STAGES=['design','draft','review','typeset','final'];
// 값이 있는 칸(by·seen이 붙는 칸). title·stage는 그냥 값이다.
export const META_KEYS=['subject','grade','term','examName','range','itemCount','pointsTotal','pointKinds','difficulty','emphasis','form'];
// 결정 3: 막는 질문은 과목·범위·문항 수·총점 4개뿐. 나머지는 기본값으로 진행하고 「미정」으로 남긴다.
export const BLOCKING=['subject','range','itemCount','pointsTotal'];
export const COMMENT_STATUS=['new','talk','decided','applied','dropped'];
export const PROPOSAL_STATE=['current','stale','orphan','agreed','applied','rejected'];
export const PLAN_FIGURE=['reuse','convert','new','code','none'];
export const PLAN_STATUS=['set','choosing','redesign','empty'];
// 카드에 하네스가 더하는 칸. exam으로 넘길 때(toSheetBundle)는 뺀다. explanationParts의 id는 카드 칸이라 둔다.
export const HARNESS_KEYS=['origin','seen','locks'];

const emptyEntry=()=>({value:null,by:null,seen:false});
export function newExamset({title=''}={}){
  const meta={title:String(title),stage:'design'};
  for(const k of META_KEYS)meta[k]=emptyEntry();
  return {schema:SCHEMA,kind:'examset',projectId:uid(),meta,plan:[],items:[],questions:[],comments:[],proposals:[],
    rules:{exam:[],applied:[]},sources:{folder:null,files:[]},sessions:[],chat:[],jobs:[],checks:[],outputs:[],imports:[],
    versions:[],head:null,dirty:false};
}

/* ---------- 경계 규칙(by·seen) ---------- */
// AI가 정했고 선생님이 아직 안 본 값만 AI가 바꾼다. 비어 있는 칸(by null)도 AI가 처음 채울 수 있다.
export const canAiChange=entry=>!!entry&&entry.by!=='teacher'&&!entry.seen;
const isEmpty=v=>v===null||v===undefined||v===''||Array.isArray(v)&&!v.length||
  typeof v==='object'&&!Array.isArray(v)&&Object.values(v).every(isEmpty);
// 돌려줌: true(바꿈) / false(AI가 바꿀 수 없는 칸 — 제안으로 돌려야 함).
export function setMeta(work,key,value,by='teacher'){
  if(key==='title'){work.meta.title=String(value??'');work.dirty=true;return true;}
  if(key==='stage'){if(!STAGES.includes(value))throw Error('단계는 design·draft·review·typeset·final 중 하나입니다.');work.meta.stage=value;work.dirty=true;return true;}
  if(key==='layout'){work.meta.layout=copyTree(value);work.dirty=true;return true;}
  if(!META_KEYS.includes(key))throw Error(`모르는 시험지 정보 칸입니다: ${key}`);
  if(!['teacher','ai'].includes(by))throw Error('by는 teacher·ai 중 하나입니다.');
  const cur=work.meta[key]||emptyEntry();
  if(by==='ai'&&!canAiChange(cur))return false;
  work.meta[key]={value:copyTree(value),by,seen:by==='teacher'};work.dirty=true;return true;
}
export function markSeen(work,keys){
  for(const k of [].concat(keys))if(work.meta[k]&&typeof work.meta[k]==='object'&&'seen' in work.meta[k])work.meta[k].seen=true;
}
export const missingBlocking=work=>BLOCKING.filter(k=>isEmpty(work.meta[k]?.value));

/* ---------- 설계표 ---------- */
export function planRow(row={},by='ai'){
  const r={no:Number(row.no),qid:row.qid??null,unit:String(row.unit??''),standards:[...(row.standards||[])],difficulty:row.difficulty??null,
    points:row.points??null,form:row.form??null,structure:row.structure??null,twist:String(row.twist??''),
    figure:PLAN_FIGURE.includes(row.figure)?row.figure:'none',basis:copyTree(row.basis||[]),
    status:PLAN_STATUS.includes(row.status)?row.status:'empty',by:row.by??by,seen:row.seen??by==='teacher'};
  if(!Number.isInteger(r.no)||r.no<1)throw Error('설계표 번호는 1 이상의 정수입니다.');
  return r;
}
// AI 행은 선생님이 아직 안 본 행만 덮어쓴다. 본 행(또는 선생님 행)은 바꾸지 않고 제안으로 돌려준다.
// 선생님(by teacher)이 넣는 행은 그대로 덮어쓴다.
export function setPlanRows(work,rows,by='ai'){
  const applied=[],proposals=[];
  for(const raw of rows){
    const at=work.plan.findIndex(r=>r.no===Number(raw.no)),cur=at>=0?work.plan[at]:null;
    // qid는 문항 연결이라 설계 덮어쓰기로 끊지 않는다.
    const next=planRow({...raw,qid:raw.qid!==undefined?raw.qid:cur?.qid??null,by,seen:by==='teacher'},by);
    if(!cur){work.plan.push(next);applied.push(next.no);continue;}
    if(by==='teacher'||canAiChange(cur)){work.plan[at]=next;applied.push(next.no);}
    else proposals.push({no:next.no,before:copyTree(cur),after:next});
  }
  work.plan.sort((a,b)=>a.no-b.no);if(applied.length)work.dirty=true;
  return {applied,proposals};
}
export function markPlanSeen(work,nos){const set=new Set([].concat(nos).map(Number));for(const r of work.plan)if(set.has(r.no))r.seen=true;}
export function linkItem(work,no,qid){
  let row=work.plan.find(r=>r.no===Number(no));
  if(!row){row=planRow({no,status:'set'},'ai');work.plan.push(row);work.plan.sort((a,b)=>a.no-b.no);}
  row.qid=qid;work.dirty=true;return row;
}

/* ---------- 문항 ---------- */
export function addQuestion(work,q=newQuestion(String(work.items.length+1)),{planNo=null,by='ai'}={}){
  if(work.questions.some(x=>x.id===q.id))throw Error('이미 시험지에 있는 문항입니다.');
  q.origin={by,planNo:planNo??null};q.seen=false;q.locks=[];
  ensureExplanationIds(q);
  work.questions.push(q);work.items.push(q.id);
  if(planNo!=null)linkItem(work,planNo,q.id);
  work.dirty=true;return q.id;
}
export const questionById=(work,qid)=>work.questions.find(q=>q.id===qid)||null;
export const orderedQuestions=work=>work.items.map(id=>questionById(work,id)).filter(Boolean);
// 선생님이 직접 고친 칸. AI는 읽기만 한다(바꾸려면 먼저 묻는다).
export function lockCell(q,key){q.locks=q.locks||[];if(!q.locks.some(l=>l.key===key))q.locks.push({key,at:now()});}
export function unlockCell(q,key){q.locks=(q.locks||[]).filter(l=>l.key!==key);}

/* ---------- 해설 칸 고정 ID ---------- */
// explanationParts(q)가 보여 주는 칸마다 고정 id를 붙인다. 이미 있으면 그대로 둔다.
// 합답형은 보기 글자(key)로, 그 밖은 순서로 저장된 칸과 짝짓는다(explanation.js와 같은 규칙).
// 저장된 칸이 없으면(옛 해설 글) 나눈 결과를 q.explanationParts로 저장한다. 돌려줌: [{id,key,text}].
export function ensureExplanationIds(q){
  const {mode,parts}=explanationParts(q);
  if(!Array.isArray(q.explanationParts))q.explanationParts=parts.map(p=>({key:p.key,text:p.text,subs:[...p.subs]}));
  const saved=q.explanationParts;
  for(const s of saved)if(s&&typeof s==='object'&&typeof s.id!=='string')s.id='x-'+uid();
  return parts.map((p,i)=>{
    const s=mode==='bogi'?saved.find(v=>v.key===p.key):saved[i];
    let id=s?.id;
    if(!id){const add={key:p.key,text:p.text,subs:[...p.subs],id:'x-'+uid()};saved.push(add);id=add.id;}
    return {id,key:p.key,text:p.text};
  });
}

// 해설 글(q.explanation)을 통째로 바꾼 뒤: 칸을 글에서 다시 나누고, 같은 보기 글자(합답형)·같은 순서(그 밖)의 칸은 옛 id를 이어받는다.
export function resplitExplanation(q,oldParts=q.explanationParts){
  const old=Array.isArray(oldParts)?oldParts:[];delete q.explanationParts;
  const {mode}=explanationParts(q);ensureExplanationIds(q);
  q.explanationParts.forEach((p,i)=>{const o=mode==='bogi'?old.find(v=>v.key===p.key):old[i];if(o?.id)p.id=o.id;});
  return q.explanationParts;
}

/* ---------- 칸 주소 ---------- */
const CIRCLED='①②③④⑤';
// 근거·코멘트·제안·잠금·풀이가 모두 쓰는 칸 주소(명세 4-4). 해설 칸 id가 없으면 이때 붙인다.
export function cellKeys(q){
  const out=[{key:'question',label:'문항 전체'},{key:'ask',label:'발문'},{key:'answer',label:'정답'}];
  for(const b of q.blocks||[]){
    if(b.kind!=='bogi')out.push({key:'block:'+b.id,label:b.label||b.kind});
    for(const l of b.lines||[])out.push({key:'line:'+l.id,label:`${b.label||''} ${l.label||''}`.trim()});
  }
  if(q.type!=='서술형'){
    if(q.style==='대응표')out.push({key:'choiceTable',label:'선지 대응표'});
    else (q.choices||[]).forEach((c,i)=>out.push({key:'choice:'+c.id,label:'선지 '+CIRCLED[i]}));
  }
  for(const p of ensureExplanationIds(q))out.push({key:'expl:'+p.id,label:'해설 '+p.key});
  out.push({key:'meta',label:'성취기준·출제 의도'});
  return out;
}

/* ---------- 근거 상태 ---------- */
const OK_J=['direct','conditional','derived'],BAD_J=['refuted','conflict'];
// 저장하지 않고 계산한다. 반박·충돌이 하나라도 있으면 지지 근거가 있어도 'problem'(눈에 띄게).
export function cellEvidence(q,key){
  const list=(q.authoring?.evidence||[]).filter(e=>e.target===key);
  if(list.some(e=>BAD_J.includes(e.judgement)))return 'problem';
  if(list.some(e=>OK_J.includes(e.judgement)))return 'ok';
  if(list.some(e=>e.waiver))return 'waived';
  return 'missing';
}
// 근거 없이 진행(예외). 그 칸의 「근거 미확보」 항목에 붙이고, 없으면 새로 만든다.
export function addWaiver(q,key,{reason,by='teacher'}={}){
  if(!String(reason||'').trim())throw Error('예외로 진행하는 이유를 적어 주세요.');
  const a=ensureAuthoring(q),waiver={reason:String(reason),by,at:now()};
  let e=a.evidence.find(x=>x.target===key&&['missing','unreadable'].includes(x.judgement)&&!x.waiver);
  if(!e){e={id:'e-'+uid(),target:key,claim:'',judgement:'missing',by:by==='ai'?'ai':'teacher',source:null};a.evidence.push(e);}
  e.waiver=waiver;return e.id;
}

/* ---------- 코멘트 대장 ---------- */
export function addComment(work,{qid=null,target=null,text,onVersion=work.head}={}){
  if(!String(text||'').trim())throw Error('코멘트 내용이 비어 있습니다.');
  const c={id:'c-'+uid(),qid,target,text:String(text),at:now(),onVersion:onVersion??null,status:'new',split:[],decision:null,proposals:[],appliedIn:null};
  work.comments.push(c);work.dirty=true;return c.id;
}
const COMMENT_PATCH=['status','split','decision','proposals','target','appliedIn','answer','gist'];// 11-25 완주 1: answer·gist(AI 답·요지)가 버려져 대장에 AI 답이 안 보였다
export function updateComment(work,id,patch={}){
  const c=work.comments.find(x=>x.id===id);if(!c)throw Error('코멘트를 찾지 못했습니다.');
  if(patch.status!==undefined&&!COMMENT_STATUS.includes(patch.status))throw Error('코멘트 상태는 new·talk·decided·applied·dropped 중 하나입니다.');
  for(const k of COMMENT_PATCH)if(patch[k]!==undefined)c[k]=copyTree(patch[k]);
  work.dirty=true;return c;
}
export function commentCounts(work){
  const n=Object.fromEntries(COMMENT_STATUS.map(s=>[s,0]));for(const c of work.comments)if(c.status in n)n[c.status]++;return n;
}

/* ---------- 제안 ---------- */
// 제안 하나가 건드리는 칸 주소. 'question'은 문항 전체(유형 바꾸기 등)라 잠긴 칸이 하나라도 있으면 걸린다.
export function changeKeys(q,c){
  const bogi=(q.blocks||[]).find(b=>b.kind==='bogi');
  const byLabelOrId=id=>(q.blocks||[]).find(b=>b.id===id||b.label===id);
  switch(c.path){
    case 'ask':case 'points':return ['ask'];
    case 'answer':return ['answer'];
    case 'explanation':case 'modelAnswer':return ['explanation'];
    case 'intent':case 'standardCode':return ['meta'];
    case 'type':return ['question'];
    case 'passage':{const b=(q.blocks||[]).find(b=>b.kind==='text'&&!b.parent);return b?['block:'+b.id]:['question'];}
    case 'block':case 'table':{const b=byLabelOrId(c.id);return b?['block:'+b.id]:['question'];}
    case 'choice':case 'choices':{
      if(c.id!==undefined||c.index!==undefined||c.line!==undefined){const i=c.id?q.choices.findIndex(x=>x.id===c.id):Number(c.index??c.line);return q.choices[i]?['choice:'+q.choices[i].id]:['question'];}
      return [...q.choices.map(x=>'choice:'+x.id),'choiceTable'];}
    case 'bogi':{
      if(!bogi)return ['question'];
      if(c.op!=='add'&&(c.id!==undefined||c.line!==undefined)){const i=c.id?bogi.lines.findIndex(l=>l.id===c.id):typeof c.line==='string'?bogi.lines.findIndex(l=>l.label===c.line):Number(c.line);if(bogi.lines[i])return ['line:'+bogi.lines[i].id];}
      return ['block:'+bogi.id,...bogi.lines.map(l=>'line:'+l.id)];}
    default:return ['question'];
  }
}
export function touchedLocks(q,c){
  const locks=q.locks||[];if(!locks.length)return [];
  const keys=new Set(changeKeys(q,c));
  return locks.map(l=>l.key).filter(k=>keys.has('question')||k==='question'||keys.has(k)||k.startsWith('expl:')&&keys.has('explanation'));
}
// 「지금 → 바꿀 안」에 쓸 지금 값.
export function currentValue(q,c){
  try{
    if(c.path==='answer')return q.type==='서술형'?q.modelAnswer:q.answer===null?null:q.answer+1;
    if(c.path==='points')return q.points;
    if(c.path==='explanation'||c.path==='modelAnswer')return q[c.path];
    if((c.path==='choice'||c.path==='choices')&&(c.id!==undefined||c.index!==undefined||c.line!==undefined)){const i=c.id?q.choices.findIndex(x=>x.id===c.id):Number(c.index??c.line);return q.choices[i]?.text??null;}
    if(c.path==='bogi'&&c.op!=='add'&&(c.id!==undefined||c.line!==undefined)){const b=q.blocks.find(b=>b.kind==='bogi');const i=c.id?b.lines.findIndex(l=>l.id===c.id):typeof c.line==='string'?b.lines.findIndex(l=>l.label===c.line):Number(c.line);return b.lines[i]?.text??null;}
    if(c.path==='block'){return q.blocks.find(b=>b.id===c.id||b.label===c.id)?.text??null;}
    if(c.path==='table'){const b=q.blocks.find(b=>(b.id===c.id||b.label===c.id)&&b.kind==='table');return b?b.table.cells.map(r=>r.map(x=>String(x.value??''))):null;}
    return fieldValue(q,c.path);
  }catch{return null;}
}
export function addProposal(work,{qid,changes=[],before=null,summary='',comments=[],effects=null}={}){
  const q=questionById(work,qid);if(!q)throw Error('제안할 문항을 찾지 못했습니다.');
  const p={id:'p-'+uid(),qid,changes:copyTree(changes),before:before?copyTree(before):changes.map(c=>currentValue(q,c)),summary:String(summary),
    comments:[...comments],effects:copyTree(effects),state:'current',touchesLock:changes.some(c=>touchedLocks(q,c).length>0),at:now()};
  work.proposals.push(p);
  for(const cid of comments){const c=work.comments.find(x=>x.id===cid);if(c&&!c.proposals.includes(p.id))c.proposals.push(p.id);}
  work.dirty=true;return p.id;
}
export function setProposalState(work,id,state){
  if(!PROPOSAL_STATE.includes(state))throw Error('제안 상태를 확인하세요.');
  const p=work.proposals.find(x=>x.id===id);if(!p)throw Error('제안을 찾지 못했습니다.');p.state=state;work.dirty=true;return p;
}
// 「반영」: decided인 코멘트에 딸린 제안(agreed·current)만 문항에 적용한다. 잠긴 칸을 건드리는 변경은 건너뛰고 적는다.
// 건너뛰거나 실패한 변경이 있는 코멘트는 decided로 남긴다(선생님이 다시 정하도록). 나머지는 applied.
export function applyDecided(work){
  const changed=new Set(),skipped=[],errors=[],appliedProposals=[],appliedComments=[],noProposal=[];
  for(const c of work.comments.filter(c=>c.status==='decided')){
    const ids=new Set([...c.proposals,...work.proposals.filter(p=>p.comments.includes(c.id)).map(p=>p.id)]);
    let clean=true;
    for(const pid of ids){
      const p=work.proposals.find(x=>x.id===pid);if(!p||!['agreed','current'].includes(p.state))continue;
      const at=work.questions.findIndex(q=>q.id===p.qid);
      if(at<0){errors.push({proposal:p.id,qid:p.qid,message:'문항을 찾지 못했습니다.'});clean=false;continue;}
      const q=work.questions[at],ok=[];
      for(const ch of p.changes){const locked=touchedLocks(q,ch);if(locked.length){skipped.push({proposal:p.id,qid:p.qid,change:ch,locks:locked});clean=false;}else ok.push(ch);}
      const r=applyChanges(q,ok);
      for(const e of r.errors){errors.push({proposal:p.id,qid:p.qid,change:e.change,message:e.message});clean=false;}
      if(r.applied.some(ch=>ch.path==='explanation'))resplitExplanation(r.question,q.explanationParts);
      if(r.applied.length){work.questions[at]=r.question;changed.add(p.qid);}
      if(r.applied.length||!p.changes.length){p.state='applied';appliedProposals.push(p.id);}
    }
    // 11-25 완주 1: 딸린 제안이 하나도 없는 「결정됨」이 「반영됨」으로 넘어가 문항은 그대로인데 반영된 것처럼 보였다 → decided로 남기고 알린다.
    const appliedAny=[...ids].some(pid=>work.proposals.find(x=>x.id===pid)?.state==='applied'&&appliedProposals.includes(pid));
    if(clean&&appliedAny){c.status='applied';appliedComments.push(c.id);}else if(clean&&!ids.size)noProposal.push(c.id);
  }
  if(changed.size||appliedComments.length)work.dirty=true;
  return {changedQids:[...changed],skipped,errors,noProposal,applied:{proposals:appliedProposals,comments:appliedComments}};
}

/* ---------- 판 ---------- */
const LABEL=/^v(\d+)\.(\d+)$/;
export function nextLabel(label){if(!label)return 'v0.1';const m=LABEL.exec(label);if(!m)throw Error('판 이름을 확인하세요.');return `v${m[1]}.${Number(m[2])+1}`;}
export function nextMajor(label){const m=label?LABEL.exec(label):null;return `v${m?Number(m[1])+1:1}.0`;}
// 화면은 AI 말이 아니라 이 값을 보여 준다(별과우주 때 정답 순서를 잘못 알린 일). 정답은 카드 0~4 → 1~5.
export function computeStats(questions){
  const answers=questions.map(q=>q.type!=='서술형'&&Number.isInteger(q.answer)&&q.answer>=0&&q.answer<5?q.answer+1:null);
  const countByNumber={1:0,2:0,3:0,4:0,5:0};for(const a of answers)if(a)countByNumber[a]++;
  let longestRun=0,run=0,prev=null;for(const a of answers){run=a!==null&&a===prev?run+1:a!==null?1:0;prev=a;longestRun=Math.max(longestRun,run);}
  let pointsTotal=0;const pointsByKind={};
  for(const q of questions){const p=Number(q.points);if(!Number.isFinite(p))continue;pointsTotal+=p;pointsByKind[p]=(pointsByKind[p]||0)+1;}
  return {answers,countByNumber,longestRun,pointsTotal:Math.round(pointsTotal*1000)/1000,pointsByKind};
}
// 판에 넣는 문항: 문항별 수정 이력(authoring.history·bank)은 뺀다(판이 대신함). 글자는 함께 쓰는 깊은 사본.
export function snapshotQuestion(q){
  const n=copyTree(q);if(n.authoring){delete n.authoring.history;delete n.authoring.bank;}return n;
}
const latestChecks=work=>{const by=new Map();for(const c of work.checks)by.set(c.qid,c.id);return [...by.values()];};
function changedSince(work,prev){
  if(!prev?.snapshot)return orderedQuestions(work).map(q=>q.id);
  const old=new Map(prev.snapshot.questions.map(q=>[q.id,JSON.stringify(q)]));
  return orderedQuestions(work).filter(q=>old.get(q.id)!==JSON.stringify(snapshotQuestion(q))).map(q=>q.id);
}
export function commitVersion(work,{summary='',applied={},changed=null,label=null}={}){
  label=label||nextLabel(work.head);
  if(work.versions.some(v=>v.label===label))throw Error(`이미 있는 판입니다: ${label}`);
  const prev=work.versions.find(v=>v.label===work.head);
  const qs=orderedQuestions(work);
  const v={label,at:now(),summary:String(summary),from:work.head,
    applied:{proposals:[...(applied.proposals||[])],comments:[...(applied.comments||[])],direct:[...(applied.direct||[])]},
    changed:changed?[...changed]:changedSince(work,prev),stats:computeStats(qs),
    snapshot:{meta:copyTree(work.meta),plan:copyTree(work.plan),items:[...work.items],questions:work.questions.map(snapshotQuestion),
      rulesApplied:copyTree(work.rules.applied),checks:latestChecks(work)}};
  for(const cid of v.applied.comments){const c=work.comments.find(x=>x.id===cid);if(c)c.appliedIn=label;}
  work.versions.push(v);work.head=label;work.dirty=false;return v;
}
// v1.0은 선생님이 선언할 때만. 그 뒤에 고치면 v1.1(nextLabel), 다시 선언하면 v2.0.
export function declareFinal(work,{summary='최종본 선언'}={}){
  work.meta.stage='final';
  return commitVersion(work,{summary,label:nextMajor(work.head)});
}
export function restoreVersion(work,label){
  const v=work.versions.find(x=>x.label===label);
  if(!v)throw Error(`판을 찾지 못했습니다: ${label}`);
  if(v.missing||!v.snapshot)throw Error(`${label} 판은 그림 자료가 빠져 열 수 없습니다.`);
  const s=v.snapshot;
  work.meta=copyTree(s.meta);work.plan=copyTree(s.plan);work.items=[...s.items];work.questions=copyTree(s.questions);
  work.rules.applied=copyTree(s.rulesApplied||[]);work.dirty=true;return work;
}

/* ---------- 출제 규칙(결정 7) ---------- */
// 전체·과목 규칙은 앱 설정에 저장하므로 만들어 돌려주기만 한다. 이 시험지 규칙만 파일(work.rules.exam)에 둔다.
export function addRule(work,{layer,subject=null,text,from=null,auto=true}={}){
  if(!['global','subject','exam'].includes(layer))throw Error('규칙 층은 global·subject·exam 중 하나입니다.');
  if(!String(text||'').trim())throw Error('규칙 내용이 비어 있습니다.');
  const r={id:'r-'+uid(),layer,subject:layer==='subject'?subject??work.meta.subject?.value??null:subject,text:String(text),from:copyTree(from),at:now(),auto:!!auto};
  if(layer==='exam'){work.rules.exam.push(r);work.dirty=true;}
  return r;
}
// 이 시험지에 적용된 규칙의 사본(전체 + 이 과목 + 이 시험지)을 파일에 둔다.
export function applyRulesSnapshot(work,globalRules=[]){
  const subject=work.meta.subject?.value??null;
  const pick=globalRules.filter(r=>r&&(r.layer==='global'||r.layer==='subject'&&(r.subject==null||r.subject===subject)));
  work.rules.applied=copyTree([...pick,...work.rules.exam]);work.dirty=true;return work.rules.applied;
}

/* ---------- 풀이 검사(결정 8) ---------- */
// answer: 1~5. runs: [{answer:1~5,...}]. 모두 같으면 pass, 모두 다르면 fail, 갈리면 doubt, 하나뿐이면 single.
export function verdictOf(answer,runs=[]){
  const got=runs.map(r=>r?.answer).filter(a=>a!==undefined&&a!==null).map(Number);
  if(!got.length)return 'skipped';
  if(got.length===1)return 'single';
  const right=got.filter(a=>a===Number(answer)).length;
  return right===got.length?'pass':right===0?'fail':'doubt';
}
export function recordCheck(work,{qid,version=work.head,contentHash=null,runs=[],verdict,skipped=null}={}){
  const q=questionById(work,qid);if(!q)throw Error('검사할 문항을 찾지 못했습니다.');
  const answer=Number.isInteger(q.answer)?q.answer+1:null;
  const c={id:'chk-'+uid(),version,qid,contentHash,runs:copyTree(runs),verdict:verdict||verdictOf(answer,runs),skipped,at:now()};
  if(runs.length<2&&!skipped)c.skipped=runs.length?'두 번째 모델 없음':'풀이 없음';
  work.checks.push(c);work.dirty=true;return c.id;
}

/* ---------- exam이 읽는 묶음 ---------- */
export function stripHarness(q){const n=copyTree(q);for(const k of HARNESS_KEYS)delete n[k];return n;}
export function toSheetBundle(work){
  const qs=orderedQuestions(work).map(stripHarness),layout=work.meta.layout||{};
  const exam={...newExam(work.meta.title||'새 시험지'),items:qs.map(q=>q.id)};
  for(const k of ['frame','goal','formId','after','breaks'])if(layout[k]!==undefined)exam[k]=copyTree(layout[k]);
  return validate({format:FORMAT,scope:'exam',questions:qs,documents:[],exams:[exam]});
}
