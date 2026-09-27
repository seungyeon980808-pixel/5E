import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const fixtureDir = path.dirname(fileURLToPath(new URL('./fixtures/rights-clear-smoke.png', import.meta.url)));
const fixturePath = path.join(fixtureDir, 'rights-clear-smoke.png');
const generatorPath = path.join(fixtureDir, 'generate-rights-clear-smoke.mjs');
const provenancePath = path.join(fixtureDir, 'rights-clear-smoke.provenance.json');

test('Given the rights-clear fixture, when provenance is inspected, then a reproducible generation recipe is present', () => {
  const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
  const fixture = fs.readFileSync(fixturePath);
  assert.equal(provenance.schemaVersion, 1);
  assert.equal(provenance.generator, 'tests/fixtures/generate-rights-clear-smoke.mjs');
  assert.deepEqual(provenance.sourceInputs, []);
  assert.equal(provenance.externalImageMaterial, false);
  assert.equal(provenance.width, 1005);
  assert.equal(provenance.height, 399);
  assert.equal(provenance.sha256, createHash('sha256').update(fixture).digest('hex'));
});

test('Given an empty working directory, when the recipe runs, then it reproduces the committed fixture byte for byte', (t) => {
  const workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), '5e-rights-clear-fixture-'));
  t.after(() => fs.rmSync(workingDirectory, { recursive: true, force: true }));
  const output = path.join(workingDirectory, 'generated.png');
  const receipt = JSON.parse(execFileSync(process.execPath, [generatorPath, '--output', output], {
    cwd: workingDirectory,
    encoding: 'utf8',
    env: {},
  }));
  assert.deepEqual(receipt.externalInputs, []);
  assert.deepEqual(fs.readFileSync(output), fs.readFileSync(fixturePath));
});
