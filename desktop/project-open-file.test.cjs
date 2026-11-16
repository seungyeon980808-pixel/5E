// 1.7.1 설치판 .5e 두 번 눌러 열기: argv 가르기, 화면 준비 전 줄 세우기, 맥 open-file·윈도우 second-instance, 크기 한도.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { EventEmitter } = require('node:events');
const { projectPathsFromArgv, createProjectOpenQueue, installProjectOpenFile } = require('./project-open-file.cjs');

test('argv에서 실제로 있는 .5e만 고른다(옵션·다른 확장자·없는 파일 제외)', () => {
  const exists = f => f.endsWith('a.5e') || f.endsWith('B.5E') || f.endsWith('c.json');
  assert.deepEqual(projectPathsFromArgv(['5E.exe', '--flag', '/x/a.5e', 'rel/B.5E', '/x/c.json', '/x/missing.5e', '/x/a.5e'], { cwd: '/w', exists }), ['/x/a.5e', path.resolve('/w', 'rel/B.5E')]);
});

test('화면이 준비될 때까지 기다렸다가 하나씩 차례로 보내고, 128 MiB 넘는 파일은 알림만', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '5e-open-file-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const one = path.join(dir, '첫째.5e'), two = path.join(dir, '둘째.5e'), big = path.join(dir, '큰.5e');
  fs.writeFileSync(one, Buffer.from([80, 75])); fs.writeFileSync(two, Buffer.from([1])); fs.writeFileSync(big, Buffer.from([1, 2, 3]));
  const sent = [], queue = createProjectOpenQueue({ send: p => sent.push(p), maxBytes: 2 });
  await queue.enqueue(one); await queue.enqueue(big);
  assert.equal(sent.length, 0, '준비 전에는 보내지 않음'); assert.equal(queue.size, 2);
  await queue.markReady(); await queue.enqueue(two);
  assert.deepEqual(sent.map(p => p.name), ['첫째.5e', '큰.5e', '둘째.5e']);
  assert.ok(sent[0].bytes instanceof ArrayBuffer, JSON.stringify(sent[0])); assert.equal(sent[0].bytes.byteLength, 2); assert.equal(sent[0].error, undefined);
  assert.match(sent[1].error, /128 MiB/); assert.equal(sent[1].bytes, undefined);
  assert.equal(JSON.stringify(sent).includes(dir), false, '경로는 화면에 넘기지 않음');
  queue.reset(); await queue.enqueue(one); assert.equal(sent.length, 3, '창이 다시 읽히면 다시 기다림');
});

test('main.cjs 연결: 맥 open-file(뜨기 전)·처음 argv·second-instance를 받아 창으로 보낸다', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '5e-open-file-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const first = path.join(dir, 'argv.5e'), mac = path.join(dir, 'finder.5e'), second = path.join(dir, 'second.5e');
  for (const f of [first, mac, second]) fs.writeFileSync(f, 'x');
  const app = new EventEmitter(); let isReady = false; app.isReady = () => isReady;
  const handlers = {}, sent = [], webContents = new EventEmitter();
  webContents.send = (channel, payload) => sent.push([channel, payload.name]);
  let created = 0, focused = 0, window = null;
  const makeWindow = () => { created++; window = { isDestroyed: () => false, isMinimized: () => false, show() {}, focus() { focused++; }, webContents }; hooks.attachWindow(window); };
  const hooks = installProjectOpenFile({ app, getWindow: () => window, createWindow: makeWindow, handle: (ch, fn) => { handlers[ch] = fn; }, argv: ['5E', first] });
  let prevented = false; app.emit('open-file', { preventDefault: () => { prevented = true; } }, mac);
  assert.ok(prevented); assert.equal(created, 0, '뜨기 전에는 창을 만들지 않음');
  isReady = true; makeWindow();
  handlers['project:renderer-ready'](); await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(sent, [['project:open', 'argv.5e'], ['project:open', 'finder.5e']]);
  app.emit('second-instance', {}, ['5E.exe', second]);
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(sent.at(-1), ['project:open', 'second.5e']); assert.ok(focused >= 1);
  webContents.emit('did-navigate'); app.emit('open-file', { preventDefault() {} }, first);
  await new Promise(r => setTimeout(r, 20));
  assert.equal(sent.length, 3, '다시 읽힌 창은 준비를 다시 알릴 때까지 기다림');
});
