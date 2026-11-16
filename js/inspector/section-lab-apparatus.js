import { jsonClone } from "../json-clone.js?v=1.7.0-four-session-integration";
import { makeSection } from "./widgets.js?v=1.7.0-four-session-integration";
import { LAB_APPARATUS, isLabApparatus, labSettings, changeLabApparatus, physicsAction, physicsToolHint } from "../lab-apparatus.js?v=1.7.0-four-session-integration";

export function buildLabApparatusSection({state}){
  const body=document.createElement("div");body.className="insp-body";
  const section=makeSection("실험장치 조건",body);section.dataset.liteSection="lab-apparatus";
  const groups=new Map(),fields=[],actions=[];
  const selected=()=>{const s=state.get();return s.selectedIds?.length===1?s.objects.find(o=>o.id===s.selectedIds[0]):null;};
  for(const [kind,def]of Object.entries(LAB_APPARATUS)){
    const kindFields=[];groups.set(kind,kindFields);
    for(const f of def.fields){
      const row=document.createElement("div");row.className="insp-row";row.dataset.liteControl="lab-"+f.key;
      const label=document.createElement("label");label.className="insp-field-label";label.textContent=f.label;row.appendChild(label);
      const input=document.createElement(f.type==="select"?"select":f.type==="textarea"?"textarea":"input");input.className="insp-input";input.setAttribute("aria-label",f.label);input.dataset.labControl=f.key;
      if(f.type==="select")for(const [value,text]of f.options){const option=document.createElement("option");option.value=value;option.textContent=text;input.appendChild(option);}
      else {if(f.type!=="textarea")input.type=f.type;if(f.type==="number"){input.min=f.min;input.max=f.max;input.step=f.step;}if(["text","textarea"].includes(f.type))input.maxLength=f.maxLength||32;}
      if(f.type==="textarea"){input.rows=2;input.style.resize="vertical";}
      const apply=()=>{
        const o=selected();if(!isLabApparatus(o)||o.kind!==kind||o.locked)return;
        if(f.type==="number"&&!input.value.trim())return;
        const value=f.type==="checkbox"?input.checked:f.type==="number"?Number(input.value):input.value;
        if(f.type==="number"&&!Number.isFinite(value))return;
        const next=changeLabApparatus(o,f.key,value),current=labSettings(o);
        if(next[f.key]!==current[f.key]){
          const snapshot=jsonClone(state.get().objects);
          state.update(s=>{const obj=s.objects.find(t=>t.id===o.id);if(!obj||obj.locked)return;s.undoStack.push(snapshot);s.redoStack=[];Object.assign(obj,next);});
        }
        sync(selected(),true);
      };
      input.addEventListener("change",apply);
      input.addEventListener("keydown",e=>{if(e.key==="Enter"&&(f.type!=="textarea"||e.ctrlKey||e.metaKey)){e.preventDefault();apply();}});
      input.addEventListener("blur",()=>{apply();sync(selected(),true);});
      row.appendChild(input);body.appendChild(row);const entry={row,input,f};kindFields.push(entry);fields.push(entry);
    }
    for(const [key,label]of def.actions||[]){
      const row=document.createElement("div");row.className="insp-row";
      const button=document.createElement("button");button.className="insp-input";button.textContent=label;button.dataset.labAction=key;button.type="button";row.appendChild(button);body.appendChild(row);actions.push({row,button,kind});
      button.addEventListener("click",()=>{
        const o=selected();if(o?.kind!==kind||o.locked)return;const result=physicsAction(o,key);if(!result)return;
        if(result.error){hint.textContent=result.error;return;}
        if(result.settings&&JSON.stringify(result.settings)===JSON.stringify(labSettings(o)))return;
        const snapshot=jsonClone(state.get().objects);
        state.update(s=>{const obj=s.objects.find(t=>t.id===o.id);if(!obj||obj.locked)return;s.undoStack.push(snapshot);s.redoStack=[];
          if(result.created){s.objects.push(result.created);s.selectedIds=[result.created.id];}else Object.assign(obj,result.settings);
        });sync(selected(),true);
      });
    }
  }
  const hint=document.createElement("p");hint.className="insp-hint";hint.dataset.liteControl="lab-help";body.appendChild(hint);
  function sync(o,force=false){
    section.style.display=isLabApparatus(o)?"":"none";if(!isLabApparatus(o))return;
    section.querySelector("summary").textContent=LAB_APPARATUS[o.kind].label+" 조건";
    for(const {row}of fields)row.style.display="none";
    for(const a of actions){a.row.style.display=a.kind===o.kind?"":"none";a.button.disabled=!!o.locked;}
    const s=labSettings(o);
    for(const entry of groups.get(o.kind)){
      const {row,input,f}=entry;
      row.style.display="";input.disabled=!!o.locked;
      if(o.kind==="cart_track"&&f.key.endsWith("Position"))input.max=s.railLength;
      if(o.kind==="refraction_scene"&&f.key==="selectedMedium")input.max=Math.max(1,s.media.length);
      if(f.type==="checkbox")input.checked=s[f.key];
      // Preserve an uncommitted draft, but show model changes from Undo or a
      // canvas handle even when the toolbar keeps focus in this input.
      else if(force||document.activeElement!==input||entry.syncedValue!==s[f.key])input.value=String(s[f.key]);
      entry.syncedValue=s[f.key];
    }
    hint.textContent=physicsToolHint(o)|| (o.kind==="metal_ring"?"오른쪽이 0°, 반시계 방향이 양의 각도입니다. Shift를 누른 채 중심에 선·라벨러 끝점을 스냅할 수 있습니다.":
      o.kind==="piston_gas"?"피스톤 중앙 핸들을 위아래로 드래그합니다. 화살표는 운동 방향, 궤적은 지나온 방향입니다.":
      o.kind==="circular_motion"?"추 핸들은 각도, 궤도 오른쪽 핸들은 반지름을 조절합니다. 작은 각도에서는 장치가 길어지며 전체 크기로 축소할 수 있습니다.":
      o.kind==="spring_balance"?"후크는 신장, 눈금 옆의 작은 핸들은 표시값을 조절합니다. 추 개수는 별도 입력합니다.":
      o.kind==="cart_track"?"레일 아래 핸들로 수레·포토게이트·센서 위치를 조절합니다. 수레와 상자·바퀴는 함께 이동합니다.":o.kind==="pendulum_rig"?"추를 드래그해 각도와 실 길이를 조절합니다. Shift는 길이를 유지합니다. 작은 핸들은 추 크기를 조절합니다.":o.kind==="transformer"?"코일 아래 핸들을 위로 드래그하면 감은 수가 늘어납니다. 정확한 정수는 입력창에서 설정합니다.":"표시값을 입력해 저울의 숫자와 단위를 편집합니다.");
  }
  return {secLabApparatus:section,syncLabApparatus:sync};
}
