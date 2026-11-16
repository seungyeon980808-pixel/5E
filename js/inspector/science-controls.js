import { jsonClone } from "../json-clone.js?v=1.7.0-four-session-integration";
import { endpointSettings, setEndpointSettings } from "../science-geometry.js?v=1.7.0-four-session-integration";

// Endpoints remain the only saved geometry. Numeric edits and handle drags
// therefore agree after moving, rotating, resizing and reopening a project.
export function addEndpointControls(body, state, type, vertical = false) {
  const inputs = {};
  for (const [key, label, min, max, step] of [
    ["length", "길이(mm)", 0.1, 1000, 0.1],
    ["angle", vertical ? "각도(수직 기준 °)" : "방향(수평 기준 °)", -180, 180, 1],
  ]) {
    const row = document.createElement("div"); row.className = "insp-row";
    const lbl = document.createElement("label"); lbl.className = "insp-field-label"; lbl.textContent = label;
    const input = document.createElement("input"); input.type = "number"; input.className = "insp-input";
    input.min = min; input.max = max; input.step = step;
    row.title = vertical ? "매단 점은 고정하고 추를 옮깁니다. 0°는 수직 아래, 양수는 오른쪽입니다." : "첫 끝점을 고정하고 둘째 끝점을 옮깁니다. 0°는 오른쪽입니다.";
    row.appendChild(lbl); row.appendChild(input); body.appendChild(row); inputs[key] = input;
    input.addEventListener("change", () => {
      if (!input.value.trim()) return;
      const value = Number(input.value); if (!Number.isFinite(value)) return;
      const s = state.get(), ids = s.selectedIds || [];
      if (ids.length !== 1 || s.targetedId) return;
      const o = s.objects.find(x => x.id === ids[0]); if (!o || o.type !== type || o.locked) return;
      const snap = jsonClone(s.objects);
      state.update(s2 => {
        const t = s2.objects.find(x => x.id === o.id); if (!t || t.locked) return;
        setEndpointSettings(t, { [key]: value }, vertical);
        if (JSON.stringify(s2.objects) !== JSON.stringify(snap)) { s2.undoStack.push(snap); s2.redoStack = []; }
      });
    });
  }
  function sync() {
    const s = state.get(), ids = s.selectedIds || [];
    const o = ids.length === 1 ? s.objects.find(x => x.id === ids[0] && x.type === type) : null;
    if (!o) return;
    const values = endpointSettings(o, vertical);
    for (const key of Object.keys(inputs)) {
      inputs[key].disabled = !!o.locked;
      if (document.activeElement !== inputs[key]) inputs[key].value = Number(values[key].toFixed(3));
    }
  }
  state.subscribe(sync); sync();
  return inputs;
}
