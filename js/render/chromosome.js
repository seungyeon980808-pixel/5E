/* ===== RENDER/CHROMOSOME: 염색체 (생명) =====
 *
 * 명세: docs/BIO_PARTS_SPEC.md §2.
 *
 * **X자가 아니다.** 기출(생명과학)의 염색체는 모서리가 둥근 막대(캡슐) 두 개가 나란히
 * 붙어 있는 모양이고, 동원체는 두 캡슐 **각각의 같은 높이**에 찍힌 작은 검은 점이다.
 * 허리가 잘록해지는 선도, 두 갈래가 교차하는 선도 없다.
 *
 * ── 좌표 ───────────────────────────────────────────────────────────
 *   p1 = 위 끝, p2 = 아래 끝. 이 둘이 길이와 기울기를 모두 정한다.
 *   국소 좌표 (lx, ly) 를 쓴다:
 *     ly = 축 방향(-len/2 = p1 쪽, +len/2 = p2 쪽)
 *     lx = 축의 법선 방향(캡슐 두 개가 갈라지는 방향, 상동쌍도 이 방향으로 벌어진다)
 *   국소→화면 변환은 chromosomeGeometry().toWorld() 하나뿐이고, 렌더·픽·bbox가 전부
 *   이걸 쓴다. SVG 쪽은 같은 변환을 transform="translate(mid) rotate(angle)" 로 준다.
 *
 * ── 채우기 ─────────────────────────────────────────────────────────
 *   fillStyle 은 공용 채우기 구조(js/render/fill.js)를 그대로 쓴다. 다만 fill.js 의
 *   isFillable() 은 rect/ellipse/... 만 인정하므로(그 파일은 건드리지 않는다), 대리
 *   객체를 만들어 makeFillPattern()/resolveFill() 에 넘기고 <pattern> 은 이 객체의
 *   <g> 안 <defs> 에 넣는다. 그래서 scene.js 의 전역 defs 수집과 무관하게 동작한다.
 */

import { SVG_NS, grayHex } from "./core.js?v=1.3.0";
import { resolveFill, makeFillPattern } from "./fill.js?v=1.3.0";
import { makeUprightLabel } from "./labels.js?v=1.3.0";
import { DEFAULT_TEXT_SIZE_MM } from "../state.js?v=1.3.0";

const DEF_WIDTH  = 3;      // chromatidWidth
const DEF_GAP    = 1.6;    // chromatidGap
const DEF_CENTRO = 0.32;   // centromere (0 = p1 쪽, 1 = p2 쪽)
const DEF_PAIR_GAP = 20;   // pairGap
const LABEL_AT   = 0.66;   // 라벨 높이(0 = p1, 1 = p2) — 기출 관례
const LABEL_PAD  = 2.2;    // 캡슐 바깥 모서리에서 라벨까지(mm)
const GRAY_LEVEL = 217;    // fillStyle "gray" = #d9d9d9 (생명 부품 공용 회색)

function num(v, d) { return Number.isFinite(v) ? v : d; }

/* ----- 기하: 축·캡슐 위치. 렌더·픽·bbox 공용 ----- */
export function chromosomeGeometry(obj) {
  const p1 = obj.p1 || { x: 0, y: 0 };
  const p2 = obj.p2 || { x: p1.x, y: p1.y + 20 };
  let dx = p2.x - p1.x, dy = p2.y - p1.y;
  let len = Math.hypot(dx, dy);
  if (!(len > 0.0001)) { dx = 0; dy = 1; len = 0.0001; }   // 퇴화: 세로로 세운다
  const ux = dx / len, uy = dy / len;      // 축(p1→p2) 단위벡터 = 국소 +y
  const nx = uy, ny = -ux;                 // 법선 = 국소 +x (rotate 변환과 같은 부호)
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI - 90;

  const w = Math.max(0.2, num(obj.chromatidWidth, DEF_WIDTH));
  const gap = Math.max(0, num(obj.chromatidGap, DEF_GAP));
  const off = (gap + w) / 2;               // 캡슐 중심의 국소 x (±)
  const half = off + w / 2;                // 한 벌의 국소 x 반폭
  const dotR = Math.min(0.62, w / 3.4);
  const c = Math.max(0, Math.min(1, num(obj.centromere, DEF_CENTRO)));
  const centroY = -len / 2 + c * len;      // 동원체의 국소 y

  const pair = obj.homologPair === true;
  const pairGap = pair ? Math.max(0, num(obj.pairGap, DEF_PAIR_GAP)) : 0;
  const shifts = pair ? [0, pairGap] : [0]; // 벌마다의 국소 x 이동

  const toWorld = (lx, ly) => ({
    x: mid.x + lx * nx + ly * ux,
    y: mid.y + lx * ny + ly * uy,
  });

  return {
    p1, p2, mid, len, angleDeg, ux, uy, nx, ny,
    w, gap, off, half, dotR, centromere: c, centroY,
    pair, pairGap, shifts, toWorld,
  };
}

export function chromosomeBBox(obj) {
  const g = chromosomeGeometry(obj);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of g.shifts) {
    for (const lx of [s - g.half, s + g.half]) {
      for (const ly of [-g.len / 2, g.len / 2]) {
        const p = g.toWorld(lx, ly);
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
  }
  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/* ----- 채우기: 공용 fill.js 에 넘길 대리 객체 -----
 * "solid" = 흰(fillLevel 기본 255), "gray" = 연회색 단색,
 * "hatch"/"cross" = 공용 <pattern>. 무늬의 색은 선 색을 따른다(fillLevel 기본값 255를
 * 그대로 쓰면 흰 무늬가 되어 안 보이기 때문). */
function fillProxy(obj) {
  const style = obj.fillStyle ?? "solid";
  const id = `chr_${obj.id ?? "tmp"}`;
  if (style === "hatch" || style === "cross") {
    return { type: "rect", id, fillStyle: style, fillLevel: obj.strokeLevel ?? 0, fillTile: obj.fillTile };
  }
  if (style === "gray") return { type: "rect", id, fillStyle: "solid", fillLevel: GRAY_LEVEL };
  return { type: "rect", id, fillStyle: "solid", fillLevel: num(obj.fillLevel, 255) };
}

export function renderChromosome(obj) {
  const stroke = grayHex(obj.strokeLevel ?? 0);
  const sw = obj.strokeWidth ?? 0.35;
  const geo = chromosomeGeometry(obj);
  const g = document.createElementNS(SVG_NS, "g");

  // ----- 채우기 무늬(공용 fill.js) -----
  const proxy = fillProxy(obj);
  const fillVal = resolveFill(proxy);
  const pat = makeFillPattern(proxy);
  if (pat) {
    const defs = document.createElementNS(SVG_NS, "defs");
    defs.appendChild(pat);
    g.appendChild(defs);
  }

  // ----- 캡슐 + 동원체: 축에 맞춰 회전한 국소 좌표계에서 그린다 -----
  const rot = document.createElementNS(SVG_NS, "g");
  rot.setAttribute("transform", `translate(${geo.mid.x} ${geo.mid.y}) rotate(${geo.angleDeg})`);
  g.appendChild(rot);

  for (const shift of geo.shifts) {
    for (const sign of [-1, 1]) {
      const cx = shift + sign * geo.off;
      const r = document.createElementNS(SVG_NS, "rect");
      r.setAttribute("x", cx - geo.w / 2);
      r.setAttribute("y", -geo.len / 2);
      r.setAttribute("width", geo.w);
      r.setAttribute("height", geo.len);
      r.setAttribute("rx", geo.w / 2);
      r.setAttribute("ry", geo.w / 2);
      r.setAttribute("fill", fillVal);
      r.setAttribute("stroke", stroke);
      r.setAttribute("stroke-width", sw);
      rot.appendChild(r);
    }
    // 동원체: 두 캡슐 각각 같은 높이에 작은 점
    for (const sign of [-1, 1]) {
      const d = document.createElementNS(SVG_NS, "circle");
      d.setAttribute("cx", shift + sign * geo.off);
      d.setAttribute("cy", geo.centroY);
      d.setAttribute("r", geo.dotR);
      d.setAttribute("fill", stroke);
      rot.appendChild(d);
    }
  }

  // ----- 라벨: 기울기와 무관하게 가로로(회전 그룹 바깥에 붙인다), 이탤릭 -----
  if (obj.showLabels !== false) {
    const size = DEFAULT_TEXT_SIZE_MM;
    const ly = -geo.len / 2 + LABEL_AT * geo.len;
    const outer = geo.half + LABEL_PAD;
    const slots = [
      { shift: geo.shifts[0], text: obj.labelLeft, sign: -1 },
      { shift: geo.shifts[0], text: obj.labelRight, sign: 1 },
    ];
    if (geo.pair) {
      slots.push({ shift: geo.shifts[1], text: obj.labelLeft2, sign: -1 });
      slots.push({ shift: geo.shifts[1], text: obj.labelRight2, sign: 1 });
    }
    for (const s of slots) {
      const txt = String(s.text ?? "");
      if (!txt) continue;
      const p = geo.toWorld(s.shift + s.sign * outer, ly);
      const t = makeUprightLabel(txt, p.x, p.y, stroke, size, { labelType: "quantity" });
      if (t) g.appendChild(t);
    }
  }

  if (obj.opacity != null && obj.opacity !== 1) g.setAttribute("opacity", obj.opacity);
  if (obj.id) g.dataset.id = obj.id;
  return g;
}
