import {validate} from '../sheet/model.js';
import {applyVerticalValues,ROWS,fieldValue} from '../sheet/vertical.js';

export const WORKFLOWS={draft:'출제한 문항',review:'점검할 문항',complete:'완성한 문항'};
export const workflow=q=>Object.hasOwn(WORKFLOWS,q.workflow)?q.workflow:'draft';
export function invalidate(q){if(workflow(q)==='complete')q.workflow='review';}

// Link the rendered document's stable object IDs to the exported worksheet's
// field. Nested material text must never be mistaken for the main passage.
export function documentField(q,path){
  const [kind,id]=String(path).split(':'),b=q.blocks.find(b=>b.id===id);
  if(path==='ask')return 'ask';
  if(kind==='choice'||kind==='cell'&&id==='choices')return 'choices';
  if(kind==='block')return b?.kind==='text'&&!b.parent?'passage':b?'materials':null;
  if(kind==='line')return b?.kind==='bogi'?'bogi':b?'materials':null;
  if(['cell','note'].includes(kind))return b?.table?'materials':null;
  return null;
}

// A worksheet line is not an object boundary when the original contains
// paragraphs. Open structured editing instead of silently splitting its IDs.
export function compoundField(q,key){
  if(['materials','photos'].includes(key))return true;
  if(key==='passage')return q.blocks.filter(b=>b.kind==='text'&&!b.parent).length>1;
  if(key==='choices')return ['대응표','그림·그래프'].includes(q.style)||q.choices.some(c=>c.figure||/[\r\n]/.test(c.text));
  if(key==='bogi'){const blocks=q.blocks.filter(b=>b.kind==='bogi');return blocks.length>1||blocks.some(b=>b.lines.some(l=>/[\r\n]/.test(l.text)));}
  return false;
}

// Apply a whole clipboard rectangle to a clone: an invalid final cell must not
// leave earlier cells changed. Stable question/block IDs belong to the model.
export function writeRectangle(data,ids,writes,options){
  const next=structuredClone(data);
  const safe=writes.filter(w=>{
    const q=data.questions.find(q=>q.id===ids[w.c]),key=ROWS[w.r]?.key;
    if(!q||!compoundField(q,key))return true;
    if(options?.clear||String(w.value)===fieldValue(q,key))return false;
    throw Error(`${ROWS[w.r].label}은 셀을 더블클릭해 상세 편집하세요. 여러 문단·표·그림의 구조를 보존합니다.`);
  });
  applyVerticalValues(next,ids,safe,options);
  for(const id of new Set(writes.map(w=>ids[w.c]))){
    const before=data.questions.find(q=>q.id===id),after=next.questions.find(q=>q.id===id);
    if(after&&JSON.stringify(before)!==JSON.stringify(after))invalidate(after);
  }
  return validate(next);
}

// Import updates matching IDs, appends new IDs, and keeps questions omitted from
// the workbook. Completion is deliberately invalidated by changed content.
export function mergeWorkbook(current,incoming){
  validate(incoming);
  const next=structuredClone(current),byId=new Map(next.questions.map((q,i)=>[q.id,i]));
  let added=0,updated=0;
  for(const q of incoming.questions){
    const index=byId.get(q.id);
    if(index===undefined){next.questions.push({...structuredClone(q),workflow:'draft'});added++;}
    else{
      const old=next.questions[index],merged={...old,...structuredClone(q),workflow:workflow(old)};
      if(JSON.stringify({...old,workflow:null})!==JSON.stringify({...merged,workflow:null})){
        invalidate(merged);next.questions[index]=merged;updated++;
      }
    }
  }
  const docs=new Map((next.documents||[]).map(d=>[d.questionId||d.id,d]));
  for(const doc of incoming.documents||[])docs.set(doc.questionId||doc.id,structuredClone(doc));
  next.documents=[...docs.values()];
  return {data:validate(next),added,updated};
}

export function createHistory(limit=30){
  const past=[],future=[];let lastKey=null,lastTime=0;
  return {
    record(value,key=null,now=Date.now()){
      if(!key||key!==lastKey||now-lastTime>750){past.push(structuredClone(value));if(past.length>limit)past.shift();}
      lastKey=key;lastTime=now;future.length=0;
    },
    replay(direction,current){
      const from=direction==='redo'?future:past,to=direction==='redo'?past:future;
      if(!from.length)return null;to.push(structuredClone(current));lastKey=null;return from.pop();
    },
    get canUndo(){return past.length>0;},get canRedo(){return future.length>0;}
  };
}
