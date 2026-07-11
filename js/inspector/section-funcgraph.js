/* ===== INSPECTOR SECTION — 함수 그래프 (funcgraph) =====
 * Edit the formula, the generation domain, and convert the graph to a plain
 * editable curve (기획서 §3-2 "곡선으로 변환" escape hatch). Formula/domain edits
 * RE-SAMPLE against the graph's coordplane (planeId). Stroke color/width use the
 * shared 선 section (sec1). Interim expr entry is a prompt() — the §10-④ 모달 will
 * replace it. Mount + show/hide live in js/inspector.js. */

import { makeSection, DASH_PRESETS } from "./widgets.js?v=0.54.30";
import { sampleFunctionPoints } from "../function-graph/sampler.js?v=0.54.30";
import { worldXFromMathX, worldYFromMathY } from "../function-graph/coords.js?v=0.54.30";
import { makeLine, makePolyline } from "../tools.js?v=0.54.30";
import { nextObjectId } from "../tools/id.js?v=0.54.30";

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

  // ---- 끝 라벨(요구 ⑬) — 계열 끝에 이름 붙이기. 수식/한글 혼용 가능(그래프 라벨러 재사용) ----
  const endRow = document.createElement("div");
  endRow.className = "insp-row";
  const endLbl = document.createElement("label");
  endLbl.className = "insp-field-label";
  endLbl.textContent = "끝 라벨";
  const endInput = document.createElement("input");
  endInput.type = "text";
  endInput.placeholder = "예: v_0 · 비우면 표시 안 함";
  endInput.style.cssText = "flex:1;min-width:0;font-size:11px;border:1px solid var(--border);border-radius:6px;padding:3px 6px;background:var(--bg-input);color:var(--text-primary);";
  endInput.addEventListener("change", () => {
    commit((o) => {
      if (o.type !== "funcgraph" || o.endLabel === endInput.value) return false;
      o.endLabel = endInput.value;
      return true;
    });
  });
  endRow.appendChild(endLbl);
  endRow.appendChild(endInput);
  body.appendChild(endRow);

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

  // ===== Phase 3: 그래프 요소 (표시점 ● · 수선의 발 · 구간 화살표) =====
  // 선택된 계열(함수식/점 계열) 위에 표준 객체를 얹는다: 표시점 = optics/node(검은 ●),
  // 수선의 발 = 점선 line 2개(계열의 점 → x축·y축), 구간 화살표 = 곡선을 따라간 화살표
  // polyline. 좌표는 전부 소속 좌표평면(planeId)의 worldFromMath + 베이크된 points[]로
  // 구워, render/pick/transform/save를 그대로 재사용한다(그래프 도구 SPEC §2 "표준 객체 재사용").

  // 계열의 baked points[](월드 mm)에서 world-x에 해당하는 world-y를 선형 보간. 계열 x범위
  // 밖이면 null. (함수식 계열은 x 오름차순이라 정확; 점 계열은 x가 겹칠 수 있으나 v1 근사.)
  function worldYAtX(points, wx) {
    if (!points || points.length < 2) return null;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
      if (wx >= lo - 1e-9 && wx <= hi + 1e-9) {
        const dx = b.x - a.x;
        if (Math.abs(dx) < 1e-9) return a.y;
        return a.y + ((wx - a.x) / dx) * (b.y - a.y);
      }
    }
    return null;
  }

  // 선택 계열 + 소속 평면을 찾아 build(fg, plane)이 만든 객체들을 커밋(undo 1회, 자동선택).
  // build이 문자열을 반환하면 사용자 오류로 alert.
  function addElements(build) {
    const s = state.get();
    const id = (s.selectedIds || [])[0];
    const o = id ? s.objects.find((it) => it.id === id) : null;
    if (!o || o.type !== "funcgraph" || o.locked) return;
    const plane = s.objects.find((p) => p.id === o.planeId && p.type === "coordplane");
    if (!plane) { window.alert("소속 좌표평면을 찾을 수 없습니다 (곡선으로 변환하세요)"); return; }
    const built = build(o, plane);
    if (typeof built === "string") { window.alert(built); return; }
    if (!Array.isArray(built) || !built.length) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((st) => {
      const ids = [];
      built.forEach((b) => {
        b.id = nextObjectId();
        b.order = st.objects.length;
        b.layerId = st.activeLayerId;
        st.objects.push(b);
        ids.push(b.id);
      });
      st.undoStack.push(snap);
      st.redoStack = [];
      st.selectedIds = ids;
      st.targetedId = null;
    });
  }

  // 소제목 + 작은 도움말.
  const p3Title = document.createElement("div");
  p3Title.textContent = "그래프 요소";
  p3Title.style.cssText = "font-size:11px;font-weight:600;color:var(--text-secondary);margin:6px 0 4px;padding-top:6px;border-top:1px solid var(--border);";
  body.appendChild(p3Title);

  // 공통: [라벨] [x입력] [추가버튼] 한 줄 행.
  function elemRow(labelText, placeholder, onAdd) {
    const row = document.createElement("div");
    row.className = "insp-row";
    const lbl = document.createElement("label");
    lbl.className = "insp-field-label";
    lbl.textContent = labelText;
    const inp = document.createElement("input");
    inp.type = "number";
    inp.step = "any";
    inp.placeholder = placeholder;
    inp.style.cssText = NUM_CSS;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "추가";
    btn.style.cssText = BTN_CSS + "margin-left:4px;";
    btn.addEventListener("click", () => onAdd(inp));
    row.appendChild(lbl); row.appendChild(inp); row.appendChild(btn);
    body.appendChild(row);
    return { row, inp, btn };
  }

  // 표시점 ●: 정의역 x → 계열 위 그 점에 검은 점(node).
  const markerRow = elemRow("표시점 ●", "x", (inp) => {
    addElements((o, plane) => {
      const mx = Number(inp.value);
      if (!Number.isFinite(mx)) return "표시점의 x값을 입력하세요";
      const wx = worldXFromMathX(plane, mx);
      const wy = worldYAtX(o.points, wx);
      if (wy == null) return "그 x값은 계열이 그려진 범위 밖입니다";
      const sz = 2.4; // node bbox → 검은 ● (dot Ø ≈ min(w,h)*0.44)
      return [{
        type: "optics", kind: "node", graphRole: "marker", planeId: plane.id,
        x: wx - sz / 2, y: wy - sz / 2, w: sz, h: sz,
        rotation: 0, strokeLevel: 0, strokeWidth: 0.3, fillLevel: 255, fillNone: true,
        label: "", showLabel: false, labelPos: "above", labelType: "quantity",
        dashLength: 0, dashGap: 0, locked: false, positionLocked: false,
      }];
    });
  });

  // 수선의 발: 정의역 x → 계열 위 점에서 x축·y축으로 내린 점선 수선 2개.
  const guideRow = elemRow("수선의 발", "x", (inp) => {
    addElements((o, plane) => {
      const mx = Number(inp.value);
      if (!Number.isFinite(mx)) return "수선의 x값을 입력하세요";
      const wx = worldXFromMathX(plane, mx);
      const wy = worldYAtX(o.points, wx);
      if (wy == null) return "그 x값은 계열이 그려진 범위 밖입니다";
      const wx0 = worldXFromMathX(plane, 0);
      const wy0 = worldYFromMathY(plane, 0);
      const mkGuide = (a, b) => {
        const ln = makeLine(a, b);
        ln.dashLength = 0.7; ln.dashGap = 0.6; // 점선
        ln.strokeWidth = 0.18;                 // 축보다 얇게
        ln.graphRole = "guide"; ln.planeId = plane.id;
        return ln;
      };
      const out = [];
      if (Math.abs(wy - wy0) > 1e-6) out.push(mkGuide({ x: wx, y: wy }, { x: wx, y: wy0 })); // → x축(수직)
      if (Math.abs(wx - wx0) > 1e-6) out.push(mkGuide({ x: wx, y: wy }, { x: wx0, y: wy })); // → y축(수평)
      if (!out.length) return "원점 위의 점이라 수선이 필요 없습니다";
      return out;
    });
  });

  // 구간 화살표: 정의역 [x1~x2] → 곡선을 따라간 화살표 polyline(x1→x2 방향).
  const arrowRow = document.createElement("div");
  arrowRow.className = "insp-row";
  const arrowLbl = document.createElement("label");
  arrowLbl.className = "insp-field-label";
  arrowLbl.textContent = "구간 화살표";
  const arrowX1 = document.createElement("input");
  arrowX1.type = "number"; arrowX1.step = "any"; arrowX1.placeholder = "x₁"; arrowX1.style.cssText = NUM_CSS;
  const arrowTil = document.createElement("span");
  arrowTil.textContent = "~"; arrowTil.className = "insp-unit";
  const arrowX2 = document.createElement("input");
  arrowX2.type = "number"; arrowX2.step = "any"; arrowX2.placeholder = "x₂"; arrowX2.style.cssText = NUM_CSS;
  const arrowBtn = document.createElement("button");
  arrowBtn.type = "button"; arrowBtn.textContent = "추가"; arrowBtn.style.cssText = BTN_CSS + "margin-left:4px;";
  arrowRow.appendChild(arrowLbl); arrowRow.appendChild(arrowX1); arrowRow.appendChild(arrowTil);
  arrowRow.appendChild(arrowX2); arrowRow.appendChild(arrowBtn);
  body.appendChild(arrowRow);
  arrowBtn.addEventListener("click", () => {
    addElements((o, plane) => {
      const x1 = Number(arrowX1.value), x2 = Number(arrowX2.value);
      if (!Number.isFinite(x1) || !Number.isFinite(x2)) return "구간의 x₁, x₂를 입력하세요";
      if (x1 === x2) return "x₁과 x₂가 같습니다";
      const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
      const wlo = worldXFromMathX(plane, lo), whi = worldXFromMathX(plane, hi);
      const yLo = worldYAtX(o.points, wlo), yHi = worldYAtX(o.points, whi);
      if (yLo == null || yHi == null) return "구간이 계열이 그려진 범위 밖입니다";
      const pts = [{ x: wlo, y: yLo }];
      (o.points || []).forEach((p) => { if (p.x > wlo + 1e-6 && p.x < whi - 1e-6) pts.push({ x: p.x, y: p.y }); });
      pts.push({ x: whi, y: yHi });
      if (pts.length < 2) return "구간이 너무 짧습니다";
      if (x1 > x2) pts.reverse(); // 입력 순서대로 화살표 방향
      const pl = makePolyline(pts);
      pl.arrowHead = "end";
      pl.strokeWidth = 0.35; // 계열보다 살짝 굵게
      pl.graphRole = "arrow"; pl.planeId = plane.id;
      return [pl];
    });
  });

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
    // 수동으로 점을 찍은 계열(sourceKind:"points")은 수식/정의역이 없다 — 해당 행을 숨긴다.
    const isPointSeries = obj.sourceKind === "points";
    exprRow.style.display = isPointSeries ? "none" : "";
    domRow.style.display = isPointSeries ? "none" : "";
    exprVal.textContent = obj.expr || "(없음)";
    exprVal.title = obj.expr || "";
    if (document.activeElement !== domMin) domMin.value = obj.domainMin ?? "";
    if (document.activeElement !== domMax) domMax.value = obj.domainMax ?? "";
    if (document.activeElement !== endInput) endInput.value = obj.endLabel || "";
    endInput.disabled = !!obj.locked;
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
    // Phase 3 그래프 요소: 잠금 시 추가 비활성.
    [markerRow.btn, markerRow.inp, guideRow.btn, guideRow.inp,
     arrowBtn, arrowX1, arrowX2].forEach((el) => { el.disabled = locked; });
  }

  return { secFunc, syncFuncgraph: sync };
}
