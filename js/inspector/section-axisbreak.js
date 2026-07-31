/* ===== INSPECTOR SECTION — 축 생략 물결(axisbreak) =====
 *
 * 컨트롤은 넷뿐이다: 방향 · 물결 크기 · 두 줄 간격 · 물결 주기.
 * 자르는 **길이**는 상자(w·h)를 끌어서 정하므로 여기서 다루지 않는다.
 * 나머지 세 수치는 mm 절대값이라 상자를 키워도 물결 모양은 그대로다.
 *
 * 필드 이름·기본값은 docs/CHEM_PARTS_SPEC.md §7 을 따른다.
 * 구조는 js/inspector/section-legend.js 의 selected() / commit() / sync() 3함수 패턴.
 */

import { makeSection } from "./widgets.js?v=1.3.0";

const DIRECTIONS = [["horizontal", "가로로 자르기"], ["vertical", "세로로 자르기"]];

const DEF_AMP = 0.5;
const DEF_GAP = 1.6;
const DEF_PERIOD = 3.0;

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

export function initAxisBreakSection(state) {
  const content = document.getElementById("inspector-content");
  if (!content) return;

  const body = document.createElement("div");
  body.className = "insp-body";

  // ----- 방향 -----
  const dirRow = row("방향");
  const dirSel = document.createElement("select");
  dirSel.className = "insp-input";
  DIRECTIONS.forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v; o.textContent = t;
    dirSel.appendChild(o);
  });
  dirRow.appendChild(dirSel);
  dirRow.title =
    "가로로 자르기: 세로축의 중간을 생략할 때(물결이 가로로 지나갑니다).\n" +
    "세로로 자르기: 가로축의 중간을 생략할 때.";
  body.appendChild(dirRow);

  // ----- 수치 (전부 mm 절대값 — 상자를 키워도 물결 모양은 그대로) -----
  const ampInp = numRow(body, "물결 크기", 0.05, 0.05, "mm", "물결이 위아래로 흔들리는 폭(진폭)입니다.");
  const gapInp = numRow(body, "두 줄 간격", 0.1, 0.1, "mm", "물결 두 줄 사이의 거리입니다. 이 사이가 흰색으로 덮여 아래 그래프를 가립니다.");
  const perInp = numRow(body, "물결 주기", 0.1, 0.2, "mm", "물결 한 마디의 길이입니다. 작을수록 잔물결이 됩니다.");

  const section = makeSection("축 생략", body);
  section.style.display = "none";
  content.appendChild(section);

  function selected() {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1 || s.targetedId) return null;
    const o = s.objects.find((x) => x.id === ids[0]);
    return o && o.type === "axisbreak" ? o : null;
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

  dirSel.addEventListener("change", () => {
    commit((t) => { t.dir = dirSel.value === "vertical" ? "vertical" : "horizontal"; });
  });
  ampInp.addEventListener("change", () => {
    const v = Number(ampInp.value);
    if (!isFinite(v) || v <= 0) return;
    commit((t) => { t.amp = v; });
  });
  gapInp.addEventListener("change", () => {
    const v = Number(gapInp.value);
    if (!isFinite(v) || v <= 0) return;
    commit((t) => { t.gap = v; });
  });
  perInp.addEventListener("change", () => {
    const v = Number(perInp.value);
    if (!isFinite(v) || v <= 0) return;
    commit((t) => { t.period = v; });
  });

  function sync() {
    const o = selected();
    if (!o) { section.style.display = "none"; return; }
    section.style.display = "";
    // 편집 중인 칸은 건드리지 않는다(입력 중 커서가 튀는 것 방지).
    if (document.activeElement !== dirSel) dirSel.value = o.dir === "vertical" ? "vertical" : "horizontal";
    if (document.activeElement !== ampInp) ampInp.value = Number.isFinite(o.amp) ? o.amp : DEF_AMP;
    if (document.activeElement !== gapInp) gapInp.value = Number.isFinite(o.gap) ? o.gap : DEF_GAP;
    if (document.activeElement !== perInp) perInp.value = Number.isFinite(o.period) ? o.period : DEF_PERIOD;
  }

  state.subscribe(sync);
  sync();
}
