/* ===== INSPECTOR SECTION — 수평면 위 원호(groundarc) =====
 *
 * 중심과 시작점은 캔버스에서 두 끝점 핸들로 정한다(p1=중심, p2=시작점).
 * 여기서는 벌림각과 표시 방식을 다룬다.
 *
 * 반지름은 **바닥에서 잰 길이**를 읽기 전용으로 보여 준다. 화면상 길이가 아니라
 * 바닥에서의 실제 길이라야 그림 안의 다른 거리(예: 2d)와 비교가 된다.
 */

import { makeSection } from "./widgets.js?v=1.4.0";
import { groundArcRadius } from "../render.js?v=1.4.0";

function row(labelText) {
  const r = document.createElement("div");
  r.className = "insp-row";
  const l = document.createElement("label");
  l.className = "insp-field-label";
  l.textContent = labelText;
  r.appendChild(l);
  return r;
}

export function initGroundArcSection(state) {
  const content = document.getElementById("inspector-content");
  if (!content) return;

  const body = document.createElement("div");
  body.className = "insp-body";

  const sweepRow = row("벌림각");
  const sweepInp = document.createElement("input");
  sweepInp.type = "number";
  sweepInp.step = "5";
  sweepInp.min = "-360";
  sweepInp.max = "360";
  sweepInp.className = "insp-input";
  const sweepUnit = document.createElement("span");
  sweepUnit.className = "insp-unit";
  sweepUnit.textContent = "°";
  sweepRow.appendChild(sweepInp);
  sweepRow.appendChild(sweepUnit);
  sweepRow.title = "음수를 넣으면 반대 방향으로 돕니다.";
  body.appendChild(sweepRow);

  const radRow = row("반지름(바닥)");
  const radOut = document.createElement("span");
  radOut.className = "insp-unit";
  radOut.style.flex = "1";
  radOut.style.textAlign = "right";
  radRow.appendChild(radOut);
  radRow.title = "중심 핸들과 시작점 핸들을 끌어 바꿉니다.\n화면상 길이가 아니라 바닥에서 잰 실제 길이입니다.";
  body.appendChild(radRow);

  const dashRow = row("점선");
  const dashCb = document.createElement("input");
  dashCb.type = "checkbox";
  dashRow.appendChild(dashCb);
  body.appendChild(dashRow);

  const radiiRow = row("반지름 선 표시");
  const radiiCb = document.createElement("input");
  radiiCb.type = "checkbox";
  radiiRow.appendChild(radiiCb);
  radiiRow.title = "중심에서 호의 양 끝으로 점선을 긋습니다.\n'이 거리가 d다'를 분명히 할 때 씁니다.";
  body.appendChild(radiiRow);

  const section = makeSection("평면 위 원호", body);
  section.style.display = "none";
  content.appendChild(section);

  function selected() {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1 || s.targetedId) return null;
    const o = s.objects.find((x) => x.id === ids[0]);
    return o && o.type === "groundarc" ? o : null;
  }

  function commit(mut) {
    const s = state.get();
    const o = selected();
    if (!o || o.locked) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const t = s2.objects.find((x) => x.id === o.id);
      if (!t || t.locked) return;
      mut(t);
      s2.undoStack.push(snap);
      s2.redoStack = [];
    });
  }

  sweepInp.addEventListener("change", () => {
    const v = Number(sweepInp.value);
    if (!isFinite(v) || v === 0) return;
    commit((t) => { t.sweep = v; });
  });
  dashCb.addEventListener("change", () => {
    commit((t) => { t.dashed = dashCb.checked; });
  });
  radiiCb.addEventListener("change", () => {
    commit((t) => { t.showRadii = radiiCb.checked; });
  });

  function sync() {
    const o = selected();
    if (!o) { section.style.display = "none"; return; }
    section.style.display = "";
    if (document.activeElement !== sweepInp) sweepInp.value = Number.isFinite(o.sweep) ? o.sweep : 90;
    radOut.textContent = `${Math.round(groundArcRadius(o) * 10) / 10} mm`;
    dashCb.checked = o.dashed !== false;
    radiiCb.checked = !!o.showRadii;
  }

  state.subscribe(sync);
  sync();
}
