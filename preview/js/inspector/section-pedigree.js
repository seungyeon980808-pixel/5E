/* ===== INSPECTOR SECTION — 가계도(pedigree) =====
 *
 * 위치·크기는 크기박스(x, y, w, h)라 공용 기하 섹션이 다룬다. 여기서는 가계 구성과
 * 표기만 다룬다: 세대별 자녀 수, 3세대를 낳는 자녀의 순번, 기호 크기, 번호 표시,
 * 발현·보인자 번호와 그 채우기.
 *
 * 번호는 그린 순서대로 1부터 매겨진다(1세대 부부 1·2 → 2세대 자녀 → 2세대 배우자 →
 * 3세대 자녀). 발현/보인자 칸에는 그 번호를 쉼표로 적는다 — "1,4,6".
 *
 * 3세대 자녀 수가 0이면 3세대가 아예 없으므로 '3세대 부모 순번' 칸은 숨긴다.
 *
 * selected() / commit() / sync() 3함수 패턴은 section-groundarc.js를 그대로 따른다.
 */

import { makeSection } from "./widgets.js?v=1.4.0";

const FILL_OPTIONS = [
  ["hatch", "빗금"],
  ["cross", "빗금(교차)"],
  ["gray", "회색"],
  ["solid", "흰색"],
];

export function initPedigreeSection(state) {
  const content = document.getElementById("inspector-content");
  if (!content) return;

  const body = document.createElement("div");
  body.className = "insp-body";

  function row(labelText, title) {
    const r = document.createElement("div");
    r.className = "insp-row";
    const l = document.createElement("label");
    l.className = "insp-field-label";
    l.textContent = labelText;
    r.appendChild(l);
    if (title) r.title = title;
    body.appendChild(r);
    return r;
  }

  function numField(labelText, { min, max, step = "1", unit = null, title = null }) {
    const r = row(labelText, title);
    const inp = document.createElement("input");
    inp.type = "number";
    inp.className = "insp-input";
    inp.min = String(min);
    inp.max = String(max);
    inp.step = step;
    r.appendChild(inp);
    if (unit) {
      const u = document.createElement("span");
      u.className = "insp-unit";
      u.textContent = unit;
      r.appendChild(u);
    }
    return { row: r, input: inp };
  }

  function textField(labelText, title) {
    const r = row(labelText, title);
    const inp = document.createElement("input");
    inp.type = "text";
    inp.className = "insp-input";
    inp.placeholder = "1,4,6";
    r.appendChild(inp);
    return inp;
  }

  function selectField(labelText, title) {
    const r = row(labelText, title);
    const sel = document.createElement("select");
    sel.className = "insp-input";
    FILL_OPTIONS.forEach(([v, t]) => {
      const op = document.createElement("option");
      op.value = v; op.textContent = t;
      sel.appendChild(op);
    });
    r.appendChild(sel);
    return sel;
  }

  const gen2 = numField("2세대 자녀 수", { min: 1, max: 12, title: "1세대 부부가 낳은 자녀 수입니다." });
  const gen3 = numField("3세대 자녀 수", { min: 0, max: 12, title: "0으로 두면 3세대를 그리지 않습니다." });
  const gen3p = numField("3세대 부모 순번", { min: 0, max: 11, title: "3세대를 낳는 2세대 자녀의 순번입니다.\n왼쪽 첫째가 0입니다." });
  const radius = numField("기호 크기", { min: 0.6, max: 20, step: "0.2", unit: "mm", title: "네모·원의 반지름입니다." });

  const numRow = row("번호 표시", "기호 바로 아래에 번호를 씁니다.\n발현·보인자 칸에 적는 번호가 이것입니다.");
  const numCb = document.createElement("input");
  numCb.type = "checkbox";
  numRow.appendChild(numCb);

  const affInp = textField("발현 번호", "발현된 개체의 번호를 쉼표로 적습니다. 예) 1,4,6");
  const affSel = selectField("발현 채우기", "발현 개체 기호를 채울 무늬입니다.");
  const carInp = textField("보인자 번호", "보인자 개체의 번호를 쉼표로 적습니다. 예) 2,5");
  const carSel = selectField("보인자 채우기", "보인자 개체 기호를 채울 무늬입니다.");

  const section = makeSection("가계도", body);
  section.style.display = "none";
  content.appendChild(section);

  function selected() {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1 || s.targetedId) return null;
    const o = s.objects.find((x) => x.id === ids[0]);
    return o && o.type === "pedigree" ? o : null;
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

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  gen2.input.addEventListener("change", () => {
    const v = Math.round(Number(gen2.input.value));
    if (!Number.isFinite(v)) return;
    const n = clamp(v, 1, 12);
    commit((t) => {
      t.gen2Kids = n;
      // 자녀가 줄면 3세대 부모 순번이 범위를 벗어날 수 있다 — 같이 당겨 준다.
      if ((t.gen3Parent ?? 0) > n - 1) t.gen3Parent = n - 1;
    });
  });

  gen3.input.addEventListener("change", () => {
    const v = Math.round(Number(gen3.input.value));
    if (!Number.isFinite(v)) return;
    commit((t) => { t.gen3Kids = clamp(v, 0, 12); });
  });

  gen3p.input.addEventListener("change", () => {
    const v = Math.round(Number(gen3p.input.value));
    if (!Number.isFinite(v)) return;
    commit((t) => { t.gen3Parent = clamp(v, 0, Math.max(0, (t.gen2Kids ?? 3) - 1)); });
  });

  radius.input.addEventListener("change", () => {
    const v = Number(radius.input.value);
    if (!Number.isFinite(v) || v <= 0) return;
    commit((t) => { t.symbolRadius = clamp(v, 0.6, 20); });
  });

  numCb.addEventListener("change", () => {
    commit((t) => { t.showNumbers = numCb.checked; });
  });

  affInp.addEventListener("change", () => {
    const v = affInp.value;
    commit((t) => { t.affected = v; });
  });
  affSel.addEventListener("change", () => {
    commit((t) => { t.affectedFill = affSel.value; });
  });
  carInp.addEventListener("change", () => {
    const v = carInp.value;
    commit((t) => { t.carrier = v; });
  });
  carSel.addEventListener("change", () => {
    commit((t) => { t.carrierFill = carSel.value; });
  });

  function sync() {
    const o = selected();
    if (!o) { section.style.display = "none"; return; }
    section.style.display = "";

    const n2 = Number.isFinite(o.gen2Kids) ? o.gen2Kids : 3;
    const n3 = Number.isFinite(o.gen3Kids) ? o.gen3Kids : 0;

    if (document.activeElement !== gen2.input) gen2.input.value = n2;
    if (document.activeElement !== gen3.input) gen3.input.value = n3;

    // 3세대가 없으면 '3세대 부모 순번'은 뜻이 없으므로 숨긴다.
    gen3p.row.style.display = n3 > 0 ? "" : "none";
    gen3p.input.max = String(Math.max(0, n2 - 1));
    if (document.activeElement !== gen3p.input) gen3p.input.value = Number.isFinite(o.gen3Parent) ? o.gen3Parent : 0;

    if (document.activeElement !== radius.input) {
      radius.input.value = Number.isFinite(o.symbolRadius) ? o.symbolRadius : 2.6;
    }
    numCb.checked = o.showNumbers !== false;

    if (document.activeElement !== affInp) affInp.value = o.affected ?? "";
    if (document.activeElement !== carInp) carInp.value = o.carrier ?? "";
    affSel.value = o.affectedFill || "hatch";
    carSel.value = o.carrierFill || "gray";
  }

  state.subscribe(sync);
  sync();
}
