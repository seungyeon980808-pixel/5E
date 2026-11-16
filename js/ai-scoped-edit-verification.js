/** Bounded, scale-one dark-contour verification. Search never grants edit permission. */
import { decodeScopedPng } from './ai-scoped-edit-png.js?v=1.7.0-four-session-integration';

const inside = (a, b) => a.x0 >= b.x0 && a.y0 >= b.y0 && a.x1 <= b.x1 && a.y1 <= b.y1;
const finite = value => typeof value === 'number' && Number.isFinite(value);
function rectangle(value, width, height) {
  if (!value || !['x0', 'y0', 'x1', 'y1'].every(key => Number.isSafeInteger(value[key]))
      || value.x0 < 0 || value.y0 < 0 || value.x1 > width || value.y1 > height
      || value.x0 >= value.x1 || value.y0 >= value.y1) {
    throw new TypeError('Expected a nonempty, half-open original pixel rectangle.');
  }
  return { x0: value.x0, y0: value.y0, x1: value.x1, y1: value.y1 };
}

/** Validate and copy the explicit machine spec; never interpret comments. */
export function validateScopedEditChecks(checks, { width, height, rectangles }) {
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0)
      || !Array.isArray(rectangles) || !rectangles.length
      || !Array.isArray(checks) || checks.length !== rectangles.length) {
    throw new TypeError('Exactly one precision check per permission rectangle is required.');
  }
  const boxes = rectangles.map(r => rectangle(r, width, height)), seen = new Set();
  return checks.map(check => {
    if (!check || !Number.isSafeInteger(check.box) || !boxes[check.box] || seen.has(check.box)) {
      throw new TypeError('Precision check box indices must be unique and zero-based.');
    }
    seen.add(check.box);
    const search = rectangle(check.search, width, height);
    const result = { box: check.box, kind: check.kind, search };
    switch (check.kind) {
      case 'move':
        if (!finite(check.dx) || !finite(check.dy) || (!check.dx && !check.dy)
            || Math.abs(check.dx) >= width || Math.abs(check.dy) >= height) {
          throw new TypeError('A finite, nonzero move offset within the image is required.');
        }
        return { ...result, dx: check.dx, dy: check.dy };
      case 'circles': {
        if (!finite(check.diameter) || check.diameter <= 0 || !Array.isArray(check.centers) || !check.centers.length) {
          throw new TypeError('Explicit circle centers and a measurable positive diameter are required.');
        }
        const centers = check.centers.map(center => {
          if (!center || !finite(center.x) || !finite(center.y)) throw new TypeError('Invalid circle center.');
          const radius = check.diameter / 2;
          const bounds = { x0: center.x - radius, y0: center.y - radius,
            x1: center.x + radius, y1: center.y + radius };
          if (!inside(bounds, boxes[check.box]) || !inside(bounds, search)) {
            throw new TypeError('Expected complete circles must fit their permission and search rectangles.');
          }
          return { x: center.x, y: center.y };
        });
        for (let i = 0; i < centers.length; i++) for (let j = 0; j < i; j++) {
          if (Math.hypot(centers[i].x - centers[j].x, centers[i].y - centers[j].y) <= check.diameter) {
            throw new TypeError('Expected circles must be separate.');
          }
        }
        return { ...result, diameter: check.diameter, centers };
      }
      case 'disconnect':
        if (!finite(check.gap) || check.gap <= 0 || check.gap >= search.x1 - search.x0
            || check.gap >= boxes[check.box].x1 - boxes[check.box].x0) {
          throw new TypeError('A positive horizontal gap fitting the permission and search widths is required.');
        }
        return { ...result, gap: check.gap };
      default:
        throw new TypeError('Unsupported precision check kind.');
    }
  });
}

function snapshot(value) {
  if (!(value instanceof Uint8Array)
      || (typeof SharedArrayBuffer !== 'undefined' && value.buffer instanceof SharedArrayBuffer)) {
    throw new TypeError('PNG inputs must be non-shared Uint8Array snapshots.');
  }
  return new Uint8Array(value);
}
function dark(image, x, y, origin = { x: 0, y: 0 }) {
  x -= origin.x; y -= origin.y;
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return false;
  const p = (y * image.width + x) * 4;
  return image.data[p + 3] > 200 && (image.data[p] + image.data[p + 1] + image.data[p + 2]) / 3 < 100;
}
function raster(image, search, origin, antialiasConnectivity = false) {
  const width = search.x1 - search.x0, height = search.y1 - search.y0;
  const mask = new Uint8Array(width * height);
  const connectivity = antialiasConnectivity ? new Uint8Array(mask.length) : mask;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    mask[y * width + x] = Number(dark(image, x + search.x0, y + search.y0, origin));
    if (antialiasConnectivity) {
      const ix=x+search.x0-origin.x,iy=y+search.y0-origin.y,p=(iy*image.width+ix)*4;
      connectivity[y*width+x]=Number(ix>=0&&iy>=0&&ix<image.width&&iy<image.height
        &&image.data[p+3]>200&&(image.data[p]+image.data[p+1]+image.data[p+2])/3<200);
    }
  }
  return { mask, connectivity, width, height, search };
}
function components(raster) {
  const { mask, connectivity, width, height, search } = raster, seen = new Uint8Array(mask.length), found = [];
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p] || seen[p]) continue;
    const points = [p]; seen[p] = 1;
    let left = width, top = height, right = 0, bottom = 0;
    for (let n = 0; n < points.length; n++) {
      const q = points[n], x = q % width, y = Math.floor(q / width);
      if(mask[q]) {
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, next = ny * width + nx;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && connectivity[next] && !seen[next]) {
          seen[next] = 1; points.push(next);
        }
      }
    }
    found.push({ points:points.filter(p=>mask[p]),visiblePoints:points, bounds: { x0: left + search.x0, y0: top + search.y0,
      x1: right + search.x0 + 1, y1: bottom + search.y0 + 1 },
    border: left === 0 || top === 0 || right === width - 1 || bottom === height - 1 });
  }
  return found;
}
const dimensions = b => [b.x1 - b.x0, b.y1 - b.y0];
const center = b => [(b.x0 + b.x1 - 1) / 2, (b.y0 + b.y1 - 1) / 2];
function result(check, status, metrics, reasons) {
  const expectation = { ...check };
  return { box: check.box, kind: check.kind, status, metrics, reasons,
    expectation, feedback: status === 'fail'
      ? JSON.stringify({ box: check.box, kind: check.kind, expected: expectation, measured: metrics, reasons }) : '' };
}
function near(mask, width, height, x, y) {
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < width && ny < height && mask[ny * width + nx]) return true;
  }
  return false;
}
function move(check, source, raw, box) {
  const old = components(source), current = components(raw);
  if (old.length !== 1 || current.length !== 1 || old[0].border || current[0].border) {
    return result(check, 'uncertain', { sourceCount: old.length, rawCount: current.length },
      ['ambiguous-or-incomplete-target']);
  }
  const a = old[0].bounds, b = current[0].bounds;
  const dx = b.x0 - a.x0, dy = b.y0 - a.y0;
  const expected = { x0: a.x0 + check.dx, x1: a.x1 + check.dx,
    y0: a.y0 + check.dy, y1: a.y1 + check.dy };
  const clipped = !inside(b, box), reasons = [];
  if (!inside(a, box) || !inside(expected, box)) reasons.push('target-does-not-fit-permission');
  if (clipped) reasons.push('target-clipped');
  if (!dx && !dy) reasons.push('no-movement');
  if (Math.abs(dx - check.dx) > 3 || Math.abs(dy - check.dy) > 2) reasons.push('offset-mismatch');
  const sourceSize = dimensions(a), rawSize = dimensions(b);
  // Complete bidirectional contour support prevents a matching left edge from
  // hiding a shortened target or an interior shape change. No resampling occurs.
  let missingContour = 0, addedContour = 0;
  for (const p of old[0].points) {
    if (!near(raw.mask, raw.width, raw.height,
      p % source.width + source.search.x0 + dx - raw.search.x0,
      Math.floor(p / source.width) + source.search.y0 + dy - raw.search.y0)) missingContour++;
  }
  for (const p of current[0].points) {
    if (!near(source.mask, source.width, source.height,
      p % raw.width + raw.search.x0 - dx - source.search.x0,
      Math.floor(p / raw.width) + raw.search.y0 - dy - source.search.y0)) addedContour++;
  }
  // Gray antialiasing may connect dark fragments, but cannot hide a changed
  // connector shape. Bounds and displacement still use the original <100 mask.
  for (const p of old[0].visiblePoints) {
    if (!near(raw.connectivity,raw.width,raw.height,
      p%source.width+source.search.x0+dx-raw.search.x0,
      Math.floor(p/source.width)+source.search.y0+dy-raw.search.y0)) missingContour++;
  }
  for (const p of current[0].visiblePoints) {
    if (!near(source.connectivity,source.width,source.height,
      p%raw.width+raw.search.x0-dx-source.search.x0,
      Math.floor(p/raw.width)+raw.search.y0-dy-source.search.y0)) addedContour++;
  }
  if (sourceSize.some((n, axis) => Math.abs(n - rawSize[axis]) > 2) || missingContour || addedContour) {
    reasons.push('length-or-shape-changed');
  }
  return result(check, reasons.length ? 'fail' : 'pass',
    { dx, dy, clipped, sourceBounds: a, rawBounds: b, sourceSize, rawSize, missingContour, addedContour }, reasons);
}

function ring(component, image) {
  const b = component.bounds, [width, height] = dimensions(b), [cx, cy] = center(b);
  if (width < 6 || height < 6) return 'ambiguous';
  // Row/column extrema must follow a single circle, not just its bounding box.
  // Two pixels is raster/contour uncertainty, not additional size tolerance.
  const radius = (width + height - 2) / 4;
  if (Math.abs(width - height) > 4) return 'noncircle';
  const rows = new Map(), columns = new Map(), local = new Uint8Array(width * height);
  for (const p of component.points) {
    const x = p % image.width + image.search.x0, y = Math.floor(p / image.width) + image.search.y0;
    const row = rows.get(y) || [x, x], column = columns.get(x) || [y, y];
    row[0] = Math.min(row[0], x); row[1] = Math.max(row[1], x); rows.set(y, row);
    column[0] = Math.min(column[0], y); column[1] = Math.max(column[1], y); columns.set(x, column);
    local[(y - b.y0) * width + x - b.x0] = 1;
  }
  for (const [y, xs] of rows) for (const x of xs) {
    if (Math.abs(Math.hypot(x - cx, y - cy) - radius) > 2) return 'noncircle';
  }
  for (const [x, ys] of columns) for (const y of ys) {
    if (Math.abs(Math.hypot(x - cx, y - cy) - radius) > 2) return 'noncircle';
  }
  // Flood the center's light region: an opening anywhere makes a ring uncertain.
  const start = Math.floor(height / 2) * width + Math.floor(width / 2);
  if (local[start]) return 'ambiguous';
  const queue = [start], seen = new Uint8Array(local.length); seen[start] = 1;
  for (let n = 0; n < queue.length; n++) {
    const p = queue[n], x = p % width, y = Math.floor(p / width);
    if (!x || !y || x === width - 1 || y === height - 1) return 'ambiguous';
    for (const q of [p - 1, p + 1, p - width, p + width]) {
      if (!local[q] && !seen[q]) { seen[q] = 1; queue.push(q); }
    }
  }
  return 'circle';
}
function circles(check, source, raw, box, final) {
  const old = components(source), current = components(raw), finalComponents = components(final);
  const reasons = [], added = [];
  // Preserve source objects in the FINAL composite. Discarded RAW changes
  // outside permission are not edits to the source and must not invalidate it.
  const pointSets = finalComponents.map(component => new Set(component.points));
  for (const a of old) {
    const matches = pointSets.filter(points => a.points.length === points.size
      && a.points.every(p => points.has(p)));
    if (matches.length !== 1) return result(check, 'uncertain', { sourceCount: old.length }, ['source-object-changed-or-ambiguous']);
  }
  for (const component of current) {
    // Only a component contributing NEW contour inside permission is an
    // addition to the final image. Measure that component's entire RAW ring.
    if (!component.points.some(p => {
      const x = p % raw.width + raw.search.x0, y = Math.floor(p / raw.width) + raw.search.y0;
      return x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1 && !source.mask[p];
    })) continue;
    const shape = ring(component, raw);
    if (component.border || shape === 'ambiguous') {
      return result(check, 'uncertain', { detectedCount: added.length + 1 }, ['ambiguous-or-incomplete-ring']);
    }
    if (shape !== 'circle') reasons.push('noncircular-outline');
    added.push({ bounds: component.bounds, center: center(component.bounds),
      diameter: dimensions(component.bounds), clipped: !inside(component.bounds, box) });
  }
  if (added.length !== check.centers.length) reasons.push('additional-count-mismatch');
  if (added.some(c => c.clipped)) reasons.push('target-clipped');
  const unused = new Set(added.map((_, i) => i));
  for (const expected of check.centers) {
    const matches = [...unused].filter(i => Math.abs(added[i].center[0] - expected.x) <= 5
      && Math.abs(added[i].center[1] - expected.y) <= 5);
    if (matches.length > 1) return result(check, 'uncertain', { added }, ['ambiguous-ring-assignment']);
    if (!matches.length) { reasons.push('center-mismatch'); continue; }
    const index = matches[0]; unused.delete(index);
    if (added[index].diameter.some(n => Math.abs(n - check.diameter) > 10)) reasons.push('diameter-mismatch');
  }
  return result(check, reasons.length ? 'fail' : 'pass', { found: added.length, added }, [...new Set(reasons)]);
}

function openPath(component, source) {
  // Thin a private binary copy only to reject branches/loops in the source.
  // No thinning is ever applied to an input, RAW, or final PNG.
  const width=source.width+2,height=source.height+2,thin=new Uint8Array(width*height);
  for(const p of component.visiblePoints)thin[(Math.floor(p/source.width)+1)*width+p%source.width+1]=1;
  let changed;
  do {
    changed=false;
    for(let phase=0;phase<2;phase++){
      const remove=[];
      for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
        const p=y*width+x;if(!thin[p])continue;
        const n=[thin[p-width],thin[p-width+1],thin[p+1],thin[p+width+1],
          thin[p+width],thin[p+width-1],thin[p-1],thin[p-width-1]];
        const count=n.reduce((a,b)=>a+b,0);
        let crossings=0;for(let i=0;i<8;i++)if(!n[i]&&n[(i+1)%8])crossings++;
        const a=phase===0?n[0]*n[2]*n[4]:n[0]*n[2]*n[6];
        const b=phase===0?n[2]*n[4]*n[6]:n[0]*n[4]*n[6];
        if(count>=2&&count<=6&&crossings===1&&!a&&!b)remove.push(p);
      }
      if(remove.length)changed=true;
      for(const p of remove)thin[p]=0;
    }
  } while(changed);
  let ends=0;
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const p=y*width+x;if(!thin[p])continue;
    const n=[thin[p-width],thin[p-width+1],thin[p+1],thin[p+width+1],
      thin[p+width],thin[p+width-1],thin[p-1],thin[p-width-1]];
    let crossings=0;for(let i=0;i<8;i++)if(!n[i]&&n[(i+1)%8])crossings++;
    if(crossings===1)ends++;
    if(crossings>=3)return false;
  }
  return ends===2;
}

function disconnect(check, source, raw, box) {
  const { width, height } = source;
  const old = components(source);
  const unsupported = reason => result(check, 'uncertain',
    { unsupportedSource: true, sourceCount: old.length, sourceSearch: { ...check.search } }, [reason]);
  // One/two nonbranching paths can curve, as the actual U-wire does.
  // Measure a horizontal opening only where the source has contour pixels.
  if (!old.length || old.length > 2) return unsupported('ambiguous-source-path');
  if(old.some(component=>!openPath(component,source)))return unsupported('branched-or-closed-source');
  const columns=new Uint8Array(width);
  for(const component of old)for(const p of component.visiblePoints)columns[p%width]=1;
  const left=columns.indexOf(1),right=columns.lastIndexOf(1)+1;
  if(right-left<check.gap+4||columns.subarray(left,right).some(value=>!value))return unsupported('incomplete-horizontal-source');
  const gaps = [];
  let start = null, addedDarkPixels = 0, contourPixelsBeyond2px = 0, visibleContourPixelsBeyond2px = 0;
  for (let x = 0; x < width; x++) {
    let current = false;
    for (let y = 0; y < height; y++) {
      const p = y * width + x; current ||= Boolean(raw.connectivity[p]);
      if (raw.mask[p] && !source.mask[p]) {
        addedDarkPixels++;
        if (!near(source.mask, width, height, x, y)) contourPixelsBeyond2px++;
      }
      if(raw.connectivity[p]&&!near(source.connectivity,width,height,x,y))visibleContourPixelsBeyond2px++;
    }
    if (columns[x] && !current && start === null) start = x;
    if ((!columns[x] || current) && start !== null) { gaps.push([start, x]); start = null; }
  }
  if (start !== null) gaps.push([start, width]);
  const gapWidth = gaps.length === 1 ? gaps[0][1] - gaps[0][0] : 0;
  let missingPathPixels = 0, clipped = false;
  for (let p = 0; p < source.mask.length; p++) {
    const x = p % width, y = Math.floor(p / width);
    if (source.mask[p] && !gaps.some(([a, b]) => x >= a && x < b)
        && !near(raw.connectivity, width, height, x, y)) missingPathPixels++;
    if (source.mask[p] && !raw.mask[p] && gaps.some(([a, b]) => x >= a && x < b)) {
      const ox = x + source.search.x0, oy = y + source.search.y0;
      if (ox < box.x0 || ox >= box.x1 || oy < box.y0 || oy >= box.y1) clipped = true;
    }
  }
  const reasons = [];
  if (!gaps.length) reasons.push('no-disconnection');
  if (gaps.length !== 1 || gaps.some(([a, b]) => a===left || b===right)) reasons.push('remaining-path-not-preserved');
  if (Math.abs(gapWidth - check.gap) > 10) reasons.push('gap-mismatch');
  if (missingPathPixels) reasons.push('remaining-path-not-preserved');
  if (clipped) reasons.push('target-clipped');
  if (contourPixelsBeyond2px||visibleContourPixelsBeyond2px) reasons.push('new-terminal-contour');
  return result(check, reasons.length ? 'fail' : 'pass',
    { gapWidth, gaps: gaps.map(([a, b]) => [a + source.search.x0, b + source.search.x0]),
      addedDarkPixels, contourPixelsBeyond2px, visibleContourPixelsBeyond2px, missingPathPixels, clipped }, [...new Set(reasons)]);
}

export async function evaluateScopedEditPrecision({ sourcePng, rawPng, finalPng,
  origin = { x: 0, y: 0 }, rectangles, checks }) {
  // Capture all mutable inputs before decoding yields.
  const sourceBytes = snapshot(sourcePng), rawBytes = snapshot(rawPng), finalBytes = snapshot(finalPng);
  const capturedBoxes = structuredClone(rectangles), capturedChecks = structuredClone(checks);
  const offset = { x: origin?.x, y: origin?.y };
  if (![offset.x, offset.y].every(Number.isSafeInteger)) throw new TypeError('Origin must be integer scale-one pixels.');
  const [source, raw, final] = await Promise.all([sourceBytes, rawBytes, finalBytes].map(decodeScopedPng));
  const validated = validateScopedEditChecks(capturedChecks, { width: source.width, height: source.height, rectangles: capturedBoxes });
  if (source.width !== final.width || source.height !== final.height) throw new TypeError('Final PNG must have original dimensions.');
  const rawBounds = { x0: offset.x, y0: offset.y, x1: offset.x + raw.width, y1: offset.y + raw.height };
  const mask = new Uint8Array(source.width * source.height);
  for (const b of capturedBoxes) for (let y = b.y0; y < b.y1; y++) mask.fill(1, y * source.width + b.x0, y * source.width + b.x1);
  let outsideRgbaChanged = 0, composedRgbaChanged = 0;
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) {
      if ([0, 1, 2, 3].some(k => source.data[p * 4 + k] !== final.data[p * 4 + k])) outsideRgbaChanged++;
    } else {
      const x = p % source.width - offset.x, y = Math.floor(p / source.width) - offset.y;
      if (x >= 0 && y >= 0 && x < raw.width && y < raw.height
          && [0, 1, 2, 3].some(k => raw.data[(y * raw.width + x) * 4 + k] !== final.data[p * 4 + k])) composedRgbaChanged++;
    }
  }
  const reports = validated.map(check => {
    if (!inside(check.search, rawBounds) || !inside(capturedBoxes[check.box], rawBounds)) {
      return result(check, 'uncertain', {}, ['raw-search-or-permission-not-covered']);
    }
    // RAW measurement is independent of permission clipping. Expand the explicit
    // read-only search by the requested displacement/radius and fixed tolerance.
    // Targets reaching even this bounded search remain uncertain, never pass.
    const padX = check.kind === 'move' ? Math.ceil(Math.abs(check.dx)) + 3
      : check.kind === 'circles' ? Math.ceil(check.diameter / 2) + 15 : 0;
    const padY = check.kind === 'move' ? Math.ceil(Math.abs(check.dy)) + 2
      : check.kind === 'circles' ? Math.ceil(check.diameter / 2) + 15 : 0;
    const rawSearch = { x0: Math.max(rawBounds.x0, check.search.x0 - padX),
      y0: Math.max(rawBounds.y0, check.search.y0 - padY),
      x1: Math.min(rawBounds.x1, check.search.x1 + padX),
      y1: Math.min(rawBounds.y1, check.search.y1 + padY) };
    const a = raster(source, check.kind === 'circles' ? rawSearch : check.search, { x: 0, y: 0 },check.kind!=='circles');
    const b = raster(raw, rawSearch, offset,check.kind!=='circles');
    switch (check.kind) {
      case 'move': return move(check, a, b, capturedBoxes[check.box]);
      case 'circles': return circles(check, a, b, capturedBoxes[check.box], raster(final, rawSearch, { x: 0, y: 0 }));
      case 'disconnect': return disconnect(check, a, b, capturedBoxes[check.box]);
    }
  });
  return { version: 1, detectorRevision:2,
    status: outsideRgbaChanged || composedRgbaChanged || reports.some(r => r.status === 'fail') ? 'fail'
      : reports.some(r => r.status === 'uncertain') ? 'uncertain' : 'pass',
    outsideRgbaChanged, composedRgbaChanged, checks: reports,
    limitations: ['Geometry checks do not establish appearance or all non-target preservation.',
      'Move/circle geometry uses opaque dark contours (mean RGB <100, alpha >200) at scale one; gray pixels below 200 establish visible move/wire connectivity and support. Wire gap width measures absent visible contour, not dark-threshold dropouts.',
      'Move targets must be single complete components; circle outlines must enclose a light center.',
      'Contour support has two-pixel raster uncertainty; sub-raster shape differences are not resolved.',
      'Disconnect checks require one/two open nonbranching source paths with continuous horizontal extent; the gap is horizontal pixel width.'] };
}

/** Empty feedback disables correction for uncertain or non-geometric failures. */
export function scopedEditCorrectionFeedback(report) {
  if (!report || report.version !== 1 || report.status !== 'fail'
      || report.outsideRgbaChanged !== 0 || report.composedRgbaChanged !== 0
      || !Array.isArray(report.checks) || !report.checks.length
      || report.checks.some(check => !check || !['pass', 'fail'].includes(check.status)
        || (check.status === 'fail' && (typeof check.feedback !== 'string' || !check.feedback)))) return '';
  return report.checks.filter(check => check.status === 'fail').map(check => check.feedback).join('\n');
}
