// Vector drawing geometry for pdf.js pages: primitives, figure regions and ruled tables.
// Every box returned here is [x0, top0, x1, top1] in page points with a top-left origin,
// the same convention as question boxes. Text items keep pdf.js coordinates (bottom-left).

const IDENTITY = [1, 0, 0, 1, 0, 0];
const multiply = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function boundsOf(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

function intersect(a, b) {
  const box = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return box[0] <= box[2] && box[1] <= box[3] ? box : null;
}

// Exact bounds of a cubic Bezier segment (extrema of each coordinate).
function cubicBounds(p0, p1, p2, p3) {
  const points = [p0, p3];
  for (let axis = 0; axis < 2; axis += 1) {
    const a = -p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis];
    const b = 2 * (p0[axis] - 2 * p1[axis] + p2[axis]);
    const c = p1[axis] - p0[axis];
    const roots = [];
    if (Math.abs(a) < 1e-9) { if (Math.abs(b) > 1e-9) roots.push(-c / b); }
    else {
      const d = b * b - 4 * a * c;
      if (d >= 0) roots.push((-b + Math.sqrt(d)) / (2 * a), (-b - Math.sqrt(d)) / (2 * a));
    }
    for (const t of roots) {
      if (t <= 0 || t >= 1) continue;
      const u = 1 - t;
      points.push([0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]));
    }
  }
  return boundsOf(points);
}

const PAINTS = ['stroke', 'closeStroke', 'fill', 'eoFill', 'fillStroke', 'eoFillStroke',
  'closeFillStroke', 'closeEOFillStroke', 'endPath', 'rawFillPath'];

function paintKind(op, OPS) {
  const name = PAINTS.find((key) => OPS[key] === op);
  if (!name || name === 'endPath') return { stroke: false, fill: false };
  return { stroke: /stroke/iu.test(name), fill: /fill/iu.test(name) };
}

function orientation(x0, y0, x1, y1) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  if (dy <= Math.max(0.35, dx * 0.012)) return 'h';
  if (dx <= Math.max(0.35, dy * 0.012)) return 'v';
  return 'd';
}

// Splits DrawOPS path data (pdf.js 6.x: 0 moveTo, 1 lineTo, 2 curveTo, 3 quadraticCurveTo,
// 4 closePath) into subpaths whose points are already in top-left page coordinates.
function subpaths(data, toPage) {
  const result = [];
  let current = null, last = null;
  const begin = (point) => { current = { start: point, segments: [], closed: false }; result.push(current); last = point; };
  for (let i = 0; i < data.length;) {
    const code = data[i++];
    if (code === 0) begin(toPage(data[i++], data[i++]));
    else if (code === 1 || code === 2 || code === 3) {
      const count = code === 1 ? 1 : code === 2 ? 3 : 2;
      const points = [];
      for (let k = 0; k < count; k += 1) points.push(toPage(data[i++], data[i++]));
      if (!current || current.closed) begin(last || points[0]);
      const end = points.at(-1);
      if (code === 1) current.segments.push({ kind: 'line', a: last, b: end });
      else {
        const [c1, c2] = code === 2 ? points : [points[0], points[0]];
        current.segments.push({ kind: 'curve', a: last, c1, c2, b: end });
      }
      last = end;
    } else if (code === 4) {
      if (!current || current.closed) continue;
      if (Math.hypot(last[0] - current.start[0], last[1] - current.start[1]) > 1e-3) {
        current.segments.push({ kind: 'line', a: last, b: current.start });
      }
      current.closed = true;
      last = current.start;
    } else break;
  }
  return result;
}

// Rounded rectangles: axis-aligned sides on the bounds joined by small corner curves. The top
// side may be split to leave room for a title such as <보기>.
function roundedRectOf(subpath) {
  const segments = subpath.segments.filter((s) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) > 1e-3);
  const curves = segments.filter((s) => s.kind === 'curve');
  const lines = segments.filter((s) => s.kind === 'line');
  if (curves.length < 3 || curves.length > 4 || lines.length < 3 || lines.length > 6) return null;
  const box = boundsOf(segments.flatMap((s) => (s.kind === 'line' ? [s.a, s.b] : [s.a, s.b, s.c1, s.c2])));
  const w = box[2] - box[0], h = box[3] - box[1];
  if (w < 16 || h < 10) return null;
  const onEdge = ([x, y]) => Math.abs(x - box[0]) <= 1 || Math.abs(x - box[2]) <= 1 || Math.abs(y - box[1]) <= 1 || Math.abs(y - box[3]) <= 1;
  for (const s of lines) {
    const kind = orientation(s.a[0], s.a[1], s.b[0], s.b[1]);
    if (kind === 'd' || !onEdge(s.a) || !onEdge(s.b)) return null;
    if (kind === 'h' && Math.abs(s.a[1] - box[1]) > 1 && Math.abs(s.a[1] - box[3]) > 1) return null;
    if (kind === 'v' && Math.abs(s.a[0] - box[0]) > 1 && Math.abs(s.a[0] - box[2]) > 1) return null;
  }
  const limit = Math.min(24, Math.min(w, h) / 2 + 0.5);
  for (const s of curves) {
    const b = boundsOf([s.a, s.b, s.c1, s.c2]);
    if (b[2] - b[0] > limit || b[3] - b[1] > limit) return null;
    const nearCorner = [[box[0], box[1]], [box[2], box[1]], [box[0], box[3]], [box[2], box[3]]]
      .some(([x, y]) => Math.abs(x - (b[0] + b[2]) / 2) <= limit && Math.abs(y - (b[1] + b[3]) / 2) <= limit);
    if (!nearCorner) return null;
  }
  return box;
}

function rectangleOf(subpath) {
  const lines = subpath.segments.filter((segment) => Math.hypot(segment.b[0] - segment.a[0], segment.b[1] - segment.a[1]) > 1e-3);
  if (lines.length !== 4 || lines.some((segment) => segment.kind !== 'line')) return null;
  const first = lines[0].a, end = lines[3].b;
  if (Math.hypot(first[0] - end[0], first[1] - end[1]) > 0.05) return null;
  const kinds = lines.map(({ a, b }) => orientation(a[0], a[1], b[0], b[1]));
  if (kinds.some((kind) => kind === 'd') || kinds[0] === kinds[1] || kinds[1] === kinds[2] || kinds[2] === kinds[3]) return null;
  return boundsOf(lines.map((segment) => segment.a));
}

/**
 * Walks a pdf.js operator list and returns visible drawing primitives in top-left page points.
 * Kinds: rect (axis-aligned rectangle), line (straight segment, orient h/v/d), curve (one Bezier
 * segment of a stroked path), fill (filled non-rectangular subpath), image, shading.
 */
export function drawingPrimitives(operations, OPS, pageHeight) {
  const { fnArray, argsArray } = operations;
  let state = { ctm: IDENTITY, clip: null, lineWidth: 1, dash: false, stroke: '#000000', fill: '#000000',
    strokeAlpha: 1, fillAlpha: 1 };
  const stack = [];
  const out = [];
  let pendingClip = false;
  const save = () => { stack.push(state); state = { ...state }; };
  const restore = () => { if (stack.length) state = stack.pop(); };
  const pagePoint = (m) => (x, y) => { const [px, py] = apply(m, x, y); return [px, pageHeight - py]; };
  const scale = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  const clipTo = (box) => (state.clip ? intersect(box, state.clip) : box);
  const narrowClip = (box) => { state.clip = box && (state.clip ? intersect(box, state.clip) || [box[0], box[1], box[0], box[1]] : box); };
  const unitSquare = (m) => { const to = pagePoint(m); return boundsOf([[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => to(x, y))); };
  const image = (m, op, kind = 'image') => {
    const full = unitSquare(m);
    const box = clipTo(full);
    if (box && box[2] - box[0] > 0.01 && box[3] - box[1] > 0.01) {
      out.push({ type: kind === 'solid' ? 'rect' : 'image', box, op, clipped: box !== full && full.some((v, k) => Math.abs(v - box[k]) > 0.5),
        ...(kind === 'solid' ? { paint: 'fill', fill: state.fill, stroke: null, width: 0, dash: false } : { mask: kind === 'mask' }) });
    }
  };
  for (let index = 0; index < fnArray.length; index += 1) {
    const op = fnArray[index], args = argsArray[index];
    switch (op) {
      case OPS.save: save(); break;
      case OPS.restore: restore(); break;
      case OPS.transform: state.ctm = multiply(state.ctm, args); break;
      case OPS.paintFormXObjectBegin: {
        save();
        const [matrix, bbox] = args || [];
        if (matrix) state.ctm = multiply(state.ctm, Array.from(matrix));
        if (bbox) {
          const to = pagePoint(state.ctm);
          narrowClip(boundsOf([[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[0], bbox[3]], [bbox[2], bbox[3]]].map(([x, y]) => to(x, y))));
        }
        break;
      }
      case OPS.paintFormXObjectEnd: restore(); break;
      case OPS.beginGroup: {
        save();
        const group = args?.[0];
        if (group?.bbox) {
          const to = pagePoint(group.matrix ? multiply(state.ctm, Array.from(group.matrix)) : state.ctm);
          const b = group.bbox;
          narrowClip(boundsOf([[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]].map(([x, y]) => to(x, y))));
        }
        break;
      }
      case OPS.endGroup: restore(); break;
      case OPS.beginAnnotation: {
        save();
        const [, , transform, matrix] = args || [];
        state.ctm = multiply(multiply(IDENTITY, transform || IDENTITY), matrix || IDENTITY);
        break;
      }
      case OPS.endAnnotation: restore(); break;
      case OPS.setLineWidth: state.lineWidth = args[0]; break;
      case OPS.setDash: state.dash = Array.isArray(args[0]) ? args[0].length > 0 : !!args[0]?.length; break;
      case OPS.setStrokeRGBColor: state.stroke = args[0]; break;
      case OPS.setFillRGBColor: state.fill = args[0]; break;
      case OPS.setStrokeTransparent: state.stroke = 'transparent'; break;
      case OPS.setFillTransparent: state.fill = 'transparent'; break;
      case OPS.setStrokeColorN: state.stroke = 'pattern'; break;
      case OPS.setFillColorN: state.fill = 'pattern'; break;
      case OPS.setGState:
        for (const [key, value] of args[0] || []) {
          if (key === 'LW') state.lineWidth = value;
          else if (key === 'D') state.dash = Array.isArray(value?.[0]) && value[0].length > 0;
          else if (key === 'CA') state.strokeAlpha = value;
          else if (key === 'ca') state.fillAlpha = value;
        }
        break;
      case OPS.clip: case OPS.eoClip: pendingClip = true; break;
      case OPS.paintImageXObject: case OPS.paintInlineImageXObject: image(state.ctm, index); break;
      case OPS.paintImageMaskXObject: image(state.ctm, index, 'mask'); break;
      case OPS.paintSolidColorImageMask: image(state.ctm, index, 'solid'); break;
      case OPS.paintImageXObjectRepeat: {
        const [, scaleX, scaleY, positions] = args;
        for (let k = 0; k < positions.length; k += 2) image(multiply(state.ctm, [scaleX, 0, 0, scaleY, positions[k], positions[k + 1]]), index);
        break;
      }
      case OPS.paintImageMaskXObjectRepeat: {
        const [, scaleX, skewX, skewY, scaleY, positions] = args;
        for (let k = 0; k < positions.length; k += 2) image(multiply(state.ctm, [scaleX, skewX, skewY, scaleY, positions[k], positions[k + 1]]), index, 'mask');
        break;
      }
      case OPS.paintImageMaskXObjectGroup:
        for (const entry of args[0] || []) image(multiply(state.ctm, entry.transform), index, 'mask');
        break;
      case OPS.paintInlineImageXObjectGroup:
        for (const entry of args[1] || []) image(multiply(state.ctm, entry.transform), index);
        break;
      case OPS.shadingFill: {
        const box = state.clip || [0, 0, Infinity, Infinity];
        if (box[2] - box[0] > 0.01 && box[3] - box[1] > 0.01 && Number.isFinite(box[2])) out.push({ type: 'shading', box, op: index });
        break;
      }
      case OPS.constructPath: {
        const [paintOp, [data] = [], minMax] = args;
        if (!data || !data.length) { pendingClip = false; break; }
        const to = pagePoint(state.ctm);
        const paths = subpaths(data, to);
        if (pendingClip) {
          const points = paths.flatMap((path) => [path.start, ...path.segments.flatMap((s) => [s.a, s.b])]);
          if (points.length) narrowClip(boundsOf(points));
          pendingClip = false;
        }
        const kind = paintKind(paintOp, OPS);
        const stroke = kind.stroke && state.stroke !== 'transparent' && state.strokeAlpha > 0 ? state.stroke : null;
        const fill = kind.fill && state.fill !== 'transparent' && state.fillAlpha > 0 ? state.fill : null;
        if (!stroke && !fill) break;
        const paint = stroke && fill ? 'fillStroke' : stroke ? 'stroke' : 'fill';
        const common = { paint, stroke, fill, width: state.lineWidth * scale(state.ctm), dash: state.dash, op: index };
        const clip = state.clip;
        const visible = (box) => !clip || intersect(box, clip);
        // Only the part inside the clip rectangle is painted (Liang-Barsky for straight segments).
        const clipSegment = (a, b) => {
          if (!clip) return [a, b];
          let t0 = 0, t1 = 1;
          const dx = b[0] - a[0], dy = b[1] - a[1];
          for (const [p, q] of [[-dx, a[0] - clip[0]], [dx, clip[2] - a[0]], [-dy, a[1] - clip[1]], [dy, clip[3] - a[1]]]) {
            if (Math.abs(p) < 1e-9) { if (q < -1e-6) return null; continue; }
            const t = q / p;
            if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
          }
          return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]];
        };
        const clipBox = (box) => (clip ? intersect(box, clip) : box);
        for (const path of paths) {
          if (!path.segments.length) continue;
          const rect = rectangleOf(path);
          if (rect) {
            const box = clipBox(rect);
            if (box) out.push({ type: 'rect', box, ...common, clipped: box.some((v, k) => Math.abs(v - rect[k]) > 0.5) });
            continue;
          }
          const rounded = roundedRectOf(path);
          if (rounded) {
            const box = clipBox(rounded);
            if (box) out.push({ type: 'rect', rounded: true, box, ...common, clipped: box.some((v, k) => Math.abs(v - rounded[k]) > 0.5) });
            continue;
          }
          const boxes = path.segments.map((s) => s.kind === 'line' ? boundsOf([s.a, s.b]) : cubicBounds(s.a, s.c1, s.c2, s.b));
          if (fill) {
            const box = clipBox(boundsOf(boxes.flatMap((b) => [[b[0], b[1]], [b[2], b[3]]])));
            if (box) out.push({ type: 'fill', box, curved: path.segments.some((s) => s.kind === 'curve'),
              closed: true, points: path.segments.length, ...common, paint: 'fill', stroke: null });
          }
          if (!stroke) continue;
          path.segments.forEach((segment, k) => {
            const box = boxes[k];
            if (box[2] - box[0] < 0.01 && box[3] - box[1] < 0.01) return;
            if (!visible(box)) return;
            if (segment.kind === 'line') {
              const ends = clipSegment(segment.a, segment.b);
              if (!ends) return;
              const [[x0, y0], [x1, y1]] = ends;
              if (Math.hypot(x1 - x0, y1 - y0) < 0.01) return;
              out.push({ type: 'line', box: boundsOf(ends), x0, y0, x1, y1, orient: orientation(x0, y0, x1, y1), ...common, paint: 'stroke', fill: null });
            } else {
              const shown = clipBox(box);
              if (shown) out.push({ type: 'curve', box: shown, ...common, paint: 'stroke', fill: null });
            }
          });
        }
        void minMax;
        break;
      }
      default: break;
    }
  }
  return out;
}


// ---------------------------------------------------------------------------------------------
// Text geometry

const HANGUL = /[\uAC00-\uD7A3]/gu;
const LATIN = /[A-Za-z]/gu;
const CHOICE = /[①②③④⑤]/u;
const POINTS = /\[\s*\d\s*점|점\s*\]/u;
const BOGI_LABEL = /보\s*기/u;
const BOGI_ITEM = /^\s*[ㄱ-ㅎ]\s*\./u;
const QUESTION_NUMBER = /^\s*\d{1,2}\s*\.(?!\d)/u;
const SENTENCE_END = /(?:[\uAC00-\uD7A3]\s*[.!?。]|[?？!])\s*["'”’)\]』」]*\s*(?:\[\s*\d\s*점\s*\])?\s*$/u;
const ENGLISH_END = /[A-Za-z]{2,}\s*[.!?]["'”’)]*\s*$/u;
const HEADING = /^\s*[\[〔<〈《【［].{2,}[\]〕>〉》】］]\s*$/u;
const CAPTION = /^\s*[(（]\s*[가-하]\s*[)）]\s*$/u;
const NAMED_CAPTION = /^\s*[(（]\s*[가-하]\s*[)）]\s*[\p{L}\p{N}]/u;

/** Top-left box of a pdf.js text item. Rotated items get the bounds of their rotated box. */
export function textItemBox(item, pageHeight) {
  const t = item.transform;
  const size = Math.abs(item.height) || Math.hypot(t[2], t[3]) || Math.hypot(t[0], t[1]) || 1;
  const width = Math.abs(item.width) || 0;
  const angle = Math.atan2(t[1], t[0]);
  if (Math.abs(angle) < 0.05) {
    const base = pageHeight - t[5];
    return { box: [t[4], base - size * 0.85, t[4] + width, base + size * 0.2], size, base, rotated: false };
  }
  const c = Math.cos(angle), s = Math.sin(angle);
  const corners = [[0, -0.2 * size], [width, -0.2 * size], [0, 0.85 * size], [width, 0.85 * size]]
    .map(([u, v]) => [t[4] + u * c - v * s, pageHeight - (t[5] + u * s + v * c)]);
  return { box: boundsOf(corners), size, base: pageHeight - t[5], rotated: true };
}

const keyOf = (item) => item.str + '|' + item.transform[4].toFixed(1) + '|' + item.transform[5].toFixed(1);
const count = (text, pattern) => (text.match(pattern) || []).length;
const area = (b) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
const overlapArea = (a, b) => { const i = intersect(a, b); return i ? area(i) : 0; };
const center = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
const contains = (b, [x, y], pad = 0) => x >= b[0] - pad && x <= b[2] + pad && y >= b[1] - pad && y <= b[3] + pad;
const gapBetween = (a, b) => Math.hypot(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));
const union = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

function prepareTexts(textItems, pageHeight) {
  const texts = [];
  for (const item of textItems || []) {
    if (!item || typeof item.str !== 'string' || !item.str.trim() || !item.transform) continue;
    texts.push({ item, str: item.str, ...textItemBox(item, pageHeight) });
  }
  return texts;
}

// The dominant font size of running text, weighted by letters.
function bodySizeOf(texts) {
  const weights = new Map();
  for (const text of texts) {
    if (text.rotated) continue;
    const letters = count(text.str, HANGUL) + count(text.str, LATIN) * 0.5;
    if (letters < 2) continue;
    const key = Math.round(text.size * 2) / 2;
    weights.set(key, (weights.get(key) || 0) + letters);
  }
  let best = 10, weight = -1;
  for (const [size, value] of weights) if (value > weight) { best = size; weight = value; }
  return best;
}

// Joins text items into visual line fragments: same row and horizontally adjacent.
function buildChains(texts) {
  const order = texts.map((_, i) => i).sort((a, b) => texts[a].box[1] - texts[b].box[1]);
  const parent = texts.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let p = 0; p < order.length; p += 1) {
    const a = texts[order[p]];
    if (a.rotated) continue;
    for (let q = p + 1; q < order.length; q += 1) {
      const b = texts[order[q]];
      if (b.box[1] > a.box[3]) break;
      if (b.rotated) continue;
      const overlap = Math.min(a.box[3], b.box[3]) - Math.max(a.box[1], b.box[1]);
      if (overlap < 0.4 * Math.min(a.box[3] - a.box[1], b.box[3] - b.box[1])) continue;
      const gap = Math.max(a.box[0], b.box[0]) - Math.min(a.box[2], b.box[2]);
      const sameSize = Math.abs(a.size - b.size) <= 0.1 * Math.max(a.size, b.size);
      if (gap > Math.max(4, (sameSize ? 1.6 : 1) * Math.max(a.size, b.size))) continue;
      parent[find(order[p])] = find(order[q]);
    }
  }
  const groups = new Map();
  texts.forEach((text, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(text);
  });
  return [...groups.values()].map((members) => {
    members.sort((a, b) => a.box[0] - b.box[0]);
    let str = '';
    members.forEach((member, k) => {
      const previous = members[k - 1];
      str += previous && member.box[0] - previous.box[2] > 0.25 * member.size ? ' ' + member.str : member.str;
    });
    const box = members.map((m) => m.box).reduce(union);
    const size = Math.max(...members.map((m) => m.size));
    return { members, str, box, size, rotated: members.every((m) => m.rotated),
      hangul: count(str, HANGUL), latin: count(str, LATIN), words: str.trim().split(/\s+/u).length,
      chars: str.replace(/\s+/gu, '').length, protected: false };
  });
}

// Running text, 보기 items, choices and headings. These are never figure labels.
function protectChains(chains, bodySize) {
  const rule = (chain) => {
    const text = chain.str;
    if (CHOICE.test(text) || POINTS.test(text) || BOGI_LABEL.test(text) || BOGI_ITEM.test(text)) return true;
    if (QUESTION_NUMBER.test(text) && chain.size >= bodySize * 0.95) return true;
    if (SENTENCE_END.test(text) && chain.hangul >= 2) return true;
    if (ENGLISH_END.test(text) && chain.words >= 3) return true;
    if (HEADING.test(text) && chain.hangul >= 2) return true;
    if (chain.hangul >= 12 || (chain.hangul >= 6 && chain.size >= bodySize * 0.9)) return true;
    return chain.latin >= 24 || chain.words >= 6;
  };
  for (const chain of chains) chain.protected = rule(chain);
  // Small print set as a paragraph (dialogue in speech bubbles, notes in pictures): two or more
  // lines of Hangul phrases with one left edge, one size and a regular line pitch.
  const phrase = (chain) => !chain.rotated && (chain.protected || chain.hangul >= 6);
  const lines = chains.filter(phrase).sort((a, b) => a.box[1] - b.box[1]);
  const uf = new UnionFind(lines.length);
  for (let i = 0; i < lines.length; i += 1) for (let j = i + 1; j < lines.length; j += 1) {
    const a = lines[i], b = lines[j];
    const pitch = b.box[1] - a.box[1];
    if (pitch > 2.1 * a.size) break;
    if (pitch < 0.85 * a.size || Math.abs(a.size - b.size) > 0.08 * a.size || Math.abs(a.box[0] - b.box[0]) > 2.5) continue;
    uf.join(i, j);
  }
  const blocks = new Map();
  lines.forEach((chain, i) => { const root = uf.find(i); if (!blocks.has(root)) blocks.set(root, []); blocks.get(root).push(chain); });
  for (const block of blocks.values()) {
    if (block.length < 2 || block.reduce((sum, c) => sum + c.hangul, 0) < 14) continue;
    for (const chain of block) chain.protected = true;
  }
  // Short last lines of a paragraph share its left edge, size and line pitch.
  for (let round = 0; round < 4; round += 1) {
    let changed = false;
    for (const chain of chains) {
      if (chain.protected || chain.rotated || Math.abs(chain.size - bodySize) > bodySize * 0.1) continue;
      const neighbour = chains.find((other) => other.protected && other !== chain
        && Math.abs(other.size - chain.size) <= chain.size * 0.1
        && Math.abs(other.box[0] - chain.box[0]) <= 3
        && Math.abs(other.box[1] - chain.box[1]) >= chain.size * 0.8
        && Math.abs(other.box[1] - chain.box[1]) <= chain.size * 2.4);
      if (neighbour) { chain.protected = true; changed = true; }
    }
    if (!changed) break;
  }
}

// ---------------------------------------------------------------------------------------------
// Ruled lines: tables and frames

function mergeSegments(list) {
  list.sort((p, q) => p.at - q.at || p.a - q.a);
  const groups = [];
  for (const seg of list) {
    const group = groups.at(-1);
    if (group && Math.abs(seg.at - group.at) <= 0.8) {
      group.items.push(seg);
      group.sum += seg.at;
      group.at = group.sum / group.items.length;
    } else groups.push({ at: seg.at, sum: seg.at, items: [seg] });
  }
  const merged = [];
  for (const group of groups) {
    let current = null;
    for (const seg of group.items.sort((p, q) => p.a - q.a)) {
      if (current && seg.a <= current.b + 1.2) {
        current.b = Math.max(current.b, seg.b);
        current.prims.push(seg.prim);
      } else {
        current = { at: group.at, a: seg.a, b: seg.b, prims: [seg.prim] };
        merged.push(current);
      }
    }
  }
  return merged;
}

// Horizontal and vertical ruling segments (lines, thin bars and stroked rectangle edges).
function rulings(prims, minLength = 4) {
  const h = [], v = [];
  for (const p of prims) {
    if (p.type === 'line' && p.orient !== 'd') {
      if (p.orient === 'h') h.push({ at: (p.y0 + p.y1) / 2, a: Math.min(p.x0, p.x1), b: Math.max(p.x0, p.x1), prim: p });
      else v.push({ at: (p.x0 + p.x1) / 2, a: Math.min(p.y0, p.y1), b: Math.max(p.y0, p.y1), prim: p });
    } else if (p.type === 'rect' && !p.rounded) {
      const [x0, y0, x1, y1] = p.box;
      if (y1 - y0 <= 1.6 && x1 - x0 > y1 - y0) h.push({ at: (y0 + y1) / 2, a: x0, b: x1, prim: p });
      else if (x1 - x0 <= 1.6 && y1 - y0 > x1 - x0) v.push({ at: (x0 + x1) / 2, a: y0, b: y1, prim: p });
      else if (p.stroke) {
        h.push({ at: y0, a: x0, b: x1, prim: p }, { at: y1, a: x0, b: x1, prim: p });
        v.push({ at: x0, a: y0, b: y1, prim: p }, { at: x1, a: y0, b: y1, prim: p });
      }
    }
  }
  const long = (s) => s.b - s.a >= minLength;
  return { h: mergeSegments(h.filter(long)), v: mergeSegments(v.filter(long)) };
}

function coverage(segments, at, from, to, tol = 1.5) {
  if (to - from <= 0) return 0;
  const parts = segments.filter((s) => Math.abs(s.at - at) <= tol && s.b > from && s.a < to)
    .map((s) => [Math.max(s.a, from), Math.min(s.b, to)]).sort((p, q) => p[0] - q[0]);
  let covered = 0, end = -Infinity;
  for (const [a, b] of parts) {
    if (b <= end) continue;
    covered += b - Math.max(a, end);
    end = b;
  }
  return covered / (to - from);
}

function clusterValues(values, tol) {
  const sorted = [...values].sort((a, b) => a - b);
  const out = [];
  for (const value of sorted) {
    const last = out.at(-1);
    if (last && value - last.max <= tol) { last.max = value; last.sum += value; last.n += 1; }
    else out.push({ max: value, sum: value, n: 1 });
  }
  return out.map((c) => c.sum / c.n);
}

class UnionFind {
  constructor(n) { this.parent = Array.from({ length: n }, (_, i) => i); }
  find(i) { while (this.parent[i] !== i) { this.parent[i] = this.parent[this.parent[i]]; i = this.parent[i]; } return i; }
  join(a, b) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.parent[ra] = rb; }
}

// Connected sets of horizontal and vertical rulings that touch each other.
function ruledComponents(h, v) {
  const uf = new UnionFind(h.length + v.length);
  const byX = v.map((s, i) => ({ s, i })).sort((p, q) => p.s.at - q.s.at);
  for (let i = 0; i < h.length; i += 1) {
    const hs = h[i];
    let lo = 0, hi = byX.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (byX[mid].s.at < hs.a - 1.5) lo = mid + 1; else hi = mid; }
    for (let k = lo; k < byX.length && byX[k].s.at <= hs.b + 1.5; k += 1) {
      const vs = byX[k].s;
      if (hs.at >= vs.a - 1.5 && hs.at <= vs.b + 1.5) uf.join(i, h.length + byX[k].i);
    }
  }
  const groups = new Map();
  for (let i = 0; i < h.length + v.length; i += 1) {
    const root = uf.find(i);
    if (!groups.has(root)) groups.set(root, { h: [], v: [] });
    if (i < h.length) groups.get(root).h.push(h[i]);
    else groups.get(root).v.push(v[i - h.length]);
  }
  return [...groups.values()].filter((g) => g.h.length >= 2 && g.v.length >= 2).map((g) => {
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const s of g.v) { box[0] = Math.min(box[0], s.at); box[2] = Math.max(box[2], s.at); box[1] = Math.min(box[1], s.a); box[3] = Math.max(box[3], s.b); }
    for (const s of g.h) { box[1] = Math.min(box[1], s.at); box[3] = Math.max(box[3], s.at); box[0] = Math.min(box[0], s.a); box[2] = Math.max(box[2], s.b); }
    return { ...g, box, xs: clusterValues(g.v.map((s) => s.at), 1.2), ys: clusterValues(g.h.map((s) => s.at), 1.2) };
  });
}

const isWhite = (color) => typeof color === 'string' && /^#(?:f[a-f\d]){3}$/iu.test(color);
const maxDim = (b) => Math.max(b[2] - b[0], b[3] - b[1]);

// Figure-like ink: pictures, curves, slanted lines, polygons and shadings.
function figureInk(p) {
  if (p.type === 'image' || p.type === 'curve' || p.type === 'shading') return true;
  if (p.type === 'line') return p.orient === 'd';
  if (p.type === 'fill') return !isWhite(p.fill);
  return false;
}

function slashOfGrid(p, xs, ys) {
  if (p.type !== 'line' || p.orient !== 'd') return false;
  const near = (x, y) => xs.some((gx) => Math.abs(gx - x) <= 2) && ys.some((gy) => Math.abs(gy - y) <= 2);
  return near(p.x0, p.y0) && near(p.x1, p.y1);
}

// ---------------------------------------------------------------------------------------------
// Page analysis shared by figureRegions and tableGrids

function locateIndex(values, value) {
  for (let i = 0; i < values.length - 1; i += 1) if (value >= values[i] - 0.5 && value <= values[i + 1] + 0.5) return i;
  return -1;
}

// Strong ink is what diagrams are made of; weak ink (axis-aligned rules and plain boxes) only
// joins a figure that strong ink already established.
function inkStrength(p) {
  if (p.type === 'image' || p.type === 'shading' || p.type === 'curve') return 'strong';
  if (p.type === 'line') return p.orient === 'd' ? 'strong' : 'weak';
  if (p.type === 'fill') return isWhite(p.fill) ? null : 'strong';
  if (p.type === 'rect') return p.fill && !isWhite(p.fill) && p.fill !== 'pattern' ? 'strong' : p.stroke ? 'weak' : null;
  return null;
}

// Fills whose edges sit on grid lines are cell shading (header rows, highlighted cells).
function alignedWithGrid(p, xs, ys, tol = 2.5) {
  if (p.type !== 'rect' && p.type !== 'fill') return false;
  const on = (value, lines) => lines.some((at) => Math.abs(at - value) <= tol);
  return on(p.box[0], xs) && on(p.box[2], xs) && on(p.box[1], ys) && on(p.box[3], ys);
}

function spansCells(box, xs, ys) {
  const crosses = (lines, lo, hi) => lines.slice(1, -1).some((at) => lo < at - 2 && hi > at + 2);
  return crosses(xs, box[0], box[2]) || crosses(ys, box[1], box[3]);
}

// Share of a component's cells that hold non-running text, and the chains inside it.
function cellFill(component, chains) {
  const { xs, ys, box } = component;
  const inner = [box[0] + 1, box[1] + 1, box[2] - 1, box[3] - 1];
  const inside = chains.filter((chain) => contains(inner, center(chain.box)));
  const cells = Math.max(1, (xs.length - 1) * (ys.length - 1));
  const filled = new Set();
  for (const chain of inside) {
    const [cx, cy] = center(chain.box);
    const col = locateIndex(xs, cx), row = locateIndex(ys, cy);
    if (col >= 0 && row >= 0) filled.add(row * xs.length + col);
  }
  return { inside, filled: filled.size, share: filled.size / cells, cells };
}

function analyse(primitives, textItems, pageHeight) {
  const texts = prepareTexts(textItems, pageHeight);
  const bodySize = bodySizeOf(texts);
  const chains = buildChains(texts);
  protectChains(chains, bodySize);
  const protectedCenters = chains.filter((c) => c.protected).flatMap((c) => c.members.map((m) => center(m.box)));
  const hasProtected = (box, pad = 0) => protectedCenters.some((point) => contains(box, point, pad));
  let pageWidth = pageHeight * 0.7;
  for (const p of primitives) if (Number.isFinite(p.box[2]) && p.box[2] < pageHeight * 1.2 && p.box[2] > pageWidth) pageWidth = p.box[2];
  const structural = new Set();
  const containers = [];
  // Page furniture: column rules and full-width header or footer rules.
  for (const p of primitives) {
    const w = p.box[2] - p.box[0], h = p.box[3] - p.box[1];
    if ((p.type === 'line' || p.type === 'rect') && h > pageHeight * 0.4 && w < 3) structural.add(p);
    if ((p.type === 'line' || p.type === 'rect') && w > pageWidth * 0.55 && h < 3) structural.add(p);
  }
  const live = primitives.filter((p) => !structural.has(p));
  // Backgrounds: shading, pictures or fills behind running text.
  for (const p of live) {
    if (!['fill', 'shading', 'image', 'rect'].includes(p.type)) continue;
    if (p.type === 'rect' && !(p.fill && !isWhite(p.fill))) continue;
    if (area(p.box) < 150 || !hasProtected(p.box, -0.5)) continue;
    structural.add(p);
    if (area(p.box) >= 900) containers.push({ box: p.box, kind: 'background' });
  }
  // A single curved stroked path around running text is a frame (speech bubbles, memo paper with
  // a wavy edge, scrolls). Straight-edged paths are left to the ruling analysis below so that
  // tables drawn as one path are still found.
  const paths = new Map();
  for (const p of live) {
    if (structural.has(p) || (p.type !== 'line' && p.type !== 'curve')) continue;
    const entry = paths.get(p.op);
    if (entry) { entry.box = union(entry.box, p.box); entry.prims.push(p); }
    else paths.set(p.op, { box: p.box, prims: [p] });
  }
  for (const { box, prims } of paths.values()) {
    if (prims.length < 3 || area(box) < 900 || !prims.some((p) => p.type === 'curve') || !hasProtected(box, -1)) continue;
    for (const p of prims) structural.add(p);
    containers.push({ box, kind: 'frame' });
  }
  const { h, v } = rulings(live.filter((p) => !structural.has(p)));
  const components = ruledComponents(h, v);
  const strongInk = live.filter((p) => !structural.has(p) && inkStrength(p) === 'strong');
  const tables = [];
  // Text joined across a vertical rule belongs to two cells.
  const splitAt = (chain, xs) => {
    const parts = [];
    let current = [];
    for (const member of chain.members) {
      const previous = current.at(-1);
      if (previous && xs.some((x) => previous.box[2] <= x + 1 && member.box[0] >= x - 1)) { parts.push(current); current = []; }
      current.push(member);
    }
    parts.push(current);
    return parts.length === 1 ? [chain] : parts.map((members) => ({ ...chain, members, box: members.map((m) => m.box).reduce(union),
      str: members.map((m) => m.str).join(' ') }));
  };
  for (const component of components) {
    const { xs, ys, box } = component;
    const inner = [box[0] + 1, box[1] + 1, box[2] - 1, box[3] - 1];
    const own = new Set([...component.h, ...component.v].flatMap((s) => s.prims));
    const big = strongInk.filter((p) => !own.has(p) && contains(inner, center(p.box))
      && (p.type === 'image' || p.type === 'shading' || maxDim(p.box) > 14) && !slashOfGrid(p, xs, ys)
      && !alignedWithGrid(p, xs, ys));
    const shading = strongInk.filter((p) => !own.has(p) && contains(inner, center(p.box)) && alignedWithGrid(p, xs, ys));
    // Plots draw their data across the grid lines.
    if (big.some((p) => spansCells(p.box, xs, ys))) continue;
    const fill = cellFill(component, chains.flatMap((chain) => contains(box, center(chain.box)) ? splitAt(chain, xs) : [chain]));
    const grid = xs.length >= 3 && ys.length >= 3 && fill.filled >= 2 && fill.share >= 0.25;
    // A frame holds running text; a grid holds text in its cells. Anything else is drawing.
    if (!hasProtected(box, -0.5) && !grid) continue;
    for (const p of own) structural.add(p);
    for (const p of shading) structural.add(p);
    containers.push({ box, kind: 'frame' });
    if (xs.length > 2 || ys.length > 2) {
      for (let i = 0; i < xs.length - 1; i += 1) for (let j = 0; j < ys.length - 1; j += 1) {
        containers.push({ box: [xs[i], ys[j], xs[i + 1], ys[j + 1]], kind: 'cell' });
      }
    }
    if (big.length || fill.inside.length < 2 || fill.filled < 2 || fill.share < 0.25) continue;
    tables.push({ box, xs, ys, component, chains: fill.inside, own });
  }
  // Rounded frames are single paths; they are frames when they hold running text.
  for (const p of live) {
    if (p.type !== 'rect' || !p.rounded || structural.has(p)) continue;
    if (hasProtected(p.box, -0.5)) { structural.add(p); containers.push({ box: p.box, kind: 'frame' }); }
  }
  for (const chain of chains) {
    chain.table = tables.some((table) => contains(table.box, center(chain.box), -0.5));
  }
  return { texts, chains, bodySize, structural, containers, tables, hasProtected, pageWidth };
}

function innermost(containers, point) {
  let best = null;
  for (const container of containers) {
    if (!contains(container.box, point, 0.5)) continue;
    if (!best || area(container.box) < area(best.box)) best = container;
  }
  return best;
}

// Buckets boxes on a coarse grid so that clustering stays linear on hatched maps.
function clusterBoxes(items, gap) {
  const size = 24;
  const buckets = new Map();
  const uf = new UnionFind(items.length);
  items.forEach((item, index) => {
    const b = item.box;
    const gx0 = Math.floor((b[0] - gap) / size), gx1 = Math.floor((b[2] + gap) / size);
    const gy0 = Math.floor((b[1] - gap) / size), gy1 = Math.floor((b[3] + gap) / size);
    for (let gx = gx0; gx <= gx1; gx += 1) for (let gy = gy0; gy <= gy1; gy += 1) {
      const key = gx * 100003 + gy;
      const list = buckets.get(key);
      if (!list) { buckets.set(key, [index]); continue; }
      for (const other of list) {
        if (uf.find(other) === uf.find(index)) continue;
        if (gapBetween(b, items[other].box) <= gap) uf.join(other, index);
      }
      list.push(index);
    }
  });
  const groups = new Map();
  items.forEach((item, index) => {
    const root = uf.find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(item);
  });
  return [...groups.values()];
}

/**
 * Boxes of figures, graphs, diagrams and pictures. Frames, text backgrounds, choice boxes,
 * the column rule and ruled tables are never figures. Each region lists the text items that
 * are its labels (see insideFigure); text that reads as running text is never a label.
 */
export function figureRegions(primitives, textItems, pageHeight) {
  const page = analyse(primitives, textItems, pageHeight);
  const { chains, bodySize, structural, containers, tables } = page;
  const ink = [];
  // Old papers draw halftones and even glyphs as thousands of hair-line specks; one ink item
  // per 3-point cell keeps clustering linear without changing what the specks connect.
  const dust = new Map();
  for (const p of primitives) {
    if (structural.has(p) || !Number.isFinite(p.box[2])) continue;
    const strength = inkStrength(p);
    if (!strength) continue;
    if (p.type === 'image' && maxDim(p.box) < 6) continue;
    if (tables.some((table) => contains(table.box, center(p.box), -0.5))) continue;
    // Hair-line strokes are glyph outlines: some old papers draw every letter as vector paths.
    if ((p.type === 'line' || p.type === 'curve') && p.width < 0.15) continue;
    if (p.type === 'line' && maxDim(p.box) < 2.5) {
      const [cx, cy] = center(p.box);
      const key = Math.floor(cx / 3) * 100003 + Math.floor(cy / 3);
      const cell = dust.get(key);
      if (cell) { cell.box = union(cell.box, p.box); cell.strong ||= strength === 'strong'; cell.n += 1; }
      else dust.set(key, { prim: p, box: p.box, strong: strength === 'strong', n: 1 });
      continue;
    }
    ink.push({ prim: p, box: p.box, strong: strength === 'strong' });
  }
  for (const cell of dust.values()) ink.push(cell);
  const clusters = clusterBoxes(ink, 3.5);
  const regions = [];
  for (const members of clusters) {
    const strong = members.filter((m) => m.strong);
    if (!strong.length) continue;
    const box = members.map((m) => m.box).reduce(union);
    const w = box[2] - box[0], hgt = box[3] - box[1];
    const images = strong.filter((m) => m.prim.type === 'image' && m.box[2] - m.box[0] >= 16 && m.box[3] - m.box[1] >= 6);
    const inlineImage = images.length && hgt <= bodySize * 2.6 && chains.some((c) => c.protected
      && Math.min(c.box[3], box[3]) - Math.max(c.box[1], box[1]) > hgt * 0.5 && gapBetween(c.box, box) < bodySize * 1.5);
    const vector = strong.length >= 3 && w >= 18 && hgt >= 12 && w * hgt >= 500;
    if (!(images.length && !inlineImage) && !vector) continue;
    regions.push({ box, ink: box, kind: images.length ? 'image' : 'vector', members });
  }
  // Pictures with drawn overlays or several panels that touch form one figure.
  for (let changed = true; changed;) {
    changed = false;
    outer: for (let i = 0; i < regions.length; i += 1) for (let j = i + 1; j < regions.length; j += 1) {
      if (overlapArea(regions[i].box, regions[j].box) > 0.3 * Math.min(area(regions[i].box), area(regions[j].box))) {
        regions[i] = { box: union(regions[i].box, regions[j].box), ink: union(regions[i].ink, regions[j].ink),
          kind: regions[i].kind === 'image' || regions[j].kind === 'image' ? 'image' : 'vector', members: [...regions[i].members, ...regions[j].members] };
        regions.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }
  const protectedChains = chains.filter((c) => c.protected);
  // Text right beside, above or below running text belongs to it (fragments, fraction parts).
  const attached = (chain) => protectedChains.some((p) => {
    const vgap = Math.max(0, chain.box[1] - p.box[3], p.box[1] - chain.box[3]);
    const hgap = Math.max(0, chain.box[0] - p.box[2], p.box[0] - chain.box[2]);
    return (vgap <= 0 && hgap <= 1.5 * chain.size) || (vgap <= 0.5 * chain.size && hgap <= 0);
  });
  // On pages whose running text is drawn as outlines, the stem shows up only as its Latin
  // fragments; a fragment repeated far from every figure (such as "B 0" of B₀ in the stem and
  // the choices) is prose wherever it appears.
  const words = chains.reduce((sum, c) => sum + c.hangul, 0);
  const outlinePage = words < 12 * Math.max(1, regions.length);
  const far = (chain) => regions.every((region) => gapBetween(region.ink, chain.box) > 30);
  const prose = new Set(outlinePage ? chains.filter((c) => !c.protected && far(c)).map((c) => c.str.replace(/\s+/gu, '')) : []);
  const taken = new Set();
  const out = [];
  for (const region of regions) {
    const home = innermost(containers, center(region.ink));
    const sameHome = (chain) => innermost(containers, center(chain.box)) === home;
    const nearInk = (b, d) => region.members.some((m) => gapBetween(m.box, b) <= d);
    const labels = [];
    const candidates = chains.filter((c) => !c.protected && !c.table && !taken.has(c) && sameHome(c)
      && !prose.has(c.str.replace(/\s+/gu, '')));
    const small = (chain) => chain.size <= bodySize * 0.85;
    for (const chain of candidates) {
      if (!contains(region.ink, center(chain.box), 1)) continue;
      if (chain.chars <= 12 || small(chain) || nearInk(chain.box, 10)) labels.push(chain);
    }
    // Labels just outside the drawing: close to its ink, or (small print only) close to another label.
    let reach = labels.filter(small).map((c) => c.box);
    // Outside the ink only letters and numbers count: stray punctuation belongs to nearby prose.
    // A caption that names its panel, such as "(가) 마이산 역암", carries content and is kept.
    const outside = candidates.filter((c) => !labels.includes(c) && (c.chars <= 8 || small(c)) && !attached(c)
      && /[\p{L}\p{N}]/u.test(c.str) && !NAMED_CAPTION.test(c.str));
    for (const chain of outside) {
      const margin = Math.min(10, Math.max(4, chain.size * 0.9));
      if (nearInk(chain.box, margin)) labels.push(chain);
    }
    reach.push(...labels.filter((c) => small(c) && !reach.includes(c.box)).map((c) => c.box));
    for (let round = 0; round < 4 && reach.length; round += 1) {
      const added = outside.filter((c) => small(c) && !labels.includes(c)
        && reach.some((b) => gapBetween(b, c.box) <= Math.min(10, Math.max(4, c.size * 0.9))));
      labels.push(...added);
      reach = added.map((c) => c.box);
    }
    // Panel captions such as (가) centred just below the drawing.
    let box = labels.map((c) => c.box).reduce(union, region.ink);
    for (const chain of candidates) {
      if (labels.includes(chain) || !CAPTION.test(chain.str)) continue;
      const [cx] = center(chain.box);
      const below = chain.box[1] - box[3];
      if (cx < box[0] || cx > box[2] || below < -2 || below > Math.max(16, bodySize * 1.6)) continue;
      const row = protectedChains.some((p) => Math.min(p.box[3], chain.box[3]) - Math.max(p.box[1], chain.box[1]) > 0
        && p.box[2] > box[0] - 20 && p.box[0] < box[2] + 20);
      if (!row) labels.push(chain);
    }
    for (const chain of labels) taken.add(chain);
    box = labels.map((c) => c.box).reduce(union, region.ink);
    out.push({ box, ink: region.ink, kind: region.kind,
      labels: labels.flatMap((c) => c.members.map((m) => keyOf(m.item))),
      labelBoxes: labels.flatMap((c) => c.members.map((m) => m.box)),
      labelText: labels.map((c) => c.str) });
  }
  return out;
}

const labelSets = new WeakMap();
function labelSet(region) {
  if (!labelSets.has(region)) labelSets.set(region, new Set(region.labels));
  return labelSets.get(region);
}

/**
 * True when a pdf.js text item is a label of one of the figure regions. Items built separately
 * from the same glyphs (for example per-glyph equation items) match by position.
 */
export function insideFigure(item, regions, pageHeight) {
  if (!item || typeof item.str !== 'string' || !item.transform || !regions?.length) return false;
  const key = keyOf(item);
  if (regions.some((region) => labelSet(region).has(key))) return true;
  const point = center(textItemBox(item, pageHeight).box);
  return regions.some((region) => region.labelBoxes.some((b) => contains(b, point, 0.3)));
}

// ---------------------------------------------------------------------------------------------
// Ruled tables

function gridOf(table) {
  const { xs, ys, component: { h, v } } = table;
  const rows = ys.length - 1, cols = xs.length - 1;
  if (rows < 2 || cols < 1) return null;
  if (xs.some((x, i) => i && x - xs[i - 1] < 6) || ys.some((y, i) => i && y - ys[i - 1] < 6)) return null;
  const full = (k) => k >= 0.9, none = (k) => k <= 0.1;
  const x0 = xs[0], x1 = xs.at(-1), y0 = ys[0], y1 = ys.at(-1);
  if ([coverage(h, y0, x0, x1), coverage(h, y1, x0, x1), coverage(v, x0, y0, y1), coverage(v, x1, y0, y1)].some((k) => k < 0.97)) return null;
  const right = new Map(), below = new Map();
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols - 1; c += 1) {
    const k = coverage(v, xs[c + 1], ys[r], ys[r + 1]);
    if (!full(k) && !none(k)) return null;
    right.set(r * cols + c, full(k));
  }
  for (let r = 0; r < rows - 1; r += 1) for (let c = 0; c < cols; c += 1) {
    const k = coverage(h, ys[r + 1], xs[c], xs[c + 1]);
    if (!full(k) && !none(k)) return null;
    below.set(r * cols + c, full(k));
  }
  const uf = new UnionFind(rows * cols);
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
    if (c < cols - 1 && !right.get(r * cols + c)) uf.join(r * cols + c, r * cols + c + 1);
    if (r < rows - 1 && !below.get(r * cols + c)) uf.join(r * cols + c, (r + 1) * cols + c);
  }
  const groups = new Map();
  for (let i = 0; i < rows * cols; i += 1) {
    const root = uf.find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  }
  const cells = [];
  const owner = new Map();
  for (const members of groups.values()) {
    const rs = members.map((i) => Math.floor(i / cols)), cs = members.map((i) => i % cols);
    const r0 = Math.min(...rs), r1 = Math.max(...rs), c0 = Math.min(...cs), c1 = Math.max(...cs);
    // A merged cell must be a clean rectangle with no rule inside it.
    if (members.length !== (r1 - r0 + 1) * (c1 - c0 + 1)) return null;
    for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) {
      if (c < c1 && right.get(r * cols + c)) return null;
      if (r < r1 && below.get(r * cols + c)) return null;
    }
    const cell = { row: r0, col: c0, rowSpan: r1 - r0 + 1, colSpan: c1 - c0 + 1, box: [xs[c0], ys[r0], xs[c1 + 1], ys[r1 + 1]] };
    cells.push(cell);
    for (const i of members) owner.set(i, cell);
  }
  // Every piece of text sits wholly inside one cell.
  const used = new Set();
  for (const chain of table.chains) {
    const [cx, cy] = center(chain.box);
    const col = locateIndex(xs, cx), row = locateIndex(ys, cy);
    if (col < 0 || row < 0) return null;
    const cell = owner.get(row * cols + col);
    const b = cell.box;
    if (chain.box[0] < b[0] - 1.5 || chain.box[2] > b[2] + 1.5 || chain.box[1] < b[1] - 2.5 || chain.box[3] > b[3] + 2.5) return null;
    used.add(cell);
  }
  if (used.size < Math.max(2, cells.length * 0.4)) return null;
  cells.sort((a, b) => a.row - b.row || a.col - b.col);
  return { box: [x0, y0, x1, y1], rows, cols, cells };
}

/**
 * Simple ruled tables that lie wholly inside questionBox ([x0, top0, x1, top1]). A table is
 * returned only when its rules form complete rows and columns; merged cells must be clean
 * rectangles and every text item must sit inside one cell. Anything unclear returns nothing.
 */
export function tableGrids(primitives, textItems, pageHeight, questionBox) {
  const page = analyse(primitives, textItems, pageHeight);
  const [qx0, qy0, qx1, qy1] = questionBox || [-Infinity, -Infinity, Infinity, Infinity];
  const grids = [];
  for (const table of page.tables) {
    const b = table.box;
    if (b[0] < qx0 - 1 || b[1] < qy0 - 1 || b[2] > qx1 + 1 || b[3] > qy1 + 1) continue;
    const grid = gridOf(table);
    if (grid) grids.push(grid);
  }
  return grids.sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]);
}
