/* ===== INSPECTOR SECTION — 인지질 이중층(bilayer) =====
 *
 * 막이 뻗는 방향·길이는 캔버스에서 두 끝점 핸들로 정한다(p1=왼쪽 끝, p2=오른쪽 끝).
 * 여기서는 인지질의 개수·크기, 막단백질, 안팎 라벨만 다룬다.
 *
 * 막단백질 개수를 바꾸면 `proteins[]` 를 **균등 위치로 다시 만든다** — 손으로 at 을
 * 하나씩 맞추는 일이 없게 하려는 것이고, 폭은 기존 값(없으면 기본값)을 물려준다.
 *
 * selected() / commit() / sync() 3함수 패턴은 section-groundarc.js 와 같다.
 */

import { makeSection } from "./widgets.js?v=1.4.0";
import { BILAYER_DEFAULTS } from "../render/bilayer.js?v=1.4.0";

function row(labelText) {
  const r = document.createElement("div");
  r.className = "insp-row";
  const l = document.createElement("label");
  l.className = "insp-field-label";
  l.textContent = labelText;
  r.appendChild(l);
  return r;
}

function numRow(body, labelText, { step, min, max, unit, title }) {
  const r = row(labelText);
  const inp = document.createElement("input");
  inp.type = "number";
  inp.step = String(step);
  inp.min = String(min);
  inp.max = String(max);
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

function textRow(body, labelText, { title, placeholder } = {}) {
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

/* 막단백질 n개를 막 위에 균등하게 놓는다: at = (i+1)/(n+1).
 * n=1 이면 0.5(한가운데), n=2 면 1/3·2/3 … 양 끝에 붙지 않는다. */
function evenProteins(n, width) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push({ at: (i + 1) / (n + 1), width });
  return out;
}

export function initBilayerSection(state) {
  const content = document.getElementById("inspector-content");
  if (!content) return;

  const body = document.createElement("div");
  body.className = "insp-body";

  const countInp = numRow(body, "인지질 개수", {
    step: 1, min: 2, max: 60, unit: "개",
    title: "한 층에 놓이는 인지질 수입니다. 막 길이에 맞춰 균등 배치됩니다.",
  });
  const thickInp = numRow(body, "막 두께", {
    step: 0.5, min: 2, max: 30, unit: "mm",
    title: "위층 머리 중심 ~ 아래층 머리 중심 거리입니다.",
  });
  const headInp = numRow(body, "머리 크기", {
    step: 0.05, min: 0.3, max: 4, unit: "mm",
    title: "인지질 머리 원의 반지름입니다.",
  });
  const protCountInp = numRow(body, "막단백질 개수", {
    step: 1, min: 0, max: 4, unit: "개",
    title: "개수를 바꾸면 막 위에 균등한 위치로 다시 배치됩니다.\n단백질이 놓인 자리의 인지질은 자동으로 비워집니다.",
  });
  const protWidthInp = numRow(body, "단백질 폭", {
    step: 0.5, min: 1, max: 40, unit: "mm",
    title: "막단백질 하나의 가로 폭입니다.",
  });
  const outerInp = textRow(body, "바깥 라벨", {
    placeholder: "예: 세포 밖", title: "비워 두면 글자를 그리지 않습니다.",
  });
  const innerInp = textRow(body, "안쪽 라벨", {
    placeholder: "예: 세포 안", title: "비워 두면 글자를 그리지 않습니다.",
  });

  const section = makeSection("인지질 이중층", body);
  section.style.display = "none";
  content.appendChild(section);

  function selected() {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1 || s.targetedId) return null;
    const o = s.objects.find((x) => x.id === ids[0]);
    return o && o.type === "bilayer" ? o : null;
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

  /* 현재 단백질 폭(첫 항목 기준). 없으면 기본값. */
  function currentWidth(o) {
    const arr = Array.isArray(o?.proteins) ? o.proteins : [];
    const w = Number(arr[0]?.width);
    return Number.isFinite(w) && w > 0 ? w : BILAYER_DEFAULTS.proteinWidth;
  }

  countInp.addEventListener("change", () => {
    const v = Math.round(Number(countInp.value));
    if (!isFinite(v) || v < 2) return;
    commit((t) => { t.unitCount = Math.min(60, v); });
  });
  thickInp.addEventListener("change", () => {
    const v = Number(thickInp.value);
    if (!isFinite(v) || v <= 0) return;
    commit((t) => { t.thickness = v; });
  });
  headInp.addEventListener("change", () => {
    const v = Number(headInp.value);
    if (!isFinite(v) || v <= 0) return;
    commit((t) => { t.headRadius = v; });
  });
  protCountInp.addEventListener("change", () => {
    const v = Math.round(Number(protCountInp.value));
    if (!isFinite(v) || v < 0) return;
    const n = Math.min(4, v);
    commit((t) => { t.proteins = evenProteins(n, currentWidth(t)); });
  });
  protWidthInp.addEventListener("change", () => {
    const v = Number(protWidthInp.value);
    if (!isFinite(v) || v <= 0) return;
    commit((t) => {
      const arr = Array.isArray(t.proteins) ? t.proteins : [];
      t.proteins = arr.map((p) => ({ ...p, width: v }));
    });
  });
  outerInp.addEventListener("input", () => {
    commit((t) => { t.labelOuter = outerInp.value; });
  });
  innerInp.addEventListener("input", () => {
    commit((t) => { t.labelInner = innerInp.value; });
  });

  function sync() {
    const o = selected();
    if (!o) { section.style.display = "none"; return; }
    section.style.display = "";
    const ae = document.activeElement;
    const n = Array.isArray(o.proteins) ? o.proteins.length : 0;
    if (ae !== countInp) countInp.value = Math.round(o.unitCount ?? BILAYER_DEFAULTS.unitCount);
    if (ae !== thickInp) thickInp.value = o.thickness ?? BILAYER_DEFAULTS.thickness;
    if (ae !== headInp) headInp.value = o.headRadius ?? BILAYER_DEFAULTS.headRadius;
    if (ae !== protCountInp) protCountInp.value = n;
    if (ae !== protWidthInp) protWidthInp.value = currentWidth(o);
    protWidthInp.disabled = n === 0;
    if (ae !== outerInp) outerInp.value = o.labelOuter ?? "";
    if (ae !== innerInp) innerInp.value = o.labelInner ?? "";
  }

  state.subscribe(sync);
  sync();
}
