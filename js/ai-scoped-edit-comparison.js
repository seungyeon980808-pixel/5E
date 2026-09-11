/** Review-only, byte-preserving comparison for a scoped-edit proposal. */
import { deriveRgbaChangeMask } from './ai-scoped-edit.js';
import { decodeScopedPng } from './ai-scoped-edit-png.js';

function copyPng(value, label) {
  if (!(value instanceof Uint8Array) || !value.length
    || (typeof SharedArrayBuffer !== 'undefined' && value.buffer instanceof SharedArrayBuffer)) {
    throw new TypeError(`${label} must be a nonempty, non-shared Uint8Array.`);
  }
  return new Uint8Array(value);
}

async function decodeComparison(originalPng, previewPng) {
  const original = await decodeScopedPng(originalPng);
  const preview = await decodeScopedPng(previewPng);
  if (original.width !== preview.width || original.height !== preview.height) {
    throw new RangeError('Scoped comparison requires original and preview PNG dimensions to match exactly.');
  }
  const changes = deriveRgbaChangeMask(original, preview);
  return { original, preview, changes };
}

/**
 * Decodes independent PNG snapshots and derives the exact, per-pixel RGBA change mask.
 * It never encodes, composites, or writes either PNG input.
 */
export async function decodeScopedEditComparison(originalRawPng, proposalPreviewPng) {
  const originalPng = copyPng(originalRawPng, 'originalRawPng');
  const previewPng = copyPng(proposalPreviewPng, 'proposalPreviewPng');
  const { original, preview, changes } = await decodeComparison(originalPng, previewPng);
  return Object.freeze({
    width: original.width,
    height: original.height,
    changedPixelCount: changes.changedPixelCount,
    changedBounds: changes.bounds ? Object.freeze({ ...changes.bounds }) : null,
    mask: new Uint8Array(changes.mask),
    originalRgba: new Uint8Array(original.data),
    previewRgba: new Uint8Array(preview.data),
  });
}

function number(value) { return new Intl.NumberFormat('ko-KR').format(value); }
function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function setCanvasMask(canvas, width, height, mask) {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('변경 마스크를 표시할 Canvas를 만들 수 없습니다.');
  const image = context.createImageData ? context.createImageData(width, height) : { data: new Uint8ClampedArray(width * height * 4) };
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (!mask[pixel]) continue;
    const offset = pixel * 4;
    image.data[offset] = 47; image.data[offset + 1] = 129; image.data[offset + 2] = 247; image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}
function viewPane(label, visual, width, height) {
  const pane = makeElement('section', 'ai-scoped-edit-comparison-pane');
  const heading = makeElement('h4', '', label);
  const viewport = makeElement('div', 'ai-scoped-edit-comparison-viewport');
  viewport.style.cssText = 'overflow:auto;max-height:min(48vh,520px);border:1px solid var(--border,#30363d);background:var(--panel,#161b22);';
  visual.width = width;
  visual.height = height;
  visual.style.cssText = `display:block;width:${width}px;height:${height}px;max-width:none;image-rendering:auto;`;
  viewport.append(visual); pane.append(heading, viewport);
  return { pane, viewport, visual };
}

/**
 * Creates only review DOM: original PNG, candidate PNG, and a separate exact-RGBA mask canvas.
 * The two supplied PNG byte arrays are copied before decoding and only used as image Blob sources.
 */
export async function createScopedEditComparison(originalRawPng, proposalPreviewPng) {
  const originalPng = copyPng(originalRawPng, 'originalRawPng');
  const previewPng = copyPng(proposalPreviewPng, 'proposalPreviewPng');
  const { original, preview, changes } = await decodeComparison(originalPng, previewPng);
  const root = makeElement('section', 'ai-scoped-edit-comparison');
  root.setAttribute('data-ai-scoped-edit-comparison', '');
  root.setAttribute('aria-label', '원본, 수정 후, 실제 변경 픽셀 비교');
  root.style.cssText = 'display:grid;gap:8px;margin:10px 0;color:var(--text,#c9d1d9);font-size:12px;';

  const tools = makeElement('div', 'ai-scoped-edit-comparison-tools');
  tools.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-block:1px solid var(--border,#30363d);padding:7px 0;';
  const metric = makeElement('strong', '', `실제 RGBA 변경 ${number(changes.changedPixelCount)} px`);
  const bounds = changes.bounds
    ? `x [${changes.bounds.x0}, ${changes.bounds.x1}), y [${changes.bounds.y0}, ${changes.bounds.y1})`
    : '변경 없음';
  const detail = makeElement('span', '', `${original.width} × ${original.height} px · ${bounds}`);
  detail.style.color = 'var(--text-secondary,#8b949e)';
  const zoomLabel = makeElement('label', '', '확대');
  const zoom = makeElement('input');
  zoom.type = 'range'; zoom.min = '1'; zoom.max = '400'; zoom.step = '1'; zoom.value = '100';
  zoom.setAttribute('aria-label', '세 비교 화면 확대 비율');
  const zoomValue = makeElement('output', '', '100%');
  const fit = makeElement('button', '', '전체 맞춤'); fit.type = 'button';
  tools.append(metric, detail, zoomLabel, zoom, zoomValue, fit);

  const originalImage = makeElement('img'); originalImage.alt = '원본 PNG';
  const previewImage = makeElement('img'); previewImage.alt = '수정 후 후보 PNG';
  const maskCanvas = makeElement('canvas'); maskCanvas.setAttribute('aria-label', '실제 RGBA 변경 마스크');
  const originalUrl = URL.createObjectURL(new Blob([originalPng], { type: 'image/png' }));
  const previewUrl = URL.createObjectURL(new Blob([previewPng], { type: 'image/png' }));
  originalImage.src = originalUrl; previewImage.src = previewUrl;

  const originalPane = viewPane('원본', originalImage, original.width, original.height);
  const previewPane = viewPane('수정 후', previewImage, original.width, original.height);
  const maskPane = viewPane('실제 변경 마스크', maskCanvas, original.width, original.height);
  // Assigning canvas width/height clears its bitmap, even if unchanged.
  setCanvasMask(maskCanvas, original.width, original.height, changes.mask);
  const grid = makeElement('div', 'ai-scoped-edit-comparison-grid');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;min-width:680px;';
  grid.append(originalPane.pane, previewPane.pane, maskPane.pane);
  const legend = makeElement('p', '', '파란색은 원본과 수정 후 PNG의 RGBA 값이 실제로 다른 픽셀입니다. 마스크는 별도 Canvas이며 두 PNG 파일을 다시 인코딩하거나 변경하지 않습니다.');
  legend.style.cssText = 'margin:0;color:var(--text-secondary,#8b949e);font-size:11px;line-height:1.4;';
  root.append(tools, grid, legend);

  const panes = [originalPane, previewPane, maskPane];
  let synchronizing = false;
  for (const { viewport } of panes) {
    viewport.addEventListener('scroll', () => {
      if (synchronizing) return;
      synchronizing = true;
      for (const peer of panes) if (peer.viewport !== viewport) {
        peer.viewport.scrollLeft = viewport.scrollLeft;
        peer.viewport.scrollTop = viewport.scrollTop;
      }
      synchronizing = false;
    });
  }
  const applyZoom = () => {
    const scale = Number(zoom.value) / 100;
    zoomValue.value = `${zoom.value}%`; zoomValue.textContent = `${zoom.value}%`;
    for (const { visual } of panes) {
      visual.style.width = `${Math.max(1, Math.round(original.width * scale))}px`;
      visual.style.height = `${Math.max(1, Math.round(original.height * scale))}px`;
      visual.style.imageRendering = scale >= 1 ? 'pixelated' : 'auto';
    }
  };
  zoom.addEventListener('input', applyZoom);
  const fitViews = () => {
    const widths = panes.map(pane => pane.viewport.clientWidth).filter(value => value > 0);
    if (!widths.length) return;
    zoom.value = String(Math.max(1, Math.min(100, Math.floor(Math.min(...widths) / original.width * 100))));
    applyZoom();
    for (const pane of panes) { pane.viewport.scrollLeft = 0; pane.viewport.scrollTop = 0; }
  };
  fit.addEventListener('click', fitViews);
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { if (root.isConnected) fitViews(); });
  root.dispose = () => { URL.revokeObjectURL(originalUrl); URL.revokeObjectURL(previewUrl); };
  return root;
}
