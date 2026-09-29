export function initZoomReadoutLifecycle({
  target,
  refresh,
  documentRef = document,
  ResizeObserverCtor = globalThis.ResizeObserver,
}) {
  const refreshWhenVisible = () => {
    if (documentRef.visibilityState === "hidden") return;
    if (target.getBoundingClientRect().width <= 0) return;
    refresh();
  };
  const observer = new ResizeObserverCtor(refreshWhenVisible);
  const handleVisibility = () => {
    if (documentRef.visibilityState === "visible") refreshWhenVisible();
  };
  observer.observe(target);
  documentRef.addEventListener("visibilitychange", handleVisibility);
  refreshWhenVisible();
  return () => {
    observer.disconnect();
    documentRef.removeEventListener("visibilitychange", handleVisibility);
  };
}
