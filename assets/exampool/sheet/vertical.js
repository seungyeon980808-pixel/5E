import {TYPES,PRESETS,STYLES,KINDS,block,applyPreset,passageBlocks} from './model.js';

// text: 한글 문서에 글로 나오는 칸(흰색). 나머지(분류·모양 설정·정답·해설 등)는 옅은 회색으로 구분한다.
// A row is a field; a column is one complete question. Compound material stays
// in the ordered document, rather than being flattened into a giant text cell.
export const ROWS=[
  {key:'type',label:'문항유형',options:TYPES},
  {key:'unitLarge',label:'대단원'}, {key:'unitMiddle',label:'중단원'}, {key:'unitSmall',label:'소단원'},
  {key:'standardCode',label:'성취기준'}, {key:'concepts',label:'핵심개념',hint:'쉼표 또는 줄바꿈으로 여러 개 입력'},
  {key:'managementId',label:'문항관리번호'}, {key:'ask',label:'발문',tall:true,text:true},
  {key:'materials',label:'자료',open:'composition',text:true}, {key:'photos',label:'사진',open:'composition'},
  {key:'passage',label:'지문',tall:true,text:true}, {key:'choices',label:'선지',tall:true,text:true}, {key:'bogi',label:'보기',tall:true,text:true},
  {key:'preset',label:'자료 구성',options:PRESETS}, {key:'style',label:'선지 표현',options:STYLES},
  {key:'number',label:'시험지 번호',text:true}, {key:'answer',label:'정답'}, {key:'points',label:'배점'},
  {key:'source',label:'출처'}, {key:'explanation',label:'해설',tall:true}, {key:'intent',label:'출제 의도'}
];
import {stripChoiceLabel,stripBogiLabel,normalizeCombo,orderCombos} from './choice-text.js';
const labels=['①','②','③','④','⑤'];
export function fieldValue(q,key){
  if(key==='concepts')return (q.concepts||[]).join(', ');
  if(key==='materials')return q.blocks.filter(b=>!['text','bogi'].includes(b.kind)).map(b=>{const name=b.label||(b.boxed?'상자':KINDS[b.kind]);return b.kind==='table'?`${name} (${b.table.rows}×${b.table.cols})`:name;}).join(' · ');
  if(key==='photos'){const figures=[...q.blocks.filter(b=>b.figure).map(b=>b.figure),...q.choices.filter(c=>c.figure).map(c=>c.figure),...q.blocks.filter(b=>b.table).flatMap(b=>b.table.cells.flat().filter(c=>c.figure).map(c=>c.figure))];return figures.length?`${figures.length}개 · ${figures.map(f=>f.name).join(', ')}`:'사진 추가…';}
  if(key==='passage')return passageBlocks(q).map(b=>b.text).filter(Boolean).join('\n\n');
  if(key==='choices')return q.style==='대응표'?'선지 대응표 · '+q.choiceTable.cols+'열 (더블클릭하여 편집)':q.choices.map(c=>c.text+(c.figure?' [그림]':'')).join('\n');
  if(key==='bogi')return q.blocks.filter(b=>b.kind==='bogi').flatMap(b=>b.lines.map(l=>l.text)).join('\n');
  if(key==='answer')return q.type==='서술형'?q.modelAnswer:q.answer===null?'':labels[q.answer];
  return String(q[key]??'');
}
export function writeField(q,key,value,{clear=false}={}){
  value=clear?'':String(value);
  if(['materials','photos'].includes(key))throw Error('자료·사진은 셀을 더블클릭해 편집하세요. 글과 그림의 연결을 보존합니다.');
  if(clear&&['type','preset','style'].includes(key))return;
  const row=ROWS.find(r=>r.key===key);if(!row)throw Error('입력 항목을 찾지 못했습니다.');
  if(row.options&&!row.options.includes(value))throw Error(`${row.label}은 셀의 목록에서 선택하세요.`);
  if(key==='type'){q.type=value;if(value==='합답형'&&!q.blocks.some(b=>b.kind==='bogi'))q.blocks.push(block('bogi'));}
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
  }else q[key]=value;
}
export function applyVerticalValues(data,ids,writes,options){
  for(const w of writes){const q=data.questions.find(q=>q.id===ids[w.c]);if(!q)throw Error('문항 열을 먼저 추가하세요.');const key=ROWS[w.r]?.key;if(options?.clear&&(['materials','photos'].includes(key)||key==='choices'&&['대응표','그림·그래프'].includes(q.style)))continue;writeField(q,key,w.value,options);}
}
