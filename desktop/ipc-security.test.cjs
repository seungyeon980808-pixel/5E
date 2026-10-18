const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { EventEmitter, once } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const appUrl = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const channels = ['codex:status', 'codex:start', 'codex:stop', 'codex:models', 'codex:account',
  'codex:send', 'codex:interrupt', 'codex:login', 'capture:sources', 'local-images:pick-folder',
  'local-images:list', 'local-images:thumbnail', 'local-images:read', 'exam:open','exam:publish-names','exam:finish','exam:workspace-reply','exam:workspace-changed','exam:save-workspace','exam:project-snapshot','exam:open-project','exam:annotations-reply','exampool:evidence'];
const auxChannels=['exam:request-edit','exam:get-names','exam:return-source','exam:ack','exam:workspace-snapshot','exam:workspace-restore','exam:project-snapshot-reply','exam:annotations'];

function harness(t) {
  const handlers = new Map(), windows = [], effects = [], events = [], children = [];
  const requests = new EventEmitter();
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), '5e-ipc-'));
  const image = path.join(folder, 'fixture.svg');
  fs.writeFileSync(image, '<svg xmlns="http://www.w3.org/2000/svg"/>');
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  let ready;
  class Window {
    constructor(options) {
      this.options = options;
      windows.push(this);
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = { url: '' };
      this.webContents.send = (channel, payload) => {
        events.push({ channel, payload });
        requests.emit(channel, payload);
      };
      this.webContents.setWindowOpenHandler = callback => { this.openWindow = callback; };
      this.webContents.executeJavaScript = async () => {};
    }
    loadFile(file) { this.webContents.mainFrame.url = pathToFileURL(file).href; }
    async loadURL(url) { this.webContents.mainFrame.url = url; effects.push('load-exam'); }
    isDestroyed() { return false; }
    on() {} once() {} setMenu() {} setMenuBarVisibility() {} show() {} focus() {}
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
    if (name === './exam-server.cjs') return { async startExamServer() {
      effects.push('exam-server');
      return {origin:'http://127.0.0.1:39821',seed(payload) { assert.ok(payload.source.pages.length); effects.push('exam-source'); return 'a'.repeat(48); },async close() {}};
    }};
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
    channel === 'exam:publish-names' ? [] : channel === 'exam:workspace-reply' || channel === 'exam:annotations-reply' ? {requestId:'absent'} : channel === 'exam:open' ? {source:{pages:[{id:'a',objects:[]}],activePageId:'a'}} :
      channel === 'local-images:list' ? folder : channel.startsWith('local-images:') ? image : { text: 'hello', clientScope: 'A' });
  t.after(() => { for (const child of children) child.kill(); });
  return { handlers, window, windows, event, call, effects, events, children, folder, image, requests };
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
    if(channel==='exam:open-project'){await assert.rejects(async()=>h.call(channel),/프로젝트 파일/);return;}
    if(channel==='exampool:evidence'){await assert.rejects(async()=>h.call(channel),/근거 검색 종류/);return;}// 종류·검색어 없는 요청은 실행하지 않는다
    if(channel==='exam:finish'){await assert.rejects(async()=>h.call(channel),/편집 연결/);return;}
    if(channel==='exam:save-workspace') await h.call('exam:open');
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
      case 'exam:open':
        assert.deepEqual(result,{ok:true});
        assert.deepEqual(h.effects,['exam-server','exam-source','load-exam']);
        assert.equal(h.windows.at(-1).options.webPreferences.contextIsolation,true);assert.equal(h.windows.at(-1).options.webPreferences.sandbox,true);assert.equal(h.windows.at(-1).options.webPreferences.partition,'persist:5e-exam-workspace');
        break;
      case 'exam:publish-names':case 'exam:workspace-changed':case 'exam:save-workspace':assert.equal(result.ok,true);break;
      case 'exam:workspace-reply':case 'exam:annotations-reply':assert.equal(result.ok,false);break;
      case 'exam:project-snapshot':assert.equal(result,null);break;
      default: assert.fail(`missing trusted result assertion for ${channel}`);
    }
  });
}

for(const channel of auxChannels) {
  test(`${channel} rejects primary, external and child frames`,async t=>{
    const h=harness(t);await h.call('exam:open');const window=h.windows.at(-1), frame=window.webContents.mainFrame;
    const bad=[h.event,{sender:window.webContents,senderFrame:{url:frame.url}},{sender:window.webContents,senderFrame:frame}];
    frame.url='https://example.com';
    const effects=h.effects.length,events=h.events.length;
    for(const event of bad) await assert.rejects(async()=>h.handlers.get(channel)(event,{}),/Untrusted exam IPC sender/);
    assert.equal(h.effects.length,effects);assert.equal(h.events.length,events);
  });
  test(`${channel} permits only the auxiliary main frame with correlated replies`,async t=>{
    const h=harness(t);await h.call('exam:open');const window=h.windows.at(-1),event={sender:window.webContents,senderFrame:window.webContents.mainFrame};
    if(channel==='exam:annotations') {
      const figure={id:'figure-a',name:'A',version:1,link:{tabId:'tab-a',assetId:'asset-a'},source:{activePageId:'page-a',pages:[{id:'page-a',objects:[],layers:[{id:1}],artboard:{w:90,h:60}}]}};
      const sent=once(h.requests,'exam:annotations-request',{signal:AbortSignal.timeout(5000)});
      const pending=h.handlers.get(channel)(event,{kind:'read',figure});
      const [request]=await sent;
      await h.handlers.get('exam:annotations-reply')(h.event,{requestId:request.requestId,value:{baseline:[],draft:[]}});
      assert.deepEqual(await pending,{baseline:[],draft:[]});return;
    }
    if(channel==='exam:workspace-snapshot'||channel==='exam:workspace-restore') {
      const sent=once(h.requests,'exam:workspace-request',{signal:AbortSignal.timeout(5000)});
      const payload=channel==='exam:workspace-snapshot'?undefined:{drawing:{pages:[]}};
      const pending=h.handlers.get(channel)(event,payload);
      const [correlated]=await sent,request=h.events.at(-1);
      assert.equal(request.channel,'exam:workspace-request');
      assert.deepEqual(request.payload,correlated);
      assert.deepEqual(request.payload.restore,payload);
      await h.handlers.get('exam:workspace-reply')(h.event,{requestId:request.payload.requestId,value:{drawing:{pages:[]}}});
      assert.deepEqual(await pending,{drawing:{pages:[]}});return;
    }
    const payload=channel==='exam:request-edit'?{requestId:'12345678-1234-1234-1234-123456789abc',figure:{source:{pages:[]},link:{tabId:'tab',assetId:'asset'}}}:{};
    const result=await h.handlers.get(channel)(event,payload);
    if(channel==='exam:get-names')assert.deepEqual(result,[]);
    else if(channel==='exam:ack'||channel==='exam:project-snapshot-reply')assert.deepEqual(result,{ok:false});
    else assert.equal(result.ok,true);
  });
}

test('exam workspace snapshot rejects malformed or expired owner proof requests before asking the primary window',async t=>{
  const h=harness(t);await h.call('exam:open');const window=h.windows.at(-1),event={sender:window.webContents,senderFrame:window.webContents.mainFrame};
  const count=h.events.length,effects=h.effects.length;
  await assert.rejects(()=>h.handlers.get('exam:workspace-snapshot')(event,null),/그림 연결 요청이 올바르지 않거나 너무 큽니다/);
  for(const payload of [[],{}, {drawing:{pages:[]}}, {editRequestId:'invalid'},
    {editRequestId:'12345678-1234-1234-1234-123456789abc',extra:true}]) {
    await assert.rejects(()=>h.handlers.get('exam:workspace-snapshot')(event,payload),/그림 소유 확인 요청이 올바르지 않습니다/);
  }
  await assert.rejects(()=>h.handlers.get('exam:workspace-snapshot')(event,{editRequestId:'12345678-1234-1234-1234-123456789abc'}),/시험지 편집 연결이 만료되었습니다/);
  assert.equal(h.events.length,count);assert.equal(h.effects.length,effects);
});

test('all registered privileged channels are covered by sender tests', t => {
  const h = harness(t);
  assert.deepEqual([...h.handlers.keys()].sort(), [...channels,...auxChannels].sort());
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
