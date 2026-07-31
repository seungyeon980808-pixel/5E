/* ===== RENDER/AXISBREAK: 축 생략 물결(크기박스 계열) =====
 *
 * 그래프 축의 중간을 잘라내고 "여기는 생략했다"고 알리는 기호다.
 * **사선(≈)이 아니라 물결 두 줄**이다 — 기출 `c2_2024_09_03` 확인 결과.
 * 화학 11장 · 물리 7장에 나오는 **두 과목 공용** 부품이라 과목 이름을 안 붙였다.
 *
 * 그리는 순서가 곧 이 부품의 전부다:
 *   ① 두 물결선 사이를 **흰색 rect 로 채운다** → 밑에 깔린 그래프 선·축이 가려진다.
 *   ② 그 위에 물결선 2개를 그린다.
 * 순서를 바꾸면 물결이 흰 칠에 먹혀 사라진다.
 *
 * 치수는 **전부 절대값(mm)** 이다. 축 생략 기호는 그래프가 크든 작든 같은 크기로
 * 보여야 하므로 상자 크기에 비례시키지 않는다. 상자(w·h)가 정하는 것은
 * **어디를 얼마나 길게 자르는가**(물결이 가로지르는 길이)뿐이다.
 *
 * 스키마 — docs/CHEM_PARTS_SPEC.md §7
 *   x, y, w, h    크기박스(이동·리사이즈는 앱이 처리). 기본 30 × 4 mm
 *   dir           "horizontal"(가로로 자름) | "vertical"(세로로 자름)
 *   amp    0.5    물결 진폭(mm)
 *   gap    1.6    두 줄 간격(mm)
 *   period 3.0    물결 한 마디의 길이(mm)
 *   strokeLevel 0 · strokeWidth 0.3 · rotation 0
 *
 * 세로(vertical)는 같은 코드를 `rotate(90 cx cy)` 로 돌려서 재사용한다
 * (시안 `docs/chem-parts-proposal.html` 의 brkSVG 와 같은 방식).
 */

import { SVG_NS, grayHex } from "./core.js?v=1.4.0";

const DEF_AMP = 0.5;
const DEF_GAP = 1.6;
const DEF_PERIOD = 3.0;
const DEF_SW = 0.3;

/* 물결이 상자 끝보다 넘치는 길이(mm).
 * 딱 맞게 끝내면 축선이 살짝 남아 "끊긴" 느낌이 안 난다. 시안과 같은 2mm. */
const OVERHANG = 2;

function num(v, dflt, min = 0) {
  return Number.isFinite(v) && v >= min ? v : dflt;
}

/* ----- 물결 경로 -----
 * (x1,y) → (x2,y) 를 잇는 사인 모양 경로. 한 마디(per)마다 위로 한 번·아래로 한 번.
 * 시안(docs/chem-parts-proposal.html)의 wavePath() 가 정본이므로 그대로 옮겼다.
 * 마지막 마디는 남은 길이에 맞춰 줄어든다(p = min(per, 남은 길이)).
 */
export function wavePath(x1, x2, y, amp = DEF_AMP, per = DEF_PERIOD) {
  const step = per > 0.01 ? per : DEF_PERIOD;
  let d = `M ${x1} ${y}`;
  for (let x = x1; x < x2 - 0.01; x += step) {
    const p = Math.min(step, x2 - x);
    d += ` Q ${x + p * 0.25} ${y - amp} ${x + p * 0.5} ${y}`;
    d += ` Q ${x + p * 0.75} ${y + amp} ${x + p} ${y}`;
  }
  return d;
}

/* ----- 배치 계산 -----
 * 렌더러 밖에서도 같은 값을 쓸 수 있게 한 곳에서만 정한다.
 * 반환 { x, y, w, h, cx, cy, vert, amp, gap, period, span }
 *   span = 물결이 실제로 가로지르는 길이(상자 길이 + 양끝 넘침)
 * vert 인 경우에도 좌표는 **가로로 그린 상태** 기준이다. 회전은 렌더에서 건다.
 */
export function axisBreakLayout(obj) {
  const x = num(obj.x, 0, -Infinity), y = num(obj.y, 0, -Infinity);
  const w = num(obj.w, 30, 0.1), h = num(obj.h, 4, 0.1);
  const vert = obj.dir === "vertical";
  const amp = num(obj.amp, DEF_AMP, 0.01);
  const gap = num(obj.gap, DEF_GAP, 0.01);
  const period = num(obj.period, DEF_PERIOD, 0.1);
  // 가로로 자르면 상자의 가로폭을, 세로로 자르면 상자의 높이를 가로지른다.
  const span = (vert ? h : w) + OVERHANG * 2;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2, vert, amp, gap, period, span };
}

export function axisBreakBBox(obj) {
  const L = axisBreakLayout(obj);
  return { x: L.x, y: L.y, w: L.w, h: L.h };
}

export function renderAxisBreak(obj) {
  const color = grayHex(obj.strokeLevel ?? 0);
  const sw = obj.strokeWidth ?? DEF_SW;
  const L = axisBreakLayout(obj);
  const g = document.createElementNS(SVG_NS, "g");

  // 세로로 자를 때는 가로 코드를 그대로 쓰고 상자 중심에서 90도 돌린다.
  const inner = document.createElementNS(SVG_NS, "g");
  if (L.vert) inner.setAttribute("transform", `rotate(90 ${L.cx} ${L.cy})`);
  g.appendChild(inner);

  const x1 = L.cx - L.span / 2;
  const x2 = L.cx + L.span / 2;
  const yTop = L.cy - L.gap / 2;
  const yBot = L.cy + L.gap / 2;

  // ① 두 줄 사이를 흰색으로 덮는다 — 아래 그래프를 가리는 것이 이 부품의 목적이다.
  //    물결이 진폭만큼 위아래로 흔들리므로 amp 만큼 여유를 더 준다.
  const mask = document.createElementNS(SVG_NS, "rect");
  mask.setAttribute("x", x1);
  mask.setAttribute("y", yTop - L.amp);
  mask.setAttribute("width", L.span);
  mask.setAttribute("height", L.gap + L.amp * 2);
  mask.setAttribute("fill", "#ffffff");
  inner.appendChild(mask);

  // ② 물결선 2개
  [yTop, yBot].forEach((yy) => {
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", wavePath(x1, x2, yy, L.amp, L.period));
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", color);
    p.setAttribute("stroke-width", sw);
    p.setAttribute("stroke-linecap", "round");
    inner.appendChild(p);
  });

  const rot = obj.rotation ?? 0;
  if (rot) g.setAttribute("transform", `rotate(${rot} ${L.cx} ${L.cy})`);
  if (obj.opacity != null && obj.opacity !== 1) g.setAttribute("opacity", obj.opacity);
  if (obj.id) g.dataset.id = obj.id;
  return g;
}
