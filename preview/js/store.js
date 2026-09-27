/* ===== STORE (DESIGN 1-3: thin subscribe/notify, no framework) ===== */
//
// The store is deliberately tiny. It knows nothing about the DOM, SVG, or
// what "state" contains — it only holds a value and a list of subscribers.
// Mutating state must go through update(), which guarantees every subscriber
// (e.g. render) is notified. This is the structural safeguard that makes
// data-as-truth (DESIGN 1-1) impossible to forget.

export function createStore(initialState) {
  let state = initialState;
  let pageContextRevision = 0;
  const subscribers = new Set();

  /* ----- subscribe: register fn, get an unsubscribe handle ----- */
  function subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }

  /* ----- update: mutate via updaterFn, then notify everyone ----- */
  function update(updaterFn) {
    const activePageId = state?.activePageId ?? null;
    const pages = state?.pages;
    const activePage = Array.isArray(pages)
      ? pages.find(page => page?.id === activePageId) : null;
    updaterFn(state); // mutate in place — state object identity is stable
    const nextPageId = state?.activePageId ?? null;
    const nextPages = state?.pages;
    const nextActivePage = Array.isArray(nextPages)
      ? nextPages.find(page => page?.id === nextPageId) : null;
    if (nextPageId !== activePageId || nextPages !== pages || nextActivePage !== activePage) {
      pageContextRevision += 1;
    }
    subscribers.forEach((fn) => fn(state));
  }

  /* ----- get: read-only access to current state ----- */
  function get() {
    return state;
  }

  function capturePageContext() {
    return { pageId: state?.activePageId ?? null, revision: pageContextRevision };
  }

  function isPageContextCurrent(context) {
    return !!context && context.pageId === (state?.activePageId ?? null)
      && context.revision === pageContextRevision;
  }

  return { subscribe, update, get, capturePageContext, isPageContextCurrent };
}
