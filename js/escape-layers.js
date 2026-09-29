const DIALOGS = 'dialog[open], [role="dialog"], [role="alertdialog"], [role="menu"], .modal-overlay, .tool-chooser, details[open][data-unilib-help]';
const callbacks = new WeakMap();
const openers = new WeakMap();
let installed = false;
let previousFocus = null;

export function registerEscapeLayer(element, close) {
  callbacks.set(element, close);
  return () => callbacks.delete(element);
}

function visible(element) {
  return element.isConnected && !element.closest('[hidden], [inert]')
    && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
}

function closeAction(element) {
  if (callbacks.has(element)) return callbacks.get(element);
  if (element.matches('details[open][data-unilib-help]')) return () => { element.open = false; };
  if (element.matches('dialog[open]')) return () => {
    if (typeof element.requestClose === 'function') element.requestClose();
    else if (element.dispatchEvent(new Event('cancel', { cancelable: true }))) element.close();
  };
  if (element.matches('.tool-chooser')) return () => {
    element.hidden = true;
    document.querySelectorAll('[aria-controls]').forEach(button => {
      if (button.getAttribute('aria-controls') === element.id) button.setAttribute('aria-expanded', 'false');
    });
  };
  const buttons = [...element.querySelectorAll('button')].filter(button =>
    visible(button) && !button.disabled && button.closest(DIALOGS) === element);
  const cancel = buttons.find(button => /(?:^|[-_])(cancel|close)$/.test(button.id)
    || button.matches('[data-act="cancel"], [data-action="close"], [data-unilib-crop-cancel], [data-unilib-close]')
    || /^(취소|닫기|아니오|돌아가기)$/.test(button.textContent.trim())
    || /^(닫기|라이브러리 닫기)$/.test(button.getAttribute('aria-label') || ''));
  if (cancel) return () => cancel.click();
  if (buttons.length === 1 && buttons[0].textContent.trim() === '확인') return () => buttons[0].click();
  return null;
}

function layerRank(element) {
  let rank = 0;
  for (let node = element; node instanceof HTMLElement; node = node.parentElement) {
    if (node.matches('dialog[open]')) rank += 1e12;
    const value = Number.parseInt(getComputedStyle(node).zIndex, 10);
    if (Number.isFinite(value)) rank += value;
  }
  return rank;
}

export function initEscapeLayers() {
  if (installed) return;
  installed = true;
  window.fiveEDesktop?.fullscreen?.onEscape?.(() => {
    const hadPopup = [...document.querySelectorAll(DIALOGS)].some(visible);
    const event = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
    (document.activeElement || document.body).dispatchEvent(event);
    if (!hadPopup && !event.defaultPrevented) {
      window.fiveEDesktop.fullscreen.toggle().catch(error => console.error('Unable to exit fullscreen', error));
    }
  });
  previousFocus = document.activeElement;
  document.addEventListener('focusin', event => {
    for (const layer of document.querySelectorAll(DIALOGS)) {
      if (!openers.has(layer) && layer.contains(event.target) && !layer.contains(previousFocus) && visible(layer)) {
        openers.set(layer, previousFocus);
      }
    }
    previousFocus = event.target;
  }, true);
  new MutationObserver(records => {
    for (const { target } of records) {
      if (!target.hidden) continue;
      openers.delete(target);
      target.querySelectorAll(DIALOGS).forEach(layer => openers.delete(layer));
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
    const layers = [...document.querySelectorAll(DIALOGS)].filter(visible);
    layers.sort((a, b) => layerRank(a) - layerRank(b));
    const top = layers.at(-1);
    if (!top) return;
    const close = closeAction(top);
    if (!close) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const opener = openers.get(top);
    close();
    if (!visible(top) && opener?.isConnected && visible(opener)) opener.focus();
  }, true);
}
