// 문항 하나의 출제 상태: 버전·수정 이력·되돌리기, AI 요청 보호, 변경안 보관, 검토 축.
// 문항 원본(q)이 곧 화면의 문항이다. AI용 사본을 따로 키우지 않는다.
import {clone,uid} from '../sheet/model.js';
import {reviewVersion,changedComponents,impactOf,sha256} from './review-version.js';
import {emptyAuthoring,AXES} from './schema.js';
import {applyChanges,draftToChanges,resolveTarget,checkAnswerStructure} from './contract.js';
// 의미 내용 칸. 이력 스냅숏과 되돌리기가 이 칸만 다룬다(번호·조판·대화 기록·근거 원문 연결은 그대로).
export const CONTENT_KEYS=['type','form','structure','preset','style','ask','points','answer','modelAnswer','explanation','intent','standardCode','blocks','choices','choiceTable','choiceLayout'];
const HISTORY_LIMIT=30,PROPOSAL_LIMIT=20;
const now=()=>new Date().toISOString();
export function ensureAuthoring(q){if(!q.authoring)q.authoring=emptyAuthoring(uid());return q.authoring;}
// 스냅숏의 그림 바이트는 해시로 바꿔 bank에 한 번만 둔다(같은 그림이 이력마다 쌓이지 않게).
async function snapshotOf(q,bank){
  const snap={};for(const k of CONTENT_KEYS)if(q[k]!==undefined)snap[k]=clone(q[k]);
  const stash=async f=>{if(!f?.data)return f;const h=await sha256(f.data);bank[h]={data:f.data};return {...f,data:'bank:'+h};};
  for(const b of snap.blocks||[])if(b.figure)b.figure=await stash(b.figure);
  for(const c of snap.choices||[])if(c.figure)c.figure=await stash(c.figure);
  return snap;
}
function unstash(snap,bank){
  const s=clone(snap),open=f=>f?.data?.startsWith?.('bank:')?{...f,data:bank[f.data.slice(5)]?.data||''}:f;
  for(const b of s.blocks||[])if(b.figure)b.figure=open(b.figure);
  for(const c of s.choices||[])if(c.figure)c.figure=open(c.figure);
  return s;
}
function pruneBank(a){
  const used=new Set(JSON.stringify(a.history).match(/bank:[a-f0-9]{64}/g)?.map(x=>x.slice(5))||[]);
  for(const h of Object.keys(a.bank))if(!used.has(h))delete a.bank[h];
}
// 내용이 바뀌었으면 새 버전을 기록한다. by: ai(변경안 적용) / teacher(직접 수정) / revert(되돌리기) / import(처음 상태).
// 바뀐 구성요소의 영향(정답·해설·그림 다시 확인)을 표시하고, 지난 검토 결과를 '다시 검토'로 내린다.
export async function syncRevision(q,{by='teacher',summary=''}={}){
  const a=ensureAuthoring(q),{version,hashes}=await reviewVersion(q);
  if(version===a.contentHash)return {changed:false,revision:a.revision};
  const first=a.contentHash===null,changed=first?[]:changedComponents(a.hashes,hashes),impact=first?{stale:[],axes:[]}:impactOf(changed,q);
  if(!first)a.revision++;
  // 이번에 직접 바뀐 칸의 '다시 확인' 표시는 지우고, 영향을 받은 칸은 새로 표시한다.
  const touched=new Set(changed.map(k=>k==='answer'||k==='explanation'?k:k.startsWith('block:')?'figure:'+k.slice(6):k));
  a.stale=a.stale.filter(s=>!touched.has(s.target));
  for(const t of impact.stale)if(!a.stale.some(s=>s.target===t))a.stale.push({target:t,reason:staleReason(t,changed,q),since:a.revision});
  for(const k of AXES){const x=a.review.axes[k];if(x.status!=='none'&&x.version!==version)x.status='stale';}
  a.contentHash=version;a.hashes=hashes;
  a.history.push({revision:a.revision,by:first?'import':by,summary:first?'출제 기록 시작 상태':summary||describe(changed,q),at:now(),version,snapshot:await snapshotOf(q,a.bank)});
  while(a.history.length>HISTORY_LIMIT)a.history.shift();pruneBank(a);
  for(const p of a.proposals)if(p.state==='current'&&p.baseRevision!==a.revision)p.state='stale';
  return {changed:!first,revision:a.revision,components:changed,impact};
}
function staleReason(t,changed,q){
  const what=changed.map(k=>labelOf(q,k)).filter(Boolean).slice(0,3).join('·')||'문항 내용';
  return t==='answer'?`${what}이(가) 바뀌어 정답을 다시 확인해야 합니다.`:t==='explanation'?`${what}이(가) 바뀌어 해설을 다시 확인해야 합니다.`:`${what}이(가) 바뀌어 이 그림·그래프가 조건과 맞는지 다시 확인해야 합니다.`;
}
export function labelOf(q,key){
  if(['ask','answer','explanation','type','meta'].includes(key))return {ask:'발문',answer:'정답',explanation:'해설',type:'문항 유형',meta:'성취기준·의도'}[key];
  const [kind,id]=key.split(':');
  if(kind==='block')return q.blocks.find(b=>b.id===id)?.label||'구성';
  if(kind==='line'){for(const b of q.blocks){const l=b.lines?.find(l=>l.id===id);if(l)return (b.kind==='bogi'?'보기 ':'')+l.label;}return '항목';}
  if(kind==='choice'){const i=q.choices.findIndex(c=>c.id===id);return i>=0?'선지 '+'①②③④⑤'[i]:'선지';}
  if(kind==='figure')return (q.blocks.find(b=>b.id===id)?.label||'그림');
  return key;
}
function describe(changed,q){const names=[...new Set(changed.map(k=>labelOf(q,k)))];return names.length?names.slice(0,4).join('·')+(names.length>4?' 외':'')+' 수정':'내용 수정';}
// 되돌리기: 옛 기록을 지우지 않고, 그 버전의 내용으로 새 버전을 만든다(호출 뒤 syncRevision(by:'revert')).
export function restoreRevision(q,revision){
  const a=ensureAuthoring(q),h=a.history.find(h=>h.revision===revision);if(!h)throw Error('그 버전의 기록이 없습니다.');
  const s=unstash(h.snapshot,a.bank);for(const k of CONTENT_KEYS){if(s[k]===undefined)delete q[k];else q[k]=s[k];}
  return h;
}
// ── AI 요청 보호 ──
// 요청마다 문항 ID·기준 버전·내용 해시·요청 ID를 묶는다. 응답은 바로 쓰지 않고 분류한다.
export function makeRequest(q,kind){const a=ensureAuthoring(q);return {requestId:uid(),qid:q.id,baseRevision:a.revision,contentHash:a.contentHash,kind,at:now()};}
// currentHash를 주면 저장된 해시 대신 지금 내용으로 계산한 검토 버전과 비교한다(실제로 바뀌었을 때만 지난 응답).
export function classifyResponse(q,req,{seen=new Set(),cancelled=new Set(),currentHash=null}={}){
  if(seen.has(req.requestId))return 'duplicate';
  if(cancelled.has(req.requestId))return 'cancelled';
  if(!q)return 'gone';
  if(currentHash)return currentHash===req.contentHash?'current':'stale';
  const a=q.authoring;return a&&a.revision===req.baseRevision&&a.contentHash===req.contentHash?'current':'stale';
}
// 변경안은 교사가 적용·거절할 때까지 보관한다. 기준 버전이 지난 변경안은 '지난 변경안'으로 남는다.
export function storeProposal(q,req,{summary,changes,review=null},state='current'){
  const a=ensureAuthoring(q),p={id:uid(),requestId:req.requestId,baseRevision:req.baseRevision,summary:String(summary||'변경안').slice(0,4000),changes:clone(changes).slice(0,80),state,at:now(),...(review?{review:clone(review)}:{})};
  a.proposals.push(p);while(a.proposals.length>PROPOSAL_LIMIT)a.proposals.shift();return p;
}
// 변경안을 문항에 적용한다(호출 뒤 syncRevision(by:'ai')). 기준 버전이 지났으면 force 없이는 막는다.
export function applyProposal(q,proposalId,{force=false}={}){
  const a=ensureAuthoring(q),p=a.proposals.find(p=>p.id===proposalId);if(!p)throw Error('변경안을 찾지 못했습니다.');
  if(p.baseRevision!==a.revision&&!force)throw Error('이 변경안을 만든 뒤 문항이 바뀌었습니다. 지금 내용을 기준으로 다시 요청하거나 확인 후 적용하세요.');
  const {question,applied,errors}=applyChanges(q,p.changes);
  if(!applied.length)throw Error(errors[0]?.message||'적용할 변경이 없습니다.');
  for(const k of CONTENT_KEYS){if(question[k]===undefined)delete q[k];else q[k]=question[k];}
  a.proposals=a.proposals.filter(x=>x.id!==p.id);
  return {proposal:p,applied,errors};
}
export function rejectProposal(q,proposalId){const a=ensureAuthoring(q);const before=a.proposals.length;a.proposals=a.proposals.filter(p=>p.id!==proposalId);return before!==a.proposals.length;}
// AI 응답에서 변경 목록 만들기(초안 또는 개별 변경).
export function proposalChanges(q,proposal){if(!proposal)return [];return [...(proposal.draft?draftToChanges(q,proposal.draft):[]),...(Array.isArray(proposal.changes)?proposal.changes:[])];}
// 검토 결과를 현재 버전에 묶는다. 작성자 AI의 재검토는 독립 평가가 아니다(by='author-ai').
export function recordConversation(q,response){
  const a=ensureAuthoring(q);
  if(response.requirements){for(const k of ['explicit','assumed','pending'])if(Array.isArray(response.requirements[k]))a.requirements[k]=[...new Set(response.requirements[k].map(String))].slice(0,50);}
  if(response.target&&typeof response.target==='object')a.target=Object.fromEntries(Object.entries(response.target).filter(([,v])=>typeof v==='string'&&v).map(([k,v])=>[k,v.slice(0,300)]));
  for(const x of response.issues||[]){const text=String(typeof x==='string'?x:x.text).slice(0,4000);if(text&&!a.issues.some(i=>i.text===text))a.issues.push({id:uid(),text,status:'open'});}
  while(a.issues.length>100)a.issues.shift();
}
// 변경안을 미리 적용한 사본으로 정답 구조를 확인한다(변경안이 없으면 지금 문항).
export function previewStructure(q,response){const changes=proposalChanges(q,response.proposal);const target=changes.length?applyChanges(q,changes).question:q;return checkAnswerStructure(target,response.solve||null);}
export function recordReview(q,response,{by='author-ai',evidence=new Map(),figuresSeen=false}={}){
  const a=ensureAuthoring(q),at=now();
  if(response.requirements){for(const k of ['explicit','assumed','pending'])if(Array.isArray(response.requirements[k]))a.requirements[k]=[...new Set(response.requirements[k].map(String))].slice(0,50);}
  if(response.target&&typeof response.target==='object')a.target=Object.fromEntries(Object.entries(response.target).filter(([,v])=>typeof v==='string'&&v).map(([k,v])=>[k,v.slice(0,300)]));
  if(response.solve){a.review.solve={statements:response.solve.statements.map(s=>({target:String(s.target),truth:!!s.truth,reason:String(s.reason||'').slice(0,2000)})),answer:response.solve.answer??null,version:a.contentHash,at};}
  const structure=checkAnswerStructure(q,a.review.solve);
  for(const [k,x] of Object.entries(response.review?.axes||{})){
    // 그림 축은 AI가 실제 그림 바이트를 받아 읽었을 때(figuresSeen)만 통과로 올린다. 글 설명만 봤으면 '확인 필요'.
    const hasFigure=q.blocks.some(b=>b.kind==='figure'&&b.figure?.data);
    let status=x.status;if(k==='figure'&&status==='pass'&&(!hasFigure||!figuresSeen))status='unverified';
    if(k==='answer'&&!structure.ok)status='issue';
    a.review.axes[k]={status,note:String(x.note||'').slice(0,8000),by,at,version:a.contentHash};
  }
  a.review.version=a.contentHash;
  // 지금 버전을 다시 풀어 정답·조건이 통과했으면 정답·해설의 '다시 확인' 표시를, 그림 축이 통과했으면 그림 표시를 지운다.
  if(a.review.axes.answer.status==='pass'&&a.review.axes.answer.version===a.contentHash)a.stale=a.stale.filter(s=>s.target!=='answer'&&s.target!=='explanation');
  if(a.review.axes.figure.status==='pass'&&a.review.axes.figure.version===a.contentHash)a.stale=a.stale.filter(s=>!s.target.startsWith('figure:'));
  for(const it of response.review?.items||[]){const text=[it.target&&`[${it.target}]`,it.problem,it.fix&&`→ ${it.fix}`].filter(Boolean).join(' ').slice(0,4000);if(text&&!a.issues.some(i=>i.text===text))a.issues.push({id:uid(),text,status:'open'});}
  for(const x of response.issues||[]){const text=String(typeof x==='string'?x:x.text).slice(0,4000);if(text&&!a.issues.some(i=>i.text===text))a.issues.push({id:uid(),text,status:'open'});}
  while(a.issues.length>100)a.issues.shift();
  // 근거: 검색 결과(evidence 맵)에 실제로 있는 항목만 출처로 연결한다. 모델이 만든 출처는 받지 않는다.
  for(const e of response.evidenceUsed||[]){
    const src=evidence.get(String(e.ref)),target=resolveTarget(q,e.target)||'question';
    a.evidence.push({id:uid(),target,claim:String(e.claim||e.note||'').slice(0,4000)||'(주장 미기재)',judgement:src?e.judgement:'missing',by:'ai',note:src?String(e.note||'').slice(0,4000):'모델이 제시한 근거가 검색 결과에 없어 미확보로 남겼습니다.',condition:e.condition?String(e.condition).slice(0,2000):undefined,reviewVersion:a.contentHash,at,source:src?clone(src):null});
  }
  while(a.evidence.length>300)a.evidence.shift();
  return structure;
}
// 근거 연결의 대상이 지금 문항에 없으면(보기 삭제 등) 표시만 하고 지우지 않는다.
export function orphanBindings(q){const a=q.authoring;if(!a)return [];return a.evidence.filter(b=>b.target!=='question'&&!['ask','answer','explanation'].includes(b.target)&&!resolveKeyExists(q,b.target));}
function resolveKeyExists(q,key){const [k,id]=key.split(':');if(k==='block')return q.blocks.some(b=>b.id===id);if(k==='line')return q.blocks.some(b=>b.lines?.some(l=>l.id===id));if(k==='choice')return q.choices.some(c=>c.id===id);return false;}
