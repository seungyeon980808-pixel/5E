/* ===== RENDER/BUBBLE: 말풍선(크기박스 계열) =====
 *
 * 기출 대화 그림(학생 A·B·C가 말하는 장면)의 말풍선이다. 물리 기출 분해 자료 기준
 * 21장에 나온다. 둥근 사각형 몸통과 꼬리가 **하나의 경로**라서 꼬리 이음매에 선이
 * 끊기거나 겹치지 않는다. 글자는 넣지 않는다 — 대사는 5E 글자 객체로 위에 올린다.
 *
 * 스키마
 *   x, y, w, h     몸통 상자(꼬리는 상자 밖으로 나간다)
 *   radius  2.2    모서리 반지름(mm)
 *   tailSide       "bottom" | "top" | "left" | "right"  꼬리가 나오는 변
 *   tailPos  0.3   그 변 위에서 꼬리 뿌리의 위치(0 = 왼쪽·위 끝, 1 = 오른쪽·아래 끝)
 *   tailWidth 3    꼬리 뿌리 폭(mm)
 *   tailLength 3.2 꼬리 길이(mm)
 *   tailSkew -0.6  꼬리 끝이 옆으로 휘는 정도(뿌리 폭 배수, 음수면 반대쪽)
 *   fillLevel 255 · fillNone false · strokeLevel 0 · strokeWidth 0.3
 */

import { SVG_NS, grayHex, applyDash } from "./core.js?v=1.7.0-four-session-integration";

const SIDES = new Set(["bottom", "top", "left", "right"]);

function num(v, dflt, min = -Infinity) {
  return Number.isFinite(v) && v >= min ? v : dflt;
}

/* 배치 계산 — 렌더러와 bbox가 같은 값을 쓴다. */
export function bubbleLayout(obj) {
  const x = num(obj.x, 0), y = num(obj.y, 0);
  const w = num(obj.w, 40, 1), h = num(obj.h, 14, 1);
  const r = Math.min(num(obj.radius, 2.2, 0), w / 2, h / 2);
  const side = SIDES.has(obj.tailSide) ? obj.tailSide : "bottom";
  const along = side === "bottom" || side === "top" ? w : h;
  const tw = Math.min(num(obj.tailWidth, 3, 0.2), Math.max(0.2, along - r * 2));
  const tl = num(obj.tailLength, 3.2, 0);
  const skew = num(obj.tailSkew, -0.6);
  // 뿌리 시작점: 모서리 곡선을 침범하지 않도록 [r, along - r - tw] 안에 가둔다.
  const pos = Math.max(0, Math.min(1, num(obj.tailPos, 0.3)));
  const start = r + (along - r * 2 - tw) * pos;
  return { x, y, w, h, r, side, tw, tl, skew, start };
}

/* 몸통 + 꼬리를 시계 방향 한 경로로 만든다. */
export function bubblePath(obj) {
  const L = bubbleLayout(obj);
  const { x, y, w, h, r, side, tw, tl, skew, start } = L;
  const x2 = x + w, y2 = y + h;
  const tipOff = tw / 2 + tw * skew;       // 뿌리 왼쪽(위쪽) 끝에서 꼬리 끝까지의 옆 방향 거리
  let d = `M ${x + r} ${y}`;
  // 윗변(왼→오)
  if (side === "top") {
    const a = x + start, b = a + tw;
    d += ` L ${a} ${y} L ${a + tipOff} ${y - tl} L ${b} ${y}`;
  }
  d += ` L ${x2 - r} ${y} A ${r} ${r} 0 0 1 ${x2} ${y + r}`;
  // 오른쪽 변(위→아래)
  if (side === "right") {
    const a = y + start, b = a + tw;
    d += ` L ${x2} ${a} L ${x2 + tl} ${a + tipOff} L ${x2} ${b}`;
  }
  d += ` L ${x2} ${y2 - r} A ${r} ${r} 0 0 1 ${x2 - r} ${y2}`;
  // 아랫변(오→왼): 뿌리는 왼쪽 기준으로 계산하고 거꾸로 지나간다.
  if (side === "bottom") {
    const a = x + start, b = a + tw;
    d += ` L ${b} ${y2} L ${a + tipOff} ${y2 + tl} L ${a} ${y2}`;
  }
  d += ` L ${x + r} ${y2} A ${r} ${r} 0 0 1 ${x} ${y2 - r}`;
  // 왼쪽 변(아래→위)
  if (side === "left") {
    const a = y + start, b = a + tw;
    d += ` L ${x} ${b} L ${x - tl} ${a + tipOff} L ${x} ${a}`;
  }
  d += ` L ${x} ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
  return d;
}

/* 꼬리까지 포함한 외곽 — 선택 상자와 내보내기 여백에 쓴다. */
export function bubbleBBox(obj) {
  const L = bubbleLayout(obj);
  const tipOff = L.tw / 2 + L.tw * L.skew;
  let { x, y, w, h } = L;
  if (L.side === "bottom") { h += L.tl; }
  if (L.side === "top") { y -= L.tl; h += L.tl; }
  if (L.side === "right") { w += L.tl; }
  if (L.side === "left") { x -= L.tl; w += L.tl; }
  const tipAlong = L.start + tipOff;
  const along = L.side === "bottom" || L.side === "top" ? L.w : L.h;
  const under = Math.min(0, tipAlong), over = Math.max(0, tipAlong - along);
  if (L.side === "bottom" || L.side === "top") { x += under; w += over - under; }
  else { y += under; h += over - under; }
  return { x, y, w, h };
}

export function renderBubble(obj) {
  const L = bubbleLayout(obj);
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", bubblePath(obj));
  path.setAttribute("fill", obj.fillNone ? "transparent" : grayHex(obj.fillLevel ?? 255));
  path.setAttribute("stroke", grayHex(obj.strokeLevel ?? 0));
  path.setAttribute("stroke-width", obj.strokeWidth ?? 0.3);
  path.setAttribute("stroke-linejoin", "round");
  applyDash(path, obj);
  const rot = obj.rotation ?? 0;
  if (rot) path.setAttribute("transform", `rotate(${rot} ${L.x + L.w / 2} ${L.y + L.h / 2})`);
  if (obj.opacity != null && obj.opacity !== 1) path.setAttribute("opacity", obj.opacity);
  if (obj.id) path.dataset.id = obj.id;
  return path;
}
