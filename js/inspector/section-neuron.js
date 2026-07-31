/* ===== INSPECTOR SECTION — 뉴런(neuron) =====
 *
 * 세포체 중심(p1)과 축삭 말단(p2)은 캔버스의 두 끝점 핸들로 정한다.
 * 여기서는 크기·가지 수·자극 표시만 다룬다.
 *
 * 규격 정본: docs/BIO_PARTS_SPEC.md §4. 필드 이름·기본값은 거기서만 가져온다.
 * 구조는 section-groundarc.js 의 selected() / commit() / sync() 3함수 패턴 그대로.
 */

import { makeSection } from "./widgets.js?v=1.3.0";

function row(labelText) {
  const r = document.createElement("div");
  r.className = "insp-row";
  const l = document.createElement("label");
  l.className = "insp-field-label";
  l.textContent = labelText;
  r.appendChild(l);
  return r;
}

function numInput(step, min, max) {
  const i = document.createElement("input");
  i.type = "number";
  i.className = "insp-input";
  i.step = step;
  if (min != null) i.min = min;
  if (max != null) i.max = max;
  return i;
}

function unit(text) {
  const s = document.createElement("span");
  s.className = "insp-unit";
  s.textContent = text;
  return s;
}

export function initNeuronSection(state) {
  const content = document.getElementById("inspector-content");
  if (!content) return;

  const body = document.createElement("div");
  body.className = "insp-body";

  /* ----- 세포체 크기 ----- */
  const somaRow = row("세포체 크기");
  const somaInp = numInput("0.2", "0.4", "40");
  somaRow.appendChild(somaInp);
  somaRow.appendChild(unit("mm"));
  somaRow.title = "신경세포체 원의 반지름입니다.\n핵은 항상 이 값의 0.34배로 그려집니다.";
  body.appendChild(somaRow);

  /* ----- 가지돌기 수 ----- */
  const dendRow = row("가지돌기 수");
  const dendInp = numInput("1", "0", "12");
  dendRow.appendChild(dendInp);
  dendRow.appendChild(unit("개"));
  dendRow.title = "축삭 반대쪽에 부채꼴(±68°)로 뻗습니다. 끝은 두 갈래로 갈라집니다.";
  body.appendChild(dendRow);

  /* ----- 말단 분기 수 ----- */
  const termRow = row("말단 분기 수");
  const termInp = numInput("1", "0", "12");
  termRow.appendChild(termInp);
  termRow.appendChild(unit("개"));
  termRow.title = "축삭 말단(p2)에서 부채꼴로 뻗는 짧은 가지의 개수입니다.";
  body.appendChild(termRow);

  /* ----- 자극 지점 표시 ----- */
  const stimRow = row("자극 지점 표시");
  const stimCb = document.createElement("input");
  stimCb.type = "checkbox";
  stimRow.appendChild(stimCb);
  stimRow.title = "축 아래에서 위로 찌르는 화살표와 라벨을 답니다.";
  body.appendChild(stimRow);

  /* 아래 4줄은 '자극 지점 표시'가 켜졌을 때만 보인다 */
  const stimAtRow = row("자극 위치");
  const stimAtInp = numInput("0.05", "0", "1");
  stimAtRow.appendChild(stimAtInp);
  stimAtRow.title = "0 = 세포체, 1 = 축삭 끝.";
  body.appendChild(stimAtRow);

  const stimLabRow = row("자극 라벨");
  const stimLabInp = document.createElement("input");
  stimLabInp.type = "text";
  stimLabInp.className = "insp-input";
  stimLabRow.appendChild(stimLabInp);
  body.appendChild(stimLabRow);

  const distRow = row("거리 표시");
  const distCb = document.createElement("input");
  distCb.type = "checkbox";
  distRow.appendChild(distCb);
  distRow.title = "세포체~자극 지점을 잇는 점선과 거리 라벨을 축 위쪽에 놓습니다.";
  body.appendChild(distRow);

  const distLabRow = row("거리 라벨");
  const distLabInp = document.createElement("input");
  distLabInp.type = "text";
  distLabInp.className = "insp-input";
  distLabRow.appendChild(distLabInp);
  distLabRow.title = "물리량이므로 이탤릭으로 그려집니다.";
  body.appendChild(distLabRow);

  const section = makeSection("뉴런", body);
  section.style.display = "none";
  content.appendChild(section);

  function selected() {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1 || s.targetedId) return null;
    const o = s.objects.find((x) => x.id === ids[0]);
    return o && o.type === "neuron" ? o : null;
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

  somaInp.addEventListener("change", () => {
    const v = Number(somaInp.value);
    if (!isFinite(v) || v <= 0) return;
    commit((t) => { t.somaRadius = v; });
  });
  dendInp.addEventListener("change", () => {
    const v = Math.round(Number(dendInp.value));
    if (!isFinite(v) || v < 0) return;
    commit((t) => { t.dendrites = v; });
  });
  termInp.addEventListener("change", () => {
    const v = Math.round(Number(termInp.value));
    if (!isFinite(v) || v < 0) return;
    commit((t) => { t.terminals = v; });
  });
  stimCb.addEventListener("change", () => {
    commit((t) => { t.showStim = stimCb.checked; });
  });
  stimAtInp.addEventListener("change", () => {
    let v = Number(stimAtInp.value);
    if (!isFinite(v)) return;
    v = Math.min(1, Math.max(0, v));
    commit((t) => { t.stimAt = v; });
  });
  stimLabInp.addEventListener("change", () => {
    commit((t) => { t.stimLabel = stimLabInp.value; });
  });
  distCb.addEventListener("change", () => {
    commit((t) => { t.showStimDistance = distCb.checked; });
  });
  distLabInp.addEventListener("change", () => {
    commit((t) => { t.distanceLabel = distLabInp.value; });
  });

  function sync() {
    const o = selected();
    if (!o) { section.style.display = "none"; return; }
    section.style.display = "";

    if (document.activeElement !== somaInp) somaInp.value = Number.isFinite(o.somaRadius) ? o.somaRadius : 3.4;
    if (document.activeElement !== dendInp) dendInp.value = Number.isFinite(o.dendrites) ? o.dendrites : 5;
    if (document.activeElement !== termInp) termInp.value = Number.isFinite(o.terminals) ? o.terminals : 3;

    const on = !!o.showStim;
    stimCb.checked = on;
    // 자극 표시가 꺼져 있으면 그 아래 항목은 숨긴다.
    for (const r of [stimAtRow, stimLabRow, distRow, distLabRow]) r.style.display = on ? "" : "none";
    if (!on) return;

    if (document.activeElement !== stimAtInp) stimAtInp.value = Number.isFinite(o.stimAt) ? o.stimAt : 0.45;
    if (document.activeElement !== stimLabInp) stimLabInp.value = o.stimLabel ?? "자극";
    distCb.checked = o.showStimDistance !== false;
    // 거리 라벨은 거리 표시가 켜졌을 때만
    distLabRow.style.display = distCb.checked ? "" : "none";
    if (document.activeElement !== distLabInp) distLabInp.value = o.distanceLabel ?? "d";
  }

  state.subscribe(sync);
  sync();
}
