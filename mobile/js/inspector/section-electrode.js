/* ===== INSPECTOR SECTION — 전극·전지(electrode) =====
 *
 * `section-legend.js` 의 selected() / commit() / sync() 3함수 패턴을 그대로 따른다.
 * 컨트롤은 시안(`docs/chem-parts-proposal.html` cellSVG 패널)과 같은 순서다:
 *   전해질 · 용액 색 · 액면 높이 · 왼쪽 라벨 · 오른쪽 라벨 · [전구 켜짐/염다리/e⁻ 화살표]
 *
 * 필드 이름과 기본값은 docs/CHEM_PARTS_SPEC.md §9 를 따른다.
 */

import { makeSection } from "./widgets.js?v=1.4.0";
import { ELECTRODE_DEFAULTS } from "../render/electrode.js?v=1.4.0";

function row(labelText) {
  const r = document.createElement("div");
  r.className = "insp-row";
  const l = document.createElement("label");
  l.className = "insp-field-label";
  l.textContent = labelText;
  r.appendChild(l);
  return r;
}

function textRow(body, labelText, placeholder, title) {
  const r = row(labelText);
  const inp = document.createElement("input");
  inp.type = "text";
  inp.className = "insp-input";
  if (placeholder) inp.placeholder = placeholder;
  r.appendChild(inp);
  if (title) r.title = title;
  body.appendChild(r);
  return inp;
}

function colorRow(body, labelText, title) {
  const r = row(labelText);
  const inp = document.createElement("input");
  inp.type = "color";
  inp.className = "insp-input";
  r.appendChild(inp);
  if (title) r.title = title;
  body.appendChild(r);
  return inp;
}

function numRow(body, labelText, step, min, max, title) {
  const r = row(labelText);
  const inp = document.createElement("input");
  inp.type = "number";
  inp.step = String(step);
  inp.min = String(min);
  inp.max = String(max);
  inp.className = "insp-input";
  r.appendChild(inp);
  if (title) r.title = title;
  body.appendChild(r);
  return inp;
}

function checkRow(body, labelText, title) {
  const r = row(labelText);
  const cb = document.createElement("input");
  cb.type = "checkbox";
  r.appendChild(cb);
  if (title) r.title = title;
  body.appendChild(r);
  return cb;
}

export function initElectrodeSection(state) {
  const content = document.getElementById("inspector-content");
  if (!content) return;

  const body = document.createElement("div");
  body.className = "insp-body";

  const solInp = textRow(body, "전해질", "KOH(aq)",
    "용액 가운데에 들어갈 화학식입니다.\n아래첨자는 H_2O, 위첨자는 Cu^{2+} 처럼 씁니다.");
  const liqInp = colorRow(body, "용액 색", "기출은 연한 회색(#c9cdd1)입니다.");
  const depInp = numRow(body, "액면 높이", 0.02, 0, 1,
    "비커 안쪽 높이에 대한 비율입니다(0~1).");
  const leftInp = textRow(body, "왼쪽 라벨", "산화 전극", "상자 아래 왼쪽에 들어갑니다.");
  const rightInp = textRow(body, "오른쪽 라벨", "환원 전극", "상자 아래 오른쪽에 들어갑니다.");

  const lampCb = checkRow(body, "전구 켜짐", "전구 둘레에 빛살 6개를 그립니다.");
  const bridgeCb = checkRow(body, "염다리", "용액 위를 잇는 ㄷ자 관과 “염다리” 글자를 넣습니다.");
  const eArrowCb = checkRow(body, "e⁻ 화살표", "왼쪽 전극에서 도선 쪽으로 전자 이동을 표시합니다.");

  const section = makeSection("전극·전지", body);
  section.style.display = "none";
  content.appendChild(section);

  function selected() {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1 || s.targetedId) return null;
    const o = s.objects.find((x) => x.id === ids[0]);
    return o && o.type === "electrode" ? o : null;
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

  solInp.addEventListener("change", () => {
    commit((t) => { t.solution = solInp.value; });
  });
  liqInp.addEventListener("change", () => {
    commit((t) => { t.liquidColor = liqInp.value; });
  });
  depInp.addEventListener("change", () => {
    const v = Number(depInp.value);
    if (!isFinite(v)) return;
    commit((t) => { t.depth = Math.min(1, Math.max(0, v)); });
  });
  leftInp.addEventListener("change", () => {
    commit((t) => { t.leftLabel = leftInp.value; });
  });
  rightInp.addEventListener("change", () => {
    commit((t) => { t.rightLabel = rightInp.value; });
  });
  lampCb.addEventListener("change", () => {
    commit((t) => { t.lampOn = lampCb.checked; });
  });
  bridgeCb.addEventListener("change", () => {
    commit((t) => { t.saltBridge = bridgeCb.checked; });
  });
  eArrowCb.addEventListener("change", () => {
    commit((t) => { t.showElectronArrow = eArrowCb.checked; });
  });

  function sync() {
    const o = selected();
    if (!o) { section.style.display = "none"; return; }
    section.style.display = "";
    // 편집 중인 칸은 건드리지 않는다(입력 중 커서가 튀는 것 방지).
    if (document.activeElement !== solInp) solInp.value = o.solution ?? ELECTRODE_DEFAULTS.solution;
    if (document.activeElement !== liqInp) liqInp.value = o.liquidColor || ELECTRODE_DEFAULTS.liquidColor;
    if (document.activeElement !== depInp) {
      depInp.value = Number.isFinite(o.depth) ? o.depth : ELECTRODE_DEFAULTS.depth;
    }
    if (document.activeElement !== leftInp) leftInp.value = o.leftLabel ?? ELECTRODE_DEFAULTS.leftLabel;
    if (document.activeElement !== rightInp) rightInp.value = o.rightLabel ?? ELECTRODE_DEFAULTS.rightLabel;
    lampCb.checked = o.lampOn !== false;
    bridgeCb.checked = !!o.saltBridge;
    eArrowCb.checked = !!o.showElectronArrow;
  }

  state.subscribe(sync);
  sync();
}
