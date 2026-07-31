/* ===== RENDER/PERIODIC: 주기율표(크기박스 계열) =====
 *
 * 수능 화학1 단골인 **1~20번 원소의 뼈대만 남긴 주기율표**다.
 * 시안은 docs/chem-parts-proposal.html 의 `PT` 상수 + `perSVG()` 이고, 그 코드가 정본이다.
 * 시안 좌표계는 52 × 30 이지만, 여기서는 그 비율만 가져와 좌표를 **직접 계산**한다
 * (legend.js·particlebox.js 와 같은 방식 — <g transform> 스케일을 쓰지 않으므로
 *  선 굵기와 글자가 상자 크기에 딸려 찌그러지지 않는다).
 *
 * ── 골격 ──────────────────────────────────────────────
 * 전이금속이 없으므로 쓰는 족은 1·2·13·14·15·16·17·18 여덟 줄뿐이다.
 * 다만 **2족과 13족 사이는 한 칸 띄운다** — 실제 주기율표에서 그 자리에 3~12족이
 * 들어가기 때문이고, 이 틈이 있어야 "아, 주기율표구나" 하고 읽힌다(시안 colX 의 +1.6).
 *
 * ── 강조 ──────────────────────────────────────────────
 * 시안은 강조 칸을 연한 파랑(#c8dcf2)으로 칠하지만 **시험지는 무채색**이므로
 * 명세(§10)대로 grayHex(200) 회색으로 칠하고 테두리를 굵게 한다.
 * `highlightSymbols` 가 있으면 강조된 칸의 기호를 **PT 순서대로** 가상 기호(X·Y·Z…)로
 * 바꿔 쓴다. 가상 원소는 진짜 원소 기호가 아니라 '변수'이므로 이탤릭으로 쓴다
 * (실제 원소 기호·원자번호는 정자 = renderGraphLabel 의 upright:true).
 *
 * 스키마 — docs/CHEM_PARTS_SPEC.md §10
 *   x, y, w, h        크기박스(이동·리사이즈는 앱이 처리). 기본 52 × 26 mm
 *   periods           2 | 3 | 4  (1~2주기 / 1~3주기 / 1~4주기(K·Ca))
 *   highlight         강조 원소 기호. 쉼표·공백 구분 ("Na,Cl")
 *   highlightSymbols  강조 칸에 대신 넣을 가상 기호 ("X,Y") — 순서대로 대응
 *   showZ             칸 왼쪽 위 원자번호
 *   metalShade        금속 칸 회색
 */

import { SVG_NS, grayHex } from "./core.js?v=1.3.0";
import { renderGraphLabel } from "./graph-label.js?v=1.3.0";

/* 시안 `PT` 그대로 — [기호, 원자번호, 주기, 족, 금속여부].
 * 족은 1·2·13~18 만 쓴다(전이금속 없음). */
export const PERIODIC_ELEMENTS = [
  ["H", 1, 1, 1, 0], ["He", 2, 1, 18, 0],
  ["Li", 3, 2, 1, 1], ["Be", 4, 2, 2, 1], ["B", 5, 2, 13, 0], ["C", 6, 2, 14, 0],
  ["N", 7, 2, 15, 0], ["O", 8, 2, 16, 0], ["F", 9, 2, 17, 0], ["Ne", 10, 2, 18, 0],
  ["Na", 11, 3, 1, 1], ["Mg", 12, 3, 2, 1], ["Al", 13, 3, 13, 1], ["Si", 14, 3, 14, 0],
  ["P", 15, 3, 15, 0], ["S", 16, 3, 16, 0], ["Cl", 17, 3, 17, 0], ["Ar", 18, 3, 18, 0],
  ["K", 19, 4, 1, 1], ["Ca", 20, 4, 2, 1],
];

/* 쓰는 족(가로 순서). 인덱스 2(13족)부터 앞에 빈칸이 하나 붙는다. */
export const PERIODIC_GROUPS = [1, 2, 13, 14, 15, 16, 17, 18];

// 시안 비율(cw = 5.7 기준). 칸 사이 틈 0.3, 2족↔13족 추가 틈 1.6.
const GAP_RATIO = 0.3 / 5.7;
const BLOCK_GAP_RATIO = 1.6 / 5.7;
// 가로로 놓이는 칸 폭의 합(칸 폭 1 단위). 8칸 + 틈 7개 + 추가 틈 1개.
const SPAN_UNITS = 8 + 7 * GAP_RATIO + BLOCK_GAP_RATIO;

const HL_FILL = grayHex(200);      // 강조 칸 (명세 §10 — 파랑 금지)
const METAL_FILL = grayHex(226);   // 금속 음영 (시안 #e2e4e6)
const HL_STROKE_MUL = 1.8;         // 강조 칸 테두리 굵기 배수 (시안 0.5/0.28)

// graph-label.js 는 영문·수식 런을 한글 대비 2pt(0.71mm) 줄여 그린다. 칸 안에서 기호가
// 눈에 띄게 작아지므로 그만큼 되돌려 넘긴다 — 시안의 글자 크기와 맞추기 위함이다.
const MATH_TRIM_MM = 0.71;

function num(v, dflt, min = 0) {
  return Number.isFinite(v) && v >= min ? v : dflt;
}

/* "Na, Cl" · "Na Cl" 둘 다 받는다(시안 words 와 동일). */
function words(s) {
  return String(s ?? "").split(/[,\s]+/).filter(Boolean);
}

function normPeriods(v) {
  const n = Math.round(Number(v));
  if (n === 2 || n === 3) return n;
  return 4;
}

/* ----- 배치 계산 -----
 * 렌더러·바깥(아이콘 등)이 같은 값을 쓰도록 배치를 한 곳에서만 정한다.
 * 표는 상자(x,y,w,h)를 **가득 채운다** — 크기박스 계열이라 상자가 먼저 주어지기 때문이다.
 * 반환 { x, y, w, h, cw, ch, maxP, cells[] }
 *   cells[i] = { sym, z, period, group, metal, x, y, label, italic, hit }
 */
export function periodicLayout(obj) {
  const x = num(obj.x, 0, -Infinity), y = num(obj.y, 0, -Infinity);
  const w = num(obj.w, 52, 0.1), h = num(obj.h, 26, 0.1);
  const maxP = normPeriods(obj.periods ?? 4);

  const cw = w / SPAN_UNITS;
  const gap = cw * GAP_RATIO;
  const blockGap = cw * BLOCK_GAP_RATIO;
  const ch = h / maxP;   // 세로는 칸끼리 붙는다(시안과 동일)

  const colX = (group) => {
    const i = PERIODIC_GROUPS.indexOf(group);
    return x + i * (cw + gap) + (i >= 2 ? blockGap : 0);
  };

  const hlSet = new Set(words(obj.highlight).map((s) => s.toUpperCase()));
  const subs = words(obj.highlightSymbols);
  let used = 0;   // 강조 칸을 만난 순서대로 가상 기호를 하나씩 꺼내 쓴다(시안과 동일)

  const cells = [];
  PERIODIC_ELEMENTS.forEach(([sym, z, period, group, metal]) => {
    if (period > maxP) return;
    const hit = hlSet.has(sym.toUpperCase());
    const sub = hit && used < subs.length ? subs[used++] : null;
    cells.push({
      sym, z, period, group, metal: !!metal, hit,
      x: colX(group),
      y: y + (period - 1) * ch,
      label: sub != null ? sub : sym,
      // 가상 기호만 이탤릭(변수). 진짜 원소 기호는 정자.
      italic: sub != null,
    });
  });

  return { x, y, w, h, cw, ch, maxP, cells };
}

export function periodicBBox(obj) {
  const L = periodicLayout(obj);
  return { x: L.x, y: L.y, w: L.w, h: L.h };
}

export function renderPeriodic(obj) {
  const color = grayHex(obj.strokeLevel ?? 0);
  const sw = obj.strokeWidth ?? 0.35;
  const L = periodicLayout(obj);
  const showZ = obj.showZ !== false;
  const metalShade = !!obj.metalShade;

  // 글자 크기 — 칸의 가로·세로 중 좁은 쪽에 맞춘다(시안 2.6 / 칸 5.7×6 비율).
  const symSize = Math.max(0.6, Math.min(L.cw * 0.46, L.ch * 0.44));
  const zSize = Math.max(0.5, symSize * 0.65);

  const g = document.createElementNS(SVG_NS, "g");

  L.cells.forEach((c) => {
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", c.x);
    rect.setAttribute("y", c.y);
    rect.setAttribute("width", L.cw);
    rect.setAttribute("height", L.ch);
    rect.setAttribute("fill", c.hit ? HL_FILL : (metalShade && c.metal ? METAL_FILL : "#ffffff"));
    rect.setAttribute("stroke", color);
    rect.setAttribute("stroke-width", c.hit ? sw * HL_STROKE_MUL : sw);
    g.appendChild(rect);

    // 원자번호 — 칸 왼쪽 위 작게.
    if (showZ) {
      const zl = renderGraphLabel(String(c.z), {
        x: c.x + L.cw * 0.16,
        y: c.y + L.ch * 0.12,
        size: zSize + MATH_TRIM_MM,
        color, anchor: "start", vAlign: "top", halo: false, upright: true,
      });
      if (zl) g.appendChild(zl);
    }

    // 기호 — 칸 가운데. 원자번호가 있으면 그만큼 아래로 내린다(시안 y+ch*0.72 자리).
    const lbl = renderGraphLabel(c.label, {
      x: c.x + L.cw / 2,
      y: c.y + L.ch * (showZ ? 0.62 : 0.5),
      size: symSize + MATH_TRIM_MM,
      color, anchor: "middle", vAlign: "middle", halo: false,
      upright: !c.italic,
    });
    if (lbl) g.appendChild(lbl);
  });

  const rot = obj.rotation ?? 0;
  if (rot) g.setAttribute("transform", `rotate(${rot} ${L.x + L.w / 2} ${L.y + L.h / 2})`);
  if (obj.opacity != null && obj.opacity !== 1) g.setAttribute("opacity", obj.opacity);
  if (obj.id) g.dataset.id = obj.id;
  return g;
}
