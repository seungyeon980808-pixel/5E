/* ===== RENDER/BONDGROUP: 구조식(결합선 묶음, 크기박스 계열) =====
 *
 * 기출 화학 도판 280장 중 42장에 나오는 최다 요소(`bond_line`) — 용기 다음으로 크다.
 * 원자 기호를 점으로 놓고 그 사이를 단일·이중·삼중 결합선으로 잇는 그림이다.
 *
 * 규격 정본 — docs/CHEM_PARTS_SPEC.md §0(공통) + §5(bondgroup)
 * 그림 정본 — docs/chem-parts-proposal.html 의 `BONDS` 상수 · `bondPlain()` · `bondSVG()`
 *
 * 시안 좌표계는 **52 × 38** 이고 분자 중심이 (26, 16), 화학식 글자가 y=32.4,
 * 한글 이름이 y=36 에 있다. 여기서는 그 좌표를 `obj.x/y/w/h` 안으로 환산해 넣는다.
 *
 *   - 환산은 **등방(uniform) 배율** 이다. 가로·세로를 따로 늘리면 결합각이 찌그러져
 *     이중결합의 평행선 간격까지 방향마다 달라진다(구조식에서는 명백한 오류).
 *     그래서 s = min(w/52, h/38) 한 값을 쓰고, 남는 여백은 상자 안에서 가운데로 몬다.
 *   - `<g transform scale>` 을 쓰지 않고 **좌표를 직접 계산**한다(legend.js·pedigree.js 방식).
 *     선 굵기와 글자가 배율에 딸려 찌그러지는 문제가 아예 생기지 않는다.
 *   - `bondLength`·`symbolSize` 는 **시안 좌표계 기준 값**이므로 s 를 곱해 쓴다.
 *     선 굵기(`strokeWidth`)는 mm 절대값이라 곱하지 않는다.
 *
 * 원자 기호 뒤에는 **흰 원**을 깔아 결합선을 가린다(시안과 동일). 그래야 선이 기호를
 * 관통하지 않는다. 결합선 자체도 기호 반지름만큼 떨어뜨려 시작·종료하므로 가림은 이중이다.
 *
 * 스키마 — docs/CHEM_PARTS_SPEC.md §5
 *   x, y, w, h        크기박스(이동·리사이즈는 앱이 처리)
 *   molecule          BOND_MOLECULES 8종 중 하나 (기본 "C2H4")
 *   bondLength   8    시안 좌표계 기준 결합 길이
 *   symbolSize   3.2  시안 좌표계 기준 기호 반지름(=흰 원 반지름)
 *   showKoreanName    한글 이름 표시
 *   기본 크기 40 × 26 mm
 */

import { SVG_NS, grayHex } from "./core.js?v=1.4.0";
import { renderGraphLabel } from "./graph-label.js?v=1.4.0";

/* ----- 분자 8종 — 시안 `BONDS` 그대로 -----
 * a: [[기호, 상대x, 상대y], …]   상대좌표 × bondLength 로 배치(중심이 0,0)
 * b: [[i, j, 결합차수], …]       a 의 인덱스 두 개와 1·2·3(단일·이중·삼중)
 * ko: 한글 이름
 */
export const BOND_MOLECULES = {
  H2O: { a: [["H", -1, 0], ["O", 0, 0], ["H", 1, 0]], b: [[0, 1, 1], [1, 2, 1]], ko: "물" },
  CO2: { a: [["O", -1, 0], ["C", 0, 0], ["O", 1, 0]], b: [[0, 1, 2], [1, 2, 2]], ko: "이산화 탄소" },
  N2: { a: [["N", -0.6, 0], ["N", 0.6, 0]], b: [[0, 1, 3]], ko: "질소" },
  C2H2: {
    a: [["H", -1.6, 0], ["C", -0.55, 0], ["C", 0.55, 0], ["H", 1.6, 0]],
    b: [[0, 1, 1], [1, 2, 3], [2, 3, 1]],
    ko: "아세틸렌",
  },
  C2H4: {
    a: [["C", -0.6, 0], ["C", 0.6, 0], ["H", -1.3, -0.85], ["H", -1.3, 0.85], ["H", 1.3, -0.85], ["H", 1.3, 0.85]],
    b: [[0, 1, 2], [0, 2, 1], [0, 3, 1], [1, 4, 1], [1, 5, 1]],
    ko: "에텐",
  },
  HCHO: {
    a: [["C", 0, 0], ["O", 0, -1], ["H", -1, 0.7], ["H", 1, 0.7]],
    b: [[0, 1, 2], [0, 2, 1], [0, 3, 1]],
    ko: "폼알데하이드",
  },
  NH3: {
    a: [["N", 0, 0], ["H", -1, 0.75], ["H", 0, -1], ["H", 1, 0.75]],
    b: [[0, 1, 1], [0, 2, 1], [0, 3, 1]],
    ko: "암모니아",
  },
  CH3OH: {
    a: [["H", -1.7, 0], ["C", -0.6, 0], ["O", 0.6, 0], ["H", 1.7, 0], ["H", -0.6, -1], ["H", -0.6, 1]],
    b: [[0, 1, 1], [1, 2, 1], [2, 3, 1], [1, 4, 1], [1, 5, 1]],
    ko: "메탄올",
  },
};

export const DEFAULT_MOLECULE = "C2H4";

/* 시안 좌표계 */
const VB_W = 52, VB_H = 38;
const VB_CX = 26, VB_CY = 16;   // 분자 중심
const VB_FORMULA_Y = 32.4;      // 화학식 baseline
const VB_KO_Y = 36;             // 한글 이름 baseline
const VB_FORMULA_SIZE = 3;
const VB_KO_SIZE = 2.5;

const DEF_BOND_LENGTH = 8;
const DEF_SYMBOL_SIZE = 3.2;
const PARALLEL_GAP = 1.15;      // 이중·삼중 결합 평행선 간격(시안 bondPlain 의 gap)
const PAD_RATIO = 0.95;         // 결합선을 기호에서 띄우는 양 = symbolSize * 0.95 (시안과 동일)
const SYMBOL_GLYPH_RATIO = 1.25; // 기호 글자 크기 = symbolSize * 1.25 (시안 txt)

/* renderGraphLabel 은 영문·수식 런을 한글 대비 2pt(≈0.71mm) 줄여서 그린다(graph-label.js
 * MATH_TRIM_MM). 시안 글자 크기를 그대로 맞추려면 그만큼 되돌려 넣어야 한다. */
const MATH_TRIM_MM = 0.71;

function num(v, dflt, min) {
  return Number.isFinite(v) && v >= min ? v : dflt;
}

/* 음수 폭·높이를 정상화한 크기박스 */
function normBox(obj) {
  let x = Number.isFinite(obj && obj.x) ? obj.x : 0;
  let y = Number.isFinite(obj && obj.y) ? obj.y : 0;
  let w = Number.isFinite(obj && obj.w) ? obj.w : 40;
  let h = Number.isFinite(obj && obj.h) ? obj.h : 26;
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  return { x, y, w: Math.max(0.1, w), h: Math.max(0.1, h) };
}

export function moleculeOf(obj) {
  const key = obj && obj.molecule;
  return Object.prototype.hasOwnProperty.call(BOND_MOLECULES, key) ? key : DEFAULT_MOLECULE;
}

/* "C2H4" → "C_{2}H_{4}" — renderGraphLabel(formula.js) 의 아래첨자 문법으로 바꾼다. */
function formulaMarkup(key) {
  return String(key).replace(/(\d+)/g, "_{$1}");
}

/* ----- 배치 계산 -----
 * 렌더러와 바깥(bbox·검증)이 같은 값을 쓰도록 한 곳에서만 정한다.
 * 반환 { x, y, w, h, s, key, mol, L, size, pts[], formulaAt, koAt }
 *   pts[i] = { sym, X, Y }   원자 위치(월드 mm)
 */
export function bondGroupLayout(obj) {
  const box = normBox(obj);
  const s = Math.min(box.w / VB_W, box.h / VB_H);          // 등방 배율
  const ox = box.x + (box.w - VB_W * s) / 2;               // 시안 (0,0) 이 놓이는 월드 좌표
  const oy = box.y + (box.h - VB_H * s) / 2;
  const key = moleculeOf(obj);
  const mol = BOND_MOLECULES[key];

  const L = num(obj && obj.bondLength, DEF_BOND_LENGTH, 0.1) * s;
  const size = num(obj && obj.symbolSize, DEF_SYMBOL_SIZE, 0.1) * s;
  const cx = ox + VB_CX * s, cy = oy + VB_CY * s;

  const pts = mol.a.map(([sym, rx, ry]) => ({ sym, X: cx + rx * L, Y: cy + ry * L }));

  return {
    ...box, s, key, mol, L, size, pts,
    gap: PARALLEL_GAP * s,
    formulaAt: { x: cx, y: oy + VB_FORMULA_Y * s, size: VB_FORMULA_SIZE * s },
    koAt: { x: cx, y: oy + VB_KO_Y * s, size: VB_KO_SIZE * s },
  };
}

export function bondGroupBBox(obj) {
  const b = normBox(obj);
  return { x: b.x, y: b.y, w: b.w, h: b.h };
}

/* 결합 한 개 — 차수만큼 평행선을 그린다.
 * 간격은 **결합 방향의 법선** (nx, ny) 으로 주므로, 결합이 기울어져 있어도 눈에 보이는
 * 선 간격이 항상 같다(시안 bondPlain 과 같은 계산). */
function drawBond(g, x1, y1, x2, y2, order, gap, color, sw) {
  const dx = x2 - x1, dy = y2 - y1;
  const d = Math.hypot(dx, dy) || 1;
  const nx = -dy / d, ny = dx / d;
  const n = Math.max(1, Math.min(3, Math.round(order) || 1));
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * gap;
    const l = document.createElementNS(SVG_NS, "line");
    l.setAttribute("x1", x1 + nx * off); l.setAttribute("y1", y1 + ny * off);
    l.setAttribute("x2", x2 + nx * off); l.setAttribute("y2", y2 + ny * off);
    l.setAttribute("stroke", color);
    l.setAttribute("stroke-width", sw);
    l.setAttribute("stroke-linecap", "round");
    g.appendChild(l);
  }
}

export function renderBondGroup(obj) {
  const color = grayHex(obj.strokeLevel ?? 0);
  const sw = obj.strokeWidth ?? 0.35;
  const g = document.createElementNS(SVG_NS, "g");
  const L = bondGroupLayout(obj);

  // ----- 결합선 -----
  // 원자 기호 반지름(× 0.95)만큼 양 끝을 물려 시작·종료한다 → 선이 기호를 찌르지 않는다.
  const pad = L.size * PAD_RATIO;
  L.mol.b.forEach(([i, j, order]) => {
    const A = L.pts[i], B = L.pts[j];
    if (!A || !B) return;
    const dx = B.X - A.X, dy = B.Y - A.Y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    if (d <= pad * 2) return;                   // 결합 길이가 기호보다 짧으면 선을 생략
    drawBond(g, A.X + ux * pad, A.Y + uy * pad, B.X - ux * pad, B.Y - uy * pad, order, L.gap, color, sw);
  });

  // ----- 원자 기호 -----
  // 흰 원을 먼저 깔아 결합선을 가린 뒤 그 위에 기호를 얹는다(시안과 동일한 순서).
  const glyph = Math.max(0.6, L.size * SYMBOL_GLYPH_RATIO + MATH_TRIM_MM);
  L.pts.forEach((p) => {
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", p.X); c.setAttribute("cy", p.Y);
    c.setAttribute("r", L.size);
    c.setAttribute("fill", "#ffffff");
    g.appendChild(c);
    // 원소 기호는 이름표이므로 정자(upright) — 물리량이 아니라 이탤릭이면 안 된다.
    const t = renderGraphLabel(p.sym, {
      x: p.X, y: p.Y, size: glyph, color,
      anchor: "middle", vAlign: "middle", halo: false, upright: true,
    });
    if (t) g.appendChild(t);
  });

  // ----- 화학식 -----
  const fml = renderGraphLabel(formulaMarkup(L.key), {
    x: L.formulaAt.x, y: L.formulaAt.y,
    size: Math.max(0.6, L.formulaAt.size + MATH_TRIM_MM), color,
    anchor: "middle", vAlign: "baseline", halo: false, upright: true,
  });
  if (fml) g.appendChild(fml);

  // ----- 한글 이름 -----
  // 기본값은 표시(spec §5 showKoreanName: true) — 인스펙터 sync 와 판정을 맞춘다.
  if (obj.showKoreanName !== false) {
    const ko = renderGraphLabel(L.mol.ko, {
      x: L.koAt.x, y: L.koAt.y, size: L.koAt.size, color,
      anchor: "middle", vAlign: "baseline", halo: false,
    });
    if (ko) g.appendChild(ko);
  }

  const rot = obj.rotation ?? 0;
  const cx = L.x + L.w / 2, cy = L.y + L.h / 2;
  if (rot) g.setAttribute("transform", `rotate(${rot} ${cx} ${cy})`);
  if (obj.opacity != null && obj.opacity !== 1) g.setAttribute("opacity", obj.opacity);
  if (obj.id) g.dataset.id = obj.id;
  return g;
}
