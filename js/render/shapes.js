/* ===== RENDER/SHAPES: rect / ellipse / triangle / line / polyline / curve / image / svgAsset ===== */

import {
  SVG_NS,
  grayHex,
  applyDash,
  makeArrowHead,
  polylineMidpoint,
  roundedPolylinePath,
  catmullRomPath,
  catmullRomClosedPath,
  fillTextWithRomanRuns,
  applyObjectLabelFont,
  LABEL_OPTICAL_CENTER_EM,
  makeLabelKnockout,
  applyGlyphHalo,
  DIM_HALO_RATIO,
  LABEL_INK,
} from "./core.js?v=1.4.0";
import { withBoxLabel, withLineLabel } from "./labels.js?v=1.4.0";
import { resolveFill } from "./fill.js?v=1.4.0";
import { getSvgAsset } from "../svg-assets.js?v=1.4.0";
import { normalizeSrcRect } from "../cut-geometry.js?v=1.4.2";

// 직선/폴리라인 끝 화살표(요구): 원래 makeArrowHead 기본값(4.5/1.8/0.3)보다 더 크고, 아래쪽
// (홈) 각도가 더 넓게. 위쪽(끝) 각도는 lenMul:widthMul 비율(0.4)을 그대로 유지해 그대로 둔다.
// 홈 깊이 비율만 0.3→0.16로 줄여 홈 아래쪽 각을 ~106°→~136°로 넓혔다.
const LINE_ARROW_OPTS = { lenMul: 6.5, widthMul: 2.6, notchRatio: 0.16 };

/* ----- rect: size-based shape (DESIGN 2-1 branch A) ----- */
function renderRect(obj) {
  const r = document.createElementNS(SVG_NS, "rect");
  r.setAttribute("x", obj.x);
  r.setAttribute("y", obj.y);
  r.setAttribute("width", obj.w);
  r.setAttribute("height", obj.h);

  // Fill: transparent (none) / solid gray / pattern url ??still clicks (DESIGN 5-3).
  r.setAttribute("fill", resolveFill(obj));
  // strokeLevel 0 = black (DESIGN 2-2). stroke-width is in world units.
  r.setAttribute("stroke", grayHex(obj.strokeLevel));
  r.setAttribute("stroke-width", obj.strokeWidth);
  applyDash(r, obj);

  if (obj.rotation) {
    const cx = obj.x + obj.w / 2;
    const cy = obj.y + obj.h / 2;
    r.setAttribute("transform", `rotate(${obj.rotation} ${cx} ${cy})`);
  }
  if (obj.id) r.dataset.id = obj.id;
  return withBoxLabel(r, obj);
}

/* ----- ellipse: size-based shape; bbox (x/y/w/h) ??cx/cy + rx/ry ----- */
function renderEllipse(obj) {
  const el = document.createElementNS(SVG_NS, "ellipse");
  el.setAttribute("cx", obj.x + obj.w / 2);
  el.setAttribute("cy", obj.y + obj.h / 2);
  el.setAttribute("rx", obj.w / 2);
  el.setAttribute("ry", obj.h / 2);

  // Fill: transparent (none) / solid gray / pattern url ??still clicks (DESIGN 5-3).
  el.setAttribute("fill", resolveFill(obj));
  el.setAttribute("stroke", grayHex(obj.strokeLevel));
  el.setAttribute("stroke-width", obj.strokeWidth);
  applyDash(el, obj);

  if (obj.rotation) {
    const cx = obj.x + obj.w / 2;
    const cy = obj.y + obj.h / 2;
    el.setAttribute("transform", `rotate(${obj.rotation} ${cx} ${cy})`);
  }
  if (obj.id) el.dataset.id = obj.id;
  return withBoxLabel(el, obj);
}

/* ----- triangle: right-angle corner determined by flipX 횞 flipY ----- */
// flipX false / flipY false: bottom-left   flipX true  / flipY false: bottom-right
// flipX false / flipY true:  top-left      flipX true  / flipY true:  top-right
function renderTriangle(obj) {
  const el = document.createElementNS(SVG_NS, "polygon");
  const flipX = obj.flipX ?? false;
  const flipY = obj.flipY ?? false;
  let pts;
  if (!flipX && !flipY) {
    pts = `${obj.x},${obj.y + obj.h} ${obj.x + obj.w},${obj.y + obj.h} ${obj.x},${obj.y}`;
  } else if (flipX && !flipY) {
    pts = `${obj.x + obj.w},${obj.y + obj.h} ${obj.x},${obj.y + obj.h} ${obj.x + obj.w},${obj.y}`;
  } else if (!flipX && flipY) {
    pts = `${obj.x},${obj.y} ${obj.x + obj.w},${obj.y} ${obj.x},${obj.y + obj.h}`;
  } else {
    pts = `${obj.x + obj.w},${obj.y} ${obj.x},${obj.y} ${obj.x + obj.w},${obj.y + obj.h}`;
  }
  el.setAttribute("points", pts);

  // Fill: transparent (none) / solid gray / pattern url ??still clicks (DESIGN 5-3).
  el.setAttribute("fill", resolveFill(obj));
  el.setAttribute("stroke", grayHex(obj.strokeLevel));
  el.setAttribute("stroke-width", obj.strokeWidth);
  applyDash(el, obj);

  if (obj.rotation) {
    const cx = obj.x + obj.w / 2;
    const cy = obj.y + obj.h / 2;
    el.setAttribute("transform", `rotate(${obj.rotation} ${cx} ${cy})`);
  }
  if (obj.id) el.dataset.id = obj.id;
  return el;
}

/* 물결 화살표 기본값. waveLength는 mm라 선을 늘여도 물결의 촘촘함이 유지된다
 * (파장 수를 고정하면 길게 뽑을수록 늘어져 보인다). */
export const WAVY_DEFAULTS = { waveLength: 5, waveAmp: 1.1, tailRatio: 0.35 };
// 화살촉 앞 직선부 = <b>파장 × tailRatio</b>. 화살촉 길이에 비례시켰더니 기본 선 굵기
// (0.2mm)에서 0.3mm가 되어 사실상 보이지 않았다(2026-07-26 교사 지적). 파장에 비례하면
// 물결을 촘촘히 해도 직선부가 같이 줄어 비율이 항상 자연스럽다.

/* ----- line: endpoint-based shape (DESIGN 2-1 branch B); p1?뭦2, no fill ----- */
function renderLine(obj) {
  const savedArrowHead = obj.arrowHead ?? "none";
  // Files created before lineStyle used arrowHead="center" for midpoint arrows.
  let lineStyle = obj.lineMode ?? obj.lineStyle
    ?? (savedArrowHead === "center" ? "middleArrow" : savedArrowHead === "none" ? "solid" : "arrow");
  if (lineStyle === "dimensionArrow") lineStyle = "lengthArrow";
  if (!["solid", "arrow", "middleArrow", "midInward", "lengthArrow", "wavyArrow",
        "scaleBar"].includes(lineStyle)) lineStyle = "solid";
  const arrowHead = lineStyle === "arrow"
    ? ({ right: "end", left: "start", both: "both" }[obj.arrowVariant] || savedArrowHead)
    : "none";
  const sw = obj.strokeWidth ?? 0.2;
  const color = grayHex(obj.strokeLevel);

  const dx = obj.p2.x - obj.p1.x;
  const dy = obj.p2.y - obj.p1.y;
  const L = Math.sqrt(dx * dx + dy * dy);

  let lx1 = obj.p1.x, ly1 = obj.p1.y;
  let lx2 = obj.p2.x, ly2 = obj.p2.y;
  let nx = 0, ny = 0;

  if (L > 0) {
    nx = dx / L; ny = dy / L;
    const arrowLen = sw * 4.5 * 0.7; // retract to notch: length - notchDepth (length * 0.3)
    if (arrowHead === "end") {
      lx2 -= nx * arrowLen; ly2 -= ny * arrowLen;
    } else if (arrowHead === "start") {
      lx1 += nx * arrowLen; ly1 += ny * arrowLen;
    } else if (arrowHead === "both") {
      lx2 -= nx * arrowLen; ly2 -= ny * arrowLen;
      lx1 += nx * arrowLen; ly1 += ny * arrowLen;
    } else if (lineStyle === "lengthArrow") {
      lx2 -= nx * arrowLen; ly2 -= ny * arrowLen;
      lx1 += nx * arrowLen; ly1 += ny * arrowLen;
    }
    // "center" and "none": no adjustment
  }

  /* wavyArrow(물결 화살표) — 광자·전자기파. 직선 화살표와 구분되는 별도 몸통이라
   * 아래의 <line> 조립을 타지 않고 여기서 path로 끝낸다.
   *   · 진폭은 처음부터 끝까지 일정하다(끝에서 줄이면 파동이 사그라드는 것처럼 보인다).
   *   · 파장 수를 정수로 끊어 마지막 점이 축 위(s=0)에 오게 하고,
   *     짧은 직선부를 지나 화살촉이 축 방향으로 붙는다.
   *   · 직선부·화살촉은 둘 다 선 굵기에 비례한다 — 굵기를 키워도 비율이 유지된다.
   *     (2026-07-26 교사 확인: strokeWidth 0.35에서 직선부 0.5mm ⇒ 화살촉 길이의 0.32배) */
  if (lineStyle === "wavyArrow" && L > 0) {
    const headLen = sw * 4.5;
    const waveLen = Math.max(0.5, obj.waveLength ?? WAVY_DEFAULTS.waveLength);
    const tailRatio = Math.max(0, obj.tailRatio ?? WAVY_DEFAULTS.tailRatio);
    const tail = waveLen * tailRatio;
    const body = Math.max(waveLen, L - headLen - tail);
    const waves = Math.max(1, Math.round(body / waveLen));   // 정수 파장으로 끊는다
    const amp = Math.max(0, obj.waveAmp ?? WAVY_DEFAULTS.waveAmp);
    const px = -ny, py = nx;                                  // 진폭 방향(축의 법선)
    const steps = Math.max(96, waves * 36);
    let d = "";
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const t = body * u;
      const s = amp * Math.sin(2 * Math.PI * waves * u);
      d += (i ? " L " : "M ")
        + (obj.p1.x + nx * t + px * s).toFixed(3) + " "
        + (obj.p1.y + ny * t + py * s).toFixed(3);
    }
    d += ` L ${(obj.p1.x + nx * (body + tail)).toFixed(3)} ${(obj.p1.y + ny * (body + tail)).toFixed(3)}`;
    const gw = document.createElementNS(SVG_NS, "g");
    if (obj.id) gw.dataset.id = obj.id;
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", color);
    path.setAttribute("stroke-width", sw);
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    applyDash(path, obj);
    gw.appendChild(path);
    gw.appendChild(makeArrowHead(obj.p2.x, obj.p2.y, nx, ny, sw, color, LINE_ARROW_OPTS));
    return withLineLabel(gw, obj);
  }

  // One <line> segment; strokeLevel 0 = black (DESIGN 2-2), stroke-width in world units.
  const mkSeg = (x1, y1, x2, y2, dashed) => {
    const seg = document.createElementNS(SVG_NS, "line");
    seg.setAttribute("x1", x1);
    seg.setAttribute("y1", y1);
    seg.setAttribute("x2", x2);
    seg.setAttribute("y2", y2);
    seg.setAttribute("stroke", color);
    seg.setAttribute("stroke-width", sw);
    if (dashed) applyDash(seg, obj);
    return seg;
  };

  // "부분 점선": solid for dashRatio of the drawn span (from p1, or p2 when dashFlip),
  // dashed for the rest. Only straight lines; needs a dash length to show the dashes.
  const usePartial = obj.partialDash === true && L > 0 && (obj.dashLength ?? 0) > 0;
  let bodyEls;
  if (usePartial) {
    const segLen = Math.hypot(lx2 - lx1, ly2 - ly1);
    const ux = segLen ? (lx2 - lx1) / segLen : 0;
    const uy = segLen ? (ly2 - ly1) / segLen : 0;
    const ratio = Math.max(0, Math.min(1, obj.dashRatio ?? 0.5));
    const solidLen = ratio * segLen;
    if (!obj.dashFlip) {
      const sx = lx1 + ux * solidLen, sy = ly1 + uy * solidLen;
      bodyEls = [mkSeg(lx1, ly1, sx, sy, false), mkSeg(sx, sy, lx2, ly2, true)];
    } else {
      const sx = lx2 - ux * solidLen, sy = ly2 - uy * solidLen;
      bodyEls = [mkSeg(sx, sy, lx2, ly2, false), mkSeg(lx1, ly1, sx, sy, true)];
    }
  } else {
    bodyEls = [mkSeg(lx1, ly1, lx2, ly2, true)];
  }

  if (lineStyle === "solid" || L === 0) {
    if (bodyEls.length === 1) {
      if (obj.id) bodyEls[0].dataset.id = obj.id;
      return withLineLabel(bodyEls[0], obj);
    }
    const gSolid = document.createElementNS(SVG_NS, "g");
    if (obj.id) gSolid.dataset.id = obj.id;
    bodyEls.forEach((b) => gSolid.appendChild(b));
    return withLineLabel(gSolid, obj);
  }

  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;
  bodyEls.forEach((b) => g.appendChild(b));

  if (arrowHead === "end") {
    g.appendChild(makeArrowHead(obj.p2.x, obj.p2.y, nx, ny, sw, color, LINE_ARROW_OPTS));
  } else if (arrowHead === "start") {
    g.appendChild(makeArrowHead(obj.p1.x, obj.p1.y, -nx, -ny, sw, color, LINE_ARROW_OPTS));
  } else if (arrowHead === "both") {
    g.appendChild(makeArrowHead(obj.p2.x, obj.p2.y, nx, ny, sw, color, LINE_ARROW_OPTS));
    g.appendChild(makeArrowHead(obj.p1.x, obj.p1.y, -nx, -ny, sw, color, LINE_ARROW_OPTS));
  } else if (lineStyle === "middleArrow") {
    const mx = (obj.p1.x + obj.p2.x) / 2;
    const my = (obj.p1.y + obj.p2.y) / 2;
    const direction = obj.arrowVariant === "left" ? -1 : 1;
    g.appendChild(makeArrowHead(mx, my, nx * direction, ny * direction, sw, color, LINE_ARROW_OPTS));
  } else if (lineStyle === "midInward") {
    // Two arrowheads at ~1/3 and ~2/3 of the span, BOTH pointing INWARD toward
    // the midpoint (→ on the left half, ← on the right half) — bidirectional
    // tension/compression. n = p1→p2 unit; left head aims +n, right head −n.
    const p13 = { x: obj.p1.x + (obj.p2.x - obj.p1.x) / 3, y: obj.p1.y + (obj.p2.y - obj.p1.y) / 3 };
    const p23 = { x: obj.p1.x + (obj.p2.x - obj.p1.x) * 2 / 3, y: obj.p1.y + (obj.p2.y - obj.p1.y) * 2 / 3 };
    g.appendChild(makeArrowHead(p13.x, p13.y, nx, ny, sw, color, LINE_ARROW_OPTS));
    g.appendChild(makeArrowHead(p23.x, p23.y, -nx, -ny, sw, color, LINE_ARROW_OPTS));
  } else if (lineStyle === "scaleBar") {
    /* ----- 축척 막대 (지도·현미경 사진) — 2026-07-31 -----
     * 치수선(lengthArrow)과 형제다: 같은 두 점 위에 얹히지만 화살촉이 없고,
     * 라벨이 가운데가 아니라 '막대 위'에 놓인다(지도 관례). 기출 5장이 이것 때문에
     * 막혀 있었다(docs/SURVEY_earth_20260731.md §5).
     *   bars   양 끝에 세로 바 — 가장 흔한 형태
     *   alt    흑백 교차 — 절반을 검게 칠한 막대(축척자)
     *   simple 선만
     * 라벨은 dimensionLabel/dimensionLabelSize 를 그대로 재사용한다 — 치수선에서
     * 이미 쓰는 필드라 인스펙터·복사·스타일 붙여넣기 배선이 공짜로 따라온다. */
    const variant = ["bars", "alt", "simple"].includes(obj.scaleBarVariant)
      ? obj.scaleBarVariant : "bars";
    const capHalf = Math.max(sw * 4, 1.2);
    if (variant === "alt") {
      // 흑백 교차: 막대를 법선 방향으로 두께 있게 세운 뒤 앞 절반만 채운다.
      const th = Math.max(sw * 3, 0.9);           // 막대 두께의 절반
      const mid = { x: (obj.p1.x + obj.p2.x) / 2, y: (obj.p1.y + obj.p2.y) / 2 };
      const quad = (a, b) => {
        const p = document.createElementNS(SVG_NS, "polygon");
        p.setAttribute("points", [
          `${a.x - ny * th},${a.y + nx * th}`,
          `${b.x - ny * th},${b.y + nx * th}`,
          `${b.x + ny * th},${b.y - nx * th}`,
          `${a.x + ny * th},${a.y - nx * th}`,
        ].join(" "));
        p.setAttribute("stroke", color);
        p.setAttribute("stroke-width", sw);
        return p;
      };
      const first = quad(obj.p1, mid);
      first.setAttribute("fill", color);
      const second = quad(mid, obj.p2);
      second.setAttribute("fill", "#ffffff");
      g.appendChild(first);
      g.appendChild(second);
    } else if (variant === "bars") {
      const addCap = (point) => {
        const cap = document.createElementNS(SVG_NS, "line");
        cap.setAttribute("x1", point.x - ny * capHalf);
        cap.setAttribute("y1", point.y + nx * capHalf);
        cap.setAttribute("x2", point.x + ny * capHalf);
        cap.setAttribute("y2", point.y - nx * capHalf);
        cap.setAttribute("stroke", color);
        cap.setAttribute("stroke-width", sw);
        g.appendChild(cap);
      };
      addCap(obj.p1);
      addCap(obj.p2);
    }
    const labelText = obj.dimensionLabel || "";
    if (labelText) {
      const labelSize = obj.dimensionLabelSize || Math.max(2.5, sw * 8);
      const mx = (obj.p1.x + obj.p2.x) / 2;
      const my = (obj.p1.y + obj.p2.y) / 2;
      // 막대 '위'(법선 반대쪽)로 띄운다 — 막대와 글자가 겹치면 지도에서 둘 다 안 읽힌다.
      const gap = capHalf + labelSize * 0.9;
      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", mx + ny * gap);
      label.setAttribute("y", my - nx * gap + labelSize * LABEL_OPTICAL_CENTER_EM);
      label.setAttribute("fill", LABEL_INK);
      label.setAttribute("font-size", labelSize);
      label.setAttribute("text-anchor", "middle");
      applyObjectLabelFont(label, obj.labelType, "label");
      fillTextWithRomanRuns(label, labelText);
      g.appendChild(label);
    }
  } else if (lineStyle === "lengthArrow") {
    g.appendChild(makeArrowHead(obj.p2.x, obj.p2.y, nx, ny, sw, color, LINE_ARROW_OPTS));
    g.appendChild(makeArrowHead(obj.p1.x, obj.p1.y, -nx, -ny, sw, color, LINE_ARROW_OPTS));

    const dimensionVariant = ["basic", "rightBar", "leftBar", "bothBars"].includes(obj.dimensionVariant)
      ? obj.dimensionVariant
      : "basic";
    const capHalf = Math.max(sw * 4, 1.2);
    const addCap = (point) => {
      const cap = document.createElementNS(SVG_NS, "line");
      cap.setAttribute("x1", point.x - ny * capHalf);
      cap.setAttribute("y1", point.y + nx * capHalf);
      cap.setAttribute("x2", point.x + ny * capHalf);
      cap.setAttribute("y2", point.y - nx * capHalf);
      cap.setAttribute("stroke", color);
      cap.setAttribute("stroke-width", sw);
      g.appendChild(cap);
    };
    if (dimensionVariant === "leftBar" || dimensionVariant === "bothBars") addCap(obj.p1);
    if (dimensionVariant === "rightBar" || dimensionVariant === "bothBars") addCap(obj.p2);

    const labelText = obj.dimensionLabel || "d";
    const label = document.createElementNS(SVG_NS, "text");
    const mx = (obj.p1.x + obj.p2.x) / 2;
    const my = (obj.p1.y + obj.p2.y) / 2;
    // 치수 라벨 글자 크기: obj.dimensionLabelSize(mm) 우선, 미설정 시 선 두께 기반 자동.
    const labelSize = obj.dimensionLabelSize || Math.max(2.5, sw * 8);
    label.setAttribute("x", mx);
    // 세로 중심 보정 — 라벨/기호와 같은 기준(core.js LABEL_OPTICAL_CENTER_EM).
    label.setAttribute("y", my + labelSize * LABEL_OPTICAL_CENTER_EM);
    // 치수 라벨도 선 색을 따라가지 않는다 — 검정 고정(2026-07-31 교사 지적).
    label.setAttribute("fill", LABEL_INK);
    label.setAttribute("font-size", labelSize);
    // Match the straight-line external label (makeUprightLabel): HWP equation
    // stack so a dimension label (e.g. "Q") reads identically to a line
    // variable label (e.g. "H"). Style only — geometry/behavior unchanged.
    applyObjectLabelFont(label, obj.labelType);
    label.setAttribute("text-anchor", "middle");
    // dominant-baseline 미지정 — 위 y 보정이 대신한다.
    fillTextWithRomanRuns(label, labelText);
    // 가림은 글자 모양대로만. 예전엔 선 굵기에 비례한 테두리(max(0.8, sw*3)) + 흰 사각형을
    // 함께 씌워, 글자 왼쪽으로 1mm 넘게 흰 영역이 나가 옆 글자를 지웠다(교사 지적).
    // 치수 라벨은 선 위에 얹혀 있다 — 기본 가림으로는 글자 사이로 선이 지나간다.
    // 그래서 이 라벨만 기본값을 DIM_HALO_RATIO 로 둔다(사용자가 지정하면 그 값이 우선).
    applyGlyphHalo(label, labelSize, obj.haloRatio ?? DIM_HALO_RATIO);
    if (obj.labelBg) {
      const ko = makeLabelKnockout([labelText], mx, my + labelSize * LABEL_OPTICAL_CENTER_EM, labelSize, {
        anchor: "middle",
        fontFamily: label.getAttribute("font-family") || undefined,
        fontStyle: label.getAttribute("font-style") || undefined,
        fontWeight: label.getAttribute("font-weight") || undefined,
      });
      if (ko) g.appendChild(ko);
    }
    g.appendChild(label);
  }

  return withLineLabel(g, obj);
}

/* ----- polyline: many connected points, black stroke, no fill (click-to-click) ----- */
// Arrowheads use the SAME single arrowHead field + makeArrowHead() as renderLine
// (one setting for the whole line, no per-segment array):
//   end    = last point, direction of the last segment
//   both   = first point (reverse of first segment) + last point
//   center = 50% path-length point, pointing along travel direction
// The arrow-bearing END SEGMENT is retracted by the arrow length, like renderLine.
function renderPolyline(obj) {
  const sw = obj.strokeWidth ?? 0.2;
  const color = grayHex(obj.strokeLevel);
  const pts = obj.points || [];
  const n = pts.length;

  /* ----- 산점(markerOnly): 잇는 선 없이 점만 찍는다 — 2026-07-31 -----
   * H-R도·은하 분포처럼 점이 수십~수백 개인 자료다. 그래프 모달의 '표시점'은
   * 낱개 클릭이라 이런 양을 감당하지 못했다(docs/SURVEY_earth_20260731.md §5).
   * 새 타입 대신 폴리라인의 옵션으로 두는 이유: 점 배열을 이미 갖고 있고,
   * 그래서 점마다 핸들이 붙어 자료점 하나를 집어 옮기는 것까지 공짜로 된다.
   *   markerSize   점 지름(mm). 없으면 선 굵기에 비례
   *   markerOpen   속 빈 원(○) — 기출에서 두 자료를 구분할 때 쓰는 그 표기 */
  if (obj.markerOnly === true) {
    const g = document.createElementNS(SVG_NS, "g");
    const r = (Number.isFinite(obj.markerSize) && obj.markerSize > 0 ? obj.markerSize : sw * 4) / 2;
    for (const p of pts) {
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("cx", p.x);
      c.setAttribute("cy", p.y);
      c.setAttribute("r", r);
      c.setAttribute("fill", obj.markerOpen ? "#ffffff" : color);
      c.setAttribute("stroke", color);
      c.setAttribute("stroke-width", sw);
      g.appendChild(c);
    }
    if (obj.id) g.dataset.id = obj.id;
    return g;
  }

  // ----- closed polyline: a filled <polygon> (fillable like rect/ellipse/triangle) -----
  // Arrowheads don't apply to a closed shape; it just takes the shared fill + dash.
  if (obj.closed === true) {
    // 경사면처리 on: a filled <path> with rounded joints (keeps the same fill).
    if (obj.rounded === true && n >= 3) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", roundedPolylinePath(pts, obj.cornerRadius ?? 10, true));
      path.setAttribute("fill", resolveFill(obj));
      path.setAttribute("stroke", color);
      path.setAttribute("stroke-width", sw);
      applyDash(path, obj);
      if (obj.id) path.dataset.id = obj.id;
      return path;
    }
    const poly = document.createElementNS(SVG_NS, "polygon");
    poly.setAttribute("points", pts.map((p) => `${p.x},${p.y}`).join(" "));
    poly.setAttribute("fill", resolveFill(obj));
    poly.setAttribute("stroke", color);
    poly.setAttribute("stroke-width", sw);
    applyDash(poly, obj);
    if (obj.id) poly.dataset.id = obj.id;
    return poly;
  }

  const arrowHead = obj.arrowHead ?? "none";

  // Unit directions of the first/last segments (for arrow placement + retraction).
  let endDir = null, startDir = null;
  if (n >= 2) {
    const a = pts[n - 2], b = pts[n - 1];
    const eL = Math.hypot(b.x - a.x, b.y - a.y);
    if (eL > 0) endDir = { x: (b.x - a.x) / eL, y: (b.y - a.y) / eL };
    const c = pts[0], d = pts[1];
    const sL = Math.hypot(d.x - c.x, d.y - c.y);
    if (sL > 0) startDir = { x: (d.x - c.x) / sL, y: (d.y - c.y) / sL };
  }

  // Working copy of the points; retract the arrow-bearing endpoints to the notch.
  const draw = pts.map((p) => ({ x: p.x, y: p.y }));
  const arrowLen = sw * 4.5 * 0.7; // matches renderLine: length - notchDepth
  if ((arrowHead === "end" || arrowHead === "both") && endDir) {
    draw[n - 1] = { x: pts[n - 1].x - endDir.x * arrowLen, y: pts[n - 1].y - endDir.y * arrowLen };
  }
  if ((arrowHead === "start" || arrowHead === "both") && startDir) {
    draw[0] = { x: pts[0].x + startDir.x * arrowLen, y: pts[0].y + startDir.y * arrowLen };
  }

  // 경사면처리 on: a <path> with rounded joints (sharp endpoints keep the
  // arrowhead direction intact); otherwise the plain <polyline>.
  let el;
  if (obj.rounded === true && n >= 3) {
    el = document.createElementNS(SVG_NS, "path");
    el.setAttribute("d", roundedPolylinePath(draw, obj.cornerRadius ?? 10, false));
  } else {
    el = document.createElementNS(SVG_NS, "polyline");
    el.setAttribute("points", draw.map((p) => `${p.x},${p.y}`).join(" "));
  }
  el.setAttribute("fill", "none");
  // strokeLevel 0 = black (DESIGN 2-2). stroke-width is in world units.
  el.setAttribute("stroke", color);
  el.setAttribute("stroke-width", sw);
  applyDash(el, obj);

  if (arrowHead === "none" || n < 2) {
    if (obj.id) el.dataset.id = obj.id;
    return el;
  }

  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;
  g.appendChild(el);

  if ((arrowHead === "end" || arrowHead === "both") && endDir) {
    g.appendChild(makeArrowHead(pts[n - 1].x, pts[n - 1].y, endDir.x, endDir.y, sw, color, LINE_ARROW_OPTS));
  }
  if ((arrowHead === "start" || arrowHead === "both") && startDir) {
    g.appendChild(makeArrowHead(pts[0].x, pts[0].y, -startDir.x, -startDir.y, sw, color, LINE_ARROW_OPTS));
  }
  if (arrowHead === "center") {
    // 중간 화살표 방향 2종(그래프 도구 구간 화살표 §10-⑩): arrowVariant "left" = 진행
    // 방향의 반대(역방향), 그 외("right"/미지정) = 진행 방향(정방향). renderLine의
    // middleArrow와 동일한 arrowVariant 규약을 재사용.
    const m = polylineMidpoint(pts);
    if (m) {
      const flip = obj.arrowVariant === "left" ? -1 : 1;
      g.appendChild(makeArrowHead(m.x, m.y, m.dx * flip, m.dy * flip, sw, color, LINE_ARROW_OPTS));
    }
  }

  return g;
}

/* ----- curve: Catmull-Rom smooth path through anchors ----- */
function renderCurve(obj) {
  const closed = obj.closed === true && (obj.points || []).length >= 3;
  const el = document.createElementNS(SVG_NS, "path");
  el.setAttribute("d", closed ? catmullRomClosedPath(obj.points) : catmullRomPath(obj.points));
  el.setAttribute("fill", closed ? (obj.fillNone ? "transparent" : resolveFill(obj)) : "none");
  el.setAttribute("stroke", grayHex(obj.strokeLevel));
  el.setAttribute("stroke-width", obj.strokeWidth);
  applyDash(el, obj);
  if (obj.id) el.dataset.id = obj.id;

  /* ----- 지구과학 확장 두 가지 (2026-07-31) -----
   * 둘 다 '새 타입'이 아니라 곡선의 옵션으로 둔다. 새 타입으로 만들면 꼭짓점 핸들·
   * 픽·복사·저장·스타일 배선을 전부 새로 깔아야 하는데, 이것들은 본질이 곡선이라
   * 그럴 이유가 없다. 옵션으로 두면 "마우스로 찝어 구부리기"가 공짜로 따라온다.
   *   frontKind   전선 기호(한랭·온난·정체·폐색) — 곡선을 따라 반복해 얹는다
   *   inlineLabel 등치선 값 라벨 — 선을 끊고 그 자리에 값이 앉는다(지도 관례)
   * 둘 다 경로 위 좌표가 필요해 SVG 의 getPointAtLength 를 쓴다. 이 API 는 문서에
   * 붙지 않은 요소에서도 동작하므로 렌더 도중 호출해도 안전하다(export 경로 포함). */
  const wantsPathWork = obj.frontKind || obj.inlineLabel;
  if (!wantsPathWork || !(obj.points || []).length) return el;

  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;
  g.appendChild(el);

  let L = 0;
  try { L = el.getTotalLength(); } catch { L = 0; }
  if (!(L > 0)) return g;
  const at = (d) => {
    const p = el.getPointAtLength(Math.max(0, Math.min(L, d)));
    const q = el.getPointAtLength(Math.max(0, Math.min(L, d + 0.4)));
    const vx = q.x - p.x, vy = q.y - p.y;
    const len = Math.hypot(vx, vy) || 1;
    return { x: p.x, y: p.y, tx: vx / len, ty: vy / len };
  };
  const color = grayHex(obj.strokeLevel);
  const sw = obj.strokeWidth ?? 0.2;

  if (obj.frontKind) {
    /* 기호는 진행 방향 왼쪽(법선 -n)에 붙이는 것이 기상 관례다. flipSide 로 뒤집는다.
     * 정체 전선만 예외로, 삼각과 반원이 서로 반대쪽에 번갈아 붙는다(그게 정의다). */
    const kind = ["cold", "warm", "stationary", "occluded"].includes(obj.frontKind)
      ? obj.frontKind : "cold";
    const gap = Number.isFinite(obj.frontGap) && obj.frontGap > 1 ? obj.frontGap : 7;
    const size = Number.isFinite(obj.frontSize) && obj.frontSize > 0 ? obj.frontSize : gap * 0.34;
    const baseSide = obj.flipSide ? -1 : 1;
    let k = 0;
    for (let d = gap * 0.6; d <= L - size; d += gap, k += 1) {
      const p = at(d);
      // 법선(왼쪽) = 진행방향을 -90° 돌린 것. SVG 는 y가 아래로 자란다.
      const nx = p.ty, ny = -p.tx;
      let mark = kind, side = baseSide;
      if (kind === "stationary") { mark = k % 2 ? "warm" : "cold"; side = k % 2 ? -baseSide : baseSide; }
      else if (kind === "occluded") { mark = k % 2 ? "warm" : "cold"; }
      const sx = nx * side, sy = ny * side;
      if (mark === "cold") {
        // 삼각: 밑변은 선 위, 꼭짓점이 바깥으로.
        const a = { x: p.x - p.tx * size * 0.6, y: p.y - p.ty * size * 0.6 };
        const b = { x: p.x + p.tx * size * 0.6, y: p.y + p.ty * size * 0.6 };
        const c = { x: p.x + sx * size, y: p.y + sy * size };
        const tri = document.createElementNS(SVG_NS, "polygon");
        tri.setAttribute("points", `${a.x},${a.y} ${c.x},${c.y} ${b.x},${b.y}`);
        tri.setAttribute("fill", color);
        tri.setAttribute("stroke", color);
        tri.setAttribute("stroke-width", sw * 0.5);
        g.appendChild(tri);
      } else {
        // 반원: 지름이 선 위에 놓이고 볼록한 쪽이 바깥으로. 큰 호 플래그는 항상 0,
        // sweep 은 붙는 쪽에 따라 뒤집어야 반원이 선 안쪽으로 말리지 않는다.
        const r = size * 0.6;
        const a = { x: p.x - p.tx * r, y: p.y - p.ty * r };
        const b = { x: p.x + p.tx * r, y: p.y + p.ty * r };
        const cross = p.tx * sy - p.ty * sx;   // 붙는 쪽 판별(부호만 쓴다)
        const arc = document.createElementNS(SVG_NS, "path");
        arc.setAttribute("d", `M ${a.x} ${a.y} A ${r} ${r} 0 0 ${cross > 0 ? 1 : 0} ${b.x} ${b.y}`);
        arc.setAttribute("fill", color);
        arc.setAttribute("stroke", color);
        arc.setAttribute("stroke-width", sw * 0.5);
        g.appendChild(arc);
      }
    }
  }

  if (obj.inlineLabel) {
    /* 등치선 값 라벨: 선을 끊고 그 자리에 값이 앉는다. 실제로 경로를 자르는 대신
     * 바탕색 사각형을 깔아 선을 가린다 — 경로를 자르면 곡선을 구부릴 때마다 다시
     * 잘라야 하고, 도형이 둘로 갈라져 한 객체로 다루기 어려워진다.
     * 글자는 그 지점의 접선 방향으로 눕힌다(지도 관례). 위아래가 뒤집히지 않게
     * 기울기가 ±90°를 넘으면 180° 돌린다. */
    const t = Number.isFinite(obj.inlineLabelT) ? Math.max(0, Math.min(1, obj.inlineLabelT)) : 0.5;
    const size = obj.inlineLabelSize || Math.max(2.2, sw * 7);
    const p = at(L * t);
    let deg = Math.atan2(p.ty, p.tx) * 180 / Math.PI;
    if (deg > 90) deg -= 180; else if (deg < -90) deg += 180;
    const text = String(obj.inlineLabel);
    const halfW = size * 0.34 * text.length + size * 0.18;
    const mask = document.createElementNS(SVG_NS, "rect");
    mask.setAttribute("x", p.x - halfW);
    mask.setAttribute("y", p.y - size * 0.62);
    mask.setAttribute("width", halfW * 2);
    mask.setAttribute("height", size * 1.24);
    mask.setAttribute("fill", "#ffffff");
    mask.setAttribute("transform", `rotate(${deg},${p.x},${p.y})`);
    g.appendChild(mask);
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", p.x);
    label.setAttribute("y", p.y + size * LABEL_OPTICAL_CENTER_EM);
    label.setAttribute("fill", LABEL_INK);
    label.setAttribute("font-size", size);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("transform", `rotate(${deg},${p.x},${p.y})`);
    applyObjectLabelFont(label, obj.labelType, "label");
    fillTextWithRomanRuns(label, text);
    g.appendChild(label);
  }
  return g;
}

/* ----- srcRect: 원본 그림의 일부만 상자에 보여 주기 -------------------------
 * 가위·지우개로 만든 조각은 상자를 보이는 범위로 좁히고(cut-geometry.js의
 * tightenBoxObject), 대신 "원본의 어느 부분인지"를 obj.srcRect(0~1 분수)로 들고 온다.
 * 여기서는 중첩 <svg viewBox>로 그 부분만 상자에 그린다 — "이 부분만 이 상자에"가 SVG
 * 문법 자체로 풀리므로 클릭·이동·회전·크기조절은 상자를 그대로 쓰면 된다.
 *
 * 중첩 <svg>의 좌표계는 **원본 상자를 mm로 되돌린 크기**(U×V)로 잡는다. 그래야
 * preserveAspectRatio="xMidYMid meet"(svgAsset)이 원본과 똑같은 비율로 앉는다.
 * U·V는 현재 상자에서 되계산하므로 크기조절에도 그대로 따라온다.
 * srcRect가 없으면 이 경로를 아예 타지 않는다(기존 동작 100% 유지). */
function srcRectOf(obj) {
  if (!(obj.w > 0) || !(obj.h > 0)) return null;
  return normalizeSrcRect(obj.srcRect);
}
function makeSrcRectViewport(obj, sr, href, preserveAspectRatio) {
  const U = obj.w / sr.w, V = obj.h / sr.h;   // 원본 상자 전체의 크기(mm)
  const nested = document.createElementNS(SVG_NS, "svg");
  nested.setAttribute("x", obj.x);
  nested.setAttribute("y", obj.y);
  nested.setAttribute("width", obj.w);
  nested.setAttribute("height", obj.h);
  nested.setAttribute("viewBox", `${sr.x * U} ${sr.y * V} ${obj.w} ${obj.h}`);
  nested.setAttribute("preserveAspectRatio", "none");
  nested.setAttribute("overflow", "hidden");
  const img = document.createElementNS(SVG_NS, "image");
  img.setAttribute("x", "0");
  img.setAttribute("y", "0");
  img.setAttribute("width", U);
  img.setAttribute("height", V);
  img.setAttribute("href", href);
  img.setAttribute("preserveAspectRatio", preserveAspectRatio);
  nested.appendChild(img);
  return nested;
}

/* ----- image: embedded raster via SVG <image> (href = base64 data URL) ----- */
function renderImage(obj) {
  const sr = srcRectOf(obj);
  let el;
  if (sr) {
    el = makeSrcRectViewport(obj, sr, obj.src, "none");
  } else {
    el = document.createElementNS(SVG_NS, "image");
    el.setAttribute("x", obj.x);
    el.setAttribute("y", obj.y);
    el.setAttribute("width", obj.w);
    el.setAttribute("height", obj.h);
    el.setAttribute("href", obj.src);
    el.setAttribute("preserveAspectRatio", "none");
  }
  if (obj.opacity != null) el.setAttribute("opacity", obj.opacity);
  const rot = obj.rotation ?? 0;
  const cx = obj.x + obj.w / 2;
  const cy = obj.y + obj.h / 2;

  // ----- no erased regions → identical to the original plain <image> path -----
  const cutouts = Array.isArray(obj.cutouts) ? obj.cutouts : [];
  if (cutouts.length === 0) {
    if (obj.id) el.dataset.id = obj.id;
    if (rot !== 0) el.setAttribute("transform", `rotate(${rot},${cx},${cy})`);
    return el;
  }

  // ----- cutouts present → wrap the image in a <g> that carries its OWN <defs>
  // + <mask>, so the mask travels with the object node itself (works identically
  // in the live render AND standalone SVG export — both call renderObject). The
  // group holds the rotation; the mask lives in the pre-rotation box space.
  // White = keep, black = erased/transparent. Opacity still multiplies. -----
  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;
  if (rot !== 0) g.setAttribute("transform", `rotate(${rot},${cx},${cy})`);

  const cm = buildCutoutMask(obj);
  if (!cm) { g.appendChild(el); return g; }
  g.appendChild(cm.defs);
  const masked = document.createElementNS(SVG_NS, "g");
  masked.setAttribute("mask", `url(#${cm.maskId})`);
  masked.appendChild(el);
  g.appendChild(masked);
  return g;
}

/* 지우기 영역(cutouts)을 마스크에 검정으로 칠한다. 좌표는 객체 상자의 0~1 분수
 * (maskContentUnits="objectBoundingBox") — 이동·크기변경·회전에 자동으로 따라붙는다.
 *   rect : {x,y,w,h}                    — 사각형 지우개
 *   path : {points[], brushWidth}       — 브러시 획
 *   poly : {points[]}                   — 채운 다각형(가위로 이미지를 반 자를 때) */
function appendCutoutShapes(mask, cutouts) {
  for (const cut of cutouts) {
    if (cut && cut.type === "outside-poly") {
      const pts = Array.isArray(cut.points) ? cut.points : [];
      if (pts.length < 3) continue;
      const outside = document.createElementNS(SVG_NS, "rect");
      outside.setAttribute("x", "0"); outside.setAttribute("y", "0");
      outside.setAttribute("width", "1"); outside.setAttribute("height", "1");
      outside.setAttribute("fill", "#000000");
      mask.appendChild(outside);
      const keep = document.createElementNS(SVG_NS, "polygon");
      keep.setAttribute("points", pts.map((p) => `${p.x},${p.y}`).join(" "));
      keep.setAttribute("fill", "#ffffff");
      mask.appendChild(keep);
    } else if (cut && cut.type === "poly") {
      const pts = Array.isArray(cut.points) ? cut.points : [];
      if (pts.length < 3) continue;
      const poly = document.createElementNS(SVG_NS, "polygon");
      poly.setAttribute("points", pts.map((p) => `${p.x},${p.y}`).join(" "));
      poly.setAttribute("fill", "#000000");
      mask.appendChild(poly);
    } else if (cut && cut.type === "rect") {
      const r = document.createElementNS(SVG_NS, "rect");
      r.setAttribute("x", cut.x); r.setAttribute("y", cut.y);
      r.setAttribute("width", cut.w); r.setAttribute("height", cut.h);
      r.setAttribute("fill", "#000000");
      mask.appendChild(r);
    } else if (cut && (cut.type === "path" || cut.type === "lasso")) {
      const pts = Array.isArray(cut.points) ? cut.points : [];
      if (pts.length < 3) continue;
      const bw = cut.brushWidth || 0.03;
      if (pts.length === 1) {
        // a single tap → a round dot of the brush radius
        const c = document.createElementNS(SVG_NS, "circle");
        c.setAttribute("cx", pts[0].x); c.setAttribute("cy", pts[0].y);
        c.setAttribute("r", bw / 2);
        c.setAttribute("fill", "#000000");
        mask.appendChild(c);
      } else {
        const poly = document.createElementNS(SVG_NS, "polygon");
        poly.setAttribute("points", pts.map((p) => `${p.x},${p.y}`).join(" "));
        poly.setAttribute("fill", "#000000");
        poly.setAttribute("stroke", "#000000");
        poly.setAttribute("stroke-width", bw);
        poly.setAttribute("stroke-linecap", "round");
        poly.setAttribute("stroke-linejoin", "round");
        mask.appendChild(poly);
      }
    }
  }
}

/* cutouts가 있으면 <defs><mask>를 만들어 반환(없으면 null). 흰=보임, 검정=지워짐.
 * 단위는 userSpaceOnUse + 상자 크기만큼 스케일한 <g>다. 예전엔 objectBoundingBox를
 * 썼지만, srcRect가 있는 객체는 <image>가 중첩 <svg> 안으로 들어가 "객체 상자"가
 * 모호해진다(엔진마다 다르다). 상자 좌표를 직접 써서 그 모호함을 없앤다 — 결과 좌표계
 * (상자의 0~1 분수, 회전 풀기 전)는 예전과 완전히 같다. */
function buildCutoutMask(obj) {
  const cutouts = Array.isArray(obj.cutouts) ? obj.cutouts : [];
  if (cutouts.length === 0) return null;
  if (!(obj.w > 0) || !(obj.h > 0)) return null;
  const maskId = `imgmask_${obj.id}`;
  const defs = document.createElementNS(SVG_NS, "defs");
  const mask = document.createElementNS(SVG_NS, "mask");
  mask.setAttribute("id", maskId);
  mask.setAttribute("maskUnits", "userSpaceOnUse");
  mask.setAttribute("maskContentUnits", "userSpaceOnUse");
  // 마스크 영역은 예전 기본값(-10%~110%)과 같게 잡아 동작을 그대로 유지한다.
  mask.setAttribute("x", obj.x - obj.w * 0.1);
  mask.setAttribute("y", obj.y - obj.h * 0.1);
  mask.setAttribute("width", obj.w * 1.2);
  mask.setAttribute("height", obj.h * 1.2);
  // 이 <g> 안에서는 좌표가 다시 상자의 0~1 분수가 된다.
  const frac = document.createElementNS(SVG_NS, "g");
  frac.setAttribute("transform", `translate(${obj.x},${obj.y}) scale(${obj.w},${obj.h})`);
  const base = document.createElementNS(SVG_NS, "rect");
  base.setAttribute("x", "0"); base.setAttribute("y", "0");
  base.setAttribute("width", "1"); base.setAttribute("height", "1");
  base.setAttribute("fill", "#ffffff");
  frac.appendChild(base);
  appendCutoutShapes(frac, cutouts);
  mask.appendChild(frac);
  defs.appendChild(mask);
  return { defs, maskId };
}

/* ----- svgAsset: one selectable, image-like built-in SVG asset ----- */
function renderSvgAsset(obj) {
  const asset = getSvgAsset(obj.assetId);
  const href = obj.src || asset?.dataUri || "";
  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;

  const body = document.createElementNS(SVG_NS, "rect");
  body.setAttribute("x", obj.x);
  body.setAttribute("y", obj.y);
  body.setAttribute("width", obj.w);
  body.setAttribute("height", obj.h);
  body.setAttribute("fill", "transparent");
  g.appendChild(body);

  const sr = srcRectOf(obj);
  let image;
  if (sr) {
    // 잘린 조각: 좁혀진 상자에 원본의 srcRect 부분만 (중첩 <svg viewBox>).
    image = makeSrcRectViewport(obj, sr, href, "xMidYMid meet");
  } else {
    image = document.createElementNS(SVG_NS, "image");
    image.setAttribute("x", obj.x);
    image.setAttribute("y", obj.y);
    image.setAttribute("width", obj.w);
    image.setAttribute("height", obj.h);
    image.setAttribute("href", href);
    image.setAttribute("preserveAspectRatio", "xMidYMid meet");
  }
  // 가위로 잘린 svgAsset도 이미지와 동일하게 마스크로 반쪽을 지운다.
  const cm = buildCutoutMask(obj);
  if (cm) {
    g.appendChild(cm.defs);
    const masked = document.createElementNS(SVG_NS, "g");
    masked.setAttribute("mask", `url(#${cm.maskId})`);
    masked.appendChild(image);
    image = masked;
  }
  g.appendChild(image);

  const rot = obj.rotation ?? 0;
  if (rot !== 0) {
    const cx = obj.x + obj.w / 2;
    const cy = obj.y + obj.h / 2;
    g.setAttribute("transform", `rotate(${rot},${cx},${cy})`);
  }
  return g;
}

export {
  renderRect,
  renderEllipse,
  renderTriangle,
  renderLine,
  renderPolyline,
  renderCurve,
  renderImage,
  renderSvgAsset,
};
