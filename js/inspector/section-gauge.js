/* ===== INSPECTOR SECTION — 자·각도기(gauge) =====
 *
 * 다른 인스펙터 섹션과 달리 자체 구독형(self-subscribing)으로 동작한다:
 *   - #inspector-content 안에 자기 섹션을 마운트한다(콘텐츠가 숨으면 함께 숨음).
 *   - state 변화를 직접 구독해, 단일 gauge 오브젝트가 선택됐을 때만 자기 섹션을
 *     보이고 값을 채운다. 그 외에는 스스로 숨는다.
 * 이렇게 하면 거대한 inspector.js update() 흐름을 건드리지 않고 얹을 수 있다.
 * (크기·위치 / 보호 섹션은 inspector.js가 gauge에도 표시하도록 이미 처리됨.)
 *
 * 컨트롤: 눈금 간격(자=mm, 각도기=°) · 투명도(0~100%).
 */

import { makeSection } from "./widgets.js?v=0.54.51";

export function initGaugeSection(state) {
  const content = document.getElementById("inspector-content");
  if (!content) return;

  const body = document.createElement("div");
  body.className = "insp-body";

  // 눈금 간격
  const tickRow = document.createElement("div");
  tickRow.className = "insp-row";
  const tickLbl = document.createElement("label");
  tickLbl.className = "insp-field-label";
  tickLbl.textContent = "눈금 간격";
  const tickInp = document.createElement("input");
  tickInp.type = "number";
  tickInp.min = "1";
  tickInp.step = "1";
  tickInp.className = "insp-input";
  const tickUnit = document.createElement("span");
  tickUnit.className = "insp-unit";
  tickRow.appendChild(tickLbl);
  tickRow.appendChild(tickInp);
  tickRow.appendChild(tickUnit);
  body.appendChild(tickRow);

  // 투명도
  const opRow = document.createElement("div");
  opRow.className = "insp-row";
  const opLbl = document.createElement("label");
  opLbl.className = "insp-field-label";
  opLbl.textContent = "투명도";
  const opRange = document.createElement("input");
  opRange.type = "range";
  opRange.min = "0"; opRange.max = "1"; opRange.step = "0.01";
  opRange.className = "insp-range";
  opRange.style.flex = "1";
  const opOut = document.createElement("span");
  opOut.className = "insp-unit";
  opOut.style.minWidth = "38px";
  opOut.style.textAlign = "right";
  opRow.appendChild(opLbl);
  opRow.appendChild(opRange);
  opRow.appendChild(opOut);
  body.appendChild(opRow);

  const section = makeSection("자·각도기", body);
  section.style.display = "none";
  content.appendChild(section);

  /* ----- 선택된 단일 gauge 오브젝트 반환(없으면 null) ----- */
  function selectedGauge() {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1 || s.targetedId) return null;
    const o = s.objects.find((x) => x.id === ids[0]);
    return o && o.type === "gauge" ? o : null;
  }

  /* ----- 값 쓰기(Undo 1스텝; locked면 무시) ----- */
  function commit(mut) {
    const s = state.get();
    const o = selectedGauge();
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

  tickInp.addEventListener("change", () => {
    const o = selectedGauge();
    if (!o) return;
    const v = Number(tickInp.value);
    if (!(v >= 1)) return;
    commit((t) => {
      if (t.kind === "protractor") t.tickIntervalDeg = v;
      else t.tickIntervalMm = v;
    });
  });

  // 투명도: 드래그 중 라이브 반영(Undo는 놓을 때 1회).
  let _opSnap = null;
  opRange.addEventListener("input", () => {
    const o = selectedGauge();
    if (!o || o.locked) return;
    if (!_opSnap) _opSnap = JSON.parse(JSON.stringify(state.get().objects));
    const v = Number(opRange.value);
    opOut.textContent = `${Math.round(v * 100)}%`;
    state.update((s2) => {
      const t = s2.objects.find((x) => x.id === o.id);
      if (t && !t.locked) t.opacity = v;
    });
  });
  opRange.addEventListener("change", () => {
    if (_opSnap) {
      state.update((s2) => { s2.undoStack.push(_opSnap); s2.redoStack = []; });
      _opSnap = null;
    }
  });

  /* ----- 표시/값 동기화 ----- */
  function sync() {
    const o = selectedGauge();
    if (!o) { section.style.display = "none"; return; }
    section.style.display = "";
    if (o.kind === "protractor") {
      tickLbl.textContent = "눈금 간격(각도기)";
      tickUnit.textContent = "°";
      if (document.activeElement !== tickInp) tickInp.value = o.tickIntervalDeg ?? 10;
    } else {
      tickLbl.textContent = "눈금 간격(자)";
      tickUnit.textContent = "mm";
      if (document.activeElement !== tickInp) tickInp.value = o.tickIntervalMm ?? 10;
    }
    if (document.activeElement !== opRange) {
      opRange.value = o.opacity ?? 1;
      opOut.textContent = `${Math.round((o.opacity ?? 1) * 100)}%`;
    }
  }

  state.subscribe(sync);
  sync();
}
