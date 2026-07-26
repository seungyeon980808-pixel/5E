/* ===== INSPECTOR SECTION — 전기력선(chargefield) · 자기력선(fieldlines) =====
 * 용수철 섹션과 같은 구조(선택된 객체 하나에 필드 하나를 커밋 = Undo 1스텝).
 *
 * 두 타입을 한 파일에 둔 이유: 조작 항목이 거의 같고(선 개수·화살촉·본체 표시),
 * 렌더러도 같은 장(場) 엔진을 쓴다. 갈래(kind)만 다르다.
 */

import { makeSection } from "./widgets.js?v=1.2.0";

function commitTo(state, type, prop, value) {
  const s = state.get();
  const ids = s.selectedIds || [];
  if (ids.length !== 1) return;
  const snap = JSON.parse(JSON.stringify(s.objects));
  state.update((s2) => {
    const o = s2.objects.find((it) => it.id === ids[0]);
    if (!o || o.type !== type || o.locked) return;
    if (o[prop] === value) return;
    s2.undoStack.push(snap); s2.redoStack = [];
    o[prop] = value;
  });
}

/* 공용 위젯 — 숫자칸 / 선택칸 / 체크칸. row를 돌려주어 갈래별로 숨길 수 있게 한다. */
function numberRow(body, labelText, onFire, { min, max, step }) {
  const row = document.createElement("div");
  row.className = "insp-row";
  const lbl = document.createElement("label");
  lbl.className = "insp-field-label";
  lbl.textContent = labelText;
  const inp = document.createElement("input");
  inp.type = "number"; inp.className = "insp-input";
  inp.min = min; inp.max = max; inp.step = step;
  const fire = () => {
    const v = Number(inp.value);
    if (!Number.isFinite(v)) return;
    onFire(Math.min(max, Math.max(min, v)));
  };
  inp.addEventListener("input", fire);
  inp.addEventListener("change", fire);
  row.appendChild(lbl); row.appendChild(inp); body.appendChild(row);
  return { row, inp };
}
function selectRow(body, labelText, options, onPick) {
  const row = document.createElement("div");
  row.className = "insp-row";
  const lbl = document.createElement("label");
  lbl.className = "insp-field-label";
  lbl.textContent = labelText;
  const sel = document.createElement("select");
  sel.className = "insp-input";
  options.forEach(([v, t]) => {
    const op = document.createElement("option");
    op.value = v; op.textContent = t; sel.appendChild(op);
  });
  row.appendChild(lbl); row.appendChild(sel); body.appendChild(row);
  sel.addEventListener("change", () => onPick(sel.value));
  return { row, sel };
}
function checkRow(body, labelText, onToggle) {
  const row = document.createElement("div");
  row.className = "insp-row";
  const lbl = document.createElement("label");
  lbl.className = "insp-field-label";
  lbl.textContent = labelText;
  const cb = document.createElement("input");
  cb.type = "checkbox";
  row.appendChild(lbl); row.appendChild(cb); body.appendChild(row);
  cb.addEventListener("change", () => onToggle(cb.checked));
  return { row, cb };
}
function textRow(body, labelText, onInput) {
  const row = document.createElement("div");
  row.className = "insp-row";
  const lbl = document.createElement("label");
  lbl.className = "insp-field-label";
  lbl.textContent = labelText;
  const inp = document.createElement("input");
  inp.type = "text"; inp.className = "insp-input"; inp.maxLength = 12;
  row.appendChild(lbl); row.appendChild(inp); body.appendChild(row);
  inp.addEventListener("input", () => onInput(inp.value));
  return { row, inp };
}

/* ---------- 전기력선 ---------- */
export function buildChargeFieldSection(ctx) {
  const { state } = ctx;
  const body = document.createElement("div");
  const commit = (p, v) => commitTo(state, "chargefield", p, v);

  const kind = selectRow(body, "갈래",
    [["pair", "두 전하"], ["single", "점전하 하나"], ["uniform", "평행판 균일장"]],
    (v) => { commit("kind", v); syncRows(v); });

  const lines = numberRow(body, "전기력선 개수", (v) => commit("lines", Math.round(v)), { min: 2, max: 40, step: 1 });
  const q1 = numberRow(body, "전하 1 크기", (v) => commit("q1", v), { min: -6, max: 6, step: 1 });
  const q2 = numberRow(body, "전하 2 크기", (v) => commit("q2", v), { min: -6, max: 6, step: 1 });
  const arrowDist = numberRow(body, "화살촉 거리(mm)", (v) => commit("arrowDist", v), { min: 1, max: 40, step: 0.5 });
  const chargeR = numberRow(body, "전하 크기(mm)", (v) => commit("chargeR", v), { min: 0.5, max: 8, step: 0.1 });
  const chargeLevel = numberRow(body, "전하 색(0~255)", (v) => commit("chargeLevel", Math.round(v)), { min: 0, max: 255, step: 5 });
  const label1 = textRow(body, "전하 1 라벨", (v) => commit("label1", v));
  const label2 = textRow(body, "전하 2 라벨", (v) => commit("label2", v));
  const showArrows = checkRow(body, "화살촉 표시", (v) => commit("showArrows", v));
  const showCharge = checkRow(body, "전하 표시", (v) => commit("showCharge", v));
  const flip = checkRow(body, "극 뒤집기", (v) => commit("flip", v));

  // 갈래에 따라 의미 없는 칸은 숨긴다(점전하엔 전하 2가 없다).
  function syncRows(k) {
    const isUniform = k === "uniform";
    const isSingle = k === "single";
    q2.row.hidden = isUniform || isSingle;
    q1.row.hidden = isUniform;
    arrowDist.row.hidden = isUniform;
    chargeR.row.hidden = isUniform;
    chargeLevel.row.hidden = isUniform;
    label1.row.hidden = isUniform;
    label2.row.hidden = isUniform || isSingle;
    showCharge.row.hidden = isUniform;
    flip.row.hidden = !isUniform;
  }

  const secChargeField = makeSection("전기력선", body);

  function syncChargeField(o) {
    if (!o || o.type !== "chargefield") return;
    const k = o.kind || "pair";
    kind.sel.value = k;
    lines.inp.value = o.lines ?? 12;
    q1.inp.value = Number.isFinite(o.q1) ? o.q1 : 1;
    q2.inp.value = Number.isFinite(o.q2) ? o.q2 : -1;
    arrowDist.inp.value = o.arrowDist ?? 6;
    chargeR.inp.value = o.chargeR ?? 1.9;
    chargeLevel.inp.value = Number.isFinite(o.chargeLevel) ? o.chargeLevel : "";
    if (document.activeElement !== label1.inp) label1.inp.value = o.label1 || "";
    if (document.activeElement !== label2.inp) label2.inp.value = o.label2 || "";
    showArrows.cb.checked = o.showArrows !== false;
    showCharge.cb.checked = o.showCharge !== false;
    flip.cb.checked = !!o.flip;
    syncRows(k);
  }

  return { secChargeField, syncChargeField };
}

/* ---------- 자기력선 ---------- */
export function buildFieldLinesSection(ctx) {
  const { state } = ctx;
  const body = document.createElement("div");
  const commit = (p, v) => commitTo(state, "fieldlines", p, v);

  const kind = selectRow(body, "갈래", [["bar", "막대자석"], ["wire", "직선 도선"]],
    (v) => { commit("kind", v); syncRows(v); });
  const lines = numberRow(body, "자기력선 개수", (v) => commit("lines", Math.round(v)), { min: 4, max: 40, step: 1 });
  const thick = numberRow(body, "자석 두께(mm)", (v) => commit("magnetThick", v), { min: 1, max: 20, step: 0.2 });
  const showLines = checkRow(body, "자기력선 표시", (v) => commit("showLines", v));
  const showArrowsM = checkRow(body, "화살촉 표시", (v) => commit("showArrows", v));
  const showMagnet = checkRow(body, "자석 본체 표시", (v) => commit("showMagnet", v));
  const rings = numberRow(body, "동심원 개수", (v) => commit("rings", Math.round(v)), { min: 1, max: 8, step: 1 });
  const into = checkRow(body, "전류가 들어가는 방향(⊗)", (v) => commit("into", v));

  function syncRows(k) {
    const wire = k === "wire";
    showLines.row.hidden = wire;
    showArrowsM.row.hidden = false;
    lines.row.hidden = wire;
    thick.row.hidden = wire;
    showMagnet.row.hidden = wire;
    rings.row.hidden = !wire;
    into.row.hidden = !wire;
  }

  const secFieldLines = makeSection("자기력선", body);

  function syncFieldLines(o) {
    if (!o || o.type !== "fieldlines") return;
    const k = o.kind || "bar";
    kind.sel.value = k;
    lines.inp.value = o.lines ?? 14;
    thick.inp.value = o.magnetThick ?? 5.2;
    showLines.cb.checked = o.showLines !== false;
    showArrowsM.cb.checked = o.showArrows !== false;
    showMagnet.cb.checked = o.showMagnet !== false;
    rings.inp.value = o.rings ?? 3;
    into.cb.checked = !!o.into;
    syncRows(k);
  }

  return { secFieldLines, syncFieldLines };
}

/* ---------- 정상파 ---------- */
export function buildStandingWaveSection(ctx) {
  const { state } = ctx;
  const body = document.createElement("div");
  const commit = (p, v) => commitTo(state, "standingwave", p, v);

  const medium = selectRow(body, "매질",
    [["string", "줄 (양끝 고정)"], ["open", "열린관"], ["closed", "닫힌관"]],
    (v) => {
      commit("medium", v);
      // 닫힌관은 홀수 배진동만 존재한다 → 짝수면 즉시 올려 준다.
      const s = state.get();
      const o = (s.objects || []).find((it) => it.id === (s.selectedIds || [])[0]);
      if (v === "closed" && o && (o.n ?? 2) % 2 === 0) commit("n", (o.n ?? 2) + 1);
      syncRows(v);
    });

  const n = numberRow(body, "배진동 차수", (v) => commit("n", Math.round(v)), { min: 1, max: 12, step: 1 });
  const amp = numberRow(body, "배의 높이(mm)", (v) => commit("amplitude", v), { min: 0.5, max: 30, step: 0.2 });
  const closedEnd = selectRow(body, "막힌 쪽", [["p1", "시작점"], ["p2", "끝점"]], (v) => commit("closedEnd", v));
  const showNodes = checkRow(body, "마디 ● 표시", (v) => commit("showNodes", v));

  function syncRows(m) {
    closedEnd.row.hidden = m !== "closed";
    // 닫힌관에서는 짝수 차수를 아예 못 고르게 한다(스테퍼가 2씩 움직인다).
    n.inp.step = m === "closed" ? 2 : 1;
    n.inp.min = 1;
  }

  const secStandingWave = makeSection("정상파", body);

  function syncStandingWave(o) {
    if (!o || o.type !== "standingwave") return;
    const m = o.medium || "string";
    medium.sel.value = m;
    n.inp.value = o.n ?? 2;
    amp.inp.value = o.amplitude ?? 4.2;
    closedEnd.sel.value = o.closedEnd || "p1";
    showNodes.cb.checked = o.showNodes !== false;
    syncRows(m);
  }

  return { secStandingWave, syncStandingWave };
}
