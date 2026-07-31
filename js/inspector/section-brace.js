/* ===== INSPECTOR SECTION — 중괄호(brace) =====
 *
 * 묶는 구간(p1→p2)은 캔버스에서 두 끝점 핸들로 정한다. 여기서는 꼭짓점의 깊이와
 * 방향, 그리고 꼭짓점 바깥에 붙는 라벨을 다룬다(docs/BIO_PARTS_SPEC.md §1).
 *
 * section-groundarc.js 의 selected() / commit() / sync() 3함수 패턴을 그대로 따른다.
 */

import { makeSection } from "./widgets.js?v=1.4.0";

function row(labelText) {
  const r = document.createElement("div");
  r.className = "insp-row";
  const l = document.createElement("label");
  l.className = "insp-field-label";
  l.textContent = labelText;
  r.appendChild(l);
  return r;
}

export function initBraceSection(state) {
  const content = document.getElementById("inspector-content");
  if (!content) return;

  const body = document.createElement("div");
  body.className = "insp-body";

  /* ---- 깊이: 꼭짓점이 축에서 튀어나온 길이(mm) ---- */
  const depthRow = row("깊이");
  const depthInp = document.createElement("input");
  depthInp.type = "number";
  depthInp.step = "0.5";
  depthInp.min = "0.5";
  depthInp.className = "insp-input";
  const depthUnit = document.createElement("span");
  depthUnit.className = "insp-unit";
  depthUnit.textContent = "mm";
  depthRow.appendChild(depthInp);
  depthRow.appendChild(depthUnit);
  depthRow.title = "꼭짓점이 묶는 선에서 얼마나 튀어나올지 정합니다.";
  body.appendChild(depthRow);

  /* ---- 반대쪽: 꼭짓점 방향 뒤집기 ---- */
  const flipRow = row("반대쪽");
  const flipCb = document.createElement("input");
  flipCb.type = "checkbox";
  flipCb.className = "insp-cb";
  flipRow.appendChild(flipCb);
  flipRow.title = "꼭짓점이 반대편을 향하게 뒤집습니다.";
  body.appendChild(flipRow);

  /* ---- 라벨 ---- */
  const showRow = row("라벨 표시");
  const showCb = document.createElement("input");
  showCb.type = "checkbox";
  showCb.className = "insp-cb";
  showRow.appendChild(showCb);
  body.appendChild(showRow);

  const labelRow = row("라벨 글자");
  const labelInp = document.createElement("input");
  labelInp.type = "text";
  labelInp.className = "insp-input";
  labelRow.appendChild(labelInp);
  labelRow.title = "꼭짓점 바깥에 붙습니다.\n'물리량'으로 두면 t_1 처럼 아래첨자(_)·위첨자(^)가 변환됩니다.";
  body.appendChild(labelRow);

  const typeRow = row("라벨 종류");
  const typeSel = document.createElement("select");
  typeSel.className = "insp-input";
  [
    ["label", "라벨"],
    ["quantity", "물리량"],
  ].forEach(([value, text]) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = text;
    typeSel.appendChild(opt);
  });
  typeRow.appendChild(typeSel);
  body.appendChild(typeRow);

  const section = makeSection("중괄호", body);
  section.style.display = "none";
  content.appendChild(section);

  function selected() {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1 || s.targetedId) return null;
    const o = s.objects.find((x) => x.id === ids[0]);
    return o && o.type === "brace" ? o : null;
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

  depthInp.addEventListener("change", () => {
    const v = Number(depthInp.value);
    if (!isFinite(v) || v <= 0) return;
    commit((t) => { t.depth = v; });
  });
  flipCb.addEventListener("change", () => {
    commit((t) => { t.flipSide = flipCb.checked; });
  });
  showCb.addEventListener("change", () => {
    commit((t) => { t.showLabel = showCb.checked; });
  });
  labelInp.addEventListener("change", () => {
    commit((t) => { t.label = labelInp.value; });
  });
  typeSel.addEventListener("change", () => {
    const v = typeSel.value === "quantity" ? "quantity" : "label";
    commit((t) => { t.labelType = v; });
  });

  function sync() {
    const o = selected();
    if (!o) { section.style.display = "none"; return; }
    section.style.display = "";
    if (document.activeElement !== depthInp) depthInp.value = Number.isFinite(o.depth) ? o.depth : 5;
    flipCb.checked = !!o.flipSide;
    showCb.checked = !!o.showLabel;
    if (document.activeElement !== labelInp) labelInp.value = o.label ?? "";
    typeSel.value = o.labelType === "quantity" ? "quantity" : "label";
  }

  state.subscribe(sync);
  sync();
}
