/* ===== STORE (DESIGN 1-3: thin subscribe/notify, no framework) ===== */
//
// The store is deliberately tiny. It knows nothing about the DOM, SVG, or
// what "state" contains — it only holds a value and a list of subscribers.
// Mutating state must go through update(), which guarantees every subscriber
// (e.g. render) is notified. This is the structural safeguard that makes
// data-as-truth (DESIGN 1-1) impossible to forget.

export function createStore(initialState) {
  let state = initialState;
  const subscribers = new Set();

  /* ----- subscribe: register fn, get an unsubscribe handle ----- */
  function subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }

  /* ----- update: mutate via updaterFn, then notify everyone ----- */
  function update(updaterFn) {
    updaterFn(state); // mutate in place — state object identity is stable
    subscribers.forEach((fn) => fn(state));
  }

  /* ----- get: read-only access to current state ----- */
  function get() {
    return state;
  }

  return { subscribe, update, get };
}
