const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('platform helpers import without browser navigator in CLI and CI', () => {
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', `
    delete globalThis.navigator;
    const { IS_MAC, MOD_LABEL, modKey } = await import('./js/platform.js');
    if (IS_MAC || MOD_LABEL !== 'Ctrl' || !modKey({ctrlKey:true,metaKey:false})) process.exit(2);
  `], {cwd:path.resolve(__dirname, '..'), encoding:'utf8'});
  assert.equal(run.status, 0, run.stderr);
});
