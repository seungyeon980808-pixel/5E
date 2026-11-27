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

// ── 만드는 도구용 판정(11-27 저녁). 지금 엔진(app.js absorb·examSend)과 같은 낱말을 쓴다. ──
// 자리만 채운 값(「미정」 등)은 시험지 정보로 받지 않는다(absorb와 같은 거름).
const PLACEHOLDER=/^(미지정|미정|없음|모름|알 수 없음|확인 필요|n\/a|unknown|-)$/i;
export function isPlaceholder(v){return v===''||v==null||(Array.isArray(v)&&!v.length)||(typeof v==='string'&&PLACEHOLDER.test(v.trim()));}
// 선생님이 직접 시킨 설계표 변경인가(absorb의 teacherPlan과 같은 낱말). 상의만 하자는 말이면 아니다.
const PLAN_WORDS=/난이도|배점|번은|번을|번 문항|설계|유형|그림|문항|순서|단원|소단원|점/;
export function teacherPlanText(text,{discuss=false}={}){const t=norm(text);return !!t&&!discuss&&PLAN_WORDS.test(t);}
// 저장해 둔 설계표 안을 받으라는 말인가(examSend의 planAsk와 같은 낱말).
export const wantsPlanApply=text=>/설계표.*(반영|적용)|추천대로|그 안대로|제안대로/.test(norm(text));
// 「선생님이 말한 값」이라는 AI의 말을 믿을지: 값의 낱말(두 글자 이상)이나 숫자가 이번 선생님 말에 실제로 있어야 한다.
// 없으면 AI가 정한 값(ai)으로 낮춘다 — 낮추면 선생님이 정했거나 본 칸은 덮지 못한다.
export function saidByTeacher(value,text){const t=norm(text).replace(/\s+/g,'');if(!t)return false;
  const flat=v=>v==null?[]:Array.isArray(v)?v.flatMap(flat):typeof v==='object'?Object.entries(v).flatMap(([k,x])=>[k,...flat(x)]):[String(v)];
  const tokens=flat(value).flatMap(s=>String(s).normalize('NFC').split(/[\s,·、/()]+/)).map(s=>s.trim()).filter(Boolean);
  return tokens.some(s=>/^\d+(\.\d+)?$/.test(s)?new RegExp(`(^|\\D)${s.replace('.','\\.')}(\\D|$)`).test(t):s.length>=2&&(t.includes(s)||(s.length>=3&&t.includes(s.slice(0,2)))));}

// ── 새 엔진 화면(11-27 엔진 화면 시안 v1) — 화면 없이 시험할 수 있는 작은 도움 함수 ──
// 고친 칸 표시의 「언제」: 방금 / n분 전 / n시간 전 / n일 전. 시각을 못 읽으면 「방금」.
export function relTime(at,now=Date.now()){const t=Date.parse(at);if(!Number.isFinite(t))return '방금';const m=Math.floor(Math.max(0,now-t)/60000);
  if(m<1)return '방금';if(m<60)return m+'분 전';const h=Math.floor(m/60);if(h<24)return h+'시간 전';return Math.floor(h/24)+'일 전';}
// 새 엔진 답에 섞여 오는 간단한 마크다운을 줄마다 나눈다. 먼저 모두 이스케이프하고, 굵게(**)만 <b>로 바꾼다.
//  - 「- 」「* 」「• 」로 시작 → li · 「> 」 → qt · 「### 」 → h(굵게) · 나머지 → p. 빈 줄은 뺀다.
const ESC={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>ESC[c]);
export function mdLines(text){const out=[];
  for(const raw of String(text??'').split(/\n+/)){let s=raw.replace(/\s+$/,''),kind='p';if(!s.trim())continue;
    if(/^\s*#{1,6}\s+/.test(s)){kind='h';s=s.replace(/^\s*#{1,6}\s+/,'');}
    else if(/^\s*[-*•]\s+/.test(s)){kind='li';s=s.replace(/^\s*[-*•]\s+/,'');}
    else if(/^\s*>\s?/.test(s)){kind='qt';s=s.replace(/^\s*>\s?/,'');}
    let html=esc(s).replace(/\*\*([^*\n]+?)\*\*/g,'<b>$1</b>');
    if(kind==='h')html='<b>'+html.replace(/<\/?b>/g,'')+'</b>';
    out.push({kind,html});}
  return out;}
// 목적격 조사(을/를): 「선지 ②를」「정답을」처럼 끝 글자로 고른다. 동그라미 숫자·숫자는 읽는 소리로(①일 ②이 …).
const READ_DIGIT='영일이삼사오육칠팔구';
export function eulReul(word){const m=String(word??'').match(/[가-힣0-9①-⑨](?=[^가-힣0-9①-⑨]*$)/);let c=m?m[0]:'';const circ='①②③④⑤⑥⑦⑧⑨'.indexOf(c);if(circ>=0)c=READ_DIGIT[circ+1];else if(/\d/.test(c))c=READ_DIGIT[+c];
  const code=c.charCodeAt(0)-0xAC00;if(code<0||code>11171)return '을';return code%28?'을':'를';}
