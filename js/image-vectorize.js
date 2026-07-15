/* ===== IMAGE VECTORIZE (PNG → 분리된 편집 객체 파이프라인) =====
//
// Pure algorithm module — no DOM, no store access. UI lives in
// image-objectify.js. Ported from the verified standalone demo
// (exam_figure_editor_demo.html, Claude web design session):
//
//   binarize (Otsu) → [optional grid-line removal] → dilate (grouping ONLY)
//   → connected components (8-way) → per-component boundary edge tracing
//   → collinear reduction + RDP simplification → closed loops per object.
//
// Two invariants from the demo that must not change:
//  - The dilated mask decides which ink pixels belong to one object (묶음 거리)
//    but contour tracing always runs on the ORIGINAL pre-dilate mask.
//  - Loop orientation encodes topology: with the edge directions used below,
//    positive shoelace area (screen coords, y-down) = outline, negative = hole.
//
// v0.43 (IMAGE_OBJECTIFY_QUALITY_PLAN_20260704 §2-1): 회색조 보존 — 단일 Otsu
// 흑/백 대신 다단계(최대 4클래스) 톤 분리 후 레벨별로 파이프라인을 재실행한다.
// preserveGrayLevels:false 또는 톤이 실제로 단일한 이미지는 기존 단일-Otsu
// 경로(vectorizeSingleLevel)로 정확히 폴백한다. */

import { extractStrokes } from "./image-line-extract.js?v=1.0.1";

/* ===== 1. OTSU BINARIZE ===== */
// imageData: {width, height, data(RGBA)}. Caller must have composited the
// image over a WHITE canvas first (transparent PNG safety). Returns
// { mask(ink=1), gray(Uint8Array 0~255), threshold } — gray는 다단계 톤 분리
// (computeGrayLevels)와 공유하는 반환 계약(§2-1 전제).
export function binarize(imageData) {
  const { width: w, height: h, data } = imageData;
  const gray = new Uint8Array(w * h);
  const hist = new Array(256).fill(0);
  for (let i = 0; i < w * h; i += 1) {
    const g = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) | 0;
    gray[i] = g;
    hist[g] += 1;
  }
  const total = w * h;
  let sum = 0;
  for (let t = 0; t < 256; t += 1) sum += t * hist[t];
  let sumB = 0, wB = 0, maxVar = 0, threshold = 127;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);
    if (variance > maxVar) { maxVar = variance; threshold = t; }
  }
  // `<=` (데모는 `<`): 순수 흑백 이미지는 Otsu 임계값이 0으로 수렴하는데,
  // 그때 `<`면 잉크가 한 픽셀도 안 잡힌다. 안티앨리어싱 이미지엔 영향 미미.
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) mask[i] = gray[i] <= threshold ? 1 : 0;
  return { mask, gray, threshold };
}

/* ===== 2. GRID / RULE LINE REMOVAL (그래프·도표용 옵션) ===== */
// Clears long straight thin runs (grid lines, ruled lines) while keeping the
// spots where a curve crosses them: a pixel is only cleared when the stroke is
// locally thin in the perpendicular direction. Crossing residue (tiny + dots)
// is later dropped by the min-area filter.
const GRID_MAX_THICKNESS = 3;

function perpendicularThickness(mask, w, h, x, y, dx, dy) {
  let forward = 0;
  while (forward <= GRID_MAX_THICKNESS) {
    const nx = x + dx * (forward + 1), ny = y + dy * (forward + 1);
    if (nx < 0 || nx >= w || ny < 0 || ny >= h || !mask[ny * w + nx]) break;
    forward += 1;
  }
  let backward = 0;
  while (backward <= GRID_MAX_THICKNESS) {
    const nx = x - dx * (backward + 1), ny = y - dy * (backward + 1);
    if (nx < 0 || nx >= w || ny < 0 || ny >= h || !mask[ny * w + nx]) break;
    backward += 1;
  }
  return forward + backward + 1;
}

export function removeGridLines(mask, w, h) {
  const out = mask.slice();
  const minRunH = Math.max(48, Math.round(w * 0.35));
  const minRunV = Math.max(48, Math.round(h * 0.35));

  for (let y = 0; y < h; y += 1) {
    let x = 0;
    while (x < w) {
      if (!mask[y * w + x]) { x += 1; continue; }
      let end = x;
      while (end < w && mask[y * w + end]) end += 1;
      if (end - x >= minRunH) {
        for (let xi = x; xi < end; xi += 1) {
          if (perpendicularThickness(mask, w, h, xi, y, 0, 1) <= GRID_MAX_THICKNESS) out[y * w + xi] = 0;
        }
      }
      x = end;
    }
  }
  for (let x = 0; x < w; x += 1) {
    let y = 0;
    while (y < h) {
      if (!mask[y * w + x]) { y += 1; continue; }
      let end = y;
      while (end < h && mask[end * w + x]) end += 1;
      if (end - y >= minRunV) {
        for (let yi = y; yi < end; yi += 1) {
          if (perpendicularThickness(mask, w, h, x, yi, 1, 0) <= GRID_MAX_THICKNESS) out[yi * w + x] = 0;
        }
      }
      y = end;
    }
  }
  return out;
}

/* ===== 3. DILATE (그룹 판정 전용 — 윤곽 추적에는 쓰지 말 것) ===== */
export function dilate(mask, w, h, radius) {
  if (radius <= 1) return mask.slice();
  const out = new Uint8Array(w * h);
  const reach = (radius - 1) >> 1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!mask[y * w + x]) continue;
      for (let dy = -reach; dy <= reach; dy += 1) {
        for (let dx = -reach; dx <= reach; dx += 1) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) out[ny * w + nx] = 1;
        }
      }
    }
  }
  return out;
}

/* ===== 4. CONNECTED COMPONENTS (8방향) ===== */
// Returns { labels: Int32Array(w*h), comps: [{label, bbox:[x0,y0,x1,y1], area}] }.
export function connectedComponents(mask, w, h) {
  const labels = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const comps = [];
  let next = 0;
  for (let start = 0; start < w * h; start += 1) {
    if (!mask[start] || labels[start]) continue;
    next += 1;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = next;
    let minx = w, miny = h, maxx = 0, maxy = 0, area = 0;
    while (sp > 0) {
      const p = stack[--sp];
      const px = p % w, py = (p / w) | 0;
      area += 1;
      if (px < minx) minx = px;
      if (px > maxx) maxx = px;
      if (py < miny) miny = py;
      if (py > maxy) maxy = py;
      const neighbors = [p - 1, p + 1, p - w, p + w, p - w - 1, p - w + 1, p + w - 1, p + w + 1];
      for (const q of neighbors) {
        if (q < 0 || q >= w * h) continue;
        if (Math.abs((q % w) - px) > 1) continue; // row-wrap guard
        if (mask[q] && !labels[q]) { labels[q] = next; stack[sp++] = q; }
      }
    }
    comps.push({ label: next, bbox: [minx, miny, maxx + 1, maxy + 1], area });
  }
  return { labels, comps };
}

/* ===== 5. CONTOUR TRACING (경계 엣지 → 닫힌 루프) ===== */
// Collects directed ink/background boundary edges and chains them into closed
// loops. Outer boundaries and hole boundaries both come out (opposite winding).
export function traceContours(getInk, x0, y0, x1, y1) {
  const key = (x, y) => x + "_" + y;
  const edgeMap = new Map();
  const addEdge = (ax, ay, bx, by) => {
    const k = key(ax, ay);
    let list = edgeMap.get(k);
    if (!list) { list = []; edgeMap.set(k, list); }
    list.push([bx, by]);
  };
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (!getInk(x, y)) continue;
      if (!getInk(x, y - 1)) addEdge(x, y, x + 1, y);
      if (!getInk(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
      if (!getInk(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
      if (!getInk(x - 1, y)) addEdge(x, y + 1, x, y);
    }
  }
  const loops = [];
  for (const [k, list] of edgeMap) {
    while (list.length) {
      const [sx, sy] = k.split("_").map(Number);
      const loop = [[sx, sy]];
      let [cx, cy] = list.pop();
      while (!(cx === sx && cy === sy)) {
        loop.push([cx, cy]);
        const nextList = edgeMap.get(key(cx, cy));
        if (!nextList || !nextList.length) break;
        [cx, cy] = nextList.pop();
      }
      if (loop.length > 2) loops.push(loop);
    }
  }
  return loops;
}

/* ===== 6. SIMPLIFY (collinear 축약 + RDP) ===== */
export function collinearReduce(points) {
  const out = [];
  for (let i = 0; i < points.length; i += 1) {
    const a = points[(i - 1 + points.length) % points.length];
    const b = points[i];
    const c = points[(i + 1) % points.length];
    if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) !== 0) out.push(b);
  }
  return out.length > 2 ? out : points;
}

export function rdp(points, epsilon) {
  if (points.length < 3 || epsilon <= 0) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const recurse = (s, e) => {
    let dmax = 0, idx = -1;
    const [ax, ay] = points[s], [bx, by] = points[e];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-9;
    for (let i = s + 1; i < e; i += 1) {
      const d = Math.abs(dy * points[i][0] - dx * points[i][1] + bx * ay - by * ax) / len;
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax > epsilon && idx > 0) { keep[idx] = 1; recurse(s, idx); recurse(idx, e); }
  };
  recurse(0, points.length - 1);
  return points.filter((_, i) => keep[i]);
}

// Shoelace, screen coords (y down). Positive = outline, negative = hole
// (property of the edge directions emitted in traceContours).
function signedArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/* ===== 7. MULTI-LEVEL GRAY CLASSIFICATION (§2-1) =====
//
// gray 히스토그램을 "2단 Otsu"(전체 1회 분할 + 양쪽 재분할)로 최대 4클래스로
// 나눈 뒤, 검증자가 지적한 3종 병합 규칙을 순서대로 적용해 과분할을 정리한다:
//   (a) 잉크 대비 점유율 <1%  → 스캔 노이즈 방어
//   (b) 인접 대표값 차 ΔG<24  → 그라데이션 과분할 방어
//   (c) 안티앨리어싱 헤일로   → 경계 오검출 방어
// 결과 classes는 어두운 순으로 정렬되며 마지막 원소가 배경(가장 밝음)이다. */

function otsuInRange(hist, lo, hi) {
  let total = 0;
  for (let t = lo; t <= hi; t += 1) total += hist[t];
  if (total < 2) return null;
  let sum = 0;
  for (let t = lo; t <= hi; t += 1) sum += t * hist[t];
  let sumB = 0, wB = 0, maxVar = 0, threshold = -1;
  for (let t = lo; t < hi; t += 1) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);
    if (variance > maxVar) { maxVar = variance; threshold = t; }
  }
  return threshold >= lo ? threshold : null;
}

function classFromRange(hist, lo, hi) {
  let count = 0, sum = 0;
  for (let g = lo; g <= hi; g += 1) { count += hist[g]; sum += g * hist[g]; }
  return { lo, hi, count, mean: count ? sum / count : (lo + hi) / 2 };
}

function mergeAdjacent(list, i, j) {
  const a = list[i], b = list[j];
  const lo = Math.min(a.lo, b.lo), hi = Math.max(a.hi, b.hi);
  const count = a.count + b.count;
  const mean = count ? (a.mean * a.count + b.mean * b.count) / count : (lo + hi) / 2;
  return list.slice(0, i).concat([{ lo, hi, count, mean }], list.slice(j + 1));
}

// (a) 잉크(배경 제외) 대비 점유율 1% 미만 클래스를 더 가까운 이웃에 병합.
function mergeByInkOccupancy(classes) {
  let list = classes;
  for (let iter = 0; iter < 6 && list.length > 1; iter += 1) {
    const inkTotal = list.slice(0, -1).reduce((s, c) => s + c.count, 0);
    if (!inkTotal) break;
    let mergeIdx = -1;
    for (let i = 0; i < list.length - 1; i += 1) {
      if (list[i].count / inkTotal < 0.01) { mergeIdx = i; break; }
    }
    if (mergeIdx < 0) break;
    const hasPrev = mergeIdx > 0, hasNext = mergeIdx < list.length - 1;
    let target;
    if (hasPrev && hasNext) {
      const dPrev = Math.abs(list[mergeIdx].mean - list[mergeIdx - 1].mean);
      const dNext = Math.abs(list[mergeIdx + 1].mean - list[mergeIdx].mean);
      target = dPrev <= dNext ? mergeIdx - 1 : mergeIdx + 1;
    } else {
      target = hasPrev ? mergeIdx - 1 : mergeIdx + 1;
    }
    list = mergeAdjacent(list, Math.min(mergeIdx, target), Math.max(mergeIdx, target));
  }
  return list;
}

// (b) 인접 클래스 대표값 차가 24 미만이면 병합 (그라데이션 과분할 방어).
function mergeByDeltaG(classes) {
  let list = classes;
  for (let iter = 0; iter < 6 && list.length > 1; iter += 1) {
    let mergeIdx = -1, bestDelta = Infinity;
    for (let i = 0; i < list.length - 1; i += 1) {
      const delta = Math.abs(list[i + 1].mean - list[i].mean);
      if (delta < 24 && delta < bestDelta) { bestDelta = delta; mergeIdx = i; }
    }
    if (mergeIdx < 0) break;
    list = mergeAdjacent(list, mergeIdx, mergeIdx + 1);
  }
  return list;
}

function buildClassMap(gray, w, h, classes) {
  const lut = new Uint8Array(256);
  classes.forEach((c, idx) => { for (let g = c.lo; g <= c.hi; g += 1) lut[g] = idx; });
  const map = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) map[i] = lut[gray[i]];
  return map;
}

// (c) 클래스 픽셀의 60%+ 가 더 어두운 클래스와 8-이웃 접촉하면 그 어두운
// 클래스로 흡수 (안티앨리어싱 헤일로가 독립 톤으로 오검출되는 것 방지).
function mergeByHalo(classes, gray, w, h) {
  let list = classes;
  for (let iter = 0; iter < 4 && list.length > 1; iter += 1) {
    const classMap = buildClassMap(gray, w, h, list);
    const touch = new Array(list.length).fill(0);
    const total = new Array(list.length).fill(0);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const idx = classMap[y * w + x];
        total[idx] += 1;
        if (idx === 0) continue;
        let touched = false;
        for (let dy = -1; dy <= 1 && !touched; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (!dx && !dy) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            if (classMap[ny * w + nx] < idx) { touched = true; break; }
          }
        }
        if (touched) touch[idx] += 1;
      }
    }
    let mergeAt = -1;
    for (let i = 1; i < list.length; i += 1) {
      if (total[i] > 0 && touch[i] / total[i] >= 0.6) { mergeAt = i; break; }
    }
    if (mergeAt < 0) break;
    list = mergeAdjacent(list, mergeAt - 1, mergeAt);
  }
  return list;
}

// 반환: classMap(픽셀당 클래스 idx, 0=가장 어두움) + classes(어두운→밝은 순).
// classes.length < 2 면 톤이 사실상 단일 — 호출자는 기존 단일-Otsu로 폴백.
export function computeGrayLevels(gray, w, h) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < w * h; i += 1) hist[gray[i]] += 1;

  const t1 = otsuInRange(hist, 0, 255);
  const thresholds = [];
  if (t1 !== null) {
    thresholds.push(t1);
    const tLo = otsuInRange(hist, 0, t1);
    if (tLo !== null) thresholds.push(tLo);
    const tHi = otsuInRange(hist, t1 + 1, 255);
    if (tHi !== null) thresholds.push(tHi);
  }
  thresholds.sort((a, b) => a - b);
  const uniqueThresholds = thresholds.filter((v, i, arr) => i === 0 || v !== arr[i - 1]);

  const ranges = [];
  let prev = 0;
  for (const t of uniqueThresholds) { ranges.push([prev, t]); prev = t + 1; }
  ranges.push([prev, 255]);

  let classes = ranges.map(([lo, hi]) => classFromRange(hist, lo, hi)).filter((c) => c.count > 0);
  if (!classes.length) classes = [classFromRange(hist, 0, 255)];

  classes = mergeByInkOccupancy(classes);
  classes = mergeByDeltaG(classes);
  classes = mergeByHalo(classes, gray, w, h);

  const classMap = buildClassMap(gray, w, h, classes);
  return { classMap, classes };
}

/* ===== 8b. ELLIPSE / RING FITTING (§2-2) =====
//
// 원·링(공)을 폴리곤 2겹 대신 네이티브 ellipse 1객체로 방출한다. 판정은 RDP
// 이전 원시 경계점에서 수행(검증자 지적) — dilate bbox가 아니라 raw loop 기준.
//   · 단일 루프: 정규화 잔차 e_i=((x-cx)/rx)²+((y-cy)/ry)²-1, RMS(e)<0.08 AND
//     max|e|<0.20 → 원/타원. 축정렬 실패 시 PCA 회전 좌표계로 1회 재시도.
//   · 링: 바깥·구멍 루프가 모두 타원이고 동심(중심거리<0.15·min(rx,ry))이며
//     36방향 두께 std/mean<0.3 → 중심선 ellipse 1개(strokeWidth=평균두께,
//     strokeLevel=링 잉크 그레이, fillLevel=구멍 내부 그레이 — 모두 실측치).
//   · 구멍 없는 채움 원판: strokeWidth 0, fillLevel=잉크 그레이 평균.
// 실패 시 null → 호출자는 기존 폴리곤 경로로 폴백(회귀 위험 0). ellipse 스펙의
// 좌표·반경·두께는 전부 이미지 px — objectify가 scale로 world mm 환산한다. */

const ELLIPSE_RMS_MAX = 0.08;
const ELLIPSE_MAXABS_MAX = 0.20;
const ELLIPSE_MIN_RADIUS = 2;      // px — 이보다 작은 원은 폴리곤 유지(격자 노이즈)
const ELLIPSE_MIN_POINTS = 8;
const RING_CONCENTRIC_RATIO = 0.15;
const RING_THICKNESS_CV_MAX = 0.30;
const RING_THETA_SAMPLES = 36;

function ellipseResidualStats(points, cx, cy, rx, ry) {
  let sumSq = 0, maxAbs = 0;
  for (const [x, y] of points) {
    const nx = (x - cx) / rx, ny = (y - cy) / ry;
    const e = nx * nx + ny * ny - 1;
    sumSq += e * e;
    const a = e < 0 ? -e : e;
    if (a > maxAbs) maxAbs = a;
  }
  return { rms: Math.sqrt(sumSq / points.length), maxAbs };
}

// 단일 원시 루프 → { cx, cy, rx, ry, rotationDeg } 또는 null.
function fitEllipseToLoop(points) {
  const n = points.length;
  if (n < ELLIPSE_MIN_POINTS) return null;
  let sx = 0, sy = 0, minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [x, y] of points) {
    sx += x; sy += y;
    if (x < minx) minx = x; if (x > maxx) maxx = x;
    if (y < miny) miny = y; if (y > maxy) maxy = y;
  }
  const cx = sx / n, cy = sy / n;               // 중심 = 경계점 무게중심(§2-2)
  const rx = (maxx - minx) / 2, ry = (maxy - miny) / 2; // rx·ry = bbox 반폭/반높이
  if (rx < ELLIPSE_MIN_RADIUS || ry < ELLIPSE_MIN_RADIUS) return null;

  // (1) 축정렬 시도.
  const axis = ellipseResidualStats(points, cx, cy, rx, ry);
  if (axis.rms < ELLIPSE_RMS_MAX && axis.maxAbs < ELLIPSE_MAXABS_MAX) {
    return { cx, cy, rx, ry, rotationDeg: 0 };
  }

  // (2) PCA 회전 좌표계로 1회 재시도(회전 타원).
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of points) {
    const dx = x - cx, dy = y - cy;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  sxx /= n; syy /= n; sxy /= n;
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const cos = Math.cos(theta), sin = Math.sin(theta);
  let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
  for (const [x, y] of points) {
    const dx = x - cx, dy = y - cy;
    const u = dx * cos + dy * sin, v = -dx * sin + dy * cos;
    if (u < umin) umin = u; if (u > umax) umax = u;
    if (v < vmin) vmin = v; if (v > vmax) vmax = v;
  }
  const cu = (umin + umax) / 2, cv = (vmin + vmax) / 2;
  const ru = (umax - umin) / 2, rv = (vmax - vmin) / 2;
  if (ru < ELLIPSE_MIN_RADIUS || rv < ELLIPSE_MIN_RADIUS) return null;
  let sumSq = 0, maxAbs = 0;
  for (const [x, y] of points) {
    const dx = x - cx, dy = y - cy;
    const u = dx * cos + dy * sin, v = -dx * sin + dy * cos;
    const nu = (u - cu) / ru, nv = (v - cv) / rv;
    const e = nu * nu + nv * nv - 1;
    sumSq += e * e;
    const a = e < 0 ? -e : e;
    if (a > maxAbs) maxAbs = a;
  }
  if (Math.sqrt(sumSq / n) < ELLIPSE_RMS_MAX && maxAbs < ELLIPSE_MAXABS_MAX) {
    const ecx = cx + cu * cos - cv * sin;       // PCA 프레임 중심 → 이미지 좌표
    const ecy = cy + cu * sin + cv * cos;
    return { cx: ecx, cy: ecy, rx: ru, ry: rv, rotationDeg: theta * 180 / Math.PI };
  }
  return null;
}

// world 방향 theta에서 ellipse 중심 → 경계까지의 거리(회전 반영).
function ellipseRadiusAt(fit, theta) {
  const phi = theta - fit.rotationDeg * Math.PI / 180;
  const c = Math.cos(phi) / fit.rx, s = Math.sin(phi) / fit.ry;
  return 1 / Math.sqrt(c * c + s * s);
}

function loopBox(points, w, h) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [Math.max(0, Math.floor(x0)), Math.max(0, Math.floor(y0)),
          Math.min(w, Math.ceil(x1)), Math.min(h, Math.ceil(y1))];
}

function medianGrayInBox(gray, w, h, box, keep) {
  const [x0, y0, x1, y1] = box;
  const hist = new Array(256).fill(0);
  let count = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (keep(x, y)) { hist[gray[y * w + x]] += 1; count += 1; }
    }
  }
  return medianFromHistogram(hist, count);
}

// 컴포넌트의 원시 루프 → ellipse 스펙(px) 또는 null. getInk(x,y): 이 컴포넌트의
// 이 레벨 잉크 픽셀 여부(그레이 실측용). gray: 원본 그레이.
function fitComponentEllipse(rawLoops, getInk, gray, w, h) {
  const outers = rawLoops.filter((l) => !l.isHole);
  const holes = rawLoops.filter((l) => l.isHole);
  if (outers.length !== 1) return null;         // 바깥 경계 정확히 1개
  const outerFit = fitEllipseToLoop(outers[0].points);
  if (!outerFit) return null;

  // 구멍 없음 → 채움 원판.
  if (!holes.length) {
    const inkGray = medianGrayInBox(gray, w, h, loopBox(outers[0].points, w, h), getInk);
    return {
      cx: outerFit.cx, cy: outerFit.cy, rx: outerFit.rx, ry: outerFit.ry,
      rotationDeg: outerFit.rotationDeg, strokeWidthPx: 0,
      strokeLevel: 0, fillLevel: inkGray === null ? 0 : inkGray,
    };
  }

  // 링 후보: 가장 큰 구멍만 검사(다중 구멍이면 깨끗한 링 아님).
  let hole = holes[0], holeSpan = -1;
  for (const hl of holes) {
    const b = loopBox(hl.points, w, h);
    const span = (b[2] - b[0]) * (b[3] - b[1]);
    if (span > holeSpan) { holeSpan = span; hole = hl; }
  }
  const holeFit = fitEllipseToLoop(hole.points);
  if (!holeFit) return null;                     // 구멍이 타원 아님 → 폴백

  // 동심 조건.
  const dc = Math.hypot(outerFit.cx - holeFit.cx, outerFit.cy - holeFit.cy);
  if (dc >= RING_CONCENTRIC_RATIO * Math.min(outerFit.rx, outerFit.ry)) return null;

  // 36방향 두께 균일성(변동계수 std/mean).
  let tSum = 0;
  const ts = [];
  for (let k = 0; k < RING_THETA_SAMPLES; k += 1) {
    const theta = (k / RING_THETA_SAMPLES) * Math.PI * 2;
    const t = ellipseRadiusAt(outerFit, theta) - ellipseRadiusAt(holeFit, theta);
    if (t <= 0) return null;                      // 구멍이 바깥으로 삐져나옴 → 링 아님
    ts.push(t); tSum += t;
  }
  const tMean = tSum / RING_THETA_SAMPLES;
  let variance = 0;
  for (const t of ts) variance += (t - tMean) * (t - tMean);
  const tStd = Math.sqrt(variance / RING_THETA_SAMPLES);
  if (tMean <= 0 || tStd / tMean >= RING_THICKNESS_CV_MAX) return null;

  // 중심선 ellipse(바깥·구멍 평균) + strokeWidth=평균두께 → 획 두께가 원본 재현.
  const inkGray = medianGrayInBox(gray, w, h, loopBox(outers[0].points, w, h), getInk);
  const holeGray = medianGrayInBox(gray, w, h, loopBox(hole.points, w, h), (x, y) => !getInk(x, y));
  return {
    cx: (outerFit.cx + holeFit.cx) / 2, cy: (outerFit.cy + holeFit.cy) / 2,
    rx: (outerFit.rx + holeFit.rx) / 2, ry: (outerFit.ry + holeFit.ry) / 2,
    rotationDeg: outerFit.rotationDeg, strokeWidthPx: tMean,
    strokeLevel: inkGray === null ? 0 : inkGray,
    fillLevel: holeGray === null ? 255 : holeGray,
  };
}

/* ===== 8b-2. RECT / 균일 띠 stroke+fill FITTING (§8) =====
//
// 사각 링(또는 채운 사각)을 폴리곤 2겹 대신 회전 rect 1객체로, 비(非)사각
// 균일두께 띠(삼각 링 등)를 stroke+fill 한 폐폴리라인 1객체로 방출한다.
// fitComponentEllipse(§2-2)와 같은 철학: RDP 이전 원시 경계점에서 판정하고,
// 회색은 측정 헬퍼(medianGrayInBox)로 실측하며, 실패 시 예외 없이 null을
// 반환해 호출부가 다음 단으로 폴백한다(회귀 위험 0). 원형이면 꼭짓점 게이트가
// 자연 차단해 rect fit은 null이 되고, 원/링은 계속 ellipse의 몫이다.
//   · fitComponentRect  : 바깥 1개·꼭짓점 4개·각 90°±10°·면적비≥0.92 게이트.
//     구멍 1개면 4변 두께 CV≤0.30 검사 후 stroke=띠·fill=구멍 실측(hasFill).
//   · fitStrokedRegion  : 비사각 균일 띠(삼각 링 등). 바깥·구멍 중간선 근사.
//   · mergeBandFills     : 다단계 톤 후처리 — 빈 구멍을 밝은 컴포넌트가 채우면
//     그 회색을 fill로 흡수하고 그 컴포넌트를 제거(호출 배선은 §8 C 단계 몫). */

const RECT_RDP_EPSILON = 2;        // px — 사각 꼭짓점 추출 RDP 허용 오차
const RECT_ANGLE_TOL_DEG = 10;     // 꼭짓점 직각 허용 편차(90°±10°)
const RECT_AREA_RATIO_MIN = 0.92;  // 회전 사각 면적 / 폴리곤 실면적 최소비
const BAND_THICKNESS_CV_MAX = 0.30;// 균일 띠 두께 변동계수(std/mean) 상한
const STROKED_MIN_POINTS = 6;      // 균일 띠 바깥 윤곽 최소 꼭짓점(잡음 방어)

// 폐루프에 대한 RDP. rdp가 열린 폴리라인용이라 폐루프를 그대로 [.., 시작]으로
// 닫아 넘기면 시작=끝이 0길이 기준선이 돼 두 점으로 붕괴한다(RDP 특성). 그래서
// 무게중심에서 가장 먼 점(반드시 진짜 꼭짓점)을 기준으로 루프를 두 열린 반쪽으로
// 쪼개 각각 RDP를 돌린 뒤 이어붙인다. 이렇게 얻은 꼭짓점 집합에서 닫힘 중복점을
// 제거해 반환한다. collinearReduce가 이미 4점 이하로 축약했으면 그대로 쓴다.
function rdpClosed(points, epsilon) {
  const reduced = collinearReduce(points);
  if (reduced.length <= 4) return reduced;        // 이미 최소 꼭짓점(합성 클린 루프)
  let cx = 0, cy = 0;
  for (const [x, y] of reduced) { cx += x; cy += y; }
  cx /= reduced.length; cy /= reduced.length;
  let far = 0, farD = -1;
  for (let i = 0; i < reduced.length; i += 1) {
    const d = (reduced[i][0] - cx) ** 2 + (reduced[i][1] - cy) ** 2;
    if (d > farD) { farD = d; far = i; }
  }
  // 시작 꼭짓점(far)에서 정반대 꼭짓점까지, 다시 시작으로 — 두 열린 반쪽.
  const n = reduced.length;
  const rot = [];
  for (let i = 0; i < n; i += 1) rot.push(reduced[(far + i) % n]);
  rot.push(reduced[far]);                          // 끝=시작(닫힘)
  const half = Math.floor(n / 2);
  const a = rdp(rot.slice(0, half + 1), epsilon);
  const b = rdp(rot.slice(half), epsilon);
  const merged = a.slice(0, -1).concat(b);         // a 끝 == b 시작 중복 제거
  const out = merged.slice();
  while (out.length > 3 && segDist(out[0], out[out.length - 1]) < 1e-6) out.pop();
  return out;
}
function segDist(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }

// 폴리곤 부호면적 절대값(px²) — signedArea와 달리 점 배열 그대로(좌표 px).
function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

// 4꼭짓점 폴리곤 → 각 꼭짓점 내부각(도) 배열.
function cornerAngles(quad) {
  const n = quad.length;
  const angs = [];
  for (let i = 0; i < n; i += 1) {
    const P = quad[(i - 1 + n) % n], Q = quad[i], R = quad[(i + 1) % n];
    const ax = P[0] - Q[0], ay = P[1] - Q[1], bx = R[0] - Q[0], by = R[1] - Q[1];
    const dot = ax * bx + ay * by;
    const m = Math.hypot(ax, ay) * Math.hypot(bx, by) || 1e-9;
    angs.push(Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180 / Math.PI);
  }
  return angs;
}

// 4꼭짓점 사각 → 회전 rect 파라미터 { cx, cy, hw, hh, angle(rad), rotationDeg }.
// 한 변을 u축으로 삼아 네 꼭짓점을 u·v로 사영, 반폭·반높이를 구한다(측정 회색
// 이 아니라 기하만 — ellipse의 PCA 프레임과 동일 발상).
function rectFromQuad(quad) {
  let cx = 0, cy = 0;
  for (const [x, y] of quad) { cx += x; cy += y; }
  cx /= quad.length; cy /= quad.length;
  const angle = Math.atan2(quad[1][1] - quad[0][1], quad[1][0] - quad[0][0]);
  const c = Math.cos(angle), s = Math.sin(angle);
  let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
  for (const [x, y] of quad) {
    const dx = x - cx, dy = y - cy;
    const u = dx * c + dy * s, v = -dx * s + dy * c;
    if (u < umin) umin = u; if (u > umax) umax = u;
    if (v < vmin) vmin = v; if (v > vmax) vmax = v;
  }
  const cu = (umin + umax) / 2, cv = (vmin + vmax) / 2;
  const rcx = cx + cu * c - cv * s, rcy = cy + cu * s + cv * c; // 프레임 중심→이미지
  return {
    cx: rcx, cy: rcy, hw: (umax - umin) / 2, hh: (vmax - vmin) / 2,
    angle, rotationDeg: angle * 180 / Math.PI,
  };
}

// 원시 루프 → 회전 사각 게이트 통과 시 rect 파라미터, 아니면 null.
function fitRectToLoop(points) {
  const quad = rdpClosed(points, RECT_RDP_EPSILON);
  if (quad.length !== 4) return null;             // 꼭짓점 정확히 4개
  const angs = cornerAngles(quad);
  for (const a of angs) if (Math.abs(a - 90) > RECT_ANGLE_TOL_DEG) return null; // 각 90°±10°
  const rect = rectFromQuad(quad);
  if (rect.hw < ELLIPSE_MIN_RADIUS || rect.hh < ELLIPSE_MIN_RADIUS) return null;
  const rectArea = 4 * rect.hw * rect.hh;
  const polyArea = polygonArea(quad);
  if (polyArea <= 0) return null;
  // 면적비: 회전 사각(꼭짓점 사영 bbox)이 실제 폴리곤을 ≥92% 덮어야 진짜 사각.
  const ratio = polyArea / rectArea;
  if (ratio < RECT_AREA_RATIO_MIN || ratio > 1 / RECT_AREA_RATIO_MIN) return null;
  return rect;
}

// 사각 fit + 균일 띠 stroke+fill 판정. 반환:
//   null | { cx, cy, w, h, rotationDeg, strokeWidthPx, strokeLevel, fillLevel, hasFill }
// 좌표·크기는 전부 이미지 px(objectify가 scale로 world mm 환산). 원/링이면
// 꼭짓점 게이트가 걸러 null(→ ellipse 몫). getInk: 이 컴포넌트 잉크 여부.
function fitComponentRect(rawLoops, getInk, gray, w, h) {
  const outers = rawLoops.filter((l) => !l.isHole);
  const holes = rawLoops.filter((l) => l.isHole);
  if (outers.length !== 1) return null;           // 바깥 경계 정확히 1개
  const outerRect = fitRectToLoop(outers[0].points);
  if (!outerRect) return null;

  // 구멍 없음 → 꽉 찬 사각: fill=잉크 실측, stroke 0.
  if (!holes.length) {
    const inkGray = medianGrayInBox(gray, w, h, loopBox(outers[0].points, w, h), getInk);
    return {
      cx: outerRect.cx, cy: outerRect.cy, w: 2 * outerRect.hw, h: 2 * outerRect.hh,
      rotationDeg: outerRect.rotationDeg, strokeWidthPx: 0, strokeLevel: 0,
      fillLevel: inkGray === null ? 0 : inkGray, hasFill: false,
    };
  }

  // 링 후보: 가장 큰 구멍만 검사(다중 구멍이면 깨끗한 사각 링 아님).
  let hole = holes[0], holeSpan = -1;
  for (const hl of holes) {
    const b = loopBox(hl.points, w, h);
    const span = (b[2] - b[0]) * (b[3] - b[1]);
    if (span > holeSpan) { holeSpan = span; hole = hl; }
  }
  const innerRect = fitRectToLoop(hole.points);
  if (!innerRect) return null;                    // 구멍이 사각 아님 → 폴백

  // 동심(중심거리 < 0.15·min(반폭,반높이)) — ellipse 링과 같은 기준.
  const dc = Math.hypot(outerRect.cx - innerRect.cx, outerRect.cy - innerRect.cy);
  if (dc >= RING_CONCENTRIC_RATIO * Math.min(outerRect.hw, outerRect.hh)) return null;

  // 4변 두께(바깥 반extent − 안쪽 반extent)의 변동계수. 안쪽 사각의 자체 u/v축은
  // 감김·첫변 방향에 따라 바깥과 90° 어긋날 수 있으므로, 구멍 꼭짓점을 바깥 프레임
  // 좌표로 직접 사영해 그 프레임에서 안쪽 반extent를 재측정한다(축 대응 보장).
  const innerQuad = rdpClosed(hole.points, RECT_RDP_EPSILON);
  if (innerQuad.length !== 4) return null;
  const cA = Math.cos(outerRect.angle), sA = Math.sin(outerRect.angle);
  let iumin = Infinity, iumax = -Infinity, ivmin = Infinity, ivmax = -Infinity;
  for (const [x, y] of innerQuad) {
    const dx = x - outerRect.cx, dy = y - outerRect.cy;
    const u = dx * cA + dy * sA, v = -dx * sA + dy * cA;
    if (u < iumin) iumin = u; if (u > iumax) iumax = u;
    if (v < ivmin) ivmin = v; if (v > ivmax) ivmax = v;
  }
  const inHw = (iumax - iumin) / 2, inHh = (ivmax - ivmin) / 2; // 바깥 프레임 기준 구멍 반extent
  const ts = [
    outerRect.hw - iumax,   // +u 변 두께
    outerRect.hw + iumin,   // -u 변 두께(iumin<0)
    outerRect.hh - ivmax,   // +v 변 두께
    outerRect.hh + ivmin,   // -v 변 두께(ivmin<0)
  ];
  let tSum = 0;
  for (const t of ts) { if (t <= 0) return null; tSum += t; } // 구멍이 삐져나옴 → 링 아님
  const tMean = tSum / ts.length;
  let variance = 0;
  for (const t of ts) variance += (t - tMean) * (t - tMean);
  const tStd = Math.sqrt(variance / ts.length);
  if (tMean <= 0 || tStd / tMean >= BAND_THICKNESS_CV_MAX) return null;

  // 중심선 rect(바깥·안쪽 반extent 평균) + strokeWidth=평균 띠 두께.
  const inkGray = medianGrayInBox(gray, w, h, loopBox(outers[0].points, w, h), getInk);
  const holeGray = medianGrayInBox(gray, w, h, loopBox(hole.points, w, h), (x, y) => !getInk(x, y));
  return {
    cx: outerRect.cx, cy: outerRect.cy,           // 동심 링 → 바깥 중심 = 중심선 중심
    w: (outerRect.hw + inHw), h: (outerRect.hh + inHh), // 중심선 전폭 = 바깥·구멍 반extent 합
    rotationDeg: outerRect.rotationDeg, strokeWidthPx: tMean,
    strokeLevel: inkGray === null ? 0 : inkGray,
    fillLevel: holeGray === null ? 255 : holeGray, hasFill: true,
  };
}

// 두 폐폴리곤(바깥·구멍)의 중간선 근사: 바깥 점마다 가장 가까운 구멍 점을 찾아
// 중점을 취한다(겉보기 오차 ≤ 2px 목표). 두 윤곽은 균일 두께라 최근접 대응이
// 대체로 마주보는 변으로 이어져 중심선이 안정적이다.
function midlineBetween(outerPts, holePts) {
  const mids = [];
  for (const p of outerPts) {
    let best = holePts[0], bestD = Infinity;
    for (const q of holePts) {
      const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
      if (d < bestD) { bestD = d; best = q; }
    }
    mids.push([(p[0] + best[0]) / 2, (p[1] + best[1]) / 2]);
  }
  return mids;
}

// 균일 두께 대칭성: 바깥 점마다 최근접 구멍 점까지 거리의 변동계수. 두께가
// 고르면 이 거리(≈띠 두께)가 일정하다. 반환 { mean, cv } 또는 null(점 부족).
function bandThicknessStats(outerPts, holePts) {
  if (!outerPts.length || !holePts.length) return null;
  const dists = [];
  for (const p of outerPts) {
    let bestD = Infinity;
    for (const q of holePts) {
      const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
      if (d < bestD) bestD = d;
    }
    dists.push(Math.sqrt(bestD));
  }
  let sum = 0;
  for (const d of dists) sum += d;
  const mean = sum / dists.length;
  if (mean <= 0) return null;
  let variance = 0;
  for (const d of dists) variance += (d - mean) * (d - mean);
  return { mean, cv: Math.sqrt(variance / dists.length) / mean };
}

// 비(非)사각 균일 띠(삼각 링 등) → stroke+fill 폐폴리라인. 반환:
//   null | { points:[{x,y}px], strokeWidthPx, strokeLevel, fillLevel }
// points는 바깥·구멍 윤곽의 중간선 근사. 원형 링·사각 링도 여기 걸릴 수 있으나
// 사다리(§2)에서 ellipse·rect가 먼저 소진하므로 실질 대상은 삼각/다각 링이다.
function fitStrokedRegion(rawLoops, getInk, gray, w, h) {
  const outers = rawLoops.filter((l) => !l.isHole);
  const holes = rawLoops.filter((l) => l.isHole);
  if (outers.length !== 1 || holes.length < 1) return null; // 바깥1·구멍1 균일 띠 전제
  const outerPts = collinearReduce(outers[0].points);
  if (outerPts.length < STROKED_MIN_POINTS) return null;    // 잡음 덩어리 방어

  // 가장 큰 구멍만(다중 구멍이면 깨끗한 균일 띠 아님).
  let hole = holes[0], holeSpan = -1;
  for (const hl of holes) {
    const b = loopBox(hl.points, w, h);
    const span = (b[2] - b[0]) * (b[3] - b[1]);
    if (span > holeSpan) { holeSpan = span; hole = hl; }
  }
  const holePts = collinearReduce(hole.points);

  const stats = bandThicknessStats(outerPts, holePts);
  if (!stats || stats.cv >= BAND_THICKNESS_CV_MAX) return null; // 두께 불균일 → 폴백

  const mids = midlineBetween(outerPts, holePts).map(([x, y]) => ({ x, y }));
  if (mids.length < 3) return null;

  const inkGray = medianGrayInBox(gray, w, h, loopBox(outers[0].points, w, h), getInk);
  const holeGray = medianGrayInBox(gray, w, h, loopBox(hole.points, w, h), (x, y) => !getInk(x, y));
  return {
    points: mids, strokeWidthPx: stats.mean,
    strokeLevel: inkGray === null ? 0 : inkGray,
    fillLevel: holeGray === null ? 255 : holeGray,
  };
}

// 다단계 톤 후처리: 테두리가 있는 링 rect(hasFill=true·strokeWidthPx>0)나
// strokedRegion의 구멍 안을, 더 밝은 level의 다른 컴포넌트가 면적≥80% 채우면
// 그 밝은 컴포넌트를 host 채움으로 흡수하고 제거한다(헌법 §0-1: 겹친 두 도형 금지
// → 테두리+채움 한 객체). 흡수 실패(fill 못 읽음) 시 제거하지 않는다(확신 우선 §5).
// 구멍 없는 솔리드 사각(hasFill=false)은 host 대상이 아니다(채움색 오변경 방지).
// 호출 배선은 §8 C(advancedShapes 게이트 안에서만).
function mergeBandFills(components) {
  const removed = new Set();
  for (const host of components) {
    const holeBox = bandHoleBox(host);   // 링/띠의 구멍만 반환(솔리드는 null)
    if (!holeBox) continue;
    const [hx0, hy0, hx1, hy1] = holeBox;
    const holeArea = Math.max(0, (hx1 - hx0)) * Math.max(0, (hy1 - hy0));
    if (holeArea <= 0) continue;
    const hostLevel = host.level;

    for (const cand of components) {
      if (cand === host || removed.has(cand)) continue;
      // 더 밝은 레벨만(level 값이 클수록 밝음 — §2-1 계약).
      if (typeof hostLevel !== "number" || typeof cand.level !== "number") continue;
      if (cand.level <= hostLevel) continue;
      const cb = cand.bbox;
      if (!cb) continue;
      // 후보 bbox가 구멍 bbox의 ≥80%를 덮는가(교집합 면적 / 구멍 면적).
      const ix0 = Math.max(hx0, cb[0]), iy0 = Math.max(hy0, cb[1]);
      const ix1 = Math.min(hx1, cb[2]), iy1 = Math.min(hy1, cb[3]);
      const inter = Math.max(0, ix1 - ix0) * Math.max(0, iy1 - iy0);
      if (inter / holeArea < 0.80) continue;
      if (absorbFill(host, cand)) { removed.add(cand); break; } // 흡수 성공 때만 제거(한 host엔 하나)
    }
  }
  return components.filter((c) => !removed.has(c));
}

// host의 '채워질 구멍' bbox[x0,y0,x1,y1] 또는 null. 대상은 테두리가 있는 링
// rect(hasFill=true·strokeWidthPx>0)와 strokedRegion. 구멍 없는 솔리드 사각은
// null(오병합·채움색 변경 방지 — 헌법 §0-2).
function bandHoleBox(host) {
  if (host.rect && host.rect.hasFill === true && host.rect.strokeWidthPx > 0) {
    const r = host.rect, c = Math.cos(r.rotationDeg * Math.PI / 180), s = Math.sin(r.rotationDeg * Math.PI / 180);
    // 안쪽 구멍 반extent = 중심선 반extent − 띠 반두께(대칭 가정). 회전 반영 AABB.
    const ihw = Math.max(0, r.w / 2 - r.strokeWidthPx / 2), ihh = Math.max(0, r.h / 2 - r.strokeWidthPx / 2);
    const ex = Math.abs(ihw * c) + Math.abs(ihh * s), ey = Math.abs(ihw * s) + Math.abs(ihh * c);
    return [r.cx - ex, r.cy - ey, r.cx + ex, r.cy + ey];
  }
  if (host.strokedRegion && Array.isArray(host.strokedRegion.points)) {
    const pts = host.strokedRegion.points;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
    if (!isFinite(x0)) return null;
    return [x0, y0, x1, y1];
  }
  return null;
}

// 흡수: 밝은 cand의 fillLevel(있으면)을 host 채움으로 이식. 성공하면 true.
// cand가 rect/strokedRegion/ellipse/loops 어느 형태든 실측 fill을 읽는다(계약 일치).
function absorbFill(host, cand) {
  let fill = null;
  if (cand.rect && typeof cand.rect.fillLevel === "number") fill = cand.rect.fillLevel;
  else if (cand.strokedRegion && typeof cand.strokedRegion.fillLevel === "number") fill = cand.strokedRegion.fillLevel;
  else if (cand.ellipse && typeof cand.ellipse.fillLevel === "number") fill = cand.ellipse.fillLevel;
  else if (typeof cand.fillLevel === "number") fill = cand.fillLevel;
  else if (Array.isArray(cand.loops)) {
    const outer = cand.loops.find((l) => !l.isHole && typeof l.fillLevel === "number");
    if (outer) fill = outer.fillLevel;
  }
  if (fill === null) return false;
  if (host.rect) host.rect.fillLevel = fill;        // 링 host는 이미 hasFill=true
  else if (host.strokedRegion) host.strokedRegion.fillLevel = fill;
  return true;
}

export { fitComponentRect, fitStrokedRegion, mergeBandFills };

/* ===== 8c. CORNER-PRESERVING SMOOTHING + AXIS SNAP (§2-3) =====
//
// ellipse 피팅에 실패한 비(非)글자 루프의 각짐(픽셀 계단 + RDP 가짜 코너)을 없앤다.
//   1. collinearReduce된 원시 루프에서 각 점의 지지방향 전환각(전후 ~4px 호길이
//      평균 진행방향 차)을 재고, θ>60°이며 지역 최대(NMS 창 3px)인 점 = 코너.
//   2. 루프 시작을 첫 코너로 회전(RDP 임의 시작점의 가짜 코너 제거).
//   3. 코너-코너 스팬을 직선/곡선으로 분류(스팬 내 최대 수직거리 <0.75px → 직선).
//   4. 전(全) 직선 → 축정렬 스냅(±3°) 또는 최소자승 피팅 후 인접 스팬 교점으로
//      공유 꼭짓점 재계산 → closed polyline(사각형 모서리가 '진짜 N점').
//   5. 곡선 스팬 포함 → 3px 호길이 재샘플 + 코너 앞뒤 1.5px 가드 앵커 → closed
//      curve(가드가 코너 라운딩을 ≤0.25px로 억제해 직각 뭉개짐 방지).
// 반환 { points, curved } — curved:true면 objectify가 curve, 아니면 polyline. */

const SMOOTH_CORNER_DEG = 60;      // 코너 판정 전환각
const SMOOTH_NMS_PX = 3;           // 비최대 억제 창(호길이)
const SMOOTH_SUPPORT_PX = 4;       // 지지방향 측정 창(호길이)
const SMOOTH_CLUSTER_PX = 3;       // 코너 클러스터 병합 거리(호길이)
// 직선 판정: 스팬의 최대 수직거리 = 그 스팬의 sagitta(휨 높이) 자체다. 파이프라인
// 이 이진 마스크를 추적하므로 경계는 항상 픽셀 계단이고, 완전 직선 스팬도 계단
// 노이즈·AA 최외곽·코너 위치오차로 max가 실측 최대 ~2.0px까지 뜬다(검증자 원안
// 0.75px는 안티앨리어싱 '연속' 경계 가정이라 이 파이프라인엔 과도하게 엄격). 실제
// 곡선은 max가 수십~수백 px(반원 스팬 실측 120px)라 분리 여유가 크므로, 여유를 준
// 단일 임계 max<3.0px로 판정한다(RMS·bow는 짧은 스팬의 코너 위치오차에 취약해 배제).
const SMOOTH_STRAIGHT_MAX = 3.0;   // 직선 스팬 최대 수직거리 sagitta(px)
const SMOOTH_AXIS_DEG = 3;         // 수평/수직 스냅 허용 각
const SMOOTH_RESAMPLE_PX = 3;      // 곡선 스팬 재샘플 간격
const SMOOTH_GUARD_PX = 1.5;       // 코너 가드 앵커 거리
const SMOOTH_INTERSECT_MAX = 4;    // 인접 직선 교점이 원시 코너에서 이보다 멀면 발산으로 간주(삐침 방지)

function segLen(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }

// 폐곡선 점 i에서 전후 window(px) 호길이 구간의 진행방향 전환각(라디안 0~π).
function supportTurn(pts, i, window) {
  const n = pts.length;
  let acc = 0, j = i;
  while (acc < window) {
    const pj = (j - 1 + n) % n;
    acc += segLen(pts[j], pts[pj]); j = pj;
    if (j === i) break;
  }
  const back = pts[j];
  acc = 0; let k = i;
  while (acc < window) {
    const pk = (k + 1) % n;
    acc += segLen(pts[k], pts[pk]); k = pk;
    if (k === i) break;
  }
  const fwd = pts[k];
  const inA = Math.atan2(pts[i][1] - back[1], pts[i][0] - back[0]);
  const outA = Math.atan2(fwd[1] - pts[i][1], fwd[0] - pts[i][0]);
  let d = Math.abs(outA - inA);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
}

function detectCorners(pts) {
  const n = pts.length;
  const turn = new Array(n);
  for (let i = 0; i < n; i += 1) turn[i] = supportTurn(pts, i, SMOOTH_SUPPORT_PX) * 180 / Math.PI;
  const corners = [];
  for (let i = 0; i < n; i += 1) {
    if (turn[i] <= SMOOTH_CORNER_DEG) continue;
    let localMax = true;
    for (const dir of [-1, 1]) {
      let acc = 0, j = i;
      while (localMax) {
        const pj = (j + dir + n) % n;
        const l = segLen(pts[j], pts[pj]);
        if (acc + l > SMOOTH_NMS_PX) break;   // 창 밖 → 비교 중단
        acc += l; j = pj;
        if (j === i) break;
        if (turn[j] > turn[i]) localMax = false;
      }
      if (!localMax) break;
    }
    if (localMax) corners.push(i);
  }
  // 클러스터 병합: 한 꼭짓점이 1~2px 간격 2점으로 쪼개진 경우(예각 apex) 호길이
  // <3px로 인접한 후보들을 전환각 최대점 하나로 합친다. 실제 서로 다른 코너는 그
  // 사이 실변(邊)만큼(수십 px) 떨어져 있어 병합되지 않는다.
  if (corners.length < 2) return corners;
  const arcGap = (a, b) => { let acc = 0, k = a; while (k !== b) { const nk = (k + 1) % n; acc += segLen(pts[k], pts[nk]); k = nk; } return acc; };
  const groups = [[corners[0]]];
  for (let c = 1; c < corners.length; c += 1) {
    if (arcGap(corners[c - 1], corners[c]) < SMOOTH_CLUSTER_PX) groups[groups.length - 1].push(corners[c]);
    else groups.push([corners[c]]);
  }
  if (groups.length > 1) {
    const last = groups[groups.length - 1];
    if (arcGap(last[last.length - 1], groups[0][0]) < SMOOTH_CLUSTER_PX) { groups[0] = last.concat(groups[0]); groups.pop(); }
  }
  return groups.map((g) => g.reduce((best, idx) => (turn[idx] > turn[best] ? idx : best), g[0])).sort((a, b) => a - b);
}

function spanArcLength(span) {
  let s = 0;
  for (let i = 1; i < span.length; i += 1) s += segLen(span[i - 1], span[i]);
  return s;
}
function pointAtArc(span, target) {
  if (target <= 0) return span[0].slice();
  let acc = 0;
  for (let i = 1; i < span.length; i += 1) {
    const l = segLen(span[i - 1], span[i]);
    if (acc + l >= target) {
      const t = (target - acc) / (l || 1e-9);
      return [span[i - 1][0] + (span[i][0] - span[i - 1][0]) * t,
              span[i - 1][1] + (span[i][1] - span[i - 1][1]) * t];
    }
    acc += l;
  }
  return span[span.length - 1].slice();
}
// 스팬이 직선인지: 끝점 잇는 현(弦) 대비 최대 수직거리(sagitta)가 임계 미만.
function spanIsStraight(span) {
  const a = span[0], b = span[span.length - 1];
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1e-9;
  let maxd = 0;
  for (let i = 1; i < span.length - 1; i += 1) {
    const d = Math.abs(dy * span[i][0] - dx * span[i][1] + b[0] * a[1] - b[1] * a[0]) / len;
    if (d > maxd) maxd = d;
  }
  return maxd < SMOOTH_STRAIGHT_MAX;
}

// 직선 스팬 → 선 표현: {kind:'h',y} | {kind:'v',x} | {kind:'ls',px,py,dx,dy}.
function fitSpanLine(span) {
  const a = span[0], b = span[span.length - 1];
  const ang = ((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI) % 180 + 180) % 180;
  if (Math.min(ang, 180 - ang) <= SMOOTH_AXIS_DEG) {
    let my = 0; for (const p of span) my += p[1];
    return { kind: "h", y: my / span.length };
  }
  if (Math.abs(ang - 90) <= SMOOTH_AXIS_DEG) {
    let mx = 0; for (const p of span) mx += p[0];
    return { kind: "v", x: mx / span.length };
  }
  let mx = 0, my = 0;
  for (const p of span) { mx += p[0]; my += p[1]; }
  mx /= span.length; my /= span.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of span) { const dx = p[0] - mx, dy = p[1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { kind: "ls", px: mx, py: my, dx: Math.cos(theta), dy: Math.sin(theta) };
}
function lineToPD(L) {
  if (L.kind === "h") return [[0, L.y], [1, 0]];
  if (L.kind === "v") return [[L.x, 0], [0, 1]];
  return [[L.px, L.py], [L.dx, L.dy]];
}
function lineIntersect(L1, L2, fallback) {
  const [p1, d1] = lineToPD(L1), [p2, d2] = lineToPD(L2);
  const denom = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(denom) < 1e-6) return fallback.slice();
  const wx = p2[0] - p1[0], wy = p2[1] - p1[1];
  const t = (wx * d2[1] - wy * d2[0]) / denom;
  const ix = p1[0] + d1[0] * t, iy = p1[1] + d1[1] * t;
  // 삐침 가드: 거의 평행한 두 직선(예각 획 끝·붓글씨 삐침)의 교점은 원시 코너에서
  // 수십~수백 px 밖으로 발산한다. 그럴 땐 교점을 버리고 원시 코너점을 쓴다. 정상
  // 코너(사각·삼각)의 교점은 원시 코너에서 1~2px 내라 영향 0.
  if (Math.hypot(ix - fallback[0], iy - fallback[1]) > SMOOTH_INTERSECT_MAX) return fallback.slice();
  return [ix, iy];
}

function resampleClosed(pts, step) {
  const n = pts.length;
  const seg = [];
  let total = 0;
  for (let i = 0; i < n; i += 1) { const l = segLen(pts[i], pts[(i + 1) % n]); seg.push(l); total += l; }
  const count = Math.max(3, Math.round(total / step));
  const out = [];
  for (let s = 0; s < count; s += 1) {
    const targ = (s / count) * total;
    let acc = 0, idx = 0;
    while (idx < n && acc + seg[idx] < targ) { acc += seg[idx]; idx += 1; }
    if (idx >= n) idx = n - 1;
    const t = (targ - acc) / (seg[idx] || 1e-9);
    const a = pts[idx], b = pts[(idx + 1) % n];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}
// 연속 중복점(<minGap) 제거 — Catmull-Rom 0길이 세그먼트 방지.
function dedupeLoop(pts, minGap) {
  const out = [];
  for (const p of pts) {
    if (!out.length || segLen(out[out.length - 1], p) >= minGap) out.push(p);
  }
  while (out.length > 3 && segLen(out[0], out[out.length - 1]) < minGap) out.pop();
  return out;
}

// 메인: collinearReduce된 폐루프 → { points, curved }.
function smoothLoop(pts) {
  if (pts.length < 4) return { points: pts, curved: false };
  const corners = detectCorners(pts);

  // 코너 0개 → 순수 곡선(블롭): 통째 재샘플.
  if (corners.length === 0) {
    return { points: dedupeLoop(resampleClosed(pts, SMOOTH_RESAMPLE_PX), 0.3), curved: true };
  }

  const n = pts.length;
  const spans = [];  // 코너 c → 코너 c+1 (양끝 포함)
  for (let c = 0; c < corners.length; c += 1) {
    const a = corners[c], b = corners[(c + 1) % corners.length];
    const span = [pts[a]];
    let i = a;
    do { i = (i + 1) % n; span.push(pts[i]); } while (i !== b);
    spans.push(span);
  }
  const straight = spans.map(spanIsStraight);
  const allStraight = straight.every(Boolean);

  // (A) 전 직선 + 코너 3개 이상 → 축스냅/LS 피팅 후 교점으로 polyline.
  if (allStraight && corners.length >= 3) {
    const lines = spans.map(fitSpanLine);
    const outPts = [];
    for (let c = 0; c < corners.length; c += 1) {
      const prev = lines[(c - 1 + corners.length) % corners.length];
      outPts.push(lineIntersect(prev, lines[c], pts[corners[c]]));
    }
    const cleaned = dedupeLoop(outPts, 0.3);
    return cleaned.length >= 3 ? { points: cleaned, curved: false } : { points: outPts, curved: false };
  }

  // (B) 곡선 스팬 포함 → 3px 재샘플 + 코너 가드 앵커 → curve.
  const outPts = [];
  for (let c = 0; c < corners.length; c += 1) {
    const span = spans[c];
    const L = spanArcLength(span);
    outPts.push(pts[corners[c]].slice());       // 코너 꼭짓점(날카롭게 유지)
    if (L > 2 * SMOOTH_GUARD_PX) {
      outPts.push(pointAtArc(span, SMOOTH_GUARD_PX));            // 코너 뒤 가드
      for (let s = SMOOTH_RESAMPLE_PX; s < L - SMOOTH_GUARD_PX; s += SMOOTH_RESAMPLE_PX) outPts.push(pointAtArc(span, s));
      outPts.push(pointAtArc(span, L - SMOOTH_GUARD_PX));        // 다음 코너 앞 가드
    } else if (L > SMOOTH_GUARD_PX) {
      outPts.push(pointAtArc(span, L / 2));
    }
  }
  const cleaned = dedupeLoop(outPts, 0.3);
  return cleaned.length >= 3 ? { points: cleaned, curved: true } : { points: pts, curved: false };
}

/* ===== 8d. ADVANCED SHAPES 판정 사다리 배선 (§8 임무 C, 명세 §2) =====
//
// advancedShapes 게이트 안에서만 호출된다(꺼짐 = 이 함수 자체가 호출 안 됨 →
// 코드 경로 100% 동일, 헌법 §0-3). ellipse 판정 실패 후, 다음 순서로 시도:
//   ③ fitComponentRect     → 사각 링/채움 사각 (stroke+fill 한 객체)
//   ④ fitStrokedRegion     → 비사각 균일 띠(stroke+fill 한 폐폴리라인)
//   ⑤ extractStrokes       → 가는 획 망(부분 방출 + 잔여 잉크)
// 성공한 단만 반환, 실패하면 다음 단으로. 전부 실패하면 null(호출자가 기존
// 폴백 폴리곤 경로로 처리). 예외는 절대 밖으로 던지지 않는다(각 판정 함수가
// 이미 null-안전이므로 여기서 추가 try/catch는 extractStrokes 호출부에만). */
// 획 경로({x,y} 점열, 원본 px)의 회색조 실측: 경로 bbox 안의 컴포넌트 잉크
// 중앙값. medianGrayInBox(§8b) 재사용 — 측정 실패 시 0(검정) 폴백.
function measureStrokePathLevel(points, getInk, gray, w, h) {
  // 중심선 bbox는 축정렬(수평·수직) 획에서 0폭/0높이로 붕괴해 회색 실측이 검정(0)으로
  // 폴백된다(§0-2 위반: 회색 획이 검정으로). 획 두께만큼 여유를 줘 획 잉크를 박스에
  // 포함시킨다 — medianGrayInBox의 getInk 필터가 배경·이웃 컴포넌트를 걸러 패딩은 안전.
  const raw = loopBox(points.map((p) => [p.x, p.y]), w, h);
  const PAD = 5;
  const box = [
    Math.max(0, raw[0] - PAD), Math.max(0, raw[1] - PAD),
    Math.min(w, raw[2] + PAD), Math.min(h, raw[3] + PAD),
  ];
  const level = medianGrayInBox(gray, w, h, box, getInk);
  return level === null ? 0 : level;
}

function fitAdvancedComponent(rawLoops, getInk, gray, w, h, bx0, by0, bx1, by1) {
  const rect = fitComponentRect(rawLoops, getInk, gray, w, h);
  if (rect) return { kind: "rect", rect };

  const strokedRegion = fitStrokedRegion(rawLoops, getInk, gray, w, h);
  if (strokedRegion) return { kind: "strokedRegion", strokedRegion };

  let strokes = null;
  try {
    strokes = extractStrokes(getInk, bx0, by0, bx1, by1);
  } catch (_e) {
    strokes = null; // 안전: extractStrokes 자체가 null-안전이나 이중 방어
  }
  if (strokes && strokes.paths && strokes.paths.length) {
    return { kind: "strokes", strokes };
  }
  return null;
}

/* ===== 8. PIPELINE ===== */
// options: dilateRadius(묶음 거리 1~9), minArea(px²), textSizePx(글자 판정 bbox),
//          epsilon(RDP px), removeGrid(격자 제거), preserveGrayLevels(다단계 톤).
// Returns { width, height, components: [{ bbox:[x0,y0,x1,y1], area, isText,
//   level?, ellipse?, loops?: [{ points:[[x,y],...], isHole, curved, fillLevel? }] }] }
// — 좌표는 이미지 px. 원/링으로 판정된 컴포넌트는 loops 대신 ellipse(§2-2)를
// 갖는다. loop.curved(§2-3)면 objectify가 closed curve, 아니면 closed polyline로
// 삽입. Within a component outlines come before holes (holes must stack on top).
// preserveGrayLevels:true일 때만 loop.fillLevel(실측 그레이 중앙값)과
// component.level(밝은 쪽이 낮음, z-order 낮게 삽입)이 채워진다.

function medianFromHistogram(hist, count) {
  if (!count) return null;
  const half = count / 2;
  let acc = 0;
  for (let v = 0; v < 256; v += 1) {
    acc += hist[v];
    if (acc >= half) return v;
  }
  return 255;
}

// isHole 루프는 "이 레벨보다 밝은" 실제 배경 그레이를(다른 밝은 레벨이 아래
// 깔려 있어도 원본에서 직접 측정), outline 루프는 이 컴포넌트의 이 레벨 고유
// 잉크 그레이를 loop bbox 안에서 측정 — 둘 다 하드코딩 0/255 대신 실측치.
function measureLoopFillLevel(pts, isHole, level, gray, classMap, labels, label, w, h) {
  let lx0 = Infinity, ly0 = Infinity, lx1 = -Infinity, ly1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < lx0) lx0 = x;
    if (x > lx1) lx1 = x;
    if (y < ly0) ly0 = y;
    if (y > ly1) ly1 = y;
  }
  lx0 = Math.max(0, Math.floor(lx0));
  ly0 = Math.max(0, Math.floor(ly0));
  lx1 = Math.min(w, Math.ceil(lx1));
  ly1 = Math.min(h, Math.ceil(ly1));
  const hist = new Array(256).fill(0);
  let count = 0;
  for (let y = ly0; y < ly1; y += 1) {
    for (let x = lx0; x < lx1; x += 1) {
      const p = y * w + x;
      const matches = isHole ? classMap[p] > level : (labels[p] === label && classMap[p] === level);
      if (matches) { hist[gray[p]] += 1; count += 1; }
    }
  }
  const median = medianFromHistogram(hist, count);
  return median === null ? (isHole ? 255 : 0) : median;
}

// 기존(단일 Otsu) 경로 — preserveGrayLevels:false 및 다단계 폴백 시 그대로 사용.
function vectorizeSingleLevel(imageData, options) {
  const { dilateRadius, minArea, textSizePx, epsilon, removeGrid, cutMask, advancedShapes } = options;
  const { width: w, height: h } = imageData;
  const { mask: rawMask, gray } = binarize(imageData);
  let mask = rawMask;
  if (removeGrid) mask = removeGridLines(mask, w, h);
  if (cutMask) { mask = mask.slice(); for (let i = 0; i < w * h; i += 1) if (cutMask[i]) mask[i] = 0; } // 분리 브러시: 절단선 제거
  const grouped = dilate(mask, w, h, dilateRadius);
  if (cutMask) for (let i = 0; i < w * h; i += 1) if (cutMask[i]) grouped[i] = 0; // dilate가 메운 절단선 재확보
  const { labels, comps } = connectedComponents(grouped, w, h);

  const components = [];
  for (const c of comps) {
    if (c.area < minArea) continue;
    const [bx0, by0, bx1, by1] = c.bbox;
    const bw = bx1 - bx0, bh = by1 - by0;
    const isText = bw < textSizePx && bh < textSizePx && c.area / (bw * bh) > 0.15;
    const getInk = (x, y) =>
      x >= 0 && x < w && y >= 0 && y < h && mask[y * w + x] === 1 && labels[y * w + x] === c.label;
    const rawLoops = traceContours(getInk, bx0 - 1, by0 - 1, bx1 + 1, by1 + 1)
      .map((raw) => ({ points: raw, isHole: signedArea(raw) < 0 }));

    // §2-2: 원/링이면 폴리곤 2겹 대신 ellipse 1객체(글자는 §2-4 몫이라 제외).
    const ellipse = isText ? null : fitComponentEllipse(rawLoops, getInk, gray, w, h);
    if (ellipse) { components.push({ bbox: c.bbox, area: c.area, isText, ellipse }); continue; }

    // §8 사다리(임무 C): advancedShapes일 때만, ellipse 실패 뒤 rect/균일띠/획
    // 순서로 시도. 글자는 §2-4 몫이라 제외. 실패하면 그대로 아래 폴백 경로.
    let advanced = null;
    if (advancedShapes && !isText) {
      advanced = fitAdvancedComponent(rawLoops, getInk, gray, w, h, bx0 - 1, by0 - 1, bx1 + 1, by1 + 1);
    }
    if (advanced && advanced.kind === "rect") {
      components.push({ bbox: c.bbox, area: c.area, isText, rect: advanced.rect });
      continue;
    }
    if (advanced && advanced.kind === "strokedRegion") {
      components.push({ bbox: c.bbox, area: c.area, isText, strokedRegion: advanced.strokedRegion });
      continue;
    }

    // 획 승격: 잔여 잉크는 기존 loops 경로로 함께 방출(명세 §2 부분 방출 설계).
    // strokes일 때는 잔여 잉크 기준으로 윤곽을 재추적해야 "잔여 조각만" 나온다
    // (rawLoops를 그대로 쓰면 획으로 이미 설명된 잉크까지 다시 폴리곤화된다).
    if (advanced && advanced.kind === "strokes") {
      const residualGetInk = (x, y) => getInk(x, y) && advanced.strokes.isResidualInk(x, y);
      const residualLoops = traceContours(residualGetInk, bx0 - 1, by0 - 1, bx1 + 1, by1 + 1)
        .map((raw) => ({ points: raw, isHole: signedArea(raw) < 0 }));
      const loops = [];
      for (const rl of residualLoops) {
        const reduced = collinearReduce(rl.points);
        const sm = smoothLoop(reduced);      // §2-3 코너 보존 스무딩(잔여도 비글자 취급)
        if (sm.points.length < 3) continue;
        loops.push({ points: sm.points, isHole: rl.isHole, curved: sm.curved });
      }
      loops.sort((a, b) => (a.isHole ? 1 : 0) - (b.isHole ? 1 : 0));
      const strokePaths = advanced.strokes.paths.map((p) => ({
        kind: p.kind,
        points: p.points.map((pt) => [pt.x, pt.y]),
        thicknessPx: p.thicknessPx,
        strokeLevel: measureStrokePathLevel(p.points, getInk, gray, w, h),
      }));
      components.push({ bbox: c.bbox, area: c.area, isText, strokes: strokePaths, loops });
      continue;
    }

    const loops = [];
    for (const rl of rawLoops) {
      const reduced = collinearReduce(rl.points);
      let pts, curved = false;
      if (isText) {
        pts = rdp(reduced, epsilon);         // 글자는 §2-4 몫 → 현행 RDP 유지
      } else {
        const sm = smoothLoop(reduced);      // §2-3 코너 보존 스무딩
        pts = sm.points; curved = sm.curved;
      }
      if (pts.length < 3) continue;
      loops.push({ points: pts, isHole: rl.isHole, curved });
    }
    if (!loops.length) continue;
    loops.sort((a, b) => (a.isHole ? 1 : 0) - (b.isHole ? 1 : 0));
    components.push({ bbox: c.bbox, area: c.area, isText, loops });
  }
  return { width: w, height: h, components };
}

// 다단계 톤 경로 — 밝은 레벨부터 어두운 레벨 순으로 기존 dilate→CC→trace
// 파이프라인을 레벨마다 재실행(누적 마스크: classMap<=level). 밝은 레벨을
// 먼저 push해 order를 낮게 주고, 어두운 레벨은 나중에 push해 위에 쌓는다.
function vectorizeMultiLevel(imageData, options) {
  const { dilateRadius, minArea, textSizePx, epsilon, removeGrid, cutMask, advancedShapes } = options;
  const { width: w, height: h } = imageData;
  const { gray } = binarize(imageData);
  const { classMap, classes } = computeGrayLevels(gray, w, h);
  if (classes.length < 2) return null; // 톤이 사실상 단일 — 단일-Otsu로 폴백

  const lightestIdx = classes.length - 1;
  if (cutMask) { for (let i = 0; i < w * h; i += 1) if (cutMask[i]) classMap[i] = lightestIdx; } // 분리 브러시: 절단선 → 배경
  if (removeGrid) {
    const inkMask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i += 1) inkMask[i] = classMap[i] < lightestIdx ? 1 : 0;
    const cleaned = removeGridLines(inkMask, w, h);
    for (let i = 0; i < w * h; i += 1) {
      if (inkMask[i] && !cleaned[i]) classMap[i] = lightestIdx; // 제거된 픽셀 → 배경 클래스
    }
  }

  const components = [];
  for (let level = lightestIdx - 1; level >= 0; level -= 1) {
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i += 1) mask[i] = classMap[i] <= level ? 1 : 0;
    const grouped = dilate(mask, w, h, dilateRadius);
    if (cutMask) for (let i = 0; i < w * h; i += 1) if (cutMask[i]) grouped[i] = 0; // 분리 브러시: dilate 메움 재확보
    const { labels, comps } = connectedComponents(grouped, w, h);

    for (const c of comps) {
      if (c.area < minArea) continue;
      const [bx0, by0, bx1, by1] = c.bbox;
      const bw = bx1 - bx0, bh = by1 - by0;

      // 레벨별 컴포넌트 방출 게이트: 이 레벨 고유 픽셀이 컴포넌트 실제
      // 잉크 면적의 ~2% 미만이면 방출 생략 (순수 검정 도형이 모든 레벨에서
      // 중복 방출되는 것 방지).
      let trueArea = 0, uniqueCount = 0;
      for (let y = by0; y < by1; y += 1) {
        for (let x = bx0; x < bx1; x += 1) {
          const p = y * w + x;
          if (mask[p] === 1 && labels[p] === c.label) {
            trueArea += 1;
            if (classMap[p] === level) uniqueCount += 1;
          }
        }
      }
      if (!trueArea || uniqueCount / trueArea < 0.02) continue;

      const getInk = (x, y) =>
        x >= 0 && x < w && y >= 0 && y < h && mask[y * w + x] === 1 && labels[y * w + x] === c.label;
      const rawLoops = traceContours(getInk, bx0 - 1, by0 - 1, bx1 + 1, by1 + 1)
        .map((raw) => ({ points: raw, isHole: signedArea(raw) < 0 }));
      const isText = bw < textSizePx && bh < textSizePx && c.area / (bw * bh) > 0.15;

      // §2-2: 원/링이면 폴리곤 2겹 대신 ellipse 1객체(그레이 실측 stroke/fill).
      const ellipse = isText ? null : fitComponentEllipse(rawLoops, getInk, gray, w, h);
      if (ellipse) { components.push({ bbox: c.bbox, area: c.area, isText, level, ellipse }); continue; }

      // §8 사다리(임무 C): advancedShapes일 때만, ellipse 실패 뒤 rect/균일띠/획
      // 순서로 시도. 글자는 §2-4 몫이라 제외. 실패하면 그대로 아래 폴백 경로.
      let advanced = null;
      if (advancedShapes && !isText) {
        advanced = fitAdvancedComponent(rawLoops, getInk, gray, w, h, bx0 - 1, by0 - 1, bx1 + 1, by1 + 1);
      }
      if (advanced && advanced.kind === "rect") {
        components.push({ bbox: c.bbox, area: c.area, isText, level, rect: advanced.rect });
        continue;
      }
      if (advanced && advanced.kind === "strokedRegion") {
        components.push({ bbox: c.bbox, area: c.area, isText, level, strokedRegion: advanced.strokedRegion });
        continue;
      }

      if (advanced && advanced.kind === "strokes") {
        // 잔여 잉크 기준으로 윤곽 재추적(§2 부분 방출) — Single 경로와 동일 원칙.
        const residualGetInk = (x, y) => getInk(x, y) && advanced.strokes.isResidualInk(x, y);
        const residualLoops = traceContours(residualGetInk, bx0 - 1, by0 - 1, bx1 + 1, by1 + 1)
          .map((raw) => ({ points: raw, isHole: signedArea(raw) < 0 }));
        const loops = [];
        for (const rl of residualLoops) {
          const reduced = collinearReduce(rl.points);
          const sm = smoothLoop(reduced);
          if (sm.points.length < 3) continue;
          const fillLevel = measureLoopFillLevel(sm.points, rl.isHole, level, gray, classMap, labels, c.label, w, h);
          loops.push({ points: sm.points, isHole: rl.isHole, curved: sm.curved, fillLevel });
        }
        loops.sort((a, b) => (a.isHole ? 1 : 0) - (b.isHole ? 1 : 0));
        const strokePaths = advanced.strokes.paths.map((p) => ({
          kind: p.kind,
          points: p.points.map((pt) => [pt.x, pt.y]),
          thicknessPx: p.thicknessPx,
          strokeLevel: measureStrokePathLevel(p.points, getInk, gray, w, h),
        }));
        components.push({ bbox: c.bbox, area: c.area, isText, level, strokes: strokePaths, loops });
        continue;
      }

      const loops = [];
      for (const rl of rawLoops) {
        const reduced = collinearReduce(rl.points);
        let pts, curved = false;
        if (isText) {
          pts = rdp(reduced, epsilon);         // 글자는 §2-4 몫 → 현행 RDP 유지
        } else {
          const sm = smoothLoop(reduced);      // §2-3 코너 보존 스무딩
          pts = sm.points; curved = sm.curved;
        }
        if (pts.length < 3) continue;
        const fillLevel = measureLoopFillLevel(pts, rl.isHole, level, gray, classMap, labels, c.label, w, h);
        loops.push({ points: pts, isHole: rl.isHole, curved, fillLevel });
      }
      if (!loops.length) continue;
      loops.sort((a, b) => (a.isHole ? 1 : 0) - (b.isHole ? 1 : 0));
      components.push({ bbox: c.bbox, area: c.area, isText, level, loops });
    }
  }
  return { width: w, height: h, components };
}

export function vectorizeImage(imageData, options = {}) {
  const {
    dilateRadius = 3,
    minArea = 25,
    textSizePx = 22,
    epsilon = 1.2,
    removeGrid = false,
    preserveGrayLevels = true,
    cutMask = null,               // 분리 브러시: 사용자가 그은 절단선 픽셀(1=자름)
    advancedShapes = false,       // [고급] 선·도형 승격 게이트(명세 §8 임무 C). 기본 꺼짐 = 회귀 0.
  } = options;
  const pipelineOptions = { dilateRadius, minArea, textSizePx, epsilon, removeGrid, cutMask, advancedShapes };
  let result;
  if (preserveGrayLevels) {
    const multi = vectorizeMultiLevel(imageData, pipelineOptions);
    result = multi || vectorizeSingleLevel(imageData, pipelineOptions);
  } else {
    result = vectorizeSingleLevel(imageData, pipelineOptions);
  }
  // advancedShapes일 때만 밴드 채움 병합 후처리(명세 §2 ④ 후속) — 꺼짐이면
  // 호출 자체가 없어 결과가 기존과 100% 동일(헌법 §0-3).
  if (advancedShapes) result.components = mergeBandFills(result.components);
  return result;
}
