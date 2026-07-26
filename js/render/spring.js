/* ===== RENDER/SPRING: 용수철(코일) — p1→p2 파라미터 객체 =====
 *
 * 왜 파라미터 객체인가: 시험 그림의 용수철은 길이가 매번 다르다(압축·이완이 문제의
 * 핵심인 경우가 많다). 고정 SVG 에셋으로는 늘였을 때 코일 간격이 함께 늘어나 어색해진다.
 * 그래서 pendulum과 같은 계열(p1/p2 두 점)로 두고, 코일 수·진폭·양끝 직선부를 필드로 쥔다.
 *
 * 기하: p1 ── (직선 lead) ── [코일 coils개] ── (직선 lead) ── p2
 *   axis  = p1→p2 단위벡터, normal = axis를 90° 돌린 것(진폭 방향)
 *   style = "coil"(반원 아크 반복, 평가원 기본) | "zigzag"(직선 지그재그)
 *
 * 좌표계: 세계 mm. 다른 p1/p2 타입(line/circuit/pendulum)과 같은 이동·회전 경로를 탄다.
 */

import { SVG_NS, grayHex, applyDash } from "./core.js?v=1.2.0";
import { withLineLabel } from "./labels.js?v=1.2.0";

export const SPRING_DEFAULTS = {
  coils: 6,          // 코일(굽이) 수
  amplitude: 1.6,    // 축에서 좌우로 벌어지는 폭(mm)
  leadLength: 2,     // 양끝 직선부 길이(mm) — 물체에 닿는 부분
  springStyle: "coil",
};

/* ----- 기하 계산: 렌더·픽·스냅·bbox가 모두 이 함수를 쓴다(단일 출처) ----- */
export function springGeometry(obj) {
  const p1 = obj.p1 || { x: 0, y: 0 };
  const p2 = obj.p2 || { x: 0, y: 0 };
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const L = Math.hypot(dx, dy);
  const ax = L > 0 ? dx / L : 1, ay = L > 0 ? dy / L : 0;   // 축 단위벡터
  const nx = -ay, ny = ax;                                   // 법선(진폭 방향)

  const coils = Math.max(1, Math.round(obj.coils ?? SPRING_DEFAULTS.coils));
  const amp = Math.max(0.1, obj.amplitude ?? SPRING_DEFAULTS.amplitude);
  // 양끝 직선부는 전체 길이의 40%를 넘지 않게 — 짧게 압축해도 코일이 사라지지 않는다.
  const lead = Math.max(0, Math.min(obj.leadLength ?? SPRING_DEFAULTS.leadLength, L * 0.4));
  const coilLen = Math.max(0, L - lead * 2);
  const a = { x: p1.x + ax * lead, y: p1.y + ay * lead };    // 코일 시작
  const b = { x: p2.x - ax * lead, y: p2.y - ay * lead };    // 코일 끝
  return { p1, p2, a, b, L, coilLen, ax, ay, nx, ny, coils, amp, lead };
}

/* 코일 경로(d). style에 따라 반원 아크 반복 또는 지그재그. */
function coilPathD(geo, style) {
  const { a, ax, ay, nx, ny, coils, amp, coilLen } = geo;
  if (coilLen <= 0) return "";
  const step = coilLen / coils;                 // 굽이 하나의 축 방향 길이
  const at = (t, s) => ({ x: a.x + ax * t + nx * s, y: a.y + ay * t + ny * s });

  if (style === "zigzag") {
    // 지그재그: 반 굽이마다 좌우로 꺾인다. 시작·끝은 축 위에서 만난다.
    let d = `M ${a.x} ${a.y}`;
    for (let i = 0; i < coils; i++) {
      const s1 = at(step * (i + 0.25), (i % 2 === 0 ? amp : -amp));
      const s2 = at(step * (i + 0.75), (i % 2 === 0 ? -amp : amp));
      d += ` L ${s1.x} ${s1.y} L ${s2.x} ${s2.y}`;
    }
    const end = at(coilLen, 0);
    return d + ` L ${end.x} ${end.y}`;
  }

  // coil(기본): 굽이마다 반원 두 개를 번갈아 붙여 실제 스프링처럼 둥글게.
  // 원호 반지름은 진폭과 굽이 폭에서 뽑고, sweep을 번갈아 주어 8자가 아니라 나선처럼 보이게 한다.
  let d = `M ${a.x} ${a.y}`;
  const r = Math.max(amp, step * 0.5);
  for (let i = 0; i < coils; i++) {
    const mid = at(step * (i + 0.5), (i % 2 === 0 ? amp : -amp));
    const end = at(step * (i + 1), 0);
    const sweep = i % 2 === 0 ? 1 : 0;
    d += ` A ${r} ${amp} 0 0 ${sweep} ${mid.x} ${mid.y}`;
    d += ` A ${r} ${amp} 0 0 ${sweep} ${end.x} ${end.y}`;
  }
  return d;
}

export function renderSpring(obj) {
  const sw = obj.strokeWidth ?? 0.3;
  const color = grayHex(obj.strokeLevel);
  const geo = springGeometry(obj);
  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;

  const mkLine = (p, q) => {
    const ln = document.createElementNS(SVG_NS, "line");
    ln.setAttribute("x1", p.x); ln.setAttribute("y1", p.y);
    ln.setAttribute("x2", q.x); ln.setAttribute("y2", q.y);
    ln.setAttribute("stroke", color);
    ln.setAttribute("stroke-width", sw);
    ln.setAttribute("stroke-linecap", "round");
    return ln;
  };

  // 양끝 직선부(물체에 닿는 부분)
  if (geo.lead > 0) {
    g.appendChild(mkLine(geo.p1, geo.a));
    g.appendChild(mkLine(geo.b, geo.p2));
  }

  const d = coilPathD(geo, obj.springStyle || SPRING_DEFAULTS.springStyle);
  if (d) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", color);
    path.setAttribute("stroke-width", sw);
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    applyDash(path, obj);
    g.appendChild(path);
  }

  return withLineLabel(g, obj);
}

/* 코일이 진폭만큼 축 밖으로 나가므로 bbox는 그만큼 넓힌다(선택 테두리·내보내기 범위용). */
export function springBBox(o) {
  const { p1, p2, amp } = springGeometry(o);
  const pad = amp + (o.strokeWidth ?? 0.3);
  const minX = Math.min(p1.x, p2.x) - pad, maxX = Math.max(p1.x, p2.x) + pad;
  const minY = Math.min(p1.y, p2.y) - pad, maxY = Math.max(p1.y, p2.y) + pad;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
