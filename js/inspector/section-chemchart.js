/* ===== INSPECTOR SECTION — 막대·원그래프(chemchart) =====
 *
 * 구조는 section-legend.js 의 selected() / commit() / sync() 3함수 패턴 그대로다.
 * 명세: docs/CHEM_PARTS_SPEC.md §6 — 필드 이름·기본값은 거기서만 가져온다.
 *
 * 종류(kind) 를 맨 위에 두고, **고른 종류의 행만 보인다**.
 *   bar — 값 · 범주 이름 · 가로축 · 세로축 · 눈금값 점선
 *   pie — 값(비율) · 조각 이름 · 조각 색 · 하단 비율 · 둘레 눈금
 *
 * 조각 색은 값 개수만큼 `<input type="color">` 를 동적으로 만든다. 다만 sync() 마다
 * 새로 만들면 색을 고르는 도중에 상자가 새로 생겨 선택이 튄다 — 그래서 **개수가 달라졌을
 * 때만** 다시 만든다.
 */

import { makeSection } from "./widgets.js?v=1.3.0";
import { CHEMCHART_PIE_COLORS } from "../render/chemchart.js?v=1.3.0";

const KINDS = [["bar", "막대그래프"], ["pie", "원그래프"]];

function row(labelText) {
  const r = document.createElement("div");
  r.className = "insp-row";
  const l = document.createElement("label");
  l.className = "insp-field-label";
  l.textContent = labelText;
  r.appendChild(l);
  return r;
}

function textRow(labelText, placeholder, title) {
  const r = row(labelText);
  const inp = document.createElement("input");
  inp.type = "text";
  inp.className = "insp-input";
  if (placeholder) inp.placeholder = placeholder;
  r.appendChild(inp);
  if (title) r.title = title;
  return { row: r, inp };
}

function checkRow(labelText, title) {
  const r = row(labelText);
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.className = "insp-cb";
  r.appendChild(cb);
  if (title) r.title = title;
  return { row: r, cb };
}

/* "3,5,2,4" → 개수 세기용(렌더러의 파서와 같은 규칙) */
function countValues(src) {
  return String(src ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n)).length;
}

export function initChemChartSection(state) {
  const content = document.getElementById("inspector-content");
  if (!content) return;

  const body = document.createElement("div");
  body.className = "insp-body";

  // ----- 종류 (맨 위) -----
  const kindRow = row("종류");
  const kindSel = document.createElement("select");
  kindSel.className = "insp-input";
  KINDS.forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = t;
    kindSel.appendChild(o);
  });
  kindRow.appendChild(kindSel);
  body.appendChild(kindRow);

  // ----- 공통 -----
  const valuesF = textRow("값", "3,5,2,4",
    "쉼표로 끊어 씁니다.\n막대 개수·너비·간격이 값 개수에 맞춰 자동으로 잡힙니다.");
  const namesF = textRow("이름", "A,B,C,D", "값과 같은 순서로, 쉼표로 끊어 씁니다.");
  body.appendChild(valuesF.row);
  body.appendChild(namesF.row);

  // ----- bar 전용 -----
  const xTitleF = textRow("가로축", "물질", null);
  const yTitleF = textRow("세로축", "양(mol)", null);
  const guideF = checkRow("눈금값 점선", "막대 높이에서 세로축까지 점선을 긋고 값을 적습니다.");
  body.appendChild(xTitleF.row);
  body.appendChild(yTitleF.row);
  body.appendChild(guideF.row);

  // ----- pie 전용 -----
  const colorsRow = row("조각 색");
  colorsRow.style.alignItems = "center";
  colorsRow.title = "값 개수만큼 상자가 생깁니다.\n값이 색보다 많으면 색을 순서대로 다시 씁니다.";
  const colorsWrap = document.createElement("div");
  colorsWrap.style.display = "flex";
  colorsWrap.style.flexWrap = "wrap";
  colorsWrap.style.gap = "4px";
  colorsWrap.style.flex = "1";
  colorsRow.appendChild(colorsWrap);
  body.appendChild(colorsRow);

  const ratioF = checkRow("하단 비율", '조각 아래에 "1 : 3" 처럼 비율을 적습니다.');
  const tickF = checkRow("둘레 눈금", "원 둘레에 눈금 12개를 찍습니다.");
  body.appendChild(ratioF.row);
  body.appendChild(tickF.row);

  const section = makeSection("막대·원그래프", body);
  section.style.display = "none";
  content.appendChild(section);

  /* ---------- 3함수 패턴 ---------- */
  function selected() {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1 || s.targetedId) return null;
    const o = s.objects.find((x) => x.id === ids[0]);
    return o && o.type === "chemchart" ? o : null;
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

  /* 색 상자 — 개수가 달라졌을 때만 다시 만든다(고르는 중 튀지 않게). */
  function currentColors() {
    return Array.from(colorsWrap.children).map((inp) => inp.value);
  }

  function ensureColorInputs(count) {
    if (colorsWrap.children.length === count) return false;
    colorsWrap.textContent = "";
    for (let i = 0; i < count; i++) {
      const inp = document.createElement("input");
      inp.type = "color";
      inp.className = "insp-color";
      inp.style.width = "26px";
      inp.style.height = "20px";
      inp.style.padding = "0";
      inp.title = `${i + 1}번째 조각`;
      inp.addEventListener("change", () => {
        const arr = currentColors();
        commit((t) => { t.colors = arr; });
      });
      colorsWrap.appendChild(inp);
    }
    return true;
  }

  /* ---------- 입력 → 상태 ---------- */
  kindSel.addEventListener("change", () => {
    commit((t) => { t.kind = kindSel.value === "pie" ? "pie" : "bar"; });
  });
  valuesF.inp.addEventListener("change", () => {
    commit((t) => { t.values = valuesF.inp.value; });
  });
  namesF.inp.addEventListener("change", () => {
    commit((t) => { t.names = namesF.inp.value; });
  });
  xTitleF.inp.addEventListener("change", () => {
    commit((t) => { t.xTitle = xTitleF.inp.value; });
  });
  yTitleF.inp.addEventListener("change", () => {
    commit((t) => { t.yTitle = yTitleF.inp.value; });
  });
  guideF.cb.addEventListener("change", () => {
    commit((t) => { t.showGuide = guideF.cb.checked; });
  });
  ratioF.cb.addEventListener("change", () => {
    commit((t) => { t.showRatio = ratioF.cb.checked; });
  });
  tickF.cb.addEventListener("change", () => {
    commit((t) => { t.showTick = tickF.cb.checked; });
  });

  /* ---------- 상태 → 입력 ---------- */
  function sync() {
    const o = selected();
    if (!o) { section.style.display = "none"; return; }
    section.style.display = "";

    const kind = o.kind === "pie" ? "pie" : "bar";
    if (document.activeElement !== kindSel) kindSel.value = kind;
    if (document.activeElement !== valuesF.inp) valuesF.inp.value = o.values ?? "";
    if (document.activeElement !== namesF.inp) namesF.inp.value = o.names ?? "";
    if (document.activeElement !== xTitleF.inp) xTitleF.inp.value = o.xTitle ?? "";
    if (document.activeElement !== yTitleF.inp) yTitleF.inp.value = o.yTitle ?? "";
    guideF.cb.checked = o.showGuide !== false;
    ratioF.cb.checked = o.showRatio !== false;
    tickF.cb.checked = !!o.showTick;

    // 종류별 행 보이기
    const bar = kind === "bar";
    xTitleF.row.style.display = bar ? "" : "none";
    yTitleF.row.style.display = bar ? "" : "none";
    guideF.row.style.display = bar ? "" : "none";
    colorsRow.style.display = bar ? "none" : "";
    ratioF.row.style.display = bar ? "none" : "";
    tickF.row.style.display = bar ? "none" : "";
    valuesF.row.title = bar
      ? "쉼표로 끊어 씁니다.\n막대 개수·너비·간격이 값 개수에 맞춰 자동으로 잡힙니다."
      : "조각 비율입니다. 쉼표로 끊어 쓰면 색 상자 개수도 따라 늘어납니다.";

    if (!bar) {
      const n = countValues(o.values);
      const saved = Array.isArray(o.colors) ? o.colors : [];
      ensureColorInputs(n);
      // 값 상자는 편집 중일 수 있어 건드리지 않지만, 색 상자는 포커스된 것만 남긴다.
      Array.from(colorsWrap.children).forEach((inp, i) => {
        if (document.activeElement === inp) return;
        inp.value = saved[i] || CHEMCHART_PIE_COLORS[i % CHEMCHART_PIE_COLORS.length];
      });
    }
  }

  state.subscribe(sync);
  sync();
}
