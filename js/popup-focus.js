// Browser :focus-visible inherits modal autofocus on return. Keep pointer actions
// visually quiet without losing the focused control or keyboard navigation.
const POINTER_FOCUS = 'data-pointer-focus';
const ACTIONS = 'button, [role="button"], [role="tab"], [role="menuitem"], a[href], input[type="button"], input[type="submit"], input[type="reset"]';
const NAVIGATION = new Set(['Tab', 'Enter', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
let installed = false;

export function initPopupFocus(root = document) {
  if (installed) return;
  installed = true;
  // 처음에는 마우스 사용자로 본다 — 앱이 뜨자마자 열리는 창(작업 복구 등)의 단추에 초점 테두리가 보였다(10-28 출제 지적 3). Tab 등 키를 누르면 키보드로 바뀐다.
  let pointer = true;
  let marked = null;
  const clear = () => {
    marked?.removeAttribute(POINTER_FOCUS);
    marked = null;
  };
  const mark = target => {
    clear();
    if (pointer && target instanceof HTMLElement && target.matches(ACTIONS)) {
      marked = target;
      target.setAttribute(POINTER_FOCUS, '');
    }
  };
  root.addEventListener('pointerdown', event => {
    pointer = true;
    // Clicking an already-focused action does not emit another focusin.
    if (event.target instanceof Element) mark(event.target.closest(ACTIONS));
  }, true);
  root.addEventListener('keydown', event => {
    // Escape closes a popup; it does not turn its pointer opener into a
    // keyboard-selected action. Tab/activation/navigation do that explicitly.
    const shortcut = (event.metaKey || event.ctrlKey || event.altKey)
      && !['Meta', 'Control', 'Alt', 'Shift', 'Escape'].includes(event.key);
    if ((!NAVIGATION.has(event.key) && !shortcut) || event.isComposing) return;
    pointer = false;
    clear();
  }, true);
  root.addEventListener('focusin', event => mark(event.target), true);
  root.addEventListener('focusout', clear, true);
}
