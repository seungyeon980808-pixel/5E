const test = require('node:test');
const assert = require('node:assert/strict');
const { createSharingDevServer } = require('../experiments/web-codex-auth/sharing-dev.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createProjectPackage, saveProjectPackage } = require('../desktop/project-package.cjs');
const run = promisify(execFile);

test('native project opening accepts project bytes without sharing or authentication cookies', async t => {
  // Given an isolated product server and a project stored inside a launcher.
  const server = createSharingDevServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const project = { version: '0.17', pages: [{ id: 'page', objects: [] }], activePageId: 'page' };
  // When the native launcher transfers the file.
  const response = await fetch(`${origin}/api/project-launch`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-5E-Request': '1' }, body: JSON.stringify(project),
  });
  // Then the web app can retrieve the same editable data using an unguessable token.
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(new URL(result.url).origin, origin);
  const id = new URL(result.url).hash.slice('#project='.length);
  assert.match(id, /^[a-f0-9]{48}$/);
  assert.deepEqual(await (await fetch(`${origin}/api/project-launch/${id}`)).json(), project);
});

test('a saved macOS package preserves its document, icon, signature, and executable permissions', { skip: process.platform !== 'darwin' }, async t => {
  // Given editable data and an isolated destination.
  const json = JSON.stringify({ version: '0.17', pages: [{ id: 'page', objects: [] }] });
  const pkg = await createProjectPackage({ json, server: 'http://127.0.0.1:19624' });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '5e-package-test-'));
  t.after(async () => { await pkg.close(); await fs.rm(root, { recursive: true, force: true }); });
  const destination = path.join(root, '프로젝트.app');
  // When the product writes the app bundle to the chosen folder.
  await saveProjectPackage(pkg.bundle, destination);
  // Then it is an executable signed package containing the original bytes and blue icon.
  assert.equal(await fs.readFile(path.join(destination, 'Contents/Resources/document.5e'), 'utf8'), json);
  assert.ok((await fs.stat(path.join(destination, 'Contents/MacOS/launcher'))).mode & 0o111);
  assert.ok((await fs.stat(path.join(destination, 'Contents/Resources/BlueDocument.icns'))).size > 0);
  await run('/usr/bin/codesign', ['--verify', '--strict', destination]);
  const versions = await run('xcrun', ['vtool', '-show-build', path.join(destination, 'Contents/MacOS/launcher')]);
  assert.equal((versions.stdout.match(/minos 13\.0/g) || []).length, 2);
});

test('replacing a saved project preserves the previous document instead of merging bundle resources', { skip: process.platform !== 'darwin' }, async t => {
  // Given an earlier project package at the save destination.
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '5e-package-replace-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const destination = path.join(root, '프로젝트.app');
  await fs.mkdir(destination);
  await fs.writeFile(path.join(destination, 'old-project'), 'previous data');
  await fs.mkdir(path.join(destination, 'Contents'));
  await fs.writeFile(path.join(destination, 'Contents/Info.plist'), '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.5e.document.d00000000000000000000000000000000</string></dict></plist>');
  const fresh = path.join(root, 'fresh.app');
  await fs.mkdir(fresh); await fs.writeFile(path.join(fresh, 'new-project'), 'new data');
  // When the user saves to the same destination.
  await saveProjectPackage(fresh, destination);
  // Then old resources remain in a separate copy and never contaminate the new package.
  const previous = (await fs.readdir(root)).find(name => name.startsWith('프로젝트.app.previous-'));
  assert.equal(await fs.readFile(path.join(root, previous, 'old-project'), 'utf8'), 'previous data');
  assert.deepEqual(await fs.readdir(destination), ['new-project']);
});

test('project saving cannot replace an unrelated installed application', { skip: process.platform !== 'darwin' }, async t => {
  // Given an unrelated application and a new project package.
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '5e-package-protection-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const destination = path.join(root, 'Other.app'), fresh = path.join(root, 'Project.app');
  await fs.mkdir(destination); await fs.writeFile(path.join(destination, 'keep'), 'user application');
  await fs.mkdir(fresh); await fs.writeFile(path.join(fresh, 'project'), 'data');
  // When project saving targets the unrelated app.
  // Then it rejects the save and leaves that application at its original path.
  await assert.rejects(saveProjectPackage(fresh, destination));
  assert.equal(await fs.readFile(path.join(destination, 'keep'), 'utf8'), 'user application');
});
