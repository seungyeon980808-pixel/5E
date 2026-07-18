/* ===== RENDER/GAUGE: 자(ruler) · 각도기(protractor) 측정 가이드 =====
 *
 * obj (kind "ruler"):   bbox {x,y,w,h}. 가로 눈금자. 폭 w가 자의 길이(측정 가장자리=위).
 *   - tickIntervalMm 마다 눈금. 3단: 1mm 짧게 / 5mm 중간 / 10mm(1cm) 길게 + cm 숫자.
 * obj (kind "protractor"): bbox {x,y,w,h}. w=지름, h=반지름인 반원(위로 볼록).
 *   - 밑변 지름 + 반원 호 + tickIntervalDeg 마다 방사 눈금, 30°마다 각도 라벨.
 *
 * 공통: obj.rotation(중심 기준 회전), obj.opacity(0~1), obj.strokeLevel/strokeWidth.
 * world 단위 = 1mm. 눈금 간격은 드래그 크기와 무관하게 obj.tickInterval*로 고정.
 */

import { SVG_NS, grayHex } from "./core.js?v=1.1.0";

const clampInterval = (v, min) => (Number.isFinite(v) && v >= min ? v : min);

// 근사 배수 판정(부동소수 안전). posMm이 step의 정수배에 가까우면 true.
function isMultiple(posMm, step) {
  if (step <= 0) return false;
  const r = posMm % step;
  return r < 1e-6 || step - r < 1e-6;
}

function renderRuler(obj) {
  const { x, y, w, h } = obj;
  const stroke = grayHex(obj.strokeLevel ?? 0);
  const sw = obj.strokeWidth ?? 0.2;
  const interval = clampInterval(obj.tickIntervalMm, 1); // 최소 눈금 간격(mm)
  const g = document.createElementNS(SVG_NS, "g");

  // 자 몸통(외곽). 측정 가장자리 = 위쪽(y). 눈금은 위 가장자리에서 아래로 내려온다.
  const body = document.createElementNS(SVG_NS, "rect");
  body.setAttribute("x", x); body.setAttribute("y", y);
  body.setAttribute("width", w); body.setAttribute("height", h);
  body.setAttribute("fill", "none");
  body.setAttribute("stroke", stroke);
  body.setAttribute("stroke-width", sw);
  g.appendChild(body);

  // 3단 눈금 길이(띠 높이 비례): mm 짧게 / 5mm 중간 / 10mm(1cm) 길게.
  const shortLen = h * 0.22;
  const medLen = h * 0.36;
  const longLen = h * 0.55;
  // cm 숫자: 띠가 충분히 높을 때만(너무 낮으면 겹침) 표시. 크기는 띠 높이에 맞춤.
  const numSize = Math.min(h * 0.34, 3.6);
  const showNums = h >= 5;

  const count = Math.floor(w / interval + 1e-6);
  for (let i = 0; i <= count; i += 1) {
    const tx = x + i * interval;
    const posMm = i * interval;
    const isCm = isMultiple(posMm, 10);
    const isHalf = !isCm && isMultiple(posMm, 5);
    const len = isCm ? longLen : (isHalf ? medLen : shortLen);
    // cm 눈금은 살짝 더 진하게(자 느낌).
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", tx); line.setAttribute("y1", y);
    line.setAttribute("x2", tx); line.setAttribute("y2", y + len);
    line.setAttribute("stroke", stroke);
    line.setAttribute("stroke-width", isCm ? sw * 1.4 : sw);
    g.appendChild(line);
    // cm 숫자(0 제외): 긴 눈금 아래, 가운데 정렬.
    if (showNums && isCm && posMm > 0) {
      const t = document.createElementNS(SVG_NS, "text");
      t.setAttribute("x", tx);
      t.setAttribute("y", y + longLen + numSize * 0.95);
      t.setAttribute("font-size", numSize);
      t.setAttribute("fill", stroke);
      t.setAttribute("font-family", "sans-serif");
      t.setAttribute("text-anchor", "middle");
      t.textContent = String(Math.round(posMm / 10)); // cm 값
      g.appendChild(t);
    }
  }
  // 단위 표기(cm): 오른쪽 끝 안쪽에, 폭이 넉넉할 때만.
  if (showNums && w > 14) {
    const unit = document.createElementNS(SVG_NS, "text");
    unit.setAttribute("x", x + w - 1.2);
    unit.setAttribute("y", y + h - numSize * 0.4);
    unit.setAttribute("font-size", numSize * 0.9);
    unit.setAttribute("fill", stroke);
    unit.setAttribute("font-family", "sans-serif");
    unit.setAttribute("text-anchor", "end");
    unit.textContent = "cm";
    g.appendChild(unit);
  }
  return g;
}

function renderProtractor(obj) {
  const { x, y, w, h } = obj;
  const stroke = grayHex(obj.strokeLevel ?? 0);
  const sw = obj.strokeWidth ?? 0.2;
  const stepDeg = clampInterval(obj.tickIntervalDeg, 1);
  const r = Math.min(w / 2, h);        // 반지름(안전)
  const cx = x + w / 2;                 // 밑변 중심
  const cy = y + h;                     // 밑변 y (반원은 위로 볼록)
  const g = document.createElementNS(SVG_NS, "g");

  // 반원 호 + 밑변(닫힌 경로)
  const path = document.createElementNS(SVG_NS, "path");
  const x0 = cx - r, x1 = cx + r;
  path.setAttribute("d", `M ${x0} ${cy} A ${r} ${r} 0 0 1 ${x1} ${cy} Z`);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", stroke);
  path.setAttribute("stroke-width", sw);
  g.appendChild(path);

  // 방사 눈금: 0°(오른쪽=+x) → 180°(왼쪽). 위로 볼록이므로 y는 감소 방향.
  const shortLen = r * 0.08;
  const longLen = r * 0.16;
  const labelSize = Math.max(2.2, r * 0.09);
  for (let deg = 0; deg <= 180 + 1e-6; deg += stepDeg) {
    const major = Math.abs(deg % 30) < 1e-6;
    const rad = (deg * Math.PI) / 180;
    const ux = Math.cos(rad), uy = -Math.sin(rad); // 위로 볼록(y 감소)
    const inner = r - (major ? longLen : shortLen);
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", cx + ux * inner); line.setAttribute("y1", cy + uy * inner);
    line.setAttribute("x2", cx + ux * r);     line.setAttribute("y2", cy + uy * r);
    line.setAttribute("stroke", stroke);
    line.setAttribute("stroke-width", sw);
    g.appendChild(line);
    if (major && deg !== 0 && deg !== 180) {
      const lr = r - longLen - labelSize * 0.8;
      const t = document.createElementNS(SVG_NS, "text");
      t.setAttribute("x", cx + ux * lr);
      t.setAttribute("y", cy + uy * lr + labelSize * 0.35);
      t.setAttribute("font-size", labelSize);
      t.setAttribute("fill", stroke);
      t.setAttribute("font-family", "sans-serif");
      t.setAttribute("text-anchor", "middle");
      t.textContent = String(Math.round(deg));
      g.appendChild(t);
    }
  }
  return g;
}

export function renderGauge(obj) {
  const g = (obj.kind === "protractor") ? renderProtractor(obj) : renderRuler(obj);
  if (obj.opacity != null && obj.opacity !== 1) g.setAttribute("opacity", obj.opacity);
  if (obj.rotation) {
    const cx = obj.x + obj.w / 2;
    const cy = obj.y + obj.h / 2;
    g.setAttribute("transform", `rotate(${obj.rotation} ${cx} ${cy})`);
  }
  if (obj.id) g.dataset.id = obj.id;
  return g;
}
