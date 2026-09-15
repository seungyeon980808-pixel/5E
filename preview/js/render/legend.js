/* ===== RENDER/LEGEND: 범례 블록(크기박스 계열) =====
 *
 * 그래프 모달 안에는 이미 범례가 있다(js/render/coordplane.js 의 renderLegendBox).
 * 이 파일은 **그 범례를 그래프 밖(모식도)에서도 쓸 수 있게 독립 객체로 뺀 것**이다.
 * 두 개가 다르게 보이면 안 되므로 모양·간격·글꼴 처리를 그대로 가져왔다:
 *
 *   gap(견본↔글자) = size * 0.55        ← renderLegendBox
 *   자간(letter-spacing) = size * 0.18   ← renderLegendBox (+50% 느낌)
 *   견본 선 굵기 = strokeWidth * 1.3, linecap round
 *   테두리 = 흰 채움(fill-opacity 0.9) + strokeWidth * 0.5, rx 없음(직각 박스)
 *   글자 = renderGraphLabel(anchor:"start", vAlign:"middle", halo:false)
 *
 * 다른 점은 딱 하나다. 그래프 범례는 글씨 폭에 맞춰 상자를 auto-fit 하지만,
 * 이쪽은 **크기박스(x,y,w,h) 계열**이라 상자가 먼저 주어진다. 그래서 명세대로
 * 줄 높이 = (h - padding*2) / 항목수 로 계산해 상자를 넘치지 않게 한다.
 *
 * 스키마 — docs/BIO_PARTS_SPEC.md §5
 *   x, y, w, h    크기박스(이동·리사이즈는 앱이 처리)
 *   items[]       { sample, text }
 *   direction     "vertical" | "horizontal"
 *   border        테두리 상자
 *   padding 2.4 · sampleWidth 8 · fontSize 2.8
 */

import { SVG_NS, grayHex, applyDash, makeArrowHead } from "./core.js?v=1.4.0";
import { makeFillPattern, resolveFill } from "./fill.js?v=1.4.0";
import { renderGraphLabel } from "./graph-label.js?v=1.4.0";

export const LEGEND_SAMPLES = ["solid", "dash", "dot", "dashdot", "arrow", "gray", "hatch", "marker"];

const DEF_PADDING = 2.4;
const DEF_SAMPLE_W = 8;
const DEF_FONT = 2.8;
const GAP_RATIO = 0.55;   // 견본 오른쪽 끝 ↔ 글자 시작 (renderLegendBox 와 동일)
const LS_RATIO = 0.18;    // 자간 (renderLegendBox 와 동일)

function num(v, dflt, min = 0) {
  return Number.isFinite(v) && v >= min ? v : dflt;
}

function normItems(obj) {
  const arr = Array.isArray(obj && obj.items) ? obj.items : [];
  const out = arr
    .filter((it) => it && (it.sample || it.text))
    .map((it) => ({
      sample: LEGEND_SAMPLES.includes(it.sample) ? it.sample : "solid",
      text: String(it.text ?? ""),
    }));
  return out;
}

/* ----- 항목 배치 계산 -----
 * 렌더러·인스펙터·바깥에서 같은 값을 쓰도록 배치를 한 곳에서만 정한다.
 * 반환 { x, y, w, h, pad, size, gap, sampleW, rows[] }
 *   rows[i] = { item, cy, sx1, sx2, tx, slotH }
 *     cy  = 항목의 세로 중심, sx1~sx2 = 견본 구간, tx = 글자 시작(모든 항목 동일 정렬)
 */
export function legendLayout(obj) {
  const x = num(obj.x, 0, -Infinity), y = num(obj.y, 0, -Infinity);
  const w = num(obj.w, 40, 0.1), h = num(obj.h, 20, 0.1);
  const items = normItems(obj);
  const n = items.length;
  const size = num(obj.fontSize, DEF_FONT, 0.1);
  const gap = size * GAP_RATIO;
  // 여백은 상자의 절반을 넘지 못하게 잘라 준다(작은 상자에서 음수 폭이 나오는 것 방지).
  const pad = Math.min(num(obj.padding, DEF_PADDING), w / 2 - 0.1, h / 2 - 0.1);
  const innerX = x + pad, innerY = y + pad;
  const innerW = Math.max(0.1, w - pad * 2), innerH = Math.max(0.1, h - pad * 2);
  const horiz = obj.direction === "horizontal";
  const rows = [];
  if (!n) return { x, y, w, h, pad, size, gap, sampleW: num(obj.sampleWidth, DEF_SAMPLE_W, 0.1), horiz, rows };

  let sampleW;
  if (horiz) {
    // 가로 배치: 항목마다 같은 폭의 칸을 주고, 칸 안에서 [견본][gap][글자] 순으로 놓는다.
    const cell = innerW / n;
    sampleW = Math.min(num(obj.sampleWidth, DEF_SAMPLE_W, 0.1), Math.max(0.5, cell * 0.4));
    const cy = innerY + innerH / 2;
    items.forEach((item, i) => {
      const cx0 = innerX + cell * i;
      rows.push({ item, cy, sx1: cx0, sx2: cx0 + sampleW, tx: cx0 + sampleW + gap, slotH: innerH });
    });
  } else {
    // 세로 배치: 줄 높이 = (h - padding*2) / 항목수 (명세 §5)
    const rowH = innerH / n;
    sampleW = Math.min(num(obj.sampleWidth, DEF_SAMPLE_W, 0.1), Math.max(0.5, innerW * 0.6));
    items.forEach((item, i) => {
      const cy = innerY + rowH * i + rowH / 2;
      rows.push({ item, cy, sx1: innerX, sx2: innerX + sampleW, tx: innerX + sampleW + gap, slotH: rowH });
    });
  }
  return { x, y, w, h, pad, size, gap, sampleW, horiz, rows };
}

export function legendBBox(obj) {
  const L = legendLayout(obj);
  return { x: L.x, y: L.y, w: L.w, h: L.h };
}

/* ----- 견본 하나 ----- */
function sampleNode(g, kind, r, color, sw, size, defs, patId) {
  const cy = r.cy;
  const mkLine = () => {
    const l = document.createElementNS(SVG_NS, "line");
    l.setAttribute("x1", r.sx1); l.setAttribute("y1", cy);
    l.setAttribute("x2", r.sx2); l.setAttribute("y2", cy);
    l.setAttribute("stroke", color);
    l.setAttribute("stroke-width", sw * 1.3);   // renderLegendBox 와 동일
    l.setAttribute("stroke-linecap", "round");
    g.appendChild(l);
    return l;
  };
  // 네모 견본(gray/hatch): 견본 칸 안에서 가운데. 글자 시작(tx)은 그대로라 정렬은 유지된다.
  const mkSquare = (fillAttr) => {
    const side = Math.min(size * 1.15, r.sx2 - r.sx1, r.slotH * 0.8);
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", (r.sx1 + r.sx2) / 2 - side / 2);
    rect.setAttribute("y", cy - side / 2);
    rect.setAttribute("width", side); rect.setAttribute("height", side);
    rect.setAttribute("fill", fillAttr);
    rect.setAttribute("stroke", color);
    rect.setAttribute("stroke-width", sw);
    g.appendChild(rect);
  };

  if (kind === "solid") { mkLine(); return; }
  if (kind === "dash")    { applyDash(mkLine(), { dashLength: 1.0, dashGap: 0.35 }); return; }
  if (kind === "dot")     { applyDash(mkLine(), { dashLength: 0.2, dashGap: 0.3 }); return; }
  if (kind === "dashdot") {
    // 일점쇄선: 공용 경로(applyDash + dashPattern)로 그린다 — 견본과 실제 선이 같은 코드를 탄다.
    applyDash(mkLine(), { dashPattern: [1.6, 0.35, 0.25, 0.35] });
    return;
  }
  if (kind === "arrow") {
    mkLine();
    // 화살촉은 기존 선 렌더러와 같은 방식(core.makeArrowHead) — 굵기도 견본 선과 맞춘다.
    g.appendChild(makeArrowHead(r.sx2, cy, 1, 0, sw * 1.3, color));
    return;
  }
  if (kind === "gray")  { mkSquare(grayHex(170)); return; }
  if (kind === "hatch") {
    // 빗금은 fill.js 공용 패턴을 그대로 쓴다(막대·영역 채우기와 같은 빗금이 나온다).
    const fake = { id: patId, type: "rect", fillStyle: "hatch", fillLevel: 0 };
    const pat = makeFillPattern(fake);
    if (pat && defs) defs.appendChild(pat);
    mkSquare(pat ? resolveFill(fake) : "none");
    return;
  }
  if (kind === "marker") {
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", (r.sx1 + r.sx2) / 2);
    c.setAttribute("cy", cy);
    c.setAttribute("r", Math.max(0.2, size * 0.26));
    c.setAttribute("fill", color);
    g.appendChild(c);
  }
}

export function renderLegend(obj) {
  const color = grayHex(obj.strokeLevel ?? 0);
  const sw = obj.strokeWidth ?? 0.35;
  const g = document.createElementNS(SVG_NS, "g");
  const L = legendLayout(obj);

  const defs = document.createElementNS(SVG_NS, "defs");
  g.appendChild(defs);

  // 테두리 상자 — renderLegendBox 와 같은 값(흰 채움 0.9, 굵기 0.5배, 직각).
  if (obj.border !== false) {
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", L.x); rect.setAttribute("y", L.y);
    rect.setAttribute("width", L.w); rect.setAttribute("height", L.h);
    rect.setAttribute("fill", "#ffffff");
    rect.setAttribute("fill-opacity", "0.9");
    rect.setAttribute("stroke", color);
    rect.setAttribute("stroke-width", sw * 0.5);
    g.appendChild(rect);
  }

  const ls = L.size * LS_RATIO;
  L.rows.forEach((r, i) => {
    sampleNode(g, r.item.sample, r, color, sw, L.size, defs, `legendhatch_${obj.id || "x"}_${i}`);
    const lbl = renderGraphLabel(r.item.text, {
      x: r.tx, y: r.cy, size: L.size, color, anchor: "start", vAlign: "middle", halo: false,
    });
    if (lbl) {
      // 자간 +50%(renderLegendBox 와 동일 처리)
      lbl.querySelectorAll("text").forEach((t) => t.setAttribute("letter-spacing", ls));
      g.appendChild(lbl);
    }
  });

  const rot = obj.rotation ?? 0;
  if (rot) g.setAttribute("transform", `rotate(${rot} ${L.x + L.w / 2} ${L.y + L.h / 2})`);
  if (obj.opacity != null && obj.opacity !== 1) g.setAttribute("opacity", obj.opacity);
  if (obj.id) g.dataset.id = obj.id;
  return g;
}
