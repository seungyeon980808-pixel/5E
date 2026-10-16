import {TYPES,PRESETS,STYLES,newQuestion,applyPreset,block,cellValue,tableCovered} from './model.js';

export const FIELDS=['number','type','preset','style','standardCode','ask','answer','points'];
const answers=['①','②','③','④','⑤'];
export const columnName=c=>{let s='';for(let n=c+1;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
export const address=(r,c)=>columnName(c)+(r+1);
export const rectangle=(a,b)=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];
export function expandRange(range,merges=[]){
  const out=[...range];let changed=true;
  while(changed){changed=false;for(const m of merges){if(m.r>out[2]||m.c>out[3]||m.r+m.rs-1<out[0]||m.c+m.cs-1<out[1])continue;
    const next=[Math.min(out[0],m.r),Math.min(out[1],m.c),Math.max(out[2],m.r+m.rs-1),Math.max(out[3],m.c+m.cs-1)];
    if(next.some((v,i)=>v!==out[i])){out.splice(0,4,...next);changed=true;}
  }}return out;
}
// Excel quotes cells containing tabs, quotes or newlines. Never interpret formula text.
export function parseClipboard(text,{maxRows=500,maxCols=12}={}){
  if(text.length>1024*1024)throw Error('붙여넣을 내용은 1 MB 이하로 나누어 주세요.');
  const rows=[[]];let value='',quoted=false,atStart=true;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){if(ch==='"'){if(text[i+1]==='"'){value+='"';i++;}else quoted=false;}else value+=ch;continue;}
    if(ch==='"'&&atStart){quoted=true;atStart=false;continue;}
    if(ch==='\t'||ch==='\n'||ch==='\r'){
      rows.at(-1).push(value);value='';atStart=true;
      if(ch!=='\t'){if(ch==='\r'&&text[i+1]==='\n')i++;rows.push([]);}continue;
    }value+=ch;atStart=false;
  }
  if(quoted)throw Error('복사한 셀의 따옴표가 닫히지 않았습니다. 엑셀에서 다시 복사하세요.');
  rows.at(-1).push(value);
  if(/[\r\n]$/.test(text)&&rows.at(-1).length===1&&rows.at(-1)[0]==='')rows.pop();
  const width=Math.max(...rows.map(r=>r.length));if(rows.length>maxRows||width>maxCols)throw Error(`붙여넣을 범위는 ${maxRows}행·${maxCols}열 이내로 나누어 주세요.`);
  return rows.map(r=>Array.from({length:width},(_,c)=>r[c]??''));
}
export const encodeClipboard=rows=>rows.map(row=>row.map(v=>{const s=String(v??'');return /[\t\r\n"]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join('\t')).join('\r\n');
export function planPaste(matrix,range,rows,cols){
  const [r,c,er,ec]=range,height=matrix.length,width=matrix[0]?.length||0;
  if(!height||!width)throw Error('붙여넣을 셀 내용이 없습니다.');
  const fill=height===1&&width===1,hh=fill?er-r+1:height,ww=fill?ec-c+1:width;
  if(r+hh>rows||c+ww>cols)throw Error('붙여넣을 범위가 표를 벗어납니다. 행·열을 먼저 추가하세요.');
  const writes=[];for(let y=0;y<hh;y++)for(let x=0;x<ww;x++)writes.push({r:r+y,c:c+x,value:matrix[fill?0:y][fill?0:x]});
  return {writes,range:[r,c,r+hh-1,c+ww-1]};
}
export function gridValue(q,c){const k=FIELDS[c];return k==='answer'?q.type==='서술형'?q.modelAnswer:q.answer===null?'':answers[q.answer]:String(q[k]??'');}
export function applyGridValues(data,scope,writes,{clear=false}={}){
  if(scope.kind==='table'){
    const q=data.questions.find(q=>q.id===scope.questionId),t=scope.tableId==='choices'?q?.choiceTable:q?.blocks.find(b=>b.id===scope.tableId)?.table;
    if(!t)throw Error('편집할 표를 찾지 못했습니다.');
    for(const w of writes){if(w.r<0||w.c<0||w.r>=t.rows||w.c>=t.cols)throw Error('붙여넣을 범위가 표를 벗어납니다.');
      if(tableCovered(t,w.r,w.c)){if(clear)continue;throw Error('병합된 셀을 가로지릅니다. 병합을 풀거나 셀 하나를 선택하세요.');}
      if(writes.length>1&&!clear&&t.merges.some(m=>m.r===w.r&&m.c===w.c))throw Error('병합된 셀을 가로지릅니다. 병합을 풀거나 셀 하나를 선택하세요.');
      if(String(w.value).length>32767)throw Error('한 셀은 32,767자 이하로 입력하세요.');
      t.cells[w.r][w.c].value=clear?'':cellValue(w.value);delete t.cells[w.r][w.c].raw;
    }return;
  }
  const ids=[...scope.ids];
  for(const w of writes){if(!FIELDS[w.c]||w.r<0||w.r>=500)throw Error('문항 500개와 8개 열 안에 붙여넣으세요.');
    if(!ids[w.r]){if(!scope.allowAppend)throw Error('검색을 해제한 뒤 새 행에 붙여넣으세요.');while(ids.length<=w.r){if(data.questions.length>=500)throw Error('문항은 500개까지 만들 수 있습니다.');const q=newQuestion(String(data.questions.length+1));data.questions.push(q);ids.push(q.id);}}
    const q=data.questions.find(q=>q.id===ids[w.r]);if(!q)throw Error('편집할 문항을 찾지 못했습니다.');const key=FIELDS[w.c],value=String(w.value);
    if(clear&&['type','preset','style'].includes(key))continue;
    if(key==='type'){if(!TYPES.includes(value))throw Error('답안형은 객관식·합답형·서술형 중에서 선택하세요.');q.type=value;if(value==='합답형'&&!q.blocks.some(b=>b.kind==='bogi'))q.blocks.push(block('bogi'));}
    else if(key==='preset'){if(!PRESETS.includes(value))throw Error('자료 구성은 셀의 목록에서 선택하세요.');if(q.preset!==value)applyPreset(q,value);}
    else if(key==='style'){if(!STYLES.includes(value))throw Error('선지 표현은 셀의 목록에서 선택하세요.');q.style=value;}
    else if(key==='points'){if(clear)q.points=0;else{const n=Number(value);if(value.trim()===''||!Number.isFinite(n)||n<0||n>10000)throw Error('배점은 0~10,000 사이 숫자로 입력하세요.');q.points=n;}}
    else if(key==='answer'){if(q.type==='서술형')q.modelAnswer=clear?'':value;else{const n=answers.includes(value)?answers.indexOf(value):Number(value)-1;if(clear||value===''||value==='—')q.answer=null;else if(Number.isInteger(n)&&n>=0&&n<5)q.answer=n;else throw Error('정답은 ①~⑤ 또는 1~5로 입력하세요.');}}
    else q[key]=clear?'':value;
  }
}
