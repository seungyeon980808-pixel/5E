import { registerEscapeLayer } from './escape-layers.js?v=1.7.0-four-session-integration';
import { decodeScopedPng, encodeScopedPng } from './ai-scoped-edit-png.js?v=1.7.0-four-session-integration';
import { getImageStageGeometry } from './ai-image-comments.js?v=1.7.0-four-session-integration';
import { brushPixelMask, rectanglePixelMask } from './image-erase-mask.js?v=1.7.0-four-session-integration';

const SVG_NS = 'http://www.w3.org/2000/svg';
const abort = signal => { if (signal?.aborted) throw new DOMException('지우기 취소 · 이전 버전 유지', 'AbortError'); };

import { polygonPixelMask } from './polygon-mask.js?v=1.7.0-four-session-integration';
export { polygonPixelMask } from './polygon-mask.js?v=1.7.0-four-session-integration';

async function eraseMaskedImage(dataUrl, makeMask, { signal, background = 'transparent', minimum = 0 } = {}) {
  abort(signal);
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) throw new TypeError('PNG 수정본에서 지우개를 사용할 수 있습니다.');
  if (!['white', 'transparent'].includes(background)) throw new TypeError('지운 자리의 배경을 선택하세요.');
  const encoded = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const image = await decodeScopedPng(Uint8Array.from(encoded, c => c.charCodeAt(0)));
  abort(signal);
  const mask = makeMask(image.width, image.height);
  const pixels = new Uint8Array(image.data);
  let changedPixels = 0, maskedPixels = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) {
    maskedPixels++;
    const offset = i * 4;
    const fill = background === 'white' ? 255 : 0;
    if (pixels[offset] !== fill || pixels[offset+1] !== fill || pixels[offset+2] !== fill || pixels[offset+3] !== fill) changedPixels++;
    pixels.fill(fill, offset, offset + 4);
  }
  if (maskedPixels < minimum) throw new RangeError('지울 영역을 조금 더 크게 둘러싸 주세요.');
  if (!changedPixels) return null;
  // Retain color metadata and every RGBA byte outside the binary mask. A canvas
  // re-encode would premultiply/rewrite RGB in transparent, unselected pixels.
  const png = await encodeScopedPng({ width: image.width, height: image.height, data: pixels }, { metadata: image.metadata });
  abort(signal);
  const chunks = [];
  for (let i = 0; i < png.length; i += 8192) chunks.push(String.fromCharCode(...png.subarray(i, i + 8192)));
  return { data: 'data:image/png;base64,' + btoa(chunks.join('')), width: image.width, height: image.height,
    changedPixels, maskedPixels, outsideRgbaChanged: 0, background };
}

export async function eraseImagePolygon(dataUrl, polygon, { signal } = {}) {
  const result = await eraseMaskedImage(dataUrl, (w, h) => polygonPixelMask(w, h, polygon), { signal, minimum: 4 });
  return result && { ...result, polygon: polygon.map(p => ({ x: p.x, y: p.y })) };
}

export async function eraseImageRegion(dataUrl, { mode, points, diameter, background = 'transparent' }, { signal } = {}) {
  if (!['brush', 'rect'].includes(mode)) throw new TypeError('지우개 방식을 선택하세요.');
  const result = await eraseMaskedImage(dataUrl, (w, h) => mode === 'brush'
    ? brushPixelMask(w, h, points, diameter) : rectanglePixelMask(w, h, points), { signal, background });
  return result && { ...result, mode, points: points.map(p => ({ x:p.x, y:p.y })), ...(mode === 'brush' ? { diameter } : {}) };
}

export function createLocalImageEraseController({ panel, getTarget, isBusy, resolveSource, commit, status }) {
  const doc = panel.ownerDocument, win = doc.defaultView;
  const bindings = new Map(), cleanup = [];
  let active = false, gesture = null, pending = null, sequence = 0, destroyed = false;
  const button = panel.querySelector('[data-ai-local-erase]');
  const options = panel.querySelector('[data-ai-local-erase-options]');
  let mode = 'brush', background = 'transparent';
  const size = panel.querySelector('[data-ai-erase-size]');
  const listen = (node, name, callback, options) => {
    node?.addEventListener(name, callback, options);
    cleanup.push(() => node?.removeEventListener(name, callback, options));
  };
  const eligible = item => item?.kind === 'generated' && !item.graphResult && !item.sceneResult
    && typeof item.data === 'string' && item.data.startsWith('data:image/png;base64,');
  function clearGesture() {
    const previous = gesture; gesture = null;
    previous?.overlay.remove();
    try { if (previous?.surface.hasPointerCapture(previous.pointerId)) previous.surface.releasePointerCapture(previous.pointerId); } catch {}
  }
  function cancel() {
    sequence++; clearGesture(); pending?.abort(); pending = null;
  }
  function setActive(value) {
    cancel(); active = value && eligible(getTarget()) && !isBusy() && panel.dataset.aiSharingMode !== 'view';
    panel.dataset.aiLocalEraseActive = String(active);
    panel.dispatchEvent(new CustomEvent('5e:ai-local-erase-tool-change'));
    refresh();
  }
  function refresh() {
    const item = getTarget(), disabled = isBusy() || !eligible(item) || panel.dataset.aiSharingMode === 'view';
    if (disabled && active) { active = false; cancel(); panel.dataset.aiLocalEraseActive = 'false'; }
    if (button) {
      (options || button).toggleAttribute('data-escape-layer', active);
      button.disabled = disabled || Boolean(pending);
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-expanded', String(active));
      button.title = disabled ? '이미지 수정본을 선택하면 사용할 수 있습니다.' : '문질러 지우거나 사각 영역을 지웁니다. 이전 버전은 보존합니다. Esc: 취소';
    }
    if (options) options.hidden = !active;
    for (const b of panel.querySelectorAll('[data-ai-erase-mode]')) b.setAttribute('aria-pressed', String(b.dataset.aiEraseMode === mode));
    if (size) { size.disabled = mode !== 'brush' || Boolean(pending); panel.querySelector('[data-ai-erase-size-value]').textContent = `${size.value} px`; }
    for (const [bound, entry] of bindings) {
      if (!entry.img.isConnected) { entry.dispose(); bindings.delete(bound); }
      else entry.stage.classList.toggle('is-ai-local-erasing', active && bound === item);
    }
    // Cards are constructed detached and retained between task switches. Bind
    // lazily after attachment; reconnecting a retained card reattaches listeners.
    const stage = item?.card?.querySelector('.ai-preview-stage');
    const img = stage?.querySelector(':scope > img');
    if (eligible(item) && img?.isConnected && bindings.get(item)?.img !== img) bind(item, stage, img);
  }
  function position(event, image) {
    const r = image.getBoundingClientRect();
    if (!image.naturalWidth || !image.naturalHeight || r.width <= 0 || r.height <= 0) return null;
    const x = (event.clientX - r.left) / r.width * image.naturalWidth;
    const y = (event.clientY - r.top) / r.height * image.naturalHeight;
    return { x, y };
  }
  const valid = g => active && !destroyed && !isBusy() && !panel.hidden && panel.dataset.aiSharingMode !== 'view'
    && getTarget() === g.item && g.item.data === g.data && g.img.isConnected && g.img.src === g.displaySource;
  function draw(g) {
    const geometry = getImageStageGeometry(g.stage, g.img);
    if (!geometry) return;
    Object.assign(g.overlay.style, { left: `${geometry.left}px`, top: `${geometry.top}px`, width: `${geometry.width}px`, height: `${geometry.height}px` });
    if (g.mode === 'brush') {
      g.path.setAttribute('d', `M ${g.points[0].x} ${g.points[0].y} ` + (g.points.length === 1 ? `l .001 0` : g.points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')));
      g.path.setAttribute('stroke-width', g.diameter);
    } else {
      const a=g.points[0],b=g.points.at(-1);
      for (const [k,v] of Object.entries({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)})) g.path.setAttribute(k,v);
    }
  }
  function bind(item, stage, img) {
    bindings.get(item)?.dispose();
    const disposers = [];
    const surface = stage.closest('.ai-image-card') || stage.parentElement || stage;
    const on = (name, callback) => { surface.addEventListener(name, callback, true); disposers.push(() => surface.removeEventListener(name, callback, true)); };
    on('pointerdown', event => {
      if (!active || pending || isBusy() || getTarget() !== item || event.button !== 0 || event.isPrimary === false
        || panel.dataset.aiSharingMode === 'view' || !eligible(item)) return;
      if (event.target.closest?.('button,input,textarea,select') && !event.target.closest?.('[data-ai-comment-marker]')) return;
      const point = position(event, img); if (!point) return;
      event.preventDefault(); event.stopImmediatePropagation(); clearGesture();
      const overlay = doc.createElementNS(SVG_NS, 'svg'); overlay.classList.add('ai-local-erase-overlay');
      // Existing workbench observer exempts transient interaction previews from
      // candidate/menu rebuilding; this is a preview, never a stored comment.
      overlay.dataset.aiCommentDragPreview = '';
      overlay.setAttribute('aria-hidden', 'true'); overlay.setAttribute('viewBox', `0 0 ${img.naturalWidth} ${img.naturalHeight}`);
      const path = doc.createElementNS(SVG_NS, mode === 'brush' ? 'path' : 'rect');
      if (mode === 'rect') path.setAttribute('vector-effect', 'non-scaling-stroke'); overlay.append(path); stage.append(overlay);
      gesture = { item, stage, img, surface, mode, background, diameter: Math.min(32000, Number(size?.value || 20) * img.naturalWidth / img.getBoundingClientRect().width), pointerId: event.pointerId, data: item.data, displaySource: img.src,
        points: [point], overlay, path, lastX: event.clientX, lastY: event.clientY };
      draw(gesture); try { surface.setPointerCapture(event.pointerId); } catch {}
    });
    on('pointermove', event => {
      const g = gesture; if (!g || g.stage !== stage || event.pointerId !== g.pointerId) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!valid(g)) { cancel(); return; }
      if (Math.hypot(event.clientX - g.lastX, event.clientY - g.lastY) < 2 || g.points.length >= 4095) return;
      const point = position(event, img); if (!point) return;
      g.points.push(point); g.lastX = event.clientX; g.lastY = event.clientY; draw(g);
    });
    on('pointerup', event => {
      const g = gesture; if (!g || g.stage !== stage || event.pointerId !== g.pointerId) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const point = position(event, img); if (point) g.points.push(point);
      const validAtEnd = valid(g); clearGesture();
      if (!validAtEnd) return;
      const revision = ++sequence, controller = new AbortController(); pending = controller; refresh();
      const current = () => sequence === revision && valid(g) && !controller.signal.aborted;
      void (async () => {
        const source = await resolveSource(item);
        if (!current()) return;
        const result = await eraseImageRegion(source, g, { signal: controller.signal });
        if (!current()) return;
        if (result && (result.width !== g.img.naturalWidth || result.height !== g.img.naturalHeight)) throw new Error('이미지 크기가 변경되어 지우기를 취소했습니다. 다시 영역을 지정하세요.');
        if (result) await commit(item, result, current);
        else status('변경할 픽셀이 없습니다. 이전 버전을 유지했습니다.', 'ok');
      })().catch(error => { if (current() && error.name !== 'AbortError') status(error.message || '지우기를 완료하지 못했습니다. 이전 버전은 유지됩니다.', 'error'); })
        .finally(() => { if (pending === controller) pending = null; refresh(); });
    });
    on('pointercancel', () => clearGesture());
    on('lostpointercapture', () => clearGesture());
    const entry = { stage, img, dispose: () => { if (gesture?.stage === stage) cancel(); disposers.forEach(fn => fn()); stage.classList.remove('is-ai-local-erasing'); } };
    bindings.set(item, entry); refresh();
  }
  if (button) cleanup.push(registerEscapeLayer(options || button, () => setActive(false)));
  listen(button, 'click', () => setActive(!active));
  for (const b of panel.querySelectorAll('[data-ai-erase-mode]')) listen(b, 'click', () => { cancel();mode=b.dataset.aiEraseMode;refresh(); });
  listen(panel.querySelector('[data-ai-erase-background]'), 'change', event => { cancel();background=event.target.value;refresh(); });
  listen(size, 'input', () => { cancel();refresh(); });
  listen(panel, 'click', event => { if (event.target.closest?.('[data-ai-comment-tool]')) setActive(false); });
  listen(panel, 'keydown', event => {
    if (event.key !== 'Escape' || !active || event.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    event.preventDefault(); event.stopImmediatePropagation(); setActive(false);
  }, true);
  listen(panel, '5e:ai-candidate-select', event => { if (!event.detail?.localErase) setActive(false); else refresh(); });
  listen(win, '5e:ai-task-change', () => setActive(false));
  listen(win, '5e:ai-workspace-activate', () => setActive(false));
  listen(win, 'blur', () => cancel());
  const observer = new win.MutationObserver(() => { if (panel.hidden || panel.inert || isBusy()) setActive(false); });
  observer.observe(panel, { attributes: true, attributeFilter: ['hidden', 'inert', 'data-ai-busy'] });
  refresh();
  return { bind, refresh, cancel: () => setActive(false), destroy() { destroyed = true; cancel(); observer.disconnect(); bindings.forEach(entry => entry.dispose()); bindings.clear(); cleanup.forEach(fn => fn()); delete panel.dataset.aiLocalEraseActive; } };
}
