/* ===== INSPECTOR SECTION — 구조식(bondgroup) =====
 *
 * 컨트롤 4개뿐이다: 분자 · 결합 길이 · 기호 크기 · 한글 이름.
 * 원자 배치와 결합 차수는 분자마다 고정이라(BOND_MOLECULES) 편집 대상이 아니다.
 *
 * 구조·주석·명명은 `js/inspector/section-legend.js` 의 selected()/commit()/sync()
 * 3함수 패턴을 그대로 따른다. 값의 뜻과 기본값은 docs/CHEM_PARTS_SPEC.md §5.
 *
 * 결합 길이·기호 크기는 **시안 좌표계(52×38) 기준 값**이라 mm 가 아니다 —
 * 상자를 키우면 같은 값이라도 같은 비율로 커진다. 그래서 단위를 붙이지 않는다.
 */

import { makeSection } from "./widgets.js?v=1.4.0";
import { BOND_MOLECULES, DEFAULT_MOLECULE } from "../render/bondgroup.js?v=1.4.0";

function row(labelText) {
  const r = document.createElement("div");
  r.className = "insp-row";
  const l = document.createElement("label");
  l.className = "insp-field-label";
  l.textContent = labelText;
  r.appendChild(l);
  return r;
}

function numRow(body, labelText, step, min, unit, title) {
  const r = row(labelText);
  const inp = document.createElement("input");
  inp.type = "number";
  inp.step = String(step);
  inp.min = String(min);
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

export function initBondGroupSection(state) {
  const content = document.getElementById("inspector-content");
  if (!content) return;

  const body = document.createElement("div");
  body.className = "insp-body";

  // ----- 분자 -----
  const molRow = row("분자");
  const molSel = document.createElement("select");
  molSel.className = "insp-input";
  Object.keys(BOND_MOLECULES).forEach((k) => {
    const o = document.createElement("option");
    o.value = k;
    o.textContent = `${k}  ${BOND_MOLECULES[k].ko}`;
    molSel.appendChild(o);
  });
  molRow.appendChild(molSel);
  molRow.title = "원자 배치와 단일·이중·삼중 결합이 분자마다 정해져 있습니다.";
  body.appendChild(molRow);

  // ----- 수치 -----
  const lenInp = numRow(body, "결합 길이", 0.5, 0.5, null,
    "원자 사이 거리입니다. 상자 크기에 비례하므로 mm 가 아닙니다.");
  const sizeInp = numRow(body, "기호 크기", 0.1, 0.5, null,
    "원소 기호와 그 뒤에 깔리는 흰 원의 크기입니다. 결합선은 이 크기만큼 떨어져 시작합니다.");

  // ----- 한글 이름 -----
  const koRow = row("한글 이름");
  const koCb = document.createElement("input");
  koCb.type = "checkbox";
  koRow.appendChild(koCb);
  koRow.title = "화학식 아래에 한글 분자 이름을 씁니다.";
  body.appendChild(koRow);

  const section = makeSection("구조식", body);
  section.style.display = "none";
  content.appendChild(section);

  function selected() {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1 || s.targetedId) return null;
    const o = s.objects.find((x) => x.id === ids[0]);
    return o && o.type === "bondgroup" ? o : null;
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

  molSel.addEventListener("change", () => {
    const v = Object.prototype.hasOwnProperty.call(BOND_MOLECULES, molSel.value)
      ? molSel.value : DEFAULT_MOLECULE;
    commit((t) => { t.molecule = v; });
  });
  lenInp.addEventListener("change", () => {
    const v = Number(lenInp.value);
    if (!isFinite(v) || v <= 0) return;
    commit((t) => { t.bondLength = v; });
  });
  sizeInp.addEventListener("change", () => {
    const v = Number(sizeInp.value);
    if (!isFinite(v) || v <= 0) return;
    commit((t) => { t.symbolSize = v; });
  });
  koCb.addEventListener("change", () => {
    commit((t) => { t.showKoreanName = koCb.checked; });
  });

  function sync() {
    const o = selected();
    if (!o) { section.style.display = "none"; return; }
    section.style.display = "";
    // 편집 중인 칸은 건드리지 않는다(입력 중 커서가 튀는 것 방지).
    if (document.activeElement !== molSel) {
      molSel.value = Object.prototype.hasOwnProperty.call(BOND_MOLECULES, o.molecule)
        ? o.molecule : DEFAULT_MOLECULE;
    }
    if (document.activeElement !== lenInp) lenInp.value = Number.isFinite(o.bondLength) ? o.bondLength : 8;
    if (document.activeElement !== sizeInp) sizeInp.value = Number.isFinite(o.symbolSize) ? o.symbolSize : 3.2;
    koCb.checked = o.showKoreanName !== false;
  }

  state.subscribe(sync);
  sync();
}
