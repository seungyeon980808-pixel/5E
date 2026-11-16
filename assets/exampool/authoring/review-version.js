// 출제 검토 버전. 조판 지문(typeset-model.js의 questionFingerprint)은 학생용 지면에 찍히는 값만 보므로
// 정답이 ③→①로 바뀌어도 같다. 검토는 정답·해설·교육과정·그림 바이트까지 묶어야 하므로 따로 계산한다.
// 표시 서식(배치·선지 배열·조판 결과·대화 기록)은 빼고, 의미가 바뀌는 값만 넣는다.
const enc=new TextEncoder();
export async function sha256(text){
  const bytes=typeof text==='string'?enc.encode(text):text;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
// 그림은 실제 바이트(data)와 편집 원본(editable: 5E 객체·그래프 수식/데이터)을 각각 해시한다.
async function figureKey(f){
  if(!f)return null;
  return {data:f.data?await sha256(f.data):null,editable:f.editable?await sha256(JSON.stringify(f.editable)):null};
}
const tableKey=t=>t?{cells:t.cells.map(r=>r.map(c=>String(c.value??''))),merges:t.merges,note:t.note||'',headerRows:t.headerRows}:null;
// 구성요소별 의미 내용. 키는 안정적인 구성 ID(블록·보기 항목·선지) 또는 고정 이름(ask, answer …).
export async function semanticComponents(q){
  const out={
    type:{type:q.type,form:q.form??null,style:q.style},
    ask:{ask:q.ask,points:q.points},
    answer:{answer:q.answer},
    explanation:{explanation:q.explanation,modelAnswer:q.modelAnswer},
    // 출제 대상(학교급·과목·개정)은 대화가 기록하는 메타데이터라 넣지 않는다. 넣으면 AI가 대상을 적는 순간 새 버전이 생긴다.
    meta:{standardCode:q.standardCode,intent:q.intent},
  };
  for(const b of q.blocks){
    out['block:'+b.id]={parent:b.parent,kind:b.kind,label:b.label,text:b.text,table:tableKey(b.table),figure:await figureKey(b.figure)};
    for(const l of b.lines||[])out['line:'+l.id]={block:b.id,label:l.label,text:l.text};
  }
  for(const c of q.choices)out['choice:'+c.id]={text:c.text,figure:await figureKey(c.figure)};
  if(q.style==='대응표')out.choiceTable={table:tableKey(q.choiceTable)};
  return out;
}
// 구성요소 해시와 전체 검토 버전. 순서를 고정해 같은 내용이면 같은 값이 나온다.
export async function reviewVersion(q){
  const parts=await semanticComponents(q),hashes={};
  for(const key of Object.keys(parts).sort())hashes[key]=await sha256(JSON.stringify(parts[key]));
  const order=[...q.blocks.map(b=>b.id),...q.blocks.flatMap(b=>(b.lines||[]).map(l=>l.id)),...q.choices.map(c=>c.id)];
  return {version:await sha256(JSON.stringify({hashes,order})),hashes};
}
// 두 해시 묶음의 차이: 바뀐·추가된·사라진 구성요소 키.
export function changedComponents(before={},after={}){
  const keys=new Set([...Object.keys(before),...Object.keys(after)]);
  return [...keys].filter(k=>before[k]!==after[k]).sort();
}
// 바뀐 구성요소가 무엇에 영향을 주는지. 첫 구현은 보수적이다: 의미가 바뀌면 검토 네 축을 모두 다시 본다.
// 여기서는 '같이 고쳐야 할 수 있는 칸'(오래된 상태 표시)만 좁혀서 알려 준다.
export function impactOf(changed,q){
  const has=prefix=>changed.some(k=>k===prefix||k.startsWith(prefix+':'));
  const conditions=changed.filter(k=>k==='ask'||k==='type'||k.startsWith('block:')&&!isBogiBlock(q,k.slice(6)));
  const statements=changed.filter(k=>k.startsWith('line:')||k.startsWith('choice:')||k==='choiceTable'||k.startsWith('block:')&&isBogiBlock(q,k.slice(6)));
  const stale=new Set();
  if(conditions.length||statements.length){if(!has('answer'))stale.add('answer');if(!has('explanation'))stale.add('explanation');}
  if(has('answer')&&!has('explanation'))stale.add('explanation');
  // 글·표·발문 조건이 바뀌면, 그 조건으로 만든 그림·그래프가 그대로면 다시 확인해야 한다.
  // 다른 그림 칸을 더하거나 바꾼 것은 이 그래프의 조건 변경이 아니다(정답·해설은 위에서 이미 다시 확인으로 둔다).
  const textual=conditions.filter(k=>!k.startsWith('block:')||kindOf(q,k.slice(6))!=='figure');
  if(textual.length)for(const link of q.authoring?.figures||[])if(!changed.includes('block:'+link.blockId))stale.add('figure:'+link.blockId);
  return {conditions,statements,stale:[...stale],axes:changed.length?['curriculum','scope','answer','figure']:[]};
}
function isBogiBlock(q,id){return q.blocks.find(b=>b.id===id)?.kind==='bogi';}
// 사라진 블록은 종류를 알 수 없으므로 조건 변경으로 본다(보수적).
function kindOf(q,id){return q.blocks.find(b=>b.id===id)?.kind||'text';}
