/* ===== INSPECTOR SECTION — 주기율표(periodic) =====
 *
 * 컨트롤은 시안(docs/chem-parts-proposal.html §A3)의 네 가지를 그대로 옮겼다.
 *   주기 범위 · 강조 원소 · 강조 기호 바꾸기 · 표현(원자번호 / 금속 음영)
 *
 * 강조는 **원소 기호를 쉼표로** 적는다("Na,Cl"). 여기에 강조 기호를 "X,Y" 로 넣으면
 * 그 칸이 수능 화학1 단골인 **가상 원소 문제 형태**(X·Y)로 바뀐다 — 순서대로 대응하고,
 * 대응되지 않은 칸은 진짜 기호를 그대로 쓴다.
 *
 * 필드 이름·기본값은 docs/CHEM_PARTS_SPEC.md §10 을 따른다.
 * 구조(selected/commit/sync 3함수)는 section-legend.js 와 동일하다.
 */

import { makeSection } from "./widgets.js?v=1.4.0";

const PERIOD_OPTIONS = [
  ["2", "1~2주기"],
  ["3", "1~3주기"],
  ["4", "1~4주기(K·Ca)"],
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

function textRow(body, labelText, placeholder, title) {
  const r = row(labelText);
  const inp = document.createElement("input");
  inp.type = "text";
  inp.className = "insp-input";
  inp.style.flex = "1";
  if (placeholder) inp.placeholder = placeholder;
  r.appendChild(inp);
  if (title) r.title = title;
  body.appendChild(r);
  return inp;
}

function checkRow(body, labelText, title) {
  const r = row(labelText);
  const cb = document.createElement("input");
  cb.type = "checkbox";
  r.appendChild(cb);
  if (title) r.title = title;
  body.appendChild(r);
  return cb;
}

/* 입력을 "Na,Cl" 꼴로 정리한다(공백 구분도 받아 준다). */
function normList(text) {
  return String(text ?? "").split(/[,\s]+/).filter(Boolean).join(",");
}

export function initPeriodicSection(state) {
  const content = document.getElementById("inspector-content");
  if (!content) return;

  const body = document.createElement("div");
  body.className = "insp-body";

  // ----- 주기 범위 -----
  const perRow = row("주기 범위");
  const perSel = document.createElement("select");
  perSel.className = "insp-input";
  PERIOD_OPTIONS.forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v; o.textContent = t;
    perSel.appendChild(o);
  });
  perRow.appendChild(perSel);
  perRow.title = "표에 나오는 주기를 자릅니다. 전이금속은 없습니다.";
  body.appendChild(perRow);

  // ----- 강조 -----
  const hlInp = textRow(body, "강조 원소", "Na,Cl", "강조할 원소 기호를 쉼표로 적습니다. 예) Na,Cl");
  const subInp = textRow(
    body, "강조 기호 바꾸기", "X,Y",
    "강조한 칸의 기호를 가상 기호로 바꿔 씁니다(순서대로).\n예) 강조 원소 Na,Cl + 강조 기호 X,Y → 그 칸이 X·Y 로 나옵니다."
  );

  // ----- 표현 -----
  const zCb = checkRow(body, "원자번호", "칸 왼쪽 위에 작은 원자번호를 넣습니다.");
  const metalCb = checkRow(body, "금속 음영", "금속 원소 칸을 옅은 회색으로 칠합니다.");

  const section = makeSection("주기율표", body);
  section.style.display = "none";
  content.appendChild(section);

  function selected() {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1 || s.targetedId) return null;
    const o = s.objects.find((x) => x.id === ids[0]);
    return o && o.type === "periodic" ? o : null;
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

  perSel.addEventListener("change", () => {
    const v = Number(perSel.value);
    commit((t) => { t.periods = (v === 2 || v === 3) ? v : 4; });
  });
  hlInp.addEventListener("change", () => {
    const v = normList(hlInp.value);
    commit((t) => { t.highlight = v; });
  });
  subInp.addEventListener("change", () => {
    const v = normList(subInp.value);
    commit((t) => { t.highlightSymbols = v; });
  });
  zCb.addEventListener("change", () => {
    commit((t) => { t.showZ = zCb.checked; });
  });
  metalCb.addEventListener("change", () => {
    commit((t) => { t.metalShade = metalCb.checked; });
  });

  function sync() {
    const o = selected();
    if (!o) { section.style.display = "none"; return; }
    section.style.display = "";
    // 편집 중인 칸은 건드리지 않는다(입력 중 커서가 튀는 것 방지 — section-legend.js 와 동일).
    const p = Number(o.periods);
    if (document.activeElement !== perSel) perSel.value = (p === 2 || p === 3) ? String(p) : "4";
    if (document.activeElement !== hlInp) hlInp.value = String(o.highlight ?? "");
    if (document.activeElement !== subInp) subInp.value = String(o.highlightSymbols ?? "");
    zCb.checked = o.showZ !== false;
    metalCb.checked = !!o.metalShade;
  }

  state.subscribe(sync);
  sync();
}
