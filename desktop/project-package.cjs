const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const MAX_PROJECT_BYTES = 32 * 1024 * 1024;

function parseProject(json) {
  if (typeof json !== 'string' || Buffer.byteLength(json) > MAX_PROJECT_BYTES) throw new Error('프로젝트는 32MB 이하로 저장해 주세요.');
  const value = JSON.parse(json);
  if (!value || typeof value !== 'object' || !Array.isArray(value.pages) && !Array.isArray(value.objects)) throw new Error('5E 프로젝트 데이터가 올바르지 않습니다.');
  return value;
}

async function createProjectPackage({ json, server = 'https://www.5e.ai.kr', development }) {
  parseProject(json);
  if (process.platform !== 'darwin') throw new Error('실행형 프로젝트 저장은 현재 macOS에서만 지원합니다.');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '5e-project-package-'));
  try {
    const bundle = path.join(root, '5E 프로젝트.app');
    const contents = path.join(bundle, 'Contents');
    const resources = path.join(contents, 'Resources');
    await fs.mkdir(path.join(contents, 'MacOS'), { recursive: true });
    await fs.mkdir(resources);
    // Each document gets fresh inodes and an immutable, unique app registration.
    await fs.copyFile(path.join(__dirname, 'project-launcher', 'launcher'), path.join(contents, 'MacOS', 'launcher'));
    await fs.chmod(path.join(contents, 'MacOS', 'launcher'), 0o755);
    await fs.copyFile(path.join(__dirname, 'project-launcher', 'BlueDocument.icns'), path.join(resources, 'BlueDocument.icns'));
    await fs.writeFile(path.join(resources, 'document.5e'), json, { mode: 0o600 });
    await fs.writeFile(path.join(resources, 'launch.json'), JSON.stringify({
      server, applicationIdentifier: 'com.5e.editor',
      editorOrigin: new URL(process.env.FIVE_E_PROJECT_EDITOR_URL || server).origin,
      ...(development ? { developmentExecutable: development.executable, developmentArguments: development.args, developmentEnvironment: development.environment } : {}),
    }));
    await fs.writeFile(path.join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.5e.document.d${randomUUID().replaceAll('-', '')}</string>
<key>CFBundleName</key><string>5E 프로젝트</string><key>CFBundleExecutable</key><string>launcher</string>
<key>CFBundlePackageType</key><string>APPL</string><key>CFBundleIconFile</key><string>BlueDocument.icns</string>
<key>CFBundleVersion</key><string>1</string><key>CFBundleShortVersionString</key><string>1.0</string>
<key>LSMinimumSystemVersion</key><string>13.0</string><key>NSHighResolutionCapable</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict></dict></plist>`);
    const identity = process.env.FIVE_E_PROJECT_SIGNING_IDENTITY || '-';
    await run('/usr/bin/codesign', ['--force', '--sign', identity, bundle]);
    await run('/usr/bin/codesign', ['--verify', '--strict', bundle]);
    return { root, bundle, close: () => fs.rm(root, { recursive: true, force: true }) };
  } catch (error) {
    await fs.rm(root, { recursive: true, force: true });
    throw error;
  }
}

async function projectPackageZip(options) {
  const result = await createProjectPackage(options);
  try {
    const zip = path.join(result.root, 'project.zip');
    await run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', result.bundle, zip]);
    return await fs.readFile(zip);
  } finally { await result.close(); }
}

async function saveProjectPackage(bundle, destination) {
  const staging = path.join(path.dirname(destination), `.5e-project-${randomUUID()}.app`);
  let previous;
  try {
    await fs.cp(bundle, staging, { recursive: true, force: false, errorOnExist: true });
    try {
      const stat = await fs.lstat(destination);
      if (!stat.isDirectory()) throw new Error('새 프로젝트 이름으로 저장해 주세요.');
      const identifier = await run('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', path.join(destination, 'Contents/Info.plist')]);
      if (!/^com\.5e\.document\.d[a-f0-9]{32}$/.test(identifier.stdout.trim())) throw new Error('프로젝트 파일이 아닌 앱은 덮어쓸 수 없습니다. 새 이름으로 저장해 주세요.');
      previous = destination + '.previous-' + Date.now();
    }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (previous) await fs.rename(destination, previous);
    try { await fs.rename(staging, destination); }
    catch (error) { if (previous) await fs.rename(previous, destination); throw error; }
  } finally { await fs.rm(staging, { recursive: true, force: true }); }
}

module.exports = { createProjectPackage, projectPackageZip, saveProjectPackage, parseProject, MAX_PROJECT_BYTES };
