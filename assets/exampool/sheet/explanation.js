// 11-14 시안 review-1114c 2번(A·A·A·A): 해설을 칸으로 나눠 쓴다.
// · 합답형: 〈보기〉 줄(ㄱ·ㄴ·ㄷ)마다 칸, 끝의 「옳다 / 옳지 않다」는 정답 조합에서 자동.
// · 그 밖: 1. 2. 3. 번호 문단. · 어느 칸이든 하위 번호 1) 2)를 붙일 수 있다(해설이 길 때).
// 저장: q.explanationParts=[{key,text,subs:[]}]. q.explanation(글 하나)은 다른 곳(검색·AI·옛 파일)이 읽도록 늘 같이 맞춰 둔다.
// 칸이 아직 없으면(예전 해설) 「ㄱ.」「1.」로 시작하는 줄을 찾아 나눈다.
const MARK=/^\s*([ㄱ-ㅎ]|\d{1,2})\s*[.)]\s*/;
const SUB=/^\s*(?:\d{1,2}\)|\(\d{1,2}\))\s*/;
export function bogiKeys(q){if(q?.type!=='합답형')return null;const b=(q.blocks||[]).find(v=>v.kind==='bogi');return b?b.lines.map(l=>String(l.label||'').trim()).filter(Boolean):null;}
export function splitExplanation(text,keys){
  const lines=String(text||'').split(/\n/),parts=[];let cur=null;
  for(const raw of lines){const line=raw.trim();if(!line)continue;
    const m=line.match(MARK),sub=line.match(SUB);
    if(sub&&cur){cur.subs.push(line.replace(SUB,''));continue;}
    if(m&&(keys?keys.includes(m[1]):/^\d/.test(m[1]))){cur={key:m[1],text:line.replace(MARK,''),subs:[]};parts.push(cur);continue;}
    if(cur)cur.text+=(cur.text?' ':'')+line;else{cur={key:keys?.[0]||'1',text:line,subs:[]};parts.push(cur);}}
  return parts;
}
// 정답 선지(예: 「ㄱ, ㄴ」)에 든 보기 글자 → 옳은 보기.
export function rightKeys(q){if(!Number.isInteger(q?.answer)||q.answer<0)return null;const t=String(q.choices?.[q.answer]?.text||'');const ks=t.match(/[ㄱ-ㅎ]/g);return ks?new Set(ks):null;}
export function explanationParts(q){
  const keys=bogiKeys(q),saved=Array.isArray(q?.explanationParts)?q.explanationParts:splitExplanation(q?.explanation,keys);
  let parts;
  if(keys)parts=keys.map(k=>{const p=saved.find(v=>v.key===k);return {key:k,text:p?.text||'',subs:[...(p?.subs||[])]};});
  else{parts=saved.map((p,i)=>({key:String(i+1),text:p.text||'',subs:[...(p.subs||[])]}));if(!parts.length)parts=[{key:'1',text:'',subs:[]}];}
  const right=keys?rightKeys(q):null;
  return {mode:keys?'bogi':'num',parts:parts.map(p=>({...p,ox:right?(right.has(p.key)?'o':'x'):null}))};
}
export const OX_WORD={o:'옳다',x:'옳지 않다'};
export function explanationText({mode,parts}){
  return parts.filter(p=>p.text.trim()||p.subs.some(s=>s.trim())).map(p=>[`${p.key}. ${p.text.trim()}${mode==='bogi'&&p.ox&&!/옳(다|지 않다)\.?$/.test(p.text.trim())?` → ${OX_WORD[p.ox]}.`:''}`,...p.subs.filter(s=>s.trim()).map((s,i)=>`  ${i+1}) ${s.trim()}`)].join('\n')).join('\n');
}
export function hasExplanation(q){const {parts}=explanationParts(q);return parts.some(p=>p.text.trim()||p.subs.some(s=>s.trim()));}
