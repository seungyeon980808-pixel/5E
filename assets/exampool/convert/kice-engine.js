// 기출 PDF → ExamPool 문항(AI 없음). 기출 탐색기 변환기(es/)가 읽은 줄·수식·그림 영역을 ExamPool 문항 틀에 채운다.
// - 글: PDF 글자 위치로 지문·발문·보기·선지를 나눈 결과를 그대로 쓴다. 수식은 한컴 수식 스크립트를 $…$로.
// - 틀: 조사 기록(유형·자료 구조·배치·선지 배열)이 있으면 그대로, 없으면 규칙으로 고른다.
// - 표: figures.js(detectTables)가 확신 0.5 이상으로 읽은 괘선 표는 편집 표로, 아니면 그림으로.
// - 그림: figures.js(detectFigures)가 자른 그림·괘선 표·그림 선지를 원본 위치대로 흐름에 끼워 원본 폭(단 폭 대비 %)으로 넣는다.
import {convertQuestionNow} from './es/live-convert.mjs';
import {setPdfSource} from './es/pdf-viewer.mjs?v=library-release-20261011-3';
import {detectFigures,detectTables} from './figures.js';
import {questionFromShape} from '../sheet/templates.js';
import * as model from '../sheet/model.js';
const {makeTable,block}=model;
import {analyze,runsText,clean,HEAD,tokens,pairTable,splitEquationParens,mapQuestionText} from './rules.js';
export {setPdfSource};

export const FIGURE_SCALE=4;
export const TABLE_MIN=.5;// detectTables 확신 경계(tables-check: 확신 0.9 표 147개 칸 글 F1 100%).// 그림을 원본 PDF의 4배(약 288dpi)로 자른다.
const STRUCT_OF=(r)=>!r?null:(r.struct==='one'||r.struct==='table')?(r.layout==='side'?'small':'big'):(r.struct==='three'||r.struct==='complex')?'many':r.struct;
const ARRANGE={r5:'한 줄',r32:'3+2',c2:'2열',col:'세로'};
export {runsText,analyze};

// 원본에서 읽은 구조 + 그림(이미지). signal로 취소.
export async function readKice(item,{signal,figureScale=FIGURE_SCALE}={}){
  const structure=await convertQuestionNow(item,{signal});
  let found=[];
  try{found=await detectFigures(item,{signal,scale:figureScale,choices:true});}
  catch(e){if(e?.name==='AbortError')throw e;(structure.notes||=[]).push('그림을 찾지 못했습니다: '+String(e?.message||e));}
  structure.detected=found;
  // 괘선 표: 확신이 낮은 표는 편집 표 블록을 빼서 표 그림(detectFigures role:'table')이 대신 들어가게.
  let tables=[];
  try{tables=await detectTables(item,{signal});}
  catch(e){if(e?.name==='AbortError')throw e;(structure.notes||=[]).push('표를 읽지 못했습니다: '+String(e?.message||e));}
  structure.detectedTables=tables;
  const iou=(a,b)=>{const w=Math.min(a[2],b[2])-Math.max(a[0],b[0]),h=Math.min(a[3],b[3])-Math.max(a[1],b[1]);if(w<=0||h<=0)return 0;const i=w*h,ar=x=>(x[2]-x[0])*(x[3]-x[1]);return i/(ar(a)+ar(b)-i);};
  for(const b of structure.blocks||[])if(b.kind==='table'&&b.box){const t=tables.find(t=>t.box&&iou(t.box,b.box)>.6);b.detected=t||null;if(t&&t.confidence<TABLE_MIN)b.dropped=true;}
  structure.blocks=(structure.blocks||[]).filter(b=>!b.dropped);
  injectFigures(structure,found.filter(f=>f.role!=='choice'),item);
  return structure;
}

// 찾은 그림을 줄 흐름에 끼운다. 그림 위쪽보다 아래에서 시작하는 첫 줄 앞, 글 옆 그림이면 옆 줄들 뒤.
// 변환기가 편집 표로 읽은 표와 겹치는 괘선 표 그림은 뺀다(편집 표가 원본에 더 가깝다).
export function injectFigures(structure,figs,item){
  const blocks=structure.blocks||[],ph=structure.pageHeight;
  const tables=blocks.filter(b=>b.kind==='table'&&b.box);
  const overlap=(a,b)=>{const w=Math.min(a[2],b[2])-Math.max(a[0],b[0]),h=Math.min(a[3],b[3])-Math.max(a[1],b[1]);return w>0&&h>0?w*h:0;};
  const area=b=>(b[2]-b[0])*(b[3]-b[1]);
  for(const f of figs){
    if(f.role==='table'&&tables.some(t=>overlap(t.box,f.box)>.5*Math.min(area(t.box),area(f.box))))continue;
    const fig={role:'figure',kind:'figure',label:'',runs:[{kind:'figure',data:f.data,sourceBox:f.box,caption:f.caption||null,figRole:f.role,widthPt:f.widthPt}]};
    const lines=blocks.map((b,i)=>({b,i,base:b.sourceLine&&ph&&b.role!=='choice'?ph-b.sourceLine.y:null})).filter(x=>Number.isFinite(x.base)&&(f.page==null||f.page===item.page));
    // 줄 끝이 단 밖(여백 과목명 글자가 붙은 줄)이면 끝 위치를 믿지 않는다.
    const colEnd=Math.min(...lines.map(x=>x.b.sourceLine.left))+330,rightOf=L=>L.right>colEnd?-Infinity:L.right;
    const beside=lines.filter(x=>x.base>f.box[1]+2&&x.base<f.box[3]+x.b.sourceLine.height&&(rightOf(x.b.sourceLine)<=f.box[0]+2||x.b.sourceLine.left>=f.box[2]-2));
    let at;
    if(beside.length)at=beside.at(-1).i+1;
    else{const below=lines.find(x=>x.base>f.box[1]+6);at=below?below.i:blocks.findIndex(b=>b.role==='bogi'||b.role==='choice');}
    if(at<0)at=blocks.length;
    blocks.splice(at,0,fig);
  }
  // 잘라 넣은 그림·표 안에 통째로 들어가는 지문 줄(편집 표로 못 읽은 표 칸 글, 그림 속 이름표)은 그림과 겹치므로 뺀다.
  const inside=(L,b)=>L.left>=b[0]-1&&L.right<=b[2]+1&&ph-L.y>=b[1]+2&&ph-L.y<=b[3]+2;
  const kept=figs.filter(f=>blocks.some(b=>b.runs?.[0]?.sourceBox===f.box));
  for(let i=blocks.length-1;i>=0;i--){const b=blocks[i];if(b.role==='stem'&&b.sourceLine&&ph&&kept.some(f=>inside(b.sourceLine,f.box))){blocks.splice(i,1);structure.droppedInFigure=(structure.droppedInFigure||0)+1;}}
}

const toDataUrl=async image=>{const blob=new Blob([image.bytes],{type:image.type||'image/png'});return await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>no(r.error);r.readAsDataURL(blob);});};

// 변환기 표(줄마다 칸의 런, 병합 정보) → ExamPool 표.
export function tableFromStructure(t,role='자료표'){
  const rows=t.rows.length,cols=Math.max(1,...t.rows.map(r=>r.length));
  const tb=makeTable(Math.min(30,rows),Math.min(12,cols),role);
  const covered=new Set();
  for(const s of t.spans||[]){if((s.rowSpan||1)>1||(s.colSpan||1)>1){if(s.row+(s.rowSpan||1)>tb.rows||s.col+(s.colSpan||1)>tb.cols)continue;
    let clash=false;for(let r=s.row;r<s.row+(s.rowSpan||1);r++)for(let c=s.col;c<s.col+(s.colSpan||1);c++)if(covered.has(r+':'+c))clash=true;if(clash)continue;
    for(let r=s.row;r<s.row+(s.rowSpan||1);r++)for(let c=s.col;c<s.col+(s.colSpan||1);c++)covered.add(r+':'+c);
    tb.merges.push({r:s.row,c:s.col,rs:s.rowSpan||1,cs:s.colSpan||1});}}
  const hidden=(r,c)=>tb.merges.some(m=>r>=m.r&&r<m.r+m.rs&&c>=m.c&&c<m.c+m.cs&&(r!==m.r||c!==m.c));
  for(let r=0;r<tb.rows;r++)for(let c=0;c<tb.cols;c++){if(hidden(r,c))continue;
    const runs=t.rows[r]?.[c]||[];tb.cells[r][c].value=runsText(runs).split('\n').map(clean).filter(Boolean).join('\n');}
  // 머리줄: 첫 줄만(평가원 자료표 대부분). 첫 칸이 병합으로 여러 줄이면 그 줄 수만큼.
  tb.headerRows=Math.min(tb.rows,Math.max(1,...tb.merges.filter(m=>m.r===0&&m.c===0).map(m=>m.rs)));
  return tb;
}

// detectTables 표 → ExamPool 표(칸 글은 이미 엔진 규칙으로 정리된 $…$ 글).
export function tableFromDetected(d,role='자료표'){
  const tb=makeTable(Math.min(30,d.rows),Math.min(12,d.cols),role);
  const covered=new Set();
  for(const m of d.merges||[]){if(m.r+m.rs>tb.rows||m.c+m.cs>tb.cols)continue;let clash=false;for(let r=m.r;r<m.r+m.rs;r++)for(let c=m.c;c<m.c+m.cs;c++)if(covered.has(r+':'+c))clash=true;if(clash)continue;
    for(let r=m.r;r<m.r+m.rs;r++)for(let c=m.c;c<m.c+m.cs;c++)covered.add(r+':'+c);tb.merges.push({r:m.r,c:m.c,rs:m.rs,cs:m.cs});}
  const hidden=(r,c)=>tb.merges.some(m=>r>=m.r&&r<m.r+m.rs&&c>=m.c&&c<m.c+m.cs&&(r!==m.r||c!==m.c));
  for(let r=0;r<tb.rows;r++)for(let c=0;c<tb.cols;c++)if(!hidden(r,c))tb.cells[r][c].value=String(d.cells[r]?.[c]?.text||'');
  tb.headerRows=Math.min(tb.rows,Math.max(1,d.headerRows||1));
  return tb;
}

// 두 정수 비율(합 12 이하)로 폭 a:b를 근사.
function ratioPair(a,b){let best=[3,2],err=Infinity;for(let x=1;x<=11;x++)for(let y=1;x+y<=12;y++){const e=Math.abs(x/(x+y)-a/(a+b));if(e<err-1e-9){err=e;best=[x,y];}}return best;}
const yOverlap=(a,b)=>Math.min(a[3],b[3])-Math.max(a[1],b[1]);
const paraBox=p=>{const g=p.lines.filter(l=>l.geo&&Number.isFinite(l.base));if(!g.length)return null;return [Math.min(...g.map(l=>l.left)),Math.min(...g.map(l=>l.base-l.h)),Math.max(...g.map(l=>l.right)),Math.max(...g.map(l=>l.base))];};
const EXP=/과정|결과|가설|자료|준비|방법|탐구|실험/;

// 구조 → ExamPool 문항. item: 색인 항목(+조사 기록 form/struct/layout/choiceArrange). 결과와 함께 판단 기록(diag)을 돌려준다.
export async function toQuestion(structure,item,{number='1'}={}){
  const diag={notes:[...(structure.notes||[])],decisions:{}};
  const blocks=structure.blocks||[],by=role=>blocks.filter(b=>b.role===role);
  const A=analyze(structure,item),ph=structure.pageHeight;
  const figs=new Map();for(const n of A.items)if(n.k==='figure'&&!figs.has(n.run)&&(n.run.data||n.run.image?.bytes))figs.set(n.run,{data:n.run.data||await toDataUrl(n.run.image),box:n.box,caption:n.run.caption||null,role:n.run.figRole||'figure'});
  let form=item.form||null,struct=STRUCT_OF(item);
  // 조사 기록이 없으면 규칙: 보기가 있으면 합답형, 지문에 학생이 나오면 대화형, 그림 수로 자료 구조.
  if(!form)form=by('bogi').length?'combo':/학생/.test(A.nodes.filter(n=>n.k==='para').map(n=>n.text).join(''))?'talk':'single';
  if(!struct)struct=A.rects.length?(/과정|결과/.test(A.nodes.filter(n=>n.rect).map(n=>n.text||'').join(''))?'experiment':'condition'):!figs.size&&!A.items.some(i=>i.k==='table')?'none':figs.size>=3?'many':figs.size===2?'two':'big';
  diag.decisions={form,struct,from:item.form?'조사 기록':'규칙',figures:figs.size,boxes:A.rects.length};
  const shape=struct==='wrap'?'none':struct;
  const q=questionFromShape({form,struct:shape,subject:item.subject||'all'},number);
  q.ask=A.ask;q.points=A.three?3:2;q.source=item.title||'';q.choiceLayout=ARRANGE[item.choiceArrange]||undefined;
  if(q.choiceLayout===undefined)delete q.choiceLayout;
  q.paper='B4';
  q.references=[];q.kice={id:item.id,pdfFile:item.pdfFile,page:item.page,box:item.box};
  // 자료 칸은 원본 흐름대로 새로 만든다. 틀의 보기·대화 칸만 남긴다.
  const keep=q.blocks.filter(b=>b.kind==='bogi'||b.kind==='dialogue');
  const out=[];const add=(kind,parent,label)=>{const b=block(kind,parent?.id||null,label);out.push(b);return b;};
  const col=(item.box[2]-item.box[0])-14;
  const count={images:0,tables:0,boxes:0};
  let nodes=A.nodes.filter(n=>n.k!=='figure'||figs.has(n.run));
  // 그림 선지: 발문 뒤 그림이 정확히 5개이고 선지 글이 비었거나 '원본 참고'면 선지 칸 그림으로.
  const choiceTexts=by('choice').map(b=>clean(runsText(b.runs)));
  const afterFigs=A.after.filter(n=>n.k==='figure'&&figs.has(n.run)&&!n.rect);
  let choiceFigs=null;
  // 그림 선지: 찾은 선지 그림이 ①~⑤ 다섯 개면 선지 칸 그림으로.
  const found=(structure.detected||[]).filter(f=>f.role==='choice');
  if(form!=='pair'&&new Set(found.map(f=>f.choice)).size===5&&found.length===5){
    choiceFigs=[...found].sort((a,b)=>a.choice-b.choice).map(f=>({direct:f}));diag.notes.push('그림 선지 5개를 선지 칸 그림으로 넣었습니다.');}
  else if(form!=='pair'&&afterFigs.length===5&&choiceTexts.every(t=>!t||/원본 참고/.test(t))){
    choiceFigs=[...afterFigs].sort((a,b)=>a.box&&b.box&&Math.abs(a.box[1]-b.box[1])>8?a.box[1]-b.box[1]:(a.box?.[0]||0)-(b.box?.[0]||0));
    nodes=nodes.filter(n=>!choiceFigs.includes(n));diag.notes.push('발문 뒤 그림 5개를 선지 그림으로 넣었습니다.');}
  // 상자 테두리가 없는 조건·실험: 첫 문단(도입) 뒤 ~ 발문 앞 글을 상자로 본다.
  if(!A.rects.length&&(struct==='condition'||struct==='experiment')){
    const paras=nodes.filter(n=>n.k==='para');
    const startAt=struct==='experiment'?nodes.findIndex(n=>n.k==='para'&&(HEAD.test(n.text)||/^\((가)\)/.test(n.text))):paras.length>1?nodes.indexOf(paras[1]):-1;
    if(startAt>0){const rect={box:null,virtual:true};for(const n of nodes.slice(startAt))if(n.k==='para'||struct==='experiment')n.rect=rect;A.rects.push(rect);diag.notes.push('상자 테두리를 찾지 못해 도입 문단 뒤 글을 상자로 넣었습니다.');}
  }
  // 크기 기준 폭: 상자 안 자료는 상자 안쪽 폭(테두리·여백 약 16pt 뺌), 아니면 단 폭.
  const within=n=>n.rect?.box?Math.max(40,n.rect.box[2]-n.rect.box[0]-16):col;
  // widthPt: 원본 PDF에서 잰 그림 폭(pt). 조판기가 원본 크기 그대로 넣는다(10-24 — size %는 묶음 칸 안에서 두 번 줄어들었음).
  // 글 옆 그림의 세로 자리(besideAt): 그림 윗변 옆 첫 줄이 몇째 문단(item)의 몇째 줄(line)인지. 조판기가 그 줄부터 그림 옆을 좁히고
  // 그림을 그 줄 높이에 둔다(10-25 어울림). 줄 수로만 세면 우리 줄 나눔이 원본과 한 줄만 달라도 그림이 어긋났다(9번).
  const besideAt=(paras,box)=>{for(const [item,p] of paras.entries()){const L=(p.lines||[]).filter(l=>l.geo&&Number.isFinite(l.base));const line=L.findIndex(l=>l.base>=box[1]+3);if(line>=0)return {item,line};}return {item:0,line:0};};
  const figure=(f,parent,label='자료',size=true)=>{const d=figs.get(f.run);const b=add('figure',parent,label);b.figure={name:`${item.id}-${++count.images}.png`,data:d.data,...(d.box?{widthPt:Math.round((d.box[2]-d.box[0])*10)/10}:{})};
    if(size){const w=d.box?d.box[2]-d.box[0]:col*.6,base=within(f);b.size=Math.min(100,Math.max(10,Math.round(w/base*100/5)*5));}return b;};
  const table=(t,parent,label='자료')=>{const d=t.block.detected,b=add('table',parent,d?.caption||label);b.table=d?tableFromDetected(d):tableFromStructure(t.block);count.tables++;
    // 원본 열 폭(pt)·칸 글자 크기(pt): 조판기가 열 폭 비율과 글 크기를 원본대로 쓴다.
    const w=t.block.widths;if(Array.isArray(w)&&w.length===b.table.cols)b.table.colWidths=w.map(x=>Math.round(x*10)/10);
    if(t.block.fontSize)b.table.fontPt=t.block.fontSize;
    {const h=t.block.heights;if(Array.isArray(h)&&h.length===b.table.rows&&h.every(v=>v>0))b.table.rowHeights=h.map(x=>Math.round(x*10)/10);}
    if(t.box){const w=t.box[2]-t.box[0];b.size=Math.min(100,Math.max(10,Math.round(w/within(t)*100/5)*5));}return b;};
  const textBlock=(paras,parent,label)=>{const b=add('text',parent,label);b.text=paras.map(p=>p.text).join('\n');return b;};
  // 자료 바로 아래 이름 줄 '(가)'·'(가) 아세트산 (나) 뷰테인'과 범례 '(＋: …)'를 그 자료 칸에 붙인다(x 위치로 짝).
  // 그림: 이름은 label, 뒤 글은 text(조판기가 그림 아래에 찍음). 표: 이름은 label, 범례는 table.note.
  // 범례 판정은 수식 표시($)를 뺀 글로 한다 — 「$(○$: 발병함, $×$: 발병 안 함)」처럼 기호가 수식으로 읽혀 범례를 놓쳤다(10-25 6번).
  const CAPLINE=/^\([가-하]\)(?!.*다\.$)/u,LEGEND_RE=/^\(.*[:：].*\)$/u,LEGEND={test:t=>LEGEND_RE.test(String(t).replace(/\$/g,'').trim())},legendText=t=>String(t).replace(/\$/g,'').trim();
  const attachCaptions=(seq,i,run,made)=>{
    const xs=run.map(m=>m.box);if(!xs.every(Boolean))return i;
    const bottom=Math.max(...xs.map(b=>b[3]));
    // 나란한 그림 아래 단마다 따로 쓴 설명 글(작은 글씨 여러 줄): 줄 낱말 위치로 그림 단에 나눠 각 그림 아래 글로.
    if(made.length>=2&&made.every(b=>b.kind==='figure')&&ph){
      while(i<seq.length&&seq[i].k==='para'){
        const p=seq[i],pb=paraBox(p);if(!pb||pb[1]>bottom+30)break;
        const cells=p.lines.map(l=>(structure.lineCells||[]).find(c=>Math.abs(ph-c.y-l.base)<1.6));if(cells.some(c=>!c?.words?.length))break;
        const mid=b=>(b[0]+b[2])/2,colOf=x=>{let k=0,d=Infinity;xs.forEach((b,j)=>{const e=Math.abs(mid(b)-x);if(e<d){d=e;k=j;}});return k;};
        const per=made.map(()=>[]);let spread=false;
        for(const c of cells){const ks=new Set();for(const w of c.words){const t=clean(runsText(w.runs));if(!t)continue;const k=colOf((w.x0+w.x1)/2);ks.add(k);per[k].push(t);}if(ks.size>1)spread=true;}
        if(!spread)break;
        per.forEach((ws,k)=>{const t=clean(splitEquationParens(ws.join(' ')));if(t)made[k].text=clean((made[k].text?made[k].text+' ':'')+t);});
        i++;
      }
    }
    while(i<seq.length&&seq[i].k==='para'){
      const p=seq[i],pb=paraBox(p),t=p.text.trim();
      if(!pb||pb[1]>bottom+40||!(CAPLINE.test(t)||LEGEND.test(t)))break;
      // 한 문단에 여러 자료의 이름이 함께 있으면 순서대로 나눈다.
      const parts=[...t.matchAll(/\(([가-하])\)\s*(.*?)(?=\s*\([가-하]\)|$)/gu)];
      if(!LEGEND.test(t)&&parts.length===made.length&&made.length>1){parts.forEach((m,k)=>{made[k].label=`(${m[1]})`;if(m[2].trim()&&made[k].kind==='figure')made[k].text=m[2].trim();});i++;continue;}
      const cx=(pb[0]+pb[2])/2;let k=xs.findIndex(b=>cx>=b[0]-6&&cx<=b[2]+6);if(k<0)k=made.length===1?0:-1;if(k<0)break;
      const b=made[k];
      if(LEGEND.test(t)){if(b.kind!=='table')break;b.table.note=(b.table.note?b.table.note+'\n':'')+legendText(t);}
      else{const m=t.match(/^\(([가-하])\)\s*(.*)$/u);if(!m)break;b.label=`(${m[1]})`;if(m[2]&&b.kind==='figure')b.text=m[2];}
      i++;
    }
    return i;
  };
  // 글·그림·표가 섞인 흐름을 칸으로. 글 옆 그림은 가로 묶음.
  const emit=(seq,parent,{firstLabel='지문',width=col}={})=>{
    let i=0,firstText=true;
    while(i<seq.length){
      const n=seq[i];
      if(n.k==='para'){
        const all=[];while(i<seq.length&&seq[i].k==='para')all.push(seq[i++]);
        // 바로 뒤 자료 묶음(그림·표 여러 개)이 이 글 옆에 있으면 가로 묶음. 자료와 높이가 겹치는 문단만 옆 글로,
        // 그 위 문단은 앞 글, 아래 문단은 자료 뒤 글로 나눈다.
        const mats=[];for(let k=i;k<seq.length&&(seq[k].k==='figure'||seq[k].k==='table');k++)mats.push(seq[k]);
        const mb=mats.length&&mats.every(m=>m.box)?mats.map(m=>m.box).reduce((a,b)=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])]):null;
        // 그림 여러 개(또는 어울림을 못 쓰는 자리) 옆으로 흐르다 그림 아래에서 넓어지는 문단은 그림 아래 줄에서 둘로 나눈다.
        if(mb&&(mats.length>1||parent||!model.WRAP))for(let k=0;k<all.length;k++){const p=all[k],L=p.lines.filter(l=>l.geo&&Number.isFinite(l.base));
          const cut=L.findIndex(l=>l.base>mb[3]+2);
          if(cut>0&&L.slice(0,cut).some(l=>l.base>mb[1])&&L.slice(0,cut).every(l=>l.base<=mb[1]||l.right<=mb[0]+3)&&L.length===p.lines.length){
            const part=ls=>({...p,lines:ls,text:clean(ls.map(l=>l.text).join(' '))});all.splice(k,1,part(L.slice(0,cut)),{...part(L.slice(cut)),mark:false,caption:false});break;}}
        const near=all.map(p=>{const b=paraBox(p);return b&&mb&&yOverlap(b,mb)>4&&p.lines.some(l=>l.base>mb[1]+2&&l.base<=mb[3]+2)?b:null;});
        const k0=near.findIndex(Boolean),k1=near.findLastIndex(Boolean);
        // 옆 글 판정은 그림과 높이가 겹치는 줄만 본다 — 문단이 그림 아래에서 넓어지면(평가원 어울림) 문단 상자 전체로는 실패했다(10-25 12번).
        const besideLines=p=>p.lines.filter(l=>l.geo&&Number.isFinite(l.base)&&l.base>mb[1]+2&&l.base<=mb[3]+2);
        const sideOk=k0>=0&&near.slice(k0,k1+1).every((b,j)=>{if(!b)return false;if(mb[0]>=b[2]-3)return true;const L=besideLines(all[k0+j]);return L.length>0&&L.every(l=>l.right<=mb[0]+3);});
        const run=sideOk?all.slice(k0,k1+1):all,pre=sideOk?all.slice(0,k0):[],post=sideOk?all.slice(k1+1):[];
        if(pre.length){textBlock(pre,parent,firstText?firstLabel:'설명');firstText=false;}
        const next=seq[i],tb=run.length?paraBox(run.at(-1)):null,nb=sideOk?mb:null;
        const beside=sideOk&&mats.length>=1;
        if(beside&&mats.length===1&&model.WRAP&&!parent&&next.k==='figure'){
          // 조판기의 어울림 그림(맨 바깥 글 + 떠 있는 그림). 그림이 글 왼쪽이면 왼쪽 정렬.
          textBlock(run,parent,firstText?firstLabel:'설명');const f=figure(next,parent,'자료');f.layout=model.WRAP;
          if(nb[2]<=tb[0]+3)f.align='왼쪽';i++;
        }else if(beside){
          const g=add('group',parent,'글 옆 자료');g.layout='나란히';g.boxed=false;
          const t=textBlock(run,g,firstText?firstLabel:'설명');// 상자 안 글은 원본에서 본문보다 작은 글자라, 본문 크기로 찍을 때 필요한 폭만큼 글 몫을 키운다.
          const hs=run.flatMap(p=>p.lines.map(l=>l.h)).filter(Boolean).sort((x,y)=>x-y),lineH=hs[hs.length>>1],fs=A.bodyH&&lineH?Math.min(1.4,Math.max(1,A.bodyH/lineH)):1;
          const [a,b]=ratioPair(Math.max(10,(tb[2]-tb[0])*fs+(nb[0]-tb[2])),nb[2]-nb[0]);t.ratio=a;
          if(mats.length===1){const m=next.k==='figure'?figure(next,g,'자료',false):table(next,g);m.ratio=b;if(next.k==='figure'){m.size=100;if(next.box&&m.figure)m.figure.besideAt=besideAt(run,next.box);}i++;}
          else{// 여러 자료: 옆 칸 안에 자료 묶음(한 줄이면 나란히, 아니면 세로)
            const row=mats.every((m,k)=>!k||yOverlap(m.box,mats[k-1].box)>4),sub=add('group',g,'자료');sub.layout=row?'나란히':'세로';sub.boxed=false;sub.ratio=b;
            for(const m of mats){const x=m.k==='figure'?figure(m,sub,figs.get(m.run)?.caption||'자료',!row):table(m,sub);if(row&&m.box)x.ratio=Math.max(1,Math.min(12,Math.round((m.box[2]-m.box[0])/((nb[2]-nb[0])/12))));if(!row&&m.k==='figure')x.size=100;}
            i+=mats.length;}
        }else textBlock(run,parent,firstText?firstLabel:'설명');
        firstText=false;
        if(post.length)textBlock(post,parent,'설명');
        continue;
      }
      if(n.k==='figure'||n.k==='table'&&seq[i+1]?.k==='table'&&n.box&&seq[i+1].box&&yOverlap(n.box,seq[i+1].box)>4){
        // 그림(또는 나란한 표) 묶음. 표가 섞이면 같은 줄에 나란한 것만 함께 묶는다.
        const run=[];while(i<seq.length&&(seq[i].k==='figure'||seq[i].k==='table')&&(!run.length||run[0].k==='figure'&&seq[i].k==='figure'||seq[i].box&&run.at(-1).box&&yOverlap(seq[i].box,run.at(-1).box)>4))run.push(seq[i++]);
        // 그림 바로 아래 (가)·(나) 이름 줄
        // 그림 이름: 자른 그림에서 뺀 캡션 (가)(나), 없으면 그림 바로 아래 (가)·(나) 줄.
        const own=run.map(f=>f.run&&figs.get(f.run)?.caption).filter(Boolean);
        let caps=null;if(seq[i]?.k==='para'&&seq[i].caption){const t=tokens(seq[i].text);if(!own.length||t.every(c=>own.includes(c))){caps=t;i++;}}
        const lab=k=>(run[k].run&&figs.get(run[k].run)?.caption)||(caps?(caps.length===run.length?caps[k]:k===0?caps.join('    '):''):'자료');
        const made=[];
        if(run.length===1)made.push(figure(run[0],parent,lab(0)));
        else{const side=run.every((f,k)=>!k||!f.box||!run[k-1].box||yOverlap(f.box,run[k-1].box)>4);
          const g=add('group',parent,'자료');g.layout=side?'나란히':'세로';g.boxed=false;
          // 나란한 그림: 칸 폭은 그림 사이 가운데를 경계로 나눈 원본 구간, 그림 크기는 그 구간 대비 원본 폭(%).
          const x0=parent?null:item.box[0]+7,x1=parent?null:item.box[2]-7;
          run.forEach((f,k)=>{const b=f.k==='table'?table(f,g):figure(f,g,lab(k),!side);made.push(b);if(!side||!f.box)return;
            const lo=k?(run[k-1].box[2]+f.box[0])/2:Math.min(f.box[0],x0??f.box[0]),hi=k<run.length-1?(f.box[2]+run[k+1].box[0])/2:Math.max(f.box[2],x1??f.box[2]);
            b.ratio=Math.max(1,Math.min(12,Math.round((hi-lo)/(width/12))));b.size=Math.min(100,Math.max(10,Math.round((f.box[2]-f.box[0])/(hi-lo)*115/5)*5));});}
        i=attachCaptions(seq,i,run,made);
        continue;
      }
      if(n.k==='table'){const b=table(n,parent);i=attachCaptions(seq,i+1,[n],[b]);continue;}
      i++;
    }
  };
  // 실험 상자: 〔…과정〕은 과정 칸, 〔…결과〕는 머리 붙은 표·그림 또는 글.
  const emitExperiment=(seq,g)=>{
    const sections=[];let cur={name:'',items:[]};sections.push(cur);
    for(const n of seq){const m=n.k==='para'&&n.text.match(HEAD);if(m&&EXP.test(m[1])){cur={name:m[1].replace(/\s+/g,' '),items:[]};sections.push(cur);}else cur.items.push(n);}
    const noHead=sections.length===1;
    for(const s of sections){
      if(!s.items.length&&!s.name)continue;
      const paras=s.items.filter(n=>n.k==='para');
      const stepish=/과정|방법/.test(s.name)||noHead&&paras.filter(p=>/^\((가|나|다)\)/.test(p.text)).length>=2;
      if(stepish){
        // 과정 글 옆 그림 하나: 상자 안 '글 옆 자료' 가로 묶음(과정 칸 + 그림).
        const mats0=s.items.filter(n=>n.k!=='para'),pb=paras.map(paraBox).filter(Boolean);
        const sideFig=mats0.length===1&&mats0[0].k==='figure'&&mats0[0].box&&pb.length&&pb.some(b=>yOverlap(b,mats0[0].box)>4)&&pb.filter(b=>yOverlap(b,mats0[0].box)>4).every(b=>mats0[0].box[0]>=b[2]-3)?mats0[0]:null;
        let host=g;if(sideFig){host=add('group',g,'글 옆 자료');host.layout='나란히';host.boxed=false;}
        const st=add('steps',host,s.name||'실험 과정');st.lines=[];
        if(sideFig){const tb=[Math.min(...pb.map(b=>b[0])),0,Math.max(...pb.filter(b=>yOverlap(b,sideFig.box)>4).map(b=>b[2])),0],nb=sideFig.box;
          const [a,b]=ratioPair(Math.max(10,nb[0]-tb[0]),nb[2]-nb[0]);st.ratio=a;const f=figure(sideFig,host,'자료',false);f.ratio=b;f.size=100;if(f.figure)f.figure.besideAt=besideAt(paras,sideFig.box);}
        if(!s.name)st.label='';
        const itemOf=[],legends=[];
        const hasTable=s.items.some(n=>n.k==='table');
        for(const p0 of paras){
          // 표 범례 줄 「(○: 있음, ×: 없음)」은 과정 항목에 잇지 않고 이 구역 표의 범례로 붙인다(10-25 6번: (다) 끝 줄로 묶여 본문으로 찍혔다).
          let p=p0;
          if(hasTable&&LEGEND.test(p.text)){legends.push(legendText(p.text));itemOf.push(Math.max(0,st.lines.length-1));continue;}
          {const last=p.lines?.at(-1),lt=String(last?.text||'').trim();if(hasTable&&p.lines?.length>1&&LEGEND.test(lt)&&p.text.trim().endsWith(lt)){legends.push(legendText(lt));p={...p,lines:p.lines.slice(0,-1),text:p.text.trim().slice(0,-lt.length).trim()};}}
          const m=p.text.match(/^\(([가-힣])\)\s*(.*)$/);if(m)st.lines.push({id:crypto.randomUUID(),label:`(${m[1]})`,text:m[2]});
          else if(st.lines.length&&!/^[◦○•]/.test(p.text)&&!p.head&&!p.display)st.lines.at(-1).text+=' '+p.text;else st.lines.push({id:crypto.randomUUID(),label:'',text:p.text});itemOf.push(st.lines.length-1);}
        // 과정 문단이 앞 항목에 이어 붙으면 문단 번호와 항목 번호가 달라진다 — 항목 번호로 바꾼다(이어 붙은 문단의 줄은 그 항목 뒤쪽 줄이라 줄 수는 그대로 둔다).
        {const f=out.find(b=>b.parent===host.id&&b.kind==='figure');if(sideFig&&f?.figure?.besideAt)f.figure.besideAt={...f.figure.besideAt,item:itemOf[f.figure.besideAt.item]??0};}
        {const before=out.length;emit(s.items.filter(n=>n.k!=='para'&&n!==sideFig),g);
          const tb=out.slice(before).find(b=>b.kind==='table');if(tb&&legends.length)tb.table.note=[tb.table.note,...legends].filter(Boolean).join('\n');}
        continue;
      }
      const mats=s.items.filter(n=>n.k!=='para');
      if(s.name&&mats.length&&!paras.length){
        // 결과가 표·그림뿐: 머리를 그 칸에 붙인다.
        const before=out.length;emit(mats,g);const first=out[before];
        if(first&&(first.kind==='table'||first.kind==='figure')){first.label=s.name;first.heading=true;}
        else if(first&&first.kind==='group'){const t=add('text',g,s.name);t.text=`〔${s.name}〕`;out.splice(out.indexOf(t),1);out.splice(before,0,t);}
        continue;
      }
      if(s.name){const t=add('text',g,s.name);t.text=`〔${s.name}〕`+(paras.length&&s.items[0]?.k==='para'?'\n'+takeParas(s.items).map(p=>p.text).join('\n'):'');emit(s.items.slice(leadParas(s.items)),g,{firstLabel:s.name});}
      else emit(s.items,g,{firstLabel:'설명'});
    }
  };
  const leadParas=seq=>{let k=0;while(k<seq.length&&seq[k].k==='para')k++;return k;};
  const takeParas=seq=>seq.slice(0,leadParas(seq));
  // 위에서 아래로: 상자 밖은 그대로, 상자는 묶음으로.
  let i=0;const top=[];
  while(i<nodes.length){const n=nodes[i];if(!n.rect){top.push(n);i++;continue;}
    const box=[];while(i<nodes.length&&nodes[i].rect===n.rect)box.push(nodes[i++]);top.push({k:'box',rect:n.rect,items:box});}
  let firstDone=false;
  for(let k=0;k<top.length;){
    const n=top[k];
    if(n.k==='box'){
      const g=add('group',null,'');g.boxed=true;count.boxes++;
      const exp=struct==='experiment'||n.items.some(x=>x.k==='para'&&HEAD.test(x.text)&&/과정|결과/.test(x.text));
      if(exp)emitExperiment(n.items,g);else emit(n.items,g,{firstLabel:'조건'});
      k++;continue;
    }
    const seq=[];while(k<top.length&&top[k].k!=='box')seq.push(top[k++]);
    emit(seq,null,{firstLabel:firstDone?'설명':'지문'});firstDone=true;
  }
  // 대화형: 대화가 그림 안에 있으면 대화 칸을 뺀다. 글로 있으면 'A: …' 줄을 대화로.
  for(const d of keep.filter(b=>b.kind==='dialogue')){
    const said=[];
    for(const b of out.filter(b=>b.kind==='text')){const lines=b.text.split('\n'),rest=[];for(const l of lines){const m=l.match(/^(학생\s*)?([A-Z가-힣]{1,3})\s*[:：]\s*(.+)$/);if(m)said.push({id:crypto.randomUUID(),label:(m[1]?'학생 ':'')+m[2],text:m[3]});else rest.push(l);}b.text=rest.join('\n');}
    if(said.length){d.lines=said;}else keep.splice(keep.indexOf(d),1);
  }
  // 보기
  const bogi=keep.find(b=>b.kind==='bogi');
  if(bogi){const lines=[];for(const b of by('bogi')){const t=clean(runsText(b.runs));if(b.label)lines.push({id:crypto.randomUUID(),label:b.label,text:t});else if(lines.length)lines.at(-1).text=clean(lines.at(-1).text+' '+t);}if(lines.length)bogi.lines=lines;}
  // 빈 글 칸·빈 묶음 정리
  for(const b of [...out])if(b.kind==='text'&&!b.text.trim()&&!out.some(x=>x.parent===b.id))out.splice(out.indexOf(b),1);
  for(let changed=true;changed;){changed=false;for(const g of out.filter(b=>b.kind==='group'))if(!out.some(b=>b.parent===g.id)){out.splice(out.indexOf(g),1);if(g.boxed)count.boxes--;changed=true;}}
  // 글 옆 묶음에 남은 자식이 하나면 풀어 준다.
  for(const g of out.filter(b=>b.kind==='group'&&!b.boxed)){const kids=out.filter(b=>b.parent===g.id);if(kids.length===1){kids[0].parent=g.parent;delete kids[0].ratio;out.splice(out.indexOf(g),1);}}
  q.blocks=[...out,...keep.filter(b=>b.kind==='dialogue'),...keep.filter(b=>b.kind==='bogi')];
  // 선지
  const choices=by('choice').map(b=>clean(runsText(b.runs)));
  // 여백 과목명 끝 글자(II)가 마지막 선지에 붙어 읽힌 경우
  if(structure.watermark&&choices.length)choices[choices.length-1]=choices.at(-1).replace(/\s+(II|I)$/,'');
  if(form==='pair'){
    // 줄 위치로 열을 맞춘 선지표. 위치 정보가 없으면 낱말로 나눈다.
    let P=pairTable(structure);if(P&&!P.rows.some(r=>r.some(Boolean)))P=null;
    const header=P?P.header:A.header,rows=P?P.rows:choices.map(tokens);
    const cols=Math.min(12,header?.length||Math.max(1,...rows.map(r=>r.length)));
    q.choiceTable=makeTable(6,cols,'선지표');(header||[]).slice(0,cols).forEach((v,c)=>q.choiceTable.cells[0][c].value=v);
    rows.forEach((r,i)=>{if(!q.choiceTable.cells[i+1])return;const cells=r.length>cols?[...r.slice(0,cols-1),r.slice(cols-1).join(' ')]:r;cells.forEach((v,c)=>q.choiceTable.cells[i+1][c].value=v);});
    if(!header?.some(Boolean))diag.notes.push('선지표 머리줄을 찾지 못했습니다.');
    diag.pair=P?'위치':'낱말';
  }else if(choiceFigs)choiceFigs.forEach((f,i)=>{const d=f.direct||figs.get(f.run);if(!f.direct||/원본 참고/.test(choices[i]||''))q.choices[i].text='';else q.choices[i].text=choices[i]||'';q.choices[i].figure={name:`${item.id}-선지${i+1}.png`,data:d.data,...(d.box?{widthPt:Math.round((d.box[2]-d.box[0])*10)/10}:{})};});
  else choices.slice(0,5).forEach((t,i)=>{if(q.choices[i])q.choices[i].text=t;});
  // 조판기는 선지 스타일이 '그림·그래프'일 때만 선지 그림을 찍는다.
  if(choiceFigs&&form!=='pair')q.style='그림·그래프';
  // 수식 안 괄호·상태 기호는 본문 글로(원본 글꼴과 같게).
  mapQuestionText(q,splitEquationParens);
  // 기호 하나뿐인 수식($○$ · $×$ 등)은 본문 글자로 — 수식 개체로 넣으면 뒤 글자(「:」)를 가렸다(10-25 16번 「(○: 있음」).
  mapQuestionText(q,v=>String(v??'').replace(/\$\s*([○●◎△▲▽▼□■◇◆☆★×])\s*\$/gu,'$1'));
  attachRowCaptions(q);tidyStrays(q);
  if(figs.size>count.images)diag.notes.push(`그림 ${figs.size}개 중 ${count.images}개만 넣었습니다.`);
  // figures: 넣은 자료 수(그림 + 표 + 조건·실험 상자). images: 그림 수.
  diag.counts={stem:out.filter(b=>b.kind==='text').length,ask:!!q.ask,bogi:bogi?.lines.length||0,
    choices:form==='pair'?q.choiceTable.cells.slice(1).filter(r=>r.some(c=>String(c.value).trim())).length:q.choices.filter(c=>c.text.trim()||c.figure).length,choiceFigures:choiceFigs?5:0,
    figures:count.images+count.tables+Math.max(0,count.boxes),images:count.images,tables:count.tables,boxes:count.boxes,three:A.three};
  return {question:q,diag};
}

// 나란히 자료 묶음(표·그림 둘 이상) 바로 뒤 글이 「(가) (나)」처럼 자료 수만큼의 이름표 줄이면 각 자료 이름으로 옮긴다.
// 그 앞 줄이 괄호 설명(「(○: 있음, ×: 없음)」)이면 첫 표의 설명(표 아래 글)으로 — 평가원은 첫 표 바로 아래에 둔다(10-25 생명Ⅰ 16번).
export function attachRowCaptions(q){
  const CAP=/^\s*(\([가-하]\)\s*)+$/u;
  for(const g of q.blocks.filter(b=>b.kind==='group'&&b.layout==='나란히')){
    const kids=q.blocks.filter(b=>b.parent===g.id);if(kids.length<2||!kids.every(b=>b.kind==='table'||b.kind==='figure'))continue;
    const sibs=q.blocks.filter(b=>b.parent===g.parent),next=sibs[sibs.indexOf(g)+1];if(!next||next.kind!=='text')continue;
    const lines=String(next.text||'').split('\n').map(l=>l.trim()).filter(Boolean),last=lines.at(-1)||'';
    const caps=last.match(/\([가-하]\)/gu)||[];if(!CAP.test(last)||caps.length!==kids.length)continue;
    kids.forEach((k,i)=>{k.label=caps[i];});
    const rest=lines.slice(0,-1);
    if(rest.length===1&&/^\(.*\)$/u.test(rest[0])){const t=kids.find(k=>k.kind==='table');if(t){t.table.note=rest[0];rest.length=0;}}
    if(rest.length)next.text=rest.join('\n');else q.blocks.splice(q.blocks.indexOf(next),1);
  }
}

// 10-25 눈 검사로 찾은 변환 찌꺼기 정리.
// ① 쪽 옆 세로 띠(「생명과학Ⅰ」)의 글자가 줄 끝에 한 글자씩 붙는다(b1 6월 4번 〈보기〉 「…이다. 명」) — 문장 끝 뒤 외톨이 한 글자는 뗀다.
// ② 표 옆 글에서 「(단위: ㎛)」 범례 줄이 다음 글 첫 줄로 들어간다(b1 6월 15번) — 바로 앞 묶음의 표 범례로 옮긴다.
export function tidyStrays(q){
  // ③ 띄어쓰기가 빠져 「(나)는(가)에서㉠의」처럼 붙으면 줄을 못 나눠 앞 줄이 크게 벌어진다(b1 6월 12번) — 한글 바로 뒤 (가)·㉠ 앞에 띄어쓰기.
  const stray=t=>String(t).replace(/([다요]\.)\s+[가-힣]$/gmu,'$1').replace(/([가-힣])(\([가-하]\)|[\u3260-\u326d])/gu,'$1 $2');
  for(const b of q.blocks){if(typeof b.text==='string')b.text=stray(b.text);for(const l of b.lines||[])l.text=stray(l.text);}
  const LEG=/^\((?:단위|[^()]*[:：])[^()]*\)$/u;
  for(const t of q.blocks.filter(b=>b.kind==='text'&&b.text)){
    const lines=t.text.split('\n'),first=lines[0].replace(/\$/g,'').trim();if(!LEG.test(first))continue;
    const sibs=q.blocks.filter(b=>b.parent===t.parent),prev=sibs[sibs.indexOf(t)-1];if(!prev)continue;
    const tables=prev.kind==='table'?[prev]:q.blocks.filter(b=>b.parent===prev.id&&b.kind==='table');if(tables.length!==1)continue;
    const tb=tables[0].table;tb.note=[tb.note,first].filter(Boolean).join('\n');t.text=lines.slice(1).join('\n');
    // 범례 다음 줄이 앞 묶음 글 문장의 이어지는 부분이면(항목 머리 없음, 앞 글이 문장 끝이 아님) 앞 글에 잇는다 — 따로 두면 칸 첫 문단이 되어
    // 한글 엔진이 다음 문단과 겹쳐 그렸다(b1 6월 15번 「뺀 값(ⓒ－ⓑ)을…」).
    {const host=prev.kind==='group'?q.blocks.filter(b=>b.parent===prev.id&&b.kind==='text').at(-1):null,rest=t.text.split('\n');
      if(host&&rest[0]&&!/^[○◦•▪◆□■①-⑤]|^\([가-힣]\)/u.test(rest[0])&&!/[.。?!]$/u.test(host.text.trim())){host.text=host.text.trim()+' '+rest[0];t.text=rest.slice(1).join('\n');}}
    if(!t.text.trim())q.blocks.splice(q.blocks.indexOf(t),1);
  }
}

export async function convertKice(item,opts={}){
  const structure=await readKice(item,opts);
  const {question,diag}=await toQuestion(structure,item,opts);
  return {question,diag,structure};
}
