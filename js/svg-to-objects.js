/* ===== SVG → 5E 편집 객체 변환 =====
 *
 * 왜 필요한가:
 *   부품 라이브러리는 그림을 `svgAsset`(= <image> 한 장)으로 넣는다. 그러면 자르기
 *   도구(가위)가 안 먹는다 — cut-geometry.js 의 isCuttable() 이
 *   line/polyline/curve/ellipse/rect/triangle 만 받기 때문이다. "잘라서 필요 없는
 *   부분을 날리고 싶다"는 요구를 채우려면 그림을 **진짜 5E 객체 여러 개**로 바꿔
 *   넣는 경로가 필요하다. 기출 라이브러리의 [객체로 변환]과 같은 갈래.
 *
 * 왜 래스터 객체화(image-vectorize.js Otsu+윤곽추적)를 안 쓰는가:
 *   원본이 이미 벡터다. SVG 경로를 그대로 옮기면 정밀도 손실이 0인데, 래스터로
 *   구웠다 되돌리면 계단·두께 뭉개짐이 남는다.
 *
 * 브라우저 전용:
 *   getCTM()/getTotalLength()/getPointAtLength() 는 요소가 문서에 붙어 있어야
 *   동작한다. 그래서 화면 밖 임시 컨테이너에 붙였다 try/finally 로 반드시 뗀다
 *   (lineart.js 와 같은 방식).
 *
 * 좌표계:
 *   임시 svg 에 width/height 를 viewBox 의 w/h 와 똑같이 박아 두면 뷰포트 스케일이
 *   1 이 되고, getCTM() 결과가 곧 [0..W]x[0..H] 의 viewBox 좌표가 된다. 여기에
 *   mmPerUnit = widthMm / W 를 곱하고 opts.x, opts.y 를 더하면 최종 mm 좌표다.
 *
 * 필드 목록은 image-objectify.js 삽입부(v1.3.0, 780~930행)를 본보기로 그대로 따랐다.
 */

import { applyNewObjectStyleDefaults } from "./style-mode.js?v=1.3.0";
import { simplifyRDP } from "./geometry.js?v=1.3.0";

/* ===== 상수 ===== */

// lineart.js 의 DRAW 와 같은 목록 — "그리는 요소"의 정본.
const DRAW = "path,circle,ellipse,rect,polygon,polyline,line";

// 이 안에 든 요소는 그 자리에 그려지지 않는다(정의·마스크·기호). 제외한다.
const NON_RENDER_ANCESTORS = new Set([
  "defs", "clippath", "mask", "symbol", "marker", "pattern",
]);

// 표본 간격·단순화 허용오차 — 곡선이 다각형으로 보이지 않을 만큼 촘촘해야 한다.
// 처음 0.4 / 0.12 로 뒀더니 지름 20mm 원이 20각형이 돼 눈에 띄게 각졌다(2026-08-01 사용자 지적).
// 원의 새그타 s ≈ rθ²/8 이므로 허용오차 e 에서 분할 수 θ=√(8e/r) — e=0.03mm, r=10mm 면 약 40분할이라
// 0.35mm 선 굵기 아래로 들어가 각이 안 보인다.
const SAMPLE_MM = 0.25;     // 표본 간격(결과 mm 기준)
const MAX_POINTS = 20000;   // 전체 점 예산 — 넘으면 간격을 자동으로 늘린다
const MAX_PER_PATH = 4000;  // 경로 하나가 예산을 다 먹지 않게
const ELLIPSE_SEGS = 64;    // 회전 섞인 원/타원을 폴리라인으로 떨굴 때의 분할 수
const ROT_EPS = 1e-6;       // 행렬에 회전/기울임이 섞였는지 판정
const MIN_MM = 1e-4;        // 이보다 짧은 것은 길이 0으로 본다

let idCounter = 0;

/* ===== 작은 유틸 ===== */

function round3(v) { return Math.round(v * 1000) / 1000; }

// 행렬에 회전·기울임이 섞였나. 섞이면 상자(ellipse/rect)로는 정확히 못 옮긴다.
function hasRotation(m) {
  const scale = Math.max(1, Math.hypot(m.a, m.d));
  return Math.hypot(m.b, m.c) > ROT_EPS * scale;
}

// 행렬의 등가 선형 배율(면적 제곱근) — 표본 간격을 요소 로컬 단위로 되돌릴 때 쓴다.
function matrixScale(m) {
  const det = Math.abs(m.a * m.d - m.b * m.c);
  const s = Math.sqrt(det);
  return s > 1e-9 ? s : Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d), 1e-9);
}

// 조상 중에 그려지지 않는 컨테이너가 있나(<defs> 안 등).
function inNonRendered(el, root) {
  for (let p = el.parentNode; p && p !== root; p = p.parentNode) {
    if (p.localName && NON_RENDER_ANCESTORS.has(p.localName.toLowerCase())) return true;
  }
  return false;
}

// 채우기 판정: 원본 요소의 fill 이 none 인가. 속성 → 인라인 style → 계산값 순.
function fillIsNone(el) {
  const attr = (el.getAttribute("fill") || "").trim().toLowerCase();
  if (attr) return attr === "none" || attr === "transparent";
  const inline = (el.style && el.style.fill || "").trim().toLowerCase();
  if (inline) return inline === "none" || inline === "transparent";
  try {
    const cs = getComputedStyle(el).fill;
    if (cs) {
      const v = cs.trim().toLowerCase();
      if (v === "none" || v === "transparent" || v === "rgba(0, 0, 0, 0)") return true;
    }
  } catch (e) { /* 계산값을 못 얻으면 채움으로 본다 */ }
  return false;
}

/* ===== 공통 필드 =====
 * image-objectify.js 삽입부와 같은 필드 집합. 하나라도 빠지면 인스펙터/저장에서
 * undefined 가 새어 나오므로 여기서 한 번에 채운다. */
function commonFields(ctx, kind) {
  return {
    id: `obj_${ctx.stamp}_svg${++idCounter}_${kind}`,
    groupId: ctx.groupId,
    rotation: 0,
    strokeLevel: 0,
    strokeWidth: ctx.strokeWidth,
    dashLength: 0, dashGap: 0,
    locked: false, positionLocked: false,
    layerId: ctx.layerId,
  };
}

function makePolyline(ctx, points, closed, noFill) {
  return applyNewObjectStyleDefaults({
    ...commonFields(ctx, "poly"),
    type: "polyline",
    points,
    arrowHead: "none",
    closed: !!closed,
    fillLevel: 255,
    fillNone: !!noFill || !closed,
    fillStyle: "solid",
    rounded: false, cornerRadius: 10,
    order: ctx.startOrder + ctx.objects.length,
  });
}

function makeLine(ctx, p1, p2) {
  return applyNewObjectStyleDefaults({
    ...commonFields(ctx, "line"),
    type: "line",
    p1, p2,
    lineMode: "solid", lineStyle: "solid",
    arrowVariant: "right", dimensionVariant: "basic",
    arrowHead: "none",
    order: ctx.startOrder + ctx.objects.length,
  });
}

function makeEllipse(ctx, x, y, w, h, noFill) {
  return applyNewObjectStyleDefaults({
    ...commonFields(ctx, "el"),
    type: "ellipse",
    x: round3(x), y: round3(y), w: round3(w), h: round3(h),
    fillLevel: 255, fillNone: !!noFill, fillStyle: "solid",
    labelType: "quantity",
    order: ctx.startOrder + ctx.objects.length,
  });
}

function makeRect(ctx, x, y, w, h, noFill) {
  return applyNewObjectStyleDefaults({
    ...commonFields(ctx, "rect"),
    type: "rect",
    x: round3(x), y: round3(y), w: round3(w), h: round3(h),
    fillLevel: 255, fillNone: !!noFill, fillStyle: "solid",
    labelType: "label",
    order: ctx.startOrder + ctx.objects.length,
  });
}

/* ===== 점 다루기 ===== */

// 점렬의 총 길이(mm). 길이 0짜리(제자리 점)를 걸러내는 데 쓴다.
function polyLength(pts) {
  let sum = 0;
  for (let i = 1; i < pts.length; i++) sum += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return sum;
}

// 연속 중복점 제거 + RDP. closed 면 마지막 중복점을 떨군다.
function cleanPoints(pts, eps, closed) {
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 1e-6 && Math.abs(last.y - p.y) < 1e-6) continue;
    out.push(p);
  }
  if (out.length < 2) return out;
  let simplified = eps > 0 ? simplifyRDP(out, eps) : out;
  if (closed && simplified.length > 2) {
    const a = simplified[0], b = simplified[simplified.length - 1];
    if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) simplified = simplified.slice(0, -1);
  }
  return simplified.map((p) => ({ x: round3(p.x), y: round3(p.y) }));
}

/* ===== 요소별 수집 =====
 * 1차: 무엇을 어떻게 옮길지와 "표본이 얼마나 필요한지"만 계산한다(점 예산 산정).
 * 2차: 확정된 간격으로 실제 표본을 뜬다. 두 번 도는 이유는, 400개 넘는 요소에서
 *      먼저 다 떠 놓고 줄이면 메모리·시간이 두 배로 들기 때문이다. */

// path 의 d 가 z/Z 로 끝나는가.
function pathDeclaresClosed(el) {
  const d = (el.getAttribute("d") || "").trim();
  return /[zZ]\s*$/.test(d);
}

function collect(svg) {
  const items = [];
  for (const el of svg.querySelectorAll(DRAW)) {
    if (inNonRendered(el, svg)) continue;
    let m = null;
    try { m = el.getCTM(); } catch (e) { m = null; }
    if (!m) continue;
    items.push({ el, m, tag: el.localName.toLowerCase(), noFill: fillIsNone(el) });
  }
  return items;
}

/* ===== 본체 =====
 * svgText : 선화 SVG 문자열 (lineart.js 산출물)
 * opts    : { x, y, widthMm, strokeWidth = 0.35, epsilonMm = 0.03, layerId, startOrder }
 * 반환    : { objects, w, h, count, groupId, reduced } · 실패 시 null
 */
export function svgToObjects(svgText, opts = {}) {
  if (typeof svgText !== "string" || !svgText.trim()) return null;

  const o = opts || {};
  const originX = Number(o.x) || 0;
  const originY = Number(o.y) || 0;
  const widthMm = Number(o.widthMm) > 0 ? Number(o.widthMm) : 45;
  const strokeWidth = Number(o.strokeWidth) > 0 ? Number(o.strokeWidth) : 0.35;
  const epsilonMm = Number(o.epsilonMm) >= 0 ? Number(o.epsilonMm) : 0.03;
  const layerId = o.layerId !== undefined ? o.layerId : null;
  const startOrder = Number.isFinite(Number(o.startOrder)) ? Number(o.startOrder) : 0;

  let host = null;
  try {
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    if (doc.querySelector("parsererror")) return null;
    const rootEl = doc.documentElement;
    if (!rootEl || rootEl.localName !== "svg") return null;

    const svg = document.importNode(rootEl, true);

    /* viewBox 확보 — 없으면 width/height 에서 만든다(lineart.js 와 같은 함정 대응). */
    let vb = (svg.getAttribute("viewBox") || "")
      .trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (vb.length !== 4 || !(vb[2] > 0) || !(vb[3] > 0) || vb.some((n) => !isFinite(n))) {
      const num = (v) => parseFloat(String(v || "").replace(/[^\d.\-]/g, ""));
      const w = num(rootEl.getAttribute("width"));
      const h = num(rootEl.getAttribute("height"));
      if (!(w > 0) || !(h > 0)) return null;
      vb = [0, 0, w, h];
      svg.setAttribute("viewBox", vb.join(" "));
    }
    const W = vb[2], H = vb[3];

    /* 뷰포트 배율을 1로 못박아 getCTM() 결과가 곧 viewBox 좌표가 되게 한다. */
    svg.setAttribute("width", String(W));
    svg.setAttribute("height", String(H));
    svg.setAttribute("preserveAspectRatio", "none");

    host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText =
      "position:absolute;left:-99999px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none";
    host.appendChild(svg);
    document.body.appendChild(host);

    const mmPerUnit = widthMm / W;
    const heightMm = H * mmPerUnit;
    // viewBox 좌표(0..W) → 최종 mm
    const X = (v) => originX + v * mmPerUnit;
    const Y = (v) => originY + v * mmPerUnit;
    const pt = (m, x, y) => {
      const p = new DOMPoint(x, y).matrixTransform(m);
      return { x: X(p.x), y: Y(p.y) };
    };

    const items = collect(svg);
    if (!items.length) return null;

    /* --- 1차: 점 예산 산정 ---
     * path 만 표본을 뜬다. 회전이 섞인 원/사각도 폴리라인으로 떨어지지만 점 수가
     * 고정(64 / 4)이라 예산에 미치는 영향이 작다 — 여기서는 path 길이만 센다. */
    let totalPathMm = 0;
    for (const it of items) {
      if (it.tag !== "path" || typeof it.el.getTotalLength !== "function") continue;
      let len = 0;
      try { len = it.el.getTotalLength(); } catch (e) { len = 0; }
      it.localLen = len;
      it.mmScale = matrixScale(it.m) * mmPerUnit;
      it.lenMm = len * it.mmScale;
      totalPathMm += it.lenMm;
    }
    let sampleMm = SAMPLE_MM;
    let reduced = false;
    if (totalPathMm / SAMPLE_MM > MAX_POINTS) {
      sampleMm = totalPathMm / MAX_POINTS;
      reduced = true;
    }

    /* --- 2차: 실제 변환 --- */
    const ctx = {
      stamp: Date.now().toString(36),
      groupId: `grp_svg_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
      strokeWidth, layerId, startOrder,
      objects: [],
    };
    const push = (obj, pointCount) => {
      ctx.objects.push(obj);
      ctx.points = (ctx.points || 0) + (pointCount || 0);
    };

    for (const it of items) {
      const { el, m, tag, noFill } = it;
      const rotated = hasRotation(m);

      if (tag === "path") {
        if (!(it.localLen > 0)) continue;
        const stepLocal = Math.max(sampleMm / (it.mmScale || 1e-9), it.localLen / MAX_PER_PATH);
        const n = Math.max(1, Math.min(MAX_PER_PATH, Math.ceil(it.localLen / stepLocal)));
        const raw = [];
        for (let i = 0; i <= n; i++) {
          const d = (it.localLen * i) / n;
          let p;
          try { p = el.getPointAtLength(d); } catch (e) { p = null; }
          if (!p) continue;
          raw.push(pt(m, p.x, p.y));
        }
        if (raw.length < 2) continue;
        const first = raw[0], last = raw[raw.length - 1];
        const closed = pathDeclaresClosed(el) ||
          Math.hypot(first.x - last.x, first.y - last.y) < Math.max(sampleMm, 0.05);
        const pts = cleanPoints(raw, epsilonMm, closed);
        if (pts.length < 2 || polyLength(pts) < MIN_MM) continue;
        push(makePolyline(ctx, pts, closed, noFill), pts.length);
        continue;
      }

      if (tag === "polyline" || tag === "polygon") {
        const list = el.points;
        const raw = [];
        for (let i = 0; i < list.numberOfItems; i++) {
          const p = list.getItem(i);
          raw.push(pt(m, p.x, p.y));
        }
        const closed = tag === "polygon";
        const pts = cleanPoints(raw, epsilonMm, closed);
        if (pts.length < 2 || polyLength(pts) < MIN_MM) continue;
        push(makePolyline(ctx, pts, closed, noFill), pts.length);
        continue;
      }

      if (tag === "line") {
        const p1 = pt(m, el.x1.baseVal.value, el.y1.baseVal.value);
        const p2 = pt(m, el.x2.baseVal.value, el.y2.baseVal.value);
        if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < MIN_MM) continue;
        push(makeLine(ctx,
          { x: round3(p1.x), y: round3(p1.y) },
          { x: round3(p2.x), y: round3(p2.y) }), 2);
        continue;
      }

      if (tag === "circle" || tag === "ellipse") {
        const cx = el.cx.baseVal.value;
        const cy = el.cy.baseVal.value;
        const rx = tag === "circle" ? el.r.baseVal.value : el.rx.baseVal.value;
        const ry = tag === "circle" ? el.r.baseVal.value : el.ry.baseVal.value;
        if (!(rx > 0) || !(ry > 0)) continue;
        if (rotated) {
          // 회전이 섞이면 축평행 상자로는 타원을 정확히 못 담는다 → 폴리라인 표본.
          const raw = [];
          for (let i = 0; i < ELLIPSE_SEGS; i++) {
            const t = (i / ELLIPSE_SEGS) * Math.PI * 2;
            raw.push(pt(m, cx + rx * Math.cos(t), cy + ry * Math.sin(t)));
          }
          const pts = cleanPoints(raw, epsilonMm, true);
          if (pts.length < 3) continue;
          push(makePolyline(ctx, pts, true, noFill), pts.length);
          continue;
        }
        const c = pt(m, cx, cy);
        const w = Math.abs(m.a) * rx * 2 * mmPerUnit;
        const h = Math.abs(m.d) * ry * 2 * mmPerUnit;
        if (w < MIN_MM || h < MIN_MM) continue;
        push(makeEllipse(ctx, c.x - w / 2, c.y - h / 2, w, h, noFill), 0);
        continue;
      }

      if (tag === "rect") {
        const rx0 = el.x.baseVal.value, ry0 = el.y.baseVal.value;
        const rw = el.width.baseVal.value, rh = el.height.baseVal.value;
        if (!(rw > 0) || !(rh > 0)) continue;
        if (rotated) {
          const corners = [[rx0, ry0], [rx0 + rw, ry0], [rx0 + rw, ry0 + rh], [rx0, ry0 + rh]]
            .map(([px, py]) => pt(m, px, py));
          const pts = cleanPoints(corners, 0, true);
          if (pts.length < 3) continue;
          push(makePolyline(ctx, pts, true, noFill), pts.length);
          continue;
        }
        const a = pt(m, rx0, ry0);
        const b = pt(m, rx0 + rw, ry0 + rh);
        const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
        if (w < MIN_MM || h < MIN_MM) continue;
        push(makeRect(ctx, x, y, w, h, noFill), 0);
        continue;
      }
    }

    if (!ctx.objects.length) return null;

    return {
      objects: ctx.objects,
      w: round3(widthMm),
      h: round3(heightMm),
      count: ctx.objects.length,
      pointCount: ctx.points || 0,
      groupId: ctx.groupId,
      reduced,
    };
  } catch (e) {
    return null;
  } finally {
    if (host && host.parentNode) host.parentNode.removeChild(host);
  }
}
