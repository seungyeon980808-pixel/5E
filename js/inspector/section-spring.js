/* ===== INSPECTOR SECTION — 용수철 (spring) =====
 * 단진자 섹션과 같은 구조. 감은 수·반지름·끝단 길이·모양을 그 자리에서 고친다.
 * (요구: "도르래의 반지름, 감은수 등을 입력 가능한 객체로 — 단진자와 비슷한 느낌") */

import { makeSection } from "./widgets.js?v=1.2.0";

export function buildSpringSection(ctx) {
  const { state } = ctx;
  const body = document.createElement("div");

  // 선택된 용수철 하나에 필드 하나를 커밋한다(Undo 1스텝).
  function commit(prop, value) {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const o = s2.objects.find((it) => it.id === ids[0]);
      if (!o || o.type !== "spring" || o.locked) return;
      if (o[prop] === value) return;
      s2.undoStack.push(snap); s2.redoStack = [];
      o[prop] = value;
    });
  }

  function numberRow(labelText, prop, { min, max, step }) {
    const row = document.createElement("div");
    row.className = "insp-row";
    const lbl = document.createElement("label");
    lbl.className = "insp-field-label";
    lbl.textContent = labelText;
    const inp = document.createElement("input");
    inp.type = "number";
    inp.className = "insp-input";
    inp.min = min; inp.max = max; inp.step = step;
    row.appendChild(lbl); row.appendChild(inp);
    body.appendChild(row);
    const fire = () => {
      const v = Number(inp.value);
      if (!Number.isFinite(v)) return;
      commit(prop, Math.min(max, Math.max(min, v)));
    };
    inp.addEventListener("input", fire);
    inp.addEventListener("change", fire);
    return inp;
  }

  const turnsInp = numberRow("감은 수", "turns", { min: 1, max: 40, step: 1 });
  const radiusInp = numberRow("반지름(mm)", "radius", { min: 0.2, max: 20, step: 0.1 });
  const leadInp = numberRow("끝단 길이(mm)", "leadLength", { min: 0, max: 20, step: 0.5 });

  // 모양: 입체 나선(기본) / 사인 / 지그재그
  const styleRow = document.createElement("div");
  styleRow.className = "insp-row";
  const styleLbl = document.createElement("label");
  styleLbl.className = "insp-field-label";
  styleLbl.textContent = "모양";
  const styleSel = document.createElement("select");
  styleSel.className = "insp-input";
  [["helix", "입체 나선"], ["coil", "사인"], ["zigzag", "지그재그"]].forEach(([v, t]) => {
    const op = document.createElement("option");
    op.value = v; op.textContent = t;
    styleSel.appendChild(op);
  });
  styleRow.appendChild(styleLbl); styleRow.appendChild(styleSel);
  body.appendChild(styleRow);
  styleSel.addEventListener("change", () => commit("springStyle", styleSel.value));

  const secSpring = makeSection("용수철", body);

  // 선택이 바뀔 때 인스펙터가 호출한다 — 현재 값으로 입력칸을 채운다.
  function syncSpring(o) {
    if (!o || o.type !== "spring") return;
    turnsInp.value = o.turns ?? o.coils ?? 6;
    radiusInp.value = o.radius ?? o.amplitude ?? 1.8;
    leadInp.value = o.leadLength ?? 2;
    styleSel.value = o.springStyle || "helix";
  }

  return { secSpring, syncSpring };
}
