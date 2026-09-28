const SVG_NS = 'http://www.w3.org/2000/svg';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function dimensions(value) {
  if (!Number.isFinite(value?.width) || !Number.isFinite(value?.height) || value.width <= 0 || value.height <= 0) {
    throw new RangeError('Comparison dimensions must be finite positive numbers.');
  }
  return { width: value.width, height: value.height };
}

export function snapshotComparisonRevisions(revisions) {
  if (!Array.isArray(revisions) || !revisions.length) throw new TypeError('Comparison requires at least one revision.');
  const ids = new Set();
  return Object.freeze(revisions.map(item => {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw new TypeError('Comparison revision id must be unique and nonempty.');
    if (typeof item.src !== 'string' || !item.src || typeof item.label !== 'string' || !item.label) throw new TypeError('Comparison revision requires label and src.');
    ids.add(item.id);
    const size = item.width !== undefined || item.height !== undefined ? dimensions(item) : {};
    return Object.freeze({ id: item.id, label: item.label, src: item.src, ...size, kind: item.kind === 'original' ? 'original' : 'revision' });
  }));
}

export function comparisonDefaults(revisions, selectedRevisionId) {
  const right = revisions.find(item => item.id === selectedRevisionId) || revisions.at(-1);
  if (!right) throw new TypeError('Comparison requires at least one revision.');
  const index = revisions.indexOf(right);
  const left = revisions.slice(0, index).findLast(item => item.kind !== 'original')
    || revisions.find(item => item.kind === 'original' && item !== right)
    || revisions.find(item => item !== right) || right;
  return { leftRevisionId: left.id, rightRevisionId: right.id };
}

/** Both SVG layers share a camera; each image uniformly contains within the common frame. */
export function comparisonGeometry(left, right, viewport) {
  dimensions(left); dimensions(right); dimensions(viewport);
  const extent = Math.max(left.width, left.height, right.width, right.height);
  const normalize = size => {
    const scale = extent / Math.max(size.width, size.height);
    return { width: size.width * scale, height: size.height * scale };
  };
  const normalized = [normalize(left), normalize(right)];
  const bounds = { width: Math.max(...normalized.map(size => size.width)), height: Math.max(...normalized.map(size => size.height)) };
  const zoom = Number.isFinite(viewport.zoom) ? clamp(viewport.zoom, 0.25, 8) : 1;
  const scale = Math.min(viewport.width / bounds.width, viewport.height / bounds.height) * zoom;
  const width = viewport.width / scale, height = viewport.height / scale;
  const place = size => {
    const fit = Math.min(bounds.width / size.width, bounds.height / size.height);
    const width = size.width * fit, height = size.height * fit;
    return { x: (bounds.width - width) / 2, y: (bounds.height - height) / 2, width, height };
  };
  return {
    bounds, scale, left: place(left), right: place(right),
    viewBox: { x: (bounds.width - width) / 2 + (Number.isFinite(viewport.panX) ? viewport.panX : 0), y: (bounds.height - height) / 2 + (Number.isFinite(viewport.panY) ? viewport.panY : 0), width, height },
  };
}

function node(doc, tag, className, text) {
  const element = doc.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function button(doc, text) {
  const element = node(doc, 'button', '', text);
  element.type = 'button';
  return element;
}
function decodeImage(doc, src, signal) {
  return new Promise((resolve, reject) => {
    const image = doc.createElement('img');
    const cleanup = () => { image.onload = null; image.onerror = null; signal.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); image.removeAttribute('src'); reject(new DOMException('Comparison image cancelled.', 'AbortError')); };
    image.onload = async () => {
      try {
        if (image.decode) await image.decode();
        if (signal.aborted) return;
        const size = dimensions({ width: image.naturalWidth, height: image.naturalHeight });
        cleanup(); resolve(size);
      } catch (error) { cleanup(); reject(error); }
    };
    image.onerror = () => { cleanup(); reject(new Error('이미지를 불러오지 못했습니다. 다시 시도해 주세요.')); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort(); else image.src = src;
  });
}

/** Mounts a review-only snapshot. update replaces descriptors without writing to caller history. */
export function mountRevisionComparison(container, options) {
  let revisions = snapshotComparisonRevisions(options.revisions);
  const doc = container.ownerDocument;
  const win = doc.defaultView;
  const events = new win.AbortController();
  const listen = (target, type, handler, extra = {}) => target.addEventListener(type, handler, { ...extra, signal: events.signal });
  const root = node(doc, 'section', 'ai-comparison');
  root.setAttribute('aria-label', '원본과 수정본 비교');
  const selectors = node(doc, 'div', 'ai-comparison-selectors');
  const toolbar = node(doc, 'div', 'ai-comparison-toolbar');
  const wipeButton = button(doc, '겹쳐 비교');
  const sideButton = button(doc, '나란히 비교');
  const zoomOut = button(doc, '−'); zoomOut.setAttribute('aria-label', '비교 축소');
  const zoomIn = button(doc, '+'); zoomIn.setAttribute('aria-label', '비교 확대');
  const zoomValue = node(doc, 'output', 'ai-comparison-zoom');
  const fit = button(doc, '전체 맞춤');
  toolbar.append(wipeButton, sideButton, zoomOut, zoomValue, zoomIn, fit);
  const stage = node(doc, 'div', 'ai-comparison-stage');
  stage.tabIndex = 0; stage.setAttribute('aria-label', '비교 화면. 드래그 또는 방향키로 함께 이동');
  const divider = node(doc, 'div', 'ai-comparison-divider');
  divider.tabIndex = 0; divider.setAttribute('role', 'slider');
  divider.setAttribute('aria-label', '원본과 수정본 비교 경계');
  divider.setAttribute('aria-valuemin', '0'); divider.setAttribute('aria-valuemax', '100');
  divider.setAttribute('aria-orientation', 'horizontal');
  divider.append(node(doc, 'span', '', '↔'));
  const hint = node(doc, 'p', 'ai-comparison-hint', '경계를 좌우로 끌어 비교 · 그림을 끌어 함께 이동 · 휠로 확대');
  let mode = 'wipe', ratio = 0.5, zoom = 1, panX = 0, panY = 0, disposed = false, drag = null, geometry;
  const defaults = comparisonDefaults(revisions, options.selectedRevisionId);
  const sides = ['left', 'right'].map((name, index) => {
    const group = node(doc, 'div', 'ai-comparison-choice');
    const label = node(doc, 'label', '', index ? '오른쪽 · 수정본' : '왼쪽 · 기준');
    const select = node(doc, 'select'); select.setAttribute('aria-label', index ? '오른쪽 비교 버전' : '왼쪽 비교 버전');
    label.append(select);
    const status = node(doc, 'span', 'ai-comparison-status'); status.setAttribute('role', 'status');
    const retry = button(doc, '다시 시도'); retry.hidden = true;
    group.append(label, status, retry); selectors.append(group);
    const pane = node(doc, 'div', `ai-comparison-pane ai-comparison-${name}`);
    const svg = doc.createElementNS(SVG_NS, 'svg'); svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const image = doc.createElementNS(SVG_NS, 'image'); image.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.append(image); pane.append(svg); stage.append(pane);
    const id = options[`${name}RevisionId`] || defaults[`${name}RevisionId`];
    if (!revisions.some(item => item.id === id)) throw new RangeError(`Unknown comparison revision id: ${id}`);
    const side = { name, select, status, retry, pane, svg, image, id, size: null, state: 'loading', request: null, generation: 0, pending: Promise.resolve() };
    listen(select, 'change', () => { side.id = select.value; load(side); });
    listen(retry, 'click', () => load(side));
    return side;
  });
  stage.append(divider); root.append(selectors, toolbar, stage, hint); container.append(root);

  function render() {
    if (disposed) return;
    root.dataset.mode = mode;
    wipeButton.setAttribute('aria-pressed', String(mode === 'wipe'));
    sideButton.setAttribute('aria-pressed', String(mode === 'side-by-side'));
    divider.hidden = mode !== 'wipe';
    divider.style.left = `${ratio * 100}%`;
    divider.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    divider.setAttribute('aria-valuetext', `왼쪽 ${Math.round(ratio * 100)}%, 오른쪽 ${Math.round((1 - ratio) * 100)}%`);
    zoomValue.textContent = `${Math.round(zoom * 100)}%`;
    zoomOut.disabled = zoom <= 0.25; zoomIn.disabled = zoom >= 8;
    const width = sides[0].pane.clientWidth || 1, height = sides[0].pane.clientHeight || 1;
    const sizes = sides.map(side => side.size || revisions.find(item => item.id === side.id));
    const valid = sizes.map(size => size?.width && size?.height ? size : { width: 1, height: 1 });
    geometry = comparisonGeometry(valid[0], valid[1], { width, height, zoom, panX, panY });
    const viewBox = Object.values(geometry.viewBox).join(' ');
    sides.forEach((side, index) => {
      side.pane.style.clipPath = mode === 'wipe' ? (index ? `inset(0 0 0 ${ratio * 100}%)` : `inset(0 ${(1 - ratio) * 100}% 0 0)`) : 'none';
      side.svg.setAttribute('viewBox', viewBox);
      const bounds = geometry[side.name];
      for (const [key, value] of Object.entries(bounds)) side.image.setAttribute(key, String(value));
    });
  }
  function fillSelectors() {
    for (const side of sides) {
      side.select.replaceChildren(...revisions.map(item => {
        const option = node(doc, 'option', '', item.label); option.value = item.id; return option;
      }));
      side.select.value = side.id;
    }
  }
  function load(side) {
    if (disposed) return Promise.resolve();
    side.request?.abort();
    const request = new win.AbortController(); side.request = request;
    const generation = ++side.generation;
    const item = revisions.find(value => value.id === side.id);
    side.size = null; side.state = 'loading'; side.status.textContent = '불러오는 중…'; side.retry.hidden = true;
    side.image.removeAttribute('href'); side.svg.setAttribute('aria-label', item.label);
    render();
    side.pending = decodeImage(doc, item.src, request.signal).then(size => {
      if (disposed || request.signal.aborted || generation !== side.generation) return;
      side.size = size; side.state = 'ready'; side.status.textContent = `${size.width} × ${size.height} px`;
      side.image.setAttribute('href', item.src); render();
    }).catch(error => {
      if (disposed || request.signal.aborted || generation !== side.generation) return;
      side.state = 'error'; side.status.textContent = '불러오기 실패'; side.status.title = error.message; side.retry.hidden = false;
      render();
    });
    return side.pending;
  }
  const setZoom = (value, anchor = { x: 0.5, y: 0.5 }) => {
    const next = clamp(value, 0.25, 8);
    panX += (anchor.x - 0.5) * geometry.viewBox.width * (1 - zoom / next);
    panY += (anchor.y - 0.5) * geometry.viewBox.height * (1 - zoom / next);
    zoom = next; render();
  };
  const setMode = value => { mode = value; drag = null; render(); };
  listen(wipeButton, 'click', () => setMode('wipe'));
  listen(sideButton, 'click', () => setMode('side-by-side'));
  listen(zoomOut, 'click', () => setZoom(zoom - 0.25));
  listen(zoomIn, 'click', () => setZoom(zoom + 0.25));
  listen(fit, 'click', () => { zoom = 1; panX = 0; panY = 0; ratio = 0.5; render(); });
  listen(stage, 'wheel', event => {
    event.preventDefault();
    const pane = event.target.closest('.ai-comparison-pane') || sides[0].pane;
    const rect = pane.getBoundingClientRect();
    setZoom(zoom * Math.exp(-clamp(event.deltaY, -300, 300) * 0.002), { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
  }, { passive: false });
  listen(stage, 'pointerdown', event => {
    if (event.button !== 0 || drag) return;
    event.preventDefault();
    const isDivider = divider.contains(event.target);
    const pane = event.target.closest('.ai-comparison-pane') || sides[0].pane;
    drag = { pointerId: event.pointerId, type: isDivider ? 'divider' : 'pan', x: event.clientX, y: event.clientY, panX, panY, rect: pane.getBoundingClientRect(), view: { ...geometry.viewBox } };
    (isDivider ? divider : stage).focus({ preventScroll: true });
    stage.setPointerCapture(event.pointerId);
  });
  listen(stage, 'pointermove', event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.type === 'divider') {
      const rect = stage.getBoundingClientRect(); ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    } else {
      panX = drag.panX - (event.clientX - drag.x) / drag.rect.width * drag.view.width;
      panY = drag.panY - (event.clientY - drag.y) / drag.rect.height * drag.view.height;
    }
    render();
  });
  const endDrag = event => {
    if (drag?.pointerId !== event.pointerId) return;
    drag = null;
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  };
  listen(stage, 'pointerup', endDrag); listen(stage, 'pointercancel', endDrag); listen(stage, 'lostpointercapture', () => { drag = null; });
  listen(divider, 'keydown', event => {
    const step = event.shiftKey ? 0.1 : 0.01;
    const values = { ArrowLeft: ratio - step, ArrowDown: ratio - step, ArrowRight: ratio + step, ArrowUp: ratio + step, Home: 0, End: 1 };
    if (!(event.key in values)) return;
    event.preventDefault(); event.stopPropagation(); ratio = clamp(values[event.key], 0, 1); render();
  });
  listen(stage, 'keydown', event => {
    if (event.target !== stage) return;
    const amount = 24 / geometry.scale;
    const delta = { ArrowLeft: [-amount, 0], ArrowRight: [amount, 0], ArrowUp: [0, -amount], ArrowDown: [0, amount] }[event.key];
    if (!delta) return;
    event.preventDefault(); panX += delta[0]; panY += delta[1]; render();
  });
  const observer = new win.ResizeObserver(render); observer.observe(stage);
  fillSelectors(); sides.forEach(load); render();
  return {
    element: root,
    get ready() { return Promise.all(sides.map(side => side.pending)); },
    getState() { return { disposed, mode, ratio, zoom, panX, panY, leftRevisionId: sides[0].id, rightRevisionId: sides[1].id, states: sides.map(side => side.state), viewBox: { ...geometry.viewBox }, sizes: sides.map(side => side.size ? { ...side.size } : null) }; },
    update(next) {
      if (disposed) return;
      const snapshot = next.revisions ? snapshotComparisonRevisions(next.revisions) : revisions;
      const fallback = comparisonDefaults(snapshot, next.selectedRevisionId ?? sides[1].id);
      const ids = sides.map(side => next[`${side.name}RevisionId`] ?? (next.selectedRevisionId !== undefined ? fallback[`${side.name}RevisionId`] : snapshot.some(item => item.id === side.id) ? side.id : fallback[`${side.name}RevisionId`]));
      for (const id of ids) if (!snapshot.some(item => item.id === id)) throw new RangeError(`Unknown comparison revision id: ${id}`);
      revisions = snapshot;
      sides.forEach((side, index) => { side.id = ids[index]; });
      fillSelectors(); sides.forEach(load);
    },
    dispose() {
      if (disposed) return;
      disposed = true; drag = null; events.abort(); observer.disconnect();
      for (const side of sides) { side.request?.abort(); side.image.removeAttribute('href'); }
      root.remove();
    },
  };
}

/** Modal convenience wrapper. The owner should dispose it before switching tasks. */
export function openRevisionComparison(options) {
  const doc = options.document || document;
  const previousFocus = doc.activeElement;
  const overlay = node(doc, 'div', 'ai-comparison-overlay');
  const dialog = node(doc, 'section', 'ai-comparison-dialog');
  dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-label', '원본과 수정본 비교');
  const header = node(doc, 'header', 'ai-comparison-header');
  const title = node(doc, 'strong', '', '원본과 수정본 비교');
  const close = button(doc, '닫기'); close.setAttribute('aria-label', '비교 닫기');
  header.append(title, close); dialog.append(header); overlay.append(dialog);
  let controller;
  try { controller = mountRevisionComparison(dialog, options); } catch (error) { overlay.remove(); throw error; }
  doc.documentElement.append(overlay);
  const dispose = controller.dispose;
  let closed = false;
  controller.dispose = () => {
    if (closed) return;
    closed = true; dispose(); overlay.remove();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    options.onClose?.();
  };
  close.onclick = controller.dispose;
  overlay.onpointerdown = event => { if (event.target === overlay) controller.dispose(); };
  dialog.onkeydown = event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); controller.dispose(); }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not(:disabled),select,[tabindex="0"]')].filter(element => !element.hidden && element.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  close.focus({ preventScroll: true });
  return controller;
}
