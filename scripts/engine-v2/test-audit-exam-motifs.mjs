import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { auditExamMotifs } from './audit-exam-motifs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('audits the bundled exam samples and code motifs', () => {
  const result = auditExamMotifs(root);
  assert.deepEqual(result.errors, []);
  assert.ok(result.sampleCount > 0);
  assert.ok(result.manifestCount >= result.sampleCount);
  assert.ok(result.motifCount > 0);
});

test('reports a missing sample image as a finding', (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), '5e-motif-audit-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  for (const relative of ['preview/assets/exam-library/sample-catalog.json', 'preview/assets/exam-library/manifest.json']) {
    const target = path.join(fixture, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, relative), target);
  }
  assert.match(auditExamMotifs(fixture).errors.join('\n'), /sample image missing/);
});

test('rejects malformed catalog JSON instead of reporting success', (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), '5e-motif-audit-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const target = path.join(fixture, 'preview/assets/exam-library/sample-catalog.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, '{malformed');
  assert.throws(() => auditExamMotifs(fixture), SyntaxError);
});
