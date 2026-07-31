/* ===== RENDER/CHEMCHART: 막대·원그래프 (크기박스 계열) =====
 *
 * 화학 기출 23장에서 되풀이되는 두 그림이다.
 *   bar — 물질별 양(mol)을 막대로. 눈금값 점선(수선의 발)이 자주 붙는다.
 *   pie — 성분비 원그래프. 조각 색을 따로 주고, 아래에 "1 : 3" 비율을 적는다.
 *
 * 정본은 `docs/chem-parts-proposal.html` 의 `barSVG()` / `pieSVG()` 다. 시안은
 * bar 52×40 · pie 40×40 고정 좌표계로 그려져 있어서, 여기서는 그 좌표를 **비율로 읽어**
 * `obj.x, obj.y, obj.w, obj.h` 안에 직접 계산해 넣는다(legend.js·pedigree.js 와 같은 방식).
 * `<g transform="scale()">` 를 쓰지 않는 이유는 하나다 — **글자가 찌그러지면 안 되기 때문**이다.
 * 선 굵기도 같은 이유로 스케일과 무관하게 obj.strokeWidth 를 그대로 쓴다.
 *
 * 스키마 — docs/CHEM_PARTS_SPEC.md §6
 *   x, y, w, h    크기박스(이동·리사이즈는 앱이 처리)
 *   kind          "bar" | "pie"
 *   values        "3,5,2,4"   쉼표로 끊는다
 *   names         "A,B,C,D"
 *   xTitle/yTitle 축 이름            (bar)
 *   showGuide     눈금값 가로 점선 + 값 라벨 (bar)
 *   colors[]      조각 색             (pie) — 값이 색보다 많으면 순환
 *   showRatio     하단 "1 : 3"        (pie)
 *   showTick      둘레 눈금 12개      (pie)
 *   기본 크기: bar 44 × 34 · pie 32 × 34 mm
 *
 * 글자는 전부 renderGraphLabel 로 그린다 — 한글·아래첨자(H_2O)·위첨자가 이 경로에서만
 * 자동 처리된다. 직접 <text> 를 만들지 않는다.
 */

import { SVG_NS, grayHex, applyDash, makeArrowHead } from "./core.js?v=1.3.0";
import { renderGraphLabel } from "./graph-label.js?v=1.3.0";

/* 조각 기본 색 — 기출은 무채색이다(시안 pState.colors 와 동일). */
export const CHEMCHART_PIE_COLORS = ["#ffffff", "#c9c9c9", "#8f8f8f", "#e4e4e4", "#6f6f6f"];

const BAR_FILL = "#d5d8db";      // 시안 barSVG 의 막대 채움
const BAR_VB_W = 52, BAR_VB_H = 40;   // 시안 bar 좌표계
const PIE_VB = 40;                    // 시안 pie 좌표계

/* ----- 입력 파싱 ----- */
function parseValues(src) {
  return String(src ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

function parseNames(src) {
  return String(src ?? "").split(",").map((s) => s.trim());
}

/* 크기박스 정규화 — 음수 폭/높이(뒤집어 끈 경우)를 바로잡는다. */
function box(obj) {
  const w = Number.isFinite(obj.w) ? obj.w : 44;
  const h = Number.isFinite(obj.h) ? obj.h : 34;
  const x = Number.isFinite(obj.x) ? obj.x : 0;
  const y = Number.isFinite(obj.y) ? obj.y : 0;
  return {
    x: w < 0 ? x + w : x,
    y: h < 0 ? y + h : y,
    w: Math.max(0.1, Math.abs(w)),
    h: Math.max(0.1, Math.abs(h)),
  };
}

export function chemChartBBox(obj) {
  return box(obj);
}

/* ----- 작은 도우미 ----- */
function el(name, attrs) {
  const n = document.createElementNS(SVG_NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

function addLabel(g, text, opts) {
  const node = renderGraphLabel(text, { halo: false, ...opts });
  if (node) g.appendChild(node);
  return node;
}

/* 화살촉 달린 축 한 줄 — 시안 arrow() 와 같은 모양. */
function axis(g, x1, y1, x2, y2, color, sw) {
  g.appendChild(el("line", {
    x1, y1, x2, y2, stroke: color, "stroke-width": sw, "stroke-linecap": "round",
  }));
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  g.appendChild(makeArrowHead(x2, y2, dx / len, dy / len, sw, color));
}

/* ══════════ bar — 막대그래프 ══════════
 * 시안 barSVG: x0=9, y0=31, W=38, H=24 (52×40 좌표계)
 * 막대 개수·너비·간격은 값 개수에 따라 자동으로 잡힌다.
 */
function renderBar(g, obj, B, color, sw) {
  const values = parseValues(obj.values);
  const names = parseNames(obj.names);
  const n = values.length;

  // 시안 좌표 → 실제 좌표. 가로/세로를 따로 늘이되(그림틀), 글자 크기만 균일 배율을 쓴다.
  const kx = B.w / BAR_VB_W, ky = B.h / BAR_VB_H;
  const s = Math.min(kx, ky);                       // 글자 배율(찌그러짐 방지)
  const X = (u) => B.x + u * kx;
  const Y = (v) => B.y + v * ky;

  const x0 = X(9), y0 = Y(31);
  const W = 38 * kx, H = 24 * ky;

  axis(g, x0, y0, x0 + W, y0, color, sw);           // 가로축
  axis(g, x0, y0, x0, y0 - H, color, sw);           // 세로축

  const max = Math.max(...values, 1) * 1.15;
  const bw = Math.min(5.5 * kx, W / (Math.max(1, n) * 1.9));
  const showGuide = obj.showGuide !== false;

  values.forEach((val, i) => {
    const cx = x0 + W * (i + 0.85) / (n + 0.9);
    const bh = Math.max(0, H * 0.86 * val / max);

    g.appendChild(el("rect", {
      x: cx - bw / 2, y: y0 - bh, width: bw, height: bh,
      fill: BAR_FILL, stroke: color, "stroke-width": sw * 0.85,
    }));

    if (showGuide) {
      // 눈금값 점선(수선의 발) — 세로축에서 막대 왼쪽 모서리까지.
      const gl = el("line", {
        x1: x0, y1: y0 - bh, x2: cx - bw / 2, y2: y0 - bh,
        stroke: color, "stroke-width": sw * 0.6,
      });
      applyDash(gl, { dashLength: 1.1, dashGap: 0.8 });
      g.appendChild(gl);
      addLabel(g, String(val), {
        x: X(9 - 1.4), y: y0 - bh, size: 2.3 * s, color, anchor: "end", vAlign: "middle",
      });
    }

    addLabel(g, names[i] || "", {
      x: cx, y: Y(31 + 3.2), size: 2.5 * s, color, anchor: "middle", vAlign: "baseline",
    });
  });

  addLabel(g, obj.xTitle ?? "", {
    x: x0 + W / 2, y: Y(38), size: 2.5 * s, color, anchor: "middle", vAlign: "baseline",
  });
  addLabel(g, obj.yTitle ?? "", {
    x: X(9 - 3.2), y: Y(5.6), size: 2.5 * s, color, anchor: "start", vAlign: "baseline",
  });
}

/* ══════════ pie — 원그래프 ══════════
 * 시안 pieSVG: cx=20, cy=19, R=12.5 (40×40 좌표계). 12시에서 시작해 시계 방향.
 * 원이 타원으로 찌그러지면 안 되므로 반지름은 가로·세로 중 **작은 쪽**을 따른다.
 */
function renderPie(g, obj, B, color, sw) {
  const values = parseValues(obj.values).map((v) => Math.max(0, v));
  const names = parseNames(obj.names);
  const colors = Array.isArray(obj.colors) && obj.colors.length ? obj.colors : CHEMCHART_PIE_COLORS;
  const n = values.length;

  const kx = B.w / PIE_VB, ky = B.h / PIE_VB;
  const s = Math.min(kx, ky);
  const R = 12.5 * s;
  const cx = B.x + B.w / 2;
  const cy = B.y + 19 * ky;

  if (n) {
    const sum = values.reduce((a, b) => a + b, 0) || 1;
    let acc = -Math.PI / 2;
    values.forEach((val, i) => {
      const th = 2 * Math.PI * val / sum;
      const end = acc + th;
      const p1x = cx + R * Math.cos(acc), p1y = cy + R * Math.sin(acc);
      const p2x = cx + R * Math.cos(end), p2y = cy + R * Math.sin(end);
      const big = th > Math.PI ? 1 : 0;
      // 조각이 하나뿐이면 호로는 원을 못 닫는다 → 반원 두 개로 온전한 원을 그린다.
      const d = n === 1
        ? `M ${cx - R} ${cy} A ${R} ${R} 0 1 1 ${cx + R} ${cy} A ${R} ${R} 0 1 1 ${cx - R} ${cy} Z`
        : `M ${cx} ${cy} L ${p1x} ${p1y} A ${R} ${R} 0 ${big} 1 ${p2x} ${p2y} Z`;
      g.appendChild(el("path", {
        d, fill: colors[i % colors.length] || "#ddd", stroke: color, "stroke-width": sw,
      }));
      const mid = acc + th / 2;
      addLabel(g, names[i] || "", {
        x: cx + R * 0.62 * Math.cos(mid), y: cy + R * 0.62 * Math.sin(mid),
        size: 2.6 * s, color, anchor: "middle", vAlign: "middle",
      });
      acc = end;
    });
  }

  if (obj.showTick) {
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6 - Math.PI / 2;
      g.appendChild(el("line", {
        x1: cx + R * Math.cos(a), y1: cy + R * Math.sin(a),
        x2: cx + (R + 1.3 * s) * Math.cos(a), y2: cy + (R + 1.3 * s) * Math.sin(a),
        stroke: color, "stroke-width": sw * 0.65,
      }));
    }
  }

  if (obj.showRatio !== false && n) {
    addLabel(g, values.join(" : "), {
      x: cx, y: B.y + 36.6 * ky, size: 2.7 * s, color, anchor: "middle", vAlign: "baseline",
    });
  }
}

export function renderChemChart(obj) {
  const color = grayHex(obj.strokeLevel ?? 0);
  const sw = obj.strokeWidth ?? 0.35;
  const B = box(obj);
  const g = document.createElementNS(SVG_NS, "g");

  if (obj.kind === "pie") renderPie(g, obj, B, color, sw);
  else renderBar(g, obj, B, color, sw);

  const rot = obj.rotation ?? 0;
  if (rot) g.setAttribute("transform", `rotate(${rot} ${B.x + B.w / 2} ${B.y + B.h / 2})`);
  if (obj.opacity != null && obj.opacity !== 1) g.setAttribute("opacity", obj.opacity);
  if (obj.id) g.dataset.id = obj.id;
  return g;
}
