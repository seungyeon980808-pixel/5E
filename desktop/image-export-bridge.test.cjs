const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('desktop image export is exposed through fiveEDesktop and registered only in the main process', () => {
  const preload = fs.readFileSync(path.join(__dirname, 'preload.cjs'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  assert.match(preload, /imageExport:\s*\{\s*save: \(payload\) => ipcRenderer\.invoke\("image-export:save", payload\)/);
  assert.match(main, /ipcMain\.handle\("image-export:save", \(event, payload = \{\}\) => \{/);
  assert.match(main, /event\.sender !== win\.webContents/);
  assert.ok(manifest.build.files.includes('desktop/image-export-service.cjs'));
  assert.doesNotMatch(preload, /showSaveDialog|writeFile|filePath\s*:/);
});
