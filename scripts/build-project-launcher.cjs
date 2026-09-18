const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const run = promisify(execFile);
async function build() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '5e-launcher-build-'));
  const source = path.resolve(__dirname, '../desktop/project-launcher/Launcher.swift');
  try {
    for (const arch of ['arm64', 'x86_64']) {
      await run('xcrun', ['swiftc', '-swift-version', '6', '-O', '-target', `${arch}-apple-macos13.0`, source, '-o', path.join(root, arch)]);
    }
    await run('xcrun', ['lipo', '-create', path.join(root, 'arm64'), path.join(root, 'x86_64'), '-output', path.join(path.dirname(source), 'launcher')]);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}
build().catch(error => { console.error(error.message); process.exitCode = 1; });
