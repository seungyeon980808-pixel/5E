import {exportLayoutHwpx} from './native-hwpx.js?v=1014-compact-panel';
export const PAPER_MM={A4:[210,297],B4:[257,364],A3:[297,420]};
export const LAYOUT_VERSION=11;
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
  header=header.replace(/(<hh:paraProperties\b[^>]*itemCnt=")\d+"/,`$1${styles.size+clones.size}"`);
  zip.file('Contents/header.xml',header);
  xml=xml.replace(/<hp:tc\b[^>]*>/g,tag=>tag.replace(/hasMargin="0"/,'hasMargin="1"'));
  xml=xml.replace(/<hp:tbl\b[\s\S]*?(?=<hp:tr>)/g,tag=>tag.replace(/<hp:outMargin\b[^>]*>/,margin=>margin.replace(/\b(left|right)="\d+"/g,'$1="0"')));
  zip.file('Contents/section0.xml',xml);
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}

// 자료 표·그림이 있는 문단(글이 없는 문단)도 찾는다.
const controlParas=(document,sec)=>{const set=new Set();for(let p=0;p<document.pageCount();p++)for(const c of JSON.parse(document.getPageControlLayout(p)).controls||[])if(c.secIdx===sec&&!(c.cellPath||[]).length)set.add(c.paraIdx);return [...set];};
export function applyQuestionIndent(document,number,{body=false,askLead='',askIndent=0}={}){
  if(!number)return;
  const prefix=`${number}. `;
  for(let page=0;page<document.pageCount();page++){
    const run=JSON.parse(document.getPageTextLayout(page)).runs.find(r=>r.charStart===0&&r.text.startsWith(prefix)||!r.cellPath?.length&&r.text.startsWith(prefix));
    if(!run)continue;
    // 글 옆 자료처럼 번호가 표 칸 안에 있으면 칸 문단은 내어쓰기를 건드리지 않는다.
    if(run.cellPath?.length)return;
    const start=JSON.parse(document.getCursorRect(run.secIdx,run.paraIdx,0)),end=JSON.parse(document.getCursorRect(run.secIdx,run.paraIdx,prefix.length)),hang=Math.round((end.x-start.x)*150);
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
    const prefix=run.text.match(bogi?/^[ㄱ-ㅎ]\. /:/^(?:[①-⑤]|\([가-힣]\)) /)?.[0];if(!prefix)continue;
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

// The native engine accepts both LaTeX and Hancom equation scripts. Generate
// each equation with that engine, then place its native HWPX control in the
// original paragraph/cell. Equations never become bitmap pictures.
export async function materializeEquations(Document,JSZip,bytes,equations,CFB=globalThis.XLSX?.CFB){
  if(!equations.length)return bytes;
  const zip=await JSZip.loadAsync(new Uint8Array(bytes));let xml=await zip.file('Contents/section0.xml').async('string');
  for(const [i,eq] of equations.entries()){
    if(eq.script.length>8000)throw Error('수식은 8,000자 이내로 입력하세요.');
    const temp=Document.createEmpty();let control;
    try{temp.createBlankDocument();const result=JSON.parse(temp.insertEquation(0,0,0,eq.script,eq.fontSize||1100,0));if(!result.ok)throw Error('수식을 읽지 못했습니다.');const ez=await JSZip.loadAsync(new Uint8Array(temp.exportHwpx())),exml=await ez.file('Contents/section0.xml').async('string');control=exml.match(/<hp:equation\b[\s\S]*?<\/hp:equation>/)?.[0];}finally{temp.free();}
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
