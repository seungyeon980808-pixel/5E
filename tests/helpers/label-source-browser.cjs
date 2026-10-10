const assert = require('node:assert/strict');
const workflow = require('../fixtures/ai-image-label-workflow.cjs');

// These subscriptions exist before navigation and before any test gesture.
// Predicates retain the source conditions; only their polling scheduler changes.
function subscribeLabelSourceSignals() {
  const listeners = new Set();
  const notify = () => { for (const listener of listeners) listener(); };
  window.__labelSourceSignals = { listeners, notify };
  new MutationObserver(notify).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  for (const event of ['load', 'error', 'input', 'change', 'focusin', 'pointerup', 'transitionend', 'animationend']) {
    document.addEventListener(event, notify, true);
  }
  window.addEventListener('qa:bridge-send', notify);
  const transaction = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (...args) {
    const result = transaction.apply(this, args);
    if (args[1] === 'readwrite') result.addEventListener('complete', notify);
    result.addEventListener('abort', notify);
    result.addEventListener('error', notify);
    return result;
  };
}

async function installLabelSourcePage(page) {
  await page.addInitScript(subscribeLabelSourceSignals);
  const navigate = page.goto.bind(page);
  const reload = page.reload.bind(page);
  async function subscribeState() {
    await page.evaluate(async () => {
      const { state } = await import('/js/state.js?v=1.7.0-four-session-integration');
      state.subscribe(window.__labelSourceSignals.notify);
    });
  }
  page.goto = async (...args) => { const response = await navigate(...args); await subscribeState(); return response; };
  page.reload = async (...args) => { const response = await reload(...args); await subscribeState(); return response; };
  page.waitForFunction = async (predicate, arg, options = {}) => page.evaluate(({ source, arg, timeout }) => {
    const predicate = (0, eval)(`(${source})`);
    return new Promise((resolve, reject) => {
      const signals = window.__labelSourceSignals;
      let running = false, dirty = false, settled = false;
      const timer = setTimeout(() => { cleanup(); reject(new Error(`Label source signal deadline: ${source}`)); }, timeout);
      function cleanup() { settled = true; clearTimeout(timer); signals.listeners.delete(check); }
      async function check() {
        if (settled) return;
        if (running) { dirty = true; return; }
        running = true;
        try {
          do {
            dirty = false;
            const result = await predicate(arg);
            if (result) { cleanup(); resolve(true); return; }
          } while (dirty && !settled);
        } catch (error) { cleanup(); reject(error); }
        finally { running = false; }
      }
      signals.listeners.add(check);
      check();
    });
  }, { source: predicate.toString(), arg, timeout: options.timeout || 10000 });
}

async function fixture(context, count, evidence, options = {}) {
  assert.ok(process.env.RELEASE_URL || process.env.EXAM_URL, 'A retained candidate URL is required; this track never starts a server');
  const beforeNavigate = options.beforeNavigate;
  return workflow.fixture(context, count, evidence, {
    ...options,
    beforeNavigate: async page => {
      await installLabelSourcePage(page);
      if (beforeNavigate) await beforeNavigate(page);
    },
  });
}

// Establish the source's stated "first select, then edit" precondition. Native
// insertion can already select the label, making its first click open an editor
// and its next click a real detailed-edit gesture. Reset only that selection;
// wait for the actual selected handle, never a double-click timing window.
async function armSelection(page, id) {
  await page.evaluate(async id => {
    const { state } = await import('/js/state.js?v=1.7.0-four-session-integration');
    if (state.get().selectedIds.includes(id)) {
      state.update(s => { s.selectedIds = []; s.targetedId = null; });
    }
    window.__labelSourceSelection = new Promise((resolve, reject) => {
      const signals = window.__labelSourceSignals;
      const timer = setTimeout(() => { cleanup(); reject(new Error('Selection/handle deadline')); }, 10000);
      function cleanup() { clearTimeout(timer); signals.listeners.delete(check); }
      function check() {
        const selected = state.get().selectedIds;
        const completed = document.querySelector(`#handles [data-id="${id}"][data-handle="p1"]`);
        if (selected.length === 1 && selected[0] === id && completed) {
          cleanup(); resolve();
        }
      }
      signals.listeners.add(check);
      check();
    });
  }, id);
}
const selectionArrived = page => page.evaluate(() => window.__labelSourceSelection);

module.exports = { ...workflow, fixture, installLabelSourcePage, armSelection, selectionArrived };
