// 기출 PDF → ExamPool 문항(AI 없음). 기출 탐색기 변환기(es/)가 읽은 줄·수식·그림 영역을 ExamPool 문항 틀에 채운다.
// - 글: PDF 글자 위치로 지문·발문·보기·선지를 나눈 결과를 그대로 쓴다. 수식은 한컴 수식 스크립트를 $…$로.
// - 틀: 조사 기록(유형·자료 구조·배치·선지 배열)이 있으면 그대로, 없으면 규칙으로 고른다.
// - 그림: PDF 선·그림 영역을 잘라 원본 폭(단 폭 대비 %) 그대로 넣는다.
import {convertQuestionNow} from './es/live-convert.mjs';
import {restoreFigures} from './es/figure-fallback.mjs?v=library-release-20261011-3';
import {renderFigureImage,setPdfSource} from './es/pdf-viewer.mjs?v=library-release-20261011-3';
import {questionFromShape} from '../sheet/templates.js';
import {makeTable} from '../sheet/model.js';
export {setPdfSource};

export const FIGURE_SCALE=4;// 그림을 원본 PDF의 4배(약 288dpi)로 자른다.
const NUM=['①','②','③','④','⑤'];
const STRUCT_OF=(r)=>!r?null:(r.struct==='one'||r.struct==='table')?(r.layout==='side'?'small':'big'):(r.struct==='three'||r.struct==='complex')?'many':r.struct;
const ARRANGE={r5:'한 줄',r32:'3+2',c2:'2열',col:'세로'};

// 줄 하나의 글. 수식은 $스크립트$. 그림 런은 뺀다.
export const runsText=runs=>(runs||[]).filter(r=>r.kind!=='figure').map(r=>r.kind==='equation'?`$${String(r.script||r.value||'').trim()}$`:String(r.value||'')).join('');
const clean=s=>s.replace(/\s+/g,' ').replace(/\$\s*\$/g,'').trim();
const MARK=/^(\[실험\s*(과정|결과)\]|〔실험\s*(과정|결과)〕|\[(자료|결과|탐구 과정|탐구 결과)\]|\((가|나|다|라|마|바)\)\s|[◦○•ㆍ]\s?)/;

// 지문 줄들을 문단으로. 표지(〔실험 과정〕·(가)·◦)에서 새 문단, 왼쪽 들여쓰기가 크게 바뀌면(상자 안팎) 새 문단.
export function stemParagraphs(blocks){
  const out=[];let prev=null;
  for(const b of blocks){
    const t=clean(runsText(b.runs));if(!t)continue;const left=b.sourceLine?.left;
    const boxChange=prev&&Number.isFinite(left)&&Number.isFinite(prev.base)&&Math.abs(left-prev.base)>9&&!MARK.test(t)&&!/^\((가|나|다|라|마)\)/.test(prev.text);
    if(!prev||MARK.test(t)||(boxChange&&!prev.cont(left))){prev={text:t,base:left,first:left,indent:Number.isFinite(left)&&prev&&left>prev.base+9,cont(l){return Number.isFinite(l)&&Number.isFinite(this.base)&&Math.abs(l-this.base)<=9;}};out.push(prev);}
    else{prev.text+=(/[\-‐]$/.test(prev.text)?'':' ')+t;if(out.length&&prev.base===prev.first&&Number.isFinite(left))prev.base=left;}
  }
  return out.map(p=>({text:clean(p.text),boxed:!!p.indent}));
}

// 정답형·대화형처럼 발문이 지문 끝에 붙어 오는 경우: 마지막 '?' 문장부터 발문.
export function splitAsk(paragraphs){
  for(let i=paragraphs.length-1;i>=0;i--){
    const t=paragraphs[i].text,q=t.lastIndexOf('?');if(q<0)continue;
    // 문장 시작: '?' 앞의 마지막 '다.'/'.' 뒤
    let st=-1;for(const m of t.slice(0,q).matchAll(/(다\.|요\.|\.\)|\.)\s/g))st=m.index+m[0].length;
    const ask=t.slice(st<0?0:st).trim(),rest=st<0?'':t.slice(0,st).trim();
    const before=paragraphs.slice(0,i).concat(rest?[{...paragraphs[i],text:rest}]:[]);
    return {stem:before,ask,after:paragraphs.slice(i+1)};
  }
  return {stem:paragraphs,ask:'',after:[]};
}

// 원본에서 읽은 구조 + 그림(이미지). signal로 취소.
export async function readKice(item,{signal,figureScale=FIGURE_SCALE}={}){
  const structure=await convertQuestionNow(item,{signal});
  return restoreFigures(item,structure,{bestEffort:true,signal,renderFigure:(q,_scale,opts)=>renderFigureImage(q,figureScale,opts)});
}

const toDataUrl=async image=>{const blob=new Blob([image.bytes],{type:image.type||'image/png'});return await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>no(r.error);r.readAsDataURL(blob);});};

// 구조 → ExamPool 문항. item: 색인 항목(+조사 기록 form/struct/layout/choiceArrange). 결과와 함께 판단 기록(diag)을 돌려준다.
export async function toQuestion(structure,item,{number='1'}={}){
  const diag={notes:[...(structure.notes||[])],decisions:{}};
  const blocks=structure.blocks||[],by=role=>blocks.filter(b=>b.role===role);
  const figures=[];for(const b of blocks)for(const r of b.runs||[])if(r.kind==='figure'&&r.image?.bytes)figures.push({data:await toDataUrl(r.image),box:r.sourceBox,width:r.image.width,height:r.image.height});
  let form=item.form||null,struct=STRUCT_OF(item);
  // 조사 기록이 없으면 규칙: 보기가 있으면 합답형, 선지가 학생 이름이면 대화형, 그림 수로 자료 구조.
  if(!form)form=by('bogi').length?'combo':/학생/.test(by('stem').map(b=>runsText(b.runs)).join(''))?'talk':'single';
  if(!struct)struct=!figures.length?'none':figures.length===1?((figures[0].box?.[2]-figures[0].box?.[0])<(item.box[2]-item.box[0])*.5?'small':'big'):figures.length===2?'two':'many';
  diag.decisions={form,struct,from:item.form?'조사 기록':'규칙',figures:figures.length};
  let paras=stemParagraphs(by('stem'));
  let ask=clean(by('ask').map(b=>runsText(b.runs)).join(' '));
  let header=null;
  if(form==='pair'){// 선지표 머리줄: ㉠ ㉡ ㉢ / A B C 처럼 짧은 낱말만 있는 문단
    const i=paras.findIndex(p=>/^([㉠-㉭ⓐ-ⓩA-Z(가-힣)]{1,4}\s*){2,6}$/.test(p.text)&&p.text.split(/\s+/).length>=2);
    if(i>=0){header=paras[i].text.split(/\s+/).filter(Boolean);paras.splice(i,1);}}
  if(!ask){const s=splitAsk(paras);paras=s.stem;ask=s.ask;if(s.after.length&&form==='pair'&&!header){const h=s.after.find(p=>p.text.split(/\s+/).length>=2);if(h)header=h.text.split(/\s+/);}}
  const three=/\[\s*3\s*점\s*\]\s*$/.test(ask);ask=ask.replace(/\s*\[\s*3\s*점\s*\]\s*$/,'');
  // 틀 만들기
  const shape=struct==='wrap'?'none':struct;
  const q=questionFromShape({form,struct:shape,subject:item.subject||'all'},number);
  q.ask=ask;q.points=three?3:2;q.source=item.title||'';q.choiceLayout=ARRANGE[item.choiceArrange]||undefined;
  if(q.choiceLayout===undefined)delete q.choiceLayout;
  q.references=[];q.kice={id:item.id,pdfFile:item.pdfFile,page:item.page,box:item.box};
  // 지문·조건·실험
  let steps=null,result=null,condition=null;
  if(struct==='experiment'){
    const pi=paras.findIndex(p=>/실험\s*과정|탐구\s*과정/.test(p.text)),ri=paras.findIndex(p=>/실험\s*결과|탐구\s*결과/.test(p.text));
    if(pi>=0){const end=ri<0?paras.length:ri;steps=paras.slice(pi+1,end).map(p=>{const m=p.text.match(/^\((.)\)\s*(.*)$/);return m?{label:`(${m[1]})`,text:m[2]}:{label:'',text:p.text};});
      result=ri>=0?paras.slice(ri+1).map(p=>p.text):[];paras=paras.slice(0,pi);}
  }
  if(struct==='condition'){const box=paras.filter((p,i)=>i>0&&p.boxed);if(box.length){condition=box.map(p=>p.text).join('\n');paras=paras.filter(p=>!box.includes(p));}else if(paras.length>1){condition=paras.slice(1).map(p=>p.text).join('\n');paras=paras.slice(0,1);}}
  const texts=q.blocks.filter(b=>b.kind==='text'&&b.label!=='조건');
  if(texts[0])texts[0].text=paras.map(p=>p.text).join('\n');
  if(condition!==null){const c=q.blocks.find(b=>b.kind==='text'&&b.label==='조건');if(c)c.text=condition;}
  if(steps){const st=q.blocks.find(b=>b.kind==='steps');if(st)st.lines=steps.map(l=>({id:crypto.randomUUID(),label:l.label||'',text:l.text}));
    const tb=q.blocks.find(b=>b.kind==='table'&&b.label==='실험 결과');
    if(tb&&result?.length){diag.notes.push('실험 결과가 글이라 표 대신 글 칸으로 넣었습니다.');tb.kind='text';delete tb.table;delete tb.heading;tb.text='〔실험 결과〕\n'+result.join('\n');}
    else if(tb&&!result?.length){q.blocks.splice(q.blocks.indexOf(tb),1);}}
  // 보기
  const bogi=q.blocks.find(b=>b.kind==='bogi');
  if(bogi){const lines=[];for(const b of by('bogi')){const t=clean(runsText(b.runs));if(b.label)lines.push({id:crypto.randomUUID(),label:b.label,text:t});else if(lines.length)lines.at(-1).text=clean(lines.at(-1).text+' '+t);}if(lines.length)bogi.lines=lines;}
  // 대화형: 대화가 그림 안에 있으면 대화 칸을 뺀다.
  if(form==='talk'&&figures.length){const d=q.blocks.find(b=>b.kind==='dialogue');if(d)q.blocks.splice(q.blocks.indexOf(d),1);}
  // 선지
  const choices=by('choice').map(b=>clean(runsText(b.runs)));
  if(form==='pair'){
    const rows=choices.map(t=>t.split(/\s+/).filter(Boolean)),cols=header?.length||Math.max(1,...rows.map(r=>r.length));
    q.choiceTable=makeTable(6,cols,'선지표');(header||[]).forEach((v,c)=>q.choiceTable.cells[0][c].value=v);
    rows.forEach((r,i)=>r.slice(0,cols).forEach((v,c)=>{if(q.choiceTable.cells[i+1])q.choiceTable.cells[i+1][c].value=v;}));
  }else choices.slice(0,5).forEach((t,i)=>{if(q.choices[i])q.choices[i].text=t;});
  // 그림: 자리 순서대로. 남는 빈 자리는 지운다(원본에 없는 칸이 생기지 않게).
  const col=(item.box[2]-item.box[0])-14;
  const slots=q.blocks.filter(b=>b.kind==='figure');
  figures.forEach((f,i)=>{const s=slots[i];if(!s)return;s.figure={name:`${item.id}-${i+1}.png`,data:f.data};
    const w=f.box?f.box[2]-f.box[0]:col*.6;s.size=Math.min(100,Math.max(10,Math.round(w/col*100/5)*5));});
  if(figures.length>slots.length)diag.notes.push(`그림 ${figures.length}개 중 ${slots.length}개만 자리가 있습니다.`);
  for(const s of slots.slice(figures.length)){q.blocks.splice(q.blocks.indexOf(s),1);}
  // 빈 묶음 정리
  for(let changed=true;changed;){changed=false;for(const g of q.blocks.filter(b=>b.kind==='group'))if(!q.blocks.some(b=>b.parent===g.id)){q.blocks.splice(q.blocks.indexOf(g),1);changed=true;}}
  // 남은 묶음이 자식 하나면 묶음을 풀지 않는다(배치 정보 유지).
  diag.counts={stem:paras.length,ask:!!ask,bogi:bogi?.lines.length||0,choices:form==='pair'?q.choiceTable.cells.slice(1).filter(r=>r.some(c=>String(c.value).trim())).length:q.choices.filter(c=>c.text.trim()).length,figures:Math.min(figures.length,slots.length),three};
  return {question:q,diag};
}

export async function convertKice(item,opts={}){
  const structure=await readKice(item,opts);
  const {question,diag}=await toQuestion(structure,item,opts);
  return {question,diag,structure};
}
