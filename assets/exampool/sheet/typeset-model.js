import {exportLayoutHwpx,restackPictureLines} from './native-hwpx.js?v=1014-compact-panel';
export const PAPER_MM={A4:[210,297],B4:[257,364],A3:[297,420]};
export const LAYOUT_VERSION=11;
// 평가원 본문 글자: 장평 95%·자간 -5%(같은 글자 크기에서 한 줄에 약 10% 더 들어간다). 새로 조판하는 문항에만 건다.
export const TEXT_RATIO=95,TEXT_SPACING=-5,TEXT_WIDTH=(TEXT_RATIO+TEXT_SPACING)/100;
const HU=7200/25.4;
export function pageProfile(profile={paper:'A4',columns:2}){
  if(!PAPER_MM[profile.paper]||![1,2].includes(profile.columns))throw Error('용지와 단 수를 확인하세요.');
  const [w,h]=PAPER_MM[profile.paper],margin=15,spacing=8;
  return {page:{width:Math.round(w*HU),height:Math.round(h*HU),marginLeft:Math.round(margin*HU),marginRight:Math.round(margin*HU),marginTop:Math.round(margin*HU),marginBottom:Math.round(margin*HU),marginHeader:0,marginFooter:0,marginGutter:0,landscape:false},spacing:Math.round(spacing*HU),width:Math.floor(((w-2*margin-(profile.columns-1)*spacing)/profile.columns)*HU/75)-8};
}
// 한글 문서에 실제로 나오는 값: 번호·유형·선지 표현·발문·구성·선지·선지표·선지 배열·[3점].
// 단원·성취기준·정답·배점·출처·해설·문항 상태는 조판에 영향이 없으므로 바꿔도 한글 창을 다시 그리지 않는다.
// 배점은 3점일 때만 [3점]으로 찍힌다. 그때만 지문에 넣어 다른 문항의 저장한 조판 지문은 그대로 둔다.
export const renderedContent=q=>({number:q.number,type:q.type,style:q.style,ask:q.ask,blocks:q.blocks,choices:q.choices,choiceTable:q.choiceTable,choiceLayout:q.choiceLayout,...(q.points===3?{pointsMark:3}:{})});
const sha256=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(v=>v.toString(16).padStart(2,'0')).join('');
export const questionFingerprint=q=>sha256(JSON.stringify(renderedContent(q)));
// 이전 판은 조판과 상관없는 칸까지 지문에 넣었다. 그때 저장한 조판도 내용이 같으면 그대로 인정한다.
const legacyFingerprint=q=>{const {typeset,references,workflow,...rest}=q;return sha256(JSON.stringify(rest));};
export async function typesetMatches(typeset,q){return !!typeset&&(typeset.fingerprint===await questionFingerprint(q)||typeset.fingerprint===await legacyFingerprint(q));}
export const toBase64=bytes=>{let raw='';for(let i=0;i<bytes.length;i+=32768)raw+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(raw);};
export const fromBase64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export const mathParts=value=>String(value).split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\{\{수식:[\s\S]+?\}\})/g).filter(Boolean).map(text=>{
  const math=text.startsWith('$')||text.startsWith('\\(')||text.startsWith('{{수식:');
  return {math,text:math?text.startsWith('$$')?text.slice(2,-2):text.startsWith('$')?text.slice(1,-1):text.startsWith('\\(')?text.slice(2,-2):text.slice(5,-2):text};
});

export async function normalizeQuestionImport(bytes,JSZip){
  const zip=await JSZip.loadAsync(new Uint8Array(bytes));
  // The HTML importer adds a 20px indent to table anchor paragraphs, and
  // parses CSS cell padding but leaves hasMargin off. Correct only this newly
  // generated question document, before the user starts editing its layout.
  let header=await zip.file('Contents/header.xml').async('string');
  header=header.replace(/<hc:(left|right|intent) value="\d+"/g,'<hc:$1 value="0"');
  // 한글 줄 나눔은 평가원처럼 어절 단위(KEEP_WORD). 들여온 문단 모양 일부가 글자 단위(BREAK_WORD)로 들어온다.
  header=header.replace(/breakNonLatinWord="BREAK_WORD"/g,'breakNonLatinWord="KEEP_WORD"');
  header=header.replace(/<hh:ratio\b[^>]*\/>/g,tag=>tag.replace(/="\d+"/g,`="${TEXT_RATIO}"`)).replace(/<hh:spacing\b[^>]*\/>/g,tag=>tag.replace(/="-?\d+"/g,`="${TEXT_SPACING}"`));
  let xml=await zip.file('Contents/section0.xml').async('string');
  // Center the table's anchor paragraph, including nested tables. Cell text
  // alignment alone does not position an inline table. Clone the styles so
  // neighboring prose keeps its own alignment.
  const styles=new Map([...header.matchAll(/<hh:paraPr\b[^>]*\bid="(\d+)"[\s\S]*?<\/hh:paraPr>/g)].map(m=>[m[1],m[0]]));
  let nextId=Math.max(...[...styles.keys()].map(Number))+1;const clones=new Map(),stack=[],anchors=new Set();
  for(const token of xml.matchAll(/<hp:p\b[^>]*>|<\/hp:p>|<hp:tbl\b/g)){
    if(token[0].startsWith('<hp:p '))stack.push(token.index);
    else if(token[0]==='</hp:p>')stack.pop();
    else if(stack.length)anchors.add(stack.at(-1));
  }
  xml=xml.replace(/<hp:p\b[^>]*>/g,(tag,offset)=>{
    if(!anchors.has(offset))return tag;
    const old=tag.match(/paraPrIDRef="(\d+)"/)?.[1];
    if(!styles.has(old))throw Error('표 위치를 지정할 문단을 찾지 못했습니다.');
    if(!clones.has(old)){const id=String(nextId++);clones.set(old,id);const style=styles.get(old).replace(/\bid="\d+"/,`id="${id}"`).replace(/horizontal="[^"]*"/,'horizontal="CENTER"');header=header.replace('</hh:paraProperties>',style+'</hh:paraProperties>');}
    return tag.replace(/paraPrIDRef="\d+"/,`paraPrIDRef="${clones.get(old)}"`);
  });
  // 표 칸의 가운데 문단(자료표 칸 글)은 줄 간격 130%로. HTML의 line-height는 한글 엔진이 받지 않아 모두 160%로 들어온다.
  // 표를 품은 문단(겹친 표 자리)은 그대로 둔다.
  const spacing=new Map();{const open=[];let depth=0;const marks=[];
    for(const token of xml.matchAll(/<hp:subList\b[^>]*>|<\/hp:subList>|<hp:p\b[^>]*>|<\/hp:p>|<hp:tbl\b/g)){
      const t=token[0];
      if(t.startsWith('<hp:subList'))depth++;else if(t==='</hp:subList>')depth--;
      else if(t.startsWith('<hp:p ')){open.push({index:token.index,tag:t,depth,table:false});}
      else if(t==='</hp:p>'){const p=open.pop();if(p&&p.depth>0&&!p.table)marks.push(p);}
      else if(open.length)open.at(-1).table=true;
    }
    const center=new Set([...styles.entries()].filter(([,v])=>/horizontal="CENTER"/.test(v)).map(([k])=>k));
    for(const p of marks.sort((a,b)=>b.index-a.index)){
      const old=p.tag.match(/paraPrIDRef="(\d+)"/)?.[1];if(!center.has(old))continue;
      if(!spacing.has(old)){const id=String(nextId++);spacing.set(old,id);header=header.replace('</hh:paraProperties>',styles.get(old).replace(/\bid="\d+"/,`id="${id}"`).replace(/(<hh:lineSpacing type="PERCENT" value=")\d+/g,'$1130')+'</hh:paraProperties>');}
      xml=xml.slice(0,p.index)+p.tag.replace(/paraPrIDRef="\d+"/,`paraPrIDRef="${spacing.get(old)}"`)+xml.slice(p.index+p.tag.length);
    }
  }
  header=header.replace(/(<hh:paraProperties\b[^>]*itemCnt=")\d+"/,`$1${styles.size+clones.size+spacing.size}"`);
  zip.file('Contents/header.xml',header);
  xml=xml.replace(/<hp:tc\b[^>]*>/g,tag=>tag.replace(/hasMargin="0"/,'hasMargin="1"'));
  xml=xml.replace(/<hp:tbl\b[\s\S]*?(?=<hp:tr>)/g,tag=>tag.replace(/<hp:outMargin\b[^>]*>/,margin=>margin.replace(/\b(left|right)="\d+"/g,'$1="0"')));
  // 가운데 그림 문단의 빠진 줄 배치를 채운다(없으면 다시 열 때 그림이 사라진다).
  xml=restackPictureLines(xml);
  zip.file('Contents/section0.xml',xml);
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}

// 자료 표·그림이 있는 문단(글이 없는 문단)도 찾는다.
const controlParas=(document,sec)=>{const set=new Set();for(let p=0;p<document.pageCount();p++)for(const c of JSON.parse(document.getPageControlLayout(p)).controls||[])if(c.secIdx===sec&&!(c.cellPath||[]).length)set.add(c.paraIdx);return [...set];};
// 상자·묶음 칸 안 그림 가운데(사용자 결정: 그림은 무조건 가운데). HTML에서 칸 안 그림을 가운데 문단으로 감싸면 한글 엔진이 줄 배치를 빠뜨리므로,
// 한글 문서를 만든 뒤 칸 안에서 '그림만 있는 문단'의 정렬만 가운데로 바꾼다. 글과 함께 있는 그림·떠 있는 그림은 건드리지 않는다.
export function centerCellPictures(document){
  const key=(s,p,path)=>`${s}:${p}:${JSON.stringify((path||[]).map(c=>[c.controlIndex??c.controlIdx,c.cellIndex??c.cellIdx,c.cellParaIndex??c.cellParaIdx]))}`;
  const texted=new Set(),targets=new Map();
  for(let page=0;page<document.pageCount();page++){
    for(const r of JSON.parse(document.getPageTextLayout(page)).runs||[])if(r.cellPath?.length&&String(r.text||'').trim())texted.add(key(r.secIdx,r.paraIdx,r.cellPath));
    const layout=document.getPageControlLayout(page),controls=(typeof layout==='string'?JSON.parse(layout):layout).controls||[];
    for(const c of controls)if(c.type==='image'&&c.cellPath?.length===1)targets.set(key(c.secIdx,c.paraIdx,c.cellPath),c);
  }
  let n=0;
  for(const [k,c] of targets){if(texted.has(k))continue;const cell=c.cellPath[0];
    try{document.applyParaFormatInCell(c.secIdx,c.paraIdx,cell.controlIndex??cell.controlIdx,cell.cellIndex??cell.cellIdx,cell.cellParaIndex??cell.cellParaIdx,JSON.stringify({alignment:'center'}));n++;}catch{}}
  if(n)document.reflowLinesegs?.();
  return n;
}
export function applyQuestionIndent(document,number,{body=false,askLead='',askIndent=0}={}){
  if(!number)return;
  const prefix=`${number}. `;
  for(let page=0;page<document.pageCount();page++){
    const run=JSON.parse(document.getPageTextLayout(page)).runs.find(r=>r.charStart===0&&r.text.startsWith(prefix)||!r.cellPath?.length&&r.text.startsWith(prefix));
    if(!run)continue;
    // 글 옆 자료처럼 번호가 표 칸 안에 있으면 칸 문단은 내어쓰기를 건드리지 않는다.
    if(run.cellPath?.length)return;
    // 어울림 그림이 문단 맨 앞에 있으면 번호 글은 그 뒤에서 시작한다.
    const at=run.charStart||0,start=JSON.parse(document.getCursorRect(run.secIdx,run.paraIdx,at)),end=JSON.parse(document.getCursorRect(run.secIdx,run.paraIdx,at+prefix.length)),hang=Math.round((end.x-start.x)*150);
    document.applyParaFormat(run.secIdx,run.paraIdx,JSON.stringify({indent:-hang}));
    // 평가원 지면: 번호 다음 문단(자료 표·발문·<보기>·선지)은 모두 번호 너비만큼 들어가 시작한다. 발문 첫 줄은 한 글자 더.
    if(body){
      const lead=String(askLead||'').replace(/\s+/g,''),count=document.getParagraphCount?.(run.secIdx);
      const texts=new Map();for(let p=0;p<document.pageCount();p++)for(const r of JSON.parse(document.getPageTextLayout(p)).runs)if(!r.cellPath?.length&&r.secIdx===run.secIdx)texts.set(r.paraIdx,(texts.get(r.paraIdx)||'')+r.text);
      const last=Number.isInteger(count)?count-1:Math.max(run.paraIdx,...texts.keys(),...controlParas(document,run.secIdx));
      for(let para=run.paraIdx+1;para<=last;para++){
        const isAsk=!!lead&&String(texts.get(para)||'').replace(/\s+/g,'').startsWith(lead);
        document.applyParaFormat(run.secIdx,para,JSON.stringify(isAsk?{marginLeft:hang,indent:Math.round(askIndent*150)}:{marginLeft:hang}));
      }
    }
    document.reflowLinesegs();return;
  }
  throw Error('문항 번호 뒤의 들여쓰기 위치를 찾지 못했습니다.');
}

// Set defaults only on a newly imported question, never on a saved layout.
// CSS and native setters scale cell indents differently. Measure the real
// label, then clone its HWPX paragraph style; this also handles nested boxes,
// which the pinned engine's paragraph-format command does not support.
export async function applyReferenceBogiIndent(document,JSZip,CFB=globalThis.XLSX?.CFB){
  const runs=[];
  for(let page=0;page<document.pageCount();page++)runs.push(...JSON.parse(document.getPageTextLayout(page)).runs);
  const tableKey=r=>JSON.stringify([r.secIdx,r.parentParaIdx,r.cellPath.slice(0,-1),r.cellPath.at(-1).controlIndex]);
  const boxes=new Set(runs.filter(r=>r.cellPath?.length&&r.text==='<보 기>').map(tableKey)),indents=new Map();
  const paraKey=(sec,parent,path)=>JSON.stringify([sec,parent,path]);
  for(const run of runs){
    if(!run.cellPath?.length||run.charStart!==0)continue;
    const bogi=run.cellPath.at(-1).cellIndex===5&&boxes.has(tableKey(run));
    // 빈 줄은 「ㄱ.」 뒤 칸이 줄바꿈 없는 공백(nbsp)으로 온다 — 그 경우도 찾아야 새 문항부터 내어쓰기가 걸린다.
    const prefix=run.text.match(bogi?/^[ㄱ-ㅎ]\.[ \u00a0]/:/^(?:[①-⑤]|\([가-힣]\))[ \u00a0]/)?.[0];if(!prefix)continue;
    const path=JSON.stringify(run.cellPath),start=JSON.parse(document.getCursorRectByPath(run.secIdx,run.parentParaIdx,path,0)),end=JSON.parse(document.getCursorRectByPath(run.secIdx,run.parentParaIdx,path,prefix.length));
    indents.set(paraKey(run.secIdx,run.parentParaIdx,run.cellPath),-Math.round((end.x-start.x)*75));
  }
  const bytes=CFB?exportLayoutHwpx(document,CFB):document.exportHwpx();
  const zip=await JSZip.loadAsync(new Uint8Array(bytes));
  let header=await zip.file('Contents/header.xml').async('string'),xml=await zip.file('Contents/section0.xml').async('string');
  const styles=new Map([...header.matchAll(/<hh:paraPr\b[^>]*\bid="(\d+)"[\s\S]*?<\/hh:paraPr>/g)].map(m=>[m[1],m[0]]));
  let nextId=Math.max(...[...styles.keys()].map(Number))+1;
  const clones=new Map(),tags=new Map(),ranges=[],lists=[{next:0,path:[]}],paras=[],tables=[];
  // Walk native paragraph/cell addresses rather than matching their text.
  // Identical statements in another table must retain their own formatting.
  for(const token of xml.matchAll(/<\/?hp:(p|tbl|tc|pic|equation)\b[^>]*>/g)){
    const [tag,kind]=token,closing=tag.startsWith('</');
    if(kind==='p'){
      if(closing){const para=paras.pop();if(!para.path.length&&para.table){const lastRun=xml.lastIndexOf('</hp:run>',token.index),tail=xml.slice(lastRun+9,token.index),line=tail.match(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/);if(line){const start=lastRun+9+line.index;ranges.push({start,end:start+line[0].length,text:''});}}continue;}
      const list=lists.at(-1),index=list.next++,path=list.path.map(v=>({...v}));if(path.length)path.at(-1).cellParaIndex=index;
      const para={index,path,parent:path.length?list.parent:index,controls:0};paras.push(para);
      const indent=indents.get(paraKey(0,para.parent,path));if(indent===undefined)continue;
      const old=tag.match(/paraPrIDRef="(\d+)"/)?.[1],key=JSON.stringify([old,indent]);if(!styles.has(old))throw Error('보기의 문단 서식을 찾지 못했습니다.');
      if(!clones.has(key)){
        const id=String(nextId++);clones.set(key,id);
        const style=styles.get(old).replace(/\bid="\d+"/,`id="${id}"`).replace(/<hc:intent\b[^>]*>/g,t=>t.replace(/value="-?\d+"/,`value="${t.includes('unit="CHAR"')?Math.floor(indent/2):indent}"`));
        header=header.replace('</hh:paraProperties>',style+'</hh:paraProperties>');
      }
      tags.set(token.index,tag.replace(/paraPrIDRef="\d+"/,`paraPrIDRef="${clones.get(key)}"`));indents.delete(paraKey(0,para.parent,path));
    }else if(kind==='tbl'){
      if(closing)tables.pop();else{paras.at(-1).table=true;tables.push({para:paras.at(-1),control:paras.at(-1).controls++,nextCell:0});}
    }else if(kind==='tc'){
      if(closing)lists.pop();else{const table=tables.at(-1);lists.push({next:0,parent:table.para.parent,path:[...table.para.path,{controlIndex:table.control,cellIndex:table.nextCell++,cellParaIndex:0}]});}
    }else if(!closing)paras.at(-1).controls++;
  }
  if(indents.size)throw Error('보기의 줄 맞춤 위치를 모두 찾지 못했습니다.');
  for(const [start,text] of tags){const end=xml.indexOf('>',start)+1;ranges.push({start,end,text});}
  // Imported table-anchor line positions still include the former equation
  // marker lengths. Drop only root anchor segments, keeping all cell and
  // equation geometry, so the native engine places tables in the current flow.
  for(const edit of ranges.sort((a,b)=>b.start-a.start))xml=xml.slice(0,edit.start)+edit.text+xml.slice(edit.end);
  header=header.replace(/(<hh:paraProperties\b[^>]*itemCnt=")\d+"/,`$1${styles.size+clones.size}"`);
  zip.file('Contents/header.xml',header);zip.file('Contents/section0.xml',xml);
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}

// 한글 엔진은 아래·위 첨자 묶음 바로 뒤의 글자까지 첨자로 읽는다(T_{1}=\frac… 가 T 아래에 모두 붙음).
// 닫는 괄호 뒤에 띄어쓰기를 하나 둔다. LaTeX·한글 수식 모두 띄어쓰기는 구분 기호일 뿐 모양을 바꾸지 않는다.
export function normalizeEquationScript(script){
  const s=String(script);let out='';
  for(let i=0;i<s.length;i++){
    out+=s[i];
    if((s[i]==='_'||s[i]==='^')&&s[i+1]==='{'){
      let depth=0,j=i+1;for(;j<s.length;j++){if(s[j]==='\\'){j++;continue;}if(s[j]==='{')depth++;else if(s[j]==='}'&&--depth===0)break;}
      if(j>=s.length)continue;
      out+=s.slice(i+1,j+1);i=j;
      const next=s[j+1];if(next!==undefined&&!/[\s}_^]/.test(next))out+=' ';
    }
  }
  return out;
}
// The native engine accepts both LaTeX and Hancom equation scripts. Generate
// each equation with that engine, then place its native HWPX control in the
// original paragraph/cell. Equations never become bitmap pictures.
export async function materializeEquations(Document,JSZip,bytes,equations,CFB=globalThis.XLSX?.CFB){
  if(!equations.length)return bytes;
  const zip=await JSZip.loadAsync(new Uint8Array(bytes));let xml=await zip.file('Contents/section0.xml').async('string');
  for(const [i,eq] of equations.entries()){
    if(eq.script.length>8000)throw Error('수식은 8,000자 이내로 입력하세요.');
    const temp=Document.createEmpty();let control;
    try{temp.createBlankDocument();const result=JSON.parse(temp.insertEquation(0,0,0,normalizeEquationScript(eq.script),eq.fontSize||1100,0));if(!result.ok)throw Error('수식을 읽지 못했습니다.');const ez=await JSZip.loadAsync(new Uint8Array(temp.exportHwpx())),exml=await ez.file('Contents/section0.xml').async('string');control=exml.match(/<hp:equation\b[\s\S]*?<\/hp:equation>/)?.[0];}finally{temp.free();}
    if(!control)throw Error('한글 수식 개체를 만들지 못했습니다.');
    control=control.replace(/\bid="\d+"/,`id="${1300000000+i}"`);
    if(!xml.includes(eq.marker))throw Error('수식의 원래 입력 위치를 찾지 못했습니다.');
    // Markers contain only ASCII and cannot be fragmented by XML escaping.
    xml=xml.replace(eq.marker,`</hp:t>${control}<hp:t>`);
  }
  zip.file('Contents/section0.xml',xml);
  const native=new Document(await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}));
  try{
    // Replacing a long text marker with a native equation invalidates the
    // imported line offsets, widths and heights. Reflow with the equation's
    // real geometry before showing or saving the first preview.
    native.reflowLinesegs();return exportLayoutHwpx(native,CFB);
  }finally{native.free();}
}

// 표 칸(보기 상자·선지·표·상자) 문단: 한글 엔진은 칸 안 줄 높이에 수식 높이를 넣지 않아 분수가 아랫줄과 겹치고,
// 줄바꿈이 있어도 들여온 줄 배치가 한 줄뿐이면 칸 높이를 한 줄로 잡아 글이 칸 밖으로 넘친다.
// 칸 안 글은 조판할 때 어절 단위로 직접 나눠 두었으므로(줄바꿈), 줄마다 가장 큰 수식 높이로 줄 배치를 써 준다.
// 글자 위치: 글자 1, 줄바꿈 1, 수식·탭 같은 조판 부호 8(한글 문서 규칙).
export function cellEquationLines(xml){
  const paragraphs=[],stack=[];
  for(const m of xml.matchAll(/<hp:p\b[^>]*>|<\/hp:p>/g)){
    if(m[0].startsWith('</')){const p=stack.pop();if(p)p.end=m.index;}
    else{const p={body:m.index+m[0].length,depth:stack.length};paragraphs.push(p);stack.push(p);}
  }
  const num=(tag,key)=>Number(tag.match(new RegExp(`\\b${key}="(-?\\d+)"`))?.[1]);
  let output=xml;
  for(let i=paragraphs.length-1;i>=0;i--){
    const p=paragraphs[i];if(!p.depth||p.end===undefined)continue;
    const body=xml.slice(p.body,p.end);
    if(!body.includes('<hp:equation')&&!body.includes('<hp:lineBreak')||body.includes('<hp:p ')||body.includes('<hp:tbl'))continue;
    const first=body.match(/<hp:lineseg\b[^>]*>/)?.[0];if(!first)continue;
    const base={vertpos:num(first,'vertpos'),vertsize:num(first,'vertsize'),baseline:num(first,'baseline'),spacing:num(first,'spacing'),horzpos:num(first,'horzpos'),horzsize:num(first,'horzsize'),flags:num(first,'flags')};
    if(Object.values(base).some(v=>!Number.isFinite(v))||base.vertsize<=0)continue;
    const content=body.replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/g,'');
    const lines=[{start:0,tall:0}];let pos=0;
    for(const t of content.matchAll(/<hp:equation\b[\s\S]*?<\/hp:equation>|<hp:lineBreak\/>|<hp:(?:tab|pic|ctrl)\b[^>]*?(?:\/>|>[\s\S]*?<\/hp:(?:tab|pic|ctrl)>)|(?<=>)([^<]+)(?=<)/g)){
      if(t[0].startsWith('<hp:equation')){pos+=8;lines.at(-1).tall=Math.max(lines.at(-1).tall,num(t[0].match(/<hp:sz\b[^>]*>/)?.[0]||'','height')||0);}
      else if(t[0]==='<hp:lineBreak/>'){pos+=1;lines.push({start:pos,tall:0});}
      else if(/^<hp:(tab|pic|ctrl)\b/.test(t[0]))pos+=8;
      else if(t[1]!==undefined)pos+=t[1].replace(/&(?:#\d+|#x[\da-f]+|[a-z]+);/gi,'x').length;
    }
    // 줄 배치가 이미 줄마다 있으면(엔진이 계산) 두고, 높은 수식도 줄바꿈도 없으면 그대로 둔다.
    const segCount=(body.match(/<hp:lineseg\b/g)||[]).length;
    if(!lines.some(l=>l.tall>base.vertsize)&&(lines.length<2||segCount>=lines.length))continue;
    let vert=base.vertpos;
    const segs=lines.map(l=>{const h=Math.max(base.vertsize,l.tall),baseline=Math.round(h*base.baseline/base.vertsize);
      const seg=`<hp:lineseg textpos="${l.start}" vertpos="${vert}" vertsize="${h}" textheight="${h}" baseline="${baseline}" spacing="${base.spacing}" horzpos="${base.horzpos}" horzsize="${base.horzsize}" flags="${base.flags}"/>`;vert+=h+base.spacing;return seg;}).join('');
    output=output.slice(0,p.body)+content+`<hp:linesegarray>${segs}</hp:linesegarray>`+output.slice(p.end);
  }
  return output;
}
export async function applyCellEquationLines(bytes,JSZip){
  const zip=await JSZip.loadAsync(new Uint8Array(bytes)),file=zip.file('Contents/section0.xml'),xml=await file.async('string'),next=cellEquationLines(xml);
  if(next===xml)return bytes;
  zip.file('Contents/section0.xml',next);return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}

// 어울림: 글 문단 맨 앞에 넣은 그림을 떠 있는 그림(문단 기준 오른쪽·왼쪽, 본문이 옆·아래로 흐름)으로 바꾼다.
// 어느 그림인지는 그림 내용(바이트)으로 찾는다. 표 칸 안 그림은 대상이 아니다. 줄 배치는 부르는 쪽에서 다시 계산한다.
export function applyFloatingPictures(document,floats){
  if(!floats?.length)return;
  const want=floats.map(f=>({align:f.align==='Left'?'Left':'Right',bytes:Uint8Array.from(atob(String(f.data).split(',')[1]||''),c=>c.charCodeAt(0)),done:false}));
  const seen=new Set();
  for(let page=0;page<document.pageCount();page++)for(const c of JSON.parse(document.getPageControlLayout(page)).controls||[]){
    if(c.type!=='image'||c.cellPath?.length)continue;
    const key=`${c.secIdx}:${c.paraIdx}:${c.controlIdx}`;if(seen.has(key))continue;seen.add(key);
    const data=document.getControlImageData(c.secIdx,c.paraIdx,'[]',c.controlIdx),f=want.find(f=>!f.done&&f.bytes.length===data.length&&f.bytes.every((b,i)=>b===data[i]));
    if(!f)continue;f.done=true;
    const result=JSON.parse(document.setPictureProperties(c.secIdx,c.paraIdx,c.controlIdx,JSON.stringify({treatAsChar:false,textWrap:'Square',horzRelTo:'Para',horzAlign:f.align,vertRelTo:'Para',vertAlign:'Top',vertOffset:0,horzOffset:0,outerMarginLeft:f.align==='Right'?250:0,outerMarginRight:f.align==='Left'?250:0})));
    if(result?.ok===false)throw Error('어울림 그림을 배치하지 못했습니다.');
  }
  if(want.some(f=>!f.done))throw Error('어울림 그림을 문단에서 찾지 못했습니다.');
}
// 어울림 그림을 놓은 뒤의 줄 배치 점검. 한글 엔진은 그림 높이 안에 든 두 줄짜리 문단을 그림 반대쪽으로 밀어 잘못 흐르게 한다.
// 그림이 붙은 문단이 그림과 겹치거나 그림보다 짧으면(다음 문단도 그림 옆에 와야 함) 엔진의 어울림 대신
// 그림은 글 앞(단 기준 정렬)에 두고, 그림 옆에서 시작하는 문단마다 오른쪽(왼쪽) 여백을 그림 폭만큼 둔다(평가원처럼 발문도 그림 옆).
// 표·그림 문단이 그림 옆에서 시작하면 앞 문단 아래 간격을 둬서 그림 밑으로 보낸다. 문단 모양 단위: 여백·간격은 px×150.
export function settleFloatingPictures(document){
  const GAP=4,pics=[];
  for(let page=0;page<document.pageCount();page++)for(const c of JSON.parse(document.getPageControlLayout(page)).controls||[]){
    if(!['image','table'].includes(c.type)||c.cellPath?.length)continue;
    const props=JSON.parse(c.type==='image'?document.getPictureProperties(c.secIdx,c.paraIdx,c.controlIdx):document.getTableProperties(c.secIdx,c.paraIdx,c.controlIdx));if(props.treatAsChar)continue;
    if(pics.some(p=>p.type===c.type&&p.para===c.paraIdx&&p.ci===c.controlIdx))continue;
    pics.push({page,type:c.type,sec:c.secIdx,para:c.paraIdx,ci:c.controlIdx,props});
  }
  if(!pics.length)return false;
  const box=p=>(JSON.parse(document.getPageControlLayout(p.page)).controls||[]).find(c=>c.type===p.type&&c.secIdx===p.sec&&c.paraIdx===p.para&&c.controlIdx===p.ci);
  const setProps=(p,v)=>p.type==='image'?document.setPictureProperties(p.sec,p.para,p.ci,JSON.stringify(v)):document.setTableProperties(p.sec,p.para,p.ci,JSON.stringify(v));
  const lines=(p,para)=>{const m=new Map();for(const r of JSON.parse(document.getPageTextLayout(p.page)).runs){if(r.cellPath?.length||r.secIdx!==p.sec||r.paraIdx!==para||!r.text.trim())continue;const k=Math.round(r.y*10),v=m.get(k)||{y:r.y,h:0,x0:Infinity,x1:-Infinity};v.h=Math.max(v.h,r.h);v.x0=Math.min(v.x0,r.x);v.x1=Math.max(v.x1,r.x+r.w);m.set(k,v);}return [...m.values()];};
  const controlParas=p=>new Set((JSON.parse(document.getPageControlLayout(p.page)).controls||[]).filter(c=>!c.cellPath?.length&&c.secIdx===p.sec&&(c.type==='table'||c.type==='image')).map(c=>c.paraIdx));
  const bottomOf=ls=>ls.length?Math.max(...ls.map(l=>l.y+l.h)):-Infinity;
  const space=(p,para,needed)=>{const props=JSON.parse(document.getParaPropertiesAt(p.sec,para));document.applyParaFormat(p.sec,para,JSON.stringify({spacingAfter:Math.round(((props.spacingAfter||0)/2+needed)*150)}));document.reflowLinesegs();};
  const count=document.getParagraphCount?.(pics[0].sec);
  for(const p of pics){
    const right=p.props.horzAlign!=='Left';let b=box(p);if(!b)continue;
    const own=lines(p,p.para),overlaps=own.some(l=>l.y<b.y+b.h&&l.y+l.h>b.y&&(right?l.x1>b.x+1:l.x0<b.x+b.w-1));
    if(!overlaps&&bottomOf(own)+GAP>=b.y+b.h)continue;
    const room=b.w+((right?p.props.outerMarginLeft:p.props.outerMarginRight)||0)/75+GAP+2;
    const narrow=para=>{const props=JSON.parse(document.getParaPropertiesAt(p.sec,para));document.applyParaFormat(p.sec,para,JSON.stringify(right?{marginRight:Math.round(((props.marginRight||0)+room)*150)}:{marginLeft:Math.round(((props.marginLeft||0)+room)*150)}));};
    setProps(p,{textWrap:'InFrontOfText',horzRelTo:'Column'});
    if(own.length)narrow(p.para);document.reflowLinesegs();b=box(p);
    let last=p.para;
    for(let para=p.para+1;Number.isInteger(count)?para<count:para<p.para+20;para++){
      const ls=lines(p,para);
      if(!ls.length||controlParas(p).has(para))break;
      if(Math.min(...ls.map(l=>l.y))>=b.y+b.h)break;
      // 그림 아래로 네 줄 가까이 넘게 길어지는 문단은 좁히지 않고 그림 밑에서 단 폭으로 시작하게 한다(긴 설명이 좁은 폭으로 길게 늘어지지 않게).
      const before=JSON.parse(document.getParaPropertiesAt(p.sec,para));
      narrow(para);document.reflowLinesegs();b=box(p);
      if(bottomOf(lines(p,para))>b.y+b.h+90){document.applyParaFormat(p.sec,para,JSON.stringify(right?{marginRight:Math.round((before.marginRight||0)*150)}:{marginLeft:Math.round((before.marginLeft||0)*150)}));document.reflowLinesegs();b=box(p);break;}
      last=para;
    }
    // 글 없는 문단에 붙은 표: 그 문단 높이만큼 내려 다음 문단 첫 줄과 위를 맞춘다.
    if(!own.length&&last!==p.para){const top=Math.min(...lines(p,p.para+1).map(l=>l.y));if(Number.isFinite(top)&&top>b.y+.5){setProps(p,{vertOffset:Math.round((top-b.y)*75)});document.reflowLinesegs();b=box(p);}}
    const bottom=bottomOf(lines(p,last));
    if(b.y+b.h+GAP>bottom)space(p,last,b.y+b.h+GAP-bottom);
  }
  return true;
}

// 글 옆 표: 첫 지문(번호 문단) 바로 앞 문단에 든 표를 떠 있는 표로 바꾼다. 줄 배치는 settleFloatingPictures가 맞춘다.
export function applyFloatingTable(document,spec,number){
  if(!spec)return;
  const prefix=`${number}. `;
  for(let page=0;page<document.pageCount();page++){
    const run=JSON.parse(document.getPageTextLayout(page)).runs.find(r=>!r.cellPath?.length&&r.text.startsWith(prefix));if(!run)continue;
    const t=(JSON.parse(document.getPageControlLayout(page)).controls||[]).find(c=>c.type==='table'&&!c.cellPath?.length&&c.paraIdx===run.paraIdx-1);
    if(!t)throw Error('글 옆 표를 찾지 못했습니다.');
    const r=JSON.parse(document.setTableProperties(t.secIdx,t.paraIdx,t.controlIdx,JSON.stringify({treatAsChar:false,textWrap:'InFrontOfText',horzRelTo:'Column',horzAlign:spec.align,vertRelTo:'Para',vertAlign:'Top',vertOffset:0,horzOffset:0})));
    if(r?.ok===false)throw Error('글 옆 표를 배치하지 못했습니다.');return;
  }
  throw Error('글 옆 표의 지문을 찾지 못했습니다.');
}
