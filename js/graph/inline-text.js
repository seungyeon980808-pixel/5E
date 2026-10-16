import {registerEscapeLayer} from '../escape-layers.js?v=1.7.0-four-session-integration';
// Edit source expressions, never SVG textContent (which may be split by math layout).
export function mountGraphInlineText(host, resolve) {
  let pending = null, editor = null;
  const dismiss = (commit = true) => {
    if (!editor) return;
    const current = editor; editor = null;
    const value = current.input.value; current.dispose(); current.input.remove();
    if (commit && value !== current.spec.value) current.spec.save(value);
  };
  const open = (spec, rect) => {
    dismiss();
    spec = resolve(spec.element) || spec;
    spec.activate();
    rect = spec.getRect?.() || rect;
    const bounds = host.getBoundingClientRect();
    const input = document.createElement('input');
    input.className = 'gm-inline-text'; input.type = 'text'; input.value = spec.value;
    input.setAttribute('aria-label', spec.label + ' 직접 편집');
    input.title = 'Enter: 적용 · Esc: 취소';
    const scaleX = bounds.width / host.offsetWidth || 1, scaleY = bounds.height / host.offsetHeight || 1;
    const width = Math.min(Math.max(rect.width / scaleX + 36, 180), host.clientWidth - 16);
    input.style.width = `${width}px`;
    input.style.left = `${Math.max(host.scrollLeft + 8, Math.min((rect.left - bounds.left) / scaleX + host.scrollLeft - host.clientLeft, host.scrollLeft + host.clientWidth - width - 8))}px`;
    input.style.top = `${(rect.bottom - bounds.top) / scaleY + host.scrollTop - host.clientTop + 8}px`;
    input.dataset.escapeLayer = '';
    host.append(input); editor = {input, spec, dispose: registerEscapeLayer(input, () => dismiss(false))};
    // Caret placement and text selection belong to the input, never SVG dragging.
    for (const type of ['pointerdown','pointerup','mousedown','mouseup','click','dblclick']) {
      input.addEventListener(type, event => event.stopPropagation());
    }
    input.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.isComposing) return;
      if (event.key === 'Escape' || event.key === 'Enter') {
        event.preventDefault(); dismiss(event.key === 'Enter'); host.focus({preventScroll: true});
      }
    });
    input.addEventListener('blur', () => dismiss());
    input.focus({preventScroll: true}); input.setSelectionRange(input.value.length, input.value.length);
    // Inserting a positioned editor can reveal a scrollbar and resize the SVG.
    // Anchor against the final glyph geometry after focus and layout have settled.
    const labelBounds = spec.getRect?.() || rect;
    input.style.top = `${parseFloat(input.style.top) + (labelBounds.bottom + 8 * scaleY - input.getBoundingClientRect().top) / scaleY}px`;
    const overflow = input.getBoundingClientRect().bottom - (bounds.bottom - 8 * scaleY);
    if (overflow > 0) host.scrollTop += Math.ceil(overflow / scaleY);
  };
  host.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('input')) return;
    const spec = resolve(event.target);
    pending = spec ? {spec, x: event.clientX, y: event.clientY, rect: spec.element.getBoundingClientRect()} : null;
  }, true);
  const finish = event => {
    const item = pending; pending = null;
    if (!item || Math.hypot(event.clientX - item.x, event.clientY - item.y) > 4) return;
    queueMicrotask(() => { if (!host.closest('[hidden]')) open(item.spec, item.rect); });
  };
  // Existing SVG drag handlers release on mouseup. Opening an input earlier on
  // pointerup can replace their target before WebKit dispatches that release.
  window.addEventListener('mouseup', finish);
  window.addEventListener('pointerup', event => { if (event.pointerType !== 'mouse') finish(event); });
  window.addEventListener('pointercancel', () => { pending = null; });
  // Pointer handling can recreate the SVG before the browser dispatches click.
  host.addEventListener('click', event => { if (editor && !event.target.closest('input')) { event.stopImmediatePropagation(); } }, true);
  return {cancel: () => { pending = null; dismiss(false); }};
}
