import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decodeScopedPng, encodeScopedPng } from '../preview/js/ai-scoped-edit-png.js';
function chunk(type, data) {
 const out = Buffer.alloc(data.length + 12);
 out.writeUInt32BE(data.length); out.write(type, 4); out.set(data, 8);
 let crc = 0xffffffff;
 for (const byte of out.subarray(4, -4)) {
  crc ^= byte;
  for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
 }
 out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4);
 return out;
}
function chunks(input) {
 const buffer = Buffer.from(input);
 const found = [];
 for (let offset = 8; offset < buffer.length;) {
  const length = buffer.readUInt32BE(offset);
  found.push({offset, length, type: buffer.subarray(offset + 4, offset + 8).toString('ascii')});
  offset += length + 12;
 }
 return found;
}
function withoutChunk(input, type) {
 const retained = [input.subarray(0, 8)];
 for (const entry of chunks(input)) if (entry.type !== type) retained.push(input.subarray(entry.offset, entry.offset + entry.length + 12));
 return Buffer.concat(retained);
}
const pixels = Uint8Array.of(10, 20, 30, 255, 40, 50, 60, 128);
const png = await encodeScopedPng({width: 2, height: 1, data: pixels});
const exif = chunk('eXIf', Uint8Array.of(73,73,42,0,8,0,0,0,0,0,0,0,0,0));
for (const offset of [33, png.length - 12]) {
 const input = Buffer.concat([png.subarray(0, offset), exif, png.subarray(offset)]);
 const decoded = await decodeScopedPng(input);
 assert.deepEqual(decoded.data, pixels);
 assert.ok(decoded.removedMetadata.includes('eXIf'));
 const roundtrip = await decodeScopedPng(await encodeScopedPng(decoded, {metadata: decoded.metadata}));
 assert.deepEqual(roundtrip.data, pixels);
 const corrupt = Buffer.from(input); corrupt[offset + 8] ^= 1;
 await assert.rejects(decodeScopedPng(corrupt), /CRC mismatch/);
}
const critical = Buffer.concat([png.subarray(0,33), chunk('ABCD', new Uint8Array()), png.subarray(33)]);
await assert.rejects(decodeScopedPng(critical), /not supported/);
const ancillary = Buffer.concat([png.subarray(0,33), chunk('aBCD', new Uint8Array()), png.subarray(33)]);
await assert.rejects(decodeScopedPng(ancillary), /not supported/);
console.log('PNG eXIf: before/after IDAT, byte-exact pixels, CRC, critical, and ancillary-chunk rejection passed');

const nativeFixture = Buffer.from(await readFile(new URL('./fixtures/rights-clear-smoke.png', import.meta.url)));
const nativeDecoded = await decodeScopedPng(nativeFixture);
const nativeWithoutPhys = await decodeScopedPng(withoutChunk(nativeFixture, 'pHYs'));
assert.equal(nativeDecoded.width, 1005);
assert.equal(nativeDecoded.height, 399);
assert.deepEqual(nativeDecoded.data, nativeWithoutPhys.data);
assert.ok(nativeDecoded.removedMetadata.includes('pHYs'));
assert.equal(nativeDecoded.metadataDisposition, 'pHYs-recognized-not-preserved');

const phys = chunk('pHYs', Uint8Array.of(0,0,0,9,0,0,0,9,1));
const pngWithPhys = Buffer.concat([png.subarray(0, 33), phys, png.subarray(33)]);
const decodedWithPhys = await decodeScopedPng(pngWithPhys);
assert.deepEqual(decodedWithPhys.data, pixels);
assert.ok(decodedWithPhys.removedMetadata.includes('pHYs'));
assert.equal(decodedWithPhys.metadataDisposition, 'pHYs-recognized-not-preserved');
assert.equal(chunks(await encodeScopedPng(decodedWithPhys, {metadata: decodedWithPhys.metadata})).some((entry) => entry.type === 'pHYs'), false);

const malformedPhys = chunk('pHYs', Uint8Array.of(0,0,0,9,0,0,0,9));
await assert.rejects(decodeScopedPng(Buffer.concat([png.subarray(0, 33), malformedPhys, png.subarray(33)])), /pHYs metadata is malformed/);
const invalidPhysUnit = chunk('pHYs', Uint8Array.of(0,0,0,9,0,0,0,9,2));
await assert.rejects(decodeScopedPng(Buffer.concat([png.subarray(0, 33), invalidPhysUnit, png.subarray(33)])), /pHYs metadata is malformed/);
await assert.rejects(decodeScopedPng(Buffer.concat([png.subarray(0, 33), phys, phys, png.subarray(33)])), /duplicate pHYs chunk/);
await assert.rejects(decodeScopedPng(Buffer.concat([png.subarray(0, png.length - 12), phys, png.subarray(png.length - 12)])), /pHYs must occur before IDAT/);
console.log('PNG pHYs: native RGB decode, RGBA equivalence, bounded validation, explicit discard, and chunk policy passed');
