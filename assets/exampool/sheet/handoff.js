import {FORMAT,clone,validate,tableCovered,openingSideText,isWrapped} from './model.js';
import {mathParts} from './typeset-model.js';
import {splitWidths,sizedWidth,gapPx,choiceColumns} from './placement.js';

const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels=['①','②','③','④','⑤'];
// 평가원 표·상자: 가는 검은 선.
const RULE='0.4pt solid #000';
// 물리량(소문자 한 글자 변수)은 기울이고, 숫자 뒤 단위(2 m, 3 m/s)는 바로 세운다. 대문자(물체 A, B)는 바로 세운다.
// 수식($…$)은 한글 수식으로 따로 만들어지므로 여기 오지 않는다. HTML 이스케이프 뒤의 글을 받는다.
export const italicVariables=html=>html.replace(/(?<![A-Za-z&#/])(?<!\d\s{1,2})([a-z])(?![A-Za-z;/])/g,'<i>$1</i>');
// 수식 폭 어림(한글 엔진이 없을 때): 명령어(\\frac 등)는 빼고, 분수는 분자·분모 중 긴 쪽만 센다.
export function equationEstimate(script,fontSize=11){
  const em=fontSize*4/3;let s=String(script);
  for(let i=0;i<4&&/\\frac\{([^{}]*)\}\{([^{}]*)\}/.test(s);i++)s=s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g,(_,a,b)=>a.length>=b.length?a:b);
  const visible=s.replace(/\\[A-Za-z]+/g,'x').replace(/[{}^_\s]/g,'');
  return {w:Math.max(1,[...visible].length)*em*.62+2,h:/\\frac|\\over|\bover\b/.test(script)?em*2.5:em*1.1};
}
const plainWidth=(text,em)=>[...text].reduce((n,c)=>n+em*(/\s/.test(c)?.5:c.codePointAt(0)<256?.62:1),0);
function choiceWidth(value,fontSize){
  const em=fontSize*4/3;
  return mathParts(value).reduce((sum,part)=>sum+(part.math?equationEstimate(part.text,fontSize).w:plainWidth(part.text,em)),0);
}
// Short combinations share one baseline, as in the supplied exam. Longer
// choices get fewer columns; their numbers and continuation text stay together.
export function choiceGrid(choices,width,fontSize=11,layout,measure=choiceWidth){
  const fixed=choiceColumns(layout,choices.length);
  // 한글 문서로 보낼 때는 실제 글꼴 폭(measure)으로 잰다. 어림셈은 넓게 잡혀 기출보다 일찍 줄이 나뉜다.
  const sizes=choices.map((c,i)=>measure(labels[i]+' '+c.text,fontSize)+4),fits=choices.every(c=>!/[\r\n]/.test(c.text))&&sizes.reduce((a,b)=>a+b,0)<=width;
  // 「한 줄」이라도 똑같이 나누면 긴 선지(ㄱ, ㄴ, ㄷ)만 줄이 넘어간다. 다 들어가면 남는 폭을 고루 나눠 준다.
  if(fixed&&!(fixed===choices.length&&fits))return {cols:fixed,widths:Array(fixed).fill(width/fixed),singleLine:fixed===choices.length};
  if(fits){
    const gap=(width-sizes.reduce((a,b)=>a+b,0))/sizes.length;
    return {cols:sizes.length,widths:sizes.map(w=>w+gap),singleLine:true};
  }
  const max=Math.max(...sizes),cols=[3,2,1].find(n=>n<=choices.length&&max<=width/n)||1;
  return {cols,widths:Array(cols).fill(width/cols)};
}
// Break at word boundaries before native import. Cell auto-layout alone can
// squeeze a long header into one line and paint its Latin units into the next
// cell. Explicit lines keep the actual text editable and its font unchanged.
// 구성 이름이 한글 문서에 글로 찍히는지: 상자 묶음의 제목, 과정 제목, (가)·(나) 같은 그림 이름. 아래 조판과 같은 조건.
export const labelInDocument=b=>!!b.label&&(b.kind==='steps'||b.heading===true||b.kind==='group'&&(b.boxed===true||b.boxed===undefined&&b.label==='실험')||b.kind==='figure'&&!!b.figure&&!isWrapped(b)&&/^\(.+\)$/.test(b.label));
export function wrapQuestionText(value,width,fontSize=11){
  if(!width)return String(value??'');
  const em=fontSize*4/3,limit=Math.max(em,width),lines=[];
  const measure=word=>{
    let equations=0;const plain=word.replace(/EXAMPOOL_EQ_\d+_END/g,()=>{equations++;return '';});
    return equations*em*3+[...plain].reduce((sum,c)=>sum+em*(c.codePointAt(0)<256?/^[MW@]$/.test(c)?.95:.62:1),0);
  };
  for(const original of String(value??'').split(/\r?\n/)){
    let line='',used=0;
    for(const word of original.split(/\s+/)){
      const size=measure(word),space=line?em*.5:0;
      if(line&&used+space+size>limit){lines.push(line);line=word;used=size;}
      else{line+=(line?' ':'')+word;used+=space+size;}
    }
    lines.push(line);
  }
  return lines.join('\n');
}
// 실제 한글 글꼴로 잰 폭으로 어절 단위 줄바꿈. 첫 줄과 다음 줄의 폭을 따로 받는다(번호 뒤 내어쓰기).
export function wrapMeasured(value,first,rest,measure){
  const lines=[];
  for(const original of String(value??'').split(/\r?\n/)){
    let line='',firstLine=!lines.length;
    for(const word of original.split(/\s+/)){
      const candidate=line?line+' '+word:word,limit=firstLine&&!lines.length?first:rest;
      if(line&&measure(candidate)>limit){lines.push(line);line=word;firstLine=false;}else line=candidate;
    }
    lines.push(line);
  }
  return lines.join('\n');
}
// <보기> 상자: 마지막 줄 글자 아래에서 상자 선까지 남길 높이(px). 평가원 지면처럼 반 줄쯤(약 3mm).
const BOGI_BOTTOM=14;
export function handoffQuestion(value,{skeleton=false}={}){
  const q=clone(value);q.references=[];
  validate({format:FORMAT,questions:[q],documents:[]});
  if(!skeleton&&!q.ask.trim())throw Error('발문을 입력한 뒤 한글로 보내세요.');
  return q;
}
// 틀 보기(한글 창 전용): 아직 비어 있는 발문·글·그림 자리에 회색 안내를 넣어 문항 모양을 먼저 보여 준다.
// 안내 글은 시트 값이 아니므로 주인이 없고(한글 창에서 고쳐도 시트로 가지 않음), 조판 저장도 하지 않는다.
const GHOST_INK='#9aa0a6';
const ghostName=b=>b.label&&!/^\(.+\)$/.test(b.label)?b.label:'지문';
export function skeletonKey(value){
  const keys=[];if(!String(value.ask||'').trim())keys.push('ask');
  for(const b of value.blocks||[]){if(b.kind==='text'&&!String(b.text||'').trim())keys.push('block:'+b.id);if(b.kind==='figure'&&!b.figure)keys.push('figure:'+b.id);}
  return keys.join('|');
}
function fillSkeleton(q){
  const ghosts=new Set(),figures=new Set();
  if(!q.ask.trim()){q.ask='발문 (카드에서 입력)';ghosts.add('ask');}
  for(const b of q.blocks){
    if(b.kind==='text'&&!b.text.trim()){b.text=`${ghostName(b)} (카드에서 입력)`;ghosts.add('block:'+b.id);}
    if(b.kind==='figure'&&!b.figure)figures.add(b.id);
  }
  return {ghosts,figures};
}

// HTML is an import boundary, not a screenshot: RHWP creates native nested
// tables, cell spans, text paragraphs and embedded picture controls from it.
export function wrapHangingText(value,width,prefix,measure){
  const indent=measure(prefix),lines=[];
  for(const original of String(value).split(/\r?\n/)){
    let line='';
    for(const word of original.split(/\s+/)){
      const candidate=line?line+' '+word:word,limit=width-(lines.length?indent:0);
      if(line&&measure(candidate)>limit){lines.push(line);line=word;}
      else line=candidate;
    }
    lines.push(line);
  }
  return lines.join('\n');
}
export async function buildQuestionHtml(value,prepareFigure=async f=>f,width=540,{native=false,measureText,skeleton=false,ghostFigure=null}={}){
  const q=handoffQuestion(value,{skeleton}),ghost=skeleton?fillSkeleton(q):{ghosts:new Set(),figures:new Set()},images=[],texts=[],warnings=[],tables=[],equations=[];
  // 문서 순서대로 그림·표가 어느 구성의 것인지 기록한다(한글 창에서 끌어 배치할 때 짝짓기).
  const imageOwners=[],tableOwners=[],textSegments=[],floats=[];
  const recordTable=(rows,cols,merges=[],owner={kind:'layout'},at=null)=>{const shape={rows,cols,merges:merges.map(m=>`${m.r}:${m.c}:${m.rs}:${m.cs}`).sort()};if(at===null){tables.push(shape);tableOwners.push(owner);}else{tables[at]=shape;tableOwners[at]=owner;}};
  // 가로 묶음 칸·상자 표의 줄 안에서는 칸이 모두 빈 표를 한글 엔진이 빠뜨린다. 그 자리의 빈 칸에만 보이지 않는
  // 단어 연결 문자(U+2060)를 둔다. 문자 참조(&#…;)는 엔진이 글자 그대로 찍고, U+200B·U+FEFF는 저장할 때마다
  // 줄 배치가 흔들리며, 공백류는 빈 칸으로 취급된다(2026-10-16 실험).
  let nested=0,inBox=0;
  // 칸 안 글 폭·높이를 잴 때 수식은 수식 개체 크기로 잰다. 글에는 $…$ 그대로이거나 이미 수식 자리표시(EXAMPOOL_EQ_n_END)로 바뀐 것이 온다.
  const MARK=/(EXAMPOOL_EQ_\d+_END)/,eqSize=(script,fontSize)=>measureText?.equation?.(script,fontSize)||equationEstimate(script,fontSize);
  const pieces=v=>String(v??'').split(MARK).flatMap(part=>{const m=part.match(/^EXAMPOOL_EQ_(\d+)_END$/);return m?[{math:true,text:equations[Number(m[1])]?.script||''}]:mathParts(part);});
  const measureRich=(v,fontSize=11)=>pieces(v).reduce((sum,part)=>sum+(part.math?eqSize(part.text,fontSize).w:part.text?(measureText?measureText(part.text,fontSize):plainWidth(part.text,fontSize*4/3)):0),0);
  // 줄에 든 수식이 글자보다 높으면 그만큼 줄이 높아진다(분수). 칸 높이를 미리 정할 때 더한다.
  const extraHeight=(wrapped,fontSize=11)=>String(wrapped).split('\n').reduce((sum,line)=>sum+Math.max(0,...pieces(line).filter(p=>p.math).map(p=>eqSize(p.text,fontSize).h-fontSize*4/3)),0);
  const reserveTable=()=>{tables.push(null);tableOwners.push(null);return tables.length-1;};
  // 글 조각마다 주인(어느 칸의 글인지)과 앞머리 길이(번호·ㄱ.·① 등)를 남긴다. 한글 창에서 고친 글을 시트로 되돌릴 때 쓴다.
  const text=(v,width=null,fontSize=11,wrap=null,owner=null,font='함초롬바탕')=>{
    const ghostKey=owner&&(owner.kind==='ask'?'ask':owner.kind==='block'?'block:'+owner.id:null),isGhost=!!ghostKey&&ghost.ghosts.has(ghostKey),lead=isGhost?owner.prefix||0:0;
    if(isGhost)owner=null;
    let value=String(v??''),math=false;const segment=value.trim()?{value,owner}:null;if(segment)textSegments.push(segment);
    if(native)value=mathParts(value).map(part=>{if(!part.math){if(part.text.replace(/\u200b/g,'').trim())texts.push(part.text);return part.text;}math=true;const marker=`EXAMPOOL_EQ_${equations.length}_END`;equations.push({marker,script:part.text,fontSize:fontSize*100});return marker;}).join('');
    else if(value.replace(/\u200b/g,'').trim())texts.push(value);
    // [3점]은 앞 낱말과 한 덩어리로 줄을 맞춘다(혼자 다음 줄로 떨어지지 않게).
    value=value.replace(/ (\[\d+점\])$/,'\u2060$1');
    value=(wrap?wrap(value):width&&measureText?wrapMeasured(value,width,width,v=>measureRich(v,fontSize)):wrapQuestionText(value,width,fontSize)).replace(/\u2060(\[\d+점\])$/,' $1');
    // 한글 문서에 들어간 그대로의 글(어절 줄바꿈 포함). 시트에서 고친 글을 한글 창의 같은 문단에 바로 넣을 때 쓴다.
    if(segment){segment.wrapped=value;segment.math=math;}
    if(isGhost){const head=E(value.slice(0,lead)).replace(/\r?\n/g,'<br>'),rest=E(value.slice(lead)).replace(/\r?\n/g,'<br>');return native?`${head?`<span style="font-family:${font};font-size:${fontSize}pt">${head}</span>`:''}<span style="font-family:${font};font-size:${fontSize}pt;color:${GHOST_INK}">${rest}</span>`:head+rest;}
    const body=E(value).replace(/\r?\n/g,'<br>');return native?`<span style="font-family:${font};font-size:${fontSize}pt">${italicVariables(body)}</span>`:body;
  };
  const p=(v,width=null,fontSize=11,owner=null)=>`<p style="margin:4px 0;text-align:justify">${text(v,width,fontSize,v=>v,owner)}</p>`;
  // 그림 아래 (가)·(나): 평가원처럼 그림 가운데 아래.
  const pc=(v,width=null,fontSize=11,owner=null)=>`<p style="margin:4px 0;text-align:center">${text(v,width,fontSize,null,owner)}</p>`;
  const opening=q.blocks.find(b=>b.parent===null),firstText=opening?.kind==='text'&&opening.text?opening:null;
  const prefix=q.number?`${q.number}. `:'';
  // 글 옆 자료: 번호는 묶음 칸 안의 첫 지문 앞에 붙고, 발문은 자료 뒤에 온다.
  const sideText=!firstText?openingSideText(q):null;
  // 배점이 3점이면 발문 끝에 [3점]. 한글 창에서 고칠 수 없는 꼬리(suffix)로 둔다.
  const mark=q.points===3?' [3점]':'',ask=q.ask+mark,askOwner=(prefix=0)=>({kind:'ask',...(prefix?{prefix}:{}),...(mark?{suffix:mark.length}:{})});
  // 평가원 순서: 발문 다음에 <보기>. 맨 바깥 보기는 발문 뒤에 찍는다.
  const afterAsk=q.blocks.filter(b=>!b.parent&&b.kind==='bogi').map(b=>b.id);
  const picture=async(f,width,align,owner={kind:'other'})=>{
    if(!f)return '';
    const image=await prepareFigure(clone(f));
    if(!/^data:image\/png;base64,[A-Za-z0-9+/]*={0,2}$/.test(image.data))throw Error('한글에 넣을 그림을 PNG로 준비하지 못했습니다.');
    const ratio=Number(image.height)/Number(image.width);
    if(!Number.isFinite(ratio)||ratio<=0)throw Error('그림 크기를 확인하세요.');
    const w=Math.min(width,Number(image.width)),h=w*ratio;
    images.push(image.data);imageOwners.push(owner);
    const img=`<img src="${image.data}" width="${Math.round(w)}" height="${Math.round(h)}" alt="${E(image.name)}">`;
    return align?`<p style="margin:0;text-align:${{왼쪽:'left',가운데:'center',오른쪽:'right'}[align]}">${img}</p>`:img;
  };
  const table=async(t,width,choices=false,align,owner=choices?{kind:'choices'}:{kind:'table'})=>{
    recordTable(t.rows,t.cols+(choices?1:0),t.merges.map(m=>({...m,c:m.c+(choices?1:0)})),owner);
    const fontSize=t.cols>3?9:10,cellWidth=(width-(choices?25:0))/t.cols;
    const rowHeights=Array(t.rows).fill(30);
    for(let r=0;r<t.rows;r++)for(let c=0;c<t.cols;c++){
      if(tableCovered(t,r,c))continue;
      const m=t.merges.find(m=>m.r===r&&m.c===c),span=m?.rs||1;
      const cellText=t.cells[r][c].value,cellLimit=cellWidth*(m?.cs||1)-16,wrapped=measureText?wrapMeasured(cellText,cellLimit,cellLimit,v=>measureRich(v,fontSize)):wrapQuestionText(cellText,cellLimit,fontSize);
      const needed=Math.ceil(wrapped.split('\n').length*fontSize*4/3*1.6+12+extraHeight(wrapped,fontSize));
      if(span===1)rowHeights[r]=Math.max(rowHeights[r],needed);
      else {const height=rowHeights.slice(r,r+span).reduce((a,b)=>a+b,0);if(needed>height)for(let i=r;i<r+span;i++)rowHeights[i]+=(needed-height)/span;}
    }
    let html=`<table${align?` align="${{왼쪽:'left',가운데:'center',오른쪽:'right'}[align]}"`:''} style="border-collapse:collapse;width:${width}px">`;
    for(let r=0;r<t.rows;r++){
      html+='<tr>';
      if(choices)html+=`<td style="border:none;width:25px">${text(r?labels[r-1]:'')}</td>`;
      for(let c=0;c<t.cols;c++){
        if(tableCovered(t,r,c))continue;
        const cell=t.cells[r][c],m=t.merges.find(m=>m.r===r&&m.c===c),tag=r<t.headerRows?'th':'td';
        // 빈 칸에는 폭 0인 글자(ZWSP)를 둔다. 한글 엔진이 빈 표를 겹친 자리에서 빠뜨리지 않고, 한글 창에서 빈 칸에 처음 쓴 글도 그 칸으로 되돌릴 수 있다.
        // 평가원 표: 머리칸은 작은 돋움체, 값은 바탕체.
        const head=r<t.headerRows,cellFont=head?'함초롬돋움':'함초롬바탕',cellSize=head?fontSize-1:fontSize;
        const formatted=text(cell.value,cellWidth*(m?.cs||1)-16,cellSize,null,{kind:'cell',table:owner.id||owner.kind,r,c},cellFont).replace(/^<span[^>]*>|<\/span>$/g,'');
        // Separate paragraphs let the native cell center the entire header
        // block. A soft line break centers only its first line in this engine.
        let body=await picture(cell.figure,cellWidth*(m?.cs||1)-16,undefined,{kind:'cell',table:owner.id||owner.kind,r,c})+formatted.split('<br>').map(line=>`<p style="margin:0;text-align:center;font-family:${cellFont};font-size:${cellSize}pt">${line||(cell.value===''&&!cell.figure&&nested?'\u2060':'')}</p>`).join('');
        if(t.diagonal&&r===0&&c===0){
          body=p(t.diagonal.col)+p(t.diagonal.row)+body;
          warnings.push('대각선 머리글의 축 이름은 전달됩니다. 사선은 한글에서 지정하세요.');
        }
        html+=`<${tag}${m?` rowspan="${m.rs}" colspan="${m.cs}"`:''} style="border:${RULE};width:${cellWidth}px;height:${rowHeights.slice(r,r+(m?.rs||1)).reduce((a,b)=>a+b,0)}px;padding:4px;text-align:center;vertical-align:middle">${body}</${tag}>`;
      }
      html+='</tr>';
    }
    return html+'</table>'+(t.note?p(t.note,width-12,10,{kind:'note',table:owner.id||owner.kind}):'');
  };
  // 어울림 그림: 바로 앞 맨 바깥 글 문단(없으면 번호가 붙는 첫 문단)의 맨 앞에 넣고, 한글로 들여온 뒤 떠 있는 그림으로 바꾼다
  // (applyFloatingPictures). 글자처럼 취급하지 않으므로 문단 글은 그대로 그림 옆·아래로 흐른다. 그림 폭은 크기(단 폭 대비 %).
  const floatsAt=new Map(),floated=new Set();
  {let at='first';for(const b of q.blocks.filter(b=>!b.parent)){
    if(b.kind==='text'&&b!==firstText&&b.text)at=b.id;
    if(isWrapped(b)&&(b.figure||ghost.figures.has(b.id)&&ghostFigure)){if(!floatsAt.has(at))floatsAt.set(at,[]);floatsAt.get(at).push(b);floated.add(b.id);}
  }}
  const floatImages=async(at,width)=>{let html='';for(const b of floatsAt.get(at)||[]){
    const w=sizedWidth(b,width);if(!b.figure)b.figure=ghostFigure(Math.round(w),Math.round(Math.min(150,w*.55)),b.label);
    html+=await picture(b.figure,w,undefined,{kind:'block',id:b.id});floats.push({data:images.at(-1),align:b.align==='왼쪽'?'Left':'Right'});
  }return html;};
  // 간격(mm): 구성 앞에 높이를 가진 빈 문단을 둔다. 값이 없으면 넣지 않는다.
  const spacer=b=>{const px=gapPx(b);return px?`<p style="margin:0;font-size:1pt;line-height:100%;height:${Math.round(px)}px;margin-top:${Math.round(px)}px"> </p>`:'';};
  // 실험 과정·결과 같은 머리: 〔실험 과정〕. 괄호는 고칠 수 없는 앞뒤로 둔다.
  const heading=b=>(b.kind==='steps'||b.heading===true)&&b.label?p(`〔${b.label}〕`,null,11,{kind:'label',id:b.id,prefix:1,suffix:1}):'';
  const walk=async(parent,width,onlyId=null)=>{
    let html='';
    for(const b of q.blocks.filter(b=>b.parent===parent&&(!onlyId||b.id===onlyId))){
      if(b===firstText||!onlyId&&afterAsk.includes(b.id)||floated.has(b.id))continue;
      html+=spacer(b);
      if(b===sideText)html+=p(prefix+b.text,width,11,{kind:'block',id:b.id,prefix:prefix.length});
      // 상자·가로 묶음 칸 안 글은 실제 글꼴 폭으로 어절 단위 줄바꿈을 넣는다. 칸 문단은 한글 엔진이 줄 수를 다시 세지 않아 칸이 한 줄 높이로 남는다.
      else if(b.kind==='text'&&b.text&&(nested||inBox)&&measureText)html+=`<p style="margin:4px 0;text-align:left">${text(b.text,Math.max(35,width-4),11,null,{kind:'block',id:b.id})}</p>`;
      else if(b.kind==='text')html+=b.text?floatsAt.has(b.id)?`<p style="margin:4px 0;text-align:justify">${await floatImages(b.id,width)}${text(b.text,width,11,v=>v,{kind:'block',id:b.id})}</p>`:p(b.text,width,11,{kind:'block',id:b.id}):'';
      else if(b.kind==='figure'){
        html+=heading(b);
        if(!b.figure&&ghost.figures.has(b.id)&&ghostFigure){const w=sizedWidth(b,width);b.figure=ghostFigure(Math.round(w),Math.round(Math.min(150,w*.55)),b.label);}
        // 평가원 지면: 글 아래(맨 바깥) 그림은 가운데. 정렬을 고른 그림만 그쪽으로. 상자·묶음 칸 안 그림은 예전처럼 칸 흐름대로
        // (칸 안에서 가운데 문단으로 감싸면 한글 엔진이 그 줄 배치를 빠뜨려 아래 글이 그림과 겹친다).
        if(b.figure)html+=await picture(b.figure,sizedWidth(b,width),b.align||(b.parent?undefined:'가운데'),{kind:'block',id:b.id})+(/^\(.+\)$/.test(b.label)||b.text?(b.text?p:pc)((/^\(.+\)$/.test(b.label)?b.label:'')+(b.text?' '+b.text:''),width,11,b.text?{kind:'block',id:b.id,prefix:(/^\(.+\)$/.test(b.label)?b.label:'').length+1}:null):'');
      }else if(b.kind==='table')html+=heading(b)+await table(b.table,sizedWidth(b,width),false,b.align,{kind:'block',id:b.id});
      else if(b.kind==='group'){
        const boxed=b.boxed===true||b.boxed===undefined&&b.label==='실험',children=q.blocks.filter(x=>x.parent===b.id);let body;
        const isBoxed=g=>g.boxed===true||g.boxed===undefined&&g.label==='실험',kidsOf=g=>q.blocks.filter(x=>x.parent===g.id);
        const sideRow=g=>g.kind==='group'&&g.layout==='나란히'&&!isBoxed(g)&&kidsOf(g).length>1;
        const flatten=boxed&&(b.layout==='나란히'&&children.length>1||children.some(sideRow));
        const innerWidth=Math.max(35,width-(boxed?22:0)),boxSlot=boxed&&!flatten?reserveTable():null;
        if(flatten){
          // 상자 안의 가로 묶음은 상자 표의 한 줄로 만든다. 표를 세 겹 넣으면(상자→가로→결과표)
          // 한글 엔진이 안쪽 표의 병합을 잃는다. 첫 줄은 묶음 이름, 그다음 줄은 구성마다 하나.
          const slot=reserveTable(),rule=RULE,titled=!!b.label;
          // 줄마다 칸 내용을 먼저 만든다. 내용이 없는 구성(빈 설명 등)은 줄을 만들지 않는다. 빈 칸 줄은 한글 엔진이 다르게 처리한다.
          let rows=[];
          for(const row of (b.layout==='나란히'?[{cells:children,group:b}]:children.map(c=>sideRow(c)?{cells:kidsOf(c),group:c}:{cells:[c],single:true}))){
            const n=row.single?1:row.cells.length,widths=row.single?[innerWidth]:splitWidths(row.cells,innerWidth),inner=[];
            nested++;try{for(const [i,cell] of row.cells.entries())inner.push(row.single?await walk(b.id,innerWidth,cell.id):await walk(row.group.id,Math.max(35,widths[i]-16),cell.id));}finally{nested--;}
            if(row.single&&!inner[0].trim())continue;
            for(let i=0;i<inner.length;i++)if(!inner[i].trim())inner[i]='<p><br></p>';
            rows.push({...row,n,widths,inner});
          }
          if(!rows.length)rows=[{cells:[],single:true,n:1,widths:[innerWidth],inner:['<p><br></p>']}];
          const cols=Math.max(...rows.map(r=>r.single?1:r.n)),merges=[];
          if(titled&&cols>1)merges.push({r:0,c:0,rs:1,cs:cols});
          let body='';
          for(const [ri,row] of rows.entries()){
            const r=ri+(titled?1:0),last=ri===rows.length-1,spans=row.inner.map((_,i)=>i===row.n-1?cols-(row.n-1):1);
            spans.forEach((span,i)=>{if(span>1)merges.push({r,c:i,rs:1,cs:span});});
            let tr='<tr>';
            for(const [i,inner] of row.inner.entries()){
              const edge=`${!titled&&ri===0?`border-top:${rule};`:''}${i===0?`border-left:${rule};`:''}${i===row.n-1?`border-right:${rule};`:''}${last?`border-bottom:${rule};`:''}`;
              tr+=`<td${spans[i]>1?` colspan="${spans[i]}"`:''} style="border:none;${edge}padding:${row.single?'2px 8px':'5px 8px'}${last?` ${8+Math.round((b.pad||0)*96/25.4)}px`:''};vertical-align:top;width:${row.single?width:row.widths[i]}px">${inner}</td>`;
            }
            body+=tr+'</tr>';
          }
          // 제목 없는 상자(설명·조건, 실험)는 제목 줄 없이 첫 줄에 위 테두리를 둔다.
          recordTable(rows.length+(titled?1:0),cols,merges,{kind:'boxside',id:b.id},slot);
          html+=`<table style="border-collapse:collapse;width:${width}px">${titled?`<tr><td${cols>1?` colspan="${cols}"`:''} style="border:none;border-top:${rule};border-left:${rule};border-right:${rule};width:${width}px;padding:8px 8px 0">${p(b.label,null,11,{kind:'label',id:b.id})}</td></tr>`:''}${body}</table>`;
          continue;
        }
        if(b.layout==='나란히'&&children.length>1){
          recordTable(1,children.length,[],{kind:'side',id:b.id});
          body=`<table style="border-collapse:collapse;width:${innerWidth}px"><tr>`;
          // Render the children individually while keeping their own descendants.
          const widths=splitWidths(children,innerWidth);
          nested++;try{for(const [i,child] of children.entries()){
            body+=`<td style="border:none;padding:5px;vertical-align:top;width:${widths[i]}px">${await walk(b.id,Math.max(35,widths[i]-16),child.id)}</td>`;
          }}finally{nested--;}
          body+='</tr></table>';
        }else{if(boxed)inBox++;try{body=await walk(b.id,innerWidth);}finally{if(boxed)inBox--;}}
        if(boxed)recordTable(1,1,[],{kind:'box',id:b.id},boxSlot);
        html+=boxed?`<table style="border-collapse:collapse;width:${width}px"><tr><td style="border:${RULE};width:${width}px;height:32px;padding:8px 8px ${8+Math.round((b.pad||0)*96/25.4)}px">${b.label?p(b.label,null,11,{kind:'label',id:b.id}):''}${body}</td></tr></table>`:body;
      }else if(b.lines){
        if(b.kind==='bogi'){
          // <보기> 너비: 구성 시트 '크기'(단 폭 대비 %)로 줄이면 가운데에 둔다. ㄷ 아래 여백은 '아래 여백'(mm).
          const bw=sizedWidth(b,width);
          // The supplied exam uses a centered title that interrupts the top
          // rule. A native table preserves that cutout without a bitmap or a
          // floating overlay: two shallow header rows and one merged body.
          const titleWidth=54,side=(bw-titleWidth)/2,rule='0.4pt solid #000';
          recordTable(3,3,[{r:0,c:1,rs:2,cs:1},{r:2,c:0,rs:1,cs:3}],{kind:'bogi',id:b.id});
          const empty='<p style="margin:0;font-size:1pt;line-height:100%"> </p>';
          const sideCell=(edge,line=false)=>`<td style="width:${side}px;height:12px;padding:0.1px;border:none;${line?`border-bottom:${rule}`:`border-${edge}:${rule}`} ;vertical-align:top">${empty}</td>`;
          let bodyLines=0,bodyExtra=0;
          const measure=v=>measureRich(v,11);
          const body=b.lines.map(l=>{
            const label=/^[ㄱ-ㅎ]$/.test(l.label)?l.label+'.':l.label,prefix=label+' ';
            // 표 칸 안에서는 한글 엔진이 줄을 나누지 않고 글자를 좁혀 한 줄에 넣는다. 칸 안 글은 실제 글꼴 폭으로 재서 직접 나눈다.
            const wrap=v=>{const result=wrapHangingText(v,bw-12,prefix,measure);bodyLines+=result.split('\n').length;bodyExtra+=extraHeight(result,11);return result;};
            return `<p style="margin:0;text-align:left;line-height:150%">${text(prefix+l.text,null,11,wrap,{kind:'line',block:b.id,id:l.id,prefix:prefix.length})}</p>`;
          }).join('');
          // The last line needs its glyph height and bottom padding, rather
          // than another full line gap. Explicit height also protects nested
          // tables, whose parent does not expand an implicit HTML row.
          const padPx=Math.round((b.pad||0)*96/25.4),bodyHeight=Math.ceil(Math.max(0,bodyLines-1)*11*4/3*1.6+11*4/3+bodyExtra+BOGI_BOTTOM+(b.parent?3:0))+padPx;
          html+=`<table style="border-collapse:collapse;width:${bw}px"><tr>${sideCell('left',true)}<td rowspan="2" style="width:${titleWidth}px;height:24px;padding:0.1px;border:none;vertical-align:middle"><p style="margin:0;text-align:center;line-height:100%">${text('<보 기>')}</p></td>${sideCell('right',true)}</tr><tr>${sideCell('left')}${sideCell('right')}</tr><tr><td colspan="3" style="width:${bw}px;height:${bodyHeight}px;padding:3px 6px 4px;border:none;border-left:${rule};border-right:${rule};border-bottom:${rule};vertical-align:top">${body}</td></tr></table>`;
        }else if(b.kind==='dialogue'){
          // 학생 대화·발표: 이름 칸 + 말 칸(가는 선 상자). 말이 길면 칸 안에서 줄바꿈한다.
          const nameWidth=Math.min(64,Math.max(40,...b.lines.map(l=>choiceWidth(l.label,11)+12))),speech=width-nameWidth;
          recordTable(b.lines.length,2,[],{kind:'dialogue',id:b.id});
          html+=`<table style="border-collapse:collapse;width:${width}px">`+b.lines.map(l=>`<tr><td style="border:none;width:${nameWidth}px;padding:4px 4px 4px 0;vertical-align:top"><p style="margin:0">${text(l.label)}</p></td><td style="border:${RULE};width:${speech}px;padding:3px 8px;vertical-align:middle"><p style="margin:0;text-align:left">${text(l.text,speech-18,11,null,{kind:'line',block:b.id,id:l.id})||(nested?'\u2060':'')}</p></td></tr>`).join('')+'</table>';
        }else{
          // 실험 과정: 〔실험 과정〕 머리, (가)·(나) 뒤 글은 내어쓰기(한글에서 번호 뒤에 맞춤).
          const measure=v=>measureRich(v,11);
          html+=heading(b)+b.lines.map(l=>{const prefix=l.label+' ';return `<p style="margin:0;text-align:left">${text(prefix+l.text,null,11,v=>wrapHangingText(v,width-4,prefix,measure),{kind:'line',block:b.id,id:l.id,prefix:prefix.length})}</p>`;}).join('');
        }
      }
    }
    return html;
  };
  // 대응 선지(평가원 원본): 선지 묶음 2열(①② / ③④ / ⑤), 맨 윗줄 묶음 위에만 열 제목, 제목마다 짧은 밑줄, 테두리 없음.
  // 열이 3개 이하이고 병합·그림이 없을 때만. 그 밖의 선지표는 예전처럼 선 있는 표로 찍는다.
  const kicePair=t=>t.cols<=3&&t.headerRows===1&&t.rows===6&&!t.merges.length&&!t.cells.flat().some(c=>c.figure);
  const pairChoices=t=>{
    const k=t.cols,numW=25,valW=(width/2-numW)/k;
    recordTable(4,2*(k+1),[],{kind:'choices'});
    const td=(w,body)=>`<td style="border:none;width:${w}px;padding:1px 2px;vertical-align:top"><p style="margin:0;text-align:center">${body}</p></td>`;
    const value=(r,c,head)=>{const v=t.cells[r][c].value,body=text(v,valW-8,11,null,{kind:'cell',table:'choices',r,c});return head&&String(v).trim()?`<u>${body}</u>`:body;};
    let rows='<tr>'+[0,1].map(()=>td(numW,'')+Array.from({length:k},(_,c)=>td(valW,value(0,c,true))).join('')).join('')+'</tr>';
    for(let line=0;line<3;line++)rows+='<tr>'+[0,1].map(side=>{const i=line*2+side;return i<5?td(numW,text(labels[i]))+Array.from({length:k},(_,c)=>td(valW,value(i+1,c,false))).join(''):td(numW,'')+Array.from({length:k},()=>td(valW,'')).join('');}).join('')+'</tr>';
    return `<table style="border-collapse:collapse;width:${width}px">${rows}</table>`;
  };
  // A question number belongs to the opening paragraph. Native hanging
  // indentation is measured from this prefix after import, never added spaces.
  // 평가원 지면: 번호 뒤 글·자료·발문·<보기>·선지가 모두 번호 너비만큼 들어가 시작하고, 발문 첫 줄은 한 글자 더 들어간다.
  // 표·그림은 그 너비만큼 줄여 만들고, 문단 왼쪽 여백은 한글로 들여온 뒤 applyQuestionIndent가 건다.
  const measure11=measureText||(v=>choiceWidth(v,11)),bodyIndent=prefix&&!sideText?Math.ceil(measure11(prefix)):0,askIndent=Math.round(11*4/3);
  // 본문 글은 줄바꿈을 넣지 않는다. 한글 엔진이 어절 단위로 나누고 양쪽 정렬로 오른쪽 끝을 맞춘다(평가원 지면).
  const asIs=v=>v;
  const firstFloats=sideText?'':await floatImages('first',width-bodyIndent);
  const first=sideText?'':`<p style="margin:4px 0;text-align:justify">${firstFloats}${text(prefix+(firstText?firstText.text:ask),null,11,asIs,firstText?{kind:'block',id:firstText.id,prefix:prefix.length}:askOwner(prefix.length))}</p>`;
  width-=bodyIndent;
  const askParagraph=async()=>`<p style="margin:4px 0;text-align:justify">${sideText?await floatImages('first',width):''}${text(ask,null,11,asIs,askOwner())}</p>`;
  let html=first+await walk(null,width)+(firstText||sideText?await askParagraph():'');
  for(const id of afterAsk)html+=await walk(null,width,id);
  if(q.type!=='서술형'){
    if(q.style==='대응표')html+=kicePair(q.choiceTable)?pairChoices(q.choiceTable):await table(q.choiceTable,width,true);
    else if(q.style==='그림·그래프'){
      {const per=choiceColumns(q.choiceLayout,q.choices.length)||2;recordTable(Math.ceil(q.choices.length/per),per,[],{kind:'choicegrid'});}
      html+=`<table style="border-collapse:collapse;width:${width}px">`;
      const per=choiceColumns(q.choiceLayout,q.choices.length)||2;for(let i=0;i<q.choices.length;i+=per){html+='<tr>';for(let j=i;j<i+per;j++){const c=q.choices[j];html+=`<td style="border:none;width:${width/per}px;padding:5px;vertical-align:top">${c?p(labels[j]+' '+c.text,null,11,{kind:'choice',id:c.id,prefix:labels[j].length+1})+await picture(c.figure,width/per-20,undefined,{kind:'choice',id:c.id}):''}</td>`;}html+='</tr>';}
      html+='</table>';
    }else {
      const fontSize=q.style==='조합'?10:11,grid=choiceGrid(q.choices,width,fontSize,q.choiceLayout,measureText?measureRich:choiceWidth),rows=Math.ceil(q.choices.length/grid.cols);
      recordTable(rows,grid.cols,[],{kind:'choicegrid'});
      html+=`<table style="border-collapse:collapse;width:${width}px">`;
      for(let row=0;row<rows;row++){
        const cells=grid.widths.map((w,col)=>{const i=row*grid.cols+col,c=q.choices[i],available=grid.singleLine?w-4:w-8-choiceWidth(labels[i]+' ',fontSize),value=c?labels[i]+' '+c.text:'';return {w,value,owner:c?{kind:'choice',id:c.id,prefix:labels[i].length+1}:null,height:(wrapped=>Math.max(25,Math.ceil(wrapped.split('\n').length*fontSize*4/3*1.6+6+extraHeight(wrapped,fontSize))))(measureText?wrapMeasured(value,available,available,v=>measureRich(v,fontSize)):wrapQuestionText(value,available,fontSize)),available};});
        // 한 줄에 분수 같은 높은 수식이 있으면 칸 가운데에 맞춰 ①~⑤의 글자 줄이 나란하게 한다.
        const height=Math.max(...cells.map(c=>c.height)),valign=cells.some(c=>extraHeight(c.value,fontSize)>0)?'middle':'top';
        html+='<tr>'+cells.map(c=>`<td style="border:none;width:${c.w}px;height:${height}px;padding:2px;vertical-align:${valign}"><p style="margin:0;text-align:left;line-height:150%">${text(c.value,c.available,fontSize,null,c.owner)}</p></td>`).join('')+'</tr>';
      }
      html+='</table>';
    }
  }
  const askLead=firstText||sideText?String(ask).replace(/\s+/g,' ').trim().slice(0,12):'';
  return {html:`<div style="font-family:함초롬바탕;font-size:10pt">${html}</div>`,images,texts,tables,equations,warnings:[...new Set(warnings)],imageOwners,tableOwners,textSegments,bodyIndent,askIndent,askLead,floats};
}

// 한글 엔진의 getTextFileText는 완성형(KS X 1001) 밖 글자를 문서에는 그대로 두고, 글로 꺼낼 때만 &#9702; 같은
// 10진 문자 참조로 바꿔 준다(◦ ≳ ⇄ ․ — ≈ ･ 사용자 영역 글자 등, 2026-10-19 왕복 검사). 글자가 사라진 것이 아니므로
// 꺼낸 글을 원래 글자로 되돌려 비교·시트 반영에 쓴다. 엔진은 ASCII를 참조로 바꾸지 않으므로 128 이상만 되돌린다.
export const decodeNativeText=v=>String(v??'').replace(/&#(\d{3,7});/g,(m,n)=>{const c=Number(n);return c>=128&&c<=0x10FFFF&&!(c>=0xD800&&c<=0xDFFF)?String.fromCodePoint(c):m;});
export function verifyNativeQuestion(document,plan){
  const normalized=v=>decodeNativeText(v).replace(/\s+/g,' ').trim();
  const raw=document.getTextFileText(),body=normalized(raw.startsWith('"')?JSON.parse(raw):raw);
  if(plan.texts.some(v=>!body.includes(normalized(v))))throw Error('한글에서 일부 글을 읽지 못했습니다. 기존 시험지는 보존했습니다.');
  const seen=new Set(),images=[],tables=new Map();
  for(let page=0;page<document.pageCount();page++)for(const c of JSON.parse(document.getPageControlLayout(page)).controls||[]){
    if(c.type==='table'){
      const key=JSON.stringify(c.stableIndex||[c.secIdx,c.paraIdx,c.controlIdx]),item=tables.get(key)||{rows:c.rowCount,cols:c.colCount,merges:new Set()};
      for(const cell of c.cells||[])if(cell.rowSpan>1||cell.colSpan>1)item.merges.add(`${cell.row}:${cell.col}:${cell.rowSpan}:${cell.colSpan}`);
      tables.set(key,item);continue;
    }
    if(c.type!=='image')continue;
    const path=JSON.stringify(c.cellPath||[]),key=JSON.stringify([c.secIdx,c.paraIdx,path,c.controlIdx]);
    if(seen.has(key))continue;seen.add(key);
    images.push(document.getControlImageData(c.secIdx,c.paraIdx,path,c.controlIdx));
  }
  const expected=plan.images.map(v=>Uint8Array.from(atob(v.split(',')[1]),c=>c.charCodeAt(0)));
  for(const bytes of expected){const at=images.findIndex(v=>v.length===bytes.length&&v.every((b,i)=>b===bytes[i]));if(at<0)throw Error('한글에서 일부 그림을 읽지 못했습니다. 기존 시험지는 보존했습니다.');images.splice(at,1);}
  if(images.length)throw Error('한글 그림 개수가 원래 문항과 다릅니다. 기존 시험지는 보존했습니다.');
  const actual=[...tables.values()].map(t=>JSON.stringify({rows:t.rows,cols:t.cols,merges:[...t.merges].sort()})).sort();
  const expectedTables=plan.tables.map(t=>JSON.stringify(t)).sort();
  if(JSON.stringify(actual)!==JSON.stringify(expectedTables))throw Error('한글에서 표의 행·열 또는 병합이 달라졌습니다. 기존 시험지는 보존했습니다.');
}
