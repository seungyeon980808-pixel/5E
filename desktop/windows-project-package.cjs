const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const { parseProject, MAX_PROJECT_BYTES } = require('./project-package.cjs');
const MAGIC = Buffer.from('5EPRJWIN00000001');
const FOOTER_SIZE = 56;

function endpoint(raw) {
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('프로젝트 웹 주소가 올바르지 않습니다.');
  }
  return url.origin;
}

function payloadEnd(bytes) {
  if (bytes.length < 256 || bytes.subarray(0, 2).toString() !== 'MZ') throw new Error('Windows 실행 파일이 아닙니다.');
  const pe = bytes.readUInt32LE(60);
  if (pe + 176 > bytes.length || bytes.readUInt32LE(pe) !== 0x4550 || bytes.readUInt16LE(pe + 4) !== 0x8664 || bytes.readUInt16LE(pe + 24) !== 0x20b) {
    throw new Error('Windows x64 실행 파일이 아닙니다.');
  }
  const certificateOffset = bytes.readUInt32LE(pe + 24 + 112 + 32);
  const certificateSize = bytes.readUInt32LE(pe + 24 + 112 + 36);
  const end = certificateOffset || bytes.length;
  if (end > bytes.length || certificateOffset && certificateOffset + certificateSize > bytes.length) throw new Error('서명 정보가 손상되었습니다.');
  for (let padding = 0; padding < 8; padding++) {
    const at = end - padding - FOOTER_SIZE;
    if (at >= 0 && bytes.subarray(at, at + 16).equals(MAGIC)) return end - padding;
    if (end - padding - 1 < 0 || bytes[end - padding - 1] !== 0) break;
  }
  throw new Error('5E 프로젝트 파일이 아닙니다.');
}

function parseWindowsProjectBytes(bytes) {
  const end = payloadEnd(bytes);
  const footer = bytes.subarray(end - FOOTER_SIZE, end);
  const jsonLength = footer.readUInt32LE(16), configLength = footer.readUInt32LE(20);
  if (!jsonLength || jsonLength > MAX_PROJECT_BYTES || !configLength || configLength > 65536 || jsonLength + configLength > end - FOOTER_SIZE) {
    throw new Error('프로젝트 크기가 올바르지 않습니다.');
  }
  const body = bytes.subarray(end - FOOTER_SIZE - jsonLength - configLength, end - FOOTER_SIZE);
  if (!createHash('sha256').update(body).digest().equals(footer.subarray(24))) throw new Error('프로젝트 원본이 변경되거나 손상되었습니다.');
  const json = body.subarray(0, jsonLength).toString('utf8');
  const settings = JSON.parse(body.subarray(jsonLength).toString('utf8'));
  parseProject(json); endpoint(settings.server); endpoint(settings.editorOrigin);
  return { json, settings };
}

async function createWindowsProjectPackage({ json, server = 'https://www.5e.ai.kr', development }) {
  parseProject(json);
  const thirdPartyNotices = await fs.readFile(path.join(__dirname, 'project-launcher/windows/ThirdPartyNotices.txt'), 'utf8');
  const settings = { server: endpoint(server), editorOrigin: endpoint(new URL(process.env.FIVE_E_PROJECT_EDITOR_URL || server).origin), thirdPartyNotices, ...(development ? { development } : {}) };
  const config = Buffer.from(JSON.stringify(settings)), source = Buffer.from(json);
  if (config.length > 65536) throw new Error('프로젝트 실행 설정이 너무 큽니다.');
  const launcher = await fs.readFile(path.join(__dirname, 'project-launcher/windows/launcher.exe'));
  const footer = Buffer.alloc(FOOTER_SIZE);
  MAGIC.copy(footer); footer.writeUInt32LE(source.length, 16); footer.writeUInt32LE(config.length, 20);
  createHash('sha256').update(source).update(config).digest().copy(footer, 24);
  const bytes = Buffer.concat([launcher, source, config, footer]);
  parseWindowsProjectBytes(bytes);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '5e-windows-project-'));
  try {
    const bundle = path.join(root, '5E 프로젝트.exe');
    await fs.writeFile(bundle, bytes, { mode: 0o600 });
    return { root, bundle, close: () => fs.rm(root, { recursive: true, force: true }) };
  } catch (error) { await fs.rm(root, { recursive: true, force: true }); throw error; }
}

async function saveWindowsProjectPackage(bundle, destination) {
  const staging = path.join(path.dirname(destination), `.5e-project-${randomUUID()}.exe`);
  let previous;
  try {
    await fs.copyFile(bundle, staging, fs.constants.COPYFILE_EXCL);
    try {
      const stat = await fs.lstat(destination);
      if (!stat.isFile() || stat.size > 64 * 1024 * 1024) throw new Error('프로젝트 파일이 아닌 항목은 덮어쓸 수 없습니다.');
      parseWindowsProjectBytes(await fs.readFile(destination));
      previous = destination + '.previous-' + Date.now();
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (previous) await fs.rename(destination, previous);
    try { await fs.rename(staging, destination); }
    catch (error) { if (previous) await fs.rename(previous, destination); throw error; }
  } finally { await fs.rm(staging, { force: true }); }
}

module.exports = { createWindowsProjectPackage, saveWindowsProjectPackage, parseWindowsProjectBytes };
