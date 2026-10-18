// 기출 PDF → ExamPool 문항(AI 없음). 기출 탐색기 변환기(es/)가 읽은 줄·수식·그림 영역을 ExamPool 문항 틀에 채운다.
// - 글: PDF 글자 위치로 지문·발문·보기·선지를 나눈 결과를 그대로 쓴다. 수식은 한컴 수식 스크립트를 $…$로.
// - 틀: 조사 기록(유형·자료 구조·배치·선지 배열)이 있으면 그대로, 없으면 규칙으로 고른다.
// - 그림: PDF 선·그림 영역을 잘라 원본 폭(단 폭 대비 %) 그대로 넣는다.
import {convertQuestionNow} from './es/live-convert.mjs';
import {restoreFigures} from './es/figure-fallback.mjs?v=library-release-20261011-3';
import {renderFigureImage,setPdfSource} from './es/pdf-viewer.mjs?v=library-release-20261011-3';
import {questionFromShape} from '../sheet/templates.js';
import * as model from '../sheet/model.js';
const {makeTable,block}=model;
import {analyze,runsText,clean,HEAD,tokens,pairTable,splitEquationParens,mapQuestionText} from './rules.js';
export {setPdfSource};

export const FIGURE_SCALE=4;// 그림을 원본 PDF의 4배(약 288dpi)로 자른다.
const STRUCT_OF=(r)=>!r?null:(r.struct==='one'||r.struct==='table')?(r.layout==='side'?'small':'big'):(r.struct==='three'||r.struct==='complex')?'many':r.struct;
const ARRANGE={r5:'한 줄',r32:'3+2',c2:'2열',col:'세로'};
export {runsText,analyze};

// 원본에서 읽은 구조 + 그림(이미지). signal로 취소.
export async function readKice(item,{signal,figureScale=FIGURE_SCALE}={}){
  const structure=await convertQuestionNow(item,{signal});
  return restoreFigures(item,structure,{bestEffort:true,signal,renderFigure:(q,_scale,opts)=>renderFigureImage(q,figureScale,opts)});
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

// 두 정수 비율(합 12 이하)로 폭 a:b를 근사.
function ratioPair(a,b){let best=[3,2],err=Infinity;for(let x=1;x<=11;x++)for(let y=1;x+y<=12;y++){const e=Math.abs(x/(x+y)-a/(a+b));if(e<err-1e-9){err=e;best=[x,y];}}return best;}
const yOverlap=(a,b)=>Math.min(a[3],b[3])-Math.max(a[1],b[1]);
const paraBox=p=>{const g=p.lines.filter(l=>l.geo&&Number.isFinite(l.base));if(!g.length)return null;return [Math.min(...g.map(l=>l.left)),Math.min(...g.map(l=>l.base-l.h)),Math.max(...g.map(l=>l.right)),Math.max(...g.map(l=>l.base))];};
const EXP=/과정|결과|가설|자료|준비|방법|탐구|실험/;

// 구조 → ExamPool 문항. item: 색인 항목(+조사 기록 form/struct/layout/choiceArrange). 결과와 함께 판단 기록(diag)을 돌려준다.
export async function toQuestion(structure,item,{number='1'}={}){
  const diag={notes:[...(structure.notes||[])],decisions:{}};
  const blocks=structure.blocks||[],by=role=>blocks.filter(b=>b.role===role);
  const A=analyze(structure,item);
  const figs=new Map();for(const n of A.items)if(n.k==='figure'&&n.run.image?.bytes&&!figs.has(n.run))figs.set(n.run,{data:await toDataUrl(n.run.image),box:n.box});
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
  if(form!=='pair'&&afterFigs.length===5&&choiceTexts.every(t=>!t||/원본 참고/.test(t))){
    choiceFigs=[...afterFigs].sort((a,b)=>a.box&&b.box&&Math.abs(a.box[1]-b.box[1])>8?a.box[1]-b.box[1]:(a.box?.[0]||0)-(b.box?.[0]||0));
    nodes=nodes.filter(n=>!choiceFigs.includes(n));diag.notes.push('발문 뒤 그림 5개를 선지 그림으로 넣었습니다.');}
  // 상자 테두리가 없는 조건·실험: 첫 문단(도입) 뒤 ~ 발문 앞 글을 상자로 본다.
  if(!A.rects.length&&(struct==='condition'||struct==='experiment')){
    const paras=nodes.filter(n=>n.k==='para');
    const startAt=struct==='experiment'?nodes.findIndex(n=>n.k==='para'&&(HEAD.test(n.text)||/^\((가)\)/.test(n.text))):paras.length>1?nodes.indexOf(paras[1]):-1;
    if(startAt>0){const rect={box:null,virtual:true};for(const n of nodes.slice(startAt))if(n.k==='para'||struct==='experiment')n.rect=rect;A.rects.push(rect);diag.notes.push('상자 테두리를 찾지 못해 도입 문단 뒤 글을 상자로 넣었습니다.');}
  }
  const figure=(f,parent,label='자료',size=true)=>{const d=figs.get(f.run);const b=add('figure',parent,label);b.figure={name:`${item.id}-${++count.images}.png`,data:d.data};
    if(size){const w=d.box?d.box[2]-d.box[0]:col*.6;b.size=Math.min(100,Math.max(10,Math.round(w/col*100/5)*5));}return b;};
  const table=(t,parent,label='자료')=>{const b=add('table',parent,label);b.table=tableFromStructure(t.block);count.tables++;return b;};
  const textBlock=(paras,parent,label)=>{const b=add('text',parent,label);b.text=paras.map(p=>p.text).join('\n');return b;};
  // 글·그림·표가 섞인 흐름을 칸으로. 글 옆 그림은 가로 묶음.
  const emit=(seq,parent,{firstLabel='지문',width=col}={})=>{
    let i=0,firstText=true;
    while(i<seq.length){
      const n=seq[i];
      if(n.k==='para'){
        const run=[];while(i<seq.length&&seq[i].k==='para'&&!(seq[i].caption&&run.length&&false))run.push(seq[i++]);
        // 다음 자료가 이 글 옆에 있으면 가로 묶음
        const next=seq[i],tb=run.length?paraBox(run.at(-1)):null,nb=next&&(next.k==='figure'||next.k==='table')?next.box:null;
        const beside=tb&&nb&&nb[0]>=tb[2]-3&&yOverlap(tb,nb)>4;
        if(beside&&model.WRAP&&!parent&&next.k==='figure'){
          // 조판기의 어울림 그림(맨 바깥 글 + 떠 있는 그림). 그림이 글 왼쪽이면 왼쪽 정렬.
          textBlock(run,parent,firstText?firstLabel:'설명');const f=figure(next,parent,'자료');f.layout=model.WRAP;
          if(nb[2]<=tb[0]+3)f.align='왼쪽';i++;
        }else if(beside){
          const g=add('group',parent,'글 옆 자료');g.layout='나란히';g.boxed=false;
          const t=textBlock(run,g,firstText?firstLabel:'설명');const [a,b]=ratioPair(Math.max(10,nb[0]-tb[0]),nb[2]-nb[0]);t.ratio=a;
          const m=next.k==='figure'?figure(next,g,'자료',false):table(next,g);m.ratio=b;if(next.k==='figure')m.size=100;i++;
        }else textBlock(run,parent,firstText?firstLabel:'설명');
        firstText=false;continue;
      }
      if(n.k==='figure'){
        const run=[];while(i<seq.length&&seq[i].k==='figure')run.push(seq[i++]);
        // 그림 바로 아래 (가)·(나) 이름 줄
        let caps=null;if(seq[i]?.k==='para'&&seq[i].caption){caps=tokens(seq[i].text);i++;}
        const lab=k=>caps?(caps.length===run.length?caps[k]:k===0?caps.join('    '):''):'자료';
        if(run.length===1)figure(run[0],parent,lab(0));
        else{const side=run.every((f,k)=>!k||!f.box||!run[k-1].box||yOverlap(f.box,run[k-1].box)>4);
          const g=add('group',parent,'자료');g.layout=side?'나란히':'세로';g.boxed=false;
          run.forEach((f,k)=>{const b=figure(f,g,lab(k),!side);if(side&&f.box)b.ratio=Math.max(1,Math.min(12,Math.round((f.box[2]-f.box[0])/(width/12))));});}
        continue;
      }
      if(n.k==='table'){table(n,parent);i++;continue;}
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
        const st=add('steps',g,s.name||'실험 과정');st.lines=[];
        if(!s.name)st.label='';
        for(const p of paras){const m=p.text.match(/^\(([가-힣])\)\s*(.*)$/);if(m)st.lines.push({id:crypto.randomUUID(),label:`(${m[1]})`,text:m[2]});
          else if(st.lines.length&&!/^[◦○•]/.test(p.text)&&!p.head&&!p.display)st.lines.at(-1).text+=' '+p.text;else st.lines.push({id:crypto.randomUUID(),label:'',text:p.text});}
        if(noHead){const pre=paras.filter(p=>!st.lines.some(l=>l.text.includes(p.text)));void pre;}
        emit(s.items.filter(n=>n.k!=='para'),g);
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
  }else if(choiceFigs)choiceFigs.forEach((f,i)=>{const d=figs.get(f.run);q.choices[i].text='';q.choices[i].figure={name:`${item.id}-선지${i+1}.png`,data:d.data};});
  else choices.slice(0,5).forEach((t,i)=>{if(q.choices[i])q.choices[i].text=t;});
  // 수식 안 괄호·상태 기호는 본문 글로(원본 글꼴과 같게).
  mapQuestionText(q,splitEquationParens);
  if(figs.size>count.images)diag.notes.push(`그림 ${figs.size}개 중 ${count.images}개만 넣었습니다.`);
  // figures: 넣은 자료 수(그림 + 표 + 조건·실험 상자). images: 그림 수.
  diag.counts={stem:out.filter(b=>b.kind==='text').length,ask:!!q.ask,bogi:bogi?.lines.length||0,
    choices:form==='pair'?q.choiceTable.cells.slice(1).filter(r=>r.some(c=>String(c.value).trim())).length:q.choices.filter(c=>c.text.trim()||c.figure).length,choiceFigures:choiceFigs?5:0,
    figures:count.images+count.tables+Math.max(0,count.boxes),images:count.images,tables:count.tables,boxes:count.boxes,three:A.three};
  return {question:q,diag};
}

export async function convertKice(item,opts={}){
  const structure=await readKice(item,opts);
  const {question,diag}=await toQuestion(structure,item,opts);
  return {question,diag,structure};
}
