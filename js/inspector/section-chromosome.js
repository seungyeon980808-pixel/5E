/* ===== INSPECTOR SECTION — 염색체(chromosome) =====
 *
 * 길이·기울기는 캔버스의 두 끝점 핸들(p1 = 위 끝, p2 = 아래 끝)로 정한다.
 * 여기서는 캡슐의 굵기·간격, 동원체 높이, 채우기, 상동쌍, 라벨을 다룬다.
 *
 * 구조는 section-groundarc.js 의 selected() / commit() / sync() 3함수 패턴 그대로다.
 * 명세: docs/BIO_PARTS_SPEC.md §2 — 필드 이름·기본값은 거기서만 가져온다.
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

function numberRow(labelText, { step, min, max, unit, title }) {
  const r = row(labelText);
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
  if (title) r.title = title;
  return { row: r, inp };
}

function textRow(labelText) {
  const r = row(labelText);
  const inp = document.createElement("input");
  inp.type = "text";
  inp.className = "insp-input";
  r.appendChild(inp);
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

export function initChromosomeSection(state) {
  const content = document.getElementById("inspector-content");
  if (!content) return;

  const body = document.createElement("div");
  body.className = "insp-body";

  // ----- 캡슐 -----
  const widthF = numberRow("캡슐 굵기", { step: 0.2, min: 0.4, max: 20, unit: "mm",
    title: "염색분체 한 가닥(둥근 막대)의 굵기입니다." });
  body.appendChild(widthF.row);

  const gapF = numberRow("캡슐 간격", { step: 0.2, min: 0, max: 20, unit: "mm",
    title: "나란히 붙은 두 염색분체 사이의 틈입니다." });
  body.appendChild(gapF.row);

  // ----- 동원체 위치 (0 = 위 끝, 1 = 아래 끝) -----
  const centroRow = row("동원체 위치");
  const centroRange = document.createElement("input");
  centroRange.type = "range";
  centroRange.min = "0";
  centroRange.max = "1";
  centroRange.step = "0.01";
  centroRange.style.flex = "1";
  const centroNum = document.createElement("input");
  centroNum.type = "number";
  centroNum.className = "insp-input";
  centroNum.step = "0.01";
  centroNum.min = "0";
  centroNum.max = "1";
  centroNum.style.maxWidth = "56px";
  centroRow.appendChild(centroRange);
  centroRow.appendChild(centroNum);
  centroRow.title = "0 = 위 끝(p1), 1 = 아래 끝(p2).\n두 캡슐의 같은 높이에 검은 점으로 찍힙니다.";
  body.appendChild(centroRow);

  // ----- 채우기 -----
  const fillRow = row("채우기");
  const fillSel = document.createElement("select");
  fillSel.className = "insp-input";
  [["solid", "흰색"], ["gray", "회색"], ["hatch", "빗금"], ["cross", "교차"]].forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = t;
    fillSel.appendChild(o);
  });
  fillRow.appendChild(fillSel);
  body.appendChild(fillRow);

  // ----- 상동쌍 -----
  const pairF = checkRow("상동쌍", "같은 모양 한 벌을 옆에 더 그립니다(2n 표현).");
  body.appendChild(pairF.row);

  const pairGapF = numberRow("쌍 간격", { step: 1, min: 0, max: 200, unit: "mm",
    title: "상동염색체 두 벌 사이의 거리입니다." });
  body.appendChild(pairGapF.row);

  // ----- 라벨 -----
  const lLeft  = textRow("왼쪽 라벨");
  const lRight = textRow("오른쪽 라벨");
  const lLeft2  = textRow("왼쪽 라벨 2");
  const lRight2 = textRow("오른쪽 라벨 2");
  [lLeft, lRight, lLeft2, lRight2].forEach((f) => body.appendChild(f.row));
  lLeft.row.title = "대립유전자 기호(A, a …). 기울기와 무관하게 가로로, 이탤릭으로 쓰입니다.";
  lLeft2.row.title = "상동쌍의 둘째 벌에 붙는 라벨입니다.";

  const showF = checkRow("라벨 표시");
  body.appendChild(showF.row);

  const section = makeSection("염색체", body);
  section.style.display = "none";
  content.appendChild(section);

  /* ---------- 3함수 패턴 ---------- */
  function selected() {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1 || s.targetedId) return null;
    const o = s.objects.find((x) => x.id === ids[0]);
    return o && o.type === "chromosome" ? o : null;
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

  function commitNumber(inp, prop, { min, max, allowZero = true }) {
    const v = Number(inp.value);
    if (!isFinite(v)) return;
    if (!allowZero && v === 0) return;
    const c = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v));
    commit((t) => { t[prop] = c; });
  }

  widthF.inp.addEventListener("change", () => commitNumber(widthF.inp, "chromatidWidth", { min: 0.4, max: 20, allowZero: false }));
  gapF.inp.addEventListener("change", () => commitNumber(gapF.inp, "chromatidGap", { min: 0, max: 20 }));
  pairGapF.inp.addEventListener("change", () => commitNumber(pairGapF.inp, "pairGap", { min: 0, max: 200 }));

  function setCentromere(raw) {
    const v = Number(raw);
    if (!isFinite(v)) return;
    const c = Math.max(0, Math.min(1, v));
    commit((t) => { t.centromere = c; });
  }
  centroRange.addEventListener("input", () => { centroNum.value = centroRange.value; });
  centroRange.addEventListener("change", () => setCentromere(centroRange.value));
  centroNum.addEventListener("change", () => setCentromere(centroNum.value));

  fillSel.addEventListener("change", () => {
    commit((t) => { t.fillStyle = fillSel.value; });
  });

  pairF.cb.addEventListener("change", () => {
    commit((t) => { t.homologPair = pairF.cb.checked; });
  });
  showF.cb.addEventListener("change", () => {
    commit((t) => { t.showLabels = showF.cb.checked; });
  });

  function bindText(inp, prop) {
    const apply = () => {
      const o = selected();
      if (!o) return;
      const val = inp.value;
      if ((o[prop] ?? "") === val) return;
      commit((t) => { t[prop] = val; });
    };
    inp.addEventListener("change", apply);
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
  }
  bindText(lLeft.inp, "labelLeft");
  bindText(lRight.inp, "labelRight");
  bindText(lLeft2.inp, "labelLeft2");
  bindText(lRight2.inp, "labelRight2");

  function sync() {
    const o = selected();
    if (!o) { section.style.display = "none"; return; }
    section.style.display = "";

    const set = (inp, v) => { if (document.activeElement !== inp) inp.value = v; };
    set(widthF.inp, Number.isFinite(o.chromatidWidth) ? o.chromatidWidth : 3);
    set(gapF.inp, Number.isFinite(o.chromatidGap) ? o.chromatidGap : 1.6);

    const c = Number.isFinite(o.centromere) ? o.centromere : 0.32;
    set(centroRange, c);
    set(centroNum, c);

    if (document.activeElement !== fillSel) fillSel.value = o.fillStyle ?? "solid";

    const pair = o.homologPair === true;
    pairF.cb.checked = pair;
    set(pairGapF.inp, Number.isFinite(o.pairGap) ? o.pairGap : 20);

    set(lLeft.inp, o.labelLeft ?? "");
    set(lRight.inp, o.labelRight ?? "");
    set(lLeft2.inp, o.labelLeft2 ?? "");
    set(lRight2.inp, o.labelRight2 ?? "");
    showF.cb.checked = o.showLabels !== false;

    // 상동쌍이 꺼져 있으면 둘째 벌 라벨칸과 쌍 간격은 쓸모가 없다 — 숨긴다.
    pairGapF.row.style.display = pair ? "" : "none";
    lLeft2.row.style.display = pair ? "" : "none";
    lRight2.row.style.display = pair ? "" : "none";
  }

  state.subscribe(sync);
  sync();
}
