/* ===== RENDER/SPRING: 용수철(코일) — p1→p2 파라미터 객체 =====
 *
 * 왜 파라미터 객체인가: 시험 그림의 용수철은 길이가 매번 다르다(압축·이완이 문제의
 * 핵심인 경우가 많다). 고정 SVG 에셋으로는 늘였을 때 코일 간격이 함께 늘어나 어색해진다.
 * 그래서 pendulum과 같은 계열(p1/p2 두 점)로 두고, 코일 수·진폭·양끝 직선부를 필드로 쥔다.
 *
 * 기하: p1 ─[고리?]─ (직선 lead) ── [코일] ── (직선 lead) ─[고리?]─ p2
 *   axis  = p1→p2 단위벡터, normal = axis를 90° 돌린 것(진폭 방향)
 *   springStyle = "helix"(감긴 코일) | "line"(실·줄 — 같은 도구에서 종류만 바꾼 것)
 *   hook = "none" | "left" | "right" | "both"  (인스펙터 버튼 한 개로 순환)
 *
 * 좌표계: 세계 mm. 다른 p1/p2 타입(line/circuit/pendulum)과 같은 이동·회전 경로를 탄다.
 */

import { SVG_NS, grayHex, applyDash } from "./core.js?v=1.3.0";
import { withLineLabel } from "./labels.js?v=1.3.0";

export const SPRING_DEFAULTS = {
  turns: 14,         // 감은 수 (코일 바퀴 수)
  radius: 2,         // 코일 반지름(mm) — 나선의 굵기
  leadLength: 2,     // 양끝 직선부 길이(mm) — 물체·고리에 닿는 부분
  springStyle: "helix",
};

/* 시선 기울기(반지름 대비). 고리가 얼마나 옆에서 본 것처럼 겹쳐 보이는지를 정한다.
 * 2026-07-26 교사 확인으로 0.3 확정 — 인스펙터에는 노출하지 않는다(값 하나로 인상이 확 바뀌어
 * 그림마다 달라지면 오히려 통일감이 깨진다). 옛 파일의 tilt 값이 있으면 그건 존중한다. */
export const SPRING_TILT = 0.3;

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
  const tilt = Math.max(0, obj.tilt ?? SPRING_TILT);

  // 몸통은 p1~p2 전체다. (연결부(고리)는 2026-07-26 교사 판단으로 빼 두었다 —
  // 원하는 형태가 따로 있어 나중에 그 모양으로 추가한다.)
  const s = p1, e = p2;
  const bodyLen = L;

  // 양끝 직선부는 몸통 길이의 40%를 넘지 않게 — 짧게 압축해도 코일이 사라지지 않는다.
  const lead = Math.max(0, Math.min(obj.leadLength ?? SPRING_DEFAULTS.leadLength, bodyLen * 0.4));
  const coilLen = Math.max(0, bodyLen - lead * 2);
  const a = { x: s.x + ax * lead, y: s.y + ay * lead };      // 코일 구간 시작
  const b = { x: e.x - ax * lead, y: e.y - ay * lead };      // 코일 구간 끝
  return { p1, p2, s, e, a, b, L, bodyLen, coilLen, ax, ay, nx, ny, turns, radius, tilt, lead,
           coils: turns, amp: radius };   // coils/amp = 옛 이름 별칭
}

const HELIX_SAMPLES_PER_TURN = 64;   // 반지름 2mm에서 현 오차 ≈0.003mm — 인쇄에서 보이지 않는다

/* 코일 경로(d) — 실제로 감긴 나선을 '살짝 비스듬히' 본 투영.
 *   축 방향 : c·θ + k·cosθ      (k = tilt × R)
 *   가로 방향: R·sinθ
 * cos 항이 축 방향을 앞뒤로 흔들어 고리가 서로 겹치고 교차한다 — 평면 사인 곡선과 달리
 * '감겨 있다'는 인상이 나오는 이유다. 교차 조건은 k > c 하나뿐이다.
 *
 * ※ 옛 구현은 k ≤ pitch×0.20 으로 묶어 두어 아무리 촘촘히 감아도 납작했다(2026-07-26 지적).
 *   상한을 없애는 대신 코일이 양 끝 밖으로 새지 않도록 두 가지를 쓴다:
 *   ① 반 바퀴를 더 돈다(총 turns + 0.5 바퀴). 그러면 t는 중심대칭, s는 좌우대칭이 되어
 *      곡선 전체가 좌우 대칭이고 양쪽 직선부 길이가 정확히 같아진다.
 *      (t(θ)+t(θe−θ)=c·θe, s(θe−θ)=s(θ) — θe=2πN+π 일 때만 성립)
 *   ② 축 방향 t의 실제 최소·최대를 재서 [0, coilLen]에 어파인 정규화한다.
 *      덕분에 감은 수·반지름·tilt를 어떻게 줘도 코일은 항상 코일 구간 안에 딱 맞는다.
 * 반환: 경로 d와 곡선의 실제 양 끝점(직선부를 여기에 이어 붙인다).
 */
function coilPath(geo) {
  const { a, ax, ay, nx, ny, coilLen, turns, radius, tilt } = geo;
  if (coilLen <= 0) return null;
  const at = (t, s) => ({ x: a.x + ax * t + nx * s, y: a.y + ay * t + ny * s });

  const total = 2 * Math.PI * turns + Math.PI;    // turns + 0.5 바퀴
  const k = tilt * radius;
  const c = coilLen / total;
  const steps = Math.max(48, Math.round(turns * HELIX_SAMPLES_PER_TURN));

  const raw = [];
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i <= steps; i++) {
    const th = total * (i / steps);
    const t = c * th + k * Math.cos(th);
    raw.push([t, radius * Math.sin(th)]);
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  const sc = hi > lo ? coilLen / (hi - lo) : 1;

  let d = "";
  let first = null, last = null;
  raw.forEach(([t, s], i) => {
    const p = at((t - lo) * sc, s);
    if (i === 0) first = p;
    last = p;
    d += (i === 0 ? "M " : " L ") + `${p.x.toFixed(3)} ${p.y.toFixed(3)}`;
  });
  return { d, first, last };
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

  const mkPath = (d, dashed) => {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", color);
    path.setAttribute("stroke-width", sw);
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    if (dashed) applyDash(path, obj);
    return path;
  };

  // 종류 "line"(실·줄): 몸통을 직선 하나로. 끝점 스냅은 그대로 쓴다.
  if ((obj.springStyle || SPRING_DEFAULTS.springStyle) === "line") {
    const ln = mkLine(geo.s, geo.e);
    applyDash(ln, obj);
    g.appendChild(ln);
    return withLineLabel(g, obj);
  }

  const coil = coilPath(geo);
  // 직선부는 코일의 '실제' 끝점에 이어 붙인다(정규화 때문에 몇 mm 안쪽에서 시작한다).
  const cs = coil ? coil.first : geo.e;
  const ce = coil ? coil.last : geo.e;
  const l1 = mkLine(geo.s, cs); applyDash(l1, obj); g.appendChild(l1);
  const l2 = mkLine(ce, geo.e); applyDash(l2, obj); g.appendChild(l2);
  if (coil) g.appendChild(mkPath(coil.d, true));

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
