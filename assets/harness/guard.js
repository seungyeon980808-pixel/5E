// 1.8.0 출제 하네스 새 엔진 — 권한과 안전망(11-27 계획-엔진전환 3절). 화면·AI 없이 판정만 하는 순수 함수.
//
// 원칙: 「바로 고침」은 AI가 말뜻을 읽어 정하지만, 막는 쪽은 코드가 정한다. 여기서 하나라도 걸리면 고치지 않고 「제안」으로 낮춘다
// (거부가 아니라 낮춤 — 제안은 시험지 위에 뜨고 선생님이 받기를 누르면 된다).
//  권한 ask(제안 후 받기, 기본) : 본 내용은 늘 제안.
//  권한 direct(바로 고침)       : 아래 안전망을 모두 지나야 바로 고친다.
//   1 물음·상의 문장이면 낮춤   2 선생님 말에 나온 문항(또는 열려 있는 문항)만   3 「고치기 전 글」이 지금 글과 다르면 낮춤
//   4 한 차례에 고칠 칸 수 상한   5 잠긴 칸은 늘 낮춤
// 판 올리기·풀이 검사·이미 뜬 제안 받기는 선생님 말에 그 뜻이 있을 때만(wants* — 지금 엔진의 판정을 그대로 씀).

export const PERMISSIONS=['ask','direct'];
export const PERMISSION_LABEL={ask:'제안 후 받기',direct:'바로 고침'};
export const DIRECT_CELL_CAP=8;// 한 차례에 바로 고칠 수 있는 칸 수

const norm=s=>String(s??'').normalize('NFC').replace(/\s+/g,' ').trim();
// 상의만 하자는 말(지금 엔진 ai.js wantsDiscussOnly와 같은 뜻, 조금 넓힘).
const DISCUSS=/고치지\s*(말|마)|바꾸지\s*(말|마)|건드리지\s*(말|마)|반영(은|하지)?\s*(말|마|하지\s*마)|아직\s*(고치|바꾸|반영)|의논|상의|얘기(만|해\s*보)|이야기(만|해\s*보)|안만\s|제안만|생각(만|해\s*보)|검토만|의견(만|을\s*말)/;
// 묻는 말: 물음표로 끝나거나, 묻는 끝말로 끝난다. 「…바꿔 줄래?」「…고쳐 줄 수 있어?」 같은 부탁은 묻는 말로 치지 않는다.
const ASKS=/(\?|？)\s*$|(까요|을까|ㄹ까|일까|나요|는지|은지|인가요?|어때요?|어떨까요?|어떻게\s*생각[^\s]*|괜찮(아|을까|나)요?|맞(아|나)요?|않(아|니|나)요?)\s*[.!]?\s*$/;
const REQUEST=/(해|줘|줘요|주세요|줄래|주겠어|줄\s*수\s*있(어|나|을까)|바꿔|고쳐|교체|넣어|빼|지워|써|만들어|올려|반영)\s*(줄래|주겠어|줄\s*수\s*있(어|나요?|을까요?))?\s*(\?|？)?\s*$/;
// 선생님 말의 뜻(막는 쪽 판정에만 쓴다).
export function teacherIntent(text){
  const t=norm(text);
  // 「1·3번」「2, 5번」「1~3번」처럼 묶어 말한 번호도 모두 뽑는다(범위는 펼침).
  const numbers=[];for(const m of t.matchAll(/@?\s*((?:\d{1,3}\s*[·,、~∼–-]\s*)*\d{1,3})\s*번/g)){const parts=m[1].split(/\s*([·,、~∼–-])\s*/);
    for(let i=0;i<parts.length;i+=2){const n=Number(parts[i]),sep=parts[i-1];if(i>0&&/[~∼–-]/.test(sep)){const from=Number(parts[i-2]);for(let k=Math.min(from,n);k<=Math.max(from,n)&&k-Math.min(from,n)<60;k++)if(!numbers.includes(k))numbers.push(k);}else if(!numbers.includes(n))numbers.push(n);}}
  const discuss=DISCUSS.test(t);
  // 「3번 ㄴ 어색하지 않아?」는 묻는 말, 「3번 ㄴ 바꿔 줄래?」는 부탁.
  const question=ASKS.test(t)&&!REQUEST.test(t);
  return {numbers,discuss,question,empty:!t};
}
// 문항 변경 하나를 계약 꼴로 다듬는다(도구 입력 → exampool 계약 change). 잘못이면 throw.
const TEXT_PATHS=new Set(['ask','passage','explanation','choice','bogi','block']);
export function normalizeChange(c){
  if(!c||typeof c!=='object')throw Error('변경 하나는 {path, value, …} 꼴이어야 해요.');
  const path=String(c.path||'');
  if(!['ask','passage','explanation','choice','bogi','block','answer','points'].includes(path))throw Error(`path는 ask(발문)·passage(지문)·choice(선지)·bogi(보기 줄)·block(자료 글)·answer(정답)·points(배점)·explanation(해설) 중 하나여야 해요: ${path||'(없음)'}`);
  const out={path};
  if(path==='choice'){const n=Number(c.number??(c.index!=null?Number(c.index)+1:NaN));if(!Number.isInteger(n)||n<1||n>5)throw Error('choice는 number(1~5, ①~⑤)가 필요해요.');out.index=n-1;}
  if(path==='bogi'){const line=String(c.line??'').trim();if(!line)throw Error('bogi는 line(ㄱ·ㄴ·ㄷ…)이 필요해요.');out.line=line;}
  if(path==='block'){const id=String(c.id??'').trim();if(!id)throw Error('block은 id(자료 이름)가 필요해요.');out.id=id;}
  if(path==='answer'){const n=Number(c.value);if(!Number.isInteger(n)||n<1||n>5)throw Error('answer의 value는 1~5(정답 번호)예요.');out.value=n;}
  else if(path==='points'){const n=Number(c.value);if(!Number.isFinite(n)||n<=0||n>100)throw Error('points의 value는 배점 숫자예요.');out.value=n;}
  else{if(typeof c.value!=='string'||!c.value.trim())throw Error('value(바꿀 글)가 비었어요.');if(c.value.length>8000)throw Error('바꿀 글이 너무 길어요.');out.value=c.value;}
  if(c.before!=null)out.before=String(c.before);
  return out;
}
// 「고치기 전 글」 대조: AI가 알고 있는 글(before)이 지금 글과 같은가. 글 칸은 before가 꼭 있어야 한다.
export function staleReason(change,currentValue){
  if(!TEXT_PATHS.has(change.path))return change.before==null||norm(change.before)===norm(currentValue)?null:'지금 값이 달라요';
  if(change.before==null)return '고치기 전 글(before)이 없어요';
  return norm(change.before)===norm(currentValue)?null:'그사이 글이 바뀌었어요';
}
// 바로 고쳐도 되는가. 하나라도 걸리면 direct:false와 이유(선생님·AI에게 그대로 보여 줄 말)를 돌려준다.
//  permission      : 'ask' | 'direct'
//  intent          : teacherIntent(이번 선생님 말)
//  number          : 고치려는 문항 번호
//  openNumber      : 지금 열려 있는 문항 번호(없으면 null)
//  questionCount   : 시험지 문항 수
//  cells           : 이번 변경이 건드리는 칸 수
//  lockedCells     : 그중 잠긴 칸 수
//  stale           : 「고치기 전 글」이 안 맞는 변경의 이유들([])
//  appliedThisTurn : 이번 차례에 이미 바로 고친 칸 수
export function checkDirect({permission='ask',intent,number,openNumber=null,questionCount=0,cells=1,lockedCells=0,stale=[],appliedThisTurn=0,cap=DIRECT_CELL_CAP}={}){
  const reasons=[];
  if(permission!=='direct')reasons.push({code:'permission',text:'권한이 「제안 후 받기」예요'});
  if(!intent||intent.empty)reasons.push({code:'no-teacher',text:'선생님 말이 없는 차례예요'});
  else{
    if(intent.discuss)reasons.push({code:'discuss',text:'고치지 말고 의논하자는 말이에요'});
    else if(intent.question)reasons.push({code:'question',text:'고치라는 말이 아니라 묻는 말이에요'});
    const named=intent.numbers.includes(Number(number)),open=openNumber!=null&&Number(openNumber)===Number(number),only=questionCount===1;
    if(!named&&!(intent.numbers.length===0&&(open||only)))reasons.push({code:'scope',text:intent.numbers.length?`선생님 말에 나온 문항(${intent.numbers.join('·')}번)이 아니에요`:'어느 문항인지 선생님 말에 없어요'});
  }
  if(lockedCells>0)reasons.push({code:'locked',text:'선생님이 직접 고친 칸(잠김)이에요'});
  if(stale.length)reasons.push({code:'stale',text:stale[0]});
  if(appliedThisTurn+cells>cap)reasons.push({code:'cap',text:`한 번에 바로 고칠 수 있는 칸 수(${cap})를 넘어요`});
  return {direct:reasons.length===0,reasons};
}
// 이미 시험지에 떠 있던 제안을 말로 받는 것: 권한이 direct거나, 선생님 말에 「반영해」 뜻이 있을 때만. 이번 차례에 새로 만든 제안은 받지 못한다(ask 권한).
export function checkAccept({permission='ask',intent,wantsApply=false,createdThisTurn=false}={}){
  if(intent?.discuss)return {ok:false,reason:'고치지 말고 의논하자는 말이에요'};
  if(permission==='direct')return {ok:true};
  if(createdThisTurn)return {ok:false,reason:'방금 만든 제안은 선생님이 시험지에서 보고 받기를 눌러야 해요'};
  if(!wantsApply)return {ok:false,reason:'선생님이 「반영해」라고 하지 않았어요'};
  return {ok:true};
}
