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
//    positive shoelace area (screen coords, y-down) = outline, negative = hole. */

/* ===== 1. OTSU BINARIZE ===== */
// imageData: {width, height, data(RGBA)}. Caller must have composited the
// image over a WHITE canvas first (transparent PNG safety). Returns ink=1 mask.
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
  return mask;
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

/* ===== 7. PIPELINE ===== */
// options: dilateRadius(묶음 거리 1~9), minArea(px²), textSizePx(글자 판정 bbox),
//          epsilon(RDP px), removeGrid(격자 제거).
// Returns { width, height, components: [{ bbox:[x0,y0,x1,y1], area, isText,
//           loops: [{ points:[[x,y],...], isHole }] }] } — 좌표는 이미지 px.
// Within a component outlines come before holes (holes must stack on top).
export function vectorizeImage(imageData, options = {}) {
  const {
    dilateRadius = 3,
    minArea = 25,
    textSizePx = 22,
    epsilon = 1.2,
    removeGrid = false,
  } = options;
  const { width: w, height: h } = imageData;
  let mask = binarize(imageData);
  if (removeGrid) mask = removeGridLines(mask, w, h);
  const grouped = dilate(mask, w, h, dilateRadius);
  const { labels, comps } = connectedComponents(grouped, w, h);

  const components = [];
  for (const c of comps) {
    if (c.area < minArea) continue;
    const [bx0, by0, bx1, by1] = c.bbox;
    const bw = bx1 - bx0, bh = by1 - by0;
    const getInk = (x, y) =>
      x >= 0 && x < w && y >= 0 && y < h && mask[y * w + x] === 1 && labels[y * w + x] === c.label;
    const rawLoops = traceContours(getInk, bx0 - 1, by0 - 1, bx1 + 1, by1 + 1);
    const loops = [];
    for (const raw of rawLoops) {
      const isHole = signedArea(raw) < 0; // orientation BEFORE simplification
      let pts = collinearReduce(raw);
      pts = rdp(pts, epsilon);
      if (pts.length < 3) continue;
      loops.push({ points: pts, isHole });
    }
    if (!loops.length) continue;
    loops.sort((a, b) => (a.isHole ? 1 : 0) - (b.isHole ? 1 : 0));
    const isText = bw < textSizePx && bh < textSizePx && c.area / (bw * bh) > 0.15;
    components.push({ bbox: c.bbox, area: c.area, isText, loops });
  }
  return { width: w, height: h, components };
}
