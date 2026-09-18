const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
function fixture() {
  const source = fs.readFileSync('js/project-status.js', 'utf8').replace(/export /g, '');
  const context = { WeakMap, JSON, document: { querySelector: () => null } };
  vm.runInNewContext(source + '\nglobalThis.api = { initProjectStatus, captureProjectStatus, markProjectStatus };', context);
  const data = { pages: [{ id: 'a', objects: [] }], activePageId: 'a' };
  data.objects = data.pages[0].objects;
  let notify;
  const state = { get: () => data, subscribe: fn => { notify = fn; } };
  const status = context.api.initProjectStatus(state, value => value);
  return { ...context.api, state, data, status, update: fn => { fn(data); notify(); } };
}
test('dirty status ignores navigation and tracks file versus recovery persistence', () => {
  const f = fixture();
  assert.equal(f.status.text(), '새 프로젝트 · 파일 저장 전');
  f.update(s => { s.activePageId = 'b'; });
  assert.equal(f.status.text(), '새 프로젝트 · 파일 저장 전');
  f.update(s => { s.pages[0].objects.push({ id: 'one' }); });
  assert.equal(f.status.text(), '미저장 변경');
  f.markProjectStatus(f.state, f.captureProjectStatus(f.state), 'recovery');
  assert.equal(f.status.text(), '자동 복구용 저장됨 · 파일 저장 필요');
  f.markProjectStatus(f.state, f.captureProjectStatus(f.state), 'file');
  assert.equal(f.status.text(), '파일 저장 완료');
});

test('OS project replacement protects unsaved empty-page layout changes but permits an untouched startup', () => {
  const f = fixture();
  assert.equal(f.status.hasUnsavedWork(), false);
  f.update(s => { s.pages[0].artboard = { w: 120, h: 80 }; });
  assert.equal(f.status.hasUnsavedWork(), true);
  f.markProjectStatus(f.state, f.captureProjectStatus(f.state), 'file');
  assert.equal(f.status.hasUnsavedWork(), false);
  f.update(s => { s.pages[0].name = '이름 변경'; });
  assert.equal(f.status.hasUnsavedWork(), true);
});
test('async completion preserves later edits and ignores replaced documents', () => {
  const f = fixture();
  const token = f.captureProjectStatus(f.state);
  f.update(s => { s.pages[0].objects.push({ id: 'one' }); });
  f.markProjectStatus(f.state, token, 'file');
  assert.equal(f.status.text(), '미저장 변경');
  const old = f.captureProjectStatus(f.state);
  f.update(s => { s.pages = [{ id: 'new', objects: [] }]; });
  f.markProjectStatus(f.state, old, 'file');
  assert.equal(f.status.text(), '미저장 변경');
});
test('download fallback never claims confirmed disk write', () => {
  const f = fixture();
  f.markProjectStatus(f.state, f.captureProjectStatus(f.state), 'download');
  assert.equal(f.status.text(), '파일 다운로드 요청됨 · 저장 위치 확인');
});
function saveHarness(f, picker) {
  let downloads = 0;
  const source = fs.readFileSync('js/project-io.js', 'utf8')
    .replace(/^import\s+[\s\S]*?;\r?\n/gm, '').replace(/\bexport\s+/g, '');
  const launcher = fs.readFileSync('js/project-launch.js', 'utf8')
    .replace(/^import\s+[\s\S]*?;\r?\n/gm, '').replace(/\bexport\s+/g, '');
  const context = {
    Blob, JSON, navigator: { platform: 'Win32' }, window: { showSaveFilePicker: picker },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    document: { createElement: () => ({ click() { downloads++; } }), body: { appendChild() {}, removeChild() {} } },
    captureProjectStatus: f.captureProjectStatus, markProjectStatus: f.markProjectStatus,
  };
  vm.runInNewContext(launcher + '\n' + source + '\nglobalThis.save = saveProject;', context);
  return { save: () => context.save(f.state), downloads: () => downloads };
}
test('cancelled file picker leaves status and document untouched', async () => {
  const f = fixture();
  f.update(s => s.pages[0].objects.push({ id: 'one' }));
  const h = saveHarness(f, async () => { throw { name: 'AbortError' }; });
  const outcome = await h.save();
  assert.equal(outcome.kind, 'cancelled');
  assert.equal(f.status.text(), '미저장 변경');
  assert.equal(h.downloads(), 0);
  assert.equal(f.data.pages[0].objects.length, 1);
});
test('real async save marks only captured content after writer close', async () => {
  const f = fixture();
  f.update(s => s.pages[0].objects.push({ id: 'one' }));
  let finish;
  let written;
  const closed = new Promise(resolve => { finish = resolve; });
  const h = saveHarness(f, async () => ({ createWritable: async () => ({
    write: async blob => { written = JSON.parse(await blob.text()); },
    close: () => closed,
  }) }));
  const pending = h.save();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.status.text(), '미저장 변경');
  f.update(s => s.pages[0].objects.push({ id: 'two' }));
  finish();
  const outcome = await pending;
  assert.equal(outcome.kind, 'saved');
  assert.equal(written.pages[0].objects.length, 1);
  assert.equal(f.status.text(), '미저장 변경');
});
test('unsupported picker routes through existing project download', async () => {
  const f = fixture();
  const h = saveHarness(f);
  const outcome = await h.save();
  assert.equal(outcome.kind, 'download-requested');
  assert.equal(h.downloads(), 1);
  assert.match(f.status.text(), /다운로드 요청됨/);
});
for (const platform of ['MacIntel', 'Win32']) {
  test(`${platform} project shortcuts use physical keys and respect editing, IME, modal scopes`, () => {
    const io = fs.readFileSync('js/project-io.js', 'utf8').replace(/^import\s+[\s\S]*?;\r?\n/gm, '').replace(/\bexport\s+/g, '');
    const keys = fs.readFileSync('js/platform.js', 'utf8').replace(/^export\s*\{[^}]+\};?/gm, '');
    let listener;
    let opens = 0;
    let saves = 0;
    let modal = false;
    let blurred = 0;
    const context = {
      navigator: { platform }, document: { querySelector: () => modal ? {} : null },
      window: { addEventListener: (type, fn) => { listener = fn; } },
      state: {}, input: { click: () => { opens++; } }, saveStub: () => { saves++; },
    };
    vm.runInNewContext(keys + '\n' + io + '\nsaveProject = saveStub; initProjectShortcuts(state, input);', context);
    const event = (code, extra = {}) => ({ code, key: 'ㅐ', ctrlKey: platform === 'Win32', metaKey: platform === 'MacIntel', preventDefault() { this.defaultPrevented = true; }, ...extra });
    listener(event('KeyO'));
    listener(event('KeyS'));
    assert.equal(opens, 1);
    assert.equal(saves, 1);
    for (const target of [{ tagName: 'INPUT' }, { tagName: 'SELECT' }, { isContentEditable: true }]) {
      target.blur = () => { blurred++; };
      listener(event('KeyO', { target }));
      listener(event('KeyS', { target }));
    }
    assert.equal(blurred, 6);
    assert.equal(opens, 4);
    assert.equal(saves, 4);
    for (const extra of [{ isComposing: true }, { keyCode: 229 }, { repeat: true }, { defaultPrevented: true }]) {
      for (const key of ['KeyO', 'KeyS']) {
        const blocked = event(key, extra);
        listener(blocked);
        assert.equal(blocked.defaultPrevented, true, 'browser file dialog must not replace blocked app action');
      }
    }
    modal = true;
    for (const key of ['KeyO', 'KeyS']) {
      const blocked = event(key);
      listener(blocked);
      assert.equal(blocked.defaultPrevented, true, 'modal keeps browser save/open from escaping');
    }
    assert.equal(opens, 4);
    assert.equal(saves, 4);
  });
}
test('project IO boot captures baseline after pages initialize, then detects artboard and metadata edits', () => {
  const io = fs.readFileSync('js/project-io.js', 'utf8').replace(/^import\s+[\s\S]*?;\r?\n/gm, '').replace(/\bexport\s+/g, '');
  const status = fs.readFileSync('js/project-status.js', 'utf8').replace(/\bexport\s+/g, '');
  const microtasks = [];
  const listeners = [];
  const data = { pages: [], objects: [], guides: [], layers: [], artboard: { w: 90, h: 60 } };
  const state = { get: () => data, subscribe: fn => listeners.push(fn) };
  const context = {
    WeakMap, JSON, queueMicrotask: fn => microtasks.push(fn),
    document: { querySelector: () => null, getElementById: () => null,
      createElement: () => ({ style: {}, addEventListener() {} }), body: { appendChild() {} } },
    window: { addEventListener() {} },
  };
  vm.runInNewContext(status + '\n' + io + '\nglobalThis.api = { initProjectIO, initProjectStatus, serialize };', context);
  context.api.initProjectIO(state, null);
  data.activePageId = 'first';
  data.pages = [{ id: 'first', name: '페이지 1', objects: data.objects, guides: data.guides, layers: data.layers, artboard: data.artboard }];
  listeners.forEach(fn => fn(data));
  microtasks.forEach(fn => fn());
  const controller = context.api.initProjectStatus(state, context.api.serialize);
  assert.equal(controller.text(), '새 프로젝트 · 파일 저장 전');
  data.artboard.w = 100;
  assert.equal(controller.text(), '미저장 변경');
  data.artboard.w = 90;
  data.pages[0].meta = { number: '2', points: '3' };
  assert.equal(controller.text(), '미저장 변경');
});
