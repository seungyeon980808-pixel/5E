const assert = require('node:assert/strict');
const { mkdtemp, readFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createImageExportService } = require('./image-export-service.cjs');

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Avh9WQAAAABJRU5ErkJggg==';
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

test('malformed image data and unsafe names are bounded before the native dialog opens', async () => {
  let dialogCalls = 0;
  const service = createImageExportService({
    showSaveDialog: async () => { dialogCalls += 1; return { canceled: true, filePath: '' }; },
    desktopPath: '/Desktop',
  });

  assert.deepEqual(await service.save({ dataUrl: 'data:image/jpeg;base64,AAAA', suggestedName: '../../bad.png' }), {
    ok: false, canceled: false, error: 'invalid-input',
  });
  assert.deepEqual(await service.save({ dataUrl: 'data:image/png;base64,AAAA', suggestedName: 'bad.png' }), {
    ok: false, canceled: false, error: 'invalid-input',
  });
  assert.equal(dialogCalls, 0);
});

test('canceling the native dialog is distinct and writes no file', async () => {
  let writes = 0;
  const service = createImageExportService({
    showSaveDialog: async () => ({ canceled: true, filePath: '' }),
    writeFile: async () => { writes += 1; },
    desktopPath: '/Desktop',
  });

  assert.deepEqual(await service.save({ dataUrl: PNG_DATA_URL, suggestedName: 'crop' }), {
    ok: false, canceled: true,
  });
  assert.equal(writes, 0);
});

test('a chosen location receives the exact PNG bytes with a safe Desktop default name', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), '5e-image-export-'));
  const target = path.join(directory, 'chosen.png');
  let dialogOptions;
  const service = createImageExportService({
    showSaveDialog: async (options) => { dialogOptions = options; return { canceled: false, filePath: target }; },
    desktopPath: '/Users/test/Desktop',
  });

  const result = await service.save({ dataUrl: PNG_DATA_URL, suggestedName: '../exam:crop.PNG' });

  assert.deepEqual(result, { ok: true, canceled: false, filePath: target });
  assert.equal(dialogOptions.defaultPath, path.join('/Users/test/Desktop', 'exam-crop.png'));
  assert.deepEqual(await readFile(target), Buffer.from(PNG_BASE64, 'base64'));
});

test('I/O failures do not report success or expose internal error details', async () => {
  const service = createImageExportService({
    showSaveDialog: async () => ({ canceled: false, filePath: '/chosen/crop.png' }),
    writeFile: async () => { const error = new Error('/secret/path disk full'); error.code = 'ENOSPC'; throw error; },
    desktopPath: '/Desktop',
  });

  assert.deepEqual(await service.save({ dataUrl: PNG_DATA_URL, suggestedName: 'crop.png' }), {
    ok: false, canceled: false, error: 'write-failed',
  });
});

test('repeated clicks cannot open concurrent dialogs or duplicate writes', async () => {
  let release;
  let dialogs = 0;
  const service = createImageExportService({
    showSaveDialog: async () => {
      dialogs += 1;
      await new Promise((resolve) => { release = resolve; });
      return { canceled: true, filePath: '' };
    },
    desktopPath: '/Desktop',
  });

  const first = service.save({ dataUrl: PNG_DATA_URL, suggestedName: 'crop.png' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await service.save({ dataUrl: PNG_DATA_URL, suggestedName: 'crop.png' }), {
    ok: false, canceled: false, error: 'busy',
  });
  release();
  assert.deepEqual(await first, { ok: false, canceled: true });
  assert.equal(dialogs, 1);
});
