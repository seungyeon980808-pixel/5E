/* ===== RENDER/ORBITAL: 오비탈(크기박스 계열) =====
 *
 * 한 타입에 두 갈래가 들어 있다(docs/CHEM_PARTS_SPEC.md §4).
 *
 *   kind:"box"    오비탈 상자 — 전자 수만 넣으면 **아우프바우 + 훈트 규칙**으로 자동 배치.
 *                 순서는 1s · 2s · 2p(3칸) · 3s · 3p(3칸) 고정.
 *                 한 칸에 하나씩(위 스핀) 다 넣은 뒤 두 번째 바퀴에서 짝(아래 스핀)을 짓는다.
 *   kind:"shape"  오비탈 모양 — s는 구, p는 **두 물방울꼴 로브가 핵에서 만나는** 형태.
 *                 로브가 핵에서 떨어져 있으면 틀린 그림이다(레퍼런스 확인).
 *
 * 좌표 — 시안(docs/chem-parts-proposal.html)의 `orbSVG()` · `oshSVG()` 는
 * 상자 52×38 · 모양 40×40 고정 좌표계로 그려져 있다. 여기서는 그 값을 **비율의 근거**로만
 * 읽고, 실제 좌표는 `obj.x + obj.w * 비율` 로 직접 계산한다(legend.js·pedigree.js 와 같은 방식).
 * 그래야 선 굵기가 상자 크기에 딸려 늘어나지 않고, 글자도 찌그러지지 않는다.
 * 유일한 예외가 로브 경로인데, 이쪽은 `translate + rotate` 만 걸어서(스케일 없음)
 * 굵기가 변하지 않는다 — 경로 자체를 이미 mm 로 만들어 넘긴다.
 *
 * 스키마 — docs/CHEM_PARTS_SPEC.md §4
 *   x, y, w, h            크기박스(이동·리사이즈는 앱이 처리)
 *   kind                  "box" | "shape"
 *   electrons             1~18 (box)
 *   showOrbitalLabels     1s·2s·2p… 이름 표시 (box)
 *   orbital               "s" | "pz" | "px" | "py" (shape)
 *   showAxis · showNode · showSymbol                (shape)
 *   기본 크기: box 46 × 22 · shape 30 × 30 mm
 */

import { SVG_NS, grayHex, applyDash, makeArrowHead } from "./core.js?v=1.4.0";
import { renderGraphLabel } from "./graph-label.js?v=1.4.0";

export const ORBITAL_KINDS = ["box", "shape"];
export const ORBITAL_SHAPES = ["s", "pz", "px", "py"];

/* 아우프바우 순서 — [이름, 칸 수]. 3p 까지(=전자 18개)만 다룬다(명세 §4). */
export const ORBITAL_SETS = [["1s", 1], ["2s", 1], ["2p", 3], ["3s", 1], ["3p", 3]];
/* 3p 까지의 총 수용량 = 18. 이보다 많이 넣으면 "남은 전자 N개" 로 알린다. */
export const ORBITAL_CAPACITY = ORBITAL_SETS.reduce((a, [, c]) => a + c * 2, 0);

/* ----- 시안 좌표계에서 뽑은 비율 (상자 한 칸 폭 bw = 4.4 기준) ----- */
const CELL_GAP = 1.0 / 4.4;      // 같은 오비탈 칸 사이
const SET_GAP = 3.4 / 4.4;       // 다른 오비탈 사이
const ARROW_INSET = 0.7 / 4.4;   // 화살표가 칸 위아래에서 떨어지는 양
const LABEL_GAP = 0.25;          // 칸 아래 ↔ 이름 글자 위
const LABEL_SIZE = 0.64;         // 오비탈 이름 글자 크기
const REST_GAP = 0.30;           // 이름 아래 ↔ "남은 전자" 글자 위
const REST_SIZE = 0.50;          // "남은 전자" 글자 크기

/* 가로 전체 폭 = 9칸 + 칸사이 4번 + 오비탈사이 4번 (모두 bw 배수) */
const BOX_UNITS_W = 9 + 4 * CELL_GAP + 4 * SET_GAP;   // = 13.0

function num(v, dflt, min = 0) {
  return Number.isFinite(v) && v >= min ? v : dflt;
}

/* 음수 폭·높이로 저장돼 있어도 항상 좌상단 기준으로 돌려준다. */
function normBox(obj) {
  let x = num(obj.x, 0, -Infinity), y = num(obj.y, 0, -Infinity);
  let w = num(obj.w, 40, -Infinity), h = num(obj.h, 20, -Infinity);
  if (!Number.isFinite(w) || w === 0) w = 40;
  if (!Number.isFinite(h) || h === 0) h = 20;
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  return { x, y, w, h };
}

export function orbitalBBox(obj) {
  return normBox(obj);
}

/* 여러 개를 놓았을 때 <defs> 안의 그라디언트 id 가 부딪히면 안 된다. */
let gradSeq = 0;
function uid(obj) {
  const raw = obj && obj.id != null ? String(obj.id) : "";
  const safe = raw.replace(/[^\w-]/g, "_");
  return safe || `n${++gradSeq}`;
}

function svg(tag, attrs) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

function label(g, text, x, y, size, color, anchor, vAlign) {
  const n = renderGraphLabel(text, { x, y, size, color, anchor, vAlign, halo: false });
  if (n) g.appendChild(n);
}

/* ===== 아우프바우 + 훈트 =====
 * 오비탈 하나(칸 cnt 개)마다 **첫 바퀴에 한 칸씩 하나씩** 넣고, 남으면 두 번째 바퀴에서
 * 짝을 짓는다. 시안 orbSVG() 의 채우기 루프와 완전히 같은 순서다.
 * 반환 { fills: [[e,e,e], …], left } — left 는 3p 까지 채우고도 남은 전자 수.
 */
export function fillOrbitals(electrons) {
  let left = Math.max(0, Math.round(num(electrons, 8, 0)));
  const fills = ORBITAL_SETS.map(([, cnt]) => {
    const boxes = new Array(cnt).fill(0);
    for (let pass = 0; pass < 2 && left > 0; pass++) {
      for (let i = 0; i < cnt && left > 0; i++) {
        if (boxes[i] === pass) { boxes[i]++; left--; }
      }
    }
    return boxes;
  });
  return { fills, left };
}

/* ----- 스핀 화살표 하나 -----
 * 굵기는 obj.strokeWidth 에 비례(시안은 칸 0.32 : 화살표 0.26 ≈ 0.8배).
 * 칸이 작아지면 화살촉이 화살대보다 길어질 수 있어 촉 길이를 대의 절반으로 제한한다.
 */
function spinArrow(g, x, yTail, yTip, aw, color) {
  const dir = yTip < yTail ? -1 : 1;
  const len = Math.abs(yTip - yTail);
  const headLen = Math.min(aw * 4.5, len * 0.5);
  const lenMul = aw > 0 ? headLen / aw : 4.5;
  g.appendChild(svg("line", {
    x1: x, y1: yTail, x2: x, y2: yTip,
    stroke: color, "stroke-width": aw, "stroke-linecap": "round",
  }));
  g.appendChild(makeArrowHead(x, yTip, 0, dir, aw, color, { lenMul, widthMul: lenMul / 2.5 }));
}

/* ===== kind:"box" — 오비탈 상자 ===== */
function renderBoxKind(g, obj, B, color, sw) {
  const showLab = obj.showOrbitalLabels !== false;
  const { fills, left } = fillOrbitals(obj.electrons ?? 8);
  const showRest = left > 0;

  // 세로로 쌓이는 것: 칸(1) + 이름줄 + 남은전자줄 (모두 bw 배수)
  const unitsH = 1 + (showLab ? LABEL_GAP + LABEL_SIZE : 0) + (showRest ? REST_GAP + REST_SIZE : 0);
  // 가로·세로 중 더 빡빡한 쪽에 맞춘다(칸은 정사각이라 한쪽만 늘일 수 없다).
  const bw = Math.max(0.2, Math.min((B.w * 0.96) / BOX_UNITS_W, (B.h * 0.96) / unitsH));
  const bh = bw;

  const totalW = BOX_UNITS_W * bw;
  const totalH = unitsH * bw;
  let x = B.x + (B.w - totalW) / 2;
  const top = B.y + (B.h - totalH) / 2;
  const bottom = top + bh;

  const inset = bh * ARROW_INSET;
  const aw = Math.max(0.05, sw * 0.8);

  ORBITAL_SETS.forEach(([name, cnt], si) => {
    const boxes = fills[si];
    const setW = cnt * bw + (cnt - 1) * CELL_GAP * bw;
    boxes.forEach((e, i) => {
      const bx = x + i * (bw + CELL_GAP * bw);
      g.appendChild(svg("rect", {
        x: bx, y: top, width: bw, height: bh,
        fill: "#ffffff", stroke: color, "stroke-width": sw,
      }));
      // 위 스핀 = 위로 향한 화살표(왼쪽), 아래 스핀 = 아래로 향한 화살표(오른쪽)
      if (e >= 1) spinArrow(g, bx + bw * 0.32, bottom - inset, top + inset, aw, color);
      if (e >= 2) spinArrow(g, bx + bw * 0.68, top + inset, bottom - inset, aw, color);
    });
    if (showLab) label(g, name, x + setW / 2, bottom + LABEL_GAP * bw, LABEL_SIZE * bw, color, "middle", "top");
    x += setW + SET_GAP * bw;
  });

  if (showRest) {
    const ry = bottom + (showLab ? (LABEL_GAP + LABEL_SIZE) * bw : 0) + REST_GAP * bw;
    label(g, `남은 전자 ${left}개`, B.x + B.w / 2, ry, REST_SIZE * bw, color, "middle", "top");
  }
}

/* ===== kind:"shape" — 오비탈 모양 =====
 * 물방울꼴 로브. 핵(0,0)에서 뾰족하게 시작해 끝이 둥글다 — 시안 lobe() 그대로다.
 * 로브는 **반드시 핵에서 만나야** 한다(경로가 원점에서 시작·종료하는 이유).
 */
function lobePath(len, wid) {
  return `M 0 0 ` +
    `C ${wid * 0.55} ${-len * 0.18}, ${wid} ${-len * 0.52}, ${wid * 0.62} ${-len * 0.8} ` +
    `C ${wid * 0.34} ${-len * 1.02}, ${-wid * 0.34} ${-len * 1.02}, ${-wid * 0.62} ${-len * 0.8} ` +
    `C ${-wid} ${-len * 0.52}, ${-wid * 0.55} ${-len * 0.18}, 0 0 Z`;
}

function shapeGradients(id) {
  const defs = document.createElementNS(SVG_NS, "defs");
  const rg = svg("radialGradient", { id: `orbS_${id}`, cx: "50%", cy: "42%", r: "65%" });
  [["0%", "#f4f4f4"], ["70%", "#cfcfcf"], ["100%", "#a8a8a8"]].forEach(([o, c]) => {
    rg.appendChild(svg("stop", { offset: o, "stop-color": c }));
  });
  const lg = svg("linearGradient", { id: `orbP_${id}`, x1: "0", y1: "1", x2: "0", y2: "0" });
  [["0%", "#bdbdbd"], ["45%", "#e8e8e8"], ["100%", "#cfcfcf"]].forEach(([o, c]) => {
    lg.appendChild(svg("stop", { offset: o, "stop-color": c }));
  });
  defs.appendChild(rg);
  defs.appendChild(lg);
  return defs;
}

function renderShapeKind(g, obj, B, color, sw) {
  const kind = ORBITAL_SHAPES.includes(obj.orbital) ? obj.orbital : "pz";
  const showAxis = obj.showAxis !== false;
  const showNode = obj.showNode !== false;
  const showSym = obj.showSymbol !== false;

  const id = uid(obj);
  g.appendChild(shapeGradients(id));
  const sFill = `url(#orbS_${id})`;
  const pFill = `url(#orbP_${id})`;

  // 시안 40×40 좌표계를 정사각으로 축소해 상자 한가운데 놓는다(가로세로 따로 늘이면 원이 찌그러진다).
  const k = Math.min(B.w, B.h) / 40;
  const cx = B.x + B.w / 2, cy = B.y + B.h / 2;
  const fsAxis = Math.max(1.2, 2.6 * k);
  const fsSym = Math.max(1.6, 3.2 * k);

  const mkLine = (x1, y1, x2, y2, width, dash) => {
    const l = svg("line", {
      x1, y1, x2, y2, stroke: color, "stroke-width": width, "stroke-linecap": "round",
    });
    if (dash) applyDash(l, { dashLength: dash[0] * k, dashGap: dash[1] * k });
    g.appendChild(l);
  };

  if (showAxis) {
    const aw = Math.max(0.04, sw * 0.6);
    mkLine(cx - 15 * k, cy, cx + 15 * k, cy, aw);
    mkLine(cx, cy - 15 * k, cx, cy + 15 * k, aw);
    mkLine(cx + 9.5 * k, cy + 9.5 * k, cx - 9.5 * k, cy - 9.5 * k, aw, [1.0, 0.8]);
    if (showSym) {
      label(g, "x", cx + 16.2 * k, cy + 0.9 * k, fsAxis, color, "middle", "baseline");
      label(g, "z", cx + 1.5 * k, cy - 15.6 * k, fsAxis, color, "middle", "baseline");
      label(g, "y", cx - 10.6 * k, cy - 10.2 * k, fsAxis, color, "middle", "baseline");
    }
  }

  const lobe = (len, wid, rot) => {
    g.appendChild(svg("path", {
      d: lobePath(len * k, wid * k),
      fill: pFill, stroke: color, "stroke-width": sw, "stroke-linejoin": "round",
      transform: `translate(${cx} ${cy}) rotate(${rot})`,
    }));
  };
  const nodeW = Math.max(0.04, sw * 0.65);
  const NODE_DASH = [0.9, 0.7];

  if (kind === "s") {
    g.appendChild(svg("circle", {
      cx, cy, r: 9.4 * k, fill: sFill, stroke: color, "stroke-width": sw,
    }));
    if (showSym) label(g, "s", cx, cy + 1.3 * k, fsSym, color, "middle", "baseline");
  } else if (kind === "pz") {
    lobe(12.5, 4.6, 0); lobe(12.5, 4.6, 180);
    if (showNode) mkLine(cx - 8 * k, cy, cx + 8 * k, cy, nodeW, NODE_DASH);
    if (showSym) label(g, "p_z", cx + 5.6 * k, cy - 12.4 * k, fsSym, color, "start", "baseline");
  } else if (kind === "px") {
    lobe(12.5, 4.6, 90); lobe(12.5, 4.6, 270);
    if (showNode) mkLine(cx, cy - 8 * k, cx, cy + 8 * k, nodeW, NODE_DASH);
    if (showSym) label(g, "p_x", cx + 12.6 * k, cy - 4.4 * k, fsSym, color, "start", "baseline");
  } else {
    // py — 깊이 방향이라 대각으로 눕히고, 로브를 짧고 좁게 그려 원근을 낸다(시안과 같은 값).
    lobe(9, 3.4, 135); lobe(9, 3.4, 315);
    if (showNode) mkLine(cx - 5.5 * k, cy - 5.5 * k, cx + 5.5 * k, cy + 5.5 * k, nodeW, NODE_DASH);
    if (showSym) label(g, "p_y", cx - 9.4 * k, cy - 8.4 * k, fsSym, color, "end", "baseline");
  }

  // 핵 — 로브가 여기서 만난다.
  g.appendChild(svg("circle", { cx, cy, r: Math.max(0.12, 0.55 * k), fill: color }));
}

export function renderOrbital(obj) {
  const color = grayHex(obj.strokeLevel ?? 0);
  const sw = obj.strokeWidth ?? 0.35;
  const B = normBox(obj);
  const g = document.createElementNS(SVG_NS, "g");

  if (obj.kind === "box") renderBoxKind(g, obj, B, color, sw);
  else renderShapeKind(g, obj, B, color, sw);

  const rot = obj.rotation ?? 0;
  if (rot) g.setAttribute("transform", `rotate(${rot} ${B.x + B.w / 2} ${B.y + B.h / 2})`);
  if (obj.opacity != null && obj.opacity !== 1) g.setAttribute("opacity", obj.opacity);
  if (obj.id) g.dataset.id = obj.id;
  return g;
}
