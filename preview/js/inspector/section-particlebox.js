/* ===== INSPECTOR SECTION — 입자 상자(particlebox) =====
 *
 * 물질의 상태(고체·액체·기체)를 입자로 보여 주는 상자다.
 * 값의 뜻·기본값은 docs/CHEM_PARTS_SPEC.md §3 을 따른다(필드 이름 동일).
 *
 * 배치는 `obj.seed` 로 재현되는 결정적 난수라서, 같은 파일을 다시 열어도 같은 그림이
 * 나온다. 그래서 "다시 뿌리기"는 난수를 새로 돌리는 게 아니라 **seed 를 바꾸는 것**이다
 * — [위치 섞기] 버튼이 하는 일이 그것이다(선형합동 16807 곱셈기).
 *
 * 구조는 section-legend.js 의 selected() / commit() / sync() 3함수 패턴 그대로다.
 */

import { makeSection } from "./widgets.js?v=1.4.0";
import { PARTICLE_STATES, PARTICLE_MOTIONS, PARTICLE_SHAPES } from "../render/particlebox.js?v=1.4.0";

const STATES = [["solid", "고체 (격자)"], ["liquid", "액체"], ["gas", "기체"]];
const MOTIONS = [["none", "없음"], ["trail", "속도선(꼬리)"], ["arrow", "화살표"]];
const SHAPES = [["circle", "원"], ["square", "사각"]];

function row(labelText) {
  const r = document.createElement("div");
  r.className = "insp-row";
  const l = document.createElement("label");
  l.className = "insp-field-label";
  l.textContent = labelText;
  r.appendChild(l);
  return r;
}

function numRow(body, labelText, step, min, unit, title) {
  const r = row(labelText);
  const inp = document.createElement("input");
  inp.type = "number";
  inp.step = String(step);
  inp.min = String(min);
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

function selRow(body, labelText, options, title) {
  const r = row(labelText);
  const sel = document.createElement("select");
  sel.className = "insp-input";
  options.forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v; o.textContent = t;
    sel.appendChild(o);
  });
  r.appendChild(sel);
  if (title) r.title = title;
  body.appendChild(r);
  return sel;
}

export function initParticleBoxSection(state) {
  const content = document.getElementById("inspector-content");
  if (!content) return;

  const body = document.createElement("div");
  body.className = "insp-body";

  // ----- 상태 -----
  const stateSel = selRow(body, "상태", STATES,
    "고체는 격자로 줄 세우고, 액체는 아래쪽에 모이며 액면선이 하나 생깁니다. 기체는 상자 전체에 흩어집니다.");

  // ----- 수치 -----
  const cntInp = numRow(body, "입자 수", 1, 1, "개", "너무 많으면 겹치지 않게 놓을 자리가 없어집니다.");
  const radInp = numRow(body, "입자 크기", 0.05, 0.1, null, "상자 한 변을 24로 봤을 때의 반지름입니다. 상자를 키우면 입자도 같이 커집니다.");

  // ----- 표현 -----
  const motSel = selRow(body, "움직임 표시", MOTIONS,
    "액체·기체에서만 나타납니다. 고체에서는 무시됩니다.");
  const shpSel = selRow(body, "입자 모양", SHAPES, null);

  const mixRow = row("2종 혼합");
  const mixCb = document.createElement("input");
  mixCb.type = "checkbox";
  mixRow.title = "홀수 번째 입자를 진한 색 사각으로 그려 두 종류가 섞인 것처럼 보이게 합니다.";
  mixRow.appendChild(mixCb);
  body.appendChild(mixRow);

  // ----- 위치 섞기 -----
  // 기존 인스펙터 버튼(section-group.js)과 같은 생김새로 맞춘다.
  const shuffleBtn = document.createElement("button");
  shuffleBtn.type = "button";
  shuffleBtn.className = "insp-input";
  shuffleBtn.textContent = "⟳ 위치 섞기";
  shuffleBtn.title = "누를 때마다 겹치지 않게 다시 뿌립니다. 배치는 저장되므로 파일을 다시 열어도 그대로입니다.";
  shuffleBtn.style.cssText =
    "padding:4px 10px;font-size:11px;cursor:pointer;border:1px solid var(--border);" +
    "border-radius:6px;background:var(--bg-input);color:var(--text-primary);width:100%;margin-top:6px;";
  body.appendChild(shuffleBtn);

  const section = makeSection("입자 상자", body);
  section.style.display = "none";
  content.appendChild(section);

  function selected() {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1 || s.targetedId) return null;
    const o = s.objects.find((x) => x.id === ids[0]);
    return o && o.type === "particlebox" ? o : null;
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

  stateSel.addEventListener("change", () => {
    const v = PARTICLE_STATES.includes(stateSel.value) ? stateSel.value : "gas";
    commit((t) => { t.state = v; });
  });
  motSel.addEventListener("change", () => {
    const v = PARTICLE_MOTIONS.includes(motSel.value) ? motSel.value : "none";
    commit((t) => { t.motion = v; });
  });
  shpSel.addEventListener("change", () => {
    const v = PARTICLE_SHAPES.includes(shpSel.value) ? shpSel.value : "circle";
    commit((t) => { t.particleShape = v; });
  });
  mixCb.addEventListener("change", () => {
    commit((t) => { t.mix = mixCb.checked; });
  });
  cntInp.addEventListener("change", () => {
    const v = Math.round(Number(cntInp.value));
    if (!isFinite(v) || v < 1) return;
    commit((t) => { t.count = v; });
  });
  radInp.addEventListener("change", () => {
    const v = Number(radInp.value);
    if (!isFinite(v) || v <= 0) return;
    commit((t) => { t.particleRadius = v; });
  });
  shuffleBtn.addEventListener("click", () => {
    // seed 를 새 값으로 굴린다 — 렌더러가 이 값으로 배치를 다시 계산한다.
    commit((t) => { t.seed = ((t.seed || 7) * 16807 + 11) % 2147483647; });
  });

  function sync() {
    const o = selected();
    if (!o) { section.style.display = "none"; return; }
    section.style.display = "";
    // 편집 중인 칸은 건드리지 않는다(입력 중 커서가 튀는 것 방지).
    if (document.activeElement !== stateSel) stateSel.value = PARTICLE_STATES.includes(o.state) ? o.state : "gas";
    if (document.activeElement !== motSel) motSel.value = PARTICLE_MOTIONS.includes(o.motion) ? o.motion : "none";
    if (document.activeElement !== shpSel) shpSel.value = PARTICLE_SHAPES.includes(o.particleShape) ? o.particleShape : "circle";
    mixCb.checked = o.mix === true;
    if (document.activeElement !== cntInp) cntInp.value = Number.isFinite(o.count) ? o.count : 14;
    if (document.activeElement !== radInp) radInp.value = Number.isFinite(o.particleRadius) ? o.particleRadius : 1.15;
    // 고체에서는 움직임 표시가 무시되므로 컨트롤도 흐리게 해서 오해를 막는다.
    const solid = (o.state || "gas") === "solid";
    motSel.disabled = solid;
    motSel.parentElement.style.opacity = solid ? "0.45" : "";
    // 격자 배치는 난수를 쓰지 않으므로 섞을 것이 없다.
    shuffleBtn.disabled = solid;
    shuffleBtn.style.opacity = solid ? "0.45" : "";
  }

  state.subscribe(sync);
  sync();
}
