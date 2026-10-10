import { copyPngToClipboard } from './svg-export.js?v=1.7.0-four-session-integration';
import { screenToWorld } from './viewport.js?v=1.7.0-four-session-integration';
import { blocksCanvasShortcut, hasBlockingModal, keyLabel, shortcutKey } from './platform.js?v=1.7.0-four-session-integration';

export function initQuickCapture(state, svg) {
  const button = document.getElementById('quick-capture-btn');
  if (!button || !svg) return;
  let cancelCapture = null, copying = false, toastTimer = null;
  const status = document.createElement('div');
  status.className = 'quick-capture-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;
  document.body.appendChild(status);

  function notify(message, error = false) {
    clearTimeout(toastTimer);
    status.textContent = message;
    status.classList.toggle('is-error', error);
    status.hidden = false;
    toastTimer = setTimeout(() => { status.hidden = true; }, error ? 6500 : 2500);
  }
  function updateTip() { button.dataset.shellTip = `빠른 캡처 · ${keyLabel('Alt+C')}`; }
  updateTip();
  window.addEventListener('5e:shortcut-platform-change', updateTip);

  function start() {
    if (copying) return;
    if (cancelCapture) { cancelCapture(); return; }
    if (hasBlockingModal()) return;
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      notify('클립보드 복사를 지원하지 않습니다. 파일 → 이미지로 내보내기를 이용하세요.', true);
      return;
    }
    status.hidden = true;
    const screen = svg.getBoundingClientRect();
    if (!screen.width || !screen.height) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay quick-capture-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '빠른 캡처');
    const hint = document.createElement('div');
    hint.className = 'quick-capture-hint';
    hint.textContent = '캔버스 영역을 드래그한 뒤 놓으면 복사됩니다 · Esc 취소';
    const rectangle = document.createElement('div');
    rectangle.className = 'quick-capture-rectangle';
    rectangle.hidden = true;
    overlay.append(hint, rectangle);
    document.body.appendChild(overlay);
    button.setAttribute('aria-pressed', 'true');
    let anchor = null, pointer = null;
    function point(event) {
      return { x: Math.max(screen.left, Math.min(screen.right, event.clientX)), y: Math.max(screen.top, Math.min(screen.bottom, event.clientY)) };
    }
    function box(end) {
      return { x: Math.min(anchor.x, end.x), y: Math.min(anchor.y, end.y), w: Math.abs(anchor.x - end.x), h: Math.abs(anchor.y - end.y) };
    }
    function paint(bounds) {
      rectangle.hidden = false;
      Object.assign(rectangle.style, { left: `${bounds.x}px`, top: `${bounds.y}px`, width: `${bounds.w}px`, height: `${bounds.h}px` });
    }
    function cancel() {
      overlay.remove();
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('5e:view-mode-change', cancel);
      button.setAttribute('aria-pressed', 'false');
      cancelCapture = null;
    }
    function onKey(event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'Escape' || (event.altKey && shortcutKey(event) === 'c')) cancel();
    }
    overlay.addEventListener('pointerdown', event => {
      if (event.button !== 0 || pointer !== null) return;
      if (event.clientX < screen.left || event.clientX > screen.right || event.clientY < screen.top || event.clientY > screen.bottom) return;
      event.preventDefault();
      pointer = event.pointerId;
      anchor = point(event);
      overlay.setPointerCapture(pointer);
      paint(box(anchor));
    });
    overlay.addEventListener('pointermove', event => {
      if (pointer === event.pointerId && anchor) paint(box(point(event)));
    });
    overlay.addEventListener('pointerup', event => {
      if (pointer !== event.pointerId || !anchor) return;
      event.preventDefault();
      const bounds = box(point(event));
      if (bounds.w < 4 || bounds.h < 4) {
        overlay.releasePointerCapture(pointer);
        pointer = null; anchor = null; rectangle.hidden = true;
        return;
      }
      const first = screenToWorld(svg, state.get().viewBox, bounds.x, bounds.y);
      const last = screenToWorld(svg, state.get().viewBox, bounds.x + bounds.w, bounds.y + bounds.h);
      cancel();
      copying = true;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      // Invoked synchronously from pointerup: Safari's clipboard gesture survives.
      const copied = copyPngToClipboard(state, 300, {
        x: Math.min(first.x, last.x), y: Math.min(first.y, last.y),
        w: Math.abs(last.x - first.x), h: Math.abs(last.y - first.y),
      }, { includeReferenceImages: true });
      notify('클립보드에 복사 중…');
      copied.then(ok => {
        notify(ok ? '클립보드에 복사됨' : '클립보드 복사를 지원하지 않습니다.', !ok);
      }).catch(() => {
        notify('복사하지 못했습니다. 빠른 캡처를 다시 시도하거나 파일 → 이미지로 내보내기를 이용하세요.', true);
      }).finally(() => {
        copying = false; button.disabled = false; button.removeAttribute('aria-busy');
      });
    });
    overlay.addEventListener('pointercancel', cancel);
    overlay.addEventListener('contextmenu', event => { event.preventDefault(); cancel(); });
    overlay.addEventListener('wheel', event => event.preventDefault(), { passive: false });
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('5e:view-mode-change', cancel);
    cancelCapture = cancel;
  }
  button.addEventListener('click', start);
  window.addEventListener('keydown', event => {
    if (event.repeat || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || shortcutKey(event) !== 'c' || blocksCanvasShortcut(event)) return;
    event.preventDefault();
    start();
  });
}
