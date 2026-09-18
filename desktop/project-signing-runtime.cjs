'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const VERSION = '0.29.0';
const ARCHIVE = `apple-codesign-${VERSION}-x86_64-unknown-linux-musl`;
const SHA256 = 'dbe85cedd8ee4217b64e9a0e4c2aef92ab8bcaaa41f20bde99781ff02e600002';

async function ensureProjectSigner() {
  if (process.platform !== 'linux' || process.env.FIVE_E_RCODESIGN) return;
  if (process.arch !== 'x64') throw new Error('프로젝트 서명 서버는 Linux x64가 필요합니다.');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '5e-project-signer-'));
  try {
    const response = await fetch(`https://github.com/indygreg/apple-platform-rs/releases/download/apple-codesign/${VERSION}/${ARCHIVE}.tar.gz`, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`프로젝트 서명 도구 다운로드 실패: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== SHA256) throw new Error('프로젝트 서명 도구 체크섬이 일치하지 않습니다.');
    const archive = path.join(root, 'signer.tar.gz');
    await fs.writeFile(archive, bytes);
    await run('tar', ['-xzf', archive, '-C', root, `${ARCHIVE}/rcodesign`]);
    await fs.unlink(archive);
    const executable = path.join(root, ARCHIVE, 'rcodesign');
    await fs.chmod(executable, 0o700);
    await run(executable, ['--version']);
    process.env.FIVE_E_RCODESIGN = executable;
  } catch (error) {
    await fs.rm(root, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { ensureProjectSigner };
