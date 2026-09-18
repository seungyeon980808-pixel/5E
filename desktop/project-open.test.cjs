const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createProjectOpen } = require('./project-open.cjs');

test('OS file opening waits for renderer readiness and preserves cold and warm requests', async t => {
  // Given an OS event source, an unready window, and a real project file.
  const app = new EventEmitter(), ipcMain = new EventEmitter();
  const sent = [], sender = { send: (...args) => sent.push(args) };
  const win = { webContents: sender, isDestroyed: () => false, isMinimized: () => false, show() {}, focus() {} };
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '5e-open-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'project.5e');
  const json = JSON.stringify({ pages: [{ id: 'one', objects: [] }] });
  await fs.writeFile(file, json);
  const receiver = createProjectOpen({ app, ipcMain, getWindow: () => win });
  // When a file arrives before the renderer subscribes, then readiness releases it once.
  await receiver.receive(file);
  assert.equal(sent.length, 0);
  ipcMain.emit('project:ready', { sender });
  assert.deepEqual(sent, [['project:open', { json }]]);
  // When another file arrives in the running app, then it reaches the same renderer.
  await receiver.receive(file);
  assert.equal(sent.length, 2);
});

test('malformed OS file input reports failure without supplying replacement drawing data', async t => {
  // Given malformed input in an isolated file.
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '5e-open-invalid-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'bad.5e'); await fs.writeFile(file, '{}');
  const sent = [], sender = { send: (_, value) => sent.push(value) };
  const ipcMain = new EventEmitter();
  const receiver = createProjectOpen({ app: new EventEmitter(), ipcMain, getWindow: () => ({ webContents: sender, isDestroyed: () => false, isMinimized: () => false, show() {}, focus() {} }) });
  ipcMain.emit('project:ready', { sender });
  // When the OS requests that file.
  await receiver.receive(file);
  // Then an error is delivered instead of JSON that could overwrite current work.
  assert.ok(sent[0].error); assert.equal(sent[0].json, undefined);
});

test('temporary native handoff is removed only after its original bytes are read', async t => {
  // Given a native-owned temporary copy and a renderer not ready yet.
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '5e-project-open-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'document.5e'), json = '{"pages":[]}';
  await fs.writeFile(file, json);
  await fs.writeFile(path.join(root, '.5e-handoff'), '5E project handoff v1\n' + require('node:crypto').createHash('sha256').update(json).digest('hex'));
  const sender = { send: (_, value) => sent.push(value) }, sent = [], ipcMain = new EventEmitter();
  const win = { webContents: sender, isDestroyed: () => false, isMinimized: () => false, show() {}, focus() {} };
  const receiver = createProjectOpen({ app: new EventEmitter(), ipcMain, getWindow: () => win });
  // When it reads the handoff before renderer readiness.
  await receiver.receive(file);
  // Then only the owned disk copy is removed while the queued document remains usable.
  await assert.rejects(fs.stat(root), { code: 'ENOENT' });
  ipcMain.emit('project:ready', { sender });
  assert.deepEqual(sent, [{ json }]);
});

test('opening an ordinary project in a similarly named folder preserves user files', async t => {
  // Given a user file without a matching native ownership receipt.
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '5e-project-open-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'document.5e'), json = '{"pages":[]}';
  await fs.writeFile(file, json);
  await fs.writeFile(path.join(root, '.5e-handoff'), 'unrelated data');
  const receiver = createProjectOpen({ app: new EventEmitter(), ipcMain: new EventEmitter(), getWindow: () => null });
  // When that file is read.
  await receiver.receive(file);
  // Then neither the original nor unrelated marker is deleted.
  assert.equal(await fs.readFile(file, 'utf8'), json);
  assert.equal(await fs.readFile(path.join(root, '.5e-handoff'), 'utf8'), 'unrelated data');
});
