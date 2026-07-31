/* ===== INSPECTOR SECTION — 면 (fill color / fill style) =====
 * Extracted verbatim from initInspector() in js/inspector.js (v0.44.0
 * split). Builds the section DOM and wires its events; mounting into the
 * inspector panel happens in js/inspector.js (the orchestrator). */

import { makeColorPicker, makeSection } from "./widgets.js?v=1.4.0";

export function buildFillSection(ctx) {
  const { state, snapBefore, pushSnap } = ctx;

  /* ---- Section 2: 채우기 ---- */
  const sec2Body = document.createElement("div");
  sec2Body.className = "insp-body";

  const fnRow = document.createElement("div");
  fnRow.className = "insp-row";
  const fnCb = document.createElement("input");
  fnCb.type = "checkbox";
  fnCb.className = "insp-cb";
  const fnLbl = document.createElement("label");
  fnLbl.className = "insp-field-label";
  fnLbl.textContent = "채우기 없음";
  fnRow.appendChild(fnCb);
  fnRow.appendChild(fnLbl);
  // fnRow is moved into the "면" section header row below (not appended to body).

  let _fillSnap = null;
  const fillCP = makeColorPicker(
    (lv) => {
      const s = state.get();
      const ids = s.selectedIds || [];
      if (!ids.length) return;
      state.update((s2) => {
        (s2.selectedIds || []).forEach(id => {
          const o = s2.objects.find((o) => o.id === id);
          if (o) o.fillLevel = lv;
        });
      });
    },
    () => { _fillSnap = snapBefore(); },
    () => { pushSnap(_fillSnap); _fillSnap = null; }
  );
  sec2Body.appendChild(fillCP.el);

  // ---- fill style selector: 색(solid) / 도트(dots) / 엑스(cross) / 헤칭(hatch) ----
  // fillLevel (shade) still applies — patterns use it as their mark color.
  const fsRow = document.createElement("div");
  fsRow.className = "insp-row";
  const fsLbl = document.createElement("label");
  fsLbl.className = "insp-field-label";
  fsLbl.textContent = "채우기 종류";
  const fsBtns = document.createElement("div");
  fsBtns.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;";
  // 18×18 inline-SVG glyphs (drawn inside a 28×28 button).
  const FILL_STYLE_ICONS = {
    solid: '<rect width="18" height="18" fill="#888" rx="1"/>',
    dots:  '<rect width="18" height="18" fill="white" stroke="#ccc" rx="1"/>' +
           '<circle cx="5" cy="5" r="1.5" fill="#888"/><circle cx="13" cy="5" r="1.5" fill="#888"/>' +
           '<circle cx="5" cy="13" r="1.5" fill="#888"/><circle cx="13" cy="13" r="1.5" fill="#888"/>',
    cross: '<rect width="18" height="18" fill="white" stroke="#ccc" rx="1"/>' +
           '<line x1="4" y1="4" x2="14" y2="14" stroke="#888" stroke-width="1.5"/>' +
           '<line x1="14" y1="4" x2="4" y2="14" stroke="#888" stroke-width="1.5"/>',
    hatch: '<rect width="18" height="18" fill="white" stroke="#ccc" rx="1"/>' +
           '<line x1="0" y1="9" x2="9" y2="0" stroke="#888" stroke-width="1"/>' +
           '<line x1="4" y1="14" x2="14" y2="4" stroke="#888" stroke-width="1"/>' +
           '<line x1="9" y1="18" x2="18" y2="9" stroke="#888" stroke-width="1"/>',
    // 암상 무늬 4종 (지구과학 지질 단면) — 아이콘은 fill.js 의 타일과 같은 모양이어야
    // 고른 것과 그려지는 것이 어긋나지 않는다.
    brick: '<rect width="18" height="18" fill="white" stroke="#ccc" rx="1"/>' +
           '<line x1="0" y1="6" x2="18" y2="6" stroke="#888" stroke-width="1"/>' +
           '<line x1="0" y1="12" x2="18" y2="12" stroke="#888" stroke-width="1"/>' +
           '<line x1="9" y1="0" x2="9" y2="6" stroke="#888" stroke-width="1"/>' +
           '<line x1="4" y1="6" x2="4" y2="12" stroke="#888" stroke-width="1"/>' +
           '<line x1="14" y1="6" x2="14" y2="12" stroke="#888" stroke-width="1"/>' +
           '<line x1="9" y1="12" x2="9" y2="18" stroke="#888" stroke-width="1"/>',
    vees:  '<rect width="18" height="18" fill="white" stroke="#ccc" rx="1"/>' +
           '<path d="M2 7 L5 11 L8 7" fill="none" stroke="#888" stroke-width="1"/>' +
           '<path d="M10 13 L13 17 L16 13" fill="none" stroke="#888" stroke-width="1"/>' +
           '<path d="M10 2 L13 6 L16 2" fill="none" stroke="#888" stroke-width="1"/>',
    plus:  '<rect width="18" height="18" fill="white" stroke="#ccc" rx="1"/>' +
           '<line x1="2" y1="5" x2="8" y2="5" stroke="#888" stroke-width="1"/>' +
           '<line x1="5" y1="2" x2="5" y2="8" stroke="#888" stroke-width="1"/>' +
           '<line x1="10" y1="13" x2="16" y2="13" stroke="#888" stroke-width="1"/>' +
           '<line x1="13" y1="10" x2="13" y2="16" stroke="#888" stroke-width="1"/>',
    hlines:'<rect width="18" height="18" fill="white" stroke="#ccc" rx="1"/>' +
           '<line x1="0" y1="5" x2="18" y2="5" stroke="#888" stroke-width="1"/>' +
           '<line x1="0" y1="9" x2="18" y2="9" stroke="#888" stroke-width="1"/>' +
           '<line x1="0" y1="13" x2="18" y2="13" stroke="#888" stroke-width="1"/>',
  };
  const FILL_STYLE_OPTIONS = [
    { label: "색",   value: "solid" },
    { label: "도트", value: "dots"  },
    { label: "엑스", value: "cross" },
    { label: "헤칭", value: "hatch" },
    // 지질 단면용. 이름은 무늬 모양이 아니라 '무슨 암석인가'로 적는다 —
    // 교사가 고를 때 보는 것이 암석이기 때문이다(docs/SURVEY_earth_20260731.md §5).
    { label: "벽돌(석회암)", value: "brick"  },
    { label: "v (화산암)",   value: "vees"   },
    { label: "+ (심성암)",   value: "plus"   },
    { label: "가로줄(셰일)", value: "hlines" },
  ];
  const _fillStyleBtnEls = {};
  FILL_STYLE_OPTIONS.forEach(({ label, value }) => {
    const btn = document.createElement("button");
    btn.title = label;
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18">${FILL_STYLE_ICONS[value]}</svg>`;
    btn.style.cssText = "width:28px;height:28px;padding:0;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text-primary);";
    btn.addEventListener("click", () => {
      const s = state.get();
      const ids = s.selectedIds || [];
      if (!ids.length) return;
      const snap = snapBefore();
      state.update((s2) => {
        s2.undoStack.push(snap);
        s2.redoStack = [];
        (s2.selectedIds || []).forEach(id => {
          const o = s2.objects.find((o) => o.id === id);
          if (o) o.fillStyle = value;
        });
      });
    });
    _fillStyleBtnEls[value] = btn;
    fsBtns.appendChild(btn);
  });
  fsRow.appendChild(fsLbl);
  fsRow.appendChild(fsBtns);
  sec2Body.appendChild(fsRow);

  // Highlight the active fill-style button for the (first) selected object.
  function syncFillStyle(obj) {
    const fs = obj.fillStyle ?? "solid";
    Object.entries(_fillStyleBtnEls).forEach(([val, btn]) => {
      const active = val === fs;
      btn.style.background = active ? "var(--accent)" : "var(--bg-input)";
      btn.style.color      = active ? "#ffffff" : "var(--text-primary)";
      btn.style.border     = active ? "1px solid var(--accent)" : "1px solid var(--border)";
    });
  }

  fnCb.addEventListener("change", () => {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (!ids.length) return;
    const snap = snapBefore();
    const val = fnCb.checked;
    fillCP.setDisabled(val);
    state.update((s2) => {
      s2.undoStack.push(snap);
      s2.redoStack = [];
      (s2.selectedIds || []).forEach(id => {
        const o = s2.objects.find((o) => o.id === id);
        if (o) o.fillNone = val;
      });
    });
  });

  const sec2 = makeSection("면", sec2Body);
  // Place 채우기 없음 on the right side of the "면" header row (saves a row).
  // stopPropagation keeps clicks here from toggling the <details> open/closed.
  const sec2Summary = sec2.querySelector(".insp-summary");
  fnRow.style.marginLeft = "auto";
  fnRow.addEventListener("click", (e) => e.stopPropagation());
  sec2Summary.appendChild(fnRow);

  return { sec2, fnCb, fillCP, syncFillStyle, _fillStyleBtnEls };
}
