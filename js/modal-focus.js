const FOCUSABLE = [
  "button:not([disabled])", "input:not([disabled])", "select:not([disabled])",
  "textarea:not([disabled])", "a[href]", "[tabindex]:not([tabindex='-1'])",
].join(",");

function isAvailable(element) {
  return Boolean(element) && !element.hidden && !element.disabled
    && element.getAttribute?.("aria-hidden") !== "true"
    && !element.closest?.("[hidden]")
    && (!element.getClientRects || element.getClientRects().length > 0);
}

export function installModalFocus({ root, initialFocus, returnFocus, onRequestClose } = {}) {
  const focusable = () => Array.from(root.querySelectorAll(FOCUSABLE)).filter(isAvailable);
  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onRequestClose?.();
      return;
    }
    if (event.key !== "Tab") return;
    const targets = focusable();
    if (!targets.length) return event.preventDefault();
    const activeIndex = targets.indexOf(root.ownerDocument.activeElement);
    const next = event.shiftKey
      ? (activeIndex <= 0 ? targets.at(-1) : null)
      : (activeIndex < 0 || activeIndex === targets.length - 1 ? targets[0] : null);
    if (!next) return;
    event.preventDefault();
    next.focus();
  };
  root.addEventListener("keydown", onKeyDown);
  (isAvailable(initialFocus) ? initialFocus : focusable()[0])?.focus();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    root.removeEventListener("keydown", onKeyDown);
    if (returnFocus?.isConnected !== false) returnFocus?.focus?.();
  };
}
