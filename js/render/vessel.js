/* ===== RENDER/VESSEL: 용기 가족(크기박스 계열) =====
 *
 * 화학 기출의 실험 기구를 한 타입으로 덮는다 — 비커·삼각플라스크·시험관·눈금실린더·
 * 깔때기·U자관·뷰렛·원형 강철용기·사각 용기(실린더). 대기열 1~5위(vessel_content 62 ·
 * syringe_piston 55 · vessel_round 41 · glassware 37 · stopcock 22)가 전부 이 가족이다.
 *
 * 스키마 — docs/CHEM_PARTS_SPEC.md §1 정본
 *   x, y, w, h    크기박스(이동·리사이즈·저장은 앱이 처리)
 *   kind          VESSEL_KINDS 중 하나. 모양·내부경로·안쪽상자가 kind 로 정해진다
 *   liquid 0~1    액면 높이(0이면 액체 없음) · liquidColor 용액 색
 *   hasPiston · pistonAt 0~1(아래=0)
 *   hasFix        고정장치 ▼ (벽이 수직인 kind 에서만)
 *   hasWeight     피스톤 위 추 · hasStopcock 위로 뻗는 관+꼭지 · hasTicks 눈금
 *   text          내부 텍스트(줄바꿈으로 여러 줄) · textPos "top"|"middle"|"bottom"
 *
 * 그림의 정본은 시안 docs/chem-parts-proposal.html §1 의 `VK` · `stopcockAt()` ·
 * `vesselSVG()` 다. 시안은 40×40 고정 좌표계라서 여기서는 **좌표를 직접 환산**한다
 * (legend.js·pedigree.js 와 같은 방식). `<g transform scale>` 을 쓰지 않는 이유는
 * 선 굵기와 글자가 같이 찌그러지기 때문이다(명세 §0 "그림 좌표").
 *
 * 환산 규칙 — kind 마다 `box`(시안 좌표계에서 그 용기 몸통이 차지하는 사각형)를 두고
 * 그것을 obj 의 {x,y,w,h} 에 꽉 채워 맞춘다. 즉 sx = w / box.w, sy = h / box.h.
 * 그래서 폭·높이를 바꾸면 그 용기의 폭·높이가 그대로 바뀐다.
 * 꼭지(위로 뻗는 관)와 추는 상자 위로 조금 삐져나온다 — bbox 는 명세대로 상자 그대로다.
 *
 * 액체가 용기 안쪽 모양을 따라가는 방법: kind 의 `interior`(내부 경로)를 <clipPath> 에
 * 넣고, 가로로 아주 긴 <rect> 를 잘라 그린다. 액면선·피스톤도 같은 클립을 쓴다.
 */

import { SVG_NS, grayHex } from "./core.js?v=1.3.0";
import { renderGraphLabel } from "./graph-label.js?v=1.3.0";

/* ----- kind 표 — 시안 VK 를 그대로 옮긴 것 -----
 *   outline    윤곽선(그리는 경로). round 는 circle 로 대신한다
 *   circle     원형 용기 전용
 *   interior   내부(액체를 자를 클립 경로)
 *   inner      안쪽 상자 — 액면·피스톤·눈금·텍스트의 기준
 *   box        몸통이 차지하는 사각형(= obj 상자에 맞출 구간)
 *   wall       벽이 수직인가(고정장치 ▼ · 추를 붙일 수 있는가)
 *   ticks      눈금 개수(0이면 눈금 없음) · tap 뷰렛 아래 꼭지 모양
 * 한글 이름은 인스펙터가 따로 가진다 — 렌더러는 kind 문자열만 내보낸다(명세 §1).
 */
const VK = {
  beaker: {
    outline: "M 9 8 L 9 33 L 31 33 L 31 8 M 31 8 L 33.2 9.6",
    interior: "M 9 8 L 9 33 L 31 33 L 31 8 Z",
    inner: { x: 9, y: 8, w: 22, h: 25 },
    box: { x: 9, y: 8, w: 22, h: 25 },
    wall: 1, ticks: 4,
  },
  flask: {
    outline: "M 16 7 L 16 15 L 8.5 33 L 31.5 33 L 24 15 L 24 7",
    interior: "M 16 7 L 24 7 L 24 15 L 31.5 33 L 8.5 33 L 16 15 Z",
    inner: { x: 8.5, y: 7, w: 23, h: 26 },
    box: { x: 8.5, y: 7, w: 23, h: 26 },
    wall: 0, ticks: 0,
  },
  test_tube: {
    outline: "M 15 7 L 15 27 A 5 5 0 0 0 25 27 L 25 7",
    interior: "M 15 7 L 25 7 L 25 27 A 5 5 0 0 1 15 27 Z",
    inner: { x: 15, y: 7, w: 10, h: 25 },
    box: { x: 15, y: 7, w: 10, h: 25 },
    wall: 1, ticks: 3,
  },
  cylinder_graduated: {
    outline: "M 16 6 L 16 29 L 24 29 L 24 6 M 13.5 33 L 26.5 33 L 25.5 29 L 14.5 29 Z",
    interior: "M 16 6 L 24 6 L 24 29 L 16 29 Z",
    inner: { x: 16, y: 6, w: 8, h: 23 },
    box: { x: 13.5, y: 6, w: 13, h: 27 },
    wall: 1, ticks: 6,
  },
  funnel: {
    outline: "M 8 8 L 31 8 M 8 8 L 18.5 21 L 18.5 33 M 31 8 L 21.5 21 L 21.5 33",
    interior: "M 8 8 L 31 8 L 21.5 21 L 21.5 33 L 18.5 33 L 18.5 21 Z",
    inner: { x: 8, y: 8, w: 23, h: 14 },
    box: { x: 8, y: 8, w: 23, h: 25 },
    wall: 0, ticks: 0,
  },
  u_tube: {
    outline: "M 8 6 L 8 28 Q 8 33 13 33 L 27 33 Q 32 33 32 28 L 32 6 M 14 6 L 14 27 L 26 27 L 26 6",
    interior: "M 8 6 L 14 6 L 14 27 L 26 27 L 26 6 L 32 6 L 32 28 Q 32 33 27 33 L 13 33 Q 8 33 8 28 Z",
    inner: { x: 8, y: 6, w: 24, h: 27 },
    box: { x: 8, y: 6, w: 24, h: 27 },
    wall: 0, ticks: 0,
  },
  burette: {
    outline: "M 17 4 L 17 26 L 23 26 L 23 4",
    interior: "M 17 4 L 23 4 L 23 26 L 17 26 Z",
    inner: { x: 17, y: 4, w: 6, h: 22 },
    box: { x: 17, y: 4, w: 6, h: 22 },
    wall: 1, ticks: 7, tap: "M 20 26 L 20 30 M 18.4 30 L 21.6 30",
  },
  round: {
    outline: "",
    circle: { cx: 20, cy: 20, r: 12.5 },
    interior: "",
    inner: { x: 9, y: 11, w: 22, h: 18 },
    box: { x: 7.5, y: 7.5, w: 25, h: 25 },
    wall: 0, ticks: 0,
  },
  box: {
    outline: "M 10 8 L 10 32 L 30 32 L 30 8",
    interior: "M 10 8 L 10 32 L 30 32 L 30 8 Z",
    inner: { x: 10, y: 8, w: 20, h: 24 },
    box: { x: 10, y: 8, w: 20, h: 24 },
    wall: 1, ticks: 0,
  },
};

/* 인스펙터의 [용기 종류] 목록. 순서가 곧 화면 순서다. */
export const VESSEL_KINDS = Object.keys(VK);

const DEF_KIND = "box";
const DEF_LIQUID = 0.34;
const DEF_PISTON_AT = 0.66;
const DEF_LIQUID_COLOR = "#d9dcdf";   // 기출은 무채색
const PISTON_BAND_RATIO = 0.06;       // 피스톤 띠 높이 = 용기 안폭의 6% (명세 §1)
const PISTON_EDGE_RATIO = 0.18;       // 띠 위아래 검은 선 = 띠 높이의 18%
const TEXT_SIZE_MAX = 3.2;            // 내부 텍스트 글자 크기 상한(mm)
const TEXT_SIZE_MIN = 1.4;

function num(v, dflt, min = -Infinity, max = Infinity) {
  return Number.isFinite(v) && v >= min && v <= max ? v : dflt;
}

function clamp01(v, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(1, Math.max(0, n));
}

function vesselKindDef(kind) {
  return VK[kind] || VK[DEF_KIND];
}

/* ----- 배치 계산: 렌더·bbox·바깥이 같은 값을 쓰도록 한 곳에서만 정한다 -----
 * 반환 { x, y, w, h, K, sx, sy, us, fx(), fy(), inner{}, sw, color }
 *   fx/fy = 시안 좌표 → 실제 mm 좌표
 *   sx/sy = 축별 배율, us = 둘 중 작은 쪽(원·꼭지처럼 찌그러지면 안 되는 것에 쓴다)
 */
export function vesselLayout(obj) {
  const x = num(obj.x, 0), y = num(obj.y, 0);
  const w = num(obj.w, 30, 0.1), h = num(obj.h, 34, 0.1);
  const K = vesselKindDef(obj.kind);
  const sx = w / K.box.w, sy = h / K.box.h;
  const us = Math.min(sx, sy);
  const fx = (gx) => x + (gx - K.box.x) * sx;
  const fy = (gy) => y + (gy - K.box.y) * sy;
  const inner = {
    x: fx(K.inner.x), y: fy(K.inner.y),
    w: K.inner.w * sx, h: K.inner.h * sy,
  };
  return {
    x, y, w, h, K, sx, sy, us, fx, fy, inner,
    sw: num(obj.strokeWidth, 0.35, 0.01),
    color: grayHex(obj.strokeLevel ?? 0),
  };
}

export function vesselBBox(obj) {
  const L = vesselLayout(obj);
  return { x: L.x, y: L.y, w: L.w, h: L.h };
}

/* ----- 시안 경로 문자열을 실제 좌표로 옮긴다 -----
 * VK 의 경로는 절대 명령 M·L·Q·A·Z 만 쓴다. 호(A)는 반지름을 축별 배율로 따로 늘린다
 * (회전 0인 축정렬 호라서 이 방식이 정확하다).
 */
const PATH_ARGC = { M: 2, L: 2, T: 2, Q: 4, C: 6, A: 7, Z: 0 };

function mapPathD(d, L) {
  const toks = String(d || "").match(/[A-Za-z]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || [];
  const out = [];
  let cmd = "";
  let i = 0;
  while (i < toks.length) {
    if (/[A-Za-z]/.test(toks[i])) {
      cmd = toks[i].toUpperCase();
      i += 1;
      out.push(cmd);
      if (cmd === "Z") continue;
    }
    const n = PATH_ARGC[cmd];
    if (!n) { i += 1; continue; }          // 모르는 명령은 건너뛴다
    const a = toks.slice(i, i + n).map(Number);
    if (a.length < n || a.some((v) => !Number.isFinite(v))) break;
    i += n;
    if (cmd === "A") {
      out.push(a[0] * L.sx, a[1] * L.sy, a[2], a[3], a[4], L.fx(a[5]), L.fy(a[6]));
    } else {
      for (let k = 0; k < n; k += 2) out.push(L.fx(a[k]), L.fy(a[k + 1]));
    }
  }
  return out.join(" ");
}

/* ----- 작은 SVG 헬퍼 ----- */
function node(tag, attrs) {
  const n = document.createElementNS(SVG_NS, tag);
  Object.keys(attrs).forEach((k) => n.setAttribute(k, attrs[k]));
  return n;
}

function strokePath(d, color, sw) {
  return node("path", {
    d, fill: "none", stroke: color, "stroke-width": sw,
    "stroke-linecap": "round", "stroke-linejoin": "round",
  });
}

function bandRect(g, L, yTop, height, fill, clip) {
  // 용기보다 넉넉히 넓은 띠를 클립으로 잘라 안쪽 모양만 남긴다(액체·액면선·피스톤 공용).
  g.appendChild(node("rect", {
    x: L.x - L.w, y: yTop, width: L.w * 3, height: Math.max(0.02, height),
    fill, "clip-path": clip,
  }));
}

/* 채운 ▼ 삼각형(고정장치) */
function downTriangle(cx, cy, s, color) {
  return node("polygon", {
    points: `${cx},${cy + s} ${cx - s},${cy - s} ${cx + s},${cy - s}`,
    fill: color,
  });
}

/* ----- 꼭지 — 관에 끼운 스풀 + 중앙 작은 원 + 옆 손잡이 -----
 * 시안 stopcockAt() 그대로. u = 시안 1단위의 실제 길이(mm).
 */
function stopcockAt(g, cx, cy, u, color, sw) {
  const white = "#ffffff";
  const mk = (rx, ry, rw, rh, s) => g.appendChild(node("rect", {
    x: cx + rx * u, y: cy + ry * u, width: rw * u, height: rh * u,
    fill: white, stroke: color, "stroke-width": s,
  }));
  mk(-1.9, -1.5, 3.8, 3, sw * 0.9);      // 가운데 넓은 사각
  mk(-2.6, -2.3, 5.2, 0.85, sw * 0.85);  // 위 플랜지
  mk(-2.6, 1.45, 5.2, 0.85, sw * 0.85);  // 아래 플랜지
  g.appendChild(node("circle", {
    cx, cy, r: 0.62 * u, fill: white, stroke: color, "stroke-width": sw * 0.8,
  }));
  g.appendChild(node("line", {
    x1: cx + 2.6 * u, y1: cy, x2: cx + 4.4 * u, y2: cy,
    stroke: color, "stroke-width": sw * 0.85, "stroke-linecap": "round",
  }));                                    // 손잡이 막대
  g.appendChild(node("circle", {
    cx: cx + 5 * u, cy, r: 0.7 * u, fill: white, stroke: color, "stroke-width": sw * 0.8,
  }));                                    // 손잡이 끝 원
}

export function renderVessel(obj) {
  const L = vesselLayout(obj);
  const { K, color, sw, us, fx, fy, inner } = L;
  const g = document.createElementNS(SVG_NS, "g");

  // ----- 내부 클립(액체·액면선·피스톤이 용기 안쪽 모양을 따르게 한다) -----
  const clipId = `vesselclip_${obj.id || "x"}`;
  const defs = document.createElementNS(SVG_NS, "defs");
  const clipPath = node("clipPath", { id: clipId });
  if (K.circle) {
    clipPath.appendChild(node("circle", {
      cx: fx(K.circle.cx), cy: fy(K.circle.cy),
      // 원이 상자에 맞춰 늘어나면 타원이 된다 — 시안대로 원을 유지하되 상자 안에 들어가게 us 를 쓴다.
      r: K.circle.r * us,
    }));
  } else {
    clipPath.appendChild(node("path", { d: mapPathD(K.interior, L) }));
  }
  defs.appendChild(clipPath);
  g.appendChild(defs);
  const clip = `url(#${clipId})`;

  // ----- 액체 · 액면선 -----
  const liquid = clamp01(obj.liquid, DEF_LIQUID);
  const levelY = inner.y + inner.h * (1 - liquid);
  if (liquid > 0.004) {
    bandRect(g, L, levelY, L.h * 2, obj.liquidColor || DEF_LIQUID_COLOR, clip);
    bandRect(g, L, levelY - sw * 0.4, sw * 0.8, color, clip);
  }

  // ----- 피스톤(가는 회색 띠 + 위아래 검은 선) · 고정장치 · 추 -----
  if (obj.hasPiston) {
    const pistY = inner.y + inner.h * (1 - clamp01(obj.pistonAt, DEF_PISTON_AT));
    const band = Math.max(0.25, inner.w * PISTON_BAND_RATIO);
    const edge = Math.max(0.1, band * PISTON_EDGE_RATIO);
    bandRect(g, L, pistY - band / 2, band, grayHex(185), clip);
    bandRect(g, L, pistY - band / 2, edge, color, clip);
    bandRect(g, L, pistY + band / 2 - edge, edge, color, clip);

    // 고정장치 ▼ — 벽이 수직인 kind 에서만(기울어진 벽에는 걸 자리가 없다).
    if (obj.hasFix && K.wall) {
      const ts = Math.max(0.35, 1.15 * us);
      const ty = pistY - band / 2 - ts * 1.2;
      g.appendChild(downTriangle(inner.x + ts * 1.15, ty, ts, color));
      g.appendChild(downTriangle(inner.x + inner.w - ts * 1.15, ty, ts, color));
    }
    // 추 — 피스톤 위에 올려놓는다.
    if (obj.hasWeight && K.wall) {
      const cx = inner.x + inner.w / 2;
      const wy = pistY - band / 2;
      const gray = grayHex(143);
      g.appendChild(node("rect", {
        x: cx - 2.4 * us, y: wy - 3.6 * us, width: 4.8 * us, height: 3.6 * us,
        fill: gray, stroke: color, "stroke-width": sw * 0.85,
      }));
      g.appendChild(node("rect", {
        x: cx - 0.75 * us, y: wy - 5 * us, width: 1.5 * us, height: 1.5 * us,
        fill: gray, stroke: color, "stroke-width": sw * 0.8,
      }));
    }
  }

  // ----- 윤곽선 -----
  if (K.circle) {
    g.appendChild(node("circle", {
      cx: fx(K.circle.cx), cy: fy(K.circle.cy), r: K.circle.r * us,
      fill: "none", stroke: color, "stroke-width": sw,
    }));
  }
  if (K.outline) g.appendChild(strokePath(mapPathD(K.outline, L), color, sw));
  if (K.tap) g.appendChild(strokePath(mapPathD(K.tap, L), color, sw * 0.7));

  // ----- 눈금 -----
  if (obj.hasTicks && K.ticks) {
    const len = Math.min(2.6, K.inner.w * 0.3) * L.sx;
    for (let i = 1; i <= K.ticks; i += 1) {
      const ty = inner.y + (inner.h * i) / (K.ticks + 1);
      g.appendChild(node("line", {
        x1: inner.x, y1: ty, x2: inner.x + len, y2: ty,
        stroke: color, "stroke-width": sw * 0.6, "stroke-linecap": "round",
      }));
    }
  }

  // ----- 꼭지(위로 뻗는 관 2줄 + 스풀) -----
  if (obj.hasStopcock) {
    const cx = inner.x + inner.w / 2;
    const top = K.circle ? fy(K.circle.cy) - K.circle.r * us : inner.y;
    const tubeH = 6.2 * us;
    const half = 1.1 * us;
    [-half, half].forEach((dx) => {
      g.appendChild(node("line", {
        x1: cx + dx, y1: top, x2: cx + dx, y2: top - tubeH,
        stroke: color, "stroke-width": sw * 0.85, "stroke-linecap": "round",
      }));
    });
    stopcockAt(g, cx, top - tubeH * 0.55, us, color, sw);
  }

  // ----- 내부 텍스트 -----
  // 글자는 배율 변환 밖에서 절대 좌표로 계산한다(찌그러지면 안 된다 — 명세 §0).
  // 화학식 아래첨자(A(g)·H_2O)는 renderGraphLabel 이 알아서 처리한다.
  const text = String(obj.text ?? "").trim();
  if (text !== "") {
    const size = Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, Math.min(inner.w * 0.16, inner.h * 0.2)));
    const pad = size * 0.5;
    const cx = inner.x + inner.w / 2;
    const pos = obj.textPos === "top" || obj.textPos === "bottom" ? obj.textPos : "middle";
    let ty = inner.y + inner.h / 2;
    let vAlign = "middle";
    if (pos === "top") { ty = inner.y + pad; vAlign = "top"; }
    else if (pos === "bottom") { ty = inner.y + inner.h - pad; vAlign = "bottom"; }
    const lbl = renderGraphLabel(text, { x: cx, y: ty, size, color, anchor: "middle", vAlign, halo: false });
    if (lbl) g.appendChild(lbl);
  }

  const rot = obj.rotation ?? 0;
  if (rot) g.setAttribute("transform", `rotate(${rot} ${L.x + L.w / 2} ${L.y + L.h / 2})`);
  if (obj.opacity != null && obj.opacity !== 1) g.setAttribute("opacity", obj.opacity);
  if (obj.id) g.dataset.id = obj.id;
  return g;
}
