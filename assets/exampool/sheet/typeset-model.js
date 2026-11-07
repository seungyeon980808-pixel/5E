import {exportLayoutHwpx,restackPictureLines} from './native-hwpx.js?v=1014-compact-panel';
// 학교 양식에서 읽는 용지(11-01 밤샘): A4·B4·A3 밖의 양식(B5·레터·8절·16절 등)을 A4로 바꿔 읽어 문항 폭이 틀렸다.
export const PAPER_MM={A4:[210,297],B4:[257,364],A3:[297,420],B5:[182,257],A5:[148,210],Letter:[216,279],Legal:[216,356],'8절':[272,394],'16절':[197,272]};
export const LAYOUT_VERSION=13;
// 평가원 본문 글자: 장평 95%·자간 -5%(같은 글자 크기에서 한 줄에 약 10% 더 들어간다). 새로 조판하는 문항에만 건다.
import {nativeRuns} from './live-patch.js';
import {fitQuestionParagraph} from './line-fit.js';
import {KICE_STANDARD,layoutValues,standardForPaper} from './typeset-standard.js';
// 본문 글자 장평·자간 기본값은 조판 기준(「수능 틀」)에서 읽는다.
export const TEXT_RATIO=KICE_STANDARD.text.ratio,TEXT_SPACING=KICE_STANDARD.text.spacing,TEXT_WIDTH=(TEXT_RATIO+TEXT_SPACING)/100;
const HU=7200/25.4;
export function pageProfile(profile={paper:'A4',columns:2},standard=KICE_STANDARD){
  if(!PAPER_MM[profile.paper]||![1,2,3,4].includes(profile.columns))throw Error('용지와 단 수를 확인하세요.');
  // B4·A3 2단은 단 폭을 평가원 원본(111.98mm)으로 맞춘 여백을 쓴다(standardForPaper, 10-24 용지 원칙) — 문항 조판·시험지 묶기·검사가 같은 값을 쓴다.
  const [w,h]=PAPER_MM[profile.paper],L=layoutValues(profile.columns===2?standardForPaper(standard,profile.paper):standard),margin=L.margin,spacing=L.columnGap;
  return {page:{width:Math.round(w*HU),height:Math.round(h*HU),marginLeft:Math.round(margin.left*HU),marginRight:Math.round(margin.right*HU),marginTop:Math.round(margin.top*HU),marginBottom:Math.round(margin.bottom*HU),marginHeader:0,marginFooter:0,marginGutter:0,landscape:false},spacing:Math.round(spacing*HU),width:Math.floor(((w-margin.left-margin.right-(profile.columns-1)*spacing)/profile.columns)*HU/75)-8};
}
// 한글 문서에 실제로 나오는 값: 번호·유형·선지 표현·발문·구성·선지·선지표·선지 배열·[3점].
// 단원·성취기준·정답·배점·출처·해설·문항 상태는 조판에 영향이 없으므로 바꿔도 한글 창을 다시 그리지 않는다.
// 배점은 3점일 때만 [3점]으로 찍힌다. 그때만 지문에 넣어 다른 문항의 저장한 조판 지문은 그대로 둔다.
export const renderedContent=q=>({standardId:q.standardId,askGap:q.askGap,choicesGap:q.choicesGap,number:q.number,type:q.type,style:q.style,ask:q.ask,blocks:q.blocks,choices:q.choices,choiceTable:q.choiceTable,choiceLayout:q.choiceLayout,...(q.points===3?{pointsMark:3}:{})});
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

// 표 바깥 여백(왼·오)을 0으로 바꾸고, 엔진이 표를 넣을 때 그 여백만큼 줄여 둔 폭을 표 폭과 각 줄 마지막 칸 폭에 되돌린다.
// 되돌리지 않으면 표가 계획보다 약 8px 좁고 4px 안쪽에 놓여 〈보기〉·상자가 단 끝에 닿지 않고 마지막 선지가 넘쳤다(10-25 실측 30600 → 30000).
export function widenTablesByMargins(xml){
  xml=xml.replace(/<hp:tbl\b[\s\S]*?(?=<hp:tr>)/g,head=>{const m=head.match(/<hp:outMargin\b[^>]*>/)?.[0]||'',add=Number(m.match(/\bleft="(\d+)"/)?.[1]||0)+Number(m.match(/\bright="(\d+)"/)?.[1]||0);
    let h=head.replace(/<hp:outMargin\b[^>]*>/,mm=>mm.replace(/\b(left|right)="\d+"/g,'$1="0"'));
    if(add>0)h=h.replace(/<hp:sz\b([^>]*?)\bwidth="(\d+)"/,(t,pre,w)=>`<hp:sz${pre}width="${Number(w)+add}"`).replace(/^<hp:tbl\b/,`<hp:tbl data-widen="${add}"`);
    return h;});
  if(!xml.includes('data-widen='))return xml;
  const stack=[];let cell=null;
  xml=xml.replace(/<hp:tbl\b[^>]*>|<\/hp:tbl>|<hp:cellAddr\b[^>]*>|<hp:cellSpan\b[^>]*>|<hp:cellSz\b[^>]*>/g,tag=>{
    if(tag.startsWith('<hp:tbl')){stack.push({add:Number(tag.match(/data-widen="(\d+)"/)?.[1]||0),cols:Number(tag.match(/\bcolCnt="(\d+)"/)?.[1]||0)});cell=null;return tag;}
    if(tag==='</hp:tbl>'){stack.pop();cell=null;return tag;}
    const t=stack.at(-1);if(!t)return tag;
    if(tag.startsWith('<hp:cellAddr')){cell={c:Number(tag.match(/\bcolAddr="(\d+)"/)?.[1]||0),span:1};return tag;}
    if(tag.startsWith('<hp:cellSpan')){if(cell)cell.span=Number(tag.match(/\bcolSpan="(\d+)"/)?.[1]||1);return tag;}
    if(cell&&t.add>0&&cell.c+cell.span===t.cols){const out=tag.replace(/\bwidth="(\d+)"/,(x,w)=>`width="${Number(w)+t.add}"`);cell=null;return out;}
    cell=null;return tag;});
  return xml.replace(/ data-widen="\d+"/g,'');
}
export async function normalizeQuestionImport(bytes,JSZip,{standard=KICE_STANDARD}={}){
  const L=layoutValues(standard);
  const zip=await JSZip.loadAsync(new Uint8Array(bytes));
  // The HTML importer adds a 20px indent to table anchor paragraphs, and
  // parses CSS cell padding but leaves hasMargin off. Correct only this newly
  // generated question document, before the user starts editing its layout.
  let header=await zip.file('Contents/header.xml').async('string');
  header=header.replace(/<hc:(left|right|intent) value="\d+"/g,'<hc:$1 value="0"');
  // 한글 줄 나눔은 평가원처럼 어절 단위. HWPX에서는 BREAK_WORD가 「어절」(rhwp koreanBreakUnit 0), KEEP_WORD가 「글자」다
  // (10-22 실험: KEEP_WORD로 바꾸던 예전 코드가 거꾸로 글자 단위로 만들어 「설계|한다」처럼 어절 가운데에서 끊겼다).
  header=header.replace(/breakNonLatinWord="KEEP_WORD"/g,'breakNonLatinWord="BREAK_WORD"');
  header=header.replace(/<hh:ratio\b[^>]*\/>/g,tag=>tag.replace(/="\d+"/g,`="${L.ratio}"`)).replace(/<hh:spacing\b[^>]*\/>/g,tag=>tag.replace(/="-?\d+"/g,`="${L.spacing}"`));
  // 좁힌 줄(10-25): 조판이 글자색 #0A0BNN(NN = 더 좁힐 자간 %)으로 표시한 글자 모양은 자간을 그만큼 더 좁히고 검은색으로 되돌린다.
  // 평가원 원본은 칸·〈보기〉 줄의 낱말이 조금 넘치면 그 줄 자간을 좁혀 한 줄에 넣는다. 한글 엔진의 HTML 읽기는 letter-spacing을 받지 않는다.
  header=header.replace(/<hh:charPr\b[^>]*textColor="#0A0B([0-9A-F]{2})"[^>]*>[\s\S]*?<\/hh:charPr>/gi,(m,nn)=>m.replace(/textColor="#0A0B[0-9A-F]{2}"/i,'textColor="#000000"').replace(/<hh:spacing\b[^>]*\/>/,tag=>tag.replace(/="-?\d+"/g,`="${L.spacing-parseInt(nn,16)}"`)));
  // 학교 기준(10-22 S4): 본문 글꼴·글자 크기·줄 간격을 기준 값으로. 크기는 모든 글자 모양을 같은 비율로(11pt 기준), 글꼴은 본문 함초롬바탕만,
  // 줄 간격은 본문 160%만(표 칸 130%·〈보기〉 150%는 그대로). 수능 틀이면 손대지 않는다(바이트 동일).
  if(standard&&standard.id!==KICE_STANDARD.id){
    const T=standard.text||{},scale=(T.size||11)/11;
    // 글자 크기는 조판(handoff)이 틀 값(text.size)으로 이미 넣는다(10-25) — 여기서 다시 키우지 않는다.
    void scale;
    if(T.font&&T.font!=='함초롬바탕')header=header.replace(/face="함초롬바탕"/g,`face="${T.font.replace(/[&<>"]/g,'')}"`);
    if(T.lineSpacing&&T.lineSpacing!==160)header=header.replace(/(<hh:lineSpacing type="PERCENT" value=")160"/g,`$1${Math.round(T.lineSpacing)}"`);
    // 조판 설정(10-23): 한글 줄 나눔 「글자」, 본문 정렬 「왼쪽」을 고르면 바꾼다(기본은 어절·양쪽).
    if(T.break==='char')header=header.replace(/breakNonLatinWord="BREAK_WORD"/g,'breakNonLatinWord="KEEP_WORD"');
    if(T.align==='left')header=header.replace(/(<hh:align\b[^>]*horizontal=")JUSTIFY"/g,'$1LEFT"');
  }
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
      if(!spacing.has(old)){const id=String(nextId++);spacing.set(old,id);header=header.replace('</hh:paraProperties>',styles.get(old).replace(/\bid="\d+"/,`id="${id}"`).replace(/(<hh:lineSpacing type="PERCENT" value=")\d+/g,'$1'+L.tableLineSpacing)+'</hh:paraProperties>');}
      xml=xml.slice(0,p.index)+p.tag.replace(/paraPrIDRef="\d+"/,`paraPrIDRef="${spacing.get(old)}"`)+xml.slice(p.index+p.tag.length);
    }
  }
  header=header.replace(/(<hh:paraProperties\b[^>]*itemCnt=")\d+"/,`$1${styles.size+clones.size+spacing.size}"`);
  zip.file('Contents/header.xml',header);
  xml=xml.replace(/<hp:tc\b[^>]*>/g,tag=>tag.replace(/hasMargin="0"/,'hasMargin="1"'));
  xml=widenTablesByMargins(xml);
  // 한 줄 선지 칸(①~⑤로 시작, 줄바꿈 없음)은 좌우 안 여백 0 — 평가원은 탭으로 띄워 ①이 〈보기〉 왼쪽 끝과 맞는다(엔진은 여백 0을 기본값 141로 바꿔 2px 들어갔다).
  xml=xml.replace(/<hp:tc\b[^>]*>(?:(?!<\/hp:tc>)[\s\S])*?<\/hp:tc>/g,tc=>/^[^]*?<hp:t>[①-⑤]/.test(tc)&&!/<hp:lineBreak\/>/.test(tc)&&!/<hp:tbl\b/.test(tc)?tc.replace(/<hp:cellMargin\b([^>]*)>/,(m,a)=>`<hp:cellMargin${a.replace(/\b(left|right)="\d+"/g,'$1="0"')}>`):tc);
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
export function applyQuestionIndent(document,number,{body=false,askLead='',askIndent=0,hangPx=0}={}){
  if(!number)return;
  const prefix=`${number}. `;
  for(let page=0;page<document.pageCount();page++){
    // 번호를 굵게 따로 찍으면(10-24) 「7.」이 혼자 한 조각이 된다 — 그 조각도 번호로 본다.
    const isNo=r=>r.text.startsWith(prefix)||r.text===`${number}.`;
    const run=JSON.parse(document.getPageTextLayout(page)).runs.find(r=>r.charStart===0&&isNo(r)||!r.cellPath?.length&&isNo(r));
    if(!run)continue;
    // 글 옆 자료처럼 번호가 표 칸 안에 있으면 칸 문단은 내어쓰기를 건드리지 않는다.
    if(run.cellPath?.length)return;
    // 어울림 그림이 문단 맨 앞에 있으면 번호 글은 그 뒤에서 시작한다.
    const at=run.charStart||0,start=JSON.parse(document.getCursorRect(run.secIdx,run.paraIdx,at)),end=JSON.parse(document.getCursorRect(run.secIdx,run.paraIdx,at+prefix.length)),hang=hangPx>0?Math.round(hangPx*150):Math.round((end.x-start.x)*150);
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
  // 한 문단 앞부분이 여러 조각으로 올 수 있다(「(」만 따로 · 「다) …」 — 10-24 11번). 같은 문단 조각을 이어 앞머리를 찾는다.
  const heads=new Map();for(const r of runs){if(!r.cellPath?.length)continue;const k=JSON.stringify([r.secIdx,r.parentParaIdx,r.cellPath]);heads.set(k,[...(heads.get(k)||[]),r]);}
  const headText=run=>(heads.get(JSON.stringify([run.secIdx,run.parentParaIdx,run.cellPath]))||[run]).filter(r=>r.charStart<12).sort((a,b)=>a.charStart-b.charStart).reduce((t,r)=>r.charStart===t.length?t+r.text:t,'');
  for(const run of runs){
    if(!run.cellPath?.length||run.charStart!==0)continue;
    const bogi=run.cellPath.at(-1).cellIndex===5&&boxes.has(tableKey(run));
    // 상자 안 항목 줄(○ · (가) · ①)도 — 〈보기〉 밖 「ㄱ.」은 그대로 — handoff가 항목마다 문단을 나눠 넣는다(10-24).
    // 빈 줄은 「ㄱ.」 뒤 칸이 줄바꿈 없는 공백(nbsp)으로 온다 — 그 경우도 찾아야 새 문항부터 내어쓰기가 걸린다.
    const prefix=headText(run).match(bogi?/^[ㄱ-ㅎ]\.[ \u00a0]/:/^(?:[①-⑤○◦•▪◆□■]|\([가-힣]\))[ \u00a0]/)?.[0];if(!prefix)continue;
    const path=JSON.stringify(run.cellPath),start=JSON.parse(document.getCursorRectByPath(run.secIdx,run.parentParaIdx,path,0)),end=JSON.parse(document.getCursorRectByPath(run.secIdx,run.parentParaIdx,path,prefix.length));
    indents.set(paraKey(run.secIdx,run.parentParaIdx,run.cellPath),-Math.round((end.x-start.x)*75));
    // 번호 뒤 보통 띄어쓰기는 고정 띄어쓰기로(10-24 지적 9) — 폭은 같고, 번호와 글이 떨어지지 않으며 조판 부호(빨간 V)가 보인다.
    if(prefix.endsWith(' ')){const at=prefix.length-1;document.deleteTextInCellByPath(run.secIdx,run.parentParaIdx,path,at,1);document.insertTextInCellByPath(run.secIdx,run.parentParaIdx,path,at,'\u00a0');}
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

// 키 큰 수식 줄 끌어올리기(11-02 학교 양식, 사용자: 〈보기〉 ㄴ–ㄷ 사이를 붙여라). 엔진은 수식 줄의 글 기준선을 줄 높이의 85%에 두고 수식을 제 기준선에 맞춰
// 그린다 — 분수는 기준선이 60%쯤이라 줄 맨 위보다 8px쯤 아래에 그려져 위에 빈틈, 아래로 삐져나옴이 생겼다(내보낸 시험지 키 큰 수식 749개 중 84%).
// 엔진은 줄 기준선 값(baseline)은 안 읽고 줄 높이(vertsize)로 위치를 정한다(실측). 그래서 수식이 든 줄의 높이를 「내려간 만큼 ÷ 0.85」 줄이고
// 줄인 만큼 줄 사이를 늘리면 수식이 줄 맨 위로 올라오고 다음 줄·쪽 나눔은 그대로다. 내려가는 양은 수식마다 엔진에 따로 그려 잰다(같은 수식은 한 번).
const equationDrops=new Map();
export function equationDrop(Document,script,unit){
  const key=unit+'|'+script;if(equationDrops.has(key))return equationDrops.get(key);
  let drop=0;const d=Document.createEmpty();
  try{d.createBlankDocument();d.pasteHtml(0,0,0,'<p><span style="font-family:함초롬바탕;font-size:11pt">가나 EQDROPMARK 다라</span></p>');
    // 수식 앞뒤에 글을 둔다 — 줄 끝 수식은 엔진이 줄 높이에 넣지 않는다(handoff가 수식 뒤에 1pt 연결 문자를 두는 까닭).
    const at=JSON.parse(d.getPageTextLayout(0)).runs.map(r=>r.text).join('').indexOf('EQDROPMARK');
    if(at>=0){d.deleteText(0,0,at,10);const r=JSON.parse(d.insertEquation(0,0,at,script,unit,0));
      if(r.ok){d.reflowLinesegs();const runs=JSON.parse(d.getPageTextLayout(0)).runs.filter(r=>r.text.trim()),e=JSON.parse(d.getPageControlLayout(0)).controls.find(c=>c.type==='equation');
        if(e&&runs.length)drop=Math.max(0,e.y-Math.min(...runs.map(r=>r.y)))*75;}}
  }catch{return 0;}finally{d.free();}
  // 잰 값만 기억한다 — 엔진 오류 한 번으로 0을 기억하면 그 수식은 끝까지 끌어올리기에서 빠졌다(GPT 검토).
  equationDrops.set(key,drop);return drop;
}
// 줄 배치 손질(XML): 줄 높이가 그 문단 키 큰 수식 높이와 같은 줄(엔진이 수식 때문에 키운 줄)만. 같은 높이 수식이 여럿이면 가장 적게 내려간 값으로(어느 수식도 줄 위로 넘지 않게).
// 글자가 들어갈 높이(문단 다른 줄 높이, 없으면 baseUnit÷0.9 — 키 큰 수식은 글자의 90%로 넣으므로)보다는 줄이지 않는다. 다시 해도 같다(줄인 줄은 수식 높이와 달라져 다시 잡히지 않음).
export function liftTallEquations(xml,dropOf,roomOf=()=>Infinity){
  const paragraphs=[],stack=[];let top=0;
  for(const m of xml.matchAll(/<hp:p\b[^>]*>|<\/hp:p>/g)){
    if(m[0].startsWith('</')){const p=stack.pop();if(p)p.end=m.index;}
    else{const p={body:m.index+m[0].length,depth:stack.length,para:stack.length?-1:top++};paragraphs.push(p);stack.push(p);}
  }
  const num=(tag,key)=>Number(tag.match(new RegExp(`\\b${key}="(-?\\d+)"`))?.[1]),edits=[];
  for(const p of paragraphs){
    if(p.end===undefined)continue;const body=xml.slice(p.body,p.end);if(body.includes('<hp:p ')||!body.includes('<hp:equation'))continue;
    const eqs=[...body.matchAll(/<hp:equation\b[^>]*>[\s\S]*?<\/hp:equation>/g)].map(m=>({unit:num(m[0].match(/^<hp:equation\b[^>]*>/)[0],'baseUnit')||1100,h:num(m[0].match(/<hp:sz\b[^>]*>/)?.[0]||'','height'),script:(m[0].match(/<hp:script>([\s\S]*?)<\/hp:script>/)?.[1]||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&')})).filter(e=>e.h>e.unit*1.2);
    if(!eqs.length)continue;
    const array=body.match(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/);if(!array)continue;
    const segs=[...array[0].matchAll(/<hp:lineseg\b[^>]*>/g)],at=p.body+array.index;
    const heights=segs.map(m=>num(m[0],'vertsize')),floor=Math.min(...heights.filter(v=>!eqs.some(e=>Math.abs(e.h-v)<=40)),Math.round(Math.max(...eqs.map(e=>e.unit))/0.9));
    let shift=0;
    for(const [i,m] of segs.entries()){
      const v=heights[i],near=eqs.filter(e=>Math.abs(e.h-v)<=40);
      let tag=m[0].replace(/\bvertpos="-?\d+"/,`vertpos="${num(m[0],'vertpos')-shift}"`);
      if(near.length){
        const drop=Math.min(...near.map(e=>dropOf(e.script,e.unit))),next=drop>40?Math.max(floor,Math.round(v-drop/0.85)):v;
        const gap=num(m[0],'spacing')||0;
        // OmO 11-02: 본문 둘째 줄부터 분수 뒤 추가 여백만 0.15em로. 첫 줄은 엔진이 문단 모양으로 다시 계산하며,
        // 문단 모양을 줄이면 보통 줄까지 좁아지므로 그대로 둔다. 표 칸도 기존 간격을 유지한다.
        const compact=!p.depth&&i>0&&near.some(e=>/\\(?:frac|dfrac|tfrac)\b|\bover\b/.test(e.script));
        // 자동 줄바꿈·그림 어울림에서는 같은 수식도 독립 측정 때보다 아래에 놓일 수 있다.
        // 실제 다음 줄까지 남은 공간에서 0.15em를 남긴 만큼만 줄인다. 수식 크기나 검사 기준은 바꾸지 않는다.
        const clear=Math.round(floor*.15),room=roomOf(p.para,i,segs.length)+(v-next)*.85-clear;
        const reduce=compact?Math.max(0,Math.min(gap-clear,Math.floor(room))):0,spacing=gap-reduce;shift+=reduce;
        if(next<v)tag=tag.replace(/\bvertsize="-?\d+"/,`vertsize="${next}"`).replace(/\btextheight="-?\d+"/,`textheight="${next}"`).replace(/\bbaseline="-?\d+"/,`baseline="${Math.round(next*.85)}"`);
        // 수식 끌어올리기로 줄인 높이는 여백으로 돌려준다. 실제 간격 감소량은 위에서 고른 추가 여백 차이뿐이다.
        tag=tag.replace(/\bspacing="-?\d+"/,`spacing="${spacing+v-next}"`);
      }
      if(tag!==m[0])edits.push([at+m.index,m[0],tag]);
    }
  }
  for(const [index,old,next] of edits.sort((a,b)=>b[0]-a[0]))xml=xml.slice(0,index)+next+xml.slice(index+old.length);
  return xml;
}
export async function applyLiftTallEquations(bytes,JSZip,Document){
  const zip=await JSZip.loadAsync(new Uint8Array(bytes));let changed=false;
  const document=new Document(bytes),lines=new Map(),equations=[];
  try{
    for(let page=0;page<document.pageCount();page++){
      for(const r of JSON.parse(document.getPageTextLayout(page)).runs.filter(r=>!r.cellPath?.length)){
        const key=r.secIdx+':'+r.paraIdx,list=lines.get(key)||[];
        if(!list.some(l=>l.page===page&&Math.abs(l.y-r.y)<.2))list.push({page,y:r.y});lines.set(key,list);
      }
      equations.push(...JSON.parse(document.getPageControlLayout(page)).controls.filter(c=>c.type==='equation'&&!c.cellPath?.length).map(c=>({...c,page})));
    }
    for(const list of lines.values())list.sort((a,b)=>a.page-b.page||a.y-b.y);
    for(const name of Object.keys(zip.files).filter(n=>/^Contents\/section\d+\.xml$/.test(n))){
      const section=Number(name.match(/section(\d+)/)[1]);
      const roomOf=(para,line,count)=>{
        const list=lines.get(section+':'+para);
        if(list?.length!==count||line+1===count||list[line].page!==list[line+1].page)return -Infinity;
        const here=list[line],next=list[line+1],own=equations.filter(e=>e.secIdx===section&&e.paraIdx===para&&e.page===here.page&&e.y>=here.y-.8&&e.y<next.y-.8);
        return own.length?(next.y-Math.max(...own.map(e=>e.y+e.h)))*75:-Infinity;
      };
      const xml=await zip.file(name).async('string'),next=liftTallEquations(xml,(script,unit)=>equationDrop(Document,script,unit),roomOf);
      if(next!==xml){zip.file(name,next);changed=true;}
    }
  }finally{document.free();}
  return changed?zip.generateAsync({type:'uint8array',compression:'DEFLATE'}):bytes;
}
// 학교 양식(11-02, OmO): 표만 든 문단(선지 표 등)에 줄 정보가 없으면 rhwp가 어떤 양식(원안지 r01)에서 그 표를 앞 글보다 위에 놓아 본문과 겹쳤다
// (진단 _work/eqfix/r01dbg-diagnosis.md — 그 문단에 줄 정보 하나를 주면 제자리로 간다). 모든 표 문단에 주면 대왕중 양식이 깨지므로(겹침 36건),
// 앞 문단 글보다 위로 올라간 글자처럼 취급한 표의 문단에만 준다. exportLayoutHwpx가 표 문단 줄 정보를 지우므로 그 뒤에 건다. 끝까지 안 고쳐지면 원래 파일 그대로.
export function anchorRaisedTables(bytes,CFB,Document){return anchorRaised(bytes,CFB,Document,false).bytes;}
// 11-03: 고칠 표가 없으면(대부분) 확인하느라 연 문서를 그대로 돌려준다 — 부르는 쪽이 같은 바이트를 또 열지 않게(settle마다 한 번씩 줄어듦).
export function anchorRaisedTablesOpen(bytes,CFB,Document){return anchorRaised(bytes,CFB,Document,true);}
function anchorRaised(bytes,CFB,Document,keep){
  const raised=d=>{const out=[];
    for(let p=0;p<d.pageCount();p++){const runs=JSON.parse(d.getPageTextLayout(p)).runs.filter(r=>!(r.cellPath||[]).length&&String(r.text||'').trim());
      const controls=JSON.parse(d.getPageControlLayout(p)).controls;
      for(const t of controls){
        if(t.type!=='table'||(t.cellPath||[]).length||runs.some(r=>r.secIdx===t.secIdx&&r.paraIdx===t.paraIdx))continue;
        const prev=runs.filter(r=>r.secIdx===t.secIdx&&r.paraIdx===t.paraIdx-1&&r.x<t.x+t.w&&r.x+r.w>t.x);
        // 11-03 OmO: 앞 문단이 글 없는 inline 표(〈보기〉 표)면 비교할 글줄이 없어 그 뒤 선지 표가 위로 올라간 것을 놓쳤다 — 같은 단의 직전 inline 표도 비교 대상에.
        for(const before of controls.filter(c=>c.type==='table'&&c.stableIndex?.length===3&&c.secIdx===t.secIdx&&c.paraIdx===t.paraIdx-1&&c.x<t.x+t.w&&c.x+c.w>t.x)){
          if(JSON.parse(d.getTableProperties(before.secIdx,before.paraIdx,before.controlIdx)).treatAsChar===true)prev.push(before);
        }
        if(!prev.length)continue;
        if(t.y>=Math.max(...prev.map(r=>r.y+r.h))-1)continue;
        let inline=false;try{inline=JSON.parse(d.getTableProperties(t.secIdx,t.paraIdx,t.controlIdx)).treatAsChar===true;}catch{}
        if(inline)out.push({sec:t.secIdx,para:t.paraIdx,h:t.h,w:t.w});}}
    return out;};
  // 앞 표를 제자리로 보내면 그 뒤 표(다음 문항 〈보기〉 등)가 같은 식으로 위에 남는다(11-02 원안지 2문항: 1번 선지 → 2번 〈보기〉) — 없어질 때까지 차례로.
  // 동기(CFB)로 — 묶을 때 단 나누기를 계획하는 settle에서도 불러, 처음부터 제자리 기준으로 단을 나눈다(진단서 권고).
  let cur=bytes;
  for(let round=0;round<8;round++){
    let d=new Document(cur),found;try{found=raised(d);}catch(e){d.free();throw e;}
    if(!found.length){if(keep)return {bytes:cur,doc:d};d.free();return {bytes:cur,doc:null};}
    d.free();
    const archive=CFB.read(cur,{type:'array'}),decode=new TextDecoder(),encode=new TextEncoder();let changed=false;
    for(const sec of new Set(found.map(f=>f.sec))){
      const file=archive.FileIndex[archive.FullPaths.findIndex(p=>p.endsWith(`Contents/section${sec}.xml`))];if(!file)return {bytes,doc:null};
      let xml=decode.decode(file.content);const spans=[];let depth=0,start=0;
      for(const m of xml.matchAll(/<hp:p\b[^>]*?(\/?)>|<\/hp:p>/g)){if(m[0].startsWith('</')){if(--depth===0)spans.push([start,m.index+m[0].length]);}else if(!m[1]){if(depth++===0)start=m.index;}}
      for(const f of found.filter(f=>f.sec===sec).sort((a,b)=>b.para-a.para)){const s=spans[f.para];if(!s)return {bytes,doc:null};
        let p=xml.slice(s[0],s[1]);if(/<\/hp:linesegarray>\s*<\/hp:p>$/.test(p))continue;
        const H=Math.round(f.h*75),seg=`<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="${H}" textheight="${H}" baseline="${Math.round(H*.85)}" spacing="0" horzpos="0" horzsize="${Math.round(f.w*75)}" flags="393216"/></hp:linesegarray>`;
        p=/<hp:linesegarray\/>\s*<\/hp:p>$/.test(p)?p.replace(/<hp:linesegarray\/>(\s*<\/hp:p>)$/,seg+'$1'):p.replace(/<\/hp:p>$/,seg+'</hp:p>');
        xml=xml.slice(0,s[0])+p+xml.slice(s[1]);changed=true;}
      file.content=encode.encode(xml);file.size=file.content.length;}
    if(!changed)return {bytes,doc:null};
    cur=new Uint8Array(CFB.write(archive,{type:'array',fileType:'zip'}));
  }
  return {bytes,doc:null};
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
// 상자 칸 안 어울림 그림(10-25): 칸 첫 문단 맨 앞에 든 그림을 글 앞 그림으로 바꿔 문단 오른쪽 위(머리 한 줄 아래)에 둔다.
// 칸 안 글은 조판(handoff)이 그림 높이만큼 좁게 나눠 두었으므로 엔진 어울림(Square)을 쓰지 않는다 — 칸 안 글을 엔진이 다시 나누지 않는다.
export function applyCellFloatingPictures(document,floats){
  if(!floats?.length)return;
  const want=floats.map(f=>({align:f.align==='Left'?'Left':'Right',anchorPara:Number(f.anchorPara)||0,line:Number(f.line)||0,bytes:Uint8Array.from(atob(String(f.data).split(',')[1]||''),c=>c.charCodeAt(0)),done:false}));
  const seen=new Set();
  for(let page=0;page<document.pageCount();page++)for(const c of JSON.parse(document.getPageControlLayout(page)).controls||[]){
    if(c.type!=='image'||!c.cellPath?.length)continue;
    const path=JSON.stringify(c.cellPath),key=`${c.secIdx}:${c.paraIdx}:${path}:${c.controlIdx}`;if(seen.has(key))continue;seen.add(key);
    const data=document.getControlImageData(c.secIdx,c.paraIdx,path,c.controlIdx),f=want.find(f=>!f.done&&f.bytes.length===data.length&&f.bytes.every((b,i)=>b===data[i]));
    if(!f)continue;f.done=true;
    // 기준 줄: 같은 칸의 anchorPara번째 문단 첫 줄 위(쪽 좌표 px). 쪽 위 여백까지 포함한 종이 기준으로 넣는다.
    // 기준 줄: 같은 칸의 anchorPara번째 문단 첫 줄 위와 그림 문단 위의 차이(px). 줄 정보의 paraIdx는 칸 안 문단 번호라 칸 경로로만 고른다.
    const cp=x=>x.cellPath.at(-1),ci=x=>[x.controlIndex??x.controlIdx,x.cellIndex??x.cellIdx].join(':'),pi=x=>x.cellParaIndex??x.cellParaIdx;
    const runs=JSON.parse(document.getPageTextLayout(page)).runs.filter(r=>r.secIdx===c.secIdx&&r.cellPath?.length===c.cellPath.length&&ci(cp(r))===ci(cp(c)));
    const own=runs.filter(r=>pi(cp(r))===pi(cp(c))),top=own.length?Math.min(...own.map(r=>r.y)):null;
    // anchorPara 문단부터의 줄(같은 높이 = 한 줄) 가운데 line번째 줄 위에 맞춘다(원본에서 그림 위에 있던 글 줄 수).
    const ys=top===null?[]:[...new Set(runs.filter(r=>pi(cp(r))>=f.anchorPara&&r.y>=top).map(r=>Math.round(r.y)))].sort((a,b)=>a-b).filter((v,i,a)=>!i||v-a[i-1]>4);
    const y=ys.length?Math.max(0,ys[Math.min(f.line,ys.length-1)]-top):null;
    const result=JSON.parse(document.setCellPicturePropertiesByPath(c.secIdx,c.paraIdx,path,c.controlIdx,JSON.stringify({treatAsChar:false,textWrap:'InFrontOfText',horzRelTo:'Para',horzAlign:f.align,horzOffset:0,vertRelTo:'Para',vertAlign:'Top',vertOffset:Math.round((y??0)*75),outerMarginLeft:0,outerMarginRight:0,outerMarginTop:0,outerMarginBottom:0})));
    if(result?.ok===false)throw Error('상자 안 어울림 그림을 배치하지 못했습니다.');
  }
  if(want.some(f=>!f.done))throw Error('상자 안 어울림 그림을 찾지 못했습니다.');
  document.reflowLinesegs?.();
}
// 어울림 그림을 놓은 뒤의 줄 배치 점검. 한글 엔진은 그림 높이 안에 든 두 줄짜리 문단을 그림 반대쪽으로 밀어 잘못 흐르게 한다.
// 그림이 붙은 문단이 그림과 겹치거나 그림보다 짧으면(다음 문단도 그림 옆에 와야 함) 엔진의 어울림 대신
// 그림은 글 앞(단 기준 정렬)에 두고, 그림 옆에서 시작하는 문단마다 오른쪽(왼쪽) 여백을 그림 폭만큼 둔다(평가원처럼 발문도 그림 옆).
// 표·그림 문단이 그림 옆에서 시작하면 앞 문단 아래 간격을 둬서 그림 밑으로 보낸다. 문단 모양 단위: 여백·간격은 px×150.
// 칸 높이를 글에 맞춰 늘린다(10-31 학교 양식 24번): 엔진은 칸 안 글이 늘어도 저장된 칸 높이를 그대로 써서 마지막 줄이 상자 밖으로 잘렸다.
// 맨 바깥 표의 칸만 본다. 글 아래 끝 + 칸 아래 여백이 칸 바닥을 넘는 만큼 그 칸(줄)을 늘린다.
export function growCellsToContent(document){
  const J=JSON.stringify,need=new Map();
  for(let page=0;page<document.pageCount();page++){
    const cells=new Map();
    for(const r of JSON.parse(document.getPageTextLayout(page)).runs){
      if(!r.text.trim()||(r.cellPath||[]).length!==1)continue;
      const path=r.cellPath.slice(0,1),json=J(path),cell=path[0].cellIndex,k=J([r.secIdx,r.parentParaIdx,path[0].controlIndex,cell]);
      if(!cells.has(k)){const box=JSON.parse(document.getTableCellBboxesByPath(r.secIdx,r.parentParaIdx,json)).find(c=>c.cellIdx===cell&&c.pageIndex===page);if(!box)continue;
        const props=JSON.parse(document.getCellPropertiesByPath(r.secIdx,r.parentParaIdx,json,cell));cells.set(k,{box,pad:props.applyInnerMargin?props.paddingBottom/75:0});}
      const {box,pad}=cells.get(k),over=r.y+(r.fontSize||r.h)+pad-(box.y+box.h);if(over>.8)need.set(k,Math.max(need.get(k)||0,over));
    }
  }
  for(const [k,over] of need){const [sec,para,ci,cell]=JSON.parse(k);document.resizeTableCells(sec,para,ci,J([{cellIdx:cell,heightDelta:Math.ceil((over+4)*75)}]));}
  if(need.size)document.reflowLinesegs();
  return need.size;
}
// 글자처럼 놓인 본문 표·그림이 앞 문단 마지막 줄에 올라탄 것(11-01 대왕중 2번 표: 앞 줄 낡은 줄 자리로 4px 겹침)을 그 표·그림 문단 위 간격으로 띄운다.
// 다시 열어 줄 자리가 새로 잡힌 문서(시험지 묶기)에서만 부른다 — 문항 조판 중에는 표 자리가 옛 자리라 잘못 잡았다. 떠 있는 표·그림(글 옆 자료)은 글과 겹쳐 놓는 것이 정상이라 뺀다.
// 예전(10-31~11-01)에는 수식이 아랫줄·윗줄과 겹치면 문단 간격·줄 간격도 넓혔으나, 원인(수식 바로 뒤에서 줄이 바뀌면 엔진이 줄 높이에 수식을 넣지 않음)을
// handoff의 수식 뒤 1pt 연결 문자로 고친 뒤 뺐다(11-02): 611문항 중 93문항을 띄워 문항 높이가 모두 655mm 늘었고, 같은 띄우기가 쌓여 한 문항이 55mm → 231mm가 되기도 했다.
export function spaceTableOverlaps(document){
  const J=JSON.stringify,need=new Map();
  for(let page=0;page<document.pageCount();page++){
    const runs=(JSON.parse(document.getPageTextLayout(page)).runs||[]).filter(r=>r.text.trim());
    for(const c of (JSON.parse(document.getPageControlLayout(page)).controls||[]).filter(c=>(c.type==='table'||c.type==='image')&&!(c.cellPath||[]).length)){
      let tac=false;try{tac=!!JSON.parse(c.type==='table'?document.getTableProperties(c.secIdx,c.paraIdx,c.controlIdx):document.getPictureProperties(c.secIdx,c.paraIdx,c.controlIdx)).treatAsChar;}catch{}
      if(!tac)continue;
      for(const r of runs){
        if((r.cellPath||[]).length||r.secIdx!==c.secIdx||r.paraIdx>=c.paraIdx)continue;
        // 앞 문단 줄이 표 위쪽에 걸치거나(r.y<c.y) 표 안으로 들어온 것(11-01 밤샘 f04 돋움 12pt 200%: 엔진이 앞 문단을 한 줄 적게 잡아 셋째 줄이 표 속에 그려짐) 모두.
        // 표 윗부분(글줄 둘 높이)에 걸친 것만 본다 — 표 자리가 아직 옛 자리인 문서에서 아래쪽 글을 겹침으로 보고 표를 수백 px 띄웠다(11-01 밤샘 화학Ⅰ 16번).
        const h=r.fontSize||r.h,over=r.y+h-c.y;
        if(over<=.8||r.y>=c.y+2*h||Math.min(c.x+c.w,r.x+r.w)-Math.max(c.x,r.x)<=.8)continue;
        const key=J([c.secIdx,c.paraIdx]);need.set(key,Math.max(need.get(key)||0,Math.min(over+2,3*h)));
      }
    }
  }
  for(const [key,px] of need){const k=JSON.parse(key),before=JSON.parse(document.getParaPropertiesAt(k[0],k[1],0)).spacingBefore||0;document.applyParaFormat(k[0],k[1],J({spacingBefore:Math.round((before+px)*150)}));}
  if(need.size)document.reflowLinesegs();
  return need.size;
}
// 〈보기〉 상자 단 가운데(10-31 학교 양식): 번호 뒤 문단은 모두 번호 폭만큼 들어가(applyQuestionIndent) 상자가 오른쪽으로 치우친다.
// 학교 양식에서는 칸 안에 「보기」 제목이 있는 글자처럼 놓인 표만 좌우 여백이 같게 단 가운데에 둔다. 선지·자료 표는 그대로.
export function centerBogiBoxes(document){
  const J=JSON.stringify,done=new Set();let count=0;
  for(let page=0;page<document.pageCount();page++){
    const runs=JSON.parse(document.getPageTextLayout(page)).runs||[];
    for(const c of JSON.parse(document.getPageControlLayout(page)).controls||[]){
      if(c.type!=='table'||c.cellPath?.length)continue;const key=`${c.secIdx}|${c.paraIdx}|${c.controlIdx}`;if(done.has(key))continue;done.add(key);
      const text=runs.filter(r=>r.cellPath?.length&&r.parentParaIdx===c.paraIdx&&r.cellPath[0].controlIndex===c.controlIdx).map(r=>r.text).join('');
      if(!/보\s*기/.test(text))continue;
      let props;try{props=JSON.parse(document.getTableProperties(c.secIdx,c.paraIdx,c.controlIdx));}catch{continue;}if(!props.treatAsChar)continue;
      // 엔진은 왼쪽 여백을 뺀 나머지 폭 안에서 가운데 맞춘다 — 좌우 여백을 0으로 두면 단 한가운데(정렬 값은 소문자 'center').
      // 〈보기〉 상자 문단 줄 간격 120%(11-01 사용자: 〈보기〉와 선지 사이를 30% 더 가깝게 — 160%에서 17.4px → 12.1px 실측).
      // 표를 글자처럼 둔 문단은 줄 간격만큼 표 아래가 벌어진다. 학교 양식에서만 부른다(수능 틀은 원본 PDF 간격 그대로).
      document.applyParaFormat(c.secIdx,c.paraIdx,J({alignment:'center',marginLeft:0,marginRight:0,indent:0,lineSpacing:120}));count++;
    }
  }
  if(count)document.reflowLinesegs();
  return count;
}
// front(10-30 학교 양식): 둘레 흐르기(Square)를 그대로 두지 않고 늘 글 앞 + 문단 폭 줄이기로 — 엔진이 2단 오른쪽 단에서 둘레 흐르기를 잘못 계산한다(23번 실측).
export function settleFloatingPictures(document,{front=false}={}){
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
    if(!front&&!overlaps&&bottomOf(own)+GAP>=b.y+b.h)continue;
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

// 그림 아래 줄 넓히기(11-02 학교 양식, 사용자: 어울림이면 그림 아래는 글이 채워야 한다). settleFloatingPictures는 그림 옆에 걸친 문단 전체를
// 그림 폭만큼 좁혀(엔진 어울림은 2단 오른쪽 단에서 틀림) 그림 아래로 내려간 줄까지 좁았다. 그 문단을 그림 아래 첫 줄에서 둘로 나누고
// 뒤 문단은 단 폭으로(번호 내어쓰기만큼 들여) 되돌린다. 나눌 자리는 엔진 함수마다 글자 위치 단위가 달라(줄 조각·좌표·나누기 셋 다 다름, 실측)
// 복사본에서 나눠 보고 뒷부분이 그 줄 첫 글자로 시작하는 값을 찾는다. 시험지에 넣을 학교 양식 문항(sheetEntry)에만 — 문항 편집 문서는 그대로.
// 문단 끝줄이 그 문단의 다른 줄 끝(오른쪽 끝)에 비해 얼마나 찼는지(0~1). 한 줄뿐이면 1.
function lastLineFill(d,sec,para){
  const lines=new Map();
  for(let p=0;p<d.pageCount();p++)for(const r of JSON.parse(d.getPageTextLayout(p)).runs||[]){if(r.secIdx!==sec||r.paraIdx!==para||r.cellPath?.length||!String(r.text||'').trim())continue;
    const k=p*1e5+Math.round(r.y*2),v=lines.get(k)||{x:Infinity,end:-Infinity};v.x=Math.min(v.x,r.x);v.end=Math.max(v.end,r.x+r.w);lines.set(k,v);}
  const ls=[...lines.entries()].sort((a,b)=>a[0]-b[0]).map(e=>e[1]);if(ls.length<2)return 1;
  const last=ls.pop(),edge=Math.max(...ls.map(l=>l.end));return (last.end-last.x)/Math.max(1,edge-last.x);
}
// fit: 학교 틀 자간 맞춤 값({low,high,shortLastLine,base}) — 넓힌 뒷문단을 다시 맞춘다(넓어진 폭에서 새로 생긴 어색한 줄바꿈).
export function widenBelowPictures(Document,bytes,CFB,fit=null){
  const P=JSON.parse,J=JSON.stringify,GAP=2,jobs=[];
  let d=new Document(bytes);
  try{
    for(let page=0;page<d.pageCount();page++){
      const ctl=P(d.getPageControlLayout(page)).controls||[],runs=(P(d.getPageTextLayout(page)).runs||[]).filter(r=>!(r.cellPath||[]).length);
      for(const c of ctl.filter(c=>c.type==='image'&&!(c.cellPath||[]).length)){
        let pr;try{pr=P(d.getPictureProperties(c.secIdx,c.paraIdx,c.controlIdx));}catch{continue;}
        if(pr.treatAsChar||pr.textWrap!=='InFrontOfText')continue;
        const right=pr.horzAlign!=='Left',bottom=c.y+c.h+GAP,room=c.w+((right?pr.outerMarginLeft:pr.outerMarginRight)||0)/75+6;
        for(let para=c.paraIdx;para<c.paraIdx+8;para++){
          const own=runs.filter(r=>r.secIdx===c.secIdx&&r.paraIdx===para&&r.text.replace(/\u2060/g,'').trim());if(!own.length)break;
          const ys=[...new Set(own.map(r=>Math.round(r.y*10)/10))].sort((a,b)=>a-b);if(ys[0]>=bottom)break;
          // 그림 아래 첫 줄부터, 맨 앞이 글인 줄을 고른다 — 수식으로 시작하는 줄에서 나누면 엔진이 수식을 한 칸씩 밀어 내용이 바뀌었다
          // (11-02 물리Ⅱ 25-9월 9번: 「A를 향해」 줄에서 나눠 「A는 진동수 S인 … f₀가 측정한」으로 나감).
          const eqs=ctl.filter(e=>e.type==='equation'&&!(e.cellPath||[]).length&&e.paraIdx===para);
          const lineFirst=y=>own.filter(r=>Math.abs(r.y-y)<.2).sort((a,b)=>a.x-b.x)[0];
          const below=ys.filter(y=>y>=bottom).find(y=>{const f=lineFirst(y);return !eqs.some(e=>Math.abs(e.y-y)<8&&e.x<f.x-.5);});if(below===undefined)continue;
          const first=lineFirst(below),pp=P(d.getParaPropertiesAt(c.secIdx,para));
          const eqAfter=eqs.filter(e=>e.y>=below-1).length;
          // 좁힌 문단만(그림 쪽 여백이 그림 폭만큼 있는 문단).
          if(((right?pp.marginRight:pp.marginLeft)||0)<room*.8)break;
          jobs.push({sec:c.secIdx,para,text:first.text,guess:first.charStart,right,room,pp,eqAfter});break;
        }
      }
    }
  }finally{d.free();}
  if(!jobs.length)return bytes;
  // 뒤 문단부터(앞 문단 번호가 바뀌지 않게).
  jobs.sort((a,b)=>b.para-a.para);
  const head=t=>String(t).replace(/^\s+/,'').slice(0,4);
  // 맨 바깥 문단 차례대로 「글 + [수식 스크립트]」(U+2060·줄 배치는 뺌). 나누기 전후 두 문단을 이어 붙인 것이 같아야 수식이 밀리지 않은 것.
  const inline=doc=>{const archive=CFB.read(doc.exportHwpx(),{type:'array'}),file=archive.FileIndex[archive.FullPaths.findIndex(x=>x.endsWith('Contents/section0.xml'))];if(!file)return null;
    const xml=new TextDecoder().decode(file.content),out=[],stack=[];
    for(const m of xml.matchAll(/<hp:p\b[^>]*>|<\/hp:p>/g)){if(m[0].startsWith('</')){const q=stack.pop();if(q&&!stack.length)out.push(xml.slice(q,m.index));}else stack.push(m.index+m[0].length);}
    return out.map(b=>b.replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/g,'').replace(/<hp:equation\b[\s\S]*?<hp:script>([\s\S]*?)<\/hp:script>[\s\S]*?<\/hp:equation>/g,'[$1]').replace(/<hp:(?:pic|tbl)\b[\s\S]*?<\/hp:(?:pic|tbl)>/g,'[개체]').replace(/<[^>]+>/g,'').replace(/\u2060/g,''));};
  let current=bytes;
  for(const j of jobs){
    let at=null,want=null;{const o=new Document(current);try{want=inline(o)?.[j.para]??null;}finally{o.free();}}
    // 줄 첫 글자 자리(charStart)는 글 차례(그림·수식 빼고 셈)이고, 문단 나누기 자리는 그림·수식을 한 칸씩 센다 — 앞에 든 그림·수식 수만큼 어긋나
    // 수식 많은 문단에서 나눌 자리를 못 찾고 넓히기를 포기했다(11-02 set17#24 「물체가 」 줄: 글 차례 96, 나누기 자리 107). 개체 자리로 바꿔 후보를 만들고,
    // 그 줄 첫 글이 나오는 다른 자리도 함께 해 본다(아래 검사가 수식이 밀리지 않은 자리만 받는다).
    let full='',cps=[];{const o=new Document(current);try{full=String(o.getTextRange(j.sec,j.para,0,o.getParagraphLength(j.sec,j.para)));cps=P(o.getControlTextPositions(j.sec,j.para))||[];}finally{o.free();}}
    const toPos=t=>t+cps.filter(c=>Number(c)<=t).length,lead=head(j.text),cands=new Set(),texts=[j.guess];
    if(lead)for(let i=full.indexOf(lead);i>=0;i=full.indexOf(lead,i+1))texts.push(i);
    for(let k=-3;k<=10;k++)cands.add(j.guess+k);
    for(const t of texts)for(let k=-2;k<=2;k++)cands.add(toPos(t)+k);
    const aim=toPos(j.guess);
    for(const v of [...cands].filter(v=>v>=1).sort((a,b)=>Math.abs(a-aim)-Math.abs(b-aim))){if(at!==null)break;const t=new Document(current);
      try{const r=P(t.splitParagraph(j.sec,j.para,v));if(r?.ok===false)continue;const got=t.getTextRange(j.sec,j.para+1,0,Math.min(8,t.getParagraphLength(j.sec,j.para+1)));
        // 뒷부분 글이 그 줄 첫 글로 시작하고, 뒷부분 수식 수가 원래 그 줄부터의 수식 수와 같을 때만(수식이 밀리지 않았는지).
        let n=-1;try{n=(P(t.getControlTextPositions(j.sec,j.para+1))||[]).length;}catch{}
        let same=false;if(want!==null&&got.startsWith(j.text.slice(0,Math.min(4,j.text.length)))&&head(got)===head(j.text)&&n===j.eqAfter){const ps=inline(t);same=!!ps&&ps[j.para]+ps[j.para+1]===want;}
        if(same)at=v;}catch{}finally{t.free();}}
    if(at===null)continue;
    d=new Document(current);
    try{d.splitParagraph(j.sec,j.para,at);
      const hang=Math.max(0,-(j.pp.indent||0)),side=j.right?'marginRight':'marginLeft',left=(j.pp.marginLeft||0)+hang,narrowed=(j.pp[side]||0);
      const fmt=j.right?{marginRight:Math.round(Math.max(0,narrowed-j.room)*150),marginLeft:Math.round(left*150)}:{marginLeft:Math.round((Math.max(0,narrowed-j.room)+hang)*150)};
      d.applyParaFormat(j.sec,j.para+1,J({...fmt,indent:0,spacingBefore:0,spacingAfter:Math.round((j.pp.spacingAfter||0)*150)}));
      // 앞 문단 마지막 줄은 원래 문단에서 꽉 찬 가운데 줄이었다 — 마지막 줄이라 왼쪽 정렬로 바뀌어 그림 앞이 비었다(사용자 지적). 양쪽 정렬이면 배분 정렬(엔진 이름 split)로.
      // 단, 그 줄이 거의 찰 때(80% 이상)만 — 어절 단위라 짧아진 줄을 퍼뜨리면 「동일한    입사각    θ로」처럼 크게 벌어졌다.
      d.applyParaFormat(j.sec,j.para,J({spacingAfter:0}));d.reflowLinesegs();
      if(j.pp.alignment==='justify'&&lastLineFill(d,j.sec,j.para)>=.8)d.applyParaFormat(j.sec,j.para,J({alignment:'split'}));
      d.reflowLinesegs();if(fit)fitQuestionParagraph(d,j.sec,j.para+1,{...fit,school:true});d.reflowLinesegs();current=exportLayoutHwpx(d,CFB);
    }finally{d.free();}
  }
  return current;
}
// 자간 맞춤 뒤 그림 옆 다시 맞추기(11-02 학교 양식): settleFloatingPictures가 그림 옆 문단을 좁힌 뒤 자간 맞춤(line-fit)이 그 문단을 줄이면
// 다음 문단이 그림 높이 안으로 올라와 좁혀지지 않은 채 그림과 겹쳤다(통합과학 27번). 그림 높이 안에서 시작하는 다음 글 문단은 마저 좁히고,
// 표·그림 문단이면 앞 문단 아래 간격으로 그림 밑에 둔다.
// 돌려주는 값: 새로 좁힌 문단 번호들(부르는 쪽이 자간 맞춤을 다시 건다).
export function resettleBesidePictures(document){
  const P=JSON.parse,J=JSON.stringify,GAP=4;let changed=0;const narrowed=[];
  for(let page=0;page<document.pageCount();page++)for(const c of (P(document.getPageControlLayout(page)).controls||[]).filter(c=>c.type==='image'&&!(c.cellPath||[]).length)){
    let pr;try{pr=P(document.getPictureProperties(c.secIdx,c.paraIdx,c.controlIdx));}catch{continue;}
    if(pr.treatAsChar||pr.textWrap!=='InFrontOfText')continue;
    const right=pr.horzAlign!=='Left',room=c.w+((right?pr.outerMarginLeft:pr.outerMarginRight)||0)/75+GAP+2,side=right?'marginRight':'marginLeft',bottom=c.y+c.h;
    const runs=(P(document.getPageTextLayout(page)).runs||[]).filter(r=>!(r.cellPath||[]).length&&r.secIdx===c.secIdx&&String(r.text||'').trim());
    const ctlParas=new Set((P(document.getPageControlLayout(page)).controls||[]).filter(x=>!(x.cellPath||[]).length&&(x.type==='table'||(x.type==='image'&&x!==c))).map(x=>x.paraIdx));
    let prev=c.paraIdx;
    for(let para=c.paraIdx+1;para<c.paraIdx+12;para++){
      const own=runs.filter(r=>r.paraIdx===para);const top=own.length?Math.min(...own.map(r=>r.y)):null;
      if(ctlParas.has(para)){const ctlTop=Math.min(...(P(document.getPageControlLayout(page)).controls||[]).filter(x=>x.paraIdx===para&&!(x.cellPath||[]).length).map(x=>x.y));
        if(ctlTop<bottom+GAP){const pp=P(document.getParaPropertiesAt(c.secIdx,prev));document.applyParaFormat(c.secIdx,prev,J({spacingAfter:Math.round(((pp.spacingAfter||0)+bottom+GAP-ctlTop)*150)}));changed++;}break;}
      if(top===null||top>=bottom)break;
      const pp=P(document.getParaPropertiesAt(c.secIdx,para));
      if((pp[side]||0)<room*.8){document.applyParaFormat(c.secIdx,para,J({[side]:Math.round(((pp[side]||0)+room)*150)}));changed++;narrowed.push([c.secIdx,para]);}
      prev=para;
    }
  }
  if(changed)document.reflowLinesegs();
  return narrowed;
}
// 글 옆 표: 첫 지문(번호 문단) 바로 앞 문단에 든 표를 떠 있는 표로 바꾼다. 줄 배치는 settleFloatingPictures가 맞춘다.
export function applyFloatingTable(document,spec,number){
  if(!spec)return;
  const prefix=`${number}. `;
  for(let page=0;page<document.pageCount();page++){
    const run=JSON.parse(document.getPageTextLayout(page)).runs.find(r=>!r.cellPath?.length&&(r.text.startsWith(prefix)||r.text===`${number}.`));if(!run)continue;
    const t=(JSON.parse(document.getPageControlLayout(page)).controls||[]).find(c=>c.type==='table'&&!c.cellPath?.length&&c.paraIdx===run.paraIdx-1);
    if(!t)throw Error('글 옆 표를 찾지 못했습니다.');
    const r=JSON.parse(document.setTableProperties(t.secIdx,t.paraIdx,t.controlIdx,JSON.stringify({treatAsChar:false,textWrap:'InFrontOfText',horzRelTo:'Column',horzAlign:spec.align,vertRelTo:'Para',vertAlign:'Top',vertOffset:0,horzOffset:0})));
    if(r?.ok===false)throw Error('글 옆 표를 배치하지 못했습니다.');return;
  }
  throw Error('글 옆 표의 지문을 찾지 못했습니다.');
}

// 빈 「ㄱ.」「①」 뒤 한 칸을 고정 띄어쓰기(U+00A0)로(10-22 O5). 조판 기준 parts.labelSpace가 'fixed'일 때만(10-23: 교사가 고름, 수능 틀은 보통 띄어쓰기).
// HTML 붙여넣기는 &nbsp;를 보통 띄어쓰기로 바꿔서, 들여온 뒤 엔진 문서에서 바꾼다. 글이 이미 들어간 칸은 손대지 않는다 — 비어 있는 자리만(교사가 칠 자리).
export function fixedLabelSpaces(document,section=0){
  const J=JSON.stringify;let count=0;
  for(const r of nativeRuns(document,section)){
    if(!r.path||!/^(?:[ㄱ-ㅎ]\.|[①-⑳]) $/.test(r.text))continue;
    const at=r.text.length-1,path=J(r.path);
    document.deleteTextInCellByPath(section,r.parent,path,at,1);document.insertTextInCellByPath(section,r.parent,path,at,'\u00a0');count++;
  }
  return count;
}

// 11-06 사용자: 〈보기〉에 분수 같은 키 큰 수식 줄이 있으면 줄 사이가 너무 벌어졌다(원본은 분수 줄 1.4배, 엔진은 1.9배).
// 엔진은 수식 상자 위쪽 빈 공간까지 줄 높이로 잡고 그 위에 줄 간격을 또 얹는다. 한글처럼 「잉크 기준」 간격으로 줄 배치(lineseg)만 손본다:
//   간격 = max(보통 줄 간격, 앞 줄 잉크 아래 + 다음 줄 잉크 위 + 0.4em), 지금보다 넓히지는 않는다.
// 문단 첫 줄은 vertpos, 같은 문단 안 줄은 앞 줄 spacing으로 당긴다(엔진이 문단 안 줄은 앞 줄 높이+spacing으로 다시 쌓는다).
// 줄인 만큼 〈보기〉 칸·표 높이도 줄인다. 상자 안에 든 〈보기〉(겹친 표)와 학교 양식(applyLiftTallEquations가 따로 맡음)은 건드리지 않는다.
// itemGap(시안용, 기본 끔): 여러 줄 항목 다음 항목(ㄴ→ㄷ)은 그 항목 안 줄 사이 간격보다 itemGap×보통 글자 높이만큼 더 띄운다
// (11-07 사용자: ㄴ 안이 분수 두 줄이라 벌어지고 ㄷ 앞은 붙어서 ㄴ 둘째 줄이 ㄷ에 붙어 보임).
export function tightenBogiTallLines(xml,{itemGap=null}={}){
  const num=(tag,key)=>Number(tag.match(new RegExp(`\\b${key}="(-?\\d+)"`))?.[1]);
  const edits=[];
  for(const m of xml.matchAll(/<hp:tc\b(?:(?!<hp:tc\b|<\/hp:tc>)[\s\S])*<\/hp:tc>/g)){
    const tc=m[0];if(!tc.includes('<hp:equation'))continue;
    const paras=[...tc.matchAll(/<hp:p\b[\s\S]*?<\/hp:p>/g)];
    const text=p=>p.replace(/<hp:equation\b[\s\S]*?<\/hp:equation>/g,'').replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/g,'').replace(/<[^>]+>/g,'');
    if(paras.length<2||!paras.every(p=>/^\s*[ㄱ-ㅎ]\./.test(text(p[0]))))continue;
    // 바깥 표가 칸 안에 들어 있으면(상자 안 〈보기〉) 건너뛴다.
    const before=xml.slice(0,m.index),tbl=before.lastIndexOf('<hp:tbl');if(tbl<0)continue;
    if((before.slice(0,tbl).match(/<hp:tc\b/g)||[]).length>(before.slice(0,tbl).match(/<\/hp:tc>/g)||[]).length)continue;
    const lines=[];
    for(const [pi,p] of paras.entries())for(const [li,s] of [...p[0].matchAll(/<hp:lineseg\b[^>]*>/g)].entries())
      lines.push({pi,li,tag:s[0],at:m.index+p.index+s.index,pos:num(s[0],'vertpos'),h:num(s[0],'vertsize'),b:num(s[0],'baseline'),sp:num(s[0],'spacing')});
    if(lines.length<2||lines.some(l=>![l.pos,l.h,l.b,l.sp].every(Number.isFinite)))continue;
    const hn=Math.min(...lines.map(l=>l.h));if(!lines.some(l=>l.h>hn*1.4))continue;
    // 지금 기준선 자리(엔진과 같게 쌓는다).
    let top=lines[0].pos;for(const [k,l] of lines.entries()){if(k&&l.li===0)top=l.pos;else if(k)top=lines[k-1].top+lines[k-1].h+lines[k-1].sp;l.top=top;l.base=top+l.b;}
    const normal=lines.find(l=>l.h<=hn*1.1),pn=(normal?normal.h+normal.sp:hn*1.45);
    const ink=l=>{if(l.h<=hn*1.4)return {up:.8*hn,down:.2*hn};const half=l.h*.35,axis=.25*hn;return {up:half+axis,down:half-axis};};
    let cut=0;const out=lines.map(l=>({...l}));
    const inner=new Map();// 문단마다 안쪽 줄 사이 잉크 간격(당긴 뒤) 최댓값
    for(let k=1;k<lines.length;k++)if(lines[k].li>0){const now=lines[k].base-lines[k-1].base,d=ink(lines[k-1]).down,u=ink(lines[k]).up,w=Math.max(pn,d+u+.4*hn);inner.set(lines[k].pi,Math.max(inner.get(lines[k].pi)||0,Math.min(now,w)-d-u));}
    for(let k=1;k<lines.length;k++){
      let want=Math.max(pn,ink(lines[k-1]).down+ink(lines[k]).up+.4*hn),grow=false;
      if(itemGap!=null&&lines[k].li===0&&inner.has(lines[k-1].pi)){want=Math.max(want,inner.get(lines[k-1].pi)+ink(lines[k-1]).down+ink(lines[k]).up)+itemGap*hn;grow=true;}
      // 항목 경계(grow)는 엔진 간격보다 넓힐 수도 있다(ㄴ 안 줄 사이보다 ㄷ 앞이 좁아 보이지 않게).
      const now=lines[k].base-lines[k-1].base,r=grow?Math.round(now-want):Math.max(0,Math.round(now-want));
      cut+=r;
      if(lines[k].li===0)out[k].pos=lines[k].pos-cut;else out[k-1].sp-=r;
      // 같은 문단 안 다음 줄들은 엔진이 쌓으므로 vertpos만 맞춰 둔다(값이 어긋나지 않게).
    }
    if(cut<=0)continue;
    // 새 vertpos를 엔진처럼 다시 쌓아 적는다.
    let t2=out[0].pos;for(const [k,l] of out.entries()){if(k&&l.li===0)t2=l.pos;else if(k)t2=out[k-1].top2+out[k-1].h+out[k-1].sp;l.top2=t2;}
    for(const l of out){const tag=l.tag.replace(/\bvertpos="-?\d+"/,`vertpos="${l.top2}"`).replace(/\bspacing="-?\d+"/,`spacing="${l.sp}"`);if(tag!==l.tag)edits.push([l.at,l.tag,tag]);}
    const size=tc.match(/<hp:cellSz\b[^>]*>/)?.[0];if(size)edits.push([m.index+tc.indexOf(size),size,size.replace(/\bheight="(\d+)"/,(x,v)=>`height="${Math.max(0,Number(v)-cut)}"`)]);
    const tsz=xml.slice(tbl).match(/<hp:sz\b[^>]*>/);if(tsz)edits.push([tbl+tsz.index,tsz[0],tsz[0].replace(/\bheight="(\d+)"/,(x,v)=>`height="${Math.max(0,Number(v)-cut)}"`)]);
  }
  for(const [index,old,next] of edits.sort((a,b)=>b[0]-a[0]))xml=xml.slice(0,index)+next+xml.slice(index+old.length);
  return xml;
}
// 11-07 사용자 「안 1」: 여러 줄 항목 다음 항목 앞은 그 항목 안 줄 사이만큼(ㄴ 둘째 줄이 ㄷ에 붙어 보이지 않게).
export const BOGI_ITEM_GAP=0;
export async function applyTightBogi(bytes,JSZip,{itemGap=BOGI_ITEM_GAP}={}){
  const zip=await JSZip.loadAsync(new Uint8Array(bytes));let changed=false;
  for(const name of Object.keys(zip.files).filter(n=>/^Contents\/section\d+\.xml$/.test(n))){const xml=await zip.file(name).async('string'),next=tightenBogiTallLines(xml,{itemGap});if(next!==xml){zip.file(name,next);changed=true;}}
  return changed?zip.generateAsync({type:'uint8array',compression:'DEFLATE'}):bytes;
}
// 11-07 사용자: 수능 틀 본문·선지에서 분수 같은 키 큰 수식 줄 위가 원본보다 2배 넘게 벌어졌다(17번 「p와 / y축」 2.1→5.1mm, 발문→선지 3.8→6.6mm).
// 까닭은 학교 양식 끌어올리기(liftTallEquations)와 같다 — 엔진이 수식을 줄 맨 위보다 아래에 그려 위에 빈틈이 생긴다.
// 수능 틀은 빈틈만큼 줄 높이를 줄이고 돌려주지 않는다(뒤 줄이 그만큼 올라온다). 본문은 문단 줄 배치를, 선지 표(①~⑤로 시작하는 칸)는 칸·표 높이까지 줄인다.
// 〈보기〉 칸은 tightenBogiTallLines가 따로 맡는다. 다시 해도 같다(줄인 줄은 수식 높이와 달라져 다시 잡히지 않음).
export function tightenKiceTallLines(xml,dropOf,planOf=()=>null){
  const num=(tag,key)=>Number(tag.match(new RegExp(`\\b${key}="(-?\\d+)"`))?.[1]);
  const paragraphs=[],stack=[];let top=0;
  for(const m of xml.matchAll(/<hp:p\b[^>]*>|<\/hp:p>/g)){
    if(m[0].startsWith('</')){const p=stack.pop();if(p)p.end=m.index;}
    else{const p={start:m.index,body:m.index+m[0].length,depth:stack.length,para:stack.length?-1:top++};paragraphs.push(p);stack.push(p);}
  }
  const edits=[];
  // 1) 수식 든 문단(안에 다른 문단이 없는 것): 키 큰 수식 줄을 끌어올린다.
  const lift=new Map();// 문단 → 줄마다 줄인 양
  for(const p of paragraphs){
    if(p.end===undefined)continue;const body=xml.slice(p.body,p.end);if(body.includes('<hp:p ')||!body.includes('<hp:equation'))continue;
    // 표 칸 안(선지·〈보기〉·자료 표)은 건드리지 않는다 — 11-07 사용자: 선지 표에 분수 칸과 보통 칸이 섞이면 분수 칸 글만 올라가 같은 줄이 어긋났다.
    if(p.depth)continue;
    const eqs=[...body.matchAll(/<hp:equation\b[^>]*>[\s\S]*?<\/hp:equation>/g)].map(m=>({unit:num(m[0].match(/^<hp:equation\b[^>]*>/)[0],'baseUnit')||1100,h:num(m[0].match(/<hp:sz\b[^>]*>/)?.[0]||'','height'),script:(m[0].match(/<hp:script>([\s\S]*?)<\/hp:script>/)?.[1]||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&')})).filter(e=>Number.isFinite(e.h)&&e.h>e.unit*1.4);
    if(!eqs.length)continue;
    const array=body.match(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/);if(!array)continue;
    const segs=[...array[0].matchAll(/<hp:lineseg\b[^>]*>/g)],at=p.body+array.index;
    const heights=segs.map(m=>num(m[0],'vertsize'));
    const others=heights.filter(v=>!eqs.some(e=>Math.abs(e.h-v)<=40)),floor=Math.max(Math.min(...others,Infinity)===Infinity?0:Math.min(...others),Math.round(Math.max(...eqs.map(e=>e.unit))/0.9));
    const cuts=[];let shift=0;
    for(const [i,m] of segs.entries()){
      const v=heights[i],near=eqs.filter(e=>Math.abs(e.h-v)<=40);let tag=m[0].replace(/\bvertpos="-?\d+"/,`vertpos="${num(m[0],'vertpos')-shift}"`),r=0;
      if(near.length){
        // 본문: 엔진이 그린 자리(실측)로 수식 위·아래 빈 곳을 보통 줄 사이(G)에 맞춘다. 줄 높이를 L 줄이면 수식이 0.85L 올라오고,
        // 줄 사이를 L−y 늘리면 다음 줄은 y만 올라온다. 문단 끝 줄은 다음 줄이 다른 문단이라 줄인 만큼 그대로 올린다(y=L).
        const plan=planOf(p.para,i,segs.length),sp=num(m[0],'spacing')||0;
        // 문단 첫 줄은 엔진이 문단 모양으로 줄 자리를 다시 잡아 손대면 아래만 벌어지거나(올리면) 다음 줄과 겹쳤다(11-07 p2_2024_07_13 등) — 그대로 둔다.
        if(i>0&&plan&&Number.isFinite(plan.above)&&plan.above>plan.gap){
          // 수식은 줄 맨 위보다 더 올라가지 않는다(엔진) — 그 이상 줄이면 글자만 올라가 수식과 어긋난다. drop(엔진 실측)까지만.
          const drop=Math.min(...near.map(e=>dropOf(e.script,e.unit)));
          const L=Math.max(0,Math.min(v-floor,Math.round(drop/0.85),Math.round((plan.above-plan.gap)/0.85)));
          // 다음 줄은 수식 아래가 보통 줄 사이만큼 남도록 올린다(지금보다 좁아지면 그대로 둔다).
          let y=Number.isFinite(plan.below)?Math.round(plan.below+L*.85-plan.gap):L;y=Math.max(0,Math.min(y,sp+L));
          if(L>0||y>0){tag=tag.replace(/\bvertsize="-?\d+"/,`vertsize="${v-L}"`).replace(/\btextheight="-?\d+"/,`textheight="${v-L}"`).replace(/\bbaseline="-?\d+"/,`baseline="${Math.round((v-L)*.85)}"`).replace(/\bspacing="-?\d+"/,`spacing="${sp+L-y}"`);r=y;}
        }}
      cuts.push(r);if(tag!==m[0])edits.push([at+m.index,m[0],tag]);shift+=r;
    }
    if(!shift)continue;
    lift.set(p,shift);
  }
  // 2) 한 줄 선지 표에서 모든 칸이 분수(키 큰 수식)인 것만: 분수 위 빈 곳을 줄인다(11-07 사용자 「글 선지처럼 깔끔하게」).
  //    분수 칸 줄을 drop만큼 끌어올리고(줄 높이 −L) 모든 칸·표 높이를 L 줄인다. 보통 칸이 섞인 줄(①2 ②7/3)은 엔진이 보통 칸 글 자리를
  //    줄 배치로 옮기지 않아(실측: 칸 아래로 넘침) 그대로 둔다. 여러 행 표도 그대로.
  for(const host of paragraphs.filter(p=>!p.depth&&p.end!==undefined)){
    const body=xml.slice(host.body,host.end);if((body.match(/<hp:tbl\b/g)||[]).length!==1||!body.includes('<hp:equation'))continue;
    const tbl=host.body+body.indexOf('<hp:tbl'),end=xml.indexOf('</hp:tbl>',tbl),cells=[...xml.slice(tbl,end).matchAll(/<hp:tc\b[\s\S]*?<\/hp:tc>/g)].map(m=>({at:tbl+m.index,xml:m[0]}));
    const text=c=>c.replace(/<hp:equation\b[\s\S]*?<\/hp:equation>/g,'').replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/g,'').replace(/<[^>]+>/g,'');
    if(cells.length<2||!cells.every(c=>/^\s*[①②③④⑤]/.test(text(c.xml))))continue;
    if(new Set(cells.map(c=>num(c.xml.match(/<hp:cellAddr\b[^>]*>/)?.[0]||'','rowAddr'))).size!==1)continue;
    const info=cells.map(c=>{const segs=[...c.xml.matchAll(/<hp:lineseg\b[^>]*>/g)];if(segs.length!==1)return null;
      const eq=[...c.xml.matchAll(/<hp:equation\b[^>]*>[\s\S]*?<\/hp:equation>/g)].map(m=>({unit:num(m[0].match(/^<hp:equation\b[^>]*>/)[0],'baseUnit')||1100,h:num(m[0].match(/<hp:sz\b[^>]*>/)?.[0]||'','height'),script:(m[0].match(/<hp:script>([\s\S]*?)<\/hp:script>/)?.[1]||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')}));
      const v=num(segs[0][0],'vertsize'),tall=eq.filter(e=>e.h>e.unit*1.4&&Math.abs(e.h-v)<=40);return {...c,seg:segs[0][0],segAt:c.at+segs[0].index,v,tall};});
    if(info.some(x=>!x||!x.tall.length))continue;
    const drops=info.map(x=>Math.min(...x.tall.map(e=>dropOf(e.script,e.unit))));
    // 칸·표는 0.7L만 줄인다 — L 다 줄이면 분모가 칸 아래 선에 닿았다(11-07 31문항 눈 확인).
    const L=Math.round(Math.min(...drops)/0.85),cut=Math.round(L*.7);if(!(L>40))continue;
    for(const x of info){
      let tag=x.seg;
      {const n=x.v-L;tag=tag.replace(/\bvertsize="-?\d+"/,`vertsize="${n}"`).replace(/\btextheight="-?\d+"/,`textheight="${n}"`).replace(/\bbaseline="-?\d+"/,`baseline="${Math.round(n*.85)}"`);}
      if(tag!==x.seg)edits.push([x.segAt,x.seg,tag]);
      const size=x.xml.match(/<hp:cellSz\b[^>]*>/)?.[0];if(size)edits.push([x.at+x.xml.indexOf(size),size,size.replace(/\bheight="(\d+)"/,(m,v)=>`height="${Math.max(0,Number(v)-cut)}"`)]);
    }
    const sz=xml.slice(tbl,end).match(/<hp:sz\b[^>]*>/);if(sz)edits.push([tbl+sz.index,sz[0],sz[0].replace(/\bheight="(\d+)"/,(m,v)=>`height="${Math.max(0,Number(v)-cut)}"`)]);
    lift.set(host,(lift.get(host)||0)+cut);
  }
  // 3) 줄인 만큼 뒤 본문 문단 줄 배치(vertpos)를 올린다(같은 문단 안은 1)에서 맞춤).
  let carry=0;
  for(const p of paragraphs.filter(p=>!p.depth&&p.end!==undefined)){
    if(carry){const body=xml.slice(p.body,p.end),last=body.lastIndexOf('<hp:linesegarray>'),inner=body.lastIndexOf('</hp:p>');
      if(last>inner){const arr=body.slice(last,body.indexOf('</hp:linesegarray>',last));
        for(const m of arr.matchAll(/<hp:lineseg\b[^>]*>/g)){const at=p.body+last+m.index,done=edits.find(e=>e[0]===at),old=done?done[2]:m[0],tag=old.replace(/\bvertpos="(-?\d+)"/,(x,v)=>`vertpos="${Number(v)-carry}"`);
          if(done)done[2]=tag;else edits.push([at,m[0],tag]);}}}
    carry+=lift.get(p)||0;
  }
  for(const [index,old,next] of edits.sort((a,b)=>b[0]-a[0]))xml=xml.slice(0,index)+next+xml.slice(index+old.length);
  return xml;
}
export async function applyKiceTallLines(bytes,JSZip,Document){
  const zip=await JSZip.loadAsync(new Uint8Array(bytes));let changed=false;
  const document=new Document(bytes),lines=new Map(),equations=[];
  try{
    // 줄마다 실제 그려진 위치(본문만) — 수식 아래와 다음 줄 사이를 잰다(applyLiftTallEquations와 같은 방법).
    for(let page=0;page<document.pageCount();page++){
      for(const r of JSON.parse(document.getPageTextLayout(page)).runs.filter(r=>!r.cellPath?.length)){
        const key=r.secIdx+':'+r.paraIdx,list=lines.get(key)||[];
        const same=list.find(l=>l.page===page&&Math.abs(l.y-r.y)<.2),f=r.fontSize||r.h;
        if(same){same.h=Math.max(same.h,r.h);same.f=Math.max(same.f,f);}else list.push({page,y:r.y,h:r.h,f});lines.set(key,list);
      }
      equations.push(...JSON.parse(document.getPageControlLayout(page)).controls.filter(c=>c.type==='equation'&&!c.cellPath?.length).map(c=>({...c,page})));
    }
    for(const list of lines.values())list.sort((a,b)=>a.page-b.page||a.y-b.y);
    for(const name of Object.keys(zip.files).filter(n=>/^Contents\/section\d+\.xml$/.test(n))){
      const section=Number(name.match(/section(\d+)/)[1]);
      // 본문 줄을 쪽마다 위에서부터 늘어놓는다(문단 경계를 넘어 앞 줄을 찾으려고).
      const flow=[...lines.entries()].filter(([k])=>k.startsWith(section+':')).flatMap(([k,list])=>list.map((l,i)=>({...l,para:Number(k.split(':')[1]),i,count:list.length}))).sort((a,b)=>a.page-b.page||a.y-b.y);
      const gaps=[];for(let k=1;k<flow.length;k++){const a=flow[k-1],b=flow[k];if(a.page===b.page&&a.para===b.para&&a.h<a.f*1.4&&b.h<b.f*1.4)gaps.push(b.y-a.y-a.f);}
      gaps.sort((a,b)=>a-b);const gap=gaps.length?gaps[gaps.length>>1]:null;
      const planOf=(para,line,count)=>{
        const at=flow.findIndex(l=>l.para===para&&l.i===line);if(at<0||gap===null||flow[at].count!==count)return null;
        const here=flow[at],prev=flow[at-1],next=line+1<count?flow[at+1]:null;if(!prev||prev.page!==here.page||prev.h>=prev.f*1.4)return null;
        const own=equations.filter(e=>e.secIdx===section&&e.paraIdx===para&&e.page===here.page&&e.y>=here.y-.8&&(!next||e.y<next.y-.8)&&e.h>here.f*1.4);if(!own.length)return null;
        // 키 큰 수식(분수) 잉크는 상자 높이의 6%~83%(11-07 화면 실측: 2023 6월 물Ⅰ 14번 ¼mg, 2026 수능 물Ⅱ 17번 1/(2√3)).
        const top=Math.min(...own.map(e=>e.y+e.h*.06)),bottom=Math.max(...own.map(e=>e.y+e.h*.83));
        return {gap:gap*75,above:(top-(prev.y+prev.f))*75,below:next&&next.page===here.page?(next.y-bottom)*75:-Infinity};
      };
      const xml=await zip.file(name).async('string'),next=tightenKiceTallLines(xml,(script,unit)=>equationDrop(Document,script,unit),planOf);
      if(next!==xml){zip.file(name,next);changed=true;}
    }
  }finally{document.free();}
  return changed?zip.generateAsync({type:'uint8array',compression:'DEFLATE'}):bytes;
}
