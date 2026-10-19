/* ===== INSPECTOR SECTION — 실험 기구(apparatus)의 갈래별 옵션 =====
 *
 * 기구는 상자 하나(x/y/w/h)로 놓이지만 갈래마다 손대야 하는 값이 다르다.
 * 슬릿은 틈 개수·길이·간격, 장치 상자는 라벨·단자, 스피커·자석은 향하는 쪽이다.
 * 전기력선 섹션(section-field.js)과 같은 구조 — 값 하나 = Undo 한 스텝.
 *
 * **여기에 갈래를 추가할 때**: 렌더(js/render/optics-apparatus.js)와 생성 기본값
 * (js/tools.js `type === "apparatus"` 분기) 두 곳도 같이 본다. 세 곳이 어긋나면
 * 인스펙터에서 바꾼 값이 새로 만든 객체에는 안 붙는다.
 */

import { thermometerScale } from "../science-geometry.js?v=1.7.0-four-session-integration";
import { makeSection } from "./widgets.js?v=1.7.0-four-session-integration";

function commit(state, prop, value) {
  const s = state.get();
  const ids = s.selectedIds || [];
  if (ids.length !== 1) return;
  const snap = JSON.parse(JSON.stringify(s.objects));
  state.update((s2) => {
    const o = s2.objects.find((it) => it.id === ids[0]);
    if (!o || o.type !== "apparatus" || o.locked) return;
    if (o[prop] === value) return;
    s2.undoStack.push(snap); s2.redoStack = [];
    o[prop] = value;
    if (o.kind === "thermometer" && (prop === "temperatureMin" || prop === "temperatureMax") && Number.isFinite(o.temperature)) o.temperature = thermometerScale(o).value;
  });
}

function row(body, labelText) {
  const r = document.createElement("div");
  r.className = "insp-row";
  const lbl = document.createElement("label");
  lbl.className = "insp-field-label";
  lbl.textContent = labelText;
  r.appendChild(lbl);
  body.appendChild(r);
  return r;
}

function numberRow(body, labelText, onFire, { min, max, step }) {
  const r = row(body, labelText);
  const inp = document.createElement("input");
  inp.type = "number"; inp.className = "insp-input";
  inp.min = min; inp.max = max; inp.step = step;
  const fire = () => {
    const v = Number(inp.value);
    if (!Number.isFinite(v)) return;
    onFire(Math.min(max, Math.max(min, v)));
  };
  inp.addEventListener("input", fire);
  inp.addEventListener("change", fire);
  r.appendChild(inp);
  return { row: r, inp };
}

function selectRow(body, labelText, options, onPick) {
  const r = row(body, labelText);
  const sel = document.createElement("select");
  sel.className = "insp-input";
  options.forEach(([v, t]) => {
    const op = document.createElement("option");
    op.value = v; op.textContent = t; sel.appendChild(op);
  });
  r.appendChild(sel);
  sel.addEventListener("change", () => onPick(sel.value));
  return { row: r, sel };
}

function checkRow(body, labelText, onToggle) {
  const r = row(body, labelText);
  const cb = document.createElement("input");
  cb.type = "checkbox";
  r.appendChild(cb);
  cb.addEventListener("change", () => onToggle(cb.checked));
  return { row: r, cb };
}

export function buildApparatusSection(ctx) {
  const { state } = ctx;
  // makeSection(title, bodyEl) 은 <details> 하나를 돌려준다 — 본문 요소를 만들어 넘긴다.
  const body = document.createElement("div");
  body.className = "insp-body";
  const section = makeSection("기구 설정", body);

  /* ----- 슬릿 ----- */
  const slitCount = numberRow(body, "틈 개수", (v) => commit(state, "slits", Math.round(v)),
    { min: 1, max: 12, step: 1 });
  const slitLen = numberRow(body, "틈 길이(mm)", (v) => commit(state, "slitLen", v),
    { min: 0.2, max: 40, step: 0.2 });
  const slitGap = numberRow(body, "틈 간격(mm)", (v) => commit(state, "slitGap", v),
    { min: 0.4, max: 40, step: 0.2 });

  /* ----- 장치 상자 ----- */
  const termCount = numberRow(body, "단자 개수", (v) => commit(state, "terminals", Math.round(v)),
    { min: 0, max: 6, step: 1 });
  const termSide = selectRow(body, "단자 위치", [
    ["bottom", "아래"], ["top", "위"], ["left", "왼쪽"], ["right", "오른쪽"],
  ], (v) => commit(state, "termSide", v));
  const plusMinus = checkRow(body, "+ − 표기", (v) => commit(state, "plusMinus", v));
  const emit = selectRow(body, "빛 나가는 쪽", [
    ["", "없음"], ["right", "오른쪽"], ["left", "왼쪽"],
  ], (v) => commit(state, "emit", v || undefined));

  /* ----- 스피커 · 자석 · 트랜지스터 · 온도계 ----- */
  const facing = selectRow(body, "향하는 쪽", [["right", "오른쪽"], ["left", "왼쪽"]],
    (v) => commit(state, "facing", v));
  const waves = checkRow(body, "소리 표시", (v) => commit(state, "showWaves", v));
  const north = selectRow(body, "N극 위치", [["left", "왼쪽·위"], ["right", "오른쪽·아래"]],
    (v) => commit(state, "northSide", v));
  const npn = selectRow(body, "형식", [["npn", "npn"], ["pnp", "pnp"]],
    (v) => commit(state, "variant", v));
  const circled = checkRow(body, "원 두르기", (v) => commit(state, "circled", v));
  const level = numberRow(body, "눈금 높이(0~1)", (v) => commit(state, "level", v),
    { min: 0, max: 1, step: 0.05 });
  const stripes = numberRow(body, "무늬 줄 수", (v) => commit(state, "stripes", Math.round(v)),
    { min: 1, max: 21, step: 2 });
  const leafSpread = numberRow(body, "금속박 벌어짐(0~1)", (v) => commit(state, "leafSpread", v),
    { min: 0, max: 1, step: 0.05 });

  const appearance = selectRow(body, "그림 표현", [["diagram", "단순 도식"], ["exam", "유리 온도계 삽화"]], v => commit(state, "illustrationStyle", v));
  const temperatureMode = selectRow(body, "온도계 설정", [["height", "기둥 비율"], ["value", "온도(°C)"]], v => commit(state, "temperatureMode", v));
  function temperatureRow(label, prop, fallback, min, max) {
    const r = row(body, label), inp = document.createElement("input");
    inp.type = "number"; inp.className = "insp-input"; inp.min = min; inp.max = max; inp.step = 1; r.appendChild(inp);
    inp.addEventListener("change", () => {
      if (!inp.value.trim()) return;
      const v = Number(inp.value); if (!Number.isFinite(v)) return;
      const s = state.get(), ids = s.selectedIds || [];
      if(ids.length !== 1) return;
      const o = s.objects.find(x => x.id === ids[0]);
      if (!o || o.type !== "apparatus" || o.kind !== "thermometer" || o.locked) return;
      const n = Math.max(min, Math.min(max, v)), scale = thermometerScale(o);
      if (prop === "temperatureMin" && n >= scale.max || prop === "temperatureMax" && n <= scale.min) { inp.value = o[prop] ?? fallback; return; }
      commit(state, prop, prop === "temperature" ? Math.max(scale.min, Math.min(scale.max, n)) : n);
    });
    return { row: r, inp, prop, fallback };
  }
  const temperature = temperatureRow("온도(°C)", "temperature", 55, -10000, 10000);
  const tMin = temperatureRow("최솟값(°C)", "temperatureMin", 0, -10000, 10000);
  const tMax = temperatureRow("최댓값(°C)", "temperatureMax", 100, -10000, 10000);
  const tStep = temperatureRow("눈금 간격(°C)", "temperatureStep", 20, 0.1, 10000);
  const tNumbers = checkRow(body, "온도 숫자", v => commit(state, "showTemperatureNumbers", v));

  /* Separate parts retain independent geometry when assembled with vessels. */
  const holes = numberRow(body, "마개 구멍 수", v => commit(state, "holeCount", Math.round(v)), { min: 0, max: 3, step: 1 });
  const taper = numberRow(body, "마개 경사(비율)", v => commit(state, "taper", v), { min: 0, max: 0.3, step: 0.01 });
  const liquid = numberRow(body, "액면 높이(0~1)", v => commit(state, "liquid", v), { min: 0, max: 1, step: 0.05 });
  const valve = numberRow(body, "밸브 각도(°)", v => commit(state, "valveAngle", v), { min: 0, max: 90, step: 5 });
  const bend = numberRow(body, "굽힘 높이(비율)", v => commit(state, "bendAt", v), { min: 0.15, max: 0.8, step: 0.01 });
  const tubeWidth = numberRow(body, "유리관 굵기(비율)", v => commit(state, "tubeWidthRatio", v), { min: 0.02, max: 0.16, step: 0.01 });
  const plateDepth = numberRow(body, "금속판 두께(비율)", v => commit(state, "depthRatio", v), { min: 0.02, max: 0.2, step: 0.01 });
  const loop = numberRow(body, "교반 고리 폭(비율)", v => commit(state, "loopRatio", v), { min: 0.25, max: 0.85, step: 0.05 });
  const bodyRatio = numberRow(body, "깔때기 본체 높이(비율)", v => commit(state, "funnelBodyRatio", v), { min: 0.2, max: 1, step: 0.05 });
  const route = selectRow(body, "관 형태", [["elbow", "한 번 굽힘"], ["bridge", "양쪽 굽힘"]], v => commit(state, "tubeRoute", v));
  const inlet = numberRow(body, "입구 쪽 다리 길이(비율)", v => commit(state, "inletDepth", v), { min: 0.05, max: 0.8, step: 0.05 });
  const PART_FIELDS = [bodyRatio, route, inlet, holes, taper, liquid, valve, bend, tubeWidth, plateDepth, loop];
  const ALL = [...PART_FIELDS, slitCount, slitLen, slitGap, termCount, termSide, plusMinus, emit,
    facing, waves, north, npn, circled, level, stripes, leafSpread, temperatureMode, temperature, tMin, tMax, tStep, tNumbers, appearance];

  // 갈래 → 보여줄 줄. 여기 없는 갈래(도선·나침반·도르래…)는 섹션 자체가 숨는다.
  const BY_KIND = {
    rubber_stopper: [holes, taper],
    dropping_funnel: [liquid, valve, bodyRatio],
    glass_tube: [route, bend, tubeWidth, inlet],
    metal_electrode: [plateDepth],
    stirrer: [loop],
    pipe_valve: [valve],
    slit: [slitCount, slitLen, slitGap],
    device_box: [termCount, termSide, plusMinus, emit],
    speaker: [facing, waves],
    bar_magnet: [north],
    transistor: [npn, circled],
    thermometer: [appearance, level, temperatureMode, temperature, tMin, tMax, tStep, tNumbers],
    fringe_pattern: [stripes],
    electroscope: [leafSpread],
  };

  function syncApparatus(obj) {
    const shown = BY_KIND[obj.kind];
    section.style.display = shown ? "" : "none";
    if (!shown) return;
    ALL.forEach((w) => { w.row.style.display = "none"; });
    shown.forEach((w) => { w.row.style.display = ""; });

    for (const [field, prop, fallback] of [[holes, "holeCount", 2], [taper, "taper", 0.04], [liquid, "liquid", 0], [valve, "valveAngle", 0], [bend, "bendAt", 0.23], [tubeWidth, "tubeWidthRatio", 0.09], [plateDepth, "depthRatio", 0.12], [loop, "loopRatio", 0.68]]) {
      if (document.activeElement !== field.inp) field.inp.value = obj[prop] ?? fallback;
    }
    route.sel.value = obj.tubeRoute === "bridge" ? "bridge" : "elbow";
    inlet.row.style.display = obj.kind === "glass_tube" && obj.tubeRoute === "bridge" ? "" : "none";
    if (document.activeElement !== bodyRatio.inp) bodyRatio.inp.value = obj.funnelBodyRatio ?? 1;
    if (document.activeElement !== inlet.inp) inlet.inp.value = obj.inletDepth ?? 0.35;
    slitCount.inp.value = Math.max(1, Math.round(obj.slits || 1));
    slitLen.inp.value = obj.slitLen ?? 1.6;
    slitGap.inp.value = obj.slitGap ?? 4;
    termCount.inp.value = Number.isFinite(obj.terminals) ? obj.terminals : 2;
    termSide.sel.value = obj.termSide || "bottom";
    plusMinus.cb.checked = !!obj.plusMinus;
    emit.sel.value = obj.emit || "";
    facing.sel.value = obj.facing || "right";
    waves.cb.checked = obj.showWaves !== false;
    north.sel.value = obj.northSide || "left";
    npn.sel.value = obj.variant === "pnp" ? "pnp" : "npn";
    circled.cb.checked = !!obj.circled;
    if (document.activeElement !== level.inp) level.inp.value = obj.level ?? 0.55;
    const mode = obj.temperatureMode || (Number.isFinite(obj.temperature) ? "value" : "height");
    temperatureMode.sel.value = mode;
    appearance.sel.value = obj.illustrationStyle === "exam" ? "exam" : "diagram";
    const scale = thermometerScale(obj);
    for (const f of [temperature, tMin, tMax, tStep]) {
      if (document.activeElement !== f.inp) f.inp.value = obj[f.prop] ?? (f === temperature ? scale.value : f.fallback);
      f.row.style.display = obj.kind === "thermometer" && mode === "value" ? "" : "none";
    }
    if (obj.kind === "thermometer") level.row.style.display = mode === "height" ? "" : "none";
    tNumbers.cb.checked = obj.showTemperatureNumbers !== false;
    tNumbers.row.style.display = obj.kind === "thermometer" && mode === "value" ? "" : "none";
    shown.forEach(f => { const inp = f.inp || f.cb || f.sel; if(inp) inp.disabled = !!obj.locked; });
    stripes.inp.value = obj.stripes || 5;
    leafSpread.inp.value = obj.leafSpread ?? 0.55;
  }

  return { secApparatus: section, syncApparatus };
}
