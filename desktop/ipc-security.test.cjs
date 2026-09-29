const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const appUrl = pathToFileURL(path.join(__dirname, '..', 'preview', 'index.html')).href;
const channels = ['codex:status', 'codex:start', 'codex:stop', 'codex:models', 'codex:account',
  'codex:send', 'codex:interrupt', 'codex:login', 'capture:sources', 'local-images:pick-folder',
  'local-images:list', 'local-images:thumbnail', 'local-images:read'];

function harness(t) {
  const handlers = new Map(), windows = [], effects = [], events = [], children = [];
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), '5e-ipc-'));
  const image = path.join(folder, 'fixture.svg');
  fs.writeFileSync(image, '<svg xmlns="http://www.w3.org/2000/svg"/>');
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  let ready;
  class Window {
    constructor() {
      windows.push(this);
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = { url: '' };
      this.webContents.send = (channel, payload) => events.push({ channel, payload });
      this.webContents.setWindowOpenHandler = callback => { this.openWindow = callback; };
    }
    loadFile(file) { this.webContents.mainFrame.url = pathToFileURL(file).href; }
    isDestroyed() { return false; }
    on() {} once() {} setMenu() {} setMenuBarVisibility() {} show() {}
  }
  const spawn = () => {
    effects.push('spawn');
    const child = new EventEmitter(); children.push(child);
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => { child.emit('exit', 0, null); return true; };
    child.stdin = new Writable({ write(bytes, encoding, done) {
      const request = JSON.parse(String(bytes));
      effects.push(request.method);
      if (request.id != null) child.stdout.write(JSON.stringify({ id: request.id, result: {
        thread: { id: 'thread' }, turn: { id: 'turn' }, data: [],
      } }) + '\n');
      done();
    } });
    return child;
  };
  const original = Module._load;
  Module._load = function(name, ...args) {
    if (name === 'electron') return {
      app: { getVersion: () => '1.6.0', getPath: () => folder, on() {}, dock: { setIcon() {} }, whenReady: () => ({ then(callback) { ready = callback; } }) },
      BrowserWindow: Window, ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
      Menu: { setApplicationMenu() {} },
      shell: { openExternal(url) { effects.push(url); } },
      desktopCapturer: { async getSources() { effects.push('capture'); return []; } },
      dialog: { async showOpenDialog() { effects.push('dialog'); return { canceled: false, filePaths: [folder] }; } },
    };
    if (name === 'node:child_process') return { spawn, execFile(...args) {
      effects.push('execFile');
      if (typeof args.at(-1) === 'function') args.at(-1)(null, 'logged in', '');
    } };
    return original.call(this, name, ...args);
  };
  try { delete require.cache[require.resolve('./main.cjs')]; require('./main.cjs'); ready(); }
  finally { Module._load = original; delete require.cache[require.resolve('./main.cjs')]; }
  const window = windows.at(-1);
  const event = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  const call = (channel, sender = event) => handlers.get(channel)(sender,
    channel === 'local-images:list' ? folder : channel.startsWith('local-images:') ? image : { text: 'hello', clientScope: 'A' });
  t.after(() => { for (const child of children) child.kill(); });
  return { handlers, window, event, call, effects, events, children, folder, image };
}

for (const channel of channels) {
  for (const senderKind of ['external URL', 'subframe', 'other webContents']) {
    test(`${channel} rejects ${senderKind} before privileged effects`, async t => {
      // Given a real production handler and an untrusted renderer identity.
      const h = harness(t);
      const sender = { ...h.event };
      if (senderKind === 'external URL') sender.senderFrame.url = 'https://example.com';
      if (senderKind === 'subframe') sender.senderFrame = { url: appUrl };
      if (senderKind === 'other webContents') sender.sender = {};
      // When the privileged channel is invoked, then it rejects without effects.
      await assert.rejects(async () => h.call(channel, sender), /Untrusted IPC sender|허용되지 않은 로컬 이미지 요청/);
      assert.deepEqual(h.effects, []);
      assert.deepEqual(h.events, []);
    });
  }
  test(`${channel} accepts the trusted application main frame`, async t => {
    // Given a trusted main frame and a folder explicitly selected through the dialog.
    const h = harness(t);
    if (channel.startsWith('local-images:')) await h.call('local-images:pick-folder');
    // When the production handler runs, then it returns its successful result.
    const result = await h.call(channel);
    switch (channel) {
      case 'codex:status': assert.deepEqual(result, { server: false, login: { loggedIn: true, output: 'logged in' } }); break;
      case 'codex:start': assert.deepEqual(result, { ok: true, state: 'running' }); break;
      case 'codex:stop': case 'codex:interrupt': assert.equal(result, null); break;
      case 'codex:login': assert.deepEqual(result, { ok: true }); break;
      case 'codex:send': assert.equal(result.turnId, 'turn'); break;
      case 'codex:models': assert.deepEqual(result.data, []); break;
      case 'codex:account': assert.deepEqual(Object.keys(result).sort(), ['account', 'limits', 'usage']); break;
      case 'capture:sources': assert.deepEqual(result, []); break;
      case 'local-images:pick-folder': assert.equal(result.folder, fs.realpathSync(h.folder)); break;
      case 'local-images:list': assert.deepEqual(result.items.map(item => item.path), [fs.realpathSync(h.image)]); break;
      case 'local-images:thumbnail': case 'local-images:read':
        assert.equal(result, `data:image/svg+xml;base64,${fs.readFileSync(h.image).toString('base64')}`); break;
      default: assert.fail(`missing trusted result assertion for ${channel}`);
    }
  });
}

test('all registered privileged channels are covered by sender tests', t => {
  const h = harness(t);
  assert.deepEqual([...h.handlers.keys()].sort(), [...channels].sort());
});

for (const url of ['https://example.com', 'file:///tmp/other.html', 'javascript:alert(1)']) {
  test(`top-level navigation to ${url} is prevented`, t => {
    const h = harness(t);
    let prevented = false;
    h.window.webContents.emit('will-navigate', { preventDefault() { prevented = true; } }, url);
    assert.equal(prevented, true);
  });
}
for (const suffix of ['', '?desktop=1#canvas']) {
  test(`the canonical app file URL with suffix ${suffix} may navigate`, t => {
    const h = harness(t);
    let prevented = false;
    h.window.webContents.emit('will-navigate', { preventDefault() { prevented = true; } }, appUrl + suffix);
    assert.equal(prevented, false);
  });
}
for (const url of ['https://example.com', 'javascript:alert(1)', 'file:///tmp/other.html']) {
  test(`opening ${url} never creates a privileged window`, t => {
    const h = harness(t);
    assert.deepEqual(h.window.openWindow({ url }), { action: 'deny' });
    assert.ok(h.effects.every(effect => /^https?:\/\//.test(effect)));
  });
}

test('Codex events are withheld after the main frame leaves the app URL', async t => {
  const h = harness(t);
  await h.call('codex:start');
  h.events.length = 0;
  h.event.senderFrame.url = 'https://example.com';
  h.children[0].stderr.write('private runtime detail');
  assert.deepEqual(h.events, []);
});
