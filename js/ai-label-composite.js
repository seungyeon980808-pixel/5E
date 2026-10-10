import { validateLabelTargetPlacement, labelBindingHash } from './ai-label-target-placement.js?v=1.7.0-four-session-integration';
import { createEditableImageLabelObjects } from './ai-editable-image-labels.js?v=1.7.0-four-session-integration';
import { prepareEditableLabelFonts, nativeLabelBounds, measureLabelTypography, renderLabelTypography, renderNativeLabelTypography } from './ai-label-typography.js?v=1.7.0-four-session-integration';
import { assessFinalLabelPlacement } from './ai-label-placement-harness.js?v=1.7.0-four-session-integration';
// Provisional warning tolerances; these never confer a final visual-quality pass.
export const LABEL_COMPOSITE_THRESHOLDS = Object.freeze({ centerDistance: 0.015, sizeRelativeError: 0.35, overlapOfSmallerBox: 0.05, maxPixels: 16777216, maxDataUrlLength: 24000000 });
const abort = signal => { if (signal?.aborted) throw new DOMException('Composite cancelled', 'AbortError'); };
export function assessLabelCompositeMeasurements(measurements, plan = {}) {
  const issues = [], overlaps = [], diagnostics = [];
  for (const item of measurements) {
    const { actual: a, planned: p } = item;
    if (!a || !Object.values(a).every(Number.isFinite) || a.w <= 0 || a.h <= 0) { issues.push({ code: 'unmeasurable-label', id: item.id }); continue; }
    if (a.x < 0 || a.y < 0 || a.x + a.w > 1 || a.y + a.h > 1) issues.push({ code: 'clipped-label', id: item.id });
    if (!p || !(p.w > 0 && p.h > 0)) issues.push({ code: 'missing-source-bounds', id: item.id });
    else {
      item.deviation = { center: Math.hypot(a.x + a.w / 2 - p.x - p.w / 2, a.y + a.h / 2 - p.y - p.h / 2), width: Math.abs(a.w / p.w - 1), height: Math.abs(a.h / p.h - 1) };
      if (item.deviation.center > LABEL_COMPOSITE_THRESHOLDS.centerDistance || Math.max(item.deviation.width, item.deviation.height) > LABEL_COMPOSITE_THRESHOLDS.sizeRelativeError) diagnostics.push({ code: 'source-bounds-deviation', id: item.id, deviation: item.deviation });
    }
  }
  for (let i = 0; i < measurements.length; i++) for (let j = i + 1; j < measurements.length; j++) {
    const a = measurements[i].actual, b = measurements[j].actual;
    if (!a || !b) continue;
    const area = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const fraction = area / Math.min(a.w * a.h, b.w * b.h);
    if (fraction > LABEL_COMPOSITE_THRESHOLDS.overlapOfSmallerBox) overlaps.push({ ids: [measurements[i].id, measurements[j].id], fraction });
  }
  if (overlaps.length) issues.push({ code: 'label-overlap', overlaps });
  if (plan.uncertainties?.length || plan.rejectedCount || plan.labels?.some(l => l.typographyReviewRequired || l.targetReviewRequired || l.ownershipReviewRequired) || plan.excludedLabels?.some(l => !['graph', 'non_graph_vertical_deferred'].includes(l.scope))) issues.push({ code: 'source-plan-uncertainty' });
  return { policy: '5e-standard-v1', status: issues.length ? 'needs-attention' : 'mechanical-checks-clear', visualReviewRequired: true, thresholds: LABEL_COMPOSITE_THRESHOLDS, measurements, overlaps, issues, diagnostics, limitations: ['Bounding boxes do not establish target identity or raster structure preservation.', 'Declared 5E font stacks permit system fallback; exact source typeface matching is not required.', 'Editing requires separate native interaction tests; mechanical clearance is not a final pass.'] };
}
async function digest(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, '0')).join(''); }
function loadImage(src, signal) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => { image.onload = image.onerror = null; signal?.removeEventListener('abort', cancelled); };
    const cancelled = () => { cleanup(); image.src = ''; reject(new DOMException('Composite cancelled', 'AbortError')); };
    image.onload = () => { cleanup(); resolve(image); };
    image.onerror = () => { cleanup(); reject(new Error('Composite image decoding failed')); };
    signal?.addEventListener('abort', cancelled, { once: true });
    if (signal?.aborted) return cancelled();
    image.src = src;
  });
}
// Rasterize native typography on a transparent padded viewport. This includes
// formula bars and painted halos, excludes leader routes and transparent hit
// rectangles, and preserves off-canvas ink for honest clipping diagnostics.
export async function measureNativePaintedGlyphs({ object, image, width, height, css, hostSvg, signal }) {
  abort(signal);
  const node = object.type === 'labeler' ? document.createElementNS('http://www.w3.org/2000/svg','g') : renderNativeLabelTypography(object);
  if (object.type === 'labeler') node.appendChild(renderLabelTypography(object, object.p2));
  hostSvg.appendChild(node);
  let layout;
  try { layout = node.getBBox(); } finally { node.remove(); }
  if (![layout.x,layout.y,layout.width,layout.height].every(Number.isFinite) || layout.width <= 0 || layout.height <= 0) return { glyphBounds: null, method: 'native-svg-alpha-raster-v1', reason: 'empty-native-layout' };
  const scaleX = image.w / width, scaleY = image.h / height;
  const padding = Math.ceil(Math.max(8, (object.fontSize || object.labelSize || 1) / Math.min(scaleX,scaleY)));
  const left = Math.floor(layout.x / scaleX) - padding, top = Math.floor(layout.y / scaleY) - padding;
  const w = Math.ceil((layout.x + layout.width) / scaleX) + padding - left, h = Math.ceil((layout.y + layout.height) / scaleY) + padding - top;
  if (!(w > 0 && h > 0) || w*h > LABEL_COMPOSITE_THRESHOLDS.maxPixels) return { glyphBounds: null, method: 'native-svg-alpha-raster-v1', reason: 'paint-measurement-raster-limit' };
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('xmlns',svg.namespaceURI);svg.setAttribute('width',w);svg.setAttribute('height',h);
  svg.setAttribute('viewBox',`${left*scaleX} ${top*scaleY} ${w*scaleX} ${h*scaleY}`);
  const style=document.createElementNS(svg.namespaceURI,'style');style.textContent=css;svg.appendChild(style);svg.appendChild(node);
  const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
  let rendered;try { rendered=await loadImage(url,signal); } finally { URL.revokeObjectURL(url); }
  abort(signal);
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(rendered,0,0);
  const pixels=context.getImageData(0,0,w,h).data;
  let minX=w,minY=h,maxX=-1,maxY=-1,paintedPixels=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(pixels[(y*w+x)*4+3]>0){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);paintedPixels++;}
  canvas.width=canvas.height=0;
  const method='native-svg-alpha-raster-v1';
  if(!paintedPixels)return {glyphBounds:null,method,reason:'no-native-painted-glyph'};
  if(minX===0||minY===0||maxX===w-1||maxY===h-1)return {glyphBounds:null,method,reason:'paint-measurement-viewport-clipped'};
  return {glyphBounds:{x:(left+minX)/width,y:(top+minY)/height,w:(maxX-minX+1)/width,h:(maxY-minY+1)/height},method,paintedPixels,rasterBounds:{left:left+minX,top:top+minY,right:left+maxX+1,bottom:top+maxY+1}};
}
export async function createEditableLabelComposite({ plan, placement, candidateDataUrl, artboard, signal }) {
  abort(signal);
  if (!plan || !Array.isArray(plan.labels) || plan.labels.length > 128) throw new TypeError('Invalid composite label plan');
  if (typeof candidateDataUrl !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(candidateDataUrl) || candidateDataUrl.length > LABEL_COMPOSITE_THRESHOLDS.maxDataUrlLength) throw new TypeError('Composite requires a bounded raster data URL');
  if (!artboard || ![artboard.w, artboard.h].every(n => Number.isFinite(n) && n > 0)) throw new TypeError('Composite requires target artboard dimensions');
  // PNG dimensions are available before browser decoding: reject decompression
  // bombs before allocating the raster. Other formats retain the decoded cap.
  if (candidateDataUrl.startsWith('data:image/png;')) {
    const header = atob(candidateDataUrl.split(',')[1].slice(0, 44));
    const bytes = Uint8Array.from(header, c => c.charCodeAt(0));
    if (bytes.length < 24 || bytes[0] !== 137 || String.fromCharCode(...bytes.slice(1, 4)) !== 'PNG' || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') throw new TypeError('Invalid PNG header');
    const view = new DataView(bytes.buffer), w = view.getUint32(16), h = view.getUint32(20);
    if (!w || !h || w * h > LABEL_COMPOSITE_THRESHOLDS.maxPixels) throw new RangeError('Composite raster exceeds pixel limit');
  }
  const planJson = JSON.stringify(plan), snapshot = JSON.parse(planJson);
  if (placement) snapshot.labels = await validateLabelTargetPlacement({ plan, placement, candidateDataUrl });
  const raster = await loadImage(candidateDataUrl, signal), width = raster.naturalWidth, height = raster.naturalHeight;
  if (!(width > 0 && height > 0) || width * height > LABEL_COMPOSITE_THRESHOLDS.maxPixels) throw new RangeError('Composite raster exceeds pixel limit');
  const scale = Math.min(artboard.w * 0.9 / width, artboard.h * 0.9 / height, 1);
  const normalizeGeometry = value => {
    if (Array.isArray(value)) return value.map(normalizeGeometry);
    if (!value || typeof value !== 'object') return value;
    if (Number.isFinite(value.x) && Number.isFinite(value.y)) return { x: value.x / (width * scale), y: value.y / (height * scale) };
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeGeometry(item)]));
  };
  const image = { id: 'composite-image', type: 'image', x: 0, y: 0, w: width * scale, h: height * scale, rotation: 0 };
  await prepareEditableLabelFonts(snapshot.labels); await document.fonts.ready; abort(signal);
  let serial = 0;
  const objects = createEditableImageLabelObjects({ labels: snapshot.labels, relationGroups: snapshot.relationGroups, image, idFactory: () => `composite-label-${++serial}` });
  const [{ renderObject }, { ensureEmbeddedFonts }] = await Promise.all([import('./render/scene.js?v=1.7.0-four-session-integration'), import('./svg-export.js?v=1.7.0-four-session-integration')]);
  const css = await ensureEmbeddedFonts(); abort(signal);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); svg.setAttribute('width', width); svg.setAttribute('height', height); svg.setAttribute('viewBox', `0 0 ${image.w} ${image.h}`);
  const style = document.createElementNS(svg.namespaceURI, 'style'); style.textContent = css; svg.appendChild(style);
  const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none'; host.appendChild(svg); document.body.appendChild(host);
  const measurements = [];
  try {
    for (const object of objects) {
      const node = renderObject(object); svg.appendChild(node);
      const metrics = measureLabelTypography(object);
      const native = object.type === 'labeler' ? { x: object.p2.x - metrics.rotatedW / 2, y: object.p2.y - metrics.rotatedH / 2, w: metrics.rotatedW, h: metrics.rotatedH } : nativeLabelBounds(object);
      const planned = snapshot.labels.find(l => l.id && l.id === object.aiSourceLabelId) || snapshot.labels.filter(l => l.scope === 'general' || !l.scope)[measurements.length];
      const actual = { x: native.x / image.w, y: native.y / image.h, w: native.w / image.w, h: native.h / image.h };
      const rects = [...node.querySelectorAll('text')].map(n => n.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0), origin = svg.getBoundingClientRect();
      const emBounds = rects.length ? { x: (Math.min(...rects.map(r => r.left)) - origin.left) / width, y: (Math.min(...rects.map(r => r.top)) - origin.top) / height, w: (Math.max(...rects.map(r => r.right)) - Math.min(...rects.map(r => r.left))) / width, h: (Math.max(...rects.map(r => r.bottom)) - Math.min(...rects.map(r => r.top))) / height } : null;
      const painted = await measureNativePaintedGlyphs({object,image,width,height,css,hostSvg:svg,signal});
      const glyphBounds = painted.glyphBounds;
      const presentation = { fontFamily: object.fontFamily, fontWeight: object.fontWeight || 'normal', fontSizeMm: object.fontSize || object.labelSize, italic: object.italic === true,
        contentMode: object.contentMode, lineCount: metrics.lines.length, letterSpacing: object.letterSpacing || 0, lineHeight: object.labelLineHeight || 'native-auto',
        runs: metrics.lines.flatMap(line => line.runs.map(run => ({ text: run.text, contentMode: run.contentMode, ...run.font, scriptStyles: run.scriptStyles }))) };
      measurements.push({ id: object.aiSourceLabelId || object.id, text: object.text, presentation, actual: glyphBounds || actual, layoutBounds: actual, glyphBounds, emBounds, paintedGlyphMeasurement: painted, planned: planned?.typography?.bounds || null, plannedLeader: planned?.mode === 'leader' ? { anchor: planned.anchor, position: planned.position, elbow: planned.elbow, extraAnchors: planned.extraAnchors, routes: planned.leaderRoutes } : null, normalizedLeader: object.type === 'labeler' ? normalizeGeometry({ anchor: object.p1, position: object.p2, elbow: object.elbow, extraAnchors: object.extraAnchors, routes: object.leaderRoutes }) : null, leader: object.type === 'labeler' ? { p1: object.p1, p2: object.p2, elbow: object.elbow, extraAnchors: object.extraAnchors, routes: object.leaderRoutes, coordinateSystem: 'image-local-world', imageSize: { w: image.w, h: image.h } } : null });
    }
    const report = assessLabelCompositeMeasurements(measurements, snapshot);
    if (objects.some(o => o.fontFamily?.includes('Latin Modern Roman')) && !css.includes('data:font/woff2;base64,')) { report.issues.push({ code: 'export-font-unavailable' }); report.status = 'needs-attention'; }
    if (measurements.some(m => !m.glyphBounds)) { report.issues.push({ code: 'unmeasurable-rendered-glyphs' }); report.status = 'needs-attention'; }
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    let overlay; try { overlay = await loadImage(url, signal); } finally { URL.revokeObjectURL(url); }
    abort(signal);
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, width, height); context.drawImage(raster, 0, 0);
    const rawPixels = context.getImageData(0, 0, width, height);
    report.finalPlacement = assessFinalLabelPlacement({ plan: snapshot, measurements, raster: rawPixels });
    if (report.finalPlacement.issues.length) { report.issues.push(...report.finalPlacement.issues); report.status = 'needs-attention'; }
    context.drawImage(overlay, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/png'); canvas.width = canvas.height = 0;
    const [candidateSha256, planSha256, compositeSha256] = await Promise.all([digest(candidateDataUrl), digest(planJson), digest(dataUrl)]); abort(signal);
    return { attachment: { name: 'editable-label-final-composite.png', data: dataUrl, dataUrl, mimeType: 'image/png' }, report, objects, bindings: { candidateSha256, planSha256, compositeSha256, ...(placement ? { placementSha256: await labelBindingHash(JSON.stringify(placement)) } : {}), width, height, imageSize: { w: image.w, h: image.h } } };
  } finally { host.remove(); }
}
