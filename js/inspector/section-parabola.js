/* ===== INSPECTOR SECTION — 포물선 궤적(parabola) =====
 *
 * section-gauge.js / section-solid3d.js와 같은 자체 구독형 섹션이다.
 *
 * 출발점·도달점은 캔버스에서 두 끝점을 끌어 정한다(선·용수철과 같은 방식).
 * 여기서는 나머지 두 가지, **최고 높이**와 보조선 표시를 다룬다.
 *
 * 왜 "초기 속도·각도"가 아니라 "최고 높이"인가: 시험지 그림을 그릴 때 필요한 건
 * 물리량이 아니라 "어디서 출발해 어디에 떨어지고 얼마나 높이 뜨는가"다. 속도와 각도로
 * 주면 원하는 모양을 얻을 때까지 숫자를 계속 고쳐야 한다.
 */

import { makeSection } from "./widgets.js?v=1.3.0";

const DEFAULT_APEX = 14;

function row(labelText) {
  const r = document.createElement("div");
  r.className = "insp-row";
  const l = document.createElement("label");
  l.className = "insp-field-label";
  l.textContent = labelText;
  r.appendChild(l);
  return r;
}

function checkRow(labelText) {
  const r = row(labelText);
  const cb = document.createElement("input");
  cb.type = "checkbox";
  r.appendChild(cb);
  return { row: r, cb };
}

export function initParabolaSection(state) {
  const content = document.getElementById("inspector-content");
  if (!content) return;

  const body = document.createElement("div");
  body.className = "insp-body";

  const apexRow = row("최고 높이");
  const apexInp = document.createElement("input");
  apexInp.type = "number";
  apexInp.min = "0";
  apexInp.step = "1";
  apexInp.className = "insp-input";
  const apexUnit = document.createElement("span");
  apexUnit.className = "insp-unit";
  apexUnit.textContent = "mm";
  apexRow.appendChild(apexInp);
  apexRow.appendChild(apexUnit);
  body.appendChild(apexRow);

  const shadow = checkRow("바닥 점선");
  shadow.row.title = "출발점과 도달점을 잇는 바닥 경로.\n이게 없으면 위로 간 건지 안쪽으로 간 건지 읽히지 않습니다.";
  body.appendChild(shadow.row);

  const dashed = checkRow("궤적 점선");
  dashed.row.title = "기출의 궤적은 대부분 점선입니다.\n실제로 보이는 선이 아니라 '지나간 길'이기 때문입니다.";
  body.appendChild(dashed.row);

  const apexMark = checkRow("최고점 표시");
  apexMark.row.title = "가장 높은 지점에 점을 찍고 바닥까지 수선을 내립니다.";
  body.appendChild(apexMark.row);

  const section = makeSection("포물선 궤적", body);
  section.style.display = "none";
  content.appendChild(section);

  function selected() {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1 || s.targetedId) return null;
    const o = s.objects.find((x) => x.id === ids[0]);
    return o && o.type === "parabola" ? o : null;
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

  apexInp.addEventListener("change", () => {
    const v = Number(apexInp.value);
    if (!(v >= 0)) return;
    commit((t) => { t.apex = v; });
  });
  shadow.cb.addEventListener("change", () => {
    commit((t) => { t.showShadow = shadow.cb.checked; });
  });
  apexMark.cb.addEventListener("change", () => {
    commit((t) => { t.showApex = apexMark.cb.checked; });
  });
  dashed.cb.addEventListener("change", () => {
    commit((t) => { t.dashed = dashed.cb.checked; });
  });

  function sync() {
    const o = selected();
    if (!o) { section.style.display = "none"; return; }
    section.style.display = "";
    if (document.activeElement !== apexInp) {
      apexInp.value = Math.round((Number.isFinite(o.apex) ? o.apex : DEFAULT_APEX) * 10) / 10;
    }
    shadow.cb.checked = o.showShadow !== false;
    apexMark.cb.checked = !!o.showApex;
    dashed.cb.checked = !!o.dashed;
  }

  state.subscribe(sync);
  sync();
}
