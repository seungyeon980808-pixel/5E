'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const version = '?v=1.7.0-four-session-integration';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value);
const clone = value => structuredClone(value);
const panel = '#ai-image-panel';
const replay = 'tests/fixtures/graph-analytic-recovery/p2_2021_09_03.json';

function command(executable, argv) {
  const quote = s => `'${String(s).replaceAll("'", "'\\''")}'`;
  return ['APP_ENTRY=/', `RELEASE_URL=${quote(process.env.RELEASE_URL)}`, `EXAM_URL=${quote(process.env.EXAM_URL)}`,
    ...['APP_MODULE_BASE', 'APP_MODULE_QUERY', 'PLAYWRIGHT_MODULE', 'NODE_PATH', 'CROSS_TRANSFER_URL', 'EVIDENCE_DIR'].filter(k => process.env[k]).map(k => `${k}=${quote(process.env[k])}`),
    quote(executable), ...argv.map(quote)].join(' ');
}

// Read repository metadata and index directly: no Git command or mutation.
// dirtyHash is the delta against the current index, plus new product/test files.
// Index identity is recorded separately; this does not certify a clean HEAD.
function fingerprint(directory) {
  const gitFile = fs.readFileSync(path.join(directory, '.git'), 'utf8').trim();
  const gitDir = path.resolve(directory, gitFile.replace(/^gitdir:\s*/, ''));
  const commonFile = path.join(gitDir, 'commondir');
  const common = fs.existsSync(commonFile) ? path.resolve(gitDir, fs.readFileSync(commonFile, 'utf8').trim()) : gitDir;
  let head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
  if (head.startsWith('ref: ')) {
    const ref = head.slice(5), file = path.join(common, ref);
    head = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim()
      : fs.readFileSync(path.join(common, 'packed-refs'), 'utf8').split('\n').find(row => row.endsWith(' ' + ref))?.split(' ')[0];
  }
  assert.match(head || '', /^[a-f0-9]{40}$/, 'Could not read actual HEAD');
  const index = fs.readFileSync(path.join(gitDir, 'index'));
  assert.equal(index.toString('ascii', 0, 4), 'DIRC');
  const indexVersion = index.readUInt32BE(4);
  assert.ok([2, 3, 4].includes(indexVersion), 'Unsupported Git index version');
  const entries = [], indexed = new Set(); let offset = 12, previous = '';
  for (let i = 0; i < index.readUInt32BE(8); i++) {
    const start = offset, blob = index.subarray(offset + 40, offset + 60).toString('hex');
    const flags = index.readUInt16BE(offset + 60); offset += 62;
    if (flags & 0x4000) offset += 2;
    if (indexVersion === 4) {
      let byte = index[offset++], strip = byte & 127;
      while (byte & 128) { byte = index[offset++]; strip = ((strip + 1) << 7) + (byte & 127); }
      const end = index.indexOf(0, offset), suffix = index.toString('utf8', offset, end);
      previous = previous.slice(0, previous.length - strip) + suffix; offset = end + 1;
    } else {
      const end = index.indexOf(0, offset); previous = index.toString('utf8', offset, end);
      offset = start + Math.ceil((end + 1 - start) / 8) * 8;
    }
    const file = path.join(directory, previous); indexed.add(previous);
    let bytes = null;
    try { bytes = fs.lstatSync(file).isSymbolicLink() ? Buffer.from(fs.readlinkSync(file)) : fs.readFileSync(file); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const current = bytes && crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (current !== blob) entries.push({ path: previous, indexedBlob: blob, currentBlob: current, sha256: bytes && sha(bytes), bytes: bytes?.length ?? null });
  }
  function walk(relative) {
    const directoryPath = path.join(directory, relative); if (!fs.existsSync(directoryPath)) return;
    for (const item of fs.readdirSync(directoryPath, { withFileTypes: true })) {
      if (['node_modules', '.git', '_work', '.omo', 'outputs'].includes(item.name)) continue;
      const child = path.posix.join(relative, item.name);
      if (item.isDirectory()) walk(child);
      else if (!indexed.has(child) && item.isFile()) { const bytes = fs.readFileSync(path.join(directory, child)); entries.push({ path: child, indexedBlob: null, sha256: sha(bytes), bytes: bytes.length }); }
    }
  }
  for (const folder of ['js', 'css', 'tests', 'desktop', 'scripts', 'vendor']) walk(folder);
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return { head, indexSha256: sha(index), indexVersion, dirtyHash: sha(json(entries)),
    dirtyHashBasis: 'actual indexed-byte delta + untracked files in js/css/tests/desktop/scripts/vendor; no ignored evidence; index is not asserted equal to HEAD', dirtyFiles: entries };
}

// Every mandatory row is explicit. Unimplemented precise oracles fail the
// scenario, even when the implemented portion succeeded. A source pass is never
// mapped to a row. Native Safari is intentionally a separate receipt.
const required = {
  QA1: ['crop-login-image', 'crop-login-graph', 'cancel-late-retry', 'reload-intent', 'partial-save-retry', 'rich-union-login'],
  QA2: ['raw-off-on', 'raw-on-off', 'raw-reload-preview', 'content-source-model-keys', 'policy-matrix', 'concurrent-owner-cancel', 'corrupt-cache-quota-legacy', 'approved-request'],
  QA3: ['label-click-edit-cancel', 'label-drag-history', 'actual-drawing-roundtrip', 'owned-native-revision', 'generic-locked-rejection', 'foreign-locked-stale-rejection', 'detail-context-two-point-ime', 'native-input-notifications'],
  QA4: ['recorded-upload-replay', 'compare-revision-cancel', 'exact-noop-svg', 'same-id-late-success', 'same-id-late-rejection', 'queued-checkpoint', 'background-owner', 'malformed-source-model'],
  QA5: ['label-graph-source-tabs', 'embedded-union', 'inline-routed-leaders', 'eight-handles', 'unapplied-draft-project', 'hwp-hwpx-roundtrip', 'graph-pending-preview-send', 'graph-rejected-preview-send', 'graph-modal-send-once-invalid', 'cancel-copy-foreign-conflict-corrupt'],
  QA6: ['pending-text-send', 'pending-buttons-lock', 'export-failure-autosave-retry', 'transition-cleanup', 'same-id-restored-owner', 'background-provider-owner', 'canceled-disposed-wrong-link'],
  QA7: ['boundary-input-drop', 'malformed-file-preservation', 'valid-rich-file-roundtrip', 'candidate-binding-rejection', 'zip-crc-missing-asset', 'pdf-runtime-retry-original', 'pdf-late-two-page-preservation'],
  QA8: ['layout-four-sizes-themes-motion', 'graph-topmost-focus', 'capture-protected-failure', 'root-preview-root-union', 'storage-identities', 'second-tab-recovery', 'corrupt-cache-abort-recovery', 'real-browser-zoom-200', 'explicit-other-origin-transfer'],
};
const gaps = {};

// Event-driven observations installed BEFORE each action. Timers only reject a
// deadline; DOM mutations, state, bridge and real IDB completion drive success.
function installSignals({ observeGraphFocus = false } = {}) {
  const listeners = new Set(), disposers = [];
  const notify = () => { for (const listener of listeners) listener(); };
  const observer = new MutationObserver(notify); observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  disposers.push(() => observer.disconnect());
  for (const event of ['load', 'error', 'input', 'change', 'focusin', 'pointerup', 'transitionend', 'animationend']) {
    document.addEventListener(event, notify, true); disposers.push(() => document.removeEventListener(event, notify, true));
  }
  for (const event of ['qa:bridge-send', 'qa:graph-render-settled', '5e:exam-workspace-changed', 'qa:reader-complete']) {
    window.addEventListener(event, notify); disposers.push(() => window.removeEventListener(event, notify));
  }
  window.addEventListener('resize', notify); disposers.push(() => window.removeEventListener('resize', notify));
  if (window.visualViewport) {
    for (const event of ['resize', 'scroll']) {
      window.visualViewport.addEventListener(event, notify);
      disposers.push(() => window.visualViewport.removeEventListener(event, notify));
    }
  }
  const transaction = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (...args) {
    const tx = transaction.apply(this, args);
    for (const event of ['complete', 'abort', 'error']) tx.addEventListener(event, notify, { once: true });
    return tx;
  };
  disposers.push(() => { IDBDatabase.prototype.transaction = transaction; });
  const Reader = window.FileReader;
  window.FileReader = class extends Reader {
    readAsArrayBuffer(file, ...args) {
      const onload = this.onload;
      if (typeof onload === 'function') this.onload = async event => {
        try { await onload.call(this, event); }
        finally { window.dispatchEvent(new CustomEvent('qa:reader-complete', { detail: file.name })); }
      };
      return super.readAsArrayBuffer(file, ...args);
    }
  };
  disposers.push(() => { window.FileReader = Reader; });
  window.showSaveFilePicker = undefined; window.showDirectoryPicker = undefined;
  for (const prefix of ['', '5e.preview:']) localStorage.setItem(prefix + '5e.tutorial.bannerSeen', 'true');
  window.__cross = { listeners, disposers, waits: new Map(), notify, actions: [], idb: [], events: [], readerFiles: [], changes: [], projections: { scene: 0, viewport: 0, inspector: 0 },
    deadline(promise, name) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Controlled event deadline: ' + name)), 30000);
        disposers.push(() => clearTimeout(timer));
        Promise.resolve(promise).then(resolve, reject).finally(() => clearTimeout(timer));
      });
    } };
  if (observeGraphFocus) {
  const graphFocus = { observations: [], events: [], sequence: 0, capturedTarget: null };
  const describeFocusNode = node => {
    if (!(node instanceof Element)) return null;
    const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
    return { tag: node.tagName, id: node.id, className: node.getAttribute('class'), role: node.getAttribute('role'),
      ariaLabel: node.getAttribute('aria-label'), text: (node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
      connected: node.isConnected, isGraphEditButton: node.matches('[data-ai-graph-edit]'),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      display: style.display, visibility: style.visibility, animationName: style.animationName,
      animationDuration: style.animationDuration, transitionProperty: style.transitionProperty, transitionDuration: style.transitionDuration };
  };
  const graphMotion = () => {
    const nodes = [document.querySelector('#graph-modal-overlay'), document.querySelector('#ai-image-panel'), graphFocus.capturedTarget].filter(Boolean);
    const animations = [...new Set(nodes.flatMap(node => typeof node.getAnimations === 'function' ? node.getAnimations({ subtree: true }) : []))];
    return { supported: nodes.every(node => typeof node.getAnimations === 'function'),
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      animations: animations.map(animation => ({ id: animation.id, kind: animation.constructor.name,
        playState: animation.playState, currentTime: typeof animation.currentTime === 'number' ? animation.currentTime : String(animation.currentTime),
        pending: animation.pending, target: describeFocusNode(animation.effect?.target),
        timing: animation.effect?.getComputedTiming?.() })) };
  };
  window.__cross.graphFocus = graphFocus;
  window.__cross.graphMotionAnimations = () => {
    const nodes = [document.querySelector('#graph-modal-overlay'), document.querySelector('#ai-image-panel'), graphFocus.capturedTarget].filter(Boolean);
    return [...new Set(nodes.flatMap(node => typeof node.getAnimations === 'function' ? node.getAnimations({ subtree: true }) : []))];
  };
  window.__cross.recordGraphFocus = (phase, target, overlay) => {
    if (phase === 'before-open') graphFocus.capturedTarget = target;
    const expected = target || graphFocus.capturedTarget;
    const observation = { sequence: ++graphFocus.sequence, phase, at: performance.now(),
      capturedTarget: describeFocusNode(expected), activeElement: describeFocusNode(document.activeElement),
      sameNode: Boolean(expected && expected === document.activeElement), overlayHidden: overlay?.hidden ?? null,
      motion: graphMotion() };
    graphFocus.observations.push(observation); notify(); return observation;
  };
  const recordFocusEvent = event => {
    graphFocus.events.push({ sequence: ++graphFocus.sequence, event: event.type, at: performance.now(),
      target: describeFocusNode(event.target), relatedTarget: describeFocusNode(event.relatedTarget),
      activeElement: describeFocusNode(document.activeElement), motion: graphMotion() });
  };
  for (const event of ['focusin', 'focusout', 'transitionrun', 'transitionend', 'transitioncancel', 'animationstart', 'animationend', 'animationcancel']) {
    document.addEventListener(event, recordFocusEvent, true); disposers.push(() => document.removeEventListener(event, recordFocusEvent, true));
  }
  }
  const action = event => {
    const target = event.target instanceof Element ? event.target : null;
    window.__cross.actions.push({ event: event.type, at: new Date().toISOString(), viewport: { width: innerWidth, height: innerHeight },
      target: target && { tag: target.tagName, id: target.id, role: target.getAttribute('role'), label: target.getAttribute('aria-label'),
        data: { ...target.dataset } }, key: event.type === 'keydown' ? event.key : undefined,
      x: event.clientX, y: event.clientY });
  };
  for (const event of ['click', 'pointerdown', 'pointerup', 'keydown', 'input', 'change']) {
    document.addEventListener(event, action, true); disposers.push(() => document.removeEventListener(event, action, true));
  }
  const read = event => { window.__cross.readerFiles.push(event.detail); notify(); };
  window.addEventListener('qa:reader-complete', read); disposers.push(() => window.removeEventListener('qa:reader-complete', read));
}

async function installGraphFocusObservation(ctx, page) {
  const source = ctx.input('js/graph/graph-modal.js', 'actual graph opener/Cancel focus boundary; observational source injection only, original focus/hide code retained').toString();
  const opening = '  _focusReturn = document.activeElement;';
  const closing = '  _focusReturn?.focus({preventScroll:true}); _focusReturn = null;';
  assert.equal(source.split(opening).length, 2, 'Graph focus capture boundary changed; re-audit required');
  assert.equal(source.split(closing).length, 2, 'Graph focus restore boundary changed; re-audit required');
  const instrumented = source.replace(opening, opening + "\n  window.__cross?.recordGraphFocus?.('before-open', _focusReturn, _overlay);")
    .replace(closing, closing + "\n  window.__cross?.recordGraphFocus?.('after-hide', null, _overlay);");
  ctx.result.inputs.push({ provenance: 'observational graph focus source adaptation; no replacement of original product statements',
    originalSha256: sha(source), instrumentedSha256: sha(instrumented), seams: [opening.trim(), closing.trim()] });
  await page.route('**/js/graph/graph-modal.js?*', route => route.fulfill({ contentType: 'text/javascript', body: instrumented }));
}

async function graphFocusReceipt(ctx, page, phase) {
  const state = await page.evaluate(() => {
    __cross.recordGraphFocus('diagnostic', null, document.querySelector('#graph-modal-overlay'));
    return { observations: __cross.graphFocus.observations, events: __cross.graphFocus.events };
  });
  const file = ctx.write(`QA8-zoom-${phase}-actual-focus-motion.json`, state); ctx.file(file, 'actual-focus-identity-and-motion');
  return state;
}

async function arm(page, id, predicate, arg, timeout = 30000) {
  await page.evaluate(({ id, source, arg, timeout }) => {
    const bound = source.replace(/\bimport\((['"])\/js\//g, (_, quote) => `import(${quote}${location.origin}/js/`);
    const condition = (0, eval)(`(${bound})`), signals = window.__cross;
    let running = false, changed = false, ended = false;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { clean(); reject(new Error('Cross-feature event deadline: ' + id)); }, timeout);
      function clean() { ended = true; clearTimeout(timer); signals.listeners.delete(check); }
      async function check() {
        if (ended) return;
        if (running) { changed = true; return; }
        running = true;
        try {
          do { changed = false; if (await condition(arg)) { clean(); resolve(true); return; } } while (changed && !ended);
        } catch (error) { clean(); reject(error); }
        finally { running = false; }
      }
      signals.listeners.add(check); signals.disposers.push(clean); void check();
    });
    // Rejections remain observable when awaited but never become unhandled while
    // an intervening click throws. Cleanup cancels every outstanding observer.
    promise.catch(() => {}); signals.waits.set(id, promise);
  }, { id, source: predicate.toString(), arg, timeout });
}
async function arrived(page, id) { await page.evaluate(id => window.__cross.waits.get(id), id); }
async function transition(page, id, predicate, arg, action, timeout) {
  await arm(page, id, predicate, arg, timeout); await action(); await arrived(page, id);
}

function sanitize(value) {
  if (typeof value === 'string' && /^data:/.test(value)) return { dataUrlSha256: sha(value), bytes: value.length, omitted: true };
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, /token|password|authorization/i.test(k) ? '[redacted]' : sanitize(v)]));
  return value;
}
function receiptContext(options) {
  const result = { scenario: options.scenario, engine: options.engine, url: options.report.url,
    startedAt: new Date().toISOString(), head: options.report.head, dirtyHash: options.report.dirtyHash,
    exactCommand: options.report.exactCommand, assertions: [], coverage: [], inputs: [], actions: [], resources: [], files: [], cleanup: [], errors: [] };
  const covered = new Set(); let serial = 0;
  const ctx = {
    ...options, result, covered,
    input(relative, provenance = 'retained local test fixture; transport replay, no new quality claim') {
      const absolute = path.isAbsolute(relative) ? relative : path.join(root, relative), bytes = fs.readFileSync(absolute);
      const item = { path: absolute, bytes: bytes.length, sha256: sha(bytes), provenance };
      if (!result.inputs.some(input => input.path === absolute)) result.inputs.push(item);
      return bytes;
    },
    async check(name, check) {
      const item = { id: `${options.scenario}.${++serial}`, name, engine: options.engine, inputHash: sha(json(result.inputs)),
        head: result.head, dirtyHash: result.dirtyHash, exactCommand: result.exactCommand, url: result.url,
        runtime: options.report.runtime, status: 'FAIL', startedAt: new Date().toISOString() };
      result.assertions.push(item);
      try { await check(); item.status = 'PASS'; }
      catch (error) { item.error = error.stack; throw error; }
      finally { item.endedAt = new Date().toISOString(); }
    },
    cover(id) { assert.ok(required[options.scenario].includes(id), 'Unknown coverage requirement ' + id); covered.add(id); },
    async act(name, action, page) {
      const item = { sequence: result.actions.length + 1, name, at: new Date().toISOString(), url: page?.url(), viewport: page?.viewportSize(), status: 'STARTED' };
      result.actions.push(item);
      try { const value = await action(); item.status = 'DONE'; return value; }
      catch (error) { item.status = 'FAIL'; item.error = error.message; throw error; }
    },
    write(name, value) { const file = path.join(options.directory, name); fs.writeFileSync(file, JSON.stringify(sanitize(value), null, 2)); return file; },
    file(file, kind) { const bytes = fs.readFileSync(file); const item = { path: file, kind, bytes: bytes.length, sha256: sha(bytes) }; result.files.push(item); return item; },
    async shot(page, name) { const file = path.join(options.directory, `${name}.png`); await page.screenshot({ path: file }); ctx.file(file, 'screenshot'); },
  };
  return ctx;
}

async function app(ctx, name, run, { count = 4, anonymous = false, ownerHooks = false, setupRoutes, browserZoom = false } = {}) {
  const workflow = require('./label-source-browser.cjs');
  const { mainModuleUrl, runtimeConfiguration, entryConfiguration } = require('./four-session-entry.cjs');
  const cleanups = [], directory = path.join(ctx.directory, name); fs.mkdirSync(directory);
  process.env.TASK2_ENGINE = ctx.engine;
  const resources = [], pendingBodies = [], blocked = [], requests = [];
  let page, errors, zoomFixture;
  try {
    if (browserZoom && ctx.engine === 'chromium') zoomFixture = isolatedChromiumZoomFixture(ctx, workflow, directory);
    ({ page, errors } = await (zoomFixture?.fixture || workflow.fixture)({ after: fn => cleanups.push(fn) }, count, directory, {
      browserContextOptions: { acceptDownloads: true, serviceWorkers: zoomFixture ? 'allow' : 'block', reducedMotion: 'reduce' },
      beforeNavigate: async page => {
        await page.addInitScript(installSignals, { observeGraphFocus: browserZoom });
        const origin = new URL(ctx.report.url).origin;
        await page.context().route('**/*', route => {
          const url = new URL(route.request().url());
          if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) { blocked.push(url.href); return route.abort('blockedbyclient'); }
          return route.fallback();
        });
        const main = ctx.input('js/main.js', 'actual candidate bootstrap; in-memory exposure of existing QA fixture hook only').toString();
        const runtime = runtimeConfiguration(entryConfiguration(), ctx.report.url, mainModuleUrl(ctx.input('index.html').toString(), ctx.report.url), main);
        const original = await page.request.get(runtime.mainUrl);
        assert.equal(original.status(), 200); assert.equal(sha(await original.body()), sha(Buffer.from(main)), 'External server must serve this candidate main.js');
        const hook = 'const aiPanel = initAiPanel(state, { freshStart: recoveryChoice === "fresh", materializeCandidate });';
        assert.ok(main.includes(hook), 'Existing main fixture exposure hook missing');
        let instrumented = main.replace(hook, hook + '\nwindow.__task2Manager=aiPanel; window.__candidateQA={state,examWorkspace,materializeCandidate}; window.loginResumeApp={state,aiPanel,get webLogin(){return webLogin;},openAiWithReference:(...args)=>openAiWithReference(...args),openIndependentAiReferences:(...args)=>openIndependentAiReferences(...args)}; state.subscribe((s,change)=>{window.__cross.changes.push({change,undo:s.undoStack.length,at:Date.now()});window.__cross.notify();}); window.__cross.notify();');
        if (ctx.scenario === 'QA3') {
          const guard = "if (change === 'native-text-input' && s.draftText?.nativeEditor) return;";
          assert.ok(instrumented.includes(guard));
          instrumented = instrumented.replace(guard, guard + '\nwindow.__cross.projections.viewport++;');
          for (const [relative, guard, key] of [
            ['js/render/scene.js', "if (change === 'native-text-input' && state.draftText?.nativeEditor) return;", 'scene'],
            ['js/inspector.js', 'if (change === "native-text-input" && s.draftText?.nativeEditor) return;', 'inspector'],
          ]) {
            const source = ctx.input(relative, 'exact after-guard build counter; actual renderer and exception execute unchanged').toString(); assert.ok(source.includes(guard));
            await page.route('**/' + relative + '?*', route => route.fulfill({ contentType: 'text/javascript', body: source.replace(guard, guard + `\nwindow.__cross.projections.${key}++;`) }));
          }
        }
        await page.route(runtime.mainUrl, route => route.fulfill({ contentType: 'text/javascript', body: 'await window.__seedReady;\n' + (anonymous ? `(${anonymousBridge.toString()})();\n` : '') + instrumented }));
        page.on('request', request => requests.push({ url: request.url(), method: request.method(), resourceType: request.resourceType() }));
        page.on('response', response => {
          const item = { url: response.url(), status: response.status(), contentType: response.headers()['content-type'], resourceType: response.request().resourceType() };
          resources.push(item);
          if (new URL(item.url).origin === origin && /\.(?:js|css|wasm|woff2?)(?:\?|$)/.test(item.url)) {
            pendingBodies.push(response.body().then(bytes => { item.bytes = bytes.length; item.sha256 = sha(bytes); }, error => { item.bodyError = error.message; }));
          }
        });
        if (ownerHooks) await installOwnerHooks(ctx, page);
        else {
          const source = ctx.input('js/ai-panel.js', 'actual controller import seam for fixture seeding; persistence paths remain public UI').toString();
          const hook = 'return {\n    deleteTask,';
          assert.equal(source.split(hook).length - 1, 1, 'Exact controller fixture boundary changed');
          await page.route('**/js/ai-panel.js?*', route => route.fulfill({ contentType: 'text/javascript', body: source.replace(hook, 'return panel.__crossController = {\n    crossPersistence: taskPersistence, deleteTask,') }));
        }
        if (browserZoom) await installGraphFocusObservation(ctx, page);
        if (setupRoutes) await setupRoutes(page);
      },
    }));
    // A renderer/protocol stall must produce a failed receipt and close this
    // owned context rather than keep the entire serial verification alive.
    let runtimeDeadline, runtimeExpired = false;
    try {
      await Promise.race([run(page), new Promise((resolve, reject) => {
        runtimeDeadline = setTimeout(() => { runtimeExpired = true; reject(new Error(`Actual browser case deadline: ${name} (180 seconds)`)); }, 180000);
      })]);
    } finally {
      clearTimeout(runtimeDeadline);
      if (runtimeExpired) await page.context().close();
    }
    await ctx.check(`${name}: no uncaught product runtime errors`, () => assert.deepEqual(errors, []));
    await ctx.check(`${name}: canonical stateful module URLs`, async () => {
      const urls = resources.map(item => item.url);
      for (const module of ['state', 'store', 'pages', 'text-editor', 'ai-panel', 'ai-task-workspaces', 'ai-label-background', 'ai-candidate-snapshot']) {
        const found = [...new Set(urls.filter(url => new URL(url).pathname.endsWith(`/${module}.js`)))];
        assert.deepEqual(found, [new URL(`/js/${module}.js${version}`, ctx.report.url).href], `actual loaded ${module} identity`);
      }
    });
  } finally {
    if (page && !page.isClosed()) {
      try {
        await ctx.shot(page, `${name}-final`);
        const diagnostics = await page.evaluate(async () => {
          const sends = window.__task2?.sends || [];
          const cryptoHash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, '0')).join('');
          const transport = [];
          for (const item of sends) transport.push({ purpose: item.payload.purpose, model: item.payload.model, effort: item.payload.effort,
            payloadSha256: await cryptoHash(JSON.stringify(item.payload)), text: item.payload.text,
            attachments: (item.payload.attachments || []).map(a => ({ name: a.name, kind: a.kind, data: a.data || a.dataUrl })) });
          return { origin: location.origin, transport, mockSendCount: sends.length, liveProviderCalls: 0,
            auth: window.loginResumeFixture?.calls, workspace: await window.__task2Manager?.sharingSnapshot(),
            source: window.__candidateQA?.state.get().objects, subscriptions: window.__cross?.listeners.size, uiActions: window.__cross?.actions };
        });
        ctx.write(`${name}-diagnostic.json`, diagnostics);
        ctx.write(`${name}-ui-actions.json`, diagnostics.uiActions);
        ctx.result.actions.push({ name: `${name}: transport counts`, mockSendCount: diagnostics.mockSendCount, liveProviderCalls: 0, auth: diagnostics.auth });
        await page.evaluate(() => { for (const dispose of window.__cross?.disposers || []) dispose(); window.__cross?.listeners.clear(); });
        ctx.result.cleanup.push({ name, observersAndWaitsDisposed: true });
      } catch (error) { ctx.result.errors.push({ phase: 'diagnostic/observer-cleanup', error: error.stack }); }
    }
    await Promise.allSettled(pendingBodies);
    ctx.result.resources.push(...resources.map(item => ({ case: name, ...item })));
    ctx.write(`${name}-network.json`, { requests, resources, blockedRemoteRequests: blocked, completeResourceClosureClaim: false });
    for(const release of ctx.pendingGateReleases||[])release();ctx.pendingGateReleases=[];
    for (const cleanup of cleanups.reverse()) {
      try { await cleanup(); } catch (error) { ctx.result.errors.push({ phase: 'fixture-cleanup', error: error.stack }); }
    }
    if (zoomFixture) {
      try { await zoomFixture.cleanup(); }
      catch (error) { ctx.result.errors.push({ phase: 'private-zoom-profile-cleanup', error: error.stack }); }
    }
    const file = path.join(directory, 'cleanup.json');
    const proof = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : null;
    ctx.result.cleanup.push({ name, fixture: proof, retainedExternalServer: true });
    if (!proof?.browserClosed || proof.retainedExternalServer !== true) ctx.result.errors.push({ phase: 'resource-cleanup', error: 'Missing actual browser/context closure receipt' });
    for (const filename of ['trace.zip', 'cleanup.json', 'diagnostic.json']) {
      const file = path.join(directory, filename); if (fs.existsSync(file)) ctx.file(file, filename);
    }
  }
}

function anonymousBridge() {
  // The login-resume fixture's transport boundary, on the same seeded app.
  const saved = sessionStorage.getItem('login-resume-fixture:connected');
  let loggedIn = saved === null ? true : saved === 'true';
  const calls = { login: 0, cancel: 0, send: 0, status: 0 }, listeners = new Set();
  const status = async () => { calls.status++; return { login: { loggedIn }, server: loggedIn }; };
  const old = window.fiveEDesktop;
  window.fiveEDesktop = window.fiveEWebAI = { ...old, status, start: async () => ({ ok: loggedIn }),
    send: async () => { calls.send++; throw new Error('Authentication QA must not submit an image request'); },
    login: async () => window.dispatchEvent(new Event('5e:web-login-request')),
    onEvent: fn => { listeners.add(fn); return () => listeners.delete(fn); } };
  window.fiveEWebLogin = () => { calls.login++; window.dispatchEvent(new CustomEvent('5e:web-login-progress', { detail: { state: 'ready', userCode: 'QA-CODE' } })); };
  window.fiveEWebContinueLogin = () => window.dispatchEvent(new CustomEvent('5e:web-login-progress', { detail: { state: 'authenticating' } }));
  window.fiveEWebCancelLogin = () => { calls.cancel++; };
  window.loginResumeFixture = { calls, connect(value = true) { loggedIn = value; sessionStorage.setItem('login-resume-fixture:connected', String(value)); window.dispatchEvent(new Event('5e:web-ai-status')); },
    duplicateStatus() { window.dispatchEvent(new Event('5e:web-ai-status')); } };
}

// Importing a real file can leave inactive scopes with the same task IDs. The
// active controller is authoritative, rather than the first flattened copy.
const tabs = async page => page.evaluate(async () => {
  const snapshot = await __task2Manager.sharingSnapshot(), owners = new Map();
  for (const workspace of snapshot.workspaces) for (const tab of workspace.tabs) owners.set(tab.id, tab);
  const active = document.querySelector('#ai-image-panel').__crossController;
  for (const tab of (await active.sharingSnapshot()).tabs) owners.set(tab.id, tab);
  return [...owners.values()];
});
const objects = page => page.evaluate(() => structuredClone(__candidateQA.state.get().objects));
const workspace = page => page.evaluate(() => __task2Manager.sharingSnapshot());
const closeAI = async page => { if (await page.locator(panel).isVisible()) { await page.locator(panel + ' [data-ai-close]').click(); await page.locator(panel).waitFor({ state: 'hidden' }); } };

async function selectTask(ctx, page, id) {
  const selected = () => page.evaluate(() => document.querySelector('#ai-image-panel .ai-task-tab.is-on')?.dataset.tabId);
  if (await selected() === id) {
    await ctx.check(`actual task ${id} already owns the visible workbench`, async () => assert.equal(await selected(), id));
    return;
  }
  const row = page.locator(`${panel} [data-tab-id="${id}"] .ai-task-tab-select`);
  if (!await row.count()) {
    const target = (await tabs(page)).find(tab => tab.id === id);
    assert.ok(target, 'Requested task must exist before changing workflows');
    const kind = target.conversionKind || 'image';
    await ctx.act(`navigate to actual ${kind} task list`, () => transition(page, 'task-workflow', kind =>
      document.querySelector('#ai-image-panel')?.dataset.aiWorkflow === kind, kind,
      () => page.locator(`${panel} [data-ai-workflow="${kind}"]`).click()), page);
    if (await selected() === id) return;
  }
  let opened = false;
  if (!await row.isVisible()) {
    ctx.input('js/panel-visibility.js', 'actual collapsed task-list drawer toggle; original page zoom and ownership retained');
    await ctx.act('open actual collapsed AI task list', () => page.locator(panel + ' .ai-head [data-panel-toggle="left"]').click(), page);
    await row.waitFor({ state: 'visible' }); opened = true;
  }
  await ctx.act(`select actual task ${id}`, () => transition(page, 'select-task', id => document.querySelector(`#ai-image-panel .ai-task-tab.is-on`)?.dataset.tabId === id,
    id, () => row.click()), page);
  if (opened) {
    await ctx.act('restore actual collapsed AI task list', () => page.locator(panel + ' .ai-head [data-panel-toggle="left"]').click(), page);
    await page.locator(panel + ' [data-panel-backdrop]').waitFor({ state: 'hidden' });
  }
}
async function checkpoint(ctx, page) {
  await ctx.act('checkpoint real workspaces', () => page.evaluate(() => __task2Manager.checkpointForClose()), page);
}
async function stored(page, owner = null) {
  return page.evaluate(async ({version,owner}) => {
    const { IndexedDBOutputCacheBackend } = await import('/js/ai-output-cache-store.js' + version);
    const rows = document.querySelectorAll('#ai-image-panel .ai-task-tab.is-on');
    if (rows.length !== 1) throw new Error('Expected exactly one visible active task owner');
    const activeOwner = { taskId: rows[0].dataset.tabId, scope: rows[0].dataset.aiWorkspaceLink };
    const selectedOwner = JSON.parse(localStorage.getItem('5e.aiActiveTask.v1') || 'null');
    if (!activeOwner.taskId || !activeOwner.scope || selectedOwner?.taskId !== activeOwner.taskId || selectedOwner.scope !== (activeOwner.scope === 'legacy' ? '' : activeOwner.scope)) {
      throw new Error('Visible task owner and persisted active workspace must agree');
    }
    const {taskId:ownerId,scope}=owner || activeOwner;
    const ownerPanel=scope===activeOwner.scope ? document.querySelector('#ai-image-panel') : document.getElementById('ai-workspace-'+scope);
    if(!ownerPanel?.__crossController?.ownsTask(ownerId))throw new Error('Durable read requires the exact captured owner, including an inactive workflow');
    const databaseName = scope === 'legacy' ? '5e-ai-image-tasks' : '5e-ai-image-tasks-' + scope;
    const backend = new IndexedDBOutputCacheBackend({ databaseName, storeName: 'tasks' });
    let saved;
    try { saved = await backend.get('workspace'); }
    finally { (await backend.open()).close(); }
    if (!saved?.tabs?.some(task => task.id === ownerId)) throw new Error('Active owner is missing from its exact durable workspace');
    return saved;
  }, {version,owner});
}

async function makeLabel(ctx, page, { task = 'task-0', labels = 'restore-editable', kind = 'general', verification = 'draft-first', request = '장치 연결을 보존해 변환해 주세요' } = {}) {
  const workflow = require('./label-source-browser.cjs');
  await selectTask(ctx, page, task); await workflow.choose(page, kind, labels);
  assert.ok(['draft-first', 'full'].includes(verification));
  if (labels === 'restore-editable') await page.locator(panel + ` [data-ai-setting-key="verification"] [data-ai-setting-value="${verification}"]`).click();
  await page.locator(panel + ' [data-ai-input]').fill(request);
  const startIndex = await page.evaluate(() => __task2.sends.length);
  await ctx.act(`${kind}/${labels}: actual Send`, () => page.locator(panel + ' [data-ai-send]').click(), page);
  await workflow.finish(page, { sourcePlan: workflow.verifiedPlan, startIndex });
  const candidate = (await tabs(page)).find(tab => tab.id === task).generated.at(-1);
  await ctx.check('real pipeline returned a bound candidate', () => { assert.ok(candidate); assert.match(candidate.candidateSha256, /^[a-f0-9]{64}$/); });
  if (verification === 'full' && labels === 'restore-editable') await ctx.check('actual full review completes before adopting the candidate', () => {
    assert.equal(candidate.imageLabelWorkflow.verificationMode, 'full');
    assert.equal(candidate.reviewState, 'passed'); assert.equal(candidate.reviewReport.verdict, 'pass');
    assert.ok(candidate.reviewReport.checks.length > 0);
    assert.ok(candidate.reviewReport.checks.every(check => check.status === 'pass'));
  });
  return candidate;
}

// The source helper's active-panel busy condition cannot establish background
// completion. Reuse its transport responses, observing the actual owning tab.
async function finishOwned(ctx, page, { task, startIndex, before }) {
  const workflow = require('./label-source-browser.cjs'); let next = startIndex;
  for (let phase = 0; phase < 30; phase++) {
    await arm(page, 'owner-provider-phase', async ({ task, next, before }) => {
      const snapshot = await __task2Manager.sharingSnapshot(), owner = snapshot.workspaces.flatMap(w => w.tabs).find(t => t.id === task);
      return __task2.sends.length > next || owner?.workState === 'completed' && owner.generated.length === before + 1;
    }, { task, next, before });
    await arrived(page, 'owner-provider-phase');
    const sends = await workflow.sends(page);
    if (sends.length === next) {
      await ctx.check('background pipeline consumed every emitted mock request', async () => {
        const owner = (await tabs(page)).find(t => t.id === task); assert.equal(owner.workState, 'completed'); assert.equal(owner.generated.length, before + 1);
      }); return next;
    }
    const request = sends[next];
    if (request.purpose === 'image') await workflow.emit(page, next, 'image');
    else if (request.text.includes('고정 후보: ')) await workflow.emit(page, next, 'assistant', workflow.jointResponse(request.text));
    else if (request.text.includes('최종 RAW 후보다')) await workflow.emit(page, next, 'assistant', workflow.placement(workflow.verifiedPlan));
    else if (request.text.includes('입력 원본 라벨 관찰')) await workflow.emit(page, next, 'assistant', JSON.stringify(workflow.verifiedPlan));
    else if (request.text.includes('FINAL_NATIVE_OVERLAY') || request.text.includes('검수')) await workflow.emit(page, next, 'assistant', workflow.report());
    else assert.fail('Unrecognized real owner transport phase: ' + request.text.slice(0, 200));
    next++;
  }
  assert.fail('Actual owning task did not finish within the known 30 transport phase limit');
}

async function richUnion(ctx, page, labelCandidate = null) {
  ctx.input('tests/fixtures/candidate-union.cjs', 'retained serialization field sentinels; replaced with valid actual native plans, no quality claim');
  const { mixedCandidate } = require('../fixtures/candidate-union.cjs');
  const sentinels = mixedCandidate(await page.evaluate(() => __task2.modified));
  const result = await page.evaluate(async ({ sentinels, labelCandidate, version }) => {
    const controller = document.querySelector('#ai-image-panel').__crossController, primary = await controller.sharingSnapshot();
    const reference = primary.tabs[0].attachments[0];
    const { buildWorkbenchGraph, workbenchGraphDataUrl } = await import('/js/graph/workbench-result.js' + version);
    const { graphSourceHash } = await import('/js/graph/reconstruction-workflow.js' + version);
    const source = { id: reference.id, hash: await graphSourceHash(reference.data), width: 512, height: 384 };
    const plan = { schema: '5e.graph-reconstruction/v1', source: { ...source, plotBox: { x: 40, y: 20, w: 432, h: 324 } },
      axes: { x: { scale: 'linear', title: '부모 그래프', unit: '', min: 0.123456789, max: 4.123456789, step: 1 }, y: { scale: 'linear', title: '속도', unit: '', min: 0, max: 4, step: 1 } },
      series: [{ id: 's1', kind: 'points', axis: 'y', certainty: 'exact', coordinateSpace: 'data', points: [{ x: .123456789, y: 0 }, { x: 1.123456789, y: 2 }, { x: 4.123456789, y: 3 }], breaks: [], endpoints: [] }], annotations: [], review: [] };
    const graphResult = buildWorkbenchGraph(plan, source);
    // Bind this newly built synthetic scene to its real drawing layer before
    // taking any baseline; undefined properties cannot be stored in JSON.
    for (const object of graphResult.objects) object.layerId = __candidateQA.state.get().activeLayerId;
    graphResult.traceReference = { data: reference.data, name: reference.name, width: 512, height: 384, plotBox: plan.source.plotBox };
    // The controlled parent preview actually depicts its native Korean axis.
    // This is a newly rendered synthetic graph, never a regenerated historical
    // replay PNG or a quality claim for a retained source response.
    const parentPreview=await __cross.deadline(workbenchGraphDataUrl(graphResult),'controlled native parent preview');
    const candidateHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(parentPreview)))].map(b=>b.toString(16).padStart(2,'0')).join('');
    const label = { ...sentinels, ...(labelCandidate || {}), id: 'cross-label', name: '교차 라벨', graphResult: null,
      graphEdit: { parentCandidateId: 'historical-graph', createdAt: 987, revision: { retained: true } } };
    // Actual generated source/candidate/plan bindings remain authoritative; the
    // extra sentinels test persistence and never manufacture verification.
    const graph = { ...sentinels, id: 'cross-graph', name: '교차 그래프', engine: 'native-graph', graphResult,
      sourceReferenceId: reference.id, sourceReferenceName: reference.name, data: parentPreview,candidateSha256:candidateHash,
      targetPlacement:{...sentinels.targetPlacement,candidateSha256:candidateHash} };
    const template = primary.tabs[0];
    const make = (id, candidate, conversionKind) => ({ ...structuredClone(template), id, title: id, input: '보존할 초안 ' + id,
      conversionKind, workState: 'completed', generated: [candidate], selectedCandidateId: candidate.id,
      conversationMessages: [{ role: 'user', content: '보존할 수정 이력' }], uiMessages: [{ kind: 'user', text: '보존할 수정 이력' }] });
    primary.tabs.push(make('cross-label-task', label, 'image'), make('cross-graph-task', graph, 'graph'));
    await controller.importSharingSnapshot(primary, null); await __task2Manager.checkpointForClose();
    return (await controller.sharingSnapshot()).tabs.filter(t => t.id.startsWith('cross-'));
  }, { sentinels, labelCandidate, version });
  ctx.write('rich-union-input.json', result);
  ctx.richBaseline = result;
  return result;
}

async function unionEqual(ctx, actual, expected, boundary) {
  for (const wanted of expected) {
    const found = actual.find(tab => tab.id === wanted.id);
    await ctx.check(`${boundary}: ${wanted.id} owner/selection/conversion`, () => { assert.ok(found); assert.equal(found.selectedCandidateId, wanted.selectedCandidateId); assert.equal(found.conversionKind, wanted.conversionKind); });
    for (const field of ['input', 'conversationMessages', 'uiMessages']) await ctx.check(`${boundary}: ${wanted.id}.${field}`, () => assert.deepEqual(found[field], wanted[field]));
    for (const candidate of wanted.generated) {
      const current = found.generated.find(item => item.id === candidate.id);
      await ctx.check(`${boundary}: ${candidate.id} exists`, () => assert.ok(current));
      for (const key of Object.keys(candidate)) await ctx.check(`${boundary}: ${candidate.id}.${key}`, () => assert.deepEqual(current[key], candidate[key]));
    }
  }
}

async function drawingFile(ctx, page, name) {
  await closeAI(page);
  await page.locator('#file-menu-btn').click(); await page.locator('#project-save').click();
  const dialog = page.locator('.modal-overlay:not([hidden])').last();
  await dialog.locator('.modal-input').fill(name);
  const waiting = page.waitForEvent('download');
  await ctx.act('actual drawing Save/download', () => dialog.getByRole('button', { name: '저장', exact: true }).click(), page);
  const download = await waiting, file = path.join(ctx.directory, name + '.5e'); await download.saveAs(file); ctx.file(file, 'downloaded-drawing');
  return file;
}
async function openDrawing(ctx, page, file) {
  await closeAI(page);
  await page.locator('#file-menu-btn').click(); const waiting = page.waitForEvent('filechooser');
  await page.locator('#project-open').click(); const chooser = await waiting;
  await arm(page, 'open-reader', () => window.__cross.readerDone === true);
  await page.evaluate(name => { window.__cross.readerDone = false; window.addEventListener('qa:reader-complete', function done(event) { if (event.detail === name) { window.removeEventListener('qa:reader-complete', done); window.__cross.readerDone = true; window.__cross.notify(); } }); }, typeof file === 'string' ? path.basename(file) : file.name);
  await chooser.setFiles(file);
  await ctx.act('actual drawing Open/confirm', () => page.getByRole('button', { name: '열기', exact: true }).click(), page);
  await arrived(page, 'open-reader');
}
async function parseFile(page, file) {
  return page.evaluate(async ({ bytes, version }) => (await import('/js/fivee-project.js' + version)).parseFiveEProject(new Uint8Array(bytes)), { bytes: [...fs.readFileSync(file)], version });
}

async function installOwnerHooks(ctx, page) {
  // Adapted verbatim boundaries from test-graph-owner-lifetime-browser. Product
  // execution remains real; the only added effects hold/release and settlement.
  ctx.input('tests/test-graph-owner-lifetime-browser.cjs', 'read-only reference for real render/checkpoint fault boundaries; not executed as coverage');
  const panelSource = ctx.input('js/ai-panel.js').toString(), renderer = ctx.input('js/graph/workbench-result.js').toString();
  const hook = 'return {\n    deleteTask,';
  const finish = "setStatus('새 수정본의 편집 내용은 유지했습니다. 미리보기 갱신 실패: ' + error.message,'error');\n      });";
  assert.equal(panelSource.split(hook).length - 1, 1, 'Owner controller fixture boundary changed; re-audit required');
  assert.ok(panelSource.includes(finish), 'Owner lifecycle fixture boundary changed; re-audit required');
  const storeHook = 'store: taskStore,';
  assert.ok(panelSource.includes(storeHook), 'Exact task store boundary is missing');
  await page.route('**/js/ai-panel.js?*', route => route.fulfill({ contentType: 'text/javascript', body: panelSource
    .replace(hook, 'return window.__ownerController = panel.__crossController = {\n    crossPersistence: taskPersistence, deleteTask,')
    .replace(storeHook, 'store: {put:async value=>{if(window.__checkpointGate){const gate=window.__checkpointGate;window.__checkpointGate=null;gate.entered.resolve();await gate.release.promise;}return taskStore.put(value);}},')
    .replace(finish, finish.slice(0, -2) + ").finally(()=>window.dispatchEvent(new Event('qa:graph-render-settled')));") }));
  const renderHook = 'export async function workbenchGraphDataUrl(result) {';
  assert.ok(renderer.includes(renderHook));
  await page.route('**/js/graph/workbench-result.js?*', route => route.fulfill({ contentType: 'text/javascript', body: renderer.replace(renderHook,
    renderHook + '\n if(window.__graphRenderGate){const gate=window.__graphRenderGate;gate.native=result;gate.entered.resolve();await gate.release.promise;}') }));
}

async function holdGraph(page) {
  await page.evaluate(() => {
    window.__graphRenderGate = { entered: Promise.withResolvers(), release: Promise.withResolvers() };
    window.__cross.graphSettled = false;
    const done = () => { window.__cross.graphSettled = true; window.__cross.notify(); };
    window.addEventListener('qa:graph-render-settled', done, { once: true });
    window.__cross.disposers.push(() => window.removeEventListener('qa:graph-render-settled', done));
  });
  await arm(page, 'graph-settled', () => window.__cross.graphSettled, null, 30000);
}
async function releaseGraph(ctx, page, reject = false) {
  await ctx.act(`release real graph renderer: ${reject ? 'rejection' : 'success'}`, () => page.evaluate(reject => {
    const gate = window.__graphRenderGate; window.__graphRenderGate = null;
    reject ? gate.release.reject(new Error('Controlled cross-feature preview failure')) : gate.release.resolve();
  }, reject), page);
  await arrived(page, 'graph-settled');
}

async function editGraph(ctx, page, text, { held = false, beforeConfirm } = {}) {
  // Responsive layouts collapse the rail while preserving the active task.
  // Reopening its already selected row is unnecessary; still use the real
  // selection UI whenever ownership actually changes.
  if (await page.locator(panel + ' .ai-task-tab.is-on').getAttribute('data-tab-id') !== 'cross-graph-task')
    await selectTask(ctx, page, 'cross-graph-task');
  await ctx.check('actual graph edit targets the currently selected graph task', async () =>
    assert.equal(await page.locator(panel + ' .ai-task-tab.is-on').getAttribute('data-tab-id'), 'cross-graph-task'));
  await page.locator(panel + ' [data-ai-graph-edit]').click(); await page.locator('#gm-labelx').fill(text); await page.locator('#gm-labelx').dispatchEvent('input');
  if (held) await holdGraph(page);
  // For other label values subscribe to the exact persistent write instead.
  await page.evaluate(() => {
    window.__cross.graphWrite = new Promise((resolve, reject) => {
      const previous = IDBObjectStore.prototype.put, timer = setTimeout(() => { restore(); reject(new Error('Graph revision checkpoint deadline')); }, 30000);
      function restore() { clearTimeout(timer); IDBObjectStore.prototype.put = previous; }
      IDBObjectStore.prototype.put = function (value, ...args) {
        const request = previous.call(this, value, ...args);
        if (this.name === 'tasks' && value?.key === 'workspace' && value.tabs?.some(t => t.id === 'cross-graph-task' && t.generated.length > 1)) this.transaction.addEventListener('complete', () => { restore(); resolve(); }, { once: true });
        return request;
      };
      window.__cross.disposers.push(restore);
    }); window.__cross.graphWrite.catch(() => {});
  });
  if (beforeConfirm) await beforeConfirm();
  await ctx.act('graph Apply creates independent revision', () => page.locator('#gm-confirm').click(), page);
  if (held) await page.evaluate(() => __cross.deadline(__graphRenderGate.entered.promise, 'graph renderer entered'));
  await page.evaluate(() => window.__cross.graphWrite);
  return (await tabs(page)).find(t => t.id === 'cross-graph-task').generated.at(-1);
}

async function execute(options) {
  const ctx = receiptContext(options);
  for (const file of ['tests/fixtures/ai-image-label-workflow.cjs', 'tests/helpers/label-source-browser.cjs', 'tests/helpers/four-session-entry.cjs', 'tests/helpers/ai-login-resume-fixture.cjs', 'tests/helpers/rhwp-exam.cjs']) ctx.input(file);
  try { await (options.probe === 'zoom-api' ? probeActualZoomAPI(ctx) : options.probe === 'zoom' ? realBrowserZoom(ctx) : scenarios[options.scenario](ctx)); }
  catch (error) { ctx.result.errors.push({ phase: 'scenario', error: error.stack }); }
  ctx.result.probe = options.probe || null;
  ctx.result.fullScenarioCoverageClaim = !options.probe;
  for (const id of options.probe === 'zoom-api' ? [] : options.probe === 'zoom' ? ['real-browser-zoom-200'] : required[options.scenario]) {
    const status = ctx.covered.has(id) ? 'PASS' : 'FAIL_MISSING_COVERAGE';
    ctx.result.coverage.push({ id, status, reason: status === 'PASS' ? 'actual assertions in this receipt' : gaps[id] || 'The actual cross-feature oracle did not complete; inspect failed assertion/action and scenario error.' });
    if (status !== 'PASS') {
      try { await ctx.check(`mandatory coverage ${id}`, () => assert.fail(gaps[id] || `Missing completed integration oracle: ${id}`)); } catch {}
    }
  }
  ctx.result.endedAt = new Date().toISOString();
  ctx.result.pass = ctx.result.assertions.length > 0 && ctx.result.errors.length === 0 && ctx.result.assertions.every(a => a.status === 'PASS') && ctx.result.coverage.every(c => c.status === 'PASS');
  ctx.write('actions.json', ctx.result.actions); ctx.write('coverage-ledger.json', ctx.result.coverage); ctx.write('report.json', ctx.result);
  return ctx.result;
}

const scenarios = {};

scenarios.QA1 = async ctx => {
  const login = require('./ai-login-resume-fixture.cjs');
  ctx.input('tests/test-ai-login-resume-browser.cjs', 'crop/login UI and failure-boundary reference, not run as combined coverage');
  for (const variant of ['image', 'graph', 'cancel', 'reload', 'partial']) {
    await app(ctx, `login-${variant}`, async page => {
      const rich = await richUnion(ctx, page); await closeAI(page);
      await page.evaluate(() => loginResumeFixture.connect(false));
      const library = await login.openCropLibrary(page);
      await library.locator('[data-unilib-crop-cancel]').click();
      // Search uses the real control and is asserted before and after auth.
      const search = library.locator('input[type="search"]');
      assert.equal(await search.count(), 1, 'Real library search control missing');
      await search.fill('로그인'); await search.press('Enter');
      await library.locator('[data-unilib-adjust]').click(); await library.locator('[data-unilib-crop-load-state]').waitFor({ state: 'hidden' });
      await login.cropReferences(page, library, 2);
      if (variant === 'partial') await page.evaluate(() => {
        const put = IDBObjectStore.prototype.put, populated = new Set();
        window.__cross.partialFault = { enabled: true, writes: 0, database: null };
        IDBObjectStore.prototype.put = function (value, ...args) {
          const fault = window.__cross.partialFault, name = this.transaction.db.name;
          if (this.name === 'tasks' && value?.key === 'workspace' && value.tabs?.some(t => t.attachments?.length && !t.id.startsWith('cross-'))) {
            populated.add(name); if (populated.size === 2 && !fault.database) fault.database = name;
            if (fault.enabled && name === fault.database) { fault.writes++; throw new DOMException('Second prepared crop transaction fault', 'QuotaExceededError'); }
          }
          return put.call(this, value, ...args);
        };
        window.__cross.disposers.push(() => { IDBObjectStore.prototype.put = put; });
      });
      if (variant === 'partial') await arm(page, 'partial-status', () => [...document.querySelectorAll('[data-unilib-status]')].some(n => n.textContent.includes('AI 작업실을 열지 못했습니다')));
      await ctx.act('actual saved crop assignment → login', () => login.sendLibrary(page, library,
        { count: 2, placement: variant === 'image' ? 'together' : 'separate', conversionKind: variant === 'graph' ? 'graph' : 'image' }), page);
      if (variant === 'partial') {
        await arrived(page, 'partial-status');
        await ctx.check('partial preparation failed visibly without showing login/AI', async () => {
          assert.ok(await page.evaluate(() => __cross.partialFault.writes > 0));
          assert.equal(await page.locator('.web-login-dialog').isVisible(), false); assert.equal(await page.locator(panel).isVisible(), false);
        });
        const first = await page.evaluate(() => loginResumeSent[0].references);
        await page.evaluate(() => { __cross.partialFault.enabled = false; });
        await login.sendLibrary(page, library, { count: 2 });
        await ctx.check('explicit partial-save retry preserves both real crops', async () => assert.deepEqual(await page.evaluate(() => loginResumeSent[1].references), first));
      }
      const dialog = page.locator('.web-login-dialog'); await dialog.waitFor({ state: 'visible' });
      const sent = await page.evaluate(() => structuredClone(loginResumeSent.at(-1)));
      await ctx.check('two distinct ordered PNG crops carry page/region identities', () => {
        assert.equal(sent.references.length, 2); assert.notEqual(sent.references[0].dataUrl, sent.references[1].dataUrl);
        for (const item of sent.references) { assert.equal(item.source.documentId, 'resume-book'); assert.ok(Array.isArray(item.source.rect)); }
      });
      for (let i = 0; i < sent.references.length; i++) {
        const file = path.join(ctx.directory, `login-${variant}-crop-${i}.png`);
        fs.writeFileSync(file, Buffer.from(sent.references[i].dataUrl.split(',')[1], 'base64')); ctx.file(file, 'actual-library-crop');
      }
      if (variant === 'cancel') {
        await dialog.locator('[data-login-start]').click(); await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
        await ctx.act('late mock auth success after cancel', () => page.evaluate(() => loginResumeFixture.connect()), page);
        await checkpoint(ctx, page);
        await ctx.check('canceled login stays closed and original crop library survives', async () => { assert.equal(await page.locator(panel).isVisible(), false); assert.equal(await library.isVisible(), true); });
        await login.sendLibrary(page, library, { count: 2 });
      } else {
        if (variant === 'reload') {
          await ctx.act('reload actual pending intent', () => page.reload({ waitUntil: 'domcontentloaded' }), page);
          await dialog.waitFor({ state: 'visible' });
        }
        await dialog.locator('[data-login-start]').click();
        await ctx.act('complete transport-only authentication', () => page.evaluate(() => loginResumeFixture.connect()), page);
        await dialog.waitFor({ state: 'hidden' });
      }
      await page.locator(panel).waitFor({ state: 'visible' });
      if (variant !== 'reload') await library.waitFor({ state: 'hidden' });
      await checkpoint(ctx, page);
      const after = await tabs(page), wanted = sent.references.map(r => ({ name: r.name, data: r.dataUrl, source: r.source }));
      const imported = after.filter(t => t.attachments?.some(a => wanted.some(r => a.data === r.data)));
      await ctx.check('durable imports preserve exact crop bytes/provenance/order/bundle', () => {
        const grouping = variant === 'image' ? [[0, 1]] : [[0], [1]];
        assert.deepEqual(imported.map(t => t.attachments.map(a => ({ name: a.name, data: a.data, source: a.source }))), grouping.map(indices => indices.map(i => wanted[i])));
        assert.ok(imported.every(t => t.conversionKind === (variant === 'graph' ? 'graph' : 'image')));
      });
      await unionEqual(ctx, after, rich, `${variant}: auth sharingSnapshot`);
      await ctx.check('authentication requests zero generations and duplicate completion imports once', async () => {
        assert.equal(await page.evaluate(() => loginResumeFixture.calls.send), 0);
        const before = await workspace(page); await page.evaluate(() => { for (let i = 0; i < 5; i++) loginResumeFixture.duplicateStatus(); });
        await checkpoint(ctx, page); assert.deepEqual(await workspace(page), before);
      });
      if (variant !== 'reload') await ctx.check('nonempty library query is retained through handoff', async () => assert.equal(await search.inputValue(), '로그인'));
      // Rich label+graph fields are checked again after a real durable reload.
      await ctx.act('reload imported rich workspaces', () => page.reload({ waitUntil: 'domcontentloaded' }), page);
      await page.locator('#ai-image-install-open').click();
      await unionEqual(ctx, await tabs(page), rich, `${variant}: reloaded checkpoint`);
      ctx.cover({ image: 'crop-login-image', graph: 'crop-login-graph', cancel: 'cancel-late-retry', reload: 'reload-intent', partial: 'partial-save-retry' }[variant]);
    }, { anonymous: true, count: 1 });
  }
  ctx.cover('rich-union-login');
};

function pngBytes(data) { assert.match(data, /^data:image\/png;base64,/); return Buffer.from(data.split(',')[1], 'base64'); }
function decodePng(bytes) {
  const playwright = require.resolve(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const core = path.dirname(require.resolve('playwright-core/package.json', { paths: [path.dirname(playwright)] }));
  return require(path.join(core, 'lib/utilsBundle.js')).PNG.sync.read(bytes);
}
async function rawEqual(ctx, a, b, name) {
  const first = pngBytes(a.data), second = pngBytes(b.data);
  await ctx.check(name + ': full decoded PNG bytes and SHA', () => {
    assert.deepEqual(first, second); assert.equal(sha(first), sha(second)); assert.deepEqual(decodePng(first).data, decodePng(second).data); assert.equal(a.candidateSha256, b.candidateSha256);
  });
}

scenarios.QA2 = async ctx => {
  ctx.input('tests/test-label-background-invariance-browser.cjs', 'RAW invariance oracle reference; not executed as a relabeled suite');
  const approved = JSON.parse(ctx.input('tests/fixtures/rhwp-approved-first-contract.json'));
  for (const initial of ['remove', 'restore-editable']) await app(ctx, `raw-${initial}`, async page => {
    const first = await makeLabel(ctx, page, { task: 'task-0', labels: initial });
    const rich = await richUnion(ctx, page, initial === 'restore-editable' ? first : null);
    const opposite = initial === 'remove' ? 'restore-editable' : 'remove';
    const second = await makeLabel(ctx, page, { task: 'task-1', labels: opposite });
    await rawEqual(ctx, first, second, 'opposite labels');
    await ctx.check('labels toggle affects only editable native plan; one full image call', async () => {
      assert.equal(await page.evaluate(() => __task2.sends.filter(s => s.payload.purpose === 'image').length), 1);
      assert.equal(first.labelPlan?.labels.length || 0, initial === 'remove' ? 0 : 1); assert.equal(second.labelPlan?.labels.length || 0, opposite === 'remove' ? 0 : 1);
      assert.equal(second.workflowMetrics.calls.fullGeneration, 0); assert.equal(second.workflowMetrics.backgroundReused, 'storage');
      // Removing all native labels completes the background-only workflow;
      // an editable draft still awaits its independent review.
      assert.equal(first.reviewState, initial === 'remove' ? 'passed' : 'needs-attention');
      assert.equal(second.reviewState, opposite === 'remove' ? 'passed' : 'needs-attention');
    });
    const request = await page.evaluate(() => __task2.sends.find(s => s.payload.purpose === 'image').payload);
    await ctx.check('approved request hash/preprocessed attachment and independent observation', async () => {
      assert.equal(first.workflowMetrics.generationHarness.promptSha256, approved.promptSha256);
      assert.ok(request.attachments.some(a => a.name === approved.attachmentName));
      const observations = await page.evaluate(() => __task2.sends.filter(s => s.payload.text.includes('입력 원본 라벨 관찰')).map(s => ({ model: s.payload.model, effort: s.payload.effort })));
      assert.ok(observations.length); assert.ok(observations.every(r => r.model === 'gpt-6-luna' && r.effort === 'medium'));
      const attachment = request.attachments.find(a => a.name === approved.attachmentName);
      const image = decodePng(pngBytes(attachment.data || attachment.dataUrl)); assert.ok(Math.max(image.width, image.height) <= approved.transport.maxLongEdge); assert.ok(image.width * image.height <= approved.transport.maxPixels);
    });
    ctx.write(`raw-${initial}-request.json`, request);
    await checkpoint(ctx, page);
    await ctx.act('same-origin preview compatibility reload of RAW + rich fields', () => page.goto(new URL('/preview/', ctx.report.url).href, { waitUntil: 'domcontentloaded' }), page);
    await page.locator('#ai-image-install-open').click();
    await unionEqual(ctx, await tabs(page), rich, 'same-origin preview checkpoint');
    const restored = await makeLabel(ctx, page, { task: 'task-2' });
    await rawEqual(ctx, first, restored, 'preview reload');
    await ctx.check('preview reuses saved RAW without another full generation', async () => assert.equal(await page.evaluate(() => __task2.sends.filter(s => s.payload.purpose === 'image').length), 0));
    await checkpoint(ctx, page); await page.goto(ctx.report.url, { waitUntil: 'domcontentloaded' }); await page.locator('#ai-image-install-open').click();
    await unionEqual(ctx, await tabs(page), rich, 'root after preview');
    // Each negative key gets observably different full transport pixels.
    await page.evaluate(() => {
      const emit = __task2.emit; __task2.emit = (i, kind, text) => emit(i, kind, kind === 'image' ? __cross.negativePng : text);
      __cross.negativePng = __task2.original;
    });
    const changed = await makeLabel(ctx, page, { task: 'task-3', labels: 'remove', request: '왼쪽 부품만 수정해 주세요' });
    await ctx.check('changed content misses RAW key and produces different PNG', async () => {
      assert.notDeepEqual(pngBytes(changed.data), pngBytes(first.data)); assert.notEqual(changed.workflowMetrics.generationHarness.key, first.workflowMetrics.generationHarness.key);
      assert.equal(await page.evaluate(() => __task2.sends.filter(s => s.payload.purpose === 'image').length), 1);
    });
    // Actual supported model UI, with unchanged content and input.
    await selectTask(ctx, page, 'task-4');
    const oldModel = await page.locator(panel + ' [data-ai-model]').inputValue();
    await page.locator(panel + ` [data-ai-setting-key=model] [data-ai-model-choice=${oldModel === 'gpt-6-luna' ? 'sol' : 'luna'}]`).click();
    const selectedModel = await page.locator(panel + ' [data-ai-model]').inputValue();
    assert.notEqual(selectedModel, oldModel);
    const modelOutput = await page.evaluate(async () => {
      const image = new Image(); image.src = __task2.modified; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 384;
      const g = canvas.getContext('2d'); g.drawImage(image, 0, 0); g.fillRect(70, 70, 5, 5);
      return __cross.negativePng = canvas.toDataURL('image/png');
    });
    ctx.result.inputs.push({ provenance: 'synthetic different model transport PNG; no quality claim', sha256: sha(pngBytes(modelOutput)), bytes: pngBytes(modelOutput).length });
    const modelChanged = await makeLabel(ctx, page, { task: 'task-4', labels: 'remove' });
    await ctx.check('supported model change misses RAW key, returns independent bytes and adds one image request', async () => {
      assert.notEqual(modelChanged.workflowMetrics.generationHarness.key, first.workflowMetrics.generationHarness.key);
      assert.notEqual(modelChanged.data, first.data); assert.notEqual(modelChanged.data, changed.data);
      assert.equal(await page.evaluate(() => __task2.sends.filter(s => s.payload.purpose === 'image').length), 2);
    });
    const sourceChanged = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 384; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 512, 384); g.fillStyle = '#000'; g.fillRect(80, 60, 250, 200);
      return __cross.negativePng = c.toDataURL('image/png');
    });
    ctx.result.inputs.push({ provenance: 'explicit synthetic source-change bitmap', sha256: sha(pngBytes(sourceChanged)), bytes: pngBytes(sourceChanged).length });
    await selectTask(ctx, page, 'task-5');
    await page.locator(panel + ` [data-ai-setting-key=model] [data-ai-model-choice=${selectedModel === 'gpt-6-luna' ? 'luna' : 'sol'}]`).click();
    assert.equal(await page.locator(panel + ' [data-ai-model]').inputValue(), selectedModel, 'source-only negative keeps the previous model');
    await transition(page, 'replace-source', async data => (await document.querySelector('#ai-image-panel').__crossController.sharingSnapshot()).tabs.find(t => t.id === 'task-5').attachments[0].data === data,
      sourceChanged, () => page.locator(panel + ' [data-ai-replace-source-input]').setInputFiles({ name: 'changed-source.png', mimeType: 'image/png', buffer: pngBytes(sourceChanged) }));
    const newSource = await makeLabel(ctx, page, { task: 'task-5', labels: 'remove' });
    await ctx.check('source change misses RAW key, returns independent bytes and adds one image request', async () => {
      assert.notEqual(newSource.workflowMetrics.generationHarness.key, modelChanged.workflowMetrics.generationHarness.key);
      assert.notEqual(newSource.data, modelChanged.data); assert.notEqual(newSource.data, first.data);
      assert.equal(await page.evaluate(() => __task2.sends.filter(s => s.payload.purpose === 'image').length), 3);
    });
    ctx.cover(initial === 'remove' ? 'raw-off-on' : 'raw-on-off'); ctx.cover('approved-request'); ctx.cover('raw-reload-preview'); ctx.cover('content-source-model-keys');
  }, { count: 6 });
  for (const labels of ['remove', 'restore-editable']) await app(ctx, `policy-exam-${labels}`, async page => {
    const candidate = await makeLabel(ctx, page, { kind: 'exam', labels });
    const original = await page.evaluate(() => __task2.original);
    await ctx.check('exam labels policy never full-generates and never approves editability alone', async () => {
      assert.equal(await page.evaluate(() => __task2.sends.filter(s => s.payload.purpose === 'image').length), 0); assert.equal(candidate.workflowMetrics.calls.fullGeneration, 0);
      assert.equal(candidate.reviewState, labels === 'remove' ? 'passed' : 'needs-attention');
      if (labels === 'remove') assert.equal(candidate.labelPlan?.labels.length || 0, 0);
    });
    const pixels = await page.evaluate(async ({ candidate, original, version }) => {
      const { buildExamLabelRemovalMasks } = await import('/js/ai-exam-label-removal.js' + version);
      const read = async url => { const img = new Image(); img.src = url; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return { data: [...g.getImageData(0, 0, c.width, c.height).data], width: c.width, height: c.height }; };
      // Fail if product no longer exposes the real ownership-mask contract;
      // do not substitute an all-pixels mask to manufacture a zero difference.
      if (typeof buildExamLabelRemovalMasks !== 'function') throw new Error('Actual confirmed-ownership removal mask export missing');
      const before = await read(original), after = await read(candidate.data);
      return { before, after, mask: [...buildExamLabelRemovalMasks(candidate.sourceLabelPlan, before.width, before.height, candidate.imageLabelWorkflow).mask] };
    }, { candidate, original, version });
    await ctx.check('exam decoded RGBA outside ownership mask is unchanged', () => {
      assert.equal(pixels.before.width, pixels.after.width); assert.equal(pixels.before.height, pixels.after.height);
      assert.ok(pixels.mask?.length === pixels.before.width * pixels.before.height);
      for (let i = 0; i < pixels.mask.length; i++) if (!pixels.mask[i]) assert.deepEqual(pixels.after.data.slice(i * 4, i * 4 + 4), pixels.before.data.slice(i * 4, i * 4 + 4));
      const deferred = new Set(candidate.removalReport?.deferredLabels?.map(l => l.labelId)); assert.ok((candidate.labelPlan?.labels || []).every(l => !deferred.has(l.id)));
    });
  });
  ctx.cover('policy-matrix');
};

async function labelPoint(page, id) {
  const locator = page.locator(`#scene [data-id="${id}"]:not([data-ui]) rect[fill="transparent"]`).first();
  await locator.waitFor({ state: 'visible' });
  const box = await locator.boundingBox(); assert.ok(box && box.width > 0 && box.height > 0, 'Native label hit area is rendered');
  return page.locator(`#scene [data-id="${id}"]:not([data-ui]) text`).first().evaluate(text => {
    const e = text.getExtentOfChar(0), m = text.getScreenCTM(), a = new DOMPoint(e.x, e.y).matrixTransform(m), b = new DOMPoint(e.x + e.width, e.y + e.height).matrixTransform(m);
    const r = text.closest('[data-id]').querySelector('rect[fill="transparent"]').getBoundingClientRect();
    const x0 = Math.max(r.left, a.x), x1 = Math.min(r.right, b.x), y0 = Math.max(r.top, a.y), y1 = Math.min(r.bottom, b.y);
    if (!(x1 > x0 && y1 > y0)) throw new Error('Visible glyph does not overlap native hit area');
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  });
}
async function selectLabel(ctx, page, id) {
  await page.evaluate(() => __candidateQA.state.update(s => { s.selectedIds = []; s.targetedId = null; }));
  const point = await labelPoint(page, id);
  await transition(page, 'label-selection', id => {
    const s = __candidateQA.state.get(); return s.selectedIds.length === 1 && s.selectedIds[0] === id && document.querySelector(`#handles [data-id="${id}"]`);
  }, id, () => ctx.act('first native label click selects', () => page.mouse.click(point.x, point.y), page));
}
async function insertSelected(ctx, page) {
  await checkpoint(ctx, page);
  const selected = await page.evaluate(async version => {
    const controller = document.querySelector('#ai-image-panel').__crossController;
    const snapshot = await controller.sharingSnapshot(), task = snapshot.tabs.find(t => t.id === controller.activeTask());
    const candidate = task.generated.find(c => c.id === task.selectedCandidateId);
    const { canEditLabelReviewDraft } = await import('/js/ai-label-review-draft.js' + version);
    return { taskId: task.id, candidate, draft: canEditLabelReviewDraft(candidate),
      input: task.input, conversationMessages: task.conversationMessages, uiMessages: task.uiMessages };
  }, version);
  const oldFooterInsert = page.locator(panel + ' [data-ai-insert-selected]');
  const insert = page.locator(panel + ' .is-ai-active-candidate [data-ai-canvas-output]');
  const draft = page.locator(panel + ' [data-ai-edit-review-draft]');
  if (selected.draft) {
    await ctx.check('unreviewed editable draft uses its distinct visible canvas action', async () => {
      assert.equal(selected.candidate.reviewState, 'needs-attention');
      assert.ok(['uncertain', 'fail'].includes(selected.candidate.reviewReport.verdict));
      assert.equal(await oldFooterInsert.isVisible(), false);
      assert.equal(await insert.isDisabled(), true, 'Unreviewed drafts cannot use regular candidate insertion');
      assert.equal(await draft.isVisible(), true); assert.equal(await draft.isEnabled(), true);
    });
    await ctx.act('actual Canvas edit of selected review draft', () => draft.click(), page);
  } else {
    await ctx.check('regular selected candidate exposes the regular insertion action', async () => {
      assert.equal(await draft.isVisible(), false); assert.equal(await oldFooterInsert.isVisible(), false);
      assert.equal(await insert.isVisible(), true); assert.equal(await insert.isEnabled(), true);
    });
    await ctx.act('actual Insert selected candidate', () => insert.click(), page);
  }
  await page.locator(panel).waitFor({ state: 'hidden' });
  if (selected.draft) await ctx.check('canvas draft insertion preserves the entire unreviewed candidate', async () => {
    const task = (await tabs(page)).find(t => t.id === selected.taskId);
    assert.deepEqual(task.generated.find(c => c.id === selected.candidate.id), selected.candidate);
  });
  await ctx.check('canvas insertion appends its expected log and preserves all prior history', async () => {
    const task = (await tabs(page)).find(t => t.id === selected.taskId);
    const count = selected.candidate.labelPlan?.labels?.length || 0;
    const message = selected.draft
      ? `검토용 그림과 편집 라벨 ${count}개를 캔버스에 넣었습니다. 검수 미통과 표시를 유지합니다.`
      : count ? `이미지와 편집 가능한 자동 라벨 ${count}개를 페이지에 넣었습니다.` : '이미지를 페이지에 넣었습니다.';
    assert.equal(task.input, selected.input);
    assert.deepEqual(task.conversationMessages, selected.conversationMessages);
    assert.deepEqual(task.uiMessages, [...selected.uiMessages, { kind: 'assistant', text: message }]);
    // Advance only the history changed by this verified user action. Every
    // existing candidate field and owner baseline remains independently fixed.
    const baseline = ctx.richBaseline?.find(t => t.id === selected.taskId);
    if (baseline) baseline.uiMessages = structuredClone(task.uiMessages);
  });
}

scenarios.QA3 = async ctx => app(ctx, 'labels-files-materializer', async page => {
  ctx.input('tests/test-ai-editable-drafts-browser.cjs', 'actual native glyph hit and click/edit oracle reference');
  ctx.input('tests/test-ai-candidate-materializer.mjs', 'negative ownership matrix reference; exercised here on actual canvas service');
  const candidate = await makeLabel(ctx, page), rich = await richUnion(ctx, page, candidate);
  await selectTask(ctx, page, 'cross-label-task'); await insertSelected(ctx, page);
  const native = await objects(page), image = native.find(o => o.type === 'image'), label = native.find(o => o.aiAutoLabel);
  await ctx.check('actual label candidate materializes native label + byte-identical locked background', () => {
    assert.ok(label && label.type === 'labeler'); assert.equal(image.src, candidate.data); assert.equal(image.imageSelectionLocked, true); assert.ok(!label.locked); assert.ok(label.leaderRoutes?.length);
  });
  await page.evaluate(() => __candidateQA.state.update(s => { s.objects.push({ id: 'manual-cross', type: 'line', labelType: 'quantity', p1: { x: -30, y: -30 }, p2: { x: -20, y: -20 }, stroke: '#111', strokeWidth: .2, layerId: s.activeLayerId, positionLocked: false }); }));
  const manual = (await objects(page)).find(o => o.id === 'manual-cross');
  await selectLabel(ctx, page, label.id);
  await ctx.check('first click selects without text input', async () => assert.equal(await page.locator('.ai-inline-label-editor').count(), 0));
  let point = await labelPoint(page, label.id); await page.mouse.click(point.x, point.y);
  const input = page.locator('.ai-inline-label-editor'); await input.waitFor({ state: 'visible' });
  await ctx.check('inline text owns focus after real AI closing motion', async () => assert.equal(await input.evaluate(n => n === document.activeElement), true));
  await transition(page, 'text-commit', id => __candidateQA.state.get().objects.find(o => o.id === id)?.text === '전류 센서', label.id,
    async () => { await input.fill('전류 센서'); await input.press('Enter'); });
  point = await labelPoint(page, label.id); await page.mouse.click(point.x, point.y); await input.waitFor({ state: 'visible' });
  await input.fill('취소할 초안'); await input.press('Escape');
  await ctx.check('Escape preserves committed text and original background', async () => {
    const all = await objects(page); assert.equal(all.find(o => o.id === label.id).text, '전류 센서'); assert.equal(all.find(o => o.id === image.id).src, image.src); assert.deepEqual(all.find(o => o.id === manual.id), manual);
  });
  ctx.cover('label-click-edit-cancel');
  await selectLabel(ctx, page, label.id);
  const beforeDrag = (await objects(page)).find(o => o.id === label.id);
  // Label endpoint p2 is the handle named p1; handle p2 edits optional p3.
  const handle = page.locator(`#handles rect[fill="transparent"][data-id="${label.id}"][data-handle="p1"]`);
  assert.equal(await handle.count(), 1, 'the actual p2 endpoint has one transparent hit rectangle');
  const box = await handle.boundingBox(); assert.ok(box);
  await transition(page, 'drag-label', ({ id, before }) => JSON.stringify(__candidateQA.state.get().objects.find(o => o.id === id)?.p2) !== JSON.stringify(before), { id: label.id, before: beforeDrag.p2 }, async () => {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 22, box.y + box.height / 2 + 14, { steps: 4 }); await page.mouse.up();
  });
  const edited = (await objects(page)).find(o => o.id === label.id);
  await ctx.check('p2 drag moves attached leader start and keeps target/typography', () => {
    assert.notDeepEqual(edited.p2, beforeDrag.p2); assert.deepEqual(edited.p1, beforeDrag.p1); assert.equal(edited.labelSize, beforeDrag.labelSize); assert.equal(edited.fontFamily, beforeDrag.fontFamily);
    const dx = edited.p2.x - beforeDrag.p2.x, dy = edited.p2.y - beforeDrag.p2.y;
    for (let i = 0; i < edited.leaderRoutes.length; i++) {
      const prior = beforeDrag.leaderRoutes[i], next = edited.leaderRoutes[i]; assert.deepEqual(next.target, prior.target);
      if (prior.attachment === 'label') { assert.ok(Math.abs(next.start.x - prior.start.x - dx) < 1e-7); assert.ok(Math.abs(next.start.y - prior.start.y - dy) < 1e-7); }
    }
  });
  await page.locator('#undo-btn').click(); await ctx.check('real Undo returns native leader/text geometry', async () => assert.deepEqual((await objects(page)).find(o => o.id === label.id), beforeDrag));
  await page.locator('#redo-btn').click(); await ctx.check('real Redo restores native leader/text geometry', async () => assert.deepEqual((await objects(page)).find(o => o.id === label.id), edited));
  ctx.cover('label-drag-history');
  const before = await objects(page), file = await drawingFile(ctx, page, 'QA3-native-label-graph-union');
  const portable = await parseFile(page, file);
  await unionEqual(ctx, portable.workspace.ai.workspaces.flatMap(w => w.tabs), rich, 'downloaded .5e workspace');
  await ctx.check('download contains real native scene rather than candidate-only pixels', () => assert.deepEqual(portable.drawing.pages.find(p => p.id === portable.drawing.activePageId).objects, before));
  // Open a different document first; the real chooser must restore from bytes.
  await page.evaluate(() => __candidateQA.state.update(s => { s.objects = [{ id: 'other-document', type: 'line', p1: { x: 0, y: 0 }, p2: { x: 5, y: 5 }, layerId: s.activeLayerId }]; s.selectedIds = []; }));
  await openDrawing(ctx, page, file);
  await ctx.check('actual downloaded .5e reopen preserves native label fields/RAW/manual object', async () => {
    const loaded = await objects(page); for (const original of openedImageDefaults(before)) assert.deepEqual(loaded.find(o => o.id === original.id), original);
  });
  await unionEqual(ctx, await tabs(page), rich, 'actual .5e restore'); ctx.cover('actual-drawing-roundtrip');
  const negative = await page.evaluate(async ({ imageId, candidate, version }) => {
    const state = __candidateQA.state, before = structuredClone(state.get());
    state.update(s => { s.selectedIds = [imageId]; });
    const baseline = structuredClone(state.get());
    const { insertImageFromSrc } = await import('/js/image-paste.js' + version);
    let message; try { await insertImageFromSrc(state, candidate.data, { replaceId: imageId, aiTaskId: 'cross-label-task', aiCandidateId: 'generic-unsafe' }); } catch (error) { message = error.message; }
    return { before, baseline, after: structuredClone(state.get()), message };
  }, { imageId: image.id, candidate, version });
  await ctx.check('generic replacement rejects selection-locked background with no partial mutation', () => { assert.match(negative.message || '', /잠긴/); assert.deepEqual(negative.after, negative.baseline); }); ctx.cover('generic-locked-rejection');
  for (const kind of ['foreign-task', 'position-locked', 'cluster-member-locked', 'cluster-member-position-locked', 'wrong-link', 'target-edited']) {
    const outcome = await page.evaluate(async ({ kind, imageId, candidate }) => {
      const state = __candidateQA.state, value = state.get(), target = value.objects.find(o => o.id === imageId), currentPage = value.pages.find(p => p.id === value.activePageId);
      const saved = structuredClone(target), originalMeta = structuredClone(currentPage.meta), options = { taskId: kind === 'foreign-task' ? 'foreign-owner' : 'cross-label-task', replaceId: imageId };
      const member=value.objects.find(o=>o.aiAutoLabel&&o.aiParentImageId===imageId),savedMember=structuredClone(member);
      if(kind.startsWith('cluster-member-')){if(!member)throw new Error('No actual native member to lock');state.update(()=>{member[kind==='cluster-member-locked'?'locked':'positionLocked']=true;});}
      if (kind === 'position-locked') state.update(() => { target.positionLocked = true; });
      let current = true; options.isCurrent = () => current;
      if (kind === 'wrong-link' || kind === 'target-edited') {
        const gate = window.__cross.materializeGate = { entered: Promise.withResolvers(), release: Promise.withResolvers() };
        const pending = __candidateQA.materializeCandidate({ ...candidate, id: 'negative-revision' }, options).then(() => ({ accepted: true }), error => ({ accepted: false, message: error.message }));
        await __cross.deadline(gate.entered.promise, 'materializer decode entered');
        if (kind === 'wrong-link') state.update(() => { currentPage.meta = { ...currentPage.meta, examLink: { tabId: 'foreign-tab', assetId: 'foreign-asset' } }; });
        else state.update(() => { target.x += 1; });
        const baseline = structuredClone(state.get()); window.__cross.materializeGate = null; gate.release.resolve();
        const outcome = await pending, after = structuredClone(state.get());
        state.update(() => { Object.assign(target, saved); currentPage.meta = originalMeta; }); return { ...outcome, baseline, after };
      }
      const baseline = structuredClone(state.get()); let accepted = true, message;
      try { await __candidateQA.materializeCandidate({ ...candidate, id: 'negative-revision' }, options); } catch (error) { accepted = false; message = error.message; }
      const after = structuredClone(state.get()); state.update(() => { delete target.positionLocked; Object.assign(target, saved);if(kind.startsWith('cluster-member-')){delete member.locked;delete member.positionLocked;Object.assign(member,savedMember);} }); return { accepted, message, baseline, after };
    }, { kind, imageId: image.id, candidate });
    await ctx.check(`${kind}: owned materializer strictly rejects and retains full old cluster/history`, () => { assert.equal(outcome.accepted, false); assert.match(outcome.message, /所有|소유|변경|잠긴/); assert.deepEqual(outcome.after, outcome.baseline); });
  }
  ctx.cover('foreign-locked-stale-rejection');
  // Actual version controls create/select the owned revision; shared canvas
  // materialization is invoked only after that selection has been observed.
  await page.locator('#ai-image-install-open').click(); await selectTask(ctx, page, 'cross-label-task');
  const revision = { ...clone(rich.find(t => t.id === 'cross-label-task').generated[0]), id: 'cross-label-revision', name: '독립 라벨 수정본' };
  revision.labelPlan.labels[0].text = '새 라벨'; revision.scopedEditHistory.push({ parentCandidateId: 'cross-label', createdAt: 1001, comments: [] });
  ctx.input('js/ai-label-target-placement.js', 'requested local label-text revision rebinds the changed plan with the actual original placement function; parent source and RAW retained');
  await page.evaluate(async ({revision,version}) => {
    const {bindLabelTargetPlacement}=await import('/js/ai-label-target-placement.js'+version);
    const editedPlan=structuredClone(revision.labelPlan.sourcePlan);
    editedPlan.labels=structuredClone(revision.labelPlan.labels);
    revision.targetPlacement=await bindLabelTargetPlacement({plan:editedPlan,candidateDataUrl:revision.data,imageKind:revision.targetPlacement.imageKind,labels:revision.targetPlacement.labels});
    revision.planSha256=revision.targetPlacement.planSha256;
    revision.labelPlan.sourcePlan=editedPlan;
    revision.labelPlan.targetPlacement=structuredClone(revision.targetPlacement);
    const controller = document.querySelector('#ai-image-panel').__crossController, snapshot = await controller.sharingSnapshot(), tab = snapshot.tabs.find(t => t.id === 'cross-label-task'); tab.generated.push(revision); await controller.importSharingSnapshot(snapshot, null);
  }, {revision,version});
  await page.locator(panel + ' [data-ai-version-button]').click(); await page.locator(panel + ' [data-ai-candidate-option="cross-label-revision"]').click();
  const selected = (await tabs(page)).find(t => t.id === 'cross-label-task'); assert.equal(selected.selectedCandidateId, revision.id);
  const stats = await page.evaluate(async ({ revision, imageId }) => {
    const s = __candidateQA.state, before = structuredClone(s.get().objects), undo = s.get().undoStack.length; let notifications = 0; const off = s.subscribe(() => notifications++);
    await __candidateQA.materializeCandidate(revision, { taskId: 'cross-label-task', replaceId: imageId }); off();
    return { before, after: structuredClone(s.get().objects), undoBefore: undo, undoAfter: s.get().undoStack.length, notifications };
  }, { revision: selected.generated.find(c => c.id === revision.id), imageId: image.id });
  await ctx.check('owned locked-background revision commits native cluster once and preserves manual object/history', () => {
    assert.equal(stats.notifications, 1); assert.equal(stats.undoAfter, stats.undoBefore + 1); assert.deepEqual(stats.after.find(o => o.id === manual.id), manual);
    assert.equal(stats.after.find(o => o.type === 'image').imageSelectionLocked, true); assert.equal(stats.after.find(o => o.type === 'image').src, image.src);
    assert.equal(stats.after.find(o => o.aiAutoLabel).text, '새 라벨'); assert.ok(selected.generated.some(c => c.id === 'cross-label'));
  });
  const revisedFile = await drawingFile(ctx, page, 'QA3-owned-revision'); await openDrawing(ctx, page, revisedFile);
  await ctx.check('successful owned native cluster survives independently downloaded revision reopen', async () => assert.deepEqual(await objects(page), stats.after)); ctx.cover('owned-native-revision');
}, { setupRoutes: async page => {
  const source = fs.readFileSync(path.join(root, 'js/image-paste.js'), 'utf8'), hook = 'export async function prepareImageCandidateRevision(image, src, options) {\n  await loadImageSize(src);';
  assert.ok(source.includes(hook), 'Actual image decoding preparation boundary changed');
  await page.route('**/js/image-paste.js?*', route => route.fulfill({ contentType: 'text/javascript', body: source.replace(hook, 'export async function prepareImageCandidateRevision(image, src, options) {\n  const decoding=loadImageSize(src); if(window.__cross.materializeGate){const gate=window.__cross.materializeGate;gate.entered.resolve();await gate.release.promise;} await decoding;') }));
} });

async function replayGraph(ctx, page) {
  const fixture = JSON.parse(ctx.input(replay));
  const response = ctx.input(fixture.responseFile, 'retained actual provider response replay; byte verified, no live/new quality claim');
  assert.equal(sha(response), fixture.responseSha256); assert.deepEqual(JSON.parse(response), fixture.plan);
  const source = ctx.input(fixture.sourceFile, 'retained source PNG copied by main writer from read-only graph source');
  const receipt = JSON.parse(ctx.input('.omo/evidence/codex-continuation-20261010/graph-replay-inputs.json', 'main-writer copy/hash provenance receipt'));
  for (const file of [fixture.responseFile, fixture.sourceFile]) { const row = receipt.find(r => r.path === path.join(root, file)); assert.ok(row); assert.equal(row.sha256, sha(fs.readFileSync(row.path))); assert.equal(row.providerCalls, 0); }
  await selectTask(ctx, page, 'task-1'); await page.locator(panel + ' [data-ai-workflow="graph"]').click();
  await transition(page, 'replay-upload', () => [...document.querySelectorAll('#ai-image-panel .ai-image-card img')].some(i => i.complete && i.naturalWidth === 831), null,
    () => page.locator(panel + ' [data-ai-source-file]').setInputFiles({ name: 'p2_2021_09_03.png', mimeType: 'image/png', buffer: source }));
  const taskId = await page.evaluate(() => document.querySelector('#ai-image-panel').__crossController.activeTask());
  const next = await page.evaluate(() => __task2.sends.length);
  const prior = await page.evaluate(() => __task2.sends.map(s => s.payload));
  await arm(page, 'graph-request', next => __task2.sends.length > next, next);
  await ctx.act('real graph upload/restoration Send', () => page.locator(panel + ' [data-ai-send]').click(), page); await arrived(page, 'graph-request');
  const request = await page.evaluate(i => __task2.sends[i].payload, next);
  assert.equal(request.purpose, 'scene'); const binding = request.text.match(/바인딩을 정확히 복사하고[^\n]*: (\{[^\n]+\})/); assert.ok(binding);
  const reply = clone(fixture.plan); reply.source = { ...JSON.parse(binding[1]), plotBox: clone(fixture.plan.source.plotBox) };
  await transition(page, 'graph-replay-done', () => document.querySelector('#ai-image-panel')?.dataset.aiBusy === 'false', null,
    () => require('./label-source-browser.cjs').emit(page, next, 'assistant', JSON.stringify(reply)));
  const candidate = (await tabs(page)).find(t => t.id === taskId).generated.at(-1);
  await ctx.check('recorded plan becomes editable analytic graph; replay only binds request source', async () => {
    assert.ok(candidate.graphResult); for (const id of fixture.expectedAnalyticSeries) { const curve = candidate.graphResult.objects.find(o => o.reconstruction?.seriesId === id); assert.equal(curve?.sourceKind, 'expression'); assert.ok(curve.expr); }
    const requests = await page.evaluate(() => __task2.sends.map(s => s.payload));
    assert.deepEqual(requests.slice(0, next), prior, 'earlier label observation/image requests remain unchanged');
    assert.equal(requests.slice(next).length, 1, 'graph restoration makes exactly one new provider request');
    assert.equal(requests.slice(next).filter(s => s.purpose === 'scene').length, 1);
  });
  return { candidate, taskId };
}

async function lifecycle(ctx, kind, { exam = false } = {}) {
  await app(ctx, `owner-${kind}`, async page => {
    const label = await makeLabel(ctx, page, { verification: exam ? 'full' : 'draft-first' }), rich = await richUnion(ctx, page, label);
    if (exam) {
      await sendAiFigure(ctx, page, 'cross-label-task'); await require('./rhwp-exam.cjs').action(page, 'close'); await page.locator('#ai-image-install-open').click();
      await sendAiFigure(ctx, page, 'cross-graph-task'); await require('./rhwp-exam.cjs').action(page, 'close'); await page.locator('#ai-image-install-open').click();
      await ctx.check('same-owner replacement has a graph linked by the actual document Send',async()=>{
        const task=(await tabs(page)).find(tab=>tab.id==='cross-graph-task');assert.ok(task.examLink?.tabId&&task.examLink?.assetId);
      });
    }
    await selectTask(ctx, page, 'cross-graph-task'); await checkpoint(ctx, page);
    const graphOwner=await page.evaluate(()=>{
      const row=document.querySelector('#ai-image-panel .ai-task-tab.is-on'),active=JSON.parse(localStorage.getItem('5e.aiActiveTask.v1')||'null');
      if(row?.dataset.tabId!=='cross-graph-task'||active?.taskId!==row.dataset.tabId||active.scope!==(row.dataset.aiWorkspaceLink==='legacy'?'':row.dataset.aiWorkspaceLink))throw new Error('Graph lifetime fixture requires the real selected graph owner');
      return{taskId:row.dataset.tabId,scope:row.dataset.aiWorkspaceLink};
    });ctx.write('held-graph-exact-owner.json',graphOwner);
    if(exam)await page.evaluate(()=>{
      const controller=document.querySelector('#ai-image-panel').__crossController,original=controller.importSharingSnapshot;
      __cross.heldGraphController=controller;__cross.heldGraphImports=[];
      const observed=function(snapshot,...args){
        __cross.heldGraphImports.push({taskIds:snapshot.tabs.map(tab=>tab.id),graphCandidateIds:snapshot.tabs.find(tab=>tab.id==='cross-graph-task')?.generated.map(candidate=>candidate.id)});
        return original.call(this,snapshot,...args);
      };controller.importSharingSnapshot=observed;
      __cross.disposers.push(()=>{if(controller.importSharingSnapshot===observed)controller.importSharingSnapshot=original;});
    });
    const parent = (await tabs(page)).find(t => t.id === 'cross-graph-task').generated[0];
    const revision = await editGraph(ctx, page, '새 그래프', { held: true });
    await ctx.check('held render already appended native revision with preserved parent', () => { assert.notEqual(revision.id, parent.id); assert.equal(revision.graphEdit.parentCandidateId, parent.id); assert.equal(revision.data, parent.data); });
    let replacementFile;
    if (exam) {
      await page.evaluate(() => { const gate = __graphRenderGate; window.__heldGraph = gate; window.__graphRenderGate = null; });
      await closeAI(page);
      await page.locator('#exam-workspace-open').click(); await require('./rhwp-exam.cjs').idle(page);
      replacementFile = await examFile(ctx, page, 'save', `QA6-owner-${kind}.5e`);
      await page.evaluate(() => { __graphRenderGate = window.__heldGraph; });
    }
    if (kind === 'background') {
      await selectTask(ctx, page, 'cross-label-task');
    } else if (exam) {
      await ctx.act('actual portable project restores identical task/candidate IDs over pending renderer', () => page.locator('#exam-project-file').setInputFiles(replacementFile), page);
      await require('./rhwp-exam.cjs').idle(page);
      await ctx.check('portable restore actually replaced the same linked graph controller and exact scope',async()=>{
        const proof=await page.evaluate(()=>({sameController:document.querySelector('#ai-image-panel').__crossController===__cross.heldGraphController,owner:__task2Manager.activeExamTask(),imports:__cross.heldGraphImports}));
        assert.equal(proof.sameController,true);assert.deepEqual(proof.owner,{taskId:graphOwner.taskId,scope:graphOwner.scope==='legacy'?'':graphOwner.scope});
        assert.ok(proof.imports.some(item=>item.taskIds.includes(graphOwner.taskId)&&item.graphCandidateIds.includes(revision.id)));ctx.write('same-controller-portable-replacement-proof.json',proof);
      });
    } else {
      await page.evaluate(async kind => {
        const replacement = await __ownerController.sharingSnapshot(), tab = replacement.tabs.find(t => t.id === 'cross-graph-task'), candidate = tab.generated.at(-1);
        candidate.name = 'Identical-ID replacement'; candidate.graphResult.objects.find(o => o.type === 'coordplane').labelX = '복원한 네이티브 그래프';
        candidate.comments = [{ number: 1, type: 'point', x: 1, y: 2, text: '교체 후 코멘트' }]; candidate.reviewState = 'needs-attention';
        if (kind === 'checkpoint') {
          const gate = window.__checkpointGate = { entered: Promise.withResolvers(), release: Promise.withResolvers() };
          const checkpoint = __ownerController.checkpointForClose(); await __cross.deadline(gate.entered.promise, 'checkpoint write entered');
          const imported = __ownerController.importSharingSnapshot(replacement, null); gate.release.resolve(); await checkpoint; await imported;
        } else await __ownerController.importSharingSnapshot(replacement, null);
      }, kind);
    }
    await checkpoint(ctx, page);
    const before = { snapshot: await workspace(page), saved: await stored(page,graphOwner), status: await page.locator(panel + ' [data-ai-status]').textContent() };
    await releaseGraph(ctx, page, kind === 'reject');
    const after = { snapshot: await workspace(page), saved: await stored(page,graphOwner), status: await page.locator(panel + ' [data-ai-status]').textContent() };
    if (kind === 'background') await ctx.check('ordinary inactive surviving owner gains and persists preview without changing active task', () => {
      const old = before.snapshot.workspaces.flatMap(w => w.tabs), now = after.snapshot.workspaces.flatMap(w => w.tabs), owner = now.find(t => t.id === 'cross-graph-task');
      assert.deepEqual(owner.generated[0], parent); assert.notEqual(owner.generated.at(-1).data, old.find(t => t.id === owner.id).generated.at(-1).data);
      assert.equal(after.saved.tabs.find(t => t.id === owner.id).generated.at(-1).data, owner.generated.at(-1).data);
      assert.deepEqual(now.find(t => t.id === 'cross-label-task'), old.find(t => t.id === 'cross-label-task'));
      assert.equal(after.snapshot.workspaces[0].activeTaskTabId, before.snapshot.workspaces[0].activeTaskTabId);
    });
    else await ctx.check('identical-ID replacement rejects stale renderer and queued persistence in actual mixed workspace', () => {
      assert.deepEqual(after.snapshot, before.snapshot); assert.deepEqual(after.saved, before.saved); assert.equal(after.status, before.status);
    });
    await unionEqual(ctx, after.snapshot.workspaces.flatMap(w => w.tabs), [rich.find(t => t.id === 'cross-label-task')], 'owner lifetime: unrelated rich label');
    ctx.write(`owner-${kind}-states.json`, { before, after, replacementFile });
  }, { ownerHooks: true });
}

scenarios.QA4 = async ctx => {
  await app(ctx, 'graph-compare-replay', async page => {
    const label = await makeLabel(ctx, page), rich = await richUnion(ctx, page, label);
    const { candidate: replayed, taskId: replayTaskId } = await replayGraph(ctx, page); ctx.cover('recorded-upload-replay');
    const generatedStage = page.locator(panel + ' .ai-generated-card .ai-preview-stage');
    assert.equal(await generatedStage.count(), 1, 'the current graph owner has exactly one generated preview');
    await generatedStage.dblclick(); await page.locator('#graph-modal-overlay').waitFor({ state: 'visible' });
    await ctx.check('actual graph child dialog is topmost above AI', async () => assert.equal(await page.locator('#gm-confirm').evaluate(n => { const r = n.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('#graph-modal-overlay') !== null; }), true));
    for (const mode of ['side', 'wipe', 'overlay', 'graph']) {
      await page.locator('select[data-trace-view]').selectOption(mode);
      await ctx.check(`actual compare mode ${mode}`, async () => assert.equal(await page.locator('select[data-trace-view]').inputValue(), mode));
    }
    await page.locator('select[data-trace-view]').selectOption('overlay');
    await ctx.check('overlay graph comparison color contract', async () => assert.equal(await page.locator('[data-trace-graph]').getAttribute('color'), '#166bff'));
    await page.locator('select[data-trace-view]').selectOption('wipe'); const divider = page.getByRole('slider', { name: '원본과 편집본 비교 경계' }); await divider.focus();
    for (const key of ['ArrowLeft', 'Shift+ArrowRight', 'Home', 'End']) await divider.press(key);
    await ctx.check('keyboard comparison divider covers exact endpoints', async () => assert.equal(await divider.getAttribute('aria-valuenow'), '100'));
    const box = await divider.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x - 50, box.y + box.height / 2); await page.mouse.up();
    const position = await divider.getAttribute('aria-valuenow');
    const oldTabs = await tabs(page), old = oldTabs.find(t => t.id === replayTaskId), count = old.generated.length;
    await transition(page, 'compare-apply', async ({ taskId, count }) => (await document.querySelector('#ai-image-panel').__crossController.sharingSnapshot()).tabs.find(t => t.id === taskId).generated.length === count + 1 && document.querySelector('#ai-image-panel [data-ai-status]')?.textContent.includes('편집을 적용'), { taskId: replayTaskId, count },
      () => page.locator('#gm-confirm').click()); await checkpoint(ctx, page);
    const changed = (await tabs(page)).find(t => t.id === replayTaskId);
    await ctx.check('divider-only Apply creates independent parent-linked revision', () => { assert.deepEqual(changed.generated.slice(0, -1), old.generated); assert.equal(changed.generated.at(-1).graphEdit.parentCandidateId, replayed.id); });
    await page.locator(panel + ' [data-ai-graph-edit]').click(); await page.locator('select[data-trace-view]').selectOption('wipe');
    await ctx.check('comparison divider persists through actual graph reopening', async () => assert.equal(await divider.getAttribute('aria-valuenow'), position));
    await page.locator('#gm-labelx').fill('취소할 축'); await page.locator('#gm-cancel').click();
    await ctx.check('graph Cancel preserves original/new candidates, comments and review', async () => assert.deepEqual((await tabs(page)).find(t => t.id === replayTaskId), changed));
    await unionEqual(ctx, await tabs(page), rich, 'graph compare: unrelated union'); ctx.cover('compare-revision-cancel');
    await selectTask(ctx, page, 'cross-graph-task'); const exact = (await tabs(page)).find(t => t.id === 'cross-graph-task').generated[0].graphResult;
    const noOp = await page.evaluate(async ({ exact, version }) => {
      const { editWorkbenchGraph } = await import('/js/graph/workbench-result.js' + version); window.__cross.noOp = null;
      editWorkbenchGraph(exact, { onApply: result => { __cross.noOp = result; __cross.notify(); } });
    }, { exact, version }); void noOp;
    await transition(page, 'exact-noop', () => Boolean(__cross.noOp), null, () => page.locator('#gm-confirm').click());
    await ctx.check('no-op keeps .123456789 domain and all native/contact fields exact', async () => assert.deepEqual(await page.evaluate(() => __cross.noOp), exact));
    const svg = await page.evaluate(async ({ exact, version }) => (await import('/js/graph/workbench-result.js' + version)).workbenchGraphDataUrl(exact), { exact, version });
    const bytes = Buffer.from(svg.split(',')[1], 'base64'), exported = path.join(ctx.directory, 'QA4-native-export.svg'); fs.writeFileSync(exported, bytes); ctx.file(exported, 'native-svg');
    await ctx.check('normal native SVG excludes compare layers/colors/nonfinite output', () => { const source = bytes.toString(); assert.doesNotMatch(source, /data-trace-layer|#166bff|NaN|Infinity|undefined/); assert.match(source, /<svg/); });
    await checkpoint(ctx, page); await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('#ai-image-install-open').click();
    await ctx.check('recorded native graph revisions persist after actual reload', async () => assert.deepEqual((await tabs(page)).find(t => t.id === replayTaskId), changed)); ctx.cover('exact-noop-svg');
  });
  for (const kind of ['success', 'reject', 'checkpoint', 'background']) {
    await lifecycle(ctx, kind);if(kind!=='checkpoint')ctx.cover({ success: 'same-id-late-success', reject: 'same-id-late-rejection', background: 'background-owner' }[kind]);
  }
};

async function rhwpReady(ctx, page) {
  const h = require('./rhwp-exam.cjs');
  await checkpoint(ctx, page);
  await h.navigate(page, ctx.report.url + '?mode=pro&mobile=0'); await h.ready(page);
  await page.locator('#ai-image-install-open').click();
}
async function sendAiFigure(ctx, page, taskId) {
  const h = require('./rhwp-exam.cjs');
  if (!h.runtime(page)) await rhwpReady(ctx, page);
  if (await page.locator('#rhwp-exam-workspace').isVisible()) await h.action(page, 'close');
  if (!await page.locator(panel).isVisible()) await page.locator('#ai-image-install-open').click();
  await selectTask(ctx, page, taskId);
  await ctx.act(`actual AI→RHWP capture ${taskId}`, () => h.crop(page, panel + ' [data-ai-exam-send]'), page);
  await ctx.act('actual document insertion point and placement', () => h.place(page), page);
  const pictures = await h.pictures(page);
  const figure = pictures.find(p => p.figure?.context?.ai?.taskId === taskId);
  assert.ok(figure, 'Actual linked RHWP picture must exist');
  await ctx.check(`${taskId}: materialized source tab native types`, () => {
    const native = figure.figure.source.pages[0].objects;
    if (taskId === 'cross-label-task') { assert.ok(native.some(o => o.type === 'labeler')); assert.ok(native.some(o => o.type === 'image' && o.imageSelectionLocked && o.aiLabelEditingBackground)); }
    else { const plane = native.find(o => o.type === 'coordplane'); assert.ok(plane); assert.ok(native.some(o => o.type === 'funcgraph' && o.planeId === plane.id)); assert.ok(native.every(o => o.aiTaskId === taskId)); }
  });
  return figure;
}
async function examFile(ctx, page, action, filename) {
  const h = require('./rhwp-exam.cjs'), waiting = page.waitForEvent('download');
  await ctx.act(`actual RHWP file menu ${action}`, () => h.action(page, action), page);
  const file = path.join(ctx.directory, filename); await (await waiting).saveAs(file); await h.idle(page); ctx.file(file, 'downloaded-' + action); return file;
}
async function pictureBytes(ctx, page, name, index = 0) {
  const bytes = await page.evaluate(index => {
    const wasm = document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.wasm;
    const ref = wasm.getPageControlLayout(0).controls.filter(c => c.type === 'image')[index];
    return [...wasm.getControlImageData(ref.secIdx, ref.paraIdx, ref.controlIdx, JSON.stringify(ref.cellPath || []))];
  }, index);
  const buffer = Buffer.from(bytes), file = path.join(ctx.directory, name + '.png'); fs.writeFileSync(file, buffer); ctx.file(file, 'actual-embedded-picture-PNG');
  return { encodedSha256: sha(buffer), pixelSha256: sha(decodePng(buffer).data), file };
}
async function linkedObjects(page, link) {
  return page.evaluate(link => {
    const s = __candidateQA.state.get(), p = s.pages.find(p => p.meta?.examLink?.tabId === link.tabId && p.meta.examLink.assetId === link.assetId);
    if (!p) throw new Error('Original linked source tab is missing');
    return structuredClone(p.id === s.activePageId ? s.objects : p.objects);
  }, link);
}
async function sourceText(ctx, page, id, text) {
  await page.evaluate(async ({ id, version }) => (await import('/js/text-editor.js' + version)).openLabelerTextEditor(id), { id, version });
  const input = page.locator('.ai-inline-label-editor'); await input.waitFor({ state: 'visible' });
  await ctx.act('type into tools actual source text editor without blur', () => input.fill(text), page);
}
async function nativeResize(ctx, page, figureIndex = 0) {
  const h = require('./rhwp-exam.cjs');
  const position = await h.point(page, 'image', figureIndex); await page.mouse.click(position.x, position.y);
  for (const dir of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
    const before = (await h.pictures(page))[figureIndex], bytesBefore = await pictureBytes(ctx, page, `resize-${dir}-before`, figureIndex);
    const history = await page.evaluate(() => document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().history.undoStack.length);
    const point = await page.evaluate(dir => {
      const frame = document.querySelector('#exam-studio iframe'), handler = frame.contentWindow.rhwpStudio.plugins.deps.getInputHandler();
      const handle = handler.pictureObjectRenderer.handles.find(h => h.dir === dir); if (!handle) throw new Error('Actual RHWP handle missing: ' + dir);
      const r = handle.el.getBoundingClientRect(), q = frame.getBoundingClientRect();
      return { x: q.x + (r.x + r.width / 2) * q.width / frame.clientWidth, y: q.y + (r.y + r.height / 2) * q.height / frame.clientHeight };
    }, dir);
    await ctx.act(`resize actual native ${dir} handle`, async () => {
      await page.mouse.move(point.x, point.y); await page.mouse.down();
      await ctx.check(`native ${dir} resize state is active`, async () => assert.equal(await page.evaluate(() => document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().pictureResizeState?.dir), dir));
      await page.mouse.move(point.x + (dir.includes('w') ? -8 : dir.includes('e') ? 8 : 0), point.y + (dir.includes('n') ? -8 : dir.includes('s') ? 8 : 0), { steps: 4 }); await page.mouse.up();
    }, page); await h.idle(page);
    const after = (await h.pictures(page))[figureIndex], bytesAfter = await pictureBytes(ctx, page, `resize-${dir}-after`, figureIndex);
    await ctx.check(`${dir}: uniform native picture-only resize, original bytes/crop/link unchanged`, async () => {
      assert.ok(Math.abs(after.props.width / after.props.height - before.props.width / before.props.height) < .003);
      assert.notEqual(after.props.width, before.props.width); assert.deepEqual(after.figure, before.figure); assert.equal(bytesAfter.encodedSha256, bytesBefore.encodedSha256);
      assert.equal(await page.evaluate(() => document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().history.undoStack.length), history + 1);
    });
  }
}

async function inlineRoutes(ctx, page, picture) {
  const h = require('./rhwp-exam.cjs');
  ctx.input('tests/test-rhwp-inline-routes-browser.cjs', 'retained straight/polyline/quadratic/cubic/multi/legacy geometry fixture, exercised here inside actual linked picture');
  await h.originalEdit(page, 0); await closeAI(page);
  // These are explicit manual annotations on the real linked candidate source,
  // not substitute PNGs or a detached ExamInlineEditor test host.
  const routeIds = await page.evaluate(bounds => {
    const state = __candidateQA.state, original = state.get().objects.find(o => o.type === 'labeler');
    const entries = [
      { kind: 'straight', controls: [] }, { kind: 'polyline', controls: [{ x: 45, y: 20 }, { x: 45, y: 55 }] },
      { kind: 'quadratic', controls: [{ x: 40, y: 10 }] }, { kind: 'cubic', controls: [{ x: 55, y: 10 }, { x: 25, y: 40 }] },
      { kind: 'multi', controls: [] }, { kind: 'legacy', controls: [] },
    ];
    state.update(s => {
      const point = p => ({ x: bounds.x + p.x / 100 * bounds.w, y: bounds.y + p.y / 80 * bounds.h });
      for (const [i, entry] of entries.entries()) {
        // Six simultaneous manual annotations need separate rows; the retained
        // standalone fixture originally opens one route at a time.
        const row = 10 + i * 12, p1 = point({ x: 20, y: row + 4 }), p2 = point({ x: 75, y: row });
        const label = { id: 'linked-route-' + entry.kind, type: 'labeler', p1, p2, text: entry.kind,
          labelSize: 2.5, fontFamily: original.fontFamily, layerId: original.layerId,
          strokeWidth: .2, positionLocked: false, labelTypographyVersion: 1,
          labelRuns: [{ text: entry.kind, role: 'text', contentMode: 'plain' }] };
        if (entry.kind === 'legacy') { label.elbow = { x: p1.x, y: p2.y }; label.extraAnchors = [point({ x: 22, y: row + 6 })]; }
        else {
          const controls = entry.kind === 'polyline' ? [{ x: 45, y: row - 3 }, { x: 45, y: row + 3 }]
            : entry.kind === 'quadratic' ? [{ x: 40, y: row - 4 }]
            : entry.kind === 'cubic' ? [{ x: 55, y: row - 4 }, { x: 25, y: row + 4 }] : [];
          label.leaderRoutes = [{ kind: entry.kind === 'multi' ? 'straight' : entry.kind, attachment: 'label', start: point({ x: 65, y: row }), target: { ...p1 }, controls: controls.map(point), end: 'circle' }];
          if (entry.kind === 'multi') label.leaderRoutes.push({ kind: 'straight', attachment: 'frame', start: point({ x: 10, y: row - 4 }), target: point({ x: 15, y: row + 4 }), controls: [], end: 'none' });
        }
        s.objects.push(label);
      } s.selectedIds = [];
    }); return entries.map(e => 'linked-route-' + e.kind);
  }, picture.figure.render.bounds);
  await page.locator('#exam-send').click(); await h.idle(page);
  await h.doubleClick(page, 0); const host = page.locator('#exam-inline-editor'); await host.waitFor({ state: 'visible' });
  const sourceLink = (await h.pictures(page))[0].figure.link;
  for (const id of routeIds) {
    const glyph = host.locator(`g[data-annotation-id="${id}"] text`).last();
    const point = await glyph.evaluate(text => {
      const r = text.getBoundingClientRect();
      for (const fraction of [.2, .8, .35, .65]) { const x = r.x + r.width * fraction, y = r.y + r.height / 2, hit = document.elementFromPoint(x, y); if (hit?.closest('[data-annotation-id]')?.dataset.annotationId === text.closest('[data-annotation-id]').dataset.annotationId && !hit.closest('[data-inline-handle]')) return { x, y }; }
      throw new Error('Routed native caption has no exposed hit point');
    }); await page.mouse.click(point.x, point.y);
    const before = (await linkedObjects(page, sourceLink)).find(o => o.id === id);
    const pathsBefore = await host.locator(`g[data-annotation-id="${id}"] [data-label-leader-route]`).evaluateAll(nodes => nodes.map(n => n.getAttribute('d')));
    async function drag(handleName, dx, dy, predicate) {
      const handle = host.locator(`[data-inline-handle="${handleName}"]`), b = await handle.boundingBox(); assert.ok(b, 'Actual inline route handle is visible');
      await transition(page, 'inline-route-' + handleName, predicate, { id, link: sourceLink }, async () => {
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy); await page.mouse.up();
      });
    }
    await page.evaluate(({ id, before }) => { __cross.routeBefore = before; }, { id, before });
    await drag('p1', 18, 12, ({ id, link }) => {
      const s = __candidateQA.state.get(), p = s.pages.find(p => p.meta?.examLink?.tabId === link.tabId), o = (p.id === s.activePageId ? s.objects : p.objects).find(o => o.id === id);
      return JSON.stringify(o.p1) !== JSON.stringify(__cross.routeBefore.p1);
    });
    const endpoint = (await linkedObjects(page, sourceLink)).find(o => o.id === id);
    const pathsAfter = await host.locator(`g[data-annotation-id="${id}"] [data-label-leader-route]`).evaluateAll(nodes => nodes.map(n => n.getAttribute('d')));
    await ctx.check(`${id}: p1 drag changes visible route endpoint and persisted target`, () => {
      assert.notDeepEqual(endpoint.p1, before.p1);
      if (endpoint.leaderRoutes) { assert.deepEqual(endpoint.leaderRoutes[0].target, endpoint.p1); assert.notDeepEqual(pathsAfter, pathsBefore); assert.deepEqual(pathsAfter[0].match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number).slice(-2), [endpoint.p1.x, endpoint.p1.y]); }
      else assert.deepEqual(endpoint.elbow, before.elbow);
    });
    await host.locator('[data-inline-action="undo"]').click();
    await ctx.check(`${id}: inline Undo source geometry`, async () => assert.deepEqual((await linkedObjects(page, sourceLink)).find(o => o.id === id), before));
    await host.locator('[data-inline-action="redo"]').click();
    await ctx.check(`${id}: inline Redo source geometry`, async () => assert.deepEqual((await linkedObjects(page, sourceLink)).find(o => o.id === id), endpoint));
    await page.evaluate(before => { __cross.routeBefore = before; }, endpoint);
    await drag('p2', 22, 10, ({ id, link }) => {
      const s = __candidateQA.state.get(), p = s.pages.find(p => p.meta?.examLink?.tabId === link.tabId), o = (p.id === s.activePageId ? s.objects : p.objects).find(o => o.id === id);
      return JSON.stringify(o.p2) !== JSON.stringify(__cross.routeBefore.p2);
    });
    const caption = (await linkedObjects(page, sourceLink)).find(o => o.id === id);
    await ctx.check(`${id}: p2 drag moves attached starts with caption and keeps endpoint`, () => {
      assert.notDeepEqual(caption.p2, endpoint.p2);
      if (caption.leaderRoutes) { const dx = caption.p2.x - endpoint.p2.x, dy = caption.p2.y - endpoint.p2.y;
        assert.deepEqual(caption.leaderRoutes[0].target, endpoint.leaderRoutes[0].target);
        assert.ok(Math.abs(caption.leaderRoutes[0].start.x - endpoint.leaderRoutes[0].start.x - dx) < 1e-7); assert.ok(Math.abs(caption.leaderRoutes[0].start.y - endpoint.leaderRoutes[0].start.y - dy) < 1e-7);
        if (caption.leaderRoutes.length > 1) assert.deepEqual(caption.leaderRoutes[1], endpoint.leaderRoutes[1]);
      }
    });
    if (caption.leaderRoutes?.[0].controls?.length) {
      await page.evaluate(before => { __cross.routeBefore = before; }, caption);
      await drag('route-0-control-0', 15, 10, ({ id, link }) => {
        const s = __candidateQA.state.get(), p = s.pages.find(p => p.meta?.examLink?.tabId === link.tabId), o = (p.id === s.activePageId ? s.objects : p.objects).find(o => o.id === id);
        return JSON.stringify(o.leaderRoutes[0].controls) !== JSON.stringify(__cross.routeBefore.leaderRoutes[0].controls);
      });
      const controlled = (await linkedObjects(page, sourceLink)).find(o => o.id === id), rendered = await host.locator(`g[data-annotation-id="${id}"] [data-label-leader-route]`).first().getAttribute('d');
      await ctx.check(`${id}: actual route control edits rendered and stored curve`, () => { const p = controlled.leaderRoutes[0].controls[0]; assert.notDeepEqual(p, caption.leaderRoutes[0].controls[0]); assert.ok(rendered.includes(`${p.x} ${p.y}`)); });
    }
  }
  await host.locator('[data-inline-field="text"]').fill('전류 센서'); await host.locator('[data-inline-field="text"]').press('Tab');
  await host.locator('[data-inline-action="apply"]').click(); await h.idle(page);
  const applied = (await h.pictures(page))[0].figure;
  await ctx.check('actual inline Apply commits routes into embedded source and original tab', async () => {
    const live = await linkedObjects(page, sourceLink); for (const id of routeIds) assert.deepEqual(applied.source.pages[0].objects.find(o => o.id === id), live.find(o => o.id === id)); assert.equal(applied.link.tabId, picture.figure.link.tabId);
  });
  return routeIds;
}

scenarios.QA5 = async ctx => {
  await app(ctx, 'rhwp-label-graph-portable', async page => {
    const h = require('./rhwp-exam.cjs'), label = await makeLabel(ctx, page, { verification: 'full' }), rich = await richUnion(ctx, page, label);
    const first = await sendAiFigure(ctx, page, 'cross-label-task'), second = await sendAiFigure(ctx, page, 'cross-graph-task');
    const all = await h.pictures(page);
    await ctx.check('actual native label/graph source tabs and document pictures have independent 1:1 links/defaults', async () => {
      assert.equal(all.length, 2); assert.notEqual(first.figure.link.tabId, second.figure.link.tabId); assert.notEqual(first.figure.link.assetId, second.figure.link.assetId);
      for (const picture of all) { assert.equal(picture.props.treatAsChar, true); assert.equal(picture.props.outerMarginTop, 500); assert.equal(picture.props.outerMarginBottom, 500); }
      const pages = await page.evaluate(() => __candidateQA.state.get().pages);
      for (const picture of all) assert.equal(pages.filter(p => p.meta?.examLink?.tabId === picture.figure.link.tabId && p.meta.examLink.assetId === picture.figure.link.assetId).length, 1);
    }); ctx.cover('label-graph-source-tabs');
    // The embedded context is read from WASM picture bytes, independently of
    // the sharing snapshot and independently of the project archive.
    for (const picture of all) {
      const task = rich.find(t => t.id === picture.figure.context.ai.taskId);
      const expected = { ...task, examLink: picture.figure.link };
      await unionEqual(ctx, picture.figure.context.ai.snapshot.tabs, [expected], 'actual embedded PNG context');
    } ctx.cover('embedded-union');
    await nativeResize(ctx, page); ctx.cover('eight-handles');
    const routeIds = await inlineRoutes(ctx, page, first); ctx.cover('inline-routed-leaders');
    await h.originalEdit(page, 0); await closeAI(page);
    const prior = (await h.pictures(page))[0], sourceLabel = (await objects(page)).find(o => o.type === 'labeler');
    await sourceText(ctx, page, sourceLabel.id, '보내지 않은 독립 초안');
    await ctx.act('return to exam without sending active source draft', () => page.evaluate(() => document.querySelector('#exam-workspace-open').click()), page); await h.idle(page);
    await ctx.check('return preserves sent document revision and distinct unapplied native source draft', async () => {
      assert.equal((await h.pictures(page))[0].figure.id, prior.figure.id);
      assert.equal((await linkedObjects(page, prior.figure.link)).find(o => o.id === sourceLabel.id).text, '보내지 않은 독립 초안');
      assert.notEqual(prior.figure.source.pages[0].objects.find(o => o.id === sourceLabel.id).text, '보내지 않은 독립 초안');
    });
    const saved = await examFile(ctx, page, 'save', 'QA5-native-label-graph-draft.5e'), portable = await parseFile(page, saved);
    await unionEqual(ctx, portable.workspace.ai.workspaces.flatMap(w => w.tabs), (await tabs(page)).filter(t => t.id.startsWith('cross-')), 'actual exam project archive');
    const fresh = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, serviceWorkers: 'block' });
    try {
      await fresh.addInitScript(readOnlyBridge); await fresh.route('**/*', route => new URL(route.request().url()).origin === new URL(ctx.report.url).origin ? route.fallback() : route.abort());
      const reopened = await fresh.newPage(); await h.navigate(reopened, ctx.report.url + '?mode=pro&mobile=0&exam=1'); await h.ready(reopened);
      await ctx.act('new-storage actual exam .5e file input', () => reopened.locator('#exam-project-file').setInputFiles(saved), reopened); await h.idle(reopened);
      const reloaded = await h.pictures(reopened);
      await ctx.check('fresh-context .5e restores sent label+graph figures, routes and different source draft', async () => {
        assert.equal(reloaded.length, 2); assert.deepEqual(reloaded.map(p => p.figure), (await h.pictures(page)).map(p => p.figure));
        const drawing = await h.drawing(reopened, h.runtime(reopened).stateUrl), linked = drawing.pages.find(p => p.meta?.examLink?.tabId === prior.figure.link.tabId);
        const native = linked.id === drawing.activePageId ? drawing.objects : linked.objects;
        assert.equal(native.find(o => o.id === sourceLabel.id).text, '보내지 않은 독립 초안');
        for (const id of routeIds) assert.ok(native.find(o => o.id === id));
        assert.ok(drawing.pages.some(p => p.objects.some(o => o.type === 'coordplane')));
      }); await ctx.shot(reopened, 'QA5-fresh-reopen');
    } finally { await fresh.close(); ctx.result.cleanup.push({ name: 'fresh-file-reopen', contextClosed: true }); }
    ctx.cover('unapplied-draft-project');
    const beforeNative = (await h.pictures(page)).map(p => p.figure);
    for (const format of ['hwp', 'hwpx']) {
      const file = await examFile(ctx, page, `export-${format}`, `QA5-native.${format}`);
      await h.action(page, 'new'); await h.idle(page); await h.nativeOpen(page, file);
      await ctx.check(`actual ${format.toUpperCase()} export/menu reopen retains native source+rich context`, async () => assert.deepEqual((await h.pictures(page)).map(p => p.figure), beforeNative));
    } ctx.cover('hwp-hwpx-roundtrip');
  });
  for (const reject of [false, true]) await app(ctx, `rhwp-graph-${reject ? 'rejected' : 'pending'}-preview`, async page => {
    const h = require('./rhwp-exam.cjs'), label = await makeLabel(ctx, page); await richUnion(ctx, page, label);
    const parent = await sendAiFigure(ctx, page, 'cross-graph-task'), rasterBefore = await pictureBytes(ctx, page, `graph-${reject}-parent`);
    await h.action(page, 'close'); await page.locator('#ai-image-install-open').click();
    const revision = await editGraph(ctx, page, '새 그래프', { held: true });
    if (reject) await releaseGraph(ctx, page, true);
    await ctx.check('graph revision is native-new but still holds deliberate parent raster', () => { assert.equal(revision.data, parent.figure.context.ai.snapshot.tabs[0].generated[0].data); assert.equal(revision.graphResult.objects.find(o => o.type === 'coordplane').labelX, '새 그래프'); });
    const sent = await sendAiFigure(ctx, page, 'cross-graph-task');
    const rasterAfter = await pictureBytes(ctx, page, `graph-${reject}-sent`);
    await ctx.check('actual RHWP Send uses native revision, editable group and new visible pixels', () => {
      assert.equal(sent.figure.source.pages[0].objects.find(o => o.type === 'coordplane').labelX, '새 그래프');
      assert.notEqual(rasterAfter.pixelSha256, rasterBefore.pixelSha256); assert.equal(sent.figure.context.ai.snapshot.tabs[0].selectedCandidateId, revision.id);
    });
    // Pixel delta alone could be a wrong figure: independently render/export the
    // sent native source with the same render bounds and compare decoded pixels.
    const proof = await page.evaluate(async ({ figure, version }) => {
      const { rasterizeExportCanvas } = await import('/js/svg-export.js' + version);
      const { prepareLoadedProject } = await import('/js/project-io.js' + version);
      const prepared = prepareLoadedProject(figure.source);
      const { canvas } = await rasterizeExportCanvas({ ...__candidateQA.state.get(), ...prepared.active }, { dpi: 300, bounds: figure.render.bounds, options: figure.render.options });
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', pixels))].map(b => b.toString(16).padStart(2, '0')).join('');
      return { hasText: prepared.active.objects.some(o => o.type === 'coordplane' && o.labelX === '새 그래프'), pixelSha256: digest, width: canvas.width, height: canvas.height };
    }, { figure: sent.figure, version });
    await ctx.check('sent PNG decoded pixels equal independently rasterized current native source, never parent raster', () => { assert.equal(proof.hasText, true); assert.equal(proof.pixelSha256, rasterAfter.pixelSha256); });
    const file = await examFile(ctx, page, 'save', `QA5-native-preview-${reject}.5e`), parsed = await parseFile(page, file);
    await ctx.check('portable graph revision contains new axis text with native editable source', () => assert.ok(parsed.workspace.drawing.pages.some(p => p.objects.some(o => o.type === 'coordplane' && o.labelX === '새 그래프'))));
    await bootSecondary(ctx,page,`QA5-graph-${reject}-actual-file-reopen`,async reopened=>{
      await reopened.locator('#exam-workspace-open').click();await h.idle(reopened);
      await examCycle(reopened,()=>reopened.locator('#exam-project-file').setInputFiles(file));
      const loaded=(await h.pictures(reopened)).find(p=>p.figure.link.assetId===sent.figure.link.assetId);assert.ok(loaded);
      await ctx.check('actual graph .5e chooser reopen preserves sent new native axis and current PNG pixels independently of parent preview',async()=>{
        assert.deepEqual(loaded.figure,sent.figure);assert.equal(loaded.figure.source.pages[0].objects.find(o=>o.type==='coordplane').labelX,'새 그래프');
        const index=(await h.pictures(reopened)).findIndex(p=>p.figure.id===loaded.figure.id);assert.equal((await pictureBytes(ctx,reopened,`QA5-graph-${reject}-reopen-pixels`,index)).pixelSha256,rasterAfter.pixelSha256);
      });
    },{fresh:true});
    await ctx.shot(page, `graph-${reject}-new-label-visible`);
    if (!reject) await releaseGraph(ctx, page);
    ctx.cover(reject ? 'graph-rejected-preview-send' : 'graph-pending-preview-send');
  }, { ownerHooks: true });
  await app(ctx, 'source-graph-modal-send', async page => {
    const h = require('./rhwp-exam.cjs'), label = await makeLabel(ctx, page, { verification: 'full' }); await richUnion(ctx, page, label); await sendAiFigure(ctx, page, 'cross-label-task');
    await h.originalEdit(page); await closeAI(page);
    // A new source graph must start after the existing figure edit has ended.
    // While editing, the real Send action applies that existing figure.
    await page.locator('#exam-workspace-open').click();await h.idle(page);await h.action(page,'close');
    assert.equal(await page.locator('#exam-edit-bar').isVisible(),false);
    await page.evaluate(async version => {
      window.__cross.graphEvents = [];
      const record = event => { __cross.graphEvents.push(structuredClone(event.detail)); __cross.notify(); };
      window.addEventListener('5e:exam-send-graph', record); __cross.disposers.push(() => window.removeEventListener('5e:exam-send-graph', record));
      (await import('/js/graph/graph-modal.js' + version)).openGraphModal(null, 'func');
    }, version);
    await page.locator('#gm-add-series').click(); await page.locator('#gm-expr').fill('sin('); await page.locator('#gm-expr').press('Tab');
    const before = await objects(page), documentBefore = await h.pictures(page);
    await page.locator('#gm-send-exam').click();
    await ctx.check('invalid expression emits zero graph events and preserves source/document', async () => {
      assert.equal(await page.evaluate(() => __cross.graphEvents.length), 0); assert.deepEqual(await objects(page), before); assert.deepEqual(await h.pictures(page), documentBefore);
    });
    await page.locator('#gm-expr').fill('2*x'); await page.locator('#gm-expr').press('Tab');
    await arm(page, 'graph-native-event', () => __cross.graphEvents.length === 1);
    await page.locator('#gm-send-exam').click(); await arrived(page, 'graph-native-event');
    // Capture is opened by the actual registered main handler. No second click
    // on Send is allowed, which would conceal duplicate invocation.
    await page.locator('.capture-overlay').waitFor({ state: 'visible' });
    if (!await page.locator('#capture-confirm').isVisible()) {
      const b = await page.locator('#canvas').boundingBox(); await page.mouse.move(b.x + b.width * .3, b.y + b.height * .3); await page.mouse.down(); await page.mouse.move(b.x + b.width * .7, b.y + b.height * .7); await page.mouse.up();
    }
    await page.locator('#capture-confirm').click(); await h.place(page);
    await ctx.check('valid actual source graph modal invokes one native event and placement flow', async () => {
      assert.equal(await page.evaluate(() => __cross.graphEvents.length), 1); assert.ok((await h.pictures(page)).some(p => p.figure.source.pages[0].objects.some(o => o.type === 'funcgraph' && o.expr === '2*x'))); assert.equal(await page.locator('.capture-overlay').count(), 0);
    }); ctx.cover('graph-modal-send-once-invalid');
  });
};

function readOnlyBridge() {
  for (const prefix of ['', '5e.preview:']) localStorage.setItem(prefix + '5e.tutorial.bannerSeen', 'true');
  window.showSaveFilePicker = undefined; window.showDirectoryPicker = undefined;
  window.__cross ||= {};window.__cross.readOnlyCalls={send:0,login:0};
  window.fiveEDesktop = { web: true, status: async () => ({ login: { loggedIn: true }, server: true }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }),
    models: async () => ({ data: [{ model: 'gpt-6.1-sol', displayName: 'Sol fixture', isDefault: true, supportedReasoningEfforts: ['medium'], serviceTiers: ['priority'] }] }),
    account: async () => ({ rateLimits: {} }), login: async () => {__cross.readOnlyCalls.login++;throw new Error('Portable verification cannot authenticate');}, send: async () => {__cross.readOnlyCalls.send++;throw new Error('Portable file verification cannot generate'); }, interrupt: async () => ({ ok: true }),
    onEvent: () => () => {}, onState: () => () => {}, onLog: () => () => {}, setAiTaskShortcutActive() {}, onAiCloseTaskShortcut: () => () => {} };
}

scenarios.QA6 = async ctx => {
  await app(ctx, 'pending-send-failure-retry', async page => {
    const h = require('./rhwp-exam.cjs'), label = await makeLabel(ctx, page, { verification: 'full' }), rich = await richUnion(ctx, page, label);
    const initial = await sendAiFigure(ctx, page, 'cross-label-task');
    await h.originalEdit(page); await closeAI(page);
    const sourceLabel = (await objects(page)).find(o => o.type === 'labeler');
    await sourceText(ctx, page, sourceLabel.id, '보내기로 확정한 라벨');
    await page.evaluate(() => {
      const original = HTMLCanvasElement.prototype.toBlob;
      window.__cross.exportEntered = Promise.withResolvers(); window.__cross.exportCalls = 0;
      HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
        const canvas = this; __cross.exportCalls++; __cross.resumeExport = () => original.call(canvas, callback, ...args);
        HTMLCanvasElement.prototype.toBlob = original; __cross.exportEntered.resolve();
      };
      __cross.disposers.push(() => { HTMLCanvasElement.prototype.toBlob = original; });
      document.querySelector('#exam-send').click();
    });
    await page.evaluate(() => __cross.deadline(__cross.exportEntered.promise, 'source rasterization entered'));
    await ctx.check('Send/Exam disabled during the real held rasterization', async () => {
      for (const selector of ['#exam-send', '#exam-workspace-open']) assert.equal(await page.locator(selector).isDisabled(), true);
    });
    const pendingBefore = await h.pictures(page);
    await page.evaluate(() => document.querySelector('#exam-workspace-open').click());
    await ctx.check('pending Exam click cannot change picture/document or source ownership', async () => assert.deepEqual(await h.pictures(page), pendingBefore)); ctx.cover('pending-buttons-lock');
    await ctx.act('release explicitly held source PNG export', () => page.evaluate(() => __cross.resumeExport()), page); await h.idle(page);
    const applied = (await h.pictures(page))[0];
    await ctx.check('Send committed live native text without explicit blur and exported one replacement', async () => {
      assert.notEqual(applied.figure.id, initial.figure.id); assert.equal(applied.figure.source.pages[0].objects.find(o => o.id === sourceLabel.id).text, '보내기로 확정한 라벨');
      assert.equal(await page.evaluate(() => __cross.exportCalls), 1); assert.equal((await h.pictures(page)).length, 1);
      assert.equal(applied.figure.source.pages[0].objects.find(o => o.type === 'image').src, label.data);
    }); ctx.cover('pending-text-send');
    const moduleUrls = ctx.result.resources.filter(r => /text-editor\.js/.test(r.url)); void moduleUrls;
    await h.originalEdit(page); await closeAI(page); await sourceText(ctx, page, sourceLabel.id, '실패해도 보존하는 초안');
    const sourceBefore = await objects(page), pictureBefore = await h.pictures(page), rasterBefore = await pictureBytes(ctx, page, 'QA6-before-failure');
    await page.evaluate(() => {
      const original = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback) { HTMLCanvasElement.prototype.toBlob = original; callback(null); };
      __cross.disposers.push(() => { HTMLCanvasElement.prototype.toBlob = original; }); document.querySelector('#exam-send').click();
    });
    const dialog = page.getByRole('dialog', { name: '시험지 보내기' }); await dialog.waitFor({ state: 'visible' });
    await ctx.check('real export rejection is visible and keeps current document/source', async () => {
      assert.match(await dialog.textContent(), /그림을 내보내지 못했습니다/); assert.deepEqual(await h.pictures(page), pictureBefore);
      const after = await objects(page); assert.equal(after.find(o => o.id === sourceLabel.id).text, '실패해도 보존하는 초안');
      assert.equal(after.find(o => o.type === 'image').src, sourceBefore.find(o => o.type === 'image').src);
      assert.equal((await pictureBytes(ctx, page, 'QA6-after-failure')).encodedSha256, rasterBefore.encodedSha256);
    });
    await dialog.getByRole('button', { name: '확인', exact: true }).click(); await h.idle(page);
    const updatedAt = await page.evaluate(async version => (await (await import('/js/rhwp-exam-project.js' + version)).listExamDrafts())[0]?.updatedAt, version);
    await arm(page, 'passive-autosave', async previous => (await (await import('/js/rhwp-exam-project.js?v=1.7.0-four-session-integration')).listExamDrafts())[0]?.updatedAt > previous, updatedAt);
    await page.evaluate(() => window.dispatchEvent(new Event('5e:exam-workspace-changed'))); await arrived(page, 'passive-autosave');
    await ctx.check('passive autosave retains visible error/source draft and union', async () => { assert.equal(await page.locator('#exam-status').getAttribute('data-error'), 'true'); assert.equal(await page.locator('#exam-source-region').isVisible(), true); });
    await unionEqual(ctx, await tabs(page), rich, 'failed send/autosave: rich candidate union');
    await page.locator('#exam-send').click(); await h.idle(page);
    await ctx.check('explicit retry succeeds once, sends committed draft and clears error', async () => {
      assert.equal(await page.locator('#exam-status').getAttribute('data-error'), 'false'); assert.equal((await h.pictures(page)).length, 1);
      assert.equal((await h.pictures(page))[0].figure.source.pages[0].objects.find(o => o.id === sourceLabel.id).text, '실패해도 보존하는 초안');
    }); ctx.cover('export-failure-autosave-retry');
    await h.originalEdit(page); await closeAI(page); await sourceText(ctx, page, sourceLabel.id, '돌아갈 때 보존할 초안');
    await page.evaluate(() => document.querySelector('#exam-workspace-open').click()); await h.idle(page);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('resize')); document.dispatchEvent(new Event('scroll'));
      return __cross.deadline(new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))), 'transition frames');
    });
    await ctx.check('transition cleanup remains hidden after actual resize/scroll; source draft survives', async () => {
      for (const selector of ['#exam-source-region', '#exam-edit-bar', '#exam-region-inspector']) assert.equal(await page.locator(selector).isVisible(), false);
      assert.equal(await page.locator('body').evaluate(n => n.classList.contains('exam-editing')), false);
      assert.equal((await linkedObjects(page, applied.figure.link)).find(o => o.id === sourceLabel.id).text, '돌아갈 때 보존할 초안');
    }); ctx.cover('transition-cleanup');
  });
  await lifecycle(ctx, 'success', { exam: true }); await lifecycle(ctx, 'reject', { exam: true }); ctx.cover('same-id-restored-owner');
  // Separate positive provider case: hold an actual mock bridge turn, switch
  // task/page, then release events. A render-only owner test cannot pass it.
  await app(ctx, 'background-provider', async page => {
    const label = await makeLabel(ctx, page), rich = await richUnion(ctx, page, label); await selectTask(ctx, page, 'task-1');
    await require('./label-source-browser.cjs').choose(page, 'general', 'restore-editable');
    const next = await page.evaluate(() => __task2.sends.length);
    await arm(page, 'provider-held', index => __task2.sends.length > index, next); await page.locator(panel + ' [data-ai-send]').click(); await arrived(page, 'provider-held');
    const before = (await tabs(page)).find(t => t.id === 'task-1').generated.length;
    await selectTask(ctx, page, 'cross-label-task');
    await finishOwned(ctx, page, { task: 'task-1', startIndex: next, before }); await checkpoint(ctx, page);
    const now = await tabs(page);
    await ctx.check('delayed provider result belongs to original surviving task with different active task', () => {
      assert.equal(now.find(t => t.id === 'task-1').generated.length, before + 1); assert.equal(now.find(t => t.id === 'cross-label-task').selectedCandidateId, 'cross-label');
    }); await unionEqual(ctx, now, rich, 'background provider: unrelated union'); ctx.cover('background-provider-owner');
  });
};

async function fullState(page) {
  return page.evaluate(async version => {
    const s = __candidateQA.state.get(), drawing = (await import('/js/project-io.js' + version)).serialize(s);
    return { drawing, objects: structuredClone(s.objects), selectedIds: [...s.selectedIds], targetedId: s.targetedId, activePageId: s.activePageId,
      undo: structuredClone(s.undoStack), redo: structuredClone(s.redoStack), draftText: structuredClone(s.draftText || null), workspace: await __task2Manager.sharingSnapshot() };
  }, version);
}
// project-io has long normalized the optional image recognition flag to false
// on open. Keep every other native property, including the exact RAW bytes.
function openedImageDefaults(objects) {
  return objects.map(object => object.type === 'image'
    ? { ...object, recognized: object.recognized === true } : object);
}
async function chooseDrawing(page, file) {
  await page.locator('#file-menu-btn').click(); const waiting = page.waitForEvent('filechooser'); await page.locator('#project-open').click(); await (await waiting).setFiles(file);
}
async function rejectedFile(ctx, page, file, baseline, { drop = false, message } = {}) {
  const name = typeof file === 'string' ? path.basename(file) : file.name;
  const previousAlerts = ctx.alerts.length;
  await arm(page, 'rejected-file-reader', name => __cross.readerFiles.includes(name), name);
  if (drop) await page.evaluate(({ name, bytes }) => {
    const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(bytes)], name, { type: 'application/octet-stream' }));
    document.querySelector('#canvas').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, { name, bytes: [...(typeof file === 'string' ? fs.readFileSync(file) : file.buffer)] });
  else await chooseDrawing(page, file);
  await arrived(page, 'rejected-file-reader');
  await ctx.check(`${name}/${drop ? 'drop' : 'input'}: rejection preserves full document/history/union`, async () => {
    assert.deepEqual(await fullState(page), baseline); assert.ok(ctx.alerts.length > previousAlerts, 'This malformed file must visibly alert');
    if (message) assert.match(ctx.alerts.at(-1), message);
  });
}

function retryPack(ctx) {
  // Adapt only the retained pure fixture constructor, not its run/pass loop.
  // It makes an original small PDF and a checksummed transport catalog.
  const source = ctx.input('tests/helpers/pdf-runtime-retry-fixture.cjs', 'retained one-page original PDF fixture constructor; actual root library UI re-exercised here').toString();
  const cut = source.indexOf('async function runPdfRuntimeRetryCases('); assert.ok(cut > 0);
  return new Function('require', source.slice(0, cut) + '\nreturn fixturePack();')(require);
}
async function pdfRetry(ctx, page, controls) {
  await closeAI(page); const snapshot = await fullState(page);
  await arm(page, 'pdf-library-ready', () => document.querySelector('.unified-library-overlay')?.dataset.searchReadiness === 'ready', null, 60000);
  await page.locator('#exam-library-open').click(); await arrived(page, 'pdf-library-ready');
  const library = page.locator('.unified-library-overlay').last();
  await library.locator('[data-unilib-query]').fill('MODULE RETRY'); await library.locator('[data-unilib-query]').press('Enter');
  await library.locator('[data-unilib-type="question"]').click(); await library.locator('[data-result-kind="crop"]').first().click();
  const stage = library.locator('[data-unilib-stage]'), retry = stage.getByRole('button', { name: '다시 시도', exact: true });
  await retry.waitFor({ state: 'visible' });
  const before = controls.requests.length;
  await ctx.check('exact PDF runtime import failure exposes real Retry', () => assert.ok(before >= 2, 'Automatic retries precede the visible manual retry'));
  controls.offline = false;
  await ctx.act('real PDF runtime Retry', () => retry.click(), page);
  const preview = stage.locator('.unilib-preview-image img'); await preview.waitFor(); await preview.evaluate(img => img.decode());
  await ctx.check('Retry fetches distinct runtime URL and renders actual current PDF', async () => {
    assert.ok(controls.requests.length > before); assert.equal(new Set(controls.requests).size, controls.requests.length); assert.ok(await preview.evaluate(img => img.naturalWidth > 100));
    assert.equal(await library.locator('[data-unilib-query]').inputValue(), 'MODULE RETRY');
  });
  await library.locator('[data-unilib-adjust]').click(); const image = library.locator('[data-unilib-crop-image]'); await image.waitFor(); await image.evaluate(img => img.decode());
  await arm(page, 'pdf-original', () => document.querySelector('[data-unilib-crop-image]')?.naturalWidth >= 600 && document.querySelector('[data-unilib-crop-quality]')?.hidden, null, 60000); await arrived(page, 'pdf-original');
  const width = await image.evaluate(img => img.naturalWidth), b = await library.locator('[data-unilib-crop-canvas]').boundingBox(), s = await library.locator('[data-unilib-crop-stage]').boundingBox();
  const left = Math.max(b.x, s.x), top = Math.max(b.y, s.y), w = Math.min(b.x + b.width, s.x + s.width) - left, h = Math.min(b.y + b.height, s.y + s.height) - top;
  assert.ok(w > 80 && h > 80); await page.mouse.move(left + w * .2, top + h * .2); await page.mouse.down(); await page.mouse.move(left + w * .6, top + h * .6, { steps: 6 }); await page.mouse.up();
  await library.locator('[data-unilib-crop-save]:not([disabled])').click(); await library.locator('.unilib-crop-collection-thumb').first().waitFor();
  const crop = await library.locator('.unilib-crop-collection-thumb').first().getAttribute('src');
  await ctx.check('saved crop comes from original-resolution PDF bytes', () => { const decoded = decodePng(pngBytes(crop)); assert.ok(decoded.width > 100 && decoded.height > 100); assert.ok(width >= 600); });
  const file = path.join(ctx.directory, 'QA7-retried-original-crop.png'); fs.writeFileSync(file, pngBytes(crop)); ctx.file(file, 'actual-original-PDF-crop');
  await ctx.check('failed/retried PDF runtime preserves cross-feature drawing and rich draft', async () => assert.deepEqual(await fullState(page), snapshot));
  ctx.write('QA7-pdf-runtime-requests.json', { requests: controls.requests, originalWidth: width, fixture: 'retained original one-page module-retry fixture', origin: new URL(ctx.report.url).origin });
}

scenarios.QA7 = async ctx => {
  await app(ctx, 'rich-files-boundaries', async page => {
    const label = await makeLabel(ctx, page), rich = await richUnion(ctx, page, label); await selectTask(ctx, page, 'cross-label-task'); await insertSelected(ctx, page);
    const file = await drawingFile(ctx, page, 'QA7-valid-rich-project'), baseline = await fullState(page);
    ctx.alerts = [];
    // Native alert blocks page evaluation: record in the host and dismiss first.
    page.on('dialog', async dialog => { ctx.alerts.push(dialog.message()); ctx.result.actions.push({ name: 'actual file alert', message: dialog.message(), at: new Date().toISOString() }); await dialog.dismiss(); });
    const canceled = page.waitForEvent('filechooser'); await page.locator('#file-menu-btn').click(); await page.locator('#project-open').click(); await (await canceled).setFiles([]);
    await ctx.check('canceled actual chooser preserves selected objects/history/draft', async () => assert.deepEqual(await fullState(page), baseline));
    await page.evaluate(() => {
      const limit = 134217728, descriptor = Object.getOwnPropertyDescriptor(File.prototype, 'size') || Object.getOwnPropertyDescriptor(Blob.prototype, 'size');
      const sizes = { 'qa7-below.5e': limit - 1, 'qa7-at.5e': limit, 'qa7-over.5e': limit + 1, 'qa7-over.json': limit + 1 };
      Object.defineProperty(File.prototype, 'size', { configurable: true, get() { return sizes[this.name] ?? descriptor.get.call(this); } });
      const Reader = window.FileReader, buffer = Blob.prototype.arrayBuffer, text = Blob.prototype.text;
      window.__cross.readSpy = { reads: [], buffers: [], texts: [] };
      window.FileReader = class extends Reader { readAsArrayBuffer(file, ...args) { __cross.readSpy.reads.push(file.name); return super.readAsArrayBuffer(file, ...args); } };
      Blob.prototype.arrayBuffer = function (...args) { if (this instanceof File) __cross.readSpy.buffers.push(this.name); return buffer.apply(this, args); };
      Blob.prototype.text = function (...args) { if (this instanceof File) __cross.readSpy.texts.push(this.name); return text.apply(this, args); };
      __cross.disposers.push(() => { delete File.prototype.size; window.FileReader = Reader; Blob.prototype.arrayBuffer = buffer; Blob.prototype.text = text; });
    });
    for (const route of ['input', 'drop']) for (const name of ['qa7-over.5e', 'qa7-over.json']) {
      const payload = Buffer.from('{invalid-boundary-json');
      if (route === 'input') await chooseDrawing(page, { name, mimeType: 'application/json', buffer: payload });
      else await page.evaluate(({ name, bytes }) => {
        const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(bytes)], name, { type: 'application/json' }));
        document.querySelector('#canvas').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      }, { name, bytes: [...payload] });
      const alert = page.locator('.modal-overlay:not([hidden])').last(); await alert.getByRole('button', { name: '확인', exact: true }).waitFor();
      await ctx.check(`${name}/${route}: above 128MiB rejected before all read APIs`, async () => {
        assert.match(await alert.textContent(), /134,217,729바이트/); assert.deepEqual(await page.evaluate(() => __cross.readSpy), { reads: [], buffers: [], texts: [] }); assert.deepEqual(await fullState(page), baseline);
      }); await alert.getByRole('button', { name: '확인', exact: true }).click();
    }
    for (const route of ['input', 'drop']) for (const name of ['qa7-below.5e', 'qa7-at.5e']) {
      await page.evaluate(() => { __cross.readerFiles = []; });
      const previous = await page.evaluate(() => __cross.readSpy.reads.length);
      await rejectedFile(ctx, page, { name, mimeType: 'application/json', buffer: Buffer.from('{invalid-format') }, baseline, { drop: route === 'drop', message: /열 수 없습니다/ });
      await ctx.check(`${name}/${route}: size accepted, actual malformed parsing rejected`, async () => assert.equal(await page.evaluate(() => __cross.readSpy.reads.length), previous + 1));
    } ctx.cover('boundary-input-drop'); ctx.cover('malformed-file-preservation');
    await page.evaluate(() => __candidateQA.state.update(s => { s.objects = []; s.selectedIds = []; })); await openDrawing(ctx, page, file);
    await ctx.check('valid actual .5e reopen recovers full native scene', async () => assert.deepEqual(await objects(page), openedImageDefaults(baseline.objects)));
    await unionEqual(ctx, await tabs(page), rich, 'QA7 actual valid reopen'); ctx.cover('valid-rich-file-roundtrip');
    const preserved = await fullState(page), bytes = fs.readFileSync(file);
    for (const mutation of ['binding', 'native-field', 'native-ticks-null', 'native-curve-plane', 'missing-asset', 'crc']) {
      const mutated = await page.evaluate(async ({ bytes, mutation, version }) => {
        const { unzipStore, zipStore } = await import('/js/backup-zip.js' + version);
        const files = unzipStore(new Uint8Array(bytes)), raw = JSON.parse(new TextDecoder().decode(files.get('project.json')));
        const label = raw.workspace.ai.workspaces.flatMap(w => w.tabs).find(t => t.id === 'cross-label-task').generated[0];
        const graph = raw.workspace.ai.workspaces.flatMap(w => w.tabs).find(t => t.id === 'cross-graph-task').generated[0];
        if (mutation === 'binding') label.targetPlacement.candidateSha256 = 'f'.repeat(64);
        if (mutation === 'native-field') graph.graphResult = [];
        if (mutation === 'native-ticks-null') graph.graphResult.objects.find(o=>o.type==='coordplane').explicitTicksX=[null];
        if (mutation === 'native-curve-plane') graph.graphResult.objects.find(o=>o.type==='funcgraph').planeId='missing-native-plane';
        if (mutation === 'missing-asset') files.delete('assets/0');
        files.set('project.json', new TextEncoder().encode(JSON.stringify(raw)));
        const blob = zipStore([...files].map(([name, data]) => ({ name, data }))), output = new Uint8Array(await blob.arrayBuffer());
        if (mutation === 'crc') {
          // Change one payload byte without updating either CRC. Leave header,
          // filename and directory intact so this specifically reaches CRC.
          const nameLength = output[26] | output[27] << 8, extraLength = output[28] | output[29] << 8; output[30 + nameLength + extraLength] ^= 1;
        }
        return [...output];
      }, { bytes: [...bytes], mutation, version });
      const target = path.join(ctx.directory, `QA7-corrupt-${mutation}.5e`); fs.writeFileSync(target, Buffer.from(mutated)); ctx.file(target, 'one-corruption-negative-project');
      await page.evaluate(() => { __cross.readerFiles = []; }); await rejectedFile(ctx, page, target, preserved);
    } ctx.cover('candidate-binding-rejection'); ctx.cover('zip-crc-missing-asset');
  });
  const pack = retryPack(ctx), controls = { offline: true, requests: [] };
  await app(ctx, 'pdf-runtime-with-rich-workspace', async page => {
    const label = await makeLabel(ctx, page); await richUnion(ctx, page, label); await selectTask(ctx, page, 'cross-label-task'); await insertSelected(ctx, page);
    await pdfRetry(ctx, page, controls); ctx.cover('pdf-runtime-retry-original');
  }, { setupRoutes: async page => {
    await page.context().route('**/assets/pdf-library/catalog-bootstrap.json', route => route.fulfill({ status: 404, body: 'controlled catalog fallback' }));
    await page.context().route('https://5e-google-drive-gateway.5e-desktop.workers.dev/**', route => {
      const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
      const body = pathname.endsWith('/pack.json') ? json(pack.pack) : pathname.endsWith('/checksums.json') ? json(pack.checksums)
        : pathname.endsWith('/catalog.json') ? json(pack.catalog) : pathname.endsWith('/search-index.json') ? json(pack.search) : pack.pdf;
      return route.fulfill({ contentType: pathname.endsWith('.pdf') ? 'application/pdf' : 'application/json', body });
    });
    await page.context().route('**/js/pdf-library/pdf-runtime.js?*', route => { controls.requests.push(route.request().url()); return controls.offline ? route.abort('failed') : route.continue(); });
  } });
};

async function onScreen(ctx, page, selector, name) {
  await ctx.check(name, async () => {
    const locator = page.locator(selector); assert.equal(await locator.isVisible(), true, 'Essential control is hidden');
    const result = await locator.evaluate(n => {
      const r = n.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const describe = node => {
        if (!node) return null;
        const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
        return { tag: node.tagName, id: node.id, className: String(node.className), role: node.getAttribute('role'),
          ariaModal: node.getAttribute('aria-modal'), text: (node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160),
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          display: style.display, visibility: style.visibility, pointerEvents: style.pointerEvents, zIndex: style.zIndex,
          position: style.position, top: style.top, transform: style.transform, height: style.height,
          minHeight: style.minHeight, maxHeight: style.maxHeight, overflow: style.overflow,
          alignItems: style.alignItems, justifyContent: style.justifyContent };
      };
      return { selector: n.id || n.getAttribute('data-ai-graph-edit') || n.getAttribute('data-ai-close'),
        x: r.x, y: r.y, width: r.width, height: r.height, viewport: { width: innerWidth, height: innerHeight },
        visible: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, topmost: hit === n || n.contains(hit),
        hit: describe(hit), control: describe(n), nearestHitDialog: describe(hit?.closest('[role="dialog"],dialog,.modal-overlay,#ai-image-panel,.capture-overlay')),
        controlAncestors: (() => { const nodes = []; for (let parent = n.parentElement; parent && nodes.length < 5; parent = parent.parentElement) nodes.push(describe(parent)); return nodes; })(),
        activeDialogs: [...document.querySelectorAll('[role="dialog"],dialog,.modal-overlay,#ai-image-panel,.capture-overlay,.modal-ai.ai-workbench')]
          .filter(node => { const style = getComputedStyle(node), rect = node.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0; }).map(describe),
        bodyClass: document.body.className,
        sourceToolbarBottom: getComputedStyle(document.body).getPropertyValue('--exam-source-toolbar-bottom'),
        panelComputedTop: document.querySelector('#ai-image-panel') ? getComputedStyle(document.querySelector('#ai-image-panel')).top : null };
    });
    const evidenceName = `control-hit-${ctx.result.assertions.at(-1).id}`;
    ctx.file(ctx.write(evidenceName + '.json', { name, selector, ...result }), 'actual-control-hit-test-and-dialogs');
    if (!(result.width > 0 && result.height > 0 && result.visible && result.topmost)) await ctx.shot(page, evidenceName + '-failed');
    assert.ok(result.width > 0 && result.height > 0 && result.visible && result.topmost, JSON.stringify(result));
  });
}
async function captureClipboard(ctx, page) {
  await closeAI(page);
  await page.evaluate(async version => {
    (await import('/js/platform.js' + version)).setShortcutPlatform('mac');
    const original = Object.getOwnPropertyDescriptor(navigator.clipboard, 'write');
    window.__cross.clipboard = { calls: 0, types: [], png: null, deny: false };
    Object.defineProperty(navigator.clipboard, 'write', { configurable: true, value: async items => {
      const state = __cross.clipboard; state.calls++; state.types.push(items[0].types);
      if (state.deny) throw new DOMException('Controlled clipboard denial', 'NotAllowedError');
      const blob = await items[0].getType('image/png'); state.png = [...new Uint8Array(await blob.arrayBuffer())]; __cross.notify();
    } });
    __cross.disposers.push(() => { if (original) Object.defineProperty(navigator.clipboard, 'write', original); else delete navigator.clipboard.write; });
  }, version);
  const baseline = await objects(page), label = baseline.find(o => o.aiAutoLabel);
  await selectLabel(ctx, page, label.id); let position = await labelPoint(page, label.id); await page.mouse.click(position.x, position.y);
  const input = page.locator('.ai-inline-label-editor'); await input.waitFor({ state: 'visible' }); await input.press('Alt+c');
  await ctx.check('Mac Option+C is blocked inside actual native inline text input', async () => assert.equal(await page.locator('.quick-capture-overlay').count(), 0)); await input.press('Escape');
  await page.locator('#ai-image-install-open').click(); await page.locator(panel + ' [data-ai-input]').focus(); await page.keyboard.press('Alt+c');
  await ctx.check('Option+C is blocked in actual textarea/modal and makes zero clipboard calls', async () => { assert.equal(await page.locator('.quick-capture-overlay').count(), 0); assert.equal(await page.evaluate(() => __cross.clipboard.calls), 0); }); await closeAI(page);
  await page.locator('#canvas').focus(); await page.keyboard.press('Alt+c'); await page.locator('.quick-capture-overlay').waitFor({ state: 'visible' });
  const b = await page.locator('#canvas').boundingBox();
  const gesture = async () => { await page.mouse.move(b.x + b.width * .3, b.y + b.height * .3); await page.mouse.down(); await page.mouse.move(b.x + b.width * .7, b.y + b.height * .7, { steps: 4 }); await page.mouse.up(); };
  await arm(page, 'capture-png', () => Array.isArray(__cross.clipboard.png)); await gesture(); await arrived(page, 'capture-png');
  const png = Buffer.from(await page.evaluate(() => __cross.clipboard.png)), file = path.join(ctx.directory, 'QA8-actual-capture.png'); fs.writeFileSync(file, png); ctx.file(file, 'clipboard-transport-PNG');
  await ctx.check('actual capture produces one PNG and preserves native label/graph scene', async () => { assert.ok(decodePng(png).width > 0); assert.equal(await page.evaluate(() => __cross.clipboard.calls), 1); assert.deepEqual(await objects(page), baseline); });
  await page.evaluate(() => { __cross.clipboard.deny = true; }); await page.locator('#canvas').focus(); await page.keyboard.press('Alt+c'); await page.locator('.quick-capture-overlay').waitFor({ state: 'visible' });
  await arm(page, 'clipboard-denied', () => document.querySelector('.quick-capture-status.is-error')?.hidden === false); await gesture(); await arrived(page, 'clipboard-denied');
  await ctx.check('clipboard denial is visible with native draft unchanged', async () => { assert.equal(await page.evaluate(() => __cross.clipboard.calls), 2); assert.deepEqual(await objects(page), baseline); assert.ok((await page.locator('.quick-capture-status').textContent()).length); });
}

scenarios.QA8 = async ctx => {
  await app(ctx, 'layout-source-edit-shortcuts', async page => {
    const h = require('./rhwp-exam.cjs'), label = await makeLabel(ctx, page, { verification: 'full' }); await richUnion(ctx, page, label); await sendAiFigure(ctx, page, 'cross-label-task');
    await h.originalEdit(page); await page.locator(panel).waitFor({ state: 'visible' });
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 980, height: 720 }, { width: 720, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      for (const theme of ['light', 'dark']) for (const motion of ['reduce', 'no-preference']) {
        await page.emulateMedia({ reducedMotion: motion }); await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
        for (const selector of ['#exam-send', '#exam-workspace-open', '#ai-image-panel [data-ai-close]']) await onScreen(ctx, page, selector, `${viewport.width}/${theme}/${motion}: ${selector} accessible above source AI`);
        await ctx.shot(page, `layout-${viewport.width}-${theme}-${motion}`);
      }
    } ctx.cover('layout-four-sizes-themes-motion');
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.emulateMedia({ reducedMotion: 'reduce' });
    await selectTask(ctx, page, 'cross-graph-task'); const trigger = page.locator(panel + ' [data-ai-graph-edit]'); await trigger.click();
    await page.locator('#graph-modal-overlay').waitFor({ state: 'visible' });
    for (const selector of ['#gm-confirm', '#gm-cancel']) await onScreen(ctx, page, selector, 'graph child topmost ' + selector);
    await page.keyboard.press('Tab');
    await ctx.check('actual graph keyboard focus remains inside child dialog', async () => assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest('#graph-modal-overlay'))), true));
    await page.keyboard.press('Escape'); await page.locator('#graph-modal-overlay').waitFor({ state: 'hidden' });
    await ctx.check('Escape restores graph action focus with source AI preserved', async () => { assert.equal(await page.locator(panel).isVisible(), true); assert.equal(await trigger.evaluate(n => document.activeElement === n), true); }); ctx.cover('graph-topmost-focus');
    await closeAI(page); await page.evaluate(() => document.querySelector('#exam-workspace-open').click()); await h.idle(page);
    await h.originalEdit(page, 0); await closeAI(page);
    await captureClipboard(ctx, page); ctx.cover('capture-protected-failure');
  });
  await app(ctx, 'compatibility-storage-second-tab', async page => {
    const label = await makeLabel(ctx, page, { verification: 'full' }), rich = await richUnion(ctx, page, label); await sendAiFigure(ctx, page, 'cross-label-task');
    const h = require('./rhwp-exam.cjs'); await h.action(page, 'close'); await checkpoint(ctx, page);
    await ctx.act('root → same-origin canonical preview compatibility checkpoint', () => page.goto(new URL('/preview/', ctx.report.url).href, { waitUntil: 'domcontentloaded' }), page);
    await page.locator('#ai-image-install-open').click(); await unionEqual(ctx, await tabs(page), rich, 'QA8 same-origin preview actual restoration'); await checkpoint(ctx, page);
    await page.goto(ctx.report.url, { waitUntil: 'domcontentloaded' }); await page.locator('#ai-image-install-open').click();
    await unionEqual(ctx, await tabs(page), rich, 'QA8 actual root after preview checkpoint'); ctx.cover('root-preview-root-union');
    const identities = await page.evaluate(async () => ({ origin: location.origin, databases: await indexedDB.databases(), keys: Object.keys(localStorage), registry: Object.fromEntries(['5e.aiParallelWorkspaces.v1', '5e.aiTaskTransfers.v1', '5e.aiActiveTask.v1', '5e.aiPrimaryWorkspace.v1'].map(k => [k, localStorage.getItem(k)])) }));
    await ctx.check('exact origin owns existing storage namespaces including unprefixed RHWP/registry', () => {
      const names = identities.databases.map(d => d.name); assert.ok(names.includes('5e.preview:5e-ai-image-tasks')); assert.ok(names.includes('5e-rhwp-exam')); assert.ok(!names.includes('5e.preview:5e-rhwp-exam'));
      for (const key of Object.keys(identities.registry)) assert.ok(!identities.keys.includes('5e.preview:' + key));
      assert.ok(identities.registry['5e.aiParallelWorkspaces.v1']); assert.equal(identities.origin, new URL(ctx.report.url).origin);
    }); ctx.write('QA8-storage-identities.json', identities); ctx.cover('storage-identities');
    await bootSecondary(ctx,page,'QA8-normal-second-tab',async second=>{
      await second.locator('#ai-image-install-open').click();
      await unionEqual(ctx,await tabs(second),rich,'second actual task-owned tab recovery');
      await ctx.check('second tab recovery retains rich owners and needs-attention review',async()=>{
        const restored=(await tabs(second)).filter(t=>t.id.startsWith('cross-'));
        // tabs() collects owners across workspaces; its Map traversal is not
        // the task navigation order. Compare each recovered owner by identity.
        assert.deepEqual(restored.map(t=>t.id).sort(),rich.map(t=>t.id).sort());
        for (const expected of rich) assert.deepEqual(restored.find(t=>t.id===expected.id).generated.map(c=>c.reviewState),expected.generated.map(c=>c.reviewState));
        assert.equal(restored.find(t=>t.id==='cross-label-task').generated[0].reviewState,'passed');
        assert.equal(restored.find(t=>t.id==='cross-graph-task').generated[0].reviewState,'needs-attention');
      });
    });
    ctx.cover('second-tab-recovery');
  });
};

async function rawInstrumentation(ctx, page) {
  const source = ctx.input('js/ai-label-background.js', 'canonical RAW resolver, observation-only call/waiter signals').toString();
  const entry = 'export async function resolveImageLabelBackground({ contract, candidates = [], cache, signal, generate }) {';
  const waiter = 'if (pending.has(contract.key)) {';
  assert.ok(source.includes(entry) && source.includes(waiter));
  await page.route('**/js/ai-label-background.js?*', route => route.fulfill({ contentType: 'text/javascript', body: source
    .replace(entry, entry + '\nwindow.__cross.rawCalls ||= []; window.__cross.rawCalls.push({key:contract.key,signal,task:document.querySelector("#ai-image-panel").__crossController.activeTask()}); window.__cross.notify();')
    .replace(waiter, waiter + '\nwindow.__cross.rawWaiters ||= []; window.__cross.rawWaiters.push({key:contract.key,signal,task:document.querySelector("#ai-image-panel").__crossController.activeTask()}); window.__cross.notify();') }));
}
async function respondTransport(page, index) {
  const w = require('./label-source-browser.cjs'), request = (await w.sends(page))[index]; assert.ok(request);
  if (request.purpose === 'image') await w.emit(page, index, 'image');
  else if (request.text.includes('고정 후보: ')) await w.emit(page, index, 'assistant', w.jointResponse(request.text));
  else if (request.text.includes('최종 RAW 후보다')) await w.emit(page, index, 'assistant', w.placement(w.verifiedPlan));
  else if (request.text.includes('입력 원본 라벨 관찰')) await w.emit(page, index, 'assistant', JSON.stringify(w.verifiedPlan));
  else if (request.text.includes('FINAL_NATIVE_OVERLAY') || request.text.includes('검수')) await w.emit(page, index, 'assistant', w.report());
  else assert.fail('Unrecognized actual transport: ' + request.text.slice(0, 200));
}
async function prepareSend(ctx, page, task, request, labels = 'remove') {
  await selectTask(ctx, page, task); await require('./label-source-browser.cjs').choose(page, 'general', labels);
  if (labels === 'restore-editable') await page.locator(panel + ' [data-ai-setting-key=verification] [data-ai-setting-value=draft-first]').click();
  await page.locator(panel + ' [data-ai-input]').fill(request);
  const next = await page.evaluate(() => __task2.sends.length);
  await arm(page, 'send-first-turn', n => __task2.sends.length > n, next);
  await ctx.act(`real Send ${task}`, () => page.locator(panel + ' [data-ai-send]').click(), page); await arrived(page, 'send-first-turn'); return next;
}
async function advanceUntil(page, next, predicate, argument) {
  for (let phase = 0; phase < 30; phase++) {
    await arm(page, 'transport-or-boundary', async ({ next, source, argument }) => __task2.sends.length > next || await (0, eval)(`(${source})`)(argument), { next, source: predicate.toString(), argument });
    await arrived(page, 'transport-or-boundary');
    if (await page.evaluate(({ source, argument }) => (0, eval)(`(${source})`)(argument), { source: predicate.toString(), argument })) return next;
    await respondTransport(page, next++);
  }
  assert.fail('Actual transport did not reach required boundary');
}
async function rawConcurrent(ctx) {
  await app(ctx, 'raw-concurrent-cancel-owner', async page => {
    const label = await makeLabel(ctx, page), rich = await richUnion(ctx, page, label);
    const ids = ['raw-owner', 'raw-canceled-follower', 'raw-surviving-follower'];
    for (const id of ids) await ctx.act('prepare independent actual controller ' + id, () => page.evaluate(async id => {
      await __task2Manager.openIndependentReferences({ references: [{ dataUrl: __task2.original, name: id }], startGeneration: false });
      const controller = document.querySelector('#ai-image-panel').__crossController, snapshot = await controller.sharingSnapshot();
      if (snapshot.tabs.length !== 1) throw new Error('Independent RAW controller is not isolated');
      snapshot.tabs[0].id = id; snapshot.activeTaskTabId = id; await controller.importSharingSnapshot(snapshot, null); await controller.checkpointForClose();
    }, id), page);
    const request = '同時 RAW fixture: preserve all connections';
    const start = await prepareSend(ctx, page, ids[0], request);
    const imageIndex = await advanceUntil(page, start, start => __task2.sends.slice(start).some(s => s.payload.purpose === 'image'), start);
    // The last condition may be evaluated before imageIndex is emitted. Identify
    // the exact held request from the queue, without responding to it.
    const held = await page.evaluate(start => __task2.sends.findIndex((s, i) => i >= start && s.payload.purpose === 'image'), start); assert.ok(held >= start);
    const firstWaiters = await page.evaluate(() => __cross.rawWaiters?.length || 0);
    let next = await prepareSend(ctx, page, ids[1], request);
    next = await advanceUntil(page, next, n => (__cross.rawWaiters?.length || 0) === n + 1, firstWaiters);
    await transition(page, 'cancel-real-follower', () => document.querySelector('#ai-image-panel').dataset.aiBusy === 'false', null, () => page.locator(panel + ' [data-ai-interrupt]').click());
    await ctx.check('follower cancellation leaves actual owner signal live and exactly one held image request', async () => {
      const proof = await page.evaluate(({ start, canceled }) => ({ imageCalls: __task2.sends.slice(start).filter(s => s.payload.purpose === 'image').length,
        calls: __cross.rawCalls.filter(r => r.task.startsWith('raw-')).map(r => ({ key: r.key, task: r.task, aborted: r.signal?.aborted })), canceled }), { start, canceled: ids[1] });
      assert.equal(proof.imageCalls, 1); assert.equal(proof.calls.find(r => r.task === ids[0]).aborted, false); assert.equal(proof.calls.find(r => r.task === ids[1]).aborted, true);
    });
    next = await prepareSend(ctx, page, ids[2], request);
    await advanceUntil(page, next, n => (__cross.rawWaiters?.length || 0) === n + 2, firstWaiters);
    await respondTransport(page, held);
    next = await finishOwned(ctx, page, { task: ids[0], startIndex: held + 1, before: 0 });
    await finishOwned(ctx, page, { task: ids[2], startIndex: next, before: 0 }); await checkpoint(ctx, page);
    const after = await tabs(page), owner = after.find(t => t.id === ids[0]), survivor = after.find(t => t.id === ids[2]), canceled = after.find(t => t.id === ids[1]);
    await ctx.check('same realm completed exactly one generation; surviving waiter has full identical RAW, canceled waiter no candidate', async () => {
      assert.equal(owner.generated.length, 1); assert.equal(survivor.generated.length, 1); assert.equal(canceled.generated.length, 0);
      assert.equal(survivor.generated[0].workflowMetrics.backgroundReused, 'concurrent');
      assert.equal(await page.evaluate(start => __task2.sends.slice(start).filter(s => s.payload.purpose === 'image').length, start), 1);
    }); await rawEqual(ctx, owner.generated[0], survivor.generated[0], 'real concurrent owner/waiter'); await unionEqual(ctx, after, rich, 'RAW concurrency unrelated union');
    ctx.write('raw-concurrency.json', await page.evaluate(() => ({ calls: __cross.rawCalls.map(r => ({ key: r.key, task: r.task, aborted: r.signal?.aborted })), waiters: __cross.rawWaiters.map(r => ({ key: r.key, task: r.task, aborted: r.signal?.aborted })) })));
    ctx.cover('concurrent-owner-cancel'); void imageIndex;
  }, { setupRoutes: page => rawInstrumentation(ctx, page) });
}
async function rawStorageFaults(ctx) {
  for (const fault of ['corrupt-cache', 'corrupt-candidate', 'legacy', 'quota', 'abort']) await app(ctx, `raw-${fault}`, async page => {
    const first = await makeLabel(ctx, page), rich = await richUnion(ctx, page, first), before = await page.evaluate(() => __task2.sends.filter(s => s.payload.purpose === 'image').length);
    await page.evaluate(async ({ first, fault, version }) => {
      const { IndexedDBOutputCacheBackend } = await import('/js/ai-output-cache-store.js' + version), backend = new IndexedDBOutputCacheBackend({ databaseName: '5e-ai-label-background' });
      const key = first.workflowMetrics.generationHarness.key, saved = await backend.get(key); if (!saved) throw new Error('Actual persisted RAW fixture missing');
      if (fault === 'corrupt-cache') { saved.output.imageLabelBackground.data = __task2.original; await backend.put(saved); }
      if (fault === 'corrupt-candidate' || fault === 'legacy') {
        await backend.delete(key);
        const controller = document.querySelector('#ai-image-panel').__crossController, snapshot = await controller.sharingSnapshot(), target = snapshot.tabs.find(t => t.id === 'task-1');
        const old = structuredClone(first); old.id = 'bad-provenance-raw'; old.data = __task2.original;
        if (fault === 'legacy') { delete old.workflowMetrics.generationHarness; old.reviewState = 'needs-attention'; }
        target.generated = [old]; target.selectedCandidateId = old.id;
        await controller.importSharingSnapshot(snapshot, null); __cross.unverifiedHistorical = structuredClone(old);
      }
      if (fault === 'quota' || fault === 'abort') {
        const put = IDBObjectStore.prototype.put; __cross.cacheFault = { hits: 0, enabled: true };
        IDBObjectStore.prototype.put = function (value, ...args) {
          if (__cross.cacheFault.enabled && this.transaction.db.name === '5e.preview:5e-ai-label-background' && value?.output?.imageLabelBackground) {
            __cross.cacheFault.hits++; if (fault === 'quota') throw new DOMException('Controlled RAW quota', 'QuotaExceededError');
            const request = put.call(this, value, ...args); this.transaction.abort(); return request;
          }
          return put.call(this, value, ...args);
        }; __cross.disposers.push(() => { IDBObjectStore.prototype.put = put; });
      }
    }, { first, fault, version });
    let invalidOwner, invalidTask;
    if (['corrupt-candidate', 'legacy'].includes(fault)) {
      // Capture the actual historical owner before the fresh UI task changes
      // active workspace scope. Never search a different owner's database.
      await selectTask(ctx, page, 'task-1'); await checkpoint(ctx, page);
      invalidOwner = await page.evaluate(() => {
        const row = document.querySelector('#ai-image-panel .ai-task-tab.is-on');
        const active = JSON.parse(localStorage.getItem('5e.aiActiveTask.v1') || 'null');
        if (row?.dataset.tabId !== 'task-1' || active?.taskId !== row.dataset.tabId
          || !row.dataset.aiWorkspaceLink || active.scope !== (row.dataset.aiWorkspaceLink === 'legacy' ? '' : row.dataset.aiWorkspaceLink)) {
          throw new Error('Historical RAW owner must agree with the real visible and persisted selected task');
        }
        return { taskId: row.dataset.tabId, scope: row.dataset.aiWorkspaceLink };
      });
      const saved = await stored(page, invalidOwner);
      invalidTask = saved.tabs.find(task => task.id === invalidOwner.taskId);
      await ctx.check(`${fault}: exact captured durable historical owner retains the invalid candidate`, async () => {
        assert.ok(invalidTask); assert.equal(invalidTask.selectedCandidateId, 'bad-provenance-raw');
        assert.deepEqual(invalidTask.generated.find(candidate => candidate.id === invalidTask.selectedCandidateId), await page.evaluate(() => __cross.unverifiedHistorical));
      });
    }
    const regenerationTask = ['corrupt-candidate', 'legacy'].includes(fault) ? 'task-2' : 'task-1';
    if (regenerationTask === 'task-2') await ctx.check(`${fault}: actual fresh UI generation task has no prior output`, async () => assert.deepEqual((await tabs(page)).find(task => task.id === regenerationTask).generated, []));
    const regenerated = await makeLabel(ctx, page, { task: regenerationTask, request: ['quota', 'abort'].includes(fault) ? 'Storage-failure unique request ' + fault : '장치 연결을 보존해 변환해 주세요' });
    await ctx.check(`${fault}: only explicit Send performs one generation, invalid provenance never adopted`, async () => {
      assert.equal(await page.evaluate(() => __task2.sends.filter(s => s.payload.purpose === 'image').length), before + 1);
      assert.equal(regenerated.data, await page.evaluate(() => __task2.modified)); assert.equal(regenerated.workflowMetrics.calls.fullGeneration, 1);
      assert.equal(regenerated.reviewState, 'needs-attention');
      if (['quota', 'abort'].includes(fault)) assert.ok(await page.evaluate(() => __cross.cacheFault.hits > 0));
      if (['corrupt-candidate', 'legacy'].includes(fault)) assert.deepEqual((await tabs(page)).find(t => t.id === 'task-1').generated[0], await page.evaluate(() => __cross.unverifiedHistorical));
    });
    await page.evaluate(() => { if (__cross.cacheFault) __cross.cacheFault.enabled = false; }); await checkpoint(ctx, page);
    if (regenerationTask === 'task-2') {
      // Negative resolver evidence uses actual durable tasks, not a generated UI
      // action on the invalid historical raster. The original fixture stays put.
      const durable = await stored(page);
      const invalid = invalidTask.generated.find(candidate => candidate.id === invalidTask.selectedCandidateId);
      const validTask = durable.tabs.find(task => task.id === 'task-2'), valid = validTask.generated.find(candidate => candidate.id === validTask.selectedCandidateId);
      const workspaceBefore = await workspace(page), canvasBefore = await fullState(page);
      const rejection = await ctx.act(`${fault}: actual resolver rejects durable invalid candidate and uses actual RAW storage`, () => page.evaluate(async ({ version, invalid, valid }) => {
        const { imageLabelBackgroundContract, resolveImageLabelBackground } = await import('/js/ai-label-background.js' + version);
        const { IndexedDBOutputCacheBackend, createExactOutputCacheStore } = await import('/js/ai-output-cache-store.js' + version);
        const payload = __task2.sends.find(send => send.payload.purpose === 'image')?.payload;
        if (!payload) throw new Error('Missing actual first image transport for negative RAW contract');
        const contract = await imageLabelBackgroundContract({ payload, sourceSha256: valid.sourceSha256, harness: valid.workflowMetrics.generationHarness });
        const backend = new IndexedDBOutputCacheBackend({ databaseName: '5e-ai-label-background' }), cache = createExactOutputCacheStore({ backend });
        let generatorCalls = 0, cacheReads = 0;
        try {
          const result = await resolveImageLabelBackground({ contract, candidates: [invalid],
            cache: { get: key => { cacheReads++; return cache.get(key); } },
            generate: async () => { generatorCalls++; throw new Error('Invalid candidate/storage path unexpectedly generated RAW'); } });
          return { result, contract, generatorCalls, cacheReads, imageCalls: __task2.sends.filter(send => send.payload.purpose === 'image').length };
        } finally { (await backend.open()).close(); }
      }, { version, invalid, valid }), page);
      await ctx.check(`${fault}: durable invalid candidate is rejected without generation, mutation or fabricated key`, async () => {
        assert.equal(rejection.result.reused, 'storage'); assert.equal(rejection.cacheReads, 1); assert.equal(rejection.generatorCalls, 0);
        assert.equal(rejection.imageCalls, before + 1); assert.equal(rejection.contract.key, valid.workflowMetrics.generationHarness.key);
        assert.deepEqual(rejection.contract.harness, valid.workflowMetrics.generationHarness);
        assert.equal(rejection.result.sourceSha256, valid.sourceSha256); assert.equal(rejection.result.candidateSha256, valid.candidateSha256);
        assert.notEqual(sha(pngBytes(rejection.result.data)), sha(pngBytes(invalid.data)), 'Actual returned RAW byte SHA must differ from corrupt historical bytes, regardless of their claimed hash');
        assert.deepEqual((await stored(page, invalidOwner)).tabs.find(task => task.id === invalidOwner.taskId), invalidTask);
        assert.deepEqual((await tabs(page)).find(task => task.id === 'task-1').generated[0], await page.evaluate(() => __cross.unverifiedHistorical));
        assert.deepEqual(await workspace(page), workspaceBefore); assert.deepEqual(await fullState(page), canvasBefore);
      });
      await rawEqual(ctx, rejection.result, regenerated, `${fault}: rejected historical candidate returns actual regenerated storage RAW`);
      await rawEqual(ctx, valid, regenerated, `${fault}: durable fresh UI candidate retains actual regenerated RAW`);
      await unionEqual(ctx, await tabs(page), rich, `${fault}: negative resolver unrelated rich label/graph union`);
      const evidence = ctx.write(`${fault}-invalid-candidate-storage-resolver.json`, { evidenceKind: 'direct real resolver negative; exact captured durable invalid task-1 owner and actual UI-generated task-2; no status/candidate mutation', invalidOwner, invalidTask, invalid, valid, ...rejection });
      ctx.file(evidence, 'QA2-actual-invalid-candidate-storage-rejection');
    }
    // Candidate recovery precedes storage. Deliberately fail reads only at the
    // RAW backend and revisit the saved valid task through the actual UI.
    await page.evaluate(async version => {
      const { IndexedDBOutputCacheBackend } = await import('/js/ai-output-cache-store.js' + version), get = IndexedDBOutputCacheBackend.prototype.get;
      IndexedDBOutputCacheBackend.prototype.get = function (...args) { if (this.databaseName === '5e-ai-label-background') throw new Error('RAW read unavailable'); return get.apply(this, args); };
      __cross.disposers.push(() => { IndexedDBOutputCacheBackend.prototype.get = get; });
    }, version);
    // Current raster UI consumes saved RAW through optional verification. Prove
    // candidate-first recovery separately at the REAL resolver API, rather than
    // pretending the box-edit Send button is a whole-image generation action.
    await selectTask(ctx, page, 'task-0'); await checkpoint(ctx, page);
    for (const relative of ['js/ai-label-background.js', 'js/ai-image-label-run.js', 'js/ai-output-cache-store.js']) {
      ctx.input(relative, 'QA2 real resolver API plus separate saved-RAW verification UI; no direct submit or candidate/status mutation');
    }
    const apiBefore = await workspace(page), canvasBefore = await fullState(page);
    const api = await ctx.act(`${fault}: actual persisted-candidate RAW resolver API`, () => page.evaluate(async ({ version, taskId }) => {
      const [{ imageLabelBackgroundContract, resolveImageLabelBackground }, { IndexedDBOutputCacheBackend, createExactOutputCacheStore }] = await Promise.all([
        import('/js/ai-label-background.js' + version), import('/js/ai-output-cache-store.js' + version),
      ]);
      const controller = document.querySelector('#ai-image-panel').__crossController;
      const row = document.querySelector('#ai-image-panel .ai-task-tab.is-on');
      const active = JSON.parse(localStorage.getItem('5e.aiActiveTask.v1') || 'null');
      const scope = row?.dataset.aiWorkspaceLink;
      if (row?.dataset.tabId !== taskId || controller.activeTask() !== taskId || !scope
        || active?.taskId !== taskId || active.scope !== (scope === 'legacy' ? '' : scope)) {
        throw new Error('QA2 resolver must read the exact visible persisted task owner');
      }
      const taskBackend = new IndexedDBOutputCacheBackend({
        databaseName: scope === 'legacy' ? '5e-ai-image-tasks' : '5e-ai-image-tasks-' + scope, storeName: 'tasks',
      });
      let saved;
      try { saved = await taskBackend.get('workspace'); }
      finally { (await taskBackend.open()).close(); }
      const task = saved?.tabs?.find(tab => tab.id === taskId);
      const candidate = task?.generated?.find(item => item.id === task.selectedCandidateId);
      if (!candidate) throw new Error('QA2 requires the actual durable selected candidate, not a seeded copy');
      const payload = __task2.sends.find(send => send.payload.purpose === 'image')?.payload;
      if (!payload) throw new Error('QA2 requires the retained actual first image transport payload');
      const contract = await imageLabelBackgroundContract({ payload, sourceSha256: candidate.sourceSha256,
        harness: candidate.workflowMetrics.generationHarness });
      const rawBackend = new IndexedDBOutputCacheBackend({ databaseName: '5e-ai-label-background' });
      let faultWitness = null;
      try { await rawBackend.get(contract.key); }
      catch (error) { faultWitness = error.message; }
      if (faultWitness !== 'RAW read unavailable') throw new Error('Controlled RAW backend read fault is not armed');
      let generatorCalls = 0, resolverCacheReads = 0;
      const cache = createExactOutputCacheStore({ backend: rawBackend });
      const result = await resolveImageLabelBackground({ contract, candidates: [candidate],
        cache: { get: key => { resolverCacheReads++; return cache.get(key); } },
        generate: async () => { generatorCalls++; throw new Error('QA2 candidate fallback unexpectedly generated an image'); },
      });
      return { scope, taskId, candidate, contract, result, faultWitness, generatorCalls, resolverCacheReads,
        imageCalls: __task2.sends.filter(send => send.payload.purpose === 'image').length,
        transportPayload: { model: payload.model, effort: payload.effort, serviceTier: payload.serviceTier,
          text: payload.text, attachments: payload.attachments } };
    }, { version, taskId: 'task-0' }), page);
    await ctx.check(`${fault}: real resolver candidate fallback precedes faulted RAW storage and generation`, () => {
      assert.equal(api.result.reused, 'candidate'); assert.equal(api.generatorCalls, 0); assert.equal(api.resolverCacheReads, 0);
      assert.equal(api.faultWitness, 'RAW read unavailable'); assert.equal(api.imageCalls, before + 1);
      assert.equal(api.contract.key, api.candidate.workflowMetrics.generationHarness.key);
      assert.deepEqual(api.contract.harness, api.candidate.workflowMetrics.generationHarness);
      assert.equal(api.result.sourceSha256, api.candidate.sourceSha256);
      assert.equal(api.result.candidateSha256, api.candidate.candidateSha256);
    });
    await rawEqual(ctx, api.result, first, `${fault}: surviving saved-task RAW`);
    await ctx.check(`${fault}: resolver API preserves complete workspace, current owner and canvas`, async () => {
      assert.deepEqual(await workspace(page), apiBefore); assert.deepEqual(await fullState(page), canvasBefore);
      assert.equal(await page.evaluate(() => document.querySelector('#ai-image-panel').__crossController.activeTask()), 'task-0');
    });
    await unionEqual(ctx, await tabs(page), rich, `${fault}: resolver API unrelated rich label/graph union`);
    const apiFile = ctx.write(`${fault}-saved-RAW-resolver-API.json`, { evidenceKind: 'direct actual product resolver API; no UI generation claim', ...api });
    ctx.file(apiFile, 'QA2-persisted-candidate-resolver-API');

    const priorTask = (await tabs(page)).find(task => task.id === 'task-0');
    const workflow = require('./label-source-browser.cjs');
    const startIndex = await page.evaluate(() => __task2.sends.length);
    const verify = page.locator(panel + ' [data-ai-verify-label-draft]');
    await verify.waitFor({ state: 'visible' });
    await ctx.check(`${fault}: real saved-candidate optional-review action is available without status mutation`, async () => {
      assert.equal(await verify.textContent(), '추가 라벨 검수'); assert.equal(await verify.isEnabled(), true);
      assert.equal(priorTask.selectedCandidateId, api.candidate.id);
      assert.deepEqual(priorTask.generated.find(candidate => candidate.id === api.candidate.id), api.candidate);
    });
    await ctx.act(`${fault}: actual saved-RAW additional label verification UI`, () => verify.click(), page);
    await workflow.finish(page, { sourcePlan: workflow.verifiedPlan, startIndex }); await checkpoint(ctx, page);
    const reviewedTask = (await tabs(page)).find(task => task.id === 'task-0'), reviewed = reviewedTask.generated.at(-1);
    await rawEqual(ctx, reviewed, first, `${fault}: actual optional-review UI retains complete saved RAW`);
    await ctx.check(`${fault}: saved-task reuse makes zero additional image requests`, async () => {
      assert.equal(await page.evaluate(() => __task2.sends.filter(send => send.payload.purpose === 'image').length), before + 1);
      assert.equal(reviewed.workflowMetrics.calls.fullGeneration, 0); assert.equal(reviewed.workflowMetrics.attempts.fullGeneration, 0);
      assert.equal(reviewed.workflowMetrics.calls.sourceAnalysis, 0); assert.equal(reviewed.workflowMetrics.calls.review, 1);
      assert.equal(reviewed.workflowMetrics.observationReused, true);
      assert.equal(reviewedTask.generated.length, priorTask.generated.length + 1);
      assert.equal(reviewedTask.selectedCandidateId, reviewed.id); assert.notEqual(reviewed.id, api.candidate.id);
      assert.deepEqual(reviewedTask.generated.slice(0, priorTask.generated.length), priorTask.generated);
      assert.deepEqual(reviewed.sourceLabelPlan, api.candidate.sourceLabelPlan);
      assert.equal(reviewed.sourceSha256, api.candidate.sourceSha256); assert.equal(reviewed.planSha256, api.candidate.planSha256);
      assert.equal(reviewed.targetPlacement.candidateSha256, reviewed.candidateSha256);
      assert.equal(reviewed.targetPlacement.planSha256, reviewed.planSha256);
      assert.equal(reviewed.imageLabelWorkflow.verificationMode, 'full');
      assert.equal(reviewed.reviewState, 'passed'); assert.equal(reviewed.reviewReport.verdict, 'pass');
      assert.ok(reviewed.reviewReport.checks.length > 0); assert.ok(reviewed.reviewReport.checks.every(check => check.status === 'pass'));
      const reviewRequests = await page.evaluate(start => __task2.sends.slice(start).map(send => ({
        purpose: send.payload.purpose, model: send.payload.model, effort: send.payload.effort,
      })), startIndex);
      assert.equal(reviewRequests.length, 1); assert.notEqual(reviewRequests[0].purpose, 'image');
      assert.equal(reviewRequests[0].model, 'gpt-6-luna'); assert.equal(reviewRequests[0].effort, 'medium');
      assert.equal(await page.evaluate(() => document.querySelector('#ai-image-panel').__crossController.activeTask()), 'task-0');
      const {workspace:originalWorkspace,...originalCanvas}=canvasBefore;
      const {workspace:reviewedWorkspace,...reviewedCanvas}=await fullState(page);
      assert.deepEqual(reviewedCanvas,originalCanvas);
    });
    await unionEqual(ctx, await tabs(page), rich, `${fault}: unrelated rich label/graph union`);
    const uiFile = ctx.write(`${fault}-saved-RAW-verification-UI.json`, { evidenceKind: 'actual optional verification UI with existing synthetic transport; no image-generation or quality claim',
      taskId: 'task-0', originalCandidateId: api.candidate.id, reviewedCandidateId: reviewed.id,
      sourceSha256: reviewed.sourceSha256, planSha256: reviewed.planSha256, candidateSha256: reviewed.candidateSha256,
      workflowMetrics: reviewed.workflowMetrics, requests: await workflow.sends(page) });
    ctx.file(uiFile, 'QA2-actual-saved-RAW-verification-UI');
  }); ctx.cover('corrupt-cache-quota-legacy');
}
const primaryQA2 = scenarios.QA2;
scenarios.QA2 = async ctx => { await primaryQA2(ctx); await rawConcurrent(ctx); await rawStorageFaults(ctx); };

async function openNativeInline(ctx, page, id) {
  await selectLabel(ctx, page, id); const p = await labelPoint(page, id); await page.mouse.click(p.x, p.y);
  const input = page.locator('.ai-inline-label-editor'); await input.waitFor({ state: 'visible' }); return input;
}
async function frames(page) { await page.evaluate(() => __cross.deadline(new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))), 'paint completion')); }
async function nativeTextMatrix(ctx) {
  await app(ctx, 'rich-native-composition-builds-details-creation', async page => {
    ctx.input('tests/test-labeler-interactions-browser.cjs', 'retained synthetic composition and projection identity assertions; re-exercised on actual rich candidate');
    ctx.input('tests/labeler/test-creation-finish-browser.cjs', 'retained clicked two-point geometry/Enter/Space oracle, no suite execution');
    const candidate = await makeLabel(ctx, page), rich = await richUnion(ctx, page, candidate);
    await selectTask(ctx, page, 'cross-label-task'); await insertSelected(ctx, page);
    if (await page.evaluate(()=>document.documentElement.dataset.mode==='lite')) {
      await page.locator('#mode-toggle-btn').click();await page.getByRole('button',{name:'유지하고 전환',exact:true}).click();
      await arm(page,'native-matrix-pro',()=>document.documentElement.dataset.mode==='pro'&&!document.querySelector('#mode-toggle-btn').disabled);await arrived(page,'native-matrix-pro');
    }
    const initial = await objects(page), label = initial.find(o => o.aiAutoLabel), image = initial.find(o => o.type === 'image');
    await page.evaluate(() => __candidateQA.state.update(s => { s.objects.push({ id: 'matrix-manual', type: 'line', p1: { x: -15, y: -15 }, p2: { x: -10, y: -10 }, strokeWidth: .2, layerId: s.activeLayerId }); }));
    let input = await openNativeInline(ctx, page, label.id);
    await frames(page);
    await page.evaluate(({ id, imageId }) => {
      __cross.projections = { scene: 0, viewport: 0, inspector: 0 }; __cross.changes = [];
      __cross.projectionNodes = { image: document.querySelector(`#scene [data-id="${imageId}"]:not([data-ui])`), inspector: document.querySelector('.insp-layer-row') };
      __cross.beforeTyping = { undo: __candidateQA.state.get().undoStack.length, label: structuredClone(__candidateQA.state.get().objects.find(o => o.id === id)) };
    }, { id: label.id, imageId: image.id });
    await input.fill('측정기 한글');
    const typed = await page.evaluate(({ id, imageId }) => ({ projections: __cross.projections, notifications: __cross.changes, undo: __candidateQA.state.get().undoStack.length,
      before: __cross.beforeTyping, label: __candidateQA.state.get().objects.find(o => o.id === id),
      nodeStable: __cross.projectionNodes.image === document.querySelector(`#scene [data-id="${imageId}"]:not([data-ui])`),
      inspectorStable: __cross.projectionNodes.inspector === document.querySelector('.insp-layer-row'), nodeExists: Boolean(__cross.projectionNodes.image && __cross.projectionNodes.inspector) }), { id: label.id, imageId: image.id });
    await ctx.check('native-text-input has exactly one notification, zero actual scene/viewport/inspector builds and zero undo entries', () => {
      assert.deepEqual(typed.projections, { scene: 0, viewport: 0, inspector: 0 }); assert.equal(typed.notifications.length, 1); assert.equal(typed.notifications[0].change, 'native-text-input');
      assert.equal(typed.undo, typed.before.undo); assert.deepEqual(typed.label, typed.before.label); assert.ok(typed.nodeExists && typed.nodeStable && typed.inspectorStable);
    });
    await page.evaluate(() => __candidateQA.state.update(s => { s.targetedId = null; }, 'qa-normal-projection-control'));
    await ctx.check('ordinary notification actually rebuilds scene, viewport and inspector despite live native editor', async () => {
      assert.deepEqual(await page.evaluate(() => __cross.projections), { scene: 1, viewport: 1, inspector: 1 });
    });
    await input.evaluate(el => {
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'ㅎ' })); el.value = '한글 조합';
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: '글', isComposing: true }));
      for (const key of ['Enter', 'Escape']) el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key, isComposing: true, keyCode: 229 }));
    });
    await ctx.check('synthetic active composition Enter/Escape leaves editor open, draft retained and committed object/history unchanged', async () => {
      assert.equal(await input.isVisible(), true); const current = await page.evaluate(() => ({ draft: __candidateQA.state.get().draftText.text, undo: __candidateQA.state.get().undoStack.length }));
      assert.equal(current.draft, '한글 조합'); assert.equal(current.undo, typed.before.undo); assert.deepEqual((await objects(page)).find(o => o.id === label.id), label);
    });
    await input.evaluate(el => el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '한글 조합' })));
    await input.press('Enter');
    await ctx.check('compositionend then real Enter commits once with native geometry/typography and RAW preserved', async () => {
      const all = await objects(page), current = all.find(o => o.id === label.id); assert.equal(current.text, '한글 조합'); assert.deepEqual(current.leaderRoutes, label.leaderRoutes); assert.deepEqual(current.p1, label.p1); assert.equal(current.fontFamily, label.fontFamily);
      assert.equal(await page.evaluate(() => __candidateQA.state.get().undoStack.length), typed.before.undo + 1); assert.deepEqual(all.find(o => o.id === image.id), image);
    });
    input = await openNativeInline(ctx, page, label.id); await input.fill('취소할 한글');
    await input.evaluate(el => { el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'ㅎ' })); el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '취소할 한글' })); });
    await input.press('Escape'); await ctx.check('composition cancel after end preserves last committed label', async () => assert.equal((await objects(page)).find(o => o.id === label.id).text, '한글 조합'));
    ctx.write('native-input-build-counts.json', typed); ctx.cover('native-input-notifications');
    const drawer = page.locator('#drawer-right-toggle');
    if (await drawer.getAttribute('aria-expanded') === 'false') await drawer.click();
    await selectLabel(ctx, page, label.id);
    const detail = page.locator('#inspector [data-text-detail-edit]:visible'); await detail.waitFor();
    for (const key of ['Enter', 'Space']) {
      await detail.focus(); await detail.press(key); const editor = page.locator('.unified-text-editor'); await editor.waitFor({ state: 'visible' });
      await ctx.check(`actual detailed editor ${key} preserves committed Korean text`, async () => assert.equal(await editor.locator('textarea').inputValue(), '한글 조합'));
      await editor.locator('textarea').fill('\\frac{'); await editor.locator('textarea').press('Escape');
      await ctx.check('invalid/incomplete math canceled through actual detailed UI preserves native object', async () => assert.equal((await objects(page)).find(o => o.id === label.id).text, '한글 조합'));
    }
    const point = await labelPoint(page, label.id); await page.mouse.click(point.x, point.y, { button: 'right' });
    await page.locator('.text-ctx-menu').getByRole('button', { name: '텍스트 상세 편집', exact: true }).click();
    const editor = page.locator('.unified-text-editor'); await editor.waitFor(); const font = editor.locator('select.unified-style-select');
    const choices = await font.evaluate(el => ({ value: el.value, values: [...el.options].map(o => o.value) }));
    const alternate = choices.values.find(value => value && value !== choices.value); assert.ok(alternate, 'At least two registered font choices required');
    const priorStyle = (await objects(page)).find(o => o.id === label.id); await font.selectOption(alternate); await editor.getByRole('button', { name: '확인', exact: true }).click();
    await ctx.check('context-menu detailed font commit retains Korean/math identity, target and routed geometry', async () => {
      const styled = (await objects(page)).find(o => o.id === label.id); assert.equal(styled.fontFamily, alternate); assert.equal(styled.text, priorStyle.text); assert.deepEqual(styled.p1, priorStyle.p1); assert.deepEqual(styled.p2, priorStyle.p2); assert.deepEqual(styled.leaderRoutes, priorStyle.leaderRoutes);
      assert.ok(!choices.values.includes('unregistered-invalid-font')); // UI cannot silently select an unsupported family.
    });
    await page.locator('#undo-btn').click();
    for (const protection of ['locked', 'vertical', 'multi']) {
      await page.evaluate(({ id, protection }) => __candidateQA.state.update(s => {
        const o = s.objects.find(o => o.id === id); if (protection === 'locked') o.locked = true; if (protection === 'vertical') o.textOrient = 'vertical';
        s.selectedIds = protection === 'multi' ? [id, 'matrix-manual'] : [id];
      }), { id: label.id, protection });
      const before = await objects(page), undo = await page.evaluate(() => __candidateQA.state.get().undoStack.length);
      if (protection === 'multi') await page.locator('#canvas').press('Enter');
      else { const p = await labelPoint(page, label.id); await page.mouse.dblclick(p.x, p.y); }
      await frames(page);
      await ctx.check(`${protection}: protected objects do not start simple native editing or mutate content/history`, async () => {
        assert.equal(await page.locator('.ai-inline-label-editor').count(), 0); assert.deepEqual(await objects(page), before); assert.equal(await page.evaluate(() => __candidateQA.state.get().undoStack.length), undo);
      });
      if (await page.locator('.unified-text-editor').isVisible()) await page.locator('.unified-text-editor textarea').press('Escape');
      await page.evaluate(id => __candidateQA.state.update(s => { const o = s.objects.find(o => o.id === id); delete o.locked; delete o.textOrient; s.selectedIds = []; }), label.id);
    }
    // Both completion keys use real clicked source-space points while the rich
    // candidate, its RAW and independent native objects stay in the same scene.
    for (const key of ['Enter', 'Space']) {
      await page.locator('#canvas').focus(); await page.keyboard.press('Shift+T');
      const mapped = await page.evaluate(async version => {
        const { worldToScreen, screenToWorld } = await import('/js/viewport.js' + version), s = __candidateQA.state.get(), svg = document.querySelector('#canvas'), v = s.viewBox;
        return [[.2,.65],[.55,.35],[.72,.7]].map(([x,y]) => { const p = worldToScreen(svg,v,v.x+x*v.w,v.y+y*v.h); return { ...p, world: screenToWorld(svg,v,p.x,p.y) }; });
      }, version);
      const before = await objects(page), undo = await page.evaluate(() => __candidateQA.state.get().undoStack.length);
      await page.mouse.click(mapped[0].x,mapped[0].y); await page.mouse.click(mapped[1].x,mapped[1].y); await page.mouse.move(mapped[2].x,mapped[2].y);
      await page.keyboard.press(key); await editor.waitFor({ state: 'visible' });
      const pending = await page.evaluate(() => structuredClone(__candidateQA.state.get().draftText.pendingLabeler));
      await ctx.check(`${key}: two clicked points ignore hovering third point`, () => {
        assert.ok(Math.hypot(pending.p1.x-mapped[0].world.x,pending.p1.y-mapped[0].world.y)<.15); assert.ok(Math.hypot(pending.p2.x-mapped[1].world.x,pending.p2.y-mapped[1].world.y)<.15); assert.equal(pending.elbow,undefined);
      });
      await editor.locator('textarea').fill('두 점 '+key); await editor.getByRole('button',{name:'확인',exact:true}).click();
      const after = await objects(page), created = after.find(o=>!before.some(prior=>prior.id===o.id));
      await ctx.check(`${key}: native straight leader is one undoable object and preserves full previous scene`, async()=>{ assert.equal(after.length,before.length+1); assert.equal(created.elbow,undefined); assert.equal(created.text,'두 점 '+key); for(const prior of before)assert.deepEqual(after.find(o=>o.id===prior.id),prior); assert.equal(await page.evaluate(()=>__candidateQA.state.get().undoStack.length),undo+1); });
      await page.locator('#undo-btn').click(); await ctx.check(`${key}: Undo removes only created native label`,async()=>assert.deepEqual(await objects(page),before)); await page.locator('#redo-btn').click();
    }
    input = await openNativeInline(ctx,page,label.id); await input.fill('전환 전 확정한 초안');
    const pageId = await page.evaluate(()=>__candidateQA.state.get().activePageId); await page.locator('#page-add').click();
    await ctx.check('real page switch commits to original page and cannot leak into the new page',async()=>{ const s=await page.evaluate(()=>structuredClone(__candidateQA.state.get())); assert.notEqual(s.activePageId,pageId); assert.equal(s.objects.length,0); assert.equal(s.draftText,null); assert.equal(s.pages.find(p=>p.id===pageId).objects.find(o=>o.id===label.id).text,'전환 전 확정한 초안'); });
    await page.locator(`#page-tabs .page-tab[data-id="${pageId}"]`).click();
    const saved=await drawingFile(ctx,page,'QA3-composition-geometry-matrix'); input=await openNativeInline(ctx,page,label.id); await input.fill('읽기 중 보류 초안');
    await openDrawing(ctx,page,saved); await ctx.check('actual file replacement removes pending editor and restores saved native content rather than stale draft',async()=>{ assert.equal(await page.locator('.ai-inline-label-editor').count(),0); assert.equal((await objects(page)).find(o=>o.id===label.id).text,'전환 전 확정한 초안'); assert.deepEqual((await objects(page)).find(o=>o.id===image.id),openedImageDefaults([image])[0]); });
    await unionEqual(ctx,await tabs(page),rich,'composition/detail/creation actual file union'); ctx.cover('detail-context-two-point-ime');
  });
}
const primaryQA3 = scenarios.QA3;
scenarios.QA3 = async ctx => { await primaryQA3(ctx); await nativeTextMatrix(ctx); };

async function graphGuards(ctx) {
  for (const fault of ['wrong-source', 'malformed', 'unsupported-model', 'canceled-source-replacement']) await app(ctx, 'graph-guard-' + fault, async page => {
    const label = await makeLabel(ctx, page), rich = await richUnion(ctx, page, label); await selectTask(ctx, page, 'cross-graph-task');
    await page.locator(panel + ' [data-ai-side-tab="comments"]').click();
    await page.locator(panel + ' [data-ai-input]').waitFor({ state: 'visible' });
    await page.locator(panel + ' [data-ai-input]').fill('Guard current native source ' + fault);
    const before = (await tabs(page)).find(t => t.id === 'cross-graph-task'), scene = await objects(page), start = await page.evaluate(() => __task2.sends.length);
    if (fault === 'unsupported-model') await page.evaluate(() => { fiveEDesktop.models = async () => ({ data: [{ model: 'gpt-6-luna', supportedReasoningEfforts: ['medium'] }] }); });
    await arm(page, 'guard-idle', () => document.querySelector('#ai-image-panel').dataset.aiBusy === 'false' && document.querySelector('#ai-image-panel [data-ai-status]').dataset.kind === 'error');
    if (fault !== 'unsupported-model') await arm(page, 'guard-request', n => __task2.sends.length > n, start);
    await page.locator(panel + ' [data-ai-send]').click();
    if (fault !== 'unsupported-model') {
      await arrived(page, 'guard-request'); const request = await page.evaluate(n => __task2.sends[n].payload, start); assert.equal(request.purpose,'scene');
      const match = request.text.match(/바인딩을 정확히 복사하고[^\n]*: (\{[^\n]+\})/); assert.ok(match);
      const reply = clone(before.generated[0].graphResult.plan); reply.source = { ...JSON.parse(match[1]), plotBox: clone(reply.source.plotBox) };
      if (fault === 'wrong-source') reply.source.hash = 'sha256:' + 'f'.repeat(64);
      if (fault === 'malformed') reply.axes.x.max = 'not-a-number';
      if (fault === 'canceled-source-replacement') {
        await transition(page, 'cancel-graph-guard', () => document.querySelector('#ai-image-panel').dataset.aiBusy === 'false', null, () => page.locator(panel + ' [data-ai-interrupt]').click());
        const png = await page.evaluate(()=>__task2.modified);
        await transition(page,'guard-source-replaced',async data=>(await document.querySelector('#ai-image-panel').__crossController.sharingSnapshot()).tabs.find(t=>t.id==='cross-graph-task').attachments[0].data===data,png,
          ()=>page.locator(panel+' [data-ai-replace-source-input]').setInputFiles({name:'controlled-source-replacement.png',mimeType:'image/png',buffer:pngBytes(png)}));
        const canceled = await workspace(page); await require('./label-source-browser.cjs').emit(page,start,'assistant',JSON.stringify(reply)); await checkpoint(ctx,page);
        await ctx.check('canceled graph response after actual source replacement has zero adoption or silent fallback',async()=>{ assert.deepEqual(await workspace(page),canceled); assert.deepEqual(await objects(page),scene); assert.equal(await page.evaluate(n=>__task2.sends.length-n,start),1); });
      } else { await require('./label-source-browser.cjs').emit(page,start,'assistant',JSON.stringify(reply)); await arrived(page,'guard-idle'); }
    } else await arrived(page,'guard-idle');
    const after=(await tabs(page)).find(t=>t.id===before.id);
    await ctx.check(`${fault}: selected original graph/native data/RAW/comments/review remain intact with exact request count`,async()=>{
      assert.deepEqual(after.generated,before.generated); assert.equal(after.selectedCandidateId,before.selectedCandidateId); assert.equal(after.input,before.input); assert.deepEqual(await objects(page),scene);
      const sends=await page.evaluate(n=>__task2.sends.slice(n).map(s=>s.payload.purpose),start); assert.deepEqual(sends,fault==='unsupported-model'?[]:['scene']);
      if(fault!=='canceled-source-replacement'){ assert.equal(after.workState,'failed'); assert.equal(await page.locator(panel+' [data-ai-status]').getAttribute('data-kind'),'error'); assert.ok((await page.locator(panel+' [data-ai-status]').textContent()).length); }
    });
    await unionEqual(ctx,await tabs(page),[rich.find(t=>t.id==='cross-label-task')],`${fault}: unrelated actual label union`);
    ctx.write('graph-guard-'+fault+'.json',{before,after,sourceOrigin:new URL(ctx.report.url).origin});
  }); ctx.cover('malformed-source-model');
}
const primaryQA4 = scenarios.QA4;
scenarios.QA4 = async ctx => { await primaryQA4(ctx); await graphGuards(ctx); };

module.exports = { execute, fingerprint, command, required, pendingOracles: gaps,
  zoomInspection: { assertMetrics: assertZoomMetrics, adaptFixtureSource: adaptChromiumZoomFixture, extensionSources: chromiumZoomExtension } };

async function persistenceSignals(ctx, page) {
  const source = ctx.input('js/ai-task-workspaces.js', 'actual queued persistence with only timer callback exposure; original source SHA retained').toString();
  const timer = 'setTimer = setTimeout,', clear = 'clearTimer = clearTimeout,', entered = 'pendingReplacements += 1;';
  assert.ok(source.includes(timer) && source.includes(clear) && source.includes(entered) && source.includes('if (epoch !== timerEpoch) return;'));
  const body = source.replace(timer, `setTimer = (callback,delay) => {
    if (!window.__cross?.captureTimers) return setTimeout(callback,delay);
    const item={id:-(window.__cross.savedTimers.length+1),callback,delay,cleared:false,fired:0};
    window.__cross.savedTimers.push(item);window.__cross.notify();return item.id;
  },`).replace(clear, `clearTimer = id => {
    const item=window.__cross?.savedTimers?.find(item=>item.id===id);
    if(item){item.cleared=true;window.__cross.notify();}else clearTimeout(id);
  },`).replace(entered, entered + ' window.__cross.replacements=(window.__cross.replacements||0)+1;window.__cross.notify();');
  await page.route('**/js/ai-task-workspaces.js?*', route => route.fulfill({ contentType: 'text/javascript', body }));
}

async function armedReplacement(ctx, name) {
  await app(ctx, name, async page => {
    ctx.input('js/ai-output-cache-store.js','actual transaction.oncomplete task-store callback held after real IndexedDB commit, then invoked unchanged exactly once');
    const label = await makeLabel(ctx,page), rich = await richUnion(ctx,page,label); await selectTask(ctx,page,'cross-graph-task'); await checkpoint(ctx,page);
    await page.evaluate(async version => {
      __cross.savedTimers=[];__cross.captureTimers=true;
      const c=document.querySelector('#ai-image-panel').__crossController;
      const row=document.querySelector('#ai-image-panel .ai-task-tab.is-on'),owner=JSON.parse(localStorage.getItem('5e.aiActiveTask.v1')||'null');
      if(!row||row.dataset.tabId!=='cross-graph-task'||owner?.taskId!==row.dataset.tabId||owner.scope!==(row.dataset.aiWorkspaceLink==='legacy'?'':row.dataset.aiWorkspaceLink))throw new Error('Real checkpoint owner does not agree with visible selected graph');
      const {IndexedDBOutputCacheBackend}=await import('/js/ai-output-cache-store.js'+version);
      const backend=new IndexedDBOutputCacheBackend({databaseName:'5e-ai-image-tasks'+(owner.scope?'-'+owner.scope:''),storeName:'tasks'});
      const db=await backend.open(),expectedDatabase=db.name;db.close();
      const gate=__cross.realCommitGate=__cross.heldStoreGate={entered:Promise.withResolvers(),release:Promise.withResolvers(),committed:false,callbackCalls:0,expectedDatabase,owner};
      const prototype=IDBTransaction.prototype,descriptor=Object.getOwnPropertyDescriptor(prototype,'oncomplete');
      if(!descriptor?.set||!descriptor.get)throw new Error('Actual IndexedDB completion callback descriptor unavailable');
      Object.defineProperty(prototype,'oncomplete',{...descriptor,set(listener){
        const held=__cross.realCommitGate;
        if(held&&this.mode==='readwrite'&&this.db.name===held.expectedDatabase&&this.objectStoreNames.contains('tasks')){
          __cross.realCommitGate=null;descriptor.set.call(this,function(event){
            held.committed=true;held.database=this.db.name;held.stores=[...this.objectStoreNames];held.entered.resolve();__cross.notify();
            held.release.promise.then(()=>{held.callbackCalls++;listener.call(this,event);__cross.notify();});
          });
        }else descriptor.set.call(this,listener);
      }});__cross.disposers.push(()=>{gate.release.resolve();Object.defineProperty(prototype,'oncomplete',descriptor);});
      __cross.heldCheckpoint=c.checkpointForClose();await __cross.deadline(gate.entered.promise,'actual old IndexedDB commit, completion callback held');
    },version);
    await page.locator(panel+' [data-ai-input]').fill('복원 전 예약된 입력');
    await arm(page,'old-debounce-armed',()=>__cross.savedTimers.length>0);await arrived(page,'old-debounce-armed');
    const expected = await page.evaluate(async () => {
      const c=document.querySelector('#ai-image-panel').__crossController,replacement=await c.sharingSnapshot();
      const tab=replacement.tabs.find(t=>t.id==='cross-graph-task');tab.input='복원한 실제 입력';
      tab.generated[0].comments=[{number:1,type:'point',x:12,y:14,text:'replacement owns comments'}];
      tab.generated[0].graphResult.objects.find(o=>o.type==='coordplane').labelX='교체된 축';
      __cross.oldTimer=__cross.savedTimers.at(-1);__cross.replaceBaseline=__cross.replacements||0;
      __cross.install=c.importSharingSnapshot(replacement,null);__cross.install.catch(()=>{});return replacement;
    });
    await arm(page,'replacement-queued',()=>__cross.replacements>__cross.replaceBaseline);await arrived(page,'replacement-queued');
    await ctx.act('fire original ARMED debounce callback while replacement is held',()=>page.evaluate(()=>{
      __cross.oldTimer.fired++;__cross.oldTimer.callback();__cross.notify();
    }),page);
    await page.locator(panel+' [data-ai-input]').fill('복원 대기 중 새로 예약한 입력');
    await arm(page,'new-debounce-armed',()=>__cross.savedTimers.at(-1)!==__cross.oldTimer&&!__cross.savedTimers.at(-1).cleared);await arrived(page,'new-debounce-armed');
    await ctx.act('fire newly captured actual debounce callback DURING replacement',()=>page.evaluate(()=>{
      const item=__cross.savedTimers.at(-1);item.fired++;item.callback();__cross.notify();
    }),page);
    await page.evaluate(async()=>{__cross.heldStoreGate.release.resolve();await __cross.heldCheckpoint;await __cross.install;await document.querySelector('#ai-image-panel').__crossController.crossPersistence.settled();});
    const actual=await page.evaluate(()=>document.querySelector('#ai-image-panel').__crossController.sharingSnapshot()), durable=await stored(page);
    await ctx.check('old armed epoch is fenced and new capture waits for installed owner in memory AND real IndexedDB',()=>{
      assert.deepEqual(actual,expected);for(const key of ['tabs','activeTaskTabId','taskSequence'])assert.deepEqual(durable[key],expected[key]);
    });
    await unionEqual(ctx,await tabs(page),[rich.find(t=>t.id==='cross-label-task')],name+': unrelated full label union');
    const timers=await page.evaluate(()=>__cross.savedTimers.map(({id,delay,cleared,fired})=>({id,delay,cleared,fired})));
    const idb=await page.evaluate(()=>{const gate=__cross.heldStoreGate;return{committed:gate.committed,callbackCalls:gate.callbackCalls,database:gate.database,expectedDatabase:gate.expectedDatabase,owner:gate.owner,stores:gate.stores};});
    await ctx.check('both actual callbacks ran while replacement was queued, including canceled prior epoch',()=>{
      assert.ok(timers.some(t=>t.cleared&&t.fired===1));assert.ok(timers.filter(t=>t.fired===1).length===2);assert.equal(idb.committed,true);assert.equal(idb.callbackCalls,1);assert.equal(idb.database,idb.expectedDatabase);assert.equal(idb.owner.taskId,'cross-graph-task');assert.deepEqual(idb.stores,['tasks']);
    });ctx.write(name+'-armed-debounce.json',{timers,idb,expected,actual,durable});await page.evaluate(()=>{__cross.captureTimers=false;});
  },{ownerHooks:true,setupRoutes:page=>persistenceSignals(ctx,page)});
}
const graphQA4=scenarios.QA4;
scenarios.QA4=async ctx=>{await graphQA4(ctx);await armedReplacement(ctx,'QA4-armed-debounce-during-import');ctx.cover('queued-checkpoint');};

async function bootSecondary(ctx, sourcePage, name, run, {fresh=false,url=ctx.report.url}={}) {
  const context=fresh?await sourcePage.context().browser().newContext({acceptDownloads:true,serviceWorkers:'block',reducedMotion:'reduce'}):sourcePage.context();
  const page=await context.newPage(),resources=[],bodies=[],errors=[];page.on('pageerror',error=>errors.push(error.stack));
  if(fresh)await context.tracing.start({screenshots:true,snapshots:true,sources:true});
  try{
    await page.addInitScript({content:`(${installSignals.toString()})();\n(${readOnlyBridge.toString()})();`});
    const origin=new URL(url).origin;
    await page.route('**/*',route=>{const u=new URL(route.request().url());return ['http:','https:'].includes(u.protocol)&&u.origin!==origin?route.abort('blockedbyclient'):route.fallback();});
    const main=ctx.input('js/main.js','actual secondary root bootstrap; read-only mock transport, no storage clearing').toString();
    const served=await page.request.get(new URL('/js/main.js'+version,url).href);assert.equal(served.status(),200);assert.equal(sha(await served.body()),sha(Buffer.from(main)),'Secondary retained hostname must serve same actual candidate');
    const hook='const aiPanel = initAiPanel(state, { freshStart: recoveryChoice === "fresh", materializeCandidate });';assert.ok(main.includes(hook));
    await page.route('**/js/main.js?*',route=>route.fulfill({contentType:'text/javascript',body:main.replace(hook,hook+' window.__task2Manager=aiPanel;window.__candidateQA={state,examWorkspace,materializeCandidate};state.subscribe(()=>__cross.notify());__cross.notify();')}));
    const source=ctx.input('js/ai-panel.js').toString(),returnHook='return {\n    batchOwner, ownsBatchOwner:';assert.ok(source.includes(returnHook));
    await page.route('**/js/ai-panel.js?*',route=>route.fulfill({contentType:'text/javascript',body:source.replace(returnHook,'return panel.__crossController = {\n    crossPersistence: taskPersistence, batchOwner, ownsBatchOwner:')}));
    page.on('response',response=>{const item={case:name,url:response.url(),status:response.status()};resources.push(item);
      if(/\.(js|css|wasm|woff2?)(\?|$)/.test(item.url))bodies.push(response.body().then(bytes=>{item.bytes=bytes.length;item.sha256=sha(bytes);},e=>{item.bodyError=e.message;}));});
    await require('./rhwp-exam.cjs').navigate(page,url);await resumeStartup(page);await require('./rhwp-exam.cjs').ready(page);
    await run(page);await ctx.check(name+': no uncaught runtime errors',()=>assert.deepEqual(errors,[]));
    await ctx.check(name+': zero provider/auth calls',async()=>assert.deepEqual(await page.evaluate(()=>__cross.readOnlyCalls),{send:0,login:0}));
  }finally{
    if(!page.isClosed()){
      await ctx.shot(page,name+'-final');ctx.write(name+'-ui-actions.json',await page.evaluate(()=>window.__cross?.actions || null));
      await page.evaluate(()=>{if(window.__cross){for(const dispose of window.__cross.disposers || [])dispose();window.__cross.listeners?.clear();}});
    }
    await Promise.allSettled(bodies);ctx.result.resources.push(...resources);await page.close();
    if(fresh){const trace=path.join(ctx.directory,name+'-trace.zip');await context.tracing.stop({path:trace});ctx.file(trace,'trace');await context.close();}
    ctx.result.cleanup.push({name,pageClosed:page.isClosed(),contextClosed:fresh,sharedContextRetained:!fresh,retainedExternalServer:true});
  }
}
async function resumeStartup(page){
  await arm(page,'secondary-startup',()=>Boolean(window.__candidateQA||document.querySelector('.recovery-checkpoint-dialog,[role=dialog]')));
  await arrived(page,'secondary-startup');
  if(!await page.evaluate(()=>Boolean(window.__candidateQA))){
    const checkpoint=page.locator('.recovery-checkpoint-dialog');
    if(await checkpoint.isVisible())await checkpoint.locator('[data-act=restore]').click();
    else await page.getByRole('button',{name:'복구',exact:true}).click();
  }
  await arm(page,'secondary-booted',()=>Boolean(window.__candidateQA));await arrived(page,'secondary-booted');
}

async function examCycle(page, action) {
  await page.evaluate(()=>{
    const node=document.querySelector('#rhwp-exam-workspace');let seen=false;
    __cross.examCycle=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{observer.disconnect();reject(new Error('Actual exam busy-cycle deadline'));},30000);
      const observer=new MutationObserver(records=>{
        if(records.some(r=>r.attributeName==='aria-busy'&&r.oldValue==='true')||node.getAttribute('aria-busy')==='true')seen=true;
        if(seen&&node.getAttribute('aria-busy')==='false'){clearTimeout(timer);observer.disconnect();resolve();}
      });observer.observe(node,{attributes:true,attributeOldValue:true,attributeFilter:['aria-busy']});
      __cross.disposers.push(()=>{clearTimeout(timer);observer.disconnect();});
    });__cross.examCycle.catch(()=>{});
  });await action();await page.evaluate(()=>__cross.examCycle);
}
async function corruptArchive(ctx,page,file,mutation,boundary='workspace'){
  const bytes=await page.evaluate(async({bytes,mutation,boundary,version})=>{
    const {unzipStore,zipStore}=await import('/js/backup-zip.js'+version);
    const files=unzipStore(new Uint8Array(bytes)),raw=JSON.parse(new TextDecoder().decode(files.get('project.json')));
    let graph;
    if(boundary==='workspace')graph=raw.workspace.ai.workspaces.flatMap(w=>w.tabs).find(t=>t.id==='cross-graph-task').generated[0];
    else graph=raw.figures.find(f=>f.context.ai.snapshot.tabs.some(t=>t.generated.some(c=>c.graphResult))).context.ai.snapshot.tabs.flatMap(t=>t.generated).find(c=>c.graphResult);
    if(mutation==='native-ticks-null')graph.graphResult.objects.find(o=>o.type==='coordplane').explicitTicksX=[null];
    if(mutation==='native-annotation-null')graph.graphResult.objects.find(o=>o.type==='coordplane').graphAnnotations=[null];
    if(mutation==='binding')graph.targetPlacement.candidateSha256='f'.repeat(64);
    if(mutation==='missing-asset'){
      const asset=[...files.keys()].find(k=>k.startsWith('assets/'));if(!asset)throw new Error('Actual saved archive has no asset to remove');files.delete(asset);
    }
    files.set('project.json',new TextEncoder().encode(JSON.stringify(raw)));
    const output=new Uint8Array(await zipStore([...files].map(([name,data])=>({name,data}))).arrayBuffer());
    if(mutation==='crc'){const name=output[26]|output[27]<<8,extra=output[28]|output[29]<<8;output[30+name+extra]^=1;}
    return [...output];
  },{bytes:[...fs.readFileSync(file)],mutation,boundary,version});
  const target=path.join(ctx.directory,`${path.basename(file,'.5e')}-${boundary}-${mutation}.5e`);fs.writeFileSync(target,Buffer.from(bytes));ctx.file(target,'actual-project-single-corruption-negative');return target;
}
async function inlineCaption(page,id){
  const glyph=page.locator(`#exam-inline-editor g[data-annotation-id="${id}"] text`).last();
  const p=await glyph.evaluate(text=>{const r=text.getBoundingClientRect();for(const f of [.15,.85,.3,.7]){const x=r.x+r.width*f,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);if(hit?.closest('[data-annotation-id]')?.dataset.annotationId===text.closest('[data-annotation-id]').dataset.annotationId&&!hit.closest('[data-inline-handle]'))return{x,y};}throw new Error('Actual inline glyph has no exposed hit point');});
  await page.mouse.click(p.x,p.y);
}
async function rhwpNegatives(ctx){
  await app(ctx,'rhwp-cancel-copy-conflict-corrupt',async page=>{
    const h=require('./rhwp-exam.cjs'),label=await makeLabel(ctx,page,{verification:'full'}),rich=await richUnion(ctx,page,label);
    await sendAiFigure(ctx,page,'cross-label-task');await sendAiFigure(ctx,page,'cross-graph-task');
    const before=await h.pictures(page);await h.action(page,'close');await page.locator('#ai-image-install-open').click();await selectTask(ctx,page,'cross-label-task');
    await page.locator(panel+' [data-ai-exam-send]').click();await page.locator('.capture-overlay').waitFor({state:'visible'});await page.keyboard.press('Escape');
    await ctx.check('actual capture Escape cancels before document mutation',async()=>assert.deepEqual(await h.pictures(page),before));
    await h.crop(page,panel+' [data-ai-exam-send]');await page.locator('.exam-placement').waitFor({state:'visible'});
    await page.locator('[data-exam-action="cancel-placement"]').click();await h.idle(page);
    await ctx.check('actual placement cancel retains both native linked figures',async()=>assert.deepEqual(await h.pictures(page),before));
    const chooser=page.waitForEvent('filechooser');await h.action(page,'open-hwp');await(await chooser).setFiles([]);await h.idle(page);
    await ctx.check('actual RHWP chooser cancel retains native document and union',async()=>assert.deepEqual(await h.pictures(page),before));
    ctx.input('tests/test-rhwp-exam-workspace-browser.cjs','native WASM copyControl/pasteInternal operation reused on actual combined document; source suite not run');
    await page.evaluate(()=>{
      const d=document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps,c=d.wasm.getPageControlLayout(0).controls.find(c=>c.type==='image'),input=d.getInputHandler();
      d.wasm.copyControl(c.secIdx,c.paraIdx,c.controlIdx,'[]');input.executeOperation({kind:'snapshot',operationType:'cross-native-copy',operation:()=>{const raw=d.wasm.pasteInternal(c.secIdx,c.paraIdx,1),result=typeof raw==='string'?JSON.parse(raw):raw;if(!result.ok)throw new Error('Actual native paste failed');return input.getCursorPosition();}});d.eventBus.emit('document-changed');
    });await h.waitForState(page,()=>document.querySelector('#exam-figures').querySelectorAll('button').length===3);
    const copies=await h.pictures(page),copy=copies.find(p=>!before.some(b=>b.figure.link.assetId===p.figure.link.assetId));assert.ok(copy);
    await ctx.check('native copied editable PNG forks figure/tab/asset/task ownership with rich fields retained',()=>{
      assert.equal(copies.length,3);assert.equal(new Set(copies.map(p=>p.figure.link.tabId)).size,3);assert.equal(new Set(copies.map(p=>p.figure.link.assetId)).size,3);
      assert.notEqual(copy.figure.context.ai.taskId,'cross-label-task');
      for(const original of before)assert.deepEqual(copies.find(p=>p.figure.link.assetId===original.figure.link.assetId).figure,original.figure);
      const original=before[0].figure.context.ai.snapshot.tabs[0],forked=copy.figure.context.ai.snapshot.tabs[0];assert.notEqual(forked.id,original.id);
      assert.deepEqual(forked.generated,original.generated);assert.equal(forked.selectedCandidateId,original.selectedCandidateId);
    });
    await page.evaluate(()=>document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().performUndo());await h.idle(page);
    await ctx.check('one real native Undo removes independently linked copy only',async()=>assert.deepEqual((await h.pictures(page)).map(p=>p.figure),before.map(p=>p.figure)));
    await page.evaluate(()=>document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().performRedo());await h.waitForState(page,()=>document.querySelector('#exam-figures').querySelectorAll('button').length===3);
    await h.originalEdit(page,0);await closeAI(page);const source=(await objects(page)).find(o=>o.type==='labeler'),link=(await h.pictures(page))[0].figure.link;
    // Wrong original source-tab and AI-owner are rejected at the real Send UI.
    await page.locator('#page-add').click();const wrongBaseline=await h.pictures(page);
    await examCycle(page,()=>page.locator('#exam-send').click());
    const errorDialog=page.getByRole('dialog',{name:'시험지 보내기'});await errorDialog.waitFor({state:'visible'});
    await ctx.check('foreign active source tab cannot replace linked native figure',async()=>{assert.match(await errorDialog.textContent(),/원래.*작업 탭|연결/);assert.deepEqual(await h.pictures(page),wrongBaseline);});
    await errorDialog.getByRole('button',{name:'확인',exact:true}).click();await page.locator('#exam-workspace-open').click();await h.idle(page);
    await h.doubleClick(page,0);const host=page.locator('#exam-inline-editor');await host.waitFor({state:'visible'});
    // The existing figure crop clips this caption. The real inline editor
    // selects its first annotation and exposes its text in the visible field.
    // Physical caption selection is independently covered by all routed cases.
    const field=host.locator('[data-inline-field=text]');
    await ctx.check('actual inline opening selects the intended cropped annotation and exposes its text field',async()=>{
      const ids=await host.locator('[data-inline-handle][data-annotation-id]').evaluateAll(nodes=>[...new Set(nodes.map(node=>node.dataset.annotationId))]);assert.deepEqual(ids,[source.id]);
      assert.equal(await field.inputValue(),source.contentMode==='formula'?(source.source||source.rawSource||''):source.text);assert.equal(await field.isVisible(),true);assert.equal(await field.isEnabled(),true);
    });
    await field.click();await field.fill('인라인 충돌 초안');
    const sent=(await h.pictures(page))[0].figure;
    await page.evaluate(({link,id})=>__candidateQA.state.update(s=>{const p=s.pages.find(p=>p.meta?.examLink?.tabId===link.tabId),objects=p.id===s.activePageId?s.objects:p.objects;objects.find(o=>o.id===id).text='원본 라벨 동시 수정';}),{link,id:source.id});
    await field.press('Tab');await arm(page,'inline-conflict-error',()=>document.querySelector('#exam-status')?.dataset.error==='true');await arrived(page,'inline-conflict-error');
    await ctx.check('actual focused stale annotation patch is preserved separately without native mutation',async()=>{assert.match(await page.locator('#exam-status').textContent(),/라벨.*보관/);assert.deepEqual((await h.pictures(page))[0].figure,sent);assert.equal((await linkedObjects(page,link)).find(o=>o.id===source.id).text,'원본 라벨 동시 수정');});
    await host.locator('[data-inline-action=apply]').click();await h.idle(page);await ctx.check('conflicted Apply retains attempted editor and sent figure',async()=>{assert.equal(await host.isVisible(),true);assert.deepEqual((await h.pictures(page))[0].figure,sent);});
    await host.locator('[data-inline-action=close]').click();await h.idle(page);
    const file=await examFile(ctx,page,'save','QA5-conflict-recovery.5e'),project=await parseFile(page,file),recovery=project.workspace.annotationDrafts.find(d=>d.id===sent.id);
    assert.ok(recovery);assert.equal(recovery.edited.find(o=>o.id===source.id).text,'인라인 충돌 초안');
    await bootSecondary(ctx,page,'QA5-conflict-actual-reopen',async reopened=>{
      await reopened.locator('#exam-workspace-open').click();await h.idle(reopened);
      await examCycle(reopened,()=>reopened.locator('#exam-project-file').setInputFiles(file));await h.doubleClick(reopened,0);const root=reopened.locator('#exam-inline-editor');await root.waitFor({state:'visible'});
      await ctx.check('actual file reopen displays rejected draft with persistent recovery notice, original doc unchanged',async()=>{assert.equal(await root.locator('.exam-inline-recovery').isVisible(),true);assert.match(await root.locator(`g[data-annotation-id="${source.id}"]`).textContent(),/인라인 충돌 초안/);assert.deepEqual((await h.pictures(reopened))[0].figure,sent);});
      await root.locator('[data-inline-action=close]').click();await h.idle(reopened);const retained=await examFile(ctx,reopened,'save','QA5-recovery-retained.5e');assert.deepEqual((await parseFile(reopened,retained)).workspace.annotationDrafts.find(d=>d.id===sent.id),recovery);
      await h.doubleClick(reopened,0);await root.locator('[data-inline-action=apply]').click();await root.waitFor({state:'hidden'});await h.idle(reopened);
      await ctx.check('explicit recovered Apply alone commits attempted label and keeps RAW unchanged',async()=>{const applied=(await h.pictures(reopened))[0].figure;assert.equal(applied.source.pages[0].objects.find(o=>o.id===source.id).text,'인라인 충돌 초안');assert.deepEqual(applied.source.pages[0].objects.filter(o=>o.type!=='labeler'),sent.source.pages[0].objects.filter(o=>o.type!=='labeler'));});
      const resolved=await examFile(ctx,reopened,'save','QA5-recovery-resolved.5e');assert.equal((await parseFile(reopened,resolved)).workspace.annotationDrafts?.some(d=>d.id===sent.id)||false,false);
      await h.action(reopened,'close');await reopened.locator('#ai-image-install-open').click();await unionEqual(ctx,await tabs(reopened),(await tabs(page)).filter(t=>rich.some(r=>r.id===t.id)),'actual recovery reopen rich union');
    },{fresh:true});
    const baseline={state:await fullState(page),pictures:await h.pictures(page)};
    for(const [mutation,boundary]of [['native-ticks-null','workspace'],['native-ticks-null','embedded'],['native-annotation-null','embedded'],['missing-asset','workspace'],['crc','workspace']]){
      const malformed=await corruptArchive(ctx,page,file,mutation,boundary);
      await examCycle(page,()=>page.locator('#exam-project-file').setInputFiles(malformed));
      await ctx.check(`${mutation}/${boundary}: actual RHWP loader rejects before mutation`,async()=>{assert.equal(await page.locator('#exam-status').getAttribute('data-error'),'true');assert.deepEqual(await fullState(page),baseline.state);assert.deepEqual(await h.pictures(page),baseline.pictures);});
    }
    ctx.cover('cancel-copy-foreign-conflict-corrupt');
  });
}
const portableQA5=scenarios.QA5;
scenarios.QA5=async ctx=>{await portableQA5(ctx);await rhwpNegatives(ctx);};

async function providerSettlement(ctx,page){
  const source=ctx.input('js/ai-panel.js','actual workflow finally emits settlement, without altering owner guards or returned data').toString();
  const hook='return {\n    deleteTask,',finish='if (imageLabelRunAbort === abort) imageLabelRunAbort = null;';assert.equal(source.split(hook).length-1,1);assert.ok(source.includes(finish));
  await page.route('**/js/ai-panel.js?*',route=>route.fulfill({contentType:'text/javascript',body:source.replace(hook,'return panel.__crossController = {\n    crossPersistence: taskPersistence, deleteTask,').replace(finish,finish+' window.__cross.providerSettlements=(window.__cross.providerSettlements||0)+1;window.__cross.notify();')}));
}
async function canceledOwners(ctx){
  for(const kind of ['cancel','close','dispose'])await app(ctx,'provider-owner-'+kind,async page=>{
    const h=require('./rhwp-exam.cjs'),label=await makeLabel(ctx,page,{verification:'full'}),rich=await richUnion(ctx,page,label);await sendAiFigure(ctx,page,'cross-label-task');await h.action(page,'close');await page.locator('#ai-image-install-open').click();
    const next=await prepareSend(ctx,page,'task-1','delayed provider owner '+kind,'restore-editable'),count=(await tabs(page)).find(t=>t.id==='task-1').generated.length;
    const sent=await h.pictures(page),baselineObjects=await objects(page),settled=await page.evaluate(()=>__cross.providerSettlements||0);let consumed=next+1;
    await arm(page,'owner-provider-settled',n=>(__cross.providerSettlements||0)>n,settled);
    if(kind==='cancel')await page.locator(panel+' [data-ai-interrupt]').click();
    if(kind==='close')await closeAI(page);
    if(kind==='dispose')await ctx.act('dispose actual owned controller while provider promise is held',()=>page.evaluate(()=>document.querySelector('#ai-image-panel').__crossController.dispose()),page);
    if(kind==='close'){
      consumed=await finishOwned(ctx,page,{task:'task-1',startIndex:next,before:count});await arrived(page,'owner-provider-settled');await checkpoint(ctx,page);
      await ctx.check('closed surviving owner may complete privately without RHWP insertion or focus theft',async()=>{assert.equal((await tabs(page)).find(t=>t.id==='task-1').generated.length,count+1);assert.equal(await page.locator(panel).isVisible(),false);assert.deepEqual(await h.pictures(page),sent);assert.deepEqual(await objects(page),baselineObjects);});
    }else{
      await arrived(page,'owner-provider-settled');const before=await workspace(page),durable=await stored(page),status=await page.locator(panel+' [data-ai-status]').textContent();
      await ctx.act('emit late real mock transport completion after owner '+kind,()=>respondTransport(page,next),page);await frames(page);
      await ctx.check(kind+': late event cannot adopt candidates, mutate document, write checkpoint, or overwrite status',async()=>{assert.deepEqual(await workspace(page),before);assert.deepEqual(await stored(page),durable);assert.deepEqual(await h.pictures(page),sent);assert.deepEqual(await objects(page),baselineObjects);assert.equal(await page.locator(panel+' [data-ai-status]').textContent(),status);assert.equal((await tabs(page)).find(t=>t.id==='task-1').generated.length,count);});
    }
    await unionEqual(ctx,await tabs(page),rich,'owner '+kind+': full rich union');
    await ctx.check(kind+': exact count equals explicitly completed actual transport turns',async()=>assert.equal(await page.evaluate(()=>__task2.sends.length),consumed));
  },{setupRoutes:page=>providerSettlement(ctx,page)});
  await app(ctx,'linked-send-wrong-owner-and-late-metadata',async page=>{
    const h=require('./rhwp-exam.cjs'),label=await makeLabel(ctx,page,{verification:'full'});await richUnion(ctx,page,label);await sendAiFigure(ctx,page,'cross-label-task');await h.originalEdit(page,0);await selectTask(ctx,page,'cross-graph-task');
    const before=await h.pictures(page),source=await objects(page),calls=await page.evaluate(()=>__task2.sends.length);
    await examCycle(page,()=>page.locator('#exam-send').click());const dialog=page.getByRole('dialog',{name:'시험지 보내기'});await dialog.waitFor({state:'visible'});
    await ctx.check('actual linked source Send rejects foreign active AI task before mutation/provider submission',async()=>{assert.match(await dialog.textContent(),/원래.*AI.*작업 탭|연결/);assert.deepEqual(await h.pictures(page),before);assert.deepEqual(await objects(page),source);assert.equal(await page.evaluate(()=>__task2.sends.length),calls);});await dialog.getByRole('button',{name:'확인',exact:true}).click();
    await selectTask(ctx,page,'cross-label-task');await closeAI(page);const originalMeta=await page.evaluate(()=>structuredClone(__candidateQA.state.get().pages.find(p=>p.id===__candidateQA.state.get().activePageId).meta));
    await page.evaluate(()=>{
      const original=HTMLCanvasElement.prototype.toBlob;__cross.lateExport=Promise.withResolvers();
      HTMLCanvasElement.prototype.toBlob=function(callback,...args){const canvas=this;HTMLCanvasElement.prototype.toBlob=original;__cross.releaseLateExport=()=>original.call(canvas,callback,...args);__cross.lateExport.resolve();};
      __cross.disposers.push(()=>{HTMLCanvasElement.prototype.toBlob=original;});
    });
    await page.evaluate(()=>document.querySelector('#exam-send').click());await page.evaluate(()=>__cross.deadline(__cross.lateExport.promise,'actual source export held before link change'));
    await page.evaluate(()=>__candidateQA.state.update(s=>{const p=s.pages.find(p=>p.id===s.activePageId);p.meta.examLink={...p.meta.examLink,assetId:'foreign-late-asset'};}));
    const edited=await fullState(page);await page.evaluate(()=>__cross.releaseLateExport());await h.idle(page);
    await ctx.check('held source raster completion rechecks current metadata ownership before native replacement',async()=>{assert.equal(await page.locator('#exam-status').getAttribute('data-error'),'true');assert.deepEqual(await h.pictures(page),before);assert.deepEqual(await fullState(page),edited);assert.equal(await page.evaluate(()=>__task2.sends.length),calls);});
    await page.evaluate(meta=>__candidateQA.state.update(s=>{s.pages.find(p=>p.id===s.activePageId).meta=meta;}),originalMeta);
  });ctx.cover('canceled-disposed-wrong-link');
}
const sendQA6=scenarios.QA6;
scenarios.QA6=async ctx=>{await sendQA6(ctx);await canceledOwners(ctx);};

function controlledPdf(content){
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`];
  let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((body,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${body}\nendobj\n`;});
  const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`+offsets.slice(1).map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(pdf);
}
function distinctPdfPack(ctx){
  const base=retryPack(ctx),pdfs={
    '기출문제/물리1/p1_2025_11.pdf':controlledPdf('0 0 0 RG 4 w 35 35 230 330 re S\nBT /F1 24 Tf 45 300 Td (1. CROSS PDF ALPHA) Tj ET\n'),
    '기출문제/물리1/p1_2024_11.pdf':controlledPdf('0 0 1 rg 30 30 240 340 re f\n0 0 0 RG 5 w 30 30 m 270 370 l S\nBT /F1 20 Tf 40 300 Td (1. CROSS PDF BETA) Tj ET\n'),
  };
  base.catalog.documents=Object.keys(pdfs).map((relative,i)=>({...clone(base.catalog.documents[0]),id:`cross-pdf-${i?'B':'A'}`,title:path.basename(relative),source:{kind:'pack',locator:'5e.shared.drive/'+relative,displayName:path.basename(relative)}}));
  base.search.entries=base.catalog.documents.map((doc,i)=>({documentId:doc.id,pageNumber:1,itemId:'cross-q-'+i,itemNumber:1,text:'CROSS PDF '+(i?'BETA':'ALPHA'),normalized:'cross pdf '+(i?'beta':'alpha'),metadata:{documentCode:i?'p1_2024_11':'p1_2025_11',academicYear:i?2024:2025,administration:'11',subject:'p1'},source:{documentId:doc.id,pageNumber:1,rect:[.08,.08,.84,.84],fullPageFallback:false}}));
  base.pack={...base.pack,version:'controlled-two-distinct-pdf-cross-v1',documentCount:2,pageCount:2,academicYears:[2024,2025],paths:{...base.pack.paths,documents:Object.keys(pdfs)}};
  base.checksums={algorithm:'sha256',pack:sha(json(base.pack)),files:{'catalog.json':sha(json(base.catalog)),'search-index.json':sha(json(base.search)),...Object.fromEntries(Object.entries(pdfs).map(([name,bytes])=>[name,sha(bytes)]))}};
  for(const [name,bytes]of Object.entries(pdfs)){const file=path.join(ctx.directory,'controlled-'+path.basename(name));fs.writeFileSync(file,bytes);ctx.file(file,'new controlled synthetic PDF; no historical PNG regeneration or quality claim');ctx.input(file,'controlled original test PDF, deliberately distinct geometry/text; actual PDF.js render');}
  assert.notEqual(sha(Object.values(pdfs)[0]),sha(Object.values(pdfs)[1]));return{...base,pdfs};
}
async function nodeDeadline(promise,name){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(name+' deadline')),30000);})]);}finally{clearTimeout(timer);}}
async function latePdf(ctx){
  const pack=distinctPdfPack(ctx),requests=[];
  await app(ctx,'late-distinct-PDF-preserves-current-reader',async page=>{
    const label=await makeLabel(ctx,page),rich=await richUnion(ctx,page,label);await selectTask(ctx,page,'cross-label-task');await insertSelected(ctx,page);await closeAI(page);const drawing=await fullState(page);
    await page.locator('#exam-library-open').click();await arm(page,'distinct-pdf-ready',()=>document.querySelector('.unified-library-overlay')?.dataset.searchReadiness==='ready',null,60000);await arrived(page,'distinct-pdf-ready');
    const ui=page.locator('.unified-library-overlay').last();await ui.locator('[data-unilib-query]').fill('CROSS PDF');await ui.locator('[data-unilib-query]').press('Enter');await ui.locator('[data-unilib-type=question]').click();
    const a=ui.locator('[data-result-kind=crop][data-result-id*="cross-pdf-A"]').first(),b=ui.locator('[data-result-kind=crop][data-result-id*="cross-pdf-B"]').first();await a.waitFor();await b.waitFor();
    const aId=await a.getAttribute('data-result-id');
    ctx.input('js/pdf-library/pack-identities.js','actual registered pack document identities; exact namespace retained, no unqualified ID fallback');
    const documentIds=await page.evaluate(async({version,pack})=>{
      const {materializePackDocument}=await import('/js/pdf-library/pack-identities.js'+version);
      return pack.catalog.documents.map(document=>materializePackDocument(pack.pack.id,pack.catalog,document).id);
    },{version,pack:{pack:pack.pack,catalog:pack.catalog}});
    // PDF fetch/open/render has one runtime scheduler. Hold only delivery of
    // the ACTUAL resolved old result after it leaves that scheduler, before the
    // original UI stale check. Both PDF bytes/renderers remain the real inputs.
    await page.evaluate(resultId=>{
      let release;
      const promise=new Promise(resolve=>{release=resolve;});
      __cross.pdfCompletionGate={resultId,entered:false,consumed:false,promise,release};
      __cross.disposers.push(()=>release());
    },aId);
    await arm(page,'old-PDF-resolver-delivery-held',()=>__cross.pdfCompletionGate?.entered===true,null,60000);
    await a.click();await arrived(page,'old-PDF-resolver-delivery-held');
    await ctx.check('real earlier PDF resolver completed before its UI result delivery was held',async()=>{
      const held=await page.evaluate(()=>({entered:__cross.pdfCompletionGate.entered,receipt:__cross.pdfCompletionGate.receipt}));
      assert.equal(held.entered,true);assert.equal(held.receipt.requestDocumentId,documentIds[0]);
      assert.equal(held.receipt.requestId,aId);assert.equal(held.receipt.resolvedDocumentId,documentIds[0]);
      assert.equal(held.receipt.resolvedId,aId);assert.equal(held.receipt.currentBeforeHold,true);
    });
    await b.click();const bId=await b.getAttribute('data-result-id');
    await arm(page,'pdf-B-preview',id=>document.querySelector(`[data-result-id="${CSS.escape(id)}"]`)?.getAttribute('aria-selected')==='true'&&document.querySelector('[data-unilib-stage] .unilib-preview-image img')?.naturalWidth>100,bId,60000);await arrived(page,'pdf-B-preview');
    await ui.locator('[data-unilib-adjust]').click();const image=ui.locator('[data-unilib-crop-image]');await image.waitFor();await image.evaluate(img=>img.decode());
    await arm(page,'pdf-B-original',()=>document.querySelector('[data-unilib-crop-image]')?.naturalWidth>=600&&document.querySelector('[data-unilib-crop-quality]')?.hidden,null,60000);await arrived(page,'pdf-B-original');
    for(let i=0;i<3;i++)await ui.locator('[data-unilib-crop-zoom-in]').click();
    const stage=ui.locator('[data-unilib-crop-stage]');await stage.evaluate(n=>{n.scrollTop=42;n.scrollLeft=23;n.dispatchEvent(new Event('scroll'));});
    const box=await stage.boundingBox();await page.mouse.move(box.x+box.width*.25,box.y+box.height*.25);await page.mouse.down();await page.mouse.move(box.x+box.width*.62,box.y+box.height*.62,{steps:4});await page.mouse.up();
    await arm(page,'current-crop-exact',()=>!document.querySelector('[data-unilib-crop-save]').disabled);await arrived(page,'current-crop-exact');
    const readerState=()=>page.evaluate(()=>{const ui=document.querySelector('.unified-library-overlay'),stage=ui.querySelector('[data-unilib-crop-stage]'),image=ui.querySelector('[data-unilib-crop-image]'),box=ui.querySelector('[data-unilib-crop-box]');return{query:ui.querySelector('[data-unilib-query]').value,selected:ui.querySelector('[data-result-id][aria-selected=true]')?.dataset.resultId,zoom:ui.querySelector('[data-unilib-crop-zoom]').textContent,scroll:[stage.scrollLeft,stage.scrollTop],region:box.getAttribute('style'),image:image.src,size:[image.naturalWidth,image.naturalHeight],page:ui.querySelector('[data-unilib-crop]').dataset.pdfPage};});
    const before=await readerState();await arm(page,'old-pdf-resolver-settled',()=>__cross.pdfCompletionGate?.receipt?.settled===true);
    await ctx.act('release actual earlier PDF resolver delivery after current document crop/zoom/scroll',()=>page.evaluate(()=>__cross.pdfCompletionGate.release()),page);await arrived(page,'old-pdf-resolver-settled');await frames(page);
    await ctx.check('actual original stale-result guard rejects the released prior PDF result',async()=>{
      assert.equal(await page.evaluate(()=>__cross.pdfCompletionGate.receipt.currentAfterHold),false);
    });
    await ctx.check('late previous PDF completion preserves query, selected source, original pixels, zoom, crop region and scroll',async()=>{assert.deepEqual(await readerState(),before);assert.equal(before.query,'CROSS PDF');assert.equal(before.selected,bId);assert.notEqual(before.zoom,'100%');assert.ok(before.scroll[0]>0&&before.scroll[1]>0);assert.ok(before.region);assert.deepEqual(await fullState(page),drawing);});
    await ui.locator('[data-unilib-crop-save]:not([disabled])').click();const thumb=ui.locator('.unilib-crop-collection-thumb').first();await thumb.waitFor();const data=await thumb.getAttribute('src'),crop=pngBytes(data),file=path.join(ctx.directory,'QA7-distinct-B-original-crop.png');fs.writeFileSync(file,crop);ctx.file(file,'actual current original PDF crop');
    await ctx.check('new current PDF crop has original-resolution visible colored geometry, not old monochrome PDF',()=>{const png=decodePng(crop);assert.ok(png.width>100&&png.height>100);let blue=0;for(let i=0;i<png.data.length;i+=4)if(png.data[i+2]>png.data[i]+60&&png.data[i+2]>png.data[i+1]+60)blue++;assert.ok(blue>100,'Actual B crop must contain deliberate blue rectangle');});
    const requestCount=await page.evaluate(()=>__task2.sends.length);
    const savedCrop=ui.locator('[data-unilib-crop-collection] [data-unilib-graph-crop]');
    assert.equal(await savedCrop.count(),1,'Exactly the current B original crop is available');
    await ctx.act('select actual saved B crop and commit it to library workbench',async()=>{
      await savedCrop.click();assert.ok((await savedCrop.getAttribute('class')).split(/\s+/).includes('is-selected'));
      await ui.locator('[data-unilib-crop-workbench]:not([disabled])').click();
      await ui.locator('[data-unilib-crop]').waitFor({state:'hidden'});
    },page);
    await ctx.check('real workbench commit retains exact saved B crop and enables its AI route without generation',async()=>{
      assert.equal(await ui.locator('[data-unilib-crop-tray-miniatures] img').first().getAttribute('src'),data);
      assert.equal(await ui.locator('[data-unilib-ai]').isEnabled(),true);
      assert.equal(await page.evaluate(()=>__task2.sends.length),requestCount);
      assert.deepEqual(await fullState(page),drawing);
    });
    await arm(page,'current-original-crop-staged',async data=>(await __task2Manager.sharingSnapshot()).workspaces.some(w=>w.tabs.some(t=>t.attachments.some(a=>a.data===data))),data);
    await require('./ai-login-resume-fixture.cjs').sendLibrary(page,ui,{count:1,placement:'separate',conversionKind:'image'});await arrived(page,'current-original-crop-staged');
    await ctx.check('actual library assignment stages current original-resolution crop with correct document provenance and zero generation',async()=>{
      const snapshot=await workspace(page),attachment=snapshot.workspaces.flatMap(w=>w.tabs).flatMap(t=>t.attachments).find(a=>a.data===data);assert.ok(attachment);
      assert.equal(attachment.source.documentId,documentIds[1]);assert.equal(attachment.source.pageNumber,1);assert.equal(await page.evaluate(()=>__task2.sends.length),requestCount);assert.deepEqual(await objects(page),drawing.objects);
    });await unionEqual(ctx,await tabs(page),rich,'late PDF actual unrelated rich union');
    ctx.write('QA7-distinct-pdf-reader.json',{before,requests,syntheticDistinctOriginals:true,historicalQualityClaim:false,holdKind:'actual completed resolver delivery outside serial PDF runtime lock',held:await page.evaluate(()=>__cross.pdfCompletionGate.receipt)});ctx.cover('pdf-late-two-page-preservation');
  },{setupRoutes:async page=>{
    const source=ctx.input('js/unified-library-ui.js','actual asynchronous resolver finally observation; stale-selection guard remains original').toString();
    const end='  }\n}\n\nfunction loadSourceState(storage) {';assert.ok(source.includes(end));
    const entry='export async function resolveLibraryPreviewResult(result, resolveResult, isCurrent) {';
    assert.equal(source.split(entry).length,2,'Actual resolver observation entry changed');
    const resolvedBoundary='    const resolved = await resolveResult(result);';
    assert.equal(source.split(resolvedBoundary).length,2,'Actual PDF resolver completion boundary changed; re-audit required');
    const hold=resolvedBoundary+`
    const gate=window.__cross?.pdfCompletionGate;
    if(gate && !gate.consumed && result.id===gate.resultId){
      gate.consumed=true;
      gate.receipt={requestId:result.id,requestDocumentId:result.provenance?.documentId,
        requestProvenance:structuredClone(result.provenance),requestSource:structuredClone(result.source),
        resolvedId:resolved.id,resolvedDocumentId:resolved.provenance?.documentId,
        resolvedProvenance:structuredClone(resolved.provenance),resolvedSource:structuredClone(resolved.source),currentBeforeHold:isCurrent()};
      crossHeldReceipt=gate.receipt;
      gate.entered=true;window.__cross.notify();
      await gate.promise;
      gate.receipt.currentAfterHold=isCurrent();
    }`;
    const observed=source.replace(entry,entry+'\n  let crossHeldReceipt=null;').replace(resolvedBoundary,hold).replace(end,'  } finally {if(crossHeldReceipt)crossHeldReceipt.settled=true;window.__cross.pdfSettled ||= [];window.__cross.pdfSettled.push({resultId:result.id,provenance:structuredClone(result.provenance),held:Boolean(crossHeldReceipt)});window.__cross.notify();}\n}\n\nfunction loadSourceState(storage) {');
    ctx.result.inputs.push({provenance:'held actual prior PDF resolver delivery after scheduler completion; original resolve await and stale return remain unchanged',originalSha256:sha(source),instrumentedSha256:sha(observed),seams:[entry,resolvedBoundary.trim(),end]});
    await page.route('**/js/unified-library-ui.js?*',route=>route.fulfill({contentType:'text/javascript',body:observed}));
    await page.context().route('**/assets/pdf-library/catalog-bootstrap.json',route=>route.fulfill({status:404,body:'controlled two document catalog'}));
    await page.context().route('https://5e-google-drive-gateway.5e-desktop.workers.dev/**',async route=>{
      const pathname=decodeURIComponent(new URL(route.request().url()).pathname);requests.push(pathname);const relative=Object.keys(pack.pdfs).find(name=>pathname.endsWith(name));
      const body=relative?pack.pdfs[relative]:pathname.endsWith('/pack.json')?json(pack.pack):pathname.endsWith('/checksums.json')?json(pack.checksums):pathname.endsWith('/catalog.json')?json(pack.catalog):pathname.endsWith('/search-index.json')?json(pack.search):null;
      assert.ok(body,'Unexpected fixture request '+pathname);return route.fulfill({contentType:relative?'application/pdf':'application/json',body});
    });
  }});
}
const filesQA7=scenarios.QA7;
scenarios.QA7=async ctx=>{await filesQA7(ctx);await latePdf(ctx);};

async function recoveryAndTransfer(ctx){
  await app(ctx,'broken-cache-aborted-save-interrupted-second-tab',async page=>{
    const label=await makeLabel(ctx,page),rich=await richUnion(ctx,page,label);
    await selectTask(ctx,page,'task-1');await checkpoint(ctx,page);const old=await stored(page);
    await page.evaluate(async({label,version})=>{
      const {IndexedDBOutputCacheBackend}=await import('/js/ai-output-cache-store.js'+version),backend=new IndexedDBOutputCacheBackend({databaseName:'5e-ai-label-background'});
      const record=await backend.get(label.workflowMetrics.generationHarness.key);if(!record)throw new Error('Missing actual RAW cache');record.output.imageLabelBackground.data=__task2.original;await backend.put(record);
      const owner=JSON.parse(localStorage.getItem('5e.aiActiveTask.v1')||'null'),row=document.querySelector('#ai-image-panel .ai-task-tab.is-on');
      if(owner?.taskId!=='task-1'||row?.dataset.tabId!==owner.taskId||(row.dataset.aiWorkspaceLink==='legacy'?'':row.dataset.aiWorkspaceLink)!==owner.scope)throw new Error('Abort injection requires the exact active task workspace');
      const databaseName='5e.preview:5e-ai-image-tasks'+(owner.scope?'-'+owner.scope:'');
      const put=IDBObjectStore.prototype.put;__cross.abortWrite={enabled:true,hits:0,databaseName};IDBObjectStore.prototype.put=function(value,...args){const req=put.call(this,value,...args);if(__cross.abortWrite.enabled&&this.transaction.db.name===__cross.abortWrite.databaseName&&this.name==='tasks'){__cross.abortWrite.hits++;this.transaction.abort();}return req;};__cross.disposers.push(()=>{IDBObjectStore.prototype.put=put;});
    },{label,version});
    await page.locator(panel+' [data-ai-input]').fill('저장 실패 후 남아야 할 실제 입력');const memory=await workspace(page),count=await page.evaluate(()=>__task2.sends.length);
    const failure=await page.evaluate(async()=>{try{await __task2Manager.checkpointForClose();return null;}catch(error){return{name:error.name,message:error.message};}});
    await ctx.check('actual IndexedDB abort preserves every draft field, appends its exact storage warning, retains previous durable state and makes zero requests',async()=>{
      assert.ok(failure);assert.ok(await page.evaluate(()=>__cross.abortWrite.hits>0));
      const expected=clone(memory),task=expected.workspaces[expected.activeWorkspace].tabs.find(tab=>tab.id==='task-1');assert.ok(task);
      const warning={kind:'error',text:`작업 임시저장 실패: ${failure.message}. 창을 새로고침하지 마세요.`};task.uiMessages.push(warning);
      assert.deepEqual(await workspace(page),expected);assert.deepEqual(await stored(page),old);assert.equal(await page.evaluate(()=>__task2.sends.length),count);assert.ok((await page.locator(panel).textContent()).includes(warning.text));
      ctx.write('actual-aborted-checkpoint-warning.json',{failure,warning,owner:'task-1',expectedMemory:expected});
    });
    await page.evaluate(()=>{__cross.abortWrite.enabled=false;});await checkpoint(ctx,page);
    const next=await prepareSend(ctx,page,'task-1','interrupted held provider request after real abort','restore-editable');await checkpoint(ctx,page);
    const running=(await tabs(page)).find(t=>t.id==='task-1');assert.equal(running.workState,'busy');assert.ok(running.inFlightRequest);
    await bootSecondary(ctx,page,'QA8-interrupted-second-tab',async second=>{
      await second.locator('#ai-image-install-open').click();const restored=(await tabs(second)).find(t=>t.id==='task-1');
      await ctx.check('second owned tab recovers busy task as interrupted, retains bound retry and does not auto-send/approve corrupt cache',async()=>{assert.equal(restored.workState,'interrupted');assert.equal(restored.inFlightRequest,null);assert.deepEqual(restored.retryRequest,running.inFlightRequest);assert.deepEqual(restored.generated,running.generated);assert.equal(restored.input,running.input);assert.equal(await second.locator(panel).getAttribute('data-ai-busy'),'false');});
      await unionEqual(ctx,await tabs(second),rich,'broken cache/aborted write/recovery full mixed union');
    });
    await page.locator(panel+' [data-ai-interrupt]').click();await respondTransport(page,next);await checkpoint(ctx,page);await unionEqual(ctx,await tabs(page),rich,'original owner after second-tab recovery');
  });
  await armedReplacement(ctx,'QA8-armed-debounce-during-recovery');
  ctx.cover('corrupt-cache-abort-recovery');
  await app(ctx,'explicit-real-file-other-origin-transfer',async page=>{
    const label=await makeLabel(ctx,page),rich=await richUnion(ctx,page,label);await selectTask(ctx,page,'cross-label-task');await insertSelected(ctx,page);await page.locator('#ai-image-install-open').click();await selectTask(ctx,page,'cross-graph-task');await insertSelected(ctx,page);
    // The controlled native graph fixture omits historical file-open defaults.
    // Establish those defaults BEFORE the save baseline, and independently
    // prove that migration preserved every previously present object field.
    // The actual chooser import must then match the entire scene exactly.
    const originalScene=await objects(page);
    await page.evaluate(async version=>{
      const {serialize,prepareLoadedProject}=await import('/js/project-io.js'+version),state=__candidateQA.state;
      const prepared=prepareLoadedProject(structuredClone(serialize(state.get())));
      state.update(s=>{s.objects=prepared.active.objects;s.groups=prepared.groups;});
    },version);
    const scene=await objects(page);
    await ctx.check('canonical transfer fixture retains every existing native object field before its save baseline',()=>{
      assert.equal(scene.length,originalScene.length);
      assert.deepEqual(scene.map(o=>o.id),originalScene.map(o=>o.id),'native draw order must be unchanged before the baseline');
      for(const original of originalScene){const actual=scene.find(o=>o.id===original.id);assert.ok(actual);for(const [key,value] of Object.entries(original))assert.deepEqual(actual[key],value,`${original.id}.${key}`);}
    });
    ctx.write('QA8-transfer-native-fixture-defaults.json',{originalScene,canonicalScene:scene,existingFieldsPreserved:true,baselineEstablishedBeforeSave:true});
    assert.ok(scene.some(o=>o.type==='labeler'));assert.ok(scene.some(o=>o.type==='coordplane'));assert.ok(scene.some(o=>o.type==='funcgraph'));
    const file=await drawingFile(ctx,page,'QA8-explicit-origin-transfer'),source=await workspace(page),alternate=new URL(process.env.CROSS_TRANSFER_URL);
    ctx.write('QA8-explicit-transfer-origins.json',{source:new URL(ctx.report.url).origin,target:alternate.origin,transport:'two actual loopback preview servers; no Host/CORS guard relaxation or storage migration'});
    await bootSecondary(ctx,page,'QA8-other-origin-actual-file',async target=>{
      await ctx.check('alternate server has distinct actual origin and initially no source-owner tabs',async()=>{assert.equal(await target.evaluate(()=>location.origin),alternate.origin);assert.notEqual(alternate.origin,new URL(ctx.report.url).origin);assert.ok(!(await tabs(target)).some(t=>rich.some(r=>r.id===t.id)));});
      await openDrawing(ctx,target,file);await ctx.check('explicit real file chooser transfers native scene across origin exactly',async()=>assert.deepEqual(await objects(target),scene));await unionEqual(ctx,await tabs(target),rich,'actual other-origin file hydration');
      await ctx.check('other-origin import preserves source-origin owners',async()=>assert.deepEqual(await workspace(page),source));
    },{fresh:true,url:alternate.href});ctx.cover('explicit-other-origin-transfer');
  });
}
const layoutQA8=scenarios.QA8;
scenarios.QA8=async ctx=>{await layoutQA8(ctx);await recoveryAndTransfer(ctx);await realBrowserZoom(ctx);};

// True desktop page zoom. Primary sources for the installed, pinned backend:
// https://github.com/microsoft/playwright/blob/v1.62.1/browser_patches/webkit/patches/bootstrap.diff
// InspectorPlaywrightAgent::setPageZoomFactor calls WebPageProxy::setPageZoomFactor.
// https://playwright.dev/docs/chrome-extensions (persistent context/full channel)
// https://developer.chrome.com/docs/extensions/reference/api/tabs#method-setZoom
// Chrome's automatic mode performs browser zoom; manual mode is NEVER used here.
function zoomReceipt(ctx, name, value) {
  const file = ctx.write(name, value); ctx.file(file, 'true-browser-zoom-JSON-evidence'); return file;
}

function zoomRuntime(ctx) {
  const entry = require.resolve(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const corePackage = require.resolve('playwright-core/package.json', { paths: [path.dirname(entry)] });
  const core = path.dirname(corePackage), metadata = JSON.parse(ctx.input(corePackage, 'installed pinned Playwright package identity; read-only').toString());
  assert.equal(metadata.version, '1.62.1', 'Reconcile the zoom backend before using another Playwright version');
  const registry = JSON.parse(ctx.input(path.join(core, 'browsers.json'), 'installed pinned full Chromium/WebKit revision registry').toString());
  ctx.input(path.join(core, 'lib/coreBundle.js'), 'actual installed in-process connection and WKSession source; no dependency patch');
  const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const chromium = registry.browsers.find(b => b.name === 'chromium'), webkit = registry.browsers.find(b => b.name === 'webkit');
  assert.equal(chromium.revision, '1234'); assert.equal(chromium.browserVersion, '151.0.7922.34'); assert.equal(webkit.revision, '2336');
  return { playwright, core, metadata, chromium, webkit };
}

function chromiumZoomExtension() {
  // No tabs/host/activeTab permissions, content scripts, requests, or real profile.
  // A sole tab in this private browser is identified by ID, without reading its
  // permission-protected URL/title. The Node side independently checks that its
  // one actual page is the canonical candidate entry before every zoom call.
  return {
    manifest: { manifest_version: 3, name: 'Private four-session page zoom probe', version: '1.0.0',
      permissions: [], host_permissions: [], background: { service_worker: 'worker.js' } },
    worker: "'use strict';\nglobalThis.__crossZoomEvents=[];\nchrome.runtime.onInstalled.addListener(()=>{});\nchrome.tabs.onZoomChange.addListener(info=>globalThis.__crossZoomEvents.push(info));\n",
  };
}

function adaptChromiumZoomFixture(source) {
  const substitutions = [
    ['browser=await engine.launch({headless:true});', 'browser=await module.crossZoom.launch(engine,browserContextOptions);'],
    ['const browserContext=await browser.newContext({viewport:{width:1440,height:1000},...browserContextOptions});', 'const browserContext=module.crossZoom.context;'],
    ['const page=await browserContext.newPage();page.setDefaultTimeout(10000);', 'const page=browserContext.pages()[0] || await browserContext.newPage();page.setDefaultTimeout(10000);'],
  ];
  for (const [original, replacement] of substitutions) {
    assert.equal(source.split(original).length, 2, 'Exact retained fixture launch seam changed: ' + original);
    source = source.replace(original, replacement);
  }
  return source;
}

function isolatedChromiumZoomFixture(ctx, workflow, directory) {
  const { playwright, chromium } = zoomRuntime(ctx), Module = require('node:module');
  const fixturePath = path.join(root, 'tests/fixtures/ai-image-label-workflow.cjs');
  const source = ctx.input(fixturePath, 'retained real fixture with only three in-memory isolated-launch seams adapted; all UI/transport/assertions retained').toString();
  const instrumented = adaptChromiumZoomFixture(source), extension = chromiumZoomExtension();
  const adapted = new Module(fixturePath, module); adapted.filename = fixturePath; adapted.paths = Module._nodeModulePaths(path.dirname(fixturePath));
  // Compile/import before allocating anything, without calling the fixture.
  // A syntax/dependency failure must not leak an owned directory or browser.
  adapted._compile(instrumented, fixturePath);
  const owned = fs.mkdtempSync(path.join(directory, 'owned-zoom-'));
  const profile = path.join(owned, 'profile'), extensionDir = path.join(owned, 'extension');
  fs.mkdirSync(profile); fs.mkdirSync(extensionDir);
  const manifestFile = path.join(extensionDir, 'manifest.json'), workerFile = path.join(extensionDir, 'worker.js');
  fs.writeFileSync(manifestFile, JSON.stringify(extension.manifest, null, 2)); fs.writeFileSync(workerFile, extension.worker);
  ctx.input(manifestFile, 'new controlled MV3 probe, private task-owned temporary extension, zero declared permissions');
  ctx.input(workerFile, 'new controlled probe observes actual browser zoom events only; no provider/auth/network');
  const launchOptions = { headless: true, channel: 'chromium', ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`] };
  zoomReceipt(ctx, 'QA8-chromium-private-zoom-launch.json', { generatedAtRuntime: true, noRealProfile: true,
    profile, extensionDir, manifest: extension.manifest, worker: extension.worker, launchOptions,
    pinnedBrowser: chromium, executablePath: playwright.chromium.executablePath(),
    originalFixtureSha256: sha(source), adaptedFixtureSha256: sha(instrumented), seamsChanged: 3,
    remainingFixtureBehavior: 'original actual boot/transport/UI/runtime assertions and teardown',
    primarySources: ['https://playwright.dev/docs/chrome-extensions', 'https://developer.chrome.com/docs/extensions/reference/api/tabs#method-setZoom'] });
  let context, browser;
  adapted.crossZoom = {
    get context() { return context; },
    async launch(engine, browserContextOptions) {
      assert.equal(engine, playwright.chromium); assert.equal(ctx.engine, 'chromium');
      context = await engine.launchPersistentContext(profile, { viewport: { width: 1440, height: 1000 }, ...browserContextOptions, ...launchOptions });
      browser = context.browser(); assert.ok(browser);
      assert.ok(context.pages().length <= 1, 'Private launch must have at most its initial blank tab');
      for (const page of context.pages()) assert.equal(page.url(), 'about:blank');
      return browser;
    },
  };
  return {
    async fixture(test, count, evidence, options) {
      const beforeNavigate = options.beforeNavigate;
      return adapted.exports.fixture(test, count, evidence, { ...options, beforeNavigate: async page => {
        await workflow.installLabelSourcePage(page); if (beforeNavigate) await beforeNavigate(page);
      } });
    },
    async cleanup() {
      let error;
      try { if (browser?.isConnected()) await context.close(); }
      catch (caught) { error = caught; }
      try { if (browser?.isConnected()) await browser.close(); }
      catch (caught) { error ||= caught; }
      if (!browser?.isConnected()) fs.rmSync(owned, { recursive: true });
      const proof = { ownedDirectory: owned, contextClosed: !browser?.isConnected(),
        temporaryProfileRemoved: !fs.existsSync(profile), temporaryExtensionRemoved: !fs.existsSync(extensionDir),
        realProfileTouched: false, externallyInstalledExtension: false, error: error?.message };
      ctx.result.cleanup.push(proof); zoomReceipt(ctx, 'QA8-chromium-private-zoom-cleanup.json', proof);
      assert.equal(proof.contextClosed, true); assert.equal(proof.temporaryProfileRemoved, true); assert.equal(proof.temporaryExtensionRemoved, true);
      if (error) throw error;
    },
  };
}

async function browserZoomDriver(ctx, page) {
  const runtime = zoomRuntime(ctx);
  if (ctx.engine === 'webkit') {
    const executable = runtime.playwright.webkit.executablePath();
    assert.equal(path.basename(path.dirname(executable)), 'webkit-2336', 'Actual selected WebKit revision must match the inspected protocol');
    const protocolFile = path.join(path.dirname(executable), 'protocol.json');
    const domains = JSON.parse(ctx.input(protocolFile, 'actual selected WebKit binary protocol; true page zoom, not CDP/pinch').toString());
    const zoom = domains.find(d => d.domain === 'Playwright')?.commands.find(c => c.name === 'setPageZoomFactor');
    assert.ok(zoom, 'Missing true WebKit page zoom command');
    assert.deepEqual(zoom.parameters.map(p => p.name), ['pageProxyId', 'zoomFactor']);
    const impl = page._connection?.toImpl?.(page), proxy = impl?.delegate?._pageProxySession;
    assert.ok(proxy?.sessionId && typeof proxy.connection?.browserSession?.send === 'function', 'Pinned in-process WebKit page/session access is required');
    zoomReceipt(ctx, 'QA8-webkit-true-zoom-backend.json', { executable, protocolFile, zoom,
      pageProxyId: proxy.sessionId, command: 'Playwright.setPageZoomFactor',
      backend: 'InspectorPlaywrightAgent -> WebPageProxy.setPageZoomFactor',
      primarySource: 'https://github.com/microsoft/playwright/blob/v1.62.1/browser_patches/webkit/patches/bootstrap.diff#L11612',
      publicPlaywrightZoomApi: false, privatePinnedBackend: true, nativeSafariClaim: false });
    return { kind: 'WebKit WebPageProxy page zoom', async set(factor) {
      const params = { pageProxyId: proxy.sessionId, zoomFactor: factor };
      await proxy.connection.browserSession.send('Playwright.setPageZoomFactor', params);
      return { command: 'Playwright.setPageZoomFactor', params, acknowledged: true, backendGetter: 'not exposed; independent DOM/DPR/reflow assertions required' };
    } };
  }
  assert.equal(ctx.engine, 'chromium');
  const context = page.context(), existing = context.serviceWorkers().filter(w => w.url().startsWith('chrome-extension://'));
  assert.ok(existing.length <= 1, 'Only the task-owned probe extension is allowed');
  const worker = existing[0] || await context.waitForEvent('serviceworker', { predicate: w => w.url().startsWith('chrome-extension://'), timeout: 30000 });
  assert.equal(new URL(worker.url()).pathname, '/worker.js');
  async function soleTab() {
    assert.deepEqual(context.pages(), [page], 'Zoom must target the sole actual product page in the private context');
    assert.equal(new URL(page.url()).origin, new URL(ctx.report.url).origin); assert.equal(new URL(page.url()).pathname, '/');
    return worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({});
      if (tabs.length !== 1) throw new Error('Expected one task-owned tab, received ' + tabs.length);
      const id = tabs[0].id;
      return { tabId: id, factor: await chrome.tabs.getZoom(id), settings: await chrome.tabs.getZoomSettings(id) };
    });
  }
  const initial = await soleTab(); assert.equal(initial.factor, 1);
  await worker.evaluate(id => chrome.tabs.setZoomSettings(id, { mode: 'automatic', scope: 'per-tab' }), initial.tabId);
  zoomReceipt(ctx, 'QA8-chromium-true-zoom-backend.json', { worker: worker.url(), initial, extensionPermissions: [],
    commands: ['chrome.tabs.setZoomSettings', 'chrome.tabs.setZoom', 'chrome.tabs.getZoom', 'chrome.tabs.getZoomSettings'],
    completion: 'actual chrome.tabs.onZoomChange plus setZoom resolution', mode: 'automatic', scope: 'per-tab',
    fullBrowserVersion: context.browser().version(), primarySource: 'https://developer.chrome.com/docs/extensions/reference/api/tabs#method-setZoom', nativeSafariClaim: false });
  assert.equal(context.browser().version(), runtime.chromium.browserVersion);
  return { kind: 'Chrome tabs automatic page zoom', async set(factor) {
    const before = await soleTab();
    assert.equal(before.settings.mode, 'automatic'); assert.equal(before.settings.scope, 'per-tab');
    const receipt = await worker.evaluate(async ({ tabId, factor }) => {
      const old = await chrome.tabs.getZoom(tabId), eventsBefore = globalThis.__crossZoomEvents.length;
      if (Math.abs(old - factor) < 1e-6) return { tabId, factor: old, unchanged: true, settings: await chrome.tabs.getZoomSettings(tabId), eventsBefore };
      let acknowledgement = false, event;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { cleanup(); reject(new Error('Actual chrome.tabs.onZoomChange deadline')); }, 30000);
        function cleanup() { clearTimeout(timer); chrome.tabs.onZoomChange.removeListener(onZoom); }
        function complete() { if (acknowledgement && event) { cleanup(); resolve(); } }
        function onZoom(info) { if (info.tabId === tabId && Math.abs(info.newZoomFactor - factor) < 1e-6) { event = info; complete(); } }
        chrome.tabs.onZoomChange.addListener(onZoom);
        chrome.tabs.setZoom(tabId, factor).then(() => { acknowledgement = true; complete(); }, error => { cleanup(); reject(error); });
      });
      return { tabId, requestedFactor: factor, factor: await chrome.tabs.getZoom(tabId), acknowledgement, event,
        settings: await chrome.tabs.getZoomSettings(tabId), events: globalThis.__crossZoomEvents.slice(eventsBefore) };
    }, { tabId: before.tabId, factor });
    assert.ok(Math.abs(receipt.factor - factor) < 1e-6); assert.equal(receipt.settings.mode, 'automatic'); assert.equal(receipt.settings.scope, 'per-tab');
    if (receipt.unchanged) assert.ok(Math.abs(before.factor - factor) < 1e-6);
    else {
      assert.equal(receipt.acknowledgement, true); assert.ok(Math.abs(receipt.event.oldZoomFactor - before.factor) < 1e-6);
      assert.ok(Math.abs(receipt.event.newZoomFactor - factor) < 1e-6);
    }
    return receipt;
  } };
}

async function zoomMetrics(page) {
  return page.evaluate(() => {
    const rect = node => { if (!node) return null; const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const controls = Object.fromEntries(['#exam-send', '#exam-workspace-open', '#ai-image-panel', '#canvas', '#gm-confirm', '#gm-cancel'].map(selector => {
      const node = document.querySelector(selector), style = node && getComputedStyle(node);
      return [selector, { rect: rect(node), display: style?.display, visibility: style?.visibility, fontSize: style?.fontSize, zoom: style?.zoom }];
    }));
    const vv = visualViewport;
    return { innerWidth, innerHeight, devicePixelRatio,
      visualViewport: vv && { width: vv.width, height: vv.height, scale: vv.scale, offsetLeft: vv.offsetLeft, offsetTop: vv.offsetTop },
      screen: { width: screen.width, height: screen.height, availWidth: screen.availWidth, availHeight: screen.availHeight },
      documentRect: rect(document.documentElement), bodyRect: rect(document.body), controls,
      rootZoom: getComputedStyle(document.documentElement).zoom, bodyZoom: getComputedStyle(document.body).zoom,
      rootTransform: getComputedStyle(document.documentElement).transform, bodyTransform: getComputedStyle(document.body).transform };
  });
}

function assertZoomMetrics(baseline, actual, factor, hostViewport) {
  // Independent inequalities reject command-only, CSS/DPR-only and pinch-only
  // substitutes. The same physical browser viewport must be retained throughout.
  const near = (actual, expected, tolerance, label) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected} (tolerance ${tolerance})`);
  assert.deepEqual(hostViewport.before, hostViewport.after, 'Browser viewport must not be resized as a zoom substitute');
  near(actual.innerWidth, baseline.innerWidth / factor, 2, 'actual CSS viewport width reflow');
  near(actual.innerHeight, baseline.innerHeight / factor, 2, 'actual CSS viewport height reflow');
  near(actual.documentRect.width, baseline.documentRect.width / factor, 2, 'getBoundingClientRect root width reflow');
  near(actual.devicePixelRatio, baseline.devicePixelRatio * factor, .01, 'native page zoom DPR');
  near(actual.visualViewport.scale, 1, .001, 'visualViewport.scale excludes pinch zoom');
  near(actual.visualViewport.width, actual.innerWidth, 2, 'visual versus layout viewport');
  for (const key of ['rootZoom', 'bodyZoom', 'rootTransform', 'bodyTransform']) assert.equal(actual[key], baseline[key], 'No CSS zoom/transform substitution: ' + key);
  assert.equal(Number.parseFloat(actual.rootZoom) || 1, 1); assert.equal(Number.parseFloat(actual.bodyZoom) || 1, 1);
  const canvas = actual.controls['#canvas'].rect;
  assert.ok(canvas && canvas.width > 0 && canvas.width <= actual.innerWidth && canvas.height > 0, 'Actual drawing canvas has reflowed within the zoomed viewport');
}

async function zoomDialogDiagnostics(ctx, page, phase) {
  const observation = await page.evaluate(() => {
    const describe = node => {
      if (!node) return null;
      const r = node.getBoundingClientRect(), s = getComputedStyle(node);
      return { tag: node.tagName, id: node.id, className: String(node.className), role: node.getAttribute('role'),
        ariaModal: node.getAttribute('aria-modal'), open: node.hasAttribute('open'), hidden: node.hidden,
        text: (node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160),
        rect: { x: r.x, y: r.y, width: r.width, height: r.height }, display: s.display, visibility: s.visibility,
        zIndex: s.zIndex, pointerEvents: s.pointerEvents, position: s.position, top: s.top, height: s.height,
        minHeight: s.minHeight, maxHeight: s.maxHeight, overflow: s.overflow, alignItems: s.alignItems };
    };
    const selectors = ['#exam-send', '#exam-workspace-open', '#ai-image-panel [data-ai-close]', '#ai-image-panel [data-ai-graph-edit]', '#gm-confirm', '#gm-cancel'];
    return { diagnosticOnly: true, bodyClass: document.body.className,
      sourceToolbarBottom: getComputedStyle(document.body).getPropertyValue('--exam-source-toolbar-bottom'),
      panelComputedTop: document.querySelector('#ai-image-panel') ? getComputedStyle(document.querySelector('#ai-image-panel')).top : null,
      viewport: { width: innerWidth, height: innerHeight },
      controls: selectors.map(selector => {
        const n = document.querySelector(selector), r = n?.getBoundingClientRect();
        const hit = r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null;
        return { selector, control: describe(n), hit: describe(hit), topmost: Boolean(n && (hit === n || n.contains(hit))),
          nearestHitDialog: describe(hit?.closest('[role="dialog"],dialog,.modal-overlay,#ai-image-panel,.capture-overlay')) };
      }),
      activeDialogs: [...document.querySelectorAll('[role="dialog"],dialog,.modal-overlay,#ai-image-panel,.capture-overlay,.modal-ai.ai-workbench')]
        .filter(n => { const r = n.getBoundingClientRect(), s = getComputedStyle(n); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'; }).map(describe),
      modalTopLayer: [...document.querySelectorAll('dialog')].filter(n => n.matches(':modal')).map(describe) };
  });
  zoomReceipt(ctx, `QA8-zoom-${phase}-dialogs-hit-tests.json`, observation);
}

async function changePageZoom(ctx, page, driver, baseline, viewport, factor, phase) {
  await page.evaluate(() => {
    if (!__cross.zoomResizeObserver) {
      const observer = new ResizeObserver(__cross.notify); observer.observe(document.documentElement);
      __cross.zoomResizeObserver = observer; __cross.disposers.push(() => observer.disconnect());
    }
  });
  await arm(page, 'true-page-zoom-' + phase, ({ width, height, dpr }) =>
    Math.abs(innerWidth - width) <= 2 && Math.abs(innerHeight - height) <= 2 && Math.abs(devicePixelRatio - dpr) <= .01 && Math.abs(visualViewport.scale - 1) <= .001,
    { width: baseline.innerWidth / factor, height: baseline.innerHeight / factor, dpr: baseline.devicePixelRatio * factor });
  const backend = await ctx.act(`${driver.kind}: actual factor ${factor}, no viewport/CSS/DPR/pinch mutation`, () => driver.set(factor), page);
  await arrived(page, 'true-page-zoom-' + phase); await frames(page);
  const actual = await zoomMetrics(page), hostViewport = { before: viewport, after: page.viewportSize() };
  zoomReceipt(ctx, `QA8-zoom-${phase}-metrics.json`, { baseline, actual, factor, hostViewport, backend });
  await ctx.check(`${phase}: native factor ${factor} independently changes DOM rectangles, CSS viewport and DPR while visualViewport scale stays one`,
    () => assertZoomMetrics(baseline, actual, factor, hostViewport));
  await ctx.shot(page, 'QA8-zoom-' + phase);
  await zoomDialogDiagnostics(ctx, page, phase);
  return actual;
}

async function realBrowserZoom(ctx) {
  await app(ctx, 'actual-browser-zoom-200', async page => {
    // RHWP Send requires the actual full verification workflow. A draft-first
    // candidate is intentionally blocked and cannot be promoted by a fixture flag.
    const h = require('./rhwp-exam.cjs'), label = await makeLabel(ctx, page, { verification: 'full' }), seedRich = await richUnion(ctx, page, label);
    const picture = await sendAiFigure(ctx, page, 'cross-label-task');
    await h.originalEdit(page, 0); await page.locator(panel).waitFor({ state: 'visible' });
    await selectTask(ctx, page, 'cross-graph-task');
    // The seeded inactive graph has not yet gone through captureActiveTaskTab.
    // Real capture/restore uses taskItemCopy and retains card:null. Establish the
    // complete baseline after that actual UI/capture/checkpoint boundary, keeping
    // this field and all original candidate fields in the later strict equality.
    ctx.input('js/ai-candidate-snapshot.js', 'actual taskItemCopy normalization provenance; no test-side field removal');
    await checkpoint(ctx, page);
    const rich = (await tabs(page)).filter(tab => seedRich.some(seed => seed.id === tab.id));
    await unionEqual(ctx, rich, seedRich, 'actual capture/checkpoint preserves every seeded rich field');
    await ctx.check('actual captured graph parent includes the production card:null normalization', () => {
      const graph = rich.find(tab => tab.id === 'cross-graph-task'); assert.ok(graph);
      for (const candidate of graph.generated) { assert.equal(Object.hasOwn(candidate, 'card'), true); assert.equal(candidate.card, null); }
    });
    const richBaseline = ctx.write('QA8-zoom-actual-captured-rich-baseline.json', rich); ctx.file(richBaseline, 'complete-actual-capture-checkpoint-rich-baseline');
    const driver = await browserZoomDriver(ctx, page), viewport = page.viewportSize(), baseline = await zoomMetrics(page);
    const calls = await page.evaluate(() => __task2.sends.length), source = await objects(page);
    let attempted = false, primaryError;
    zoomReceipt(ctx, 'QA8-zoom-baseline-metrics.json', { baseline, viewport, backend: driver.kind });
    await ctx.check('true page zoom starts at an unchanged 100% CSS viewport and no pinch', () => {
      assertZoomMetrics(baseline, baseline, 1, { before: viewport, after: page.viewportSize() });
      assert.ok(viewport && Math.abs(baseline.innerWidth - viewport.width) <= 2);
    });
    await ctx.shot(page, 'QA8-zoom-baseline');
    try {
      attempted = true; await changePageZoom(ctx, page, driver, baseline, viewport, 2, '200');
      for (const selector of [panel + ' [data-ai-close]', panel + ' [data-ai-graph-edit]'])
        await onScreen(ctx, page, selector, '200% actual essential control is visible and unobscured: ' + selector);
      const beforeCancel = await workspace(page);
      const focusBeforeOpening = await graphFocusReceipt(ctx, page, 'before-graph-open');
      const focusOpeningSequence = focusBeforeOpening.observations.at(-1).sequence;
      await ctx.act('200% actual graph child opens over source edit/AI', () => page.locator(panel + ' [data-ai-graph-edit]').click(), page);
      await page.locator('#graph-modal-overlay').waitFor({ state: 'visible' });
      const focusAtOpening = await graphFocusReceipt(ctx, page, 'actual-graph-open');
      await ctx.check('actual graph open captures the connected caller button before changing modal focus', () => {
        const observation = focusAtOpening.observations.find(item => item.sequence > focusOpeningSequence && item.phase === 'before-open');
        assert.ok(observation, 'Actual openGraphModal capture was not observed');
        assert.equal(observation.capturedTarget?.isGraphEditButton, true); assert.equal(observation.capturedTarget?.connected, true);
        assert.equal(observation.sameNode, true); assert.equal(observation.activeElement?.isGraphEditButton, true);
        assert.equal(observation.motion.supported, true, 'Actual animation state must be observable');
      });
      for (const selector of ['#gm-confirm', '#gm-cancel']) await onScreen(ctx, page, selector, '200% actual graph Apply/Cancel topmost: ' + selector);
      await page.keyboard.press('Tab');
      await ctx.check('200% actual Tab remains within the topmost graph child', async () => assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest('#graph-modal-overlay'))), true));
      await ctx.shot(page, 'QA8-zoom-200-graph-dialog');
      const cancelSequence = await page.evaluate(() => __cross.graphFocus.sequence);
      await arm(page, 'actual-graph-cancel-focus-return', sequence => {
        const observed = __cross.graphFocus.observations.some(item => item.sequence > sequence && item.phase === 'after-hide'
          && item.overlayHidden === true && item.sameNode && item.capturedTarget?.isGraphEditButton && item.capturedTarget.connected);
        return observed && document.activeElement === __cross.graphFocus.capturedTarget
          && document.activeElement === document.querySelector('#ai-image-panel [data-ai-graph-edit]');
      }, cancelSequence);
      await ctx.act('200% actual graph Cancel', () => page.locator('#gm-cancel').click(), page);
      await page.locator('#graph-modal-overlay').waitFor({ state: 'hidden' });
      await graphFocusReceipt(ctx, page, 'immediate-after-Cancel');
      try {
        await arrived(page, 'actual-graph-cancel-focus-return');
        // Await only actual animations already observed by the browser. A
        // cancellation settles its finished promise; the strict identity check
        // below still rejects any subsequent focus loss. No timing sleep/poll.
        await page.evaluate(() => __cross.deadline(Promise.allSettled(__cross.graphMotionAnimations()
          .filter(animation => animation.playState === 'running' || animation.pending).map(animation => animation.finished)), 'actual graph close motion completion'));
      } finally { await graphFocusReceipt(ctx, page, 'completed-after-Cancel'); }
      await ctx.check('200% graph Cancel preserves the complete rich workspace and native source', async () => {
        assert.deepEqual(await workspace(page), beforeCancel); assert.deepEqual(await objects(page), source);
        assert.equal(await page.locator(panel + ' [data-ai-graph-edit]').evaluate(n => document.activeElement === n), true);
        assert.equal(await page.evaluate(() => document.activeElement === __cross.graphFocus.capturedTarget && __cross.graphFocus.capturedTarget.isConnected), true);
      });
      const originalGraph = rich.find(t => t.id === 'cross-graph-task'), revision = await editGraph(ctx, page, '200% 교차 그래프', { beforeConfirm: async () => {
        await onScreen(ctx, page, '#gm-confirm', '200% actual Apply remains unobscured after graph edit');
        assertZoomMetrics(baseline, await zoomMetrics(page), 2, { before: viewport, after: page.viewportSize() });
        await ctx.shot(page, 'QA8-zoom-200-before-Apply');
      } });
      await page.locator('#graph-modal-overlay').waitFor({ state: 'hidden' });
      const graph = (await tabs(page)).find(t => t.id === 'cross-graph-task');
      await ctx.check('200% actual graph Apply creates an independently editable native revision and retains its parent', () => {
        assert.deepEqual(graph.generated.slice(0, -1), originalGraph.generated); assert.equal(graph.selectedCandidateId, revision.id);
        assert.equal(revision.graphEdit.parentCandidateId, originalGraph.selectedCandidateId);
        assert.ok(revision.graphResult.objects.some(o => o.type === 'coordplane' && o.labelX === '200% 교차 그래프'));
      });
      await unionEqual(ctx, await tabs(page), [rich.find(t => t.id === 'cross-label-task')], '200% graph revision retains unrelated full label union');
      // Parent controls are tested after the actual child closes. In source-edit
      // mode they must remain above AI itself (the QA8 contract); ordinary AI's
      // legitimate modality is handled separately by the API-only probe.
      for (const selector of ['#exam-send', '#exam-workspace-open'])
        await onScreen(ctx, page, selector, '200% parent control above source AI after actual graph child closes: ' + selector);
      // captureEdit rejects a different active task even when AI is closed.
      // Restore the figure's actual linked owner through the real task drawer;
      // keep the graph revision, candidate fields and 200% zoom unchanged.
      ctx.input('js/rhwp-exam-source-tabs.js', 'actual captureEdit linked task/scope guard before source Send');
      ctx.input('js/rhwp-exam-workspace.js', 'actual applyEdit/commitEdit/endEdit completion and HTTP document visibility');
      const linkedTaskId = picture.figure.context.ai.taskId;
      await selectTask(ctx, page, linkedTaskId);
      await ctx.check('200% source Send uses the actual linked AI task owner', async () => {
        assert.equal(await page.evaluate(() => document.querySelector('#ai-image-panel').__crossController.activeTask()), linkedTaskId);
        assertZoomMetrics(baseline, await zoomMetrics(page), 2, { before: viewport, after: page.viewportSize() });
      });
      const sendLifecycle = async phase => {
        const observation = await page.evaluate(() => {
          const element = document.querySelector('#rhwp-exam-workspace');
          return { bodyClass: document.body.className, editing: document.body.classList.contains('exam-editing'),
            desktopExamGlobal: Boolean(window.fiveEExam), activePageId: __candidateQA.state.get().activePageId,
            activeAiTask: document.querySelector('#ai-image-panel').__crossController.activeTask(),
            documentHidden: element.hidden, documentAriaBusy: element.getAttribute('aria-busy'),
            sourceEditName: document.querySelector('#exam-edit-name')?.textContent,
            message: document.querySelector('#exam-status')?.textContent,
            messageError: document.querySelector('#exam-status')?.getAttribute('data-error'),
            visibleDialogs: [...document.querySelectorAll('[role="dialog"],dialog,.modal-overlay')].filter(n => {
              const r = n.getBoundingClientRect(), s = getComputedStyle(n); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
            }).map(n => ({ id: n.id, className: n.className, text: n.textContent.slice(0, 1000) })) };
        });
        zoomReceipt(ctx, `QA8-zoom-source-Send-${phase}-lifecycle.json`, observation);
      };
      await ctx.act('200% actual AI close', () => closeAI(page), page);
      await onScreen(ctx, page, '#exam-send', '200% source Send remains above source edit');
      await sendLifecycle('before');
      await ctx.act('200% actual source Send applies the linked figure', () => page.locator('#exam-send').click(), page);
      try { await page.locator('#rhwp-exam-workspace').waitFor({ state: 'visible' }); await h.idle(page); }
      finally { await sendLifecycle('after'); }
      await ctx.check('200% source Send retains editable native labels and actual document ownership', async () => {
        const linked = (await h.pictures(page)).find(p => p.figure?.link?.assetId === picture.figure.link.assetId);
        assert.ok(linked); assert.deepEqual(linked.figure.source.pages[0].objects, picture.figure.source.pages[0].objects);
      });
      await ctx.shot(page, 'QA8-zoom-200-send-document');
      await ctx.act('200% actual document close', () => h.action(page, 'close'), page);
      await onScreen(ctx, page, '#exam-workspace-open', '200% actual Exam control remains accessible');
      await ctx.act('200% actual Exam opens the retained document', () => page.locator('#exam-workspace-open').click(), page);
      await page.locator('#rhwp-exam-workspace').waitFor({ state: 'visible' }); await h.idle(page);
      await ctx.check('200% actual Exam reopened the same native figure', async () => assert.ok((await h.pictures(page)).some(p => p.figure?.link?.assetId === picture.figure.link.assetId)));
      await ctx.act('200% actual document close after reopen', () => h.action(page, 'close'), page);
      // originalEdit selects a picture in the visible document; the preceding
      // close deliberately returned to the source canvas. Reopen through the
      // actual Exam control before selecting its retained native figure.
      await onScreen(ctx, page, '#exam-workspace-open', '200% actual Exam remains accessible before original editing');
      await ctx.act('200% actual Exam reopens the retained document before original editing', () => page.locator('#exam-workspace-open').click(), page);
      await page.locator('#rhwp-exam-workspace').waitFor({ state: 'visible' }); await h.idle(page);
      await h.originalEdit(page, 0); await page.locator(panel).waitFor({ state: 'visible' }); await selectTask(ctx, page, 'cross-graph-task');
      await ctx.check('all 200% interactions retain true browser zoom without new provider/auth calls', async () => {
        assertZoomMetrics(baseline, await zoomMetrics(page), 2, { before: viewport, after: page.viewportSize() });
        assert.equal(await page.evaluate(() => __task2.sends.length), calls); assert.equal(await page.evaluate(() => __task2.paidCalls), 0);
      });
    } catch (error) { primaryError = error; throw error; }
    finally {
      if (attempted && !page.isClosed()) {
        try {
          await changePageZoom(ctx, page, driver, baseline, viewport, 1, 'restored-100');
          ctx.result.cleanup.push({ name: 'true browser page zoom', restoredTo100: true, backend: driver.kind });
          if (!primaryError) for (const selector of ['#exam-send', '#exam-workspace-open', panel + ' [data-ai-close]'])
            await onScreen(ctx, page, selector, 'restored actual 100% control: ' + selector);
        } catch (error) {
          ctx.result.errors.push({ phase: 'true-page-zoom-restoration', error: error.stack });
          if (!primaryError) throw error;
        }
      }
    }
  }, { browserZoom: true });
  ctx.cover('real-browser-zoom-200');
}

async function probeActualZoomAPI(ctx) {
  // Fast diagnostic before any full zoom/QA8 run: real canonical app, retained
  // transport seeding and a controlled native graph. It does not create an RHWP
  // document or exercise the label pipeline, and certifies NO mandatory QA row.
  ctx.result.diagnosticScope = 'true backend zoom + independent metrics + actual graph/AI controls only; full zoom row/QA8 pending';
  await app(ctx, 'private-true-zoom-api-probe', async page => {
    const rich = await richUnion(ctx, page); await selectTask(ctx, page, 'cross-graph-task');
    const driver = await browserZoomDriver(ctx, page), baseline = await zoomMetrics(page), viewport = page.viewportSize();
    const calls = await page.evaluate(() => __task2.sends.length);
    let primaryError;
    try {
      await changePageZoom(ctx, page, driver, baseline, viewport, 2, 'api-probe-200');
      // Ordinary AI is modal: its backdrop intentionally blocks root controls.
      // Test those after actual close. Full zoom QA separately requires Send/
      // Exam above AI in the actual RHWP source-edit mode, with no bypass.
      for (const selector of [panel + ' [data-ai-close]', panel + ' [data-ai-graph-edit]'])
        await onScreen(ctx, page, selector, 'API probe actual 200% control hit-test: ' + selector);
      const before = await workspace(page);
      await ctx.act('API probe 200% actual graph open', () => page.locator(panel + ' [data-ai-graph-edit]').click(), page);
      await page.locator('#graph-modal-overlay').waitFor({ state: 'visible' });
      for (const selector of ['#gm-confirm', '#gm-cancel']) await onScreen(ctx, page, selector, 'API probe 200% actual graph button: ' + selector);
      await ctx.act('API probe 200% actual graph Cancel', () => page.locator('#gm-cancel').click(), page);
      await page.locator('#graph-modal-overlay').waitFor({ state: 'hidden' });
      await ctx.check('API probe graph Cancel preserves actual seeded native candidates', async () => assert.deepEqual(await workspace(page), before));
      const revision = await editGraph(ctx, page, '확대 API probe', { beforeConfirm: async () => {
        await onScreen(ctx, page, '#gm-confirm', 'API probe 200% actual graph Apply'); await ctx.shot(page, 'QA8-zoom-api-probe-before-Apply');
      } });
      await page.locator('#graph-modal-overlay').waitFor({ state: 'hidden' });
      await ctx.check('API probe 200% actual graph Apply creates native axis revision', () => {
        assert.equal(revision.graphEdit.parentCandidateId, rich.find(t => t.id === 'cross-graph-task').selectedCandidateId);
        assert.equal(revision.graphResult.objects.find(o => o.type === 'coordplane').labelX, '확대 API probe');
      });
      await ctx.act('API probe 200% actual AI close', () => closeAI(page), page);
      for (const selector of ['#exam-send', '#exam-workspace-open'])
        await onScreen(ctx, page, selector, 'API probe ordinary root control after actual modal close: ' + selector);
      await ctx.act('API probe 200% actual AI reopen', () => page.locator('#ai-image-install-open').click(), page);
      await page.locator(panel).waitFor({ state: 'visible' });
      await ctx.check('API probe did not issue provider/auth requests', async () => {
        assert.equal(await page.evaluate(() => __task2.sends.length), calls); assert.equal(calls, 0); assert.equal(await page.evaluate(() => __task2.paidCalls), 0);
      });
    } catch (error) { primaryError = error; throw error; }
    finally {
      try {
        await changePageZoom(ctx, page, driver, baseline, viewport, 1, 'api-probe-restored-100');
        ctx.result.cleanup.push({ name: 'API probe true browser zoom', restoredTo100: true, backend: driver.kind });
      } catch (error) {
        ctx.result.errors.push({ phase: 'zoom-api-probe-restoration', error: error.stack }); if (!primaryError) throw error;
      }
    }
  }, { browserZoom: true, count: 1 });
}
