/* ===== INSPECTOR SECTION — 원자·모형(chemmodel) =====
 *
 * 한 타입 안에 갈래(kind)가 5개(atom · shell · lattice · molecule · lewis) 있으므로
 * **kind 선택을 맨 위에 두고, 고른 갈래의 행만 보인다.** 나머지 행은 display:none 이라
 * 패널이 길어지지 않는다. 행마다 `kinds` 를 달아 두고 sync() 에서 한 번에 켜고 끈다.
 *
 * 구조는 section-legend.js 의 selected() / commit() / sync() 3함수 패턴 그대로.
 * 필드 이름·기본값은 docs/CHEM_PARTS_SPEC.md §2 에서만 가져온다.
 */

import { makeSection } from "./widgets.js?v=1.4.0";
import { MOLECULES, VALENCE, CHEMMODEL_KINDS } from "../render/chemmodel.js?v=1.4.0";

const KIND_LABELS = [
  ["atom", "원자 구슬"],
  ["shell", "전자 껍질"],
  ["lattice", "결정 격자"],
  ["molecule", "분자 모형"],
  ["lewis", "루이스 전자점식"],
];

const CELLS = [
  ["sc", "단순입방 (sc)"],
  ["bcc", "체심입방 (bcc)"],
  ["fcc", "면심입방 (fcc)"],
  ["graphite", "흑연 층상 구조"],
];

/* ----- 행 만들기 -----
 * kinds: 이 행이 보이는 갈래 목록. 비우면 항상 보인다.
 */
function row(body, labelText, kinds, title) {
  const r = document.createElement("div");
  r.className = "insp-row";
  const l = document.createElement("label");
  l.className = "insp-field-label";
  l.textContent = labelText;
  r.appendChild(l);
  if (title) r.title = title;
  r.dataset.kinds = (kinds || []).join(",");
  body.appendChild(r);
  return r;
}

function textRow(body, labelText, kinds, title, placeholder) {
  const r = row(body, labelText, kinds, title);
  const inp = document.createElement("input");
  inp.type = "text";
  inp.className = "insp-input";
  if (placeholder) inp.placeholder = placeholder;
  r.appendChild(inp);
  return inp;
}

function numRow(body, labelText, kinds, step, min, max, title) {
  const r = row(body, labelText, kinds, title);
  const inp = document.createElement("input");
  inp.type = "number";
  inp.step = String(step);
  inp.min = String(min);
  if (max != null) inp.max = String(max);
  inp.className = "insp-input";
  r.appendChild(inp);
  return inp;
}

function selectRow(body, labelText, kinds, options, title) {
  const r = row(body, labelText, kinds, title);
  const sel = document.createElement("select");
  sel.className = "insp-input";
  options.forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v; o.textContent = t;
    sel.appendChild(o);
  });
  r.appendChild(sel);
  return sel;
}

function checkRow(body, labelText, kinds, title) {
  const r = row(body, labelText, kinds, title);
  const cb = document.createElement("input");
  cb.type = "checkbox";
  r.appendChild(cb);
  return cb;
}

export function initChemModelSection(state) {
  const content = document.getElementById("inspector-content");
  if (!content) return;

  const body = document.createElement("div");
  body.className = "insp-body";

  // ----- 갈래 (항상 보임) -----
  const kindSel = selectRow(body, "갈래", [], KIND_LABELS, "원자·껍질·격자·분자·전자점식 중 무엇을 그릴지 고릅니다.");

  // ----- atom · shell · lewis 공용: 원소 기호 -----
  const symInp = textRow(
    body, "원소 기호", ["atom", "shell", "lewis"],
    `전자점식에서는 원자가 전자 수가 자동으로 정해집니다(${Object.keys(VALENCE).join(" ")}).\n표에 없는 기호는 4개로 봅니다.`,
    "O"
  );

  // ----- atom -----
  const shadeCb = checkRow(body, "입체 음영", ["atom"], "기출의 원자는 평면 원이 아니라 하이라이트가 있는 구입니다. 끄면 평면 회색 원이 됩니다.");

  // ----- shell -----
  const shellsInp = textRow(body, "껍질 배치", ["shell"], "“2,8,2”처럼 넣으면 껍질 수와 전자 각도가 자동 배분됩니다.", "2,8,2");
  const dashedCb = checkRow(body, "껍질 점선", ["shell"], "껍질 원을 점선으로 그립니다.");

  // ----- lattice -----
  const cellSel = selectRow(body, "구조", ["lattice"], CELLS, null);
  const ballInp = numRow(body, "구슬 크기", ["lattice"], 0.1, 0.5, 3.4, "공-막대 보기의 구슬 반지름입니다(잘린 보기에서는 구조별 접촉 반지름을 씁니다).");
  const edgeCb = checkRow(body, "모서리", ["lattice"], "단위 격자의 모서리를 그립니다. 뒤로 가려지는 모서리는 점선입니다.");
  const cutCb = checkRow(body, "잘린 보기", ["lattice"], "공간채움 절단면입니다 — 보이는 면 3개에 잘린 단면(사분원·원)이 평평하게 보입니다.");

  // ----- molecule -----
  const molSel = selectRow(
    body, "분자", ["molecule"],
    Object.keys(MOLECULES).map((k) => [k, `${k}  ${MOLECULES[k].ko}`]),
    "분자를 바꾸면 결합각도 그 분자의 기본값으로 되돌아갑니다."
  );
  const angInp = numRow(body, "결합각", ["molecule"], 0.5, 60, 180, "굽은형·삼각뿔형처럼 각이 있는 분자에서만 모양이 바뀝니다.");
  const bondInp = numRow(body, "결합 길이", ["molecule"], 0.5, 3, 14, "중심 원자와 리간드 사이 거리입니다(부품 좌표 기준).");
  const geoCb = checkRow(body, "구조 이름", ["molecule"], "화학식 아래에 한글 이름과 구조 이름을 넣습니다.");

  // ----- lewis -----
  const bracketCb = checkRow(body, "대괄호 [ ]", ["lewis"], "이온을 나타낼 때 씁니다.");
  const chargeInp = textRow(body, "전하", ["lewis"], "대괄호를 켰을 때 오른쪽 위에 붙습니다. 예) 2-", "2-");

  const rows = Array.from(body.querySelectorAll(".insp-row"));

  const section = makeSection("원자·모형", body);
  section.style.display = "none";
  content.appendChild(section);

  function selected() {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1 || s.targetedId) return null;
    const o = s.objects.find((x) => x.id === ids[0]);
    return o && o.type === "chemmodel" ? o : null;
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
    const v = CHEMMODEL_KINDS.includes(kindSel.value) ? kindSel.value : "atom";
    commit((t) => { t.kind = v; });
  });
  symInp.addEventListener("change", () => {
    const v = symInp.value.trim();
    commit((t) => { t.symbol = v; });
  });
  shadeCb.addEventListener("change", () => commit((t) => { t.shade = shadeCb.checked; }));

  shellsInp.addEventListener("change", () => {
    const v = shellsInp.value.trim();
    commit((t) => { t.shells = v; });
  });
  dashedCb.addEventListener("change", () => commit((t) => { t.dashedShell = dashedCb.checked; }));

  cellSel.addEventListener("change", () => commit((t) => { t.cell = cellSel.value; }));
  ballInp.addEventListener("change", () => {
    const v = Number(ballInp.value);
    if (!isFinite(v) || v <= 0) return;
    commit((t) => { t.ballRadius = v; });
  });
  edgeCb.addEventListener("change", () => commit((t) => { t.showEdge = edgeCb.checked; }));
  cutCb.addEventListener("change", () => commit((t) => { t.cut = cutCb.checked; }));

  molSel.addEventListener("change", () => {
    const key = MOLECULES[molSel.value] ? molSel.value : "H2O";
    // 시안과 같게 — 분자를 고르면 결합각도 그 분자의 기본값으로 따라간다.
    const ang = MOLECULES[key].ang || 180;
    commit((t) => { t.molecule = key; t.bondAngle = ang; });
  });
  angInp.addEventListener("change", () => {
    const v = Number(angInp.value);
    if (!isFinite(v) || v < 30 || v > 180) return;
    commit((t) => { t.bondAngle = v; });
  });
  bondInp.addEventListener("change", () => {
    const v = Number(bondInp.value);
    if (!isFinite(v) || v <= 0) return;
    commit((t) => { t.bondLength = v; });
  });
  geoCb.addEventListener("change", () => commit((t) => { t.showGeoLabel = geoCb.checked; }));

  bracketCb.addEventListener("change", () => commit((t) => { t.bracket = bracketCb.checked; }));
  chargeInp.addEventListener("change", () => {
    const v = chargeInp.value.trim();
    commit((t) => { t.charge = v; });
  });

  function sync() {
    const o = selected();
    if (!o) { section.style.display = "none"; return; }
    section.style.display = "";

    const kind = CHEMMODEL_KINDS.includes(o.kind) ? o.kind : "atom";
    // 고른 갈래의 행만 보인다(kinds 가 비면 항상 보임).
    rows.forEach((r) => {
      const list = r.dataset.kinds ? r.dataset.kinds.split(",") : [];
      r.style.display = !list.length || list.includes(kind) ? "" : "none";
    });

    // 편집 중인 칸은 건드리지 않는다(입력 중 커서가 튀는 것 방지).
    if (document.activeElement !== kindSel) kindSel.value = kind;
    if (document.activeElement !== symInp) {
      symInp.value = o.symbol ?? (kind === "shell" ? "Mg" : "O");
    }
    shadeCb.checked = o.shade !== false;

    if (document.activeElement !== shellsInp) shellsInp.value = o.shells ?? "2,8,2";
    dashedCb.checked = o.dashedShell !== false;

    if (document.activeElement !== cellSel) cellSel.value = o.cell || "fcc";
    if (document.activeElement !== ballInp) ballInp.value = Number.isFinite(o.ballRadius) ? o.ballRadius : 2.0;
    edgeCb.checked = o.showEdge !== false;
    cutCb.checked = !!o.cut;

    const molKey = MOLECULES[o.molecule] ? o.molecule : "H2O";
    if (document.activeElement !== molSel) molSel.value = molKey;
    if (document.activeElement !== angInp) {
      angInp.value = Number.isFinite(o.bondAngle) ? o.bondAngle : (MOLECULES[molKey].ang || 180);
    }
    if (document.activeElement !== bondInp) bondInp.value = Number.isFinite(o.bondLength) ? o.bondLength : 9;
    geoCb.checked = o.showGeoLabel !== false;

    bracketCb.checked = !!o.bracket;
    if (document.activeElement !== chargeInp) chargeInp.value = o.charge ?? "";
  }

  state.subscribe(sync);
  sync();
}
