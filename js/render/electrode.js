/* ===== RENDER/ELECTRODE: 전극·전지(화학전지·연료전지) =====
 *
 * 기출 `c2_2024_09_01`(연료 전지) 형태를 그대로 옮긴 부품이다.
 * 비커(위가 열린 ㄷ자) + 용액 + 액면선 + 받침 + 전극 막대 2개 + 도선 + 전구.
 * 옵션으로 전구 빛살 · 염다리 · e⁻ 화살표가 붙는다.
 *
 * 스키마 — docs/CHEM_PARTS_SPEC.md §9
 *   x, y, w, h        크기박스(이동·리사이즈는 앱이 처리). 기본 44 × 40 mm
 *   solution          전해질 화학식. "KOH(aq)" — 아래첨자·괄호는 renderGraphLabel 이 처리
 *   liquidColor       용액 색(유일하게 사용자 지정 색)
 *   depth             액면 높이 0~1 (비커 안쪽 높이 기준)
 *   leftLabel, rightLabel   상자 아래 좌·우 설명
 *   lampOn            전구 둘레 빛살 6개
 *   saltBridge        용액 위를 잇는 ㄷ자 관 + "염다리"
 *   showElectronArrow 왼쪽 전극 → 도선 쪽 e⁻ 화살표
 *
 * ── 좌표 (명세 §0 "그림 좌표") ────────────────────────────────────────────
 * 시안 `docs/chem-parts-proposal.html` 의 `cellSVG()` 가 정본이고, 그 좌표계는
 * 가로 52 · 세로 42(빛살 꼭대기 -2 ~ 아래 라벨 40)다. 여기서는 시안 좌표를
 * `<g transform>` 으로 늘이지 않고 **비율로 직접 환산**한다(legend.js·pedigree.js 방식).
 *   DX(u) = x + (u / 52) * w        DY(v) = y + ((v + 2) / 42) * h
 * 그래야 선 굵기·글자가 상자 비율에 딸려 찌그러지지 않는다. 원(전구)·글자처럼
 * 찌그러지면 안 되는 것은 가로·세로 배율의 **작은 쪽(uni)** 하나로만 키운다.
 *
 * 선 굵기는 전부 `sw = obj.strokeWidth ?? 0.35` 의 배수로 적는다(시안의 절대값 /0.35).
 * 색은 `grayHex(obj.strokeLevel ?? 0)` — 검정 하드코딩 금지.
 */

import { SVG_NS, grayHex, makeArrowHead } from "./core.js?v=1.3.0";
import { renderGraphLabel } from "./graph-label.js?v=1.3.0";

/* 시안 좌표계 — cellSVG() 상수 그대로 */
const VB_W = 52;          // 가로 한 변
const VB_H = 42;          // 세로 한 변(빛살 꼭대기 -2 ~ 라벨 baseline 40)
const VB_TOP = -2;        // 시안 y 의 위쪽 끝
const BX = 9, BY = 12, BW = 34, BH = 22;   // 비커 안쪽 상자
const EL_INSET = 7;       // 비커 벽 ↔ 전극 중심
const BASE_H = 1.6;       // 받침 두께
const LIQUID_FILL = "#dcdfe2";   // 받침 색(시안 고정)
const ELECTRODE_FILL = "#d3d6d9";  // 전극 막대 색(시안 고정)

export const ELECTRODE_DEFAULTS = {
  w: 44, h: 40,
  solution: "KOH(aq)",
  liquidColor: "#c9cdd1",
  depth: 0.62,
  leftLabel: "산화 전극",
  rightLabel: "환원 전극",
  lampOn: true,
  saltBridge: false,
  showElectronArrow: true,
};

function num(v, dflt, min = -Infinity) {
  return Number.isFinite(v) && v >= min ? v : dflt;
}

/* ----- 기하 계산: 렌더와 bbox 가 같은 값을 쓰도록 한 곳에서만 정한다. -----
 * 반환 { x, y, w, h, DX, DY, uni, depth }
 *   DX/DY  시안 좌표 → 월드 mm
 *   uni    찌그러지면 안 되는 것(원 반지름·글자 크기)용 단일 배율
 */
export function electrodeLayout(obj) {
  const x = num(obj.x, 0), y = num(obj.y, 0);
  const w = num(obj.w, ELECTRODE_DEFAULTS.w, 0.1);
  const h = num(obj.h, ELECTRODE_DEFAULTS.h, 0.1);
  const sx = w / VB_W, sy = h / VB_H;
  const uni = Math.min(sx, sy);
  const DX = (u) => x + u * sx;
  const DY = (v) => y + (v - VB_TOP) * sy;
  const depth = Math.min(1, Math.max(0, num(obj.depth, ELECTRODE_DEFAULTS.depth)));
  return { x, y, w, h, sx, sy, uni, DX, DY, depth };
}

export function electrodeBBox(obj) {
  const L = electrodeLayout(obj);
  return { x: L.x, y: L.y, w: L.w, h: L.h };
}

/* ----- SVG 조각 헬퍼 (시안 좌표를 받아 월드로 옮겨 그린다) ----- */
function mkLine(g, L, x1, y1, x2, y2, color, width) {
  const n = document.createElementNS(SVG_NS, "line");
  n.setAttribute("x1", L.DX(x1)); n.setAttribute("y1", L.DY(y1));
  n.setAttribute("x2", L.DX(x2)); n.setAttribute("y2", L.DY(y2));
  n.setAttribute("stroke", color);
  n.setAttribute("stroke-width", width);
  g.appendChild(n);
  return n;
}

function mkRect(g, L, x1, y1, x2, y2, fill, color, width) {
  const n = document.createElementNS(SVG_NS, "rect");
  const px = L.DX(x1), py = L.DY(y1);
  n.setAttribute("x", px); n.setAttribute("y", py);
  n.setAttribute("width", Math.max(0, L.DX(x2) - px));
  n.setAttribute("height", Math.max(0, L.DY(y2) - py));
  n.setAttribute("fill", fill);
  if (width > 0) {
    n.setAttribute("stroke", color);
    n.setAttribute("stroke-width", width);
  } else {
    n.setAttribute("stroke", "none");
  }
  g.appendChild(n);
  return n;
}

/* pts = [[u,v], ...] 를 이은 열린 꺾은선(ㄷ자 등) */
function mkPolyline(g, L, pts, color, width) {
  const n = document.createElementNS(SVG_NS, "path");
  n.setAttribute("d", pts.map((p, i) => `${i ? "L" : "M"} ${L.DX(p[0])} ${L.DY(p[1])}`).join(" "));
  n.setAttribute("fill", "none");
  n.setAttribute("stroke", color);
  n.setAttribute("stroke-width", width);
  n.setAttribute("stroke-linejoin", "miter");
  g.appendChild(n);
  return n;
}

function mkLabel(g, L, text, u, v, sizeMm, color, anchor = "middle") {
  const lbl = renderGraphLabel(text, {
    x: L.DX(u), y: L.DY(v), size: sizeMm, color, anchor, vAlign: "baseline", halo: false,
  });
  if (lbl) g.appendChild(lbl);
  return lbl;
}

export function renderElectrode(obj) {
  const color = grayHex(obj.strokeLevel ?? 0);
  const sw = obj.strokeWidth ?? 0.35;
  const L = electrodeLayout(obj);
  const g = document.createElementNS(SVG_NS, "g");

  const liquid = typeof obj.liquidColor === "string" && obj.liquidColor
    ? obj.liquidColor : ELECTRODE_DEFAULTS.liquidColor;

  const bottom = BY + BH;                    // 비커 바닥
  const lvl = BY + BH * (1 - L.depth);       // 액면 높이
  const exL = BX + EL_INSET;                 // 왼쪽 전극 중심
  const exR = BX + BW - EL_INSET;            // 오른쪽 전극 중심
  const lx = (exL + exR) / 2;                // 전구 중심 x
  const lampCy = BY - 9.4;                   // 전구 중심 y
  const wireY = BY - 7.5;                    // 도선 윗변
  const elTop = BY - 3;                      // 전극 막대 윗끝
  const fs = (mm) => Math.max(0.6, mm * L.uni);   // 글자 크기(비율 유지)

  /* 1) 용액 — 액면 ~ 바닥 */
  mkRect(g, L, BX, lvl, BX + BW, bottom, liquid, color, 0);
  /* 2) 액면선 */
  mkLine(g, L, BX, lvl, BX + BW, lvl, color, sw * 0.85);

  /* 3) 비커 — 위가 열린 ㄷ자 */
  mkPolyline(g, L, [[BX, BY], [BX, bottom], [BX + BW, bottom], [BX + BW, BY]], color, sw * 1.6);

  /* 4) 받침 */
  mkRect(g, L, BX - 2, bottom, BX + BW + 2, bottom + BASE_H, LIQUID_FILL, color, sw * 0.85);

  /* 5) 전극 막대 2개 — 위쪽이 액면 위로 나오고, 안쪽에 하이라이트 선 1개 */
  [exL, exR].forEach((ex) => {
    mkRect(g, L, ex - 1.3, elTop, ex + 1.3, elTop + (BH - 3.5), ELECTRODE_FILL, color, sw);
    mkLine(g, L, ex - 0.35, BY - 2.4, ex - 0.35, bottom - 7, color, sw * 0.5);
  });

  /* 6) 도선 — 두 전극 상단을 잇는 ㄷ자(뒤집힌) */
  mkPolyline(g, L, [[exL, elTop], [exL, wireY], [exR, wireY], [exR, elTop]], color, sw * 1.3);

  /* 7) 전구 — 유리구 + 필라멘트 + 소켓. 원은 찌그러지면 안 되므로 uni 배율. */
  const bulb = document.createElementNS(SVG_NS, "circle");
  bulb.setAttribute("cx", L.DX(lx));
  bulb.setAttribute("cy", L.DY(lampCy));
  bulb.setAttribute("r", Math.max(0.3, 2.1 * L.uni));
  bulb.setAttribute("fill", "#ffffff");
  bulb.setAttribute("stroke", color);
  bulb.setAttribute("stroke-width", sw);
  g.appendChild(bulb);
  mkPolyline(g, L, [[lx - 1.1, BY - 8.4], [lx, BY - 9.9], [lx + 1.1, BY - 8.4]], color, sw * 0.85);
  mkRect(g, L, lx - 1.1, BY - 7.9, lx + 1.1, BY - 6.8, "#ffffff", color, sw * 0.85);

  /* 8) 빛살 6개 — 전구 둘레. 방향도 원과 같이 uni 배율로 뽑아야 방사 모양이 유지된다. */
  if (obj.lampOn !== false) {
    const cxw = L.DX(lx), cyw = L.DY(lampCy);
    for (let i = 0; i < 6; i++) {
      const a = (-140 + i * 32) * Math.PI / 180;
      const ln = document.createElementNS(SVG_NS, "line");
      ln.setAttribute("x1", cxw + 3.0 * L.uni * Math.cos(a));
      ln.setAttribute("y1", cyw + 3.0 * L.uni * Math.sin(a));
      ln.setAttribute("x2", cxw + 4.4 * L.uni * Math.cos(a));
      ln.setAttribute("y2", cyw + 4.4 * L.uni * Math.sin(a));
      ln.setAttribute("stroke", color);
      ln.setAttribute("stroke-width", sw * 0.8);
      ln.setAttribute("stroke-linecap", "round");
      g.appendChild(ln);
    }
  }

  /* 9) e⁻ 화살표 — 왼쪽 전극에서 도선 쪽(오른쪽)으로 */
  if (obj.showElectronArrow) {
    const ay = BY - 6.2;
    mkLine(g, L, exL + 1.6, ay, exL + 6.4, ay, color, sw * 0.85);
    // 화살촉은 다른 렌더러와 같은 공용 경로(core.makeArrowHead)를 쓴다.
    g.appendChild(makeArrowHead(L.DX(exL + 6.4), L.DY(ay), 1, 0, sw * 0.85, color));
    mkLabel(g, L, "e^{-}", exL + 4, BY - 7.4, fs(2.5), color, "middle");
  }

  /* 10) 염다리 — 용액 위를 잇는 ㄷ자 관 */
  if (obj.saltBridge) {
    mkPolyline(g, L, [
      [BX + 11, lvl - 1], [BX + 11, lvl - 5], [BX + BW - 11, lvl - 5], [BX + BW - 11, lvl - 1],
    ], color, sw * 1.4);
    mkLabel(g, L, "염다리", BX + BW / 2, lvl - 6.2, fs(2.3), color, "middle");
  }

  /* 11) 전해질 — 용액 가운데 */
  mkLabel(g, L, obj.solution, BX + BW / 2, BY + BH * 0.72, fs(3), color, "middle");

  /* 12) 좌·우 라벨 — 상자 아래 */
  mkLabel(g, L, obj.leftLabel, BX + 4, bottom + 6, fs(2.4), color, "middle");
  mkLabel(g, L, obj.rightLabel, BX + BW - 4, bottom + 6, fs(2.4), color, "middle");

  const rot = obj.rotation ?? 0;
  if (rot) g.setAttribute("transform", `rotate(${rot} ${L.x + L.w / 2} ${L.y + L.h / 2})`);
  if (obj.opacity != null && obj.opacity !== 1) g.setAttribute("opacity", obj.opacity);
  if (obj.id) g.dataset.id = obj.id;
  return g;
}
