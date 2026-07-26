/* ===== INSPECTOR SECTION — 용수철 (spring) =====
 * 단진자 섹션과 같은 구조. 감은 수·반지름·끝단 길이·모양을 그 자리에서 고친다.
 * (요구: "도르래의 반지름, 감은수 등을 입력 가능한 객체로 — 단진자와 비슷한 느낌") */

import { makeSection } from "./widgets.js?v=1.2.0";
import { SPRING_DEFAULTS } from "../render/spring.js?v=1.2.0";

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

  // 여러 필드를 한 번에(Undo 1스텝). 선 종류처럼 두 필드가 한 쌍인 경우에 쓴다.
  function commitMany(props) {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const o = s2.objects.find((it) => it.id === ids[0]);
      if (!o || o.type !== "spring" || o.locked) return;
      if (Object.keys(props).every((k) => o[k] === props[k])) return;
      s2.undoStack.push(snap); s2.redoStack = [];
      Object.assign(o, props);
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

  function selectRow(labelText, options, onPick) {
    const row = document.createElement("div");
    row.className = "insp-row";
    const lbl = document.createElement("label");
    lbl.className = "insp-field-label";
    lbl.textContent = labelText;
    const sel = document.createElement("select");
    sel.className = "insp-input";
    options.forEach(([v, t]) => {
      const op = document.createElement("option");
      op.value = v; op.textContent = t;
      sel.appendChild(op);
    });
    row.appendChild(lbl); row.appendChild(sel);
    body.appendChild(row);
    sel.addEventListener("change", () => onPick(sel.value));
    return sel;
  }

  // 종류: 나선(용수철) / 실선(실·줄) — 같은 도구에서 종류만 바꾸면 실이 된다.
  const styleSel = selectRow("종류", [["helix", "나선(용수철)"], ["line", "실선(실·줄)"]],
    (v) => { commit("springStyle", v); syncStyleRows(v); });

  const turnsInp = numberRow("감은 수", "turns", { min: 3, max: 40, step: 1 });
  const radiusInp = numberRow("반지름(mm)", "radius", { min: 0.2, max: 20, step: 0.1 });
  const leadInp = numberRow("끝단 길이(mm)", "leadLength", { min: 0, max: 20, step: 0.5 });

  // 선 종류: 실선 / 점선. 5E 공용 dash 필드를 그대로 쓴다(다른 도형과 조작이 같아진다).
  const dashSel = selectRow("선 종류", [["solid", "실선"], ["dashed", "점선"]], (v) => {
    // dashLength·dashGap을 따로 commit하면 Undo가 두 번 걸린다 → 한 번에 넣는다.
    commitMany({ dashLength: v === "dashed" ? 1.2 : 0, dashGap: v === "dashed" ? 0.8 : 0 });
  });

  // 나선 전용 칸(감은 수·반지름)은 종류가 "실선"이면 의미가 없으니 숨긴다.
  function syncStyleRows(style) {
    const hide = style === "line";
    [turnsInp, radiusInp].forEach((inp) => { inp.closest(".insp-row").hidden = hide; });
  }

  const secSpring = makeSection("용수철", body);

  // 선택이 바뀔 때 인스펙터가 호출한다 — 현재 값으로 입력칸을 채운다.
  function syncSpring(o) {
    if (!o || o.type !== "spring") return;
    turnsInp.value = o.turns ?? o.coils ?? SPRING_DEFAULTS.turns;
    radiusInp.value = o.radius ?? o.amplitude ?? SPRING_DEFAULTS.radius;
    leadInp.value = o.leadLength ?? SPRING_DEFAULTS.leadLength;
    // 삭제된 옛 모양(coil·zigzag) 파일은 나선으로 읽는다.
    const style = o.springStyle === "line" ? "line" : "helix";
    styleSel.value = style;
    syncStyleRows(style);
    dashSel.value = (o.dashLength > 0) ? "dashed" : "solid";
  }

  return { secSpring, syncSpring };
}
