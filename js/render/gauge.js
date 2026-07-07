/* ===== RENDER/GAUGE: 자(ruler) · 각도기(protractor) 측정 가이드 =====
 *
 * obj (kind "ruler"):   bbox {x,y,w,h}. 가로 눈금자. 폭 w가 자의 길이.
 *   - tickIntervalMm 마다 짧은 눈금, 10칸마다 긴 눈금 + 숫자(mm) 라벨.
 * obj (kind "protractor"): bbox {x,y,w,h}. w=지름, h=반지름인 반원(위로 볼록).
 *   - 밑변 지름 + 반원 호 + tickIntervalDeg 마다 방사 눈금, 30°마다 각도 라벨.
 *
 * 공통: obj.rotation(중심 기준 회전), obj.opacity(0~1), obj.strokeLevel/strokeWidth.
 * world 단위 = 1mm. 눈금 간격은 드래그 크기와 무관하게 obj.tickInterval*로 고정.
 */

import { SVG_NS, grayHex } from "./core.js?v=0.54.10";

const clampInterval = (v, min) => (Number.isFinite(v) && v >= min ? v : min);

function renderRuler(obj) {
  const { x, y, w, h } = obj;
  const stroke = grayHex(obj.strokeLevel ?? 0);
  const sw = obj.strokeWidth ?? 0.2;
  const interval = clampInterval(obj.tickIntervalMm, 1); // mm
  const g = document.createElementNS(SVG_NS, "g");

  // 외곽 띠(자 몸통)
  const body = document.createElementNS(SVG_NS, "rect");
  body.setAttribute("x", x); body.setAttribute("y", y);
  body.setAttribute("width", w); body.setAttribute("height", h);
  body.setAttribute("fill", "none");
  body.setAttribute("stroke", stroke);
  body.setAttribute("stroke-width", sw);
  g.appendChild(body);

  // 눈금은 위쪽 가장자리(y)에서 아래로. 짧은 눈금 = 띠 높이의 30%, 긴 눈금 = 60%.
  const shortLen = h * 0.30;
  const longLen = h * 0.60;
  const labelSize = Math.min(h * 0.42, Math.max(2.2, interval * 0.9)); // mm
  // 긴 눈금+숫자는 '눈금 간격'과 무관하게 10mm(1cm) 위치마다(간격이 10mm↑면 매 눈금).
  const majorEveryMm = Math.max(10, interval);
  const count = Math.floor(w / interval + 1e-6);
  for (let i = 0; i <= count; i += 1) {
    const tx = x + i * interval;
    const posMm = i * interval;
    const major = Math.abs(posMm % majorEveryMm) < 1e-6 || Math.abs(posMm % majorEveryMm - majorEveryMm) < 1e-6;
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", tx); line.setAttribute("y1", y);
    line.setAttribute("x2", tx); line.setAttribute("y2", y + (major ? longLen : shortLen));
    line.setAttribute("stroke", stroke);
    line.setAttribute("stroke-width", sw);
    g.appendChild(line);
    if (major && i !== 0) {
      const t = document.createElementNS(SVG_NS, "text");
      t.setAttribute("x", tx + 0.5);
      t.setAttribute("y", y + longLen + labelSize);
      t.setAttribute("font-size", labelSize);
      t.setAttribute("fill", stroke);
      t.setAttribute("font-family", "sans-serif");
      t.textContent = String(Math.round(posMm)); // mm 값
      g.appendChild(t);
    }
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
