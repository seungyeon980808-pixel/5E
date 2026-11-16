// Source graph ports share continuously registered DOM, state and IDB signals.
// No interval, frame polling, fixed delay, or automatic retry is used.
const version = '?v=1.7.0-four-session-integration';
const origin = new URL(process.env.RELEASE_URL || process.env.PREVIEW_URL || process.env.EXAM_URL || 'http://127.0.0.1:65177/').origin;
if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Graph tests require the owned local candidate origin');

function installSignals() {
  const listeners = new Set();
  const notify = () => { for (const listener of listeners) listener(); };
  new MutationObserver(notify).observe(document, {
    subtree: true, childList: true, attributes: true, characterData: true,
  });
  for (const event of ['input', 'change', 'load', 'error']) {
    document.addEventListener(event, notify, true);
  }
  const transaction = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (...args) {
    const tx = transaction.apply(this, args);
    if (tx.mode !== 'readonly') tx.addEventListener('complete', notify, { once: true });
    return tx;
  };
  window.__graphSourceSignals = { listeners, notify };
  const createWait = (source, arg, timeout) => {
    // WebKit gives init-script eval no module base URL. An origin-qualified
    // canonical path resolves to the same module as the application's /js/.
    const boundSource = source.replace(/\bimport\((['"])\/js\//g,
      (_, quote) => `import(${quote}${location.origin}/js/`);
    const predicate = (0, eval)(`(${boundSource})`);
    let activate, active = false;
    const promise = new Promise((resolve, reject) => {
      let checking = false, changed = false, settled = false;
      const cleanup = () => { settled = true; clearTimeout(timer); listeners.delete(check); };
      const timer = setTimeout(() => {
        cleanup(); reject(Error('Graph source signal timed out: ' + source));
      }, timeout);
      async function check() {
        if (settled || !active) return;
        if (checking) { changed = true; return; }
        checking = true;
        try {
          const value = await predicate(arg);
          if (value) { cleanup(); resolve(value); }
        } catch (error) { cleanup(); reject(error); }
        finally {
          checking = false;
          if (changed && !settled) { changed = false; void check(); }
        }
      }
      listeners.add(check);
      activate = () => { active = true; void check(); };
    });
    return { promise, activate };
  };
  window.__graphSourceWait = (source, arg, timeout) => {
    const wait = createWait(source, arg, timeout);
    wait.activate();
    return wait.promise;
  };
  window.__graphSourceArmed = new Map();
  window.__graphSourceArm = (id, source, arg, timeout) => {
    // Register before the action, but evaluate after it so an initially idle
    // UI cannot satisfy the post-submit idle predicate before submission.
    const wait = createWait(source, arg, timeout);
    // The action may throw; avoid an unhandled rejection from its failure bound.
    wait.promise.catch(() => {});
    window.__graphSourceArmed.set(id, wait);
  };
}

function loadPlaywright() {
  const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const engines = {};
  for (const name of ['chromium', 'webkit']) {
    const type = playwright[name];
    engines[name] = {
      async launch(options) {
        const browser = await type.launch(options);
        const newContext = browser.newContext.bind(browser);
        browser.newContext = async options => {
          const context = await newContext(options);
          await context.addInitScript(installSignals);
          await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) {
              if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
              return route.abort();
            }
            return route.continue();
          });
          const newPage = context.newPage.bind(context);
          context.newPage = async () => {
            const page = await newPage();
            const goto = page.goto.bind(page);
            page.goto = async (...args) => {
              const response = await goto(...args);
              await page.evaluate(async version => {
                const { state } = await import('/js/state.js' + version);
                state.subscribe(window.__graphSourceSignals.notify);
              }, version);
              return response;
            };
            const reload = page.reload.bind(page);
            page.reload = async (...args) => {
              const response = await reload(...args);
              await page.evaluate(async version => {
                const { state } = await import('/js/state.js' + version);
                state.subscribe(window.__graphSourceSignals.notify);
              }, version);
              return response;
            };
            page.waitForGraphSignal = (predicate, arg, options) => {
              // A few source calls supplied timeout as the second argument.
              if (!options && arg && Object.keys(arg).length === 1 && 'timeout' in arg) {
                options = arg; arg = undefined;
              }
              return page.evaluate(({ source, arg, timeout }) =>
                window.__graphSourceWait(source, arg, timeout),
              { source: predicate.toString(), arg, timeout: options?.timeout || 30000 });
            };
            let nextSignal = 0;
            page.observeGraphSignal = async (predicate, arg, options, action) => {
              const id = ++nextSignal;
              if (!options && arg && Object.keys(arg).length === 1 && 'timeout' in arg) {
                options = arg; arg = undefined;
              }
              await page.evaluate(({ id, source, arg, timeout }) =>
                window.__graphSourceArm(id, source, arg, timeout),
              { id, source: predicate.toString(), arg, timeout: options?.timeout || 30000 });
              await action();
              return page.evaluate(async id => {
                const armed = window.__graphSourceArmed.get(id);
                armed.activate();
                try { return await armed.promise; }
                finally { window.__graphSourceArmed.delete(id); }
              }, id);
            };
            return page;
          };
          return context;
        };
        browser.newPage = async options => {
          const context = await browser.newContext(options);
          return context.newPage();
        };
        return browser;
      },
    };
  }
  return engines;
}

module.exports = { loadPlaywright };
