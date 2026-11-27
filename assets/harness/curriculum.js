// 1.8.0 출제 하네스: 2022 개정 교육과정 성취기준 원문 찾기.
// 자료는 ./data/curriculum-2022.json(scripts/build-harness-curriculum.mjs가 만든다).
// 브라우저와 Node 둘 다에서 쓴다. 바깥 라이브러리 없음. 이상한 입력에도 던지지 않는다.

const EDITION='kr-2022';
let cache=null;

// 자료를 한 번만 읽는다. fetchJson을 주면 그것으로 읽는다(검사·Node용).
export function loadCurriculum(fetchJson){
  if(fetchJson)return Promise.resolve().then(()=>fetchJson());
  if(!cache){
    cache=fetch(new URL('./data/curriculum-2022.json',import.meta.url))
      .then(r=>{if(!r.ok)throw new Error('성취기준 자료를 읽지 못했다: '+r.status);return r.json();})
      .catch(e=>{cache=null;throw e;});
  }
  return cache;
}

// ── 글 다듬기 ──
const DOTS=/[·⋅・‧•∙]/g;
function norm(s){
  return String(s??'').normalize('NFC').replace(DOTS,'·').replace(/[Ⅰ]/g,'I').replace(/[Ⅱ]/g,'II').replace(/[Ⅲ]/g,'III').replace(/\s+/g,' ').trim();
}
const squash=s=>norm(s).replace(/\s+/g,'');
// 코드: 대괄호·빈칸을 빼고 다시 감싼다. 코드 모양이 아니면 ''.
function normCode(code){
  const core=squash(code).replace(/^\[+|\]+$/g,'');
  if(!/^\d{1,2}[^\s\[\]]*-\d{2}(-\d{2})?$/.test(core))return '';
  return '['+core+']';
}

// ── 색인(자료마다 한 번) ──
const indexes=new WeakMap();
function indexOf(data){
  if(!data||typeof data!=='object'||!Array.isArray(data.items)||!Array.isArray(data.subjects))return null;
  let ix=indexes.get(data);if(ix)return ix;
  const subjects=data.subjects,areas=Array.isArray(data.areas)?data.areas:[];
  const count=new Map();for(const it of data.items)count.set(normCode(it.c),(count.get(normCode(it.c))||0)+1);
  const rows=data.items.map((it,i)=>{
    const sub=subjects[it.s]||{},area=it.a!=null?areas[it.a]:undefined;
    const code=normCode(it.c);
    const subject=String(sub.n||'');
    return {i,it,sub,code,area,subject,
      school:sub.l==='m'?'middle':sub.l==='h'?'high':'',
      ref:count.get(code)>1?`${EDITION}:${it.c}@${subject.replace(/\s+/g,'')}`:`${EDITION}:${it.c}`,
      hay:squash(it.t+' '+subject+' '+(area||'')),
      subj:squash(subject)};
  });
  const byCode=new Map();for(const r of rows){if(!byCode.has(r.code))byCode.set(r.code,[]);byCode.get(r.code).push(r);}
  const byRef=new Map(rows.map(r=>[r.ref,r]));
  const subjectNames=[...new Set(rows.map(r=>r.subj))].filter(n=>n.length>=2);
  ix={rows,byCode,byRef,subjectNames};indexes.set(data,ix);return ix;
}
function out(r){
  const o={code:r.it.c,school:r.school,subject:r.subject};
  if(r.area)o.area=r.area;
  o.text=r.it.t;o.ref=r.ref;
  if(r.sub.g)o.grade=r.sub.g;
  return o;
}

// 학교급: 'middle'|'high'|'중'|'중학교'|'고'|'고등학교'… → 'middle'|'high'|''
function normSchool(v){
  const s=squash(v).toLowerCase();
  if(!s)return '';
  if(s==='middle'||s==='m'||s.startsWith('중'))return 'middle';
  if(s==='high'||s==='h'||s.startsWith('고'))return 'high';
  return '?';
}

// 조사·어미를 떼 본 꼴(한 글자 남으면 쓰지 않는다).
const TAILS=['에서는','으로써','에서','으로','에게','까지','부터','하기','하는','하고','의','을','를','이','가','은','는','과','와','에','로','도','만','및'];
function variants(tok){
  const v=[tok];
  for(const t of TAILS)if(tok.length-t.length>=2&&tok.endsWith(t)){v.push(tok.slice(0,-t.length));break;}
  return v;
}
const SCHOOL_WORDS={중학교:'middle',중학:'middle',중등:'middle',고등학교:'high',고등:'high',고교:'high'};

// 성취기준 찾기. 코드가 있으면 코드로, 없으면 낱말로 찾는다.
export function findStandards(data,opts){
  try{
    const {query,code,subject,school,limit=5}=opts&&typeof opts==='object'?opts:{};
    const ix=indexOf(data);if(!ix)return [];
    let lim=Number(limit);if(!Number.isFinite(lim)||lim<1)lim=5;lim=Math.min(Math.floor(lim),200);
    let sch=normSchool(school);if(sch==='?')return [];
    const subjQ=squash(subject);
    const pass=r=>(!sch||r.school===sch)&&(!subjQ||r.subj.includes(subjQ));

    // 1) 코드로 찾기(코드 칸, 또는 질의가 코드 하나일 때). ref도 받는다.
    const codeIn=typeof code==='string'||typeof code==='number'?String(code):'';
    const qStr=typeof query==='string'||typeof query==='number'?String(query):'';
    if(codeIn||qStr){
      const byRef=ix.byRef.get(squash(codeIn||qStr));
      if(byRef)return pass(byRef)?[out(byRef)]:[];
      const c=normCode(codeIn||qStr);
      if(c)return (ix.byCode.get(c)||[]).filter(pass).slice(0,lim).map(out);
      if(codeIn)return [];
    }

    // 2) 낱말로 찾기.
    const q=norm(qStr).slice(0,400);if(!q)return [];
    let toks=q.split(/[\s,·/()\[\]「」『』〈〉<>"'“”‘’?!.:;~]+/).map(t=>t.trim()).filter(Boolean);
    let schoolHint='';
    toks=toks.filter(t=>{if(SCHOOL_WORDS[t]){schoolHint=SCHOOL_WORDS[t];return false;}return true;});
    toks=[...new Set(toks.filter(t=>t.length>=2))].slice(0,20);
    if(!toks.length)return [];
    // 질의에 들어 있는 과목 이름(어느 교과든 똑같이 대접).
    const qs=squash(q);
    const mentioned=ix.subjectNames.filter(n=>qs.includes(n));
    const scored=[];
    for(const r of ix.rows){
      if(!pass(r))continue;
      let score=0,hit=0;
      for(const t of toks){
        let m=0;for(const v of variants(t))if(r.hay.includes(v)){m=v.length;break;}
        if(m){score+=m;hit++;}
      }
      if(!hit)continue;
      score+=hit*0.5;                                // 더 많은 낱말이 맞으면 앞으로
      if(mentioned.includes(r.subj))score+=1.5;      // 질의가 과목 이름을 말함
      if(subjQ&&r.subj===subjQ)score+=0.5;           // 과목 칸과 정확히 같음
      if(schoolHint&&r.school===schoolHint)score+=1; // 질의가 학교급을 말함
      scored.push({r,score});
    }
    scored.sort((a,b)=>b.score-a.score||a.r.i-b.r.i);
    return scored.slice(0,lim).map(s=>out(s.r));
  }catch{return [];}
}

// 인용이 원문 그대로인지. code 자리에 ref도 된다.
//   exact: 빈칸을 하나로 줄인 뒤 원문 안에 그대로 들어 있음
//   ok:    exact이거나, 띄어쓰기만 다르고 글자는 모두 같음
// 원본 추출 때 낱말 가운데 빈칸이 끼어든 글(예: 「일상생 활에서」)이 130개쯤 있어서,
// 띄어쓰기 차이는 봐준다. 글자가 하나라도 다르면 false.
// 가운뎃점 모양(·⋅・)과 로마 숫자(Ⅰ/I)는 같은 것으로 본다.
export function quoteCheck(data,code,quote){
  try{
    const ix=indexOf(data);if(!ix)return {ok:false,found:false,exact:false};
    const key=String(code??'');
    const rows=ix.byRef.has(squash(key))?[ix.byRef.get(squash(key))]:(ix.byCode.get(normCode(key))||[]);
    if(!rows.length)return {ok:false,found:false,exact:false};
    const q=norm(typeof quote==='string'||typeof quote==='number'?quote:'');
    if(q.replace(/\s/g,'').length<2)return {ok:false,found:true,exact:false};
    const exact=rows.some(r=>norm(r.it.t).includes(q));
    const ok=exact||rows.some(r=>squash(r.it.t).includes(squash(q)));
    return {ok,found:true,exact};
  }catch{return {ok:false,found:false,exact:false};}
}

// 사람이 읽는 짧은 이름: 2022 개정 · 고등학교 통합과학1 · [10통과1-03-04]
export function standardLabel(item){
  if(!item||typeof item!=='object')return '';
  const school=item.school==='middle'?'중학교':item.school==='high'?'고등학교':'';
  const head=[school,item.subject].filter(Boolean).join(' ');
  return ['2022 개정',head,item.code].filter(Boolean).join(' · ');
}
