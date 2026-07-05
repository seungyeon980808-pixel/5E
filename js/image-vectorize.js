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
  return [p1[0] + d1[0] * t, p1[1] + d1[1] * t];
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

/* ===== 8d. STROKE EXTRACTION (§2-5) — 선을 면 아닌 line/curve로 =====
//
// 얇은(획) 컴포넌트는 윤곽 폴리곤(면 2장)이 아니라 중심선(스켈레톤)을 뽑아
// line/polyline/curve + strokeWidth로 방출한다. 핵심:
//   · 거리변환(DT)으로 국소 반폭 실측 → maxDT가 작고(얇음) 스켈레톤이 길면(가늘고
//     긺) 획으로 판정, 아니면 면으로 남긴다(기존 파이프라인).
//   · Guo-Hall 세선화(대각선에 강함) → 스켈레톤 → 그래프(끝점·교차점·경로) 후
//     코너 tangle 수축·재병합.
//   · 곧은 경로 → line, 꺾임 → polyline, 매끈 → curve. 닫힌 루프(상자 테두리) →
//     닫힌 polyline/curve 1개(fillNone) — "면 2장" 구조적 소멸.
//   · strokeWidth = 2×평균 DT(커버리지 반영), strokeLevel = 잉크 하위 10퍼센타일
//     (열화 방어). 진하면(≤160) 검정으로 스냅 → "분명한 선이 흐려지는" 문제 방어.
//   · 사전 패스는 Otsu 잉크 합집합에서 수행 → 획 코어가 회색 레벨로 조각나도(F1)
//     온전한 한 획으로 추출. 원/링은 §2-2 ellipse가 낫기에 stroke로 가로채지 않음. */

const STROKE_HALFWIDTH_MAX = 4.5;  // 이 반폭(px) 초과 = 면(획 아님)
const STROKE_ELONGATION = 4.0;     // 스켈레톤 길이 ≥ 4×maxDT 라야 획
const STROKE_SPUR_FACTOR = 2.0;    // 이보다 짧은 끝가지(스퍼)는 세선화 잡티로 제거
const STROKE_DARK_PCTL = 0.1;      // strokeLevel = 잉크 하위 10퍼센타일(진한 쪽)
const STROKE_INK_SNAP = 160;       // 측정 명도 ≤이면 검정(0)으로 스냅

// 배경까지의 근사 유클리드 거리(2-pass chamfer, 1·√2). 잉크=거리, 배경=0.
function distanceTransform(mask, w, h) {
  const INF = 1e9, D1 = 1, D2 = Math.SQRT2;
  const dt = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) dt[i] = mask[i] ? INF : 0;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const i = y * w + x; if (dt[i] === 0) continue;
    let m = dt[i];
    if (x > 0) m = Math.min(m, dt[i - 1] + D1);
    if (y > 0) m = Math.min(m, dt[i - w] + D1);
    if (x > 0 && y > 0) m = Math.min(m, dt[i - w - 1] + D2);
    if (x < w - 1 && y > 0) m = Math.min(m, dt[i - w + 1] + D2);
    dt[i] = m;
  }
  for (let y = h - 1; y >= 0; y -= 1) for (let x = w - 1; x >= 0; x -= 1) {
    const i = y * w + x; if (dt[i] === 0) continue;
    let m = dt[i];
    if (x < w - 1) m = Math.min(m, dt[i + 1] + D1);
    if (y < h - 1) m = Math.min(m, dt[i + w] + D1);
    if (x < w - 1 && y < h - 1) m = Math.min(m, dt[i + w + 1] + D2);
    if (x > 0 && y < h - 1) m = Math.min(m, dt[i + w - 1] + D2);
    dt[i] = m;
  }
  return dt;
}

// Guo-Hall 병렬 세선화 → 1px 스켈레톤. Zhang-Suen과 달리 대각선을 2px 리본으로
// 남기지 않아 AA/스캔 대각선에서 깔끔하다(스켈레톤 폭발 방지).
function guoHallThin(mask, w, h) {
  const img = mask.slice();
  const P = (x, y) => (x < 0 || x >= w || y < 0 || y >= h) ? 0 : img[y * w + x];
  const toClear = [];
  let changed = true, iter = 0;
  while (changed && iter < 300) {
    changed = false; iter += 1;
    for (let parity = 0; parity < 2; parity += 1) {
      toClear.length = 0;
      for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
        if (!img[y * w + x]) continue;
        const p2 = P(x, y - 1), p3 = P(x + 1, y - 1), p4 = P(x + 1, y), p5 = P(x + 1, y + 1),
              p6 = P(x, y + 1), p7 = P(x - 1, y + 1), p8 = P(x - 1, y), p9 = P(x - 1, y - 1);
        const C = (!p2 && (p3 || p4) ? 1 : 0) + (!p4 && (p5 || p6) ? 1 : 0)
                + (!p6 && (p7 || p8) ? 1 : 0) + (!p8 && (p9 || p2) ? 1 : 0);
        if (C !== 1) continue;
        const N1 = (p9 || p2 ? 1 : 0) + (p3 || p4 ? 1 : 0) + (p5 || p6 ? 1 : 0) + (p7 || p8 ? 1 : 0);
        const N2 = (p2 || p3 ? 1 : 0) + (p4 || p5 ? 1 : 0) + (p6 || p7 ? 1 : 0) + (p8 || p9 ? 1 : 0);
        const N = Math.min(N1, N2);
        if (N < 2 || N > 3) continue;
        const m = parity === 0 ? ((p6 || p7 || !p9) && p8) : ((p2 || p3 || !p5) && p4);
        if (!m) toClear.push(y * w + x);
      }
      if (toClear.length) { changed = true; for (const i of toClear) img[i] = 0; }
    }
  }
  return img;
}

// Zhang-Suen이 대각선에 남기는 2px 계단(2×2 블록)을 1px로 정리. 잉여점 제거:
// 8-이웃 교차수 A==1(이웃이 연속=코너/가장자리)이고 이웃≥3(두꺼운 곳)이면 제거.
// 교차점(A>1)과 1px 선(이웃<3)은 보존 → 연결성 유지하며 계단만 벗겨냄.
function pruneRedundant(skel, w, h) {
  const img = skel.slice();
  const P = (x, y) => (x < 0 || x >= w || y < 0 || y >= h) ? 0 : img[y * w + x];
  let changed = true, guard = 0;
  while (changed && guard < 8) {
    changed = false; guard += 1;
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      if (!img[y * w + x]) continue;
      const nb = [P(x, y - 1), P(x + 1, y - 1), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1), P(x - 1, y + 1), P(x - 1, y), P(x - 1, y - 1)];
      let B = 0; for (const v of nb) B += v;
      if (B < 3) continue;                              // 1px 선 보존
      let A = 0; for (let k = 0; k < 8; k += 1) if (nb[k] === 0 && nb[(k + 1) % 8] === 1) A += 1;
      if (A === 1) { img[y * w + x] = 0; changed = true; } // 코너 잉여점 → 제거
    }
  }
  return img;
}

const SKEL_NBR = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

// 스켈레톤 → 경로 목록 [{points:[[x,y]...], closed}]. 노드(끝점 deg1·교차 deg≥3)
// 사이를 deg2 픽셀을 따라 이어 열린 경로로, 노드 없는 순환은 닫힌 루프로.
function skeletonToGraph(skel, w, h) {
  const nbrs = (x, y) => {
    const r = [];
    for (const [dx, dy] of SKEL_NBR) { const nx = x + dx, ny = y + dy; if (nx >= 0 && nx < w && ny >= 0 && ny < h && skel[ny * w + nx]) r.push([nx, ny]); }
    return r;
  };
  const deg = new Int8Array(w * h);
  const ink = [];
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (skel[y * w + x]) { deg[y * w + x] = nbrs(x, y).length; ink.push([x, y]); }
  const key = (x, y) => x + "_" + y;
  const walked = new Set();                // 무방향 스텝 "a|b"
  const stepKey = (a, b) => (a < b ? a + "|" + b : b + "|" + a);
  const paths = [];
  const isNode = (x, y) => deg[y * w + x] !== 2;

  for (const [x, y] of ink) {
    if (!isNode(x, y)) continue;
    for (const [nx, ny] of nbrs(x, y)) {
      if (walked.has(stepKey(key(x, y), key(nx, ny)))) continue;
      const path = [[x, y]];
      let px = x, py = y, cx = nx, cy = ny;
      walked.add(stepKey(key(px, py), key(cx, cy)));
      while (true) {
        path.push([cx, cy]);
        if (isNode(cx, cy)) break;
        const nn = nbrs(cx, cy).filter(([ax, ay]) => !(ax === px && ay === py));
        if (!nn.length) break;
        px = cx; py = cy; [cx, cy] = nn[0];
        walked.add(stepKey(key(px, py), key(cx, cy)));
      }
      paths.push({ points: path, closed: false });
    }
  }
  // 노드 없는 순환(예: 사각 테두리) — 남은 deg2 픽셀에서 추적.
  const used = new Set();
  for (const p of paths) for (const [x, y] of p.points) used.add(key(x, y));
  for (const [x, y] of ink) {
    if (deg[y * w + x] !== 2 || used.has(key(x, y))) continue;
    const path = [[x, y]]; used.add(key(x, y));
    let px = x, py = y, cur = nbrs(x, y)[0];
    while (cur) {
      const [cx, cy] = cur;
      if (cx === x && cy === y) break;
      path.push([cx, cy]); used.add(key(cx, cy));
      const nn = nbrs(cx, cy).filter(([ax, ay]) => !(ax === px && ay === py));
      px = cx; py = cy; cur = nn[0];
      if (path.length > w * h) break;
    }
    paths.push({ points: path, closed: true });
  }
  return paths;
}

function pathArcLength(pts) {
  let s = 0; for (let i = 1; i < pts.length; i += 1) s += segLen(pts[i - 1], pts[i]); return s;
}
// 짧은 다리·스퍼 수축: 교차점에 붙은 짧은 경로(호길이 < thresh)를 없애고 그
// 양끝 노드를 하나로 합친다(union-find). 세선화가 코너에 만든 tangle(작은 삼각형·
// 이중다리)이 사라져 남은 팔들이 deg2로 이어짐. 독립된 짧은 획(양끝 자유단)은
// 교차점이 아니므로 보존한다.
function contractShortEdges(paths, thresh) {
  const key = (pt) => pt[0] + "_" + pt[1];
  const use = new Map();
  for (const p of paths) { if (p.closed) continue; for (const wend of [0, 1]) { const k = key(wend ? p.points[p.points.length - 1] : p.points[0]); use.set(k, (use.get(k) || 0) + 1); } }
  const parent = new Map();
  const ensure = (k) => { if (!parent.has(k)) parent.set(k, k); };
  const find = (k) => { let r = k; while (parent.get(r) !== r) r = parent.get(r); while (parent.get(k) !== r) { const n = parent.get(k); parent.set(k, r); k = n; } return r; };
  for (const p of paths) { if (p.closed) continue; ensure(key(p.points[0])); ensure(key(p.points[p.points.length - 1])); }
  const survivors = [];
  for (const p of paths) {
    if (p.closed) { survivors.push(p); continue; }
    const k0 = key(p.points[0]), k1 = key(p.points[p.points.length - 1]);
    const atNode = (use.get(k0) || 0) >= 2 || (use.get(k1) || 0) >= 2;
    if (atNode && pathArcLength(p.points) < thresh) { const r0 = find(k0), r1 = find(k1); if (r0 !== r1) parent.set(r0, r1); }
    else survivors.push(p);
  }
  const repCoord = (k) => { const parts = find(k).split("_"); return [Number(parts[0]), Number(parts[1])]; };
  for (const p of survivors) { if (p.closed) continue; p.points[0] = repCoord(key(p.points[0])); p.points[p.points.length - 1] = repCoord(key(p.points[p.points.length - 1])); }
  return survivors.length ? survivors : paths;
}
// 세선화가 코너에 만든 가짜 교차로 쪼개진 경로들을 재병합: 어떤 점이 '정확히
// 2개' 경로 끝에서만 만나면(스퍼 제거 후 실질 deg2) 하나로 잇는다. 상자 테두리는
// 닫힌 1개, L자는 꺾인 polyline 1개로 복원. 진짜 교차(십자, deg≥3)는 안 건드림.
function mergeSharedEndpoints(paths) {
  const key = (pt) => pt[0] + "_" + pt[1];
  const closed = paths.filter((p) => p.closed);
  let open = paths.filter((p) => !p.closed).map((p) => p.points.map((pt) => pt.slice()));
  let merged = true;
  while (merged) {
    merged = false;
    const endMap = new Map();
    open.forEach((p, idx) => {
      for (const which of [0, 1]) {
        const k = key(which === 0 ? p[0] : p[p.length - 1]);
        if (!endMap.has(k)) endMap.set(k, []);
        endMap.get(k).push({ idx, which });
      }
    });
    for (const ends of endMap.values()) {
      if (ends.length !== 2 || ends[0].idx === ends[1].idx) continue; // 정확히 2경로, 자기자신 아님
      const [e1, e2] = ends;
      let a = open[e1.idx].slice(), b = open[e2.idx].slice();
      if (e1.which === 0) a.reverse();          // 공유점이 a의 끝에 오도록
      if (e2.which === 1) b.reverse();          // 공유점이 b의 시작에 오도록
      const combined = a.concat(b.slice(1));    // 중복 공유점 제거하며 연결
      const ni = Math.min(e1.idx, e2.idx), nj = Math.max(e1.idx, e2.idx);
      open.splice(nj, 1); open.splice(ni, 1);
      open.push(combined);
      merged = true;
      break;
    }
  }
  const result = closed.slice();
  for (const p of open) {
    if (p.length > 3 && key(p[0]) === key(p[p.length - 1])) result.push({ points: p.slice(0, -1), closed: true });
    else result.push({ points: p, closed: false });
  }
  return result;
}
function sampleMeanDT(pts, dt, w) {
  let s = 0, n = 0;
  for (const [x, y] of pts) { s += dt[y * w + x]; n += 1; }
  return n ? s / n : 0;
}
function resampleOpen(pts, step) {
  const total = pathArcLength(pts);
  const count = Math.max(2, Math.round(total / step));
  const out = [pts[0].slice()];
  for (let s = 1; s < count; s += 1) {
    const targ = (s / count) * total;
    let acc = 0, i = 1;
    for (; i < pts.length; i += 1) { const l = segLen(pts[i - 1], pts[i]); if (acc + l >= targ) { const t = (targ - acc) / (l || 1e-9); out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]); break; } acc += l; }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
// 열린 스켈레톤 경로 → line / polyline / curve 스펙(px, strokeWidth/Level 미포함).
function processOpenPath(pts) {
  if (pts.length < 2) return null;
  const a = pts[0], b = pts[pts.length - 1];
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1e-9;
  let maxd = 0;
  for (let i = 1; i < pts.length - 1; i += 1) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / len; if (d > maxd) maxd = d; }
  if (maxd < 2.0) return { kind: "line", points: [a.slice(), b.slice()], closed: false };
  const simp = rdp(pts, 1.5);
  let sharp = false;
  for (let i = 1; i < simp.length - 1; i += 1) {
    const ux = simp[i][0] - simp[i - 1][0], uy = simp[i][1] - simp[i - 1][1];
    const vx = simp[i + 1][0] - simp[i][0], vy = simp[i + 1][1] - simp[i][1];
    const ang = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)) * 180 / Math.PI;
    if (ang > 50) sharp = true;
  }
  if (sharp) return { kind: "polyline", points: simp, closed: false };
  return { kind: "curve", points: resampleOpen(pts, 3), closed: false };
}
function darkPercentile(getInk, gray, w, h, bbox, pctl) {
  const [x0, y0, x1, y1] = bbox;
  const hist = new Array(256).fill(0); let cnt = 0;
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) if (getInk(x, y)) { hist[gray[y * w + x]] += 1; cnt += 1; }
  if (!cnt) return 0;
  const target = cnt * pctl; let acc = 0;
  for (let v = 0; v < 256; v += 1) { acc += hist[v]; if (acc >= target) return v; }
  return 255;
}

// 컴포넌트 잉크(getInk) → 획 스펙 배열 또는 null(면이라 획 아님).
function fitComponentStrokes(getInk, gray, w, h, bbox) {
  const pad = 2;
  const bx0 = Math.max(0, bbox[0] - pad), by0 = Math.max(0, bbox[1] - pad);
  const bx1 = Math.min(w, bbox[2] + pad), by1 = Math.min(h, bbox[3] + pad);
  const lw = bx1 - bx0, lh = by1 - by0;
  if (lw < 3 || lh < 3) return null;
  const m = new Uint8Array(lw * lh);
  for (let y = 0; y < lh; y += 1) for (let x = 0; x < lw; x += 1) if (getInk(bx0 + x, by0 + y)) m[y * lw + x] = 1;
  const dt = distanceTransform(m, lw, lh);
  let maxDT = 0; for (let i = 0; i < dt.length; i += 1) if (dt[i] > maxDT) maxDT = dt[i];
  if (maxDT > STROKE_HALFWIDTH_MAX) return null;                 // 두꺼움 → 면
  const skel = pruneRedundant(guoHallThin(m, lw, lh), lw, lh);
  let skelLen = 0; for (let i = 0; i < skel.length; i += 1) if (skel[i]) skelLen += 1;
  if (skelLen < STROKE_ELONGATION * maxDT) return null;          // 뭉툭 → 면
  const thresh = Math.max(4, STROKE_SPUR_FACTOR * maxDT + 2);
  const paths = mergeSharedEndpoints(contractShortEdges(skeletonToGraph(skel, lw, lh), thresh));
  if (!paths.length) return null;
  let sl = darkPercentile(getInk, gray, w, h, bbox, STROKE_DARK_PCTL);
  if (sl <= STROKE_INK_SNAP) sl = 0;
  const out = [];
  for (const path of paths) {
    if (path.points.length < 2) continue;
    const widthPx = Math.max(1, 2 * sampleMeanDT(path.points, dt, lw));
    const gp = path.points.map(([x, y]) => [x + bx0, y + by0]);
    if (path.closed) {
      const sm = smoothLoop(collinearReduce(gp));
      if (sm.points.length >= 3) out.push({ kind: sm.curved ? "curve" : "polyline", points: sm.points, closed: true, strokeWidthPx: widthPx, strokeLevel: sl });
    } else {
      const o = processOpenPath(gp);
      if (o) out.push({ ...o, strokeWidthPx: widthPx, strokeLevel: sl });
    }
  }
  return out.length ? out : null;
}

// Otsu 잉크 합집합에서 획 컴포넌트를 골라 방출하고, 그 픽셀을 claimed로 표시
// (나머지는 기존 파이프라인이 claimed 제외하고 처리 → §2-1~2-3 무회귀).
function extractStrokeComponents(imageData, options) {
  const { dilateRadius, minArea, textSizePx, removeGrid } = options;
  const { width: w, height: h } = imageData;
  const bin = binarize(imageData);
  let mask = bin.mask;
  if (removeGrid) mask = removeGridLines(mask, w, h);
  const grouped = dilate(mask, w, h, dilateRadius);
  const { labels, comps } = connectedComponents(grouped, w, h);
  const components = [];
  const claimed = new Uint8Array(w * h);
  for (const c of comps) {
    if (c.area < minArea) continue;
    const [bx0, by0, bx1, by1] = c.bbox, bw = bx1 - bx0, bh = by1 - by0;
    const isText = bw < textSizePx && bh < textSizePx && c.area / (bw * bh) > 0.15;
    if (isText) continue;                         // 글자는 stroke화 안 함(크롭/벡터 경로)
    const getInk = (x, y) => x >= 0 && x < w && y >= 0 && y < h && mask[y * w + x] === 1 && labels[y * w + x] === c.label;
    // 원/링은 §2-2 ellipse가 더 나으므로 stroke로 가로채지 않는다.
    const rawLoops = traceContours(getInk, bx0 - 1, by0 - 1, bx1 + 1, by1 + 1).map((raw) => ({ points: raw, isHole: signedArea(raw) < 0 }));
    if (fitComponentEllipse(rawLoops, getInk, bin.gray, w, h)) continue;
    const strokes = fitComponentStrokes(getInk, bin.gray, w, h, c.bbox);
    if (strokes && strokes.length) {
      components.push({ bbox: c.bbox, area: c.area, isText: false, strokes });
      for (let y = by0; y < by1; y += 1) for (let x = bx0; x < bx1; x += 1) if (getInk(x, y)) claimed[y * w + x] = 1;
    }
  }
  // claim을 2px 팽창해 획 주변 안티앨리어싱 가장자리까지 흡수 — 면 패스에서
  // 그 잔여가 얇은 '글자 유령' 컴포넌트로 조각나는 것을 막는다.
  return { components, claimed: components.length ? dilate(claimed, w, h, 5) : claimed };
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
function vectorizeSingleLevel(imageData, options, excludeMask) {
  const { dilateRadius, minArea, textSizePx, epsilon, removeGrid } = options;
  const { width: w, height: h } = imageData;
  const { mask: rawMask, gray } = binarize(imageData);
  let mask = rawMask;
  if (removeGrid) mask = removeGridLines(mask, w, h);
  if (excludeMask) { mask = mask.slice(); for (let i = 0; i < w * h; i += 1) if (excludeMask[i]) mask[i] = 0; } // §2-5: 획 픽셀 제외
  const grouped = dilate(mask, w, h, dilateRadius);
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
function vectorizeMultiLevel(imageData, options, excludeMask) {
  const { dilateRadius, minArea, textSizePx, epsilon, removeGrid } = options;
  const { width: w, height: h } = imageData;
  const { gray } = binarize(imageData);
  const { classMap, classes } = computeGrayLevels(gray, w, h);
  if (classes.length < 2) return null; // 톤이 사실상 단일 — 단일-Otsu로 폴백

  const lightestIdx = classes.length - 1;
  if (excludeMask) { for (let i = 0; i < w * h; i += 1) if (excludeMask[i]) classMap[i] = lightestIdx; } // §2-5: 획 픽셀 → 배경
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
  } = options;
  const pipelineOptions = { dilateRadius, minArea, textSizePx, epsilon, removeGrid };
  const { width: w, height: h } = imageData;

  // §2-5 획 사전 패스: Otsu 잉크 합집합에서 얇은 획을 line/curve로 방출하고,
  // 그 픽셀을 나머지(면) 파이프라인에서 제외 → 커밋된 §2-1~2-3 로직 무회귀.
  const strokePass = extractStrokeComponents(imageData, pipelineOptions);
  const excludeMask = strokePass.claimed;

  let rest = null;
  if (preserveGrayLevels) rest = vectorizeMultiLevel(imageData, pipelineOptions, excludeMask);
  if (!rest) rest = vectorizeSingleLevel(imageData, pipelineOptions, excludeMask);
  return { width: w, height: h, components: strokePass.components.concat(rest.components) };
}
