/* ===== INSPECTOR SECTION — 입체(solid3d) =====
 *
 * section-gauge.js와 같은 자체 구독형(self-subscribing) 섹션이다:
 *   - #inspector-content 안에 자기 섹션을 마운트하고, state를 직접 구독해
 *     단일 solid3d 오브젝트가 선택됐을 때만 자기를 보인다.
 *   - 거대한 inspector.js update() 흐름은 건드리지 않는다.
 * (크기·위치 / 보호 섹션은 inspector.js가 solid3d에도 표시하도록 이미 처리됨.)
 *
 * 컨트롤: 깊이 · 투영각(+모든 입체에 적용) · 면 음영 · 원기둥 방향.
 *
 * ── 투영각을 왜 "모든 입체에 적용"으로 두었나 ──────────────────────────────
 * 시험지 그림은 상판 위에 블록이 놓이고 그 옆에 스탠드가 서는 식으로 여러 입체가
 * 한 바닥을 공유한다. 각도가 물체마다 1도라도 다르면 즉시 어색해지는데, 손으로
 * 맞추는 건 사실상 불가능하다. 그렇다고 아트보드 스키마에 전역 필드를 새로 넣으면
 * 저장 포맷·페이지·마이그레이션이 전부 딸려온다. 그래서 값은 객체에 그대로 두되
 * (= 옛 저장 파일과 무관, 파일 하나로 자기완결), 한 번에 전파하는 버튼과 "다음에
 * 만들 입체의 기본값"(localStorage)을 함께 제공한다. 실사용상 전역과 같고 비용은 0.
 */

import { makeSection } from "./widgets.js?v=1.3.0";

const DEFAULTS_KEY = "phyDraw.defaults";
const SHADE_LABELS = [["0", "없음(흰 면)"], ["1", "옅게"], ["2", "기본"]];

function row(labelText) {
  const r = document.createElement("div");
  r.className = "insp-row";
  const l = document.createElement("label");
  l.className = "insp-field-label";
  l.textContent = labelText;
  r.appendChild(l);
  return r;
}

function unitSpan(text) {
  const s = document.createElement("span");
  s.className = "insp-unit";
  s.textContent = text;
  return s;
}

export function initSolid3dSection(state) {
  const content = document.getElementById("inspector-content");
  if (!content) return;

  const body = document.createElement("div");
  body.className = "insp-body";

  /* ----- 종류 -----
   * 팔레트에는 직육면체 버튼 하나만 있고(templates.js), 나머지 갈래는 여기서 바꾼다.
   * 갈래마다 필요한 필드가 달라서, 바꿀 때 그 갈래의 기본값을 채워 준다 —
   * 안 채우면 책상으로 바꿨는데 다리가 없거나 좌표축에 이름이 안 뜬다. */
  const KIND_OPTS = [
    ["box", "직육면체"], ["slab", "판·상판"], ["cylinder", "원기둥·원판"],
    ["wedge", "빗면"], ["desk", "실험대·책상"], ["plane", "수평면"],
    ["axes3d", "3차원 좌표축"], ["axesgnd", "평면 위 좌표축"],
  ];
  const kindRow = row("종류");
  const kindSel = document.createElement("select");
  kindSel.className = "insp-input";
  KIND_OPTS.forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v; o.textContent = t;
    kindSel.appendChild(o);
  });
  kindRow.appendChild(kindSel);
  body.appendChild(kindRow);

  /* ----- 깊이 ----- */
  const depthRow = row("깊이");
  const depthInp = document.createElement("input");
  depthInp.type = "number";
  depthInp.min = "0";
  depthInp.step = "0.5";
  depthInp.className = "insp-input";
  depthRow.appendChild(depthInp);
  depthRow.appendChild(unitSpan("mm"));
  body.appendChild(depthRow);

  /* ----- 투영각 ----- */
  const angRow = row("투영각");
  const angInp = document.createElement("input");
  angInp.type = "number";
  angInp.min = "5";
  angInp.max = "85";
  angInp.step = "1";
  angInp.className = "insp-input";
  angRow.appendChild(angInp);
  angRow.appendChild(unitSpan("°"));
  body.appendChild(angRow);

  const applyRow = document.createElement("div");
  applyRow.className = "insp-row";
  const applyBtn = document.createElement("button");
  applyBtn.type = "button";
  applyBtn.className = "modal-btn";   // 인스펙터가 이미 쓰는 버튼 클래스(section-image.js)
  applyBtn.textContent = "이 각도를 모든 입체에 적용";
  applyBtn.style.flex = "1";
  applyBtn.title = "현재 페이지의 모든 입체를 같은 투영각으로 맞추고,\n앞으로 만들 입체의 기본값으로도 저장합니다.";
  applyRow.appendChild(applyBtn);
  body.appendChild(applyRow);

  /* ----- 면 음영 ----- */
  const shadeRow = row("면 음영");
  const shadeSel = document.createElement("select");
  shadeSel.className = "insp-input";
  SHADE_LABELS.forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v; o.textContent = t;
    shadeSel.appendChild(o);
  });
  shadeRow.appendChild(shadeSel);
  body.appendChild(shadeRow);

  /* ----- 책상 전용: 상판 두께 · 다리 굵기(책상일 때만 노출) ----- */
  const topRow = row("상판 두께");
  const topInp = document.createElement("input");
  topInp.type = "number"; topInp.min = "0.6"; topInp.step = "0.5"; topInp.className = "insp-input";
  topRow.appendChild(topInp); topRow.appendChild(unitSpan("mm"));
  body.appendChild(topRow);

  const legRow = row("다리 굵기");
  const legInp = document.createElement("input");
  legInp.type = "number"; legInp.min = "0.6"; legInp.step = "0.5"; legInp.className = "insp-input";
  legRow.appendChild(legInp); legRow.appendChild(unitSpan("mm"));
  body.appendChild(legRow);

  /* ----- 좌표축 전용: 축 이름 3칸(좌표축일 때만 노출) ----- */
  const nameRow = row("축 이름");
  const nameInps = ["x", "y", "z"].map((ph) => {
    const i = document.createElement("input");
    i.type = "text";
    i.className = "insp-input";
    i.placeholder = ph;
    i.style.minWidth = "0";
    i.style.flex = "1";
    nameRow.appendChild(i);
    return i;
  });
  body.appendChild(nameRow);

  const nameShow = row("축 이름 표시");
  const nameCb = document.createElement("input");
  nameCb.type = "checkbox";
  nameShow.appendChild(nameCb);
  body.appendChild(nameShow);

  /* ----- 원기둥 방향(원기둥일 때만 노출) ----- */
  const axisRow = row("방향");
  const axisSel = document.createElement("select");
  axisSel.className = "insp-input";
  [["v", "세로"], ["h", "가로"]].forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v; o.textContent = t;
    axisSel.appendChild(o);
  });
  axisRow.appendChild(axisSel);
  body.appendChild(axisRow);

  const section = makeSection("입체", body);
  section.style.display = "none";
  content.appendChild(section);

  /* ----- 선택된 단일 solid3d 오브젝트(없으면 null) ----- */
  function selected() {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1 || s.targetedId) return null;
    const o = s.objects.find((x) => x.id === ids[0]);
    return o && o.type === "solid3d" ? o : null;
  }

  /* ----- 값 쓰기(Undo 1스텝; locked면 무시) ----- */
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

  // "평면 위 좌표축"은 별도 kind가 아니라 axes3d의 variant다 — 목록에서만 한 줄로 보인다.
  kindSel.addEventListener("change", () => {
    const v = kindSel.value;
    commit((t) => {
      t.kind = v === "axesgnd" ? "axes3d" : v;
      t.variant = v === "axesgnd" ? "ground" : undefined;
      if (t.kind === "axes3d") {
        t.axisLabels = t.axisLabels !== false;
        if (t.labelX == null) t.labelX = "x";
        if (t.labelY == null) t.labelY = "y";
        if (t.labelZ == null) t.labelZ = "z";
        t.fillNone = true;
      }
      if (t.kind === "cylinder" && !t.axis) t.axis = "v";
      if (t.kind === "plane" && !Number.isInteger(t.shade)) t.shade = 1;
      // 깊이가 없거나 0이면 어떤 갈래든 납작하게 나온다 — 최소값을 채운다.
      if (!Number.isFinite(t.depth) || t.depth <= 0) {
        t.depth = Math.max(Math.min(t.w, t.h) * 0.4, 3);
      }
    });
  });

  depthInp.addEventListener("change", () => {
    const v = Number(depthInp.value);
    if (!(v >= 0)) return;
    commit((t) => { t.depth = v; });
  });

  angInp.addEventListener("change", () => {
    const v = Number(angInp.value);
    if (!(v > 0 && v < 90)) return;
    commit((t) => { t.projAngle = v; });
  });

  shadeSel.addEventListener("change", () => {
    commit((t) => { t.shade = Number(shadeSel.value); });
  });

  axisSel.addEventListener("change", () => {
    commit((t) => { t.axis = axisSel.value; });
  });

  topInp.addEventListener("change", () => {
    const v = Number(topInp.value);
    if (!(v > 0)) return;
    commit((t) => { t.topThickness = v; });
  });

  legInp.addEventListener("change", () => {
    const v = Number(legInp.value);
    if (!(v > 0)) return;
    commit((t) => { t.legWidth = v; });
  });

  const NAME_KEYS = ["labelX", "labelY", "labelZ"];
  nameInps.forEach((inp, i) => {
    inp.addEventListener("change", () => {
      commit((t) => { t[NAME_KEYS[i]] = inp.value; });
    });
  });
  nameCb.addEventListener("change", () => {
    commit((t) => { t.axisLabels = nameCb.checked; });
  });

  // 일괄 적용: 잠긴 객체는 건드리지 않는다(보호 섹션의 약속). Undo는 1스텝.
  applyBtn.addEventListener("click", () => {
    const o = selected();
    if (!o) return;
    const v = Number(o.projAngle);
    if (!(v > 0 && v < 90)) return;
    try {
      const d = JSON.parse(localStorage.getItem(DEFAULTS_KEY) || "{}");
      d.solid3dProjAngle = v;
      localStorage.setItem(DEFAULTS_KEY, JSON.stringify(d));
    } catch (_) { /* 저장 실패해도 현재 페이지 적용은 계속한다 */ }
    const s = state.get();
    const snap = JSON.parse(JSON.stringify(s.objects));
    let changed = 0;
    state.update((s2) => {
      s2.objects.forEach((t) => {
        if (t.type === "solid3d" && !t.locked && t.projAngle !== v) { t.projAngle = v; changed += 1; }
      });
      if (changed > 0) { s2.undoStack.push(snap); s2.redoStack = []; }
    });
    applyBtn.textContent = changed > 0 ? `${changed}개 맞춤 · 기본값 ${v}°` : `기본값 ${v}°로 저장됨`;
    setTimeout(() => { applyBtn.textContent = "이 각도를 모든 입체에 적용"; }, 1800);
  });

  /* ----- 표시/값 동기화 ----- */
  function sync() {
    const o = selected();
    if (!o) { section.style.display = "none"; return; }
    section.style.display = "";
    const kind = o.kind || "box";
    if (document.activeElement !== kindSel) {
      kindSel.value = (kind === "axes3d" && o.variant === "ground") ? "axesgnd" : kind;
    }
    const isCyl = kind === "cylinder";
    const isDesk = kind === "desk";
    const isAxes = kind === "axes3d";
    const isGroundAxes = isAxes && o.variant === "ground";
    const isPlane = kind === "plane";
    axisRow.style.display = isCyl ? "" : "none";
    topRow.style.display = isDesk ? "" : "none";
    legRow.style.display = isDesk ? "" : "none";
    nameRow.style.display = isAxes ? "" : "none";
    nameShow.style.display = isAxes ? "" : "none";
    shadeRow.style.display = isAxes ? "none" : "";   // 좌표축엔 칠할 면이 없다
    // 수평면은 깊이를 따로 안 쓴다 — bbox 높이가 곧 깊이의 세로 성분이다.
    // 평면 위 좌표축은 세로로 서는 축이 없어 z축 길이도 의미가 없다.
    depthRow.style.display = (isPlane || isGroundAxes) ? "none" : "";
    depthRow.querySelector(".insp-field-label").textContent = isAxes ? "z축 길이" : "깊이";
    // 평면 위 좌표축은 축이 둘뿐이라 세 번째 이름칸을 감춘다.
    nameInps[2].style.display = isGroundAxes ? "none" : "";
    if (isAxes) {
      if (document.activeElement !== nameInps[0]) nameInps[0].value = o.labelX ?? "x";
      if (document.activeElement !== nameInps[1]) nameInps[1].value = o.labelY ?? "y";
      if (document.activeElement !== nameInps[2]) nameInps[2].value = o.labelZ ?? "z";
      nameCb.checked = o.axisLabels !== false;
    }
    if (isDesk) {
      // 값이 없으면 렌더러가 쓰는 자동 비율을 그대로 보여준다(빈칸보다 낫다).
      const p = Math.max(o.h - Math.abs((o.depth ?? 0) * Math.sin(((o.projAngle ?? 50) * Math.PI) / 180)), 1);
      if (document.activeElement !== topInp) {
        topInp.value = Math.round((Number.isFinite(o.topThickness) ? o.topThickness : p * 0.12) * 10) / 10;
      }
      if (document.activeElement !== legInp) {
        const fw = Math.max(o.w - Math.abs((o.depth ?? 0) * Math.cos(((o.projAngle ?? 50) * Math.PI) / 180)), 1);
        legInp.value = Math.round((Number.isFinite(o.legWidth) ? o.legWidth : fw * 0.045) * 10) / 10;
      }
    }
    if (document.activeElement !== depthInp) {
      depthInp.value = Number.isFinite(o.depth)
        ? Math.round(o.depth * 10) / 10
        : Math.round(Math.min(o.w, o.h) * 0.35 * 10) / 10;
    }
    if (document.activeElement !== angInp) angInp.value = Number.isFinite(o.projAngle) ? o.projAngle : 50;
    if (document.activeElement !== shadeSel) shadeSel.value = String(Number.isInteger(o.shade) ? o.shade : 2);
    if (document.activeElement !== axisSel) axisSel.value = o.axis === "h" ? "h" : "v";
  }

  state.subscribe(sync);
  sync();
}
