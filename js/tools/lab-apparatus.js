import { screenToWorld } from "../viewport.js?v=1.7.0-four-session-integration";
import { isLabApparatus, LAB_APPARATUS, labSettings, changeLabApparatus, labLocalPoint, labHandleChange, labResize, physicsKeyboardChange } from "../lab-apparatus.js?v=1.7.0-four-session-integration";

export function initLabApparatusEditing(svg,state){
  let drag=null;
  const clone=v=>JSON.parse(JSON.stringify(v));
  const find=id=>state.get().objects.find(o=>o.id===id);
  const allowed=o=>isLabApparatus(o)&&!o.locked&&["V","rotate"].includes(state.get().activeTool)&&state.get().selectedIds?.length===1&&state.get().selectedIds[0]===o.id&&!state.get().layers?.some(l=>l.id===o.layerId&&l.visible===false);
  const focus=(id,key)=>Array.from(svg.querySelectorAll?.("[data-lab-handle][tabindex]")||[]).find(n=>n.dataset.id===id&&n.dataset.labHandle===key)?.focus?.();
  svg.addEventListener("pointerdown",e=>{
    const key=e.target.dataset?.labHandle,id=e.target.dataset?.id,o=find(id);
    if(!key||e.button!==0||!allowed(o))return;
    e.preventDefault();e.stopImmediatePropagation();
    const p=screenToWorld(svg,state.get().viewBox,e.clientX,e.clientY);
    drag={id,key,pointerId:e.pointerId,start:labLocalPoint(o,p),original:clone(o),snapshot:clone(state.get().objects),changedKeys:new Set()};
    svg.focus?.();svg.setPointerCapture?.(e.pointerId);
  },true);
  window.addEventListener("pointermove",e=>{
    if(!drag||e.pointerId!==drag.pointerId)return;
    const o=find(drag.id);if(!allowed(o)){finish(null,true);return;}
    const p=labLocalPoint(drag.original,screenToWorld(svg,state.get().viewBox,e.clientX,e.clientY));
    let next;
    if(drag.key.startsWith("size-"))next=labResize(drag.original,drag.key.slice(5),drag.start,p);
    else if(drag.key.startsWith("rotate-")){
      const c={x:drag.original.x+drag.original.w/2,y:drag.original.y+drag.original.h/2};
      const delta=(Math.atan2(p.y-c.y,p.x-c.x)-Math.atan2(drag.start.y-c.y,drag.start.x-c.x))*180/Math.PI;
      let angle=(drag.original.rotation||0)+delta;if(e.shiftKey)angle=Math.round(angle/15)*15;
      next={rotation:Math.round(angle*10)/10};
    }else next=labHandleChange(drag.original,drag.key,drag.start,p,e.shiftKey);
    const changed=Object.entries(next).filter(([key,v])=>JSON.stringify(o[key])!==JSON.stringify(v));
    if(!changed.length)return;e.preventDefault();
    changed.forEach(([key])=>drag.changedKeys.add(key));
    state.update(s=>{const target=s.objects.find(t=>t.id===drag.id);if(target&&!target.locked)Object.assign(target,next);});
  });
  function finish(e,cancel=false){
    if(!drag||(e?.pointerId!=null&&e.pointerId!==drag.pointerId))return;
    const d=drag;drag=null;if(svg.hasPointerCapture?.(d.pointerId))svg.releasePointerCapture(d.pointerId);
    const o=find(d.id);if(!o)return;
    if(cancel){state.update(s=>{const target=s.objects.find(t=>t.id===d.id);if(!target)return;for(const key of d.changedKeys){if(Object.hasOwn(d.original,key))target[key]=d.original[key];else delete target[key];}});}
    else if(Array.from(d.changedKeys).some(key=>JSON.stringify(o[key])!==JSON.stringify(d.original[key])))state.update(s=>{s.undoStack.push(d.snapshot);s.redoStack=[];});
    if(!cancel)focus(d.id,d.key);
  }
  window.addEventListener("pointerup",e=>finish(e));
  window.addEventListener("pointercancel",e=>finish(e,true));
  window.addEventListener("blur",()=>finish(null,true));
  window.addEventListener("keydown",e=>{if(drag&&e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation?.();finish(null,true);}},true);
  svg.addEventListener("keydown",e=>{
    const key=e.target.dataset?.labHandle,id=e.target.dataset?.id,o=find(id);
    if(!key||!allowed(o)||!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End"].includes(e.key))return;
    e.preventDefault();e.stopPropagation();
    const settings=labSettings(o),dir=["ArrowLeft","ArrowDown"].includes(e.key)?-1:1;
    let next=physicsKeyboardChange(o,key,e.key,e.shiftKey);
    if(next){}else if(key==="bob"){
      const prop=["ArrowLeft","ArrowRight"].includes(e.key)?"angle":"stringLength";
      next=changeLabApparatus(o,prop,settings[prop]+dir*(e.shiftKey?5:1));
    }else if(key.startsWith("rotate-"))next={rotation:(o.rotation||0)+dir*(e.shiftKey?15:1)};
    else if(key.startsWith("size-")){
      const label=key.slice(5),step=.02*dir;
      next=labResize(o,label,{x:0,y:0},{x:label.includes("e")?o.w*step:label.includes("w")?-o.w*step:0,y:label.includes("s")?o.h*step:label.includes("n")?-o.h*step:0});
    }else{
      const field=LAB_APPARATUS[o.kind].fields.find(f=>f.key===key);if(!field)return;
      const value=e.key==="Home"?field.min:e.key==="End"?field.max:settings[key]+dir*(field.step||1)*(e.shiftKey?10:1);
      next=changeLabApparatus(o,key,value);
    }
    if(Object.entries(next).every(([k,v])=>JSON.stringify(o[k])===JSON.stringify(v)))return;
    const snapshot=clone(state.get().objects);state.update(s=>{const target=s.objects.find(t=>t.id===id);if(!target||target.locked)return;s.undoStack.push(snapshot);s.redoStack=[];Object.assign(target,next);});focus(id,key);
  });
}
