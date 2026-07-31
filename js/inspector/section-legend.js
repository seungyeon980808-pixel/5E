/* ===== INSPECTOR SECTION — 범례(legend) =====
 *
 * 항목은 표 위젯이 아니라 **한 줄에 하나씩 `견본|설명`** 형식의 textarea 로 받는다.
 * 줄을 지우고 넣는 것만으로 순서·개수를 바꿀 수 있어서, 항목이 늘어도 패널이 안 커진다.
 *   예)  dash|B의 이동
 *        gray|그늘진 구간
 * `|` 가 없으면 견본은 solid 로 본다.
 *
 * 배치·수치 값의 뜻은 docs/BIO_PARTS_SPEC.md §5 를 따른다(필드 이름·기본값 동일).
 */

import { makeSection } from "./widgets.js?v=1.4.0";
import { LEGEND_SAMPLES } from "../render/legend.js?v=1.4.0";

const DIRECTIONS = [["vertical", "세로"], ["horizontal", "가로"]];

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

/* "dash|B의 이동" 여러 줄 → items[] */
function parseItems(text) {
  return String(text ?? "")
    .split("\n")
    .map((ln) => ln.trim())
    .filter((ln) => ln !== "")
    .map((ln) => {
      const i = ln.indexOf("|");
      if (i < 0) return { sample: "solid", text: ln };
      const s = ln.slice(0, i).trim();
      return { sample: LEGEND_SAMPLES.includes(s) ? s : "solid", text: ln.slice(i + 1).trim() };
    });
}

function formatItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((it) => `${(it && it.sample) || "solid"}|${(it && it.text) || ""}`)
    .join("\n");
}

export function initLegendSection(state) {
  const content = document.getElementById("inspector-content");
  if (!content) return;

  const body = document.createElement("div");
  body.className = "insp-body";

  // ----- 항목 -----
  const itemsRow = row("항목");
  itemsRow.style.alignItems = "flex-start";
  const itemsTa = document.createElement("textarea");
  itemsTa.className = "insp-input";
  itemsTa.rows = 5;
  itemsTa.style.flex = "1";
  itemsTa.style.resize = "vertical";
  itemsTa.style.fontFamily = "IBM Plex Mono, monospace";
  itemsTa.placeholder = "dash|B의 이동";
  itemsRow.title =
    "한 줄에 한 항목: 견본|설명\n" +
    `견본: ${LEGEND_SAMPLES.join(" · ")}\n` +
    "예) dash|B의 이동";
  itemsRow.appendChild(itemsTa);
  body.appendChild(itemsRow);

  // ----- 배치 -----
  const dirRow = row("배치");
  const dirSel = document.createElement("select");
  dirSel.className = "insp-input";
  DIRECTIONS.forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v; o.textContent = t;
    dirSel.appendChild(o);
  });
  dirRow.appendChild(dirSel);
  dirRow.title = "가로로 두면 항목을 한 줄에 나란히 늘어놓습니다.";
  body.appendChild(dirRow);

  // ----- 테두리 -----
  const bdRow = row("테두리");
  const bdCb = document.createElement("input");
  bdCb.type = "checkbox";
  bdRow.appendChild(bdCb);
  body.appendChild(bdRow);

  // ----- 수치 -----
  const padInp = numRow(body, "여백", 0.2, 0, "mm", "상자 안쪽 여백입니다.");
  const swInp = numRow(body, "견본 길이", 0.5, 0.5, "mm", "왼쪽 견본(선·네모)의 길이입니다.");
  const fsInp = numRow(body, "글자 크기", 0.1, 0.5, "mm", null);

  const section = makeSection("범례", body);
  section.style.display = "none";
  content.appendChild(section);

  function selected() {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1 || s.targetedId) return null;
    const o = s.objects.find((x) => x.id === ids[0]);
    return o && o.type === "legend" ? o : null;
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

  itemsTa.addEventListener("change", () => {
    const items = parseItems(itemsTa.value);
    commit((t) => { t.items = items; });
  });
  dirSel.addEventListener("change", () => {
    commit((t) => { t.direction = dirSel.value === "horizontal" ? "horizontal" : "vertical"; });
  });
  bdCb.addEventListener("change", () => {
    commit((t) => { t.border = bdCb.checked; });
  });
  padInp.addEventListener("change", () => {
    const v = Number(padInp.value);
    if (!isFinite(v) || v < 0) return;
    commit((t) => { t.padding = v; });
  });
  swInp.addEventListener("change", () => {
    const v = Number(swInp.value);
    if (!isFinite(v) || v <= 0) return;
    commit((t) => { t.sampleWidth = v; });
  });
  fsInp.addEventListener("change", () => {
    const v = Number(fsInp.value);
    if (!isFinite(v) || v <= 0) return;
    commit((t) => { t.fontSize = v; });
  });

  function sync() {
    const o = selected();
    if (!o) { section.style.display = "none"; return; }
    section.style.display = "";
    // 편집 중인 칸은 건드리지 않는다(입력 중 커서가 튀는 것 방지).
    if (document.activeElement !== itemsTa) itemsTa.value = formatItems(o.items);
    if (document.activeElement !== dirSel) dirSel.value = o.direction === "horizontal" ? "horizontal" : "vertical";
    bdCb.checked = o.border !== false;
    if (document.activeElement !== padInp) padInp.value = Number.isFinite(o.padding) ? o.padding : 2.4;
    if (document.activeElement !== swInp) swInp.value = Number.isFinite(o.sampleWidth) ? o.sampleWidth : 8;
    if (document.activeElement !== fsInp) fsInp.value = Number.isFinite(o.fontSize) ? o.fontSize : 2.8;
  }

  state.subscribe(sync);
  sync();
}
