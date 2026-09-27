import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { auditExamMotifs } from './audit-exam-motifs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('Given the 1.6 release, when auditing, then it reports that exam illustrations are not bundled', () => {
  const result = auditExamMotifs(root);
  assert.deepEqual(result.errors, []);
  assert.equal(result.sampleCount, 0);
  assert.equal(result.sampleAvailability, 'not-bundled');
  assert.equal(result.manifestCount, 0);
  assert.equal(result.legacyFileCount, 0);
  assert.ok(result.motifCount > 0);
});

test('Given a stale catalog, when auditing, then it reports obsolete release content', (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), '5e-motif-audit-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const target = path.join(fixture, 'preview/assets/exam-library/sample-catalog.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, '{}');
  assert.match(auditExamMotifs(fixture).errors.join('\n'), /obsolete preview exam library file remains: .*sample-catalog\.json/);
});

test('Given a stale exam PNG, when auditing, then it reports obsolete release content', (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), '5e-motif-audit-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const target = path.join(fixture, 'preview/assets/exam-library/images/stale.png');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.from([137, 80, 78, 71]));
  assert.match(auditExamMotifs(fixture).errors.join('\n'), /obsolete preview exam library file remains: .*stale\.png/);
});

test('Given the release checkout, when running the CLI, then zero samples are described as not bundled', () => {
  const output = execFileSync(process.execPath, [path.join(root, 'scripts/engine-v2/audit-exam-motifs.mjs'), '--check'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.match(output, /0 sample entries \(not-bundled\)/);
});
