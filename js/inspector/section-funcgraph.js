/* ===== INSPECTOR SECTION — 함수 그래프 (funcgraph) =====
 * Edit the formula, the generation domain, and convert the graph to a plain
 * editable curve (기획서 §3-2 "곡선으로 변환" escape hatch). Formula/domain edits
 * RE-SAMPLE against the graph's coordplane (planeId). Stroke color/width use the
 * shared 선 section (sec1). Interim expr entry is a prompt() — the §10-④ 모달 will
 * replace it. Mount + show/hide live in js/inspector.js. */

import { makeSection, DASH_PRESETS } from "./widgets.js?v=0.54.27";
import { sampleFunctionPoints } from "../function-graph/sampler.js?v=0.54.27";

const NUM_CSS = "width:52px;font-size:11px;border:1px solid var(--border);border-radius:6px;padding:2px 4px;text-align:center;background:var(--bg-input);color:var(--text-primary);";
const BTN_CSS = "font-size:11px;border:1px solid var(--border);border-radius:6px;padding:3px 8px;background:var(--bg-input);color:var(--text-primary);cursor:pointer;";

export function buildFuncgraphSection(ctx) {
  const { state } = ctx;
  const body = document.createElement("div");

  function currentFuncgraph() {
    const s = state.get();
    const id = (s.selectedIds || [])[0];
    const o = id ? s.objects.find((it) => it.id === id) : null;
    return o && o.type === "funcgraph" ? o : null;
  }

  // Re-sample o.expr over [domainMin,domainMax] onto its plane (found in objects[]).
  // Returns true on success (o.points updated), else a user-facing error string.
  function resampleInto(o, objects) {
    const plane = objects.find((p) => p.id === o.planeId && p.type === "coordplane");
    if (!plane) return "소속 좌표평면을 찾을 수 없습니다 (곡선으로 변환하세요)";
    const { points, error } = sampleFunctionPoints(o.expr, o.domainMin, o.domainMax, plane);
    if (error) return error;
    if (points.length < 2) return "정의역 안에서 그릴 수 있는 점이 없습니다";
    o.points = points;
    return true;
  }

  // mutate(o, objects) → true (commit), false (no-op), or an error string (alert).
  function commit(mutate) {
    const s = state.get();
    const id = (s.selectedIds || [])[0];
    if (!id) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    let err = null;
    state.update((s2) => {
      const o = s2.objects.find((it) => it.id === id);
      if (!o || o.locked) return;
      const res = mutate(o, s2.objects);
      if (typeof res === "string") { err = res; return; }
      if (res !== true) return;
      s2.undoStack.push(snap);
      s2.redoStack = [];
    });
    if (err) window.alert(err);
  }

  // ---- 수식 row: current expr + 편집 button (prompt → resample) ----
  const exprRow = document.createElement("div");
  exprRow.className = "insp-row";
  const exprLbl = document.createElement("label");
  exprLbl.className = "insp-field-label";
  exprLbl.textContent = "수식";
  const exprVal = document.createElement("span");
  exprVal.style.cssText = "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:monospace;font-size:11px;color:var(--text-primary);padding:0 6px;";
  const exprBtn = document.createElement("button");
  exprBtn.type = "button";
  exprBtn.textContent = "편집";
  exprBtn.style.cssText = BTN_CSS;
  exprRow.appendChild(exprLbl);
  exprRow.appendChild(exprVal);
  exprRow.appendChild(exprBtn);
  body.appendChild(exprRow);
  exprBtn.addEventListener("click", () => {
    const o = currentFuncgraph();
    if (!o || o.locked) return;
    const input = window.prompt("함수식", o.expr || "");
    if (input == null) return;
    const expr = input.trim();
    if (!expr) return;
    commit((o2, objects) => {
      if (o2.type !== "funcgraph") return false;
      const old = o2.expr;
      o2.expr = expr;
      const r = resampleInto(o2, objects);
      if (r !== true) { o2.expr = old; return r; }  // revert + surface the error
      return true;
    });
  });

  // ---- 정의역 row: min ~ max (re-sample on change) ----
  function domainInput(prop) {
    const inp = document.createElement("input");
    inp.type = "number";
    inp.step = "any";
    inp.style.cssText = NUM_CSS;
    inp.addEventListener("change", () => {
      const v = Number(inp.value);
      if (!Number.isFinite(v)) return;
      commit((o, objects) => {
        if (o.type !== "funcgraph" || o[prop] === v) return false;
        const old = o[prop];
        o[prop] = v;
        const r = resampleInto(o, objects);
        if (r !== true) { o[prop] = old; return r; }
        return true;
      });
    });
    return inp;
  }
  const domRow = document.createElement("div");
  domRow.className = "insp-row";
  const domLbl = document.createElement("label");
  domLbl.className = "insp-field-label";
  domLbl.textContent = "정의역";
  const domMin = domainInput("domainMin");
  const domMax = domainInput("domainMax");
  const tilde = document.createElement("span");
  tilde.textContent = "~"; tilde.className = "insp-unit";
  domRow.appendChild(domLbl);
  domRow.appendChild(domMin);
  domRow.appendChild(tilde);
  domRow.appendChild(domMax);
  body.appendChild(domRow);

  // ---- 선 종류 (실선/점선) — 여러 함수 구분용(§12-3) ----
  const dashRow = document.createElement("div");
  dashRow.className = "insp-row";
  const dashLbl = document.createElement("label");
  dashLbl.className = "insp-field-label";
  dashLbl.textContent = "선 종류";
  dashRow.appendChild(dashLbl);
  const dashBtns = [];
  DASH_PRESETS.forEach((preset) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = preset.label;
    b.style.cssText = BTN_CSS + "margin-left:3px;padding:2px 6px;";
    b.addEventListener("click", () => commit((o) => {
      if (o.type !== "funcgraph") return false;
      o.dashLength = preset.dashLength;
      o.dashGap = preset.dashGap;
      return true;
    }));
    dashBtns.push({ btn: b, preset });
    dashRow.appendChild(b);
  });
  body.appendChild(dashRow);

  // ---- 곡선으로 변환 (§3-2): funcgraph → plain open curve (one-way) ----
  const convRow = document.createElement("div");
  convRow.className = "insp-row";
  const convBtn = document.createElement("button");
  convBtn.type = "button";
  convBtn.textContent = "곡선으로 변환";
  convBtn.title = "수식 구동을 끊고 점을 직접 편집할 수 있는 일반 곡선으로 바꿉니다 (되돌리기 불가)";
  convBtn.style.cssText = BTN_CSS + "width:100%;";
  convRow.appendChild(convBtn);
  body.appendChild(convRow);
  convBtn.addEventListener("click", () => {
    const o = currentFuncgraph();
    if (!o || o.locked) return;
    commit((o2) => {
      if (o2.type !== "funcgraph") return false;
      o2.type = "curve";
      delete o2.expr; delete o2.domainMin; delete o2.domainMax; delete o2.planeId;
      o2.fillLevel = 255; o2.fillNone = false; o2.fillStyle = "solid"; o2.arrowHead = "none";
      return true;
    });
  });

  const secFunc = makeSection("함수 그래프", body);

  function sync(obj) {
    exprVal.textContent = obj.expr || "(없음)";
    exprVal.title = obj.expr || "";
    if (document.activeElement !== domMin) domMin.value = obj.domainMin ?? "";
    if (document.activeElement !== domMax) domMax.value = obj.domainMax ?? "";
    const dl = obj.dashLength ?? 0, dg = obj.dashGap ?? 0;
    dashBtns.forEach(({ btn, preset }) => {
      const on = Math.abs(preset.dashLength - dl) < 1e-6 && Math.abs(preset.dashGap - dg) < 1e-6;
      btn.style.background = on ? "var(--accent)" : "var(--bg-input)";
      btn.style.borderColor = on ? "var(--accent)" : "var(--border)";
      btn.disabled = !!obj.locked;
    });
    const locked = !!obj.locked;
    exprBtn.disabled = locked;
    domMin.disabled = locked;
    domMax.disabled = locked;
    convBtn.disabled = locked;
  }

  return { secFunc, syncFuncgraph: sync };
}
