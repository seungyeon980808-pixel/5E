import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

test('physics evaluation validates frozen inputs and prevents accidental paid reruns', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'physics-eval-guards-'));
  try {
    const cases = Array.from({ length: 20 }, (_, i) => {
      const sourcePath = path.join(dir, `source-${i}.png`), bytes = Buffer.from(`source-${i}`);
      fs.writeFileSync(sourcePath, bytes);
      return { id: `case-${i}`, sourcePath, sourceSHA256: crypto.createHash('sha256').update(bytes).digest('hex'), notInPreviousSubmittedHashes: true };
    });
    const manifestPath = path.join(dir, 'manifest.json'), output = path.join(dir, 'evidence');
    const manifest = { model: 'gpt-6.1-sol', effort: 'medium', cases };
    const write = value => fs.writeFileSync(manifestPath, JSON.stringify(value));
    const run = extra => spawnSync(process.execPath, ['tools/evaluate-physics-graphs.mjs'], { encoding: 'utf8', env: { ...process.env, PHYSICS_GRAPH_REAL: '1', PHYSICS_GRAPH_VALIDATE_ONLY: '1', PHYSICS_GRAPH_MANIFEST: manifestPath, EVIDENCE_DIR: output, CODEX_BINARY: 'must-never-start-a-provider', PHYSICS_GRAPH_CASES: cases.slice(0, 3).map(c => c.id).join(','), ...extra } });
    write(manifest);
    const valid = run(); assert.equal(valid.status, 0, valid.stderr); assert.match(valid.stdout, /"selectedCount":3/); assert.match(valid.stdout, /"modelCalls":0/);
    assert.notEqual(run({ PHYSICS_GRAPH_REAL: '' }).status, 0);
    write({ ...manifest, expectedCount: 3, cases: cases.slice(0, 3) }); assert.equal(run().status, 0);
    write({ ...manifest, cases: cases.slice(0, 3) }); assert.notEqual(run().status, 0);
    for (const expectedCount of [0, 21, 3.5]) { write({ ...manifest, expectedCount }); assert.notEqual(run().status, 0); }
    write({ ...manifest, frozenPromptVersion: 'obsolete-prompt' });
    assert.notEqual(run().status,0);
    assert.equal(run({ PHYSICS_GRAPH_PASS: '2' }).status,0);
    write(manifest);
    assert.equal(run({ PHYSICS_GRAPH_PASS: '2' }).status, 0);
    for (const value of ['0', '4', '1.5', 'oops']) assert.notEqual(run({ PHYSICS_GRAPH_PASS: value }).status, 0);
    write({ ...manifest, model: 'another-model' }); assert.notEqual(run().status, 0);
    write({ ...manifest, effort: 'high' }); assert.notEqual(run().status, 0);
    write({ ...manifest, cases: [...cases.slice(0, 19), cases[0]] }); assert.notEqual(run().status, 0);
    write({ ...manifest, cases: cases.map((c, i) => i === 1 ? { ...c, sourceSHA256: cases[0].sourceSHA256 } : c) }); assert.notEqual(run().status, 0);
    write(manifest); assert.notEqual(run({ PHYSICS_GRAPH_CASES: 'unknown-case' }).status, 0);
    fs.appendFileSync(cases[0].sourcePath, 'changed'); assert.notEqual(run().status, 0);
    fs.writeFileSync(cases[0].sourcePath, 'source-0');
    fs.mkdirSync(path.join(output, 'case-0')); assert.notEqual(run().status, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
