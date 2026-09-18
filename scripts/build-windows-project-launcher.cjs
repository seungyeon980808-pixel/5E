const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);

async function build() {
  const cwd = path.resolve(__dirname, '../desktop/project-launcher/windows');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), '5e-native-launcher-build-'));
  const zig = process.env.FIVE_E_ZIG || 'zig';
  try {
    const version = await run(zig, ['version']);
    if (version.stdout.trim() !== '0.15.2') throw new Error('Windows 실행기 빌드에는 Zig 0.15.2가 필요합니다.');
    const resource = path.join(temporary, 'document.res');
    await run(zig, ['rc', '/fo', resource, 'native/launcher.rc'], { cwd });
    const sources = ['core', 'arguments', 'windows-common', 'windows-handoff', 'windows-transfer', 'windows-main'].map(name => `native/${name}.c`);
    const output = path.join(temporary, 'launcher.exe');
    await run(zig, ['cc', '-target', 'x86_64-windows-gnu', '-std=c11', '-Os', '-flto', '-ffunction-sections', '-fdata-sections', '-Wall', '-Wextra', '-Werror', '-DCJSON_NESTING_LIMIT=128', '-DCJSON_HIDE_SYMBOLS', '-municode', '-Wl,--subsystem,windows', '-s', ...sources, 'native/vendor/cJSON.c', resource, '-lwinhttp', '-lbcrypt', '-lshell32', '-ladvapi32', '-o', output], { cwd, maxBuffer: 1024 * 1024 });
    const bytes = await fs.readFile(output);
    if (bytes.subarray(0, 2).toString() !== 'MZ' || bytes.length >= 512 * 1024) throw new Error('Windows 실행 파일 형식 또는 용량 확인에 실패했습니다.');
    await fs.copyFile(output, path.join(cwd, 'launcher.exe'));
    console.log(`Windows x64 native project launcher built: ${bytes.length} bytes`);
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}
build().catch(error => { console.error(error.message); process.exitCode = 1; });
