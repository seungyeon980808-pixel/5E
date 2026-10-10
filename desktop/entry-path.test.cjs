const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { EventEmitter, once } = require('node:events');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { mainModuleUrl, runtimeConfiguration, assertLoadedRuntime } = require('../tests/helpers/four-session-entry.cjs');

const root = path.resolve(__dirname, '..');
const primaryUrl = pathToFileURL(path.join(root, 'index.html')).href;
const query = '?v=1.7.0-four-session-integration';
const alias = resource => new URL('/' + resource, primaryUrl).href;

// Only Electron transport/lifecycle and the auxiliary server are doubles. Load
// the complete production main module, including its actual path and IPC guards.
function harness(t) {
  const handlers = new Map(), protocols = new Map(), windows = [], effects = [], fetches = [];
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const app = new EventEmitter();
  Object.assign(app, {
    whenReady: () => ready, getVersion: () => require('../package.json').version,
    getPath: () => os.tmpdir(), setPath() {}, setAppUserModelId() {}, disableHardwareAcceleration() {},
    dock: { setIcon() {} },
  });
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.destroyed = false; windows.push(this);
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = { url: '' };
      this.webContents.send = (channel, payload) => { effects.push({ channel, payload }); this.webContents.emit('harness:send', channel, payload); };
      this.webContents.executeJavaScript = async () => {};
      this.webContents.setWindowOpenHandler = handler => { this.popup = handler; };
    }
    loadFile(file) { effects.push({ loadFile:file, installed:protocols.has('file') }); this.webContents.mainFrame.url = pathToFileURL(file).href; }
    async loadURL(url) { effects.push({ loadURL:url }); this.webContents.mainFrame.url = url; }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; }
    setMenu() {} setMenuBarVisibility() {} show() {} focus() {}
    static getAllWindows() { return windows.filter(window => !window.isDestroyed()); }
  }
  const electron = {
    app, BrowserWindow:Window, ipcMain:{ handle:(channel, handler) => handlers.set(channel, handler) },
    Menu:{ setApplicationMenu() {} }, shell:{ openExternal:url => effects.push({ external:url }) },
    protocol:{ handle(scheme, handler) { assert.ok(!protocols.has(scheme)); protocols.set(scheme, handler); effects.push({ protocol:scheme }); },
      registerSchemesAsPrivileged() { assert.fail('The native entry must not bypass CSP or add scheme privileges'); } },
    net:{ async fetch(url, options) {
      fetches.push({ url, options });
      const body = options.method === 'HEAD' ? null : fs.readFileSync(fileURLToPath(url));
      return new Response(body, { headers:{ 'content-type':'text/javascript', 'content-security-policy':"script-src 'self'" } });
    } },
  };
  const server = { async startExamServer(options) {
    effects.push({ serverRoot:options.root });
    return { origin:'http://127.0.0.1:39821', seed:() => 'a'.repeat(48), async close() {} };
  } };
  const original = Module._load, file = require.resolve('./main.cjs');
  Module._load = function(name, ...args) {
    if (name === 'electron') return electron;
    if (name === './exam-server.cjs') return server;
    return original.call(this, name, ...args);
  };
  let api;
  try { delete require.cache[file]; api = require(file); }
  finally { Module._load = original; delete require.cache[file]; }
  t.after(() => app.removeAllListeners());
  return { api, app, handlers, protocols, windows, effects, fetches, async boot() { app.emit('ready'); resolveReady(); await ready; },
    event:window => ({ sender:window.webContents, senderFrame:window.webContents.mainFrame }) };
}

function fixture(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), '5e-entry-'));
  // This tests a packaged path layout, not a binary ASAR archive.
  const appRoot = path.join(folder, '한글 app resources', 'app.asar');
  for (const [name, bytes] of Object.entries({
    'index.html':'entry', 'desktop/splash.html':'splash', 'desktop/preload.cjs':'private preload',
    'js/main.js':'canonical main', 'js/state.js':'canonical state', 'css/style.css':'style',
    'vendor/rhwp-studio/rhwp.wasm':'wasm', 'assets/example.png':'image', 'fonts/example.otf':'font',
    'js/.hidden':'hidden', 'js/.private/secret.js':'nested hidden', 'js/name:stream':'alternate stream',
    '.omo/secret':'private evidence', 'package.json':'private package',
  })) {
    const file = path.join(appRoot, name); fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, bytes);
  }
  const outside = path.join(folder, 'outside.js'); fs.writeFileSync(outside, 'outside');
  t.after(() => fs.rmSync(folder, {recursive:true, force:true}));
  return { appRoot, outside, file:name => pathToFileURL(path.join(appRoot, name)).href };
}

test('current root and preview load one canonical /js runtime backed by the actual candidate files', t => {
  const { api } = harness(t);
  const main = alias('js/main.js' + query), state = alias('js/state.js' + query);
  for (const entry of [primaryUrl, pathToFileURL(path.join(root, 'preview/index.html')).href]) {
    const html = fs.readFileSync(fileURLToPath(entry), 'utf8');
    assert.equal(mainModuleUrl(html, entry), main);
    const runtime = runtimeConfiguration({moduleBase:'/js/', moduleQuery:query}, entry, main, fs.readFileSync(path.join(root, 'js/main.js'), 'utf8'));
    assert.equal(runtime.stateUrl, state);
    assertLoadedRuntime(runtime, [main, state]);
    assert.equal(api.resolveDesktopEntryResource(main), fs.realpathSync(path.join(root, 'js/main.js')));
    assert.equal(api.resolveDesktopEntryResource(state), fs.realpathSync(path.join(root, 'js/state.js')));
    // Rewriting to a candidate-qualified URL or importing an unqueried module
    // must still fail the same identity guard used by the native harness.
    for (const duplicate of [alias('js/main.js'), alias('js/state.js'), pathToFileURL(path.join(root, 'js/state.js')).href + query]) {
      assert.throws(() => assertLoadedRuntime(runtime, [main, state, duplicate]), /identity does not match/);
    }
  }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const match of html.matchAll(/(?:src|href)=["'](\/(?:js|css)\/[^"']+)["']/g)) {
    const url = new URL(match[1], primaryUrl);
    assert.equal(api.resolveDesktopEntryResource(url.href), fs.realpathSync(path.join(root, url.pathname.slice(1))), match[1]);
  }
});

test('root aliases and candidate-qualified public assets resolve the same bytes, including a packaged path with spaces', t => {
  const { api } = harness(t), f = fixture(t);
  for (const name of ['js/main.js', 'js/state.js', 'css/style.css', 'vendor/rhwp-studio/rhwp.wasm', 'assets/example.png', 'fonts/example.otf']) {
    const expected = fs.realpathSync(path.join(f.appRoot, name));
    assert.equal(api.resolveDesktopEntryResource(alias(name + query), f.appRoot), expected);
    assert.equal(api.resolveDesktopEntryResource(f.file(name) + query + '#fragment', f.appRoot), expected);
  }
  for (const name of ['index.html', 'desktop/splash.html']) assert.equal(api.resolveDesktopEntryResource(f.file(name), f.appRoot), fs.realpathSync(path.join(f.appRoot, name)));
  assert.equal(api.resolveDesktopEntryResource(alias('index.html'), f.appRoot), null, 'a root alias cannot manufacture another primary entry URL');
  assert.equal(api.resolveDesktopEntryResource(alias('desktop/splash.html'), f.appRoot), null);
});

test('private, remote, malformed and traversing paths never reach the file transport', async t => {
  const { api } = harness(t), f = fixture(t), fetches = [];
  const handle = api.createDesktopEntryProtocolHandler(f.appRoot, async (...args) => { fetches.push(args); assert.fail('private file was fetched'); });
  const bad = [
    f.file('desktop/main.cjs'), f.file('desktop/preload.cjs'), f.file('package.json'), f.file('.omo/secret'),
    f.file('js/.hidden'), f.file('js/.private/secret.js'), alias('js/.hidden'), alias('js/name:stream'),
    alias('js/missing.js'), alias('js'), primaryUrl.replace('/index.html', '/index.html/child'),
    pathToFileURL(f.outside).href, pathToFileURL(f.appRoot + '-sibling/js/main.js').href,
    alias('js/main.js').replace('file:///', 'file://foreign-host/'), 'file://user:password@host/js/main.js',
    'https://example.com/js/main.js', 'http://127.0.0.1:39821/js/main.js', 'data:text/javascript,secret',
    'file:///js/../css/style.css', 'file:///js/%2e%2e/css/style.css', 'file:///js/%2E/main.js',
    'file:///js%2fmain.js', 'file:///js/%5cmain.js', 'file:///js/main.js%00', 'file:///js/%FF',
    'file:///js/%', 'file:///js\\main.js', 'file:/js/main.js',
  ];
  for (const url of bad) {
    assert.equal(api.resolveDesktopEntryResource(url, f.appRoot), null, url);
    assert.equal((await handle({url, method:'GET'})).status, 404, url);
  }
  assert.deepEqual(fetches, []);
});

test('realpath rejects symlinks outside the app and into private files inside it', async t => {
  const { api } = harness(t), f = fixture(t);
  fs.symlinkSync(f.outside, path.join(f.appRoot, 'js/outside.js'));
  fs.symlinkSync(path.join(f.appRoot, 'desktop/preload.cjs'), path.join(f.appRoot, 'js/private.js'));
  fs.symlinkSync(path.dirname(f.outside), path.join(f.appRoot, 'assets/outside'));
  const fetches = [], handle = api.createDesktopEntryProtocolHandler(f.appRoot, async (...args) => { fetches.push(args); assert.fail('symlink escape was fetched'); });
  for (const name of ['js/outside.js', 'js/private.js', 'assets/outside/outside.js']) {
    for (const url of [alias(name), f.file(name)]) {
      assert.equal(api.resolveDesktopEntryResource(url, f.appRoot), null, url);
      assert.equal((await handle({url, method:'GET'})).status, 404, url);
    }
  }
  assert.deepEqual(fetches, []);
});

test('ready installs the default-session file handler before both trusted loadFile entries', async t => {
  const h = harness(t);
  assert.equal(h.protocols.size, 0); assert.equal(h.windows.length, 0);
  await h.boot();
  assert.deepEqual([...h.protocols.keys()], ['file']);
  assert.deepEqual(h.effects.filter(effect => effect.loadFile || effect.protocol), [
    {protocol:'file'}, {loadFile:path.join(root, 'desktop/splash.html'), installed:true}, {loadFile:path.join(root, 'index.html'), installed:true},
  ]);
  assert.equal(h.windows.at(-1).webContents.mainFrame.url, primaryUrl);
  for (const window of h.windows) {
    assert.equal(window.options.webPreferences.sandbox, true);
    assert.equal(window.options.webPreferences.contextIsolation, true);
    assert.equal(window.options.webPreferences.nodeIntegration, false);
    assert.notEqual(window.options.webPreferences.webSecurity, false);
    assert.equal(window.options.webPreferences.partition, undefined, 'only the primary/default session has the file handler');
  }
  assert.equal(h.windows.at(-1).options.webPreferences.preload, path.join(root, 'desktop/preload.cjs'));
});

test('the installed handler delegates actual candidate bytes without modifying MIME, CSP or module identity', async t => {
  const h = harness(t); await h.boot();
  const url = alias('js/main.js' + query), request = new Request(url);
  const response = await h.protocols.get('file')(request);
  assert.equal(request.url, url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/javascript');
  assert.equal(response.headers.get('content-security-policy'), "script-src 'self'");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), fs.readFileSync(path.join(root, 'js/main.js')));
  assert.equal(h.fetches.length, 1);
  assert.equal(h.fetches[0].url, pathToFileURL(fs.realpathSync(path.join(root, 'js/main.js'))).href);
  assert.deepEqual(h.fetches[0].options, {method:'GET', headers:request.headers, signal:request.signal, bypassCustomProtocolHandlers:true});
});

test('file transport preserves HEAD, ranges, cancellation and the original response object', async t => {
  const { api } = harness(t), calls = [], controller = new AbortController();
  const request = new Request(alias('js/main.js' + query), {method:'HEAD', headers:{Range:'bytes=0-7'}, signal:controller.signal});
  const original = new Response(null, {status:206, headers:{'content-range':'bytes 0-7/100', 'content-type':'text/javascript'}});
  const handle = api.createDesktopEntryProtocolHandler(root, async (url, options) => { calls.push({url, options}); return original; });
  assert.equal(await handle(request), original);
  assert.equal(calls[0].options.method, 'HEAD');
  assert.equal(calls[0].options.headers.get('Range'), 'bytes=0-7');
  assert.equal(calls[0].options.signal, request.signal);
  controller.abort(); assert.equal(calls[0].options.signal.aborted, true);
  assert.equal(calls[0].options.bypassCustomProtocolHandlers, true);
});

test('unsupported methods and file-loader failures cannot fall back to unrestricted fetching', async t => {
  const { api } = harness(t), calls = [];
  const handle = api.createDesktopEntryProtocolHandler(root, async (...args) => { calls.push(args); throw new Error('file loader failure'); });
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await handle({url:alias('js/main.js'), method});
    assert.equal(response.status, 405); assert.equal(response.headers.get('Allow'), 'GET, HEAD');
  }
  assert.equal(calls.length, 0);
  assert.equal((await handle({url:alias('js/main.js' + query), method:'GET'})).status, 404);
  assert.equal(calls.length, 1);
});

test('public resource mapping does not give alternate entry URLs or child frames primary IPC trust', async t => {
  const h = harness(t); await h.boot(); const primary = h.windows.at(-1), event = h.event(primary);
  const call = sender => h.handlers.get('exam:publish-names')(sender, [{link:{tabId:'tab-a', assetId:'asset-a'}, name:'A'}]);
  assert.deepEqual(await call(event), {ok:true});
  for (const url of [alias('index.html'), alias('js/main.js' + query), pathToFileURL(path.join(root, 'preview/index.html')).href,
    primaryUrl + '/other', primaryUrl + '.other', 'https://example.com/', 'http://127.0.0.1:39821/']) {
    primary.webContents.mainFrame.url = url;
    await assert.rejects(async () => call(event), /Untrusted IPC sender/, url);
  }
  primary.webContents.mainFrame.url = primaryUrl;
  for (const sender of [{sender:{}, senderFrame:event.senderFrame}, {sender:event.sender, senderFrame:{url:primaryUrl}}]) await assert.rejects(async () => call(sender), /Untrusted IPC sender/);
  primary.webContents.mainFrame.url = primaryUrl + '?mode=pro#workspace';
  assert.deepEqual(await call(event), {ok:true}, 'query/hash do not change the trusted document');
  primary.destroy(); await assert.rejects(async () => call(event), /Untrusted IPC sender/);
});

test('the real auxiliary route keeps its isolated partition and exact top-frame trust', async t => {
  const h = harness(t); await h.boot(); const primary = h.windows.at(-1), primaryEvent = h.event(primary);
  assert.deepEqual(await h.handlers.get('exam:open')(primaryEvent, {source:{pages:[{id:'page-a', objects:[]}]}}), {ok:true});
  const aux = h.windows.at(-1), event = h.event(aux), prefs = aux.options.webPreferences;
  assert.equal(prefs.partition, 'persist:5e-exam-workspace');
  assert.equal(prefs.sandbox, true); assert.equal(prefs.contextIsolation, true); assert.equal(prefs.nodeIntegration, false);
  assert.notEqual(prefs.webSecurity, false); assert.equal(prefs.preload, path.join(root, 'desktop/exam-preload.cjs'));
  const url = new URL(aux.webContents.mainFrame.url);
  assert.equal(url.origin, 'http://127.0.0.1:39821'); assert.equal(url.pathname, '/'); assert.equal(url.searchParams.get('exam'), '1');
  assert.deepEqual([...h.protocols.keys()], ['file'], 'opening the auxiliary does not register another protocol handler');
  assert.deepEqual(await h.handlers.get('exam:get-names')(event), []);
  await assert.rejects(async () => h.handlers.get('exam:get-names')(primaryEvent), /Untrusted exam IPC sender/);
  await assert.rejects(async () => h.handlers.get('exam:publish-names')(event, []), /Untrusted IPC sender/);
  await assert.rejects(async () => h.handlers.get('exam:get-names')({sender:aux.webContents, senderFrame:{url:url.href}}), /Untrusted exam IPC sender/);
  for (const bad of [primaryUrl, url.origin + '/index.html', url.origin + '.evil/', 'http://localhost:39821/', 'http://127.0.0.1:39822/']) {
    aux.webContents.mainFrame.url = bad;
    await assert.rejects(async () => h.handlers.get('exam:get-names')(event), /Untrusted exam IPC sender/, bad);
  }
  aux.webContents.mainFrame.url = url.href;
  assert.deepEqual(await h.handlers.get('exam:get-names')(event), []);
});

test('navigation and popup restrictions still prevent alternate file entries and remote privileged pages', async t => {
  const h = harness(t); await h.boot(); const primary = h.windows.at(-1);
  for (const [url, expected] of [[primaryUrl, false], [primaryUrl + '?mode=pro#tab', false], [alias('index.html'), true],
    [alias('js/main.js'), true], [pathToFileURL(path.join(root, 'preview/index.html')).href, true], ['https://example.com/', true]]) {
    let prevented = false; primary.webContents.emit('will-navigate', {preventDefault() { prevented = true; }}, url);
    assert.equal(prevented, expected, url);
  }
  for (const url of [alias('js/main.js'), 'javascript:alert(1)', 'https://example.com/']) assert.deepEqual(primary.popup({url}), {action:'deny'});
  assert.deepEqual(h.effects.filter(effect => effect.external), [{external:'https://example.com/'}]);
});

test('native parsed-module observation rejects missing, duplicate, stale, forged and foreign-context identities', () => {
  // Load the actual bounded observer declarations, without executing the native
  // suite or importing renderer modules. Only recorded debugger metadata is a
  // fixture; the identity assertions are the real native harness function.
  const file = path.join(root, 'tests/test-rhwp-exam-desktop.cjs'), source = fs.readFileSync(file, 'utf8');
  const end = source.indexOf('async function pictures(page)'); assert.ok(end > 0);
  const observe = new Function('require', '__dirname', source.slice(0, end) + '\nreturn assertParsedRuntime;')(
    Module.createRequire(file), path.dirname(file));
  const runtime = {mainUrl:alias('js/main.js' + query), stateUrl:alias('js/state.js' + query)};
  const scripts = [runtime.mainUrl, runtime.stateUrl].map((url, index) => ({url, scriptId:String(index + 1),
    executionContextId:3, isModule:true, hasSourceURL:false}));
  const contexts = [{id:3, auxData:{isDefault:true, frameId:'primary'}}];
  observe(runtime, scripts, contexts, 'primary');
  for (const bad of [[], scripts.slice(0, 1), [...scripts, {...scripts[1], scriptId:'extra'}],
    [...scripts, {...scripts[1], url:alias('js/state.js')}],
    [...scripts, {...scripts[1], url:alias('js/state.js?v=1.6.3')}],
    [...scripts, {...scripts[1], url:pathToFileURL(path.join(root, 'js/state.js')).href + query}],
    scripts.map(s => ({...s, isModule:false})), scripts.map(s => ({...s, hasSourceURL:true})),
    scripts.map(s => ({...s, executionContextId:4}))]) {
    assert.throws(() => observe(runtime, bad, contexts, 'primary'));
  }
  assert.throws(() => observe(runtime, scripts, [{id:3, auxData:{isDefault:false, frameId:'primary'}}], 'primary'));
  assert.throws(() => observe(runtime, scripts, [{id:3, auxData:{isDefault:true, frameId:'child'}}], 'primary'));
});

test('actual annotation IPC preserves current layout and draft fields while rejecting invalid values and extra capabilities', async t => {
  const h = harness(t); await h.boot(); const primary = h.windows.at(-1);
  await h.handlers.get('exam:open')(h.event(primary), {}); const aux = h.windows.at(-1);
  const label = {id:'label', type:'labeler', text:'A', p1:{x:0,y:0}, p2:{x:3,y:2}};
  const render = {bounds:{x:-10,y:-10,w:20,h:20}, options:{includeReferenceImages:true, excludeAllImages:false},
    layout:{treatAsChar:true, alignment:'Center', textWrap:'TopAndBottom', top:5, bottom:5, left:0, right:0}, layoutDraft:false};
  const figure = {id:'figure', name:'A', version:1, link:{tabId:'tab', assetId:'asset'}, render,
    source:{activePageId:'page', pages:[{id:'page', objects:[label], layers:[{id:1}], artboard:{w:90,h:60}}]}};
  const read = h.handlers.get('exam:annotations'), reply = h.handlers.get('exam:annotations-reply');
  let sent = once(primary.webContents, 'harness:send'); const pending = read(h.event(aux), {kind:'read', figure});
  const [channel, request] = await sent; assert.equal(channel, 'exam:annotations-request');
  assert.deepEqual(request.figure.render, render, 'the actual current renderer layout crosses the native request intact');
  const draftRender = {...render, layoutDraft:true, layout:{...render.layout, left:8}};
  assert.deepEqual(reply(h.event(primary), {requestId:request.requestId, value:{baseline:[label], draft:[label], render:draftRender}}), {ok:true});
  assert.deepEqual((await pending).render, draftRender, 'a real validated draft reply preserves every layout field');
  sent = once(primary.webContents, 'harness:send');
  const patched = read(h.event(aux), {kind:'patch', figure, baseline:[label], edited:[label], render:draftRender});
  const [, patch] = await sent; assert.deepEqual(patch.render, draftRender);
  reply(h.event(primary), {requestId:patch.requestId, value:{labels:[label]}}); assert.deepEqual(await patched, {labels:[label]});
  const count = h.effects.length;
  for (const invalid of [{...render, layoutDraft:'true'}, {...render, path:'/tmp/private'},
    {...render, layout:{...render.layout, path:'/tmp/private'}}, {...render, layout:{...render.layout, top:-1}},
    {...render, layout:{...render.layout, left:721}}, {...render, layout:{...render.layout, alignment:'Justify'}},
    {...render, layout:{...render.layout, treatAsChar:1}}, {...render, layout:{...render.layout, textWrap:'unknown'}}]) {
    await assert.rejects(read(h.event(aux), {kind:'read', figure:{...figure, render:invalid}}));
    await assert.rejects(read(h.event(aux), {kind:'patch', figure, baseline:[label], edited:[label], render:invalid}));
  }
  assert.equal(h.effects.length, count, 'invalid layout requests never reach the primary transport');
});
