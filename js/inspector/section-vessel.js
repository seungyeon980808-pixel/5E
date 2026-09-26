/* ===== INSPECTOR SECTION — 용기(vessel) =====
 *
 * 용기 종류를 바꾸면 액체가 그 도형 안쪽 모양을 그대로 따라간다(렌더러가 클립으로 처리).
 * 여기서는 종류·액면·색·피스톤 위치, 부속 5개(피스톤·고정장치·추·꼭지·눈금),
 * 내부 텍스트와 그 위치만 다룬다. 폭·높이·회전은 공용 [크기] 섹션이 맡는다.
 *
 * 필드 이름·기본값은 docs/CHEM_PARTS_SPEC.md §1 을 따른다.
 * selected() / commit() / sync() 3함수 패턴은 section-legend.js 와 같다.
 */

import { makeSection } from "./widgets.js?v=1.4.0";
import { VESSEL_KINDS } from "../render/vessel.js?v=1.4.0";

/* 한글 이름표 — 렌더러는 kind 문자열만 내보내므로 표시용 이름은 여기서 붙인다(명세 §1). */
const KIND_KO = {
  beaker: "비커",
  flask: "삼각플라스크",
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
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const t = s2.objects.find((x) => x.id === o.id);
      if (!t || t.locked) return;
      mut(t);
      s2.undoStack.push(snap);
      s2.redoStack = [];
    });
  }

  kindSel.addEventListener("change", () => {
    const v = VESSEL_KINDS.includes(kindSel.value) ? kindSel.value : "box";
    commit((t) => { t.kind = v; });
  });
  liquidInp.addEventListener("change", () => {
    const v = Number(liquidInp.value);
    if (!isFinite(v)) return;
    commit((t) => { t.liquid = Math.min(1, Math.max(0, v)); });
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
