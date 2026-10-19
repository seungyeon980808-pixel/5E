import {TYPES,PRESETS,STYLES,KINDS,block,applyPreset,passageBlocks,syncForm} from './model.js';

// text: 한글 문서에 글로 나오는 칸(흰색). 나머지(분류·모양 설정·정답·해설 등)는 옅은 회색으로 구분한다.
// A row is a field; a column is one complete question. Compound material stays
// in the ordered document, rather than being flattened into a giant text cell.
export const ROWS=[
  // 위: 문항을 만들 때 꼭 채우는 칸(평가원 지면 순서: 발문 → 자료 → 지문 → 보기 → 선지). 아래(more): 분류·관리용 칸.
  {key:'type',label:'문항유형',options:TYPES},
  {key:'ask',label:'발문',tall:true,text:true,ph:'학생에게 물을 문장'},
  // 자료: 그림·표 자리마다 상태를 보여 준다. 그림(사진)은 자료의 한 종류라 따로 행을 두지 않는다.
  {key:'materials',label:'자료',open:'composition',text:true},
  {key:'passage',label:'지문',tall:true,text:true,ph:'자료 앞에 오는 설명 글'},
  // 실험 과정·대화는 그 자리가 있는 문항만 쓴다(없으면 회색). 예전 엑셀 파일에는 이 행이 없을 수 있다(optional).
  {key:'steps',label:'실험 과정',tall:true,text:true,optional:true,hint:'한 줄에 과정 하나. (가)·(나)는 적지 않습니다',ph:'한 줄에 과정 하나 · (가)는 적지 않음'}, {key:'dialogue',label:'대화',tall:true,text:true,optional:true,hint:'한 줄에 한 사람. 예: 학생 A: 말',ph:'한 줄에 한 사람 · 학생 A: 말'},
  {key:'bogi',label:'보기',tall:true,text:true,ph:'한 줄에 하나 · ㄱ.은 적지 않음'}, {key:'choices',label:'선지',tall:true,text:true,ph:'다섯 줄 · ①은 적지 않음'},
  {key:'answer',label:'정답',ph:'1~5'}, {key:'points',label:'배점',ph:'숫자'},
  {key:'number',label:'시험지 번호',text:true,more:true},
  {key:'preset',label:'자료 구성',options:PRESETS}, {key:'style',label:'선지 표현',options:STYLES},
  {key:'unitLarge',label:'대단원'}, {key:'unitMiddle',label:'중단원'}, {key:'unitSmall',label:'소단원'},
  {key:'standardCode',label:'성취기준'}, {key:'concepts',label:'핵심개념',hint:'쉼표 또는 줄바꿈으로 여러 개 입력'},
  {key:'managementId',label:'문항관리번호'},
  {key:'source',label:'출처'}, {key:'explanation',label:'해설',tall:true}, {key:'intent',label:'출제 의도'}
];
import {stripChoiceLabel,stripBogiLabel,normalizeCombo,orderCombos} from './choice-text.js';
const labels=['①','②','③','④','⑤'];
export function fieldValue(q,key){
  if(key==='concepts')return (q.concepts||[]).join(', ');
  if(key==='materials'){const slots=q.blocks.filter(b=>b.kind==='figure'||b.kind==='table');return slots.length?slots.map(b=>{const name=b.label||KINDS[b.kind];return b.kind==='table'?`${name} 표 ${b.table.rows}×${b.table.cols}`:b.figure?`${name} 그림 ✓`:`${name} 빈 자리`;}).join(' · '):'+ 자료 추가';}
  if(key==='passage')return passageBlocks(q).map(b=>b.text).filter(Boolean).join('\n\n');
  if(key==='choices')return q.style==='대응표'?'선지 대응표 · '+q.choiceTable.cols+'열 (더블클릭하여 편집)':q.choices.map(c=>c.text+(c.figure?' [그림]':'')).join('\n');
  if(key==='bogi')return q.blocks.filter(b=>b.kind==='bogi').flatMap(b=>b.lines.map(l=>l.text)).join('\n');
  if(key==='steps')return q.blocks.filter(b=>b.kind==='steps').flatMap(b=>b.lines.map(l=>l.text)).join('\n');
  if(key==='dialogue')return q.blocks.filter(b=>b.kind==='dialogue').flatMap(b=>b.lines.map(l=>`${l.label}: ${l.text}`)).join('\n');
  if(key==='answer')return q.type==='서술형'?q.modelAnswer:q.answer===null?'':labels[q.answer];
  return String(q[key]??'');
}
export function writeField(q,key,value,{clear=false}={}){
  value=clear?'':String(value);
  if(key==='materials')throw Error('자료는 칸을 더블클릭해 그림을 가져오거나 표를 만드세요.');
  if(clear&&['type','preset','style'].includes(key))return;
  const row=ROWS.find(r=>r.key===key);if(!row)throw Error('입력 항목을 찾지 못했습니다.');
  if(row.options&&!row.options.includes(value))throw Error(`${row.label}은 셀의 목록에서 선택하세요.`);
  if(key==='type'){q.type=value;if(value==='합답형'&&!q.blocks.some(b=>b.kind==='bogi'))q.blocks.push(block('bogi'));syncForm(q);}
  else if(key==='preset'){if(q.preset!==value)applyPreset(q,value);}
  else if(key==='points'){const n=Number(value);if(!clear&&(value.trim()===''||!Number.isFinite(n)||n<0||n>10000))throw Error('배점은 0~10,000 사이 숫자로 입력하세요.');q.points=n;}
  else if(key==='answer'){if(q.type==='서술형')q.modelAnswer=value;else if(value===''||value==='—')q.answer=null;else{const n=labels.includes(value)?labels.indexOf(value):Number(value)-1;if(!Number.isInteger(n)||n<0||n>4)throw Error('정답은 ①~⑤ 또는 1~5로 입력하세요.');q.answer=n;}}
  else if(key==='concepts')q.concepts=[...new Set(value.split(/[,\n]/).map(s=>s.trim()).filter(Boolean))];
  else if(key==='passage'){
    const existing=passageBlocks(q);if(existing.length>1&&value!==fieldValue(q,key))throw Error('여러 지문이 있는 문항은 구성 편집에서 각각 수정하세요.');
    let b=existing[0];if(!b){b=block('text',null,'지문');q.blocks.unshift(b);}b.text=value;
  }else if(key==='choices'){
    if(q.style==='대응표'||q.style==='그림·그래프')throw Error('표·그림 선지는 구성 편집에서 수정하세요.');
    const lines=value.split(/\r?\n/);if(lines.length>5)throw Error('선지는 다섯 줄로 입력하세요. 여러 문단·그림 선지는 구성 편집에서 수정하세요.');
    q.choices.forEach((c,i)=>c.text=stripChoiceLabel(lines[i]||''));
    if(q.style==='조합'){q.choices.forEach(c=>c.text=normalizeCombo(c.text));const o=orderCombos(q.choices,q.answer);q.choices=o.choices;q.answer=o.answer;}
  }else if(key==='bogi'){
    let b=q.blocks.find(b=>b.kind==='bogi');if(!b){b=block('bogi');q.blocks.push(b);}
    const lines=value?value.split(/\r?\n/):[];if(lines.length>30)throw Error('보기는 30개까지 입력하세요.');
    b.lines=lines.map((text,i)=>({...b.lines[i]||{id:crypto.randomUUID(),label:['ㄱ','ㄴ','ㄷ','ㄹ','ㅁ'][i]||String(i+1)},text:stripBogiLabel(text)}));
    const live=new Set(q.blocks.flatMap(b=>b.lines?.map(l=>l.id)||[]));q.references=q.references.filter(r=>!/^[-\w]+$/.test(r.target)||!r.target||q.blocks.some(b=>b.id===r.target)||q.choices.some(c=>c.id===r.target)||live.has(r.target)||['question','ask','passage','bogi'].includes(r.target));
  }else if(key==='steps'||key==='dialogue'){
    const blocks=q.blocks.filter(b=>b.kind===key);
    if(!blocks.length){if(!value.trim())return;throw Error(key==='steps'?'이 문항에는 실험 과정 자리가 없습니다. 구성 시트의 「+ 구성 추가」로 실험 과정을 넣으세요.':'이 문항에는 대화 자리가 없습니다. 구성 시트의 「+ 구성 추가」로 대화를 넣으세요.');}
    if(blocks.length>1&&value!==fieldValue(q,key))throw Error('같은 종류 구성이 여러 개인 문항은 구성 시트·한글 창에서 고치세요.');
    const b=blocks[0],lines=value?value.split(/\r?\n/):[];if(lines.length>30)throw Error('30줄까지 입력하세요.');
    const CAP=['(가)','(나)','(다)','(라)','(마)','(바)','(사)','(아)'];
    b.lines=lines.map((line,i)=>{const old=b.lines[i]||{id:crypto.randomUUID(),label:key==='steps'?CAP[i]||`(${i+1})`:`학생 ${'ABCDEFGH'[i]||i+1}`};
      if(key==='steps')return {...old,text:line.replace(/^\s*\([가-힣]\)\s*/,'')};
      const m=line.match(/^\s*([^:：]{1,20})\s*[:：]\s*(.*)$/);return m?{...old,label:m[1].trim(),text:m[2]}:{...old,text:line};});
  }else{q[key]=value;if(key==='style')syncForm(q);}
}
export function applyVerticalValues(data,ids,writes,options){
  for(const w of writes){const q=data.questions.find(q=>q.id===ids[w.c]);if(!q)throw Error('문항 열을 먼저 추가하세요.');const key=ROWS[w.r]?.key;if(options?.clear&&(key==='materials'||key==='choices'&&['대응표','그림·그래프'].includes(q.style)))continue;writeField(q,key,w.value,options);}
}
