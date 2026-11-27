import { registerEscapeLayer } from './escape-layers.js?v=1.7.0-four-session-integration';
import { shortcutKey } from './platform.js?v=1.7.0-four-session-integration';
import { createImageEraseProcessor } from './ai-image-erase-processor.js?v=1.7.0-four-session-integration';
export { eraseImagePolygon, eraseImageRegion } from './ai-image-erase-core.js?v=1.7.0-four-session-integration';
import { getImageStageGeometry } from './ai-image-comments.js?v=1.7.0-four-session-integration';
import { flattenPieces } from './ai-image-pieces-core.js?v=1.7.0-four-session-integration';
import { squareBrushSegments } from './image-erase-mask.js?v=1.7.0-four-session-integration';
import { createPointerMagnifier, rasterMagnifierSample, cropMagnifierEnabled, mountCropMagnifierToggle } from './tools/pointer-magnifier.js?v=1.7.0-four-session-integration';

const SVG_NS = 'http://www.w3.org/2000/svg';
// 11-25 밤샘 검수: 시안 v6 기본 24px(64px는 한 번에 점선 한 구간이 통째로 지워졌다).
export const DEFAULT_ERASE_DIAMETER = 24;

export { polygonPixelMask } from './polygon-mask.js?v=1.7.0-four-session-integration';

export function createLocalImageEraseController({ panel, getTarget, isBusy, isSaving = () => false, resolveSource, previewChanged, commit, status }) {
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
  let mode = 'brush', background = 'white', tip = 'round'; // 11-26 사용자: 지운 자리 기본은 흰색
  const tipSelect = panel.querySelector('[data-ai-erase-tip]');
  // 11-25 밤샘 검수: 시안 v6처럼 지우개에도 확대경(기본 켬). 켬/끔은 이 컴퓨터에 기억한다.
  let removeMagnifierToggle = () => {};
  if (options) {
    const host = doc.createElement('span'); host.className = 'ai-erase-magnifier';
    const note = options.querySelector(':scope > small');
    if (note) note.before(host); else options.append(host);
    const remove = mountCropMagnifierToggle(host, 'erase', '확대경');
    removeMagnifierToggle = () => { remove(); host.remove(); };
  }
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
    if (destroyed) return;
    cancel(); active = value && eligible(getTarget()) && !isBusy() && panel.dataset.aiSharingMode !== 'view';
    panel.dataset.aiLocalEraseActive = String(active);
    panel.dispatchEvent(new CustomEvent('5e:ai-local-erase-tool-change'));
    refresh();
  }
  function refresh() {
    // A late worker/preview completion must not remount listeners after dispose.
    if (destroyed) return;
    // 같은 값은 다시 쓰지 않는다 — 속성을 쓸 때마다 패널을 지켜보는 다른 동기화가 한 번씩 더 돈다(11-28 성능 기준).
    const put = (node, key, value) => { if (node[key] !== value) node[key] = value; };
    const item = getTarget(), draft = getDraft(item), history = historyFor(item);
    const disabled = isBusy() || !eligible(item) || panel.dataset.aiSharingMode === 'view';
    const historyDisabled = !eligible(item) || panel.dataset.aiSharingMode === 'view' || Boolean(pending) || isSaving();
    if (disabled && active) { active = false; cancel(); panel.dataset.aiLocalEraseActive = 'false'; }
    panel.dataset.aiEditDraft = String(Boolean(draft));
    if (saveButton) { put(saveButton,'hidden',!draft); put(saveButton,'disabled',disabled || Boolean(pending)); }
    if (discardButton) { put(discardButton,'hidden',!draft && !history?.future.length); put(discardButton,'disabled',disabled || Boolean(pending)); }
    const historyControls = panel.querySelector('[data-ai-edit-history]');
    if (historyControls) put(historyControls,'hidden',!eligible(item));
    if (undoButton) put(undoButton,'disabled',historyDisabled || !history?.past.length);
    if (redoButton) put(redoButton,'disabled',historyDisabled || !history?.future.length);
    if (button) {
      (options || button).toggleAttribute('data-escape-layer', active);
      put(button,'disabled',disabled || Boolean(pending));
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-expanded', String(active));
      put(button,'title',disabled ? '이미지 수정본을 선택하면 사용할 수 있습니다.' : '그림만 지웁니다. 편집을 끝낸 뒤 수정 저장을 누르세요. Esc: 도구 닫기');
    }
    if (options) put(options,'hidden',!active);
    for (const b of panel.querySelectorAll('[data-ai-erase-mode]')) b.setAttribute('aria-pressed', String(b.dataset.aiEraseMode === mode));
    if (tipSelect) { tipSelect.value = tip; put(tipSelect,'disabled',mode !== 'brush'); }
    if (size) { put(size,'disabled',mode !== 'brush'); put(panel.querySelector('[data-ai-erase-size-value]'),'textContent',`${size.value} px`); }
    for (const [bound, entry] of bindings) {
      if (!entry.img.isConnected) { entry.dispose(); bindings.delete(bound); }
      else {
        entry.stage.classList.toggle('is-ai-local-erasing', active && bound === item);
        entry.stage.dataset.aiEraseMode = mode;
        if (!active || bound !== item) entry.hideCursor(); else entry.redraw();
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
    if (g.mode === 'brush' && g.tip === 'square') {
      g.path.setAttribute('d', squarePathData(g.points, g.diameter));
    } else if (g.mode === 'brush') {
      g.path.setAttribute('d', `M ${g.points[0].x} ${g.points[0].y} ` + (g.points.length === 1 ? `l .001 0` : g.points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')));
      g.path.setAttribute('stroke-width', g.diameter);
    } else if (g.mode === 'loop') {
      g.path.setAttribute('d', `M ${g.points[0].x} ${g.points[0].y} ` + g.points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ') + ' Z');
    } else {
      const a=g.points[0],b=g.points.at(-1);
      for (const [k,v] of Object.entries({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)})) g.path.setAttribute(k,v);
    }
  }
  // 11-26: 사각 끝으로 문지른 자리 — 구간마다 두 끝 정사각형의 껍질(지우는 마스크와 같은 모양).
  function squarePathData(points, diameter) {
    return squareBrushSegments(points, diameter).map(poly => 'M ' + poly.map(p => `${p.x} ${p.y}`).join(' L ') + ' Z').join(' ');
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
    panel.dispatchEvent(new CustomEvent('5e:ai-edit-draft-change'));
    return displayed && ownsStatus();
  }
  function bind(item, stage, img) {
    if (destroyed) return;
    bindings.get(item)?.dispose();
    const disposers = [];
    const surface = stage.closest('.ai-image-card') || stage.parentElement || stage;
    let cursor = null, lastPointer = null, cursorFrame = null;
    const hideCursor = () => {
      if (cursorFrame !== null) win.cancelAnimationFrame(cursorFrame);
      cursorFrame = null; cursor?.remove(); cursor = null; lastPointer = null;
    };
    // 11-26: 누를 때·지우는 동안에도 지우개 끝을 계속 보인다 — 예전에는 누를 때마다 끝과 확대경이 사라져 깜박였다.
    const cursorAvailable = () => active && !destroyed && !isBusy()
      && !panel.hidden && !panel.inert && panel.dataset.aiSharingMode !== 'view'
      && img.isConnected && getTarget() === item && mode === 'brush';
    const drawCursor = () => {
      cursorFrame = null;
      if (!cursorAvailable() || !lastPointer) { hideCursor(); return; }
      const point = position(lastPointer, img);
      if (!point
        || point.x < 0 || point.y < 0 || point.x > img.naturalWidth || point.y > img.naturalHeight
        || lastPointer.target?.closest?.('button,input,textarea,select')) { hideCursor(); return; }
      if (!cursor) {
        cursor = overlayFor(stage, img, 'ai-local-erase-cursor');
      }
      const shape = tip === 'square' ? 'rect' : 'circle';
      if (cursor.firstElementChild?.localName !== shape) {
        cursor.replaceChildren();
        for (const className of ['ai-erase-ring-outer', 'ai-erase-ring-inner']) {
          const ring = doc.createElementNS(SVG_NS, shape); ring.classList.add(className);
          ring.setAttribute('vector-effect', 'non-scaling-stroke'); cursor.append(ring);
        }
      }
      placeOverlay(cursor, stage, img);
      const d = Number(size?.value || DEFAULT_ERASE_DIAMETER);
      for (const ring of cursor.children) {
        if (shape === 'rect') { ring.setAttribute('x', point.x - d/2); ring.setAttribute('y', point.y - d/2); ring.setAttribute('width', d); ring.setAttribute('height', d); }
        else { ring.setAttribute('cx', point.x); ring.setAttribute('cy', point.y); ring.setAttribute('r', d/2); }
      }
    };
    const showCursor = event => {
      if (!cursorAvailable()) { hideCursor(); return; }
      lastPointer = { clientX: event.clientX, clientY: event.clientY, target: event.target };
      // Keep the newest input, but read current image geometry only at paint.
      // Scroll/zoom notifications share this frame; no stale bounds are cached.
      if (cursorFrame === null) cursorFrame = win.requestAnimationFrame(drawCursor);
    };
    const stillOver = event => { const hit = doc.elementFromPoint?.(event.clientX, event.clientY); return Boolean(hit && surface.contains(hit)); };
    const on = (name, callback) => { surface.addEventListener(name, callback, true); disposers.push(() => surface.removeEventListener(name, callback, true)); };
    const magnifier = createPointerMagnifier({ surface, id: 'ai-erase-magnifier',
      available: () => active && cropMagnifierEnabled('erase') && img.isConnected && getTarget() === item && !panel.hidden,
      sample: pointer => { const source = rasterMagnifierSample(img, pointer); if (source) source.overlays = magnifierOverlays(source); return source; } });
    // 11-26: 확대경 안에도 지울 자리를 보인다 — 문지르는 중인 자국·둘러싼 영역(지우기 처리 중인 것 포함)과 지우개 끝.
    const magnifierOverlays = source => {
      const out = [], accent = '#0969da';
      const copy = (node, overlay) => {
        const clone = node.cloneNode(true); clone.removeAttribute('class');
        if (overlay.dataset.mode === 'brush' && overlay.dataset.tip !== 'square')
          Object.assign(clone.style, { fill: 'none', stroke: accent, strokeOpacity: '.4', strokeLinecap: 'round', strokeLinejoin: 'round' });
        else if (overlay.dataset.mode === 'brush') Object.assign(clone.style, { fill: accent, fillOpacity: '.4', stroke: 'none' });
        else { Object.assign(clone.style, { fill: accent, fillOpacity: '.15', stroke: accent, strokeWidth: '1.5px', strokeDasharray: '5 3' }); clone.setAttribute('vector-effect', 'non-scaling-stroke'); }
        out.push(clone);
      };
      for (const overlay of new Set([pending?.overlay, gesture?.stage === stage ? gesture.overlay : null])) {
        if (!overlay?.isConnected) continue;
        for (const node of overlay.children) copy(node, overlay);
      }
      if (mode === 'brush') {
        const d = Number(size?.value || DEFAULT_ERASE_DIAMETER);
        for (const [color, width] of [['#111', '3px'], ['#fff', '1px']]) {
          const ring = doc.createElementNS(SVG_NS, tip === 'square' ? 'rect' : 'circle');
          if (tip === 'square') { ring.setAttribute('x', source.x - d/2); ring.setAttribute('y', source.y - d/2); ring.setAttribute('width', d); ring.setAttribute('height', d); }
          else { ring.setAttribute('cx', source.x); ring.setAttribute('cy', source.y); ring.setAttribute('r', d/2); }
          ring.setAttribute('vector-effect', 'non-scaling-stroke');
          Object.assign(ring.style, { fill: 'none', stroke: color, strokeWidth: width });
          out.push(ring);
        }
      }
      return out;
    };
    disposers.push(() => magnifier.destroy());
    on('pointerdown', event => {
      if (!active || pending || isBusy() || getTarget() !== item || event.button !== 0 || event.isPrimary === false
        || panel.dataset.aiSharingMode === 'view' || !eligible(item)) return;
      if (event.target.closest?.('button,input,textarea,select') && !event.target.closest?.('[data-ai-comment-marker]')) return;
      const point = position(event, img); if (!point) return;
      if (point.x < 0 || point.y < 0 || point.x > img.naturalWidth || point.y > img.naturalHeight) return;
      event.preventDefault(); event.stopImmediatePropagation(); clearGesture();
      const overlay = overlayFor(stage, img, 'ai-local-erase-overlay'); overlay.dataset.mode = mode; overlay.dataset.tip = tip;
      const path = doc.createElementNS(SVG_NS, mode === 'rect' ? 'rect' : 'path');
      if (mode !== 'brush') path.setAttribute('vector-effect', 'non-scaling-stroke');
      if (mode === 'loop') path.classList.add('ai-erase-loop');
      if (mode === 'brush' && tip === 'square') path.classList.add('ai-erase-square'); overlay.append(path);
      gesture = { item, stage, img, surface, mode, tip, background, diameter: Number(size?.value || DEFAULT_ERASE_DIAMETER), pointerId: event.pointerId,
        baseData: item.data, draftData: getDraft(item)?.data, displaySource: img.src,
        points: [point], overlay, path, lastX: event.clientX, lastY: event.clientY };
      draw(gesture); showCursor(event); magnifier.move({ x: event.clientX, y: event.clientY }); try { surface.setPointerCapture(event.pointerId); } catch {}
    });
    on('pointermove', event => {
      const g = gesture;
      if (!g) { showCursor(event); magnifier.move({ x: event.clientX, y: event.clientY }); return; }
      if (g.stage !== stage || event.pointerId !== g.pointerId) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!valid(g)) { cancel(); return; }
      showCursor(event); magnifier.move({ x: event.clientX, y: event.clientY });
      if (Math.hypot(event.clientX - g.lastX, event.clientY - g.lastY) < 2) return;
      if (g.mode !== 'rect' && g.points.length >= 4095) {
        cancel();
        status('지우개 경로가 너무 깁니다. 짧게 나누어 지워 주세요. 이전 편집은 유지됩니다.', 'warn');
        return;
      }
      const point = position(event, img); if (!point) return;
      if (g.mode === 'rect') g.points[1] = point; else g.points.push(point);
      g.lastX = event.clientX; g.lastY = event.clientY; scheduleDraw(g); magnifier.move({ x: event.clientX, y: event.clientY });
    });
    // 11-26: 누른 뒤 포인터 잡기(capture)를 풀 때 브라우저가 pointerleave를 보내 지우개 끝·확대경이 사라졌다가
    // 마우스를 움직여야 다시 나타났다(깜빡임). 포인터가 실제로 그림 위에 있으면 무시한다.
    on('pointerleave', event => { if (stillOver(event)) return; hideCursor(); magnifier.hide(); });
    on('pointerup', event => {
      const g = gesture; if (!g || g.stage !== stage || event.pointerId !== g.pointerId) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const point = position(event, img); if (point) { if (g.mode === 'rect') g.points[1] = point; else g.points.push(point); }
      const validAtEnd = valid(g) && !(g.mode === 'loop' && g.points.length < 3); if (validAtEnd) draw(g); clearGesture({ keepOverlay: validAtEnd });
      if (!validAtEnd) return;
      const revision = ++sequence, controller = new AbortController(); controller.overlay = g.overlay; pending = controller; refresh();
      const current = () => sequence === revision && valid(g) && !controller.signal.aborted;
      void (async () => {
        const existing = getDraft(item);
        // 11-26: 떼어 낸 조각이 있으면 바탕에 합친 뒤 지운다(조각도 함께 지워지게).
        const source = existing?.pieces?.length ? await flattenPieces(existing.data, existing.pieces) : existing?.data || await resolveSource(item);
        if (!current()) return;
        const result = await processor.erase(source, { mode: g.mode, points: g.points, diameter: g.diameter, tip: g.tip, background: g.background }, { signal: controller.signal });
        if (!current()) return;
        if (result && (result.width !== g.img.naturalWidth || result.height !== g.img.naturalHeight)) throw new Error('이미지 크기가 변경되어 지우기를 취소했습니다. 다시 영역을 지정하세요.');
        if (result) {
          const { data, ...operation } = result;
          const history = historyFor(item, true);
          history.past.push(existing || null);
          if (history.past.length > 30) history.past.shift();
          history.future = [];
          drafts.set(item.id, { ...existing, baseData: item.data, data, width: result.width, height: result.height, pieces: [],
            operations: [...(existing?.operations || []), operation] });
          if (await showPreview(item)) status('편집 중 · 모두 끝나면 수정 저장을 누르세요.', 'ok');
        } else status('변경할 그림 픽셀이 없습니다. 라벨은 별도로 유지됩니다.', 'ok');
      })().catch(error => { if (current() && error.name !== 'AbortError') status(error.message || '지우기를 완료하지 못했습니다. 저장된 버전은 유지됩니다.', 'error'); })
        .finally(() => { g.overlay.remove(); if (pending === controller) pending = null; refresh(); magnifier.refresh(); });
    });
    on('pointercancel', () => { clearGesture(); hideCursor(); });
    on('lostpointercapture', () => clearGesture());
    const reposition = () => { if (lastPointer) showCursor(lastPointer); };
    surface.addEventListener('scroll', reposition, { passive: true });
    panel.addEventListener('5e:ai-workbench-geometry-change', reposition);
    img.addEventListener('load', reposition);
    disposers.push(() => surface.removeEventListener('scroll', reposition), () => panel.removeEventListener('5e:ai-workbench-geometry-change', reposition), () => img.removeEventListener('load', reposition));
    const entry = { stage, img, redraw: () => { if (lastPointer) { showCursor(lastPointer); magnifier.refresh(); } }, hideCursor: () => { hideCursor(); magnifier.hide(); }, dispose: () => { if (gesture?.stage === stage) cancel(); hideCursor(); disposers.forEach(fn => fn()); stage.classList.remove('is-ai-local-erasing'); delete stage.dataset.aiEraseMode; } };
    bindings.set(item, entry); refresh();
  }
  async function save() {
    const item = getTarget();
    let draft = getDraft(item);
    if (!draft || pending || isBusy() || panel.dataset.aiSharingMode === 'view') return;
    // 11-26: 저장할 때 떼어 낸 조각을 바탕 그림에 합친다.
    if (draft.pieces?.length) {
      try { const data = await flattenPieces(draft.data, draft.pieces); if (getDraft(item) !== draft) return; draft = { ...draft, data, pieces: [] }; drafts.set(item.id, draft); }
      catch { status('조각을 합치지 못했습니다. 편집 내용은 유지됩니다.', 'error'); return; }
    }
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
    if (!source?.length || pending || isSaving() || panel.hidden || panel.inert || panel.dataset.aiSharingMode === 'view') return;
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
  listen(tipSelect, 'change', event => { cancel(); tip = event.target.value === 'square' ? 'square' : 'round'; refresh(); });
  listen(panel, 'click', event => { if (event.target.closest?.('[data-ai-comment-tool]')) setActive(false); });
  listen(doc, 'keydown', event => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.isComposing && !event.defaultPrevented
      && !panel.hidden && !panel.inert && eligible(getTarget())
      && !event.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])')
      && !doc.querySelector('dialog[open],.modal-overlay:not([hidden]):not(#ai-image-panel)')) {
      const key = shortcutKey(event);
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
  // 11-26 자르기·조각 옮기기: 그림·조각·라벨을 한 번에 바꾸는 편집(실행 취소 한 단계).
  async function updateDraft(item, patch, message) {
    if (item !== getTarget() || !eligible(item) || pending || isBusy() || panel.dataset.aiSharingMode === 'view') return false;
    cancel();
    const data = item.data, existing = getDraft(item);
    const image = item.card?.querySelector('.ai-preview-stage > img');
    if (!image?.naturalWidth || !image?.naturalHeight) return false;
    const source = patch.data || existing?.data || await resolveSource(item);
    if (destroyed || item !== getTarget() || item.data !== data || getDraft(item) !== existing || pending || isBusy()) return false;
    const history = historyFor(item, true);
    history.past.push(existing || null); if (history.past.length > 30) history.past.shift(); history.future = [];
    drafts.set(item.id, { ...existing, baseData: data, data: source, width: image.naturalWidth, height: image.naturalHeight,
      operations: existing?.operations || [], ...patch });
    if (await showPreview(item) && getDraft(item) && message) status(message, 'ok');
    return true;
  }
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
  return { bind, refresh, getDraft, editLabels, updateDraft, resolveSource, save, discard, undo: () => moveHistory('undo'), redo: () => moveHistory('redo'), cancel: () => setActive(false), destroy() { destroyed = true; cancel(); processor.destroy(); drafts.clear(); histories.clear(); observer.disconnect(); bindings.forEach(entry => entry.dispose()); bindings.clear(); cleanup.forEach(fn => fn()); removeMagnifierToggle(); delete panel.dataset.aiLocalEraseActive; delete panel.dataset.aiEditDraft; } };
}
