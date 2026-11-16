/* ===== INSPECTOR SECTION — 용기(vessel) =====
 *
 * 용기 종류를 바꾸면 액체가 그 도형 안쪽 모양을 그대로 따라간다(렌더러가 클립으로 처리).
 * 여기서는 종류·액면·색·피스톤 위치, 부속 5개(피스톤·고정장치·추·꼭지·눈금),
 * 내부 텍스트와 그 위치만 다룬다. 폭·높이·회전은 공용 [크기] 섹션이 맡는다.
 *
 * 필드 이름·기본값은 docs/CHEM_PARTS_SPEC.md §1 을 따른다.
 * selected() / commit() / sync() 3함수 패턴은 section-legend.js 와 같다.
 */

import { jsonClone } from "../json-clone.js?v=1.7.0-four-session-integration";
import { EXAM_VESSEL_KINDS } from "../render/exam-illustration.js?v=1.7.0-four-session-integration";
import { makeSection } from "./widgets.js?v=1.7.0-four-session-integration";
import { vesselFill, volumeFractionAtHeight, VOLUME_KINDS } from "../science-geometry.js?v=1.7.0-four-session-integration";
import { VESSEL_KINDS } from "../render/vessel.js?v=1.7.0-four-session-integration";

/* 한글 이름표 — 렌더러는 kind 문자열만 내보내므로 표시용 이름은 여기서 붙인다(명세 §1). */
const KIND_KO = {
  beaker: "비커",
  flask: "삼각플라스크",
  round_flask: "둥근바닥 플라스크",
  tank: "칸막이 수조",
  test_tube: "시험관",
  cylinder_graduated: "눈금실린더",
  funnel: "깔때기",
  u_tube: "U자관",
  burette: "뷰렛",
  round: "원형 강철용기",
  box: "사각 용기(실린더)",
};

const TEXT_POSITIONS = [["top", "위"], ["middle", "중앙"], ["bottom", "아래"]];

/* 부속 체크박스 — [필드, 이름표, 툴팁] */
const PARTS = [
  ["hasPiston", "피스톤", "용기 안폭의 6% 두께인 가는 회색 띠로 그립니다."],
  ["hasFix", "고정장치 ▼", "피스톤을 붙잡는 검은 삼각형입니다. 벽이 수직인 종류에서만 나옵니다."],
  ["hasWeight", "추", "피스톤 위에 올려놓는 추입니다. 피스톤을 켜야 보입니다."],
  ["hasStopcock", "꼭지", "용기 위로 뻗는 관과 그 가운데 꼭지(스풀)를 그립니다."],
  ["hasTicks", "눈금", "안쪽 벽에 눈금을 긋습니다. 종류마다 눈금 수가 다릅니다."],
];

function row(labelText) {
  const r = document.createElement("div");
  r.className = "insp-row";
  const l = document.createElement("label");
  l.className = "insp-field-label";
  l.textContent = labelText;
  r.appendChild(l);
  return r;
}

function numRow(body, labelText, { step, min, max, unit, title }) {
  const r = row(labelText);
  const inp = document.createElement("input");
  inp.type = "number";
  inp.step = String(step);
  inp.min = String(min);
  inp.max = String(max);
  inp.className = "insp-input";
  r.appendChild(inp);
  if (unit) {
    const u = document.createElement("span");
    u.className = "insp-unit";
    u.textContent = unit;
    r.appendChild(u);
  }
  if (title) r.title = title;
  body.appendChild(r);
  return inp;
}

function selectRow(body, labelText, options, title) {
  const r = row(labelText);
  const sel = document.createElement("select");
  sel.className = "insp-input";
  options.forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v; o.textContent = t;
    sel.appendChild(o);
  });
  r.appendChild(sel);
  if (title) r.title = title;
  body.appendChild(r);
  return sel;
}

export function initVesselSection(state) {
  const content = document.getElementById("inspector-content");
  if (!content) return;

  const body = document.createElement("div");
  body.className = "insp-body";

  // ----- 용기 종류 -----
  const kindSel = selectRow(
    body, "용기 종류",
    VESSEL_KINDS.map((k) => [k, KIND_KO[k] || k]),
    "종류를 바꾸면 액체가 그 도형 안쪽 모양을 그대로 따라갑니다.",
  );

  const appearanceSel = selectRow(body, "그림 표현", [["diagram", "단면 도식(2D)"], ["exam", "입체 삽화(3D)"]]);
  const depthInp = numRow(body, "입체 깊이(비율)", { step: 0.01, min: 0.02, max: 0.3 });
  const fillModeSel = selectRow(body, "액체 설정", [["height", "액면 비율"], ["volume", "용량(mL)"]],
    "용량은 모식도의 단면으로 환산합니다. 그림 크기(mm)와 용량(mL)은 별도 설정입니다.");
  const capacityInp = numRow(body, "전체 용량", { step: 10, min: 0.1, max: 100000, unit: "mL" });
  const volumeInp = numRow(body, "액체량", { step: 1, min: 0, max: 100000, unit: "mL" });
  const stepInp = numRow(body, "눈금 간격", { step: 1, min: 0.01, max: 100000, unit: "mL",
    title: "최대 25개로 표시하며 촘촘한 눈금은 간격의 정수배로 줄입니다. 뷰렛은 위에서 0입니다." });
  const numberRowEl = row("눈금 숫자");
  const numbersCb = document.createElement("input"); numbersCb.type = "checkbox";
  numberRowEl.appendChild(numbersCb); body.appendChild(numberRowEl);
  const leftInp = numRow(body, "왼쪽 액면", { step: 0.02, min: 0, max: 1 });
  const rightInp = numRow(body, "오른쪽 액면", { step: 0.02, min: 0, max: 1 });
  const rightColorRow = row("오른쪽 용액 색");
  const rightColorInp = document.createElement("input"); rightColorInp.type = "color"; rightColorInp.className = "insp-input";
  rightColorRow.appendChild(rightColorInp); body.appendChild(rightColorRow);
  const partitionRow = row("칸막이");
  const partitionCb = document.createElement("input"); partitionCb.type = "checkbox";
  partitionRow.appendChild(partitionCb); body.appendChild(partitionRow);
  const partitionInp = numRow(body, "칸막이 위치", { step: 0.05, min: 0.05, max: 0.95 });
  const membraneRow = row("반투막");
  const membraneCb = document.createElement("input"); membraneCb.type = "checkbox";
  membraneRow.appendChild(membraneCb); body.appendChild(membraneRow);
  const valveInp = numRow(body, "꼭지 각도", { step: 90, min: 0, max: 90, unit: "°",
    title: "꼭지의 방향을 바꿉니다. 유체 흐름을 자동 계산하지 않습니다." });

  // ----- 액면 · 색 -----
  const liquidInp = numRow(body, "액면 높이", {
    step: 0.02, min: 0, max: 1,
    title: "0 이면 액체가 없고, 1 이면 안쪽 상자를 가득 채웁니다.",
  });

  const colorRow = row("용액 색");
  const colorInp = document.createElement("input");
  colorInp.type = "color";
  colorInp.className = "insp-input";
  colorRow.title = "기출은 무채색입니다(기본 #d9dcdf).";
  colorRow.appendChild(colorInp);
  body.appendChild(colorRow);

  // ----- 피스톤 위치 -----
  const pistonInp = numRow(body, "피스톤 위치", {
    step: 0.02, min: 0, max: 1,
    title: "0 이 바닥, 1 이 입구입니다. [부속]에서 피스톤을 켜야 보입니다.",
  });

  // ----- 부속 -----
  const partCbs = {};
  PARTS.forEach(([key, ko, title]) => {
    const r = row(ko);
    const cb = document.createElement("input");
    cb.type = "checkbox";
    r.appendChild(cb);
    r.title = title;
    body.appendChild(r);
    partCbs[key] = cb;
  });

  // ----- 내부 텍스트 -----
  const textRowEl = row("내부 텍스트");
  textRowEl.style.alignItems = "flex-start";
  const textTa = document.createElement("textarea");
  textTa.className = "insp-input";
  textTa.rows = 2;
  textTa.style.flex = "1";
  textTa.style.resize = "vertical";
  textTa.placeholder = "A(g) 2 mol\n1 L";
  textRowEl.title =
    "줄바꿈으로 여러 줄을 넣습니다.\n" +
    "아래첨자는 밑줄로: H_2O · 위첨자는 꺾쇠로: A^{2+}";
  textRowEl.appendChild(textTa);
  body.appendChild(textRowEl);

  const posSel = selectRow(body, "텍스트 위치", TEXT_POSITIONS, "안쪽 상자를 기준으로 위·중앙·아래에 놓습니다.");

  const section = makeSection("용기", body);
  section.style.display = "none";
  content.appendChild(section);

  function selected() {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1 || s.targetedId) return null;
    const o = s.objects.find((x) => x.id === ids[0]);
    return o && o.type === "vessel" ? o : null;
  }

  function commit(mut) {
    const s = state.get();
    const o = selected();
    if (!o || o.locked) return;
    const snap = jsonClone(s.objects);
    state.update((s2) => {
      const t = s2.objects.find((x) => x.id === o.id);
      if (!t || t.locked) return;
      mut(t);
      if (JSON.stringify(s2.objects) === JSON.stringify(snap)) return;
      s2.undoStack.push(snap);
      s2.redoStack = [];
    });
  }

  kindSel.addEventListener("change", () => {
    const v = VESSEL_KINDS.includes(kindSel.value) ? kindSel.value : "box";
    commit(t => { t.kind = v; if (!VOLUME_KINDS.includes(v)) t.fillMode = "height"; });
  });
  fillModeSel.addEventListener("change", () => commit(t => {
    const current = vesselFill(t);
    t.fillMode = VOLUME_KINDS.includes(t.kind) && fillModeSel.value === "volume" ? "volume" : "height";
    t.capacityMl = current.capacity;
    t.volumeMl = current.capacity * volumeFractionAtHeight(t.kind, current.height);
    t.liquid = current.height;
  }));
  function numeric(inp, apply) {
    inp.addEventListener("change", () => {
      if (!inp.value.trim()) return;
      const v = Number(inp.value); if (Number.isFinite(v)) commit(t => apply(t, v));
    });
  }
  appearanceSel.addEventListener("change", () => commit(t => { t.illustrationStyle = appearanceSel.value === "exam" ? "exam" : "diagram"; }));
  numeric(depthInp, (t, v) => { t.depthRatio = Math.max(0.02, Math.min(0.3, v)); });
  numeric(capacityInp, (t, v) => { t.capacityMl = Math.max(0.1, Math.min(100000, v));
    if (Number.isFinite(t.volumeMl)) t.volumeMl = Math.min(t.volumeMl, t.capacityMl); });
  numeric(volumeInp, (t, v) => { t.fillMode = "volume"; t.volumeMl = Math.max(0, Math.min(vesselFill(t).capacity, v)); });
  numeric(stepInp, (t, v) => { t.tickStepMl = Math.max(0.01, Math.min(100000, v)); });
  numbersCb.addEventListener("change", () => commit(t => { t.showTickNumbers = numbersCb.checked; }));
  numeric(leftInp, (t, v) => { t.leftLiquid = Math.max(0, Math.min(1, v)); });
  numeric(rightInp, (t, v) => { t.rightLiquid = Math.max(0, Math.min(1, v)); });
  numeric(partitionInp, (t, v) => { t.partitionAt = Math.max(0.05, Math.min(0.95, v)); });
  numeric(valveInp, (t, v) => { t.valveAngle = Math.max(0, Math.min(90, v)); });
  rightColorInp.addEventListener("change", () => commit(t => { t.rightLiquidColor = rightColorInp.value; }));
  partitionCb.addEventListener("change", () => commit(t => { t.hasPartition = partitionCb.checked; if(t.hasPartition) t.fillMode = "height"; }));
  membraneCb.addEventListener("change", () => commit(t => { t.hasMembrane = membraneCb.checked; }));
  liquidInp.addEventListener("change", () => {
    const v = Number(liquidInp.value);
    if (!isFinite(v)) return;
    commit(t => { t.liquid = Math.min(1, Math.max(0, v)); });
  });
  colorInp.addEventListener("change", () => {
    const v = colorInp.value;
    commit((t) => { t.liquidColor = v; });
  });
  pistonInp.addEventListener("change", () => {
    const v = Number(pistonInp.value);
    if (!isFinite(v)) return;
    commit((t) => { t.pistonAt = Math.min(1, Math.max(0, v)); });
  });
  PARTS.forEach(([key]) => {
    partCbs[key].addEventListener("change", () => {
      const on = partCbs[key].checked;
      commit((t) => { t[key] = on; });
    });
  });
  textTa.addEventListener("change", () => {
    const v = textTa.value;
    commit((t) => { t.text = v; });
  });
  posSel.addEventListener("change", () => {
    const v = posSel.value === "top" || posSel.value === "bottom" ? posSel.value : "middle";
    commit((t) => { t.textPos = v; });
  });

  function sync() {
    const o = selected();
    if (!o) { section.style.display = "none"; return; }
    section.style.display = "";
    const f = vesselFill(o), tank = o.kind === "tank", uTube = o.kind === "u_tube";
    const split = uTube || (tank && o.hasPartition);
    const calibrated = VOLUME_KINDS.includes(o.kind) && !split;
    const set = (inp, val) => { if (document.activeElement !== inp) inp.value = val; };
    const show = (inp, on) => { inp.closest(".insp-row").style.display = on ? "" : "none"; };
    set(appearanceSel, o.illustrationStyle === "exam" ? "exam" : "diagram"); show(appearanceSel, EXAM_VESSEL_KINDS.includes(o.kind));
    set(depthInp, o.depthRatio ?? 0.1); show(depthInp, tank && o.illustrationStyle === "exam");
    set(fillModeSel, o.fillMode === "volume" ? "volume" : "height"); show(fillModeSel, calibrated);
    set(capacityInp, f.capacity); show(capacityInp, calibrated);
    set(volumeInp, Number(f.volume.toFixed(3))); volumeInp.max = f.capacity;
    show(volumeInp, calibrated && o.fillMode === "volume");
    set(stepInp, o.tickStepMl ?? f.capacity / 5); show(stepInp, calibrated && o.hasTicks);
    numbersCb.checked = !!o.showTickNumbers; numberRowEl.style.display = calibrated && o.hasTicks ? "" : "none";
    show(liquidInp, !split && o.fillMode !== "volume");
    set(leftInp, o.leftLiquid ?? f.height); show(leftInp, split);
    set(rightInp, o.rightLiquid ?? f.height); show(rightInp, split);
    set(rightColorInp, o.rightLiquidColor || o.liquidColor || "#d9dcdf"); rightColorRow.style.display = split ? "" : "none";
    partitionCb.checked = !!o.hasPartition; partitionRow.style.display = tank ? "" : "none";
    set(partitionInp, o.partitionAt ?? 0.5); show(partitionInp, tank && o.hasPartition);
    membraneCb.checked = !!o.hasMembrane; membraneRow.style.display = uTube ? "" : "none";
    set(valveInp, o.valveAngle ?? 0); show(valveInp, !!o.hasStopcock || o.kind === "burette" && o.illustrationStyle === "exam");
    body.querySelectorAll("input, select, textarea").forEach(inp => { inp.disabled = !!o.locked; });
    // 편집 중인 칸은 건드리지 않는다(입력 중 커서가 튀는 것 방지 — section-legend.js 와 같다).
    if (document.activeElement !== kindSel) kindSel.value = VESSEL_KINDS.includes(o.kind) ? o.kind : "box";
    if (document.activeElement !== liquidInp) liquidInp.value = Number.isFinite(o.liquid) ? o.liquid : 0.34;
    if (document.activeElement !== colorInp) colorInp.value = o.liquidColor || "#d9dcdf";
    if (document.activeElement !== pistonInp) pistonInp.value = Number.isFinite(o.pistonAt) ? o.pistonAt : 0.66;
    PARTS.forEach(([key]) => { partCbs[key].checked = !!o[key]; });
    if (document.activeElement !== textTa) textTa.value = String(o.text ?? "");
    if (document.activeElement !== posSel) {
      posSel.value = o.textPos === "top" || o.textPos === "bottom" ? o.textPos : "middle";
    }
  }

  state.subscribe(sync);
  sync();
}
