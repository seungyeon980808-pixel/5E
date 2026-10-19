import { screenToWorld } from "../viewport.js?v=1.7.0-four-session-integration";
import { isOpticalBench, opticalBenchSettings, changeOpticalBench, opticalBenchLayout, opticalBenchLocalPoint } from "../optical-bench.js?v=1.7.0-four-session-integration";

export function initOpticalBenchEditing(svg,state) {
  let drag=null;
  const find=id=>state.get().objects.find(o=>o.id===id);
  const allowed=o=>isOpticalBench(o)&&!o.locked&&state.get().activeTool==="V"&&state.get().selectedIds?.length===1&&state.get().selectedIds[0]===o.id;
  svg.addEventListener("pointerdown",e=>{
    const prop=e.target.dataset?.benchHandle, id=e.target.dataset?.id, o=find(id);
    if(!prop||e.button!==0||!allowed(o))return;
    e.preventDefault();e.stopImmediatePropagation();
    const p=screenToWorld(svg,state.get().viewBox,e.clientX,e.clientY);
    drag={id,prop,pointerId:e.pointerId,start:opticalBenchLocalPoint(o,p),value:opticalBenchSettings(o)[prop],original:JSON.parse(JSON.stringify(o)),snapshot:JSON.parse(JSON.stringify(state.get().objects)),changed:false};
    svg.setPointerCapture?.(e.pointerId);
  },true);
  window.addEventListener("pointermove",e=>{
    if(!drag||e.pointerId!==drag.pointerId)return;
    const o=find(drag.id);if(!allowed(o))return;
    const p=screenToWorld(svg,state.get().viewBox,e.clientX,e.clientY);
    const local=opticalBenchLocalPoint(drag.original,p),layout=opticalBenchLayout(drag.original);
    const value=Math.round((drag.value+(local.x-drag.start.x)/(layout.axisEnd-layout.axisStart)*layout.settings.railLength)*10000)/10000;
    const next=changeOpticalBench(o,drag.prop,value);
    if(next[drag.prop]===opticalBenchSettings(o)[drag.prop])return;
    drag.changed=true;e.preventDefault();
    state.update(s=>{const target=s.objects.find(x=>x.id===drag.id);if(target&&!target.locked)Object.assign(target,next);});
  });
  function finish(e,cancel=false) {
    if(!drag||(e?.pointerId!=null&&e.pointerId!==drag.pointerId))return;
    const current=drag;drag=null;
    if(svg.hasPointerCapture?.(current.pointerId))svg.releasePointerCapture(current.pointerId);
    const o=find(current.id);if(!o)return;
    if(cancel){state.update(s=>{const target=s.objects.find(x=>x.id===current.id);if(!target)return;
      if(Object.hasOwn(current.original,current.prop))target[current.prop]=current.original[current.prop];else delete target[current.prop];});}
    else if(current.changed&&opticalBenchSettings(o)[current.prop]!==current.value)
      state.update(s=>{s.undoStack.push(current.snapshot);s.redoStack=[];});
  }
  window.addEventListener("pointerup",e=>finish(e));
  window.addEventListener("pointercancel",e=>finish(e,true));
  window.addEventListener("blur",()=>finish(null,true));
  svg.addEventListener("keydown",e=>{
    const prop=e.target.dataset?.benchHandle,id=e.target.dataset?.id,o=find(id);
    if(!prop||!allowed(o)||!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;
    e.preventDefault();e.stopPropagation();const settings=opticalBenchSettings(o);
    const value=e.key==="Home"?0:e.key==="End"?settings.railLength:settings[prop]+(e.key==="ArrowLeft"?-1:1)*(e.shiftKey?.1:.01);
    const next=changeOpticalBench(o,prop,value);if(next[prop]===settings[prop])return;
    const snapshot=JSON.parse(JSON.stringify(state.get().objects));
    state.update(s=>{s.undoStack.push(snapshot);s.redoStack=[];Object.assign(s.objects.find(x=>x.id===id),next);});
    svg.querySelector(`[data-bench-handle="${prop}"][tabindex]`)?.focus();
  });
  window.addEventListener("keydown",e=>{if(drag&&e.key==="Escape"){e.preventDefault();finish(null,true);}},true);
}
