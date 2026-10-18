// 문항 출제 기록(q.authoring) 스키마. model.js의 validate가 저장·불러오기·엑셀 왕복마다 부른다.
// 의존성이 없어야 한다(model.js가 import하므로 sheet 모듈을 다시 부르면 순환한다).
export const AUTHORING_VERSION=1;
export const AXES=['curriculum','scope','answer','figure'];
export const AXIS_LABEL={curriculum:'교육과정',scope:'수업·시험 범위',answer:'정답·조건',figure:'자료·그림'};
// 검토 축 상태: 미검토 / 통과 / 문제 있음 / 확인 필요(근거·자료 부족) / 다시 검토(내용이 바뀜).
export const AXIS_STATUS=['none','pass','issue','unverified','stale'];
// 근거 판정 7가지. 검색 결과를 곧바로 참·적합으로 바꾸지 않는다.
export const JUDGEMENTS=['direct','conditional','derived','refuted','missing','conflict','unreadable'];
export const JUDGEMENT_LABEL={direct:'직접 지지',conditional:'조건부 지지',derived:'자료에서 도출',refuted:'반박',missing:'근거 미확보',conflict:'자료 충돌',unreadable:'판독 미확인'};
export const REVIEWERS=['author-ai','separate-ai','teacher','expert'];
const str=(v,max=20000)=>typeof v==='string'&&v.length<=max;
const optStr=(v,max)=>v===undefined||v===null||str(v,max);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const strList=(v,n=50,max=2000)=>Array.isArray(v)&&v.length<=n&&v.every(x=>str(x,max));
const fail=m=>{throw Error('출제 기록: '+m);};
export function emptyAuthoring(sessionId){
  return {v:AUTHORING_VERSION,sessionId,revision:0,contentHash:null,hashes:{},target:null,
    requirements:{explicit:[],assumed:[],pending:[]},issues:[],
    review:{version:null,axes:Object.fromEntries(AXES.map(a=>[a,{status:'none',note:'',by:null,at:null,version:null}])),solve:null},
    stale:[],evidence:[],figures:[],proposals:[],history:[],bank:{}};
}
export function validateBinding(b){
  if(!b||!str(b.id,80)||!str(b.target,120)||!str(b.claim,4000)||!JUDGEMENTS.includes(b.judgement))fail('근거 연결의 대상·주장·판정을 확인하세요.');
  if(!['ai','teacher','search'].includes(b.by)||!optStr(b.note,4000)||!optStr(b.condition,2000)||!(b.reviewVersion===null||b.reviewVersion===undefined||hash(b.reviewVersion))||!optStr(b.at,40))fail('근거 연결의 기록을 확인하세요.');
  const s=b.source;if(s!==null&&s!==undefined){
    if(typeof s!=='object'||!['curriculum','textbook','past','paper','document','calculation','other'].includes(s.kind)||!str(s.title||'',600)||!optStr(s.ref,200)||!optStr(s.quote,6000))fail('근거 출처를 확인하세요.');
    if(s.page!==undefined&&s.page!==null&&!(Number.isInteger(s.page)&&s.page>0))fail('근거 쪽수를 확인하세요.');
    if(s.sha256!==undefined&&s.sha256!==null&&!hash(s.sha256))fail('근거 원문 해시를 확인하세요.');
    if(s.bbox!==undefined&&s.bbox!==null&&!(Array.isArray(s.bbox)&&s.bbox.length===4&&s.bbox.every(Number.isFinite)))fail('근거 좌표를 확인하세요.');
  }
}
export function validateAuthoring(a){
  if(!a||a.v!==AUTHORING_VERSION||!str(a.sessionId,80)||!Number.isInteger(a.revision)||a.revision<0)fail('버전 정보를 확인하세요.');
  if(!(a.contentHash===null||hash(a.contentHash))||!a.hashes||typeof a.hashes!=='object'||!Object.values(a.hashes).every(hash))fail('내용 해시를 확인하세요.');
  if(a.target!==null&&(typeof a.target!=='object'||!Object.values(a.target).every(v=>str(v,300))))fail('출제 대상을 확인하세요.');
  const r=a.requirements;if(!r||!strList(r.explicit)||!strList(r.assumed)||!strList(r.pending))fail('요구사항(명시·가정·확인 필요)을 확인하세요.');
  if(!Array.isArray(a.issues)||a.issues.length>100||!a.issues.every(i=>i&&str(i.id,80)&&str(i.text,4000)&&['open','resolved'].includes(i.status)))fail('남은 쟁점을 확인하세요.');
  const rv=a.review;if(!rv||!(rv.version===null||hash(rv.version))||!rv.axes||!AXES.every(k=>{const x=rv.axes[k];return x&&AXIS_STATUS.includes(x.status)&&str(x.note||'',8000)&&(x.by===null||REVIEWERS.includes(x.by))&&(x.version===null||x.version===undefined||hash(x.version));}))fail('검토 상태를 확인하세요.');
  if(rv.solve!==null&&(typeof rv.solve!=='object'||!Array.isArray(rv.solve.statements)||rv.solve.statements.length>30))fail('다시 푼 기록을 확인하세요.');
  if(!Array.isArray(a.stale)||a.stale.length>100||!a.stale.every(s=>s&&str(s.target,120)&&str(s.reason,600)&&Number.isInteger(s.since)))fail('다시 확인할 칸 표시를 확인하세요.');
  if(!Array.isArray(a.evidence)||a.evidence.length>300)fail('근거 연결이 너무 많습니다.');a.evidence.forEach(validateBinding);
  if(!Array.isArray(a.figures)||a.figures.length>40||!a.figures.every(f=>f&&str(f.blockId,80)&&['graph','image'].includes(f.kind)&&str(f.description,4000)&&(f.resultHash===null||hash(f.resultHash))&&typeof f.editable==='boolean'&&Number.isInteger(f.revision)))fail('그림·그래프 연결을 확인하세요.');
  if(!Array.isArray(a.proposals)||a.proposals.length>30||!a.proposals.every(p=>p&&str(p.id,80)&&str(p.requestId,80)&&Number.isInteger(p.baseRevision)&&str(p.summary,4000)&&Array.isArray(p.changes)&&p.changes.length<=80&&['current','stale','orphan'].includes(p.state)))fail('보관한 변경안을 확인하세요.');
  if(!Array.isArray(a.history)||a.history.length>40||!a.history.every(h=>h&&Number.isInteger(h.revision)&&['ai','teacher','revert','import'].includes(h.by)&&str(h.summary,2000)&&h.snapshot&&typeof h.snapshot==='object'&&(h.version===null||hash(h.version))))fail('수정 이력을 확인하세요.');
  if(!a.bank||typeof a.bank!=='object'||!Object.entries(a.bank).every(([k,v])=>hash(k)&&v&&str(v.data,8*1024*1024)))fail('이력 그림 보관을 확인하세요.');
  return a;
}

// 문항 복제: 구성 ID가 새로 바뀌므로 근거·그림 연결 대상을 새 ID로 옮기고, 이력은 새로 시작한다.
export function remapAuthoring(a,ids){
  if(!a)return a;const uid=()=>crypto.randomUUID(),n=structuredClone(a),map=key=>{const [k,id]=key.split(':');return id&&ids.has(id)?`${k}:${ids.get(id)}`:key;};
  n.sessionId=uid();n.evidence=n.evidence.map(b=>({...b,id:uid(),target:map(b.target)}));n.figures=n.figures.map(f=>({...f,blockId:ids.get(f.blockId)||f.blockId}));
  n.stale=n.stale.map(s=>({...s,target:s.target.startsWith('figure:')?'figure:'+(ids.get(s.target.slice(7))||s.target.slice(7)):s.target}));
  n.proposals=[];n.history=[];n.bank={};n.revision=0;n.contentHash=null;n.hashes={};
  return n;
}
