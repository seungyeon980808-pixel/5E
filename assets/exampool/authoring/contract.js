// 출제 대화 응답 계약(exampool-authoring-v1). AI 답을 그대로 문항에 쓰지 않는다.
// 1) 글에서 JSON을 꺼내 형식을 검사하고 2) 변경안을 문항의 실제 구성 ID로 바꾸고 3) 정답 구조를 코드로 확인한다.
import {clone} from '../sheet/model.js';
import {writeField,fieldValue} from '../sheet/vertical.js';
import {comboParts} from '../sheet/choice-text.js';
import {JUDGEMENTS,AXES} from './schema.js';
export const AUTHORING_FORMAT='exampool-authoring-v1';
const CIRCLED='①②③④⑤',JAMO='ㄱㄴㄷㄹㅁㅂㅅ';
const str=(v,max=20000)=>typeof v==='string'&&v.length<=max;
// 모델이 앞뒤에 말을 붙이거나 ```json으로 감싸도 첫 번째 완결된 객체를 꺼낸다.
export function extractJson(text){
  const s=String(text||''),fence=s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const source=fence?fence[1]:s,start=source.indexOf('{');if(start<0)return null;
  let depth=0,quote=false,escape=false;
  for(let i=start;i<source.length;i++){const c=source[i];
    if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quote=false;continue;}
    if(c==='"')quote=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){try{return JSON.parse(source.slice(start,i+1));}catch{return null;}}}
  return null;
}
const PATHS=['ask','passage','explanation','modelAnswer','intent','standardCode','answer','choice','choices','bogi','block','table','type','points'];
export function validateResponse(v){
  const errors=[];const err=m=>errors.push(m);
  if(!v||typeof v!=='object'||Array.isArray(v))return ['응답이 JSON 객체가 아닙니다.'];
  if(v.format!==undefined&&v.format!==AUTHORING_FORMAT)err('응답 형식 이름이 다릅니다.');
  if(!str(v.reply,6000))err('reply(교사에게 하는 말)가 필요합니다.');
  if(v.questions!==undefined&&(!Array.isArray(v.questions)||v.questions.length>3||!v.questions.every(x=>str(x,600))))err('questions는 3개 이하의 짧은 질문이어야 합니다.');
  if(v.requirements!==undefined){const r=v.requirements;if(!r||!['explicit','assumed','pending'].every(k=>r[k]===undefined||Array.isArray(r[k])&&r[k].every(x=>str(x,1000))))err('requirements 형식을 확인하세요.');}
  const p=v.proposal;
  if(p!==undefined&&p!==null){
    if(!str(p.summary||'',2000))err('proposal.summary를 확인하세요.');
    if(p.changes!==undefined&&(!Array.isArray(p.changes)||p.changes.length>80||!p.changes.every(c=>c&&PATHS.includes(c.path))))err('proposal.changes의 path를 확인하세요.');
    if(p.draft!==undefined&&(typeof p.draft!=='object'||Array.isArray(p.draft)))err('proposal.draft 형식을 확인하세요.');
  }
  if(v.solve!==undefined&&v.solve!==null){const s=v.solve;if(!Array.isArray(s.statements)||s.statements.length>30||!s.statements.every(x=>x&&str(String(x.target??''),40)&&typeof x.truth==='boolean'))err('solve.statements는 [{target, truth}] 목록이어야 합니다.');if(s.answer!==undefined&&s.answer!==null&&!(Number.isInteger(s.answer)&&s.answer>=1&&s.answer<=5))err('solve.answer는 1~5입니다.');}
  if(v.review!==undefined&&v.review!==null){const a=v.review.axes||{};for(const k of Object.keys(a))if(!AXES.includes(k)||!['pass','issue','unverified'].includes(a[k]?.status))err('review.axes는 curriculum·scope·answer·figure와 pass·issue·unverified만 씁니다.');
    if(v.review.items!==undefined&&(!Array.isArray(v.review.items)||v.review.items.length>40))err('review.items를 확인하세요.');}
  if(v.figures!==undefined&&(!Array.isArray(v.figures)||v.figures.length>6||!v.figures.every(f=>f&&['graph','image'].includes(f.kind)&&str(f.description,3000))))err('figures는 kind(graph|image)와 description이 필요합니다.');
  if(v.evidenceRequests!==undefined&&(!Array.isArray(v.evidenceRequests)||v.evidenceRequests.length>4||!v.evidenceRequests.every(r=>r&&['curriculum','claim','past','textbook'].includes(r.kind)&&str(r.query,300))))err('evidenceRequests를 확인하세요(종류 curriculum·claim·past·textbook, 최대 4개).');
  if(v.evidenceUsed!==undefined&&(!Array.isArray(v.evidenceUsed)||v.evidenceUsed.length>40||!v.evidenceUsed.every(e=>e&&str(String(e.ref??''),200)&&JUDGEMENTS.includes(e.judgement))))err('evidenceUsed의 판정을 확인하세요.');
  if(v.issues!==undefined&&(!Array.isArray(v.issues)||v.issues.length>20||!v.issues.every(x=>str(typeof x==='string'?x:x?.text,1000))))err('issues를 확인하세요.');
  return errors;
}
export function parseAuthoringResponse(text){
  const value=extractJson(text);if(!value)return {ok:false,errors:['응답에서 JSON을 찾지 못했습니다.'],raw:String(text||'').slice(0,4000)};
  const errors=validateResponse(value);return errors.length?{ok:false,errors,value}:{ok:true,value};
}
// 'ㄱ'·'보기 ㄴ'·'①'·'선지 3'·'(가)'·'발문' 같은 사람이 읽는 이름을 실제 구성 키로 바꾼다.
export function resolveTarget(q,label){
  const s=String(label??'').trim();if(!s)return null;
  if(/^(question|문항)$/.test(s))return 'question';
  if(/^(ask|발문)$/.test(s))return 'ask';if(/^(answer|정답)$/.test(s))return 'answer';if(/^(explanation|해설)$/.test(s))return 'explanation';
  if(/^(passage|지문)$/.test(s)){const b=q.blocks.find(b=>b.kind==='text'&&!b.parent);return b?'block:'+b.id:null;}
  // '보기 ㄱ'·'초안 ㄱ'·'(ㄱ)'·'ㄱ.'처럼 앞뒤 말이 붙어도 보기 기호 하나를 찾는다.
  const bogi=q.blocks.find(b=>b.kind==='bogi'),jm=s.replace(/^(보기|초안|변경안|수정안)\s*/,'').match(/^[(（]?([ㄱ-ㅎ])[)）.．]?$/);const j=jm?.[1]||'';
  if(bogi&&j&&JAMO.includes(j)){const l=bogi.lines.find(l=>l.label===j);return l?'line:'+l.id:null;}
  const cm=s.replace(/^(선지|초안|변경안)\s*/,'').replace(/\s*(번|번째)?\s*(선지)?$/,'');const ch=cm;const ci=CIRCLED.indexOf(ch)>=0&&ch.length===1?CIRCLED.indexOf(ch):/^[1-5]$/.test(ch)?Number(ch)-1:-1;
  if(ci>=0)return 'choice:'+q.choices[ci].id;
  const b=q.blocks.find(b=>b.label===s||b.id===s);if(b)return 'block:'+b.id;
  for(const x of q.blocks)for(const l of x.lines||[])if(l.id===s)return 'line:'+l.id;
  const c=q.choices.find(c=>c.id===s);return c?'choice:'+c.id:null;
}
// 새 문항 초안(draft)을 변경 목록으로. 이미 쓴 칸을 지우지 않고 초안에 있는 칸만 바꾼다.
export function draftToChanges(q,d){
  const out=[];
  if(d.type&&d.type!==q.type)out.push({path:'type',value:d.type});
  if(typeof d.passage==='string')out.push({path:'passage',value:d.passage});
  if(typeof d.ask==='string')out.push({path:'ask',value:d.ask});
  if(Array.isArray(d.bogi))out.push({path:'bogi',value:d.bogi.map(String).join('\n')});
  if(Array.isArray(d.choices))out.push({path:'choices',value:d.choices.map(String).join('\n')});
  if(Number.isInteger(d.answer))out.push({path:'answer',value:d.answer});
  for(const k of ['explanation','modelAnswer','intent','standardCode'])if(typeof d[k]==='string')out.push({path:k,value:d[k]});
  if(Number.isFinite(d.points))out.push({path:'points',value:d.points});
  return out;
}
// 변경안을 문항 사본에 적용한다(원본은 그대로). 칸 쓰기는 시트와 같은 writeField를 쓴다.
export function applyChanges(q,changes){
  const next=clone(q),applied=[],errors=[];
  // 합답형 선지는 쓰는 순간 관례 순서로 다시 놓인다. 같은 변경안의 정답 번호는 AI가 쓴 순서 기준이라 옮긴 자리로 바꿔 줘야 한다(M22).
  let choiceMoves=null;
  for(const c of changes){
    try{
      if(c.path==='type')writeField(next,'type',c.value);
      else if(['ask','passage','intent','standardCode','choices','bogi'].includes(c.path)&&c.line===undefined&&c.index===undefined&&c.id===undefined){
        const before=next.choices.map(x=>x.id);writeField(next,c.path,String(c.value??''));
        if(c.path==='choices')choiceMoves=before.map(id=>next.choices.findIndex(x=>x.id===id));}
      else if(c.path==='points')writeField(next,'points',String(c.value));
      else if(c.path==='explanation'||c.path==='modelAnswer')next[c.path]=String(c.value??'');
      else if(c.path==='answer'){const n=Number(c.value);if(next.type==='서술형'){next.modelAnswer=String(c.value);}else{if(!Number.isInteger(n)||n<1||n>5)throw Error('정답은 1~5입니다.');next.answer=choiceMoves?.[n-1]>=0?choiceMoves[n-1]:n-1;}}
      else if(c.path==='choice'||c.path==='choices'){const i=c.id?next.choices.findIndex(x=>x.id===c.id):Number(c.index??c.line);if(!next.choices[i])throw Error('선지 위치를 찾지 못했습니다.');next.choices[i].text=String(c.value??'');}
      else if(c.path==='bogi'){const b=next.blocks.find(b=>b.kind==='bogi');if(!b)throw Error('보기가 없는 문항입니다.');
        if(c.op==='add'){writeField(next,'bogi',[fieldValue(next,'bogi'),String(c.value)].filter(Boolean).join('\n'));}
        else{const i=c.id?b.lines.findIndex(l=>l.id===c.id):typeof c.line==='string'?b.lines.findIndex(l=>l.label===c.line):Number(c.line);if(!b.lines[i])throw Error('보기 항목을 찾지 못했습니다.');b.lines[i].text=String(c.value??'');}}
      else if(c.path==='block'){const b=next.blocks.find(b=>b.id===c.id||b.label===c.id);if(!b||!['text','steps'].includes(b.kind)&&b.kind!=='dialogue')throw Error('글 구성을 찾지 못했습니다.');b.text=String(c.value??'');}
      else if(c.path==='table'){const b=next.blocks.find(b=>(b.id===c.id||b.label===c.id)&&b.kind==='table');if(!b||!Array.isArray(c.cells))throw Error('표를 찾지 못했습니다.');
        const rows=c.cells.length,cols=Math.max(...c.cells.map(r=>r.length));if(rows<1||rows>30||cols<1||cols>12)throw Error('표 크기는 30행·12열까지입니다.');
        b.table.rows=rows;b.table.cols=cols;b.table.cells=c.cells.map(r=>Array.from({length:cols},(_,i)=>({value:String(r[i]??'')})));b.table.merges=[];b.table.headerRows=Math.min(b.table.headerRows,rows);}
      else throw Error('지원하지 않는 변경입니다.');
      applied.push(c);
    }catch(e){errors.push({change:c,message:e.message});}
  }
  return {question:next,applied,errors};
}
const NEGATIVE=/옳지\s*않은|않은\s*것|틀린\s*것|아닌\s*것/;
// 정답 구조 검사(코드로 확인할 수 있는 것만). 과학적 타당성 전체를 인증하지 않는다.
// solve: AI가 제공된 정답에 기대지 않고 다시 푼 결과 {statements:[{target,truth}], answer}.
export function checkAnswerStructure(q,solve=null){
  const problems=[],notes=[];const add=(level,code,text)=>(level==='note'?notes:problems).push({level,code,text});
  const texts=q.choices.map(c=>c.text.trim());
  const dup=texts.filter((t,i)=>t&&texts.indexOf(t)!==i);if(dup.length)add('error','duplicate-choice',`같은 선지가 두 번 이상 있습니다: ${[...new Set(dup)].join(' / ')}`);
  if(q.type!=='서술형'&&q.answer===null)add('warn','no-answer','정답이 비어 있습니다.');
  const negative=NEGATIVE.test(q.ask);if(negative)add('note','negative-ask','부정 발문입니다. 정오를 뒤집어 확인했습니다.');
  if(q.type==='합답형'){
    const bogi=q.blocks.find(b=>b.kind==='bogi');
    if(!/<보기>|〈보기〉/.test(q.ask))add('warn','bogi-ref','합답형 발문에 <보기> 참조가 없습니다.');
    const combos=q.choices.map(c=>comboParts(c.text)?.index?.join(',')??null);
    if(combos.some(c=>c===null))add('warn','non-combo','기호 조합이 아닌 선지가 있습니다.');
    if(solve?.statements?.length&&bogi){
      const truth=new Map();for(const s of solve.statements){const key=resolveTarget(q,s.target);if(key?.startsWith('line:'))truth.set(key.slice(5),!!s.truth);}
      const missing=bogi.lines.filter(l=>!truth.has(l.id));if(missing.length)add('warn','unsolved',`다시 풀지 않은 보기: ${missing.map(l=>l.label).join(', ')}`);
      else{
        const chosen=bogi.lines.map((l,i)=>[i,truth.get(l.id)!==negative]).filter(([,v])=>v).map(([i])=>i);
        const key=chosen.join(','),matches=combos.map((c,i)=>c===key?i:-1).filter(i=>i>=0);
        if(!chosen.length)add('error','empty-combo','다시 푼 결과 고를 보기가 하나도 없습니다.');
        else if(!matches.length)add('error','missing-combo',`다시 푼 정답 조합(${chosen.map(i=>bogi.lines[i].label).join(', ')})이 선지에 없습니다.`);
        else if(matches.length>1)add('error','duplicate-combo','다시 푼 정답 조합이 선지에 두 번 이상 있습니다.');
        else if(q.answer!==null&&q.answer!==matches[0])add('error','answer-mismatch',`입력한 정답 ${CIRCLED[q.answer]}과 다시 푼 정답 ${CIRCLED[matches[0]]}이 다릅니다.`);
        else add('note','combo-ok',`다시 푼 정답 조합이 선지 ${CIRCLED[matches[0]]}에 정확히 한 번 있습니다.`);
      }
    }else add('note','combo-unchecked','다시 푼 결과가 없어 정답 조합은 확인하지 않았습니다.');
  }else if(solve?.answer&&q.answer!==null&&solve.answer-1!==q.answer)add('error','answer-mismatch',`입력한 정답 ${CIRCLED[q.answer]}과 다시 푼 정답 ${CIRCLED[solve.answer-1]}이 다릅니다.`);
  return {ok:!problems.some(p=>p.level==='error'),problems,notes};
}
