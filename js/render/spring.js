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
  turns: 6,          // 감은 수 (코일 바퀴 수)
  radius: 1.8,       // 코일 반지름(mm) — 나선의 굵기
  leadLength: 2,     // 양끝 직선부 길이(mm) — 물체에 닿는 부분
  springStyle: "helix",
  tilt: 0.55,        // 시선 기울기(반지름 대비). 클수록 고리가 많이 겹쳐 입체감이 커진다
};

/* ----- 기하 계산: 렌더·픽·스냅·bbox가 모두 이 함수를 쓴다(단일 출처) ----- */
export function springGeometry(obj) {
  const p1 = obj.p1 || { x: 0, y: 0 };
  const p2 = obj.p2 || { x: 0, y: 0 };
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const L = Math.hypot(dx, dy);
  const ax = L > 0 ? dx / L : 1, ay = L > 0 ? dy / L : 0;   // 축 단위벡터
  const nx = -ay, ny = ax;                                   // 법선(진폭 방향)

  // 감은 수·반지름이 정식 이름. 옛 파일의 coils/amplitude 도 그대로 읽는다(하위호환).
  const turns = Math.max(1, Math.round(obj.turns ?? obj.coils ?? SPRING_DEFAULTS.turns));
  const radius = Math.max(0.1, obj.radius ?? obj.amplitude ?? SPRING_DEFAULTS.radius);
  const tilt = Math.max(0, obj.tilt ?? SPRING_DEFAULTS.tilt);
  // 양끝 직선부는 전체 길이의 40%를 넘지 않게 — 짧게 압축해도 코일이 사라지지 않는다.
  const lead = Math.max(0, Math.min(obj.leadLength ?? SPRING_DEFAULTS.leadLength, L * 0.4));
  const coilLen = Math.max(0, L - lead * 2);
  const a = { x: p1.x + ax * lead, y: p1.y + ay * lead };    // 코일 시작
  const b = { x: p2.x - ax * lead, y: p2.y - ay * lead };    // 코일 끝
  return { p1, p2, a, b, L, coilLen, ax, ay, nx, ny, turns, radius, tilt, lead,
           coils: turns, amp: radius };   // coils/amp = 옛 이름 별칭
}

/* 코일 경로(d).
 *
 * ※ 예전 구현은 굽이마다 SVG 아크(A) 두 개를 이어 붙였는데, 반지름을 amp 기준으로 잡는
 *   바람에 반굽이 폭보다 커져 아크가 눌리고 접점에서 접선이 꺾여 **첨점**이 생겼다.
 *   (step 2.33mm, 반굽이 1.17mm인데 rx 1.60mm — 기하적으로 매끈할 수 없다.)
 *   그래서 아크를 버리고, 사인 곡선을 촘촘히 샘플링해 잇는다. 접선이 연속이라 첨점이 없고
 *   길이·코일 수·진폭을 어떻게 줘도 항상 매끈하다.
 */
/* 사인 1/4주기를 3차 베지어로 근사할 때의 제어점 계수.
 * 오차 0.7%(중점 0.7121A vs 정확값 0.7071A) — 인쇄 크기에서 보이지 않는다.
 * 이 방식은 마루에서 접선이 수평, 영점에서 양쪽 접선이 같아 **C1 연속**이라
 * 코일이 아무리 촘촘해도(진폭 > 반굽이 폭이어도) 첨점이 생길 수 없다. */
const Q_CTRL_X = 0.36;                    // 제어점의 축 방향 위치(1/4주기 대비)
const Q_CTRL_Y = 0.36 * Math.PI / 2;      // ≈0.5655 — 영점 기울기와 맞물리는 값

const HELIX_SAMPLES_PER_TURN = 56;   // 반지름 2mm에서 현 오차 ≈0.003mm — 인쇄에서 보이지 않는다

function coilPathD(geo, style) {
  const { a, ax, ay, nx, ny, coils, amp, coilLen, turns, radius, tilt } = geo;
  if (coilLen <= 0) return "";
  const at = (t, s) => ({ x: a.x + ax * t + nx * s, y: a.y + ay * t + ny * s });

  if (style !== "coil" && style !== "zigzag") {
    /* helix(기본) — 실제로 감긴 나선을 '살짝 비스듬히' 본 투영.
     *   축 방향 : coilLen·θ/(2πN) + tilt·R·(cosθ − 1)
     *   가로 방향: R·sinθ
     * cos 항이 축 방향을 앞뒤로 흔들어 고리가 서로 겹치고 교차한다 — 사인 곡선(평면)과
     * 달리 '감겨 있다'는 인상이 나오는 이유다. θ=0·2πN 에서 보정항이 0이라 양 끝은
     * 정확히 축 위에서 시작·종료해 직선부와 매끄럽게 이어진다. */
    const N = turns, R = radius;
    // 보정항 k의 상한 = pitch × 0.20.
    //  · 이보다 크면 첫 고리가 시작점보다 앞으로 튀어나가 직선부를 침범한다
    //    (0.24에서 -0.035·pitch 이탈 실측).
    //  · 이보다 작으면 dt/dθ 가 항상 양수라 고리가 교차하지 않아 '평면 사인'으로 보인다
    //    (교차 조건: 2πc > 1 → c > 0.159).
    //  즉 0.16~0.20 이 유일한 해 구간이고, 여유를 두어 상한을 0.20으로 잡는다.
    const pitch = coilLen / N;
    const k = Math.min(tilt * R, pitch * 0.20);
    const total = 2 * Math.PI * N;
    const steps = Math.max(24, Math.round(N * HELIX_SAMPLES_PER_TURN));
    let d = "";
    for (let i = 0; i <= steps; i++) {
      const th = total * (i / steps);
      const t = coilLen * (i / steps) + k * (Math.cos(th) - 1);
      const p = at(t, R * Math.sin(th));
      d += (i === 0 ? "M " : " L ") + `${p.x.toFixed(3)} ${p.y.toFixed(3)}`;
    }
    return d;
  }

  if (style === "zigzag") {
    // 지그재그: 반 굽이마다 좌우로 꺾인다(전기 회로 저항식이 아니라 역학 교재식 삼각파).
    const step = coilLen / coils;
    let d = `M ${a.x} ${a.y}`;
    for (let i = 0; i < coils; i++) {
      const s1 = at(step * (i + 0.25), (i % 2 === 0 ? amp : -amp));
      const s2 = at(step * (i + 0.75), (i % 2 === 0 ? -amp : amp));
      d += ` L ${s1.x} ${s1.y} L ${s2.x} ${s2.y}`;
    }
    const end = at(coilLen, 0);
    return d + ` L ${end.x} ${end.y}`;
  }

  // coil(기본): 사인 한 주기 = 굽이 하나. 1/4주기씩 3차 베지어로 잇는다.
  const P = coilLen / coils;          // 한 굽이(주기)
  const q = P / 4;                    // 1/4주기
  const fmt = (p) => `${p.x.toFixed(3)} ${p.y.toFixed(3)}`;
  const start = at(0, 0);
  let d = `M ${fmt(start)}`;
  // 한 구간: 축 위 t0에서 시작해 진폭 s0 → s1 로 가는 1/4주기.
  const quarter = (t0, s0, s1) => {
    const peakStart = Math.abs(s0) > Math.abs(s1);    // 마루에서 출발 → 접선 수평
    const c1 = peakStart
      ? at(t0 + Q_CTRL_X * q, s0)
      : at(t0 + Q_CTRL_X * q, Q_CTRL_Y * s1);
    const c2 = peakStart
      ? at(t0 + (1 - Q_CTRL_X) * q, Q_CTRL_Y * s0)
      : at(t0 + (1 - Q_CTRL_X) * q, s1);
    const end = at(t0 + q, s1);
    d += ` C ${fmt(c1)} ${fmt(c2)} ${fmt(end)}`;
  };
  for (let i = 0; i < coils; i++) {
    const t0 = P * i;
    quarter(t0, 0, amp);            // 영점 → 마루
    quarter(t0 + q, amp, 0);        // 마루 → 영점
    quarter(t0 + 2 * q, 0, -amp);   // 영점 → 골
    quarter(t0 + 3 * q, -amp, 0);   // 골 → 영점
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
  const { p1, p2, radius } = springGeometry(o);
  const pad = radius + (o.strokeWidth ?? 0.3);
  const minX = Math.min(p1.x, p2.x) - pad, maxX = Math.max(p1.x, p2.x) + pad;
  const minY = Math.min(p1.y, p2.y) - pad, maxY = Math.max(p1.y, p2.y) + pad;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
