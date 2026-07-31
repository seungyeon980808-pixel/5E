/* ===== INSPECTOR SECTION — 화학 그래프(chemgraph) =====
 *
 * 종류(kind)를 맨 위에서 고르고, 고른 종류의 행만 보여 준다.
 * 세 갈래가 쓰는 값이 완전히 달라서 한꺼번에 늘어놓으면 패널이 길어지기 때문이다.
 *   energy     반응물·생성물·봉우리 높이(0~1) + 촉매 곡선 · Ea·ΔH 화살표
 *   titration  적정 종류 · 당량점 부피(0~1) · 당량점 pH · 당량점 표시
 *   phase      물 여부 · 삼중점(x,y) · 임계점(x,y) · 영역 이름
 *
 * 삼중점·임계점은 **중첩 객체**({x, y})라서 입력 칸은 2개지만 commit 때는
 * `t.triplePt = { x, y }` 로 통째로 넣는다(부분 대입은 마이그레이션·복사에서 깨진다).
 *
 * 필드 이름·기본값의 뜻은 docs/CHEM_PARTS_SPEC.md §8 을 따른다.
 */

import { makeSection } from "./widgets.js?v=1.3.0";
import { CHEMGRAPH_KINDS, CHEMGRAPH_ACID_TYPES } from "../render/chemgraph.js?v=1.3.0";

const KIND_LABELS = [
  ["energy", "반응 에너지 도표"],
  ["titration", "중화 적정 곡선"],
  ["phase", "상평형 그림"],
];

const ACID_LABELS = [
  ["sw", "강산 – 강염기"],
  ["ww", "약산 – 강염기"],
];

const DEF_TP = { x: 0.34, y: 0.3 };
const DEF_CP = { x: 0.82, y: 0.82 };

function row(labelText) {
  const r = document.createElement("div");
  r.className = "insp-row";
  const l = document.createElement("label");
  l.className = "insp-field-label";
  l.textContent = labelText;
  r.appendChild(l);
  return r;
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
  return { row: r, el: sel };
}

function numRow(body, labelText, step, min, max, unit, title) {
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
  return { row: r, el: inp };
}

/* x·y 를 한 줄에서 받는 행 (삼중점·임계점) */
function xyRow(body, labelText, step, min, max, title) {
  const r = row(labelText);
  const mk = (ph) => {
    const inp = document.createElement("input");
    inp.type = "number";
    inp.step = String(step);
    inp.min = String(min);
    inp.max = String(max);
    inp.className = "insp-input";
    inp.placeholder = ph;
    inp.style.flex = "1";
    inp.style.minWidth = "0";
    r.appendChild(inp);
    return inp;
  };
  const xi = mk("x"), yi = mk("y");
  if (title) r.title = title;
  body.appendChild(r);
  return { row: r, x: xi, y: yi };
}

function chkRow(body, labelText, title) {
  const r = row(labelText);
  const cb = document.createElement("input");
  cb.type = "checkbox";
  r.appendChild(cb);
  if (title) r.title = title;
  body.appendChild(r);
  return { row: r, el: cb };
}

export function initChemGraphSection(state) {
  const content = document.getElementById("inspector-content");
  if (!content) return;

  const body = document.createElement("div");
  body.className = "insp-body";

  // ----- 종류 (맨 위) -----
  const kind = selRow(body, "종류", KIND_LABELS, "고른 종류의 값만 아래에 나타납니다.");

  // ----- energy -----
  const rea = numRow(body, "반응물 높이", 0.01, 0, 1, null, "0~1. 그래프 왼쪽 평탄부의 높이입니다.");
  const pro = numRow(body, "생성물 높이", 0.01, 0, 1, null, "생성물이 반응물보다 낮으면 발열, 높으면 흡열입니다.");
  const peak = numRow(body, "활성화 봉우리", 0.01, 0, 1, null, "가운데 봉우리의 높이입니다.");
  const cat = chkRow(body, "촉매 곡선", "봉우리가 낮아진 점선 곡선을 함께 그립니다.");
  const marks = chkRow(body, "Ea·ΔH 화살표", "준위 점선과 양방향 화살표를 그립니다.");

  // ----- titration -----
  const acid = selRow(body, "적정 종류", ACID_LABELS, "약산–강염기로 바꾸면 당량점 전에 완충 구간이 생깁니다.");
  const eqV = numRow(body, "당량점 부피", 0.01, 0, 1, null, "0~1. 가로축에서 당량점의 위치입니다.");
  const eqPH = numRow(body, "당량점 pH", 0.1, 0, 14, null, null);
  const eqShow = chkRow(body, "당량점 표시", "당량점 점 + 가로·세로 점선 + 이름표를 그립니다.");

  // ----- phase -----
  const water = chkRow(body, "물", "물이면 융해 곡선이 왼쪽으로 기웁니다.");
  const tp = xyRow(body, "삼중점", 0.01, 0, 1, "0~1 비율. 왼쪽이 x(온도), 오른쪽이 y(압력)입니다.");
  const cp = xyRow(body, "임계점", 0.01, 0, 1, "0~1 비율. 왼쪽이 x(온도), 오른쪽이 y(압력)입니다.");
  const names = chkRow(body, "영역 이름", "고체·액체·기체·삼중점·임계점 이름을 넣습니다.");

  const BY_KIND = {
    energy: [rea.row, pro.row, peak.row, cat.row, marks.row],
    titration: [acid.row, eqV.row, eqPH.row, eqShow.row],
    phase: [water.row, tp.row, cp.row, names.row],
  };

  const section = makeSection("화학 그래프", body);
  section.style.display = "none";
  content.appendChild(section);

  function selected() {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1 || s.targetedId) return null;
    const o = s.objects.find((x) => x.id === ids[0]);
    return o && o.type === "chemgraph" ? o : null;
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

  /* 0~1(또는 0~14) 범위 숫자 칸 한 개 배선 */
  function bindNum(inp, key, min, max) {
    inp.addEventListener("change", () => {
      const v = Number(inp.value);
      if (!isFinite(v) || v < min || v > max) return;
      commit((t) => { t[key] = v; });
    });
  }

  /* 중첩 객체 {x, y} — 두 칸을 함께 읽어 통째로 대입한다. */
  function bindPt(pair, key) {
    const apply = () => {
      const vx = Number(pair.x.value), vy = Number(pair.y.value);
      if (!isFinite(vx) || vx < 0 || vx > 1) return;
      if (!isFinite(vy) || vy < 0 || vy > 1) return;
      commit((t) => { t[key] = { x: vx, y: vy }; });
    };
    pair.x.addEventListener("change", apply);
    pair.y.addEventListener("change", apply);
  }

  kind.el.addEventListener("change", () => {
    const v = CHEMGRAPH_KINDS.includes(kind.el.value) ? kind.el.value : "energy";
    commit((t) => { t.kind = v; });
  });
  acid.el.addEventListener("change", () => {
    const v = CHEMGRAPH_ACID_TYPES.includes(acid.el.value) ? acid.el.value : "sw";
    commit((t) => { t.acidType = v; });
  });

  bindNum(rea.el, "reactant", 0, 1);
  bindNum(pro.el, "product", 0, 1);
  bindNum(peak.el, "peak", 0, 1);
  bindNum(eqV.el, "eqVolume", 0, 1);
  bindNum(eqPH.el, "eqPH", 0, 14);
  bindPt(tp, "triplePt");
  bindPt(cp, "criticalPt");

  cat.el.addEventListener("change", () => commit((t) => { t.showCatalyst = cat.el.checked; }));
  marks.el.addEventListener("change", () => commit((t) => { t.showMarks = marks.el.checked; }));
  eqShow.el.addEventListener("change", () => commit((t) => { t.showEqPoint = eqShow.el.checked; }));
  water.el.addEventListener("change", () => commit((t) => { t.isWater = water.el.checked; }));
  names.el.addEventListener("change", () => commit((t) => { t.showRegionNames = names.el.checked; }));

  function setNum(inp, v, dflt) {
    if (document.activeElement === inp) return;   // 입력 중인 칸은 건드리지 않는다
    inp.value = Number.isFinite(v) ? v : dflt;
  }

  function sync() {
    const o = selected();
    if (!o) { section.style.display = "none"; return; }
    section.style.display = "";

    const k = CHEMGRAPH_KINDS.includes(o.kind) ? o.kind : "energy";
    if (document.activeElement !== kind.el) kind.el.value = k;
    Object.keys(BY_KIND).forEach((key) => {
      BY_KIND[key].forEach((r) => { r.style.display = key === k ? "" : "none"; });
    });

    setNum(rea.el, o.reactant, 0.42);
    setNum(pro.el, o.product, 0.2);
    setNum(peak.el, o.peak, 0.85);
    cat.el.checked = o.showCatalyst === true;
    marks.el.checked = o.showMarks !== false;

    if (document.activeElement !== acid.el) {
      acid.el.value = CHEMGRAPH_ACID_TYPES.includes(o.acidType) ? o.acidType : "sw";
    }
    setNum(eqV.el, o.eqVolume, 0.5);
    setNum(eqPH.el, o.eqPH, 7);
    eqShow.el.checked = o.showEqPoint !== false;

    water.el.checked = o.isWater !== false;
    const t = o.triplePt && typeof o.triplePt === "object" ? o.triplePt : DEF_TP;
    const c = o.criticalPt && typeof o.criticalPt === "object" ? o.criticalPt : DEF_CP;
    setNum(tp.x, t.x, DEF_TP.x);
    setNum(tp.y, t.y, DEF_TP.y);
    setNum(cp.x, c.x, DEF_CP.x);
    setNum(cp.y, c.y, DEF_CP.y);
    names.el.checked = o.showRegionNames !== false;
  }

  state.subscribe(sync);
  sync();
}
