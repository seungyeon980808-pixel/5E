const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);

async function createDriver() {
  const cwd = path.resolve(__dirname, '../../desktop/project-launcher/windows');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '5e-native-core-test-'));
  const executable = path.join(root, process.platform === 'win32' ? 'driver.exe' : 'driver');
  const common = ['native/core-driver.c', 'native/core.c', 'native/arguments.c'];
  try {
    if (process.platform === 'win32') {
      await run(process.env.FIVE_E_ZIG || 'zig', ['cc', '-target', 'x86_64-windows-gnu', '-std=c11', '-Os', '-Wall', '-Wextra', '-Werror', '-DCJSON_NESTING_LIMIT=128', '-DCJSON_HIDE_SYMBOLS', '-municode', ...common, 'native/windows-common.c', 'native/windows-handoff.c', 'native/windows-transfer.c', 'native/vendor/cJSON.c', '-lwinhttp', '-lbcrypt', '-ladvapi32', '-o', executable], { cwd });
    } else if (process.platform === 'darwin') {
      const vendor = path.join(root, 'cJSON.o');
      const flags = ['-std=c11', '-Wall', '-Wextra', '-DCJSON_NESTING_LIMIT=128', '-DCJSON_HIDE_SYMBOLS', '-fsanitize=undefined', '-g'];
      // Unmodified upstream print helpers use sprintf; suppress only their SDK deprecation warning.
      await run('cc', [...flags, '-Wno-deprecated-declarations', '-c', 'native/vendor/cJSON.c', '-o', vendor], { cwd });
      await run('cc', [...flags, '-Werror', ...common, vendor, '-o', executable], { cwd });
    } else throw new Error('Native launcher tests require Windows or macOS.');
    return { root, run: args => run(executable, args, { timeout: 45000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, UBSAN_OPTIONS: 'halt_on_error=1:print_stacktrace=1' } }), close: () => fs.rm(root, { recursive: true, force: true }) };
  } catch (error) { await fs.rm(root, { recursive: true, force: true }); throw error; }
}
module.exports = { createDriver };
