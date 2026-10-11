const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');

const root = fs.realpathSync(path.resolve(__dirname, '..'));
const workspace = createHash('sha256').update(root).digest('hex');

async function previewAt(origin) {
  try {
    const response = await fetch(`${origin}/api/local-preview`, { signal:AbortSignal.timeout(600) });
    const identity = response.ok ? await response.json() : null;
    if (identity?.app === '5e-local-preview' && identity.workspace === workspace) return 'ours';
    return 'other';
  } catch (error) {
    if (error.cause?.code === 'ECONNREFUSED') return 'absent';
    return 'other';
  }
}

async function startLocalExam({ port = Number(process.env.PORT || 4188), openBrowser = true } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT는 1~65535 사이의 정수여야 합니다.');
  const origin = `http://127.0.0.1:${port}`, url = `${origin}/?mode=pro&mobile=0&exam=1`;
  const state = await previewAt(origin);
  if (state === 'other') throw new Error(`${port} 포트를 다른 작업이 사용하고 있습니다. PORT=4190 npm run exam 처럼 다른 포트로 실행하세요.`);
  let child;
  if (state === 'absent') {
    const log = path.join(root, '_work/rhwp/local-preview.log');
    fs.mkdirSync(path.dirname(log), { recursive:true });
    const descriptor = fs.openSync(log, 'a');
    try {
      child = spawn(process.execPath, [path.join(__dirname, 'preview-local-server.cjs')], {
        cwd:root, env:{ ...process.env, PORT:String(port), FIVE_E_SITE_ROOT:root },
        detached:true, stdio:['ignore', descriptor, descriptor],
      });
    } finally { fs.closeSync(descriptor); }
    let failure;
    child.on('error', error => { failure = error; });
    child.unref();
    try {
      let ready = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        if (failure) throw failure;
        if (child.exitCode !== null || child.signalCode !== null) throw new Error('로컬 서버가 종료되었습니다.');
        if (await previewAt(origin) === 'ours') { ready = true; break; }
        await delay(100);
      }
      if (!ready) throw new Error('로컬 서버가 준비되지 않았습니다.');
    } catch (error) {
      child.kill('SIGTERM');
      throw new Error(`${error.message} 로그: ${log}`);
    }
  }
  console.log(`RHWP 시험지: ${url}`);
  if (openBrowser) {
    if (process.platform !== 'darwin') throw new Error(`Safari 자동 열기는 macOS에서 지원합니다. 브라우저에서 ${url}을 여세요.`);
    await new Promise((resolve, reject) => {
      const opener = spawn('/usr/bin/open', ['-a', 'Safari', url], { stdio:'ignore' });
      opener.once('error', reject);
      opener.once('exit', code => code === 0 ? resolve() : reject(new Error(`Safari를 열지 못했습니다. ${url}을 직접 여세요.`)));
    });
  }
  return { origin, url, reused:state === 'ours', pid:child?.pid };
}

module.exports = { startLocalExam };
if (require.main === module) startLocalExam({ openBrowser:!process.argv.includes('--no-open') }).catch(error => {
  console.error(error.message); process.exitCode = 1;
});
