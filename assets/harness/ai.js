// 1.8.0 출제 하네스 — 시험지 대화·풀이 검사의 요청문과 응답 계약(harness-exam-v1, harness-solve-v1).
// 문항 하나를 쓰고 고치는 일은 기존 출제 대화 계약(exampool-authoring-v1)을 그대로 쓴다(문항 = 하위 세션).
// 원칙(11-24 결정): 고치라는 뜻이 분명할 때만 고친다 — 「반영」은 AI가 아니라 코드가 교사 말에서 판정한다(wantsApply).
import {extractJson} from '../exampool/authoring/contract.js';
export const EXAM_FORMAT='harness-exam-v1',SOLVE_FORMAT='harness-solve-v1';
const str=(v,max=20000)=>typeof v==='string'&&v.length<=max;
const META_KEYS=['subject','grade','term','examName','range','itemCount','pointsTotal','pointKinds','difficulty','emphasis','form'];
const STATUS=['set','choosing','redesign','empty'];
const FIG=['reuse','convert','new','code','none'];

// 교사 말에 「반영」 지시가 분명히 있는가(부정·조건·질문이면 아님). AI 판단에 맡기지 않는다.
export function wantsApply(text){
  const t=String(text||'').replace(/\s+/g,' ');
  if(!/(반영|적용)\s*(해|하자|해 ?줘|해줘|해 ?주세요|ㄱ|시켜)|그대로 (반영|적용)|(으로|로) (올려|가자)/.test(t))return false;
  if(/(반영|적용)\s*(하지|말|않|전에|할까|해도 돼|할지)|고치지 말|상의|먼저 (보|의논)/.test(t))return false;
  return true;
}
// 교사 말이 고치지 말라는 뜻인가(상의 모드).
export const wantsDiscussOnly=text=>/고치지 말|상의하자|먼저 (의논|상의|얘기)|바꾸지 말고/.test(String(text||''));
export const wantsDraft=text=>/초안|문항.*(써|만들어|뽑아)|이대로 (써|만들)/.test(String(text||''))&&!wantsDiscussOnly(text);
export const wantsSolve=text=>/풀이 ?검사|두 모델(로|이)? ?(풀|검사)|(다시 )?풀어 ?(봐|줘)/.test(String(text||''));
export const wantsFinal=text=>/v ?1\.0|최종(본)?으로|확정(해|하자)|이대로 (내자|낼게)/.test(String(text||''));

export function validateExamResponse(v){
  const e=[];const err=m=>e.push(m);
  if(!v||typeof v!=='object'||Array.isArray(v))return ['응답이 JSON 객체가 아닙니다.'];
  if(v.format!==undefined&&v.format!==EXAM_FORMAT)err('format이 다릅니다.');
  if(!str(v.reply,6000))err('reply(교사에게 하는 말)가 필요합니다.');
  if(v.questions!==undefined&&(!Array.isArray(v.questions)||v.questions.length>3||!v.questions.every(x=>str(x,600))))err('questions는 3개 이하.');
  if(v.meta!==undefined&&(typeof v.meta!=='object'||Array.isArray(v.meta)||Object.keys(v.meta).some(k=>!META_KEYS.includes(k))))err('meta 칸 이름을 확인하세요: '+META_KEYS.join(','));
  if(v.metaBy!==undefined&&(typeof v.metaBy!=='object'||Object.values(v.metaBy).some(x=>!['teacher','ai'].includes(x))))err('metaBy는 teacher|ai.');
  if(v.plan!==undefined&&v.plan!==null&&(!Array.isArray(v.plan)||v.plan.length>60||!v.plan.every(r=>r&&Number.isInteger(r.no)&&r.no>0&&(r.status===undefined||STATUS.includes(r.status))&&(r.figure===undefined||FIG.includes(r.figure)))))err('plan 행: no(1부터)·status(set|choosing|redesign|empty)·figure(reuse|convert|new|code|none).');
  if(v.planBy!==undefined&&!['teacher','ai'].includes(v.planBy))err('planBy는 teacher|ai.');
  if(v.ledger!==undefined&&(!Array.isArray(v.ledger)||!v.ledger.every(x=>x&&str(x.id,80)&&['talk','decided','dropped'].includes(x.status))))err('ledger 항목: id·status(talk|decided|dropped).');
  if(v.rules!==undefined&&(!Array.isArray(v.rules)||v.rules.length>5||!v.rules.every(x=>x&&str(x.text,400))))err('rules: [{text}] 5개 이하.');
  return e;
}
export function parseExamResponse(text){const v=extractJson(text);if(!v)return {ok:false,errors:['응답에서 JSON을 찾지 못했습니다.']};const errors=validateExamResponse(v);return errors.length?{ok:false,errors,value:v}:{ok:true,value:v};}

const META_LABEL={subject:'과목',grade:'학년',term:'학기',examName:'시험',range:'범위',itemCount:'문항 수',pointsTotal:'총점',pointKinds:'배점 종류',difficulty:'난이도 분포',emphasis:'수업 강조',form:'양식'};
const show=v=>v==null?'(미정)':typeof v==='object'?JSON.stringify(v):String(v);
export const EXAM_SPEC=`[응답 형식] JSON 객체 하나만 출력한다(설명·코드 블록 없이).
{
 "format":"${EXAM_FORMAT}",
 "reply":"교사에게 하는 말(한국어, 3~6문장). 무엇을 정했고 무엇이 남았는지.",
 "questions":["막는 질문(과목·범위·문항 수·총점) 중 빠진 것만, 최대 3개. 없으면 []"],
 "meta":{"subject":"","range":"","itemCount":16,"pointsTotal":50,"pointKinds":[2,3,4],"difficulty":{"최상":4},"emphasis":["…"],"grade":"","examName":"","term":"","form":""},
 "metaBy":{"subject":"teacher|ai", ...},  ← 교사가 말한 값은 teacher, 네가 정한 기본값은 ai
 "planBy":"teacher|ai",  ← plan이 교사가 이번 말로 직접 바꾸라고 한 것을 옮긴 것이면 teacher, 네가 제안하는 것이면 ai
 "plan":null 또는 [{"no":1,"unit":"소단원","standards":[],"difficulty":"상","points":3,"form":"combo|single|pair|talk|essay","structure":"two|big|small|condition|many|experiment|none","twist":"평가할 사고·꼬는 방식 한 줄","figure":"reuse|convert|new|code|none","basis":[{"kind":"textbook|worksheet|past","title":"","page":0}],"status":"set|choosing|redesign|empty"}],
 "ledger":[{"id":"코멘트 id","status":"talk|decided|dropped","gist":"요지","answer":"교사 질문이면 근거로 먼저 답"}],
 "rules":[{"text":"교사가 이번 말에서 새로 밝힌 출제 규칙(표현·표기·금지·자료 다루는 법 등 다음 문항에도 쓸 것)만. 문항 수·배점·난이도·강조 단원 같은 시험 조건은 meta에 넣고 여기 넣지 않는다. 없으면 []"}]
}
- 과목·범위·문항 수·총점 중 하나라도 비어 있으면 설계표(plan)를 만들지 말고 그것만 묻는다. 나머지(배점 종류·난이도 분포·양식·학교급·개정)는 묻지 말고 기본값을 meta에 넣고 metaBy=ai로 둔다.
- 너는 아무것도 고치지 않는다. 「고쳤다·반영했다」라고 말하지 않는다. 반영은 교사가 「반영해」라고 말할 때 앱이 한다.
- 코멘트 대장(ledger): 교사가 이번 말로 어떤 코멘트를 그대로 하자고 정했으면 decided, 아직 의논이 필요하면 talk, 하지 않기로 했으면 dropped. 교사가 정하지 않은 것을 decided로 올리지 않는다.
- 이미 교사가 정한 칸(teacher)·교사가 본 설계표 행은 네 판단으로 바꾸지 말고, 바꾸고 싶으면 reply에 「지금 → 바꿀 안」으로 제안만 한다. 단 교사가 이번 말로 직접 바꾸라고 한 것(예: 「난이도는 상2·중4·하2로」, 「8번은 충돌 문항으로」)은 plan에 그대로 옮기고 planBy=teacher로 둔다. 교사가 분포·합계만 정하면(「상2·중2·하2로」) 어느 칸을 바꿀지는 네가 골라 그 분포가 되게 plan에 바로 반영하고, reply에 「3번 중→하」처럼 어느 칸을 바꿨는지 짧게 말한다. 제안으로 미루지 않는다.`;

export function buildExamPrompt(work,{text,ledger=[],rules=[],stage}){
  const m=work.meta||{},meta=Object.entries(META_LABEL).map(([k,l])=>{const x=m[k];return `- ${l}(${k}): ${show(x?.value??null)}${x?.by?` [${x.by}${x.seen?'·봄':''}]`:''}`;}).join('\n');
  const plan=(work.plan||[]).length?(work.plan||[]).map(r=>`- ${r.no}번 ${r.unit||''} · ${r.difficulty||''} · ${r.points??''}점 · ${r.form||''}/${r.structure||''} · ${r.figure||''} · ${r.status||''}${r.qid?' · 문항 있음':''}${r.seen?' · 교사 봄':''}${r.twist?` · ${r.twist}`:''}`).join('\n'):'(아직 없음)';
  const led=ledger.length?ledger.map(c=>`- [${c.id}] ${c.no?c.no+'번':'시험지 전체'} · ${c.status} · 「${String(c.text).slice(0,400)}」${c.proposal?` · AI 안: ${String(c.proposal).slice(0,300)}`:''}`).join('\n'):'(없음)';
  const chat=(work.chat||[]).slice(-10).map(x=>`${x.role==='me'?'교사':'AI'}: ${String(x.text).slice(0,800)}`).join('\n');
  return [
    `[역할] 너는 과학 교사와 함께 시험지 한 벌을 설계하는 출제 동료다. 지금 단계: ${stage||m.stage||'design'}. 근거(교과서 쪽·학습지·기출)를 먼저 대고, 근거가 없으면 「근거 없음」이라고 밝힌다.`,
    EXAM_SPEC,
    `[시험지 정보]\n${meta}`,
    `[설계표]\n${plan}`,
    `[코멘트 대장]\n${led}`,
    rules.length?`[출제 규칙]\n${rules.map(r=>'- '+r.text).join('\n')}`:'',
    chat?`[최근 대화]\n${chat}`:'',
    `[교사 말]\n${text}`,
  ].filter(Boolean).join('\n\n');
}

// ── 풀이 검사: 정답·해설을 가린 문항지를 모델마다 새 맥락에서 따로 푼다 ──
export function validateSolve(v){if(!v||typeof v!=='object')return ['JSON 객체가 아닙니다.'];const e=[];
  if(!(v.answer===null||Number.isInteger(v.answer)&&v.answer>=1&&v.answer<=5))e.push('answer는 1~5 또는 null(정답 없음·여럿).');
  if(v.multiple!==undefined&&!Array.isArray(v.multiple))e.push('multiple은 목록.');if(!str(v.note||'',2000))e.push('note.');return e;}
export function parseSolve(text){const v=extractJson(text);if(!v)return {ok:false,errors:['JSON 없음']};const errors=validateSolve(v);return errors.length?{ok:false,errors,value:v}:{ok:true,value:v};}
const CIRCLED='①②③④⑤';
export function solveSheet(q){
  const lines=[`${q.number}. `];
  for(const b of q.blocks||[]){if(b.kind==='bogi')continue;if(b.kind==='table')lines.push(b.table.cells.map(r=>'| '+r.map(c=>String(c.value??'')).join(' | ')+' |').join('\n'));
    else if(b.kind==='figure')lines.push(`[${b.label||'그림'}${b.figure?.data?'':' (그림 없음)'}]`);else if(b.lines)lines.push(b.lines.map(l=>`${l.label} ${l.text}`).join('\n'));else if(b.text)lines.push(b.text);}
  lines.push(q.ask||'');const bogi=(q.blocks||[]).find(b=>b.kind==='bogi');if(bogi)lines.push('<보기>\n'+bogi.lines.map(l=>`${l.label}. ${l.text}`).join('\n'));
  if(q.type!=='서술형')lines.push(q.choices.map((c,i)=>`${CIRCLED[i]} ${c.text}`).join('  '));
  return lines.filter(Boolean).join('\n');
}
export function buildSolvePrompt(q){return `[역할] 너는 이 시험을 처음 보는 학생이자 검토 교사다. 정답·해설은 받지 않았다. 문항만 보고 직접 푼다.
[응답 형식] JSON 하나만: {"format":"${SOLVE_FORMAT}","answer":1~5 또는 null,"multiple":[정답이 여럿이면 번호들],"note":"풀이 핵심과 문항 결함(복수 정답·조건 부족·교과 범위 밖·시비 가능성) 한두 문장, 한국어"}
- 문항의 그림은 첨부한 이미지로 함께 준다(이름이 칸 이름). 그림이 없다고 적힌 칸만 글로 판단하고, 그림이 꼭 필요한데 없으면 note에 적는다.

[문항]
${solveSheet(q)}`;}
// 두 모델 결과 → 판정(pass·doubt·fail·single).
export function verdict(answer,runs){const got=runs.filter(r=>Number.isInteger(r.answer));if(!got.length)return 'skipped';if(got.length===1)return 'single';
  const same=got.every(r=>r.answer===got[0].answer);if(same&&got[0].answer===answer)return 'pass';if(same&&got[0].answer!==answer)return 'fail';return 'doubt';}
