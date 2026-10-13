// One visual hint names the same ready action that the Space handler executes.
export function markSpaceAction(container, button) {
  for (const previous of container.querySelectorAll('[data-space-next]')) {
    if (previous.closest('.workbench-assignment') && !container.matches('.workbench-assignment')) continue;
    previous.removeAttribute('data-space-next');
    previous.removeAttribute('aria-keyshortcuts');
  }
  if (button && !button.disabled && !button.hidden) {
    button.dataset.spaceNext = '';
    button.setAttribute('aria-keyshortcuts', 'Space');
  }
}

export function loadSpaceActionStyle(doc = document) {
  if (doc.querySelector('link[data-space-action-style]')) return;
  const link = doc.createElement('link');
  link.rel = 'stylesheet'; link.dataset.spaceActionStyle = '';
  link.href = new URL('../../css/library-space-action.css?v=1.7.0-four-session-integration', import.meta.url).href;
  doc.head.append(link);
}
