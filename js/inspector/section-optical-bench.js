import { makeSection } from "./widgets.js?v=1.7.0-four-session-integration";
import { isOpticalBench, opticalBenchSettings, changeOpticalBench } from "../optical-bench.js?v=1.7.0-four-session-integration";

export function buildOpticalBenchSection({state}) {
  const body=document.createElement("div");body.className="insp-body";
  const section=makeSection("광학대 조건",body);section.dataset.liteSection="optical-bench";
  const fields=[];
  const selected=()=>{const s=state.get();return s.selectedIds?.length===1?s.objects.find(o=>o.id===s.selectedIds[0]):null;};
  function commit(key,value) {
    const o=selected();if(!isOpticalBench(o)||o.locked)return;
    const next=changeOpticalBench(o,key,value), current=opticalBenchSettings(o);
    if(JSON.stringify(next)===JSON.stringify(current))return;
    const snapshot=JSON.parse(JSON.stringify(state.get().objects));
    state.update(s=>{const target=s.objects.find(x=>x.id===o.id);if(!target||target.locked)return;
      s.undoStack.push(snapshot);s.redoStack=[];Object.assign(target,next);});
  }
  function row(label,key,options) {
    const r=document.createElement("div");r.className="insp-row";r.dataset.liteControl="bench-"+key;
    const l=document.createElement("label");l.className="insp-field-label";l.textContent=label;r.appendChild(l);
    const inp=document.createElement(options?"select":"input");inp.className="insp-input";
    inp.setAttribute("aria-label",label);inp.dataset.benchControl=key;
    if(options)for(const [value,text] of options){const op=document.createElement("option");op.value=value;op.textContent=text;inp.appendChild(op);}
    else {inp.type="number";inp.min=0;inp.max=1000;inp.step=.01;}
    const apply=()=>{if(!options&&!inp.value.trim())return;
      const value=options?inp.value:Number(inp.value);if(!options&&!Number.isFinite(value))return;
      commit(key,value);sync(selected(),true);};
    inp.addEventListener("change",apply);
    inp.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();apply();}});
    inp.addEventListener("blur",()=>sync(selected(),true));
    r.appendChild(inp);body.appendChild(r);fields.push({r,l,inp,key});return inp;
  }
  row("실험 구성","benchMode",[["slit","레이저·이중 슬릿"],["lens","광원·볼록 렌즈"]]);
  row("레일 길이(m)","railLength").min=.2;
  row("레이저 위치(m)","sourcePosition");row("슬릿 위치(m)","elementPosition");row("스크린 위치(m)","screenPosition");
  row("슬릿–스크린 거리(m)","elementScreenDistance");
  const hint=document.createElement("p");hint.className="insp-hint";
  hint.dataset.liteControl="bench-help";
  hint.textContent="위치는 레일 왼쪽 끝 기준입니다. 거리 입력은 스크린을 부품 오른쪽으로 배치합니다. 파란 점을 끌어 위치를 바꿀 수도 있습니다.";body.appendChild(hint);
  function sync(o,force=false) {
    section.style.display=isOpticalBench(o)?"":"none";if(!isOpticalBench(o))return;
    const settings=opticalBenchSettings(o),lens=settings.benchMode==="lens";
    for(const f of fields) {
      if(f.key==="sourcePosition")f.l.textContent=lens?"광원 위치(m)":"레이저 위치(m)";
      if(f.key==="elementPosition")f.l.textContent=lens?"렌즈 위치(m)":"슬릿 위치(m)";
      if(f.key==="elementScreenDistance")f.l.textContent=lens?"렌즈–스크린 거리(m)":"슬릿–스크린 거리(m)";
      f.inp.setAttribute("aria-label",f.l.textContent);f.inp.disabled=!!o.locked;
      if(f.key!=="benchMode")f.inp.max=f.key==="railLength"?1000:settings.railLength;
      if(force||document.activeElement!==f.inp)f.inp.value=f.key==="elementScreenDistance"?Number(Math.abs(settings.screenPosition-settings.elementPosition).toFixed(4)):settings[f.key];
    }
  }
  return {secOpticalBench:section,syncOpticalBench:sync};
}
