/* ===== INSPECTOR SECTION — 오비탈(orbital) =====
 *
 * 한 타입에 갈래가 둘이라 **종류(kind) 셀렉트를 맨 위**에 두고, 고른 갈래의 행만 보인다.
 * 안 쓰는 행을 회색으로 비활성화하는 대신 아예 숨긴다 — 패널이 짧아야 화면이 안 밀린다.
 *
 *   box    전자 수 · 오비탈 이름 표시
 *   shape  모양(s·pz·px·py) · 3축 · 마디면 · 기호
 *
 * 구조는 section-legend.js 의 selected() / commit() / sync() 3함수 패턴 그대로다.
 * 명세: docs/CHEM_PARTS_SPEC.md §4 — 필드 이름·기본값은 거기서만 가져온다.
 */

import { makeSection } from "./widgets.js?v=1.3.0";
import { ORBITAL_CAPACITY } from "../render/orbital.js?v=1.3.0";

const KINDS = [["box", "오비탈 상자"], ["shape", "오비탈 모양"]];
const SHAPES = [
  ["s", "s 오비탈 (구형)"],
  ["pz", "p 오비탈 (z축)"],
  ["px", "p 오비탈 (x축)"],
  ["py", "p 오비탈 (y축·깊이)"],
];

function row(labelText, title) {
  const r = document.createElement("div");
  r.className = "insp-row";
  const l = document.createElement("label");
  l.className = "insp-field-label";
  l.textContent = labelText;
  r.appendChild(l);
  if (title) r.title = title;
  return r;
}

function selectRow(labelText, options, title) {
  const r = row(labelText, title);
  const sel = document.createElement("select");
  sel.className = "insp-input";
  options.forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v; o.textContent = t;
    sel.appendChild(o);
  });
  r.appendChild(sel);
  return { row: r, sel };
}

function numberRow(labelText, { step, min, max, unit, title }) {
  const r = row(labelText, title);
  const inp = document.createElement("input");
  inp.type = "number";
  inp.className = "insp-input";
  if (step != null) inp.step = String(step);
  if (min != null) inp.min = String(min);
  if (max != null) inp.max = String(max);
  r.appendChild(inp);
  if (unit) {
    const u = document.createElement("span");
    u.className = "insp-unit";
    u.textContent = unit;
    r.appendChild(u);
  }
  return { row: r, inp };
}

function checkRow(labelText, title) {
  const r = row(labelText, title);
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.className = "insp-cb";
  r.appendChild(cb);
  return { row: r, cb };
}

export function initOrbitalSection(state) {
  const content = document.getElementById("inspector-content");
  if (!content) return;

  const body = document.createElement("div");
  body.className = "insp-body";

  // ----- 종류 (맨 위) -----
  const kindF = selectRow("종류", KINDS, "오비탈 상자(전자 배치)와 오비탈 모양(공간 그림) 중 고릅니다.");
  body.appendChild(kindF.row);

  // ----- kind:"box" -----
  const elecF = numberRow("전자 수", {
    step: 1, min: 1, max: ORBITAL_CAPACITY,
    title: `전자 수만 넣으면 아우프바우·훈트 규칙대로 스핀 화살표가 채워집니다.\n1s · 2s · 2p · 3s · 3p 순서, 최대 ${ORBITAL_CAPACITY}개.`,
  });
  body.appendChild(elecF.row);

  const labF = checkRow("오비탈 이름", "칸 아래에 1s · 2s · 2p … 이름을 붙입니다.");
  body.appendChild(labF.row);

  // ----- kind:"shape" -----
  const shapeF = selectRow("모양", SHAPES, "p 오비탈은 두 로브가 핵에서 만나는 물방울꼴입니다.");
  body.appendChild(shapeF.row);

  const axisF = checkRow("3축", "x · z · y 세 축을 함께 그립니다.");
  body.appendChild(axisF.row);

  const nodeF = checkRow("마디면", "전자 밀도가 0인 마디면을 점선으로 표시합니다.");
  body.appendChild(nodeF.row);

  const symF = checkRow("기호", "s · p_z 같은 오비탈 기호(와 축 이름)를 표시합니다.");
  body.appendChild(symF.row);

  const BOX_ROWS = [elecF.row, labF.row];
  const SHAPE_ROWS = [shapeF.row, axisF.row, nodeF.row, symF.row];

  const section = makeSection("오비탈", body);
  section.style.display = "none";
  content.appendChild(section);

  function selected() {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1 || s.targetedId) return null;
    const o = s.objects.find((x) => x.id === ids[0]);
    return o && o.type === "orbital" ? o : null;
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

  kindF.sel.addEventListener("change", () => {
    commit((t) => { t.kind = kindF.sel.value === "box" ? "box" : "shape"; });
  });
  elecF.inp.addEventListener("change", () => {
    const v = Math.round(Number(elecF.inp.value));
    if (!isFinite(v) || v < 1) return;
    commit((t) => { t.electrons = Math.min(ORBITAL_CAPACITY, v); });
  });
  labF.cb.addEventListener("change", () => {
    commit((t) => { t.showOrbitalLabels = labF.cb.checked; });
  });
  shapeF.sel.addEventListener("change", () => {
    commit((t) => { t.orbital = shapeF.sel.value; });
  });
  axisF.cb.addEventListener("change", () => {
    commit((t) => { t.showAxis = axisF.cb.checked; });
  });
  nodeF.cb.addEventListener("change", () => {
    commit((t) => { t.showNode = nodeF.cb.checked; });
  });
  symF.cb.addEventListener("change", () => {
    commit((t) => { t.showSymbol = symF.cb.checked; });
  });

  function sync() {
    const o = selected();
    if (!o) { section.style.display = "none"; return; }
    section.style.display = "";

    const isBox = o.kind === "box";
    if (document.activeElement !== kindF.sel) kindF.sel.value = isBox ? "box" : "shape";
    BOX_ROWS.forEach((r) => { r.style.display = isBox ? "" : "none"; });
    SHAPE_ROWS.forEach((r) => { r.style.display = isBox ? "none" : ""; });

    if (isBox) {
      // 편집 중인 칸은 건드리지 않는다(입력 중 커서가 튀는 것 방지).
      if (document.activeElement !== elecF.inp) {
        elecF.inp.value = Number.isFinite(o.electrons) ? o.electrons : 8;
      }
      labF.cb.checked = o.showOrbitalLabels !== false;
    } else {
      if (document.activeElement !== shapeF.sel) {
        shapeF.sel.value = SHAPES.some(([v]) => v === o.orbital) ? o.orbital : "pz";
      }
      axisF.cb.checked = o.showAxis !== false;
      nodeF.cb.checked = o.showNode !== false;
      symF.cb.checked = o.showSymbol !== false;
    }
  }

  state.subscribe(sync);
  sync();
}
