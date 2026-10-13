import { registerEscapeLayer } from './escape-layers.js?v=1.7.0-four-session-integration';
import { createImageEraseProcessor } from './ai-image-erase-processor.js?v=1.7.0-four-session-integration';
export { eraseImagePolygon, eraseImageRegion } from './ai-image-erase-core.js?v=1.7.0-four-session-integration';
import { getImageStageGeometry } from './ai-image-comments.js?v=1.7.0-four-session-integration';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const DEFAULT_ERASE_DIAMETER = 64;

export { polygonPixelMask } from './polygon-mask.js?v=1.7.0-four-session-integration';

export function createLocalImageEraseController({ panel, getTarget, isBusy, resolveSource, previewChanged, commit, status }) {
  const doc = panel.ownerDocument, win = doc.defaultView;
  const bindings = new Map(), drafts = new Map(), histories = new Map(), cleanup = [];
  const processor = createImageEraseProcessor(win);
  let drawFrame = null;
  let active = false, gesture = null, pending = null, sequence = 0, destroyed = false;
  const button = panel.querySelector('[data-ai-local-erase]');
  const options = panel.querySelector('[data-ai-local-erase-options]');
  const saveButton = panel.querySelector('[data-ai-edit-save]');
  const discardButton = panel.querySelector('[data-ai-edit-discard]');
  const undoButton = panel.querySelector('[data-ai-edit-undo]');
  const redoButton = panel.querySelector('[data-ai-edit-redo]');
  const size = panel.querySelector('[data-ai-erase-size]');
  let mode = 'brush', background = 'transparent';
  const listen = (node, name, callback, options) => {
    node?.addEventListener(name, callback, options);
    cleanup.push(() => node?.removeEventListener(name, callback, options));
  };
  const eligible = item => item?.kind === 'generated' && !item.graphResult && !item.sceneResult
    && typeof item.data === 'string' && item.data.startsWith('data:image/png;base64,');
  // Candidate IDs survive task/card reconstruction. A draft never mutates the
  // saved candidate, its label plan, or the workspace's revision list.
  function getDraft(item) {
    const draft = drafts.get(item?.id);
    return draft?.baseData === item?.data ? draft : null;
  }
  function historyFor(item, create = false) {
    let history = histories.get(item?.id);
    if (history?.baseData !== item?.data) history = null;
    if (!history && create) {
      history = { baseData: item.data, past: [], future: [] };
      histories.set(item.id, history);
    }
    return history;
  }
  function clearGesture({ keepOverlay = false } = {}) {
    const previous = gesture; gesture = null;
    if (drawFrame !== null) win.cancelAnimationFrame(drawFrame); drawFrame = null;
    if (!keepOverlay) previous?.overlay.remove();
    try { if (previous?.surface.hasPointerCapture(previous.pointerId)) previous.surface.releasePointerCapture(previous.pointerId); } catch {}
  }
  function cancel() {
    sequence++; clearGesture(); pending?.overlay?.remove(); pending?.abort(); pending = null;
    for (const entry of bindings.values()) entry.hideCursor();
  }
  function setActive(value) {
    cancel(); active = value && eligible(getTarget()) && !isBusy() && panel.dataset.aiSharingMode !== 'view';
    panel.dataset.aiLocalEraseActive = String(active);
    panel.dispatchEvent(new CustomEvent('5e:ai-local-erase-tool-change'));
    refresh();
  }
  function refresh() {
    const item = getTarget(), draft = getDraft(item), history = historyFor(item);
    const disabled = isBusy() || !eligible(item) || panel.dataset.aiSharingMode === 'view';
    const historyDisabled = !eligible(item) || panel.dataset.aiSharingMode === 'view' || Boolean(pending);
    if (disabled && active) { active = false; cancel(); panel.dataset.aiLocalEraseActive = 'false'; }
    panel.dataset.aiEditDraft = String(Boolean(draft));
    if (saveButton) { saveButton.hidden = !draft; saveButton.disabled = disabled || Boolean(pending); }
    if (discardButton) { discardButton.hidden = !draft && !history?.future.length; discardButton.disabled = disabled || Boolean(pending); }
    const historyControls = panel.querySelector('[data-ai-edit-history]');
    if (historyControls) historyControls.hidden = !eligible(item);
    if (undoButton) undoButton.disabled = historyDisabled || !history?.past.length;
    if (redoButton) redoButton.disabled = historyDisabled || !history?.future.length;
    if (button) {
      (options || button).toggleAttribute('data-escape-layer', active);
      button.disabled = disabled || Boolean(pending);
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-expanded', String(active));
      button.title = disabled ? '이미지 수정본을 선택하면 사용할 수 있습니다.' : '그림만 지웁니다. 편집을 끝낸 뒤 수정 저장을 누르세요. Esc: 도구 닫기';
    }
    if (options) options.hidden = !active;
    for (const b of panel.querySelectorAll('[data-ai-erase-mode]')) b.setAttribute('aria-pressed', String(b.dataset.aiEraseMode === mode));
    if (size) { size.disabled = mode !== 'brush' || Boolean(pending); panel.querySelector('[data-ai-erase-size-value]').textContent = `${size.value} px`; }
    for (const [bound, entry] of bindings) {
      if (!entry.img.isConnected) { entry.dispose(); bindings.delete(bound); }
      else {
        entry.stage.classList.toggle('is-ai-local-erasing', active && bound === item);
        entry.stage.dataset.aiEraseMode = mode;
        if (!active || pending || bound !== item) entry.hideCursor();
      }
    }
    const stage = item?.card?.querySelector('.ai-preview-stage');
    const img = stage?.querySelector(':scope > img');
    if (eligible(item) && img?.isConnected && bindings.get(item)?.img !== img) bind(item, stage, img);
  }
  function position(event, image) {
    const r = image.getBoundingClientRect();
    if (!image.naturalWidth || !image.naturalHeight || r.width <= 0 || r.height <= 0) return null;
    return { x: (event.clientX - r.left) / r.width * image.naturalWidth,
      y: (event.clientY - r.top) / r.height * image.naturalHeight };
  }
  const valid = g => active && !destroyed && !isBusy() && !panel.hidden && panel.dataset.aiSharingMode !== 'view'
    && getTarget() === g.item && g.item.data === g.baseData && getDraft(g.item)?.data === g.draftData
    && g.img.isConnected && g.img.src === g.displaySource;
  function placeOverlay(overlay, stage, img) {
    const geometry = getImageStageGeometry(stage, img);
    if (!geometry) return;
    Object.assign(overlay.style, { left: `${geometry.left}px`, top: `${geometry.top}px`, width: `${geometry.width}px`, height: `${geometry.height}px` });
  }
  function overlayFor(stage, img, className) {
    const overlay = doc.createElementNS(SVG_NS, 'svg'); overlay.classList.add(className);
    // Transient interaction overlays are exempt from candidate/menu rebuilding.
    overlay.dataset.aiCommentDragPreview = '';
    overlay.setAttribute('aria-hidden', 'true'); overlay.setAttribute('viewBox', `0 0 ${img.naturalWidth} ${img.naturalHeight}`);
    stage.append(overlay); placeOverlay(overlay, stage, img); return overlay;
  }
  function draw(g) {
    if (g.mode === 'brush') {
      g.path.setAttribute('d', `M ${g.points[0].x} ${g.points[0].y} ` + (g.points.length === 1 ? `l .001 0` : g.points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')));
      g.path.setAttribute('stroke-width', g.diameter);
    } else {
      const a=g.points[0],b=g.points.at(-1);
      for (const [k,v] of Object.entries({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)})) g.path.setAttribute(k,v);
    }
  }
  function scheduleDraw(g) {
    if (drawFrame !== null) return;
    drawFrame = win.requestAnimationFrame(() => { drawFrame = null; if (gesture === g) draw(g); });
  }
  async function showPreview(item) {
    const revision = sequence;
    const ownsStatus = () => !destroyed && sequence === revision && !panel.hidden && !panel.inert && getTarget() === item;
    let displayed = true;
    try { await previewChanged(item); }
    catch (error) {
      displayed = false;
      if (ownsStatus()) status(error.message || '편집 미리보기를 표시하지 못했습니다. 수정 내용은 유지됩니다.', 'error');
    }
    if (!destroyed) refresh();
    return displayed && ownsStatus();
  }
  function bind(item, stage, img) {
    bindings.get(item)?.dispose();
    const disposers = [];
    const surface = stage.closest('.ai-image-card') || stage.parentElement || stage;
    let cursor = null, lastPointer = null;
    const hideCursor = () => { cursor?.remove(); cursor = null; lastPointer = null; };
    const showCursor = event => {
      const point = position(event, img);
      if (!active || pending || gesture || getTarget() !== item || mode !== 'brush' || !point
        || point.x < 0 || point.y < 0 || point.x > img.naturalWidth || point.y > img.naturalHeight
        || event.target?.closest?.('button,input,textarea,select')) { hideCursor(); return; }
      lastPointer = { clientX: event.clientX, clientY: event.clientY };
      if (!cursor) {
        cursor = overlayFor(stage, img, 'ai-local-erase-cursor');
        for (const className of ['ai-erase-ring-outer', 'ai-erase-ring-inner']) {
          const circle = doc.createElementNS(SVG_NS, 'circle'); circle.classList.add(className);
          circle.setAttribute('vector-effect', 'non-scaling-stroke'); cursor.append(circle);
        }
      }
      placeOverlay(cursor, stage, img);
      for (const circle of cursor.children) {
        circle.setAttribute('cx', point.x); circle.setAttribute('cy', point.y); circle.setAttribute('r', Number(size?.value || DEFAULT_ERASE_DIAMETER)/2);
      }
    };
    const on = (name, callback) => { surface.addEventListener(name, callback, true); disposers.push(() => surface.removeEventListener(name, callback, true)); };
    on('pointerdown', event => {
      if (!active || pending || isBusy() || getTarget() !== item || event.button !== 0 || event.isPrimary === false
        || panel.dataset.aiSharingMode === 'view' || !eligible(item)) return;
      if (event.target.closest?.('button,input,textarea,select') && !event.target.closest?.('[data-ai-comment-marker]')) return;
      const point = position(event, img); if (!point) return;
      if (point.x < 0 || point.y < 0 || point.x > img.naturalWidth || point.y > img.naturalHeight) return;
      event.preventDefault(); event.stopImmediatePropagation(); clearGesture(); hideCursor();
      const overlay = overlayFor(stage, img, 'ai-local-erase-overlay');
      const path = doc.createElementNS(SVG_NS, mode === 'brush' ? 'path' : 'rect');
      if (mode === 'rect') path.setAttribute('vector-effect', 'non-scaling-stroke'); overlay.append(path);
      gesture = { item, stage, img, surface, mode, background, diameter: Number(size?.value || DEFAULT_ERASE_DIAMETER), pointerId: event.pointerId,
        baseData: item.data, draftData: getDraft(item)?.data, displaySource: img.src,
        points: [point], overlay, path, lastX: event.clientX, lastY: event.clientY };
      draw(gesture); try { surface.setPointerCapture(event.pointerId); } catch {}
    });
    on('pointermove', event => {
      const g = gesture;
      if (!g) { showCursor(event); return; }
      if (g.stage !== stage || event.pointerId !== g.pointerId) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!valid(g)) { cancel(); return; }
      if (Math.hypot(event.clientX - g.lastX, event.clientY - g.lastY) < 2) return;
      if (g.mode === 'brush' && g.points.length >= 4095) {
        cancel();
        status('지우개 경로가 너무 깁니다. 짧게 나누어 지워 주세요. 이전 편집은 유지됩니다.', 'warn');
        return;
      }
      const point = position(event, img); if (!point) return;
      if (g.mode === 'rect') g.points[1] = point; else g.points.push(point);
      g.lastX = event.clientX; g.lastY = event.clientY; scheduleDraw(g);
    });
    on('pointerleave', () => hideCursor());
    on('pointerup', event => {
      const g = gesture; if (!g || g.stage !== stage || event.pointerId !== g.pointerId) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const point = position(event, img); if (point) { if (g.mode === 'rect') g.points[1] = point; else g.points.push(point); }
      const validAtEnd = valid(g); if (validAtEnd) draw(g); clearGesture({ keepOverlay: validAtEnd });
      if (!validAtEnd) return;
      const revision = ++sequence, controller = new AbortController(); controller.overlay = g.overlay; pending = controller; refresh();
      const current = () => sequence === revision && valid(g) && !controller.signal.aborted;
      void (async () => {
        const existing = getDraft(item);
        const source = existing?.data || await resolveSource(item);
        if (!current()) return;
        const result = await processor.erase(source, { mode: g.mode, points: g.points, diameter: g.diameter, background: g.background }, { signal: controller.signal });
        if (!current()) return;
        if (result && (result.width !== g.img.naturalWidth || result.height !== g.img.naturalHeight)) throw new Error('이미지 크기가 변경되어 지우기를 취소했습니다. 다시 영역을 지정하세요.');
        if (result) {
          const { data, ...operation } = result;
          const history = historyFor(item, true);
          history.past.push(existing || null);
          if (history.past.length > 30) history.past.shift();
          history.future = [];
          drafts.set(item.id, { ...existing, baseData: item.data, data, width: result.width, height: result.height,
            operations: [...(existing?.operations || []), operation] });
          if (await showPreview(item)) status('편집 중 · 모두 끝나면 수정 저장을 누르세요.', 'ok');
        } else status('변경할 그림 픽셀이 없습니다. 라벨은 별도로 유지됩니다.', 'ok');
      })().catch(error => { if (current() && error.name !== 'AbortError') status(error.message || '지우기를 완료하지 못했습니다. 저장된 버전은 유지됩니다.', 'error'); })
        .finally(() => { g.overlay.remove(); if (pending === controller) pending = null; refresh(); });
    });
    on('pointercancel', () => clearGesture());
    on('lostpointercapture', () => clearGesture());
    const reposition = () => { if (lastPointer) showCursor(lastPointer); };
    surface.addEventListener('scroll', reposition, { passive: true });
    panel.addEventListener('5e:ai-workbench-geometry-change', reposition);
    img.addEventListener('load', reposition);
    disposers.push(() => surface.removeEventListener('scroll', reposition), () => panel.removeEventListener('5e:ai-workbench-geometry-change', reposition), () => img.removeEventListener('load', reposition));
    const entry = { stage, img, hideCursor, dispose: () => { if (gesture?.stage === stage) cancel(); hideCursor(); disposers.forEach(fn => fn()); stage.classList.remove('is-ai-local-erasing'); delete stage.dataset.aiEraseMode; } };
    bindings.set(item, entry); refresh();
  }
  async function save() {
    const item = getTarget(), draft = getDraft(item);
    if (!draft || pending || isBusy() || panel.dataset.aiSharingMode === 'view') return;
    cancel(); const revision = sequence, controller = new AbortController(); pending = controller; refresh();
    const current = () => !destroyed && sequence === revision && !controller.signal.aborted && !isBusy()
      && getTarget() === item && getDraft(item) === draft && panel.dataset.aiSharingMode !== 'view';
    try {
      if (await commit(item, draft, current)) { drafts.delete(item.id); histories.delete(item.id); await showPreview(item); }
    } catch (error) { if (error.name !== 'AbortError' && !destroyed && getTarget() === item && getDraft(item) === draft && !panel.hidden && !panel.inert) status(error.message || '저장하지 못했습니다. 편집 내용을 유지했습니다.', 'error'); }
    finally { if (pending === controller) pending = null; refresh(); }
  }
  async function discard() {
    const item = getTarget();
    if ((!getDraft(item) && !historyFor(item)?.future.length) || pending || isBusy() || panel.dataset.aiSharingMode === 'view') return;
    cancel(); drafts.delete(item.id); histories.delete(item.id);
    const controller = new AbortController(); pending = controller; refresh();
    try {
      if (await showPreview(item)) status('저장 전 편집을 취소했습니다. 기존 수정본을 유지합니다.', 'ok');
    } finally { if (pending === controller) pending = null; refresh(); }
  }
  async function moveHistory(direction) {
    const item = getTarget(), history = historyFor(item);
    const source = direction === 'undo' ? history?.past : history?.future;
    if (!source?.length || pending || panel.hidden || panel.inert || panel.dataset.aiSharingMode === 'view') return;
    cancel();
    const destination = direction === 'undo' ? history.future : history.past;
    destination.push(getDraft(item) || null);
    // History only changes the local preview draft. The saved candidate and
    // any immutable input snapshot of an ongoing AI request stay untouched.
    const next = source.pop();
    if (next) drafts.set(item.id, next); else drafts.delete(item.id);
    const controller = new AbortController(); pending = controller; refresh();
    try {
      if (await showPreview(item) && !controller.signal.aborted && getTarget() === item) status(direction === 'undo'
        ? '직접 편집을 실행 취소했습니다. 저장된 수정본은 유지됩니다.'
        : '직접 편집을 다시 실행했습니다. 편집을 끝내면 수정 저장을 누르세요.', 'ok');
    } finally { if (pending === controller) pending = null; refresh(); }
  }
  if (button) cleanup.push(registerEscapeLayer(options || button, () => setActive(false)));
  listen(button, 'click', () => setActive(!active));
  listen(saveButton, 'click', () => void save());
  listen(discardButton, 'click', () => void discard());
  listen(undoButton, 'click', () => void moveHistory('undo'));
  listen(redoButton, 'click', () => void moveHistory('redo'));
  for (const b of panel.querySelectorAll('[data-ai-erase-mode]')) listen(b, 'click', () => { cancel(); mode=b.dataset.aiEraseMode; refresh(); });
  listen(panel.querySelector('[data-ai-erase-background]'), 'change', event => { cancel(); background=event.target.value; refresh(); });
  listen(size, 'input', () => { cancel(); refresh(); });
  listen(panel, 'click', event => { if (event.target.closest?.('[data-ai-comment-tool]')) setActive(false); });
  listen(doc, 'keydown', event => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.isComposing && !event.defaultPrevented
      && !panel.hidden && !panel.inert && eligible(getTarget())
      && !event.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])')
      && !doc.querySelector('dialog[open],.modal-overlay:not([hidden]):not(#ai-image-panel)')) {
      const key = event.key.toLowerCase();
      const direction = key === 'z' ? (event.shiftKey ? 'redo' : 'undo') : key === 'y' && event.ctrlKey ? 'redo' : null;
      if (direction) {
        // The AI editor owns its history. Never undo the hidden main canvas.
        event.preventDefault(); event.stopImmediatePropagation();
        if (!event.repeat) void moveHistory(direction);
        return;
      }
    }
  }, true);
  listen(panel, 'keydown', event => {
    if (event.key !== 'Escape' || !active || event.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    event.preventDefault(); event.stopImmediatePropagation(); setActive(false);
  }, true);
  listen(panel, '5e:ai-candidate-select', () => setActive(false));
  listen(win, '5e:ai-task-change', () => setActive(false));
  listen(win, '5e:ai-workspace-activate', () => setActive(false));
  listen(win, 'blur', () => cancel());
  listen(win, 'beforeunload', event => {
    if (!drafts.size) return;
    event.preventDefault(); event.returnValue = '';
  });
  const observer = new win.MutationObserver(() => { if (panel.hidden || panel.inert || isBusy()) setActive(false); });
  observer.observe(panel, { attributes: true, attributeFilter: ['hidden', 'inert', 'data-ai-busy'] });
  refresh();
  async function editLabels(item, labelPlan) {
    if (item !== getTarget() || !eligible(item) || pending || isBusy() || panel.dataset.aiSharingMode === 'view') return false;
    cancel();
    const data = item.data, existing = getDraft(item);
    const image = item.card?.querySelector('.ai-preview-stage > img');
    const source = existing?.data || image?.src || data;
    if (destroyed || item !== getTarget() || item.data !== data || getDraft(item) !== existing || pending || isBusy()) return false;
    if (!image?.naturalWidth || !image?.naturalHeight) return false;
    const history = historyFor(item, true);
    history.past.push(existing || null); if (history.past.length > 30) history.past.shift(); history.future = [];
    drafts.set(item.id, { ...existing, baseData: data, data: source, width: image.naturalWidth, height: image.naturalHeight,
      operations: existing?.operations || [], labelPlan: structuredClone(labelPlan) });
    if (await showPreview(item) && getDraft(item)) status('라벨 편집 중 · 모두 끝나면 수정 저장을 누르세요.', 'ok');
    return true;
  }
  return { bind, refresh, getDraft, editLabels, save, discard, undo: () => moveHistory('undo'), redo: () => moveHistory('redo'), cancel: () => setActive(false), destroy() { destroyed = true; cancel(); processor.destroy(); drafts.clear(); histories.clear(); observer.disconnect(); bindings.forEach(entry => entry.dispose()); bindings.clear(); cleanup.forEach(fn => fn()); delete panel.dataset.aiLocalEraseActive; delete panel.dataset.aiEditDraft; } };
}
