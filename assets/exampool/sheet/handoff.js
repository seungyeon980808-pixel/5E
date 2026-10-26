import {KICE_STANDARD,layoutValues,mmToPx,gapRole} from './typeset-standard.js';
import {FORMAT,clone,validate,tableCovered,openingSideText,isWrapped} from './model.js';
import {mathParts} from './typeset-model.js?v=1014-compact-panel';
import {splitWidths,sizedWidth,choiceColumns} from './placement.js';

const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels=['①','②','③','④','⑤'];
// 평가원 표·상자: 가는 검은 선. 기본값(수능 틀 0.12mm)이고, 조판할 때 기준의 rule 값으로 바꾼다(buildQuestionHtml 안 RULE).
const BASE_RULE='0.34pt solid #000';
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
// tabs: 평가원 선지 칸 간격(px, [5개, 3개, 2개]). 가장 긴 선지가 그 간격 안에 들어가면 그 간격대로 놓고(원본처럼 왼쪽부터 같은 간격),
// 들어가지 않으면 예전처럼(5개는 남는 폭을 고루 나눔, 3·2개는 똑같이 나눔).
export function choiceGrid(choices,width,fontSize=11,layout,measure=choiceWidth,tabs=null){
  const fixed=choiceColumns(layout,choices.length);
  // 한글 문서로 보낼 때는 실제 글꼴 폭(measure)으로 잰다. 어림셈은 넓게 잡혀 기출보다 일찍 줄이 나뉜다.
  const sizes=choices.map((c,i)=>measure(labels[i]+' '+c.text,fontSize)+4),fits=choices.every(c=>!/[\r\n]/.test(c.text))&&sizes.reduce((a,b)=>a+b,0)<=width;
  // 「한 줄」이라도 똑같이 나누면 긴 선지(ㄱ, ㄴ, ㄷ)만 줄이 넘어간다. 다 들어가면 남는 폭을 고루 나눠 준다.
  const max=Math.max(...sizes),tab=n=>tabs?.[{5:0,3:1,2:2}[n]],room=fontSize*4/3;
  // 평가원 간격은 가장 긴 선지 + 한 글자 여유가 들어갈 때만 쓴다(10-24 지적 1: 「③ ㄱ, ㄴ」이 간격과 거의 같아 칸 사이가 붙었음).
  // 마지막 칸은 남은 폭을 쓰므로(원본도 ⑤ 「ㄱ, ㄴ, ㄷ」가 길어도 같은 간격) 마지막 열을 뺀 선지만 간격 안에 들면 된다.
  const stepped=n=>{let t=tab(n);if(!(t>0)||n>choices.length)return null;const inner=Math.max(0,...sizes.filter((_,i)=>i%n!==n-1)),last=Math.max(0,...sizes.filter((_,i)=>i%n===n-1));// 마지막 선지가 남은 폭에 조금 모자라면 간격을 똑같이 줄여 한 줄에 맞춘다(원본 간격의 90%까지) — 원본 240문항 중 224문항이 같은 간격 다섯 칸(10-25 실측).
      // 마지막 선지가 조금 넘치면 간격은 원본 그대로 두고 그 선지 글자만 자간을 좁힌다(최대 8%, 원본도 「⑤ ㄱ, ㄴ, ㄷ」를 같은 간격에 넣음, 10-25).
      const need=last-2,lastText=choices.map((c,i)=>i%n===n-1?labels[i]+' '+c.text:'').reduce((a,b)=>b.length>a.length?b:a,'');
      if(t*(n-1)+need>width&&inner+room<=t&&measure!==choiceWidth){const over=t*(n-1)+need-width,c=Math.ceil((over+2)/Math.max(1,measure(lastText,fontSize))*100);
        if(c<=8)return {cols:n,widths:[...Array(n-1).fill(t),width-t*(n-1)],singleLine:n===choices.length,tabs:true,tightLast:c};}
      let step=t;if(step*(n-1)+need>width)step=(width-need)/(n-1);if(step<t*.9||inner+room>step)return null;t=step;return {cols:n,widths:[...Array(n-1).fill(t),width-t*(n-1)],singleLine:n===choices.length,tabs:true};};
  // 줄 수를 정해 둔 선지(변환된 기출 「3+2」·「2+2+1」)도 평가원 간격에 놓는다. 선지가 5칸 간격에 들 만큼 짧으면 원본도 5칸 간격 그대로 줄만 나눈다(물리Ⅱ 24-6월 1·7번).
  if(fixed&&!(fixed===choices.length&&fits)){
    const short=fixed<5&&tab(5)>0&&Math.max(0,...sizes.filter((_,i)=>i%fixed!==fixed-1))+room<=tab(5)&&tab(5)*(fixed-1)+max<=width;
    if(short)return {cols:fixed,widths:[...Array(fixed-1).fill(tab(5)),width-tab(5)*(fixed-1)],tabs:true};
    return stepped(fixed)||{cols:fixed,widths:Array(fixed).fill(width/fixed),singleLine:fixed===choices.length};
  }
  // 「한 줄 5칸」으로 정해 둔 선지(변환된 기출)도 평가원 간격을 먼저 쓴다(10-25 — 정해 두면 건너뛰어 글 길이 비례로 나뉘었다).
  if(fits&&(!fixed||fixed===5)&&choices.length===5&&stepped(5))return stepped(5);
  if(fits){
    const gap=(width-sizes.reduce((a,b)=>a+b,0))/sizes.length;
    return {cols:sizes.length,widths:sizes.map(w=>w+gap),singleLine:true};
  }
  const cols=[3,2,1].find(n=>n<=choices.length&&max<=width/n)||1;
  return (cols>1&&stepped(cols))||{cols,widths:Array(cols).fill(width/cols)};
}
// Break at word boundaries before native import. Cell auto-layout alone can
// squeeze a long header into one line and paint its Latin units into the next
// cell. Explicit lines keep the actual text editable and its font unchanged.
// 구성 이름이 한글 문서에 글로 찍히는지: 상자 묶음의 제목, 과정 제목, (가)·(나) 같은 그림 이름. 아래 조판과 같은 조건.
export const labelInDocument=b=>!!b.label&&(b.kind==='steps'||b.heading===true||b.kind==='group'&&(b.boxed===true||b.boxed===undefined&&b.label==='실험')||b.kind==='figure'&&!!b.figure&&!isWrapped(b)&&/^\(.+\)$/.test(b.label));
// 어절 나누기: 띄어쓰기로 나누되 $…$ 수식 안의 띄어쓰기는 나누지 않는다(수식이 여러 줄로 세어져 칸이 커지던 문제).
const words=line=>String(line).match(/(?:\$[^$\n]*\$|\S)+/g)||[''];
// 줄 첫머리 수식은 한글 엔진이 그리지 않는다(10-24 물리Ⅰ 11번 「S₂를」). 수식으로 시작하는 낱말은 앞 낱말과 한 덩어리로 줄을 나눈다 —
// 줄이 수식 앞에서 나뉘지 않고 앞 낱말이 함께 다음 줄로 간다. 예전에 앞에 둔 U+2060은 엔진이 13px 폭으로 그려 그 줄만 한 글자 들어갔다(10-25).
const mathStart=/^(?:EXAMPOOL_EQ_\d+_END|\$)/;
const wrapUnits=line=>words(line);
export function wrapQuestionText(value,width,fontSize=11){
  if(!width)return String(value??'');
  const em=fontSize*4/3,limit=Math.max(em,width),lines=[];
  const measure=word=>{
    let equations=0;const plain=word.replace(/EXAMPOOL_EQ_\d+_END/g,()=>{equations++;return '';});
    return equations*em*3+[...plain].reduce((sum,c)=>sum+em*(c.codePointAt(0)<256?/^[MW@]$/.test(c)?.95:.62:1),0);
  };
  for(const original of String(value??'').split(/\r?\n/)){
    let line='',used=0;
    for(const word of words(original)){
      const size=measure(word),space=line?em*.5:0;
      if(line&&used+space+size>limit){lines.push(line);line=word;used=size;}
      else{line+=(line?' ':'')+word;used+=space+size;}
    }
    lines.push(line);
  }
  return lines.join('\n');
}
// 실제 한글 글꼴로 잰 폭으로 어절 단위 줄바꿈. 첫 줄과 다음 줄의 폭을 따로 받는다(번호 뒤 내어쓰기).
// 수식이 든 줄은 10px 더 남긴다 — 엔진이 그 줄을 다시 나누면 줄 첫머리로 넘어간 수식이 사라진다(rhwp, 10-24 물리Ⅰ 11번 「S₂를」).
const eqRoom=s=>/EXAMPOOL_EQ_\d+_END|\$[^$\n]+\$/.test(s)?10:0;
export function wrapMeasured(value,first,rest,measure){
  const lines=[];
  for(const original of String(value??'').split(/\r?\n/)){
    let line='',firstLine=!lines.length;
    for(const word of wrapUnits(original)){
      const candidate=line?line+' '+word:word,limit=(firstLine&&!lines.length?first:rest)-eqRoom(candidate);
      if(line&&measure(candidate)>limit){lines.push(line);line=word;firstLine=false;}else line=candidate;
    }
    lines.push(line);
  }
  return lines.join('\n');
}
// <보기> 상자: 마지막 줄 글자 아래에서 상자 선까지 남길 높이(px). 평가원 지면처럼 반 줄쯤(약 3mm).
// 1pt 빈 문단 하나가 차지하는 높이(mm, rhwp 0.8.7 실측).
const SPACER_MM=0.58;
// (값은 조판 기준 gaps.bogiPadBottom — 수능 틀 14px)
export function handoffQuestion(value,{skeleton=false}={}){
  const q=clone(value);q.references=[];
  validate({format:FORMAT,questions:[q],documents:[]});
  if(!skeleton&&!q.ask.trim())throw Error('발문을 입력한 뒤 한글로 보내세요.');
  return q;
}
// 틀 보기(한글 창 전용): 아직 비어 있는 발문·글·그림 자리에 회색 이름(발문·지문·자료)만 넣어 문항 모양을 먼저 보여 준다.
// 「카드에서 입력」 같은 안내는 넣지 않는다 — 조판 칸에서 바로 입력이 안 된다고 오해하게 해서(10-22 사용자 지적).
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
  if(!q.ask.trim()){q.ask='발문';ghosts.add('ask');}
  for(const b of q.blocks){
    if(b.kind==='text'&&!b.text.trim()){b.text=ghostName(b);ghosts.add('block:'+b.id);}
    if(b.kind==='figure'&&!b.figure)figures.add(b.id);
  }
  return {ghosts,figures};
}

// HTML is an import boundary, not a screenshot: RHWP creates native nested
// tables, cell spans, text paragraphs and embedded picture controls from it.
// 상자 안 항목 줄 앞머리: ○ ◦ • ▪ ◆ □ ■(뒤 띄어쓰기 없어도) · (가) · ①~⑤ — 앞머리 뒤 띄어쓰기는 한 칸으로 맞춘다.
const ITEM_LEAD=/^(?:([○◦•▪◆□■]) ?|(\([가-힣]\)|[①-⑤]) )/;
// width: 폭(px) 또는 줄 번호 → 폭 함수(그림 옆 줄만 좁게, 어울림).
// condense = {em, max}: 다음 낱말이 조금 넘치면 그 줄 자간을 최대 max%까지 더 좁혀 한 줄에 넣는다(평가원 칸·〈보기〉 줄, 10-25).
// 좁힌 줄은 줄 첫머리에 표시 글자(U+E010 + 좁힐 %)를 붙여 돌려준다 — text()가 글자색 표시로 바꾸고 normalizeQuestionImport가 자간으로 바꾼다.
// 한글 들여오기는 표마다 바깥 여백(왼쪽·오른쪽 1mm = 283단위씩)만큼 표를 좁혀 넣고, widenTablesByMargins가 그만큼 마지막 열을 넓혀 되돌린다.
// 그래서 실제로 그려지는 표(마지막 열)는 HTML 폭보다 이만큼(px) 넓다 — 칸 안 글 폭에 더한다(10-25: 상자 글을 8px 좁게 나눠 원본보다 한 낱말 일찍 넘김).
const TABLE_OUT=2*283/75;
const CONDENSE=0xE010,glyphs=v=>[...String(v).replace(/EXAMPOOL_EQ_\d+_END/g,'')].length;
export function wrapHangingText(value,width,prefix,measure,condense=null){
  const indent=measure(prefix),lines=[],at=typeof width==='function'?width:()=>width;
  // 문단 가운데 줄: 넘친 폭이 띄어쓰기 합의 condense.space(비율) 이하이면 한 줄에 두고 그 줄 자간을 그만큼 좁힌다
  // (평가원 양쪽 정렬의 최소 공백, 10-25 6번 (나) 줄 8%). 칸 안에서 넘친 줄은 엔진이 눌러 담지 않고 다시 나눠 「ⓒ와,」만 남는 줄이 생겼다.
  const spaceW=condense?.space?measure(' '):0,loose=(text,limit)=>!!condense?.space&&measure(text)-limit<=(text.split(' ').length-1)*spaceW*condense.space;
  const squeeze=(text,limit)=>{if(!condense)return null;const over=measure(text)-limit;if(over<=0)return 0;// 엔진의 자간 %는 글자마다 자기 폭 기준이라(10-25 실측: 가·ⓐ·마침표·띄어쓰기 모두 약 10%) 줄어드는 폭 ≈ c% × 줄 폭. 3px은 재기 오차 여유.
    const c=Math.ceil((over+3)/measure(text)*100);return c<=condense.max?c:null;};
  // 문단 끝: 넘치는 낱말이 문단의 마지막 낱말들이고 좁혀서(최대 max%) 다 들어가면 한 줄에 둔다(원본도 「있다.」 하나만 남는 줄을 이렇게 없앤다).
  for(const original of String(value).split(/\r?\n/)){
    let line='',tight=0;const units=wrapUnits(original);
    for(const [k,word] of units.entries()){
      const candidate=line?line+' '+word:word,limit=at(lines.length)-(lines.length?indent:0)-eqRoom(candidate);
      if(!line||measure(candidate)<=limit){line=candidate;continue;}
      // 문단 끝 규칙이 먼저: 남은 낱말을 모두 좁혀 넣을 수 있으면 그렇게 한다. 그다음 띄어쓰기 규칙.
      const rest=[line,...units.slice(k)].join(' '),c=squeeze(rest,at(lines.length)-(lines.length?indent:0)-eqRoom(rest));
      if(c){line=rest;tight=c;break;}
      if(loose(candidate,limit)){const c2=squeeze(candidate,limit);if(c2){lines.push(String.fromCharCode(CONDENSE+c2)+candidate);line='';continue;}}
      lines.push(line);line=word;
    }
    lines.push(tight?String.fromCharCode(CONDENSE+tight)+line:line);
  }
  return lines.join('\n');
}
export async function buildQuestionHtml(value,prepareFigure=async f=>f,width=540,{native=false,measureText,skeleton=false,ghostFigure=null,standard=KICE_STANDARD}={}){
  const L=layoutValues(standard),RULE=L.rule||BASE_RULE;
  // 본문 글자 크기(pt): 틀 값. 수능 B4 틀은 원본 PDF 그대로 11.5pt(10-25 실측 — 11pt로 찍어 글자가 원본보다 6% 좁았다).
  const FS=L.textSize||11;
  // 글자 폭 재기(장평 + 자간)도 틀 값으로.
  if(measureText)measureText.factor=(L.ratio+L.spacing)/100;
  const q=handoffQuestion(value,{skeleton}),ghost=skeleton?fillSkeleton(q):{ghosts:new Set(),figures:new Set()},images=[],texts=[],warnings=[],tables=[],equations=[];
  // 문서 순서대로 그림·표가 어느 구성의 것인지 기록한다(한글 창에서 끌어 배치할 때 짝짓기).
  const imageOwners=[],tableOwners=[],textSegments=[],floats=[],cellFloats=[];
  // 자리 찾기용 글 조각(10-26 U3): 빈 칸 안내 글(「발문」)·글 없는 그림 캡션까지 주인과 함께 — 조판 설정 미리보기가 빈 문항에서도 부분 자리를 찾는다. 되돌리기(textSegments)와 따로.
  const placeSegments=[];
  // 상자 안 그림 어울림(10-25): 그림 높이만큼의 줄(k)만 좁은 폭(narrow)으로 나눈다. used = 지금까지 나눈 줄 수.
  let beside=null;
  // 칸·〈보기〉·과정 줄의 자간 좁힘 한도(기본 −5%에서 더 좁힐 %). 한글 문서로 보낼 때만.
  const TIGHT=native?{em:FS*4/3,max:15,space:.5}:null;
  // at = {item, line}: 그림 옆 첫 줄이 칸 안 몇째 항목의 몇째 줄인지(변환기 besideAt). 그 항목을 나눌 때 from(칸 안 줄 번호)을 정한다.
  const besideWidth=(w,item=0)=>{if(!beside)return w;const b=beside;if(b.from===null&&item>=b.at.item)b.from=b.used+(item===b.at.item?b.at.line:0);return i=>b.from!==null&&b.used+i>=b.from&&b.used+i<b.from+b.k?Math.min(w,b.narrow):w;};
  const besideCount=wrapped=>{if(beside)beside.used+=String(wrapped).split('\n').length;return wrapped;};
  const recordTable=(rows,cols,merges=[],owner={kind:'layout'},at=null)=>{const shape={rows,cols,merges:merges.map(m=>`${m.r}:${m.c}:${m.rs}:${m.cs}`).sort()};if(at===null){tables.push(shape);tableOwners.push(owner);}else{tables[at]=shape;tableOwners[at]=owner;}};
  // 가로 묶음 칸·상자 표의 줄 안에서는 칸이 모두 빈 표를 한글 엔진이 빠뜨린다. 그 자리의 빈 칸에만 보이지 않는
  // 단어 연결 문자(U+2060)를 둔다. 문자 참조(&#…;)는 엔진이 글자 그대로 찍고, U+200B·U+FEFF는 저장할 때마다
  // 줄 배치가 흔들리며, 공백류는 빈 칸으로 취급된다(2026-10-16 실험).
  let nested=0,inBox=0;
  // 칸 안 글 폭·높이를 잴 때 수식은 수식 개체 크기로 잰다. 글에는 $…$ 그대로이거나 이미 수식 자리표시(EXAMPOOL_EQ_n_END)로 바뀐 것이 온다.
  const MARK=/(EXAMPOOL_EQ_\d+_END)/,eqSize=(script,fontSize)=>measureText?.equation?.(script,fontSize)||equationEstimate(script,fontSize);
  const pieces=v=>String(v??'').split(MARK).flatMap(part=>{const m=part.match(/^EXAMPOOL_EQ_(\d+)_END$/);return m?[{math:true,text:equations[Number(m[1])]?.script||''}]:mathParts(part);});
  // 결합 밑줄 문자(U+0332)는 폭이 없다 — 재기 전에 뺀다.
  const measureRich=(v,fontSize=FS)=>pieces(String(v??'').replace(/\u0332/g,'')).reduce((sum,part)=>sum+(part.math?eqSize(part.text,fontSize).w:part.text?(measureText?measureText(part.text,fontSize):plainWidth(part.text,fontSize*4/3)):0),0);
  // 줄에 든 수식이 글자보다 높으면 그만큼 줄이 높아진다(분수). 칸 높이를 미리 정할 때 더한다.
  const extraHeight=(wrapped,fontSize=FS)=>String(wrapped).split('\n').reduce((sum,line)=>sum+Math.max(0,...pieces(line).filter(p=>p.math).map(p=>eqSize(p.text,fontSize).h-fontSize*4/3)),0);
  // 가로 묶음 안 폭: 자료표 칸은 적어도 열마다 가장 긴 어절이 들어가는 폭을 받는다(옆 글 칸에서 덜어 온다).
  const tableMin=t=>{if(!measureText||!t)return 0;const fs=t.cols>3?9:10,word=Array(t.cols).fill(36);for(let r=0;r<t.rows;r++)for(let c=0;c<t.cols;c++){if(tableCovered(t,r,c)||t.merges.some(m=>m.r===r&&m.c===c&&m.cs>1))continue;word[c]=Math.max(word[c],Math.max(0,...words(String(t.cells[r][c].value)).map(x=>measureRich(x,r<t.headerRows?fs-1:fs)))+22);}return word.reduce((a,b)=>a+b,0)+20;};
  // 기출 자료의 원본 실제 폭(px): 그림 widthPt, 표 colWidths 합(PDF pt, 평가원 한 단 387pt = 조판 단 폭). 없으면 0.
  const physical=c=>{const k=columnPx/KICE_COLUMN_PT;if(c.kind==='figure'&&Number(c.figure?.widthPt)>0)return c.figure.widthPt*k;
    if(c.kind==='table'&&Array.isArray(c.table?.colWidths)&&c.table.colWidths.length&&c.table.colWidths.every(v=>Number(v)>0))return c.table.colWidths.reduce((a,b)=>a+Number(b),0)*k;return 0;};
  const rowWidths=(children,total)=>{
    // 기출 자료가 원본 폭을 알면 그 칸은 원본 폭 + 칸 여백(16), 글 칸은 나머지 — size %(상자 폭 기준)를 칸 폭 기준으로 다시 곱하면 두 번 줄거나 커졌다(10-24 15번).
    // 글 칸 = 글·실험 과정(steps) — 실험 과정 옆 그림도 원본 폭으로(10-25 9번).
    {const textish=c=>c.kind==='text'||c.kind==='steps',mats=children.filter(c=>!textish(c)),texts=children.filter(textish);
      if(texts.length&&mats.length&&mats.every(c=>physical(c)>0)){const mw=mats.map(c=>physical(c)+Math.ceil(2*L.boxSide)+2),left=(total-mw.reduce((a,b)=>a+b,0))/texts.length;
        if(left>=120)return children.map(c=>textish(c)?left:mw[mats.indexOf(c)]);}}
    // 그림·표만 있는 줄: 원본 폭 + 여백으로 나누고, 남는 폭은 칸마다 고르게 더한다(넘치면 비율대로 줄인다) — 표가 칸 밖으로 잘렸다(10-24 13번).
    {const pad=Math.ceil(2*L.boxSide)+2;if(children.length>1&&children.every(c=>c.kind!=='text'&&physical(c)>0)){const mw=children.map(c=>physical(c)+pad),sum=mw.reduce((a,b)=>a+b,0);
      if(sum<=total)return mw.map(v=>v+(total-sum)/mw.length);
      // 모자라면 표는 원본 폭을 지키고(글자 때문에 더 줄지 못해 칸 밖으로 넘친다) 그림이 남는 폭을 나눠 쓴다(한 그림 최소 60).
      const tw=children.reduce((a,c,i)=>a+(c.kind==='table'?mw[i]:0),0),fw=sum-tw,room=total-tw;
      if(fw>0&&room>=60*children.filter(c=>c.kind!=='table').length)return mw.map((v,i)=>children[i].kind==='table'?v:v*room/fw);
      return mw.map(v=>v*total/sum);}}
    const w=splitWidths(children,total),need=children.map(c=>c.kind==='table'?tableMin(c.table)/((c.size??100)/100):0);
    let deficit=0;w.forEach((v,i)=>{if(need[i]>v){deficit+=need[i]-v;w[i]=need[i];}});
    const donors=children.map((c,i)=>c.kind==='text'?Math.max(0,w[i]-120):c.kind==='figure'?Math.max(0,w[i]-80):0),room=donors.reduce((a,b)=>a+b,0);
    if(deficit>0&&room>0){const take=Math.min(deficit,room);w.forEach((v,i)=>{if(donors[i])w[i]-=take*donors[i]/room;});}
    const sum=w.reduce((a,b)=>a+b,0);return sum>total?w.map(v=>v*total/sum):w;
  };
  const reserveTable=()=>{tables.push(null);tableOwners.push(null);return tables.length-1;};
  // 글 조각마다 주인(어느 칸의 글인지)과 앞머리 길이(번호·ㄱ.·① 등)를 남긴다. 한글 창에서 고친 글을 시트로 되돌릴 때 쓴다.
  const text=(v,width=null,fontSize=FS,wrap=null,owner=null,font='함초롬바탕')=>{
    const ghostKey=owner&&(owner.kind==='ask'?'ask':owner.kind==='block'?'block:'+owner.id:null),isGhost=!!ghostKey&&ghost.ghosts.has(ghostKey),lead=isGhost?owner.prefix||0:0;
    if(owner&&String(v??'').trim())placeSegments.push({value:String(v),owner});
    if(isGhost)owner=null;
    // 번호 굵게 표시(number)는 그리기에만 쓰고 글 주인 기록에는 남기지 않는다.
    const numberMark=owner?.number;if(numberMark){const {number,...rest}=owner;owner=rest;}
    let value=String(v??''),math=false;const segment=value.trim()?{value,owner}:null;if(segment)textSegments.push(segment);
    // 꺾쇠 〈 〉(U+3008·3009)는 한글 엔진이 반 폭으로 재고 제 폭으로 그려 「〈보기〉」가 「보」와 겹치고, 줄 끝에서 「〈」만 남았다(10-23).
    // 평가원 표기대로 반각 < >로 바꿔 넣는다 — 카드에 적힌 글(segment.value)은 그대로 둔다.
    // 거북 괄호 〔 〕(U+3014·3015)도 같은 문제로 「〔실험」이 「칠험」처럼 겹쳤다(10-24 11번) — 이 글꼴에서 비슷하게 그려지는 [ ]로 넣는다.
    value=value.replace(/\u3008/g,'<').replace(/\u3009/g,'>').replace(/\u3014/g,'[').replace(/\u3015/g,']');
    if(native)value=mathParts(value).map(part=>{if(!part.math){if(part.text.replace(/\u200b/g,'').trim())texts.push(part.text.replace(/\u0332/g,''));return part.text;}math=true;const marker=`EXAMPOOL_EQ_${equations.length}_END`;equations.push({marker,script:part.text,fontSize:fontSize*100});return marker;}).join('');
    else if(value.replace(/\u200b/g,'').trim())texts.push(value.replace(/\u0332/g,''));
    // [3점]은 앞 낱말과 한 덩어리로 줄을 맞춘다(혼자 다음 줄로 떨어지지 않게).
    value=value.replace(/ (\[\d+점\])$/,'\u2060$1');
    value=(wrap?wrap(value):width&&measureText?wrapMeasured(value,width,width,v=>measureRich(v,fontSize)):wrapQuestionText(value,width,fontSize)).replace(/\u2060(\[\d+점\])$/,' $1');
    // 줄 나누기는 끝 공백을 잘라 낸다 — 「ㄱ. 」「① 」처럼 원래 공백으로 끝났으면 한 칸을 되살린다.
    if(/ $/.test(String(v??''))&&!/ $/.test(value))value+=' ';
    // 줄바꿈 바로 뒤 줄 첫머리 수식은 한글 엔진이 그리지 않는다(10-24 물리Ⅰ 11번 「S₂를」) — 앞에 1pt 크기 폭 없는 글자(U+2060)를 둔다.
    // 글자 크기 그대로 두면 엔진이 U+2060을 13px(U+200A도 7px)로 그려 그 줄만 한 글자 들어갔다(10-25 물리Ⅰ 24-9월 11번).
    value=value.replace(/\n(EXAMPOOL_EQ_\d+_END)/g,'\n\u2060$1');
    // 한글 문서에 들어간 그대로의 글(어절 줄바꿈 포함). 시트에서 고친 글을 한글 창의 같은 문단에 바로 넣을 때 쓴다.
    if(segment){segment.wrapped=value.replace(/[\uE010-\uE01F]/g,'');segment.math=math;}
    if(isGhost)value=value.replace(/\u0332/g,'');
    if(isGhost){const head=E(value.slice(0,lead)).replace(/\r?\n/g,'<br>'),rest=E(value.slice(lead)).replace(/\r?\n/g,'<br>');return native?`${head?`<span style="font-family:${font};font-size:${fontSize}pt">${head}</span>`:''}<span style="font-family:${font};font-size:${fontSize}pt;color:${GHOST_INK}">${rest}</span>`:head+rest;}
    // 「ㄱ. 」「① 」처럼 번호 뒤 빈 칸으로 끝나면 한글로 넘길 때 끝 공백이 사라진다 — 마지막 공백만 줄바꿈 없는 공백으로 남겨, 누르면 한 칸 띄운 자리에서 쓰게 한다.
    // 밑줄(10-25): 글자 뒤 결합 밑줄 문자(U+0332)가 붙은 글자들을 밑줄 서식으로. 줄바꿈에서 끊는다.
    const marked=value.replace(/\n\u2060(EXAMPOOL_EQ_)/g,'\n\uE002$1').replace(/(?:[^\u0332\n]\u0332)+/g,m=>'\uE000'+m.replace(/\u0332/g,'')+'\uE001').replace(/\u0332/g,'');
    const ul=h=>h.replace(/\uE000/g,native?'<span style="text-decoration:underline">':'<u>').replace(/\uE001/g,native?'</span>':'</u>').replace(/\uE002/g,native?'<span style="font-size:1pt">\u2060</span>':'');
    // 좁힌 줄 표시(U+E010+n): 그 줄을 글자색 #0A0B(n) 표시로 감싼다(normalizeQuestionImport가 자간 −n%로 바꾼다).
    const body=E(marked).replace(/\r?\n/g,'<br>').replace(/ $/,'&nbsp;').replace(/([\uE010-\uE01F])(.*?)(?=<br>|$)/g,(m,c,rest)=>native?`<span style="color:#0A0B${(c.charCodeAt(0)-CONDENSE).toString(16).padStart(2,'0').toUpperCase()}">${rest}</span>`:rest);
    // 문항 번호(「7.」)는 평가원처럼 굵게, 본문보다 1pt 크게(10-24). 첫 문단은 줄을 미리 나누지 않고(asIs) 엔진이 나누며, 내어쓰기는 applyQuestionIndent가 실제 번호 폭으로 잰다.
    const numLen=native&&numberMark&&value.startsWith(numberMark)?numberMark.length:0;
    if(numLen)return `<span style="font-family:${font};font-size:${fontSize+1}pt;font-weight:bold">${E(value.slice(0,numLen))}</span><span style="font-family:${font};font-size:${fontSize}pt">${ul(italicVariables(body.slice(E(value.slice(0,numLen)).length)))}</span>`;
    // 여는 작은따옴표 ‘(U+2018): 한글 엔진은 반 글자 폭으로 재는데 함초롬바탕의 ‘ 모양은 전각 칸 오른쪽에 그려져 뒤 글자(○ 등)에 덮였다(10-25 6번 「‘○’」).
    // 폭과 모양이 맞는 라틴 글꼴로 넣는다(닫는 ’는 칸 왼쪽에 그려져 문제없음).
    const quote=h=>native?h.replace(/\u2018/g,`<span style="font-family:'Times New Roman';font-size:${fontSize}pt">\u2018</span>`):h;
    return native?`<span style="font-family:${font};font-size:${fontSize}pt">${quote(ul(italicVariables(body)))}</span>`:ul(body);
  };
  const p=(v,width=null,fontSize=FS,owner=null)=>`<p style="margin:0;text-align:justify">${text(v,width,fontSize,v=>v,owner)}</p>`;
  // 그림 아래 (가)·(나): 평가원처럼 그림 가운데 아래.
  const pc=(v,width=null,fontSize=FS,owner=null)=>`<p style="margin:0;text-align:center">${text(v,width,fontSize,null,owner)}</p>`;
  // 글 옆 자료(맨 바깥 가로 묶음: 글 하나 + 그림·표 하나, 상자 아님)는 평가원처럼 글 문단 옆에 떠 있는 자료로 찍는다.
  // 그림은 어울림 그림으로, 표는 첫 지문 앞에 넣고 떠 있는 표로 바꾼다(applyFloatingTable). 자료 폭은 묶음 안 폭 비율 몫.
  let floatTable=null,floatShare=1;
  for(const g of q.blocks.filter(b=>!b.parent&&b.kind==='group'&&b.layout==='나란히'&&b.boxed!==true&&!(b.boxed===undefined&&b.label==='실험'))){
    const kids=q.blocks.filter(b=>b.parent===g.id),txt=kids.find(b=>b.kind==='text');
    // 그림만 나란히 든 묶음((가)·(나) 그림)도 하나의 자료로 띄운다.
    const figureRow=b=>b.kind==='group'&&b.layout==='나란히'&&b.boxed!==true&&!(b.boxed===undefined&&b.label==='실험')&&q.blocks.filter(x=>x.parent===b.id).length>1&&q.blocks.filter(x=>x.parent===b.id).every(x=>x.kind==='figure'&&!q.blocks.some(y=>y.parent===x.id));
    const mat=kids.find(b=>b.kind==='figure'||b.kind==='table'||figureRow(b));
    if(kids.length!==2||!txt?.text||!mat||q.blocks.some(b=>b.parent===txt.id)||mat.kind!=='group'&&q.blocks.some(b=>b.parent===mat.id))continue;
    const isOpening=q.blocks.find(b=>!b.parent)===g;if(mat.kind!=='figure'&&(!isOpening||kids[0]!==txt))continue;
    const share=(mat.ratio||1)/((mat.ratio||1)+(txt.ratio||1)),size=Math.max(10,Math.min(70,Math.round(share*(mat.size??100))));
    const at=q.blocks.indexOf(g);q.blocks.splice(at,1);
    for(const b of [txt,mat]){q.blocks.splice(q.blocks.indexOf(b),1);b.parent=null;delete b.ratio;}
    mat.size=size;mat.align=kids[0]===mat?'왼쪽':'오른쪽';
    if(mat.kind==='figure'){mat.layout='어울림';q.blocks.splice(at,0,txt,mat);}
    else{if(mat.kind==='group')delete mat.size;floatTable=mat;floatShare=share;q.blocks.splice(at,0,txt,mat);}
  }
  const opening=q.blocks.find(b=>b.parent===null),firstText=opening?.kind==='text'&&opening.text?opening:null;
  const prefix=q.number?`${q.number}. `:'',numberMark=q.number?`${q.number}.`:'';
  // 글 옆 자료: 번호는 묶음 칸 안의 첫 지문 앞에 붙고, 발문은 자료 뒤에 온다.
  const sideText=!firstText?openingSideText(q):null;
  // 배점이 3점이면 발문 끝에 [3점]. 한글 창에서 고칠 수 없는 꼬리(suffix)로 둔다.
  const mark=q.points===3?' [3점]':'',ask=q.ask+mark,askOwner=(prefix=0)=>({kind:'ask',...(prefix?{prefix}:{}),...(mark?{suffix:mark.length}:{})});
  // 평가원 순서: 발문 다음에 <보기>. 맨 바깥 보기는 발문 뒤에 찍는다.
  const afterAsk=q.blocks.filter(b=>!b.parent&&b.kind==='bogi').map(b=>b.id);
  // 기출 그림의 원본 폭(widthPt, 원본 PDF pt)이 있으면 그 크기를 넘지 않는다. 평가원 PDF 한 단(387pt)이 조판 단 폭(columnPx)에 대응.
  // 평가원 원본 한 단 = 112mm = 317.5pt(원본 PDF에서 잰 〈보기〉·본문 폭). 387pt는 문항 영역(번호 여백 포함) 폭이라 그 값으로 환산하면
  // 원본 폭을 쓰는 그림·표가 모두 0.82배로 작게 들어갔다(10-25 16번 표 실측 104.7pt = 엔진 104.4pt). B4 단(112mm)에서는 1:1.
  const KICE_COLUMN_PT=317.5,columnPx=width;
  // 기출 그림(widthPt 있음)은 원본 크기 그대로(원본 폭 ÷ 원본 단 387pt × 조판 단 폭), 들어갈 칸보다 크면 칸에 맞춘다. 원본 폭이 없으면 정한 크기(size %).
  const figWidth=(b,slot)=>Number(b.figure?.widthPt)>0?Math.min(slot,b.figure.widthPt*columnPx/KICE_COLUMN_PT):sizedWidth(b,slot);
  const picture=async(f,width,align,owner={kind:'other'})=>{
    if(!f)return '';
    const image=await prepareFigure(clone(f));
    if(!/^data:image\/png;base64,[A-Za-z0-9+/]*={0,2}$/.test(image.data))throw Error('한글에 넣을 그림을 PNG로 준비하지 못했습니다.');
    const ratio=Number(image.height)/Number(image.width);
    if(!Number.isFinite(ratio)||ratio<=0)throw Error('그림 크기를 확인하세요.');
    const original=owner.kind==='choice'&&Number(f.widthPt)>0?f.widthPt*columnPx/KICE_COLUMN_PT:Infinity;
    // 원본 그림 픽셀 폭으로 줄이지 않는다(10-24 지적 2·3: 그림이 칸을 채우지 못했음). 그림 선지만 원본 크기를 넘지 않는다.
    const w=Math.min(width,original),h=w*ratio;
    images.push(image.data);imageOwners.push(owner);
    const img=`<img src="${image.data}" width="${Math.round(w)}" height="${Math.round(h)}" alt="${E(image.name)}">`;
    return align?`<p style="margin:0;text-align:${{왼쪽:'left',가운데:'center',오른쪽:'right'}[align]}">${img}</p>`:img;
  };
  const table=async(t,width,choices=false,align,owner=choices?{kind:'choices'}:{kind:'table'},auto=false,room=width)=>{
    recordTable(t.rows,t.cols+(choices?1:0),t.merges.map(m=>({...m,c:m.c+(choices?1:0)})),owner);
    // 기출 표: 원본 열 폭(colWidths, PDF pt)·칸 글자 크기(fontPt)가 있으면 원본 비율 그대로(평가원 한 단 387pt = 조판 단 폭).
    // 글자도 열 폭과 같은 배율로(pt→px 배율 × 0.75). B4 원본 단에서는 원본 글자 크기 그대로(10-25: 장평 보정으로 키우던 것은 뺌).
    const original=!choices&&Array.isArray(t.colWidths)&&t.colWidths.length===t.cols&&t.colWidths.every(v=>Number(v)>0)?t.colWidths.map(Number):null;
    // 기출 표 칸 글의 원본 줄바꿈은 원본 글꼴 폭 기준이라 그대로 두면 우리 줄 나눔과 겹쳐 한 낱말만 남는 줄이 생긴다(10-25 e1 6월 1번 「같은」).
    // 열 폭이 원본과 같으므로 줄바꿈을 띄어쓰기로 풀고 칸 폭으로 다시 나눈다.
    if(original)t={...t,cells:t.cells.map(row=>row.map(c=>c&&typeof c.value==='string'?{...c,value:c.value.replace(/[ \t]*\n[ \t]*/g,' ')}:c))};
    const fontSize=Number(t.fontPt)>0?Math.min(11,Math.max(7,Math.round(t.fontPt*columnPx/KICE_COLUMN_PT*.75*2)/2)):t.cols>3?9:10,headSize=Number(t.fontPt)>0?fontSize:fontSize-1;
    let inner=width-(choices?25:0);
    // 기출 표는 원본 실제 폭(열 폭 합)을 쓴다 — 놓일 자리를 꽉 채우면 원본보다 넓어져 아래 글이 모두 밀렸다(10-25 겹쳐 보기: 6번 표 198pt를 상자 폭으로 넓힘).
    // (예전에 표가 좁았던 것은 단 폭을 387pt로 잡은 배율 오류였다 — 317.5pt로 고친 뒤 열 폭 합은 원본 표와 같다.)
    if(original){const w=original.reduce((a,b)=>a+b,0)*columnPx/KICE_COLUMN_PT;inner=Math.min(room-(choices?25:0),w);width=inner+(choices?25:0);}
    // 열 폭: 원본 열 폭이 없으면 표 폭 안에서 칸 글 길이 비율로 나눈다.
    // 열마다 가장 긴 어절은 한 줄에 들어가게 한다(어절 중간에서 끊기면 칸 높이를 넘는다). 빈 표·그림이 든 표·선지표는 똑같이 나눈다.
    let colW=Array(t.cols).fill(inner/t.cols);
    // 원본 열 폭이 있으면 글자 폭을 잴 수 있어도 그 비율 그대로(10-24 11번 — 내용 길이로 다시 나누면 첫 칸이 좁아져 「항원 항체」가 네 줄이 됐다).
    if(original){const sum=original.reduce((a,b)=>a+b,0);colW=original.map(v=>v*inner/sum);}
    else if(!choices&&measureText&&!t.cells.flat().some(c=>c.figure)&&t.cells.flat().filter(c=>String(c.value).trim()).length>=Math.max(2,t.cols)){
      const nat=Array(t.cols).fill(36),word=Array(t.cols).fill(36),spans=[];
      for(let r=0;r<t.rows;r++)for(let c=0;c<t.cols;c++){
        if(tableCovered(t,r,c))continue;
        const m=t.merges.find(m=>m.r===r&&m.c===c),size=r<t.headerRows?headSize:fontSize,value=String(t.cells[r][c].value);
        const w=Math.max(0,...value.split(/\r?\n/).map(line=>measureRich(line,size)))+22,longest=Math.max(0,...words(value).map(x=>measureRich(x,size)))+22;
        if((m?.cs||1)===1){nat[c]=Math.max(nat[c],w);word[c]=Math.max(word[c],longest);}else spans.push({c,cs:m.cs,w});
      }
      for(const {c,cs,w} of spans){const have=nat.slice(c,c+cs).reduce((a,b)=>a+b,0);if(w>have)for(let i=c;i<c+cs;i++)nat[i]+=(w-have)/cs;}
      // 원본 열 폭이 있으면 그 비율을 쓰고, 가장 긴 어절이 들어가는 최소 폭만 지킨다. 어절이 다 들어가지 않으면 자리가 있는 만큼 넓힌다.
      if(original){
        const wordSum=word.reduce((a,b)=>a+b,0);if(wordSum>inner&&room>width)inner=Math.min(room-(choices?25:0),wordSum*1.05);
        const sum=original.reduce((a,b)=>a+b,0);original.forEach((v,i)=>{nat[i]=v*inner/sum;});
      }
      const total=nat.reduce((a,b)=>a+b,0);
      // 크기를 정한 표라도 글이 그 폭에 다 들어가지 않고 단에 자리가 있으면 글 폭만큼(단 폭까지) 넓힌다(좁게 줄여 칸마다 여러 줄이 되던 문제).
      if(total>inner&&room>width)inner=Math.min(total,room-(choices?25:0));
      // 원본 폭을 모르는 표는 단(또는 정한 크기) 폭 가득. 열 폭만 칸 글 길이 비율로.
      // 어절 최소 폭도 다 들어가지 않으면 예전처럼 똑같이 나눈다.
      if(word.reduce((a,b)=>a+b,0)>inner)colW=Array(t.cols).fill(inner/t.cols);
      else{
        const minimum=word;
        colW=nat.map(v=>v*inner/total);
        // 짧은 열을 최소 폭으로 올리고 남은 폭을 나머지 열에 나눈다. 한 번 올린 열은 계속 고정.
        const fixed=new Set();
        for(let pass=0;pass<t.cols;pass++){
          const used=[...fixed].reduce((a,i)=>a+minimum[i],0),rest=nat.reduce((a,v,i)=>a+(fixed.has(i)?0:v),0);
          colW=nat.map((v,i)=>fixed.has(i)?minimum[i]:rest?v*(inner-used)/rest:0);
          const short=colW.map((v,i)=>!fixed.has(i)&&v<minimum[i]);if(!short.some(Boolean))break;short.forEach((x,i)=>{if(x)fixed.add(i);});
        }
        const sum=colW.reduce((a,b)=>a+b,0);if(sum>inner)colW=colW.map(v=>v*inner/sum);
      }
      width=colW.reduce((a,b)=>a+b,0)+(choices?25:0);
    }
    const cw=(c,cs=1)=>colW.slice(c,c+cs).reduce((a,b)=>a+b,0);
    // 평가원 자료표: 위아래 여백 작게. 한 줄 칸 높이 약 22px(10pt, 이전 30px).
    // 기출 표에 원본 행 높이(rowHeights, pt)가 있으면 한 줄 칸은 그 높이 그대로(10-25 겹쳐 보기: 6번 원본 11.7pt인데 15pt로 찍혀 표가 컸다).
    // 분수처럼 글자보다 높은 수식이 든 칸은 원본 높이보다 커질 수 있다(새 32문항 시험: c2 25-6월 19번 분수가 칸 아래로 잘림).
    const PITCH=1.15,origRows=original&&Array.isArray(t.rowHeights)&&t.rowHeights.length===t.rows?t.rowHeights.map(v=>Number(v)*columnPx/KICE_COLUMN_PT):null;
    const rowHeights=origRows?origRows.map(v=>Math.round(v*100)/100):Array(t.rows).fill(Math.ceil(fontSize*4/3*PITCH+6));
    for(let r=0;r<t.rows;r++)for(let c=0;c<t.cols;c++){
      if(tableCovered(t,r,c))continue;
      const m=t.merges.find(m=>m.r===r&&m.c===c),span=m?.rs||1;
      const cellText=t.cells[r][c].value,cellLimit=original?cw(c,m?.cs)-Math.ceil(2*L.cellPad)-1:cw(c,m?.cs)-16,wrapped=measureText?wrapMeasured(cellText,cellLimit,cellLimit,v=>measureRich(v,fontSize)):wrapQuestionText(cellText,cellLimit,fontSize);
      // 여러 줄 칸은 칸 문단 줄 간격(가운데 칸 글 130%, normalizeQuestionImport)으로 잰다.
      // 줄 수는 실제 글 나누기와 같은 폭(cellLimit)으로 센다 — 여백 16px로 세면 「항원 항체」를 네 줄로 보고 칸을 높게 잡아 빈 곳이 남았다(10-25 11·13번).
      // 기출 표 여러 줄 칸: 엔진 실측 줄 간격 = 글자 크기 × 1.6(8pt에서 17px), 위아래 칸 여백.
      const lines=wrapped.split('\n').length,needed=origRows&&lines===1&&!(extraHeight(wrapped,fontSize)>0)?0:Math.ceil(lines>1?(original?lines*fontSize*4/3*1.6+2*L.cellPad+2:lines*fontSize*4/3*1.45+10):fontSize*4/3*PITCH+6)+Math.ceil(extraHeight(wrapped,fontSize));
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
        const head=r<t.headerRows,cellFont=head?'함초롬돋움':'함초롬바탕',cellSize=head?headSize:fontSize;
        // 칸 안 글 폭: 기출 표(원본 열 폭)는 실제 칸 여백만 뺀다 — 16px을 빼면 원본 폭에서 「항원 항체」도 한 줄에 못 들어갔다(10-24 11번).
        const textW=original?cw(c,m?.cs)-Math.ceil(2*L.cellPad)-1:cw(c,m?.cs)-16;
        const formatted=text(cell.value,textW,cellSize,null,{kind:'cell',table:owner.id||owner.kind,r,c},cellFont).replace(/^<span[^>]*>|<\/span>$/g,'');
        // Separate paragraphs let the native cell center the entire header
        // block. A soft line break centers only its first line in this engine.
        let body=await picture(cell.figure,cw(c,m?.cs)-16,undefined,{kind:'cell',table:owner.id||owner.kind,r,c})+formatted.split('<br>').map(line=>`<p style="margin:0;text-align:center;line-height:${PITCH*100}%;font-family:${cellFont};font-size:${cellSize}pt"><span style="font-family:${cellFont};font-size:${cellSize}pt">${line||(cell.value===''&&!cell.figure&&nested?'\u2060':'')}</span></p>`).join('');
        if(t.diagonal&&r===0&&c===0){
          body=p(t.diagonal.col)+p(t.diagonal.row)+body;
          warnings.push('대각선 머리글의 축 이름은 전달됩니다. 사선은 한글에서 지정하세요.');
        }
        html+=`<${tag}${m?` rowspan="${m.rs}" colspan="${m.cs}"`:''} style="border:${RULE};width:${cw(c,m?.cs)}px;height:${rowHeights.slice(r,r+(m?.rs||1)).reduce((a,b)=>a+b,0)}px;padding:${L.cellPad}px;text-align:center;vertical-align:middle">${body}</${tag}>`;
      }
      html+='</tr>';
    }
    // 표 아래 주석: 다른 칸 글처럼 실제 글자 폭으로 줄을 미리 나눈다. 칸 안 문단은 한글 엔진이 줄을 다시 나누지 않아, 나누지 않으면 두 줄 글이 한 줄에 눌려 그려진다.
    // 범례: 기출 표는 원본처럼 표 오른쪽 끝에 맞춘다(표와 같은 폭·정렬의 테두리 없는 한 칸 표, 표 글자 크기). 10-25 겹쳐 보기 6번.
    if(t.note&&original){recordTable(1,1,[],{kind:'layout'});
      return html+'</table>'+`<table${align?` align="${{왼쪽:'left',가운데:'center',오른쪽:'right'}[align]}"`:''} style="border-collapse:collapse;width:${width}px"><tr><td style="border:none;padding:0;width:${width}px"><p style="margin:0;text-align:right">${text(t.note,null,fontSize,v=>v,{kind:'note',table:owner.id||owner.kind})}</p></td></tr></table>`;}
    return html+'</table>'+(t.note?`<p style="margin:0;text-align:justify">${text(t.note,width-12,10,null,{kind:'note',table:owner.id||owner.kind})}</p>`:'');
  };
  // 어울림 그림: 바로 앞 맨 바깥 글 문단(없으면 번호가 붙는 첫 문단)의 맨 앞에 넣고, 한글로 들여온 뒤 떠 있는 그림으로 바꾼다
  // (applyFloatingPictures). 글자처럼 취급하지 않으므로 문단 글은 그대로 그림 옆·아래로 흐른다. 그림 폭은 크기(단 폭 대비 %).
  const floatsAt=new Map(),floated=new Set();
  {let at='first';for(const b of q.blocks.filter(b=>!b.parent)){
    if(b.kind==='text'&&b!==firstText&&b.text)at=b.id;
    if(isWrapped(b)&&(b.figure||ghost.figures.has(b.id)&&ghostFigure)){if(!floatsAt.has(at))floatsAt.set(at,[]);floatsAt.get(at).push(b);floated.add(b.id);}
  }}
  const floatImages=async(at,width)=>{let html='';for(const b of floatsAt.get(at)||[]){
    const w=figWidth(b,width);if(!b.figure)b.figure=ghostFigure(Math.round(w),Math.round(Math.min(150,w*.55)),b.label);
    html+=await picture(b.figure,w,undefined,{kind:'block',id:b.id});floats.push({data:images.at(-1),align:b.align==='왼쪽'?'Left':'Right'});
  }return html;};
  // 간격(mm): 구성 앞에 높이를 가진 빈 문단을 둔다. 값이 없으면 넣지 않는다.
  // 블록 앞 간격: 블록 값(mm) → 없으면 조판 기준 gaps.block(수능 틀 0). 발문·선지 앞은 문항의 askGap·choicesGap → 기준 gaps.ask·choices.
  // 정확한 간격(10-22 실험): 1pt 글자 빈 문단은 0.58mm를 차지하고 위 여백(margin-top)은 그대로 들어간다(높이 지정은 엔진이 무시).
  // 문항 문서 안에서는 바로 뒤 문단(글·표를 붙인 문단 모두)이 이 문단의 위 여백을 한 번 더 받아 두 번 들어간다
  // (실측: 발문 앞·선지 표 앞 모두 1mm마다 2mm). 그래서 위 여백 = (원하는 값 − 0.58mm) ÷ 2. 0이면 넣지 않는다.
  const gapHtml=mm=>{if(!(mm>0))return '';const px=Math.max(0,mmToPx((mm-SPACER_MM)/2));return `<p style="margin:0;margin-top:${px}px"><span style="font-size:1pt"> </span></p>`;};
  const roleGap={text:L.gapText,material:L.gapMaterial,bogi:L.gapBogi};
  // 블록 앞: 블록에 정한 간격(b.gap) → 없으면 조판 기준의 종류별 간격. 둘 다 정확한 방식(예전 빈 문단은 3.6mm + 값의 두 배가 들어갔다).
  const spacer=b=>gapHtml(b.gap===undefined?roleGap[gapRole(b.kind)]:b.gap);
  // 실험 과정·결과 같은 머리: 〔실험 과정〕. 괄호는 고칠 수 없는 앞뒤로 둔다.
  const heading=b=>(b.kind==='steps'||b.heading===true)&&b.label?p(`〔${b.label}〕`,null,FS,{kind:'label',id:b.id,prefix:1,suffix:1}):'';
  // 자료 뒤 간격(평가원: 상자·표·그림·〈보기〉를 담은 문단의 「문단 아래」 2.01mm × 0.768). 맨 바깥 자료에만.
  // 글 옆 자료(떠 있는 표·그림 묶음)를 그릴 때는 넣지 않는다 — 자료 뒤 빈 문단이 끼면 applyFloatingTable이 「번호 문단 바로 앞 표」를 찾지 못한다(10-24 3·4번).
  let floating=false;const afterGap=parent=>parent===null&&!nested&&!inBox&&!floating?gapHtml(L.gapAfter):'';
  const walk=async(parent,width,onlyId=null)=>{
    let html='';
    for(const b of q.blocks.filter(b=>b.parent===parent&&(!onlyId||b.id===onlyId))){
      if(b===firstText||!onlyId&&afterAsk.includes(b.id)||floated.has(b.id)||b===floatTable&&!onlyId)continue;
      html+=spacer(b);
      // 글 옆 묶음 칸 안의 첫 지문(번호 포함)도 칸 폭으로 어절 줄바꿈을 넣는다(엔진은 칸 안 글을 한 줄에 눌러 담는다).
      if(b===sideText)html+=measureText?`<p style="margin:0;text-align:left">${text(prefix+b.text,Math.max(35,width-10),FS,null,{kind:'block',id:b.id,prefix:prefix.length,number:numberMark})}</p>`:p(prefix+b.text,width,FS,{kind:'block',id:b.id,prefix:prefix.length});
      // 상자·가로 묶음 칸 안 글은 실제 글꼴 폭으로 어절 단위 줄바꿈을 넣는다. 칸 문단은 한글 엔진이 줄 수를 다시 세지 않아 칸이 한 줄 높이로 남는다.
      // 상자 안 항목 줄(○ · (가) · ①)은 항목마다 한 문단으로 나누고, 번호 폭만큼 내어쓴다(10-24, 평가원 지면). 내어쓰기 값은 applyReferenceBogiIndent가 실제 폭으로 건다.
      else if(b.kind==='text'&&b.text&&(nested||inBox)&&measureText&&b.text.split(/\r?\n/).some(r=>ITEM_LEAD.test(r))){
        // 칸 안 글 폭: 엔진 실측으로 칸 안쪽 폭보다 2px 좁으면 넘치지 않는다(7번 상자) — 4px만 남긴다(다른 칸 글의 10px보다 덜 남겨 상자를 채운다).
        // 글자 폭 재기가 엔진과 맞으므로(10-25) 1px만 남긴다 — 4px씩 두 번 남겨 원본보다 한 낱말 일찍 넘어갔다(6번 (가)).
        const w=Math.max(35,width-1),measure=v=>measureRich(v,FS);
        html+=b.text.split(/\r?\n/).map((row,line)=>{const m=row.match(ITEM_LEAD),keep=m?m[0]:'',lead=m?(m[1]||m[2])+' ':'',shown=lead+row.slice(keep.length);
          return `<p style="margin:0;text-align:left">${text(shown,w,FS,lead?v=>besideCount(wrapHangingText(v,besideWidth(w,line),lead,measure,TIGHT)):beside?v=>besideCount(wrapHangingText(v,besideWidth(w,line),'',measure,TIGHT)):null,{kind:'blockLine',id:b.id,line,keep,prefix:lead.length})}</p>`;}).join('');
      }
      else if(b.kind==='text'&&b.text&&(nested||inBox)&&measureText)html+=`<p style="margin:0;text-align:left">${text(b.text,Math.max(35,width-10),FS,beside?v=>besideCount(wrapHangingText(v,besideWidth(Math.max(35,width-10)),'',v=>measureRich(v,FS))):null,{kind:'block',id:b.id})}</p>`;
      else if(b.kind==='text')html+=b.text?floatsAt.has(b.id)?`<p style="margin:0;text-align:justify">${await floatImages(b.id,width)}${text(b.text,width,FS,v=>v,{kind:'block',id:b.id})}</p>`:p(b.text,width,FS,{kind:'block',id:b.id}):'';
      else if(b.kind==='figure'){
        html+=heading(b);
        if(!b.figure&&ghost.figures.has(b.id)&&ghostFigure){const w=sizedWidth(b,width);b.figure=ghostFigure(Math.round(w),Math.round(Math.min(150,w*.55)),b.label);}
        // 평가원 지면: 글 아래(맨 바깥) 그림은 가운데. 정렬을 고른 그림만 그쪽으로. 상자·묶음 칸 안 그림은 예전처럼 칸 흐름대로
        // (칸 안에서 가운데 문단으로 감싸면 한글 엔진이 그 줄 배치를 빠뜨려 아래 글이 그림과 겹친다).
        // 그림은 무조건 가운데(사용자 결정 2026-10-19). 글 옆 어울림 그림만 예외(위 floats).
        // 칸 안(상자·묶음)에서는 가운데 문단 대신 테두리 없는 한 칸 표로 감싸 가운데에 둔다(2×N 표 칸과 같은 방식).
        // 칸 안(상자·묶음)은 HTML에서 가운데 문단으로 감싸면 한글 엔진이 줄 배치를 빠뜨리므로, 한글 문서를 만든 뒤 그 문단만 가운데로 바꾼다(typeset.js centerCellPictures).
        // 칸 안(상자·묶음·나란히) 그림은 칸 폭에 좌우맞춤(10-24 지적 2·3) — 원본 비율로 줄인 크기(size)를 쓰지 않는다.
        if(b.figure)html+=((nested||inBox)?await picture(b.figure,Number(b.figure.widthPt)>0?Math.min(Math.max(35,width-10),figWidth(b,width)):Math.max(35,width-10),undefined,{kind:'block',id:b.id}):await picture(b.figure,figWidth(b,width),'가운데',{kind:'block',id:b.id}))+(/^\(.+\)$/.test(b.label)||b.text?(b.text?p:pc)((/^\(.+\)$/.test(b.label)?b.label:'')+(b.text?' '+b.text:''),width,FS,b.text?{kind:'block',id:b.id,prefix:(/^\(.+\)$/.test(b.label)?b.label:'').length+1}:null):'');
      }else if(b.kind==='table')html+=heading(b)+await table(b.table,sizedWidth(b,width),false,'가운데',{kind:'block',id:b.id},b.size===undefined,width);
      else if(b.kind==='group'){
        const boxed=b.boxed===true||b.boxed===undefined&&b.label==='실험',children=q.blocks.filter(x=>x.parent===b.id);let body;
        const isBoxed=g=>g.boxed===true||g.boxed===undefined&&g.label==='실험',kidsOf=g=>q.blocks.filter(x=>x.parent===g.id);
        const material=c=>(c.kind==='figure'||c.kind==='table')&&!q.blocks.some(x=>x.parent===c.id);
        const sideRow=g=>g.kind==='group'&&g.layout==='나란히'&&!isBoxed(g)&&kidsOf(g).length>1;
        const flatten=boxed&&(b.layout==='나란히'&&children.length>1||children.some(sideRow));
        const innerWidth=Math.max(35,width-(boxed?Math.ceil(2*L.boxSide)+1-TABLE_OUT:0)),boxSlot=boxed&&!flatten?reserveTable():null;
        if(flatten){
          // 상자 안의 가로 묶음은 상자 표의 한 줄로 만든다. 표를 세 겹 넣으면(상자→가로→결과표)
          // 한글 엔진이 안쪽 표의 병합을 잃는다. 첫 줄은 묶음 이름, 그다음 줄은 구성마다 하나.
          const slot=reserveTable(),rule=RULE,titled=!!b.label;
          // 줄마다 칸 내용을 먼저 만든다. 내용이 없는 구성(빈 설명 등)은 줄을 만들지 않는다. 빈 칸 줄은 한글 엔진이 다르게 처리한다.
          let rows=[];
          // 칸 폭(한글 표)은 칸 여백을 포함한다 — 줄 칸 폭 합계는 상자 바깥 폭(width), 칸 안 글은 칸 폭 − 좌우 여백(cellPadX)으로 나눈다.
          // 안쪽 폭 합계로 잡으면 상자 표가 단보다 27px 좁게 들어가고 칸 안 글이 넘쳐 한 어절만 남는 줄이 생겼다(10-24 15번).
          const cellPadX=Math.ceil(2*L.boxSide)+2;
          const plan=(b.layout==='나란히'?[{cells:children,group:b}]:children.map(c=>sideRow(c)?{cells:kidsOf(c),group:c}:{cells:[c],single:true})).map(row=>({...row,widths:row.single?[innerWidth]:rowWidths(row.cells,width)}));
          // 한 상자 표 안의 나란히 줄은 열 경계를 함께 쓴다(한글 표는 줄마다 다른 칸 나누기를 못 한다) — 「글 | 자료」 줄이 둘 이상이면
          // 자료 칸 폭을 그중 가장 넓은 것으로 맞춘다. 줄마다 따로 나누면 엔진이 경계를 엉키게 해 글 칸이 한 단어 폭이 됐다(10-24 15번).
          {const two=plan.filter(r=>!r.single&&r.cells.length===2);
            if(two.length>1&&two.every(r=>!material(r.cells[0])&&material(r.cells[1]))){const m=Math.max(...two.map(r=>r.widths[1]));for(const r of two)r.widths=[width-m,m];}}
          // 그림 어울림(10-25, 평가원 지면): 「글(실험 과정) | 그림」 줄은 한 칸으로 합치고 그림을 칸 오른쪽 위에 띄운다.
          // 칸 안에서는 엔진이 줄을 다시 나누지 않으므로 그림 높이만큼의 줄만 좁게 나누고 그 아래 줄은 상자 폭 전체를 쓴다 — 두 칸 표로 두면 (나)까지 좁은 칸에 갇혔다.
          // 그림은 첫 문단(〔실험 과정〕 머리) 맨 앞에 넣고, 한글로 들여온 뒤 글 앞 그림으로 바꾼다(applyCellFloatingPictures). 머리 한 줄 아래, (가) 줄에 맞춘다.
          const wrapRow=row=>!row.single&&row.cells.length===2&&['text','steps'].includes(row.cells[0].kind)&&row.cells[1].kind==='figure'&&row.cells[1].figure&&physical(row.cells[1])>0&&!q.blocks.some(x=>x.parent===row.cells[1].id)&&measureText&&native;
          for(const row of plan)if(wrapRow(row)){row.wrapFigure=row.cells[1];row.cells=[row.cells[0]];row.single=true;row.widths=[innerWidth];}
          for(const row of plan){
            const n=row.single?1:row.cells.length,widths=row.widths,inner=[];
            if(row.wrapFigure){
              const f=row.wrapFigure,pitch=FS*4/3*(L.lineSpacing||160)/100,slot=images.length,img=await picture(f.figure,Math.min(innerWidth*.6,figWidth(f,innerWidth)),undefined,{kind:'block',id:f.id});
              const fw=Number(img.match(/width="(\d+)"/)[1]),fh=Number(img.match(/height="(\d+)"/)[1]),head=row.cells[0].kind==='steps'&&row.cells[0].label?1:0;
              const at=f.figure.besideAt||{item:0,line:0};
              beside={k:Math.ceil((fh+4)/pitch),narrow:Math.max(80,innerWidth-fw-14),used:0,from:null,at:{item:Number(at.item)||0,line:Number(at.line)||0}};
              let body,from=0;nested++;try{body=await walk(row.group.id,innerWidth,row.cells[0].id);from=beside.from??0;}finally{nested--;beside=null;}
              // 그림은 1pt 빈 문단에 따로 두고(머리 다음) 띄운다. 글 문단에 넣으면 엔진이 그림을 문단 맨 앞에 두고, 띄운 뒤에도
              // 칸 문단에서는 그림 폭만큼 자리를 남겨 그 줄 글이 밀렸다(10-25).
              const holder=`<p style="margin:0;line-height:100%;font-size:1pt"><span style="font-size:1pt">\u2060${img}</span></p>`;
              // 칸 문단은 1pt여도 8px를 차지해 머리와 (가) 사이에 두면 (가)가 내려간다 — 칸 맨 앞(머리 위)에 두고 (가) 줄까지 내려 띄운다.
              // 칸 안 그림은 문단 기준 위치만 되고 위쪽(음수)·종이 기준은 엔진이 받지 않는다. 내릴 거리는 들여온 뒤 (가) 줄의 실제 위치로 잰다(anchorPara = 칸 안 문단 번호).
              inner.push(holder+body);cellFloats.push({data:images[slot],align:'Right',anchorPara:1+head,line:from});
              rows.push({...row,n,widths,inner});continue;
            }
            nested++;try{for(const [i,cell] of row.cells.entries())inner.push(row.single?await walk(b.id,innerWidth,cell.id):await walk(row.group.id,Math.max(35,widths[i]-cellPadX+(i===row.cells.length-1?TABLE_OUT:0)),cell.id));}finally{nested--;}
            if(row.single&&!inner[0].trim())continue;
            for(let i=0;i<inner.length;i++)if(!inner[i].trim())inner[i]='<p><br></p>';
            rows.push({...row,n,widths,inner});
          }
          if(!rows.length)rows=[{cells:[],single:true,n:1,widths:[innerWidth],inner:['<p><br></p>']}];
          // 공통 열(10-24 13번): 모든 나란히 줄의 칸 경계를 모아 열을 만들고, 칸마다 자기 폭만큼 열을 합친다(colspan).
          // 줄마다 칸 경계가 다르면(「그림 | 표」와 「글 | 그림」) 한글 표가 열을 엉키게 잡아 상자가 단 밖으로 넓어졌다.
          const grid=[0];{const cuts=[];for(const row of rows)if(!row.single){let x=0;for(const w of row.widths.slice(0,-1)){x+=w;cuts.push(x);}}
            for(const x of cuts.sort((p,q)=>p-q))if(x-grid.at(-1)>=4&&width-x>=4)grid.push(x);grid.push(width);}
          const near=x=>{let k=0;for(let i=1;i<grid.length;i++)if(Math.abs(grid[i]-x)<Math.abs(grid[k]-x))k=i;return k;};
          for(const row of rows){if(row.single){row.at=[0];row.span=[grid.length-1];continue;}let x=0;row.at=[];row.span=[];
            row.widths.forEach((w,i)=>{const c0=near(x),c1=i===row.widths.length-1?grid.length-1:near(x+w);row.at.push(c0);row.span.push(Math.max(1,c1-c0));x+=w;});}
          const cols=grid.length-1,merges=[];
          // 어느 줄에서도 혼자 쓰이지 않는 열이 있으면 엔진이 그 열 폭을 몰라 기본값(약 130px)을 넣어 상자가 넓어진다(13번 452px, colgroup은 무시됨).
          // 그때만 열마다 칸 하나인 얇은 줄(1pt 빈 글자)을 제목 줄 다음에 넣어 열 폭을 알려 준다.
          const alone=new Set();for(const row of rows)row.span.forEach((sp,i)=>{if(sp===1)alone.add(row.at[i]);});
          const spacer=cols>1&&alone.size<cols?1:0,top=(titled?1:0)+spacer;
          if(titled&&cols>1)merges.push({r:0,c:0,rs:1,cs:cols});
          let body='';
          for(const [ri,row] of rows.entries()){
            const r=ri+top,last=ri===rows.length-1,spans=row.span;
            spans.forEach((span,i)=>{if(span>1)merges.push({r,c:row.at[i],rs:1,cs:span});});
            let tr='<tr>';
            for(const [i,inner] of row.inner.entries()){
              // 글 칸은 위쪽, 그림·표만 든 자료 칸은 세로 가운데(옆 글이 길어도 자료는 칸 가운데).
              const valign=!row.single&&material(row.cells[i])?'middle':'top';
              const edge=`${!titled&&!spacer&&ri===0?`border-top:${rule};`:''}${i===0?`border-left:${rule};`:''}${i===row.n-1?`border-right:${rule};`:''}${last?`border-bottom:${rule};`:''}`;
              tr+=`<td${spans[i]>1?` colspan="${spans[i]}"`:''} style="border:none;${edge}padding:${row.single?`2px ${L.boxSide}px`:`5px ${L.boxSide}px`}${last?` ${L.boxBottom+Math.round((b.pad||0)*96/25.4)}px`:''};vertical-align:${valign};width:${grid[row.at[i]+spans[i]]-grid[row.at[i]]}px">${inner}</td>`;
            }
            body+=tr+'</tr>';
          }
          // 제목 없는 상자(설명·조건, 실험)는 제목 줄 없이 첫 줄에 위 테두리를 둔다.
          if(spacer)body=grid.slice(1).map((x,i)=>`<td style="border:none;${!titled?`border-top:${rule};`:''}${i===0?`border-left:${rule};`:''}${i===cols-1?`border-right:${rule};`:''}padding:0;height:1px;width:${x-grid[i]}px"><p style="margin:0"><span style="font-size:1pt">\u2060</span></p></td>`).join('').replace(/^/,'<tr>').replace(/$/,'</tr>')+body;
          recordTable(rows.length+top,cols,merges,{kind:'boxside',id:b.id},slot);
          const tail=afterGap(parent);
          html+=`<table style="border-collapse:collapse;width:${width}px">${titled?`<tr><td${cols>1?` colspan="${cols}"`:''} style="border:none;border-top:${rule};border-left:${rule};border-right:${rule};width:${width}px;padding:${L.boxTop}px ${L.boxSide}px 0">${p(b.label,null,FS,{kind:'label',id:b.id})}</td></tr>`:''}${body}</table>`+tail;
          continue;
        }
        const materials=b.layout==='나란히'&&children.length>1&&children.every(c=>(c.kind==='figure'||c.kind==='table')&&!q.blocks.some(x=>x.parent===c.id));
        if(materials){
          // 나란한 자료(그림·표 2~3개): 테두리 없는 2행 표. 윗줄 칸마다 자료를 가로·세로 모두 가운데(옆 자료가 더 높아도 칸 가운데),
          // 아랫줄 칸마다 (가)·(나) 같은 이름을 가운데. 열 폭은 묶음 안 폭 비율. 표는 칸 폭 가득, 그림은 칸 폭을 넘지 않는 크기로 가운데.
          const widths=rowWidths(children,innerWidth),caption=c=>(/^\(.+\)$/.test(c.label)?c.label:'')+(c.text?(/^\(.+\)$/.test(c.label)?' ':'')+c.text:''),captioned=children.some(c=>caption(c));
          recordTable(captioned?2:1,children.length,[],{kind:'side',id:b.id});
          const tops=[],heights=[],notes=[];
          nested++;try{for(const [i,c] of children.entries()){
            const cellW=Math.max(35,widths[i]-12);let inner='';
            if(c.kind==='figure'){
              if(!c.figure&&ghost.figures.has(c.id)&&ghostFigure){const w=sizedWidth(c,cellW);c.figure=ghostFigure(Math.round(w),Math.round(Math.min(150,w*.55)),c.label);}
              if(c.figure){inner=await picture(c.figure,Math.min(cellW,figWidth(c,cellW)),undefined,{kind:'block',id:c.id});heights.push(Number(inner.match(/height="(\d+)"/)?.[1])||0);}
            }else{
              // 표 아래 설명(예 「0은 실제 값…」)은 칸 안이 아니라 나란한 자료 전체 아래 줄로(10-22 10번 「나」안 조판 쪽).
              // 짧은 설명(칸 폭에 한 줄로 드는 「(○: 있음, ×: 없음)」)은 평가원처럼 그 표 바로 아래 가운데(10-25 16번). 긴 설명만 묶음 아래 줄로.
              const note=c.table?.note,short=!!note&&(measureText?measureRich(note,10)<=cellW-4:String(note).length<=24);
              if(note&&!short)notes.push({note,id:c.id});
              inner=await table(note?{...c.table,note:''}:c.table,cellW,false,undefined,{kind:'block',id:c.id},false,cellW);
              if(short)inner+=`<p style="margin:0;text-align:center">${text(note,null,10,v=>v,{kind:'note',table:c.id})}</p>`;
            }
            tops.push(inner||'<p><br></p>');
          }}finally{nested--;}
          const topH='';
          body=`<table style="border-collapse:collapse;width:${innerWidth}px"><tr>${tops.map((inner,i)=>`<td style="border:none;padding:4px 4px 2px;vertical-align:middle;text-align:center;${topH}width:${widths[i]}px">${inner}</td>`).join('')}</tr>`;
          if(captioned)body+=`<tr>${children.map((c,i)=>{const label=caption(c),hasText=!!c.text,prefix=/^\(.+\)$/.test(c.label)?c.label.length+1:0;
            return `<td style="border:none;padding:2px 4px 4px;vertical-align:top;text-align:center;height:24px;width:${widths[i]}px"><p style="margin:0;text-align:center">${label?text(label,Math.max(35,widths[i]-12),FS,null,hasText?{kind:'block',id:c.id,prefix}:(placeSegments.push({value:label,owner:{kind:'block',id:c.id}}),null)):'\u2060'}</p></td>`;}).join('')}</tr>`;
          body+='</table>';
          // 칸 밖 문단은 한글 엔진이 어절로 줄을 나눈다(칸 안처럼 미리 나누지 않음).
          for(const n of notes)body+=`<p style="margin:4px 0 6px;text-align:justify">${text(n.note,null,10,v=>v,{kind:'note',table:n.id})}</p>`;
        }else if(b.layout==='나란히'&&children.length>1){
          recordTable(1,children.length,[],{kind:'side',id:b.id});
          body=`<table style="border-collapse:collapse;width:${innerWidth}px"><tr>`;
          // Render the children individually while keeping their own descendants.
          const widths=rowWidths(children,innerWidth);
          const cells=[];
          nested++;try{for(const [i,child] of children.entries()){
            const inner=await walk(b.id,Math.max(35,widths[i]-16),child.id);cells.push(inner);
            body+=`<td style="border:none;padding:5px;vertical-align:${material(child)?'middle':'top'};width:${widths[i]}px;height:__ROWH__">${inner}</td>`;
          }}finally{nested--;}
          body+='</tr></table>';
          // 그림만 나란한 칸: 칸 높이를 그림 + (가)·(나) 줄로 정해 둔다. 한글 엔진은 겹친 표의 칸 높이를 내용보다 2~3px 낮게 잡아 (가)가 칸 밖으로 나간다.
          const figureOnly=children.every(c=>c.kind==='figure'),estimate=html=>Math.max(0,...[...html.matchAll(/<img [^>]*height="(\d+)"/g)].map(m=>Number(m[1])))+((html.match(/<p\b/g)||[]).length)*24+16;
          body=body.replaceAll('height:__ROWH__',figureOnly?`height:${Math.ceil(Math.max(...cells.map(estimate)))}px`:'');
        }else{if(boxed)inBox++;try{body=await walk(b.id,innerWidth);}finally{if(boxed)inBox--;}}
        if(boxed)recordTable(1,1,[],{kind:'box',id:b.id},boxSlot);
        // 끝의 1pt 빈 문단(0.58mm)은 마지막 줄이 아래 여백을 넘지 않게 받쳐 준다(10-19). 그만큼 아래 여백에서 뺀다.
        // 글자 크기는 문단(p)이 아니라 글(span)에 걸어야 엔진이 따른다 — p에 걸면 10pt 빈 줄(약 5.6mm)이 되어 상자 아래가 넓었다(10-23 실측).
        html+=boxed?`<table style="border-collapse:collapse;width:${width}px"><tr><td style="border:${RULE};width:${width}px;height:32px;padding:${L.boxTop}px ${L.boxSide}px ${L.boxBottom+Math.round((b.pad||0)*96/25.4)}px">${b.label?p(b.label,null,FS,{kind:'label',id:b.id}):''}${body}</td></tr></table>`:body;
      }else if(b.lines){
        if(b.kind==='bogi'){
          // <보기> 너비: 구성 시트 '크기'(단 폭 대비 %)로 줄이면 가운데에 둔다. ㄷ 아래 여백은 '아래 여백'(mm).
          const bw=sizedWidth(b,width);
          // The supplied exam uses a centered title that interrupts the top
          // rule. A native table preserves that cutout without a bitmap or a
          // floating overlay: two shallow header rows and one merged body.
          const titleWidth=Math.max(L.bogiTitleWidth,Math.ceil(measureRich(L.bogiTitle,FS)+2*L.bogiTitlePad+2)),side=(bw-titleWidth)/2,rule=RULE;
          recordTable(3,3,[{r:0,c:1,rs:2,cs:1},{r:2,c:0,rs:1,cs:3}],{kind:'bogi',id:b.id});
          // 빈 칸 문단: 글자 크기를 span에 걸어야 1pt로 잡힌다(p에 걸면 10pt 줄 높이가 남아 1행이 3.6mm 아래로 줄지 않음). 빈칸(공백)은 엔진이 지워 기본 10pt가 되므로 폭 0 글자(U+2060)를 둔다.
          const empty='<p style="margin:0;line-height:100%"><span style="font-size:1pt">\u2060</span></p>';
          // 위 선 = 1행과 2행 경계. 평가원 원본(2009-6): 제목 글 높이의 약 55% 지점을 지나고, 2행은 1.35mm(× 0.768 = 1.04mm)라 본문 칸이 바로 이어진다.
          const row1=Math.round(L.bogiTitleRow*100)/100,row2=mmToPx(1.04);// 1행 기본 2.91mm = 제목 글(11pt) 높이의 75%
          const sideCell=(edge,line=false)=>`<td style="width:${side}px;height:${line?row1:row2}px;padding:0.1px;border:none;${line?`border-bottom:${rule}`:`border-${edge}:${rule}`} ;vertical-align:top">${empty}</td>`;
          let bodyLines=0,bodyExtra=0;
          const measure=v=>measureRich(v,FS);
          const body=b.lines.map(l=>{
            const label=/^[ㄱ-ㅎ]$/.test(l.label)?l.label+'.':l.label,prefix=label+' ';
            // 표 칸 안에서는 한글 엔진이 줄을 나누지 않고 글자를 좁혀 한 줄에 넣는다. 칸 안 글은 실제 글꼴 폭으로 재서 직접 나눈다.
            const wrap=v=>{const result=wrapHangingText(v,bw-L.bogiLeft-L.bogiRight+TABLE_OUT,prefix,measure,TIGHT);bodyLines+=result.split('\n').length;bodyExtra+=extraHeight(result,FS);return result;};
            return `<p style="margin:0;text-align:left;line-height:${L.bogiLineSpacing}%">${text(prefix+l.text,null,FS,wrap,{kind:'line',block:b.id,id:l.id,prefix:prefix.length})}</p>`;
          }).join('');
          // 줄 간격은 실제 〈보기〉 줄 간격(bogiLineSpacing 150%)으로 센다 — 160%로 세고 보정값을 더해 마지막 줄 아래가 원본(줄 간격의 0.54배)의 두 배였다(10-25).
          // The last line needs its glyph height and bottom padding, rather
          // than another full line gap. Explicit height also protects nested
          // tables, whose parent does not expand an implicit HTML row.
          const padPx=Math.round((b.pad||0)*96/25.4),bodyHeight=Math.ceil(Math.max(0,bodyLines-1)*FS*4/3*L.bogiLineSpacing/100+FS*4/3+bodyExtra+L.bogiTop+L.bogiBottom+(b.parent?3:0))+padPx;
          html+=`<table style="border-collapse:collapse;width:${bw}px"><tr>${sideCell('left',true)}<td rowspan="2" style="width:${titleWidth}px;height:${Math.round((row1+row2)*100)/100}px;padding:0 ${L.bogiTitlePad}px;border:none;vertical-align:top"><p style="margin:0;text-align:center;line-height:100%">${text(L.bogiTitle)}</p></td>${sideCell('right',true)}</tr><tr>${sideCell('left')}${sideCell('right')}</tr><tr><td colspan="3" style="width:${bw}px;height:${bodyHeight}px;padding:${L.bogiTop}px ${L.bogiRight}px 0 ${L.bogiLeft}px;border:none;border-left:${rule};border-right:${rule};border-bottom:${rule};vertical-align:top">${body}</td></tr></table>`;
        }else if(b.kind==='dialogue'){
          // 학생 대화·발표: 이름 칸 + 말 칸(가는 선 상자). 말이 길면 칸 안에서 줄바꿈한다.
          const nameWidth=Math.min(64,Math.max(40,...b.lines.map(l=>choiceWidth(l.label,FS)+12))),speech=width-nameWidth;
          recordTable(b.lines.length,2,[],{kind:'dialogue',id:b.id});
          html+=`<table style="border-collapse:collapse;width:${width}px">`+b.lines.map(l=>`<tr><td style="border:none;width:${nameWidth}px;padding:4px 4px 4px 0;vertical-align:top"><p style="margin:0">${text(l.label)}</p></td><td style="border:${RULE};width:${speech}px;padding:3px 8px;vertical-align:middle"><p style="margin:0;text-align:left">${text(l.text,speech-18,FS,null,{kind:'line',block:b.id,id:l.id})||(nested?'\u2060':'')}</p></td></tr>`).join('')+'</table>';
        }else{
          // 실험 과정: 〔실험 과정〕 머리, (가)·(나) 뒤 글은 내어쓰기(한글에서 번호 뒤에 맞춤).
          const measure=v=>measureRich(v,FS);
          html+=heading(b)+b.lines.map(l=>{const prefix=l.label+' ';return `<p style="margin:0;text-align:left">${text(prefix+l.text,null,FS,v=>besideCount(wrapHangingText(v,besideWidth(width-1,b.lines.indexOf(l)),prefix,measure,TIGHT)),{kind:'line',block:b.id,id:l.id,prefix:prefix.length})}</p>`;}).join('');
        }
      }
      // 〈보기〉 뒤는 넣지 않는다: 선지 표가 제 위 여백을 가져 이미 원본 비율(줄 간격의 약 0.7배)이다(10-23 실측).
      if(['figure','table','group','dialogue'].includes(b.kind)&&(b.kind!=='figure'||b.figure))html+=afterGap(parent);
    }
    return html;
  };
  // 대응 선지(평가원 원본): 선지 묶음 2열(①② / ③④ / ⑤), 맨 윗줄 묶음 위에만 열 제목, 제목마다 짧은 밑줄, 테두리 없음.
  // 열이 3개 이하이고 병합·그림이 없을 때만. 그 밖의 선지표는 예전처럼 선 있는 표로 찍는다.
  const kicePair=t=>t.cols<=3&&t.headerRows===1&&t.rows===6&&!t.merges.length&&!t.cells.flat().some(c=>c.figure);
  // 평가원 대응표 선지: 값이 짧으면 한 줄에 세 묶음(①②③ / ④⑤, 묶음 간격 102pt), 길면 두 묶음(10-25 실측 — 화학Ⅱ 1번 3+2).
  const pairChoices=t=>{
    const k=t.cols,numW=25,longest=Math.max(0,...t.cells.slice(1).flat().map(c=>measureRich(c.value,FS)));
    // 묶음 간격은 선지 탭과 같다(3묶음 36mm=102pt, 2묶음 56mm=159pt — 원본 240문항 실측). 마지막 묶음이 남은 폭을 쓴다.
    const step=n=>Math.min(L.choiceTabs?.[{3:1,2:2}[n]]||width/n,width/n*1.2),fit=n=>{const s=step(n),last=width-s*(n-1);return Math.min(s,last)-numW-8*k>=longest*k;};
    // 묶음 안 값 칸은 열마다 가장 긴 값 + 여백만큼 주고 남는 폭은 고르게 나눈다(10-25 p2 26-6월 1번: 똑같이 나눠 「중력 렌즈 효과」가 두 줄이 됐다).
    const g=fit(3)?3:2,lines=Math.ceil(5/g),gw=side=>side<g-1?step(g):width-step(g)*(g-1);
    const need=Array.from({length:k},(_,c)=>Math.max(0,...t.cells.map(row=>measureRich(row[c]?.value,FS)))+10);
    const valW=(side,c=0)=>{const room=gw(side)-numW,sum=need.reduce((a,b)=>a+b,0);return sum<=room?need[c]+(room-sum)/k:need[c]*room/sum;};
    recordTable(lines+1,g*(k+1),[],{kind:'choices'});
    const td=(w,body)=>`<td style="border:none;width:${w}px;padding:1px 2px;vertical-align:top"><p style="margin:0;text-align:center">${body}</p></td>`;
    const value=(r,c,head,side)=>{const v=t.cells[r][c].value,body=text(v,valW(side,c)-8,FS,null,{kind:'cell',table:'choices',r,c});return head&&String(v).trim()?`<u>${body}</u>`:body;};
    const groups=Array.from({length:g},(_,side)=>side);
    let rows='<tr>'+groups.map(side=>td(numW,'')+Array.from({length:k},(_,c)=>td(valW(side,c),value(0,c,true,side))).join('')).join('')+'</tr>';
    for(let line=0;line<lines;line++)rows+='<tr>'+groups.map(side=>{const i=line*g+side;return i<5?td(numW,text(labels[i]))+Array.from({length:k},(_,c)=>td(valW(side,c),value(i+1,c,false,side))).join(''):td(numW,'')+Array.from({length:k},(_,c)=>td(valW(side,c),'')).join('');}).join('')+'</tr>';
    return `<table style="border-collapse:collapse;width:${width}px">${rows}</table>`;
  };
  // A question number belongs to the opening paragraph. Native hanging
  // indentation is measured from this prefix after import, never added spaces.
  // 평가원 지면: 번호 뒤 글·자료·발문·<보기>·선지가 모두 번호 너비만큼 들어가 시작하고, 발문 첫 줄은 한 글자 더 들어간다.
  // 표·그림은 그 너비만큼 줄여 만들고, 문단 왼쪽 여백은 한글로 들여온 뒤 applyQuestionIndent가 건다.
  // 번호 아래 들여쓰기는 번호 글자 폭이 아니라 고정 폭(평가원 3.99mm, 조판 기준 numberIndent).
  const bodyIndent=prefix&&!sideText?Math.round(L.numberIndent):0,askIndent=Math.round(FS*4/3);
  // 본문 글은 줄바꿈을 넣지 않는다. 한글 엔진이 어절 단위로 나누고 양쪽 정렬로 오른쪽 끝을 맞춘다(평가원 지면).
  const asIs=v=>v;
  const firstFloats=sideText?'':await floatImages('first',width-bodyIndent);
  const first=sideText?'':`<p style="margin:0;text-align:justify">${firstFloats}${text(prefix+(firstText?firstText.text:ask),null,FS,asIs,{...(firstText?{kind:'block',id:firstText.id,prefix:prefix.length}:askOwner(prefix.length)),number:numberMark})}</p>`;
  width-=bodyIndent;
  const askParagraph=async()=>gapHtml(q.askGap??L.askGap)+`<p style="margin:0;text-align:justify">${sideText?await floatImages('first',width):''}${text(ask,null,FS,asIs,askOwner())}</p>`;
  // 떠 있는 표는 첫 지문 바로 앞 문단에 둔다(한글 엔진은 표를 글 문단 안에 넣지 못한다).
  // 글 옆 표도 글이 다 들어가지 않으면 단 폭의 60%까지 넓힌다(남은 폭은 지문).
  const floatHtml=!floatTable||!firstText?'':floatTable.kind==='table'?await table(floatTable.table,sizedWidth(floatTable,width),false,undefined,{kind:'block',id:floatTable.id},false,Math.max(sizedWidth(floatTable,width),width*.6))
    :await (async()=>{floating=true;try{return await walk(null,Math.round(width*Math.min(.6,Math.max(.3,floatShare))),floatTable.id);}finally{floating=false;}})();
  let html=floatHtml+first+await walk(null,width)+(firstText||sideText?await askParagraph():'');
  for(const id of afterAsk)html+=await walk(null,width,id);
  if(q.type!=='서술형'){
    html+=gapHtml(q.choicesGap??L.choicesGap);
    if(q.style==='대응표')html+=kicePair(q.choiceTable)?pairChoices(q.choiceTable):await table(q.choiceTable,width,true);
    else if(q.style==='그림·그래프'){
      {const per=choiceColumns(q.choiceLayout,q.choices.length)||2;recordTable(Math.ceil(q.choices.length/per),per,[],{kind:'choicegrid'});}
      html+=`<table style="border-collapse:collapse;width:${width}px">`;
      const per=choiceColumns(q.choiceLayout,q.choices.length)||2;for(let i=0;i<q.choices.length;i+=per){html+='<tr>';for(let j=i;j<i+per;j++){const c=q.choices[j];html+=`<td style="border:none;width:${width/per}px;padding:5px;vertical-align:top">${c?p(labels[j]+' '+c.text,null,FS,{kind:'choice',id:c.id,prefix:labels[j].length+1})+await picture(c.figure,width/per-20,undefined,{kind:'choice',id:c.id}):''}</td>`;}html+='</tr>';}
      html+='</table>';
    }else {
      const fontSize=q.style==='조합'?FS-1:FS,grid=choiceGrid(q.choices,width,fontSize,q.choiceLayout,measureText?measureRich:choiceWidth,L.choiceTabs),rows=Math.ceil(q.choices.length/grid.cols);
      recordTable(rows,grid.cols,[],{kind:'choicegrid'});
      html+=`<table style="border-collapse:collapse;width:${width}px">`;
      for(let row=0;row<rows;row++){
        // 번호(①) 폭은 둘째 줄부터만 줄인다. 첫 줄은 번호를 포함한 글 전체를 칸 폭에 잰다.
        const cells=grid.widths.map((w,col)=>{const i=row*grid.cols+col,c=q.choices[i],first=grid.singleLine?w-1:w-8,available=grid.singleLine?w-1:w-8-choiceWidth(labels[i]+' ',fontSize),value=c?labels[i]+' '+c.text:'',tight=grid.tightLast&&col===grid.cols-1&&measureRich(value,fontSize)>first,wrap=tight?v=>String.fromCharCode(CONDENSE+grid.tightLast)+v:v=>measureText?wrapMeasured(v,first,available,x=>measureRich(x,fontSize)):wrapQuestionText(v,available,fontSize),wrapped=wrap(value);return {w,value,wrap,owner:c?{kind:'choice',id:c.id,prefix:labels[i].length+1}:null,height:Math.ceil(wrapped.split('\n').length*fontSize*4/3*1.5+2+extraHeight(wrapped,fontSize)),available};});
        // 한 줄에 분수 같은 높은 수식이 있으면 칸 가운데에 맞춰 ①~⑤의 글자 줄이 나란하게 한다.
        const height=Math.max(...cells.map(c=>c.height)),valign=cells.some(c=>extraHeight(c.value,fontSize)>0)?'middle':'top';
        html+='<tr>'+cells.map(c=>`<td style="border:none;width:${c.w}px;height:${height}px;padding:${grid.singleLine?'0':'0 2px'};vertical-align:${valign}"><p style="margin:0;text-align:left;line-height:150%">${text(c.value,c.available,fontSize,c.wrap,c.owner)}</p></td>`).join('')+'</tr>';
      }
      html+='</table>';
    }
  }
  const askLead=firstText||sideText?String(ask).replace(/\s+/g,' ').trim().slice(0,12):'';
  return {html:`<div style="font-family:함초롬바탕;font-size:10pt">${html}</div>`,images,texts,tables,equations,warnings:[...new Set(warnings)],imageOwners,tableOwners,textSegments,placeSegments,cellFloats,bodyIndent,askIndent,askLead,floats,floatTable:floatTable&&firstText?{align:floatTable.align==='왼쪽'?'Left':'Right'}:null};
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
