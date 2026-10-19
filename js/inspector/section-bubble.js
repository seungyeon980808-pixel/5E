/* ===== INSPECTOR SECTION — 말풍선(bubble) =====
 *
 * 몸통 크기와 위치는 캔버스에서 상자를 끌어 정한다. 여기서는 꼬리(방향·위치·길이·휨)와
 * 모서리 둥글기만 다룬다. 구조는 section-axisbreak.js 의 selected() / commit() / sync().
 */

import { makeSection } from "./widgets.js?v=1.7.0-four-session-integration";

const SIDES = [["bottom", "아래"], ["top", "위"], ["left", "왼쪽"], ["right", "오른쪽"]];

function row(labelText) {
  const r = document.createElement("div");
  r.className = "insp-row";
  const l = document.createElement("label");
  l.className = "insp-field-label";
  l.textContent = labelText;
  r.appendChild(l);
  return r;
}

function numRow(body, labelText, step, min, max, unit, title) {
  const r = row(labelText);
  const inp = document.createElement("input");
  inp.type = "number";
  inp.step = String(step);
  inp.min = String(min);
  if (max != null) inp.max = String(max);
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

export function initBubbleSection(state) {
  const content = document.getElementById("inspector-content");
  if (!content) return;

  const body = document.createElement("div");
  body.className = "insp-body";

  const sideRow = row("꼬리 방향");
  const sideSel = document.createElement("select");
  sideSel.className = "insp-input";
  SIDES.forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v; o.textContent = t;
    sideSel.appendChild(o);
  });
  sideRow.appendChild(sideSel);
  body.appendChild(sideRow);

  const posInp = numRow(body, "꼬리 위치", 0.05, 0, 1, "", "꼬리가 붙는 변에서의 위치입니다. 0은 왼쪽(위) 끝, 1은 오른쪽(아래) 끝입니다.");
  const lenInp = numRow(body, "꼬리 길이", 0.2, 0, null, "mm");
  const widInp = numRow(body, "꼬리 폭", 0.2, 0.2, null, "mm");
  const skewInp = numRow(body, "꼬리 휨", 0.1, -3, 3, "", "꼬리 끝이 옆으로 기우는 정도입니다. 음수면 반대쪽으로 기웁니다.");
  const radInp = numRow(body, "모서리", 0.2, 0, null, "mm", "몸통 모서리의 둥근 정도입니다.");

  const section = makeSection("말풍선", body);
  section.style.display = "none";
  content.appendChild(section);

  function selected() {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1 || s.targetedId) return null;
    const o = s.objects.find((x) => x.id === ids[0]);
    return o && o.type === "bubble" ? o : null;
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

  const bindNumber = (inp, key, min, max) => inp.addEventListener("change", () => {
    const v = Number(inp.value);
    if (!Number.isFinite(v) || v < min || (max != null && v > max)) return;
    commit((t) => { t[key] = v; });
  });
  sideSel.addEventListener("change", () => commit((t) => { t.tailSide = sideSel.value; }));
  bindNumber(posInp, "tailPos", 0, 1);
  bindNumber(lenInp, "tailLength", 0, null);
  bindNumber(widInp, "tailWidth", 0.2, null);
  bindNumber(skewInp, "tailSkew", -3, 3);
  bindNumber(radInp, "radius", 0, null);

  function sync() {
    const o = selected();
    if (!o) { section.style.display = "none"; return; }
    section.style.display = "";
    const set = (el, v) => { if (document.activeElement !== el) el.value = v; };
    set(sideSel, o.tailSide || "bottom");
    set(posInp, Number.isFinite(o.tailPos) ? o.tailPos : 0.3);
    set(lenInp, Number.isFinite(o.tailLength) ? o.tailLength : 3.2);
    set(widInp, Number.isFinite(o.tailWidth) ? o.tailWidth : 3);
    set(skewInp, Number.isFinite(o.tailSkew) ? o.tailSkew : -0.6);
    set(radInp, Number.isFinite(o.radius) ? o.radius : 2.2);
  }

  state.subscribe(sync);
  sync();
}

