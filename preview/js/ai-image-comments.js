export const PRESERVE_UNREQUESTED = '\n수정 계약: 코멘트와 이번 요청에 명시된 변경만 허용한다. 명시되지 않은 물체·개수·연결·안팎·액체 위치·배치·색조는 선택한 수정 대상 버전대로 보존한다. 최초 원본은 과학적 의미의 근거로 함께 대조한다. 요청하지 않은 변화는 검수 실패 또는 확인 필요로 보고한다. 코멘트 표시와 번호는 출력 그림에 그리지 않는다.';

const BOX_KEYS = ['x', 'y', 'w', 'h'];
const TOOL_NAMES = new Set(['pan', 'point', 'area']);
const clamp = value => Math.max(0, Math.min(100, value));
const commentKey = (item, comment) => `${item.id}:${comment.number}`;
const commentText = comment => String(comment?.text || '');

export function normalizeCommentBox(value) {
  if (!value || value.x == null || value.y == null) return null;
  const box = Object.fromEntries(BOX_KEYS.map(key => [key, Number(value?.[key] ?? 0)]));
  if (!Object.values(box).every(Number.isFinite)) return null;
  if (box.x < 0 || box.y < 0 || box.w < 0 || box.h < 0
      || box.x + box.w > 100.001 || box.y + box.h > 100.001) return null;
  if (value?.type === 'area' && (box.w <= 0 || box.h <= 0)) return null;
  return box;
}

function normalizeCompositeRect(value) {
  if (!value || typeof value !== 'object') return null;
  if ('width' in value || 'height' in value || 'canvasWidth' in value || 'canvasHeight' in value) {
    const x = Number(value.x);
    const y = Number(value.y);
    const width = Number(value.width);
    const height = Number(value.height);
    const canvasWidth = Number(value.canvasWidth);
    const canvasHeight = Number(value.canvasHeight);
    if (![x, y, width, height, canvasWidth, canvasHeight].every(Number.isFinite)
        || canvasWidth <= 0 || canvasHeight <= 0) return null;
    return normalizeCommentBox({
      type: 'area',
      x: x / canvasWidth * 100,
      y: y / canvasHeight * 100,
      w: width / canvasWidth * 100,
      h: height / canvasHeight * 100,
    });
  }
  return normalizeCommentBox({ ...value, type: 'area' });
}

export function mapImageCommentToComposite(comment, sourceRect) {
  const box = normalizeCommentBox(comment);
  const rect = normalizeCompositeRect(sourceRect);
  if (!box || !rect) return null;
  const mapped = normalizeCommentBox({
    ...comment,
    x: rect.x + box.x / 100 * rect.w,
    y: rect.y + box.y / 100 * rect.h,
    w: box.w / 100 * rect.w,
    h: box.h / 100 * rect.h,
  });
  return mapped ? { ...comment, ...mapped } : null;
}

export function buildCommentRequest(images = [], { sourceRectsById } = {}) {
  const lines = [];
  for (const item of images) {
    for (const comment of item.comments || []) {
      const hasSourceRect = item.kind === 'reference' && sourceRectsById != null
        && (sourceRectsById instanceof Map
          ? sourceRectsById.has(item.id)
          : Object.hasOwn(sourceRectsById, item.id));
      const sourceRect = hasSourceRect
        ? (sourceRectsById instanceof Map ? sourceRectsById.get(item.id) : sourceRectsById[item.id])
        : null;
      const projected = hasSourceRect ? mapImageCommentToComposite(comment, sourceRect) : comment;
      const box = projected ? normalizeCommentBox(projected) : null;
      if (!commentText(comment).trim() || !box) continue;
      lines.push(`[${item.kind === 'reference' ? '원본' : '선택 버전'} ${item.name}; 이미지ID ${item.id}] ${comment.type === 'point' ? '점' : '영역'} ${comment.number} (x=${box.x}%, y=${box.y}%, w=${box.w}%, h=${box.h}%): ${commentText(comment).trim()}`);
    }
  }
  return lines.length ? `\n\n위치별 코멘트:\n${lines.join('\n')}` : '';
}

// getBoundingClientRect is in visual pixels. Markers are positioned in the
// stage's unscaled, scrollable CSS content coordinates (including CSS zoom).
export function getImageStageGeometry(stage, image) {
  const sr = stage.getBoundingClientRect();
  const ir = image.getBoundingClientRect();
  if (!(sr.width > 0 && sr.height > 0 && ir.width > 0 && ir.height > 0)) return null;
  const scaleX = sr.width / (stage.offsetWidth || sr.width);
  const scaleY = sr.height / (stage.offsetHeight || sr.height);
  return {
    left: (ir.left - sr.left) / scaleX + (stage.scrollLeft || 0) - (stage.clientLeft || 0),
    top: (ir.top - sr.top) / scaleY + (stage.scrollTop || 0) - (stage.clientTop || 0),
    width: ir.width / scaleX,
    height: ir.height / scaleY,
    scaleX,
    scaleY,
  };
}

export function isImageCommentTarget(item, selectedId) {
  if (!item) return false;
  if (item.kind === 'reference') return item.referenceRole === undefined || item.referenceRole === 'INPUT_SOURCE';
  return Boolean(selectedId) && item.id === selectedId;
}

export function createImageCommentController({ panel, getImages, getSelectedId, isBusy, changed }) {
  const doc = panel.ownerDocument || document;
  const win = doc.defaultView || globalThis;
  const q = selector => panel.querySelector(selector);
  const bindings = new Map();
  const cleanup = [];
  let tool = 'pan';
  let selected = null;
  let geometrySelection = null;
  let geometry = null;
  let frame = null;
  let destroyed = false;

  function listen(target, event, handler, options) {
    target?.addEventListener(event, handler, options);
    const dispose = () => target?.removeEventListener(event, handler, options);
    cleanup.push(dispose);
    return dispose;
  }

  function images() { return getImages() || []; }
  function allowed() { return images().filter(item => isImageCommentTarget(item, getSelectedId())); }
  function entries() {
    return allowed().flatMap(item => (item.comments || []).map(comment => ({ item, comment })));
  }
  function current() { return entries().find(({ item, comment }) => commentKey(item, comment) === selected); }

  function activateTab(name) {
    const chat = name === 'chat';
    panel.querySelectorAll('[data-ai-side-tab]').forEach(button => {
      const active = button.dataset.aiSideTab === (chat ? 'chat' : 'comments');
      button.classList.toggle('is-on', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (q('[data-ai-chat-panel]')) q('[data-ai-chat-panel]').hidden = !chat;
    if (q('[data-ai-comments-panel]')) q('[data-ai-comments-panel]').hidden = chat;
  }

  function select(item, comment) {
    if (isBusy()) return;
    selected = commentKey(item, comment);
    activateTab('comments');
    render();
    panel.tabIndex = -1;
    panel.focus({ preventScroll: true });
  }

  function positionBox(element, box, imageGeometry) {
    Object.assign(element.style, {
      left: `${imageGeometry.left + box.x / 100 * imageGeometry.width}px`,
      top: `${imageGeometry.top + box.y / 100 * imageGeometry.height}px`,
      width: `${box.w / 100 * imageGeometry.width}px`,
      height: `${box.h / 100 * imageGeometry.height}px`,
    });
  }

  function renderMarkers(item) {
    const entry = bindings.get(item);
    if (!entry) return;
    const { stage, img } = entry;
    stage.querySelectorAll('[data-ai-comment-marker]').forEach(marker => marker.remove());
    if (!isImageCommentTarget(item, getSelectedId())) return;
    const imageGeometry = getImageStageGeometry(stage, img);
    if (!imageGeometry) return;
    for (const comment of item.comments || []) {
      const box = normalizeCommentBox(comment);
      if (!box) continue;
      const active = commentKey(item, comment) === selected;
      if (comment.type !== 'point' && box.w > 0 && box.h > 0) {
        const outline = doc.createElement('div');
        outline.dataset.aiCommentMarker = '';
        outline.className = `ai-comment-region${active ? ' is-active' : ''}`;
        outline.setAttribute('aria-hidden', 'true');
        outline.style.pointerEvents = 'none';
        positionBox(outline, box, imageGeometry);
        stage.append(outline);
      }
      const pin = doc.createElement('button');
      pin.type = 'button';
      pin.dataset.aiCommentMarker = '';
      pin.className = `ai-comment-marker${active ? ' is-active' : ''}`;
      pin.textContent = String(comment.number);
      pin.title = commentText(comment) || '코멘트 입력';
      pin.disabled = isBusy();
      pin.setAttribute('aria-label', `${item.name} 코멘트 ${comment.number}`);
      pin.setAttribute('aria-pressed', String(active));
      Object.assign(pin.style, {
        left: `${imageGeometry.left + box.x / 100 * imageGeometry.width}px`,
        top: `${imageGeometry.top + box.y / 100 * imageGeometry.height}px`,
      });
      pin.onclick = event => { event.stopPropagation(); select(item, comment); };
      stage.append(pin);
    }
    if (entry.drag?.type === 'area' && entry.drag.box) drawPreview(entry, entry.drag.box);
  }

  function scheduleMarkers() {
    if (frame != null || destroyed) return;
    const callback = () => {
      frame = null;
      for (const item of images()) renderMarkers(item);
    };
    frame = win.requestAnimationFrame ? win.requestAnimationFrame(callback) : setTimeout(callback, 0);
  }

  function drawPreview(entry, box) {
    const imageGeometry = getImageStageGeometry(entry.stage, entry.img);
    if (!imageGeometry) return;
    if (!entry.preview) {
      entry.preview = doc.createElement('div');
      entry.preview.className = 'ai-comment-region ai-comment-drag-preview';
      entry.preview.dataset.aiCommentDragPreview = '';
      entry.preview.setAttribute('aria-hidden', 'true');
      entry.stage.append(entry.preview);
    }
    positionBox(entry.preview, box, imageGeometry);
  }

  function clearDrag(entry) {
    entry.drag = null;
    entry.preview?.remove();
    entry.preview = null;
  }

  function renderList(allEntries) {
    const list = q('[data-ai-comments]');
    if (!list) return;
    list.replaceChildren();
    if (!allEntries.length) {
      const text = doc.createElement('p');
      text.className = 'ai-comments-empty';
      const historical = getImages().filter(item => item.kind === 'generated' && item.id !== getSelectedId() && item.comments?.length);
      text.textContent = historical.length
        ? '이 버전에는 새 코멘트가 없습니다. 이전 코멘트는 원래 버전에 보관되어 있습니다. 버전 목록에서 확인할 수 있습니다.'
        : '점 또는 영역 도구로 그림에 코멘트를 남기세요. 지정하지 않은 부분은 보존합니다.';
      list.append(text);
    }
    for (const { item, comment } of allEntries) {
      const row = doc.createElement('article');
      row.className = `ai-workbench-comment${commentKey(item, comment) === selected ? ' is-active' : ''}`;
      row.dataset.aiCommentRow = '';
      row.dataset.active = String(commentKey(item, comment) === selected);
      const choose = doc.createElement('button');
      choose.type = 'button';
      choose.setAttribute('aria-pressed', String(commentKey(item, comment) === selected));
      choose.disabled = isBusy();
      choose.textContent = `${comment.number}. ${item.kind === 'reference' ? '원본' : '선택 버전'} · ${comment.type === 'point' ? '점' : '영역'}`;
      choose.onclick = () => select(item, comment);
      const editor = doc.createElement('textarea');
      editor.dataset.aiInlineEditor = '';
      editor.value = commentText(comment);
      editor.placeholder = '이 위치에서 바꿀 내용을 입력하세요.';
      editor.setAttribute('aria-label', `코멘트 ${comment.number} 내용`);
      editor.disabled = isBusy();
      editor.oninput = () => {
        if (isBusy()) return;
        comment.text = editor.value;
        selected = commentKey(item, comment);
        changed();
        updateControls(entries());
      };
      const remove = doc.createElement('button');
      remove.type = 'button';
      remove.dataset.aiInlineDelete = '';
      remove.textContent = '삭제';
      remove.setAttribute('aria-label', `코멘트 ${comment.number} 삭제`);
      remove.disabled = isBusy();
      remove.onclick = () => { selected = commentKey(item, comment); deleteSelectedComment(); };
      row.append(choose, editor, remove);
      list.append(row);
    }
  }

  function updateControls(allEntries) {
    const active = current();
    const busy = isBusy();
    const count = q('[data-ai-comments-count]');
    if (count) count.textContent = String(allEntries.length);
    const status = q('[data-ai-comment-status]');
    if (status) status.textContent = active
      ? `#${active.comment.number} · ${active.item.kind === 'reference' ? '원본' : active.item.name || '선택 버전'} · ${active.comment.type === 'point' ? '점' : '영역'}${busy ? ' · 작업 중 편집 잠김' : ' · 입력 자동 보관'}`
      : '그림이나 목록에서 코멘트를 선택하세요.';
    const completeCount = allEntries.filter(({ comment }) => commentText(comment).trim() && normalizeCommentBox(comment)).length;
    const apply = q('[data-ai-comments-apply]');
    if (apply) {
      apply.textContent = '변환하기';
      apply.disabled = busy || !allowed().length;
    }
    panel.querySelectorAll('[data-ai-comment-tool]').forEach(button => {
      button.disabled = busy;
      button.classList.toggle('is-on', button.dataset.aiCommentTool === tool);
      button.setAttribute('aria-pressed', String(button.dataset.aiCommentTool === tool));
    });
    renderGeometry(active, busy);
  }

  function renderGeometry(active, busy) {
    const editor = q('[data-ai-comment-row][data-active="true"] [data-ai-inline-editor]')
      || q('[data-ai-comment-row] [data-ai-inline-editor]');
    if (!geometry) {
      geometry = doc.createElement('div');
      geometry.dataset.aiCommentGeometry = '';
    }
    if (editor && geometry.parentElement !== editor.parentElement) editor.after(geometry);
    if (!geometry) return;
    if (geometrySelection !== selected || (!active && geometry.children.length)) {
      geometry.replaceChildren();
      geometrySelection = selected;
      if (active) {
        for (const key of BOX_KEYS) {
          if (active.comment.type === 'point' && (key === 'w' || key === 'h')) continue;
          const label = doc.createElement('label');
          label.textContent = `${({ x: '가로', y: '세로', w: '너비', h: '높이' })[key]} %`;
          const input = doc.createElement('input');
          input.type = 'number';
          input.dataset.aiGeometryKey = key;
          input.min = key === 'w' || key === 'h' ? '0.1' : '0';
          input.max = '100';
          input.step = '0.1';
          input.setAttribute('aria-label', `코멘트 ${label.textContent}`);
          input.onchange = () => {
            const entry = current();
            if (!entry || isBusy()) return;
            const next = input.value.trim() ? normalizeCommentBox({ ...entry.comment, [key]: input.value }) : null;
            if (!next) {
              input.value = String(Number(Number(entry.comment[key]).toFixed(2)));
              const status = q('[data-ai-comment-status]');
              if (status) status.textContent = '영역은 양수 크기여야 하며 이미지 경계를 벗어날 수 없습니다.';
              return;
            }
            Object.assign(entry.comment, next);
            changed();
            render();
          };
          label.append(input);
          geometry.append(label);
        }
      }
    }
    geometry.hidden = !active;
    geometry.querySelectorAll('input').forEach(input => {
      input.disabled = busy;
      if (active && doc.activeElement !== input) input.value = String(Number(Number(active.comment[input.dataset.aiGeometryKey]).toFixed(2)));
    });
  }

  function render() {
    if (destroyed) return;
    for (const [item, entry] of bindings) {
      if (entry.img.isConnected === false) { entry.dispose(); bindings.delete(item); }
    }
    for (const item of images()) renderMarkers(item);
    const allEntries = entries();
    if (!allEntries.some(({ item, comment }) => commentKey(item, comment) === selected)) selected = null;
    renderList(allEntries);
    updateControls(allEntries);
  }

  function imagePoint(event, img) {
    const rect = img.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return null;
    return { x: clamp((event.clientX - rect.left) / rect.width * 100), y: clamp((event.clientY - rect.top) / rect.height * 100) };
  }

  function dragBox(from, to) {
    return { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y) };
  }

  function bind(item, stage, img) {
    bindings.get(item)?.dispose();
    const entry = { stage, img, drag: null, preview: null, dispose: null };
    const disposers = [];
    const on = (target, event, handler) => {
      target.addEventListener(event, handler);
      disposers.push(() => target.removeEventListener(event, handler));
    };
    bindings.set(item, entry);
    on(stage, 'pointerdown', event => {
      if (isBusy() || !allowed().includes(item) || (event.button != null && event.button !== 0) || event.isPrimary === false) return;
      if (event.target.closest?.('[data-ai-comment-marker]')) return;
      if (event.target !== img && event.target !== stage) return;
      const point = imagePoint(event, img);
      if (!point) return;
      event.preventDefault();
      const parent = stage.parentElement;
      const scrollTarget = parent && (parent.scrollWidth > parent.clientWidth || parent.scrollHeight > parent.clientHeight) ? parent : stage;
      const rect = scrollTarget.getBoundingClientRect();
      entry.drag = tool === 'pan'
        ? { type: 'pan', pointerId: event.pointerId, x: event.clientX, y: event.clientY, scrollTarget, left: scrollTarget.scrollLeft, top: scrollTarget.scrollTop, scaleX: rect.width / (scrollTarget.offsetWidth || rect.width), scaleY: rect.height / (scrollTarget.offsetHeight || rect.height) }
        : { type: tool, pointerId: event.pointerId, from: point };
      try { stage.setPointerCapture?.(event.pointerId); } catch { /* detached pointer */ }
    });
    on(stage, 'pointermove', event => {
      const drag = entry.drag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (isBusy()) { clearDrag(entry); return; }
      if (drag.type === 'pan') {
        drag.scrollTarget.scrollLeft = drag.left - (event.clientX - drag.x) / drag.scaleX;
        drag.scrollTarget.scrollTop = drag.top - (event.clientY - drag.y) / drag.scaleY;
        return;
      }
      if (drag.type === 'area') {
        const to = imagePoint(event, img);
        if (to) { drag.box = dragBox(drag.from, to); drawPreview(entry, drag.box); }
      }
    });
    on(stage, 'pointerup', event => {
      const drag = entry.drag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      clearDrag(entry);
      if (drag.type === 'pan' || isBusy()) return;
      const to = imagePoint(event, img);
      if (!to) return;
      const box = drag.type === 'point' ? { ...to, w: 0, h: 0 } : dragBox(drag.from, to);
      if (drag.type === 'area' && (box.w < 0.1 || box.h < 0.1)) return;
      if (!normalizeCommentBox({ ...box, type: drag.type })) return;
      item.comments ||= [];
      const number = Math.max(Number(item.nextCommentNumber) || 1, ...item.comments.map(comment => (Number(comment.number) || 0) + 1));
      const comment = { number, type: drag.type, ...box, text: '', imageId: item.id };
      item.nextCommentNumber = number + 1;
      item.comments.push(comment);
      selected = commentKey(item, comment);
      changed();
      activateTab('comments');
      render();
      q('[data-ai-comment-row][data-active="true"] [data-ai-inline-editor]')?.focus();
    });
    on(stage, 'pointercancel', () => clearDrag(entry));
    on(stage, 'lostpointercapture', () => clearDrag(entry));
    on(stage, 'scroll', scheduleMarkers);
    on(stage, 'transitionend', scheduleMarkers);
    on(img, 'load', scheduleMarkers);
    if (win.ResizeObserver) {
      const resize = new win.ResizeObserver(scheduleMarkers);
      resize.observe(img);
      resize.observe(stage);
      disposers.push(() => resize.disconnect());
    }
    if (win.MutationObserver) {
      const mutations = new win.MutationObserver(scheduleMarkers);
      for (const node of [stage, img]) mutations.observe(node, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
      disposers.push(() => mutations.disconnect());
    }
    entry.dispose = () => { clearDrag(entry); disposers.forEach(dispose => dispose()); };
    renderMarkers(item);
  }

  listen(panel, 'click', event => {
    const button = event.target.closest?.('[data-ai-comment-tool]');
    if (button && !isBusy() && TOOL_NAMES.has(button.dataset.aiCommentTool)) {
      tool = button.dataset.aiCommentTool;
      for (const entry of bindings.values()) clearDrag(entry);
      updateControls(entries());
    }
    const tab = event.target.closest?.('[data-ai-side-tab]');
    if (tab) activateTab(tab.dataset.aiSideTab);
  });
  function deleteSelectedComment() {
    const active = current();
    if (!active || isBusy()) return;
    active.item.comments = active.item.comments.filter(comment => comment !== active.comment);
    selected = null;
    changed();
    render();
  }
  listen(panel, 'keydown', event => {
    if (!['Delete', 'Backspace'].includes(event.key) || event.isComposing || event.defaultPrevented) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])') || panel.querySelector('dialog[open]')) return;
    if (!current() || isBusy()) return;
    event.preventDefault(); event.stopPropagation();
    deleteSelectedComment();
  });
  listen(panel, '5e:ai-candidate-select', () => { selected = null; render(); });
  listen(win, 'resize', scheduleMarkers);
  if (win.MutationObserver) {
    const layout = new win.MutationObserver(scheduleMarkers);
    for (const node of [panel, q('.ai-results')].filter(Boolean)) {
      layout.observe(node, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    }
    cleanup.push(() => layout.disconnect());
  }
  activateTab('comments');
  render();
  return {
    bind,
    render,
    reset() { selected = null; activateTab('comments'); render(); },
    destroy() {
      destroyed = true;
      if (frame != null) {
        if (win.cancelAnimationFrame) win.cancelAnimationFrame(frame);
        else clearTimeout(frame);
      }
      for (const entry of bindings.values()) entry.dispose();
      bindings.clear();
      cleanup.forEach(dispose => dispose());
    },
  };
}
