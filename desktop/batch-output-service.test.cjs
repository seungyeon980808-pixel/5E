const assert = require('node:assert/strict');
const { mkdtemp, readFile, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createBatchOutputService, sanitizeTargetName } = require('./batch-output-service.cjs');

test('Given unsafe source names, when sanitized, then traversal and reserved filename characters are removed', () => {
  // Given
  const sourceName = '../bad:<name>?*.PNG';

  // When
  const target = sanitizeTargetName(sourceName);

  // Then
  assert.equal(target, 'bad-name');
});

test('Given a Windows device name, when sanitized, then the target is safe for desktop output', () => {
  // Given
  const sourceName = 'CON.png';

  // When
  const target = sanitizeTargetName(sourceName);

  // Then
  assert.equal(target, '_CON');
});

test('Given original and colliding outputs, when PNGs are written, then deterministic new names are used without overwriting any existing file', async () => {
  // Given
  const directory = await mkdtemp(path.join(os.tmpdir(), '5e-batch-output-'));
  const original = path.join(directory, 'figure.png');
  const collision = path.join(directory, 'figure-converted.png');
  await writeFile(original, 'original');
  await writeFile(collision, 'existing-output');
  const service = createBatchOutputService();

  // When
  const first = await service.write({ outputDirectory: directory, sourceName: 'figure.png', originalPath: original, data: Buffer.from('generated-1') });
  const second = await service.write({ outputDirectory: directory, sourceName: 'figure.png', originalPath: original, data: Buffer.from('generated-2') });

  // Then
  assert.equal(path.basename(first.path), 'figure-converted (2).png');
  assert.equal(path.basename(second.path), 'figure-converted (3).png');
  assert.equal(await readFile(original, 'utf8'), 'original');
  assert.equal(await readFile(collision, 'utf8'), 'existing-output');
  assert.equal(await readFile(first.path, 'utf8'), 'generated-1');
  assert.match(first.sha256, /^[a-f0-9]{64}$/);
});

test('Given a source path equal to the first target candidate, when output is written, then the source is skipped even if absent', async () => {
  // Given
  const directory = await mkdtemp(path.join(os.tmpdir(), '5e-batch-original-'));
  const reservedOriginal = path.join(directory, 'figure-converted.png');
  const service = createBatchOutputService();

  // When
  const result = await service.write({ outputDirectory: directory, sourceName: 'figure.png', originalPath: reservedOriginal, data: Buffer.from('generated') });

  // Then
  assert.equal(path.basename(result.path), 'figure-converted (2).png');
});

test('Given ENOSPC after exclusive creation, when output fails, then the created partial file is removed and an existing collision is preserved', async () => {
  // Given
  const directory = await mkdtemp(path.join(os.tmpdir(), '5e-batch-enospc-'));
  const collision = path.join(directory, 'figure-converted.png');
  const partial = path.join(directory, 'figure-converted (2).png');
  await writeFile(collision, 'existing-output');
  const fileSystem = {
    ...require('node:fs/promises'),
    async open(target, flags) {
      const handle = await require('node:fs/promises').open(target, flags);
      return {
        async writeFile() {
          await handle.writeFile('partial');
          const error = new Error('disk full');
          error.code = 'ENOSPC';
          throw error;
        },
        close: () => handle.close(),
      };
    },
  };
  const service = createBatchOutputService({ fileSystem });

  // When
  const write = service.write({ outputDirectory: directory, sourceName: 'figure.png', data: Buffer.from('generated') });

  // Then
  await assert.rejects(write, error => error.code === 'ENOSPC');
  await assert.rejects(readFile(partial), error => error.code === 'ENOENT');
  assert.equal(await readFile(collision, 'utf8'), 'existing-output');
});

test('collective task output keeps its descriptive name and still suffixes collisions', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), '5e-task-output-'));
  await writeFile(path.join(directory, '작업 1 - figure.png'), 'existing');
  const service = createBatchOutputService();

  const result = await service.write({
    outputDirectory: directory,
    sourceName: '작업 1 - figure',
    data: Buffer.from('selected-result'),
    appendConverted: false,
  });

  assert.equal(path.basename(result.path), '작업 1 - figure (2).png');
  assert.equal(await readFile(path.join(directory, '작업 1 - figure.png'), 'utf8'), 'existing');
  assert.equal(await readFile(result.path, 'utf8'), 'selected-result');
});
