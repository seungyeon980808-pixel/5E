import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const fixtureDir = path.dirname(fileURLToPath(new URL('./fixtures/rights-clear-smoke.png', import.meta.url)));
const fixturePath = path.join(fixtureDir, 'rights-clear-smoke.png');
const generatorPath = path.join(fixtureDir, 'generate-rights-clear-smoke.mjs');
const provenancePath = path.join(fixtureDir, 'rights-clear-smoke.provenance.json');

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngContent(bytes) {
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const metadata = [], compressed = [];
  let offset = 8, ended = false;
  while (offset < bytes.length) {
    assert.ok(offset + 12 <= bytes.length, 'truncated PNG chunk');
    const length = bytes.readUInt32BE(offset);
    assert.ok(offset + length + 12 <= bytes.length, 'truncated PNG payload');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    assert.equal(bytes.readUInt32BE(offset + 8 + length), crc32(bytes.subarray(offset + 4, offset + 8 + length)), `${type} CRC`);
    if (type === 'IDAT') compressed.push(data);
    else metadata.push({ type, data });
    offset += length + 12;
    if (type === 'IEND') { ended = true; break; }
  }
  assert.ok(ended && offset === bytes.length && compressed.length, 'complete PNG required');
  assert.equal(metadata[0]?.type, 'IHDR');
  const header = metadata[0].data;
  assert.equal(header.length, 13);
  assert.deepEqual([...header.subarray(8)], [8, 2, 0, 0, 0], 'fixture must remain non-interlaced 8-bit RGB');
  const pixels = inflateSync(Buffer.concat(compressed));
  assert.equal(pixels.length, header.readUInt32BE(4) * (header.readUInt32BE(0) * 3 + 1));
  return { metadata, pixels };
}

function equivalentPng(actual, expected) {
  // Compression bytes depend on zlib. Header, density, other chunks, and every
  // decompressed scanline byte must still match the committed original.
  assert.deepEqual(pngContent(actual), pngContent(expected));
}

function reencodeFixture({ level = 1, changePixels = false, changeDensity = false } = {}) {
  const parsed = pngContent(fs.readFileSync(fixturePath));
  if (changePixels) parsed.pixels[1] ^= 1;
  if (changeDensity) parsed.metadata.find(chunk => chunk.type === 'pHYs').data = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 1]);
  const chunks = [...parsed.metadata];
  chunks.splice(chunks.length - 1, 0, { type: 'IDAT', data: deflateSync(parsed.pixels, { level }) });
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks.map(({ type, data }) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const chunk = Buffer.alloc(data.length + 12);
    chunk.writeUInt32BE(data.length); body.copy(chunk, 4); chunk.writeUInt32BE(crc32(body), chunk.length - 4);
    return chunk;
  })]);
}

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

test('Given an empty working directory, when the recipe runs, then it reproduces the committed PNG content and metadata', (t) => {
  const workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), '5e-rights-clear-fixture-'));
  t.after(() => fs.rmSync(workingDirectory, { recursive: true, force: true }));
  const output = path.join(workingDirectory, 'generated.png');
  const receipt = JSON.parse(execFileSync(process.execPath, [generatorPath, '--output', output], {
    cwd: workingDirectory,
    encoding: 'utf8',
    env: {},
  }));
  assert.deepEqual(receipt.externalInputs, []);
  const generated = fs.readFileSync(output);
  assert.equal(receipt.sha256, createHash('sha256').update(generated).digest('hex'));
  equivalentPng(generated, fs.readFileSync(fixturePath));
});

test('different valid compression is accepted without accepting changed pixels or density', () => {
  const original = fs.readFileSync(fixturePath);
  const recompressed = reencodeFixture();
  assert.notDeepEqual(recompressed, original);
  equivalentPng(recompressed, original);
  assert.throws(() => equivalentPng(reencodeFixture({ changePixels: true }), original));
  assert.throws(() => equivalentPng(reencodeFixture({ changeDensity: true }), original));
});

test('corrupt or truncated PNG data is rejected before content comparison', () => {
  const original = fs.readFileSync(fixturePath);
  const corrupt = Buffer.from(original); corrupt[corrupt.length - 1] ^= 1;
  assert.throws(() => equivalentPng(corrupt, original), /CRC/);
  assert.throws(() => equivalentPng(original.subarray(0, -1), original), /truncated/);
});
