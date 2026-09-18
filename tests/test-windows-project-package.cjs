const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { createSharingDevServer } = require('../experiments/web-codex-auth/sharing-dev.cjs');

test('Windows web saving returns an executable with the original project instead of a Mac archive', async t => {
  // Given an isolated product server and a Windows browser.
  const server = createSharingDevServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const json = JSON.stringify({ version: '0.17', pages: [{ id: '한국어', objects: [] }] });
  // When it requests a Windows project download.
  const response = await fetch(`${origin}/api/project-package`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-5E-Request': '1', 'X-5E-Target': 'win32' }, body: json,
  });
  // Then the downloaded file contains the executable and exact editable source.
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0, 2).toString(), 'MZ');
  const { parseWindowsProjectBytes } = require('../desktop/windows-project-package.cjs');
  const project = parseWindowsProjectBytes(bytes);
  assert.equal(project.json, json);
  assert.equal(project.settings.server, origin);
  assert.equal(project.settings.editorOrigin, origin);
});

test('Windows project parsing rejects changed or truncated source', async () => {
  // Given a real exported Windows project.
  const { createWindowsProjectPackage, parseWindowsProjectBytes } = require('../desktop/windows-project-package.cjs');
  const pkg = await createWindowsProjectPackage({ json: '{"pages":[]}', server: 'http://127.0.0.1:19624' });
  try {
    const bytes = await fs.readFile(pkg.bundle);
    // When the source is modified after saving.
    bytes[bytes.length - 57] ^= 1;
    // Then the original-file integrity check rejects it.
    assert.throws(() => parseWindowsProjectBytes(bytes));
    assert.throws(() => parseWindowsProjectBytes(bytes.subarray(0, bytes.length - 1)));
  } finally { await pkg.close(); }
});

test('web import reads a saved Windows executable as data without executing it', async () => {
  // Given a real project executable and the browser source reader.
  const { extractWindowsProjectSource } = await import('../js/windows-project-source.mjs');
  const { createWindowsProjectPackage } = require('../desktop/windows-project-package.cjs');
  const json = '{"pages":[{"id":"한글","objects":[]}]}';
  const pkg = await createWindowsProjectPackage({ json });
  try {
    const bytes = await fs.readFile(pkg.bundle);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    // When the user imports this file in either browser or desktop renderer.
    const source = await extractWindowsProjectSource(buffer);
    // Then it reads exact editable source without invoking the executable.
    assert.equal(source, json);
    new Uint8Array(buffer)[buffer.byteLength - 57] ^= 1;
    await assert.rejects(extractWindowsProjectSource(buffer));
  } finally { await pkg.close(); }
});

test('Windows saving preserves the previous project and rejects unrelated executables', async t => {
  // Given a new project and an isolated save directory.
  const path = require('node:path'), os = require('node:os');
  const { createWindowsProjectPackage, saveWindowsProjectPackage, parseWindowsProjectBytes } = require('../desktop/windows-project-package.cjs');
  const pkg = await createWindowsProjectPackage({ json: '{"pages":[]}' });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '5e-win-save-'));
  t.after(async () => { await pkg.close(); await fs.rm(root, { recursive: true, force: true }); });
  const destination = path.join(root, '프로젝트.exe');
  await fs.copyFile(pkg.bundle, destination);
  // When a saved project is replaced.
  await saveWindowsProjectPackage(pkg.bundle, destination);
  // Then the previous source remains separately and unrelated programs remain untouched.
  const previous = (await fs.readdir(root)).find(name => name.startsWith('프로젝트.exe.previous-'));
  assert.equal(parseWindowsProjectBytes(await fs.readFile(path.join(root, previous))).json, '{"pages":[]}');
  const other = path.join(root, 'other.exe');
  await fs.writeFile(other, 'user executable');
  await assert.rejects(saveWindowsProjectPackage(pkg.bundle, other));
  assert.equal(await fs.readFile(other, 'utf8'), 'user executable');
});

test('Windows project overhead stays below 512KiB while retaining its original source', async () => {
  // Given a small document whose images cannot explain launcher overhead.
  const { createWindowsProjectPackage, parseWindowsProjectBytes } = require('../desktop/windows-project-package.cjs');
  const json = '{"pages":[{"id":"용량 확인","objects":[]}]}';
  const pkg = await createWindowsProjectPackage({ json });
  try {
    // When the product creates a standalone project.
    const bytes = await fs.readFile(pkg.bundle);
    // Then its per-document overhead is bounded and the original is unchanged.
    assert.ok(bytes.length - Buffer.byteLength(json) < 512 * 1024, `overhead: ${bytes.length - Buffer.byteLength(json)} bytes`);
    assert.equal(parseWindowsProjectBytes(bytes).json, json);
  } finally { await pkg.close(); }
});
