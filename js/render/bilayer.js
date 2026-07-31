/* ===== RENDER/BILAYER: 인지질 이중층 — p1→p2 파라미터 객체 =====
 *
 * 생명 기출의 세포막 모식도. p1→p2 가 막의 **중심선**이고, 그 위아래로 thickness/2 씩
 * 떨어진 두 줄에 머리(원)가 늘어선다. 꼬리는 머리에서 막 안쪽(중심선 쪽)으로 뻗는
 * 짧은 곡선 2개다.
 *
 * 왜 파라미터 객체인가: 용수철(spring.js)과 같은 이유다. 막의 길이·기울기가 문항마다
 * 다르고, 고정 에셋을 늘이면 인지질이 함께 늘어나 어색해진다. 그래서 유닛(머리+꼬리)을
 * 축 방향으로 **균등 반복**하는 방식으로 둔다 — 용수철 코일과 구조가 같다.
 *
 * 스키마(docs/BIO_PARTS_SPEC.md §3 정본)
 *   p1, p2       막의 왼쪽 끝 · 오른쪽 끝 (중심선)
 *   unitCount    인지질 개수(한 층당). 균등 배치
 *   thickness    막 두께(mm) — 위층 머리 중심 ~ 아래층 머리 중심
 *   headRadius   머리 원 반지름(mm)
 *   proteins[]   { at: 0~1, width: mm } — 그 구간의 인지질 유닛은 자리를 비운다
 *   labelOuter / labelInner   막 바깥·안쪽 글자(빈 문자열이면 안 그림)
 *
 * 축·법선: axis = p1→p2 단위벡터, n = axis를 90° 돌린 것. 유닛은 항상 n 방향으로
 * 서므로 막이 기울어져도 인지질이 축에 **수직**으로 선다.
 * 바깥(outer)은 -n 쪽으로 잡는다 — 수평(왼→오른쪽) 막에서 화면 위가 바깥이 된다.
 */

import { SVG_NS, grayHex } from "./core.js?v=1.4.0";
import { makeUprightLabel } from "./labels.js?v=1.4.0";
import { DEFAULT_TEXT_SIZE_MM } from "../state.js?v=1.4.0";

export const BILAYER_DEFAULTS = {
  unitCount: 14,
  thickness: 7,
  headRadius: 1.05,
  proteinWidth: 6,
};

const PROTEIN_CLEARANCE = 1;    // 명세 §3: 단백질 구간은 (width/2 + 1mm)까지 자리를 비운다
const PROTEIN_OVERHANG = 1.4;   // 명세 §3: 막보다 위아래로 1.4mm 삐져나온다
const LABEL_GAP = 2.6;          // 라벨을 단백질 끝보다 조금 더 바깥에

/* 단백질 목록 정규화 — 잘못된 항목은 버리고 at 을 0~1 로 조인다. */
export function bilayerProteins(obj) {
  const arr = Array.isArray(obj.proteins) ? obj.proteins : [];
  const out = [];
  for (const p of arr) {
    if (!p) continue;
    const at = Number(p.at);
    const width = Number(p.width);
    if (!Number.isFinite(at)) continue;
    out.push({
      at: Math.min(1, Math.max(0, at)),
      width: Number.isFinite(width) && width > 0 ? width : BILAYER_DEFAULTS.proteinWidth,
    });
  }
  return out;
}

/* ----- 기하 계산: 렌더·픽·bbox가 모두 이 함수를 쓴다(단일 출처) ----- */
export function bilayerGeometry(obj) {
  const p1 = obj.p1 || { x: 0, y: 0 };
  const p2 = obj.p2 || { x: 0, y: 0 };
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const L = Math.hypot(dx, dy);
  const ax = L > 0 ? dx / L : 1, ay = L > 0 ? dy / L : 0;   // 축 단위벡터
  const nx = -ay, ny = ax;                                   // 법선(막 두께 방향)

  const unitCount = Math.max(2, Math.round(obj.unitCount ?? BILAYER_DEFAULTS.unitCount));
  const thickness = Math.max(0.4, obj.thickness ?? BILAYER_DEFAULTS.thickness);
  const headRadius = Math.max(0.1, obj.headRadius ?? BILAYER_DEFAULTS.headRadius);
  const half = thickness / 2;

  // 축 위 점 (u = p1 에서 잰 거리, mm)
  const at = (u, s) => ({ x: p1.x + ax * u + nx * s, y: p1.y + ay * u + ny * s });

  // 단백질: 축 위 구간으로 환산해 둔다(자리 비우기·렌더가 같은 값을 쓴다).
  const proteins = bilayerProteins(obj).map((p) => {
    const u = p.at * L;
    const hw = p.width / 2;
    return {
      at: p.at, width: p.width, u, hw,
      blockHalf: hw + PROTEIN_CLEARANCE,   // 이 반경 안의 유닛은 건너뛴다
      center: at(u, 0),
    };
  });

  // 인지질 유닛: 축 방향 균등 배치. 단백질 구간에 걸리면 건너뛴다(자리를 비운다).
  const spacing = unitCount > 1 ? L / (unitCount - 1) : 0;
  const units = [];
  for (let i = 0; i < unitCount; i += 1) {
    const u = spacing * i;
    let blocked = false;
    for (const pr of proteins) {
      if (Math.abs(u - pr.u) <= pr.blockHalf) { blocked = true; break; }
    }
    if (blocked) continue;
    // side = -1(바깥층) · +1(안쪽층). 두 층 모두 같은 자리에서 비워진다.
    units.push({ u, side: -1, head: at(u, -half) });
    units.push({ u, side: +1, head: at(u, +half) });
  }

  const outerEdge = half + headRadius;                       // 머리 원의 바깥 끝
  const proteinHalf = outerEdge + PROTEIN_OVERHANG;          // 단백질 반높이
  return {
    p1, p2, L, ax, ay, nx, ny, at,
    unitCount, thickness, headRadius, half, spacing,
    units, proteins, outerEdge, proteinHalf,
    mid: at(L / 2, 0),
  };
}

/* 꼬리 2개 — 머리에서 막 안쪽(중심선 쪽)으로 뻗는 짧은 곡선.
 * inward = -side·n. 두 갈래를 축 방향으로 조금 벌려 놓고 살짝 휘게 한다. */
function tailPaths(geo, unit) {
  const { ax, ay, nx, ny, half, headRadius } = geo;
  const iw = -unit.side;                                     // inward 부호(법선 기준)
  const ix = nx * iw, iy = ny * iw;
  const len = Math.max(headRadius * 0.9, half - headRadius * 1.15);
  const start0 = { x: unit.head.x + ix * headRadius * 0.75, y: unit.head.y + iy * headRadius * 0.75 };
  const out = [];
  for (const k of [-1, 1]) {
    const sx = start0.x + ax * (k * headRadius * 0.34), sy = start0.y + ay * (k * headRadius * 0.34);
    const cx = sx + ix * len * 0.55 + ax * (k * headRadius * 0.62);
    const cy = sy + iy * len * 0.55 + ay * (k * headRadius * 0.62);
    const ex = sx + ix * len + ax * (k * headRadius * 0.18);
    const ey = sy + iy * len + ay * (k * headRadius * 0.18);
    out.push(`M ${sx.toFixed(3)} ${sy.toFixed(3)} Q ${cx.toFixed(3)} ${cy.toFixed(3)} ${ex.toFixed(3)} ${ey.toFixed(3)}`);
  }
  return out;
}

export function renderBilayer(obj) {
  const stroke = grayHex(obj.strokeLevel ?? 0);
  const sw = obj.strokeWidth ?? 0.35;
  const geo = bilayerGeometry(obj);
  const g = document.createElementNS(SVG_NS, "g");

  // 1) 꼬리 먼저(머리 흰 채움이 꼬리 뿌리를 덮게 한다)
  for (const unit of geo.units) {
    for (const d of tailPaths(geo, unit)) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", stroke);
      path.setAttribute("stroke-width", sw * 0.8);   // 명세 §3: 꼬리는 본선의 0.8배
      path.setAttribute("stroke-linecap", "round");
      g.appendChild(path);
    }
  }

  // 2) 머리 — 흰 채움 원
  for (const unit of geo.units) {
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", unit.head.x);
    c.setAttribute("cy", unit.head.y);
    c.setAttribute("r", geo.headRadius);
    c.setAttribute("fill", "white");
    c.setAttribute("stroke", stroke);
    c.setAttribute("stroke-width", sw);
    g.appendChild(c);
  }

  // 3) 막단백질 — 회색 둥근 사각형. 축에 맞춰 회전한다.
  const angDeg = (Math.atan2(geo.ay, geo.ax) * 180) / Math.PI;
  for (const pr of geo.proteins) {
    const r = document.createElementNS(SVG_NS, "rect");
    r.setAttribute("x", -pr.hw);
    r.setAttribute("y", -geo.proteinHalf);
    r.setAttribute("width", pr.width);
    r.setAttribute("height", geo.proteinHalf * 2);
    r.setAttribute("rx", pr.width * 0.34);
    r.setAttribute("ry", pr.width * 0.34);
    r.setAttribute("fill", "#d9d9d9");
    r.setAttribute("stroke", stroke);
    r.setAttribute("stroke-width", sw);
    r.setAttribute("transform", `translate(${pr.center.x} ${pr.center.y}) rotate(${angDeg})`);
    g.appendChild(r);
  }

  // 4) 바깥·안쪽 라벨 — 기울기와 무관하게 가로로 쓴다(기출 관례).
  const size = DEFAULT_TEXT_SIZE_MM;
  const labelOff = geo.proteinHalf + LABEL_GAP + size * 0.5;
  const pairs = [
    [obj.labelOuter, -1],
    [obj.labelInner, +1],
  ];
  for (const [text, side] of pairs) {
    const s = String(text ?? "").trim();
    if (!s) continue;
    const x = geo.mid.x + geo.nx * side * labelOff;
    const y = geo.mid.y + geo.ny * side * labelOff;
    const t = makeUprightLabel(s, x, y, stroke, size, { labelType: "label" });
    if (t) g.appendChild(t);
  }

  if (obj.opacity != null && obj.opacity !== 1) g.setAttribute("opacity", obj.opacity);
  if (obj.id) g.dataset.id = obj.id;
  return g;
}

export function bilayerBBox(obj) {
  const geo = bilayerGeometry(obj);
  const sw = obj.strokeWidth ?? 0.35;
  const pts = [];
  const push = (p) => { if (p && isFinite(p.x) && isFinite(p.y)) pts.push(p); };

  // 막 몸통 네 모서리 — 단백질이 없어도 머리 원 끝까지는 잡는다.
  const bodyHalf = geo.proteins.length ? geo.proteinHalf : geo.outerEdge;
  for (const u of [0, geo.L]) {
    for (const s of [-bodyHalf, bodyHalf]) push(geo.at(u, s));
  }
  // 머리 원은 축 밖으로 headRadius 만큼 더 나간다.
  for (const unit of geo.units) {
    push({ x: unit.head.x - geo.headRadius, y: unit.head.y - geo.headRadius });
    push({ x: unit.head.x + geo.headRadius, y: unit.head.y + geo.headRadius });
  }
  // 단백질은 축 방향으로도 폭의 절반만큼 나갈 수 있다.
  for (const pr of geo.proteins) {
    for (const du of [-pr.hw, pr.hw]) {
      for (const s of [-geo.proteinHalf, geo.proteinHalf]) push(geo.at(pr.u + du, s));
    }
  }
  if (!pts.length) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const pad = sw;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}
