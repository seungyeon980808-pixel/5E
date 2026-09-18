const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const run = promisify(require('node:child_process').execFile);
const { projectPackageZip } = require('../desktop/project-package.cjs');

test('portable signing and ZIP preserve a macOS-valid executable bundle and resource seal', {
  skip: !process.env.FIVE_E_RCODESIGN || process.platform !== 'darwin',
}, async t => {
  const json = JSON.stringify({ pages: [{ id: 'portable', objects: [] }] });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '5e-portable-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const bytes = await projectPackageZip({ json });
  await fs.writeFile(path.join(root, 'project.zip'), bytes);
  await run('/usr/bin/unzip', ['-q', path.join(root, 'project.zip'), '-d', root]);
  const bundle = path.join(root, '5E 프로젝트.app');
  assert.equal(await fs.readFile(path.join(bundle, 'Contents/Resources/document.5e'), 'utf8'), json);
  assert.ok((await fs.stat(path.join(bundle, 'Contents/MacOS/launcher'))).mode & 0o111);
  await run('/usr/bin/codesign', ['--verify', '--strict', '--all-architectures', bundle]);
  await fs.writeFile(path.join(bundle, 'Contents/Resources/document.5e'), '{"pages":[]}');
  await assert.rejects(run('/usr/bin/codesign', ['--verify', '--strict', bundle]));
  // Portable archives use UTF-8 filenames without macOS resource-fork metadata.
  const listing = await run('/usr/bin/unzip', ['-Z1', path.join(root, 'project.zip')]);
  assert.ok(!listing.stdout.includes('__MACOSX'));
});

for (const resource of ['Resources/document.5e', 'Info.plist', '_CodeSignature/CodeResources', 'MacOS/launcher']) {
  test(`portable verification rejects modified ${resource}`, { skip: !process.env.FIVE_E_RCODESIGN }, async t => {
    const { createProjectPackage } = require('../desktop/project-package.cjs');
    const { verifyPortableBundle } = require('../desktop/project-package-signature.cjs');
    const pkg = await createProjectPackage({ json: '{"pages":[]}' });
    t.after(pkg.close);
    const target = path.join(pkg.bundle, 'Contents', resource);
    const original = await fs.readFile(target);
    const modified = Buffer.from(original);
    // Modify code inside the first architecture, preserving the Mach-O header.
    const index = resource === 'MacOS/launcher' ? original.readUInt32BE(16) + 4096 : Math.floor(original.length / 2);
    modified[index] ^= 1;
    await fs.writeFile(target, modified);
    await assert.rejects(verifyPortableBundle(pkg.bundle));
  });
}
